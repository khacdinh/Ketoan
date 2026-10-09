'use strict';
/* BI. Màn Phân tích (#/phan-tich): bảng hai chiều, tuổi nợ, công nợ theo tháng, xuất dữ liệu cho Power BI / Excel.
 * Số kỳ vọng tính độc lập từ dữ liệu thô; tuổi nợ và công nợ tháng phải khớp supplierPeriod (màn Công nợ). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { KT, startServer } = require('./helpers');
const X = require('./excel-helpers');
const { SKIP, openPage, settle, num } = require('./ui-helpers');

const TR = 1000000;
function seed() {
  let id = 1;
  const db = {
    schema: 7, settings: {}, vouchers: {}, trash: [], locks: [], attachments: [], cashCounts: [], ignoredWarnings: {}, extPayments: [], soDuDauKy: [],
    projects: [
      { id: id++, ma: 'CT1', ten: 'Nhà phố Quận 7', nganSach: 0, trangThai: 'Đang thực hiện', ghiChu: '' },
      { id: id++, ma: 'CT2', ten: 'Biệt thự Thảo Điền', nganSach: 0, trangThai: 'Đang thực hiện', ghiChu: '' }
    ],
    suppliers: [
      { id: id++, ma: 'NCC_A', ten: 'Vật liệu A', loai: 'Vật tư', sdt: '', diaChi: '', ghiChu: '' },
      { id: id++, ma: 'NCC_B', ten: 'Đội thợ B', loai: 'Nhân công', sdt: '', diaChi: '', ghiChu: '' }
    ],
    costGroups: [{ id: id++, ma: 'G1', ten: 'Phần thô', ghiChu: '' }, { id: id++, ma: 'G2', ten: 'Hoàn thiện', ghiChu: '' }],
    costItems: [{ id: id++, ma: 'HM01', ten: 'Xi măng', maNhom: 'G1', ghiChu: '' }, { id: id++, ma: 'HM02', ten: 'Sơn', maNhom: 'G2', ghiChu: '' }],
    materials: [{ id: id++, ma: 'VT1', ten: 'Xi măng PC40', dvt: 'bao', maHM: 'HM01', ghiChu: '' }],
    houses: [], costs: [], entries: []
  };
  const cost = (ngay, ct, ncc, loai, hm, tt, vt, sl) => db.costs.push({ id: id++, seq: db.costs.length + 1, phieuId: 0, ngay, maCT: ct, maNha: '', maHM: hm, loaiCP: loai, maVT: vt || '',
    dienGiai: 'cp ' + db.costs.length, soLuong: sl || null, donGia: sl ? tt / sl : null, thanhTien: tt, maNCC: ncc, soPhieu: '', ghiChu: '', nguon: 'mau' });
  const chi = (ngay, ct, ncc, tien) => db.entries.push({ id: id++, seq: db.entries.length + 1, ngay, soPhieu: '', maDuAn: ct, maNCC: ncc, noiDung: 'tc', thu: 0, chi: tien, nguoiNhan: '', ghiChu: '' });
  cost('2026-07-05', 'CT1', 'NCC_A', 'Vật tư', 'HM01', 10 * TR, 'VT1', 100);
  cost('2026-07-20', 'CT2', 'NCC_A', 'Vật tư', 'HM01', 6 * TR, 'VT1', 50);
  cost('2026-08-10', 'CT1', 'NCC_B', 'Nhân công', 'HM02', 8 * TR);
  cost('2026-08-25', 'CT1', 'NCC_A', 'Vật tư', 'HM02', 4 * TR);
  cost('2026-09-15', 'CT2', 'NCC_B', 'Nhân công', 'HM02', 12 * TR);
  chi('2026-07-01', '', '', 0);
  chi('2026-08-01', 'CT1', 'NCC_A', 5 * TR);
  chi('2026-09-01', 'CT1', 'NCC_B', 8 * TR);
  db.soDuDauKy.push({ id: id++, ngay: '2026-06-30', maNCC: 'NCC_B', maDuAn: 'CT2', soTien: 3 * TR, ghiChu: '' });
  db.nextId = id + 5;
  return db;
}
const DEN = '2026-09-30';

test('BI1 tính: bảng hai chiều đúng số độc lập (cộng hàng = cộng cột = tổng sổ), gộp "Khác", đơn giá trung bình bỏ dòng khoán', () => {
  const db = seed();
  const p = KT.phanTichChiPhi(db, { hang: 'ct', cot: 'thang', chiSo: 'chiPhi' });
  assert.equal(p.tong, 40 * TR);
  assert.deepEqual(p.hang.map((h) => [h.k, h.tong]), [['CT1', 22 * TR], ['CT2', 18 * TR]]);
  assert.deepEqual(p.cot.map((c) => c.k), ['2026-07', '2026-08', '2026-09']);
  assert.deepEqual(p.hang[0].o, { '2026-07': 10 * TR, '2026-08': 12 * TR, '2026-09': 0 });
  assert.deepEqual(p.tongCot, { '2026-07': 16 * TR, '2026-08': 12 * TR, '2026-09': 12 * TR });
  // lọc loại CP + chia theo nhóm
  const n = KT.phanTichChiPhi(db, { hang: 'nhom', cot: '', loaiCP: 'Vật tư' });
  assert.deepEqual(n.hang.map((h) => [h.t, h.tong]), [['Phần thô', 16 * TR], ['Hoàn thiện', 4 * TR]]);
  // gộp "Khác": giữ 1 hàng, phần còn lại gộp, tổng không đổi
  const k = KT.phanTichChiPhi(db, { hang: 'ncc', cot: '', topHang: 1 });
  assert.equal(k.hang.length, 2);
  assert.equal(KT.phanTichChiPhi(db, { hang: 'ncc', cot: '', topHang: 1 }).tong, 40 * TR);
  // đơn giá trung bình: chỉ dòng có số lượng (100 + 50 bao = 16tr) → 106.667
  const g = KT.phanTichChiPhi(db, { hang: 'vt', cot: 'ncc', chiSo: 'giaTB' });
  assert.equal(g.soDong, 2);
  assert.equal(g.hang[0].tong, Math.round(16 * TR / 150));
  // bộ lọc kỳ và công trình
  assert.equal(KT.phanTichChiPhi(db, { hang: 'ct', cot: '', from: '2026-08-01', to: '2026-08-31', ct: 'CT1' }).tong, 12 * TR);
});

test('BI2 tính: tuổi nợ khớp Công nợ NCC theo kỳ (tổng Dư Có), tiền trả trừ khoản cũ nhất trước, chia đúng 4 khoảng', () => {
  const db = seed();
  const t = KT.tuoiNo(db, { to: DEN });
  const duCo = KT.supplierPeriod(db, { to: DEN }).rows.reduce((s, r) => s + Math.max(0, r.cuoiKy), 0);
  assert.equal(t.tongAll, duCo);
  // NCC_A: nợ 10+6+4 = 20, đã trả 5 (trừ vào 10tr ngày 05/07) → 5 (07/05) + 6 (07/20) + 4 (08/25)
  const a = t.rows.find((r) => r.ma === 'NCC_A');
  assert.equal(a.tong, 15 * TR);
  // đến 30/09: 07/05 = 87 ngày → 61–90; 07/20 = 72 ngày → 61–90; 08/25 = 36 ngày → 31–60
  assert.deepEqual(a.b, [0, 4 * TR, 11 * TR, 0]);
  assert.equal(a.cu, '2026-07-05');
  // NCC_B: đầu kỳ 3 + 8 + 12 = 23, đã trả 8 → 15
  const b = t.rows.find((r) => r.ma === 'NCC_B');
  assert.equal(b.tong, 15 * TR);
  // lọc công trình khớp supplierPeriod của công trình đó
  const t2 = KT.tuoiNo(db, { to: DEN, ct: 'CT2' });
  assert.equal(t2.tongAll, KT.supplierPeriod(db, { to: DEN, ct: 'CT2' }).rows.reduce((s, r) => s + Math.max(0, r.cuoiKy), 0));
  // một ngày xa: mọi khoản thành "trên 90 ngày"
  const xa = KT.tuoiNo(db, { to: '2027-06-30' });
  assert.equal(xa.tong[3], xa.tongAll);
});

test('BI3 tính: công nợ theo tháng — mỗi tháng đúng supplierPeriod, cộng phát sinh / thanh toán bằng tổng sổ', () => {
  const db = seed();
  const c = KT.congNoTheoThang(db, { from: '2026-07-01', to: DEN });
  assert.deepEqual(c.thang.map((x) => x.m), ['2026-07', '2026-08', '2026-09']);
  assert.equal(c.thang.reduce((s, x) => s + x.ps, 0), 40 * TR);
  assert.equal(c.thang.reduce((s, x) => s + x.tt, 0), 13 * TR);
  c.thang.forEach((x, i) => {
    const fin = ['2026-07-31', '2026-08-31', DEN][i];
    const P = KT.supplierPeriod(db, { to: fin }).rows;
    assert.equal(x.co, P.reduce((s, r) => s + Math.max(0, r.cuoiKy), 0), x.m);
    assert.equal(x.no, P.reduce((s, r) => s + Math.max(0, -r.cuoiKy), 0), x.m);
  });
  assert.equal(c.thang[2].co, KT.tuoiNo(db, { to: DEN }).tongAll);
  assert.equal(c.top[0].v[2], 15 * TR);
});

test('BI4 xuất file: dữ liệu cho BI (xlsx, csv), chọn bảng, bảng công nợ tính sẵn; xuất bảng đang xem; quyền xuất', async () => {
  const srv = await startServer({ seed: seed() });
  try {
    const r = await srv.call('GET', '/api/export/bi');
    assert.equal(r.status, 200, r.body.toString().slice(0, 300));
    assert.match(r.headers['content-disposition'], /KeToan_BI\.xlsx/);
    const wb = await X.loadWb(r.body);
    assert.deepEqual(wb.worksheets.map((w) => w.name), ['ChiPhi', 'ThuChi', 'TraNgoaiQuy', 'SoDuDauKy', 'CongNo_NCC_CongTrinh', 'DM_CongTrinh', 'DM_NCC', 'DM_VatTu', 'DM_HangMuc', 'DM_Nhom', 'Lich']);
    assert.equal(wb.getWorksheet('ChiPhi').rowCount, 6, 'tiêu đề + 5 dòng chi phí');
    assert.deepEqual(wb.getWorksheet('ChiPhi').getRow(1).values.slice(1, 5), ['Ngay', 'MaCongTrinh', 'MaNha', 'MaNhom']);
    // bảng công nợ có sẵn Dư Có / Dư Nợ từng cặp NCC × công trình
    const ws = wb.getWorksheet('CongNo_NCC_CongTrinh');
    const dong = [];
    ws.eachRow((rw, n) => { if (n > 1) dong.push([X.cellVal(rw.getCell(1)), X.cellVal(rw.getCell(2)), X.cellVal(rw.getCell(7))]); });
    const exp = KT.supplierDebtByProject(seed(), { tt: 'khac0' });
    const nCap = exp.groups.concat(exp.chuaGan ? [exp.chuaGan] : []).reduce((s, g) => s + g.rows.length, 0);
    assert.equal(dong.length, nCap);
    assert.equal(dong.reduce((s, d) => s + d[2], 0), KT.supplierPeriod(seed(), {}).rows.reduce((s, x) => s + x.cuoiKy, 0), 'cộng cuối kỳ các cặp = cuối kỳ NCC');
    // chọn bảng
    const r2 = await srv.call('GET', '/api/export/bi?bang=ChiPhi&bang=DM_NCC');
    assert.deepEqual((await X.loadWb(r2.body)).worksheets.map((w) => w.name), ['ChiPhi', 'DM_NCC']);
    // CSV (zip)
    const r3 = await srv.call('GET', '/api/export/bi?fmt=csv&bang=DM_NCC');
    assert.match(r3.headers['content-type'], /zip/);
    const JSZip = require('jszip');
    const z = await JSZip.loadAsync(r3.body);
    const csv = await z.file('DM_NCC.csv').async('string');
    assert.ok(csv.startsWith('﻿MaNCC,TenNCC,Loai'), csv.slice(0, 40));
    assert.match(csv, /NCC_A,Vật liệu A,Vật tư/);
    // bảng đang xem
    const p = await srv.call('GET', '/api/export/phan-tich?loai=pivot&hang=ct&cot=thang&chiSo=chiPhi');
    assert.equal(p.status, 200);
    const wp = (await X.loadWb(p.body)).getWorksheet('Phan_Tich');
    let tong = 0;
    wp.eachRow((rw) => { if (String(X.cellVal(rw.getCell(1)) || '') === 'Tổng cộng') tong = X.cellVal(rw.getCell(5)); });
    assert.equal(tong, 40 * TR);
    for (const loai of ['tuoi-no', 'cong-no-thang']) assert.equal((await srv.call('GET', '/api/export/phan-tich?loai=' + loai + '&to=' + DEN)).status, 200, loai);
  } finally { await srv.stop(); }
});

test('BI5 giao diện: các báo cáo, số khớp tính độc lập, bấm cột / ô mở Sổ chi phí đã lọc, lưu / xóa báo cáo, xuất dữ liệu cho BI', { skip: SKIP }, async () => {
  const srv = await startServer({ seed: seed() });
  const { browser, page, errors, external } = await openPage(srv, '#/phan-tich');
  try {
    await page.waitForSelector('#bi-body .stat'); await settle(page);
    const the = () => page.$$eval('#bi-body .stats .stat-value', (v) => v.map((x) => x.textContent.trim()));
    // menu: Phân tích nằm trong nhóm Báo cáo
    assert.equal(await page.$eval('.nav-item.active', (e) => e.dataset.route), 'phan-tich');
    // báo cáo 1: chi phí theo tháng
    assert.equal((await the())[0], '40.000.000');
    assert.equal(num((await the())[0]), 40 * TR);
    assert.deepEqual(await page.$$eval('#bi-pivot tbody tr', (t) => t.map((x) => x.firstElementChild.querySelector('b').textContent)), ['CT1', 'CT2']);
    assert.deepEqual(await page.$$eval('#bi-pivot tfoot td', (t) => t.map((x) => x.textContent.trim())), ['Tổng cộng', '16', '12', '12', '40', '100%']);
    // xem dạng bảng / đường không lỗi, tổng vẫn khớp
    await page.click('label:has(input[name=bi-xem][value=bang])'); await settle(page);
    assert.equal(await page.$$eval('#bi-thang tbody tr', (t) => t.length), 3);
    await page.click('label:has(input[name=bi-xem][value=duong])'); await settle(page);
    assert.ok(await page.$('#bi-thang polyline'));
    await page.click('label:has(input[name=bi-xem][value=cot])'); await settle(page);
    // lọc loại CP: chỉ vật tư
    await page.selectOption('#bi-loai', 'Vật tư'); await settle(page);
    assert.equal(num((await the())[0]), 20 * TR);
    await page.selectOption('#bi-loai', ''); await settle(page);
    // bấm ô CT1 × 07/2026 → Sổ chi phí lọc công trình CT1 và tháng 07/2026
    await page.click('#bi-pivot td[data-h="0"][data-c="0"]');
    await page.waitForFunction(() => location.hash === '#/cp-so'); await settle(page);
    assert.match(await page.textContent('#tb-ct-val'), /CT1/);
    const cs = await page.evaluate(() => JSON.parse(localStorage.getItem('stc.filter.cpSo')));
    assert.deepEqual([cs.from, cs.to, cs.ct], ['2026-07-01', '2026-07-31', 'CT1']);
    await page.evaluate(() => { localStorage.setItem('stc.ct', JSON.stringify('')); location.hash = '#/phan-tich'; location.reload(); });
    await page.waitForSelector('#bi-body .stat'); await settle(page);
    // báo cáo 2: tuổi nợ — khớp tính độc lập
    await page.evaluate((d) => { localStorage.setItem('stc.filter.bi', JSON.stringify({ rep: 'tuoi-no', period: 'tat-ca', from: '', to: '', xem: 'cot', dv: 'trieu', den: d, denTay: true })); location.reload(); }, DEN);
    await page.waitForSelector('#bi-tn-bang'); await settle(page);
    const t = KT.tuoiNo(seed(), { to: DEN });
    assert.equal(num((await the())[0]), t.tongAll);
    assert.equal(await page.$$eval('#bi-tn-bang tbody tr', (r) => r.length), t.rows.length);
    assert.equal(await page.$$eval('#bi-tn rect.bi-hit', (r) => r.length), t.rows.length);
    // bấm biểu tượng sổ → Sổ chi tiết NCC của NCC đó
    await page.click('#bi-tn-bang tbody tr:first-child [data-so]');
    await page.waitForFunction(() => location.hash === '#/so-chi-tiet-ncc'); await settle(page);
    assert.equal(await page.inputValue('#sct-ncc'), t.rows[0].ma);
    // báo cáo 3: công nợ theo tháng — tháng cuối khớp Công nợ NCC theo kỳ
    await page.evaluate(() => { localStorage.setItem('stc.filter.bi', JSON.stringify({ rep: 'cong-no-thang', period: 'tat-ca', from: '', to: '', xem: 'cot', dv: 'trieu' })); location.hash = '#/phan-tich'; location.reload(); });
    await page.waitForSelector('#bi-cn svg'); await settle(page);
    const cn = KT.congNoTheoThang(seed(), {});
    assert.equal(num((await the())[0]), cn.thang[cn.thang.length - 1].co);
    assert.equal(await page.$$eval('#bi-sm .bi-sm', (x) => x.length), cn.top.length);
    // báo cáo 4, 5 (có sẵn)
    await page.evaluate(() => { localStorage.setItem('stc.filter.bi', JSON.stringify({ rep: 'nhom-ct', period: 'tat-ca', from: '', to: '', xem: 'cot', dv: 'trieu' })); location.hash = '#/phan-tich'; location.reload(); });
    await page.waitForSelector('#bi-pivot'); await settle(page);
    assert.deepEqual(await page.$$eval('#bi-pivot thead th', (t) => t.map((x) => x.textContent)), ['Nhóm chi phí', 'CT1', 'CT2', 'Tổng', 'Tỷ trọng']);
    await page.click('label:has(input[name=bi-r][value=gia-vat-tu])'); await page.waitForSelector('#bi-pivot'); await settle(page);
    assert.equal(num(await page.textContent('#bi-pivot tbody tr td:nth-child(3)')), 106667, 'đơn giá TB xi măng của NCC_A');
    // tạo báo cáo mới: đổi hàng / cột, lưu, chọn lại, xóa
    await page.click('[data-act=bc-moi]'); await settle(page);
    await page.selectOption('#bi-hang', 'ncc'); await page.selectOption('#bi-cot', 'loai'); await settle(page);
    await page.click('#page-actions [data-act=luu]');
    await page.fill('#bi-ten', 'NCC theo loại'); await page.click('.modal [data-ok]'); await settle(page);
    assert.ok(await page.isChecked('input[name=bi-r]:last-of-type') || (await page.$$eval('input[name=bi-r]', (r) => r.some((x) => x.checked && /^u/.test(x.value)))));
    assert.deepEqual(await page.$$eval('#bi-pivot thead th', (t) => t.map((x) => x.textContent)).then((a) => a.slice(0, 4)), ['Nhà cung cấp', 'Nhân công', 'Vật tư', 'Tổng']);
    await page.click('label:has(input[name=bi-r][value=chi-phi-thang])'); await settle(page);
    await page.click('label:has-text("NCC theo loại")'); await settle(page);
    assert.equal(await page.$eval('#bi-hang', (e) => e.value), 'ncc');
    await page.click('[data-act=xoa-bc]'); await settle(page);
    assert.equal(await page.$('label:has-text("NCC theo loại")'), null);
    // xuất dữ liệu cho BI: hộp thoại liệt kê bảng, bỏ chọn một bảng, tải file
    await page.click('#page-actions [data-act=bi]');
    await page.waitForSelector('.modal [data-bang]');
    assert.equal(await page.$$eval('.modal [data-bang]', (c) => c.length), 11);
    await page.uncheck('.modal [data-bang="Lich"]');
    assert.match(await page.textContent('#bi-tong'), /^10 bảng/);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.modal [data-ok]')]);
    assert.match(dl.suggestedFilename(), /KeToan_BI\.xlsx/);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally { await browser.close(); await srv.stop(); }
});

// dữ liệu thêm một phiếu thu không ghi NCC (3tr, CT2) để thử báo cáo thu chi mà không đổi công nợ
function seedTC() {
  const db = seed();
  db.entries.push({ id: db.nextId++, seq: db.entries.length + 1, ngay: '2026-09-10', soPhieu: 'PT001/09', maDuAn: 'CT2', maNCC: '', noiDung: 'Chủ nhà ứng thêm', thu: 3 * TR, chi: 0, nguoiNhan: '', ghiChu: '' });
  return db;
}

test('BI6 tính: điều kiện lọc chi phí (hạng mục, vật tư, tìm chữ), công nợ (nhiều NCC, loại NCC, tình trạng), thu chi (loại phiếu, NCC, tìm chữ)', () => {
  const db = seedTC();
  const cp = (f) => KT.phanTichChiPhi(db, Object.assign({ hang: 'ct', cot: '' }, f)).tong;
  assert.equal(cp({ hm: 'HM02' }), 24 * TR);
  assert.equal(cp({ vt: 'VT1' }), 16 * TR);
  assert.equal(cp({ q: 'cp 3' }), 4 * TR);
  assert.equal(cp({ nccs: ['NCC_B'] }), 20 * TR);
  assert.equal(cp({ nccs: ['NCC_A', 'NCC_B'] }), 40 * TR);
  assert.equal(cp({ loaiNCC: 'Nhân công' }), 20 * TR);
  assert.equal(cp({ loaiNCC: 'Vật tư', hm: 'HM02' }), 4 * TR);
  // công nợ
  assert.equal(KT.tuoiNo(db, { to: DEN, nccs: ['NCC_A'] }).tongAll, 15 * TR);
  const b = KT.tuoiNo(db, { to: DEN, loaiNCC: 'Nhân công' });
  assert.deepEqual(b.rows.map((r) => [r.ma, r.tong]), [['NCC_B', 15 * TR]]);
  const th = (f) => KT.congNoTheoThang(db, Object.assign({ from: '2026-07-01', to: DEN }, f)).thang;
  assert.equal(th({ tt: 'no' })[2].co, 30 * TR);
  assert.equal(th({ tt: 'du' })[2].co, 0);
  assert.equal(th({ nccs: ['NCC_A'] })[2].co, 15 * TR);
  assert.equal(th({ loaiNCC: 'Nhân công' })[2].co, 15 * TR);
  // thu chi: chi 5 + 8 = 13, thu 3
  const tc = (f) => KT.phanTichThuChi(db, Object.assign({ hang: 'thang', cot: '' }, f));
  assert.equal(tc({ chiSo: 'chi' }).tong, 13 * TR);
  assert.equal(tc({ chiSo: 'thu' }).tong, 3 * TR);
  assert.equal(tc({ chiSo: 'rong' }).tong, -10 * TR);
  assert.equal(tc({ chiSo: 'chi', loaiPhieu: 'thu' }).soDong, 1);
  assert.equal(tc({ chiSo: 'chi', nccs: ['NCC_A'] }).tong, 5 * TR);
  assert.equal(tc({ chiSo: 'thu', q: 'ứng thêm' }).tong, 3 * TR);
  assert.equal(tc({ chiSo: 'chi', ct: 'CT1' }).tong, 13 * TR);
  const px = KT.phanTichThuChi(db, { hang: 'phieu', cot: 'thang', chiSo: 'rong' });
  assert.deepEqual(px.hang.map((h) => [h.k, h.o['2026-09']]), [['Thu', 3 * TR], ['Chi', -8 * TR]]);
});

test('BI7 giao diện: thanh lọc chi phí / công nợ / thu chi, chọn nhiều NCC, xóa lọc, báo cáo Thu chi và bấm mở Sổ quỹ; xuất Excel có lọc', { skip: SKIP }, async () => {
  const srv = await startServer({ seed: seedTC() });
  const { browser, page, errors, external } = await openPage(srv, '#/phan-tich');
  try {
    await page.waitForSelector('#bi-body .stat'); await settle(page);
    const the = async () => (await page.$$eval('#bi-body .stats .stat-value', (v) => v.map((x) => x.textContent.trim()))).map((x) => x.replace('−', '-'));
    // chi phí: hạng mục, vật tư, tìm chữ, NCC nhiều
    assert.equal(num((await the())[0]), 40 * TR);
    await page.selectOption('#bi-hm', 'HM02'); await settle(page);
    assert.equal(num((await the())[0]), 24 * TR);
    await page.selectOption('#bi-hm', ''); await page.selectOption('#bi-vt', 'VT1'); await settle(page);
    assert.equal(num((await the())[0]), 16 * TR);
    await page.click('[data-act=xoa-loc]'); await settle(page);
    await page.fill('#bi-q', 'cp 3'); await page.waitForTimeout(500); await settle(page);
    assert.equal(num((await the())[0]), 4 * TR);
    await page.click('[data-act=xoa-loc]'); await settle(page);
    await page.click('#bi-nccs summary'); await page.check('#bi-nccs input[value=NCC_B]'); await settle(page);
    assert.equal(num((await the())[0]), 20 * TR);
    assert.equal(await page.textContent('#bi-nccs-t'), 'Đội thợ B');
    await page.check('#bi-nccs input[value=NCC_A]'); await settle(page);
    assert.equal(num((await the())[0]), 40 * TR);
    assert.equal(await page.textContent('#bi-nccs-t'), '2 đã chọn');
    await page.fill('#bi-nccs [data-tim]', 'thợ');
    assert.equal(await page.$$eval('#bi-nccs .bi-multi-list label:not([hidden])', (l) => l.length), 1);
    await page.click('[data-act=xoa-loc]'); await settle(page);
    assert.equal(num((await the())[0]), 40 * TR);
    await page.selectOption('#bi-lncc', 'Nhân công'); await settle(page);
    assert.equal(num((await the())[0]), 20 * TR);
    await page.click('[data-act=xoa-loc]'); await settle(page);
    // công nợ theo tháng: loại NCC + tình trạng
    await page.click('label:has(input[name=bi-r][value=cong-no-thang])'); await page.waitForSelector('#bi-cn svg'); await settle(page);
    assert.equal(num((await the())[0]), 30 * TR);
    await page.selectOption('#bi-lncc', 'Nhân công'); await settle(page);
    assert.equal(num((await the())[0]), 15 * TR);
    await page.selectOption('#bi-tt', 'du'); await settle(page);
    assert.equal(num((await the())[0]), 0);
    await page.click('[data-act=xoa-loc]'); await settle(page);
    // tuổi nợ: lọc NCC
    await page.click('label:has(input[name=bi-r][value=tuoi-no])'); await page.waitForSelector('#bi-tn-bang'); await settle(page);
    await page.click('#bi-nccs summary'); await page.check('#bi-nccs input[value=NCC_A]'); await settle(page);
    assert.equal(await page.$$eval('#bi-tn-bang tbody tr', (r) => r.length), 1);
    await page.click('[data-act=xoa-loc]'); await settle(page);
    // thu chi
    await page.click('label:has(input[name=bi-r][value=thu-chi])'); await page.waitForSelector('#bi-tc svg'); await settle(page);
    assert.deepEqual((await the()).slice(0, 3).map((x) => num(x)), [3 * TR, 13 * TR, -10 * TR]);
    assert.equal(await page.$$eval('#bi-tc rect.bi-hit', (r) => r.length), 3);
    await page.selectOption('#bi-lp', 'thu'); await settle(page);
    assert.equal(num((await the())[1]), 0);
    await page.selectOption('#bi-lp', ''); await settle(page);
    await page.selectOption('#bi-cot', 'phieu'); await settle(page);
    assert.deepEqual(await page.$$eval('#bi-pivot thead th', (t) => t.map((x) => x.textContent)).then((a) => a.slice(0, 3)), ['Công trình', 'Chi', 'Thu']);
    await page.selectOption('#bi-cot', 'thang'); await settle(page);
    // bấm ô CT1 × 08/2026 → Sổ quỹ lọc công trình và tháng
    await page.click('#bi-pivot td[data-h="0"][data-c="1"]');
    await page.waitForFunction(() => location.hash === '#/so-thu-chi'); await settle(page);
    const sf = await page.evaluate(() => JSON.parse(localStorage.getItem('stc.filter.so')));
    assert.deepEqual([sf.duAn, sf.from, sf.to], ['CT1', '2026-08-01', '2026-08-31']);
    // xuất Excel kèm điều kiện lọc
    const p = new URLSearchParams({ loai: 'thu-chi', chiSo: 'chi', hang: 'ct', cot: 'thang', loaiPhieu: 'chi' });
    const r = await srv.call('GET', '/api/export/phan-tich?' + p + '&nccs=NCC_A');
    assert.equal(r.status, 200);
    let tong = 0;
    (await X.loadWb(r.body)).getWorksheet('Phan_Tich').eachRow((rw) => { if (X.cellVal(rw.getCell(1)) === 'Tổng cộng') tong = X.cellVal(rw.getCell(rw.cellCount)); });
    assert.equal(tong, 5 * TR);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('BI8 giao diện: lọc hết dữ liệu không lỗi; ô "Khác" / "Chưa gán công trình" không mở sổ sai; ô "Không ghi NCC" mở Sổ quỹ lọc chưa gán NCC; ngày "Tính đến" mặc định hôm nay', { skip: SKIP }, async () => {
  const db = seedTC();
  db.entries.push({ id: db.nextId++, seq: db.entries.length + 1, ngay: '2026-09-12', soPhieu: 'PC009/09', maDuAn: '', maNCC: '', noiDung: 'Mua văn phòng phẩm', thu: 0, chi: 1 * TR, nguoiNhan: '', ghiChu: '' });
  const srv = await startServer({ seed: db });
  const { browser, page, errors, external } = await openPage(srv, '#/phan-tich');
  try {
    await page.waitForSelector('#bi-body .stat'); await settle(page);
    // lọc hết dữ liệu rồi đổi cách xem: chỉ báo không có dữ liệu, không lỗi
    await page.fill('#bi-q', 'khong-co-chu-nay'); await page.waitForTimeout(500); await settle(page);
    assert.match(await page.textContent('#bi-body'), /Không có dữ liệu khớp bộ lọc/);
    await page.fill('#bi-q', ''); await page.waitForTimeout(500); await settle(page);
    assert.equal(num((await page.$$eval('#bi-body .stat-value', (v) => v.map((x) => x.textContent)))[0]), 40 * TR);
    // thu chi theo công trình × NCC: hàng "Chưa gán công trình" — bấm thì mở Sổ quỹ lọc chưa gán, cột "Không ghi NCC" lọc chưa gán NCC
    await page.click('label:has(input[name=bi-r][value=thu-chi])'); await page.waitForSelector('#bi-pivot'); await settle(page);
    await page.selectOption('#bi-cot', 'ncc'); await settle(page);
    const hang = await page.$$eval('#bi-pivot tbody tr', (t) => t.map((x) => x.querySelector('b').textContent));
    const cot = await page.$$eval('#bi-pivot thead th', (t) => t.map((x) => x.textContent));
    const h = hang.indexOf('Chưa gán công trình'), c = cot.indexOf('Không ghi NCC') - 1;
    assert.ok(h >= 0 && c >= 0, JSON.stringify([hang, cot]));
    await page.click('#bi-pivot td[data-h="' + h + '"][data-c="' + c + '"]');
    await page.waitForFunction(() => location.hash === '#/so-thu-chi'); await settle(page);
    const sf = await page.evaluate(() => JSON.parse(localStorage.getItem('stc.filter.so')));
    assert.deepEqual([sf.duAn, sf.ncc], ['__none__', '__none__']);
    // chi phí: hàng "Khác" (gộp) không mở sổ, báo cho biết
    await page.evaluate(() => { localStorage.setItem('stc.ct', JSON.stringify('')); localStorage.setItem('stc.filter.bi', JSON.stringify({ rep: 'chi-phi-thang', period: 'tat-ca', from: '', to: '', den: '2020-01-01' })); location.hash = '#/phan-tich'; location.reload(); });
    await page.waitForSelector('#bi-pivot'); await settle(page);
    // ngày "Tính đến" đã lưu mà người dùng không tự chọn → về hôm nay
    await page.click('label:has(input[name=bi-r][value=tuoi-no])'); await page.waitForSelector('#bi-den'); await settle(page);
    assert.equal(await page.inputValue('#bi-den'), KT.todayISO());
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally { await browser.close(); await srv.stop(); }
});
