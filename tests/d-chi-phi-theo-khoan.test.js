'use strict';
/* D-K. Dòng chi phí THEO KHOẢN (chỉ có Thành tiền — nhân công, phí, hóa đơn bán lẻ chỉ ghi tổng): Số lượng và Đơn giá để TRỐNG,
 * không tự gán SL 1 × ĐG = Thành tiền. Kiểm: lưu, xuất Excel (ô Thành tiền là số, không phải công thức SL × ĐG), nhập lại không
 * nhân đôi, nhập thay thế giữ nguyên, thống kê / gợi ý giá vật tư bỏ qua dòng khoán. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { KT, startServer, readStored } = require('./helpers');
const X = require('./excel-helpers');

async function setup(srv) {
  await srv.ok('POST', '/api/projects', { ma: 'CT1', ten: 'Công trình 1' });
  await srv.ok('POST', '/api/suppliers', { ma: 'MINH', ten: 'Cửa hàng điện nước Minh' });
  const db = await srv.db();
  const hm = (ten) => db.costItems.find((i) => i.ten === ten).ma;
  await srv.ok('POST', '/api/materials', { ma: 'ONG90', ten: 'Ống PVC 90', dvt: 'cây', maHM: hm('Vật tư VLXD') });
  return { HM_VL: hm('Vật tư VLXD'), HM_NC: hm('Nhân công thợ nề') };
}

test('DK1 phiếu trộn dòng khoán và dòng SL × ĐG: lưu SL / ĐG trống; xuất Excel ghi thẳng Thành tiền; nhập lại (gộp) không nhân đôi; nhập thay thế giữ dòng khoán; thống kê giá bỏ qua dòng khoán', async () => {
  const src = await startServer({});
  let file;
  try {
    const c = await setup(src);
    const r = await src.call('POST', '/api/cost-slips', {
      header: { ngay: '2026-08-17', maCT: 'CT1', maNCC: 'MINH', maHM: c.HM_VL, soPhieu: 'HD-0817' },
      lines: [
        { dienGiai: 'Hóa đơn bán lẻ điện nước Minh 17/8 (chỉ ghi tổng)', thanhTien: '7.099.000' },
        { maVT: 'ONG90', dienGiai: 'ống 90', soLuong: 20, donGia: 265000 },
        { maVT: 'ONG90', dienGiai: 'ống 90 tiền xe', thanhTien: 150000 },
        { dienGiai: 'Nhân công đợt 1', maHM: c.HM_NC, thanhTien: '12,5tr' }
      ]
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.total, 7099000 + 5300000 + 150000 + 12500000);
    const st = readStored(src.dataDir).costs;
    const khoan = st.filter((x) => x.soLuong == null);
    assert.equal(khoan.length, 3);
    khoan.forEach((x) => { assert.equal(x.soLuong, null); assert.equal(x.donGia, null); assert.ok(KT.isKhoan(x)); });
    assert.ok(!st.some((x) => x.soLuong === 1), 'không có dòng nào bị tự gán SL 1');
    // thống kê giá vật tư: dòng khoán (tiền xe 150.000) không làm sai giá; tổng tiền vẫn đủ
    const db = await src.db();
    const ms = KT.materialStats(db).find((m) => m.ma === 'ONG90');
    assert.deepEqual([ms.soLan, ms.tongSL, ms.tongTien, ms.min, ms.max, ms.last, ms.binhQuan], [2, 20, 5450000, 265000, 265000, 265000, 265000]);
    assert.equal(KT.priceHistory(db, 'ONG90').length, 1);
    assert.equal(KT.lastPrice(db, 'ONG90', 'MINH').donGia, 265000);
    assert.equal(KT.anomalies(db).items.filter((a) => a.loai === 'tien').length, 0, 'dòng khoán không bị báo thiếu số lượng');
    // xuất Excel: dòng khoán có Thành tiền là số; dòng SL × ĐG vẫn là công thức
    file = (await src.call('GET', '/api/export/costs')).body;
    const wb = await X.loadWb(file);
    const nk = wb.getWorksheet('NHATKYCHUNG');
    const rows = [];
    nk.eachRow((row, i) => { if (i > 1) rows.push({ sl: row.getCell(11).value, dg: row.getCell(12).value, tt: row.getCell(13).value, dien: row.getCell(10).value }); });
    const hd = rows.find((x) => /Hóa đơn bán lẻ/.test(x.dien));
    assert.equal(hd.tt, 7099000, 'Thành tiền ghi thẳng số');
    assert.ok(hd.sl == null || hd.sl === '', 'Số lượng trống');
    assert.ok(hd.dg == null || hd.dg === '', 'Đơn giá trống');
    const ong = rows.find((x) => x.dien === 'ống 90');
    assert.ok(ong.tt && ong.tt.formula, 'dòng SL × ĐG giữ công thức');
    // nhập lại chính file đó (gộp thêm): không thêm dòng nào
    const m = await src.call('POST', '/api/import?mode=merge', file);
    assert.equal(m.status, 200, JSON.stringify(m.json).slice(0, 300));
    assert.equal(m.json.result.added.costs, 0, 'không nhân đôi dòng khoán');
    assert.equal((await src.db()).costs.length, 4);
  } finally { await src.stop(); }
  // nhập thay thế vào máy khác: dòng khoán giữ SL / ĐG trống, tổng tiền khớp
  const dst = await startServer({});
  try {
    const r = await dst.call('POST', '/api/import?mode=replace', file);
    assert.equal(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    const costs = readStored(dst.dataDir).costs;
    assert.equal(costs.length, 4);
    assert.equal(costs.reduce((t, x) => t + x.thanhTien, 0), 7099000 + 5300000 + 150000 + 12500000);
    const hd = costs.find((x) => /Hóa đơn bán lẻ/.test(x.dienGiai));
    assert.deepEqual([hd.soLuong, hd.donGia, hd.thanhTien], [null, null, 7099000]);
    assert.ok(!(r.json.warnings || []).some((w) => /Số lượng 1/.test(w)), 'không còn cảnh báo "lấy Số lượng 1"');
  } finally { await dst.stop(); }
});

// Dòng "cũ": gõ tay SL 1 × ĐG = Thành tiền (giống dữ liệu do bản trước lưu khi chỉ nhập Thành tiền)
async function taoDuLieuCu(srv, c) {
  const r = await srv.call('POST', '/api/cost-slips', {
    header: { ngay: '2026-07-10', maCT: 'CT1', maNCC: 'MINH', maHM: c.HM_VL, soPhieu: 'CU-1' },
    lines: [
      { dienGiai: 'Tiền xe chở vật tư', soLuong: 1, donGia: 600000 },
      { dienGiai: 'Nhân công khoán', maHM: c.HM_NC, soLuong: 1, donGia: 8000000 },
      { maVT: 'ONG90', dienGiai: '1 cây ống mua thật', soLuong: 1, donGia: 265000 },
      { maVT: 'ONG90', dienGiai: 'ống 90', soLuong: 10, donGia: 265000 }
    ]
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const r2 = await srv.call('POST', '/api/cost-slips', {
    header: { ngay: '2026-06-05', maCT: 'CT1', maNCC: 'MINH', maHM: c.HM_VL, soPhieu: 'CU-2' },
    lines: [{ dienGiai: 'Phí tháng 6 (tháng đã khóa)', soLuong: 1, donGia: 300000 }]
  });
  assert.equal(r2.status, 200);
}

test('DK2 chuyển dòng khoán cũ (SL 1 × ĐG = Thành tiền) sang theo khoản: chỉ dòng được chọn, bỏ qua tháng đã khóa, sao lưu trước, ghi nhật ký; tổng tiền không đổi; chỉ Chủ khi đăng nhập bật', async () => {
  const { batDangNhap, taoVaDangNhap, goi } = require('./auth-helpers');
  const srv = await startServer({});
  try {
    const c = await setup(srv);
    await taoDuLieuCu(srv, c);
    await srv.ok('POST', '/api/locks', { thang: '2026-06' });
    let db = await srv.db();
    const tong0 = db.costs.reduce((t, x) => t + x.thanhTien, 0);
    const cu = KT.khoanCu(db);
    assert.deepEqual(cu.map((x) => x.dienGiai).sort(), ['1 cây ống mua thật', 'Nhân công khoán', 'Phí tháng 6 (tháng đã khóa)', 'Tiền xe chở vật tư']);
    // bỏ chọn dòng mua thật 1 cây ống; chọn cả dòng tháng khóa và một dòng không phải dạng cũ (ống 10 cây)
    const chon = db.costs.filter((x) => x.dienGiai !== '1 cây ống mua thật').map((x) => x.id);
    const backups0 = (await srv.ok('GET', '/api/backups')).backups.length;
    const r = await srv.ok('POST', '/api/costs/theo-khoan', { ids: chon });
    assert.deepEqual([r.doi, r.boQuaKhoa, r.khongHop], [2, 1, 1]);
    assert.match(r.backup, /truoc-chuyen-theo-khoan/);
    assert.ok((await srv.ok('GET', '/api/backups')).backups.length > backups0);
    const st = readStored(srv.dataDir).costs;
    const g = (d) => st.find((x) => x.dienGiai === d);
    assert.deepEqual([g('Tiền xe chở vật tư').soLuong, g('Tiền xe chở vật tư').donGia, g('Tiền xe chở vật tư').thanhTien], [null, null, 600000]);
    assert.deepEqual([g('Nhân công khoán').soLuong, g('Nhân công khoán').donGia], [null, null]);
    assert.deepEqual([g('1 cây ống mua thật').soLuong, g('1 cây ống mua thật').donGia], [1, 265000], 'dòng không chọn giữ nguyên');
    assert.deepEqual([g('Phí tháng 6 (tháng đã khóa)').soLuong, g('Phí tháng 6 (tháng đã khóa)').donGia], [1, 300000], 'tháng đã khóa giữ nguyên');
    assert.deepEqual([g('ống 90').soLuong, g('ống 90').donGia, g('ống 90').thanhTien], [10, 265000, 2650000]);
    assert.equal(st.reduce((t, x) => t + x.thanhTien, 0), tong0, 'tổng tiền không đổi');
    db = await srv.db();
    assert.equal(KT.khoanCu(db).length, 2);
    const nk = (await srv.ok('GET', '/api/audit?limit=50')).items || (await srv.ok('GET', '/api/audit?limit=50')).entries || [];
    assert.ok(JSON.stringify(nk).includes('theo khoản'), 'nhật ký ghi việc chuyển');
    // chạy lại: không còn gì để đổi ở các dòng đã chuyển
    const r2 = await srv.ok('POST', '/api/costs/theo-khoan', { ids: chon });
    assert.equal(r2.doi, 0);
    // đăng nhập bật: Kế toán không được, Chủ được
    const { cookie } = await batDangNhap(srv);
    const kt = await taoVaDangNhap(srv, cookie, 'ketoan1', 'ke-toan', 'kế toán mật khẩu 1');
    const id1 = db.costs.find((x) => x.dienGiai === '1 cây ống mua thật').id;
    assert.equal((await goi(srv, 'POST', '/api/costs/theo-khoan', { ids: [id1] }, kt.cookie)).status, 403);
    const ok2 = await goi(srv, 'POST', '/api/costs/theo-khoan', { ids: [id1] }, cookie);
    assert.equal(ok2.status, 200);
    assert.equal(ok2.json.doi, 1);
  } finally { await srv.stop(); }
});

test('DK3 nhập dữ liệu cũ: file Excel có dòng SL 1 × ĐG = Thành tiền → nhập thành dòng theo khoản (có cảnh báo); gộp file cũ vào dữ liệu chưa chuyển hoặc đã chuyển đều không nhân đôi', async () => {
  const src = await startServer({});
  let fileCu;
  try {
    const c = await setup(src);
    await taoDuLieuCu(src, c);
    fileCu = (await src.call('GET', '/api/export/costs')).body; // file xuất từ dữ liệu cũ: SL 1, ĐG = Thành tiền
    // gộp lại vào chính dữ liệu cũ (chưa chuyển): không thêm
    let m = await src.call('POST', '/api/import?mode=merge', fileCu);
    assert.equal(m.status, 200, JSON.stringify(m.json).slice(0, 300));
    assert.equal(m.json.result.added.costs, 0, 'không nhân đôi khi dữ liệu chưa chuyển');
    // chuyển hết rồi gộp lại file cũ: vẫn không thêm
    const db = await src.db();
    await src.ok('POST', '/api/costs/theo-khoan', { ids: KT.khoanCu(db).map((x) => x.id) });
    m = await src.call('POST', '/api/import?mode=merge', fileCu);
    assert.equal(m.json.result.added.costs, 0, 'không nhân đôi khi dữ liệu đã chuyển');
  } finally { await src.stop(); }
  const dst = await startServer({});
  try {
    const pv = await dst.call('POST', '/api/import?dryRun=1', fileCu);
    assert.equal(pv.status, 200);
    assert.ok(pv.json.preview.warnings.some((w) => /4 dòng ghi Số lượng 1 × Đơn giá = Thành tiền/.test(w)), JSON.stringify(pv.json.preview.warnings));
    const r = await dst.call('POST', '/api/import?mode=replace', fileCu);
    assert.equal(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    const st = readStored(dst.dataDir).costs;
    assert.equal(st.length, 5);
    assert.equal(st.filter((x) => x.soLuong == null && x.donGia == null).length, 4, 'mọi dòng SL 1 × ĐG = Thành tiền thành theo khoản');
    assert.deepEqual(st.filter((x) => x.soLuong != null).map((x) => [x.soLuong, x.donGia, x.thanhTien]), [[10, 265000, 2650000]]);
    assert.equal(st.reduce((t, x) => t + x.thanhTien, 0), 600000 + 8000000 + 265000 + 2650000 + 300000);
  } finally { await dst.stop(); }
});
