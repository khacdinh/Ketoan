/* Phiếu thu / chi: danh sách phiếu, xem trước 2 liên, in, xuất Excel. */
import { $, $$, esc, money, fdate, icon, download, api, toast, showError, freshRoot, debounce, dateField, highlight } from '../ui.js';
import { S, vouchers, saveFilter } from '../state.js';
import { voucherHtml, printVoucher } from '../print.js';
import { openEntryForm } from '../forms.js';

const KT = window.KT;

export function renderVouchers(root) {
  root = freshRoot(root);
  const f = S.filters.phieu;
  const all = vouchers();
  if (!S.selectedVoucher || !all.some((v) => v.key === S.selectedVoucher)) S.selectedVoucher = all.length ? all[0].key : null;

  root.innerHTML =
    '<div class="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">' +
    '<aside class="sheet no-print flex flex-col overflow-hidden lg:sticky lg:top-[104px] lg:max-h-[calc(100vh-128px)] max-lg:max-h-[340px]">' +
    '<div class="flex flex-col gap-2.5 border-b border-rule p-3">' +
    '<label class="search">' + icon('search') + '<input id="ph-q" type="search" class="input" placeholder="Tìm số phiếu, người nhận, nội dung" value="' + esc(f.q) + '" aria-label="Tìm phiếu"></label>' +
    '<div class="seg seg-sm self-start" role="radiogroup" aria-label="Loại phiếu">' +
    [['', 'Tất cả'], ['chi', 'Phiếu chi'], ['thu', 'Phiếu thu']].map(([v, l]) => '<label class="seg-item"><input type="radio" name="ph-loai" value="' + v + '"' + ((f.loai || '') === v ? ' checked' : '') + '><span>' + l + '</span></label>').join('') +
    '</div></div>' +
    '<div class="flex-1 overflow-y-auto p-1.5" id="ph-list" aria-label="Danh sách phiếu"></div>' +
    '</aside>' +
    '<section class="flex min-w-0 flex-col gap-4 @container" id="ph-detail"></section>' +
    '</div>';

  const drawList = () => {
    const q = KT.normalizeText(f.q).trim();
    const list = all.filter((v) => {
      if (f.loai && v.loai !== f.loai) return false;
      if (!q) return true;
      return KT.normalizeText([v.soPhieu, v.nguoiNhan, v.lyDo, KT.fmtMoney(v.soTien), v.duAn.join(' ')].join(' ')).includes(q);
    });
    $('#ph-list', root).innerHTML = list.length ? list.map((v) =>
      '<button type="button" class="v-item' + (v.key === S.selectedVoucher ? ' active' : '') + '" data-key="' + esc(v.key) + '"' + (v.key === S.selectedVoucher ? ' aria-current="true"' : '') + '>' +
      '<div class="flex items-baseline justify-between gap-2"><span class="font-semibold">' + highlight(v.soPhieu, f.q) + '</span>' +
      '<span class="font-semibold tabular-nums">' + money(v.soTien) + '</span></div>' +
      '<div class="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-2"><span class="tabular-nums">' + fdate(v.ngay) + '</span><span>' + highlight(v.nguoiNhan || 'Chưa có người nhận', f.q) + '</span>' +
      (v.soDong > 1 ? '<span class="pill">' + v.soDong + ' dòng</span>' : '') +
      (v.nhieuNgay ? '<span class="chip chip-near py-0 text-[11.5px]" title="Các dòng của phiếu này khác ngày nhau">' + icon('warnTri') + 'khác ngày</span>' : '') + '</div>' +
      '<div class="mt-0.5 truncate text-[12.5px] text-ink-3">' + highlight(v.lyDo, f.q) + '</div></button>').join('')
      : '<p class="p-4 text-[13.5px] text-ink-3">' + (all.length ? 'Không có phiếu phù hợp.' : 'Chưa có phiếu nào. Khi ghi sổ, nhập “Số phiếu” (ví dụ PC001/09) để tạo phiếu.') + '</p>';
  };

  const drawDetail = () => {
    const v = all.find((x) => x.key === S.selectedVoucher);
    const d = $('#ph-detail', root);
    if (!v) {
      d.innerHTML = '<div class="sheet p-10 text-center text-ink-3">Chọn một phiếu ở danh sách bên trái để xem và in.</div>';
      return;
    }
    const s = S.db.settings;
    const ov = v.override || {};
    d.innerHTML =
      '<div class="flex flex-wrap items-end justify-between gap-3">' +
      '<div><h2 class="text-[20px] font-semibold font-stretch-[108%]">' + (v.loai === 'thu' ? 'Phiếu thu ' : 'Phiếu chi ') + esc(v.soPhieu) + '</h2>' +
      '<p class="mt-0.5 text-[13.5px] text-ink-2">Gộp ' + v.soDong + ' dòng trong sổ, tổng <b class="font-semibold tabular-nums text-ink">' + money(v.soTien) + ' đ</b>' +
      (v.nhieuNgay ? '. <span class="font-medium text-caution">Các dòng có ngày khác nhau.</span>' : '') + '</p></div>' +
      '<div class="no-print flex gap-2">' +
      '<button type="button" class="btn btn-secondary" data-act="excel">' + icon('excel') + 'Xuất Excel</button>' +
      '<button type="button" class="btn btn-primary" data-act="print">' + icon('print') + 'In phiếu 2 liên</button>' +
      '</div></div>' +
      '<div class="grid grid-cols-[minmax(0,1fr)] items-start gap-4 @3xl:grid-cols-[minmax(0,1fr)_300px]">' +
      '<div class="paper-wrap"><div class="paper" id="ph-paper">' + voucherHtml(v, s) + '</div></div>' +
      '<div class="no-print flex flex-col gap-4">' +
      '<form id="ph-form" class="sheet flex flex-col gap-3 p-4" autocomplete="off">' +
      '<div><h3 class="sheet-title">Nội dung in trên phiếu</h3><p class="sheet-note">Để trống thì lấy từ sổ và danh mục nhà cung cấp.</p></div>' +
      '<label class="field"><span class="label">Ngày in trên phiếu</span>' + dateField({ name: 'ngay', value: ov.ngay || '', label: 'Ngày in trên phiếu' }) +
      '<span class="hint">' + (v.ngayGoc ? 'Theo sổ: ' + fdate(v.ngayGoc) : '') + '</span></label>' +
      fld('nguoiNhan', v.loai === 'thu' ? 'Người nộp tiền' : 'Người nhận tiền', ov.nguoiNhan || '', v.nguoiNhanTuDong) +
      fld('diaChi', 'Địa chỉ', ov.diaChi || '', v.diaChiTuDong || 'Thêm địa chỉ trong danh mục để tự điền') +
      '<label class="field"><span class="label">' + (v.loai === 'thu' ? 'Lý do nộp' : 'Lý do chi') + '</span><textarea name="lyDo" class="input" rows="3" placeholder="' + esc(v.lyDoTuDong) + '">' + esc(ov.lyDo || '') + '</textarea></label>' +
      '<div class="grid grid-cols-2 gap-3">' +
      '<label class="field"><span class="label">Hình thức</span><select name="hinhThuc" class="input">' +
      ['Tiền mặt', 'Chuyển khoản'].concat(['Tiền mặt', 'Chuyển khoản'].includes(v.hinhThuc) ? [] : [v.hinhThuc]).map((h) => '<option' + (h === v.hinhThuc ? ' selected' : '') + '>' + esc(h) + '</option>').join('') +
      '</select></label>' +
      fld('kemTheo', 'Số chứng từ kèm', ov.kemTheo || '', 'để trống') +
      '</div>' +
      '<div class="flex items-center gap-2 pt-1"><button type="button" class="btn btn-ghost btn-sm" data-act="reset">' + icon('refresh') + 'Về tự động</button><span class="flex-1"></span>' +
      '<button type="submit" class="btn btn-secondary btn-sm">' + icon('save') + 'Lưu cho phiếu này</button></div>' +
      '</form>' +
      '<section class="sheet overflow-hidden"><div class="px-4 pt-3.5 pb-2"><h3 class="sheet-title">Các dòng trong sổ</h3></div>' +
      '<ul class="divide-y divide-rule border-t border-rule">' + v.lines.map((r) =>
        '<li class="flex items-start justify-between gap-2 px-4 py-2.5" data-id="' + r.id + '"><div class="min-w-0"><div class="text-[13.5px]">' + esc(r.noiDung) + '</div>' +
        '<div class="text-[12px] text-ink-3">' + esc([fdate(r.ngay), r.maDuAn, r.tenNCC].filter(Boolean).join(', ')) + '</div></div>' +
        '<div class="flex flex-none items-center gap-0.5"><span class="font-semibold tabular-nums">' + money(v.loai === 'thu' ? r.thu : r.chi) + '</span>' +
        '<button type="button" class="icon-btn" data-act="edit-line" title="Sửa dòng" aria-label="Sửa dòng">' + icon('edit') + '</button></div></li>').join('') +
      '</ul></section>' +
      '</div></div>';

    const form = $('#ph-form', d);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {};
      ['ngay', 'nguoiNhan', 'diaChi', 'lyDo', 'hinhThuc', 'kemTheo'].forEach((k) => { data[k] = form.elements[k].value.trim(); });
      if (data.hinhThuc === (s.hinhThucMacDinh || 'Tiền mặt')) delete data.hinhThuc;
      try {
        await api('PUT', '/api/vouchers/' + encodeURIComponent(v.key), data);
        toast('Đã lưu nội dung in cho phiếu ' + v.soPhieu);
      } catch (err) { showError(err); }
    });
    // Xem trước ngay khi gõ (chưa lưu)
    form.addEventListener('input', debounce(() => {
      const preview = Object.assign({}, v);
      const val = (k) => form.elements[k].value.trim();
      preview.ngay = val('ngay') || v.ngayGoc;
      preview.nguoiNhan = val('nguoiNhan') || v.nguoiNhanTuDong;
      preview.diaChi = val('diaChi') || v.diaChiTuDong;
      preview.lyDo = val('lyDo') || v.lyDoTuDong;
      preview.hinhThuc = val('hinhThuc');
      preview.kemTheo = val('kemTheo');
      $('#ph-paper', d).innerHTML = voucherHtml(preview, s);
      d._preview = preview;
    }, 120));
    form.addEventListener('change', () => form.dispatchEvent(new Event('input')));
    fitPaper($('.paper-wrap', d));
  };

  root.addEventListener('click', async (e) => {
    const item = e.target.closest('.v-item');
    if (item) {
      S.selectedVoucher = item.dataset.key;
      $$('.v-item', root).forEach((x) => { x.classList.toggle('active', x === item); if (x === item) x.setAttribute('aria-current', 'true'); else x.removeAttribute('aria-current'); });
      drawDetail();
      return;
    }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const v = all.find((x) => x.key === S.selectedVoucher);
    if (!v) return;
    const d = $('#ph-detail', root);
    if (a.dataset.act === 'print') printVoucher(d._preview || v, S.db.settings);
    else if (a.dataset.act === 'excel') download('/api/export/voucher?so=' + encodeURIComponent(v.soPhieu));
    else if (a.dataset.act === 'reset') {
      try {
        await api('PUT', '/api/vouchers/' + encodeURIComponent(v.key), {});
        toast('Đã trả về nội dung tự động');
      } catch (err) { showError(err); }
    } else if (a.dataset.act === 'edit-line') {
      const id = Number(a.closest('li').dataset.id);
      const entry = S.db.entries.find((x) => x.id === id);
      if (entry) openEntryForm(entry);
    }
  });

  $('#ph-q', root).addEventListener('input', debounce((e) => { f.q = e.target.value; saveFilter('phieu'); drawList(); }, 120));
  root.querySelectorAll('input[name=ph-loai]').forEach((r) => r.addEventListener('change', () => { f.loai = r.value; saveFilter('phieu'); drawList(); }));

  drawList();
  drawDetail();
  const act = $('.v-item.active', root);
  if (act) act.scrollIntoView({ block: 'nearest' });
}

function fld(name, label, value, placeholder) {
  return '<label class="field"><span class="label">' + esc(label) + '</span><input name="' + name + '" class="input" value="' + esc(value) + '"' +
    (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + '></label>';
}

// Thu phóng tờ A4 xem trước cho vừa khung
let paperObserver = null;
function fitPaper(wrap) {
  if (!wrap) return;
  const paper = wrap.querySelector('.paper');
  const apply = () => {
    const natural = 794; // 210mm
    const avail = wrap.clientWidth - 32;
    paper.style.zoom = String(Math.max(0.3, Math.min(1, avail / natural)));
  };
  if (paperObserver) paperObserver.disconnect();
  paperObserver = new ResizeObserver(apply);
  paperObserver.observe(wrap);
  apply();
}
