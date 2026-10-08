/*
 * Logic tính toán dùng chung cho trình duyệt (window.KT) và máy chủ Node (require).
 * Mọi con số trong báo cáo, phiếu in và file Excel xuất ra đều đi qua các hàm ở đây
 * để đảm bảo ứng dụng và Excel luôn khớp nhau.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KT = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- Số tiền & định dạng ---------------- */

  const CHU_SO = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

  // Đọc nhóm 3 chữ số. `dayDu` = đã có nhóm lớn hơn đứng trước (phải đọc "không trăm", "linh").
  // Quy tắc giống hệt công thức trong sheet Phieu_Chi của file Excel gốc.
  function docBaSo(n, dayDu) {
    const tram = Math.floor(n / 100);
    const chuc = Math.floor((n % 100) / 10);
    const dv = n % 10;
    const out = [];
    if (dayDu || tram > 0) out.push(CHU_SO[tram] + ' trăm');
    if (chuc === 0) {
      if (dv > 0 && (dayDu || tram > 0)) out.push('linh');
    } else if (chuc === 1) out.push('mười');
    else out.push(CHU_SO[chuc] + ' mươi');
    if (dv > 0) {
      if (dv === 1 && chuc >= 2) out.push('mốt');
      else if (dv === 5 && chuc >= 1) out.push('lăm');
      else out.push(CHU_SO[dv]);
    }
    return out.join(' ');
  }

  function docSo(n) {
    n = Math.floor(Math.abs(n));
    if (n === 0) return 'không';
    const ty = Math.floor(n / 1e9);
    const rest = n % 1e9;
    const parts = [];
    let started = false;
    if (ty > 0) { parts.push(docSo(ty) + ' tỷ'); started = true; }
    const groups = [Math.floor(rest / 1e6), Math.floor(rest / 1e3) % 1000, rest % 1000];
    const units = ['triệu', 'nghìn', ''];
    groups.forEach(function (g, i) {
      if (g === 0) return;
      parts.push(docBaSo(g, started) + (units[i] ? ' ' + units[i] : ''));
      started = true;
    });
    return parts.join(' ');
  }

  // "Một trăm nghìn đồng"
  function docTienBangChu(amount) {
    const n = Math.round(Number(amount) || 0);
    if (n === 0) return '';
    const s = (n < 0 ? 'âm ' : '') + docSo(n);
    return s.charAt(0).toUpperCase() + s.slice(1) + ' đồng';
  }

  function fmtMoney(n, emptyIfZero) {
    n = Math.round(Number(n) || 0);
    if (emptyIfZero && n === 0) return '';
    const neg = n < 0;
    const s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + s;
  }

  // Bộ phân tích biểu thức nhỏ cho ô số tiền: hỗ trợ 58000+11000, 1.250.000, 50tr, 1,5tr, 300k, (a+b)*2
  function evalExpr(src) {
    let i = 0;
    function peek() { return src[i]; }
    function number() {
      const m = /^\d+(\.\d+)?/.exec(src.slice(i));
      if (!m) throw new Error('bad');
      i += m[0].length;
      return parseFloat(m[0]);
    }
    function factor() {
      if (peek() === '-') { i++; return -factor(); }
      if (peek() === '+') { i++; return factor(); }
      if (peek() === '(') {
        i++;
        const v = expr();
        if (peek() !== ')') throw new Error('bad');
        i++;
        return v;
      }
      return number();
    }
    function term() {
      let v = factor();
      while (peek() === '*' || peek() === '/') {
        const op = src[i++];
        const r = factor();
        v = op === '*' ? v * r : v / r;
      }
      return v;
    }
    function expr() {
      let v = term();
      while (peek() === '+' || peek() === '-') {
        const op = src[i++];
        const r = term();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    const v = expr();
    if (i !== src.length) throw new Error('bad');
    return v;
  }

  function parseAmount(input) {
    if (input != null && typeof input !== 'string' && typeof input !== 'number') return NaN;
    if (typeof input === 'number') return isFinite(input) ? Math.round(input) : NaN;
    let s = String(input == null ? '' : input).trim().toLowerCase().replace(/\s+/g, '').replace(/đ$/, '');
    if (!s) return 0;
    s = s.replace(/^=/, '');
    // "2tr5", "1tr250k": chữ số dán ngay sau đơn vị — không đoán ý người nhập, tránh ghi sai số tiền
    if (/(tỷ|ty|triệu|trieu|tr|nghìn|nghin|ngàn|ngan|k)\d/.test(s)) return NaN;
    s = s.replace(/(\d+(?:[.,]\d+)?)(tỷ|ty|triệu|trieu|tr|nghìn|nghin|ngàn|ngan|k)/g, function (m, num, suf) {
      const v = parseFloat(num.replace(',', '.'));
      const mul = /^t(ỷ|y)$/.test(suf) ? 1e9 : /^tr/.test(suf) ? 1e6 : 1e3;
      return String(Math.round(v * mul));
    });
    // Bỏ dấu phân cách hàng nghìn (1.234.567 hoặc 1,234,567)
    s = s.replace(/[.,](?=\d{3}(?!\d))/g, '');
    if (!/^[\d+\-*/()]+$/.test(s)) return NaN;
    try {
      const v = evalExpr(s);
      return isFinite(v) ? Math.round(v) : NaN;
    } catch (e) {
      return NaN;
    }
  }

  /* ---------------- Ngày tháng ---------------- */

  function pad(n, w) { return String(n).padStart(w || 2, '0'); }

  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function isISODate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const t = Date.parse(s + 'T00:00:00Z');
    // V8 chấp nhận 30/02, 31/04 (tự nhảy sang tháng sau) nên phải so lại với ngày chuẩn hóa
    return !isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const p = String(iso).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso);
  }

  // "Ngày 05 tháng 09 năm 2026"
  function ngayChu(iso) {
    if (!isISODate(iso)) return 'Ngày ...... tháng ...... năm ..........';
    const p = iso.split('-');
    return 'Ngày ' + p[2] + ' tháng ' + p[1] + ' năm ' + p[0];
  }

  function inRange(ngay, from, to) {
    if (from && ngay < from) return false;
    if (to && ngay > to) return false;
    return true;
  }

  /* ---------------- Tra cứu danh mục ---------------- */

  function keyOf(code) { return String(code || '').trim().toLowerCase(); }

  // Excel VLOOKUP/SUMIF không phân biệt hoa thường nên ở đây cũng vậy.
  // Mã → bản ghi danh mục (bỏ qua mã đã gộp vào mã khác: mọi chỗ dùng đã chuyển sang mã đích)
  function indexBy(list) {
    const m = new Map();
    (list || []).forEach(function (x) { if (x.ma && !x.gopVao && !m.has(keyOf(x.ma))) m.set(keyOf(x.ma), x); });
    return m;
  }

  /* ---------------- Gộp mã: danh mục đang dùng, bí danh ---------------- */

  // Loại mã gộp được → tên danh sách danh mục
  const MERGE_LISTS = { ncc: 'suppliers', vt: 'materials', hm: 'costItems', nha: 'houses', da: 'projects' };
  function isMerged(x) { return !!(x && x.gopVao); }

  // Dữ liệu với danh mục chỉ còn mã đang dùng (ẩn mã "Đã gộp vào …" khỏi ô chọn, danh sách, báo cáo, file xuất).
  // Không có mã nào đã gộp → trả lại đúng đối tượng cũ.
  function activeDb(db) {
    if (!db) return db;
    let out = db;
    Object.keys(MERGE_LISTS).forEach(function (l) {
      const k = MERGE_LISTS[l];
      const list = db[k];
      if (Array.isArray(list) && list.some(isMerged)) {
        if (out === db) out = Object.assign({}, db);
        out[k] = list.filter(function (x) { return !isMerged(x); });
      }
    });
    return out;
  }

  // { loai: Map(khóa mã cũ → mã đích) } từ bảng bí danh
  function aliasIndex(db) {
    const idx = {};
    (db.aliases || []).forEach(function (a) {
      if (!a || !a.loai) return;
      (idx[a.loai] || (idx[a.loai] = new Map())).set(keyOf(a.ma), String(a.dich));
    });
    return idx;
  }

  // Mã gõ vào / trong file Excel → mã đang dùng: trùng đúng một mã đang dùng thì giữ; là mã cũ đã gộp thì đi theo chuỗi bí danh
  // (A→B rồi B→C ⇒ A về C), so khớp không phân biệt hoa thường. Không có bí danh → trả lại nguyên văn (bước sau tra như thường).
  function resolveAlias(db, loai, code, idx) {
    let cur = String(code == null ? '' : code).normalize('NFC').trim();
    if (!cur) return cur;
    const list = db[MERGE_LISTS[loai]] || [];
    const exact = function (c) { return list.some(function (x) { return !x.gopVao && x.ma === c; }); };
    if (exact(cur)) return cur;
    const m = (idx || aliasIndex(db))[loai];
    if (!m) return cur;
    const seen = {};
    for (let i = 0; i < 50; i++) {
      const next = m.get(keyOf(cur));
      if (next === undefined || seen[next]) return cur;
      seen[next] = true;
      cur = next;
      if (exact(cur)) return cur;
    }
    return cur;
  }

  function projectName(db, ma) {
    const p = indexBy(db.projects).get(keyOf(ma));
    return p ? p.ten : '';
  }

  /* ---------------- Sổ thu chi ---------------- */

  function compareEntries(a, b) {
    const da = a.ngay || '9999-99-99';
    const dbb = b.ngay || '9999-99-99';
    if (da < dbb) return -1;
    if (da > dbb) return 1;
    return (a.seq || 0) - (b.seq || 0);
  }

  // Trả về các dòng sổ đã sắp theo ngày, kèm tên công trình/NCC và tồn quỹ lũy kế.
  function buildLedger(db) {
    const pIdx = indexBy(db.projects);
    const sIdx = indexBy(db.suppliers);
    let ton = 0;
    return (db.entries || []).slice().sort(compareEntries).map(function (e, i) {
      ton += (e.thu || 0) - (e.chi || 0);
      const p = pIdx.get(keyOf(e.maDuAn));
      const s = sIdx.get(keyOf(e.maNCC));
      return Object.assign({}, e, {
        stt: i + 1,
        tenDuAn: p ? p.ten : '',
        tenNCC: s ? s.ten : '',
        duAnHopLe: !e.maDuAn || !!p,
        nccHopLe: !e.maNCC || !!s,
        ton: ton
      });
    });
  }

  function normalizeText(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  }

  // Lọc sổ. Trả về { rows, tonDauKy, tongThu, tongChi, tonCuoiKy }
  function filterLedger(ledger, f) {
    f = f || {};
    let tonDauKy = 0;
    let tonCuoiKy = 0;
    ledger.forEach(function (r) {
      if (f.from && r.ngay < f.from) tonDauKy = r.ton;
      if (!f.to || r.ngay <= f.to) tonCuoiKy = r.ton;
    });
    const q = normalizeText(f.q).trim();
    const rows = ledger.filter(function (r) {
      if (!inRange(r.ngay, f.from, f.to)) return false;
      if (f.duAn === '__none__') { if (r.maDuAn) return false; }
      else if (f.duAn && keyOf(r.maDuAn) !== keyOf(f.duAn)) return false;
      if (f.ncc === '__none__') { if (r.maNCC) return false; }
      else if (f.ncc && keyOf(r.maNCC) !== keyOf(f.ncc)) return false;
      if (f.loai === 'thu' && !(r.thu > 0)) return false;
      if (f.loai === 'chi' && !(r.chi > 0)) return false;
      if (q) {
        const hay = normalizeText([r.soPhieu, r.maDuAn, r.tenDuAn, r.maNCC, r.tenNCC, r.maVT, r.noiDung, r.nguoiNhan, r.ghiChu, fmtMoney(r.thu), fmtMoney(r.chi)].join(' '));
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    let tongThu = 0;
    let tongChi = 0;
    rows.forEach(function (r) { tongThu += r.thu || 0; tongChi += r.chi || 0; });
    return { rows: rows, tonDauKy: tonDauKy, tongThu: tongThu, tongChi: tongChi, tonCuoiKy: tonCuoiKy };
  }

  /* ---------------- Báo cáo tổng hợp ---------------- */

  function budgetStatus(nganSach, chi) {
    if (!(nganSach > 0)) return chi > 0 ? 'none' : 'idle';
    if (chi > nganSach) return 'over';
    if (chi >= nganSach * 0.9) return 'near';
    return 'ok';
  }

  const STATUS_TEXT = {
    over: 'Vượt ngân sách',
    near: 'Sắp hết ngân sách',
    ok: 'Trong hạn mức',
    none: 'Chưa có ngân sách',
    idle: 'Chưa phát sinh'
  };

  // Tổng hợp chi phí theo công trình (sheet Tong_Quan).
  function projectSummary(db, f) {
    f = f || {};
    const acc = new Map();
    let chiKhongDuAn = 0;
    let thuKhongDuAn = 0;
    let soDongKhongDuAn = 0;
    (db.entries || []).forEach(function (e) {
      if (!inRange(e.ngay, f.from, f.to)) return;
      const k = keyOf(e.maDuAn);
      if (!k) { chiKhongDuAn += e.chi || 0; thuKhongDuAn += e.thu || 0; soDongKhongDuAn++; return; }
      const a = acc.get(k) || { chi: 0, thu: 0, soDong: 0, ma: String(e.maDuAn).trim() };
      a.chi += e.chi || 0;
      a.thu += e.thu || 0;
      a.soDong++;
      acc.set(k, a);
    });
    const rows = [];
    const seen = new Set();
    (db.projects || []).forEach(function (p) {
      const k = keyOf(p.ma);
      if (seen.has(k)) return;
      seen.add(k);
      const a = acc.get(k) || { chi: 0, thu: 0, soDong: 0 };
      const ns = Number(p.nganSach) || 0;
      rows.push({
        id: p.id, ma: p.ma, ten: p.ten, trangThai: p.trangThai, nganSach: ns,
        chi: a.chi, thu: a.thu, soDong: a.soDong,
        chenhLech: ns - a.chi, tiLe: ns > 0 ? a.chi / ns : 0,
        status: budgetStatus(ns, a.chi), inCatalog: true
      });
    });
    acc.forEach(function (a, k) {
      if (seen.has(k)) return;
      rows.push({
        ma: a.ma, ten: '(Chưa có trong danh mục)', nganSach: 0, chi: a.chi, thu: a.thu, soDong: a.soDong,
        chenhLech: -a.chi, tiLe: 0, status: budgetStatus(0, a.chi), inCatalog: false
      });
    });
    const total = rows.reduce(function (t, r) {
      t.nganSach += r.nganSach; t.chi += r.chi; t.thu += r.thu; t.soDong += r.soDong; return t;
    }, { nganSach: 0, chi: 0, thu: 0, soDong: 0 });
    total.chenhLech = total.nganSach - total.chi;
    return {
      rows: rows,
      total: total,
      khongDuAn: { chi: chiKhongDuAn, thu: thuKhongDuAn, soDong: soDongKhongDuAn },
      soVuot: rows.filter(function (r) { return r.status === 'over'; }).length
    };
  }

  // Tổng hợp theo nhà cung cấp (sheet Tong_Hop_NCC).
  function supplierSummary(db, f) {
    f = f || {};
    const acc = new Map();
    const none = { chi: 0, thu: 0, soDong: 0 };
    (db.entries || []).forEach(function (e) {
      if (!inRange(e.ngay, f.from, f.to)) return;
      const k = keyOf(e.maNCC);
      if (!k) { none.chi += e.chi || 0; none.thu += e.thu || 0; none.soDong++; return; }
      const a = acc.get(k) || { chi: 0, thu: 0, soDong: 0, ma: String(e.maNCC).trim(), last: '' };
      a.chi += e.chi || 0;
      a.thu += e.thu || 0;
      a.soDong++;
      if (e.ngay > a.last) a.last = e.ngay;
      acc.set(k, a);
    });
    const rows = [];
    const seen = new Set();
    (db.suppliers || []).forEach(function (s) {
      const k = keyOf(s.ma);
      if (seen.has(k)) return;
      seen.add(k);
      const a = acc.get(k) || { chi: 0, thu: 0, soDong: 0, last: '' };
      rows.push({ id: s.id, ma: s.ma, ten: s.ten, loai: s.loai, sdt: s.sdt, chi: a.chi, thu: a.thu, soDong: a.soDong, last: a.last, inCatalog: true });
    });
    acc.forEach(function (a, k) {
      if (seen.has(k)) return;
      rows.push({ ma: a.ma, ten: '(Chưa có trong danh mục)', loai: '', chi: a.chi, thu: a.thu, soDong: a.soDong, last: a.last, inCatalog: false });
    });
    const total = rows.reduce(function (t, r) { t.chi += r.chi; t.thu += r.thu; t.soDong += r.soDong; return t; }, { chi: 0, thu: 0, soDong: 0 });
    return { rows: rows, total: total, khongNCC: none };
  }

  /* ---------------- Phiếu thu / chi ---------------- */

  function voucherKey(so) { return String(so || '').trim().toUpperCase(); }

  function voucherType(so) { return /^PT/i.test(String(so || '').trim()) ? 'thu' : 'chi'; }

  // Gom các dòng cùng số phiếu thành 1 phiếu (giống sheet Phieu_Chi).
  function buildVouchers(db, ledger) {
    ledger = ledger || buildLedger(db);
    const sIdx = indexBy(db.suppliers);
    const mIdx = indexBy(db.materials || []);
    const overrides = db.vouchers || {};
    const settings = db.settings || {};
    const map = new Map();
    ledger.forEach(function (r) {
      const k = voucherKey(r.soPhieu);
      if (!k) return;
      let v = map.get(k);
      if (!v) {
        v = { key: k, soPhieu: String(r.soPhieu).trim(), loai: voucherType(r.soPhieu), lines: [], dates: new Set() };
        map.set(k, v);
      }
      v.lines.push(r);
      if (r.ngay) v.dates.add(r.ngay);
    });
    const list = [];
    map.forEach(function (v) {
      const ov = overrides[v.key] || {};
      const first = v.lines[0];
      let soTien = 0;
      v.lines.forEach(function (r) { soTien += v.loai === 'thu' ? (r.thu || 0) : (r.chi || 0); });
      let nguoiNhanTuDong = '';
      let diaChiTuDong = '';
      for (let i = 0; i < v.lines.length; i++) {
        const r = v.lines[i];
        const s = sIdx.get(keyOf(r.maNCC));
        const name = s ? s.ten : String(r.nguoiNhan || '').trim();
        if (!nguoiNhanTuDong && name) nguoiNhanTuDong = name.trim();
        if (!diaChiTuDong && s && s.diaChi) diaChiTuDong = s.diaChi;
      }
      const seenNd = new Set();
      const lyDoParts = [];
      v.lines.forEach(function (r) {
        const t = String(r.noiDung || '').trim();
        if (t && !seenNd.has(t)) { seenNd.add(t); lyDoParts.push(t); }
      });
      const lyDoTuDong = lyDoParts.join('; ');
      // vật tư của các dòng trong phiếu (mục Mã vật tư ở form Ghi thu / chi): "MÃ – Tên", không lặp
      const seenVt = new Set();
      const vatTuParts = [];
      v.lines.forEach(function (r) {
        const k = keyOf(r.maVT);
        if (!k || seenVt.has(k)) return;
        seenVt.add(k);
        const m = mIdx.get(k);
        vatTuParts.push(String(r.maVT).trim() + (m && m.ten ? ' – ' + m.ten : ''));
      });
      list.push({
        key: v.key,
        soPhieu: v.soPhieu,
        loai: v.loai,
        lines: v.lines,
        soDong: v.lines.length,
        ngayGoc: first.ngay,
        ngay: ov.ngay || first.ngay,
        nhieuNgay: v.dates.size > 1,
        soTien: soTien,
        bangChu: docTienBangChu(soTien),
        nguoiNhanTuDong: nguoiNhanTuDong,
        nguoiNhan: (ov.nguoiNhan || '').trim() || nguoiNhanTuDong,
        diaChiTuDong: diaChiTuDong,
        diaChi: (ov.diaChi || '').trim() || diaChiTuDong,
        lyDoTuDong: lyDoTuDong,
        lyDo: (ov.lyDo || '').trim() || lyDoTuDong,
        vatTu: vatTuParts.join('; '),
        hinhThuc: ov.hinhThuc || settings.hinhThucMacDinh || 'Tiền mặt',
        kemTheo: ov.kemTheo || '',
        override: ov,
        duAn: Array.from(new Set(v.lines.map(function (r) { return r.maDuAn; }).filter(Boolean)))
      });
    });
    list.sort(function (a, b) {
      if (a.ngayGoc !== b.ngayGoc) return a.ngayGoc < b.ngayGoc ? 1 : -1;
      return a.key < b.key ? 1 : -1;
    });
    return list;
  }

  /* ---------------- Đánh số chứng từ ----------------
   * Mỗi loại chứng từ: Tiền tố + số thứ tự (đệm 0 cho đủ Độ dài) + Hậu tố. Hậu tố nhận mẫu MM (tháng), YYYY / YY (năm), DD (ngày),
   * NCC (mã nhà cung cấp) theo ngày chứng từ. Có MM thì số chạy lại từ 1 mỗi tháng, chỉ có năm thì mỗi năm, không có thì chạy mãi.
   * Số tiếp theo = số lớn nhất đã dùng trong kỳ + 1 (phiếu thu / chi / UNC tìm trong sổ thu chi, MH trong chi phí công trình),
   * hoặc số người dùng đặt ở trang Đánh số chứng từ nếu lớn hơn (chỉ áp cho kỳ lúc đặt). Biên bản đối chiếu không có số thứ tự. */
  const DANH_SO = {
    thu: { ten: 'Phiếu thu', tienTo: 'PT', doDai: 3, hauTo: '/MM' },
    chi: { ten: 'Phiếu chi', tienTo: 'PC', doDai: 3, hauTo: '/MM' },
    unc: { ten: 'Ủy nhiệm chi', tienTo: 'UNC', doDai: 3, hauTo: '/MM' },
    mh: { ten: 'Mua vật tư, dịch vụ', tienTo: 'MH', doDai: 4, hauTo: '/MM' },
    dc: { ten: 'Biên bản đối chiếu', tienTo: 'ĐC-', doDai: 0, hauTo: 'MM/YYYY-NCC' }
  };
  const LOAI_SO = ['thu', 'chi', 'unc', 'mh', 'dc'];

  // cấu hình đang dùng của một loại (mặc định + phần người dùng đã sửa trong settings.danhSo)
  function danhSoCfg(db, loai) {
    const goc = DANH_SO[loai] || DANH_SO.chi;
    const r = Object.assign({ loai: DANH_SO[loai] ? loai : 'chi' }, goc);
    const ds = db && db.settings && db.settings.danhSo && db.settings.danhSo[r.loai];
    if (ds && typeof ds === 'object') {
      if (typeof ds.tienTo === 'string') r.tienTo = ds.tienTo;
      if (Number.isInteger(ds.doDai) && ds.doDai >= 0 && ds.doDai <= 10) r.doDai = ds.doDai;
      if (typeof ds.hauTo === 'string') r.hauTo = ds.hauTo;
      if (Number.isInteger(ds.soTiep) && ds.soTiep > 0) { r.soTiep = ds.soTiep; r.ky = String(ds.ky || ''); }
    }
    if (r.loai === 'dc') r.doDai = 0;
    return r;
  }

  // điền mẫu trong hậu tố theo ngày chứng từ (và mã NCC)
  function hauToTheoNgay(hauTo, ngay, ncc) {
    const iso = isISODate(ngay) ? ngay : todayISO();
    return String(hauTo || '').replace(/YYYY|YY|MM|DD|NCC/g, function (t) {
      if (t === 'YYYY') return iso.slice(0, 4);
      if (t === 'YY') return iso.slice(2, 4);
      if (t === 'MM') return iso.slice(5, 7);
      if (t === 'DD') return iso.slice(8, 10);
      return String(ncc || '').trim().toUpperCase();
    });
  }

  // kỳ đánh lại số của một ngày: tháng (hậu tố có MM), năm (chỉ có YYYY / YY), '' = không bao giờ đánh lại
  function kyDanhSo(cfg, ngay) {
    const iso = isISODate(ngay) ? ngay : todayISO();
    const h = String(cfg.hauTo || '');
    if (/MM/.test(h)) return iso.slice(0, 7);
    if (/YY/.test(h)) return iso.slice(0, 4);
    return '';
  }

  function soChungTu(cfg, so, ngay, ncc) {
    return String(cfg.tienTo || '') + (cfg.doDai > 0 ? pad(so, cfg.doDai) : '') + hauToTheoNgay(cfg.hauTo, ngay, ncc);
  }

  function escRe(t) { return String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // số lớn nhất đã dùng (trong cùng kỳ) của một loại chứng từ
  function soDaDung(db, cfg, ngay, ncc) {
    if (!(cfg.doDai > 0)) return 0;
    const iso = isISODate(ngay) ? ngay : todayISO();
    const bo = function (t) { return String(t || '').replace(/\s+/g, ''); };
    const re = new RegExp('^' + escRe(bo(cfg.tienTo)) + '(\\d+)' + escRe(bo(hauToTheoNgay(cfg.hauTo, iso, ncc))) + '$', 'i');
    // hậu tố có năm thì chính số phiếu đã phân biệt năm; chỉ có tháng thì chỉ xét chứng từ cùng năm (PC001/09 năm trước không tính)
    const h = String(cfg.hauTo || '');
    const cungNam = /MM/.test(h) && !/YY/.test(h) ? iso.slice(0, 4) : '';
    const list = cfg.loai === 'mh' ? db.costs || [] : db.entries || [];
    let max = 0;
    list.forEach(function (e) {
      if (!e.soPhieu) return;
      if (cungNam && String(e.ngay || '').slice(0, 4) !== cungNam) return;
      const m = re.exec(bo(e.soPhieu));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return max;
  }

  // { so, soPhieu, daDung, cfg }: số chứng từ kế tiếp của loai (thu / chi / unc / mh / dc) cho ngày chứng từ
  function soChungTuTiep(db, loai, ngay, ncc) {
    const cfg = danhSoCfg(db, loai);
    if (!(cfg.doDai > 0)) return { so: 0, daDung: 0, soPhieu: soChungTu(cfg, 0, ngay, ncc), cfg: cfg };
    const daDung = soDaDung(db, cfg, ngay, ncc);
    let so = daDung + 1;
    if (cfg.soTiep && cfg.ky === kyDanhSo(cfg, ngay)) so = Math.max(so, cfg.soTiep);
    return { so: so, daDung: daDung, soPhieu: soChungTu(cfg, so, ngay, ncc), cfg: cfg };
  }

  // Số phiếu kế tiếp dạng PC045/09 (theo cấu hình Đánh số chứng từ)
  function nextVoucherNo(db, loai, ngay) {
    return soChungTuTiep(db, loai === 'thu' || loai === 'unc' ? loai : 'chi', ngay).soPhieu;
  }

  /* ---------------- Kỳ báo cáo ---------------- */

  function periodRange(kind, customFrom, customTo) {
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth();
    function iso(dt) { return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); }
    switch (kind) {
      case 'thang-nay': return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
      case 'thang-truoc': return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
      case 'quy-nay': { const q = Math.floor(m / 3) * 3; return { from: iso(new Date(y, q, 1)), to: iso(new Date(y, q + 3, 0)) }; }
      case 'nam-nay': return { from: y + '-01-01', to: y + '-12-31' };
      case 'tuy-chon': return { from: customFrom || '', to: customTo || '' };
      default: return { from: '', to: '' };
    }
  }

  /* Kỳ theo tháng / quý / năm chứa một ngày (anchor ISO), dịch tiến lùi từng kỳ, nhãn hiển thị (dùng cho thanh chọn kỳ thống nhất) */
  function periodUnit(kind, anchor) {
    const a = /^(\d{4})-(\d{2})-(\d{2})$/.test(anchor || '') ? new Date(+anchor.slice(0, 4), +anchor.slice(5, 7) - 1, 1) : new Date();
    const y = a.getFullYear();
    const m = a.getMonth();
    function iso(dt) { return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); }
    if (kind === 'quy') { const q = Math.floor(m / 3) * 3; return { from: iso(new Date(y, q, 1)), to: iso(new Date(y, q + 3, 0)) }; }
    if (kind === 'nam') return { from: y + '-01-01', to: y + '-12-31' };
    return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
  }
  function periodShift(kind, from, dir) {
    const d = /^(\d{4})-(\d{2})/.test(from || '') ? new Date(+from.slice(0, 4), +from.slice(5, 7) - 1, 1) : new Date();
    const step = kind === 'nam' ? 12 : kind === 'quy' ? 3 : 1;
    d.setMonth(d.getMonth() + dir * step);
    return periodUnit(kind, d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-01');
  }
  function periodLabel(kind, from, to) {
    const dm = function (iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : ''; };
    const sub = from && to ? dm(from) + ' – ' + dm(to) + '/' + to.slice(0, 4) : '';
    if (kind === 'thang' && from) return { title: 'Tháng ' + from.slice(5, 7) + '/' + from.slice(0, 4), sub: sub };
    if (kind === 'quy' && from) return { title: 'Quý ' + (Math.floor((+from.slice(5, 7) - 1) / 3) + 1) + '/' + from.slice(0, 4), sub: sub };
    if (kind === 'nam' && from) return { title: 'Năm ' + from.slice(0, 4), sub: sub };
    if (kind === 'khoang') return { title: from || to ? describeRange(from, to) : 'Chọn khoảng ngày', sub: '' };
    return { title: 'Toàn bộ thời gian', sub: '' };
  }

  function describeRange(from, to) {
    if (from && to) return 'Từ ngày ' + fmtDate(from) + ' đến ngày ' + fmtDate(to);
    if (from) return 'Từ ngày ' + fmtDate(from);
    if (to) return 'Đến ngày ' + fmtDate(to);
    return 'Toàn bộ thời gian';
  }

  /* =====================================================================
   * CHI PHÍ CÔNG TRÌNH (tương đương các sheet NHATKYCHUNG, TONGHOP,
   * CONGNO_NCC... của file ChiPhi_CongTrinh). Dòng chi phí chỉ lưu MÃ
   * (công trình, nhà, hạng mục, vật tư, NCC); tên, nhóm, ĐVT luôn tra từ danh mục
   * nên đổi tên / đổi nhóm ở danh mục là mọi báo cáo tự đổi theo.
   * ===================================================================== */

  const LOAI_CP = ['Vật tư', 'Nhân công', 'Dịch vụ-Phí'];

  function round4(v) { return Math.round(Number(v) * 10000) / 10000; }

  // Chuẩn hóa chữ "Loại CP" tự do về 1 trong 3 loại; '' nếu không nhận ra
  function normLoaiCP(s) {
    const t = normalizeText(s).replace(/[^a-z]/g, '');
    if (!t) return '';
    if (t.indexOf('vattu') === 0) return 'Vật tư';
    if (t.indexOf('nhancong') === 0) return 'Nhân công';
    if (t.indexOf('dichvu') === 0 || t.indexOf('phi') === 0) return 'Dịch vụ-Phí';
    return '';
  }

  // Số lượng: nhận 2,5 / 2.5 / 1.000 (nghìn) / 10+5 / 3*2,5. Trả về số (tối đa 4 chữ số lẻ) hoặc NaN.
  function parseQty(input) {
    if (input != null && typeof input !== 'string' && typeof input !== 'number') return NaN;
    if (typeof input === 'number') return isFinite(input) ? round4(input) : NaN;
    let s = String(input == null ? '' : input).trim().replace(/\s+/g, '').replace(/^=/, '');
    if (!s) return 0;
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    s = s.replace(/,/g, '.');
    if (!/^[\d.+\-*/()]+$/.test(s)) return NaN;
    try {
      const v = evalExpr(s);
      return isFinite(v) ? round4(v) : NaN;
    } catch (e) {
      return NaN;
    }
  }

  // 5000 -> "5.000"; 2.5 -> "2,5"; trống (dòng theo khoản không có số lượng) -> ""
  function fmtQty(n) {
    if (n === null || n === undefined || n === '') return '';
    n = round4(n);
    if (!n) return n === 0 ? '0' : '';
    const neg = n < 0;
    const a = Math.abs(n);
    const ip = Math.floor(a);
    let dec = String(round4(a - ip)).replace(/^0\.?/, '');
    return (neg ? '-' : '') + String(ip).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec ? ',' + dec : '');
  }

  // Thành tiền = Số lượng × Đơn giá, làm tròn đến đồng (tính bằng số nguyên để không lệch)
  function costAmount(soLuong, donGia) {
    // Toàn bộ bằng số nguyên: SL có tối đa 4 số lẻ, ĐG tối đa 2 số lẻ; làm tròn nửa ra xa số 0 ở bước cuối (như ROUND của Excel).
    const a = Math.round((Number(soLuong) || 0) * 10000);
    const b = Math.round((Number(donGia) || 0) * 100);
    const neg = (a < 0) !== (b < 0);
    const sl = Math.abs(a);
    const dg = Math.abs(b);
    const p = sl * dg;
    let r;
    if (p < 4503599627370496) { // 2^52: phép cộng bên dưới vẫn chính xác
      const t = p * 2 + 1000000;
      r = (t - (t % 2000000)) / 2000000;
    } else if (typeof BigInt === 'function') r = Number((BigInt(sl) * BigInt(dg) * BigInt(2) + BigInt(1000000)) / BigInt(2000000));
    else r = Math.round(p / 1000000);
    return r === 0 ? 0 : neg ? -r : r;
  }

  /* Số lượng / Đơn giá / Thành tiền của một dòng chi phí từ các ô đã nhập (null hoặc '' = để trống; số đã đọc, không âm).
   * - Đủ SL và ĐG: Thành tiền = SL × ĐG. Thành tiền gửi kèm: bỏ qua (như trước nay, máy chủ luôn tự tính), trừ khi kiemKhop = true
   *   (giao diện: người dùng gõ cả ba ô mà lệch nhau thì báo lỗi).
   * - SL + Thành tiền: ĐG = Thành tiền / SL (làm tròn 0,01), chỉ nhận khi SL × ĐG ra đúng Thành tiền.
   * - Chỉ có Thành tiền: nhập theo khoản (nhân công, phí… không có đơn giá) — Số lượng và Đơn giá để TRỐNG (null), chỉ lưu Thành tiền.
   *   Không tự gán SL 1 × ĐG = Thành tiền (đơn giá giả làm sai thống kê giá).
   * Trả về { soLuong, donGia, thanhTien } hoặc { loi, cot } (cot = ô cần sửa). */
  function costFromInput(soLuong, donGia, thanhTien, kiemKhop) {
    function has(v) { return v !== null && v !== undefined && v !== ''; }
    const hS = has(soLuong);
    const hD = has(donGia);
    const hT = has(thanhTien);
    if (hS && !(Number(soLuong) > 0)) return { loi: 'Số lượng phải lớn hơn 0', cot: 'soLuong' };
    if (hS && hD) {
      const tt = costAmount(soLuong, donGia);
      if (kiemKhop && hT && Math.round(Number(thanhTien)) !== tt) {
        return { loi: 'Thành tiền ' + fmtMoney(Math.round(Number(thanhTien))) + ' khác Số lượng × Đơn giá = ' + fmtMoney(tt) + '. Sửa lại hoặc xóa trống một ô', cot: 'thanhTien' };
      }
      return { soLuong: Number(soLuong), donGia: Number(donGia), thanhTien: tt };
    }
    if (!hT) {
      if (hS) return { loi: 'thiếu Đơn giá (hoặc nhập Thành tiền)', cot: 'donGia' };
      if (hD) return { loi: 'thiếu Số lượng (hoặc nhập Thành tiền)', cot: 'soLuong' };
      return { loi: 'cần Số lượng và Đơn giá, hoặc Thành tiền', cot: 'soLuong' };
    }
    const t = Math.round(Number(thanhTien));
    if (!(t > 0)) return { loi: 'Thành tiền phải lớn hơn 0', cot: 'thanhTien' };
    if (hS) {
      const sl = Number(soLuong);
      const dg = Math.round((t / sl) * 100) / 100;
      if (costAmount(sl, dg) !== t) {
        return { loi: 'Thành tiền ' + fmtMoney(t) + ' không chia đều cho số lượng ' + fmtQty(sl) + '. Nhập Đơn giá, hoặc xóa trống Số lượng để nhập theo khoản', cot: 'thanhTien' };
      }
      return { soLuong: sl, donGia: dg, thanhTien: t };
    }
    if (hD) return { loi: 'thiếu Số lượng (hoặc xóa trống Đơn giá để nhập theo khoản)', cot: 'soLuong' };
    return { soLuong: null, donGia: null, thanhTien: t };
  }

  // Dòng chi phí theo khoản: không có Số lượng, Đơn giá — chỉ có Thành tiền
  function isKhoan(c) {
    const trong = function (v) { return v === null || v === undefined || v === ''; };
    return !!c && trong(c.soLuong) && trong(c.donGia);
  }
  // Dòng khoán lưu theo cách cũ: Số lượng 1 × Đơn giá = Thành tiền (bản trước tự gán khi chỉ nhập Thành tiền; file Excel cũ cũng vậy)
  function laKhoanCu(c) {
    if (!c || isKhoan(c) || c.donGia === null || c.donGia === undefined || c.donGia === '') return false;
    const t = Number(c.thanhTien);
    return Number(c.soLuong) === 1 && t > 0 && Number(c.donGia) === t;
  }
  // Các dòng khoán cũ trong dữ liệu (để chuyển sang theo khoản)
  function khoanCu(db) {
    return (db.costs || []).filter(laKhoanCu).sort(compareEntries);
  }

  /* Giao diện: tự điền ô còn lại khi gõ SL / ĐG / Thành tiền (giá trị dạng chuỗi trong l). changed = ô vừa sửa.
   * l.ttTuDong = Thành tiền là kết quả SL × ĐG; l.dgTuDong = Đơn giá được tính từ Thành tiền người dùng gõ (khi lưu gửi ĐG trống,
   * máy chủ tự tính lại từ SL + Thành tiền).
   * Ô người dùng tự gõ không bao giờ bị ghi đè. Trả về tên ô vừa được điền lại (hoặc null). */
  function syncCostInputs(l, changed) {
    function has(v) { return String(v == null ? '' : v).trim() !== ''; }
    const sl = parseQty(l.soLuong);
    const dg = parseAmount(l.donGia);
    const tt = parseAmount(l.thanhTien);
    const okSL = has(l.soLuong) && !isNaN(sl) && sl > 0;
    const okDG = has(l.donGia) && !isNaN(dg) && dg >= 0;
    const okTT = has(l.thanhTien) && !isNaN(tt) && tt > 0;
    // ô Đơn giá chỉ hiện số chẵn đồng (ô tiền không nhận số lẻ); chia không chẵn thì để trống, khi lưu máy chủ tính ĐG tới 0,01
    function deriveDG() {
      const d = Math.round(tt / sl);
      l.donGia = costAmount(sl, d) === tt ? fmtMoney(d) : '';
      l.dgTuDong = true;
      return 'donGia';
    }
    function clearDG() {
      if (!has(l.donGia)) return null;
      l.donGia = '';
      return 'donGia';
    }
    if (changed === 'thanhTien') {
      l.ttTuDong = false;
      if (okSL && okTT) return deriveDG();
      return l.dgTuDong ? clearDG() : null;
    }
    if (changed === 'donGia') l.dgTuDong = false;
    if (l.dgTuDong) return okSL && okTT ? deriveDG() : clearDG();
    if (okSL && okDG) { l.thanhTien = fmtMoney(costAmount(sl, dg)); l.ttTuDong = true; return 'thanhTien'; }
    if (changed === 'soLuong' && okSL && !has(l.donGia) && okTT && !l.ttTuDong) return deriveDG();
    if (l.ttTuDong && has(l.thanhTien)) { l.thanhTien = ''; l.ttTuDong = false; return 'thanhTien'; }
    return null;
  }

  function costIndexes(db) {
    return {
      p: indexBy(db.projects),
      h: indexBy(db.houses),
      i: indexBy(db.costItems),
      g: indexBy(db.costGroups),
      m: indexBy(db.materials),
      s: indexBy(db.suppliers)
    };
  }

  // Tìm hạng mục theo mã HOẶC theo tên (file Excel lưu tên hạng mục)
  function findCostItem(db, text) {
    const t = resolveAlias(db, 'hm', String(text || '').trim()); // mã hạng mục cũ đã gộp → mã đích
    if (!t) return null;
    const list = (db.costItems || []).filter(function (x) { return !x.gopVao; });
    const k = keyOf(t);
    const byCode = list.find(function (x) { return keyOf(x.ma) === k; });
    if (byCode) return byCode;
    const n = normalizeText(t).trim();
    return list.find(function (x) { return normalizeText(x.ten).trim() === n; }) || null;
  }

  // Loại CP gợi ý cho 1 dòng: theo vật tư -> theo hạng mục "Nhân công..." -> có mã VT là Vật tư, không có là Dịch vụ-Phí
  // Loại CP của dòng: theo hạng mục (lược đồ 8: mỗi hạng mục có Loại chi phí), rồi giá trị cũ ở vật tư, rồi đoán theo tên / có vật tư hay không
  function defaultLoaiCP(db, maVT, maHM) {
    const it = indexBy(db.costItems).get(keyOf(maHM));
    if (it && normLoaiCP(it.loaiCP)) return normLoaiCP(it.loaiCP);
    const m = indexBy(db.materials).get(keyOf(maVT));
    if (m && normLoaiCP(m.loaiCP)) return normLoaiCP(m.loaiCP);
    if (it && normalizeText(it.ten).indexOf('nhan cong') === 0) return 'Nhân công';
    return String(maVT || '').trim() ? 'Vật tư' : 'Dịch vụ-Phí';
  }

  // Sổ chi phí: các dòng sắp theo ngày, kèm tên tra từ danh mục (tương đương NHATKYCHUNG)
  function buildCostLedger(db) {
    const x = costIndexes(db);
    return (db.costs || []).slice().sort(compareEntries).map(function (c, i) {
      const p = x.p.get(keyOf(c.maCT));
      const h = x.h.get(keyOf(c.maNha));
      const it = x.i.get(keyOf(c.maHM));
      const g = it ? x.g.get(keyOf(it.maNhom)) : null;
      const m = x.m.get(keyOf(c.maVT));
      const s = x.s.get(keyOf(c.maNCC));
      return Object.assign({}, c, {
        stt: i + 1,
        tenCT: p ? p.ten : '',
        tenNha: h ? h.ten : '',
        nhaChung: !!(h && h.chung),
        tenHM: it ? it.ten : '',
        maNhom: it ? (it.maNhom || '') : '',
        tenNhom: g ? g.ten : '',
        tenVT: m ? m.ten : '',
        dvt: m ? (m.dvt || '') : '',
        tenNCC: s ? s.ten : '',
        ctHopLe: !c.maCT || !!p,
        nhaHopLe: !c.maNha || !!h,
        hmHopLe: !!it,
        vtHopLe: !c.maVT || !!m,
        nccHopLe: !c.maNCC || !!s
      });
    });
  }

  function matchCode(value, wanted) {
    if (!wanted) return true;
    if (wanted === '__none__') return !String(value || '').trim();
    return keyOf(value) === keyOf(wanted);
  }

  // Lọc sổ chi phí. f: { from, to, ct, nha, nhom, hm, loai, ncc, vt, phieu, q }
  function filterCosts(ledger, f) {
    f = f || {};
    const q = normalizeText(f.q).trim();
    const rows = ledger.filter(function (r) {
      if (!inRange(r.ngay, f.from, f.to)) return false;
      if (!matchCode(r.maCT, f.ct)) return false;
      if (!matchCode(r.maNha, f.nha)) return false;
      if (!matchCode(r.maNhom, f.nhom)) return false;
      if (!matchCode(r.maHM, f.hm)) return false;
      if (!matchCode(r.maNCC, f.ncc)) return false;
      if (!matchCode(r.maVT, f.vt)) return false;
      if (f.loai && r.loaiCP !== f.loai) return false;
      if (f.phieu && String(r.phieuId) !== String(f.phieu)) return false;
      if (q) {
        const hay = normalizeText([r.maCT, r.maNha, r.tenHM, r.tenNhom, r.loaiCP, r.maVT, r.tenVT, r.dienGiai, r.maNCC, r.tenNCC,
          r.soPhieu, r.ghiChu, fmtMoney(r.thanhTien), isKhoan(r) ? 'theo khoản' : fmtMoney(r.donGia)].join(' '));
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    const byLoai = {};
    LOAI_CP.forEach(function (l) { byLoai[l] = 0; });
    let total = 0;
    let tongSL = 0;
    const slTheoDvt = {}; // tổng số lượng theo từng đơn vị tính ('' = không có ĐVT)
    rows.forEach(function (r) {
      total += r.thanhTien || 0;
      byLoai[r.loaiCP] = (byLoai[r.loaiCP] || 0) + (r.thanhTien || 0);
      tongSL = round4(tongSL + (Number(r.soLuong) || 0));
      const dvt = String(r.dvt || '').trim();
      slTheoDvt[dvt] = round4((slTheoDvt[dvt] || 0) + (Number(r.soLuong) || 0));
    });
    return { rows: rows, total: total, byLoai: byLoai, tongSL: tongSL, slTheoDvt: slTheoDvt };
  }

  // Tổng hợp theo Nhóm -> Hạng mục, theo loại, theo tháng (tương đương TONGHOP)
  function costSummary(db, f, ledger) {
    f = f || {};
    const res = filterCosts(ledger || buildCostLedger(db), { from: f.from, to: f.to, ct: f.ct, nha: f.nha, loai: f.loai, ncc: f.ncc });
    const groups = [];
    const gByKey = new Map();
    const itemByKey = new Map();
    function addGroup(ma, ten, inCatalog) {
      const g = { ma: ma, ten: ten, total: 0, soDong: 0, items: [], inCatalog: inCatalog };
      groups.push(g);
      gByKey.set(keyOf(ma), g);
      return g;
    }
    (db.costGroups || []).forEach(function (g) { if (!gByKey.has(keyOf(g.ma))) addGroup(g.ma, g.ten, true); });
    (db.costItems || []).forEach(function (it) {
      if (itemByKey.has(keyOf(it.ma))) return;
      let g = gByKey.get(keyOf(it.maNhom));
      if (!g) g = gByKey.get('__khongnhom') || addGroup('__khongnhom', '(Hạng mục chưa có nhóm)', false);
      const row = { ma: it.ma, ten: it.ten, total: 0, soDong: 0, inCatalog: true };
      g.items.push(row);
      itemByKey.set(keyOf(it.ma), row);
    });
    const months = new Map();
    res.rows.forEach(function (r) {
      let item = itemByKey.get(keyOf(r.maHM));
      if (!item) {
        const g = gByKey.get('__khonghm') || addGroup('__khonghm', '(Chưa có hạng mục)', false);
        item = { ma: r.maHM || '', ten: r.maHM ? r.maHM + ' (không có trong danh mục)' : '(Để trống hạng mục)', total: 0, soDong: 0, inCatalog: false };
        g.items.push(item);
        itemByKey.set(keyOf(r.maHM), item);
      }
      item.total += r.thanhTien || 0;
      item.soDong++;
      const mk = r.ngay ? r.ngay.slice(0, 7) : '';
      months.set(mk, (months.get(mk) || 0) + (r.thanhTien || 0));
    });
    groups.forEach(function (g) {
      g.items.forEach(function (it) { g.total += it.total; g.soDong += it.soDong; });
    });
    const byMonth = [];
    let luyKe = 0;
    Array.from(months.keys()).sort().forEach(function (k) {
      luyKe += months.get(k);
      byMonth.push({ thang: k, total: months.get(k), luyKe: luyKe });
    });
    return {
      total: res.total,
      byLoai: res.byLoai,
      soDong: res.rows.length,
      groups: groups.filter(function (g) { return g.inCatalog || g.soDong > 0; }),
      byMonth: byMonth
    };
  }

  // Công nợ NCC = Chi phí phát sinh (sổ chi phí) − Đã trả (sổ thu chi: chi − thu), nối bằng Mã NCC
  // (và Mã công trình = Mã công trình nếu lọc theo công trình). f: { ct, to }
  const DEBT_TEXT = { no: 'Còn nợ', du: 'Ứng dư', ok: 'Đã tất toán' };
  // f.ncc: một mã hoặc danh sách mã NCC → Set khóa (null = mọi NCC)
  function nccSetOf(ncc) {
    if (!ncc) return null;
    const s = new Set((Array.isArray(ncc) ? ncc : [ncc]).map(keyOf).filter(Boolean));
    return s.size ? s : null;
  }

  function supplierDebt(db, f) {
    f = f || {};
    const only = nccSetOf(f.ncc); // lọc theo NCC: bỏ qua ngay dòng của NCC khác (không cộng dồn rồi mới lọc)
    const acc = new Map();
    // công trình đang có chi phí: khoản trả gắn với các công trình này mới coi là "liên quan công trình"
    const ctCoChiPhi = new Set();
    (db.costs || []).forEach(function (c) { if (c.maCT) ctCoChiPhi.add(keyOf(c.maCT)); });
    function get(ma) {
      const k = keyOf(ma);
      let a = acc.get(k);
      if (!a) { a = { ma: String(ma).trim(), dauKy: 0, phatSinh: 0, daTra: 0, daTraNgoai: 0, soDongCP: 0, soDongTT: 0, soDongNgoai: 0, soDongTTCT: 0, soDongDK: 0, last: '' }; acc.set(k, a); }
      return a;
    }
    // Số dư đầu kỳ nhập tay (công nợ có từ trước khi dùng phần mềm): dương = còn nợ NCC, âm = đã ứng trước
    (db.soDuDauKy || []).forEach(function (p) {
      if (!p.maNCC) return;
      if (only && !only.has(keyOf(p.maNCC))) return;
      if (f.ct && keyOf(p.maDuAn) !== keyOf(f.ct)) return;
      if (f.to && p.ngay > f.to) return;
      const a = get(p.maNCC);
      a.dauKy += p.soTien || 0;
      a.soDongDK++;
    });
    (db.costs || []).forEach(function (c) {
      if (!c.maNCC) return;
      if (only && !only.has(keyOf(c.maNCC))) return;
      if (f.ct && keyOf(c.maCT) !== keyOf(f.ct)) return;
      if (f.to && c.ngay > f.to) return;
      const a = get(c.maNCC);
      a.phatSinh += c.thanhTien || 0;
      a.soDongCP++;
      if (c.ngay > a.last) a.last = c.ngay;
    });
    (db.entries || []).forEach(function (e) {
      if (!e.maNCC) return;
      if (only && !only.has(keyOf(e.maNCC))) return;
      if (f.ct && keyOf(e.maDuAn) !== keyOf(f.ct)) return;
      if (f.to && e.ngay > f.to) return;
      const a = get(e.maNCC);
      a.daTra += (e.chi || 0) - (e.thu || 0);
      a.soDongTT++;
      if (ctCoChiPhi.has(keyOf(e.maDuAn))) a.soDongTTCT++;
      if (e.ngay > a.last) a.last = e.ngay;
    });
    // Trả NCC từ nguồn tiền khác (ngoài quỹ tiền mặt): tính vào "đã trả" như phiếu chi, nhưng không có trong sổ thu chi / tồn quỹ
    (db.extPayments || []).forEach(function (p) {
      if (!p.maNCC) return;
      if (only && !only.has(keyOf(p.maNCC))) return;
      if (f.ct && keyOf(p.maDuAn) !== keyOf(f.ct)) return;
      if (f.to && p.ngay > f.to) return;
      const a = get(p.maNCC);
      a.daTra += p.soTien || 0;
      a.daTraNgoai += p.soTien || 0;
      a.soDongTT++;
      a.soDongNgoai++;
      if (ctCoChiPhi.has(keyOf(p.maDuAn))) a.soDongTTCT++;
      if (p.ngay > a.last) a.last = p.ngay;
    });
    const rows = [];
    const seen = new Set();
    function push(ma, s, a) {
      a = a || { dauKy: 0, phatSinh: 0, daTra: 0, daTraNgoai: 0, soDongCP: 0, soDongTT: 0, soDongNgoai: 0, soDongTTCT: 0, soDongDK: 0, last: '' };
      const conLai = a.dauKy + a.phatSinh - a.daTra;
      rows.push({
        id: s ? s.id : undefined, ma: ma, ten: s ? s.ten : '(Chưa có trong danh mục)', loai: s ? (s.loai || '') : '',
        dauKy: a.dauKy, phatSinh: a.phatSinh, daTra: a.daTra, daTraNgoai: a.daTraNgoai, daTraQuy: a.daTra - a.daTraNgoai, conLai: conLai, soDongCP: a.soDongCP, soDongTT: a.soDongTT,
        soDongNgoai: a.soDongNgoai, soDongDK: a.soDongDK, last: a.last,
        // có chi phí công trình, có số dư đầu kỳ, hoặc có khoản trả/ứng gắn với công trình đang có chi phí (vd. ứng trước cho thầu)
        lienQuan: a.soDongCP > 0 || a.soDongTTCT > 0 || a.soDongDK > 0,
        status: conLai > 0 ? 'no' : conLai < 0 ? 'du' : 'ok', inCatalog: !!s
      });
    }
    (db.suppliers || []).forEach(function (s) {
      const k = keyOf(s.ma);
      if (seen.has(k)) return;
      seen.add(k);
      push(s.ma, s, acc.get(k));
    });
    acc.forEach(function (a, k) { if (!seen.has(k)) push(a.ma, null, a); });
    // f.ncc: một / nhiều nhà cung cấp (theo mã); khi đó tổng tính cả khi NCC chưa "liên quan công trình"
    const list = only ? rows.filter(function (r) { return only.has(keyOf(r.ma)); }) : rows;
    const sumRows = function (list) {
      return list.reduce(function (t, r) {
        t.dauKy += r.dauKy; t.phatSinh += r.phatSinh; t.daTra += r.daTra; t.daTraNgoai += r.daTraNgoai; t.conLai += r.conLai;
        if (r.conLai > 0) t.conNo += r.conLai; else t.ungDu -= r.conLai;
        return t;
      }, { dauKy: 0, phatSinh: 0, daTra: 0, daTraNgoai: 0, conLai: 0, conNo: 0, ungDu: 0 });
    };
    // total: chỉ các NCC liên quan công trình (dùng cho báo cáo); totalAll: mọi mã NCC
    return { rows: list, total: sumRows(only ? list : list.filter(function (r) { return r.lienQuan; })), totalAll: sumRows(list), sumRows: sumRows };
  }

  function debtOf(db, maNCC, ct) {
    if (!maNCC) return null;
    const r = supplierDebt(db, { ct: ct }).rows.find(function (x) { return keyOf(x.ma) === keyOf(maNCC); });
    return r && (r.soDongCP || r.soDongTT || r.soDongDK) ? r : null;
  }

  // Công nợ NCC theo kỳ [f.from, f.to]: Đầu kỳ + Phát sinh trong kỳ − Thanh toán trong kỳ = Cuối kỳ.
  //   Đầu kỳ = số dư đầu kỳ nhập tay (ngày không sau f.to) + chi phí trước f.from − thanh toán trước f.from
  //   Phát sinh = chi phí (sổ chi phí) trong kỳ; Thanh toán = sổ thu chi (chi − thu) + trả ngoài quỹ trong kỳ.
  // f: { from, to, ct, ncc }. Cuối kỳ luôn bằng "Còn lại" của supplierDebt(db, { ct, to, ncc }).
  function supplierPeriod(db, f) {
    f = f || {};
    const only = nccSetOf(f.ncc);
    const acc = new Map();
    function get(ma) {
      const k = keyOf(ma);
      let a = acc.get(k);
      if (!a) { a = { ma: String(ma).trim(), dauKy: 0, nhapDauKy: 0, phatSinh: 0, thanhToan: 0, daChi: 0, daThu: 0, traNgoai: 0, soDongCP: 0, soDongTT: 0, soDongDK: 0, coTruoc: false, last: '' }; acc.set(k, a); }
      return a;
    }
    function pick(x, ctField) {
      if (!x.maNCC) return false;
      if (only && !only.has(keyOf(x.maNCC))) return false;
      if (f.ct && keyOf(x[ctField]) !== keyOf(f.ct)) return false;
      return !(f.to && x.ngay > f.to);
    }
    const truoc = function (ngay) { return !!f.from && ngay < f.from; };
    (db.soDuDauKy || []).forEach(function (p) {
      if (!pick(p, 'maDuAn')) return;
      const a = get(p.maNCC);
      a.dauKy += p.soTien || 0;
      a.nhapDauKy += p.soTien || 0;
      a.soDongDK++;
    });
    (db.costs || []).forEach(function (c) {
      if (!pick(c, 'maCT')) return;
      const a = get(c.maNCC);
      if (truoc(c.ngay)) { a.dauKy += c.thanhTien || 0; a.coTruoc = true; return; }
      a.phatSinh += c.thanhTien || 0;
      a.soDongCP++;
      if (c.ngay > a.last) a.last = c.ngay;
    });
    function pay(x, chi, thu, ngoai) {
      const a = get(x.maNCC);
      if (truoc(x.ngay)) { a.dauKy -= chi - thu; a.coTruoc = true; return; }
      a.thanhToan += chi - thu;
      a.daChi += ngoai ? 0 : chi;
      a.daThu += thu;
      a.traNgoai += ngoai ? chi : 0;
      a.soDongTT++;
      if (x.ngay > a.last) a.last = x.ngay;
    }
    (db.entries || []).forEach(function (e) { if (pick(e, 'maDuAn')) pay(e, e.chi || 0, e.thu || 0, false); });
    (db.extPayments || []).forEach(function (p) { if (pick(p, 'maDuAn')) pay(p, p.soTien || 0, 0, true); });
    const rows = [];
    const seen = new Set();
    function push(ma, s, a) {
      a = a || get(ma);
      const cuoiKy = a.dauKy + a.phatSinh - a.thanhToan;
      rows.push({
        id: s ? s.id : undefined, ma: ma, ten: s ? s.ten : '(Chưa có trong danh mục)', loai: s ? (s.loai || '') : '', sdt: s ? s.sdt : '', inCatalog: !!s,
        dauKy: a.dauKy, nhapDauKy: a.nhapDauKy, phatSinh: a.phatSinh, thanhToan: a.thanhToan, daChi: a.daChi, daThu: a.daThu, traNgoai: a.traNgoai, cuoiKy: cuoiKy,
        soDongCP: a.soDongCP, soDongTT: a.soDongTT, soDongDK: a.soDongDK, last: a.last,
        // có số liệu: có đầu kỳ (nhập tay hoặc từ trước kỳ) hoặc có phát sinh / thanh toán trong kỳ
        coSoLieu: a.soDongDK > 0 || a.coTruoc || a.soDongCP > 0 || a.soDongTT > 0,
        status: cuoiKy > 0 ? 'no' : cuoiKy < 0 ? 'du' : 'ok'
      });
    }
    (db.suppliers || []).forEach(function (s) {
      const k = keyOf(s.ma);
      if (seen.has(k) || (only && !only.has(k))) return;
      seen.add(k);
      push(s.ma, s, acc.get(k));
    });
    acc.forEach(function (a, k) { if (!seen.has(k)) push(a.ma, null, a); });
    const sumRows = function (list) {
      return list.reduce(function (t, r) {
        ['dauKy', 'phatSinh', 'thanhToan', 'daChi', 'daThu', 'traNgoai', 'cuoiKy', 'soDongCP', 'soDongTT'].forEach(function (key) { t[key] += r[key]; });
        if (r.cuoiKy > 0) t.conNo += r.cuoiKy; else t.ungDu -= r.cuoiKy;
        return t;
      }, { dauKy: 0, phatSinh: 0, thanhToan: 0, daChi: 0, daThu: 0, traNgoai: 0, cuoiKy: 0, soDongCP: 0, soDongTT: 0, conNo: 0, ungDu: 0 });
    };
    return { rows: rows, total: sumRows(rows), sumRows: sumRows };
  }

  // Công nợ NCC chia theo công trình: mỗi công trình một nhóm, mỗi NCC một dòng (Đầu kỳ / Phát sinh / Thanh toán / Cuối kỳ như
  // supplierPeriod nhưng chỉ tính chứng từ có Mã công trình = công trình đó). Thanh toán, số dư đầu kỳ không ghi công trình gom vào
  // nhóm chuaGan = (cả bảng không lọc công trình) − (tổng các công trình) theo từng NCC, nên mỗi NCC cộng các nhóm luôn bằng
  // supplierPeriod không lọc công trình. f: { from, to, ncc, ct (chỉ một công trình), tt: '' | 'no' | 'du' | 'khac0',
  // q: từ khóa — công trình khớp thì giữ cả nhóm, không thì chỉ giữ các NCC khớp }. Nhóm xếp theo còn nợ giảm dần, NCC theo cuối kỳ giảm dần.
  function supplierDebtByProject(db, f) {
    f = f || {};
    const q = normalizeText(f.q || '').trim();
    const khopNCC = function (r) { return !q || normalizeText(r.ma + ' ' + r.ten + ' ' + (r.loai || '')).includes(q); };
    const xep = function (a, b) { return b.cuoiKy - a.cuoiKy || String(a.ten).localeCompare(String(b.ten), 'vi'); };
    const hop = function (r) { return f.tt === 'no' ? r.cuoiKy > 0 : f.tt === 'du' ? r.cuoiKy < 0 : f.tt === 'khac0' ? r.cuoiKy !== 0 : r.coSoLieu; };
    const ds = [];
    const seen = new Set();
    (db.projects || []).forEach(function (p) { const k = keyOf(p.ma); if (k && !seen.has(k)) { seen.add(k); ds.push({ ma: p.ma, ten: p.ten, trangThai: p.trangThai || '', inCatalog: true }); } });
    [['costs', 'maCT'], ['entries', 'maDuAn'], ['extPayments', 'maDuAn'], ['soDuDauKy', 'maDuAn']].forEach(function (x) {
      (db[x[0]] || []).forEach(function (r) {
        const k = keyOf(r[x[1]]);
        if (k && r.maNCC && !seen.has(k)) { seen.add(k); ds.push({ ma: String(r[x[1]]).trim(), ten: '(Chưa có trong danh mục)', trangThai: '', inCatalog: false }); }
      });
    });
    const SO = ['dauKy', 'nhapDauKy', 'phatSinh', 'thanhToan', 'daChi', 'daThu', 'traNgoai', 'cuoiKy'];
    const cong = function (a, r) { SO.forEach(function (k) { a[k] = (a[k] || 0) + (r[k] || 0); }); };
    const daCong = new Map(); // NCC → tổng các công trình (để tính phần chưa gán)
    const groups = [];
    ds.forEach(function (p) {
      if (f.ct && keyOf(p.ma) !== keyOf(f.ct)) return;
      const d = supplierPeriod(db, { from: f.from, to: f.to, ct: p.ma, ncc: f.ncc });
      const coSo = d.rows.filter(function (r) { return r.coSoLieu; });
      coSo.forEach(function (r) { const k = keyOf(r.ma); if (!daCong.has(k)) daCong.set(k, {}); cong(daCong.get(k), r); });
      const ctKhop = !q || normalizeText(p.ma + ' ' + p.ten).includes(q);
      const rows = coSo.filter(function (r) { return hop(r) && (ctKhop || khopNCC(r)); }).sort(xep);
      if (!rows.length) return;
      groups.push({ ma: p.ma, ten: p.ten, trangThai: p.trangThai, inCatalog: p.inCatalog, rows: rows, tong: d.sumRows(rows), soNCCNo: rows.filter(function (r) { return r.cuoiKy > 0; }).length });
    });
    let chuaGan = null;
    if (!f.ct) {
      const all = supplierPeriod(db, { from: f.from, to: f.to, ncc: f.ncc });
      const rows = [];
      all.rows.forEach(function (r) {
        const a = daCong.get(keyOf(r.ma)) || {};
        const x = Object.assign({}, r);
        SO.forEach(function (k) { x[k] = (r[k] || 0) - (a[k] || 0); });
        x.coSoLieu = !!(x.dauKy || x.phatSinh || x.thanhToan);
        x.status = x.cuoiKy > 0 ? 'no' : x.cuoiKy < 0 ? 'du' : 'ok';
        if (x.coSoLieu && hop(x) && khopNCC(x)) rows.push(x);
      });
      rows.sort(xep);
      if (rows.length) chuaGan = { ma: '', ten: 'Chưa gán công trình', rows: rows, tong: all.sumRows(rows), soNCCNo: rows.filter(function (r) { return r.cuoiKy > 0; }).length };
    }
    groups.sort(function (a, b) { return b.tong.conNo - a.tong.conNo || b.tong.ungDu - a.tong.ungDu || String(a.ma).localeCompare(String(b.ma), 'vi'); });
    const tatCa = groups.concat(chuaGan ? [chuaGan] : []);
    const total = tatCa.reduce(function (t, g) {
      ['dauKy', 'phatSinh', 'thanhToan', 'traNgoai', 'cuoiKy', 'conNo', 'ungDu'].forEach(function (k) { t[k] += g.tong[k]; });
      t.soDong += g.rows.length;
      return t;
    }, { dauKy: 0, phatSinh: 0, thanhToan: 0, traNgoai: 0, cuoiKy: 0, conNo: 0, ungDu: 0, soDong: 0 });
    total.soCongTrinhNo = groups.filter(function (g) { return g.tong.conNo > 0; }).length;
    return { groups: groups, chuaGan: chuaGan, total: total };
  }

  // Đối chiếu hai màn công nợ: Công nợ NCC theo kỳ (gộp mọi công trình của một NCC) với Công nợ theo công trình (từng cặp NCC × công trình).
  // Thuần (Có − Nợ) hai màn luôn bằng nhau. Dư Có và Dư Nợ theo công trình lớn hơn cùng một khoản = phần bù trừ: NCC còn nợ ở công trình này
  // nhưng đã ứng trước ở công trình khác (màn theo NCC trừ hai khoản cho nhau, màn theo công trình giữ riêng). f: { from, to, ncc }
  // → { ncc: { conNo, ungDu, thuan }, ct: { conNo, ungDu, thuan }, buTru, dsNCC: [{ ma, ten, cuoiKy, buTru, no: [{ ma, so }], ung: [{ ma, so }] }] }
  function doiChieuCongNo(db, f) {
    f = f || {};
    const tong = function () { return { conNo: 0, ungDu: 0, thuan: 0 }; };
    const cong = function (t, n) { if (n > 0) t.conNo += n; else t.ungDu -= n; t.thuan += n; };
    const theoNCC = tong();
    supplierPeriod(db, { from: f.from, to: f.to, ncc: f.ncc }).rows.forEach(function (r) { cong(theoNCC, r.cuoiKy); });
    const kq = supplierDebtByProject(db, { from: f.from, to: f.to, ncc: f.ncc, tt: 'khac0' });
    const theoCT = tong();
    const by = new Map();
    kq.groups.concat(kq.chuaGan ? [kq.chuaGan] : []).forEach(function (g) {
      g.rows.forEach(function (r) {
        cong(theoCT, r.cuoiKy);
        const k = keyOf(r.ma);
        if (!by.has(k)) by.set(k, { ma: r.ma, ten: r.ten, cuoiKy: 0, no: [], ung: [] });
        const x = by.get(k);
        x.cuoiKy += r.cuoiKy;
        (r.cuoiKy > 0 ? x.no : x.ung).push({ ma: g.ma, so: Math.abs(r.cuoiKy) });
      });
    });
    const sum = function (xs) { return xs.reduce(function (t, y) { return t + y.so; }, 0); };
    const dsNCC = [];
    by.forEach(function (x) {
      if (!x.no.length || !x.ung.length) return;
      x.buTru = Math.min(sum(x.no), sum(x.ung));
      const xep = function (a, b) { return b.so - a.so; };
      x.no.sort(xep); x.ung.sort(xep);
      dsNCC.push(x);
    });
    dsNCC.sort(function (a, b) { return b.buTru - a.buTru || String(a.ten).localeCompare(String(b.ten), 'vi'); });
    return { ncc: theoNCC, ct: theoCT, buTru: theoCT.conNo - theoNCC.conNo, dsNCC: dsNCC };
  }

  // Tổng hợp theo công trình: chi phí phát sinh, đã trả NCC, còn nợ / ứng dư (cộng theo từng NCC của công trình),
  // chi khác không ghi NCC. Đã trả = sổ thu chi (chi − thu) có Mã công trình = công trình và có Mã NCC.
  // f: { to, all, ncc } — all = hiện cả công trình chưa có dòng chi phí nào; ncc = chỉ tính một nhà cung cấp (bỏ công trình NCC đó
  // không có phát sinh / thanh toán; cột Chi khác không áp dụng).
  function projectDebtSummary(db, f) {
    f = f || {};
    const onlyNcc = nccSetOf(f.ncc);
    const coChiPhi = new Set();
    (db.costs || []).forEach(function (c) { if (c.maCT && (!f.to || c.ngay <= f.to)) coChiPhi.add(keyOf(c.maCT)); });
    // công trình có số dư đầu kỳ NCC: công nợ có nghĩa như công trình có chi phí
    (db.soDuDauKy || []).forEach(function (p) { if (p.maDuAn && (!f.to || p.ngay <= f.to)) coChiPhi.add(keyOf(p.maDuAn)); });
    const coThuChi = new Set();
    (db.entries || []).forEach(function (e) { if (e.maDuAn && (!f.to || e.ngay <= f.to)) coThuChi.add(keyOf(e.maDuAn)); });
    (db.extPayments || []).forEach(function (e) { if (e.maDuAn && (!f.to || e.ngay <= f.to)) coThuChi.add(keyOf(e.maDuAn)); });
    const list = [];
    const seen = new Set();
    (db.projects || []).forEach(function (p) { if (!seen.has(keyOf(p.ma))) { seen.add(keyOf(p.ma)); list.push({ ma: p.ma, ten: p.ten, trangThai: p.trangThai || '', inCatalog: true }); } });
    (db.costs || []).forEach(function (c) {
      const k = keyOf(c.maCT);
      if (k && !seen.has(k)) { seen.add(k); list.push({ ma: String(c.maCT).trim(), ten: '(Chưa có trong danh mục)', trangThai: '', inCatalog: false }); }
    });
    const rows = [];
    list.forEach(function (p) {
      const k = keyOf(p.ma);
      const coCP = coChiPhi.has(k);
      if (!coCP && !(f.all && coThuChi.has(k))) return;
      const d = supplierDebt(db, { ct: p.ma, to: f.to, ncc: f.ncc });
      if (onlyNcc && !d.rows.some(function (r) { return r.soDongCP || r.soDongTT || r.soDongDK; })) return;
      const t = d.totalAll;
      let chiKhac = 0;
      let thuCT = 0;
      (db.entries || []).forEach(function (e) {
        if (onlyNcc || keyOf(e.maDuAn) !== k || (f.to && e.ngay > f.to)) return;
        if (!e.maNCC) chiKhac += (e.chi || 0) - (e.thu || 0);
        thuCT += e.thu || 0;
      });
      // Công trình chưa nhập chi phí: chỉ có số đã trả; không tính nợ / ứng dư (sẽ ra "ứng dư" toàn bộ, sai ý nghĩa)
      rows.push({
        ma: p.ma, ten: p.ten, trangThai: p.trangThai, inCatalog: p.inCatalog, coChiPhi: coCP,
        dauKy: t.dauKy, phatSinh: t.phatSinh, daTra: t.daTra, conNo: coCP ? t.conNo : 0, ungDu: coCP ? t.ungDu : 0, conLai: coCP ? t.conLai : 0, chiKhac: chiKhac,
        tiLeDaTra: t.dauKy + t.phatSinh > 0 ? t.daTra / (t.dauKy + t.phatSinh) : null,
        soNCCNo: coCP ? d.rows.filter(function (r) { return r.conLai > 0; }).length : 0,
        soNCCDu: coCP ? d.rows.filter(function (r) { return r.conLai < 0; }).length : 0
      });
    });
    const total = rows.reduce(function (s, r) {
      ['dauKy', 'phatSinh', 'daTra', 'conNo', 'ungDu', 'conLai', 'chiKhac', 'soNCCNo', 'soNCCDu'].forEach(function (key) { s[key] += r[key]; });
      if (r.coChiPhi) s.daTraCoChiPhi += r.daTra;
      return s;
    }, { dauKy: 0, phatSinh: 0, daTra: 0, daTraCoChiPhi: 0, conNo: 0, ungDu: 0, conLai: 0, chiKhac: 0, soNCCNo: 0, soNCCDu: 0 });
    // % đã thanh toán chỉ tính trên các công trình đã nhập chi phí
    total.tiLeDaTra = total.dauKy + total.phatSinh > 0 ? total.daTraCoChiPhi / (total.dauKy + total.phatSinh) : null;
    // khoản trả cho NCC có chi phí công trình nhưng không ghi mã công trình -> không tính được vào công trình nào
    const nccCP = new Set();
    (db.costs || []).forEach(function (c) { if (c.maNCC) nccCP.add(keyOf(c.maNCC)); });
    let chuaGan = 0;
    let soChuaGan = 0;
    (db.entries || []).forEach(function (e) {
      if (!e.maDuAn && e.maNCC && nccCP.has(keyOf(e.maNCC)) && (!f.to || e.ngay <= f.to) && (!onlyNcc || onlyNcc.has(keyOf(e.maNCC)))) { chuaGan += (e.chi || 0) - (e.thu || 0); soChuaGan++; }
    });
    (db.extPayments || []).forEach(function (p) {
      if (!p.maDuAn && p.maNCC && nccCP.has(keyOf(p.maNCC)) && (!f.to || p.ngay <= f.to) && (!onlyNcc || onlyNcc.has(keyOf(p.maNCC)))) { chuaGan += p.soTien || 0; soChuaGan++; }
    });
    return { rows: rows, total: total, traChuaGanCT: { soTien: chuaGan, soDong: soChuaGan } };
  }

  // Thống kê mua vật tư: số lần, tổng SL, giá thấp/cao/gần nhất, bình quân gia quyền
  // Gợi ý Loại chi phí cho từng hạng mục theo dữ liệu đang có: loại chiếm nhiều tiền nhất trong các dòng của hạng mục;
  // hạng mục chưa có dòng nào mà tên bắt đầu "Nhân công" → Nhân công; còn lại không gợi ý (để Tự xác định). Trả Map mã → loại.
  function goiYLoaiCPHangMuc(db) {
    const acc = new Map();
    (db.costs || []).forEach(function (c) {
      const l = normLoaiCP(c.loaiCP);
      const k = keyOf(c.maHM);
      if (!l || !k) return;
      const a = acc.get(k) || {};
      a[l] = (a[l] || 0) + Math.abs(Number(c.thanhTien) || 0) + 0.001; // + một chút theo số dòng để phân xử khi bằng tiền
      acc.set(k, a);
    });
    const out = new Map();
    (db.costItems || []).forEach(function (it) {
      const a = acc.get(keyOf(it.ma));
      let best = '';
      if (a) best = Object.keys(a).sort(function (x, y) { return a[y] - a[x] || (x < y ? -1 : 1); })[0];
      else if (normalizeText(it.ten).indexOf('nhan cong') === 0) best = 'Nhân công';
      if (best) out.set(it.ma, best);
    });
    return out;
  }

  function materialStats(db, f) {
    f = f || {};
    const acc = new Map();
    const ledger = (db.costs || []).slice().sort(compareEntries);
    ledger.forEach(function (c) {
      if (!c.maVT) return;
      if (!inRange(c.ngay, f.from, f.to)) return;
      if (f.ct && keyOf(c.maCT) !== keyOf(f.ct)) return;
      if (f.ncc && keyOf(c.maNCC) !== keyOf(f.ncc)) return;
      const k = keyOf(c.maVT);
      let a = acc.get(k);
      if (!a) { a = { ma: String(c.maVT).trim(), soLan: 0, tongSL: 0, tongTien: 0, tienCoGia: 0, min: Infinity, max: -Infinity, last: null, lastNgay: '', lastNCC: '', nccs: new Set() }; acc.set(k, a); }
      a.soLan++;
      a.tongTien += c.thanhTien || 0;
      // dòng theo khoản không có số lượng / đơn giá: tính vào tổng tiền, không vào thống kê giá
      if (!isKhoan(c)) {
        a.tongSL = round4(a.tongSL + (Number(c.soLuong) || 0));
        a.tienCoGia += c.thanhTien || 0;
        const dg = Number(c.donGia) || 0;
        if (dg < a.min) a.min = dg;
        if (dg > a.max) a.max = dg;
        a.last = dg;
      }
      a.lastNgay = c.ngay;
      a.lastNCC = c.maNCC || '';
      if (c.maNCC) a.nccs.add(keyOf(c.maNCC));
    });
    const mIdx = indexBy(db.materials);
    const iIdx = indexBy(db.costItems);
    const rows = [];
    acc.forEach(function (a, k) {
      const m = mIdx.get(k);
      const it = m ? iIdx.get(keyOf(m.maHM)) : null;
      rows.push({
        ma: a.ma, ten: m ? m.ten : '', dvt: m ? (m.dvt || '') : '', maHM: m ? (m.maHM || '') : '', tenHM: it ? it.ten : '',
        soLan: a.soLan, tongSL: a.tongSL, tongTien: a.tongTien, min: a.min === Infinity ? null : a.min, max: a.max === -Infinity ? null : a.max,
        last: a.last, lastNgay: a.lastNgay, lastNCC: a.lastNCC,
        binhQuan: a.tongSL ? Math.round(a.tienCoGia / a.tongSL) : 0, soNCC: a.nccs.size, inCatalog: !!m
      });
    });
    return rows;
  }

  // Lịch sử đơn giá của 1 vật tư (cũ -> mới); chênh lệch so với lần mua trước cùng NCC
  function priceHistory(db, maVT) {
    const sIdx = indexBy(db.suppliers);
    const prevByNcc = new Map();
    return (db.costs || []).filter(function (c) { return keyOf(c.maVT) === keyOf(maVT) && !isKhoan(c); }).sort(compareEntries).map(function (c) {
      const k = keyOf(c.maNCC);
      const prev = prevByNcc.get(k);
      prevByNcc.set(k, Number(c.donGia) || 0);
      const s = sIdx.get(k);
      return {
        id: c.id, ngay: c.ngay, maNCC: c.maNCC || '', tenNCC: s ? s.ten : '', maCT: c.maCT || '', soLuong: c.soLuong, donGia: c.donGia,
        thanhTien: c.thanhTien, dienGiai: c.dienGiai || '', soPhieu: c.soPhieu || '', phieuId: c.phieuId,
        chenhLech: prev === undefined ? null : (Number(c.donGia) || 0) - prev
      };
    });
  }

  // Đơn giá lần mua gần nhất: ưu tiên cùng NCC, không có thì lấy của NCC bất kỳ
  function lastPrice(db, maVT, maNCC) {
    if (!String(maVT || '').trim()) return null;
    let best = null;
    let bestSame = null;
    (db.costs || []).forEach(function (c) {
      if (keyOf(c.maVT) !== keyOf(maVT) || isKhoan(c)) return; // dòng theo khoản không có đơn giá để gợi ý
      if (!best || compareEntries(c, best) > 0) best = c;
      if (maNCC && keyOf(c.maNCC) === keyOf(maNCC) && (!bestSame || compareEntries(c, bestSame) > 0)) bestSame = c;
    });
    const r = bestSame || best;
    return r ? { donGia: Number(r.donGia) || 0, ngay: r.ngay, maNCC: r.maNCC || '', cungNCC: !!bestSame } : null;
  }

  // Gom các dòng cùng phieuId thành phiếu nhập (tương đương 1 lần chạy macro GhiPhieuNhap)
  function costSlips(db, ledger) {
    ledger = ledger || buildCostLedger(db);
    const map = new Map();
    ledger.forEach(function (r) {
      const k = r.phieuId ? String(r.phieuId) : 'd' + r.id;
      let s = map.get(k);
      if (!s) {
        s = { key: k, phieuId: r.phieuId || null, ngay: r.ngay, maCT: r.maCT || '', tenCT: r.tenCT, maNha: r.maNha || '', maNCC: r.maNCC || '', tenNCC: r.tenNCC,
          soPhieu: r.soPhieu || '', lines: [], total: 0, hangMuc: new Set(), dsCT: new Set(), lastSeq: 0 };
        map.set(k, s);
      }
      s.lines.push(r);
      s.total += r.thanhTien || 0;
      if (r.tenHM) s.hangMuc.add(r.tenHM);
      if (r.maCT) s.dsCT.add(r.maCT);
      if ((r.seq || 0) > s.lastSeq) s.lastSeq = r.seq || 0;
    });
    const list = Array.from(map.values()).map(function (s) {
      s.hangMuc = Array.from(s.hangMuc);
      s.dsCT = Array.from(s.dsCT); // các công trình có dòng trong phiếu (phiếu nhiều công trình có > 1)
      return s;
    });
    list.sort(function (a, b) {
      if (a.ngay !== b.ngay) return a.ngay < b.ngay ? 1 : -1;
      return b.lastSeq - a.lastSeq;
    });
    return list;
  }

  // Kiểm tra danh mục (ô "Kiểm tra danh mục" trên TONGHOP)
  function costCatalogCheck(db) {
    const x = costIndexes(db);
    const out = { hmThieuNhom: [], dongHmLa: 0, dongVtLa: 0, dongNccLa: 0, dongCtLa: 0, dongNhaLa: 0 };
    (db.costItems || []).forEach(function (it) { if (!x.g.get(keyOf(it.maNhom))) out.hmThieuNhom.push(it.ten || it.ma); });
    (db.costs || []).forEach(function (c) {
      if (!x.i.get(keyOf(c.maHM))) out.dongHmLa++;
      if (c.maVT && !x.m.get(keyOf(c.maVT))) out.dongVtLa++;
      if (c.maNCC && !x.s.get(keyOf(c.maNCC))) out.dongNccLa++;
      if (c.maCT && !x.p.get(keyOf(c.maCT))) out.dongCtLa++;
      if (c.maNha && !x.h.get(keyOf(c.maNha))) out.dongNhaLa++;
    });
    out.ok = !out.hmThieuNhom.length && !out.dongHmLa && !out.dongVtLa && !out.dongNccLa && !out.dongCtLa && !out.dongNhaLa;
    return out;
  }

  /* ---------------- Độ chính xác và truy vết (nhóm 1) ---------------- */

  // Trạng thái chứng từ: 'nhap' = Nháp (chưa ghi sổ). Không có trường trangThai = Đã ghi sổ (mọi dữ liệu cũ).
  function isDraft(x) { return !!x && x.trangThai === 'nhap'; }
  const TRANG_THAI = { nhap: 'Nháp', so: 'Đã ghi sổ' };

  // Dữ liệu dùng cho báo cáo, tồn quỹ, công nợ: bỏ các dòng Nháp.
  // Không có dòng nháp nào thì trả lại đúng đối tượng db (số liệu và tốc độ như trước khi có tính năng này).
  function postedDb(db) {
    const hasDraft = (db.entries || []).some(isDraft) || (db.costs || []).some(isDraft);
    if (!hasDraft) return db;
    return Object.assign({}, db, {
      entries: (db.entries || []).filter(function (e) { return !isDraft(e); }),
      costs: (db.costs || []).filter(function (c) { return !isDraft(c); })
    });
  }

  // Khóa sổ theo tháng: db.locks = [{ thang: 'yyyy-mm', at, by }]
  function lockedMonths(db) {
    return new Set((db.locks || []).map(function (l) { return l.thang; }));
  }
  function monthOf(ngay) { return String(ngay || '').slice(0, 7); }
  function monthLabel(thang) { return /^\d{4}-\d{2}$/.test(thang) ? thang.slice(5) + '/' + thang.slice(0, 4) : String(thang || ''); }
  function isLockedDate(db, ngay) {
    if (!db.locks || !db.locks.length || !ngay) return false;
    return lockedMonths(db).has(monthOf(ngay));
  }
  function lockMessage(thang, verb) {
    return 'Tháng ' + monthLabel(thang) + ' đã khóa sổ nên không ' + (verb || 'sửa') + ' được. Muốn ' + (verb || 'sửa') +
      ': vào Kiểm soát sổ sách → Khóa sổ, bấm “Mở khóa” tháng ' + monthLabel(thang) + ' (cần ghi lý do, có lưu nhật ký).';
  }

  /* ---------------- Kiểm tra bất thường ("Cần xử lý") ---------------- */

  const ANOMALY_TYPES = {
    trung: 'Nghi trùng',
    gia: 'Đơn giá lệch nhiều so với giá thường mua',
    ngay: 'Ngày bất thường',
    vt: 'Vật tư chưa xác định / chưa phân loại',
    thieu: 'Thiếu hạng mục hoặc mã chưa có trong danh mục',
    nhap: 'Phiếu nháp để lâu chưa ghi sổ',
    tien: 'Số tiền âm hoặc bằng 0',
    quy: 'Kiểm quỹ có chênh lệch',
    congno: 'Công nợ nhà cung cấp cần xem lại',
    thuchi: 'Sổ thu chi cần xem lại',
    chiphi: 'Sổ chi phí cần xem lại'
  };
  const ANOMALY_DEFAULTS = { nguongLechGia: 30, soNgayNhapTon: 7, soNgayTuongLai: 7, soNgayLechNhap: 180, soNgayNoLau: 90, nguongChiLon: 5000000 };

  function addDays(iso, n) {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  // Phát hiện bất thường trên toàn bộ dữ liệu (kể cả dòng nháp). opts: { today, ignored: { key: {...} } } + ngưỡng trong db.settings.
  // Trả về { items: [{ key, loai, tieuDe, chiTiet, ngay, soTien, target: { kind, id, phieuId, ma } , ignored }], counts, open }
  function anomalies(db, opts) {
    opts = opts || {};
    const st = Object.assign({}, ANOMALY_DEFAULTS, db.settings || {});
    const nguong = Math.max(1, Number(st.nguongLechGia) || ANOMALY_DEFAULTS.nguongLechGia) / 100;
    const today = opts.today || todayISO();
    const ignored = opts.ignored || db.ignoredWarnings || {};
    const items = [];
    const x = costIndexes(db);
    const push = function (it) { it.ignored = !!ignored[it.key]; items.push(it); };
    const ent = db.entries || [];
    const costs = db.costs || [];
    const moneyTxt = function (n) { return fmtMoney(n) + ' đ'; };
    const median = function (arr) { const a = arr.slice().sort(function (p, q) { return p - q; }); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
    const nccName = function (ma) { const s = x.s.get(keyOf(ma)); return s ? s.ten : ma; };

    // (a) nghi trùng: cùng ngày + NCC + vật tư (hoặc diễn giải) + thành tiền; sổ thu chi: cùng ngày + NCC (hoặc nội dung) + số tiền
    const groups = new Map();
    costs.forEach(function (c) {
      const k = 'c|' + c.ngay + '|' + keyOf(c.maNCC) + '|' + (keyOf(c.maVT) || normalizeText(c.dienGiai).trim()) + '|' + c.thanhTien;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    });
    ent.forEach(function (e) {
      if (!(e.thu > 0 || e.chi > 0)) return;
      const k = 'e|' + e.ngay + '|' + (keyOf(e.maNCC) || normalizeText(e.noiDung).trim()) + '|' + (e.thu || 0) + '|' + (e.chi || 0);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    });
    groups.forEach(function (list, k) {
      if (list.length < 2) return;
      const isCost = k.charAt(0) === 'c';
      const ids = list.map(function (r) { return r.id; }).sort(function (a, b) { return a - b; });
      const r0 = list[0];
      push({
        key: 'trung:' + (isCost ? 'c' : 'e') + ':' + ids.join(','), loai: 'trung', ngay: r0.ngay, soTien: isCost ? r0.thanhTien : (r0.chi || r0.thu),
        tieuDe: list.length + (isCost ? ' dòng chi phí' : ' dòng sổ thu chi') + ' giống nhau ngày ' + fmtDate(r0.ngay),
        chiTiet: (isCost ? (r0.maVT || r0.dienGiai) + ' · ' + nccName(r0.maNCC) + ' · ' + moneyTxt(r0.thanhTien) + ' mỗi dòng'
          : (r0.noiDung || '') + (r0.maNCC ? ' · ' + nccName(r0.maNCC) : '') + ' · ' + moneyTxt(r0.chi || r0.thu) + ' mỗi dòng') +
          (isCost && new Set(list.map(function (c) { return c.phieuId; })).size > 1 ? ' · ở ' + new Set(list.map(function (c) { return c.phieuId; })).size + ' phiếu khác nhau' : ''),
        target: { kind: isCost ? 'costs' : 'entries', id: ids[ids.length - 1], ids: ids, phieuId: r0.phieuId }
      });
    });

    // (b) đơn giá lệch nhiều so với lần mua trước cùng vật tư + NCC (bỏ các mã chung "XX-..." như XX-KHAC)
    const byVtNcc = new Map();
    costs.forEach(function (c) {
      if (!c.maVT || /^xx-/i.test(String(c.maVT).trim()) || !(c.donGia > 0)) return;
      const k = keyOf(c.maVT) + '|' + keyOf(c.maNCC);
      if (!byVtNcc.has(k)) byVtNcc.set(k, []);
      byVtNcc.get(k).push(c);
    });
    // So với giá "thường gặp": từ 3 lần mua trở lên lấy trung vị các lần mua khác (không bị kéo lệch bởi chính dòng sai);
    // chỉ có 2 lần thì so lần sau với lần trước.
    byVtNcc.forEach(function (list) {
      list.sort(compareEntries);
      const prices = list.map(function (c) { return c.donGia; });
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        let ref;
        let refTxt;
        if (list.length >= 3) {
          ref = median(prices.slice(0, i).concat(prices.slice(i + 1)));
          refTxt = 'Giá thường gặp (trung vị ' + (list.length - 1) + ' lần mua khác): ' + fmtMoney(Math.round(ref));
        } else if (i > 0) {
          ref = list[i - 1].donGia;
          refTxt = 'Lần mua trước ' + fmtDate(list[i - 1].ngay) + ': ' + fmtMoney(ref);
        } else continue;
        if (!(ref > 0)) continue;
        const r = c.donGia / ref;
        if (Math.abs(r - 1) <= nguong + 1e-9) continue;
        const pct = Math.round((r - 1) * 100);
        push({
          key: 'gia:' + c.id + ':' + c.donGia, loai: 'gia', ngay: c.ngay, soTien: c.thanhTien,
          tieuDe: c.maVT + ' ngày ' + fmtDate(c.ngay) + ' giá ' + fmtMoney(c.donGia) + ' — ' + (pct > 0 ? 'cao hơn ' : 'thấp hơn ') + Math.abs(pct).toLocaleString('vi-VN') + '%',
          chiTiet: refTxt + ' · ' + nccName(c.maNCC) + ' · ngưỡng ' + Math.round(nguong * 100) + '%',
          target: { kind: 'costs', id: c.id, phieuId: c.phieuId }
        });
      }
    });

    // (c) ngày bất thường: ở tương lai, trước năm 2000, hoặc khác xa các dòng được nhập liền trước / liền sau
    //     (theo thứ tự nhập: gõ nhầm năm 2062, 2025 giữa các dòng 2026 sẽ lộ ra; dữ liệu cũ nhập từ Excel theo thứ tự ngày thì không bị báo)
    const future = addDays(today, Number(st.soNgayTuongLai) || ANOMALY_DEFAULTS.soNgayTuongLai);
    const lech = (Number(st.soNgayLechNhap) || ANOMALY_DEFAULTS.soNgayLechNhap) * 86400000;
    const neighborMedian = function (list, groupOf) {
      const bySeq = list.filter(function (r) { return isISODate(r.ngay); }).slice().sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); });
      const out = new Map();
      bySeq.forEach(function (r, i) {
        const g = groupOf(r);
        const ds = [];
        for (let j = i - 1; j >= 0 && ds.length < 3; j--) if (!g || groupOf(bySeq[j]) !== g) ds.push(Date.parse(bySeq[j].ngay));
        const n0 = ds.length;
        for (let j = i + 1; j < bySeq.length && ds.length < n0 + 3; j++) if (!g || groupOf(bySeq[j]) !== g) ds.push(Date.parse(bySeq[j].ngay));
        if (ds.length >= 3) out.set(r, median(ds));
      });
      return out;
    };
    const medE = neighborMedian(ent, function (e) { return e.soPhieu ? 'p' + voucherKey(e.soPhieu) : ''; });
    const medC = neighborMedian(costs, function (c) { return 's' + c.phieuId; });
    function checkDate(r, kind) {
      if (!r.ngay) return;
      let why = '';
      if (r.ngay > future) why = 'Ngày ' + fmtDate(r.ngay) + ' ở tương lai';
      else if (r.ngay < '2000-01-01') why = 'Ngày ' + fmtDate(r.ngay) + ' quá xa (trước năm 2000)';
      else {
        const md = (kind === 'costs' ? medC : medE).get(r);
        if (md != null && Math.abs(Date.parse(r.ngay) - md) > lech) {
          why = 'Ngày ' + fmtDate(r.ngay) + ' khác xa các dòng nhập liền trước và liền sau (khoảng ' + fmtDate(new Date(md).toISOString().slice(0, 10)) + ') — có gõ nhầm năm/tháng?';
        }
      }
      if (!why) return;
      push({ key: 'ngay:' + kind + ':' + r.id + ':' + r.ngay, loai: 'ngay', ngay: r.ngay, soTien: kind === 'costs' ? r.thanhTien : (r.chi || r.thu),
        tieuDe: why, chiTiet: kind === 'costs' ? (r.maVT || r.dienGiai) + ' · ' + moneyTxt(r.thanhTien) : (r.noiDung || '') + ' · ' + moneyTxt(r.chi || r.thu),
        target: { kind: kind, id: r.id, phieuId: r.phieuId } });
    }
    ent.forEach(function (e) { checkDate(e, 'entries'); });
    costs.forEach(function (c) { checkDate(c, 'costs'); });

    // (d) vật tư chưa xác định (mã XX-CHUAXACDINH...) và vật tư chưa phân loại (chưa gán hạng mục)
    costs.forEach(function (c) {
      if (!/chuaxacdinh|chua-xac-dinh/.test(normalizeText(c.maVT).replace(/[\s_]/g, ''))) return;
      push({ key: 'vt:c:' + c.id + ':' + keyOf(c.maVT), loai: 'vt', ngay: c.ngay, soTien: c.thanhTien, tieuDe: 'Dòng chi phí dùng mã ' + c.maVT,
        chiTiet: (c.dienGiai || '') + ' · ' + nccName(c.maNCC) + ' · ' + moneyTxt(c.thanhTien) + ' — chọn đúng mã vật tư', target: { kind: 'costs', id: c.id, phieuId: c.phieuId } });
    });
    const usedVT = new Set(costs.map(function (c) { return keyOf(c.maVT); }));
    (db.materials || []).forEach(function (m) {
      if (m.maHM && x.i.get(keyOf(m.maHM))) return;
      if (!usedVT.has(keyOf(m.ma))) return; // chỉ nhắc vật tư đang được dùng
      push({ key: 'vt:m:' + keyOf(m.ma), loai: 'vt', ngay: '', soTien: 0, tieuDe: 'Vật tư ' + m.ma + ' chưa phân loại (chưa gán hạng mục)',
        chiTiet: (m.ten || '') + (m.maHM ? ' · hạng mục "' + m.maHM + '" không có trong danh mục' : ''), target: { kind: 'materials', ma: m.ma, id: m.id } });
    });

    // (e) chi phí chưa gán hạng mục; mã NCC / công trình chưa có trong danh mục
    costs.forEach(function (c) {
      const miss = [];
      if (!c.maHM) miss.push('chưa gán hạng mục');
      else if (!x.i.get(keyOf(c.maHM))) miss.push('hạng mục "' + c.maHM + '" không có trong danh mục');
      if (!c.maNCC) miss.push('chưa có nhà cung cấp');
      else if (!x.s.get(keyOf(c.maNCC))) miss.push('NCC "' + c.maNCC + '" chưa có trong danh mục');
      if (c.maCT && !x.p.get(keyOf(c.maCT))) miss.push('công trình "' + c.maCT + '" chưa có trong danh mục');
      if (!miss.length) return;
      push({ key: 'thieu:c:' + c.id + ':' + [c.maHM, c.maNCC, c.maCT].map(keyOf).join('|'), loai: 'thieu', ngay: c.ngay, soTien: c.thanhTien,
        tieuDe: 'Dòng chi phí ' + miss.join(', '), chiTiet: (c.maVT || c.dienGiai || '') + ' · ' + moneyTxt(c.thanhTien), target: { kind: 'costs', id: c.id, phieuId: c.phieuId } });
    });
    ent.forEach(function (e) {
      const miss = [];
      if (e.maNCC && !x.s.get(keyOf(e.maNCC))) miss.push('NCC "' + e.maNCC + '" chưa có trong danh mục');
      if (e.maDuAn && !x.p.get(keyOf(e.maDuAn))) miss.push('công trình "' + e.maDuAn + '" chưa có trong danh mục');
      if (!miss.length) return;
      push({ key: 'thieu:e:' + e.id + ':' + keyOf(e.maNCC) + '|' + keyOf(e.maDuAn), loai: 'thieu', ngay: e.ngay, soTien: e.chi || e.thu,
        tieuDe: 'Dòng sổ thu chi: ' + miss.join(', '), chiTiet: (e.noiDung || '') + ' · ' + moneyTxt(e.chi || e.thu), target: { kind: 'entries', id: e.id } });
    });

    // (f) phiếu nháp để lâu
    const han = addDays(today, -(Number(st.soNgayNhapTon) || ANOMALY_DEFAULTS.soNgayNhapTon));
    ent.forEach(function (e) {
      if (!isDraft(e) || !(String(e.createdAt || '').slice(0, 10) < han)) return;
      push({ key: 'nhap:e:' + e.id, loai: 'nhap', ngay: e.ngay, soTien: e.chi || e.thu, tieuDe: 'Dòng nháp từ ' + fmtDate(String(e.createdAt).slice(0, 10)) + ' chưa ghi sổ',
        chiTiet: (e.noiDung || '') + ' · ' + moneyTxt(e.chi || e.thu), target: { kind: 'entries', id: e.id } });
    });
    const draftSlips = new Map();
    costs.forEach(function (c) { if (isDraft(c) && String(c.createdAt || '').slice(0, 10) < han && !draftSlips.has(c.phieuId)) draftSlips.set(c.phieuId, c); });
    draftSlips.forEach(function (c, pid) {
      const lines = costs.filter(function (y) { return y.phieuId === pid; });
      push({ key: 'nhap:s:' + pid, loai: 'nhap', ngay: c.ngay, soTien: lines.reduce(function (t, y) { return t + (y.thanhTien || 0); }, 0),
        tieuDe: 'Phiếu nhập nháp từ ' + fmtDate(String(c.createdAt).slice(0, 10)) + ' chưa ghi sổ', chiTiet: lines.length + ' dòng · ' + nccName(c.maNCC), target: { kind: 'slip', phieuId: pid, id: c.id } });
    });

    // (g) thu / chi âm hoặc bằng 0
    ent.forEach(function (e) {
      const bad = (e.thu || 0) < 0 || (e.chi || 0) < 0 ? 'Số tiền âm' : !(e.thu > 0) && !(e.chi > 0) ? 'Không có số tiền (thu và chi đều bằng 0)' : '';
      if (!bad) return;
      push({ key: 'tien:e:' + e.id + ':' + (e.thu || 0) + ':' + (e.chi || 0), loai: 'tien', ngay: e.ngay, soTien: e.chi || e.thu, tieuDe: 'Dòng sổ thu chi: ' + bad,
        chiTiet: (e.noiDung || '') + ' · ngày ' + fmtDate(e.ngay), target: { kind: 'entries', id: e.id } });
    });
    costs.forEach(function (c) {
      if ((c.thanhTien || 0) > 0 && (isKhoan(c) || (c.soLuong || 0) > 0)) return;
      push({ key: 'tien:c:' + c.id + ':' + c.thanhTien, loai: 'tien', ngay: c.ngay, soTien: c.thanhTien,
        tieuDe: 'Dòng chi phí ' + ((c.thanhTien || 0) < 0 ? 'có thành tiền âm' : 'có thành tiền bằng 0'), chiTiet: (c.maVT || c.dienGiai || '') + ' · ' + (isKhoan(c) ? 'theo khoản' : fmtQty(c.soLuong) + ' × ' + fmtMoney(c.donGia)),
        target: { kind: 'costs', id: c.id, phieuId: c.phieuId } });
    });

    // (h) kiểm quỹ có chênh lệch (tồn quỹ theo sổ tính lại theo dữ liệu hiện tại)
    (db.cashCounts || []).forEach(function (k) {
      const so = cashBalanceAt(db, k.ngay);
      const cl = (Number(k.thucTe) || 0) - so;
      if (!cl) return;
      push({ key: 'quy:' + k.id + ':' + cl, loai: 'quy', ngay: k.ngay, soTien: cl,
        tieuDe: 'Kiểm quỹ ngày ' + fmtDate(k.ngay) + ' ' + (cl > 0 ? 'thừa ' : 'thiếu ') + fmtMoney(Math.abs(cl)) + ' đ',
        chiTiet: 'Thực tế ' + moneyTxt(k.thucTe) + ', theo sổ ' + moneyTxt(so), target: { kind: 'cashCounts', id: k.id } });
    });

    // (i) công nợ nhà cung cấp (chỉ dòng đã ghi sổ)
    const P = postedDb(db);
    // NCC có công nợ (chi phí hoặc số dư đầu kỳ) và các cặp NCC|công trình hợp lệ (chi phí, số dư đầu kỳ, khoản trả ngoài quỹ)
    const soDu = db.soDuDauKy || [];
    const nccCoCP = new Set(P.costs.map(function (c) { return keyOf(c.maNCC); }).concat(soDu.map(function (r) { return keyOf(r.maNCC); })).filter(Boolean));
    const capCP = new Set(P.costs.map(function (c) { return keyOf(c.maNCC) + '|' + keyOf(c.maCT); })
      .concat(soDu.map(function (r) { return keyOf(r.maNCC) + '|' + keyOf(r.maDuAn); }))
      .concat((P.extPayments || []).map(function (r) { return keyOf(r.maNCC) + '|' + keyOf(r.maDuAn); })));
    const ctName = function (ma) { const p = x.p.get(keyOf(ma)); return p ? ma + ' – ' + p.ten : ma; };
    P.entries.forEach(function (e) {
      const tra = (e.chi || 0) - (e.thu || 0);
      if (!(tra > 0) || !e.maNCC || !nccCoCP.has(keyOf(e.maNCC))) return;
      if (!e.maDuAn) {
        push({ key: 'congno:khongct:' + e.id, loai: 'congno', ngay: e.ngay, soTien: tra,
          tieuDe: 'Trả ' + nccName(e.maNCC) + ' ' + moneyTxt(tra) + ' nhưng chưa ghi công trình',
          chiTiet: (e.soPhieu ? e.soPhieu + ' · ' : '') + (e.noiDung || '') + ' — khoản trả không trừ vào công nợ công trình nào; chọn công trình (hoặc chia nhiều dòng)', target: { kind: 'entries', id: e.id } });
      } else if (!capCP.has(keyOf(e.maNCC) + '|' + keyOf(e.maDuAn))) {
        push({ key: 'congno:saict:' + e.id + ':' + keyOf(e.maDuAn), loai: 'congno', ngay: e.ngay, soTien: tra,
          tieuDe: 'Trả ' + nccName(e.maNCC) + ' cho công trình ' + e.maDuAn + ' nhưng NCC này không có chi phí ở công trình đó',
          chiTiet: (e.soPhieu ? e.soPhieu + ' · ' : '') + (e.noiDung || '') + ' · ' + moneyTxt(tra) + ' — có ghi nhầm công trình?', target: { kind: 'entries', id: e.id } });
      }
    });
    const soNgayNo = Number(st.soNgayNoLau) || ANOMALY_DEFAULTS.soNgayNoLau;
    const noLau = addDays(today, -soNgayNo);
    // một lượt qua dữ liệu: các khoản ghi nợ (chi phí, số dư đầu kỳ dương) và lần trả gần nhất của từng NCC
    const ghiNo = new Map();
    const lanTra = new Map();
    const themNo = function (ma, ngay, tien) {
      const k = keyOf(ma);
      if (!k || !(tien > 0)) return;
      if (!ghiNo.has(k)) ghiNo.set(k, []);
      ghiNo.get(k).push({ ngay: ngay || '', tien: tien });
    };
    P.costs.forEach(function (c) { themNo(c.maNCC, c.ngay, c.thanhTien || 0); });
    soDu.forEach(function (r) { themNo(r.maNCC, r.ngay, Number(r.soTien) || 0); });
    const ghiTra = function (ma, ngay) { const k = keyOf(ma); if (k && ngay && !(lanTra.get(k) >= ngay)) lanTra.set(k, ngay); };
    P.entries.forEach(function (e) { if ((e.chi || 0) > (e.thu || 0)) ghiTra(e.maNCC, e.ngay); });
    (P.extPayments || []).forEach(function (p) { ghiTra(p.maNCC, p.ngay); });
    supplierDebt(P, {}).rows.forEach(function (r) {
      if (!r.inCatalog && !x.s.get(keyOf(r.ma))) return;
      if (r.conLai < 0) {
        push({ key: 'congno:ungdu:' + keyOf(r.ma) + ':' + r.conLai, loai: 'congno', ngay: '', soTien: -r.conLai,
          tieuDe: 'Đã trả ' + nccName(r.ma) + ' nhiều hơn chi phí ' + moneyTxt(-r.conLai) + ' (Dư Nợ)',
          chiTiet: 'Chi phí ' + moneyTxt(r.phatSinh + (r.dauKy || 0)) + ', đã trả ' + moneyTxt(r.daTra) + ' — thiếu phiếu nhập chi phí, hay trả nhầm / ghi trùng?', target: { kind: 'ncc', ma: r.ma } });
        return;
      }
      if (!(r.conLai > 0)) return;
      // tuổi nợ kiểu nhập trước trả trước: tiền đã trả trừ dần vào các khoản ghi nợ cũ nhất, phần còn lại là nợ chưa trả
      const ds = (ghiNo.get(keyOf(r.ma)) || []).slice().sort(function (a, b) { return a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : 0; });
      let daTru = ds.reduce(function (t, d) { return t + d.tien; }, 0) - r.conLai;
      let quaHan = 0;
      let tuNgay = '';
      ds.forEach(function (d) {
        const con = Math.max(0, d.tien - Math.max(0, daTru));
        daTru -= d.tien;
        if (con > 0 && d.ngay && d.ngay < noLau) { quaHan += con; if (!tuNgay) tuNgay = d.ngay; }
      });
      if (!(quaHan > 0)) return;
      const lanCuoi = lanTra.get(keyOf(r.ma)) || '';
      push({ key: 'congno:nolau:' + keyOf(r.ma) + ':' + tuNgay, loai: 'congno', ngay: tuNgay, soTien: Math.min(quaHan, r.conLai),
        tieuDe: 'Còn nợ ' + nccName(r.ma) + ' ' + moneyTxt(Math.min(quaHan, r.conLai)) + ' quá ' + soNgayNo + ' ngày (từ ' + fmtDate(tuNgay) + ')',
        chiTiet: 'Tổng còn nợ ' + moneyTxt(r.conLai) + '; ' + (lanCuoi ? 'lần trả gần nhất ' + fmtDate(lanCuoi) : 'chưa trả lần nào'), target: { kind: 'ncc', ma: r.ma } });
    });

    // (k) sổ thu chi
    // ngưỡng 0 hợp lệ (báo mọi khoản chi không đối tượng): chỉ dùng mặc định khi chưa đặt
    const chiLon = st.nguongChiLon !== '' && st.nguongChiLon != null && isFinite(Number(st.nguongChiLon)) ? Number(st.nguongChiLon) : ANOMALY_DEFAULTS.nguongChiLon;
    ent.forEach(function (e) {
      if (isDraft(e)) return;
      if (e.soPhieu) {
        const t = voucherType(e.soPhieu);
        if ((t === 'thu' && e.chi > 0 && !(e.thu > 0)) || (t === 'chi' && e.thu > 0 && !(e.chi > 0))) {
          push({ key: 'thuchi:loai:' + e.id + ':' + voucherKey(e.soPhieu), loai: 'thuchi', ngay: e.ngay, soTien: e.chi || e.thu,
            tieuDe: 'Số phiếu ' + e.soPhieu + ' là phiếu ' + t + ' nhưng dòng là khoản ' + (t === 'thu' ? 'chi' : 'thu'),
            chiTiet: (e.noiDung || '') + ' · ' + moneyTxt(e.chi || e.thu) + ' — phiếu in ra sẽ sai loại; đổi số phiếu (PC… cho chi, PT… cho thu)', target: { kind: 'entries', id: e.id } });
        }
      } else if (e.chi > 0) {
        push({ key: 'thuchi:sophieu:' + e.id, loai: 'thuchi', ngay: e.ngay, soTien: e.chi, tieuDe: 'Khoản chi ' + moneyTxt(e.chi) + ' ngày ' + fmtDate(e.ngay) + ' chưa có số phiếu',
          chiTiet: (e.noiDung || '') + (e.maNCC ? ' · ' + nccName(e.maNCC) : '') + ' — không in được phiếu chi; bấm “Số mới” để lấy số', target: { kind: 'entries', id: e.id } });
      }
      if (e.chi >= chiLon && !e.maNCC && !e.maDuAn) {
        push({ key: 'thuchi:doituong:' + e.id, loai: 'thuchi', ngay: e.ngay, soTien: e.chi, tieuDe: 'Khoản chi lớn ' + moneyTxt(e.chi) + ' chưa ghi nhà cung cấp / đối tượng và công trình',
          chiTiet: (e.soPhieu ? e.soPhieu + ' · ' : '') + (e.noiDung || '') + ' — không tính vào công nợ hay chi phí công trình nào', target: { kind: 'entries', id: e.id } });
      }
    });
    // tồn quỹ âm: xét tồn cuối ngày (trong ngày ghi khoản chi trước khoản thu không tính là âm); báo ngày đầu tiên của mỗi lần âm
    let amTruoc = false;
    const so = buildLedger(P);
    so.forEach(function (r, i) {
      if (so[i + 1] && so[i + 1].ngay === r.ngay) return; // chưa phải dòng cuối ngày
      const am = r.ton < 0;
      if (am && !amTruoc) {
        // mở dòng chi lớn nhất trong ngày để sửa
        let j = i;
        let dong = r;
        while (j >= 0 && so[j].ngay === r.ngay) { if ((so[j].chi || 0) > (dong.chi || 0)) dong = so[j]; j--; }
        push({ key: 'thuchi:am:' + r.ngay + ':' + r.ton, loai: 'thuchi', ngay: r.ngay, soTien: r.ton, tieuDe: 'Tồn quỹ cuối ngày ' + fmtDate(r.ngay) + ' âm ' + moneyTxt(-r.ton),
          chiTiet: 'Khoản chi lớn nhất trong ngày: ' + (dong.soPhieu ? dong.soPhieu + ' · ' : '') + (dong.noiDung || '') + ' — chi nhiều hơn tiền có trong quỹ: thiếu khoản thu, hoặc sai số tiền / ngày?', target: { kind: 'entries', id: dong.id } });
      }
      amTruoc = am;
    });

    // (l) sổ chi phí
    costs.forEach(function (c) {
      const m = c.maVT ? x.m.get(keyOf(c.maVT)) : null;
      const it = m && m.maHM ? x.i.get(keyOf(m.maHM)) : null;
      if (it && keyOf(it.ma) !== keyOf(c.maHM)) {
        push({ key: 'chiphi:hm:' + c.id + ':' + keyOf(c.maHM) + '>' + keyOf(it.ma), loai: 'chiphi', ngay: c.ngay, soTien: c.thanhTien,
          tieuDe: 'Dòng ' + c.maVT + ' ngày ' + fmtDate(c.ngay) + ' nằm ở hạng mục khác hạng mục của vật tư',
          chiTiet: 'Dòng: ' + (x.i.get(keyOf(c.maHM)) ? x.i.get(keyOf(c.maHM)).ten : c.maHM || '(trống)') + ' · vật tư: ' + it.ten + ' — mở để lưu lại theo hạng mục của vật tư', target: { kind: 'costs', id: c.id, phieuId: c.phieuId } });
      }
      if (!c.maCT) {
        push({ key: 'chiphi:ct:' + c.id, loai: 'chiphi', ngay: c.ngay, soTien: c.thanhTien, tieuDe: 'Dòng chi phí chưa có công trình',
          chiTiet: (c.maVT || c.dienGiai || '') + ' · ' + nccName(c.maNCC) + ' · ' + moneyTxt(c.thanhTien), target: { kind: 'costs', id: c.id, phieuId: c.phieuId } });
      }
      if (!isKhoan(c) && c.soLuong > 0 && c.donGia > 0 && Math.abs(costAmount(c.soLuong, c.donGia) - c.thanhTien) > 1) {
        push({ key: 'chiphi:tt:' + c.id + ':' + c.thanhTien, loai: 'chiphi', ngay: c.ngay, soTien: c.thanhTien,
          tieuDe: 'Thành tiền ' + fmtMoney(c.thanhTien) + ' khác Số lượng × Đơn giá (' + fmtMoney(costAmount(c.soLuong, c.donGia)) + ')',
          chiTiet: (c.maVT || c.dienGiai || '') + ' · ' + fmtQty(c.soLuong) + ' × ' + fmtMoney(c.donGia) + ' · ngày ' + fmtDate(c.ngay), target: { kind: 'costs', id: c.id, phieuId: c.phieuId } });
      }
    });

    const counts = {};
    let open = 0;
    Object.keys(ANOMALY_TYPES).forEach(function (t) { counts[t] = 0; });
    items.forEach(function (it) { if (!it.ignored) { counts[it.loai]++; open++; } });
    return { items: items, counts: counts, open: open };
  }

  // Tồn quỹ theo sổ (chỉ dòng đã ghi sổ) tính đến hết ngày
  function cashBalanceAt(db, ngay) {
    let t = 0;
    (db.entries || []).forEach(function (e) { if (!isDraft(e) && e.ngay <= ngay) t += (e.thu || 0) - (e.chi || 0); });
    return t;
  }

  function draftsOf(db) {
    return { entries: (db.entries || []).filter(isDraft), costs: (db.costs || []).filter(isDraft) };
  }

  return {
    isDraft: isDraft,
    TRANG_THAI: TRANG_THAI,
    postedDb: postedDb,
    draftsOf: draftsOf,
    lockedMonths: lockedMonths,
    monthOf: monthOf,
    monthLabel: monthLabel,
    isLockedDate: isLockedDate,
    lockMessage: lockMessage,
    ANOMALY_TYPES: ANOMALY_TYPES,
    ANOMALY_DEFAULTS: ANOMALY_DEFAULTS,
    anomalies: anomalies,
    cashBalanceAt: cashBalanceAt,
    docSo: docSo,
    docTienBangChu: docTienBangChu,
    fmtMoney: fmtMoney,
    parseAmount: parseAmount,
    todayISO: todayISO,
    isISODate: isISODate,
    fmtDate: fmtDate,
    ngayChu: ngayChu,
    inRange: inRange,
    keyOf: keyOf,
    indexBy: indexBy,
    projectName: projectName,
    compareEntries: compareEntries,
    buildLedger: buildLedger,
    filterLedger: filterLedger,
    normalizeText: normalizeText,
    budgetStatus: budgetStatus,
    STATUS_TEXT: STATUS_TEXT,
    projectSummary: projectSummary,
    supplierSummary: supplierSummary,
    voucherKey: voucherKey,
    voucherType: voucherType,
    buildVouchers: buildVouchers,
    nextVoucherNo: nextVoucherNo,
    DANH_SO: DANH_SO,
    LOAI_SO: LOAI_SO,
    danhSoCfg: danhSoCfg,
    hauToTheoNgay: hauToTheoNgay,
    kyDanhSo: kyDanhSo,
    soChungTu: soChungTu,
    soChungTuTiep: soChungTuTiep,
    periodRange: periodRange,
    periodUnit: periodUnit,
    periodShift: periodShift,
    periodLabel: periodLabel,
    describeRange: describeRange,
    // Chi phí công trình
    LOAI_CP: LOAI_CP,
    DEBT_TEXT: DEBT_TEXT,
    round4: round4,
    normLoaiCP: normLoaiCP,
    parseQty: parseQty,
    fmtQty: fmtQty,
    costAmount: costAmount,
    MERGE_LISTS: MERGE_LISTS,
    isMerged: isMerged,
    activeDb: activeDb,
    aliasIndex: aliasIndex,
    resolveAlias: resolveAlias,
    costFromInput: costFromInput,
    isKhoan: isKhoan,
    laKhoanCu: laKhoanCu,
    khoanCu: khoanCu,
    syncCostInputs: syncCostInputs,
    findCostItem: findCostItem,
    defaultLoaiCP: defaultLoaiCP,
    buildCostLedger: buildCostLedger,
    filterCosts: filterCosts,
    costSummary: costSummary,
    supplierDebt: supplierDebt,
    debtOf: debtOf,
    supplierPeriod: supplierPeriod,
    projectDebtSummary: projectDebtSummary,
    supplierDebtByProject: supplierDebtByProject,
    doiChieuCongNo: doiChieuCongNo,
    materialStats: materialStats,
    goiYLoaiCPHangMuc: goiYLoaiCPHangMuc,
    priceHistory: priceHistory,
    lastPrice: lastPrice,
    costSlips: costSlips,
    costCatalogCheck: costCatalogCheck
  };
});
