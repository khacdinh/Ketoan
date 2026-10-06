'use strict';
/*
 * Gộp mã (NCC, vật tư, hạng mục, nhà / khu, công trình) và tách mã hạng mục — xem BAO_CAO_GOP_MA.md.
 *
 * Gộp = đưa mọi chỗ đang dùng mã NGUỒN sang mã ĐÍCH trong MỘT lần lưu (store.save: một giao dịch SQLite, ghi hết hoặc không ghi
 * gì), kể cả bản ghi đang nằm trong Thùng rác (khôi phục sau này không bị mồ côi). Mã nguồn không bị xóa: bản ghi danh mục được
 * đánh dấu gopVao = mã đích (ẩn khỏi ô chọn, danh sách, báo cáo, file xuất), và sinh bí danh mã nguồn → mã đích để nhập tay /
 * nhập Excel gặp mã cũ thì tự đổi. Mỗi lần gộp lưu một bản ghi trong mergeLog (id từng bản ghi đã đổi + giá trị cũ, thuộc tính
 * danh mục trước / sau, bí danh đã sinh) để HOÀN TÁC đúng nguyên trạng, theo thứ tự ngược thời gian.
 *
 * Số tiền không bao giờ bị sửa: chỉ trường MÃ của bản ghi đổi → mọi tổng toàn cục giữ nguyên, tổng của mã đích = tổng đích cũ
 * + tổng các mã nguồn (kiểm thử tests/m-gop-ma.test.js).
 *
 * API: POST /api/merge/preview, POST /api/merge, GET /api/merge/log, POST /api/merge/:id/undo,
 *      POST /api/merge/split/preview, POST /api/merge/split (tách mã hạng mục), GET /api/merge/suggest, POST/DELETE /api/merge/suggest/ignore
 */
const KT = require('../public/js/shared.js');

// Mọi bảng / cột đang chứa mã của từng loại (đọc từ lược đồ lib/db.js; trường mã của bản ghi trong thùng rác cũng là các cột này)
const LOAI = {
  ncc: {
    list: 'suppliers', ten: 'nhà cung cấp', Ten: 'Nhà cung cấp',
    refs: [['entries', 'maNCC'], ['costs', 'maNCC'], ['extPayments', 'maNCC'], ['soDuDauKy', 'maNCC']],
    attrs: [['ten', 'Tên'], ['loai', 'Loại đối tượng'], ['sdt', 'Điện thoại'], ['diaChi', 'Địa chỉ'], ['ghiChu', 'Ghi chú']]
  },
  vt: {
    list: 'materials', ten: 'vật tư', Ten: 'Vật tư',
    refs: [['costs', 'maVT'], ['entries', 'maVT']],
    attrs: [['ten', 'Tên vật tư'], ['dvt', 'Đơn vị tính'], ['maHM', 'Hạng mục hay dùng'], ['loaiCP', 'Loại CP mặc định'], ['ghiChu', 'Ghi chú']]
  },
  hm: {
    list: 'costItems', ten: 'hạng mục', Ten: 'Hạng mục',
    refs: [['costs', 'maHM'], ['materials', 'maHM']],
    attrs: [['ten', 'Tên hạng mục'], ['maNhom', 'Nhóm chi phí'], ['ghiChu', 'Ghi chú']]
  },
  nha: {
    list: 'houses', ten: 'nhà / khu', Ten: 'Nhà / khu',
    refs: [['costs', 'maNha']],
    attrs: [['ten', 'Tên nhà / khu'], ['dienTich', 'Diện tích'], ['chuNha', 'Chủ nhà'], ['chung', 'Dùng chung'], ['ghiChu', 'Ghi chú']]
  },
  da: {
    list: 'projects', ten: 'công trình', Ten: 'Công trình',
    refs: [['entries', 'maDuAn'], ['costs', 'maCT'], ['houses', 'maCT'], ['extPayments', 'maDuAn'], ['soDuDauKy', 'maDuAn']],
    attrs: [['ten', 'Tên'], ['nganSach', 'Ngân sách'], ['trangThai', 'Trạng thái'], ['ngayKhoiCong', 'Ngày khởi công'], ['diaChi', 'Địa chỉ'], ['ghiChu', 'Ghi chú']]
  }
};
const LIST_LABEL = { entries: 'dòng sổ thu chi', costs: 'dòng chi phí', materials: 'vật tư (hạng mục hay dùng)', houses: 'nhà / khu', extPayments: 'khoản trả NCC ngoài quỹ', soDuDauKy: 'số dư đầu kỳ NCC' };
const MAX_NGUON = 50;
const MAX_LOG_IDS = 200000;
const MAX_DONG_TACH = 2000; // tách mã: số dòng tối đa hiện ra để tích chọn từng dòng
// Mã khoản / chung của vật tư: không gộp với vật tư thường nếu không xác nhận
const isKhoan = (ma) => /^XX-/i.test(String(ma || '')) || /^CHUNG$/i.test(String(ma || '').trim());
const nv = (v) => (v == null ? '' : typeof v === 'string' ? KT.normalizeText(v).replace(/\s+/g, ' ').trim() : typeof v === 'boolean' ? (v ? '1' : '') : String(v));
const isEmpty = (v) => v == null || v === '' || v === 0 || v === false;

