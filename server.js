'use strict';
/*
 * Sổ Thu Chi — máy chủ chạy trên máy tính của bạn (chỉ nghe trên 127.0.0.1).
 * Chạy: node server.js   (hoặc bấm đúp KhoiDong.bat)
 */
// Kiểm tra phiên bản Node trước khi nạp các thư viện khác (báo lỗi dễ hiểu thay vì lỗi khó đọc).
// Dữ liệu lưu bằng SQLite có sẵn trong Node (node:sqlite): cần Node 24.16.0 trở lên (dòng 24) hoặc 26.1.0 trở lên —
// bản cũ hơn có lỗi cắt mất phần chữ sau ký tự NUL khi ghi vào SQLite. (Dòng 25 và 26.0 không được hỗ trợ.)
const { nodeOk, NODE_YEU_CAU } = require('./lib/node-version');
if (!nodeOk(process.versions.node)) {
  if (process.env.KETOAN_CHO_NODE_CU === '1') {
    console.warn('  CẢNH BÁO: Node.js ' + process.versions.node + ' thấp hơn yêu cầu (' + NODE_YEU_CAU + '). Chỉ chạy vì đặt KETOAN_CHO_NODE_CU=1 (dùng để kiểm thử).');
  } else {
    console.error('');
    console.error('  Phiên bản Node.js trên máy là ' + process.versions.node + ' — không dùng được.');
    console.error('  Phần mềm cần Node.js ' + NODE_YEU_CAU + '.');
    console.error('  Hãy tải bản "LTS" mới tại https://nodejs.org (chọn Windows Installer .msi), cài đặt, rồi chạy lại.');
    console.error('');
    process.exit(1);
  }
}

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { URL } = require('url');
const { Worker } = require('worker_threads');

const { Store } = require('./lib/store');
const KT = require('./public/js/shared.js');
const importer = require('./lib/importer');
const exporter = require('./lib/exporter');
const costImporter = require('./lib/costImporter');
const costExporter = require('./lib/costExporter');
const createCostApi = require('./lib/costApi');
const createTrace = require('./lib/traceApi');
const createCashCountApi = require('./lib/cashCountApi');
const createAttachApi = require('./lib/attachApi');
const createMergeApi = require('./lib/mergeApi');
const aliasImport = require('./lib/aliasImport');
const JSZip = require('jszip');
const { dataSummary } = require('./lib/store');
const { looksLikeSqlite } = require('./lib/db');

const APP_ID = 'so-thu-chi-ke-toan';
const VERSION = require('./package.json').version;
const HOST = '127.0.0.1';
const BASE_PORT = Number(process.env.PORT) || 3939;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = process.env.KETOAN_DATA || path.join(ROOT, 'data');
const NO_OPEN = process.argv.includes('--no-open') || process.env.NO_OPEN === '1';

let store;
try {
  store = new Store(DATA_DIR);
} catch (e) {
  console.error('');
  console.error('  Không mở được dữ liệu: ' + e.message);
  console.error('');
  process.exit(1);
}

/* ---------------- tiện ích HTTP ---------------- */

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Tiêu đề bảo mật cho mọi phản hồi: chặn chạy mã chèn thêm (CSP), chặn nhúng vào khung của trang khác, không đoán kiểu nội dung, không gửi Referer.
// Giao diện không dùng mã nhúng trong trang (chỉ tệp .js cùng nguồn) nên script-src 'self' là đủ; style-src cần 'unsafe-inline' vì các thanh tỷ lệ dùng style="width:..%".
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer'
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({ 'Cache-Control': 'no-store' }, SECURITY_HEADERS, headers || {}));
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

function ok(res, extra) {
  sendJson(res, 200, Object.assign({ ok: true, db: store.publicDb() }, extra || {}));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let over = false;
    req.on('data', (c) => {
      if (over) return; // phần còn lại: đọc bỏ đi để kịp trả lời 413 rõ ràng (không cắt ngang kết nối)
      size += c.length;
      if (size > limit) { over = true; chunks.length = 0; reject(new HttpError(413, 'Dữ liệu gửi lên quá lớn (tối đa ' + Math.round(limit / 1048576) + ' MB)')); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req, 50 * 1024 * 1024);
  if (!buf.length) return {};
  let v;
  try { v = JSON.parse(buf.toString('utf8')); } catch (e) { throw new HttpError(400, 'Dữ liệu JSON không hợp lệ'); }
  // mọi chức năng đều nhận một đối tượng; null, mảng, số, chuỗi... là sai kiểu
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'Dữ liệu gửi lên phải là một đối tượng JSON');
  return v;
}

// Danh sách id gửi lên: mảng số (hoặc chuỗi số)
function idList(v) {
  if (v === undefined || v === null) return new Set();
  if (!Array.isArray(v) || v.length > 100000) throw new HttpError(400, 'Danh sách ids phải là một mảng số');
  const out = new Set();
  v.forEach((x) => {
    if (!(typeof x === 'number' || (typeof x === 'string' && /^\d+$/.test(x))) || !Number.isInteger(Number(x))) throw new HttpError(400, 'Danh sách ids phải là một mảng số');
    out.add(Number(x));
  });
  return out;
}

function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

function attachment(res, buffer, filename, type) {
  const ascii = filename.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w.-]+/g, '_');
  send(res, 200, buffer, {
    'Content-Type': type,
    'Content-Disposition': 'attachment; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(filename),
    'Content-Length': buffer.length
  });
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function stampNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
}

function rangeSuffix(f) {
  if (f.from || f.to) return '_' + (f.from || '').replace(/-/g, '') + '-' + (f.to || '').replace(/-/g, '');
  return '_' + stampNow();
}

