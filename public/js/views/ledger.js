/* Sổ thu chi & tồn quỹ hàng ngày. */
import { $, esc, money, fdate, icon, highlight, download, periodControls, bindPeriodControls, refreshPeriod, freshRoot, debounce, setDateValue, equationHtml } from '../ui.js';
import { S, saveFilter, projectOptions, supplierOptions } from '../state.js';
import { openEntryForm, deleteEntry } from '../forms.js';
import { printView } from '../print.js';

const KT = window.KT;
const PAGE = 500; // số dòng vẽ mỗi lần (bảng lớn vẽ chậm); bấm "Hiện thêm" để xem tiếp, in thì hiện hết
let shown = PAGE;
// về lại số dòng mặc định khi chuyển màn hình (vẽ lại sau khi sửa dữ liệu thì giữ nguyên số dòng đang hiện)
window.addEventListener('hashchange', () => { shown = PAGE; });

function exportQuery(f) {
  const p = { from: f.from, to: f.to, duAn: f.duAn, ncc: f.ncc, loai: f.loai, q: f.q };
  return Object.keys(p).filter((k) => p[k]).map((k) => k + '=' + encodeURIComponent(p[k])).join('&');
}

export function renderLedger(root) {
  root = freshRoot(root);
  const f = refreshPeriod(S.filters.so);

  root.innerHTML =
    '<div class="print-only" id="print-head"></div>' +
    '<div class="no-print flex flex-wrap items-center gap-2">' +
    periodControls(f, 'so') +
    '<label class="sr-only" for="so-duan">Dự án</label><select id="so-duan" class="input w-auto max-w-[230px]">' + projectOptions(f.duAn, { withNone: true }) + '</select>' +
    '<label class="sr-only" for="so-ncc">Nhà cung cấp</label><select id="so-ncc" class="input w-auto max-w-[230px]">' + supplierOptions(f.ncc, { withNone: true, allLabel: 'Tất cả nhà cung cấp' }) + '</select>' +
    '<div class="seg seg-sm" role="radiogroup" aria-label="Loại">' +
    [['', 'Thu và chi'], ['thu', 'Thu'], ['chi', 'Chi']].map(([v, l]) => '<label class="seg-item"><input type="radio" name="so-loai" value="' + v + '"' + ((f.loai || '') === v ? ' checked' : '') + '><span>' + l + '</span></label>').join('') +
    '</div>' +
    '<label class="search min-w-[240px] flex-1">' + icon('search') + '<input id="so-q" type="search" class="input" placeholder="Tìm nội dung, số phiếu, số tiền" value="' + esc(f.q) + '" aria-label="Tìm trong sổ"></label>' +
    '<button type="button" class="btn btn-ghost btn-sm" data-act="clear" id="so-clear">' + icon('eraser') + 'Bỏ lọc</button>' +
    '</div>' +
    '<div id="so-summary"></div>' +
    '<section class="sheet overflow-hidden">' +
    '<div class="no-print flex flex-wrap items-center gap-3 border-b border-rule px-4 py-2.5">' +
    '<p class="text-[13px] text-ink-2" id="so-count" aria-live="polite"></p><span class="flex-1"></span>' +
    '<button type="button" class="btn btn-ghost btn-sm" data-act="print">' + icon('print') + 'In sổ</button>' +
    '<button type="button" class="btn btn-secondary btn-sm" data-act="export">' + icon('excel') + 'Xuất Excel theo bộ lọc</button>' +
    '</div>' +
    '<div class="table-scroll scroll-x max-h-[calc(100vh-300px)] min-h-[260px] overflow-auto" id="so-wrap"><table class="ledger">' +
    '<thead><tr><th class="num">STT</th><th>Ngày</th><th>Số phiếu</th><th>Dự án</th><th>Nhà cung cấp, đối tượng</th><th>Nội dung, người nhận, ghi chú</th>' +
    '<th class="num money">Thu</th><th class="num money">Chi</th><th class="num money">Tồn quỹ</th><th class="no-print"><span class="sr-only">Thao tác</span></th></tr></thead>' +
    '<tbody id="so-body"></tbody><tfoot id="so-foot"></tfoot></table></div>' +
    '</section>';

  const draw = (keep) => { if (keep !== true) shown = PAGE; drawRows(root, f); };
  const syncInputs = () => {
    $('#so-period', root).value = f.period || 'tat-ca';
    setDateValue($('#so-from', root), f.from || '', true);
    setDateValue($('#so-to', root), f.to || '', true);
  };
  bindPeriodControls(root, f, 'so', () => { saveFilter('so'); syncInputs(); draw(); });
  $('#so-duan', root).addEventListener('change', (e) => { f.duAn = e.target.value; saveFilter('so'); draw(); });
  $('#so-ncc', root).addEventListener('change', (e) => { f.ncc = e.target.value; saveFilter('so'); draw(); });
  root.querySelectorAll('input[name=so-loai]').forEach((r) => r.addEventListener('change', () => { f.loai = r.value; saveFilter('so'); draw(); }));
  $('#so-q', root).addEventListener('input', debounce((e) => { f.q = e.target.value; saveFilter('so'); draw(); }, 150));

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    const tr = a.closest('tr[data-id]');
    const entry = tr ? S.db.entries.find((x) => x.id === Number(tr.dataset.id)) : null;
    if (act === 'clear') {
      Object.assign(f, { period: 'tat-ca', from: '', to: '', duAn: '', ncc: '', loai: '', q: '' });
      saveFilter('so');
      renderLedger(root);
    } else if (act === 'export') download('/api/export/ledger?' + exportQuery(f));
    else if (act === 'print') { shown = Infinity; draw(true); printView('SỔ THU CHI VÀ TỒN QUỸ', KT.describeRange(f.from, f.to), S.db.settings); }
    else if (act === 'more') { shown += PAGE; draw(true); }
    else if (act === 'all') { shown = Infinity; draw(true); }
    else if (act === 'edit' && entry) openEntryForm(entry);
    else if (act === 'dup' && entry) openEntryForm(entry, { duplicate: true });
    else if (act === 'del' && entry) deleteEntry(entry);
    else if (act === 'voucher') {
      e.preventDefault();
      S.selectedVoucher = KT.voucherKey(a.dataset.so);
      location.hash = '#/phieu';
    }
  });
  root.addEventListener('dblclick', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr || e.target.closest('button, a')) return;
    const entry = S.db.entries.find((x) => x.id === Number(tr.dataset.id));
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
  $('#so-count', root).innerHTML = '<b class="font-semibold text-ink">' + res.rows.length + '</b> dòng' +
    (filtered || f.from || f.to ? ' khớp bộ lọc, trong tổng số ' + S.ledger.length + ' dòng' : ' trong sổ') +
    '. Bấm đúp một dòng để sửa.';
  $('#so-clear', root).hidden = !(filtered || f.from || f.to);

  const rows = res.rows.length > shown ? res.rows.slice(-shown) : res.rows;
  const body = $('#so-body', root);
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="10" class="empty">' + (S.ledger.length
      ? 'Không có dòng nào khớp bộ lọc. Thử bỏ bớt điều kiện lọc.'
      : 'Sổ chưa có dòng nào. Bấm “Ghi thu / chi” để ghi khoản đầu tiên, hoặc nhập từ file Excel trong Cài đặt.') + '</td></tr>';
  } else {
    body.innerHTML = (res.rows.length > rows.length ? '<tr><td colspan="10" class="text-[12.5px] text-ink-3">Đang hiện ' + rows.length + ' dòng gần nhất trong ' + res.rows.length + ' dòng. ' +
      '<button type="button" class="btn btn-ghost btn-sm no-print" data-act="more">Hiện thêm ' + Math.min(PAGE, res.rows.length - rows.length) + ' dòng cũ hơn</button>' +
      '<button type="button" class="btn btn-ghost btn-sm no-print" data-act="all">Hiện tất cả</button><span class="no-print"> Hoặc lọc theo kỳ để thu hẹp.</span></td></tr>' : '') +
      rows.map((r) => rowHtml(r, f.q)).join('');
    // dòng vừa ghi / vừa sửa: cuộn tới để người dùng thấy ngay
    const fl = body.querySelector('tr.flash');
    if (fl) fl.scrollIntoView({ block: 'nearest' });
  }
  $('#so-foot', root).innerHTML = res.rows.length
    ? '<tr><td colspan="6" class="text-right">Cộng phát sinh</td><td class="num money thu"><span class="dbl">' + money(res.tongThu) + '</span></td>' +
      '<td class="num money"><span class="dbl">' + money(res.tongChi) + '</span></td><td class="num money' + (res.tonCuoiKy < 0 ? ' neg' : '') + '">' + money(res.tonCuoiKy) + '</td><td class="no-print"></td></tr>'
    : '';
}

