'use strict';
/* C (giao diện). Chạy trình duyệt thật (Chromium qua Playwright). Bỏ qua nếu máy không có Playwright.
 * Không thêm thư viện vào package.json: dùng bản cài sẵn trên máy (npm i -g playwright) nếu có. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { KT, startServer, readJsonFile } = require('./helpers');

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {
  try { chromium = require(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')).chromium; } catch (e2) { /* không có */ }
}
const SKIP = chromium ? false : 'không có Playwright (npm i -g playwright) — kiểm tra giao diện bằng tay';
const V2 = path.join(__dirname, 'fixtures', 'ketoan-v2-hien-tai.json');
const thisYear = new Date().getFullYear();

async function open(srv, hash) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
  const external = [];
  page.on('request', (r) => { if (!/^(http:\/\/127\.0\.0\.1|http:\/\/localhost|data:|blob:)/.test(r.url())) external.push(r.url()); });
  await page.goto(srv.base + '/' + (hash || ''));
  await page.waitForFunction(() => document.querySelector('#view') && document.querySelector('#view').innerText.trim().length > 10, null, { timeout: 15000 });
  return { browser, page, errors, external };
}

test('UI1 mọi màn hình hiển thị được với dữ liệu thật, không lỗi JS, không gọi mạng ngoài', { skip: SKIP, timeout: 120000 }, async () => {
  const srv = await startServer({ seed: V2 });
  const { browser, page, errors, external } = await open(srv);
  try {
    const routes = ['tong-quan', 'so-thu-chi', 'phieu', 'du-an', 'ncc', 'tong-hop-ncc', 'cai-dat', 'cp-tong-hop', 'cp-nhap', 'cp-so', 'cp-chi-tiet', 'cp-cong-no', 'cp-gia', 'cp-danh-muc'];
    for (const r of routes) {
      await page.evaluate((h) => { location.hash = '#/' + h; }, r);
      await page.waitForTimeout(250);
      const html = await page.$eval('#view', (el) => el.innerText.trim());
      assert.ok(html.length > 20, 'màn ' + r + ' trống');
      assert.ok(!/undefined|NaN|\[object Object\]/.test(html), 'màn ' + r + ' có chữ lỗi: ' + (html.match(/.{0,40}(undefined|NaN|\[object Object\]).{0,40}/) || [''])[0]);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, [], 'có yêu cầu ra mạng ngoài');
  } finally { await browser.close(); await srv.stop(); }
});

test('UI2 Tổng quan: tồn quỹ hiển thị đúng số trong dữ liệu', { skip: SKIP, timeout: 60000 }, async () => {
  const srv = await startServer({ seed: V2 });
  const { browser, page } = await open(srv, '#/tong-quan');
  try {
    await page.waitForTimeout(400);
    const text = await page.$eval('#view', (el) => el.innerText);
    const led = KT.filterLedger(KT.buildLedger(readJsonFile(V2)), {});
    assert.ok(text.includes(KT.fmtMoney(led.tonCuoiKy)), 'không thấy tồn quỹ ' + KT.fmtMoney(led.tonCuoiKy));
  } finally { await browser.close(); await srv.stop(); }
});

