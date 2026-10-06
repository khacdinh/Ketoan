/* Phiếu nhập chi phí (tương đương sheet PHIEU_NHAP + macro GhiPhieuNhap):
 * khai báo đầu phiếu một lần, rồi nhập nhiều dòng Mã VT × Số lượng × Đơn giá (hoặc chỉ Thành tiền cho khoản khoán). */
import { $, $$, esc, money, fdate, icon, api, toast, showError, confirmDialog, confirmCopy, freshRoot, debounce, dateField, highlight, LS, focusInput, fieldError, busy, setPageTags, densityToggle, bindDensity } from '../ui.js';
import { printSlip } from '../print.js';
import { hauQuaCongNo } from '../congno.js';
import { S, costDatalists, resolveCode, resolveItem, materialByCode, itemByCode, houseByCode, projectByCode, supplierByCode, groupName, houseListOptions, allCostLedger } from '../state.js';
import { openProjectForm, openSupplierForm } from '../forms.js';
import { openItemForm, openMaterialForm, openHouseForm } from './cost-catalogs.js';
import { openHistory } from './control.js';
import { attachBlock, bindAttach, pendingBlock, bindPending, pendingFiles, clearPending, uploadFiles } from '../attach.js';

const KT = window.KT;
const PENDING = 'cp-moi'; // khóa danh sách file chờ của phiếu mới đang lập
const ENTER_COLS = ['ct', 'maVT', 'dienGiai', 'soLuong', 'donGia', 'thanhTien'];
const has = (v) => String(v == null ? '' : v).trim() !== '';

// Bản nháp giữ lại khi chuyển màn hình hoặc khi dữ liệu được tải lại (thêm nhanh danh mục...)
let draft = LS.get('cp.draft', null);
// Phiếu MỚI đang nhập dở: ngày về hôm nay mỗi lần mở lại phần mềm hoặc rời trang rồi quay lại
// (vẫn giữ ngày đã chọn khi trang tự vẽ lại lúc dữ liệu đổi, vd vừa thêm vật tư). Phiếu đang sửa giữ ngày của phiếu.
function ngayVeHomNay() {
  if (!draft || draft.mode !== 'new' || !draft.header || draft.header.ngay === KT.todayISO()) return;
  draft.header.ngay = KT.todayISO();
  if (LS.get('cp.draft', null)) LS.set('cp.draft', draft);
}
ngayVeHomNay();
const trangCua = (url) => String(url || '').split('#')[1] ? String(url).split('#')[1].replace(/^\/?/, '').split('?')[0] : '';
window.addEventListener('hashchange', (e) => { if (trangCua(e.oldURL) === 'cp-nhap' && trangCua(e.newURL) !== 'cp-nhap') ngayVeHomNay(); });
let pendingFocus = null;

// Hạng mục của vật tư (gắn sẵn ở Danh mục vật tư, kéo theo nhóm chi phí): dòng có mã vật tư luôn theo hạng mục này
function hmCuaVatTu(maVT) {
  const m = maVT && String(maVT).trim() ? materialByCode(String(maVT).trim()) : null;
  return m && m.maHM ? KT.findCostItem(S.db, m.maHM) : null;
}

// nhà / khu dùng chung của một công trình (tự điền khi chọn công trình cho dòng)
function chungCua(ct) {
  const x = ct ? S.db.houses.find((h) => h.chung && KT.keyOf(h.maCT) === KT.keyOf(ct)) : null;
  return x ? x.ma : '';
}

function blankLine() { return { ct: '', nha: '', maVT: '', dienGiai: '', soLuong: '', donGia: '', thanhTien: '', ttTuDong: false, dgTuDong: false, hmCu: '', goiY: '' }; }
// dòng trống mới chép công trình, nhà / khu của dòng trên (thường nhiều dòng liền nhau cùng công trình)
function dongMoiTheo(l) { return Object.assign(blankLine(), l ? { ct: l.ct || '', nha: l.nha || '' } : {}); }
function isBlank(l) { return !has(l.maVT) && !has(l.dienGiai) && !has(l.soLuong) && !has(l.donGia) && !has(l.thanhTien); }

// SL / ĐG / Thành tiền của dòng theo quy tắc chung (KT.costFromInput); số sai -> { loi, cot }
function lineAmounts(l) {
  const sl = has(l.soLuong) ? KT.parseQty(l.soLuong) : null;
  if (sl !== null && isNaN(sl)) return { loi: 'sai Số lượng', cot: 'soLuong' };
  const dg = has(l.donGia) && !l.dgTuDong ? KT.parseAmount(l.donGia) : null; // ĐG tự tính từ Thành tiền: để máy chủ tính
  if (dg !== null && isNaN(dg)) return { loi: 'sai Đơn giá', cot: 'donGia' };
  if (dg !== null && dg < 0) return { loi: 'Đơn giá không được âm', cot: 'donGia' };
  const tt = has(l.thanhTien) ? KT.parseAmount(l.thanhTien) : null;
  if (tt !== null && isNaN(tt)) return { loi: 'sai Thành tiền', cot: 'thanhTien' };
  return Object.assign(KT.costFromInput(sl, dg, tt, true), { nhap: { soLuong: sl === null ? '' : sl, donGia: dg === null ? '' : dg, thanhTien: tt === null ? '' : tt } });
}

function routeParams(hash) {
  const qs = ((hash || location.hash).split('?')[1] || '');
  const p = {};
  qs.split('&').filter(Boolean).forEach((kv) => { const [k, v] = kv.split('='); p[k] = decodeURIComponent(v || ''); });
  return p;
}

// Hậu quả công nợ khi xóa cả phiếu nhập
function slipHauQua(phieuId) {
  const ls = allCostLedger().filter((c) => String(c.phieuId) === String(phieuId));
  if (!ls.length) return '';
  return hauQuaCongNo(ls[0].maNCC, -ls.reduce((t, c) => t + (c.thanhTien || 0), 0), ls[0].maCT);
}

function slipLines(phieuId) {
  return allCostLedger().filter((c) => String(c.phieuId) === String(phieuId));
}

function headerFromLine(c) {
  const it = itemByCode(c.maHM);
  return { ngay: c.ngay, maCT: c.maCT || '', maNha: c.maNha || '', maNCC: c.maNCC || '', soPhieu: c.soPhieu || '' };
}

function lineFromCost(c, headCT) {
  const it = itemByCode(c.maHM);
  const ten = it ? it.ten : c.maHM;
  return {
    maVT: c.maVT || '', dienGiai: c.dienGiai || '', soLuong: KT.fmtQty(c.soLuong), donGia: KT.isKhoan(c) ? '' : money(c.donGia), thanhTien: money(c.thanhTien),
    // ĐG có số lẻ (từ file Excel): ô tiền chỉ hiện số chẵn, nên giữ Thành tiền làm gốc để lưu lại không lệch đồng nào
    // dòng theo khoản: Thành tiền là số người dùng gõ (không phải SL × ĐG) — không được tự xóa khi sửa ô khác
    ttTuDong: !KT.isKhoan(c) && Number.isInteger(Number(c.donGia)), dgTuDong: !KT.isKhoan(c) && !Number.isInteger(Number(c.donGia)),
    // công trình riêng của dòng: chỉ ghi khi khác công trình đầu phiếu (nhà / khu của dòng đó giữ ngầm để không mất khi lưu lại)
    ct: c.maCT && KT.keyOf(c.maCT) !== KT.keyOf(headCT) ? c.maCT : '', nha: c.maCT && KT.keyOf(c.maCT) !== KT.keyOf(headCT) ? (c.maNha || '') : '',
    // dòng cũ không có vật tư (khoản nhân công, phí...): giữ hạng mục đã lưu để sửa lại phiếu không mất; dòng có vật tư thì theo vật tư
    hmCu: hmCuaVatTu(c.maVT) ? '' : ten || '', goiY: ''
  };
}

