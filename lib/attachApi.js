'use strict';
/*
 * Đính kèm chứng từ (ảnh hóa đơn, phiếu giao hàng, PDF) vào dòng sổ thu chi, dòng chi phí hoặc cả phiếu nhập.
 * - File lưu ở data/attachments/<yyyy-mm>/<id>-<8 ký tự hex>.<đuôi>: tên do phần mềm đặt (không dùng tên người gửi lên
 *   để ghép đường dẫn → không path traversal), mở bằng cờ 'wx' (không bao giờ ghi đè).
 * - Kiểu file xác định bằng nội dung (chữ ký đầu file), không tin đuôi file / Content-Type: JPG, PNG, WEBP, PDF; tối đa 10 MB.
 * - db.attachments: [{ id, owner: 'entries' | 'costs' | 'slips', ownerId, name, file, size, type, sha256, createdAt, by }]
 * - Xóa = vào thùng rác (file giữ nguyên). Xóa bản ghi chủ thì chứng từ đi theo vào thùng rác (xem traceApi).
 *   Xóa vĩnh viễn: file chuyển sang data/attachments/_da-xoa/ (vẫn còn cho các bản sao lưu cũ), không xóa hẳn.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const KT = require('../public/js/shared.js');

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf'
};
const OWNER_LABEL = { entries: 'dòng sổ thu chi', costs: 'dòng chi phí', slips: 'phiếu nhập' };
const SAFE_FILE = /^attachments\/\d{4}-\d{2}\/\d+-[0-9a-f]{8}\.(jpg|png|webp|pdf)$/;

function sniff(buf) {
  if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  if (buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'png';
  if (buf.length >= 12 && buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (buf.length >= 5 && buf.slice(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  return '';
}

module.exports = function createAttachApi(h) {
  const { store, HttpError, str, sendJson, ok, readBody, trace, send } = h;
  const root = () => path.join(store.dir, 'attachments');

  // Đường dẫn tuyệt đối của file chứng từ; không thấy ở chỗ cũ thì tìm trong _da-xoa (đã xóa vĩnh viễn nhưng bản sao lưu cũ còn tham chiếu)
  function fileOf(meta) {
    if (!SAFE_FILE.test(meta.file || '')) return null;
    const p = path.join(store.dir, meta.file);
    if (!p.startsWith(root() + path.sep)) return null;
    if (fs.existsSync(p)) return p;
    const q = path.join(root(), '_da-xoa', path.basename(meta.file));
    return fs.existsSync(q) ? q : null;
  }

  function ownerExists(owner, id) {
    const db = store.db;
    if (owner === 'entries') return db.entries.find((e) => e.id === id);
    if (owner === 'costs') return db.costs.find((c) => c.id === id);
    if (owner === 'slips') return db.costs.find((c) => c.phieuId === id);
    return null;
  }

  function cleanName(s) {
    // tên hiển thị: bỏ đường dẫn, ký tự điều khiển; chỉ để xem, không dùng làm tên file trên đĩa
    return str(String(s || '').split(/[\\/]/).pop().replace(/[\u0000-\u001f<>:"|?*]/g, ''), 150) || 'chung-tu';
  }

  async function handle(req, res, url) {
    const seg = url.pathname.split('/').filter(Boolean);
    const m = req.method;
    if (seg[1] !== 'attachments') return false;
    const db = store.db;

    // Tải lên: POST /api/attachments?owner=entries&id=123  (thân = nội dung file; tên file ở tiêu đề X-Ten-File)
    if (m === 'POST' && seg.length === 2) {
      const owner = url.searchParams.get('owner');
      const ownerId = Number(url.searchParams.get('id'));
      if (!OWNER_LABEL[owner] || !Number.isInteger(ownerId) || ownerId <= 0) throw new HttpError(400, 'Thiếu hoặc sai chỗ đính kèm');
      const rec = ownerExists(owner, ownerId);
      if (!rec) throw new HttpError(404, 'Không tìm thấy ' + OWNER_LABEL[owner] + ' để đính kèm (có thể đã bị xóa)');
      const buf = await readBody(req, MAX_BYTES);
      if (!buf.length) throw new HttpError(400, 'File rỗng');
      const ext = sniff(buf);
      if (!ext) throw new HttpError(415, 'Chỉ nhận ảnh JPG, PNG, WEBP hoặc file PDF (tối đa 10 MB)');
      let name = '';
      try { name = decodeURIComponent(String(req.headers['x-ten-file'] || '')); } catch (e) { name = ''; }
      name = cleanName(name);
      const id = store.newId();
      const month = new Date().toISOString().slice(0, 7);
      const rel = 'attachments/' + month + '/' + id + '-' + crypto.randomBytes(4).toString('hex') + '.' + ext;
      const abs = path.join(store.dir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, buf, { flag: 'wx' }); // 'wx': báo lỗi nếu đã có file cùng tên, không ghi đè
      const meta = { id, owner, ownerId, name, file: rel, size: buf.length, type: TYPES[ext], sha256: crypto.createHash('sha256').update(buf).digest('hex'),
        createdAt: new Date().toISOString(), by: trace.who(req) };
      db.attachments.push(meta);
      trace.log(req, 'dinh-kem', 'attachments', meta, null, meta, { label: 'Đính kèm "' + name + '" (' + Math.ceil(buf.length / 1024) + ' KB) vào ' + OWNER_LABEL[owner] + ' số ' + ownerId });
      store.save();
      ok(res, { id, attachment: meta });
      return true;
    }

    if (seg.length === 3 && /^\d+$/.test(seg[2])) {
      const meta = db.attachments.find((a) => a.id === Number(seg[2]));
      if (!meta) throw new HttpError(404, 'Không tìm thấy chứng từ (có thể đã bị xóa)');
      if (m === 'GET') {
        const p = fileOf(meta);
        if (!p) throw new HttpError(404, 'Không tìm thấy file chứng từ trên đĩa (thư mục data/attachments)');
        const buf = fs.readFileSync(p);
        const inline = url.searchParams.get('tai') !== '1';
        const ascii = meta.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w.-]+/g, '_');
        send(res, 200, buf, {
          'Content-Type': meta.type,
          'Content-Length': buf.length,
          'Content-Disposition': (inline ? 'inline' : 'attachment') + '; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(meta.name),
          // ảnh: không cho chạy gì; PDF: trình xem PDF có sẵn của trình duyệt cần được hiện
          'Content-Security-Policy': meta.type === 'application/pdf' ? "default-src 'none'; object-src 'self'; frame-ancestors 'self'" : "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
          'X-Frame-Options': 'SAMEORIGIN'
        });
        return true;
      }
      if (m === 'DELETE') {
        const rec = ownerExists(meta.owner, meta.ownerId);
        if (rec && rec.ngay) trace.assertOpen([rec.ngay], 'xóa chứng từ');
        db.attachments = db.attachments.filter((a) => a !== meta);
        trace.toTrash(req, 'attachments', [meta], 'Chứng từ "' + meta.name + '" của ' + OWNER_LABEL[meta.owner] + ' số ' + meta.ownerId);
        store.save();
        ok(res);
        return true;
      }
    }
    return false;
  }

  // Chuyển file của các chứng từ bị xóa vĩnh viễn sang _da-xoa (không xóa hẳn: bản sao lưu cũ vẫn mở được)
  function retire(metas) {
    metas.forEach((meta) => {
      if (!SAFE_FILE.test(meta.file || '')) return;
      const p = path.join(store.dir, meta.file);
      if (!fs.existsSync(p)) return;
      const dst = path.join(root(), '_da-xoa', path.basename(meta.file));
      try { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.renameSync(p, dst); } catch (e) { console.error('Không chuyển được file chứng từ:', e.message); }
    });
  }

  return { handle, fileOf, retire, sniff, SAFE_FILE, OWNER_LABEL };
};

module.exports.SAFE_FILE = SAFE_FILE;
module.exports.sniff = sniff;
