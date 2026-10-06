'use strict';
/*
 * Kho dữ liệu — lưu bằng SQLite (data/ketoan.db, node:sqlite). Thiết kế: docs/THIET_KE_SQLITE.md.
 * - Phần mềm làm việc trên một đối tượng dữ liệu trong bộ nhớ (this.db) như bản JSON trước đây; save() ghi các dòng thay đổi
 *   trong MỘT giao dịch. Ghi lỗi → hủy giao dịch, nạp lại bộ nhớ từ đĩa (bộ nhớ luôn khớp đĩa).
 * - Lần đầu chạy bản này mà chỉ có data/ketoan.json: tự chuyển sang ketoan.db (sao lưu JSON trước, dựng file tạm trong một
 *   giao dịch, đối chiếu từng bản ghi và mọi tổng số trước khi COMMIT, chỉ đổi tên khi khớp 100%).
 * - Tự sao lưu vào data/backups (tối đa 1 bản / 10 phút khi đang sửa, và luôn sao lưu trước các thao tác lớn như nhập Excel,
 *   khôi phục, xóa toàn bộ) bằng VACUUM INTO → file .db nhất quán. Bản sao lưu .json thời trước vẫn khôi phục được.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AuditLog } = require('./audit');
const { DatabaseSync } = require('node:sqlite');
const { SqliteDb, DB_VERSION, readDbFile, looksLikeSqlite, fromSnapshot, AUTH_TABLE_NAMES } = require('./db');
const migrate = require('./migrate');
const KT = require('../public/js/shared.js');

// 1: sổ thu chi. 2: thêm chi phí công trình (nhóm CP, hạng mục, vật tư, nhà, dòng chi phí).
// 3: nhóm "độ chính xác và truy vết": thùng rác (xóa mềm), trạng thái nháp, khóa sổ, cảnh báo đã bỏ qua,
//    kiểm quỹ, chứng từ đính kèm. Nhật ký thay đổi nằm riêng ở data/nhat-ky.jsonl.
//    Bản ghi cũ KHÔNG bị thêm trường nào: thiếu trangThai nghĩa là "Đã ghi sổ".
// 4: lưu bằng SQLite (data/ketoan.db, PRAGMA user_version = 4). Hình dạng bản ghi không đổi so với 3.
// 5: gộp mã (gopVao trên danh mục; aliases, mergeLog, ignoredDupes) — file lược đồ 4 tự nâng khi mở (sao lưu trước).
// 6: đăng nhập và phân quyền — nguoiTao / nguoiSua trên bản ghi nghiệp vụ (vắng mặt = "Dữ liệu cũ"); bảng người dùng / phiên nằm
//    trong file nhưng ngoài this.db (lib/auth.js).
const SCHEMA_VERSION = DB_VERSION;
const MAX_BACKUPS = 60;
const AUTO_BACKUP_INTERVAL_MS = 10 * 60 * 1000;
const KEEP_FOREVER = /truoc-khi-chuyen-sqlite|truoc-nang-cap-luoc-do/; // bản sao lưu JSON trước khi chuyển sang SQLite: không bao giờ tự xóa

// Danh mục mặc định theo sheet DM_NHOM / DM_HANGMUC của file ChiPhi_CongTrinh
const DEFAULT_COST_GROUPS = [
  ['NHOM_ChiPhiBanDau', '1. Chi phí ban đầu'],
  ['NHOM_ChiPhiPhanTho', '2. Chi phí phần thô'],
  ['NHOM_HeThongDienNuoc', '3. Hệ thống điện nước'],
  ['NHOM_HoanThien', '4. Hoàn thiện'],
  ['NHOM_NoiThatCanhQuan', '5. Nội thất & cảnh quan'],
  ['NHOM_ChiPhiKhac', '6. Chi phí khác']
];
const DEFAULT_COST_ITEMS = [
  ['NHOM_ChiPhiBanDau', 'Hồ sơ pháp lý'],
  ['NHOM_ChiPhiPhanTho', 'Bê tông'], ['NHOM_ChiPhiPhanTho', 'Sắt thép xây dựng'], ['NHOM_ChiPhiPhanTho', 'Vật tư VLXD'],
  ['NHOM_ChiPhiPhanTho', 'Chi phí chung CT'], ['NHOM_ChiPhiPhanTho', 'Nhân công thợ nề'],
  ['NHOM_HeThongDienNuoc', 'Vật tư điện nước'], ['NHOM_HeThongDienNuoc', 'Nhân công điện nước'], ['NHOM_HeThongDienNuoc', 'Đèn trang trí, dây điện'],
  ['NHOM_HoanThien', 'Vật tư sơn, chống thấm'], ['NHOM_HoanThien', 'Nhân công chống thấm'], ['NHOM_HoanThien', 'Nhân công sơn nước'],
  ['NHOM_HoanThien', 'Nhân công sơn hiệu ứng trong'], ['NHOM_HoanThien', 'Nhân công sơn hiệu ứng mặt tiền'], ['NHOM_HoanThien', 'Thạch cao'],
  ['NHOM_HoanThien', 'Thiết bị vệ sinh'], ['NHOM_HoanThien', 'Gạch ốp lát'], ['NHOM_HoanThien', 'Cửa nhôm Xingfa'],
  ['NHOM_HoanThien', 'Vật tư sắt, CP phụ'], ['NHOM_HoanThien', 'Nhân công thợ sắt'], ['NHOM_HoanThien', 'Đá, gạch trang trí'],
  ['NHOM_HoanThien', 'Đá bếp'], ['NHOM_HoanThien', 'Đá mài'],
  ['NHOM_NoiThatCanhQuan', 'Cây xanh'], ['NHOM_NoiThatCanhQuan', 'Chăn ga nệm'], ['NHOM_NoiThatCanhQuan', 'Nội thất Điền Thủy'],
  ['NHOM_NoiThatCanhQuan', 'Bàn ghế Kibi'], ['NHOM_NoiThatCanhQuan', 'Bàn ghế, thảm Jysk'], ['NHOM_NoiThatCanhQuan', 'Điện máy'],
  ['NHOM_NoiThatCanhQuan', 'Điều hòa'], ['NHOM_NoiThatCanhQuan', 'Màn rèm'], ['NHOM_NoiThatCanhQuan', 'Thiết bị bếp'],
  ['NHOM_NoiThatCanhQuan', 'Khóa thông minh'], ['NHOM_NoiThatCanhQuan', 'Đàn piano'],
  ['NHOM_ChiPhiKhac', 'PCCC'], ['NHOM_ChiPhiKhac', 'Phí dịch vụ hoa hồng'], ['NHOM_ChiPhiKhac', 'Chi phí quản lý (giám sát, VP)']
];

// Bản ghi nghiệp vụ có nguoiTao / nguoiSua (lược đồ 6)
const STAMP_LISTS = ['projects', 'suppliers', 'entries', 'costGroups', 'costItems', 'materials', 'houses', 'costs', 'extPayments', 'soDuDauKy', 'cashCounts'];
const NGUOI_MAY = 'Người dùng máy này';

// Các danh sách dữ liệu có id (dùng chung bộ đếm nextId)
const ID_LISTS = ['projects', 'suppliers', 'entries', 'costGroups', 'costItems', 'materials', 'houses', 'costs', 'extPayments', 'soDuDauKy'];

function defaultSettings() {
  return {
    tenDonVi: 'CÔNG TY TNHH ĐIỀN THỦY',
    diaChi: '414-420 Tôn Đản, Đà Nẵng',
    giamDoc: '',
    keToanTruong: '',
    thuQuy: 'Nguyễn Thị Thúy',
    nguoiLap: '',
    hinhThucMacDinh: 'Tiền mặt',
    hienKeToanTruong: false
  };
}

function emptyDb() {
  return {
    schema: SCHEMA_VERSION,
    settings: defaultSettings(),
    projects: [],
    suppliers: [],
    entries: [],
    vouchers: {},
    costGroups: [],
    costItems: [],
    materials: [],
    houses: [],
    costs: [],
    // schema 3
    trash: [],        // thùng rác: [{ id, at, by, kind, label, records: [...] }]
    locks: [],        // khóa sổ theo tháng: [{ thang: 'yyyy-mm', at, by }]
    attachments: [],  // chứng từ đính kèm: [{ id, owner, ownerId, name, file, size, type, sha256, createdAt, by }] (file ở data/attachments)
    cashCounts: [],   // biên bản kiểm kê quỹ: [{ id, ngay, thucTe, tonSo, menhGia, nguoiKiem, ghiChu, createdAt, by }]
    ignoredWarnings: {}, // cảnh báo "Cần xử lý" đã bấm Bỏ qua: { key: { at, by, label, note } }
    // schema 5: trả NCC từ nguồn tiền khác (ngoài quỹ): [{ id, ngay, maNCC, maDuAn, soTien, nguon, ghiChu, createdAt, updatedAt, by }]
    extPayments: [],
    // schema 7: số dư đầu kỳ công nợ NCC (nhập tay): [{ id, ngay, maNCC, maDuAn, soTien (âm = ứng trước), ghiChu, createdAt, updatedAt, by }]
    soDuDauKy: [],
    // schema 5: gộp mã
    aliases: [],      // bí danh: [{ id, loai: 'ncc'|'vt'|'hm'|'nha'|'da', ma (mã cũ), dich (mã đích), mergeId, at }]
    mergeLog: [],     // lịch sử gộp / tách mã: [{ id, at, by, loai, nguon: [...], dich, trangThai: 'hieu-luc'|'da-hoan-tac', nhan, chiTiet }]
    ignoredDupes: {}, // gợi ý mã trùng đã bấm "Bỏ qua": { khoa: { at, by, loai, label } }
    nextId: 1,
    updatedAt: new Date().toISOString()
  };
}

// Tóm tắt dữ liệu để ghi vào nhật ký (khởi tạo, khôi phục...)
function dataSummary(db) {
  return (db.entries || []).length + ' dòng sổ thu chi, ' + (db.costs || []).length + ' dòng chi phí, ' +
    (db.projects || []).length + ' công trình, ' + (db.suppliers || []).length + ' nhà cung cấp, ' + (db.materials || []).length + ' vật tư';
}

// Nạp nhóm CP + hạng mục mặc định khi chưa có (sổ mới hoặc nâng cấp từ bản chỉ có thu chi)
function seedCostCatalogs(db) {
  if (!db.costGroups.length) {
    DEFAULT_COST_GROUPS.forEach(([ma, ten]) => db.costGroups.push({ id: 0, ma, ten, ghiChu: '' }));
  }
  if (!db.costItems.length) {
    DEFAULT_COST_ITEMS.forEach(([maNhom, ten], i) => db.costItems.push({ id: 0, ma: 'HM' + String(i + 1).padStart(2, '0'), ten, maNhom, ghiChu: '' }));
  }
}

function stamp(d) {
  d = d || new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}


const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const rm = (f) => { try { fs.unlinkSync(f); } catch (e) { /* không có */ } };
const LIST_LABEL = { extPayments: 'khoản trả ngoài quỹ', soDuDauKy: 'số dư đầu kỳ NCC', aliases: 'bí danh mã', mergeLog: 'lần gộp mã', projects: 'công trình', suppliers: 'nhà cung cấp', entries: 'dòng sổ', costGroups: 'nhóm chi phí', costItems: 'hạng mục', materials: 'vật tư',
  houses: 'nhà', costs: 'dòng chi phí', cashCounts: 'biên bản kiểm quỹ', attachments: 'chứng từ', trash: 'mục thùng rác' };

