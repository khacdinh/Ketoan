'use strict';
/* E. Nhập/xuất Excel và đối chiếu số liệu với file Excel mẫu ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm.
 * File .xlsm gốc không nằm trong kho mã, nên số "Excel tính lại" lấy từ tai-lieu/DoiChieu_ChiPhi_voi_Excel.md
 * (cột A: do Microsoft Excel tính lại) và được cố định thành hằng số ở đây. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { KT, startServer, makeDataDir, readJsonFile, orphanErrors } = require('./helpers');
const X = require('./excel-helpers');

const V2 = path.join(__dirname, 'fixtures', 'ketoan-v2-hien-tai.json');
const HAS_LO = !!X.findSoffice();

/* ---- Số liệu do Excel tính lại (DoiChieu_ChiPhi_voi_Excel.md, cột A) ---- */
const EXCEL = {
  tong: 1129929000, loai: { 'Vật tư': 763957000, 'Nhân công': 250000000, 'Dịch vụ-Phí': 115972000 }, daTra: 1230569000, soDong: 104,
  nhom: { '1. Chi phí ban đầu': 550000, '2. Chi phí phần thô': 1021250000, '3. Hệ thống điện nước': 17303000, '4. Hoàn thiện': 49426000, '6. Chi phí khác': 41400000 },
  hangMuc: {
    'Hồ sơ pháp lý': 550000, 'Bê tông': 216305000, 'Sắt thép xây dựng': 298313000, 'Vật tư VLXD': 182610000, 'Chi phí chung CT': 74022000,
    'Nhân công thợ nề': 250000000, 'Vật tư điện nước': 17303000, 'Thiết bị vệ sinh': 49426000, 'Chi phí quản lý (giám sát, VP)': 41400000
  },
  // mã NCC → [phát sinh, đã trả, còn lại]
  ncc: {
    NCC_HoaLan: [1400000, 1400000, 0], NCC_Khac: [41600000, 1600000, 40000000], NCC_VuongThinh: [182610000, 232910000, -50300000],
    NCC_SongHan: [216305000, 241645000, -25340000], NCC_NhatQuang: [49426000, 49426000, 0], NCC_VUTHANH: [17303000, 17303000, 0],
    NCC_Quân: [0, 15000000, -15000000], NCC_Tai: [63900000, 63900000, 0], NCC_Hau: [259072000, 309072000, -50000000], NCC_CUCHANH: [298313000, 298313000, 0]
  }
};
const key = (s) => String(s || '').trim().toLowerCase();

/*
 * Dữ liệu như sau khi nhập file mẫu KÈM SO_QUY: chi phí là dữ liệu thật đã nhập từ NHATKYCHUNG của file mẫu,
 * còn sổ quỹ (SO_QUY của file .xlsm — không có trong kho mã) được dựng lại sao cho tiền đã trả từng NCC đúng bằng
 * cột A của DoiChieu_ChiPhi_voi_Excel.md (có cả khoản thu lại, khoản chi không ghi NCC, khoản chi khác công trình).
 */
function docDb() {
  const db = readJsonFile(V2);
  const sup = (m) => db.suppliers.find((x) => key(x.ma) === key(m));
  const ct = db.costs[0].maCT;
  const ents = [];
  let n = 0;
  const add = (ma, chi, thu, nd) => { n++; ents.push({ ngay: '2026-08-' + String(1 + (n % 28)).padStart(2, '0'), soPhieu: 'PC' + String(n).padStart(3, '0') + '/08', maDuAn: ct, maNCC: ma ? sup(ma).ma : '', noiDung: nd || 'Thanh toán', thu: thu || 0, chi: chi || 0, nguoiNhan: '', ghiChu: '' }); };
  Object.keys(EXCEL.ncc).forEach((m) => {
    const tra = EXCEL.ncc[m][1];
    if (m === 'NCC_Hau') { add(m, tra + 5000000, 0, 'Thanh toán đợt 1'); add(m, 0, 5000000, 'Hậu hoàn tiền'); } else if (tra > 2000000) { add(m, tra - 1000000, 0, 'Đợt 1'); add(m, 1000000, 0, 'Đợt 2'); } else add(m, tra, 0);
  });
  add('', 7777000, 0, 'Chi khác của công trình, không ghi NCC');
  ents.forEach((e, i) => { e.id = 0; e.seq = i + 1; });
  db.entries = ents;
  db.vouchers = {};
  return db;
}

/* ---- Bản tính ĐỘC LẬP từ dữ liệu thô (không dùng các hàm tổng hợp của shared.js) ---- */
function rawExpectations(costs, items, groups, entries) {
  const itemBy = new Map(items.map((i) => [key(i.ma), i]));
  const groupBy = new Map(groups.map((g) => [key(g.ma), g]));
  const out = { tong: 0, loai: {}, nhom: {}, hm: {}, ncc: {}, daTra: {} };
  costs.forEach((c) => {
    const t = X.thanhTien(c.soLuong, c.donGia);
    out.tong += t;
    out.loai[c.loaiCP] = (out.loai[c.loaiCP] || 0) + t;
    const it = itemBy.get(key(c.maHM));
    const hm = it ? it.ten : c.maHM;
    out.hm[hm] = (out.hm[hm] || 0) + t;
    const g = it ? groupBy.get(key(it.maNhom)) : null;
    const gn = g ? g.ten : '(không nhóm)';
    out.nhom[gn] = (out.nhom[gn] || 0) + t;
    out.ncc[key(c.maNCC)] = (out.ncc[key(c.maNCC)] || 0) + t;
  });
  entries.forEach((e) => {
    if (!e.maNCC) return;
    out.daTra[key(e.maNCC)] = (out.daTra[key(e.maNCC)] || 0) + (e.chi || 0) - (e.thu || 0);
  });
  return out;
}

