/* Sổ chi phí công trình (tương đương sheet NHATKYCHUNG): lọc, tìm, sửa trực tiếp, tổng cuối bảng. */
import { $, esc, money, fdate, icon, highlight, download, periodControls, bindPeriodControls, refreshPeriod, freshRoot, debounce, setDateValue,
  api, toast, showError, confirmDialog, openModal, dateField, focusInput, fieldError } from '../ui.js';
import { S, saveFilter, costProjects, costDatalists, resolveCode, resolveItem, materialByCode, itemByCode, houseByCode, projectByCode, supplierByCode, groupName, allCostLedger } from '../state.js';
import { printView } from '../print.js';
import { comboHtml, bindCombo } from '../combo.js';
import { attachBlock, bindAttach, clipHtml, openAttachList } from '../attach.js';

const KT = window.KT;
const PAGE = 500; // số dòng vẽ mỗi lần (bảng lớn vẽ chậm); bấm "Hiện thêm" để xem tiếp, in thì hiện hết
let shown = PAGE;
// về lại số dòng mặc định khi chuyển màn hình (vẽ lại sau khi sửa dữ liệu thì giữ nguyên số dòng đang hiện)
window.addEventListener('hashchange', () => { shown = PAGE; });

function exportQuery(f) {
  const p = { from: f.from, to: f.to, ct: f.ct, nha: f.nha, nhom: f.nhom, hm: f.hm, loai: f.loai, ncc: f.ncc, vt: f.vt, q: f.q };
  return Object.keys(p).filter((k) => p[k]).map((k) => k + '=' + encodeURIComponent(p[k])).join('&');
}

// Dữ liệu gửi lên máy chủ khi sửa 1 dòng (đủ SL và ĐG: máy chủ tính lại Thành tiền; dòng theo khoản: giữ Thành tiền)
function payloadOf(c, patch) {
  const it = itemByCode(c.maHM);
  return Object.assign({
    phieuId: c.phieuId, ngay: c.ngay, maCT: c.maCT, maNha: c.maNha || '', maNCC: c.maNCC || '', soPhieu: c.soPhieu || '',
    maHM: it ? it.ma : c.maHM, loaiCP: c.loaiCP, maVT: c.maVT || '', dienGiai: c.dienGiai || '', soLuong: c.soLuong == null ? '' : c.soLuong,
    donGia: c.donGia == null ? '' : c.donGia, thanhTien: c.thanhTien, ghiChu: c.ghiChu || ''
  }, patch || {});
}

