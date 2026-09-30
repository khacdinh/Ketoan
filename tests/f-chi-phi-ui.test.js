'use strict';
/* D+F. Chức năng chi phí công trình qua giao diện thật (Chromium): phiếu nhập chỉ bằng bàn phím, sửa/xóa/nhân bản, danh mục, sổ, báo cáo, công nợ */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { KT, startServer, readJsonFile, orphanErrors } = require('./helpers');
const { SKIP, openPage, settle, num } = require('./ui-helpers');

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
    assert.equal(await page.$eval('tr[data-row="0"] .tt', (e) => e.textContent.trim()), '3.125.000');
    // dòng 2
    await type(page, 'CAT'); await page.keyboard.press('Enter');
    await type(page, 'cát vàng'); await page.keyboard.press('Enter');
    await type(page, '0,125'); await page.keyboard.press('Enter');
    await type(page, '8000'); await page.keyboard.press('Enter');
    assert.equal(await page.$eval('tr[data-row="1"] .tt', (e) => e.textContent.trim()), '1.000');
    // dòng 3: không mã VT, nhân công, SL là phép tính, đơn giá kiểu 300k
    await page.keyboard.press('Enter'); // bỏ qua mã VT
    await type(page, 'Công thợ hồ'); await page.keyboard.press('Enter');
    await type(page, '10+5'); await page.keyboard.press('Enter');
    await type(page, '300k');
    // đổi hạng mục riêng của dòng 3 bằng bàn phím: Tab sang ô hạng mục riêng
    await page.keyboard.press('Tab');
    assert.equal((await active(page)).col, 'hm');
    await type(page, 'Nhân công thợ nề'); await page.keyboard.press('Tab');
    assert.equal((await active(page)).col, 'loaiCP');
    // kiểm tra tổng trước khi lưu
    assert.equal(await page.$eval('tr[data-row="2"] .tt', (e) => e.textContent.trim()), '4.500.000');
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
    await page.selectOption('#modal-root select[name=maNhom]', { index: 2 });
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
    await page.waitForFunction(() => /thiếu hoặc sai Đơn giá/.test(document.querySelector('#toast-root').textContent), null, { timeout: 4000 });
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
      return { n, footTotal: num(foot.split('\n').pop().replace(/.*Cộng[^\d-]*/, '').split(/\s+/).filter((x) => /\d/.test(x)).pop()), shownSum, count, foot };
    };
    const expectFor = (f) => { const r = KT.filterCosts(led, f); return { n: r.rows.length, total: r.total }; };
    const steps = [
      ['kỳ 6/2026', async () => { await page.selectOption('#cl-period', 'tuy-chon'); await dateBox(page, 'cl-from').fill('1/6/2026'); await dateBox(page, 'cl-from').press('Tab'); await dateBox(page, 'cl-to').fill('30/6/2026'); await dateBox(page, 'cl-to').press('Tab'); }, { from: '2026-06-01', to: '2026-06-30' }],
      ['+ công trình', async () => { await page.selectOption('#cl-ct', db.costs[0].maCT); }, { from: '2026-06-01', to: '2026-06-30', ct: db.costs[0].maCT }],
      ['+ loại Vật tư', async () => { await page.selectOption('#cl-loai', 'Vật tư'); }, { from: '2026-06-01', to: '2026-06-30', ct: db.costs[0].maCT, loai: 'Vật tư' }],
      ['+ NCC', async () => { await page.selectOption('#cl-ncc', 'NCC_VuongThinh'); }, { from: '2026-06-01', to: '2026-06-30', ct: db.costs[0].maCT, loai: 'Vật tư', ncc: 'NCC_VuongThinh' }],
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
    // bỏ lọc rồi lọc riêng từng tiêu chí
    await page.click('#cl-clear');
    await settle(page);
    const single = [['#cl-ct', 'ct', db.costs[5].maCT], ['#cl-nha', 'nha', db.costs[5].maNha], ['#cl-nhom', 'nhom', db.costGroups[1].ma], ['#cl-loai', 'loai', 'Nhân công'], ['#cl-ncc', 'ncc', db.costs[9].maNCC], ['#cl-vt', 'vt', db.costs[3].maVT]];
    for (const [sel, k, v] of single) {
      await clearFilters(page);
      await page.selectOption(sel, v);
      await settle(page);
      const e = expectFor({ [k]: v });
      const r = await read();
      assert.equal(r.n, Math.min(e.n, 500), sel + ' số dòng');
      assert.equal(r.footTotal, e.total, sel + ' tổng');
    }
    // hạng mục (chọn sau khi chọn nhóm)
    await clearFilters(page);
    const hmItem = db.costItems.find((i) => db.costs.some((c) => c.maHM === i.ma));
    await page.selectOption('#cl-nhom', hmItem.maNhom); await settle(page);
    await page.selectOption('#cl-hm', hmItem.ma); await settle(page);
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
    await page.waitForFunction(() => /Số lượng không hợp lệ/.test(document.querySelector('#toast-root').textContent), null, { timeout: 4000 });
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
      assert.equal(await tileVal('Còn nợ nhà cung cấp'), D.total.conNo, 'còn nợ ' + ct);
      // tổng cộng ở chân bảng nhóm = tổng; tổng các dòng nhóm = tổng
      assert.equal(num(await page.$eval('table.tree tfoot td.money', (e) => e.innerText)), S.total, 'chân bảng ' + ct);
      const groupTotals = await page.$$eval('tr[data-group] td.money .font-semibold', (els) => els.map((e) => e.textContent));
      assert.equal(groupTotals.reduce((t, s) => t + num(s), 0), S.total, 'tổng các nhóm ' + ct);
      // các tháng cộng lại = tổng
      const months = await page.$$eval('#th-months ~ table tbody tr td:nth-child(2)', (els) => els.map((e) => e.textContent));
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
    await page.keyboard.press('Tab'); // bàn phím: Enter trên dòng nhóm
    await page.locator('tr[data-group]').first().focus();
    await page.keyboard.press('Enter'); await settle(page);
    assert.equal(await page.locator('tr[data-item]').count(), nItems, 'Enter bung lại');
    // đổi công trình
    const ct = db.costs[0].maCT;
    await page.selectOption('#th-ct', ct); await settle(page);
    await check(ct);
    // bấm hạng mục → sổ chi phí lọc đúng hạng mục và công trình
    const item = await page.locator('tr[data-item]').first();
    const ma = await item.getAttribute('data-item');
    const expectN = KT.filterCosts(KT.buildCostLedger(db), { ct, hm: ma }).rows.length;
    await item.click();
    await page.waitForFunction(() => location.hash === '#/cp-so');
    await page.waitForSelector('#cl-body tr, #cl-body td');
    await settle(page);
    assert.equal(await page.$eval('#cl-ct', (e) => e.value), ct);
    assert.equal(await page.$eval('#cl-hm', (e) => e.value), ma);
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
    await page.selectOption('#ct-ct', ct); await settle(page);
    const Sf = KT.costSummary(db, { ct }, KT.buildCostLedger(db));
    assert.equal(num(await page.$eval('#ct-foot td:last-child', (e) => e.innerText)), Sf.total);
    await page.selectOption('#ct-loai', 'Nhân công'); await settle(page);
    const Sl = KT.costSummary(db, { ct, loai: 'Nhân công' }, KT.buildCostLedger(db));
    assert.equal(num(await page.$eval('#ct-foot td:last-child', (e) => e.innerText)), Sl.total);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('F6 Công nợ NCC: bảng, tổng, chi tiết từng NCC; Trả tiền → phiếu chi điền sẵn → công nợ về 0; công nợ hiện ở form phiếu chi; liên thông với Tổng quan (tồn quỹ)', { skip: SKIP, timeout: 300000 }, async () => {
  const srv = await startServer({ seed: V2 });
  const db = readJsonFile(V2);
  const { browser, page, errors } = await openPage(srv, '#/cp-cong-no');
  try {
    await page.waitForSelector('tr[data-ma]');
    const D = KT.supplierDebt(db, {});
    const rows = D.rows.filter((r) => r.lienQuan);
    // hiện đúng NCC liên quan công trình, từng hàng đúng số
    assert.equal(await page.locator('tr[data-ma]').count(), rows.length);
    for (const r of rows) {
      const tr = page.locator('tr[data-ma="' + r.ma + '"]');
      const tds = await tr.locator('td').allInnerTexts();
      assert.equal(num(tds[2]), r.phatSinh, r.ma + ' phát sinh'); assert.equal(num(tds[3]), r.daTra, r.ma + ' đã trả'); assert.equal(num(tds[4]), r.conLai, r.ma + ' còn lại');
      assert.match(tds[5], r.status === 'no' ? /Còn nợ/ : r.status === 'du' ? /Ứng dư/ : /Đã tất toán/, r.ma + ' tình trạng');
    }
    const tot = D.sumRows(rows);
    const foot = await page.locator('tfoot td').allInnerTexts();
    assert.deepEqual([num(foot[1]), num(foot[2]), num(foot[3])], [tot.phatSinh, tot.daTra, tot.conLai]);
    // chọn NCC còn nợ: chi tiết bên phải
    const debtor = rows.filter((r) => r.conLai > 0).sort((a, b) => b.conLai - a.conLai)[0];
    await page.locator('tr[data-ma="' + debtor.ma + '"]').click();
    await page.waitForSelector('#cn-detail h3');
    assert.match(await page.$eval('#cn-detail', (e) => e.innerText), new RegExp(debtor.ma));
    const costs = db.costs.filter((c) => KT.keyOf(c.maNCC) === KT.keyOf(debtor.ma));
    assert.match(await page.$eval('#cn-detail', (e) => e.innerText), new RegExp('Chi phí phát sinh \\(' + costs.length + ' dòng\\)'));
    // Trả tiền: phiếu chi điền sẵn NCC và số tiền còn nợ
    await page.locator('tr[data-ma="' + debtor.ma + '"] [data-act=pay]').click();
    await page.waitForSelector('#entry-form');
    await page.waitForTimeout(200);
    assert.equal(await page.inputValue('#entry-form input[name=maNCC]'), debtor.ma);
    assert.equal(num(await page.inputValue('#entry-form input[name=chi]')), debtor.conLai);
    const cash0 = KT.filterLedger(KT.buildLedger(db), {});
    await page.keyboard.press('Control+Enter');
    await page.waitForSelector('#entry-form', { state: 'detached', timeout: 6000 });
    await settle(page);
    const db1 = await srv.db();
    const d1 = KT.supplierDebt(db1, {}).rows.find((r) => r.ma === debtor.ma);
    assert.equal(d1.conLai, 0, 'trả đúng số còn nợ thì tất toán');
    assert.match(await page.locator('tr[data-ma="' + debtor.ma + '"]').innerText(), /Đã tất toán/);
    // tồn quỹ giảm đúng số đã trả
    const cash1 = KT.filterLedger(KT.buildLedger(db1), {});
    assert.equal(cash1.tonCuoiKy, cash0.tonCuoiKy - debtor.conLai);
    await page.evaluate(() => { location.hash = '#/tong-quan'; });
    await page.waitForFunction((v) => document.querySelector('#view').innerText.includes(v), KT.fmtMoney(cash1.tonCuoiKy), { timeout: 5000 });
    // form phiếu chi hiện công nợ của NCC đang chọn
    const other = rows.find((r) => r.conLai > 0 && r.ma !== debtor.ma);
    if (other) {
      await page.keyboard.press('F2');
      await page.waitForSelector('#entry-form'); await page.waitForTimeout(200);
      await page.fill('#entry-form input[name=maNCC]', other.ma);
      await page.locator('#entry-form input[name=maNCC]').dispatchEvent('change');
      await page.waitForFunction(() => /còn nợ/i.test(document.querySelector('#ncc-hint, #chi-hint').closest('form').innerText), null, { timeout: 4000 });
      const hintText = await page.$eval('#entry-form', (e) => e.innerText);
      assert.ok(hintText.includes(KT.fmtMoney(other.conLai)), 'form phiếu chi phải ghi số còn nợ ' + KT.fmtMoney(other.conLai));
      await page.click('#entry-form [data-act=fill-debt]');
      assert.equal(num(await page.inputValue('#entry-form input[name=chi]')), other.conLai, '"Điền số này" điền đúng số tiền');
      await page.keyboard.press('Escape');
    }
    // bảng theo công trình: bấm một công trình
    await page.evaluate(() => { location.hash = '#/cp-cong-no'; });
    await page.waitForSelector('tr[data-ct]');
    const ctCode = await page.locator('tr[data-ct]').first().getAttribute('data-ct');
    await page.locator('tr[data-ct]').first().click();
    await settle(page);
    const Dct = KT.supplierDebt(db1, { ct: ctCode });
    const tct = Dct.sumRows(Dct.rows.filter((r) => r.lienQuan));
    const foot2 = await page.locator('section:has(tr[data-ma]) tfoot td').allInnerTexts();
    assert.equal(num(foot2[1]), tct.phatSinh, 'lọc theo công trình: tổng phát sinh');
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
    await page.selectOption('#modal-root select[name=maNhom]', db.costGroups[1].ma);
    await page.keyboard.press('Enter');
    await page.waitForSelector('#modal-root form', { state: 'detached' });
    const created = (await srv.db()).costItems.find((i) => i.ten === 'Hạng mục kiểm thử giao diện');
    assert.ok(created);
    // trùng tên bị từ chối
    await page.click('[data-act=add]');
    await page.waitForSelector('#modal-root form'); await page.waitForTimeout(150);
    await page.fill('#modal-root input[name=ma]', 'HM_TRUNG'); await page.fill('#modal-root input[name=ten]', 'hạng mục KIỂM THỬ giao diện');
    await page.selectOption('#modal-root select[name=maNhom]', db.costGroups[1].ma);
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
