'use strict';
/*
 * Bí danh mã khi NHẬP EXCEL: mã cũ đã gộp vào mã khác → tự đổi sang mã đích (theo chuỗi bí danh, không phân biệt hoa thường),
 * trước bước xem trước (dry-run) và trước khi ghi. Dòng danh mục của mã cũ trong file bị bỏ (không tạo lại mã đã gộp).
 * MỖI lần đổi có một dòng báo cáo { file, sheet, dong, cot, loai, cu, moi } để hiện ở bước xem trước và trong báo cáo nhập.
 */
const KT = require('../public/js/shared.js');

const LOAI_TEN = { ncc: 'Mã NCC', vt: 'Mã vật tư', hm: 'Hạng mục', nha: 'Mã nhà', da: 'Mã dự án / công trình' };

function makeMapper(db, file) {
  const idx = KT.aliasIndex(db);
  const has = Object.keys(idx).length > 0;
  const report = [];
  // giá trị → mã đích (nếu là mã cũ đã gộp); ghi báo cáo
  const map = (v, loai, sheet, dong, cot) => {
    if (!has || v == null || v === '') return v;
    const s = String(v).normalize('NFC').trim();
    const t = KT.resolveAlias(db, loai, s, idx);
    if (t === s) return v;
    report.push({ file: file || '', sheet: sheet || '', dong: dong == null ? '' : dong, cot: cot || LOAI_TEN[loai], loai, cu: s, moi: t });
    return t;
  };
  // mảng bản ghi: đổi các trường mã theo spec [[trường, loại, tên cột]]
  // (giữ giá trị gốc trong r._goc để dấu vân tay chống nhập trùng vẫn tính theo đúng nội dung file)
  const rows = (list, spec, sheet, rowField) => {
    (list || []).forEach((r) => spec.forEach(([f, loai, cot]) => {
      if (!r[f]) return;
      const v = map(r[f], loai, sheet, r[rowField || '_row'], cot);
      if (v !== r[f]) { r._goc = r._goc || {}; if (!(f in r._goc)) r._goc[f] = r[f]; r[f] = v; }
    }));
  };
  // danh mục trong file: dòng của mã cũ đã gộp → bỏ (mã đích đã có trong phần mềm), báo cáo
  const catalog = (list, loai, sheet, rowField) => (list || []).filter((r) => {
    if (!r || !r.ma || !has) return true;
    const s = String(r.ma).normalize('NFC').trim();
    const t = KT.resolveAlias(db, loai, s, idx);
    if (t === s) return true;
    report.push({ file: file || '', sheet: sheet || '', dong: r[rowField || '_row'] == null ? '' : r[rowField || '_row'], cot: LOAI_TEN[loai] + ' (danh mục)', loai, cu: s, moi: t, boDong: true });
    return false;
  });
  return { map, rows, catalog, report };
}

// Câu báo cáo cho một dòng
function line(x) {
  return 'Bí danh: ' + (x.file ? x.file + ' · ' : '') + (x.sheet || '') + (x.dong !== '' ? ' dòng ' + x.dong : '') + ' — ' + x.cot + ' "' + x.cu + '" đã gộp vào "' + x.moi + '"' +
    (x.boDong ? ': bỏ dòng danh mục này (không tạo lại mã cũ)' : ': đổi sang "' + x.moi + '"');
}

// File sổ thu chi (lib/importer.js): danh mục dự án / NCC + dòng sổ
function cashBook(db, parsed, file) {
  const m = makeMapper(db, file);
  parsed.projects = m.catalog(parsed.projects, 'da', 'Danh_Muc_Du_An');
  parsed.suppliers = m.catalog(parsed.suppliers, 'ncc', 'Danh_Muc_NCC');
  m.rows(parsed.entries, [['maDuAn', 'da', 'Mã dự án'], ['maNCC', 'ncc', 'Mã NCC']], 'So_Thu_Chi_Hang_Ngay');
  return finish(parsed, m.report);
}

