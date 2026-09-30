'use strict';
/* N5. Đối chiếu tồn quỹ (kiểm kê quỹ): chênh lệch so với tồn quỹ theo sổ, lịch sử, biên bản in / Excel, đưa vào "Cần xử lý". */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { KT, startServer } = require('./helpers');
const { SKIP, openPage, settle } = require('./ui-helpers');
const X = require('./excel-helpers');

const V2 = path.join(__dirname, 'fixtures', 'ketoan-v2-hien-tai.json');

test('N5.1 lưu kiểm quỹ: tồn quỹ theo sổ đến hết ngày (bỏ dòng nháp), chênh lệch, bảng kê mệnh giá, nhật ký, Cần xử lý', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    let db = await srv.db();
    const ngay = '2026-09-15';
    const so = db.entries.filter((e) => e.ngay <= ngay).reduce((t, e) => t + (e.thu || 0) - (e.chi || 0), 0);
    assert.equal(KT.cashBalanceAt(db, ngay), so);
    // dòng nháp không làm đổi tồn quỹ theo sổ
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-10', noiDung: 'nháp', chi: 999000, trangThai: 'nhap' });
    // khớp
    let r = await srv.ok('POST', '/api/cash-counts', { ngay, thucTe: so, nguoiKiem: 'Thúy' });
    assert.equal(r.tonSo, so); assert.equal(r.chenhLech, 0);
    // thiếu, kèm bảng kê mệnh giá
    const menhGia = { 500000: 1, 200000: 2, 50000: 3 }; // 1.050.000
    r = await srv.ok('POST', '/api/cash-counts', { ngay: '2026-09-30', menhGia, ghiChu: 'chưa rõ' });
    db = r.db;
    const tonCuoi = KT.cashBalanceAt(db, '2026-09-30');
    assert.equal(tonCuoi, 943000);
    assert.equal(r.chenhLech, 1050000 - 943000);
    const rec = db.cashCounts.find((k) => k.id === r.id);
    assert.equal(rec.thucTe, 1050000); assert.deepEqual(rec.menhGia, { 500000: 1, 200000: 2, 50000: 3 });
    // sai: tổng bảng kê khác số thực tế, ngày tương lai, không có số
    assert.equal((await srv.call('POST', '/api/cash-counts', { ngay, thucTe: 1, menhGia: { 500000: 1 } })).status, 400);
    assert.equal((await srv.call('POST', '/api/cash-counts', { ngay: '2099-01-01', thucTe: 1 })).status, 400);
    assert.equal((await srv.call('POST', '/api/cash-counts', { ngay })).status, 400);
    assert.equal((await srv.call('POST', '/api/cash-counts', { ngay, menhGia: { 500000: -1 } })).status, 400);
    // Cần xử lý: chỉ lần có chênh lệch
    const an = KT.anomalies(db).items.filter((i) => i.loai === 'quy');
    assert.equal(an.length, 1);
    assert.match(an[0].tieuDe, /thừa 107\.000 đ/);
    // nhật ký
    const a = (await srv.ok('GET', '/api/audit?action=kiem-quy')).items;
    assert.equal(a.length, 2); assert.match(a[0].note, /Thừa 107\.000/); assert.equal(a[1].note, 'Khớp sổ');
    // sửa sổ sau khi kiểm quỹ: chênh lệch tính lại theo sổ hiện tại (lần khớp trở thành lệch)
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-01', noiDung: 'bổ sung', chi: 5000 });
    db = await srv.db();
    assert.equal(KT.anomalies(db).items.filter((i) => i.loai === 'quy').length, 2);
    // biên bản Excel
    const x = await srv.call('GET', '/api/export/cash-count?id=' + rec.id);
    assert.equal(x.status, 200);
    const wb = await X.loadWb(x.body);
    const txt = [];
    wb.worksheets[0].eachRow((row) => txt.push(row.values.filter((v) => v != null).map((v) => (typeof v === 'object' && v.result != null ? v.result : v)).join('|')));
    const all = txt.join('\n');
    assert.match(all, /BIÊN BẢN KIỂM KÊ QUỸ/);
    assert.match(all, /Số kiểm kê thực tế\|1050000/);
    assert.match(all, /Loại 200\.000\|2\|400000/);
    assert.equal((await srv.call('GET', '/api/export/cash-count?id=1')).status, 404);
    // xóa → thùng rác → khôi phục
    await srv.ok('DELETE', '/api/cash-counts/' + rec.id);
    assert.ok(!(await srv.db()).cashCounts.some((k) => k.id === rec.id));
    const t = (await srv.ok('GET', '/api/trash')).items[0];
    assert.equal(t.kind, 'cashCounts');
    await srv.ok('POST', '/api/trash/' + t.id + '/restore');
    assert.ok((await srv.db()).cashCounts.some((k) => k.id === rec.id));
  } finally { await srv.stop(); }
});

test('N5.2 giao diện: nhập số thực tế thấy chênh lệch ngay, bảng kê mệnh giá tự cộng, lưu, in biên bản', { skip: SKIP, timeout: 120000 }, async () => {
  const srv = await startServer({ seed: V2 });
  const { browser, page, errors } = await openPage(srv, '#/kiem-soat?tab=kiem-quy');
  try {
    await page.waitForSelector('#kq-form');
    assert.equal(await page.$eval('#kq-so', (e) => e.textContent), '943.000');
    await page.fill('#kq-form input[name=thucTe]', '900000');
    await settle(page);
    assert.match(await page.$eval('#kq-cl', (e) => e.innerText), /Thiếu 43\.000 đ/);
    await page.click('#kq-form summary');
    await page.fill('[data-mg="500000"]', '1');
    await page.fill('[data-mg="200000"]', '2');
    await page.fill('[data-mg="20000"]', '2');
    await page.fill('[data-mg="1000"]', '3');
    await settle(page);
    assert.equal(await page.inputValue('#kq-form input[name=thucTe]'), '943.000');
    assert.match(await page.$eval('#kq-cl', (e) => e.innerText), /Khớp sổ/);
    await page.click('#kq-form [type=submit]');
    await page.waitForFunction(() => /khớp sổ/.test(document.querySelector('#toast-root').textContent), null, { timeout: 5000 });
    await page.waitForSelector('tr[data-id] [data-act=print]');
    await page.evaluate(() => { window.print = () => {}; });
    await page.click('tr[data-id] [data-act=print]');
    await page.waitForSelector('#print-root .bb', { state: 'attached' });
    const t = await page.$eval('#print-root', (e) => e.textContent);
    assert.match(t, /BIÊN BẢN KIỂM KÊ QUỸ/);
    assert.match(t, /Chín trăm bốn mươi ba nghìn đồng/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});