export function renderCostLedger(root) {
  root = freshRoot(root);
  const f = refreshPeriod(S.filters.cpSo);
  const houses = S.db.houses.filter((h) => !f.ct || KT.keyOf(h.maCT) === KT.keyOf(f.ct));
  const items = S.db.costItems.filter((i) => !f.nhom || KT.keyOf(i.maNhom) === KT.keyOf(f.nhom));
  const usedVT = new Set(S.db.costs.map((c) => KT.keyOf(c.maVT)));
  const usedNCC = new Set(S.db.costs.map((c) => KT.keyOf(c.maNCC)));
  // ô gõ tìm thay cho danh sách chọn (xem combo.js)
  const W = 'w-[200px] max-sm:w-full';
  const cb = {
    ct: { id: 'cl-ct', list: costProjects(), value: f.ct, noun: 'công trình', placeholder: 'Công trình: gõ mã, tên', label: 'Lọc theo công trình', cls: W },
    nha: { id: 'cl-nha', list: houses, value: f.nha, none: '(Không gán nhà)', noun: 'nhà', placeholder: 'Nhà: gõ mã, tên', label: 'Lọc theo nhà', cls: 'w-[160px] max-sm:w-full' },
    nhom: { id: 'cl-nhom', list: S.db.costGroups, value: f.nhom, show: 'ten', noun: 'nhóm chi phí', placeholder: 'Nhóm CP: gõ tên', label: 'Lọc theo nhóm chi phí', cls: W },
    hm: { id: 'cl-hm', list: items, value: f.hm, show: 'ten', noun: 'hạng mục', placeholder: 'Hạng mục: gõ tên', label: 'Lọc theo hạng mục', cls: 'w-[220px] max-sm:w-full' },
    ncc: { id: 'cl-ncc', list: S.db.suppliers.filter((s) => usedNCC.has(KT.keyOf(s.ma)) || KT.keyOf(s.ma) === KT.keyOf(f.ncc)), value: f.ncc, noun: 'nhà cung cấp', placeholder: 'NCC: gõ mã, tên', label: 'Lọc theo nhà cung cấp', cls: W },
    vt: { id: 'cl-vt', list: S.db.materials.filter((m) => usedVT.has(KT.keyOf(m.ma)) || KT.keyOf(m.ma) === KT.keyOf(f.vt)), value: f.vt, noun: 'vật tư', placeholder: 'Vật tư: gõ mã, tên', label: 'Lọc theo vật tư', cls: W }
  };

  root.innerHTML =
    '<div class="print-only" id="print-head"></div>' +
    '<div id="cl-dl">' + costDatalists(f.ct) + '</div>' +
    '<div class="no-print flex flex-wrap items-center gap-2">' +
    periodControls(f, 'cl') +
    comboHtml(cb.ct) + comboHtml(cb.nha) +
    '<select id="cl-loai" class="input w-auto" aria-label="Loại chi phí"><option value="">Mọi loại CP</option>' + KT.LOAI_CP.map((l) => '<option' + (f.loai === l ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>' +
    '</div>' +
    '<div class="no-print flex flex-wrap items-center gap-2">' +
    comboHtml(cb.nhom) + comboHtml(cb.hm) + comboHtml(cb.ncc) + comboHtml(cb.vt) +
    (S.drafts.costs.length || f.trangThai ? '<div class="seg seg-sm" role="radiogroup" aria-label="Trạng thái">' +
      [['', 'Mọi trạng thái'], ['so', 'Đã ghi sổ'], ['nhap', 'Nháp (' + S.drafts.costs.length + ')']].map(([v, l]) => '<label class="seg-item"><input type="radio" name="cl-tt" value="' + v + '"' + ((f.trangThai || '') === v ? ' checked' : '') + '><span>' + l + '</span></label>').join('') +
      '</div>' : '') +
    '<label class="search min-w-[220px] flex-1">' + icon('search') + '<input id="cl-q" type="search" class="input" placeholder="Tìm diễn giải, vật tư, số phiếu, số tiền" value="' + esc(f.q) + '" aria-label="Tìm trong sổ chi phí"></label>' +
    '<button type="button" class="btn btn-ghost btn-sm" data-act="clear" id="cl-clear">' + icon('eraser') + 'Bỏ lọc</button>' +
    '</div>' +
    '<div id="cl-summary"></div>' +
    '<section class="sheet overflow-hidden">' +
    '<div class="no-print flex flex-wrap items-center gap-3 border-b border-rule px-4 py-2.5">' +
    '<p class="text-[13px] text-ink-2" id="cl-count" aria-live="polite"></p><span class="flex-1"></span>' +
    '<a href="#/cp-nhap" class="btn btn-primary btn-sm">' + icon('plus') + 'Lập phiếu nhập</a>' +
    '<button type="button" class="btn btn-ghost btn-sm" data-act="print">' + icon('print') + 'In sổ</button>' +
    '<button type="button" class="btn btn-secondary btn-sm" data-act="export">' + icon('excel') + 'Xuất Excel theo bộ lọc</button>' +
    '</div>' +
    '<div class="table-scroll max-h-[calc(100vh-330px)] min-h-[260px] overflow-auto"><table class="ledger cost-ledger">' +
    '<thead><tr><th>Ngày</th><th>Công trình / nhà</th><th>Hạng mục · loại CP</th><th>Vật tư</th><th>Diễn giải</th>' +
    '<th class="num">Số lượng</th><th class="num money">Đơn giá</th><th class="num money">Thành tiền</th><th>Nhà cung cấp · số phiếu</th><th class="no-print"><span class="sr-only">Thao tác</span></th></tr></thead>' +
    '<tbody id="cl-body"></tbody><tfoot id="cl-foot"></tfoot></table></div>' +
    '<p class="no-print border-t border-rule px-4 py-2 text-[12.5px] text-ink-3">Bấm đúp vào ô Diễn giải, Số lượng, Đơn giá, Hạng mục, Loại CP, Vật tư, Nhà cung cấp hoặc Nhà để sửa ngay trong bảng (<kbd>Enter</kbd> lưu, <kbd>Esc</kbd> bỏ). Nút bút chì để sửa đủ các cột.</p>' +
    '</section>';

  const draw = (keep) => { if (keep !== true) shown = PAGE; drawRows(root, f); };
  const syncInputs = () => {
    $('#cl-period', root).value = f.period || 'tat-ca';
    setDateValue($('#cl-from', root), f.from || '', true);
    setDateValue($('#cl-to', root), f.to || '', true);
  };
  bindPeriodControls(root, f, 'cl', () => { saveFilter('cpSo'); syncInputs(); draw(); });
  const pick = (key, redraw) => (v) => {
    f[key] = v;
    if (key === 'ct') f.nha = '';
    if (key === 'nhom') f.hm = '';
    saveFilter('cpSo');
    if (redraw) renderCostLedger(root); else draw();
  };
  $('#cl-loai', root).addEventListener('change', (e) => pick('loai')(e.target.value));
  bindCombo($('#cl-ct', root), cb.ct, pick('ct', true));
  bindCombo($('#cl-nha', root), cb.nha, pick('nha'));
  bindCombo($('#cl-nhom', root), cb.nhom, pick('nhom', true));
  bindCombo($('#cl-hm', root), cb.hm, pick('hm'));
  bindCombo($('#cl-ncc', root), cb.ncc, pick('ncc'));
  bindCombo($('#cl-vt', root), cb.vt, pick('vt'));
  root.querySelectorAll('input[name=cl-tt]').forEach((r) => r.addEventListener('change', () => { f.trangThai = r.value; saveFilter('cpSo'); draw(); }));
  $('#cl-q', root).addEventListener('input', debounce((e) => { f.q = e.target.value; saveFilter('cpSo'); draw(); }, 150));

  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    const tr = a.closest('tr[data-id]');
    const c = tr ? S.all.costs.find((x) => x.id === Number(tr.dataset.id)) : null;
    if (act === 'clear') {
      Object.assign(f, { period: 'tat-ca', from: '', to: '', ct: '', nha: '', nhom: '', hm: '', loai: '', ncc: '', vt: '', q: '', trangThai: '' });
      saveFilter('cpSo');
      renderCostLedger(root);
    } else if (act === 'export') download('/api/export/cost-ledger?' + exportQuery(f));
    else if (act === 'print') { shown = Infinity; draw(true); printView('SỔ CHI PHÍ CÔNG TRÌNH', KT.describeRange(f.from, f.to), S.db.settings); }
    else if (act === 'more') { shown += PAGE; draw(true); }
    else if (act === 'all') { shown = Infinity; draw(true); }
    else if (act === 'edit' && c) openCostLineForm(c);
    else if (act === 'dup' && c) {
      try { await api('POST', '/api/costs', payloadOf(c, { nguon: 'nhan ban' })); toast('Đã nhân bản dòng (cùng phiếu)'); } catch (err) { showError(err); }
    } else if (act === 'del' && c) {
      if (!(await confirmDialog({ trash: true, title: 'Xóa dòng chi phí', html: 'Xóa dòng ngày <b class="text-ink">' + fdate(c.ngay) + '</b>, ' + esc(c.maVT || c.dienGiai) + ', thành tiền <b class="text-ink">' + money(c.thanhTien) + ' đ</b>?', okText: 'Xóa dòng', danger: true }))) return;
      try { await api('DELETE', '/api/costs/' + c.id); toast('Đã xóa dòng chi phí, chuyển vào Thùng rác'); } catch (err) { showError(err); }
    } else if (act === 'clip' && c) {
      openAttachList(a.dataset.owner, Number(a.dataset.oid), 'Chứng từ của ' + (a.dataset.owner === 'slips' ? 'phiếu nhập' : 'dòng chi phí'));
    } else if (act === 'locked' && c) {
      toast(KT.lockMessage(KT.monthOf(c.ngay), 'sửa'), 'info');
    } else if (act === 'post' && c) {
      try { const r = await api('POST', '/api/cost-slips/' + c.phieuId + '/post'); toast('Đã ghi sổ phiếu nháp (' + r.posted + ' dòng), đã tính vào chi phí và công nợ'); } catch (err) { showError(err); }
    } else if (act === 'slip' && c) {
      location.hash = '#/cp-nhap?phieu=' + c.phieuId;
    }
  });
  root.addEventListener('dblclick', (e) => {
    const td = e.target.closest('[data-edit]');
    if (td && !td.querySelector('input,select')) { inlineEdit(td); return; }
    const tr = e.target.closest('tr[data-id]');
    if (!tr || e.target.closest('button, a')) return;
    const c = S.all.costs.find((x) => x.id === Number(tr.dataset.id));
    if (c) openCostLineForm(c);
  });
  draw();
}

