'use strict';
/*
 * Lớp SQLite (node:sqlite, DatabaseSync) cho kho dữ liệu — xem docs/THIET_KE_SQLITE.md.
 *
 * Phần mềm vẫn làm việc trên một đối tượng dữ liệu trong bộ nhớ (store.db) như bản JSON; file này lo việc:
 *  - lược đồ (bảng STRICT, cột có kiểu, chỉ mục), phiên bản lược đồ ở PRAGMA user_version;
 *  - mã hóa bản ghi ↔ dòng: trường vừa cột thì vào cột, phần còn lại (trường lạ, null, sai kiểu, chuỗi có ký tự NUL…) vào cột JSON
 *    "khac" → đọc ra giống hệt bản ghi đã ghi;
 *  - ghi toàn bộ / ghi phần thay đổi (so với ảnh chụp lần lưu trước) trong MỘT giao dịch;
 *  - đọc toàn bộ, kiểm tra file .db, sao lưu nhất quán bằng VACUUM INTO.
 * Mọi câu lệnh dùng tham số "?"; tên bảng / cột chỉ lấy từ hằng số TABLES bên dưới (không bao giờ từ dữ liệu người dùng).
 */
const fs = require('fs');

// node:sqlite còn in cảnh báo "experimental" (Node 22/24): ẩn đúng cảnh báo đó để cửa sổ chạy phần mềm không làm người dùng lo
const _emitWarning = process.emitWarning;
process.emitWarning = function (w) {
  const msg = typeof w === 'string' ? w : w && w.message;
  if (/SQLite is an experimental feature/i.test(String(msg || ''))) return undefined;
  return _emitWarning.apply(process, arguments);
};
const { DatabaseSync } = require('node:sqlite');

// Phiên bản lược đồ SQLite (PRAGMA user_version). File JSON cuối cùng là schema 3 → SQLite bắt đầu ở 4.
const DB_VERSION = 4;
const APP_MARK = 'so-thu-chi-ke-toan';
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'latin1');

/* Định nghĩa bảng. key: trường khóa ('id' | 'thang') hoặc map: true (đối tượng {khóa: giá trị}, cột khóa là keyCol).
 * Loại cột: int (tiền, số nguyên an toàn), real (số lượng, đơn giá), text, code (mã: '' ↔ NULL), bool, json, any. */
