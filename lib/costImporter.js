'use strict';
/*
 * Nhập file Excel CHI PHÍ CÔNG TRÌNH (mẫu ChiPhi_CongTrinh_*.xlsm và file xuất từ phần mềm):
 *   NHATKYCHUNG (hoặc DATA_CHIPHI) = sổ chi phí, DM_NHOM, DM_HANGMUC, DM_VATTU, DM_NHA,
 *   DM_CONGTRINH, DM_NCC, và tùy chọn SO_QUY (đưa vào Sổ thu chi). Sheet DUTOAN (nếu có) được bỏ qua.
 * Cột được nhận theo tiêu đề. Các cột công thức (Nhóm CP, Tên vật tư, ĐVT, Thành tiền, Tên NCC)
 * không nhập nguyên văn mà tính lại từ danh mục: Thành tiền = Số lượng × Đơn giá.
 */
const ExcelJS = require('exceljs');
const KT = require('../public/js/shared.js');
const { helpers, entryKey } = require('./importer');

const { norm, cellValue, text, toISO, amount, findSheet, findHeader, colOf } = helpers;

function num(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const n = KT.parseQty(String(v));
  return isNaN(n) ? null : n;
}

// Đọc 1 sheet dạng bảng: trả về { rows: [{ _row, get(pred) }], has(pred) }
function table(ws, mustHave) {
  const h = findHeader(ws, mustHave, 12);
  if (!h) return null;
  const cache = new Map();
  const col = (pred) => {
    const key = String(pred);
    if (!cache.has(key)) cache.set(key, colOf(h, pred));
    return cache.get(key);
  };
  const rows = [];
  for (let r = h.row + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    rows.push({
      _row: r,
      raw: (pred) => { const c = col(pred); return c ? cellValue(row.getCell(c)) : null; },
      txt: (pred) => { const c = col(pred); return c ? text(cellValue(row.getCell(c))) : ''; }
    });
  }
  return { rows, has: (pred) => !!col(pred), headerRow: h.row };
}

const is = {
  maCT: (t) => t === 'ma ct' || t.startsWith('ma cong trinh'),
  maNha: (t) => t === 'ma nha' || (t.startsWith('ma nha ') && !t.startsWith('ma nha cung cap')),
  hangMuc: (t) => t === 'hang muc' || t.startsWith('hang muc ('),
  nhomCP: (t) => t === 'nhom cp' || t.startsWith('nhom chi phi'),
  loaiCP: (t) => t === 'loai cp' || t.startsWith('loai chi phi'),
  maVT: (t) => t === 'ma vt' || t.startsWith('ma vat tu'),
  tenVT: (t) => t.startsWith('ten vat tu'),
  dvt: (t) => t === 'dvt' || t.startsWith('dvt ') || t.startsWith('don vi tinh'),
  dienGiai: (t) => t.startsWith('dien giai'),
  soLuong: (t) => t.startsWith('so luong'),
  donGia: (t) => t.startsWith('don gia'),
  thanhTien: (t) => t.startsWith('thanh tien'),
  maNCC: (t) => t === 'ma ncc' || t.startsWith('ma nha cung cap'),
  tenNCC: (t) => t === 'ten ncc' || t.startsWith('ten nha cung cap'),
  soPhieu: (t) => t.startsWith('so phieu'),
  ghiChu: (t) => t.startsWith('ghi chu'),
  nguon: (t) => t === 'nguon',
  maPhieu: (t) => t.startsWith('ma phieu'),
  ngay: (t) => t === 'ngay' || t.startsWith('ngay ('),
  maNhom: (t) => t === 'ma nhom',
  tenNhom: (t) => t.startsWith('ten nhom'),
  maHM: (t) => t === 'ma hm' || t.startsWith('ma hang muc'),
  hmHayDung: (t) => t.startsWith('hang muc hay dung'),
  tenNha: (t) => t.startsWith('ten nha') && !t.startsWith('ten nha cung cap'),
  dienTich: (t) => t.startsWith('dien tich'),
  chuNha: (t) => t.startsWith('chu nha'),
  tenCT: (t) => t.startsWith('ten cong trinh'),
  diaChi: (t) => t.startsWith('dia chi'),
  ngayKC: (t) => t.startsWith('ngay khoi cong'),
  trangThai: (t) => t.startsWith('trang thai'),
  loai: (t) => t === 'loai' || t.startsWith('loai doi tuong'),
  sdt: (t) => t === 'sdt' || t.includes('dien thoai'),
  loaiPhieu: (t) => t === 'loai',
  nhomTC: (t) => t.startsWith('nhom thu chi'),
  nguoiNhan: (t) => t.startsWith('ho ten nguoi') || t.startsWith('nguoi nhan'),
  lyDo: (t) => t.startsWith('ly do') || t.startsWith('noi dung'),
  soTien: (t) => t === 'so tien' || t.startsWith('so tien ('),
  thu: (t) => t === 'thu',
  chi: (t) => t === 'chi',
  hinhThuc: (t) => t.startsWith('hinh thuc'),
  chung: (t) => t.startsWith('dung chung')
};

