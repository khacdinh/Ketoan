/* Báo cáo chi phí công trình: bảng điều khiển (TONGHOP), chi tiết theo nhóm (CHI_TIET_THEO_NHOM),
 * công nợ NCC (CONGNO_NCC), thống kê giá vật tư. */
import { $, $$, esc, money, fdate, fmtShort, icon, download, periodControls, bindPeriodControls, refreshPeriod, freshRoot, debounce, highlight, LS } from '../ui.js';
import { S, saveFilter, ctOptions, selectOptions, projectByCode, supplierByCode, materialByCode, itemByCode } from '../state.js';
import { printView } from '../print.js';
import { openEntryForm } from '../forms.js';

const KT = window.KT;
const pct = (x) => (x * 100).toFixed(1).replace('.', ',') + '%';

function ctLabel(ct) {
  const p = ct ? projectByCode(ct) : null;
  return p ? p.ma + ' — ' + p.ten : ct ? ct : 'Tất cả công trình';
}

function goLedger(patch) {
  Object.assign(S.filters.cpSo, { period: 'tat-ca', from: '', to: '', ct: '', nha: '', nhom: '', hm: '', loai: '', ncc: '', vt: '', q: '' }, patch);
  saveFilter('cpSo');
  location.hash = '#/cp-so';
}

function houseSelect(id, ct, value) {
  const houses = S.db.houses.filter((h) => !ct || KT.keyOf(h.maCT) === KT.keyOf(ct));
  return '<select id="' + id + '" class="input w-auto max-w-[180px]" aria-label="Nhà">' +
    selectOptions(houses, value, { allLabel: 'Mọi nhà', withNone: true, noneLabel: '(Không gán nhà)', label: (h) => h.ma + ' — ' + h.ten }) + '</select>';
}

/* ============================== BẢNG ĐIỀU KHIỂN ============================== */

export function renderCostDashboard(root) {
  root = freshRoot(root);
  const f = refreshPeriod(S.filters.cpTh);
  const s = KT.costSummary(S.db, f, S.costLedger);
  const debt = KT.supplierDebt(S.db, { ct: f.ct, to: f.to });
  const chk = KT.costCatalogCheck(S.db);
  const nVT = new Set(KT.filterCosts(S.costLedger, f).rows.map((r) => KT.keyOf(r.maVT)).filter(Boolean)).size;
  const openState = LS.get('cp.th.open', {});

  const tile = (label, value, sub, cls) => '<div class="stat"><div class="stat-label">' + esc(label) + '</div><div class="stat-value ' + (cls || '') + '">' + value + '</div>' +
    (sub ? '<div class="stat-sub">' + sub + '</div>' : '') + '</div>';
  const loaiTiles = KT.LOAI_CP.map((l) => tile(l, money(s.byLoai[l] || 0), s.total ? pct((s.byLoai[l] || 0) / s.total) + ' tổng chi phí' +
    '<div class="mbar mt-1.5" aria-hidden="true"><span class="mbar-fill" style="width:' + (s.total ? ((s.byLoai[l] || 0) / s.total * 100).toFixed(2) : 0) + '%"></span></div>' : '')).join('');

  root.innerHTML =
    '<div class="print-only" id="print-head"></div>' +
    '<div class="no-print flex flex-wrap items-center gap-2">' +
    '<select id="th-ct" class="input w-auto max-w-[260px]" aria-label="Công trình">' + ctOptions(f.ct) + '</select>' +
    houseSelect('th-nha', f.ct, f.nha) +
    periodControls(f, 'cth') +
    '<span class="flex-1"></span>' +
    '<button type="button" class="btn btn-ghost" data-act="print">' + icon('print') + 'In</button>' +
    '<button type="button" class="btn btn-secondary" data-act="export">' + icon('excel') + 'Xuất Excel</button>' +
    '<a href="#/cp-nhap" class="btn btn-primary">' + icon('plus') + 'Lập phiếu nhập</a>' +
    '</div>' +
    '<section class="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">' +
    '<div><h2 class="text-[13.5px] font-medium text-ink-2">Tổng chi phí · ' + esc(ctLabel(f.ct)) + ' · ' + esc(KT.describeRange(f.from, f.to).toLowerCase()) + '</h2>' +
    '<p class="balance mt-2">' + money(s.total) + '<span class="unit">đồng</span></p>' +
    '<p class="mt-1.5 text-[13px] text-ink-3">' + s.soDong + ' dòng chi phí · ' + nVT + ' mã vật tư đã mua · ' +
    (chk.ok ? '<span class="text-income">' + icon('checkCircle', 'align-[-2px]') + ' Danh mục khớp</span>' : '<a href="#/cp-danh-muc" class="font-semibold text-caution underline underline-offset-2">' + icon('warnTri', 'align-[-2px]') + ' ' + esc(checkText(chk)) + '</a>') + '</p></div>' +
    '</section>' +
    '<div class="stats">' + loaiTiles +
    tile('Đã trả nhà cung cấp', money(debt.total.daTra), 'Từ sổ thu chi, theo mã NCC' + (f.ct ? ' và công trình' : '')) +
    tile('Còn nợ nhà cung cấp', money(debt.total.conNo), debt.total.ungDu ? 'Ứng dư ' + money(debt.total.ungDu) + ' đ' : '', debt.total.conNo ? 'text-alert' : '') +
    '</div>' +
    '<div class="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">' +
    '<section class="sheet overflow-hidden" aria-labelledby="h-nhom"><div class="sheet-head"><div><h3 id="h-nhom" class="sheet-title">Chi phí theo nhóm và hạng mục</h3>' +
    '<p class="sheet-note">Bấm dòng nhóm để bung hoặc thu gọn hạng mục. Bấm hạng mục để xem chi tiết.</p></div>' +
    '<div class="no-print flex gap-1"><button type="button" class="btn btn-ghost btn-sm" data-act="expand">Bung hết</button><button type="button" class="btn btn-ghost btn-sm" data-act="collapse">Thu gọn</button></div></div>' +
    '<div class="overflow-x-auto"><table class="ledger tree"><thead><tr><th>Nhóm lớn / hạng mục</th><th class="num money w-[36%]">Tổng chi</th><th class="num">Tỷ trọng</th><th class="num">Số dòng</th></tr></thead><tbody>' +
    groupRowsHtml(s, openState) + '</tbody>' +
    '<tfoot><tr><td>Tổng cộng</td><td class="num money"><span class="dbl">' + money(s.total) + '</span></td><td class="num">' + (s.total ? '100%' : '') + '</td><td class="num">' + s.soDong + '</td></tr></tfoot></table></div></section>' +
    '<aside class="flex flex-col gap-5">' +
    '<section class="sheet px-5 pt-4 pb-3" aria-labelledby="h-thang"><div class="flex items-baseline justify-between gap-2"><h3 id="h-thang" class="sheet-title">Chi phí theo tháng</h3><span class="text-[12.5px] text-ink-3">Cột: trong tháng · đường: lũy kế</span></div>' +
    '<div class="bars mt-3" id="th-months"></div>' + monthTable(s.byMonth) + '</section>' +
    '<section class="sheet" aria-labelledby="h-no"><div class="sheet-head pb-2"><h3 id="h-no" class="sheet-title">Nhà cung cấp cần chú ý</h3><a href="#/cp-cong-no" class="btn btn-ghost btn-sm -mt-1 -mr-2 no-print">Công nợ</a></div>' + debtAlerts(debt) + '</section>' +
    '</aside></div>' +
    '<section class="sheet overflow-hidden" aria-labelledby="h-th-ct"><div class="sheet-head pb-1"><div><h3 id="h-th-ct" class="sheet-title">Nợ và đã thanh toán theo công trình</h3>' +
    '<p class="sheet-note">Lũy kế' + (f.to ? ' đến ngày ' + fdate(f.to) : ' đến nay') + ', không phụ thuộc “Từ ngày”. Bấm một công trình để xem riêng công trình đó.</p></div>' +
    '<a href="#/cp-cong-no" class="btn btn-ghost btn-sm no-print">Công nợ chi tiết</a></div>' +
    projectDebtHtml(KT.projectDebtSummary(S.db, { to: f.to }), f.ct) + '</section>';

  drawMonthChart($('#th-months', root), s.byMonth);

  const rerender = () => renderCostDashboard(root);
  $('#th-ct', root).addEventListener('change', (e) => { f.ct = e.target.value; f.nha = ''; saveFilter('cpTh'); rerender(); });
  $('#th-nha', root).addEventListener('change', (e) => { f.nha = e.target.value; saveFilter('cpTh'); rerender(); });
  bindPeriodControls(root, f, 'cth', () => { saveFilter('cpTh'); rerender(); });

  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (a) {
      const act = a.dataset.act;
      if (act === 'export') download('/api/export/costs' + (f.ct ? '?ct=' + encodeURIComponent(f.ct) : ''));
      if (act === 'print') printView('BẢNG ĐIỀU KHIỂN CHI PHÍ CÔNG TRÌNH', ctLabel(f.ct) + '. ' + KT.describeRange(f.from, f.to), S.db.settings);
      if (act === 'expand' || act === 'collapse') {
        const st = {};
        s.groups.forEach((g) => { st[g.ma] = act === 'expand'; });
        LS.set('cp.th.open', st);
        rerender();
      }
      return;
    }
    const g = e.target.closest('tr[data-group]');
    if (g) {
      const st = LS.get('cp.th.open', {});
      st[g.dataset.group] = !(st[g.dataset.group] !== false);
      LS.set('cp.th.open', st);
      rerender();
      return;
    }
    const it = e.target.closest('tr[data-item]');
    if (it) goLedger({ ct: f.ct, nha: f.nha, hm: it.dataset.item, period: f.period, from: f.from, to: f.to });
    const ctRow = e.target.closest('tr[data-ct]');
    if (ctRow) {
      f.ct = KT.keyOf(f.ct) === KT.keyOf(ctRow.dataset.ct) ? '' : ctRow.dataset.ct;
      f.nha = '';
      saveFilter('cpTh');
      rerender();
    }
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const tr = e.target.closest('tr[data-group], tr[data-item], tr[data-ct]');
    if (tr) tr.click();
  });
}

