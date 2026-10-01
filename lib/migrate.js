'use strict';
/*
 * Hỗ trợ chuyển dữ liệu ketoan.json → ketoan.db (SQLite):
 *  - phanTich(raw): liệt kê dữ liệu bất thường (mồ côi, trùng mã/id, số dạng chuỗi, ngày lạ, ký tự NUL, trường lạ…);
 *  - soLieu(db): các con số đối chiếu (số dòng từng bảng, tổng thu/chi, tồn quỹ, theo dự án, theo NCC, chi phí, công nợ, nextId);
 *  - soSanh(a, b): các chỉ tiêu lệch; canon(x): JSON chuẩn (khóa sắp xếp) để so sánh toàn bộ;
 *  - baoCao(...): nội dung file data/migrate-bao-cao.txt.
 * Mọi con số tính bằng chính các hàm của public/js/shared.js (như giao diện và báo cáo).
 */
const KT = require('../public/js/shared.js');
const { TABLES, TABLE_NAMES } = require('./db');

const LISTS = ['projects', 'suppliers', 'entries', 'costGroups', 'costItems', 'materials', 'houses', 'costs'];
const MONEY = { entries: ['thu', 'chi'], costs: ['thanhTien'], projects: ['nganSach'], cashCounts: ['thucTe', 'tonSo'] };
const QTY = { costs: ['soLuong', 'donGia'] };
const DATES = { entries: ['ngay'], costs: ['ngay'], cashCounts: ['ngay'] };
const REFS = [
  ['entries', 'maDuAn', 'projects', 'Dự án'], ['entries', 'maNCC', 'suppliers', 'NCC'],
  ['costs', 'maCT', 'projects', 'Công trình'], ['costs', 'maNCC', 'suppliers', 'NCC'], ['costs', 'maHM', 'costItems', 'Hạng mục'],
  ['costs', 'maVT', 'materials', 'Vật tư'], ['costs', 'maNha', 'houses', 'Nhà'],
  ['costItems', 'maNhom', 'costGroups', 'Nhóm CP'], ['materials', 'maHM', 'costItems', 'Hạng mục'], ['houses', 'maCT', 'projects', 'Công trình']
];
const LABEL = {
  projects: 'Dự án / công trình', suppliers: 'Nhà cung cấp', entries: 'Dòng sổ thu chi', costGroups: 'Nhóm chi phí', costItems: 'Hạng mục',
  materials: 'Vật tư', houses: 'Nhà', costs: 'Dòng chi phí', vouchers: 'Phiếu (thông tin in)', locks: 'Tháng khóa sổ',
  ignoredWarnings: 'Cảnh báo đã bỏ qua', cashCounts: 'Biên bản kiểm quỹ', attachments: 'Chứng từ đính kèm', trash: 'Mục thùng rác'
};

function canon(x) {
  return JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.keys(v).sort().reduce((o, key) => { o[key] = v[key]; return o; }, {}) : v));
}

const num = (v) => Number(v) || 0;
const isISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const show = (v) => { const s = JSON.stringify(v); return s && s.length > 60 ? s.slice(0, 57) + '…' : s; };

