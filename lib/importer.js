'use strict';
/*
 * Nhập dữ liệu từ file Excel theo mẫu "Quản lý thu chi" (Danh_Muc_Du_An, Danh_Muc_NCC,
 * So_Thu_Chi_Hang_Ngay, Tong_Quan, Phieu_Chi). Cột được nhận diện theo tiêu đề nên
 * file xuất ra từ phần mềm này cũng nhập lại được.
 */
const ExcelJS = require('exceljs');
const KT = require('../public/js/shared.js');

function norm(s) {
  return KT.normalizeText(String(s == null ? '' : s)).replace(/[_\s]+/g, ' ').trim();
}

function cellValue(cell) {
  let v = cell.value;
  if (v == null) return null;
  if (typeof v === 'object') {
    if (v instanceof Date) return v;
    if (v.formula !== undefined || v.sharedFormula !== undefined || 'result' in v) {
      const r = v.result;
      if (r == null || (typeof r === 'object' && r.error)) return null;
      return r;
    }
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text !== undefined) return v.text;
    if (v.error) return null;
    return null;
  }
  return v;
}

function isFormula(cell) {
  const v = cell.value;
  return v && typeof v === 'object' && (v.formula !== undefined || v.sharedFormula !== undefined);
}

function text(v) {
  if (v == null) return '';
  if (v instanceof Date) return KT.fmtDate(toISO(v));
  if (typeof v === 'number') return v === 0 ? '' : String(v);
  if (typeof v === 'boolean') return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function toISO(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Số seri ngày của Excel
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  }
  return '';
}

function amount(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Math.round(v);
  const n = KT.parseAmount(String(v));
  return isNaN(n) ? 0 : n;
}

function findSheet(wb, names) {
  const wanted = names.map(norm);
  let found = null;
  wb.eachSheet((ws) => {
    if (!found && wanted.includes(norm(ws.name))) found = ws;
  });
  return found;
}

// Tìm dòng tiêu đề chứa đủ các từ khóa, trả về { row, cols: Map(colIndex -> headerNorm) }
function findHeader(ws, mustHave, maxRow) {
  const limit = Math.min(ws.rowCount, maxRow || 15);
  for (let r = 1; r <= limit; r++) {
    const row = ws.getRow(r);
    const cols = new Map();
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      const t = norm(text(cellValue(cell)));
      if (t) cols.set(c, t);
    });
    const vals = Array.from(cols.values());
    if (mustHave.every((k) => vals.some((v) => v.includes(k)))) return { row: r, cols };
  }
  return null;
}

function colOf(header, predicate) {
  for (const [c, t] of header.cols) if (predicate(t)) return c;
  return 0;
}

function readProjects(ws, warnings) {
  const h = findHeader(ws, ['ma du an', 'ten du an']);
  if (!h) { warnings.push('Không tìm thấy tiêu đề trong sheet ' + ws.name); return []; }
  const cMa = colOf(h, (t) => t.startsWith('ma du an'));
  const cTen = colOf(h, (t) => t.startsWith('ten du an'));
  const cNs = colOf(h, (t) => t.includes('ngan sach'));
  const cTt = colOf(h, (t) => t.includes('trang thai'));
  const cGc = colOf(h, (t) => t.includes('ghi chu'));
  const out = [];
  for (let r = h.row + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const ma = text(cellValue(row.getCell(cMa)));
    if (!ma || norm(ma).startsWith('tong cong')) continue;
    out.push({
      ma,
      ten: cTen ? text(cellValue(row.getCell(cTen))) : '',
      nganSach: cNs ? amount(cellValue(row.getCell(cNs))) : 0,
      trangThai: cTt ? text(cellValue(row.getCell(cTt))) || 'Đang thực hiện' : 'Đang thực hiện',
      ghiChu: cGc ? text(cellValue(row.getCell(cGc))) : ''
    });
  }
  return out;
}

