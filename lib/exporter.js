'use strict';
/*
 * Xuất Excel.
 *  - buildFullWorkbook: toàn bộ sổ sách theo đúng bố cục file gốc, giữ công thức
 *    (VLOOKUP tên, tồn quỹ lũy kế, SUMIF tổng hợp, Phieu_Chi chọn số phiếu để in).
 *  - buildLedgerWorkbook: sổ thu chi theo bộ lọc (kỳ, dự án, NCC...).
 *  - buildProjectWorkbook / buildSupplierWorkbook: báo cáo tổng hợp + chi tiết.
 *  - buildVoucherWorkbook: 1 phiếu thu/chi 2 liên để in.
 */
const ExcelJS = require('exceljs');

// ExcelJS nhận ra "đã thấy kiểu này rồi" theo ĐỊNH DANH đối tượng kiểu, nên dùng chung một đối tượng cho mọi ô cùng kiểu thì dựng file nhanh gấp 3 lần.
// Nhưng khi gán cell.fill / cell.numFmt... ExcelJS sửa thẳng vào đối tượng kiểu đang dùng chung làm các ô khác đổi theo. Vì vậy gán thuộc tính
// được đổi thành "sao chép khi ghi": ô nhận đối tượng kiểu mới (và dùng lại đối tượng đó cho cùng một phép biến đổi).
const STYLE_TRANSITIONS = new WeakMap();
function withStyle(base, prop, v) {
  let m = STYLE_TRANSITIONS.get(base);
  if (!m) { m = new Map(); STYLE_TRANSITIONS.set(base, m); }
  const k = prop + '|' + (v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v));
  let n = m.get(k);
  if (!n) { n = Object.assign({}, base); n[prop] = v; m.set(k, n); }
  return n;
}
(function patchCellStyleSetters() {
  const proto = Object.getPrototypeOf(new ExcelJS.Workbook().addWorksheet('x').getCell('A1'));
  ['numFmt', 'font', 'alignment', 'border', 'fill', 'protection'].forEach((prop) => {
    Object.defineProperty(proto, prop, { configurable: true, get() { return this.style[prop]; }, set(v) { this.style = withStyle(this.style, prop, v); } });
  });
})();
const KT = require('../public/js/shared.js');
const { addColumnChart } = require('./chart');