// Dựng trạng thái phiếu theo địa chỉ: mới / sửa phiếu / nhân bản phiếu. banSaoLuu: bỏ qua bản đang sửa dở, lấy đúng dữ liệu đã lưu
function stateKey(params) {
  const mode = params.phieu ? 'edit' : params.nhanban || params.nhanbandong ? 'dup' : 'new';
  return mode + ':' + (params.phieu || params.nhanban || params.nhanbandong || '') + (params.nhanbandong ? ':dong' : '');
}
function initialState(params, banSaoLuu) {
  const mode = params.phieu ? 'edit' : params.nhanban || params.nhanbandong ? 'dup' : 'new';
  const key = stateKey(params);
  if (!banSaoLuu && draft && draft.key === key) return draft;
  if (mode === 'new') {
    const last = LS.get('cp.lastHeader', null);
    // công trình gợi ý cho dòng đầu: công trình đang chọn ở thanh trên, không thì công trình của phiếu trước
    const goiY = projectByCode(S.ct || '') ? projectByCode(S.ct).ma : last && last.ct && projectByCode(last.ct) ? projectByCode(last.ct).ma : '';
    // ngày phiếu mới luôn là hôm nay (không lấy ngày của phiếu trước)
    return { key, mode, header: Object.assign({ ngay: KT.todayISO(), maNCC: '', soPhieu: '' }, last ? { maNCC: last.maNCC || '' } : {}, { maCT: '', maNha: '', soPhieu: '' }), lines: [Object.assign(blankLine(), { ct: goiY, nha: chungCua(goiY) })] };
  }
  // nhanbandong = nhân bản MỘT dòng chi phí (từ Sổ chi phí) thành phiếu mới chưa lưu
  const lines = params.nhanbandong ? allCostLedger().filter((c) => String(c.id) === String(params.nhanbandong)) : slipLines(params.phieu || params.nhanban);
  if (!lines.length) return { key, mode: 'missing', header: {}, lines: [] };
  const header = Object.assign(headerFromLine(lines[0]), { maCT: '', maNha: '' }); // công trình, nhà / khu ghi ở từng dòng
  if (mode === 'dup') { header.ngay = KT.todayISO(); header.soPhieu = ''; }
  return { key, mode, phieuId: params.phieu || null, nhap: mode === 'edit' && KT.isDraft(lines[0]), header, lines: lines.map((c) => lineFromCost(c, '')).concat([blankLine()]) };
}

