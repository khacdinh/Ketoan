'use strict';
/*
 * API chi phí công trình: danh mục (nhóm CP, hạng mục, vật tư, nhà), phiếu nhập,
 * dòng chi phí. Dùng chung các tiện ích kiểm tra dữ liệu của server.js.
 *
 * Dòng chi phí lưu:
 *   { id, seq, phieuId, ngay, maCT, maNha, maHM, loaiCP, maVT, dienGiai,
 *     soLuong, donGia, thanhTien, maNCC, soPhieu, ghiChu, nguon, createdAt, updatedAt }
 * Tên vật tư, ĐVT, Nhóm CP, tên NCC... luôn tra từ danh mục (như công thức INDEX/MATCH trong Excel).
 */
const KT = require('../public/js/shared.js');

module.exports = function createCostApi(h) {
  const { store, HttpError, str, money, readJson, ok, findCode, byId, idList, own, trace } = h;
  const assertNotMerged = h.assertNotMerged || (() => {});
  const assertActive = h.assertActive || (() => {});
  const LOAI = { costItems: 'hm', materials: 'vt', houses: 'nha' };

  /* ---------------- kiểm tra dữ liệu ---------------- */

  function qty(v, label) {
    if ((v !== null && typeof v === 'object') || typeof v === 'boolean') throw new HttpError(400, label + ' không hợp lệ');
    const n = KT.parseQty(v);
    if (isNaN(n)) throw new HttpError(400, label + ' không hợp lệ');
    if (n < 0) throw new HttpError(400, label + ' không được âm');
    if (n > 1e12) throw new HttpError(400, label + ' quá lớn');
    return n;
  }

  function price(v, label) {
    if ((v !== null && typeof v === 'object') || typeof v === 'boolean') throw new HttpError(400, label + ' không hợp lệ');
    if (typeof v === 'number') {
      if (!isFinite(v)) throw new HttpError(400, label + ' không hợp lệ');
      if (v < 0) throw new HttpError(400, label + ' không được âm');
      return Math.round(v * 100) / 100;
    }
    return money(v, label);
  }

  function requireCode(list, ma, label, required) {
    const t = str(ma, 60);
    if (!t) {
      if (required) throw new HttpError(400, 'Thiếu ' + label);
      return '';
    }
    const x = findCode(list, t);
    if (!x) throw new HttpError(400, label + ' "' + t + '" chưa có trong danh mục');
    return x.ma;
  }

  function resolveItem(v, where) {
    const t = str(v, 300);
    if (!t) throw new HttpError(400, where + 'thiếu Hạng mục');
    const it = KT.findCostItem(store.db, t);
    if (!it) throw new HttpError(400, where + 'hạng mục "' + t + '" chưa có trong danh mục');
    return it.ma;
  }

  // Phần đầu phiếu: dùng chung cho cả phiếu (giống khung trên của sheet PHIEU_NHAP)
  function cleanHeader(b) {
    const db = store.db;
    const hd = {
      ngay: str(b.ngay, 10),
      maCT: requireCode(db.projects, b.maCT, 'Mã công trình', true),
      maNha: requireCode(db.houses, b.maNha, 'Mã nhà', false),
      maNCC: requireCode(db.suppliers, b.maNCC, 'Mã nhà cung cấp', true),
      soPhieu: str(b.soPhieu, 60)
    };
    if (!KT.isISODate(hd.ngay)) throw new HttpError(400, 'Ngày không hợp lệ');
    if (hd.maNha) {
      const nha = findCode(db.houses, hd.maNha);
      if (nha.maCT && KT.keyOf(nha.maCT) !== KT.keyOf(hd.maCT)) {
        throw new HttpError(400, 'Nhà "' + nha.ma + '" thuộc công trình ' + nha.maCT + ', không thuộc ' + hd.maCT);
      }
    }
    return hd;
  }

  // Một dòng hàng. where = "Dòng 3: " để báo lỗi đúng chỗ
  function cleanLine(b, hd, defaultHM, where) {
    const db = store.db;
    where = where || '';
    if (b === null || typeof b !== 'object') throw new HttpError(400, where + 'dòng hàng phải là một đối tượng');
    const maVT = str(b.maVT, 60);
    const dienGiai = str(b.dienGiai, 1000);
    if (!maVT && !dienGiai) throw new HttpError(400, where + 'cần Mã VT hoặc Diễn giải');
    let vt = '';
    if (maVT) {
      const m = findCode(db.materials, maVT);
      if (!m) throw new HttpError(400, where + 'mã vật tư "' + maVT + '" chưa có trong danh mục');
      vt = m.ma;
    }
    // Đủ SL và ĐG, hoặc chỉ nhập Thành tiền (theo khoản: SL, ĐG để trống — không tự gán SL 1), hoặc SL + Thành tiền (tính ĐG)
    const blank = (v) => v === '' || v == null;
    const r = KT.costFromInput(blank(b.soLuong) ? null : qty(b.soLuong, where + 'Số lượng'), blank(b.donGia) ? null : price(b.donGia, where + 'Đơn giá'),
      blank(b.thanhTien) ? null : price(b.thanhTien, where + 'Thành tiền'));
    if (r.loi) throw new HttpError(400, where + r.loi);
    const { soLuong, donGia, thanhTien } = r;
    const maHM = resolveItem(str(b.maHM, 300) || defaultHM, where);
    const loaiCP = KT.normLoaiCP(str(b.loaiCP, 60)) || KT.defaultLoaiCP(db, vt, maHM);
    if (thanhTien > 1e15) throw new HttpError(400, where + 'Thành tiền quá lớn');
    return Object.assign({}, hd, {
      maHM, loaiCP, maVT: vt, dienGiai, soLuong, donGia, thanhTien,
      ghiChu: str(b.ghiChu, 1000)
    });
  }

  function newCost(line, phieuId, nguon, now) {
    return Object.assign({ id: store.newId(), seq: store.nextSeq('costs'), phieuId }, line, { nguon: nguon || 'phieu nhap', createdAt: now, updatedAt: now });
  }

  function cleanSlip(body) {
    const head = body.header === undefined ? body : body.header;
    if (head === null || typeof head !== 'object' || Array.isArray(head)) throw new HttpError(400, 'Đầu phiếu phải là một đối tượng');
    const hd = cleanHeader(head);
    const defaultHM = str(head.maHM, 300);
    const lines = (Array.isArray(body.lines) ? body.lines : []).map((l, i) => ({ l, i }))
      .filter(({ l }) => l && (str(l.maVT) || str(l.dienGiai) || str(l.soLuong) || str(l.donGia) || str(l.thanhTien)));
    if (!lines.length) throw new HttpError(400, 'Phiếu chưa có dòng hàng nào');
    if (lines.length > 500) throw new HttpError(400, 'Một phiếu tối đa 500 dòng');
    const out = lines.map(({ l, i }) => cleanLine(l, hd, defaultHM, 'Dòng ' + (Number(l._row) || i + 1) + ': '));
    // Phiếu Nháp: mọi dòng của phiếu cùng trạng thái
    if (head.trangThai === 'nhap' || body.trangThai === 'nhap') out.forEach((l) => { l.trangThai = 'nhap'; });
    return out;
  }

  /* ---------------- danh mục ---------------- */

  function cleanGroup(b) {
    const x = { ma: str(b.ma, 60), ten: str(b.ten, 200), ghiChu: str(b.ghiChu, 500) };
    if (!x.ma) throw new HttpError(400, 'Cần nhập mã nhóm');
    if (!x.ten) throw new HttpError(400, 'Cần nhập tên nhóm');
    return x;
  }
  function cleanItem(b, self) {
    const x = { ma: str(b.ma, 60), ten: str(b.ten, 200), maNhom: requireCode(store.db.costGroups, b.maNhom, 'Nhóm chi phí', true), ghiChu: str(b.ghiChu, 500) };
    if (!x.ma) throw new HttpError(400, 'Cần nhập mã hạng mục');
    if (!x.ten) throw new HttpError(400, 'Cần nhập tên hạng mục');
    const dupName = store.db.costItems.find((i) => !i.gopVao && KT.normalizeText(i.ten).trim() === KT.normalizeText(x.ten).trim() && KT.keyOf(i.ma) !== KT.keyOf(x.ma) && i !== self);
    if (dupName) throw new HttpError(400, 'Tên hạng mục "' + x.ten + '" đã có (mã ' + dupName.ma + ')');
    return x;
  }
  function cleanMaterial(b) {
    const x = {
      ma: str(b.ma, 60), ten: str(b.ten, 300), dvt: str(b.dvt, 40),
      maHM: str(b.maHM, 300) ? KT.findCostItem(store.db, str(b.maHM, 300)) ? KT.findCostItem(store.db, str(b.maHM, 300)).ma : null : '',
      loaiCP: KT.normLoaiCP(str(b.loaiCP, 60)), ghiChu: str(b.ghiChu, 500)
    };
    if (x.maHM === null) throw new HttpError(400, 'Hạng mục "' + str(b.maHM) + '" chưa có trong danh mục');
    if (!x.ma) throw new HttpError(400, 'Cần nhập mã vật tư');
    if (!x.ten) throw new HttpError(400, 'Cần nhập tên vật tư');
    return x;
  }
  function cleanHouse(b) {
    const x = {
      ma: str(b.ma, 60), ten: str(b.ten, 200), maCT: requireCode(store.db.projects, b.maCT, 'Mã công trình', true),
      dienTich: b.dienTich === '' || b.dienTich == null ? '' : qty(b.dienTich, 'Diện tích'),
      chuNha: str(b.chuNha, 200), chung: !!b.chung, ghiChu: str(b.ghiChu, 500)
    };
    if (!x.ma) throw new HttpError(400, 'Cần nhập mã nhà');
    if (!x.ten) throw new HttpError(400, 'Cần nhập tên nhà');
    return x;
  }

  // Mã được dùng ở đâu: [list, field] để đổi mã hàng loạt và chặn xóa khi đang dùng
  const REFS = {
    costGroups: [['costItems', 'maNhom']],
    costItems: [['costs', 'maHM'], ['materials', 'maHM']],
    materials: [['costs', 'maVT']],
    houses: [['costs', 'maNha']],
    projects: [['costs', 'maCT'], ['houses', 'maCT'], ['extPayments', 'maDuAn']],
    suppliers: [['costs', 'maNCC'], ['extPayments', 'maNCC']]
  };
  const CATALOGS = {
    'cost-groups': { list: 'costGroups', clean: cleanGroup, label: 'Mã nhóm' },
    'cost-items': { list: 'costItems', clean: cleanItem, label: 'Mã hạng mục' },
    materials: { list: 'materials', clean: cleanMaterial, label: 'Mã vật tư' },
    houses: { list: 'houses', clean: cleanHouse, label: 'Mã nhà' }
  };
  const USE_LABEL = { costs: 'dòng chi phí', costItems: 'hạng mục', materials: 'vật tư', houses: 'nhà', extPayments: 'khoản trả NCC ngoài quỹ' };
  const USE_TITLE = { costGroups: 'Nhóm chi phí', costItems: 'Hạng mục', materials: 'Vật tư', houses: 'Nhà' };

  // Đổi mã: cập nhật mọi nơi đang dùng mã cũ. Trả về số chỗ đã đổi.
  function cascadeRename(listName, oldMa, newMa, now) {
    let n = 0;
    if (KT.keyOf(oldMa) === KT.keyOf(newMa) && oldMa === newMa) return 0;
    (REFS[listName] || []).forEach(([ref, field]) => {
      store.db[ref].forEach((x) => {
        if (KT.keyOf(x[field]) === KT.keyOf(oldMa)) {
          x[field] = newMa;
          if (ref === 'costs') x.updatedAt = now;
          n++;
        }
      });
    });
    return n;
  }

  // Các chỗ đang dùng mã
  function usages(listName, ma) {
    const out = [];
    (REFS[listName] || []).forEach(([ref, field]) => {
      const n = store.db[ref].filter((x) => KT.keyOf(x[field]) === KT.keyOf(ma)).length;
      if (n) out.push(n + ' ' + USE_LABEL[ref]);
    });
    return out;
  }

  /* ---------------- xử lý ---------------- */

  async function handle(req, res, url) {
    const p = url.pathname;
    const m = req.method;
    const seg = p.split('/').filter(Boolean);
    const db = store.db;
    const now = new Date().toISOString();

    /* ----- Danh mục chi phí ----- */
    const cat = own(CATALOGS, seg[1]) ? CATALOGS[seg[1]] : null;
    if (cat) {
      const list = db[cat.list];
      if (m === 'POST' && seg.length === 2) {
        const x = cat.clean(await readJson(req));
        if (findCode(list, x.ma)) throw new HttpError(400, cat.label + ' "' + x.ma + '" đã tồn tại');
        assertNotMerged(list, x.ma, cat.label);
        const rec = Object.assign({ id: store.newId() }, x);
        list.push(rec);
        trace.log(req, 'them', cat.list, rec, null, rec);
        store.save();
        ok(res, { id: rec.id, ma: rec.ma });
        return true;
      }
      if (seg.length === 3 && (m === 'PUT' || m === 'DELETE')) {
        const rec = byId(list, seg[2]);
        assertActive(rec, cat.label);
        if (m === 'PUT') {
          const x = cat.clean(await readJson(req), rec);
          const dup = findCode(list, x.ma);
          if (dup && dup !== rec) throw new HttpError(400, cat.label + ' "' + x.ma + '" đã tồn tại');
          if (KT.keyOf(x.ma) !== KT.keyOf(rec.ma)) assertNotMerged(list, x.ma, cat.label);
          const before = trace.clone(rec);
          const renamed = cascadeRename(cat.list, rec.ma, x.ma, now);
          if (renamed >= 0 && LOAI[cat.list] && h.renameTargets && rec.ma !== x.ma) h.renameTargets(LOAI[cat.list], rec.ma, x.ma);
          Object.assign(rec, x);
          trace.log(req, 'sua', cat.list, rec, before, rec, renamed ? { note: 'Đổi mã ' + before.ma + ' → ' + rec.ma + ', cập nhật ' + renamed + ' chỗ đang dùng' } : null);
          store.save();
          ok(res, { id: rec.id, ma: rec.ma, renamed });
          return true;
        }
        if (m === 'DELETE') {
          const used = usages(cat.list, rec.ma);
          if (used.length) throw new HttpError(400, 'Không thể xóa: ' + cat.label + ' "' + rec.ma + '" đang được dùng trong ' + used.join(', ') + '.');
          db[cat.list] = list.filter((i) => i !== rec);
          trace.toTrash(req, cat.list, [rec], USE_TITLE[cat.list] + ' ' + trace.describe(cat.list, rec));
          store.save();
          ok(res);
          return true;
        }
      }
    }

    /* ----- Phiếu nhập chi phí (nhiều dòng) ----- */
    if (seg[1] === 'cost-slips') {
      if (m === 'POST' && seg.length === 2) {
        const lines = cleanSlip(await readJson(req));
        trace.assertOpen([lines[0].ngay], 'thêm phiếu');
        const phieuId = store.newId();
        const recs = lines.map((l) => newCost(l, phieuId, 'phieu nhap', now));
        recs.forEach((r) => db.costs.push(r));
        trace.log(req, 'them', 'slips', phieuId, null, recs, { label: trace.describeSlip(recs), note: KT.isDraft(recs[0]) ? 'Lưu nháp (chưa ghi sổ)' : undefined });
        store.save();
        ok(res, { phieuId, count: lines.length, total: lines.reduce((t, l) => t + l.thanhTien, 0) });
        return true;
      }
      if (m === 'POST' && seg.length === 4 && seg[3] === 'post') {
        const phieuId = Number(seg[2]);
        const old = db.costs.filter((c) => c.phieuId === phieuId);
        if (!old.length) throw new HttpError(404, 'Không tìm thấy phiếu (có thể đã bị xóa)');
        const before = trace.clone(old);
        const drafts = old.filter((c) => KT.isDraft(c));
        trace.assertOpen(drafts.map((c) => c.ngay), 'ghi sổ');
        drafts.forEach((c) => { delete c.trangThai; c.updatedAt = now; });
        if (drafts.length) trace.log(req, 'ghi-so', 'slips', phieuId, before, old, { label: trace.describeSlip(old) });
        store.save();
        ok(res, { phieuId, posted: drafts.length });
        return true;
      }
      if (seg.length === 3 && (m === 'PUT' || m === 'DELETE')) {
        const phieuId = Number(seg[2]);
        const old = db.costs.filter((c) => c.phieuId === phieuId);
        if (!old.length) throw new HttpError(404, 'Không tìm thấy phiếu (có thể đã bị xóa)');
        if (m === 'PUT') {
          const lines = cleanSlip(await readJson(req));
          trace.assertOpen(old.map((c) => c.ngay).concat([lines[0].ngay]), 'sửa phiếu');
          const createdAt = old[0].createdAt || now;
          const nguon = old[0].nguon || 'phieu nhap';
          // giữ thứ tự nhập cũ của phiếu
          const seqs = old.map((c) => c.seq).sort((a, b) => a - b);
          db.costs = db.costs.filter((c) => c.phieuId !== phieuId);
          // các dòng được tạo lại (id mới): chứng từ gắn ở dòng cũ chuyển lên gắn với cả phiếu để không bị mồ côi
          const oldIds = new Set(old.map((c) => c.id));
          (db.attachments || []).forEach((a) => { if (a.owner === 'costs' && oldIds.has(a.ownerId)) { a.owner = 'slips'; a.ownerId = phieuId; } });
          const recs = lines.map((l, i) => {
            const rec = newCost(l, phieuId, nguon, now);
            rec.createdAt = createdAt;
            if (old[0].nguoiTao !== undefined) rec.nguoiTao = old[0].nguoiTao; // dòng tạo lại vẫn là của người lập phiếu
            if (i < seqs.length) rec.seq = seqs[i];
            db.costs.push(rec);
            return rec;
          });
          trace.log(req, KT.isDraft(old[0]) && !KT.isDraft(recs[0]) ? 'ghi-so' : 'sua', 'slips', phieuId, old, recs, { label: trace.describeSlip(recs) });
          store.save();
          ok(res, { phieuId, count: lines.length, total: lines.reduce((t, l) => t + l.thanhTien, 0) });
          return true;
        }
        if (m === 'DELETE') {
          trace.assertOpen(old.map((c) => c.ngay), 'xóa phiếu');
          db.costs = db.costs.filter((c) => c.phieuId !== phieuId);
          trace.toTrash(req, 'costs', old, trace.describeSlip(old), { group: 'slip', phieuId });
          store.save();
          ok(res, { deleted: old.length });
          return true;
        }
      }
    }

    /* ----- Dòng chi phí đơn lẻ ----- */
    if (seg[1] === 'costs') {
      if (m === 'POST' && seg.length === 2) {
        const b = await readJson(req);
        const line = cleanLine(b, cleanHeader(b), '', '');
        trace.assertOpen([line.ngay], 'thêm dòng');
        let phieuId = Number(b.phieuId) || 0;
        if (!phieuId || !db.costs.some((c) => c.phieuId === phieuId)) phieuId = store.newId();
        const rec = newCost(line, phieuId, b.nguon === 'nhan ban' ? 'nhan ban' : 'nhap tay', now);
        db.costs.push(rec);
        trace.log(req, 'them', 'costs', rec, null, rec);
        store.save();
        ok(res, { id: rec.id });
        return true;
      }
      if (m === 'POST' && seg[2] === 'delete' && seg.length === 3) {
        const ids = idList((await readJson(req)).ids);
        const gone = db.costs.filter((c) => ids.has(c.id));
        trace.assertOpen(gone.map((c) => c.ngay), 'xóa');
        db.costs = db.costs.filter((c) => !ids.has(c.id));
        if (gone.length) trace.toTrash(req, 'costs', gone, gone.length === 1 ? 'Dòng chi phí ' + trace.describe('costs', gone[0]) : gone.length + ' dòng chi phí');
        store.save();
        ok(res, { deleted: gone.length });
        return true;
      }
      if (seg.length === 3 && (m === 'PUT' || m === 'DELETE')) {
        const rec = byId(db.costs, seg[2]);
        if (m === 'PUT') {
          const b = await readJson(req);
          const line = cleanLine(b, cleanHeader(b), '', '');
          trace.assertOpen([rec.ngay, line.ngay], 'sửa');
          const before = trace.clone(rec);
          Object.assign(rec, line, { updatedAt: now });
          // Đầu phiếu khác các dòng còn lại của phiếu -> tách thành phiếu riêng
          const same = (a, c) => ['ngay', 'maCT', 'maNha', 'maNCC', 'soPhieu'].every((k) => KT.keyOf(a[k]) === KT.keyOf(c[k]));
          const siblings = db.costs.filter((c) => c !== rec && c.phieuId === rec.phieuId);
          if (siblings.length && !same(rec, siblings[0])) rec.phieuId = store.newId();
          trace.log(req, 'sua', 'costs', rec, before, rec);
          store.save();
          ok(res, { id: rec.id, phieuId: rec.phieuId });
          return true;
        }
        if (m === 'DELETE') {
          trace.assertOpen([rec.ngay], 'xóa');
          db.costs = db.costs.filter((c) => c !== rec);
          trace.toTrash(req, 'costs', [rec], 'Dòng chi phí ' + trace.describe('costs', rec));
          store.save();
          ok(res);
          return true;
        }
      }
    }

    /* ----- Xóa dữ liệu chi phí ----- */
    if (p === '/api/reset-costs' && m === 'POST') {
      const b = await readJson(req);
      if (b.confirm !== 'XOA') throw new HttpError(400, 'Cần xác nhận bằng chữ XOA');
      const cur = store.db;
      const keep = !!b.keepCatalogs;
      trace.assertOpen(cur.costs.map((c) => c.ngay), 'xóa toàn bộ chi phí');
      trace.log(req, 'xoa-toan-bo', 'costs', '', null, null, { label: 'Xóa toàn bộ dữ liệu chi phí công trình' + (keep ? ' (giữ danh mục vật tư, nhà)' : ''),
        note: 'Xóa ' + cur.costs.length + ' dòng chi phí. Có bản sao lưu ngay trước khi xóa (truoc-xoa-chi-phi).' });
      store.replaceAll(Object.assign({}, cur, {
        costs: [],
        materials: keep ? cur.materials : [],
        houses: keep ? cur.houses : [],
        costItems: cur.costItems,
        costGroups: cur.costGroups
      }), 'truoc-xoa-chi-phi');
      ok(res);
      return true;
    }

    return false;
  }

  // Hạng mục mới (dùng khi tách mã hạng mục kèm tạo hạng mục đích): kiểm tra như form thêm hạng mục, chưa ghi vào danh mục
  function makeItem(b) {
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new HttpError(400, 'Thông tin hạng mục mới không hợp lệ');
    const x = cleanItem(b);
    if (findCode(store.db.costItems, x.ma)) throw new HttpError(400, 'Mã hạng mục "' + x.ma + '" đã tồn tại');
    assertNotMerged(store.db.costItems, x.ma, 'Mã hạng mục');
    return x;
  }

  return { handle, cascadeRename, usages, cleanLine, cleanHeader, makeItem };
};