function readSuppliers(ws, warnings) {
  const h = findHeader(ws, ['ma ncc', 'ten']);
  if (!h) { warnings.push('Không tìm thấy tiêu đề trong sheet ' + ws.name); return []; }
  const cMa = colOf(h, (t) => t.startsWith('ma ncc'));
  const cTen = colOf(h, (t) => t.startsWith('ten'));
  const cLoai = colOf(h, (t) => t.startsWith('loai'));
  const cSdt = colOf(h, (t) => t.includes('dien thoai') || t === 'sdt');
  const cDc = colOf(h, (t) => t.includes('dia chi'));
  const cGc = colOf(h, (t) => t.includes('ghi chu'));
  const out = [];
  for (let r = h.row + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const ma = text(cellValue(row.getCell(cMa)));
    if (!ma || norm(ma).startsWith('tong cong')) continue;
    out.push({
      ma,
      ten: cTen ? text(cellValue(row.getCell(cTen))) : '',
      loai: cLoai ? text(cellValue(row.getCell(cLoai))) : '',
      sdt: cSdt ? text(cellValue(row.getCell(cSdt))) : '',
      diaChi: cDc ? text(cellValue(row.getCell(cDc))) : '',
      ghiChu: cGc ? text(cellValue(row.getCell(cGc))) : ''
    });
  }
  return out;
}

function readLedger(ws, warnings) {
  const h = findHeader(ws, ['ngay', 'noi dung']);
  if (!h) { warnings.push('Không tìm thấy tiêu đề trong sheet ' + ws.name); return []; }
  const cNgay = colOf(h, (t) => t.startsWith('ngay'));
  let cSo = colOf(h, (t) => t.includes('so phieu') || t.includes('so chung tu'));
  if (!cSo && cNgay && !h.cols.has(cNgay + 1)) cSo = cNgay + 1; // file gốc: cột C không có tiêu đề
  const cDa = colOf(h, (t) => t.startsWith('ma du an'));
  const cNcc = colOf(h, (t) => t.startsWith('ma ncc'));
  const cNd = colOf(h, (t) => t.startsWith('noi dung'));
  const cThu = colOf(h, (t) => t.includes('tien thu') || t === 'thu' || t.startsWith('thu ('));
  const cChi = colOf(h, (t) => t.includes('tien chi') || t === 'chi' || t.startsWith('chi ('));
  const cNn = colOf(h, (t) => t.startsWith('nguoi nhan'));
  const cGc = colOf(h, (t) => t.includes('ghi chu'));
  if (!cThu || !cChi) warnings.push('Không nhận diện được cột Thu/Chi trong sheet ' + ws.name);

  const get = (row, c) => (c ? cellValue(row.getCell(c)) : null);
  const out = [];
  let lastDate = '';
  for (let r = h.row + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const noiDung = text(get(row, cNd));
    const thu = amount(get(row, cThu));
    const chi = amount(get(row, cChi));
    const maDuAn = text(get(row, cDa));
    const maNCC = text(get(row, cNcc));
    let ngay = toISO(get(row, cNgay));
    if (!noiDung && !thu && !chi) continue; // dòng trống / chỉ có công thức
    if (norm(noiDung).startsWith('tong cong') && !maDuAn && !maNCC) continue; // dòng tổng
    if (!ngay) {
      if (lastDate) {
        ngay = lastDate;
        warnings.push('Dòng ' + r + ' (' + (noiDung || 'không nội dung') + ') thiếu ngày, đã lấy theo dòng trên: ' + KT.fmtDate(ngay));
      } else {
        warnings.push('Dòng ' + r + ' thiếu ngày, đã bỏ qua');
        continue;
      }
    }
    lastDate = ngay;
    if (thu < 0 || chi < 0) warnings.push('Dòng ' + r + ' có số tiền âm');
    out.push({
      ngay,
      soPhieu: text(get(row, cSo)),
      maDuAn,
      maNCC,
      noiDung,
      thu,
      chi,
      nguoiNhan: text(get(row, cNn)),
      ghiChu: text(get(row, cGc)),
      _row: r
    });
  }
  return out;
}

function readBudgetsFromOverview(ws) {
  const h = findHeader(ws, ['ma du an', 'ngan sach']);
  if (!h) return new Map();
  const cMa = colOf(h, (t) => t.startsWith('ma du an'));
  const cNs = colOf(h, (t) => t.includes('ngan sach'));
  const out = new Map();
  for (let r = h.row + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const ma = text(cellValue(row.getCell(cMa)));
    const cell = row.getCell(cNs);
    if (!ma || isFormula(cell)) continue; // chỉ lấy ngân sách nhập tay
    const v = cellValue(cell);
    if (typeof v === 'number' && v > 0) out.set(KT.keyOf(ma), Math.round(v));
  }
  return out;
}