/* ---------------- kiểm tra dữ liệu ---------------- */

function str(v, max) {
  if ((v !== null && typeof v === 'object') || typeof v === 'boolean' || typeof v === 'function') throw new HttpError(400, 'Dữ liệu sai kiểu (cần chữ hoặc số)');
  // NFC: chữ có dấu gõ kiểu tổ hợp (Mac, một số file Excel) và kiểu dựng sẵn phải là một, nếu không mã sẽ tra không ra
  return String(v == null ? '' : v).normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, max || 500);
}

function money(v, label) {
  if ((v !== null && typeof v === 'object') || typeof v === 'boolean') throw new HttpError(400, label + ' không hợp lệ (cần số hoặc chữ như 50tr)');
  const n = typeof v === 'number' ? Math.round(v) : KT.parseAmount(v);
  if (isNaN(n)) throw new HttpError(400, label + ' không hợp lệ');
  if (n < 0) throw new HttpError(400, label + ' không được âm');
  if (n > 1e15) throw new HttpError(400, label + ' quá lớn');
  return n;
}

// Danh mục gộp được (gộp mã): tên danh sách → loại mã
const LOAI_OF_LIST = { projects: 'da', suppliers: 'ncc', materials: 'vt', costItems: 'hm', houses: 'nha' };
function loaiOfList(list) { return Object.keys(LOAI_OF_LIST).filter((k) => store.db[k] === list).map((k) => LOAI_OF_LIST[k])[0] || ''; }

// Tìm mã đang dùng trong danh mục (không phân biệt hoa thường). Mã cũ đã gộp → theo bí danh về mã đích.
// Bản ghi "Đã gộp vào …" không bao giờ được trả về (không dùng để nhập mới).
function findCode(list, ma) {
  const loai = loaiOfList(list);
  const t = loai ? KT.resolveAlias(store.db, loai, ma) : ma;
  return list.find((x) => !x.gopVao && KT.keyOf(x.ma) === KT.keyOf(t));
}

// Mã đã gộp vào mã khác (còn bản ghi "Đã gộp" hoặc còn bí danh) → không cho tạo mới / đổi sang mã này
function assertNotMerged(list, ma, label) {
  const loai = loaiOfList(list);
  if (!loai || !ma) return;
  const k = KT.keyOf(ma);
  if (list.some((x) => !x.gopVao && KT.keyOf(x.ma) === k)) return;
  const dich = KT.resolveAlias(store.db, loai, ma);
  const gone = list.find((x) => x.gopVao && KT.keyOf(x.ma) === k);
  if (gone || dich !== String(ma).trim()) {
    throw new HttpError(400, label + ' "' + ma + '" đã được gộp vào "' + (dich !== String(ma).trim() ? dich : gone.gopVao) + '": không dùng mã này để tạo mới, hãy dùng mã đích (hoặc hoàn tác lần gộp).');
  }
}
// Bản ghi đã gộp chỉ để tra lịch sử / hoàn tác: không sửa, không xóa
function assertActive(rec, label) {
  if (rec && rec.gopVao) throw new HttpError(400, label + ' "' + rec.ma + '" đã được gộp vào "' + rec.gopVao + '": không sửa / xóa được. Muốn dùng lại thì hoàn tác lần gộp ở màn Gộp mã.');
}

function cleanEntry(body) {
  const e = {
    ngay: str(body.ngay, 10),
    soPhieu: str(body.soPhieu, 40),
    maDuAn: str(body.maDuAn, 60),
    maNCC: str(body.maNCC, 60),
    noiDung: str(body.noiDung, 1000),
    thu: money(body.thu || 0, 'Số tiền thu'),
    chi: money(body.chi || 0, 'Số tiền chi'),
    nguoiNhan: str(body.nguoiNhan, 200),
    ghiChu: str(body.ghiChu, 1000)
  };
  if (!KT.isISODate(e.ngay)) throw new HttpError(400, 'Ngày không hợp lệ');
  if (!e.noiDung && !e.thu && !e.chi) throw new HttpError(400, 'Cần nhập nội dung hoặc số tiền');
  // Trạng thái: 'nhap' = Nháp (chưa ghi sổ, không tính vào tồn quỹ, báo cáo, công nợ). Đã ghi sổ thì không lưu trường này.
  if (body.trangThai === 'nhap') e.trangThai = 'nhap';
  if (e.maDuAn) {
    const p = findCode(store.db.projects, e.maDuAn); // mã dự án cũ đã gộp tự đổi sang mã đích
    if (!p) throw new HttpError(400, 'Mã dự án "' + e.maDuAn + '" chưa có trong danh mục');
    e.maDuAn = p.ma;
  }
  if (e.maNCC) {
    const s = findCode(store.db.suppliers, e.maNCC);
    if (!s) throw new HttpError(400, 'Mã NCC "' + e.maNCC + '" chưa có trong danh mục');
    e.maNCC = s.ma;
  }
  return e;
}

function cleanProject(body) {
  const p = {
    ma: str(body.ma, 60),
    ten: str(body.ten, 300),
    nganSach: money(body.nganSach || 0, 'Ngân sách'),
    trangThai: str(body.trangThai, 60) || 'Đang thực hiện',
    ghiChu: str(body.ghiChu, 1000)
  };
  // Thông tin công trình (DM_CONGTRINH) — chỉ ghi khi biểu mẫu có gửi lên
  if (body.ngayKhoiCong !== undefined) {
    p.ngayKhoiCong = KT.isISODate(body.ngayKhoiCong) ? body.ngayKhoiCong : '';
    if (str(body.ngayKhoiCong) && !p.ngayKhoiCong) throw new HttpError(400, 'Ngày khởi công không hợp lệ');
  }
  if (body.diaChi !== undefined) p.diaChi = str(body.diaChi, 300);
  if (!p.ma) throw new HttpError(400, 'Cần nhập mã dự án');
  if (!p.ten) throw new HttpError(400, 'Cần nhập tên dự án');
  return p;
}