test('E2.1 đối chiếu dữ liệu đã nhập với số Excel tính lại: tổng, loại CP, nhóm, hạng mục, công nợ từng NCC', () => {
  const db = docDb();
  const raw = rawExpectations(db.costs, db.costItems, db.costGroups, db.entries);
  const rows = []; // bảng đối chiếu in ra cho báo cáo
  const eq = (name, excel, raw1, sw) => { rows.push([name, excel, raw1, sw]); assert.equal(raw1, excel, name + ' (cộng thẳng SL×ĐG) ≠ Excel'); assert.equal(sw, excel, name + ' (phần mềm) ≠ Excel'); };
  const s = KT.costSummary(db, {}, KT.buildCostLedger(db));
  eq('TỔNG CHI PHÍ', EXCEL.tong, raw.tong, s.total);
  Object.keys(EXCEL.loai).forEach((l) => eq('Loại CP: ' + l, EXCEL.loai[l], raw.loai[l], s.byLoai[l]));
  eq('Số dòng chi phí', EXCEL.soDong, db.costs.length, s.soDong);
  Object.keys(EXCEL.nhom).forEach((n) => eq('Nhóm: ' + n, EXCEL.nhom[n], raw.nhom[n], s.groups.find((g) => g.ten === n).total));
  assert.equal(Object.keys(raw.nhom).length, Object.keys(EXCEL.nhom).length, 'có nhóm lạ: ' + Object.keys(raw.nhom));
  Object.keys(EXCEL.hangMuc).forEach((h) => {
    const sw = [].concat(...s.groups.map((g) => g.items)).find((i) => i.ten === h);
    eq('Hạng mục: ' + h, EXCEL.hangMuc[h], raw.hm[h], sw.total);
  });
  assert.equal(Object.keys(raw.hm).filter((h) => raw.hm[h]).length, Object.keys(EXCEL.hangMuc).length, 'có hạng mục lạ: ' + Object.keys(raw.hm));
  // công nợ
  const debt = KT.supplierDebt(db, {});
  let sumPS = 0; let sumTra = 0;
  Object.keys(EXCEL.ncc).forEach((ma) => {
    const [ps, tra, conLai] = EXCEL.ncc[ma];
    const d = debt.rows.find((r) => key(r.ma) === key(ma));
    const rawPS = raw.ncc[key(ma)] || 0; const rawTra = raw.daTra[key(ma)] || 0;
    rows.push(['NCC ' + ma + ' phát sinh', ps, rawPS, d.phatSinh]);
    rows.push(['NCC ' + ma + ' đã trả', tra, rawTra, d.daTra]);
    rows.push(['NCC ' + ma + ' còn lại', conLai, rawPS - rawTra, d.conLai]);
    assert.equal(rawPS, ps, ma + ' phát sinh (cộng thẳng)'); assert.equal(d.phatSinh, ps, ma + ' phát sinh (phần mềm)');
    assert.equal(rawTra, tra, ma + ' đã trả (cộng thẳng)'); assert.equal(d.daTra, tra, ma + ' đã trả (phần mềm)');
    assert.equal(d.conLai, conLai, ma + ' còn lại (phần mềm)');
    sumPS += d.phatSinh; sumTra += d.daTra;
  });
  assert.equal(sumPS, EXCEL.tong);
  assert.equal(sumTra, EXCEL.daTra);
  assert.equal(debt.total.daTra, EXCEL.daTra);
  assert.equal(debt.total.phatSinh, EXCEL.tong);
  // NCC không có trong bảng Excel không được có phát sinh/đã trả liên quan công trình
  debt.rows.filter((r) => r.lienQuan && !Object.keys(EXCEL.ncc).some((m) => key(m) === key(r.ma))).forEach((r) => assert.fail('NCC ' + r.ma + ' liên quan công trình nhưng không có trong CONGNO_NCC của Excel'));
  fs.writeFileSync(path.join(os.tmpdir(), 'doi-chieu-excel.json'), JSON.stringify(rows));
});

test('E2.2 thành tiền từng dòng = SL × ĐG chính xác (đối chiếu BigInt), không dòng nào lệch', () => {
  const db = readJsonFile(V2);
  const bad = db.costs.filter((c) => c.thanhTien !== X.thanhTien(c.soLuong, c.donGia));
  assert.deepEqual(bad.map((c) => c.id), []);
  const led = KT.buildCostLedger(db);
  assert.equal(led.reduce((t, c) => t + c.thanhTien, 0), EXCEL.tong);
});

test('E3.1 xuất Excel chi phí: đủ sheet như file mẫu, công thức SUMIFS / INDEX-MATCH còn nguyên, số liệu khớp', async () => {
  const srv = await startServer({ seed: docDb() });
  try {
    const r = await srv.call('GET', '/api/export/costs');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /spreadsheetml/);
    const wb = await X.loadWb(r.body);
    const names = wb.worksheets.map((w) => w.name);
    ['TONGHOP', 'NHATKYCHUNG', 'CHI_TIET_THEO_NHOM', 'CONGNO_NCC', 'SO_QUY', 'DM_NHOM', 'DM_HANGMUC', 'DM_VATTU', 'DM_NHA', 'DM_CONGTRINH', 'DM_NCC'].forEach((n) => assert.ok(names.includes(n), 'thiếu sheet ' + n));
    // tiêu đề NHATKYCHUNG giống mẫu
    const head = []; wb.getWorksheet('NHATKYCHUNG').getRow(1).eachCell((c) => head.push(String(c.value)));
    assert.deepEqual(head.slice(0, 17), ['Ngày', 'Mã CT', 'Mã Nhà', 'Hạng mục', 'Nhóm CP', 'Loại CP', 'Mã VT', 'Tên vật tư', 'ĐVT', 'Diễn giải / Quy cách', 'Số lượng', 'Đơn giá', 'Thành tiền', 'Mã NCC', 'Tên NCC', 'Số phiếu', 'Ghi chú']);
    // công thức
    const nk = wb.getWorksheet('NHATKYCHUNG');
    const f = (ws, a) => { const v = ws.getCell(a).value; return v && v.formula; };
    assert.match(f(nk, 'M2'), /ROUND\(\$K2\*\$L2,0\)/);
    assert.match(f(nk, 'E2'), /INDEX\(DM_HANGMUC!\$B:\$B,MATCH\(\$D2,DM_HANGMUC!\$C:\$C,0\)\)/);
    assert.match(f(nk, 'O2'), /INDEX\(DM_NCC!/);
    const th = wb.getWorksheet('TONGHOP');
    assert.match(f(th, 'B4'), /^SUM\(NHATKYCHUNG!\$M:\$M\)$/);
    assert.match(f(th, 'B5'), /SUMIFS\(NHATKYCHUNG!\$M:\$M,NHATKYCHUNG!\$F:\$F,"Vật tư"\)/);
    // số liệu đã lưu cạnh công thức khớp Excel
    assert.equal(X.cellVal(th.getCell('B4')), EXCEL.tong);
    assert.equal(X.cellVal(th.getCell('B5')), EXCEL.loai['Vật tư']);
    assert.equal(X.cellVal(th.getCell('B6')), EXCEL.loai['Nhân công']);
    assert.equal(X.cellVal(th.getCell('B7')), EXCEL.loai['Dịch vụ-Phí']);
    assert.equal(X.cellVal(th.getCell('B8')), EXCEL.daTra);
    assert.equal(X.cellVal(th.getCell('B10')), EXCEL.soDong);
    // không có ô lỗi
    wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => {
      const v = X.cellVal(c);
      assert.ok(!(typeof v === 'string' && /^#(REF|NAME|VALUE|DIV|N\/A)/.test(v)), ws.name + '!' + c.address + ' = ' + v);
    })));
    // tính độc lập từ chính các ô của file: SL × ĐG từng dòng
    const tot = { all: 0, loai: {}, ncc: {} };
    for (let n = 2; n <= nk.rowCount; n++) {
      const sl = X.cellVal(nk.getCell('K' + n)); const dg = X.cellVal(nk.getCell('L' + n));
      if (sl == null || dg == null) continue;
      const t = X.thanhTien(sl, dg);
      tot.all += t;
      const l = X.cellVal(nk.getCell('F' + n)); tot.loai[l] = (tot.loai[l] || 0) + t;
      const m = key(X.cellVal(nk.getCell('N' + n))); tot.ncc[m] = (tot.ncc[m] || 0) + t; // mã NCC không phân biệt hoa thường
    }
    assert.equal(tot.all, EXCEL.tong);
    Object.keys(EXCEL.loai).forEach((l) => assert.equal(tot.loai[l], EXCEL.loai[l], l));
    Object.keys(EXCEL.ncc).forEach((m) => assert.equal(tot.ncc[key(m)] || 0, EXCEL.ncc[m][0], m));
  } finally { await srv.stop(); }
});

