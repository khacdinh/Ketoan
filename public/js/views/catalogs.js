/* Danh mục dự án, danh mục nhà cung cấp / đối tượng, tổng hợp theo nhà cung cấp. */
import { $, esc, money, fdate, icon, highlight, download, api, toast, showError, confirmDialog, freshRoot, debounce, LS, periodControls, bindPeriodControls, refreshPeriod } from '../ui.js';
import { S, saveFilter } from '../state.js';
import { openProjectForm, openSupplierForm } from '../forms.js';
import { statusChip } from './dashboard.js';
import { printView } from '../print.js';

const KT = window.KT;

function goLedger(field, ma) {
  Object.assign(S.filters.so, { duAn: '', ncc: '', loai: '', q: '', period: 'tat-ca', from: '', to: '' });
  S.filters.so[field] = ma;
  saveFilter('so');
  location.hash = '#/so-thu-chi';
}

function rowActions(label) {
  return '<td class="actions no-print">' +
    '<button type="button" class="icon-btn" data-act="ledger" title="Xem sổ chi tiết" aria-label="Xem sổ của ' + esc(label) + '">' + icon('book') + '</button>' +
    '<button type="button" class="icon-btn" data-act="edit" title="Sửa" aria-label="Sửa ' + esc(label) + '">' + icon('edit') + '</button>' +
    '<button type="button" class="icon-btn danger" data-act="del" title="Xóa" aria-label="Xóa ' + esc(label) + '">' + icon('trash') + '</button></td>';
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

/* ============================== DỰ ÁN ============================== */

export function renderProjects(root) {
  root = freshRoot(root);
  const state = { q: LS.get('q.projects', '') };
  root.innerHTML =
    '<div class="print-only" id="print-head"></div>' +
    toolbar({ id: 'pj-q', placeholder: 'Tìm mã hoặc tên dự án', q: state.q, addLabel: 'Thêm dự án' }) +
    '<section class="sheet overflow-hidden">' +
    '<p class="no-print border-b border-rule px-4 py-2.5 text-[13px] text-ink-2" id="pj-count"></p>' +
    '<div class="overflow-x-auto"><table class="ledger">' +
    '<thead><tr><th>Mã dự án</th><th>Tên dự án</th><th class="num money">Ngân sách dự kiến</th><th class="num money">Đã chi</th><th class="num money">Còn lại</th><th>Ngân sách</th><th>Trạng thái · khởi công</th><th class="num">Số dòng</th><th>Ghi chú</th><th class="no-print"><span class="sr-only">Thao tác</span></th></tr></thead>' +
    '<tbody id="pj-body"></tbody><tfoot id="pj-foot"></tfoot></table></div></section>';

  const draw = () => {
    const ps = KT.projectSummary(S.db);
    const byMa = new Map(ps.rows.map((r) => [KT.keyOf(r.ma), r]));
    const q = KT.normalizeText(state.q).trim();
    const list = S.db.projects.filter((p) => !q || KT.normalizeText(p.ma + ' ' + p.ten + ' ' + (p.ghiChu || '')).includes(q));
    $('#pj-count', root).innerHTML = '<b class="font-semibold text-ink">' + list.length + '</b> trên ' + S.db.projects.length + ' dự án. Bấm đúp một dòng để sửa.';
    $('#pj-body', root).innerHTML = list.length ? list.map((p) => {
      const r = byMa.get(KT.keyOf(p.ma)) || { chi: 0, soDong: 0, chenhLech: p.nganSach || 0, status: 'idle', tiLe: 0 };
      return '<tr data-id="' + p.id + '">' +
        '<td class="code">' + highlight(p.ma, state.q) + '</td><td class="min-w-[220px]">' + highlight(p.ten, state.q) + '</td>' +
        '<td class="num money">' + (p.nganSach ? money(p.nganSach) : '') + '</td>' +
        '<td class="num money font-semibold">' + money(r.chi) + '</td>' +
        '<td class="num money' + (r.chenhLech < 0 && p.nganSach ? ' neg' : '') + '">' + (p.nganSach ? money(r.chenhLech) : '') + '</td>' +
        '<td>' + statusChip(r) + '</td>' +
        '<td class="whitespace-nowrap">' + esc(p.trangThai || '') + (p.ngayKhoiCong ? '<div class="text-[12.5px] text-ink-2">Khởi công ' + fdate(p.ngayKhoiCong) + '</div>' : '') + '</td>' +
        '<td class="num">' + r.soDong + '</td>' +
        '<td class="text-[12.5px] text-ink-2">' + highlight(p.ghiChu || '', state.q) + '</td>' +
        rowActions(p.ma) + '</tr>';
    }).join('') : '<tr><td colspan="10" class="empty">Không có dự án nào khớp. Thử từ khóa khác hoặc thêm dự án mới.</td></tr>';
    $('#pj-foot', root).innerHTML = '<tr><td colspan="2">Tổng cộng</td><td class="num money">' + money(ps.total.nganSach) + '</td>' +
      '<td class="num money"><span class="dbl">' + money(ps.total.chi) + '</span></td><td class="money"></td><td colspan="2"></td><td class="num">' + ps.total.soDong + '</td><td colspan="2"></td></tr>';
  };

  $('#pj-q', root).addEventListener('input', debounce((e) => { state.q = e.target.value; LS.set('q.projects', state.q); draw(); }, 120));
  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const tr = a.closest('tr[data-id]');
    const p = tr ? S.db.projects.find((x) => x.id === Number(tr.dataset.id)) : null;
    const act = a.dataset.act;
    if (act === 'add') openProjectForm(null);
    else if (act === 'export') download('/api/export/projects');
    else if (act === 'print') printView('DANH MỤC DỰ ÁN VÀ NGÂN SÁCH', '', S.db.settings);
    else if (act === 'edit' && p) openProjectForm(p);
    else if (act === 'ledger' && p) goLedger('duAn', p.ma);
    else if (act === 'del' && p) {
      const used = S.all.entries.filter((x) => KT.keyOf(x.maDuAn) === KT.keyOf(p.ma)).length;
      if (used) return toast('Không xóa được: dự án ' + p.ma + ' đang có ' + used + ' dòng sổ. Chuyển các dòng đó sang dự án khác trước.', 'error');
      const usedCost = S.all.costs.filter((x) => KT.keyOf(x.maCT) === KT.keyOf(p.ma)).length;
      if (usedCost) return toast('Không xóa được: công trình ' + p.ma + ' đang có ' + usedCost + ' dòng chi phí.', 'error');
      if (!(await confirmDialog({ trash: true, title: 'Xóa dự án', html: 'Xóa dự án <b class="text-ink">' + esc(p.ma) + '</b>, ' + esc(p.ten) + '?', okText: 'Xóa dự án', danger: true }))) return;
      try { await api('DELETE', '/api/projects/' + p.id); toast('Đã xóa dự án ' + p.ma + ', chuyển vào Thùng rác'); } catch (err) { showError(err); }
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
  const state = { q: LS.get('q.suppliers', ''), loai: LS.get('loai.suppliers', '') };
  const types = Array.from(new Set(S.db.suppliers.map((s) => s.loai).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'vi'));
  if (state.loai && !types.includes(state.loai)) state.loai = '';
  root.innerHTML =
    '<div class="print-only" id="print-head"></div>' +
    toolbar({
      id: 'ncc-q', placeholder: 'Tìm mã, tên, số điện thoại', q: state.q, addLabel: 'Thêm nhà cung cấp',
      extra: '<label class="sr-only" for="ncc-loai">Loại đối tượng</label><select id="ncc-loai" class="input w-auto max-w-[220px]"><option value="">Mọi loại đối tượng</option>' +
        types.map((t) => '<option' + (t === state.loai ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select>'
    }) +
    '<section class="sheet overflow-hidden">' +
    '<p class="no-print border-b border-rule px-4 py-2.5 text-[13px] text-ink-2" id="ncc-count"></p>' +
    '<div class="overflow-x-auto"><table class="ledger">' +
    '<thead><tr><th>Mã</th><th>Tên nhà cung cấp, đối tượng</th><th>Loại đối tượng</th><th>Điện thoại</th><th>Địa chỉ</th><th class="num money">Đã thanh toán</th><th class="num">Số dòng</th><th>Ghi chú</th><th class="no-print"><span class="sr-only">Thao tác</span></th></tr></thead>' +
    '<tbody id="ncc-body"></tbody></table></div></section>';

  const draw = () => {
    const ss = KT.supplierSummary(S.db);
    const byMa = new Map(ss.rows.map((r) => [KT.keyOf(r.ma), r]));
    const q = KT.normalizeText(state.q).trim();
    const list = S.db.suppliers.filter((s) => (!state.loai || s.loai === state.loai) &&
      (!q || KT.normalizeText([s.ma, s.ten, s.loai, s.sdt, s.diaChi, s.ghiChu].join(' ')).includes(q)));
    $('#ncc-count', root).innerHTML = '<b class="font-semibold text-ink">' + list.length + '</b> trên ' + S.db.suppliers.length + ' đối tượng. Bấm đúp một dòng để sửa.';
    $('#ncc-body', root).innerHTML = list.length ? list.map((s) => {
      const r = byMa.get(KT.keyOf(s.ma)) || { chi: 0, soDong: 0 };
      return '<tr data-id="' + s.id + '">' +
        '<td class="code">' + highlight(s.ma, state.q) + '</td><td class="min-w-[180px]">' + highlight(s.ten, state.q) + '</td>' +
        '<td class="text-ink-2">' + highlight(s.loai || '', state.q) + '</td>' +
        '<td class="whitespace-nowrap">' + highlight(s.sdt || '', state.q) + '</td><td class="text-[12.5px] text-ink-2">' + highlight(s.diaChi || '', state.q) + '</td>' +
        '<td class="num money ' + (r.chi ? 'font-semibold' : 'text-ink-3') + '">' + money(r.chi) + '</td><td class="num">' + r.soDong + '</td>' +
        '<td class="text-[12.5px] text-ink-2">' + highlight(s.ghiChu || '', state.q) + '</td>' +
        rowActions(s.ma) + '</tr>';
    }).join('') : '<tr><td colspan="9" class="empty">Không có nhà cung cấp nào khớp. Thử từ khóa khác hoặc thêm mới.</td></tr>';
  };

  $('#ncc-q', root).addEventListener('input', debounce((e) => { state.q = e.target.value; LS.set('q.suppliers', state.q); draw(); }, 120));
  $('#ncc-loai', root).addEventListener('change', (e) => { state.loai = e.target.value; LS.set('loai.suppliers', state.loai); draw(); });
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
    else if (act === 'ledger' && s) goLedger('ncc', s.ma);
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
  root.innerHTML =
    '<div class="print-only" id="print-head"></div>' +
    '<div class="no-print flex flex-wrap items-center gap-2">' + periodControls(f, 'th') +
    '<label class="check ml-1"><input type="checkbox" id="th-only"' + (f.chiCoPhatSinh ? ' checked' : '') + '>Chỉ nhà cung cấp có phát sinh</label>' +
    '<span class="flex-1"></span>' +
    '<label class="sr-only" for="th-sort">Sắp xếp</label><select id="th-sort" class="input w-auto"><option value="amount"' + (f.sort === 'amount' ? ' selected' : '') + '>Số tiền lớn trước</option>' +
    '<option value="catalog"' + (f.sort === 'catalog' ? ' selected' : '') + '>Theo thứ tự danh mục</option><option value="name"' + (f.sort === 'name' ? ' selected' : '') + '>Theo tên A đến Z</option></select>' +
    '<button type="button" class="btn btn-ghost" data-act="print">' + icon('print') + 'In</button>' +
    '<button type="button" class="btn btn-secondary" data-act="export">' + icon('excel') + 'Xuất Excel</button>' +
    '</div>' +
    '<section class="sheet overflow-hidden">' +
    '<div class="overflow-x-auto"><table class="ledger">' +
    '<thead><tr><th>Nhà cung cấp, đối tượng</th><th>Loại đối tượng</th><th class="num money w-[30%]">Đã thanh toán</th><th class="num">Tỉ trọng</th><th class="num money">Đã thu</th><th class="num">Số dòng</th><th>Lần gần nhất</th></tr></thead>' +
    '<tbody id="th-body"></tbody><tfoot id="th-foot"></tfoot></table></div></section>';

  const draw = () => {
    const ss = KT.supplierSummary(S.db, f);
    const rows = f.chiCoPhatSinh ? ss.rows.filter((r) => r.soDong > 0) : ss.rows.slice();
    if (f.sort === 'amount') rows.sort((a, b) => b.chi - a.chi || b.soDong - a.soDong);
    if (f.sort === 'name') rows.sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
    const total = ss.total.chi || 1;
    const max = Math.max.apply(null, rows.map((r) => r.chi).concat([1]));
    $('#th-body', root).innerHTML = rows.length ? rows.map((r) =>
      '<tr class="clickable" data-ma="' + esc(r.ma) + '" tabindex="0" aria-label="Mở sổ của ' + esc(r.ten) + '">' +
      '<td><div class="code">' + esc(r.ma) + '</div><div class="sub">' + esc(r.ten) + '</div></td>' +
      '<td class="text-ink-2">' + esc(r.loai || '') + '</td>' +
      '<td class="num money"><div class="font-semibold">' + money(r.chi) + '</div><div class="mbar" aria-hidden="true"><span class="mbar-fill" style="width:' + Math.max(r.chi ? 0.5 : 0, (r.chi / max) * 100).toFixed(2) + '%"></span></div></td>' +
      '<td class="num text-ink-2">' + ((r.chi / total) * 100).toFixed(1).replace('.', ',') + '%</td>' +
      '<td class="num money thu">' + (r.thu ? money(r.thu) : '') + '</td><td class="num">' + r.soDong + '</td>' +
      '<td class="whitespace-nowrap text-ink-2">' + (r.last ? fdate(r.last) : '') + '</td></tr>').join('')
      : '<tr><td colspan="7" class="empty">Không có phát sinh trong kỳ này.</td></tr>';
    $('#th-foot', root).innerHTML = '<tr><td colspan="2">Tổng cộng</td><td class="num money"><span class="dbl">' + money(ss.total.chi) + '</span></td><td></td>' +
      '<td class="num money thu">' + money(ss.total.thu) + '</td><td class="num">' + ss.total.soDong + '</td><td></td></tr>' +
      (ss.khongNCC.soDong ? '<tr class="sub-total clickable" data-ma="__none__" tabindex="0"><td colspan="2">Chưa gán nhà cung cấp</td><td class="num money">' + money(ss.khongNCC.chi) + '</td><td></td>' +
        '<td class="num money">' + money(ss.khongNCC.thu) + '</td><td class="num">' + ss.khongNCC.soDong + '</td><td></td></tr>' : '');
  };

  bindPeriodControls(root, f, 'th', () => { saveFilter('thncc'); renderSupplierReport(root); });
  $('#th-only', root).addEventListener('change', (e) => { f.chiCoPhatSinh = e.target.checked; saveFilter('thncc'); draw(); });
  $('#th-sort', root).addEventListener('change', (e) => { f.sort = e.target.value; saveFilter('thncc'); draw(); });
  const open = (ma) => {
    Object.assign(S.filters.so, { duAn: '', ncc: ma, loai: '', q: '', period: f.period, from: f.from, to: f.to });
    saveFilter('so');
    location.hash = '#/so-thu-chi';
  };
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (a) {
      const q = ['from', 'to'].filter((k) => f[k]).map((k) => k + '=' + f[k]).concat(f.chiCoPhatSinh ? ['chiCoPhatSinh=1'] : []).join('&');
      if (a.dataset.act === 'export') download('/api/export/suppliers?' + q);
      if (a.dataset.act === 'print') printView('TỔNG HỢP THANH TOÁN THEO NHÀ CUNG CẤP', KT.describeRange(f.from, f.to), S.db.settings);
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
