'use strict';
/* M-UI. Gộp mã qua giao diện thật (Chromium): danh mục → tích chọn → Gộp mã → xem trước → xác nhận → kết quả → Lịch sử → Hoàn tác.
 * Thao tác được bằng bàn phím (ô chọn gõ tìm dùng ↑↓ Enter), không lỗi console. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { KT, startServer, readStored } = require('./helpers');
const { SKIP, openPage, settle, pick } = require('./ui-helpers');

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

function seedHM() {
  const db = seed();
  let id = db.nextId;
  db.costGroups.push({ id: id++, ma: 'G2', ten: 'Chi phí chung', ghiChu: '' });
  db.costItems.push({ id: id++, ma: 'HM02', ten: 'Vật tư  vlxd', maNhom: 'G1', ghiChu: '' }, { id: id++, ma: 'HM37', ten: 'Bảo hành', maNhom: 'G2', ghiChu: '' });
  for (let i = 0; i < 5; i++) {
    db.costs.push({ id: id++, seq: db.costs.length + 1, phieuId: 0, ngay: '2026-08-0' + (i + 1), maCT: 'CT1', maNha: '', maHM: i < 2 ? 'HM02' : 'HM37', loaiCP: 'Dịch vụ-Phí', maVT: '', dienGiai: 'hm ' + i,
      soLuong: 1, donGia: 1000000 * (i + 1), thanhTien: 1000000 * (i + 1), maNCC: 'NCC_Khac', soPhieu: '', ghiChu: '', nguon: 'mau' });
  }
  db.nextId = id + 5;
  return db;
}

test('MU3 gộp hạng mục từ Danh mục chi phí (tích 2 dòng → Gộp mã → xác nhận → kết quả) và tách mã hạng mục ở màn Gộp mã: tạo hạng mục mới, bỏ tích một dòng ở xem trước, đổi đúng các dòng còn tích, Hoàn tác ngay tại chỗ', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({ seed: seedHM() });
  const { browser, page, errors } = await openPage(srv, '#/cp-danh-muc');
  try {
    const start = readStored(srv.dataDir);
    // gộp HM02 → HM01 ở tab Hạng mục
    await page.waitForSelector('[data-pick="HM01"]');
    await page.check('[data-pick="HM01"]');
    await page.check('[data-pick="HM02"]');
    await page.click('[data-act=merge]');
    await page.waitForSelector('#mg-table');
    assert.match(await page.$eval('#mg-table', (e) => e.innerText), /2 dòng chi phí/);
    await page.click('.modal [data-act=merge]:not([disabled])');
    await page.click('.modal [data-act=yes]');
    await page.waitForFunction(() => /Đã gộp mã/.test(document.querySelector('#modal-root').innerText), null, { timeout: 5000 });
    await page.click('#modal-root [data-act=ok]');
    let db = readStored(srv.dataDir);
    assert.equal(db.costItems.find((i) => i.ma === 'HM02').gopVao, 'HM01');
    assert.equal(db.costs.filter((c) => c.maHM === 'HM01').length, start.costs.filter((c) => c.maHM === 'HM01' || c.maHM === 'HM02').length);
    // tách: 3 dòng HM37 của CT1 → hạng mục mới HM37B, bỏ tích dòng ngày 05/08
    await page.evaluate(() => { location.hash = '#/gop-ma'; });
    await page.waitForSelector('label.seg-item:has(input[name=gm-tab][value=tach])');
    await page.click('label.seg-item:has(input[name=gm-tab][value=tach])');
    await page.waitForSelector('#sp-tu');
    await pick(page, '#sp-tu', 'HM37');
    await page.check('#sp-moi');
    await page.fill('#sp-moi-ma', 'HM37B');
    await page.fill('#sp-moi-ten', 'Chi phí quản lý');
    await pick(page, '#sp-nhom', 'G2');
    await pick(page, '#sp-ct', 'CT1');
    await page.click('[data-act=sp-preview]');
    await page.waitForSelector('#sp-rows input[data-sp-id]');
    assert.equal(await page.locator('#sp-rows input[data-sp-id]').count(), 3);
    const bo = start.costs.find((c) => c.ngay === '2026-08-05');
    await page.uncheck('#sp-rows input[data-sp-id="' + bo.id + '"]');
    assert.match(await page.$eval('#sp-sel', (e) => e.innerText), /2\/3 dòng/);
    await page.click('[data-act=sp-apply]:not([disabled])');
    await page.click('.modal [data-act=yes]');
    await page.waitForSelector('#sp-done');
    db = readStored(srv.dataDir);
    assert.ok(db.costItems.some((i) => i.ma === 'HM37B' && i.maNhom === 'G2'));
    assert.deepEqual(db.costs.filter((c) => c.maHM === 'HM37B').map((c) => c.ngay).sort(), ['2026-08-03', '2026-08-04']);
    assert.equal(db.costs.find((c) => c.id === bo.id).maHM, 'HM37', 'dòng bỏ tích giữ nguyên');
    // hoàn tác ngay tại chỗ
    await page.click('#sp-done [data-act=sp-undo]');
    await page.click('.modal [data-act=yes]');
    await page.waitForFunction(() => !document.querySelector('#sp-done'));
    db = readStored(srv.dataDir);
    assert.ok(!db.costItems.some((i) => i.ma === 'HM37B'));
    assert.equal(db.costs.filter((c) => c.maHM === 'HM37').length, 3);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

function seedDA() {
  const db = seed();
  let id = db.nextId;
  db.projects[0].nganSach = 300000000;
  db.projects.push({ id: id++, ma: 'CT1B', ten: 'Công trình 1 (mã cũ)', nganSach: 100000000, trangThai: 'Đang thực hiện', ghiChu: '', ngayKhoiCong: '2026-01-05' });
  db.houses.push({ id: id++, ma: 'C1', ten: 'Dùng chung', maCT: 'CT1', dienTich: '', chuNha: '', chung: true, ghiChu: '' },
    { id: id++, ma: 'C1B', ten: 'Dùng chung', maCT: 'CT1B', dienTich: '', chuNha: '', chung: true, ghiChu: '' },
    { id: id++, ma: 'L9', ten: 'Lô 9', maCT: 'CT1B', dienTich: 90, chuNha: '', chung: false, ghiChu: '' });
  for (let i = 0; i < 3; i++) {
    db.costs.push({ id: id++, seq: db.costs.length + 1, phieuId: 0, ngay: '2026-08-2' + i, maCT: 'CT1B', maNha: i ? 'L9' : 'C1B', maHM: 'HM01', loaiCP: 'Vật tư', maVT: '', dienGiai: 'ct1b ' + i,
      soLuong: 1, donGia: 2000000, thanhTien: 2000000, maNCC: 'NCC_Khac', soPhieu: '', ghiChu: '', nguon: 'mau' });
  }
  db.entries.push({ id: id++, seq: db.entries.length + 1, ngay: '2026-08-25', soPhieu: '', maDuAn: 'CT1B', maNCC: 'NCC_Khac', noiDung: 'trả ct1b', thu: 0, chi: 1500000, nguoiNhan: '', ghiChu: '' });
  db.nextId = id + 5;
  return db;
}

test('MU4 gộp dự án ở màn Dự án: tích 2 dự án → Gộp mã → bắt chọn ngân sách (chọn Cộng) → nhà dùng chung gộp vào nhà dùng chung của đích → kết quả; dự án đích có đủ chi phí, nhà; Hoàn tác', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({ seed: seedDA() });
  const { browser, page, errors } = await openPage(srv, '#/du-an');
  try {
    const start = readStored(srv.dataDir);
    await page.waitForSelector('[data-pick="CT1"]');
    await page.check('[data-pick="CT1"]');
    await page.check('[data-pick="CT1B"]');
    await page.click('[data-act=merge]');
    await page.waitForSelector('#mg-table');
    const pv = await page.$eval('#mg-preview', (e) => e.innerText);
    assert.match(pv, /ngân sách/);
    assert.equal(await page.$eval('.modal [data-act=merge]', (b) => b.disabled), true, 'chưa chọn ngân sách thì chưa gộp được');
    await page.selectOption('[data-giu=nganSach]', 'cong');
    await page.waitForFunction(() => document.querySelector('[data-giu=nganSach]') && document.querySelector('[data-giu=nganSach]').value === 'cong');
    // nhà dùng chung C1B → C1
    await page.selectOption('[data-nha="C1B"]', 'C1');
    await page.waitForFunction(() => document.querySelector('[data-nha="C1B"]') && document.querySelector('[data-nha="C1B"]').value === 'C1');
    await page.click('.modal [data-act=merge]:not([disabled])');
    await page.click('.modal [data-act=yes]');
    await page.waitForFunction(() => /Đã gộp mã/.test(document.querySelector('#modal-root').innerText), null, { timeout: 5000 });
    await page.click('#modal-root [data-act=ok]');
    let db = readStored(srv.dataDir);
    const ct1 = db.projects.find((p) => p.ma === 'CT1');
    assert.deepEqual([ct1.nganSach, ct1.ngayKhoiCong], [400000000, '2026-01-05']);
    assert.equal(db.projects.find((p) => p.ma === 'CT1B').gopVao, 'CT1');
    assert.equal(db.houses.find((x) => x.ma === 'L9').maCT, 'CT1');
    assert.equal(db.houses.find((x) => x.ma === 'C1B').gopVao, 'C1');
    assert.equal(db.costs.filter((c) => c.maCT === 'CT1' && c.maNha === 'C1').length, 1);
    assert.equal(db.entries.filter((e) => e.maDuAn === 'CT1B').length, 0);
    // màn Dự án ẩn mã đã gộp
    await page.waitForFunction(() => !document.querySelector('[data-pick="CT1B"]'));
    await page.check('[data-merged-toggle]');
    await page.waitForFunction(() => /Đã gộp vào CT1/.test(document.querySelector('#pj-body').innerText));
    // hoàn tác ở màn Gộp mã
    await page.evaluate(() => { location.hash = '#/gop-ma'; });
    await page.waitForSelector('#gm-log tr[data-id] [data-act=undo]');
    await page.click('#gm-log [data-act=undo]');
    await page.click('.modal [data-act=yes]');
    await page.waitForFunction(() => /Đã hoàn tác/.test(document.querySelector('#gm-log').innerText), null, { timeout: 5000 });
    db = readStored(srv.dataDir);
    const strip = (d) => { const x = JSON.parse(JSON.stringify(d)); ['mergeLog', 'aliases', 'updatedAt', 'nextId'].forEach((k) => delete x[k]); return x; };
    assert.deepEqual(strip(db), strip(start), 'hoàn tác: dữ liệu như ban đầu');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('MU5 tab Gợi ý mã trùng: hiện nhóm nghi trùng kèm số chỗ dùng; Bỏ qua → ẩn và nhớ; Hiện lại; Gộp… mở hộp thoại với mã dùng nhiều nhất làm đích', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({ seed: seedHM() });
  const { browser, page, errors } = await openPage(srv, '#/gop-ma');
  try {
    await page.click('label.seg-item:has(input[name=gm-tab][value=goi-y])');
    await page.waitForSelector('#gm-suggest tbody tr[data-i]');
    const txt = await page.$eval('#gm-suggest', (e) => e.innerText);
    assert.match(txt, /NCC_ThienHai/); assert.match(txt, /NCC_THienHAi/); assert.match(txt, /HM02/);
    const rowNcc = '#gm-suggest tr[data-i]:has-text("NCC_THienHAi")';
    await page.click(rowNcc + ' [data-act=bo-qua]');
    await page.waitForFunction(() => document.querySelector('#gm-suggest') && !/NCC_THienHAi/.test(document.querySelector('#gm-suggest').innerText));
    assert.ok(Object.keys(readStored(srv.dataDir).ignoredDupes).some((k) => /^ncc:ma:/.test(k)), 'bỏ qua được lưu');
    await page.click('[data-act=hien-bo-qua]');
    await page.waitForFunction(() => document.querySelector('#gm-suggest') && /NCC_THienHAi/.test(document.querySelector('#gm-suggest').innerText));
    // Gộp… nhóm hạng mục: đích mặc định là mã dùng nhiều nhất (HM01)
    await page.click('#gm-suggest tr[data-i]:has-text("HM02") [data-act=gop]');
    await page.waitForSelector('#mg-table');
    assert.equal(await page.$eval('#mg-dich', (x) => x.value), 'HM01');
    assert.ok(await page.$('#mg-chips .filter-chip[data-ma="HM02"]'));
    await page.click('.modal [data-act=cancel]');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});