function drawRows(root, f) {
  const res = KT.filterCosts(S.costLedger, f);
  const filtered = !!(f.ct || f.nha || f.nhom || f.hm || f.loai || f.ncc || f.vt || f.q || f.from || f.to);
  const tile = (label, v, cls) => '<div class="eq-cell"><span class="eq-label">' + esc(label) + '</span><span class="eq-value ' + (cls || '') + '">' + money(v) + '</span></div>';
  const sep = '<span class="eq-sep" aria-hidden="true"></span>';
  $('#cl-summary', root).innerHTML = '<div class="equation">' + tile(filtered ? 'Tổng chi phí đang lọc' : 'Tổng chi phí', res.total) + sep +
    KT.LOAI_CP.map((l) => tile(l, res.byLoai[l] || 0, 'text-ink-2')).join(sep) + '</div>';
  // Dòng Nháp hiện xen trong sổ, không cộng vào các tổng
  const drafts = f.trangThai === 'so' || !S.drafts.costs.length ? [] : KT.filterCosts(allCostLedger().filter(KT.isDraft), f).rows;
  const posted = f.trangThai === 'nhap' ? [] : res.rows;
  const list = drafts.length ? posted.concat(drafts).sort(KT.compareEntries) : posted;
  $('#cl-count', root).innerHTML = '<b class="font-semibold text-ink">' + posted.length + '</b> dòng' + (filtered ? ' khớp bộ lọc, trong tổng số ' + S.costLedger.length + ' dòng' : ' trong sổ') +
    (drafts.length ? ', <b class="font-semibold text-caution">' + drafts.length + ' dòng nháp</b> chưa tính vào tổng' : '') + '.';
  $('#cl-clear', root).hidden = !(filtered || f.trangThai);
  const all = { rows: list };
  const rows = all.rows.length > shown ? all.rows.slice(-shown) : all.rows;
  const body = $('#cl-body', root);
  body.innerHTML = rows.length ? (all.rows.length > rows.length ? moreRow(rows.length, all.rows.length, 10) : '') +
    rows.map((r) => rowHtml(r, f.q)).join('')
    : '<tr><td colspan="10" class="empty">' + (S.costLedger.length ? 'Không có dòng nào khớp bộ lọc.' : 'Sổ chi phí chưa có dòng nào. Bấm “Lập phiếu nhập” hoặc nhập file Excel chi phí trong Cài đặt.') + '</td></tr>';
  const fl = body.querySelector('tr.flash');
  if (fl) fl.scrollIntoView({ block: 'nearest' });
  $('#cl-foot', root).innerHTML = res.rows.length ? '<tr><td colspan="5" class="text-right">Cộng</td><td class="num">' + slTotalHtml(res) + '</td><td></td>' +
    '<td class="num money"><span class="dbl">' + money(res.total) + '</span></td><td colspan="2"></td></tr>' : '';
}

