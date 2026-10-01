'use strict';
/* N3. Khóa sổ theo tháng: chặn thêm / sửa / xóa / khôi phục / ghi sổ nháp; mở khóa cần lý do và ghi nhật ký;
 * nhập Excel bỏ qua tháng đã khóa (và chế độ thay thế giữ nguyên dữ liệu tháng đã khóa). */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { KT, startServer, readJsonFile, orphanErrors } = require('./helpers');
const { summarize, FILE: MOC } = require('./so-lieu-moc');
const { SKIP, openPage, settle } = require('./ui-helpers');

const V2 = path.join(__dirname, 'fixtures', 'ketoan-v2-hien-tai.json');

test('N3.1 tháng đã khóa: mọi thêm / sửa / xóa dòng sổ, phiếu nhập, dòng chi phí bị chặn (423) kèm hướng dẫn; tháng khác vẫn bình thường', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const db = await srv.db();
    const aug = db.entries.find((e) => e.ngay.startsWith('2026-08'));
    const sep = db.entries.find((e) => e.ngay.startsWith('2026-09'));
    const cAug = db.costs.find((c) => c.ngay.startsWith('2026-08'));
    assert.ok(aug && sep && cAug);
    const r = await srv.ok('POST', '/api/locks', { months: ['2026-08'] });
    assert.deepEqual(r.locked, ['2026-08']);
    assert.deepEqual(r.db.locks.map((l) => l.thang), ['2026-08']);
    const before = JSON.stringify(await srv.db());
    const expect423 = async (method, url, body, verb) => {
      const x = await srv.call(method, url, body);
      assert.equal(x.status, 423, method + ' ' + url + ': ' + x.body.toString().slice(0, 200));
      assert.match(x.json.error, /Tháng 08\/2026 đã khóa sổ/);
      assert.match(x.json.error, /Mở khóa/);
      if (verb) assert.match(x.json.error, verb);
    };
    await expect423('POST', '/api/entries', { ngay: '2026-08-15', noiDung: 'x', chi: 1 }, /không thêm dòng được/);
    await expect423('PUT', '/api/entries/' + aug.id, Object.assign({}, aug, { noiDung: 'sửa' }), /không sửa được/);
    await expect423('PUT', '/api/entries/' + sep.id, Object.assign({}, sep, { ngay: '2026-08-20' }), null); // chuyển sang tháng khóa
    await expect423('DELETE', '/api/entries/' + aug.id, undefined, /không xóa được/);
    await expect423('POST', '/api/entries/delete', { ids: [sep.id, aug.id] });
    await expect423('POST', '/api/cost-slips', { header: { ngay: '2026-08-02', maCT: cAug.maCT, maNCC: cAug.maNCC, maHM: cAug.maHM }, lines: [{ dienGiai: 'a', soLuong: 1, donGia: 1 }] });
    await expect423('PUT', '/api/cost-slips/' + cAug.phieuId, { header: { ngay: '2026-09-02', maCT: cAug.maCT, maNCC: cAug.maNCC, maHM: cAug.maHM }, lines: [{ dienGiai: 'a', soLuong: 1, donGia: 1 }] });
    await expect423('DELETE', '/api/cost-slips/' + cAug.phieuId);
    await expect423('PUT', '/api/costs/' + cAug.id, Object.assign({}, cAug, { soLuong: 99 }));
    await expect423('DELETE', '/api/costs/' + cAug.id);
    await expect423('POST', '/api/costs/delete', { ids: [cAug.id] });
    await expect423('POST', '/api/reset', { confirm: 'XOA' });
    await expect423('POST', '/api/reset-costs', { confirm: 'XOA' });
    assert.equal(JSON.stringify(await srv.db()), before, 'không có gì thay đổi');
    // tháng chưa khóa vẫn làm bình thường
    await srv.ok('PUT', '/api/entries/' + sep.id, Object.assign({}, sep, { noiDung: sep.noiDung + ' ✓' }));
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-29', noiDung: 'tháng 9', chi: 5 });
    // khóa sổ không đổi số liệu báo cáo
    const moc = readJsonFile(MOC).v2;
    assert.equal(summarize(await srv.db()).chiPhi.total, moc.chiPhi.total);
  } finally { await srv.stop(); }
});

