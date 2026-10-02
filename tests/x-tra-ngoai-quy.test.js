'use strict';
/* X. Trả nhà cung cấp từ NGUỒN TIỀN KHÁC (ngoài quỹ tiền mặt): giảm công nợ NCC nhưng không vào sổ thu chi, không đổi tồn quỹ.
 * Qua API thật; số kỳ vọng tính độc lập từ dữ liệu thô. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { KT, startServer, readStored } = require('./helpers');
const X = require('./excel-helpers');

function seed() {
  let id = 1;
  const db = {
    schema: 3, settings: {}, vouchers: {}, trash: [], locks: [], attachments: [], cashCounts: [], ignoredWarnings: {},
    projects: [
      { id: id++, ma: 'CT1', ten: 'Công trình 1', nganSach: 0, trangThai: 'Đang thực hiện', ghiChu: '' },
      { id: id++, ma: 'CT2', ten: 'Công trình 2', nganSach: 0, trangThai: 'Đang thực hiện', ghiChu: '' }
    ],
    suppliers: [
      { id: id++, ma: 'NCC_A', ten: 'Vật liệu A', loai: 'Vật tư', sdt: '', diaChi: '', ghiChu: '' },
      { id: id++, ma: 'NCC_B', ten: 'Đội thợ B', loai: 'Nhân công', sdt: '', diaChi: '', ghiChu: '' },
      { id: id++, ma: 'NCC_C', ten: 'Chưa dùng', loai: '', sdt: '', diaChi: '', ghiChu: '' }
    ],
    costGroups: [{ id: id++, ma: 'G1', ten: 'Vật liệu', ghiChu: '' }],
    costItems: [{ id: id++, ma: 'HM01', ten: 'Vật tư', maNhom: 'G1', ghiChu: '' }],
    materials: [], houses: [], costs: [], entries: []
  };
  const cost = (ngay, ct, ncc, tt) => db.costs.push({ id: id++, seq: db.costs.length + 1, phieuId: 0, ngay, maCT: ct, maNha: '', maHM: 'HM01', loaiCP: 'Vật tư', maVT: '',
    dienGiai: 'cp ' + db.costs.length, soLuong: 1, donGia: tt, thanhTien: tt, maNCC: ncc, soPhieu: '', ghiChu: '', nguon: 'mau' });
  const entry = (ngay, ct, ncc, thu, chi) => db.entries.push({ id: id++, seq: db.entries.length + 1, ngay, soPhieu: '', maDuAn: ct, maNCC: ncc, noiDung: 'tc ' + db.entries.length,
    thu, chi, nguoiNhan: '', ghiChu: '' });
  cost('2026-07-02', 'CT1', 'NCC_A', 40000000); cost('2026-07-10', 'CT2', 'NCC_A', 25000000); cost('2026-07-12', 'CT1', 'NCC_B', 18000000);
  entry('2026-07-01', '', '', 100000000, 0); // nộp quỹ
  entry('2026-07-15', 'CT1', 'NCC_A', 0, 10000000);
  entry('2026-07-16', 'CT1', 'NCC_B', 0, 5000000);
  db.nextId = id + 5;
  return db;
}

// số liệu độc lập
function tinh(db, ncc, ct) {
  const k = KT.keyOf;
  const cp = db.costs.filter((c) => k(c.maNCC) === k(ncc) && (!ct || k(c.maCT) === k(ct))).reduce((t, c) => t + c.thanhTien, 0);
  const quy = db.entries.filter((e) => k(e.maNCC) === k(ncc) && (!ct || k(e.maDuAn) === k(ct))).reduce((t, e) => t + (e.chi || 0) - (e.thu || 0), 0);
  const ngoai = (db.extPayments || []).filter((p) => k(p.maNCC) === k(ncc) && (!ct || k(p.maDuAn) === k(ct))).reduce((t, p) => t + p.soTien, 0);
  return { phatSinh: cp, daTra: quy + ngoai, daTraNgoai: ngoai, conLai: cp - quy - ngoai };
}
const tonQuy = (db) => db.entries.reduce((t, e) => t + (e.thu || 0) - (e.chi || 0), 0);
const row = (db, ncc, f) => KT.supplierDebt(db, Object.assign({}, f)).rows.find((r) => r.ma === ncc);

test('X1 ghi khoản trả NCC từ nguồn khác: công nợ giảm đúng (theo NCC và theo công trình), sổ thu chi và tồn quỹ không đổi; sửa / xóa vào thùng rác / khôi phục; nhật ký', async () => {
  const srv = await startServer({ seed: seed() });
  try {
    const d0 = readStored(srv.dataDir);
    assert.deepEqual(d0.extPayments, []);
    const ton0 = tonQuy(d0);
    let r = await srv.ok('POST', '/api/ext-payments', { ngay: '2026-08-05', maNCC: 'ncc_a', maDuAn: 'ct1', soTien: '20tr', nguon: 'Chuyển khoản công ty', ghiChu: 'UNC 123, anh Đức chuyển' });
    const id = r.id;
    let db = readStored(srv.dataDir);
    const x = db.extPayments.find((p) => p.id === id);
    assert.deepEqual([x.ngay, x.maNCC, x.maDuAn, x.soTien, x.nguon, x.ghiChu], ['2026-08-05', 'NCC_A', 'CT1', 20000000, 'Chuyển khoản công ty', 'UNC 123, anh Đức chuyển'],
      'mã chuẩn hóa theo danh mục, số tiền đọc kiểu 20tr');
    assert.deepEqual(db.entries, d0.entries, 'không tạo dòng sổ thu chi');
    assert.equal(tonQuy(db), ton0, 'tồn quỹ không đổi');
    // công nợ = phát sinh − (sổ quỹ + ngoài quỹ)
    const exp = tinh(db, 'NCC_A');
    const got = row(db, 'NCC_A');
    assert.deepEqual([got.phatSinh, got.daTra, got.daTraNgoai, got.daTraQuy, got.conLai], [exp.phatSinh, exp.daTra, 20000000, 10000000, exp.conLai]);
    assert.equal(got.conLai, 65000000 - 30000000);
    const ct1 = tinh(db, 'NCC_A', 'CT1');
    assert.equal(row(db, 'NCC_A', { ct: 'CT1' }).conLai, ct1.conLai, 'theo công trình CT1');
    assert.equal(ct1.conLai, 40000000 - 10000000 - 20000000);
    assert.equal(row(db, 'NCC_A', { ct: 'CT2' }).daTra, 0, 'khoản gắn CT1 không trừ nợ CT2');
    assert.equal(row(db, 'NCC_A', { to: '2026-08-04' }).daTraNgoai, 0, 'tính đến ngày trước khi trả');
    const sum = KT.projectDebtSummary(db, {});
    assert.equal(sum.rows.find((p) => p.ma === 'CT1').daTra, 10000000 + 5000000 + 20000000);
    assert.equal(KT.debtOf(db, 'NCC_A', 'CT1').conLai, ct1.conLai, 'gợi ý công nợ ở form phiếu chi cũng trừ khoản ngoài quỹ');
    // khoản không gắn công trình: vào "trả chưa gán công trình"
    r = await srv.ok('POST', '/api/ext-payments', { ngay: '2026-08-06', maNCC: 'NCC_B', soTien: 3000000, nguon: 'Chủ nhà trả trực tiếp' });
    const idB = r.id;
    db = readStored(srv.dataDir);
    assert.equal(KT.projectDebtSummary(db, {}).traChuaGanCT.soTien, 3000000);
    assert.equal(row(db, 'NCC_B').conLai, 18000000 - 5000000 - 3000000);
    // sửa
    await srv.ok('PUT', '/api/ext-payments/' + idB, { ngay: '2026-08-07', maNCC: 'NCC_B', maDuAn: 'CT1', soTien: 4000000, nguon: 'Chủ nhà trả trực tiếp', ghiChu: 'đợt 2' });
    db = readStored(srv.dataDir);
    assert.equal(row(db, 'NCC_B', { ct: 'CT1' }).conLai, 18000000 - 5000000 - 4000000);
    assert.equal(KT.projectDebtSummary(db, {}).traChuaGanCT.soTien, 0);
    // xóa → thùng rác → công nợ tăng lại; khôi phục → như trước
    const truocXoa = row(db, 'NCC_B').conLai;
    await srv.ok('DELETE', '/api/ext-payments/' + idB);
    db = readStored(srv.dataDir);
    assert.ok(!db.extPayments.some((p) => p.id === idB));
    assert.equal(row(db, 'NCC_B').conLai, truocXoa + 4000000);
    const t = db.trash.find((x) => x.kind === 'extPayments');
    assert.ok(t, 'vào thùng rác');
    await srv.ok('POST', '/api/trash/' + t.id + '/restore');
    db = readStored(srv.dataDir);
    assert.equal(row(db, 'NCC_B').conLai, truocXoa, 'khôi phục');
    assert.equal(tonQuy(db), ton0, 'suốt quá trình tồn quỹ không đổi');
    // giao diện nhận dữ liệu qua /api/db
    assert.equal((await srv.db()).extPayments.length, 2);
    const audit = (await srv.ok('GET', '/api/audit?limit=50')).items.filter((e) => e.kind === 'extPayments');
    assert.deepEqual(audit.map((e) => e.action).sort(), ['khoi-phuc', 'sua', 'them', 'them', 'xoa'].sort());
  } finally { await srv.stop(); }
});

test('X2 kiểm tra dữ liệu vào: thiếu / sai NCC, mã dự án lạ, số tiền ≤ 0 / chữ, số lẻ làm tròn, ngày sai, ghi chú quá dài, id lạ → 400 / 404; không ghi gì', async () => {
  const srv = await startServer({ seed: seed() });
  try {
    const d0 = readStored(srv.dataDir);
    const bad = [
      [{ ngay: '2026-08-05', soTien: 1000, nguon: 'x' }, /nhà cung cấp/],
      [{ ngay: '2026-08-05', maNCC: 'KHONG_CO', soTien: 1000 }, /chưa có trong danh mục/],
      [{ ngay: '2026-08-05', maNCC: 'NCC_A', maDuAn: 'CT_LA', soTien: 1000 }, /chưa có trong danh mục/],
      [{ ngay: '2026-08-05', maNCC: 'NCC_A', soTien: 0 }, /lớn hơn 0/],
      [{ ngay: '2026-08-05', maNCC: 'NCC_A', soTien: -5000 }, /âm|lớn hơn 0/],
      [{ ngay: '2026-08-05', maNCC: 'NCC_A', soTien: 'abc' }, /Số tiền/],
      [{ ngay: '2026-13-45', maNCC: 'NCC_A', soTien: 1000 }, /Ngày/],
      [{ ngay: '2026-08-05', maNCC: 'NCC_A', soTien: 1000, ghiChu: 'x'.repeat(5000) }, null],
      ['chuỗi', /không hợp lệ|đối tượng JSON/],
      [[1, 2], /không hợp lệ|đối tượng JSON/]
    ];
    for (const [body, re] of bad) {
      const r = await srv.call('POST', '/api/ext-payments', body);
      if (re === null) {
        // ghi chú quá dài: được cắt bớt hoặc từ chối, không được lưu nguyên
        if (r.status === 200) { const x = readStored(srv.dataDir).extPayments.pop(); assert.ok(x.ghiChu.length <= 1000); await srv.ok('DELETE', '/api/ext-payments/' + x.id); }
        else assert.equal(r.status, 400);
        continue;
      }
      assert.equal(r.status, 400, JSON.stringify(body).slice(0, 80) + ' → ' + r.status);
      assert.match(r.json.error, re);
    }
    // tiền luôn là số nguyên đồng (số lẻ được làm tròn như mọi ô tiền khác)
    const { id } = await srv.ok('POST', '/api/ext-payments', { ngay: '2026-08-05', maNCC: 'NCC_A', soTien: 1000.4, nguon: 'x' });
    assert.equal(readStored(srv.dataDir).extPayments.find((p) => p.id === id).soTien, 1000);
    await srv.ok('DELETE', '/api/ext-payments/' + id);
    await srv.ok('DELETE', '/api/trash/' + readStored(srv.dataDir).trash.find((t) => t.kind === 'extPayments').id);
    assert.equal((await srv.call('PUT', '/api/ext-payments/999999', { ngay: '2026-08-05', maNCC: 'NCC_A', soTien: 1 })).status, 404);
    assert.equal((await srv.call('DELETE', '/api/ext-payments/999999')).status, 404);
    const d1 = readStored(srv.dataDir);
    assert.deepEqual(d1.extPayments, d0.extPayments);
    assert.deepEqual(d1.entries, d0.entries);
  } finally { await srv.stop(); }
});

test('X3 khóa sổ tháng: không ghi / sửa / xóa khoản trả ngoài quỹ của tháng đã khóa (423); NCC đang có khoản trả không xóa được; đổi mã NCC / dự án lan sang; gộp mã NCC chuyển cả khoản trả, hoàn tác trả lại', async () => {
  const srv = await startServer({ seed: seed() });
  try {
    const { id } = await srv.ok('POST', '/api/ext-payments', { ngay: '2026-07-20', maNCC: 'NCC_C', maDuAn: 'CT2', soTien: 1500000, nguon: 'Giám đốc trả' });
    await srv.ok('POST', '/api/locks', { months: ['2026-07'] });
    let r = await srv.call('POST', '/api/ext-payments', { ngay: '2026-07-21', maNCC: 'NCC_A', soTien: 1000, nguon: 'x' });
    assert.equal(r.status, 423);
    r = await srv.call('PUT', '/api/ext-payments/' + id, { ngay: '2026-08-01', maNCC: 'NCC_C', soTien: 1500000, nguon: 'Giám đốc trả' });
    assert.equal(r.status, 423, 'chuyển ra khỏi tháng đã khóa cũng bị chặn');
    r = await srv.call('DELETE', '/api/ext-payments/' + id);
    assert.equal(r.status, 423);
    await srv.ok('POST', '/api/locks/unlock', { thang: '2026-07', lyDo: 'kiểm thử' });
    let db = readStored(srv.dataDir);
    const sC = db.suppliers.find((s) => s.ma === 'NCC_C');
    r = await srv.call('DELETE', '/api/suppliers/' + sC.id);
    assert.equal(r.status, 400); assert.match(r.json.error, /khoản trả NCC ngoài quỹ/);
    // đổi mã NCC và mã dự án → khoản trả theo mã mới
    await srv.ok('PUT', '/api/suppliers/' + sC.id, { ma: 'NCC_C2', ten: 'Đổi tên', loai: '' });
    const p2 = db.projects.find((p) => p.ma === 'CT2');
    await srv.ok('PUT', '/api/projects/' + p2.id, Object.assign({}, p2, { ma: 'CT2B' }));
    db = readStored(srv.dataDir);
    assert.deepEqual([db.extPayments[0].maNCC, db.extPayments[0].maDuAn], ['NCC_C2', 'CT2B']);
    // gộp NCC_C2 vào NCC_A: khoản trả chuyển sang NCC_A; tổng công nợ không đổi; hoàn tác trả lại
    const truoc = KT.supplierDebt(db, {}).totalAll;
    const pv = (await srv.ok('POST', '/api/merge/preview', { loai: 'ncc', nguon: ['NCC_C2'], dich: 'NCC_A' })).preview;
    assert.equal(pv.nguon[0].counts.extPayments, 1);
    assert.equal(pv.nguon[0].tien.traNgoai, 1500000);
    const g = (await srv.ok('POST', '/api/merge', { loai: 'ncc', nguon: ['NCC_C2'], dich: 'NCC_A', phienBan: pv.phienBan })).merge;
    db = readStored(srv.dataDir);
    assert.equal(db.extPayments[0].maNCC, 'NCC_A');
    const sau = KT.supplierDebt(db, {}).totalAll;
    ['phatSinh', 'daTra', 'daTraNgoai', 'conLai'].forEach((k) => assert.equal(sau[k], truoc[k], 'tổng ' + k + ' không đổi'));
    // ghi bằng mã cũ đã gộp → tự về mã đích
    r = await srv.ok('POST', '/api/ext-payments', { ngay: '2026-08-02', maNCC: 'ncc_c2', soTien: 1000, nguon: 'x' });
    db = readStored(srv.dataDir);
    assert.equal(db.extPayments.find((p) => p.id === r.id).maNCC, 'NCC_A');
    await srv.ok('DELETE', '/api/ext-payments/' + r.id);
    await srv.ok('POST', '/api/merge/' + g.id + '/undo');
    db = readStored(srv.dataDir);
    assert.equal(db.extPayments[0].maNCC, 'NCC_C2', 'hoàn tác');
  } finally { await srv.stop(); }
});

test('X4 Excel: file chi phí có sheet TRA_NGOAI_QUY, công nợ NCC / theo công trình cộng khoản ngoài quỹ bằng công thức; nhập lại file (gộp thêm) không nhân đôi, nhập vào máy mới thì có đủ; file công nợ có sheet Tra_Ngoai_Quy', async () => {
  const srv = await startServer({ seed: seed() });
  const srv2 = await startServer({ seed: seed() });
  try {
    await srv.ok('POST', '/api/ext-payments', { ngay: '2026-08-05', maNCC: 'NCC_A', maDuAn: 'CT1', soTien: 20000000, nguon: 'Chuyển khoản công ty', ghiChu: 'UNC 123' });
    await srv.ok('POST', '/api/ext-payments', { ngay: '2026-08-06', maNCC: 'NCC_B', soTien: 3000000, nguon: 'Chủ nhà trả trực tiếp' });
    const db = readStored(srv.dataDir);
    const buf = (await srv.call('GET', '/api/export/costs')).body;
    const wb = await X.loadWb(buf);
    const ws = wb.getWorksheet('TRA_NGOAI_QUY');
    assert.ok(ws, 'có sheet TRA_NGOAI_QUY');
    assert.equal(X.cellVal(ws.getCell('E2')), 20000000);
    assert.equal(X.cellVal(ws.getCell('F3')), 'Chủ nhà trả trực tiếp');
    const cn = wb.getWorksheet('CONGNO_NCC');
    let found = 0;
    cn.eachRow((rw, n) => {
      if (n < 6) return;
      const ma = X.cellVal(rw.getCell(1));
      const d = KT.supplierDebt(db, {}).rows.find((r) => r.ma === ma);
      if (!d) return;
      const c = rw.getCell(5); // cột E: Đã trả (C = Số dư đầu kỳ, D = Chi phí phát sinh)
      assert.match(c.formula || '', /TRA_NGOAI_QUY/, 'công thức Đã trả có cộng TRA_NGOAI_QUY');
      assert.equal(X.cellVal(c), d.daTra);
      found++;
    });
    assert.ok(found >= 2);
    const cnct = wb.getWorksheet('CONGNO_CONGTRINH');
    assert.match(cnct.getCell('D5').formula || '', /TRA_NGOAI_QUY/);
    if (X.findSoffice()) {
      const cmp = await X.recalcCompare(buf, 'xp');
      assert.deepEqual(cmp.mismatches.slice(0, 5), [], 'LibreOffice tính lại khớp');
    }
    // nhập lại chính file (gộp thêm): không nhân đôi khoản trả
    let r = await srv.call('POST', '/api/import?mode=merge', buf);
    assert.equal(r.status, 200, r.body.toString().slice(0, 300));
    assert.equal(readStored(srv.dataDir).extPayments.length, 2);
    // xem trước ở máy mới báo số khoản; nhập vào máy mới → có đủ, công nợ như máy cũ
    r = await srv2.call('POST', '/api/import?dryRun=1', buf);
    assert.equal(r.json.preview.stats.traNgoaiQuy.soKhoan, 2);
    assert.equal(r.json.preview.stats.traNgoaiQuy.moi, 2);
    r = await srv2.call('POST', '/api/import?mode=merge', buf);
    assert.equal(r.status, 200, r.body.toString().slice(0, 300));
    assert.equal(r.json.result.added.extPayments, 2);
    const db2 = readStored(srv2.dataDir);
    const strip = (p) => ({ ngay: p.ngay, maNCC: p.maNCC, maDuAn: p.maDuAn, soTien: p.soTien, nguon: p.nguon, ghiChu: p.ghiChu });
    assert.deepEqual(db2.extPayments.map(strip), db.extPayments.map(strip));
    assert.equal(KT.supplierDebt(db2, {}).totalAll.conLai, KT.supplierDebt(db, {}).totalAll.conLai);
    // file công nợ
    const wd = await X.loadWb((await srv.call('GET', '/api/export/cost-debt?ncc=NCC_A')).body);
    const tq = wd.getWorksheet('Tra_Ngoai_Quy');
    assert.ok(tq, 'file công nợ có sheet Tra_Ngoai_Quy');
    const vals = [];
    tq.eachRow((rw) => vals.push(rw.values.map((v) => (v && v.result !== undefined ? v.result : v))));
    assert.ok(vals.some((v) => v.includes(20000000)));
    assert.ok(!vals.some((v) => v.includes('Chủ nhà trả trực tiếp')), 'chỉ khoản của NCC đang lọc');
    const cnw = wd.getWorksheet('Cong_No_NCC');
    const rowA = [];
    cnw.eachRow((rw) => { if (X.cellVal(rw.getCell(2)) === 'NCC_A') rowA.push(X.cellVal(rw.getCell(7))); }); // cột G: Đã trả
    assert.deepEqual(rowA, [KT.supplierDebt(db, {}).rows.find((x) => x.ma === 'NCC_A').daTra]);
  } finally { await srv.stop(); await srv2.stop(); }
});

const { SKIP, openPage, settle, num } = require('./ui-helpers');

test('X5 giao diện Công nợ NCC: nút "Nguồn khác" → form điền sẵn số còn nợ → ghi nguồn + ghi chú → công nợ về 0, cột Đã trả có dòng "ngoài quỹ", khung chi tiết liệt kê; tồn quỹ ở Tổng quan không đổi; sửa, xóa', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({ seed: seed() });
  const { browser, page, errors } = await openPage(srv, '#/cp-cong-no');
  try {
    const ton0 = tonQuy(readStored(srv.dataDir));
    const rowSel = '#view tr[data-ma="NCC_B"]';
    await page.waitForSelector(rowSel);
    const no = row(readStored(srv.dataDir), 'NCC_B').conLai;
    assert.equal(no, 13000000);
    await page.click(rowSel + ' [data-act=xp-add]');
    await page.waitForSelector('#xp-form');
    assert.equal(num(await page.inputValue('#xp-form [name=soTien]')), no, 'điền sẵn số còn nợ');
    assert.equal(await page.inputValue('#xp-form [name=maNCC]'), 'NCC_B');
    // thiếu nguồn tiền → báo lỗi tại ô, không ghi
    await page.click('.modal [data-act=save]');
    await settle(page);
    assert.equal(readStored(srv.dataDir).extPayments.length, 0);
    assert.equal(await page.locator('#xp-form').count(), 1, 'form vẫn mở');
    await page.fill('#xp-form [name=nguon]', 'Chủ nhà trả trực tiếp');
    await page.fill('#xp-form [name=ghiChu]', 'Chủ nhà chuyển khoản đợt 2');
    await page.click('.modal [data-act=save]');
    await page.waitForFunction(() => !document.querySelector('#xp-form'));
    await settle(page);
    let db = readStored(srv.dataDir);
    assert.equal(db.extPayments.length, 1);
    assert.deepEqual([db.extPayments[0].maNCC, db.extPayments[0].soTien, db.extPayments[0].nguon], ['NCC_B', no, 'Chủ nhà trả trực tiếp']);
    assert.equal(row(db, 'NCC_B').conLai, 0);
    await page.waitForFunction((s) => /ngoài quỹ/.test(document.querySelector(s).innerText), rowSel);
    assert.match(await page.$eval(rowSel, (e) => e.innerText), /Đã tất toán/);
    // khung chi tiết
    await page.click(rowSel + ' td');
    await page.waitForSelector('#cn-ext [data-xp]');
    assert.match(await page.$eval('#cn-ext', (e) => e.innerText), /Chủ nhà trả trực tiếp[\s\S]*Chủ nhà chuyển khoản đợt 2/);
    // sửa số tiền
    await page.click('#cn-ext [data-act=xp-edit]');
    await page.waitForSelector('#xp-form');
    await page.fill('#xp-form [name=soTien]', '10tr');
    await page.click('.modal [data-act=save]');
    await page.waitForFunction(() => !document.querySelector('#xp-form'));
    db = readStored(srv.dataDir);
    assert.equal(db.extPayments[0].soTien, 10000000);
    assert.equal(row(db, 'NCC_B').conLai, 3000000);
    // tồn quỹ ở Tổng quan không đổi
    assert.equal(tonQuy(db), ton0);
    // xóa
    await page.waitForSelector('#cn-ext [data-act=xp-del]');
    await page.click('#cn-ext [data-act=xp-del]');
    await page.click('.modal [data-act=yes]');
    await page.waitForFunction(() => !document.querySelector('#cn-ext [data-xp]'));
    db = readStored(srv.dataDir);
    assert.equal(db.extPayments.length, 0);
    assert.equal(db.trash.filter((t) => t.kind === 'extPayments').length, 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});
