'use strict';
/*
 * Xuất Excel CHI PHÍ CÔNG TRÌNH theo cấu trúc file mẫu ChiPhi_CongTrinh:
 *   TONGHOP, NHATKYCHUNG, CHI_TIET_THEO_NHOM, CONGNO_NCC, SO_QUY, GIA_VATTU,
 *   DM_CONGTRINH, DM_NHA, DM_NHOM, DM_HANGMUC, DM_VATTU, DM_NCC.
 * Giữ công thức: INDEX/MATCH tra tên từ danh mục, Thành tiền = ROUND(SL × Đơn giá), SUMIFS tổng hợp,
 * công nợ = SUMIFS(chi phí) − SUMIFS(sổ quỹ). File xuất ra nhập lại được vào phần mềm.
 * Mọi con số tính sẵn (giá trị lưu kèm công thức) lấy từ public/js/shared.js để khớp với màn hình.
 */
const KT = require('../public/js/shared.js');
const { addColumnChart } = require('./chart');
const JSZip = require('jszip');
const { _h } = require('./exporter');

const { font, F, excelDate, newWorkbook, title, subtitle, header, put, styleRow, widths, landscape, portrait, companyHeader, signatureBlock,
  TOTAL_FILL, SUB_FILL, MONEY, NAVY } = _h;

const GROUP_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
const ITEM_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
const CALC_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
const QTY_FMT = '#,##0.####;-#,##0.####;0';

const NKC = 'NHATKYCHUNG';
const q = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
const abs = (col, row) => '$' + col + '$' + row;

// Tiêu đề kiểu bảng dữ liệu (dòng 1, như các sheet DM_ / NHATKYCHUNG của file mẫu); cột công thức tô xám
function dataHeader(ws, labels, calcCols) {
  header(ws, 1, labels);
  (calcCols || []).forEach((c) => {
    ws.getRow(1).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7F7F7F' } };
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function calc(cell) { cell.fill = CALC_FILL; return cell; }

function qtyCell(row, col, v) {
  const c = put(row, col, v, 'money');
  c.numFmt = QTY_FMT;
  return c;
}

function linkCell(cell, target, label) {
  cell.value = { formula: 'HYPERLINK("#' + target + '",' + q(label) + ')', result: label };
  cell.font = font({ color: { argb: 'FF2F5DAA' }, underline: true });
  return cell;
}

// Giới hạn dữ liệu theo 1 công trình (nếu có)
function scope(db, f) {
  const ct = f && f.ct ? f.ct : '';
  const inCT = (x, field) => !ct || KT.keyOf(x[field]) === KT.keyOf(ct);
  const view = Object.assign({}, db, {
    costs: (db.costs || []).filter((c) => inCT(c, 'maCT')),
    entries: (db.entries || []).filter((e) => inCT(e, 'maDuAn'))
  });
  return { ct, view };
}

// ExcelJS ghi <outlinePr> sau <pageSetUpPr> trong <sheetPr>, sai thứ tự lược đồ nên Excel không mở được file.
// Sắp lại: tabColor, outlinePr, pageSetUpPr.
async function fixSheetPrOrder(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.keys(zip.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f));
  for (const f of files) {
    const xml = await zip.file(f).async('string');
    const fixed = xml.replace(/<sheetPr([^>]*)>([\s\S]*?)<\/sheetPr>/, (m, attrs, inner) => {
      const pick = (tag) => (inner.match(new RegExp('<' + tag + '\\b[^>]*/>')) || [''])[0];
      const order = ['tabColor', 'outlinePr', 'pageSetUpPr'];
      const rest = order.reduce((t, tag) => t.replace(pick(tag), ''), inner);
      return '<sheetPr' + attrs + '>' + order.map(pick).join('') + rest + '</sheetPr>';
    });
    if (fixed !== xml) zip.file(f, fixed);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 1 } });
}

/* =====================================================================
 * FILE CHI PHÍ ĐẦY ĐỦ
 * ===================================================================== */
