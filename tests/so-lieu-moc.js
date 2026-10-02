#!/usr/bin/env node
'use strict';
/*
 * "Số liệu mốc": mọi con số báo cáo chính (tồn quỹ, sổ thu chi, dự án, NCC, phiếu, chi phí theo loại/nhóm/hạng mục/tháng,
 * công nợ NCC, công nợ theo công trình, giá vật tư, phiếu nhập) tính từ một bộ dữ liệu.
 * Chụp một lần bằng mã TRƯỚC khi cải tiến nhóm 1 (tests/fixtures/moc-so-lieu-nhom1.json); ca N0 so lại bằng mã mới:
 * dữ liệu cũ chưa dùng tính năng mới thì mọi con số phải giống hệt.
 *   node tests/so-lieu-moc.js   → ghi lại file mốc (chỉ chạy khi cố ý chụp lại)
 */
const fs = require('fs');
const path = require('path');
const { startServer, KT } = require('./helpers');

function summarize(db) {
  const ledger = KT.buildLedger(db);
  const costLedger = KT.buildCostLedger(db);
  const out = {
    tonQuy: ledger.length ? ledger[ledger.length - 1].ton : 0,
    soDongSo: ledger.length,
    locSo: KT.filterLedger(ledger, {}),
    locSoThang8: KT.filterLedger(ledger, { from: '2026-08-01', to: '2026-08-31' }),
    duAn: KT.projectSummary(db, {}),
    ncc: KT.supplierSummary(db, {}),
    phieu: KT.buildVouchers(db, ledger).map((v) => ({ soPhieu: v.soPhieu, loai: v.loai, soTien: v.soTien, soDong: v.soDong, nguoiNhan: v.nguoiNhan, lyDo: v.lyDo })),
    chiPhi: KT.costSummary(db, {}, costLedger),
    congNoNCC: KT.supplierDebt(db, {}),
    congNoCongTrinh: KT.projectDebtSummary(db, {}),
    giaVatTu: KT.materialStats(db, {}),
    phieuNhap: KT.costSlips(db, costLedger).map((s) => ({ key: s.key, ngay: s.ngay, maCT: s.maCT, maNCC: s.maNCC, total: s.total, soDong: s.lines.length }))
  };
  // qua JSON để Map/Set/undefined so sánh được như nhau
  const o = JSON.parse(JSON.stringify(out));
  if (!(db.extPayments || []).length) boTruongNgoaiQuy(o.congNoNCC);
  if (!(db.soDuDauKy || []).length) boTruongDauKy(o);
  return o;
}

// Trường thêm sau mốc (số dư đầu kỳ NCC, lược đồ 7): dữ liệu không có số dư đầu kỳ thì phải là 0; kiểm tra rồi bỏ ra để so với mốc.
function boTruongDauKy(o) {
  const bo = (x, ten, keys) => keys.forEach((k) => {
    if (x[k] === undefined) return;
    if (x[k] !== 0) throw new Error(ten + ': ' + k + ' phải là 0 khi không có số dư đầu kỳ');
    delete x[k];
  });
  o.congNoNCC.rows.forEach((r) => bo(r, 'Công nợ ' + r.ma, ['dauKy', 'soDongDK']));
  ['total', 'totalAll'].forEach((k) => { if (o.congNoNCC[k]) bo(o.congNoNCC[k], 'Công nợ ' + k, ['dauKy']); });
  o.congNoCongTrinh.rows.forEach((r) => bo(r, 'Công nợ công trình ' + r.ma, ['dauKy']));
  if (o.congNoCongTrinh.total) bo(o.congNoCongTrinh.total, 'Công nợ công trình tổng', ['dauKy']);
}

// Trường thêm sau mốc (trả NCC từ nguồn khác, ngoài quỹ): dữ liệu không có khoản ngoài quỹ thì phải là 0 và "đã trả quỹ" = "đã trả";
// kiểm tra đúng như vậy rồi bỏ ra để so với mốc chụp trước khi có tính năng.
function boTruongNgoaiQuy(d) {
  d.rows.forEach((r) => {
    if (r.daTraNgoai !== 0 || r.soDongNgoai !== 0 || r.daTraQuy !== r.daTra) throw new Error('Công nợ ' + r.ma + ': trường ngoài quỹ sai khi không có khoản ngoài quỹ');
    delete r.daTraNgoai; delete r.daTraQuy; delete r.soDongNgoai;
  });
  ['total', 'totalAll'].forEach((k) => {
    if (!d[k]) return;
    if (d[k].daTraNgoai !== 0) throw new Error('Công nợ ' + k + ': daTraNgoai phải là 0');
    delete d[k].daTraNgoai;
  });
}

const FILE = path.join(__dirname, 'fixtures', 'moc-so-lieu-nhom1.json');
const SOURCES = { v1: 'ketoan-v1-goc.json', v2: 'ketoan-v2-hien-tai.json' };

async function capture() {
  const out = {};
  for (const [k, f] of Object.entries(SOURCES)) {
    const srv = await startServer({ seed: path.join(__dirname, 'fixtures', f) });
    try { out[k] = summarize(await srv.db()); } finally { await srv.stop(); }
  }
  return out;
}

module.exports = { summarize, capture, FILE, SOURCES };

if (require.main === module) {
  capture().then((o) => {
    fs.writeFileSync(FILE, JSON.stringify(o));
    console.log('Đã ghi ' + FILE + ': tồn quỹ v1 ' + o.v1.tonQuy + ', v2 ' + o.v2.tonQuy + ', tổng chi phí v2 ' + o.v2.chiPhi.total);
  }).catch((e) => { console.error(e); process.exit(1); });
}
