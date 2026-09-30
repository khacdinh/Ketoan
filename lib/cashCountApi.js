'use strict';
/*
 * Đối chiếu tồn quỹ (kiểm kê quỹ tiền mặt).
 * db.cashCounts: [{ id, ngay, thucTe, tonSo, menhGia: { '500000': số tờ, ... }, nguoiKiem, ghiChu, createdAt, by }]
 *  - tonSo: tồn quỹ theo sổ (chỉ dòng đã ghi sổ) tính đến hết ngày kiểm, chụp lại lúc lập biên bản.
 *  - chênh lệch = thucTe − tồn quỹ theo sổ; khác 0 thì màn hình "Cần xử lý" nhắc (tính lại theo sổ hiện tại).
 * API: POST /api/cash-counts, DELETE /api/cash-counts/:id (vào thùng rác), GET /api/export/cash-count?id= (Excel biên bản)
 */
const ExcelJS = require('exceljs');
const KT = require('../public/js/shared.js');

const MENH_GIA = [500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200];

module.exports = function createCashCountApi(h) {
  const { store, HttpError, str, money, readJson, ok, byId, trace } = h;

  function clean(b) {
    const ngay = str(b.ngay, 10);
    if (!KT.isISODate(ngay)) throw new HttpError(400, 'Ngày kiểm quỹ không hợp lệ');
    if (ngay > KT.todayISO()) throw new HttpError(400, 'Ngày kiểm quỹ không được ở tương lai');
    const menhGia = {};
    let tongMG = 0;
    let coMG = false;
    if (b.menhGia !== undefined && b.menhGia !== null) {
      if (typeof b.menhGia !== 'object' || Array.isArray(b.menhGia)) throw new HttpError(400, 'Bảng kê mệnh giá không hợp lệ');
      MENH_GIA.forEach((mg) => {
        const v = b.menhGia[mg];
        if (v === undefined || v === null || v === '') return;
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0 || n > 1e7) throw new HttpError(400, 'Số tờ loại ' + KT.fmtMoney(mg) + ' không hợp lệ');
        if (n) { menhGia[mg] = n; tongMG += n * mg; coMG = true; }
      });
    }
    let thucTe = b.thucTe === undefined || b.thucTe === null || b.thucTe === '' ? null : money(b.thucTe, 'Số tiền thực tế');
    if (thucTe === null) {
      if (!coMG) throw new HttpError(400, 'Nhập số tiền thực tế đếm được (hoặc bảng kê số tờ theo mệnh giá)');
      thucTe = tongMG;
    }
    if (coMG && tongMG !== thucTe) throw new HttpError(400, 'Tổng bảng kê mệnh giá (' + KT.fmtMoney(tongMG) + ') khác số tiền thực tế (' + KT.fmtMoney(thucTe) + ')');
    return { ngay, thucTe, menhGia, nguoiKiem: str(b.nguoiKiem, 200), ghiChu: str(b.ghiChu, 1000) };
  }

  async function handle(req, res, url) {
    const seg = url.pathname.split('/').filter(Boolean);
    const m = req.method;
    if (seg[1] !== 'cash-counts') return false;
    const db = store.db;
    if (m === 'POST' && seg.length === 2) {
      const x = clean(await readJson(req));
      const tonSo = KT.cashBalanceAt(db, x.ngay);
      const rec = Object.assign({ id: store.newId() }, x, { tonSo, createdAt: new Date().toISOString(), by: trace.who(req) });
      db.cashCounts.push(rec);
      const cl = rec.thucTe - tonSo;
      trace.log(req, 'kiem-quy', 'cashCounts', rec, null, rec, {
        label: 'Kiểm quỹ ngày ' + KT.fmtDate(rec.ngay) + ': thực tế ' + KT.fmtMoney(rec.thucTe) + ' đ, theo sổ ' + KT.fmtMoney(tonSo) + ' đ',
        note: cl ? (cl > 0 ? 'Thừa ' : 'Thiếu ') + KT.fmtMoney(Math.abs(cl)) + ' đ' : 'Khớp sổ'
      });
      store.save();
      ok(res, { id: rec.id, tonSo, chenhLech: cl });
      return true;
    }
    if (m === 'DELETE' && seg.length === 3) {
      const rec = byId(db.cashCounts, seg[2]);
      db.cashCounts = db.cashCounts.filter((x) => x !== rec);
      trace.toTrash(req, 'cashCounts', [rec], 'Biên bản kiểm quỹ ngày ' + KT.fmtDate(rec.ngay) + ' (thực tế ' + KT.fmtMoney(rec.thucTe) + ' đ)');
      store.save();
      ok(res);
      return true;
    }
    return false;
  }

  // Biên bản kiểm kê quỹ dạng Excel (theo mẫu 08a-TT, rút gọn)
  async function buildWorkbook(db, id) {
    const rec = (db.cashCounts || []).find((x) => x.id === Number(id));
    if (!rec) { const e = new Error('Không tìm thấy biên bản kiểm quỹ'); e.status = 404; throw e; }
    const s = db.settings || {};
    const soHienTai = KT.cashBalanceAt(db, rec.ngay);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('BienBanKiemQuy', { pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.columns = [{ width: 6 }, { width: 30 }, { width: 14 }, { width: 22 }];
    const font = { name: 'Times New Roman', size: 12 };
    const put = (r, c, v, o) => { const cell = ws.getCell(r, c); cell.value = v; cell.font = Object.assign({}, font, (o && o.font) || {}); if (o && o.fmt) cell.numFmt = o.fmt; if (o && o.align) cell.alignment = o.align; return cell; };
    let r = 1;
    put(r++, 1, s.tenDonVi || '', { font: { bold: true } });
    put(r++, 1, s.diaChi || '');
    r++;
    ws.mergeCells(r, 1, r, 4); put(r++, 1, 'BIÊN BẢN KIỂM KÊ QUỸ', { font: { bold: true, size: 15 }, align: { horizontal: 'center' } });
    ws.mergeCells(r, 1, r, 4); put(r++, 1, '(Dùng cho tiền Việt Nam) — Ngày ' + KT.fmtDate(rec.ngay), { font: { italic: true }, align: { horizontal: 'center' } });
    r++;
    put(r++, 1, 'Thủ quỹ: ' + (s.thuQuy || '...............') + (rec.nguoiKiem ? '    Người kiểm kê: ' + rec.nguoiKiem : ''));
    r++;
    ['STT', 'Diễn giải', 'Số tờ', 'Số tiền (đồng)'].forEach((t, i) => put(r, i + 1, t, { font: { bold: true }, align: { horizontal: 'center' } }));
    const head = r++;
    put(r, 1, 'I'); put(r, 2, 'Số dư theo sổ quỹ (đến hết ngày ' + KT.fmtDate(rec.ngay) + ')'); put(r++, 4, rec.tonSo, { fmt: '#,##0' });
    put(r, 1, 'II'); put(r, 2, 'Số kiểm kê thực tế'); put(r++, 4, rec.thucTe, { fmt: '#,##0', font: { bold: true } });
    let i = 1;
    const first = r;
    MENH_GIA.forEach((mg) => {
      const n = (rec.menhGia || {})[mg];
      if (!n) return;
      put(r, 1, i++); put(r, 2, '  Loại ' + KT.fmtMoney(mg)); put(r, 3, n, { fmt: '#,##0' });
      ws.getCell(r, 4).value = { formula: 'C' + r + '*' + mg, result: n * mg };
      ws.getCell(r, 4).numFmt = '#,##0'; ws.getCell(r, 4).font = font;
      r++;
    });
    if (r > first) { put(r, 2, '  Cộng bảng kê', { font: { italic: true } }); ws.getCell(r, 4).value = { formula: 'SUM(D' + first + ':D' + (r - 1) + ')', result: rec.thucTe }; ws.getCell(r, 4).numFmt = '#,##0'; ws.getCell(r, 4).font = font; r++; }
    const cl = rec.thucTe - rec.tonSo;
    put(r, 1, 'III'); put(r, 2, 'Chênh lệch (II − I): ' + (cl > 0 ? 'thừa' : cl < 0 ? 'thiếu' : 'khớp')); put(r++, 4, cl, { fmt: '#,##0;[Red]-#,##0', font: { bold: true } });
    for (let rr = head; rr < r; rr++) for (let c = 1; c <= 4; c++) ws.getCell(rr, c).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    r++;
    if (soHienTai !== rec.tonSo) { put(r++, 1, 'Lưu ý: số dư theo sổ tính lại hôm nay là ' + KT.fmtMoney(soHienTai) + ' đ (sổ đã được sửa sau khi kiểm quỹ).', { font: { italic: true, color: { argb: 'FFB3261E' } } }); }
    put(r++, 1, 'Lý do / ghi chú: ' + (rec.ghiChu || '..............................................................'));
    put(r++, 1, 'Kết luận sau khi kiểm kê quỹ: ..............................................................');
    r += 1;
    ['Kế toán trưởng', 'Thủ quỹ', 'Người kiểm kê'].forEach((t, k) => { put(r, [1, 2, 4][k], t, { font: { bold: true }, align: { horizontal: 'center' } }); put(r + 1, [1, 2, 4][k], '(Ký, họ tên)', { font: { italic: true, size: 10 }, align: { horizontal: 'center' } }); });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  return { handle, buildWorkbook, MENH_GIA };
};

module.exports.MENH_GIA = MENH_GIA;
