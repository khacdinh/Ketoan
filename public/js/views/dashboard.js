/* Tổng quan: tồn quỹ, nhịp tồn quỹ theo ngày, chi phí theo dự án. */
import { $, esc, money, fdate, fmtShort, icon, download, periodControls, bindPeriodControls, refreshPeriod, freshRoot, equationHtml, setPageActions } from '../ui.js';
import { S, saveFilter, vouchers, anomalies } from '../state.js';
import { printView } from '../print.js';

const KT = window.KT;
const dm = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');

// Nhãn tình trạng ngân sách: màu luôn đi kèm biểu tượng và chữ
export function statusChip(r) {
  const pct = (x) => (x * 100).toFixed(0) + '%';
  switch (r.status) {
    case 'over': return '<span class="chip chip-over" title="Vượt ' + money(-r.chenhLech) + ' đ">' + icon('x') + 'Vượt ' + pct(r.tiLe - 1) + '</span>';
    case 'near': return '<span class="chip chip-near">' + icon('warnTri') + 'Đã dùng ' + pct(r.tiLe) + '</span>';
    case 'ok': return '<span class="chip chip-ok">' + icon('check') + 'Trong ngân sách</span>';
    case 'none': return '<span class="chip chip-idle border border-rule">' + icon('info') + 'Chưa đặt ngân sách</span>';
    default: return '<span class="chip chip-idle">Chưa phát sinh</span>';
  }
}

function qs(obj) {
  return Object.keys(obj).filter((k) => obj[k]).map((k) => k + '=' + encodeURIComponent(obj[k])).join('&');
}

