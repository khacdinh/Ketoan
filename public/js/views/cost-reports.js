/* Báo cáo chi phí công trình: bảng điều khiển (TONGHOP), chi tiết theo nhóm (CHI_TIET_THEO_NHOM),
 * công nợ NCC (CONGNO_NCC), thống kê giá vật tư. */
import { $, $$, esc, money, fdate, fmtShort, icon, download, periodControls, bindPeriodControls, refreshPeriod, freshRoot, debounce, highlight, LS, dateField } from '../ui.js';
import { S, saveFilter, costProjects, projectByCode, supplierByCode, materialByCode, itemByCode } from '../state.js';
import { printView } from '../print.js';
import { comboHtml, bindCombo } from '../combo.js';
import { openEntryForm } from '../forms.js';
import { openExtPayForm, deleteExtPay } from '../extpay.js';
import { openSoDuDauForm, deleteSoDuDau } from '../sodudau.js';

const KT = window.KT;
const HEAVY_ROWS = 1500;
// tỷ lệ rất nhỏ nhưng khác 0 thì ghi "< 0,1%" (tránh hiện 0,0% cho khoản có phát sinh)
const pct = (x) => (x > 0 && x < 0.0005 ? '< 0,1%' : (x * 100).toFixed(1).replace('.', ',') + '%');

function ctLabel(ct) {
  const p = ct ? projectByCode(ct) : null;
  return p ? p.ma + ' — ' + p.ten : ct ? ct : 'Tất cả công trình';
}

function goLedger(patch) {
  Object.assign(S.filters.cpSo, { period: 'tat-ca', from: '', to: '', ct: '', nha: '', nhom: '', hm: '', loai: '', ncc: '', vt: '', q: '' }, patch);
  saveFilter('cpSo');
  location.hash = '#/cp-so';
}

// Ô gõ tìm (combo.js) cho các bộ lọc: công trình, nhà, nhà cung cấp, hạng mục
const ctCombo = (id, value) => ({ id, list: costProjects(), value, noun: 'công trình', placeholder: 'Công trình: gõ mã, tên', label: 'Lọc theo công trình', cls: 'w-[220px] max-sm:w-full' });
const houseCombo = (id, ct, value) => ({ id, list: S.db.houses.filter((h) => !ct || KT.keyOf(h.maCT) === KT.keyOf(ct)), value, none: '(Không gán nhà)', noun: 'nhà',
  placeholder: 'Nhà: gõ mã, tên', label: 'Lọc theo nhà', cls: 'w-[160px] max-sm:w-full' });
const nccCombo = (id, list, value, cls) => ({ id, list, value, noun: 'nhà cung cấp', placeholder: 'NCC: gõ mã, tên', label: 'Lọc theo nhà cung cấp', cls: cls || 'w-[200px] max-sm:w-full' });

/* ============================== BẢNG ĐIỀU KHIỂN ============================== */

