/* Biểu mẫu: ghi thu/chi, dự án, nhà cung cấp. */
import { $, esc, api, openModal, toast, showError, bindMoneyInput, money, confirmDialog, icon, dateField, focusInput, fieldError, busy } from './ui.js';
import { S, datalists, resolveCode, projectByCode, supplierByCode } from './state.js';
import { openHistory } from './views/control.js';
import { attachBlock, bindAttach } from './attach.js';

const KT = window.KT;

/* ============================== GHI THU / CHI ============================== */

let lastUsed = { ngay: '', soPhieu: '', maDuAn: '', maNCC: '', loai: 'chi' };

export function openEntryForm(entry, opts) {
  opts = opts || {};
  const isEdit = !!(entry && entry.id && !opts.duplicate);
  // Dòng Nháp (hoặc dòng mới) được chọn giữa Lưu nháp và Ghi sổ; dòng đã ghi sổ chỉ Lưu thay đổi
  const isDraftRec = isEdit && KT.isDraft(entry);
  const lockedRec = isEdit && KT.isLockedDate(S.all, entry.ngay); // tháng đã khóa sổ: chỉ xem
  const canDraft = (!isEdit || isDraftRec) && !lockedRec;
  const e = Object.assign({ ngay: lastUsed.ngay || KT.todayISO(), soPhieu: '', maDuAn: '', maNCC: '', noiDung: '', thu: 0, chi: 0, nguoiNhan: '', ghiChu: '' }, entry || {});
  if (opts.duplicate) { e.id = undefined; }
  let loai = e.thu > 0 && e.chi > 0 ? 'ca-hai' : e.thu > 0 ? 'thu' : (entry && entry.id) ? 'chi' : (opts.loai || lastUsed.loai || 'chi');

  const body =
    '<form id="entry-form" class="grid grid-cols-2 gap-x-5 gap-y-4 max-sm:grid-cols-1" novalidate autocomplete="off">' +
    (lockedRec ? '<p class="form-error col-span-2 max-sm:col-span-1" role="note">' + icon('lock') + '<span>' + esc(KT.lockMessage(KT.monthOf(entry.ngay), 'sửa')) + '</span></p>' : '') +
    datalists() +
    '<div class="col-span-2 max-sm:col-span-1"><div class="seg" role="radiogroup" aria-label="Loại nghiệp vụ">' +
    [['chi', 'Chi tiền'], ['thu', 'Thu tiền'], ['ca-hai', 'Thu và chi cùng lúc']].map(([v, l]) =>
      '<label class="seg-item"><input type="radio" name="loai" value="' + v + '"' + (loai === v ? ' checked' : '') + '><span>' + l + '</span></label>').join('') +
    '</div></div>' +
    '<label class="field"><span class="label">Ngày chứng từ <b class="req">*</b></span>' + dateField({ name: 'ngay', value: e.ngay, required: true, label: 'Ngày chứng từ' }) + '</label>' +
    '<div class="field"><span class="label">Số phiếu</span><div class="flex gap-2">' +
    '<input name="soPhieu" class="input" value="' + esc(e.soPhieu) + '" placeholder="VD: PC045/09" aria-label="Số phiếu">' +
    '<button type="button" class="btn btn-secondary flex-none" data-act="so-moi" title="Lấy số phiếu kế tiếp trong tháng">Số mới</button></div>' +
    '<span class="hint" id="so-hint"></span></div>' +
    '<label class="field"><span class="label">Dự án</span><input name="maDuAn" class="input" list="dl-projects" value="' + esc(e.maDuAn) + '" placeholder="Gõ mã hoặc tên dự án">' +
    '<span class="hint" id="da-hint"></span></label>' +
    '<label class="field"><span class="label">Nhà cung cấp, đối tượng</span><input name="maNCC" class="input" list="dl-suppliers" value="' + esc(e.maNCC) + '" placeholder="Gõ mã hoặc tên">' +
    '<span class="hint" id="ncc-hint"></span></label>' +
    '<label class="field col-span-2 max-sm:col-span-1"><span class="label">Nội dung thu, chi <b class="req">*</b></span><textarea name="noiDung" class="input" rows="2" placeholder="VD: Thanh toán công nợ vật tư" required>' + esc(e.noiDung) + '</textarea></label>' +
    '<label class="field" data-show="chi"><span class="label">Số tiền chi (đồng)</span><input name="chi" inputmode="decimal" class="input money-input h-11" value="' + (e.chi ? money(e.chi) : '') + '" placeholder="VD: 1.250.000 hoặc 50tr" aria-describedby="chi-hint">' +
    '<span class="hint" id="chi-hint"></span></label>' +
    '<label class="field" data-show="thu"><span class="label">Số tiền thu (đồng)</span><input name="thu" inputmode="decimal" class="input money-input h-11" value="' + (e.thu ? money(e.thu) : '') + '" placeholder="VD: 1.250.000 hoặc 50tr" aria-describedby="thu-hint">' +
    '<span class="hint" id="thu-hint"></span></label>' +
    '<label class="field"><span class="label">Người nhận, người nộp</span><input name="nguoiNhan" class="input" value="' + esc(e.nguoiNhan) + '" placeholder="Để trống thì lấy theo nhà cung cấp khi in"></label>' +
    '<label class="field"><span class="label">Ghi chú</span><input name="ghiChu" class="input" value="' + esc(e.ghiChu) + '"></label>' +
    '<p class="col-span-2 text-[12.5px] leading-relaxed text-ink-3 max-sm:col-span-1">' + icon('keyboard', 'mr-1 align-[-3px] text-[15px]') +
    'Ô số tiền nhận <b class="font-medium text-ink-2">1.250.000</b>, <b class="font-medium text-ink-2">50tr</b>, <b class="font-medium text-ink-2">300k</b> hoặc phép tính <b class="font-medium text-ink-2">58000+11000</b>. ' +
    'Ghi sổ nhanh bằng <kbd>Ctrl</kbd> + <kbd>Enter</kbd>, đóng bằng <kbd>Esc</kbd>.</p>' +
    '</form>' + attachBlock('entries', isEdit ? e.id : 0, { readonly: false, newText: 'Ghi sổ (hoặc lưu nháp) dòng này trước, rồi mở lại để đính kèm ảnh hóa đơn, chứng từ.' });

  const footer =
    (isEdit ? (lockedRec ? '' : '<button type="button" class="btn btn-danger-ghost" data-act="delete">' + icon('trash') + 'Xóa dòng</button>') +
      '<button type="button" class="btn btn-ghost" data-act="history" title="Xem mọi lần thêm, sửa của dòng này trong nhật ký">' + icon('history') + 'Lịch sử</button>' : '') +
    '<span class="flex-1"></span>' +
    '<button type="button" class="btn btn-ghost" data-act="cancel">Hủy</button>' +
    (canDraft ? '<button type="button" class="btn btn-secondary" data-act="save-draft" title="Lưu lại để làm tiếp; dòng Nháp chưa tính vào tồn quỹ, báo cáo, công nợ">' + icon('draft') + 'Lưu nháp</button>' : '') +
    (isEdit ? '' : '<button type="button" class="btn btn-secondary" data-act="save-next" title="Ghi sổ rồi giữ lại ngày, số phiếu, dự án, nhà cung cấp để ghi dòng tiếp theo">Ghi sổ và ghi tiếp</button>') +
    (lockedRec ? '' : '<button type="button" class="btn btn-primary" data-act="save" title="Ctrl + Enter">' + icon(isEdit && !isDraftRec ? 'save' : 'check') + (isEdit && !isDraftRec ? 'Lưu thay đổi' : 'Ghi sổ') + '</button>');

  const m = openModal({
    title: isDraftRec ? 'Sửa dòng nháp (chưa ghi sổ)' : isEdit ? 'Sửa dòng sổ thu chi' : opts.duplicate ? 'Nhân bản dòng sổ thu chi' : 'Ghi thu / chi',
    size: 'wide',
    body,
    footer,
    dismissible: false,
    onMount(el) { bindEntryForm(el); bindAttach(el); }
  });

  function bindEntryForm(el) {
    const f = $('#entry-form', el);
    const get = (n) => f.elements[n];
    const getChi = bindMoneyInput(get('chi'), $('#chi-hint', el));
    const getThu = bindMoneyInput(get('thu'), $('#thu-hint', el));

    function applyLoai() {
      loai = f.querySelector('input[name=loai]:checked').value;
      el.querySelectorAll('[data-show]').forEach((x) => {
        x.hidden = !(loai === 'ca-hai' || x.dataset.show === loai);
      });
      updateSoHint();
    }
    f.querySelectorAll('input[name=loai]').forEach((r) => r.addEventListener('change', applyLoai));

    // Chỉ ghi lại khi nội dung đổi: bấm vào liên kết trong gợi ý (Thêm ... này, Điền số này) làm ô nhập mất tiêu điểm → sự kiện change
    // vẽ lại gợi ý ngay giữa lúc nhấn chuột, liên kết bị thay mới và cú bấm không tới được.
    function setHint(h, html, cls) { if (h.dataset.src !== html) { h.innerHTML = html; h.dataset.src = html; } if (h.className !== cls) h.className = cls; }
    function hint(input, list, hintSel, kind) {
      const code = resolveCode(list, input.value);
      const h = $(hintSel, el);
      if (!input.value.trim()) { setHint(h, '', 'hint'); return; }
      const found = list.find((x) => KT.keyOf(x.ma) === KT.keyOf(code));
      if (found && kind === 'supplier') setHint(h, esc(found.ten) + debtHint(found.ma), 'hint good');
      else if (found) setHint(h, esc(found.ten), 'hint good');
      else setHint(h, 'Chưa có trong danh mục. <a href="#" data-act="add-' + kind + '">Thêm ' + (kind === 'project' ? 'dự án' : 'nhà cung cấp') + ' này</a>', 'hint bad');
    }
    const daHint = () => hint(get('maDuAn'), S.db.projects, '#da-hint', 'project');
    const nccHint = () => hint(get('maNCC'), S.db.suppliers, '#ncc-hint', 'supplier');
    // Công nợ còn lại của NCC (chi phí công trình − đã trả), theo dự án nếu đã chọn; không tính dòng đang sửa
    function debtHint(maNCC) {
      const ct = resolveCode(S.db.projects, get('maDuAn').value);
      const view = isEdit ? Object.assign({}, S.db, { entries: S.db.entries.filter((x) => x.id !== e.id) }) : S.db;
      const d = KT.debtOf(view, maNCC, projectByCode(ct) ? ct : '');
      if (!d || !d.soDongCP) return '';
      const where = projectByCode(ct) ? ' tại ' + esc(ct) : '';
      if (d.conLai > 0) return '<br><span class="text-ink-2">Công nợ' + where + ': còn nợ <b class="font-semibold tabular-nums">' + money(d.conLai) + ' đ</b></span> <a href="#" data-act="fill-debt" data-v="' + d.conLai + '">Điền số này</a>';
      if (d.conLai < 0) return '<br><span class="text-caution">Công nợ' + where + ': đã ứng dư ' + money(-d.conLai) + ' đ</span>';
      return '<br><span class="text-ink-2">Công nợ' + where + ': đã tất toán</span>';
    }
    get('maDuAn').addEventListener('change', () => nccHint());
    get('maDuAn').addEventListener('input', daHint);
    get('maNCC').addEventListener('input', nccHint);
    get('maDuAn').addEventListener('change', () => { get('maDuAn').value = resolveCode(S.db.projects, get('maDuAn').value); daHint(); });
    get('maNCC').addEventListener('change', () => { get('maNCC').value = resolveCode(S.db.suppliers, get('maNCC').value); nccHint(); });

    function updateSoHint() {
      const h = $('#so-hint', el);
      const so = get('soPhieu').value.trim();
      h.className = 'hint';
      if (!so) {
        h.innerHTML = lastUsed.soPhieu && !isEdit ? 'Phiếu vừa nhập: <a href="#" data-act="so-truoc">' + esc(lastUsed.soPhieu) + '</a>' : '';
        return;
      }
      const t = KT.voucherType(so);
      const others = S.all.entries.filter((x) => KT.voucherKey(x.soPhieu) === KT.voucherKey(so) && x.id !== e.id);
      let txt = t === 'thu' ? 'Phiếu thu' : 'Phiếu chi';
      if (others.length) txt += ', đã có ' + others.length + ' dòng cùng số (sẽ gộp khi in)';
      if (t === 'thu' && loai === 'chi') txt += '. Lưu ý: số phiếu PT dành cho khoản thu';
      h.textContent = txt;
    }
    get('soPhieu').addEventListener('input', updateSoHint);

    el.addEventListener('click', async (ev) => {
      const a = ev.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      if (act === 'fill-debt') {
        ev.preventDefault();
        get('chi').value = money(Number(a.dataset.v));
        get('chi').dispatchEvent(new Event('input'));
        get('chi').focus();
      } else if (act === 'so-moi') {
        get('soPhieu').value = KT.nextVoucherNo(S.all, loai === 'thu' ? 'thu' : 'chi', get('ngay').value);
        updateSoHint();
      } else if (act === 'so-truoc') {
        ev.preventDefault();
        get('soPhieu').value = lastUsed.soPhieu;
        updateSoHint();
      } else if (act === 'add-project') {
        ev.preventDefault();
        openProjectForm({ ma: get('maDuAn').value.trim() }, (p) => { get('maDuAn').value = p.ma; refreshLists(); daHint(); });
      } else if (act === 'add-supplier') {
        ev.preventDefault();
        openSupplierForm({ ma: get('maNCC').value.trim() }, (s) => { get('maNCC').value = s.ma; refreshLists(); nccHint(); });
      } else if (act === 'history') {
        m.close();
        openHistory(e.id);
      } else if (act === 'cancel') {
        m.close();
      } else if (act === 'delete') {
        if (await deleteEntry(e)) m.close();
      } else if (act === 'save' || act === 'save-next') {
        save(act === 'save-next');
      } else if (act === 'save-draft') {
        save(false, true);
      }
    });

    function refreshLists() {
      const tmp = document.createElement('div');
      tmp.innerHTML = datalists();
      f.querySelector('#dl-projects').replaceWith(tmp.querySelector('#dl-projects'));
      f.querySelector('#dl-suppliers').replaceWith(tmp.querySelector('#dl-suppliers'));
    }

    f.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); save(false); }
    });
    f.addEventListener('submit', (ev) => { ev.preventDefault(); save(false); });

    let saving = false;
    async function save(next, asDraft) {
      if (saving) return;
      const data = {
        trangThai: asDraft ? 'nhap' : '',
        ngay: get('ngay').value,
        soPhieu: get('soPhieu').value.trim(),
        maDuAn: resolveCode(S.db.projects, get('maDuAn').value),
        maNCC: resolveCode(S.db.suppliers, get('maNCC').value),
        noiDung: get('noiDung').value.trim(),
        thu: loai === 'chi' ? 0 : getThu(),
        chi: loai === 'thu' ? 0 : getChi(),
        nguoiNhan: get('nguoiNhan').value.trim(),
        ghiChu: get('ghiChu').value.trim()
      };
      if (lockedRec) return;
      if (!KT.isISODate(data.ngay)) return fail('ngay', 'Nhập ngày chứng từ, ví dụ 29/9');
      if (KT.isLockedDate(S.all, data.ngay)) return fail('ngay', KT.lockMessage(KT.monthOf(data.ngay), 'ghi'));
      if (data.maDuAn && !projectByCode(data.maDuAn)) return fail('maDuAn', 'Mã dự án chưa có trong danh mục. Bấm “Thêm dự án này” hoặc chọn mã có sẵn');
      if (data.maNCC && !supplierByCode(data.maNCC)) return fail('maNCC', 'Mã nhà cung cấp chưa có trong danh mục. Bấm “Thêm nhà cung cấp này” hoặc chọn mã có sẵn');
      if (!data.noiDung) return fail('noiDung', 'Nhập nội dung thu, chi');
      if (isNaN(data.chi)) return fail('chi', 'Số tiền chi không hợp lệ. Ví dụ: 1.250.000, 50tr, 300k');
      if (isNaN(data.thu)) return fail('thu', 'Số tiền thu không hợp lệ. Ví dụ: 1.250.000, 50tr, 300k');
      if (loai === 'chi' && !data.chi) return fail('chi', 'Nhập số tiền chi');
      if (loai === 'thu' && !data.thu) return fail('thu', 'Nhập số tiền thu');
      if (loai === 'ca-hai' && !data.thu && !data.chi) return fail('chi', 'Nhập số tiền thu hoặc chi');
      saving = true;
      const btn = el.querySelector(asDraft ? '[data-act=save-draft]' : next ? '[data-act=save-next]' : '[data-act=save]');
      const done = busy(btn, isEdit || asDraft ? 'Đang lưu…' : 'Đang ghi…');
      try {
        if (isEdit) await api('PUT', '/api/entries/' + e.id, data);
        else await api('POST', '/api/entries', data);
        lastUsed = { ngay: data.ngay, soPhieu: data.soPhieu, maDuAn: data.maDuAn, maNCC: data.maNCC, loai };
        toast(asDraft ? 'Đã lưu nháp (chưa ghi sổ, chưa tính vào tồn quỹ)' : isDraftRec ? 'Đã ghi sổ dòng nháp' : isEdit ? 'Đã lưu thay đổi' : 'Đã ghi sổ ' + (data.chi ? 'khoản chi ' + money(data.chi) : 'khoản thu ' + money(data.thu)) + ' đ');
        if (next) {
          ['noiDung', 'chi', 'thu', 'nguoiNhan', 'ghiChu'].forEach((n) => { get(n).value = ''; });
          get('chi').dispatchEvent(new Event('input'));
          get('thu').dispatchEvent(new Event('input'));
          updateSoHint();
          get('noiDung').focus();
        } else {
          m.close();
        }
        if (opts.onSaved) opts.onSaved();
      } catch (err) {
        showError(err);
      } finally {
        saving = false;
        if (btn && btn.isConnected) done();
      }
    }

    // Lỗi hiện ngay dưới ô (không che nút Ghi sổ như thông báo góc màn hình)
    function fail(name, msg) {
      if (!fieldError(get(name), msg)) toast(msg, 'error');
    }

    applyLoai();
    if (lockedRec) f.querySelectorAll('input, textarea, select, button').forEach((x) => { x.disabled = true; });
    daHint();
    nccHint();
    let touched = false;
    ['pointerdown', 'keydown', 'input'].forEach((t) => el.addEventListener(t, () => { touched = true; }, true));
    setTimeout(() => { if (!touched) focusInput(isEdit ? get('noiDung') : get('ngay')); }, 40);
  }
}

