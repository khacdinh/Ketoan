/* Công nợ nhà cung cấp theo kỳ (gộp "Tổng hợp NCC" và "Công nợ NCC"):
 * Số dư đầu kỳ (Dư Nợ | Dư Có) · Trong kỳ (Phát sinh | Thanh toán) · Số dư cuối kỳ (Dư Nợ | Dư Có) · Tình trạng · Giao dịch gần nhất.
 * Dư Có = mình còn phải trả NCC; Dư Nợ = mình đã ứng trước / trả dư. Cuối kỳ luôn bằng Đầu kỳ + Phát sinh − Thanh toán. */
import { $, $$, esc, money, fdate, icon, download, periodControls, bindPeriodControls, refreshPeriod, freshRoot, debounce, LS, setPageActions } from '../ui.js';
import { S, saveFilter, supplierByCode } from '../state.js';
import { printView } from '../print.js';
import { comboHtml, bindCombo } from '../combo.js';
import { openEntryForm } from '../forms.js';
import { openExtPayForm } from '../extpay.js';
import { openSoDuDauForm } from '../sodudau.js';
import { coNoHtml, debtChip, debtLabel, goCostLedger, goCashLedger, chonNCC, ghiPhieuChi, ctNhan, phuongTrinhHtml, buTruSub, cauNoiHtml } from '../congno.js';
import { moBienBan } from '../bienban.js';
import { datCongTrinh } from '../ctpick.js';

const KT = window.KT;
const pct = (x) => (x > 0 && x < 0.0005 ? '< 0,1%' : (x * 100).toFixed(1).replace('.', ',') + '%');
const dm = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');
// Đối chiếu với màn Công nợ theo công trình (NCC được bù trừ giữa các công trình): tính lại khi dữ liệu hoặc kỳ đổi
let dcCache = null;
function doiChieu(from, to) {
  if (!dcCache || dcCache.db !== S.db || dcCache.from !== from || dcCache.to !== to) dcCache = { db: S.db, from, to, d: KT.doiChieuCongNo(S.db, { from, to }) };
  return dcCache.d;
}

function normalizeFilter(f) {
  if (!Array.isArray(f.nccs)) f.nccs = f.ncc ? [f.ncc] : [];
  delete f.ncc;
  if (!f.period) f.period = f.to ? 'khoang' : 'tat-ca';
  if (f.mode !== 'ct') f.mode = 'ncc';
  if (!['', 'no', 'du', 'ok'].includes(f.tt)) f.tt = '';
  if (typeof f.coSoLieu !== 'boolean') f.coSoLieu = true;
  if (!['cuoiKy', 'phatSinh', 'thanhToan', 'name'].includes(f.sort)) f.sort = 'cuoiKy';
  if (typeof f.q !== 'string') f.q = '';
  refreshPeriod(f);
  return f;
}

