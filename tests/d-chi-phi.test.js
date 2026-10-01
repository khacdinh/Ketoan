'use strict';
/* D. Chức năng MỚI: quản lý chi phí công trình (qua API thật + module tính toán dùng chung) */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { KT, startServer, readJsonFile, orphanErrors } = require('./helpers');
const X = require('./excel-helpers');

const V2 = path.join(__dirname, 'fixtures', 'ketoan-v2-hien-tai.json');
const key = (s) => String(s || '').trim().toLowerCase();
function prng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// Bản tính ĐỘC LẬP từ dòng thô (không dùng hàm tổng hợp của shared.js)
function raw(db, f) {
  f = f || {};
  const itemBy = new Map(db.costItems.map((i) => [key(i.ma), i]));
  const grpBy = new Map(db.costGroups.map((g) => [key(g.ma), g]));
  const rows = db.costs.filter((c) => (!f.from || c.ngay >= f.from) && (!f.to || c.ngay <= f.to) && (!f.ct || key(c.maCT) === key(f.ct)) && (!f.nha || key(c.maNha) === key(f.nha)) &&
    (!f.loai || c.loaiCP === f.loai) && (!f.ncc || key(c.maNCC) === key(f.ncc)) && (!f.hm || key(c.maHM) === key(f.hm)) && (!f.vt || key(c.maVT) === key(f.vt)) &&
    (!f.nhom || (itemBy.get(key(c.maHM)) && key(itemBy.get(key(c.maHM)).maNhom) === key(f.nhom))));
  const o = { rows, total: 0, loai: {}, hm: {}, nhom: {}, ncc: {}, thang: {} };
  rows.forEach((c) => {
    const t = X.thanhTien(c.soLuong, c.donGia);
    o.total += t;
    o.loai[c.loaiCP] = (o.loai[c.loaiCP] || 0) + t;
    const it = itemBy.get(key(c.maHM));
    o.hm[key(c.maHM)] = (o.hm[key(c.maHM)] || 0) + t;
    const g = it ? grpBy.get(key(it.maNhom)) : null;
    const gk = g ? key(g.ma) : '(khong)';
    o.nhom[gk] = (o.nhom[gk] || 0) + t;
    o.ncc[key(c.maNCC)] = (o.ncc[key(c.maNCC)] || 0) + t;
    o.thang[c.ngay.slice(0, 7)] = (o.thang[c.ngay.slice(0, 7)] || 0) + t;
  });
  return o;
}

async function setup(srv) {
  await srv.ok('POST', '/api/projects', { ma: 'CT1', ten: 'Công trình 1', nganSach: 500000000 });
  await srv.ok('POST', '/api/projects', { ma: 'CT2', ten: 'Công trình 2' });
  await srv.ok('POST', '/api/houses', { ma: 'NHA1', ten: 'Nhà 1', maCT: 'CT1' });
  await srv.ok('POST', '/api/houses', { ma: 'NHA2', ten: 'Nhà 2', maCT: 'CT1' });
  await srv.ok('POST', '/api/houses', { ma: 'NHB', ten: 'Nhà B', maCT: 'CT2' });
  for (const s of ['S1', 'S2', 'S3']) await srv.ok('POST', '/api/suppliers', { ma: s, ten: 'Nhà cung cấp ' + s });
  const db = await srv.db();
  const hm = (ten) => db.costItems.find((i) => i.ten === ten).ma;
  await srv.ok('POST', '/api/materials', { ma: 'XM', ten: 'Xi măng', dvt: 'bao', maHM: hm('Vật tư VLXD') });
  await srv.ok('POST', '/api/materials', { ma: 'CAT', ten: 'Cát xây', dvt: 'm3', maHM: hm('Vật tư VLXD') });
  await srv.ok('POST', '/api/materials', { ma: 'THEP', ten: 'Thép D16', dvt: 'cây', maHM: hm('Sắt thép xây dựng') });
  return { hm, HM_VL: hm('Vật tư VLXD'), HM_ST: hm('Sắt thép xây dựng'), HM_NC: hm('Nhân công thợ nề'), HM_BT: hm('Bê tông') };
}

const slip = (o) => ({ header: Object.assign({ ngay: '2026-09-10', maCT: 'CT1', maNha: 'NHA1', maNCC: 'S1', soPhieu: '' }, o.header), lines: o.lines });

/* ---------------- D1 danh mục ---------------- */

test('D1.1 danh mục nhóm CP / hạng mục / vật tư / nhà: thêm, sửa, xóa, trùng mã; đổi tên lan ra sổ, báo cáo và Excel', async () => {
  const srv = await startServer({});
  try {
    const c = await setup(srv);
    let r = await srv.ok('POST', '/api/cost-groups', { ma: 'G_TEST', ten: '7. Nhóm thử' });
    const gid = r.id;
    assert.equal((await srv.call('POST', '/api/cost-groups', { ma: 'g_test', ten: 'x' })).status, 400, 'trùng mã khác hoa thường');
    assert.equal((await srv.call('POST', '/api/cost-groups', { ma: '', ten: 'x' })).status, 400);
    assert.equal((await srv.call('POST', '/api/cost-groups', { ma: 'G2', ten: '' })).status, 400);
    r = await srv.ok('POST', '/api/cost-items', { ma: 'HM_T1', ten: 'Hạng mục thử', maNhom: 'G_TEST' });
    const iid = r.id;
    assert.equal((await srv.call('POST', '/api/cost-items', { ma: 'HM_T2', ten: 'hạng mục THỬ', maNhom: 'G_TEST' })).status, 400, 'trùng tên hạng mục (không phân biệt hoa thường/dấu)');
    assert.equal((await srv.call('POST', '/api/cost-items', { ma: 'HM_T3', ten: 'Khác', maNhom: 'KHONG_CO' })).status, 400);
    await srv.ok('POST', '/api/materials', { ma: 'VT_T', ten: 'Vật tư thử', dvt: 'cái', maHM: 'Hạng mục thử', loaiCP: 'vat tu' });
    let db = await srv.db();
    assert.equal(db.materials.find((m) => m.ma === 'VT_T').maHM, 'HM_T1', 'nhập hạng mục theo tên được đổi sang mã');
    assert.equal(db.materials.find((m) => m.ma === 'VT_T').loaiCP, 'Vật tư');
    await srv.ok('POST', '/api/cost-slips', slip({ lines: [{ maVT: 'VT_T', soLuong: 3, donGia: 100000, maHM: 'HM_T1' }, { maVT: 'XM', soLuong: 10, donGia: 90000, maHM: c.HM_VL }] }));
    // đổi tên nhóm → báo cáo và sổ đổi theo
    const g = db.costGroups.find((x) => x.ma === 'G_TEST');
    await srv.ok('PUT', '/api/cost-groups/' + g.id, { ma: 'G_TEST', ten: '7. Nhóm ĐÃ ĐỔI TÊN' });
    db = await srv.db();
    assert.equal(KT.costSummary(db, {}, KT.buildCostLedger(db)).groups.find((x) => x.ma === 'G_TEST').ten, '7. Nhóm ĐÃ ĐỔI TÊN');
    assert.ok(KT.buildCostLedger(db).some((l) => l.tenNhom === '7. Nhóm ĐÃ ĐỔI TÊN'));
    // đổi tên hạng mục
    const it = db.costItems.find((x) => x.ma === 'HM_T1');
    await srv.ok('PUT', '/api/cost-items/' + it.id, { ma: 'HM_T1', ten: 'Hạng mục ĐỔI TÊN', maNhom: 'G_TEST' });
    db = await srv.db();
    assert.ok(KT.buildCostLedger(db).some((l) => l.tenHM === 'Hạng mục ĐỔI TÊN'));
    const sum1 = KT.costSummary(db, {}, KT.buildCostLedger(db));
    assert.equal(sum1.groups.find((x) => x.ma === 'G_TEST').items[0].ten, 'Hạng mục ĐỔI TÊN');
    assert.equal(sum1.groups.find((x) => x.ma === 'G_TEST').total, 300000);
    // đổi NHÓM của hạng mục → báo cáo tự chuyển, tổng không đổi
    const totalBefore = sum1.total;
    await srv.ok('PUT', '/api/cost-items/' + it.id, { ma: 'HM_T1', ten: 'Hạng mục ĐỔI TÊN', maNhom: db.costGroups.find((x) => x.ten === '4. Hoàn thiện').ma });
    db = await srv.db();
    const sum2 = KT.costSummary(db, {}, KT.buildCostLedger(db));
    assert.equal(sum2.groups.find((x) => x.ma === 'G_TEST').total, 0, 'nhóm cũ hết tiền');
    assert.equal(sum2.groups.find((x) => x.ten === '4. Hoàn thiện').total, 300000, 'nhóm mới nhận tiền');
    assert.equal(sum2.total, totalBefore);
    // đổi tên / ĐVT vật tư, tên nhà, tên NCC, tên công trình
    const vt = db.materials.find((x) => x.ma === 'XM');
    await srv.ok('PUT', '/api/materials/' + vt.id, { ma: 'XM', ten: 'Xi măng PCB40', dvt: 'tấn', maHM: c.HM_VL });
    const nha = db.houses.find((x) => x.ma === 'NHA1');
    await srv.ok('PUT', '/api/houses/' + nha.id, { ma: 'NHA1', ten: 'Nhà số 1 đổi tên', maCT: 'CT1' });
    const ncc = db.suppliers.find((x) => x.ma === 'S1');
    await srv.ok('PUT', '/api/suppliers/' + ncc.id, { ma: 'S1', ten: 'NCC một (đổi tên)' });
    const ct = db.projects.find((x) => x.ma === 'CT1');
    await srv.ok('PUT', '/api/projects/' + ct.id, { ma: 'CT1', ten: 'Công trình MỘT', nganSach: 1 });
    db = await srv.db();
    const L = KT.buildCostLedger(db).find((l) => l.maVT === 'XM');
    assert.deepEqual([L.tenVT, L.dvt, L.tenNha, L.tenNCC, L.tenCT], ['Xi măng PCB40', 'tấn', 'Nhà số 1 đổi tên', 'NCC một (đổi tên)', 'Công trình MỘT']);
    // Excel xuất ra cũng theo tên mới
    const wb = await X.loadWb((await srv.call('GET', '/api/export/costs')).body);
    const nk = wb.getWorksheet('NHATKYCHUNG');
    let hit = 0;
    nk.eachRow((row) => row.eachCell((cell) => { const v = X.cellVal(cell); if (v === 'Xi măng PCB40' || v === 'NCC một (đổi tên)' || v === 'tấn') hit++; }));
    assert.equal(hit, 4); // tên vật tư + ĐVT của dòng XM, tên NCC của 2 dòng
    // xóa: đang dùng bị chặn; không dùng thì được
    assert.equal((await srv.call('DELETE', '/api/cost-items/' + it.id)).status, 400);
    await srv.ok('DELETE', '/api/cost-groups/' + gid);
    assert.deepEqual(orphanErrors(await srv.db()), []);
  } finally { await srv.stop(); }
});