// Lỗi khóa file (chương trình khác đang ghi): không được coi là file hỏng
function isBusy(e) { return /SQLITE_BUSY|database is locked|SQLITE_LOCKED/i.test(String(e && (e.code || '') + ' ' + (e.message || ''))); }

// Hình dạng tối thiểu để nạp được nguyên trạng (danh sách phải là mảng đối tượng…). Trả câu báo lỗi hoặc null.
function shapeProblem(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'nội dung không phải một đối tượng dữ liệu';
  for (const k of ['projects', 'suppliers', 'entries', 'costGroups', 'costItems', 'materials', 'houses', 'costs', 'cashCounts', 'attachments', 'trash', 'locks', 'aliases', 'mergeLog', 'extPayments', 'soDuDauKy']) {
    if (d[k] === undefined) continue;
    if (!Array.isArray(d[k]) || d[k].some((x) => x === null || typeof x !== 'object' || Array.isArray(x))) return '"' + k + '" phải là danh sách các bản ghi';
  }
  for (const k of ['vouchers', 'settings', 'ignoredWarnings', 'ignoredDupes']) {
    if (d[k] !== undefined && (d[k] === null || typeof d[k] !== 'object' || Array.isArray(d[k]))) return '"' + k + '" phải là một đối tượng';
  }
  return null;
}