export function renderCostDashboard(root) {
  root = freshRoot(root);
  const f = refreshPeriod(S.filters.cpTh);
  const s = KT.costSummary(S.db, f, S.costLedger);
  const debt = KT.supplierDebt(S.db, { ct: f.ct, to: f.to });
  const chk = KT.costCatalogCheck(S.db);
  const nVT = new Set(KT.filterCosts(S.costLedger, f).rows.map((r) => KT.keyOf(r.maVT)).filter(Boolean)).size;
  const openState = LS.get('cp.th.open', {});
  const cbCt = ctCombo('th-ct', f.ct);
  const cbNha = houseCombo('th-nha', f.ct, f.nha);

  // link: { loai } → mở sổ chi phí đã lọc; { debt: true } → mở công nợ NCC (cùng công trình, cùng kỳ)
  const tile = (label, value, sub, cls, link) => '<div class="stat' + (link ? ' stat-link' : '') + '"' +
    (link ? ' data-tile="' + esc(link.loai ? 'loai' : 'debt') + '"' + (link.loai ? ' data-loai="' + esc(link.loai) + '"' : '') + ' role="link" tabindex="0" aria-label="' + esc('Xem chi tiết ' + label) + '"' : '') + '>' +
    '<div class="stat-label">' + esc(label) + '</div><div class="stat-value ' + (cls || '') + '">' + value + '</div>' +
    (sub ? '<div class="stat-sub">' + sub + '</div>' : '') + '</div>';
  const loaiTiles = KT.LOAI_CP.map((l) => tile(l, money(s.byLoai[l] || 0), s.total ? pct((s.byLoai[l] || 0) / s.total) + ' tổng chi phí' +
    '<div class="mbar mt-1.5" aria-hidden="true"><span class="mbar-fill" style="width:' + (s.total ? ((s.byLoai[l] || 0) / s.total * 100).toFixed(2) : 0) + '%"></span></div>' : '', '', { loai: l })).join('');

  root.innerHTML =
    '<div class="print-only" id="print-head"></div>' +
    '<div class="no-print flex flex-wrap items-center gap-2">' +
    comboHtml(cbCt) + comboHtml(cbNha) +
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
    tile('Đã trả nhà cung cấp', money(debt.total.daTra), (debt.total.daTraNgoai ? 'Gồm ' + money(debt.total.daTraNgoai) + ' đ trả ngoài quỹ' : 'Từ sổ thu chi, theo mã NCC' + (f.ct ? ' và công trình' : '')), '', { debt: true }) +
    tile('Còn nợ nhà cung cấp', money(debt.total.conNo), debt.total.ungDu ? 'Ứng dư ' + money(debt.total.ungDu) + ' đ' : '', debt.total.conNo ? 'text-alert' : '', { debt: true }) +
    '</div>' +
    '<div class="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">' +
    '<section class="sheet overflow-hidden" aria-labelledby="h-nhom"><div class="sheet-head"><div><h3 id="h-nhom" class="sheet-title">Chi phí theo nhóm và hạng mục</h3>' +
    '<p class="sheet-note screen-hint">Bấm dòng nhóm để bung hoặc thu gọn hạng mục. Bấm hạng mục để xem chi tiết.</p></div>' +
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
  bindCombo($('#th-ct', root), cbCt, (v) => { f.ct = v; f.nha = ''; saveFilter('cpTh'); rerender(); });
  bindCombo($('#th-nha', root), cbNha, (v) => { f.nha = v; saveFilter('cpTh'); rerender(); });
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
    const t = e.target.closest('[data-tile]');
    if (t) {
      if (t.dataset.tile === 'loai') goLedger({ ct: f.ct, nha: f.nha, loai: t.dataset.loai, period: f.period, from: f.from, to: f.to });
      else {
        Object.assign(S.filters.cpCn, { ct: f.ct, nccs: [], tt: '', to: f.to, pham: 'ct' });
        saveFilter('cpCn');
        location.hash = '#/cp-cong-no';
      }
      return;
    }
    const g = e.target.closest('tr[data-group]');
    if (g) {
      const st = LS.get('cp.th.open', {});
      st[g.dataset.group] = !(st[g.dataset.group] !== false);
      LS.set('cp.th.open', st);
      const refocus = !!e.target.closest('.tree-toggle');
      rerender();
      // vẽ lại cả màn hình: đưa tiêu điểm bàn phím về đúng nút nhóm vừa bấm
      if (refocus) { const b = document.querySelector('#view tr[data-group="' + CSS.escape(g.dataset.group) + '"] .tree-toggle'); if (b) b.focus(); }
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
    if (e.key !== 'Enter' || e.target.closest('button, a')) return;
    const tr = e.target.closest('tr[data-group], tr[data-item], tr[data-ct], [data-tile]');
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
    html += '<tr class="grp clickable" data-group="' + esc(g.ma) + '">' +
      '<td><button type="button" class="tree-toggle" aria-expanded="' + open + '"><span class="caret' + (open ? ' open' : '') + '">' + icon('caretRight') + '</span>' + esc(g.ten) + '</button></td>' +
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
  return '<div class="mt-2 overflow-x-auto"><table class="ledger ledger-compact"><thead><tr><th>Tháng</th><th class="num money">Trong tháng</th><th class="num money">Lũy kế</th></tr></thead><tbody>' +
    byMonth.map((m) => '<tr><td>' + (m.thang ? m.thang.slice(5) + '/' + m.thang.slice(0, 4) : 'Chưa có ngày') + '</td><td class="num money">' + money(m.total) + '</td><td class="num money text-ink-2">' + money(m.luyKe) + '</td></tr>').join('') +
    '</tbody></table></div>';
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
  const cbCt = ctCombo('ct-ct', f.ct);
  const cbNha = houseCombo('ct-nha', f.ct, f.nha);
  const cbNcc = nccCombo('ct-ncc', S.db.suppliers.filter((s) => usedNCC.has(KT.keyOf(s.ma)) || KT.keyOf(s.ma) === KT.keyOf(f.ncc)), f.ncc);
  root.innerHTML =
    '<div class="print-only" id="print-head"></div>' +
    '<div class="no-print flex flex-wrap items-center gap-2">' +
    comboHtml(cbCt) + comboHtml(cbNha) +
    '<select id="ct-loai" class="input w-auto" aria-label="Loại chi phí"><option value="">Mọi loại CP</option>' + KT.LOAI_CP.map((l) => '<option' + (f.loai === l ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>' +
    comboHtml(cbNcc) +
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
    // Nhiều dòng thì không bung sẵn từng dòng chi tiết (hàng chục nghìn dòng DOM vẽ rất chậm): bấm từng hạng mục để xem
    const heavy = level >= 3 && res.rows.length > HEAVY_ROWS;
    let html = heavy ? '<tr><td colspan="9" class="text-[12.5px] text-ink-3">Có ' + res.rows.length + ' dòng chi phí nên các hạng mục đang thu gọn. Bấm vào một hạng mục để xem từng dòng, hoặc ' +
      '<button type="button" class="btn btn-ghost btn-sm no-print" data-act="open-all">mở tất cả (chậm)</button></td></tr>' : '';
    s.groups.forEach((g) => {
      if (!g.total && !g.soDong) return;
      const gOpen = level >= 2 && open['g:' + g.ma] !== false;
      html += '<tr class="grp clickable" data-toggle="g:' + esc(g.ma) + '"><td colspan="8"><button type="button" class="tree-toggle" aria-expanded="' + gOpen + '"><span class="caret' + (gOpen ? ' open' : '') + '">' + icon('caretRight') + '</span>' + esc(g.ten) + '</button>' +
        ' <span class="font-normal text-ink-3">· ' + g.soDong + ' dòng</span></td><td class="num money"><span class="dbl">' + money(g.total) + '</span></td></tr>';
      if (!gOpen) return;
      g.items.forEach((it) => {
        const rows = byItem.get(KT.keyOf(it.ma));
        if (!rows) return;
        const iOpen = level >= 3 && (heavy ? open['i:' + it.ma] === true : open['i:' + it.ma] !== false);
        html += '<tr class="itm-sum clickable" data-toggle="i:' + esc(it.ma) + '" id="hm-' + esc(it.ma) + '"><td colspan="8" class="pl-8"><button type="button" class="tree-toggle" aria-expanded="' + iOpen + '"><span class="caret' + (iOpen ? ' open' : '') + '">' + icon('caretRight') + '</span>Cộng ' + esc(it.ten) + '</button>' +
          ' <span class="font-normal text-ink-3">· ' + rows.length + ' dòng</span></td><td class="num money font-semibold">' + money(it.total) + '</td></tr>';
        if (!iOpen) return;
        html += rows.map((r) => '<tr class="dtl"><td class="whitespace-nowrap pl-14">' + fdate(r.ngay) + '</td>' +
          '<td>' + (r.maVT ? '<span class="font-semibold">' + esc(r.maVT) + '</span><div class="sub">' + esc(r.tenVT) + '</div>' : '') + '</td>' +
          '<td class="wrap-text">' + esc(r.dienGiai) + '</td><td>' + esc(r.tenNCC || r.maNCC) + '</td><td class="text-ink-2">' + esc(r.maNha) + '</td>' +
          '<td class="num">' + KT.fmtQty(r.soLuong) + '</td><td class="text-ink-2">' + esc(r.dvt) + '</td><td class="num money">' + (KT.isKhoan(r) ? '<span class="text-[12.5px] text-ink-3">theo khoản</span>' : money(r.donGia)) + '</td><td class="num money">' + money(r.thanhTien) + '</td></tr>').join('');
      });
    });
    $('#ct-body', root).innerHTML = html || '<tr><td colspan="9" class="empty">Không có chi phí nào khớp bộ lọc.</td></tr>';
    $('#ct-foot', root).innerHTML = '<tr><td colspan="8">Tổng cộng · ' + res.rows.length + ' dòng</td><td class="num money"><span class="dbl">' + money(res.total) + '</span></td></tr>';
  };

  const rerender = () => renderCostDetail(root);
  bindCombo($('#ct-ct', root), cbCt, (v) => { f.ct = v; f.nha = ''; saveFilter('cpCt'); rerender(); });
  bindCombo($('#ct-nha', root), cbNha, (v) => { f.nha = v; saveFilter('cpCt'); draw(); });
  $('#ct-loai', root).addEventListener('change', (e) => { f.loai = e.target.value; saveFilter('cpCt'); draw(); });
  bindCombo($('#ct-ncc', root), cbNcc, (v) => { f.ncc = v; saveFilter('cpCt'); draw(); });
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
      if (a.dataset.act === 'open-all') { S.db.costItems.forEach((it) => { open['i:' + it.ma] = true; open['g:' + it.maNhom] = true; }); LS.set('cp.ct.open', open); draw(); }
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
    const refocus = !!e.target.closest('.tree-toggle');
    draw();
    if (refocus) { const b = root.querySelector('tr[data-toggle="' + CSS.escape(k) + '"] .tree-toggle'); if (b) b.focus(); }
  });
  draw();
}

