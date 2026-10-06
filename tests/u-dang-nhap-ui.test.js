'use strict';
/* U. Đăng nhập và phân quyền qua giao diện thật (Chromium). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, readStored } = require('./helpers');
const { SKIP, openPage, settle, dienBatBuoc } = require('./ui-helpers');
const { batDangNhap, taoVaDangNhap, MK_CHU, dongHo } = require('./auth-helpers');

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
  await page.waitForSelector('#user-root #btn-user');
  await settle(page);
}
// Mở form ghi thu / chi bằng F2 rồi bấm vào ô Nội dung như người dùng: form tự đặt con trỏ vào ô ngày sau 30–40 ms nếu chưa ai
// chạm vào — gõ ngay (page.fill) có thể bị con trỏ kéo sang ô ngày giữa chừng
async function moFormGhi(page) {
  await page.keyboard.press('F3');
  await page.waitForSelector('#entry-page [name=noiDung]');
  await page.click('#entry-page [name=noiDung]');
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
    assert.equal(await page.$eval('#user-root .who span', (e) => e.textContent), 'Chỉ xem');
    assert.equal(await hien(page, '#btn-new'), 0, 'không có nút Ghi thu / chi');
    assert.equal(await hien(page, '#view [data-act=edit], #view [data-act=del], #view [data-act=dup]'), 0, 'không có nút sửa / xóa / nhân bản');
    const nav = await page.$$eval('#nav a', (as) => as.map((a) => a.dataset.route));
    assert.ok(!nav.includes('gop-ma') && !nav.includes('cp-nhap'), JSON.stringify(nav));
    await page.keyboard.press('F3');
    await page.dblclick('#view tr[data-id]');
    await settle(page);
    assert.equal(await page.locator('.modal, #entry-page').count(), 0, 'F2 / bấm đúp không mở form');
    await page.evaluate(() => { location.hash = '#/gop-ma'; });
    await page.waitForFunction(() => /không có quyền mở màn hình/.test(document.querySelector('#view').innerText));
    await page.evaluate(() => { location.hash = '#/cai-dat'; });
    await page.waitForSelector('#st-form');
    assert.equal(await page.locator('[data-act=restore], [data-act=reset], [data-act=backup-zip], [data-act=auth-tat]').count(), 0);
    assert.equal(await page.locator('[data-act=export-full]').count(), 1, 'vẫn xuất Excel được');
    // nhập Excel nằm ở màn riêng (menu Nhập liệu › Nhập từ Excel): Chỉ xem không có ô chọn file
    await page.evaluate(() => { location.hash = '#/nhap-excel'; });
    await page.waitForFunction(() => /không có quyền/.test(document.querySelector('#view').innerText));
    assert.equal(await page.locator('#imp-file').count(), 0, 'không có nhập Excel');
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
    await page.waitForSelector('#st-form');
    assert.equal(await page.locator('[data-act=restore], [data-act=reset], [data-act=auth-tat]').count(), 0);
    assert.equal(await page.locator('[data-act=backup-zip]').count(), 1, 'Kế toán tạo sao lưu được');
    await page.evaluate(() => { location.hash = '#/nhap-excel'; });
    await page.waitForSelector('#imp-file', { state: 'attached' });
    // Kế toán ghi một dòng bằng form
    await moFormGhi(page);
    await page.fill('#entry-page [name=noiDung]', 'kế toán ghi');
    await page.fill('#entry-page [name=chi]', '5000');
    await dienBatBuoc(page, 'NCC1', 'CT1');
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => !document.querySelector('#entry-page'));
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
    await page.waitForSelector('#user-root #btn-user');
    await page.waitForSelector('#view .sheet');
    assert.match(await page.$eval('#user-root', (e) => e.innerText), /<img src=x/, 'tên ở góc trên cũng hiện nguyên văn');
    assert.equal(await page.$$eval('#user-root img', (x) => x.length), 0);
    assert.equal(dialog, false);
    assert.deepEqual(loiThat(errors), []);
  } finally { await browser.close(); await srv.stop(); }
});

test('U3 hết phiên không mất dữ liệu: 2 phút trước khi hết hiện cảnh báo + nút "Tiếp tục làm việc" (gia hạn được); hết phiên giữa lúc đang gõ phiếu → hộp đăng nhập lại đè lên, Esc không đóng form, đăng nhập xong lưu đúng nội dung đã gõ; bấm lưu khi phiên đã hết → đăng nhập lại rồi tự gửi tiếp, không ghi trùng', { skip: SKIP, timeout: 240000 }, async () => {
  const dh = dongHo();
  const srv = await startServer({ seed: seed(), env: dh.env });
  const { cookie } = await batDangNhap(srv);
  const kt = await taoVaDangNhap(srv, cookie, 'ketoan1', 'ke-toan', 'kế toán mật khẩu 1');
  const { browser, page, errors } = await openPage(srv, '#/so-thu-chi', { clock: true });
  const PHUT = 60000;
  try {
    await dangNhapUI(page, 'ketoan1', 'kế toán mật khẩu 1');
    await page.waitForSelector('#view tr[data-id]');
    assert.equal(await page.locator('#phien-bar').count(), 0, 'chưa đến lúc cảnh báo');
    // đang gõ dở một dòng
    await moFormGhi(page);
    await page.fill('#entry-page [name=noiDung]', 'đang gõ dở khi hết phiên');
    await page.fill('#entry-page [name=chi]', '7000');
    await dienBatBuoc(page, 'NCC1', 'CT1');
    // 58 phút không thao tác (60 phút mới hết): cảnh báo, đếm ngược, nằm trên hộp thoại đang mở
    await page.clock.fastForward(58 * PHUT);
    await page.waitForSelector('#phien-bar[data-loai=cho]');
    assert.match(await page.$eval('#phien-bar', (e) => e.innerText), /Phiên đăng nhập sẽ hết sau [12]:\d\d/);
    await page.click('#phien-bar [data-act=tiep-tuc]');
    await page.waitForSelector('#phien-bar', { state: 'detached' });
    assert.equal(await page.locator('#entry-page [name=noiDung]').inputValue(), 'đang gõ dở khi hết phiên',
      'form vẫn còn — số hộp thoại: ' + (await page.locator('#entry-page').count()) + ', dòng đã ghi: ' + JSON.stringify(readStored(srv.dataDir).entries.map((x) => x.noiDung)));
    // không thao tác tiếp 61 phút (cả máy chủ và trình duyệt): hết phiên thật
    dh.tien(61 * PHUT);
    await page.clock.fastForward(61 * PHUT);
    await page.waitForSelector('#auth-root .auth-screen.lai #dn-form');
    assert.match(await page.$eval('#auth-root', (e) => e.innerText), /Dữ liệu bạn đang nhập vẫn còn nguyên/);
    await page.press('#dn-form [name=mk]', 'Escape');
    assert.equal(await page.locator('#entry-page [name=noiDung]').count(), 1, 'Esc trên hộp đăng nhập lại không đóng form bên dưới');
    assert.equal(await page.locator('#entry-page [name=noiDung]').inputValue(), 'đang gõ dở khi hết phiên');
    assert.equal(await page.locator('#dn-form [name=ten]').inputValue(), 'ketoan1', 'điền sẵn tên');
    await page.fill('#dn-form [name=mk]', 'kế toán mật khẩu 1');
    await page.press('#dn-form [name=mk]', 'Enter');
    await page.waitForSelector('#auth-root .auth-screen', { state: 'detached' });
    await page.click('#entry-page [data-act=save]');
    await page.waitForFunction(() => !document.querySelector('#entry-page'));
    let rows = readStored(srv.dataDir).entries.filter((x) => x.noiDung === 'đang gõ dở khi hết phiên');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].chi, 7000);
    assert.equal(rows[0].nguoiTao, String(kt.id));
    // phiên hết mà trình duyệt chưa biết (máy ngủ...): bấm lưu → 401 → đăng nhập lại → tự gửi tiếp đúng một lần
    await moFormGhi(page);
    await page.fill('#entry-page [name=noiDung]', 'lưu khi phiên đã hết');
    await page.fill('#entry-page [name=chi]', '8000');
    await dienBatBuoc(page, 'NCC1', 'CT1');
    dh.tien(61 * PHUT);
    await page.click('#entry-page [data-act=save]');
    await page.waitForSelector('#auth-root .auth-screen.lai #dn-form');
    await page.fill('#dn-form [name=mk]', 'kế toán mật khẩu 1');
    await page.press('#dn-form [name=mk]', 'Enter');
    await page.waitForFunction(() => !document.querySelector('#entry-page') && !document.querySelector('#auth-root .auth-screen'));
    rows = readStored(srv.dataDir).entries.filter((x) => x.noiDung === 'lưu khi phiên đã hết');
    assert.equal(rows.length, 1, 'ghi đúng một lần');
    assert.equal(rows[0].chi, 8000);
    assert.deepEqual(loiThat(errors), []);
  } finally { await browser.close(); await srv.stop(); }
});