function checkText(c) {
  const p = [];
  if (c.hmThieuNhom.length) p.push(c.hmThieuNhom.length + ' hạng mục chưa có nhóm');
  if (c.dongHmLa) p.push(c.dongHmLa + ' dòng có hạng mục lạ');
  if (c.dongVtLa) p.push(c.dongVtLa + ' dòng có mã VT lạ');
  if (c.dongNccLa) p.push(c.dongNccLa + ' dòng có mã NCC lạ');
  if (c.dongCtLa) p.push(c.dongCtLa + ' dòng có mã công trình lạ');
  if (c.dongNhaLa) p.push(c.dongNhaLa + ' dòng có mã nhà lạ');
  return p.join(', ');
}

function groupRowsHtml(s, openState) {
  const max = Math.max.apply(null, s.groups.map((g) => g.total).concat([1]));
  let html = '';
  s.groups.forEach((g) => {
    if (!g.total && !g.inCatalog) return;
    const open = openState[g.ma] !== false && g.total > 0;
    html += '<tr class="grp clickable" data-group="' + esc(g.ma) + '" tabindex="0" aria-expanded="' + open + '">' +
      '<td><span class="caret' + (open ? ' open' : '') + '">' + icon('caretRight') + '</span>' + esc(g.ten) + '</td>' +
      '<td class="num money"><div class="font-semibold">' + money(g.total) + '</div><div class="mbar" aria-hidden="true"><span class="mbar-fill" style="width:' + (g.total / max * 100).toFixed(2) + '%"></span></div></td>' +
      '<td class="num">' + (s.total ? pct(g.total / s.total) : '') + '</td>' +
      '<td class="num">' + (g.soDong || '') + '</td></tr>';
    if (!open) return;
    g.items.filter((it) => it.total || it.soDong).forEach((it) => {
      html += '<tr class="itm clickable" data-item="' + esc(it.ma) + '" tabindex="0" aria-label="Xem các dòng của hạng mục ' + esc(it.ten) + '">' +
        '<td class="pl-9">' + esc(it.ten) + '</td><td class="num money">' + money(it.total) + '</td><td class="num text-ink-2">' + (s.total ? pct(it.total / s.total) : '') + '</td>' +
        '<td class="num text-ink-2">' + it.soDong + '</td></tr>';
    });
    const idle = g.items.filter((it) => !it.total && !it.soDong).length;
    if (idle) html += '<tr class="itm"><td class="pl-9 text-[12.5px] text-ink-3" colspan="4">' + idle + ' hạng mục chưa có phát sinh</td></tr>';
  });
  return html || '<tr><td colspan="4" class="empty">Chưa có chi phí nào trong kỳ này.</td></tr>';
}

function monthTable(byMonth) {
  if (!byMonth.length) return '';
  return '<table class="ledger ledger-compact mt-2"><thead><tr><th>Tháng</th><th class="num money">Trong tháng</th><th class="num money">Lũy kế</th></tr></thead><tbody>' +
    byMonth.map((m) => '<tr><td>' + (m.thang ? m.thang.slice(5) + '/' + m.thang.slice(0, 4) : 'Chưa có ngày') + '</td><td class="num money">' + money(m.total) + '</td><td class="num money text-ink-2">' + money(m.luyKe) + '</td></tr>').join('') +
    '</tbody></table>';
}

