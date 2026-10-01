/* Đối chiếu tồn quỹ: nhập số tiền kiểm kê thực tế tại một ngày, so với tồn quỹ theo sổ, lưu biên bản, in / xuất Excel. */
import { $, esc, money, icon, api, toast, showError, confirmDialog, dateField, bindMoneyInput, fieldError, download, busy } from '../ui.js';
import { S } from '../state.js';

const KT = window.KT;
const MENH_GIA = [500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200];

function clText(cl) {
  if (!cl) return '<span class="chip chip-ok">' + icon('check') + 'Khớp sổ</span>';
  return '<span class="chip ' + (cl < 0 ? 'chip-over' : 'chip-near') + '">' + (cl < 0 ? 'Thiếu ' : 'Thừa ') + money(Math.abs(cl)) + ' đ</span>';
}

export function renderCashCount(el) {
  const today = KT.todayISO();
  const list = (S.all.cashCounts || []).slice().sort((a, b) => (a.ngay === b.ngay ? b.id - a.id : a.ngay < b.ngay ? 1 : -1));
  el.innerHTML =
    '<section class="sheet" aria-labelledby="kq-h"><div class="sheet-head"><div><h2 id="kq-h" class="sheet-title">Kiểm kê quỹ tiền mặt</h2>' +
    '<p class="sheet-note">Đếm tiền thực tế trong két rồi nhập vào đây; phần mềm so với tồn quỹ theo sổ (chỉ tính dòng đã ghi sổ) đến hết ngày kiểm. ' +
    'Có chênh lệch thì được đưa vào “Cần xử lý” cho tới khi tìm ra nguyên nhân.</p></div></div>' +
    '<form id="kq-form" class="grid grid-cols-4 gap-x-5 gap-y-4 px-5 pb-5 max-xl:grid-cols-2 max-sm:grid-cols-1" novalidate autocomplete="off">' +
    '<label class="field"><span class="label">Ngày kiểm quỹ <b class="req">*</b></span>' + dateField({ name: 'ngay', value: today, required: true, label: 'Ngày kiểm quỹ' }) + '<span class="hint"></span></label>' +
    '<div class="field"><span class="label">Tồn quỹ theo sổ</span><div class="input flex items-center justify-end bg-paper font-semibold tabular-nums" id="kq-so" aria-live="polite"></div><span class="hint">Đến hết ngày kiểm, không tính dòng nháp</span></div>' +
    '<label class="field"><span class="label">Số tiền thực tế đếm được <b class="req">*</b></span><input name="thucTe" inputmode="decimal" class="input money-input" placeholder="VD: 943.000" aria-describedby="kq-tt-hint"><span class="hint" id="kq-tt-hint"></span></label>' +
    '<div class="field"><span class="label">Chênh lệch</span><div class="flex h-9 items-center" id="kq-cl" aria-live="polite"></div><span class="hint">Thực tế trừ theo sổ</span></div>' +
    '<details class="col-span-4 max-xl:col-span-2 max-sm:col-span-1 rounded-lg border border-rule px-4 py-2"><summary class="cursor-pointer text-[13.5px] font-semibold text-ink-2">Bảng kê số tờ theo mệnh giá (không bắt buộc — điền thì tự cộng ra số tiền thực tế)</summary>' +
    '<div class="mt-3 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 pb-2">' +
    MENH_GIA.map((mg) => '<label class="field"><span class="label">Loại ' + money(mg) + '</span><input class="input input-sm text-right tabular-nums" data-mg="' + mg + '" inputmode="numeric" placeholder="số tờ"></label>').join('') +
    '</div><p class="text-[12.5px] text-ink-3" id="kq-mg-tong"></p></details>' +
    '<label class="field"><span class="label">Người kiểm kê</span><input name="nguoiKiem" class="input" maxlength="200"></label>' +
    '<label class="field col-span-2 max-sm:col-span-1"><span class="label">Lý do chênh lệch / ghi chú</span><input name="ghiChu" class="input" maxlength="1000"></label>' +
    '<div class="flex items-end justify-end"><button type="submit" class="btn btn-primary">' + icon('save') + 'Lưu biên bản kiểm quỹ</button></div>' +
    '</form></section>' +
    '<section class="sheet overflow-hidden"><div class="border-b border-rule px-4 py-2.5"><h2 class="sheet-title">Các lần kiểm quỹ</h2></div>' +
    '<div class="table-scroll overflow-auto"><table class="ledger"><thead><tr><th>Ngày kiểm</th><th class="num money">Theo sổ lúc kiểm</th><th class="num money">Thực tế</th><th>Chênh lệch</th>' +
    '<th class="num money">Theo sổ hiện nay</th><th>Người kiểm · ghi chú</th><th class="no-print"><span class="sr-only">Thao tác</span></th></tr></thead><tbody>' +
    (list.length ? list.map((k) => {
      const now = KT.cashBalanceAt(S.all, k.ngay);
      const cl = k.thucTe - now;
      return '<tr data-id="' + k.id + '"><td class="whitespace-nowrap">' + KT.fmtDate(k.ngay) + '</td><td class="num money">' + money(k.tonSo) + '</td>' +
        '<td class="num money font-semibold">' + money(k.thucTe) + '</td><td>' + clText(cl) + '</td>' +
        '<td class="num money' + (now !== k.tonSo ? ' text-caution' : ' text-ink-3') + '"' + (now !== k.tonSo ? ' title="Sổ đã được sửa sau khi kiểm quỹ"' : '') + '>' + money(now) + '</td>' +
        '<td class="wrap-text">' + esc(k.nguoiKiem || '') + (k.ghiChu ? '<div class="text-[12.5px] text-ink-3">' + esc(k.ghiChu) + '</div>' : '') + '</td>' +
        '<td class="actions no-print"><button type="button" class="icon-btn" data-act="print" title="In biên bản" aria-label="In biên bản kiểm quỹ ngày ' + KT.fmtDate(k.ngay) + '">' + icon('print') + '</button>' +
        '<button type="button" class="icon-btn" data-act="excel" title="Xuất Excel biên bản" aria-label="Xuất Excel biên bản">' + icon('excel') + '</button>' +
        '<button type="button" class="icon-btn danger" data-act="del" title="Xóa" aria-label="Xóa biên bản">' + icon('trash') + '</button></td></tr>';
    }).join('') : '<tr><td colspan="7" class="empty">Chưa kiểm quỹ lần nào.</td></tr>') +
    '</tbody></table></div></section>';

  const f = $('#kq-form', el);
  const getTT = bindMoneyInput(f.elements.thucTe, $('#kq-tt-hint', el));
  const mgInputs = Array.from(el.querySelectorAll('[data-mg]'));
  const so = () => (KT.isISODate(f.elements.ngay.value) ? KT.cashBalanceAt(S.all, f.elements.ngay.value) : null);
  const update = () => {
    const s = so();
    $('#kq-so', el).textContent = s == null ? '—' : money(s);
    const t = getTT();
    $('#kq-cl', el).innerHTML = s == null || isNaN(t) || !f.elements.thucTe.value.trim() ? '<span class="text-ink-3">—</span>' : clText(t - s);
  };
  const mgTotal = () => mgInputs.reduce((sum, i) => sum + (Number(i.value) || 0) * Number(i.dataset.mg), 0);
  mgInputs.forEach((i) => i.addEventListener('input', () => {
    const tot = mgTotal();
    $('#kq-mg-tong', el).textContent = tot ? 'Cộng bảng kê: ' + money(tot) + ' đ' : '';
    if (tot) { f.elements.thucTe.value = money(tot); f.elements.thucTe.dispatchEvent(new Event('input')); }
    update();
  }));
  f.elements.thucTe.addEventListener('input', update);
  f.addEventListener('change', update);
  update();

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ngay = f.elements.ngay.value;
    if (!KT.isISODate(ngay)) return fieldError(f.elements.ngay, 'Nhập ngày kiểm quỹ, ví dụ 30/9');
    if (ngay > KT.todayISO()) return fieldError(f.elements.ngay, 'Ngày kiểm quỹ không được ở tương lai');
    const t = getTT();
    if (!f.elements.thucTe.value.trim() || isNaN(t)) return fieldError(f.elements.thucTe, 'Nhập số tiền thực tế đếm được');
    const menhGia = {};
    mgInputs.forEach((i) => { const n = Number(i.value); if (i.value.trim()) menhGia[i.dataset.mg] = n; });
    for (const i of mgInputs) if (i.value.trim() && !(Number.isInteger(Number(i.value)) && Number(i.value) >= 0)) return fieldError(i, 'Số tờ phải là số nguyên');
    if (Object.keys(menhGia).length && mgTotal() !== t) return fieldError(f.elements.thucTe, 'Khác tổng bảng kê (' + money(mgTotal()) + ' đ)');
    const done = busy(f.querySelector('[type=submit]'), 'Đang lưu…');
    try {
      const r = await api('POST', '/api/cash-counts', { ngay, thucTe: t, menhGia, nguoiKiem: f.elements.nguoiKiem.value, ghiChu: f.elements.ghiChu.value });
      toast(r.chenhLech ? 'Đã lưu biên bản: ' + (r.chenhLech < 0 ? 'thiếu ' : 'thừa ') + money(Math.abs(r.chenhLech)) + ' đ so với sổ' : 'Đã lưu biên bản: tiền thực tế khớp sổ');
    } catch (err) { done(); showError(err); }
  });

  el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    const tr = a && a.closest('tr[data-id]');
    const k = tr && (S.all.cashCounts || []).find((x) => x.id === Number(tr.dataset.id));
    if (!k) return;
    if (a.dataset.act === 'print') printCashCount(k);
    else if (a.dataset.act === 'excel') download('/api/export/cash-count?id=' + k.id);
    else if (a.dataset.act === 'del') {
      if (!(await confirmDialog({ trash: true, title: 'Xóa biên bản kiểm quỹ', html: 'Xóa biên bản kiểm quỹ ngày <b class="text-ink">' + KT.fmtDate(k.ngay) + '</b>?', okText: 'Xóa biên bản', danger: true }))) return;
      try { await api('DELETE', '/api/cash-counts/' + k.id); toast('Đã xóa biên bản, chuyển vào Thùng rác'); } catch (err) { showError(err); }
    }
  });
}