export function renderDashboard(root) {
  root = freshRoot(root);
  if (window.matchMedia('(max-width: 767px)').matches) return renderDashboardPhone(root);
  const f = refreshPeriod(S.filters.dash);
  const ps = KT.projectSummary(S.db, f);
  const L = KT.filterLedger(S.ledger, f);
  const multiDate = vouchers().filter((v) => v.nhieuNgay);

  setPageActions('<button type="button" class="btn btn-secondary" data-act="print">' + icon('print') + 'In</button>' +
    '<button type="button" class="btn btn-secondary" data-act="export">' + icon('excel') + 'Xuất Excel</button>', (act) => {
    if (act === 'export') download('/api/export/projects?' + qs({ from: f.from, to: f.to }));
    if (act === 'print') printView('TÌNH HÌNH QUỸ VÀ CHI PHÍ THEO DỰ ÁN', KT.describeRange(f.from, f.to), S.db.settings);
  });
  root.innerHTML =
    '<div class="print-only" id="print-head"></div>' +
    '<div class="no-print flex flex-wrap items-center gap-2.5">' + periodControls(f, 'dash') + '</div>' +
    equationHtml({ dau: L.tonDauKy, thu: L.tongThu, chi: L.tongChi, cuoi: L.tonCuoiKy, dauLabel: f.from ? 'Tồn quỹ ngày ' + fdate(f.from) : 'Tồn quỹ đầu sổ', cuoiLabel: f.to ? 'Tồn quỹ đến ngày ' + fdate(f.to) : 'Tồn quỹ hiện tại' }) +
    '<div class="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">' +
    '<div class="flex min-w-0 flex-col gap-5">' +
    '<section class="sheet px-4 pt-3 pb-3" aria-labelledby="h-nhip">' +
    '<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><div><h3 id="h-nhip" class="sheet-title">Thu, chi trong ngày · <span class="font-body text-[14px] font-normal">' + esc(f.from && f.to ? dm(f.from) + ' – ' + dm(f.to) : KT.describeRange(f.from, f.to)) + '</span></h3>' +
    '<p class="text-[12px] text-ink-3 screen-hint">Rê chuột lên cột để xem thu, chi và tồn quỹ từng ngày.</p></div>' +
    '<div class="flex items-center gap-4"><div class="flow-legend"><span><i class="sw sw-thu"></i>Thu</span><span><i class="sw sw-chi"></i>Chi</span></div>' +
    '<a href="#/so-thu-chi" class="btn btn-ghost btn-sm no-print">' + icon('book') + 'Mở sổ quỹ</a></div></div>' +
    '<div class="flow mt-2" id="flow"></div></section>' +
    '<section class="sheet overflow-hidden" aria-labelledby="h-duan">' +
    '<div class="sheet-head"><div><h3 id="h-duan" class="sheet-title">Chi phí theo dự án</h3>' +
    '<p class="sheet-note">Tổng chi trong kỳ so với ngân sách. Bấm một dòng để mở sổ của dự án đó.</p></div>' +
    '<div class="flex items-center gap-4 text-[12px] text-ink-2" aria-hidden="true">' +
    '<span class="flex items-center gap-1.5"><span class="inline-block h-1.5 w-5 bg-pen"></span>Đã chi</span>' +
    '<span class="flex items-center gap-1.5"><span class="inline-block h-3 w-0.5 bg-ink"></span>Ngân sách</span></div></div>' +
    projectTable(ps) +
    '</section></div>' +
    '<aside class="flex flex-col gap-5">' +
    costCard(f) +
    '<section class="sheet" aria-labelledby="h-chuy"><div class="sheet-head pb-1"><h3 id="h-chuy" class="sheet-title">Cần chú ý hôm nay</h3></div>' +
    '<div id="dash-anom" class="px-4" aria-live="polite"></div>' + alertsHtml(ps, multiDate) + '</section>' +
    '<section class="sheet" aria-labelledby="h-gan"><div class="sheet-head pb-1"><h3 id="h-gan" class="sheet-title">Ghi gần đây</h3>' +
    '<a href="#/so-thu-chi" class="btn btn-ghost btn-sm -mt-1 -mr-2 no-print">Mở sổ</a></div>' + recentHtml() + '</section>' +
    '</aside>' +
    '</div>';

  bindPeriodControls(root, f, 'dash', () => { saveFilter('dash'); renderDashboard(root); });
  // Việc cần xử lý (kiểm tra bất thường): tính sau khi vẽ để không làm chậm lúc mở Tổng quan
  setTimeout(() => {
    const box = $('#dash-anom', root);
    if (!box || !box.isConnected) return;
    const a = anomalies();
    const nhap = S.drafts.entries.length + new Set(S.drafts.costs.map((c) => c.phieuId)).size;
    const parts = [];
    if (a.open) {
      const top = Object.keys(a.counts).filter((k) => a.counts[k]).sort((x, y) => a.counts[y] - a.counts[x]).slice(0, 3)
        .map((k) => a.counts[k] + ' ' + KT.ANOMALY_TYPES[k].toLowerCase()).join(', ');
      parts.push(alertItem('text-caution', 'flag', '<b>' + a.open + ' việc cần xử lý</b> · ' + esc(top), '<a href="#/kiem-soat?tab=can-xu-ly" class="alert-go">Mở Kiểm soát</a>'));
    }
    if (nhap) parts.push(alertItem('text-neutral-800', 'draft', '<b>' + nhap + ' dòng / phiếu nháp</b> chưa ghi sổ, chưa tính vào số liệu', '<a href="#/so-thu-chi" class="alert-go" data-act="go-nhap">Xem nháp</a>'));
    box.innerHTML = '<ul class="divide-y divide-rule">' + parts.join('') + '</ul>';
  }, 0);

  const flowEl = $('#flow', root);
  drawFlow(flowEl, L, f);

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (a) {
      if (a.dataset.act === 'export') download('/api/export/projects?' + qs({ from: f.from, to: f.to }));
      if (a.dataset.act === 'print') printView('TÌNH HÌNH QUỸ VÀ CHI PHÍ THEO DỰ ÁN', KT.describeRange(f.from, f.to), S.db.settings);
      if (a.dataset.act === 'go-voucher') { e.preventDefault(); S.selectedVoucher = a.dataset.key; location.hash = '#/phieu'; }
      if (a.dataset.act === 'go-nhap') { Object.assign(S.filters.so, { period: 'tat-ca', from: '', to: '', rel: false, trangThai: 'nhap', duAn: '', ncc: '', loai: '', q: '' }); saveFilter('so'); }
      return;
    }
    const row = e.target.closest('[data-ma]');
    if (row) { e.preventDefault(); openProjectLedger(row.dataset.ma, f); }
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const row = e.target.closest('tr[data-ma]');
    if (row) openProjectLedger(row.dataset.ma, f);
  });
}