function moreRow(n, total, cols) {
  return '<tr><td colspan="' + cols + '" class="text-[12.5px] text-ink-3">Đang hiện ' + n + ' dòng gần nhất trong ' + total + ' dòng. ' +
    '<button type="button" class="btn btn-ghost btn-sm no-print" data-act="more">Hiện thêm ' + Math.min(PAGE, total - n) + ' dòng cũ hơn</button>' +
    '<button type="button" class="btn btn-ghost btn-sm no-print" data-act="all">Hiện tất cả</button>' +
    '<span class="no-print"> Hoặc lọc theo kỳ để thu hẹp.</span></td></tr>';
}

// Tổng số lượng: một đơn vị thì ghi kèm ĐVT; nhiều đơn vị thì chỉ tách theo từng ĐVT (cộng lẫn m3 với kg không có nghĩa)
function slTotalHtml(res) {
  const units = Object.keys(res.slTheoDvt);
  if (units.length === 1) return '<span class="dbl">' + KT.fmtQty(res.tongSL) + '</span>' + (units[0] ? ' <span class="text-[12px] font-normal text-ink-3">' + esc(units[0]) + '</span>' : '');
  const parts = units.sort((a, b) => res.slTheoDvt[b] - res.slTheoDvt[a])
    .map((u) => KT.fmtQty(res.slTheoDvt[u]) + ' ' + (u || '(không ĐVT)'));
  return '<div class="ml-auto max-w-[200px] text-[12px] leading-snug font-medium whitespace-normal text-ink-2" title="Số lượng theo từng đơn vị tính">' + esc(parts.join(' · ')) + '</div>';
}

