#!/usr/bin/env node
'use strict';
/*
 * Đối chiếu phần mềm với file Excel chi phí công trình THẬT (vd. ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm).
 *   node tests/doi-chieu-xlsm.js "đường dẫn tới file .xlsm hoặc .xlsx"
 *
 * Cách làm (không tin các ô công thức đã lưu sẵn trong file):
 *   (C) Tự cộng Số lượng × Đơn giá từng dòng của NHATKYCHUNG, gom theo Loại CP / Hạng mục / Nhóm / NCC;
 *       tiền đã trả từng NCC = chi − thu từ SO_QUY (cột Loại + Số tiền, hoặc cột Thu / Chi).
 *   (D) Nhập cùng file vào một kho dữ liệu tạm bằng chính bộ nhập của phần mềm (kèm SO_QUY) rồi lấy số của phần mềm.
 * In bảng đối chiếu; thoát mã 1 nếu có dòng lệch. Không đụng tới thư mục data/ thật.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const ExcelJS = require('exceljs');
const KT = require('../public/js/shared.js');
const { Store } = require('../lib/store');
const costImporter = require('../lib/costImporter');

const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.error('Cách dùng: node tests/doi-chieu-xlsm.js <file.xlsm|xlsx>'); process.exit(2); }

const norm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
const val = (c) => {
  let v = c.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) { if ('result' in v) v = v.result; else if (v.richText) v = v.richText.map((t) => t.text).join(''); else if (v.text) v = v.text; else v = null; }
  return v == null ? null : v;
};
const num = (v) => { if (typeof v === 'number') return v; if (v == null || v === '') return null; const n = KT.parseQty(String(v)); return isNaN(n) ? null : n; };
const money = (n) => KT.fmtMoney(n);
function tt(sl, dg) { // SL (4 số lẻ) × ĐG (2 số lẻ), làm tròn nửa lên, bằng BigInt
  return Number((BigInt(Math.round(sl * 10000)) * BigInt(Math.round(dg * 100)) * BigInt(2) + BigInt(1000000)) / BigInt(2000000));
}
function sheet(wb, name) { return wb.worksheets.find((w) => norm(w.name) === norm(name)); }
function headerOf(ws, must) {
  for (let r = 1; r <= Math.min(ws.rowCount, 12); r++) {
    const cols = new Map();
    ws.getRow(r).eachCell((c) => { cols.set(norm(val(c)), c.col); });
    const keys = Array.from(cols.keys());
    if (must.every((m) => keys.some((k) => k === m || k.startsWith(m)))) {
      return { row: r, col: (...names) => { for (const n of names) { const k = keys.find((x) => x === n) || keys.find((x) => x.startsWith(n)); if (k) return cols.get(k); } return 0; } };
    }
  }
  return null;
}

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  console.log('File: ' + file);
  console.log('Sheet: ' + wb.worksheets.map((w) => w.name).join(', '));

  /* ---------- (C) cộng thẳng từ các ô dữ liệu ---------- */
  const nk = sheet(wb, 'NHATKYCHUNG');
  if (!nk) { console.error('Không có sheet NHATKYCHUNG'); process.exit(2); }
  const h = headerOf(nk, ['ngay', 'hang muc', 'so luong']);
  if (!h) { console.error('Không tìm thấy dòng tiêu đề (Ngày, Hạng mục, Số lượng) trong NHATKYCHUNG'); process.exit(2); }
  const cSL = h.col('so luong'); const cDG = h.col('don gia'); const cLoai = h.col('loai cp', 'loai chi phi'); const cHM = h.col('hang muc'); const cNCC = h.col('ma ncc', 'ma nha cung cap');
  const cCT = h.col('ma ct', 'ma cong trinh'); const cVT = h.col('ma vt'); const cDG2 = h.col('dien giai');
  const hmTo = new Map();
  const hmSheet = sheet(wb, 'DM_HANGMUC'); const nhSheet = sheet(wb, 'DM_NHOM');
  const nhomTen = new Map();
  if (nhSheet) { const hh = headerOf(nhSheet, ['ma nhom', 'ten nhom']); if (hh) for (let r = hh.row + 1; r <= nhSheet.rowCount; r++) { const m = val(nhSheet.getCell(r, hh.col('ma nhom'))); if (m) nhomTen.set(norm(m), String(val(nhSheet.getCell(r, hh.col('ten nhom'))))); } }
  if (hmSheet) { const hh = headerOf(hmSheet, ['hang muc', 'ma nhom']); if (hh) for (let r = hh.row + 1; r <= hmSheet.rowCount; r++) { const t = val(hmSheet.getCell(r, hh.col('hang muc'))); if (t) hmTo.set(norm(t), nhomTen.get(norm(val(hmSheet.getCell(r, hh.col('ma nhom'))))) || '(không nhóm)'); } }
  const C = { tong: 0, soDong: 0, loai: {}, hm: {}, nhom: {}, ncc: {} };
  const skipped = [];
  for (let r = h.row + 1; r <= nk.rowCount; r++) {
    const sl = num(val(nk.getCell(r, cSL))); const dg = num(val(nk.getCell(r, cDG)));
    const hasAny = [cCT, cHM, cVT, cDG2].some((c) => c && val(nk.getCell(r, c)));
    if (sl == null || dg == null) { if (hasAny || sl != null || dg != null) skipped.push(r); continue; }
    const t = tt(sl, dg);
    C.tong += t; C.soDong++;
    const loai = cLoai ? String(val(nk.getCell(r, cLoai)) || '') : '';
    const hm = String(val(nk.getCell(r, cHM)) || '');
    const ncc = norm(val(nk.getCell(r, cNCC)));
    C.loai[loai] = (C.loai[loai] || 0) + t;
    C.hm[hm] = (C.hm[hm] || 0) + t;
    const ng = hmTo.get(norm(hm)) || '(không nhóm)';
    C.nhom[ng] = (C.nhom[ng] || 0) + t;
    C.ncc[ncc] = (C.ncc[ncc] || 0) + t;
  }
  const tra = {};
  const sq = sheet(wb, 'SO_QUY');
  let coSoQuy = false;
  if (sq) {
    const hs = headerOf(sq, ['so phieu', 'ngay', 'so tien']);
    if (hs) {
      coSoQuy = true;
      const cLoaiP = hs.col('loai'); const cTien = hs.col('so tien'); const cNC = hs.col('ma ncc'); const cThu = hs.col('thu'); const cChi = hs.col('chi');
      for (let r = hs.row + 1; r <= sq.rowCount; r++) {
        const ncc = norm(val(sq.getCell(r, cNC)));
        if (!ncc) continue;
        let thu = cThu ? num(val(sq.getCell(r, cThu))) || 0 : 0; let chi = cChi ? num(val(sq.getCell(r, cChi))) || 0 : 0;
        if (!thu && !chi) { const st = num(val(sq.getCell(r, cTien))) || 0; if (norm(val(sq.getCell(r, cLoaiP))).startsWith('thu')) thu = st; else chi = st; }
        tra[ncc] = (tra[ncc] || 0) + Math.round(chi) - Math.round(thu);
      }
    }
  }

  /* ---------- (D) phần mềm: nhập bằng bộ nhập thật vào kho tạm ---------- */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ketoan-doichieu-'));
  const store = new Store(dir);
  const parsed = await costImporter.parseCostWorkbook(fs.readFileSync(file), store.db);
  if (!parsed) { console.error('Phần mềm không nhận ra đây là file chi phí công trình'); process.exit(2); }
  const res = costImporter.applyCostImport(store, parsed, { mode: 'replace', soQuy: true, map: {} });
  const db = store.db;
  const S = KT.costSummary(db, {}, KT.buildCostLedger(db));
  const debt = KT.supplierDebt(db, {});

  /* ---------- bảng đối chiếu ---------- */
  const rows = [];
  const add = (name, c, d) => rows.push({ name, c, d, ok: c === d });
  add('TỔNG CHI PHÍ', C.tong, S.total);
  add('Số dòng chi phí', C.soDong, S.soDong);
  Object.keys(C.loai).sort().forEach((l) => add('Loại CP: ' + (l || '(trống)'), C.loai[l], S.byLoai[l] || 0));
  Object.keys(C.nhom).sort().forEach((n) => add('Nhóm: ' + n, C.nhom[n], (S.groups.find((g) => g.ten === n) || { total: 0 }).total));
  const items = [].concat(...S.groups.map((g) => g.items));
  Object.keys(C.hm).sort().forEach((n) => add('Hạng mục: ' + (n || '(trống)'), C.hm[n], (items.find((i) => norm(i.ten) === norm(n)) || { total: 0 }).total));
  const nccs = Array.from(new Set(Object.keys(C.ncc).concat(Object.keys(tra)))).filter(Boolean).sort();
  nccs.forEach((m) => {
    const d = debt.rows.find((r) => norm(r.ma) === m) || { phatSinh: 0, daTra: 0, conLai: 0 };
    add('NCC ' + m + ' — chi phí phát sinh', C.ncc[m] || 0, d.phatSinh);
    if (coSoQuy) { add('NCC ' + m + ' — đã trả', tra[m] || 0, d.daTra); add('NCC ' + m + ' — còn lại', (C.ncc[m] || 0) - (tra[m] || 0), d.conLai); }
  });
  const w = Math.max.apply(null, rows.map((r) => r.name.length));
  console.log('\n' + 'Chỉ tiêu'.padEnd(w) + '  ' + 'Cộng thẳng từ file'.padStart(20) + '  ' + 'Phần mềm'.padStart(18) + '  Kết quả');
  rows.forEach((r) => console.log(r.name.padEnd(w) + '  ' + money(r.c).padStart(20) + '  ' + money(r.d).padStart(18) + '  ' + (r.ok ? 'Khớp' : '*** LỆCH ' + money(r.d - r.c))));
  if (skipped.length) console.log('\nDòng NHATKYCHUNG có dữ liệu nhưng thiếu Số lượng hoặc Đơn giá (cả hai bên đều bỏ): ' + skipped.join(', '));
  if (!coSoQuy) console.log('\n(File không có sheet SO_QUY đọc được: bỏ qua phần đã trả / còn nợ.)');
  console.log('\nPhần mềm nhập: +' + res.added.costs + ' dòng chi phí, +' + res.added.materials + ' vật tư, +' + res.added.entries + ' dòng sổ quỹ; ' + res.warnings.length + ' cảnh báo.');
  res.warnings.slice(0, 15).forEach((x) => console.log('  - ' + x));
  const bad = rows.filter((r) => !r.ok);
  console.log('\nKẾT LUẬN: ' + (bad.length ? bad.length + '/' + rows.length + ' chỉ tiêu LỆCH' : 'TẤT CẢ ' + rows.length + ' chỉ tiêu KHỚP'));
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
