/* Tổng quan: tồn quỹ, nhịp tồn quỹ theo ngày, chi phí theo dự án. */
import { $, esc, money, fdate, fmtShort, icon, download, periodControls, bindPeriodControls, refreshPeriod, freshRoot, equationHtml } from '../ui.js';
import { S, saveFilter, vouchers, anomalies } from '../state.js';
import { printView } from '../print.js';

const KT = window.KT;

// Nhãn tình trạng ngân sách: màu luôn đi kèm biểu tượng và chữ
export function statusChip(r) {
  const pct = (x) => (x * 100).toFixed(0) + '%';
  switch (r.status) {
    case 'over': return '<span class="chip chip-over" title="Vượt ' + money(-r.chenhLech) + ' đ">' + icon('warn') + 'Vượt ' + pct(r.tiLe - 1) + '</span>';
    case 'near': return '<span class="chip chip-near">' + icon('warnTri') + 'Đã dùng ' + pct(r.tiLe) + '</span>';
    case 'ok': return '<span class="chip chip-ok">' + icon('checkCircle') + 'Trong ngân sách</span>';
    case 'none': return '<span class="chip chip-none">' + icon('minus') + 'Chưa đặt ngân sách</span>';
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

  root.innerHTML =
    '<div class="print-only" id="print-head"></div>' +

    /* ---- Sổ quỹ ---- */
    '<section aria-labelledby="h-quy" class="flex flex-col gap-4">' +
    '<div class="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">' +
    '<div><h2 id="h-quy" class="text-[13.5px] font-medium text-ink-2">Tồn quỹ tiền mặt ' + esc(f.to ? 'đến ngày ' + fdate(f.to) : 'hiện tại') + '</h2>' +
    '<p class="balance mt-2' + (L.tonCuoiKy < 0 ? ' neg' : '') + '">' + money(L.tonCuoiKy) + '<span class="unit">đồng</span></p></div>' +
    '<div class="no-print flex flex-wrap items-center gap-2">' + periodControls(f, 'dash') +
    '<button type="button" class="btn btn-ghost" data-act="print">' + icon('print') + 'In</button>' +
    '<button type="button" class="btn btn-secondary" data-act="export">' + icon('excel') + 'Xuất Excel</button></div>' +
    '</div>' +
    equationHtml({ dau: L.tonDauKy, thu: L.tongThu, chi: L.tongChi, cuoi: L.tonCuoiKy, dauLabel: f.from ? 'Tồn quỹ ngày ' + fdate(f.from) : 'Tồn quỹ đầu sổ' }) +
    '<div class="sheet px-5 pt-4 pb-3">' +
    '<div class="flex flex-wrap items-baseline justify-between gap-2"><h3 class="sheet-title">Nhịp tồn quỹ theo ngày</h3>' +
    '<p class="text-[12.5px] text-ink-3">' + esc(KT.describeRange(f.from, f.to)) + '<span class="screen-hint">. Rê chuột lên đường để xem từng ngày</span>.</p></div>' +
    '<div class="flow mt-3" id="flow"></div>' +
    '</div>' +
    '</section>' +

    /* ---- Dự án + cột phụ ---- */
    '<div class="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">' +
    '<section class="sheet overflow-hidden" aria-labelledby="h-duan">' +
    '<div class="sheet-head"><div><h3 id="h-duan" class="sheet-title">Chi phí theo dự án</h3>' +
    '<p class="sheet-note">Tổng chi trong kỳ so với ngân sách. Bấm một dòng để mở sổ của dự án đó.</p></div>' +
    '<div class="flex items-center gap-4 text-[12.5px] text-ink-2" aria-hidden="true">' +
    '<span class="flex items-center gap-1.5"><span class="inline-block h-1.5 w-5 rounded-full bg-pen"></span>Đã chi</span>' +
    '<span class="flex items-center gap-1.5"><span class="inline-block h-3 w-0.5 rounded-full bg-ink"></span>Ngân sách</span></div></div>' +
    projectTable(ps) +
    '</section>' +
    '<aside class="flex flex-col gap-5">' +
    costCard(f) +
    '<section class="sheet" aria-labelledby="h-chuy"><div class="sheet-head pb-2"><h3 id="h-chuy" class="sheet-title">Cần chú ý</h3></div>' +
    '<div id="dash-anom" class="px-5" aria-live="polite"></div>' + alertsHtml(ps, multiDate) + '</section>' +
    '<section class="sheet" aria-labelledby="h-gan"><div class="sheet-head pb-2"><h3 id="h-gan" class="sheet-title">Ghi gần đây</h3>' +
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
      parts.push('<a href="#/kiem-soat?tab=can-xu-ly" class="flex gap-3 rounded-lg bg-caution-soft px-3 py-2.5 text-[13.5px] leading-snug text-ink hover:bg-[#FFE8B0]">' +
        '<span class="mt-0.5 text-[18px] text-caution">' + icon('flag') + '</span><span><b class="font-semibold">' + a.open + ' việc cần xử lý</b><span class="block text-[12.5px] text-ink-2">' + esc(top) + '</span></span></a>');
    }
    if (nhap) parts.push('<a href="#/so-thu-chi" class="mt-2 flex gap-3 rounded-lg px-3 py-2 text-[13.5px] text-ink-2 hover:bg-paper"><span class="text-[18px] text-caution">' + icon('draft') + '</span><span>' + nhap + ' phiếu / dòng nháp chưa ghi sổ (chưa tính vào số liệu)</span></a>');
    box.innerHTML = parts.join('');
    box.classList.toggle('pb-2', !!parts.length);
  }, 0);

  const flowEl = $('#flow', root);
  drawFlow(flowEl, L, f);

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (a) {
      if (a.dataset.act === 'export') download('/api/export/projects?' + qs({ from: f.from, to: f.to }));
      if (a.dataset.act === 'print') printView('TÌNH HÌNH QUỸ VÀ CHI PHÍ THEO DỰ ÁN', KT.describeRange(f.from, f.to), S.db.settings);
      if (a.dataset.act === 'go-voucher') { e.preventDefault(); S.selectedVoucher = a.dataset.key; location.hash = '#/phieu'; }
      return;
    }
    const row = e.target.closest('[data-ma]');
    if (row) openProjectLedger(row.dataset.ma, f);
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
    '<thead><tr><th>Dự án</th><th class="num money">Ngân sách</th><th class="num money w-[34%]">Đã chi</th><th class="num money">Còn lại</th><th>Tình trạng</th></tr></thead>' +
    '<tbody>' + rows.map((r) => {
      const w = Math.max(0.5, (r.chi / max) * 100);
      const tick = r.nganSach > 0 ? '<span class="mbar-tick" style="left:' + ((r.nganSach / max) * 100).toFixed(2) + '%"></span>' : '';
      return '<tr class="clickable" data-ma="' + esc(r.ma) + '" tabindex="0" aria-label="Mở sổ của dự án ' + esc(r.ma) + '">' +
        '<td><div class="code">' + esc(r.ma) + '</div><div class="sub">' + esc(r.ten) + '</div></td>' +
        '<td class="num money">' + (r.nganSach ? money(r.nganSach) : '') + '</td>' +
        '<td class="num money"><div class="font-semibold">' + money(r.chi) + '</div>' +
        '<div class="mbar" aria-hidden="true"><span class="mbar-fill' + (r.status === 'over' ? ' over' : '') + '" style="width:' + w.toFixed(2) + '%"></span>' + tick + '</div></td>' +
        '<td class="num money' + (r.chenhLech < 0 && r.nganSach ? ' neg' : '') + '">' + (r.nganSach ? money(r.chenhLech) : '') + '</td>' +
        '<td>' + statusChip(r) + '</td></tr>';
    }).join('') + '</tbody>' +
    '<tfoot><tr><td>Tổng cộng</td><td class="num money">' + money(ps.total.nganSach) + '</td>' +
    '<td class="num money"><span class="dbl">' + money(ps.total.chi) + '</span></td>' +
    '<td class="num money' + (bCl < 0 ? ' neg' : '') + '" title="Chỉ tính các dự án đã đặt ngân sách">' + (bNs ? money(bCl) : '') + '</td><td></td></tr>' +
    (ps.khongDuAn.chi ? '<tr class="sub-total clickable" data-ma="__none__" tabindex="0"><td>Chi chưa gán dự án</td><td class="money"></td><td class="num money">' + money(ps.khongDuAn.chi) + '</td><td class="money"></td><td></td></tr>' : '') +
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
    '<div class="px-5 pb-4"><div class="text-[24px] font-semibold tabular-nums font-stretch-[110%]">' + money(s.total) + '<span class="ml-1 text-[13px] font-medium text-ink-3">đ</span></div>' +
    '<div class="mt-2 divide-y divide-rule">' + KT.LOAI_CP.map((l) => row(l, s.byLoai[l] || 0)).join('') +
    row('Còn nợ nhà cung cấp', d.total.conNo, d.total.conNo ? 'text-alert' : '') + '</div></div></section>';
}