export async function deleteEntry(e) {
  const ok = await confirmDialog({
    trash: true,
    title: 'Xóa dòng sổ thu chi',
    html: 'Xóa dòng ngày <b class="text-ink">' + esc(KT.fmtDate(e.ngay)) + '</b>: “' + esc(e.noiDung || '') + '” ' +
      (e.chi ? '(chi <b class="text-ink">' + money(e.chi) + ' đ</b>)' : '(thu <b class="text-ink">' + money(e.thu) + ' đ</b>)') + '?' +
      '<p class="mt-2 text-[13px] text-ink-3">Tồn quỹ các dòng sau tự tính lại.</p>',
    okText: 'Xóa dòng',
    danger: true
  });
  if (!ok) return false;
  try {
    await api('DELETE', '/api/entries/' + e.id);
    toast('Đã xóa dòng sổ, chuyển vào Thùng rác');
    return true;
  } catch (err) {
    showError(err);
    return false;
  }
}

/* ============================== DỰ ÁN ============================== */

export const PROJECT_STATUSES = ['Đang thực hiện', 'Đang thi công', 'Tạm dừng', 'Hoàn thành', 'Đã quyết toán'];

export function openProjectForm(p, onSaved) {
  const isEdit = !!(p && p.id);
  p = Object.assign({ ma: '', ten: '', nganSach: 0, trangThai: 'Đang thực hiện', ghiChu: '', ngayKhoiCong: '', diaChi: '' }, p || {});
  const used = isEdit ? S.all.entries.filter((e) => KT.keyOf(e.maDuAn) === KT.keyOf(p.ma)).length + S.all.costs.filter((c) => KT.keyOf(c.maCT) === KT.keyOf(p.ma)).length : 0;
  return openModal({
    title: isEdit ? 'Sửa dự án ' + p.ma : 'Thêm dự án',
    body:
      '<form class="grid grid-cols-2 gap-x-5 gap-y-4 max-sm:grid-cols-1" id="p-form" novalidate autocomplete="off">' +
      '<label class="field"><span class="label">Mã dự án <b class="req">*</b></span><input name="ma" class="input" value="' + esc(p.ma) + '" placeholder="VD: DA34PHK" required>' +
      '<span class="hint">' + (used ? 'Đổi mã sẽ cập nhật ' + used + ' dòng sổ thu chi và chi phí đang dùng mã này' : '') + '</span></label>' +
      '<label class="field"><span class="label">Trạng thái</span><select name="trangThai" class="input">' +
      PROJECT_STATUSES.concat(PROJECT_STATUSES.includes(p.trangThai) ? [] : [p.trangThai]).map((s) => '<option' + (s === p.trangThai ? ' selected' : '') + '>' + esc(s) + '</option>').join('') +
      '</select></label>' +
      '<label class="field col-span-2 max-sm:col-span-1"><span class="label">Tên dự án <b class="req">*</b></span><input name="ten" class="input" value="' + esc(p.ten) + '" required></label>' +
      '<label class="field"><span class="label">Ngân sách dự kiến (đồng)</span><input name="nganSach" inputmode="decimal" class="input text-right tabular-nums" value="' + (p.nganSach ? money(p.nganSach) : '') + '" placeholder="Để trống nếu chưa có">' +
      '<span class="hint" id="ns-hint"></span></label>' +
      '<label class="field"><span class="label">Ghi chú</span><input name="ghiChu" class="input" value="' + esc(p.ghiChu) + '"></label>' +
      '<label class="field"><span class="label">Ngày khởi công</span>' + dateField({ name: 'ngayKhoiCong', value: p.ngayKhoiCong, label: 'Ngày khởi công' }) + '</label>' +
      '<label class="field"><span class="label">Địa chỉ công trình</span><input name="diaChi" class="input" value="' + esc(p.diaChi) + '"></label>' +
      '</form>',
    footer: '<span class="flex-1"></span><button type="button" class="btn btn-ghost" data-act="cancel">Hủy</button><button type="button" class="btn btn-primary" data-act="save">' + (isEdit ? 'Lưu thay đổi' : 'Thêm dự án') + '</button>',
    onMount(el, h) {
      const f = $('#p-form', el);
      const getNs = bindMoneyInput(f.elements.nganSach, $('#ns-hint', el));
      const save = async () => {
        const data = { ma: f.elements.ma.value.trim(), ten: f.elements.ten.value.trim(), nganSach: getNs(), trangThai: f.elements.trangThai.value, ghiChu: f.elements.ghiChu.value.trim(),
          ngayKhoiCong: f.elements.ngayKhoiCong.value, diaChi: f.elements.diaChi.value.trim() };
        if (!data.ma) return fieldError(f.elements.ma, 'Nhập mã dự án');
        if (!data.ten) return fieldError(f.elements.ten, 'Nhập tên dự án');
        if (isNaN(data.nganSach)) return fieldError(f.elements.nganSach, 'Ngân sách không hợp lệ. Ví dụ: 500tr, 1.200.000.000');
        const done = busy(el.querySelector('[data-act=save]'), 'Đang lưu…');
        try {
          const r = isEdit ? await api('PUT', '/api/projects/' + p.id, data) : await api('POST', '/api/projects', data);
          toast(isEdit ? 'Đã lưu dự án' + (r.renamed ? ', cập nhật mã trên ' + r.renamed + ' dòng sổ' : '') : 'Đã thêm dự án ' + data.ma);
          h.close();
          if (onSaved) onSaved(data);
        } catch (err) { done(); showError(err); }
      };
      el.addEventListener('click', (ev) => {
        const a = ev.target.closest('[data-act]');
        if (!a) return;
        if (a.dataset.act === 'cancel') h.close();
        if (a.dataset.act === 'save') save();
      });
      f.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); save(); } });
    }
  });
}