function readSettings(ws) {
  const labels = {
    'ten don vi': 'tenDonVi',
    'dia chi': 'diaChi',
    'thu quy': 'thuQuy',
    'giam doc': 'giamDoc',
    'ke toan truong': 'keToanTruong',
    'hinh thuc': 'hinhThucMacDinh'
  };
  const out = {};
  for (let r = 1; r <= Math.min(ws.rowCount, 12); r++) {
    const row = ws.getRow(r);
    const label = norm(text(cellValue(row.getCell(1))));
    const key = Object.keys(labels).find((k) => label.startsWith(k));
    if (!key || out[labels[key]]) continue;
    for (let c = 2; c <= 8; c++) {
      const v = text(cellValue(row.getCell(c)));
      if (v && norm(v) !== label) { out[labels[key]] = v; break; }
    }
  }
  return out;
}

async function parseWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const warnings = [];

  const wsDa = findSheet(wb, ['Danh_Muc_Du_An', 'Danh muc du an']);
  const wsNcc = findSheet(wb, ['Danh_Muc_NCC', 'Danh muc NCC']);
  const wsSo = findSheet(wb, ['So_Thu_Chi_Hang_Ngay', 'So thu chi', 'So_Thu_Chi']);
  const wsTq = findSheet(wb, ['Tong_Quan']);
  const wsPc = findSheet(wb, ['Phieu_Chi']);

  if (!wsSo && !wsDa && !wsNcc) {
    throw new Error('File không đúng mẫu: cần có ít nhất một trong các sheet So_Thu_Chi_Hang_Ngay, Danh_Muc_Du_An, Danh_Muc_NCC.');
  }

  const projects = wsDa ? readProjects(wsDa, warnings) : [];
  const suppliers = wsNcc ? readSuppliers(wsNcc, warnings) : [];
  const entries = wsSo ? readLedger(wsSo, warnings) : [];
  const settings = wsPc ? readSettings(wsPc) : {};

  // Ngân sách nhập tay ở Tong_Quan (vd. VP) khi danh mục để trống
  if (wsTq) {
    const budgets = readBudgetsFromOverview(wsTq);
    projects.forEach((p) => {
      if (!p.nganSach && budgets.has(KT.keyOf(p.ma))) p.nganSach = budgets.get(KT.keyOf(p.ma));
    });
  }

  // Bỏ mã trùng trong danh mục (giữ dòng đầu)
  const dedupe = (list, label) => {
    const seen = new Set();
    return list.filter((x) => {
      const k = KT.keyOf(x.ma);
      if (seen.has(k)) { warnings.push(label + ' "' + x.ma + '" bị trùng, chỉ giữ dòng đầu'); return false; }
      seen.add(k);
      return true;
    });
  };
  const P = dedupe(projects, 'Mã dự án');
  const S = dedupe(suppliers, 'Mã NCC');

  // Mã dùng trong sổ nhưng chưa có trong danh mục -> tự thêm vào danh mục
  const pKeys = new Set(P.map((p) => KT.keyOf(p.ma)));
  const sKeys = new Set(S.map((s) => KT.keyOf(s.ma)));
  entries.forEach((e) => {
    if (e.maDuAn && !pKeys.has(KT.keyOf(e.maDuAn))) {
      pKeys.add(KT.keyOf(e.maDuAn));
      P.push({ ma: e.maDuAn, ten: e.maDuAn, nganSach: 0, trangThai: 'Đang thực hiện', ghiChu: 'Tự thêm khi nhập Excel' });
      warnings.push('Mã dự án "' + e.maDuAn + '" chưa có trong danh mục, đã tự thêm');
    }
    if (e.maNCC && !sKeys.has(KT.keyOf(e.maNCC))) {
      sKeys.add(KT.keyOf(e.maNCC));
      S.push({ ma: e.maNCC, ten: e.maNCC, loai: '', sdt: '', diaChi: '', ghiChu: 'Tự thêm khi nhập Excel' });
      warnings.push('Mã NCC "' + e.maNCC + '" chưa có trong danh mục, đã tự thêm');
    }
  });

  const tongThu = entries.reduce((t, e) => t + e.thu, 0);
  const tongChi = entries.reduce((t, e) => t + e.chi, 0);
  return {
    settings,
    projects: P,
    suppliers: S,
    entries,
    warnings,
    stats: {
      sheets: [wsSo, wsDa, wsNcc, wsTq, wsPc].filter(Boolean).map((w) => w.name),
      soDuAn: P.length,
      soNCC: S.length,
      soDong: entries.length,
      tongThu,
      tongChi,
      tonQuy: tongThu - tongChi
    }
  };
}