test('D1.2 đổi mã vật tư / hạng mục / nhà: dòng chi phí đi theo; không đổi được sang mã trùng; nhà thuộc công trình khác bị chặn', async () => {
  const srv = await startServer({});
  try {
    const c = await setup(srv);
    await srv.ok('POST', '/api/cost-slips', slip({ lines: [{ maVT: 'XM', soLuong: 2, donGia: 1000, maHM: c.HM_VL }, { maVT: 'CAT', soLuong: 1, donGia: 500, maHM: c.HM_VL }] }));
    let db = await srv.db();
    const xm = db.materials.find((m) => m.ma === 'XM');
    const r = await srv.ok('PUT', '/api/materials/' + xm.id, Object.assign({}, xm, { ma: 'XM_MOI' }));
    assert.equal(r.renamed, 1);
    assert.equal((await srv.call('PUT', '/api/materials/' + xm.id, Object.assign({}, xm, { ma: 'cat' }))).status, 400);
    const nha = db.houses.find((h) => h.ma === 'NHA1');
    await srv.ok('PUT', '/api/houses/' + nha.id, Object.assign({}, nha, { ma: 'NHA1_MOI' }));
    db = await srv.db();
    assert.ok(db.costs.every((x) => x.maNha === 'NHA1_MOI') && db.costs.some((x) => x.maVT === 'XM_MOI'));
    assert.deepEqual(orphanErrors(db), []);
    // nhà của CT2 không dùng được cho phiếu của CT1
    const bad = await srv.call('POST', '/api/cost-slips', slip({ header: { maNha: 'NHB' }, lines: [{ dienGiai: 'x', soLuong: 1, donGia: 1, maHM: c.HM_VL }] }));
    assert.equal(bad.status, 400); assert.match(bad.json.error, /thuộc công trình CT2/);
  } finally { await srv.stop(); }
});

/* ---------------- D2, D3 phiếu nhập ---------------- */

test('D2.1 phiếu nhập: đầu phiếu một lần + nhiều dòng; thành tiền = SL × ĐG; loại CP tự xác định; tổng phiếu; tra tên/ĐVT từ danh mục', async () => {
  const srv = await startServer({});
  try {
    const c = await setup(srv);
    const r = await srv.ok('POST', '/api/cost-slips', slip({ header: { soPhieu: 'GH-001', maHM: c.HM_VL }, lines: [
      { maVT: 'XM', soLuong: '2,5', donGia: '1.250.000' },
      { maVT: 'CAT', dienGiai: 'cát vàng', soLuong: '0,125', donGia: '8000' },
      { maVT: 'THEP', soLuong: 12, donGia: '50tr', maHM: c.HM_ST, ghiChu: 'thép cuộn' },
      { dienGiai: 'Công thợ hồ', soLuong: '10+5', donGia: '300k', maHM: c.HM_NC },
      { dienGiai: 'Phí vận chuyển', soLuong: 1, donGia: 250000 },
      { dienGiai: 'Ép loại', soLuong: 1, donGia: 1000, loaiCP: 'nhân công' }
    ] }));
    assert.equal(r.count, 6);
    const expectTotal = 3125000 + 1000 + 600000000 + 4500000 + 250000 + 1000;
    assert.equal(r.total, expectTotal);
    const db = await srv.db();
    const L = KT.buildCostLedger(db).filter((l) => l.phieuId === r.phieuId);
    assert.equal(L.length, 6);
    assert.equal(L.reduce((t, l) => t + l.thanhTien, 0), expectTotal);
    const by = (t) => L.find((l) => (l.dienGiai || l.maVT) === t);
    assert.deepEqual([by('XM').tenVT, by('XM').dvt, by('XM').thanhTien, by('XM').loaiCP, by('XM').soLuong], ['Xi măng', 'bao', 3125000, 'Vật tư', 2.5]);
    assert.deepEqual([by('cát vàng').soLuong, by('cát vàng').thanhTien], [0.125, 1000]);
    assert.deepEqual([by('THEP').maHM, by('THEP').thanhTien, by('THEP').ghiChu], [c.HM_ST, 600000000, 'thép cuộn']);
    assert.deepEqual([by('Công thợ hồ').soLuong, by('Công thợ hồ').thanhTien, by('Công thợ hồ').loaiCP], [15, 4500000, 'Nhân công']);
    assert.equal(by('Phí vận chuyển').loaiCP, 'Dịch vụ-Phí');
    assert.equal(by('Phí vận chuyển').maHM, c.HM_VL, 'dòng không ghi hạng mục lấy hạng mục đầu phiếu');
    assert.equal(by('Ép loại').loaiCP, 'Nhân công');
    L.forEach((l) => { assert.equal(l.ngay, '2026-09-10'); assert.equal(l.maCT, 'CT1'); assert.equal(l.maNha, 'NHA1'); assert.equal(l.maNCC, 'S1'); assert.equal(l.soPhieu, 'GH-001'); });
    const seqs = db.costs.filter((x) => x.phieuId === r.phieuId).map((x) => x.seq);
    assert.deepEqual(seqs, seqs.slice().sort((a, b) => a - b), 'thứ tự dòng được giữ');
    // gợi ý đơn giá gần nhất: ưu tiên cùng NCC
    await srv.ok('POST', '/api/cost-slips', slip({ header: { maNCC: 'S2', ngay: '2026-09-20' }, lines: [{ maVT: 'XM', soLuong: 1, donGia: 1300000, maHM: c.HM_VL }] }));
    const d2 = await srv.db();
    assert.equal(KT.lastPrice(d2, 'XM', 'S1').donGia, 1250000);
    assert.equal(KT.lastPrice(d2, 'XM', 'S1').cungNCC, true);
    assert.equal(KT.lastPrice(d2, 'XM', 'S2').donGia, 1300000);
    const lp = KT.lastPrice(d2, 'XM', 'S3');
    assert.deepEqual([lp.donGia, lp.cungNCC], [1300000, false], 'NCC chưa từng mua: lấy giá lần mua gần nhất của NCC khác');
    assert.equal(KT.lastPrice(d2, 'CAT_KHAC', 'S1'), null);
  } finally { await srv.stop(); }
});

