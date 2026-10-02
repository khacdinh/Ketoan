'use strict';
/* F-ML. Phiếu nhập chi phí: bấm Sửa phiếu rồi xóa một dòng (chưa lưu), bấm Sửa lại đúng phiếu đó → phải mở lại được phiếu như đã lưu
 * (hỏi trước khi bỏ thay đổi chưa lưu); quay lại phiếu đang sửa dở thì có thông báo + nút "Mở lại bản đã lưu". */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, readStored } = require('./helpers');
const { SKIP, openPage } = require('./ui-helpers');

test('FML1 sửa phiếu → bấm × xóa dòng 1 (không lưu) → bấm Sửa lại cùng phiếu: hỏi bỏ thay đổi, đồng ý thì hiện lại đủ dòng; Hủy thì giữ bản đang sửa; dữ liệu đã lưu không đổi', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({});
  try {
    await srv.ok('POST', '/api/projects', { ma: 'CT1', ten: 'Công trình 1' });
    await srv.ok('POST', '/api/suppliers', { ma: 'MINH', ten: 'Minh' });
    const db = await srv.db();
    const hm = db.costItems.find((i) => i.ten === 'Vật tư VLXD').ma;
    const s1 = await srv.ok('POST', '/api/cost-slips', { header: { ngay: '2026-08-17', maCT: 'CT1', maNCC: 'MINH', maHM: hm, soPhieu: 'P1' }, lines: [{ dienGiai: 'dòng A', thanhTien: 100000 }, { dienGiai: 'dòng B', thanhTien: 200000 }] });
    const { browser, page, errors } = await openPage(srv, '#/cp-nhap');
    const lines = () => page.$$eval('#cp-body [data-col=dienGiai]', (els) => els.map((e) => e.value).filter(Boolean));
    const sua = 'tr[data-phieu="' + s1.phieuId + '"] a[title="Sửa phiếu"]';
    try {
      await page.waitForSelector(sua);
      await page.click(sua);
      await page.waitForFunction(() => document.querySelectorAll('#cp-body [data-col=dienGiai]').length >= 2);
      assert.deepEqual(await lines(), ['dòng A', 'dòng B']);
      await page.click('#cp-body tr[data-row="0"] [data-act=del-row]');
      assert.deepEqual(await lines(), ['dòng B']);
      // bấm Sửa lại → hỏi; Hủy thì giữ nguyên bản đang sửa
      await page.click(sua);
      await page.waitForSelector('.modal [data-act=no]');
      assert.match(await page.$eval('.modal', (e) => e.innerText), /chưa lưu/);
      await page.click('.modal [data-act=no]');
      await page.waitForFunction(() => !document.querySelector('.modal'));
      assert.deepEqual(await lines(), ['dòng B']);
      // bấm Sửa lại → đồng ý → hiện lại đủ dòng như đã lưu
      await page.click(sua);
      await page.click('.modal [data-act=yes]');
      await page.waitForFunction(() => document.querySelectorAll('#cp-body [data-col=dienGiai]').length >= 2 && !document.querySelector('.modal'));
      assert.deepEqual(await lines(), ['dòng A', 'dòng B']);
      // sửa dở rồi đi màn khác, quay lại: có thông báo, bấm "Mở lại bản đã lưu"
      await page.click('#cp-body tr[data-row="1"] [data-act=del-row]');
      await page.evaluate(() => { location.hash = '#/cp-so'; });
      await page.waitForSelector('#cl-body tr[data-id]');
      await page.evaluate((id) => { location.hash = '#/cp-nhap?phieu=' + id; }, s1.phieuId);
      await page.waitForSelector('[data-act=reload-slip]');
      assert.deepEqual(await lines(), ['dòng A']);
      await page.click('[data-act=reload-slip]');
      await page.click('.modal [data-act=yes]');
      await page.waitForFunction(() => !document.querySelector('[data-act=reload-slip]') && document.querySelectorAll('#cp-body [data-col=dienGiai]').length >= 2);
      assert.deepEqual(await lines(), ['dòng A', 'dòng B']);
      // không có thay đổi: bấm Sửa phiếu không hỏi
      await page.click(sua);
      await page.waitForTimeout(300);
      assert.equal(await page.locator('.modal').count(), 0);
      assert.equal(readStored(srv.dataDir).costs.length, 2, 'dữ liệu đã lưu không đổi');
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  } finally { await srv.stop(); }
});
