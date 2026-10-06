/* Sổ thu chi & tồn quỹ hàng ngày. */
import { $, esc, money, fdate, icon, confirmCopy, highlight, download, periodControls, bindPeriodControls, syncPeriodControls, refreshPeriod, freshRoot, debounce, setDateValue, equationHtml, api, toast, showError, confirmDialog, setPageActions, densityToggle, bindDensity } from '../ui.js';
import { S, saveFilter, draftLedgerRows, vouchers } from '../state.js';
import { comboHtml, bindCombo, filterBox } from '../combo.js';
import { openEntryForm, deleteEntry } from '../forms.js';
import { printView, printVoucher } from '../print.js';
import { clipHtml, openAttachList } from '../attach.js';
import { moKyKhoa } from '../khoa.js';

const KT = window.KT;
const PAGE = 500; // số dòng vẽ mỗi lần (bảng lớn vẽ chậm); bấm "Hiện thêm" để xem tiếp, in thì hiện hết
let shown = PAGE;
let countHtml = '';
let visibleIds = [];
const sel = new Set(); // các dòng đang chọn (ô tích) để ghi sổ / xóa hàng loạt
// về lại số dòng mặc định khi chuyển màn hình (vẽ lại sau khi sửa dữ liệu thì giữ nguyên số dòng đang hiện)
window.addEventListener('hashchange', () => { shown = PAGE; sel.clear(); });

// Nhân bản dòng sổ: hỏi trước; đồng ý thì mở biểu mẫu Ghi thu / chi đã điền sẵn dữ liệu (chưa lưu)
async function nhanBanDong(en) {
  const sup = S.db.suppliers.find((x) => KT.keyOf(x.ma) === KT.keyOf(en.maNCC));
  const ok = await confirmCopy('dòng sổ thu chi', '<b>' + fdate(en.ngay) + '</b>' + (en.soPhieu ? ' · ' + esc(en.soPhieu) : '') + (en.maNCC ? ' · ' + esc(sup ? sup.ten : en.maNCC) : '') +
    '<br>' + esc(en.noiDung || '') + '<br>' + (en.chi ? 'Chi <b>' + money(en.chi) + ' đ</b>' : '') + (en.chi && en.thu ? ' · ' : '') + (en.thu ? 'Thu <b>' + money(en.thu) + ' đ</b>' : ''));
  if (ok) openEntryForm(en, { duplicate: true });
}

function exportQuery(f) {
  const p = { from: f.from, to: f.to, duAn: f.duAn, ncc: f.ncc, loai: f.loai, q: f.q };
  return Object.keys(p).filter((k) => p[k]).map((k) => k + '=' + encodeURIComponent(p[k])).join('&');
}

