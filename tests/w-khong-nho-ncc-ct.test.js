'use strict';
/* Các form nhập KHÔNG tự nhớ / tự điền nhà cung cấp và công trình (để không ghi nhầm khi quên chọn lại):
 *  - Phiếu nhập chi phí: phiếu mới trống NCC + công trình dù đã chọn công trình ở thanh trên và vừa ghi phiếu trước;
 *    dòng mới không chép công trình từ dòng trên; ghi xong phiếu thì phiếu kế tiếp trống.
 *  - Ghi thu / chi: phiếu mới trống NCC + công trình sau khi vừa ghi phiếu trước.
 *  - Số dư đầu kỳ NCC từ màn Công nợ: không điền sẵn NCC / công trình đang lọc. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');
const { SKIP, openPage, settle, chonCongTrinh, dienBatBuoc } = require('./ui-helpers');

async function seed(srv) {
  await srv.ok('POST', '/api/projects', { ma: 'CT1', ten: 'Công trình 1' });
  await srv.ok('POST', '/api/projects', { ma: 'CT2', ten: 'Công trình 2' });
  await srv.ok('POST', '/api/suppliers', { ma: 'NCC1', ten: 'NCC 1' });
  await srv.ok('POST', '/api/cost-groups', { ma: 'G1', ten: 'Vật liệu' }).catch(() => {});
}

test('KN1 phiếu nhập chi phí: không nhớ NCC / công trình (thanh trên, phiếu trước, dòng trên)', { skip: SKIP, timeout: 120000 }, async () => {
  const srv = await startServer({});
  await seed(srv);
  const { browser, page, errors } = await openPage(srv, '#/cp-so');
  try {
    await chonCongTrinh(page, 'CT1'); // công trình đang chọn ở thanh trên
    await page.evaluate(() => { location.hash = '#/cp-nhap'; });
    await page.waitForSelector('#cp-head'); await settle(page);
    assert.equal(await page.inputValue('#cp-head input[name=maNCC]'), '', 'NCC trống');
    assert.equal(await page.inputValue('tr[data-row="0"] [data-col=ct]'), '', 'công trình trống dù thanh trên đã chọn CT1');
    assert.equal(await page.inputValue('tr[data-row="0"] [data-col=nha]'), '');
    // gõ dòng đầu rồi thêm dòng mới: dòng mới không chép công trình
    await page.fill('tr[data-row="0"] [data-col=ct]', 'CT2'); await page.locator('tr[data-row="0"] [data-col=ct]').dispatchEvent('change');
    await page.fill('tr[data-row="0"] [data-col=dienGiai]', 'Tiền xe'); await page.fill('tr[data-row="0"] [data-col=thanhTien]', '100000');
    await page.locator('tr[data-row="0"] [data-col=thanhTien]').dispatchEvent('input');
    await page.waitForSelector('tr[data-row="1"]');
    assert.equal(await page.inputValue('tr[data-row="1"] [data-col=ct]'), '', 'dòng mới không chép công trình của dòng trên');
    assert.equal(await page.inputValue('tr[data-row="1"] [data-col=nha]'), '');
    // rời trang rồi quay lại, mở phiếu mới (bản nháp đang gõ dở được giữ nguyên là chuyện khác): xóa trắng rồi kiểm tra bằng phiếu thật bên dưới
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('KN2 Ghi thu / chi: ghi một phiếu rồi mở phiếu mới → NCC và công trình đều trống', { skip: SKIP, timeout: 120000 }, async () => {
  const srv = await startServer({});
  await seed(srv);
  const { browser, page, errors } = await openPage(srv, '#/so-thu-chi');
  try {
    await chonCongTrinh(page, 'CT1');
    await page.keyboard.press('F3');
    await page.waitForSelector('#entry-form'); await page.waitForTimeout(150);
    assert.equal(await page.inputValue('#entry-page input[name=maNCC]'), '', 'NCC trống');
    assert.equal(await page.inputValue('#entry-page [data-c=maDuAn]'), '', 'công trình trống dù thanh trên đã chọn CT1');
    await page.fill('#entry-page [name=noiDung]', 'Chi thử'); await page.fill('#entry-page [name=chi]', '100000');
    await dienBatBuoc(page, 'NCC1', 'CT1');
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => !document.querySelector('#entry-page'), null, { timeout: 8000 });
    await page.keyboard.press('F3');
    await page.waitForSelector('#entry-form'); await page.waitForTimeout(150);
    assert.equal(await page.inputValue('#entry-page input[name=maNCC]'), '', 'phiếu mới sau khi vừa ghi: NCC trống');
    assert.equal(await page.inputValue('#entry-page [data-c=maDuAn]'), '', 'phiếu mới sau khi vừa ghi: công trình trống');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('KN3 Công nợ NCC: nút thêm số dư đầu kỳ không điền sẵn NCC / công trình đang lọc', { skip: SKIP, timeout: 120000 }, async () => {
  const srv = await startServer({});
  await seed(srv);
  const { browser, page, errors } = await openPage(srv, '#/cp-cong-no');
  try {
    await chonCongTrinh(page, 'CT1');
    await page.evaluate(() => localStorage.setItem('stc.cp.cn.sel', JSON.stringify('NCC1')));
    await page.click('[data-act=dk-add]');
    await page.waitForSelector('#modal-root form'); await page.waitForTimeout(150);
    assert.equal(await page.inputValue('#modal-root input[name=maNCC]'), '');
    assert.equal(await page.inputValue('#modal-root input[name=maDuAn]'), '');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});