function drawMonthChart(el, byMonth) {
  const data = byMonth.filter((m) => m.thang);
  if (!data.length) { el.innerHTML = '<p class="py-8 text-center text-ink-3">Chưa có dữ liệu.</p>'; return; }
  const W = 360;
  const H = 190;
  const m = { l: 44, r: 10, t: 12, b: 26 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const maxCol = Math.max.apply(null, data.map((d) => d.total)) || 1;
  const maxLine = data[data.length - 1].luyKe || 1;
  const bw = Math.min(34, iw / data.length * 0.62);
  const x = (i) => m.l + (i + 0.5) * (iw / data.length);
  const yc = (v) => m.t + ih - (v / maxCol) * ih;
  const yl = (v) => m.t + ih - (v / maxLine) * ih;
  let svg = '<line class="grid-line" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + (m.t + ih) + '" y2="' + (m.t + ih) + '"/>';
  [0.5, 1].forEach((k) => {
    svg += '<line class="grid-line" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + yc(maxCol * k).toFixed(1) + '" y2="' + yc(maxCol * k).toFixed(1) + '"/>' +
      '<text class="axis" x="' + (m.l - 6) + '" y="' + (yc(maxCol * k) + 4).toFixed(1) + '" text-anchor="end">' + esc(fmtShort(maxCol * k)) + '</text>';
  });
  data.forEach((d, i) => {
    svg += '<rect class="bar" x="' + (x(i) - bw / 2).toFixed(1) + '" y="' + yc(d.total).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (m.t + ih - yc(d.total)).toFixed(1) + '" rx="2"><title>' +
      esc('Tháng ' + d.thang.slice(5) + '/' + d.thang.slice(0, 4) + ': ' + money(d.total) + ' đ, lũy kế ' + money(d.luyKe) + ' đ') + '</title></rect>' +
      '<text class="axis" x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + d.thang.slice(5) + '/' + d.thang.slice(2, 4) + '</text>';
  });
  svg += '<polyline class="cum" points="' + data.map((d, i) => x(i).toFixed(1) + ',' + yl(d.luyKe).toFixed(1)).join(' ') + '"/>';
  const last = data[data.length - 1];
  svg += '<circle class="cum-dot" cx="' + x(data.length - 1).toFixed(1) + '" cy="' + yl(last.luyKe).toFixed(1) + '" r="3.5"/>';
  el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc('Chi phí theo tháng, lũy kế ' + money(last.luyKe) + ' đồng') + '">' + svg + '</svg>';
}

function debtAlerts(debt) {
  const rows = debt.rows.filter((r) => r.lienQuan && r.conLai !== 0).sort((a, b) => Math.abs(b.conLai) - Math.abs(a.conLai)).slice(0, 6);
  if (!rows.length) return '<p class="px-5 pb-5 text-ink-3">Không có công nợ nào.</p>';
  return '<ul class="divide-y divide-rule px-5 pb-2">' + rows.map((r) =>
    '<li class="flex items-baseline justify-between gap-3 py-2.5"><div class="min-w-0"><div class="truncate text-[13.5px] font-medium">' + esc(r.ten) + '</div>' +
    '<div class="text-[12px] text-ink-3">' + esc(r.ma) + '</div></div>' +
    '<div class="text-right"><div class="text-[13.5px] font-semibold tabular-nums ' + (r.conLai > 0 ? 'text-alert' : 'text-caution') + '">' + money(Math.abs(r.conLai)) + '</div>' +
    '<div class="text-[12px] text-ink-3">' + (r.conLai > 0 ? 'Còn nợ' : 'Ứng dư') + '</div></div></li>').join('') + '</ul>';
}

/* ============================== CHI TIẾT THEO NHÓM ============================== */

export function renderCostDetail(root) {
  root = freshRoot(root);
  const f = refreshPeriod(S.filters.cpCt);
  const usedNCC = new Set(S.db.costs.map((c) => KT.keyOf(c.maNCC)));
  root.innerHTML =
    '<div class="print-only" id="print-head"></div>' +
    '<div class="no-print flex flex-wrap items-center gap-2">' +
    '<select id="ct-ct" class="input w-auto max-w-[260px]" aria-label="Công trình">' + ctOptions(f.ct) + '</select>' +
    houseSelect('ct-nha', f.ct, f.nha) +
    '<select id="ct-loai" class="input w-auto" aria-label="Loại chi phí"><option value="">Mọi loại CP</option>' + KT.LOAI_CP.map((l) => '<option' + (f.loai === l ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>' +
    '<select id="ct-ncc" class="input w-auto max-w-[220px]" aria-label="Nhà cung cấp">' + selectOptions(S.db.suppliers.filter((s) => usedNCC.has(KT.keyOf(s.ma))), f.ncc, { allLabel: 'Mọi nhà cung cấp', label: (s) => s.ten }) + '</select>' +
    periodControls(f, 'ctd') +
    '</div>' +
    '<div class="no-print flex flex-wrap items-center gap-2">' +
    '<span class="text-[13px] text-ink-2">Mức hiển thị</span>' +
    '<div class="seg seg-sm" role="radiogroup" aria-label="Mức hiển thị">' +
    [[1, '1 · Chỉ tổng nhóm'], [2, '2 · Thêm cộng hạng mục'], [3, '3 · Toàn bộ chi tiết']].map(([v, l]) => '<label class="seg-item"><input type="radio" name="ct-level" value="' + v + '"' + (Number(f.level) === v ? ' checked' : '') + '><span>' + l + '</span></label>').join('') +
    '</div><span class="flex-1"></span>' +
    '<button type="button" class="btn btn-ghost" data-act="print">' + icon('print') + 'In</button>' +
    '<button type="button" class="btn btn-secondary" data-act="export">' + icon('excel') + 'Xuất Excel</button></div>' +
    '<section class="sheet overflow-hidden"><div class="table-scroll max-h-[calc(100vh-250px)] overflow-auto"><table class="ledger tree">' +
    '<thead><tr><th>Ngày</th><th>Vật tư</th><th>Diễn giải</th><th>Nhà cung cấp</th><th>Nhà</th><th class="num">Số lượng</th><th>ĐVT</th><th class="num money">Đơn giá</th><th class="num money">Thành tiền</th></tr></thead>' +
    '<tbody id="ct-body"></tbody><tfoot id="ct-foot"></tfoot></table></div></section>';

  const open = LS.get('cp.ct.open', {});
  const draw = () => {
    const res = KT.filterCosts(S.costLedger, { from: f.from, to: f.to, ct: f.ct, nha: f.nha, loai: f.loai, ncc: f.ncc });
    const s = KT.costSummary(S.db, { from: f.from, to: f.to, ct: f.ct, nha: f.nha, loai: f.loai, ncc: f.ncc }, S.costLedger);
    const byItem = new Map();
    res.rows.forEach((r) => { const k = KT.keyOf(r.maHM); if (!byItem.has(k)) byItem.set(k, []); byItem.get(k).push(r); });
    const level = Number(f.level) || 3;
    let html = '';
    s.groups.forEach((g) => {
      if (!g.total && !g.soDong) return;
      const gOpen = level >= 2 && open['g:' + g.ma] !== false;
      html += '<tr class="grp clickable" data-toggle="g:' + esc(g.ma) + '" tabindex="0"><td colspan="8"><span class="caret' + (gOpen ? ' open' : '') + '">' + icon('caretRight') + '</span>' + esc(g.ten) +
        ' <span class="font-normal text-ink-3">· ' + g.soDong + ' dòng</span></td><td class="num money"><span class="dbl">' + money(g.total) + '</span></td></tr>';
      if (!gOpen) return;
      g.items.forEach((it) => {
        const rows = byItem.get(KT.keyOf(it.ma));
        if (!rows) return;
        const iOpen = level >= 3 && open['i:' + it.ma] !== false;
        html += '<tr class="itm-sum clickable" data-toggle="i:' + esc(it.ma) + '" tabindex="0" id="hm-' + esc(it.ma) + '"><td colspan="8" class="pl-8"><span class="caret' + (iOpen ? ' open' : '') + '">' + icon('caretRight') + '</span>Cộng ' + esc(it.ten) +
          ' <span class="font-normal text-ink-3">· ' + rows.length + ' dòng</span></td><td class="num money font-semibold">' + money(it.total) + '</td></tr>';
        if (!iOpen) return;
        html += rows.map((r) => '<tr class="dtl"><td class="whitespace-nowrap pl-14">' + fdate(r.ngay) + '</td>' +
          '<td>' + (r.maVT ? '<span class="font-semibold">' + esc(r.maVT) + '</span><div class="sub">' + esc(r.tenVT) + '</div>' : '') + '</td>' +
          '<td class="wrap-text">' + esc(r.dienGiai) + '</td><td>' + esc(r.tenNCC || r.maNCC) + '</td><td class="text-ink-2">' + esc(r.maNha) + '</td>' +
          '<td class="num">' + KT.fmtQty(r.soLuong) + '</td><td class="text-ink-2">' + esc(r.dvt) + '</td><td class="num money">' + money(r.donGia) + '</td><td class="num money">' + money(r.thanhTien) + '</td></tr>').join('');
      });
    });
    $('#ct-body', root).innerHTML = html || '<tr><td colspan="9" class="empty">Không có chi phí nào khớp bộ lọc.</td></tr>';
    $('#ct-foot', root).innerHTML = '<tr><td colspan="8">Tổng cộng · ' + res.rows.length + ' dòng</td><td class="num money"><span class="dbl">' + money(res.total) + '</span></td></tr>';
  };

  const rerender = () => renderCostDetail(root);
  $('#ct-ct', root).addEventListener('change', (e) => { f.ct = e.target.value; f.nha = ''; saveFilter('cpCt'); rerender(); });
  $('#ct-nha', root).addEventListener('change', (e) => { f.nha = e.target.value; saveFilter('cpCt'); draw(); });
  $('#ct-loai', root).addEventListener('change', (e) => { f.loai = e.target.value; saveFilter('cpCt'); draw(); });
  $('#ct-ncc', root).addEventListener('change', (e) => { f.ncc = e.target.value; saveFilter('cpCt'); draw(); });
  bindPeriodControls(root, f, 'ctd', () => { saveFilter('cpCt'); rerender(); });
  root.querySelectorAll('input[name=ct-level]').forEach((r) => r.addEventListener('change', () => {
    f.level = Number(r.value);
    Object.keys(open).forEach((k) => delete open[k]);
    LS.set('cp.ct.open', open);
    saveFilter('cpCt');
    draw();
  }));
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (a) {
      if (a.dataset.act === 'export') download('/api/export/costs' + (f.ct ? '?ct=' + encodeURIComponent(f.ct) : ''));
      if (a.dataset.act === 'print') printView('CHI TIẾT CHI PHÍ THEO NHÓM', ctLabel(f.ct) + '. ' + KT.describeRange(f.from, f.to), S.db.settings);
      return;
    }
    const t = e.target.closest('[data-toggle]');
    if (!t) return;
    const k = t.dataset.toggle;
    const isOpen = !!t.querySelector('.caret.open');
    open[k] = !isOpen;
    LS.set('cp.ct.open', open);
    draw();
  });
  root.addEventListener('keydown', (e) => {
    const t = e.target.closest('[data-toggle]');
    if (t && e.key === 'Enter') t.click();
  });
  draw();
}

/* ============================== CÔNG NỢ NHÀ CUNG CẤP ============================== */

export function renderDebt(root) {
  root = freshRoot(root);
  const f = S.filters.cpCn;
  const d = KT.supplierDebt(S.db, { ct: f.ct, to: f.to });
  if (!f.pham) f.pham = 'ct';
  let rows = f.pham === 'ct' ? d.rows.filter((r) => r.lienQuan) : f.pham === 'active' ? d.rows.filter((r) => r.soDongCP || r.soDongTT) : d.rows.slice();
  const tot = d.sumRows(rows);
  if (f.sort === 'conLai') rows.sort((a, b) => b.conLai - a.conLai);
  else if (f.sort === 'phatSinh') rows.sort((a, b) => b.phatSinh - a.phatSinh);
  else if (f.sort === 'name') rows.sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
  const sel = LS.get('cp.cn.sel', '');
  const theoCT = KT.projectDebtSummary(S.db, { to: f.to, all: !!f.allCT });

  root.innerHTML =
    '<div class="print-only" id="print-head"></div>' +
    '<div class="no-print flex flex-wrap items-center gap-2">' +
    '<select id="cn-ct" class="input w-auto max-w-[300px]" aria-label="Công trình">' + ctOptions(f.ct) + '</select>' +
    '<label class="flex items-center gap-2 text-[13.5px] text-ink-2">Đến ngày <input type="date" id="cn-to" class="input w-auto" value="' + esc(f.to || '') + '"></label>' +
    '<select id="cn-pham" class="input w-auto" aria-label="Phạm vi nhà cung cấp">' + [['ct', 'NCC liên quan công trình'], ['active', 'Mọi NCC có phát sinh'], ['all', 'Tất cả NCC trong danh mục']].map(([v, l]) =>
      '<option value="' + v + '"' + (f.pham === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
    '<span class="flex-1"></span>' +
    '<select id="cn-sort" class="input w-auto" aria-label="Sắp xếp">' + [['conLai', 'Còn nợ nhiều trước'], ['phatSinh', 'Chi phí lớn trước'], ['name', 'Theo tên A đến Z'], ['catalog', 'Theo danh mục']].map(([v, l]) =>
      '<option value="' + v + '"' + (f.sort === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
    '<button type="button" class="btn btn-ghost" data-act="print">' + icon('print') + 'In</button>' +
    '<button type="button" class="btn btn-secondary" data-act="export">' + icon('excel') + 'Xuất Excel</button></div>' +
    '<section class="sheet overflow-hidden" aria-labelledby="h-theo-ct"><div class="sheet-head pb-1"><div><h3 id="h-theo-ct" class="sheet-title">Tổng hợp nợ và đã thanh toán theo công trình</h3>' +
    '<p class="sheet-note">Bấm một công trình để xem công nợ từng nhà cung cấp của công trình đó' + (f.to ? ', tính đến ngày ' + fdate(f.to) : '') + '.' +
    (f.ct ? ' <a href="#" class="font-semibold text-pen underline underline-offset-2" data-act="all-ct">Xem tất cả công trình</a>' : '') + '</p></div>' +
    '<label class="check no-print"><input type="checkbox" id="cn-allct"' + (f.allCT ? ' checked' : '') + '>Hiện cả dự án chưa nhập chi phí</label></div>' +
    projectDebtHtml(theoCT, f.ct) + '</section>' +
    '<h3 class="mt-1 text-[15px] font-semibold">Công nợ theo nhà cung cấp · ' + esc(ctLabel(f.ct)) + '</h3>' +
    '<div class="equation"><div class="eq-cell"><span class="eq-label">Chi phí phát sinh</span><span class="eq-value">' + money(tot.phatSinh) + '</span></div><span class="eq-op">−</span>' +
    '<div class="eq-cell"><span class="eq-label">Đã trả, đã ứng</span><span class="eq-value">' + money(tot.daTra) + '</span></div><span class="eq-op">=</span>' +
    '<div class="eq-cell"><span class="eq-label">Chênh lệch</span><span class="eq-value' + (tot.conLai > 0 ? ' neg' : '') + '">' + money(tot.conLai) + '</span></div><span class="eq-sep"></span>' +
    '<div class="eq-cell"><span class="eq-label">Tổng còn nợ</span><span class="eq-value text-alert">' + money(tot.conNo) + '</span></div>' +
    '<div class="eq-cell"><span class="eq-label">Tổng ứng dư</span><span class="eq-value text-caution">' + money(tot.ungDu) + '</span></div></div>' +
    '<p class="text-[13px] text-ink-3">Chi phí phát sinh lấy từ sổ chi phí (khối lượng đã nhận). Đã trả lấy từ sổ thu chi: tổng chi trừ tổng thu của cùng mã NCC' + (f.ct ? ' và cùng mã dự án ' + esc(f.ct) : '') + '. Hai sổ không sửa dữ liệu của nhau. ' +
    (f.pham === 'ct' ? '“Liên quan công trình” = NCC có chi phí công trình, hoặc có khoản trả gắn với công trình đang có chi phí.' : '') + '</p>' +
    '<div class="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">' +
    '<section class="sheet overflow-hidden"><div class="overflow-x-auto"><table class="ledger">' +
    '<thead><tr><th>Nhà cung cấp</th><th>Loại</th><th class="num money">Chi phí phát sinh</th><th class="num money">Đã trả / đã ứng</th><th class="num money">Còn lại</th><th>Tình trạng</th><th class="no-print"></th></tr></thead><tbody>' +
    (rows.length ? rows.map((r) => '<tr class="clickable' + (KT.keyOf(r.ma) === KT.keyOf(sel) ? ' is-active' : '') + '" data-ma="' + esc(r.ma) + '" tabindex="0">' +
      '<td><div class="code">' + esc(r.ma) + '</div><div class="sub">' + esc(r.ten) + '</div></td><td class="text-ink-2">' + esc(r.loai) + '</td>' +
      '<td class="num money">' + money(r.phatSinh) + '</td><td class="num money">' + money(r.daTra) + '</td>' +
      '<td class="num money font-semibold' + (r.conLai > 0 ? ' neg' : '') + '">' + money(r.conLai) + '</td>' +
      '<td>' + debtChip(r) + '</td>' +
      '<td class="actions no-print">' + (r.conLai > 0 && r.inCatalog ? '<button type="button" class="btn btn-ghost btn-sm" data-act="pay" title="Ghi phiếu chi trả nhà cung cấp này trong sổ thu chi">' + icon('handCoins') + 'Trả tiền</button>' : '') + '</td></tr>').join('')
      : '<tr><td colspan="7" class="empty">Không có công nợ nào.</td></tr>') +
    '</tbody><tfoot><tr><td colspan="2">Tổng cộng</td><td class="num money">' + money(tot.phatSinh) + '</td><td class="num money">' + money(tot.daTra) + '</td><td class="num money"><span class="dbl">' + money(tot.conLai) + '</span></td><td colspan="2"></td></tr></tfoot></table></div></section>' +
    '<aside class="sheet no-print xl:sticky xl:top-[104px]" id="cn-detail"></aside></div>';

  const drawDetail = (ma) => {
    const el = $('#cn-detail', root);
    const r = d.rows.find((x) => KT.keyOf(x.ma) === KT.keyOf(ma));
    if (!r) { el.innerHTML = '<p class="p-6 text-center text-ink-3">Chọn một nhà cung cấp để xem chi tiết phát sinh và thanh toán.</p>'; return; }
    const costs = S.costLedger.filter((c) => KT.keyOf(c.maNCC) === KT.keyOf(ma) && (!f.ct || KT.keyOf(c.maCT) === KT.keyOf(f.ct)) && (!f.to || c.ngay <= f.to));
    const pays = S.ledger.filter((e) => KT.keyOf(e.maNCC) === KT.keyOf(ma) && (!f.ct || KT.keyOf(e.maDuAn) === KT.keyOf(f.ct)) && (!f.to || e.ngay <= f.to));
    // gom chi phí theo phiếu cho gọn
    const slips = KT.costSlips(Object.assign({}, S.db, { costs }), costs);
    el.innerHTML = '<div class="sheet-head"><div><h3 class="sheet-title">' + esc(r.ten) + '</h3><p class="sheet-note">' + esc(r.ma) + (r.loai ? ' · ' + esc(r.loai) : '') + '</p></div>' + debtChip(r) + '</div>' +
      '<div class="px-5 pb-2"><div class="flex items-baseline justify-between"><h4 class="text-[13px] font-semibold text-ink-2">Chi phí phát sinh (' + costs.length + ' dòng)</h4><b class="tabular-nums">' + money(r.phatSinh) + '</b></div>' +
      '<ul class="mt-1 max-h-[260px] divide-y divide-rule overflow-auto">' + (slips.map((s) => '<li class="flex justify-between gap-2 py-1.5 text-[13px]"><span class="min-w-0 truncate"><span class="tabular-nums text-ink-3">' + fdate(s.ngay) + '</span> ' + esc(s.hangMuc.join(', ') || s.soPhieu) +
        (s.lines.length > 1 ? ' <span class="pill">' + s.lines.length + ' dòng</span>' : '') + '</span><span class="tabular-nums">' + money(s.total) + '</span></li>').join('') || '<li class="py-2 text-[13px] text-ink-3">Chưa có.</li>') + '</ul></div>' +
      '<div class="border-t border-rule px-5 pt-3 pb-4"><div class="flex items-baseline justify-between"><h4 class="text-[13px] font-semibold text-ink-2">Đã trả trong sổ thu chi (' + pays.length + ' dòng)</h4><b class="tabular-nums">' + money(r.daTra) + '</b></div>' +
      '<ul class="mt-1 max-h-[220px] divide-y divide-rule overflow-auto">' + (pays.map((e) => '<li class="flex justify-between gap-2 py-1.5 text-[13px]"><span class="min-w-0 truncate"><span class="tabular-nums text-ink-3">' + fdate(e.ngay) + '</span> ' + esc(e.soPhieu ? e.soPhieu + ' · ' : '') + esc(e.noiDung) + '</span>' +
        '<span class="tabular-nums ' + (e.thu ? 'text-income' : '') + '">' + (e.thu ? '−' + money(e.thu) : money(e.chi)) + '</span></li>').join('') || '<li class="py-2 text-[13px] text-ink-3">Chưa có khoản chi nào cho nhà cung cấp này.</li>') + '</ul>' +
      '<div class="mt-3 flex flex-wrap gap-2"><button type="button" class="btn btn-secondary btn-sm" data-act="to-ledger">' + icon('book') + 'Sổ chi phí của NCC</button>' +
      '<button type="button" class="btn btn-secondary btn-sm" data-act="to-cash">' + icon('receipt') + 'Sổ thu chi của NCC</button>' +
      (r.conLai > 0 && r.inCatalog ? '<button type="button" class="btn btn-primary btn-sm" data-act="pay">' + icon('handCoins') + 'Ghi phiếu chi ' + money(r.conLai) + '</button>' : '') + '</div></div>';
    el.dataset.ma = r.ma;
  };

  $('#cn-ct', root).addEventListener('change', (e) => { f.ct = e.target.value; saveFilter('cpCn'); renderDebt(root); });
  $('#cn-to', root).addEventListener('change', (e) => { f.to = e.target.value; saveFilter('cpCn'); renderDebt(root); });
  $('#cn-pham', root).addEventListener('change', (e) => { f.pham = e.target.value; saveFilter('cpCn'); renderDebt(root); });
  $('#cn-sort', root).addEventListener('change', (e) => { f.sort = e.target.value; saveFilter('cpCn'); renderDebt(root); });
  $('#cn-allct', root).addEventListener('change', (e) => { f.allCT = e.target.checked; saveFilter('cpCn'); renderDebt(root); });
  const pay = (ma) => {
    const r = d.rows.find((x) => KT.keyOf(x.ma) === KT.keyOf(ma));
    if (!r) return;
    openEntryForm({ maNCC: r.ma, maDuAn: f.ct || '', chi: r.conLai, noiDung: 'Thanh toán công nợ ' + r.ten + (f.ct ? ' công trình ' + f.ct : '') }, { loai: 'chi' });
  };
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (a) {
      const act = a.dataset.act;
      const row = a.closest('tr[data-ma]');
      const ma = row ? row.dataset.ma : ($('#cn-detail', root).dataset.ma || '');
      if (act === 'all-ct') { e.preventDefault(); f.ct = ''; saveFilter('cpCn'); renderDebt(root); return; }
      if (act === 'export') download('/api/export/cost-debt?' + [f.ct ? 'ct=' + encodeURIComponent(f.ct) : '', f.to ? 'to=' + f.to : ''].filter(Boolean).join('&'));
      else if (act === 'print') printView('CÔNG NỢ NHÀ CUNG CẤP', ctLabel(f.ct) + (f.to ? '. Đến ngày ' + fdate(f.to) : ''), S.db.settings);
      else if (act === 'pay') pay(ma);
      else if (act === 'to-ledger') goLedger({ ncc: ma, ct: f.ct });
      else if (act === 'to-cash') {
        Object.assign(S.filters.so, { duAn: f.ct || '', ncc: ma, loai: '', q: '', period: 'tat-ca', from: '', to: '' });
        saveFilter('so');
        location.hash = '#/so-thu-chi';
      }
      return;
    }
    const ctRow = e.target.closest('tr[data-ct]');
    if (ctRow) {
      f.ct = KT.keyOf(f.ct) === KT.keyOf(ctRow.dataset.ct) ? '' : ctRow.dataset.ct;
      saveFilter('cpCn');
      renderDebt(root);
      return;
    }
    const tr = e.target.closest('tr[data-ma]');
    if (tr) {
      LS.set('cp.cn.sel', tr.dataset.ma);
      $$('tr[data-ma]', root).forEach((x) => x.classList.toggle('is-active', x === tr));
      drawDetail(tr.dataset.ma);
    }
  });
  root.addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr[data-ma], tr[data-ct]');
    if (tr && e.key === 'Enter') tr.click();
  });
  drawDetail(sel);
}

/* ---------------- Tổng hợp nợ / đã thanh toán theo công trình ---------------- */
// sum = KT.projectDebtSummary(...). Dòng bấm được (data-ct) để lọc theo công trình đó.
function projectDebtHtml(sum, activeCt) {
  const dash = '<span class="text-ink-3">—</span>';
  const pctBar = (r) => {
    if (r.tiLeDaTra == null) return dash;
    const w = Math.min(100, r.tiLeDaTra * 100);
    return '<div class="flex items-center justify-end gap-2"><div class="mbar mt-0 w-20" aria-hidden="true"><span class="mbar-fill' + (r.tiLeDaTra > 1 ? ' over' : '') + '" style="width:' + w.toFixed(1) + '%"></span></div>' +
      '<span class="w-12 text-right tabular-nums">' + pct(r.tiLeDaTra) + '</span></div>';
  };
  const body = sum.rows.length ? sum.rows.map((r) =>
    '<tr class="clickable' + (activeCt && KT.keyOf(activeCt) === KT.keyOf(r.ma) ? ' is-active' : '') + '" data-ct="' + esc(r.ma) + '" tabindex="0" aria-label="Xem công nợ công trình ' + esc(r.ma) + '">' +
    '<td><div class="code">' + esc(r.ma) + '</div><div class="sub">' + esc(r.ten) + (r.coChiPhi ? '' : ' · chưa nhập chi phí') + '</div></td>' +
    '<td class="num money font-semibold">' + (r.coChiPhi ? money(r.phatSinh) : dash) + '</td>' +
    '<td class="num money">' + money(r.daTra) + '</td>' +
    '<td class="num">' + pctBar(r) + '</td>' +
    '<td class="num money font-semibold' + (r.conNo ? ' neg' : '') + '">' + (r.coChiPhi ? money(r.conNo) : dash) + (r.soNCCNo ? '<div class="sub">' + r.soNCCNo + ' NCC</div>' : '') + '</td>' +
    '<td class="num money' + (r.ungDu ? ' text-caution' : '') + '">' + (r.coChiPhi ? money(r.ungDu) : dash) + (r.soNCCDu && r.coChiPhi ? '<div class="sub">' + r.soNCCDu + ' NCC</div>' : '') + '</td>' +
    '<td class="num money text-ink-2">' + (r.chiKhac ? money(r.chiKhac) : '') + '</td></tr>').join('')
    : '<tr><td colspan="7" class="empty">Chưa có công trình nào có chi phí.</td></tr>';
  const t = sum.total;
  return '<div class="overflow-x-auto"><table class="ledger">' +
    '<thead><tr><th>Công trình</th><th class="num money">Chi phí phát sinh</th><th class="num money">Đã thanh toán NCC</th><th class="num">% đã thanh toán</th>' +
    '<th class="num money">Còn nợ NCC</th><th class="num money">Ứng dư NCC</th><th class="num money" title="Khoản chi trong sổ thu chi có mã dự án nhưng không ghi mã NCC">Chi khác (không ghi NCC)</th></tr></thead>' +
    '<tbody>' + body + '</tbody>' +
    (sum.rows.length > 1 ? '<tfoot><tr><td>Tổng cộng</td><td class="num money">' + money(t.phatSinh) + '</td><td class="num money">' + money(t.daTra) + '</td><td class="num">' + (t.tiLeDaTra == null ? '' : pct(t.tiLeDaTra)) + '</td>' +
      '<td class="num money"><span class="dbl">' + money(t.conNo) + '</span></td><td class="num money">' + money(t.ungDu) + '</td><td class="num money">' + (t.chiKhac ? money(t.chiKhac) : '') + '</td></tr></tfoot>' : '') +
    '</table></div>' +
    '<p class="px-4 py-2.5 text-[12.5px] leading-relaxed text-ink-3">Đã thanh toán = tổng chi trừ tổng thu trong sổ thu chi có ghi cả Mã dự án và Mã NCC. Còn nợ / ứng dư cộng theo từng NCC của công trình (NCC này ứng dư không bù cho NCC khác còn nợ).' +
    (sum.traChuaGanCT.soDong ? ' <span class="font-medium text-caution">' + icon('warnTri', 'align-[-2px]') + ' Có ' + sum.traChuaGanCT.soDong + ' khoản trả cho NCC công trình (' + money(sum.traChuaGanCT.soTien) +
      ' đ) chưa ghi mã dự án nên chưa tính vào công trình nào.</span>' : '') + '</p>';
}

export function debtChip(r) {
  if (r.status === 'no') return '<span class="chip chip-over">' + icon('warn') + 'Còn nợ</span>';
  if (r.status === 'du') return '<span class="chip chip-near">' + icon('arrowOut') + 'Ứng dư</span>';
  return '<span class="chip chip-ok">' + icon('checkCircle') + 'Đã tất toán</span>';
}

/* ============================== GIÁ VẬT TƯ ============================== */

export function renderPrices(root) {
  root = freshRoot(root);
  const f = S.filters.cpGia;
  const usedNCC = new Set(S.db.costs.filter((c) => c.maVT).map((c) => KT.keyOf(c.maNCC)));
  root.innerHTML =
    '<div class="grid items-start gap-5 lg:grid-cols-[480px_minmax(0,1fr)]">' +
    '<aside class="sheet flex flex-col overflow-hidden lg:sticky lg:top-[104px] lg:max-h-[calc(100vh-128px)]">' +
    '<div class="flex flex-col gap-2 border-b border-rule p-3">' +
    '<label class="search">' + icon('search') + '<input id="gia-q" type="search" class="input" placeholder="Tìm mã, tên vật tư" value="' + esc(f.q) + '"></label>' +
    '<div class="flex gap-2"><select id="gia-ncc" class="input flex-1" aria-label="Nhà cung cấp">' + selectOptions(S.db.suppliers.filter((s) => usedNCC.has(KT.keyOf(s.ma))), f.ncc, { allLabel: 'Mọi nhà cung cấp', label: (s) => s.ten }) + '</select>' +
    '<select id="gia-hm" class="input flex-1" aria-label="Hạng mục">' + selectOptions(S.db.costItems, f.hm, { allLabel: 'Mọi hạng mục', label: (i) => i.ten }) + '</select></div></div>' +
    '<div class="flex-1 overflow-auto"><table class="ledger ledger-compact"><thead><tr><th>Vật tư</th><th class="num">Lần</th><th class="num money">Giá gần nhất</th><th class="num">Biến động</th></tr></thead><tbody id="gia-list"></tbody></table></div></aside>' +
    '<section class="flex min-w-0 flex-col gap-4" id="gia-detail"></section></div>';

  const drawList = () => {
    const q = KT.normalizeText(f.q).trim();
    const stats = KT.materialStats(S.db, { ncc: f.ncc }).filter((m) => (!f.hm || KT.keyOf(m.maHM) === KT.keyOf(f.hm)) &&
      (!q || KT.normalizeText(m.ma + ' ' + m.ten).includes(q))).sort((a, b) => b.soLan - a.soLan || a.ma.localeCompare(b.ma));
    if (!f.vt && stats.length) f.vt = stats[0].ma;
    $('#gia-list', root).innerHTML = stats.length ? stats.map((m) => {
      const spread = m.min > 0 ? (m.max - m.min) / m.min : 0;
      return '<tr class="clickable' + (KT.keyOf(m.ma) === KT.keyOf(f.vt) ? ' is-active' : '') + '" data-vt="' + esc(m.ma) + '" tabindex="0"><td><div class="font-semibold">' + highlight(m.ma, f.q) + '</div><div class="sub">' + highlight(m.ten, f.q) + (m.dvt ? ' · ' + esc(m.dvt) : '') + '</div></td>' +
        '<td class="num">' + m.soLan + '</td><td class="num money">' + money(m.last) + '</td><td class="num text-[12.5px] ' + (spread > 0.05 ? 'text-caution font-semibold' : 'text-ink-3') + '">' + (m.soLan > 1 ? (spread ? '±' + pct(spread) : 'ổn định') : '') + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="empty">Chưa có vật tư nào được mua.</td></tr>';
  };

  const drawDetail = () => {
    const el = $('#gia-detail', root);
    const m = materialByCode(f.vt);
    const hist = f.vt ? KT.priceHistory(S.db, f.vt).filter((h) => !f.ncc || KT.keyOf(h.maNCC) === KT.keyOf(f.ncc)) : [];
    if (!hist.length) { el.innerHTML = '<div class="sheet p-10 text-center text-ink-3">Chọn một vật tư ở danh sách bên trái để xem lịch sử đơn giá.</div>'; return; }
    const st = KT.materialStats(S.db, { ncc: f.ncc }).find((x) => KT.keyOf(x.ma) === KT.keyOf(f.vt));
    const byNcc = new Map();
    hist.forEach((h) => { const k = h.maNCC || '(không NCC)'; if (!byNcc.has(k)) byNcc.set(k, []); byNcc.get(k).push(h); });
    const it = m ? itemByCode(m.maHM) : null;
    el.innerHTML =
      '<div class="flex flex-wrap items-end justify-between gap-3"><div><h2 class="text-[20px] font-semibold font-stretch-[108%]">' + esc(f.vt) + (m ? ' · ' + esc(m.ten) : '') + '</h2>' +
      '<p class="mt-0.5 text-[13.5px] text-ink-2">' + (m && m.dvt ? 'Đơn vị ' + esc(m.dvt) + ' · ' : '') + (it ? 'Hạng mục ' + esc(it.ten) : '') + '</p></div>' +
      '<button type="button" class="btn btn-secondary btn-sm" data-act="to-ledger">' + icon('book') + 'Xem trong sổ chi phí</button></div>' +
      '<div class="stats">' +
      stat('Số lần mua', st.soLan, st.soNCC + ' nhà cung cấp') + stat('Tổng số lượng', KT.fmtQty(st.tongSL) + (m && m.dvt ? ' ' + esc(m.dvt) : ''), 'Tổng tiền ' + money(st.tongTien) + ' đ') +
      stat('Giá gần nhất', money(st.last), fdate(st.lastNgay) + (st.lastNCC ? ' · ' + esc((supplierByCode(st.lastNCC) || {}).ten || st.lastNCC) : '')) +
      stat('Thấp nhất / cao nhất', money(st.min) + ' – ' + money(st.max), 'Bình quân gia quyền ' + money(st.binhQuan)) + '</div>' +
      '<section class="sheet px-5 pt-4 pb-3"><h3 class="sheet-title">Đơn giá theo thời gian</h3><div class="bars mt-3" id="gia-chart"></div>' +
      '<div class="mt-1 flex flex-wrap gap-3 text-[12.5px] text-ink-2" id="gia-legend"></div></section>' +
      '<section class="sheet overflow-hidden"><div class="overflow-x-auto"><table class="ledger"><thead><tr><th>Ngày</th><th>Nhà cung cấp</th><th>Công trình</th><th>Diễn giải</th><th class="num">Số lượng</th><th class="num money">Đơn giá</th><th class="num">So lần trước (cùng NCC)</th><th class="num money">Thành tiền</th></tr></thead><tbody>' +
      hist.slice().reverse().map((h) => '<tr><td class="whitespace-nowrap">' + fdate(h.ngay) + '</td><td>' + esc(h.tenNCC || h.maNCC) + '</td><td class="code">' + esc(h.maCT) + '</td><td class="wrap-text text-ink-2">' + esc(h.dienGiai) + '</td>' +
        '<td class="num">' + KT.fmtQty(h.soLuong) + '</td><td class="num money font-semibold">' + money(h.donGia) + '</td>' +
        '<td class="num ' + (h.chenhLech > 0 ? 'text-alert' : h.chenhLech < 0 ? 'text-income' : 'text-ink-3') + '">' + (h.chenhLech == null ? '' : h.chenhLech === 0 ? 'bằng' : (h.chenhLech > 0 ? '+' : '−') + money(Math.abs(h.chenhLech))) + '</td>' +
        '<td class="num money">' + money(h.thanhTien) + '</td></tr>').join('') + '</tbody></table></div></section>';
    drawPriceChart($('#gia-chart', el), $('#gia-legend', el), byNcc);
  };

  $('#gia-q', root).addEventListener('input', debounce((e) => { f.q = e.target.value; saveFilter('cpGia'); drawList(); }, 120));
  $('#gia-ncc', root).addEventListener('change', (e) => { f.ncc = e.target.value; saveFilter('cpGia'); drawList(); drawDetail(); });
  $('#gia-hm', root).addEventListener('change', (e) => { f.hm = e.target.value; saveFilter('cpGia'); drawList(); });
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act=to-ledger]');
    if (a) { goLedger({ vt: f.vt, ncc: f.ncc }); return; }
    const tr = e.target.closest('tr[data-vt]');
    if (!tr) return;
    f.vt = tr.dataset.vt;
    saveFilter('cpGia');
    $$('tr[data-vt]', root).forEach((x) => x.classList.toggle('is-active', x === tr));
    drawDetail();
  });
  root.addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr[data-vt]');
    if (tr && e.key === 'Enter') tr.click();
  });
  drawList();
  drawDetail();
}