export function renderLedger(root) {
  root = freshRoot(root);
  const f = refreshPeriod(S.filters.so);
  // ô gõ tìm thay cho danh sách chọn (xem combo.js)
  const cbDa = { id: 'so-duan', list: S.db.projects, value: f.duAn, none: '(Chưa gán công trình)', noun: 'công trình', placeholder: 'Tất cả', label: 'Lọc theo công trình' };
  const cbNcc = { id: 'so-ncc', list: S.db.suppliers.map((x) => ({ ma: x.ma, ten: x.ten, sub: x.loai })), value: f.ncc, none: '(Chưa gán NCC)', noun: 'nhà cung cấp',
    placeholder: 'Tất cả', label: 'Lọc theo nhà cung cấp' };

  setPageActions('<button type="button" class="btn btn-secondary" data-act="print">' + icon('print') + 'In sổ</button>' +
    '<button type="button" class="btn btn-secondary" data-act="export">' + icon('excel') + 'Xuất Excel theo bộ lọc</button>', (act) => {
    if (act === 'export') download('/api/export/ledger?' + exportQuery(f));
    else if (act === 'print') { shown = Infinity; draw(true); printView('SỔ THU CHI VÀ TỒN QUỸ', KT.describeRange(f.from, f.to), S.db.settings); }
  });
  root.innerHTML =
    '<div class="print-only" id="print-head"></div>' +
    '<div class="no-print flex flex-wrap items-center gap-2.5">' +
    periodControls(f, 'so') +
    filterBox('Công trình', cbDa) + filterBox('NCC', cbNcc) +
    '<div class="seg" role="radiogroup" aria-label="Loại">' +
    [['', 'Thu và chi'], ['thu', 'Thu'], ['chi', 'Chi']].map(([v, l]) => '<label class="seg-item"><input type="radio" name="so-loai" value="' + v + '"' + ((f.loai || '') === v ? ' checked' : '') + '><span>' + l + '</span></label>').join('') +
    '</div></div>' +
    '<div class="no-print flex flex-wrap items-center gap-2.5">' +
    '<div class="seg" role="radiogroup" aria-label="Trạng thái">' +
    [['', 'Mọi trạng thái'], ['so', 'Đã ghi sổ'], ['nhap', 'Nháp (' + S.drafts.entries.length + ')']].map(([v, l]) => '<label class="seg-item"><input type="radio" name="so-tt" value="' + v + '"' + ((f.trangThai || '') === v ? ' checked' : '') + '><span>' + l + '</span></label>').join('') +
    '</div>' +
    '<label class="search min-w-[260px] flex-1">' + icon('search') + '<input id="so-q" type="search" class="input" placeholder="Tìm nội dung, số phiếu, số tiền" value="' + esc(f.q) + '" aria-label="Tìm trong sổ"></label>' +
    densityToggle() +
    '<button type="button" class="btn btn-ghost btn-sm" data-act="clear" id="so-clear">' + icon('eraser') + 'Bỏ lọc</button>' +
    '</div>' +
    '<div id="so-summary"></div>' +
    '<div id="so-bulk" class="no-print"></div>' +
    '<div id="so-cards" class="flex flex-col gap-2.5 md:hidden"></div>' +
    '<section class="sheet overflow-hidden max-md:hidden">' +
    '<div class="table-scroll scroll-x max-h-[calc(100vh-360px)] min-h-[260px] overflow-auto" id="so-wrap"><table class="ledger">' +
    '<thead><tr><th class="no-print w-8"><input type="checkbox" id="so-all" aria-label="Chọn tất cả các dòng đang hiện"></th><th class="num">STT</th><th>Ngày</th><th>Số phiếu</th><th>Công trình</th><th>NCC, đối tượng</th><th>Nội dung, ghi chú</th>' +
    '<th class="num money">Thu</th><th class="num money">Chi</th><th class="num money">Tồn quỹ</th><th class="no-print"><span class="sr-only">Thao tác</span></th></tr></thead>' +
    '<tbody id="so-body"></tbody><tfoot id="so-foot"></tfoot></table></div>' +
    '</section>';

  bindDensity(root);
  const draw = (keep) => { if (keep !== true) shown = PAGE; drawRows(root, f); };
  const syncInputs = () => {
    syncPeriodControls(root, f, 'so');
  };
  bindPeriodControls(root, f, 'so', () => { saveFilter('so'); syncInputs(); draw(); });
  bindCombo($('#so-duan', root), cbDa, (v) => { f.duAn = v; saveFilter('so'); draw(); });
  bindCombo($('#so-ncc', root), cbNcc, (v) => { f.ncc = v; saveFilter('so'); draw(); });
  root.querySelectorAll('input[name=so-loai]').forEach((r) => r.addEventListener('change', () => { f.loai = r.value; saveFilter('so'); draw(); }));
  root.querySelectorAll('input[name=so-tt]').forEach((r) => r.addEventListener('change', () => { f.trangThai = r.value; saveFilter('so'); draw(); }));
  $('#so-q', root).addEventListener('input', debounce((e) => { f.q = e.target.value; saveFilter('so'); draw(); }, 150));

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    const tr = a.closest('tr[data-id], .crow[data-id]');
    const entry = tr ? S.all.entries.find((x) => x.id === Number(tr.dataset.id)) : null;
    if (act === 'toggle-card') { const c = a.closest('.crow'); const x = c.querySelector('.cr-actions'); x.hidden = !x.hidden; a.setAttribute('aria-expanded', String(!x.hidden)); return; }
    if (act === 'clear') {
      Object.assign(f, { period: 'tat-ca', from: '', to: '', rel: false, duAn: '', ncc: '', loai: '', q: '', trangThai: '' });
      saveFilter('so');
      renderLedger(root);
    } else if (act === 'export') download('/api/export/ledger?' + exportQuery(f));
    else if (act === 'print') { shown = Infinity; draw(true); printView('SỔ THU CHI VÀ TỒN QUỸ', KT.describeRange(f.from, f.to), S.db.settings); }
    else if (act === 'more') { shown += PAGE; draw(true); }
    else if (act === 'all') { shown = Infinity; draw(true); }
    else if (act === 'edit' && entry) openEntryForm(entry);
    else if (act === 'dup' && entry) nhanBanDong(entry);
    else if (act === 'del' && entry) deleteEntry(entry);
    else if (act === 'clip' && entry) openAttachList('entries', entry.id, 'Chứng từ của dòng sổ');
    else if (act === 'locked' && entry) moKyKhoa(entry.ngay, 'sửa');
    else if (act === 'post' && entry) {
      api('POST', '/api/entries/post', { ids: [entry.id] }).then(() => toast('Đã ghi sổ dòng nháp, đã tính vào tồn quỹ')).catch(showError);
    }
    else if (act === 'print-voucher' && entry && entry.soPhieu) {
      const v = vouchers().find((x) => x.key === KT.voucherKey(entry.soPhieu));
      if (v) printVoucher(v, S.db.settings); else toast('Dòng này chưa có số phiếu để in', 'info');
    }
    else if (act === 'bulk-post') {
      const ids = Array.from(sel).filter((id) => S.all.entries.some((x) => x.id === id && KT.isDraft(x)));
      if (ids.length) api('POST', '/api/entries/post', { ids }).then(() => { sel.clear(); toast('Đã ghi sổ ' + ids.length + ' dòng nháp, đã tính vào tồn quỹ'); }).catch(showError);
    }
    else if (act === 'bulk-del') bulkDelete();
    else if (act === 'bulk-clear') { sel.clear(); draw(true); }
    else if (act === 'voucher') {
      e.preventDefault();
      S.selectedVoucher = KT.voucherKey(a.dataset.so);
      location.hash = '#/phieu';
    }
  });
  async function bulkDelete() {
    const list = S.all.entries.filter((x) => sel.has(x.id));
    if (!list.length) return;
    if (!(await confirmDialog({ trash: true, title: 'Xóa ' + list.length + ' dòng sổ thu chi', html: 'Xóa <b class="text-ink">' + list.length + '</b> dòng đã chọn (tổng ' + money(list.reduce((t, x) => t + (x.thu || 0) + (x.chi || 0), 0)) + ' đ)?<p class="mt-2 text-[13px] text-ink-3">Tồn quỹ các dòng sau tự tính lại.</p>', okText: 'Xóa ' + list.length + ' dòng', danger: true }))) return;
    let n = 0;
    for (const x of list) { try { await api('DELETE', '/api/entries/' + x.id); sel.delete(x.id); n++; } catch (err) { showError(err); break; } }
    if (n) toast('Đã xóa ' + n + ' dòng, chuyển vào Thùng rác');
  }
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'so-all') { root.querySelectorAll('input[data-sel]').forEach((c) => { c.checked = t.checked; t.checked ? sel.add(Number(c.dataset.sel)) : sel.delete(Number(c.dataset.sel)); }); drawBulk(root); }
    else if (t.dataset && t.dataset.sel) { t.checked ? sel.add(Number(t.dataset.sel)) : sel.delete(Number(t.dataset.sel)); drawBulk(root); }
  });
  // Bàn phím trên dòng đang chọn (Tab tới dòng): Enter sửa · Ctrl D nhân bản · Delete xóa · Ctrl P in phiếu
  root.addEventListener('keydown', (e) => {
    const tr = e.target.matches && e.target.matches('tr[data-id]') ? e.target : null;
    if (!tr) return;
    const en = S.all.entries.find((x) => x.id === Number(tr.dataset.id));
    if (!en) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === 'Enter' && !ctrl) { e.preventDefault(); if (KT.isLockedDate(S.all, en.ngay)) moKyKhoa(en.ngay, 'sửa'); else openEntryForm(en); }
    else if (ctrl && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); nhanBanDong(en); }
    else if (e.key === 'Delete') { e.preventDefault(); if (KT.isLockedDate(S.all, en.ngay)) moKyKhoa(en.ngay, 'xóa'); else deleteEntry(en); }
    else if (ctrl && (e.key === 'p' || e.key === 'P') && en.soPhieu) { e.preventDefault(); const v = vouchers().find((x) => x.key === KT.voucherKey(en.soPhieu)); if (v) printVoucher(v, S.db.settings); }
  });
  root.addEventListener('dblclick', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr || e.target.closest('button, a')) return;
    const entry = S.all.entries.find((x) => x.id === Number(tr.dataset.id));
    if (entry) openEntryForm(entry);
  });
  draw();
}