class Store {
  constructor(dataDir) {
    this.dir = dataDir;
    this.file = path.join(dataDir, 'ketoan.db');
    this.jsonFile = path.join(dataDir, 'ketoan.json');
    this.backupDir = path.join(dataDir, 'backups');
    this.lastBackupAt = 0;
    fs.mkdirSync(this.backupDir, { recursive: true });
    this.log = new AuditLog(dataDir);
    this.pendingAudit = [];
    this.nguoiThaoTac = null; // hàm trả nhãn người đang thao tác (server gắn: id người đăng nhập, hoặc "Người dùng máy này")
    this.sql = null;   // kết nối SqliteDb tới ketoan.db
    this.snap = null;  // ảnh chụp lần lưu gần nhất (để chỉ ghi phần thay đổi)
    this.db = this.load();
  }

  // Ghi nhận một thay đổi; được ghi vào nhật ký ngay sau khi dữ liệu lưu thành công (save / replaceAll)
  audit(e) { this.pendingAudit.push(e); }

  flushAudit() {
    const list = this.pendingAudit;
    this.pendingAudit = [];
    try { return this.log.append(list); } catch (e) { console.error('Không ghi được nhật ký thay đổi:', e.message); return []; }
  }

  // Dữ liệu gửi cho giao diện: không kèm thùng rác (xem riêng ở /api/trash) để mỗi lần trả lời không phình to
  publicDb() {
    const out = Object.assign({}, this.db);
    delete out.trash;
    delete out.mergeLog; // lịch sử gộp mã (có danh sách id bản ghi, có thể lớn): xem ở /api/merge/log
    delete out.importBatches; // sổ đăng ký các lần nhập Excel bằng công cụ dòng lệnh (dấu vân tay) — giao diện không cần
    return out;
  }

  /* ---------------- mở dữ liệu ---------------- */

  load() {
    // file tạm của một lần chuyển đổi bị ngắt giữa chừng (mất điện…): bỏ, làm lại từ đầu
    [this.file + '.dang-chuyen', this.file + '.dang-chuyen-journal'].forEach(rm);
    if (fs.existsSync(this.file)) return this.openExisting();
    if (fs.existsSync(this.jsonFile)) return this.migrateFromJson();
    const db = emptyDb();
    seedCostCatalogs(db);
    const out = this.normalize(db);
    this.createFile(out, null);
    if (this.log.empty) this.log.append([{ action: 'khoi-tao', kind: 'data', label: 'Tạo sổ mới (chưa có dữ liệu)' }]);
    return out;
  }

  openExisting() {
    let sql;
    let raw;
    let snap;
    try {
      sql = new SqliteDb(this.file);
      this.applyTestLimits(sql);
      const v = sql.version;
      if (v > DB_VERSION) {
        sql.close();
        throw Object.assign(new Error('File ' + this.file + ' được tạo bởi phiên bản phần mềm mới hơn (lược đồ ' + v + ', bản này đọc được tới ' + DB_VERSION +
          '). Hãy dùng phiên bản phần mềm mới hơn; dữ liệu không bị đụng tới.'), { fatal: true });
      }
      // Lược đồ cũ hơn (4): sao lưu nguyên trạng rồi nâng cấp trong một giao dịch (lỗi → giữ nguyên file, báo lỗi)
      if (v < DB_VERSION && !sql.problem()) {
        this.sql = sql;
        const bk = this.backup('truoc-nang-cap-luoc-do-' + DB_VERSION);
        this.sql = null;
        const done = sql.migrate();
        this.upgraded = { from: v, to: DB_VERSION, backup: bk, done };
        console.log('  Đã nâng cấp dữ liệu lên lược đồ ' + DB_VERSION + ' (sao lưu trước khi nâng: ' + bk + ').');
      }
      const p = sql.problem();
      if (p) throw new Error(p);
      ({ db: raw, snap } = sql.readAll());
    } catch (e) {
      if (sql) sql.close();
      if (e.fatal) throw e;
      if (isBusy(e)) {
        throw new Error('File dữ liệu ' + this.file + ' đang bị một chương trình khác khóa (có thể phần mềm đang chạy ở cửa sổ khác, hoặc đang mở bằng công cụ xem SQLite). ' +
          'Hãy đóng chương trình đó rồi chạy lại.');
      }
      return this.recover(e);
    }
    this.sql = sql;
    this.snap = snap;
    this.dataVersion = this.readDataVersion();
    this.finishJsonRename();
    const out = this.normalize(raw);
    // nâng từ lược đồ < 8: điền sẵn Loại chi phí cho hạng mục theo dữ liệu cũ (không đổi dòng chi phí nào; người dùng xem lại ở danh mục)
    if (this.upgraded && this.upgraded.from < 8) {
      const goiY = KT.goiYLoaiCPHangMuc(out);
      let n = 0;
      out.costItems.forEach((it) => { if (!it.loaiCP && goiY.has(it.ma)) { it.loaiCP = goiY.get(it.ma); n++; } });
      if (n) this.upgraded.done.push('điền Loại chi phí cho ' + n + ' hạng mục theo dữ liệu cũ');
    }
    this.persistNormalized(out);
    if (this.log.empty) this.log.append([{ action: 'khoi-tao', kind: 'data', label: 'Bắt đầu ghi nhật ký thay đổi', note: 'Dữ liệu lúc bắt đầu: ' + dataSummary(out) }]);
    if (this.upgraded) {
      this.log.append([{ action: 'nang-cap', kind: 'data', label: 'Nâng cấp lược đồ dữ liệu ' + this.upgraded.from + ' → ' + this.upgraded.to,
        note: this.upgraded.done.join('; ') + '. Sao lưu trước khi nâng: ' + this.upgraded.backup }]);
    }
    return out;
  }

  // normalize() có thể đã sửa vài thứ (id thiếu…): ghi lại những dòng đó
  persistNormalized(out) {
    const r = this.sql.tx(() => this.sql.writeDiff(out, this.snap));
    this.snap = r.snap;
  }

