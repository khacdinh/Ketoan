/* Phiếu nhập chi phí (tương đương sheet PHIEU_NHAP + macro GhiPhieuNhap):
 * khai báo đầu phiếu một lần, rồi nhập nhiều dòng Mã VT × Số lượng × Đơn giá. */
import { $, $$, esc, money, fdate, icon, api, toast, showError, confirmDialog, freshRoot, debounce, dateField, highlight, LS, focusInput, fieldError, busy } from '../ui.js';
import { S, costDatalists, resolveCode, resolveItem, materialByCode, itemByCode, houseByCode, projectByCode, supplierByCode, groupName, houseListOptions } from '../state.js';
import { openProjectForm, openSupplierForm } from '../forms.js';
import { openItemForm, openMaterialForm, openHouseForm } from './cost-catalogs.js';
import { openHistory } from './control.js';

const KT = window.KT;
const COLS = ['maVT', 'dienGiai', 'soLuong', 'donGia', 'hm', 'loaiCP'];
const ENTER_COLS = ['maVT', 'dienGiai', 'soLuong', 'donGia'];

// Bản nháp giữ lại khi chuyển màn hình hoặc khi dữ liệu được tải lại (thêm nhanh danh mục...)
let draft = LS.get('cp.draft', null);
let pendingFocus = null;

function blankLine() { return { maVT: '', dienGiai: '', soLuong: '', donGia: '', hm: '', loaiCP: '', goiY: '' }; }
function isBlank(l) { return !String(l.maVT).trim() && !String(l.dienGiai).trim() && !String(l.soLuong).trim() && !String(l.donGia).trim(); }

function routeParams() {
  const qs = (location.hash.split('?')[1] || '');
  const p = {};
  qs.split('&').filter(Boolean).forEach((kv) => { const [k, v] = kv.split('='); p[k] = decodeURIComponent(v || ''); });
  return p;
}

function slipLines(phieuId) {
  return S.costLedger.filter((c) => String(c.phieuId) === String(phieuId));
}

function headerFromLine(c) {
  const it = itemByCode(c.maHM);
  return { ngay: c.ngay, maCT: c.maCT || '', maNha: c.maNha || '', maNCC: c.maNCC || '', soPhieu: c.soPhieu || '', hm: it ? it.ten : '' };
}

function lineFromCost(c, headHM) {
  const it = itemByCode(c.maHM);
  const ten = it ? it.ten : c.maHM;
  return {
    maVT: c.maVT || '', dienGiai: c.dienGiai || '', soLuong: KT.fmtQty(c.soLuong), donGia: money(c.donGia),
    hm: ten && ten !== headHM ? ten : '', loaiCP: c.loaiCP !== KT.defaultLoaiCP(S.db, c.maVT, c.maHM) ? c.loaiCP : '', goiY: ''
  };
}

// Dựng trạng thái phiếu theo địa chỉ: mới / sửa phiếu / nhân bản phiếu
function initialState(params) {
  const mode = params.phieu ? 'edit' : params.nhanban ? 'dup' : 'new';
  const key = mode + ':' + (params.phieu || params.nhanban || '');
  if (draft && draft.key === key) return draft;
  if (mode === 'new') {
    const last = LS.get('cp.lastHeader', null);
    return { key, mode, header: Object.assign({ ngay: KT.todayISO(), maCT: '', maNha: '', maNCC: '', soPhieu: '', hm: '' }, last || {}, { soPhieu: '' }), lines: [blankLine()] };
  }
  const lines = slipLines(params.phieu || params.nhanban);
  if (!lines.length) return { key, mode: 'missing', header: {}, lines: [] };
  // hạng mục mặc định = hạng mục xuất hiện nhiều nhất trong phiếu
  const count = new Map();
  lines.forEach((c) => count.set(c.maHM, (count.get(c.maHM) || 0) + 1));
  const topHM = Array.from(count.entries()).sort((a, b) => b[1] - a[1])[0][0];
  const header = headerFromLine(lines[0]);
  header.hm = (itemByCode(topHM) || {}).ten || '';
  if (mode === 'dup') { header.ngay = KT.todayISO(); header.soPhieu = ''; }
  return { key, mode, phieuId: params.phieu || null, header, lines: lines.map((c) => lineFromCost(c, header.hm)).concat([blankLine()]) };
}

function saveDraft(st) {
  draft = st;
  const hasData = st.lines.some((l) => !isBlank(l));
  LS.set('cp.draft', hasData || st.mode !== 'new' ? st : null);
}

/* ============================== MÀN HÌNH ============================== */