test('E3.2 tính lại toàn bộ công thức bằng LibreOffice: mọi ô bằng số phần mềm, không ô lỗi (xuất chi phí)', { skip: HAS_LO ? false : 'máy không có LibreOffice', timeout: 240000 }, async () => {
  const srv = await startServer({ seed: docDb() });
  try {
    const buf = (await srv.call('GET', '/api/export/costs')).body;
    const r = await X.recalcCompare(buf, 'costs');
    assert.ok(r.formulas > 1000, 'quá ít công thức được kiểm: ' + r.formulas);
    assert.deepEqual(r.errors, [], 'ô lỗi sau khi tính lại');
    assert.deepEqual(r.mismatches.slice(0, 10), [], r.mismatches.length + ' ô lệch');
    console.log('    (đã kiểm ' + r.formulas + ' ô công thức)');
  } finally { await srv.stop(); }
});

test('E3.3 tính lại bằng LibreOffice cho các file xuất khác (sổ đầy đủ, sổ thu chi, dự án, NCC, phiếu, sổ chi phí, công nợ)', { skip: HAS_LO ? false : 'máy không có LibreOffice', timeout: 600000 }, async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const db = await srv.db();
    const voucher = KT.buildVouchers(db)[0].soPhieu;
    const urls = {
      full: '/api/export/full', ledger: '/api/export/ledger', projects: '/api/export/projects', suppliers: '/api/export/suppliers',
      voucher: '/api/export/voucher?so=' + encodeURIComponent(voucher), costLedger: '/api/export/cost-ledger', costDebt: '/api/export/cost-debt',
      ledgerFiltered: '/api/export/ledger?from=2026-09-05&to=2026-09-20&loai=chi', costsOne: '/api/export/costs?ct=DANDC10'
    };
    for (const k of Object.keys(urls)) {
      const r = await srv.call('GET', urls[k]);
      assert.equal(r.status, 200, k);
      const cmp = await X.recalcCompare(r.body, k);
      assert.deepEqual(cmp.errors, [], k + ': ô lỗi');
      assert.deepEqual(cmp.mismatches.slice(0, 8), [], k + ': ' + cmp.mismatches.length + ' ô lệch / ' + cmp.formulas + ' công thức');
      console.log('    ' + k + ': ' + cmp.formulas + ' ô công thức khớp');
    }
  } finally { await srv.stop(); }
});

async function importBuf(srv, buf, q) {
  const r = await srv.call('POST', '/api/import' + (q || ''), buf);
  return r;
}

// Khi xuất, sổ chi phí được sắp theo ngày nên thứ tự nhập (seq) có thể đổi: so sánh theo tập hợp dòng (có đếm số lần)
const COST_F = ['ngay', 'maCT', 'maNha', 'maHM', 'loaiCP', 'maVT', 'dienGiai', 'soLuong', 'donGia', 'thanhTien', 'maNCC', 'soPhieu', 'ghiChu'];
// Dòng khoán lưu kiểu cũ (SL 1 × ĐG = Thành tiền) được nhập lại thành dòng theo khoản (SL, ĐG trống): so sánh theo dạng đã chuyển
const theoKhoan = (c) => (Number(c.soLuong) === 1 && c.donGia != null && Number(c.donGia) === c.thanhTien && c.thanhTien > 0 ? Object.assign({}, c, { soLuong: null, donGia: null }) : c);
const costLine = (c) => COST_F.map((k) => theoKhoan(c)[k]).join('|');
function comparableCosts(db) {
  return db.costs.map(costLine).sort();
}
// Mỗi phiếu = tập các dòng của nó; hai bản giống nhau khi các phiếu giống nhau
function slipGroups(db) {
  const g = new Map();
  db.costs.forEach((c) => { if (!g.has(c.phieuId)) g.set(c.phieuId, []); g.get(c.phieuId).push(costLine(c)); });
  return Array.from(g.values()).map((a) => a.sort().join('\n')).sort();
}

