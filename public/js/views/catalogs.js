/* Danh mục công trình, danh mục nhà cung cấp / đối tượng, tổng hợp theo nhà cung cấp. */
import { $, esc, money, fdate, icon, highlight, download, api, toast, showError, confirmDialog, freshRoot, debounce, LS, periodControls, bindPeriodControls, refreshPeriod } from '../ui.js';
import { S, saveFilter } from '../state.js';
import { openProjectForm, openSupplierForm } from '../forms.js';
import { statusChip } from './dashboard.js';
import { printView } from '../print.js';
import { comboHtml, bindCombo } from '../combo.js';
import { mergeToolbarHtml, bindMergeUI, pickHead, pickCell, mergedRecords, mergedChip } from '../merge.js';
import { openSoDuDauList } from '../sodudau.js';
import { datCongTrinh } from '../ctpick.js';

const KT = window.KT;
const usedCost = (ma) => S.all.costs.filter((x) => KT.keyOf(x.maCT) === KT.keyOf(ma)).length;
const usedNcc = (ma) => S.all.costs.filter((x) => KT.keyOf(x.maNCC) === KT.keyOf(ma)).length;

function goLedger(field, ma) {
  Object.assign(S.filters.so, { duAn: '', ncc: '', loai: '', q: '', period: 'tat-ca', from: '', to: '' });
  S.filters.so[field] = ma;
  saveFilter('so');
  location.hash = '#/so-thu-chi';
}

// Thứ tự nút: Xem sổ → Sửa → Xóa (xóa luôn cuối, màu đỏ). o.xem = [{ act, title, ic }] các nút xem; o.khoa = lý do không xóa được (nút mờ + giải thích, bấm vẫn báo lý do)
function rowActions(label, o) {
  o = o || {};
  const xem = o.xem || [{ act: 'ledger', title: 'Xem sổ chi tiết', ic: 'book' }];
  return '<td class="actions no-print">' +
    xem.map((x) => '<button type="button" class="icon-btn" data-act="' + x.act + '" title="' + esc(x.title) + '" aria-label="' + esc(x.title + ' ' + label) + '">' + icon(x.ic) + '</button>').join('') +
    '<button type="button" class="icon-btn" data-act="edit" title="Sửa" aria-label="Sửa ' + esc(label) + '">' + icon('edit') + '</button>' +
    '<button type="button" class="icon-btn danger" data-act="del"' + (o.khoa ? ' data-khoa="1" title="' + esc(o.khoa) + '"' : ' title="Xóa (vào Thùng rác)"') + ' aria-label="Xóa ' + esc(label) + (o.khoa ? ' (chưa xóa được: ' + esc(o.khoa) + ')' : '') + '">' + icon('trash') + '</button></td>';
}

function toolbar(o) {
  return '<div class="no-print flex flex-wrap items-center gap-2">' +
    '<label class="search min-w-[260px]">' + icon('search') + '<input id="' + o.id + '" type="search" class="input" placeholder="' + esc(o.placeholder) + '" value="' + esc(o.q) + '" aria-label="' + esc(o.placeholder) + '"></label>' +
    (o.extra || '') +
    '<span class="flex-1"></span>' +
    '<button type="button" class="btn btn-ghost" data-act="print">' + icon('print') + 'In</button>' +
    '<button type="button" class="btn btn-secondary" data-act="export">' + icon('excel') + 'Xuất Excel</button>' +
    '<button type="button" class="btn btn-primary" data-act="add">' + icon('plus') + esc(o.addLabel) + '</button>' +
    '</div>';
}

/* ============================== CÔNG TRÌNH ============================== */