  // Mất điện đúng lúc giữa hai bước đổi tên của lần chuyển đổi: ketoan.db đã có, ketoan.json chưa kịp đổi tên.
  // Chỉ đổi tên khi chắc chắn đó đúng là file đã chuyển (mã băm khớp); file khác thì để nguyên và cảnh báo.
  finishJsonRename() {
    if (!fs.existsSync(this.jsonFile)) return;
    let from;
    try { from = this.sql.getMeta('chuyenTu'); } catch (e) { from = null; }
    let same = false;
    try { same = !!(from && from.sha256 && from.sha256 === sha256(fs.readFileSync(this.jsonFile))); } catch (e) { same = false; }
    if (same) {
      this.renameMigratedJson();
      return;
    }
    console.warn('');
    console.warn('  LƯU Ý: thư mục dữ liệu có cả ketoan.db và ketoan.json. Phần mềm dùng ketoan.db; ketoan.json KHÔNG được tự nhập.');
    console.warn('  Muốn đưa dữ liệu trong ketoan.json vào, dùng Cài đặt → Khôi phục từ file sao lưu.');
    console.warn('');
  }

  renameMigratedJson() {
    let dest = this.jsonFile + '.da-chuyen-sqlite.bak';
    if (fs.existsSync(dest)) dest = this.jsonFile + '.da-chuyen-sqlite-' + stamp() + '.bak';
    try { fs.renameSync(this.jsonFile, dest); } catch (e) {
      // Windows khóa file (diệt virus, OneDrive…): để nguyên, lần mở sau tự hoàn tất (mã băm vẫn khớp)
      console.warn('  Chưa đổi tên được ketoan.json (' + e.message + '); lần mở sau phần mềm sẽ làm lại.');
      return null;
    }
    return path.basename(dest);
  }

  // Tạo ketoan.db mới từ đối tượng dữ liệu: dựng ở file tạm rồi mới đổi tên (không bao giờ để lại ketoan.db dở dang)
  createFile(db, meta) {
    const tmp = this.file + '.dang-chuyen';
    [tmp, tmp + '-journal'].forEach(rm);
    const d = new SqliteDb(tmp, { create: true });
    let snap;
    try {
      d.createSchema();
      snap = d.tx(() => {
        const r = d.writeDiff(db, null);
        if (meta) Object.keys(meta).forEach((k) => d.setMeta(k, meta[k]));
        return r.snap;
      });
    } catch (e) {
      d.close();
      [tmp, tmp + '-journal'].forEach(rm);
      throw e;
    }
    d.close();
    this.moveIntoPlace(tmp);
    this.sql = new SqliteDb(this.file);
    this.applyTestLimits(this.sql);
    this.snap = this.sql.readAll().snap || snap;
    this.dataVersion = this.readDataVersion();
  }

  moveIntoPlace(tmp) {
    try { fs.renameSync(tmp, this.file); } catch (e) {
      fs.copyFileSync(tmp, this.file);
      rm(tmp);
    }
  }

  // Chỉ dùng khi kiểm thử: giới hạn số trang để giả lập ổ đĩa đầy (SQLITE_FULL)
  applyTestLimits(sql) {
    const n = Number(process.env.KETOAN_THU_MAX_PAGE);
    if (n > 0) sql.conn.exec('PRAGMA max_page_count = ' + Math.floor(n));
  }

  readDataVersion() {
    try { return this.sql.conn.prepare('PRAGMA data_version').get().data_version; } catch (e) { return null; }
  }

  /* ---------------- chuyển từ JSON ---------------- */

  migrateFromJson() {
    const at = new Date().toISOString();
    const info = { at, source: 'ketoan.json', toVersion: DB_VERSION, fixes: [], anomalies: [], ok: false };
    const reportFile = path.join(this.dir, 'migrate-bao-cao.txt');
    const writeReport = () => { try { fs.writeFileSync(reportFile, '﻿' + migrate.baoCao(info), 'utf8'); } catch (e) { console.error('Không ghi được ' + reportFile + ': ' + e.message); } };
    const fail = (msg, cause) => {
      info.error = msg;
      writeReport();
      const err = new Error('Chưa chuyển được dữ liệu sang SQLite: ' + msg + '. File ketoan.json được GIỮ NGUYÊN, không bị sửa. ' +
        'Xem chi tiết trong ' + reportFile + ' và gửi file này cho người hỗ trợ; trong lúc chờ có thể quay lại phiên bản cũ (xem HUONG_DAN_SU_DUNG.md, mục "Quay lại bản cũ").');
      err.cause = cause;
      return err;
    };
    let bytes = fs.readFileSync(this.jsonFile);
    info.sha256 = sha256(bytes);
    let raw;
    try {
      raw = JSON.parse(bytes.toString('utf8').replace(/^﻿/, ''));
    } catch (e) {
      // như bản trước: lấy bản sao lưu đọc được gần nhất, file hỏng được giữ lại (đổi tên) chứ không bị xóa
      const r = this.recoverJsonSource(e);
      if (!r) throw fail('ketoan.json bị hỏng (' + e.message + ') và không có bản sao lưu .json nào đọc được trong ' + this.backupDir, e);
      raw = r.data;
      bytes = null;
      info.recoveredFrom = r.name;
      info.keptBroken = r.kept;
      info.fixes.push('ketoan.json bị hỏng (' + e.message + '): dùng bản sao lưu ' + r.name + '; file hỏng giữ lại là ' + r.kept + '.');
    }
    const bad = shapeProblem(raw);
    if (bad) throw fail('ketoan.json không đúng cấu trúc: ' + bad);
    info.fromSchema = Number(raw.schema) || 1;
    // 1. sao lưu nguyên văn file JSON (bản này không bao giờ bị tự xóa)
    if (bytes) {
      info.backup = 'ketoan-' + stamp() + '-truoc-khi-chuyen-sqlite.json';
      fs.writeFileSync(path.join(this.backupDir, info.backup), bytes, { flag: 'w' });
    } else info.backup = info.recoveredFrom;
    // 2. phân tích bất thường trên dữ liệu gốc, rồi chuẩn hóa nhẹ như bản trước vẫn làm khi mở dữ liệu
    info.anomalies = migrate.phanTich(raw);
    const rawCopy = JSON.parse(JSON.stringify(raw));
    this.fixes = info.fixes;
    const src = this.normalize(rawCopy);
    this.fixes = null;
    this.describeNormalize(raw, src, info.fixes);
    info.src = migrate.soLieu(src);
    const want = migrate.canon(src);
    // 3. dựng file tạm trong MỘT giao dịch, đối chiếu trước khi COMMIT
    const tmp = this.file + '.dang-chuyen';
    [tmp, tmp + '-journal'].forEach(rm);
    const fault = process.env.KETOAN_THU_LOI_CHUYEN || ''; // chỉ dùng khi kiểm thử: giua | lech | sau-commit
    let d = null;
    try {
      d = new SqliteDb(tmp, { create: true });
      d.createSchema();
      d.conn.exec('BEGIN IMMEDIATE');
      d.writeDiff(src, null);
      d.setMeta('chuyenTu', { file: 'ketoan.json', sha256: info.sha256, at, schema: info.fromSchema, recoveredFrom: info.recoveredFrom || null });
      if (fault === 'giua') throw new Error('giả lập lỗi giữa chừng (kiểm thử)');
      const back = this.normalize(d.readAll().db);
      info.dst = migrate.soLieu(back);
      info.fullMatch = migrate.canon(back) === want;
      const diff = migrate.soSanh(info.src, info.dst);
      if (fault === 'lech') diff.push('giả lập lệch số liệu (kiểm thử)');
      if (diff.length || !info.fullMatch) throw new Error('số liệu đọc lại từ SQLite không khớp dữ liệu gốc (' + (diff.join('; ') || 'nội dung bản ghi') + ')');
      d.conn.exec('COMMIT');
      d.close();
      d = null;
      if (fault === 'sau-commit') throw new Error('giả lập lỗi sau khi ghi (kiểm thử)');
      // 4. mở lại file tạm: kiểm tra toàn vẹn và đối chiếu lần 2
      const d2 = new SqliteDb(tmp, { readOnly: true });
      try {
        const p = d2.problem();
        if (p) throw new Error('kiểm tra file tạm: ' + p);
        const again = this.normalize(d2.readAll().db);
        if (migrate.canon(again) !== want || migrate.soSanh(info.src, migrate.soLieu(again)).length) throw new Error('đối chiếu lần 2 không khớp');
      } finally { d2.close(); }
    } catch (e) {
      if (d) { try { d.conn.exec('ROLLBACK'); } catch (e2) { /* đã hủy */ } d.close(); }
      [tmp, tmp + '-journal'].forEach(rm);
      throw fail(e.message, e);
    }
    // 5. đổi tên: file tạm → ketoan.db (nguyên tử), rồi ketoan.json → .da-chuyen-sqlite.bak
    this.moveIntoPlace(tmp);
    info.ok = true;
    if (fs.existsSync(this.jsonFile) && !info.recoveredFrom) this.renameMigratedJson();
    writeReport();
    this.sql = new SqliteDb(this.file);
    this.applyTestLimits(this.sql);
    const { db: raw2, snap } = this.sql.readAll();
    this.snap = snap;
    this.dataVersion = this.readDataVersion();
    const out = this.normalize(raw2);
    this.lastBackupAt = 0; // lần sửa đầu tiên vẫn tạo bản sao lưu tự động dạng .db
    const upg = info.fromSchema < 3;
    this.log.append([{ action: 'khoi-tao', kind: 'data',
      label: upg ? 'Khởi tạo từ dữ liệu cũ (nâng cấp dữ liệu từ phiên bản ' + info.fromSchema + ' lên ' + SCHEMA_VERSION + ', chuyển sang lưu bằng SQLite)'
        : 'Chuyển cách lưu dữ liệu sang SQLite (ketoan.json → ketoan.db)',
      note: (upg ? 'Dữ liệu trước thời điểm này không có lịch sử thay đổi. ' : '') + 'Hiện có ' + dataSummary(out) + '. Tồn quỹ ' + info.dst.tonQuySo +
        ' đ, khớp dữ liệu gốc. Bản sao lưu trước khi chuyển: ' + (info.backup || '(không có)') + '. Báo cáo: migrate-bao-cao.txt' }]);
    console.log('  Đã chuyển dữ liệu sang SQLite (ketoan.db). Báo cáo đối chiếu: ' + reportFile);
    return out;
  }