async function buildCostWorkbook(db, f) {
  const { ct, view } = scope(db, f);
  const settings = db.settings || {};
  const ledger = KT.buildCostLedger(view);
  const summary = KT.costSummary(view, {}, ledger);
  const debt = KT.supplierDebt(view, {});
  const wb = newWorkbook();

  const wsTH = wb.addWorksheet('TONGHOP', { properties: { tabColor: { argb: 'FF1F4E78' } } });
  const wsNK = wb.addWorksheet(NKC, { properties: { tabColor: { argb: 'FF2A78D6' } } });
  const wsCT = wb.addWorksheet('CHI_TIET_THEO_NHOM');
  const wsCN = wb.addWorksheet('CONGNO_NCC', { properties: { tabColor: { argb: 'FFEB6834' } } });
  const wsCNCT = wb.addWorksheet('CONGNO_CONGTRINH', { properties: { tabColor: { argb: 'FFEB6834' } } });
  const wsSQ = wb.addWorksheet('SO_QUY');
  const wsGia = wb.addWorksheet('GIA_VATTU');
  const wsDCT = wb.addWorksheet('DM_CONGTRINH');
  const wsNha = wb.addWorksheet('DM_NHA');
  const wsNhom = wb.addWorksheet('DM_NHOM');
  const wsHM = wb.addWorksheet('DM_HANGMUC');
  const wsVT = wb.addWorksheet('DM_VATTU');
  const wsNCC = wb.addWorksheet('DM_NCC');

  /* ---------- DM_NHOM ---------- */
  dataHeader(wsNhom, ['Mã nhóm', 'Tên nhóm CP', 'Ghi chú']);
  const groupRow = new Map();
  (db.costGroups || []).forEach((g, i) => {
    const row = wsNhom.getRow(2 + i);
    put(row, 1, g.ma); put(row, 2, g.ten, 'wrap'); put(row, 3, g.ghiChu || '', 'wrap');
    groupRow.set(KT.keyOf(g.ma), 2 + i);
  });
  subtitle(wsNhom, 'E1', 'Đổi tên nhóm ở cột B: DM_HANGMUC, TONGHOP tự đổi theo.');
  widths(wsNhom, [24, 34, 40]);

  /* ---------- DM_HANGMUC ---------- */
  dataHeader(wsHM, ['Mã HM', 'Nhóm CP', 'Hạng mục', 'Mã nhóm', 'Ghi chú'], [2]);
  const gIdx = KT.indexBy(db.costGroups);
  const itemRow = new Map();
  (db.costItems || []).forEach((it, i) => {
    const r = 2 + i;
    const row = wsHM.getRow(r);
    const g = gIdx.get(KT.keyOf(it.maNhom));
    put(row, 1, it.ma);
    calc(put(row, 2, F('IFERROR(INDEX(DM_NHOM!$B:$B,MATCH($D' + r + ',DM_NHOM!$A:$A,0)),"")', g ? g.ten : ''), 'wrap'));
    put(row, 3, it.ten, 'wrap');
    put(row, 4, it.maNhom || '');
    put(row, 5, it.ghiChu || '', 'wrap');
    itemRow.set(KT.keyOf(it.ma), r);
  });
  widths(wsHM, [10, 26, 34, 24, 30]);

  /* ---------- DM_VATTU ---------- */
  const mstats = new Map(KT.materialStats(view).map((m) => [KT.keyOf(m.ma), m]));
  const iIdx = KT.indexBy(db.costItems);
  dataHeader(wsVT, ['Mã VT', 'Tên vật tư', 'ĐVT chuẩn', 'Hạng mục hay dùng', 'Số lần đã mua', 'Tổng đã mua (đ)', 'Loại CP mặc định', 'Ghi chú'], [5, 6]);
  (db.materials || []).forEach((m, i) => {
    const r = 2 + i;
    const row = wsVT.getRow(r);
    const st = mstats.get(KT.keyOf(m.ma)) || { soLan: 0, tongTien: 0 };
    const it = iIdx.get(KT.keyOf(m.maHM));
    put(row, 1, m.ma); put(row, 2, m.ten, 'wrap'); put(row, 3, m.dvt || '', 'center'); put(row, 4, it ? it.ten : '', 'wrap');
    calc(put(row, 5, F('COUNTIFS(' + NKC + '!$G:$G,$A' + r + ')', st.soLan), 'int'));
    calc(put(row, 6, F('SUMIFS(' + NKC + '!$M:$M,' + NKC + '!$G:$G,$A' + r + ')', st.tongTien), 'money'));
    put(row, 7, m.loaiCP || '', 'center'); put(row, 8, m.ghiChu || '', 'wrap');
  });
  widths(wsVT, [22, 34, 10, 24, 12, 18, 14, 26]);
  wsVT.autoFilter = 'A1:H' + (1 + Math.max((db.materials || []).length, 1));

  /* ---------- DM_NCC ---------- */
  dataHeader(wsNCC, ['Mã NCC', 'Tên nhà cung cấp', 'Loại', 'Số dòng', 'Tổng giao dịch (đ)', 'SĐT', 'Địa chỉ', 'Ghi chú'], [4, 5]);
  const debtByMa = new Map(debt.rows.map((r) => [KT.keyOf(r.ma), r]));
  (db.suppliers || []).forEach((s, i) => {
    const r = 2 + i;
    const row = wsNCC.getRow(r);
    const d = debtByMa.get(KT.keyOf(s.ma)) || { soDongCP: 0, phatSinh: 0 };
    put(row, 1, s.ma); put(row, 2, s.ten, 'wrap'); put(row, 3, s.loai || '', 'wrap');
    calc(put(row, 4, F('COUNTIFS(' + NKC + '!$N:$N,$A' + r + ')', d.soDongCP), 'int'));
    calc(put(row, 5, F('SUMIFS(' + NKC + '!$M:$M,' + NKC + '!$N:$N,$A' + r + ')', d.phatSinh), 'money'));
    put(row, 6, s.sdt || '', 'center'); put(row, 7, s.diaChi || '', 'wrap'); put(row, 8, s.ghiChu || '', 'wrap');
  });
  widths(wsNCC, [20, 30, 18, 10, 18, 14, 30, 24]);

  /* ---------- DM_CONGTRINH ---------- */
  dataHeader(wsDCT, ['Mã CT', 'Tên công trình', 'Địa chỉ', 'Ngày khởi công', 'Trạng thái', 'Ngân sách (đ)', 'Ghi chú']);
  (db.projects || []).filter((p) => !ct || KT.keyOf(p.ma) === KT.keyOf(ct)).forEach((p, i) => {
    const row = wsDCT.getRow(2 + i);
    put(row, 1, p.ma); put(row, 2, p.ten, 'wrap'); put(row, 3, p.diaChi || '', 'wrap');
    put(row, 4, excelDate(p.ngayKhoiCong), 'date'); put(row, 5, p.trangThai || '', 'center');
    put(row, 6, Number(p.nganSach) || null, 'money'); put(row, 7, p.ghiChu || '', 'wrap');
  });
  widths(wsDCT, [16, 40, 30, 14, 16, 18, 26]);

  /* ---------- DM_NHA ---------- */
  dataHeader(wsNha, ['Mã Nhà', 'Mã CT', 'Tên nhà', 'Diện tích sàn (m2)', 'Chủ nhà', 'Ghi chú', 'Dùng chung cả công trình']);
  (db.houses || []).filter((h) => !ct || KT.keyOf(h.maCT) === KT.keyOf(ct)).forEach((h, i) => {
    const row = wsNha.getRow(2 + i);
    put(row, 1, h.ma); put(row, 2, h.maCT || ''); put(row, 3, h.ten, 'wrap');
    qtyCell(row, 4, h.dienTich === '' || h.dienTich == null ? null : Number(h.dienTich));
    put(row, 5, h.chuNha || ''); put(row, 6, h.ghiChu || '', 'wrap'); put(row, 7, h.chung ? 'x' : '', 'center');
  });
  widths(wsNha, [16, 16, 30, 14, 20, 30, 14]);

  /* ---------- NHATKYCHUNG ---------- */
  dataHeader(wsNK, ['Ngày', 'Mã CT', 'Mã Nhà', 'Hạng mục', 'Nhóm CP', 'Loại CP', 'Mã VT', 'Tên vật tư', 'ĐVT', 'Diễn giải / Quy cách',
    'Số lượng', 'Đơn giá', 'Thành tiền', 'Mã NCC', 'Tên NCC', 'Số phiếu', 'Ghi chú', 'Nguồn', 'Mã phiếu (phần mềm)'], [5, 8, 9, 13, 15]);
  ledger.forEach((c, i) => {
    const r = 2 + i;
    const row = wsNK.getRow(r);
    put(row, 1, excelDate(c.ngay), 'date');
    put(row, 2, c.maCT || ''); put(row, 3, c.maNha || '');
    put(row, 4, c.tenHM || c.maHM || '', 'wrap');
    calc(put(row, 5, F('IFERROR(INDEX(DM_HANGMUC!$B:$B,MATCH($D' + r + ',DM_HANGMUC!$C:$C,0)),"")', c.tenNhom), 'wrap'));
    put(row, 6, c.loaiCP || '', 'center');
    put(row, 7, c.maVT || '');
    calc(put(row, 8, F('IFERROR(INDEX(DM_VATTU!$B:$B,MATCH($G' + r + ',DM_VATTU!$A:$A,0)),"")', c.tenVT), 'wrap'));
    calc(put(row, 9, F('IFERROR(INDEX(DM_VATTU!$C:$C,MATCH($G' + r + ',DM_VATTU!$A:$A,0)),"")', c.dvt), 'center'));
    put(row, 10, c.dienGiai || '', 'wrap');
    qtyCell(row, 11, c.soLuong);
    put(row, 12, c.donGia, 'money');
    calc(put(row, 13, F('IF($K' + r + '="","",ROUND($K' + r + '*$L' + r + ',0))', c.thanhTien), 'money'));
    put(row, 14, c.maNCC || '');
    calc(put(row, 15, F('IFERROR(INDEX(DM_NCC!$B:$B,MATCH($N' + r + ',DM_NCC!$A:$A,0)),"")', c.tenNCC), 'wrap'));
    put(row, 16, c.soPhieu || '', 'center'); put(row, 17, c.ghiChu || '', 'wrap'); put(row, 18, c.nguon || '');
    put(row, 19, c.phieuId || '', 'center');
  });
  widths(wsNK, [11, 14, 14, 24, 20, 12, 18, 26, 8, 30, 10, 13, 15, 16, 18, 10, 18, 11, 10]);
  wsNK.autoFilter = 'A1:S' + (1 + Math.max(ledger.length, 1));
  landscape(wsNK, 1);

  /* ---------- SO_QUY (từ sổ thu chi) ---------- */
  const cash = KT.buildLedger(view);
  dataHeader(wsSQ, ['Số phiếu', 'Ngày', 'Loại', 'Nhóm thu chi', 'Mã CT', 'Mã Nhà', 'Mã NCC', 'Họ tên người nộp / nhận', 'Địa chỉ', 'Lý do / Nội dung',
    'Số tiền', 'Hình thức', 'Kèm chứng từ (tờ)', 'Thu', 'Chi', 'Tồn quỹ', 'Ghi chú'], [14, 15, 16]);
  const sIdx = KT.indexBy(db.suppliers);
  let ton = 0;
  cash.forEach((e, i) => {
    const r = 2 + i;
    const row = wsSQ.getRow(r);
    const both = e.thu > 0 && e.chi > 0;
    ton += (e.thu || 0) - (e.chi || 0);
    const s = sIdx.get(KT.keyOf(e.maNCC));
    put(row, 1, e.soPhieu || '', 'center'); put(row, 2, excelDate(e.ngay), 'date');
    put(row, 3, both ? 'Thu & chi' : e.thu > 0 ? 'Thu' : 'Chi', 'center'); put(row, 4, '');
    put(row, 5, e.maDuAn || null); put(row, 6, null); put(row, 7, e.maNCC || null);
    put(row, 8, e.nguoiNhan || (s ? s.ten : ''), 'wrap'); put(row, 9, s ? (s.diaChi || '') : '', 'wrap'); put(row, 10, e.noiDung || '', 'wrap');
    put(row, 11, both ? null : (e.thu || e.chi || 0), 'money'); put(row, 12, settings.hinhThucMacDinh || 'Tiền mặt', 'center'); put(row, 13, '');
    if (both) {
      put(row, 14, e.thu, 'money');
      put(row, 15, e.chi, 'money');
    } else {
      calc(put(row, 14, F('IF($C' + r + '="Thu",$K' + r + ',0)', e.thu || 0), 'money'));
      calc(put(row, 15, F('IF($C' + r + '="Chi",$K' + r + ',0)', e.chi || 0), 'money'));
    }
    calc(put(row, 16, F(i === 0 ? 'N2-O2' : 'P' + (r - 1) + '+N' + r + '-O' + r, ton), 'money'));
    put(row, 17, e.ghiChu || '', 'wrap');
  });
  widths(wsSQ, [12, 11, 9, 14, 14, 10, 16, 24, 20, 36, 15, 11, 9, 15, 15, 16, 20]);
  wsSQ.autoFilter = 'A1:Q' + (1 + Math.max(cash.length, 1));
  landscape(wsSQ, 1);

  /* ---------- CHI_TIET_THEO_NHOM (3 cấp, bấm 1/2/3 để thu gọn) ---------- */
  title(wsCT, 'A1', 'CHI TIẾT CHI PHÍ THEO NHÓM');
  subtitle(wsCT, 'A2', 'Bấm số 1 / 2 / 3 ở góc trên bên trái để thu gọn: 1 = chỉ tổng nhóm, 2 = thêm cộng hạng mục, 3 = toàn bộ chi tiết.');
  linkCell(wsCT.getCell('J1'), 'TONGHOP!A1', '← Về TONGHOP');
  header(wsCT, 4, ['Ngày', 'Nhóm CP', 'Hạng mục', 'Mã VT', 'Tên vật tư', 'Diễn giải', 'Nhà cung cấp', 'Nhà', 'Số lượng', 'ĐVT', 'Đơn giá', 'Thành tiền']);
  wsCT.properties.outlineProperties = { summaryBelow: true, summaryRight: false };
  const detailRowOfItem = new Map();
  const byItem = new Map();
  ledger.forEach((c) => {
    const k = KT.keyOf(c.maHM);
    if (!byItem.has(k)) byItem.set(k, []);
    byItem.get(k).push(c);
  });
  let rr = 5;
  summary.groups.forEach((g) => {
    const items = g.items.filter((it) => byItem.has(KT.keyOf(it.ma)));
    if (!items.length) return;
    items.forEach((it) => {
      detailRowOfItem.set(KT.keyOf(it.ma), rr);
      byItem.get(KT.keyOf(it.ma)).forEach((c) => {
        const row = wsCT.getRow(rr);
        put(row, 1, excelDate(c.ngay), 'date'); put(row, 2, c.tenNhom || g.ten, 'wrap'); put(row, 3, c.tenHM || c.maHM || '', 'wrap');
        put(row, 4, c.maVT || ''); put(row, 5, c.tenVT || '', 'wrap'); put(row, 6, c.dienGiai || '', 'wrap'); put(row, 7, c.tenNCC || c.maNCC || '', 'wrap');
        put(row, 8, c.maNha || ''); qtyCell(row, 9, c.soLuong); put(row, 10, c.dvt || '', 'center');
        put(row, 11, c.donGia, 'money'); put(row, 12, c.thanhTien, 'money');
        row.outlineLevel = 2;
        rr++;
      });
      const row = wsCT.getRow(rr);
      const name = it.inCatalog ? it.ten : (it.ma || '');
      row.getCell(3).value = 'Cộng - ' + (name || '(trống)');
      row.getCell(12).value = F('SUMIFS(' + NKC + '!$M:$M,' + NKC + '!$D:$D,' + q(name) + ')', it.total);
      styleRow(row, 1, 12, { fill: ITEM_FILL, font: { bold: true } });
      row.getCell(12).numFmt = MONEY;
      row.outlineLevel = 1;
      rr++;
    });
    const row = wsCT.getRow(rr);
    row.getCell(2).value = 'TỔNG - ' + g.ten;
    row.getCell(12).value = g.inCatalog ? F('SUMIFS(' + NKC + '!$M:$M,' + NKC + '!$E:$E,' + q(g.ten) + ')', g.total) : g.total;
    styleRow(row, 1, 12, { fill: GROUP_FILL, font: { bold: true, color: { argb: 'FFFFFFFF' } } });
    row.getCell(12).numFmt = MONEY;
    rr += 2;
  });
  {
    const row = wsCT.getRow(rr);
    row.getCell(2).value = 'TỔNG CỘNG';
    row.getCell(12).value = F('SUM(' + NKC + '!$M:$M)', summary.total);
    styleRow(row, 1, 12, { fill: TOTAL_FILL, font: { bold: true } });
    row.getCell(12).numFmt = MONEY;
  }
  widths(wsCT, [11, 22, 26, 18, 24, 30, 18, 14, 10, 8, 13, 16]);
  wsCT.views = [{ state: 'frozen', ySplit: 4 }];
  landscape(wsCT, 4);

  /* ---------- TONGHOP ---------- */
  title(wsTH, 'A1', 'BẢNG ĐIỀU KHIỂN CHI PHÍ CÔNG TRÌNH');
  subtitle(wsTH, 'A2', (settings.tenDonVi || '') + (ct ? ' — Công trình ' + ct + ' ' + (KT.projectName(db, ct) || '') : ' — Tất cả công trình') +
    '. Bấm [+] / [-] ở lề trái để bung hoặc thu gọn hạng mục.');
  const K = [
    ['TỔNG CHI PHÍ', 'SUM(' + NKC + '!$M:$M)', summary.total],
    ['Vật tư', 'SUMIFS(' + NKC + '!$M:$M,' + NKC + '!$F:$F,"Vật tư")', summary.byLoai['Vật tư'] || 0],
    ['Nhân công', 'SUMIFS(' + NKC + '!$M:$M,' + NKC + '!$F:$F,"Nhân công")', summary.byLoai['Nhân công'] || 0],
    ['Dịch vụ - Phí', 'SUMIFS(' + NKC + '!$M:$M,' + NKC + '!$F:$F,"Dịch vụ-Phí")', summary.byLoai['Dịch vụ-Phí'] || 0],
    ['Đã trả nhà cung cấp', 'SUM(CONGNO_NCC!$D$6:$D$' + (5 + Math.max(debt.rows.filter((x) => x.lienQuan).length, 1)) + ')', debt.total.daTra],
    ['Còn nợ nhà cung cấp', 'SUMIF(CONGNO_NCC!$E$6:$E$' + (5 + Math.max(debt.rows.filter((x) => x.lienQuan).length, 1)) + ',">0")', debt.total.conNo],
    ['Số dòng chi phí', 'COUNT(' + NKC + '!$M:$M)', ledger.length],
    ['Số mã vật tư', 'COUNTA(DM_VATTU!$A:$A)-1', (db.materials || []).length],
    ['Số nhà cung cấp', 'COUNTA(DM_NCC!$A:$A)-1', (db.suppliers || []).length]
  ];
  K.forEach(([label, fm, val], i) => {
    const row = wsTH.getRow(4 + i);
    put(row, 1, label, 'text', { font: { bold: i === 0 } });
    const c = put(row, 2, F(fm, val), i >= 6 ? 'int' : 'money', { font: { bold: i === 0 } });
    if (i === 0) { row.getCell(1).fill = TOTAL_FILL; c.fill = TOTAL_FILL; }
  });
  const r0 = 4 + K.length + 1;
  wsTH.getCell('A' + r0).value = 'TỔNG HỢP CHI PHÍ THEO NHÓM — bấm “Xem chi tiết” để nhảy tới đúng khối';
  wsTH.getCell('A' + r0).font = font({ bold: true, color: { argb: NAVY } });
  header(wsTH, r0 + 1, ['Nhóm lớn / Hạng mục', 'Tổng chi (đ)', 'Tỷ trọng %', 'Xem chi tiết']);
  wsTH.properties.outlineProperties = { summaryBelow: false, summaryRight: false };
  let r = r0 + 2;
  const groupRows = [];
  summary.groups.forEach((g) => {
    const row = wsTH.getRow(r);
    const gr = groupRow.get(KT.keyOf(g.ma));
    put(row, 1, gr ? F('DM_NHOM!' + abs('B', gr), g.ten) : g.ten, 'text');
    put(row, 2, g.inCatalog ? F('SUMIFS(' + NKC + '!$M:$M,' + NKC + '!$E:$E,$A' + r + ')', g.total) : g.total, 'money');
    put(row, 3, F('IFERROR($B' + r + '/$B$4,0)', summary.total ? g.total / summary.total : 0), 'pct');
    put(row, 4, '');
    styleRow(row, 1, 4, { fill: SUB_FILL, font: { bold: true } });
    groupRows.push({ row: r, g });
    r++;
    g.items.forEach((it) => {
      const irow = wsTH.getRow(r);
      const ir = itemRow.get(KT.keyOf(it.ma));
      put(irow, 1, ir ? F('DM_HANGMUC!' + abs('C', ir), it.ten) : it.ten, 'wrap');
      put(irow, 2, F('SUMIFS(' + NKC + '!$M:$M,' + NKC + '!$D:$D,$A' + r + ')', it.total), 'money');
      put(irow, 3, F('IFERROR($B' + r + '/$B$4,0)', summary.total ? it.total / summary.total : 0), 'pct');
      const dr = detailRowOfItem.get(KT.keyOf(it.ma));
      const c = put(irow, 4, '', 'center');
      if (dr) linkCell(c, 'CHI_TIET_THEO_NHOM!A' + dr, 'Xem chi tiết →');
      else { c.value = '(chưa có phát sinh)'; c.font = font({ italic: true, color: { argb: 'FF7F7F7F' } }); }
      irow.outlineLevel = 1;
      r++;
    });
  });
  {
    const row = wsTH.getRow(r);
    put(row, 1, 'TỔNG CỘNG'); put(row, 2, F('B4', summary.total), 'money'); put(row, 3, ''); put(row, 4, '');
    styleRow(row, 1, 4, { fill: TOTAL_FILL, font: { bold: true } });
    r += 2;
  }
  // bảng nhỏ cho biểu đồ: các dòng nhóm đặt liền nhau ở cột F:G
  const chartHead = r0 + 1;
  const grey = font({ size: 10, color: { argb: 'FF7F7F7F' } });
  wsTH.getCell('F' + chartHead).value = 'Nhóm (cho biểu đồ)';
  wsTH.getCell('G' + chartHead).value = 'Tổng chi (đ)';
  wsTH.getCell('F' + chartHead).font = grey;
  wsTH.getCell('G' + chartHead).font = grey;
  groupRows.forEach(({ row, g }, i) => {
    const cr = chartHead + 1 + i;
    wsTH.getCell('F' + cr).value = F(abs('A', row), g.ten);
    wsTH.getCell('G' + cr).value = F(abs('B', row), g.total);
    wsTH.getCell('F' + cr).font = grey;
    wsTH.getCell('G' + cr).font = grey;
    wsTH.getCell('G' + cr).numFmt = MONEY;
  });
  // theo tháng
  wsTH.getCell('A' + r).value = 'TỔNG HỢP CHI PHÍ THEO THÁNG';
  wsTH.getCell('A' + r).font = font({ bold: true, color: { argb: NAVY } });
  header(wsTH, r + 1, ['Tháng', 'Chi phí trong tháng', 'Lũy kế', '']);
  const mStart = r + 2;
  summary.byMonth.forEach((mth, i) => {
    const rowNo = mStart + i;
    const row = wsTH.getRow(rowNo);
    if (mth.thang) {
      const c = put(row, 1, excelDate(mth.thang + '-01'), 'date');
      c.numFmt = 'mm/yyyy';
      put(row, 2, F('SUMIFS(' + NKC + '!$M:$M,' + NKC + '!$A:$A,">="&$A' + rowNo + ',' + NKC + '!$A:$A,"<"&EDATE($A' + rowNo + ',1))', mth.total), 'money');
    } else {
      put(row, 1, 'Chưa có ngày');
      put(row, 2, mth.total, 'money');
    }
    put(row, 3, F('SUM(' + abs('B', mStart) + ':B' + rowNo + ')', mth.luyKe), 'money');
    put(row, 4, '');
  });
  const chartTop = mStart + summary.byMonth.length + 1;
  widths(wsTH, [38, 20, 12, 18, 3, 26, 16]);
  portrait(wsTH);

  /* ---------- CONGNO_NCC ---------- */
  title(wsCN, 'A1', 'CÔNG NỢ NHÀ CUNG CẤP — chi phí phát sinh so với tiền đã trả');
  subtitle(wsCN, 'A2', 'Chi phí lấy từ NHATKYCHUNG (khối lượng đã nhận). Đã trả lấy từ SO_QUY (tiền chi − tiền thu lại). Hai sổ tách bạch nên chênh lệch mới có nghĩa.');
  subtitle(wsCN, 'A3', 'ỨNG DƯ = đã trả nhiều hơn khối lượng đã ghi nhận (thường do chưa nhập khối lượng nghiệm thu).');
  header(wsCN, 5, ['Mã NCC', 'Tên nhà cung cấp', 'Chi phí phát sinh', 'Đã trả / đã ứng', 'Chênh lệch', 'Tình trạng']);
  const cnRows = debt.rows.filter((x) => x.lienQuan);
  cnRows.forEach((d, i) => {
    const rn = 6 + i;
    const row = wsCN.getRow(rn);
    put(row, 1, d.ma); put(row, 2, d.ten, 'wrap');
    put(row, 3, F('SUMIFS(' + NKC + '!$M:$M,' + NKC + '!$N:$N,$A' + rn + ')', d.phatSinh), 'money');
    put(row, 4, F('SUMIFS(SO_QUY!$O:$O,SO_QUY!$G:$G,$A' + rn + ')-SUMIFS(SO_QUY!$N:$N,SO_QUY!$G:$G,$A' + rn + ')', d.daTra), 'money');
    put(row, 5, F('$C' + rn + '-$D' + rn, d.conLai), 'money');
    put(row, 6, F('IF(ROUND($E' + rn + ',0)>0,"Còn nợ",IF(ROUND($E' + rn + ',0)<0,"Ứng dư","Đã tất toán"))', KT.DEBT_TEXT[d.status]), 'center');
  });
  const lastCN = 5 + Math.max(cnRows.length, 1);
  {
    const row = wsCN.getRow(lastCN + 1);
    put(row, 1, ''); put(row, 2, 'TỔNG CỘNG');
    put(row, 3, F('SUM(C6:C' + lastCN + ')', debt.total.phatSinh), 'money');
    put(row, 4, F('SUM(D6:D' + lastCN + ')', debt.total.daTra), 'money');
    put(row, 5, F('SUM(E6:E' + lastCN + ')', debt.total.conLai), 'money');
    put(row, 6, '');
    styleRow(row, 1, 6, { fill: TOTAL_FILL, font: { bold: true } });
  }
  wsCN.addConditionalFormatting({
    ref: 'F6:F' + lastCN,
    rules: [
      { type: 'containsText', operator: 'containsText', text: 'Còn nợ', priority: 1, style: { font: { color: { argb: 'FFC00000' }, bold: true } } },
      { type: 'containsText', operator: 'containsText', text: 'Ứng dư', priority: 2, style: { font: { color: { argb: 'FFC65911' }, bold: true } } }
    ]
  });
  widths(wsCN, [20, 30, 20, 20, 20, 16]);
  wsCN.views = [{ state: 'frozen', ySplit: 5 }];
  wsCN.autoFilter = 'A5:F' + lastCN;
  portrait(wsCN, 5);

  /* ---------- CONGNO_CONGTRINH: nợ và đã thanh toán theo công trình ---------- */
  writeProjectDebtSheet(wsCNCT, KT.projectDebtSummary(view, {}), true);

  /* ---------- GIA_VATTU: lịch sử đơn giá ---------- */
  dataHeader(wsGia, ['Mã VT', 'Tên vật tư', 'ĐVT', 'Ngày', 'Mã NCC', 'Tên NCC', 'Số lượng', 'Đơn giá', 'Thành tiền', 'Chênh lệch giá so với lần trước (cùng NCC)', 'Mã CT', 'Diễn giải']);
  let gr = 2;
  const mIdx = KT.indexBy(db.materials);
  KT.materialStats(view).sort((a, b) => String(a.ma).localeCompare(String(b.ma))).forEach((ms) => {
    const m = mIdx.get(KT.keyOf(ms.ma));
    KT.priceHistory(view, ms.ma).forEach((h) => {
      const row = wsGia.getRow(gr);
      put(row, 1, ms.ma); put(row, 2, m ? m.ten : '', 'wrap'); put(row, 3, m ? (m.dvt || '') : '', 'center');
      put(row, 4, excelDate(h.ngay), 'date'); put(row, 5, h.maNCC); put(row, 6, h.tenNCC, 'wrap');
      qtyCell(row, 7, h.soLuong);
      put(row, 8, h.donGia, 'money'); put(row, 9, h.thanhTien, 'money');
      const c = put(row, 10, h.chenhLech == null ? null : h.chenhLech, 'money');
      if (h.chenhLech > 0) c.font = font({ color: { argb: 'FFC00000' } });
      put(row, 11, h.maCT); put(row, 12, h.dienGiai, 'wrap');
      gr++;
    });
  });
  widths(wsGia, [20, 28, 8, 11, 16, 20, 10, 13, 15, 16, 14, 26]);
  wsGia.autoFilter = 'A1:L' + Math.max(gr - 1, 2);

  let buffer = await fixSheetPrOrder(await wb.xlsx.writeBuffer({ zip: { compression: 'DEFLATE', compressionOptions: { level: 1 } } }));
  if (groupRows.length && summary.total) {
    const n = groupRows.length;
    buffer = await addColumnChart(buffer, {
      sheetName: 'TONGHOP',
      title: 'Chi phí theo nhóm',
      catRange: abs('F', chartHead + 1) + ':' + abs('F', chartHead + n),
      categories: groupRows.map((x) => x.g.ten),
      series: [{ name: 'Tổng chi (đ)', nameCell: abs('G', chartHead), valRange: abs('G', chartHead + 1) + ':' + abs('G', chartHead + n), values: groupRows.map((x) => x.g.total), color: '2A78D6' }],
      anchor: { fromCol: 0, fromRow: chartTop, toCol: 4, toRow: chartTop + 22 }
    });
  }
  return buffer;
}