export function renderCostEntry(root) {
  root = freshRoot(root);
  const params = routeParams();
  const st = initialState(params);
  if (st.mode === 'missing') {
    root.innerHTML = '<div class="sheet p-8 text-center"><p class="font-semibold">Không tìm thấy phiếu này</p><p class="mt-1 text-ink-3">Phiếu có thể đã bị xóa.</p>' +
      '<a class="btn btn-primary mt-4" href="#/cp-nhap">' + icon('plus') + 'Lập phiếu mới</a></div>' + recentHtml('');
    bindRecent(root);
    return;
  }
  const h = st.header;
  const editing = st.mode === 'edit';

  root.innerHTML =
    '<div id="cp-dl">' + costDatalists(h.maCT) + '</div>' +
    '<section class="sheet" aria-labelledby="h-dau">' +
    '<div class="sheet-head"><div><h2 id="h-dau" class="sheet-title">' + (editing ? 'Sửa phiếu nhập chi phí' : st.mode === 'dup' ? 'Nhân bản phiếu nhập chi phí' : 'Đầu phiếu') + '</h2>' +
    '<p class="sheet-note">' + (editing ? 'Lưu lại sẽ thay các dòng cũ của phiếu bằng các dòng bên dưới.' : 'Khai báo một lần cho cả phiếu, rồi liệt kê từng mặt hàng ở bảng dưới.') + '</p></div>' +
    (st.mode !== 'new' ? '<a href="#/cp-nhap" class="btn btn-ghost btn-sm" data-act="new">' + icon('plus') + 'Lập phiếu mới</a>' : '') + '</div>' +
    '<form id="cp-head" class="grid grid-cols-3 gap-x-5 gap-y-3 px-5 pb-4 max-xl:grid-cols-2 max-sm:grid-cols-1" novalidate autocomplete="off">' +
    '<label class="field"><span class="label">Ngày <b class="req">*</b></span>' + dateField({ name: 'ngay', value: h.ngay, required: true, label: 'Ngày' }) + '<span class="hint"></span></label>' +
    headField('maCT', 'Công trình', h.maCT, 'dl-projects', 'Gõ mã hoặc tên công trình', true) +
    headField('maNha', 'Nhà / khu', h.maNha, 'dl-nha', 'Để trống = dùng chung', false) +
    headField('maNCC', 'Nhà cung cấp', h.maNCC, 'dl-suppliers', 'Gõ mã hoặc tên', true) +
    '<label class="field"><span class="label">Số phiếu / chuyến</span><input name="soPhieu" class="input" value="' + esc(h.soPhieu) + '" placeholder="Số phiếu giao hàng, số chuyến..."><span class="hint"></span></label>' +
    headField('hm', 'Hạng mục', h.hm, 'dl-hm', 'Hạng mục mặc định cho cả phiếu', true) +
    '</form></section>' +

    '<section class="sheet overflow-hidden" aria-labelledby="h-dong">' +
    '<div class="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-2.5"><h2 id="h-dong" class="sheet-title">Các dòng hàng</h2>' +
    '<span class="text-[12.5px] text-ink-3">' + icon('keyboard', 'mr-1 align-[-3px] text-[15px]') + '<kbd>Enter</kbd> sang ô kế tiếp, <kbd>↑</kbd> <kbd>↓</kbd> đổi dòng (ở ô có danh sách gợi ý thì bấm kèm <kbd>Ctrl</kbd>), <kbd>Ctrl</kbd> + <kbd>Enter</kbd> lưu phiếu. ' +
    'Số lượng nhận <b class="font-medium text-ink-2">2,5</b> hoặc <b class="font-medium text-ink-2">10+5</b>; đơn giá nhận <b class="font-medium text-ink-2">50tr</b>, <b class="font-medium text-ink-2">300k</b>, <b class="font-medium text-ink-2">1.250.000</b>.</span></div>' +
    '<div class="scroll-x overflow-x-auto"><table class="ledger grid-entry" id="cp-lines">' +
    '<thead><tr><th class="num w-8">#</th><th class="w-[150px] min-w-[140px]">Mã VT</th><th>Tên vật tư</th><th class="w-[64px]">ĐVT</th><th>Diễn giải / quy cách</th>' +
    '<th class="num w-[100px] min-w-[90px]">Số lượng</th><th class="num w-[130px] min-w-[120px]">Đơn giá</th><th class="num money w-[140px]">Thành tiền</th><th class="w-[170px] min-w-[130px]">Hạng mục riêng</th><th class="w-[172px] min-w-[150px]">Loại CP</th><th class="w-8"><span class="sr-only">Xóa dòng</span></th></tr></thead>' +
    '<tbody id="cp-body"></tbody>' +
    '<tfoot><tr><td colspan="7" class="text-right" id="cp-total-label">Tổng phiếu</td><td class="num money"><span class="dbl" id="cp-total">0</span></td><td colspan="3" class="font-normal text-[12.5px] text-ink-3" id="cp-words"></td></tr></tfoot>' +
    '</table></div>' +
    '<div class="flex flex-wrap items-center gap-2 border-t border-rule bg-[#F8FAF6] px-4 py-3">' +
    '<button type="button" class="btn btn-ghost btn-sm" data-act="add-row">' + icon('plus') + 'Thêm dòng</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" data-act="clear">' + icon('eraser') + 'Xóa trắng các dòng</button>' +
    (editing ? '<button type="button" class="btn btn-danger-ghost btn-sm" data-act="del-slip">' + icon('trash') + 'Xóa phiếu</button>' +
      '<a class="btn btn-ghost btn-sm" href="#/cp-nhap?nhanban=' + esc(st.phieuId) + '">' + icon('copy') + 'Nhân bản phiếu</a>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="history">' + icon('history') + 'Lịch sử phiếu</button>' : '') +
    '<span class="flex-1"></span>' +
    '<span class="text-[13px] text-ink-2" id="cp-summary"></span>' +
    '<button type="button" class="btn btn-primary" data-act="save" title="Ctrl + Enter">' + icon('save') + (editing ? 'Lưu thay đổi' : 'Ghi vào sổ chi phí') + '</button>' +
    '</div></section>' +
    recentHtml(params.phieu || '');

  const form = $('#cp-head', root);
  const body = $('#cp-body', root);
  const get = (n) => form.elements[n];

  /* ---------- đầu phiếu ---------- */
  function readHeader() {
    h.ngay = get('ngay').value;
    h.maCT = get('maCT').value.trim();
    h.maNha = get('maNha').value.trim();
    h.maNCC = get('maNCC').value.trim();
    h.soPhieu = get('soPhieu').value.trim();
    h.hm = get('hm').value.trim();
  }
  function hintOf(name) { return get(name).closest('.field').querySelector('.hint'); }
  // Không ghi lại khi nội dung y hệt: bấm vào liên kết trong gợi ý làm ô nhập mất tiêu điểm → sự kiện change vẽ lại gợi ý
  // ngay giữa lúc nhấn chuột, liên kết bị thay mới và cú bấm không tới được.
  function setHint(name, html, cls) { const el = hintOf(name); if (el.dataset.src !== html) { el.innerHTML = html; el.dataset.src = html; } el.className = 'hint' + (cls ? ' ' + cls : ''); }

  function refreshHeaderHints() {
    // công trình
    const p = h.maCT ? projectByCode(h.maCT) : null;
    if (!h.maCT) setHint('maCT', '');
    else if (p) setHint('maCT', esc(p.ten), 'good');
    else setHint('maCT', 'Chưa có trong danh mục. <a href="#" data-act="add-ct">Thêm công trình này</a>', 'bad');
    // nhà
    const nha = h.maNha ? houseByCode(h.maNha) : null;
    if (!h.maNha) {
      const chung = S.db.houses.find((x) => x.chung && KT.keyOf(x.maCT) === KT.keyOf(h.maCT));
      setHint('maNha', p ? (chung ? 'Trống = không gán nhà. Nhà dùng chung: <a href="#" data-act="use-chung" data-ma="' + esc(chung.ma) + '">' + esc(chung.ma) + '</a>' :
        'Chưa có nhà nào của công trình. <a href="#" data-act="add-nha">Thêm nhà</a>') : '');
    } else if (!nha) setHint('maNha', 'Chưa có trong danh mục. <a href="#" data-act="add-nha">Thêm nhà này</a>', 'bad');
    else if (p && nha.maCT && KT.keyOf(nha.maCT) !== KT.keyOf(p.ma)) setHint('maNha', 'Nhà này thuộc công trình ' + esc(nha.maCT), 'bad');
    else setHint('maNha', esc(nha.ten) + (nha.chung ? ' (dùng chung)' : ''), 'good');
    // NCC + công nợ
    const s = h.maNCC ? supplierByCode(h.maNCC) : null;
    if (!h.maNCC) setHint('maNCC', '');
    else if (!s) setHint('maNCC', 'Chưa có trong danh mục. <a href="#" data-act="add-ncc">Thêm nhà cung cấp này</a>', 'bad');
    else {
      const d = KT.debtOf(S.db, s.ma, p ? p.ma : '');
      let txt = esc(s.ten) + (s.loai ? ' · ' + esc(s.loai) : '');
      if (d) txt += '<br>' + (d.conLai > 0 ? 'Còn nợ ' : d.conLai < 0 ? 'Ứng dư ' : 'Đã tất toán') + (d.conLai ? '<b class="font-semibold tabular-nums">' + money(Math.abs(d.conLai)) + ' đ</b>' : '') + (p ? ' tại công trình này' : '');
      setHint('maNCC', txt, 'good');
    }
    // hạng mục
    const it = h.hm ? KT.findCostItem(S.db, h.hm) : null;
    if (!h.hm) setHint('hm', 'Dòng không ghi hạng mục riêng sẽ lấy hạng mục này');
    else if (it) setHint('hm', 'Thuộc nhóm ' + esc(groupName(it.maNhom) || '(chưa có nhóm)'), 'good');
    else setHint('hm', 'Chưa có trong danh mục. <a href="#" data-act="add-hm" data-for="head">Thêm hạng mục này</a>', 'bad');
  }

  function refreshNhaList() {
    const dl = $('#dl-nha', root);
    if (dl) dl.innerHTML = houseListOptions(projectByCode(h.maCT) ? projectByCode(h.maCT).ma : '');
  }
  // Datalist vật tư: vật tư của hạng mục đang chọn lên đầu (giống danh sách lọc theo hạng mục của file Excel)
  function refreshVtList() {
    const it = KT.findCostItem(S.db, h.hm);
    const k = it ? KT.keyOf(it.ma) : '';
    const list = S.db.materials.slice().sort((a, b) => (KT.keyOf(b.maHM) === k) - (KT.keyOf(a.maHM) === k));
    $('#dl-vt', root).innerHTML = list.map((m) => '<option value="' + esc(m.ma) + '">' + esc(m.ten + (m.dvt ? ' · ' + m.dvt : '')) + '</option>').join('');
  }

  form.addEventListener('input', () => { readHeader(); saveDraft(st); });
  form.addEventListener('change', (e) => {
    const n = e.target.name;
    if (n === 'maCT') {
      get('maCT').value = resolveCode(S.db.projects, get('maCT').value);
      readHeader();
      const p = projectByCode(h.maCT);
      const nha = h.maNha ? houseByCode(h.maNha) : null;
      if (p && (!h.maNha || (nha && KT.keyOf(nha.maCT) !== KT.keyOf(p.ma)))) {
        const chung = S.db.houses.find((x) => x.chung && KT.keyOf(x.maCT) === KT.keyOf(p.ma));
        get('maNha').value = chung ? chung.ma : '';
      }
      refreshNhaList();
    }
    if (n === 'maNCC') get('maNCC').value = resolveCode(S.db.suppliers, get('maNCC').value);
    if (n === 'maNha') get('maNha').value = resolveCode(S.db.houses, get('maNha').value);
    if (n === 'hm') {
      const it = KT.findCostItem(S.db, get('hm').value);
      if (it) get('hm').value = it.ten;
    }
    readHeader();
    saveDraft(st);
    refreshHeaderHints();
    if (n === 'hm') refreshVtList();
    if (n === 'hm' || n === 'maNCC') st.lines.forEach((l, i) => { updateRow(i); });
  });

  /* ---------- các dòng ---------- */
  function rowHtml(l, i) {
    const cell = (col, val, cls, extra) => '<input class="cell' + (cls ? ' ' + cls : '') + '" data-col="' + col + '" data-row="' + i + '" value="' + esc(val) + '"' + (extra || '') + '>';
    return '<tr data-row="' + i + '">' +
      '<td class="num text-ink-3">' + (i + 1) + '</td>' +
      '<td>' + cell('maVT', l.maVT, 'font-semibold', ' list="dl-vt" aria-label="Mã vật tư dòng ' + (i + 1) + '" autocomplete="off"') + '</td>' +
      '<td class="vt-name"></td><td class="vt-dvt text-ink-2"></td>' +
      '<td>' + cell('dienGiai', l.dienGiai, '', ' aria-label="Diễn giải dòng ' + (i + 1) + '"') + '</td>' +
      '<td>' + cell('soLuong', l.soLuong, 'text-right tabular-nums', ' inputmode="decimal" aria-label="Số lượng dòng ' + (i + 1) + '"') + '</td>' +
      '<td>' + cell('donGia', l.donGia, 'text-right tabular-nums' + (l.goiY ? ' suggested' : ''), ' inputmode="decimal" aria-label="Đơn giá dòng ' + (i + 1) + '"') + '</td>' +
      '<td class="num money font-semibold tt"></td>' +
      '<td>' + cell('hm', l.hm, '', ' list="dl-hm" placeholder="theo đầu phiếu" aria-label="Hạng mục riêng dòng ' + (i + 1) + '"') + '</td>' +
      '<td><select class="cell" data-col="loaiCP" data-row="' + i + '" aria-label="Loại chi phí dòng ' + (i + 1) + '"></select></td>' +
      '<td class="actions"><button type="button" class="icon-btn danger" data-act="del-row" tabindex="-1" title="Xóa dòng" aria-label="Xóa dòng ' + (i + 1) + '">' + icon('x') + '</button></td></tr>';
  }

  function drawRows() {
    ensureTrailingBlank();
    body.innerHTML = st.lines.map(rowHtml).join('');
    st.lines.forEach((l, i) => updateRow(i));
    updateTotals();
  }

  function ensureTrailingBlank() {
    if (!st.lines.length || !isBlank(st.lines[st.lines.length - 1])) st.lines.push(blankLine());
  }

  function lineHM(l) {
    const it = KT.findCostItem(S.db, l.hm || h.hm);
    return it ? it.ma : '';
  }

  function updateRow(i) {
    const tr = body.querySelector('tr[data-row="' + i + '"]');
    const l = st.lines[i];
    if (!tr || !l) return;
    const code = l.maVT.trim();
    const m = code ? materialByCode(code) : null;
    const nameTd = tr.querySelector('.vt-name');
    // (chỉ ghi lại khi đổi, xem setHint: tránh thay liên kết "Thêm" giữa lúc đang nhấn chuột)
    const nameHtml = !code ? (l.dienGiai || isBlank(l) ? '' : '<span class="text-ink-3">(không mã vật tư)</span>')
      : m ? '<span title="' + esc(m.ma) + '">' + esc(m.ten) + '</span>'
        : '<span class="text-alert">Chưa có mã này.</span> <a href="#" class="font-semibold text-pen underline underline-offset-2" data-act="add-vt" data-row="' + i + '">Thêm</a>';
    if (nameTd.dataset.src !== nameHtml) { nameTd.innerHTML = nameHtml; nameTd.dataset.src = nameHtml; }
    tr.querySelector('.vt-dvt').textContent = m ? (m.dvt || '') : '';
    tr.querySelector('[data-col=maVT]').classList.toggle('bad', !!code && !m);
    // thành tiền
    const sl = KT.parseQty(l.soLuong);
    const dg = KT.parseAmount(l.donGia);
    const tt = !isNaN(sl) && !isNaN(dg) && String(l.soLuong).trim() && String(l.donGia).trim() ? KT.costAmount(sl, dg) : null;
    tr.querySelector('.tt').textContent = tt == null ? '' : money(tt);
    tr.querySelector('[data-col=soLuong]').classList.toggle('bad', String(l.soLuong).trim() !== '' && (isNaN(sl) || sl <= 0));
    tr.querySelector('[data-col=donGia]').classList.toggle('bad', String(l.donGia).trim() !== '' && (isNaN(dg) || dg < 0));
    // hạng mục riêng
    const hmInp = tr.querySelector('[data-col=hm]');
    hmInp.classList.toggle('bad', !!l.hm.trim() && !KT.findCostItem(S.db, l.hm));
    // loại CP: tùy chọn đầu tiên cho biết loại tự xác định
    const auto = KT.defaultLoaiCP(S.db, m ? m.ma : '', lineHM(l));
    const sel = tr.querySelector('[data-col=loaiCP]');
    sel.innerHTML = '<option value="">Tự động: ' + esc(auto) + '</option>' + KT.LOAI_CP.map((x) => '<option' + (l.loaiCP === x ? ' selected' : '') + '>' + esc(x) + '</option>').join('');
    // gợi ý đơn giá
    const dgInp = tr.querySelector('[data-col=donGia]');
    dgInp.classList.toggle('suggested', !!l.goiY);
    // cảnh báo (không chặn) khi đơn giá lệch nhiều so với lần mua gần nhất: hay gặp khi gõ thừa/thiếu số 0
    const warn = !l.goiY && m && !isNaN(dg) && dg > 0 ? priceWarn(m.ma, dg) : '';
    dgInp.classList.toggle('warn', !!warn);
    dgInp.title = l.goiY || warn;
    let pw = dgInp.parentNode.querySelector('.price-warn');
    if (warn && !pw) { pw = document.createElement('span'); pw.className = 'price-warn'; dgInp.parentNode.appendChild(pw); }
    if (pw) { if (warn) pw.textContent = warn.split(' · ')[0]; else pw.remove(); }
  }

  function priceWarn(maVT, dg) {
    const lp = KT.lastPrice(S.db, maVT, resolveCode(S.db.suppliers, h.maNCC));
    if (!lp || !(lp.donGia > 0)) return '';
    const r = dg / lp.donGia;
    if (r < 1.5 && r > 1 / 1.5) return '';
    const pct = Math.round((r - 1) * 100);
    return (pct > 0 ? 'Cao hơn ' : 'Thấp hơn ') + Math.abs(pct).toLocaleString('vi-VN') + '% giá lần trước · Lần mua ' + fdate(lp.ngay) + ': ' + money(lp.donGia) + ' đ. Kiểm tra lại nếu gõ nhầm.';
  }

  function updateTotals() {
    let total = 0;
    let n = 0;
    st.lines.forEach((l) => {
      if (isBlank(l)) return;
      n++;
      const sl = KT.parseQty(l.soLuong);
      const dg = KT.parseAmount(l.donGia);
      if (!isNaN(sl) && !isNaN(dg)) total += KT.costAmount(sl, dg);
    });
    $('#cp-total', root).textContent = money(total);
    $('#cp-total-label', root).textContent = 'Tổng phiếu (' + n + ' dòng)';
    $('#cp-words', root).textContent = total ? KT.docTienBangChu(total) : '';
    $('#cp-summary', root).textContent = n ? n + ' dòng, ' + money(total) + ' đ' : '';
  }

  // Gợi ý đơn giá lần mua gần nhất (ưu tiên cùng nhà cung cấp)
  function suggestPrice(i) {
    const l = st.lines[i];
    if (String(l.donGia).trim() && !l.goiY) return;
    const m = materialByCode(l.maVT);
    const lp = m ? KT.lastPrice(S.db, m.ma, resolveCode(S.db.suppliers, h.maNCC)) : null;
    if (!lp) { if (l.goiY) { l.donGia = ''; l.goiY = ''; } return; }
    l.donGia = money(lp.donGia);
    l.goiY = 'Giá lần mua gần nhất ' + fdate(lp.ngay) + (lp.cungNCC ? ' của nhà cung cấp này' : ' (nhà cung cấp ' + lp.maNCC + ')') + '. Gõ đè để đổi.';
    const inp = body.querySelector('[data-row="' + i + '"][data-col=donGia]');
    if (inp) inp.value = l.donGia;
  }

  body.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.dataset.col) return;
    const i = Number(t.dataset.row);
    const l = st.lines[i];
    l[t.dataset.col] = t.value;
    if (t.dataset.col === 'donGia') l.goiY = '';
    const wasLast = i === st.lines.length - 1;
    updateRow(i);
    updateTotals();
    if (wasLast && !isBlank(l)) {
      st.lines.push(blankLine());
      body.insertAdjacentHTML('beforeend', rowHtml(st.lines[st.lines.length - 1], st.lines.length - 1));
      updateRow(st.lines.length - 1);
    }
    saveDraft(st);
  });

  body.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.dataset.col) return;
    const i = Number(t.dataset.row);
    const l = st.lines[i];
    const col = t.dataset.col;
    if (col === 'maVT') {
      // cho gõ tên vật tư: tìm đúng tên thì đổi sang mã
      let v = t.value.trim();
      const byCode = materialByCode(v);
      if (byCode) v = byCode.ma;
      else if (v) {
        const n = KT.normalizeText(v).trim();
        const byName = S.db.materials.filter((m) => KT.normalizeText(m.ten).trim() === n);
        if (byName.length === 1) v = byName[0].ma;
      }
      t.value = v;
      l.maVT = v;
      suggestPrice(i);
    } else if (col === 'soLuong') {
      const n = KT.parseQty(t.value);
      if (!isNaN(n) && t.value.trim()) { t.value = KT.fmtQty(n); l.soLuong = t.value; }
    } else if (col === 'donGia') {
      const n = KT.parseAmount(t.value);
      if (!isNaN(n) && t.value.trim()) { t.value = money(n); l.donGia = t.value; }
    } else if (col === 'hm') {
      const it = KT.findCostItem(S.db, t.value);
      if (it) { t.value = it.ten; l.hm = it.ten; }
    } else if (col === 'loaiCP') {
      l.loaiCP = t.value;
    }
    updateRow(i);
    updateTotals();
    saveDraft(st);
  });

  function focusCell(row, col) {
    const el = body.querySelector('[data-row="' + row + '"][data-col="' + col + '"]');
    if (el) { el.focus(); if (el.select) el.select(); }
    return el;
  }

  body.addEventListener('keydown', (e) => {
    const t = e.target;
    if (!t.dataset || !t.dataset.col) return;
    const row = Number(t.dataset.row);
    const col = t.dataset.col;
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      t.dispatchEvent(new Event('change', { bubbles: true }));
      const k = ENTER_COLS.indexOf(col);
      if (k >= 0 && k < ENTER_COLS.length - 1) focusCell(row, ENTER_COLS[k + 1]);
      else {
        if (row === st.lines.length - 1) { st.lines.push(blankLine()); drawRows(); }
        focusCell(row + 1, 'maVT');
      }
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (!t.list || e.ctrlKey) && t.tagName === 'INPUT') {
      e.preventDefault();
      t.dispatchEvent(new Event('change', { bubbles: true }));
      focusCell(row + (e.key === 'ArrowDown' ? 1 : -1), col);
    } else if (e.key === 'Delete' && e.ctrlKey) {
      e.preventDefault();
      removeRow(row);
      focusCell(Math.min(row, st.lines.length - 1), col);
    }
  });

  function removeRow(i) {
    st.lines.splice(i, 1);
    drawRows();
    saveDraft(st);
  }

  /* ---------- lưu ---------- */
  function mark(row, col) {
    const el = row == null ? focusInput(get(col)) : focusCell(row, col);
    if (el) {
      el.classList.add('invalid');
      el.addEventListener('input', () => el.classList.remove('invalid'), { once: true });
    }
  }
  // Ô ở đầu phiếu: báo ngay dưới ô; ô trong bảng: tô đỏ ô. Luôn kèm thông báo tóm tắt (cho biết dòng nào).
  function fail(msg, row, col) {
    toast(msg, 'error');
    if (row == null) fieldError(get(col), msg); else mark(row, col);
    return false;
  }

  let saving = false;
  async function save() {
    if (saving) return;
    readHeader();
    if (!KT.isISODate(h.ngay)) return fail('Nhập ngày của phiếu, ví dụ 29/9', null, 'ngay');
    const ct = projectByCode(resolveCode(S.db.projects, h.maCT));
    if (!ct) return fail(h.maCT ? 'Công trình "' + h.maCT + '" chưa có trong danh mục' : 'Chọn công trình', null, 'maCT');
    const ncc = supplierByCode(resolveCode(S.db.suppliers, h.maNCC));
    if (!ncc) return fail(h.maNCC ? 'Nhà cung cấp "' + h.maNCC + '" chưa có trong danh mục' : 'Chọn nhà cung cấp', null, 'maNCC');
    let nha = null;
    if (h.maNha) {
      nha = houseByCode(h.maNha);
      if (!nha) return fail('Nhà "' + h.maNha + '" chưa có trong danh mục', null, 'maNha');
      if (nha.maCT && KT.keyOf(nha.maCT) !== KT.keyOf(ct.ma)) return fail('Nhà ' + nha.ma + ' thuộc công trình ' + nha.maCT, null, 'maNha');
    }
    const headHM = h.hm ? resolveItem(h.hm) : '';
    if (h.hm && !headHM) return fail('Hạng mục "' + h.hm + '" chưa có trong danh mục', null, 'hm');
    const lines = [];
    for (let i = 0; i < st.lines.length; i++) {
      const l = st.lines[i];
      if (isBlank(l)) continue;
      const where = 'Dòng ' + (i + 1) + ': ';
      const m = l.maVT.trim() ? materialByCode(l.maVT) : null;
      if (l.maVT.trim() && !m) return fail(where + 'mã vật tư "' + l.maVT + '" chưa có trong danh mục', i, 'maVT');
      if (!m && !l.dienGiai.trim()) return fail(where + 'cần Mã VT hoặc Diễn giải (khoản nhân công, phí...)', i, 'maVT');
      const sl = KT.parseQty(l.soLuong);
      if (!String(l.soLuong).trim() || isNaN(sl)) return fail(where + 'thiếu hoặc sai Số lượng', i, 'soLuong');
      if (sl <= 0) return fail(where + 'Số lượng phải lớn hơn 0', i, 'soLuong');
      const dg = KT.parseAmount(l.donGia);
      if (!String(l.donGia).trim() || isNaN(dg)) return fail(where + 'thiếu hoặc sai Đơn giá', i, 'donGia');
      if (dg < 0) return fail(where + 'Đơn giá không được âm', i, 'donGia');
      const hm = l.hm.trim() ? resolveItem(l.hm) : headHM;
      if (l.hm.trim() && !hm) return fail(where + 'hạng mục "' + l.hm + '" chưa có trong danh mục', i, 'hm');
      if (!hm) return fail(where + 'chưa có Hạng mục. Chọn hạng mục ở đầu phiếu hoặc ghi riêng cho dòng này', h.hm ? i : null, h.hm ? 'hm' : 'hm');
      lines.push({ _row: i + 1, maVT: m ? m.ma : '', dienGiai: l.dienGiai.trim(), soLuong: sl, donGia: dg, maHM: hm, loaiCP: l.loaiCP });
    }
    if (!lines.length) return fail('Phiếu chưa có dòng hàng nào', 0, 'maVT');
    const payload = { header: { ngay: h.ngay, maCT: ct.ma, maNha: nha ? nha.ma : '', maNCC: ncc.ma, soPhieu: h.soPhieu, maHM: headHM }, lines };
    saving = true;
    const done = busy(root.querySelector('[data-act=save]'), editing ? 'Đang lưu…' : 'Đang ghi…');
    try {
      const r = editing ? await api('PUT', '/api/cost-slips/' + st.phieuId, payload) : await api('POST', '/api/cost-slips', payload);
      toast((editing ? 'Đã lưu phiếu: ' : 'Đã ghi ') + r.count + ' dòng, tổng ' + money(r.total) + ' đ vào sổ chi phí');
      LS.set('cp.lastHeader', { ngay: h.ngay, maCT: ct.ma, maNha: nha ? nha.ma : '', maNCC: ncc.ma, hm: h.hm });
      draft = null;
      LS.set('cp.draft', null);
      if (editing || st.mode === 'dup') location.hash = '#/cp-nhap';
      else {
        // giống macro: giữ đầu phiếu, xóa trắng phần hàng và số phiếu để nhập chuyến tiếp theo
        pendingFocus = { col: 'maVT', row: 0 };
        renderCostEntry(document.getElementById('view'));
      }
    } catch (err) {
      showError(err);
      const mm = /^Dòng (\d+):/.exec(err.message || '');
      if (mm) focusCell(Number(mm[1]) - 1, 'maVT');
    } finally {
      saving = false;
      done();
    }
  }

  /* ---------- thao tác ---------- */
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (e.target.dispatchEvent) e.target.dispatchEvent(new Event('change', { bubbles: true }));
      save();
    }
  });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && e.target.name) {
      e.preventDefault();
      const order = ['maCT', 'maNha', 'maNCC', 'soPhieu', 'hm'];
      const k = order.indexOf(e.target.name);
      if (k >= 0 && k < order.length - 1) focusInput(get(order[k + 1]));
      else if (k === order.length - 1) { e.target.dispatchEvent(new Event('change', { bubbles: true })); focusCell(0, 'maVT'); }
    }
  });

  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (a.tagName === 'A' && act !== 'new') e.preventDefault();
    // sau khi thêm nhanh vào danh mục: điền mã mới vào ô rồi vẽ lại (dữ liệu vừa tải lại)
    const after = (row, col, apply) => (x) => {
      apply(x);
      saveDraft(st);
      pendingFocus = { row, col };
      renderCostEntry(document.getElementById('view'));
    };
    if (act === 'save') save();
    else if (act === 'history') openHistory(st.phieuId);
    else if (act === 'add-row') { st.lines.push(blankLine()); drawRows(); focusCell(st.lines.length - 1, 'maVT'); }
    else if (act === 'del-row') removeRow(Number(a.closest('tr').dataset.row));
    else if (act === 'clear') {
      if (st.lines.some((l) => !isBlank(l)) && !(await confirmDialog({ title: 'Xóa trắng các dòng', message: 'Xóa hết các dòng hàng đang nhập (chưa lưu)?', okText: 'Xóa trắng', danger: true }))) return;
      st.lines = [blankLine()];
      saveDraft(st);
      drawRows();
      focusCell(0, 'maVT');
    } else if (act === 'use-chung') { get('maNha').value = a.dataset.ma; get('maNha').dispatchEvent(new Event('change', { bubbles: true })); }
    else if (act === 'add-ct') openProjectForm({ ma: h.maCT }, after(null, 'maNha', (p) => { h.maCT = p.ma; }));
    else if (act === 'add-ncc') openSupplierForm({ ma: h.maNCC }, after(null, 'soPhieu', (x) => { h.maNCC = x.ma; }));
    else if (act === 'add-nha') {
      const p = projectByCode(h.maCT);
      openHouseForm({ ma: h.maNha, maCT: p ? p.ma : '' }, after(null, 'maNCC', (x) => { h.maNha = x.ma; }));
    } else if (act === 'add-hm') openItemForm({ ten: h.hm }, after(0, 'maVT', (x) => { h.hm = x.ten; }));
    else if (act === 'add-vt') {
      const i = Number(a.dataset.row);
      openMaterialForm({ ma: st.lines[i].maVT, maHM: lineHM(st.lines[i]) }, after(i, 'soLuong', (x) => { st.lines[i].maVT = x.ma; }));
    } else if (act === 'del-slip') {
      const n = slipLines(st.phieuId).length;
      if (!(await confirmDialog({ trash: true, title: 'Xóa phiếu nhập', html: 'Xóa phiếu này cùng <b class="text-ink">' + n + '</b> dòng trong sổ chi phí?', okText: 'Xóa phiếu', danger: true }))) return;
      try { await api('DELETE', '/api/cost-slips/' + st.phieuId); draft = null; LS.set('cp.draft', null); toast('Đã xóa phiếu, chuyển vào Thùng rác'); location.hash = '#/cp-nhap'; } catch (err) { showError(err); }
    }
  });
  bindRecent(root);

  refreshHeaderHints();
  refreshVtList();
  drawRows();
  saveDraft(st);
  const pf = pendingFocus;
  pendingFocus = null;
  setTimeout(() => {
    if (pf && pf.row != null) focusCell(pf.row, pf.col);
    else if (pf) focusInput(get(pf.col));
    else if (st.mode === 'new' && !h.maCT) focusInput(get('ngay'));
    else focusCell(Math.max(0, st.lines.findIndex(isBlank)), 'maVT');
  }, 40);
}

