/* Trả nhà cung cấp từ NGUỒN TIỀN KHÁC (ngoài quỹ tiền mặt): chuyển khoản công ty, chủ nhà trả thẳng, giám đốc trả…
 * Tính vào "Đã trả" của công nợ NCC; không vào sổ thu chi, không đổi tồn quỹ, không cần phiếu chi. */
import { $, esc, money, icon, LS, api, toast, showError, openModal, dateField, fieldError, busy, confirmDialog } from './ui.js';
import { S } from './state.js';
import { comboHtml, bindCombo, comboResolve } from './combo.js';

const KT = window.KT;
const NGUON_GOI_Y = ['Chuyển khoản công ty', 'Chủ nhà / chủ đầu tư trả trực tiếp', 'Giám đốc trả', 'Tài khoản cá nhân', 'Nguồn khác'];

// rec: bản ghi để sửa, hoặc null để thêm; d: giá trị gợi ý khi thêm { maNCC, maDuAn, soTien }
export function openExtPayForm(rec, d) {
  const isEdit = !!(rec && rec.id);
  const v = Object.assign({ ngay: KT.todayISO(), maNCC: '', maDuAn: '', soTien: '', nguon: '', ghiChu: '' }, d || {}, rec || {});
  const used = Array.from(new Set(NGUON_GOI_Y.concat((S.all.extPayments || []).map((x) => x.nguon).filter(Boolean))));
  const cbN = { name: 'maNCC', list: S.db.suppliers.map((x) => ({ ma: x.ma, ten: x.ten, sub: x.loai })), value: v.maNCC, noun: 'nhà cung cấp', type: 'text', quiet: true, placeholder: 'Gõ mã hoặc tên NCC' };
  const cbP = { name: 'maDuAn', list: S.db.projects.map((x) => ({ ma: x.ma, ten: x.ten })), value: v.maDuAn, noun: 'công trình', type: 'text', quiet: true, placeholder: 'Để trống nếu không gắn công trình' };
  return openModal({
    title: isEdit ? 'Sửa khoản trả từ nguồn khác' : 'Trả NCC từ nguồn khác (ngoài quỹ)',
    size: 'wide',
    dismissible: false,
    body: '<p class="mb-3 rounded-md bg-pen-soft px-3 py-2 text-[13px] text-ink-2">' + icon('info', 'mr-1 align-[-3px] text-pen') +
      'Khoản trả bằng tiền <b class="font-semibold text-ink">không thuộc quỹ</b> (chuyển khoản công ty, chủ nhà trả thẳng…). Giảm công nợ, không vào sổ quỹ, không đổi tồn quỹ.</p>' +
      '<form id="xp-form" class="grid grid-cols-2 gap-x-5 gap-y-4 max-sm:grid-cols-1" novalidate autocomplete="off">' +
      '<label class="field"><span class="label">Ngày trả <b class="req">*</b></span>' + dateField({ name: 'ngay', value: v.ngay, required: true, label: 'Ngày trả' }) + '</label>' +
      '<label class="field"><span class="label">Số tiền <b class="req">*</b></span><input name="soTien" class="input money-input" inputmode="decimal" value="' + esc(v.soTien === '' ? '' : money(v.soTien)) + '" placeholder="vd 50tr, 1.250.000">' +
      '<span class="hint" id="xp-chu"></span></label>' +
      '<div class="field"><span class="label">NCC được trả <b class="req">*</b></span>' + comboHtml(cbN) + '<span class="hint" id="xp-no"></span></div>' +
      '<div class="field"><span class="label">Công trình</span>' + comboHtml(cbP) + '<span class="hint">Ghi công trình để công nợ theo công trình trừ đúng chỗ.</span></div>' +
      '<label class="field"><span class="label">Nguồn tiền <b class="req">*</b></span><input name="nguon" class="input" list="xp-nguon" value="' + esc(v.nguon) + '" placeholder="vd Chuyển khoản công ty">' +
      '<datalist id="xp-nguon">' + used.map((x) => '<option value="' + esc(x) + '">').join('') + '</datalist></label>' +
      '<label class="field col-span-2 max-sm:col-span-1"><span class="label">Ghi chú</span><textarea name="ghiChu" class="input" rows="2" placeholder="vd Anh Đức chuyển khoản ngày 12/9, số UNC 123; chủ nhà trả thay đợt 2…">' + esc(v.ghiChu) + '</textarea></label>' +
      '</form>',
    footer: (isEdit ? '<button type="button" class="btn btn-danger-ghost" data-act="del">' + icon('trash') + 'Xóa</button>' : '') + '<span class="flex-1"></span>' +
      '<button type="button" class="btn btn-ghost" data-act="cancel">Hủy</button><button type="button" class="btn btn-primary" data-act="save">' + icon('check') + (isEdit ? 'Lưu thay đổi' : 'Ghi khoản trả') + '</button>',
    onMount(el, h) {
      const fm = $('#xp-form', el);
      const g = (n) => fm.elements[n];
      bindCombo(g('maNCC'), cbN, null);
      bindCombo(g('maDuAn'), cbP, null);
      const hint = () => {
        const n = KT.parseAmount(g('soTien').value);
        $('#xp-chu', el).textContent = !isNaN(n) && n > 0 ? KT.docTienBangChu(n) : '';
        const ncc = comboResolve(cbN, g('maNCC').value).value;
        const ct = comboResolve(cbP, g('maDuAn').value).value;
        const view = isEdit ? Object.assign({}, S.db, { extPayments: (S.db.extPayments || []).filter((x) => x.id !== rec.id) }) : S.db;
        const r = ncc ? KT.debtOf(view, ncc, ct || '') : null;
        $('#xp-no', el).innerHTML = r ? (r.conLai > 0 ? 'Dư Có (còn phải trả)' + (ct ? ' tại ' + esc(ct) : '') + ' <b class="tabular-nums">' + money(r.conLai) + '</b> · <a href="#" data-act="fill" data-v="' + r.conLai + '">Điền số này</a>'
          : r.conLai < 0 ? 'Dư Nợ (đã ứng trước) <b class="tabular-nums">' + money(-r.conLai) + '</b>' : 'Đã tất toán') + ' · <a href="#" data-act="so" data-ma="' + esc(ncc) + '">Xem sổ</a>' : '';
      };
      fm.addEventListener('input', hint);
      fm.addEventListener('change', hint);
      hint();
      const save = async () => {
        const data = { ngay: g('ngay').value, maNCC: '', maDuAn: '', soTien: KT.parseAmount(g('soTien').value), nguon: g('nguon').value.trim(), ghiChu: g('ghiChu').value.trim() };
        if (!KT.isISODate(data.ngay)) return fieldError(fm.querySelector('.date-text'), 'Nhập ngày trả, ví dụ 12/9');
        if (isNaN(data.soTien) || data.soTien <= 0) return fieldError(g('soTien'), 'Số tiền phải lớn hơn 0');
        const n = comboResolve(cbN, g('maNCC').value);
        if (!n.ok || !n.value) return fieldError(g('maNCC'), g('maNCC').value.trim() ? 'Nhà cung cấp chưa có trong danh mục' : 'Chọn nhà cung cấp được trả');
        const p = comboResolve(cbP, g('maDuAn').value);
        if (!p.ok) return fieldError(g('maDuAn'), 'Công trình chưa có trong danh mục');
        if (!data.nguon) return fieldError(g('nguon'), 'Ghi nguồn tiền (vd Chuyển khoản công ty)');
        data.maNCC = n.value;
        data.maDuAn = p.value;
        const done = busy(el.querySelector('[data-act=save]'), 'Đang lưu…');
        try {
          if (isEdit) await api('PUT', '/api/ext-payments/' + rec.id, data); else await api('POST', '/api/ext-payments', data);
          toast((isEdit ? 'Đã sửa' : 'Đã ghi') + ' khoản trả ' + money(data.soTien) + ' đ cho ' + data.maNCC + ' từ ' + data.nguon + ' (ngoài quỹ)');
          h.close();
        } catch (err) { done(); showError(err); }
      };
      el.addEventListener('click', async (e) => {
        const a = e.target.closest('[data-act]');
        if (!a) return;
        if (a.dataset.act === 'fill') { e.preventDefault(); g('soTien').value = money(Number(a.dataset.v)); hint(); g('soTien').focus(); }
        if (a.dataset.act === 'so') { e.preventDefault(); LS.set('sct.ncc', a.dataset.ma); h.close(); location.hash = '#/so-chi-tiet-ncc'; }
        if (a.dataset.act === 'cancel') h.close();
        if (a.dataset.act === 'save') save();
        if (a.dataset.act === 'del') { h.close(); deleteExtPay(rec); }
      });
      fm.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } });
    }
  });
}

export async function deleteExtPay(rec) {
  if (!(await confirmDialog({ trash: true, title: 'Xóa khoản trả ngoài quỹ', html: 'Xóa khoản trả <b class="text-ink">' + money(rec.soTien) + ' đ</b> cho ' + esc(rec.maNCC) + ' (' + esc(rec.nguon || '') + ')? Công nợ sẽ tăng lại tương ứng.', okText: 'Xóa', danger: true }))) return;
  try { await api('DELETE', '/api/ext-payments/' + rec.id); toast('Đã xóa khoản trả, chuyển vào Thùng rác'); } catch (err) { showError(err); }
}