// Điện thoại (7b): tồn quỹ lớn, bốn số chính, hai nút việc chính, việc cần chú ý, ghi gần đây
function renderDashboardPhone(root) {
  const L = KT.filterLedger(S.ledger, {});
  const s = KT.costSummary(S.db, {}, S.costLedger);
  const d = KT.supplierDebt(S.db, {});
  const ps = KT.projectSummary(S.db, {});
  const nhap = S.drafts.entries.length + new Set(S.drafts.costs.map((c) => c.phieuId)).size;
  const a = anomalies();
  const item = (ic, html, href, act) => '<a href="' + href + '"' + (act ? ' data-act="' + act + '"' : '') + ' class="flex min-h-12 items-center gap-3 border border-rule px-3 py-2 text-[14px]">' + icon(ic, 'text-[18px] text-ink-2') + '<span class="min-w-0 flex-1">' + html + '</span>' + icon('caretRight', 'text-ink-3') + '</a>';
  root.innerHTML =
    '<section><div class="text-[12.5px] text-ink-3">Tồn quỹ hiện tại · ' + esc(fdate(KT.todayISO())) + '</div>' +
    '<div class="balance mt-1' + (L.tonCuoiKy < 0 ? ' neg' : '') + '">' + money(L.tonCuoiKy) + '<span class="unit">đ</span></div></section>' +
    '<section class="sheet grid grid-cols-2 gap-x-4 gap-y-3 p-3">' +
    '<div><div class="text-[12px] text-ink-3">Tổng thu</div><b class="text-[17px] tabular-nums text-income">' + money(L.tongThu) + '</b></div>' +
    '<div><div class="text-[12px] text-ink-3">Tổng chi</div><b class="text-[17px] tabular-nums">' + money(L.tongChi) + '</b></div>' +
    '<div><div class="text-[12px] text-ink-3">Chi phí công trình</div><b class="text-[17px] tabular-nums">' + money(s.total) + '</b></div>' +
    '<div><div class="text-[12px] text-ink-3">Dư Có (còn phải trả)</div><b class="text-[17px] tabular-nums">' + money(d.total.conNo) + '</b></div></section>' +
    '<div class="grid grid-cols-2 gap-2.5"><button type="button" class="btn btn-primary !h-12" data-act="m-ghi">' + icon('plus') + 'Ghi thu / chi</button>' +
    '<a href="#/cp-nhap" class="btn btn-secondary !h-12">' + icon('plus') + 'Phiếu nhập</a></div>' +
    '<h3 class="text-[20px]">Cần chú ý</h3><div class="flex flex-col gap-2">' +
    (a.open ? item('flag', '<b>' + a.open + ' việc cần xử lý</b>', '#/kiem-soat?tab=can-xu-ly') : '') +
    (nhap ? item('draft', '<b>' + nhap + ' dòng nháp</b> chưa ghi sổ', '#/so-thu-chi', 'go-nhap') : '') +
    (ps.khongDuAn.chi > 0 ? item('info', '<b class="tabular-nums">' + money(ps.khongDuAn.chi) + ' đ</b> chi chưa gán dự án', '#/so-thu-chi') : '') +
    (!a.open && !nhap && !(ps.khongDuAn.chi > 0) ? '<p class="text-ink-3">Không có gì cần chú ý.</p>' : '') + '</div>' +
    '<h3 class="text-[20px]">Ghi gần đây</h3>' + '<div class="sheet">' + recentHtml() + '</div>';
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'm-ghi') import('../forms.js').then((m) => m.openEntryForm(null));
    if (b.dataset.act === 'go-nhap') { Object.assign(S.filters.so, { period: 'tat-ca', from: '', to: '', rel: false, trangThai: 'nhap', duAn: '', ncc: '', loai: '', q: '' }); saveFilter('so'); }
  });
}