test('E4 vòng lặp: xuất Excel → nhập lại vào bản sạch → dữ liệu và tổng giống hệt; gộp nhiều lần không nhân đôi', async () => {
  const src = await startServer({ seed: docDb() });
  let buf; let srcDb;
  try { buf = (await src.call('GET', '/api/export/costs')).body; srcDb = await src.db(); } finally { await src.stop(); }
  const dst = await startServer({});
  try {
    // xem trước
    const pv = await importBuf(dst, buf, '?dryRun=1');
    assert.equal(pv.status, 200);
    assert.equal(pv.json.preview.stats.soDong, 104);
    assert.equal(pv.json.preview.stats.tongChiPhi, EXCEL.tong);
    assert.equal((await dst.db()).costs.length, 0, 'xem trước không được ghi dữ liệu');
    // thay thế, có SO_QUY
    // mặc định chỉ tạo công trình có dữ liệu; ở đây chọn tạo cả các công trình trong DM_CONGTRINH chưa có phát sinh
    const map = {}; srcDb.projects.forEach((p) => { map[p.ma] = '__new__'; });
    const r1 = await importBuf(dst, buf, '?mode=replace&soQuy=1&map=' + encodeURIComponent(JSON.stringify(map)));
    assert.equal(r1.status, 200, r1.body.toString().slice(0, 300));
    let db = await dst.db();
    assert.equal(db.costs.length, 104);
    assert.deepEqual(comparableCosts(db), comparableCosts(srcDb), 'từng dòng chi phí phải giống hệt bản gốc');
    assert.deepEqual(slipGroups(db), slipGroups(srcDb), 'gom phiếu phải giống bản gốc');
    const pick = (l, f) => l.map((x) => f.map((k) => x[k] == null ? '' : x[k]).join('|')).sort();
    assert.deepEqual(pick(db.entries, ['ngay', 'soPhieu', 'maDuAn', 'maNCC', 'noiDung', 'thu', 'chi']), pick(srcDb.entries, ['ngay', 'soPhieu', 'maDuAn', 'maNCC', 'noiDung', 'thu', 'chi']), 'SO_QUY → sổ thu chi');
    assert.deepEqual(pick(db.materials, ['ma', 'ten', 'dvt']), pick(srcDb.materials, ['ma', 'ten', 'dvt']));
    assert.deepEqual(pick(db.costItems, ['ma', 'ten', 'maNhom']), pick(srcDb.costItems, ['ma', 'ten', 'maNhom']));
    assert.deepEqual(pick(db.costGroups, ['ma', 'ten']), pick(srcDb.costGroups, ['ma', 'ten']));
    assert.deepEqual(pick(db.houses, ['ma', 'maCT', 'ten']), pick(srcDb.houses, ['ma', 'maCT', 'ten']));
    assert.deepEqual(pick(db.suppliers, ['ma', 'ten']), pick(srcDb.suppliers, ['ma', 'ten']));
    assert.deepEqual(pick(db.projects, ['ma', 'ten']), pick(srcDb.projects, ['ma', 'ten']));
    // mặc định (không chọn gì) chỉ tạo công trình có dữ liệu
    const dst2 = await startServer({});
    try {
      await importBuf(dst2, buf, '?mode=replace&soQuy=1');
      assert.deepEqual((await dst2.db()).projects.map((p) => p.ma), ['DATT111']);
    } finally { await dst2.stop(); }
    const s1 = KT.costSummary(db, {}, KT.buildCostLedger(db)); const s0 = KT.costSummary(srcDb, {}, KT.buildCostLedger(srcDb));
    assert.equal(s1.total, s0.total); assert.deepEqual(s1.byLoai, s0.byLoai);
    assert.deepEqual(KT.supplierDebt(db, {}).rows.map((r) => [r.ma, r.phatSinh, r.daTra, r.conLai]), KT.supplierDebt(srcDb, {}).rows.map((r) => [r.ma, r.phatSinh, r.daTra, r.conLai]));
    assert.deepEqual(orphanErrors(db), []);
    // gộp lần 1 và 2: không thêm gì
    for (let i = 0; i < 2; i++) {
      const r = await importBuf(dst, buf, '?mode=merge&soQuy=1');
      assert.equal(r.status, 200);
      assert.equal(r.json.result.added.costs, 0, 'gộp lần ' + (i + 1) + ' không được thêm dòng chi phí');
      assert.equal(r.json.result.skipped, 104);
      assert.equal(r.json.result.added.entries, 0);
    }
    db = await dst.db();
    assert.equal(db.costs.length, 104);
    assert.equal(db.entries.length, srcDb.entries.length);
    // thay thế lần 2 cho cùng kết quả
    await importBuf(dst, buf, '?mode=replace&soQuy=0');
    assert.deepEqual(comparableCosts(await dst.db()), comparableCosts(srcDb));
    // nhập gộp vào dữ liệu đã có thêm 1 dòng mới: chỉ dòng mới được giữ, số cũ không đổi
    await dst.ok('POST', '/api/costs', { ngay: '2026-09-29', maCT: srcDb.costs[0].maCT, maNCC: srcDb.costs[0].maNCC, maHM: srcDb.costs[0].maHM, dienGiai: 'dòng thêm tay', soLuong: 1, donGia: 1000 });
    const r3 = await importBuf(dst, buf, '?mode=merge');
    assert.equal(r3.json.result.added.costs, 0);
    assert.equal((await dst.db()).costs.length, 105);
  } finally { await dst.stop(); }
});

test('E1.x bổ sung 22 dòng thiếu tháng 8 (DongThieu_NHATKYCHUNG_Thang8.xlsx): gộp vào dữ liệu hiện tại cho đúng số lưu sẵn cũ của file mẫu', async () => {
  const file = path.join(__dirname, '..', 'tai-lieu', 'DongThieu_NHATKYCHUNG_Thang8.xlsx');
  const buf = fs.readFileSync(file);
  const srv = await startServer({ seed: docDb() });
  try {
    const pv = await importBuf(srv, buf, '?dryRun=1');
    assert.equal(pv.status, 200, pv.body.toString().slice(0, 300));
    assert.equal(pv.json.preview.stats.soDong, 22);
    assert.equal(pv.json.preview.stats.tongChiPhi, 141870000);
    const r = await importBuf(srv, buf, '?mode=merge');
    assert.equal(r.status, 200);
    const db = await srv.db();
    const s = KT.costSummary(db, {}, KT.buildCostLedger(db));
    assert.equal(s.total, 1271799000);
    assert.deepEqual([s.byLoai['Vật tư'], s.byLoai['Nhân công'], s.byLoai['Dịch vụ-Phí']], [843627000, 310600000, 117572000]);
    assert.equal(s.soDong, 126);
    const debt = KT.supplierDebt(db, {});
    const row = (m) => debt.rows.find((x) => key(x.ma) === key(m));
    assert.equal(row('NCC_Khac').conLai, 40000000);
    assert.equal(row('NCC_VUTHANH').conLai, 6230000);
    assert.equal(row('NCC_Quân').conLai, -5000000);
    // các NCC còn lại đều đã tất toán
    debt.rows.filter((r) => r.lienQuan && !['ncc_khac', 'ncc_vuthanh', 'ncc_quân'].includes(key(r.ma))).forEach((r) => assert.equal(r.conLai, 0, r.ma));
    assert.equal(debt.total.conNo, 46230000);
    // nhập lần hai không nhân đôi
    const again = await importBuf(srv, buf, '?mode=merge');
    assert.equal(again.json.result.added.costs, 0);
    assert.equal((await srv.db()).costs.length, 126);
    assert.deepEqual(orphanErrors(await srv.db()), []);
  } finally { await srv.stop(); }
});