export function renderDebt(root) {
  root = freshRoot(root);
  const f = normalizeFilter(S.filters.cpCn);
  const nccs = f.nccs;
  let sel = LS.get('cp.cn.sel', '');
  const used = new Set(S.db.costs.map((c) => KT.keyOf(c.maNCC)));
  const cbNcc = { id: 'cn-ncc', list: S.db.suppliers.filter((x) => used.has(KT.keyOf(x.ma))).concat(S.db.suppliers.filter((x) => !used.has(KT.keyOf(x.ma)))).map((x) => ({ ma: x.ma, ten: x.ten, sub: x.loai })),
    value: '', noun: 'nhà cung cấp', placeholder: nccs.length ? 'Thêm NCC: gõ mã hoặc tên' : 'Tất cả · gõ mã hoặc tên', label: 'Lọc theo nhà cung cấp (chọn được nhiều)', cls: 'w-[240px] max-sm:w-full',
    accept: unknownNcc, multi: true, exclude: new Set(nccs.map(KT.keyOf)) };

  const action = (act) => {
    if (act === 'export') download('/api/export/suppliers?' + ['from', 'to'].filter((k) => f[k]).map((k) => k + '=' + f[k]).concat(f.coSoLieu ? ['chiCoPhatSinh=1'] : [], nccs.map((x) => 'nccs=' + encodeURIComponent(x))).join('&'));
    else if (act === 'print') printView('CÔNG NỢ NHÀ CUNG CẤP THEO KỲ', KT.describeRange(f.from, f.to) + '. ' + ctNhan(f.ct) + (nccs.length ? '. NCC: ' + nccs.map(nameOf).join(', ') : ''), S.db.settings);
    else if (act === 'dk-list' || act === 'dk-add') openSoDuDauForm(null, { maNCC: LS.get('cp.cn.sel', ''), maDuAn: f.ct || '' });
    else if (act === 'bien-ban') {
      const cur = LS.get('cp.cn.sel', '');
      const go = (ma) => moBienBan(ma, { from: f.from, to: f.to, ct: f.ct });
      if (cur && supplierByCode(cur)) go(cur); else chonNCC('Biên bản đối chiếu công nợ', 'Lập biên bản', go, '');
    }
  };
  setPageActions('<button type="button" class="btn btn-secondary" data-act="dk-add">' + icon('plus') + 'Số dư đầu kỳ</button>' +
    '<button type="button" class="btn btn-secondary" data-act="bien-ban">' + icon('paper') + 'Biên bản đối chiếu</button>' +
    '<button type="button" class="btn btn-secondary" data-act="print">' + icon('print') + 'In</button>' +
    '<button type="button" class="btn btn-secondary" data-act="export">' + icon('excel') + 'Xuất Excel</button>', action);

  root.innerHTML =
    '<div class="print-only" id="print-head"></div>' +
    '<div class="no-print flex flex-wrap items-center gap-2.5">' + periodControls(f, 'cn') +
    '<div class="seg" role="radiogroup" aria-label="Xem theo">' +
    [['ncc', 'Theo NCC'], ['ct', 'Theo công trình']].map(([v, l]) => '<label class="seg-item"><input type="radio" name="cn-mode" value="' + v + '"' + (f.mode === v ? ' checked' : '') + '><span>' + l + '</span></label>').join('') + '</div>' +
    '<span class="flex-1"></span>' +
    '<select id="cn-sort" class="input w-auto" aria-label="Sắp xếp">' + [['cuoiKy', 'Còn nợ cuối kỳ nhiều trước'], ['phatSinh', 'Phát sinh lớn trước'], ['thanhToan', 'Thanh toán lớn trước'], ['name', 'Theo tên A đến Z']].map(([v, l]) =>
      '<option value="' + v + '"' + (f.sort === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>' +
    '<div class="no-print flex flex-wrap items-center gap-2.5" id="cn-bar2">' +
    '<div class="fbox' + (nccs.length ? ' on' : '') + ' w-[300px]"><span class="lbl">NCC</span>' + comboHtml(cbNcc) + '</div>' +
    '<label class="search min-w-[200px] flex-1 max-w-[360px]">' + icon('search') + '<input id="cn-q" type="search" class="input" placeholder="Tìm mã hoặc tên nhà cung cấp" value="' + esc(f.q) + '" aria-label="Tìm nhà cung cấp"></label>' +
    '<div class="seg seg-sm" role="radiogroup" aria-label="Lọc theo tình trạng" id="cn-tt"></div>' +
    '<label class="check"><input type="checkbox" id="cn-so-lieu"' + (f.coSoLieu ? ' checked' : '') + '>Chỉ NCC có số liệu</label>' +
    '</div>' +
    '<div class="no-print flex flex-wrap items-center gap-2 text-[12.5px]" id="cn-chips"></div>' +
    '<div id="cn-body" class="flex flex-col gap-3"></div>';

  /* ---------- vẽ phần dữ liệu (không dựng lại ô lọc, để gõ tìm không mất tiêu điểm) ---------- */
  let d = null;
  let rows = [];
  let buTru = new Map();
  function draw() {
    const box = $('#cn-body', root);
    drawChips();
    if (f.mode === 'ct') { $('#cn-bar2', root).classList.add('opacity-50'); box.innerHTML = projectView(); return; }
    $('#cn-bar2', root).classList.remove('opacity-50');
    d = KT.supplierPeriod(S.db, { from: f.from, to: f.to, ct: f.ct, ncc: nccs });
    const q = KT.normalizeText(f.q).trim();
    let base = d.rows.filter((r) => !q || KT.normalizeText(r.ma + ' ' + r.ten + ' ' + r.loai).includes(q));
    if (!nccs.length && f.coSoLieu) base = base.filter((r) => r.coSoLieu);
    const cnt = { '': base.length, no: 0, du: 0, ok: 0 };
    base.forEach((r) => { cnt[r.status]++; });
    $('#cn-tt', root).innerHTML = [['', 'Tất cả'], ['no', 'Còn nợ'], ['du', 'Ứng dư'], ['ok', 'Đã tất toán']].map(([v, l]) =>
      '<label class="seg-item"><input type="radio" name="cn-tt" value="' + v + '"' + (f.tt === v ? ' checked' : '') + '><span>' + l + ' <b class="tabular-nums">' + cnt[v] + '</b></span></label>').join('');
    rows = base.filter((r) => !f.tt || r.status === f.tt);
    if (f.sort === 'phatSinh') rows.sort((a, b) => b.phatSinh - a.phatSinh);
    else if (f.sort === 'thanhToan') rows.sort((a, b) => b.thanhToan - a.thanhToan);
    else if (f.sort === 'name') rows.sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
    else rows.sort((a, b) => b.cuoiKy - a.cuoiKy);
    const tot = d.sumRows(rows);
    const dauCo = rows.reduce((t, r) => t + (r.dauKy > 0 ? r.dauKy : 0), 0);
    const dauNo = rows.reduce((t, r) => t + (r.dauKy < 0 ? -r.dauKy : 0), 0);
    const nNo = rows.filter((r) => r.status === 'no').length;
    const nDu = rows.filter((r) => r.status === 'du').length;
    const kyTu = f.from ? ' (' + dm(f.from) + ')' : '';
    // NCC còn nợ ở công trình này nhưng ứng trước ở công trình khác: màn này bù trừ (chỉ có nghĩa khi xem mọi công trình)
    const dc = f.ct ? null : doiChieu(f.from, f.to);
    buTru = new Map(dc ? dc.dsNCC.map((x) => [KT.keyOf(x.ma), x]) : []);
    box.innerHTML =
      phuongTrinhHtml({ dauCo, dauNo, phatSinh: tot.phatSinh, thanhToan: tot.thanhToan, traNgoai: tot.traNgoai, cuoiCo: tot.conNo, cuoiNo: tot.ungDu, nCo: nNo, nNo: nDu, donVi: 'NCC', kyTu,
        cauNoi: f.tt || f.q || nccs.length ? '' : cauNoiHtml(dc, 'ncc') }) + // chỉ khi bảng đang cộng đủ mọi NCC, để hai bộ số so được
      (dc && dc.dsNCC.length ? '<p class="no-print flex items-start gap-1.5 text-[12.5px] leading-relaxed text-ink-2" id="cn-bu-tru">' + icon('info', 'mt-0.5 flex-none text-pen') + '<span>' +
        dc.dsNCC.length + ' NCC vừa còn nợ ở công trình này vừa đã ứng trước ở công trình khác: màn này <b>bù trừ</b> hai khoản (tổng ' + money(dc.buTru) + ', ghi dưới số dư từng NCC). ' +
        'Màn <a class="text-pen underline underline-offset-2" href="#/cong-no-ct">Công nợ theo công trình</a> giữ riêng từng công trình nên Dư Có và Dư Nợ ở đó cùng lớn hơn ' + money(dc.buTru) + '; số thuần (Có − Nợ) hai màn bằng nhau. ' +
        'Trả tiền và đối chiếu với nhà cung cấp dùng số ở màn này.</span></p>' : '') +
      '<section class="sheet overflow-hidden"><div class="table-scroll scroll-x max-h-[calc(100vh-380px)] min-h-[200px] overflow-auto"><table class="ledger" id="cn-table">' +
      '<thead><tr><th rowspan="2">Nhà cung cấp</th><th colspan="2" class="num group">Số dư đầu kỳ</th><th colspan="2" class="num group">Trong kỳ</th><th colspan="2" class="num group">Số dư cuối kỳ</th><th rowspan="2">Tình trạng</th><th rowspan="2">GD gần nhất</th><th rowspan="2" class="no-print"><span class="sr-only">Thao tác</span></th></tr>' +
      '<tr><th class="num money sub2">Dư Nợ <span class="font-normal">(đã ứng trước)</span></th><th class="num money sub2">Dư Có <span class="font-normal">(còn phải trả)</span></th><th class="num money sub2">Phát sinh</th><th class="num money sub2">Thanh toán</th>' +
      '<th class="num money sub2">Dư Nợ <span class="font-normal">(đã ứng trước)</span></th><th class="num money sub2">Dư Có <span class="font-normal">(còn phải trả)</span></th></tr></thead><tbody>' +
      (rows.length ? rows.map((r) => rowHtml(r)).join('') : '<tr><td colspan="10" class="empty">' + (S.db.suppliers.length ? 'Không có nhà cung cấp nào khớp bộ lọc. <a href="#" class="font-bold text-pen underline underline-offset-2" data-act="clear">Xóa lọc</a>' : 'Chưa có nhà cung cấp.') + '</td></tr>') +
      '</tbody><tfoot><tr><td>Tổng cộng · ' + rows.length + ' NCC</td>' +
      '<td class="num money">' + money(dauNo) + '</td><td class="num money">' + money(dauCo) + '</td><td class="num money">' + money(tot.phatSinh) + '</td><td class="num money">' + money(tot.thanhToan) + '</td>' +
      '<td class="num money text-caution">' + money(tot.ungDu) + '</td><td class="num money"><span class="dbl">' + money(tot.conNo) + '</span></td><td colspan="3" class="font-normal text-[12px] text-ink-3">Thuần (Có − Nợ) <b class="tabular-nums text-ink" id="cn-thuan">' + coNoHtml(tot.cuoiKy) + '</b> · chi / thu không ghi NCC tách riêng ở sổ quỹ</td></tr></tfoot></table></div></section>';
  }

  function rowHtml(r) {
    const open = KT.keyOf(r.ma) === KT.keyOf(sel) && openMa === r.ma;
    const na = (n) => (n ? '<span class="tabular-nums">' + money(n) + '</span>' : '<span class="text-ink-3">–</span>');
    const x = buTru.get(KT.keyOf(r.ma));
    const bt = x ? buTruSub(x) : '';
    const ctrl = '<tr class="clickable' + (KT.keyOf(r.ma) === KT.keyOf(sel) ? ' is-active' : '') + '" data-ma="' + esc(r.ma) + '" tabindex="0" aria-expanded="' + open + '">' +
      '<td><b class="code">' + esc(r.ten) + '</b><div class="sub">' + esc(r.ma) + (r.loai ? ' · ' + esc(r.loai) : '') + (r.inCatalog ? '' : ' · chưa có trong danh mục') + '</div></td>' +
      '<td class="num money text-caution">' + (r.dauKy < 0 ? na(-r.dauKy) : na(0)) + '</td><td class="num money">' + (r.dauKy > 0 ? na(r.dauKy) : na(0)) + '</td>' +
      '<td class="num money">' + na(r.phatSinh) + '</td><td class="num money">' + na(r.thanhToan) + (r.traNgoai ? '<div class="sub" title="Trả từ nguồn khác, không qua quỹ tiền mặt">ngoài quỹ ' + money(r.traNgoai) + '</div>' : '') + '</td>' +
      '<td class="num money font-bold text-caution">' + (r.cuoiKy < 0 ? na(-r.cuoiKy) + bt : na(0)) + '</td><td class="num money font-bold">' + (r.cuoiKy >= 0 ? na(r.cuoiKy) + bt : na(0)) + '</td>' +
      '<td>' + debtChip(r.status) + '</td><td class="whitespace-nowrap tabular-nums text-ink-2">' + (r.last ? dm(r.last) : '') + '</td>' +
      '<td class="actions no-print"><div class="flex items-center justify-end gap-1">' +
      (r.cuoiKy > 0 && r.inCatalog ? '<button type="button" class="btn btn-secondary btn-sm" data-act="pay" title="Ghi phiếu chi trả nhà cung cấp này trong sổ thu chi (tiền quỹ)">Trả tiền</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" data-act="xp-add" title="Ghi khoản đã trả bằng nguồn tiền khác, ngoài quỹ (chuyển khoản công ty, chủ nhà trả thẳng…)">Nguồn khác</button>' : '') +
      '<button type="button" class="icon-btn" data-act="ledger" title="Sổ chi tiết công nợ" aria-label="Sổ chi tiết của ' + esc(r.ten) + '">' + icon('book') + '</button></div></td></tr>';
    if (!open) return ctrl;
    return ctrl + '<tr class="open-row no-print"><td colspan="10"><div class="flex flex-wrap items-center gap-2 px-1 py-1">' +
      '<button type="button" class="btn btn-secondary btn-sm !border-pen !text-accent-800" data-act="ledger">' + icon('book') + 'Sổ chi tiết <kbd>Enter</kbd></button>' +
      '<button type="button" class="btn btn-secondary btn-sm" data-act="bien-ban-row">' + icon('paper') + 'Biên bản đối chiếu</button>' +
      '<button type="button" class="btn btn-secondary btn-sm" data-act="to-ledger">Sổ chi phí của NCC</button>' +
      '<button type="button" class="btn btn-secondary btn-sm" data-act="to-cash">Sổ thu chi của NCC</button>' +
      (r.inCatalog ? '<button type="button" class="btn btn-secondary btn-sm" data-act="dk-row">' + icon('plus') + 'Số dư đầu kỳ</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" data-act="xp-add">Trả từ nguồn khác</button>' : '') +
      (r.cuoiKy > 0 && r.inCatalog ? '<button type="button" class="btn btn-primary btn-sm" data-act="pay">Ghi phiếu chi ' + money(r.cuoiKy) + '</button>' : '') +
      '</div></td></tr>';
  }

  function projectView() {
    const sum = KT.projectDebtSummary(S.db, { to: f.to, all: !!f.allCT, ncc: nccs });
    return '<section class="sheet overflow-hidden"><div class="sheet-head pb-1"><div><h3 class="sheet-title">Nợ và đã thanh toán theo công trình' + (f.to ? ', tính đến ngày ' + esc(fdate(f.to)) : '') + '</h3>' +
      '<p class="sheet-note screen-hint">Bấm một công trình để xem công nợ từng nhà cung cấp của công trình đó. ' +
      '<a class="no-print text-pen underline underline-offset-2" id="cn-sang-ct" href="#/cong-no-ct">Xem mọi công trình kèm từng NCC, bảng chéo NCC × công trình</a></p></div>' +
      '<label class="check no-print"><input type="checkbox" id="cn-allct"' + (f.allCT ? ' checked' : '') + '>Hiện cả công trình chưa nhập chi phí</label></div>' +
      projectDebtHtml(sum, f.ct) + '</section>';
  }

  function drawChips() {
    const chips = [];
    if (f.from || f.to) chips.push(['period', 'Kỳ ' + KT.describeRange(f.from, f.to).replace(/^Từ ngày /, '').replace(' đến ngày ', ' – ')]);
    if (f.ct) chips.push(['ct', 'Công trình: ' + ctNhan(f.ct)]);
    nccs.forEach((m) => chips.push(['ncc:' + m, 'NCC: ' + nameOf(m)]));
    $('#cn-chips', root).innerHTML = chips.length ? '<span class="text-ink-3">Đang lọc:</span>' + chips.map(([k, t]) => '<span class="filter-chip">' + esc(t) + '<button type="button" data-chip="' + esc(k) + '" aria-label="Bỏ lọc ' + esc(t) + '">' + icon('x') + '</button></span>').join('') +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="clear" id="cn-clear">Xóa lọc</button>' : '';
  }

  const redraw = () => { saveFilter('cpCn'); renderDebt(root); };
  bindPeriodControls(root, f, 'cn', () => { saveFilter('cpCn'); draw(); });
  root.querySelectorAll('input[name=cn-mode]').forEach((r) => r.addEventListener('change', () => { f.mode = r.value; redraw(); }));
  $('#cn-sort', root).addEventListener('change', (e) => { f.sort = e.target.value; saveFilter('cpCn'); draw(); });
  $('#cn-q', root).addEventListener('input', debounce((e) => { f.q = e.target.value; saveFilter('cpCn'); draw(); }, 120));
  $('#cn-so-lieu', root).addEventListener('change', (e) => { f.coSoLieu = e.target.checked; saveFilter('cpCn'); draw(); });
  $('#cn-tt', root).addEventListener('change', (e) => { if (e.target.name === 'cn-tt') { f.tt = e.target.value; saveFilter('cpCn'); draw(); } });
  bindCombo($('#cn-ncc', root), cbNcc, (v) => {
    if (!nccs.some((x) => KT.keyOf(x) === KT.keyOf(v))) nccs.push(v);
    LS.set('cp.cn.sel', v);
    redraw();
    setTimeout(() => { const el = document.getElementById('cn-ncc'); if (el) el.focus(); }, 0);
  });

  const rowOf = (ma) => (d ? d.rows.find((x) => KT.keyOf(x.ma) === KT.keyOf(ma)) : null);
  const maOfEvent = (a) => { const tr = a.closest('tr[data-ma]'); if (tr) return tr.dataset.ma; const open = a.closest('tr.open-row'); return open && open.previousElementSibling ? open.previousElementSibling.dataset.ma : sel; };
  const goLedger = (ma) => { LS.set('sct.ncc', ma); LS.set('cp.cn.sel', ma); location.hash = '#/so-chi-tiet-ncc'; };
  root.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-chip]');
    if (chip) {
      const k = chip.dataset.chip;
      if (k === 'period') Object.assign(f, { period: 'tat-ca', from: '', to: '', rel: false });
      else if (k === 'ct') { datCongTrinh(''); return; }
      else if (k.startsWith('ncc:')) f.nccs = nccs.filter((x) => x !== k.slice(4));
      saveFilter('cpCn');
      if (k !== 'ct') renderDebt(root);
      return;
    }
    const a = e.target.closest('[data-act]');
    if (a) {
      const act = a.dataset.act;
      const ma = maOfEvent(a);
      if (act === 'clear') { e.preventDefault(); Object.assign(f, { nccs: [], tt: '', q: '', period: 'tat-ca', from: '', to: '', rel: false }); saveFilter('cpCn'); renderDebt(root); return; }
      if (['export', 'print', 'dk-list', 'dk-add', 'bien-ban'].includes(act)) return; // đã xử lý ở nút đầu trang
      const r = rowOf(ma);
      if (act === 'ledger') goLedger(ma);
      else if (act === 'pay' && r) ghiPhieuChi(openEntryForm, r, f.ct);
      else if (act === 'xp-add' && r) openExtPayForm(null, { maNCC: r.ma, maDuAn: f.ct || '', soTien: r.cuoiKy > 0 ? r.cuoiKy : '' });
      else if (act === 'dk-row') openSoDuDauForm(null, { maNCC: ma, maDuAn: f.ct || '' });
      else if (act === 'bien-ban-row') moBienBan(ma, { from: f.from, to: f.to, ct: f.ct });
      else if (act === 'to-ledger') goCostLedger(ma, f.ct);
      else if (act === 'to-cash') goCashLedger(ma, f.ct);
      return;
    }
    const ctRow = e.target.closest('tr[data-ct]');
    if (ctRow) { f.mode = 'ncc'; saveFilter('cpCn'); datCongTrinh(ctRow.dataset.ct); return; }
    const tr = e.target.closest('tr[data-ma]');
    if (tr) {
      const ma = tr.dataset.ma;
      openMa = openMa === ma ? '' : ma;
      LS.set('cp.cn.sel', ma);
      sel = ma;
      draw();
    }
  });
  root.addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr[data-ma], tr[data-ct]');
    if (!tr) return;
    if (e.key === 'Enter' && tr.dataset.ma) { e.preventDefault(); goLedger(tr.dataset.ma); }
    else if (e.key === 'Enter') tr.click();
    else if (e.key === ' ' && tr.dataset.ma) { e.preventDefault(); tr.click(); }
  });
  $('#cn-body', root).addEventListener('change', (e) => { if (e.target.id === 'cn-allct') { f.allCT = e.target.checked; saveFilter('cpCn'); draw(); } });
  let openMa = '';
  draw();
}