test('N3.2 mở khóa cần lý do, có xác nhận trong nhật ký; khóa lại được; tháng còn dòng nháp thì không khóa được', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    await srv.call('POST', '/api/locks', { months: ['2026-07', '2026-08'] }, { 'X-Nguoi-Dung': encodeURIComponent('Kế toán trưởng') });
    let x = await srv.call('POST', '/api/locks/unlock', { thang: '2026-08' });
    assert.equal(x.status, 400); assert.match(x.json.error, /lý do/);
    assert.equal((await srv.call('POST', '/api/locks/unlock', { thang: '2026-05', lyDo: 'a' })).status, 404);
    await srv.ok('POST', '/api/locks/unlock', { thang: '2026-08', lyDo: 'Bổ sung hóa đơn tháng 8 nhận muộn' });
    const items = (await srv.ok('GET', '/api/audit?kind=locks')).items;
    assert.deepEqual(items.map((a) => a.action + ' ' + a.recId), ['mo-khoa 2026-08', 'khoa-so 2026-08', 'khoa-so 2026-07']);
    assert.match(items[0].note, /Lý do: Bổ sung hóa đơn tháng 8 nhận muộn/);
    assert.match(items[0].note, /Kế toán trưởng/, 'ghi lại ai đã khóa trước đó');
    assert.match(items[1].note, /dòng sổ thu chi .* dòng chi phí/);
    // sau khi mở: sửa được
    await srv.ok('POST', '/api/entries', { ngay: '2026-08-15', noiDung: 'bổ sung', chi: 7 });
    // có dòng nháp trong tháng → không khóa được
    await srv.ok('POST', '/api/entries', { ngay: '2026-08-16', noiDung: 'nháp', chi: 8, trangThai: 'nhap' });
    x = await srv.call('POST', '/api/locks', { months: ['2026-08'] });
    assert.equal(x.status, 409); assert.match(x.json.error, /1 dòng Nháp/);
    assert.equal((await srv.call('POST', '/api/locks', { months: ['2026-13'] })).status, 400);
    // lưu nháp vào tháng đã khóa cũng bị chặn
    assert.equal((await srv.call('POST', '/api/entries', { ngay: '2026-07-20', noiDung: 'nháp t7', chi: 9, trangThai: 'nhap' })).status, 423);
  } finally { await srv.stop(); }
});

test('N3.3 khôi phục từ thùng rác vào tháng đã khóa bị chặn; mở khóa rồi khôi phục được', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const db = await srv.db();
    const aug = db.entries.find((e) => e.ngay.startsWith('2026-08'));
    await srv.ok('DELETE', '/api/entries/' + aug.id);
    await srv.ok('POST', '/api/locks', { months: ['2026-08'] });
    const t = (await srv.ok('GET', '/api/trash')).items[0];
    const x = await srv.call('POST', '/api/trash/' + t.id + '/restore');
    assert.equal(x.status, 423); assert.match(x.json.error, /không khôi phục được/);
    await srv.ok('POST', '/api/locks/unlock', { thang: '2026-08', lyDo: 'khôi phục dòng xóa nhầm' });
    await srv.ok('POST', '/api/trash/' + t.id + '/restore');
    assert.deepEqual((await srv.db()).entries.find((e) => e.id === aug.id), aug);
  } finally { await srv.stop(); }
});