function entryKey(e) {
  return [e.ngay, KT.voucherKey(e.soPhieu), KT.keyOf(e.maDuAn), KT.keyOf(e.maNCC), String(e.noiDung || '').trim(), e.thu || 0, e.chi || 0].join('|');
}

// Áp dữ liệu đã đọc vào kho. mode = 'replace' | 'merge'
function applyImport(store, parsed, mode) {
  const now = new Date().toISOString();
  const strip = (e) => { const x = Object.assign({}, e); delete x._row; return x; };
  if (mode === 'replace') {
    const cur = store.db;
    // Chỉ thay phần sổ thu chi; dữ liệu chi phí công trình giữ nguyên (id tiếp tục đánh số để không trùng)
    const db = Object.assign({}, cur, {
      settings: Object.assign({}, cur.settings, parsed.settings || {}),
      projects: [],
      suppliers: [],
      entries: [],
      vouchers: {}
    });
    let id = cur.nextId;
    parsed.projects.forEach((p) => db.projects.push(Object.assign({ id: id++ }, p)));
    parsed.suppliers.forEach((s) => db.suppliers.push(Object.assign({ id: id++ }, s)));
    parsed.entries.forEach((e, i) => db.entries.push(Object.assign({ id: id++, seq: i + 1, createdAt: now, updatedAt: now }, strip(e))));
    // Giữ lại dự án / NCC mà phần chi phí công trình đang dùng nhưng file Excel không có
    const pKeys = new Set(db.projects.map((p) => KT.keyOf(p.ma)));
    const sKeys = new Set(db.suppliers.map((s) => KT.keyOf(s.ma)));
    const ctUsed = new Set([].concat(cur.costs || [], cur.houses || []).map((x) => KT.keyOf(x.maCT)));
    const nccUsed = new Set((cur.costs || []).map((x) => KT.keyOf(x.maNCC)));
    (cur.projects || []).forEach((p) => { if (ctUsed.has(KT.keyOf(p.ma)) && !pKeys.has(KT.keyOf(p.ma))) db.projects.push(p); });
    (cur.suppliers || []).forEach((s) => { if (nccUsed.has(KT.keyOf(s.ma)) && !sKeys.has(KT.keyOf(s.ma))) db.suppliers.push(s); });
    db.nextId = id;
    store.replaceAll(db, 'truoc-nhap-excel');
    return { added: { projects: db.projects.length, suppliers: db.suppliers.length, entries: db.entries.length }, skipped: 0 };
  }
  store.backup('truoc-gop-excel');
  const db = store.db;
  const pKeys = new Set(db.projects.map((p) => KT.keyOf(p.ma)));
  const sKeys = new Set(db.suppliers.map((s) => KT.keyOf(s.ma)));
  const eKeys = new Set(db.entries.map(entryKey));
  const added = { projects: 0, suppliers: 0, entries: 0 };
  let skipped = 0;
  parsed.projects.forEach((p) => {
    if (pKeys.has(KT.keyOf(p.ma))) return;
    pKeys.add(KT.keyOf(p.ma));
    db.projects.push(Object.assign({ id: store.newId() }, p));
    added.projects++;
  });
  parsed.suppliers.forEach((s) => {
    if (sKeys.has(KT.keyOf(s.ma))) return;
    sKeys.add(KT.keyOf(s.ma));
    db.suppliers.push(Object.assign({ id: store.newId() }, s));
    added.suppliers++;
  });
  parsed.entries.forEach((e) => {
    const k = entryKey(e);
    if (eKeys.has(k)) { skipped++; return; }
    eKeys.add(k);
    db.entries.push(Object.assign({ id: store.newId(), seq: store.nextSeq(), createdAt: now, updatedAt: now }, strip(e)));
    added.entries++;
  });
  store.save();
  return { added, skipped };
}

module.exports = { parseWorkbook, applyImport, toISO, entryKey, helpers: { norm, cellValue, isFormula, text, toISO, amount, findSheet, findHeader, colOf } };