const FONT = 'Times New Roman';
const NAVY = 'FF1F4E78';
const INPUT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
const SUB_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
const THIN = { style: 'thin', color: { argb: 'FFA6A6A6' } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const MONEY = '#,##0';
const DATE_FMT = 'dd/mm/yyyy';

const LEDGER = 'So_Thu_Chi_Hang_Ngay';

function font(o) { return Object.assign({ name: FONT, size: 12 }, o || {}); }
function F(formula, result) { return result === undefined ? { formula } : { formula, result }; }

function excelDate(iso) {
  if (!KT.isISODate(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function excelSerial(iso) {
  const d = excelDate(iso);
  return d ? d.getTime() / 86400000 + 25569 : '';
}

function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sổ Thu Chi - Phần mềm kế toán';
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  return wb;
}

function title(ws, cellAddr, text, size, color) {
  const c = ws.getCell(cellAddr);
  c.value = text;
  c.font = font({ bold: true, size: size || 16, color: { argb: color || NAVY } });
  return c;
}

function subtitle(ws, cellAddr, text) {
  const c = ws.getCell(cellAddr);
  c.value = text;
  c.font = font({ italic: true, size: 11, color: { argb: 'FF595959' } });
  return c;
}

function header(ws, rowNo, labels) {
  const row = ws.getRow(rowNo);
  labels.forEach((h, i) => {
    const c = row.getCell(i + 1);
    c.value = h;
    c.font = font({ bold: true, color: { argb: 'FFFFFFFF' } });
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = BORDER;
  });
  row.height = 34;
}

// kinds: 'text' | 'wrap' | 'money' | 'date' | 'center' | 'pct' | 'int'
// Kiểu ô được dựng một lần cho mỗi tổ hợp (kind, font, fill) rồi gán một lần cho cả ô: gán từng thuộc tính
// (font, border, numFmt, alignment...) cho hàng chục nghìn ô làm ExcelJS dựng lại bảng kiểu liên tục (chậm gấp nhiều lần).
const STYLE_CACHE = new Map();
function styleFor(kind, extra) {
  const k = kind + '|' + (extra && extra.font ? JSON.stringify(extra.font) : '') + '|' + (extra && extra.fill ? JSON.stringify(extra.fill) : '');
  let st = STYLE_CACHE.get(k);
  if (!st) {
    st = { font: font(extra && extra.font), border: BORDER };
    switch (kind) {
      case 'money': st.numFmt = MONEY; st.alignment = { horizontal: 'right', vertical: 'top' }; break;
      case 'int': st.numFmt = '#,##0'; st.alignment = { horizontal: 'center', vertical: 'top' }; break;
      case 'date': st.numFmt = DATE_FMT; st.alignment = { horizontal: 'center', vertical: 'top' }; break;
      case 'center': st.alignment = { horizontal: 'center', vertical: 'top' }; break;
      case 'pct': st.numFmt = '0.0%'; st.alignment = { horizontal: 'right', vertical: 'top' }; break;
      case 'wrap': st.alignment = { vertical: 'top', wrapText: true }; break;
      default: st.alignment = { vertical: 'top' };
    }
    if (extra && extra.fill) st.fill = extra.fill;
    STYLE_CACHE.set(k, st);
  }
  return st;
}
function put(row, col, value, kind, extra) {
  const c = row.getCell(col);
  c.value = value;
  c.style = styleFor(kind, extra);
  return c;
}

function styleRow(row, fromCol, toCol, opts) {
  for (let c = fromCol; c <= toCol; c++) {
    const cell = row.getCell(c);
    cell.border = BORDER;
    if (opts.fill) cell.fill = opts.fill;
    cell.font = font(Object.assign({}, cell.font && { bold: cell.font.bold }, opts.font));
  }
}

function widths(ws, list) {
  list.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

function statusFormula(cRef, dRef) {
  return 'IF(' + cRef + '>0,IF(' + dRef + '>' + cRef + ',"Vượt ngân sách",IF(' + dRef + '>=0.9*' + cRef +
    ',"Sắp hết ngân sách","Trong hạn mức")),IF(' + dRef + '>0,"Chưa có ngân sách","Chưa phát sinh"))';
}

function addStatusFormatting(ws, ref) {
  const first = ref.split(':')[0];
  ws.addConditionalFormatting({
    ref,
    rules: [
      { type: 'expression', priority: 1, formulae: ['ISNUMBER(SEARCH("Vượt",' + first + '))'], style: { font: { color: { argb: 'FFC00000' }, bold: true } } },
      { type: 'expression', priority: 2, formulae: ['ISNUMBER(SEARCH("Sắp hết",' + first + '))'], style: { font: { color: { argb: 'FFC65911' }, bold: true } } }
    ]
  });
}

function landscape(ws, printTitleRow) {
  ws.pageSetup = {
    paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    printTitlesRow: printTitleRow ? printTitleRow + ':' + printTitleRow : undefined
  };
  ws.headerFooter = { oddFooter: '&C&"Times New Roman"&9Trang &P / &N' };
}

function portrait(ws, printTitleRow) {
  landscape(ws, printTitleRow);
  ws.pageSetup.orientation = 'portrait';
}

/* =====================================================================
 * PHIẾU THU / CHI — bố cục 2 liên giống sheet Phieu_Chi của file gốc
 * v: { company, address, soText, title, ngayText, nhanLabel, nguoiNhan, diaChi,
 *      lyDoLabel, lyDo, soTien, hinhThuc, bangChu, kemTheo, sigNhan, thuQuy,
 *      giamDoc, keToanTruong }  — mỗi giá trị là văn bản hoặc {formula,result}
 * ===================================================================== */
function voucherWidths(ws) {
  [22, 15, 15, 11, 15, 15, 11, 15].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

function writeVoucherPart(ws, top, lien, v, showKTT) {
  const cell = (addr, value, f, align) => {
    const c = ws.getCell(addr);
    c.value = value;
    c.font = font(f);
    c.alignment = Object.assign({ vertical: 'middle' }, align || { horizontal: 'left' });
    return c;
  };
  const merge = (a) => { try { ws.mergeCells(a); } catch (e) { /* đã gộp */ } };
  const r = (k) => top + k; // k: hàng tương đối (0 = hàng tên đơn vị)
  const COLS = 'ABCDEFGH';
  const underline = (addr, toCol) => {
    const col = addr.charAt(0);
    const row = addr.slice(1);
    for (let i = COLS.indexOf(col); i <= COLS.indexOf(toCol || col); i++) {
      ws.getCell(COLS.charAt(i) + row).border = { bottom: { style: 'dotted', color: { argb: 'FF808080' } } };
    }
  };

  merge('A' + r(0) + ':D' + r(0)); cell('A' + r(0), v.company, { bold: true });
  merge('E' + r(0) + ':F' + r(0)); cell('E' + r(0), 'Quyển số: ................', {}, { horizontal: 'left' });
  merge('G' + r(0) + ':H' + r(0)); cell('G' + r(0), lien === 1 ? 'LIÊN 1: lưu' : 'LIÊN 2: giao khách', { italic: true, color: { argb: 'FF7F7F7F' } }, { horizontal: 'right' });
  merge('A' + r(1) + ':E' + r(1)); cell('A' + r(1), v.address, {});
  merge('F' + r(1) + ':H' + r(1)); cell('F' + r(1), v.soText, { bold: true }, { horizontal: 'right' });
  merge('A' + r(3) + ':H' + r(3)); cell('A' + r(3), v.title, { bold: true, size: 16 }, { horizontal: 'center' });
  merge('A' + r(4) + ':H' + r(4)); cell('A' + r(4), v.ngayText, { italic: true }, { horizontal: 'center' });

  merge('A' + r(6) + ':B' + r(6)); cell('A' + r(6), v.nhanLabel, {});
  merge('C' + r(6) + ':H' + r(6)); cell('C' + r(6), v.nguoiNhan, { bold: true }, { horizontal: 'left', wrapText: true }); underline('C' + r(6), 'H');
  merge('A' + r(7) + ':B' + r(7)); cell('A' + r(7), 'Địa chỉ:', {});
  merge('C' + r(7) + ':H' + r(7)); cell('C' + r(7), v.diaChi, {}, { horizontal: 'left', wrapText: true }); underline('C' + r(7), 'H');
  merge('A' + r(8) + ':B' + r(8)); cell('A' + r(8), v.lyDoLabel, {}, { horizontal: 'left', vertical: 'top' });
  merge('C' + r(8) + ':H' + r(8)); cell('C' + r(8), v.lyDo, {}, { horizontal: 'left', vertical: 'top', wrapText: true }); underline('C' + r(8), 'H');
  merge('A' + r(9) + ':B' + r(9)); cell('A' + r(9), 'Số tiền:', {});
  merge('C' + r(9) + ':D' + r(9));
  const st = cell('C' + r(9), v.soTien, { bold: true }, { horizontal: 'left' });
  st.numFmt = '#,##0" đ"';
  underline('C' + r(9), 'D');
  cell('E' + r(9), 'Hình thức:', {}, { horizontal: 'right' });
  merge('F' + r(9) + ':G' + r(9)); cell('F' + r(9), v.hinhThuc, {}, { horizontal: 'left' }); underline('F' + r(9), 'G');
  merge('A' + r(10) + ':B' + r(10)); cell('A' + r(10), 'Bằng chữ:', {}, { horizontal: 'left', vertical: 'top' });
  merge('C' + r(10) + ':H' + r(10)); cell('C' + r(10), v.bangChu, { italic: true }, { horizontal: 'left', vertical: 'top', wrapText: true }); underline('C' + r(10), 'H');
  merge('A' + r(11) + ':B' + r(11)); cell('A' + r(11), 'Kèm theo:', {});
  merge('C' + r(11) + ':H' + r(11)); cell('C' + r(11), v.kemTheo, {}, { horizontal: 'left' });

  merge('E' + r(13) + ':H' + r(13)); cell('E' + r(13), v.ngayText, { italic: true }, { horizontal: 'center' });
  const sigs = showKTT
    ? [['A', 'B', 'Giám đốc', v.giamDoc], ['C', 'D', 'Kế toán trưởng', v.keToanTruong], ['E', 'F', v.sigNhan, ''], ['G', 'H', 'Thủ quỹ', v.thuQuy]]
    : [['A', 'B', 'Giám đốc', v.giamDoc], ['C', 'F', v.sigNhan, ''], ['G', 'H', 'Thủ quỹ', v.thuQuy]];
  sigs.forEach(([c1, c2, label, name]) => {
    merge(c1 + r(14) + ':' + c2 + r(14)); cell(c1 + r(14), label, { bold: true }, { horizontal: 'center' });
    merge(c1 + r(15) + ':' + c2 + r(15)); cell(c1 + r(15), '(Ký, họ tên)', { italic: true, size: 11, color: { argb: 'FF595959' } }, { horizontal: 'center' });
    merge(c1 + r(17) + ':' + c2 + r(17)); cell(c1 + r(17), name || '', { bold: true }, { horizontal: 'center' });
  });

  const heights = { 0: 20, 1: 20, 3: 28, 4: 20, 6: 22, 7: 22, 8: 48, 9: 22, 10: 34, 11: 22, 13: 20, 14: 20, 15: 18, 16: 44, 17: 22 };
  Object.keys(heights).forEach((k) => { ws.getRow(r(Number(k))).height = heights[k]; });
}

function writeVoucherLayout(ws, top, v, showKTT) {
  writeVoucherPart(ws, top, 1, v, showKTT);
  const cut = top + 21;
  try { ws.mergeCells('A' + cut + ':H' + cut); } catch (e) { /* bỏ qua */ }
  const c = ws.getCell('A' + cut);
  c.value = '- - - - - - - - - - - - - - - - - - - - -  cắt theo đường này  - - - - - - - - - - - - - - - - - - - - -';
  c.font = font({ italic: true, size: 10, color: { argb: 'FF7F7F7F' } });
  c.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(cut - 1).height = 16;
  ws.getRow(cut + 1).height = 16;
  writeVoucherPart(ws, cut + 2, 2, v, showKTT);
  return { first: top, last: cut + 2 + 17 };
}

function staticVoucherValues(voucher, settings) {
  const thu = voucher.loai === 'thu';
  return {
    company: settings.tenDonVi || '',
    address: settings.diaChi || '',
    soText: 'Số: ' + voucher.soPhieu,
    title: thu ? 'PHIẾU THU' : 'PHIẾU CHI',
    ngayText: KT.ngayChu(voucher.ngay),
    nhanLabel: thu ? 'Họ và tên người nộp tiền:' : 'Họ và tên người nhận tiền:',
    nguoiNhan: voucher.nguoiNhan,
    diaChi: voucher.diaChi,
    lyDoLabel: thu ? 'Lý do nộp:' : 'Lý do chi:',
    lyDo: voucher.lyDo,
    soTien: voucher.soTien,
    hinhThuc: voucher.hinhThuc,
    bangChu: voucher.bangChu,
    kemTheo: (String(voucher.kemTheo || '').trim() || '................') + ' chứng từ gốc',
    sigNhan: thu ? 'Người nộp tiền' : 'Người nhận tiền',
    thuQuy: settings.thuQuy || '',
    giamDoc: settings.giamDoc || '',
    keToanTruong: settings.keToanTruong || ''
  };
}

function voucherPageSetup(ws, first, last) {
  ws.views = [{ showGridLines: false }];
  ws.pageSetup = {
    paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1,
    horizontalCentered: true,
    margins: { left: 0.5, right: 0.5, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    printArea: 'A' + first + ':H' + last
  };
}

/* =====================================================================
 * FILE TOÀN BỘ SỔ SÁCH (giữ công thức)
 * ===================================================================== */
async function buildFullWorkbook(db) {
  const settings = db.settings || {};
  const ledger = KT.buildLedger(db);
  const vouchers = KT.buildVouchers(db, ledger);
  const wb = newWorkbook();

  const wsTQ = wb.addWorksheet('Tong_Quan', { properties: { tabColor: { argb: 'FF1F4E78' } } });
  const wsSo = wb.addWorksheet(LEDGER, { properties: { tabColor: { argb: 'FF2A78D6' } } });
  const wsPC = wb.addWorksheet('Phieu_Chi', { properties: { tabColor: { argb: 'FFEB6834' } } });
  const wsDA = wb.addWorksheet('Danh_Muc_Du_An');
  const wsNCC = wb.addWorksheet('Danh_Muc_NCC');
  const wsTH = wb.addWorksheet('Tong_Hop_NCC');

  /* ---------- Danh_Muc_Du_An ---------- */
  const projects = db.projects || [];
  title(wsDA, 'A1', 'DANH MỤC DỰ ÁN & NGÂN SÁCH');
  subtitle(wsDA, 'A2', 'Quản lý mã dự án và ngân sách phê duyệt');
  header(wsDA, 4, ['Mã Dự Án', 'Tên Dự Án', 'Ngân Sách Dự Kiến (VND)', 'Trạng Thái', 'Ghi Chú']);
  projects.forEach((p, i) => {
    const row = wsDA.getRow(5 + i);
    put(row, 1, p.ma);
    put(row, 2, p.ten, 'wrap');
    put(row, 3, Number(p.nganSach) || null, 'money');
    put(row, 4, p.trangThai || '', 'center');
    put(row, 5, p.ghiChu || '', 'wrap');
  });
  const lastP = 4 + Math.max(projects.length, 1);
  {
    const row = wsDA.getRow(lastP + 1);
    put(row, 1, 'Tổng cộng', 'text', { font: { bold: true } });
    put(row, 2, projects.length + ' dự án', 'text', { font: { bold: true } });
    put(row, 3, F('SUM(C5:C' + lastP + ')', projects.reduce((t, p) => t + (Number(p.nganSach) || 0), 0)), 'money', { font: { bold: true } });
    put(row, 4, ''); put(row, 5, '');
    styleRow(row, 1, 5, { fill: TOTAL_FILL, font: { bold: true } });
  }
  widths(wsDA, [18, 48, 22, 18, 30]);
  wsDA.views = [{ state: 'frozen', ySplit: 4 }];
  wsDA.autoFilter = 'A4:E' + lastP;
  portrait(wsDA, 4);

  /* ---------- Danh_Muc_NCC ---------- */
  const suppliers = db.suppliers || [];
  title(wsNCC, 'A1', 'DANH MỤC NHÀ CUNG CẤP & ĐỐI TƯỢNG');
  subtitle(wsNCC, 'A2', 'Quản lý danh sách nhà cung cấp, thầu phụ, khách hàng');
  header(wsNCC, 4, ['Mã NCC', 'Tên Nhà Cung Cấp / Đối Tượng', 'Loại Đối Tượng', 'Số Điện Thoại', 'Địa Chỉ', 'Ghi Chú']);
  suppliers.forEach((s, i) => {
    const row = wsNCC.getRow(5 + i);
    put(row, 1, s.ma);
    put(row, 2, s.ten, 'wrap');
    put(row, 3, s.loai || '', 'wrap');
    put(row, 4, s.sdt || '', 'center');
    put(row, 5, s.diaChi || '', 'wrap');
    put(row, 6, s.ghiChu || '', 'wrap');
  });
  const lastS = 4 + Math.max(suppliers.length, 1);
  {
    const row = wsNCC.getRow(lastS + 1);
    put(row, 1, 'Tổng cộng');
    put(row, 2, F('COUNTA(B5:B' + lastS + ')&" đối tượng"', suppliers.length + ' đối tượng'));
    styleRow(row, 1, 6, { fill: TOTAL_FILL, font: { bold: true } });
  }
  widths(wsNCC, [22, 34, 26, 16, 32, 26]);
  wsNCC.views = [{ state: 'frozen', ySplit: 4 }];
  wsNCC.autoFilter = 'A4:F' + lastS;
  portrait(wsNCC, 4);

  /* ---------- So_Thu_Chi_Hang_Ngay ---------- */
  title(wsSo, 'A1', 'SỔ THU CHI & TỒN QUỸ HÀNG NGÀY', 16);
  subtitle(wsSo, 'A2', 'Nhật ký ghi nhận thu, chi, theo dõi tồn quỹ và nhà cung cấp — ' + (settings.tenDonVi || ''));
  header(wsSo, 4, ['STT', 'Ngày', 'Số Phiếu', 'Mã Dự Án', 'Tên Dự Án', 'Mã NCC', 'Tên Nhà Cung Cấp / Đối Tượng',
    'Nội Dung Thu / Chi', 'Số Tiền Thu (VND)', 'Số Tiền Chi (VND)', 'Tồn Quỹ (VND)', 'Người nhận', 'Ghi Chú']);
  const daRange = 'Danh_Muc_Du_An!$A$5:$B$' + lastP;
  const nccRange = 'Danh_Muc_NCC!$A$5:$B$' + lastS;
  ledger.forEach((e, i) => {
    const r = 5 + i;
    const row = wsSo.getRow(r);
    put(row, 1, i + 1, 'center');
    put(row, 2, excelDate(e.ngay), 'date');
    put(row, 3, e.soPhieu || '', 'center');
    put(row, 4, e.maDuAn || '');
    put(row, 5, F('IF(D' + r + '="","",IFERROR(VLOOKUP(D' + r + ',' + daRange + ',2,FALSE),""))', e.tenDuAn || ''), 'wrap');
    put(row, 6, e.maNCC || '');
    put(row, 7, F('IF(F' + r + '="","",IFERROR(VLOOKUP(F' + r + ',' + nccRange + ',2,FALSE),""))', e.tenNCC || ''), 'wrap');
    put(row, 8, e.noiDung || '', 'wrap');
    put(row, 9, e.thu || 0, 'money');
    put(row, 10, e.chi || 0, 'money');
    put(row, 11, F(i === 0 ? 'I5-J5' : 'K' + (r - 1) + '+I' + r + '-J' + r, e.ton), 'money');
    put(row, 12, e.nguoiNhan || '', 'wrap');
    put(row, 13, e.ghiChu || '', 'wrap');
  });
  const LR = 4 + Math.max(ledger.length, 1);
  const tongThu = ledger.reduce((t, e) => t + (e.thu || 0), 0);
  const tongChi = ledger.reduce((t, e) => t + (e.chi || 0), 0);
  {
    const row = wsSo.getRow(LR + 1);
    for (let c = 1; c <= 13; c++) row.getCell(c).value = null;
    row.getCell(8).value = 'Tổng cộng phát sinh';
    row.getCell(9).value = F('SUM(I5:I' + LR + ')', tongThu);
    row.getCell(10).value = F('SUM(J5:J' + LR + ')', tongChi);
    row.getCell(11).value = F('I' + (LR + 1) + '-J' + (LR + 1), tongThu - tongChi);
    styleRow(row, 1, 13, { fill: TOTAL_FILL, font: { bold: true } });
    [9, 10, 11].forEach((c) => { row.getCell(c).numFmt = MONEY; });
    row.getCell(8).alignment = { horizontal: 'right' };
  }
  widths(wsSo, [7, 12, 12, 16, 30, 18, 24, 44, 17, 17, 17, 18, 24]);
  wsSo.views = [{ state: 'frozen', ySplit: 4, xSplit: 0 }];
  wsSo.autoFilter = 'A4:M' + LR;
  landscape(wsSo, 4);

  const L = LEDGER + '!';
  const ledgerRange = (col) => L + '$' + col + '$5:$' + col + '$' + LR;

  /* ---------- Tong_Quan ---------- */
  const ps = KT.projectSummary(db);
  title(wsTQ, 'A1', 'BÁO CÁO TỔNG HỢP CHI PHÍ THEO DỰ ÁN');
  subtitle(wsTQ, 'A2', 'Cập nhật tự động từ sổ thu chi và danh mục dự án — ' + (settings.tenDonVi || ''));
  header(wsTQ, 4, ['Mã Dự Án', 'Tên Dự Án', 'Ngân Sách (VND)', 'Tổng Chi Thực Tế (VND)', 'Chênh lệch (VND)', 'Tỉ lệ', 'Trạng Thái Ngân Sách', 'Số giao dịch']);
  let r = 5;
  const catIdx = new Map(projects.map((p, i) => [KT.keyOf(p.ma), 5 + i]));
  const chartCats = [];
  const chartBudget = [];
  const chartSpent = [];
  ps.rows.forEach((p) => {
    const row = wsTQ.getRow(r);
    const cr = p.inCatalog ? catIdx.get(KT.keyOf(p.ma)) : null;
    put(row, 1, cr ? F('Danh_Muc_Du_An!A' + cr, p.ma) : p.ma);
    put(row, 2, cr ? F('Danh_Muc_Du_An!B' + cr, p.ten) : p.ten, 'wrap');
    put(row, 3, cr ? F('Danh_Muc_Du_An!C' + cr, p.nganSach) : 0, 'money');
    put(row, 4, F('SUMIF(' + ledgerRange('D') + ',A' + r + ',' + ledgerRange('J') + ')', p.chi), 'money');
    put(row, 5, F('C' + r + '-D' + r, p.chenhLech), 'money');
    put(row, 6, F('IF(C' + r + '>0,D' + r + '/C' + r + ',0)', p.tiLe), 'pct');
    put(row, 7, F(statusFormula('C' + r, 'D' + r), KT.STATUS_TEXT[p.status]), 'center');
    put(row, 8, F('COUNTIF(' + ledgerRange('D') + ',A' + r + ')', p.soDong), 'int');
    chartCats.push(p.ma);
    chartBudget.push(p.nganSach);
    chartSpent.push(p.chi);
    r++;
  });
  const lastTQ = Math.max(r - 1, 5);
  const totalRow = lastTQ + 1;
  {
    const row = wsTQ.getRow(totalRow);
    row.getCell(1).value = 'Tổng cộng';
    row.getCell(3).value = F('SUM(C5:C' + lastTQ + ')', ps.total.nganSach);
    row.getCell(4).value = F('SUM(D5:D' + lastTQ + ')', ps.total.chi);
    row.getCell(5).value = F('SUM(E5:E' + lastTQ + ')', ps.total.chenhLech);
    row.getCell(6).value = F('IF(C' + totalRow + '>0,D' + totalRow + '/C' + totalRow + ',0)', ps.total.nganSach > 0 ? ps.total.chi / ps.total.nganSach : 0);
    row.getCell(8).value = F('SUM(H5:H' + lastTQ + ')', ps.total.soDong);
    styleRow(row, 1, 8, { fill: TOTAL_FILL, font: { bold: true } });
    [3, 4, 5].forEach((c) => { row.getCell(c).numFmt = MONEY; });
    row.getCell(6).numFmt = '0.0%';
    row.getCell(8).numFmt = '#,##0';
  }
  addStatusFormatting(wsTQ, 'G5:G' + lastTQ);

  // Khối tình hình quỹ
  const fb = totalRow + 2;
  title(wsTQ, 'A' + fb, 'TÌNH HÌNH QUỸ', 12);
  const fundRows = [
    ['Tổng thu (toàn bộ sổ)', F('SUM(' + ledgerRange('I') + ')', tongThu)],
    ['Tổng chi (toàn bộ sổ)', F('SUM(' + ledgerRange('J') + ')', tongChi)],
    ['Tồn quỹ hiện tại', F('D' + (fb + 1) + '-D' + (fb + 2), tongThu - tongChi)],
    ['Chi chưa gán dự án', F('D' + (fb + 2) + '-D' + totalRow, tongChi - ps.total.chi)]
  ];
  fundRows.forEach(([label, val], i) => {
    const row = wsTQ.getRow(fb + 1 + i);
    wsTQ.mergeCells('A' + (fb + 1 + i) + ':C' + (fb + 1 + i));
    put(row, 1, label, 'text', { font: { bold: i === 2 } });
    put(row, 4, val, 'money', { font: { bold: i === 2 } });
    row.getCell(2).border = BORDER; row.getCell(3).border = BORDER;
  });
  widths(wsTQ, [18, 44, 18, 22, 20, 10, 22, 12]);
  wsTQ.views = [{ state: 'frozen', ySplit: 4 }];
  landscape(wsTQ, 4);
  const chartTop = fb + 6; // hàng (0-based) để đặt biểu đồ

  /* ---------- Tong_Hop_NCC ---------- */
  const ss = KT.supplierSummary(db);
  title(wsTH, 'A1', 'BÁO CÁO TỔNG HỢP CHI PHÍ THEO NHÀ CUNG CẤP / ĐỐI TƯỢNG');
  subtitle(wsTH, 'A2', 'Cập nhật tự động tổng số tiền thanh toán cho từng nhà cung cấp');
  header(wsTH, 4, ['Mã NCC', 'Tên Nhà Cung Cấp / Đối Tượng', 'Loại Đối Tượng', 'Tổng Giá Trị Thanh Toán (VND)', 'Số Lượng Giao Dịch']);
  const sIdx = new Map(suppliers.map((s, i) => [KT.keyOf(s.ma), 5 + i]));
  r = 5;
  ss.rows.forEach((s) => {
    const row = wsTH.getRow(r);
    const cr = s.inCatalog ? sIdx.get(KT.keyOf(s.ma)) : null;
    put(row, 1, cr ? F('Danh_Muc_NCC!A' + cr, s.ma) : s.ma);
    put(row, 2, cr ? F('Danh_Muc_NCC!B' + cr, s.ten) : s.ten, 'wrap');
    put(row, 3, cr ? F('IF(Danh_Muc_NCC!C' + cr + '="","",Danh_Muc_NCC!C' + cr + ')', s.loai || '') : '', 'wrap');
    put(row, 4, F('SUMIF(' + ledgerRange('F') + ',A' + r + ',' + ledgerRange('J') + ')', s.chi), 'money');
    put(row, 5, F('COUNTIF(' + ledgerRange('F') + ',A' + r + ')', s.soDong), 'int');
    r++;
  });
  const lastTH = Math.max(r - 1, 5);
  {
    const row = wsTH.getRow(lastTH + 1);
    row.getCell(1).value = 'Tổng cộng';
    row.getCell(4).value = F('SUM(D5:D' + lastTH + ')', ss.total.chi);
    row.getCell(5).value = F('SUM(E5:E' + lastTH + ')', ss.total.soDong);
    styleRow(row, 1, 5, { fill: TOTAL_FILL, font: { bold: true } });
    row.getCell(4).numFmt = MONEY;
    row.getCell(5).numFmt = '#,##0';
  }
  widths(wsTH, [24, 34, 26, 26, 14]);
  wsTH.views = [{ state: 'frozen', ySplit: 4 }];
  wsTH.autoFilter = 'A4:E' + lastTH;
  portrait(wsTH, 4);

  /* ---------- Phieu_Chi (chọn số phiếu -> 2 liên tự cập nhật) ---------- */
  buildDynamicVoucherSheet(wsPC, { settings, ledger, vouchers, LR, lastS, suppliers });

  let buffer = await wb.xlsx.writeBuffer({ zip: { compression: 'DEFLATE', compressionOptions: { level: 1 } } });
  if (chartCats.length) {
    buffer = await addColumnChart(buffer, {
      sheetName: 'Tong_Quan',
      title: 'So sánh Ngân sách và Chi phí thực tế theo Dự án',
      catRange: '$A$5:$A$' + lastTQ,
      categories: chartCats,
      series: [
        { name: 'Ngân Sách (VND)', nameCell: '$C$4', valRange: '$C$5:$C$' + lastTQ, values: chartBudget, color: '2A78D6' },
        { name: 'Tổng Chi Thực Tế (VND)', nameCell: '$D$4', valRange: '$D$5:$D$' + lastTQ, values: chartSpent, color: 'EB6834' }
      ],
      anchor: { fromCol: 0, fromRow: chartTop, toCol: 7, toRow: chartTop + 24 }
    });
  }
  return buffer;
}

function buildDynamicVoucherSheet(ws, ctx) {
  const { settings, ledger, vouchers, LR, lastS } = ctx;
  const L = LEDGER + '!';
  const showKTT = !!settings.hienKeToanTruong;
  voucherWidths(ws);
  ws.getColumn(9).width = 3;
  for (let c = 10; c <= 22; c++) { ws.getColumn(c).width = 14; ws.getColumn(c).hidden = true; }

  // Phiếu được chọn sẵn = phiếu mới nhất
  const sel = vouchers[0] || null;
  const isPT = sel ? sel.loai === 'thu' : false;
  const selNo = sel ? sel.soPhieu : '';

  /* ---- Vùng cấu hình (không in) ---- */
  const lab = (row, text) => {
    try { ws.mergeCells('A' + row + ':B' + row); } catch (e) { /* bỏ qua */ }
    const c = ws.getCell('A' + row);
    c.value = text;
    c.font = font({ bold: true });
    c.alignment = { vertical: 'middle' };
  };
  const inp = (range, value, f) => {
    ws.mergeCells(range);
    const c = ws.getCell(range.split(':')[0]);
    c.value = value;
    c.font = font(f);
    c.fill = INPUT_FILL;
    c.border = BORDER;
    c.alignment = { vertical: 'middle', horizontal: 'left' };
    return c;
  };
  const note = (range, text) => {
    ws.mergeCells(range);
    const c = ws.getCell(range.split(':')[0]);
    c.value = text;
    c.font = font({ italic: true, size: 10, color: { argb: 'FF7F7F7F' } });
    c.alignment = { vertical: 'middle', wrapText: true };
    return c;
  };

  ws.mergeCells('A1:H1');
  ws.getCell('A1').value = 'CẤU HÌNH & CHỌN PHIẾU — phần này không in ra';
  ws.getCell('A1').font = font({ bold: true, color: { argb: NAVY } });
  lab(2, 'Tên đơn vị'); inp('C2:H2', settings.tenDonVi || '');
  lab(3, 'Địa chỉ'); inp('C3:H3', settings.diaChi || '');
  lab(4, 'CHỌN SỐ PHIẾU');
  const c4 = inp('C4:D4', selNo, { bold: true, color: { argb: 'FF0000FF' } });
  c4.dataValidation = {
    type: 'list', allowBlank: true, showInputMessage: true, showErrorMessage: true,
    promptTitle: 'Chọn số phiếu', prompt: 'Bấm mũi tên để chọn phiếu cần in.',
    errorTitle: 'Số phiếu', error: 'Chọn số phiếu có trong sổ thu chi.',
    formulae: ['$L$5:$L$' + (4 + Math.max(vouchers.length, 1))]
  };
  note('E4:H4', F('IF($C$4="","← chọn phiếu cần in, cả hai liên bên dưới tự cập nhật",IF($Q$15=0,"(!) Không tìm thấy số phiếu này trong sổ","← phiếu có "&$Q$15&" dòng trong sổ"))',
    sel ? '← phiếu có ' + sel.soDong + ' dòng trong sổ' : '← chọn phiếu cần in, cả hai liên bên dưới tự cập nhật'));
  lab(5, 'Ngày (chỉ khi cần sửa)'); const c5 = inp('C5:D5', null); c5.numFmt = DATE_FMT;
  note('E5:H5', 'Để trống = lấy đúng ngày của phiếu trong sổ thu chi');
  lab(6, 'Người nhận/nộp (khi cần)'); inp('C6:H6', null);
  lab(7, 'Địa chỉ người nhận/nộp'); inp('C7:H7', null);
  lab(8, 'Hình thức');
  const c8 = inp('C8:D8', settings.hinhThucMacDinh || 'Tiền mặt');
  c8.dataValidation = { type: 'list', allowBlank: true, formulae: ['"Tiền mặt,Chuyển khoản"'] };
  lab(9, 'Kèm theo (số chứng từ)'); inp('C9:D9', null);
  note('E9:H9', 'Để trống = in dòng chấm để ghi tay');
  lab(10, 'Thủ quỹ (tên in dưới chữ ký)'); inp('C10:H10', settings.thuQuy || '');
  note('A11:H11', 'Ô vàng là ô nhập. Cột J:V là vùng tính toán đã ẩn — đừng xoá. Người nhận / địa chỉ để trống sẽ tự lấy theo Mã NCC (hoặc cột Người nhận) của sổ. Số phiếu bắt đầu bằng PT được in thành PHIẾU THU.');
  ws.getRow(11).height = 30;

  /* ---- Vùng tính toán ẩn: mỗi hàng r ứng với hàng r của sổ ---- */
  const hdr = (addr, text) => { const c = ws.getCell(addr); c.value = text; c.font = font({ bold: true, size: 10 }); };
  hdr('J4', 'Thứ tự dòng thuộc phiếu'); hdr('L4', 'Danh sách số phiếu'); hdr('M4', 'Người nhận (ứng viên)');
  hdr('N4', 'Nội dung (không trùng)'); hdr('O4', 'Địa chỉ (ứng viên)');
  const selKey = KT.voucherKey(selNo);
  const nccRange2 = 'Danh_Muc_NCC!$A$5:$B$' + lastS;
  const nccRange5 = 'Danh_Muc_NCC!$A$5:$E$' + lastS;
  const supIdx = KT.indexBy(ctx.suppliers);
  let count = 0;
  const seenNd = new Set();
  let firstPos = '';
  for (let r = 5; r <= LR; r++) {
    const e = ledger[r - 5];
    const inSel = e && selKey && KT.voucherKey(e.soPhieu) === selKey;
    if (inSel) { count++; if (!firstPos) firstPos = r - 4; }
    ws.getCell('J' + r).value = F('IF($C$4="","",IF(' + L + '$C' + r + '=$C$4,COUNTIF(' + L + '$C$5:$C' + r + ',$C$4),""))', inSel ? count : '');
    let mRes = '';
    let oRes = '';
    let nRes = '';
    if (inSel) {
      mRes = e.tenNCC ? e.tenNCC : String(e.nguoiNhan || '').trim();
      const sup = supIdx.get(KT.keyOf(e.maNCC));
      oRes = sup ? sup.diaChi || '' : '';
      const nd = String(e.noiDung || '');
      if (!seenNd.has(nd)) { seenNd.add(nd); nRes = nd.trim(); }
    }
    ws.getCell('M' + r).value = F('IF($J' + r + '="","",IFERROR(VLOOKUP(' + L + '$F' + r + ',' + nccRange2 + ',2,FALSE),IF(ISTEXT(' + L + '$L' + r + '),TRIM(' + L + '$L' + r + '),"")))', mRes);
    ws.getCell('N' + r).value = F('IF($J' + r + '="","",IF(SUMPRODUCT((' + L + '$C$5:$C' + r + '=$C$4)*(' + L + '$H$5:$H' + r + '=' + L + '$H' + r + '))=1,TRIM(' + L + '$H' + r + '&""),""))', nRes);
    ws.getCell('O' + r).value = F('IF($J' + r + '="","",IFERROR(VLOOKUP(' + L + '$F' + r + ',' + nccRange5 + ',5,FALSE)&"",""))', oRes);
  }
  vouchers.slice().reverse().forEach((v, i) => { ws.getCell('L' + (5 + i)).value = v.soPhieu; });

  // Khối đọc số tiền bằng chữ (giống file gốc)
  const amount = sel ? sel.soTien : 0;
  const groups = [Math.floor(amount / 1e9), Math.floor(amount / 1e6) % 1000, Math.floor(amount / 1e3) % 1000, amount % 1000];
  hdr('P5', 'Nhóm'); hdr('Q5', 'Giá trị'); hdr('R5', 'Trăm'); hdr('S5', 'Chục'); hdr('T5', 'Đơn vị'); hdr('U5', 'Nhóm đầu?'); hdr('V5', 'Chữ');
  const gNames = ['Tỷ', 'Triệu', 'Nghìn', 'Đồng'];
  const gFormulas = ['INT($Q$11/1000000000)', 'MOD(INT($Q$11/1000000),1000)', 'MOD(INT($Q$11/1000),1000)', 'MOD($Q$11,1000)'];
  let before = 0;
  for (let i = 0; i < 4; i++) {
    const r = 6 + i;
    const g = groups[i];
    const first = before === 0;
    ws.getCell('P' + r).value = gNames[i];
    ws.getCell('Q' + r).value = F(gFormulas[i], g);
    ws.getCell('R' + r).value = F('INT(Q' + r + '/100)', Math.floor(g / 100));
    ws.getCell('S' + r).value = F('MOD(INT(Q' + r + '/10),10)', Math.floor(g / 10) % 10);
    ws.getCell('T' + r).value = F('MOD(Q' + r + ',10)', g % 10);
    ws.getCell('U' + r).value = F('SUM(Q$5:Q' + (r - 1) + ')=0', first);
    const words = g === 0 ? '' : wordsGroupExcel(g, first);
    ws.getCell('V' + r).value = F('IF(Q' + r + '=0,"",IF(AND(R' + r + '=0,U' + r + '),"",CHOOSE(R' + r + '+1,"không","một","hai","ba","bốn","năm","sáu","bảy","tám","chín")&" trăm ")&IF(S' + r + '=0,IF(T' + r + '=0,"",IF(AND(R' + r + '=0,U' + r + '),"","linh ")),IF(S' + r + '=1,"mười ",CHOOSE(S' + r + '+1,"","","hai","ba","bốn","năm","sáu","bảy","tám","chín")&" mươi "))&IF(T' + r + '=0,"",IF(AND(T' + r + '=1,S' + r + '>=2),"mốt",IF(AND(T' + r + '=5,S' + r + '>=1),"lăm",CHOOSE(T' + r + '+1,"","một","hai","ba","bốn","năm","sáu","bảy","tám","chín")))))', words);
    before += g;
  }
  const lr = LR;
  const helper = [
    [10, 'Tổng tiền phiếu', F('IF($Q$15=0,0,IF($Q$19,SUMIF(' + L + '$C$5:$C$' + lr + ',$C$4,' + L + '$I$5:$I$' + lr + '),SUMIF(' + L + '$C$5:$C$' + lr + ',$C$4,' + L + '$J$5:$J$' + lr + ')))', amount)],
    [11, 'Tổng tiền (làm tròn)', F('ROUND($Q$10,0)', amount)],
    [12, 'Bằng chữ', F('IF($Q$11<=0,"",UPPER(LEFT(TRIM(V6&IF(Q6>0," tỷ","")&" "&V7&IF(Q7>0," triệu","")&" "&V8&IF(Q8>0," nghìn","")&" "&V9),1))&MID(TRIM(V6&IF(Q6>0," tỷ","")&" "&V7&IF(Q7>0," triệu","")&" "&V8&IF(Q8>0," nghìn","")&" "&V9),2,500)&" đồng")', sel ? sel.bangChu : '')],
    [13, 'Ngày in', F('IF(ISNUMBER($C$5),$C$5,IFERROR(IF(N(INDEX(' + L + '$B$5:$B$' + lr + ',$Q$16))>0,INDEX(' + L + '$B$5:$B$' + lr + ',$Q$16),""),""))', sel ? excelSerial(sel.ngayGoc) : '')],
    [14, 'Người nhận (tự lấy)', F('IFERROR(INDEX($M$5:$M$' + lr + ',MATCH("?*",$M$5:$M$' + lr + ',0)),"")', sel ? sel.nguoiNhanTuDong : '')],
    [15, 'Số dòng của phiếu', F('IF($C$4="",0,COUNTIF(' + L + '$C$5:$C$' + lr + ',$C$4))', sel ? sel.soDong : 0)],
    [16, 'Vị trí dòng đầu', F('IFERROR(MATCH(1,$J$5:$J$' + lr + ',0),"")', firstPos)],
    [17, 'Địa chỉ (tự lấy)', F('IFERROR(INDEX($O$5:$O$' + lr + ',MATCH("?*",$O$5:$O$' + lr + ',0)),"")', sel ? sel.diaChiTuDong : '')],
    [18, 'Lý do (từ cột Nội dung của sổ)', F('IF($Q$15=0,"",_xlfn.TEXTJOIN("; ",TRUE,$N$5:$N$' + lr + '))', sel ? sel.lyDoTuDong : '')],
    [19, 'Là phiếu thu?', F('LEFT($C$4,2)="PT"', isPT)]
  ];
  helper.forEach(([row, label, val]) => {
    ws.getCell('P' + row).value = label;
    ws.getCell('Q' + row).value = val;
  });
  ws.getCell('Q13').numFmt = DATE_FMT;

  /* ---- Vùng in: 2 liên ---- */
  const dateF = 'IF($Q$13="","Ngày ...... tháng ...... năm ..........","Ngày "&IF(DAY($Q$13)<10,"0","")&DAY($Q$13)&" tháng "&IF(MONTH($Q$13)<10,"0","")&MONTH($Q$13)&" năm "&YEAR($Q$13))';
  const v = {
    company: F('$C$2', settings.tenDonVi || ''),
    address: F('$C$3', settings.diaChi || ''),
    soText: F('"Số: "&$C$4', 'Số: ' + selNo),
    title: F('IF($Q$19,"PHIẾU THU","PHIẾU CHI")', isPT ? 'PHIẾU THU' : 'PHIẾU CHI'),
    ngayText: F(dateF, sel ? KT.ngayChu(sel.ngayGoc) : KT.ngayChu('')),
    nhanLabel: F('IF($Q$19,"Họ và tên người nộp tiền:","Họ và tên người nhận tiền:")', isPT ? 'Họ và tên người nộp tiền:' : 'Họ và tên người nhận tiền:'),
    nguoiNhan: F('IF(TRIM($C$6)<>"",TRIM($C$6),$Q$14)', sel ? sel.nguoiNhanTuDong : ''),
    diaChi: F('IF(TRIM($C$7)<>"",TRIM($C$7),$Q$17)', sel ? sel.diaChiTuDong : ''),
    lyDoLabel: F('IF($Q$19,"Lý do nộp:","Lý do chi:")', isPT ? 'Lý do nộp:' : 'Lý do chi:'),
    lyDo: F('$Q$18', sel ? sel.lyDoTuDong : ''),
    soTien: F('IF($Q$15=0,"",$Q$10)', sel ? amount : ''),
    hinhThuc: F('$C$8', settings.hinhThucMacDinh || 'Tiền mặt'),
    bangChu: F('$Q$12', sel ? sel.bangChu : ''),
    kemTheo: F('IF(TRIM($C$9)="","................",TRIM($C$9))&" chứng từ gốc"', '................ chứng từ gốc'),
    sigNhan: F('IF($Q$19,"Người nộp tiền","Người nhận tiền")', isPT ? 'Người nộp tiền' : 'Người nhận tiền'),
    thuQuy: F('TRIM($C$10)', settings.thuQuy || ''),
    giamDoc: settings.giamDoc || '',
    keToanTruong: settings.keToanTruong || ''
  };
  const span = writeVoucherLayout(ws, 13, v, showKTT);
  voucherPageSetup(ws, span.first, span.last);
}

// Tái hiện kết quả công thức cột V (để lưu sẵn giá trị khi chưa tính lại)
function wordsGroupExcel(g, first) {
  const CS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const R = Math.floor(g / 100);
  const S = Math.floor(g / 10) % 10;
  const T = g % 10;
  let s = (R === 0 && first) ? '' : CS[R] + ' trăm ';
  if (S === 0) s += T === 0 ? '' : ((R === 0 && first) ? '' : 'linh ');
  else if (S === 1) s += 'mười ';
  else s += ['', '', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'][S] + ' mươi ';
  if (T !== 0) {
    if (T === 1 && S >= 2) s += 'mốt';
    else if (T === 5 && S >= 1) s += 'lăm';
    else s += ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'][T];
  }
  return s;
}

/* =====================================================================
 * SỔ THU CHI THEO BỘ LỌC
 * ===================================================================== */
function filterDescription(db, f) {
  const parts = [];
  if (f.duAn === '__none__') parts.push('Dự án: (chưa gán dự án)');
  else if (f.duAn) parts.push('Dự án: ' + f.duAn + (KT.projectName(db, f.duAn) ? ' - ' + KT.projectName(db, f.duAn) : ''));
  if (f.ncc === '__none__') parts.push('NCC: (chưa gán NCC)');
  else if (f.ncc) {
    const s = KT.indexBy(db.suppliers).get(KT.keyOf(f.ncc));
    parts.push('NCC: ' + f.ncc + (s ? ' - ' + s.ten : ''));
  }
  if (f.loai === 'thu') parts.push('Chỉ các khoản thu');
  if (f.loai === 'chi') parts.push('Chỉ các khoản chi');
  if (f.q) parts.push('Tìm: "' + f.q + '"');
  return parts.join('   |   ');
}

function companyHeader(ws, settings, lastColLetter, reportTitle, periodText, extraLine) {
  ws.mergeCells('A1:' + lastColLetter + '1');
  ws.getCell('A1').value = settings.tenDonVi || '';
  ws.getCell('A1').font = font({ bold: true, color: { argb: NAVY } });
  ws.mergeCells('A2:' + lastColLetter + '2');
  ws.getCell('A2').value = settings.diaChi || '';
  ws.getCell('A2').font = font({ size: 11 });
  ws.mergeCells('A4:' + lastColLetter + '4');
  ws.getCell('A4').value = reportTitle;
  ws.getCell('A4').font = font({ bold: true, size: 16, color: { argb: NAVY } });
  ws.getCell('A4').alignment = { horizontal: 'center' };
  ws.mergeCells('A5:' + lastColLetter + '5');
  ws.getCell('A5').value = periodText;
  ws.getCell('A5').font = font({ italic: true });
  ws.getCell('A5').alignment = { horizontal: 'center' };
  if (extraLine) {
    ws.mergeCells('A6:' + lastColLetter + '6');
    ws.getCell('A6').value = extraLine;
    ws.getCell('A6').font = font({ italic: true, size: 11, color: { argb: 'FF595959' } });
    ws.getCell('A6').alignment = { horizontal: 'center' };
  }
}

function signatureBlock(ws, row, settings, cols) {
  // cols: [[colFrom, colTo, label, name], ...]
  if (cols[cols.length - 1][0] !== cols[cols.length - 1][1]) ws.mergeCells(cols[cols.length - 1][0] + row + ':' + cols[cols.length - 1][1] + row);
  const d = KT.todayISO().split('-');
  ws.getCell(cols[cols.length - 1][0] + row).value = 'Ngày ' + d[2] + ' tháng ' + d[1] + ' năm ' + d[0];
  ws.getCell(cols[cols.length - 1][0] + row).font = font({ italic: true });
  ws.getCell(cols[cols.length - 1][0] + row).alignment = { horizontal: 'center' };
  const mergeIf = (a, b, r) => { if (a !== b) ws.mergeCells(a + r + ':' + b + r); };
  cols.forEach(([a, b, label, name]) => {
    mergeIf(a, b, row + 1);
    ws.getCell(a + (row + 1)).value = label;
    ws.getCell(a + (row + 1)).font = font({ bold: true });
    ws.getCell(a + (row + 1)).alignment = { horizontal: 'center' };
    mergeIf(a, b, row + 2);
    ws.getCell(a + (row + 2)).value = '(Ký, họ tên)';
    ws.getCell(a + (row + 2)).font = font({ italic: true, size: 11 });
    ws.getCell(a + (row + 2)).alignment = { horizontal: 'center' };
    if (name) {
      mergeIf(a, b, row + 6);
      ws.getCell(a + (row + 6)).value = name;
      ws.getCell(a + (row + 6)).font = font({ bold: true });
      ws.getCell(a + (row + 6)).alignment = { horizontal: 'center' };
    }
  });
}

async function buildLedgerWorkbook(db, f) {
  f = f || {};
  const settings = db.settings || {};
  const ledger = KT.buildLedger(db);
  const res = KT.filterLedger(ledger, f);
  const wb = newWorkbook();
  const ws = wb.addWorksheet('So_Thu_Chi');
  const desc = filterDescription(db, f);
  companyHeader(ws, settings, 'M', 'SỔ THU CHI & TỒN QUỸ', KT.describeRange(f.from, f.to), desc);
  const H = 8;
  header(ws, H, ['STT', 'Ngày', 'Số Phiếu', 'Mã Dự Án', 'Tên Dự Án', 'Mã NCC', 'Tên Nhà Cung Cấp / Đối Tượng',
    'Nội Dung Thu / Chi', 'Số Tiền Thu (VND)', 'Số Tiền Chi (VND)', 'Tồn Quỹ (VND)', 'Người nhận', 'Ghi Chú']);
  let r = H + 1;
  {
    const row = ws.getRow(r);
    for (let c = 1; c <= 13; c++) put(row, c, null);
    row.getCell(8).value = 'Số dư quỹ đầu kỳ';
    row.getCell(11).value = res.tonDauKy;
    row.getCell(11).numFmt = MONEY;
    styleRow(row, 1, 13, { fill: SUB_FILL, font: { bold: true, italic: true } });
    r++;
  }
  const first = r;
  res.rows.forEach((e, i) => {
    const row = ws.getRow(r);
    put(row, 1, i + 1, 'center');
    put(row, 2, excelDate(e.ngay), 'date');
    put(row, 3, e.soPhieu || '', 'center');
    put(row, 4, e.maDuAn || '');
    put(row, 5, e.tenDuAn || '', 'wrap');
    put(row, 6, e.maNCC || '');
    put(row, 7, e.tenNCC || '', 'wrap');
    put(row, 8, e.noiDung || '', 'wrap');
    put(row, 9, e.thu || 0, 'money');
    put(row, 10, e.chi || 0, 'money');
    put(row, 11, e.ton, 'money');
    put(row, 12, e.nguoiNhan || '', 'wrap');
    put(row, 13, e.ghiChu || '', 'wrap');
    r++;
  });
  const last = Math.max(r - 1, first);
  {
    const row = ws.getRow(r);
    for (let c = 1; c <= 13; c++) put(row, c, null);
    row.getCell(8).value = 'Cộng phát sinh trong kỳ';
    row.getCell(9).value = F('SUM(I' + first + ':I' + last + ')', res.tongThu);
    row.getCell(10).value = F('SUM(J' + first + ':J' + last + ')', res.tongChi);
    styleRow(row, 1, 13, { fill: TOTAL_FILL, font: { bold: true } });
    [9, 10].forEach((c) => { row.getCell(c).numFmt = MONEY; });
    r++;
    const row2 = ws.getRow(r);
    for (let c = 1; c <= 13; c++) put(row2, c, null);
    row2.getCell(8).value = 'Tồn quỹ cuối kỳ';
    row2.getCell(11).value = res.tonCuoiKy;
    row2.getCell(11).numFmt = MONEY;
    styleRow(row2, 1, 13, { fill: TOTAL_FILL, font: { bold: true } });
    r++;
  }
  signatureBlock(ws, r + 2, settings, [
    ['B', 'D', 'Người lập biểu', settings.nguoiLap || ''],
    ['E', 'G', 'Kế toán trưởng', settings.keToanTruong || ''],
    ['H', 'H', 'Thủ quỹ', settings.thuQuy || ''],
    ['I', 'K', 'Giám đốc', settings.giamDoc || '']
  ]);
  widths(ws, [7, 12, 12, 16, 30, 18, 24, 44, 17, 17, 17, 18, 24]);
  ws.views = [{ state: 'frozen', ySplit: H }];
  ws.autoFilter = 'A' + H + ':M' + last;
  landscape(ws, H);
  return wb.xlsx.writeBuffer({ zip: { compression: 'DEFLATE', compressionOptions: { level: 1 } } });
}

/* =====================================================================
 * BÁO CÁO DỰ ÁN (tổng hợp + chi tiết)
 * ===================================================================== */
async function buildProjectWorkbook(db, f) {
  f = f || {};
  const settings = db.settings || {};
  const ps = KT.projectSummary(db, f);
  const ledger = KT.buildLedger(db).filter((e) => KT.inRange(e.ngay, f.from, f.to));
  const wb = newWorkbook();
  const ws = wb.addWorksheet('Tong_Quan');
  companyHeader(ws, settings, 'H', 'BÁO CÁO TỔNG HỢP CHI PHÍ THEO DỰ ÁN', KT.describeRange(f.from, f.to));
  const H = 7;
  header(ws, H, ['Mã Dự Án', 'Tên Dự Án', 'Ngân Sách (VND)', 'Tổng Chi Thực Tế (VND)', 'Chênh lệch (VND)', 'Tỉ lệ', 'Trạng Thái Ngân Sách', 'Số giao dịch']);
  let r = H + 1;
  ps.rows.forEach((p) => {
    const row = ws.getRow(r);
    put(row, 1, p.ma);
    put(row, 2, p.ten, 'wrap');
    put(row, 3, p.nganSach || 0, 'money');
    put(row, 4, p.chi, 'money');
    put(row, 5, F('C' + r + '-D' + r, p.chenhLech), 'money');
    put(row, 6, F('IF(C' + r + '>0,D' + r + '/C' + r + ',0)', p.tiLe), 'pct');
    put(row, 7, F(statusFormula('C' + r, 'D' + r), KT.STATUS_TEXT[p.status]), 'center');
    put(row, 8, p.soDong, 'int');
    r++;
  });
  const first = H + 1;
  const last = Math.max(r - 1, first);
  const tr = r;
  {
    const row = ws.getRow(tr);
    row.getCell(1).value = 'Tổng cộng';
    row.getCell(3).value = F('SUM(C' + first + ':C' + last + ')', ps.total.nganSach);
    row.getCell(4).value = F('SUM(D' + first + ':D' + last + ')', ps.total.chi);
    row.getCell(5).value = F('SUM(E' + first + ':E' + last + ')', ps.total.chenhLech);
    row.getCell(6).value = F('IF(C' + tr + '>0,D' + tr + '/C' + tr + ',0)', ps.total.nganSach > 0 ? ps.total.chi / ps.total.nganSach : 0);
    row.getCell(8).value = F('SUM(H' + first + ':H' + last + ')', ps.total.soDong);
    styleRow(row, 1, 8, { fill: TOTAL_FILL, font: { bold: true } });
    [3, 4, 5].forEach((c) => { row.getCell(c).numFmt = MONEY; });
    row.getCell(6).numFmt = '0.0%';
    row.getCell(8).numFmt = '#,##0';
  }
  {
    const row = ws.getRow(tr + 1);
    row.getCell(1).value = 'Chi chưa gán dự án';
    row.getCell(4).value = ps.khongDuAn.chi;
    row.getCell(8).value = ps.khongDuAn.soDong;
    styleRow(row, 1, 8, { font: { italic: true } });
    row.getCell(4).numFmt = MONEY;
  }
  addStatusFormatting(ws, 'G' + first + ':G' + last);
  widths(ws, [18, 44, 18, 22, 20, 10, 22, 12]);
  ws.views = [{ state: 'frozen', ySplit: H }];
  landscape(ws, H);
  const chartTop = tr + 3;

  // Chi tiết theo dự án
  const wd = wb.addWorksheet('Chi_Tiet_Theo_Du_An');
  companyHeader(wd, settings, 'I', 'SỔ CHI TIẾT THU CHI THEO DỰ ÁN', KT.describeRange(f.from, f.to));
  header(wd, 7, ['Ngày', 'Số Phiếu', 'Mã NCC', 'Tên NCC / Đối Tượng', 'Nội Dung', 'Thu (VND)', 'Chi (VND)', 'Người nhận', 'Ghi Chú']);
  let d = 8;
  const groups = [];
  ps.rows.forEach((p) => groups.push({ key: KT.keyOf(p.ma), label: p.ma + ' — ' + p.ten }));
  groups.push({ key: '', label: '(Chưa gán dự án)' });
  const sumRows = [];
  groups.forEach((g) => {
    const rows = ledger.filter((e) => KT.keyOf(e.maDuAn) === g.key);
    if (!rows.length) return;
    wd.mergeCells('A' + d + ':I' + d);
    wd.getCell('A' + d).value = g.label;
    wd.getCell('A' + d).font = font({ bold: true, color: { argb: NAVY } });
    wd.getCell('A' + d).fill = SUB_FILL;
    d++;
    const s = d;
    rows.forEach((e) => {
      const row = wd.getRow(d);
      put(row, 1, excelDate(e.ngay), 'date');
      put(row, 2, e.soPhieu || '', 'center');
      put(row, 3, e.maNCC || '');
      put(row, 4, e.tenNCC || '', 'wrap');
      put(row, 5, e.noiDung || '', 'wrap');
      put(row, 6, e.thu || 0, 'money');
      put(row, 7, e.chi || 0, 'money');
      put(row, 8, e.nguoiNhan || '', 'wrap');
      put(row, 9, e.ghiChu || '', 'wrap');
      d++;
    });
    const row = wd.getRow(d);
    row.getCell(5).value = 'Cộng ' + (g.key ? rows[0].maDuAn : 'chưa gán dự án');
    row.getCell(6).value = F('SUM(F' + s + ':F' + (d - 1) + ')', rows.reduce((t, e) => t + (e.thu || 0), 0));
    row.getCell(7).value = F('SUM(G' + s + ':G' + (d - 1) + ')', rows.reduce((t, e) => t + (e.chi || 0), 0));
    styleRow(row, 1, 9, { fill: TOTAL_FILL, font: { bold: true } });
    [6, 7].forEach((c) => { row.getCell(c).numFmt = MONEY; });
    sumRows.push(d);
    d += 2;
  });
  if (sumRows.length) {
    const row = wd.getRow(d);
    row.getCell(5).value = 'TỔNG CỘNG';
    row.getCell(6).value = F(sumRows.map((x) => 'F' + x).join('+'), ledger.reduce((t, e) => t + (e.thu || 0), 0));
    row.getCell(7).value = F(sumRows.map((x) => 'G' + x).join('+'), ledger.reduce((t, e) => t + (e.chi || 0), 0));
    styleRow(row, 1, 9, { fill: TOTAL_FILL, font: { bold: true } });
    [6, 7].forEach((c) => { row.getCell(c).numFmt = MONEY; });
  }
  widths(wd, [12, 12, 18, 24, 46, 16, 16, 18, 22]);
  wd.views = [{ state: 'frozen', ySplit: 7 }];
  landscape(wd, 7);

  let buffer = await wb.xlsx.writeBuffer({ zip: { compression: 'DEFLATE', compressionOptions: { level: 1 } } });
  if (ps.rows.length) {
    buffer = await addColumnChart(buffer, {
      sheetName: 'Tong_Quan',
      title: 'So sánh Ngân sách và Chi phí thực tế theo Dự án',
      catRange: '$A$' + first + ':$A$' + last,
      categories: ps.rows.map((p) => p.ma),
      series: [
        { name: 'Ngân Sách (VND)', nameCell: '$C$' + H, valRange: '$C$' + first + ':$C$' + last, values: ps.rows.map((p) => p.nganSach), color: '2A78D6' },
        { name: 'Tổng Chi Thực Tế (VND)', nameCell: '$D$' + H, valRange: '$D$' + first + ':$D$' + last, values: ps.rows.map((p) => p.chi), color: 'EB6834' }
      ],
      anchor: { fromCol: 0, fromRow: chartTop, toCol: 7, toRow: chartTop + 24 }
    });
  }
  return buffer;
}

/* =====================================================================
 * BÁO CÁO NHÀ CUNG CẤP (tổng hợp + chi tiết)
 * ===================================================================== */
async function buildSupplierWorkbook(db, f) {
  f = f || {};
  const settings = db.settings || {};
  const ss = KT.supplierSummary(db, f);
  const rowsAll = f.chiCoPhatSinh ? ss.rows.filter((s) => s.soDong > 0) : ss.rows;
  const ledger = KT.buildLedger(db).filter((e) => KT.inRange(e.ngay, f.from, f.to));
  const wb = newWorkbook();
  const ws = wb.addWorksheet('Tong_Hop_NCC');
  companyHeader(ws, settings, 'F', 'BÁO CÁO TỔNG HỢP THANH TOÁN THEO NHÀ CUNG CẤP / ĐỐI TƯỢNG', KT.describeRange(f.from, f.to));
  const H = 7;
  header(ws, H, ['Mã NCC', 'Tên Nhà Cung Cấp / Đối Tượng', 'Loại Đối Tượng', 'Tổng Giá Trị Thanh Toán (VND)', 'Tổng Thu (VND)', 'Số Lượng Giao Dịch']);
  let r = H + 1;
  rowsAll.forEach((s) => {
    const row = ws.getRow(r);
    put(row, 1, s.ma);
    put(row, 2, s.ten, 'wrap');
    put(row, 3, s.loai || '', 'wrap');
    put(row, 4, s.chi, 'money');
    put(row, 5, s.thu, 'money');
    put(row, 6, s.soDong, 'int');
    r++;
  });
  const first = H + 1;
  const last = Math.max(r - 1, first);
  {
    const row = ws.getRow(r);
    row.getCell(1).value = 'Tổng cộng';
    row.getCell(4).value = F('SUM(D' + first + ':D' + last + ')', rowsAll.reduce((t, s) => t + s.chi, 0));
    row.getCell(5).value = F('SUM(E' + first + ':E' + last + ')', rowsAll.reduce((t, s) => t + s.thu, 0));
    row.getCell(6).value = F('SUM(F' + first + ':F' + last + ')', rowsAll.reduce((t, s) => t + s.soDong, 0));
    styleRow(row, 1, 6, { fill: TOTAL_FILL, font: { bold: true } });
    [4, 5].forEach((c) => { row.getCell(c).numFmt = MONEY; });
    row.getCell(6).numFmt = '#,##0';
  }
  widths(ws, [24, 34, 26, 26, 18, 14]);
  ws.views = [{ state: 'frozen', ySplit: H }];
  ws.autoFilter = 'A' + H + ':F' + last;
  portrait(ws, H);

  const wd = wb.addWorksheet('Chi_Tiet_Theo_NCC');
  companyHeader(wd, settings, 'I', 'SỔ CHI TIẾT THANH TOÁN THEO NHÀ CUNG CẤP', KT.describeRange(f.from, f.to));
  header(wd, 7, ['Ngày', 'Số Phiếu', 'Mã Dự Án', 'Tên Dự Án', 'Nội Dung', 'Thu (VND)', 'Chi (VND)', 'Người nhận', 'Ghi Chú']);
  let d = 8;
  const sumRows = [];
  rowsAll.concat([{ ma: '', ten: '(Chưa gán NCC)' }]).forEach((s) => {
    const rows = ledger.filter((e) => KT.keyOf(e.maNCC) === KT.keyOf(s.ma));
    if (!rows.length) return;
    wd.mergeCells('A' + d + ':I' + d);
    wd.getCell('A' + d).value = s.ma ? s.ma + ' — ' + s.ten : s.ten;
    wd.getCell('A' + d).font = font({ bold: true, color: { argb: NAVY } });
    wd.getCell('A' + d).fill = SUB_FILL;
    d++;
    const st = d;
    rows.forEach((e) => {
      const row = wd.getRow(d);
      put(row, 1, excelDate(e.ngay), 'date');
      put(row, 2, e.soPhieu || '', 'center');
      put(row, 3, e.maDuAn || '');
      put(row, 4, e.tenDuAn || '', 'wrap');
      put(row, 5, e.noiDung || '', 'wrap');
      put(row, 6, e.thu || 0, 'money');
      put(row, 7, e.chi || 0, 'money');
      put(row, 8, e.nguoiNhan || '', 'wrap');
      put(row, 9, e.ghiChu || '', 'wrap');
      d++;
    });
    const row = wd.getRow(d);
    row.getCell(5).value = 'Cộng ' + (s.ma || 'chưa gán NCC');
    row.getCell(6).value = F('SUM(F' + st + ':F' + (d - 1) + ')', rows.reduce((t, e) => t + (e.thu || 0), 0));
    row.getCell(7).value = F('SUM(G' + st + ':G' + (d - 1) + ')', rows.reduce((t, e) => t + (e.chi || 0), 0));
    styleRow(row, 1, 9, { fill: TOTAL_FILL, font: { bold: true } });
    [6, 7].forEach((c) => { row.getCell(c).numFmt = MONEY; });
    sumRows.push(d);
    d += 2;
  });
  widths(wd, [12, 12, 16, 28, 46, 16, 16, 18, 22]);
  wd.views = [{ state: 'frozen', ySplit: 7 }];
  landscape(wd, 7);
  return wb.xlsx.writeBuffer({ zip: { compression: 'DEFLATE', compressionOptions: { level: 1 } } });
}

/* =====================================================================
 * MỘT PHIẾU THU / CHI
 * ===================================================================== */
async function buildVoucherWorkbook(db, soPhieu) {
  const settings = db.settings || {};
  const v = KT.buildVouchers(db).find((x) => x.key === KT.voucherKey(soPhieu));
  if (!v) { const err = new Error('Không tìm thấy phiếu ' + soPhieu); err.status = 404; throw err; }
  const wb = newWorkbook();
  const ws = wb.addWorksheet(v.loai === 'thu' ? 'Phieu_Thu' : 'Phieu_Chi');
  voucherWidths(ws);
  const span = writeVoucherLayout(ws, 1, staticVoucherValues(v, settings), !!settings.hienKeToanTruong);
  voucherPageSetup(ws, span.first, span.last);

  // Sheet chi tiết các dòng của phiếu
  const wd = wb.addWorksheet('Chi_Tiet_Phieu');
  title(wd, 'A1', 'CHI TIẾT PHIẾU ' + v.soPhieu, 14);
  header(wd, 3, ['STT', 'Ngày', 'Mã Dự Án', 'Tên Dự Án', 'Mã NCC', 'Nội Dung', 'Số Tiền (VND)', 'Người nhận', 'Ghi Chú']);
  v.lines.forEach((e, i) => {
    const row = wd.getRow(4 + i);
    put(row, 1, i + 1, 'center');
    put(row, 2, excelDate(e.ngay), 'date');
    put(row, 3, e.maDuAn || '');
    put(row, 4, e.tenDuAn || '', 'wrap');
    put(row, 5, e.maNCC || '');
    put(row, 6, e.noiDung || '', 'wrap');
    put(row, 7, v.loai === 'thu' ? e.thu : e.chi, 'money');
    put(row, 8, e.nguoiNhan || '', 'wrap');
    put(row, 9, e.ghiChu || '', 'wrap');
  });
  const lr = 3 + v.lines.length;
  const row = wd.getRow(lr + 1);
  row.getCell(6).value = 'Tổng cộng';
  row.getCell(7).value = F('SUM(G4:G' + lr + ')', v.soTien);
  styleRow(row, 1, 9, { fill: TOTAL_FILL, font: { bold: true } });
  row.getCell(7).numFmt = MONEY;
  widths(wd, [7, 12, 16, 30, 18, 44, 18, 18, 22]);
  landscape(wd, 3);
  return wb.xlsx.writeBuffer({ zip: { compression: 'DEFLATE', compressionOptions: { level: 1 } } });
}

module.exports = {
  buildFullWorkbook,
  buildLedgerWorkbook,
  buildProjectWorkbook,
  buildSupplierWorkbook,
  buildVoucherWorkbook,
  wordsGroupExcel,
  // tiện ích định dạng dùng lại cho file chi phí công trình (lib/costExporter.js)
  _h: { font, F, excelDate, newWorkbook, title, subtitle, header, put, styleRow, widths, landscape, portrait, companyHeader, signatureBlock,
    TOTAL_FILL, SUB_FILL, INPUT_FILL, BORDER, MONEY, NAVY, DATE_FMT }
};
