/* Chứng từ đính kèm (ảnh hóa đơn, phiếu giao hàng, PDF) cho dòng sổ thu chi, dòng chi phí, phiếu nhập. */
import { esc, icon, api, toast, showError, confirmDialog, openModal } from './ui.js';
import { S } from './state.js';

const KT = window.KT;
const MAX = 10 * 1024 * 1024;
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

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
    (opts.readonly ? '' : '<label class="btn btn-secondary btn-sm cursor-pointer">' + icon('paperclip') + 'Đính kèm ảnh / PDF<input type="file" class="sr-only" accept="image/jpeg,image/png,image/webp,application/pdf" multiple data-att-input></label>') +
    '</div><ul class="att-list" aria-live="polite"></ul>' +
    '<p class="text-[12px] text-ink-3">Ảnh JPG, PNG, WEBP hoặc PDF, tối đa 10 MB mỗi file. File lưu trong thư mục data/attachments và có trong bản sao lưu đầy đủ.</p></div>';
}

function drawList(box) {
  const list = attachmentsOf(box.dataset.attOwner, box.dataset.attId);
  const ro = box.dataset.attRo === '1';
  box.querySelector('.att-list').innerHTML = list.length ? list.map((a) =>
    '<li class="att-item" data-att="' + a.id + '">' +
    (a.type === 'application/pdf' ? '<span class="att-thumb att-pdf">PDF</span>' : '<img class="att-thumb" src="/api/attachments/' + a.id + '" alt="" loading="lazy">') +
    '<button type="button" class="att-name" data-att-act="view" title="Xem">' + esc(a.name) + '<span class="block text-[11.5px] font-normal text-ink-3">' + sizeTxt(a.size) + ' · ' + esc(KT.fmtDate(String(a.createdAt).slice(0, 10))) + '</span></button>' +
    '<a class="icon-btn" href="/api/attachments/' + a.id + '?tai=1" title="Tải về" aria-label="Tải về ' + esc(a.name) + '">' + icon('download') + '</a>' +
    (ro ? '' : '<button type="button" class="icon-btn danger" data-att-act="del" title="Xóa chứng từ" aria-label="Xóa ' + esc(a.name) + '">' + icon('trash') + '</button>') + '</li>').join('')
    : '<li class="text-[12.5px] text-ink-3">Chưa có chứng từ nào.</li>';
}

export function viewAttachment(a) {
  if (a.type === 'application/pdf') { window.open('/api/attachments/' + a.id, '_blank', 'noopener'); return; }
  openModal({ title: a.name, size: 'wide', body: '<img src="/api/attachments/' + a.id + '" alt="' + esc(a.name) + '" class="mx-auto max-h-[75vh] w-auto rounded border border-rule">',
    footer: '<span class="flex-1"></span><a class="btn btn-secondary" href="/api/attachments/' + a.id + '?tai=1">' + icon('download') + 'Tải về</a>' });
}

export function bindAttach(root) {
  root.querySelectorAll('[data-att-owner]').forEach((box) => {
    if (box.dataset.attBound) return;
    box.dataset.attBound = '1';
    drawList(box);
    const input = box.querySelector('[data-att-input]');
    if (input) input.addEventListener('change', async () => {
      const files = Array.from(input.files || []);
      input.value = '';
      for (const f of files) {
        if (f.size > MAX) { toast('"' + f.name + '" lớn hơn 10 MB, không đính kèm được', 'error'); continue; }
        if (f.type && !OK_TYPES.includes(f.type)) { toast('"' + f.name + '": chỉ nhận ảnh JPG, PNG, WEBP hoặc PDF', 'error'); continue; }
        try {
          await api('POST', '/api/attachments?owner=' + box.dataset.attOwner + '&id=' + box.dataset.attId, await f.arrayBuffer(), true, { 'X-Ten-File': encodeURIComponent(f.name) });
          toast('Đã đính kèm ' + f.name);
        } catch (err) { showError(err); }
        drawList(box);
      }
    });
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

// Xem nhanh danh sách chứng từ của một dòng (bấm kẹp giấy trong sổ)
export function openAttachList(owner, ownerId, title) {
  const m = openModal({ title: title || 'Chứng từ đính kèm', body: attachBlock(owner, ownerId, { readonly: true }) });
  bindAttach(m.el);
}

