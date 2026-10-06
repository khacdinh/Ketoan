'use strict';
/* Y. Số dư đầu kỳ công nợ nhà cung cấp (nhập tay) và báo cáo theo kỳ: Đầu kỳ + Phát sinh trong kỳ − Thanh toán trong kỳ = Cuối kỳ.
 * Qua API thật; số kỳ vọng tính độc lập từ dữ liệu thô (không gọi KT.supplierPeriod / supplierDebt để tính kỳ vọng). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { KT, startServer, readStored } = require('./helpers');
const X = require('./excel-helpers');
const { SKIP, openPage, settle, chonKy } = require('./ui-helpers');

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
    dienGiai: 'cp ' + db.costs.length, soLuong: null, donGia: null, thanhTien: tt, maNCC: ncc, soPhieu: '', ghiChu: '', nguon: 'mau' });
  const entry = (ngay, ct, ncc, thu, chi) => db.entries.push({ id: id++, seq: db.entries.length + 1, ngay, soPhieu: '', maDuAn: ct, maNCC: ncc, noiDung: 'tc ' + db.entries.length,
    thu, chi, nguoiNhan: '', ghiChu: '' });
  cost('2026-06-20', 'CT1', 'NCC_A', 7000000);   // trước kỳ tháng 7
  cost('2026-07-02', 'CT1', 'NCC_A', 40000000);
  cost('2026-07-10', 'CT2', 'NCC_A', 25000000);
  cost('2026-07-12', 'CT1', 'NCC_B', 18000000);
  cost('2026-08-03', 'CT1', 'NCC_A', 9000000);   // sau kỳ tháng 7
  entry('2026-06-01', '', '', 200000000, 0);     // nộp quỹ
  entry('2026-06-25', 'CT1', 'NCC_A', 0, 2000000); // trước kỳ
  entry('2026-07-15', 'CT1', 'NCC_A', 0, 10000000);
  entry('2026-07-16', 'CT1', 'NCC_B', 0, 5000000);
  entry('2026-07-18', 'CT1', 'NCC_A', 500000, 0);  // NCC trả lại
  db.nextId = id + 5;
  return db;
}

// Số kỳ vọng độc lập cho một NCC trong kỳ [from, to] (ct: chỉ một công trình)
function oracle(db, ncc, from, to, ct) {
  const k = KT.keyOf;
  const mine = (x, f) => k(x.maNCC) === k(ncc) && (!ct || k(x[f]) === k(ct)) && (!to || x.ngay <= to);
  const before = (x) => from && x.ngay < from;
  let dauKy = 0; let phatSinh = 0; let thanhToan = 0;
  (db.soDuDauKy || []).filter((x) => mine(x, 'maDuAn')).forEach((x) => { dauKy += x.soTien; });
  db.costs.filter((x) => mine(x, 'maCT')).forEach((x) => { if (before(x)) dauKy += x.thanhTien; else phatSinh += x.thanhTien; });
  db.entries.filter((x) => mine(x, 'maDuAn')).forEach((x) => { const v = (x.chi || 0) - (x.thu || 0); if (before(x)) dauKy -= v; else thanhToan += v; });
  (db.extPayments || []).filter((x) => mine(x, 'maDuAn')).forEach((x) => { if (before(x)) dauKy -= x.soTien; else thanhToan += x.soTien; });
  return { dauKy, phatSinh, thanhToan, cuoiKy: dauKy + phatSinh - thanhToan };
}
const pick = (r) => ({ dauKy: r.dauKy, phatSinh: r.phatSinh, thanhToan: r.thanhToan, cuoiKy: r.cuoiKy });

test('Y1 API số dư đầu kỳ: nhập (dương = còn nợ, âm = ứng trước, "-5tr"), kiểm tra dữ liệu, sửa, xóa vào thùng rác / khôi phục, nhật ký; công nợ và báo cáo theo kỳ khớp số tính độc lập', async () => {
  const srv = await startServer({ seed: seed() });
  try {
    assert.deepEqual(readStored(srv.dataDir).soDuDauKy, []);
    const a = await srv.ok('POST', '/api/so-du-dau', { ngay: '2026-01-01', maNCC: 'ncc_a', maDuAn: 'ct1', soTien: '30tr', ghiChu: 'Biên bản đối chiếu 31/12/2025' });
    const b = await srv.ok('POST', '/api/so-du-dau', { ngay: '2026-01-01', maNCC: 'NCC_B', soTien: '-5tr' });
    await srv.ok('POST', '/api/so-du-dau', { ngay: '2026-07-20', maNCC: 'NCC_A', soTien: -1200000 }); // nhập ngày giữa kỳ
    let db = readStored(srv.dataDir);
    const ra = db.soDuDauKy.find((x) => x.id === a.id);
    assert.deepEqual([ra.ngay, ra.maNCC, ra.maDuAn, ra.soTien, ra.ghiChu], ['2026-01-01', 'NCC_A', 'CT1', 30000000, 'Biên bản đối chiếu 31/12/2025'], 'mã chuẩn hóa theo danh mục, đọc 30tr');
    assert.equal(db.soDuDauKy.find((x) => x.id === b.id).soTien, -5000000);
    assert.ok(ra.nguoiTao, 'ghi người tạo');
    // dữ liệu sai
    for (const [body, re] of [[{ ngay: '2026-01-01', maNCC: 'NCC_A', soTien: 0 }, /khác 0/], [{ ngay: '2026-01-01', maNCC: 'KHONG_CO', soTien: 1 }, /chưa có trong danh mục/],
      [{ ngay: '31/12', maNCC: 'NCC_A', soTien: 1 }, /Ngày/], [{ ngay: '2026-01-01', maNCC: 'NCC_A', maDuAn: 'CT9', soTien: 1 }, /công trình/], [{ ngay: '2026-01-01', soTien: 1 }, /nhà cung cấp/],
      [{ ngay: '2026-01-01', maNCC: 'NCC_A', soTien: 'abc' }, /không hợp lệ/]]) {
      const r = await srv.call('POST', '/api/so-du-dau', body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.match(r.json.error, re);
    }
    // công nợ (đến hết ngày) = đầu kỳ + phát sinh − đã trả; theo công trình chỉ lấy số dư của công trình đó
    db = readStored(srv.dataDir);
    for (const [ncc, ct] of [['NCC_A', ''], ['NCC_A', 'CT1'], ['NCC_A', 'CT2'], ['NCC_B', ''], ['NCC_C', '']]) {
      const d = KT.supplierDebt(db, { ct }).rows.find((r) => r.ma === ncc);
      const o = oracle(db, ncc, '', '', ct);
      assert.deepEqual([d.dauKy, d.phatSinh, d.daTra, d.conLai], [o.dauKy, o.phatSinh, o.thanhToan, o.cuoiKy], ncc + ' ' + ct);
    }
    assert.equal(KT.supplierDebt(db, { to: '2025-12-31' }).rows.find((r) => r.ma === 'NCC_A').dauKy, 0, 'trước ngày của số dư: chưa tính');
    assert.ok(KT.supplierDebt(db, {}).rows.find((r) => r.ma === 'NCC_B').lienQuan);
    // báo cáo theo kỳ: tháng 7, quý 3, cả năm, toàn bộ; cuối kỳ luôn = công nợ đến ngày cuối kỳ
    for (const [from, to] of [['2026-07-01', '2026-07-31'], ['2026-07-01', '2026-09-30'], ['2026-01-01', '2026-12-31'], ['', ''], ['2026-07-19', '2026-07-31']]) {
      const kq = KT.supplierPeriod(db, { from, to });
      for (const ncc of ['NCC_A', 'NCC_B', 'NCC_C']) {
        const r = kq.rows.find((x) => x.ma === ncc);
        assert.deepEqual(pick(r), oracle(db, ncc, from, to), ncc + ' ' + from + '…' + to);
        assert.equal(r.cuoiKy, KT.supplierDebt(db, { to }).rows.find((x) => x.ma === ncc).conLai, 'cuối kỳ = công nợ đến ngày ' + to);
      }
      assert.equal(kq.total.cuoiKy, kq.total.dauKy + kq.total.phatSinh - kq.total.thanhToan);
    }
    // kỳ nối tiếp: cuối tháng 7 = đầu tháng 8 (khi số dư nhập tay đều trước tháng 7)
    const t7 = KT.supplierPeriod(db, { from: '2026-07-01', to: '2026-07-31' }).rows.find((x) => x.ma === 'NCC_B');
    const t8 = KT.supplierPeriod(db, { from: '2026-08-01', to: '2026-08-31' }).rows.find((x) => x.ma === 'NCC_B');
    assert.equal(t8.dauKy, t7.cuoiKy);
    // lọc NCC, công trình
    const kqB = KT.supplierPeriod(db, { from: '2026-07-01', to: '2026-07-31', ncc: ['ncc_b'] });
    assert.deepEqual(kqB.rows.map((r) => r.ma), ['NCC_B']);
    assert.deepEqual(pick(KT.supplierPeriod(db, { from: '2026-07-01', to: '2026-07-31', ct: 'CT1' }).rows.find((x) => x.ma === 'NCC_A')), oracle(db, 'NCC_A', '2026-07-01', '2026-07-31', 'CT1'));
    // công trình chỉ có số dư đầu kỳ vẫn có công nợ trong bảng theo công trình
    const pd = KT.projectDebtSummary(db, {});
    assert.equal(pd.rows.find((r) => r.ma === 'CT1').dauKy, 30000000);
    // sửa: đổi sang ứng trước; xóa → thùng rác → khôi phục
    await srv.ok('PUT', '/api/so-du-dau/' + a.id, { ngay: '2026-01-01', maNCC: 'NCC_A', maDuAn: 'CT1', soTien: '-2.500.000', ghiChu: 'đổi' });
    db = readStored(srv.dataDir);
    assert.equal(db.soDuDauKy.find((x) => x.id === a.id).soTien, -2500000);
    await srv.ok('DELETE', '/api/so-du-dau/' + a.id);
    db = readStored(srv.dataDir);
    assert.ok(!db.soDuDauKy.some((x) => x.id === a.id));
    const t = db.trash.find((x) => x.kind === 'soDuDauKy');
    assert.match(t.label, /Số dư đầu kỳ NCC .*NCC_A.*CT1.*ứng trước 2\.500\.000/);
    await srv.ok('POST', '/api/trash/' + t.id + '/restore');
    assert.equal(readStored(srv.dataDir).soDuDauKy.find((x) => x.id === a.id).soTien, -2500000);
    const log = fs.readFileSync(path.join(srv.dataDir, 'nhat-ky.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.kind === 'soDuDauKy');
    assert.deepEqual(log.map((e) => e.action), ['them', 'them', 'them', 'sua', 'xoa', 'khoi-phuc']);
    assert.equal((await srv.call('PUT', '/api/so-du-dau/999999', { ngay: '2026-01-01', maNCC: 'NCC_A', soTien: 1 })).status, 404);
  } finally { await srv.stop(); }
});

test('Y2 khóa sổ, đổi mã, gộp mã: số dư đầu kỳ của tháng đã khóa không ghi / sửa / xóa được (423); NCC đang có số dư không xóa được; đổi mã NCC / công trình lan sang; gộp NCC chuyển số dư, hoàn tác trả lại', async () => {
  const srv = await startServer({ seed: seed() });
  try {
    const { id } = await srv.ok('POST', '/api/so-du-dau', { ngay: '2026-01-01', maNCC: 'NCC_C', maDuAn: 'CT2', soTien: 4000000 });
    await srv.ok('POST', '/api/locks', { months: ['2026-01'] });
    assert.equal((await srv.call('POST', '/api/so-du-dau', { ngay: '2026-01-05', maNCC: 'NCC_A', soTien: 1 })).status, 423);
    assert.equal((await srv.call('PUT', '/api/so-du-dau/' + id, { ngay: '2026-02-01', maNCC: 'NCC_C', soTien: 4000000 })).status, 423);
    assert.equal((await srv.call('DELETE', '/api/so-du-dau/' + id)).status, 423);
    await srv.ok('POST', '/api/locks/unlock', { thang: '2026-01', lyDo: 'kiểm thử' });
    let db = readStored(srv.dataDir);
    const sC = db.suppliers.find((s) => s.ma === 'NCC_C');
    const r = await srv.call('DELETE', '/api/suppliers/' + sC.id);
    assert.equal(r.status, 400);
    assert.match(r.json.error, /số dư đầu kỳ NCC/);
    await srv.ok('PUT', '/api/suppliers/' + sC.id, { ma: 'NCC_C2', ten: 'Đổi tên', loai: '' });
    const p2 = db.projects.find((p) => p.ma === 'CT2');
    await srv.ok('PUT', '/api/projects/' + p2.id, Object.assign({}, p2, { ma: 'CT2B' }));
    db = readStored(srv.dataDir);
    assert.deepEqual([db.soDuDauKy[0].maNCC, db.soDuDauKy[0].maDuAn], ['NCC_C2', 'CT2B']);
    const truoc = KT.supplierDebt(db, {}).totalAll;
    const pv = (await srv.ok('POST', '/api/merge/preview', { loai: 'ncc', nguon: ['NCC_C2'], dich: 'NCC_A' })).preview;
    assert.equal(pv.nguon[0].counts.soDuDauKy, 1);
    const g = (await srv.ok('POST', '/api/merge', { loai: 'ncc', nguon: ['NCC_C2'], dich: 'NCC_A', phienBan: pv.phienBan })).merge;
    db = readStored(srv.dataDir);
    assert.equal(db.soDuDauKy[0].maNCC, 'NCC_A');
    const sau = KT.supplierDebt(db, {}).totalAll;
    ['dauKy', 'phatSinh', 'daTra', 'conLai'].forEach((k) => assert.equal(sau[k], truoc[k], 'tổng ' + k + ' không đổi'));
    // ghi bằng mã cũ đã gộp → tự về mã đích
    const n = await srv.ok('POST', '/api/so-du-dau', { ngay: '2026-01-02', maNCC: 'ncc_c2', soTien: 1000 });
    assert.equal(readStored(srv.dataDir).soDuDauKy.find((x) => x.id === n.id).maNCC, 'NCC_A');
    await srv.ok('DELETE', '/api/so-du-dau/' + n.id);
    await srv.ok('POST', '/api/merge/' + g.id + '/undo');
    assert.equal(readStored(srv.dataDir).soDuDauKy[0].maNCC, 'NCC_C2', 'hoàn tác');
  } finally { await srv.stop(); }
});

test('Y3 Excel: file chi phí có sheet SO_DU_DAU_NCC và cột Số dư đầu kỳ (công thức) ở CONGNO_NCC; nhập lại không nhân đôi, nhập vào máy mới có đủ; file công nợ và Tổng hợp NCC có đầu kỳ / cuối kỳ', async () => {
  const srv = await startServer({ seed: seed() });
  const srv2 = await startServer({ seed: seed() });
  try {
    await srv.ok('POST', '/api/so-du-dau', { ngay: '2026-01-01', maNCC: 'NCC_A', maDuAn: 'CT1', soTien: 30000000, ghiChu: 'BB đối chiếu' });
    await srv.ok('POST', '/api/so-du-dau', { ngay: '2026-01-01', maNCC: 'NCC_B', soTien: -5000000 });
    const db = readStored(srv.dataDir);
    const buf = (await srv.call('GET', '/api/export/costs')).body;
    const wb = await X.loadWb(buf);
    const ws = wb.getWorksheet('SO_DU_DAU_NCC');
    assert.ok(ws, 'có sheet SO_DU_DAU_NCC');
    assert.deepEqual([X.cellVal(ws.getCell('C2')), X.cellVal(ws.getCell('E2')), X.cellVal(ws.getCell('C3')), X.cellVal(ws.getCell('E3'))], ['NCC_A', 30000000, 'NCC_B', -5000000]);
    const cn = wb.getWorksheet('CONGNO_NCC');
    assert.equal(X.cellVal(cn.getCell('C5')), 'Số dư đầu kỳ');
    let found = 0;
    cn.eachRow((rw, n) => {
      if (n < 6) return;
      const d = KT.supplierDebt(db, {}).rows.find((r) => r.ma === X.cellVal(rw.getCell(1)));
      if (!d) return;
      assert.match(rw.getCell(3).formula || '', /SO_DU_DAU_NCC/);
      assert.deepEqual([3, 4, 5, 6].map((c) => X.cellVal(rw.getCell(c))), [d.dauKy, d.phatSinh, d.daTra, d.conLai], d.ma);
      found++;
    });
    assert.ok(found >= 2);
    const th = wb.getWorksheet('TONGHOP');
    let conNo = null;
    th.eachRow((rw) => { if (X.cellVal(rw.getCell(1)) === 'Còn nợ nhà cung cấp') conNo = X.cellVal(rw.getCell(2)); });
    assert.equal(conNo, KT.supplierDebt(db, {}).total.conNo);
    if (X.findSoffice()) {
      const cmp = await X.recalcCompare(buf, 'sdk');
      assert.deepEqual(cmp.mismatches.slice(0, 5), [], 'LibreOffice tính lại khớp');
    }
    // nhập lại chính file: không nhân đôi; máy mới: có đủ, công nợ như máy cũ
    let r = await srv.call('POST', '/api/import?mode=merge', buf);
    assert.equal(r.status, 200, r.body.toString().slice(0, 300));
    assert.equal(readStored(srv.dataDir).soDuDauKy.length, 2);
    r = await srv2.call('POST', '/api/import?dryRun=1', buf);
    assert.deepEqual([r.json.preview.stats.soDuDauKy.soKhoan, r.json.preview.stats.soDuDauKy.moi, r.json.preview.stats.soDuDauKy.tong], [2, 2, 25000000]);
    r = await srv2.call('POST', '/api/import?mode=merge', buf);
    assert.equal(r.json.result.added.soDuDauKy, 2);
    const db2 = readStored(srv2.dataDir);
    const strip = (p) => ({ ngay: p.ngay, maNCC: p.maNCC, maDuAn: p.maDuAn, soTien: p.soTien, ghiChu: p.ghiChu });
    assert.deepEqual(db2.soDuDauKy.map(strip), db.soDuDauKy.map(strip));
    assert.equal(KT.supplierDebt(db2, {}).totalAll.conLai, KT.supplierDebt(db, {}).totalAll.conLai);
    // file công nợ: cột E Số dư đầu kỳ, H Còn lại = E + F − G; sheet So_Du_Dau_Ky
    const wd = await X.loadWb((await srv.call('GET', '/api/export/cost-debt?ncc=NCC_B')).body);
    const cnw = wd.getWorksheet('Cong_No_NCC');
    let rowB = null;
    cnw.eachRow((rw) => { if (X.cellVal(rw.getCell(2)) === 'NCC_B') rowB = [5, 6, 7, 8].map((c) => X.cellVal(rw.getCell(c))); });
    const dB = KT.supplierDebt(db, {}).rows.find((x) => x.ma === 'NCC_B');
    assert.deepEqual(rowB, [dB.dauKy, dB.phatSinh, dB.daTra, dB.conLai]);
    assert.ok(wd.getWorksheet('So_Du_Dau_Ky'), 'file công nợ có sheet So_Du_Dau_Ky');
    // Tổng hợp NCC theo kỳ tháng 7
    const wt = await X.loadWb((await srv.call('GET', '/api/export/suppliers?from=2026-07-01&to=2026-07-31&chiCoPhatSinh=1')).body);
    const st = wt.getWorksheet('Tong_Hop_NCC');
    assert.deepEqual([4, 5, 6, 7].map((c) => X.cellVal(st.getRow(7).getCell(c))), ['Số Dư Đầu Kỳ', 'Phát Sinh Trong Kỳ', 'Thanh Toán Trong Kỳ', 'Số Dư Cuối Kỳ']);
    const seen = {};
    st.eachRow((rw, n) => { if (n > 7 && /^NCC_/.test(X.cellVal(rw.getCell(1)) || '')) seen[X.cellVal(rw.getCell(1))] = [4, 5, 6, 7].map((c) => X.cellVal(rw.getCell(c))); });
    for (const ncc of ['NCC_A', 'NCC_B']) {
      const o = oracle(db, ncc, '2026-07-01', '2026-07-31');
      assert.deepEqual(seen[ncc], [o.dauKy, o.phatSinh, o.thanhToan, o.cuoiKy], ncc);
    }
    assert.ok(!seen.NCC_C, 'NCC không có số liệu bị ẩn khi chọn "chỉ NCC có số liệu"');
  } finally { await srv.stop(); await srv2.stop(); }
});

test('Y4 nâng cấp dữ liệu lược đồ 6 → 7: sao lưu trước, thêm bảng số dư đầu kỳ, dữ liệu cũ giữ nguyên', async () => {
  const { DB_VERSION } = require('../lib/db');
  const srv0 = await startServer({ seed: seed() });
  await srv0.stop();
  const dir = srv0.dataDir;
  const c = new DatabaseSync(path.join(dir, 'ketoan.db'));
  c.exec('DROP TABLE "soDuDauKy"');
  c.exec('PRAGMA user_version = 6');
  c.close();
  fs.readdirSync(path.join(dir, 'backups')).forEach((f) => fs.unlinkSync(path.join(dir, 'backups', f)));
  const v6 = readStored(dir);
  assert.equal(v6.schema, 6);
  const srv = await startServer({ data: dir });
  try {
    const db = readStored(dir);
    assert.equal(db.schema, DB_VERSION);
    assert.deepEqual(db.soDuDauKy, []);
    ['projects', 'suppliers', 'entries', 'costs'].forEach((k) => assert.deepEqual(db[k], v6[k], k));
    assert.equal(fs.readdirSync(path.join(dir, 'backups')).filter((f) => new RegExp('truoc-nang-cap-luoc-do-' + DB_VERSION).test(f)).length, 1);
    await srv.ok('POST', '/api/so-du-dau', { ngay: '2026-01-01', maNCC: 'NCC_A', soTien: 1000 });
    assert.equal(readStored(dir).soDuDauKy.length, 1);
  } finally { await srv.stop(); }
});

test('Y5 giao diện: Công nợ NCC theo kỳ có Đầu kỳ / Phát sinh / Thanh toán / Cuối kỳ (Dư Nợ, Dư Có); bấm Số dư đầu kỳ ở dòng NCC → nhập "đã ứng trước" → bảng, trang Số dư đầu kỳ và công nợ toàn kỳ cập nhật đúng', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({ seed: seed() });
  try {
    const { browser, page, errors } = await openPage(srv, '#/cp-cong-no');
    try {
      await page.waitForSelector('#cn-table tr[data-ma="NCC_B"]');
      // kỳ tháng 7/2026
      await chonKy(page, 'cn', 'khoang', '01/07/2026', '31/07/2026');
      await page.waitForFunction(() => /01\/07\/2026/.test(document.querySelector('#view').innerText));
      // 6 cột số: Dư Nợ / Dư Có đầu kỳ, Phát sinh, Thanh toán, Dư Nợ / Dư Có cuối kỳ (không có số thì hiện "–", không bao giờ hiện số âm)
      const cells = async (ma) => page.$$eval('#cn-table tr[data-ma="' + ma + '"] td.num', (tds) => tds.slice(0, 6).map((td) => (td.firstChild ? td.firstChild.textContent : td.textContent).trim()));
      const hien = (n) => (n ? KT.fmtMoney(n) : '–');
      const fmt = (o) => [o.dauKy < 0 ? hien(-o.dauKy) : '–', o.dauKy > 0 ? hien(o.dauKy) : '–', hien(o.phatSinh), hien(o.thanhToan), o.cuoiKy < 0 ? hien(-o.cuoiKy) : '–', o.cuoiKy > 0 ? hien(o.cuoiKy) : '–'];
      assert.deepEqual(await cells('NCC_A'), fmt(oracle(readStored(srv.dataDir), 'NCC_A', '2026-07-01', '2026-07-31')));
      // nhập số dư đầu kỳ cho NCC_B: đã ứng trước 3 triệu (mở dòng NCC_B rồi bấm "Số dư đầu kỳ")
      await page.click('#cn-table tr[data-ma="NCC_B"] td');
      await page.click('#cn-table tr.open-row [data-act=dk-row]');
      await page.waitForSelector('#dk-form');
      assert.equal(await page.inputValue('#dk-form [name=maNCC]'), 'NCC_B', 'điền sẵn NCC của dòng');
      await page.check('#dk-form [name=loai][value=ung]');
      await page.fill('#dk-form [name=soTien]', '3tr');
      await page.locator('#dk-form .date-text').fill('01/01/2026');
      await page.click('.modal [data-act=save]');
      await page.waitForFunction(() => /đã ứng trước 3\.000\.000/.test(document.querySelector('#toast-root').textContent));
      const db = readStored(srv.dataDir);
      assert.deepEqual(db.soDuDauKy.map((x) => [x.maNCC, x.soTien, x.ngay]), [['NCC_B', -3000000, '2026-01-01']]);
      await page.waitForFunction(() => !document.querySelector('#dk-form'));
      await settle(page);
      assert.deepEqual(await cells('NCC_B'), fmt(oracle(db, 'NCC_B', '2026-07-01', '2026-07-31')));
      // trang Số dư đầu kỳ liệt kê khoản vừa nhập, ở cột Dư Nợ (đã ứng trước)
      await page.evaluate(() => { location.hash = '#/so-du-dau'; });
      await page.waitForSelector('#sd-table tr[data-dk]');
      const dong = await page.$$eval('#sd-table tr[data-dk] td', (tds) => tds.map((td) => td.textContent.trim()));
      assert.ok(dong.some((t) => /NCC_B/.test(t)) && dong.some((t) => t === '3.000.000'), JSON.stringify(dong));
      // công nợ toàn kỳ: khớp KT.supplierDebt (đầu kỳ nhập tay + phát sinh − đã trả)
      await page.evaluate(() => { location.hash = '#/cp-cong-no'; });
      await page.waitForSelector('#cn-table tr[data-ma="NCC_B"]');
      await chonKy(page, 'cn', 'tat-ca');
      await page.waitForFunction(() => !/Kỳ/.test(document.querySelector('#cn-chips').innerText));
      const d = KT.supplierDebt(db, {}).rows.find((r) => r.ma === 'NCC_B');
      assert.deepEqual(await cells('NCC_B'), fmt({ dauKy: d.dauKy, phatSinh: d.phatSinh, thanhToan: d.daTra, cuoiKy: d.conLai }));
      await settle(page);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  } finally { await srv.stop(); }
});
