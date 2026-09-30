'use strict';
/*
 * Kho dữ liệu dạng file JSON.
 * - Ghi an toàn: ghi ra file tạm rồi đổi tên, không bao giờ để file dữ liệu bị ghi dở.
 * - Tự sao lưu vào data/backups (tối đa 1 bản / 10 phút khi đang sửa, và luôn sao lưu
 *   trước các thao tác lớn như nhập Excel, khôi phục, xóa toàn bộ).
 */
const fs = require('fs');
const path = require('path');
const { AuditLog } = require('./audit');

// 1: sổ thu chi. 2: thêm chi phí công trình (nhóm CP, hạng mục, vật tư, nhà, dòng chi phí).
// 3: nhóm "độ chính xác và truy vết": thùng rác (xóa mềm), trạng thái nháp, khóa sổ, cảnh báo đã bỏ qua,
//    kiểm quỹ, chứng từ đính kèm. Nhật ký thay đổi nằm riêng ở data/nhat-ky.jsonl.
//    Bản ghi cũ KHÔNG bị thêm trường nào: thiếu trangThai nghĩa là "Đã ghi sổ".
const SCHEMA_VERSION = 3;
const MAX_BACKUPS = 60;
const AUTO_BACKUP_INTERVAL_MS = 10 * 60 * 1000;

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

// Các danh sách dữ liệu có id (dùng chung bộ đếm nextId)
const ID_LISTS = ['projects', 'suppliers', 'entries', 'costGroups', 'costItems', 'materials', 'houses', 'costs'];

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
    nextId: 1,
    updatedAt: new Date().toISOString()
  };
}

