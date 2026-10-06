'use strict';
/* Z. Cảnh báo mới ở Kiểm soát › Cần xử lý: công nợ NCC, sổ thu chi, sổ chi phí — bấm “Mở để sửa” mở đúng chỗ sửa. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { KT, startServer } = require('./helpers');
const { SKIP, openPage, settle } = require('./ui-helpers');

function seed() {
  let id = 1;
  const db = {
    schema: 3, settings: {}, vouchers: {}, trash: [], locks: [], attachments: [], cashCounts: [], ignoredWarnings: {},
    projects: ['CT1', 'CT2'].map((ma) => ({ id: id++, ma, ten: 'Công trình ' + ma, nganSach: 0, trangThai: 'Đang thực hiện', ghiChu: '' })),
    suppliers: [{ id: id++, ma: 'A', ten: 'NCC A', loai: '', sdt: '', diaChi: '', ghiChu: '' }, { id: id++, ma: 'B', ten: 'NCC B', loai: '', sdt: '', diaChi: '', ghiChu: '' }],
    costGroups: [{ id: id++, ma: 'G1', ten: 'Vật liệu', ghiChu: '' }],
    costItems: [{ id: id++, ma: 'HM1', ten: 'Vật tư', maNhom: 'G1', ghiChu: '' }, { id: id++, ma: 'HM2', ten: 'Nhân công', maNhom: 'G1', ghiChu: '' }],
    materials: [{ id: id++, ma: 'XM', ten: 'Xi măng', dvt: 'bao', maHM: 'HM1', loaiCP: '', ghiChu: '' }], houses: [], costs: [], entries: []
  };
  const cost = (o) => db.costs.push(Object.assign({ id: id++, seq: db.costs.length + 1, phieuId: 900, ngay: '2026-01-05', maCT: 'CT1', maNha: '', maHM: 'HM1', loaiCP: 'Vật tư', maVT: 'XM',
    dienGiai: '', soLuong: 10, donGia: 100000, thanhTien: 1000000, maNCC: 'A', soPhieu: '', ghiChu: '' }, o));
  const ent = (o) => db.entries.push(Object.assign({ id: id++, seq: db.entries.length + 1, ngay: '2026-01-10', soPhieu: '', maDuAn: '', maNCC: '', noiDung: 'x', thu: 0, chi: 0, nguoiNhan: '', ghiChu: '' }, o));
  cost({});                                            // A nợ ở CT1 1.000.000 (cũ, từ 05/01)
  cost({ maHM: 'HM2', thanhTien: 500000, soLuong: 5 }); // hạng mục lệch vật tư (XM thuộc HM1)
  cost({ maNCC: 'B', soLuong: 2, donGia: 100000, thanhTien: 250000 }); // B: thành tiền khác SL × ĐG
  ent({ ngay: '2026-01-01', soPhieu: 'PT001/01', thu: 3000000, noiDung: 'Nộp quỹ' });
  ent({ soPhieu: 'PC001/01', maNCC: 'B', chi: 400000, noiDung: 'Trả B không công trình' });        // trả NCC chưa ghi công trình → B cũng trả vượt
  ent({ soPhieu: 'PC002/01', maNCC: 'A', maDuAn: 'CT2', chi: 100000, noiDung: 'Trả A nhầm CT2' });   // A không có chi phí ở CT2
  ent({ soPhieu: 'PT002/01', chi: 50000, noiDung: 'Số phiếu thu nhưng là khoản chi' });
  ent({ chi: 6000000, noiDung: 'Chi lớn không đối tượng, không số phiếu' });                      // không số phiếu + chi lớn + quỹ âm
  db.nextId = id + 5;
  return db;
}

test('Z1 phát hiện: trả NCC chưa ghi / ghi nhầm công trình, trả vượt, nợ lâu chưa trả; số phiếu sai loại, chi chưa có số phiếu, chi lớn không đối tượng, tồn quỹ âm; hạng mục lệch vật tư, thành tiền ≠ SL × ĐG', () => {
  const a = KT.anomalies(seed(), { today: '2026-10-06' });
  const by = (loai) => a.items.filter((i) => i.loai === loai).map((i) => i.key.split(':').slice(0, 2).join(':')).sort();
  assert.deepEqual(by('congno'), ['congno:khongct', 'congno:nolau', 'congno:saict', 'congno:ungdu'].sort());
  assert.deepEqual(by('thuchi'), ['thuchi:am', 'thuchi:doituong', 'thuchi:loai', 'thuchi:sophieu']);
  assert.deepEqual(by('chiphi'), ['chiphi:hm', 'chiphi:tt']);
  const ungdu = a.items.find((i) => i.key.startsWith('congno:ungdu'));
  assert.deepEqual(ungdu.target, { kind: 'ncc', ma: 'B' });
  assert.match(ungdu.tieuDe, /NCC B.*150\.000/);
  // nợ lâu: ngưỡng chỉnh được
  assert.equal(KT.anomalies(Object.assign(seed(), { settings: { soNgayNoLau: 365 } }), { today: '2026-10-06' }).items.some((i) => i.key.startsWith('congno:nolau')), false);
  // chi lớn: ngưỡng chỉnh được
  assert.equal(KT.anomalies(Object.assign(seed(), { settings: { nguongChiLon: 10000000 } }), { today: '2026-10-06' }).items.some((i) => i.key.startsWith('thuchi:doituong')), false);
});

test('Z2 Cần xử lý trên giao diện: có nhóm Công nợ / Sổ thu chi / Sổ chi phí; “Mở để sửa” mở trang Ghi thu / chi, form sửa dòng chi phí (hạng mục theo vật tư), Sổ chi tiết NCC; lưu lại thì cảnh báo hết', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({ seed: seed() });
  const { browser, page, errors } = await openPage(srv, '#/kiem-soat');
  try {
    await page.waitForSelector('[data-loai=congno]');
    for (const l of ['congno', 'thuchi', 'chiphi']) assert.equal(await page.locator('[data-loai=' + l + ']').count() > 0, true, 'có nhóm ' + l);
    // dòng trả nhầm công trình → mở trang Ghi thu / chi đúng dòng
    const item = (re) => page.locator('#view li[data-key]').filter({ hasText: re }).first();
    await item(/cho công trình CT2/).locator('[data-act=mo]').click();
    await page.waitForSelector('#entry-page');
    await page.waitForTimeout(150);
    assert.equal(await page.inputValue('#entry-page [name=maDuAn]'), 'CT2');
    await page.fill('#entry-page [name=maDuAn]', 'CT1'); await page.locator('#entry-page [name=maDuAn]').dispatchEvent('change');
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => location.hash.startsWith('#/kiem-soat'));
    await settle(page);
    assert.equal(KT.anomalies(await srv.db(), { today: KT.todayISO() }).items.some((i) => i.key.startsWith('congno:saict')), false, 'sửa xong hết cảnh báo');
    // dòng chi phí lệch hạng mục → form sửa dòng, lưu lại theo hạng mục của vật tư
    await page.waitForSelector('[data-loai=chiphi]');
    await item(/hạng mục khác hạng mục của vật tư/).locator('[data-act=mo]').click();
    await page.waitForSelector('#cl-form');
    assert.equal(await page.inputValue('#cl-form input[name=maHM]'), 'Vật tư', 'hạng mục theo vật tư');
    await page.click('[data-act=save]');
    await page.waitForSelector('#cl-form', { state: 'detached' });
    await settle(page);
    assert.equal(KT.anomalies(await srv.db(), { today: KT.todayISO() }).items.some((i) => i.key.startsWith('chiphi:hm')), false);
    // NCC trả vượt → Sổ chi tiết NCC của B
    await item(/nhiều hơn chi phí/).locator('[data-act=mo]').click();
    await page.waitForFunction(() => location.hash === '#/so-chi-tiet-ncc');
    await page.waitForSelector('#sct-body tr');
    assert.match(await page.textContent('#page-title'), /NCC B/);
    assert.deepEqual(errors.filter((e) => !/status of 4/.test(e)), []);
  } finally { await browser.close(); await srv.stop(); }
});

test('Z3 chỉ một ô lọc Công trình: Sổ quỹ không còn ô riêng, dùng ô ở thanh trên (có “Chưa gán công trình”); ô ở thanh trên ẩn ở màn hình không lọc theo công trình', { skip: SKIP, timeout: 120000 }, async () => {
  const srv = await startServer({ seed: seed() });
  const { browser, page, errors } = await openPage(srv, '#/so-thu-chi');
  const hien = () => page.isVisible('#tb-ct');
  try {
    await page.waitForSelector('#so-body tr');
    assert.equal(await page.locator('#view [aria-label="Lọc theo công trình"], #so-duan').count(), 0);
    assert.equal(await hien(), true);
    // chọn CT2 ở thanh trên → Sổ quỹ chỉ còn dòng CT2
    await page.click('#tb-ct'); await page.fill('#ct-q', 'CT2'); await page.press('#ct-q', 'Enter'); await settle(page);
    assert.deepEqual(await page.$$eval('#so-body tr[data-id]', (t) => t.length), 1);
    // sang Sổ chi phí: vẫn CT2 (dùng chung)
    await page.evaluate(() => { location.hash = '#/cp-so'; }); await settle(page);
    assert.match(await page.textContent('#tb-ct-val'), /^CT2/);
    // màn hình không lọc theo công trình: ẩn ô
    for (const h of ['#/tong-quan', '#/phieu', '#/cp-nhap', '#/ghi-thu-chi', '#/du-an', '#/kiem-soat', '#/cai-dat']) {
      await page.evaluate((x) => { location.hash = x; }, h); await settle(page);
      assert.equal(await hien(), false, 'ẩn ở ' + h);
    }
    for (const h of ['#/so-thu-chi', '#/cp-so', '#/cp-tong-hop', '#/cp-chi-tiet', '#/cp-cong-no', '#/so-chi-tiet-ncc']) {
      await page.evaluate((x) => { location.hash = x; }, h); await settle(page);
      assert.equal(await hien(), true, 'hiện ở ' + h);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});