function drawRows(root, f) {
  const res = KT.filterLedger(S.ledger, f);
  const filtered = !!(f.duAn || f.ncc || f.loai || f.q);
  $('#so-summary', root).innerHTML = equationHtml({
    filtered,
    dau: res.tonDauKy,
    thu: res.tongThu,
    chi: res.tongChi,
    cuoi: res.tonCuoiKy,
    dauLabel: f.from ? 'Tồn quỹ trước ngày ' + fdate(f.from) : 'Tồn quỹ đầu sổ',
    cuoiLabel: f.to ? 'Tồn quỹ đến ngày ' + fdate(f.to) : 'Tồn quỹ hiện tại'
  });
  // Dòng Nháp: hiện xen trong sổ (có nhãn Nháp) nhưng không cộng vào tồn quỹ và các tổng
  const drafts = f.trangThai === 'so' ? [] : KT.filterLedger(draftLedgerRows(), f).rows;
  const posted = f.trangThai === 'nhap' ? [] : res.rows;
  const list = drafts.length ? posted.concat(drafts).sort(KT.compareEntries) : posted;
  countHtml = '<b class="font-bold text-ink">' + posted.length + '</b> dòng' +
    (filtered || f.from || f.to ? ' khớp bộ lọc, trong tổng số ' + S.ledger.length + ' dòng' : ' trong sổ') +
    (drafts.length ? ', <b class="font-bold text-caution">' + drafts.length + ' dòng nháp</b> chưa tính vào tồn quỹ' : '') +
    '. Bấm đúp một dòng để sửa.';
  visibleIds = list.map((x) => x.id);
  $('#so-clear', root).hidden = !(filtered || f.from || f.to || f.trangThai);

  const res2 = { rows: list };
  const rows = res2.rows.length > shown ? res2.rows.slice(-shown) : res2.rows;
  const body = $('#so-body', root);
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="11" class="empty">' + (S.ledger.length
      ? 'Không có dòng nào khớp bộ lọc. Thử bỏ bớt điều kiện lọc.'
      : 'Sổ chưa có dòng nào. Bấm “Ghi thu / chi” để ghi khoản đầu tiên, hoặc nhập từ file Excel (mục Nhập từ Excel).') +
      (S.ledger.length ? ' <button type="button" class="btn btn-secondary btn-sm ml-2" data-act="clear">Xóa lọc</button>' : '') + '</td></tr>';
  } else {
    body.innerHTML = (res2.rows.length > rows.length ? '<tr><td colspan="11" class="text-[12.5px] text-ink-3">Đang hiện ' + rows.length + ' dòng gần nhất trong ' + res2.rows.length + ' dòng. ' +
      '<button type="button" class="btn btn-ghost btn-sm no-print" data-act="more">Hiện thêm ' + Math.min(PAGE, res2.rows.length - rows.length) + ' dòng cũ hơn</button>' +
      '<button type="button" class="btn btn-ghost btn-sm no-print" data-act="all">Hiện tất cả</button><span class="no-print"> Hoặc lọc theo kỳ để thu hẹp.</span></td></tr>' : '') +
      rows.map((r) => rowHtml(r, f.q)).join('');
    // dòng vừa ghi / vừa sửa: cuộn tới để người dùng thấy ngay
    const fl = body.querySelector('tr.flash');
    if (fl) fl.scrollIntoView({ block: 'nearest' });
  }
  $('#so-foot', root).innerHTML = res.rows.length
    ? '<tr><td colspan="7" class="text-right">Cộng phát sinh · ' + res.rows.length + ' dòng' + (drafts.length ? ' (' + drafts.length + ' nháp)' : '') + '</td><td class="num money thu"><span class="dbl">' + money(res.tongThu) + '</span></td>' +
      '<td class="num money"><span class="dbl">' + money(res.tongChi) + '</span></td><td class="num money' + (res.tonCuoiKy < 0 ? ' neg' : '') + '">' + money(res.tonCuoiKy) + '</td><td class="no-print"></td></tr>'
    : '';
  drawBulk(root);
  if (window.matchMedia('(max-width: 767px)').matches) drawCards(root, list.slice(-shown).reverse());
}