function openProjectLedger(ma, f) {
  Object.assign(S.filters.so, { duAn: ma, ncc: '', loai: '', q: '', period: f.period, from: f.from, to: f.to });
  saveFilter('so');
  location.hash = '#/so-thu-chi';
}

/* ---------------- Bảng chi phí theo dự án, có thanh mức chi ---------------- */
function projectTable(ps) {
  const rows = ps.rows.filter((r) => r.chi > 0 || r.nganSach > 0).sort((a, b) => b.chi - a.chi);
  const idle = ps.rows.length - rows.length;
  if (!rows.length) return '<p class="px-5 pb-6 text-ink-3">Chưa có khoản chi nào trong kỳ này.</p>';
  const max = Math.max.apply(null, rows.map((r) => Math.max(r.chi, r.nganSach))) || 1;
  const withBudget = rows.filter((r) => r.nganSach > 0);
  const bNs = withBudget.reduce((t, r) => t + r.nganSach, 0);
  const bCl = withBudget.reduce((t, r) => t + r.chenhLech, 0);
  return '<div class="overflow-x-auto"><table class="ledger">' +
    '<thead><tr><th>Dự án</th><th class="num money">Ngân sách</th><th class="num money w-[34%]">Đã chi</th><th class="num money">Còn lại</th><th>Tình trạng</th><th class="no-print"><span class="sr-only">Mở sổ</span></th></tr></thead>' +
    '<tbody>' + rows.map((r) => {
      const w = Math.max(0.5, (r.chi / max) * 100);
      const tick = r.nganSach > 0 ? '<span class="mbar-tick" style="left:' + ((r.nganSach / max) * 100).toFixed(2) + '%"></span>' : '';
      return '<tr class="clickable" data-ma="' + esc(r.ma) + '" tabindex="0" aria-label="Mở sổ của dự án ' + esc(r.ma) + '">' +
        '<td><div class="code">' + esc(r.ma) + '</div><div class="sub">' + esc(r.ten) + '</div></td>' +
        '<td class="num money">' + (r.nganSach ? money(r.nganSach) : '') + '</td>' +
        '<td class="num money"><div class="font-semibold">' + money(r.chi) + '</div>' +
        '<div class="mbar" aria-hidden="true"><span class="mbar-fill' + (r.status === 'over' ? ' over' : '') + '" style="width:' + w.toFixed(2) + '%"></span>' + tick + '</div></td>' +
        '<td class="num money' + (r.chenhLech < 0 && r.nganSach ? ' neg' : '') + '">' + (r.nganSach ? money(r.chenhLech) : '') + '</td>' +
        '<td>' + statusChip(r) + '</td><td class="actions no-print"><button type="button" class="icon-btn" data-ma="' + esc(r.ma) + '" title="Mở sổ của dự án này" aria-label="Mở sổ của dự án ' + esc(r.ma) + '">' + icon('book') + '</button></td></tr>';
    }).join('') + '</tbody>' +
    '<tfoot><tr><td>Tổng cộng · ' + ps.rows.length + ' dự án (' + rows.length + ' đang hiện)</td><td class="num money">' + money(ps.total.nganSach) + '</td>' +
    '<td class="num money"><span class="dbl">' + money(ps.total.chi) + '</span></td>' +
    '<td class="num money' + (bCl < 0 ? ' neg' : '') + '" title="Chỉ tính các dự án đã đặt ngân sách">' + (bNs ? money(bCl) : '') + '</td><td colspan="2"></td></tr>' +
    (ps.khongDuAn.chi ? '<tr class="sub-total clickable" data-ma="__none__" tabindex="0"><td>Chi chưa gán dự án</td><td class="money"></td><td class="num money">' + money(ps.khongDuAn.chi) + '</td><td class="money"></td><td colspan="2"></td></tr>' : '') +
    '</tfoot></table></div>' +
    '<p class="px-5 py-3 text-[12.5px] text-ink-3">' +
    (withBudget.length < rows.length ? 'Cột “Còn lại” ở dòng tổng chỉ tính ' + withBudget.length + ' dự án đã đặt ngân sách. ' : '') +
    (idle ? idle + ' dự án chưa phát sinh chi trong kỳ không hiển thị.' : '') + '</p>';
}