// Bảng tổng hợp theo công trình. withFormulas = true khi nằm trong file có sheet NHATKYCHUNG và SO_QUY.
// Còn nợ / ứng dư cộng theo từng NCC nên ghi giá trị tính sẵn (không có công thức Excel gọn tương đương).
function writeProjectDebtSheet(ws, sum, withFormulas) {
  title(ws, 'A1', 'NỢ VÀ ĐÃ THANH TOÁN THEO CÔNG TRÌNH');
  subtitle(ws, 'A2', 'Đã thanh toán = chi − thu trong sổ quỹ có ghi Mã công trình và Mã NCC. Còn nợ / ứng dư cộng theo từng NCC của công trình.');
  header(ws, 4, ['Mã CT', 'Tên công trình', 'Chi phí phát sinh', 'Đã thanh toán NCC', '% đã thanh toán', 'Còn nợ NCC', 'Số NCC còn nợ', 'Ứng dư NCC', 'Chi khác (không ghi NCC)']);
  sum.rows.forEach((r, i) => {
    const rn = 5 + i;
    const row = ws.getRow(rn);
    put(row, 1, r.ma); put(row, 2, r.ten + (r.coChiPhi ? '' : ' (chưa nhập chi phí)'), 'wrap');
    if (withFormulas) {
      put(row, 3, F('SUMIFS(' + NKC + '!$M:$M,' + NKC + '!$B:$B,$A' + rn + ')', r.phatSinh), 'money');
      put(row, 4, F('SUMIFS(SO_QUY!$O:$O,SO_QUY!$E:$E,$A' + rn + ',SO_QUY!$G:$G,"<>")-SUMIFS(SO_QUY!$N:$N,SO_QUY!$E:$E,$A' + rn + ',SO_QUY!$G:$G,"<>")', r.daTra), 'money');
      put(row, 9, F('SUMIFS(SO_QUY!$O:$O,SO_QUY!$E:$E,$A' + rn + ',SO_QUY!$G:$G,"")-SUMIFS(SO_QUY!$N:$N,SO_QUY!$E:$E,$A' + rn + ',SO_QUY!$G:$G,"")', r.chiKhac), 'money');
    } else {
      put(row, 3, r.phatSinh, 'money'); put(row, 4, r.daTra, 'money'); put(row, 9, r.chiKhac, 'money');
    }
    put(row, 5, F('IF($C' + rn + '>0,$D' + rn + '/$C' + rn + ',"")', r.tiLeDaTra == null ? '' : r.tiLeDaTra), 'pct');
    put(row, 6, r.conNo, 'money'); put(row, 7, r.soNCCNo, 'int'); put(row, 8, r.ungDu, 'money');
  });
  const last = 4 + Math.max(sum.rows.length, 1);
  const row = ws.getRow(last + 1);
  put(row, 1, ''); put(row, 2, 'TỔNG CỘNG');
  [3, 4, 6, 7, 8, 9].forEach((c) => {
    const L = String.fromCharCode(64 + c);
    const key = { 3: 'phatSinh', 4: 'daTra', 6: 'conNo', 7: 'soNCCNo', 8: 'ungDu', 9: 'chiKhac' }[c];
    put(row, c, F('SUM(' + L + '5:' + L + last + ')', sum.total[key]), c === 7 ? 'int' : 'money');
  });
  put(row, 5, F('IF($C' + (last + 1) + '>0,$D' + (last + 1) + '/$C' + (last + 1) + ',"")', sum.total.tiLeDaTra == null ? '' : sum.total.tiLeDaTra), 'pct');
  styleRow(row, 1, 9, { fill: TOTAL_FILL, font: { bold: true } });
  widths(ws, [16, 34, 18, 18, 12, 18, 10, 18, 18]);
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  landscape(ws, 4);
}