// Điện thoại: mỗi dòng sổ là một thẻ; bấm thẻ để mở các nút Ghi sổ · Sửa · Nhân bản · Xóa (48px)
function drawCards(root, rows) {
  const box = $('#so-cards', root);
  if (!box) return;
  const hint = '<p class="text-[12px] text-ink-3">Bấm vào một dòng để Ghi sổ, Sửa, Nhân bản, Xóa.</p>';
  box.innerHTML = hint + (rows.length ? rows.slice(0, 200).map((r) => {
    const nhap = KT.isDraft(r);
    const lock = KT.isLockedDate(S.all, r.ngay);
    return '<div class="crow' + (nhap ? ' draft' : '') + '" data-id="' + r.id + '"><button type="button" class="cr-main" data-act="toggle-card" aria-expanded="false">' +
      '<span class="cr-date tabular-nums">' + esc(fdate(r.ngay).slice(0, 5)) + '</span><span class="cr-body"><b>' + esc(r.noiDung || 'Không có nội dung') + '</b>' +
      '<small>' + (nhap ? 'Nháp · ' : '') + esc([r.soPhieu, r.maDuAn].filter(Boolean).join(' · ')) + '</small></span>' +
      '<b class="cr-amt ' + (r.chi > 0 ? '' : 'text-income') + '">' + (r.chi > 0 ? '−' + money(r.chi) : '+' + money(r.thu)) + '</b>' + icon('caret', 'text-ink-3') + '</button>' +
      '<div class="cr-actions" hidden>' + (nhap ? '<button type="button" data-act="post" class="text-income">' + icon('check') + 'Ghi sổ</button>' : '<span></span>') +
      (lock ? '<button type="button" data-act="locked">' + icon('lock') + 'Đã khóa</button>' : '<button type="button" data-act="edit">' + icon('edit') + 'Sửa</button>') +
      '<button type="button" data-act="dup">' + icon('copy') + 'Nhân bản</button>' +
      (lock ? '<span></span>' : '<button type="button" data-act="del" class="text-alert">' + icon('trash') + 'Xóa</button>') + '</div></div>';
  }).join('') : '<p class="py-8 text-center text-ink-3">Không có dòng nào khớp.</p>');
}

