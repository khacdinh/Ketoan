'use strict';
/* I. Công cụ nhập Excel công trình (scripts/import-excel-chiphi.js, lib/importCongTrinh.js) — dữ liệu mẫu TỔNG HỢP nhỏ (không dùng dữ liệu thật):
 * các quy tắc làm sạch ("điểm bẩn"), đối chiếu số kỳ vọng độc lập, idempotent (chạy lại không nhân đôi), rollback, file lỗi / khóa,
 * phần mềm đang chạy, kiểm tra trước khi COMMIT. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { tmpDir, makeDataDir, readStored, startServer, KT } = require('./helpers');
const imp = require('../lib/importCongTrinh');
const cli = require('../scripts/import-excel-chiphi');
const { computeExpected } = require('../scripts/so-ky-vong-excel');
const { Store } = require('../lib/store');

const quiet = { log: () => {}, err: () => {} };
const NKC_HEAD = ['Ngày', 'Mã CT', 'Mã Nhà', 'Hạng mục', 'Nhóm CP', 'Loại CP', 'Mã VT', 'Tên vật tư', 'ĐVT', 'Diễn giải / Quy cách', 'Số lượng', 'Đơn giá', 'Thành tiền', 'Mã NCC', 'Tên NCC', 'Số phiếu', 'Ghi chú', 'Nguồn'];
const SQ_HEAD = ['Số phiếu', 'Ngày', 'Loại', 'Nhóm thu chi', 'Mã CT', 'Mã Nhà', 'Mã NCC', 'Họ tên người nộp / nhận', 'Địa chỉ', 'Lý do / Nội dung', 'Số tiền', 'Hình thức', 'Kèm chứng từ (tờ)', 'Thu', 'Chi', 'Tồn quỹ', 'Ghi chú', 'Column1'];
const D = (s) => new Date(s + 'T00:00:00Z');

// Dựng một file ChiPhi_CongTrinh mẫu. rows: mảng object theo tên cột; tt: số gõ tay, hoặc 'f' = công thức =K*L (giá trị lưu sẵn cố ý SAI để chắc không dùng cache)
async function makeWorkbook(file, o) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('NHATKYCHUNG');
  ws.addRow(NKC_HEAD);
  (o.rows || []).forEach((r, i) => {
    const n = i + 2;
    const row = ws.getRow(n);
    const set = (col, v) => { if (v !== undefined && v !== '') row.getCell(col).value = v; };
    set(1, r.ngay ? D(r.ngay) : undefined); set(2, r.ct); set(3, r.nha); set(4, r.hm);
    row.getCell(5).value = { formula: 'IFERROR(INDEX(DM_HANGMUC!$B:$B,MATCH($D' + n + ',DM_HANGMUC!$C:$C,0)),"")', result: 'nhóm (lưu sẵn)' };
    set(6, r.loai); set(7, r.vt); set(10, r.dg2); set(11, r.sl); set(12, r.dgia);
    if (r.tt === 'f' || r.tt === undefined) row.getCell(13).value = { formula: 'IF($K' + n + '="","",$K' + n + '*$L' + n + ')', result: 999999999 };
    else row.getCell(13).value = r.tt;
    set(14, r.ncc); set(16, r.sp); set(17, r.gc);
    row.getCell(18).value = 'phieu nhap';
  });
  // dòng công thức trống phía dưới (như file thật)
  for (let n = (o.rows || []).length + 2; n < (o.rows || []).length + 8; n++) { ws.getRow(n).getCell(13).value = { formula: 'IF($K' + n + '="","",$K' + n + '*$L' + n + ')', result: '' }; ws.getRow(n).getCell(18).value = 'phieu nhap'; }
  const sq = wb.addWorksheet('SO_QUY');
  sq.addRow(SQ_HEAD);
  (o.cash || []).forEach((q, i) => {
    const n = i + 2;
    const row = sq.getRow(n);
    const set = (col, v) => { if (v !== undefined && v !== '') row.getCell(col).value = v; };
    set(1, q.sp); set(2, q.ngay ? D(q.ngay) : undefined); set(3, q.loai); set(5, q.ct); set(7, q.ncc); set(10, q.lyDo); set(17, q.gc);
    if (q.soTienFormula) row.getCell(11).value = { formula: 'tblSoQuy[[#This Row],[Chi]]', result: 123 };
    else set(11, q.soTien);
    if (q.chi !== undefined) row.getCell(15).value = q.chi; else row.getCell(15).value = { formula: 'tblSoQuy[[#This Row],[Số tiền]]', result: q.soTien || 0 };
  });
  const ct = wb.addWorksheet('DM_CONGTRINH');
  ct.addRow(['Mã CT', 'Tên công trình', 'Địa chỉ', 'Ngày khởi công', 'Trạng thái', 'Ghi chú']);
  ct.addRow([o.ct.ma, o.ct.ten, o.ct.diaChi || '', o.ct.ngay || '1/8/2026', 'Đang thi công']);
  if (o.ct.ghiNgoai) ct.getCell('I2').value = o.ct.ghiNgoai;
  const nha = wb.addWorksheet('DM_NHA');
  nha.addRow(['Mã Nhà', 'Mã CT', 'Tên nhà', 'Diện tích sàn (m2)', 'Chủ nhà', 'Ghi chú']);
  (o.houses || [[o.ct.ma, o.ct.ma, 'Dùng chung cả công trình']]).forEach((h) => nha.addRow(h));
  const gr = wb.addWorksheet('DM_NHOM');
  gr.addRow(['Mã nhóm', 'Tên nhóm CP', 'Ghi chú']);
  [['NHOM_ChiPhiBanDau', '1. Chi phí ban đầu'], ['NHOM_ChiPhiPhanTho', '2. Chi phí phần thô'], ['NHOM_ChiPhiKhac', '6. Chi phí khác']].forEach((g) => gr.addRow(g));
  const hm = wb.addWorksheet('DM_HANGMUC');
  hm.addRow(['Mã HM', 'Nhóm CP', 'Hạng mục', 'Mã nhóm']);
  (o.items || [['HM01', '', 'Hồ sơ pháp lý', 'NHOM_ChiPhiBanDau'], ['HM03', '', 'Sắt thép xây dựng', 'NHOM_ChiPhiPhanTho'], ['HM06', '', 'Nhân công thợ nề', 'NHOM_ChiPhiPhanTho'], ['HM04', '', 'Vật tư VLXD', 'NHOM_ChiPhiPhanTho']]).forEach((x) => hm.addRow(x));
  const vt = wb.addWorksheet('DM_VATTU');
  vt.addRow(['Mã VT', 'Tên vật tư', 'ĐVT chuẩn', 'Hạng mục hay dùng', 'Số lần đã mua', 'Tổng đã mua (đ)', 'Ghi chú']);
  (o.mats || [['ST-D10', 'Thép D10', 'cây', 'Sắt thép xây dựng'], ['XX-KHAC', '(Chung, quản lý...)', 'khoản', ''], ['NE-CONG', 'Nhân công thợ nề', 'khoản', 'Nhân công thợ nề'], ['DN-KHOAN', 'Điện nước khoán', 'khoản', '']]).forEach((x) => vt.addRow(x));
  vt.addRow(['TỔNG', 'TỔNG', 'TỔNG']);
  const ncc = wb.addWorksheet('DM_NCC');
  ncc.addRow(['Mã NCC', 'Tên nhà cung cấp', 'Loại', 'Số dòng', 'Tổng giao dịch (đ)', 'SĐT', 'Địa chỉ', 'Ghi chú']);
  (o.sups || [['NCC_ThepA', 'Thép A', 'Vật tư'], ['NCC_Tho', 'Thợ B', 'Nhân công']]).forEach((x) => ncc.addRow(x));
  const tc = wb.addWorksheet('DM_NHOMTHUCHI');
  tc.addRow(['Mã', 'Loại', 'Nhóm thu chi', 'Ghi chú', '', '', '', '', 'TỒN QUỸ ĐẦU KỲ']);
  tc.addRow(['T01', 'Thu', 'Chủ nhà thanh toán', '', '', '', '', '', 0]);
  if (o.junk) { const j = wb.addWorksheet('thanh toán'); j.getCell('E4').value = o.junk; }
  await wb.xlsx.writeFile(file);
  return file;
}

function baseRows() {
  return [
    { ngay: '2026-08-10', ct: 'CTA', nha: 'CTA', hm: 'Sắt thép xây dựng', loai: 'Vật tư', vt: 'ST-D10', sl: 10, dgia: 100000, ncc: 'NCC_ThepA' },     // bình thường: 1.000.000
    { ngay: '2026-08-10', hm: 'Sắt thép xây dựng', vt: 'ST-D10', tt: 350000, ncc: 'NCC_ThepA' },                                                  // khoán, thiếu CT/nhà/loại
    { ngay: '2026-08-11', ct: 'CTA', nha: 'CTA', hm: 'Hồ sơ pháp lý', vt: 'XX-KHAC', sl: 2, dgia: 50000, tt: 120000, ncc: 'ncc_thepa' },          // gõ đè thành tiền lệch, mã NCC chữ thường
    { ngay: '2026-08-12', ct: 'KHAC99', nha: 'NHA_LA', hm: 'Nhân công thợ nề', vt: 'NE-CONG', tt: 5000000, ncc: 'NCC_Tho', sp: 'PC…/08' },        // mã CT, mã nhà sai; số phiếu giả
    { ngay: '2026-08-12', ct: 'CTA', hm: 'Vật tư VLXD', dg2: 'tạm tính', tt: 7000000, ncc: 'NCC_ThepA', sp: 'pc005/08' },                         // không mã VT, số phiếu chữ thường
    { ngay: '2026-08-13', ct: 'CTA', hm: 'Vật tư VLXD', dg2: 'không có tiền' },                                                                    // không có tiền → bỏ qua
    { ngay: '2026-08-14', ct: 'CTA', nha: 'CTA', hm: 'Sắt thép xây dựng', vt: 'ST-D10', sl: 1, dgia: 100000, ncc: 'NCC_ThepA' },                  // hai dòng giống hệt
    { ngay: '2026-08-14', ct: 'CTA', nha: 'CTA', hm: 'Sắt thép xây dựng', vt: 'ST-D10', sl: 1, dgia: 100000, ncc: 'NCC_ThepA' },
    { ngay: '2026-05-09', ct: 'CTA', nha: 'CTA', hm: 'Hồ sơ pháp lý', vt: 'DN-KHOAN', tt: 80000, sp: 'PC009/09' }                                 // ngày hoán đổi + thiếu NCC + mã VT khoản
  ];
}
const EXPECT_TOTAL = 1000000 + 350000 + 120000 + 5000000 + 7000000 + 100000 + 100000 + 80000;

async function setup(extra) {
  const input = tmpDir('ketoan-imp-in-');
  await makeWorkbook(path.join(input, 'ChiPhi_CongTrinh_CTA.xlsx'), Object.assign({
    ct: { ma: 'CTA', ten: 'Công trình A', ngay: '1/8/2026' }, rows: baseRows(),
    houses: [['CTA', 'CTA', 'Dùng chung cả công trình'], ['N1', 'NCT', 'Nhà 1 (mẫu)'], ['N2', 'NCT', 'Nhà 2 (mẫu)']],
    cash: [
      { sp: 'PC001/08', ngay: '2026-08-15', ncc: 'NCC_ThepA', lyDo: 'trả thép', soTien: 1000000 },            // Loại trống → Chi; đã có trong sổ thu chi
      { sp: 'PC002/08', ngay: '2026-08-16', loai: 'Chi', ncc: 'NCC_Tho', lyDo: 'ứng thợ', soTien: 2000000 }, // chưa có → Nháp
      { sp: 'PC003/08', ngay: '2026-08-16', ncc: 'NCC_Tho', soTienFormula: true, chi: 300000 },              // Số tiền là công thức, Chi gõ tay
      { sp: 'pc004/09', ngay: '2026-05-09', ncc: 'NCC_ThepA', soTien: 0, chi: 50000 },                       // số tiền 0 → bỏ qua (cần quyết định)
      { ngay: '', ncc: 'NCC_Tho', lyDo: 'Nhân công', soTien: 5000000 }                                       // thiếu ngày → suy ra từ dòng chi phí
    ],
    junk: 'tổng hợp thanh toán 11/9: thầu A 150tr'
  }, extra || {}));
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ketoan-v2-hien-tai.json'), 'utf8'));
  seed.entries.push({ id: 9001, seq: 9001, ngay: '2026-08-15', soPhieu: 'PC777/08', maDuAn: '', maNCC: 'NCC_THEPA_CU', noiDung: 'đã trả thép A (sổ quỹ thật)', thu: 0, chi: 1000000, nguoiNhan: '', ghiChu: '', createdAt: '', updatedAt: '' });
  seed.suppliers.push({ id: 9002, ma: 'NCC_THEPA_CU', ten: 'Thép A', loai: 'Vật tư', sdt: '', diaChi: '', ghiChu: '' }); // NCC đã có, khớp theo tên
  seed.nextId = 9100;
  const data = makeDataDir(seed);
  new Store(data).close(); // chuyển sang SQLite trước (như phần mềm đã được mở)
  return { input, data };
}

const run = (args) => cli.main(args.concat(['--bo-qua-kiem-tra-phan-mem']), quiet);

test('I1 quy tắc nhỏ: Loại CP suy ra, ngày hoán đổi, số phiếu giả, ngày chữ d/m/yyyy', () => {
  assert.equal(imp.inferLoai('Nhân công thợ nề', 'NE-CONG').loai, 'Nhân công');
  assert.equal(imp.inferLoai('Chi phí chung CT', 'XX-KHAC').loai, 'Dịch vụ-Phí');
  assert.equal(imp.inferLoai('Chi phí chung CT', 'CHUNG').loai, 'Dịch vụ-Phí');
  assert.equal(imp.inferLoai('Vật tư điện nước', 'DNUOC-VUTHANH').loai, 'Vật tư', 'ĐVT khoản nhưng mã vật tư cụ thể → Vật tư (đúng như dòng đã ghi Loại trong file thật)');
  assert.equal(imp.inferLoai('Vật tư VLXD', '').loai, 'Vật tư');
  assert.equal(imp.inferLoai('Hồ sơ pháp lý', '').loai, 'Dịch vụ-Phí');
  assert.equal(imp.fixSwappedDate('2026-05-09', 'pc001/09'), '2026-09-05');
  assert.equal(imp.fixSwappedDate('2026-05-09', 'PC001/05'), '', 'tháng đã khớp số phiếu');
  assert.equal(imp.fixSwappedDate('2026-05-13', 'PC001/13'), '', 'ngày > 12 không hoán đổi được');
  assert.equal(imp.fixSwappedDate('2026-05-09', 'PC001/10'), '', 'hậu tố tháng không khớp ngày');
  assert.equal(imp.fixSwappedDate('2026-05-09', ''), '');
  assert.ok(imp.isPlaceholderVoucher('PC…/09') && imp.isPlaceholderVoucher('PC00../08') && !imp.isPlaceholderVoucher('PC015/09'));
  assert.equal(imp.toISODate('27/9/2026'), '2026-09-27');
  assert.equal(imp.toISODate('5/9/2026'), '2026-09-05', 'ngày-trước-tháng');
  assert.equal(imp.ck(' NĐC34 '.normalize('NFD')), 'nđc34', 'mã có dấu: NFC, không phân biệt hoa thường, giữ dấu');
  assert.notEqual(imp.ck('NĐC34'), imp.ck('NDC34'), 'không bỏ dấu khi so mã');
});

test('I2 dry-run: không ghi gì; làm sạch đúng quy tắc; tổng tiền khớp tuyệt đối số kỳ vọng tính độc lập từ ô nguồn', async () => {
  const { input, data } = await setup();
  const before = fs.readFileSync(path.join(data, 'ketoan.db'));
  const exp = await computeExpected(path.join(input, 'ChiPhi_CongTrinh_CTA.xlsx'));
  assert.equal(exp.nkcRows, 9);
  assert.equal(exp.nkcKhongTien, 1);
  assert.equal(exp.nkcTong, EXPECT_TOTAL, 'số kỳ vọng độc lập không dùng giá trị lưu sẵn sai 999.999.999');
  assert.equal(exp.sqTong, 1000000 + 2000000 + 300000 + 5000000);
  const r = await run(['--dry-run', '--input', input, '--data', data, '--report', tmpDir()]);
  assert.equal(r.code, 0, r.check.errs.join('; '));
  assert.ok(fs.readFileSync(path.join(data, 'ketoan.db')).equals(before), 'dry-run không được ghi');
  const p = r.plan;
  const costs = p.add.costs.map((x) => x.rec);
  assert.equal(costs.length, 8);
  assert.equal(costs.reduce((t, c) => t + c.thanhTien, 0), EXPECT_TOTAL);
  const by = (dong) => p.add.costs.find((x) => x.src.dong === dong).rec;
  // khoán
  assert.deepEqual([by(3).soLuong, by(3).donGia, by(3).thanhTien], [1, 350000, 350000]);
  assert.match(by(3).ghiChu, /Nhập theo khoản/);
  // gõ đè lệch: giữ số gõ tay 120.000 (SL 2 → ĐG 60.000)
  assert.equal(by(4).thanhTien, 120000);
  assert.equal(by(4).soLuong, 2);
  assert.equal(by(4).donGia, 60000);
  // mã CT / mã nhà
  assert.equal(by(3).maCT, 'CTA'); assert.equal(by(3).maNha, 'CTA');
  assert.equal(by(5).maCT, 'CTA'); assert.match(by(5).ghiChu, /Mã CT gốc: KHAC99/); assert.match(by(5).ghiChu, /Mã nhà gốc: NHA_LA/);
  // Loại CP suy ra
  assert.equal(by(3).loaiCP, 'Vật tư'); assert.equal(by(5).loaiCP, 'Nhân công'); assert.equal(by(6).loaiCP, 'Vật tư'); assert.equal(by(4).loaiCP, 'Dịch vụ-Phí');
  // số phiếu
  assert.equal(by(5).soPhieu, ''); assert.match(by(5).ghiChu, /Số phiếu gốc: PC…\/08/);
  assert.equal(by(6).soPhieu, 'PC005/08');
  // ngày hoán đổi, thiếu NCC
  assert.equal(by(10).ngay, '2026-09-05');
  assert.equal(by(10).maNCC, 'NCC_CHUAXACDINH');
  // NCC chữ thường gộp; NCC khớp theo tên với NCC đang có
  assert.equal(by(4).maNCC, by(2).maNCC);
  assert.equal(by(2).maNCC, 'NCC_THEPA_CU', 'khớp theo tên "Thép A" với NCC đã có');
  // hai dòng giống hệt đều nhập
  assert.equal(costs.filter((c) => c.ngay === '2026-08-14').length, 2);
  // nhà mẫu không nhập; dòng TỔNG không thành vật tư
  assert.ok(!p.add.houses.some((h) => /^N\d$/.test(h.rec.ma)));
  assert.ok(!p.add.materials.some((m) => m.rec.ma === 'TỔNG'));
  // vấn đề được liệt kê kèm dòng gốc
  const has = (loai, dong) => p.issues.some((i) => i.loai === loai && (dong === undefined || i.dong === dong));
  ['nhap-theo-khoan', 'thanh-tien-lech', 'thieu-ma-ct', 'ma-ct-sai', 'ma-nha-sai', 'loai-cp-suy-ra', 'so-phieu-gia', 'so-phieu-viet-hoa', 'khong-co-so-tien', 'dong-giong-het', 'ngay-hoan-doi', 'thieu-ncc', 'nha-mau-rac']
    .forEach((l) => assert.ok(has(l), 'thiếu vấn đề ' + l));
  assert.ok(has('khong-co-so-tien', 7));
  // sổ quỹ
  const q = (dong) => p.add.entries.find((x) => x.src.dong === dong);
  assert.ok(!q(2), 'khoản đã có trong sổ thu chi không nhập lại');
  assert.ok(p.issues.some((i) => i.loai === 'so-quy-da-co' && i.dong === 2));
  assert.equal(q(3).rec.chi, 2000000); assert.equal(q(3).rec.trangThai, 'nhap');
  assert.equal(q(4).rec.chi, 300000, 'Số tiền là công thức → lấy Chi gõ tay');
  assert.ok(!q(5), 'số tiền 0 → bỏ qua');
  assert.ok(p.issues.some((i) => i.loai === 'so-quy-khong-tien' && i.muc === 'can-quyet-dinh' && /05\/09\/2026/.test(i.chiTiet)));
  assert.equal(q(6).rec.ngay, '2026-08-12', 'thiếu ngày → suy ra từ dòng chi phí cùng NCC, cùng số tiền');
  assert.ok(p.issues.some((i) => i.loai === 'loai-thu-chi-suy-ra'));
});

test('I3 apply: một giao dịch, sao lưu "truoc-import-excel", dữ liệu cũ không đổi, tồn quỹ không đổi; chạy lại không thêm gì; rollback rồi nhập lại', async () => {
  const { input, data } = await setup();
  const old = readStored(data);
  const rep = tmpDir();
  const r1 = await run(['--apply', '--input', input, '--data', data, '--report', rep]);
  assert.equal(r1.code, 0);
  assert.ok(fs.existsSync(path.join(data, 'backups', r1.backup)) && /truoc-import-excel\.db$/.test(r1.backup));
  const d1 = readStored(data);
  assert.equal(d1.costs.length, old.costs.length + 8);
  assert.equal(d1.entries.length, old.entries.length + 3);
  old.costs.forEach((c) => assert.deepEqual(d1.costs.find((x) => x.id === c.id), c));
  old.entries.forEach((e) => assert.deepEqual(d1.entries.find((x) => x.id === e.id), e));
  const ton = (d) => { const l = KT.buildLedger(KT.postedDb(d)); return l[l.length - 1].ton; };
  assert.equal(ton(d1), ton(old), 'sổ quỹ nhập dạng Nháp: tồn quỹ không đổi');
  assert.equal(KT.costSummary(KT.postedDb(d1), { ct: 'CTA' }).total, EXPECT_TOTAL);
  assert.ok(d1.costs.filter((c) => c.importRef).every((c) => c.importRef.file && c.importRef.sheet === 'NHATKYCHUNG' && c.importRef.dong && c.importRef.fp && c.importRef.lan === r1.lan));
  assert.ok(fs.existsSync(path.join(rep, 'APPLY_' + r1.lan + '.md')));
  // chạy lại: không thêm gì
  const r2 = await run(['--apply', '--input', input, '--data', data, '--report', rep]);
  assert.equal(r2.code, 0);
  assert.ok(r2.nothing);
  assert.equal(readStored(data).costs.length, d1.costs.length);
  // rollback: về đúng dữ liệu cũ (các bản ghi thêm vào Thùng rác)
  const rb = await run(['--rollback', r1.lan, '--data', data]);
  assert.equal(rb.code, 0);
  const d2 = readStored(data);
  assert.deepEqual(d2.costs, old.costs);
  assert.deepEqual(d2.entries, old.entries);
  assert.deepEqual(d2.projects, old.projects);
  assert.deepEqual(d2.suppliers, old.suppliers);
  assert.ok(d2.trash.length > old.trash.length);
  // nhập lại được sau rollback
  const r3 = await run(['--apply', '--input', input, '--data', data, '--report', rep]);
  assert.equal(r3.code, 0);
  assert.equal(readStored(data).costs.length, old.costs.length + 8);
  await assert.rejects(run(['--rollback', 'IMP-KHONG-CO', '--data', data]), /Không có lần nhập/);
});

test('I4 file lỗi: hỏng, thiếu sheet, đang mở trong Excel (file ~$), bị khóa → không ghi gì, báo tiếng Việt', async () => {
  const { input, data } = await setup();
  const before = fs.readFileSync(path.join(data, 'ketoan.db'));
  // file hỏng
  fs.writeFileSync(path.join(input, 'ChiPhi_CongTrinh_HONG.xlsx'), 'không phải excel');
  await assert.rejects(run(['--apply', '--input', input, '--data', data, '--report', tmpDir()]), /hỏng|không phải file Excel/);
  fs.unlinkSync(path.join(input, 'ChiPhi_CongTrinh_HONG.xlsx'));
  // thiếu sheet
  const wb = new ExcelJS.Workbook(); wb.addWorksheet('KHAC').getCell('A1').value = 1;
  await wb.xlsx.writeFile(path.join(input, 'ChiPhi_CongTrinh_THIEU.xlsx'));
  await assert.rejects(run(['--apply', '--input', input, '--data', data, '--report', tmpDir()]), /thiếu sheet NHATKYCHUNG/);
  fs.unlinkSync(path.join(input, 'ChiPhi_CongTrinh_THIEU.xlsx'));
  // Excel đang mở file (có file khóa ~$...)
  fs.writeFileSync(path.join(input, '~$ChiPhi_CongTrinh_CTA.xlsx'), 'khóa');
  await assert.rejects(run(['--apply', '--input', input, '--data', data, '--report', tmpDir()]), /đang mở trong Excel/);
  fs.unlinkSync(path.join(input, '~$ChiPhi_CongTrinh_CTA.xlsx'));
  // Windows khóa file (EBUSY)
  const real = fs.readFileSync;
  fs.readFileSync = function (f) { if (/ChiPhi_CongTrinh_CTA/.test(String(f))) { const e = new Error('EBUSY: resource busy or locked'); e.code = 'EBUSY'; throw e; } return real.apply(fs, arguments); };
  try { await assert.rejects(run(['--apply', '--input', input, '--data', data, '--report', tmpDir()]), /đang bị khóa/); } finally { fs.readFileSync = real; }
  assert.ok(fs.readFileSync(path.join(data, 'ketoan.db')).equals(before), 'dữ liệu không đổi');
});

test('I5 phần mềm đang chạy → --apply từ chối; kiểm tra trước COMMIT không đạt → ROLLBACK, dữ liệu giữ nguyên', async () => {
  const { input, data } = await setup();
  const srv = await startServer({ data, port: 3939 + Math.floor(Math.random() * 15) });
  try {
    await assert.rejects(cli.main(['--apply', '--input', input, '--data', data, '--report', tmpDir()], quiet), /Phần mềm đang chạy/);
  } finally { await srv.stop(); }
  // giả lập kiểm tra trong giao dịch thất bại
  const before = readStored(data);
  const realVerify = imp.verify;
  let n = 0;
  imp.verify = function () { const r = realVerify.apply(this, arguments); n++; if (n >= 3) { r.errs = ['giả lập lệch số liệu']; r.ok = false; } return r; };
  try { await assert.rejects(run(['--apply', '--input', input, '--data', data, '--report', tmpDir()]), /giả lập lệch số liệu/); } finally { imp.verify = realVerify; }
  const after = readStored(data);
  assert.deepEqual(after.costs, before.costs);
  assert.deepEqual(after.entries, before.entries);
  assert.ok(!after.importBatches || !after.importBatches.length);
});

test('I6 hạng mục trùng mã khác nghĩa (HM37), NCC khác hoa/thường giữa hai file, mã có dấu NFD, ô ghi chú ngoài bảng', async () => {
  const input = tmpDir('ketoan-imp-in-');
  const items = [['HM01', '', 'Hồ sơ pháp lý', 'NHOM_ChiPhiBanDau'], ['HM37', '', 'Bảo hành', 'NHOM_ChiPhiKhac']];
  await makeWorkbook(path.join(input, 'A.xlsx'), { ct: { ma: 'NĐC9'.normalize('NFD'), ten: 'Lô 9', ghiNgoai: 'ứng đợt 1 = 305.600.000' }, items,
    houses: [['NĐC9'.normalize('NFD'), 'NĐC9', 'Dùng chung cả công trình']], sups: [['NCC_HaiKT', 'A Hải', 'Kỹ thuật']],
    rows: [{ ngay: '2026-09-01', ct: 'nđc9', hm: 'Bảo hành', vt: 'XX-KHAC', tt: 100000, ncc: 'NCC_HaiKT' }] });
  await makeWorkbook(path.join(input, 'B.xlsx'), { ct: { ma: 'CTB', ten: 'B' }, items: [['HM01', '', 'Hồ sơ pháp lý', 'NHOM_ChiPhiBanDau'], ['HM37', '', 'Chi phí quản lý (giám sát, VP)', 'NHOM_ChiPhiKhac']],
    sups: [['NCC_HAIKT', 'A Hải kỹ thuật', 'Kỹ thuật']], rows: [{ ngay: '2026-09-02', ct: 'CTB', nha: 'CTB', hm: 'Chi phí quản lý (giám sát, VP)', vt: 'XX-KHAC', tt: 200000, ncc: 'NCC_HAIKT' }] });
  const data = makeDataDir();
  new Store(data).close();
  const r = await run(['--dry-run', '--input', input, '--data', data, '--report', tmpDir()]);
  assert.equal(r.code, 0, r.check.errs.join('; '));
  const p = r.plan;
  const bh = p.add.costItems.find((x) => x.rec.ten === 'Bảo hành');
  assert.ok(bh, 'Bảo hành thành hạng mục riêng');
  assert.notEqual(bh.rec.ma, 'HM37', 'mã không trùng với "Chi phí quản lý" (HM37 trong phần mềm)');
  assert.ok(p.conflicts.some((c) => c.loai === 'hang-muc-ma'));
  assert.equal(p.add.suppliers.filter((s) => imp.ck(s.rec.ma) === 'ncc_haikt').length, 1, 'gộp NCC khác hoa/thường');
  assert.equal(p.add.suppliers.find((s) => imp.ck(s.rec.ma) === 'ncc_haikt').rec.ten, 'A Hải kỹ thuật', 'chọn tên đầy đủ nhất');
  const a = p.add.costs.find((x) => x.src.file === 'A.xlsx').rec;
  assert.equal(a.maCT, 'NĐC9'.normalize('NFC'), 'mã công trình lưu dạng NFC');
  assert.ok(!p.issues.some((i) => i.loai === 'ma-ct-sai' && i.file === 'A.xlsx'), '"nđc9" và "NĐC9" (NFD) là cùng mã');
  assert.ok(r.report && /ứng đợt 1 = 305\.600\.000/.test(fs.readFileSync(r.report, 'utf8')), 'ô ghi chú ngoài bảng được nêu trong báo cáo');
});

test('I7 rollback sau khi người dùng đã sửa phiếu nhập trong phần mềm: phần còn nguyên được gỡ, phần đã sửa được báo để kiểm tra tay', async () => {
  const { input, data } = await setup();
  const r1 = await run(['--apply', '--input', input, '--data', data, '--report', tmpDir()]);
  const srv = await startServer({ data });
  try {
    const db = await srv.db();
    const c = db.costs.find((x) => x.importRef && x.importRef.lan === r1.lan && x.maVT === 'ST-D10' && x.soLuong === 10);
    const slip = db.costs.filter((x) => x.phieuId === c.phieuId);
    await srv.ok('PUT', '/api/cost-slips/' + c.phieuId, { header: { ngay: c.ngay, maCT: c.maCT, maNha: c.maNha, maNCC: c.maNCC, soPhieu: c.soPhieu, maHM: c.maHM },
      lines: slip.map((x) => ({ maVT: x.maVT, dienGiai: x.dienGiai, soLuong: x.soLuong, donGia: x.donGia, maHM: x.maHM, loaiCP: x.loaiCP })) });
  } finally { await srv.stop(); }
  const rb = await run(['--rollback', r1.lan, '--data', data]);
  assert.ok(rb.kept.some((k) => /không còn nguyên/.test(k)), rb.kept.join('; '));
  const after = readStored(data);
  assert.ok(!after.costs.some((x) => x.importRef && x.importRef.lan === r1.lan), 'các dòng còn nguyên của lần nhập đã được gỡ');
  assert.ok(after.costs.some((x) => x.maCT === 'CTA'), 'phiếu đã sửa vẫn còn (công trình CTA giữ lại vì đang được dùng)');
});
