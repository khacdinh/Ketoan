'use strict';
/* N4. Kiểm tra bất thường + màn hình "Cần xử lý". */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { KT, startServer, readJsonFile, makeBigDb } = require('./helpers');
const { SKIP, openPage, settle } = require('./ui-helpers');

const V2 = path.join(__dirname, 'fixtures', 'ketoan-v2-hien-tai.json');
const TODAY = '2026-09-30';
const run = (db, o) => KT.anomalies(db, Object.assign({ today: TODAY }, o || {}));
const clone = (x) => JSON.parse(JSON.stringify(x));

test('N4.1 dữ liệu thật: phát hiện đúng các chỗ đáng ngờ đã biết (giá bê tông 60.000, mã XX-CHUAXACDINH, vật tư chưa phân loại), không báo nhầm trùng / ngày / số tiền', () => {
  const r = run(readJsonFile(V2));
  assert.equal(r.counts.trung, 0);
  assert.equal(r.counts.ngay, 0, 'dữ liệu nhập theo thứ tự ngày: không báo ngày');
  assert.equal(r.counts.tien, 0);
  assert.equal(r.counts.thieu, 0);
  assert.equal(r.counts.nhap, 0);
  const gia = r.items.filter((i) => i.loai === 'gia');
  assert.ok(gia.some((i) => /BT-M250R7 .* giá 60\.000 — thấp hơn 97%/.test(i.tieuDe)), 'bê tông 60.000 lệch 97% so với giá thường mua 1.730.000');
  assert.ok(!gia.some((i) => /^XX-/.test(i.tieuDe)), 'mã chung XX-... không so giá');
  assert.ok(gia.every((i) => !/giá 700\.000 — thấp hơn 30%/.test(i.tieuDe)), 'lệch đúng bằng ngưỡng 30% thì không báo');
  assert.ok(r.items.some((i) => i.loai === 'vt' && /XX-CHUAXACDINH/.test(i.tieuDe)));
  assert.ok(r.items.some((i) => i.loai === 'vt' && /NỀ-CONGNE chưa phân loại/.test(i.tieuDe)));
  assert.equal(r.open, r.items.length);
});

test('N4.2 từng loại (a)–(g) được phát hiện trên dữ liệu có lỗi cài sẵn; mỗi cảnh báo có đích để mở đúng bản ghi', () => {
  const db = clone(readJsonFile(V2));
  const c = db.costs.find((x) => x.maVT && !/^XX/.test(x.maVT));
  const e = db.entries.find((x) => x.chi > 0 && x.maNCC);
  let id = 900000;
  // (a) trùng: nhân đôi 1 dòng chi phí (phiếu khác) và 1 dòng sổ thu chi
  db.costs.push(Object.assign({}, c, { id: ++id, phieuId: 777777, seq: 9999 }));
  db.entries.push(Object.assign({}, e, { id: ++id, seq: 9999 }));
  // (c) ngày: tương lai và gõ nhầm năm giữa các dòng
  const e2 = db.entries[20];
  e2.ngay = '2062-' + e2.ngay.slice(5);
  const c2 = db.costs[40];
  c2.ngay = '2025' + c2.ngay.slice(4);
  // (e) thiếu hạng mục, NCC lạ
  db.costs[5].maHM = '';
  db.entries[3].maNCC = 'NCC_KHONG_CO';
  // (f) nháp để lâu
  db.entries.push({ id: ++id, seq: 10000, ngay: '2026-09-01', noiDung: 'nháp cũ', chi: 10, thu: 0, trangThai: 'nhap', createdAt: '2026-09-01T00:00:00.000Z' });
  db.costs.push(Object.assign({}, c, { id: ++id, phieuId: 888888, seq: 10001, trangThai: 'nhap', createdAt: '2026-09-10T00:00:00.000Z', ngay: '2026-09-10' }));
  db.entries.push({ id: ++id, seq: 10002, ngay: '2026-09-29', noiDung: 'nháp mới', chi: 10, thu: 0, trangThai: 'nhap', createdAt: '2026-09-29T00:00:00.000Z' });
  // (g) số tiền 0 và âm
  db.entries.push({ id: ++id, seq: 10003, ngay: '2026-09-20', noiDung: 'không tiền', chi: 0, thu: 0 });
  db.costs.push(Object.assign({}, c, { id: ++id, phieuId: 999999, seq: 10004, soLuong: -1, thanhTien: -c.donGia, dienGiai: 'trả hàng' }));
  const r = run(db);
  const of = (loai) => r.items.filter((i) => i.loai === loai);
  assert.equal(of('trung').length, 2);
  const tc = of('trung').find((i) => i.target.kind === 'costs');
  assert.deepEqual(tc.target.ids, [c.id, 900001]);
  assert.match(tc.chiTiet, /ở 2 phiếu khác nhau/);
  assert.equal(of('ngay').length, 2);
  assert.ok(of('ngay').some((i) => /ở tương lai/.test(i.tieuDe) && i.target.id === e2.id));
  assert.ok(of('ngay').some((i) => /khác xa các dòng nhập liền trước/.test(i.tieuDe) && i.target.id === c2.id));
  assert.ok(of('thieu').some((i) => /chưa gán hạng mục/.test(i.tieuDe) && i.target.id === db.costs[5].id));
  assert.ok(of('thieu').some((i) => /NCC "NCC_KHONG_CO" chưa có trong danh mục/.test(i.tieuDe)));
  assert.equal(of('nhap').length, 2, 'nháp từ 01/09 và phiếu nháp 10/09; nháp mới 29/09 chưa tới hạn 7 ngày');
  assert.ok(of('nhap').some((i) => i.target.kind === 'slip' && i.target.phieuId === 888888));
  assert.equal(of('tien').length, 2);
  // ngưỡng giá chỉnh được
  const strict = KT.anomalies(Object.assign({}, db, { settings: Object.assign({}, db.settings, { nguongLechGia: 500 }) }), { today: TODAY });
  assert.ok(strict.counts.gia < r.counts.gia);
  assert.equal(KT.anomalies(Object.assign({}, db, { settings: Object.assign({}, db.settings, { soNgayNhapTon: 40 }) }), { today: TODAY }).counts.nhap, 0);
  // khóa (key) ổn định: chạy lại cho cùng kết quả
  assert.deepEqual(run(db).items.map((i) => i.key), r.items.map((i) => i.key));
});