// Thanh trên bảng: số dòng; khi có dòng được chọn thì thành thanh thao tác hàng loạt (Ghi sổ các dòng nháp, Xóa, Bỏ chọn)
function drawBulk(root) {
  const el = $('#so-bulk', root);
  if (!el) return;
  const ids = Array.from(sel).filter((id) => visibleIds.includes(id));
  sel.forEach((id) => { if (!visibleIds.includes(id)) sel.delete(id); });
  const all = $('#so-all', root);
  if (all) { all.checked = !!visibleIds.length && ids.length === visibleIds.length; all.indeterminate = ids.length > 0 && ids.length < visibleIds.length; }
  if (!ids.length) { el.innerHTML = '<p class="text-[12.5px] text-ink-2" id="so-count" aria-live="polite">' + countHtml + '</p>'; return; }
  const rows = S.all.entries.filter((x) => sel.has(x.id));
  const nhap = rows.filter((x) => KT.isDraft(x));
  const tong = rows.reduce((t, x) => t + (x.thu || 0) + (x.chi || 0), 0);
  el.innerHTML = '<div class="mk flex flex-wrap items-center gap-3 border border-rule bg-accent-100 px-3 py-1.5 text-[12.5px]" role="status">' + icon('check', 'text-pen') +
    '<b class="font-bold">Đã chọn ' + rows.length + ' dòng' + (nhap.length ? ' (' + nhap.length + ' nháp)' : '') + ' · ' + money(tong) + ' đ</b>' +
    (nhap.length ? '<span class="text-ink-2">Dòng nháp chưa tính vào tồn quỹ.</span>' : '') + '<span class="flex-1"></span>' +
    (nhap.length ? '<button type="button" class="btn btn-secondary btn-sm !border-pen !text-accent-800" data-act="bulk-post">' + icon('check') + 'Ghi sổ ' + nhap.length + ' dòng nháp</button>' : '') +
    '<button type="button" class="btn btn-secondary btn-sm !border-alert !text-alert" data-act="bulk-del">' + icon('trash') + 'Xóa ' + rows.length + ' dòng</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" data-act="bulk-clear">Bỏ chọn</button></div>';
}

