'use strict';
/* Ngày mặc định của Phiếu nhập chi phí và Ghi thu / chi là HÔM NAY: không lấy ngày của phiếu trước;
 * đã chọn ngày khác mà rời trang rồi quay lại thì ngày về hôm nay; trang tự vẽ lại (dữ liệu đổi) thì vẫn giữ ngày đang chọn. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { KT, startServer, readStored } = require('./helpers');
const { SKIP, openPage, settle } = require('./ui-helpers');

const chonNgay = async (page, scope, txt) => {
  await page.click(scope + ' .date-text');
  await page.keyboard.press('Control+A'); await page.keyboard.type(txt); await page.keyboard.press('Tab');
};

test('NG1 phiếu nhập chi phí: mặc định hôm nay; chọn ngày khác → dữ liệu đổi (trang vẽ lại) vẫn giữ; rời trang rồi quay lại hoặc mở lại phần mềm → về hôm nay', { skip: SKIP, timeout: 120000 }, async () => {
  const srv = await startServer({});
  const { browser, page, errors } = await openPage(srv, '#/cp-nhap');
  const ngay = () => page.inputValue('#cp-head input[name=ngay]');
  try {
    await page.waitForSelector('#cp-head'); await page.waitForTimeout(150);
    assert.equal(await ngay(), KT.todayISO());
    await chonNgay(page, '#cp-head', '15/01/2026');
    assert.equal(await ngay(), '2026-01-15');
    // dữ liệu đổi (thêm NCC qua giao diện chương trình) → trang vẽ lại, ngày vẫn giữ
    await page.evaluate(() => import('/js/ui.js').then((m) => m.api('POST', '/api/suppliers', { ma: 'NCC_MOI', ten: 'NCC mới' })));
    await settle(page);
    assert.equal(await ngay(), '2026-01-15', 'vẽ lại do dữ liệu đổi: giữ ngày đang chọn');
    // rời trang rồi quay lại → hôm nay
    await page.evaluate(() => { location.hash = '#/cp-so'; }); await settle(page);
    await page.evaluate(() => { location.hash = '#/cp-nhap'; }); await page.waitForSelector('#cp-head'); await settle(page);
    assert.equal(await ngay(), KT.todayISO(), 'quay lại trang: ngày về hôm nay');
    // tải lại cả phần mềm: vẫn hôm nay
    await chonNgay(page, '#cp-head', '20/02/2026');
    await page.reload(); await page.waitForSelector('#cp-head'); await settle(page);
    assert.equal(await ngay(), KT.todayISO(), 'mở lại phần mềm: ngày về hôm nay');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('NG2 Ghi thu / chi: mặc định hôm nay; ghi một phiếu ngày khác rồi mở phiếu mới → hôm nay; chọn ngày khác, rời trang, mở lại → hôm nay', { skip: SKIP, timeout: 120000 }, async () => {
  const srv = await startServer({});
  const { browser, page, errors } = await openPage(srv, '#/so-thu-chi');
  const ngay = () => page.inputValue('#entry-page input[name=ngay]');
  try {
    await page.waitForSelector('#view'); await settle(page);
    await page.keyboard.press('F3');
    await page.waitForSelector('#entry-form'); await page.waitForTimeout(150);
    assert.equal(await ngay(), KT.todayISO());
    await chonNgay(page, '#entry-page', '10/03/2026');
    assert.equal(await ngay(), '2026-03-10');
    await page.click('#entry-page [name=noiDung]'); await page.fill('#entry-page [name=noiDung]', 'Chi thử ngày khác');
    await page.fill('#entry-page [name=chi]', '100000');
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => !document.querySelector('#entry-page'), null, { timeout: 8000 });
    assert.ok(readStored(srv.dataDir).entries.some((e) => e.ngay === '2026-03-10' && e.noiDung === 'Chi thử ngày khác'));
    // phiếu mới: hôm nay (không lấy ngày phiếu vừa ghi)
    await page.keyboard.press('F3');
    await page.waitForSelector('#entry-form'); await page.waitForTimeout(150);
    assert.equal(await ngay(), KT.todayISO(), 'phiếu mới sau khi ghi: hôm nay');
    // chọn ngày khác rồi rời trang (Hủy) → mở lại hôm nay
    await chonNgay(page, '#entry-page', '11/03/2026');
    await page.evaluate(() => { location.hash = '#/cp-so'; }); await settle(page);
    await page.keyboard.press('F3');
    await page.waitForSelector('#entry-form'); await page.waitForTimeout(150);
    assert.equal(await ngay(), KT.todayISO(), 'mở lại: hôm nay');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});