test('N3.4 nhập Excel: dòng thuộc tháng đã khóa bị bỏ qua kèm cảnh báo; chế độ thay thế giữ nguyên dữ liệu tháng đã khóa', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const moc = readJsonFile(MOC).v2;
    const db0 = await srv.db();
    const julyCosts = db0.costs.filter((c) => c.ngay.startsWith('2026-07'));
    const augEntries = db0.entries.filter((e) => e.ngay.startsWith('2026-08'));
    assert.ok(julyCosts.length > 0 && augEntries.length > 0);
    const xCost = (await srv.call('GET', '/api/export/costs')).body;
    const xCash = (await srv.call('GET', '/api/export/full')).body;
    await srv.ok('POST', '/api/locks', { months: ['2026-07', '2026-08'] });
    // xem trước báo số dòng sẽ bỏ qua
    const pv = await srv.ok('POST', '/api/import?dryRun=1', xCost);
    assert.ok(pv.preview.stats.boQuaKyKhoa >= julyCosts.length);
    // chi phí: thay toàn bộ → dòng tháng 7 giữ nguyên từng bản ghi, tổng không đổi
    const r = await srv.ok('POST', '/api/import?mode=replace', xCost);
    assert.ok(r.warnings.some((w) => /Bỏ qua \d+ dòng chi phí thuộc tháng đã khóa sổ \(07\/2026, 08\/2026\)/.test(w)), JSON.stringify(r.warnings.slice(0, 5)));
    const db1 = await srv.db();
    julyCosts.forEach((c) => assert.deepEqual(db1.costs.find((x) => x.id === c.id), c, 'dòng tháng 7 giữ nguyên'));
    assert.equal(summarize(db1).chiPhi.total, moc.chiPhi.total, 'tổng chi phí không đổi (không nhân đôi, không mất tháng khóa)');
    assert.deepEqual(orphanErrors(db1), []);
    // sổ thu chi: gộp lại chính file đã xuất → không thêm gì; thay thế → dòng tháng 8 giữ nguyên
    const g = await srv.ok('POST', '/api/import?mode=merge', xCash);
    assert.equal(g.result.added.entries, 0);
    const rr = await srv.ok('POST', '/api/import?mode=replace', xCash);
    assert.ok(rr.warnings.some((w) => /Bỏ qua \d+ dòng thuộc tháng đã khóa sổ/.test(w)));
    const db2 = await srv.db();
    augEntries.forEach((e) => assert.deepEqual(db2.entries.find((x) => x.id === e.id), e));
    assert.equal(summarize(db2).tonQuy, moc.tonQuy);
    assert.equal(db2.entries.length, db0.entries.length);
    assert.deepEqual(orphanErrors(db2), []);
  } finally { await srv.stop(); }
});

test('N3.5 giao diện: khóa sổ ở Kiểm soát sổ sách, dòng tháng khóa có ổ khóa và form chỉ xem, mở khóa phải ghi lý do', { skip: SKIP, timeout: 120000 }, async () => {
  const srv = await startServer({ seed: V2 });
  const { browser, page, errors } = await openPage(srv, '#/kiem-soat?tab=khoa-so');
  try {
    await page.waitForSelector('tr[data-thang="2026-08"]');
    await page.click('tr[data-thang="2026-08"] [data-act=lock]');
    await page.click('.modal [data-act=yes]');
    await page.waitForFunction(() => /Đã khóa sổ 08\/2026/.test(document.querySelector('#toast-root').textContent), null, { timeout: 5000 });
    await page.waitForSelector('tr[data-thang="2026-08"] [data-act=unlock]');
    // sổ thu chi: dòng tháng 8 có ổ khóa, không có nút sửa/xóa
    await page.evaluate(() => { location.hash = '#/so-thu-chi'; });
    await page.waitForSelector('#so-body tr[data-id]');
    const db = await srv.db();
    const aug = db.entries.find((e) => e.ngay.startsWith('2026-08'));
    const row = page.locator('#so-body tr[data-id="' + aug.id + '"]');
    assert.equal(await row.locator('[data-act=locked]').count(), 1);
    assert.equal(await row.locator('[data-act=del]').count(), 0);
    await row.dblclick();
    await page.waitForSelector('#entry-form');
    assert.match(await page.$eval('#entry-form .form-error', (e) => e.innerText), /Tháng 08\/2026 đã khóa sổ/);
    assert.equal(await page.locator('.modal [data-act=save]').count(), 0, 'không có nút lưu');
    await page.keyboard.press('Escape');
    // mở khóa: thiếu lý do thì báo tại ô
    await page.evaluate(() => { location.hash = '#/kiem-soat?tab=khoa-so'; });
    await page.click('tr[data-thang="2026-08"] [data-act=unlock]');
    await page.click('.modal [data-act=yes]');
    await page.waitForSelector('.modal .field-error');
    await page.fill('#uk-ly', 'Bổ sung chứng từ');
    await page.click('.modal [data-act=yes]');
    await page.waitForSelector('tr[data-thang="2026-08"] [data-act=lock]');
    await settle(page);
    assert.equal((await srv.db()).locks.length, 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});