module.exports = function createMergeApi(h) {
  const { store, HttpError, str, readJson, ok, sendJson, trace } = h;
  let busy = false; // điểm móc: chặn hai lần gộp chồng nhau (cùng tiến trình); khi bật mạng nội bộ cần thêm khóa theo phiên bản dữ liệu

  /* ---------------- tra cứu ---------------- */

  // Bản ghi danh mục theo mã: ưu tiên trùng đúng từng chữ (hai mã chỉ khác hoa / thường là hai bản ghi khác nhau)
  function findRec(list, code, activeOnly) {
    const l = activeOnly ? list.filter((x) => !x.gopVao) : list;
    return l.find((x) => x.ma === code) || l.find((x) => KT.keyOf(x.ma) === KT.keyOf(code)) || null;
  }

  // Hàm so khớp giá trị mã của một nguồn: không phân biệt hoa thường; nếu nguồn và đích chỉ khác hoa / thường thì mọi cách
  // viết khác đúng mã đích đều là của nguồn
  function matcherOf(src, dich) {
    const sk = KT.keyOf(src);
    const same = sk === KT.keyOf(dich);
    return (v) => {
      if (v == null || v === '') return false;
      if (KT.keyOf(v) !== sk) return false;
      return same ? String(v).trim() !== dich : true;
    };
  }

  // Các chỗ đang dùng mã (kể cả trong thùng rác). scope(list, rec) giới hạn thêm (nhà: chỉ dòng của đúng công trình)
  function collectRefs(db, cfg, match, scope) {
    const out = [];
    cfg.refs.forEach(([list, field]) => {
      (db[list] || []).forEach((r) => { if (match(r[field]) && (!scope || scope(list, r))) out.push({ list, rec: r, field }); });
      (db.trash || []).forEach((t) => {
        if (t.kind !== list) return;
        t.records.forEach((r) => { if (r && match(r[field]) && (!scope || scope(list, r))) out.push({ list, rec: r, field, trash: t }); });
      });
    });
    return out;
  }

  function sumRefs(refs) {
    const counts = {};
    const tien = { thu: 0, chi: 0, chiPhi: 0, traNgoai: 0 };
    let trash = 0;
    refs.forEach((x) => {
      counts[x.list] = (counts[x.list] || 0) + 1;
      if (x.trash) { trash++; return; }
      if (x.list === 'entries') { tien.thu += x.rec.thu || 0; tien.chi += x.rec.chi || 0; }
      if (x.list === 'costs' && !KT.isDraft(x.rec)) tien.chiPhi += x.rec.thanhTien || 0;
      if (x.list === 'extPayments') tien.traNgoai += x.rec.soTien || 0;
    });
    return { counts, tien, trash };
  }

  const dateRange = (refs) => {
    const ds = refs.filter((x) => !x.trash && (x.list === 'entries' || x.list === 'costs') && x.rec.ngay).map((x) => x.rec.ngay).sort();
    return ds.length ? [ds[0], ds[ds.length - 1]] : null;
  };

  function lockedRefs(db, refs) {
    if (!db.locks || !db.locks.length) return [];
    return refs.filter((x) => !x.trash && (x.list === 'entries' || x.list === 'costs' || x.list === 'extPayments' || x.list === 'soDuDauKy') && KT.isLockedDate(db, x.rec.ngay))
      .map((x) => ({ list: x.list, id: x.rec.id, ngay: x.rec.ngay, label: trace.describe(x.list, x.rec) }));
  }

  /* ---------------- phân tích (dùng chung cho xem trước và gộp) ---------------- */

  function analyze(db, b) {
    if (!b || typeof b !== 'object') throw new HttpError(400, 'Dữ liệu gộp mã không hợp lệ');
    const loai = String(b.loai || '');
    const cfg = Object.prototype.hasOwnProperty.call(LOAI, loai) ? LOAI[loai] : null;
    if (!cfg) throw new HttpError(400, 'Loại mã không hợp lệ (ncc, vt, hm, nha, da)');
    const list = db[cfg.list];
    const dichMa = str(b.dich, 60);
    if (!dichMa) throw new HttpError(400, 'Chọn mã ĐÍCH (mã được giữ lại)');
    const anyDich = findRec(list, dichMa, false);
    const dich = findRec(list, dichMa, true);
    if (!dich) {
      if (anyDich && anyDich.gopVao) throw new HttpError(400, 'Mã đích "' + anyDich.ma + '" đang ở trạng thái "Đã gộp vào ' + anyDich.gopVao + '": chọn mã đang dùng làm mã đích.');
      throw new HttpError(400, cfg.Ten + ' "' + dichMa + '" (mã đích) chưa có trong danh mục.');
    }
    if (!Array.isArray(b.nguon) || !b.nguon.length) throw new HttpError(400, 'Chọn ít nhất một mã NGUỒN (mã bị gộp)');
    if (b.nguon.length > MAX_NGUON) throw new HttpError(400, 'Mỗi lần gộp tối đa ' + MAX_NGUON + ' mã nguồn');
    const seen = new Set();
    const nguon = [];
    b.nguon.forEach((x) => {
      const code = str(x, 60);
      if (!code || seen.has(code)) return;
      seen.add(code);
      if (code === dich.ma) throw new HttpError(400, 'Không gộp một mã vào chính nó ("' + code + '").');
      // mã nguồn: trùng đúng chữ trước; chỉ khác hoa / thường với mã đích mà không có bản ghi riêng → vẫn là mã đích
      let rec = list.find((r) => r.ma === code) || null;
      if (!rec && KT.keyOf(code) !== KT.keyOf(dich.ma)) rec = list.find((r) => KT.keyOf(r.ma) === KT.keyOf(code)) || null;
      if (rec === dich) throw new HttpError(400, 'Không gộp một mã vào chính nó ("' + code + '").');
      if (rec && rec.gopVao) throw new HttpError(400, cfg.Ten + ' "' + rec.ma + '" đã gộp vào "' + rec.gopVao + '" trước đó (xem Lịch sử gộp mã).');
      nguon.push({ ma: rec ? rec.ma : code, rec });
    });
    if (!nguon.length) throw new HttpError(400, 'Chọn ít nhất một mã NGUỒN (mã bị gộp)');

    // nhà / khu: chỉ gộp trong cùng một công trình
    const chan = [];
    const canhBao = [];
    let scope = null;
    if (loai === 'nha') {
      nguon.forEach((n) => {
        if (n.rec && KT.keyOf(n.rec.maCT) !== KT.keyOf(dich.maCT)) {
          chan.push({ ma: 'khac-cong-trinh', text: 'Nhà "' + n.ma + '" thuộc công trình ' + (n.rec.maCT || '(trống)') + ', nhà đích "' + dich.ma + '" thuộc ' + (dich.maCT || '(trống)') + ': chỉ gộp nhà trong cùng một công trình.' });
        }
      });
      scope = (l, r) => l !== 'costs' || KT.keyOf(r.maCT) === KT.keyOf(dich.maCT);
    }
    nguon.forEach((n) => {
      n.match = matcherOf(n.ma, dich.ma);
      n.refs = collectRefs(db, cfg, n.match, scope);
      if (!n.rec && !n.refs.length) {
        if (KT.keyOf(n.ma) === KT.keyOf(dich.ma)) throw new HttpError(400, 'Không gộp một mã vào chính nó ("' + n.ma + '" chính là "' + dich.ma + '").');
        throw new HttpError(400, cfg.Ten + ' "' + n.ma + '" không có trong danh mục và không có dòng nào dùng.');
      }
      Object.assign(n, sumRefs(n.refs));
    });
    const dichRefs = collectRefs(db, cfg, (v) => v != null && v !== '' && KT.keyOf(v) === KT.keyOf(dich.ma) && String(v).trim() === dich.ma, scope);
    const dichSum = sumRefs(dichRefs);

    // thuộc tính: mặc định giữ của đích; đích trống thì lấy của nguồn đầu tiên có giá trị; ngày khởi công lấy sớm nhất
    const giu = b.giuLai && typeof b.giuLai === 'object' ? b.giuLai : {};
    const attrs = cfg.attrs.map(([f, label]) => {
      const vals = nguon.filter((n) => n.rec).map((n) => ({ ma: n.ma, v: n.rec[f] }));
      const khac = vals.some((x) => nv(x.v) !== nv(dich[f]) && !(isEmpty(x.v) && isEmpty(dich[f])));
      let def = 'dich';
      if (isEmpty(dich[f])) { const s = vals.find((x) => !isEmpty(x.v)); if (s) def = s.ma; }
      if (f === 'ngayKhoiCong') {
        const all = [{ ma: 'dich', v: dich[f] }].concat(vals).filter((x) => KT.isISODate(x.v)).sort((a, c) => (a.v < c.v ? -1 : a.v > c.v ? 1 : 0));
        if (all.length) def = all[0].ma;
      }
      let chon = Object.prototype.hasOwnProperty.call(giu, f) ? String(giu[f]) : def;
      const choices = ['dich'].concat(vals.map((x) => x.ma)).concat(f === 'nganSach' ? ['cong'] : []);
      if (!choices.includes(chon)) throw new HttpError(400, 'Lựa chọn giữ lại cho "' + label + '" không hợp lệ');
      return { f, label, dich: dich[f] === undefined ? '' : dich[f], nguon: vals, khac, def, chon };
    });
    const attrOf = (f) => attrs.find((a) => a.f === f);

    // cảnh báo / chặn theo loại mã
    const xn = b.xacNhan && typeof b.xacNhan === 'object' ? b.xacNhan : {};
    if (loai === 'ncc') {
      if (attrOf('loai').khac) canhBao.push('Loại NCC khác nhau (' + [dich.loai || '(trống)'].concat(attrOf('loai').nguon.map((x) => x.v || '(trống)')).join(' / ') + '): chọn loại giữ lại.');
      if (attrOf('ten').khac) canhBao.push('Tên NCC khác nhau: kiểm tra đúng là cùng một nhà cung cấp, chọn tên giữ lại.');
    }
    if (loai === 'vt') {
      if (attrOf('dvt').khac) {
        chan.push({ ma: 'dvt', can: 'dvt', text: 'ĐVT khác nhau (' + [dich.dvt || '(trống)'].concat(attrOf('dvt').nguon.map((x) => x.v || '(trống)')).join(' / ') +
          '): số lượng giữ nguyên nên Số lượng × Đơn giá của các dòng có thể sai nghĩa. Chỉ gộp khi xác nhận “ĐVT khác nhau, số lượng giữ nguyên”.' });
      }
      const k = [dich.ma].concat(nguon.map((n) => n.ma)).map(isKhoan);
      if (k.some(Boolean) && !k.every(Boolean)) chan.push({ ma: 'khoan', can: 'khoan', text: 'Đang gộp mã khoản / chung (XX-…, CHUNG) với vật tư thường: chỉ gộp khi xác nhận rõ.' });
      if (attrOf('ten').khac) canhBao.push('Tên vật tư khác cách viết: chọn tên giữ lại.');
    }
    if (loai === 'hm') {
      if (attrOf('ten').khac) chan.push({ ma: 'ten', can: 'ten', text: 'Hai hạng mục khác tên (' + [dich.ten].concat(attrOf('ten').nguon.map((x) => x.v)).join(' / ') +
        '). Chỉ gộp khi CÙNG NGHĨA; nếu một mã đang mang hai nghĩa thì dùng “Tách mã hạng mục” thay vì gộp.' });
      if (attrOf('maNhom').khac) canhBao.push('Khác nhóm chi phí: mọi dòng của hạng mục nguồn sẽ xếp vào nhóm ' + (giuNhom(attrOf('maNhom'), dich) || '(trống)') + ' trong báo cáo (tổng tiền không đổi).');
    }
    if (loai === 'da') {
      const dc = attrOf('diaChi');
      if (dc.nguon.some((x) => !isEmpty(x.v) && !isEmpty(dich.diaChi) && nv(x.v) !== nv(dich.diaChi))) canhBao.push('Hai công trình khác địa chỉ: kiểm tra đúng là cùng một nơi.');
      const rd = dateRange(dichRefs);
      nguon.forEach((n) => {
        const rn = dateRange(n.refs);
        if (rd && rn && (rn[1] < rd[0] || rn[0] > rd[1])) canhBao.push('Thời gian phát sinh của ' + n.ma + ' (' + KT.fmtDate(rn[0]) + ' – ' + KT.fmtDate(rn[1]) + ') không giao với ' + dich.ma + ' (' + KT.fmtDate(rd[0]) + ' – ' + KT.fmtDate(rd[1]) + ').');
      });
      const ns = attrOf('nganSach');
      if (!isEmpty(dich.nganSach) && ns.nguon.some((x) => !isEmpty(x.v)) && !Object.prototype.hasOwnProperty.call(giu, 'nganSach')) {
        chan.push({ ma: 'ngan-sach', text: 'Cả hai công trình đều có ngân sách: phần mềm không tự cộng — chọn giữ ngân sách của mã nào, hoặc chọn “Cộng”.' });
      }
    }
    const nhaPlan = loai === 'da' ? planHouses(db, dich, nguon, b.nhaMap, chan) : null;
    const xacNhanThieu = chan.filter((c) => c.can && !xn[c.can]);
    const chanCung = chan.filter((c) => !c.can);
    const seenRef = new Set();
    const refsAll = [].concat(...nguon.map((n) => n.refs)).filter((x) => { const k = x.rec; if (seenRef.has(k)) return false; seenRef.add(k); return true; });
    const khoa = lockedRefs(db, refsAll);
    return { loai, cfg, dich, nguon, dichSum, attrs, chan, canhBao, xacNhanThieu, chanCung, khoa, refsAll, nhaPlan, xn };
  }

  function giuNhom(a, dich) {
    if (a.chon === 'dich') return dich.maNhom;
    const s = a.nguon.find((x) => x.ma === a.chon);
    return s ? s.v : dich.maNhom;
  }

  // Gộp công trình: nhà của nguồn chuyển sang đích. Nhà trùng (cùng mã, hoặc cùng tên / cùng là nhà dùng chung) ở đích thì gợi ý gộp
  // vào nhà đó; người dùng chọn qua nhaMap { mãNhàNguồn: mãNhàĐích | '' (giữ riêng) }.
  function planHouses(db, dich, nguon, nhaMap, chan) {
    const map = nhaMap && typeof nhaMap === 'object' ? nhaMap : null;
    const keys = new Set(nguon.map((n) => KT.keyOf(n.ma)));
    const src = db.houses.filter((x) => !x.gopVao && keys.has(KT.keyOf(x.maCT)));
    const dst = db.houses.filter((x) => !x.gopVao && KT.keyOf(x.maCT) === KT.keyOf(dich.ma));
    return src.map((hs) => {
      const sameCode = dst.find((x) => KT.keyOf(x.ma) === KT.keyOf(hs.ma) && x !== hs);
      const sug = sameCode || dst.find((x) => nv(x.ten) === nv(hs.ten)) || (hs.chung ? dst.find((x) => x.chung) : null) || null;
      let vao = map && Object.prototype.hasOwnProperty.call(map, hs.ma) ? String(map[hs.ma] || '') : (sameCode ? sameCode.ma : '');
      if (vao) {
        const t = dst.find((x) => x.ma === vao);
        if (!t) throw new HttpError(400, 'Nhà đích "' + vao + '" để gộp nhà ' + hs.ma + ' không thuộc công trình ' + dich.ma);
      }
      if (sameCode && !vao) chan.push({ ma: 'trung-ma-nha', text: 'Nhà "' + hs.ma + '" trùng mã với nhà ở công trình đích: chọn gộp vào nhà đó.' });
      const n = db.costs.filter((c) => KT.keyOf(c.maNha) === KT.keyOf(hs.ma) && keys.has(KT.keyOf(c.maCT))).length;
      return { ma: hs.ma, ten: hs.ten, chung: !!hs.chung, soDong: n, goiY: sug ? sug.ma : '', vao };
    });
  }

  function previewOf(p) {
    const tien = (x) => ({ thu: x.tien.thu, chi: x.tien.chi, chiPhi: x.tien.chiPhi, traNgoai: x.tien.traNgoai });
    return {
      loai: p.loai, tenLoai: p.cfg.ten,
      dich: { ma: p.dich.ma, ten: p.dich.ten || '', counts: p.dichSum.counts, tien: tien(p.dichSum), trash: p.dichSum.trash },
      nguon: p.nguon.map((n) => ({ ma: n.ma, ten: n.rec ? n.rec.ten || '' : '(không có trong danh mục)', coDanhMuc: !!n.rec, counts: n.counts, tien: tien(n), trash: n.trash })),
      tong: (() => { const s = sumRefs(p.refsAll); return { soBanGhi: p.refsAll.length, counts: s.counts, tien: tien(s), trash: s.trash }; })(),
      thuocTinh: p.attrs.map((a) => ({ f: a.f, label: a.label, dich: a.dich, nguon: a.nguon, khac: a.khac, chon: a.chon, coCong: a.f === 'nganSach' })),
      canhBao: p.canhBao, chan: p.chan, khoa: p.khoa.slice(0, 50), soKhoa: p.khoa.length,
      nha: p.nhaPlan, nhan: LIST_LABEL, phienBan: store.db.updatedAt || ''
    };
  }

  /* ---------------- gộp ---------------- */

  const pick = (keys, o) => { const out = {}; keys.forEach((k) => { if (o && o[k] !== undefined) out[k] = o[k]; }); return out; };

  function applyMerge(req, p) {
    const db = store.db;
    const now = new Date().toISOString();
    const by = trace.who(req);
    const cfg = p.cfg;
    const dich = p.dich;
    const changes = [];
    // 1. đổi mã ở mọi chỗ dùng (chỉ trường mã; không đụng số tiền, ngày, updatedAt)
    const nhaChuyen = [];
    p.refsAll.forEach((x) => {
      changes.push(x.trash ? [x.list, x.rec.id, x.field, x.rec[x.field], dich.ma, x.trash.id] : [x.list, x.rec.id, x.field, x.rec[x.field], dich.ma]);
      if (x.list === 'houses' && !x.trash) nhaChuyen.push(x.rec.ma);
      x.rec[x.field] = dich.ma;
    });
    if (changes.length > MAX_LOG_IDS) throw new HttpError(400, 'Quá nhiều bản ghi trong một lần gộp (' + changes.length + ')');
    // 2. thuộc tính mã đích theo lựa chọn
    const attrKeys = ['ma'].concat(cfg.attrs.map((a) => a[0]));
    const dichTruoc = trace.clone(dich);
    p.attrs.forEach((a) => {
      if (a.chon === 'dich') return;
      if (a.chon === 'cong') { dich[a.f] = (Number(dich[a.f]) || 0) + a.nguon.reduce((t, x) => t + (Number(x.v) || 0), 0); return; }
      const s = a.nguon.find((x) => x.ma === a.chon);
      if (s) { if (s.v === undefined) delete dich[a.f]; else dich[a.f] = s.v; }
    });
    const dichSau = trace.clone(dich);
    // 3. mã nguồn: "Đã gộp vào <mã đích>" (không xóa), bí danh mã cũ → mã đích
    const nguonTruoc = [];
    const aliases = [];
    p.nguon.forEach((n) => {
      if (n.rec) { nguonTruoc.push(trace.clone(n.rec)); n.rec.gopVao = dich.ma; }
      const a = { id: store.newId(), loai: p.loai, ma: n.ma, dich: dich.ma, mergeId: 0, at: now };
      db.aliases.push(a);
      aliases.push(a);
    });
    // 4. cảnh báo đã bỏ qua có mã nguồn trong khóa (vt:…, thieu:…) → khóa theo mã đích
    const iw = rewriteWarnings(db, p.nguon.map((n) => n.ma), dich.ma);
    // 5. gộp công trình: nhà trùng của nguồn gộp vào nhà ở đích (cùng lần gộp)
    const nhaGop = [];
    if (p.nhaPlan) {
      p.nhaPlan.filter((x) => x.vao).forEach((x) => {
        const hs = db.houses.find((r) => r.ma === x.ma && !r.gopVao);
        const hd = db.houses.find((r) => r.ma === x.vao && !r.gopVao);
        if (!hs || !hd || hs === hd) return;
        const m = matcherOf(hs.ma, hd.ma);
        const refs = collectRefs(db, LOAI.nha, m, (l, r) => l !== 'costs' || KT.keyOf(r.maCT) === KT.keyOf(dich.ma));
        refs.forEach((r) => { changes.push(r.trash ? ['costs', r.rec.id, 'maNha', r.rec.maNha, hd.ma, r.trash.id] : ['costs', r.rec.id, 'maNha', r.rec.maNha, hd.ma]); r.rec.maNha = hd.ma; });
        nhaGop.push({ nguon: trace.clone(hs), dich: hd.ma, soDong: refs.length });
        hs.gopVao = hd.ma;
        const a = { id: store.newId(), loai: 'nha', ma: hs.ma, dich: hd.ma, mergeId: 0, at: now };
        db.aliases.push(a);
        aliases.push(a);
      });
    }
    const counts = {};
    changes.forEach((c) => { counts[c[0]] = (counts[c[0]] || 0) + 1; });
    const nhan = 'Gộp ' + cfg.ten + ' ' + p.nguon.map((n) => n.ma).join(', ') + ' → ' + dich.ma;
    const log = {
      id: store.newId(), at: now, by, loai: p.loai, nguon: p.nguon.map((n) => n.ma), dich: dich.ma, trangThai: 'hieu-luc', nhan,
      chiTiet: {
        changes, counts, dichId: dich.id, dichTruoc: pick(attrKeys, dichTruoc), dichSau: pick(attrKeys, dichSau), nguonTruoc,
        aliasIds: aliases.map((a) => a.id), iw, nhaGop, nhaChuyen,
        xacNhan: p.xacNhanThieu.length ? [] : p.chan.filter((c) => c.can).map((c) => c.text), canhBao: p.canhBao,
        tien: sumRefs(p.refsAll).tien, giuLai: p.attrs.filter((a) => a.chon !== 'dich').map((a) => [a.f, a.chon])
      }
    };
    aliases.forEach((a) => { a.mergeId = log.id; });
    db.mergeLog.push(log);
    trace.log(req, 'gop-ma', cfg.list, dich, dichTruoc, dichSau, {
      label: nhan, note: 'Chuyển ' + changes.length + ' bản ghi (' + Object.keys(counts).map((k) => counts[k] + ' ' + (LIST_LABEL[k] || k)).join(', ') + ')' +
        (log.chiTiet.xacNhan.length ? '. Đã xác nhận: ' + log.chiTiet.xacNhan.join(' | ') : '') + '. Lần gộp số ' + log.id
    });
    return log;
  }

  // Khóa cảnh báo đã bỏ qua có chứa mã (dạng keyOf) ở các loại cảnh báo theo mã: đổi sang mã đích. Trả [[khóa cũ, khóa mới, giá trị bị thay]].
  function rewriteWarnings(db, srcs, dich) {
    const out = [];
    const iw = db.ignoredWarnings || {};
    const ks = new Set(srcs.map(KT.keyOf));
    const dk = KT.keyOf(dich);
    Object.keys(iw).forEach((key) => {
      if (!/^(vt|thieu):/.test(key)) return;
      const parts = key.split(/([:|])/);
      let hit = false;
      const nk = parts.map((t) => { if (t !== ':' && t !== '|' && ks.has(t)) { hit = true; return dk; } return t; }).join('');
      if (!hit || nk === key) return;
      out.push([key, nk, Object.prototype.hasOwnProperty.call(iw, nk) ? iw[nk] : null]);
      iw[nk] = iw[key];
      delete iw[key];
    });
    return out;
  }

  /* ---------------- hoàn tác ---------------- */

  // Mã mà một lần gộp / tách "đụng tới": lần sau đụng cùng mã thì lần trước không hoàn tác được nữa (phải hoàn tác lần sau trước)
  function touched(g) {
    const t = new Set();
    const loai = g.loai === 'tach-hm' ? 'hm' : g.loai;
    (g.nguon || []).concat([g.dich]).forEach((m) => t.add(loai + ':' + KT.keyOf(m)));
    const ct = g.chiTiet || {};
    (ct.nhaGop || []).forEach((x) => { t.add('nha:' + KT.keyOf(x.nguon.ma)); t.add('nha:' + KT.keyOf(x.dich)); });
    (ct.nhaChuyen || []).forEach((m) => t.add('nha:' + KT.keyOf(m))); // gộp công trình: nhà đã chuyển sang công trình đích
    return t;
  }

  // Bản ghi của một thay đổi: đang dùng, hoặc đã vào thùng rác sau khi gộp (tìm theo id)
  function findChanged(db, c) {
    const list = c[0];
    const id = c[1];
    let rec = (db[list] || []).find((r) => r.id === id);
    if (!rec) {
      for (const t of db.trash || []) {
        if (t.kind !== list) continue;
        const r = t.records.find((x) => x && x.id === id);
        if (r) { rec = r; break; }
      }
    }
    return rec || null;
  }

  function undoCheck(db, g) {
    const why = [];
    if (g.trangThai !== 'hieu-luc') return ['Lần này đã được hoàn tác trước đó.'];
    const mine = touched(g);
    const later = db.mergeLog.filter((x) => x.id > g.id && x.trangThai === 'hieu-luc' && Array.from(touched(x)).some((k) => mine.has(k)));
    if (later.length) {
      why.push('Sau lần này còn ' + later.length + ' lần gộp / tách khác đụng tới cùng mã (gần nhất: số ' + later[later.length - 1].id + ' — ' + later[later.length - 1].nhan +
        '). Hãy hoàn tác lần gần nhất trước.');
      return why;
    }
    const ct = g.chiTiet || {};
    const conflicts = [];
    (ct.changes || []).forEach((c) => {
      const rec = findChanged(db, c);
      if (!rec) { conflicts.push('bản ghi ' + (LIST_LABEL[c[0]] || c[0]) + ' id ' + c[1] + ' đã bị xóa vĩnh viễn'); return; }
      if (rec[c[2]] !== c[4]) conflicts.push((LIST_LABEL[c[0]] || c[0]) + ' id ' + c[1] + ': ' + c[2] + ' đang là "' + (rec[c[2]] || '') + '" (đã bị sửa sau khi gộp)');
    });
    if (g.loai !== 'tach-hm') {
      const cfg = LOAI[g.loai];
      const d = db[cfg.list].find((r) => r.id === ct.dichId);
      const keys = ['ma'].concat(cfg.attrs.map((a) => a[0]));
      if (!d) conflicts.push('mã đích ' + g.dich + ' không còn trong danh mục');
      else if (JSON.stringify(pick(keys, d)) !== JSON.stringify(pick(keys, ct.dichSau || {}))) conflicts.push('thông tin của mã đích ' + g.dich + ' đã bị sửa sau khi gộp');
      (ct.nguonTruoc || []).forEach((s) => {
        const r = db[cfg.list].find((x) => x.id === s.id);
        if (!r) conflicts.push('mã nguồn ' + s.ma + ' không còn trong danh mục');
        else if (r.gopVao !== g.dich) conflicts.push('mã nguồn ' + s.ma + ' không còn ở trạng thái "Đã gộp vào ' + g.dich + '"');
      });
      (ct.nhaGop || []).forEach((x) => {
        const r = db.houses.find((h0) => h0.id === x.nguon.id);
        if (!r || r.gopVao !== x.dich) conflicts.push('nhà ' + x.nguon.ma + ' không còn ở trạng thái "Đã gộp vào ' + x.dich + '"');
      });
    }
    if (conflicts.length) why.push('Dữ liệu đã bị sửa sau lần gộp này nên không hoàn tác tự động được (để tránh làm sai): ' + conflicts.slice(0, 8).join('; ') + (conflicts.length > 8 ? '; … (' + conflicts.length + ' chỗ)' : '') + '.');
    return why;
  }

  function applyUndo(req, g) {
    const db = store.db;
    const ct = g.chiTiet || {};
    // làm ngược đúng thứ tự lúc gộp: bước cuối (gộp nhà trùng khi gộp công trình; bản chụp nhà lấy SAU khi nhà đã chuyển công trình)
    // trả trước, rồi mới trả từng trường mã về giá trị cũ (theo thứ tự ngược)
    (ct.nhaGop || []).forEach((x) => {
      const r = db.houses.find((h0) => h0.id === x.nguon.id);
      Object.keys(r).forEach((k) => { if (!Object.prototype.hasOwnProperty.call(x.nguon, k)) delete r[k]; });
      Object.assign(r, x.nguon);
    });
    for (let i = (ct.changes || []).length - 1; i >= 0; i--) {
      const c = ct.changes[i];
      const rec = findChanged(db, c);
      rec[c[2]] = c[3];
    }
    if (g.loai !== 'tach-hm') {
      const cfg = LOAI[g.loai];
      const d = db[cfg.list].find((r) => r.id === ct.dichId);
      Object.keys(ct.dichSau || {}).forEach((k) => { if (!Object.prototype.hasOwnProperty.call(ct.dichTruoc, k)) delete d[k]; });
      Object.assign(d, ct.dichTruoc);
      (ct.nguonTruoc || []).forEach((s) => {
        const r = db[cfg.list].find((x) => x.id === s.id);
        Object.keys(r).forEach((k) => { if (!Object.prototype.hasOwnProperty.call(s, k)) delete r[k]; });
        Object.assign(r, s);
      });
      const ids = new Set(ct.aliasIds || []);
      db.aliases = db.aliases.filter((a) => !ids.has(a.id) && a.mergeId !== g.id);
      const iw = db.ignoredWarnings || {};
      for (let i = (ct.iw || []).length - 1; i >= 0; i--) {
        const [oldK, newK, prev] = ct.iw[i];
        if (Object.prototype.hasOwnProperty.call(iw, newK)) { iw[oldK] = iw[newK]; if (prev) iw[newK] = prev; else delete iw[newK]; }
      }
    }
    // tách kèm tạo hạng mục mới: hạng mục đó không còn dòng / vật tư nào dùng thì gỡ khỏi danh mục (vào thùng rác)
    if (g.loai === 'tach-hm' && ct.taoHM) {
      const r = db.costItems.find((x) => x.id === ct.taoHM);
      const dung = (rec) => rec && KT.keyOf(rec.maHM) === KT.keyOf(r.ma);
      const conDung = r && (db.costs.some(dung) || db.materials.some(dung) || (db.trash || []).some((t) => (t.kind === 'costs' || t.kind === 'materials') && t.records.some(dung)));
      if (r && !conDung) {
        db.costItems = db.costItems.filter((x) => x !== r);
        trace.toTrash(req, 'costItems', [r], 'Hạng mục ' + r.ma + ' (tạo khi tách mã, gỡ khi hoàn tác)');
        g.hoanTacGoHM = r.ma;
      }
    }
    g.trangThai = 'da-hoan-tac';
    g.hoanTacLuc = new Date().toISOString();
    g.hoanTacBoi = trace.who(req);
    trace.log(req, 'hoan-tac-gop', g.loai === 'tach-hm' ? 'costs' : LOAI[g.loai].list, '', null, null, {
      label: 'Hoàn tác: ' + g.nhan, note: 'Trả ' + (ct.changes || []).length + ' bản ghi về mã cũ (lần số ' + g.id + ')'
    });
  }

  /* ---------------- tách mã hạng mục ---------------- */

  // Chọn một nhóm dòng chi phí đang dùng hạng mục A (lọc theo công trình / nhà / kỳ / NCC / vật tư, hoặc danh sách id) rồi đổi sang hạng mục B
  function analyzeSplit(db, b) {
    if (!b || typeof b !== 'object') throw new HttpError(400, 'Dữ liệu tách mã không hợp lệ');
    const src = KT.findCostItem(db, str(b.maHM, 300));
    if (!src) throw new HttpError(400, 'Hạng mục cần tách "' + str(b.maHM, 300) + '" chưa có trong danh mục');
    // đích: hạng mục đang có, hoặc tạo mới ngay trong lần tách này (taoMoi: { ma, ten, maNhom, ghiChu })
    let dst;
    let taoMoi = null;
    if (b.taoMoi != null) {
      if (!h.makeItem) throw new HttpError(400, 'Không tạo được hạng mục mới ở đây');
      taoMoi = h.makeItem(b.taoMoi);
      dst = taoMoi;
    } else {
      dst = KT.findCostItem(db, str(b.dich, 300));
      if (!dst) throw new HttpError(400, 'Hạng mục đích "' + str(b.dich, 300) + '" chưa có trong danh mục');
    }
    if (dst === src) throw new HttpError(400, 'Hạng mục đích phải khác hạng mục đang tách');
    const f = b.loc && typeof b.loc === 'object' ? b.loc : {};
    const from = KT.isISODate(f.from) ? f.from : '';
    const to = KT.isISODate(f.to) ? f.to : '';
    const ct = str(f.ct, 60);
    const nha = str(f.nha, 60);
    const ncc = str(f.ncc, 60);
    const vt = str(f.vt, 60);
    if (Array.isArray(f.ids) && f.ids.length > MAX_LOG_IDS) throw new HttpError(400, 'Danh sách dòng quá dài');
    const ids = Array.isArray(f.ids) ? new Set(f.ids.map(Number).filter(Number.isSafeInteger)) : null;
    if (ids && !ids.size) throw new HttpError(400, 'Chưa chọn dòng nào để đổi hạng mục');
    if (!ct && !nha && !from && !to && !ncc && !vt && !ids) throw new HttpError(400, 'Chọn ít nhất một điều kiện lọc (công trình, nhà, kỳ, NCC, vật tư) để không đổi nhầm cả hạng mục');
    const rows = db.costs.filter((c) => KT.keyOf(c.maHM) === KT.keyOf(src.ma) && (!ct || KT.keyOf(c.maCT) === KT.keyOf(ct)) && (!nha || KT.keyOf(c.maNha) === KT.keyOf(nha)) &&
      (!from || c.ngay >= from) && (!to || c.ngay <= to) && (!ncc || KT.keyOf(c.maNCC) === KT.keyOf(ncc)) && (!vt || KT.keyOf(c.maVT) === KT.keyOf(vt)) && (!ids || ids.has(c.id)));
    const khoa = lockedRefs(db, rows.map((r) => ({ list: 'costs', rec: r })));
    const total = rows.reduce((t, r) => t + (KT.isDraft(r) ? 0 : r.thanhTien || 0), 0);
    return { src, dst, taoMoi, rows, khoa, total, loc: { ct, nha, from, to, ncc, vt, ids: ids ? Array.from(ids) : undefined } };
  }

  function applySplit(req, p) {
    const db = store.db;
    let taoHM = 0;
    if (p.taoMoi) {
      const rec = Object.assign({ id: store.newId() }, p.taoMoi);
      db.costItems.push(rec);
      trace.log(req, 'them', 'costItems', rec, null, rec, { note: 'Tạo khi tách mã hạng mục ' + p.src.ma });
      p.dst = rec;
      taoHM = rec.id;
    }
    const changes = p.rows.map((r) => ['costs', r.id, 'maHM', r.maHM, p.dst.ma]);
    p.rows.forEach((r) => { r.maHM = p.dst.ma; });
    const nhan = 'Tách ' + p.rows.length + ' dòng chi phí từ hạng mục ' + p.src.ma + ' (' + p.src.ten + ') sang ' + p.dst.ma + ' (' + p.dst.ten + ')';
    const log = { id: store.newId(), at: new Date().toISOString(), by: trace.who(req), loai: 'tach-hm', nguon: [p.src.ma], dich: p.dst.ma, trangThai: 'hieu-luc', nhan,
      chiTiet: { changes, counts: { costs: changes.length }, loc: p.loc, tien: { chiPhi: p.total }, taoHM } };
    db.mergeLog.push(log);
    trace.log(req, 'tach-ma', 'costs', '', null, null, { label: nhan, note: 'Tổng ' + KT.fmtMoney(p.total) + ' đ; lọc ' + JSON.stringify(p.loc) + '. Lần số ' + log.id });
    return log;
  }

  /* ---------------- gợi ý mã trùng ---------------- */

  // Tên để so trùng: bỏ dấu, viết thường, bỏ dấu câu ("Bê tông bơm/đùn" = "be tong bom dun")
  const tenKey = (v) => KT.normalizeText(v == null ? '' : String(v)).replace(/[^a-z0-9]+/g, ' ').trim();
  const MAX_GAN = 3000; // so "tên gần giống" từng cặp: chỉ khi danh mục không quá lớn

  function suggestions(db) {
    const out = [];
    const ign = db.ignoredDupes || {};
    const dung = {};
    Object.keys(LOAI).forEach((loai) => { dung[loai] = usageMap(db, loai); });
    const add = (loai, kieu, ds, ly) => {
      const key = loai + ':' + kieu + ':' + ds.map((x) => x.ma).sort().join('|');
      // nhóm mã chỉ khác hoa / thường: đếm theo đúng cách viết; nhóm khác: mọi cách viết của mã
      const n = (x) => (kieu === 'ma' ? dung[loai].exact.get(String(x.ma).trim()) : dung[loai].get(KT.keyOf(x.ma))) || 0;
      out.push({ khoa: key, loai, kieu, ly, ma: ds.map((x) => ({ ma: x.ma, ten: x.ten || '', dvt: x.dvt, maCT: x.maCT, dung: n(x) })), boQua: !!ign[key] });
    };
    Object.keys(LOAI).forEach((loai) => {
      const list = (db[LOAI[loai].list] || []).filter((x) => !x.gopVao && x.ma);
      const codeKey = (x) => String(x.ma).toLowerCase().replace(/\s+/g, '');
      // 1. mã chỉ khác hoa / thường / khoảng trắng
      const byCode = new Map();
      list.forEach((x) => { const k = codeKey(x); (byCode.get(k) || byCode.set(k, []).get(k)).push(x); });
      byCode.forEach((ds) => { if (ds.length > 1) add(loai, 'ma', ds, 'Mã chỉ khác chữ hoa / thường hoặc khoảng trắng'); });
      // 2. trùng tên (bỏ dấu, hoa / thường, dấu câu) giữa các mã khác nhau; vật tư thêm cùng ĐVT; nhà thêm cùng công trình
      const nhom = (x) => (loai === 'vt' ? '|' + tenKey(x.dvt) : '') + (loai === 'nha' ? '|' + KT.keyOf(x.maCT) : '');
      const byName = new Map();
      list.forEach((x) => {
        const n = tenKey(x.ten);
        if (!n) return;
        const k = n + nhom(x);
        (byName.get(k) || byName.set(k, []).get(k)).push(x);
      });
      const daBao = new Set(); // cặp mã đã nằm chung một nhóm gợi ý
      const danhDau = (ds) => ds.forEach((a) => ds.forEach((b) => { if (a !== b) daBao.add(a.ma + '\u0000' + b.ma); }));
      byCode.forEach((ds) => { if (ds.length > 1) danhDau(ds); });
      byName.forEach((ds) => {
        if (ds.length < 2) return;
        const codes = new Set(ds.map(codeKey));
        if (codes.size < 2) return; // đã báo ở nhóm "mã"
        danhDau(ds);
        add(loai, 'ten', ds, loai === 'vt' ? 'Trùng tên vật tư và cùng đơn vị tính' : loai === 'nha' ? 'Trùng tên nhà trong cùng công trình' : 'Trùng tên (không tính dấu, hoa / thường, dấu câu)');
      });
      // 3. tên gần giống: tên ngắn (≥ 2 chữ, ≥ 6 ký tự) nằm trọn trong tên dài, vd "Thiên Hải" / "VLXD Thiên Hải", "10 Phạm Quang Ảnh" /
      // "Công trình 10 Phạm Quang Ảnh". Chỉ cho NCC, hạng mục, công trình: vật tư và nhà thường là biến thể thật ("Cẩm tú mai lớn / nhỏ", "tầng 2 / tầng 3")
      if (loai === 'vt' || loai === 'nha' || list.length > MAX_GAN) return;
      const items = list.map((x) => ({ x, n: tenKey(x.ten), g: nhom(x) })).filter((o) => o.n.length >= 6 && o.n.includes(' '));
      for (let i = 0; i < items.length; i++) {
        for (let j = 0; j < items.length; j++) {
          const a = items[i];
          const b = items[j];
          if (i === j || a.g !== b.g || a.n === b.n || a.n.length > b.n.length || (a.n.length === b.n.length && i > j)) continue;
          if (!(' ' + b.n + ' ').includes(' ' + a.n + ' ')) continue;
          if (daBao.has(a.x.ma + '\u0000' + b.x.ma)) continue;
          danhDau([a.x, b.x]);
          add(loai, 'gan', [a.x, b.x], 'Tên gần giống: “' + a.x.ten + '” nằm trong “' + b.x.ten + '”');
        }
      }
    });
    // 4. nhà / khu không có dòng chi phí nào tham chiếu: gợi ý dọn (người dùng tự xóa, phần mềm không tự xóa)
    const nhaKhongDung = db.houses.filter((x) => !x.gopVao && !dung.nha.get(KT.keyOf(x.ma))).map((x) => ({ ma: x.ma, ten: x.ten || '', maCT: x.maCT || '' }));
    return { nhom: out, nhaKhongDung };
  }

  // Số chỗ đang dùng mỗi mã (bản ghi đang dùng, không tính thùng rác): một lượt qua dữ liệu.
  // Map theo khóa không phân biệt hoa thường; .exact: theo đúng cách viết
  function usageMap(db, loai) {
    const m = new Map();
    m.exact = new Map();
    LOAI[loai].refs.forEach(([list, field]) => {
      (db[list] || []).forEach((r) => {
        const k = KT.keyOf(r[field]);
        if (!k) return;
        m.set(k, (m.get(k) || 0) + 1);
        const e = String(r[field]).trim();
        m.exact.set(e, (m.exact.get(e) || 0) + 1);
      });
    });
    return m;
  }

  /* ---------------- đổi mã đích (sửa mã trong danh mục) ---------------- */

  // Mã đang được dùng làm mã đích bị đổi (Sửa danh mục): bí danh và bản ghi "Đã gộp vào" đi theo mã mới
  function renameTargets(loai, oldMa, newMa) {
    if (!loai || !oldMa || oldMa === newMa) return 0;
    const db = store.db;
    let n = 0;
    db.aliases.forEach((a) => { if (a.loai === loai && a.dich === oldMa) { a.dich = newMa; n++; } });
    const cfg = LOAI[loai];
    if (cfg) db[cfg.list].forEach((r) => { if (r.gopVao === oldMa) { r.gopVao = newMa; n++; } });
    return n;
  }

  /* ---------------- API ---------------- */

  function logSummary(db, g) {
    const why = undoCheck(db, g);
    const ct = g.chiTiet || {};
    return { id: g.id, at: g.at, by: g.by || '', loai: g.loai, nguon: g.nguon, dich: g.dich, trangThai: g.trangThai, nhan: g.nhan,
      soBanGhi: (ct.changes || []).length, counts: ct.counts || {}, tien: ct.tien || {}, xacNhan: ct.xacNhan || [], canhBao: ct.canhBao || [],
      hoanTacLuc: g.hoanTacLuc || '', hoanTacBoi: g.hoanTacBoi || '', coTheHoanTac: !why.length, lyDo: why.join(' ') };
  }

  function checkVersion(b) {
    // xem trước rồi mới gộp: dữ liệu đổi giữa hai bước (thao tác khác, cửa sổ khác) → bắt xem trước lại
    if (b && b.phienBan && store.db.updatedAt && b.phienBan !== store.db.updatedAt) {
      throw new HttpError(409, 'Dữ liệu đã thay đổi kể từ lúc xem trước. Hãy xem trước lại rồi mới gộp.');
    }
  }

  async function handle(req, res, url) {
    const p = url.pathname;
    const m = req.method;
    if (!p.startsWith('/api/merge')) return false;
    const seg = p.split('/').filter(Boolean); // ['api', 'merge', ...]
    const db = store.db;

    if (seg.length === 3 && seg[2] === 'preview' && m === 'POST') {
      const plan = analyze(db, await readJson(req));
      sendJson(res, 200, { ok: true, preview: previewOf(plan) });
      return true;
    }
    if (seg.length === 2 && m === 'POST') {
      const b = await readJson(req);
      if (busy) throw new HttpError(409, 'Đang có một lần gộp mã khác chạy, hãy thử lại sau giây lát.');
      busy = true;
      try {
        checkVersion(b);
        const plan = analyze(db, b);
        if (plan.chanCung.length) throw new HttpError(400, 'Không gộp được: ' + plan.chanCung.map((c) => c.text).join(' '));
        if (plan.xacNhanThieu.length) throw new HttpError(400, 'Cần xác nhận trước khi gộp: ' + plan.xacNhanThieu.map((c) => c.text).join(' '));
        if (plan.khoa.length) {
          throw Object.assign(new HttpError(423, 'Có ' + plan.khoa.length + ' bản ghi thuộc tháng đã khóa sổ nên không gộp được (mở khóa tháng đó trước): ' +
            plan.khoa.slice(0, 5).map((x) => x.label).join('; ') + (plan.khoa.length > 5 ? '; …' : '')), { khoa: plan.khoa.slice(0, 50) });
        }
        const bk = store.backup('truoc-gop-ma');
        const log = applyMerge(req, plan);
        store.save();
        ok(res, { merge: logSummary(store.db, log), backup: bk });
      } finally { busy = false; }
      return true;
    }
    if (seg.length === 3 && seg[2] === 'log' && m === 'GET') {
      const list = db.mergeLog.slice().sort((a, b) => b.id - a.id).map((g) => logSummary(db, g));
      sendJson(res, 200, { ok: true, items: list });
      return true;
    }
    if (seg.length === 4 && seg[3] === 'undo' && m === 'POST') {
      const g = db.mergeLog.find((x) => x.id === Number(seg[2]));
      if (!g) throw new HttpError(404, 'Không tìm thấy lần gộp / tách này');
      const why = undoCheck(db, g);
      if (why.length) throw new HttpError(409, why.join(' '));
      const bk = store.backup('truoc-hoan-tac-gop');
      applyUndo(req, g);
      store.save();
      ok(res, { merge: logSummary(store.db, g), backup: bk });
      return true;
    }
    if (seg[2] === 'split' && m === 'POST' && (seg.length === 3 || (seg.length === 4 && seg[3] === 'preview'))) {
      const b = await readJson(req);
      const plan = analyzeSplit(db, b);
      if (seg[3] === 'preview') {
        const nIdx = KT.indexBy(db.suppliers);
        sendJson(res, 200, { ok: true, preview: { tu: { ma: plan.src.ma, ten: plan.src.ten, maNhom: plan.src.maNhom || '' }, sang: { ma: plan.dst.ma, ten: plan.dst.ten, maNhom: plan.dst.maNhom || '', moi: !!plan.taoMoi },
          soDong: plan.rows.length, tong: plan.total, khoa: plan.khoa.slice(0, 50), soKhoa: plan.khoa.length,
          // danh sách dòng để tích chọn (tối đa MAX_DONG_TACH); nhiều hơn thì chỉ đổi được cả nhóm theo bộ lọc
          dong: plan.rows.length <= MAX_DONG_TACH ? plan.rows.slice().sort((a, c) => (a.ngay < c.ngay ? -1 : a.ngay > c.ngay ? 1 : a.id - c.id)).map((r) => ({
            id: r.id, ngay: r.ngay, maCT: r.maCT || '', maNha: r.maNha || '', maNCC: r.maNCC || '', tenNCC: (nIdx.get(KT.keyOf(r.maNCC)) || {}).ten || '', maVT: r.maVT || '',
            dienGiai: r.dienGiai || '', thanhTien: r.thanhTien || 0, nhap: KT.isDraft(r), khoa: KT.isLockedDate(db, r.ngay) })) : null,
          phienBan: store.db.updatedAt || '' } });
        return true;
      }
      checkVersion(b);
      if (!plan.rows.length) throw new HttpError(400, 'Không có dòng chi phí nào khớp điều kiện lọc');
      if (plan.khoa.length) throw new HttpError(423, 'Có ' + plan.khoa.length + ' dòng thuộc tháng đã khóa sổ: ' + plan.khoa.slice(0, 5).map((x) => x.label).join('; '));
      const bk = store.backup('truoc-gop-ma');
      const log = applySplit(req, plan);
      store.save();
      ok(res, { merge: logSummary(store.db, log), backup: bk });
      return true;
    }
    if (seg[2] === 'suggest') {
      if (seg.length === 3 && m === 'GET') {
        sendJson(res, 200, Object.assign({ ok: true }, suggestions(db)));
        return true;
      }
      if (seg.length === 4 && seg[3] === 'ignore' && (m === 'POST' || m === 'DELETE')) {
        const b = await readJson(req);
        const key = str(b.khoa, 1000);
        if (!/^(ncc|vt|hm|nha|da):(ma|ten|gan):/.test(key)) throw new HttpError(400, 'Khóa gợi ý không hợp lệ');
        if (m === 'POST') db.ignoredDupes[key] = { at: new Date().toISOString(), by: trace.who(req), loai: key.split(':')[0], label: str(b.label, 300) };
        else delete db.ignoredDupes[key];
        store.save();
        ok(res);
        return true;
      }
    }
    throw new HttpError(404, 'Không có chức năng ' + m + ' ' + p);
  }

  return { handle, analyze, renameTargets, suggestions, LOAI };
};

module.exports.LOAI = LOAI;