export function renderProjects(root) {
  root = freshRoot(root);
  const state = { q: LS.get('q.projects', ''), merged: LS.get('merged.projects', false) };
  root.innerHTML =
    '<div class="print-only" id="print-head"></div>' +
    toolbar({ id: 'pj-q', placeholder: 'Tìm mã hoặc tên công trình', q: state.q, addLabel: 'Thêm công trình', extra: mergeToolbarHtml('da', state.merged) }) +
    '<section class="sheet overflow-hidden">' +
    '<p class="no-print border-b border-rule px-4 py-2.5 text-[13px] text-ink-2" id="pj-count"></p>' +
    '<div class="overflow-x-auto"><table class="ledger">' +
    '<thead><tr>' + pickHead + '<th>Mã công trình</th><th>Tên công trình</th><th class="num money">Ngân sách dự kiến</th><th class="num money">Đã chi</th><th class="num money">Còn lại</th><th>Ngân sách</th><th>Trạng thái · khởi công</th><th class="num">Số dòng</th><th>Ghi chú</th><th class="no-print"><span class="sr-only">Thao tác</span></th></tr></thead>' +
    '<tbody id="pj-body"></tbody><tfoot id="pj-foot"></tfoot></table></div></section>';

  const draw = () => {
    const ps = KT.projectSummary(S.db);
    const byMa = new Map(ps.rows.map((r) => [KT.keyOf(r.ma), r]));
    const q = KT.normalizeText(state.q).trim();
    const list = S.db.projects.filter((p) => !q || KT.normalizeText(p.ma + ' ' + p.ten + ' ' + (p.ghiChu || '')).includes(q));
    $('#pj-count', root).innerHTML = '<b class="font-semibold text-ink">' + list.length + '</b> trên ' + S.db.projects.length + ' công trình. Bấm đúp một dòng để sửa.';
    $('#pj-body', root).innerHTML = (list.length ? list.map((p) => {
      const r = byMa.get(KT.keyOf(p.ma)) || { chi: 0, soDong: 0, chenhLech: p.nganSach || 0, status: 'idle', tiLe: 0 };
      return '<tr data-id="' + p.id + '">' + pickCell(p.ma) +
        '<td class="code">' + highlight(p.ma, state.q) + '</td><td class="min-w-[220px]">' + highlight(p.ten, state.q) + '</td>' +
        '<td class="num money">' + (p.nganSach ? money(p.nganSach) : '') + '</td>' +
        '<td class="num money font-semibold">' + money(r.chi) + '</td>' +
        '<td class="num money' + (r.chenhLech < 0 && p.nganSach ? ' neg' : '') + '">' + (p.nganSach ? money(r.chenhLech) : '') + '</td>' +
        '<td>' + statusChip(r) + '</td>' +
        '<td class="whitespace-nowrap">' + esc(p.trangThai || '') + (p.ngayKhoiCong ? '<div class="text-[12.5px] text-ink-2">Khởi công ' + fdate(p.ngayKhoiCong) + '</div>' : '') + '</td>' +
        '<td class="num">' + r.soDong + '</td>' +
        '<td class="text-[12.5px] text-ink-2">' + highlight(p.ghiChu || '', state.q) + '</td>' +
        rowActions(p.ma, { xem: [{ act: 'cost-ledger', title: 'Sổ chi phí của công trình', ic: 'table' }, { act: 'ledger', title: 'Sổ thu chi của công trình', ic: 'book' }],
          khoa: (r.soDong || usedCost(p.ma)) ? 'Đã có ' + (r.soDong + usedCost(p.ma)) + ' dòng sổ / chi phí: dùng Gộp mã để chuyển sang mã khác rồi mới xóa' : '' }) + '</tr>';
    }).join('') : '<tr><td colspan="11" class="empty">Không có công trình nào khớp. Thử từ khóa khác hoặc thêm công trình mới.</td></tr>') +
      // công trình đã gộp (ẩn mặc định): chỉ để tra cứu; muốn dùng lại thì hoàn tác ở màn Gộp mã
      (state.merged ? mergedRecords('da').filter((p) => !q || KT.normalizeText([p.ma, p.ten, p.gopVao].join(' ')).includes(q)).map((p) =>
        '<tr class="text-ink-3"><td class="no-print"></td><td class="code">' + esc(p.ma) + '</td><td>' + esc(p.ten) + '</td><td colspan="7">' + mergedChip(p) + '</td><td class="no-print"></td></tr>').join('') : '');
    $('#pj-foot', root).innerHTML = '<tr><td class="no-print"></td><td colspan="2">Tổng cộng</td><td class="num money">' + money(ps.total.nganSach) + '</td>' +
      '<td class="num money"><span class="dbl">' + money(ps.total.chi) + '</span></td><td class="money"></td><td colspan="2"></td><td class="num">' + ps.total.soDong + '</td><td colspan="2"></td></tr>';
  };

  $('#pj-q', root).addEventListener('input', debounce((e) => { state.q = e.target.value; LS.set('q.projects', state.q); draw(); }, 120));
  bindMergeUI(root, 'da', (v) => { state.merged = v; LS.set('merged.projects', v); draw(); }, { noun: 'công trình', list: () => S.db.projects, endpoint: () => '/api/projects' });
  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const tr = a.closest('tr[data-id]');
    const p = tr ? S.db.projects.find((x) => x.id === Number(tr.dataset.id)) : null;
    const act = a.dataset.act;
    if (act === 'add') openProjectForm(null);
    else if (act === 'export') download('/api/export/projects');
    else if (act === 'print') printView('DANH MỤC CÔNG TRÌNH VÀ NGÂN SÁCH', '', S.db.settings);
    else if (act === 'edit' && p) openProjectForm(p);
    else if (act === 'ledger' && p) goLedger('duAn', p.ma);
    else if (act === 'cost-ledger' && p) { Object.assign(S.filters.cpSo, { period: 'tat-ca', from: '', to: '', rel: false, nha: '', nhom: '', hm: '', loai: '', ncc: '', vt: '', q: '' }); datCongTrinh(p.ma); location.hash = '#/cp-so'; }
    else if (act === 'del' && p) {
      const used = S.all.entries.filter((x) => KT.keyOf(x.maDuAn) === KT.keyOf(p.ma)).length;
      if (used) return toast('Không xóa được: công trình ' + p.ma + ' đang có ' + used + ' dòng sổ. Chuyển các dòng đó sang công trình khác trước.', 'error');
      const usedCost = S.all.costs.filter((x) => KT.keyOf(x.maCT) === KT.keyOf(p.ma)).length;
      if (usedCost) return toast('Không xóa được: công trình ' + p.ma + ' đang có ' + usedCost + ' dòng chi phí.', 'error');
      if (!(await confirmDialog({ trash: true, title: 'Xóa công trình', html: 'Xóa công trình <b class="text-ink">' + esc(p.ma) + '</b>, ' + esc(p.ten) + '?', okText: 'Xóa công trình', danger: true }))) return;
      try { await api('DELETE', '/api/projects/' + p.id); toast('Đã xóa công trình ' + p.ma + ', chuyển vào Thùng rác'); } catch (err) { showError(err); }
    }
  });
  root.addEventListener('dblclick', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr || e.target.closest('button')) return;
    const p = S.db.projects.find((x) => x.id === Number(tr.dataset.id));
    if (p) openProjectForm(p);
  });
  draw();
}

