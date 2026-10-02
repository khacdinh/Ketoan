/* Số dư đầu kỳ công nợ nhà cung cấp (nhập tay): công nợ đã có từ trước khi dùng phần mềm, theo NCC và (tùy chọn) công trình.
 * Cộng vào cột "Đầu kỳ" của Tổng hợp NCC và Công nợ NCC; không phải chi phí phát sinh, không vào sổ thu chi, không đổi tồn quỹ. */
import { $, esc, money, fdate, icon, api, toast, showError, openModal, dateField, fieldError, busy, confirmDialog } from './ui.js';
import { S, onChange } from './state.js';
import { comboHtml, bindCombo, comboResolve } from './combo.js';

const KT = window.KT;

// Ngày gợi ý: ngày sớm nhất có trong sổ (thường là ngày bắt đầu dùng phần mềm), chưa có dữ liệu thì hôm nay
function ngayGoiY() {
  let min = '';
  (S.all.entries || []).concat(S.all.costs || []).forEach((x) => { if (x.ngay && (!min || x.ngay < min)) min = x.ngay; });
  return min || KT.todayISO();
}

const tenNCC = (ma) => { const x = S.db.suppliers.find((s) => KT.keyOf(s.ma) === KT.keyOf(ma)); return x ? x.ten : ma; };
export const moTaSoDu = (n) => (n < 0 ? 'đã ứng trước ' + money(-n) + ' đ' : 'còn nợ ' + money(n) + ' đ');