function rowHtml(r, q) {
  const bad = (ok, text) => (ok ? text : '<span class="code bad" title="Mã chưa có trong danh mục">' + text + '</span>');
  const nhap = KT.isDraft(r);
  const cls = [S.flash.has('costs:' + r.id) ? 'flash' : '', nhap ? 'draft' : ''].filter(Boolean).join(' ');
  return '<tr data-id="' + r.id + '"' + (cls ? ' class="' + cls + '"' : '') + '>' +
    '<td class="whitespace-nowrap">' + fdate(r.ngay) + (nhap ? '<div><span class="chip chip-draft mt-1" title="Nháp: chưa ghi sổ, chưa tính vào chi phí và công nợ">' + icon('draft') + 'Nháp</span></div>' : '') + '</td>' +
    '<td class="whitespace-nowrap" data-edit="maNha">' + bad(r.ctHopLe, '<span class="code" title="' + esc(r.tenCT) + '">' + highlight(r.maCT, q) + '</span>') +
    (r.maNha && KT.keyOf(r.maNha) !== KT.keyOf(r.maCT) ? '<div class="sub" title="' + esc(r.tenNha) + '">' + bad(r.nhaHopLe, highlight(r.maNha, q)) + '</div>' : '') + '</td>' +
    '<td class="min-w-[150px]" data-edit="maHM">' + (r.hmHopLe ? highlight(r.tenHM, q) : '<span class="code bad">' + esc(r.maHM || '(trống)') + '</span>') +
    '<div class="sub"><span class="loai-tag" data-edit="loaiCP" title="Bấm đúp để đổi loại chi phí">' + highlight(r.loaiCP, q) + '</span> · ' + highlight(r.tenNhom, q) + '</div></td>' +
    '<td data-edit="maVT">' + (r.maVT ? bad(r.vtHopLe, '<span class="vt-code">' + highlight(r.maVT, q) + '</span>') + '<div class="sub">' + highlight(r.tenVT, q) + '</div>' : '') + '</td>' +
    '<td class="min-w-[140px] max-w-[240px]" data-edit="dienGiai">' + highlight(r.dienGiai, q) + clipHtml('costs', r.id) + clipHtml('slips', r.phieuId) + (r.ghiChu ? '<div class="text-[12.5px] text-ink-3">Ghi chú: ' + highlight(r.ghiChu, q) + '</div>' : '') + '</td>' +
    '<td class="num" data-edit="soLuong">' + KT.fmtQty(r.soLuong) + (r.dvt ? ' <span class="text-[12px] text-ink-3">' + esc(r.dvt) + '</span>' : '') + '</td>' +
    '<td class="num money" data-edit="donGia">' + (KT.isKhoan(r) ? '<span class="text-[12.5px] text-ink-3">theo khoản</span>' : highlight(money(r.donGia), q)) + '</td>' +
    '<td class="num money font-semibold" data-edit="thanhTien">' + highlight(money(r.thanhTien), q) + '</td>' +
    '<td data-edit="maNCC"><span class="block max-w-[140px] truncate" title="' + esc(r.maNCC) + '">' + bad(r.nccHopLe, highlight(r.tenNCC || r.maNCC, q)) + '</span>' +
    (r.soPhieu ? '<div class="sub">Phiếu ' + highlight(r.soPhieu, q) + '</div>' : '') + '</td>' +
    '<td class="actions no-print">' +
    (nhap ? '<button type="button" class="icon-btn" data-act="post" title="Ghi sổ cả phiếu nháp này" aria-label="Ghi sổ phiếu nháp của dòng ' + r.stt + '">' + icon('check') + '</button>' : '') +
    '<button type="button" class="icon-btn" data-act="slip" title="Mở cả phiếu nhập" aria-label="Mở phiếu của dòng ' + r.stt + '">' + icon('notePencil') + '</button>' +
    (KT.isLockedDate(S.all, r.ngay) ? '<button type="button" class="icon-btn" data-act="locked" title="' + esc(KT.lockMessage(KT.monthOf(r.ngay), 'sửa')) + '" aria-label="Tháng đã khóa sổ">' + icon('lock') + '</button>' :
      '<button type="button" class="icon-btn" data-act="edit" title="Sửa dòng" aria-label="Sửa dòng ' + r.stt + '">' + icon('edit') + '</button>' +
      '<button type="button" class="icon-btn" data-act="dup" title="Nhân bản dòng" aria-label="Nhân bản dòng ' + r.stt + '">' + icon('copy') + '</button>' +
      '<button type="button" class="icon-btn danger" data-act="del" title="Xóa dòng" aria-label="Xóa dòng ' + r.stt + '">' + icon('trash') + '</button>') +
    '</td></tr>';
}