function cleanSupplier(body) {
  const s = {
    ma: str(body.ma, 60),
    ten: str(body.ten, 300),
    loai: str(body.loai, 120),
    sdt: str(body.sdt, 60),
    diaChi: str(body.diaChi, 300),
    ghiChu: str(body.ghiChu, 1000)
  };
  if (!s.ma) throw new HttpError(400, 'Cần nhập mã NCC');
  if (!s.ten) throw new HttpError(400, 'Cần nhập tên NCC / đối tượng');
  return s;
}

function byId(list, id) {
  const x = list.find((i) => i.id === Number(id));
  if (!x) throw new HttpError(404, 'Không tìm thấy dữ liệu (có thể đã bị xóa)');
  return x;
}

function usage(field, ma) {
  return store.db.entries.filter((e) => KT.keyOf(e[field]) === KT.keyOf(ma)).length;
}

// Bản sao lưu đưa vào phải đúng hình dạng: các danh sách là mảng đối tượng (tránh làm hỏng kho khi file lạ)
function checkDbShape(d) {
  ['projects', 'suppliers', 'entries', 'costGroups', 'costItems', 'materials', 'houses', 'costs', 'cashCounts', 'attachments'].forEach((k) => {
    if (d[k] === undefined) return;
    if (!Array.isArray(d[k]) || d[k].some((x) => x === null || typeof x !== 'object' || Array.isArray(x))) throw new HttpError(400, 'File sao lưu không hợp lệ: "' + k + '" phải là danh sách các bản ghi');
  });
  if (d.vouchers !== undefined && (d.vouchers === null || typeof d.vouchers !== 'object' || Array.isArray(d.vouchers))) throw new HttpError(400, 'File sao lưu không hợp lệ: "vouchers"');
  if (d.settings !== undefined && (d.settings === null || typeof d.settings !== 'object' || Array.isArray(d.settings))) throw new HttpError(400, 'File sao lưu không hợp lệ: "settings"');
  if (d.trash !== undefined && (!Array.isArray(d.trash) || d.trash.some((t) => t === null || typeof t !== 'object' || !Array.isArray(t.records)))) throw new HttpError(400, 'File sao lưu không hợp lệ: "trash"');
}

const trace = createTrace({ store, HttpError, str, readJson, ok, sendJson, findCode });
const costApi = createCostApi({ store, HttpError, str, money, readJson, ok, sendJson, findCode, byId, idList, own, trace, assertNotMerged, assertActive,
  renameTargets: (loai, a, b) => mergeApi.renameTargets(loai, a, b) });
const mergeApi = createMergeApi({ store, HttpError, str, readJson, ok, sendJson, trace });
const cashCountApi = createCashCountApi({ store, HttpError, str, money, readJson, ok, byId, trace });
const attachApi = createAttachApi({ store, HttpError, str, sendJson, ok, readBody, trace, send });
trace.hooks.afterPurge.push((item) => attachApi.retire(item.kind === 'attachments' ? item.records : (item.attachments || [])));

// Dựng file Excel: dữ liệu nhỏ thì làm ngay; dữ liệu lớn thì giao cho luồng riêng để máy chủ không đứng hình
const BIG_EXPORT_ROWS = 3000;
function runExport(mod, fn, args) {
  const m = mod === 'cost' ? costExporter : exporter;
  if (store.db.costs.length + store.db.entries.length <= BIG_EXPORT_ROWS) return m[fn].apply(null, args);
  return new Promise((resolve, reject) => {
    const w = new Worker(path.join(ROOT, 'lib', 'exportWorker.js'), { workerData: { mod, fn, args } });
    let done = false;
    w.once('message', (r) => {
      done = true;
      if (r.ok) resolve(Buffer.from(r.buf)); else { const e = new Error(r.error); e.status = r.status; reject(e); }
    });
    w.once('error', (e) => { if (!done) { done = true; reject(e); } });
    w.once('exit', (code) => { if (!done) { done = true; reject(new Error('Luồng tạo file Excel dừng đột ngột (mã ' + code + ')')); } });
  });
}

/* ---------------- xử lý API ---------------- */