/* ---------- File Excel bẩn: dựng bằng tay để kiểm tra cảnh báo mã lạ, dòng thiếu... ---------- */

async function messyWorkbook(opts) {
  opts = opts || {};
  const wb = new X.ExcelJS.Workbook();
  const nhom = wb.addWorksheet('DM_NHOM'); nhom.addRow(['Mã nhóm', 'Tên nhóm CP', 'Ghi chú']); nhom.addRow(['N1', 'Nhóm một', '']);
  const hm = wb.addWorksheet('DM_HANGMUC'); hm.addRow(['Mã HM', 'Nhóm CP', 'Hạng mục', 'Mã nhóm', 'Ghi chú']); hm.addRow(['H1', 'Nhóm một', 'Bê tông', 'N1', '']);
  const vt = wb.addWorksheet('DM_VATTU'); vt.addRow(['Mã VT', 'Tên vật tư', 'ĐVT chuẩn', 'Hạng mục hay dùng']); vt.addRow(['BT-M250', 'Bê tông M250', 'm3', 'Bê tông']);
  const ncc = wb.addWorksheet('DM_NCC'); ncc.addRow(['Mã NCC', 'Tên nhà cung cấp', 'Loại']); ncc.addRow(['NCC_A', 'Nhà cung cấp A', '']);
  const ct = wb.addWorksheet('DM_CONGTRINH'); ct.addRow(['Mã CT', 'Tên công trình']); ct.addRow(['CT1', 'Công trình 1']);
  const nk = wb.addWorksheet('NHATKYCHUNG');
  nk.addRow(['Ngày', 'Mã CT', 'Mã Nhà', 'Hạng mục', 'Nhóm CP', 'Loại CP', 'Mã VT', 'Tên vật tư', 'ĐVT', 'Diễn giải / Quy cách', 'Số lượng', 'Đơn giá', 'Thành tiền', 'Mã NCC', 'Tên NCC', 'Số phiếu', 'Ghi chú']);
  const d = (s) => new Date(s + 'T00:00:00Z');
  const R = [
    [d('2026-08-01'), 'CT1', '', 'Bê tông', '', 'Vật tư', 'BT-M250', '', '', 'dòng 2 bình thường', 2, 1760000, 3520000, 'NCC_A', '', '', ''],
    [d('2026-08-02'), 'CT1', '', 'Bê tông', '', 'Vật tư', 'XX-CHUAXACDINH', '', '', 'vật tư lạ', 1, 500000, 500000, 'NCC_A', '', '', ''],
    [d('2026-08-03'), 'CT1', '', 'Bê tông', '', 'Vật tư', 'BT-M250', '', '', 'NCC lạ', 1, 1000000, 1000000, 'NCC_LA', '', '', ''],
    [null, 'CT1', '', 'Bê tông', '', 'Vật tư', 'BT-M250', '', '', 'thiếu ngày → lấy dòng trên', 1, 100000, 100000, 'NCC_A', '', '', ''],
    [d('2026-08-05'), 'CT1', '', 'Bê tông', '', 'Vật tư', 'BT-M250', '', '', 'thiếu số lượng', null, 100000, 100000, 'NCC_A', '', '', ''],
    [d('2026-08-06'), 'CT1', '', 'Bê tông', '', 'Vật tư', 'BT-M250', '', '', 'thành tiền cache sai', 3, 100000, 999, 'NCC_A', '', '', ''],
    [d('2026-08-07'), '', '', 'Bê tông', '', 'Vật tư', 'BT-M250', '', '', 'thiếu mã CT', 1, 100000, 100000, 'NCC_A', '', '', ''],
    [d('2026-08-08'), 'CT1', '', 'Hạng mục lạ', '', 'Vật tư', '', '', '', 'hạng mục lạ', 1, 200000, 200000, 'NCC_A', '', '', ''],
    [d('2026-08-09'), 'CT1', '', 'Bê tông', '', 'Vật tư', 'BT-M250', '', '', 'số dạng chữ', '2,5', '1.250.000', 3125000, 'NCC_A', '', '', ''],
    [d('2026-08-10'), 'CT1', 'NHA_LA', 'Bê tông', '', 'Vật tư', 'BT-M250', '', '', 'mã nhà lạ', 1, 100000, 100000, 'NCC_A', '', '', ''],
    ['15/08/2026', 'CT1', '', 'Bê tông', '', 'Vật tư', 'BT-M250', '', '', 'ngày dạng chữ', 1, 100000, 100000, 'NCC_A', '', '', ''],
    [d('2026-08-11'), 'CT1', '', 'Bê tông', '', 'Loại lạ', 'BT-M250', '', '', 'loại CP lạ', 1, 100000, 100000, 'NCC_A', '', '', '']
  ];
  R.forEach((r) => nk.addRow(r));
  // dòng chỉ có công thức (dòng trống giả)
  nk.addRow([null, null, null, null, { formula: 'IFERROR(1,"")', result: '' }]);
  if (opts.formulas) { // một số ô là công thức có kết quả lưu sẵn
    nk.getCell('K2').value = { formula: '1+1', result: 2 };
    nk.getCell('L2').value = { formula: '1760000', result: 1760000 };
  }
  return wb;
}

