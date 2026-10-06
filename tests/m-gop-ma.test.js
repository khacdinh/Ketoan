'use strict';
/* M. Gộp mã (NCC, vật tư, hạng mục, nhà / khu, dự án) và tách mã hạng mục — qua API thật trên dữ liệu mẫu có các trường hợp
 * giống dữ liệu Excel đã nhập (mã chỉ khác hoa / thường, cùng mã khác tên, khác ĐVT, hạng mục hai nghĩa, nhà mẫu rác…).
 * Bất biến quan trọng nhất: KHÔNG tổng tiền nào đổi; tổng của mã đích = tổng đích cũ + tổng các mã nguồn, khớp từng đồng. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { KT, startServer, readStored } = require('./helpers');

const key = (s) => KT.keyOf(s);
function prng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/* ---------------- dữ liệu mẫu ---------------- */
function mau(opts) {
  opts = opts || {};
  const rnd = prng(opts.seed || 7);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  let id = 1;
  const db = {
    schema: 3, settings: {}, vouchers: {},
    projects: [
      { id: id++, ma: 'NHACOHANH', ten: 'Nhà cô Hạnh', nganSach: 500000000, trangThai: 'Đang thực hiện', ghiChu: '', ngayKhoiCong: '2026-03-01', diaChi: 'Hòa Xuân, Đà Nẵng' },
      { id: id++, ma: 'NHAMsHANH', ten: 'Nhà Ms Hạnh', nganSach: 0, trangThai: 'Đang thực hiện', ghiChu: '', ngayKhoiCong: '2026-02-15', diaChi: '' },
      { id: id++, ma: 'CT3', ten: 'Công trình 3', nganSach: 200000000, trangThai: 'Đang thực hiện', ghiChu: '', ngayKhoiCong: '', diaChi: 'Huế' },
      { id: id++, ma: 'NCT', ten: 'Nhà mẫu', nganSach: 0, trangThai: 'Đang thực hiện', ghiChu: '', ngayKhoiCong: '', diaChi: '' }
    ],
    suppliers: [
      { id: id++, ma: 'NCC_ThienHai', ten: 'VLXD Thiên Hải', loai: 'Vật tư', sdt: '', diaChi: '', ghiChu: '' },
      { id: id++, ma: 'NCC_THienHAi', ten: 'Thiên Hải', loai: 'Vật liệu xây dựng', sdt: '0905', diaChi: '', ghiChu: '' },
      { id: id++, ma: 'NCC_HoaLan', ten: 'VLXD Hoa Lan', loai: 'Vật tư', sdt: '', diaChi: '', ghiChu: '' },
      { id: id++, ma: 'NCC_Khoi', ten: 'Đội anh Khôi', loai: 'Nhân công', sdt: '', diaChi: '', ghiChu: '' },
      { id: id++, ma: 'NCC_Khoi2', ten: 'Anh Khôi', loai: 'Nhân công', sdt: '', diaChi: 'Đà Nẵng', ghiChu: '' },
      { id: id++, ma: 'NCC_Quân', ten: 'Quân', loai: 'Dịch vụ', sdt: '', diaChi: '', ghiChu: '' },
      { id: id++, ma: 'S_TRONG', ten: 'Chưa dùng', loai: '', sdt: '', diaChi: '', ghiChu: '' }
    ],
    costGroups: [{ id: id++, ma: 'G1', ten: 'Vật liệu', ghiChu: '' }, { id: id++, ma: 'G2', ten: 'Chi phí chung', ghiChu: '' }],
    costItems: [
      { id: id++, ma: 'HM01', ten: 'Vật tư VLXD', maNhom: 'G1', ghiChu: '' },
      { id: id++, ma: 'HM02', ten: 'Vật tư  vlxd', maNhom: 'G1', ghiChu: '' },
      { id: id++, ma: 'HM37', ten: 'Bảo hành', maNhom: 'G2', ghiChu: '' },
      { id: id++, ma: 'HM38', ten: 'Chi phí quản lý (giám sát, VP)', maNhom: 'G2', ghiChu: '' },
      { id: id++, ma: 'HM40', ten: 'Nhân công', maNhom: 'G2', ghiChu: '' }
    ],
    materials: [
      { id: id++, ma: 'VL-XERAC6', ten: 'Xe rác 6 khối', dvt: '', maHM: '', loaiCP: '', ghiChu: '' },
      { id: id++, ma: 'VL-XERAC6B', ten: 'Xe rác 6 khối', dvt: 'XE', maHM: 'HM01', loaiCP: '', ghiChu: '' },
      { id: id++, ma: 'BT-BOMDUN', ten: 'Bê tông bơm đùn', dvt: 'm3', maHM: 'HM01', loaiCP: '', ghiChu: '' },
      { id: id++, ma: 'BT-BOMDUN2', ten: 'BÊ tông bơm/đùn', dvt: 'm3', maHM: '', loaiCP: '', ghiChu: '' },
      { id: id++, ma: 'XX-KHAC', ten: 'Khoản khác', dvt: '', maHM: '', loaiCP: '', ghiChu: '' },
      { id: id++, ma: 'CAT', ten: 'Cát xây', dvt: 'm3', maHM: 'HM02', loaiCP: '', ghiChu: '' }
    ],
    houses: [
      { id: id++, ma: 'NĐC7lo', ten: 'Lô 7', maCT: 'NHACOHANH', dienTich: 120, chuNha: '', chung: false, ghiChu: '' },
      { id: id++, ma: 'NĐC34', ten: 'Lô 3-4', maCT: 'NHACOHANH', dienTich: '', chuNha: '', chung: false, ghiChu: '' },
      { id: id++, ma: 'CHUNG1', ten: 'Dùng chung', maCT: 'NHACOHANH', dienTich: '', chuNha: '', chung: true, ghiChu: '' },
      { id: id++, ma: 'NĐC910', ten: 'Lô 9-10', maCT: 'NHAMsHANH', dienTich: 90, chuNha: '', chung: false, ghiChu: '' },
      { id: id++, ma: 'CHUNG2', ten: 'Dùng chung', maCT: 'NHAMsHANH', dienTich: '', chuNha: '', chung: true, ghiChu: '' },
      { id: id++, ma: 'NĐC5', ten: 'Lô 5', maCT: 'CT3', dienTich: '', chuNha: '', chung: false, ghiChu: '' }
    ].concat(['N1', 'N2', 'N3', 'N4', 'N5', 'NAM'].map((m) => ({ id: 0, ma: m, ten: 'Nhà mẫu ' + m, maCT: 'NCT', dienTich: '', chuNha: '', chung: false, ghiChu: '' }))),
    costs: [], entries: [], trash: [], locks: [], attachments: [], cashCounts: [],
    ignoredWarnings: {
      'thieu:c:999:hm38|ncc_thienhai|nhamshanh': { at: '2026-09-01T00:00:00Z', by: '', label: 'mẫu', note: '' },
      'vt:c:998:vl-xerac6b': { at: '2026-09-01T00:00:00Z', by: '', label: 'mẫu', note: '' }
    }
  };
  db.houses.forEach((x) => { if (!x.id) x.id = id++; });
  const housesOf = (ct) => db.houses.filter((x) => x.maCT === ct).map((x) => x.ma);
  const nccs = ['NCC_ThienHai', 'NCC_THienHAi', 'NCC_HoaLan', 'NCC_Khoi', 'NCC_Khoi2', 'NCC_Quân'];
  const vts = ['VL-XERAC6', 'VL-XERAC6B', 'BT-BOMDUN', 'BT-BOMDUN2', 'XX-KHAC', 'CAT', ''];
  const hms = ['HM01', 'HM02', 'HM37', 'HM38', 'HM40'];
  const cts = ['NHACOHANH', 'NHAMsHANH', 'CT3'];
  for (let i = 0; i < (opts.costs || 400); i++) {
    const ct = pick(cts);
    const sl = Math.round(rnd() * 100) / 10 + 0.5;
    const dg = Math.floor(rnd() * 900 + 100) * 1000;
    db.costs.push({ id: id++, seq: i + 1, phieuId: 100000 + Math.floor(i / 3), ngay: '2026-0' + (1 + Math.floor(rnd() * 8)) + '-' + String(1 + Math.floor(rnd() * 27)).padStart(2, '0'),
      maCT: ct, maNha: pick(housesOf(ct).concat([''])), maHM: pick(hms), loaiCP: pick(KT.LOAI_CP), maVT: pick(vts), dienGiai: 'dòng ' + i,
      soLuong: sl, donGia: dg, thanhTien: KT.costAmount(sl, dg), maNCC: pick(nccs), soPhieu: '', ghiChu: '', nguon: 'mau', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' });
  }
  for (let i = 0; i < (opts.entries || 200); i++) {
    const thu = rnd() < 0.2;
    db.entries.push({ id: id++, seq: i + 1, ngay: '2026-0' + (1 + Math.floor(rnd() * 8)) + '-15', soPhieu: '', maDuAn: pick(cts.concat(['', 'NCT'])), maNCC: pick(nccs.concat([''])),
      noiDung: 'thu chi ' + i, thu: thu ? Math.floor(rnd() * 5e6) : 0, chi: thu ? 0 : Math.floor(rnd() * 3e7), nguoiNhan: '', ghiChu: '', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' });
  }
  // trả NCC từ nguồn khác (ngoài quỹ): cũng tham chiếu mã NCC / dự án
  db.extPayments = [
    { id: id++, ngay: '2026-04-10', maNCC: 'NCC_THienHAi', maDuAn: 'NHAMsHANH', soTien: 15000000, nguon: 'Chuyển khoản công ty', ghiChu: 'UNC 01', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', by: '' },
    { id: id++, ngay: '2026-05-11', maNCC: 'NCC_Khoi2', maDuAn: '', soTien: 7000000, nguon: 'Chủ nhà trả trực tiếp', ghiChu: '', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', by: '' },
    { id: id++, ngay: '2026-06-12', maNCC: 'NCC_HoaLan', maDuAn: 'CT3', soTien: 2500000, nguon: 'Giám đốc trả', ghiChu: 'đợt 1', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', by: '' }
  ];
  // thùng rác: bản ghi đã xóa mềm cũng dùng các mã sẽ bị gộp
  db.trash.push({ id: id++, at: '2026-09-02T00:00:00Z', by: '', kind: 'entries', label: 'dòng sổ đã xóa', records: [
    { id: id++, seq: 9001, ngay: '2026-05-05', soPhieu: '', maDuAn: 'NHAMsHANH', maNCC: 'NCC_THienHAi', noiDung: 'đã xóa', thu: 0, chi: 1234567, nguoiNhan: '', ghiChu: '' }] });
  db.trash.push({ id: id++, at: '2026-09-02T00:00:00Z', by: '', kind: 'costs', label: 'dòng chi phí đã xóa', records: [
    { id: id++, seq: 9002, phieuId: 0, ngay: '2026-05-06', maCT: 'NHAMsHANH', maNha: 'NĐC910', maHM: 'HM38', loaiCP: 'Vật tư', maVT: 'VL-XERAC6B', dienGiai: 'đã xóa', soLuong: 1, donGia: 777000, thanhTien: 777000, maNCC: 'NCC_Khoi2', soPhieu: '', ghiChu: '', nguon: 'mau' }] });
  db.nextId = id + 10;
  return db;
}

/* ---------------- số liệu độc lập (không dùng hàm tổng hợp của shared.js) ---------------- */
function soLieu(db) {
  const posted = { costs: db.costs.filter((c) => !KT.isDraft(c)), entries: db.entries.filter((e) => !KT.isDraft(e)) };
  const o = { tongChiPhi: 0, thu: 0, chi: 0, traNgoai: 0, hm: {}, nha: {}, loai: {}, ct: {}, vt: {}, vtSL: {}, nccCP: {}, nccTra: {}, nccNgoai: {}, duAnThu: {}, duAnChi: {}, duAnNgoai: {} };
  const add = (m, k, v) => { m[k] = (m[k] || 0) + v; };
  posted.costs.forEach((c) => {
    o.tongChiPhi += c.thanhTien;
    add(o.hm, c.maHM, c.thanhTien); add(o.nha, c.maCT + '|' + c.maNha, c.thanhTien); add(o.loai, c.loaiCP, c.thanhTien); add(o.ct, c.maCT, c.thanhTien);
    if (c.maVT) { add(o.vt, c.maVT, c.thanhTien); o.vtSL[c.maVT] = Math.round(((o.vtSL[c.maVT] || 0) + c.soLuong) * 10000) / 10000; }
    if (c.maNCC) add(o.nccCP, c.maNCC, c.thanhTien);
  });
  posted.entries.forEach((e) => {
    o.thu += e.thu || 0; o.chi += e.chi || 0;
    if (e.maNCC) add(o.nccTra, e.maNCC, (e.chi || 0) - (e.thu || 0));
    if (e.maDuAn) { add(o.duAnThu, e.maDuAn, e.thu || 0); add(o.duAnChi, e.maDuAn, e.chi || 0); }
  });
  (db.extPayments || []).forEach((p) => {
    o.traNgoai += p.soTien;
    add(o.nccNgoai, p.maNCC, p.soTien);
    if (p.maDuAn) add(o.duAnNgoai, p.maDuAn, p.soTien);
  });
  o.tonQuy = o.thu - o.chi;
  return o;
}
const sumKeys = (m, ks) => ks.reduce((t, k) => t + (m[k] || 0), 0);
// Kiểm tra bất biến: toàn cục không đổi; ở chiều theo mã (dim), mã đích sau = đích trước + các nguồn trước; nguồn sau = 0; mã khác không đổi
function checkInvariant(before, after, dims, nguon, dich) {
  ['tongChiPhi', 'thu', 'chi', 'tonQuy', 'traNgoai'].forEach((k) => assert.equal(after[k], before[k], 'tổng toàn cục ' + k + ' không đổi'));
  ['hm', 'nha', 'loai', 'ct', 'vt', 'nccCP', 'nccTra', 'nccNgoai', 'duAnThu', 'duAnChi', 'duAnNgoai'].forEach((d) => {
    const total = (m) => Object.values(m).reduce((t, v) => t + v, 0);
    assert.equal(total(after[d]), total(before[d]), 'tổng theo ' + d + ' không đổi');
  });
  dims.forEach(([d, mapKey]) => {
    const keys = Object.keys(before[d]);
    const srcKeys = keys.filter((k) => nguon.some((n) => mapKey(k, n)));
    const dstKeys = keys.filter((k) => mapKey(k, dich, true));
    const r4 = (x) => Math.round(x * 10000) / 10000; // số lượng có số lẻ: so tới 4 chữ số (tiền là số nguyên nên không ảnh hưởng)
    const want = r4(sumKeys(before[d], srcKeys) + sumKeys(before[d], dstKeys));
    const got = r4(sumKeys(after[d], Object.keys(after[d]).filter((k) => mapKey(k, dich, true))));
    assert.equal(got, want, d + ': tổng mã đích = đích cũ + các nguồn (' + got + ' vs ' + want + ')');
    Object.keys(after[d]).filter((k) => nguon.some((n) => mapKey(k, n))).forEach((k) => assert.equal(after[d][k] || 0, 0, d + ': mã nguồn ' + k + ' không còn tiền'));
    keys.filter((k) => !srcKeys.includes(k) && !dstKeys.includes(k)).forEach((k) => assert.equal(after[d][k], before[d][k], d + ': mã khác ' + k + ' không đổi'));
  });
}
const exactKey = (k, code) => k === code;

// Quét toàn bộ lược đồ: không còn tham chiếu tới mã nguồn (trừ bảng bí danh, lịch sử gộp và chính bản ghi danh mục "Đã gộp")
const REFS = { ncc: [['entries', 'maNCC'], ['costs', 'maNCC'], ['extPayments', 'maNCC']], vt: [['costs', 'maVT']], hm: [['costs', 'maHM'], ['materials', 'maHM']], nha: [['costs', 'maNha']],
  da: [['entries', 'maDuAn'], ['costs', 'maCT'], ['houses', 'maCT'], ['extPayments', 'maDuAn']] };
function noOrphans(db, loai, nguon, dich) {
  nguon.forEach((src) => {
    const same = key(src) === key(dich);
    const hit = (v) => v && key(v) === key(src) && (!same || v !== dich);
    REFS[loai].forEach(([list, field]) => {
      db[list].forEach((r) => assert.ok(!hit(r[field]), list + '.' + field + ' id ' + r.id + ' còn mã nguồn ' + src));
      db.trash.filter((t) => t.kind === list).forEach((t) => t.records.forEach((r) => assert.ok(!hit(r[field]), 'thùng rác ' + list + '.' + field + ' còn mã nguồn ' + src)));
    });
    if (!same) Object.keys(db.ignoredWarnings).filter((k) => /^(vt|thieu):/.test(k)).forEach((k) => assert.ok(!k.split(/[:|]/).includes(key(src)), 'cảnh báo đã bỏ qua còn mã nguồn: ' + k));
  });
}
// So hai trạng thái dữ liệu (đã lưu trên đĩa) bỏ qua lịch sử gộp, bí danh, thời điểm lưu
function sameData(a, b, msg) {
  const strip = (d) => { const x = Object.assign({}, d); ['mergeLog', 'aliases', 'updatedAt', 'nextId'].forEach((k) => delete x[k]); return JSON.parse(JSON.stringify(x)); };
  const A = strip(a); const B = strip(b);
  Object.keys(A).forEach((k) => assert.deepEqual(B[k], A[k], (msg || '') + ' bảng ' + k));
  assert.deepEqual(Object.keys(B).sort(), Object.keys(A).sort());
}

async function merge(srv, body) { return srv.call('POST', '/api/merge', body); }
async function preview(srv, body) { return srv.call('POST', '/api/merge/preview', body); }

/* ============================== NCC ============================== */

test('M1 gộp NCC: xem trước đúng số bản ghi / tiền; gộp nhiều nguồn (kể cả mã chỉ khác hoa / thường) → bất biến tiền, công nợ đích = cộng dồn, không mồ côi, mã nguồn "Đã gộp", bí danh', async () => {
  const srv = await startServer({ seed: mau() });
  try {
    const before = readStored(srv.dataDir);
    const b0 = soLieu(before);
    const debt0 = KT.supplierDebt(before, {});
    const nguon = ['NCC_THienHAi', 'NCC_Khoi2'];
    // NCC_Khoi2 → NCC_ThienHai chỉ để thử nhiều nguồn khác loại: phải cảnh báo loại khác
    let r = await preview(srv, { loai: 'ncc', nguon, dich: 'NCC_ThienHai' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const pv = r.json.preview;
    const cnt = (list, field, code) => before[list].filter((x) => x[field] === code).length + before.trash.filter((t) => t.kind === list).reduce((n, t) => n + t.records.filter((x) => x[field] === code).length, 0);
    assert.equal(pv.nguon[0].counts.entries, cnt('entries', 'maNCC', 'NCC_THienHAi'));
    assert.equal(pv.nguon[0].counts.costs, cnt('costs', 'maNCC', 'NCC_THienHAi'));
    assert.equal(pv.nguon[1].counts.costs, cnt('costs', 'maNCC', 'NCC_Khoi2'));
    assert.equal(pv.nguon[0].tien.chiPhi, before.costs.filter((c) => c.maNCC === 'NCC_THienHAi').reduce((t, c) => t + c.thanhTien, 0));
    assert.equal(pv.nguon[0].trash, 1, 'đếm cả bản ghi trong thùng rác');
    assert.ok(pv.canhBao.some((x) => /Loại NCC khác nhau/.test(x)), 'cảnh báo khác loại');
    assert.ok(pv.thuocTinh.find((a) => a.f === 'ten').khac);
    // chưa gộp gì
    assert.deepEqual(readStored(srv.dataDir).suppliers, before.suppliers);
    // gộp, giữ địa chỉ của NCC_Khoi2 (đích trống)
    r = await merge(srv, { loai: 'ncc', nguon, dich: 'NCC_ThienHai', phienBan: pv.phienBan });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const g = r.json.merge;
    assert.equal(g.soBanGhi, pv.tong.soBanGhi);
    assert.match(r.json.backup, /truoc-gop-ma/);
    const after = readStored(srv.dataDir);
    const a0 = soLieu(after);
    checkInvariant(b0, a0, [['nccCP', exactKey], ['nccTra', exactKey], ['nccNgoai', exactKey]], nguon, 'NCC_ThienHai');
    assert.equal(after.extPayments.filter((p) => p.maNCC === 'NCC_ThienHai').length, 2, 'khoản trả ngoài quỹ của 2 mã nguồn chuyển sang đích');
    assert.equal(pv.nguon[0].tien.traNgoai, 15000000);
    // công nợ: đích sau = đích trước + nguồn
    const debt1 = KT.supplierDebt(after, {});
    const dOf = (D, ma) => D.rows.find((x) => x.ma === ma) || { phatSinh: 0, daTra: 0, conLai: 0 };
    ['phatSinh', 'daTra', 'conLai'].forEach((k) => assert.equal(dOf(debt1, 'NCC_ThienHai')[k], dOf(debt0, 'NCC_ThienHai')[k] + nguon.reduce((t, m) => t + dOf(debt0, m)[k], 0), 'công nợ ' + k));
    assert.equal(debt1.totalAll.conLai, debt0.totalAll.conLai, 'tổng công nợ không đổi');
    noOrphans(after, 'ncc', nguon, 'NCC_ThienHai');
    // mã nguồn còn trong danh mục với trạng thái Đã gộp; thuộc tính đích theo mặc định (địa chỉ trống → lấy của nguồn có giá trị)
    nguon.forEach((m) => assert.equal(after.suppliers.find((x) => x.ma === m).gopVao, 'NCC_ThienHai'));
    const d = after.suppliers.find((x) => x.ma === 'NCC_ThienHai');
    assert.equal(d.ten, 'VLXD Thiên Hải'); assert.equal(d.diaChi, 'Đà Nẵng'); assert.equal(d.sdt, '0905');
    assert.deepEqual(after.aliases.map((a) => [a.loai, a.ma, a.dich]).sort(), [['ncc', 'NCC_Khoi2', 'NCC_ThienHai'], ['ncc', 'NCC_THienHAi', 'NCC_ThienHai']]);
    assert.ok(after.ignoredWarnings['thieu:c:999:hm38|ncc_thienhai|nhamshanh'], 'khóa cảnh báo giữ nguyên khi nguồn và đích cùng khóa');
    // giao diện / file xuất không còn mã đã gộp
    const pub = await srv.db();
    assert.ok(!KT.activeDb(pub).suppliers.some((x) => nguon.includes(x.ma)));
    assert.ok(!pub.mergeLog, 'lịch sử gộp không gửi kèm mỗi lần trả lời');
    // nhập tay bằng mã cũ → tự về mã đích; tạo mới bằng mã đã gộp → bị chặn; sửa / xóa mã đã gộp → bị chặn
    r = await srv.ok('POST', '/api/entries', { ngay: '2026-09-20', maNCC: 'ncc_khoi2', chi: 1000, noiDung: 'nhập mã cũ' });
    assert.equal(r.db.entries.find((e) => e.noiDung === 'nhập mã cũ').maNCC, 'NCC_ThienHai');
    r = await srv.ok('POST', '/api/cost-slips', { header: { ngay: '2026-09-20', maCT: 'CT3', maNCC: 'NCC_THienHAi', maHM: 'HM01' }, lines: [{ dienGiai: 'x', soLuong: 1, donGia: 1000 }] });
    assert.equal(r.db.costs.find((c) => c.dienGiai === 'x' && c.ngay === '2026-09-20').maNCC, 'NCC_ThienHai');
    r = await srv.call('POST', '/api/suppliers', { ma: 'NCC_Khoi2', ten: 'tạo lại' });
    assert.equal(r.status, 400); assert.match(r.json.error, /đã được gộp vào|đã tồn tại/);
    const merged = after.suppliers.find((x) => x.ma === 'NCC_Khoi2');
    r = await srv.call('PUT', '/api/suppliers/' + merged.id, { ma: 'NCC_Khoi2', ten: 'sửa' });
    assert.equal(r.status, 400); assert.match(r.json.error, /đã được gộp vào/);
    r = await srv.call('DELETE', '/api/suppliers/' + merged.id);
    assert.equal(r.status, 400);
    // nhật ký thay đổi có dòng gộp mã
    const audit = (await srv.ok('GET', '/api/audit?limit=20')).items;
    assert.ok(audit.some((e) => e.action === 'gop-ma'));
  } finally { await srv.stop(); }
});

test('M2 hoàn tác gộp NCC: trả dữ liệu giống hệt ban đầu (từng bảng); gộp chuỗi A→B rồi B→C: hoàn tác sai thứ tự bị từ chối, đúng thứ tự thì về nguyên trạng; bí danh chuỗi đưa A về C', async () => {
  const srv = await startServer({ seed: mau({ seed: 3 }) });
  try {
    const start = readStored(srv.dataDir);
    let r = await merge(srv, { loai: 'ncc', nguon: ['NCC_THienHAi'], dich: 'NCC_ThienHai' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const g1 = r.json.merge.id;
    r = await srv.call('POST', '/api/merge/' + g1 + '/undo');
    assert.equal(r.status, 200, JSON.stringify(r.json));
    sameData(start, readStored(srv.dataDir), 'sau hoàn tác 1 lần:');
    assert.equal(readStored(srv.dataDir).aliases.length, 0, 'hoàn tác xóa bí danh của lần gộp đó');
    // hoàn tác lần nữa: từ chối
    r = await srv.call('POST', '/api/merge/' + g1 + '/undo');
    assert.equal(r.status, 409);
    // chuỗi A→B, B→C
    r = await merge(srv, { loai: 'ncc', nguon: ['NCC_Khoi2'], dich: 'NCC_Khoi' });
    const gA = r.json.merge.id;
    const mid = readStored(srv.dataDir);
    r = await merge(srv, { loai: 'ncc', nguon: ['NCC_Khoi'], dich: 'NCC_Quân' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const gB = r.json.merge.id;
    // A (đã gộp) không làm đích được; vòng B→A cũng không được
    r = await merge(srv, { loai: 'ncc', nguon: ['NCC_Quân'], dich: 'NCC_Khoi2' });
    assert.equal(r.status, 400); assert.match(r.json.error, /Đã gộp vào/);
    // nhập tay mã A → về C (chuỗi bí danh)
    r = await srv.ok('POST', '/api/entries', { ngay: '2026-09-21', maNCC: 'NCC_Khoi2', chi: 5, noiDung: 'chuỗi' });
    assert.equal(r.db.entries.find((e) => e.noiDung === 'chuỗi').maNCC, 'NCC_Quân');
    const log = (await srv.ok('GET', '/api/merge/log')).items;
    assert.equal(log.find((x) => x.id === gA).coTheHoanTac, false, 'lần cũ không hoàn tác được khi mã đích đã bị gộp tiếp');
    r = await srv.call('POST', '/api/merge/' + gA + '/undo');
    assert.equal(r.status, 409); assert.match(r.json.error, /hoàn tác lần gần nhất trước/);
    // xóa dòng vừa nhập để hoàn tác sạch
    const added = (await srv.db()).entries.find((e) => e.noiDung === 'chuỗi');
    await srv.ok('DELETE', '/api/entries/' + added.id);
    r = await srv.call('POST', '/api/merge/' + gB + '/undo');
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const afterB = readStored(srv.dataDir);
    sameData(Object.assign({}, mid, { trash: afterB.trash }), afterB, 'sau hoàn tác B→C:');
    r = await srv.call('POST', '/api/merge/' + gA + '/undo');
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const end = readStored(srv.dataDir);
    sameData(Object.assign({}, start, { trash: end.trash }), end, 'sau hoàn tác cả chuỗi:');
    assert.deepEqual(end.trash.filter((t) => start.trash.some((s) => s.id === t.id)), start.trash);
  } finally { await srv.stop(); }
});

test('M3 hoàn tác bị từ chối khi bản ghi đã bị sửa sau khi gộp (dòng đổi NCC, thông tin mã đích đổi); không làm dở', async () => {
  const srv = await startServer({ seed: mau({ seed: 5 }) });
  try {
    let r = await merge(srv, { loai: 'ncc', nguon: ['NCC_THienHAi'], dich: 'NCC_ThienHai' });
    const gid = r.json.merge.id;
    let db = await srv.db();
    const moved = db.entries.find((e) => e.maNCC === 'NCC_ThienHai');
    await srv.ok('PUT', '/api/entries/' + moved.id, Object.assign({}, moved, { maNCC: 'NCC_HoaLan' }));
    const snap = readStored(srv.dataDir);
    r = await srv.call('POST', '/api/merge/' + gid + '/undo');
    assert.equal(r.status, 409); assert.match(r.json.error, /đã bị sửa/);
    sameData(snap, readStored(srv.dataDir), 'từ chối thì không đổi gì:');
    // trả dòng đó về như sau khi gộp → hoàn tác được; nhưng sửa tên mã đích → lại bị từ chối
    await srv.ok('PUT', '/api/entries/' + moved.id, Object.assign({}, moved, { maNCC: 'NCC_ThienHai' }));
    db = await srv.db();
    const d = db.suppliers.find((x) => x.ma === 'NCC_ThienHai');
    await srv.ok('PUT', '/api/suppliers/' + d.id, Object.assign({}, d, { ten: 'Tên mới' }));
    r = await srv.call('POST', '/api/merge/' + gid + '/undo');
    assert.equal(r.status, 409); assert.match(r.json.error, /thông tin của mã đích/);
    await srv.ok('PUT', '/api/suppliers/' + d.id, Object.assign({}, d));
    r = await srv.call('POST', '/api/merge/' + gid + '/undo');
    assert.equal(r.status, 200, JSON.stringify(r.json));
  } finally { await srv.stop(); }
});

test('M4 trường hợp biên khi gộp: vào chính nó, đích đã gộp, nguồn đã gộp, mã không tồn tại, mã nguồn không có bản ghi nào, NFC / khoảng trắng thừa, tháng đã khóa sổ, dữ liệu đổi giữa xem trước và gộp', async () => {
  const srv = await startServer({ seed: mau({ seed: 9 }) });
  try {
    const bad = async (body, status, re) => { const r = await merge(srv, body); assert.equal(r.status, status, JSON.stringify(body) + ' ' + JSON.stringify(r.json)); if (re) assert.match(r.json.error, re); };
    await bad({ loai: 'ncc', nguon: ['NCC_HoaLan'], dich: 'NCC_HoaLan' }, 400, /chính nó/);
    await bad({ loai: 'ncc', nguon: ['ncc_hoalan'], dich: 'NCC_HoaLan' }, 400, /chính nó/);
    await bad({ loai: 'ncc', nguon: ['KHONG_CO'], dich: 'NCC_HoaLan' }, 400, /không có trong danh mục và không có dòng nào/);
    await bad({ loai: 'ncc', nguon: ['NCC_Quân'], dich: 'KHONG_CO' }, 400, /chưa có trong danh mục/);
    await bad({ loai: 'xyz', nguon: ['a'], dich: 'b' }, 400, /Loại mã/);
    await bad({ loai: 'ncc', nguon: [], dich: 'NCC_HoaLan' }, 400, /ít nhất một/);
    await bad({ loai: 'ncc', nguon: 'NCC_Quân', dich: 'NCC_HoaLan' }, 400);
    await bad({ loai: 'ncc', nguon: [{ x: 1 }], dich: 'NCC_HoaLan' }, 400);
    await bad({ loai: 'ncc', nguon: ['NCC_Quân'], dich: 'NCC_HoaLan', phienBan: '2000-01-01T00:00:00Z' }, 409, /xem trước lại/);
    // mã nguồn chỉ có trong danh mục, không dòng nào dùng: gộp được (0 bản ghi), mã có dấu gõ dạng tổ hợp (NFD) + khoảng trắng thừa
    let r = await merge(srv, { loai: 'ncc', nguon: ['  S_TRONG '], dich: ' NCC_Quân'.normalize('NFD') + '  ' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.merge.soBanGhi, 0); assert.equal(r.json.merge.dich, 'NCC_Quân');
    await bad({ loai: 'ncc', nguon: ['S_TRONG'], dich: 'NCC_HoaLan' }, 400, /đã gộp vào/);
    await bad({ loai: 'ncc', nguon: ['NCC_HoaLan'], dich: 'S_TRONG' }, 400, /Đã gộp vào/);
    // khóa sổ: có dòng thuộc tháng đã khóa → chặn, báo bản ghi nào
    const db = await srv.db();
    const e = db.entries.find((x) => x.maNCC === 'NCC_HoaLan');
    await srv.ok('POST', '/api/locks', { months: [e.ngay.slice(0, 7)] });
    r = await merge(srv, { loai: 'ncc', nguon: ['NCC_HoaLan'], dich: 'NCC_Quân' });
    assert.equal(r.status, 423); assert.match(r.json.error, /tháng đã khóa sổ/);
    const pv = (await preview(srv, { loai: 'ncc', nguon: ['NCC_HoaLan'], dich: 'NCC_Quân' })).json.preview;
    assert.ok(pv.soKhoa > 0 && pv.khoa.some((x) => x.id === e.id), 'xem trước liệt kê bản ghi bị khóa');
  } finally { await srv.stop(); }
});

test('M5 thùng rác: dòng đã xóa mềm cũng đổi mã; khôi phục sau gộp không mồ côi; lịch sử gộp liệt kê và cho hoàn tác', async () => {
  const srv = await startServer({ seed: mau({ seed: 4 }) });
  try {
    let r = await merge(srv, { loai: 'ncc', nguon: ['NCC_THienHAi'], dich: 'NCC_ThienHai' });
    assert.equal(r.status, 200);
    const t = (await srv.ok('GET', '/api/trash')).items.find((x) => x.kind === 'entries');
    r = await srv.ok('POST', '/api/trash/' + t.id + '/restore');
    const back = r.db.entries.find((x) => x.noiDung === 'đã xóa');
    assert.equal(back.maNCC, 'NCC_ThienHai');
    const log = (await srv.ok('GET', '/api/merge/log')).items;
    assert.equal(log.length, 1); assert.equal(log[0].trangThai, 'hieu-luc'); assert.match(log[0].nhan, /NCC_THienHAi → NCC_ThienHai/);
  } finally { await srv.stop(); }
});

test('M6 bí danh khi nhập Excel (sổ thu chi và chi phí công trình): mã cũ (khác hoa / thường) tự về mã đích, hiện ở bước xem trước kèm tên file + dòng gốc, không tạo lại mã nguồn', async () => {
  const X = require('./excel-helpers');
  const srv = await startServer({ seed: mau({ seed: 12, costs: 40, entries: 20 }) });
  try {
    let r = await merge(srv, { loai: 'ncc', nguon: ['NCC_THienHAi', 'NCC_Khoi2'], dich: 'NCC_ThienHai' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    // file sổ thu chi
    const wb = new X.ExcelJS.Workbook();
    const dm = wb.addWorksheet('Danh_Muc_NCC');
    dm.addRow(['Mã NCC', 'Tên nhà cung cấp', 'Loại']);
    dm.addRow(['NCC_THienHAi', 'Thiên Hải (file cũ)', '']); dm.addRow(['NCC_MOI', 'NCC mới', '']);
    const so = wb.addWorksheet('So_Thu_Chi_Hang_Ngay');
    so.addRow(['Ngày', 'Số phiếu', 'Mã Dự Án', 'Mã NCC', 'Nội dung', 'Tiền thu', 'Tiền chi', 'Người nhận', 'Ghi chú']);
    so.addRow([new Date('2026-09-25T00:00:00Z'), 'PC1', '', 'ncc_khoi2', 'trả theo mã cũ chữ thường', 0, 111000, '', '']);
    so.addRow([new Date('2026-09-26T00:00:00Z'), 'PC2', '', 'NCC_THienHAi', 'trả theo mã cũ', 0, 222000, '', '']);
    so.addRow([new Date('2026-09-27T00:00:00Z'), 'PC3', '', 'NCC_MOI', 'NCC mới', 0, 333000, '', '']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    r = await srv.call('POST', '/api/import?dryRun=1&ten=' + encodeURIComponent('SoThuChi_cu.xlsx'), buf);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const bd = r.json.preview.biDanh;
    assert.ok(bd.some((x) => x.file === 'SoThuChi_cu.xlsx' && x.sheet === 'So_Thu_Chi_Hang_Ngay' && x.dong === 2 && x.cu === 'ncc_khoi2' && x.moi === 'NCC_ThienHai'), JSON.stringify(bd));
    assert.ok(bd.some((x) => x.dong === 3 && x.cu === 'NCC_THienHAi' && x.moi === 'NCC_ThienHai'));
    assert.ok(bd.some((x) => x.boDong && x.cu === 'NCC_THienHAi' && x.sheet === 'Danh_Muc_NCC'), 'dòng danh mục mã cũ bị bỏ');
    assert.ok(r.json.preview.warnings.some((w) => /Bí danh: SoThuChi_cu\.xlsx · So_Thu_Chi_Hang_Ngay dòng 2/.test(w)));
    r = await srv.call('POST', '/api/import?mode=merge&ten=' + encodeURIComponent('SoThuChi_cu.xlsx'), buf);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.biDanh.length, bd.length);
    const db = readStored(srv.dataDir);
    ['trả theo mã cũ chữ thường', 'trả theo mã cũ'].forEach((nd) => assert.equal(db.entries.find((e) => e.noiDung === nd).maNCC, 'NCC_ThienHai'));
    assert.equal(db.suppliers.filter((s) => !s.gopVao && ['ncc_thienhai', 'ncc_khoi2'].includes(key(s.ma)) && s.ma !== 'NCC_ThienHai').length, 0, 'không tạo lại mã nguồn');
    assert.ok(db.suppliers.some((s) => s.ma === 'NCC_MOI'));
    noOrphans(db, 'ncc', ['NCC_THienHAi', 'NCC_Khoi2'], 'NCC_ThienHai');
    // file chi phí công trình: NHATKYCHUNG dùng mã cũ
    const wc = new X.ExcelJS.Workbook();
    const hm = wc.addWorksheet('DM_HANGMUC'); hm.addRow(['Mã HM', 'Nhóm CP', 'Hạng mục', 'Mã nhóm']); hm.addRow(['HM01', 'Vật liệu', 'Vật tư VLXD', 'G1']);
    const nk = wc.addWorksheet('NHATKYCHUNG');
    nk.addRow(['Ngày', 'Mã CT', 'Mã Nhà', 'Hạng mục', 'Nhóm CP', 'Loại CP', 'Mã VT', 'Tên vật tư', 'ĐVT', 'Diễn giải / Quy cách', 'Số lượng', 'Đơn giá', 'Thành tiền', 'Mã NCC']);
    nk.addRow([new Date('2026-09-28T00:00:00Z'), 'CT3', '', 'Vật tư VLXD', '', 'Vật tư', 'CAT', '', '', 'cát theo mã NCC cũ', 2, 300000, 600000, 'NCC_khoi2']);
    const bc = Buffer.from(await wc.xlsx.writeBuffer());
    r = await srv.call('POST', '/api/import?dryRun=1&ten=ChiPhi.xlsx', bc);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(r.json.preview.biDanh.some((x) => x.sheet === 'NHATKYCHUNG' && x.dong === 2 && x.cu === 'NCC_khoi2' && x.moi === 'NCC_ThienHai'), JSON.stringify(r.json.preview.biDanh));
    r = await srv.call('POST', '/api/import?mode=merge&ten=ChiPhi.xlsx&map=' + encodeURIComponent(JSON.stringify({ CT3: 'CT3' })), bc);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(readStored(srv.dataDir).costs.find((c) => c.dienGiai === 'cát theo mã NCC cũ').maNCC, 'NCC_ThienHai');
  } finally { await srv.stop(); }
});

test('M7 hiệu năng: 20.000 dòng chi phí + 3.000 dòng thu chi — xem trước + gộp NCC dưới 3 giây; hoàn tác cũng vậy', { timeout: 240000 }, async () => {
  const srv = await startServer({ seed: mau({ seed: 21, costs: 20000, entries: 3000 }) });
  try {
    const t = async (fn) => { const t0 = Date.now(); const r = await fn(); return [r, Date.now() - t0]; };
    const [pv, msPv] = await t(() => preview(srv, { loai: 'ncc', nguon: ['NCC_THienHAi', 'NCC_Khoi2'], dich: 'NCC_ThienHai' }));
    assert.equal(pv.status, 200);
    const [r, msGop] = await t(() => merge(srv, { loai: 'ncc', nguon: ['NCC_THienHAi', 'NCC_Khoi2'], dich: 'NCC_ThienHai', phienBan: pv.json.preview.phienBan }));
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const [u, msUndo] = await t(() => srv.call('POST', '/api/merge/' + r.json.merge.id + '/undo'));
    assert.equal(u.status, 200, JSON.stringify(u.json));
    const [pv2, msPv2] = await t(() => preview(srv, { loai: 'vt', nguon: ['BT-BOMDUN2'], dich: 'BT-BOMDUN' }));
    const [r2, msGop2] = await t(() => merge(srv, { loai: 'vt', nguon: ['BT-BOMDUN2'], dich: 'BT-BOMDUN' }));
    assert.equal(r2.status, 200, JSON.stringify(r2.json));
    console.log('# Hiệu năng gộp mã (20.000 dòng chi phí): xem trước NCC ' + msPv + ' ms, gộp NCC ' + msGop + ' ms (' + r.json.merge.soBanGhi + ' bản ghi), hoàn tác ' + msUndo +
      ' ms; xem trước vật tư ' + msPv2 + ' ms, gộp vật tư ' + msGop2 + ' ms (' + r2.json.merge.soBanGhi + ' bản ghi)');
    assert.ok(msPv + msGop < 3000, 'xem trước + gộp NCC < 3 giây (' + (msPv + msGop) + ' ms)');
    assert.ok(msUndo < 3000, 'hoàn tác < 3 giây');
    assert.ok(msPv2 + msGop2 < 3000, 'xem trước + gộp vật tư < 3 giây');
    void pv2;
  } finally { await srv.stop(); }
});

/* ============================== VẬT TƯ ============================== */

test('M8 gộp vật tư: khác ĐVT bị chặn (chỉ gộp khi xác nhận, ghi lại xác nhận); mã khoản XX-… / CHUNG với vật tư thường bị chặn; bất biến tiền + số lượng; số lần mua, tổng đã mua, lịch sử giá của mã đích tính lại đúng; hạng mục hay dùng; hoàn tác', async () => {
  const srv = await startServer({ seed: mau({ seed: 31 }) });
  try {
    const start = readStored(srv.dataDir);
    // 1. khác ĐVT ("" và "XE")
    let r = await preview(srv, { loai: 'vt', nguon: ['VL-XERAC6B'], dich: 'VL-XERAC6' });
    assert.equal(r.status, 200);
    assert.ok(r.json.preview.chan.some((c) => c.can === 'dvt'), 'cảnh báo chặn khác ĐVT');
    r = await merge(srv, { loai: 'vt', nguon: ['VL-XERAC6B'], dich: 'VL-XERAC6' });
    assert.equal(r.status, 400); assert.match(r.json.error, /ĐVT khác nhau/);
    const b0 = soLieu(readStored(srv.dataDir));
    const st0 = KT.materialStats(readStored(srv.dataDir));
    r = await merge(srv, { loai: 'vt', nguon: ['VL-XERAC6B'], dich: 'VL-XERAC6', xacNhan: { dvt: true } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(r.json.merge.xacNhan.some((x) => /ĐVT khác nhau/.test(x)), 'lịch sử ghi lại việc xác nhận khác ĐVT');
    let db = readStored(srv.dataDir);
    const a0 = soLieu(db);
    checkInvariant(b0, a0, [['vt', exactKey], ['vtSL', exactKey]], ['VL-XERAC6B'], 'VL-XERAC6');
    noOrphans(db, 'vt', ['VL-XERAC6B'], 'VL-XERAC6');
    // thống kê mua của mã đích = cộng dồn; hạng mục hay dùng và ĐVT: đích trống → mặc định lấy của nguồn
    const st1 = KT.materialStats(db);
    const s = (st, ma) => st.find((x) => x.ma === ma) || { soLan: 0, tongTien: 0, tongSL: 0 };
    assert.equal(s(st1, 'VL-XERAC6').soLan, s(st0, 'VL-XERAC6').soLan + s(st0, 'VL-XERAC6B').soLan);
    assert.equal(s(st1, 'VL-XERAC6').tongTien, s(st0, 'VL-XERAC6').tongTien + s(st0, 'VL-XERAC6B').tongTien);
    assert.ok(!st1.some((x) => x.ma === 'VL-XERAC6B'));
    assert.equal(KT.priceHistory(db, 'VL-XERAC6').length, s(st1, 'VL-XERAC6').soLan, 'lịch sử giá đủ mọi lần mua');
    const d = db.materials.find((m) => m.ma === 'VL-XERAC6');
    assert.equal(d.maHM, 'HM01'); assert.equal(d.dvt, 'XE', 'ĐVT đích trống → mặc định lấy của nguồn');
    // 2. mã khoản với vật tư thường
    r = await preview(srv, { loai: 'vt', nguon: ['XX-KHAC'], dich: 'CAT' });
    assert.ok(r.json.preview.chan.some((c) => c.can === 'khoan'));
    r = await merge(srv, { loai: 'vt', nguon: ['XX-KHAC'], dich: 'CAT' });
    assert.equal(r.status, 400); assert.match(r.json.error, /mã khoản/);
    // 3. cùng ĐVT, khác cách viết tên: chỉ cảnh báo; gộp được; giữ tên của nguồn nếu chọn
    r = await preview(srv, { loai: 'vt', nguon: ['BT-BOMDUN2'], dich: 'BT-BOMDUN' });
    assert.ok(r.json.preview.canhBao.some((x) => /Tên vật tư khác/.test(x)));
    assert.ok(!r.json.preview.chan.length);
    r = await merge(srv, { loai: 'vt', nguon: ['BT-BOMDUN2'], dich: 'BT-BOMDUN', giuLai: { ten: 'BT-BOMDUN2' } });
    assert.equal(r.status, 200);
    db = readStored(srv.dataDir);
    assert.equal(db.materials.find((m) => m.ma === 'BT-BOMDUN').ten, 'BÊ tông bơm/đùn');
    // nhập tay mã vật tư cũ → mã đích
    r = await srv.ok('POST', '/api/cost-slips', { header: { ngay: '2026-09-20', maCT: 'CT3', maNCC: 'NCC_HoaLan', maHM: 'HM01' }, lines: [{ maVT: 'bt-bomdun2', soLuong: 1, donGia: 1000 }] });
    assert.equal(r.db.costs.find((c) => c.ngay === '2026-09-20').maVT, 'BT-BOMDUN');
    // hoàn tác cả hai (ngược thứ tự) → như ban đầu (bỏ dòng vừa thêm)
    const added = r.db.costs.find((c) => c.ngay === '2026-09-20');
    await srv.ok('POST', '/api/costs/delete', { ids: [added.id] });
    const log = (await srv.ok('GET', '/api/merge/log')).items;
    for (const g of log) { const u = await srv.call('POST', '/api/merge/' + g.id + '/undo'); assert.equal(u.status, 200, JSON.stringify(u.json)); }
    const end = readStored(srv.dataDir);
    sameData(Object.assign({}, start, { trash: end.trash }), end, 'hoàn tác gộp vật tư:');
  } finally { await srv.stop(); }
});

/* ============================== Hạng mục, nhà / khu, tách mã hạng mục (mục 4) ============================== */

// Tổng chi phí theo nhóm CP tính độc lập: dòng → hạng mục (theo mã, không phân biệt hoa thường) → nhóm
function theoNhom(db) {
  const hm = new Map(db.costItems.map((i) => [key(i.ma), i.maNhom]));
  const o = {};
  db.costs.filter((c) => !KT.isDraft(c)).forEach((c) => { const g = hm.get(key(c.maHM)) || '(trống)'; o[g] = (o[g] || 0) + c.thanhTien; });
  return o;
}

test('M9 gộp hạng mục: cùng nghĩa (khác cách viết) gộp thẳng, đổi cả vật tư "hạng mục hay dùng"; khác tên bị chặn tới khi xác nhận CÙNG NGHĨA; khác nhóm thì cảnh báo và tổng theo nhóm chuyển đúng; tổng chi phí không đổi; mã cũ khi nhập phiếu tự về mã đích; hoàn tác', async () => {
  const srv = await startServer({ seed: mau({ seed: 41 }) });
  try {
    const start = readStored(srv.dataDir);
    // 1. HM02 "Vật tư  vlxd" → HM01 "Vật tư VLXD": cùng nghĩa, không bị chặn
    let r = await preview(srv, { loai: 'hm', nguon: ['HM02'], dich: 'HM01' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    let pv = r.json.preview;
    assert.deepEqual(pv.chan, []);
    assert.equal(pv.nguon[0].counts.costs, start.costs.filter((c) => c.maHM === 'HM02').length);
    assert.equal(pv.nguon[0].counts.materials, 1, 'vật tư CAT có hạng mục hay dùng HM02');
    const b0 = soLieu(start);
    const g0 = theoNhom(start);
    r = await merge(srv, { loai: 'hm', nguon: ['HM02'], dich: 'HM01', phienBan: pv.phienBan });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    let db = readStored(srv.dataDir);
    checkInvariant(b0, soLieu(db), [['hm', exactKey]], ['HM02'], 'HM01');
    assert.deepEqual(theoNhom(db), g0, 'cùng nhóm G1: tổng theo nhóm không đổi');
    assert.equal(db.materials.find((m) => m.ma === 'CAT').maHM, 'HM01');
    noOrphans(db, 'hm', ['HM02'], 'HM01');
    assert.equal(KT.costSummary(db, {}, KT.buildCostLedger(db)).total, b0.tongChiPhi);
    // nhập phiếu bằng mã cũ → mã đích
    r = await srv.ok('POST', '/api/cost-slips', { header: { ngay: '2026-09-21', maCT: 'CT3', maNCC: 'NCC_HoaLan', maHM: 'hm02' }, lines: [{ dienGiai: 'mã cũ', soLuong: 1, donGia: 1000 }] });
    const added = r.db.costs.find((c) => c.dienGiai === 'mã cũ');
    assert.equal(added.maHM, 'HM01');
    await srv.ok('POST', '/api/costs/delete', { ids: [added.id] });
    // 2. HM37 "Bảo hành" → HM38 "Chi phí quản lý": khác tên → chặn, gợi ý dùng Tách mã
    r = await preview(srv, { loai: 'hm', nguon: ['HM37'], dich: 'HM38' });
    assert.ok(r.json.preview.chan.some((c) => c.can === 'ten' && /Tách mã hạng mục/.test(c.text)));
    r = await merge(srv, { loai: 'hm', nguon: ['HM37'], dich: 'HM38' });
    assert.equal(r.status, 400); assert.match(r.json.error, /CÙNG NGHĨA/);
    assert.equal(readStored(srv.dataDir).costs.filter((c) => c.maHM === 'HM37').length, start.costs.filter((c) => c.maHM === 'HM37').length, 'chưa đổi gì');
    // 3. HM40 (nhóm G2) → HM01 (nhóm G1), có xác nhận: cảnh báo khác nhóm; tiền của HM40 chuyển từ G2 sang G1, tổng không đổi
    r = await preview(srv, { loai: 'hm', nguon: ['HM40'], dich: 'HM01', xacNhan: { ten: true } });
    assert.ok(r.json.preview.canhBao.some((x) => /Khác nhóm chi phí/.test(x)));
    const b1 = soLieu(readStored(srv.dataDir));
    const g1 = theoNhom(readStored(srv.dataDir));
    const tienHM40 = b1.hm.HM40 || 0;
    assert.ok(tienHM40 > 0);
    r = await merge(srv, { loai: 'hm', nguon: ['HM40'], dich: 'HM01', xacNhan: { ten: true } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(r.json.merge.xacNhan.some((x) => /khác tên/.test(x)), 'lịch sử ghi lại xác nhận');
    db = readStored(srv.dataDir);
    checkInvariant(b1, soLieu(db), [['hm', exactKey]], ['HM40'], 'HM01');
    const g2 = theoNhom(db);
    assert.equal(g2.G1, g1.G1 + tienHM40); assert.equal(g2.G2, g1.G2 - tienHM40);
    assert.equal(db.costItems.find((i) => i.ma === 'HM01').maNhom, 'G1', 'mặc định giữ nhóm của đích');
    // 4. hoàn tác ngược thứ tự → như ban đầu
    const log = (await srv.ok('GET', '/api/merge/log')).items;
    for (const g of log) { const u = await srv.call('POST', '/api/merge/' + g.id + '/undo'); assert.equal(u.status, 200, JSON.stringify(u.json)); }
    const end = readStored(srv.dataDir);
    sameData(Object.assign({}, start, { trash: end.trash }), end, 'hoàn tác gộp hạng mục:');
  } finally { await srv.stop(); }
});

test('M10 gộp nhà / khu: chỉ trong cùng một công trình (khác công trình bị chặn cứng, kể cả nhà dùng chung); bất biến tiền theo công trình + nhà; nhà chưa dùng gộp được; hoàn tác', async () => {
  const srv = await startServer({ seed: mau({ seed: 43 }) });
  try {
    const start = readStored(srv.dataDir);
    // 1. CHUNG2 (NHAMsHANH) → CHUNG1 (NHACOHANH): khác công trình
    let r = await preview(srv, { loai: 'nha', nguon: ['CHUNG2'], dich: 'CHUNG1' });
    assert.equal(r.status, 200);
    assert.ok(r.json.preview.chan.some((c) => c.ma === 'khac-cong-trinh' && !c.can), 'chặn cứng, không có ô xác nhận');
    r = await merge(srv, { loai: 'nha', nguon: ['CHUNG2'], dich: 'CHUNG1', xacNhan: { ten: true, dvt: true, khoan: true } });
    assert.equal(r.status, 400); assert.match(r.json.error, /cùng một công trình/);
    sameData(start, readStored(srv.dataDir), 'bị chặn thì không đổi gì:');
    // 2. NĐC34 → NĐC7lo (cùng NHACOHANH)
    const b0 = soLieu(start);
    const nCT = (k, code) => k === 'NHACOHANH|' + code;
    r = await preview(srv, { loai: 'nha', nguon: ['NĐC34'], dich: 'NĐC7lo' });
    assert.deepEqual(r.json.preview.chan, []);
    assert.equal(r.json.preview.nguon[0].counts.costs, start.costs.filter((c) => c.maNha === 'NĐC34').length);
    r = await merge(srv, { loai: 'nha', nguon: ['NĐC34'], dich: 'NĐC7lo' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    let db = readStored(srv.dataDir);
    checkInvariant(b0, soLieu(db), [['nha', nCT]], ['NĐC34'], 'NĐC7lo');
    noOrphans(db, 'nha', ['NĐC34'], 'NĐC7lo');
    assert.equal(db.houses.find((x) => x.ma === 'NĐC34').gopVao, 'NĐC7lo');
    const d = db.houses.find((x) => x.ma === 'NĐC7lo');
    assert.equal(d.dienTich, 120, 'giữ diện tích của đích');
    // 3. nhà chưa dùng (N1, N2) → NAM cùng công trình NCT: gộp được, 0 dòng
    r = await merge(srv, { loai: 'nha', nguon: ['N1', 'N2'], dich: 'NAM' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.merge.soBanGhi, 0);
    db = readStored(srv.dataDir);
    assert.deepEqual(db.houses.filter((x) => x.gopVao === 'NAM').map((x) => x.ma).sort(), ['N1', 'N2']);
    // danh mục / báo cáo không còn nhà đã gộp
    assert.ok(!KT.activeDb(await srv.db()).houses.some((x) => ['NĐC34', 'N1', 'N2'].includes(x.ma)));
    // 4. hoàn tác
    const log = (await srv.ok('GET', '/api/merge/log')).items;
    for (const g of log) { const u = await srv.call('POST', '/api/merge/' + g.id + '/undo'); assert.equal(u.status, 200, JSON.stringify(u.json)); }
    sameData(start, readStored(srv.dataDir), 'hoàn tác gộp nhà:');
  } finally { await srv.stop(); }
});

test('M11 tách mã hạng mục (HM37 mang hai nghĩa): bắt buộc có điều kiện lọc; xem trước liệt kê dòng; tạo hạng mục mới trong cùng lần tách; chỉ đổi đúng các dòng đã tích; tổng không đổi, tiền chuyển đúng sang mã mới; khóa sổ, sai mã, dữ liệu đổi giữa chừng bị chặn; hoàn tác gỡ cả hạng mục vừa tạo', async () => {
  const srv = await startServer({ seed: mau({ seed: 47 }) });
  try {
    const start = readStored(srv.dataDir);
    const moi = { ma: 'HM37B', ten: 'Chi phí quản lý dự án', maNhom: 'G2' };
    // 1. không lọc gì → từ chối (tránh đổi nhầm cả hạng mục)
    let r = await srv.call('POST', '/api/merge/split/preview', { maHM: 'HM37', taoMoi: moi, loc: {} });
    assert.equal(r.status, 400); assert.match(r.json.error, /ít nhất một điều kiện lọc/);
    // 2. sai thông tin hạng mục mới
    r = await srv.call('POST', '/api/merge/split/preview', { maHM: 'HM37', taoMoi: { ma: 'HM38', ten: 'x', maNhom: 'G2' }, loc: { ct: 'NHAMsHANH' } });
    assert.equal(r.status, 400); assert.match(r.json.error, /đã tồn tại/);
    r = await srv.call('POST', '/api/merge/split/preview', { maHM: 'HM37', taoMoi: { ma: 'HM99', ten: 'Bảo hành', maNhom: 'G2' }, loc: { ct: 'NHAMsHANH' } });
    assert.equal(r.status, 400); assert.match(r.json.error, /đã có/);
    r = await srv.call('POST', '/api/merge/split/preview', { maHM: 'HM37', dich: 'KHONG_CO', loc: { ct: 'NHAMsHANH' } });
    assert.equal(r.status, 400); assert.match(r.json.error, /chưa có trong danh mục/);
    // 3. xem trước: các dòng HM37 của NHAMsHANH, chưa tạo gì
    r = await srv.call('POST', '/api/merge/split/preview', { maHM: 'HM37', taoMoi: moi, loc: { ct: 'NHAMsHANH' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const pv = r.json.preview;
    const rows = start.costs.filter((c) => c.maHM === 'HM37' && c.maCT === 'NHAMsHANH');
    assert.ok(rows.length >= 4, 'dữ liệu mẫu đủ dòng');
    assert.equal(pv.soDong, rows.length);
    assert.equal(pv.dong.length, rows.length);
    assert.equal(pv.tong, rows.reduce((t, c) => t + c.thanhTien, 0));
    assert.ok(pv.sang.moi);
    assert.ok(!readStored(srv.dataDir).costItems.some((i) => i.ma === 'HM37B'), 'xem trước không tạo hạng mục');
    // 4. dữ liệu đổi giữa xem trước và tách → 409
    await srv.ok('POST', '/api/suppliers', { ma: 'NCC_MOI_TAM', ten: 'tạm' });
    r = await srv.call('POST', '/api/merge/split', { maHM: 'HM37', taoMoi: moi, loc: { ct: 'NHAMsHANH', ids: pv.dong.map((x) => x.id) }, phienBan: pv.phienBan });
    assert.equal(r.status, 409);
    // 5. khóa sổ tháng của một dòng đã chọn → 423, không đổi gì
    const chon = pv.dong.slice(0, Math.ceil(pv.dong.length / 2));
    const thangKhoa = chon[0].ngay.slice(0, 7);
    await srv.ok('POST', '/api/locks', { months: [thangKhoa] });
    r = await srv.call('POST', '/api/merge/split', { maHM: 'HM37', taoMoi: moi, loc: { ct: 'NHAMsHANH', ids: chon.map((x) => x.id) } });
    assert.equal(r.status, 423);
    assert.ok(!readStored(srv.dataDir).costItems.some((i) => i.ma === 'HM37B'));
    await srv.ok('POST', '/api/locks/unlock', { thang: thangKhoa, lyDo: 'kiểm thử tách mã' });
    // 6. tách đúng các dòng đã tích, tạo HM37B
    const b0 = soLieu(readStored(srv.dataDir));
    const g0 = theoNhom(readStored(srv.dataDir));
    r = await srv.call('POST', '/api/merge/split', { maHM: 'HM37', taoMoi: moi, loc: { ct: 'NHAMsHANH', ids: chon.map((x) => x.id) } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.merge.soBanGhi, chon.length);
    let db = readStored(srv.dataDir);
    const hm37b = db.costItems.find((i) => i.ma === 'HM37B');
    assert.deepEqual([hm37b.ten, hm37b.maNhom], [moi.ten, 'G2']);
    const ids = new Set(chon.map((x) => x.id));
    db.costs.forEach((c) => assert.equal(c.maHM === 'HM37B', ids.has(c.id), 'dòng ' + c.id + (ids.has(c.id) ? ' phải' : ' không được') + ' đổi'));
    const b1 = soLieu(db);
    const tienChon = chon.reduce((t, x) => t + x.thanhTien, 0);
    assert.equal(b1.tongChiPhi, b0.tongChiPhi);
    assert.equal(b1.hm.HM37B, tienChon);
    assert.equal(b1.hm.HM37, b0.hm.HM37 - tienChon);
    assert.deepEqual(theoNhom(db), g0, 'HM37B cùng nhóm G2 nên tổng theo nhóm không đổi');
    // báo cáo: hạng mục mới có trong tổng hợp chi phí
    const sum = KT.costSummary(db, {}, KT.buildCostLedger(db));
    assert.equal(sum.total, b0.tongChiPhi);
    // 7. hoàn tác: các dòng về HM37, HM37B gỡ khỏi danh mục (vào thùng rác)
    const g = (await srv.ok('GET', '/api/merge/log')).items.find((x) => x.loai === 'tach-hm');
    assert.ok(g.coTheHoanTac, g.lyDo);
    r = await srv.call('POST', '/api/merge/' + g.id + '/undo');
    assert.equal(r.status, 200, JSON.stringify(r.json));
    db = readStored(srv.dataDir);
    assert.ok(!db.costItems.some((i) => i.ma === 'HM37B'));
    assert.ok(db.trash.some((t) => t.kind === 'costItems' && t.records.some((x) => x.ma === 'HM37B')));
    const end = readStored(srv.dataDir);
    sameData(Object.assign({}, start, { trash: end.trash, suppliers: end.suppliers, locks: end.locks }), end, 'hoàn tác tách mã:');
    // 8. tách sang hạng mục có sẵn theo khoảng ngày rồi hoàn tác
    r = await srv.call('POST', '/api/merge/split', { maHM: 'HM37', dich: 'HM38', loc: { from: '2026-03-01', to: '2026-04-30' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.merge.soBanGhi, start.costs.filter((c) => c.maHM === 'HM37' && c.ngay >= '2026-03-01' && c.ngay <= '2026-04-30').length);
    r = await srv.call('POST', '/api/merge/' + r.json.merge.id + '/undo');
    assert.equal(r.status, 200);
    assert.deepEqual(readStored(srv.dataDir).costs, start.costs);
  } finally { await srv.stop(); }
});

/* ============================== Dự án / công trình (mục 5) ============================== */

test('M12 gộp dự án / công trình: nhà của nguồn chuyển sang đích (nhà dùng chung gộp vào nhà dùng chung của đích theo lựa chọn); sổ thu chi, chi phí, khoản trả ngoài quỹ, thùng rác đổi mã; ngân sách cả hai bên phải chọn (giữ / cộng); ngày khởi công sớm nhất; cảnh báo địa chỉ, thời gian không giao; khóa sổ chặn; báo cáo dự án / công nợ đúng; hoàn tác', async () => {
  const srv = await startServer({ seed: mau({ seed: 53 }) });
  try {
    const start = readStored(srv.dataDir);
    const SRC = 'NHAMsHANH';
    const DST = 'NHACOHANH';
    // 1. xem trước
    let r = await preview(srv, { loai: 'da', nguon: [SRC], dich: DST });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    let pv = r.json.preview;
    const cnt = (list, field) => start[list].filter((x) => x[field] === SRC).length + start.trash.filter((t) => t.kind === list).reduce((n, t) => n + t.records.filter((x) => x[field] === SRC).length, 0);
    assert.equal(pv.nguon[0].counts.entries, cnt('entries', 'maDuAn'));
    assert.equal(pv.nguon[0].counts.costs, cnt('costs', 'maCT'));
    assert.equal(pv.nguon[0].counts.houses, 2);
    assert.equal(pv.nguon[0].counts.extPayments, 1);
    assert.deepEqual(pv.nha.map((x) => [x.ma, x.goiY, x.vao]).sort(), [['CHUNG2', 'CHUNG1', ''], ['NĐC910', '', '']], 'nhà dùng chung gợi ý gộp vào nhà dùng chung của đích');
    assert.equal(pv.thuocTinh.find((a) => a.f === 'ngayKhoiCong').chon, SRC, 'mặc định ngày khởi công sớm nhất');
    assert.deepEqual(pv.chan, [], 'nguồn không có ngân sách: không phải chọn');
    // 2. khóa sổ một tháng có dòng của nguồn → 423, không đổi gì
    const e0 = start.entries.find((e) => e.maDuAn === SRC);
    await srv.ok('POST', '/api/locks', { months: [e0.ngay.slice(0, 7)] });
    r = await merge(srv, { loai: 'da', nguon: [SRC], dich: DST });
    assert.equal(r.status, 423); assert.ok(r.json.khoa && r.json.khoa.length || /khóa sổ/.test(r.json.error));
    await srv.ok('POST', '/api/locks/unlock', { thang: e0.ngay.slice(0, 7), lyDo: 'kiểm thử gộp dự án' });
    // 3. gộp, CHUNG2 → CHUNG1
    const before = readStored(srv.dataDir);
    const b0 = soLieu(before);
    const ps0 = KT.projectSummary(before, {});
    const pd0 = KT.projectDebtSummary(before, {});
    const sd0 = KT.supplierDebt(before, {});
    r = await merge(srv, { loai: 'da', nguon: [SRC], dich: DST, nhaMap: { CHUNG2: 'CHUNG1' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const db = readStored(srv.dataDir);
    const a0 = soLieu(db);
    checkInvariant(b0, a0, [['ct', exactKey], ['duAnThu', exactKey], ['duAnChi', exactKey], ['duAnNgoai', exactKey]], [SRC], DST);
    // chi phí theo công trình + nhà: NĐC910 chuyển nguyên sang đích; CHUNG2 cộng vào CHUNG1
    assert.equal(a0.nha[DST + '|NĐC910'], b0.nha[SRC + '|NĐC910']);
    assert.equal(a0.nha[DST + '|CHUNG1'] || 0, (b0.nha[DST + '|CHUNG1'] || 0) + (b0.nha[SRC + '|CHUNG2'] || 0));
    assert.equal(a0.nha[DST + '|'] || 0, (b0.nha[DST + '|'] || 0) + (b0.nha[SRC + '|'] || 0), 'dòng không ghi nhà');
    Object.keys(a0.nha).forEach((k) => assert.ok(!k.startsWith(SRC + '|') || !a0.nha[k], 'không còn chi phí ở ' + k));
    noOrphans(db, 'da', [SRC], DST);
    noOrphans(db, 'nha', ['CHUNG2'], 'CHUNG1');
    assert.equal(db.houses.find((x) => x.ma === 'NĐC910').maCT, DST);
    assert.equal(db.houses.find((x) => x.ma === 'CHUNG2').gopVao, 'CHUNG1');
    const d = db.projects.find((p) => p.ma === DST);
    assert.deepEqual([d.nganSach, d.ngayKhoiCong, d.diaChi], [500000000, '2026-02-15', 'Hòa Xuân, Đà Nẵng']);
    assert.equal(db.projects.find((p) => p.ma === SRC).gopVao, DST);
    // báo cáo: tổng toàn cục không đổi; dự án đích = cộng dồn
    const ps1 = KT.projectSummary(db, {});
    assert.equal(ps1.total.chi, ps0.total.chi); assert.equal(ps1.total.thu, ps0.total.thu);
    const row = (ps, ma) => ps.rows.find((x) => x.ma === ma) || { chi: 0, thu: 0, soDong: 0 };
    assert.equal(row(ps1, DST).chi, row(ps0, DST).chi + row(ps0, SRC).chi);
    assert.equal(row(ps1, DST).soDong, row(ps0, DST).soDong + row(ps0, SRC).soDong);
    const pd1 = KT.projectDebtSummary(db, {});
    ['phatSinh', 'daTra'].forEach((k) => assert.equal(pd1.total[k], pd0.total[k], 'công nợ theo công trình: tổng ' + k));
    const prow = (pd, ma) => pd.rows.find((x) => x.ma === ma);
    assert.equal(prow(pd1, DST).phatSinh, prow(pd0, DST).phatSinh + prow(pd0, SRC).phatSinh);
    assert.equal(prow(pd1, DST).daTra, prow(pd0, DST).daTra + prow(pd0, SRC).daTra);
    assert.ok(!prow(pd1, SRC));
    const sd1 = KT.supplierDebt(db, {});
    ['phatSinh', 'daTra', 'conLai'].forEach((k) => assert.equal(sd1.totalAll[k], sd0.totalAll[k], 'công nợ NCC: tổng ' + k));
    // nhập tay mã dự án cũ → mã đích
    r = await srv.ok('POST', '/api/entries', { ngay: '2026-09-22', maDuAn: 'nhamshanh', chi: 1000, noiDung: 'mã dự án cũ' });
    const ne = r.db.entries.find((e) => e.noiDung === 'mã dự án cũ');
    assert.equal(ne.maDuAn, DST);
    await srv.ok('DELETE', '/api/entries/' + ne.id);
    // 4. hoàn tác → như ban đầu
    const g = (await srv.ok('GET', '/api/merge/log')).items[0];
    assert.ok(g.coTheHoanTac, g.lyDo);
    r = await srv.call('POST', '/api/merge/' + g.id + '/undo');
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const end = readStored(srv.dataDir);
    sameData(Object.assign({}, start, { trash: end.trash, locks: end.locks }), end, 'hoàn tác gộp dự án:');
    // 5. hai bên đều có ngân sách (CT3 200tr, NHACOHANH 500tr): phải chọn; khác địa chỉ: cảnh báo
    r = await preview(srv, { loai: 'da', nguon: ['CT3'], dich: DST });
    pv = r.json.preview;
    assert.ok(pv.chan.some((c) => c.ma === 'ngan-sach'));
    assert.ok(pv.canhBao.some((x) => /khác địa chỉ/.test(x)));
    r = await merge(srv, { loai: 'da', nguon: ['CT3'], dich: DST });
    assert.equal(r.status, 400); assert.match(r.json.error, /ngân sách/);
    r = await merge(srv, { loai: 'da', nguon: ['CT3'], dich: DST, giuLai: { nganSach: 'cong' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(readStored(srv.dataDir).projects.find((p) => p.ma === DST).nganSach, 700000000, 'cộng ngân sách');
    await srv.ok('POST', '/api/merge/' + r.json.merge.id + '/undo');
    r = await merge(srv, { loai: 'da', nguon: ['CT3'], dich: DST, giuLai: { nganSach: 'CT3' } });
    assert.equal(readStored(srv.dataDir).projects.find((p) => p.ma === DST).nganSach, 200000000, 'giữ ngân sách của nguồn');
    await srv.ok('POST', '/api/merge/' + r.json.merge.id + '/undo');
    // 6. thời gian phát sinh không giao nhau: cảnh báo
    await srv.ok('POST', '/api/projects', { ma: 'CT_CU', ten: 'Công trình cũ', nganSach: 0, trangThai: 'Hoàn thành' });
    await srv.ok('POST', '/api/entries', { ngay: '2025-03-10', maDuAn: 'CT_CU', chi: 5000, noiDung: 'năm ngoái' });
    r = await preview(srv, { loai: 'da', nguon: ['CT_CU'], dich: DST });
    assert.ok(r.json.preview.canhBao.some((x) => /không giao/.test(x)), JSON.stringify(r.json.preview.canhBao));
  } finally { await srv.stop(); }
});

/* ============================== Gợi ý mã trùng (mục 6) ============================== */

test('M13 gợi ý mã trùng: mã khác hoa / thường, trùng tên (bỏ dấu, dấu câu; vật tư cùng ĐVT; nhà cùng công trình), tên gần giống; nhà không dùng; không bao giờ tự gộp; Bỏ qua được nhớ, Hiện lại; gộp xong thì hết gợi ý; khóa lạ bị từ chối', async () => {
  const srv = await startServer({ seed: mau({ seed: 59 }) });
  try {
    const start = readStored(srv.dataDir);
    let r = await srv.ok('GET', '/api/merge/suggest');
    const find = (loai, codes) => r.nhom.find((g) => g.loai === loai && g.ma.map((x) => x.ma).sort().join('|') === codes.slice().sort().join('|'));
    const ncc = find('ncc', ['NCC_ThienHai', 'NCC_THienHAi']);
    assert.ok(ncc && ncc.kieu === 'ma', 'NCC chỉ khác hoa / thường');
    assert.equal(ncc.ma.find((x) => x.ma === 'NCC_ThienHai').dung, start.costs.filter((c) => c.maNCC === 'NCC_ThienHai').length + start.entries.filter((e) => e.maNCC === 'NCC_ThienHai').length,
      'số chỗ dùng đếm đúng từng cách viết');
    assert.equal(find('hm', ['HM01', 'HM02']).kieu, 'ten', 'hạng mục trùng tên (khoảng trắng, hoa / thường)');
    assert.equal(find('vt', ['BT-BOMDUN', 'BT-BOMDUN2']).kieu, 'ten', 'vật tư trùng tên bỏ dấu câu, cùng ĐVT');
    assert.ok(!find('vt', ['VL-XERAC6', 'VL-XERAC6B']), 'cùng tên nhưng khác ĐVT: không gợi ý trùng tên');
    assert.ok(!find('nha', ['CHUNG1', 'CHUNG2']), 'nhà cùng tên ở hai công trình khác nhau: không gợi ý');
    const gan = find('ncc', ['NCC_Khoi', 'NCC_Khoi2']);
    assert.ok(gan && gan.kieu === 'gan' && /Anh Khôi/.test(gan.ly), 'tên gần giống "Anh Khôi" / "Đội anh Khôi"');
    assert.ok(!r.nhom.some((g) => g.loai === 'ncc' && g.kieu === 'gan' && g.ma.some((x) => x.ma === 'NCC_ThienHai') && g.ma.some((x) => x.ma === 'NCC_THienHAi')), 'không nhắc lại cặp đã báo');
    assert.deepEqual(r.nhaKhongDung.map((x) => x.ma).sort(), ['N1', 'N2', 'N3', 'N4', 'N5', 'NAM'].concat(start.houses.filter((h) => !start.costs.some((c) => c.maNha === h.ma) && !/^N\d|^NAM$/.test(h.ma)).map((h) => h.ma)).sort());
    sameData(start, readStored(srv.dataDir), 'xem gợi ý không đổi gì:');
    // bỏ qua → nhớ (cả sau khi khởi động lại); hiện lại
    await srv.ok('POST', '/api/merge/suggest/ignore', { khoa: gan.khoa, label: 'kiểm thử' });
    await srv.stop();
    const srv2 = await startServer({ data: srv.dataDir });
    try {
      r = await srv2.ok('GET', '/api/merge/suggest');
      assert.equal(find('ncc', ['NCC_Khoi', 'NCC_Khoi2']).boQua, true);
      await srv2.ok('DELETE', '/api/merge/suggest/ignore', { khoa: gan.khoa });
      r = await srv2.ok('GET', '/api/merge/suggest');
      assert.equal(find('ncc', ['NCC_Khoi', 'NCC_Khoi2']).boQua, false);
      for (const bad of ['', 'xx:ma:a', 'ncc:la:a', 'ncc', { a: 1 }]) {
        const x = await srv2.call('POST', '/api/merge/suggest/ignore', { khoa: bad });
        assert.equal(x.status, 400, JSON.stringify(bad));
      }
      // gộp nhóm gợi ý → nhóm đó biến mất
      const m = await srv2.call('POST', '/api/merge', { loai: 'hm', nguon: ['HM02'], dich: 'HM01' });
      assert.equal(m.status, 200);
      r = await srv2.ok('GET', '/api/merge/suggest');
      assert.ok(!find('hm', ['HM01', 'HM02']));
      // hiệu năng: gợi ý trên dữ liệu lớn
    } finally { await srv2.stop(); }
    const big = await startServer({ seed: mau({ seed: 61, costs: 20000, entries: 3000 }) });
    try {
      const t0 = Date.now();
      await big.ok('GET', '/api/merge/suggest');
      const ms = Date.now() - t0;
      console.log('# Gợi ý mã trùng với 20.000 dòng chi phí: ' + ms + ' ms');
      assert.ok(ms < 2000, 'gợi ý < 2 giây (' + ms + ' ms)');
    } finally { await big.stop(); }
  } finally { await srv.stop(); }
});

/* ============================== Bền vững (mất điện giữa lúc gộp) ============================== */

test('M14 tắt ngang (kill -9) khi đang gộp mã ở nhiều thời điểm: mở lại thì dữ liệu hoặc nguyên như trước, hoặc đã gộp trọn vẹn (bất biến tiền, không mồ côi, có lịch sử để hoàn tác) — không bao giờ gộp dở', { timeout: 400000 }, async () => {
  const fs = require('fs');
  const path = require('path');
  const { tmpDir } = require('./helpers');
  // tạo sẵn một thư mục dữ liệu lớn rồi chép ra cho từng lần thử
  const goc = await startServer({ seed: mau({ seed: 67, costs: 20000, entries: 3000 }) });
  await goc.stop();
  const start = readStored(goc.dataDir);
  const b0 = soLieu(start);
  const nguon = ['NCC_THienHAi', 'NCC_Khoi2'];
  const ketQua = { truoc: 0, sau: 0 };
  const chep = () => {
    const dir = tmpDir('kill-gop');
    fs.readdirSync(goc.dataDir).filter((f) => /^ketoan\.db/.test(f)).forEach((f) => fs.copyFileSync(path.join(goc.dataDir, f), path.join(dir, f)));
    return dir;
  };
  // đo thời gian một lần gộp trọn vẹn để rải các điểm tắt suốt khoảng đó (và sau đó)
  const s0 = await startServer({ data: chep() });
  const t0 = Date.now();
  assert.equal((await merge(s0, { loai: 'ncc', nguon, dich: 'NCC_ThienHai' })).status, 200);
  const T = Date.now() - t0;
  await s0.stop();
  const diem = [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1, 1.5, 3].map((k) => Math.round(k * T));
  for (const ms of diem) {
    const dir = chep();
    const srv = await startServer({ data: dir });
    const req = merge(srv, { loai: 'ncc', nguon, dich: 'NCC_ThienHai' }).catch(() => null);
    await new Promise((r) => setTimeout(r, ms));
    srv.child.kill('SIGKILL');
    await req;
    await srv.stop();
    const db = readStored(dir);
    const gop = db.suppliers.find((s) => s.ma === 'NCC_THienHAi').gopVao === 'NCC_ThienHai';
    if (!gop) {
      ketQua.truoc++;
      sameData(start, db, 'tắt sau ' + ms + ' ms, chưa gộp: phải nguyên như trước:');
    } else {
      ketQua.sau++;
      assert.equal(db.mergeLog.length, 1, 'đã gộp thì có lịch sử');
      assert.equal(db.suppliers.find((s) => s.ma === 'NCC_Khoi2').gopVao, 'NCC_ThienHai');
      checkInvariant(b0, soLieu(db), [['nccCP', exactKey], ['nccTra', exactKey], ['nccNgoai', exactKey]], nguon, 'NCC_ThienHai');
      noOrphans(db, 'ncc', nguon, 'NCC_ThienHai');
      // mở lại được và hoàn tác được
      const s2 = await startServer({ data: dir });
      try {
        const g = (await s2.ok('GET', '/api/merge/log')).items[0];
        const u = await s2.call('POST', '/api/merge/' + g.id + '/undo');
        assert.equal(u.status, 200, JSON.stringify(u.json));
      } finally { await s2.stop(); }
      const back = readStored(dir);
      sameData(Object.assign({}, start, { trash: back.trash }), back, 'tắt sau ' + ms + ' ms rồi hoàn tác:');
    }
  }
  console.log('# Tắt ngang khi gộp (một lần gộp mất ' + T + ' ms; tắt sau ' + diem.join(', ') + ' ms): ' + ketQua.truoc + ' lần dữ liệu nguyên như trước, ' + ketQua.sau + ' lần đã gộp trọn vẹn');
  assert.equal(ketQua.truoc + ketQua.sau, diem.length);
  assert.ok(ketQua.sau >= 1, 'có ít nhất một lần tắt sau khi đã gộp xong (kiểm được nhánh "đã gộp")');
});

/* ============================== Nâng cấp lược đồ 4 → 5 ============================== */

test('M0 nâng cấp lược đồ 4 → mới nhất: file lược đồ 4 mở bằng bản mới → tự sao lưu nguyên trạng, thêm bảng / cột, mọi số liệu báo cáo giữ nguyên, nhật ký ghi lại; mở lại không nâng cấp lần nữa (chạy lại không sao); khôi phục bản sao lưu lược đồ 4 được', async () => {
  const fs = require('fs');
  const path = require('path');
  const { DatabaseSync } = require('node:sqlite');
  const { SqliteDb } = require('../lib/db');
  const { summarize } = require('./so-lieu-moc');
  // 1. dựng file lược đồ 4 đúng như bản trước: tạo bằng mã hiện tại rồi bỏ các bảng / cột của lược đồ 5 và 6
  const srv0 = await startServer({ seed: path.join(__dirname, 'fixtures', 'ketoan-v2-hien-tai.json') });
  await srv0.stop();
  const dir = srv0.dataDir;
  const file = path.join(dir, 'ketoan.db');
  const c = new DatabaseSync(file);
  ['extPayments', 'aliases', 'mergeLog', 'ignoredDupes', 'nguoiDung', 'phienDangNhap', 'suKienBaoMat', 'cauHinhDangNhap'].forEach((t) => c.exec('DROP TABLE "' + t + '"'));
  ['projects', 'suppliers', 'costItems', 'materials', 'houses'].forEach((t) => c.exec('ALTER TABLE "' + t + '" DROP COLUMN "gopVao"'));
  ['projects', 'suppliers', 'entries', 'costGroups', 'costItems', 'materials', 'houses', 'costs', 'cashCounts'].forEach((t) => {
    c.exec('ALTER TABLE "' + t + '" DROP COLUMN "nguoiTao"'); c.exec('ALTER TABLE "' + t + '" DROP COLUMN "nguoiSua"');
  });
  c.exec('PRAGMA user_version = 4');
  c.close();
  fs.readdirSync(path.join(dir, 'backups')).forEach((f) => fs.unlinkSync(path.join(dir, 'backups', f)));
  const v4 = readStored(dir);
  assert.equal(v4.schema, 4);
  const so4 = summarize(v4);
  // 2. mở bằng bản mới
  const srv = await startServer({ data: dir });
  try {
    assert.match(srv.log, /nâng cấp dữ liệu lên lược đồ \d/i);
    const db = readStored(dir);
    assert.equal(db.schema, require('../lib/db').DB_VERSION);
    assert.deepEqual(db.extPayments, []); assert.deepEqual(db.aliases, []); assert.deepEqual(db.mergeLog, []);
    assert.deepEqual(summarize(db), so4, 'mọi số liệu báo cáo giữ nguyên sau nâng cấp');
    ['projects', 'suppliers', 'entries', 'costs', 'materials', 'houses'].forEach((k) => assert.deepEqual(db[k], v4[k], 'bảng ' + k + ' giữ nguyên'));
    // hạng mục: giữ nguyên, chỉ thêm Loại chi phí điền theo dữ liệu cũ (lược đồ 8)
    const goiY = KT.goiYLoaiCPHangMuc(v4);
    assert.deepEqual(db.costItems.map((i) => { const x = Object.assign({}, i); delete x.loaiCP; return x; }), v4.costItems, 'bảng costItems giữ nguyên');
    assert.ok(db.costItems.every((i) => (i.loaiCP || '') === (goiY.get(i.ma) || '')), 'Loại chi phí điền theo dữ liệu cũ');
    const bks = fs.readdirSync(path.join(dir, 'backups')).filter((f) => /truoc-nang-cap-luoc-do-\d/.test(f));
    assert.equal(bks.length, 1, 'có đúng một bản sao lưu trước nâng cấp');
    const bk = require('./helpers').readBackupFile(path.join(dir, 'backups', bks[0]));
    assert.deepEqual(summarize(bk), so4, 'bản sao lưu là dữ liệu lược đồ 4 nguyên trạng');
    const audit = (await srv.ok('GET', '/api/audit?limit=20')).items;
    assert.ok(audit.some((e) => e.action === 'nang-cap'), 'nhật ký có dòng nâng cấp');
    // dùng được tính năng mới ngay (rồi hoàn tác để các bước sau so với dữ liệu gốc)
    const g = await merge(srv, { loai: 'ncc', nguon: [v4.suppliers[1].ma], dich: v4.suppliers[0].ma });
    assert.equal(g.status, 200, JSON.stringify(g.json));
    assert.equal((await srv.call('POST', '/api/merge/' + g.json.merge.id + '/undo')).status, 200);
  } finally { await srv.stop(); }
  // 3. mở lại: không nâng cấp lần nữa, không thêm bản sao lưu nâng cấp
  const srv2 = await startServer({ data: dir });
  try {
    assert.doesNotMatch(srv2.log, /nâng cấp dữ liệu lên lược đồ/i);
    assert.equal(fs.readdirSync(path.join(dir, 'backups')).filter((f) => /truoc-nang-cap-luoc-do-\d/.test(f)).length, 1);
    // 4. khôi phục bản sao lưu lược đồ 4 (trước nâng cấp): dữ liệu về như lúc đó, file vẫn lược đồ mới nhất
    const name = fs.readdirSync(path.join(dir, 'backups')).find((f) => /truoc-nang-cap-luoc-do-\d/.test(f));
    await srv2.ok('POST', '/api/backups/restore', { name });
    const back = readStored(dir);
    assert.equal(back.schema, require('../lib/db').DB_VERSION);
    assert.deepEqual(summarize(back), so4);
    assert.deepEqual(back.suppliers, v4.suppliers);
  } finally { await srv2.stop(); }
  // 5. gọi migrate() trên file đã ở lược đồ mới nhất: không làm gì
  const s = new SqliteDb(file);
  try { assert.deepEqual(s.migrate(), []); assert.equal(s.version, require('../lib/db').DB_VERSION); } finally { s.close(); }
});