/* ============================== NHÀ CUNG CẤP ============================== */

export function openSupplierForm(s, onSaved) {
  const isEdit = !!(s && s.id);
  s = Object.assign({ ma: '', ten: '', loai: '', sdt: '', diaChi: '', ghiChu: '' }, s || {});
  const used = isEdit ? S.all.entries.filter((e) => KT.keyOf(e.maNCC) === KT.keyOf(s.ma)).length : 0;
  const types = Array.from(new Set(S.db.suppliers.map((x) => x.loai).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'vi'));
  openModal({
    title: isEdit ? 'Sửa ' + s.ma : 'Thêm nhà cung cấp, đối tượng',
    body:
      '<form class="grid grid-cols-2 gap-x-5 gap-y-4 max-sm:grid-cols-1" id="s-form" novalidate autocomplete="off">' +
      '<datalist id="dl-types">' + types.map((t) => '<option value="' + esc(t) + '">').join('') + '</datalist>' +
      '<label class="field"><span class="label">Mã <b class="req">*</b></span><input name="ma" class="input" value="' + esc(s.ma) + '" placeholder="VD: NCC_HoaLan" required>' +
      '<span class="hint">' + (used ? 'Đổi mã sẽ cập nhật ' + used + ' dòng sổ đang dùng mã này' : 'Nên đặt dạng NCC_TenNgan') + '</span></label>' +
      '<label class="field"><span class="label">Loại đối tượng</span><input name="loai" class="input" list="dl-types" value="' + esc(s.loai) + '" placeholder="Vật tư, nhân công, chủ thầu"></label>' +
      '<label class="field col-span-2 max-sm:col-span-1"><span class="label">Tên nhà cung cấp, đối tượng <b class="req">*</b></span><input name="ten" class="input" value="' + esc(s.ten) + '" required></label>' +
      '<label class="field"><span class="label">Số điện thoại</span><input name="sdt" class="input" value="' + esc(s.sdt) + '" inputmode="tel"></label>' +
      '<label class="field"><span class="label">Địa chỉ</span><input name="diaChi" class="input" value="' + esc(s.diaChi) + '"><span class="hint">Được in lên phiếu chi</span></label>' +
      '<label class="field col-span-2 max-sm:col-span-1"><span class="label">Ghi chú</span><input name="ghiChu" class="input" value="' + esc(s.ghiChu) + '"></label>' +
      '</form>',
    footer: '<span class="flex-1"></span><button type="button" class="btn btn-ghost" data-act="cancel">Hủy</button><button type="button" class="btn btn-primary" data-act="save">' + (isEdit ? 'Lưu thay đổi' : 'Thêm nhà cung cấp') + '</button>',
    onMount(el, h) {
      const f = $('#s-form', el);
      const save = async () => {
        const data = {};
        ['ma', 'ten', 'loai', 'sdt', 'diaChi', 'ghiChu'].forEach((k) => { data[k] = f.elements[k].value.trim(); });
        if (!data.ma) return fieldError(f.elements.ma, 'Nhập mã nhà cung cấp');
        if (!data.ten) return fieldError(f.elements.ten, 'Nhập tên nhà cung cấp');
        const done = busy(el.querySelector('[data-act=save]'), 'Đang lưu…');
        try {
          const r = isEdit ? await api('PUT', '/api/suppliers/' + s.id, data) : await api('POST', '/api/suppliers', data);
          toast(isEdit ? 'Đã lưu ' + data.ma + (r.renamed ? ', cập nhật mã trên ' + r.renamed + ' dòng sổ' : '') : 'Đã thêm ' + data.ma);
          h.close();
          if (onSaved) onSaved(data);
        } catch (err) { done(); showError(err); }
      };
      el.addEventListener('click', (ev) => {
        const a = ev.target.closest('[data-act]');
        if (!a) return;
        if (a.dataset.act === 'cancel') h.close();
        if (a.dataset.act === 'save') save();
      });
      f.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); save(); } });
    }
  });
}