/* ---------------- Cần chú ý ---------------- */
function alertsHtml(ps, multiDate) {
  const items = [];
  const li = (tone, ic, html) => '<li class="flex gap-3 py-2.5">' +
    '<span class="mt-0.5 text-[18px] ' + tone + '">' + icon(ic) + '</span><div class="min-w-0 text-[13.5px] leading-snug">' + html + '</div></li>';
  ps.rows.filter((r) => r.status === 'over').forEach((r) => {
    items.push(li('text-alert', 'warn', '<b class="font-semibold">' + esc(r.ma) + '</b> vượt ngân sách <b class="font-semibold tabular-nums text-alert">' + money(-r.chenhLech) + ' đ</b><div class="text-[12.5px] text-ink-3">' + esc(r.ten) + '</div>'));
  });
  ps.rows.filter((r) => r.status === 'near').forEach((r) => {
    items.push(li('text-caution', 'warnTri', '<b class="font-semibold">' + esc(r.ma) + '</b> đã dùng ' + (r.tiLe * 100).toFixed(0) + '% ngân sách'));
  });
  if (ps.khongDuAn.chi > 0) {
    items.push(li('text-pen', 'info', '<b class="font-semibold tabular-nums">' + money(ps.khongDuAn.chi) + ' đ</b> tiền chi chưa gán dự án'));
  }
  multiDate.slice(0, 3).forEach((v) => {
    items.push(li('text-pen', 'info', 'Phiếu <a href="#" class="font-semibold text-pen underline underline-offset-2" data-act="go-voucher" data-key="' + esc(v.key) + '">' + esc(v.soPhieu) + '</a> có các dòng khác ngày nhau. Nên kiểm tra lại số phiếu.'));
  });
  const noBudget = ps.rows.filter((r) => r.status === 'none').length;
  if (noBudget) items.push(li('text-ink-3', 'minus', noBudget + ' dự án có chi nhưng chưa đặt ngân sách. <a href="#/du-an" class="font-semibold text-pen underline underline-offset-2">Đặt ngân sách</a>'));
  if (!items.length) return '<p class="px-5 pb-5 text-ink-3">Không có gì cần chú ý.</p>';
  return '<ul class="divide-y divide-rule px-5 pb-2">' + items.slice(0, 7).join('') + '</ul>';
}