async function handleApi(req, res, url) {
  const p = url.pathname;
  const m = req.method;
  const seg = p.split('/').filter(Boolean); // ['api', ...]
  const db = store.db;
  const now = new Date().toISOString();

  if (p === '/api/ping') return sendJson(res, 200, { app: APP_ID, version: VERSION });
  if (p === '/api/db' && m === 'GET') return ok(res);

  /* ----- Sổ thu chi ----- */
  if (seg[1] === 'entries') {
    if (m === 'POST' && seg.length === 2) {
      const e = cleanEntry(await readJson(req));
      trace.assertOpen([e.ngay], 'thêm dòng');
      const rec = Object.assign({ id: store.newId(), seq: store.nextSeq(), createdAt: now, updatedAt: now }, e);
      db.entries.push(rec);
      trace.log(req, 'them', 'entries', rec, null, rec, KT.isDraft(rec) ? { note: 'Lưu nháp (chưa ghi sổ)' } : null);
      store.save();
      return ok(res, { id: rec.id });
    }
    if (m === 'POST' && seg[2] === 'delete') {
      const body = await readJson(req);
      const ids = idList(body.ids);
      const gone = db.entries.filter((e) => ids.has(e.id));
      trace.assertOpen(gone.map((e) => e.ngay), 'xóa');
      db.entries = db.entries.filter((e) => !ids.has(e.id));
      if (gone.length) trace.toTrash(req, 'entries', gone, gone.length === 1 ? 'Dòng sổ ' + trace.describe('entries', gone[0]) : gone.length + ' dòng sổ thu chi');
      store.save();
      return ok(res, { deleted: gone.length });
    }
    // Ghi sổ các dòng nháp: POST /api/entries/post { ids }
    if (m === 'POST' && seg[2] === 'post' && seg.length === 3) {
      const ids = idList((await readJson(req)).ids);
      const list = db.entries.filter((e) => ids.has(e.id) && KT.isDraft(e));
      trace.assertOpen(list.map((e) => e.ngay), 'ghi sổ');
      list.forEach((rec) => {
        const before = trace.clone(rec);
        delete rec.trangThai;
        rec.updatedAt = now;
        trace.log(req, 'ghi-so', 'entries', rec, before, rec);
      });
      store.save();
      return ok(res, { posted: list.length });
    }
    if (seg.length === 3) {
      const rec = byId(db.entries, seg[2]);
      if (m === 'PUT') {
        const before = trace.clone(rec);
        const e = cleanEntry(await readJson(req));
        trace.assertOpen([rec.ngay, e.ngay], 'sửa');
        Object.assign(rec, e, { updatedAt: now });
        if (!e.trangThai) delete rec.trangThai;
        trace.log(req, KT.isDraft(before) && !KT.isDraft(rec) ? 'ghi-so' : 'sua', 'entries', rec, before, rec);
        store.save();
        return ok(res, { id: rec.id });
      }
      if (m === 'DELETE') {
        trace.assertOpen([rec.ngay], 'xóa');
        db.entries = db.entries.filter((e) => e !== rec);
        trace.toTrash(req, 'entries', [rec], 'Dòng sổ ' + trace.describe('entries', rec));
        store.save();
        return ok(res);
      }
    }
  }

  /* ----- Danh mục dự án / NCC ----- */
  const catalogs = {
    projects: { clean: cleanProject, field: 'maDuAn', label: 'Mã dự án' },
    suppliers: { clean: cleanSupplier, field: 'maNCC', label: 'Mã NCC' }
  };
  if (own(catalogs, seg[1])) {
    const cfg = catalogs[seg[1]];
    const list = db[seg[1]];
    if (m === 'POST' && seg.length === 2) {
      const x = cfg.clean(await readJson(req));
      if (findCode(list, x.ma)) throw new HttpError(400, cfg.label + ' "' + x.ma + '" đã tồn tại');
      assertNotMerged(list, x.ma, cfg.label);
      const rec = Object.assign({ id: store.newId() }, x);
      list.push(rec);
      trace.log(req, 'them', seg[1], rec, null, rec);
      store.save();
      return ok(res, { id: rec.id });
    }
    if (seg.length === 3) {
      const rec = byId(list, seg[2]);
      assertActive(rec, cfg.label);
      if (m === 'PUT') {
        const before = trace.clone(rec);
        const x = cfg.clean(await readJson(req));
        const dup = findCode(list, x.ma);
        if (dup && dup !== rec) throw new HttpError(400, cfg.label + ' "' + x.ma + '" đã tồn tại');
        if (KT.keyOf(x.ma) !== KT.keyOf(rec.ma)) assertNotMerged(list, x.ma, cfg.label);
        const oldKey = KT.keyOf(rec.ma);
        let renamed = 0;
        if (oldKey !== KT.keyOf(x.ma) || rec.ma !== x.ma) {
          db.entries.forEach((e) => {
            if (KT.keyOf(e[cfg.field]) === oldKey) { e[cfg.field] = x.ma; e.updatedAt = now; renamed++; }
          });
          renamed += costApi.cascadeRename(seg[1], rec.ma, x.ma, now);
          mergeApi.renameTargets(LOAI_OF_LIST[seg[1]], rec.ma, x.ma); // bí danh / mã đã gộp đang trỏ tới mã cũ
        }
        Object.assign(rec, x);
        trace.log(req, 'sua', seg[1], rec, before, rec, renamed ? { note: 'Đổi mã ' + before.ma + ' → ' + rec.ma + ', cập nhật ' + renamed + ' chỗ đang dùng' } : null);
        store.save();
        return ok(res, { id: rec.id, renamed });
      }
      if (m === 'DELETE') {
        const n = usage(cfg.field, rec.ma);
        if (n > 0) throw new HttpError(400, 'Không thể xóa: ' + cfg.label + ' "' + rec.ma + '" đang được dùng trong ' + n + ' dòng sổ thu chi.');
        const used = costApi.usages(seg[1], rec.ma);
        if (used.length) throw new HttpError(400, 'Không thể xóa: ' + cfg.label + ' "' + rec.ma + '" đang được dùng trong ' + used.join(', ') + ' (chi phí công trình).');
        db[seg[1]] = list.filter((i) => i !== rec);
        trace.toTrash(req, seg[1], [rec], (seg[1] === 'projects' ? 'Dự án ' : 'Nhà cung cấp ') + trace.describe(seg[1], rec));
        store.save();
        return ok(res);
      }
    }
  }

  /* ----- Thông tin in phiếu ----- */
  if (seg[1] === 'vouchers' && m === 'PUT') {
    const key = KT.voucherKey(decodeURIComponent(seg.slice(2).join('/')));
    if (!key) throw new HttpError(400, 'Thiếu số phiếu');
    const body = await readJson(req);
    const ov = {
      ngay: KT.isISODate(body.ngay) ? body.ngay : '',
      nguoiNhan: str(body.nguoiNhan, 200),
      diaChi: str(body.diaChi, 300),
      lyDo: str(body.lyDo, 2000),
      hinhThuc: str(body.hinhThuc, 60),
      kemTheo: str(body.kemTheo, 60)
    };
    Object.keys(ov).forEach((k) => { if (!ov[k]) delete ov[k]; });
    const before = db.vouchers[key] || null;
    if (Object.keys(ov).length) db.vouchers[key] = ov; else delete db.vouchers[key];
    trace.log(req, 'sua', 'vouchers', key, before, db.vouchers[key] || null, { label: 'Thông tin in phiếu ' + key });
    store.save();
    return ok(res);
  }

  if (seg[1] === 'vouchers' && seg[2] === 'next' && m === 'GET') {
    return sendJson(res, 200, { ok: true, soPhieu: KT.nextVoucherNo(db, url.searchParams.get('loai'), url.searchParams.get('ngay')) });
  }

  /* ----- Cài đặt ----- */
  if (p === '/api/settings' && m === 'PUT') {
    const b = await readJson(req);
    const s = db.settings;
    const before = trace.clone(s);
    ['tenDonVi', 'diaChi', 'giamDoc', 'keToanTruong', 'thuQuy', 'nguoiLap', 'hinhThucMacDinh'].forEach((k) => {
      if (b[k] !== undefined) s[k] = str(b[k], 300);
    });
    if (b.hienKeToanTruong !== undefined) s.hienKeToanTruong = !!b.hienKeToanTruong;
    // ngưỡng kiểm tra bất thường (màn hình Cần xử lý)
    [['nguongLechGia', 1, 1000], ['soNgayNhapTon', 1, 365]].forEach(([k, lo, hi]) => {
      if (b[k] === undefined) return;
      const n = Number(b[k]);
      if (!Number.isInteger(n) || n < lo || n > hi) throw new HttpError(400, 'Ngưỡng không hợp lệ (' + lo + '–' + hi + ')');
      s[k] = n;
    });
    trace.log(req, 'cai-dat', 'settings', 'settings', before, s, { label: 'Thông tin đơn vị và in phiếu' });
    store.save();
    return ok(res);
  }

  /* ----- Nhập Excel ----- */
  if (p === '/api/import' && m === 'POST') {
    const buf = await readBody(req, 60 * 1024 * 1024);
    if (buf.length < 100) throw new HttpError(400, 'File rỗng');
    let parsed;
    let isCost = false;
    try {
      // File chi phí công trình (NHATKYCHUNG, DM_HANGMUC...) hay file sổ thu chi
      parsed = await costImporter.parseCostWorkbook(buf, store.db);
      isCost = !!parsed;
      if (!parsed) parsed = await importer.parseWorkbook(buf);
    } catch (e) {
      throw new HttpError(400, 'Không đọc được file Excel: ' + e.message);
    }
    // Bí danh (gộp mã): mã cũ trong file → mã đích, có dòng báo cáo cho từng lần đổi (hiện cả ở bước xem trước)
    const tenFile = String(url.searchParams.get('ten') || '').slice(0, 200);
    const biDanh = isCost ? aliasImport.costBook(store.db, parsed, tenFile) : aliasImport.cashBook(store.db, parsed, tenFile);
    if (isCost) {
      if (url.searchParams.get('dryRun') === '1') {
        return sendJson(res, 200, { ok: true, preview: Object.assign(costImporter.previewOf(parsed, store.db), { biDanh }) });
      }
      let map = {};
      try { map = JSON.parse(url.searchParams.get('map') || '{}'); } catch (e) { throw new HttpError(400, 'Bảng ghép mã công trình không hợp lệ'); }
      const opts = {
        mode: url.searchParams.get('mode') === 'replace' ? 'replace' : 'merge',
        soQuy: url.searchParams.get('soQuy') === '1',
        map
      };
      const result = costImporter.applyCostImport(store, parsed, opts);
      result.biDanh = biDanh;
      trace.log(req, 'nhap-excel', 'costs', '', null, null, { label: 'Nhập file Excel chi phí công trình' + (tenFile ? ' ' + tenFile : '') + ' (' + (opts.mode === 'replace' ? 'thay toàn bộ chi phí' : 'gộp thêm') + ')',
        note: 'Thêm ' + JSON.stringify(result.added || {}) + (result.skipped ? ', bỏ qua ' + result.skipped + ' dòng trùng' : '') + (biDanh.length ? '; ' + biDanh.length + ' lần đổi mã cũ theo bí danh' : '') +
          '. Sau khi nhập: ' + dataSummary(store.db) });
      store.flushAudit();
      return ok(res, { kind: 'chi-phi', result, warnings: result.warnings.slice(0, 300), biDanh });
    }
    if (url.searchParams.get('dryRun') === '1') {
      const nLocked = KT.isLockedDate(store.db, '') || !store.db.locks.length ? 0 : parsed.entries.filter((e) => KT.isLockedDate(store.db, e.ngay)).length;
      const w = (nLocked ? ['Có ' + nLocked + ' dòng thuộc tháng đã khóa sổ: sẽ được bỏ qua khi nhập.'] : []).concat(parsed.warnings);
      return sendJson(res, 200, { ok: true, preview: { stats: parsed.stats, warnings: w.slice(0, 200), settings: parsed.settings, biDanh } });
    }
    const mode = url.searchParams.get('mode') === 'merge' ? 'merge' : 'replace';
    const result = importer.applyImport(store, parsed, mode);
    result.biDanh = biDanh;
    trace.log(req, 'nhap-excel', 'entries', '', null, null, { label: 'Nhập file Excel sổ thu chi' + (tenFile ? ' ' + tenFile : '') + ' (' + (mode === 'replace' ? 'thay toàn bộ' : 'gộp thêm') + ')',
      note: 'Thêm ' + JSON.stringify(result.added || {}) + (result.skipped ? ', bỏ qua ' + result.skipped + ' dòng trùng' : '') + (biDanh.length ? '; ' + biDanh.length + ' lần đổi mã cũ theo bí danh' : '') +
        '. Sau khi nhập: ' + dataSummary(store.db) });
    store.flushAudit();
    return ok(res, { result, warnings: parsed.warnings.slice(0, 200), biDanh });
  }

  /* ----- Sao lưu / khôi phục ----- */
  // Bản sao lưu chỉ dữ liệu: file .db (SQLite) nhất quán
  if (p === '/api/backup' && m === 'GET') {
    return attachment(res, store.snapshotBuffer(), 'SaoLuu_SoThuChi_' + stampNow() + '.db', 'application/vnd.sqlite3');
  }
  // Xuất toàn bộ dữ liệu ra .json (cùng dạng ketoan.json cũ: bản phần mềm trước khi chuyển sang SQLite mở được)
  if (p === '/api/backup-json' && m === 'GET') {
    return attachment(res, Buffer.from(store.exportJson(), 'utf8'), 'DuLieu_SoThuChi_' + stampNow() + '.json', 'application/json');
  }
  // Bản sao lưu đầy đủ (.zip): dữ liệu (.db và .json) + chứng từ đính kèm + nhật ký thay đổi
  if (p === '/api/backup-zip' && m === 'GET') {
    const zip = new JSZip();
    zip.file('ketoan.db', store.snapshotBuffer());
    zip.file('ketoan.json', store.exportJson());
    if (fs.existsSync(store.log.file)) zip.file('nhat-ky.jsonl', fs.readFileSync(store.log.file));
    const metas = store.db.attachments.concat(...store.db.trash.map((t) => (t.kind === 'attachments' ? t.records : t.attachments || [])));
    let n = 0;
    metas.forEach((a) => { const f = attachApi.fileOf(a); if (f) { zip.file(a.file, fs.readFileSync(f)); n++; } });
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 3 } });
    return attachment(res, buf, 'SaoLuuDayDu_SoThuChi_' + stampNow() + '.zip', 'application/zip');
  }
  // Khôi phục từ bản sao lưu đầy đủ (.zip): thay dữ liệu, chép lại file chứng từ còn thiếu (không ghi đè file đang có)
  if (p === '/api/restore-zip' && m === 'POST') {
    const buf = await readBody(req, 1024 * 1024 * 1024);
    let zip;
    try { zip = await JSZip.loadAsync(buf); } catch (e) { throw new HttpError(400, 'File không phải bản sao lưu .zip của phần mềm'); }
    // zip của bản SQLite có ketoan.db (ưu tiên) và ketoan.json; zip của bản cũ chỉ có ketoan.json
    const dbf = zip.file('ketoan.db');
    const jf = zip.file('ketoan.json');
    if (!dbf && !jf) throw new HttpError(400, 'File .zip không có ketoan.db hay ketoan.json');
    let data;
    if (dbf) {
      try { data = store.readDbBuffer(await dbf.async('nodebuffer')); } catch (e) { throw new HttpError(400, 'ketoan.db trong file .zip không dùng được: ' + e.message); }
    } else {
      try { data = JSON.parse((await jf.async('string')).replace(/^\uFEFF/, '')); } catch (e) { throw new HttpError(400, 'ketoan.json trong file .zip bị hỏng'); }
    }
    if (!data || typeof data !== 'object' || !Array.isArray(data.entries) || !Array.isArray(data.projects) || !Array.isArray(data.suppliers)) throw new HttpError(400, 'File sao lưu không hợp lệ (thiếu entries/projects/suppliers)');
    checkDbShape(data);
    let copied = 0;
    for (const name of Object.keys(zip.files)) {
      const zf = zip.files[name];
      if (zf.dir || !attachApi.SAFE_FILE.test(name)) continue; // chỉ nhận đúng dạng attachments/yyyy-mm/<id>-<hex>.<đuôi>
      const dst = path.join(store.dir, name);
      if (fs.existsSync(dst)) continue;
      const content = await zf.async('nodebuffer');
      if (!attachApi.sniff(content)) continue;
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, content, { flag: 'wx' });
      copied++;
    }
    trace.log(req, 'khoi-phuc-sao-luu', 'data', '', null, null, { label: 'Khôi phục từ bản sao lưu đầy đủ (.zip)', note: 'Dữ liệu sau khôi phục: ' + dataSummary(data) + '; chép ' + copied + ' file chứng từ' });
    const bk = store.replaceAll(data, 'truoc-khoi-phuc');
    return ok(res, { backup: bk, copied });
  }
  if (p === '/api/backups' && m === 'GET') {
    return sendJson(res, 200, { ok: true, backups: store.listBackups() });
  }
  if (p === '/api/backups/now' && m === 'POST') {
    const name = store.backup('thu-cong');
    return sendJson(res, 200, { ok: true, name, backups: store.listBackups() });
  }
  if (p === '/api/backups/restore' && m === 'POST') {
    const b = await readJson(req);
    let data;
    try { data = store.readBackup(String(b.name || '')); } catch (e) { throw new HttpError(e.code === 'ENOENT' ? 404 : 400, e.code === 'ENOENT' ? 'Không tìm thấy bản sao lưu này' : 'Không đọc được bản sao lưu: ' + e.message); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Không đọc được bản sao lưu: nội dung không hợp lệ');
    checkDbShape(data);
    trace.log(req, 'khoi-phuc-sao-luu', 'data', String(b.name), null, null, { label: 'Khôi phục bản sao lưu tự động ' + String(b.name), note: 'Dữ liệu sau khôi phục: ' + dataSummary(data) });
    const bk = store.replaceAll(data, 'truoc-khoi-phuc');
    return ok(res, { backup: bk });
  }
  // Khôi phục từ file tải lên: .db (SQLite, gửi nguyên file) hoặc .json (bản cũ / file xuất .json)
  if (p === '/api/restore' && m === 'POST') {
    const buf = await readBody(req, 512 * 1024 * 1024);
    let data;
    let kind = 'json';
    if (looksLikeSqlite(buf)) {
      kind = 'db';
      try { data = store.readDbBuffer(buf); } catch (e) { throw new HttpError(400, e.message); }
    } else {
      if (buf.length > 50 * 1024 * 1024) throw new HttpError(413, 'Dữ liệu gửi lên quá lớn (tối đa 50 MB)');
      try { data = JSON.parse(buf.toString('utf8').replace(/^\uFEFF/, '')); } catch (e) { throw new HttpError(400, 'File không phải bản sao lưu của phần mềm (không đọc được .db hay .json)'); }
    }
    if (!data || typeof data !== 'object' || !Array.isArray(data.entries) || !Array.isArray(data.projects) || !Array.isArray(data.suppliers)) {
      throw new HttpError(400, 'File sao lưu không hợp lệ (thiếu entries/projects/suppliers)');
    }
    checkDbShape(data);
    trace.log(req, 'khoi-phuc-sao-luu', 'data', '', null, null, { label: 'Khôi phục từ file sao lưu tải lên (.' + kind + ')', note: 'Dữ liệu sau khôi phục: ' + dataSummary(data) });
    const bk = store.replaceAll(data, 'truoc-khoi-phuc');
    return ok(res, { backup: bk, summary: { entries: data.entries.length, projects: data.projects.length, suppliers: data.suppliers.length, costs: (data.costs || []).length } });
  }
  if (p === '/api/reset' && m === 'POST') {
    const b = await readJson(req);
    if (b.confirm !== 'XOA') throw new HttpError(400, 'Cần xác nhận bằng chữ XOA');
    const keepCatalogs = !!b.keepCatalogs;
    const cur = store.db;
    trace.assertOpen(cur.entries.map((e) => e.ngay), 'xóa toàn bộ sổ');
    trace.log(req, 'xoa-toan-bo', 'entries', '', null, null, { label: 'Xóa toàn bộ sổ thu chi' + (keepCatalogs ? ' (giữ danh mục)' : ''),
      note: 'Xóa ' + cur.entries.length + ' dòng sổ thu chi. Có bản sao lưu ngay trước khi xóa (truoc-xoa-du-lieu).' });
    // Chỉ xóa sổ thu chi; dữ liệu chi phí công trình giữ nguyên (xóa riêng ở /api/reset-costs)
    const usedByCosts = (list, field) => list.filter((x) => cur.costs.some((c) => KT.keyOf(c[field]) === KT.keyOf(x.ma)) ||
      (field === 'maCT' && (cur.houses.some((h) => KT.keyOf(h.maCT) === KT.keyOf(x.ma)))));
    store.replaceAll(Object.assign({}, cur, {
      projects: keepCatalogs ? cur.projects : usedByCosts(cur.projects, 'maCT'),
      suppliers: keepCatalogs ? cur.suppliers : usedByCosts(cur.suppliers, 'maNCC'),
      entries: [],
      vouchers: {}
    }), 'truoc-xoa-du-lieu');
    return ok(res);
  }

  /* ----- Xuất Excel ----- */
  if (seg[1] === 'export' && m === 'GET') {
    const db = KT.activeDb(KT.postedDb(store.db)); // báo cáo Excel không tính dòng Nháp; danh mục không có mã đã gộp
    const q = url.searchParams;
    const f = {
      from: KT.isISODate(q.get('from')) ? q.get('from') : '',
      to: KT.isISODate(q.get('to')) ? q.get('to') : '',
      duAn: q.get('duAn') || '',
      ncc: q.get('ncc') || '',
      loai: q.get('loai') || '',
      q: q.get('q') || '',
      chiCoPhatSinh: q.get('chiCoPhatSinh') === '1',
      nccs: q.getAll('nccs').map((x) => String(x).trim()).filter(Boolean).slice(0, 500)
    };
    switch (seg[2]) {
      case 'full':
        return attachment(res, await runExport('cash', 'buildFullWorkbook', [db]), 'SoSachKeToan_' + stampNow() + '.xlsx', XLSX_TYPE);
      case 'ledger':
        return attachment(res, await runExport('cash', 'buildLedgerWorkbook', [db, f]), 'SoThuChi' + rangeSuffix(f) + '.xlsx', XLSX_TYPE);
      case 'projects':
        return attachment(res, await runExport('cash', 'buildProjectWorkbook', [db, f]), 'TongHopDuAn' + rangeSuffix(f) + '.xlsx', XLSX_TYPE);
      case 'suppliers':
        return attachment(res, await runExport('cash', 'buildSupplierWorkbook', [db, f]), 'TongHopNCC' + rangeSuffix(f) + '.xlsx', XLSX_TYPE);
      case 'costs': {
        const ct = q.get('ct') || '';
        return attachment(res, await runExport('cost', 'buildCostWorkbook', [db, { ct }]), 'ChiPhiCongTrinh' + (ct ? '_' + ct : '') + '_' + stampNow() + '.xlsx', XLSX_TYPE);
      }
      case 'cost-ledger': {
        const cf = { from: f.from, to: f.to, ct: q.get('ct') || '', nha: q.get('nha') || '', nhom: q.get('nhom') || '', hm: q.get('hm') || '',
          loai: q.get('loai') || '', ncc: q.get('ncc') || '', vt: q.get('vt') || '', q: q.get('q') || '' };
        return attachment(res, await runExport('cost', 'buildCostLedgerWorkbook', [db, cf]), 'SoChiPhi' + rangeSuffix(f) + '.xlsx', XLSX_TYPE);
      }
      case 'cost-debt': {
        return attachment(res, await runExport('cost', 'buildDebtWorkbook', [db, { ct: q.get('ct') || '', ncc: q.getAll('ncc').map((x) => String(x).trim()).filter(Boolean).slice(0, 500), tt: ['no', 'du', 'an'].includes(q.get('tt')) ? q.get('tt') : '', to: f.to }]), 'CongNoNCC_' + stampNow() + '.xlsx', XLSX_TYPE);
      }
      case 'cash-count': {
        const buf = await cashCountApi.buildWorkbook(store.db, q.get('id'));
        return attachment(res, buf, 'BienBanKiemQuy_' + stampNow() + '.xlsx', XLSX_TYPE);
      }
      case 'voucher': {
        const so = q.get('so') || '';
        return attachment(res, await runExport('cash', 'buildVoucherWorkbook', [db, so]), 'Phieu_' + so.replace(/[\\/]/g, '-') + '.xlsx', XLSX_TYPE);
      }
      default:
        break;
    }
  }

  if (await trace.handle(req, res, url)) return;
  if (await cashCountApi.handle(req, res, url)) return;
  if (await attachApi.handle(req, res, url)) return;
  if (await mergeApi.handle(req, res, url)) return;
  if (await costApi.handle(req, res, url)) return;

  throw new HttpError(404, 'Không có chức năng ' + m + ' ' + p);
}

