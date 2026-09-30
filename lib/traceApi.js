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
const TRASH_KINDS = ['entries', 'costs'].concat(CATALOG_KINDS);

module.exports = function createTrace(h) {
  const { store, HttpError, str, readJson, ok, sendJson, findCode } = h;
  const hooks = { beforeRestore: [], afterPurge: [], describeExtra: [] }; // các tính năng sau (khóa sổ, đính kèm) gắn thêm

  function clone(x) { return x == null ? null : JSON.parse(JSON.stringify(x)); }

  // Người thao tác: giao diện gửi tên đã đặt trên máy này (Cài đặt → Người đang dùng). Không có thì để trống.
  function who(req) {
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
        KT.fmtQty(r.soLuong) + ' × ' + m(r.donGia) + ' = ' + m(r.thanhTien);
    }
    if (CATALOG_KINDS.includes(kind)) return (r.ma || '') + ' — ' + (r.ten || '');
    return '';
  }

  function describeSlip(lines) {
    if (!lines.length) return '';
    const c = lines[0];
    const total = lines.reduce((t, x) => t + (Number(x.thanhTien) || 0), 0);
    return 'Phiếu nhập ' + KT.fmtDate(c.ngay) + ' · ' + (c.maCT || '') + ' · NCC ' + (c.maNCC || '') + (c.soPhieu ? ' · số ' + c.soPhieu : '') +
      ' · ' + lines.length + ' dòng · ' + KT.fmtMoney(total) + ' đ';
  }

  function log(req, action, kind, rec, before, after, extra) {
    const recId = rec == null ? '' : typeof rec === 'object' ? rec.id : rec;
    const label = (extra && extra.label) || describe(kind, after || before || (typeof rec === 'object' ? rec : null));
    store.audit(Object.assign({ by: who(req), action, kind, recId, label, before: clone(before), after: clone(after) }, extra || {}, { label }));
  }

  // Chuyển vào thùng rác. records: các bản ghi ĐÃ bị gỡ khỏi danh sách đang dùng.
  function toTrash(req, kind, records, label, extra) {
    if (!records.length) return null;
    const item = Object.assign({ id: store.newId(), at: new Date().toISOString(), by: who(req), kind, label, records: clone(records) }, extra || {});
    store.db.trash.push(item);
    store.audit({ by: item.by, action: 'xoa', kind: extra && extra.group === 'slip' ? 'slips' : kind, recId: extra && extra.phieuId ? extra.phieuId : records.length === 1 ? records[0].id : item.id,
      ids: records.map((r) => r.id), label, before: records.length <= 500 ? clone(records) : null, note: 'Chuyển vào thùng rác (mục số ' + item.id + ')' + (records.length > 1 ? ', ' + records.length + ' bản ghi' : '') });
    return item;
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
      if (item.kind === 'entries') { need(db.projects, r.maDuAn, 'Dự án'); need(db.suppliers, r.maNCC, 'Nhà cung cấp'); }
      if (item.kind === 'costs') {
        need(db.projects, r.maCT, 'Công trình'); need(db.suppliers, r.maNCC, 'Nhà cung cấp'); need(db.costItems, r.maHM, 'Hạng mục');
        need(db.materials, r.maVT, 'Vật tư'); need(db.houses, r.maNha, 'Nhà');
      }
      if (item.kind === 'costItems') need(db.costGroups, r.maNhom, 'Nhóm chi phí');
      if (item.kind === 'materials') need(db.costItems, r.maHM, 'Hạng mục');
      if (item.kind === 'houses') need(db.projects, r.maCT, 'Công trình');
    });
    hooks.beforeRestore.forEach((fn) => fn(item));
  }

  function restore(req, item) {
    checkRestore(item);
    const list = store.db[item.kind];
    item.records.forEach((r) => list.push(clone(r)));
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

    if (seg[1] !== 'trash') return false;
    if (m === 'GET' && seg.length === 2) {
      sendJson(res, 200, { ok: true, items: store.db.trash.slice().reverse().map(trashSummary) });
      return true;
    }
    if (m === 'POST' && seg[2] === 'purge-all') {
      const b = await readJson(req);
      if (b.confirm !== 'XOA') throw new HttpError(400, 'Cần xác nhận bằng chữ XOA');
      const items = store.db.trash.slice();
      items.forEach((t) => purge(req, t));
      store.save();
      ok(res, { purged: items.length });
      return true;
    }
    const id = Number(seg[2]);
    const item = store.db.trash.find((t) => t.id === id);
    if (seg.length >= 3 && !item) throw new HttpError(404, 'Không tìm thấy mục này trong thùng rác (có thể đã được khôi phục hoặc xóa vĩnh viễn)');
    if (m === 'POST' && seg[3] === 'restore') {
      restore(req, item);
      store.save();
      ok(res, { restored: item.records.length, kind: item.kind });
      return true;
    }
    if (m === 'DELETE' && seg.length === 3) {
      purge(req, item);
      store.save();
      ok(res, { purged: 1 });
      return true;
    }
    return false;
  }

  return { handle, log, toTrash, describe, describeSlip, who, clone, hooks, TRASH_KINDS, CATALOG_KINDS };
};
