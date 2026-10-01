'use strict';
/* U. Đăng nhập và phân quyền qua giao diện thật (Chromium). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, readStored } = require('./helpers');
const { SKIP, openPage, settle } = require('./ui-helpers');
const { batDangNhap, taoVaDangNhap, MK_CHU } = require('./auth-helpers');

function seed() {
  return {
    schema: 3, settings: {}, vouchers: {}, trash: [], locks: [], attachments: [], cashCounts: [], ignoredWarnings: {},
    projects: [{ id: 101, ma: 'CT1', ten: 'Công trình 1', nganSach: 0, trangThai: 'Đang thực hiện', ghiChu: '' }],
    suppliers: [{ id: 102, ma: 'NCC1', ten: 'NCC 1', loai: '', sdt: '', diaChi: '', ghiChu: '' }],
    costGroups: [], costItems: [], materials: [], houses: [], costs: [],
    entries: [{ id: 103, seq: 1, ngay: '2026-08-01', soPhieu: 'PC001', maDuAn: 'CT1', maNCC: 'NCC1', noiDung: 'dòng có sẵn', thu: 0, chi: 1000, nguoiNhan: '', ghiChu: '' }],
    nextId: 200
  };
}

// Lỗi console mong đợi khi thử sai: trình duyệt in "Failed to load resource … 401/403" cho mọi trả lời lỗi
const loiThat = (errors) => errors.filter((e) => !/Failed to load resource: the server responded with a status of (401|403)/.test(e));

async function dangNhapUI(page, ten, mk) {
  await page.waitForSelector('#dn-form');
  await page.fill('#dn-form [name=ten]', ten);
  await page.fill('#dn-form [name=mk]', mk);
  await page.press('#dn-form [name=mk]', 'Enter');
  await page.waitForSelector('#user-root .user-box');
  await settle(page);
}
const hien = (page, sel) => page.$$eval(sel, (els) => els.filter((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed').length);

test('U1 vai trò ở giao diện: Chỉ xem không thấy nút thêm / sửa / xóa, F2 và bấm đúp không mở form, menu không có Gộp mã / Phiếu nhập chi phí; Kế toán thấy nút ghi nhưng không thấy việc của Chủ; Chủ thấy đủ; không lỗi console', { skip: SKIP, timeout: 240000 }, async () => {
  const srv = await startServer({ seed: seed() });
  const { cookie } = await batDangNhap(srv);
  await taoVaDangNhap(srv, cookie, 'xem1', 'chi-xem', 'chỉ xem mật khẩu 1');
  await taoVaDangNhap(srv, cookie, 'ketoan1', 'ke-toan', 'kế toán mật khẩu 1');
  const { browser, page, errors } = await openPage(srv, '#/so-thu-chi');
  try {
    // ----- Chỉ xem -----
    await dangNhapUI(page, 'xem1', 'chỉ xem mật khẩu 1');
    await page.waitForSelector('#view tr[data-id]');
    assert.equal(await page.$eval('#user-root .vai', (e) => e.textContent), 'Chỉ xem');
    assert.equal(await hien(page, '#btn-new'), 0, 'không có nút Ghi thu / chi');
    assert.equal(await hien(page, '#view [data-act=edit], #view [data-act=del], #view [data-act=dup]'), 0, 'không có nút sửa / xóa / nhân bản');
    const nav = await page.$$eval('#nav a', (as) => as.map((a) => a.dataset.route));
    assert.ok(!nav.includes('gop-ma') && !nav.includes('cp-nhap'), JSON.stringify(nav));
    await page.keyboard.press('F2');
    await page.dblclick('#view tr[data-id]');
    await settle(page);
    assert.equal(await page.locator('.modal').count(), 0, 'F2 / bấm đúp không mở form');
    await page.evaluate(() => { location.hash = '#/gop-ma'; });
    await page.waitForFunction(() => /không có quyền mở màn hình/.test(document.querySelector('#view').innerText));
    await page.evaluate(() => { location.hash = '#/cai-dat'; });
    await page.waitForSelector('#st-form');
    assert.equal(await page.locator('#imp-file').count(), 0, 'không có nhập Excel');
    assert.equal(await page.locator('[data-act=restore], [data-act=reset], [data-act=backup-zip], [data-act=auth-tat]').count(), 0);
    assert.equal(await page.locator('[data-act=export-full]').count(), 1, 'vẫn xuất Excel được');
    await page.evaluate(() => { location.hash = '#/kiem-soat'; });
    await page.waitForSelector('[role=tablist]');
    assert.doesNotMatch(await page.$eval('[role=tablist]', (e) => e.innerText), /Nhật ký/, 'Chỉ xem không có thẻ Nhật ký');
    // Kế toán
    await page.click('#btn-user');
    await page.click('.menu button:has-text("Đăng xuất")');
    await dangNhapUI(page, 'ketoan1', 'kế toán mật khẩu 1');
    await page.evaluate(() => { location.hash = '#/so-thu-chi'; });
    await page.waitForSelector('#view tr[data-id]');
    assert.equal(await hien(page, '#btn-new'), 1);
    assert.ok(await hien(page, '#view [data-act=edit]') > 0, 'Kế toán sửa được');
    const nav2 = await page.$$eval('#nav a', (as) => as.map((a) => a.dataset.route));
    assert.ok(!nav2.includes('gop-ma') && nav2.includes('cp-nhap'));
    await page.evaluate(() => { location.hash = '#/kiem-soat?tab=thung-rac'; });
    await page.waitForSelector('[role=tablist]');
    assert.match(await page.$eval('[role=tablist]', (e) => e.innerText), /Nhật ký/);
    assert.equal(await hien(page, '[data-act=purge-all], [data-act=purge]'), 0, 'Kế toán không xóa vĩnh viễn');
    await page.evaluate(() => { location.hash = '#/cai-dat'; });
    await page.waitForSelector('#imp-file', { state: 'attached' });
    assert.equal(await page.locator('[data-act=restore], [data-act=reset], [data-act=auth-tat]').count(), 0);
    assert.equal(await page.locator('[data-act=backup-zip]').count(), 1, 'Kế toán tạo sao lưu được');
    // Kế toán ghi một dòng bằng form
    await page.keyboard.press('F2');
    await page.waitForSelector('.modal [name=noiDung]');
    await page.fill('.modal [name=noiDung]', 'kế toán ghi');
    await page.fill('.modal [name=chi]', '5000');
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => !document.querySelector('.modal'));
    const e = readStored(srv.dataDir).entries.find((x) => x.noiDung === 'kế toán ghi');
    assert.ok(e, 'đã ghi');
    // Chủ
    await page.click('#btn-user');
    await page.click('.menu button:has-text("Đăng xuất")');
    await dangNhapUI(page, 'chu', MK_CHU);
    const nav3 = await page.$$eval('#nav a', (as) => as.map((a) => a.dataset.route));
    assert.ok(nav3.includes('gop-ma') && nav3.includes('cp-nhap'));
    await page.evaluate(() => { location.hash = '#/cai-dat'; });
    await page.waitForSelector('[data-act=auth-tat]');
    assert.equal(await page.locator('[data-act=restore]').count(), 1);
    assert.deepEqual(loiThat(errors), []);
  } finally { await browser.close(); await srv.stop(); }
});

test('U2 màn Người dùng (Chủ): thêm người dùng (họ tên chứa mã HTML hiện nguyên văn, không chạy), người mới đăng nhập lần đầu bị bắt đổi mật khẩu rồi vào được; thẻ Sự kiện bảo mật lọc được', { skip: SKIP, timeout: 240000 }, async () => {
  const srv = await startServer({ seed: seed() });
  await batDangNhap(srv);
  const { browser, page, errors } = await openPage(srv, '#/nguoi-dung');
  let dialog = false;
  page.on('dialog', async (d) => { dialog = true; await d.dismiss(); });
  try {
    await dangNhapUI(page, 'chu', MK_CHU);
    await page.waitForSelector('#nd-bang');
    const xss = '<img src=x onerror="window.__xss=1">Lan';
    await page.click('[data-act=them-nd]');
    await page.fill('#nd-form [name=ten]', 'lan.ketoan');
    await page.fill('#nd-form [name=hoTen]', xss);
    await page.selectOption('#nd-form [name=vaiTro]', 'ke-toan');
    await page.fill('#nd-form [name=mk]', 'mật khẩu tạm của Lan');
    await page.fill('#nd-form [name=mk2]', 'mật khẩu tạm của Lan');
    await page.click('.modal [data-act=yes]');
    await page.waitForFunction(() => document.querySelector('#nd-bang') && /lan\.ketoan/.test(document.querySelector('#nd-bang').innerText));
    assert.match(await page.$eval('#nd-bang', (e) => e.innerText), /<img src=x onerror="window.__xss=1">Lan/, 'hiện nguyên văn');
    assert.equal(await page.$$eval('#nd-bang img', (x) => x.length), 0, 'không tạo thẻ img');
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.match(await page.$eval('#nd-bang', (e) => e.innerText), /Phải đổi mật khẩu/);
    // thẻ sự kiện bảo mật
    await page.click('[data-the=su-kien]');
    await page.waitForSelector('#sk-bang');
    await page.selectOption('#sk-loc [name=loai]', 'tao-nguoi-dung');
    await page.click('#sk-loc [type=submit]');
    await page.waitForFunction(() => document.querySelector('#sk-bang') && /lan\.ketoan/.test(document.querySelector('#sk-bang').innerText));
    // người mới đăng nhập: bắt đổi mật khẩu
    await page.click('#btn-user');
    await page.click('.menu button:has-text("Đăng xuất")');
    await dangNhapUI(page, 'lan.ketoan', 'mật khẩu tạm của Lan').catch(() => {});
    await page.waitForSelector('#dmk-form');
    await page.fill('#dmk-form [name=cu]', 'mật khẩu tạm của Lan');
    await page.fill('#dmk-form [name=moi]', 'Lan đổi mật khẩu riêng');
    await page.fill('#dmk-form [name=moi2]', 'Lan đổi mật khẩu riêng');
    await page.press('#dmk-form [name=moi2]', 'Enter');
    await page.waitForSelector('#user-root .user-box');
    await page.waitForSelector('#view .sheet');
    assert.match(await page.$eval('#user-root', (e) => e.innerText), /<img src=x/, 'tên ở góc trên cũng hiện nguyên văn');
    assert.equal(await page.$$eval('#user-root img', (x) => x.length), 0);
    assert.equal(dialog, false);
    assert.deepEqual(loiThat(errors), []);
  } finally { await browser.close(); await srv.stop(); }
});