/* ---------------- Sửa trực tiếp 1 ô ---------------- */
function inlineEdit(td) {
  const tr = td.closest('tr[data-id]');
  const c = S.all.costs.find((x) => x.id === Number(tr.dataset.id));
  if (!c) return;
  if (KT.isLockedDate(S.all, c.ngay)) { toast(KT.lockMessage(KT.monthOf(c.ngay), 'sửa'), 'info'); return; }
  const field = td.dataset.edit;
  const old = td.innerHTML;
  let input;
  if (field === 'loaiCP') {
    input = document.createElement('select');
    input.innerHTML = KT.LOAI_CP.map((l) => '<option' + (l === c.loaiCP ? ' selected' : '') + '>' + esc(l) + '</option>').join('');
  } else {
    input = document.createElement('input');
    const lists = { maHM: 'dl-hm', maVT: 'dl-vt', maNCC: 'dl-suppliers', maNha: 'dl-nha' };
    if (lists[field]) input.setAttribute('list', lists[field]);
    const it = itemByCode(c.maHM);
    input.value = field === 'soLuong' ? KT.fmtQty(c.soLuong) : field === 'donGia' || field === 'thanhTien' ? (c[field] == null ? '' : money(c[field])) : field === 'maHM' ? (it ? it.ten : c.maHM) : (c[field] || '');
    if (field === 'soLuong' || field === 'donGia' || field === 'thanhTien') input.className = 'text-right';
  }
  input.classList.add('input', 'input-sm', 'inline-cell');
  td.innerHTML = '';
  td.appendChild(input);
  input.focus();
  if (input.select) input.select();
  let done = false;
  const cancel = () => { if (done) return; done = true; td.innerHTML = old; };
  const commit = async () => {
    if (done) return;
    let v = input.value.trim();
    const patch = {};
    if (field === 'maHM') { const code = resolveItem(v); if (!code) return fail('Hạng mục "' + v + '" chưa có trong danh mục'); patch.maHM = code; }
    else if (field === 'maVT') {
      const m = v ? materialByCode(v) : null;
      if (v && !m) return fail('Mã vật tư "' + v + '" chưa có trong danh mục');
      patch.maVT = m ? m.ma : '';
    } else if (field === 'maNCC') { const code = resolveCode(S.db.suppliers, v); if (!supplierByCode(code)) return fail('Nhà cung cấp "' + v + '" chưa có trong danh mục'); patch.maNCC = code; }
    else if (field === 'maNha') { const code = v ? resolveCode(S.db.houses, v) : ''; if (code && !houseByCode(code)) return fail('Nhà "' + v + '" chưa có trong danh mục'); patch.maNha = code; }
    // Xóa trống Số lượng hoặc Đơn giá: thành dòng theo khoản (không có SL, ĐG), giữ nguyên Thành tiền
    else if ((field === 'soLuong' || field === 'donGia') && !v) {
      if (KT.isKhoan(c)) { cancel(); return; }
      patch.soLuong = ''; patch.donGia = ''; patch.thanhTien = c.thanhTien;
    }
    else if (field === 'soLuong') { const n = KT.parseQty(v); if (isNaN(n) || n <= 0) return fail('Số lượng không hợp lệ'); patch.soLuong = n; }
    else if (field === 'donGia') { const n = KT.parseAmount(v); if (isNaN(n) || n < 0) return fail('Đơn giá không hợp lệ'); patch.donGia = n; }
    else if (field === 'thanhTien') {
      // Sửa Thành tiền: giữ Số lượng, máy chủ tính lại Đơn giá (dòng theo khoản: chỉ đổi Thành tiền)
      const n = KT.parseAmount(v);
      if (isNaN(n) || n <= 0) return fail('Thành tiền không hợp lệ');
      const r = KT.costFromInput(c.soLuong, null, n);
      if (r.loi) return fail(r.loi + ' (bấm nút Sửa dòng để đổi cả số lượng)');
      patch.donGia = ''; patch.thanhTien = n;
    }
    else patch[field] = v;
    done = true;
    try {
      await api('PUT', '/api/costs/' + c.id, payloadOf(c, patch));
      toast('Đã lưu');
    } catch (err) {
      showError(err);
      td.innerHTML = old;
    }
  };
  function fail(msg) { toast(msg, 'error'); input.classList.add('invalid'); input.focus(); }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
  });
  input.addEventListener('blur', () => setTimeout(() => { if (!done && document.activeElement !== input) cancel(); }, 150));
  if (field === 'loaiCP') input.addEventListener('change', commit);
}