function stat(label, value, sub) {
  return '<div class="stat"><div class="stat-label">' + esc(label) + '</div><div class="stat-value">' + value + '</div>' + (sub ? '<div class="stat-sub">' + sub + '</div>' : '') + '</div>';
}

const SERIES = ['#2F5DAA', '#B8621B', '#1D6B47', '#7A4FA3', '#B3261E', '#4A5670'];

function drawPriceChart(el, legend, byNcc) {
  const all = [];
  byNcc.forEach((list) => list.forEach((h) => all.push(h)));
  const W = 640;
  const H = 210;
  const m = { l: 64, r: 16, t: 14, b: 28 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const t = (iso) => Date.parse(iso + 'T00:00:00Z');
  let t0 = Math.min.apply(null, all.map((h) => t(h.ngay)));
  let t1 = Math.max.apply(null, all.map((h) => t(h.ngay)));
  if (t1 === t0) { t0 -= 86400000 * 15; t1 += 86400000 * 15; }
  let lo = Math.min.apply(null, all.map((h) => h.donGia));
  let hi = Math.max.apply(null, all.map((h) => h.donGia));
  if (hi === lo) { lo = lo * 0.9; hi = hi * 1.1 || 1; }
  const pad = (hi - lo) * 0.12;
  lo = Math.max(0, lo - pad);
  hi += pad;
  const x = (iso) => m.l + ((t(iso) - t0) / (t1 - t0)) * iw;
  const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * ih;
  let svg = '';
  [lo, (lo + hi) / 2, hi].forEach((v) => {
    svg += '<line class="grid-line" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"/>' +
      '<text class="axis" x="' + (m.l - 6) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end">' + esc(money(Math.round(v))) + '</text>';
  });
  const dates = Array.from(new Set(all.map((h) => h.ngay))).sort();
  // nhãn ngày: bỏ bớt nhãn sát nhau (luôn giữ ngày cuối)
  const ticks = [];
  dates.forEach((d, i) => {
    const xx = x(d);
    const prev = ticks[ticks.length - 1];
    if (prev && xx - prev.x < 44) {
      if (i === dates.length - 1) ticks[ticks.length - 1] = { x: xx, d };
      return;
    }
    ticks.push({ x: xx, d });
  });
  ticks.forEach((tk) => { svg += '<text class="axis" x="' + tk.x.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(fdate(tk.d).slice(0, 5)) + '</text>'; });
  let k = 0;
  let leg = '';
  byNcc.forEach((list, ncc) => {
    const color = SERIES[k++ % SERIES.length];
    const name = (supplierByCode(ncc) || {}).ten || ncc;
    if (list.length > 1) svg += '<polyline fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" points="' + list.map((h) => x(h.ngay).toFixed(1) + ',' + y(h.donGia).toFixed(1)).join(' ') + '"/>';
    list.forEach((h) => { svg += '<circle cx="' + x(h.ngay).toFixed(1) + '" cy="' + y(h.donGia).toFixed(1) + '" r="4" fill="' + color + '" stroke="#fff" stroke-width="1.5"><title>' + esc(fdate(h.ngay) + ' · ' + name + ': ' + money(h.donGia) + ' đ') + '</title></circle>'; });
    leg += '<span class="flex items-center gap-1.5"><span class="inline-block size-2.5 rounded-full" style="background:' + color + '"></span>' + esc(name) + '</span>';
  });
  el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Đơn giá theo thời gian">' + svg + '</svg>';
  legend.innerHTML = leg;
}
