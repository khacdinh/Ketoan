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