test('E1.2 file Excel bẩn: cảnh báo mã lạ / dòng thiếu, tính lại thành tiền, bỏ qua dòng không hợp lệ, không sinh dòng mồ côi', async () => {
  const buf = Buffer.from(await (await messyWorkbook({ formulas: true })).xlsx.writeBuffer());
  const srv = await startServer({});
  try {
    const pv = await importBuf(srv, buf, '?dryRun=1');
    assert.equal(pv.status, 200, pv.body.toString().slice(0, 300));
    const w = pv.json.preview.warnings.join('\n');
    assert.match(w, /XX-CHUAXACDINH|mã vật tư lạ/);
    assert.match(w, /NCC_LA/);
    assert.match(w, /thiếu Số lượng/);
    assert.match(w, /thiếu Mã công trình/);
    assert.match(w, /hạng mục lạ/i);
    assert.match(w, /NHA_LA/);
    assert.match(w, /Thành tiền trong file khác/);
    assert.equal((await srv.db()).costs.length, 0);
    const r = await importBuf(srv, buf, '?mode=merge');
    assert.equal(r.status, 200, r.body.toString().slice(0, 300));
    const db = await srv.db();
    // 12 dòng dữ liệu: bỏ dòng thiếu số lượng (1) và thiếu mã CT (1) → 10 dòng vào sổ
    assert.equal(db.costs.length, 10);
    assert.deepEqual(orphanErrors(db), [], 'không được sinh dòng mồ côi');
    assert.ok(KT.costCatalogCheck(db).hmThieuNhom.includes('Hạng mục lạ'), 'hạng mục lạ chưa có nhóm phải được giao diện cảnh báo');
    const by = (t) => db.costs.find((c) => c.dienGiai === t);
    assert.equal(by('dòng 2 bình thường').thanhTien, 3520000);
    assert.equal(by('dòng 2 bình thường').soLuong, 2, 'ô công thức 1+1 đọc theo kết quả');
    assert.equal(by('thành tiền cache sai').thanhTien, 300000, 'tính lại thành tiền = SL × ĐG, không tin ô cache');
    assert.equal(by('số dạng chữ').thanhTien, 3125000);
    assert.equal(by('số dạng chữ').soLuong, 2.5);
    assert.equal(by('thiếu ngày → lấy dòng trên').ngay, '2026-08-03');
    assert.equal(by('ngày dạng chữ').ngay, '2026-08-15');
    assert.equal(by('vật tư lạ').maVT, 'XX-CHUAXACDINH');
    assert.ok(db.materials.some((m) => m.ma === 'XX-CHUAXACDINH'), 'mã vật tư lạ được thêm vào danh mục để không mồ côi');
    assert.ok(db.suppliers.some((s) => s.ma === 'NCC_LA'));
    assert.ok(db.houses.some((h) => h.ma === 'NHA_LA'));
    assert.ok(db.costItems.some((h) => h.ten === 'Hạng mục lạ'));
    assert.ok(!by('thiếu số lượng') && !by('thiếu mã CT'));
    assert.ok(KT.LOAI_CP.includes(by('loại CP lạ').loaiCP), 'loại CP lạ được tự xác định');
    // số tổng = cộng thẳng từ các dòng hợp lệ
    const expect = 3520000 + 500000 + 1000000 + 100000 + 300000 + 200000 + 3125000 + 100000 + 100000 + 100000;
    assert.equal(KT.costSummary(db, {}, KT.buildCostLedger(db)).total, expect);
  } finally { await srv.stop(); }
});

test('E5.1 file đầu vào lỗi: rỗng, sai định dạng, thiếu sheet/cột — báo lỗi tiếng Việt, dữ liệu giữ nguyên', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const before = await srv.db();
    const bad = async (buf, q, re, label) => {
      const r = await srv.call('POST', '/api/import' + (q || ''), buf);
      assert.ok(r.status >= 400 && r.status < 500, label + ': mong đợi lỗi 4xx, nhận ' + r.status + ' ' + r.body.toString().slice(0, 200));
      assert.ok(r.json && r.json.error && /[\u00C0-\u1EF9a-z]/i.test(r.json.error), label + ': thiếu thông báo lỗi');
      if (re) assert.match(r.json.error, re, label);
      assert.deepEqual(await srv.db(), before, label + ': dữ liệu phải giữ nguyên');
    };
    await bad(Buffer.alloc(0), '?mode=replace', /rỗng/, 'rỗng');
    await bad(Buffer.from('ab'), '?mode=replace', /rỗng/, '2 byte');
    await bad(Buffer.from('<html><body>không phải excel</body></html>'.repeat(20)), '?mode=replace', /Không đọc được file Excel/, 'html');
    await bad(require('crypto').randomBytes(5000), '?mode=replace', /Không đọc được file Excel/, 'byte ngẫu nhiên');
    // zip hợp lệ nhưng không phải xlsx
    const zip = new X.JSZip(); zip.file('hello.txt', 'xin chào'.repeat(50));
    await bad(await zip.generateAsync({ type: 'nodebuffer' }), '?mode=replace', /Không đọc được file Excel/, 'zip lạ');
    // xlsx đúng định dạng nhưng sai mẫu (không có sheet nào nhận ra)
    const other = new X.ExcelJS.Workbook(); other.addWorksheet('Sheet1').addRow(['a', 'b']);
    await bad(Buffer.from(await other.xlsx.writeBuffer()), '?mode=replace', /không đúng mẫu/i, 'xlsx sai mẫu');
    // cắt ngang file thật
    const real = (await srv.call('GET', '/api/export/full')).body;
    await bad(real.subarray(0, Math.floor(real.length / 2)), '?mode=replace', /Không đọc được file Excel/, 'xlsx cắt ngang');
    // NHATKYCHUNG thiếu cột Số lượng: chế độ thay thế KHÔNG được xóa chi phí đang có
    const wb = new X.ExcelJS.Workbook();
    const nk = wb.addWorksheet('NHATKYCHUNG'); nk.addRow(['Ngày', 'Mã CT', 'Hạng mục', 'Đơn giá']); nk.addRow([new Date('2026-08-01T00:00:00Z'), 'X', 'Bê tông', 1000]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    await bad(buf, '?mode=replace', /không có dòng chi phí|Gộp thêm/, 'thiếu cột số lượng, thay thế');
    // thiếu cột, dùng gộp: không thêm, không hỏng
    const m = await srv.call('POST', '/api/import?mode=merge', buf);
    assert.equal(m.status, 200);
    assert.equal(m.json.result.added.costs, 0);
    assert.match(m.json.warnings.join(' '), /Không tìm thấy tiêu đề/);
    assert.equal((await srv.db()).costs.length, before.costs.length);
    // file sổ thu chi chỉ có danh mục NCC, chế độ thay thế: không được xóa sổ
    const wb2 = new X.ExcelJS.Workbook(); const s2 = wb2.addWorksheet('Danh_Muc_NCC'); s2.addRow(['Mã NCC', 'Tên NCC']); s2.addRow(['X1', 'Nhà X']);
    const buf2 = Buffer.from(await wb2.xlsx.writeBuffer());
    const r2 = await srv.call('POST', '/api/import?mode=replace', buf2);
    assert.equal(r2.status, 400, 'thay thế bằng file không có dòng sổ nào phải bị chặn');
    assert.equal((await srv.db()).entries.length, before.entries.length);
  } finally { await srv.stop(); }
});