test('D3.1 trường hợp biên của phiếu: số thập phân, số rất lớn, bằng 0, âm, trống, mã lạ, ngày sai', async () => {
  const srv = await startServer({});
  try {
    const c = await setup(srv);
    const post = (lines, header) => srv.call('POST', '/api/cost-slips', slip({ header, lines: lines.map((l) => Object.assign({ maHM: c.HM_VL, dienGiai: 'd' }, l)) }));
    const okTT = async (l, tt, sl) => { const r = await post([l]); assert.equal(r.status, 200, JSON.stringify(l) + ' ' + JSON.stringify(r.json)); assert.equal(r.json.total, tt, JSON.stringify(l)); if (sl != null) assert.equal(r.json.db.costs[r.json.db.costs.length - 1].soLuong, sl); };
    await okTT({ soLuong: 2.5, donGia: 1000 }, 2500, 2.5);
    await okTT({ soLuong: '2,5', donGia: '1.000' }, 2500, 2.5);
    await okTT({ soLuong: '0,125', donGia: 8000 }, 1000, 0.125);
    await okTT({ soLuong: 0.0001, donGia: 10000 }, 1, 0.0001);
    await okTT({ soLuong: 0.0001, donGia: 4000 }, 0, 0.0001); // 0,4 đồng → 0
    await okTT({ soLuong: 0.0001, donGia: 5000 }, 1, 0.0001); // 0,5 đồng → 1 (làm tròn nửa lên)
    await okTT({ soLuong: 3, donGia: 0 }, 0); // hàng tặng
    await okTT({ soLuong: 1, donGia: 12.345 }, 12); // đơn giá tối đa 2 số lẻ
    await okTT({ soLuong: 1e12, donGia: 1 }, 1e12); // SL tối đa
    await okTT({ soLuong: 1, donGia: 1e15 }, 1e15); // thành tiền tối đa
    await okTT({ soLuong: 123456.7891, donGia: 987654.32 }, Math.round(123456.7891 * 987654.32 * 1) === 0 ? 0 : X.thanhTien(123456.7891, 987654.32));
    // số sau dấu phẩy quá 4 chữ số: làm tròn về 4
    const r5 = await post([{ soLuong: '0,123456', donGia: 1000 }]);
    assert.equal(r5.status, 200);
    const sl5 = r5.json.db.costs[r5.json.db.costs.length - 1].soLuong;
    assert.ok(Math.abs(sl5 - 0.123456) < 0.00005 && String(sl5).split('.')[1].length <= 4, 'SL ' + sl5);
    // tràn số
    for (const bad of [{ soLuong: 1e12 + 1, donGia: 1 }, { soLuong: 1e12, donGia: 1e6 }, { soLuong: 1, donGia: 1e15 + 1 }, { soLuong: 1e11, donGia: 1e11 }, { soLuong: 1, donGia: 1e300 }, { soLuong: 1e300, donGia: 1 }]) {
      const r = await post([bad]);
      assert.equal(r.status, 400, JSON.stringify(bad) + ' phải bị từ chối');
      assert.match(r.json.error, /quá lớn/);
    }
    // bằng 0, âm, trống, chữ
    const errs = [
      [{ soLuong: 0, donGia: 1 }, /lớn hơn 0/], [{ soLuong: -1, donGia: 1 }, /âm/], [{ soLuong: 1, donGia: -1 }, /âm/], [{ soLuong: '', donGia: 1 }, /thiếu Số lượng/], [{ soLuong: 1, donGia: '' }, /thiếu Đơn giá/],
      [{ soLuong: null, donGia: 1 }, /thiếu Số lượng/], [{ soLuong: 'abc', donGia: 1 }, /không hợp lệ/], [{ soLuong: 1, donGia: 'abc' }, /không hợp lệ/], [{ soLuong: '1/0', donGia: 1 }, /không hợp lệ/],
      [{ soLuong: 1, donGia: 1, maVT: 'KHONG_CO' }, /chưa có trong danh mục/], [{ soLuong: 1, donGia: 1, maHM: 'Hạng mục không có' }, /chưa có trong danh mục/],
      [{ soLuong: 1, donGia: 1, dienGiai: '', maVT: '' }, /cần Mã VT hoặc Diễn giải/]
    ];
    for (const [l, re] of errs) { const r = await post([l]); assert.equal(r.status, 400, JSON.stringify(l)); assert.match(r.json.error, re, JSON.stringify(l)); assert.match(r.json.error, /^Dòng 1:/, 'phải chỉ đúng dòng lỗi'); }
    // lỗi ở dòng thứ 3: báo đúng số dòng và KHÔNG lưu dòng nào
    const nBefore = (await srv.db()).costs.length;
    const r3 = await post([{ soLuong: 1, donGia: 1 }, { soLuong: 1, donGia: 1 }, { soLuong: -5, donGia: 1 }]);
    assert.equal(r3.status, 400); assert.match(r3.json.error, /^Dòng 3:/);
    assert.equal((await srv.db()).costs.length, nBefore, 'một dòng lỗi thì cả phiếu không được lưu');
    // đầu phiếu
    const hdr = async (h, re) => { const r = await post([{ soLuong: 1, donGia: 1 }], h); assert.equal(r.status, 400, JSON.stringify(h)); assert.match(r.json.error, re, JSON.stringify(h)); };
    await hdr({ ngay: '' }, /Ngày/); await hdr({ ngay: '2026-02-30' }, /Ngày/); await hdr({ ngay: '29/09/2026' }, /Ngày/); await hdr({ ngay: '2026-9-1' }, /Ngày/);
    await hdr({ maCT: '' }, /Thiếu Mã công trình/); await hdr({ maCT: 'KHONG' }, /chưa có trong danh mục/); await hdr({ maNCC: '' }, /Thiếu Mã nhà cung cấp/); await hdr({ maNCC: 'KHONG' }, /chưa có trong danh mục/);
    await hdr({ maNha: 'KHONG' }, /chưa có trong danh mục/);
    // không có dòng hàng / chỉ dòng trắng / quá nhiều dòng
    for (const lines of [[], [{}], [{ maVT: '', dienGiai: '  ', soLuong: '', donGia: '' }], undefined]) {
      const r = await srv.call('POST', '/api/cost-slips', { header: slip({ lines: [] }).header, lines });
      assert.equal(r.status, 400); assert.match(r.json.error, /chưa có dòng hàng/);
    }
    const many = await srv.call('POST', '/api/cost-slips', slip({ lines: Array.from({ length: 501 }, () => ({ maHM: c.HM_VL, dienGiai: 'd', soLuong: 1, donGia: 1 })) }));
    assert.equal(many.status, 400); assert.match(many.json.error, /tối đa 500/);
    const ok500 = await srv.call('POST', '/api/cost-slips', slip({ lines: Array.from({ length: 500 }, () => ({ maHM: c.HM_VL, dienGiai: 'd', soLuong: 1, donGia: 1 })) }));
    assert.equal(ok500.status, 200); assert.equal(ok500.json.total, 500);
    assert.deepEqual(orphanErrors(await srv.db()), []);
  } finally { await srv.stop(); }
});

test('D3.2 chữ tiếng Việt có dấu, ký tự đặc biệt, chuỗi rất dài, dấu tổ hợp/dựng sẵn', async () => {
  const srv = await startServer({});
  try {
    const c = await setup(srv);
    const weird = 'Bê tông M250 — đá 1×2 "thượng hạng" \'nháy\' & <b>đậm</b> 🚧 ~!@#$%^&*()_+{}|:<>?[];,./\\ ǅ';
    const r = await srv.ok('POST', '/api/cost-slips', slip({ header: { soPhieu: 'Số/Phiếu #1 "đặc biệt"' }, lines: [{ maHM: c.HM_VL, dienGiai: weird, soLuong: 1, donGia: 1, ghiChu: 'Ghi chú có \ttab và\nxuống dòng' }] }));
    let db = await srv.db();
    const l = db.costs.find((x) => x.phieuId === r.phieuId);
    assert.equal(l.dienGiai, weird.replace(/\s+/g, ' ').trim(), 'giữ nguyên ký tự (chỉ gộp khoảng trắng)');
    assert.equal(l.soPhieu, 'Số/Phiếu #1 "đặc biệt"');
    assert.equal(l.ghiChu, 'Ghi chú có tab và xuống dòng');
    // tìm kiếm không dấu, không phân biệt hoa thường
    const led = KT.buildCostLedger(db);
    for (const q of ['be tong m250', 'BÊ TÔNG', 'thuong hang', 'đậm', '1×2']) assert.equal(KT.filterCosts(led, { q }).rows.filter((x) => x.id === l.id).length, 1, q);
    // dấu tổ hợp (NFD) và dựng sẵn (NFC) là một: mã vật tư gõ kiểu NFD vẫn tra được
    const nfc = 'NỀ-CÔNG'.normalize('NFC'); const nfd = nfc.normalize('NFD');
    assert.notEqual(nfc, nfd);
    await srv.ok('POST', '/api/materials', { ma: nfd, ten: 'Mã NFD', dvt: 'công', maHM: c.HM_NC });
    db = await srv.db();
    assert.equal(db.materials.find((m) => m.ten === 'Mã NFD').ma, nfc, 'lưu ở dạng dựng sẵn');
    const r2 = await srv.call('POST', '/api/cost-slips', slip({ lines: [{ maVT: nfd, soLuong: 1, donGia: 1000, maHM: c.HM_NC }] }));
    assert.equal(r2.status, 200, JSON.stringify(r2.json));
    assert.equal((await srv.call('POST', '/api/materials', { ma: nfc, ten: 'trùng', dvt: 'x' })).status, 400, 'NFC và NFD là cùng một mã');
    // rất dài: cắt đúng ngưỡng, không lỗi
    const long = await srv.ok('POST', '/api/cost-slips', slip({ header: { soPhieu: 'P'.repeat(500) }, lines: [{ maHM: c.HM_VL, dienGiai: 'D'.repeat(100000), soLuong: 1, donGia: 1, ghiChu: 'G'.repeat(100000) }] }));
    const ll = (await srv.db()).costs.find((x) => x.phieuId === long.phieuId);
    assert.deepEqual([ll.dienGiai.length, ll.ghiChu.length, ll.soPhieu.length], [1000, 1000, 60]);
  } finally { await srv.stop(); }
});

test('D3.3 bấm lưu hai lần liên tiếp (gọi đồng thời) không làm hỏng dữ liệu; mỗi lần gọi là một phiếu độc lập, tổng đúng', async () => {
  const srv = await startServer({});
  try {
    const c = await setup(srv);
    const body = slip({ lines: [{ maVT: 'XM', soLuong: 2, donGia: 100000, maHM: c.HM_VL }] });
    const rs = await Promise.all([srv.call('POST', '/api/cost-slips', body), srv.call('POST', '/api/cost-slips', body), srv.call('POST', '/api/cost-slips', body)]);
    assert.ok(rs.every((r) => r.status === 200));
    const ids = new Set(rs.map((r) => r.json.phieuId));
    assert.equal(ids.size, 3);
    const db = await srv.db();
    assert.equal(db.costs.length, 3);
    assert.equal(new Set(db.costs.map((x) => x.id)).size, 3);
    assert.equal(new Set(db.costs.map((x) => x.seq)).size, 3);
    assert.equal(KT.costSummary(db, {}, KT.buildCostLedger(db)).total, 600000);
  } finally { await srv.stop(); }
});

