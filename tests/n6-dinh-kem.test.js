'use strict';
/* N6. Đính kèm chứng từ: định dạng, dung lượng, tên an toàn (không path traversal, không ghi đè), xem, xóa mềm cùng bản ghi chủ,
 * sao lưu đầy đủ (.zip) và khôi phục. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { startServer, orphanErrors } = require('./helpers');
const { SKIP, openPage, settle } = require('./ui-helpers');

const V2 = path.join(__dirname, 'fixtures', 'ketoan-v2-hien-tai.json');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const up = (srv, owner, id, buf, name) => srv.call('POST', '/api/attachments?owner=' + owner + '&id=' + id, buf, name === undefined ? {} : { 'X-Ten-File': encodeURIComponent(name) });

test('N6.1 tải lên: chỉ nhận JPG/PNG/WEBP/PDF theo nội dung, tối đa 10 MB, tên file trên đĩa do phần mềm đặt (chống path traversal), không ghi đè', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const db = await srv.db();
    const e = db.entries[0];
    // tên độc hại chỉ dùng để hiển thị
    let r = await up(srv, 'entries', e.id, PNG, '../../../../etc/passwd/..\\..\\hóa đơn <script>.png');
    assert.equal(r.status, 200, r.body.toString());
    const a = r.json.attachment;
    assert.match(a.file, /^attachments\/\d{4}-\d{2}\/\d+-[0-9a-f]{8}\.png$/);
    assert.ok(!/[\\/<>]/.test(a.name) && /hóa đơn/.test(a.name), a.name);
    assert.ok(fs.existsSync(path.join(srv.dataDir, a.file)));
    assert.equal(a.type, 'image/png');
    // nội dung đúng
    const g = await srv.call('GET', '/api/attachments/' + a.id);
    assert.equal(g.status, 200); assert.ok(g.body.equals(PNG)); assert.equal(g.headers['content-type'], 'image/png');
    assert.equal(g.headers['x-content-type-options'], 'nosniff');
    assert.match(g.headers['content-security-policy'], /sandbox/);
    // PDF được, HTML giả đuôi .png thì không, file rỗng không, quá 10 MB không
    assert.equal((await up(srv, 'costs', db.costs[0].id, PDF, 'hoa don.pdf')).status, 200);
    assert.equal((await up(srv, 'entries', e.id, Buffer.from('<html><script>alert(1)</script></html>'), 'anh.png')).status, 415);
    assert.equal((await up(srv, 'entries', e.id, Buffer.from('MZ\x90\x00'), 'x.exe')).status, 415);
    assert.equal((await up(srv, 'entries', e.id, Buffer.alloc(0), 'a.png')).status, 400);
    const big = Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]);
    assert.equal((await up(srv, 'entries', e.id, big, 'lon.png')).status, 413);
    // chỗ gắn sai / không tồn tại
    assert.equal((await up(srv, 'khac', e.id, PNG, 'a.png')).status, 400);
    assert.equal((await up(srv, 'entries', 99999999, PNG, 'a.png')).status, 404);
    assert.equal((await srv.call('GET', '/api/attachments/..%2F..%2Fketoan.json')).status, 404);
    // tải hai lần cùng tên: hai file khác nhau, không ghi đè
    const r1 = (await up(srv, 'entries', e.id, PNG, 'trung.png')).json.attachment;
    const r2 = (await up(srv, 'entries', e.id, PNG, 'trung.png')).json.attachment;
    assert.notEqual(r1.file, r2.file);
    // nhật ký
    assert.ok((await srv.ok('GET', '/api/audit?action=dinh-kem')).total >= 4);
    // chỉ các file hợp lệ nằm trong thư mục chứng từ
    const all = [];
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((x) => (x.isDirectory() ? walk(path.join(d, x.name)) : all.push(x.name)));
    walk(path.join(srv.dataDir, 'attachments'));
    assert.equal(all.length, 4);
  } finally { await srv.stop(); }
});

test('N6.2 xóa mềm: xóa chứng từ hoặc xóa bản ghi chủ → vào thùng rác, khôi phục trả lại; xóa vĩnh viễn chuyển file sang _da-xoa; sửa phiếu không làm chứng từ mồ côi', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const db = await srv.db();
    const e = db.entries[1];
    const a1 = (await up(srv, 'entries', e.id, PNG, 'a1.png')).json.attachment;
    // xóa riêng chứng từ
    await srv.ok('DELETE', '/api/attachments/' + a1.id);
    assert.equal((await srv.db()).attachments.length, 0);
    let t = (await srv.ok('GET', '/api/trash')).items[0];
    assert.equal(t.kind, 'attachments');
    await srv.ok('POST', '/api/trash/' + t.id + '/restore');
    assert.equal((await srv.db()).attachments.length, 1);
    // xóa bản ghi chủ → chứng từ đi theo
    await srv.ok('DELETE', '/api/entries/' + e.id);
    assert.equal((await srv.db()).attachments.length, 0);
    assert.equal((await srv.call('GET', '/api/attachments/' + a1.id)).status, 404, 'chứng từ của dòng đã xóa không xem được');
    t = (await srv.ok('GET', '/api/trash')).items[0];
    await srv.ok('POST', '/api/trash/' + t.id + '/restore');
    assert.equal((await srv.db()).attachments[0].id, a1.id);
    // xóa vĩnh viễn: file chuyển sang _da-xoa
    await srv.ok('DELETE', '/api/entries/' + e.id);
    t = (await srv.ok('GET', '/api/trash')).items[0];
    await srv.ok('DELETE', '/api/trash/' + t.id);
    assert.ok(!fs.existsSync(path.join(srv.dataDir, a1.file)));
    assert.ok(fs.existsSync(path.join(srv.dataDir, 'attachments', '_da-xoa', path.basename(a1.file))));
    // phiếu nhập: chứng từ gắn ở dòng chuyển lên cả phiếu khi phiếu được lưu lại (dòng tạo mới)
    const c0 = db.costs.find((c) => db.costs.filter((x) => x.phieuId === c.phieuId).length === 1);
    const a2 = (await up(srv, 'costs', c0.id, PDF, 'hd.pdf')).json.attachment;
    const a3 = (await up(srv, 'slips', c0.phieuId, PNG, 'phieu.png')).json.attachment;
    await srv.ok('PUT', '/api/cost-slips/' + c0.phieuId, { header: { ngay: c0.ngay, maCT: c0.maCT, maNCC: c0.maNCC, maHM: c0.maHM }, lines: [{ dienGiai: 'x', soLuong: 1, donGia: 5 }] });
    let d = await srv.db();
    assert.equal(d.attachments.find((x) => x.id === a2.id).owner, 'slips');
    // xóa phiếu → cả hai chứng từ vào thùng rác cùng phiếu
    await srv.ok('DELETE', '/api/cost-slips/' + c0.phieuId);
    d = await srv.db();
    assert.ok(!d.attachments.some((x) => x.id === a2.id || x.id === a3.id));
    t = (await srv.ok('GET', '/api/trash')).items[0];
    await srv.ok('POST', '/api/trash/' + t.id + '/restore');
    d = await srv.db();
    assert.equal(d.attachments.filter((x) => x.id === a2.id || x.id === a3.id).length, 2);
    assert.deepEqual(orphanErrors(d), []);
  } finally { await srv.stop(); }
});

test('N6.3 sao lưu đầy đủ (.zip) có dữ liệu + chứng từ + nhật ký; khôi phục vào máy mới chép lại chứng từ, file lạ trong zip bị bỏ qua', async () => {
  const src = await startServer({ seed: V2 });
  let zipBuf;
  let meta;
  try {
    const db = await src.db();
    meta = (await up(src, 'entries', db.entries[2].id, PNG, 'chung tu.png')).json.attachment;
    zipBuf = (await src.call('GET', '/api/backup-zip')).body;
  } finally { await src.stop(); }
  const zip = await JSZip.loadAsync(zipBuf);
  assert.ok(zip.file('ketoan.json')); assert.ok(zip.file('nhat-ky.jsonl')); assert.ok(zip.file(meta.file));
  // cài thêm file nguy hiểm vào zip
  zip.file('../../thoat-ra.png', PNG);
  zip.file('attachments/2026-09/khong-dung-dang.png', PNG);
  zip.file('attachments/2026-09/1-abcdef12.png', Buffer.from('<html></html>'));
  const evil = await zip.generateAsync({ type: 'nodebuffer' });
  const dst = await startServer({});
  try {
    const r = await dst.ok('POST', '/api/restore-zip', evil);
    assert.equal(r.copied, 1);
    assert.ok(r.db.attachments.some((a) => a.id === meta.id));
    const g = await dst.call('GET', '/api/attachments/' + meta.id);
    assert.equal(g.status, 200); assert.ok(g.body.equals(PNG));
    assert.ok(!fs.existsSync(path.join(dst.dataDir, '..', 'thoat-ra.png')));
    assert.ok(!fs.existsSync(path.join(dst.dataDir, 'attachments', '2026-09', 'khong-dung-dang.png')));
    assert.ok(!fs.existsSync(path.join(dst.dataDir, 'attachments', '2026-09', '1-abcdef12.png')));
    assert.equal((await dst.ok('GET', '/api/audit?action=khoi-phuc-sao-luu')).total, 1);
    assert.equal((await dst.call('POST', '/api/restore-zip', Buffer.from('khong phai zip'))).status, 400);
  } finally { await dst.stop(); }
});

test('N6.4 giao diện: đính kèm ảnh trong form sửa dòng sổ, kẹp giấy hiện trong sổ, xem ảnh', { skip: SKIP, timeout: 120000 }, async () => {
  const srv = await startServer({ seed: V2 });
  const { browser, page, errors } = await openPage(srv, '#/so-thu-chi');
  try {
    const db = await srv.db();
    const e = db.entries[db.entries.length - 1];
    await page.waitForSelector('#so-body tr[data-id="' + e.id + '"]');
    await page.locator('#so-body tr[data-id="' + e.id + '"] [data-act=edit]').click();
    await page.waitForSelector('[data-att-input]', { state: 'attached' });
    await page.setInputFiles('[data-att-input]', { name: 'hoa-don.png', mimeType: 'image/png', buffer: PNG });
    await page.waitForSelector('.att-item');
    assert.match(await page.$eval('.att-list', (x) => x.innerText), /hoa-don\.png/);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#so-body tr[data-id="' + e.id + '"] .clip');
    await page.click('#so-body tr[data-id="' + e.id + '"] .clip');
    await page.waitForSelector('.modal .att-item');
    await page.click('.modal .att-name');
    await page.waitForSelector('.modal img[src^="/api/attachments/"]');
    await settle(page);
    const ok = await page.$eval('.modal img[src^="/api/attachments/"]', (i) => i.complete && i.naturalWidth === 1);
    assert.ok(ok, 'ảnh hiện được');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});