/* =====================================================================
 * SỔ CHI PHÍ THEO BỘ LỌC (báo cáo để in / gửi)
 * ===================================================================== */
function costFilterText(db, f) {
  const parts = [];
  const name = (list, ma) => { const x = KT.indexBy(db[list]).get(KT.keyOf(ma)); return x ? x.ten : ''; };
  if (f.ct) parts.push('Công trình: ' + f.ct + (name('projects', f.ct) ? ' - ' + name('projects', f.ct) : ''));
  if (f.nha) parts.push('Nhà: ' + (f.nha === '__none__' ? '(chưa gán)' : f.nha));
  if (f.nhom) parts.push('Nhóm: ' + (name('costGroups', f.nhom) || f.nhom));
  if (f.hm) parts.push('Hạng mục: ' + (name('costItems', f.hm) || f.hm));
  if (f.loai) parts.push('Loại CP: ' + f.loai);
  if (f.ncc) parts.push('NCC: ' + f.ncc + (name('suppliers', f.ncc) ? ' - ' + name('suppliers', f.ncc) : ''));
  if (f.vt) parts.push('Vật tư: ' + f.vt + (name('materials', f.vt) ? ' - ' + name('materials', f.vt) : ''));
  if (f.q) parts.push('Tìm: "' + f.q + '"');
  return parts.join('   |   ');
}