/* ---------------- D4 sửa / xóa / nhân bản ---------------- */

test('D3.4 nhập Thành tiền không cần SL, ĐG (khoản khoán): lưu SL 1 × ĐG = Thành tiền; SL + Thành tiền tính ĐG; ba ô lệch nhau bị từ chối; sửa dòng theo Thành tiền', async () => {
  const srv = await startServer({});
  try {
    const c = await setup(srv);
    const post = (lines) => srv.call('POST', '/api/cost-slips', slip({ lines: lines.map((l) => Object.assign({ maHM: c.HM_NC, dienGiai: 'Nhân công đợt 1' }, l)) }));
    const last = (r) => r.json.db.costs[r.json.db.costs.length - 1];
    // chỉ Thành tiền (số hoặc chuỗi như ô nhập), SL / ĐG trống hoặc không gửi
    for (const l of [{ thanhTien: 12500000 }, { soLuong: '', donGia: '', thanhTien: '12.500.000' }, { soLuong: null, donGia: null, thanhTien: '12,5tr' }]) {
      const r = await post([l]);
      assert.equal(r.status, 200, JSON.stringify(l) + ' ' + JSON.stringify(r.json));
      assert.equal(r.json.total, 12500000);
      const x = last(r);
      assert.deepEqual([x.soLuong, x.donGia, x.thanhTien], [1, 12500000, 12500000], JSON.stringify(l));
    }
    // SL + Thành tiền: ĐG = Thành tiền / SL tới 0,01, SL × ĐG ra đúng Thành tiền
    let r = await post([{ soLuong: 4, thanhTien: 1000000 }]);
    assert.deepEqual([last(r).soLuong, last(r).donGia, last(r).thanhTien], [4, 250000, 1000000]);
    r = await post([{ soLuong: 3, donGia: '', thanhTien: 160000 }]);
    assert.deepEqual([last(r).donGia, last(r).thanhTien], [53333.33, 160000]);
    assert.equal(KT.costAmount(last(r).soLuong, last(r).donGia), 160000);
    // đủ SL và ĐG: Thành tiền luôn = SL × ĐG, số gửi kèm bị bỏ qua (tương thích với bản ghi cũ gửi lại nguyên dòng)
    r = await post([{ soLuong: 2, donGia: 50000, thanhTien: 100001 }]);
    assert.equal(r.status, 200); assert.equal(last(r).thanhTien, 100000);
    // giao diện kiểm tra khớp khi người dùng gõ cả ba ô
    assert.match(KT.costFromInput(2, 50000, 100001, true).loi, /khác Số lượng × Đơn giá/);
    const errs = [
      [{ thanhTien: 0 }, /Thành tiền phải lớn hơn 0/], [{ thanhTien: -5 }, /âm/],
      [{ thanhTien: 'abc' }, /Thành tiền không hợp lệ/], [{ donGia: 5000, thanhTien: 10000 }, /thiếu Số lượng/], [{ soLuong: 1000, thanhTien: 1 }, /không chia đều/],
      [{ soLuong: '', donGia: '', thanhTien: '' }, /chưa có dòng hàng|cần Số lượng và Đơn giá, hoặc Thành tiền/], [{ soLuong: 0, thanhTien: 1000 }, /Số lượng phải lớn hơn 0/]
    ];
    for (const [l, re] of errs) { const x = await post([l]); assert.equal(x.status, 400, JSON.stringify(l)); assert.match(x.json.error, re, JSON.stringify(l)); }
    // tổng phiếu trộn dòng SL × ĐG và dòng khoán
    r = await post([{ soLuong: 10, donGia: 95000 }, { thanhTien: 3000000 }]);
    assert.equal(r.json.total, 950000 + 3000000);
    // sửa một dòng: đổi Thành tiền, giữ SL (máy chủ tính lại ĐG); dòng khoán SL 1 thì ĐG = Thành tiền
    const row = r.json.db.costs.find((x) => x.thanhTien === 950000);
    const put = (rec, patch) => srv.call('PUT', '/api/costs/' + rec.id, Object.assign({ ngay: rec.ngay, maCT: rec.maCT, maNha: rec.maNha, maNCC: rec.maNCC, maHM: rec.maHM, dienGiai: rec.dienGiai, soLuong: rec.soLuong, donGia: rec.donGia }, patch));
    let u = await put(row, { donGia: '', thanhTien: 1000000 });
    assert.equal(u.status, 200, JSON.stringify(u.json));
    let y = u.json.db.costs.find((x) => x.id === row.id);
    assert.deepEqual([y.soLuong, y.donGia, y.thanhTien], [10, 100000, 1000000]);
    const khoan = u.json.db.costs.find((x) => x.thanhTien === 3000000);
    u = await put(khoan, { donGia: '', thanhTien: 3200000 });
    y = u.json.db.costs.find((x) => x.id === khoan.id);
    assert.deepEqual([y.soLuong, y.donGia, y.thanhTien], [1, 3200000, 3200000]);
    // báo cáo tính đúng theo dòng khoán (SL × ĐG = Thành tiền ở mọi dòng)
    const db = await srv.db();
    assert.ok(db.costs.every((x) => KT.costAmount(x.soLuong, x.donGia) === x.thanhTien));
    assert.equal(KT.costSummary(db).total, raw(db).total);
  } finally { await srv.stop(); }
});

test('D4.1 sửa / xóa / nhân bản phiếu và dòng: báo cáo và công nợ khớp bản tính độc lập sau MỖI thao tác (250 thao tác ngẫu nhiên)', { timeout: 300000 }, async () => {
  const srv = await startServer({});
  try {
    const c = await setup(srv);
    const rnd = prng(77);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const HMS = [c.HM_VL, c.HM_ST, c.HM_NC, c.HM_BT];
    const randLine = () => pick([
      () => ({ maVT: pick(['XM', 'CAT', 'THEP']), soLuong: pick([1, 2, 2.5, 0.125, 10, '3,75']), donGia: pick([1000, '50k', 1234567, 99999.99, '1,5tr']), maHM: pick(HMS) }),
      () => ({ dienGiai: 'Công ' + Math.floor(rnd() * 100), soLuong: pick([1, 15, 7.5]), donGia: pick([300000, '250k']), maHM: c.HM_NC })
    ])();
    const randSlip = () => slip({ header: { ngay: '2026-0' + (1 + Math.floor(rnd() * 9)) + '-' + String(1 + Math.floor(rnd() * 28)).padStart(2, '0'), maCT: 'CT1', maNha: pick(['NHA1', 'NHA2', '']), maNCC: pick(['S1', 'S2', 'S3']) }, lines: Array.from({ length: 1 + Math.floor(rnd() * 4) }, randLine) });
    const check = async (label) => {
      const db = await srv.db();
      const R = raw(db);
      const S = KT.costSummary(db, {}, KT.buildCostLedger(db));
      assert.equal(S.total, R.total, label + ': tổng');
      assert.equal(S.soDong, db.costs.length, label + ': số dòng');
      KT.LOAI_CP.forEach((l) => assert.equal(S.byLoai[l], R.loai[l] || 0, label + ': loại ' + l));
      const itemsSum = [].concat(...S.groups.map((g) => g.items)).reduce((t, i) => t + i.total, 0);
      assert.equal(itemsSum, R.total, label + ': tổng hạng mục');
      assert.equal(S.groups.reduce((t, g) => t + g.total, 0), R.total, label + ': tổng nhóm');
      assert.equal(S.byMonth.reduce((t, m) => t + m.total, 0), R.total, label + ': tổng tháng');
      const D = KT.supplierDebt(db, {});
      ['s1', 's2', 's3'].forEach((m) => assert.equal(D.rows.find((r) => key(r.ma) === m).phatSinh, R.ncc[m] || 0, label + ': phát sinh ' + m));
      assert.equal(D.totalAll.phatSinh, R.total);
      assert.deepEqual(orphanErrors(db), [], label);
      return db;
    };
    for (let step = 0; step < 250; step++) {
      const db = await srv.db();
      const slips = Array.from(new Set(db.costs.map((x) => x.phieuId)));
      const op = rnd();
      let label;
      if (op < 0.3 || slips.length < 3) { label = 'thêm phiếu'; await srv.ok('POST', '/api/cost-slips', randSlip()); }
      else if (op < 0.5) { label = 'sửa phiếu'; await srv.ok('PUT', '/api/cost-slips/' + pick(slips), randSlip()); }
      else if (op < 0.62) { label = 'xóa phiếu'; const id = pick(slips); const n = db.costs.filter((x) => x.phieuId === id).length; const r = await srv.ok('DELETE', '/api/cost-slips/' + id); assert.equal(r.deleted, n); }
      else if (op < 0.75) { label = 'sửa dòng'; const l = pick(db.costs); const body = Object.assign({}, l, { soLuong: pick([1, 3, 4.5]), donGia: pick([2000, 75000]), ngay: pick([l.ngay, '2026-05-05']) }); const r = await srv.ok('PUT', '/api/costs/' + l.id, body); const nl = r.db.costs.find((x) => x.id === l.id); assert.equal(nl.thanhTien, X.thanhTien(nl.soLuong, nl.donGia)); }
      else if (op < 0.85) { label = 'xóa dòng'; const l = pick(db.costs); await srv.ok('DELETE', '/api/costs/' + l.id); }
      else if (op < 0.92) { label = 'nhân bản dòng'; const l = pick(db.costs); await srv.ok('POST', '/api/costs', Object.assign({}, l, { nguon: 'nhan ban' })); }
      else { label = 'xóa nhiều dòng'; const ids = [pick(db.costs).id, pick(db.costs).id]; const r = await srv.ok('POST', '/api/costs/delete', { ids }); assert.equal(r.deleted, new Set(ids).size); }
      await check('bước ' + step + ' ' + label);
    }
    // sửa đầu phiếu của 1 dòng trong phiếu nhiều dòng → tách phiếu
    const r = await srv.ok('POST', '/api/cost-slips', slip({ lines: [{ dienGiai: 'a', soLuong: 1, donGia: 10, maHM: c.HM_VL }, { dienGiai: 'b', soLuong: 1, donGia: 20, maHM: c.HM_VL }] }));
    const l = r.db.costs.filter((x) => x.phieuId === r.phieuId)[1];
    const r2 = await srv.ok('PUT', '/api/costs/' + l.id, Object.assign({}, l, { maNCC: 'S3' }));
    assert.notEqual(r2.phieuId, r.phieuId, 'đổi NCC của riêng 1 dòng thì tách thành phiếu khác');
    assert.equal(r2.db.costs.filter((x) => x.phieuId === r.phieuId).length, 1);
    // phiếu không tồn tại
    assert.equal((await srv.call('PUT', '/api/cost-slips/999999', randSlip())).status, 404);
    assert.equal((await srv.call('DELETE', '/api/cost-slips/999999')).status, 404);
  } finally { await srv.stop(); }
});