// Phiếu sửa / nhân bản đang có thay đổi chưa lưu (so với dữ liệu đã lưu): vd đã bấm × xóa một dòng
const noiDung = (st) => JSON.stringify({ h: st.header, l: st.lines.filter((l) => !isBlank(l)).map((l) => [l.ct, l.maVT, l.dienGiai, l.soLuong, l.donGia, l.thanhTien, l.hmCu, l.nha]) });
function coThayDoi(params) {
  const key = stateKey(params);
  if (!draft || draft.key !== key || draft.mode === 'new') return false;
  const goc = initialState(params, true);
  return goc.mode !== 'missing' && noiDung(goc) !== noiDung(draft);
}
// Mở lại phiếu theo dữ liệu đã lưu (bỏ bản đang sửa dở); hỏi trước nếu có thay đổi chưa lưu
async function moLaiDaLuu(params, hash) {
  if (coThayDoi(params) && !(await confirmDialog({ title: 'Bỏ thay đổi chưa lưu?', html: 'Phiếu này đang có thay đổi <b class="text-ink">chưa lưu</b> (ví dụ dòng vừa xóa). Bỏ các thay đổi đó và mở lại phiếu như đã lưu?', okText: 'Mở lại bản đã lưu', danger: true }))) return;
  draft = null;
  LS.set('cp.draft', null);
  if (hash && location.hash !== hash) location.hash = hash;
  else renderCostEntry(document.getElementById('view'));
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
  const editingPosted = editing && !st.nhap;
  const lockedSlip = editing && KT.isLockedDate(S.all, h.ngay); // phiếu thuộc tháng đã khóa sổ: chỉ xem // phiếu đã ghi sổ: chỉ Lưu thay đổi; phiếu mới / nháp: Lưu nháp hoặc Ghi sổ

  root.innerHTML =
    '<div id="cp-dl">' + costDatalists(h.maCT) + '</div>' +
    '<section class="sheet" aria-label="Đầu phiếu">' +
    (st.mode !== 'new' ? '<div class="flex flex-wrap items-center gap-3 px-4 pt-3"><b class="text-[13px]">' + (editing ? (st.nhap ? 'Sửa phiếu nháp (chưa ghi sổ)' : 'Sửa phiếu nhập chi phí') : 'Nhân bản phiếu nhập chi phí') + '</b>' +
      '<span class="text-[12.5px] text-ink-3">' + (editing ? 'Lưu lại sẽ thay các dòng cũ của phiếu bằng các dòng bên dưới.' : 'Các dòng được chép từ phiếu gốc; ngày đặt lại là hôm nay.') + '</span><span class="flex-1"></span>' +
      '<a href="#/cp-nhap" class="btn btn-ghost btn-sm" data-act="new">' + icon('plus') + 'Lập phiếu mới</a></div>' : '') +
    (lockedSlip ? '<p class="form-error mx-4 mt-3" role="note">' + icon('lock') + '<span>' + esc(KT.lockMessage(KT.monthOf(h.ngay), 'sửa')) + '</span></p>' : '') +
    (st.mode !== 'new' && coThayDoi(params) ? '<div class="banner mx-4 mt-3 !bg-caution-soft !text-ink" role="note">' + icon('warnTri', 'text-caution') +
      '<span class="flex-1">Phiếu đang có thay đổi <b class="font-bold">chưa lưu</b>. Bấm Lưu để giữ, hoặc mở lại phiếu như đã lưu.</span>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="reload-slip">' + icon('refresh') + 'Mở lại bản đã lưu</button></div>' : '') +
    '<form id="cp-head" class="grid grid-cols-2 gap-x-3 gap-y-2.5 px-3 py-3 md:gap-x-4 md:px-4 lg:grid-cols-3" novalidate autocomplete="off">' +
    '<label class="field"><span class="label">Ngày <b class="req">*</b></span>' + dateField({ name: 'ngay', value: h.ngay, required: true, label: 'Ngày' }) + '<span class="hint"></span></label>' +
    headField('maNCC', 'Nhà cung cấp', h.maNCC, 'dl-suppliers', 'Gõ mã hoặc tên', true) +
    '<label class="field"><span class="label">Số phiếu / chuyến</span><input name="soPhieu" class="input" value="' + esc(h.soPhieu) + '" placeholder="Số phiếu giao hàng, số chuyến..."><span class="hint"></span></label>' +
    '</form></section>' +

    '<section class="sheet overflow-hidden" aria-labelledby="h-dong">' +
    '<div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule px-4 py-2"><h2 id="h-dong" class="sheet-title">Các dòng hàng</h2>' +
    '<span class="min-w-0 flex-1 text-[12px] text-ink-3">Mã VT tự điền tên, ĐVT và giá lần trước · Số lượng nhận <b class="font-medium text-ink-2">2,5</b> hoặc <b class="font-medium text-ink-2">10+5</b> · Đơn giá nhận <b class="font-medium text-ink-2">50tr</b>, <b class="font-medium text-ink-2">300k</b> · ' +
    'Không có đơn giá (nhân công, hóa đơn chỉ ghi tổng): để trống Số lượng, Đơn giá, chỉ nhập <b class="font-medium text-ink-2">Thành tiền</b>.</span>' + densityToggle() + '</div>' +
    '<div class="scroll-x overflow-x-auto"><table class="ledger grid-entry" id="cp-lines">' +
    '<thead><tr><th class="num w-8">#</th><th class="w-[150px] min-w-[136px]" title="Công trình của dòng (bắt buộc)">Công trình <b class="req">*</b></th><th class="w-[110px] min-w-[96px]" title="Để trống = không gán nhà / khu">Nhà / khu</th><th class="w-[120px] min-w-[110px]">Mã vật tư</th><th>Tên vật tư</th><th class="w-[52px]">ĐVT</th><th>Diễn giải / quy cách</th>' +
    '<th class="num w-[84px] min-w-[76px]">Số lượng</th><th class="num w-[112px] min-w-[100px]">Đơn giá</th><th class="num money w-[124px] min-w-[116px]">Thành tiền</th><th class="w-[150px] min-w-[130px]" title="Lấy theo mã vật tư (đổi ở Danh mục > Vật tư)">Nhóm › Hạng mục</th><th class="w-[56px]"><span class="sr-only">Nhân bản, xóa dòng</span></th></tr></thead>' +
    '<tbody id="cp-body"></tbody>' +
    '<tfoot><tr><td colspan="9" class="text-right" id="cp-total-label">Tổng phiếu</td><td class="num money"><span class="dbl" id="cp-total">0</span></td><td colspan="2" class="font-normal text-[12.5px] text-ink-3" id="cp-words"></td></tr></tfoot>' +
    '</table></div>' +
    '<div class="flex flex-wrap items-center gap-2 border-t border-rule px-4 py-2.5">' +
    '<button type="button" class="btn btn-secondary btn-sm" data-act="add-row">' + icon('plus') + 'Thêm dòng</button>' +
    '<button type="button" class="btn btn-secondary btn-sm" data-act="dup-row" title="Nhân bản dòng đang chọn (Ctrl D)">' + icon('copy') + 'Nhân bản dòng <kbd>Ctrl D</kbd></button>' +
    '<button type="button" class="btn btn-secondary btn-sm" data-act="clear">' + icon('eraser') + 'Xóa trắng các dòng</button>' +
    (editing ? (lockedSlip ? '' : '<button type="button" class="btn btn-danger-ghost btn-sm" data-act="del-slip">' + icon('trash') + 'Xóa phiếu</button>') +
      '<a class="btn btn-ghost btn-sm" href="#/cp-nhap?nhanban=' + esc(st.phieuId) + '">' + icon('copy') + 'Nhân bản phiếu</a>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="history">' + icon('history') + 'Lịch sử phiếu</button>' : '') +
    '<span class="flex-1"></span>' +
    '<span class="text-[12.5px] text-ink-2" id="cp-summary" role="status"></span>' +
    (editingPosted || lockedSlip ? '' : '<button type="button" class="btn btn-secondary" data-act="save-draft" title="Lưu để làm tiếp; phiếu Nháp chưa tính vào chi phí, công nợ (Ctrl S)">' + icon('draft') + 'Lưu nháp <kbd>Ctrl S</kbd></button>') +
    (lockedSlip ? '' : '<button type="button" class="btn btn-primary" data-act="save" title="Ctrl + Enter">' + icon('save') + (editingPosted ? 'Lưu thay đổi' : st.nhap ? 'Ghi sổ' : 'Ghi vào sổ chi phí') + '<kbd>Ctrl Enter</kbd></button>') +
    '</div></section>' +
    // phiếu mới: chọn ảnh / tài liệu ngay, tự tải lên khi lưu phiếu; phiếu đã lưu: đính kèm thẳng
    '<section class="sheet px-5 pb-4 no-print" aria-label="Chứng từ của phiếu">' + (editing ? attachBlock('slips', Number(st.phieuId), { readonly: lockedSlip }) : pendingBlock(PENDING)) + '</section>' +
    recentHtml(params.phieu || '');

  const form = $('#cp-head', root);
  const body = $('#cp-body', root);
  bindDensity(root);
  // nhãn cạnh tiêu đề: tình trạng phiếu + kỳ của ngày phiếu (đang mở / đã khóa)
  const refreshTags = () => {
    const mo = KT.monthOf(h.ngay);
    const kho = KT.isISODate(h.ngay) && KT.isLockedDate(S.all, h.ngay);
    setPageTags('<span class="tag tag-neutral">' + (st.mode === 'edit' ? (st.nhap ? 'Phiếu nháp' : 'Sửa phiếu') : st.mode === 'dup' ? 'Nhân bản phiếu' : 'Phiếu mới · chưa lưu') + '</span>' +
      (KT.isISODate(h.ngay) ? '<span class="chip ' + (kho ? 'chip-idle' : 'chip-ok') + '">' + icon(kho ? 'lock' : 'check') + 'Kỳ ' + esc(String(mo).slice(5, 7) + '/' + String(mo).slice(0, 4)) + (kho ? ' đã khóa' : ' đang mở') + '</span>' : ''));
  };
  refreshTags();
  const get = (n) => form.elements[n];

  /* ---------- đầu phiếu ---------- */
  function readHeader() {
    const ngayCu = h.ngay;
    h.ngay = get('ngay').value;
    if (h.ngay !== ngayCu) refreshTags();
    h.maNCC = get('maNCC').value.trim();
    h.soPhieu = get('soPhieu').value.trim();
  }
  function hintOf(name) { return get(name).closest('.field').querySelector('.hint'); }
  // Không ghi lại khi nội dung y hệt: bấm vào liên kết trong gợi ý làm ô nhập mất tiêu điểm → sự kiện change vẽ lại gợi ý
  // ngay giữa lúc nhấn chuột, liên kết bị thay mới và cú bấm không tới được.
  function setHint(name, html, cls) { const el = hintOf(name); if (el.dataset.src !== html) { el.innerHTML = html; el.dataset.src = html; } el.className = 'hint' + (cls ? ' ' + cls : ''); }

  function refreshHeaderHints() {
    // công trình
    // NCC + công nợ
    const s = h.maNCC ? supplierByCode(h.maNCC) : null;
    if (!h.maNCC) setHint('maNCC', '');
    else if (!s) setHint('maNCC', 'Chưa có trong danh mục. <a href="#" data-act="add-ncc">Thêm nhà cung cấp này</a>', 'bad');
    else {
      const d = KT.debtOf(S.db, s.ma, '');
      let txt = esc(s.ten) + (s.loai ? ' · ' + esc(s.loai) : '');
      if (d) txt += '<br>' + (d.conLai > 0 ? 'Còn nợ ' : d.conLai < 0 ? 'Ứng dư ' : 'Đã tất toán') + (d.conLai ? '<b class="font-semibold tabular-nums">' + money(Math.abs(d.conLai)) + ' đ</b>' : '') + '';
      setHint('maNCC', txt, 'good');
    }
  }

  // Datalist vật tư: vật tư của hạng mục đang chọn lên đầu (giống danh sách lọc theo hạng mục của file Excel)
  function refreshVtList() {
    const list = S.db.materials.slice();
    $('#dl-vt', root).innerHTML = list.map((m) => '<option value="' + esc(m.ma) + '">' + esc(m.ten + (m.dvt ? ' · ' + m.dvt : '')) + '</option>').join('');
  }

  form.addEventListener('input', () => { readHeader(); saveDraft(st); });
  form.addEventListener('change', (e) => {
    const n = e.target.name;
    if (n === 'maNCC') get('maNCC').value = resolveCode(S.db.suppliers, get('maNCC').value);
    readHeader();
    saveDraft(st);
    refreshHeaderHints();
    if (n === 'maNCC') st.lines.forEach((l, i) => { updateRow(i); });
  });

  /* ---------- các dòng ---------- */
  function rowHtml(l, i) {
    const cell = (col, val, cls, extra) => '<input class="cell' + (cls ? ' ' + cls : '') + '" data-col="' + col + '" data-row="' + i + '" value="' + esc(val) + '"' + (extra || '') + '>';
    return '<tr data-row="' + i + '">' +
      '<td class="num text-ink-3">' + (i + 1) + '</td>' +
      '<td data-l="Công trình">' + cell('ct', l.ct, 'font-semibold', ' list="dl-projects" placeholder="Mã công trình" aria-label="Công trình dòng ' + (i + 1) + '" autocomplete="off"') + '</td>' +
      '<td data-l="Nhà / khu">' + cell('nha', l.nha || '', '', ' list="dl-nha" placeholder="—" aria-label="Nhà / khu dòng ' + (i + 1) + '" autocomplete="off"') + '</td>' +
      '<td data-l="Mã vật tư">' + cell('maVT', l.maVT, 'font-semibold', ' list="dl-vt" aria-label="Mã vật tư dòng ' + (i + 1) + '" autocomplete="off"') + '</td>' +
      '<td class="vt-name" data-l="Tên vật tư"></td><td class="vt-dvt text-ink-2"></td>' +
      '<td data-l="Diễn giải / quy cách">' + cell('dienGiai', l.dienGiai, '', ' aria-label="Diễn giải dòng ' + (i + 1) + '"') + '</td>' +
      '<td data-l="Số lượng">' + cell('soLuong', l.soLuong, 'text-right tabular-nums', ' inputmode="decimal" aria-label="Số lượng dòng ' + (i + 1) + '"') + '</td>' +
      '<td data-l="Đơn giá">' + cell('donGia', l.donGia, 'text-right tabular-nums' + (l.goiY ? ' suggested' : ''), ' inputmode="decimal" aria-label="Đơn giá dòng ' + (i + 1) + '"') + '</td>' +
      '<td data-l="Thành tiền">' + cell('thanhTien', l.thanhTien || '', 'text-right tabular-nums font-semibold', ' inputmode="decimal" aria-label="Thành tiền dòng ' + (i + 1) + '"') + '</td>' +
      '<td class="vt-hm text-[12.5px] leading-snug text-ink-2" data-l="Nhóm chi phí / hạng mục"></td>' +
      '<td class="actions"><button type="button" class="icon-btn" data-act="dup-row" tabindex="-1" title="Nhân bản dòng (Ctrl D)" aria-label="Nhân bản dòng ' + (i + 1) + '">' + icon('copy') + '</button>' +
      '<button type="button" class="icon-btn danger" data-act="del-row" tabindex="-1" title="Xóa dòng" aria-label="Xóa dòng ' + (i + 1) + '">' + icon('x') + '</button></td></tr>' +
      '<tr class="row-msg" data-msg="' + i + '" hidden><td></td><td colspan="11"></td></tr>';
  }

  function drawRows() {
    ensureTrailingBlank();
    st.lines.forEach((l) => { if (!has(l.thanhTien)) KT.syncCostInputs(l, 'donGia'); }); // bản nháp cũ chưa có ô Thành tiền
    body.innerHTML = st.lines.map(rowHtml).join('');
    st.lines.forEach((l, i) => updateRow(i));
    updateTotals();
  }

  function ensureTrailingBlank() {
    if (!st.lines.length || !isBlank(st.lines[st.lines.length - 1])) st.lines.push(blankLine());
  }

  function lineHM(l) {
    const it = hmCuaVatTu(l.maVT) || (l.hmCu ? KT.findCostItem(S.db, l.hmCu) : null);
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
    const tt = KT.parseAmount(l.thanhTien);
    tr.querySelector('[data-col=soLuong]').classList.toggle('bad', has(l.soLuong) && (isNaN(sl) || sl <= 0));
    tr.querySelector('[data-col=donGia]').classList.toggle('bad', has(l.donGia) && (isNaN(dg) || dg < 0));
    const ttInp = tr.querySelector('[data-col=thanhTien]');
    ttInp.classList.toggle('bad', has(l.thanhTien) && (isNaN(tt) || tt <= 0));
    ttInp.title = l.ttTuDong ? 'Số lượng × Đơn giá' : has(l.thanhTien) && !has(l.soLuong) && !has(l.donGia) ? 'Nhập theo khoản (không có số lượng, đơn giá)' : '';
    // công trình riêng của dòng
    const ctInp = tr.querySelector('[data-col=ct]');
    const ctRieng = has(l.ct) ? projectByCode(resolveCode(S.db.projects, l.ct)) : null;
    ctInp.classList.toggle('bad', has(l.ct) && !ctRieng);
    ctInp.title = ctRieng ? ctRieng.ten : has(l.ct) ? 'Chưa có trong danh mục công trình' : 'Chọn công trình của dòng';
    const nhaInp = tr.querySelector('[data-col=nha]');
    const nhaX = has(l.nha) ? houseByCode(resolveCode(S.db.houses, l.nha)) : null;
    nhaInp.classList.toggle('bad', has(l.nha) && (!nhaX || (ctRieng && nhaX.maCT && KT.keyOf(nhaX.maCT) !== KT.keyOf(ctRieng.ma))));
    nhaInp.title = nhaX ? nhaX.ten + (nhaX.maCT ? ' · ' + nhaX.maCT : '') : has(l.nha) ? 'Chưa có trong danh mục nhà / khu' : '';
    // hạng mục riêng
    // nhóm chi phí › hạng mục: chỉ hiển thị, lấy theo vật tư (đổi ở Danh mục > Vật tư)
    const hmIt = hmCuaVatTu(l.maVT) || (l.hmCu ? KT.findCostItem(S.db, l.hmCu) : null);
    const hmTd = tr.querySelector('.vt-hm');
    const hmHtml = hmIt ? '<span class="text-ink-3">' + esc(groupName(hmIt.maNhom) || '(chưa có nhóm)') + '</span> › <b class="font-medium text-ink">' + esc(hmIt.ten) + '</b>'
      : m && !m.maHM ? '<span class="text-alert">Vật tư chưa gắn hạng mục</span>' : '';
    if (hmTd.dataset.src !== hmHtml) { hmTd.innerHTML = hmHtml; hmTd.dataset.src = hmHtml; }
    hmTd.title = hmIt ? 'Theo vật tư' + (m ? ' ' + m.ma : '') + ': nhóm ' + (groupName(hmIt.maNhom) || '(chưa có nhóm)') + ' › hạng mục ' + hmIt.ten + '. Đổi ở Danh mục > Vật tư' : '';
    // gợi ý đơn giá
    const dgInp = tr.querySelector('[data-col=donGia]');
    dgInp.classList.toggle('suggested', !!l.goiY);
    dgInp.placeholder = l.dgTuDong && has(l.soLuong) && has(l.thanhTien) ? 'tự tính' : '';
    // cảnh báo (không chặn) khi đơn giá lệch nhiều so với lần mua gần nhất: hay gặp khi gõ thừa/thiếu số 0
    const info = !l.goiY && m && !isNaN(dg) && dg > 0 ? priceWarn(m.ma, dg) : null;
    const warn = info && l.giuGia !== l.donGia ? info : null;
    dgInp.classList.toggle('warn', !!warn);
    dgInp.title = l.goiY || (info ? info.text : '');
    let pw = dgInp.parentNode.querySelector('.price-warn');
    const lp = m ? KT.lastPrice(S.db, m.ma, resolveCode(S.db.suppliers, h.maNCC)) : null;
    const hint = lp && lp.donGia > 0 && !KT.isKhoan({ soLuong: sl, donGia: dg }) ? 'lần trước ' + money(lp.donGia) : '';
    if (hint && !pw) { pw = document.createElement('span'); pw.className = 'price-warn'; dgInp.parentNode.appendChild(pw); }
    if (pw) { if (hint) { pw.textContent = hint; pw.classList.toggle('is-warn', !!warn); } else pw.remove(); }
    // dòng báo ngay dưới dòng hàng: Lỗi (đỏ) hoặc Cảnh báo (vàng, kèm nút Dùng / Giữ) — luôn có biểu tượng + chữ
    const err = !!code && !m;
    tr.classList.toggle('has-err', err);
    tr.classList.toggle('has-warn', !err && !!warn);
    const msg = body.querySelector('tr[data-msg="' + i + '"]');
    if (msg) {
      msg.className = 'row-msg ' + (err ? 'is-err' : 'is-warn');
      let html = '';
      if (err) html = icon('x') + '<b>Lỗi – thiếu mã vật tư.</b> Gõ mã hoặc tên rồi chọn trong danh sách, hoặc <a href="#" class="font-bold text-pen underline underline-offset-2" data-act="add-vt" data-row="' + i + '">thêm vật tư mới “' + esc(code) + '”</a>. Chưa sửa thì chưa ghi sổ được.';
      else if (warn) html = icon('warnTri') + '<b>Cảnh báo – đơn giá ' + (warn.pct > 0 ? 'cao hơn ' : 'thấp hơn ') + Math.abs(warn.pct).toLocaleString('vi-VN') + '%</b> so với giá lần mua gần nhất ' + money(warn.lp.donGia) + ' (' + fdate(warn.lp.ngay) + ', ' + esc(warn.lp.cungNCC ? 'cùng nhà cung cấp' : 'NCC ' + warn.lp.maNCC) + '). Kiểm tra lại; nếu đúng thì giữ nguyên. ' +
        '<button type="button" class="btn btn-secondary btn-sm" data-act="use-price" data-row="' + i + '">Dùng ' + money(warn.lp.donGia) + '</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="keep-price" data-row="' + i + '">Giữ ' + money(dg) + '</button>';
      const key = html;
      if (msg.dataset.src !== key) { msg.children[1].innerHTML = html; msg.dataset.src = key; }
      msg.hidden = !html;
    }
  }

  // Trả { pct, lp, text } nếu đơn giá lệch ≥ 50% so với lần mua gần nhất, không thì null
  function priceWarn(maVT, dg) {
    const lp = KT.lastPrice(S.db, maVT, resolveCode(S.db.suppliers, h.maNCC));
    if (!lp || !(lp.donGia > 0)) return null;
    const r = dg / lp.donGia;
    if (r < 1.5 && r > 1 / 1.5) return null;
    const pct = Math.round((r - 1) * 100);
    return { pct, lp, text: (pct > 0 ? 'Cao hơn ' : 'Thấp hơn ') + Math.abs(pct).toLocaleString('vi-VN') + '% giá lần trước · Lần mua ' + fdate(lp.ngay) + ': ' + money(lp.donGia) + ' đ. Kiểm tra lại nếu gõ nhầm.' };
  }

  function updateTotals() {
    let total = 0;
    let n = 0;
    let loi = 0;
    let canhBao = 0;
    st.lines.forEach((l) => {
      if (isBlank(l)) return;
      n++;
      const r = lineAmounts(l);
      if (!r.loi) total += r.thanhTien; else loi++;
      const code = l.maVT.trim();
      const m = code ? materialByCode(code) : null;
      if (code && !m) loi++;
      else if (m && !l.goiY) {
        const dg = KT.parseAmount(l.donGia);
        if (!isNaN(dg) && dg > 0 && priceWarn(m.ma, dg) && l.giuGia !== l.donGia) canhBao++;
      }
    });
    $('#cp-total', root).textContent = money(total);
    $('#cp-total-label', root).textContent = 'Tổng phiếu · ' + n + ' dòng';
    $('#cp-words', root).textContent = total ? KT.docTienBangChu(total) : '';
    const sum = $('#cp-summary', root);
    sum.innerHTML = n ? (loi ? '<b class="font-bold text-alert">' + loi + ' lỗi phải sửa</b>' : '') + (loi && canhBao ? ' · ' : '') + (canhBao ? '<b class="font-bold text-caution">' + canhBao + ' cảnh báo</b>' : '') +
      (loi ? '. Sửa lỗi để ghi sổ.' : canhBao ? '. Cảnh báo không chặn ghi sổ.' : '<span class="text-ink-3">Không có lỗi</span>') : '';
    const save = $('[data-act=save]', root);
    if (save) { save.disabled = loi > 0; save.title = loi ? 'Còn ' + loi + ' lỗi phải sửa trước khi ghi sổ' : 'Ctrl + Enter'; }
  }

  // Gợi ý đơn giá lần mua gần nhất (ưu tiên cùng nhà cung cấp)
  function suggestPrice(i) {
    const l = st.lines[i];
    if (has(l.donGia) && !l.goiY) return;
    if (has(l.thanhTien) && !l.ttTuDong && !has(l.soLuong)) return; // dòng theo khoản: không gợi ý đơn giá
    const m = materialByCode(l.maVT);
    const lp = m ? KT.lastPrice(S.db, m.ma, resolveCode(S.db.suppliers, h.maNCC)) : null;
    if (!lp) { if (l.goiY) { l.donGia = ''; l.goiY = ''; syncAmounts(i, 'donGia'); } return; }
    l.donGia = money(lp.donGia);
    l.goiY = 'Giá lần mua gần nhất ' + fdate(lp.ngay) + (lp.cungNCC ? ' của nhà cung cấp này' : ' (nhà cung cấp ' + lp.maNCC + ')') + '. Gõ đè để đổi.';
    const inp = body.querySelector('[data-row="' + i + '"][data-col=donGia]');
    if (inp) inp.value = l.donGia;
    syncAmounts(i, 'donGia');
  }

  // Tự điền ô còn lại (Thành tiền = SL × ĐG, hoặc ĐG = Thành tiền / SL) và cập nhật ô trên bảng
  function syncAmounts(i, changed) {
    const l = st.lines[i];
    // gõ Thành tiền khi chưa có số lượng: bỏ đơn giá gợi ý để dòng thành khoản khoán
    if (changed === 'thanhTien' && l.goiY && !has(l.soLuong)) { l.donGia = ''; l.goiY = ''; }
    KT.syncCostInputs(l, changed);
    ['donGia', 'thanhTien'].forEach((col) => {
      const el = body.querySelector('[data-row="' + i + '"][data-col=' + col + ']');
      if (el && el !== document.activeElement && el.value !== (l[col] || '')) el.value = l[col] || '';
    });
  }

  body.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.dataset.col) return;
    const i = Number(t.dataset.row);
    const l = st.lines[i];
    l[t.dataset.col] = t.value;
    if (t.dataset.col === 'donGia') l.goiY = '';
    if (['soLuong', 'donGia', 'thanhTien'].includes(t.dataset.col)) syncAmounts(i, t.dataset.col);
    const wasLast = i === st.lines.length - 1;
    updateRow(i);
    updateTotals();
    if (wasLast && !isBlank(l)) {
      st.lines.push(dongMoiTheo(l));
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
    } else if (col === 'donGia' || col === 'thanhTien') {
      const n = KT.parseAmount(t.value);
      if (!isNaN(n) && t.value.trim()) { t.value = money(n); l[col] = t.value; }
    } else if (col === 'ct') {
      // gõ tên công trình thì đổi sang mã; đổi công trình thì nhà / khu theo công trình mới (nhà dùng chung nếu có)
      const p = projectByCode(resolveCode(S.db.projects, t.value));
      const moi = p ? p.ma : t.value.trim();
      const nhaCu = has(l.nha) ? houseByCode(l.nha) : null;
      if (p && (!nhaCu || (nhaCu.maCT && KT.keyOf(nhaCu.maCT) !== KT.keyOf(moi)))) { // (ô Công trình đã ghi l.ct lúc gõ nên không so với giá trị cũ)
        l.nha = chungCua(moi);
        const ni = tr0(i, 'nha'); if (ni) ni.value = l.nha;
      }
      t.value = moi;
      l.ct = moi;
    } else if (col === 'nha') {
      const x = houseByCode(resolveCode(S.db.houses, t.value));
      if (x) t.value = x.ma;
      l.nha = t.value.trim();
    }
    updateRow(i);
    updateTotals();
    saveDraft(st);
  });

  // phiếu nhiều công trình: đầu phiếu để trống công trình hoặc đã có dòng ghi công trình riêng → Enter xuống dòng sau dừng ở ô Công trình
  const tr0 = (row, col) => body.querySelector('[data-row="' + row + '"][data-col="' + col + '"]');
  // dòng sau đã có công trình (chép từ dòng trên) thì Enter xuống thẳng ô Mã vật tư, chưa có thì dừng ở ô Công trình
  const oDauDong = (row) => (st.lines[row] && has(st.lines[row].ct) ? 'maVT' : 'ct');
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
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); t.dispatchEvent(new Event('change', { bubbles: true })); dupRow(row); return; }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      t.dispatchEvent(new Event('change', { bubbles: true }));
      const k = ENTER_COLS.indexOf(col);
      // đã đủ SL và ĐG thì Thành tiền tự tính: Enter ở Đơn giá sang dòng sau
      const tuTinh = col === 'donGia' && has(st.lines[row].soLuong) && has(st.lines[row].donGia);
      if (k >= 0 && k < ENTER_COLS.length - 1 && !tuTinh) focusCell(row, ENTER_COLS[k + 1]);
      else {
        if (row === st.lines.length - 1) { st.lines.push(dongMoiTheo(st.lines[row])); drawRows(); }
        focusCell(row + 1, oDauDong(row + 1));
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

  let focusRow = 0;
  body.addEventListener('focusin', (e) => { if (e.target.dataset && e.target.dataset.row != null) focusRow = Number(e.target.dataset.row); });
  const lastFocusRow = () => Math.min(focusRow, st.lines.length - 1);
  // Nhân bản dòng: chép nguyên dòng xuống ngay dưới (không chép cờ cảnh báo đã bỏ qua)
  function dupRow(i) {
    const l = st.lines[i];
    if (!l || isBlank(l)) return;
    st.lines.splice(i + 1, 0, Object.assign({}, l, { giuGia: '' }));
    drawRows();
    saveDraft(st);
    focusCell(i + 1, 'soLuong');
  }

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
  async function save(asDraft) {
    if (saving) return;
    readHeader();
    if (lockedSlip) return fail(KT.lockMessage(KT.monthOf(h.ngay), 'sửa'), null, 'ngay');
    if (!KT.isISODate(h.ngay)) return fail('Nhập ngày của phiếu, ví dụ 29/9', null, 'ngay');
    if (KT.isLockedDate(S.all, h.ngay)) return fail(KT.lockMessage(KT.monthOf(h.ngay), 'ghi'), null, 'ngay');
    const ncc = supplierByCode(resolveCode(S.db.suppliers, h.maNCC));
    if (!ncc) return fail(h.maNCC ? 'Nhà cung cấp "' + h.maNCC + '" chưa có trong danh mục' : 'Chọn nhà cung cấp', null, 'maNCC');
    const lines = [];
    for (let i = 0; i < st.lines.length; i++) {
      const l = st.lines[i];
      if (isBlank(l)) continue;
      const where = 'Dòng ' + (i + 1) + ': ';
      const m = l.maVT.trim() ? materialByCode(l.maVT) : null;
      if (l.maVT.trim() && !m) return fail(where + 'mã vật tư "' + l.maVT + '" chưa có trong danh mục', i, 'maVT');
      if (!m && !l.dienGiai.trim()) return fail(where + 'cần Mã VT hoặc Diễn giải (khoản nhân công, phí...)', i, 'maVT');
      const so = lineAmounts(l);
      if (so.loi) return fail(where + so.loi, i, so.cot);
      // công trình (bắt buộc) và nhà / khu của dòng
      const lct = has(l.ct) ? projectByCode(resolveCode(S.db.projects, l.ct)) : null;
      if (!has(l.ct)) return fail(where + 'chọn Công trình cho dòng này', i, 'ct');
      if (!lct) return fail(where + 'công trình "' + l.ct + '" chưa có trong danh mục', i, 'ct');
      const lnha = has(l.nha) ? houseByCode(resolveCode(S.db.houses, l.nha)) : null;
      if (has(l.nha) && !lnha) return fail(where + 'nhà / khu "' + l.nha + '" chưa có trong danh mục', i, 'nha');
      if (lnha && lnha.maCT && KT.keyOf(lnha.maCT) !== KT.keyOf(lct.ma)) return fail(where + 'nhà ' + lnha.ma + ' thuộc công trình ' + lnha.maCT + ', không thuộc ' + lct.ma, i, 'nha');
      // hạng mục (và nhóm chi phí) theo vật tư; dòng cũ không có vật tư giữ hạng mục đã lưu
      const hmVT = hmCuaVatTu(l.maVT);
      const hmCu = !hmVT && has(l.hmCu) ? KT.findCostItem(S.db, l.hmCu) : null;
      const hm = hmVT ? hmVT.ma : hmCu ? hmCu.ma : '';
      if (!hm) {
        if (m) return fail(where + 'vật tư "' + m.ma + '" chưa gắn hạng mục. Vào Danh mục > Vật tư để gắn hạng mục (kéo theo nhóm chi phí)', i, 'maVT');
        return fail(where + 'cần Mã vật tư (đã gắn hạng mục và nhóm chi phí). Nhân công, phí… cũng tạo thành vật tư ở Danh mục > Vật tư', i, 'maVT');
      }
      lines.push(Object.assign({ _row: i + 1, maVT: m ? m.ma : '', dienGiai: l.dienGiai.trim(), maHM: hm, maCT: lct.ma, maNha: lnha ? lnha.ma : '' }, so.nhap));
    }
    if (!lines.length) return fail('Phiếu chưa có dòng hàng nào', 0, 'maVT');
    const payload = { header: { ngay: h.ngay, maCT: '', maNha: '', maNCC: ncc.ma, soPhieu: h.soPhieu, trangThai: asDraft ? 'nhap' : '' }, lines };
    saving = true;
    const done = busy(root.querySelector(asDraft ? '[data-act=save-draft]' : '[data-act=save]'), editing || asDraft ? 'Đang lưu…' : 'Đang ghi…');
    try {
      const r = editing ? await api('PUT', '/api/cost-slips/' + st.phieuId, payload) : await api('POST', '/api/cost-slips', payload);
      // chứng từ đã chọn khi lập phiếu mới: tải lên gắn vào phiếu vừa lưu
      const cho = editing ? [] : pendingFiles(PENDING);
      if (cho.length && r.phieuId) {
        const n = await uploadFiles('slips', r.phieuId, cho);
        clearPending(PENDING);
        if (n) toast('Đã đính kèm ' + n + ' / ' + cho.length + ' file vào phiếu');
      }
      toast(asDraft ? 'Đã lưu nháp ' + r.count + ' dòng, tổng ' + money(r.total) + ' đ (chưa ghi sổ, chưa tính vào chi phí)'
        : (editing && !st.nhap ? 'Đã lưu phiếu: ' : 'Đã ghi ') + r.count + ' dòng, tổng ' + money(r.total) + ' đ vào sổ chi phí');
      LS.set('cp.lastHeader', { ngay: h.ngay, maNCC: ncc.ma, ct: (lines[lines.length - 1] || {}).maCT || '' });
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
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      if (e.target.dispatchEvent) e.target.dispatchEvent(new Event('change', { bubbles: true }));
      if (!editingPosted && !lockedSlip) save(true);
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (e.target.dispatchEvent) e.target.dispatchEvent(new Event('change', { bubbles: true }));
      save();
    }
  });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && e.target.name) {
      e.preventDefault();
      const order = ['maNCC', 'soPhieu'];
      const k = order.indexOf(e.target.name);
      if (k >= 0 && k < order.length - 1) focusInput(get(order[k + 1]));
      else if (k === order.length - 1) { e.target.dispatchEvent(new Event('change', { bubbles: true })); focusCell(0, oDauDong(0)); }
    }
  });

  root.addEventListener('click', async (e) => {
    // bấm Sửa / Nhân bản phiếu (danh sách phiếu đã nhập, nút trong phiếu): luôn mở phiếu như đã lưu — kể cả khi bấm lại đúng phiếu đang mở
    const link = e.target.closest('a[href^="#/cp-nhap?phieu="], a[href^="#/cp-nhap?nhanban="]');
    if (link) {
      e.preventDefault();
      const hash = link.getAttribute('href');
      if (/^#\/cp-nhap\?nhanban=/.test(hash)) { // nhân bản phiếu: hỏi trước, chưa lưu gì
        const ls = slipLines(routeParams(hash).nhanban);
        if (!ls.length) { toast('Không còn thấy phiếu này (có thể đã xóa)', 'info'); return; }
        const tong = ls.reduce((t, c) => t + (Number(c.thanhTien) || 0), 0);
        if (!(await confirmCopy('phiếu nhập chi phí', '<b>' + fdate(ls[0].ngay) + '</b> · ' + esc(ls[0].maCT || '') + (ls[0].maNCC ? ' · ' + esc(ls[0].tenNCC || ls[0].maNCC) : '') + (ls[0].soPhieu ? ' · ' + esc(ls[0].soPhieu) : '') +
          '<br>' + ls.length + ' dòng, tổng <b>' + money(tong) + ' đ</b>'))) return;
      }
      moLaiDaLuu(routeParams(hash), hash);
      return;
    }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'reload-slip') { moLaiDaLuu(params); return; }
    if (a.tagName === 'A' && act !== 'new') e.preventDefault();
    // sau khi thêm nhanh vào danh mục: điền mã mới vào ô rồi vẽ lại (dữ liệu vừa tải lại)
    const after = (row, col, apply) => (x) => {
      apply(x);
      saveDraft(st);
      pendingFocus = { row, col };
      renderCostEntry(document.getElementById('view'));
    };
    if (act === 'save') save();
    else if (act === 'save-draft') save(true);
    else if (act === 'history') openHistory(st.phieuId);
    else if (act === 'add-row') { st.lines.push(blankLine()); drawRows(); focusCell(st.lines.length - 1, 'maVT'); }
    else if (act === 'del-row') removeRow(Number(a.closest('tr').dataset.row));
    else if (act === 'dup-row') dupRow(a.dataset.row != null ? Number(a.dataset.row) : lastFocusRow());
    else if (act === 'use-price' || act === 'keep-price') {
      const i = Number(a.dataset.row);
      const l = st.lines[i];
      if (act === 'use-price') {
        const m = materialByCode(l.maVT);
        const lp = m ? KT.lastPrice(S.db, m.ma, resolveCode(S.db.suppliers, h.maNCC)) : null;
        if (lp) { l.donGia = money(lp.donGia); l.goiY = ''; syncAmounts(i, 'donGia'); const el = body.querySelector('[data-row="' + i + '"][data-col=donGia]'); if (el) el.value = l.donGia; }
      } else l.giuGia = l.donGia;
      updateRow(i); updateTotals(); saveDraft(st);
    }
    else if (act === 'clear') {
      if (st.lines.some((l) => !isBlank(l)) && !(await confirmDialog({ title: 'Xóa trắng các dòng', message: 'Xóa hết các dòng hàng đang nhập (chưa lưu)?', okText: 'Xóa trắng', danger: true }))) return;
      st.lines = [dongMoiTheo(st.lines[0])];
      saveDraft(st);
      drawRows();
      focusCell(0, oDauDong(0));
    } else if (act === 'add-ncc') {
      openSupplierForm({ ma: h.maNCC }, after(null, 'soPhieu', (x) => { h.maNCC = x.ma; }));
    } else if (act === 'add-vt') {
      const i = Number(a.dataset.row);
      openMaterialForm({ ma: st.lines[i].maVT, maHM: lineHM(st.lines[i]) }, after(i, 'soLuong', (x) => { st.lines[i].maVT = x.ma; }));
    } else if (act === 'del-slip') {
      const n = slipLines(st.phieuId).length;
      if (!(await confirmDialog({ trash: true, title: 'Xóa phiếu nhập', html: 'Xóa phiếu này cùng <b class="text-ink">' + n + '</b> dòng trong sổ chi phí?', hauQua: slipHauQua(st.phieuId), okText: 'Xóa phiếu', danger: true }))) return;
      try { await api('DELETE', '/api/cost-slips/' + st.phieuId); draft = null; LS.set('cp.draft', null); toast('Đã xóa phiếu, chuyển vào Thùng rác'); location.hash = '#/cp-nhap'; } catch (err) { showError(err); }
    }
  });
  bindRecent(root);
  bindAttach(root);
  bindPending(root);

  refreshHeaderHints();
  refreshVtList();
  drawRows();
  saveDraft(st);
  const pf = pendingFocus;
  pendingFocus = null;
  setTimeout(() => {
    if (pf && pf.row != null) focusCell(pf.row, pf.col);
    else if (pf) focusInput(get(pf.col));
    else if (st.mode === 'new' && isBlank(st.lines[0]) && !has(h.maNCC)) focusInput(get('ngay'));
    else { const r0 = Math.max(0, st.lines.findIndex(isBlank)); focusCell(r0, oDauDong(r0)); }
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
  const all = KT.costSlips(S.all, allCostLedger());
  const list = all.filter((s) => !q || KT.normalizeText([s.dsCT ? s.dsCT.join(' ') : s.maCT, s.tenCT, s.maNha, s.maNCC, s.tenNCC, s.soPhieu, s.hangMuc.join(' '), KT.fmtMoney(s.total)].join(' ')).includes(q)).slice(0, 60);
  const active = tb.dataset.active;
  tb.innerHTML = list.length ? list.map((s) =>
    '<tr data-phieu="' + esc(s.phieuId || '') + '"' + (String(s.phieuId) === active ? ' class="is-active"' : '') + '>' +
    '<td class="whitespace-nowrap">' + fdate(s.ngay) + '</td>' +
    '<td>' + (KT.isDraft(s.lines[0]) ? '<span class="chip chip-draft mr-1" title="Phiếu nháp: chưa ghi sổ">' + icon('draft') + 'Nháp</span>' : '') + '<span class="code">' + highlight(s.maCT, recentQ) + '</span>' + (s.dsCT && s.dsCT.length > 1 ? ' <span class="chip chip-owe" title="' + esc(s.dsCT.join(', ')) + '">+' + (s.dsCT.length - 1) + ' công trình</span>' : '') + (s.maNha && s.maNha !== s.maCT ? ' <span class="text-ink-3">/ ' + highlight(s.maNha, recentQ) + '</span>' : '') + '</td>' +
    '<td>' + highlight(s.tenNCC || s.maNCC, recentQ) + '</td><td>' + highlight(s.soPhieu, recentQ) + '</td>' +
    '<td class="max-w-[260px] truncate text-ink-2" title="' + esc(s.hangMuc.join(', ')) + '">' + highlight(s.hangMuc.join(', '), recentQ) + '</td>' +
    '<td class="num">' + s.lines.length + '</td><td class="num money font-semibold">' + money(s.total) + '</td>' +
    '<td class="actions">' + (s.phieuId ?
      '<a class="icon-btn" href="#/cp-nhap?phieu=' + s.phieuId + '" title="Sửa phiếu" aria-label="Sửa phiếu">' + icon('edit') + '</a>' +
      '<a class="icon-btn" href="#/cp-nhap?nhanban=' + s.phieuId + '" title="Nhân bản phiếu" aria-label="Nhân bản phiếu">' + icon('copy') + '</a>' +
      '<button type="button" class="icon-btn" data-rc="print" title="In phiếu" aria-label="In phiếu">' + icon('print') + '</button>' +
      '<button type="button" class="icon-btn danger" data-rc="del" title="Xóa phiếu" aria-label="Xóa phiếu">' + icon('trash') + '</button>' : '') + '</td></tr>').join('')
    : '<tr><td colspan="8" class="empty">' + (all.length ? 'Không có phiếu nào khớp.' : 'Chưa có phiếu nào. Nhập phiếu đầu tiên ở trên, hoặc nhập từ file Excel trong Cài đặt.') + '</td></tr>';
}

function bindRecent(root) {
  const q = $('#rc-q', root);
  if (!q) return;
  q.addEventListener('input', debounce(() => { recentQ = q.value; drawRecent(root); }, 120));
  $('#rc-body', root).addEventListener('click', async (e) => {
    const pr = e.target.closest('[data-rc=print]');
    if (pr) {
      const id = pr.closest('tr').dataset.phieu;
      const sl = KT.costSlips(S.all, allCostLedger()).find((x) => String(x.phieuId) === String(id));
      if (sl) printSlip(sl, sl.lines, S.db.settings);
      return;
    }
    const b = e.target.closest('[data-rc=del]');
    if (!b) return;
    const id = b.closest('tr').dataset.phieu;
    const n = slipLines(id).length;
    if (!(await confirmDialog({ trash: true, title: 'Xóa phiếu nhập', html: 'Xóa phiếu này cùng <b class="text-ink">' + n + '</b> dòng trong sổ chi phí?', hauQua: slipHauQua(id), okText: 'Xóa phiếu', danger: true }))) return;
    try { await api('DELETE', '/api/cost-slips/' + id); toast('Đã xóa phiếu, chuyển vào Thùng rác'); } catch (err) { showError(err); }
  });
  drawRecent(root);
}

export { $$ };
