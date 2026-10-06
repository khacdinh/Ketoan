'use strict';
/* Loại chi phí (Vật tư / Nhân công / Dịch vụ-Phí) đặt ở HẠNG MỤC (lược đồ 8), không còn ở vật tư:
 * nâng lược đồ điền sẵn theo dữ liệu cũ; dòng chi phí luôn theo loại của hạng mục; đổi loại thì dòng cũ đi theo (trừ tháng khóa); Excel giữ được. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { KT, startServer, readStored } = require('./helpers');
const X = require('./excel-helpers');
const { SKIP, openPage, settle } = require('./ui-helpers');

function seed() {
  let id = 1;
  const db = {
    schema: 7, settings: {}, vouchers: {}, trash: [], locks: [], attachments: [], cashCounts: [], ignoredWarnings: {}, extPayments: [], soDuDauKy: [],
    projects: [{ id: id++, ma: 'CT1', ten: 'Công trình 1', nganSach: 0, trangThai: 'Đang thực hiện', ghiChu: '' }],
    suppliers: [{ id: id++, ma: 'A', ten: 'NCC A', loai: '', sdt: '', diaChi: '', ghiChu: '' }],
    costGroups: [{ id: id++, ma: 'G1', ten: '1. Chi phí', ghiChu: '' }],
    costItems: [
      { id: id++, ma: 'HM1', ten: 'Sắt thép', maNhom: 'G1', ghiChu: '' },
      { id: id++, ma: 'HM2', ten: 'Hồ sơ pháp lý', maNhom: 'G1', ghiChu: '' },
      { id: id++, ma: 'HM3', ten: 'Nhân công thợ nề', maNhom: 'G1', ghiChu: '' },
      { id: id++, ma: 'HM4', ten: 'Khác', maNhom: 'G1', ghiChu: '' }
    ],
    materials: [
      { id: id++, ma: 'ST', ten: 'Thép', dvt: 'kg', maHM: 'HM1', loaiCP: '', ghiChu: '' },
      { id: id++, ma: 'HS', ten: 'Phí hồ sơ', dvt: 'lần', maHM: 'HM2', loaiCP: '', ghiChu: '' }
    ],
    houses: [], costs: [], entries: []
  };
  const cost = (o) => db.costs.push(Object.assign({ id: id++, seq: db.costs.length + 1, phieuId: 900, ngay: '2026-03-05', maCT: 'CT1', maNha: '', maNCC: 'A', soPhieu: '',
    dienGiai: '', soLuong: null, donGia: null, ghiChu: '' }, o));
  cost({ maHM: 'HM1', maVT: 'ST', loaiCP: 'Vật tư', thanhTien: 9000000 });
  cost({ maHM: 'HM1', maVT: 'ST', loaiCP: 'Nhân công', thanhTien: 1000000 });            // dòng cũ khác loại: giữ nguyên khi nâng lược đồ
  cost({ maHM: 'HM2', maVT: 'HS', loaiCP: 'Dịch vụ-Phí', thanhTien: 2000000 });
  cost({ maHM: 'HM2', maVT: 'HS', loaiCP: 'Dịch vụ-Phí', thanhTien: 500000, ngay: '2026-01-10' }); // tháng 01 sẽ khóa
  db.nextId = id + 5;
  return db;
}

test('LC1 nâng lược đồ 7 → 8: sao lưu trước; điền Loại chi phí cho hạng mục theo loại chiếm nhiều tiền nhất (chưa có dòng: “Nhân công…” → Nhân công, còn lại tự xác định); dòng chi phí không đổi', async () => {
  const { DB_VERSION } = require('../lib/db');
  const srv0 = await startServer({ seed: seed() });
  await srv0.stop();
  const dir = srv0.dataDir;
  const c = new DatabaseSync(path.join(dir, 'ketoan.db'));
  c.exec('ALTER TABLE "costItems" DROP COLUMN "loaiCP"');
  c.exec('PRAGMA user_version = 7');
  c.close();
  fs.readdirSync(path.join(dir, 'backups')).forEach((f) => fs.unlinkSync(path.join(dir, 'backups', f)));
  const v7 = readStored(dir);
  assert.equal(v7.schema, 7);
  const srv = await startServer({ data: dir });
  try {
    const db = readStored(dir);
    assert.equal(db.schema, DB_VERSION);
    const loai = Object.fromEntries(db.costItems.map((i) => [i.ma, i.loaiCP || '']));
    assert.deepEqual(loai, { HM1: 'Vật tư', HM2: 'Dịch vụ-Phí', HM3: 'Nhân công', HM4: '' });
    assert.deepEqual(db.costs, v7.costs, 'không đổi dòng chi phí nào');
    assert.equal(fs.readdirSync(path.join(dir, 'backups')).filter((f) => new RegExp('truoc-nang-cap-luoc-do-' + DB_VERSION).test(f)).length, 1);
    // chạy lại lần nữa: không nâng, không điền lại (HM4 vẫn tự xác định)
    await srv.stop();
    const srv2 = await startServer({ data: dir });
    await srv2.stop();
    assert.equal(readStored(dir).costItems.find((i) => i.ma === 'HM4').loaiCP || '', '');
  } finally { await srv.stop(); }
});

test('LC2 dòng chi phí theo Loại chi phí của hạng mục: phiếu mới không nhận loại khác; đổi loại hạng mục → dòng cũ đổi theo trừ tháng khóa; gửi loại sai bị từ chối; không gửi thì giữ loại; vật tư chuyển hạng mục thì dòng lấy loại của hạng mục mới', async () => {
  const s = seed();
  s.costItems.forEach((i) => { i.loaiCP = { HM1: 'Vật tư', HM2: 'Dịch vụ-Phí' }[i.ma] || ''; });
  s.locks = [{ id: 990, thang: '2026-01', ngayKhoa: '2026-02-01T00:00:00.000Z' }];
  const srv = await startServer({ seed: s });
  try {
    await srv.ok('POST', '/api/cost-slips', { ngay: '2026-03-20', maNCC: 'A', lines: [{ maCT: 'CT1', maVT: 'HS', thanhTien: 300000, loaiCP: 'Vật tư' }] });
    let db = await srv.db();
    assert.equal(db.costs.find((c) => c.ngay === '2026-03-20').loaiCP, 'Dịch vụ-Phí', 'theo hạng mục, không theo loại gửi lên');
    const hm2 = db.costItems.find((i) => i.ma === 'HM2');
    const r = await srv.ok('PUT', '/api/cost-items/' + hm2.id, { ma: 'HM2', ten: hm2.ten, maNhom: 'G1', ghiChu: '', loaiCP: 'Nhân công' });
    assert.equal(r.theoLoai, 2, 'hai dòng tháng 03 đổi, dòng tháng 01 đã khóa giữ nguyên');
    db = await srv.db();
    assert.deepEqual(db.costs.filter((c) => c.maHM === 'HM2').map((c) => c.ngay + ':' + c.loaiCP).sort(), ['2026-01-10:Dịch vụ-Phí', '2026-03-05:Nhân công', '2026-03-20:Nhân công']);
    const bad = await srv.call('PUT', '/api/cost-items/' + hm2.id, { ma: 'HM2', ten: hm2.ten, maNhom: 'G1', loaiCP: 'Máy móc' });
    assert.equal(bad.status, 400);
    await srv.ok('PUT', '/api/cost-items/' + hm2.id, { ma: 'HM2', ten: hm2.ten, maNhom: 'G1', ghiChu: 'đổi ghi chú' }); // API cũ không gửi loại
    assert.equal((await srv.db()).costItems.find((i) => i.ma === 'HM2').loaiCP, 'Nhân công');
    // vật tư HS chuyển sang HM1 (Vật tư): dòng mở khóa chuyển hạng mục và lấy loại Vật tư
    const hs = db.materials.find((m) => m.ma === 'HS');
    await srv.ok('PUT', '/api/materials/' + hs.id, { ma: 'HS', ten: hs.ten, dvt: hs.dvt, maHM: 'HM1', ghiChu: '' });
    db = await srv.db();
    assert.deepEqual(db.costs.filter((c) => c.maVT === 'HS' && c.ngay >= '2026-03-01').map((c) => c.maHM + ':' + c.loaiCP), ['HM1:Vật tư', 'HM1:Vật tư']);
    // Excel: DM_HANGMUC có cột Loại chi phí; nhập vào máy mới giữ được loại
    const buf = (await srv.call('GET', '/api/export/costs')).body;
    const wb = await X.loadWb(buf);
    const ws = wb.getWorksheet('DM_HANGMUC');
    assert.equal(X.cellVal(ws.getRow(1).getCell(6)), 'Loại chi phí');
    const srv2 = await startServer({});
    try {
      const imp = await srv2.call('POST', '/api/import?mode=replace', buf);
      assert.equal(imp.status, 200, imp.body.toString().slice(0, 300));
      const d2 = readStored(srv2.dataDir);
      assert.deepEqual(Object.fromEntries(d2.costItems.filter((i) => /^HM\d$/.test(i.ma)).map((i) => [i.ma, i.loaiCP || ''])), { HM1: 'Vật tư', HM2: 'Nhân công', HM3: 'Nhân công', HM4: '' }); // hạng mục mới nhập mà file để trống: điền theo dữ liệu (HM3 theo tên)
    } finally { await srv2.stop(); }
  } finally { await srv.stop(); }
});

test('LC3 giao diện: hộp sửa vật tư không còn Loại CP; hộp sửa hạng mục có Loại chi phí; Sổ chi phí không cho đổi loại riêng một dòng khi hạng mục đã đặt loại', { skip: SKIP, timeout: 120000 }, async () => {
  const s = seed();
  s.costItems.forEach((i) => { i.loaiCP = { HM1: 'Vật tư', HM2: 'Dịch vụ-Phí' }[i.ma] || ''; });
  const srv = await startServer({ seed: s });
  const { browser, page, errors } = await openPage(srv, '#/cp-danh-muc');
  try {
    await page.waitForSelector('#dm-table tr[data-id]');
    await page.locator('#dm-table tr[data-id]').first().locator('[data-act=edit]').click();
    await page.waitForSelector('.modal [name=hmTen]');
    assert.equal(await page.locator('.modal [name=loaiCP]').count(), 0, 'vật tư không còn Loại CP');
    await page.click('.modal [data-act=cancel]'); await settle(page);
    await page.click('#dm-tree [data-tree="g:G1"]'); await settle(page);
    await page.click('#dm-tree [data-tree="h:HM2"]'); await settle(page);
    assert.match(await page.textContent('#dm-head'), /Loại chi phí: Dịch vụ-Phí/);
    await page.click('#dm-tree [data-act=tree-edit]');
    await page.waitForSelector('.modal select[name=loaiCP]');
    assert.equal(await page.inputValue('.modal select[name=loaiCP]'), 'Dịch vụ-Phí');
    await page.selectOption('.modal select[name=loaiCP]', 'Nhân công');
    await page.click('.modal [data-act=save]');
    await page.waitForSelector('.modal', { state: 'detached' }); await settle(page);
    assert.deepEqual(readStored(srv.dataDir).costs.filter((c) => c.maHM === 'HM2').map((c) => c.loaiCP), ['Nhân công', 'Nhân công']);
    // Sổ chi phí: bấm đúp nhãn loại → báo theo hạng mục, không mở ô chọn
    await page.evaluate(() => { location.hash = '#/cp-so'; }); await settle(page);
    await page.locator('#cl-body [data-edit=loaiCP]').first().dblclick();
    await page.waitForFunction(() => /theo hạng mục/.test(document.querySelector('#toast-root').textContent), null, { timeout: 4000 });
    assert.equal(await page.locator('#cl-body select').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});
