'use strict';
/*
 * SỐ DƯ ĐẦU KỲ CÔNG NỢ NHÀ CUNG CẤP (nhập tay): công nợ đã có từ trước khi dùng phần mềm (hoặc trước ngày bắt đầu ghi sổ),
 * theo NCC và (tùy chọn) công trình. Được cộng vào cột "Đầu kỳ" của công nợ NCC (KT.supplierDebt, KT.supplierPeriod);
 * KHÔNG phải chi phí phát sinh, không vào sổ thu chi, không đổi tồn quỹ.
 *
 * Bản ghi: { id, ngay, maNCC, maDuAn, soTien, ghiChu, createdAt, updatedAt, by }
 *   soTien > 0: mình còn nợ NCC;  soTien < 0: NCC đang giữ tiền mình ứng trước / trả dư.
 *   ngay: số dư tính đến đầu ngày này; báo cáo "đến ngày" trước ngày này thì chưa tính.
 * API: POST /api/so-du-dau, PUT /api/so-du-dau/:id, DELETE /api/so-du-dau/:id (vào thùng rác)
 * Tôn trọng khóa sổ theo tháng, ghi nhật ký thay đổi; mã NCC / công trình cũ đã gộp tự đổi sang mã đích.
 */
const KT = require('../public/js/shared.js');

module.exports = function createSoDuDauApi(h) {
  const { store, HttpError, str, money, readJson, ok, findCode, byId, trace } = h;

  // Số tiền có dấu: số âm hoặc chữ bắt đầu bằng "-" (vd "-5tr") = tiền ứng trước
  function soTienCoDau(v) {
    if (v === '' || v == null) throw new HttpError(400, 'Nhập số tiền');
    const am = typeof v === 'number' ? v < 0 : typeof v === 'string' && /^\s*[-−]/.test(v);
    const n = money(typeof v === 'number' ? Math.abs(v) : typeof v === 'string' ? v.replace(/^\s*[-−]/, '') : v, 'Số tiền');
    return am ? -n : n;
  }

  function clean(b) {
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new HttpError(400, 'Dữ liệu không hợp lệ');
    const x = { ngay: str(b.ngay, 10), maNCC: str(b.maNCC, 60), maDuAn: str(b.maDuAn, 60), soTien: soTienCoDau(b.soTien), ghiChu: str(b.ghiChu, 1000) };
    if (!KT.isISODate(x.ngay)) throw new HttpError(400, 'Ngày không hợp lệ');
    if (!x.maNCC) throw new HttpError(400, 'Chọn nhà cung cấp');
    const s = findCode(store.db.suppliers, x.maNCC);
    if (!s) throw new HttpError(400, 'Mã NCC "' + x.maNCC + '" chưa có trong danh mục');
    x.maNCC = s.ma;
    if (x.maDuAn) {
      const p = findCode(store.db.projects, x.maDuAn);
      if (!p) throw new HttpError(400, 'Mã dự án / công trình "' + x.maDuAn + '" chưa có trong danh mục');
      x.maDuAn = p.ma;
    }
    if (!x.soTien) throw new HttpError(400, 'Số dư đầu kỳ phải khác 0');
    return x;
  }

  async function handle(req, res, url) {
    const seg = url.pathname.split('/').filter(Boolean);
    if (seg[1] !== 'so-du-dau') return false;
    const m = req.method;
    const db = store.db;
    const now = new Date().toISOString();
    if (m === 'POST' && seg.length === 2) {
      const x = clean(await readJson(req));
      trace.assertOpen([x.ngay], 'ghi số dư đầu kỳ');
      const rec = Object.assign({ id: store.newId() }, x, { createdAt: now, updatedAt: now, by: trace.who(req) });
      db.soDuDauKy.push(rec);
      trace.log(req, 'them', 'soDuDauKy', rec, null, rec);
      store.save();
      ok(res, { id: rec.id });
      return true;
    }
    if (seg.length === 3 && (m === 'PUT' || m === 'DELETE')) {
      const rec = byId(db.soDuDauKy, seg[2]);
      if (m === 'PUT') {
        const x = clean(await readJson(req));
        trace.assertOpen([rec.ngay, x.ngay], 'sửa');
        const before = trace.clone(rec);
        Object.assign(rec, x, { updatedAt: now });
        trace.log(req, 'sua', 'soDuDauKy', rec, before, rec);
        store.save();
        ok(res, { id: rec.id });
        return true;
      }
      if (m === 'DELETE') {
        trace.assertOpen([rec.ngay], 'xóa');
        db.soDuDauKy = db.soDuDauKy.filter((x) => x !== rec);
        trace.toTrash(req, 'soDuDauKy', [rec], 'Số dư đầu kỳ NCC ' + trace.describe('soDuDauKy', rec));
        store.save();
        ok(res);
        return true;
      }
    }
    throw new HttpError(404, 'Không có chức năng ' + m + ' ' + url.pathname);
  }

  return { handle };
};