function phanTich(raw) {
  const out = [];
  const add = (s) => { if (out.length < 2000) out.push(s); };
  const list = (k) => (Array.isArray(raw[k]) ? raw[k] : []);
  if (Number(raw.schema || 1) < 3) add('Dữ liệu ở phiên bản cũ (schema ' + (raw.schema || 1) + '): được nâng cấp như bản trước vẫn làm (thêm danh mục chi phí mặc định nếu thiếu, bổ sung trường dự án).');
  Object.keys(raw).forEach((k) => {
    if (!['schema', 'settings', 'nextId', 'updatedAt', 'budgets'].concat(TABLE_NAMES).includes(k)) add('Khóa lạ ở cấp cao nhất "' + k + '": giữ nguyên (bảng meta, khóa khacGoc).');
  });
  if (Array.isArray(raw.budgets)) add('Khóa "budgets" (dự toán, chức năng đã bỏ, ' + raw.budgets.length + ' mục): bỏ như bản trước vẫn làm khi mở dữ liệu.');
  // id
  LISTS.concat(['cashCounts', 'attachments', 'trash']).forEach((k) => {
    const seen = new Map();
    list(k).forEach((r, i) => {
      if (!r || typeof r !== 'object') return;
      if (!Number.isSafeInteger(r.id) || r.id <= 0) add(LABEL[k] + ' vị trí ' + (i + 1) + ': id không hợp lệ (' + show(r.id) + ') → được cấp id mới.');
      else if (seen.has(r.id)) add(LABEL[k] + ': id ' + r.id + ' bị trùng (vị trí ' + (seen.get(r.id) + 1) + ' và ' + (i + 1) + ') → bản sau được cấp id mới.');
      else seen.set(r.id, i);
    });
  });
  // mã trùng (không phân biệt hoa thường)
  ['projects', 'suppliers', 'costGroups', 'costItems', 'materials', 'houses'].forEach((k) => {
    const seen = new Map();
    list(k).forEach((r) => {
      if (!r || typeof r !== 'object') return;
      const key = KT.keyOf(r.ma);
      if (!key) { add(LABEL[k] + ' id ' + r.id + ': mã rỗng — giữ nguyên.'); return; }
      if (seen.has(key)) add(LABEL[k] + ': mã "' + r.ma + '" trùng với "' + seen.get(key) + '" — giữ nguyên cả hai (không đổi mã để tổng hợp không lệch).');
      else seen.set(key, r.ma);
    });
  });
  // mồ côi
  REFS.forEach(([from, field, to, label]) => {
    const keys = new Set(list(to).map((x) => KT.keyOf(x && x.ma)));
    const miss = {};
    list(from).forEach((r) => {
      if (!r || typeof r !== 'object') return;
      const v = r[field];
      if (v === undefined || v === null || v === '') return;
      if (!keys.has(KT.keyOf(v))) (miss[String(v)] = miss[String(v)] || []).push(r.id !== undefined ? r.id : r.ma);
    });
    Object.keys(miss).forEach((ma) => add('Mồ côi: ' + LABEL[from] + ' ghi ' + label + ' "' + ma + '" không có trong danh mục (' + miss[ma].length + ' dòng, id ' +
      miss[ma].slice(0, 10).join(', ') + (miss[ma].length > 10 ? '…' : '') + ') — giữ nguyên.'));
  });
  // kiểu số, ngày
  Object.keys(MONEY).forEach((k) => list(k).forEach((r) => {
    if (!r || typeof r !== 'object') return;
    MONEY[k].forEach((f) => {
      const v = r[f];
      if (v === undefined || Number.isSafeInteger(v)) return;
      add(LABEL[k] + ' id ' + r.id + ': ' + f + ' = ' + show(v) + (typeof v === 'string' ? ' (số dạng chuỗi)' : typeof v === 'number' ? ' (tiền có số lẻ)' : '') +
        ' — giữ nguyên giá trị (lưu ở cột khac), cách tính giữ như bản trước.');
    });
  }));
  Object.keys(QTY).forEach((k) => list(k).forEach((r) => {
    if (!r || typeof r !== 'object') return;
    QTY[k].forEach((f) => {
      const v = r[f];
      if (v === undefined || (typeof v === 'number' && Number.isFinite(v))) return;
      add(LABEL[k] + ' id ' + r.id + ': ' + f + ' = ' + show(v) + ' không phải số — giữ nguyên giá trị (lưu ở cột khac).');
    });
  }));
  Object.keys(DATES).forEach((k) => list(k).forEach((r) => {
    if (!r || typeof r !== 'object') return;
    DATES[k].forEach((f) => { if (r[f] !== undefined && !isISO(r[f])) add(LABEL[k] + ' id ' + r.id + ': ngày "' + r[f] + '" không đúng dạng YYYY-MM-DD — giữ nguyên.'); });
  }));
  // ký tự NUL, trường lạ
  const nul = [];
  const walk = (v, p) => {
    if (typeof v === 'string') { if (v.indexOf('\0') >= 0) nul.push(p); } else if (v && typeof v === 'object') Object.keys(v).forEach((k) => walk(v[k], p + '.' + k));
  };
  walk(raw, 'db');
  nul.slice(0, 50).forEach((p) => add('Chuỗi có ký tự NUL tại ' + p + ' — giữ nguyên đủ ký tự (lưu dạng JSON ở cột khac, không bị cắt).'));
  if (nul.length > 50) add('… và ' + (nul.length - 50) + ' chuỗi khác có ký tự NUL.');
  TABLE_NAMES.forEach((k) => {
    const def = TABLES[k];
    const known = new Set(def.cols.map((c) => c[0]).concat(def.map ? [] : [def.key]));
    const extra = {};
    const recs = def.map ? Object.values(raw[k] && typeof raw[k] === 'object' ? raw[k] : {}) : list(k);
    recs.forEach((r) => { if (r && typeof r === 'object') Object.keys(r).forEach((f) => { if (!known.has(f)) extra[f] = (extra[f] || 0) + 1; }); });
    Object.keys(extra).forEach((f) => add(LABEL[k] + ': trường lạ "' + f + '" ở ' + extra[f] + ' bản ghi — giữ nguyên (cột khac).'));
  });
  return out;
}