/* ============================== NHÀ CUNG CẤP ============================== */

export function renderSuppliers(root) {
  root = freshRoot(root);
  const state = { q: LS.get('q.suppliers', ''), loai: LS.get('loai.suppliers', ''), merged: LS.get('merged.suppliers', false) };
  const types = Array.from(new Set(S.db.suppliers.map((s) => s.loai).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'vi'));
  if (state.loai && !types.includes(state.loai)) state.loai = '';
  root.innerHTML =
    '<div class="print-only" id="print-head"></div>' +
    toolbar({
      id: 'ncc-q', placeholder: 'Tìm mã, tên, số điện thoại', q: state.q, addLabel: 'Thêm nhà cung cấp',
      extra: '<label class="sr-only" for="ncc-loai">Loại đối tượng</label><select id="ncc-loai" class="input w-auto max-w-[220px]"><option value="">Mọi loại đối tượng</option>' +
        types.map((t) => '<option' + (t === state.loai ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select>' + mergeToolbarHtml('ncc', state.merged)
    }) +
    '<section class="sheet overflow-hidden">' +
    '<p class="no-print border-b border-rule px-4 py-2.5 text-[13px] text-ink-2" id="ncc-count"></p>' +
    '<div class="overflow-x-auto"><table class="ledger">' +
    '<thead><tr>' + pickHead + '<th>Mã</th><th>Tên nhà cung cấp, đối tượng</th><th>Loại đối tượng</th><th>Điện thoại</th><th>Địa chỉ</th><th class="num money">Đã thanh toán</th><th class="num">Số dòng</th><th>Ghi chú</th><th class="no-print"><span class="sr-only">Thao tác</span></th></tr></thead>' +
    '<tbody id="ncc-body"></tbody></table></div></section>';

  const draw = () => {
    const ss = KT.supplierSummary(S.db);
    const byMa = new Map(ss.rows.map((r) => [KT.keyOf(r.ma), r]));
    const q = KT.normalizeText(state.q).trim();
    const list = S.db.suppliers.filter((s) => (!state.loai || s.loai === state.loai) &&
      (!q || KT.normalizeText([s.ma, s.ten, s.loai, s.sdt, s.diaChi, s.ghiChu].join(' ')).includes(q)));
    $('#ncc-count', root).innerHTML = '<b class="font-semibold text-ink">' + list.length + '</b> trên ' + S.db.suppliers.length + ' đối tượng. Bấm đúp một dòng để sửa.';
    $('#ncc-body', root).innerHTML = (list.length ? list.map((s) => {
      const r = byMa.get(KT.keyOf(s.ma)) || { chi: 0, soDong: 0 };
      return '<tr data-id="' + s.id + '">' + pickCell(s.ma) +
        '<td class="code">' + highlight(s.ma, state.q) + '</td><td class="min-w-[180px]">' + highlight(s.ten, state.q) + '</td>' +
        '<td class="text-ink-2">' + highlight(s.loai || '', state.q) + '</td>' +
        '<td class="whitespace-nowrap">' + highlight(s.sdt || '', state.q) + '</td><td class="text-[12.5px] text-ink-2">' + highlight(s.diaChi || '', state.q) + '</td>' +
        '<td class="num money ' + (r.chi ? 'font-semibold' : 'text-ink-3') + '">' + money(r.chi) + '</td><td class="num">' + r.soDong + '</td>' +
        '<td class="text-[12.5px] text-ink-2">' + highlight(s.ghiChu || '', state.q) + '</td>' +
        rowActions(s.ma, { xem: [{ act: 'ncc-ledger', title: 'Sổ chi tiết công nợ', ic: 'book' }], khoa: (r.soDong || usedNcc(s.ma)) ? 'Đã có ' + (r.soDong + usedNcc(s.ma)) + ' dòng sổ / chi phí: dùng Gộp mã để chuyển sang mã khác rồi mới xóa' : '' }) + '</tr>';
    }).join('') : '<tr><td colspan="10" class="empty">Không có nhà cung cấp nào khớp. Thử từ khóa khác hoặc thêm mới.</td></tr>') +
      // mã đã gộp (ẩn mặc định): chỉ để tra cứu, không sửa / xóa; muốn dùng lại thì hoàn tác ở màn Gộp mã
      (state.merged ? mergedRecords('ncc').filter((s) => !q || KT.normalizeText([s.ma, s.ten, s.gopVao].join(' ')).includes(q)).map((s) =>
        '<tr class="text-ink-3"><td class="no-print"></td><td class="code">' + esc(s.ma) + '</td><td>' + esc(s.ten) + '</td><td>' + esc(s.loai || '') + '</td><td colspan="5">' + mergedChip(s) + '</td><td class="no-print"></td></tr>').join('') : '');
  };

  $('#ncc-q', root).addEventListener('input', debounce((e) => { state.q = e.target.value; LS.set('q.suppliers', state.q); draw(); }, 120));
  $('#ncc-loai', root).addEventListener('change', (e) => { state.loai = e.target.value; LS.set('loai.suppliers', state.loai); draw(); });
  bindMergeUI(root, 'ncc', (v) => { state.merged = v; LS.set('merged.suppliers', v); draw(); }, { noun: 'đối tượng', list: () => S.db.suppliers, endpoint: () => '/api/suppliers' });
  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const tr = a.closest('tr[data-id]');
    const s = tr ? S.db.suppliers.find((x) => x.id === Number(tr.dataset.id)) : null;
    const act = a.dataset.act;
    if (act === 'add') openSupplierForm(null);
    else if (act === 'export') download('/api/export/suppliers');
    else if (act === 'print') printView('DANH MỤC NHÀ CUNG CẤP VÀ ĐỐI TƯỢNG', '', S.db.settings);
    else if (act === 'edit' && s) openSupplierForm(s);
    else if (act === 'ncc-ledger' && s) { LS.set('sct.ncc', s.ma); location.hash = '#/so-chi-tiet-ncc'; }
    else if (act === 'del' && s) {
      const used = S.all.entries.filter((x) => KT.keyOf(x.maNCC) === KT.keyOf(s.ma)).length;
      if (used) return toast('Không xóa được: ' + s.ma + ' đang có ' + used + ' dòng sổ. Chuyển các dòng đó sang nhà cung cấp khác trước.', 'error');
      if (!(await confirmDialog({ trash: true, title: 'Xóa nhà cung cấp', html: 'Xóa <b class="text-ink">' + esc(s.ma) + '</b>, ' + esc(s.ten) + '?', okText: 'Xóa', danger: true }))) return;
      try { await api('DELETE', '/api/suppliers/' + s.id); toast('Đã xóa ' + s.ma + ', chuyển vào Thùng rác'); } catch (err) { showError(err); }
    }
  });
  root.addEventListener('dblclick', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr || e.target.closest('button')) return;
    const s = S.db.suppliers.find((x) => x.id === Number(tr.dataset.id));
    if (s) openSupplierForm(s);
  });
  draw();
}

