/* Chứng từ đính kèm (ảnh hóa đơn, phiếu giao hàng, PDF, Word, Excel) cho dòng sổ thu chi, dòng chi phí, phiếu nhập. */
import { esc, icon, api, toast, showError, confirmDialog, openModal, dangCheDangNhap } from './ui.js';
import { S } from './state.js';

const KT = window.KT;
const MAX = 10 * 1024 * 1024;
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/msword', 'application/vnd.ms-excel'];
const OK_EXT = /\.(jpe?g|png|webp|pdf|docx?|xlsx?)$/i;
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx';
const LOAI_HIEN = 'Ảnh JPG, PNG, WEBP, PDF, Word hoặc Excel, tối đa 10 MB mỗi file';
const DAN_HIEN = '<b class="font-medium text-ink-2">Dán ảnh</b> vừa chụp / sao chép bằng <kbd>Ctrl</kbd> + <kbd>V</kbd> (không cần lưu ra file), hoặc kéo thả file vào khung này.';
const NHAN = { 'application/pdf': 'PDF', 'application/msword': 'DOC', 'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOC', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLS' };
const laAnh = (type) => /^image\//.test(type || '');
// Kiểm tra trước khi gửi (máy chủ vẫn kiểm lại bằng nội dung file)
function loiFile(f) {
  if (f.size > MAX) return '"' + f.name + '" lớn hơn 10 MB, không đính kèm được';
  if (!OK_TYPES.includes(f.type) && !OK_EXT.test(f.name)) return '"' + f.name + '": chỉ nhận ảnh, PDF, Word hoặc Excel';
  return '';
}
// Tải các file lên làm chứng từ của một chỗ (owner, ownerId); trả về số file đã đính kèm
export async function uploadFiles(owner, ownerId, files) {
  let n = 0;
  for (const f of files) {
    const loi = loiFile(f);
    if (loi) { toast(loi, 'error'); continue; }
    try {
      await api('POST', '/api/attachments?owner=' + owner + '&id=' + ownerId, await f.arrayBuffer(), true, { 'X-Ten-File': encodeURIComponent(f.name) });
      n++;
    } catch (err) { showError(err); }
  }
  return n;
}

export function attachmentsOf(owner, ownerId) {
  return (S.all.attachments || []).filter((a) => a.owner === owner && a.ownerId === Number(ownerId));
}

// Số chứng từ của một dòng (hiện kẹp giấy trong sổ)
export function attachCount(owner, ownerId) {
  if (!S.all || !S.all.attachments || !S.all.attachments.length) return 0;
  return attachmentsOf(owner, ownerId).length;
}

export function clipHtml(owner, ownerId) {
  const n = attachCount(owner, ownerId);
  return n ? ' <button type="button" class="clip no-print" data-act="clip" data-owner="' + owner + '" data-oid="' + ownerId + '" title="' + n + ' chứng từ đính kèm — bấm để xem" aria-label="' + n + ' chứng từ đính kèm">' + icon('paperclip') + n + '</button>' : '';
}

function sizeTxt(n) { return n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }

// Khối "Chứng từ đính kèm": trả về HTML; gọi bindAttach(el) sau khi gắn vào trang
export function attachBlock(owner, ownerId, opts) {
  opts = opts || {};
  if (!ownerId) return '<div class="att-box"><span class="label">Chứng từ đính kèm</span><p class="text-[12.5px] text-ink-3">' + icon('paperclip', 'mr-1 align-[-2px]') + (opts.newText || 'Lưu trước rồi mới đính kèm ảnh hóa đơn, phiếu giao hàng được.') + '</p></div>';
  return '<div class="att-box" data-att-owner="' + owner + '" data-att-id="' + ownerId + '"' + (opts.readonly ? ' data-att-ro="1"' : '') + '>' +
    '<div class="flex flex-wrap items-center gap-2"><span class="label">Chứng từ đính kèm</span><span class="flex-1"></span>' +
    (opts.readonly ? '' : '<label class="btn btn-secondary btn-sm cursor-pointer">' + icon('paperclip') + 'Đính kèm ảnh / tài liệu<input type="file" class="sr-only" accept="' + ACCEPT + '" multiple data-att-input></label>') +
    '</div><ul class="att-list" aria-live="polite"></ul>' +
    (opts.readonly ? '' : '<p class="text-[12px] text-ink-3">' + DAN_HIEN + '</p>') +
    '<p class="text-[12px] text-ink-3">' + LOAI_HIEN + '. File lưu trong thư mục data/attachments và có trong bản sao lưu đầy đủ.</p></div>';
}

/* ---------- Phiếu chưa lưu: chọn file trước, tự tải lên ngay sau khi lưu phiếu ---------- */
const choLuu = new Map(); // khóa → [File] (giữ trong bộ nhớ trang; tải lại trang thì mất)
export function pendingFiles(key) { return choLuu.get(key) || []; }
export function clearPending(key) { choLuu.delete(key); }
export function pendingBlock(key, khiLuu) {
  return '<div class="att-box" data-att-pending="' + esc(key) + '">' +
    '<div class="flex flex-wrap items-center gap-2"><span class="label">Chứng từ đính kèm</span><span class="flex-1"></span>' +
    '<label class="btn btn-secondary btn-sm cursor-pointer">' + icon('paperclip') + 'Đính kèm ảnh / tài liệu<input type="file" class="sr-only" accept="' + ACCEPT + '" multiple data-att-pending-input></label></div>' +
    '<ul class="att-list" aria-live="polite"></ul>' +
    '<p class="text-[12px] text-ink-3">' + DAN_HIEN + '</p>' +
    '<p class="text-[12px] text-ink-3">' + LOAI_HIEN + '. File được tải lên ngay khi bấm ' + esc(khiLuu || 'Ghi phiếu (hoặc Lưu nháp)') + '. Chưa lưu mà tải lại trang thì phải chọn lại file.</p></div>';
}
function drawPending(box) {
  const key = box.dataset.attPending;
  const list = pendingFiles(key);
  (box._anhTam || []).forEach((u) => URL.revokeObjectURL(u)); // ảnh xem trước của lần vẽ trước
  box._anhTam = [];
  const thumb = (f) => {
    if (!laAnh(f.type)) return '<span class="att-thumb att-pdf">' + esc((f.name.split('.').pop() || '').toUpperCase().slice(0, 4)) + '</span>';
    const u = URL.createObjectURL(f);
    box._anhTam.push(u);
    return '<img class="att-thumb" src="' + u + '" alt="">';
  };
  box.querySelector('.att-list').innerHTML = list.length ? list.map((f, i) =>
    '<li class="att-item">' + thumb(f) +
    '<span class="att-name">' + esc(f.name) + '<span class="block text-[11.5px] font-normal text-ink-3">' + sizeTxt(f.size) + ' · chờ lưu phiếu</span></span>' +
    '<button type="button" class="icon-btn danger" data-pending-del="' + i + '" title="Bỏ file này" aria-label="Bỏ ' + esc(f.name) + '">' + icon('x') + '</button></li>').join('')
    : '<li class="text-[12.5px] text-ink-3">Chưa chọn file nào.</li>';
}
export function bindPending(root) {
  root.querySelectorAll('[data-att-pending]').forEach((box) => {
    if (box.dataset.attBound) return;
    box.dataset.attBound = '1';
    const key = box.dataset.attPending;
    drawPending(box);
    const input = box.querySelector('[data-att-pending-input]');
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      input.value = '';
      nhanFile(box, files);
    });
    ganKeoTha(box);
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pending-del]');
      if (!b) return;
      const list = pendingFiles(key).slice();
      list.splice(Number(b.dataset.pendingDel), 1);
      choLuu.set(key, list);
      drawPending(box);
    });
  });
}