/* ============================== GIÁ VẬT TƯ ============================== */

export function renderPrices(root) {
  root = freshRoot(root);
  const f = S.filters.cpGia;
  const usedNCC = new Set(S.db.costs.filter((c) => c.maVT).map((c) => KT.keyOf(c.maNCC)));
  const cbNcc = nccCombo('gia-ncc', S.db.suppliers.filter((s) => usedNCC.has(KT.keyOf(s.ma)) || KT.keyOf(s.ma) === KT.keyOf(f.ncc)), f.ncc, 'min-w-0 flex-1');
  const cbHm = { id: 'gia-hm', list: S.db.costItems, value: f.hm, show: 'ten', noun: 'hạng mục', placeholder: 'Hạng mục: gõ tên', label: 'Lọc theo hạng mục', cls: 'min-w-0 flex-1' };
  root.innerHTML =
    '<div class="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[480px_minmax(0,1fr)]">' +
    '<aside class="sheet flex flex-col overflow-hidden lg:sticky lg:top-[104px] lg:max-h-[calc(100vh-128px)]">' +
    '<div class="flex flex-col gap-2 border-b border-rule p-3">' +
    '<label class="search">' + icon('search') + '<input id="gia-q" type="search" class="input" placeholder="Tìm mã, tên vật tư" value="' + esc(f.q) + '"></label>' +
    '<div class="flex gap-2">' + comboHtml(cbNcc) + comboHtml(cbHm) + '</div></div>' +
    '<div class="flex-1 overflow-auto"><table class="ledger ledger-compact"><thead><tr><th>Vật tư</th><th class="num">Lần</th><th class="num money">Giá gần nhất</th><th class="num" title="Giá cao nhất so với giá thấp nhất">Chênh giá</th></tr></thead><tbody id="gia-list"></tbody></table></div></aside>' +
    '<section class="flex min-w-0 flex-col gap-4" id="gia-detail"></section></div>';

  const drawList = () => {
    const q = KT.normalizeText(f.q).trim();
    const stats = KT.materialStats(S.db, { ncc: f.ncc }).filter((m) => (!f.hm || KT.keyOf(m.maHM) === KT.keyOf(f.hm)) &&
      (!q || KT.normalizeText(m.ma + ' ' + m.ten).includes(q))).sort((a, b) => b.soLan - a.soLan || a.ma.localeCompare(b.ma));
    if (!f.vt && stats.length) f.vt = stats[0].ma;
    $('#gia-list', root).innerHTML = stats.length ? stats.map((m) => {
      const spread = m.min > 0 ? (m.max - m.min) / m.min : 0;
      return '<tr class="clickable' + (KT.keyOf(m.ma) === KT.keyOf(f.vt) ? ' is-active' : '') + '" data-vt="' + esc(m.ma) + '" tabindex="0"><td><div class="font-semibold">' + highlight(m.ma, f.q) + '</div><div class="sub">' + highlight(m.ten, f.q) + (m.dvt ? ' · ' + esc(m.dvt) : '') + '</div></td>' +
        '<td class="num">' + m.soLan + '</td><td class="num money">' + (m.last == null ? '<span class="text-ink-3">theo khoản</span>' : money(m.last)) + '</td><td class="num text-[12.5px] ' + (spread > 0.05 ? 'text-caution font-semibold' : 'text-ink-3') + '"' + (m.soLan > 1 && spread ? ' title="Giá cao nhất ' + money(m.max) + ' đ, thấp nhất ' + money(m.min) + ' đ: chênh ' + pct(spread) + '"' : '') + '>' + (m.soLan > 1 ? (spread ? pct(spread) : 'ổn định') : '') + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="empty">Chưa có vật tư nào được mua.</td></tr>';
  };

  const drawDetail = () => {
    const el = $('#gia-detail', root);
    const m = materialByCode(f.vt);
    const hist = f.vt ? KT.priceHistory(S.db, f.vt).filter((h) => !f.ncc || KT.keyOf(h.maNCC) === KT.keyOf(f.ncc)) : [];
    const st = KT.materialStats(S.db, { ncc: f.ncc }).find((x) => KT.keyOf(x.ma) === KT.keyOf(f.vt));
    if (!hist.length) {
      el.innerHTML = '<div class="sheet p-10 text-center text-ink-3">' + (st ? esc(f.vt) + ' chỉ có ' + st.soLan + ' dòng nhập theo khoản (không có số lượng, đơn giá), tổng ' + money(st.tongTien) + ' đ — không có lịch sử đơn giá.' :
        'Chọn một vật tư ở danh sách bên trái để xem lịch sử đơn giá.') + '</div>';
      return;
    }
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
  bindCombo($('#gia-ncc', root), cbNcc, (v) => { f.ncc = v; saveFilter('cpGia'); drawList(); drawDetail(); });
  bindCombo($('#gia-hm', root), cbHm, (v) => { f.hm = v; saveFilter('cpGia'); drawList(); });
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