// In biên bản kiểm kê quỹ (A4 dọc) — dùng khung in phiếu sẵn có
export function cashCountHtml(k, s) {
  const now = KT.cashBalanceAt(S.all, k.ngay);
  const cl = k.thucTe - k.tonSo;
  const rows = MENH_GIA.filter((mg) => (k.menhGia || {})[mg]).map((mg, i) => '<tr><td>' + (i + 1) + '</td><td>Loại ' + KT.fmtMoney(mg) + '</td><td class="r">' + KT.fmtMoney(k.menhGia[mg]) + '</td><td class="r">' + KT.fmtMoney(k.menhGia[mg] * mg) + '</td></tr>').join('');
  return '<div class="vc-page bb">' +
    '<div class="vc-top"><div><div class="vc-company">' + esc(s.tenDonVi || '') + '</div><div>' + esc(s.diaChi || '') + '</div></div><div class="vc-meta"><div class="vc-lien">Mẫu tham khảo 08a-TT</div></div></div>' +
    '<div class="vc-title">BIÊN BẢN KIỂM KÊ QUỸ</div><div class="vc-date">(Dùng cho tiền Việt Nam) — ' + esc(KT.ngayChu(k.ngay)) + '</div>' +
    '<p>Thủ quỹ: <b>' + esc(s.thuQuy || '....................') + '</b>' + (k.nguoiKiem ? '. Người kiểm kê: <b>' + esc(k.nguoiKiem) + '</b>' : '') + '.</p>' +
    '<table class="bb-t"><thead><tr><th>STT</th><th>Diễn giải</th><th>Số tờ</th><th>Số tiền (đồng)</th></tr></thead><tbody>' +
    '<tr class="b"><td>I</td><td>Số dư theo sổ quỹ (đến hết ngày ' + KT.fmtDate(k.ngay) + ')</td><td></td><td class="r">' + KT.fmtMoney(k.tonSo) + '</td></tr>' +
    '<tr class="b"><td>II</td><td>Số kiểm kê thực tế</td><td></td><td class="r">' + KT.fmtMoney(k.thucTe) + '</td></tr>' + rows +
    '<tr class="b"><td>III</td><td>Chênh lệch (II − I): ' + (cl > 0 ? 'thừa' : cl < 0 ? 'thiếu' : 'khớp') + '</td><td></td><td class="r">' + KT.fmtMoney(cl) + '</td></tr></tbody></table>' +
    '<p>Bằng chữ số tiền thực tế: <i>' + esc(KT.docTienBangChu(k.thucTe)) + '</i></p>' +
    (now !== k.tonSo ? '<p><i>Lưu ý: số dư theo sổ tính lại tại thời điểm in là ' + KT.fmtMoney(now) + ' đ (sổ đã được sửa sau khi kiểm quỹ).</i></p>' : '') +
    '<p>Lý do chênh lệch: ' + (k.ghiChu ? esc(k.ghiChu) : '..........................................................................................') + '</p>' +
    '<p>Kết luận sau khi kiểm kê quỹ: ..........................................................................................</p>' +
    '<div class="vc-date2">' + esc(KT.ngayChu(k.ngay)) + '</div>' +
    '<div class="vc-signs" style="grid-template-columns:repeat(3,1fr)">' +
    [['Kế toán trưởng', s.keToanTruong], ['Thủ quỹ', s.thuQuy], ['Người kiểm kê', k.nguoiKiem]].map(([t, n]) => '<div class="vc-sign"><b>' + t + '</b><i>(Ký, họ tên)</i><span class="vc-name">' + esc(n || '') + '</span></div>').join('') +
    '</div></div>';
}

export function printCashCount(k) {
  const root = document.getElementById('print-root');
  root.innerHTML = cashCountHtml(k, S.all.settings || {});
  document.body.classList.add('printing-doc');
  setTimeout(() => window.print(), 50);
}