  // Ghi lại các chỉnh sửa normalize() đã làm (so dữ liệu gốc với dữ liệu đã chuẩn hóa)
  describeNormalize(raw, out, fixes) {
    const n = (v) => (Array.isArray(v) ? v.length : 0);
    ['trash', 'cashCounts', 'attachments', 'locks'].forEach((k) => {
      const lost = n(raw[k]) - n(out[k]);
      if (lost > 0) fixes.push('Bỏ ' + lost + ' mục "' + k + '" sai hình dạng / trùng (như bản trước vẫn bỏ khi mở dữ liệu).');
    });
    if (!Array.isArray(raw.costGroups)) fixes.push('Dữ liệu chưa có phần chi phí: nạp ' + out.costGroups.length + ' nhóm chi phí và ' + out.costItems.length + ' hạng mục mặc định.');
    const noSeq = (k) => (Array.isArray(raw[k]) ? raw[k].filter((e) => e && !e.seq).length : 0);
    ['entries', 'costs'].forEach((k) => { if (noSeq(k)) fixes.push(noSeq(k) + ' ' + LIST_LABEL[k] + ' thiếu số thứ tự (seq): được đánh số tiếp theo.'); });
    const pf = (Array.isArray(raw.projects) ? raw.projects : []).filter((p) => p.ngayKhoiCong === undefined || p.diaChi === undefined).length;
    if (pf) fixes.push(pf + ' công trình thiếu trường ngày khởi công / địa chỉ: bổ sung giá trị rỗng (như bản trước).');
    if (Number(raw.nextId) !== out.nextId) fixes.push('Bộ đếm id (nextId): ' + JSON.stringify(raw.nextId) + ' → ' + out.nextId + ' (lớn hơn mọi id đang dùng).');
  }

  // ketoan.json hỏng lúc chuyển đổi: lấy bản sao lưu .json đọc được gần nhất (như bản trước), giữ file hỏng
  recoverJsonSource(cause) {
    for (const b of this.listBackups().filter((x) => /\.json$/.test(x.name))) {
      let data;
      try { data = this.readBackup(b.name); } catch (e) { continue; }
      if (!data || !Array.isArray(data.entries) || !Array.isArray(data.projects) || !Array.isArray(data.suppliers) || shapeProblem(data)) continue;
      const kept = 'ketoan.json.hong-' + stamp();
      fs.renameSync(this.jsonFile, path.join(this.dir, kept));
      console.warn('');
      console.warn('  CẢNH BÁO: file dữ liệu ketoan.json bị hỏng (' + cause.message + ').');
      console.warn('  Đã khôi phục từ bản sao lưu ' + b.name + ' (giờ ' + b.time + ').');
      console.warn('  File hỏng được giữ lại là ' + kept + ' trong thư mục dữ liệu.');
      console.warn('');
      this.recoveredFrom = b.name;
      return { data, name: b.name, kept };
    }
    return null;
  }