function soLieu(db) {
  // Mỗi phần tính riêng: dữ liệu quá bất thường làm một hàm báo cáo lỗi thì phần đó ghi "lỗi: …" (hai phía cùng lỗi như nhau vẫn so được)
  const safe = (f) => { try { return f(); } catch (e) { return 'lỗi: ' + e.message; } };
  const posted = safe(() => KT.postedDb(db));
  const out = { soDong: {} };
  TABLE_NAMES.forEach((t) => { const v = db[t]; out.soDong[t] = Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0; });
  const E = Array.isArray(db.entries) ? db.entries : [];
  out.tongThu = E.reduce((a, e) => a + num(e.thu), 0);
  out.tongChi = E.reduce((a, e) => a + num(e.chi), 0);
  out.tonQuy = out.tongThu - out.tongChi;
  out.tonQuySo = safe(() => { const led = KT.buildLedger(posted); return led.length ? led[led.length - 1].ton : 0; });
  const pick = (rows, f) => rows.map((r) => [r.ma, f(r)]);
  out.theoDuAn = safe(() => {
    const ps = KT.projectSummary(posted, {});
    return pick(ps.rows, (r) => [r.thu, r.chi, r.soDong]).concat([['(không dự án)', [ps.khongDuAn.thu, ps.khongDuAn.chi, ps.khongDuAn.soDong]]]);
  });
  out.theoNCC = safe(() => {
    const ss = KT.supplierSummary(posted, {});
    return pick(ss.rows, (r) => [r.thu, r.chi, r.soDong]).concat([['(không NCC)', [ss.khongNCC.thu, ss.khongNCC.chi, ss.khongNCC.soDong]]]);
  });
  out.tongChiPhi = safe(() => KT.costSummary(posted, {}).total);
  const C = posted && Array.isArray(posted.costs) ? posted.costs : [];
  const by = (f) => { const m = {}; C.forEach((c) => { const k = String(c[f] || '').trim(); m[k] = (m[k] || 0) + num(c.thanhTien); }); return Object.keys(m).sort().map((k) => [k, m[k]]); };
  out.chiPhiTheoCongTrinh = by('maCT');
  out.chiPhiTheoNCC = by('maNCC');
  out.congNoNCC = safe(() => KT.supplierDebt(posted, {}).rows.filter((r) => r.phatSinh || r.daTra || r.conLai).map((r) => [r.ma, [r.phatSinh, r.daTra, r.conLai]]));
  out.nextId = db.nextId;
  return JSON.parse(JSON.stringify(out));
}

// Danh sách chỉ tiêu lệch giữa hai bộ số liệu (rỗng = khớp hoàn toàn)
function soSanh(a, b) {
  const diff = [];
  Object.keys(a).forEach((k) => {
    if (k === 'soDong') Object.keys(a.soDong).forEach((t) => { if (a.soDong[t] !== (b.soDong || {})[t]) diff.push('số dòng ' + t + ': ' + a.soDong[t] + ' ≠ ' + (b.soDong || {})[t]); });
    else if (canon(a[k]) !== canon(b[k])) diff.push(k);
  });
  return diff;
}

const money = (n) => (typeof n === 'number' ? KT.fmtMoney(n) : String(n));

