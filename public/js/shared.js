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
  function indexBy(list) {
    const m = new Map();
    (list || []).forEach(function (x) { if (x.ma && !m.has(keyOf(x.ma))) m.set(keyOf(x.ma), x); });
    return m;
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

  // Trả về các dòng sổ đã sắp theo ngày, kèm tên dự án/NCC và tồn quỹ lũy kế.
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
        const hay = normalizeText([r.soPhieu, r.maDuAn, r.tenDuAn, r.maNCC, r.tenNCC, r.noiDung, r.nguoiNhan, r.ghiChu, fmtMoney(r.thu), fmtMoney(r.chi)].join(' '));
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

  // Tổng hợp chi phí theo dự án (sheet Tong_Quan).
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

  // Số phiếu kế tiếp dạng PC045/09 (đánh số theo tháng của ngày chứng từ).
  function nextVoucherNo(db, loai, ngay) {
    const prefix = loai === 'thu' ? 'PT' : 'PC';
    const iso = isISODate(ngay) ? ngay : todayISO();
    const yyyy = iso.slice(0, 4);
    const mm = iso.slice(5, 7);
    const re = new RegExp('^' + prefix + '(\\d+)\\s*/\\s*' + mm + '$', 'i');
    let max = 0;
    (db.entries || []).forEach(function (e) {
      if (!e.ngay || e.ngay.slice(0, 4) !== yyyy) return;
      const m = re.exec(String(e.soPhieu || '').trim());
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return prefix + pad(max + 1, 3) + '/' + mm;
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

  // 5000 -> "5.000"; 2.5 -> "2,5"
  function fmtQty(n) {
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
    const t = String(text || '').trim();
    if (!t) return null;
    const list = db.costItems || [];
    const k = keyOf(t);
    const byCode = list.find(function (x) { return keyOf(x.ma) === k; });
    if (byCode) return byCode;
    const n = normalizeText(t).trim();
    return list.find(function (x) { return normalizeText(x.ten).trim() === n; }) || null;
  }

  // Loại CP gợi ý cho 1 dòng: theo vật tư -> theo hạng mục "Nhân công..." -> có mã VT là Vật tư, không có là Dịch vụ-Phí
  function defaultLoaiCP(db, maVT, maHM) {
    const m = indexBy(db.materials).get(keyOf(maVT));
    if (m && normLoaiCP(m.loaiCP)) return normLoaiCP(m.loaiCP);
    const it = indexBy(db.costItems).get(keyOf(maHM));
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
          r.soPhieu, r.ghiChu, fmtMoney(r.thanhTien), fmtMoney(r.donGia)].join(' '));
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
  // (và Mã công trình = Mã dự án nếu lọc theo công trình). f: { ct, to }
  const DEBT_TEXT = { no: 'Còn nợ', du: 'Ứng dư', ok: 'Đã tất toán' };
  function supplierDebt(db, f) {
    f = f || {};
    const acc = new Map();
    // công trình đang có chi phí: khoản trả gắn với các công trình này mới coi là "liên quan công trình"
    const ctCoChiPhi = new Set();
    (db.costs || []).forEach(function (c) { if (c.maCT) ctCoChiPhi.add(keyOf(c.maCT)); });
    function get(ma) {
      const k = keyOf(ma);
      let a = acc.get(k);
      if (!a) { a = { ma: String(ma).trim(), phatSinh: 0, daTra: 0, soDongCP: 0, soDongTT: 0, soDongTTCT: 0, last: '' }; acc.set(k, a); }
      return a;
    }
    (db.costs || []).forEach(function (c) {
      if (!c.maNCC) return;
      if (f.ct && keyOf(c.maCT) !== keyOf(f.ct)) return;
      if (f.to && c.ngay > f.to) return;
      const a = get(c.maNCC);
      a.phatSinh += c.thanhTien || 0;
      a.soDongCP++;
      if (c.ngay > a.last) a.last = c.ngay;
    });
    (db.entries || []).forEach(function (e) {
      if (!e.maNCC) return;
      if (f.ct && keyOf(e.maDuAn) !== keyOf(f.ct)) return;
      if (f.to && e.ngay > f.to) return;
      const a = get(e.maNCC);
      a.daTra += (e.chi || 0) - (e.thu || 0);
      a.soDongTT++;
      if (ctCoChiPhi.has(keyOf(e.maDuAn))) a.soDongTTCT++;
      if (e.ngay > a.last) a.last = e.ngay;
    });
    const rows = [];
    const seen = new Set();
    function push(ma, s, a) {
      a = a || { phatSinh: 0, daTra: 0, soDongCP: 0, soDongTT: 0, soDongTTCT: 0, last: '' };
      const conLai = a.phatSinh - a.daTra;
      rows.push({
        id: s ? s.id : undefined, ma: ma, ten: s ? s.ten : '(Chưa có trong danh mục)', loai: s ? (s.loai || '') : '',
        phatSinh: a.phatSinh, daTra: a.daTra, conLai: conLai, soDongCP: a.soDongCP, soDongTT: a.soDongTT, last: a.last,
        // có chi phí công trình, hoặc có khoản trả/ứng gắn với công trình đang có chi phí (vd. ứng trước cho thầu)
        lienQuan: a.soDongCP > 0 || a.soDongTTCT > 0,
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
    const sumRows = function (list) {
      return list.reduce(function (t, r) {
        t.phatSinh += r.phatSinh; t.daTra += r.daTra; t.conLai += r.conLai;
        if (r.conLai > 0) t.conNo += r.conLai; else t.ungDu -= r.conLai;
        return t;
      }, { phatSinh: 0, daTra: 0, conLai: 0, conNo: 0, ungDu: 0 });
    };
    // total: chỉ các NCC liên quan công trình (dùng cho báo cáo); totalAll: mọi mã NCC
    return { rows: rows, total: sumRows(rows.filter(function (r) { return r.lienQuan; })), totalAll: sumRows(rows), sumRows: sumRows };
  }

  function debtOf(db, maNCC, ct) {
    if (!maNCC) return null;
    const r = supplierDebt(db, { ct: ct }).rows.find(function (x) { return keyOf(x.ma) === keyOf(maNCC); });
    return r && (r.soDongCP || r.soDongTT) ? r : null;
  }

  // Tổng hợp theo công trình: chi phí phát sinh, đã trả NCC, còn nợ / ứng dư (cộng theo từng NCC của công trình),
  // chi khác không ghi NCC. Đã trả = sổ thu chi (chi − thu) có Mã dự án = công trình và có Mã NCC.
  // f: { to, all } — all = hiện cả dự án chưa có dòng chi phí nào.
  function projectDebtSummary(db, f) {
    f = f || {};
    const coChiPhi = new Set();
    (db.costs || []).forEach(function (c) { if (c.maCT && (!f.to || c.ngay <= f.to)) coChiPhi.add(keyOf(c.maCT)); });
    const coThuChi = new Set();
    (db.entries || []).forEach(function (e) { if (e.maDuAn && (!f.to || e.ngay <= f.to)) coThuChi.add(keyOf(e.maDuAn)); });
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
      const d = supplierDebt(db, { ct: p.ma, to: f.to });
      const t = d.totalAll;
      let chiKhac = 0;
      let thuCT = 0;
      (db.entries || []).forEach(function (e) {
        if (keyOf(e.maDuAn) !== k || (f.to && e.ngay > f.to)) return;
        if (!e.maNCC) chiKhac += (e.chi || 0) - (e.thu || 0);
        thuCT += e.thu || 0;
      });
      // Dự án chưa nhập chi phí: chỉ có số đã trả; không tính nợ / ứng dư (sẽ ra "ứng dư" toàn bộ, sai ý nghĩa)
      rows.push({
        ma: p.ma, ten: p.ten, trangThai: p.trangThai, inCatalog: p.inCatalog, coChiPhi: coCP,
        phatSinh: t.phatSinh, daTra: t.daTra, conNo: coCP ? t.conNo : 0, ungDu: coCP ? t.ungDu : 0, conLai: coCP ? t.conLai : 0, chiKhac: chiKhac,
        tiLeDaTra: t.phatSinh > 0 ? t.daTra / t.phatSinh : null,
        soNCCNo: coCP ? d.rows.filter(function (r) { return r.conLai > 0; }).length : 0,
        soNCCDu: coCP ? d.rows.filter(function (r) { return r.conLai < 0; }).length : 0
      });
    });
    const total = rows.reduce(function (s, r) {
      ['phatSinh', 'daTra', 'conNo', 'ungDu', 'conLai', 'chiKhac', 'soNCCNo', 'soNCCDu'].forEach(function (key) { s[key] += r[key]; });
      if (r.coChiPhi) s.daTraCoChiPhi += r.daTra;
      return s;
    }, { phatSinh: 0, daTra: 0, daTraCoChiPhi: 0, conNo: 0, ungDu: 0, conLai: 0, chiKhac: 0, soNCCNo: 0, soNCCDu: 0 });
    // % đã thanh toán chỉ tính trên các công trình đã nhập chi phí
    total.tiLeDaTra = total.phatSinh > 0 ? total.daTraCoChiPhi / total.phatSinh : null;
    // khoản trả cho NCC có chi phí công trình nhưng không ghi mã dự án -> không tính được vào công trình nào
    const nccCP = new Set();
    (db.costs || []).forEach(function (c) { if (c.maNCC) nccCP.add(keyOf(c.maNCC)); });
    let chuaGan = 0;
    let soChuaGan = 0;
    (db.entries || []).forEach(function (e) {
      if (!e.maDuAn && e.maNCC && nccCP.has(keyOf(e.maNCC)) && (!f.to || e.ngay <= f.to)) { chuaGan += (e.chi || 0) - (e.thu || 0); soChuaGan++; }
    });
    return { rows: rows, total: total, traChuaGanCT: { soTien: chuaGan, soDong: soChuaGan } };
  }

  // Thống kê mua vật tư: số lần, tổng SL, giá thấp/cao/gần nhất, bình quân gia quyền
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
      if (!a) { a = { ma: String(c.maVT).trim(), soLan: 0, tongSL: 0, tongTien: 0, min: Infinity, max: -Infinity, last: 0, lastNgay: '', lastNCC: '', nccs: new Set() }; acc.set(k, a); }
      a.soLan++;
      a.tongSL = round4(a.tongSL + (c.soLuong || 0));
      a.tongTien += c.thanhTien || 0;
      const dg = Number(c.donGia) || 0;
      if (dg < a.min) a.min = dg;
      if (dg > a.max) a.max = dg;
      a.last = dg;
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
        soLan: a.soLan, tongSL: a.tongSL, tongTien: a.tongTien, min: a.min, max: a.max, last: a.last, lastNgay: a.lastNgay, lastNCC: a.lastNCC,
        binhQuan: a.tongSL ? Math.round(a.tongTien / a.tongSL) : 0, soNCC: a.nccs.size, inCatalog: !!m
      });
    });
    return rows;
  }

  // Lịch sử đơn giá của 1 vật tư (cũ -> mới); chênh lệch so với lần mua trước cùng NCC
  function priceHistory(db, maVT) {
    const sIdx = indexBy(db.suppliers);
    const prevByNcc = new Map();
    return (db.costs || []).filter(function (c) { return keyOf(c.maVT) === keyOf(maVT); }).sort(compareEntries).map(function (c) {
      const k = keyOf(c.maNCC);
      const prev = prevByNcc.get(k);
      prevByNcc.set(k, Number(c.donGia) || 0);
      const s = sIdx.get(k);
      return {
        id: c.id, ngay: c.ngay, maNCC: c.maNCC || '', tenNCC: s ? s.ten : '', maCT: c.maCT || '', soLuong: c.soLuong, donGia: c.donGia,
        thanhTien: c.thanhTien, dienGiai: c.dienGiai || '', soPhieu: c.soPhieu || '',
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
      if (keyOf(c.maVT) !== keyOf(maVT)) return;
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
          soPhieu: r.soPhieu || '', lines: [], total: 0, hangMuc: new Set(), lastSeq: 0 };
        map.set(k, s);
      }
      s.lines.push(r);
      s.total += r.thanhTien || 0;
      if (r.tenHM) s.hangMuc.add(r.tenHM);
      if ((r.seq || 0) > s.lastSeq) s.lastSeq = r.seq || 0;
    });
    const list = Array.from(map.values()).map(function (s) {
      s.hangMuc = Array.from(s.hangMuc);
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
    periodRange: periodRange,
    describeRange: describeRange,
    // Chi phí công trình
    LOAI_CP: LOAI_CP,
    DEBT_TEXT: DEBT_TEXT,
    round4: round4,
    normLoaiCP: normLoaiCP,
    parseQty: parseQty,
    fmtQty: fmtQty,
    costAmount: costAmount,
    findCostItem: findCostItem,
    defaultLoaiCP: defaultLoaiCP,
    buildCostLedger: buildCostLedger,
    filterCosts: filterCosts,
    costSummary: costSummary,
    supplierDebt: supplierDebt,
    debtOf: debtOf,
    projectDebtSummary: projectDebtSummary,
    materialStats: materialStats,
    priceHistory: priceHistory,
    lastPrice: lastPrice,
    costSlips: costSlips,
    costCatalogCheck: costCatalogCheck
  };
});