test('UI3 form nhập: F3, ngày (29/9, 290926, 29.9.26, ↑↓), tiền, số tiền bằng chữ, Ctrl+Enter, Lưu và nhập tiếp', { skip: SKIP, timeout: 120000 }, async () => {
  const srv = await startServer({ seed: V2 });
  const { browser, page, errors } = await open(srv, '#/so-thu-chi');
  try {
    await page.waitForSelector('#so-body tr');
    await page.keyboard.press('F3');
    await page.waitForSelector('#entry-form');
    await page.waitForTimeout(120); // openModal tự chuyển tiêu điểm sau 30 ms
    const dateText = page.locator('#entry-form .date-text');
    const dateVal = page.locator('#entry-form .date-value');
    const setDate = async (s) => { await dateText.fill(s); await dateText.press('Tab'); };
    const cases = [['29/9', thisYear + '-09-29'], ['290926', '2026-09-29'], ['29.9.26', '2026-09-29'], ['29-09-2026', '2026-09-29'], ['2026-09-29', '2026-09-29'], ['1/10/2026', '2026-10-01'], ['29 9', thisYear + '-09-29']];
    for (const [inp, want] of cases) {
      await setDate(inp);
      assert.equal(await dateVal.inputValue(), want, 'ngày nhập ' + inp);
      assert.equal(await dateText.inputValue(), want.split('-').reverse().join('/'));
    }
    await setDate('30/02/2026');
    assert.ok(await dateText.evaluate((e) => e.classList.contains('invalid')), '30/02 phải bị đánh dấu sai');
    await setDate('abc');
    assert.ok(await dateText.evaluate((e) => e.classList.contains('invalid')));
    await setDate('15/09/2026');
    await dateText.focus();
    await dateText.press('ArrowUp');
    assert.equal(await dateVal.inputValue(), '2026-09-16');
    await dateText.press('ArrowDown'); await dateText.press('ArrowDown');
    assert.equal(await dateVal.inputValue(), '2026-09-14');
    const chi = page.locator('#entry-form input[name=chi]');
    await chi.fill('1.250.000'); await chi.press('Tab');
    assert.match(await page.locator('#chi-hint').innerText(), /Một triệu hai trăm năm mươi nghìn đồng/i);
    await chi.fill('50tr'); await chi.press('Tab');
    assert.match(await page.locator('#chi-hint').innerText(), /Năm mươi triệu đồng/i);
    await chi.fill('abc'); await chi.press('Tab');
    assert.ok(/không hợp lệ|sai/i.test(await page.locator('#chi-hint').innerText()) || await chi.evaluate((e) => e.classList.contains('invalid')), 'số tiền "abc" phải báo sai');
    await setDate('14/09/2026');
    await page.fill('#entry-form input[name=soPhieu]', 'PC900/09');
    await page.fill('#entry-form input[name=maDuAn]', 'DANDC10');
    await page.fill('#entry-form input[name=maNCC]', 'NCC_DIENTHUY');
    const amounts = [['1.250.000', 1250000], ['50tr', 50000000], ['1,5tr', 1500000], ['300k', 300000], ['58000+11000', 69000]];
    for (let i = 0; i < amounts.length; i++) {
      await page.fill('#entry-form textarea[name=noiDung]', 'UI test ' + i);
      await chi.fill(amounts[i][0]);
      await page.click('[data-act=save-next]');
      await page.waitForFunction(() => document.querySelector('#entry-form input[name=chi]') && document.querySelector('#entry-form input[name=chi]').value === '', null, { timeout: 5000 });
      assert.equal(await dateVal.inputValue(), '2026-09-14', 'giữ ngày sau khi lưu tiếp');
      assert.equal(await page.inputValue('#entry-form input[name=soPhieu]'), 'PC900/09', 'giữ số phiếu');
      assert.equal(await page.inputValue('#entry-form input[name=maDuAn]'), 'DANDC10', 'giữ dự án');
      assert.equal(await page.inputValue('#entry-form input[name=maNCC]'), 'NCC_DIENTHUY', 'giữ NCC');
    }
    await page.fill('#entry-form textarea[name=noiDung]', 'UI test ctrl-enter');
    await chi.fill('2tr');
    await page.keyboard.press('Control+Enter');
    await page.waitForSelector('#entry-form', { state: 'detached', timeout: 5000 });
    const db = await srv.db();
    const added = db.entries.filter((e) => /^UI test/.test(e.noiDung));
    assert.equal(added.length, 6);
    amounts.forEach(([, n], i) => assert.equal(added.find((e) => e.noiDung === 'UI test ' + i).chi, n));
    assert.equal(added.find((e) => e.noiDung === 'UI test ctrl-enter').chi, 2000000);
    added.forEach((e) => { assert.equal(e.ngay, '2026-09-14'); assert.equal(e.soPhieu, 'PC900/09'); assert.equal(e.maDuAn, 'DANDC10'); assert.equal(e.maNCC, 'NCC_DIENTHUY'); });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('UI4 sổ thu chi: tìm kiếm, nhân bản, sửa, xóa có xác nhận; tồn quỹ hiển thị khớp', { skip: SKIP, timeout: 120000 }, async () => {
  const srv = await startServer({ seed: V2 });
  const { browser, page, errors } = await open(srv, '#/so-thu-chi');
  try {
    await page.waitForSelector('#so-body tr[data-id]');
    const n0 = (await srv.db()).entries.length;
    assert.equal(await page.locator('#so-body tr[data-id]').count(), n0);
    await page.fill('#so-q', 'xi măng');
    await page.waitForTimeout(400);
    const hits = await page.locator('#so-body tr[data-id]').count();
    assert.equal(hits, KT.filterLedger(KT.buildLedger(readJsonFile(V2)), { q: 'xi măng' }).rows.length);
    await page.click('#so-clear');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#so-body tr[data-id]').count(), n0);
    const firstId = await page.locator('#so-body tr[data-id]').first().getAttribute('data-id');
    await page.locator('#so-body tr[data-id="' + firstId + '"] [data-act=dup]').click();
    // nhân bản: hỏi trước (Hủy thì không mở gì), đồng ý mới mở biểu mẫu đã điền sẵn
    await page.waitForSelector('.modal [data-act=yes]');
    assert.match(await page.$eval('.modal', (e) => e.innerText), /Chưa lưu gì/);
    await page.click('.modal [data-act=no]');
    await page.waitForFunction(() => !document.querySelector('.modal'));
    assert.equal(await page.locator('#entry-form').count(), 0, 'Hủy thì không mở biểu mẫu');
    await page.locator('#so-body tr[data-id="' + firstId + '"] [data-act=dup]').click();
    await page.click('.modal [data-act=yes]');
    await page.waitForSelector('#entry-form');
    await page.waitForTimeout(120); // openModal tự chuyển tiêu điểm sau 30 ms
    await page.click('[data-act=save]');
    await page.waitForSelector('#entry-form', { state: 'detached' });
    await page.waitForFunction((n) => document.querySelectorAll('#so-body tr[data-id]').length === n, n0 + 1, { timeout: 5000 });
    const copy = (await srv.db()).entries.slice().sort((a, b) => b.id - a.id)[0];
    await page.locator('#so-body tr[data-id="' + copy.id + '"] [data-act=edit]').click();
    await page.waitForSelector('#entry-form');
    await page.waitForTimeout(120); // openModal tự chuyển tiêu điểm sau 30 ms
    const field = copy.chi ? 'chi' : 'thu';
    await page.fill('#entry-form input[name=' + field + ']', '123456');
    await page.click('[data-act=save]');
    await page.waitForSelector('#entry-form', { state: 'detached' });
    await page.waitForTimeout(300);
    assert.equal((await srv.db()).entries.find((e) => e.id === copy.id)[field], 123456);
    const led = KT.filterLedger(KT.buildLedger(await srv.db()), {});
    const foot = await page.$eval('#so-foot', (el) => el.innerText);
    const summary = await page.$eval('#so-summary', (el) => el.innerText);
    assert.ok((foot + summary).includes(KT.fmtMoney(led.tonCuoiKy)), 'không thấy tồn quỹ cuối kỳ ' + KT.fmtMoney(led.tonCuoiKy));
    await page.locator('#so-body tr[data-id="' + copy.id + '"] [data-act=del]').click();
    await page.click('[data-act=no]');
    assert.ok((await srv.db()).entries.some((e) => e.id === copy.id), 'hủy xóa thì không xóa');
    await page.locator('#so-body tr[data-id="' + copy.id + '"] [data-act=del]').click();
    await page.click('[data-act=yes]');
    await page.waitForFunction((n) => document.querySelectorAll('#so-body tr[data-id]').length === n, n0, { timeout: 5000 });
    assert.ok(!(await srv.db()).entries.some((e) => e.id === copy.id));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('UI5 phiếu: in 2 liên A4 (PT/PC, số tiền bằng chữ, đúng số tiền), vừa một trang PDF', { skip: SKIP, timeout: 120000 }, async () => {
  const srv = await startServer({ seed: V2 });
  const { browser, page, errors } = await open(srv, '#/phieu');
  try {
    await page.waitForSelector('#ph-list *');
    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    const vs = KT.buildVouchers(readJsonFile(V2));
    const v = vs.find((x) => x.loai === 'chi' && x.soTien > 0);
    await page.fill('#ph-q', v.soPhieu);
    await page.waitForTimeout(400);
    await page.locator('#ph-list > *').first().click();
    await page.waitForSelector('#ph-paper .vc');
    assert.equal(await page.locator('#ph-paper .vc').count(), 2, 'phải có 2 liên');
    const paper = await page.$eval('#ph-paper', (el) => el.innerText);
    assert.match(paper, /PHIẾU CHI/);
    assert.match(paper, /LIÊN 1/); assert.match(paper, /LIÊN 2/);
    assert.ok(paper.includes(KT.fmtMoney(v.soTien)), 'số tiền ' + v.soTien);
    assert.ok(paper.toLowerCase().includes(v.bangChu.toLowerCase()), 'bằng chữ ' + v.bangChu);
    await page.click('[data-act=print]');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__printed), 1);
    assert.equal(await page.locator('#print-root .vc').count(), 2);
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    assert.equal(pages, 1, 'phiếu 2 liên phải vừa 1 trang A4, đang ' + pages);
    fs.writeFileSync(path.join(os.tmpdir(), 'phieu-chi-test.pdf'), pdf);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('UI6 Tổng hợp chi phí: bấm ô Vật tư / Nhân công / Đã trả / Còn nợ chuyển tới chi tiết đúng', { skip: SKIP, timeout: 120000 }, async () => {
  const srv = await startServer({ seed: V2 });
  const { browser, page, errors } = await open(srv, '#/cp-tong-hop');
  try {
    await page.waitForSelector('.stat');
    for (const loai of ['Vật tư', 'Nhân công', 'Dịch vụ-Phí']) {
      await page.evaluate(() => { location.hash = '#/cp-tong-hop'; });
      await page.waitForSelector('.stat-link');
      await page.locator('.stat-link[data-loai="' + loai + '"]').click();
      await page.waitForFunction(() => location.hash === '#/cp-so');
      await page.waitForSelector('#cl-body tr[data-id]');
      const n = await page.locator('#cl-body tr[data-id]').count();
      const expect = KT.filterCosts(KT.buildCostLedger(readJsonFile(V2)), { loai }).rows.length;
      assert.equal(n, expect, 'số dòng loại ' + loai);
      assert.equal(await page.$eval('#cl-loai', (e) => e.value), loai);
    }
    for (const i of [0, 1]) {
      await page.evaluate(() => { location.hash = '#/cp-tong-hop'; });
      await page.waitForSelector('.stat-link[data-tile=debt]');
      await page.locator('.stat-link[data-tile=debt]').nth(i).click();
      await page.waitForFunction(() => location.hash === '#/cp-cong-no');
      await page.waitForSelector('#cn-table');
    }
    await page.evaluate(() => { location.hash = '#/cp-tong-hop'; });
    await page.waitForSelector('.stat-link');
    await page.locator('.stat-link[data-loai="Vật tư"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash === '#/cp-so');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('UI7 Cài đặt: lưu thông tin in, xuất Excel, nhập Excel (xem trước, gộp, thay), sao lưu ngay, khôi phục, xóa dữ liệu có xác nhận', { skip: SKIP, timeout: 240000 }, async () => {
  const srv = await startServer({ seed: V2 });
  const { browser, page, errors } = await open(srv, '#/cai-dat');
  try {
    await page.waitForSelector('#st-form');
    // lưu thông tin in
    await page.fill('#st-form input[name=tenDonVi]', 'CÔNG TY KIỂM THỬ');
    await page.click('#st-form button[type=submit], #st-form [type=submit]');
    await page.waitForFunction(() => document.body.innerText.includes('Đã lưu thông tin in'), null, { timeout: 5000 });
    assert.equal((await srv.db()).settings.tenDonVi, 'CÔNG TY KIỂM THỬ');
    // xuất Excel: tải về và mở được
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('[data-act=export-full]')]);
    const file = path.join(os.tmpdir(), 'ui7-' + dl.suggestedFilename());
    await dl.saveAs(file);
    assert.match(dl.suggestedFilename(), /^SoSachKeToan_.*\.xlsx$/);
    const X = require('./excel-helpers');
    const wb = await X.loadWb(fs.readFileSync(file));
    assert.ok(wb.worksheets.length >= 4);
    // nhập lại file vừa xuất: xem trước + gộp → không thêm dòng
    const n0 = (await srv.db()).entries.length;
    // nhập Excel nằm ở màn riêng (menu Nhập liệu › Nhập từ Excel)
    await page.evaluate(() => { location.hash = '#/nhap-excel'; });
    await page.waitForSelector('#imp-file', { state: 'attached' });
    await page.setInputFiles('#imp-file', file);
    await page.waitForSelector('#imp-preview [data-imp=merge]', { timeout: 20000 });
    const pvText = await page.$eval('#imp-preview', (e) => e.innerText);
    assert.ok(pvText.includes(String(n0)), 'xem trước phải ghi số dòng sổ ' + n0);
    await page.click('#imp-preview [data-imp=merge]');
    await page.waitForFunction(() => /Bỏ qua \d+ dòng trùng/.test(document.body.innerText), null, { timeout: 15000 });
    assert.equal((await srv.db()).entries.length, n0);
    // nhập lại file lỗi: báo lỗi tiếng Việt
    const bad = path.join(os.tmpdir(), 'ui7-bad.xlsx');
    fs.writeFileSync(bad, Buffer.from('không phải file excel '.repeat(30)));
    await page.setInputFiles('#imp-file', bad);
    await page.waitForFunction(() => /Không đọc được file Excel/.test(document.querySelector('#imp-preview').innerText), null, { timeout: 15000 });
    // sao lưu ngay → xuất hiện trong danh sách
    await page.evaluate(() => { location.hash = '#/cai-dat'; });
    await page.waitForSelector('#bk-list table');
    await page.click('[data-act=backup-now]');
    await page.waitForFunction(() => /Sao lưu thủ công/.test(document.querySelector('#bk-list').innerText), null, { timeout: 8000 });
    const snap = await srv.db();
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-29', noiDung: 'sau sao lưu', chi: 1 });
    // khôi phục bản thủ công (dòng đầu tiên có nhãn "Sao lưu thủ công")
    await page.locator('#bk-list tr', { hasText: 'Sao lưu thủ công' }).first().locator('[data-act=restore-bk]').click();
    await page.click('[data-act=yes]');
    await page.waitForFunction((n) => true, null);
    await page.waitForTimeout(800);
    assert.equal((await srv.db()).entries.length, snap.entries.length, 'khôi phục về đúng thời điểm sao lưu');
    // xóa dữ liệu: nút xóa chỉ bật sau khi gõ XOA
    await page.click('[data-act=reset]');
    await page.waitForSelector('#rs-confirm');
    assert.ok(await page.locator('[data-act=yes]').isDisabled());
    await page.fill('#rs-confirm', 'xoa');
    assert.ok(await page.locator('[data-act=yes]').isEnabled());
    await page.click('[data-act=yes]');
    await page.waitForTimeout(800);
    const after = await srv.db();
    assert.equal(after.entries.length, 0);
    assert.equal(after.costs.length, 104, 'chi phí công trình không bị xóa cùng sổ thu chi');
    // bỏ qua 2 "lỗi" cố ý: tải tệp xuất (trình duyệt báo hủy điều hướng) và file lỗi (400)
    assert.deepEqual(errors.filter((e) => !/requestfailed: .*\/api\/export\/full/.test(e) && !/status of 400/.test(e)), []);
  } finally { await browser.close(); await srv.stop(); }
});

test('UI8 danh mục dự án / nhà cung cấp: thêm, sửa (đổi mã lan sang sổ), xóa mã đang dùng bị chặn, xóa mã chưa dùng; tổng hợp NCC', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({ seed: V2 });
  const { browser, page, errors } = await open(srv, '#/du-an');
  try {
    await page.waitForSelector('#pj-body tr[data-id]');
    const db0 = await srv.db();
    assert.equal(await page.locator('#pj-body tr[data-id]').count(), db0.projects.length);
    // thêm dự án với ngân sách gõ "2 tỷ"
    await page.click('[data-act=add]');
    await page.waitForSelector('#p-form');
    await page.waitForTimeout(120); // openModal tự chuyển tiêu điểm sau 30 ms
    await page.fill('#p-form input[name=ma]', 'UI_DA1');
    await page.fill('#p-form input[name=ten]', 'Dự án kiểm thử giao diện');
    await page.fill('#p-form input[name=nganSach]', '2 tỷ');
    await page.click('[data-act=save]');
    await page.waitForSelector('#p-form', { state: 'detached' });
    let p = (await srv.db()).projects.find((x) => x.ma === 'UI_DA1');
    assert.equal(p.nganSach, 2000000000);
    // trùng mã (khác hoa thường) bị từ chối, hộp thoại vẫn mở
    await page.click('[data-act=add]');
    await page.waitForSelector('#p-form');
    await page.waitForTimeout(120); // openModal tự chuyển tiêu điểm sau 30 ms
    await page.fill('#p-form input[name=ma]', 'ui_da1');
    await page.fill('#p-form input[name=ten]', 'Trùng mã');
    await page.click('[data-act=save]');
    await page.waitForFunction(() => /đã tồn tại/.test(document.querySelector('#toast-root').textContent), null, { timeout: 5000 }).catch(async (e) => {
      throw new Error('không thấy báo "đã tồn tại"; toast đang có: ' + JSON.stringify(await page.$eval('#toast-root', (t) => t.textContent)) + '; dự án: ' + JSON.stringify((await srv.db()).projects.map((x) => x.ma).filter((m) => /ui_/i.test(m))));
    });
    await page.click('[data-act=cancel]');
    await page.waitForSelector('#p-form', { state: 'detached' });
    // ghi một dòng sổ vào dự án mới rồi đổi mã → dòng sổ đi theo
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-20', noiDung: 'dòng của dự án thử', chi: 1000, maDuAn: 'UI_DA1' });
    await page.evaluate(() => { location.hash = '#/so-thu-chi'; location.hash = '#/du-an'; });
    await page.waitForSelector('#pj-body tr[data-id="' + p.id + '"]');
    await page.locator('#pj-body tr[data-id="' + p.id + '"] [data-act=edit]').click();
    await page.waitForSelector('#p-form');
    await page.waitForTimeout(120); // openModal tự chuyển tiêu điểm sau 30 ms
    await page.fill('#p-form input[name=ma]', 'UI_DA2');
    await page.click('[data-act=save]');
    await page.waitForSelector('#p-form', { state: 'detached' });
    let d = await srv.db();
    assert.equal(d.entries.find((e) => e.noiDung === 'dòng của dự án thử').maDuAn, 'UI_DA2');
    // xóa dự án đang dùng: bị chặn
    await page.locator('#pj-body tr[data-id="' + p.id + '"] [data-act=del]').click();
    await page.waitForFunction(() => /Không xóa được/.test(document.querySelector('#toast-root').textContent), null, { timeout: 5000 });
    assert.ok((await srv.db()).projects.some((x) => x.ma === 'UI_DA2'));
    // bỏ dòng sổ rồi xóa được
    const eid = (await srv.db()).entries.find((e) => e.noiDung === 'dòng của dự án thử').id;
    await srv.ok('DELETE', '/api/entries/' + eid);
    await page.reload(); // trang không biết thay đổi vừa gọi thẳng vào API
    await page.waitForSelector('#pj-body tr[data-id="' + p.id + '"]');
    await page.locator('#pj-body tr[data-id="' + p.id + '"] [data-act=del]').click();
    await page.click('[data-act=yes]');
    await page.waitForFunction((id) => !document.querySelector('#pj-body tr[data-id="' + id + '"]'), p.id, { timeout: 5000 });
    assert.ok(!(await srv.db()).projects.some((x) => x.ma === 'UI_DA2'));
    // nhà cung cấp
    await page.evaluate(() => { location.hash = '#/ncc'; });
    await page.waitForSelector('#ncc-body tr[data-id]');
    await page.click('[data-act=add]');
    await page.waitForSelector('#s-form');
    await page.waitForTimeout(120); // openModal tự chuyển tiêu điểm sau 30 ms
    await page.fill('#s-form input[name=ma]', 'UI_NCC1');
    await page.fill('#s-form input[name=ten]', 'Nhà cung cấp kiểm thử');
    await page.click('[data-act=save]');
    await page.waitForSelector('#s-form', { state: 'detached', timeout: 8000 }).catch(async () => {
      throw new Error('hộp thoại NCC không đóng; toast: ' + JSON.stringify(await page.$eval('#toast-root', (t) => t.textContent)) + '; ma=' + (await page.inputValue('#s-form input[name=ma]')) + '; ten=' + (await page.inputValue('#s-form input[name=ten]')) +
        '; có NCC: ' + (await srv.db()).suppliers.some((x) => x.ma === 'UI_NCC1'));
    });
    assert.ok((await srv.db()).suppliers.some((x) => x.ma === 'UI_NCC1'));
    await page.fill('#ncc-q', 'kiểm thử');
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#ncc-body tr[data-id]').count(), 1);
    // tổng hợp NCC khớp tính độc lập
    await page.evaluate(() => { location.hash = '#/tong-hop-ncc'; });
    await page.waitForSelector('#cn-table tbody tr');
    const txt = await page.$eval('#view', (e) => e.innerText);
    // bảng công nợ theo kỳ (toàn bộ thời gian): tổng Thanh toán = chi − thu của các dòng sổ có mã NCC, Cuối kỳ = Phát sinh − Thanh toán
    const dbx = await srv.db();
    const tt = dbx.entries.filter((e) => e.maNCC).reduce((t, e) => t + (e.chi || 0) - (e.thu || 0), 0);
    const ps = dbx.costs.filter((c) => c.maNCC).reduce((t, c) => t + c.thanhTien, 0);
    assert.ok(txt.includes(KT.fmtMoney(tt)), 'tổng thanh toán NCC ' + tt);
    assert.ok(txt.includes(KT.fmtMoney(ps - tt)), 'tổng cuối kỳ NCC ' + (ps - tt));
    assert.deepEqual(errors.filter((e) => !/status of 400/.test(e)), []);
  } finally { await browser.close(); await srv.stop(); }
});
