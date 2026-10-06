'use strict';
/* N6-TL. Đính kèm tài liệu Word / Excel (ngoài ảnh, PDF) và đính kèm ngay khi lập phiếu nhập chi phí MỚI (chọn file trước, tự tải lên
 * khi lưu phiếu). Kiểm: nhận theo nội dung file, từ chối file có macro / giả đuôi, Word / Excel luôn tải về (không mở trong trình duyệt). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const ExcelJS = require('exceljs');
const { startServer, readStored, tmpDir } = require('./helpers');
const { SKIP, openPage, settle, dienBatBuoc } = require('./ui-helpers');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const up = (srv, owner, id, buf, name) => srv.call('POST', '/api/attachments?owner=' + owner + '&id=' + id, buf, { 'X-Ten-File': encodeURIComponent(name) });

async function xlsx() {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Bang ke').addRow(['Hàng', 'Tiền']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
async function docx(extra) {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  z.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>');
  if (extra) z.file(extra, 'x');
  return z.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
}
const ole = (stream) => Buffer.concat([Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]), Buffer.alloc(504), Buffer.from(stream, 'utf16le'), Buffer.alloc(64)]);

async function seed(srv) {
  await srv.ok('POST', '/api/projects', { ma: 'CT1', ten: 'Công trình 1' });
  await srv.ok('POST', '/api/suppliers', { ma: 'MINH', ten: 'Cửa hàng điện nước Minh' });
  const db = await srv.db();
  const hm = db.costItems.find((i) => i.ten === 'Vật tư VLXD');
  await srv.ok('POST', '/api/materials', { ma: 'DN', ten: 'Vật tư điện nước', dvt: 'lô', maHM: hm.ma }); // phiếu nhập: hạng mục theo vật tư
  return hm;
}

test('TL1 Word / Excel: nhận .docx .xlsx .doc .xls theo nội dung; từ chối file có macro, file giả đuôi; luôn tải về (Content-Disposition: attachment, nosniff)', async () => {
  const srv = await startServer({});
  try {
    const hm = await seed(srv);
    const r0 = await srv.ok('POST', '/api/cost-slips', { header: { ngay: '2026-08-17', maCT: 'CT1', maNCC: 'MINH', maHM: hm.ma }, lines: [{ dienGiai: 'HĐ bán lẻ', thanhTien: 7099000 }] });
    const pid = r0.phieuId;
    const cases = [
      [await xlsx(), 'bang ke.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', /\.xlsx$/],
      [await docx(), 'hop dong.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', /\.docx$/],
      [ole('WordDocument'), 'cu.doc', 'application/msword', /\.doc$/],
      [ole('Workbook'), 'cu.xls', 'application/vnd.ms-excel', /\.xls$/]
    ];
    for (const [buf, name, type, re] of cases) {
      const r = await up(srv, 'slips', pid, buf, name);
      assert.equal(r.status, 200, name + ' ' + r.body.toString());
      assert.equal(r.json.attachment.type, type, name);
      assert.match(r.json.attachment.file, re, name);
      const g = await srv.call('GET', '/api/attachments/' + r.json.attachment.id);
      assert.equal(g.status, 200);
      assert.ok(g.body.equals(buf));
      assert.match(g.headers['content-disposition'], /^attachment;/, name + ': Word / Excel luôn tải về');
      assert.equal(g.headers['x-content-type-options'], 'nosniff');
    }
    // ảnh vẫn xem trực tiếp
    const img = await up(srv, 'slips', pid, PNG, 'anh.png');
    assert.match((await srv.call('GET', '/api/attachments/' + img.json.attachment.id)).headers['content-disposition'], /^inline;/);
    // từ chối: Office có macro, ZIP bất kỳ, OLE lạ, chữ đổi đuôi .docx
    const bad = [
      [await docx('word/vbaProject.bin'), 'macro.docm'],
      [await docx('xl/vbaProject.bin'), 'macro.xlsx'],
      [await (async () => { const z = new JSZip(); z.file('a.txt', 'x'); return z.generateAsync({ type: 'nodebuffer' }); })(), 'nen.docx'],
      [ole('KhongBiet'), 'la.doc'],
      [Buffer.concat([ole('WordDocument'), Buffer.from('Macros', 'utf16le')]), 'macro.doc'],
      [Buffer.from('chỉ là chữ'), 'gia.docx']
    ];
    for (const [buf, name] of bad) assert.equal((await up(srv, 'slips', pid, buf, name)).status, 415, name);
    assert.equal(readStored(srv.dataDir).attachments.length, 5);
  } finally { await srv.stop(); }
});

test('TL2 phiếu nhập MỚI: chọn ảnh + Excel trước khi lưu (bỏ bớt một file), bấm Ghi phiếu → file được tải lên gắn vào phiếu vừa lưu; mở lại phiếu thấy đủ', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({});
  const dir = tmpDir('tl2');
  const fPng = path.join(dir, 'phieu giao hang.png'); fs.writeFileSync(fPng, PNG);
  const fXlsx = path.join(dir, 'bang ke.xlsx'); fs.writeFileSync(fXlsx, await xlsx());
  const fBo = path.join(dir, 'chon nham.png'); fs.writeFileSync(fBo, PNG);
  try {
    await seed(srv);
    const { browser, page, errors } = await openPage(srv, '#/cp-nhap');
    try {
      await page.waitForSelector('[data-att-pending-input]', { state: 'attached' });
      await page.locator('[data-row="0"][data-col=ct]').fill('CT1'); await page.locator('[data-row="0"][data-col=ct]').dispatchEvent('change');
      for (const [n, v] of [['maNCC', 'MINH']]) { const el = page.locator('#view [name=' + n + ']').first(); await el.fill(v); await el.press('Tab'); }
      await page.locator('[data-row="0"][data-col=maVT]').fill('DN'); await page.locator('[data-row="0"][data-col=maVT]').dispatchEvent('change');
      await page.locator('[data-row="0"][data-col=dienGiai]').click();
      await page.locator('[data-row="0"][data-col=dienGiai]').fill('HĐ điện nước Minh 17/8');
      await page.locator('[data-row="0"][data-col=thanhTien]').click();
      await page.locator('[data-row="0"][data-col=thanhTien]').fill('7.099.000');
      await page.locator('[data-row="0"][data-col=thanhTien]').press('Tab');
      await page.setInputFiles('[data-att-pending-input]', [fPng, fXlsx, fBo]);
      await page.waitForFunction(() => document.querySelectorAll('[data-att-pending] .att-item').length === 3);
      assert.match(await page.$eval('[data-att-pending]', (e) => e.innerText), /chờ lưu phiếu/);
      await page.click('[data-pending-del="2"]'); // bỏ file chọn nhầm
      await page.waitForFunction(() => document.querySelectorAll('[data-att-pending] .att-item').length === 2);
      await page.click('#view [data-act=save]');
      await page.waitForFunction(() => /Đã đính kèm 2 \/ 2 file/.test(document.querySelector('#toast-root').textContent), null, { timeout: 10000 });
      const st = readStored(srv.dataDir);
      assert.equal(st.costs.length, 1);
      const pid = st.costs[0].phieuId;
      const att = st.attachments.filter((a) => a.owner === 'slips' && a.ownerId === pid).map((a) => a.name).sort();
      assert.deepEqual(att, ['bang ke.xlsx', 'phieu giao hang.png']);
      // phiếu mới tiếp theo: danh sách chờ đã trống
      await page.waitForSelector('[data-att-pending]');
      assert.equal(await page.locator('[data-att-pending] .att-item').count(), 0);
      // mở lại phiếu: thấy 2 chứng từ (Excel hiện nhãn XLS)
      await page.evaluate((id) => { location.hash = '#/cp-nhap?phieu=' + id; }, pid);
      await page.waitForFunction(() => document.querySelectorAll('[data-att-owner] .att-item').length === 2);
      assert.match(await page.$eval('[data-att-owner]', (e) => e.innerText), /XLS/);
      await settle(page);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  } finally { await srv.stop(); }
});

test('TL3 Ghi thu / chi (dòng mới): chọn ảnh trước khi ghi → Ghi sổ → ảnh gắn vào dòng vừa ghi; "Ghi sổ và ghi tiếp" làm trống danh sách chờ', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({});
  const dir = tmpDir('tl3');
  const f1 = path.join(dir, 'hoa don 1.png'); fs.writeFileSync(f1, PNG);
  const f2 = path.join(dir, 'bang ke.xlsx'); fs.writeFileSync(f2, await xlsx());
  await srv.ok('POST', '/api/projects', { ma: 'CT1', ten: 'Công trình 1' });
  await srv.ok('POST', '/api/suppliers', { ma: 'NCC1', ten: 'NCC 1' });
  try {
    const { browser, page, errors } = await openPage(srv, '#/so-thu-chi');
    try {
      await page.keyboard.press('F3');
      await page.waitForSelector('#entry-page [data-att-pending-input]', { state: 'attached' });
      await page.click('#entry-page [name=noiDung]');
      await page.fill('#entry-page [name=noiDung]', 'Mua vật tư lẻ');
      await page.fill('#entry-page [name=chi]', '250000');
      await dienBatBuoc(page, 'NCC1', 'CT1');
      await page.setInputFiles('#entry-page [data-att-pending-input]', [f1, f2]);
      await page.waitForFunction(() => document.querySelectorAll('#entry-page [data-att-pending] .att-item').length === 2);
      await page.click('#entry-page [data-act=save-next]');
      await page.waitForFunction(() => /Đã đính kèm 2 \/ 2 file/.test(document.querySelector('#toast-root').textContent), null, { timeout: 10000 });
      await page.waitForFunction(() => document.querySelectorAll('#entry-page [data-att-pending] .att-item').length === 0);
      const st = readStored(srv.dataDir);
      const e = st.entries.find((x) => x.noiDung === 'Mua vật tư lẻ');
      assert.ok(e);
      assert.deepEqual(st.attachments.filter((a) => a.owner === 'entries' && a.ownerId === e.id).map((a) => a.name).sort(), ['bang ke.xlsx', 'hoa don 1.png']);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  } finally { await srv.stop(); }
});