/* ---------------- Chi phí công trình (chỉ đọc, không ảnh hưởng số liệu tồn quỹ) ---------------- */
function costCard(f) {
  if (!S.db.costs.length) {
    return '<section class="sheet" aria-labelledby="h-cp"><div class="sheet-head pb-2"><h3 id="h-cp" class="sheet-title">Chi phí công trình</h3></div>' +
      '<p class="px-5 pb-5 text-[13.5px] text-ink-3">Chưa có dữ liệu. <a href="#/cp-nhap" class="font-semibold text-pen underline underline-offset-2">Lập phiếu nhập chi phí</a> hoặc nhập file Excel chi phí trong Cài đặt.</p></section>';
  }
  const s = KT.costSummary(S.db, { from: f.from, to: f.to }, S.costLedger);
  const d = KT.supplierDebt(S.db, { to: f.to });
  const row = (label, v, cls) => '<div class="flex items-baseline justify-between gap-3 py-1"><span class="text-[13px] text-ink-2">' + esc(label) + '</span><span class="text-[13.5px] font-semibold tabular-nums ' + (cls || '') + '">' + money(v) + '</span></div>';
  return '<section class="sheet" aria-labelledby="h-cp"><div class="sheet-head pb-1"><div><h3 id="h-cp" class="sheet-title">Chi phí công trình</h3><p class="sheet-note">' + esc(KT.describeRange(f.from, f.to)) + '</p></div>' +
    '<a href="#/cp-tong-hop" class="btn btn-ghost btn-sm -mt-1 -mr-2 no-print">Mở</a></div>' +
    '<div class="px-4 pb-3"><div class="text-[24px] font-semibold tabular-nums font-stretch-[110%]">' + money(s.total) + '<span class="ml-1 text-[13px] font-medium text-ink-3">đ</span></div>' +
    '<div class="mt-2 divide-y divide-rule">' + KT.LOAI_CP.map((l) => row(l, s.byLoai[l] || 0)).join('') +
    row('Dư Có (còn phải trả NCC)', d.total.conNo, '') + '</div></div></section>';
}

/* ---------------- Cần chú ý hôm nay: mỗi mục có nút đi thẳng tới nơi xử lý ---------------- */
function alertItem(tone, ic, html, go) {
  return '<li class="flex items-start gap-2.5 py-2"><span class="mt-0.5 text-[16px] ' + tone + '">' + icon(ic) + '</span><div class="min-w-0 flex-1 text-[13px] leading-snug">' + html + '</div>' + (go || '') + '</li>';
}
function alertsHtml(ps, multiDate) {
  const items = [];
  ps.rows.filter((r) => r.status === 'over').forEach((r) => {
    items.push(alertItem('text-alert', 'x', '<b>' + esc(r.ma) + '</b> vượt ngân sách <b class="tabular-nums text-alert">' + money(-r.chenhLech) + ' đ</b><div class="text-[12px] text-ink-3">' + esc(r.ten) + '</div>', '<a href="#" class="alert-go" data-ma="' + esc(r.ma) + '">Mở sổ</a>'));
  });
  ps.rows.filter((r) => r.status === 'near').forEach((r) => {
    items.push(alertItem('text-caution', 'warnTri', '<b>' + esc(r.ma) + '</b> đã dùng ' + (r.tiLe * 100).toFixed(0) + '% ngân sách', '<a href="#" class="alert-go" data-ma="' + esc(r.ma) + '">Mở sổ</a>'));
  });
  if (ps.khongDuAn.chi > 0) {
    items.push(alertItem('text-neutral-800', 'info', '<b class="tabular-nums">' + money(ps.khongDuAn.chi) + ' đ</b> tiền chi chưa gán dự án', '<a href="#" class="alert-go" data-ma="__none__">Gán dự án</a>'));
  }
  multiDate.slice(0, 3).forEach((v) => {
    items.push(alertItem('text-caution', 'warnTri', 'Phiếu <b>' + esc(v.soPhieu) + '</b> có dòng khác ngày nhau', '<a href="#" class="alert-go" data-act="go-voucher" data-key="' + esc(v.key) + '">Kiểm tra</a>'));
  });
  const noBudget = ps.rows.filter((r) => r.status === 'none').length;
  if (noBudget) items.push(alertItem('text-neutral-800', 'info', '<b>' + noBudget + ' dự án</b> có chi nhưng chưa đặt ngân sách', '<a href="#/du-an" class="alert-go">Đặt ngân sách</a>'));
  return '<ul class="divide-y divide-rule px-4 pb-2">' + (items.slice(0, 6).join('') || '') + '</ul>' + (items.length ? '' : '<p class="px-4 pb-3 text-[13px] text-ink-3" id="dash-none">Không có gì cần chú ý thêm.</p>');
}