  // ketoan.db không mở được / hỏng (mất điện lúc ổ đĩa đang ghi, ổ đĩa lỗi...). Thử bản sao lưu gần nhất còn đọc được (.db hoặc
  // .json); file hỏng (kèm file nhật ký giao dịch -journal nếu có) được giữ lại bằng cách đổi tên, không bao giờ bị xóa hay ghi đè.
  recover(cause) {
    const name = 'ketoan.db';
    for (const b of this.listBackups()) {
      let data;
      try { data = this.readBackup(b.name); } catch (e) { continue; }
      if (!data || !Array.isArray(data.entries) || !Array.isArray(data.projects) || !Array.isArray(data.suppliers) || shapeProblem(data)) continue;
      const kept = name + '.hong-' + stamp();
      fs.renameSync(this.file, path.join(this.dir, kept));
      if (fs.existsSync(this.file + '-journal')) fs.renameSync(this.file + '-journal', path.join(this.dir, kept + '-journal'));
      console.warn('');
      console.warn('  CẢNH BÁO: file dữ liệu ' + name + ' bị hỏng (' + cause.message + ').');
      console.warn('  Đã khôi phục từ bản sao lưu ' + b.name + ' (giờ ' + b.time + ').');
      console.warn('  File hỏng được giữ lại là ' + kept + ' trong thư mục dữ liệu.');
      console.warn('');
      this.recoveredFrom = b.name;
      const out = this.normalize(data);
      this.createFile(out, null);
      if (this.log.empty) this.log.append([{ action: 'khoi-tao', kind: 'data', label: 'Bắt đầu ghi nhật ký thay đổi', note: 'Dữ liệu lúc bắt đầu: ' + dataSummary(out) }]);
      return out;
    }
    throw new Error('File dữ liệu ' + this.file + ' bị hỏng (' + cause.message + ') và không có bản sao lưu nào đọc được trong ' + this.backupDir +
      '. Phần mềm không tự sửa hay xóa file này — hãy chép nó (cùng thư mục backups) để người hỗ trợ cứu dữ liệu.');
  }

  /* ---------------- chuẩn hóa (giữ nguyên như bản JSON, thêm xử lý id trùng) ---------------- */

  normalize(db) {
    const base = emptyDb();
    const out = Object.assign(base, db);
    const fromOld = !Array.isArray(db.costGroups); // dữ liệu bản cũ chưa có phần chi phí
    out.schema = SCHEMA_VERSION;
    out.settings = Object.assign(defaultSettings(), db.settings || {});
    ID_LISTS.forEach((k) => { out[k] = Array.isArray(db[k]) ? db[k] : []; });
    // schema 3: thùng rác (bỏ mục hỏng hình dạng thay vì làm hỏng cả kho)
    out.trash = (Array.isArray(db.trash) ? db.trash : []).filter((t) => t && typeof t === 'object' && Array.isArray(t.records) && typeof t.kind === 'string');
    out.cashCounts = (Array.isArray(db.cashCounts) ? db.cashCounts : []).filter((k) => k && typeof k === 'object' && typeof k.ngay === 'string');
    out.attachments = (Array.isArray(db.attachments) ? db.attachments : []).filter((a) => a && typeof a === 'object' && typeof a.file === 'string' && typeof a.owner === 'string');
    out.ignoredWarnings = db.ignoredWarnings && typeof db.ignoredWarnings === 'object' && !Array.isArray(db.ignoredWarnings) ? db.ignoredWarnings : {};
    const seenLock = new Set();
    out.locks = (Array.isArray(db.locks) ? db.locks : []).filter((l) => l && /^\d{4}-(0[1-9]|1[0-2])$/.test(l.thang) && !seenLock.has(l.thang) && seenLock.add(l.thang))
      .sort((a, b) => (a.thang < b.thang ? -1 : 1));
    out.vouchers = db.vouchers && typeof db.vouchers === 'object' ? db.vouchers : {};
    // schema 5: gộp mã
    out.aliases = (Array.isArray(db.aliases) ? db.aliases : []).filter((a) => a && typeof a === 'object' && typeof a.ma === 'string' && typeof a.dich === 'string' && typeof a.loai === 'string');
    out.mergeLog = (Array.isArray(db.mergeLog) ? db.mergeLog : []).filter((g) => g && typeof g === 'object' && typeof g.loai === 'string');
    out.ignoredDupes = db.ignoredDupes && typeof db.ignoredDupes === 'object' && !Array.isArray(db.ignoredDupes) ? db.ignoredDupes : {};
    delete out.budgets; // chức năng dự toán đã bỏ
    if (fromOld) seedCostCatalogs(out);
    out.projects.forEach((p) => {
      if (p.ngayKhoiCong === undefined) p.ngayKhoiCong = '';
      if (p.diaChi === undefined) p.diaChi = '';
    });
    let maxId = 0;
    ID_LISTS.forEach((k) => out[k].forEach((x) => {
      if (typeof x.id !== 'number') x.id = 0;
      maxId = Math.max(maxId, x.id);
    }));
    // id của bản ghi trong thùng rác vẫn "đang giữ chỗ": không cấp lại cho bản ghi mới (khôi phục sẽ không bị trùng id)
    out.cashCounts.forEach((k) => { if (typeof k.id !== 'number') k.id = 0; maxId = Math.max(maxId, k.id); });
    out.attachments.forEach((a) => { maxId = Math.max(maxId, Number(a.id) || 0); });
    out.cashCounts.forEach((k) => { if (!k.id) k.id = ++maxId; });
    out.aliases.concat(out.mergeLog).forEach((x) => { maxId = Math.max(maxId, Number(x.id) || 0); });
    out.aliases.concat(out.mergeLog).forEach((x) => { if (!Number.isSafeInteger(x.id) || x.id <= 0) x.id = ++maxId; });
    out.trash.forEach((t) => {
      maxId = Math.max(maxId, Number(t.id) || 0);
      t.records.concat(t.attachments || []).forEach((r) => { maxId = Math.max(maxId, Number(r && r.id) || 0, Number(r && r.phieuId) || 0); });
    });
    out.trash.forEach((t) => { if (typeof t.id !== 'number' || !t.id) t.id = ++maxId; });
    ID_LISTS.forEach((k) => out[k].forEach((x) => { if (!x.id) x.id = ++maxId; }));
    // SQLite: id là khóa chính của từng bảng → id hỏng / trùng trong cùng danh sách được cấp id mới (ghi lại để báo cáo)
    const note = (s) => { if (this.fixes) this.fixes.push(s); else console.warn('  Chuẩn hóa dữ liệu: ' + s); };
    out.attachments.forEach((a) => { if (!Number.isSafeInteger(a.id) || a.id <= 0) { const old = a.id; a.id = ++maxId; note('Chứng từ "' + (a.name || a.file) + '" có id không hợp lệ (' + JSON.stringify(old) + ') → id ' + a.id + '.'); } });
    ID_LISTS.concat(['cashCounts', 'attachments', 'trash', 'aliases', 'mergeLog']).forEach((k) => {
      const seen = new Set();
      out[k].forEach((x) => {
        if (!Number.isSafeInteger(x.id) || x.id <= 0) { const old = x.id; x.id = ++maxId; note(LIST_LABEL[k] + ' có id không hợp lệ (' + JSON.stringify(old) + ') → id ' + x.id + '.'); }
        if (seen.has(x.id)) { const old = x.id; x.id = ++maxId; note(LIST_LABEL[k] + ' trùng id ' + old + ' → bản sau nhận id ' + x.id + '.'); }
        seen.add(x.id);
      });
    });
    out.nextId = Math.max(Number(out.nextId) || 1, maxId + 1);
    [out.entries, out.costs].forEach((list) => {
      let maxSeq = 0;
      list.forEach((e) => { maxSeq = Math.max(maxSeq, Number(e.seq) || 0); });
      list.forEach((e) => { if (!e.seq) e.seq = ++maxSeq; });
    });
    return out;
  }