const TABLES = {
  projects: { key: 'id', cols: [['ma', 'code'], ['ten', 'text'], ['nganSach', 'int'], ['trangThai', 'text'], ['ghiChu', 'text'], ['ngayKhoiCong', 'text'], ['diaChi', 'text']],
    idx: [['ma']] },
  suppliers: { key: 'id', cols: [['ma', 'code'], ['ten', 'text'], ['loai', 'text'], ['sdt', 'text'], ['diaChi', 'text'], ['ghiChu', 'text']], idx: [['ma']] },
  entries: { key: 'id', cols: [['seq', 'int'], ['ngay', 'text'], ['soPhieu', 'code'], ['maDuAn', 'code'], ['maNCC', 'code'], ['noiDung', 'text'], ['thu', 'int'], ['chi', 'int'],
    ['nguoiNhan', 'text'], ['ghiChu', 'text'], ['trangThai', 'text'], ['createdAt', 'text'], ['updatedAt', 'text']],
    idx: [['ngay', 'seq'], ['maDuAn'], ['maNCC'], ['soPhieu']] },
  costGroups: { key: 'id', cols: [['ma', 'code'], ['ten', 'text'], ['ghiChu', 'text']], idx: [['ma']] },
  costItems: { key: 'id', cols: [['ma', 'code'], ['ten', 'text'], ['maNhom', 'code'], ['ghiChu', 'text']], idx: [['ma'], ['maNhom']] },
  materials: { key: 'id', cols: [['ma', 'code'], ['ten', 'text'], ['dvt', 'text'], ['maHM', 'code'], ['loaiCP', 'text'], ['ghiChu', 'text']], idx: [['ma'], ['maHM']] },
  houses: { key: 'id', cols: [['ma', 'code'], ['ten', 'text'], ['maCT', 'code'], ['dienTich', 'any'], ['chuNha', 'text'], ['chung', 'bool'], ['ghiChu', 'text']], idx: [['ma'], ['maCT']] },
  costs: { key: 'id', cols: [['seq', 'int'], ['phieuId', 'int'], ['ngay', 'text'], ['maCT', 'code'], ['maNha', 'code'], ['maHM', 'code'], ['loaiCP', 'text'], ['maVT', 'code'],
    ['dienGiai', 'text'], ['soLuong', 'real'], ['donGia', 'real'], ['thanhTien', 'int'], ['maNCC', 'code'], ['soPhieu', 'code'], ['ghiChu', 'text'], ['nguon', 'text'],
    ['trangThai', 'text'], ['createdAt', 'text'], ['updatedAt', 'text']],
    idx: [['ngay', 'seq'], ['maCT'], ['maNCC'], ['maHM'], ['maVT'], ['maNha'], ['phieuId'], ['soPhieu']] },
  vouchers: { map: true, keyCol: 'so', cols: [['ngay', 'text'], ['nguoiNhan', 'text'], ['diaChi', 'text'], ['lyDo', 'text'], ['hinhThuc', 'text'], ['kemTheo', 'text']], idx: [] },
  locks: { key: 'thang', cols: [['at', 'text'], ['by', 'text']], idx: [] },
  ignoredWarnings: { map: true, keyCol: 'khoa', cols: [['at', 'text'], ['by', 'text'], ['label', 'text'], ['note', 'text']], idx: [] },
  cashCounts: { key: 'id', cols: [['ngay', 'text'], ['thucTe', 'int'], ['tonSo', 'int'], ['menhGia', 'json'], ['nguoiKiem', 'text'], ['ghiChu', 'text'], ['createdAt', 'text'], ['by', 'text']],
    idx: [['ngay']] },
  attachments: { key: 'id', cols: [['owner', 'text'], ['ownerId', 'int'], ['name', 'text'], ['file', 'text'], ['size', 'int'], ['type', 'text'], ['sha256', 'text'], ['createdAt', 'text'], ['by', 'text']],
    idx: [['owner', 'ownerId']] },
  trash: { key: 'id', cols: [['at', 'text'], ['by', 'text'], ['kind', 'text'], ['label', 'text'], ['group', 'text'], ['phieuId', 'int'], ['records', 'json'], ['attachments', 'json']],
    idx: [['kind']] }
};
const TABLE_NAMES = Object.keys(TABLES);
// Khóa cấp cao của kho được lưu ở bảng riêng / meta; khóa lạ khác được giữ nguyên trong meta.khacGoc
const TOP_KEYS = ['schema', 'settings', 'nextId', 'updatedAt'].concat(TABLE_NAMES);
const VT_STEP = 1024; // khoảng cách vị trí khi đánh số mới: chèn vào giữa không phải đánh số lại cả bảng