function drawList(box) {
  const list = attachmentsOf(box.dataset.attOwner, box.dataset.attId);
  const ro = box.dataset.attRo === '1';
  box.querySelector('.att-list').innerHTML = list.length ? list.map((a) =>
    '<li class="att-item" data-att="' + a.id + '">' +
    (laAnh(a.type) ? '<img class="att-thumb" src="/api/attachments/' + a.id + '" alt="" loading="lazy">' : '<span class="att-thumb att-pdf">' + esc(NHAN[a.type] || 'FILE') + '</span>') +
    '<button type="button" class="att-name" data-att-act="view" title="Xem">' + esc(a.name) + '<span class="block text-[11.5px] font-normal text-ink-3">' + sizeTxt(a.size) + ' · ' + esc(KT.fmtDate(String(a.createdAt).slice(0, 10))) + '</span></button>' +
    '<a class="icon-btn" href="/api/attachments/' + a.id + '?tai=1" title="Tải về" aria-label="Tải về ' + esc(a.name) + '">' + icon('download') + '</a>' +
    (ro ? '' : '<button type="button" class="icon-btn danger" data-att-act="del" title="Xóa chứng từ" aria-label="Xóa ' + esc(a.name) + '">' + icon('trash') + '</button>') + '</li>').join('')
    : '<li class="text-[12.5px] text-ink-3">Chưa có chứng từ nào.</li>';
}

export function viewAttachment(a) {
  if (a.type === 'application/pdf') { window.open('/api/attachments/' + a.id, '_blank', 'noopener'); return; }
  if (!laAnh(a.type)) { location.href = '/api/attachments/' + a.id + '?tai=1'; return; } // Word / Excel: tải về, mở bằng Word / Excel
  openModal({ title: a.name, size: 'wide', body: '<img src="/api/attachments/' + a.id + '" alt="' + esc(a.name) + '" class="mx-auto max-h-[75vh] w-auto rounded border border-rule">',
    footer: '<span class="flex-1"></span><a class="btn btn-secondary" href="/api/attachments/' + a.id + '?tai=1">' + icon('download') + 'Tải về</a>' });
}