test('E5.2 file lớn 20.000 dòng: nhập đúng tổng, không treo, trong thời gian hợp lý', { timeout: 300000 }, async () => {
  const wb = new X.ExcelJS.Workbook();
  const ct = wb.addWorksheet('DM_CONGTRINH'); ct.addRow(['Mã CT', 'Tên công trình']); ct.addRow(['BIG', 'Công trình lớn']);
  const hm = wb.addWorksheet('DM_HANGMUC'); hm.addRow(['Mã HM', 'Nhóm CP', 'Hạng mục', 'Mã nhóm']); hm.addRow(['H1', 'Nhóm', 'Bê tông', 'N1']);
  const ng = wb.addWorksheet('DM_NHOM'); ng.addRow(['Mã nhóm', 'Tên nhóm CP']); ng.addRow(['N1', 'Nhóm']);
  const nk = wb.addWorksheet('NHATKYCHUNG');
  nk.addRow(['Ngày', 'Mã CT', 'Mã Nhà', 'Hạng mục', 'Nhóm CP', 'Loại CP', 'Mã VT', 'Tên vật tư', 'ĐVT', 'Diễn giải / Quy cách', 'Số lượng', 'Đơn giá', 'Thành tiền', 'Mã NCC', 'Tên NCC', 'Số phiếu', 'Ghi chú']);
  let total = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const sl = ((i % 97) + 1) / 4; const dg = 1000 + (i % 1013) * 7;
    total += X.thanhTien(sl, dg);
    nk.addRow([new Date(Date.UTC(2026, i % 12, 1 + (i % 28))), 'BIG', '', 'Bê tông', '', 'Vật tư', '', '', '', 'dòng ' + i, sl, dg, null, 'NCC_BIG' + (i % 50), '', '', '']);
  }
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const srv = await startServer({});
  try {
    let t0 = Date.now();
    const pv = await importBuf(srv, buf, '?dryRun=1');
    assert.equal(pv.status, 200, pv.body.toString().slice(0, 200));
    assert.equal(pv.json.preview.stats.soDong, N);
    assert.equal(pv.json.preview.stats.tongChiPhi, total);
    const tPreview = Date.now() - t0;
    t0 = Date.now();
    const r = await importBuf(srv, buf, '?mode=replace');
    assert.equal(r.status, 200, r.body.toString().slice(0, 200));
    const tImport = Date.now() - t0;
    const db = await srv.db();
    assert.equal(db.costs.length, N);
    assert.equal(KT.costSummary(db, {}, KT.buildCostLedger(db)).total, total);
    assert.deepEqual(orphanErrors(db), []);
    // xuất ra Excel rồi nhập lại: vẫn đúng
    t0 = Date.now();
    const ex = await srv.call('GET', '/api/export/costs');
    assert.equal(ex.status, 200);
    const tExport = Date.now() - t0;
    const back = await startServer({});
    try {
      const r2 = await importBuf(back, ex.body, '?mode=replace');
      assert.equal(r2.status, 200);
      assert.equal(KT.costSummary(await back.db(), {}, KT.buildCostLedger(await back.db())).total, total);
    } finally { await back.stop(); }
    console.log('    20.000 dòng: xem trước ' + tPreview + ' ms, nhập ' + tImport + ' ms, xuất ' + tExport + ' ms, ' + (buf.length / 1024 | 0) + ' KB');
    assert.ok(tImport < 120000, 'nhập quá chậm');
  } finally { await srv.stop(); }
});

test('E1.3 nhập file .xlsm (macro-enabled, có vbaProject.bin): đọc được như .xlsx', async () => {
  const src = await startServer({ seed: V2 });
  let xlsx;
  try { xlsx = (await src.call('GET', '/api/export/costs')).body; } finally { await src.stop(); }
  // chuyển thành "xlsm": đổi kiểu nội dung của workbook và thêm khối macro giả
  const zip = await X.JSZip.loadAsync(xlsx);
  let ct = await zip.file('[Content_Types].xml').async('string');
  ct = ct.replace('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml', 'application/vnd.ms-excel.sheet.macroEnabled.main+xml');
  ct = ct.replace('</Types>', '<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>');
  zip.file('[Content_Types].xml', ct);
  zip.file('xl/vbaProject.bin', Buffer.from('VBA giả lập'));
  let rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  rels = rels.replace('</Relationships>', '<Relationship Id="rIdVba" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/></Relationships>');
  zip.file('xl/_rels/workbook.xml.rels', rels);
  const xlsm = await zip.generateAsync({ type: 'nodebuffer' });
  const dst = await startServer({});
  try {
    const r = await importBuf(dst, xlsm, '?mode=replace');
    assert.equal(r.status, 200, r.body.toString().slice(0, 300));
    const db = await dst.db();
    assert.equal(db.costs.length, 104);
    assert.equal(KT.costSummary(db, {}, KT.buildCostLedger(db)).total, EXCEL.tong);
  } finally { await dst.stop(); }
});