/* ---------------- D5 sổ chi phí: lọc ---------------- */

test('D5.1 sổ chi phí: lọc theo kỳ, công trình, nhà, nhóm, hạng mục, loại CP, NCC, vật tư + kết hợp + tìm kiếm; tổng cuối bảng = tổng các dòng hiển thị', () => {
  const db = readJsonFile(V2);
  const led = KT.buildCostLedger(db);
  const rnd = prng(5);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const uniq = (f) => Array.from(new Set(db.costs.map(f).filter(Boolean)));
  const pools = {
    ct: uniq((c) => c.maCT), nha: uniq((c) => c.maNha), hm: uniq((c) => c.maHM), ncc: uniq((c) => c.maNCC), vt: uniq((c) => c.maVT),
    loai: KT.LOAI_CP, nhom: db.costGroups.map((g) => g.ma), from: ['2026-05-20', '2026-06-01', '2026-07-01'], to: ['2026-06-30', '2026-07-21', '2026-08-31']
  };
  const searches = ['xi mang', 'BÊ TÔNG', 'cát', 'ứng', '1.250.000', 'xx-khac', 'vuong thinh', 'không có từ này zzz', '23.800.000', 'nhân công'];
  let combos = 0; let nonEmpty = 0;
  for (let i = 0; i < 400; i++) {
    const f = {};
    Object.keys(pools).forEach((k) => { if (rnd() < 0.3) f[k] = pick(pools[k]); });
    if (rnd() < 0.3) f.q = pick(searches);
    const res = KT.filterCosts(led, f);
    const R = raw(db, f);
    let expectRows = R.rows;
    if (f.q) {
      const qn = KT.normalizeText(f.q).trim();
      const sub = new Set(led.filter((r) => KT.normalizeText([r.maCT, r.maNha, r.tenHM, r.tenNhom, r.loaiCP, r.maVT, r.tenVT, r.dienGiai, r.maNCC, r.tenNCC, r.soPhieu, r.ghiChu, KT.fmtMoney(r.thanhTien), KT.fmtMoney(r.donGia)].join(' ')).includes(qn)).map((r) => r.id));
      expectRows = expectRows.filter((c) => sub.has(c.id));
    }
    assert.deepEqual(res.rows.map((r) => r.id).sort((a, b) => a - b), expectRows.map((r) => r.id).sort((a, b) => a - b), JSON.stringify(f));
    assert.equal(res.total, expectRows.reduce((t, c) => t + X.thanhTien(c.soLuong, c.donGia), 0), 'tổng cuối bảng ' + JSON.stringify(f));
    assert.equal(res.total, res.rows.reduce((t, r) => t + r.thanhTien, 0));
    assert.equal(Object.keys(res.byLoai).reduce((t, l) => t + res.byLoai[l], 0), res.total, 'tổng theo loại = tổng');
    const sl = res.rows.reduce((t, r) => t + r.soLuong, 0);
    assert.ok(Math.abs(res.tongSL - sl) < 1e-6, 'tổng số lượng');
    combos++; if (res.rows.length) nonEmpty++;
  }
  assert.ok(nonEmpty > 50, 'quá ít tổ hợp có dữ liệu: ' + nonEmpty);
  // bộ lọc "không gán" và phiếu
  const none = KT.filterCosts(led, { nha: '__none__' });
  assert.equal(none.rows.length, db.costs.filter((c) => !c.maNha).length);
  const one = led[0];
  assert.equal(KT.filterCosts(led, { phieu: one.phieuId }).rows.length, db.costs.filter((c) => c.phieuId === one.phieuId).length);
});

/* ---------------- D6 báo cáo: các cấp luôn khớp ---------------- */

test('D6.1 báo cáo: tổng nhóm = tổng hạng mục = tổng dòng = tổng theo Loại CP = tổng theo tháng, với mọi bộ lọc (dữ liệu sinh ngẫu nhiên có cả mã lạ)', () => {
  const rnd = prng(99);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const groups = ['G1', 'G2', 'G3'].map((ma, i) => ({ id: i + 1, ma, ten: ma + ' ten' }));
  const items = Array.from({ length: 12 }, (_, i) => ({ id: 10 + i, ma: 'H' + i, ten: 'Hạng mục ' + i, maNhom: i === 11 ? 'G_LA' : groups[i % 3].ma })); // H11 thuộc nhóm không có
  const db = { projects: [{ id: 50, ma: 'P1', ten: 'P1' }, { id: 51, ma: 'P2', ten: 'P2' }], houses: [{ id: 60, ma: 'N1', maCT: 'P1', ten: 'N1' }], costGroups: groups, costItems: items, materials: [{ id: 70, ma: 'V1', ten: 'V1', dvt: 'x' }],
    suppliers: [{ id: 80, ma: 'S1', ten: 'S1' }, { id: 81, ma: 'S2', ten: 'S2' }], costs: [], entries: [] };
  for (let i = 0; i < 700; i++) {
    db.costs.push({ id: 1000 + i, seq: i + 1, phieuId: 500 + Math.floor(i / 3), ngay: '2026-' + String(1 + Math.floor(rnd() * 12)).padStart(2, '0') + '-' + String(1 + Math.floor(rnd() * 28)).padStart(2, '0'),
      maCT: pick(['P1', 'P1', 'P2', 'P_LA']), maNha: pick(['', 'N1', 'N_LA']), maHM: pick(items.map((x) => x.ma).concat(['H_LA', ''])), loaiCP: pick(KT.LOAI_CP), maVT: pick(['', 'V1', 'V_LA']),
      dienGiai: 'd' + i, soLuong: Math.round(rnd() * 100000) / 10000 + 0.0001, donGia: Math.floor(rnd() * 5e6) + (rnd() < 0.3 ? rnd() : 0), maNCC: pick(['S1', 'S2', 'S_LA']), soPhieu: '' });
    const c = db.costs[i]; c.donGia = Math.round(c.donGia * 100) / 100; c.thanhTien = X.thanhTien(c.soLuong, c.donGia);
  }
  const filters = [{}, { ct: 'P1' }, { ct: 'P2', nha: 'N1' }, { loai: 'Vật tư' }, { ncc: 'S2' }, { from: '2026-03-01', to: '2026-08-31' }, { ct: 'P1', loai: 'Nhân công', ncc: 'S1', from: '2026-02-01' }, { to: '2026-01-31' }];
  filters.forEach((f) => {
    const S = KT.costSummary(db, f, KT.buildCostLedger(db));
    const R = raw(db, f);
    const itemsSum = [].concat(...S.groups.map((g) => g.items)).reduce((t, i) => t + i.total, 0);
    const itemCount = [].concat(...S.groups.map((g) => g.items)).reduce((t, i) => t + i.soDong, 0);
    const name = JSON.stringify(f);
    assert.equal(S.total, R.total, 'tổng ' + name);
    assert.equal(itemsSum, R.total, 'tổng hạng mục ' + name);
    assert.equal(S.groups.reduce((t, g) => t + g.total, 0), R.total, 'tổng nhóm ' + name);
    assert.equal(S.groups.reduce((t, g) => t + g.soDong, 0), R.rows.length, 'số dòng nhóm ' + name);
    assert.equal(itemCount, R.rows.length);
    assert.equal(S.soDong, R.rows.length);
    assert.equal(KT.LOAI_CP.reduce((t, l) => t + S.byLoai[l], 0), R.total, 'tổng loại ' + name);
    KT.LOAI_CP.forEach((l) => assert.equal(S.byLoai[l], R.loai[l] || 0, l + ' ' + name));
    assert.equal(S.byMonth.reduce((t, m) => t + m.total, 0), R.total, 'tổng tháng ' + name);
    assert.equal(S.byMonth.length ? S.byMonth[S.byMonth.length - 1].luyKe : 0, R.total, 'lũy kế cuối ' + name);
    S.byMonth.forEach((m) => assert.equal(m.total, R.thang[m.thang] || 0, 'tháng ' + m.thang));
    // từng hạng mục / nhóm khớp bản độc lập
    [].concat(...S.groups.map((g) => g.items)).forEach((i) => { if (i.inCatalog) assert.equal(i.total, R.hm[key(i.ma)] || 0, 'hạng mục ' + i.ma + ' ' + name); });
    S.groups.forEach((g) => { if (g.inCatalog) assert.equal(g.total, g.items.reduce((t, i) => t + i.total, 0)); });
    // sổ chi phí lọc cùng bộ lọc cho cùng tổng
    assert.equal(KT.filterCosts(KT.buildCostLedger(db), f).total, R.total, 'sổ = báo cáo ' + name);
  });
  // hạng mục thuộc nhóm không tồn tại / dòng không có hạng mục không biến mất khỏi tổng
  const S0 = KT.costSummary(db, {}, KT.buildCostLedger(db));
  assert.ok(S0.groups.some((g) => g.ma === '__khongnhom' && g.total > 0), 'nhóm "Hạng mục chưa có nhóm" phải hiện');
  assert.ok(S0.groups.some((g) => g.ma === '__khonghm' && g.total > 0), 'nhóm "Chưa có hạng mục" phải hiện');
  assert.equal(KT.costCatalogCheck(db).ok, false);
});