/* ---------------- Sửa đủ các cột của 1 dòng ---------------- */
export function openCostLineForm(c) {
  const it = itemByCode(c.maHM);
  const body =
    '<form id="cl-form" class="grid grid-cols-3 gap-x-5 gap-y-4 max-md:grid-cols-2 max-sm:grid-cols-1" novalidate autocomplete="off">' +
    costDatalists(c.maCT) +
    '<label class="field"><span class="label">Ngày <b class="req">*</b></span>' + dateField({ name: 'ngay', value: c.ngay, required: true, label: 'Ngày' }) + '</label>' +
    fld('maCT', 'Công trình *', c.maCT, 'dl-projects') + fld('maNha', 'Nhà / khu', c.maNha, 'dl-nha') +
    fld('maNCC', 'Nhà cung cấp *', c.maNCC, 'dl-suppliers') + fld('soPhieu', 'Số phiếu / chuyến', c.soPhieu) + fld('maHM', 'Hạng mục *', it ? it.ten : c.maHM, 'dl-hm') +
    fld('maVT', 'Mã vật tư', c.maVT, 'dl-vt') +
    '<label class="field"><span class="label">Loại CP</span><select name="loaiCP" class="input">' + KT.LOAI_CP.map((l) => '<option' + (l === c.loaiCP ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>' +
    fld('dienGiai', 'Diễn giải / quy cách', c.dienGiai) +
    fld('soLuong', 'Số lượng', KT.fmtQty(c.soLuong), '', 'text-right') + fld('donGia', 'Đơn giá', KT.isKhoan(c) ? '' : money(c.donGia), '', 'text-right') +
    fld('thanhTien', 'Thành tiền *', money(c.thanhTien), '', 'text-right font-semibold') +
    '<p class="col-span-3 -mt-2 text-[12.5px] text-ink-3 max-md:col-span-2 max-sm:col-span-1">Nhập Số lượng và Đơn giá (Thành tiền tự tính), hoặc chỉ nhập Thành tiền cho khoản khoán (để trống Số lượng, Đơn giá).</p>' +
    '<label class="field col-span-3 max-md:col-span-2 max-sm:col-span-1"><span class="label">Ghi chú</span><input name="ghiChu" class="input" value="' + esc(c.ghiChu || '') + '"></label>' +
    '<p class="col-span-3 text-[12.5px] text-ink-3 max-md:col-span-2 max-sm:col-span-1">Đổi ngày, công trình, nhà, nhà cung cấp hoặc số phiếu của riêng dòng này thì dòng được tách thành phiếu riêng.</p>' +
    '</form>' + attachBlock('costs', c.id, { readonly: KT.isLockedDate(S.all, c.ngay) });
  openModal({
    title: 'Sửa dòng chi phí',
    size: 'wide',
    dismissible: false,
    body,
    footer: '<span class="flex-1"></span><button type="button" class="btn btn-ghost" data-act="cancel">Hủy</button><button type="button" class="btn btn-primary" data-act="save">Lưu thay đổi</button>',
    onMount(el, h) {
      bindAttach(el);
      const fm = $('#cl-form', el);
      const g = (n) => fm.elements[n];
      // Tự điền ô còn lại như ở phiếu nhập; ĐG có số lẻ (từ Excel) thì Thành tiền là gốc
      const so = { soLuong: g('soLuong').value, donGia: g('donGia').value, thanhTien: g('thanhTien').value,
        ttTuDong: !KT.isKhoan(c) && Number.isInteger(Number(c.donGia)), dgTuDong: !KT.isKhoan(c) && !Number.isInteger(Number(c.donGia)) };
      fm.addEventListener('input', (e) => {
        const n = e.target.name;
        if (!['soLuong', 'donGia', 'thanhTien'].includes(n)) return;
        so[n] = e.target.value;
        KT.syncCostInputs(so, n);
        ['donGia', 'thanhTien'].forEach((k) => { if (k !== n && g(k).value !== (so[k] || '')) g(k).value = so[k] || ''; });
        g('donGia').placeholder = so.dgTuDong && so.soLuong.trim() && so.thanhTien.trim() ? 'tự tính' : '';
      });
      const save = async () => {
        const data = {
          phieuId: c.phieuId, ngay: g('ngay').value, maCT: resolveCode(S.db.projects, g('maCT').value), maNha: g('maNha').value.trim() ? resolveCode(S.db.houses, g('maNha').value) : '',
          maNCC: resolveCode(S.db.suppliers, g('maNCC').value), soPhieu: g('soPhieu').value.trim(), maHM: resolveItem(g('maHM').value) || g('maHM').value.trim(),
          maVT: g('maVT').value.trim(), loaiCP: g('loaiCP').value, dienGiai: g('dienGiai').value.trim(),
          ghiChu: g('ghiChu').value.trim()
        };
        const val = (n, parse) => { const t = g(n).value.trim(); return t ? parse(t) : null; };
        const sl = val('soLuong', KT.parseQty);
        const dg = so.dgTuDong ? null : val('donGia', KT.parseAmount);
        const tt = val('thanhTien', KT.parseAmount);
        if (!KT.isISODate(data.ngay)) return bad('ngay', 'Ngày không hợp lệ');
        if (!projectByCode(data.maCT)) return bad('maCT', 'Công trình chưa có trong danh mục');
        if (!supplierByCode(data.maNCC)) return bad('maNCC', 'Nhà cung cấp chưa có trong danh mục');
        if (sl !== null && isNaN(sl)) return bad('soLuong', 'Số lượng không hợp lệ');
        if (dg !== null && (isNaN(dg) || dg < 0)) return bad('donGia', 'Đơn giá không hợp lệ');
        if (tt !== null && isNaN(tt)) return bad('thanhTien', 'Thành tiền không hợp lệ');
        const r = KT.costFromInput(sl, dg, tt, true);
        if (r.loi) return bad(r.cot, r.loi.charAt(0).toUpperCase() + r.loi.slice(1));
        Object.assign(data, { soLuong: sl === null ? '' : sl, donGia: dg === null ? '' : dg, thanhTien: tt === null ? '' : tt });
        try { await api('PUT', '/api/costs/' + c.id, data); toast('Đã lưu dòng chi phí'); h.close(); } catch (err) { showError(err); }
      };
      function bad(n, msg) { toast(msg, 'error'); fieldError(g(n), msg); }
      el.addEventListener('click', (e) => {
        const a = e.target.closest('[data-act]');
        if (!a) return;
        if (a.dataset.act === 'cancel') h.close();
        if (a.dataset.act === 'save') save();
      });
      fm.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } });
    }
  });
}

function fld(name, label, value, list, cls) {
  const req = label.endsWith(' *');
  return '<label class="field"><span class="label">' + esc(req ? label.slice(0, -2) : label) + (req ? ' <b class="req">*</b>' : '') + '</span>' +
    '<input name="' + name + '" class="input' + (cls ? ' ' + cls : '') + '" value="' + esc(value == null ? '' : value) + '"' + (list ? ' list="' + list + '"' : '') + '></label>';
}

export { groupName };