function headField(name, label, value, list, placeholder, required) {
  return '<label class="field"><span class="label">' + esc(label) + (required ? ' <b class="req">*</b>' : '') + '</span>' +
    '<input name="' + name + '" class="input" list="' + list + '" value="' + esc(value || '') + '" placeholder="' + esc(placeholder) + '" autocomplete="off">' +
    '<span class="hint"></span></label>';
}

/* ============================== PHIẾU ĐÃ NHẬP GẦN ĐÂY ============================== */

let recentQ = '';

function recentHtml(activeId) {
  return '<section class="sheet overflow-hidden no-print" aria-labelledby="h-gan">' +
    '<div class="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-2.5"><h2 id="h-gan" class="sheet-title">Phiếu đã nhập</h2>' +
    '<label class="search min-w-[260px] flex-1">' + icon('search') + '<input id="rc-q" type="search" class="input input-sm" placeholder="Tìm nhà cung cấp, công trình, số phiếu, hạng mục" value="' + esc(recentQ) + '"></label>' +
    '<a href="#/cp-so" class="btn btn-ghost btn-sm">' + icon('book') + 'Mở sổ chi phí</a></div>' +
    '<div class="max-h-[420px] overflow-auto"><table class="ledger ledger-compact"><thead><tr><th>Ngày</th><th>Công trình / nhà</th><th>Nhà cung cấp</th><th>Số phiếu</th><th>Hạng mục</th><th class="num">Số dòng</th><th class="num money">Tổng tiền</th><th></th></tr></thead>' +
    '<tbody id="rc-body" data-active="' + esc(activeId || '') + '"></tbody></table></div></section>';
}