test('D6.2 công nợ NCC và công nợ theo công trình: tổng các cấp khớp; trạng thái Còn nợ / Ứng dư / Đã tất toán', () => {
  const rnd = prng(3);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const db = { projects: [{ id: 1, ma: 'P1', ten: 'P1' }, { id: 2, ma: 'P2', ten: 'P2' }, { id: 3, ma: 'P3', ten: 'P3' }], suppliers: ['S1', 'S2', 'S3', 'S4'].map((m, i) => ({ id: 10 + i, ma: m, ten: m })), costs: [], entries: [], costItems: [], costGroups: [], materials: [], houses: [] };
  for (let i = 0; i < 300; i++) db.costs.push({ id: 100 + i, ngay: '2026-0' + (1 + Math.floor(rnd() * 9)) + '-10', maCT: pick(['P1', 'P2']), maNCC: pick(['S1', 'S2', 'S3']), thanhTien: Math.floor(rnd() * 1e7), soLuong: 1, donGia: 0, loaiCP: 'Vật tư', maHM: '', maNha: '', maVT: '' });
  for (let i = 0; i < 200; i++) { const isThu = rnd() < 0.15; db.entries.push({ id: 1000 + i, ngay: '2026-0' + (1 + Math.floor(rnd() * 9)) + '-15', maDuAn: pick(['P1', 'P2', 'P3', '']), maNCC: pick(['S1', 'S2', 'S3', 'S4', '']), thu: isThu ? Math.floor(rnd() * 1e6) : 0, chi: isThu ? 0 : Math.floor(rnd() * 1.5e7), noiDung: 'x' }); }
  [{}, { ct: 'P1' }, { ct: 'P2' }, { to: '2026-05-31' }, { ct: 'P1', to: '2026-04-30' }].forEach((f) => {
    const D = KT.supplierDebt(db, f);
    const name = JSON.stringify(f);
    D.rows.forEach((r) => {
      const ps = db.costs.filter((c) => key(c.maNCC) === key(r.ma) && (!f.ct || key(c.maCT) === key(f.ct)) && (!f.to || c.ngay <= f.to)).reduce((t, c) => t + c.thanhTien, 0);
      const tra = db.entries.filter((e) => key(e.maNCC) === key(r.ma) && (!f.ct || key(e.maDuAn) === key(f.ct)) && (!f.to || e.ngay <= f.to)).reduce((t, e) => t + e.chi - e.thu, 0);
      assert.equal(r.phatSinh, ps, r.ma + ' phát sinh ' + name);
      assert.equal(r.daTra, tra, r.ma + ' đã trả ' + name);
      assert.equal(r.conLai, ps - tra);
      assert.equal(r.status, ps - tra > 0 ? 'no' : ps - tra < 0 ? 'du' : 'ok');
    });
    const all = D.sumRows(D.rows);
    assert.equal(all.conLai, all.phatSinh - all.daTra);
    assert.equal(all.conNo - all.ungDu, all.conLai, 'còn nợ − ứng dư = chênh lệch');
    assert.equal(D.total.conNo - D.total.ungDu, D.total.conLai);
  });
  const PS = KT.projectDebtSummary(db, { all: true });
  PS.rows.forEach((r) => {
    const D = KT.supplierDebt(db, { ct: r.ma });
    assert.equal(r.phatSinh, D.totalAll.phatSinh, r.ma);
    assert.equal(r.daTra, D.totalAll.daTra, r.ma);
    if (r.coChiPhi) { assert.equal(r.conNo, D.totalAll.conNo); assert.equal(r.ungDu, D.totalAll.ungDu); }
    else { assert.equal(r.conNo, 0); assert.equal(r.ungDu, 0); }
    const chiKhac = db.entries.filter((e) => key(e.maDuAn) === key(r.ma) && !e.maNCC).reduce((t, e) => t + e.chi - e.thu, 0);
    assert.equal(r.chiKhac, chiKhac);
  });
  assert.equal(PS.total.phatSinh, PS.rows.reduce((t, r) => t + r.phatSinh, 0));
  const noAll = KT.projectDebtSummary(db, {});
  assert.ok(noAll.rows.every((r) => r.coChiPhi), 'mặc định chỉ công trình có chi phí');
});

/* ---------------- D7 liên thông ---------------- */

test('D6.3 lọc công nợ theo mã NCC: chỉ một NCC (không phân biệt hoa thường), số khớp bản không lọc; theo công trình chỉ còn công trình NCC đó có phát sinh; xuất Excel theo NCC', async () => {
  const rnd = prng(7);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const db = { projects: [{ id: 1, ma: 'P1', ten: 'P1' }, { id: 2, ma: 'P2', ten: 'P2' }, { id: 3, ma: 'P3', ten: 'P3' }], suppliers: ['S1', 'S2', 'S3', 'S4'].map((m, i) => ({ id: 10 + i, ma: m, ten: 'NCC ' + m })), costs: [], entries: [], costItems: [], costGroups: [], materials: [], houses: [] };
  for (let i = 0; i < 200; i++) db.costs.push({ id: 100 + i, ngay: '2026-0' + (1 + Math.floor(rnd() * 9)) + '-10', maCT: pick(['P1', 'P2', 'P3']), maNCC: pick(['S1', 'S2', 's3']), thanhTien: Math.floor(rnd() * 1e7), soLuong: 1, donGia: 0, loaiCP: 'Vật tư', maHM: '', maNha: '', maVT: '' });
  // S2 không có chi phí ở P3; S4 chỉ có khoản trả, không chi phí
  db.costs = db.costs.filter((c) => !(c.maNCC === 'S2' && c.maCT === 'P3'));
  for (let i = 0; i < 150; i++) { const isThu = rnd() < 0.15; db.entries.push({ id: 1000 + i, ngay: '2026-0' + (1 + Math.floor(rnd() * 9)) + '-15', maDuAn: pick(['P1', 'P2', '']), maNCC: pick(['S1', 'S2', 'S3', 'S4', '']), thu: isThu ? Math.floor(rnd() * 1e6) : 0, chi: isThu ? 0 : Math.floor(rnd() * 1.5e7), noiDung: 'x' }); }
  for (const f of [{}, { ct: 'P1' }, { to: '2026-05-31' }, { ct: 'P2', to: '2026-06-30' }]) {
    const all = KT.supplierDebt(db, f);
    for (const ma of ['S1', 's2', 'S3', 'S4']) {
      const D = KT.supplierDebt(db, Object.assign({ ncc: ma }, f));
      const name = ma + ' ' + JSON.stringify(f);
      assert.equal(D.rows.length, 1, name);
      const goc = all.rows.find((r) => key(r.ma) === key(ma));
      assert.deepEqual(D.rows[0], goc, name);
      assert.deepEqual([D.total.phatSinh, D.total.daTra, D.total.conLai], [goc.phatSinh, goc.daTra, goc.conLai], 'tổng = dòng NCC ' + name);
      assert.deepEqual(D.totalAll, D.total, name);
    }
    assert.equal(KT.supplierDebt(db, Object.assign({ ncc: 'KHONG_CO' }, f)).rows.length, 0);
  }
  // theo công trình của một NCC: mỗi công trình = dòng NCC đó khi lọc công trình; bỏ công trình NCC không có phát sinh
  for (const ma of ['S1', 'S2', 'S4']) {
    const sum = KT.projectDebtSummary(db, { ncc: ma });
    for (const r of sum.rows) {
      const d = KT.supplierDebt(db, { ct: r.ma, ncc: ma }).rows[0];
      assert.equal(r.phatSinh, d.phatSinh, ma + ' ' + r.ma); assert.equal(r.daTra, d.daTra, ma + ' ' + r.ma);
      assert.equal(r.conNo, Math.max(d.conLai, 0)); assert.equal(r.ungDu, Math.max(-d.conLai, 0)); assert.equal(r.chiKhac, 0);
      assert.ok(d.soDongCP || d.soDongTT, 'chỉ công trình NCC có phát sinh / thanh toán');
    }
    const ps = db.costs.filter((c) => key(c.maNCC) === key(ma)).reduce((t, c) => t + c.thanhTien, 0);
    assert.equal(sum.total.phatSinh, ps, 'tổng chi phí của ' + ma);
  }
  assert.ok(!KT.projectDebtSummary(db, { ncc: 'S2' }).rows.some((r) => r.ma === 'P3'), 'S2 không có gì ở P3');
  assert.equal(KT.projectDebtSummary(db, { ncc: 'S4' }).total.phatSinh, 0);
  // xuất Excel qua API: chỉ dòng của NCC đã lọc
  const srv = await startServer({});
  try {
    const c = await setup(srv);
    await srv.ok('POST', '/api/cost-slips', slip({ lines: [{ maHM: c.HM_VL, dienGiai: 'a', soLuong: 1, donGia: 7000000 }] }));
    await srv.ok('POST', '/api/cost-slips', slip({ header: { maNCC: 'S2' }, lines: [{ maHM: c.HM_VL, dienGiai: 'b', soLuong: 1, donGia: 3000000 }] }));
    const r = await srv.call('GET', '/api/export/cost-debt?ncc=s2');
    assert.equal(r.status, 200);
    const wb = await X.loadWb(r.body);
    const ws = wb.getWorksheet('Cong_No_NCC');
    const ma = [];
    ws.eachRow((row, i) => { if (i >= 9 && typeof X.cellVal(row.getCell(1)) === 'number') ma.push(X.cellVal(row.getCell(2))); });
    assert.deepEqual(ma, ['S2']);
    const texts = [];
    ws.eachRow((row) => row.eachCell((cell) => { const v = X.cellVal(cell); if (typeof v === 'string') texts.push(v); }));
    assert.ok(texts.some((t) => /NCC: Nhà cung cấp S2/.test(t)), 'tiêu đề ghi NCC đang lọc');
  } finally { await srv.stop(); }
});