// rec: bản ghi để sửa, hoặc null để thêm; d: giá trị gợi ý khi thêm { maNCC, maDuAn }
export function openSoDuDauForm(rec, d) {
  const isEdit = !!(rec && rec.id);
  const v = Object.assign({ ngay: ngayGoiY(), maNCC: '', maDuAn: '', soTien: '', ghiChu: '' }, d || {}, rec || {});
  const ung = Number(v.soTien) < 0;
  const cbN = { name: 'maNCC', list: S.db.suppliers.map((x) => ({ ma: x.ma, ten: x.ten, sub: x.loai })), value: v.maNCC, noun: 'nhà cung cấp', type: 'text', quiet: true, placeholder: 'Gõ mã hoặc tên NCC' };
  const cbP = { name: 'maDuAn', list: S.db.projects.map((x) => ({ ma: x.ma, ten: x.ten })), value: v.maDuAn, noun: 'công trình', type: 'text', quiet: true, placeholder: 'Để trống nếu không tách theo công trình' };
  return openModal({
    title: isEdit ? 'Sửa số dư đầu kỳ nhà cung cấp' : 'Nhập số dư đầu kỳ nhà cung cấp',
    size: 'wide',
    dismissible: false,
    body: '<p class="mb-3 rounded-md bg-pen-soft px-3 py-2 text-[13px] text-ink-2">' + icon('info', 'mr-1 align-[-3px] text-pen') +
      'Công nợ đã có <b class="font-semibold text-ink">trước khi ghi sổ trong phần mềm</b> (vd còn nợ từ năm trước). Được cộng vào cột Đầu kỳ của công nợ; không phải chi phí phát sinh, không vào sổ thu chi, không đổi tồn quỹ.</p>' +
      '<form id="dk-form" class="grid grid-cols-2 gap-x-5 gap-y-4 max-sm:grid-cols-1" novalidate autocomplete="off">' +
      '<div class="field"><span class="label">Nhà cung cấp <b class="req">*</b></span>' + comboHtml(cbN) + '<span class="hint" id="dk-no"></span></div>' +
      '<div class="field"><span class="label">Công trình</span>' + comboHtml(cbP) + '<span class="hint">Ghi công trình để công nợ theo từng công trình đúng; nợ chung nhiều công trình thì để trống.</span></div>' +
      '<fieldset class="field col-span-2 max-sm:col-span-1"><legend class="label">Số dư là <b class="req">*</b></legend><div class="flex flex-wrap gap-x-6 gap-y-1">' +
      '<label class="check"><input type="radio" name="loai" value="no"' + (ung ? '' : ' checked') + '>Mình còn nợ nhà cung cấp</label>' +
      '<label class="check"><input type="radio" name="loai" value="ung"' + (ung ? ' checked' : '') + '>Mình đã ứng trước / trả dư (NCC đang giữ tiền)</label></div></fieldset>' +
      '<label class="field"><span class="label">Số tiền <b class="req">*</b></span><input name="soTien" class="input money-input" inputmode="decimal" value="' + esc(v.soTien === '' ? '' : money(Math.abs(v.soTien))) + '" placeholder="vd 50tr, 1.250.000">' +
      '<span class="hint" id="dk-chu"></span></label>' +
      '<label class="field"><span class="label">Tính đến đầu ngày <b class="req">*</b></span>' + dateField({ name: 'ngay', value: v.ngay, required: true, label: 'Tính đến đầu ngày' }) +
      '<span class="hint">Thường là ngày bắt đầu ghi sổ trong phần mềm. Báo cáo đến ngày trước ngày này thì chưa tính số dư này.</span></label>' +
      '<label class="field col-span-2 max-sm:col-span-1"><span class="label">Ghi chú</span><textarea name="ghiChu" class="input" rows="2" placeholder="vd Còn nợ theo biên bản đối chiếu công nợ 31/12/2025">' + esc(v.ghiChu) + '</textarea></label>' +
      '</form>',
    footer: (isEdit ? '<button type="button" class="btn btn-danger-ghost" data-act="del">' + icon('trash') + 'Xóa</button>' : '') + '<span class="flex-1"></span>' +
      '<button type="button" class="btn btn-ghost" data-act="cancel">Hủy</button><button type="button" class="btn btn-primary" data-act="save">' + icon('check') + (isEdit ? 'Lưu thay đổi' : 'Ghi số dư đầu kỳ') + '</button>',
    onMount(el, h) {
      const fm = $('#dk-form', el);
      const g = (n) => fm.elements[n];
      bindCombo(g('maNCC'), cbN, null);
      bindCombo(g('maDuAn'), cbP, null);
      const hint = () => {
        const n = KT.parseAmount(g('soTien').value);
        $('#dk-chu', el).textContent = !isNaN(n) && n > 0 ? KT.docTienBangChu(n) : '';
        const ncc = comboResolve(cbN, g('maNCC').value).value;
        const daCo = ncc ? (S.all.soDuDauKy || []).filter((x) => KT.keyOf(x.maNCC) === KT.keyOf(ncc) && (!isEdit || x.id !== rec.id)) : [];
        $('#dk-no', el).innerHTML = daCo.length ? 'Đã có ' + daCo.length + ' số dư đầu kỳ của NCC này: ' + daCo.map((x) => esc(moTaSoDu(x.soTien)) + (x.maDuAn ? ' (' + esc(x.maDuAn) + ')' : '')).join('; ') : '';
      };
      fm.addEventListener('input', hint);
      fm.addEventListener('change', hint);
      hint();
      const save = async () => {
        const so = KT.parseAmount(g('soTien').value);
        const data = { ngay: g('ngay').value, maNCC: '', maDuAn: '', soTien: 0, ghiChu: g('ghiChu').value.trim() };
        const n = comboResolve(cbN, g('maNCC').value);
        if (!n.ok || !n.value) return fieldError(g('maNCC'), g('maNCC').value.trim() ? 'Nhà cung cấp chưa có trong danh mục' : 'Chọn nhà cung cấp');
        const p = comboResolve(cbP, g('maDuAn').value);
        if (!p.ok) return fieldError(g('maDuAn'), 'Công trình chưa có trong danh mục');
        if (isNaN(so) || so <= 0) return fieldError(g('soTien'), 'Số tiền phải lớn hơn 0');
        if (!KT.isISODate(data.ngay)) return fieldError(fm.querySelector('.date-text'), 'Nhập ngày, ví dụ 1/1/2026');
        data.maNCC = n.value;
        data.maDuAn = p.value;
        data.soTien = fm.querySelector('[name=loai]:checked').value === 'ung' ? -so : so;
        const done = busy(el.querySelector('[data-act=save]'), 'Đang lưu…');
        try {
          if (isEdit) await api('PUT', '/api/so-du-dau/' + rec.id, data); else await api('POST', '/api/so-du-dau', data);
          toast((isEdit ? 'Đã sửa' : 'Đã ghi') + ' số dư đầu kỳ ' + data.maNCC + ': ' + moTaSoDu(data.soTien) + (data.maDuAn ? ' tại ' + data.maDuAn : ''));
          h.close();
        } catch (err) { done(); showError(err); }
      };
      el.addEventListener('click', (e) => {
        const a = e.target.closest('[data-act]');
        if (!a) return;
        if (a.dataset.act === 'cancel') h.close();
        if (a.dataset.act === 'save') save();
        if (a.dataset.act === 'del') { h.close(); deleteSoDuDau(rec); }
      });
      fm.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } });
    }
  });
}

export async function deleteSoDuDau(rec) {
  if (!(await confirmDialog({ trash: true, title: 'Xóa số dư đầu kỳ', html: 'Xóa số dư đầu kỳ của <b class="text-ink">' + esc(rec.maNCC) + '</b>' + (rec.maDuAn ? ' tại ' + esc(rec.maDuAn) : '') + ' (' + esc(moTaSoDu(rec.soTien)) + ')?', okText: 'Xóa', danger: true }))) return;
  try { await api('DELETE', '/api/so-du-dau/' + rec.id); toast('Đã xóa số dư đầu kỳ, chuyển vào Thùng rác'); } catch (err) { showError(err); }
}

