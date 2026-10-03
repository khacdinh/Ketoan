'use strict';
/* D+F. Chức năng chi phí công trình qua giao diện thật (Chromium): phiếu nhập chỉ bằng bàn phím, sửa/xóa/nhân bản, danh mục, sổ, báo cáo, công nợ */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { KT, startServer, readJsonFile, orphanErrors } = require('./helpers');
const { SKIP, openPage, settle, num, pick, chonCongTrinh, chonKy } = require('./ui-helpers');

const V2 = path.join(__dirname, 'fixtures', 'ketoan-v2-hien-tai.json');
const key = (s) => String(s || '').trim().toLowerCase();

async function seed(srv) {
  await srv.ok('POST', '/api/projects', { ma: 'CT1', ten: 'Công trình 1' });
  await srv.ok('POST', '/api/projects', { ma: 'CT2', ten: 'Công trình 2' });
  await srv.ok('POST', '/api/houses', { ma: 'NHA1', ten: 'Nhà 1', maCT: 'CT1' });
  await srv.ok('POST', '/api/houses', { ma: 'CHUNG1', ten: 'Dùng chung CT1', maCT: 'CT1', chung: true });
  for (const s of ['S1', 'S2']) await srv.ok('POST', '/api/suppliers', { ma: s, ten: 'Nhà cung cấp ' + s });
  const db = await srv.db();
  const hm = (t) => db.costItems.find((i) => i.ten === t).ma;
  await srv.ok('POST', '/api/materials', { ma: 'XM', ten: 'Xi măng', dvt: 'bao', maHM: hm('Vật tư VLXD') });
  await srv.ok('POST', '/api/materials', { ma: 'CAT', ten: 'Cát xây', dvt: 'm3', maHM: hm('Vật tư VLXD') });
  return hm;
}

const type = async (page, text) => { await page.keyboard.type(text, { delay: 8 }); };
const active = (page) => page.evaluate(() => { const e = document.activeElement; return e ? { name: e.name || '', col: e.dataset && e.dataset.col || '', row: e.dataset && e.dataset.row || '', tag: e.tagName, cls: e.className } : null; });
const toast = (page) => page.$eval('#toast-root', (t) => t.textContent);