function rowHtml(r, q) {
  const extra = [];
  if (r.nguoiNhan) extra.push('<span>Người nhận: <span class="text-ink-2">' + highlight(r.nguoiNhan, q) + '</span></span>');
  if (r.ghiChu) extra.push('<span>Ghi chú: <span class="text-ink-2">' + highlight(r.ghiChu, q) + '</span></span>');
  return '<tr data-id="' + r.id + '"' + (S.flash.has('entries:' + r.id) ? ' class="flash"' : '') + '>' +
    '<td class="num text-ink-3">' + r.stt + '</td>' +
    '<td class="whitespace-nowrap">' + fdate(r.ngay) + '</td>' +
    '<td class="whitespace-nowrap">' + (r.soPhieu ? '<a href="#" class="font-semibold text-pen hover:underline" data-act="voucher" data-so="' + esc(r.soPhieu) + '" title="Xem và in phiếu">' + highlight(r.soPhieu, q) + '</a>' : '') + '</td>' +
    '<td class="whitespace-nowrap">' + projectCell(r, q) + '</td>' +
    '<td>' + supplierCell(r, q) + '</td>' +
    '<td class="wrap-text">' + highlight(r.noiDung, q) +
    (extra.length ? '<div class="mt-0.5 flex flex-wrap gap-x-3 text-[12.5px] text-ink-3">' + extra.join('') + '</div>' : '') + '</td>' +
    '<td class="num money thu">' + (r.thu ? highlight(money(r.thu), q) : '') + '</td>' +
    '<td class="num money">' + (r.chi ? highlight(money(r.chi), q) : '') + '</td>' +
    '<td class="num money font-medium' + (r.ton < 0 ? ' neg' : '') + '">' + money(r.ton) + '</td>' +
    '<td class="actions no-print">' +
    '<button type="button" class="icon-btn" data-act="edit" title="Sửa" aria-label="Sửa dòng ' + r.stt + '">' + icon('edit') + '</button>' +
    '<button type="button" class="icon-btn" data-act="dup" title="Nhân bản" aria-label="Nhân bản dòng ' + r.stt + '">' + icon('copy') + '</button>' +
    '<button type="button" class="icon-btn danger" data-act="del" title="Xóa" aria-label="Xóa dòng ' + r.stt + '">' + icon('trash') + '</button>' +
    '</td></tr>';
}

// Dự án: hiện mã (ngắn, kế toán quen dùng); tên đầy đủ khi rê chuột
function projectCell(r, q) {
  if (!r.maDuAn) return '';
  if (!r.duAnHopLe) return '<span class="code bad" title="Mã chưa có trong danh mục dự án">' + highlight(r.maDuAn, q) + '</span>';
  return '<span class="code" title="' + esc(r.tenDuAn) + '">' + highlight(r.maDuAn, q) + '</span>';
}

// Nhà cung cấp: hiện tên cho dễ đọc; mã khi rê chuột
function supplierCell(r, q) {
  if (!r.maNCC) return '';
  if (!r.nccHopLe) return '<span class="code bad" title="Mã chưa có trong danh mục nhà cung cấp">' + highlight(r.maNCC, q) + '</span>';
  return '<span class="block max-w-[180px] truncate" title="' + esc(r.maNCC) + '">' + highlight(r.tenNCC || r.maNCC, q) + '</span>';
}