async function buildCostLedgerWorkbook(db, f) {
  const settings = db.settings || {};
  const res = KT.filterCosts(KT.buildCostLedger(db), f);
  const wb = newWorkbook();
  const ws = wb.addWorksheet('So_Chi_Phi');
  const cols = ['STT', 'Ngày', 'Công trình', 'Nhà', 'Nhóm CP', 'Hạng mục', 'Loại CP', 'Mã VT', 'Tên vật tư', 'Diễn giải', 'ĐVT', 'Số lượng', 'Đơn giá', 'Thành tiền', 'Nhà cung cấp', 'Số phiếu'];
  companyHeader(ws, settings, 'P', 'SỔ CHI PHÍ CÔNG TRÌNH', KT.describeRange(f.from, f.to), costFilterText(db, f));
  header(ws, 8, cols);
  res.rows.forEach((c, i) => {
    const r = 9 + i;
    const row = ws.getRow(r);
    put(row, 1, i + 1, 'center'); put(row, 2, excelDate(c.ngay), 'date'); put(row, 3, c.maCT || ''); put(row, 4, c.maNha || '');
    put(row, 5, c.tenNhom || '', 'wrap'); put(row, 6, c.tenHM || c.maHM || '', 'wrap'); put(row, 7, c.loaiCP || '', 'center');
    put(row, 8, c.maVT || ''); put(row, 9, c.tenVT || '', 'wrap'); put(row, 10, c.dienGiai || '', 'wrap'); put(row, 11, c.dvt || '', 'center');
    qtyCell(row, 12, c.soLuong);
    put(row, 13, c.donGia, 'money');
    put(row, 14, F('ROUND(L' + r + '*M' + r + ',0)', c.thanhTien), 'money');
    put(row, 15, c.tenNCC || c.maNCC || '', 'wrap'); put(row, 16, c.soPhieu || '', 'center');
  });
  const last = 8 + Math.max(res.rows.length, 1);
  let row = ws.getRow(last + 1);
  row.getCell(10).value = 'Tổng cộng';
  row.getCell(12).value = F('SUM(L9:L' + last + ')', res.tongSL);
  row.getCell(14).value = F('SUM(N9:N' + last + ')', res.total);
  styleRow(row, 1, 16, { fill: TOTAL_FILL, font: { bold: true } });
  row.getCell(12).numFmt = QTY_FMT;
  row.getCell(14).numFmt = MONEY;
  KT.LOAI_CP.forEach((l, i) => {
    row = ws.getRow(last + 2 + i);
    row.getCell(10).value = '   Trong đó ' + l;
    row.getCell(14).value = F('SUMIFS(N9:N' + last + ',G9:G' + last + ',' + q(l) + ')', res.byLoai[l] || 0);
    row.getCell(14).numFmt = MONEY;
    row.getCell(10).font = font({ italic: true });
    row.getCell(14).font = font({ italic: true });
  });
  signatureBlock(ws, last + 7, settings, [['B', 'D', 'Người lập biểu', settings.nguoiLap], ['F', 'I', 'Kế toán trưởng', settings.keToanTruong], ['M', 'O', 'Giám đốc', settings.giamDoc]]);
  widths(ws, [6, 11, 13, 12, 18, 22, 11, 16, 22, 28, 7, 10, 12, 15, 18, 10]);
  ws.views = [{ state: 'frozen', ySplit: 8 }];
  landscape(ws, 8);
  return wb.xlsx.writeBuffer({ zip: { compression: 'DEFLATE', compressionOptions: { level: 1 } } });
}