// File chi phí công trình (lib/costImporter.js): danh mục + NHATKYCHUNG + SO_QUY
function costBook(db, parsed, file) {
  const m = makeMapper(db, file);
  parsed.items = m.catalog(parsed.items, 'hm', 'DM_HANGMUC');
  parsed.materials = m.catalog(parsed.materials, 'vt', 'DM_VATTU');
  parsed.houses = m.catalog(parsed.houses, 'nha', 'DM_NHA');
  parsed.cts = m.catalog(parsed.cts, 'da', 'DM_CONGTRINH');
  parsed.suppliers = m.catalog(parsed.suppliers, 'ncc', 'DM_NCC');
  m.rows(parsed.materials, [['hmTen', 'hm', 'Hạng mục hay dùng']], 'DM_VATTU');
  m.rows(parsed.houses, [['maCT', 'da', 'Mã công trình']], 'DM_NHA');
  m.rows(parsed.costs, [['maCT', 'da', 'Mã CT'], ['maNha', 'nha', 'Mã nhà'], ['hmTen', 'hm', 'Hạng mục'], ['maVT', 'vt', 'Mã VT'], ['maNCC', 'ncc', 'Mã NCC']], 'NHATKYCHUNG');
  m.rows(parsed.cash, [['maDuAn', 'da', 'Mã CT'], ['maNCC', 'ncc', 'Mã NCC']], 'SO_QUY');
  m.rows(parsed.ext, [['maDuAn', 'da', 'Mã CT'], ['maNCC', 'ncc', 'Mã NCC']], 'TRA_NGOAI_QUY');
  m.rows(parsed.dk || [], [['maDuAn', 'da', 'Mã CT'], ['maNCC', 'ncc', 'Mã NCC']], 'SO_DU_DAU_NCC');
  return finish(parsed, m.report);
}

// Công cụ dòng lệnh nhập file ChiPhi_CongTrinh (lib/importCongTrinh.js): một file đã đọc (parseFile)
function congTrinhFile(db, pf) {
  const m = makeMapper(db, pf.file);
  if (pf.ct && pf.ct.ma) {
    const v = m.map(pf.ct.ma, 'da', 'DM_CONGTRINH', pf.ct.row, 'Mã CT');
    if (v !== pf.ct.ma) { pf.ct._goc = pf.ct._goc || { ma: pf.ct.ma }; pf.ct.ma = v; }
  }
  pf.items = m.catalog(pf.items, 'hm', 'DM_HANGMUC', 'row');
  pf.materials = m.catalog(pf.materials, 'vt', 'DM_VATTU', 'row');
  pf.houses = m.catalog(pf.houses, 'nha', 'DM_NHA', 'row');
  pf.suppliers = m.catalog(pf.suppliers, 'ncc', 'DM_NCC', 'row');
  m.rows(pf.materials, [['hmTen', 'hm', 'Hạng mục hay dùng']], 'DM_VATTU', 'row');
  m.rows(pf.houses, [['maCT', 'da', 'Mã CT']], 'DM_NHA', 'row');
  m.rows(pf.costs, [['maCT', 'da', 'Mã CT'], ['maNha', 'nha', 'Mã nhà'], ['hangMuc', 'hm', 'Hạng mục'], ['maVT', 'vt', 'Mã VT'], ['maNCC', 'ncc', 'Mã NCC']], 'NHATKYCHUNG', 'row');
  m.rows(pf.cash, [['maCT', 'da', 'Mã CT'], ['maNha', 'nha', 'Mã nhà'], ['maNCC', 'ncc', 'Mã NCC']], 'SO_QUY', 'row');
  return m.report;
}

function finish(parsed, report) {
  parsed.biDanh = report;
  if (report.length) {
    if (!parsed.warnings) parsed.warnings = [];
    parsed.warnings.unshift(...report.map(line));
  }
  return report;
}

module.exports = { cashBook, costBook, congTrinhFile, line };