// Tóm tắt dữ liệu để ghi vào nhật ký (khởi tạo, khôi phục...)
function dataSummary(db) {
  return (db.entries || []).length + ' dòng sổ thu chi, ' + (db.costs || []).length + ' dòng chi phí, ' +
    (db.projects || []).length + ' dự án, ' + (db.suppliers || []).length + ' nhà cung cấp, ' + (db.materials || []).length + ' vật tư';
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

class Store {
  constructor(dataDir) {
    this.dir = dataDir;
    this.file = path.join(dataDir, 'ketoan.json');
    this.backupDir = path.join(dataDir, 'backups');
    this.lastBackupAt = 0;
    fs.mkdirSync(this.backupDir, { recursive: true });
    this.log = new AuditLog(dataDir);
    this.pendingAudit = [];
    this.db = this.load();
  }

  // Ghi nhận một thay đổi; được ghi vào nhật ký ngay sau khi file dữ liệu lưu thành công (save / replaceAll)
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
    return out;
  }

  load() {
    if (!fs.existsSync(this.file)) {
      const db = emptyDb();
      seedCostCatalogs(db);
      const out = this.normalize(db);
      this.writeFile(out);
      if (this.log.empty) this.log.append([{ action: 'khoi-tao', kind: 'data', label: 'Tạo sổ mới (chưa có dữ liệu)' }]);
      return out;
    }
    let db;
    try {
      db = JSON.parse(fs.readFileSync(this.file, 'utf8').replace(/^﻿/, ''));
    } catch (e) {
      db = this.recover(e);
    }
    const oldSchema = Number(db.schema) || 1;
    if (oldSchema < SCHEMA_VERSION) {
      // Nâng cấp dữ liệu cũ: sao lưu nguyên bản trước, rồi ghi bản đã nâng cấp
      const bk = this.backup('truoc-nang-cap-v' + SCHEMA_VERSION);
      this.lastBackupAt = 0; // bản trước nâng cấp là dữ liệu dạng cũ: lần sửa đầu tiên vẫn sao lưu tự động bản đã nâng cấp
      const out = this.normalize(db);
      this.writeFile(out);
      // Dữ liệu cũ không có lịch sử: ghi một mục mở đầu (chỉ một lần — lần mở sau schema đã là bản mới)
      this.log.append([{ action: 'khoi-tao', kind: 'data', label: 'Khởi tạo từ dữ liệu cũ (nâng cấp dữ liệu từ phiên bản ' + oldSchema + ' lên ' + SCHEMA_VERSION + ')',
        note: 'Dữ liệu trước thời điểm này không có lịch sử thay đổi. Hiện có ' + dataSummary(out) + '. Bản sao lưu trước khi nâng cấp: ' + (bk || '(không có)') }]);
      return out;
    }
    const out = this.normalize(db);
    if (this.log.empty) this.log.append([{ action: 'khoi-tao', kind: 'data', label: 'Bắt đầu ghi nhật ký thay đổi', note: 'Dữ liệu lúc bắt đầu: ' + dataSummary(out) }]);
    return out;
  }

  // File dữ liệu không đọc được (ghi dở do mất điện, ổ đĩa lỗi...). Thử bản sao lưu gần nhất còn đọc được;
  // file hỏng được giữ lại (đổi tên) chứ không bao giờ bị xóa hay ghi đè.
  recover(cause) {
    const name = 'ketoan.json';
    for (const b of this.listBackups()) {
      let data;
      try { data = this.readBackup(b.name); } catch (e) { continue; }
      if (!data || !Array.isArray(data.entries) || !Array.isArray(data.projects) || !Array.isArray(data.suppliers)) continue;
      const kept = name + '.hong-' + stamp();
      fs.renameSync(this.file, path.join(this.dir, kept));
      console.warn('');
      console.warn('  CẢNH BÁO: file dữ liệu ' + name + ' bị hỏng (' + cause.message + ').');
      console.warn('  Đã khôi phục từ bản sao lưu ' + b.name + ' (giờ ' + b.time + ').');
      console.warn('  File hỏng được giữ lại là ' + kept + ' trong thư mục dữ liệu.');
      console.warn('');
      this.recoveredFrom = b.name;
      return data;
    }
    throw new Error('File dữ liệu ' + this.file + ' bị hỏng (' + cause.message + ') và không có bản sao lưu nào đọc được trong ' + this.backupDir +
      '. Phần mềm không tự sửa hay xóa file này — hãy chép nó (cùng thư mục backups) để người hỗ trợ cứu dữ liệu.');
  }

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
    out.trash.forEach((t) => {
      maxId = Math.max(maxId, Number(t.id) || 0);
      t.records.concat(t.attachments || []).forEach((r) => { maxId = Math.max(maxId, Number(r && r.id) || 0, Number(r && r.phieuId) || 0); });
    });
    out.trash.forEach((t) => { if (typeof t.id !== 'number' || !t.id) t.id = ++maxId; });
    ID_LISTS.forEach((k) => out[k].forEach((x) => { if (!x.id) x.id = ++maxId; }));
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

  writeFile(db) {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1), 'utf8');
    try {
      fs.renameSync(tmp, this.file);
    } catch (e) {
      // Windows đôi khi khóa file (phần mềm diệt virus, OneDrive...) -> ghi đè trực tiếp
      fs.copyFileSync(tmp, this.file);
      fs.unlinkSync(tmp);
    }
  }

  save() {
    this.db.updatedAt = new Date().toISOString();
    if (Date.now() - this.lastBackupAt > AUTO_BACKUP_INTERVAL_MS) this.backup('tu-dong');
    this.writeFile(this.db);
    this.flushAudit();
  }

  backup(reason) {
    if (!fs.existsSync(this.file)) return null;
    const name = 'ketoan-' + stamp() + (reason ? '-' + reason : '') + '.json';
    fs.copyFileSync(this.file, path.join(this.backupDir, name));
    this.lastBackupAt = Date.now();
    this.pruneBackups();
    return name;
  }

  pruneBackups() {
    const files = this.listBackups();
    files.slice(MAX_BACKUPS).forEach((f) => {
      try { fs.unlinkSync(path.join(this.backupDir, f.name)); } catch (e) { /* bỏ qua */ }
    });
  }

  listBackups() {
    if (!fs.existsSync(this.backupDir)) return [];
    return fs.readdirSync(this.backupDir)
      .filter((f) => /^ketoan-.*\.json$/.test(f))
      .map((f) => {
        const st = fs.statSync(path.join(this.backupDir, f));
        return { name: f, size: st.size, time: st.mtime.toISOString() };
      })
      .sort((a, b) => (a.time < b.time ? 1 : -1));
  }

  readBackup(name) {
    if (!/^ketoan-[\w.-]+\.json$/.test(name)) throw new Error('Tên bản sao lưu không hợp lệ');
    const raw = fs.readFileSync(path.join(this.backupDir, name), 'utf8').replace(/^﻿/, '');
    return JSON.parse(raw);
  }

  replaceAll(db, reason) {
    const name = this.backup(reason || 'truoc-thay-the');
    this.db = this.normalize(db);
    this.writeFile(this.db);
    this.flushAudit();
    return name;
  }
}

module.exports = { Store, emptyDb, defaultSettings, dataSummary, SCHEMA_VERSION, DEFAULT_COST_GROUPS, DEFAULT_COST_ITEMS };