/* =====================================================================
 * CÔNG NỢ NHÀ CUNG CẤP (báo cáo)
 * ===================================================================== */
async function buildDebtWorkbook(db, f) {
  const settings = db.settings || {};
  const d = KT.supplierDebt(db, f);
  const rows = f.ncc ? d.rows : d.rows.filter((x) => x.lienQuan); // lọc một NCC: luôn có dòng của NCC đó
  const wb = newWorkbook();
  const ws = wb.addWorksheet('Cong_No_NCC');
  const nccRow = f.ncc ? (db.suppliers || []).find((x) => KT.keyOf(x.ma) === KT.keyOf(f.ncc)) : null;
  const sub = [f.ct ? 'Công trình: ' + f.ct + ' ' + (KT.projectName(db, f.ct) || '') : 'Tất cả công trình', f.ncc ? 'Nhà cung cấp: ' + f.ncc + (nccRow ? ' ' + nccRow.ten : '') : '',
    f.to ? 'Đến ngày ' + KT.fmtDate(f.to) : ''].filter(Boolean).join('   |   ');
  companyHeader(ws, settings, 'H', 'CÔNG NỢ NHÀ CUNG CẤP', sub, 'Chi phí phát sinh lấy từ sổ chi phí công trình; đã trả lấy từ sổ thu chi (chi − thu) theo mã NCC');
  header(ws, 8, ['STT', 'Mã NCC', 'Tên nhà cung cấp', 'Loại', 'Chi phí phát sinh', 'Đã trả / đã ứng', 'Còn lại', 'Tình trạng']);
  rows.forEach((x, i) => {
    const r = 9 + i;
    const row = ws.getRow(r);
    put(row, 1, i + 1, 'center'); put(row, 2, x.ma); put(row, 3, x.ten, 'wrap'); put(row, 4, x.loai || '', 'wrap');
    put(row, 5, x.phatSinh, 'money'); put(row, 6, x.daTra, 'money');
    put(row, 7, F('E' + r + '-F' + r, x.conLai), 'money');
    put(row, 8, F('IF(ROUND(G' + r + ',0)>0,"Còn nợ",IF(ROUND(G' + r + ',0)<0,"Ứng dư","Đã tất toán"))', KT.DEBT_TEXT[x.status]), 'center');
  });
  const last = 8 + Math.max(rows.length, 1);
  const row = ws.getRow(last + 1);
  row.getCell(3).value = 'Tổng cộng';
  ['E', 'F', 'G'].forEach((c, i) => {
    row.getCell(5 + i).value = F('SUM(' + c + '9:' + c + last + ')', [d.total.phatSinh, d.total.daTra, d.total.conLai][i]);
    row.getCell(5 + i).numFmt = MONEY;
  });
  styleRow(row, 1, 8, { fill: TOTAL_FILL, font: { bold: true } });
  signatureBlock(ws, last + 4, settings, [['B', 'C', 'Người lập biểu', settings.nguoiLap], ['E', 'F', 'Kế toán trưởng', settings.keToanTruong], ['G', 'H', 'Giám đốc', settings.giamDoc]]);
  widths(ws, [6, 20, 30, 18, 18, 18, 18, 14]);
  portrait(ws, 8);
  if (!f.ct) writeProjectDebtSheet(wb.addWorksheet('Theo_Cong_Trinh'), KT.projectDebtSummary(db, { to: f.to, ncc: f.ncc }), false);
  return wb.xlsx.writeBuffer({ zip: { compression: 'DEFLATE', compressionOptions: { level: 1 } } });
}

module.exports = { buildCostWorkbook, buildCostLedgerWorkbook, buildDebtWorkbook };