function drawRecent(root) {
  const tb = $('#rc-body', root);
  if (!tb) return;
  const q = KT.normalizeText(recentQ).trim();
  const all = KT.costSlips(S.db, S.costLedger);
  const list = all.filter((s) => !q || KT.normalizeText([s.maCT, s.tenCT, s.maNha, s.maNCC, s.tenNCC, s.soPhieu, s.hangMuc.join(' '), KT.fmtMoney(s.total)].join(' ')).includes(q)).slice(0, 60);
  const active = tb.dataset.active;
  tb.innerHTML = list.length ? list.map((s) =>
    '<tr data-phieu="' + esc(s.phieuId || '') + '"' + (String(s.phieuId) === active ? ' class="is-active"' : '') + '>' +
    '<td class="whitespace-nowrap">' + fdate(s.ngay) + '</td>' +
    '<td><span class="code">' + highlight(s.maCT, recentQ) + '</span>' + (s.maNha && s.maNha !== s.maCT ? ' <span class="text-ink-3">/ ' + highlight(s.maNha, recentQ) + '</span>' : '') + '</td>' +
    '<td>' + highlight(s.tenNCC || s.maNCC, recentQ) + '</td><td>' + highlight(s.soPhieu, recentQ) + '</td>' +
    '<td class="max-w-[260px] truncate text-ink-2" title="' + esc(s.hangMuc.join(', ')) + '">' + highlight(s.hangMuc.join(', '), recentQ) + '</td>' +
    '<td class="num">' + s.lines.length + '</td><td class="num money font-semibold">' + money(s.total) + '</td>' +
    '<td class="actions">' + (s.phieuId ?
      '<a class="icon-btn" href="#/cp-nhap?phieu=' + s.phieuId + '" title="Sửa phiếu" aria-label="Sửa phiếu">' + icon('edit') + '</a>' +
      '<a class="icon-btn" href="#/cp-nhap?nhanban=' + s.phieuId + '" title="Nhân bản phiếu" aria-label="Nhân bản phiếu">' + icon('copy') + '</a>' +
      '<button type="button" class="icon-btn danger" data-rc="del" title="Xóa phiếu" aria-label="Xóa phiếu">' + icon('trash') + '</button>' : '') + '</td></tr>').join('')
    : '<tr><td colspan="8" class="empty">' + (all.length ? 'Không có phiếu nào khớp.' : 'Chưa có phiếu nào. Nhập phiếu đầu tiên ở trên, hoặc nhập từ file Excel trong Cài đặt.') + '</td></tr>';
}

function bindRecent(root) {
  const q = $('#rc-q', root);
  if (!q) return;
  q.addEventListener('input', debounce(() => { recentQ = q.value; drawRecent(root); }, 120));
  $('#rc-body', root).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rc=del]');
    if (!b) return;
    const id = b.closest('tr').dataset.phieu;
    const n = slipLines(id).length;
    if (!(await confirmDialog({ trash: true, title: 'Xóa phiếu nhập', html: 'Xóa phiếu này cùng <b class="text-ink">' + n + '</b> dòng trong sổ chi phí?', okText: 'Xóa phiếu', danger: true }))) return;
    try { await api('DELETE', '/api/cost-slips/' + id); toast('Đã xóa phiếu, chuyển vào Thùng rác'); } catch (err) { showError(err); }
  });
  drawRecent(root);
}

export { $$ };
