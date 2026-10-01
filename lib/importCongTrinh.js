'use strict';
/*
 * Nhập dữ liệu từ các file Excel công trình ChiPhi_CongTrinh_*.xlsm (mỗi file = một công trình) vào phần mềm, có làm sạch
 * theo quy tắc ghi trong import-bao-cao/BAO_CAO_IMPORT.md. Dùng bởi scripts/import-excel-chiphi.js (dry-run / apply / rollback).
 *
 * Nguyên tắc:
 *  - Chỉ đọc ô nhập tay; KHÔNG lấy giá trị công thức đã lưu sẵn làm nguồn sự thật (Thành tiền = SL × ĐG tự tính; tên NCC, tên vật tư,
 *    ĐVT, nhóm CP tra từ danh mục). Ô công thức tham chiếu đơn giản (=B13, =tblSoQuy[[#This Row],[Chi]]) được lần theo tới ô nhập tay.
 *  - Mọi chỗ sửa / suy luận / bỏ qua đều thành một "vấn đề" (issue) có tên file, sheet, số dòng gốc, để người dùng mở Excel kiểm.
 *  - Không sửa, không xóa dữ liệu cũ: chỉ thêm. Danh mục đã có được dùng lại nguyên trạng.
 *  - Mỗi dòng nguồn có dấu vân tay (fingerprint) lưu trong db.importBatches → chạy lại không nhân đôi; rollback theo mã lần nhập.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const KT = require('../public/js/shared.js');

const TOOL = 'import-excel-chiphi';
const SEP = '␟';

/* ---------------- tiện ích chữ / mã ---------------- */

const nfc = (s) => String(s == null ? '' : s).normalize('NFC');
// Chữ nhập tay: chuẩn hóa NFC, bỏ khoảng trắng đầu cuối, gộp khoảng trắng liền nhau
const clean = (s) => nfc(s).replace(/[\s ]+/g, ' ').trim();
// Khóa so khớp mã: không phân biệt hoa thường, bỏ khoảng trắng thừa, GIỮ dấu
const ck = (s) => clean(s).toLowerCase();
// Khóa so khớp tên: bỏ dấu, không phân biệt hoa thường, chỉ giữ chữ số
const nk = (s) => KT.normalizeText(clean(s)).replace(/[^a-z0-9]+/g, ' ').trim();
const hdr = (s) => KT.normalizeText(clean(s)).replace(/[_\s]+/g, ' ').trim();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const money = (n) => KT.fmtMoney(n);

class ImportError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/* ---------------- đọc ô ---------------- */

// Trả { kind: 'empty' | 'value' | 'formula', value, formula, result }
function cellInfo(cell) {
  const v = cell.value;
  if (v == null || v === '') return { kind: 'empty' };
  if (typeof v === 'object' && !(v instanceof Date)) {
    if (v.formula !== undefined || v.sharedFormula !== undefined) {
      let f = v.formula;
      if (f === undefined && v.sharedFormula) {
        try { f = cell.formula; } catch (e) { f = undefined; }
      }
      return { kind: 'formula', formula: f || '', result: v.result };
    }
    if (v.richText) { const t = v.richText.map((x) => x.text).join(''); return t.trim() ? { kind: 'value', value: t } : { kind: 'empty' }; }
    if (v.text !== undefined) return String(v.text).trim() ? { kind: 'value', value: v.text } : { kind: 'empty' };
    if (v.error) return { kind: 'formula', formula: '', result: v };
    return { kind: 'empty' };
  }
  if (typeof v === 'string' && !v.trim()) return { kind: 'empty' };
  return { kind: 'value', value: v };
}

