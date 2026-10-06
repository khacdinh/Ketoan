'use strict';
/*
 * Truy vết: nhật ký thay đổi và thùng rác (xóa mềm).
 * - log(req, action, kind, rec, before, after): ghi nhận một thay đổi (được ghi xuống nhật ký khi dữ liệu lưu xong).
 * - toTrash(req, kind, records, label): chuyển bản ghi vào thùng rác thay cho xóa hẳn. Bản ghi rời khỏi danh sách
 *   đang dùng nên mọi báo cáo, công nợ, tồn quỹ tự động không tính nó; khôi phục là đưa nguyên bản ghi (giữ id) về.
 * - API: GET /api/audit, GET /api/trash, POST /api/trash/:id/restore, DELETE /api/trash/:id, POST /api/trash/purge-all
 */
const KT = require('../public/js/shared.js');
const { ACTION_LABEL, KIND_LABEL } = require('./audit');

const CATALOG_KINDS = ['projects', 'suppliers', 'costGroups', 'costItems', 'materials', 'houses'];
const TRASH_KINDS = ['entries', 'costs', 'cashCounts', 'attachments', 'extPayments', 'soDuDauKy'].concat(CATALOG_KINDS);

module.exports = function createTrace(h) {
  const { store, HttpError, str, readJson, ok, sendJson, findCode } = h;
  const hooks = { beforeRestore: [], afterPurge: [], describeExtra: [] }; // các tính năng sau (khóa sổ, đính kèm) gắn thêm

  function clone(x) { return x == null ? null : JSON.parse(JSON.stringify(x)); }

  // Người thao tác. Đăng nhập bật: họ tên + tên đăng nhập của phiên (không tin tên do trình duyệt gửi). Đăng nhập tắt: giao diện
  // gửi tên đã đặt trên máy này (Cài đặt → Người đang dùng); không có thì để trống (hiển thị "Người dùng máy này").
  function who(req) {
    if (h.ai) { const a = h.ai(req); if (a) return a; }
    const raw = req && req.headers ? req.headers['x-nguoi-dung'] : '';
    if (!raw) return '';
    let v = '';
    try { v = decodeURIComponent(String(raw)); } catch (e) { v = ''; }
    try { return str(v, 60); } catch (e) { return ''; }
  }

  // Mô tả ngắn một bản ghi để đọc trong nhật ký / thùng rác
  function describe(kind, r) {
    if (!r) return '';
    const m = (n) => KT.fmtMoney(n);
    if (kind === 'entries') {
      return KT.fmtDate(r.ngay) + (r.soPhieu ? ' · ' + r.soPhieu : '') + ' · ' +
        [r.thu ? 'thu ' + m(r.thu) : '', r.chi ? 'chi ' + m(r.chi) : ''].filter(Boolean).join(', ') + (r.noiDung ? ' · ' + String(r.noiDung).slice(0, 80) : '');
    }
    if (kind === 'costs') {
      return KT.fmtDate(r.ngay) + ' · ' + (r.maCT || '') + ' · ' + (r.maVT || String(r.dienGiai || '').slice(0, 60)) + ' · ' +
        (KT.isKhoan(r) ? 'theo khoản ' + m(r.thanhTien) : KT.fmtQty(r.soLuong) + ' × ' + m(r.donGia) + ' = ' + m(r.thanhTien));
    }
    if (kind === 'extPayments') {
      return KT.fmtDate(r.ngay) + ' · trả ' + (r.maNCC || '') + (r.maDuAn ? ' · ' + r.maDuAn : '') + ' · ' + m(r.soTien) + ' · ' + (r.nguon || 'nguồn khác') + (r.ghiChu ? ' · ' + String(r.ghiChu).slice(0, 80) : '');
    }
    if (kind === 'soDuDauKy') {
      return KT.fmtDate(r.ngay) + ' · ' + (r.maNCC || '') + (r.maDuAn ? ' · ' + r.maDuAn : '') + ' · ' + (Number(r.soTien) < 0 ? 'ứng trước ' + m(-r.soTien) : 'còn nợ ' + m(r.soTien)) + (r.ghiChu ? ' · ' + String(r.ghiChu).slice(0, 80) : '');
    }
    if (CATALOG_KINDS.includes(kind)) return (r.ma || '') + ' — ' + (r.ten || '');
    return '';
  }

  function describeSlip(lines) {
    if (!lines.length) return '';
    const c = lines[0];
    const total = lines.reduce((t, x) => t + (Number(x.thanhTien) || 0), 0);
    const cts = Array.from(new Set(lines.map((x) => x.maCT || '').filter(Boolean))); // phiếu nhiều công trình: ghi mã đầu + số công trình còn lại
    return 'Phiếu nhập ' + KT.fmtDate(c.ngay) + ' · ' + (cts[0] || c.maCT || '') + (cts.length > 1 ? ' +' + (cts.length - 1) + ' công trình' : '') + ' · NCC ' + (c.maNCC || '') + (c.soPhieu ? ' · số ' + c.soPhieu : '') +
      ' · ' + lines.length + ' dòng · ' + KT.fmtMoney(total) + ' đ';
  }

  // Điểm móc DUY NHẤT ghi người thao tác: mọi chỗ thêm / sửa dữ liệu đều gọi log(). Ghi nguoiTao (thêm) / nguoiSua (sửa, ghi sổ)
  // lên bản ghi nghiệp vụ: id người đăng nhập, hoặc "Người dùng máy này" khi đăng nhập tắt. Bản ghi cũ chưa có = "Dữ liệu cũ".
  const STAMP_KINDS = new Set(['entries', 'costs', 'slips', 'projects', 'suppliers', 'costGroups', 'costItems', 'materials', 'houses', 'extPayments', 'soDuDauKy', 'cashCounts']);
  function dongDau(req, action, kind, rec, after) {
    if (!h.nhanNguoi || !STAMP_KINDS.has(kind)) return;
    const nhan = h.nhanNguoi(req);
    const ds = [].concat(rec && typeof rec === 'object' && !Array.isArray(rec) ? [rec] : [], Array.isArray(after) ? after : []);
    ds.forEach((x) => {
      if (!x || typeof x !== 'object') return;
      if (action === 'them' || action === 'kiem-quy') { if (x.nguoiTao === undefined) x.nguoiTao = nhan; return; }
      if (action === 'sua' || action === 'ghi-so') {
        x.nguoiSua = nhan;
        if (x.nguoiTao === undefined && x.createdAt && x.createdAt === x.updatedAt) x.nguoiTao = nhan; // dòng mới tạo trong lúc sửa phiếu
      }
    });
  }

  function log(req, action, kind, rec, before, after, extra) {
    dongDau(req, action, kind, rec, after);
    const recId = rec == null ? '' : typeof rec === 'object' ? rec.id : rec;
    const label = (extra && extra.label) || describe(kind, after || before || (typeof rec === 'object' ? rec : null));
    store.audit(Object.assign({ by: who(req), action, kind, recId, label, before: clone(before), after: clone(after) },
      req && req.nguoiDung ? { nguoiDungId: req.nguoiDung.id } : {}, extra || {}, { label }));
  }

  // Chuyển vào thùng rác. records: các bản ghi ĐÃ bị gỡ khỏi danh sách đang dùng.
  // Chứng từ đính kèm của các bản ghi bị xóa đi theo vào thùng rác (khôi phục cùng lúc)
  function takeAttachments(kind, records, extra) {
    const db = store.db;
    if (!db.attachments || !db.attachments.length || (kind !== 'entries' && kind !== 'costs')) return [];
    const ids = new Set(records.map((r) => r.id));
    const pid = extra && extra.group === 'slip' ? extra.phieuId : null;
    const taken = db.attachments.filter((a) => (a.owner === kind && ids.has(a.ownerId)) || (pid && a.owner === 'slips' && a.ownerId === pid));
    if (taken.length) db.attachments = db.attachments.filter((a) => !taken.includes(a));
    return taken;
  }

  function toTrash(req, kind, records, label, extra) {
    if (!records.length) return null;
    const att = takeAttachments(kind, records, extra);
    const item = Object.assign({ id: store.newId(), at: new Date().toISOString(), by: who(req), kind, label, records: clone(records) }, att.length ? { attachments: att } : {}, extra || {});
    store.db.trash.push(item);
    store.audit({ by: item.by, nguoiDungId: req && req.nguoiDung ? req.nguoiDung.id : undefined, action: 'xoa', kind: extra && extra.group === 'slip' ? 'slips' : kind, recId: extra && extra.phieuId ? extra.phieuId : records.length === 1 ? records[0].id : item.id,
      ids: records.map((r) => r.id), label, before: records.length <= 500 ? clone(records) : null, note: 'Chuyển vào thùng rác (mục số ' + item.id + ')' + (records.length > 1 ? ', ' + records.length + ' bản ghi' : '') });
    return item;
  }

  /* ---------------- khóa sổ theo kỳ ---------------- */

  // Chặn thêm / sửa / xóa / khôi phục bản ghi có ngày thuộc tháng đã khóa (423 + hướng dẫn mở khóa)
  function assertOpen(dates, verb) {
    const db = store.db;
    if (!db.locks || !db.locks.length) return;
    const locked = KT.lockedMonths(db);
    for (const d of dates) {
      const t = KT.monthOf(d);
      if (d && locked.has(t)) throw new HttpError(423, KT.lockMessage(t, verb));
    }
  }

  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

  function lockMonths(req, months) {
    const db = store.db;
    const have = KT.lockedMonths(db);
    const todo = Array.from(new Set(months)).filter((t) => !have.has(t)).sort();
    todo.forEach((t) => {
      if (!MONTH_RE.test(t)) throw new HttpError(400, 'Tháng không hợp lệ: ' + t);
      const nhap = db.entries.filter((e) => KT.isDraft(e) && KT.monthOf(e.ngay) === t).length + db.costs.filter((c) => KT.isDraft(c) && KT.monthOf(c.ngay) === t).length;
      if (nhap) throw new HttpError(409, 'Tháng ' + KT.monthLabel(t) + ' còn ' + nhap + ' dòng Nháp chưa ghi sổ. Ghi sổ hoặc xóa các dòng nháp đó trước khi khóa sổ.');
    });
    const by = who(req);
    const at = new Date().toISOString();
    todo.forEach((t) => {
      db.locks.push({ thang: t, at, by });
      const e = db.entries.filter((x) => KT.monthOf(x.ngay) === t);
      const c = db.costs.filter((x) => KT.monthOf(x.ngay) === t);
      store.audit({ by, action: 'khoa-so', kind: 'locks', recId: t, label: 'Khóa sổ tháng ' + KT.monthLabel(t),
        note: e.length + ' dòng sổ thu chi (thu ' + KT.fmtMoney(e.reduce((s, x) => s + (x.thu || 0), 0)) + ', chi ' + KT.fmtMoney(e.reduce((s, x) => s + (x.chi || 0), 0)) + '), ' +
          c.length + ' dòng chi phí (' + KT.fmtMoney(c.reduce((s, x) => s + (x.thanhTien || 0), 0)) + ' đ)' });
    });
    db.locks.sort((a, b) => (a.thang < b.thang ? -1 : 1));
    return todo;
  }

  /* ---------------- khôi phục ---------------- */

  function need(list, ma, label) {
    if (ma && !findCode(list, ma)) throw new HttpError(409, label + ' "' + ma + '" không còn trong danh mục. Khôi phục hoặc thêm lại ' + label.toLowerCase() + ' này trước.');
  }

  function checkRestore(item) {
    const db = store.db;
    const list = db[item.kind];
    if (!list) throw new HttpError(400, 'Loại dữ liệu trong thùng rác không hợp lệ');
    const ids = new Set(list.map((x) => x.id));
    item.records.forEach((r) => {
      if (ids.has(r.id)) throw new HttpError(409, 'Bản ghi số ' + r.id + ' đã có trong dữ liệu đang dùng (đã khôi phục trước đó?)');
      if (CATALOG_KINDS.includes(item.kind)) {
        const dup = findCode(list, r.ma);
        if (dup) throw new HttpError(409, 'Mã "' + r.ma + '" đã có trong danh mục (' + (dup.ten || '') + '). Đổi mã của mục đang dùng rồi mới khôi phục được.');
      }
      if (item.kind === 'entries' || item.kind === 'extPayments' || item.kind === 'soDuDauKy') { need(db.projects, r.maDuAn, 'Dự án'); need(db.suppliers, r.maNCC, 'Nhà cung cấp'); }
      if (item.kind === 'costs') {
        need(db.projects, r.maCT, 'Công trình'); need(db.suppliers, r.maNCC, 'Nhà cung cấp'); need(db.costItems, r.maHM, 'Hạng mục');
        need(db.materials, r.maVT, 'Vật tư'); need(db.houses, r.maNha, 'Nhà');
      }
      if (item.kind === 'costItems') need(db.costGroups, r.maNhom, 'Nhóm chi phí');
      if (item.kind === 'materials') need(db.costItems, r.maHM, 'Hạng mục');
      if (item.kind === 'houses') need(db.projects, r.maCT, 'Công trình');
      if (item.kind === 'attachments') {
        const has = r.owner === 'slips' ? db.costs.some((c) => c.phieuId === r.ownerId) : (db[r.owner] || []).some((x) => x.id === r.ownerId);
        if (!has) throw new HttpError(409, 'Chứng từ này thuộc một bản ghi đã bị xóa. Khôi phục bản ghi đó trước.');
      }
    });
    if (item.kind !== 'attachments' && item.kind !== 'cashCounts') assertOpen(item.records.map((r) => r.ngay).filter(Boolean), 'khôi phục');
    hooks.beforeRestore.forEach((fn) => fn(item));
  }

  function restore(req, item) {
    checkRestore(item);
    const list = store.db[item.kind];
    item.records.forEach((r) => list.push(clone(r)));
    (item.attachments || []).forEach((a) => { if (!store.db.attachments.some((x) => x.id === a.id)) store.db.attachments.push(clone(a)); });
    store.db.trash = store.db.trash.filter((t) => t !== item);
    store.audit({ by: who(req), action: 'khoi-phuc', kind: item.group === 'slip' ? 'slips' : item.kind, recId: item.phieuId || (item.records.length === 1 ? item.records[0].id : item.id),
      ids: item.records.map((r) => r.id), label: item.label, after: item.records.length <= 500 ? clone(item.records) : null, note: 'Từ thùng rác (mục số ' + item.id + ')' });
  }

  function purge(req, item) {
    store.db.trash = store.db.trash.filter((t) => t !== item);
    hooks.afterPurge.forEach((fn) => fn(item));
    store.audit({ by: who(req), action: 'xoa-vinh-vien', kind: item.group === 'slip' ? 'slips' : item.kind, recId: item.phieuId || (item.records.length === 1 ? item.records[0].id : item.id),
      ids: item.records.map((r) => r.id), label: item.label, before: item.records.length <= 500 ? clone(item.records) : null, note: 'Xóa khỏi thùng rác (mục số ' + item.id + ')' });
  }

  function trashSummary(t) {
    return { id: t.id, at: t.at, by: t.by || '', kind: t.kind, group: t.group || '', label: t.label, count: t.records.length,
      kindLabel: t.group === 'slip' ? KIND_LABEL.slips : KIND_LABEL[t.kind] || t.kind, records: t.records.slice(0, 200) };
  }

  /* ---------------- API ---------------- */

  async function handle(req, res, url) {
    const p = url.pathname;
    const m = req.method;
    const seg = p.split('/').filter(Boolean);

    if (p === '/api/audit' && m === 'GET') {
      const q = url.searchParams;
      const r = store.log.query({
        from: KT.isISODate(q.get('from')) ? q.get('from') : '', to: KT.isISODate(q.get('to')) ? q.get('to') : '',
        action: q.get('action') || '', kind: q.get('kind') || '', recId: q.get('recId') || '', q: q.get('q') || '',
        limit: q.get('limit'), offset: q.get('offset')
      }, KT.normalizeText);
      sendJson(res, 200, { ok: true, total: r.total, items: r.items, actions: ACTION_LABEL, kinds: KIND_LABEL, bad: store.log.bad });
      return true;
    }

    /* ----- khóa sổ: POST /api/locks { months: ['2026-08'] } ; POST /api/locks/unlock { thang, lyDo } ----- */
    if (seg[1] === 'locks' && m === 'POST' && (seg.length === 2 || (seg.length === 3 && seg[2] === 'unlock'))) {
      const b = await readJson(req);
      if (seg[2] === 'unlock') {
        const t = str(b.thang, 7);
        const lyDo = str(b.lyDo, 300);
        const lk = store.db.locks.find((l) => l.thang === t);
        if (!lk) throw new HttpError(404, 'Tháng ' + KT.monthLabel(t) + ' chưa khóa sổ');
        if (!lyDo) throw new HttpError(400, 'Cần ghi lý do mở khóa sổ');
        store.db.locks = store.db.locks.filter((l) => l !== lk);
        store.audit({ by: who(req), action: 'mo-khoa', kind: 'locks', recId: t, label: 'Mở khóa sổ tháng ' + KT.monthLabel(t), note: 'Lý do: ' + lyDo + '. Khóa trước đó lúc ' + lk.at + (lk.by ? ' bởi ' + lk.by : ''), before: lk });
        store.save();
        ok(res, { unlocked: t });
        return true;
      }
      if (seg.length === 2) {
        const months = Array.isArray(b.months) ? b.months.map((x) => str(x, 7)) : [str(b.thang, 7)];
        if (!months.length || months.length > 600) throw new HttpError(400, 'Danh sách tháng không hợp lệ');
        months.forEach((t) => { if (!MONTH_RE.test(t)) throw new HttpError(400, 'Tháng không hợp lệ: ' + t); });
        const done = lockMonths(req, months);
        store.save();
        ok(res, { locked: done });
        return true;
      }
    }

    /* ----- bỏ qua cảnh báo "Cần xử lý": POST /api/warnings/ignore { key, label, note } ; /unignore { key } ----- */
    if (seg[1] === 'warnings' && m === 'POST' && seg.length === 3 && (seg[2] === 'ignore' || seg[2] === 'unignore')) {
      const b = await readJson(req);
      const key = str(b.key, 300);
      if (!key || !/^[a-z]+:/.test(key) || /__proto__|constructor|prototype/.test(key)) throw new HttpError(400, 'Mã cảnh báo không hợp lệ');
      const map = store.db.ignoredWarnings;
      if (seg[2] === 'ignore') {
        const x = { at: new Date().toISOString(), by: who(req), label: str(b.label, 300), note: str(b.note, 300) };
        map[key] = x;
        store.audit({ by: x.by, action: 'bo-qua-canh-bao', kind: 'warnings', recId: key, label: 'Bỏ qua cảnh báo: ' + (x.label || key), note: x.note ? 'Ghi chú: ' + x.note : '' });
      } else {
        if (!Object.prototype.hasOwnProperty.call(map, key)) throw new HttpError(404, 'Cảnh báo này chưa bị bỏ qua');
        const before = map[key];
        delete map[key];
        store.audit({ by: who(req), action: 'sua', kind: 'warnings', recId: key, label: 'Theo dõi lại cảnh báo: ' + (before.label || key), before });
      }
      store.save();
      ok(res);
      return true;
    }

    if (seg[1] !== 'trash') return false;
    if (m === 'GET' && seg.length === 2) {
      sendJson(res, 200, { ok: true, items: store.db.trash.slice().reverse().map(trashSummary) });
      return true;
    }
    if (m === 'POST' && seg[2] === 'purge-all' && seg.length === 3) {
      const b = await readJson(req);
      if (b.confirm !== 'XOA') throw new HttpError(400, 'Cần xác nhận bằng chữ XOA');
      const items = store.db.trash.slice();
      items.forEach((t) => purge(req, t));
      store.save();
      ok(res, { purged: items.length });
      return true;
    }
    const laKhoiPhuc = m === 'POST' && seg.length === 4 && seg[3] === 'restore';
    const laXoa = m === 'DELETE' && seg.length === 3;
    if (!laKhoiPhuc && !laXoa) return false;
    const id = Number(seg[2]);
    const item = store.db.trash.find((t) => t.id === id);
    if (!item) throw new HttpError(404, 'Không tìm thấy mục này trong thùng rác (có thể đã được khôi phục hoặc xóa vĩnh viễn)');
    if (laKhoiPhuc) {
      restore(req, item);
      store.save();
      ok(res, { restored: item.records.length, kind: item.kind });
      return true;
    }
    if (laXoa) {
      purge(req, item);
      store.save();
      ok(res, { purged: 1 });
      return true;
    }
    return false;
  }

  return { handle, log, toTrash, describe, describeSlip, who, clone, hooks, assertOpen, TRASH_KINDS, CATALOG_KINDS };
};