function baoCao(info) {
  const L = [];
  const line = (s) => L.push(s === undefined ? '' : s);
  line('BÁO CÁO CHUYỂN DỮ LIỆU SANG SQLITE');
  line('==================================');
  line('Thời điểm      : ' + info.at);
  line('Kết quả        : ' + (info.ok ? 'THÀNH CÔNG — dữ liệu đã nằm trong ketoan.db' : 'KHÔNG CHUYỂN — ' + info.error));
  line('File nguồn     : ' + info.source + (info.sha256 ? ' (SHA-256 ' + info.sha256 + ')' : ''));
  if (info.recoveredFrom) line('LƯU Ý          : ketoan.json bị hỏng; dữ liệu lấy từ bản sao lưu ' + info.recoveredFrom + ' (file hỏng giữ lại: ' + info.keptBroken + ')');
  line('Bản sao lưu    : ' + (info.backup ? 'backups/' + info.backup : '(không có)'));
  line('Phiên bản      : dữ liệu JSON schema ' + info.fromSchema + ' → SQLite user_version ' + info.toVersion + '; Node.js ' + process.versions.node);
  if (info.ok) line('File gốc       : đã đổi tên thành ketoan.json.da-chuyen-sqlite.bak (giữ nguyên nội dung, không bị xóa)');
  else line('File gốc       : GIỮ NGUYÊN, không bị sửa. Phần mềm dừng để không ghi dữ liệu vào nơi chưa kiểm chứng.');
  line();
  if (info.src && info.dst) {
    line('ĐỐI CHIẾU (dữ liệu JSON đã chuẩn hóa ↔ đọc lại từ SQLite)');
    line('--------------------------------------------------------');
    const pad = (x, n) => (String(x) + ' '.repeat(n)).slice(0, n);
    const row = (name, a, b, same) => line(pad(name, 44) + pad(a, 20) + pad(b, 20) + ((same === undefined ? canon(a) === canon(b) : same) ? 'khớp' : 'LỆCH'));
    line(pad('Chỉ tiêu', 44) + pad('JSON', 20) + pad('SQLite', 20) + 'Kết quả');
    TABLE_NAMES.forEach((t) => row('Số ' + (LABEL[t] || t).toLowerCase(), info.src.soDong[t], info.dst.soDong[t]));
    row('Tổng thu', money(info.src.tongThu), money(info.dst.tongThu));
    row('Tổng chi', money(info.src.tongChi), money(info.dst.tongChi));
    row('Tồn quỹ (mọi dòng)', money(info.src.tonQuy), money(info.dst.tonQuy));
    row('Tồn quỹ theo sổ (đã ghi sổ)', money(info.src.tonQuySo), money(info.dst.tonQuySo));
    row('Tổng chi phí công trình', money(info.src.tongChiPhi), money(info.dst.tongChiPhi));
    row('Bộ đếm id (nextId)', info.src.nextId, info.dst.nextId);
    [['theoDuAn', 'Theo dự án (thu, chi, số dòng)'], ['theoNCC', 'Theo NCC (thu, chi, số dòng)'], ['chiPhiTheoCongTrinh', 'Chi phí theo công trình'],
      ['chiPhiTheoNCC', 'Chi phí theo NCC'], ['congNoNCC', 'Công nợ NCC (phát sinh, đã trả, còn lại)']].forEach(([k, label]) => {
      const a = info.src[k] || [];
      const b = info.dst[k] || [];
      row(label, a.length + ' mục', b.length + ' mục', canon(a) === canon(b));
    });
    line('So sánh toàn bộ bản ghi (mọi trường, thứ tự): ' + (info.fullMatch ? 'khớp' : 'LỆCH'));
    line();
    if (Array.isArray(info.dst.theoDuAn) && info.dst.theoDuAn.length) {
      line('Chi tiết theo dự án (SQLite): mã | thu | chi | số dòng');
      info.dst.theoDuAn.forEach(([ma, v]) => line('  ' + ma + ' | ' + money(v[0]) + ' | ' + money(v[1]) + ' | ' + v[2]));
      line();
    }
  }
  line('DỮ LIỆU BẤT THƯỜNG VÀ CÁCH XỬ LÝ');
  line('--------------------------------');
  if (!info.anomalies || !info.anomalies.length) line('Không phát hiện dữ liệu bất thường.');
  else info.anomalies.forEach((s) => line('- ' + s));
  line();
  line('CHUẨN HÓA NHẸ ĐÃ LÀM');
  line('--------------------');
  if (!info.fixes || !info.fixes.length) line('Không phải chỉnh gì.');
  else info.fixes.forEach((s) => line('- ' + s));
  line();
  return L.join('\r\n');
}

module.exports = { phanTich, soLieu, soSanh, canon, baoCao, LISTS };