function sheetsOf(wb) {
  return {
    nkc: findSheet(wb, ['NHATKYCHUNG', 'DATA_CHIPHI', 'Nhat ky chung', 'So chi phi', 'So_Chi_Phi']),
    nhom: findSheet(wb, ['DM_NHOM']),
    hm: findSheet(wb, ['DM_HANGMUC']),
    vt: findSheet(wb, ['DM_VATTU']),
    nha: findSheet(wb, ['DM_NHA']),
    ct: findSheet(wb, ['DM_CONGTRINH']),
    ncc: findSheet(wb, ['DM_NCC']),
    sq: findSheet(wb, ['SO_QUY']),
    th: findSheet(wb, ['TONGHOP'])
  };
}

// null nếu không phải file chi phí công trình
async function parseCostWorkbook(buffer, curDb) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sh = sheetsOf(wb);
  if (!sh.nkc && !sh.hm && !sh.vt) return null;
  const warnings = [];
  const warn = (s) => warnings.push(s);
  const out = { groups: [], items: [], materials: [], houses: [], cts: [], suppliers: [], costs: [], cash: [], warnings, sheets: [] };
  Object.keys(sh).forEach((k) => { if (sh[k]) out.sheets.push(sh[k].name); });

  /* ---- DM_NHOM ---- */
  if (sh.nhom) {
    const t = table(sh.nhom, ['ma nhom', 'ten nhom']);
    if (!t) warn('Không tìm thấy tiêu đề trong sheet ' + sh.nhom.name);
    else t.rows.forEach((r) => {
      const ma = r.txt(is.maNhom);
      if (!ma) return;
      out.groups.push({ ma, ten: r.txt(is.tenNhom) || ma, ghiChu: r.txt(is.ghiChu) });
    });
  }
  /* ---- DM_HANGMUC ---- */
  if (sh.hm) {
    const t = table(sh.hm, ['hang muc', 'ma nhom']);
    if (!t) warn('Không tìm thấy tiêu đề trong sheet ' + sh.hm.name);
    else t.rows.forEach((r) => {
      const ten = r.txt(is.hangMuc);
      if (!ten) return;
      out.items.push({ ma: r.txt(is.maHM), ten, maNhom: r.txt(is.maNhom), tenNhom: r.txt(is.nhomCP), _row: r._row });
    });
  }
  /* ---- DM_VATTU ---- */
  if (sh.vt) {
    const t = table(sh.vt, ['ma vt', 'ten vat tu']);
    if (!t) warn('Không tìm thấy tiêu đề trong sheet ' + sh.vt.name);
    else t.rows.forEach((r) => {
      const ma = r.txt(is.maVT);
      if (!ma) return;
      out.materials.push({ ma, ten: r.txt(is.tenVT) || ma, dvt: r.txt(is.dvt), hmTen: r.txt(is.hmHayDung), loaiCP: KT.normLoaiCP(r.txt(is.loaiCP)), ghiChu: r.txt(is.ghiChu) });
    });
  }
  /* ---- DM_CONGTRINH ---- */
  if (sh.ct) {
    const t = table(sh.ct, ['ma ct', 'ten cong trinh']);
    if (t) t.rows.forEach((r) => {
      const ma = r.txt(is.maCT);
      if (!ma) return;
      out.cts.push({ ma, ten: r.txt(is.tenCT) || ma, diaChi: r.txt(is.diaChi), ngayKhoiCong: toISO(r.raw(is.ngayKC)), trangThai: r.txt(is.trangThai), ghiChu: r.txt(is.ghiChu) });
    });
  }
  /* ---- DM_NHA ---- */
  if (sh.nha) {
    const t = table(sh.nha, ['ma nha', 'ma ct']);
    if (t) t.rows.forEach((r) => {
      const ma = r.txt(is.maNha);
      if (!ma) return;
      const maCT = r.txt(is.maCT);
      const ten = r.txt(is.tenNha) || ma;
      const dt = num(r.raw(is.dienTich));
      out.houses.push({
        ma, maCT, ten, dienTich: dt == null ? '' : dt, chuNha: r.txt(is.chuNha), ghiChu: r.txt(is.ghiChu),
        chung: t.has(is.chung) ? !!r.txt(is.chung) : (KT.keyOf(ma) === KT.keyOf(maCT) || KT.keyOf(ma) === 'chung' || KT.normalizeText(ten).includes('dung chung'))
      });
    });
  }
  /* ---- DM_NCC ---- */
  if (sh.ncc) {
    const t = table(sh.ncc, ['ma ncc', 'ten']);
    if (t) t.rows.forEach((r) => {
      const ma = r.txt(is.maNCC);
      if (!ma || norm(ma).startsWith('tong cong')) return;
      out.suppliers.push({ ma, ten: r.txt((x) => x.startsWith('ten')) || ma, loai: r.txt(is.loai), sdt: r.txt(is.sdt), diaChi: r.txt(is.diaChi), ghiChu: r.txt(is.ghiChu) });
    });
  }

  /* ---- NHATKYCHUNG: sổ chi phí ---- */
  let cachedTotal = null;
  if (sh.nkc) {
    const t = table(sh.nkc, ['ngay', 'hang muc', 'so luong']);
    if (!t) warn('Không tìm thấy tiêu đề (Ngày, Hạng mục, Số lượng) trong sheet ' + sh.nkc.name);
    else {
      let lastDate = '';
      let lechTT = 0;
      t.rows.forEach((r) => {
        const maCT = r.txt(is.maCT);
        const hm = r.txt(is.hangMuc);
        const maVT = r.txt(is.maVT);
        const dienGiai = r.txt(is.dienGiai);
        let sl = num(r.raw(is.soLuong));
        let dg = num(r.raw(is.donGia));
        const tt = num(r.raw(is.thanhTien));
        if (!maCT && !hm && !maVT && !dienGiai && sl == null && dg == null) return; // dòng trống (chỉ có công thức)
        const where = 'NHATKYCHUNG dòng ' + r._row + ': ';
        if (sl == null && dg == null && tt) { sl = 1; dg = tt; warn(where + 'không có Số lượng, Đơn giá; lấy Số lượng 1 × Thành tiền ' + KT.fmtMoney(tt)); }
        if (sl == null) { warn(where + 'thiếu Số lượng, đã bỏ qua'); return; }
        if (dg == null) { warn(where + 'thiếu Đơn giá, đã bỏ qua'); return; }
        if (sl < 0 || dg < 0) warn(where + 'có số âm');
        let ngay = toISO(r.raw(is.ngay));
        if (!ngay) {
          if (lastDate) { ngay = lastDate; warn(where + 'thiếu ngày, lấy theo dòng trên ' + KT.fmtDate(ngay)); } else { warn(where + 'thiếu ngày, đã bỏ qua'); return; }
        }
        lastDate = ngay;
        const loaiRaw = r.txt(is.loaiCP);
        const loaiCP = KT.normLoaiCP(loaiRaw);
        if (loaiRaw && !loaiCP) warn(where + 'Loại CP "' + loaiRaw + '" không nhận ra, sẽ tự xác định');
        const thanhTien = KT.costAmount(sl, dg);
        if (tt != null && Math.round(tt) !== thanhTien) lechTT++;
        out.costs.push({
          _row: r._row, ngay, maCT, maNha: r.txt(is.maNha), hmTen: hm, nhomTen: r.txt(is.nhomCP), loaiCP, maVT, tenVT: r.txt(is.tenVT), dvt: r.txt(is.dvt),
          dienGiai, soLuong: KT.round4(sl), donGia: Math.round(dg * 100) / 100, thanhTien, maNCC: r.txt(is.maNCC), tenNCC: r.txt(is.tenNCC),
          soPhieu: r.txt(is.soPhieu), ghiChu: r.txt(is.ghiChu), nguon: r.txt(is.nguon) || 'excel', maPhieu: r.txt(is.maPhieu)
        });
      });
      if (lechTT) warn(lechTT + ' dòng có cột Thành tiền trong file khác Số lượng × Đơn giá; phần mềm dùng Số lượng × Đơn giá');
    }
    // Số tổng lưu sẵn trên TONGHOP (để phát hiện file chưa được Excel tính lại)
    if (sh.th) {
      for (let r = 1; r <= Math.min(sh.th.rowCount, 12); r++) {
        const row = sh.th.getRow(r);
        if (norm(text(cellValue(row.getCell(1)))).startsWith('tong chi phi')) {
          const v = cellValue(row.getCell(2));
          if (typeof v === 'number') cachedTotal = Math.round(v);
          break;
        }
      }
    }
  }

  /* ---- SO_QUY (tùy chọn nhập vào sổ thu chi) ---- */
  if (sh.sq) {
    const t = table(sh.sq, ['so phieu', 'ngay', 'so tien']);
    if (t) {
      let lastDate = '';
      t.rows.forEach((r) => {
        const soTien = amount(r.raw(is.soTien));
        const loai = norm(r.txt(is.loaiPhieu));
        let thu = t.has(is.thu) ? amount(r.raw(is.thu)) : 0;
        let chi = t.has(is.chi) ? amount(r.raw(is.chi)) : 0;
        if (!thu && !chi && soTien) { if (loai.startsWith('thu')) thu = soTien; else chi = soTien; }
        const lyDo = r.txt(is.lyDo);
        const nguoi = r.txt(is.nguoiNhan);
        if (!thu && !chi && !lyDo) return;
        let ngay = toISO(r.raw(is.ngay));
        if (!ngay) { if (!lastDate) { warn('SO_QUY dòng ' + r._row + ' thiếu ngày, đã bỏ qua'); return; } ngay = lastDate; }
        lastDate = ngay;
        out.cash.push({
          ngay, soPhieu: r.txt(is.soPhieu), maDuAn: r.txt(is.maCT), maNCC: r.txt(is.maNCC),
          noiDung: lyDo || nguoi || r.txt(is.nhomTC) || 'Thu chi nhập từ SO_QUY', nguoiNhan: lyDo ? nguoi : '',
          thu, chi, ghiChu: r.txt(is.ghiChu), _row: r._row
        });
      });
    }
  }

  const total = out.costs.reduce((s, c) => s + c.thanhTien, 0);
  if (cachedTotal != null && cachedTotal !== total) {
    warn('Số “TỔNG CHI PHÍ” đang lưu sẵn trên sheet TONGHOP (' + KT.fmtMoney(cachedTotal) + ' đ) khác tổng tính lại từ ' + (sh.nkc ? sh.nkc.name : 'sổ') + ' (' +
      KT.fmtMoney(total) + ' đ). Có thể file chưa được Excel tính lại sau lần sửa cuối; phần mềm dùng số tính lại từ từng dòng.');
  }
  out.cachedTotal = cachedTotal;
  return out;
}