test('N4.3 Bỏ qua cảnh báo: lưu, ghi nhật ký, không đếm nữa; Theo dõi lại; mã cảnh báo lạ bị từ chối', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const db = await srv.db();
    const r0 = KT.anomalies(db, { today: TODAY });
    const it = r0.items.find((i) => i.loai === 'gia');
    await srv.ok('POST', '/api/warnings/ignore', { key: it.key, label: it.tieuDe, note: 'giá bơm bê tông, đúng' });
    const db1 = await srv.db();
    assert.ok(db1.ignoredWarnings[it.key]);
    const r1 = KT.anomalies(db1, { today: TODAY });
    assert.equal(r1.open, r0.open - 1);
    assert.equal(r1.items.find((i) => i.key === it.key).ignored, true);
    const a = (await srv.ok('GET', '/api/audit?action=bo-qua-canh-bao')).items[0];
    assert.match(a.label, /BT-M|ST-|NỀ|DNUOC/); assert.match(a.note, /giá bơm bê tông/);
    await srv.ok('POST', '/api/warnings/unignore', { key: it.key });
    assert.equal(KT.anomalies(await srv.db(), { today: TODAY }).open, r0.open);
    for (const key of ['', '__proto__', 'constructor:x', 'abc']) assert.equal((await srv.call('POST', '/api/warnings/ignore', { key })).status, 400, key);
    // ngưỡng lưu trong cài đặt
    await srv.ok('PUT', '/api/settings', { nguongLechGia: 50, soNgayNhapTon: 10 });
    const s = (await srv.db()).settings;
    assert.equal(s.nguongLechGia, 50); assert.equal(s.soNgayNhapTon, 10);
    assert.equal((await srv.call('PUT', '/api/settings', { nguongLechGia: 0 })).status, 400);
  } finally { await srv.stop(); }
});

test('N4.4 hiệu năng: 20.000 dòng chi phí + 5.000 dòng sổ rà soát dưới 1,5 giây', () => {
  const db = makeBigDb(20000, 5000);
  const t0 = Date.now();
  const r = KT.anomalies(db, { today: TODAY });
  const ms = Date.now() - t0;
  assert.ok(ms < 1500, 'rà soát mất ' + ms + ' ms');
  assert.ok(r.items.length > 0);
});

test('N4.5 giao diện: số việc trên menu và Tổng quan, thẻ Cần xử lý gom theo loại, Mở để sửa tới đúng dòng, Bỏ qua', { skip: SKIP, timeout: 120000 }, async () => {
  const srv = await startServer({ seed: V2 });
  const { browser, page, errors } = await openPage(srv, '#/tong-quan');
  try {
    const n0 = KT.anomalies(await srv.db()).open;
    await page.waitForSelector('#nav-badge:not([hidden])');
    assert.equal(await page.$eval('#nav-badge', (e) => e.textContent), String(n0));
    await page.waitForSelector('#dash-anom a');
    assert.match(await page.$eval('#dash-anom', (e) => e.innerText), new RegExp(n0 + ' việc cần xử lý'));
    await page.click('#dash-anom a[href*="can-xu-ly"]');
    await page.waitForSelector('li[data-key^="gia:"]');
    // mở để sửa: form sửa dòng chi phí đúng mã vật tư
    const li = page.locator('li[data-key^="gia:"]').first();
    const title = await li.locator('.font-medium').innerText();
    await li.locator('[data-act=mo]').click();
    await page.waitForSelector('.modal');
    const vt = title.split(' ')[0];
    assert.equal(await page.inputValue('.modal input[name=maVT]'), vt);
    await page.keyboard.press('Escape');
    // bỏ qua
    await page.locator('li[data-key^="gia:"]').first().locator('[data-act=bo-qua]').click();
    await page.fill('#bq-note', 'đúng giá');
    await page.click('.modal [data-act=yes]');
    await page.waitForFunction((n) => document.querySelector('#nav-badge').textContent === String(n - 1), n0, { timeout: 5000 });
    await settle(page);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});