// Danh sách số dư đầu kỳ đã nhập (của một NCC, hoặc tất cả): sửa / xóa / thêm. Tự vẽ lại khi dữ liệu đổi (sau khi lưu trong form).
export function openSoDuDauList(maNCC) {
  const body = () => {
    const list = (S.all.soDuDauKy || []).filter((x) => !maNCC || KT.keyOf(x.maNCC) === KT.keyOf(maNCC))
      .sort((a, b) => KT.keyOf(a.maNCC).localeCompare(KT.keyOf(b.maNCC)) || (a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : a.id - b.id));
    const tong = list.reduce((t, x) => t + (x.soTien || 0), 0);
    return list.length ? '<div class="overflow-x-auto"><table class="ledger ledger-compact"><thead><tr><th>Ngày</th>' + (maNCC ? '' : '<th>Nhà cung cấp</th>') + '<th>Công trình</th><th class="num money">Số dư</th><th>Ghi chú</th><th></th></tr></thead><tbody>' +
      list.map((x) => '<tr data-dk="' + x.id + '"><td class="whitespace-nowrap">' + fdate(x.ngay) + '</td>' + (maNCC ? '' : '<td><span class="code">' + esc(x.maNCC) + '</span> <span class="text-ink-2">' + esc(tenNCC(x.maNCC)) + '</span></td>') +
        '<td>' + (x.maDuAn ? '<span class="code">' + esc(x.maDuAn) + '</span>' : '<span class="text-ink-3">chung</span>') + '</td>' +
        '<td class="num money font-semibold' + (x.soTien < 0 ? ' text-caution' : '') + '" title="' + esc(moTaSoDu(x.soTien)) + '">' + money(x.soTien) + '</td>' +
        '<td class="max-w-[260px] truncate text-ink-2" title="' + esc(x.ghiChu || '') + '">' + esc(x.ghiChu || '') + '</td>' +
        '<td class="actions"><button type="button" class="icon-btn" data-act="dk-edit" title="Sửa" aria-label="Sửa số dư ngày ' + fdate(x.ngay) + '">' + icon('edit') + '</button>' +
        '<button type="button" class="icon-btn danger" data-act="dk-del" title="Xóa (vào Thùng rác)" aria-label="Xóa số dư ngày ' + fdate(x.ngay) + '">' + icon('trash') + '</button></td></tr>').join('') +
      '</tbody><tfoot><tr><td colspan="' + (maNCC ? 2 : 3) + '">Tổng (dương = còn nợ, âm = đã ứng trước)</td><td class="num money">' + money(tong) + '</td><td colspan="2"></td></tr></tfoot></table></div>'
      : '<p class="py-6 text-center text-ink-3">Chưa nhập số dư đầu kỳ nào' + (maNCC ? ' cho nhà cung cấp này' : '') + '.</p>';
  };
  const m = openModal({
    title: 'Số dư đầu kỳ' + (maNCC ? ' · ' + maNCC + ' ' + tenNCC(maNCC) : ' nhà cung cấp'),
    size: 'wide',
    body: '<div id="dk-list">' + body() + '</div>',
    footer: '<span class="flex-1"></span><button type="button" class="btn btn-primary" data-act="dk-add">' + icon('plus') + 'Thêm số dư đầu kỳ</button>',
    onMount(el) {
      el.addEventListener('click', (e) => {
        const a = e.target.closest('[data-act]');
        if (!a) return;
        if (a.dataset.act === 'dk-add') openSoDuDauForm(null, { maNCC: maNCC || '' });
        const tr = a.closest('[data-dk]');
        const rec = tr ? (S.all.soDuDauKy || []).find((x) => String(x.id) === tr.dataset.dk) : null;
        if (rec && a.dataset.act === 'dk-edit') openSoDuDauForm(rec);
        if (rec && a.dataset.act === 'dk-del') deleteSoDuDau(rec);
      });
    }
  });
  // dữ liệu đổi (thêm / sửa / xóa) → vẽ lại danh sách trong hộp thoại
  const ve = () => {
    const box = m.el.querySelector('#dk-list');
    if (box && box.isConnected) box.innerHTML = body();
    else setTimeout(() => { const i = S.listeners.indexOf(ve); if (i >= 0) S.listeners.splice(i, 1); }); // hộp thoại đã đóng: bỏ theo dõi
  };
  onChange(ve);
  return m;
}