/* ---------------- Ghi gần đây ---------------- */
function recentHtml() {
  const rows = S.ledger.slice(-6).reverse();
  if (!rows.length) return '<p class="px-4 pb-4 text-ink-3">Sổ chưa có dòng nào.</p>';
  return '<ul class="divide-y divide-rule px-4 pb-2">' + rows.map((r) =>
    '<li class="grid grid-cols-[40px_minmax(0,1fr)_auto] items-baseline gap-2.5 py-2">' +
    '<span class="text-[12px] tabular-nums text-ink-3">' + esc(fdate(r.ngay).slice(0, 5)) + '</span>' +
    '<div class="min-w-0"><div class="truncate text-[13px]">' + esc(r.noiDung || 'Không có nội dung') + '</div>' +
    '<div class="truncate text-[11.5px] text-ink-3">' + esc([r.soPhieu, r.maDuAn].filter(Boolean).join(' · ')) + '</div></div>' +
    '<span class="text-[13px] font-bold tabular-nums ' + (r.chi > 0 ? 'text-ink' : 'text-income') + '">' + (r.chi > 0 ? '−' + money(r.chi) : '+' + money(r.thu)) + '</span></li>').join('') + '</ul>';
}

/* ---------------- Biểu đồ nhịp tồn quỹ (đường bậc thang theo ngày) ---------------- */
function toTime(iso) { return Date.parse(iso + 'T00:00:00Z'); }

// Mốc ngày trên trục: bước theo lịch (1, 2, 3, 5, 7, 10, 14 ngày; rồi theo tháng), không theo ngày có phát sinh
function dateTicks(t0, t1, maxTicks) {
  const DAY = 86400000;
  const span = (t1 - t0) / DAY;
  const out = [];
  const stepD = [1, 2, 3, 5, 7, 10, 14].find((k) => span / k <= maxTicks);
  if (stepD) {
    for (let t = t0; t <= t1 + 1; t += stepD * DAY) out.push(t);
    return out;
  }
  const stepM = [1, 2, 3, 6, 12, 24].find((k) => span / (30.4 * k) <= maxTicks) || 24;
  const d = new Date(t0);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth() + (d.getUTCDate() > 1 ? 1 : 0);
  for (;;) {
    y += Math.floor(m / 12); m %= 12;
    const t = Date.UTC(y, m, 1);
    if (t > t1) break;
    if (m % stepM === 0 || stepM === 1) out.push(t);
    m += 1;
  }
  return out;
}