// Ô công thức là tham chiếu đơn giản tới một ô khác trong cùng sheet / cùng dòng của bảng → giá trị nhập tay của ô đó
function resolveRef(ws, info, rowNo, cols, depth) {
  if (!info || info.kind !== 'formula' || (depth || 0) > 5) return null;
  const f = String(info.formula || '').replace(/^=/, '').replace(/\$/g, '').trim();
  let m = /^([A-Z]{1,3})(\d+)$/.exec(f);
  if (m) {
    const c = cellInfo(ws.getCell(m[1] + m[2]));
    if (c.kind === 'value') return { value: c.value, via: m[1] + m[2] };
    return c.kind === 'formula' ? resolveRef(ws, c, Number(m[2]), cols, (depth || 0) + 1) : null;
  }
  m = /^\w+\[\[#This Row\],\[([^\]]+)\]\]$/i.exec(f);
  if (m && cols) {
    const col = cols.get(hdr(m[1]));
    if (col) {
      const c = cellInfo(ws.getRow(rowNo).getCell(col));
      if (c.kind === 'value') return { value: c.value, via: 'cột ' + m[1] };
    }
  }
  return null;
}

function toNumber(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') { const n = KT.parseQty(v.trim()); return Number.isFinite(n) ? n : null; }
  return null;
}

function isoFromParts(y, m, d) {
  if (!(y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return '';
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

// Ngày: Date của Excel (nửa đêm UTC), số seri, chuỗi d/m/yyyy (ngày trước) hoặc yyyy-mm-dd
function toISODate(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : isoFromParts(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return isoFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
  const s = clean(v);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return isoFromParts(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) return isoFromParts(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return '';
}

function headerCols(ws, row) {
  const cols = new Map();
  ws.getRow(row || 1).eachCell({ includeEmpty: false }, (c, n) => {
    const i = cellInfo(c);
    if (i.kind === 'value') { const h = hdr(i.value); if (h && !cols.has(h)) cols.set(h, n); }
  });
  return cols;
}
// cột đầu tiên có tiêu đề thỏa điều kiện
function colOf(cols, pred) { for (const [h, n] of cols) if (pred(h)) return n; return 0; }

const H = {
  ngay: (h) => h === 'ngay',
  maCT: (h) => h === 'ma ct',
  maNha: (h) => h === 'ma nha',
  hangMuc: (h) => h === 'hang muc',
  nhomCP: (h) => h === 'nhom cp',
  loaiCP: (h) => h === 'loai cp',
  maVT: (h) => h === 'ma vt',
  tenVT: (h) => h.startsWith('ten vat tu'),
  dvt: (h) => h === 'dvt' || h.startsWith('dvt '),
  dienGiai: (h) => h.startsWith('dien giai'),
  soLuong: (h) => h.startsWith('so luong'),
  donGia: (h) => h.startsWith('don gia'),
  thanhTien: (h) => h.startsWith('thanh tien'),
  maNCC: (h) => h === 'ma ncc',
  tenNCC: (h) => h === 'ten ncc' || h.startsWith('ten nha cung cap'),
  soPhieu: (h) => h.startsWith('so phieu'),
  ghiChu: (h) => h.startsWith('ghi chu'),
  nguon: (h) => h === 'nguon',
  loai: (h) => h === 'loai',
  nhomTC: (h) => h.startsWith('nhom thu chi'),
  nguoi: (h) => h.startsWith('ho ten nguoi'),
  diaChi: (h) => h.startsWith('dia chi'),
  lyDo: (h) => h.startsWith('ly do'),
  soTien: (h) => h === 'so tien',
  hinhThuc: (h) => h.startsWith('hinh thuc'),
  kemTheo: (h) => h.startsWith('kem chung tu'),
  thu: (h) => h === 'thu',
  chi: (h) => h === 'chi',
  column1: (h) => h === 'column1'
};

/* ---------------- danh sách file ---------------- */

function listInputFiles(dir) {
  if (!fs.existsSync(dir)) throw new ImportError('KHONG_CO_THU_MUC', 'Không có thư mục nguồn ' + dir);
  const all = fs.readdirSync(dir).map((f) => nfc(f));
  const lockOwners = all.filter((f) => /^~\$/.test(f));
  const files = all.filter((f) => /\.(xlsm|xlsx)$/i.test(f) && !/^~\$/.test(f)).sort((a, b) => a.localeCompare(b, 'vi'));
  return { files, lockOwners };
}

// File cũ cùng công trình (vd ChiPhi_CongTrinh_111_..._OK_FIX.xlsm khi đã có "Copy of ...") → chỉ dùng để so sánh
function pickVersions(files) {
  const use = [];
  const old = [];
  files.forEach((f) => {
    const base = f.replace(/^copy of\s+/i, '');
    if (!/^copy of\s+/i.test(f) && files.some((g) => g !== f && /^copy of\s+/i.test(g) && g.replace(/^copy of\s+/i, '') === base)) old.push(f);
    else use.push(f);
  });
  return { use, old };
}

async function loadWorkbook(file) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (e) {
    if (/EBUSY|EPERM|EACCES/.test(e.code || '')) throw new ImportError('KHOA', 'File ' + path.basename(file) + ' đang bị khóa (có thể đang mở trong Excel). Hãy đóng file rồi chạy lại.');
    throw new ImportError('KHONG_DOC_DUOC', 'Không đọc được file ' + path.basename(file) + ': ' + e.message);
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch (e) {
    throw new ImportError('HONG', 'File ' + path.basename(file) + ' bị hỏng hoặc không phải file Excel (.xlsx/.xlsm): ' + e.message);
  }
  return { wb, sha256: sha(buf), size: buf.length };
}

/* ---------------- đọc một file công trình ---------------- */

const DATA_SHEETS = ['NHATKYCHUNG', 'SO_QUY', 'DM_CONGTRINH', 'DM_NHA', 'DM_NHOM', 'DM_HANGMUC', 'DM_VATTU', 'DM_NCC', 'DM_NHOMTHUCHI'];
const REPORT_SHEETS = ['TONGHOP', 'PIVOT_HANGMUC', 'CHI_TIET_THEO_NHOM', 'CONGNO_NCC', 'DUTOAN', 'PHIEU_THU_CHI', 'HUONG_DAN', 'PHIEU_NHAP'];

function sheet(wb, name) {
  let ws = wb.getWorksheet(name);
  if (!ws) wb.eachSheet((s) => { if (!ws && hdr(s.name) === hdr(name)) ws = s; });
  return ws || null;
}

async function parseFile(file) {
  const name = nfc(path.basename(file));
  const { wb, sha256, size } = await loadWorkbook(file);
  const out = { file: name, sha256, size, ct: null, houses: [], groups: [], items: [], materials: [], suppliers: [], costs: [], cash: [], junk: [], notes: [], cache: {} };
  const missing = ['NHATKYCHUNG', 'DM_CONGTRINH'].filter((s) => !sheet(wb, s));
  if (missing.length) throw new ImportError('THIEU_SHEET', 'File ' + name + ' thiếu sheet ' + missing.join(', ') + ' — không phải file ChiPhi_CongTrinh hoặc đã bị đổi tên sheet.');

  /* DM_CONGTRINH: một công trình; các ô ngoài bảng (vd ghi tiền chủ nhà ứng) chỉ được nêu ra */
  const wct = sheet(wb, 'DM_CONGTRINH');
  const cc = headerCols(wct, 1);
  const cts = [];
  const extraCells = [];
  wct.eachRow({ includeEmpty: false }, (row, r) => {
    if (r === 1) return;
    const g = (p) => { const n = colOf(cc, p); return n ? cellInfo(row.getCell(n)) : { kind: 'empty' }; };
    const ma = g(H.maCT);
    if (ma.kind === 'value' && clean(ma.value)) {
      const nk2 = g((h) => h.startsWith('ngay khoi cong'));
      const ngayRaw = nk2.kind === 'value' ? nk2.value : '';
      cts.push({ ma: clean(ma.value), ten: g((h) => h.startsWith('ten cong trinh')).value || '', diaChi: g(H.diaChi).value || '', ngayRaw, ngayKhoiCong: toISODate(ngayRaw),
        trangThai: g((h) => h.startsWith('trang thai')).value || '', ghiChu: g(H.ghiChu).value || '', row: r });
    }
    row.eachCell({ includeEmpty: false }, (c, n) => {
      if (n <= 6) return;
      const i = cellInfo(c);
      const v = i.kind === 'value' ? i.value : i.kind === 'formula' ? '(công thức =' + i.formula + ', giá trị lưu sẵn ' + JSON.stringify(i.result) + ')' : '';
      if (v !== '') extraCells.push(c.address + ': ' + v);
    });
  });
  if (!cts.length) throw new ImportError('THIEU_CT', 'File ' + name + ': sheet DM_CONGTRINH không có mã công trình.');
  out.ct = Object.assign({}, cts[0], { ten: clean(cts[0].ten), diaChi: clean(cts[0].diaChi), trangThai: clean(cts[0].trangThai), ghiChu: clean(cts[0].ghiChu) });
  if (cts.length > 1) out.notes.push({ sheet: 'DM_CONGTRINH', dong: cts[1].row, loai: 'nhieu-cong-trinh', chiTiet: 'DM_CONGTRINH có ' + cts.length + ' công trình; dùng công trình đầu tiên ' + cts[0].ma });
  if (extraCells.length) out.notes.push({ sheet: 'DM_CONGTRINH', dong: '', loai: 'o-ngoai-bang', chiTiet: 'Ô ghi chú ngoài bảng: ' + extraCells.join(' | ') });

  /* DM_NHA */
  const wnha = sheet(wb, 'DM_NHA');
  if (wnha) {
    const c = headerCols(wnha, 1);
    wnha.eachRow({ includeEmpty: false }, (row, r) => {
      if (r === 1) return;
      const g = (p) => { const n = colOf(c, p); const i = n ? cellInfo(row.getCell(n)) : { kind: 'empty' }; return i.kind === 'value' ? i.value : ''; };
      const ma = clean(g(H.maNha));
      if (!ma) return;
      const dt = g((h) => h.startsWith('dien tich'));
      out.houses.push({ ma, maCT: clean(g(H.maCT)), ten: clean(g((h) => h.startsWith('ten nha'))) || ma, dienTich: dt === '' ? '' : (typeof dt === 'number' ? dt : clean(dt)),
        chuNha: clean(g((h) => h.startsWith('chu nha'))), ghiChu: clean(g(H.ghiChu)), row: r });
    });
  }
  /* DM_NHOM */
  const wn = sheet(wb, 'DM_NHOM');
  if (wn) {
    const c = headerCols(wn, 1);
    wn.eachRow({ includeEmpty: false }, (row, r) => {
      if (r === 1) return;
      const g = (p) => { const n = colOf(c, p); const i = n ? cellInfo(row.getCell(n)) : { kind: 'empty' }; return i.kind === 'value' ? i.value : ''; };
      const ma = clean(g((h) => h === 'ma nhom'));
      if (ma) out.groups.push({ ma, ten: clean(g((h) => h.startsWith('ten nhom'))) || ma, row: r });
    });
  }
  /* DM_HANGMUC (cột Nhóm CP là công thức → bỏ, dùng Mã nhóm) */
  const whm = sheet(wb, 'DM_HANGMUC');
  if (whm) {
    const c = headerCols(whm, 1);
    whm.eachRow({ includeEmpty: false }, (row, r) => {
      if (r === 1) return;
      const g = (p) => { const n = colOf(c, p); const i = n ? cellInfo(row.getCell(n)) : { kind: 'empty' }; return i.kind === 'value' ? i.value : ''; };
      const ten = clean(g(H.hangMuc));
      if (ten) out.items.push({ ma: clean(g((h) => h === 'ma hm')), ten, maNhom: clean(g((h) => h === 'ma nhom')), row: r });
    });
  }
  /* DM_VATTU (bỏ cột đếm / tổng) */
  const wvt = sheet(wb, 'DM_VATTU');
  if (wvt) {
    const c = headerCols(wvt, 1);
    wvt.eachRow({ includeEmpty: false }, (row, r) => {
      if (r === 1) return;
      const g = (p) => { const n = colOf(c, p); const i = n ? cellInfo(row.getCell(n)) : { kind: 'empty' }; return i.kind === 'value' ? i.value : ''; };
      const ma = clean(g(H.maVT));
      if (ma && hdr(ma).startsWith('tong')) { out.notes.push({ sheet: 'DM_VATTU', dong: r, loai: 'dong-tong', chiTiet: 'Dòng "' + ma + '" ở DM_VATTU dòng ' + r + ' là dòng tổng, không phải vật tư — bỏ qua' }); return; }
      if (ma) out.materials.push({ ma, ten: clean(g(H.tenVT)) || ma, dvt: clean(g(H.dvt)), hmTen: clean(g((h) => h.startsWith('hang muc hay dung'))), ghiChu: clean(g(H.ghiChu)), row: r });
    });
  }
  /* DM_NCC (bỏ cột Số dòng, Tổng giao dịch) */
  const wncc = sheet(wb, 'DM_NCC');
  if (wncc) {
    const c = headerCols(wncc, 1);
    wncc.eachRow({ includeEmpty: false }, (row, r) => {
      if (r === 1) return;
      const g = (p) => { const n = colOf(c, p); const i = n ? cellInfo(row.getCell(n)) : { kind: 'empty' }; return i.kind === 'value' ? i.value : ''; };
      const ma = clean(g(H.maNCC));
      if (!ma || hdr(ma).startsWith('tong')) return;
      out.suppliers.push({ ma, ten: clean(g(H.tenNCC)) || ma, loai: clean(g(H.loai)), sdt: clean(g((h) => h === 'sdt' || h.includes('dien thoai'))), diaChi: clean(g(H.diaChi)), ghiChu: clean(g(H.ghiChu)), row: r });
    });
  }
  /* DM_NHOMTHUCHI: chỉ đọc Tồn quỹ đầu kỳ để báo cáo (KHÔNG ghi đè tồn quỹ của phần mềm) */
  const wtc = sheet(wb, 'DM_NHOMTHUCHI');
  if (wtc) {
    const c = headerCols(wtc, 1);
    const n = colOf(c, (h) => h.startsWith('ton quy dau ky'));
    if (n) { const i = cellInfo(wtc.getRow(2).getCell(n)); out.tonDauKy = i.kind === 'value' ? i.value : null; }
  }

  /* NHATKYCHUNG */
  const wk = sheet(wb, 'NHATKYCHUNG');
  const kc = headerCols(wk, 1);
  const col = {};
  ['ngay', 'maCT', 'maNha', 'hangMuc', 'nhomCP', 'loaiCP', 'maVT', 'tenVT', 'dvt', 'dienGiai', 'soLuong', 'donGia', 'thanhTien', 'maNCC', 'tenNCC', 'soPhieu', 'ghiChu', 'nguon']
    .forEach((k) => { col[k] = colOf(kc, H[k]); });
  const need = ['ngay', 'hangMuc', 'soLuong', 'donGia', 'thanhTien', 'maNCC'].filter((k) => !col[k]);
  if (need.length) throw new ImportError('THIEU_COT', 'File ' + name + ': sheet NHATKYCHUNG thiếu cột ' + need.join(', '));
  for (let r = 2; r <= wk.rowCount; r++) {
    const row = wk.getRow(r);
    const ci = (k) => (col[k] ? cellInfo(row.getCell(col[k])) : { kind: 'empty' });
    const v = (k) => { const i = ci(k); return i.kind === 'value' ? i.value : ''; };
    const cells = {};
    ['ngay', 'maCT', 'maNha', 'hangMuc', 'loaiCP', 'maVT', 'dienGiai', 'soLuong', 'donGia', 'thanhTien', 'maNCC', 'soPhieu', 'ghiChu', 'nguon'].forEach((k) => { cells[k] = ci(k); });
    // dòng có dữ liệu thật: có ít nhất một ô nhập tay (trừ cột Nguồn có sẵn chữ "phieu nhap")
    const real = Object.keys(cells).some((k) => k !== 'nguon' && cells[k].kind === 'value');
    if (!real) continue;
    // ngày: ô công thức tham chiếu → lần theo
    let ngayV = v('ngay');
    let ngayVia = '';
    if (cells.ngay.kind === 'formula') { const rr = resolveRef(wk, cells.ngay, r, kc); if (rr) { ngayV = rr.value; ngayVia = rr.via; } }
    out.costs.push({
      row: r, ngayRaw: ngayV, ngayVia, maCT: clean(v('maCT')), maNha: clean(v('maNha')), hangMuc: clean(v('hangMuc')), loaiCP: clean(v('loaiCP')), maVT: clean(v('maVT')),
      dienGiai: clean(v('dienGiai')), sl: v('soLuong'), dg: v('donGia'), tt: cells.thanhTien, maNCC: clean(v('maNCC')), soPhieu: clean(v('soPhieu')), ghiChu: clean(v('ghiChu')),
      nguon: clean(v('nguon')), cachedTen: { tenVT: col.tenVT ? cellInfo(row.getCell(col.tenVT)) : null, tenNCC: col.tenNCC ? cellInfo(row.getCell(col.tenNCC)) : null }
    });
  }

  /* SO_QUY */
  const wq = sheet(wb, 'SO_QUY');
  if (wq) {
    const qc = headerCols(wq, 1);
    const qcol = {};
    ['soPhieu', 'ngay', 'loai', 'nhomTC', 'maCT', 'maNha', 'maNCC', 'nguoi', 'diaChi', 'lyDo', 'soTien', 'hinhThuc', 'kemTheo', 'thu', 'chi', 'ghiChu', 'column1']
      .forEach((k) => { qcol[k] = colOf(qc, H[k]); });
    for (let r = 2; r <= wq.rowCount; r++) {
      const row = wq.getRow(r);
      const ci = (k) => (qcol[k] ? cellInfo(row.getCell(qcol[k])) : { kind: 'empty' });
      const v = (k) => { const i = ci(k); return i.kind === 'value' ? i.value : ''; };
      const inputKeys = ['soPhieu', 'ngay', 'loai', 'nhomTC', 'maCT', 'maNha', 'maNCC', 'nguoi', 'diaChi', 'lyDo', 'soTien', 'hinhThuc', 'kemTheo', 'ghiChu'];
      const real = inputKeys.some((k) => ci(k).kind === 'value') || ci('thu').kind === 'value' || ci('chi').kind === 'value';
      if (!real) continue;
      let ngayV = v('ngay');
      let ngayVia = '';
      const ngI = ci('ngay');
      if (ngI.kind === 'formula') { const rr = resolveRef(wq, ngI, r, qc); if (rr) { ngayV = rr.value; ngayVia = rr.via; } }
      const nguoiI = ci('nguoi');
      out.cash.push({
        row: r, soPhieu: clean(v('soPhieu')), ngayRaw: ngayV, ngayVia, loai: clean(v('loai')), nhomTC: clean(v('nhomTC')), maCT: clean(v('maCT')), maNha: clean(v('maNha')),
        maNCC: clean(v('maNCC')), nguoi: nguoiI.kind === 'value' ? clean(nguoiI.value) : '', nguoiCongThuc: nguoiI.kind === 'formula', diaChi: clean(v('diaChi')), lyDo: clean(v('lyDo')),
        soTien: ci('soTien'), soTienRef: ci('soTien').kind === 'formula' ? resolveRef(wq, ci('soTien'), r, qc) : null, thu: ci('thu'), chi: ci('chi'),
        hinhThuc: clean(v('hinhThuc')), kemTheo: v('kemTheo'), ghiChu: clean(v('ghiChu')), column1: clean(v('column1'))
      });
    }
  }

  /* số liệu đã lưu sẵn trên TONGHOP / CONGNO_NCC (chỉ để đối chiếu) */
  out.cache = cachedFigures(wb);

  /* sheet rác / ghi chú: nêu nội dung */
  wb.eachSheet((ws) => {
    if (DATA_SHEETS.concat(REPORT_SHEETS).some((s) => hdr(s) === hdr(ws.name))) return;
    const cells = [];
    ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
      const i = cellInfo(c);
      if (i.kind === 'value') cells.push(c.address + '=' + (i.value instanceof Date ? toISODate(i.value) : clean(i.value)));
      else if (i.kind === 'formula' && i.result != null && i.result !== '') cells.push(c.address + '=(=' + i.formula + ' → ' + JSON.stringify(i.result) + ')');
    }));
    out.junk.push({ sheet: nfc(ws.name), cells });
  });
  return out;
}

function cachedFigures(wb) {
  const res = { tongHop: {}, congNo: [] };
  const th = sheet(wb, 'TONGHOP');
  if (th) {
    th.eachRow({ includeEmpty: false }, (row) => {
      const a = cellInfo(row.getCell(1));
      const b = cellInfo(row.getCell(2));
      const label = a.kind === 'value' ? clean(a.value) : '';
      const val = b.kind === 'formula' ? b.result : b.kind === 'value' ? b.value : null;
      if (label && typeof val === 'number') res.tongHop[label] = val;
    });
  }
  const cn = sheet(wb, 'CONGNO_NCC');
  if (cn) {
    let headerRow = 0;
    cn.eachRow({ includeEmpty: false }, (row, r) => {
      if (headerRow) return;
      const a = cellInfo(row.getCell(1));
      if (a.kind === 'value' && hdr(a.value) === 'ma ncc') headerRow = r;
    });
    if (headerRow) {
      const cols = headerCols(cn, headerRow);
      for (let r = headerRow + 1; r <= cn.rowCount; r++) {
        const row = cn.getRow(r);
        const val = (p) => { const n = colOf(cols, p); if (!n) return null; const i = cellInfo(row.getCell(n)); return i.kind === 'formula' ? i.result : i.kind === 'value' ? i.value : null; };
        const ma = val((h) => h === 'ma ncc');
        if (!ma || typeof ma !== 'string') continue;
        res.congNo.push({ ma: clean(ma), phatSinh: val((h) => h.startsWith('chi phi phat sinh') || h.startsWith('tong chi phi')), daTra: val((h) => h.startsWith('da tra')), conLai: val((h) => h.startsWith('con lai')) });
      }
    }
  }
  return res;
}

/* ---------------- xây kế hoạch nhập ---------------- */

const RULES = {
  macDinhNhaCungCap: { ma: 'NCC_CHUAXACDINH', ten: 'Chưa xác định (thiếu mã NCC trong file Excel)' }
};

// Loại CP suy ra (quy tắc tái hiện đúng 136/136 dòng đã ghi Loại CP trong 5 file — xem báo cáo)
function inferLoai(hmTen, maVT) {
  if (/^nhan cong/.test(KT.normalizeText(hmTen))) return { loai: 'Nhân công', ly: 'hạng mục "' + hmTen + '" là nhân công' };
  if (/^xx-/i.test(maVT) || ck(maVT) === 'chung') return { loai: 'Dịch vụ-Phí', ly: 'mã ' + maVT + ' là mã khoản/chung' };
  if (maVT) return { loai: 'Vật tư', ly: 'có mã vật tư ' + maVT };
  const t = KT.normalizeText(hmTen);
  if (/^(ho so phap ly|chi phi chung|chi phi quan ly|phi |pccc|bao hanh)/.test(t)) return { loai: 'Dịch vụ-Phí', ly: 'không có mã VT, hạng mục "' + hmTen + '" là chi phí / dịch vụ' };
  return { loai: 'Vật tư', ly: 'không có mã VT, còn lại → Vật tư (hạng mục "' + hmTen + '")' };
}

function isPlaceholderVoucher(s) { return /…|\.\.|\?/.test(s); }

function voucherMonth(s) { const m = /\/(\d{1,2})\s*$/.exec(s); return m ? Number(m[1]) : 0; }

function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }

function costContentKey(c) {
  return [c.ngay, ck(c.maCT), ck(c.maHM), ck(c.maVT), nk(c.dienGiai), KT.round4(c.soLuong), Number(c.donGia), c.thanhTien, ck(c.maNCC)].join('|');
}

/*
 * parsedFiles: kết quả parseFile của các file dùng để nhập; oldFiles: file bản cũ (chỉ so sánh); db: dữ liệu hiện tại (đã chuẩn hóa).
 * opts: { lan, soQuy: 'nhap' | 'ghi-so' | 'bo-qua', now, by, homNay }
 */
function buildPlan(parsedFiles, db, opts) {
  opts = opts || {};
  const now = opts.now || new Date().toISOString();
  const homNay = opts.homNay || now.slice(0, 10);
  const soQuyMode = opts.soQuy || 'nhap';
  const issues = [];
  const add = (x) => { issues.push(x); return x; };
  const plan = {
    lan: opts.lan, at: now, by: opts.by || '', soQuy: soQuyMode, files: [], issues, add: { projects: [], houses: [], costGroups: [], costItems: [], materials: [], suppliers: [], costs: [], entries: [] },
    reuse: { projects: [], houses: [], suppliers: [], materials: [], costItems: [], costGroups: [] }, conflicts: [], nghiTrung: [], canQuyetDinh: [], skipped: [], matchedExisting: [], fps: {},
    oldOnly: []
  };
  const batches = (db.importBatches || []).filter((b) => !b.rolledBackAt);
  const knownFp = new Map();
  batches.forEach((b) => Object.keys(b.fps || {}).forEach((fp) => knownFp.set(fp, b.ma)));

  /* ---------- dự án / công trình ---------- */
  const projByKey = new Map(db.projects.map((p) => [ck(p.ma), p]));
  const houseByKey = new Map(db.houses.map((h) => [ck(h.ma), h]));
  const fileCT = new Map(); // file -> mã dự án trong phần mềm
  parsedFiles.forEach((pf) => {
    const ct = pf.ct;
    let target = projByKey.get(ck(ct.ma));
    let how = target ? 'trùng mã' : '';
    if (!target) {
      const sameName = db.projects.filter((p) => nk(p.ten) && nk(p.ten) === nk(ct.ten));
      if (sameName.length === 1) { target = sameName[0]; how = 'trùng tên'; }
    }
    if (!target) {
      // Mã nhà của file đã có trong phần mềm (mã nhà là duy nhất toàn phần mềm) → công trình đó đã được nhập trước đây
      const hit = pf.houses.filter((h) => ck(h.maCT) === ck(ct.ma) && houseByKey.has(ck(h.ma))).map((h) => houseByKey.get(ck(h.ma)));
      const projs = Array.from(new Set(hit.map((h) => ck(h.maCT)))).map((k) => projByKey.get(k)).filter(Boolean);
      if (projs.length === 1) { target = projs[0]; how = 'mã nhà ' + hit[0].ma + ' đã thuộc dự án này (nhập từ bản cũ của file)'; }
    }
    if (target) {
      fileCT.set(pf.file, target.ma);
      plan.reuse.projects.push({ file: pf.file, maFile: ct.ma, ma: target.ma, ten: target.ten, how });
      if (!/trùng mã/.test(how)) {
        plan.canQuyetDinh.push({ loai: 'cong-trinh-dung-lai', file: pf.file, chiTiet: 'Công trình ' + ct.ma + ' (' + ct.ten + ') được nhập vào dự án ĐÃ CÓ ' + target.ma + ' (' + target.ten + ') vì ' + how + '. Nếu không đúng: rollback lần nhập này.' });
      }
    } else {
      const rec = { id: 0, ma: ct.ma, ten: ct.ten || ct.ma, nganSach: 0, trangThai: ct.trangThai || 'Đang thực hiện', ghiChu: 'Nhập từ Excel ' + pf.file + (ct.ghiChu ? '. ' + ct.ghiChu : ''),
        ngayKhoiCong: ct.ngayKhoiCong || '', diaChi: ct.diaChi || '' };
      plan.add.projects.push({ rec, src: { file: pf.file, sheet: 'DM_CONGTRINH', dong: ct.row } });
      fileCT.set(pf.file, ct.ma);
      projByKey.set(ck(ct.ma), rec);
      if (ct.ngayRaw && !ct.ngayKhoiCong) add({ file: pf.file, sheet: 'DM_CONGTRINH', dong: ct.row, loai: 'ngay-khoi-cong', muc: 'canh-bao', chiTiet: 'Không đọc được ngày khởi công "' + ct.ngayRaw + '"' });
      else if (ct.ngayRaw && !(ct.ngayRaw instanceof Date)) add({ file: pf.file, sheet: 'DM_CONGTRINH', dong: ct.row, loai: 'ngay-khoi-cong', muc: 'sua', chiTiet: 'Ngày khởi công là chữ "' + ct.ngayRaw + '", đọc theo ngày-trước-tháng → ' + KT.fmtDate(ct.ngayKhoiCong) });
      // nghi trùng: tên / mã gần giống dự án đang có
      const toks = (s) => new Set(nk(s).split(' ').filter((t) => t.length >= 2 && !['du', 'an', 'nha', 'cong', 'trinh', 'lo', 'va', 'cty'].includes(t)));
      const a = toks(ct.ten + ' ' + ct.ma + ' ' + ct.diaChi);
      db.projects.forEach((p) => {
        const b = toks(p.ten + ' ' + p.ma);
        const common = Array.from(a).filter((t) => b.has(t) || Array.from(b).some((u) => (u.length >= 4 && t.includes(u)) || (t.length >= 4 && u.includes(t))));
        const codeSim = nk(p.ma).replace(/^da\s*/, '') === nk(ct.ma) || nk(p.ma).replace(/ /g, '').includes(nk(ct.ma).replace(/ /g, '')) || nk(ct.ma).replace(/ /g, '').includes(nk(p.ma).replace(/^da/, '').replace(/ /g, ''));
        if (common.length >= 2 || codeSim) plan.nghiTrung.push({ loai: 'cong-trinh', moi: ct.ma + ' (' + ct.ten + ')', coSan: p.ma + ' (' + p.ten + ')', lyDo: codeSim ? 'mã gần giống' : 'tên/địa chỉ có chung: ' + common.join(', ') });
      });
    }
  });

  /* ---------- nhóm CP ---------- */
  const groupByKey = new Map(db.costGroups.map((g) => [ck(g.ma), g]));
  const groupByName = new Map(db.costGroups.map((g) => [nk(g.ten), g]));
  const groupMap = new Map(); // ck(mã nhóm trong file) -> mã trong phần mềm
  parsedFiles.forEach((pf) => pf.groups.forEach((g) => {
    if (groupMap.has(ck(g.ma))) return;
    const ex = groupByKey.get(ck(g.ma)) || groupByName.get(nk(g.ten));
    if (ex) { groupMap.set(ck(g.ma), ex.ma); if (!plan.reuse.costGroups.includes(ex.ma)) plan.reuse.costGroups.push(ex.ma); return; }
    const rec = { id: 0, ma: g.ma, ten: g.ten, ghiChu: 'Nhập từ Excel ' + pf.file };
    plan.add.costGroups.push({ rec, src: { file: pf.file, sheet: 'DM_NHOM', dong: g.row } });
    groupByKey.set(ck(g.ma), rec); groupByName.set(nk(g.ten), rec); groupMap.set(ck(g.ma), g.ma);
  }));

  /* ---------- hạng mục: theo TÊN ---------- */
  const itemByName = new Map(db.costItems.map((i) => [nk(i.ten), i]));
  const usedCodes = new Set(db.costItems.map((i) => ck(i.ma)));
  parsedFiles.forEach((pf) => pf.items.forEach((i) => { if (i.ma) usedCodes.add(ck(i.ma)); }));
  // mã HM trùng nghĩa khác giữa các file
  const codeNames = new Map();
  parsedFiles.forEach((pf) => pf.items.forEach((i) => {
    if (!i.ma) return;
    const k = ck(i.ma);
    if (!codeNames.has(k)) codeNames.set(k, new Map());
    const m = codeNames.get(k);
    if (!m.has(nk(i.ten))) m.set(nk(i.ten), { ten: i.ten, files: [] });
    m.get(nk(i.ten)).files.push(pf.file);
  }));
  db.costItems.forEach((i) => {
    const k = ck(i.ma);
    if (!codeNames.has(k)) codeNames.set(k, new Map());
    const m = codeNames.get(k);
    if (!m.has(nk(i.ten))) m.set(nk(i.ten), { ten: i.ten, files: ['(phần mềm)'] }); else m.get(nk(i.ten)).files.push('(phần mềm)');
  });
  codeNames.forEach((m, k) => {
    if (m.size > 1) plan.conflicts.push({ loai: 'hang-muc-ma', ma: k.toUpperCase(), chiTiet: 'Mã ' + k.toUpperCase() + ' mang ' + m.size + ' tên khác nhau: ' + Array.from(m.values()).map((x) => '"' + x.ten + '" (' + Array.from(new Set(x.files)).join(', ') + ')').join(' / ') + '. Dòng chi phí đối chiếu theo TÊN; tên nào chưa có thì tạo hạng mục riêng với mã không trùng.' });
  });
  const nextFreeCode = () => { let n = 0; let code; do { n++; code = 'HM' + String(n).padStart(2, '0'); } while (usedCodes.has(ck(code))); usedCodes.add(ck(code)); return code; };
  const ensureItem = (ten, maFile, maNhomFile, src, why) => {
    const k = nk(ten);
    if (itemByName.has(k)) return itemByName.get(k).ma;
    const appHasCode = maFile && db.costItems.some((i) => ck(i.ma) === ck(maFile));
    const otherFileUses = maFile && Array.from((codeNames.get(ck(maFile)) || new Map()).keys()).some((nm) => nm !== k);
    const ma = maFile && !appHasCode && !otherFileUses && !plan.add.costItems.some((x) => ck(x.rec.ma) === ck(maFile)) ? maFile : nextFreeCode();
    const maNhom = groupMap.get(ck(maNhomFile)) || (groupByKey.get(ck(maNhomFile)) || {}).ma || '';
    const rec = { id: 0, ma, ten, maNhom, ghiChu: why || ('Nhập từ Excel ' + src.file) };
    plan.add.costItems.push({ rec, src });
    itemByName.set(k, rec);
    if (maFile && ck(ma) !== ck(maFile)) add({ file: src.file, sheet: src.sheet, dong: src.dong, loai: 'hang-muc-doi-ma', muc: 'sua', chiTiet: 'Hạng mục "' + ten + '" (mã ' + maFile + ' trong file) được tạo với mã ' + ma + ' vì mã ' + maFile + ' đã dùng cho hạng mục khác' });
    if (!maNhom) add({ file: src.file, sheet: src.sheet, dong: src.dong, loai: 'hang-muc-thieu-nhom', muc: 'canh-bao', chiTiet: 'Hạng mục "' + ten + '" không có nhóm CP hợp lệ' });
    return ma;
  };
  parsedFiles.forEach((pf) => pf.items.forEach((i) => ensureItem(i.ten, i.ma, i.maNhom, { file: pf.file, sheet: 'DM_HANGMUC', dong: i.row })));

  /* ---------- vật tư ---------- */
  const matByKey = new Map(db.materials.map((m) => [ck(m.ma), m]));
  const fileMats = new Map(); // ck -> [{file, m}]
  parsedFiles.forEach((pf) => pf.materials.forEach((m) => {
    if (!fileMats.has(ck(m.ma))) fileMats.set(ck(m.ma), []);
    fileMats.get(ck(m.ma)).push({ file: pf.file, m });
  }));
  fileMats.forEach((list, k) => {
    const names = Array.from(new Set(list.map((x) => x.m.ten)));
    const dvts = Array.from(new Set(list.map((x) => x.m.dvt).filter(Boolean)));
    const hms = Array.from(new Set(list.map((x) => x.m.hmTen).filter(Boolean)));
    const best = list.slice().sort((a, b) => b.m.ten.length - a.m.ten.length || (b.m.dvt ? 1 : 0) - (a.m.dvt ? 1 : 0))[0].m;
    const dvtCount = new Map();
    list.forEach((x) => { if (x.m.dvt) dvtCount.set(x.m.dvt, (dvtCount.get(x.m.dvt) || 0) + 1); });
    const dvt = Array.from(dvtCount.entries()).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).map((x) => x[0])[0] || '';
    if (names.length > 1 || dvts.length > 1 || hms.length > 1) {
      plan.conflicts.push({ loai: 'vat-tu', ma: best.ma, chiTiet: 'Vật tư ' + best.ma + ' khác nhau giữa các file: ' + list.map((x) => x.file.replace(/\.xlsm$/i, '') + ' = "' + x.m.ten + '" / ' + (x.m.dvt || '—') + ' / HM "' + (x.m.hmTen || '—') + '"').join('; ') + ' → chọn "' + best.ten + '" / ' + (dvt || '—') + (matByKey.has(k) ? ' (vật tư đã có trong phần mềm: giữ nguyên bản của phần mềm "' + matByKey.get(k).ten + '" / ' + matByKey.get(k).dvt + ')' : '') });
    }
    if (matByKey.has(k)) { plan.reuse.materials.push(matByKey.get(k).ma); return; }
    const hmTen = best.hmTen || hms[0] || '';
    const hm = hmTen ? itemByName.get(nk(hmTen)) : null;
    const rec = { id: 0, ma: best.ma, ten: best.ten, dvt, maHM: hm ? hm.ma : '', loaiCP: '', ghiChu: best.ghiChu || '' };
    if (hmTen && !hm) add({ file: list[0].file, sheet: 'DM_VATTU', dong: best.row, loai: 'vat-tu-hang-muc-la', muc: 'canh-bao', chiTiet: 'Vật tư ' + best.ma + ': "hạng mục hay dùng" "' + hmTen + '" không có trong danh mục hạng mục, để trống' });
    plan.add.materials.push({ rec, src: { file: list[0].file, sheet: 'DM_VATTU', dong: best.row } });
    matByKey.set(k, rec);
  });

  /* ---------- nhà cung cấp ---------- */
  const supByKey = new Map(db.suppliers.map((s) => [ck(s.ma), s]));
  const supByName = new Map();
  db.suppliers.forEach((s) => { const n = nk(s.ten); if (n) { if (!supByName.has(n)) supByName.set(n, []); supByName.get(n).push(s); } });
  const fileSups = new Map();
  parsedFiles.forEach((pf) => pf.suppliers.forEach((s) => {
    if (!fileSups.has(ck(s.ma))) fileSups.set(ck(s.ma), []);
    fileSups.get(ck(s.ma)).push({ file: pf.file, s });
  }));
  const supMap = new Map(); // ck(mã trong file) -> mã trong phần mềm
  fileSups.forEach((list, k) => {
    const codes = Array.from(new Set(list.map((x) => x.s.ma)));
    const names = Array.from(new Set(list.map((x) => x.s.ten)));
    const loais = Array.from(new Set(list.map((x) => x.s.loai).filter(Boolean)));
    const best = list.slice().sort((a, b) => b.s.ten.length - a.s.ten.length)[0].s;
    const loaiCount = new Map();
    list.forEach((x) => { if (x.s.loai) loaiCount.set(x.s.loai, (loaiCount.get(x.s.loai) || 0) + 1); });
    const loai = Array.from(loaiCount.entries()).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).map((x) => x[0])[0] || '';
    if (codes.length > 1) plan.conflicts.push({ loai: 'ncc-ma-hoa-thuong', ma: codes.join(' = '), chiTiet: 'Cùng một NCC viết mã khác hoa/thường: ' + codes.join(', ') + ' (' + list.map((x) => x.file.replace(/\.xlsm$/i, '') + ': ' + x.s.ma + ' "' + x.s.ten + '"').join('; ') + ') → gộp làm một' });
    if (names.length > 1 || loais.length > 1) plan.conflicts.push({ loai: 'ncc-ten-loai', ma: best.ma, chiTiet: 'NCC ' + best.ma + ' có tên/loại khác nhau: ' + list.map((x) => x.file.replace(/\.xlsm$/i, '') + ' = "' + x.s.ten + '" / ' + (x.s.loai || '—')).join('; ') + ' → chọn "' + best.ten + '" / ' + (loai || '—') });
    let ex = supByKey.get(k);
    let how = ex ? 'trùng mã' : '';
    if (!ex) {
      const cands = names.map((n) => supByName.get(nk(n)) || []).reduce((a, b) => a.concat(b), []);
      const uniq = Array.from(new Set(cands));
      if (uniq.length === 1) { ex = uniq[0]; how = 'trùng tên "' + ex.ten + '"'; }
      else if (uniq.length > 1) plan.nghiTrung.push({ loai: 'ncc', moi: best.ma + ' (' + best.ten + ')', coSan: uniq.map((s) => s.ma + ' (' + s.ten + ')').join(', '), lyDo: 'trùng tên với nhiều NCC đang có' });
    }
    if (ex) {
      supMap.set(k, ex.ma);
      plan.reuse.suppliers.push({ maFile: codes.join('/'), ma: ex.ma, ten: ex.ten, how, tenFile: best.ten });
      if (how !== 'trùng mã') plan.conflicts.push({ loai: 'ncc-khop-ten', ma: best.ma, chiTiet: 'NCC ' + best.ma + ' "' + best.ten + '" khớp theo tên với NCC đang có ' + ex.ma + ' → dùng lại ' + ex.ma });
      if (nk(ex.ten) !== nk(best.ten)) plan.conflicts.push({ loai: 'ncc-ten-khac-phan-mem', ma: ex.ma, chiTiet: 'NCC ' + ex.ma + ': phần mềm ghi "' + ex.ten + '", file ghi "' + best.ten + '" — giữ tên trong phần mềm (không sửa dữ liệu cũ)' });
      return;
    }
    const rec = { id: 0, ma: best.ma, ten: best.ten, loai, sdt: best.sdt || '', diaChi: best.diaChi || '', ghiChu: best.ghiChu || ('Nhập từ Excel ' + list[0].file) };
    plan.add.suppliers.push({ rec, src: { file: list[0].file, sheet: 'DM_NCC', dong: best.row } });
    supByKey.set(k, rec);
    supMap.set(k, rec.ma);
  });
  // nghi trùng: NCC mới có tên chứa / nằm trong tên một NCC khác (trong phần mềm hoặc tên ghi trong các file) — vd "Minh Long Phát" ↔ "Chiến MLP / Chiến Minh Long Phát"
  const known = [];
  db.suppliers.forEach((s) => known.push({ ma: s.ma, ten: s.ten }));
  fileSups.forEach((list, k) => list.forEach((x) => known.push({ ma: supMap.get(k) || x.s.ma, ten: x.s.ten })));
  plan.add.suppliers.forEach(({ rec }) => {
    const n = nk(rec.ten).replace(/ /g, '');
    const seen = new Set();
    known.forEach((s) => {
      if (ck(s.ma) === ck(rec.ma) || seen.has(ck(s.ma))) return;
      const m = nk(s.ten).replace(/ /g, '');
      if (!m || !n) return;
      const short = m.length < n.length ? m : n;
      const long = m.length < n.length ? n : m;
      if (m === n || (short.length >= 4 && long.includes(short))) {
        seen.add(ck(s.ma));
        plan.nghiTrung.push({ loai: 'ncc', moi: rec.ma + ' (' + rec.ten + ')', coSan: s.ma + ' (' + s.ten + ')', lyDo: m === n ? 'cùng tên, khác mã' : 'tên chứa nhau' });
      }
    });
  });
  // cùng tên khác mã (sau khi gộp): giữa NCC mới và NCC đang có / giữa các NCC trong file
  const allSup = db.suppliers.concat(plan.add.suppliers.map((x) => x.rec));
  const byName2 = new Map();
  allSup.forEach((s) => { const n = nk(s.ten); if (!n) return; if (!byName2.has(n)) byName2.set(n, []); byName2.get(n).push(s); });
  byName2.forEach((list) => {
    const codes = Array.from(new Set(list.map((s) => ck(s.ma))));
    if (codes.length > 1 && list.some((s) => plan.add.suppliers.some((x) => x.rec === s))) plan.nghiTrung.push({ loai: 'ncc', moi: list.filter((s) => plan.add.suppliers.some((x) => x.rec === s)).map((s) => s.ma).join(', '), coSan: list.map((s) => s.ma + ' (' + s.ten + ')').join(', '), lyDo: 'cùng tên, khác mã' });
  });
  const supplierFor = (maFile) => {
    if (!maFile) return '';
    if (supMap.has(ck(maFile))) return supMap.get(ck(maFile));
    const ex = supByKey.get(ck(maFile));
    if (ex) { supMap.set(ck(maFile), ex.ma); return ex.ma; }
    return null;
  };

  plan.supMap = {};
  supMap.forEach((v, k) => { plan.supMap[k] = v; });

  /* ---------- nhà ---------- */
  const houseMap = new Map(); // file|ck(mã nhà) -> mã nhà trong phần mềm
  const chungOf = new Map(); // file -> mã nhà dùng chung
  parsedFiles.forEach((pf) => {
    const target = fileCT.get(pf.file);
    const used = new Set(pf.costs.map((c) => ck(c.maNha)).filter(Boolean));
    pf.houses.forEach((h) => {
      const belongs = ck(h.maCT) === ck(pf.ct.ma);
      if (!belongs && !used.has(ck(h.ma))) {
        add({ file: pf.file, sheet: 'DM_NHA', dong: h.row, loai: 'nha-mau-rac', muc: 'bo-qua', chiTiet: 'Nhà ' + h.ma + ' (' + h.ten + ', Mã CT ' + (h.maCT || '—') + ') không thuộc công trình ' + pf.ct.ma + ' và không có dòng chi phí nào dùng → không nhập (phần thừa của file mẫu)' });
        return;
      }
      const chung = ck(h.ma) === ck(pf.ct.ma) || nk(h.ten).includes('dung chung');
      const ex = houseByKey.get(ck(h.ma));
      if (ex) {
        if (ck(ex.maCT) !== ck(target)) {
          add({ file: pf.file, sheet: 'DM_NHA', dong: h.row, loai: 'nha-thuoc-du-an-khac', muc: 'can-quyet-dinh', chiTiet: 'Mã nhà ' + h.ma + ' đã có trong phần mềm nhưng thuộc dự án ' + ex.maCT + ' (không phải ' + target + ')' });
        }
        houseMap.set(pf.file + '|' + ck(h.ma), ex.ma);
        plan.reuse.houses.push(ex.ma);
        if (chung) chungOf.set(pf.file, ex.ma);
        return;
      }
      const rec = { id: 0, ma: h.ma, maCT: target, ten: h.ten, dienTich: h.dienTich === '' ? '' : h.dienTich, chuNha: h.chuNha, chung, ghiChu: h.ghiChu };
      plan.add.houses.push({ rec, src: { file: pf.file, sheet: 'DM_NHA', dong: h.row } });
      houseByKey.set(ck(h.ma), rec);
      houseMap.set(pf.file + '|' + ck(h.ma), h.ma);
      if (chung) chungOf.set(pf.file, h.ma);
    });
    if (!chungOf.has(pf.file)) {
      // file không có dòng "Dùng chung" → tạo nhà dùng chung mang mã công trình
      const ma = pf.ct.ma;
      const ex = houseByKey.get(ck(ma));
      if (ex) chungOf.set(pf.file, ex.ma);
      else {
        const rec = { id: 0, ma, maCT: target, ten: 'Dùng chung cả công trình', dienTich: '', chuNha: '', chung: true, ghiChu: 'Tự tạo khi nhập Excel ' + pf.file };
        plan.add.houses.push({ rec, src: { file: pf.file, sheet: 'DM_NHA', dong: '' } });
        houseByKey.set(ck(ma), rec);
        chungOf.set(pf.file, ma);
        add({ file: pf.file, sheet: 'DM_NHA', dong: '', loai: 'nha-chung-tao-moi', muc: 'suy-ra', chiTiet: 'DM_NHA không có nhà "Dùng chung cả công trình" → tạo nhà ' + ma });
      }
    }
  });

  /* ---------- dòng chi phí ---------- */
  const locked = KT.lockedMonths(db);
  const existingCosts = new Map(); // khóa nội dung -> [id] (dòng có sẵn trong phần mềm, vd bản cũ của file 111)
  db.costs.forEach((c) => { const k = costContentKey(c); if (!existingCosts.has(k)) existingCosts.set(k, []); existingCosts.get(k).push(c); });
  const usedExisting = new Set();
  batches.forEach((b) => Object.values(b.fps || {}).forEach((x) => { if (x && x.k === 'da-co' && x.id) usedExisting.add(x.id); }));
  const supNeedDefault = [];
  parsedFiles.forEach((pf) => {
    const target = fileCT.get(pf.file);
    const st = { file: pf.file, ct: pf.ct.ma, duAn: target, nkcRows: pf.costs.length, nkcAdded: 0, nkcTong: 0, nkcBoQua: 0, nkcDaCo: 0, nkcDaNhap: 0, nkcDaCoTong: 0, nkcDaNhapTong: 0,
      khoan: 0, lechTT: 0, loaiSuyRa: 0, ctSua: 0, nhaSua: 0, ngaySua: 0, ngayNghi: 0,
      sqRows: pf.cash.length, sqAdded: 0, sqTongChi: 0, sqTongThu: 0, sqBoQua: 0, sqDaCo: 0, sqDaCoTong: 0, sqDaNhap: 0, tonDauKy: pf.tonDauKy, cache: pf.cache, sha256: pf.sha256 };
    plan.files.push(st);
    const dupCount = new Map();
    let prevHead = null;
    let phieuKey = 0;
    const ctStart = pf.ct.ngayKhoiCong;
    pf.costs.forEach((c) => {
      const src = { file: pf.file, sheet: 'NHATKYCHUNG', dong: c.row };
      const I = (loai, muc, chiTiet, extra) => add(Object.assign({ file: pf.file, sheet: 'NHATKYCHUNG', dong: c.row, loai, muc, chiTiet }, extra || {}));
      // dấu vân tay: nội dung ô nhập tay (trước làm sạch) + công trình của file + số lần lặp của đúng nội dung đó
      const ttVal = c.tt.kind === 'value' ? c.tt.value : '';
      const content = [ck(pf.ct.ma), 'NHATKYCHUNG', toISODate(c.ngayRaw) || String(c.ngayRaw), ck(c.maCT), ck(c.maNha), nk(c.hangMuc), c.loaiCP, ck(c.maVT), clean(c.dienGiai), String(c.sl), String(c.dg), String(ttVal), ck(c.maNCC), clean(c.soPhieu), clean(c.ghiChu)].join(SEP);
      const n = (dupCount.get(content) || 0) + 1;
      dupCount.set(content, n);
      const fp = sha(content + '#' + n);
      if (n > 1) I('dong-giong-het', 'canh-bao', 'Dòng giống hệt một dòng phía trên (lần thứ ' + n + ') — vẫn nhập (có thể là hai lần giao hàng thật)');
      if (knownFp.has(fp)) { st.nkcDaNhap++; plan.fps[fp] = null; plan.skipped.push({ src, ly: 'đã nhập ở lần ' + knownFp.get(fp) }); prevHead = null; return; }
      // số tiền
      const sl = toNumber(c.sl);
      const dg = toNumber(c.dg);
      if ((c.sl !== '' && sl == null) || (c.dg !== '' && dg == null)) I('so-khong-doc-duoc', 'canh-bao', 'Số lượng/Đơn giá không đọc được: "' + c.sl + '" / "' + c.dg + '"');
      if (typeof c.sl === 'string' && sl != null) I('so-dang-chu', 'sua', 'Số lượng ghi dạng chữ "' + c.sl + '" → ' + sl);
      if (typeof c.dg === 'string' && dg != null) I('so-dang-chu', 'sua', 'Đơn giá ghi dạng chữ "' + c.dg + '" → ' + dg);
      const typed = c.tt.kind === 'value' ? toNumber(c.tt.value) : null;
      let soLuong; let donGia; let thanhTien; let khoan = false; let ghiThem = [];
      if (sl != null && dg != null) {
        soLuong = KT.round4(sl);
        donGia = Math.round(dg * 100) / 100;
        thanhTien = KT.costAmount(soLuong, donGia);
        if (typed != null && Math.round(typed) !== thanhTien) {
          st.lechTT++;
          // số gõ tay là chuẩn tiền: giữ SL, ĐG = Thành tiền / SL nếu chia hết tới 0,01; không thì SL = 1, ĐG = Thành tiền
          const t = Math.round(typed);
          const dg2 = Math.round((t / soLuong) * 100) / 100;
          if (soLuong && KT.costAmount(soLuong, dg2) === t) { ghiThem.push('Thành tiền gõ tay ' + money(t) + ' khác SL × ĐG = ' + money(thanhTien) + '; giữ số gõ tay, ĐG gốc ' + money(donGia) + ' → ' + dg2); donGia = dg2; }
          else { ghiThem.push('Thành tiền gõ tay ' + money(t) + ' khác SL × ĐG = ' + money(thanhTien) + '; giữ số gõ tay, nhập theo khoản (SL gốc ' + soLuong + ', ĐG gốc ' + money(donGia) + ')'); soLuong = 1; donGia = t; }
          I('thanh-tien-lech', 'sua', ghiThem[ghiThem.length - 1], { giaTriGoc: thanhTien, giaTriMoi: t });
          thanhTien = KT.costAmount(soLuong, donGia);
        }
      } else if (typed != null) {
        khoan = true;
        st.khoan++;
        soLuong = 1;
        donGia = Math.round(typed * 100) / 100;
        thanhTien = KT.costAmount(1, donGia);
        const goc = 'SL ' + (c.sl === '' ? 'trống' : c.sl) + ', ĐG ' + (c.dg === '' ? 'trống' : c.dg);
        ghiThem.push('Nhập theo khoản: file chỉ có Thành tiền ' + money(thanhTien) + ' (' + goc + ') → SL 1 × ĐG ' + money(donGia));
        I('nhap-theo-khoan', 'sua', ghiThem[ghiThem.length - 1], { giaTriMoi: thanhTien });
      } else {
        st.nkcBoQua++;
        I('khong-co-so-tien', 'bo-qua', 'Không có số tiền (Thành tiền trống, thiếu SL/ĐG) → không nhập' + (c.tt.kind === 'formula' ? ' (ô Thành tiền là công thức trả về rỗng)' : ''), { duLieu: [c.hangMuc, c.maVT, c.dienGiai, c.maNCC].filter(Boolean).join(' / ') });
        plan.skipped.push({ src, ly: 'không có số tiền' });
        prevHead = null;
        return;
      }
      if (thanhTien < 0) I('so-am', 'canh-bao', 'Thành tiền âm ' + money(thanhTien));
      if (thanhTien === 0) I('so-khong', 'canh-bao', 'Thành tiền bằng 0');
      // ngày
      let ngay = toISODate(c.ngayRaw);
      if (c.ngayVia) I('ngay-cong-thuc', 'sua', 'Ô Ngày là công thức, lấy theo ô ' + c.ngayVia + ' → ' + KT.fmtDate(ngay));
      if (!ngay) {
        const prev = plan.add.costs.filter((x) => x.src.file === pf.file).slice(-1)[0];
        if (prev) { ngay = prev.rec.ngay; I('thieu-ngay', 'suy-ra', 'Thiếu ngày → dùng ngày dòng liền trên ' + KT.fmtDate(ngay)); st.ngaySua++; }
        else { st.nkcBoQua++; I('thieu-ngay', 'bo-qua', 'Thiếu ngày và không có dòng trước để suy ra → không nhập'); plan.skipped.push({ src, ly: 'thiếu ngày' }); prevHead = null; return; }
      }
      const fixed = fixSwappedDate(ngay, c.soPhieu);
      if (fixed) { I('ngay-hoan-doi', 'sua', 'Ngày ' + KT.fmtDate(ngay) + ' nghi bị hoán đổi ngày/tháng (số phiếu ' + c.soPhieu + ') → sửa thành ' + KT.fmtDate(fixed), { giaTriGoc: ngay, giaTriMoi: fixed }); ngay = fixed; st.ngaySua++; }
      else {
        const why = suspiciousDate(ngay, ctStart, homNay);
        if (why) { I('ngay-nghi-ngo', 'canh-bao', 'Ngày ' + KT.fmtDate(ngay) + ': ' + why + ' — giữ nguyên'); st.ngayNghi++; }
      }
      if (locked.size && locked.has(KT.monthOf(ngay))) { st.nkcBoQua++; I('thang-khoa', 'bo-qua', 'Tháng ' + KT.monthOf(ngay) + ' đã khóa sổ → không nhập'); plan.skipped.push({ src, ly: 'tháng đã khóa' }); prevHead = null; return; }
      // công trình
      if (!c.maCT) { I('thieu-ma-ct', 'suy-ra', 'Mã CT trống → gán công trình của file ' + target); st.ctSua++; }
      else if (ck(c.maCT) !== ck(pf.ct.ma)) {
        st.ctSua++;
        const issue = I('ma-ct-sai', 'suy-ra', 'Mã CT "' + c.maCT + '" không có trong DM_CONGTRINH của file → gán công trình của file ' + target + ' (mã gốc ghi vào Ghi chú)', { giaTriGoc: c.maCT });
        if (projByKey.has(ck(c.maCT)) || db.projects.some((p) => nk(p.ma).replace(/^da\s*/, '').replace(/ /g, '') === nk(c.maCT).replace(/ /g, ''))) {
          issue.muc = 'can-quyet-dinh';
          issue.chiTiet += '. CHÚ Ý: mã ' + c.maCT + ' giống một dự án khác đang có trong phần mềm — có thể dòng này thuộc công trình khác';
        }
        ghiThem.push('Mã CT gốc: ' + c.maCT);
      }
      // nhà
      let maNha;
      if (!c.maNha) { maNha = chungOf.get(pf.file); I('thieu-ma-nha', 'suy-ra', 'Mã Nhà trống → gán nhà dùng chung ' + maNha); st.nhaSua++; }
      else if (houseMap.has(pf.file + '|' + ck(c.maNha))) maNha = houseMap.get(pf.file + '|' + ck(c.maNha));
      else { maNha = chungOf.get(pf.file); I('ma-nha-sai', 'suy-ra', 'Mã Nhà "' + c.maNha + '" không có trong DM_NHA của file → gán nhà dùng chung ' + maNha + ' (mã gốc ghi vào Ghi chú)', { giaTriGoc: c.maNha }); ghiThem.push('Mã nhà gốc: ' + c.maNha); st.nhaSua++; }
      // hạng mục (theo tên)
      let maHM = '';
      if (c.hangMuc) {
        maHM = (itemByName.get(nk(c.hangMuc)) || {}).ma;
        if (!maHM) { maHM = ensureItem(c.hangMuc, '', '', src, 'Tự thêm khi nhập Excel ' + pf.file); I('hang-muc-la', 'suy-ra', 'Hạng mục "' + c.hangMuc + '" không có trong danh mục → thêm mới ' + maHM + ' (chưa có nhóm CP)'); }
      } else I('thieu-hang-muc', 'canh-bao', 'Thiếu Hạng mục (dòng không vào báo cáo theo nhóm)');
      // vật tư
      let maVT = '';
      if (c.maVT) {
        const m = matByKey.get(ck(c.maVT));
        if (m) maVT = m.ma;
        else {
          const tenCache = c.cachedTen.tenVT && c.cachedTen.tenVT.kind === 'formula' && typeof c.cachedTen.tenVT.result === 'string' ? c.cachedTen.tenVT.result : '';
          const rec = { id: 0, ma: c.maVT, ten: c.maVT, dvt: '', maHM, loaiCP: '', ghiChu: 'Tự thêm khi nhập Excel ' + pf.file + ', cần bổ sung tên' };
          plan.add.materials.push({ rec, src });
          matByKey.set(ck(c.maVT), rec);
          maVT = rec.ma;
          I('vat-tu-la', 'suy-ra', 'Mã VT "' + c.maVT + '" không có trong DM_VATTU → thêm vật tư mới (tên = mã' + (tenCache ? '; tên lưu sẵn trong file: "' + tenCache + '"' : '') + ')');
        }
      } else if (!c.dienGiai) I('thieu-vt-dien-giai', 'canh-bao', 'Không có Mã VT lẫn Diễn giải (phần mềm sẽ yêu cầu bổ sung khi sửa dòng này)');
      // loại CP
      let loaiCP = KT.normLoaiCP(c.loaiCP);
      if (c.loaiCP && !loaiCP) I('loai-cp-la', 'canh-bao', 'Loại CP "' + c.loaiCP + '" không nhận ra → suy ra');
      if (!loaiCP) {
        const inf = inferLoai(c.hangMuc, c.maVT);
        loaiCP = inf.loai;
        st.loaiSuyRa++;
        I('loai-cp-suy-ra', 'suy-ra', 'Loại CP trống → ' + loaiCP + ' (' + inf.ly + ')', { giaTriMoi: loaiCP });
      }
      // NCC
      let maNCC = supplierFor(c.maNCC);
      if (c.maNCC && maNCC === null) {
        const tenCache = c.cachedTen.tenNCC && c.cachedTen.tenNCC.kind === 'formula' && typeof c.cachedTen.tenNCC.result === 'string' ? c.cachedTen.tenNCC.result : '';
        const rec = { id: 0, ma: c.maNCC, ten: tenCache || c.maNCC, loai: '', sdt: '', diaChi: '', ghiChu: 'Tự thêm khi nhập Excel ' + pf.file + ' (mã không có trong DM_NCC)' };
        plan.add.suppliers.push({ rec, src });
        supByKey.set(ck(c.maNCC), rec); supMap.set(ck(c.maNCC), rec.ma);
        maNCC = rec.ma;
        I('ncc-la', 'suy-ra', 'Mã NCC "' + c.maNCC + '" không có trong DM_NCC → thêm NCC mới');
      }
      if (!maNCC) {
        supNeedDefault.push(1);
        maNCC = RULES.macDinhNhaCungCap.ma;
        const iss = I('thieu-ncc', 'can-quyet-dinh', 'Thiếu Mã NCC → gán tạm NCC "' + RULES.macDinhNhaCungCap.ma + '" (phần mềm bắt buộc có NCC); cần chỉ định NCC đúng', { giaTriMoi: maNCC });
        iss.soTien = thanhTien;
      }
      // số phiếu
      let soPhieu = c.soPhieu;
      if (soPhieu) {
        if (isPlaceholderVoucher(soPhieu)) { I('so-phieu-gia', 'sua', 'Số phiếu giả "' + soPhieu + '" → để trống (giữ mã gốc trong Ghi chú)'); ghiThem.push('Số phiếu gốc: ' + soPhieu); soPhieu = ''; }
        else if (soPhieu !== soPhieu.toUpperCase()) { I('so-phieu-viet-hoa', 'sua', 'Số phiếu "' + soPhieu + '" → ' + soPhieu.toUpperCase()); soPhieu = soPhieu.toUpperCase(); }
      }
      const ghiChu = [c.ghiChu].concat(ghiThem.filter((g) => /^Mã CT gốc|^Mã nhà gốc|^Số phiếu gốc|^Nhập theo khoản|^Thành tiền gõ tay/.test(g))).filter(Boolean).join('. ');
      const rec = {
        id: 0, seq: 0, phieuId: 0, ngay, maCT: target, maNha, maHM, loaiCP, maVT, dienGiai: c.dienGiai, soLuong, donGia, thanhTien, maNCC, soPhieu, ghiChu,
        nguon: 'excel', createdAt: now, updatedAt: now,
        importRef: { lan: opts.lan, file: pf.file, sheet: 'NHATKYCHUNG', dong: c.row, fp }
      };
      // đã có trong phần mềm (vd dòng của bản cũ file 111 đã nhập trước đây) → không nhập lại
      const k = costContentKey(rec);
      const exList = (existingCosts.get(k) || []).filter((x) => !usedExisting.has(x.id) && !(x.importRef && x.importRef.lan));
      if (exList.length) {
        usedExisting.add(exList[0].id);
        st.nkcDaCo++;
        st.nkcDaCoTong += thanhTien;
        plan.fps[fp] = { k: 'da-co', id: exList[0].id };
        plan.matchedExisting.push({ src, id: exList[0].id, thanhTien });
        prevHead = null;
        return;
      }
      // gom phiếu: các dòng liền nhau cùng ngày, nhà, NCC, số phiếu
      const head = [pf.file, ngay, maNha, maNCC, soPhieu].join('|');
      if (head !== prevHead) phieuKey++;
      prevHead = head;
      rec._phieu = pf.file + '#' + phieuKey;
      plan.add.costs.push({ rec, src, fp, khoan });
      plan.fps[fp] = { k: 'costs' };
      st.nkcAdded++;
      st.nkcTong += thanhTien;
    });
    // dòng đã có trong phần mềm cùng ngày + hạng mục + thành tiền + NCC nhưng khác chi tiết (vd file mới sửa Mã VT / diễn giải)
    // → coi là cùng một khoản đã được sửa trong file: KHÔNG nhập thêm (tránh tính hai lần), giữ nguyên bản cũ và báo để người dùng sửa tay
    const tgt = ck(target);
    db.costs.filter((c) => ck(c.maCT) === tgt && !usedExisting.has(c.id) && !(c.importRef && c.importRef.lan)).forEach((old) => {
      const cands = plan.add.costs.filter((x) => x.src.file === pf.file && x.rec.ngay === old.ngay && ck(x.rec.maHM) === ck(old.maHM) && x.rec.thanhTien === old.thanhTien && ck(x.rec.maNCC) === ck(old.maNCC));
      if (cands.length !== 1) return;
      const x = cands[0];
      const diffs = ['maNha', 'loaiCP', 'maVT', 'dienGiai', 'soLuong', 'donGia', 'soPhieu', 'ghiChu'].filter((k) => String(x.rec[k] == null ? '' : x.rec[k]) !== String(old[k] == null ? '' : old[k]))
        .map((k) => k + ': phần mềm "' + (old[k] == null ? '' : old[k]) + '" / file mới "' + (x.rec[k] == null ? '' : x.rec[k]) + '"');
      plan.add.costs.splice(plan.add.costs.indexOf(x), 1);
      usedExisting.add(old.id);
      st.nkcAdded--; st.nkcTong -= x.rec.thanhTien; st.nkcDaCo++; st.nkcDaCoTong += x.rec.thanhTien;
      plan.fps[x.fp] = { k: 'da-co', id: old.id, khac: diffs };
      plan.matchedExisting.push({ src: x.src, id: old.id, thanhTien: x.rec.thanhTien, khac: diffs });
      add({ file: pf.file, sheet: 'NHATKYCHUNG', dong: x.src.dong, loai: 'khac-ban-cu', muc: 'can-quyet-dinh',
        chiTiet: 'Cùng khoản với dòng #' + old.id + ' đã có trong phần mềm (ngày, hạng mục, thành tiền ' + money(old.thanhTien) + ', NCC trùng) nhưng file mới khác ở ' + diffs.join('; ') + ' → không nhập thêm, giữ nguyên dòng đang có (sửa tay trong phần mềm nếu muốn theo file mới)' });
    });
    // dòng của dự án đích đã có trong phần mềm nhưng không có trong file mới (vd chỉ có ở bản cũ)
    db.costs.filter((c) => ck(c.maCT) === tgt && !usedExisting.has(c.id) && !(c.importRef && c.importRef.lan)).forEach((c) => {
      plan.oldOnly.push({ file: pf.file, id: c.id, ngay: c.ngay, maHM: c.maHM, maVT: c.maVT, dienGiai: c.dienGiai, soLuong: c.soLuong, donGia: c.donGia, thanhTien: c.thanhTien, maNCC: c.maNCC });
    });
  });
  if (supNeedDefault.length && !supByKey.has(ck(RULES.macDinhNhaCungCap.ma))) {
    const rec = { id: 0, ma: RULES.macDinhNhaCungCap.ma, ten: RULES.macDinhNhaCungCap.ten, loai: '', sdt: '', diaChi: '', ghiChu: 'Tự tạo khi nhập Excel: gán tạm cho dòng thiếu mã NCC — cần sửa lại' };
    plan.add.suppliers.push({ rec, src: { file: '', sheet: '', dong: '' } });
    supByKey.set(ck(rec.ma), rec);
  }

  /* ---------- sổ quỹ ---------- */
  buildCash(plan, parsedFiles, db, { fileCT, supplierFor, supByKey, supMap, knownFp, homNay, locked, now, opts, add });
  return plan;
}

// Ngày nghi hoán đổi: chỉ sửa khi ngày ≤ 12 và hậu tố tháng của số phiếu (/MM) cho thấy hoán đổi là đúng
function fixSwappedDate(iso, soPhieu) {
  if (!iso || !soPhieu) return '';
  const mm = voucherMonth(soPhieu);
  if (!mm) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (m === mm) return '';
  if (d > 12 || d !== mm) return '';
  return isoFromParts(y, d, m);
}

function suspiciousDate(iso, ctStart, homNay) {
  const y = Number(iso.slice(0, 4));
  if (y !== 2026) return 'năm ' + y + ' khác 2026';
  if (homNay && iso > homNay) return 'sau ngày hiện tại ' + KT.fmtDate(homNay);
  if (ctStart && daysBetween(iso, ctStart) > 60) return 'sớm hơn ngày khởi công ' + KT.fmtDate(ctStart) + ' ' + Math.round(daysBetween(iso, ctStart) / 30) + ' tháng';
  return '';
}

/* ---------- SO_QUY → sổ thu chi ---------- */
function buildCash(plan, parsedFiles, db, ctx) {
  const { fileCT, supplierFor, knownFp, homNay, locked, now, opts, add } = ctx;
  const mode = plan.soQuy;
  // các dòng đang có trong sổ thu chi (sổ quỹ thật của kế toán) để nhận ra khoản đã ghi
  const live = db.entries.map((e) => ({ e, amt: (e.chi || 0) - (e.thu || 0) === 0 ? (e.chi || 0) : Math.abs((e.chi || 0) - (e.thu || 0)), kind: (e.chi || 0) >= (e.thu || 0) ? 'chi' : 'thu' }));
  const usedEntry = new Set();
  const batches = (db.importBatches || []).filter((b) => !b.rolledBackAt);
  batches.forEach((b) => Object.values(b.fps || {}).forEach((x) => { if (x && x.k === 'da-co-so-quy') (x.ids || [x.id]).forEach((id) => usedEntry.add(id)); }));
  const existingVouchers = new Set(db.entries.map((e) => KT.voucherKey(e.soPhieu)).filter(Boolean));
  const supKeyOf = (ma) => ck(ma);
  parsedFiles.forEach((pf) => {
    const st = plan.files.find((x) => x.file === pf.file);
    const target = fileCT.get(pf.file);
    const dupCount = new Map();
    let prevDate = '';
    pf.cash.forEach((q) => {
      const src = { file: pf.file, sheet: 'SO_QUY', dong: q.row };
      const I = (loai, muc, chiTiet, extra) => add(Object.assign({ file: pf.file, sheet: 'SO_QUY', dong: q.row, loai, muc, chiTiet }, extra || {}));
      const v = (i) => (i && i.kind === 'value' ? i.value : '');
      const content = [ck(pf.ct.ma), 'SO_QUY', clean(q.soPhieu), toISODate(q.ngayRaw) || String(q.ngayRaw), q.loai, ck(q.maNCC), clean(q.lyDo), String(v(q.soTien)), String(v(q.thu)), String(v(q.chi)), clean(q.ghiChu)].join(SEP);
      const n = (dupCount.get(content) || 0) + 1;
      dupCount.set(content, n);
      const fp = sha(content + '#' + n);
      if (q.column1) I('column1', 'canh-bao', 'Cột "Column1" (cột rác) có nội dung "' + q.column1 + '" — không nhập');
      if (knownFp.has(fp)) { st.sqDaNhap++; plan.fps[fp] = null; plan.skipped.push({ src, ly: 'đã nhập ở lần ' + knownFp.get(fp) }); return; }
      // số tiền: ô Số tiền nhập tay; nếu ô đó là công thức thì lấy cột Thu/Chi gõ tay hoặc ô được tham chiếu
      let amt = null;
      const k = q.soTien;
      const thuTyped = q.thu.kind === 'value' ? toNumber(q.thu.value) : null;
      const chiTyped = q.chi.kind === 'value' ? toNumber(q.chi.value) : null;
      if (k.kind === 'value') amt = toNumber(k.value);
      else if (k.kind === 'formula') {
        if (chiTyped) { amt = chiTyped; I('so-tien-cong-thuc', 'sua', 'Ô Số tiền là công thức (=' + k.formula + ', giá trị lưu sẵn ' + JSON.stringify(k.result) + ') → lấy số gõ tay ở cột Chi ' + money(chiTyped)); }
        else if (thuTyped) { amt = thuTyped; I('so-tien-cong-thuc', 'sua', 'Ô Số tiền là công thức → lấy số gõ tay ở cột Thu ' + money(thuTyped)); }
        else if (q.soTienRef) { amt = toNumber(q.soTienRef.value); I('so-tien-cong-thuc', 'sua', 'Ô Số tiền là công thức tham chiếu ' + q.soTienRef.via + ' → ' + money(amt)); }
      }
      if (!amt) {
        st.sqBoQua++;
        const extra = chiTyped || thuTyped ? ' CHÚ Ý: cột ' + (chiTyped ? 'Chi' : 'Thu') + ' có số gõ tay ' + money(chiTyped || thuTyped) + ' — có thể là khoản thật, cần xem' : '';
        const iss = I('so-quy-khong-tien', extra ? 'can-quyet-dinh' : 'bo-qua', 'Số tiền ' + (k.kind === 'value' ? money(toNumber(k.value) || 0) : 'trống') + ' → không nhập.' + extra, { duLieu: [q.soPhieu, toISODate(q.ngayRaw), q.maNCC, q.lyDo, q.ghiChu].filter(Boolean).join(' / ') });
        if (extra) {
          const ng = toISODate(q.ngayRaw);
          const fx = fixSwappedDate(ng, q.soPhieu);
          if (fx) iss.chiTiet += '. Ngày ' + KT.fmtDate(ng) + ' nghi hoán đổi (số phiếu ' + q.soPhieu + ') → nếu nhập thì là ' + KT.fmtDate(fx);
        }
        plan.skipped.push({ src, ly: 'số tiền 0/trống' });
        return;
      }
      if (amt < 0) I('so-am', 'canh-bao', 'Số tiền âm ' + money(amt));
      amt = Math.round(amt);
      // loại
      let loai = KT.normalizeText(q.loai).startsWith('thu') ? 'thu' : KT.normalizeText(q.loai).startsWith('chi') ? 'chi' : '';
      if (!loai) { loai = 'chi'; I('loai-thu-chi-suy-ra', 'suy-ra', 'Cột Loại trống, Số tiền > 0 → suy ra "Chi" (trả nhà cung cấp)'); }
      // ngày
      let ngay = toISODate(q.ngayRaw);
      if (q.ngayVia) I('ngay-cong-thuc', 'sua', 'Ô Ngày là công thức, lấy theo ô ' + q.ngayVia + ' → ' + KT.fmtDate(ngay));
      if (!ngay) {
        // tìm dòng chi phí cùng NCC, cùng số tiền, cùng nội dung trong file
        const sup = supplierFor(q.maNCC);
        const cand = plan.add.costs.concat(plan.matchedExisting.map((m) => ({ rec: db.costs.find((c) => c.id === m.id), src: m.src })))
          .filter((x) => x.rec && x.src.file === pf.file && ck(x.rec.maNCC) === ck(sup) && x.rec.thanhTien === amt);
        const byText = cand.filter((x) => nk(x.rec.dienGiai) && nk(q.lyDo) && (nk(x.rec.dienGiai).includes(nk(q.lyDo)) || nk(q.lyDo).includes(nk(x.rec.dienGiai))));
        const pick = byText.length === 1 ? byText[0] : cand.length === 1 ? cand[0] : null;
        if (pick) { ngay = pick.rec.ngay; I('thieu-ngay', 'can-quyet-dinh', 'Thiếu ngày → suy ra ' + KT.fmtDate(ngay) + ' từ dòng chi phí cùng NCC, cùng số tiền' + (byText.length === 1 ? ', cùng nội dung' : '') + ' (NHATKYCHUNG dòng ' + pick.src.dong + ')'); }
        else {
          const next = pf.cash.find((x) => x.row > q.row && toISODate(x.ngayRaw));
          ngay = prevDate || (next ? toISODate(next.ngayRaw) : '');
          if (ngay) I('thieu-ngay', 'can-quyet-dinh', 'Thiếu ngày, không suy ra được từ nội dung → dùng ngày dòng liền kề ' + KT.fmtDate(ngay));
          else { st.sqBoQua++; I('thieu-ngay', 'bo-qua', 'Thiếu ngày và không có dòng liền kề → không nhập'); plan.skipped.push({ src, ly: 'thiếu ngày' }); return; }
        }
      }
      const fixed = fixSwappedDate(ngay, q.soPhieu);
      if (fixed) { I('ngay-hoan-doi', 'sua', 'Ngày ' + KT.fmtDate(ngay) + ' nghi hoán đổi ngày/tháng (số phiếu ' + q.soPhieu + ') → ' + KT.fmtDate(fixed), { giaTriGoc: ngay, giaTriMoi: fixed }); ngay = fixed; }
      else { const why = suspiciousDate(ngay, pf.ct.ngayKhoiCong, homNay); if (why) I('ngay-nghi-ngo', 'canh-bao', 'Ngày ' + KT.fmtDate(ngay) + ': ' + why + ' — giữ nguyên'); }
      prevDate = ngay;
      if (q.maCT && ck(q.maCT) !== ck(pf.ct.ma)) I('ma-ct-sai', 'suy-ra', 'Mã CT "' + q.maCT + '" khác công trình của file → gán ' + target);
      else if (!q.maCT) I('thieu-ma-ct', 'suy-ra', 'Mã CT trống → gán công trình của file ' + target);
      const maNCC = q.maNCC ? supplierFor(q.maNCC) : '';
      if (q.maNCC && !maNCC) I('ncc-la', 'canh-bao', 'Mã NCC "' + q.maNCC + '" không có trong danh mục → để trống');
      let soPhieu = q.soPhieu;
      const ghi = [];
      if (soPhieu && isPlaceholderVoucher(soPhieu)) { I('so-phieu-gia', 'sua', 'Số phiếu giả "' + soPhieu + '" → để trống (giữ mã gốc trong Ghi chú)'); ghi.push('Số phiếu gốc: ' + soPhieu); soPhieu = ''; }
      else if (soPhieu && soPhieu !== soPhieu.toUpperCase()) { I('so-phieu-viet-hoa', 'sua', 'Số phiếu "' + soPhieu + '" → ' + soPhieu.toUpperCase()); soPhieu = soPhieu.toUpperCase(); }
      if (!q.soPhieu) I('thieu-so-phieu', 'canh-bao', 'Không có số phiếu — để trống (phần mềm không bắt buộc)');
      // trùng số phiếu trong cùng file
      if (soPhieu && pf.cash.filter((x) => x !== q && clean(x.soPhieu).toUpperCase() === soPhieu).length) I('so-phieu-trung', 'canh-bao', 'Số phiếu ' + soPhieu + ' xuất hiện nhiều lần trong SO_QUY của file — vẫn nhập từng dòng');
      // khoản này đã có trong sổ thu chi chưa?
      const hit = findExistingCash(live, usedEntry, { ngay, amt, loai, maNCC, soPhieu: q.soPhieu ? clean(q.soPhieu).toUpperCase() : '', duAn: target });
      if (hit && hit.strong) {
        hit.ids.forEach((id) => usedEntry.add(id));
        st.sqDaCo++;
        st.sqDaCoTong += amt;
        plan.fps[fp] = { k: 'da-co-so-quy', ids: hit.ids };
        I('so-quy-da-co', 'bo-qua', 'Khoản ' + loai + ' ' + money(amt) + ' ngày ' + KT.fmtDate(ngay) + ' ĐÃ CÓ trong sổ thu chi (' + hit.desc + ') → không nhập lại để khỏi trừ tiền hai lần');
        return;
      }
      if (locked.size && locked.has(KT.monthOf(ngay))) { st.sqBoQua++; I('thang-khoa', 'bo-qua', 'Tháng ' + KT.monthOf(ngay) + ' đã khóa sổ → không nhập'); plan.skipped.push({ src, ly: 'tháng đã khóa' }); return; }
      if (soPhieu && existingVouchers.has(soPhieu)) {
        I('so-phieu-trung-so-thu-chi', 'sua', 'Số phiếu ' + soPhieu + ' đã dùng cho khoản khác trong sổ thu chi → để trống số phiếu (giữ trong Ghi chú) để không gộp nhầm vào phiếu in của khoản khác');
        ghi.push('Số phiếu trong file: ' + soPhieu);
        soPhieu = '';
      }
      if (hit && !hit.strong) {
        I('so-quy-nghi-da-co', 'can-quyet-dinh', 'Khoản ' + money(amt) + ' ngày ' + KT.fmtDate(ngay) + ' NGHI đã có trong sổ thu chi (' + hit.desc + ') — nhập dạng Nháp, chỉ Ghi sổ nếu chắc chắn chưa có');
        ghi.push('Nghi trùng với ' + hit.desc);
      }
      if (mode === 'bo-qua') { st.sqBoQua++; plan.skipped.push({ src, ly: 'tùy chọn --so-quy bo-qua' }); return; }
      if (q.nhomTC) ghi.push('Nhóm thu chi: ' + q.nhomTC);
      if (q.hinhThuc && KT.normalizeText(q.hinhThuc) !== KT.normalizeText(db.settings.hinhThucMacDinh || 'Tiền mặt')) ghi.push('Hình thức: ' + q.hinhThuc);
      if (q.kemTheo !== '' && q.kemTheo != null) ghi.push('Kèm chứng từ: ' + q.kemTheo);
      if (q.ghiChu) ghi.unshift(q.ghiChu);
      const noiDung = q.lyDo || (q.ghiChu ? q.ghiChu : '') || ('Trả ' + (maNCC || 'nhà cung cấp') + ' (SO_QUY dòng ' + q.row + ')');
      if (!q.lyDo) I('thieu-noi-dung', 'suy-ra', 'Lý do/Nội dung trống → ghi "' + noiDung + '"');
      if (!q.nhomTC) I('nhom-thu-chi-trong', 'canh-bao', 'Nhóm thu chi trống — để trống (phần mềm không có trường này)');
      const rec = {
        id: 0, seq: 0, ngay, soPhieu, maDuAn: target, maNCC: maNCC || '', noiDung, thu: loai === 'thu' ? amt : 0, chi: loai === 'chi' ? amt : 0,
        nguoiNhan: q.nguoi || '', ghiChu: ghi.join('. '), createdAt: now, updatedAt: now,
        importRef: { lan: opts.lan, file: pf.file, sheet: 'SO_QUY', dong: q.row, fp }
      };
      if (mode === 'nhap') rec.trangThai = 'nhap';
      plan.add.entries.push({ rec, src, fp });
      plan.fps[fp] = { k: 'entries' };
      st.sqAdded++;
      if (loai === 'chi') st.sqTongChi += amt; else st.sqTongThu += amt;
    });
  });
}

// Tìm khoản đã có trong sổ thu chi: cùng số tiền (hoặc tổng nhiều dòng cùng số phiếu / cùng ngày + NCC), ngày lệch ≤ 3 ngày.
// "Chắc chắn" khi khớp thêm NCC hoặc số phiếu (hoặc cùng dự án); chỉ trùng tiền + ngày là "nghi".
function findExistingCash(live, used, q) {
  const near = (e) => Math.abs(daysBetween(e.ngay, q.ngay)) <= 3;
  const sameSup = (e) => q.maNCC && ck(e.maNCC) === ck(q.maNCC);
  const sameVoucher = (e) => q.soPhieu && KT.voucherKey(e.soPhieu) === q.soPhieu;
  const desc = (list) => list.map((x) => '#' + x.e.id + ' ' + KT.fmtDate(x.e.ngay) + (x.e.soPhieu ? ' ' + x.e.soPhieu : '') + ' ' + (x.e.maDuAn || '—') + ' ' + (x.e.maNCC || '—') + ' ' + money(x.amt) + ' "' + String(x.e.noiDung).slice(0, 50) + '"').join(' + ');
  const cands = live.filter((x) => !used.has(x.e.id) && x.kind === q.loai && near(x.e));
  const single = cands.filter((x) => x.amt === q.amt);
  const strong1 = single.filter((x) => sameSup(x.e) || sameVoucher(x.e));
  if (strong1.length) { const x = strong1.sort((a, b) => Math.abs(daysBetween(a.e.ngay, q.ngay)) - Math.abs(daysBetween(b.e.ngay, q.ngay)))[0]; return { strong: true, ids: [x.e.id], desc: desc([x]) }; }
  // nhiều dòng cộng lại (vd một khoản trong file được kế toán tách làm 2 dòng cùng số phiếu, cùng NCC)
  const groups = new Map();
  cands.forEach((x) => { if (!sameSup(x.e)) return; const key = x.e.ngay + '|' + KT.voucherKey(x.e.soPhieu); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(x); });
  for (const list of groups.values()) {
    if (list.length > 1 && list.reduce((t, x) => t + x.amt, 0) === q.amt) return { strong: true, ids: list.map((x) => x.e.id), desc: desc(list) + ' (cộng lại)' };
  }
  const sameProj = single.filter((x) => ck(x.e.maDuAn) === ck(q.duAn));
  if (sameProj.length) return { strong: true, ids: [sameProj[0].e.id], desc: desc([sameProj[0]]) };
  if (single.length) return { strong: false, ids: [single[0].e.id], desc: desc([single[0]]) };
  return null;
}

/* ---------------- áp kế hoạch vào bản sao dữ liệu ---------------- */

function applyPlan(db, plan) {
  const out = JSON.parse(JSON.stringify(db));
  let nextId = Math.max(Number(out.nextId) || 1, 1);
  const newId = () => nextId++;
  const maxSeq = (k) => {
    let m = 0;
    out[k].forEach((e) => { if (e.seq > m) m = e.seq; });
    (out.trash || []).forEach((t) => { if (t.kind === k) t.records.forEach((e) => { if (e.seq > m) m = e.seq; }); });
    return m;
  };
  const added = { projects: [], houses: [], costGroups: [], costItems: [], materials: [], suppliers: [], costs: [], entries: [] };
  ['projects', 'costGroups', 'costItems', 'materials', 'suppliers', 'houses'].forEach((k) => {
    plan.add[k].forEach(({ rec }) => {
      const r = Object.assign({}, rec, { id: newId() });
      out[k].push(r);
      added[k].push(r.id);
    });
  });
  let seq = maxSeq('costs');
  const phieu = new Map();
  plan.add.costs.forEach(({ rec }) => {
    const r = Object.assign({}, rec);
    if (!phieu.has(r._phieu)) phieu.set(r._phieu, newId());
    r.phieuId = phieu.get(r._phieu);
    delete r._phieu;
    r.id = newId();
    r.seq = ++seq;
    out.costs.push(r);
    added.costs.push(r.id);
  });
  let eseq = maxSeq('entries');
  plan.add.entries.forEach(({ rec }) => {
    const r = Object.assign({}, rec, { id: newId(), seq: ++eseq });
    out.entries.push(r);
    added.entries.push(r.id);
  });
  out.nextId = nextId;
  // sổ đăng ký lần nhập: dấu vân tay → bản ghi (để chạy lại không nhân đôi, và rollback)
  const fps = {};
  const idByFp = new Map();
  out.costs.concat(out.entries).forEach((r) => { if (r.importRef && r.importRef.lan === plan.lan) idByFp.set(r.importRef.fp, r.id); });
  Object.keys(plan.fps).forEach((fp) => {
    const x = plan.fps[fp];
    if (!x) return; // đã nhập ở lần trước
    if (x.k === 'costs' || x.k === 'entries') fps[fp] = { k: x.k, id: idByFp.get(fp) };
    else fps[fp] = x;
  });
  const batch = {
    ma: plan.lan, at: plan.at, by: plan.by, tool: TOOL, soQuy: plan.soQuy,
    files: plan.files.map((f) => ({ file: f.file, sha256: f.sha256, ct: f.ct, duAn: f.duAn })),
    added, fps,
    tong: { costs: plan.add.costs.reduce((t, x) => t + x.rec.thanhTien, 0), soDongCP: plan.add.costs.length, soDongSo: plan.add.entries.length,
      chi: plan.add.entries.reduce((t, x) => t + x.rec.chi, 0), thu: plan.add.entries.reduce((t, x) => t + x.rec.thu, 0) }
  };
  out.importBatches = (Array.isArray(out.importBatches) ? out.importBatches : []).concat([batch]);
  return { db: out, batch };
}

/* ---------------- kiểm tra trước khi ghi ---------------- */

// expected: số kỳ vọng tính độc lập từ ô nguồn (scripts/so-ky-vong-excel.js), theo file
function verify(before, after, plan, expected) {
  const errs = [];
  const sum = (list, f) => list.reduce((t, x) => t + (f(x) || 0), 0);
  // 1. dữ liệu cũ không đổi
  const keys = ['projects', 'suppliers', 'entries', 'costGroups', 'costItems', 'materials', 'houses', 'costs', 'trash', 'locks', 'cashCounts', 'attachments'];
  keys.forEach((k) => {
    const old = before[k] || [];
    const idx = new Map((after[k] || []).map((x) => [x.id === undefined ? x.thang : x.id, x]));
    old.forEach((x) => {
      const y = idx.get(x.id === undefined ? x.thang : x.id);
      if (!y || JSON.stringify(canon(x)) !== JSON.stringify(canon(y))) errs.push('Bản ghi cũ bị thay đổi / mất: ' + k + ' #' + (x.id || x.thang));
    });
  });
  if (JSON.stringify(canon(before.settings)) !== JSON.stringify(canon(after.settings))) errs.push('Cài đặt bị thay đổi');
  if (JSON.stringify(canon(before.vouchers || {})) !== JSON.stringify(canon(after.vouchers || {}))) errs.push('Thông tin in phiếu bị thay đổi');
  // 2. số dòng thêm = kế hoạch
  const newCosts = after.costs.filter((c) => c.importRef && c.importRef.lan === plan.lan);
  const newEntries = after.entries.filter((e) => e.importRef && e.importRef.lan === plan.lan);
  if (newCosts.length !== plan.add.costs.length) errs.push('Số dòng chi phí thêm ' + newCosts.length + ' ≠ kế hoạch ' + plan.add.costs.length);
  if (newEntries.length !== plan.add.entries.length) errs.push('Số dòng sổ thu chi thêm ' + newEntries.length + ' ≠ kế hoạch ' + plan.add.entries.length);
  // 3. tổng tiền chi phí phần mềm tính (KT.costSummary) tăng đúng bằng tổng các dòng thêm
  const pb = KT.postedDb(before);
  const pa = KT.postedDb(after);
  const totalBefore = KT.costSummary(pb, {}).total;
  const totalAfter = KT.costSummary(pa, {}).total;
  const addTotal = sum(newCosts.filter((c) => !KT.isDraft(c)), (c) => c.thanhTien);
  if (totalAfter - totalBefore !== addTotal) errs.push('Tổng chi phí tăng ' + money(totalAfter - totalBefore) + ' ≠ tổng dòng thêm ' + money(addTotal));
  // 4. theo từng file: dòng thêm + dòng đã có (bản cũ) + dòng đã nhập lần trước = số kỳ vọng tính thẳng từ ô nguồn
  plan.files.forEach((f) => {
    const mine = newCosts.filter((c) => c.importRef.file === f.file);
    const t = sum(mine, (c) => c.thanhTien);
    const prevBatches = (before.importBatches || []).filter((b) => !b.rolledBackAt);
    const prevIds = new Set();
    prevBatches.forEach((b) => Object.values(b.fps || {}).forEach((x) => { if (x && x.k === 'costs' && x.id) prevIds.add(x.id); }));
    const prevT = sum(before.costs.filter((c) => prevIds.has(c.id) && c.importRef && c.importRef.file === f.file), (c) => c.thanhTien);
    const got = t + f.nkcDaCoTong + prevT;
    const exp = expected && expected[f.file];
    if (exp) {
      if (got !== exp.nkcTong) errs.push(f.file + ': tổng chi phí (thêm ' + money(t) + ' + đã có ' + money(f.nkcDaCoTong) + ' + đã nhập trước ' + money(prevT) + ' = ' + money(got) + ') ≠ kỳ vọng ' + money(exp.nkcTong));
      if (f.nkcAdded + f.nkcDaCo + f.nkcDaNhap + f.nkcBoQua !== exp.nkcRows) errs.push(f.file + ': số dòng (' + (f.nkcAdded + f.nkcDaCo + f.nkcDaNhap + f.nkcBoQua) + ') ≠ kỳ vọng ' + exp.nkcRows);
      if (f.nkcBoQua !== exp.nkcKhongTien) errs.push(f.file + ': số dòng không có tiền bỏ qua ' + f.nkcBoQua + ' ≠ kỳ vọng ' + exp.nkcKhongTien);
      const sq = sum(newEntries.filter((e) => e.importRef.file === f.file), (e) => e.chi + e.thu) + f.sqDaCoTong;
      const prevSq = sum(before.entries.filter((e) => e.importRef && e.importRef.file === f.file && e.importRef.sheet === 'SO_QUY'), (e) => e.chi + e.thu);
      if (plan.soQuy !== 'bo-qua' && sq + prevSq !== exp.sqTong) errs.push(f.file + ': sổ quỹ (thêm + đã có = ' + money(sq + prevSq) + ') ≠ kỳ vọng ' + money(exp.sqTong));
      // theo hạng mục / NCC / nhà: chỉ so phần dòng thêm với kỳ vọng khi file không có dòng đã có sẵn
      if (!f.nkcDaCo && !f.nkcDaNhap) {
        const by = (list, keyF) => { const m = {}; list.forEach((c) => { const k = keyF(c); m[k] = (m[k] || 0) + c.thanhTien; }); return m; };
        const hmName = new Map(after.costItems.map((i) => [i.ma, nk(i.ten)]));
        const gotHM = by(mine, (c) => hmName.get(c.maHM) || '');
        Object.keys(exp.theoHangMuc || {}).forEach((k) => { if ((gotHM[k] || 0) !== exp.theoHangMuc[k]) errs.push(f.file + ': hạng mục "' + k + '" ' + money(gotHM[k] || 0) + ' ≠ kỳ vọng ' + money(exp.theoHangMuc[k])); });
      }
    }
  });
  // 5. tồn quỹ (chỉ tính dòng đã ghi sổ) không đổi khi sổ quỹ nhập dạng Nháp
  const ton = (d) => { const l = KT.buildLedger(KT.postedDb(d)); return l.length ? l[l.length - 1].ton : 0; };
  const tb = ton(before);
  const ta = ton(after);
  const addPosted = sum(newEntries.filter((e) => !KT.isDraft(e)), (e) => e.thu - e.chi);
  if (ta - tb !== addPosted) errs.push('Tồn quỹ thay đổi ' + money(ta - tb) + ' ≠ phần đã ghi sổ của dòng thêm ' + money(addPosted));
  // 6. toàn vẹn: mọi mã tham chiếu đều có trong danh mục
  const has = (list, ma) => !ma || list.some((x) => ck(x.ma) === ck(ma));
  newCosts.forEach((c) => {
    if (!has(after.projects, c.maCT) || !has(after.houses, c.maNha) || !has(after.costItems, c.maHM) || !has(after.materials, c.maVT) || !has(after.suppliers, c.maNCC) || !c.maNCC) errs.push('Dòng chi phí mồ côi: ' + c.importRef.file + ' dòng ' + c.importRef.dong);
  });
  newEntries.forEach((e) => { if (!has(after.projects, e.maDuAn) || !has(after.suppliers, e.maNCC)) errs.push('Dòng sổ thu chi mồ côi: ' + e.importRef.file + ' dòng ' + e.importRef.dong); });
  const ids = keys.filter((k) => k !== 'locks').flatMap((k) => (after[k] || []).map((x) => k + ':' + x.id));
  if (new Set(ids).size !== ids.length) errs.push('Trùng id');
  return { ok: !errs.length, errs, totalBefore, totalAfter, tonBefore: tb, tonAfter: ta };
}

function canon(x) {
  if (Array.isArray(x)) return x.map(canon);
  if (x && typeof x === 'object') return Object.keys(x).sort().reduce((o, k) => { o[k] = canon(x[k]); return o; }, {});
  return x;
}

/* ---------------- rollback ---------------- */

// Trả { db: bản sao đã gỡ, removed, kept } — dòng chi phí / sổ thu chi của lần nhập chuyển vào thùng rác; danh mục chỉ gỡ khi không còn ai dùng
function rollbackPlan(db, ma, opts) {
  opts = opts || {};
  const out = JSON.parse(JSON.stringify(db));
  const batch = (out.importBatches || []).find((b) => b.ma === ma);
  if (!batch) throw new ImportError('KHONG_CO_LAN', 'Không có lần nhập ' + ma + '. Các lần nhập: ' + ((out.importBatches || []).map((b) => b.ma + (b.rolledBackAt ? ' (đã rollback)' : '')).join(', ') || '(chưa có)'));
  if (batch.rolledBackAt) throw new ImportError('DA_ROLLBACK', 'Lần nhập ' + ma + ' đã được rollback lúc ' + batch.rolledBackAt);
  const locked = KT.lockedMonths(out);
  const now = opts.now || new Date().toISOString();
  let nextId = Math.max(Number(out.nextId) || 1, 1);
  const removed = {};
  const kept = [];
  const toTrash = (kind, recs, label) => {
    if (!recs.length) return;
    out.trash.push({ id: nextId++, at: now, by: opts.by || '', kind, label, records: JSON.parse(JSON.stringify(recs)) });
  };
  ['costs', 'entries'].forEach((k) => {
    const ids = new Set(batch.added[k] || []);
    const recs = out[k].filter((x) => ids.has(x.id));
    const blocked = recs.filter((x) => locked.size && locked.has(KT.monthOf(x.ngay)));
    if (blocked.length) throw new ImportError('THANG_KHOA', 'Có ' + blocked.length + ' dòng ' + k + ' thuộc tháng đã khóa sổ — mở khóa trước khi rollback');
    out[k] = out[k].filter((x) => !ids.has(x.id));
    removed[k] = recs.length;
    toTrash(k, recs, 'Rollback lần nhập Excel ' + ma + ' (' + recs.length + ' dòng)');
  });
  // danh mục: gỡ nếu không còn bản ghi nào dùng
  const usesOf = (kind, rec) => {
    const k = ck(rec.ma);
    switch (kind) {
      case 'projects': return out.costs.some((c) => ck(c.maCT) === k) || out.entries.some((e) => ck(e.maDuAn) === k) || out.houses.some((h) => ck(h.maCT) === k && !(batch.added.houses || []).includes(h.id));
      case 'houses': return out.costs.some((c) => ck(c.maNha) === k);
      case 'suppliers': return out.costs.some((c) => ck(c.maNCC) === k) || out.entries.some((e) => ck(e.maNCC) === k);
      case 'materials': return out.costs.some((c) => ck(c.maVT) === k);
      case 'costItems': return out.costs.some((c) => ck(c.maHM) === k) || out.materials.some((m) => ck(m.maHM) === k && !(batch.added.materials || []).includes(m.id));
      case 'costGroups': return out.costItems.some((i) => ck(i.maNhom) === k && !(batch.added.costItems || []).includes(i.id));
      default: return false;
    }
  };
  ['houses', 'materials', 'costItems', 'costGroups', 'suppliers', 'projects'].forEach((kind) => {
    const ids = new Set(batch.added[kind] || []);
    const recs = out[kind].filter((x) => ids.has(x.id));
    const free = recs.filter((r) => !usesOf(kind, r));
    recs.filter((r) => !free.includes(r)).forEach((r) => kept.push(kind + ' ' + r.ma + ' (đang được dùng ở bản ghi khác)'));
    out[kind] = out[kind].filter((x) => !free.includes(x));
    removed[kind] = free.length;
    toTrash(kind, free, 'Rollback lần nhập Excel ' + ma + ': ' + free.length + ' mục danh mục');
  });
  batch.rolledBackAt = now;
  batch.rolledBackBy = opts.by || '';
  batch.fps = {}; // cho phép nhập lại
  out.nextId = nextId;
  return { db: out, removed, kept, batch };
}

module.exports = {
  TOOL, ImportError, listInputFiles, pickVersions, parseFile, buildPlan, applyPlan, verify, rollbackPlan, inferLoai, fixSwappedDate, suspiciousDate,
  toISODate, clean, ck, nk, cellInfo, costContentKey, findExistingCash, isPlaceholderVoucher
};