/* ---------------- ghép mã công trình trong file với dự án đang có ---------------- */

function ctCodesOf(parsed, db) {
  const map = new Map();
  const add = (ma, nguon) => {
    const k = KT.keyOf(ma);
    if (!k) return;
    let x = map.get(k);
    if (!x) { x = { ma: String(ma).trim(), ten: '', soDong: 0, soQuy: 0, nguon: new Set() }; map.set(k, x); }
    x.nguon.add(nguon);
    return x;
  };
  parsed.cts.forEach((c) => { const x = add(c.ma, 'DM_CONGTRINH'); x.ten = c.ten; });
  parsed.houses.forEach((h) => add(h.maCT, 'DM_NHA'));
  parsed.costs.forEach((c) => { const x = add(c.maCT, 'Sổ chi phí'); if (x) x.soDong++; });
  parsed.cash.forEach((c) => { const x = add(c.maDuAn, 'SO_QUY'); if (x) x.soQuy++; });
  const pIdx = KT.indexBy(db.projects);
  return Array.from(map.values()).map((x) => {
    const exists = pIdx.get(KT.keyOf(x.ma));
    let goiY = '';
    if (!exists && x.ten) {
      const n = KT.normalizeText(x.ten).replace(/[^a-z0-9]+/g, ' ').trim();
      const cand = db.projects.filter((p) => {
        const pn = KT.normalizeText(p.ten).replace(/[^a-z0-9]+/g, ' ').trim();
        return n.length >= 4 && (pn.includes(n) || n.includes(pn));
      });
      if (cand.length === 1) goiY = cand[0].ma;
    }
    const used = x.soDong > 0 || x.soQuy > 0;
    return {
      ma: x.ma, ten: x.ten, soDong: x.soDong, soQuy: x.soQuy, nguon: Array.from(x.nguon), coSan: !!exists,
      goiY, macDinh: exists ? exists.ma : goiY || (used ? '__new__' : '__skip__')
    };
  });
}

