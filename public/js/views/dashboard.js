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
    '<p class="text-[12px] text-ink-3"><span class="screen-hint">Rê chuột lên biểu đồ để xem từng ngày. </span>Đường xanh là tồn quỹ cuối ngày.</p></div>' +
    '<div class="flex items-center gap-4"><div class="flow-legend"><span><i class="sw sw-ton"></i>Tồn quỹ</span><span><i class="sw sw-thu"></i>Thu</span><span><i class="sw sw-chi"></i>Chi</span></div>' +
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

function niceStep(range, count) {
  const raw = range / count;
  if (raw <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

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
  const opening = L.tonDauKy;
  const t0 = toTime(f.from && f.from < days[0].date ? f.from : days[0].date);
  let t1 = toTime(f.to && f.to > days[days.length - 1].date ? f.to : days[days.length - 1].date);
  if (t1 <= t0) t1 = t0 + DAY;
  const spanDays = Math.round((t1 - t0) / DAY) + 1;
  const multiYear = new Date(t0).getUTCFullYear() !== new Date(t1).getUTCFullYear();

  const peak = days.reduce((m, d) => (d.bal > m.bal ? d : m), days[0]);
  const low = days.reduce((m, d) => (d.bal < m.bal ? d : m), days[0]);
  const last = days[days.length - 1];

  // Cột thu / chi: theo ngày; kỳ dài (> 120 ngày) gộp theo tuần cho khỏi thành vạch mảnh
  const bucket = spanDays > 120 ? 7 : 1;
  const bars = [];
  days.forEach((d) => {
    const t = toTime(d.date);
    const k = bucket === 1 ? t : t - (((new Date(t).getUTCDay() + 6) % 7) * DAY); // tuần bắt đầu thứ Hai
    let b = bars[bars.length - 1];
    if (!b || b.t !== k) { b = { t: k, thu: 0, chi: 0 }; bars.push(b); }
    b.thu += d.thu;
    b.chi += d.chi;
  });

  // Thang tồn quỹ (gồm 0 và tồn đầu kỳ)
  const vals = days.map((d) => d.bal).concat([opening, 0]);
  const loRaw = Math.min.apply(null, vals);
  const hiRaw = Math.max.apply(null, vals);
  const step = niceStep((hiRaw - loRaw) || 1, 4);
  // làm tròn ra vạch kế tiếp, trừ khi vạch đó quá xa số liệu (bỏ khoảng trống thừa — vạch lưới vẫn đặt ở bội số của bước)
  let lo = Math.floor(loRaw / step) * step;
  let hi = Math.ceil(hiRaw / step) * step || step;
  if (hiRaw > 0 && hi - hiRaw > step * 0.6) hi = hiRaw + step * 0.12;
  if (loRaw < 0 && loRaw - lo > step * 0.6) lo = loRaw - step * 0.12;
  // Thang thu / chi: thu lên trên, chi xuống dưới, chung số 0
  const maxThu = Math.max.apply(null, bars.map((b) => b.thu).concat([0]));
  const maxChi = Math.max.apply(null, bars.map((b) => b.chi).concat([0]));
  const fMax = Math.max(maxThu, maxChi) || 1;

  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'status');
  const uid = 'flow' + Math.random().toString(36).slice(2, 8);

  function render() {
    const W = Math.max(300, el.clientWidth);
    const hep = W < 560; // màn hẹp: nhãn cuối kỳ nằm trong vùng vẽ, bớt lề phải
    const m = { l: 52, r: hep ? 12 : 104, t: 26 };
    const H1 = hep ? 150 : 180;  // khung tồn quỹ
    const GAP = 36;              // khoảng giữa (chứa tiêu đề nhỏ khung dưới)
    const H2 = hep ? 64 : 76;    // khung thu / chi
    const AX = 26;               // trục ngày
    const H = m.t + H1 + GAP + H2 + AX;
    const iw = W - m.l - m.r;
    const x = (t) => m.l + ((t - t0) / (t1 - t0)) * iw;
    const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * H1;
    const top2 = m.t + H1 + GAP;
    // thu / chi: thu chiếm phần trên theo tỉ lệ, chi phần dưới — số 0 đặt sao cho hai bên cùng thang
    const z2 = top2 + (maxThu / ((maxThu + maxChi) || 1)) * H2;
    const k2 = H2 / ((maxThu + maxChi) || 1);
    const y0 = y(0);

    // đường bậc thang: giữ nguyên số dư đến ngày có phát sinh rồi nhảy
    let dPath = 'M' + x(t0).toFixed(1) + ',' + y(opening).toFixed(1);
    days.forEach((d) => { dPath += 'H' + x(toTime(d.date)).toFixed(1) + 'V' + y(d.bal).toFixed(1); });
    dPath += 'H' + x(t1).toFixed(1);
    const area = dPath + 'V' + y0.toFixed(1) + 'H' + x(t0).toFixed(1) + 'Z';

    let g = '';
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1; v += step) {
      g += '<line class="' + (v === 0 ? 'zero-line' : 'grid-line') + '" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"/>' +
        '<text class="axis" x="' + (m.l - 8) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end">' + esc(v === 0 ? '0' : fmtShort(v)) + '</text>';
    }
    // khung dưới: tiêu đề nhỏ, số 0, mức cao nhất mỗi bên
    g += '<text class="panel-title" x="' + m.l + '" y="' + (top2 - 13) + '">Thu, chi ' + (bucket === 7 ? 'mỗi tuần' : 'trong ngày') + '</text>' +
      '<line class="zero-line" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + z2.toFixed(1) + '" y2="' + z2.toFixed(1) + '"/>';
    if (maxThu) g += '<text class="axis" x="' + (m.l - 8) + '" y="' + (top2 + 4) + '" text-anchor="end">+' + esc(fmtShort(maxThu)) + '</text>';
    if (maxChi) g += '<text class="axis" x="' + (m.l - 8) + '" y="' + (top2 + H2) + '" text-anchor="end">−' + esc(fmtShort(maxChi)) + '</text>';

    // cột: ≤ 24 px, đầu cột bo 4 px (gốc vuông ở số 0), chừa khe giữa các cột
    const slot = (iw / ((t1 - t0) / DAY + 1)) * bucket;
    const bw = Math.max(1.5, Math.min(24, slot - 2, slot * 0.7));
    const col = (cx, h, up) => {
      if (h < 0.5) return '';
      const r = Math.min(4, bw / 2, h);
      const x0 = cx - bw / 2;
      const x1 = cx + bw / 2;
      if (up) {
        const yt = z2 - h;
        return 'M' + x0.toFixed(1) + ',' + z2.toFixed(1) + 'V' + (yt + r).toFixed(1) + 'Q' + x0.toFixed(1) + ',' + yt.toFixed(1) + ' ' + (x0 + r).toFixed(1) + ',' + yt.toFixed(1) +
          'H' + (x1 - r).toFixed(1) + 'Q' + x1.toFixed(1) + ',' + yt.toFixed(1) + ' ' + x1.toFixed(1) + ',' + (yt + r).toFixed(1) + 'V' + z2.toFixed(1) + 'Z';
      }
      const yb = z2 + h;
      return 'M' + x0.toFixed(1) + ',' + z2.toFixed(1) + 'V' + (yb - r).toFixed(1) + 'Q' + x0.toFixed(1) + ',' + yb.toFixed(1) + ' ' + (x0 + r).toFixed(1) + ',' + yb.toFixed(1) +
        'H' + (x1 - r).toFixed(1) + 'Q' + x1.toFixed(1) + ',' + yb.toFixed(1) + ' ' + x1.toFixed(1) + ',' + (yb - r).toFixed(1) + 'V' + z2.toFixed(1) + 'Z';
    };
    const cx = (b) => x(b.t + (bucket === 7 ? 3.5 * DAY : 0));
    const thuPath = bars.map((b) => col(cx(b), b.thu * k2, true)).join('');
    const chiPath = bars.map((b) => col(cx(b), b.chi * k2, false)).join('');

    // trục ngày
    const ticks = dateTicks(t0, t1, Math.max(2, Math.floor(iw / (multiYear ? 74 : 62))));
    const fmtTick = (t) => { const s = new Date(t).toISOString().slice(0, 10); return multiYear ? s.slice(5, 7) + '/' + s.slice(2, 4) : s.slice(8, 10) + '/' + s.slice(5, 7); };
    let xt = '';
    ticks.forEach((t) => {
      const xx = x(t);
      xt += '<line class="tick" x1="' + xx.toFixed(1) + '" x2="' + xx.toFixed(1) + '" y1="' + (top2 + H2) + '" y2="' + (top2 + H2 + 4) + '"/>' +
        '<text class="axis" x="' + xx.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(fmtTick(t)) + '</text>';
    });

    // nhãn trực tiếp: cuối kỳ, cao nhất, thấp nhất (khi âm quỹ)
    const ex = x(t1);
    const ey = y(last.bal);
    let labels = '<circle class="end-dot" cx="' + ex.toFixed(1) + '" cy="' + ey.toFixed(1) + '" r="4.5"/>';
    if (hep) {
      const ly = ey - 26 < m.t ? ey + 22 : ey - 22;
      labels += '<text class="direct-sub" x="' + (ex - 8).toFixed(1) + '" y="' + (ly - 14).toFixed(1) + '" text-anchor="end">Cuối kỳ</text>' +
        '<text class="direct" x="' + (ex - 8).toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="end">' + esc(money(last.bal)) + '</text>';
    } else {
      const ly = Math.min(ey - 8, m.t + H1 - 18);
      labels += '<text class="direct-sub" x="' + (ex + 10).toFixed(1) + '" y="' + ly.toFixed(1) + '">Cuối kỳ</text>' +
        '<text class="direct" x="' + (ex + 10).toFixed(1) + '" y="' + (ly + 15).toFixed(1) + '">' + esc(money(last.bal)) + '</text>';
    }
    const ghim = (d, chu, duoi) => {
      const px = x(toTime(d.date));
      const py = y(d.bal);
      const trai = px > m.l + iw * 0.7;
      return '<circle class="mark-dot" cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="3.5"/>' +
        '<text class="direct" x="' + (px + (trai ? -8 : 8)).toFixed(1) + '" y="' + (duoi ? py + 16 : Math.max(m.t - 8, py - 8)).toFixed(1) + '"' + (trai ? ' text-anchor="end"' : '') + '>' +
        esc(chu + ' ' + fmtShort(d.bal)) + '</text>';
    };
    if (peak !== last && peak.bal > 0) labels += ghim(peak, 'Cao nhất', false);
    if (low.bal < 0 && low !== last) labels += ghim(low, 'Thấp nhất', true);

    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' +
      esc('Tồn quỹ theo ngày, ' + KT.describeRange(f.from, f.to).toLowerCase() + '. Cao nhất ' + money(peak.bal) + ' đồng ngày ' + fdate(peak.date) +
        (low.bal < 0 ? ', thấp nhất ' + money(low.bal) + ' đồng ngày ' + fdate(low.date) : '') + ', cuối kỳ ' + money(last.bal) + ' đồng. Bên dưới: cột thu (lên) và chi (xuống) ' +
        (bucket === 7 ? 'mỗi tuần' : 'mỗi ngày') + ', thu nhiều nhất ' + money(maxThu) + ' đồng, chi nhiều nhất ' + money(maxChi) + ' đồng.') + '">' +
      '<defs><linearGradient id="' + uid + '-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="area-top"/><stop offset="1" class="area-bot"/></linearGradient>' +
      '<clipPath id="' + uid + '-tren"><rect x="0" y="0" width="' + W + '" height="' + Math.max(0, y0).toFixed(1) + '"/></clipPath>' +
      '<clipPath id="' + uid + '-duoi"><rect x="0" y="' + y0.toFixed(1) + '" width="' + W + '" height="' + Math.max(0, H - y0).toFixed(1) + '"/></clipPath></defs>' +
      g + xt +
      '<path class="area" fill="url(#' + uid + '-g)" clip-path="url(#' + uid + '-tren)" d="' + area + '"/>' +
      '<path class="area-neg" clip-path="url(#' + uid + '-duoi)" d="' + area + '"/>' +
      '<path class="line" d="' + dPath + '"/>' +
      '<path class="bar-thu" d="' + thuPath + '"/>' +
      '<path class="bar-chi" d="' + chiPath + '"/>' +
      labels +
      '<line class="cross" x1="0" x2="0" y1="' + m.t + '" y2="' + (top2 + H2) + '" visibility="hidden"/>' +
      '<circle class="hover-dot" r="5" visibility="hidden"/>' +
      '<rect class="hit" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + (top2 + H2 - m.t) + '" fill="transparent"/>' +
      '</svg>';
    el.appendChild(tip);

    const svg = el.querySelector('svg');
    const cross = svg.querySelector('.cross');
    const dot = svg.querySelector('.hover-dot');
    const hit = svg.querySelector('.hit');
    const pts = days.map((d) => ({ d, px: x(toTime(d.date)), py: y(d.bal) }));
    function show(clientX) {
      const r = svg.getBoundingClientRect();
      const scale = r.width / W;
      const mx = (clientX - r.left) / scale;
      let best = pts[0];
      pts.forEach((p) => { if (Math.abs(p.px - mx) < Math.abs(best.px - mx)) best = p; });
      cross.setAttribute('x1', best.px); cross.setAttribute('x2', best.px); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', best.px); dot.setAttribute('cy', best.py); dot.setAttribute('visibility', 'visible');
      const d = best.d;
      const doi = d.thu - d.chi;
      tip.innerHTML = '<div class="font-semibold">Ngày ' + esc(fdate(d.date)) + '</div>' +
        '<div class="row"><span class="muted">Tồn quỹ cuối ngày</span><b>' + money(d.bal) + '</b></div>' +
        (d.thu ? '<div class="row"><span class="muted"><i class="sw sw-thu"></i>Thu</span><b>+' + money(d.thu) + '</b></div>' : '') +
        (d.chi ? '<div class="row"><span class="muted"><i class="sw sw-chi"></i>Chi</span><b>−' + money(d.chi) + '</b></div>' : '') +
        (d.thu && d.chi ? '<div class="row"><span class="muted">Thay đổi</span><b>' + (doi >= 0 ? '+' : '−') + money(Math.abs(doi)) + '</b></div>' : '') +
        '<div class="muted">' + d.n + ' dòng sổ</div>';
      tip.classList.add('show');
      const tw = tip.offsetWidth;
      let left = best.px * scale + 14;
      if (left + tw > el.clientWidth) left = best.px * scale - tw - 14;
      tip.style.left = Math.max(0, left) + 'px';
      tip.style.top = Math.max(0, Math.min(best.py * scale - 20, el.clientHeight - tip.offsetHeight)) + 'px';
    }
    function hide() {
      tip.classList.remove('show');
      cross.setAttribute('visibility', 'hidden');
      dot.setAttribute('visibility', 'hidden');
    }
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