  newId() {
    return this.db.nextId++;
  }

  nextSeq(listName) {
    const k = listName || 'entries';
    let max = 0;
    this.db[k].forEach((e) => { if (e.seq > max) max = e.seq; });
    // bản ghi trong thùng rác vẫn giữ số thứ tự: khôi phục về không bị trùng thứ tự với dòng mới
    (this.db.trash || []).forEach((t) => { if (t.kind === k) t.records.forEach((e) => { if (e.seq > max) max = e.seq; }); });
    return max + 1;
  }

  // Bản ghi mới bị đẩy vào danh sách với id 0 / thiếu id (bản JSON để normalize() lần mở sau cấp): cấp ngay vì id là khóa chính
  fixIds(db) {
    ID_LISTS.concat(['cashCounts', 'attachments', 'trash', 'aliases', 'mergeLog']).forEach((k) => (db[k] || []).forEach((x) => {
      if (x && typeof x === 'object' && (!Number.isSafeInteger(x.id) || x.id <= 0)) x.id = this.newId();
    }));
  }

  /* ---------------- ghi ---------------- */

  // Bản ghi MỚI chưa có người tạo: ghi người đang thao tác. Mới = id 0 / thiếu id; với snap (thay toàn bộ khi nhập Excel): cả bản ghi
  // có id chưa từng có trong dữ liệu hiện tại. Bản ghi cũ không có nguoiTao giữ nguyên (hiển thị là "Dữ liệu cũ").
  nhanNguoi() { return (this.nguoiThaoTac && this.nguoiThaoTac()) || NGUOI_MAY; }
  danDauMoi(db, snap) {
    const nhan = this.nhanNguoi();
    STAMP_LISTS.forEach((k) => (db[k] || []).forEach((x) => {
      if (!x || typeof x !== 'object' || x.nguoiTao !== undefined) return;
      const moi = !Number.isSafeInteger(x.id) || x.id <= 0 || (snap && !(snap[k] && snap[k].has(x.id)));
      if (moi) x.nguoiTao = nhan;
    }));
  }

  // Một chương trình khác (phần mềm mở ở cửa sổ thứ hai, công cụ SQLite...) đã ghi vào ketoan.db kể từ lần đọc / ghi gần nhất?
  changedOutside() {
    const v = this.readDataVersion();
    return this.dataVersion != null && v != null && v !== this.dataVersion;
  }

  // Bỏ thay đổi chưa lưu được trong bộ nhớ: trở về đúng trạng thái đã ghi thành công gần nhất (dựng từ ảnh chụp, không cần
  // đọc đĩa — đĩa có thể đang bị khóa / đầy). Ảnh chụp chỉ được cập nhật sau mỗi lần COMMIT nên luôn khớp file.
  rollbackMemory() {
    this.db = this.normalize(fromSnapshot(this.snap));
  }

  // Nạp lại từ đĩa (chương trình khác vừa ghi vào file); đọc không được thì trở về trạng thái đã ghi gần nhất
  reloadFromDisk() {
    try {
      const { db, snap } = this.sql.readAll();
      this.db = this.normalize(db);
      this.snap = snap;
      this.dataVersion = this.readDataVersion();
    } catch (e) {
      console.error('Không nạp lại được dữ liệu từ đĩa (' + e.message + '); dùng trạng thái đã lưu gần nhất.');
      this.rollbackMemory();
    }
  }

  save() {
    let outside = false;
    try {
      outside = this.changedOutside();
      if (!outside) {
        this.db.updatedAt = new Date().toISOString();
        if (Date.now() - this.lastBackupAt > AUTO_BACKUP_INTERVAL_MS) this.backup('tu-dong');
        this.danDauMoi(this.db);
        this.fixIds(this.db);
        const r = this.sql.tx(() => this.sql.writeDiff(this.db, this.snap));
        this.snap = r.snap;
        this.dataVersion = this.readDataVersion();
      }
    } catch (e) {
      this.pendingAudit = [];
      this.rollbackMemory();
      throw Object.assign(new Error('Không lưu được dữ liệu (' + e.message + '). Thao tác vừa rồi CHƯA được ghi; dữ liệu giữ nguyên như lần lưu trước.'), { cause: e });
    }
    if (outside) {
      this.pendingAudit = [];
      this.reloadFromDisk();
      throw Object.assign(new Error('Dữ liệu vừa bị một chương trình khác thay đổi (có thể phần mềm đang mở ở cửa sổ thứ hai). Thao tác vừa rồi CHƯA được lưu; ' +
        'màn hình đã được nạp lại theo dữ liệu mới nhất, hãy làm lại.'), { status: 409 });
    }
    this.flushAudit();
  }

  // Bản sao lưu nhất quán (trạng thái đã ghi gần nhất) bằng VACUUM INTO; đặt tên thật sau khi ghi xong
  backup(reason) {
    if (!this.sql) return null;
    const name = 'ketoan-' + stamp() + (reason ? '-' + reason : '') + '.db';
    const tmp = path.join(this.backupDir, '.dang-sao-luu-' + process.pid + '-' + Date.now() + '.db');
    rm(tmp);
    try {
      this.sql.vacuumInto(tmp);
      try { fs.renameSync(tmp, path.join(this.backupDir, name)); } catch (e) {
        fs.copyFileSync(tmp, path.join(this.backupDir, name));
        rm(tmp);
      }
    } catch (e) {
      rm(tmp);
      throw e;
    }
    this.lastBackupAt = Date.now();
    this.pruneBackups();
    return name;
  }