/* ---------------- file tĩnh ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8'
};

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Không tìm thấy', { 'Content-Type': 'text/plain; charset=utf-8' });
    send(res, 200, buf, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  });
}

/* ---------------- khởi động ---------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      // Chặn trang web lạ gọi API (chỉ chấp nhận yêu cầu từ chính ứng dụng)
      const origin = req.headers.origin;
      if (origin && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) throw new HttpError(403, 'Không được phép');
      // Chống DNS rebinding: trang web lạ trỏ tên miền về 127.0.0.1 vẫn gửi Host là tên miền đó
      const host = req.headers.host;
      if (host && !/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host)) throw new HttpError(403, 'Không được phép');
      await handleApi(req, res, url);
    } else {
      serveStatic(req, res, url);
    }
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) sendJson(res, status, { ok: false, error: e.message || 'Lỗi không xác định' });
    else res.end();
  }
});

function openBrowser(link) {
  if (NO_OPEN) return;
  const cmd = process.platform === 'win32' ? 'start "" "' + link + '"'
    : process.platform === 'darwin' ? 'open "' + link + '"' : 'xdg-open "' + link + '"';
  exec(cmd, () => {});
}

function isOurApp(port) {
  return new Promise((resolve) => {
    const r = http.get({ host: HOST, port, path: '/api/ping', timeout: 1500 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body).app === APP_ID); } catch (e) { resolve(false); }
      });
    });
    r.on('error', () => resolve(false));
    r.on('timeout', () => { r.destroy(); resolve(false); });
  });
}

function listen(port, attempt) {
  server.once('error', async (err) => {
    // Bỏ hàm 'listening' của lần thử thất bại, nếu không nó vẫn chạy khi cổng kế tiếp mở được
    // (in sai cổng và mở trình duyệt vào cổng đang bị chương trình khác chiếm).
    server.removeAllListeners('listening');
    if (err.code === 'EADDRINUSE') {
      if (await isOurApp(port)) {
        const link = 'http://localhost:' + port;
        console.log('Phần mềm đang chạy sẵn tại ' + link + ' — mở trình duyệt.');
        openBrowser(link);
        process.exit(0);
      }
      if (attempt < 20) return listen(port + 1, attempt + 1);
    }
    console.error('Không khởi động được máy chủ:', err.message);
    process.exit(1);
  });
  server.listen(port, HOST, () => {
    const link = 'http://localhost:' + port;
    console.log('');
    console.log('  SỔ THU CHI — phần mềm kế toán');
    console.log('  Đang chạy tại: ' + link);
    console.log('  Dữ liệu lưu ở: ' + store.file);
    console.log('  (Đóng cửa sổ này để tắt phần mềm)');
    console.log('');
    openBrowser(link);
  });
}

// Tắt phần mềm (Ctrl+C, đóng cửa sổ, lệnh dừng): đóng file dữ liệu gọn gàng. Mọi lần ghi đều trọn một giao dịch nên
// kể cả khi bị tắt ngang, lần mở sau SQLite tự hoàn tác phần dở dang.
['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'].forEach((sig) => {
  try { process.on(sig, () => { try { store.close(); } catch (e) { /* đã đóng */ } process.exit(0); }); } catch (e) { /* hệ điều hành không có tín hiệu này */ }
});

listen(BASE_PORT, 0);