test('E8 sổ thu chi: xuất đầy đủ → nhập lại (thay thế / gộp) khớp; hai khoản giống hệt nhau không bị mất khi gộp', async () => {
  const src = await startServer({ seed: V2 });
  let full; let srcDb;
  try { full = (await src.call('GET', '/api/export/full')).body; srcDb = await src.db(); } finally { await src.stop(); }
  const dst = await startServer({});
  try {
    const pv = await importBuf(dst, full, '?dryRun=1');
    assert.equal(pv.status, 200, pv.body.toString().slice(0, 300));
    assert.equal(pv.json.preview.stats.soDong, srcDb.entries.length);
    const r = await importBuf(dst, full, '?mode=replace');
    assert.equal(r.status, 200, r.body.toString().slice(0, 300));
    const db = await dst.db();
    const pick = (l, f) => l.map((x) => f.map((k) => x[k] == null ? '' : x[k]).join('|'));
    assert.deepEqual(pick(db.entries, ['ngay', 'soPhieu', 'maDuAn', 'maNCC', 'noiDung', 'thu', 'chi', 'nguoiNhan', 'ghiChu']), pick(srcDb.entries.slice().sort((a, b) => (a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : a.seq - b.seq)), ['ngay', 'soPhieu', 'maDuAn', 'maNCC', 'noiDung', 'thu', 'chi', 'nguoiNhan', 'ghiChu']));
    assert.deepEqual(pick(db.projects, ['ma', 'ten', 'nganSach']).sort(), pick(srcDb.projects, ['ma', 'ten', 'nganSach']).sort(), 'danh mục dự án');
    assert.deepEqual(pick(db.suppliers, ['ma', 'ten']).sort(), pick(srcDb.suppliers, ['ma', 'ten']).sort(), 'danh mục NCC');
    const led = KT.filterLedger(KT.buildLedger(db), {}); const led0 = KT.filterLedger(KT.buildLedger(srcDb), {});
    assert.equal(led.tongThu, led0.tongThu); assert.equal(led.tongChi, led0.tongChi); assert.equal(led.tonCuoiKy, 943000);
    // gộp lại cùng file: không nhân đôi
    const m = await importBuf(dst, full, '?mode=merge');
    assert.equal(m.json.result.added.entries, 0);
    assert.equal((await dst.db()).entries.length, srcDb.entries.length);
    // hai khoản giống hệt nhau (cùng ngày, phiếu, nội dung, số tiền) phải được giữ cả hai
    const empty = await startServer({});
    try {
      await empty.ok('POST', '/api/suppliers', { ma: 'S1', ten: 'NCC 1' });
      await empty.ok('POST', '/api/entries', { ngay: '2026-09-01', noiDung: 'Mua vé', chi: 50000, maNCC: 'S1' });
      await empty.ok('POST', '/api/entries', { ngay: '2026-09-01', noiDung: 'Mua vé', chi: 50000, maNCC: 'S1' });
      const one = (await empty.call('GET', '/api/export/full')).body;
      const into = await startServer({});
      try {
        await importBuf(into, one, '?mode=merge');
        assert.equal((await into.db()).entries.length, 2, 'gộp vào sổ trống: phải đủ 2 dòng giống hệt nhau');
        await importBuf(into, one, '?mode=merge');
        assert.equal((await into.db()).entries.length, 2, 'gộp lần hai không nhân đôi');
        await importBuf(into, one, '?mode=replace');
        assert.equal((await into.db()).entries.length, 2);
      } finally { await into.stop(); }
    } finally { await empty.stop(); }
  } finally { await dst.stop(); }
});

test('E3.4 các file xuất khác mở được bằng exceljs và có số liệu đúng (sổ thu chi theo bộ lọc, dự án, NCC, sổ chi phí, công nợ)', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const db = await srv.db();
    const led = KT.buildLedger(db);
    const flt = KT.filterLedger(led, { from: '2026-09-05', to: '2026-09-20', loai: 'chi' });
    const scan = async (url) => {
      const r = await srv.call('GET', url);
      assert.equal(r.status, 200, url);
      const wb = await X.loadWb(r.body);
      const nums = new Set(); const texts = [];
      wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => { const v = X.cellVal(c); if (typeof v === 'number') nums.add(v); else if (typeof v === 'string') texts.push(v); })));
      return { wb, nums, texts };
    };
    let x = await scan('/api/export/ledger?from=2026-09-05&to=2026-09-20&loai=chi');
    assert.ok(x.nums.has(flt.tongChi), 'tổng chi theo bộ lọc ' + flt.tongChi);
    x = await scan('/api/export/ledger');
    const all = KT.filterLedger(led, {});
    assert.ok(x.nums.has(all.tongThu) && x.nums.has(all.tongChi) && x.nums.has(all.tonCuoiKy), 'tổng thu/chi/tồn quỹ toàn sổ');
    x = await scan('/api/export/projects');
    const ps = KT.projectSummary(db);
    assert.ok(x.nums.has(ps.total.chi), 'tổng chi dự án');
    x = await scan('/api/export/suppliers');
    // Tổng hợp NCC theo kỳ: tổng Thanh toán = chi − thu của mọi dòng sổ có mã NCC (+ trả ngoài quỹ), tổng Phát sinh = chi phí có mã NCC
    const tt = db.entries.filter((e) => e.maNCC).reduce((t, e) => t + (e.chi || 0) - (e.thu || 0), 0) + (db.extPayments || []).reduce((t, p) => t + p.soTien, 0);
    const psNCC = db.costs.filter((c) => c.maNCC).reduce((t, c) => t + c.thanhTien, 0);
    assert.ok(x.nums.has(tt), 'tổng thanh toán NCC ' + tt);
    assert.ok(x.nums.has(psNCC - tt), 'tổng cuối kỳ NCC ' + (psNCC - tt));
    x = await scan('/api/export/cost-ledger');
    assert.ok(x.nums.has(EXCEL.tong), 'tổng sổ chi phí');
    x = await scan('/api/export/cost-ledger?loai=' + encodeURIComponent('Vật tư'));
    assert.ok(x.nums.has(EXCEL.loai['Vật tư']), 'tổng vật tư');
    x = await scan('/api/export/cost-debt');
    assert.ok(x.nums.has(EXCEL.daTra) || x.nums.has(EXCEL.tong), 'công nợ có tổng');
    // nhãn tên tệp tải về
    const dl = await srv.call('GET', '/api/export/ledger');
    assert.match(dl.headers['content-disposition'], /filename="SoThuChi_[\w-]+\.xlsx"/);
  } finally { await srv.stop(); }
});