test('D6.4 lọc công nợ nhiều NCC + tình trạng: tổng = cộng các NCC đã chọn, khớp bản không lọc; xuất Excel ghi tên NCC lên đầu; Tổng hợp NCC (sổ thu chi) lọc NCC; 20.000 dòng < 1 giây', async () => {
  const rnd = prng(11);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const S6 = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
  const db = { projects: [{ id: 1, ma: 'P1', ten: 'P1' }, { id: 2, ma: 'P2', ten: 'P2' }], suppliers: S6.map((m, i) => ({ id: 10 + i, ma: m, ten: 'Nhà cung cấp ' + m })), costs: [], entries: [], costItems: [], costGroups: [], materials: [], houses: [] };
  for (let i = 0; i < 300; i++) db.costs.push({ id: 100 + i, ngay: '2026-0' + (1 + Math.floor(rnd() * 9)) + '-10', maCT: pick(['P1', 'P2']), maNCC: pick(S6), thanhTien: Math.floor(rnd() * 1e7), soLuong: 1, donGia: 0, loaiCP: 'Vật tư', maHM: '', maNha: '', maVT: '' });
  for (let i = 0; i < 200; i++) db.entries.push({ id: 1000 + i, ngay: '2026-0' + (1 + Math.floor(rnd() * 9)) + '-15', maDuAn: pick(['P1', 'P2', '']), maNCC: pick(S6), thu: 0, chi: Math.floor(rnd() * 2e7), noiDung: 'x' });
  const all = KT.supplierDebt(db, {});
  for (const f of [{}, { ct: 'P1' }, { to: '2026-05-31' }]) {
    const base = KT.supplierDebt(db, f);
    for (const sel of [['S1'], ['S1', 's3'], ['S2', 'S4', 'S6'], ['KHONG_CO'], []]) {
      const D = KT.supplierDebt(db, Object.assign({ ncc: sel }, f));
      const want = sel.length ? base.rows.filter((r) => sel.map(key).includes(key(r.ma))) : base.rows;
      assert.equal(D.rows.length, want.length, JSON.stringify(sel));
      assert.equal(D.totalAll.phatSinh, want.reduce((t, r) => t + r.phatSinh, 0));
      assert.equal(D.totalAll.daTra, want.reduce((t, r) => t + r.daTra, 0));
      assert.equal(D.totalAll.conLai, want.reduce((t, r) => t + r.conLai, 0));
    }
  }
  // cộng các bộ lọc một NCC = bộ lọc nhiều NCC
  const one = (m) => KT.supplierDebt(db, { ncc: [m] }).totalAll.conLai;
  assert.equal(KT.supplierDebt(db, { ncc: ['S1', 'S2', 'S3'] }).totalAll.conLai, one('S1') + one('S2') + one('S3'));
  assert.equal(S6.reduce((t, m) => t + one(m), 0), all.totalAll.conLai, 'cộng mọi NCC = tổng không lọc');
  // hiệu năng: 20.000 dòng chi phí + 5.000 dòng thu chi
  const big = Object.assign({}, db, { costs: [], entries: [] });
  for (let i = 0; i < 20000; i++) big.costs.push({ id: i + 1, ngay: '2026-01-01', maCT: 'P1', maNCC: 'S' + (1 + (i % 6)), thanhTien: 1000 + i, soLuong: 1, donGia: 0 });
  for (let i = 0; i < 5000; i++) big.entries.push({ id: 30000 + i, ngay: '2026-01-02', maDuAn: 'P1', maNCC: 'S' + (1 + (i % 6)), thu: 0, chi: 500 });
  const t0 = process.hrtime.bigint();
  const B = KT.supplierDebt(big, { ncc: ['S1', 'S4'] });
  KT.projectDebtSummary(big, { ncc: ['S1', 'S4'] });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log('# Lọc công nợ 2 NCC trên 20.000 dòng chi phí: ' + ms.toFixed(1) + ' ms');
  assert.ok(ms < 1000, 'lọc công nợ dưới 1 giây (' + ms + ' ms)');
  assert.equal(B.rows.length, 2);
  // qua API: xuất Excel công nợ nhiều NCC + tình trạng, và Tổng hợp NCC lọc NCC
  const srv = await startServer({});
  try {
    const c = await setup(srv);
    await srv.ok('POST', '/api/cost-slips', slip({ lines: [{ maHM: c.HM_VL, dienGiai: 'a', soLuong: 1, donGia: 7000000 }] }));
    await srv.ok('POST', '/api/cost-slips', slip({ header: { maNCC: 'S2' }, lines: [{ maHM: c.HM_VL, dienGiai: 'b', soLuong: 1, donGia: 3000000 }] }));
    await srv.ok('POST', '/api/cost-slips', slip({ header: { maNCC: 'S3' }, lines: [{ maHM: c.HM_VL, dienGiai: 'c', soLuong: 1, donGia: 1000000 }] }));
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-11', maNCC: 'S3', maDuAn: 'CT1', chi: 1000000, noiDung: 'trả đủ S3' });
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-11', maNCC: 'S1', chi: 200000, noiDung: 'trả S1' });
    const sheet = async (url, name) => {
      const r = await srv.call('GET', url);
      assert.equal(r.status, 200, url);
      const wb = await X.loadWb(r.body);
      const ws = wb.getWorksheet(name);
      const codes = []; const texts = [];
      ws.eachRow((row, i) => { row.eachCell((cell) => { const v = X.cellVal(cell); if (typeof v === 'string') texts.push(v); }); if (i >= 8) { const v = X.cellVal(row.getCell(name === 'Cong_No_NCC' ? 2 : 1)); if (/^S\d$/.test(v)) codes.push(v); } });
      return { codes, texts };
    };
    let x = await sheet('/api/export/cost-debt?ncc=S2&ncc=s3', 'Cong_No_NCC');
    assert.deepEqual(x.codes.sort(), ['S2', 'S3']);
    assert.ok(x.texts.some((t) => /NCC: Nhà cung cấp S2, Nhà cung cấp S3/.test(t)), 'tiêu đề ghi tên các NCC đang lọc');
    x = await sheet('/api/export/cost-debt?ncc=S2&ncc=S3&tt=no', 'Cong_No_NCC');
    assert.deepEqual(x.codes, ['S2'], 'S3 đã tất toán bị ẩn khi chỉ lấy NCC còn nợ');
    assert.ok(x.texts.some((t) => /Chỉ NCC còn nợ/.test(t)));
    x = await sheet('/api/export/suppliers?nccs=S1&nccs=S3', 'Tong_Hop_NCC');
    assert.deepEqual(x.codes.sort(), ['S1', 'S3']);
    assert.ok(x.texts.some((t) => /NCC: Nhà cung cấp S1, Nhà cung cấp S3/.test(t)));
  } finally { await srv.stop(); }
});