test('F1 phiếu nhập chi phí: nhập toàn bộ bằng bàn phím (Enter sang ô kế, tự thêm dòng, tự điền tên VT / ĐVT / thành tiền, Ctrl+Enter lưu)', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({});
  const hm = await seed(srv);
  const { browser, page, errors } = await openPage(srv, '#/cp-nhap');
  try {
    await page.waitForSelector('#cp-head');
    await page.waitForTimeout(150);
    // tiêu điểm ban đầu: ô ngày
    assert.ok((await active(page)).cls.includes('date-text'), 'tiêu điểm phải ở ô Ngày');
    await page.keyboard.press('Control+A'); await type(page, '15/9'); await page.keyboard.press('Tab');
    assert.equal(await page.inputValue('#cp-head input[name=ngay]'), new Date().getFullYear() + '-09-15');
    assert.equal((await active(page)).name, 'maCT', 'Tab từ ngày sang công trình');
    await type(page, 'CT1'); await page.keyboard.press('Enter');
    assert.equal((await active(page)).name, 'maNha');
    assert.match(await page.$eval('#cp-head input[name=maNha]', (e) => e.value), /CHUNG1/, 'tự điền nhà dùng chung của công trình');
    await page.keyboard.press('Control+A'); await type(page, 'NHA1'); await page.keyboard.press('Enter');
    assert.equal((await active(page)).name, 'maNCC');
    await type(page, 'S1'); await page.keyboard.press('Enter');
    assert.equal((await active(page)).name, 'soPhieu');
    await type(page, 'GH-77'); await page.keyboard.press('Enter');
    assert.equal((await active(page)).name, 'hm');
    await type(page, 'Vật tư VLXD'); await page.keyboard.press('Enter');
    let a = await active(page);
    assert.deepEqual([a.col, a.row], ['maVT', '0'], 'Enter ở ô cuối đầu phiếu nhảy xuống dòng hàng đầu tiên');
    // dòng 1: XM — tự điền tên, ĐVT
    await type(page, 'XM'); await page.keyboard.press('Enter');
    assert.equal(await page.$eval('tr[data-row="0"] .vt-name', (e) => e.textContent.trim()), 'Xi măng');
    assert.equal(await page.$eval('tr[data-row="0"] .vt-dvt', (e) => e.textContent.trim()), 'bao');
    assert.equal((await active(page)).col, 'dienGiai');
    await page.keyboard.press('Enter');
    assert.equal((await active(page)).col, 'soLuong');
    await type(page, '2,5'); await page.keyboard.press('Enter');
    assert.equal((await active(page)).col, 'donGia');
    await type(page, '1.250.000'); await page.keyboard.press('Enter');
    a = await active(page);
    assert.deepEqual([a.col, a.row], ['maVT', '1'], 'Enter ở ô đơn giá sang dòng kế tiếp');
    assert.equal(await page.inputValue('tr[data-row="0"] [data-col=thanhTien]'), '3.125.000');
    // dòng 2
    await type(page, 'CAT'); await page.keyboard.press('Enter');
    await type(page, 'cát vàng'); await page.keyboard.press('Enter');
    await type(page, '0,125'); await page.keyboard.press('Enter');
    await type(page, '8000'); await page.keyboard.press('Enter');
    assert.equal(await page.inputValue('tr[data-row="1"] [data-col=thanhTien]'), '1.000');
    // dòng 3: không mã VT, nhân công, SL là phép tính, đơn giá kiểu 300k
    await page.keyboard.press('Enter'); // bỏ qua mã VT
    await type(page, 'Công thợ hồ'); await page.keyboard.press('Enter');
    await type(page, '10+5'); await page.keyboard.press('Enter');
    await type(page, '300k');
    // đổi hạng mục riêng của dòng 3 bằng bàn phím: Tab qua ô Thành tiền (đã tự tính) sang ô hạng mục riêng
    await page.keyboard.press('Tab');
    assert.equal((await active(page)).col, 'thanhTien');
    await page.keyboard.press('Tab');
    assert.equal((await active(page)).col, 'hm');
    await type(page, 'Nhân công thợ nề'); await page.keyboard.press('Tab');
    assert.equal((await active(page)).col, 'loaiCP');
    // kiểm tra tổng trước khi lưu
    assert.equal(await page.inputValue('tr[data-row="2"] [data-col=thanhTien]'), '4.500.000');
    assert.equal(await page.$eval('#cp-total', (e) => e.textContent.trim()), '7.626.000');
    assert.match(await page.$eval('#cp-total-label', (e) => e.textContent), /3 dòng/);
    assert.match(await page.$eval('#cp-words', (e) => e.textContent), /Bảy triệu sáu trăm hai mươi sáu nghìn đồng/);
    assert.ok(await page.locator('tr[data-row="3"]').count() === 1, 'luôn có một dòng trống ở cuối');
    // Loại CP tự động hiển thị loại tự xác định
    assert.match(await page.$eval('tr[data-row="2"] select[data-col=loaiCP] option', (e) => e.textContent), /Tự động: Nhân công/);
    // lưu bằng Ctrl+Enter
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => /Đã ghi 3 dòng/.test(document.querySelector('#toast-root').textContent), null, { timeout: 8000 });
    assert.match(await toast(page), /7\.626\.000/);
    let db = await srv.db();
    assert.equal(db.costs.length, 3);
    const by = (t) => db.costs.find((c) => (c.dienGiai || c.maVT) === t || c.maVT === t);
    assert.deepEqual([by('XM').soLuong, by('XM').donGia, by('XM').thanhTien, by('XM').maNha, by('XM').soPhieu, by('XM').maHM], [2.5, 1250000, 3125000, 'NHA1', 'GH-77', hm('Vật tư VLXD')]);
    assert.deepEqual([by('CAT').soLuong, by('CAT').thanhTien], [0.125, 1000]);
    assert.deepEqual([by('Công thợ hồ').soLuong, by('Công thợ hồ').thanhTien, by('Công thợ hồ').loaiCP, by('Công thợ hồ').maHM], [15, 4500000, 'Nhân công', hm('Nhân công thợ nề')]);
    assert.equal(new Set(db.costs.map((c) => c.phieuId)).size, 1, 'một phiếu');
    // sau khi lưu: giữ đầu phiếu, xóa số phiếu và các dòng, tiêu điểm về ô đầu tiên của dòng 1
    await page.waitForTimeout(200);
    assert.equal(await page.inputValue('#cp-head input[name=maCT]'), 'CT1');
    assert.equal(await page.inputValue('#cp-head input[name=maNCC]'), 'S1');
    assert.equal(await page.inputValue('#cp-head input[name=soPhieu]'), '');
    assert.equal(await page.locator('#cp-body input[data-col=maVT]').count(), 1, 'chỉ còn 1 dòng trống');
    a = await active(page);
    assert.deepEqual([a.col, a.row], ['maVT', '0']);
    // gợi ý đơn giá: lần mua gần nhất cùng NCC tự điền, gõ đè được
    await type(page, 'XM'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    assert.equal(await page.inputValue('tr[data-row="0"] [data-col=donGia]'), '1.250.000', 'tự điền giá lần mua gần nhất');
    assert.ok(await page.$eval('tr[data-row="0"] [data-col=donGia]', (e) => e.classList.contains('suggested')));
    await type(page, '1'); await page.keyboard.press('Enter');
    assert.equal((await active(page)).col, 'donGia');
    await type(page, '1300000'); // gõ đè (ô đã được chọn hết)
    assert.equal(await page.inputValue('tr[data-row="0"] [data-col=donGia]'), '1300000');
    assert.ok(!(await page.$eval('tr[data-row="0"] [data-col=donGia]', (e) => e.classList.contains('suggested'))), 'gõ đè thì hết dấu gợi ý');
    // mũi tên ↑ ↓ đổi dòng (giữ cột)
    await page.keyboard.press('Enter'); // sang dòng 2
    a = await active(page); assert.deepEqual([a.col, a.row], ['maVT', '1']);
    // ô Mã VT có danh sách gợi ý: ↑ ↓ thuộc về danh sách, đổi dòng bằng Ctrl + ↑ ↓; ô Số lượng không có danh sách: ↑ ↓ đổi dòng ngay
    await page.keyboard.press('Control+ArrowUp');
    a = await active(page); assert.deepEqual([a.col, a.row], ['maVT', '0']);
    await page.keyboard.press('Control+ArrowDown');
    a = await active(page); assert.deepEqual([a.col, a.row], ['maVT', '1']);
    await page.keyboard.press('Control+ArrowUp');
    await page.focus('tr[data-row="0"] [data-col=soLuong]');
    await page.keyboard.press('ArrowDown');
    a = await active(page); assert.deepEqual([a.col, a.row], ['soLuong', '1']);
    await page.keyboard.press('ArrowUp');
    a = await active(page); assert.deepEqual([a.col, a.row], ['soLuong', '0']);
    // lưu hai lần liên tiếp rất nhanh: chỉ một phiếu được ghi
    await page.keyboard.press('Control+Enter');
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => /Đã ghi 1 dòng/.test(document.querySelector('#toast-root').textContent), null, { timeout: 8000 });
    await page.waitForTimeout(500);
    db = await srv.db();
    assert.equal(db.costs.length, 4, 'bấm lưu hai lần chỉ được ghi một lần');
    assert.equal(db.costs.find((c) => c.donGia === 1300000).soLuong, 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('F1b phiếu nhập: kiểm tra dữ liệu bằng bàn phím (báo lỗi, đưa tiêu điểm đến đúng ô), thêm nhanh mã mới ngay trong form, bản nháp còn sau khi chuyển màn hình', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({});
  await seed(srv);
  const { browser, page, errors } = await openPage(srv, '#/cp-nhap');
  try {
    await page.waitForSelector('#cp-head');
    await page.waitForTimeout(150);
    // lưu khi chưa nhập gì
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => /Chọn công trình/.test(document.querySelector('#toast-root').textContent), null, { timeout: 4000 });
    assert.equal((await active(page)).name, 'maCT', 'tiêu điểm về ô lỗi');
    await type(page, 'CT1'); await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => /Chọn nhà cung cấp/.test(document.querySelector('#toast-root').textContent), null, { timeout: 4000 });
    assert.equal((await active(page)).name, 'maNCC');
    // NCC chưa có: gợi ý thêm nhanh
    await type(page, 'NCC_MOI'); await page.keyboard.press('Tab');
    await page.waitForSelector('#cp-head [data-act=add-ncc]');
    await page.click('#cp-head [data-act=add-ncc]');
    await page.waitForSelector('#modal-root form');
    await page.waitForTimeout(150);
    assert.equal(await page.inputValue('#modal-root input[name=ma]'), 'NCC_MOI', 'mã đã gõ được điền sẵn');
    await page.fill('#modal-root input[name=ten]', 'Nhà cung cấp mới');
    await page.keyboard.press('Enter'); // lưu bằng Enter
    await page.waitForSelector('#modal-root form', { state: 'detached' });
    await page.waitForTimeout(300);
    assert.equal(await page.inputValue('#cp-head input[name=maNCC]'), 'NCC_MOI');
    assert.ok((await srv.db()).suppliers.some((s) => s.ma === 'NCC_MOI' && s.ten === 'Nhà cung cấp mới'));
    // hạng mục chưa có: thêm nhanh
    await page.fill('#cp-head input[name=hm]', 'Hạng mục mới tinh');
    await page.locator('#cp-head input[name=hm]').dispatchEvent('change');
    // bấm thẳng vào liên kết khi ô vẫn còn tiêu điểm (sự kiện change thật xảy ra lúc rời ô) phải vẫn được
    await page.waitForSelector('#cp-head [data-act=add-hm]');
    await page.click('#cp-head [data-act=add-hm]');
    await page.waitForSelector('#modal-root form', { timeout: 5000 }).catch(async () => { await page.screenshot({ path: '/tmp/f1b-fail.png' }); throw new Error('không mở được hộp thêm hạng mục; toast: ' + (await toast(page)) + ' lỗi trang: ' + JSON.stringify(errors)); });
    await page.waitForTimeout(150);
    // ô Thuộc nhóm là ô gõ tìm: chọn nhóm thứ hai trong gợi ý
    await page.focus('#modal-root input[name=maNhom]'); await page.keyboard.press('ArrowDown');
    await page.fill('#modal-root input[name=maNhom]', await page.$eval('#modal-root .combo-list', (ul) => ul.querySelectorAll('.combo-opt b')[1].textContent));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#modal-root form', { state: 'detached' });
    await page.waitForTimeout(300);
    assert.ok((await srv.db()).costItems.some((i) => i.ten === 'Hạng mục mới tinh'));
    // mã vật tư chưa có: thêm nhanh rồi tiêu điểm sang số lượng
    await page.focus('#cp-body [data-row="0"][data-col=maVT]');
    await type(page, 'VT_MOI'); await page.keyboard.press('Tab');
    await page.waitForSelector('#cp-body [data-act=add-vt]');
    assert.match(await page.$eval('tr[data-row="0"] .vt-name', (e) => e.textContent), /Chưa có mã này/);
    await page.click('#cp-body [data-act=add-vt]');
    await page.waitForSelector('#modal-root form');
    await page.waitForTimeout(150);
    await page.fill('#modal-root input[name=ten]', 'Vật tư mới thêm nhanh');
    await page.fill('#modal-root input[name=dvt]', 'cái');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#modal-root form', { state: 'detached' });
    await page.waitForTimeout(400);
    assert.equal(await page.inputValue('tr[data-row="0"] [data-col=maVT]'), 'VT_MOI');
    assert.equal((await active(page)).col, 'soLuong', 'sau khi thêm nhanh, tiêu điểm sang Số lượng');
    assert.equal(await page.$eval('tr[data-row="0"] .vt-dvt', (e) => e.textContent.trim()), 'cái');
    // nhập sai: SL = 0, SL âm, đơn giá trống
    await type(page, '0'); await page.keyboard.press('Enter'); await type(page, '1000');
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => /Dòng 1: Số lượng phải lớn hơn 0/.test(document.querySelector('#toast-root').textContent), null, { timeout: 4000 });
    let a = await active(page); assert.deepEqual([a.col, a.row], ['soLuong', '0']);
    assert.ok(await page.$eval('tr[data-row="0"] [data-col=soLuong]', (e) => e.classList.contains('invalid') || e.classList.contains('bad')));
    await page.keyboard.press('Control+A'); await type(page, '-3'); await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => /Dòng 1: Số lượng phải lớn hơn 0/.test(document.querySelector('#toast-root').textContent), null, { timeout: 4000 });
    await page.keyboard.press('Control+A'); await type(page, '2'); await page.keyboard.press('Enter'); await page.keyboard.press('Control+A'); await page.keyboard.press('Delete');
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => /thiếu Đơn giá/.test(document.querySelector('#toast-root').textContent), null, { timeout: 4000 });
    a = await active(page); assert.deepEqual([a.col, a.row], ['donGia', '0']);
    assert.equal((await srv.db()).costs.length, 0, 'không có dòng nào được lưu khi còn lỗi');
    // bản nháp: rời màn hình rồi quay lại vẫn còn
    await type(page, '5k');
    await page.evaluate(() => { location.hash = '#/cp-so'; });
    await page.waitForSelector('#cl-body');
    await page.evaluate(() => { location.hash = '#/cp-nhap'; });
    await page.waitForSelector('#cp-head');
    await page.waitForTimeout(200);
    assert.equal(await page.inputValue('tr[data-row="0"] [data-col=maVT]'), 'VT_MOI', 'bản nháp phải còn');
    assert.equal(await page.inputValue('tr[data-row="0"] [data-col=donGia]'), '5.000');
    assert.equal(await page.inputValue('#cp-head input[name=maNCC]'), 'NCC_MOI');
    // lưu thành công sau khi sửa xong, nháp bị xóa
    await page.focus('tr[data-row="0"] [data-col=donGia]');
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => /Đã ghi 1 dòng/.test(document.querySelector('#toast-root').textContent), null, { timeout: 6000 });
    await page.evaluate(() => { location.hash = '#/cp-so'; location.hash = '#/cp-nhap'; });
    await page.waitForTimeout(300);
    assert.equal(await page.inputValue('tr[data-row="0"] [data-col=maVT]'), '', 'sau khi lưu không còn nháp cũ');
    assert.deepEqual(errors.filter((e) => !/status of 400/.test(e)), []);
  } finally { await browser.close(); await srv.stop(); }
});

