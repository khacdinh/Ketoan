'use strict';
/* M-UI. Gộp mã qua giao diện thật (Chromium): danh mục → tích chọn → Gộp mã → xem trước → xác nhận → kết quả → Lịch sử → Hoàn tác.
 * Thao tác được bằng bàn phím (ô chọn gõ tìm dùng ↑↓ Enter), không lỗi console. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { KT, startServer, readStored } = require('./helpers');
const { SKIP, openPage, settle } = require('./ui-helpers');

function seed() {
  let id = 1;
  const db = {
    schema: 3, settings: {}, vouchers: {}, trash: [], locks: [], attachments: [], cashCounts: [], ignoredWarnings: {},
    projects: [{ id: id++, ma: 'CT1', ten: 'Công trình 1', nganSach: 0, trangThai: 'Đang thực hiện', ghiChu: '' }],
    suppliers: [
      { id: id++, ma: 'NCC_ThienHai', ten: 'VLXD Thiên Hải', loai: 'Vật tư', sdt: '', diaChi: '', ghiChu: '' },
      { id: id++, ma: 'NCC_THienHAi', ten: 'Thiên Hải', loai: 'Vật liệu xây dựng', sdt: '0905', diaChi: '', ghiChu: '' },
      { id: id++, ma: 'NCC_Khac', ten: 'Nhà cung cấp khác', loai: 'Vật tư', sdt: '', diaChi: '', ghiChu: '' }
    ],
    costGroups: [{ id: id++, ma: 'G1', ten: 'Vật liệu', ghiChu: '' }],
    costItems: [{ id: id++, ma: 'HM01', ten: 'Vật tư VLXD', maNhom: 'G1', ghiChu: '' }],
    materials: [], houses: [], costs: [], entries: []
  };
  ['NCC_ThienHai', 'NCC_THienHAi', 'NCC_Khac'].forEach((ncc, k) => {
    for (let i = 0; i < 4; i++) {
      db.costs.push({ id: id++, seq: db.costs.length + 1, phieuId: 0, ngay: '2026-08-1' + i, maCT: 'CT1', maNha: '', maHM: 'HM01', loaiCP: 'Vật tư', maVT: '', dienGiai: 'd' + k + i,
        soLuong: 1, donGia: (k + 1) * 100000 + i, thanhTien: (k + 1) * 100000 + i, maNCC: ncc, soPhieu: '', ghiChu: '', nguon: 'mau' });
      db.entries.push({ id: id++, seq: db.entries.length + 1, ngay: '2026-08-2' + i, soPhieu: '', maDuAn: 'CT1', maNCC: ncc, noiDung: 'trả ' + k + i, thu: 0, chi: (k + 1) * 50000, nguoiNhan: '', ghiChu: '' });
    }
  });
  db.nextId = id + 5;
  return db;
}

test('MU1 gộp NCC qua giao diện: tích 2 dòng → Gộp mã → xem trước → xác nhận → kết quả; danh mục ẩn mã đã gộp; Lịch sử gộp mã → Hoàn tác về nguyên trạng', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({ seed: seed() });
  const { browser, page, errors } = await openPage(srv, '#/ncc');
  try {
    const start = readStored(srv.dataDir);
    await page.waitForSelector('#ncc-body tr[data-id]');
    // tích đích trước rồi tới nguồn (dòng tích đầu tiên là mã đích)
    await page.check('[data-pick="NCC_ThienHai"]');
    await page.check('[data-pick="NCC_THienHAi"]');
    await page.click('[data-act=merge]');
    await page.waitForSelector('#mg-table');
    const tbl = await page.$eval('#mg-table', (e) => e.innerText);
    assert.match(tbl, /NCC_THienHAi/); assert.match(tbl, /4 dòng sổ thu chi, 4 dòng chi phí/);
    assert.match(await page.$eval('#mg-preview', (e) => e.innerText), /Loại NCC khác nhau/);
    // giữ loại "Vật liệu xây dựng" của nguồn
    await page.selectOption('[data-giu=loai]', 'NCC_THienHAi');
    await page.waitForFunction(() => document.querySelector('[data-giu=loai]') && document.querySelector('[data-giu=loai]').value === 'NCC_THienHAi');
    await page.click('.modal [data-act=merge]:not([disabled])');
    await page.waitForSelector('.modal [data-act=yes]');
    await page.click('.modal [data-act=yes]');
    await page.waitForFunction(() => /Đã gộp mã/.test(document.querySelector('#modal-root').innerText), null, { timeout: 5000 });
    assert.match(await page.$eval('#modal-root', (e) => e.innerText), /Đã chuyển 8 bản ghi/);
    await page.click('#modal-root [data-act=ok]');
    await settle(page);
    let db = readStored(srv.dataDir);
    assert.equal(db.suppliers.find((s) => s.ma === 'NCC_THienHAi').gopVao, 'NCC_ThienHai');
    assert.equal(db.suppliers.find((s) => s.ma === 'NCC_ThienHai').loai, 'Vật liệu xây dựng');
    assert.equal(db.costs.filter((c) => c.maNCC === 'NCC_ThienHai').length, 8);
    // danh mục: mã đã gộp ẩn; bật "Hiện mã đã gộp" thì thấy kèm nhãn
    await page.waitForFunction(() => !document.querySelector('[data-pick="NCC_THienHAi"]'));
    await page.check('[data-merged-toggle]');
    await page.waitForFunction(() => /Đã gộp vào NCC_ThienHai/.test(document.querySelector('#ncc-body').innerText));
    // Lịch sử gộp mã → Hoàn tác
    await page.evaluate(() => { location.hash = '#/gop-ma'; });
    await page.waitForSelector('#gm-log tr[data-id]');
    await page.click('#gm-log [data-act=undo]');
    await page.click('.modal [data-act=yes]');
    await page.waitForFunction(() => /Đã hoàn tác/.test(document.querySelector('#gm-log').innerText), null, { timeout: 5000 });
    db = readStored(srv.dataDir);
    const strip = (d) => { const x = JSON.parse(JSON.stringify(d)); ['mergeLog', 'aliases', 'updatedAt', 'nextId'].forEach((k) => delete x[k]); return x; };
    assert.deepEqual(strip(db), strip(start), 'hoàn tác: dữ liệu như ban đầu');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('MU2 gộp mã hoàn toàn bằng bàn phím: màn Gộp mã → nút NCC → gõ nguồn ↓ Enter, gõ đích Enter, Xem trước, Gộp mã, Enter xác nhận; Esc đóng danh sách gợi ý không đóng hộp thoại', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({ seed: seed() });
  const { browser, page, errors } = await openPage(srv, '#/gop-ma');
  try {
    await page.waitForSelector('[data-new=ncc]');
    await page.focus('[data-new=ncc]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#mg-nguon');
    await page.focus('#mg-nguon');
    await page.keyboard.type('thien hai', { delay: 5 }); // không dấu, chữ thường
    await page.waitForSelector('#mg-nguon-ds:not([hidden]) .combo-opt');
    const opts = await page.$$eval('#mg-nguon-ds .combo-opt b', (b) => b.map((x) => x.textContent));
    assert.deepEqual(opts.sort(), ['NCC_THienHAi', 'NCC_ThienHai']);
    // chọn đúng NCC_THienHAi bằng ↓
    const idx = opts.indexOf('NCC_THienHAi');
    for (let i = 0; i < idx; i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape'); // đóng danh sách, hộp thoại vẫn mở
    assert.equal(await page.locator('.modal').count(), 1);
    await page.keyboard.press('ArrowDown');
    for (let i = 0; i < idx; i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#mg-chips .filter-chip[data-ma="NCC_THienHAi"]');
    await page.focus('#mg-dich');
    await page.keyboard.type('NCC_ThienHai', { delay: 5 });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#mg-dich') && document.querySelector('#mg-dich').value === 'NCC_ThienHai', null, { timeout: 3000 })
      .catch(async (e) => { throw new Error('ô đích = ' + await page.$eval('#mg-dich', (x) => x.value) + ' | ' + await page.$eval('#mg-pick', (x) => x.innerText) + ' | toast ' + await page.$eval('#toast-root', (x) => x.innerText)); });
    await page.focus('.modal [data-act=preview]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#mg-table');
    await page.focus('.modal [data-act=merge]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.modal.small [data-act=yes]');
    await page.waitForFunction(() => document.activeElement && document.activeElement.matches('.modal.small [data-act=yes]')); // tiêu điểm đặt sẵn ở nút Gộp mã
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => /Đã gộp mã/.test(document.querySelector('#modal-root').innerText), null, { timeout: 5000 });
    const db = readStored(srv.dataDir);
    assert.equal(db.suppliers.find((s) => s.ma === 'NCC_THienHAi').gopVao, 'NCC_ThienHai');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});