function rowHtml(r, q) {
  const extra = [];
  if (r.maVT) {
    const vt = S.db.materials.find((x) => KT.keyOf(x.ma) === KT.keyOf(r.maVT));
    extra.push('<span>Vật tư: <span class="text-ink-2">' + highlight(r.maVT + (vt ? ' – ' + vt.ten : ''), q) + '</span></span>');
  }
  if (r.nguoiNhan) extra.push('<span>Người nhận: <span class="text-ink-2">' + highlight(r.nguoiNhan, q) + '</span></span>');
  if (r.ghiChu) extra.push('<span>Ghi chú: <span class="text-ink-2">' + highlight(r.ghiChu, q) + '</span></span>');
  const nhap = KT.isDraft(r);
  const cls = [S.flash.has('entries:' + r.id) ? 'flash' : '', nhap ? 'draft' : ''].filter(Boolean).join(' ');
  return '<tr data-id="' + r.id + '" tabindex="0"' + (cls ? ' class="' + cls + '"' : '') + '>' +
    '<td class="no-print"><input type="checkbox" data-sel="' + r.id + '"' + (sel.has(r.id) ? ' checked' : '') + ' aria-label="Chọn dòng ' + r.stt + '"></td>' +
    '<td class="num text-ink-3">' + (nhap ? '<span class="chip chip-draft" title="Nháp: chưa ghi sổ, chưa tính vào tồn quỹ và báo cáo">' + icon('draft') + 'Nháp</span>' : r.stt) + '</td>' +
    '<td class="whitespace-nowrap">' + fdate(r.ngay) + '</td>' +
    '<td class="whitespace-nowrap">' + (r.soPhieu ? '<a href="#" class="font-semibold text-pen hover:underline" data-act="voucher" data-so="' + esc(r.soPhieu) + '" title="Xem và in phiếu">' + highlight(r.soPhieu, q) + '</a>' : '') + '</td>' +
    '<td class="whitespace-nowrap">' + projectCell(r, q) + '</td>' +
    '<td>' + supplierCell(r, q) + '</td>' +
    '<td class="wrap-text">' + highlight(r.noiDung, q) + clipHtml('entries', r.id) +
    (extra.length ? '<div class="mt-0.5 flex flex-wrap gap-x-3 text-[12.5px] text-ink-3">' + extra.join('') + '</div>' : '') + '</td>' +
    '<td class="num money thu">' + (r.thu ? highlight(money(r.thu), q) : '') + '</td>' +
    '<td class="num money">' + (r.chi ? highlight(money(r.chi), q) : '') + '</td>' +
    '<td class="num money font-medium' + (r.ton < 0 ? ' neg' : '') + '">' + (nhap ? '<span class="text-ink-3" title="Dòng nháp không tính vào tồn quỹ">—</span>' : money(r.ton)) + '</td>' +
    '<td class="actions no-print">' +
    (nhap ? '<button type="button" class="icon-btn" data-act="post" title="Ghi sổ dòng nháp này" aria-label="Ghi sổ dòng nháp">' + icon('check') + '</button>' : '') +
    (KT.isLockedDate(S.all, r.ngay) ? '<button type="button" class="icon-btn" data-act="locked" title="' + esc(KT.lockMessage(KT.monthOf(r.ngay), 'sửa')) + '" aria-label="Tháng đã khóa sổ">' + icon('lock') + '</button>' +
      '<button type="button" class="icon-btn" data-act="dup" title="Nhân bản (đổi sang ngày chưa khóa)" aria-label="Nhân bản dòng ' + r.stt + '">' + icon('copy') + '</button>' :
      '<button type="button" class="icon-btn" data-act="edit" title="Sửa" aria-label="Sửa dòng ' + r.stt + '">' + icon('edit') + '</button>' +
      '<button type="button" class="icon-btn" data-act="dup" title="Nhân bản" aria-label="Nhân bản dòng ' + r.stt + '">' + icon('copy') + '</button>' +
      '<button type="button" class="icon-btn" data-act="print-voucher"' + (r.soPhieu ? '' : ' disabled') + ' title="' + (r.soPhieu ? 'In phiếu ' + esc(r.soPhieu) : 'Dòng chưa có số phiếu') + '" aria-label="In phiếu của dòng ' + r.stt + '">' + icon('print') + '</button>' +
      '<button type="button" class="icon-btn danger" data-act="del" title="Xóa" aria-label="Xóa dòng ' + r.stt + '">' + icon('trash') + '</button>') +
    '</td></tr>';
}

// Công trình: hiện mã (ngắn, kế toán quen dùng); tên đầy đủ khi rê chuột
function projectCell(r, q) {
  if (!r.maDuAn) return '';
  if (!r.duAnHopLe) return '<span class="code bad" title="Mã chưa có trong danh mục công trình">' + highlight(r.maDuAn, q) + '</span>';
  return '<span class="code" title="' + esc(r.tenDuAn) + '">' + highlight(r.maDuAn, q) + '</span>';
}

// Nhà cung cấp: hiện tên cho dễ đọc; mã khi rê chuột
function supplierCell(r, q) {
  if (!r.maNCC) return '';
  if (!r.nccHopLe) return '<span class="code bad" title="Mã chưa có trong danh mục nhà cung cấp">' + highlight(r.maNCC, q) + '</span>';
  return '<span class="block max-w-[180px] truncate" title="' + esc(r.maNCC) + '">' + highlight(r.tenNCC || r.maNCC, q) + '</span>';
}