test('F1c phiếu nhập: dòng chỉ có Thành tiền (khoán, không SL / ĐG); SL + Thành tiền tự tính Đơn giá; sửa Thành tiền trong sổ và trong form sửa dòng', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({});
  const hm = await seed(srv);
  const { browser, page, errors } = await openPage(srv, '#/cp-nhap');
  try {
    await page.waitForSelector('#cp-head');
    await page.waitForTimeout(150);
    await page.fill('#cp-head input[name=maCT]', 'CT1');
    await page.fill('#cp-head input[name=maNCC]', 'S1');
    await page.fill('#cp-head input[name=hm]', 'Nhân công thợ nề');
    await page.dispatchEvent('#cp-head input[name=hm]', 'change');
    // dòng 1: khoán — Enter qua Số lượng, Đơn giá để trống, gõ Thành tiền
    await page.focus('#cp-body [data-row="0"][data-col=dienGiai]');
    await type(page, 'Khoán nhân công đợt 1'); await page.keyboard.press('Enter');
    assert.equal((await active(page)).col, 'soLuong'); await page.keyboard.press('Enter');
    assert.equal((await active(page)).col, 'donGia'); await page.keyboard.press('Enter');
    let a = await active(page);
    assert.deepEqual([a.col, a.row], ['thanhTien', '0'], 'Đơn giá trống: Enter sang ô Thành tiền');
    await type(page, '12tr'); await page.keyboard.press('Enter');
    a = await active(page);
    assert.deepEqual([a.col, a.row], ['maVT', '1'], 'Enter ở Thành tiền sang dòng sau');
    assert.equal(await page.inputValue('tr[data-row="0"] [data-col=thanhTien]'), '12.000.000');
    assert.equal(await page.$eval('#cp-total', (e) => e.textContent.trim()), '12.000.000');
    // dòng 2: Số lượng + Thành tiền → Đơn giá tự tính
    await page.keyboard.press('Enter');
    await type(page, 'Công phụ'); await page.keyboard.press('Enter');
    await type(page, '4'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    assert.equal((await active(page)).col, 'thanhTien');
    await type(page, '1.000.000');
    assert.equal(await page.inputValue('tr[data-row="1"] [data-col=donGia]'), '250.000');
    // đổi Số lượng: Đơn giá tính lại, Thành tiền đã gõ giữ nguyên
    await page.focus('#cp-body [data-row="1"][data-col=soLuong]');
    await page.keyboard.press('Control+A'); await type(page, '5');
    assert.equal(await page.inputValue('tr[data-row="1"] [data-col=donGia]'), '200.000');
    assert.equal(await page.inputValue('tr[data-row="1"] [data-col=thanhTien]'), '1.000.000');
    // dòng 3: SL × ĐG như cũ, Thành tiền tự tính; không chia chẵn → Đơn giá để máy chủ tính tới 0,01
    await page.focus('#cp-body [data-row="2"][data-col=dienGiai]');
    await type(page, 'Công lẻ'); await page.keyboard.press('Enter');
    await type(page, '3'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    await type(page, '160.000');
    assert.equal(await page.inputValue('tr[data-row="2"] [data-col=donGia]'), '');
    assert.equal(await page.$eval('#cp-total', (e) => e.textContent.trim()), '13.160.000');
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => /Đã ghi 3 dòng/.test(document.querySelector('#toast-root').textContent), null, { timeout: 5000 });
    const got = (await srv.db()).costs.map((c) => [c.dienGiai, c.soLuong, c.donGia, c.thanhTien]);
    // dòng khoán: SL, ĐG để trống (không tự gán SL 1 × ĐG = Thành tiền)
    assert.deepEqual(got, [['Khoán nhân công đợt 1', null, null, 12000000], ['Công phụ', 5, 200000, 1000000], ['Công lẻ', 3, 53333.33, 160000]]);
    // sổ chi phí: bấm đúp ô Thành tiền của dòng khoán
    await page.evaluate(() => { location.hash = '#/cp-so'; });
    await page.waitForSelector('#cl-body tr[data-id]');
    const rowOf = (text) => page.locator('#cl-body tr[data-id]', { hasText: text });
    assert.equal((await rowOf('Khoán nhân công').locator('[data-edit=donGia]').innerText()).trim(), 'theo khoản');
    await rowOf('Khoán nhân công').locator('[data-edit=thanhTien]').dblclick();
    await page.waitForSelector('#cl-body input.inline-cell');
    await page.keyboard.press('Control+A'); await type(page, '12,5tr'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => /Đã lưu/.test(document.querySelector('#toast-root').textContent), null, { timeout: 5000 });
    await settle(page);
    let k = (await srv.db()).costs.find((c) => c.dienGiai === 'Khoán nhân công đợt 1');
    assert.deepEqual([k.soLuong, k.donGia, k.thanhTien], [null, null, 12500000]);
    // xóa trống ô Số lượng của dòng SL × ĐG → thành dòng khoán, giữ Thành tiền
    await rowOf('Công lẻ').locator('[data-edit=soLuong]').dblclick();
    await page.waitForSelector('#cl-body input.inline-cell');
    await page.keyboard.press('Control+A'); await page.keyboard.press('Delete'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => /Đã lưu/.test(document.querySelector('#toast-root').textContent), null, { timeout: 5000 });
    await settle(page);
    k = (await srv.db()).costs.find((c) => c.dienGiai === 'Công lẻ');
    assert.deepEqual([k.soLuong, k.donGia, k.thanhTien], [null, null, 160000]);
    // form sửa dòng: xóa Số lượng, Đơn giá, chỉ nhập Thành tiền → dòng thành khoán
    await rowOf('Công phụ').locator('[data-act=edit]').click();
    await page.waitForSelector('#cl-form'); await page.waitForTimeout(200);
    await page.fill('#cl-form input[name=soLuong]', '');
    await page.fill('#cl-form input[name=donGia]', '');
    await page.fill('#cl-form input[name=thanhTien]', '1.100.000');
    await page.click('[data-act=save]');
    await page.waitForSelector('#cl-form', { state: 'detached' });
    await settle(page);
    k = (await srv.db()).costs.find((c) => c.dienGiai === 'Công phụ');
    assert.deepEqual([k.soLuong, k.donGia, k.thanhTien], [null, null, 1100000]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('F2 phiếu đã nhập: sửa, nhân bản, xóa phiếu và xóa từng dòng qua giao diện; báo cáo, công nợ cập nhật ngay', { skip: SKIP, timeout: 240000 }, async () => {
  const srv = await startServer({});
  const hm = await seed(srv);
  try {
    const mk = (extra) => srv.ok('POST', '/api/cost-slips', { header: Object.assign({ ngay: '2026-09-10', maCT: 'CT1', maNha: 'NHA1', maNCC: 'S1', soPhieu: 'P1', maHM: hm('Vật tư VLXD') }, extra), lines: [
      { maVT: 'XM', soLuong: 10, donGia: 100000 }, { maVT: 'CAT', soLuong: 2, donGia: 500000 }] });
    const r1 = await mk({}); // 2.000.000
    await mk({ soPhieu: 'P2', ngay: '2026-09-12', maNCC: 'S2' }); // 2.000.000
    const { browser, page, errors } = await openPage(srv, '#/cp-nhap?phieu=' + r1.phieuId);
    try {
      await page.waitForSelector('#cp-body tr[data-row]');
      await page.waitForTimeout(200);
      // nạp đúng dữ liệu phiếu
      assert.equal(await page.inputValue('#cp-head input[name=maNCC]'), 'S1');
      assert.equal(await page.inputValue('#cp-head input[name=soPhieu]'), 'P1');
      assert.equal(await page.inputValue('tr[data-row="0"] [data-col=maVT]'), 'XM');
      assert.equal(await page.inputValue('tr[data-row="0"] [data-col=soLuong]'), '10');
      assert.equal(await page.$eval('#cp-total', (e) => e.textContent.trim()), '2.000.000');
      // sửa số lượng dòng 1 và xóa dòng 2 bằng Ctrl+Delete; lưu
      await page.fill('tr[data-row="0"] [data-col=soLuong]', '12');
      await page.locator('tr[data-row="0"] [data-col=soLuong]').dispatchEvent('change');
      await page.focus('tr[data-row="1"] [data-col=maVT]');
      await page.keyboard.press('Control+Delete');
      await page.waitForTimeout(100);
      assert.equal(await page.$eval('#cp-total', (e) => e.textContent.trim()), '1.200.000');
      await page.keyboard.press('Control+Enter');
      await page.waitForFunction(() => /Đã lưu phiếu: 1 dòng/.test(document.querySelector('#toast-root').textContent), null, { timeout: 6000 });
      let db = await srv.db();
      assert.equal(db.costs.filter((c) => c.phieuId === r1.phieuId).length, 1);
      let D = KT.supplierDebt(db, {});
      assert.equal(D.rows.find((r) => r.ma === 'S1').phatSinh, 1200000, 'công nợ S1 cập nhật sau khi sửa phiếu');
      assert.equal(KT.costSummary(db, {}, KT.buildCostLedger(db)).total, 3200000);
      // nhân bản phiếu còn lại bằng liên kết trong danh sách
      await page.evaluate(() => { location.hash = '#/cp-nhap'; });
      await page.waitForSelector('#rc-body tr[data-phieu]');
      await page.locator('#rc-body tr', { hasText: 'P2' }).locator('a[href*="nhanban"]').click();
      await page.waitForSelector('#cp-body tr[data-row]');
      await page.waitForTimeout(200);
      assert.equal(await page.inputValue('#cp-head input[name=soPhieu]'), '', 'nhân bản: số phiếu để trống');
      assert.equal(await page.inputValue('#cp-head input[name=maNCC]'), 'S2');
      assert.equal(await page.inputValue('#cp-head input[name=ngay]'), KT.todayISO(), 'nhân bản: ngày là hôm nay');
      await page.focus('tr[data-row="0"] [data-col=maVT]');
      await page.keyboard.press('Control+Enter');
      await page.waitForFunction(() => /Đã ghi 2 dòng/.test(document.querySelector('#toast-root').textContent), null, { timeout: 6000 });
      db = await srv.db();
      assert.equal(db.costs.length, 5);
      assert.equal(KT.supplierDebt(db, {}).rows.find((r) => r.ma === 'S2').phatSinh, 4000000);
      // xóa phiếu từ danh sách (hủy rồi đồng ý)
      await page.waitForSelector('#rc-body tr[data-phieu]');
      const before = await page.locator('#rc-body tr[data-phieu]').count();
      await page.locator('#rc-body tr[data-phieu]').first().locator('[data-rc=del]').click();
      await page.click('[data-act=no]');
      assert.equal((await srv.db()).costs.length, 5, 'hủy thì không xóa');
      await page.locator('#rc-body tr[data-phieu]').first().locator('[data-rc=del]').click();
      await page.click('[data-act=yes]');
      await page.waitForFunction((n) => document.querySelectorAll('#rc-body tr[data-phieu]').length === n - 1, before, { timeout: 6000 });
      db = await srv.db();
      assert.equal(db.costs.length, 3);
      assert.deepEqual(orphanErrors(db), []);
      const D2 = KT.supplierDebt(db, {});
      assert.equal(D2.totalAll.phatSinh, db.costs.reduce((t, c) => t + c.thanhTien, 0));
      // xóa phiếu từ màn sửa
      const p2 = db.costs[0].phieuId;
      await page.evaluate((id) => { location.hash = '#/cp-nhap?phieu=' + id; }, p2);
      await page.waitForSelector('[data-act=del-slip]');
      await page.click('[data-act=del-slip]');
      await page.click('[data-act=yes]');
      await page.waitForFunction(() => /Đã xóa phiếu/.test(document.querySelector('#toast-root').textContent), null, { timeout: 6000 });
      assert.equal((await srv.db()).costs.filter((c) => c.phieuId === p2).length, 0);
      // phiếu không tồn tại
      await page.evaluate(() => { location.hash = '#/cp-nhap?phieu=99999999'; });
      await page.waitForFunction(() => /Không tìm thấy phiếu này/.test(document.querySelector('#view').innerText), null, { timeout: 4000 });
      assert.deepEqual(errors.filter((e) => !/status of 4/.test(e)), []);
    } finally { await browser.close(); }
  } finally { await srv.stop(); }
});

/* ---------------- Sổ chi phí ---------------- */

const clearFilters = async (page) => { if (await page.locator('#cl-clear').isVisible()) await page.click('#cl-clear'); await settle(page); };
const dateBox = (page, id) => page.locator('#' + id).locator('xpath=..').locator('.date-text');

test('F3 sổ chi phí: lọc theo kỳ, công trình, nhà, nhóm, hạng mục, loại CP, NCC, vật tư, kết hợp nhiều bộ lọc và tìm kiếm; số dòng, tổng cuối bảng, tổng các dòng đang hiện luôn khớp', { skip: SKIP, timeout: 300000 }, async () => {
  const srv = await startServer({ seed: V2 });
  const db = readJsonFile(V2);
  const led = KT.buildCostLedger(db);
  const { browser, page, errors } = await openPage(srv, '#/cp-so');
  try {
    await page.waitForSelector('#cl-body tr[data-id]');
    const read = async () => {
      await settle(page);
      const n = await page.locator('#cl-body tr[data-id]').count();
      const foot = await page.$eval('#cl-foot', (e) => e.innerText);
      const shownSum = (await page.$$eval('#cl-body tr[data-id] td:nth-child(8)', (tds) => tds.map((t) => t.textContent))).reduce((t, s) => t + num(s), 0);
      const count = await page.$eval('#cl-count', (e) => e.innerText);
      const ft = await page.$$eval('#cl-foot td.num.money .dbl', (els) => els.map((x) => x.textContent));
      return { n, footTotal: ft.length ? num(ft[ft.length - 1]) : NaN, shownSum, count, foot };
    };
    const expectFor = (f) => { const r = KT.filterCosts(led, f); return { n: r.rows.length, total: r.total }; };
    const steps = [
      ['kỳ 6/2026', async () => { await chonKy(page, 'cl', 'khoang', '1/6/2026', '30/6/2026'); }, { from: '2026-06-01', to: '2026-06-30' }],
      ['+ công trình', async () => { await chonCongTrinh(page, db.costs[0].maCT); }, { from: '2026-06-01', to: '2026-06-30', ct: db.costs[0].maCT }],
      ['+ loại Vật tư', async () => { await page.selectOption('#cl-loai', 'Vật tư'); }, { from: '2026-06-01', to: '2026-06-30', ct: db.costs[0].maCT, loai: 'Vật tư' }],
      ['+ NCC', async () => { await pick(page, '#cl-ncc', 'NCC_VuongThinh'); }, { from: '2026-06-01', to: '2026-06-30', ct: db.costs[0].maCT, loai: 'Vật tư', ncc: 'NCC_VuongThinh' }],
      ['+ tìm "cát"', async () => { await page.fill('#cl-q', 'cát'); await page.waitForTimeout(350); }, { from: '2026-06-01', to: '2026-06-30', ct: db.costs[0].maCT, loai: 'Vật tư', ncc: 'NCC_VuongThinh', q: 'cát' }]
    ];
    const f = {};
    for (const [name, act, ff] of steps) {
      await act();
      const r = await read();
      const e = expectFor(ff);
      assert.equal(r.n, e.n, name + ': số dòng hiện');
      assert.equal(r.footTotal, e.total, name + ': tổng cuối bảng');
      assert.equal(r.shownSum, e.total, name + ': cộng các dòng đang hiện');
      assert.ok(r.count.includes(String(e.n)), name + ': câu "N dòng khớp" ' + r.count);
    }
    // bỏ lọc rồi lọc riêng từng tiêu chí (công trình chọn ở thanh trên)
    await page.click('#cl-clear');
    await chonCongTrinh(page, '');
    await settle(page);
    const single = [['#tb-ct', 'ct', db.costs[5].maCT], ['#cl-nha', 'nha', db.costs[5].maNha], ['#cl-nhom', 'nhom', db.costGroups[1].ma], ['#cl-loai', 'loai', 'Nhân công'], ['#cl-ncc', 'ncc', db.costs[9].maNCC], ['#cl-vt', 'vt', db.costs[3].maVT]];
    for (const [sel, k, v] of single) {
      await clearFilters(page);
      await chonCongTrinh(page, '');
      if (sel === '#cl-nha') await chonCongTrinh(page, db.costs[5].maCT); // ô nhà chỉ gợi ý nhà của công trình đang chọn
      await (sel === '#tb-ct' ? chonCongTrinh(page, v) : ['#cl-loai'].includes(sel) ? page.selectOption(sel, v) : pick(page, sel, v));
      await settle(page);
      const e = expectFor(sel === '#cl-nha' ? { ct: db.costs[5].maCT, nha: v } : { [k]: v });
      const r = await read();
      assert.equal(r.n, Math.min(e.n, 500), sel + ' số dòng');
      assert.equal(r.footTotal, e.total, sel + ' tổng');
    }
    // hạng mục (chọn sau khi chọn nhóm)
    await clearFilters(page);
    await chonCongTrinh(page, '');
    const hmItem = db.costItems.find((i) => db.costs.some((c) => c.maHM === i.ma));
    await pick(page, '#cl-nhom', hmItem.maNhom); await settle(page);
    await pick(page, '#cl-hm', hmItem.ma); await settle(page);
    const eh = expectFor({ nhom: hmItem.maNhom, hm: hmItem.ma });
    const rh = await read();
    assert.equal(rh.footTotal, eh.total); assert.equal(rh.n, eh.n);
    // không có dòng nào khớp
    await page.fill('#cl-q', 'không có gì khớp zzzqqq'); await page.waitForTimeout(350);
    assert.match(await page.$eval('#cl-body', (e) => e.innerText), /Không có dòng nào khớp/);
    assert.equal(await page.locator('#cl-foot tr').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('F3b sổ chi phí: sửa trực tiếp trong bảng (bấm đúp), sửa đủ cột, nhân bản, xóa; tổng và công nợ cập nhật ngay; nhập sai bị từ chối', { skip: SKIP, timeout: 300000 }, async () => {
  const srv = await startServer({});
  const hm = await seed(srv);
  const r = await srv.ok('POST', '/api/cost-slips', { header: { ngay: '2026-09-10', maCT: 'CT1', maNha: 'NHA1', maNCC: 'S1', soPhieu: 'P1', maHM: hm('Vật tư VLXD') }, lines: [{ maVT: 'XM', soLuong: 10, donGia: 100000 }, { dienGiai: 'Phí xe', soLuong: 1, donGia: 500000 }] });
  const { browser, page, errors } = await openPage(srv, '#/cp-so');
  try {
    await page.waitForSelector('#cl-body tr[data-id]');
    const rowOf = (text) => page.locator('#cl-body tr[data-id]', { hasText: text });
    const debtS1 = async () => KT.supplierDebt(await srv.db(), {}).rows.find((x) => x.ma === 'S1').phatSinh;
    assert.equal(await debtS1(), 1500000);
    // bấm đúp ô Số lượng: sửa thành 12 → thành tiền = 1.200.000, tổng 1.700.000
    await rowOf('XM').locator('[data-edit=soLuong]').dblclick();
    await page.waitForSelector('#cl-body input.inline-cell');
    await page.keyboard.press('Control+A'); await type(page, '12'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => /Đã lưu/.test(document.querySelector('#toast-root').textContent), null, { timeout: 5000 });
    await settle(page);
    assert.equal(await debtS1(), 1700000);
    assert.match(await page.$eval('#cl-foot', (e) => e.innerText), /1\.700\.000/);
    // bấm đúp ô Đơn giá: nhập sai → báo lỗi, giữ nguyên
    await rowOf('XM').locator('[data-edit=donGia]').dblclick();
    await page.keyboard.press('Control+A'); await type(page, 'abc'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => /Đơn giá không hợp lệ/.test(document.querySelector('#toast-root').textContent), null, { timeout: 5000 });
    await page.keyboard.press('Escape');
    assert.equal((await srv.db()).costs.find((c) => c.maVT === 'XM').donGia, 100000);
    // nhập đơn giá kiểu 50k hợp lệ
    await page.waitForTimeout(150);
    await rowOf('XM').locator('[data-edit=donGia]').dblclick();
    await page.keyboard.press('Control+A'); await type(page, '90k'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#cl-foot') && /1\.580\.000/.test(document.querySelector('#cl-foot').innerText), null, { timeout: 5000 });
    assert.equal(await debtS1(), 1580000);
    // sửa ô Diễn giải
    await rowOf('Phí xe').locator('[data-edit=dienGiai]').dblclick();
    await page.keyboard.press('Control+A'); await type(page, 'Phí xe cẩu "đặc biệt" <b>'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => /Phí xe cẩu/.test(document.querySelector('#cl-body').innerText), null, { timeout: 5000 });
    // sửa đủ cột: đổi NCC sang S2 → tách phiếu, công nợ chuyển sang S2
    await rowOf('Phí xe cẩu').locator('[data-act=edit]').click();
    await page.waitForSelector('#cl-form');
    await page.waitForTimeout(200);
    await page.fill('#cl-form input[name=maNCC]', 'S2');
    await page.click('[data-act=save]');
    await page.waitForSelector('#cl-form', { state: 'detached' });
    await settle(page);
    const d2 = KT.supplierDebt(await srv.db(), {}).rows;
    assert.equal(d2.find((x) => x.ma === 'S1').phatSinh, 1080000);
    assert.equal(d2.find((x) => x.ma === 'S2').phatSinh, 500000);
    // sửa với dữ liệu sai: hộp thoại không đóng
    await rowOf('Phí xe cẩu').locator('[data-act=edit]').click();
    await page.waitForSelector('#cl-form'); await page.waitForTimeout(200);
    await page.fill('#cl-form input[name=soLuong]', '0');
    await page.click('[data-act=save]');
    await page.waitForFunction(() => /Số lượng phải lớn hơn 0/.test(document.querySelector('#toast-root').textContent), null, { timeout: 4000 });
    await page.fill('#cl-form input[name=soLuong]', '1'); await page.fill('#cl-form input[name=maCT]', 'KHONG_CO');
    await page.click('[data-act=save]');
    await page.waitForFunction(() => /Công trình chưa có trong danh mục/.test(document.querySelector('#toast-root').textContent), null, { timeout: 4000 });
    await page.click('[data-act=cancel]');
    // nhân bản dòng (cùng phiếu) → tăng tổng; xóa dòng → giảm
    const n0 = (await srv.db()).costs.length;
    await rowOf('XM').locator('[data-act=dup]').click();
    await page.waitForFunction((n) => document.querySelectorAll('#cl-body tr[data-id]').length === n + 1, n0, { timeout: 5000 });
    assert.equal(await debtS1(), 1080000 + 1080000);
    await rowOf('XM').first().locator('[data-act=del]').click();
    await page.click('[data-act=yes]');
    await page.waitForFunction((n) => document.querySelectorAll('#cl-body tr[data-id]').length === n, n0, { timeout: 5000 });
    assert.equal(await debtS1(), 1080000);
    // mở cả phiếu từ dòng
    await rowOf('XM').locator('[data-act=slip]').click();
    await page.waitForFunction((id) => location.hash === '#/cp-nhap?phieu=' + id, r.phieuId, { timeout: 4000 });
    assert.deepEqual(errors.filter((e) => !/status of 4/.test(e)), []);
  } finally { await browser.close(); await srv.stop(); }
});

/* ---------------- Báo cáo ---------------- */

test('F4 Bảng điều khiển chi phí: số tổng, theo Loại CP, đã trả/còn nợ khớp; bung/thu gọn nhóm; đổi công trình; bấm hạng mục sang sổ đã lọc', { skip: SKIP, timeout: 300000 }, async () => {
  const srv = await startServer({ seed: V2 });
  const db = readJsonFile(V2);
  const { browser, page, errors } = await openPage(srv, '#/cp-tong-hop');
  try {
    await page.waitForSelector('.balance');
    const tileVal = async (label) => num(await page.locator('.stat', { hasText: label }).locator('.stat-value').first().innerText());
    const check = async (ct) => {
      const f = ct ? { ct } : {};
      const S = KT.costSummary(db, f, KT.buildCostLedger(db));
      const D = KT.supplierDebt(db, f);
      assert.equal(num(await page.$eval('.balance', (e) => e.firstChild.textContent)), S.total, 'tổng chi phí ' + ct);
      for (const l of KT.LOAI_CP) assert.equal(await tileVal(l), S.byLoai[l], l + ' ' + ct);
      assert.equal(await tileVal('Đã trả nhà cung cấp'), D.total.daTra, 'đã trả ' + ct);
      assert.equal(await tileVal('Dư Có (còn phải trả NCC)'), D.total.conNo, 'còn nợ ' + ct);
      // tổng cộng ở chân bảng nhóm = tổng; tổng các dòng nhóm = tổng
      assert.equal(num(await page.$eval('table.tree tfoot td.money', (e) => e.innerText)), S.total, 'chân bảng ' + ct);
      const groupTotals = await page.$$eval('tr[data-group] td.money .font-semibold', (els) => els.map((e) => e.textContent));
      assert.equal(groupTotals.reduce((t, s) => t + num(s), 0), S.total, 'tổng các nhóm ' + ct);
      // các tháng cộng lại = tổng
      const months = await page.$$eval('#th-months ~ div table tbody tr td:nth-child(2)', (els) => els.map((e) => e.textContent));
      assert.equal(months.reduce((t, s) => t + num(s), 0), S.total, 'tổng các tháng ' + ct);
    };
    await check('');
    // bung / thu gọn
    await page.click('[data-act=collapse]'); await settle(page);
    assert.equal(await page.locator('tr[data-item]').count(), 0, 'thu gọn: không còn hạng mục');
    await page.click('[data-act=expand]'); await settle(page);
    const nItems = await page.locator('tr[data-item]').count();
    assert.ok(nItems >= 9, 'bung hết: hạng mục hiện ' + nItems);
    await page.locator('tr[data-group]').first().click(); await settle(page);
    assert.ok(await page.locator('tr[data-item]').count() < nItems, 'bấm một nhóm thì thu gọn nhóm đó');
    // bàn phím: Enter trên nút bung/thu gọn của dòng nhóm (nút có aria-expanded cho trình đọc màn hình)
    await page.locator('tr[data-group] .tree-toggle').first().focus();
    await page.keyboard.press('Enter'); await settle(page);
    assert.equal(await page.locator('tr[data-item]').count(), nItems, 'Enter bung lại');
    // đổi công trình
    const ct = db.costs[0].maCT;
    await chonCongTrinh(page, ct); await settle(page);
    await check(ct);
    // bấm hạng mục → sổ chi phí lọc đúng hạng mục và công trình
    const item = await page.locator('tr[data-item]').first();
    const ma = await item.getAttribute('data-item');
    const expectN = KT.filterCosts(KT.buildCostLedger(db), { ct, hm: ma }).rows.length;
    await item.click();
    await page.waitForFunction(() => location.hash === '#/cp-so');
    await page.waitForSelector('#cl-body tr, #cl-body td');
    await settle(page);
    assert.ok((await page.textContent('#tb-ct-val')).startsWith(ct), 'công trình ở thanh trên');
    assert.equal(await page.$eval('#cl-hm', (e) => e.value), db.costItems.find((i) => i.ma === ma).ten, 'ô hạng mục hiện tên hạng mục');
    assert.equal(await page.locator('#cl-body tr[data-id]').count(), expectN);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('F5 Chi tiết theo nhóm: mức 1 / 2 / 3, cộng hạng mục, tổng nhóm, tổng cộng; các cấp khớp nhau và khớp sổ', { skip: SKIP, timeout: 300000 }, async () => {
  const srv = await startServer({ seed: V2 });
  const db = readJsonFile(V2);
  const S = KT.costSummary(db, {}, KT.buildCostLedger(db));
  const { browser, page, errors } = await openPage(srv, '#/cp-chi-tiet');
  try {
    await page.waitForSelector('#ct-body tr');
    const level = async (n) => { await page.check('input[name=ct-level][value="' + n + '"]', { force: true }); await settle(page); };
    const nGroups = S.groups.filter((g) => g.total || g.soDong).length;
    const nItems = [].concat(...S.groups.map((g) => g.items)).filter((i) => db.costs.some((c) => KT.keyOf(c.maHM) === KT.keyOf(i.ma))).length;
    await level(3);
    assert.equal(await page.locator('#ct-body tr.grp').count(), nGroups, 'mức 3: số nhóm');
    assert.equal(await page.locator('#ct-body tr.itm-sum').count(), nItems, 'mức 3: số dòng cộng hạng mục');
    assert.equal(await page.locator('#ct-body tr.dtl').count(), db.costs.length, 'mức 3: số dòng chi tiết = số dòng chi phí');
    const dtlSum = (await page.$$eval('#ct-body tr.dtl td:last-child', (t) => t.map((x) => x.textContent))).reduce((t, s) => t + num(s), 0);
    const itemSum = (await page.$$eval('#ct-body tr.itm-sum td:last-child', (t) => t.map((x) => x.textContent))).reduce((t, s) => t + num(s), 0);
    const grpSum = (await page.$$eval('#ct-body tr.grp td:last-child', (t) => t.map((x) => x.textContent))).reduce((t, s) => t + num(s), 0);
    const foot = num(await page.$eval('#ct-foot td:last-child', (e) => e.innerText));
    assert.deepEqual([dtlSum, itemSum, grpSum, foot], [S.total, S.total, S.total, S.total], 'tổng dòng = tổng hạng mục = tổng nhóm = tổng cộng');
    // từng nhóm: tổng hiện trên dòng nhóm = tổng các dòng chi tiết của nhóm
    const rows = await page.$$eval('#ct-body tr', (trs) => trs.map((t) => ({ cls: t.className.split(' ')[0], last: t.lastElementChild.textContent })));
    let cur = null; const acc = [];
    rows.forEach((r) => { if (r.cls === 'grp') { cur = { total: num(r.last), dtl: 0, items: 0 }; acc.push(cur); } else if (r.cls === 'dtl') cur.dtl += num(r.last); else if (r.cls === 'itm-sum') cur.items += num(r.last); });
    acc.forEach((g, i) => { assert.equal(g.dtl, g.total, 'nhóm #' + i + ' chi tiết'); assert.equal(g.items, g.total, 'nhóm #' + i + ' hạng mục'); });
    await level(2);
    assert.equal(await page.locator('#ct-body tr.dtl').count(), 0, 'mức 2: không có dòng chi tiết');
    assert.equal(await page.locator('#ct-body tr.itm-sum').count(), nItems);
    await level(1);
    assert.equal(await page.locator('#ct-body tr.itm-sum').count(), 0, 'mức 1: chỉ tổng nhóm');
    assert.equal(await page.locator('#ct-body tr.grp').count(), nGroups);
    // mở một nhóm ở mức 1 không được (mức 1 = chỉ tổng); quay lại mức 3 và thu gọn từng hạng mục
    await level(3);
    await page.locator('#ct-body tr.itm-sum').first().click(); await settle(page);
    assert.ok(await page.locator('#ct-body tr.dtl').count() < db.costs.length, 'thu gọn một hạng mục làm bớt dòng chi tiết');
    // lọc
    const ct = db.costs[0].maCT;
    await chonCongTrinh(page, ct); await settle(page);
    const Sf = KT.costSummary(db, { ct }, KT.buildCostLedger(db));
    assert.equal(num(await page.$eval('#ct-foot td:last-child', (e) => e.innerText)), Sf.total);
    await page.selectOption('#ct-loai', 'Nhân công'); await settle(page);
    const Sl = KT.costSummary(db, { ct, loai: 'Nhân công' }, KT.buildCostLedger(db));
    assert.equal(num(await page.$eval('#ct-foot td:last-child', (e) => e.innerText)), Sl.total);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('F6 Công nợ NCC theo kỳ: bảng Đầu kỳ / Phát sinh / Thanh toán / Cuối kỳ (Dư Nợ | Dư Có), tổng; dòng mở rộng; Trả tiền → phiếu chi điền sẵn → tất toán; sổ chi tiết; biên bản; theo công trình; liên thông Tổng quan', { skip: SKIP, timeout: 300000 }, async () => {
  const srv = await startServer({ seed: V2 });
  const db = readJsonFile(V2);
  const { browser, page, errors } = await openPage(srv, '#/cp-cong-no');
  try {
    await page.waitForSelector('#cn-table tbody tr[data-ma]');
    const P = KT.supplierPeriod(KT.postedDb(db), {});
    const rows = P.rows.filter((r) => r.coSoLieu);
    // mặc định: toàn bộ thời gian, chỉ NCC có số liệu
    assert.equal(await page.locator('#cn-table tbody tr[data-ma]').count(), rows.length);
    for (const r of rows) {
      const tds = await page.locator('#cn-table tbody tr[data-ma="' + r.ma + '"] td').allInnerTexts();
      const v = (s) => (/\d/.test(s) ? num(s) : 0);
      assert.equal(v(tds[3]), r.phatSinh, r.ma + ' phát sinh');
      assert.equal(v(tds[4].split('\n')[0]), r.thanhToan, r.ma + ' thanh toán');
      assert.equal(v(tds[6]) - v(tds[5]), r.cuoiKy, r.ma + ' cuối kỳ = Dư Có − Dư Nợ');
      assert.match(tds[7], r.status === 'no' ? /Còn nợ/ : r.status === 'du' ? /Ứng dư/ : /Đã tất toán/, r.ma + ' tình trạng');
    }
    const tot = P.sumRows(rows);
    const foot = await page.locator('#cn-table tfoot td').allInnerTexts(); // Tổng | DK Nợ | DK Có | PS | TT | CK Nợ | CK Có
    assert.deepEqual([num(foot[3]), num(foot[4]), num(foot[5]), num(foot[6])], [tot.phatSinh, tot.thanhToan, tot.ungDu, tot.conNo]);
    // bấm dòng NCC còn nợ: hàng thao tác mở rộng
    const debtor = rows.filter((r) => r.cuoiKy > 0).sort((a, b) => b.cuoiKy - a.cuoiKy)[0];
    await page.locator('#cn-table tr[data-ma="' + debtor.ma + '"] td').first().click();
    await page.waitForSelector('#cn-table tr.open-row [data-act=ledger]');
    assert.match(await page.$eval('#cn-table tr.open-row', (e) => e.innerText), /Sổ chi tiết[\s\S]*Biên bản đối chiếu[\s\S]*Sổ chi phí của NCC[\s\S]*Ghi phiếu chi/);
    // biên bản đối chiếu: A4, số dư cuối kỳ đúng
    await page.click('#cn-table tr.open-row [data-act=bien-ban-row]');
    await page.waitForSelector('.modal .bb-preview');
    const bb = await page.$eval('.modal .bb-preview', (e) => e.innerText);
    assert.match(bb, /BIÊN BẢN ĐỐI CHIẾU CÔNG NỢ/);
    assert.ok(bb.includes(KT.fmtMoney(debtor.cuoiKy)), 'biên bản ghi số dư cuối kỳ ' + debtor.cuoiKy);
    await page.keyboard.press('Escape');
    // Trả tiền: phiếu chi điền sẵn NCC và số tiền còn nợ
    await page.locator('#cn-table tr[data-ma="' + debtor.ma + '"] [data-act=pay]').first().click();
    await page.waitForSelector('#entry-form');
    await page.waitForTimeout(200);
    assert.equal(await page.inputValue('#entry-form input[name=maNCC]'), debtor.ma);
    assert.equal(num(await page.inputValue('#entry-form input[name=chi]')), debtor.cuoiKy);
    const cash0 = KT.filterLedger(KT.buildLedger(KT.postedDb(db)), {});
    await page.keyboard.press('Control+Enter');
    await page.waitForSelector('#entry-form', { state: 'detached', timeout: 6000 });
    await settle(page);
    const db1 = await srv.db();
    const d1 = KT.supplierPeriod(KT.postedDb(db1), {}).rows.find((r) => r.ma === debtor.ma);
    assert.equal(d1.cuoiKy, 0, 'trả đúng số còn nợ thì tất toán');
    assert.match(await page.locator('#cn-table tr[data-ma="' + debtor.ma + '"]').innerText(), /Đã tất toán/);
    const cash1 = KT.filterLedger(KT.buildLedger(KT.postedDb(db1)), {});
    assert.equal(cash1.tonCuoiKy, cash0.tonCuoiKy - debtor.cuoiKy);
    // sổ chi tiết công nợ: Enter trên dòng → mở sổ, cuối kỳ khớp
    const other = rows.find((r) => r.cuoiKy > 0 && r.ma !== debtor.ma);
    await page.locator('#cn-table tr[data-ma="' + other.ma + '"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash === '#/so-chi-tiet-ncc');
    await page.waitForSelector('#sct-body tr');
    assert.match(await page.textContent('#page-title'), new RegExp(other.ten.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok((await page.$eval('#sct-foot', (e) => e.innerText)).includes(KT.fmtMoney(other.cuoiKy)), 'cuối kỳ ở sổ chi tiết = cuối kỳ ở công nợ');
    const nDocs = KT.costSlips(Object.assign({}, KT.postedDb(db1), { costs: KT.postedDb(db1).costs.filter((c) => c.maNCC === other.ma) })).length;
    assert.ok(await page.locator('#sct-body tr[data-i].clickable').count() === nDocs, 'mỗi phiếu nhập một dòng');
    await page.evaluate(() => { location.hash = '#/tong-quan'; });
    await page.waitForFunction((v) => document.querySelector('#view').innerText.includes(v), KT.fmtMoney(cash1.tonCuoiKy), { timeout: 5000 });
    // form phiếu chi hiện công nợ của NCC đang chọn
    await page.keyboard.press('F3');
    await page.waitForSelector('#entry-form'); await page.waitForTimeout(200);
    await page.fill('#entry-form input[name=maNCC]', other.ma);
    await page.locator('#entry-form input[name=maNCC]').dispatchEvent('change');
    await page.waitForFunction(() => /còn nợ/i.test(document.querySelector('#ncc-hint, #chi-hint').closest('form').innerText), null, { timeout: 4000 });
    assert.ok((await page.$eval('#entry-form', (e) => e.innerText)).includes(KT.fmtMoney(other.cuoiKy)), 'form phiếu chi phải ghi số còn nợ');
    await page.click('#entry-form [data-act=fill-debt]');
    assert.equal(num(await page.inputValue('#entry-form input[name=chi]')), other.cuoiKy, '"Điền số này" điền đúng số tiền');
    await page.keyboard.press('Escape');
    // theo công trình: bấm một công trình → về bảng theo NCC, công trình chọn ở thanh trên
    await page.evaluate(() => { location.hash = '#/cp-cong-no'; });
    await page.waitForSelector('#cn-table');
    await page.click('label:has(input[name=cn-mode][value=ct])');
    await page.waitForSelector('tr[data-ct]');
    const ctCode = await page.locator('tr[data-ct]').first().getAttribute('data-ct');
    await page.locator('tr[data-ct]').first().click();
    await page.waitForSelector('#cn-table tfoot');
    await settle(page);
    assert.ok((await page.textContent('#tb-ct-val')).startsWith(ctCode));
    const tct = KT.supplierPeriod(KT.postedDb(db1), { ct: ctCode });
    const foot2 = await page.locator('#cn-table tfoot td').allInnerTexts();
    assert.equal(num(foot2[3]), tct.sumRows(tct.rows.filter((r) => r.coSoLieu)).phatSinh, 'lọc theo công trình: tổng phát sinh');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('F6c Công nợ NCC: lọc theo một / nhiều NCC (gõ mã hoặc tên, không dấu cũng ra gợi ý mã – tên, ↑↓ Enter), chip NCC đang lọc, Xóa lọc, lọc tình trạng; tổng = các dòng đang hiện; nhớ bộ lọc', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({ seed: V2 });
  const db = readJsonFile(V2);
  const posted = KT.postedDb(db);
  const { browser, page, errors } = await openPage(srv, '#/cp-cong-no');
  try {
    await page.waitForSelector('#cn-table tbody tr[data-ma]');
    const nAll = await page.locator('#cn-table tbody tr[data-ma]').count();
    const ds = KT.supplierPeriod(posted, {}).rows.filter((x) => x.coSoLieu && x.inCatalog).sort((a, b) => b.phatSinh - a.phatSinh);
    const [r, r2] = ds;
    assert.ok(r && r2, 'dữ liệu mẫu có ít nhất 2 NCC công trình');
    const sumShown = async () => (await page.$$eval('#cn-table tbody tr[data-ma] td:nth-child(4)', (tds) => tds.map((t) => t.textContent))).reduce((t, x) => t + (/\d/.test(x) ? num(x) : 0), 0);
    const footPS = async () => num(await page.$eval('#cn-table tfoot td:nth-child(4)', (e) => e.textContent));
    // gõ tên KHÔNG dấu, chữ thường → gợi ý "mã – tên"
    await page.focus('#cn-ncc'); await page.keyboard.type(KT.normalizeText(r.ten).trim(), { delay: 5 });
    await page.waitForSelector('#cn-ncc-ds:not([hidden]) .combo-opt');
    const opt = await page.$eval('#cn-ncc-ds .combo-opt', (li) => li.textContent);
    assert.ok(opt.includes(r.ma) && opt.includes(r.ten), 'gợi ý hiện mã – tên: ' + opt);
    assert.equal(await page.getAttribute('#cn-ncc', 'aria-expanded'), 'true');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('#cn-table tbody tr[data-ma]').length === 1, null, { timeout: 5000 });
    assert.equal(await page.getAttribute('#cn-table tbody tr[data-ma]', 'data-ma'), r.ma);
    assert.match(await page.$eval('#cn-chips', (e) => e.innerText), new RegExp(r.ten.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(await page.inputValue('#cn-ncc'), '', 'chọn xong ô để trống để chọn thêm');
    // chọn thêm NCC thứ hai bằng mã chữ thường + ↓ ↑ Enter (tiêu điểm vẫn ở ô sau khi vẽ lại)
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'cn-ncc', null, { timeout: 3000 });
    await page.keyboard.type(r2.ma.toLowerCase(), { delay: 5 });
    await page.waitForSelector('#cn-ncc-ds:not([hidden]) .combo-opt');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('#cn-table tbody tr[data-ma]').length === 2, null, { timeout: 5000 });
    const exp2 = KT.supplierPeriod(posted, { ncc: [r.ma, r2.ma] });
    assert.equal(await sumShown(), exp2.total.phatSinh, 'tổng chi phí 2 NCC');
    assert.equal(await footPS(), exp2.total.phatSinh, 'tổng cuối bảng = tổng các dòng đang hiện');
    // gõ tên không có: báo lỗi, giữ bộ lọc
    await page.fill('#cn-ncc', 'không có ncc này'); await page.press('#cn-ncc', 'Enter');
    await page.waitForFunction(() => /Không có nhà cung cấp/.test(document.querySelector('#toast-root').textContent), null, { timeout: 4000 });
    assert.equal(await page.locator('#cn-table tbody tr[data-ma]').count(), 2);
    // lọc nhanh tình trạng (kèm số lượng từng loại)
    await page.click('label:has(input[name=cn-tt][value=du])'); await settle(page);
    const du = exp2.rows.filter((x) => x.cuoiKy < 0);
    assert.equal(await page.locator('#cn-table tbody tr[data-ma]').count(), du.length);
    if (!du.length) assert.match(await page.$eval('#view', (e) => e.innerText), /Không có nhà cung cấp nào khớp bộ lọc/);
    await page.click('label:has(input[name=cn-tt][value=no])'); await settle(page);
    assert.equal(await page.locator('#cn-table tbody tr[data-ma]').count(), exp2.rows.filter((x) => x.cuoiKy > 0).length);
    // nhớ bộ lọc khi chuyển màn hình rồi quay lại
    await page.evaluate(() => { location.hash = '#/cp-so'; });
    await page.waitForSelector('#cl-body');
    await page.evaluate(() => { location.hash = '#/cp-cong-no'; });
    await page.waitForSelector('#cn-chips .filter-chip');
    assert.equal(await page.locator('#cn-chips .filter-chip').count(), 2, '2 NCC');
    assert.ok(await page.isChecked('input[name=cn-tt][value=no]'), 'nhớ lọc tình trạng');
    // bỏ một NCC bằng nút × của chip
    await page.click('#cn-chips [data-chip="ncc:' + r2.ma + '"]');
    await page.waitForFunction(() => document.querySelectorAll('#cn-chips .filter-chip').length === 1, null, { timeout: 4000 });
    // Xóa lọc: trở về như cũ
    await page.click('#cn-clear');
    await page.waitForFunction((n) => document.querySelectorAll('#cn-table tbody tr[data-ma]').length === n, nAll, { timeout: 5000 });
    assert.equal(await page.locator('#cn-chips .filter-chip').count(), 0);
    // Esc đóng danh sách gợi ý
    await page.focus('#cn-ncc'); await page.keyboard.press('ArrowDown');
    assert.equal(await page.getAttribute('#cn-ncc', 'aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.getAttribute('#cn-ncc', 'aria-expanded'), 'false');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('F8 ô lọc gõ tìm thay dropdown: gõ mã / tên / “chưa gán”, chọn gợi ý, gõ sai báo lỗi, xóa trắng bỏ lọc — sổ thu chi, sổ chi phí, giá vật tư, form nhà', { skip: SKIP, timeout: 240000 }, async () => {
  const srv = await startServer({ seed: V2 });
  const db = readJsonFile(V2);
  const posted = KT.postedDb(db);
  const { browser, page, errors } = await openPage(srv, '#/so-thu-chi');
  try {
    await page.waitForSelector('#so-body tr');
    // không còn dropdown chọn dự án / NCC / công trình / nhà / nhóm / hạng mục / vật tư ở các màn lọc
    const count = () => page.$eval('#so-count', (e) => e.innerText);
    const led = KT.buildLedger(posted);
    const p = db.projects.find((x) => db.entries.some((e) => e.maDuAn === x.ma));
    assert.equal(await page.$eval('#so-duan', (e) => e.tagName + e.getAttribute('role')), 'INPUTcombobox');
    // gõ đúng tên dự án (không dấu, chữ thường vẫn khớp theo normalizeText) rồi Enter
    await pick(page, '#so-duan', p.ten);
    assert.equal(await page.inputValue('#so-duan'), p.ma, 'sau khi lọc ô hiện mã');
    const nP = KT.filterLedger(led, { duAn: p.ma }).rows.length;
    assert.match(await count(), new RegExp('\\b' + nP + '\\b'));
    // lựa chọn "chưa gán dự án"
    await pick(page, '#so-duan', '(Chưa gán dự án)');
    const nNone = KT.filterLedger(led, { duAn: '__none__' }).rows.length;
    assert.match(await count(), new RegExp('\\b' + nNone + '\\b'));
    // gõ sai: báo lỗi, giữ bộ lọc cũ
    await pick(page, '#so-ncc', 'zzz-khong-co');
    await page.waitForFunction(() => /Không có nhà cung cấp/.test(document.querySelector('#toast-root').textContent), null, { timeout: 4000 });
    assert.equal(await page.inputValue('#so-ncc'), '');
    // chọn gợi ý: lọc ngay không cần Enter
    const s0 = db.suppliers.find((x) => db.entries.some((e) => e.maNCC === x.ma));
    await page.focus('#so-ncc'); await page.keyboard.type(s0.ma, { delay: 5 });
    await page.waitForSelector('#so-ncc-ds:not([hidden]) .combo-opt');
    await page.click('#so-ncc-ds .combo-opt'); // bấm chuột vào dòng gợi ý
    await settle(page);
    assert.match(await count(), new RegExp('\\b' + KT.filterLedger(led, { duAn: '__none__', ncc: s0.ma }).rows.length + '\\b'));
    // xóa trắng rồi Enter: bỏ lọc
    await pick(page, '#so-duan', ''); await pick(page, '#so-ncc', '');
    assert.match(await count(), new RegExp('\\b' + KT.filterLedger(led, {}).rows.length + '\\b'));
    // sổ chi phí: nhóm gõ tên → ô hiện tên; hạng mục chỉ gợi ý hạng mục của nhóm đó
    await page.evaluate(() => { location.hash = '#/cp-so'; });
    await page.waitForSelector('#cl-body tr');
    const g = db.costGroups.find((x) => db.costItems.some((i) => i.maNhom === x.ma && db.costs.some((c) => c.maHM === i.ma)));
    await pick(page, '#cl-nhom', g.ma.toLowerCase());
    assert.equal(await page.inputValue('#cl-nhom'), g.ten);
    await page.focus('#cl-hm'); await page.keyboard.press('ArrowDown');
    const hmOpts = await page.$$eval('#cl-hm-ds .combo-opt b', (os) => os.map((o) => o.textContent));
    assert.deepEqual(hmOpts.sort(), db.costItems.filter((i) => i.maNhom === g.ma).map((i) => i.ma).sort());
    await page.keyboard.press('Escape');
    const nG = KT.filterCosts(KT.buildCostLedger(posted), { nhom: g.ma }).rows.length;
    assert.match(await page.$eval('#cl-count', (e) => e.innerText), new RegExp(String(Math.min(nG, 500))));
    await page.click('#cl-clear'); await settle(page);
    assert.equal(await page.inputValue('#cl-nhom'), '');
    // giá vật tư: lọc NCC bằng ô gõ tìm
    await page.evaluate(() => { location.hash = '#/cp-gia'; });
    await page.waitForSelector('#gia-list tr');
    const st = KT.materialStats(posted, {});
    const nccVT = db.costs.find((c) => c.maVT && c.maNCC).maNCC;
    await pick(page, '#gia-ncc', nccVT);
    assert.equal(await page.locator('#gia-list tr[data-vt]').count(), KT.materialStats(posted, { ncc: nccVT }).length);
    await pick(page, '#gia-ncc', '');
    assert.equal(await page.locator('#gia-list tr[data-vt]').count(), st.length);
    // form thêm nhà: ô Thuộc công trình gõ tên công trình
    await page.evaluate(() => { location.hash = '#/cp-danh-muc'; });
    await page.waitForSelector('input[name=dm-tab]');
    await page.click('label:has(input[name=dm-tab][value=nha])'); await settle(page);
    await page.click('[data-act=add]');
    await page.waitForSelector('#modal-root form'); await page.waitForTimeout(150);
    const ct = db.projects.find((x) => db.costs.some((c) => c.maCT === x.ma));
    await page.fill('#modal-root input[name=ma]', 'NHA_F8');
    await page.fill('#modal-root input[name=ten]', 'Nhà kiểm thử ô gõ tìm');
    await page.fill('#modal-root input[name=maCT]', 'không có công trình này');
    await page.click('#modal-root [data-act=save]');
    await page.waitForFunction(() => /chưa có trong danh mục/.test(document.querySelector('#modal-root').textContent), null, { timeout: 4000 });
    await page.fill('#modal-root input[name=maCT]', ct.ten);
    await page.click('#modal-root [data-act=save]');
    await page.waitForSelector('#modal-root form', { state: 'detached' });
    const h = (await srv.db()).houses.find((x) => x.ma === 'NHA_F8');
    assert.ok(h); assert.equal(h.maCT, ct.ma, 'lưu mã công trình từ tên đã gõ');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('F6d Tổng hợp NCC (đường dẫn cũ #/tong-hop-ncc mở Công nợ NCC theo kỳ): lọc nhiều NCC, tổng Thanh toán = các dòng đang hiện, chip + Xóa lọc', { skip: SKIP, timeout: 120000 }, async () => {
  const srv = await startServer({ seed: V2 });
  const db = readJsonFile(V2);
  const { browser, page, errors } = await openPage(srv, '#/tong-hop-ncc');
  try {
    await page.waitForSelector('#cn-table tbody tr');
    await chonKy(page, 'cn', 'tat-ca');
    const posted = KT.postedDb(db);
    const two = KT.supplierPeriod(posted, {}).rows.filter((r) => r.thanhToan > 0).sort((a, b) => b.thanhToan - a.thanhToan).slice(0, 2);
    for (const r of two) {
      await page.focus('#cn-ncc'); await page.keyboard.type(KT.normalizeText(r.ten).trim(), { delay: 5 });
      await page.waitForSelector('#cn-ncc-ds:not([hidden]) .combo-opt');
      await page.keyboard.press('Enter'); await settle(page);
    }
    assert.equal(await page.locator('#cn-table tbody tr[data-ma]').count(), 2);
    assert.equal(await page.locator('#cn-chips .filter-chip').count(), 2);
    const foot = num(await page.$eval('#cn-table tfoot td:nth-child(5)', (e) => e.textContent));
    const ttHai = posted.entries.filter((e) => two.some((r) => KT.keyOf(r.ma) === KT.keyOf(e.maNCC))).reduce((t, e) => t + (e.chi || 0) - (e.thu || 0), 0) +
      (posted.extPayments || []).filter((e) => two.some((r) => KT.keyOf(r.ma) === KT.keyOf(e.maNCC))).reduce((t, e) => t + e.soTien, 0);
    assert.equal(foot, ttHai, 'tổng thanh toán cuối bảng = 2 NCC đang lọc');
    await page.click('#cn-clear'); await settle(page);
    assert.equal(await page.locator('#cn-chips .filter-chip').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('F7 Giá vật tư và Danh mục chi phí: chọn vật tư, lịch sử đơn giá; 4 tab danh mục, tìm kiếm, thêm/sửa/xóa, đổi tên lan sang sổ', { skip: SKIP, timeout: 300000 }, async () => {
  const srv = await startServer({ seed: V2 });
  const db = readJsonFile(V2);
  const { browser, page, errors } = await openPage(srv, '#/cp-gia');
  try {
    await page.waitForSelector('tr[data-vt]');
    const stats = KT.materialStats(db, {});
    assert.equal(await page.locator('tr[data-vt]').count(), stats.length);
    const vt = stats.find((s) => s.soLan >= 3) || stats[0];
    await page.locator('tr[data-vt="' + vt.ma + '"]').click();
    await settle(page);
    const hist = KT.priceHistory(db, vt.ma);
    assert.equal(await page.locator('#gia-detail tbody tr').count(), hist.length, 'lịch sử đơn giá của ' + vt.ma);
    assert.ok((await page.$eval('#gia-detail', (e) => e.innerText)).includes(KT.fmtMoney(vt.last)));
    await page.fill('#gia-q', 'zzzz không có'); await page.waitForTimeout(300);
    assert.match(await page.$eval('#gia-list', (e) => e.innerText), /Chưa có vật tư nào được mua/);
    // ---- Danh mục ----
    await page.evaluate(() => { location.hash = '#/cp-danh-muc'; });
    await page.waitForSelector('#dm-table tr[data-id]');
    const tabs = { 'hang-muc': db.costItems.length, nhom: db.costGroups.length, 'vat-tu': db.materials.length, nha: db.houses.length };
    for (const t of Object.keys(tabs)) {
      await page.check('input[name=dm-tab][value="' + t + '"]', { force: true });
      await settle(page);
      assert.equal(await page.locator('#dm-table tbody tr[data-id]').count(), Math.min(tabs[t], 600), 'tab ' + t);
    }
    // tìm kiếm (không dấu)
    await page.check('input[name=dm-tab][value="hang-muc"]', { force: true });
    await page.fill('#dm-q', 'be tong'); await page.waitForTimeout(300);
    assert.equal(await page.locator('#dm-table tbody tr[data-id]').count(), db.costItems.filter((i) => /be tong/.test(KT.normalizeText(i.ma + ' ' + i.ten))).length);
    await page.fill('#dm-q', '');
    await page.waitForTimeout(300);
    // thêm hạng mục
    await page.click('[data-act=add]');
    await page.waitForSelector('#modal-root form'); await page.waitForTimeout(150);
    await page.fill('#modal-root input[name=ten]', 'Hạng mục kiểm thử giao diện');
    await page.fill('#modal-root input[name=maNhom]', db.costGroups[1].ma);
    await page.keyboard.press('Enter'); // Enter thứ nhất lấy dòng gợi ý, thứ hai lưu
    await page.keyboard.press('Enter');
    await page.waitForSelector('#modal-root form', { state: 'detached' });
    const created = (await srv.db()).costItems.find((i) => i.ten === 'Hạng mục kiểm thử giao diện');
    assert.ok(created);
    // trùng tên bị từ chối
    await page.click('[data-act=add]');
    await page.waitForSelector('#modal-root form'); await page.waitForTimeout(150);
    await page.fill('#modal-root input[name=ma]', 'HM_TRUNG'); await page.fill('#modal-root input[name=ten]', 'hạng mục KIỂM THỬ giao diện');
    await page.fill('#modal-root input[name=maNhom]', db.costGroups[1].ma);
    await page.keyboard.press('Enter'); // Enter thứ nhất lấy dòng gợi ý, thứ hai lưu
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => /đã có/.test(document.querySelector('#toast-root').textContent), null, { timeout: 4000 });
    await page.click('[data-act=cancel]');
    // đổi tên hạng mục đang có dòng chi phí → sổ chi phí hiện tên mới
    const used = db.costItems.find((i) => db.costs.some((c) => c.maHM === i.ma));
    await page.locator('#dm-table tr[data-id="' + used.id + '"] [data-act=edit]').click();
    await page.waitForSelector('#modal-root form'); await page.waitForTimeout(150);
    await page.fill('#modal-root input[name=ten]', 'TÊN MỚI ' + used.ten);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#modal-root form', { state: 'detached' });
    await page.evaluate(() => { location.hash = '#/cp-so'; });
    await page.waitForSelector('#cl-body tr[data-id]');
    assert.ok((await page.$eval('#cl-body', (e) => e.innerText)).includes('TÊN MỚI ' + used.ten), 'sổ chi phí hiện tên hạng mục mới');
    await page.evaluate(() => { location.hash = '#/cp-tong-hop'; });
    await page.waitForSelector('tr[data-group]');
    assert.ok((await page.$eval('#view', (e) => e.innerText)).includes('TÊN MỚI ' + used.ten), 'bảng điều khiển hiện tên mới');
    // xóa: hạng mục đang dùng bị chặn, hạng mục mới thì xóa được
    await page.evaluate(() => { location.hash = '#/cp-danh-muc'; });
    await page.waitForSelector('#dm-table tr[data-id]');
    await page.locator('#dm-table tr[data-id="' + used.id + '"] [data-act=del]').click();
    await page.click('[data-act=yes]');
    await page.waitForFunction(() => /Không thể xóa/.test(document.querySelector('#toast-root').textContent), null, { timeout: 4000 });
    await page.locator('#dm-table tr[data-id="' + created.id + '"] [data-act=del]').click();
    await page.click('[data-act=yes]');
    await page.waitForFunction((id) => !document.querySelector('#dm-table tr[data-id="' + id + '"]'), created.id, { timeout: 4000 });
    assert.deepEqual(orphanErrors(await srv.db()), []);
    assert.deepEqual(errors.filter((e) => !/status of 4/.test(e)), []);
  } finally { await browser.close(); await srv.stop(); }
});