// Thu, chi trong ngày: mỗi ngày (kỳ dài: mỗi tuần) hai cột cạnh nhau — Thu xanh thép, Chi xám — trên cùng một thang, góc vuông.
// Rê chuột / chạm vào một cụm cột để xem thu, chi, thay đổi và tồn quỹ cuối ngày.
function drawFlow(el, L, f) {
  const days = [];
  L.rows.forEach((r) => {
    let d = days[days.length - 1];
    if (!d || d.date !== r.ngay) { d = { date: r.ngay, thu: 0, chi: 0, n: 0, bal: 0 }; days.push(d); }
    d.thu += r.thu || 0;
    d.chi += r.chi || 0;
    d.n++;
    d.bal = r.ton;
  });
  if (!days.length) {
    el.innerHTML = '<p class="py-10 text-center text-ink-3">Không có giao dịch nào trong kỳ này.</p>';
    return;
  }
  const DAY = 86400000;
  const t0 = toTime(f.from && f.from < days[0].date ? f.from : days[0].date);
  let t1 = toTime(f.to && f.to > days[days.length - 1].date ? f.to : days[days.length - 1].date);
  if (t1 <= t0) t1 = t0 + DAY;
  const spanDays = Math.round((t1 - t0) / DAY) + 1;
  const multiYear = new Date(t0).getUTCFullYear() !== new Date(t1).getUTCFullYear();

  // Kỳ dài (> 120 ngày) gộp theo tuần (bắt đầu thứ Hai) cho khỏi thành vạch mảnh
  const bucket = spanDays > 120 ? 7 : 1;
  const unit = bucket * DAY;
  const bStart = bucket === 7 ? t0 - (((new Date(t0).getUTCDay() + 6) % 7) * DAY) : t0;
  const nSlot = Math.floor((t1 - bStart) / unit) + 1;
  const bars = [];
  days.forEach((d) => {
    const i = Math.floor((toTime(d.date) - bStart) / unit);
    let b = bars[bars.length - 1];
    if (!b || b.i !== i) { b = { i, thu: 0, chi: 0, n: 0, bal: 0, from: d.date, to: d.date }; bars.push(b); }
    b.thu += d.thu; b.chi += d.chi; b.n += d.n; b.bal = d.bal; b.to = d.date;
  });
  const fMax = Math.max.apply(null, bars.map((b) => Math.max(b.thu, b.chi)).concat([1]));
  const maxThu = Math.max.apply(null, bars.map((b) => b.thu).concat([0]));
  const maxChi = Math.max.apply(null, bars.map((b) => b.chi).concat([0]));

  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'status');

  function render() {
    const W = Math.max(300, el.clientWidth);
    const m = { l: 6, r: 6, t: 18 };
    const H1 = W < 560 ? 80 : 104;   // vùng cột
    const AX = 24;                    // trục ngày
    const H = m.t + H1 + AX;
    const iw = W - m.l - m.r;
    const slot = iw / nSlot;
    const base = m.t + H1;
    const cxOf = (i) => m.l + (i + 0.5) * slot;
    const bw = Math.max(1.5, Math.min(16, (slot - 3) / 2));
    const h = (v) => (v / fMax) * H1;

    let cols = '';
    bars.forEach((b) => {
      const cx = cxOf(b.i);
      if (b.thu) cols += '<rect class="bar-thu" x="' + (cx - bw - 0.5).toFixed(1) + '" y="' + (base - h(b.thu)).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(1, h(b.thu)).toFixed(1) + '"/>';
      if (b.chi) cols += '<rect class="bar-chi" x="' + (cx + 0.5).toFixed(1) + '" y="' + (base - h(b.chi)).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(1, h(b.chi)).toFixed(1) + '"/>';
    });

    // trục ngày: vài mốc đều nhau
    const ticks = dateTicks(t0, t1, Math.max(2, Math.floor(iw / (multiYear ? 74 : 62))));
    const fmtTick = (t) => { const s = new Date(t).toISOString().slice(0, 10); return multiYear ? s.slice(5, 7) + '/' + s.slice(2, 4) : s.slice(8, 10) + '/' + s.slice(5, 7); };
    let xt = '';
    ticks.forEach((t, k) => {
      const xx = Math.min(W - m.r - 14, Math.max(m.l + 14, cxOf(Math.max(0, Math.min(nSlot - 1, Math.floor((t - bStart) / unit))))));
      xt += '<line class="tick" x1="' + xx.toFixed(1) + '" x2="' + xx.toFixed(1) + '" y1="' + base + '" y2="' + (base + 4) + '"/>' +
        '<text class="axis" x="' + xx.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (k === 0 && xx < m.l + 20 ? 'start' : 'middle') + '">' + esc(fmtTick(t)) + '</text>';
    });

    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' +
      esc('Thu và chi ' + (bucket === 7 ? 'mỗi tuần' : 'mỗi ngày') + ', ' + KT.describeRange(f.from, f.to).toLowerCase() + '. Thu nhiều nhất ' + money(maxThu) + ' đồng, chi nhiều nhất ' + money(maxChi) +
        ' đồng, tồn quỹ cuối kỳ ' + money(L.tonCuoiKy) + ' đồng.') + '">' +
      '<line class="grid-line" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + m.t + '" y2="' + m.t + '"/>' +
      '<text class="axis" x="' + m.l + '" y="' + (m.t - 5) + '">Cao nhất ' + esc(fmtShort(fMax)) + '</text>' +
      '<rect class="hl" x="0" y="' + m.t + '" width="' + slot.toFixed(1) + '" height="' + H1 + '" visibility="hidden"/>' +
      cols +
      '<line class="zero-line" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + base + '" y2="' + base + '"/>' + xt +
      '<rect class="hit" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + H1 + '" fill="transparent"/>' +
      '</svg>';
    el.appendChild(tip);

    const svg = el.querySelector('svg');
    const hl = svg.querySelector('.hl');
    const hit = svg.querySelector('.hit');
    function show(clientX) {
      const r = svg.getBoundingClientRect();
      const scale = r.width / W;
      const mx = (clientX - r.left) / scale;
      const i = Math.max(0, Math.min(nSlot - 1, Math.floor((mx - m.l) / slot)));
      const b = bars.find((x) => x.i === i);
      hl.setAttribute('x', (m.l + i * slot).toFixed(1)); hl.setAttribute('visibility', 'visible');
      if (!b) { tip.classList.remove('show'); return; }
      const doi = b.thu - b.chi;
      const ten = b.from === b.to ? 'Ngày ' + fdate(b.from) : 'Tuần ' + dm(b.from) + ' – ' + dm(b.to);
      tip.innerHTML = '<div class="font-semibold">' + esc(ten) + '</div>' +
        '<div class="row"><span class="muted"><i class="sw sw-thu"></i>Thu</span><b>' + (b.thu ? '+' + money(b.thu) : '0') + '</b></div>' +
        '<div class="row"><span class="muted"><i class="sw sw-chi"></i>Chi</span><b>' + (b.chi ? '−' + money(b.chi) : '0') + '</b></div>' +
        '<div class="row"><span class="muted">Thay đổi</span><b>' + (doi >= 0 ? '+' : '−') + money(Math.abs(doi)) + '</b></div>' +
        '<div class="row"><span class="muted">Tồn quỹ cuối ' + (b.from === b.to ? 'ngày' : 'tuần') + '</span><b>' + money(b.bal) + '</b></div>' +
        '<div class="muted">' + b.n + ' dòng sổ</div>';
      tip.classList.add('show');
      const tw = tip.offsetWidth;
      let left = cxOf(i) * scale + 14;
      if (left + tw > el.clientWidth) left = cxOf(i) * scale - tw - 14;
      tip.style.left = Math.max(0, left) + 'px';
      tip.style.top = Math.max(0, Math.min((base - h(Math.max(b.thu, b.chi))) * scale - 20, el.clientHeight - tip.offsetHeight)) + 'px';
    }
    function hide() { tip.classList.remove('show'); hl.setAttribute('visibility', 'hidden'); }
    hit.addEventListener('mousemove', (e) => show(e.clientX));
    hit.addEventListener('mouseleave', hide);
    hit.addEventListener('touchstart', (e) => show(e.touches[0].clientX), { passive: true });
  }

  render();
  let lastW = el.clientWidth;
  const ro = new ResizeObserver(() => {
    if (!el.isConnected) { ro.disconnect(); return; }
    if (Math.abs(el.clientWidth - lastW) > 4) { lastW = el.clientWidth; render(); }
  });
  ro.observe(el);
}
