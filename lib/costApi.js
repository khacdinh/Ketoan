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
  const { store, HttpError, str, money, readJson, ok, findCode, byId } = h;

  /* ---------------- kiểm tra dữ liệu ---------------- */

  function qty(v, label) {
    const n = KT.parseQty(v);
    if (isNaN(n)) throw new HttpError(400, label + ' không hợp lệ');
    if (n < 0) throw new HttpError(400, label + ' không được âm');
    if (n > 1e12) throw new HttpError(400, label + ' quá lớn');
    return n;
  }

  function price(v, label) {
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
    const maVT = str(b.maVT, 60);
    const dienGiai = str(b.dienGiai, 1000);
    if (!maVT && !dienGiai) throw new HttpError(400, where + 'cần Mã VT hoặc Diễn giải');
    let vt = '';
    if (maVT) {
      const m = findCode(db.materials, maVT);
      if (!m) throw new HttpError(400, where + 'mã vật tư "' + maVT + '" chưa có trong danh mục');
      vt = m.ma;
    }
    if (b.soLuong === '' || b.soLuong == null) throw new HttpError(400, where + 'thiếu Số lượng');
    if (b.donGia === '' || b.donGia == null) throw new HttpError(400, where + 'thiếu Đơn giá');
    const soLuong = qty(b.soLuong, where + 'Số lượng');
    if (!soLuong) throw new HttpError(400, where + 'Số lượng phải lớn hơn 0');
    const donGia = price(b.donGia, where + 'Đơn giá');
    const maHM = resolveItem(str(b.maHM, 300) || defaultHM, where);
    const loaiCP = KT.normLoaiCP(b.loaiCP) || KT.defaultLoaiCP(db, vt, maHM);
    const thanhTien = KT.costAmount(soLuong, donGia);
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
    const hd = cleanHeader(body.header || body);
    const defaultHM = str((body.header || body).maHM, 300);
    const lines = (Array.isArray(body.lines) ? body.lines : []).map((l, i) => ({ l, i }))
      .filter(({ l }) => l && (str(l.maVT) || str(l.dienGiai) || str(l.soLuong) || str(l.donGia)));
    if (!lines.length) throw new HttpError(400, 'Phiếu chưa có dòng hàng nào');
    if (lines.length > 500) throw new HttpError(400, 'Một phiếu tối đa 500 dòng');
    return lines.map(({ l, i }) => cleanLine(l, hd, defaultHM, 'Dòng ' + (Number(l._row) || i + 1) + ': '));
  }

  /* ---------------- danh mục ---------------- */

  function cleanGroup(b) {
    const x = { ma: str(b.ma, 60), ten: str(b.ten, 200), ghiChu: str(b.ghiChu, 500) };
    if (!x.ma) throw new HttpError(400, 'Cần nhập mã nhóm');
    if (!x.ten) throw new HttpError(400, 'Cần nhập tên nhóm');
    return x;
  }
  function cleanItem(b) {
    const x = { ma: str(b.ma, 60), ten: str(b.ten, 200), maNhom: requireCode(store.db.costGroups, b.maNhom, 'Nhóm chi phí', true), ghiChu: str(b.ghiChu, 500) };
    if (!x.ma) throw new HttpError(400, 'Cần nhập mã hạng mục');
    if (!x.ten) throw new HttpError(400, 'Cần nhập tên hạng mục');
    const dupName = store.db.costItems.find((i) => KT.normalizeText(i.ten).trim() === KT.normalizeText(x.ten).trim() && KT.keyOf(i.ma) !== KT.keyOf(x.ma));
    if (dupName) throw new HttpError(400, 'Tên hạng mục "' + x.ten + '" đã có (mã ' + dupName.ma + ')');
    return x;
  }
  function cleanMaterial(b) {
    const x = {
      ma: str(b.ma, 60), ten: str(b.ten, 300), dvt: str(b.dvt, 40),
      maHM: b.maHM ? KT.findCostItem(store.db, b.maHM) ? KT.findCostItem(store.db, b.maHM).ma : null : '',
      loaiCP: KT.normLoaiCP(b.loaiCP), ghiChu: str(b.ghiChu, 500)
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
    projects: [['costs', 'maCT'], ['houses', 'maCT']],
    suppliers: [['costs', 'maNCC']]
  };
  const CATALOGS = {
    'cost-groups': { list: 'costGroups', clean: cleanGroup, label: 'Mã nhóm' },
    'cost-items': { list: 'costItems', clean: cleanItem, label: 'Mã hạng mục' },
    materials: { list: 'materials', clean: cleanMaterial, label: 'Mã vật tư' },
    houses: { list: 'houses', clean: cleanHouse, label: 'Mã nhà' }
  };
  const USE_LABEL = { costs: 'dòng chi phí', costItems: 'hạng mục', materials: 'vật tư', houses: 'nhà' };

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
    const cat = CATALOGS[seg[1]];
    if (cat) {
      const list = db[cat.list];
      if (m === 'POST' && seg.length === 2) {
        const x = cat.clean(await readJson(req));
        if (findCode(list, x.ma)) throw new HttpError(400, cat.label + ' "' + x.ma + '" đã tồn tại');
        const rec = Object.assign({ id: store.newId() }, x);
        list.push(rec);
        store.save();
        ok(res, { id: rec.id, ma: rec.ma });
        return true;
      }
      if (seg.length === 3) {
        const rec = byId(list, seg[2]);
        if (m === 'PUT') {
          const x = cat.clean(await readJson(req));
          const dup = findCode(list, x.ma);
          if (dup && dup !== rec) throw new HttpError(400, cat.label + ' "' + x.ma + '" đã tồn tại');
          const renamed = cascadeRename(cat.list, rec.ma, x.ma, now);
          Object.assign(rec, x);
          store.save();
          ok(res, { id: rec.id, ma: rec.ma, renamed });
          return true;
        }
        if (m === 'DELETE') {
          const used = usages(cat.list, rec.ma);
          if (used.length) throw new HttpError(400, 'Không thể xóa: ' + cat.label + ' "' + rec.ma + '" đang được dùng trong ' + used.join(', ') + '.');
          db[cat.list] = list.filter((i) => i !== rec);
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
        const phieuId = store.newId();
        lines.forEach((l) => db.costs.push(newCost(l, phieuId, 'phieu nhap', now)));
        store.save();
        ok(res, { phieuId, count: lines.length, total: lines.reduce((t, l) => t + l.thanhTien, 0) });
        return true;
      }
      if (seg.length === 3) {
        const phieuId = Number(seg[2]);
        const old = db.costs.filter((c) => c.phieuId === phieuId);
        if (!old.length) throw new HttpError(404, 'Không tìm thấy phiếu (có thể đã bị xóa)');
        if (m === 'PUT') {
          const lines = cleanSlip(await readJson(req));
          const createdAt = old[0].createdAt || now;
          const nguon = old[0].nguon || 'phieu nhap';
          // giữ thứ tự nhập cũ của phiếu
          const seqs = old.map((c) => c.seq).sort((a, b) => a - b);
          db.costs = db.costs.filter((c) => c.phieuId !== phieuId);
          lines.forEach((l, i) => {
            const rec = newCost(l, phieuId, nguon, now);
            rec.createdAt = createdAt;
            if (i < seqs.length) rec.seq = seqs[i];
            db.costs.push(rec);
          });
          store.save();
          ok(res, { phieuId, count: lines.length, total: lines.reduce((t, l) => t + l.thanhTien, 0) });
          return true;
        }
        if (m === 'DELETE') {
          db.costs = db.costs.filter((c) => c.phieuId !== phieuId);
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
        let phieuId = Number(b.phieuId) || 0;
        if (!phieuId || !db.costs.some((c) => c.phieuId === phieuId)) phieuId = store.newId();
        const rec = newCost(line, phieuId, b.nguon === 'nhan ban' ? 'nhan ban' : 'nhap tay', now);
        db.costs.push(rec);
        store.save();
        ok(res, { id: rec.id });
        return true;
      }
      if (m === 'POST' && seg[2] === 'delete') {
        const ids = new Set(((await readJson(req)).ids || []).map(Number));
        const before = db.costs.length;
        db.costs = db.costs.filter((c) => !ids.has(c.id));
        store.save();
        ok(res, { deleted: before - db.costs.length });
        return true;
      }
      if (seg.length === 3) {
        const rec = byId(db.costs, seg[2]);
        if (m === 'PUT') {
          const b = await readJson(req);
          const line = cleanLine(b, cleanHeader(b), '', '');
          Object.assign(rec, line, { updatedAt: now });
          // Đầu phiếu khác các dòng còn lại của phiếu -> tách thành phiếu riêng
          const same = (a, c) => ['ngay', 'maCT', 'maNha', 'maNCC', 'soPhieu'].every((k) => KT.keyOf(a[k]) === KT.keyOf(c[k]));
          const siblings = db.costs.filter((c) => c !== rec && c.phieuId === rec.phieuId);
          if (siblings.length && !same(rec, siblings[0])) rec.phieuId = store.newId();
          store.save();
          ok(res, { id: rec.id, phieuId: rec.phieuId });
          return true;
        }
        if (m === 'DELETE') {
          db.costs = db.costs.filter((c) => c !== rec);
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

  return { handle, cascadeRename, usages, cleanLine, cleanHeader };
};