const q = (name) => '"' + String(name).replace(/"/g, '""') + '"';
const SQL_TYPE = { int: 'INTEGER', real: 'REAL', text: 'TEXT', code: 'TEXT', bool: 'INTEGER', json: 'TEXT', any: 'ANY' };
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const noNul = (s) => s.indexOf('\0') < 0;

function keyColOf(def) { return def.map ? def.keyCol : def.key; }

function schemaSql() {
  const out = ['CREATE TABLE IF NOT EXISTS "meta" ("khoa" TEXT PRIMARY KEY, "giaTri" TEXT NOT NULL) STRICT'];
  TABLE_NAMES.forEach((name) => {
    const def = TABLES[name];
    const kc = keyColOf(def);
    const cols = [q(kc) + (kc === 'id' ? ' INTEGER PRIMARY KEY' : ' TEXT PRIMARY KEY NOT NULL'), '"vt" INTEGER NOT NULL']
      .concat(def.cols.map(([c, t]) => q(c) + ' ' + SQL_TYPE[t] + (t === 'bool' ? ' CHECK (' + q(c) + ' IN (0, 1))' : '') + (t === 'json' ? ' CHECK (json_valid(' + q(c) + '))' : '')))
      .concat(['"khac" TEXT CHECK ("khac" IS NULL OR json_valid("khac"))']);
    out.push('CREATE TABLE IF NOT EXISTS ' + q(name) + ' (' + cols.join(', ') + ') STRICT');
    out.push('CREATE INDEX IF NOT EXISTS ' + q(name + '_vt') + ' ON ' + q(name) + ' ("vt")');
    def.idx.forEach((cs) => out.push('CREATE INDEX IF NOT EXISTS ' + q(name + '_' + cs.join('_')) + ' ON ' + q(name) + ' (' + cs.map(q).join(', ') + ')'));
  });
  return out;
}

/* ---------- mã hóa bản ghi ↔ dòng ---------- */

// Trả mảng tham số theo thứ tự cột: [khóa, vt, ...cột, khac]
function encode(def, key, rec, vt) {
  const vals = [key, vt];
  let extra = null;
  const put = (k, v) => { (extra || (extra = {}))[k] = v; };
  const isObj = rec !== null && typeof rec === 'object' && !Array.isArray(rec);
  if (!isObj) {
    // giá trị lạ trong map (không phải đối tượng): giữ nguyên trong khac
    def.cols.forEach(() => vals.push(null));
    vals.push(JSON.stringify({ $giaTri: rec === undefined ? null : rec }));
    return vals;
  }
  const absent = [];
  def.cols.forEach(([c, t]) => {
    const v = rec[c];
    if (v === undefined) { // trường không có (mã vắng mặt phải ghi lại, vì cột mã NULL nghĩa là '')
      if (t === 'code') absent.push(c);
      vals.push(null);
      return;
    }
    let out;
    let fit = false;
    switch (t) {
      case 'int': fit = Number.isSafeInteger(v); out = v; break;
      case 'real': fit = typeof v === 'number' && Number.isFinite(v); out = v; break;
      case 'text': fit = typeof v === 'string' && noNul(v); out = v; break;
      case 'code': fit = typeof v === 'string' && noNul(v); out = v === '' ? null : v; break;
      case 'bool': fit = typeof v === 'boolean'; out = v ? 1 : 0; break;
      case 'json': fit = true; out = JSON.stringify(v); break;
      case 'any': fit = (typeof v === 'string' && noNul(v)) || (typeof v === 'number' && Number.isFinite(v)); out = v; break;
      default: fit = false;
    }
    if (fit) vals.push(out);
    else { vals.push(null); put(c, v); }
  });
  const kc = keyColOf(def);
  Object.keys(rec).forEach((k) => {
    if (k === kc && !def.map) return;
    if (def.cols.some(([c]) => c === k)) return;
    if (rec[k] !== undefined) put(k, rec[k]);
  });
  if (absent.length) put('$vang', absent);
  vals.push(extra ? JSON.stringify(extra) : null);
  return vals;
}

function decode(def, row) {
  const extra = row.khac == null ? null : JSON.parse(row.khac);
  if (extra && hasOwn(extra, '$giaTri')) return extra.$giaTri;
  const rec = {};
  if (!def.map) rec[def.key] = row[def.key];
  const absent = new Set((extra && extra.$vang) || []);
  def.cols.forEach(([c, t]) => {
    const v = row[c];
    if (extra && hasOwn(extra, c)) { rec[c] = extra[c]; return; }
    if (v === null || v === undefined) {
      if (t === 'code' && !absent.has(c)) rec[c] = '';
      return;
    }
    if (t === 'bool') rec[c] = v === 1;
    else if (t === 'json') rec[c] = JSON.parse(v);
    else rec[c] = v;
  });
  if (extra) Object.keys(extra).forEach((k) => { if (k !== '$vang' && !hasOwn(rec, k)) rec[k] = extra[k]; });
  return rec;
}

/* ---------- kết nối ---------- */

class SqliteDb {
  // opts: { readOnly, create }
  constructor(file, opts) {
    opts = opts || {};
    this.file = file;
    if (!opts.create && !fs.existsSync(file)) throw Object.assign(new Error('Không có file dữ liệu ' + file), { code: 'ENOENT' });
    this.conn = new DatabaseSync(file, opts.readOnly ? { readOnly: true } : {});
    this.readOnly = !!opts.readOnly;
    this.conn.exec('PRAGMA busy_timeout = 5000');
    if (!this.readOnly) {
      this.conn.exec('PRAGMA journal_mode = DELETE');
      this.conn.exec('PRAGMA synchronous = FULL');
    }
    this.conn.exec('PRAGMA foreign_keys = ON');
    this.stmts = new Map();
  }

  stmt(sql) {
    let s = this.stmts.get(sql);
    if (!s) { s = this.conn.prepare(sql); this.stmts.set(sql, s); }
    return s;
  }

  close() {
    if (!this.conn) return;
    try { this.conn.close(); } catch (e) { /* đã đóng */ }
    this.conn = null;
    this.stmts.clear();
  }

  get version() { return this.conn.prepare('PRAGMA user_version').get().user_version; }

  // Chạy fn trong một giao dịch; lỗi → ROLLBACK và ném lại
  tx(fn) {
    this.conn.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      this.conn.exec('COMMIT');
      return r;
    } catch (e) {
      try { this.conn.exec('ROLLBACK'); } catch (e2) { /* giao dịch đã tự hủy */ }
      throw e;
    }
  }

  createSchema() {
    schemaSql().forEach((s) => this.conn.exec(s));
    this.conn.exec('PRAGMA user_version = ' + DB_VERSION); // hằng số trong mã, không phải dữ liệu người dùng
    this.setMeta('ungDung', APP_MARK);
    if (this.getMeta('taoLuc') === undefined) this.setMeta('taoLuc', new Date().toISOString());
  }

  getMeta(k) {
    const r = this.stmt('SELECT "giaTri" FROM "meta" WHERE "khoa" = ?').get(k);
    return r ? JSON.parse(r.giaTri) : undefined;
  }

  setMeta(k, v) {
    this.stmt('INSERT INTO "meta" ("khoa", "giaTri") VALUES (?, ?) ON CONFLICT ("khoa") DO UPDATE SET "giaTri" = excluded."giaTri"').run(k, JSON.stringify(v));
  }

  // Kiểm tra file là dữ liệu của phần mềm, còn nguyên vẹn, đúng phiên bản. Trả null nếu ổn, ngược lại là câu báo lỗi.
  problem() {
    let ic;
    try { ic = this.conn.prepare('PRAGMA integrity_check').all().map((r) => r.integrity_check); } catch (e) { return 'không đọc được (' + e.message + ')'; }
    if (ic.length !== 1 || ic[0] !== 'ok') return 'file bị hỏng (' + ic.slice(0, 3).join('; ') + ')';
    const have = new Set(this.conn.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
    if (!have.has('meta')) return 'không phải file dữ liệu của phần mềm';
    let mark;
    try { mark = this.getMeta('ungDung'); } catch (e) { mark = null; }
    if (mark !== APP_MARK) return 'không phải file dữ liệu của phần mềm';
    const v = this.version;
    if (v > DB_VERSION) return 'dữ liệu của phiên bản phần mềm mới hơn (lược đồ ' + v + ', phần mềm này đọc được tới ' + DB_VERSION + ')';
    if (v < 4) return 'phiên bản lược đồ không hợp lệ (' + v + ')';
    const miss = TABLE_NAMES.filter((t) => !have.has(t));
    if (miss.length) return 'thiếu bảng ' + miss.join(', ');
    return null;
  }

  /* ---------- đọc ---------- */

  // Đọc toàn bộ thành đối tượng dữ liệu như bản JSON. Trả { db, snap } (snap: ảnh chụp để ghi phần thay đổi về sau)
  readAll() {
    const db = {};
    const snap = { meta: new Map() };
    const metaRows = this.conn.prepare('SELECT "khoa", "giaTri" FROM "meta"').all();
    const meta = {};
    metaRows.forEach((r) => { meta[r.khoa] = JSON.parse(r.giaTri); snap.meta.set(r.khoa, r.giaTri); });
    if (meta.settings !== undefined) db.settings = meta.settings;
    TABLE_NAMES.forEach((name) => {
      const def = TABLES[name];
      const kc = keyColOf(def);
      const rows = this.conn.prepare('SELECT * FROM ' + q(name) + ' ORDER BY "vt", ' + q(kc)).all();
      const m = new Map();
      if (def.map) {
        const obj = {};
        rows.forEach((r) => { obj[r[kc]] = decode(def, r); m.set(r[kc], { j: JSON.stringify(obj[r[kc]]), vt: r.vt }); });
        db[name] = obj;
      } else {
        db[name] = rows.map((r) => { const rec = decode(def, r); m.set(r[kc], { j: JSON.stringify(rec), vt: r.vt }); return rec; });
      }
      snap[name] = m;
    });
    if (meta.nextId !== undefined) db.nextId = meta.nextId;
    if (meta.updatedAt !== undefined) db.updatedAt = meta.updatedAt;
    if (meta.khacGoc && typeof meta.khacGoc === 'object') Object.keys(meta.khacGoc).forEach((k) => { if (!hasOwn(db, k)) db[k] = meta.khacGoc[k]; });
    return { db, snap };
  }

  /* ---------- ghi ---------- */

  insertSql(name) {
    const def = TABLES[name];
    const cols = [keyColOf(def), 'vt'].concat(def.cols.map((c) => c[0])).concat(['khac']);
    return 'INSERT OR REPLACE INTO ' + q(name) + ' (' + cols.map(q).join(', ') + ') VALUES (' + cols.map(() => '?').join(', ') + ')';
  }

  metaValues(db) {
    const extra = {};
    Object.keys(db).forEach((k) => { if (!TOP_KEYS.includes(k) && db[k] !== undefined) extra[k] = db[k]; });
    return {
      settings: JSON.stringify(db.settings === undefined ? null : db.settings),
      nextId: JSON.stringify(db.nextId === undefined ? null : db.nextId),
      updatedAt: JSON.stringify(db.updatedAt === undefined ? null : db.updatedAt),
      khacGoc: JSON.stringify(extra)
    };
  }

  // Ghi phần thay đổi của db so với ảnh chụp snap (cả hai bước trong giao dịch do người gọi mở). Trả ảnh chụp mới + số dòng đã ghi.
  // Không có snap (hoặc snap rỗng) = ghi từ đầu: bảng phải đang trống.
  writeDiff(db, snap) {
    snap = snap || {};
    const next = { meta: new Map() };
    let written = 0;
    const mv = this.metaValues(db);
    const prevMeta = snap.meta || new Map();
    Object.keys(mv).forEach((k) => {
      if (prevMeta.get(k) !== mv[k]) { this.stmt('INSERT INTO "meta" ("khoa", "giaTri") VALUES (?, ?) ON CONFLICT ("khoa") DO UPDATE SET "giaTri" = excluded."giaTri"').run(k, mv[k]); written++; }
    });
    prevMeta.forEach((v, k) => { if (!hasOwn(mv, k)) next.meta.set(k, v); }); // khóa meta khác (ungDung, taoLuc, chuyenTu…) giữ nguyên
    Object.keys(mv).forEach((k) => next.meta.set(k, mv[k]));
    TABLE_NAMES.forEach((name) => {
      const def = TABLES[name];
      const prev = snap[name] || new Map();
      const cur = new Map();
      const src = db[name];
      let entries;
      if (def.map) entries = src && typeof src === 'object' && !Array.isArray(src) ? Object.keys(src).map((k) => [k, src[k]]) : [];
      else entries = (Array.isArray(src) ? src : []).map((r) => [r ? r[def.key] : undefined, r]);
      // vị trí của bản ghi kế tiếp (nếu đã có) để chèn vào giữa mà không đánh số lại cả bảng
      const nextOld = new Array(entries.length).fill(Infinity);
      for (let i = entries.length - 2; i >= 0; i--) {
        const p = prev.get(entries[i + 1][0]);
        nextOld[i] = p ? p.vt : Infinity;
      }
      const ins = this.stmt(this.insertSql(name));
      let last = 0;
      entries.forEach(([key, rec], i) => {
        if (def.map) key = String(key);
        else if (def.key === 'id' ? !Number.isSafeInteger(key) : typeof key !== 'string') {
          throw new Error('Bản ghi trong "' + name + '" có khóa không hợp lệ (' + JSON.stringify(key) + ')');
        }
        if (cur.has(key)) throw new Error('Dữ liệu "' + name + '" có hai bản ghi trùng khóa ' + JSON.stringify(key) + ' — không lưu để tránh mất dữ liệu');
        const j = JSON.stringify(rec);
        const p = prev.get(key);
        let vt;
        if (p && p.vt > last) vt = p.vt;
        else if (nextOld[i] !== Infinity && nextOld[i] - last > 1) vt = last + Math.max(1, Math.floor((nextOld[i] - last) / 2));
        else vt = last + VT_STEP;
        if (!p || p.j !== j || p.vt !== vt) { ins.run(...encode(def, key, rec, vt)); written++; }
        cur.set(key, { j, vt });
        last = vt;
      });
      const del = this.stmt('DELETE FROM ' + q(name) + ' WHERE ' + q(keyColOf(def)) + ' = ?');
      prev.forEach((v, key) => { if (!cur.has(key)) { del.run(key); written++; } });
      next[name] = cur;
    });
    return { snap: next, written };
  }

  // Xóa sạch rồi ghi lại toàn bộ (trong giao dịch do người gọi mở)
  clearAll() {
    TABLE_NAMES.forEach((name) => this.conn.exec('DELETE FROM ' + q(name)));
    ['settings', 'nextId', 'updatedAt', 'khacGoc'].forEach((k) => this.stmt('DELETE FROM "meta" WHERE "khoa" = ?').run(k));
  }

  // Bản sao nhất quán (trạng thái đã COMMIT) ra file mới; file đích không được tồn tại
  vacuumInto(dest) {
    this.conn.prepare('VACUUM INTO ?').run(dest);
  }
}

// Dựng lại đối tượng dữ liệu từ ảnh chụp lần ghi thành công gần nhất (không đọc đĩa): dùng khi ghi lỗi mà đĩa đang bị khóa
function fromSnapshot(snap) {
  const db = {};
  const meta = snap.meta || new Map();
  const mv = (k) => (meta.has(k) ? JSON.parse(meta.get(k)) : undefined);
  if (mv('settings') !== undefined && mv('settings') !== null) db.settings = mv('settings');
  TABLE_NAMES.forEach((name) => {
    const def = TABLES[name];
    const rows = Array.from((snap[name] || new Map()).entries()).sort((a, b) => a[1].vt - b[1].vt);
    if (def.map) { db[name] = {}; rows.forEach(([k, v]) => { db[name][k] = JSON.parse(v.j); }); }
    else db[name] = rows.map(([, v]) => JSON.parse(v.j));
  });
  if (mv('nextId') !== undefined && mv('nextId') !== null) db.nextId = mv('nextId');
  if (mv('updatedAt') !== undefined && mv('updatedAt') !== null) db.updatedAt = mv('updatedAt');
  const extra = mv('khacGoc');
  if (extra && typeof extra === 'object') Object.keys(extra).forEach((k) => { if (!hasOwn(db, k)) db[k] = extra[k]; });
  return db;
}

// File có chữ ký SQLite không (đọc 16 byte đầu)
function looksLikeSqlite(bufOrFile) {
  let head;
  if (Buffer.isBuffer(bufOrFile)) head = bufOrFile.subarray(0, 16);
  else {
    const fd = fs.openSync(bufOrFile, 'r');
    try { head = Buffer.alloc(16); fs.readSync(fd, head, 0, 16, 0); } finally { fs.closeSync(fd); }
  }
  return head.length === 16 && head.equals(SQLITE_MAGIC);
}

// Đọc một file .db (sao lưu / tải lên) thành đối tượng dữ liệu; ném lỗi tiếng Việt nếu file không dùng được
function readDbFile(file) {
  if (!looksLikeSqlite(file)) throw new Error('File không phải dữ liệu SQLite của phần mềm');
  let d;
  try { d = new SqliteDb(file, { readOnly: true }); } catch (e) { throw new Error('Không mở được file dữ liệu: ' + e.message); }
  try {
    const p = d.problem();
    if (p) throw new Error('File dữ liệu không dùng được: ' + p);
    return d.readAll().db;
  } finally { d.close(); }
}

module.exports = { SqliteDb, fromSnapshot, TABLES, TABLE_NAMES, DB_VERSION, APP_MARK, encode, decode, readDbFile, looksLikeSqlite, schemaSql };