export function bindAttach(root) {
  root.querySelectorAll('[data-att-owner]').forEach((box) => {
    if (box.dataset.attBound) return;
    box.dataset.attBound = '1';
    drawList(box);
    const input = box.querySelector('[data-att-input]');
    if (input) {
      input.addEventListener('change', async () => {
        const files = Array.from(input.files || []);
        input.value = '';
        nhanFile(box, files);
      });
      ganKeoTha(box);
    }
    box.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-att-act]');
      if (!b) return;
      const a = (S.all.attachments || []).find((x) => x.id === Number(b.closest('[data-att]').dataset.att));
      if (!a) return;
      if (b.dataset.attAct === 'view') viewAttachment(a);
      else if (b.dataset.attAct === 'del') {
        if (!(await confirmDialog({ trash: true, title: 'Xóa chứng từ', html: 'Xóa chứng từ <b class="text-ink">' + esc(a.name) + '</b>?', okText: 'Xóa chứng từ', danger: true }))) return;
        try { await api('DELETE', '/api/attachments/' + a.id); toast('Đã xóa chứng từ, chuyển vào Thùng rác'); } catch (err) { showError(err); }
        drawList(box);
      }
    });
  });
}

/* ---------- Nhận file vào một khung: chọn file, dán (Ctrl + V), kéo thả ---------- */
// Khung chờ (phiếu chưa lưu): giữ lại, tải lên khi lưu; khung của chứng từ đã lưu: tải lên ngay
async function nhanFile(box, files, cach) {
  const ok = files.filter((f) => { const loi = loiFile(f); if (loi) toast(loi, 'error'); return !loi; });
  if (!ok.length) return;
  if (box.dataset.attPending) {
    const key = box.dataset.attPending;
    choLuu.set(key, pendingFiles(key).concat(ok));
    drawPending(box);
    if (cach) toast('Đã ' + cach + ' ' + ok.length + ' file vào chứng từ, sẽ tải lên khi lưu');
    return;
  }
  const n = await uploadFiles(box.dataset.attOwner, box.dataset.attId, ok);
  if (n) toast('Đã đính kèm ' + n + ' file');
  if (box.isConnected) drawList(box);
}

function ganKeoTha(box) {
  const co = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  box.addEventListener('dragover', (e) => { if (!co(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; box.classList.add('is-drop'); });
  box.addEventListener('dragleave', (e) => { if (!box.contains(e.relatedTarget)) box.classList.remove('is-drop'); });
  box.addEventListener('drop', (e) => {
    if (!co(e)) return;
    e.preventDefault();
    box.classList.remove('is-drop');
    nhanFile(box, Array.from(e.dataTransfer.files || []), 'thả');
  });
}

// Ảnh dán từ bộ nhớ tạm thường tên "image.png": đặt tên theo thời điểm dán cho dễ nhận ra
const DUOI = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
function tenAnhDan(f, i, n) {
  if (!laAnh(f.type) || (f.name && !/^image\.\w+$/i.test(f.name))) return f;
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  const ten = 'anh-dan-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) +
    (n > 1 ? '-' + (i + 1) : '') + '.' + (DUOI[f.type] || 'png');
  return new File([f], ten, { type: f.type, lastModified: f.lastModified });
}

// Khung nhận ảnh dán: trong hộp thoại trên cùng (nếu đang mở) hoặc trong trang; ưu tiên khung chứa ô đang gõ, rồi khung vừa bấm vào
let khungVuaDung = null;
document.addEventListener('pointerdown', (e) => { const b = e.target.closest && e.target.closest('.att-box'); if (b) khungVuaDung = b; }, true);
function khungDan(target) {
  const modals = document.querySelectorAll('#modal-root .modal');
  const scope = modals.length ? modals[modals.length - 1] : document.getElementById('view');
  if (!scope) return null;
  const ds = Array.from(scope.querySelectorAll('[data-att-pending], [data-att-owner]:not([data-att-ro])')).filter((b) => b.querySelector('input[type=file]:not([disabled])'));
  if (!ds.length) return null;
  return ds.find((b) => target && b.contains(target)) || (ds.includes(khungVuaDung) ? khungVuaDung : null) || ds[0];
}

document.addEventListener('paste', (e) => {
  if (dangCheDangNhap() || !e.clipboardData) return;
  let files = Array.from(e.clipboardData.files || []);
  if (!files.length) files = Array.from(e.clipboardData.items || []).filter((it) => it.kind === 'file').map((it) => it.getAsFile()).filter(Boolean);
  if (!files.length) return;
  // đang gõ trong ô nhập mà bộ nhớ tạm có chữ (vd sao chép ô Excel: có cả chữ lẫn ảnh) → dán chữ như bình thường
  const t = e.target;
  const oGo = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  if (oGo && Array.from(e.clipboardData.types || []).includes('text/plain')) return;
  const box = khungDan(t);
  if (!box) return;
  e.preventDefault();
  nhanFile(box, files.map((f, i) => tenAnhDan(f, i, files.length)), 'dán');
  if (box.scrollIntoView) box.scrollIntoView({ block: 'nearest' });
});

// Xem nhanh danh sách chứng từ của một dòng (bấm kẹp giấy trong sổ)
export function openAttachList(owner, ownerId, title) {
  const m = openModal({ title: title || 'Chứng từ đính kèm', body: attachBlock(owner, ownerId, { readonly: true }) });
  bindAttach(m.el);
}