test('D7.1 liên thông: trả NCC ở sổ thu chi làm công nợ giảm đúng số tiền; thu lại làm tăng; không có mã NCC thì không ảnh hưởng; tồn quỹ cũ không bị đổi bởi chi phí', async () => {
  const srv = await startServer({});
  try {
    const c = await setup(srv);
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-01', noiDung: 'Nhận tiền quỹ', thu: '500tr' });
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-02', noiDung: 'Chi linh tinh', chi: 1234567 });
    const cash = async () => { const d = await srv.db(); const f = KT.filterLedger(KT.buildLedger(d), {}); return { ton: f.tonCuoiKy, thu: f.tongThu, chi: f.tongChi, rows: d.entries.length }; };
    const cash0 = await cash();
    await srv.ok('POST', '/api/cost-slips', slip({ header: { ngay: '2026-09-05' }, lines: [{ maVT: 'XM', soLuong: 100, donGia: 90000, maHM: c.HM_VL }] })); // S1, CT1: 9.000.000
    await srv.ok('POST', '/api/cost-slips', slip({ header: { ngay: '2026-09-06', maNCC: 'S2' }, lines: [{ dienGiai: 'Công', soLuong: 10, donGia: 300000, maHM: c.HM_NC }] })); // S2: 3.000.000
    assert.deepEqual(await cash(), cash0, 'nhập chi phí không được đổi sổ quỹ / tồn quỹ');
    const debt = async (ma, ct) => { const d = await srv.db(); return KT.supplierDebt(d, { ct }).rows.find((r) => r.ma === ma); };
    let d = await debt('S1');
    assert.deepEqual([d.phatSinh, d.daTra, d.conLai, d.status], [9000000, 0, 9000000, 'no']);
    // trả một phần qua sổ thu chi
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-10', noiDung: 'Trả xi măng đợt 1', chi: '4tr', maNCC: 'S1', maDuAn: 'CT1' });
    d = await debt('S1'); assert.deepEqual([d.daTra, d.conLai, d.status], [4000000, 5000000, 'no']);
    // trả thêm không ghi dự án: vẫn tính ở mức NCC, nhưng không tính ở mức công trình
    const e2 = await srv.ok('POST', '/api/entries', { ngay: '2026-09-11', noiDung: 'Trả đợt 2 (không ghi dự án)', chi: 1000000, maNCC: 'S1' });
    d = await debt('S1'); assert.equal(d.conLai, 4000000);
    d = await debt('S1', 'CT1'); assert.equal(d.conLai, 5000000, 'theo công trình chỉ tính khoản ghi đúng dự án');
    // NCC thu lại tiền (hoàn) → nợ tăng
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-12', noiDung: 'NCC hoàn lại', thu: 500000, maNCC: 'S1', maDuAn: 'CT1' });
    d = await debt('S1'); assert.equal(d.conLai, 4500000);
    // trả dư → ứng dư; trả đúng → tất toán
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-13', noiDung: 'Trả nốt', chi: 4500000, maNCC: 'S1' });
    d = await debt('S1'); assert.deepEqual([d.conLai, d.status], [0, 'ok']);
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-14', noiDung: 'Ứng thêm', chi: 100000, maNCC: 'S1' });
    d = await debt('S1'); assert.deepEqual([d.conLai, d.status], [-100000, 'du']);
    // sửa / xóa khoản trả → công nợ cập nhật
    const db1 = await srv.db();
    const e = db1.entries.find((x) => x.noiDung === 'Trả xi măng đợt 1');
    await srv.ok('PUT', '/api/entries/' + e.id, Object.assign({}, e, { chi: 3000000 }));
    d = await debt('S1'); assert.equal(d.conLai, -100000 + 1000000);
    await srv.ok('DELETE', '/api/entries/' + e2.id);
    d = await debt('S1'); assert.equal(d.conLai, -100000 + 1000000 + 1000000);
    // đổi mã NCC ở khoản trả → chuyển công nợ sang NCC khác
    const e3 = (await srv.db()).entries.find((x) => x.noiDung === 'Ứng thêm');
    await srv.ok('PUT', '/api/entries/' + e3.id, Object.assign({}, e3, { maNCC: 'S2' }));
    d = await debt('S2'); assert.equal(d.conLai, 3000000 - 100000);
    // khoản chi không ghi NCC không ảnh hưởng công nợ
    const total0 = KT.supplierDebt(await srv.db(), {}).totalAll;
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-20', noiDung: 'Chi chung', chi: 999999 });
    assert.deepEqual(KT.supplierDebt(await srv.db(), {}).totalAll, total0);
    // lọc "đến ngày"
    const asOf = KT.supplierDebt(await srv.db(), { to: '2026-09-05' }).rows.find((r) => r.ma === 'S1');
    assert.deepEqual([asOf.phatSinh, asOf.daTra], [9000000, 0]);
    // tổng quỹ = thu − chi, không phụ thuộc chi phí công trình
    const cashNow = await cash();
    assert.equal(cashNow.ton, cashNow.thu - cashNow.chi);
  } finally { await srv.stop(); }
});

/* ---------------- D8 giá vật tư ---------------- */

test('D8.1 thống kê giá vật tư và lịch sử đơn giá khớp bản tính độc lập (dữ liệu thật)', () => {
  const db = readJsonFile(V2);
  const stats = KT.materialStats(db, {});
  const byVt = new Map();
  db.costs.filter((c) => c.maVT).forEach((c) => { const k = key(c.maVT); if (!byVt.has(k)) byVt.set(k, []); byVt.get(k).push(c); });
  assert.equal(stats.length, byVt.size);
  stats.forEach((s) => {
    const rows = byVt.get(key(s.ma));
    const tien = rows.reduce((t, c) => t + X.thanhTien(c.soLuong, c.donGia), 0);
    assert.equal(s.soLan, rows.length, s.ma);
    assert.equal(s.tongTien, tien, s.ma);
    assert.equal(s.min, Math.min.apply(null, rows.map((c) => c.donGia)));
    assert.equal(s.max, Math.max.apply(null, rows.map((c) => c.donGia)));
    assert.ok(Math.abs(s.tongSL - rows.reduce((t, c) => t + c.soLuong, 0)) < 1e-6);
    const sorted = rows.slice().sort((a, b) => (a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : a.seq - b.seq));
    assert.equal(s.last, sorted[sorted.length - 1].donGia, s.ma + ' giá gần nhất');
    const hist = KT.priceHistory(db, s.ma);
    assert.equal(hist.length, rows.length);
    // chênh lệch so với lần mua trước của cùng NCC
    const prev = new Map();
    hist.forEach((h) => { const k = key(h.maNCC); assert.equal(h.chenhLech, prev.has(k) ? h.donGia - prev.get(k) : null); prev.set(k, h.donGia); });
    if (s.tongSL) assert.equal(s.binhQuan, Math.round(tien / s.tongSL));
  });
});

test('D9 số âm (phiếu trả hàng / giảm trừ): giao diện và API từ chối; nếu có từ file Excel thì tính tròn như ROUND của Excel và các tổng vẫn khớp', async () => {
  // làm tròn đối xứng như Excel
  assert.equal(KT.costAmount(-2.5, 1.5), -4);
  assert.equal(KT.costAmount(2.5, 1.5), 4);
  assert.equal(KT.costAmount(-1.4, 1), -1);
  assert.equal(KT.costAmount(-3, -2.5), 8);
  assert.equal(KT.costAmount(0, -5), 0);
  assert.ok(Object.is(KT.costAmount(0, -5), 0), 'không được ra -0');
  // nhập từ Excel có dòng giảm trừ
  const wb = new X.ExcelJS.Workbook();
  const ct = wb.addWorksheet('DM_CONGTRINH'); ct.addRow(['Mã CT', 'Tên công trình']); ct.addRow(['CT9', 'CT 9']);
  const hm = wb.addWorksheet('DM_HANGMUC'); hm.addRow(['Mã HM', 'Nhóm CP', 'Hạng mục', 'Mã nhóm']); hm.addRow(['H1', 'N', 'Bê tông', 'N1']);
  const ng = wb.addWorksheet('DM_NHOM'); ng.addRow(['Mã nhóm', 'Tên nhóm CP']); ng.addRow(['N1', 'N']);
  const nk = wb.addWorksheet('NHATKYCHUNG');
  nk.addRow(['Ngày', 'Mã CT', 'Mã Nhà', 'Hạng mục', 'Nhóm CP', 'Loại CP', 'Mã VT', 'Tên vật tư', 'ĐVT', 'Diễn giải / Quy cách', 'Số lượng', 'Đơn giá', 'Thành tiền', 'Mã NCC']);
  nk.addRow([new Date('2026-09-01T00:00:00Z'), 'CT9', '', 'Bê tông', '', 'Vật tư', '', '', '', 'mua', 10, 100000, null, 'NCC_A']);
  nk.addRow([new Date('2026-09-02T00:00:00Z'), 'CT9', '', 'Bê tông', '', 'Vật tư', '', '', '', 'trả lại hàng', -2.5, 100001.5, null, 'NCC_A']);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const srv = await startServer({});
  try {
    const r = await srv.call('POST', '/api/import?mode=merge', buf);
    assert.equal(r.status, 200, r.body.toString().slice(0, 300));
    assert.match(r.json.warnings.join(' '), /số âm/);
    const db = await srv.db();
    const neg = db.costs.find((c) => c.dienGiai === 'trả lại hàng');
    assert.equal(neg.thanhTien, X.thanhTien(2.5, 100001.5) * -1, 'âm đối xứng');
    const S = KT.costSummary(db, {}, KT.buildCostLedger(db));
    assert.equal(S.total, 1000000 + neg.thanhTien);
    assert.equal(KT.supplierDebt(db, {}).rows.find((x) => x.ma === 'NCC_A').phatSinh, S.total);
    // xuất Excel: công thức của Excel cho cùng kết quả
    const ex = (await srv.call('GET', '/api/export/costs')).body;
    if (X.findSoffice()) {
      const cmp = await X.recalcCompare(ex, 'neg');
      assert.deepEqual(cmp.mismatches.slice(0, 5), [], 'LibreOffice tính lại phải khớp (kể cả dòng âm)');
    }
    // API và giao diện không cho nhập âm
    const bad = await srv.call('POST', '/api/costs', { ngay: '2026-09-03', maCT: 'CT9', maNCC: 'NCC_A', maHM: 'H1', dienGiai: 'x', soLuong: -1, donGia: 5 });
    assert.equal(bad.status, 400); assert.match(bad.json.error, /âm/);
  } finally { await srv.stop(); }
});
