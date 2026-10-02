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