/* ---------------- Ghi gần đây ---------------- */
function recentHtml() {
  const rows = S.ledger.slice(-7).reverse();
  if (!rows.length) return '<p class="px-5 pb-5 text-ink-3">Sổ chưa có dòng nào.</p>';
  return '<ul class="divide-y divide-rule px-5 pb-2">' + rows.map((r) =>
    '<li class="grid grid-cols-[44px_minmax(0,1fr)_auto] items-baseline gap-3 py-2.5">' +
    '<span class="text-[12.5px] tabular-nums text-ink-3">' + esc(fdate(r.ngay).slice(0, 5)) + '</span>' +
    '<div class="min-w-0"><div class="truncate text-[13.5px]">' + esc(r.noiDung || 'Không có nội dung') + '</div>' +
    '<div class="truncate text-[12px] text-ink-3">' + esc([r.soPhieu, r.maDuAn].filter(Boolean).join(', ')) + '</div></div>' +
    '<span class="text-[13.5px] font-semibold tabular-nums ' + (r.chi > 0 ? 'text-ink' : 'text-income') + '">' + (r.chi > 0 ? '−' + money(r.chi) : '+' + money(r.thu)) + '</span></li>').join('') + '</ul>';
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
  const opening = L.tonDauKy;
  const t0 = toTime(f.from && f.from < days[0].date ? f.from : days[0].date);
  let t1 = toTime(f.to && f.to > days[days.length - 1].date ? f.to : days[days.length - 1].date);
  if (t1 <= t0) t1 = t0 + 86400000;

  const peak = days.reduce((m, d) => (d.bal > m.bal ? d : m), days[0]);
  const last = days[days.length - 1];
  const vals = days.map((d) => d.bal).concat([opening, 0]);
  let lo = Math.min.apply(null, vals);
  let hi = Math.max.apply(null, vals);
  const step = niceStep((hi - lo) || 1, 4);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step || step;

  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'status');

  function render() {
    const W = Math.max(320, el.clientWidth);
    const H = 230;
    const m = { l: 58, r: 118, t: 22, b: 30 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const x = (t) => m.l + ((t - t0) / (t1 - t0)) * iw;
    const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * ih;

    // đường bậc thang: giữ nguyên số dư đến ngày có phát sinh rồi nhảy
    let dPath = 'M' + x(t0).toFixed(1) + ',' + y(opening).toFixed(1);
    days.forEach((d) => {
      dPath += 'H' + x(toTime(d.date)).toFixed(1) + 'V' + y(d.bal).toFixed(1);
    });
    dPath += 'H' + x(t1).toFixed(1);
    const area = dPath + 'V' + y(Math.max(lo, 0)).toFixed(1) + 'H' + x(t0).toFixed(1) + 'Z';

    let grid = '';
    for (let v = lo; v <= hi + 1; v += step) {
      grid += '<line class="' + (v === 0 ? 'zero-line' : 'grid-line') + '" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"/>' +
        '<text class="axis" x="' + (m.l - 8) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end">' + esc(v === 0 ? '0' : fmtShort(v)) + '</text>';
    }
    // nhãn ngày: tối đa ~7 nhãn, không chồng nhau
    const maxTicks = Math.max(2, Math.floor(iw / 70));
    const every = Math.max(1, Math.ceil(days.length / maxTicks));
    let xt = '';
    let lastX = -Infinity;
    days.forEach((d, i) => {
      if (i % every !== 0 && i !== days.length - 1) return;
      const xx = x(toTime(d.date));
      if (xx - lastX < 44) return;
      lastX = xx;
      xt += '<text class="axis" x="' + xx.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(fdate(d.date).slice(0, 5)) + '</text>';
    });

    // nhãn trực tiếp: cuối kỳ và đỉnh cao nhất (đẩy lên nếu sát trục ngày)
    const ex = x(t1);
    const ey = y(last.bal);
    const ly = Math.min(ey - 8, H - m.b - 26);
    let labels = '<circle class="end-dot" cx="' + ex.toFixed(1) + '" cy="' + ey.toFixed(1) + '" r="4.5"/>' +
      '<text class="direct-sub" x="' + (ex + 10).toFixed(1) + '" y="' + ly.toFixed(1) + '">Cuối kỳ</text>' +
      '<text class="direct" x="' + (ex + 10).toFixed(1) + '" y="' + (ly + 15).toFixed(1) + '">' + esc(money(last.bal)) + '</text>';
    if (peak !== last && peak.bal > 0) {
      const px = x(toTime(peak.date));
      const py = y(peak.bal);
      labels += '<text class="direct" x="' + (px + 6).toFixed(1) + '" y="' + (py - 7).toFixed(1) + '">Cao nhất ' + esc(fmtShort(peak.bal)) + '</text>';
    }

    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' +
      esc('Tồn quỹ theo ngày, ' + KT.describeRange(f.from, f.to).toLowerCase() + '. Cao nhất ' + money(peak.bal) + ' đồng ngày ' + fdate(peak.date) + ', cuối kỳ ' + money(last.bal) + ' đồng.') + '">' +
      grid + xt +
      '<path class="area" d="' + area + '"/>' +
      '<path class="line" d="' + dPath + '"/>' +
      labels +
      '<line class="cross" x1="0" x2="0" y1="' + m.t + '" y2="' + (H - m.b) + '" visibility="hidden"/>' +
      '<circle class="hover-dot" r="5" visibility="hidden"/>' +
      '<rect class="hit" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '" fill="transparent"/>' +
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
      tip.innerHTML = '<div class="font-semibold">Ngày ' + esc(fdate(d.date)) + '</div>' +
        '<div class="row"><span class="muted">Tồn quỹ cuối ngày</span><b>' + money(d.bal) + '</b></div>' +
        (d.thu ? '<div class="row"><span class="muted">Thu</span><b>+' + money(d.thu) + '</b></div>' : '') +
        (d.chi ? '<div class="row"><span class="muted">Chi</span><b>−' + money(d.chi) + '</b></div>' : '') +
        '<div class="muted">' + d.n + ' dòng sổ</div>';
      tip.classList.add('show');
      const tw = tip.offsetWidth;
      let left = best.px * scale + 14;
      if (left + tw > el.clientWidth) left = best.px * scale - tw - 14;
      tip.style.left = Math.max(0, left) + 'px';
      tip.style.top = Math.max(0, best.py * scale - 20) + 'px';
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