const nameOf = (m) => { const x = supplierByCode(m); return x ? x.ten : m; };

// Mã NCC lạ (không có trong danh mục) nhưng có trong sổ chi phí / sổ thu chi: vẫn cho lọc
function unknownNcc(t) {
  const k = KT.keyOf(t);
  const r = S.db.costs.find((c) => KT.keyOf(c.maNCC) === k) || S.db.entries.find((e) => KT.keyOf(e.maNCC) === k);
  return r ? String(r.maNCC).trim() : '';
}

/* ---------------- Tổng hợp nợ / đã thanh toán theo công trình ---------------- */
export function projectDebtHtml(sum, activeCt) {
  const dash = '<span class="text-ink-3">—</span>';
  const pctBar = (r) => {
    if (r.tiLeDaTra == null) return dash;
    const w = Math.min(100, r.tiLeDaTra * 100);
    return '<div class="flex items-center justify-end gap-2"><div class="mbar mt-0 w-20" aria-hidden="true"><span class="mbar-fill' + (r.tiLeDaTra > 1 ? ' over' : '') + '" style="width:' + w.toFixed(1) + '%"></span></div>' +
      '<span class="w-12 text-right tabular-nums">' + pct(r.tiLeDaTra) + '</span></div>';
  };
  const body = sum.rows.length ? sum.rows.map((r) =>
    '<tr class="clickable' + (activeCt && KT.keyOf(activeCt) === KT.keyOf(r.ma) ? ' is-active' : '') + '" data-ct="' + esc(r.ma) + '" tabindex="0" aria-label="Xem công nợ công trình ' + esc(r.ma) + '">' +
    '<td><b class="code">' + esc(r.ma) + '</b><div class="sub">' + esc(r.ten) + (r.coChiPhi ? '' : ' · chưa nhập chi phí') + '</div></td>' +
    '<td class="num money font-bold">' + (r.coChiPhi ? money(r.phatSinh) : dash) + (r.dauKy ? '<div class="sub" title="Số dư đầu kỳ nhập tay của các NCC tại công trình này">đầu kỳ ' + money(r.dauKy) + '</div>' : '') + '</td>' +
    '<td class="num money">' + money(r.daTra) + '</td>' +
    '<td class="num">' + pctBar(r) + '</td>' +
    '<td class="num money font-bold">' + (r.coChiPhi ? money(r.conNo) : dash) + (r.soNCCNo ? '<div class="sub">' + r.soNCCNo + ' NCC</div>' : '') + '</td>' +
    '<td class="num money' + (r.ungDu ? ' text-caution' : '') + '">' + (r.coChiPhi ? money(r.ungDu) : dash) + (r.soNCCDu && r.coChiPhi ? '<div class="sub">' + r.soNCCDu + ' NCC</div>' : '') + '</td>' +
    '<td class="num money text-ink-2">' + (r.chiKhac ? money(r.chiKhac) : '') + '</td></tr>').join('')
    : '<tr><td colspan="7" class="empty">Chưa có công trình nào có chi phí.</td></tr>';
  const t = sum.total;
  return '<div class="overflow-x-auto"><table class="ledger">' +
    '<thead><tr><th>Công trình</th><th class="num money">Chi phí phát sinh</th><th class="num money">Đã thanh toán NCC</th><th class="num">% đã thanh toán</th>' +
    '<th class="num money">Dư Có (còn phải trả)</th><th class="num money">Dư Nợ (đã ứng trước)</th><th class="num money" title="Khoản chi trong sổ thu chi có mã công trình nhưng không ghi mã NCC">Chi khác (không ghi NCC)</th></tr></thead>' +
    '<tbody>' + body + '</tbody>' +
    (sum.rows.length > 1 ? '<tfoot><tr><td>Tổng cộng</td><td class="num money">' + money(t.phatSinh) + '</td><td class="num money">' + money(t.daTra) + '</td><td class="num">' + (t.tiLeDaTra == null ? '' : pct(t.tiLeDaTra)) + '</td>' +
      '<td class="num money"><span class="dbl">' + money(t.conNo) + '</span></td><td class="num money">' + money(t.ungDu) + '</td><td class="num money">' + (t.chiKhac ? money(t.chiKhac) : '') + '</td></tr></tfoot>' : '') +
    '</table></div>' +
    '<p class="px-4 py-2.5 text-[12px] leading-relaxed text-ink-3">Đã thanh toán = tổng chi trừ tổng thu trong sổ thu chi có ghi cả Mã công trình và Mã NCC, cộng khoản trả NCC từ nguồn khác (ngoài quỹ) có ghi công trình. Còn nợ / ứng dư cộng theo từng NCC của công trình (NCC ứng dư không bù cho NCC khác còn nợ).' +
    (sum.traChuaGanCT.soDong ? ' <span class="font-medium text-caution">' + icon('warnTri', 'align-[-2px]') + ' Có ' + sum.traChuaGanCT.soDong + ' khoản trả cho NCC công trình (' + money(sum.traChuaGanCT.soTien) +
      ' đ) chưa ghi mã công trình nên chưa tính vào công trình nào.</span>' : '') + '</p>';
}