/* ============================== TỔNG HỢP THEO NHÀ CUNG CẤP ============================== */

export function renderSupplierReport(root) {
  root = freshRoot(root);
  const f = refreshPeriod(S.filters.thncc);
  if (!Array.isArray(f.nccs)) f.nccs = [];
  // ô lọc NCC chọn nhiều (gõ mã hoặc tên, gợi ý không phân biệt dấu)
  const cbNcc = { id: 'th-ncc', list: S.db.suppliers.map((x) => ({ ma: x.ma, ten: x.ten, sub: x.loai })), value: '', multi: true, noun: 'nhà cung cấp',
    exclude: new Set(f.nccs.map(KT.keyOf)), placeholder: f.nccs.length ? 'Thêm NCC: gõ mã hoặc tên' : 'Lọc NCC: gõ mã hoặc tên', label: 'Lọc theo nhà cung cấp (chọn được nhiều)', cls: 'w-[240px] max-sm:w-full' };
  const nccNames = () => f.nccs.map((m) => { const x = S.db.suppliers.find((s) => KT.keyOf(s.ma) === KT.keyOf(m)); return x ? x.ten : m; });
  const SORTS = [['cuoiKy', 'Còn nợ cuối kỳ nhiều trước'], ['amount', 'Thanh toán lớn trước'], ['phatSinh', 'Phát sinh lớn trước'], ['catalog', 'Theo thứ tự danh mục'], ['name', 'Theo tên A đến Z']];
  const soDK = (S.all.soDuDauKy || []).length;
  root.innerHTML =
    '<div class="print-only" id="print-head"></div>' +
    '<div class="no-print flex flex-wrap items-center gap-2">' + periodControls(f, 'th') + comboHtml(cbNcc) +
    '<label class="check ml-1"><input type="checkbox" id="th-only"' + (f.chiCoPhatSinh ? ' checked' : '') + '>Chỉ nhà cung cấp có số liệu</label>' +
    '<span class="flex-1"></span>' +
    '<label class="sr-only" for="th-sort">Sắp xếp</label><select id="th-sort" class="input w-auto">' + SORTS.map(([v, l]) => '<option value="' + v + '"' + (f.sort === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
    '<button type="button" class="btn btn-ghost" data-act="dk-list" title="Xem, sửa các số dư đầu kỳ đã nhập">' + icon('scales') + 'Số dư đầu kỳ' + (soDK ? ' (' + soDK + ')' : '') + '</button>' +
    '<button type="button" class="btn btn-ghost" data-act="print">' + icon('print') + 'In</button>' +
    '<button type="button" class="btn btn-secondary" data-act="export">' + icon('excel') + 'Xuất Excel</button>' +
    '</div>' +
    (f.nccs.length ? '<div class="no-print flex flex-wrap items-center gap-1.5" id="th-chips"><span class="text-[13px] text-ink-2">Đang lọc:</span>' +
      f.nccs.map((m, i) => '<span class="filter-chip" data-ma="' + esc(m) + '"><span><b>' + esc(m) + '</b> – ' + esc(nccNames()[i]) + '</span><button type="button" data-act="rm-ncc" aria-label="Bỏ lọc ' + esc(m) + '">' + icon('x') + '</button></span>').join('') +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="clear-ncc">' + icon('eraser') + 'Xóa lọc</button></div>' : '') +
    '<div class="equation" id="th-eq"></div>' +
    '<p class="text-[13px] text-ink-3">Đầu kỳ = số dư đầu kỳ nhập tay + chi phí trừ thanh toán trước ngày đầu kỳ. Phát sinh = chi phí trong sổ chi phí công trình. ' +
    'Thanh toán = sổ thu chi (chi trừ thu lại của cùng mã NCC) cộng khoản trả từ nguồn khác, ngoài quỹ. Cuối kỳ = Đầu kỳ + Phát sinh − Thanh toán (dương = còn nợ, âm = ứng dư). ' +
    '<span class="no-print">Công nợ có từ trước khi dùng phần mềm: bấm <b class="font-medium text-ink-2">Đầu kỳ</b> ở dòng nhà cung cấp để nhập.</span></p>' +
    '<section class="sheet overflow-hidden">' +
    '<div class="overflow-x-auto"><table class="ledger">' +
    '<thead><tr><th>Nhà cung cấp, đối tượng</th><th>Loại đối tượng</th><th class="num money">Đầu kỳ</th><th class="num money">Phát sinh trong kỳ</th><th class="num money">Thanh toán trong kỳ</th>' +
    '<th class="num money">Cuối kỳ</th><th>Lần gần nhất</th><th class="no-print"><span class="sr-only">Thao tác</span></th></tr></thead>' +
    '<tbody id="th-body"></tbody><tfoot id="th-foot"></tfoot></table></div></section>';

  const so = (n, cls) => '<span class="' + (cls || '') + '">' + (n ? money(n) : '<span class="text-ink-3">0</span>') + '</span>';
  const sub = (txt) => '<div class="sub">' + txt + '</div>';
  const draw = () => {
    const kq = KT.supplierPeriod(S.db, { from: f.from, to: f.to, ncc: f.nccs.length ? f.nccs : null });
    const only = f.nccs.length ? new Set(f.nccs.map(KT.keyOf)) : null;
    const rows = (f.chiCoPhatSinh && !only ? kq.rows.filter((r) => r.coSoLieu) : kq.rows.slice());
    const t = kq.sumRows(rows);
    if (f.sort === 'cuoiKy') rows.sort((a, b) => b.cuoiKy - a.cuoiKy);
    if (f.sort === 'amount') rows.sort((a, b) => b.thanhToan - a.thanhToan || b.soDongTT - a.soDongTT);
    if (f.sort === 'phatSinh') rows.sort((a, b) => b.phatSinh - a.phatSinh);
    if (f.sort === 'name') rows.sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
    $('#th-eq', root).innerHTML =
      '<div class="eq-cell"><span class="eq-label">Đầu kỳ' + (f.from ? ' (' + fdate(f.from) + ')' : '') + '</span><span class="eq-value">' + money(t.dauKy) + '</span></div><span class="eq-op">+</span>' +
      '<div class="eq-cell"><span class="eq-label">Phát sinh trong kỳ</span><span class="eq-value">' + money(t.phatSinh) + '</span></div><span class="eq-op">−</span>' +
      '<div class="eq-cell"><span class="eq-label">Thanh toán trong kỳ</span><span class="eq-value">' + money(t.thanhToan) + '</span></div><span class="eq-op">=</span>' +
      '<div class="eq-cell"><span class="eq-label">Cuối kỳ' + (f.to ? ' (' + fdate(f.to) + ')' : '') + '</span><span class="eq-value' + (t.cuoiKy > 0 ? ' neg' : '') + '">' + money(t.cuoiKy) + '</span></div><span class="eq-sep"></span>' +
      '<div class="eq-cell"><span class="eq-label">Tổng còn nợ</span><span class="eq-value text-alert">' + money(t.conNo) + '</span></div>' +
      '<div class="eq-cell"><span class="eq-label">Tổng ứng dư</span><span class="eq-value text-caution">' + money(t.ungDu) + '</span></div>';
    $('#th-body', root).innerHTML = rows.length ? rows.map((r) =>
      '<tr class="clickable" data-ma="' + esc(r.ma) + '" tabindex="0" aria-label="Mở sổ thu chi của ' + esc(r.ten) + '">' +
      '<td><div class="code">' + esc(r.ma) + '</div><div class="sub">' + esc(r.ten) + '</div></td>' +
      '<td class="text-ink-2">' + esc(r.loai || '') + '</td>' +
      '<td class="num money">' + so(r.dauKy) + (r.nhapDauKy && r.nhapDauKy !== r.dauKy ? sub('gồm nhập tay ' + money(r.nhapDauKy)) : '') + '</td>' +
      '<td class="num money">' + so(r.phatSinh) + '</td>' +
      '<td class="num money">' + so(r.thanhToan, 'font-semibold') + (r.daThu ? sub('đã thu lại ' + money(r.daThu)) : '') + (r.traNgoai ? sub('ngoài quỹ ' + money(r.traNgoai)) : '') + '</td>' +
      '<td class="num money font-semibold' + (r.cuoiKy > 0 ? ' neg' : '') + '">' + money(r.cuoiKy) + (r.cuoiKy < 0 ? sub('ứng dư') : '') + '</td>' +
      '<td class="whitespace-nowrap text-ink-2">' + (r.last ? fdate(r.last) : '') + '</td>' +
      '<td class="actions no-print">' + (r.inCatalog ? '<button type="button" class="btn btn-ghost btn-sm" data-act="dk-row" title="Nhập / xem số dư đầu kỳ của nhà cung cấp này">' + icon('plus') + 'Đầu kỳ' + (r.soDongDK ? ' (' + r.soDongDK + ')' : '') + '</button>' : '') + '</td></tr>').join('')
      : '<tr><td colspan="8" class="empty">' + (only ? 'Không có nhà cung cấp nào khớp bộ lọc.' : 'Không có số liệu trong kỳ này.') + '</td></tr>';
    const kh = KT.supplierSummary(S.db, f).khongNCC;
    $('#th-foot', root).innerHTML = '<tr><td colspan="2">Tổng cộng</td><td class="num money">' + money(t.dauKy) + '</td><td class="num money">' + money(t.phatSinh) + '</td>' +
      '<td class="num money">' + money(t.thanhToan) + '</td><td class="num money"><span class="dbl">' + money(t.cuoiKy) + '</span></td><td colspan="2"></td></tr>' +
      (kh.soDong && !only ? '<tr class="sub-total clickable" data-ma="__none__" tabindex="0" title="Các dòng sổ thu chi trong kỳ không ghi mã NCC (không tính vào công nợ)"><td colspan="4">Chi, thu không ghi nhà cung cấp (' + kh.soDong + ' dòng)</td>' +
        '<td class="num money">' + money(kh.chi - kh.thu) + '</td><td colspan="3"></td></tr>' : '');
  };

  bindPeriodControls(root, f, 'th', () => { saveFilter('thncc'); renderSupplierReport(root); });
  $('#th-only', root).addEventListener('change', (e) => { f.chiCoPhatSinh = e.target.checked; saveFilter('thncc'); draw(); });
  bindCombo($('#th-ncc', root), cbNcc, (v) => {
    if (!f.nccs.some((x) => KT.keyOf(x) === KT.keyOf(v))) f.nccs.push(v);
    saveFilter('thncc'); renderSupplierReport(root);
    const el = document.getElementById('th-ncc'); if (el) el.focus();
  });
  $('#th-sort', root).addEventListener('change', (e) => { f.sort = e.target.value; saveFilter('thncc'); draw(); });
  const open = (ma) => {
    Object.assign(S.filters.so, { duAn: '', ncc: ma, loai: '', q: '', period: f.period, from: f.from, to: f.to });
    saveFilter('so');
    location.hash = '#/so-thu-chi';
  };
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (a) {
      if (a.dataset.act === 'rm-ncc' || a.dataset.act === 'clear-ncc') {
        f.nccs = a.dataset.act === 'clear-ncc' ? [] : f.nccs.filter((x) => x !== a.closest('[data-ma]').dataset.ma);
        saveFilter('thncc'); renderSupplierReport(root);
        const el = document.getElementById('th-ncc'); if (el) el.focus();
        return;
      }
      const q = ['from', 'to'].filter((k) => f[k]).map((k) => k + '=' + f[k]).concat(f.chiCoPhatSinh ? ['chiCoPhatSinh=1'] : [], f.nccs.map((x) => 'nccs=' + encodeURIComponent(x))).join('&');
      if (a.dataset.act === 'export') download('/api/export/suppliers?' + q);
      if (a.dataset.act === 'dk-list') openSoDuDauList();
      if (a.dataset.act === 'dk-row') openSoDuDauList(a.closest('tr[data-ma]').dataset.ma);
      if (a.dataset.act === 'print') printView('TỔNG HỢP CÔNG NỢ THEO NHÀ CUNG CẤP', KT.describeRange(f.from, f.to) + (f.nccs.length ? '. NCC: ' + nccNames().join(', ') : ''), S.db.settings);
      return;
    }
    const tr = e.target.closest('tr[data-ma]');
    if (tr) open(tr.dataset.ma);
  });
  root.addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr[data-ma]');
    if (tr && e.key === 'Enter') open(tr.dataset.ma);
  });
  draw();
}