  pruneBackups() {
    const files = this.listBackups().filter((f) => !KEEP_FOREVER.test(f.name));
    files.slice(MAX_BACKUPS).forEach((f) => {
      try { fs.unlinkSync(path.join(this.backupDir, f.name)); } catch (e) { /* bỏ qua */ }
    });
  }

  // Bản sao lưu: .db (từ khi dùng SQLite) và .json (thời trước) — cả hai khôi phục được
  listBackups() {
    if (!fs.existsSync(this.backupDir)) return [];
    return fs.readdirSync(this.backupDir)
      .filter((f) => /^ketoan-.*\.(db|json)$/.test(f))
      .map((f) => {
        const st = fs.statSync(path.join(this.backupDir, f));
        return { name: f, size: st.size, time: st.mtime.toISOString() };
      })
      .sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : a.name < b.name ? 1 : -1));
  }

  readBackup(name) {
    if (!/^ketoan-[\w.-]+\.(json|db)$/.test(name)) throw new Error('Tên bản sao lưu không hợp lệ');
    const file = path.join(this.backupDir, name);
    if (/\.db$/.test(name)) {
      if (!fs.existsSync(file)) throw Object.assign(new Error('Không tìm thấy bản sao lưu'), { code: 'ENOENT' });
      return readDbFile(file);
    }
    const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
    return JSON.parse(raw);
  }

  // opts.danDauMoi: bản ghi mới (id 0) ghi người đang thao tác (nhập Excel). Khôi phục sao lưu thì KHÔNG (giữ nguyên như bản sao lưu).
  replaceAll(db, reason, opts) {
    const name = this.backup(reason || 'truoc-thay-the');
    if (opts && opts.danDauMoi) this.danDauMoi(db, this.snap || {});
    const out = this.normalize(db);
    try {
      const r = this.sql.tx(() => {
        this.sql.clearAll();
        return this.sql.writeDiff(out, null);
      });
      this.snap = r.snap;
      this.db = out;
      this.dataVersion = this.readDataVersion();
    } catch (e) {
      this.pendingAudit = [];
      this.rollbackMemory();
      throw Object.assign(new Error('Không thay được dữ liệu (' + e.message + '). Dữ liệu hiện tại giữ nguyên.'), { cause: e });
    }
    this.flushAudit();
    return name;
  }

  // Ghi một trạng thái dữ liệu mới (vd sau khi nhập Excel) trong MỘT giao dịch: ghi xong đọc lại từ SQLite ngay trong giao dịch,
  // check(dữ liệu đọc lại) trả danh sách lỗi; có lỗi thì ROLLBACK, dữ liệu trên đĩa và trong bộ nhớ giữ nguyên. Trả tên bản sao lưu.
  commitChecked(newDb, check, reason, opts) {
    if (this.changedOutside()) {
      this.reloadFromDisk();
      throw Object.assign(new Error('Dữ liệu vừa bị một chương trình khác thay đổi — chưa ghi gì, hãy chạy lại.'), { status: 409 });
    }
    const name = reason ? this.backup(reason) : null;
    if (opts && opts.danDauMoi) this.danDauMoi(newDb, this.snap || {});
    const out = this.normalize(newDb);
    try {
      const r = this.sql.tx(() => {
        const w = this.sql.writeDiff(out, this.snap);
        const back = this.normalize(this.sql.readAll().db);
        const errs = (check && check(back)) || [];
        if (errs.length) throw Object.assign(new Error('Kiểm tra trước khi ghi không đạt (đã hủy, dữ liệu giữ nguyên): ' + errs.slice(0, 5).join('; ')), { checkErrors: errs });
        return w;
      });
      this.snap = r.snap;
      this.db = out;
      this.dataVersion = this.readDataVersion();
    } catch (e) {
      this.pendingAudit = [];
      this.rollbackMemory();
      throw e;
    }
    this.flushAudit();
    return name;
  }

  /* ---------------- tải về / tải lên ---------------- */

  // Toàn bộ dữ liệu dạng JSON (cùng hình dạng file ketoan.json cũ — bản JSON trước đây mở được)
  exportJson() {
    return JSON.stringify(this.db, null, 1);
  }

  // Một bản .db nhất quán để tải về. opts.boXacThuc: xóa sạch dữ liệu đăng nhập (người dùng, mã băm mật khẩu, phiên, mã khôi phục,
  // sự kiện bảo mật) khỏi bản tải về rồi VACUUM để không còn sót trong trang trống của file.
  snapshotBuffer(opts) {
    const tmp = path.join(this.backupDir, '.dang-tai-ve-' + process.pid + '-' + Date.now() + '.db');
    rm(tmp);
    try {
      this.sql.vacuumInto(tmp);
      if (opts && opts.boXacThuc) {
        const c = new DatabaseSync(tmp);
        try {
          const have = new Set(c.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
          AUTH_TABLE_NAMES.forEach((t) => { if (have.has(t)) c.exec('DELETE FROM "' + t + '"'); }); // tên bảng lấy từ hằng số
          c.exec('VACUUM');
        } finally { c.close(); }
      }
      return fs.readFileSync(tmp);
    } finally { [tmp, tmp + '-journal'].forEach(rm); }
  }

  // Đọc file .db người dùng tải lên (khôi phục): kiểm tra rồi trả đối tượng dữ liệu; file lạ / hỏng → lỗi, không đụng dữ liệu hiện tại
  readDbBuffer(buf) {
    if (!looksLikeSqlite(buf)) throw new Error('File không phải dữ liệu SQLite của phần mềm');
    const tmp = path.join(this.dir, '.dang-khoi-phuc-' + process.pid + '-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.db');
    fs.writeFileSync(tmp, buf, { flag: 'wx' });
    try { return readDbFile(tmp); } finally { [tmp, tmp + '-journal'].forEach(rm); }
  }

  close() {
    if (this.sql) this.sql.close();
    this.sql = null;
  }
}

module.exports = { Store, emptyDb, defaultSettings, dataSummary, shapeProblem, SCHEMA_VERSION, DEFAULT_COST_GROUPS, DEFAULT_COST_ITEMS };
