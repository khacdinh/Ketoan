'use strict';
/*
 * Trả nhà cung cấp từ NGUỒN TIỀN KHÁC (ngoài quỹ tiền mặt do thủ quỹ quản lý): chuyển khoản công ty, chủ nhà / chủ đầu tư trả
 * thẳng, giám đốc trả… Khoản này được tính vào "Đã trả" của công nợ NCC (KT.supplierDebt) nhưng KHÔNG có trong sổ thu chi, không
 * làm đổi tồn quỹ và không cần phiếu chi.
 *
 * Bản ghi: { id, ngay, maNCC, maDuAn, soTien, nguon, ghiChu, createdAt, updatedAt, by }
 * API: POST /api/ext-payments, PUT /api/ext-payments/:id, DELETE /api/ext-payments/:id (vào thùng rác)
 * Tôn trọng khóa sổ theo tháng, ghi nhật ký thay đổi; mã NCC / dự án cũ đã gộp tự đổi sang mã đích.
 */
const KT = require('../public/js/shared.js');

module.exports = function createExtPayApi(h) {
  const { store, HttpError, str, money, readJson, ok, findCode, byId, trace } = h;

  function clean(b) {
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new HttpError(400, 'Dữ liệu không hợp lệ');
    const x = {
      ngay: str(b.ngay, 10),
      maNCC: str(b.maNCC, 60),
      maDuAn: str(b.maDuAn, 60),
      soTien: money(b.soTien == null ? '' : b.soTien, 'Số tiền'),
      nguon: str(b.nguon, 120) || 'Nguồn khác',
      ghiChu: str(b.ghiChu, 1000)
    };
    if (!KT.isISODate(x.ngay)) throw new HttpError(400, 'Ngày không hợp lệ');
    if (!x.maNCC) throw new HttpError(400, 'Chọn nhà cung cấp được trả');
    const s = findCode(store.db.suppliers, x.maNCC);
    if (!s) throw new HttpError(400, 'Mã NCC "' + x.maNCC + '" chưa có trong danh mục');
    x.maNCC = s.ma;
    if (x.maDuAn) {
      const p = findCode(store.db.projects, x.maDuAn);
      if (!p) throw new HttpError(400, 'Mã dự án / công trình "' + x.maDuAn + '" chưa có trong danh mục');
      x.maDuAn = p.ma;
    }
    if (!(x.soTien > 0)) throw new HttpError(400, 'Số tiền phải lớn hơn 0');
    return x;
  }

  async function handle(req, res, url) {
    const seg = url.pathname.split('/').filter(Boolean);
    if (seg[1] !== 'ext-payments') return false;
    const m = req.method;
    const db = store.db;
    const now = new Date().toISOString();
    if (m === 'POST' && seg.length === 2) {
      const x = clean(await readJson(req));
      trace.assertOpen([x.ngay], 'ghi khoản trả');
      const rec = Object.assign({ id: store.newId() }, x, { createdAt: now, updatedAt: now, by: trace.who(req) });
      db.extPayments.push(rec);
      trace.log(req, 'them', 'extPayments', rec, null, rec);
      store.save();
      ok(res, { id: rec.id });
      return true;
    }
    if (seg.length === 3 && (m === 'PUT' || m === 'DELETE')) {
      const rec = byId(db.extPayments, seg[2]);
      if (m === 'PUT') {
        const x = clean(await readJson(req));
        trace.assertOpen([rec.ngay, x.ngay], 'sửa');
        const before = trace.clone(rec);
        Object.assign(rec, x, { updatedAt: now });
        trace.log(req, 'sua', 'extPayments', rec, before, rec);
        store.save();
        ok(res, { id: rec.id });
        return true;
      }
      if (m === 'DELETE') {
        trace.assertOpen([rec.ngay], 'xóa');
        db.extPayments = db.extPayments.filter((x) => x !== rec);
        trace.toTrash(req, 'extPayments', [rec], 'Trả NCC ngoài quỹ ' + trace.describe('extPayments', rec));
        store.save();
        ok(res);
        return true;
      }
    }
    throw new HttpError(404, 'Không có chức năng ' + m + ' ' + url.pathname);
  }

  return { handle };
};
