'use strict';
/*
 * Nhật ký thay đổi (audit log).
 * - Lưu riêng ở data/nhat-ky.jsonl, mỗi dòng một mục JSON, CHỈ GHI NỐI THÊM (không sửa, không xóa mục cũ).
 *   Để riêng khỏi ketoan.json vì: (1) ghi nối thêm nhanh, không phải ghi lại cả file dữ liệu lớn;
 *   (2) khôi phục bản sao lưu cũ không xóa mất lịch sử những gì đã xảy ra.
 * - Mục nhật ký: { id, at, by, action, kind, recId, label, before, after, note }
 *   action: them | sua | xoa (xóa mềm → thùng rác) | khoi-phuc (từ thùng rác) | xoa-vinh-vien | ghi-so | khoa-so | mo-khoa
 *           | bo-qua-canh-bao | kiem-quy | dinh-kem | nhap-excel | khoi-phuc-sao-luu | xoa-toan-bo | cai-dat | khoi-tao
 */
const fs = require('fs');
const path = require('path');

const ACTION_LABEL = {
  'them': 'Thêm',
  'sua': 'Sửa',
  'xoa': 'Xóa (vào thùng rác)',
  'khoi-phuc': 'Khôi phục từ thùng rác',
  'xoa-vinh-vien': 'Xóa vĩnh viễn',
  'ghi-so': 'Ghi sổ (từ nháp)',
  'khoa-so': 'Khóa sổ',
  'mo-khoa': 'Mở khóa sổ',
  'bo-qua-canh-bao': 'Bỏ qua cảnh báo',
  'kiem-quy': 'Kiểm quỹ',
  'dinh-kem': 'Đính kèm chứng từ',
  'nhap-excel': 'Nhập Excel',
  'khoi-phuc-sao-luu': 'Khôi phục bản sao lưu',
  'xoa-toan-bo': 'Xóa toàn bộ dữ liệu',
  'cai-dat': 'Cài đặt',
  'khoi-tao': 'Khởi tạo'
};

const KIND_LABEL = {
  entries: 'Sổ thu chi',
  costs: 'Chi phí công trình',
  slips: 'Phiếu nhập chi phí',
  projects: 'Dự án',
  suppliers: 'Nhà cung cấp',
  costGroups: 'Nhóm chi phí',
  costItems: 'Hạng mục',
  materials: 'Vật tư',
  houses: 'Nhà / khu',
  vouchers: 'Thông tin in phiếu',
  settings: 'Cài đặt',
  locks: 'Khóa sổ',
  warnings: 'Cảnh báo',
  cashCounts: 'Kiểm quỹ',
  attachments: 'Chứng từ đính kèm',
  trash: 'Thùng rác',
  data: 'Toàn bộ dữ liệu'
};

class AuditLog {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'nhat-ky.jsonl');
    this.items = [];
    this.nextId = 1;
    this.bad = 0;
    if (fs.existsSync(this.file)) {
      fs.readFileSync(this.file, 'utf8').split('\n').forEach((line) => {
        if (!line.trim()) return;
        try {
          const x = JSON.parse(line);
          if (x && typeof x === 'object') { this.items.push(x); this.nextId = Math.max(this.nextId, (Number(x.id) || 0) + 1); }
        } catch (e) { this.bad++; } // dòng ghi dở (mất điện giữa chừng): bỏ qua, không làm hỏng các dòng khác
      });
    }
  }

  get empty() { return this.items.length === 0; }

  // Ghi thêm các mục (đã có đủ trường), trả về các mục đã ghi
  append(list) {
    if (!list.length) return [];
    const at = new Date().toISOString();
    const out = list.map((e) => Object.assign({ id: this.nextId++, at }, e, { by: e.by || '' }));
    const text = out.map((e) => JSON.stringify(e)).join('\n') + '\n';
    // file có dòng cuối chưa xuống dòng (ghi dở) thì bắt đầu dòng mới để không dính vào dòng hỏng
    let prefix = '';
    try {
      const st = fs.statSync(this.file);
      if (st.size) {
        const fd = fs.openSync(this.file, 'r');
        const b = Buffer.alloc(1);
        fs.readSync(fd, b, 0, 1, st.size - 1);
        fs.closeSync(fd);
        if (b[0] !== 10) prefix = '\n';
      }
    } catch (e) { /* chưa có file */ }
    fs.appendFileSync(this.file, prefix + text, 'utf8');
    this.items.push.apply(this.items, out);
    return out;
  }

  // Lọc: from/to (yyyy-mm-dd theo giờ máy), action, kind, recId, q (không dấu, không phân biệt hoa thường)
  query(f, normalizeText) {
    f = f || {};
    const q = f.q ? normalizeText(f.q).trim() : '';
    const rec = f.recId != null && f.recId !== '' ? String(f.recId) : '';
    const localDay = (iso) => {
      const d = new Date(iso);
      const p = (n) => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    };
    const res = [];
    for (let i = this.items.length - 1; i >= 0; i--) {
      const e = this.items[i];
      if (f.action && e.action !== f.action) continue;
      if (f.kind && e.kind !== f.kind) continue;
      if (rec && String(e.recId) !== rec && !(Array.isArray(e.ids) && e.ids.map(String).includes(rec))) continue;
      if (f.from || f.to) {
        const d = localDay(e.at);
        if (f.from && d < f.from) continue;
        if (f.to && d > f.to) continue;
      }
      if (q) {
        const hay = normalizeText([e.label, e.note, e.by, e.recId, JSON.stringify(e.before || ''), JSON.stringify(e.after || '')].join(' '));
        if (hay.indexOf(q) < 0) continue;
      }
      res.push(e);
    }
    const offset = Math.max(0, Number(f.offset) || 0);
    const limit = Math.min(1000, Math.max(1, Number(f.limit) || 200));
    return { total: res.length, items: res.slice(offset, offset + limit) };
  }
}

module.exports = { AuditLog, ACTION_LABEL, KIND_LABEL };