function costKey(c) {
  return [c.ngay, KT.keyOf(c.maCT), KT.keyOf(c.maNha), KT.keyOf(c.maHM), c.loaiCP, KT.keyOf(c.maVT), KT.normalizeText(c.dienGiai).trim(),
    KT.round4(c.soLuong), Number(c.donGia), KT.keyOf(c.maNCC), KT.voucherKey(c.soPhieu)].join('|');
}

/*
 * Dựng dữ liệu mới từ file. Trả về { db, added, skipped, warnings }.
 * opts: { mode: 'merge'|'replace', soQuy: bool, map: { maCTTrongFile: maDuAn | '__new__' | '__skip__' } }
 */
function build(cur, parsed, opts) {
  opts = opts || {};
  const mode = opts.mode === 'replace' ? 'replace' : 'merge';
  const warnings = parsed.warnings.slice();
  const warn = (s) => warnings.push(s);
  const now = new Date().toISOString();
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const db = clone(cur);
  const added = { costs: 0, groups: 0, items: 0, materials: 0, houses: 0, projects: 0, suppliers: 0, entries: 0 };
  let skipped = 0;
  let skippedCash = 0;
  // Khóa sổ: không ghi vào tháng đã khóa; chế độ thay thế vẫn giữ nguyên dữ liệu các tháng đã khóa
  const locked = KT.lockedMonths(cur);
  const isLocked = (ngay) => locked.size > 0 && locked.has(KT.monthOf(ngay));
  let lockedSkipped = 0;
  let lockedSkippedCash = 0;

  const fileHas = { groups: parsed.groups.length > 0, items: parsed.items.length > 0, materials: parsed.materials.length > 0, houses: parsed.houses.length > 0 };
  if (mode === 'replace') {
    if (fileHas.groups) db.costGroups = [];
    if (fileHas.items) db.costItems = [];
    if (fileHas.materials) db.materials = [];
    if (fileHas.houses) db.houses = [];
    db.costs = db.costs.filter((c) => isLocked(c.ngay));
  }

  /* ---- công trình ---- */
  const ctMap = new Map(); // key mã trong file -> mã dự án trong phần mềm ('' = bỏ qua)
  const pIdx = () => KT.indexBy(db.projects);
  ctCodesOf(parsed, cur).forEach((c) => {
    let target = opts.map && Object.prototype.hasOwnProperty.call(opts.map, c.ma) ? opts.map[c.ma] : c.macDinh;
    if (target === '__skip__' && (c.soDong || (opts.soQuy && c.soQuy))) {
      warn('Công trình "' + c.ma + '" có ' + (c.soDong + c.soQuy) + ' dòng dữ liệu nên không bỏ qua được, đã tạo mới');
      target = '__new__';
    }
    if (target === '__skip__') { ctMap.set(KT.keyOf(c.ma), ''); return; }
    if (target && target !== '__new__') {
      const p = pIdx().get(KT.keyOf(target));
      if (p) {
        ctMap.set(KT.keyOf(c.ma), p.ma);
        const info = parsed.cts.find((x) => KT.keyOf(x.ma) === KT.keyOf(c.ma));
        if (info) {
          if (!p.ngayKhoiCong && info.ngayKhoiCong) p.ngayKhoiCong = info.ngayKhoiCong;
          if (!p.diaChi && info.diaChi) p.diaChi = info.diaChi;
        }
        if (KT.keyOf(p.ma) !== KT.keyOf(c.ma)) warn('Mã công trình "' + c.ma + '" trong file được ghép vào dự án ' + p.ma);
        return;
      }
    }
    // tạo mới (hoặc đã có sẵn cùng mã)
    const exist = pIdx().get(KT.keyOf(c.ma));
    if (exist) { ctMap.set(KT.keyOf(c.ma), exist.ma); return; }
    const info = parsed.cts.find((x) => KT.keyOf(x.ma) === KT.keyOf(c.ma)) || {};
    db.projects.push({
      id: 0, ma: c.ma, ten: info.ten || c.ma, nganSach: 0, trangThai: info.trangThai || 'Đang thực hiện',
      ngayKhoiCong: info.ngayKhoiCong || '', diaChi: info.diaChi || '', ghiChu: info.ten ? (info.ghiChu || '') : 'Tự thêm khi nhập Excel chi phí'
    });
    ctMap.set(KT.keyOf(c.ma), c.ma);
    added.projects++;
  });
  const mapCT = (ma) => (ctMap.has(KT.keyOf(ma)) ? ctMap.get(KT.keyOf(ma)) : String(ma || '').trim());

  /* ---- nhà cung cấp: chỉ thêm mã chưa có (danh mục dùng chung với sổ thu chi) ---- */
  const sKeys = new Set(db.suppliers.map((s) => KT.keyOf(s.ma)));
  const addSupplier = (s, why) => {
    if (!s.ma || sKeys.has(KT.keyOf(s.ma))) return;
    sKeys.add(KT.keyOf(s.ma));
    db.suppliers.push({ id: 0, ma: s.ma, ten: s.ten || s.ma, loai: s.loai || '', sdt: s.sdt || '', diaChi: s.diaChi || '', ghiChu: s.ghiChu || why || '' });
    added.suppliers++;
  };
  parsed.suppliers.forEach((s) => addSupplier(s));

  /* ---- nhóm CP ---- */
  const gMap = new Map(); // key mã nhóm trong file -> mã trong phần mềm
  parsed.groups.forEach((g) => {
    let t = db.costGroups.find((x) => KT.keyOf(x.ma) === KT.keyOf(g.ma)) ||
      db.costGroups.find((x) => KT.normalizeText(x.ten).trim() === KT.normalizeText(g.ten).trim());
    if (!t) { t = { id: 0, ma: g.ma, ten: g.ten, ghiChu: g.ghiChu || '' }; db.costGroups.push(t); added.groups++; }
    gMap.set(KT.keyOf(g.ma), t.ma);
  });
  const groupFor = (maNhom, tenNhom) => {
    if (maNhom && gMap.has(KT.keyOf(maNhom))) return gMap.get(KT.keyOf(maNhom));
    const byCode = maNhom && db.costGroups.find((x) => KT.keyOf(x.ma) === KT.keyOf(maNhom));
    if (byCode) return byCode.ma;
    const byName = tenNhom && db.costGroups.find((x) => KT.normalizeText(x.ten).trim() === KT.normalizeText(tenNhom).trim());
    return byName ? byName.ma : '';
  };

  /* ---- hạng mục (sổ Excel lưu TÊN hạng mục) ---- */
  const itemByName = () => {
    const m = new Map();
    db.costItems.forEach((x) => m.set(KT.normalizeText(x.ten).trim(), x));
    return m;
  };
  let names = itemByName();
  const nextHmCode = () => {
    let n = 0;
    db.costItems.forEach((x) => { const mm = /^HM(\d+)$/i.exec(x.ma); if (mm) n = Math.max(n, +mm[1]); });
    let code;
    do { n++; code = 'HM' + String(n).padStart(2, '0'); } while (db.costItems.some((x) => KT.keyOf(x.ma) === KT.keyOf(code)));
    return code;
  };
  const addItem = (ten, maNhom, maGoc, why) => {
    const k = KT.normalizeText(ten).trim();
    if (names.has(k)) return names.get(k).ma;
    let ma = maGoc && !db.costItems.some((x) => KT.keyOf(x.ma) === KT.keyOf(maGoc)) ? maGoc : nextHmCode();
    const it = { id: 0, ma, ten, maNhom: maNhom || '', ghiChu: why || '' };
    db.costItems.push(it);
    names.set(k, it);
    added.items++;
    return ma;
  };
  parsed.items.forEach((it) => {
    const maNhom = groupFor(it.maNhom, it.tenNhom);
    if (!maNhom) warn('Hạng mục "' + it.ten + '" không có nhóm CP hợp lệ (mã nhóm "' + it.maNhom + '")');
    const k = KT.normalizeText(it.ten).trim();
    if (names.has(k)) {
      const ex = names.get(k);
      if (mode === 'merge' && ex.maNhom && maNhom && KT.keyOf(ex.maNhom) !== KT.keyOf(maNhom)) {
        warn('Hạng mục "' + it.ten + '" đang thuộc nhóm ' + ex.maNhom + ' trong phần mềm (file ghi ' + maNhom + '), giữ nhóm của phần mềm');
      }
      return;
    }
    addItem(it.ten, maNhom, it.ma);
  });
  const itemCode = (ten, nhomTen, where) => {
    const t = String(ten || '').trim();
    if (!t) return '';
    const byName = names.get(KT.normalizeText(t).trim());
    if (byName) return byName.ma;
    const byCode = db.costItems.find((x) => KT.keyOf(x.ma) === KT.keyOf(t));
    if (byCode) return byCode.ma;
    const maNhom = groupFor('', nhomTen);
    warn((where || '') + 'hạng mục lạ "' + t + '", đã thêm vào danh mục' + (maNhom ? '' : ' (chưa có nhóm CP, cần gán nhóm)'));
    return addItem(t, maNhom, '', 'Tự thêm khi nhập Excel');
  };

  /* ---- vật tư ---- */
  const mKeys = new Set(db.materials.map((x) => KT.keyOf(x.ma)));
  const hmLaVT = new Set();
  parsed.materials.forEach((m) => {
    if (mKeys.has(KT.keyOf(m.ma))) return;
    let maHM = '';
    if (m.hmTen) {
      const it = names.get(KT.normalizeText(m.hmTen).trim()) || db.costItems.find((x) => KT.keyOf(x.ma) === KT.keyOf(m.hmTen));
      if (it) maHM = it.ma; else hmLaVT.add(m.hmTen);
    }
    mKeys.add(KT.keyOf(m.ma));
    db.materials.push({ id: 0, ma: m.ma, ten: m.ten, dvt: m.dvt, maHM, loaiCP: m.loaiCP || '', ghiChu: m.ghiChu || '' });
    added.materials++;
  });
  if (hmLaVT.size) warn('DM_VATTU: ' + hmLaVT.size + ' "hạng mục hay dùng" không có trong DM_HANGMUC, để trống: ' + Array.from(hmLaVT).slice(0, 8).join(', ') + (hmLaVT.size > 8 ? '...' : ''));

  /* ---- nhà ---- */
  const hKeys = new Set(db.houses.map((x) => KT.keyOf(x.ma)));
  const nhaBoQua = [];
  parsed.houses.forEach((h) => {
    const maCT = mapCT(h.maCT);
    if (!maCT) { nhaBoQua.push(h.ma); return; }
    if (hKeys.has(KT.keyOf(h.ma))) return;
    hKeys.add(KT.keyOf(h.ma));
    db.houses.push({ id: 0, ma: h.ma, maCT, ten: h.ten, dienTich: h.dienTich, chuNha: h.chuNha, chung: h.chung, ghiChu: h.ghiChu });
    added.houses++;
  });
  if (nhaBoQua.length) warn('Bỏ qua ' + nhaBoQua.length + ' nhà thuộc công trình không nhập: ' + nhaBoQua.join(', '));

  /* ---- dòng chi phí ---- */
  const existing = new Map();
  db.costs.forEach((c) => { const k = costKey(c); existing.set(k, (existing.get(k) || 0) + 1); });
  let nextPhieu = Math.max(Number(db.nextId) || 1, 1);
  db.costs.forEach((c) => { if (c.phieuId >= nextPhieu) nextPhieu = c.phieuId + 1; });
  let seq = db.costs.reduce((m, c) => Math.max(m, c.seq || 0), 0);
  let prevHead = null;
  let curPhieu = 0;
  const phieuByMa = new Map();
  const laVT = new Set();
  parsed.costs.forEach((c) => {
    const where = 'NHATKYCHUNG dòng ' + c._row + ': ';
    if (isLocked(c.ngay)) { lockedSkipped++; prevHead = null; return; }
    const maCT = mapCT(c.maCT);
    if (!maCT) { warn(where + 'thiếu Mã công trình, đã bỏ qua (dòng không thuộc công trình nào sẽ thành dòng mồ côi)'); prevHead = null; return; }
    // nhà
    let maNha = c.maNha;
    if (maNha && !hKeys.has(KT.keyOf(maNha))) {
      hKeys.add(KT.keyOf(maNha));
      db.houses.push({ id: 0, ma: maNha, maCT, ten: maNha, dienTich: '', chuNha: '', chung: KT.keyOf(maNha) === KT.keyOf(c.maCT), ghiChu: 'Tự thêm khi nhập Excel' });
      added.houses++;
      warn(where + 'mã nhà lạ "' + maNha + '", đã thêm vào danh mục nhà');
    }
    if (maNha) maNha = db.houses.find((x) => KT.keyOf(x.ma) === KT.keyOf(maNha)).ma;
    // hạng mục
    const maHM = c.hmTen ? itemCode(c.hmTen, c.nhomTen, where) : '';
    if (!maHM) warn(where + 'thiếu Hạng mục (dòng này không vào báo cáo theo nhóm)');
    // vật tư
    let maVT = c.maVT;
    if (maVT) {
      const m = db.materials.find((x) => KT.keyOf(x.ma) === KT.keyOf(maVT));
      if (m) maVT = m.ma;
      else {
        db.materials.push({ id: 0, ma: maVT, ten: c.tenVT || maVT, dvt: c.dvt || '', maHM, loaiCP: '', ghiChu: 'Tự thêm khi nhập Excel' + (c.tenVT ? '' : ', cần bổ sung tên') });
        mKeys.add(KT.keyOf(maVT));
        added.materials++;
        laVT.add(maVT);
      }
    }
    // NCC
    if (c.maNCC && !sKeys.has(KT.keyOf(c.maNCC))) {
      addSupplier({ ma: c.maNCC, ten: c.tenNCC || c.maNCC }, 'Tự thêm khi nhập Excel chi phí');
      warn(where + 'mã NCC lạ "' + c.maNCC + '", đã thêm vào danh mục');
    }
    const maNCC = c.maNCC ? db.suppliers.find((x) => KT.keyOf(x.ma) === KT.keyOf(c.maNCC)).ma : '';
    const loaiCP = c.loaiCP || KT.defaultLoaiCP(db, maVT, maHM);
    const rec = {
      id: 0, seq: 0, phieuId: 0, ngay: c.ngay, maCT, maNha, maHM, loaiCP, maVT, dienGiai: c.dienGiai, soLuong: c.soLuong, donGia: c.donGia,
      thanhTien: KT.costAmount(c.soLuong, c.donGia), maNCC, soPhieu: c.soPhieu, ghiChu: c.ghiChu, nguon: c.nguon, createdAt: now, updatedAt: now
    };
    const k = costKey(rec);
    if (existing.get(k)) { existing.set(k, existing.get(k) - 1); skipped++; prevHead = null; return; }
    // gom dòng liền nhau cùng đầu phiếu thành 1 phiếu (hoặc theo cột "Mã phiếu" của file xuất từ phần mềm)
    const head = [rec.ngay, KT.keyOf(maCT), KT.keyOf(maNha), KT.keyOf(maNCC), KT.voucherKey(rec.soPhieu), rec.nguon].join('|');
    if (c.maPhieu) {
      if (!phieuByMa.has(c.maPhieu)) phieuByMa.set(c.maPhieu, nextPhieu++);
      rec.phieuId = phieuByMa.get(c.maPhieu);
    } else {
      if (head !== prevHead) curPhieu = nextPhieu++;
      rec.phieuId = curPhieu;
    }
    prevHead = head;
    rec.seq = ++seq;
    db.costs.push(rec);
    added.costs++;
  });
  if (laVT.size) warn(laVT.size + ' mã vật tư lạ (không có trong DM_VATTU), đã thêm vào danh mục: ' + Array.from(laVT).slice(0, 10).join(', ') + (laVT.size > 10 ? '...' : ''));
  db.nextId = Math.max(Number(db.nextId) || 1, nextPhieu);

  /* ---- SO_QUY -> sổ thu chi (chỉ khi chọn) ---- */
  if (opts.soQuy && parsed.cash.length) {
    const eKeys = new Map();
    db.entries.forEach((e) => { const k = entryKey(e); eKeys.set(k, (eKeys.get(k) || 0) + 1); });
    let eseq = db.entries.reduce((m, e) => Math.max(m, e.seq || 0), 0);
    parsed.cash.forEach((c) => {
      const maDuAn = mapCT(c.maDuAn);
      if (c.maNCC && !sKeys.has(KT.keyOf(c.maNCC))) addSupplier({ ma: c.maNCC, ten: c.maNCC }, 'Tự thêm khi nhập SO_QUY');
      const e = { id: 0, seq: 0, createdAt: now, updatedAt: now, ngay: c.ngay, soPhieu: c.soPhieu, maDuAn, maNCC: c.maNCC ? db.suppliers.find((x) => KT.keyOf(x.ma) === KT.keyOf(c.maNCC)).ma : '',
        noiDung: c.noiDung, thu: c.thu, chi: c.chi, nguoiNhan: c.nguoiNhan, ghiChu: c.ghiChu };
      if (isLocked(e.ngay)) { lockedSkippedCash++; return; }
      const k = entryKey(e);
      if (eKeys.get(k)) { eKeys.set(k, eKeys.get(k) - 1); skippedCash++; return; }
      e.seq = ++eseq;
      db.entries.push(e);
      added.entries++;
    });
  }

  if (locked.size && mode === 'replace') {
    // dòng chi phí của tháng đã khóa được giữ nguyên: giữ luôn danh mục mà chúng dùng (nếu file mới không có)
    const keep = (list, cats, key) => {
      const have = new Set(db[list].map((x) => KT.keyOf(x.ma)));
      db.costs.filter((c) => isLocked(c.ngay)).forEach((c) => {
        const k = KT.keyOf(c[key]);
        if (!k || have.has(k)) return;
        const x = (cur[cats] || []).find((y) => KT.keyOf(y.ma) === k);
        if (x) { db[list].push(clone(x)); have.add(k); }
      });
    };
    keep('materials', 'materials', 'maVT');
    keep('costItems', 'costItems', 'maHM');
    keep('houses', 'houses', 'maNha');
    const gHave = new Set(db.costGroups.map((g) => KT.keyOf(g.ma)));
    db.costItems.forEach((it) => {
      const k = KT.keyOf(it.maNhom);
      if (k && !gHave.has(k)) { const g = (cur.costGroups || []).find((y) => KT.keyOf(y.ma) === k); if (g) { db.costGroups.push(clone(g)); gHave.add(k); } }
    });
  }
  if (lockedSkipped) warn('Bỏ qua ' + lockedSkipped + ' dòng chi phí thuộc tháng đã khóa sổ (' + Array.from(locked).map(KT.monthLabel).join(', ') + '). Muốn nhập các dòng này, mở khóa tháng đó trước.');
  if (lockedSkippedCash) warn('Bỏ qua ' + lockedSkippedCash + ' dòng SO_QUY thuộc tháng đã khóa sổ.');
  return { db, added, skipped, skippedCash, lockedSkipped, lockedSkippedCash, warnings };
}

function previewOf(parsed, db) {
  const byLoai = {};
  KT.LOAI_CP.forEach((l) => { byLoai[l] = 0; });
  let tong = 0;
  parsed.costs.forEach((c) => {
    tong += c.thanhTien;
    const l = c.loaiCP || 'Chưa rõ';
    byLoai[l] = (byLoai[l] || 0) + c.thanhTien;
  });
  // chạy thử kiểu gộp để biết số dòng trùng / cảnh báo (không ghi gì)
  const trial = build(db, parsed, { mode: 'merge', soQuy: true });
  return {
    kind: 'chi-phi',
    stats: {
      sheets: parsed.sheets,
      soDong: parsed.costs.length,
      tongChiPhi: tong,
      byLoai,
      soNhom: parsed.groups.length,
      soHangMuc: parsed.items.length,
      soVatTu: parsed.materials.length,
      soNha: parsed.houses.length,
      soNCC: parsed.suppliers.length,
      soQuy: { soDong: parsed.cash.length, tongThu: parsed.cash.reduce((t, c) => t + c.thu, 0), tongChi: parsed.cash.reduce((t, c) => t + c.chi, 0) },
      tongLuuSan: parsed.cachedTotal,
      trungKhiGop: trial.skipped,
      trungSoQuyKhiGop: trial.skippedCash,
      boQuaKyKhoa: trial.lockedSkipped + trial.lockedSkippedCash
    },
    ctCodes: ctCodesOf(parsed, db),
    projects: db.projects.map((p) => ({ ma: p.ma, ten: p.ten })),
    warnings: trial.warnings.slice(0, 300)
  };
}

// Áp dữ liệu vào kho (luôn tự sao lưu trước)
function applyCostImport(store, parsed, opts) {
  if (opts.mode === 'replace' && !parsed.costs.length && store.db.costs.length) {
    const err = new Error('File không có dòng chi phí nào nên không thể thay thế (sẽ xóa ' + store.db.costs.length + ' dòng đang có). Kiểm tra tiêu đề cột Ngày, Hạng mục, Số lượng của sheet NHATKYCHUNG hoặc dùng chế độ “Gộp thêm”.');
    err.status = 400;
    throw err;
  }
  const r = build(store.db, parsed, opts);
  store.replaceAll(r.db, opts.mode === 'replace' ? 'truoc-nhap-chi-phi' : 'truoc-gop-chi-phi');
  return { added: r.added, skipped: r.skipped, skippedCash: r.skippedCash, lockedSkipped: r.lockedSkipped + r.lockedSkippedCash, warnings: r.warnings };
}

module.exports = { parseCostWorkbook, previewOf, applyCostImport, build, ctCodesOf, costKey };
