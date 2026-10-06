/* Biểu mẫu: ghi thu/chi, công trình, nhà cung cấp. */
import { hauQuaCongNo } from './congno.js';
import { $, esc, api, openModal, toast, setPageTitle, showError, bindMoneyInput, money, confirmDialog, icon, dateField, focusInput, fieldError, busy, freshRoot } from './ui.js';
import { S, datalists, resolveCode, projectByCode, supplierByCode } from './state.js';
import { openHistory } from './views/control.js';
import { attachBlock, bindAttach, pendingBlock, bindPending, pendingFiles, clearPending, uploadFiles } from './attach.js';
import { tenNguoi } from './auth.js';

const KT = window.KT;

/* ============================== GHI THU / CHI ============================== */

// "Người tạo / Người sửa" của một bản ghi (dữ liệu trước khi có chức năng này: "Dữ liệu cũ")
export function nguoiThaoTacHtml(r) {
  return '<p class="col-span-2 text-[12.5px] text-ink-3 max-sm:col-span-1" data-nguoi>' + icon('user', 'mr-1 align-[-3px] text-[15px]') +
    'Người tạo: <b class="font-medium text-ink-2">' + esc(tenNguoi(r.nguoiTao)) + '</b>' +
    (r.nguoiSua ? ' · Người sửa gần nhất: <b class="font-medium text-ink-2">' + esc(tenNguoi(r.nguoiSua)) + '</b>' : '') + '</p>';
}

let soForm = 0;
let lastUsed = { ngay: '', soPhieu: '', maDuAn: '', maNCC: '', loai: 'chi' };

/* Phiếu nhiều dòng: phần chung (ngày, số phiếu, đối tượng, người nhận, ghi chú) + bảng các dòng, mỗi dòng có nội dung, công trình, mã vật tư, số tiền riêng.
   Mỗi dòng là một dòng sổ thu chi (cùng số phiếu) nên công nợ NCC tách đúng theo công trình. Dòng đầu tiên giữ thuộc tính name (noiDung, maDuAn, maVT, chi, thu)
   và id gợi ý (da-hint, vt-hint, chi-hint, thu-hint) như biểu mẫu một dòng trước đây; mọi dòng đều có data-c. */
const COT_DONG = ['noiDung', 'maDuAn', 'maVT', 'chi', 'thu'];
const GOI_Y_DONG = { maDuAn: ['da-hint', 'da'], maVT: ['vt-hint', 'vt'], chi: ['chi-hint', 'chi'], thu: ['thu-hint', 'thu'] };

// Lưới giống Phiếu nhập chi phí (ledger grid-entry, ô .cell): # · Nội dung · Công trình · Tên công trình (+ NCC còn nợ) · Mã vật tư · Số tiền chi · Số tiền thu
function dongHtml(r) {
  return '<tr data-row data-id="' + (r.id || '') + '">' +
    '<td class="num text-ink-3" data-stt></td>' +
    '<td><textarea data-c="noiDung" class="cell resize-none overflow-hidden py-[7px] leading-[16px]" rows="1" placeholder="Diễn giải" aria-label="Nội dung dòng">' + esc(r.noiDung || '') + '</textarea></td>' +
    '<td><input data-c="maDuAn" class="cell font-semibold" list="dl-projects" value="' + esc(r.maDuAn || '') + '" placeholder="Mã công trình" aria-label="Công trình của dòng"></td>' +
    '<td class="text-[13px] leading-snug"><span class="hint" data-h="da"></span></td>' +
    '<td data-show="chi"><input data-c="maVT" class="cell font-semibold" list="dl-vt-so" value="' + esc(r.maVT || '') + '" placeholder="Mã vật tư" aria-label="Mã vật tư của dòng"><span class="hint" data-h="vt"></span></td>' +
    '<td data-show="chi"><input data-c="chi" inputmode="decimal" class="cell text-right font-semibold tabular-nums" value="' + (r.chi ? money(r.chi) : '') + '" placeholder="Số tiền chi" aria-label="Số tiền chi của dòng"><span class="hint" data-h="chi"></span></td>' +
    '<td data-show="thu"><input data-c="thu" inputmode="decimal" class="cell text-right font-semibold tabular-nums" value="' + (r.thu ? money(r.thu) : '') + '" placeholder="Số tiền thu" aria-label="Số tiền thu của dòng"><span class="hint" data-h="thu"></span></td>' +
    '<td class="actions"><button type="button" class="icon-btn danger" data-act="bo-dong" tabindex="-1" aria-label="Bỏ dòng này khỏi phiếu" title="Bỏ dòng này khỏi phiếu">' + icon('x') + '</button></td></tr>';
}

/* Ghi thu / chi là MỘT TRANG (#/ghi-thu-chi), không còn là hộp thoại. openEntryForm() giữ nguyên cách gọi cũ: ghi nhớ dòng cần mở
   rồi chuyển sang trang; Hủy / Ghi sổ quay về màn hình trước đó. k = số lần mở, để mở lại (F3, Sửa cả phiếu) luôn vẽ trang mới. */
let entryBack = '#/so-thu-chi';
let entryPending = null;
let entrySeq = 0;
export function openEntryForm(entry, opts) {
  const cur = location.hash || '';
  if (!/^#\/ghi-thu-chi/.test(cur)) entryBack = cur || '#/so-thu-chi';
  entryPending = { entry: entry || null, opts: opts || {}, k: ++entrySeq };
  location.hash = '#/ghi-thu-chi?k=' + entrySeq;
}
// Vẽ trang; dữ liệu tải lại (sau khi thêm nhanh dự án / NCC...) thì giữ nguyên những gì đang nhập
export function renderEntryPage(root) {
  const k = Number((/[?&]k=(\d+)/.exec(location.hash) || [])[1] || 0);
  const cur = root.querySelector('#entry-page');
  if (cur && cur.dataset.k === String(k)) { setPageTitle(cur.dataset.title); return; }
  const p = entryPending && entryPending.k === k ? entryPending : { entry: null, opts: {} };
  entryPending = null;
  // khung #view mới: bỏ các trình xử lý bấm / phím của màn trước còn gắn trên khung cũ (vd Phiếu nhập chi phí:
  // Ctrl+Enter, nút Ghi sổ ở trang này từng chạy luôn lệnh lưu phiếu nhập chi phí → báo "Phiếu chưa có dòng hàng nào", hoặc ghi mất phiếu đang nhập dở)
  mountEntryForm(freshRoot(root), p.entry, p.opts, k);
}
function entryGoBack() {
  const to = entryBack && !/^#\/ghi-thu-chi/.test(entryBack) ? entryBack : '#/so-thu-chi';
  if (location.hash !== to) location.hash = to;
}

function mountEntryForm(root, entry, opts, pageKey) {
  opts = opts || {};
  const isEdit = !!(entry && entry.id && !opts.duplicate);
  const choKey = 'so-moi-' + (++soForm); // danh sách file chờ của dòng mới (riêng cho mỗi lần mở form)
  // Sửa cả phiếu: opts.phieu = mọi dòng cùng số phiếu; mặc định mở một dòng (có thể thêm dòng vào phiếu)
  const dongPhieu = isEdit && opts.phieu && opts.phieu.length > 1 ? opts.phieu : null;
  const dongCu = dongPhieu || (isEdit ? [entry] : []);
  const cungPhieu = isEdit && !dongPhieu && entry.soPhieu ? S.all.entries.filter((x) => KT.voucherKey(x.soPhieu) === KT.voucherKey(entry.soPhieu) && x.id !== entry.id) : [];
  // Dòng Nháp (hoặc dòng mới) được chọn giữa Lưu nháp và Ghi sổ; dòng đã ghi sổ chỉ Lưu thay đổi
  const isDraftRec = isEdit && dongCu.every((x) => KT.isDraft(x));
  const ngayKhoa = isEdit ? dongCu.map((x) => x.ngay).find((d) => KT.isLockedDate(S.all, d)) : '';
  const lockedRec = !!ngayKhoa; // tháng đã khóa sổ: chỉ xem
  const canDraft = (!isEdit || isDraftRec) && !lockedRec;
  // ngày mặc định luôn là hôm nay (không lấy ngày của phiếu vừa nhập); mở lại trang Ghi thu / chi là một phiếu mới
  const e = Object.assign({ ngay: KT.todayISO(), soPhieu: '', maDuAn: '', maNCC: '', noiDung: '', thu: 0, chi: 0, nguoiNhan: '', ghiChu: '' }, entry || {});
  if (opts.duplicate) { e.id = undefined; }
  const coThu = dongCu.length ? dongCu.some((x) => x.thu > 0) : e.thu > 0;
  const coChi = dongCu.length ? dongCu.some((x) => x.chi > 0) : e.chi > 0;
  let loai = coThu && coChi ? 'ca-hai' : coThu ? 'thu' : (entry && entry.id) ? 'chi' : (opts.loai || lastUsed.loai || 'chi');
  const dongDau = dongCu.length ? dongCu : [e];

  const body =
    '<form id="entry-form" class="grid grid-cols-2 gap-x-5 gap-y-4 max-sm:grid-cols-1" novalidate autocomplete="off">' +
    (lockedRec ? '<p class="form-error col-span-2 max-sm:col-span-1" role="note">' + icon('lock') + '<span>' + esc(KT.lockMessage(KT.monthOf(ngayKhoa), 'sửa')) + '</span></p>' : '') +
    datalists() + '<datalist id="dl-vt-so">' + S.db.materials.map((m) => '<option value="' + esc(m.ma) + '">' + esc(m.ten + (m.dvt ? ' · ' + m.dvt : '')) + '</option>').join('') + '</datalist>' +
    '<div class="col-span-2 max-sm:col-span-1"><div class="seg" role="radiogroup" aria-label="Loại nghiệp vụ">' +
    [['chi', 'Chi tiền'], ['thu', 'Thu tiền'], ['ca-hai', 'Thu và chi cùng lúc']].map(([v, l]) =>
      '<label class="seg-item"><input type="radio" name="loai" value="' + v + '"' + (loai === v ? ' checked' : '') + '><span>' + l + '</span></label>').join('') +
    '</div></div>' +
    '<label class="field"><span class="label">Ngày chứng từ <b class="req">*</b></span>' + dateField({ name: 'ngay', value: e.ngay, required: true, label: 'Ngày chứng từ' }) + '</label>' +
    '<div class="field"><span class="label">Số phiếu</span><div class="flex gap-2">' +
    '<input name="soPhieu" class="input" value="' + esc(e.soPhieu) + '" placeholder="VD: PC045/09" aria-label="Số phiếu">' +
    '<button type="button" class="btn btn-secondary flex-none" data-act="so-moi" title="Lấy số phiếu kế tiếp trong tháng">Số mới</button></div>' +
    '<span class="hint" id="so-hint"></span></div>' +
    '<label class="field"><span class="label">Nhà cung cấp, đối tượng <b class="req">*</b></span><input name="maNCC" class="input" list="dl-suppliers" value="' + esc(e.maNCC) + '" placeholder="Gõ mã hoặc tên">' +
    '<span class="hint" id="ncc-hint"></span></label>' +
    '<label class="field"><span class="label">Người nhận, người nộp</span><input name="nguoiNhan" class="input" value="' + esc(e.nguoiNhan) + '" placeholder="Để trống thì lấy theo nhà cung cấp khi in"></label>' +
    '<label class="field col-span-2 max-sm:col-span-1"><span class="label">Ghi chú</span><input name="ghiChu" class="input" value="' + esc(e.ghiChu) + '"></label>' +
    '<section class="sheet col-span-2 overflow-hidden max-sm:col-span-1" aria-labelledby="h-dong-phieu">' +
    '<div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule px-4 py-2"><h3 id="h-dong-phieu" class="sheet-title">Các dòng của phiếu</h3>' +
    '<span class="min-w-0 flex-1 text-[12px] text-ink-3">Mỗi dòng gắn một công trình riêng để công nợ nhà cung cấp tách đúng theo công trình.</span>' +
    '<button type="button" class="btn btn-secondary btn-sm" data-act="them-dong">' + icon('plus') + 'Thêm dòng</button></div>' +
    '<div class="scroll-x overflow-x-auto"><table class="ledger grid-entry" id="phieu-dong"><thead><tr>' +
    // Nội dung giữ độ rộng vừa phải (không giãn hết bề ngang); phần dư dành cho Tên công trình · NCC còn nợ, Mã vật tư
    '<th class="num w-8">#</th><th class="w-[300px] min-w-[200px]">Nội dung <b class="req">*</b></th><th class="w-[170px] min-w-[120px]">Công trình <b class="req">*</b></th><th class="min-w-[220px]">Tên công trình · NCC còn nợ</th>' +
    '<th data-show="chi" class="w-[240px] min-w-[160px]">Mã vật tư</th><th data-show="chi" class="num money w-[180px] min-w-[130px]">Số tiền chi</th><th data-show="thu" class="num money w-[180px] min-w-[130px]">Số tiền thu</th><th class="w-10"><span class="sr-only">Bỏ dòng</span></th></tr></thead>' +
    '<tbody>' + dongDau.map(dongHtml).join('') + '</tbody>' +
    '<tfoot><tr><td colspan="4" class="text-[15px]" id="phieu-tong" aria-live="polite">Tổng phiếu</td>' +
    '<td data-show="chi" class="num money text-[22px]"></td>' + // ô trống: chỉ để cột khớp khi Mã vật tư hiện
    '<td data-show="chi" class="num money"><span class="dbl text-[22px]" id="phieu-tong-chi">0</span></td>' +
    '<td data-show="thu" class="num money"><span class="dbl text-[22px]" id="phieu-tong-thu">0</span></td><td></td></tr></tfoot></table></div>' +
    '<p class="border-t border-rule px-4 py-2 text-[16px] font-semibold text-ink" id="phieu-chu" aria-live="polite"></p>' +
    '<p class="form-error mx-4 mb-3" id="phieu-loi" role="alert" hidden></p></section>' +
    '<p class="col-span-2 text-[12.5px] leading-relaxed text-ink-3 max-sm:col-span-1">' + icon('keyboard', 'mr-1 align-[-3px] text-[15px]') +
    'Ô số tiền nhận <b class="font-medium text-ink-2">1.250.000</b>, <b class="font-medium text-ink-2">50tr</b>, <b class="font-medium text-ink-2">300k</b> hoặc phép tính <b class="font-medium text-ink-2">58000+11000</b>. ' +
    'Nội dung dòng để trống thì lấy theo dòng đầu. Enter ở ô cuối của dòng cuối sẽ thêm dòng mới. ' +
    'Ghi sổ nhanh bằng <kbd>Ctrl</kbd> + <kbd>Enter</kbd>, đóng bằng <kbd>Esc</kbd>.</p>' +
    (cungPhieu.length ? '<p class="col-span-2 text-[13px] text-ink-2 max-sm:col-span-1" data-cung-phieu>' + icon('list', 'mr-1 align-[-3px] text-[15px]') +
      'Phiếu này còn <b>' + cungPhieu.length + '</b> dòng khác. <a href="#" data-act="sua-phieu">Sửa cả phiếu (' + (cungPhieu.length + 1) + ' dòng)</a></p>' : '') +
    (isEdit ? nguoiThaoTacHtml(e) : '') +
    // dòng mới: chọn ảnh / tài liệu ngay, tự tải lên khi ghi sổ (hoặc lưu nháp); dòng đã có: đính kèm thẳng
    '</form>' + (isEdit ? attachBlock('entries', e.id, { readonly: false }) : pendingBlock(choKey, 'Ghi sổ (hoặc Lưu nháp)'));

  const footer =
    (isEdit && !dongPhieu ? (lockedRec ? '' : '<button type="button" class="btn btn-danger-ghost" data-act="delete">' + icon('trash') + 'Xóa dòng</button>') : '') +
    (isEdit ? '<button type="button" class="btn btn-ghost" data-act="history" title="Xem mọi lần thêm, sửa của dòng này trong nhật ký">' + icon('history') + 'Lịch sử</button>' : '') +
    '<span class="flex-1"></span>' +
    '<button type="button" class="btn btn-ghost" data-act="cancel">Hủy</button>' +
    (canDraft ? '<button type="button" class="btn btn-secondary" data-act="save-draft" title="Lưu lại để làm tiếp; dòng Nháp chưa tính vào tồn quỹ, báo cáo, công nợ">' + icon('draft') + 'Lưu nháp</button>' : '') +
    (isEdit ? '' : '<button type="button" class="btn btn-secondary" data-act="save-next" title="Ghi sổ rồi giữ lại ngày, số phiếu, nhà cung cấp để ghi phiếu tiếp theo (Ctrl Shift Enter)">Ghi sổ và ghi tiếp<kbd>Ctrl Shift Enter</kbd></button>') +
    (lockedRec ? '' : '<button type="button" class="btn btn-primary" data-act="save" title="Ctrl + Enter">' + icon(isEdit && !isDraftRec ? 'save' : 'check') + (isEdit && !isDraftRec ? 'Lưu thay đổi' : 'Ghi sổ') + '<kbd>Ctrl Enter</kbd></button>');

  const title = isDraftRec ? 'Sửa dòng nháp (chưa ghi sổ)' : dongPhieu ? 'Sửa phiếu ' + e.soPhieu + ' (' + dongPhieu.length + ' dòng)' : isEdit ? 'Sửa dòng sổ thu chi' : opts.duplicate ? 'Nhân bản dòng sổ thu chi' : 'Ghi thu / chi';
  root.innerHTML = '<div id="entry-page" class="sheet" data-k="' + pageKey + '" data-title="' + esc(title) + '">' +
    '<div class="px-5 py-4 max-sm:px-3">' + body + '</div>' +
    '<div class="sticky bottom-0 z-[5] flex flex-wrap items-center gap-2 border-t border-rule bg-surface px-5 py-3 max-sm:px-3">' + footer + '</div></div>';
  setPageTitle(title);
  const pageEl = root.querySelector('#entry-page');
  const m = { el: pageEl, close() { clearPending(choKey); entryGoBack(); } };
  bindEntryForm(pageEl); bindAttach(pageEl); bindPending(pageEl);
  // Esc = Hủy (như hộp thoại trước đây), trừ khi đang có hộp thoại con mở
  pageEl.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !document.querySelector('.modal, #auth-root .auth-screen, #auth-root .modal')) { ev.preventDefault(); m.close(); } });

  function bindEntryForm(el) {
    const f = $('#entry-form', el);
    const get = (n) => f.elements[n];
    const tbody = $('#phieu-dong tbody', el);
    const rows = () => Array.from(tbody.rows);
    const cell = (tr, k) => tr.querySelector('[data-c="' + k + '"]');
    const rowState = new Map(); // tr -> { goc: dòng sổ cũ (khi sửa), getChi, getThu }
    const xoaIds = []; // dòng cũ bị bỏ khỏi phiếu
    const dirty = { nguoiNhan: false, ghiChu: false }; // chỉ ghi đè người nhận / ghi chú của từng dòng khi người dùng sửa ô chung
    let curRow = null;
    ['nguoiNhan', 'ghiChu'].forEach((n) => get(n).addEventListener('input', () => { dirty[n] = true; }));
    if (dongPhieu) {
      const khac = (n) => new Set(dongPhieu.map((x) => x[n] || '')).size > 1;
      ['nguoiNhan', 'ghiChu'].forEach((n) => { if (khac(n)) get(n).placeholder = 'Các dòng đang khác nhau, để trống thì giữ nguyên từng dòng'; });
      ['nguoiNhan', 'ghiChu'].forEach((n) => { if (khac(n)) get(n).value = ''; });
    }

    function applyLoai() {
      loai = f.querySelector('input[name=loai]:checked').value;
      el.querySelectorAll('[data-show]').forEach((x) => {
        x.hidden = !(loai === 'ca-hai' || x.dataset.show === loai);
      });
      updateSoHint();
      tong();
    }
    f.querySelectorAll('input[name=loai]').forEach((r) => r.addEventListener('change', applyLoai));

    // Chỉ ghi lại khi nội dung đổi: bấm vào liên kết trong gợi ý (Thêm ... này, Điền số này) làm ô nhập mất tiêu điểm → sự kiện change
    // vẽ lại gợi ý ngay giữa lúc nhấn chuột, liên kết bị thay mới và cú bấm không tới được.
    function setHint(h, html, cls) { if (h.dataset.src !== html) { h.innerHTML = html; h.dataset.src = html; } if (h.className !== cls) h.className = cls; }
    const gy = (tr, k) => tr.querySelector('[data-h="' + k + '"]');
    function nccHint() {
      const input = get('maNCC');
      const code = resolveCode(S.db.suppliers, input.value);
      const h = $('#ncc-hint', el);
      if (!input.value.trim()) setHint(h, '', 'hint');
      else {
        const found = S.db.suppliers.find((x) => KT.keyOf(x.ma) === KT.keyOf(code));
        if (found) setHint(h, esc(found.ten) + debtHint(found.ma), 'hint good');
        else setHint(h, 'Chưa có trong danh mục. <a href="#" data-act="add-supplier">Thêm nhà cung cấp này</a>', 'hint bad');
      }
      rows().forEach(daHint); // công nợ tại từng công trình phụ thuộc nhà cung cấp
    }
    // đang sửa thì không tính các dòng của chính phiếu này vào công nợ
    const viewKhongGomDangSua = () => {
      const ids = new Set(dongCu.map((x) => x.id));
      return ids.size ? Object.assign({}, S.db, { entries: S.db.entries.filter((x) => !ids.has(x.id)) }) : S.db;
    };
    // Công nợ còn lại của NCC (chi phí công trình − đã trả); phiếu một dòng có công trình thì theo công trình đó, phiếu nhiều dòng thì toàn bộ
    function debtHint(maNCC) {
      const trs = rows();
      const ct = trs.length === 1 ? resolveCode(S.db.projects, cell(trs[0], 'maDuAn').value) : '';
      const d = KT.debtOf(viewKhongGomDangSua(), maNCC, projectByCode(ct) ? ct : '');
      if (!d || !d.soDongCP) return '';
      const where = projectByCode(ct) ? ' tại ' + esc(ct) : '';
      if (d.conLai > 0) return '<br><span class="text-ink-2">Công nợ' + where + ': còn nợ <b class="font-semibold tabular-nums">' + money(d.conLai) + ' đ</b></span> <a href="#" data-act="fill-debt" data-v="' + d.conLai + '">Điền số này</a>';
      if (d.conLai < 0) return '<br><span class="text-caution">Công nợ' + where + ': đã ứng dư ' + money(-d.conLai) + ' đ</span>';
      return '<br><span class="text-ink-2">Công nợ' + where + ': đã tất toán</span>';
    }
    // công trình của dòng: hiện tên; đã chọn nhà cung cấp thì kèm số còn nợ nhà cung cấp tại công trình đó (để chia tiền cho đúng)
    function daHint(tr) {
      const input = cell(tr, 'maDuAn');
      const h = gy(tr, 'da');
      if (!input.value.trim()) { setHint(h, '', 'hint'); return; }
      const code = resolveCode(S.db.projects, input.value);
      const found = S.db.projects.find((x) => KT.keyOf(x.ma) === KT.keyOf(code));
      if (!found) { setHint(h, 'Chưa có trong danh mục. <a href="#" data-act="add-project">Thêm công trình này</a>', 'hint bad'); return; }
      let t = esc(found.ten);
      const ncc = resolveCode(S.db.suppliers, get('maNCC').value);
      if (ncc && supplierByCode(ncc) && rows().length > 1) {
        const d = KT.debtOf(viewKhongGomDangSua(), ncc, found.ma);
        if (d && d.soDongCP && d.conLai > 0) t += '<br><span class="text-ink-2">NCC còn nợ tại đây: <b class="font-semibold tabular-nums">' + money(d.conLai) + ' đ</b></span>';
      }
      setHint(h, t, 'hint good');
    }
    // mã vật tư: hiện tên và đơn vị tính; mã lạ chỉ báo lỗi, không có nút thêm (thêm vật tư ở Danh mục)
    function vtHint(tr) {
      const h = gy(tr, 'vt');
      const v = cell(tr, 'maVT').value.trim();
      if (!v) { setHint(h, '', 'hint'); return; }
      const code = resolveCode(S.db.materials, v);
      const mt = S.db.materials.find((x) => KT.keyOf(x.ma) === KT.keyOf(code));
      if (mt) setHint(h, esc(mt.ten) + (mt.dvt ? ' · ' + esc(mt.dvt) : ''), 'hint good');
      else setHint(h, 'Chưa có trong danh mục vật tư', 'hint bad');
    }

    // Dòng đầu giữ name / id như biểu mẫu một dòng; các dòng sau chỉ có data-c
    function danhSo() {
      rows().forEach((tr, i) => {
        COT_DONG.forEach((k) => {
          const c = cell(tr, k);
          if (i === 0) c.setAttribute('name', k); else c.removeAttribute('name');
          const g = GOI_Y_DONG[k];
          if (g) { const h = gy(tr, g[1]); if (i === 0) h.id = g[0]; else h.removeAttribute('id'); }
        });
        tr.querySelector('[data-stt]').textContent = i + 1;
        const bo = tr.querySelector('[data-act=bo-dong]');
        bo.hidden = rows().length === 1 || lockedRec;
      });
    }

    function tong() {
      let chi = 0, thu = 0, loi = false;
      rows().forEach((tr) => {
        const st = rowState.get(tr);
        const c = loai === 'thu' ? 0 : st.getChi(), t = loai === 'chi' ? 0 : st.getThu();
        if (isNaN(c) || isNaN(t)) { loi = true; return; }
        chi += c; thu += t;
      });
      $('#phieu-tong', el).innerHTML = 'Tổng phiếu · ' + rows().length + ' dòng' + (loi ? ' <span class="text-[13px] font-medium text-alert">(có ô số tiền chưa hợp lệ)</span>' : '');
      $('#phieu-tong-chi', el).textContent = money(chi);
      $('#phieu-tong-thu', el).textContent = money(thu);
      const chu = [];
      if (loai !== 'thu' && chi) chu.push((loai === 'ca-hai' ? 'Chi: ' : '') + KT.docTienBangChu(chi));
      if (loai !== 'chi' && thu) chu.push((loai === 'ca-hai' ? 'Thu: ' : '') + KT.docTienBangChu(thu));
      $('#phieu-chu', el).textContent = chu.join(' · ');
    }

    function bindDong(tr, goc) {
      const st = { goc, getChi: bindMoneyInput(cell(tr, 'chi'), gy(tr, 'chi')), getThu: bindMoneyInput(cell(tr, 'thu'), gy(tr, 'thu')) };
      rowState.set(tr, st);
      const da = cell(tr, 'maDuAn'), vt = cell(tr, 'maVT');
      da.addEventListener('input', () => { daHint(tr); if (rows().length === 1) nccHint(); });
      da.addEventListener('change', () => { da.value = resolveCode(S.db.projects, da.value); daHint(tr); if (rows().length === 1) nccHint(); });
      vt.addEventListener('input', () => vtHint(tr));
      vt.addEventListener('change', () => { vt.value = resolveCode(S.db.materials, vt.value); vtHint(tr); });
      ['chi', 'thu'].forEach((k) => { cell(tr, k).addEventListener('input', tong); cell(tr, k).addEventListener('blur', tong); });
      tr.addEventListener('focusin', () => { curRow = tr; });
      daHint(tr); vtHint(tr);
    }
    rows().forEach((tr, i) => bindDong(tr, dongCu[i] || null));

    function themDong(vals) {
      const tmp = document.createElement('tbody');
      tmp.innerHTML = dongHtml(vals || {});
      const tr = tmp.firstElementChild;
      tbody.appendChild(tr);
      bindDong(tr, null);
      danhSo();
      applyLoai();
      rows().forEach(daHint);
      focusInput(cell(tr, 'noiDung'));
      return tr;
    }

    // Enter trong bảng dòng: sang ô kế tiếp; ở ô cuối của dòng cuối thì thêm dòng mới (không ghi sổ, ghi sổ bằng Ctrl+Enter)
    tbody.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.isComposing) return;
      const c = ev.target.closest('[data-c]');
      if (!c) return;
      ev.preventDefault();
      const tr = c.closest('tr');
      const cells = Array.from(tr.querySelectorAll('[data-c]')).filter((x) => !x.closest('[hidden]'));
      const i = cells.indexOf(c);
      if (i < cells.length - 1) cells[i + 1].focus();
      else if (tr === rows()[rows().length - 1]) { if (!lockedRec) themDong(); }
      else cell(tr.nextElementSibling, 'noiDung').focus();
    });

    get('maNCC').addEventListener('input', nccHint);
    get('maNCC').addEventListener('change', () => { get('maNCC').value = resolveCode(S.db.suppliers, get('maNCC').value); nccHint(); });

    function updateSoHint() {
      const h = $('#so-hint', el);
      const so = get('soPhieu').value.trim();
      h.className = 'hint';
      if (!so) {
        h.innerHTML = lastUsed.soPhieu && !isEdit ? 'Phiếu vừa nhập: <a href="#" data-act="so-truoc">' + esc(lastUsed.soPhieu) + '</a>' : '';
        return;
      }
      const t = KT.voucherType(so);
      const mine = new Set(dongCu.map((x) => x.id));
      const others = S.all.entries.filter((x) => KT.voucherKey(x.soPhieu) === KT.voucherKey(so) && !mine.has(x.id));
      let txt = t === 'thu' ? 'Phiếu thu' : 'Phiếu chi';
      if (others.length) txt += ', đã có ' + others.length + ' dòng cùng số (sẽ gộp khi in)';
      if (t === 'thu' && loai === 'chi') txt += '. Lưu ý: số phiếu PT dành cho khoản thu';
      h.textContent = txt;
    }
    get('soPhieu').addEventListener('input', updateSoHint);

    el.addEventListener('click', async (ev) => {
      const a = ev.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      const tr = a.closest('tr[data-row]');
      if (act === 'fill-debt') {
        ev.preventDefault();
        const dich = curRow && curRow.isConnected ? curRow : rows()[0];
        const c = cell(dich, 'chi');
        c.value = money(Number(a.dataset.v));
        c.dispatchEvent(new Event('input'));
        c.focus();
      } else if (act === 'so-moi') {
        get('soPhieu').value = KT.nextVoucherNo(S.all, loai === 'thu' ? 'thu' : 'chi', get('ngay').value);
        updateSoHint();
      } else if (act === 'so-truoc') {
        ev.preventDefault();
        get('soPhieu').value = lastUsed.soPhieu;
        updateSoHint();
      } else if (act === 'them-dong') {
        themDong();
      } else if (act === 'bo-dong' && tr) {
        const st = rowState.get(tr);
        if (st && st.goc && st.goc.id) xoaIds.push(st.goc.id);
        const ke = tr.previousElementSibling || tr.nextElementSibling;
        rowState.delete(tr);
        tr.remove();
        danhSo();
        rows().forEach(daHint);
        nccHint();
        tong();
        if (ke) focusInput(cell(ke, 'noiDung')); // nút vừa bấm biến mất: giữ tiêu điểm trong form để Ctrl + Enter vẫn ghi sổ được
      } else if (act === 'add-project') {
        ev.preventDefault();
        const input = cell(tr, 'maDuAn');
        openProjectForm({ ma: input.value.trim() }, (p) => { input.value = p.ma; refreshLists(); daHint(tr); });
      } else if (act === 'add-supplier') {
        ev.preventDefault();
        openSupplierForm({ ma: get('maNCC').value.trim() }, (s) => { get('maNCC').value = s.ma; refreshLists(); nccHint(); });
      } else if (act === 'sua-phieu') {
        ev.preventDefault();
        const all = [entry].concat(cungPhieu).sort((x, y) => (x.seq || 0) - (y.seq || 0) || x.id - y.id);
        clearPending(choKey);
        openEntryForm(all[0], { phieu: all, onSaved: opts.onSaved });
      } else if (act === 'history') {
        m.close();
        openHistory(e.id);
      } else if (act === 'cancel') {
        m.close();
      } else if (act === 'delete') {
        if (await deleteEntry(e)) m.close();
      } else if (act === 'save' || act === 'save-next') {
        save(act === 'save-next');
      } else if (act === 'save-draft') {
        save(false, true);
      }
    });

    function refreshLists() {
      const tmp = document.createElement('div');
      tmp.innerHTML = datalists();
      f.querySelector('#dl-projects').replaceWith(tmp.querySelector('#dl-projects'));
      f.querySelector('#dl-suppliers').replaceWith(tmp.querySelector('#dl-suppliers'));
    }

    f.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); save(!!ev.shiftKey && !isEdit); }
    });
    f.addEventListener('submit', (ev) => { ev.preventDefault(); save(false); });

    let saving = false;
    async function save(next, asDraft) {
      if (saving) return;
      if (lockedRec) return;
      const chung = {
        trangThai: asDraft ? 'nhap' : '',
        ngay: get('ngay').value,
        soPhieu: get('soPhieu').value.trim(),
        maNCC: resolveCode(S.db.suppliers, get('maNCC').value)
      };
      const nguoiNhan = get('nguoiNhan').value.trim(), ghiChu = get('ghiChu').value.trim();
      if (!KT.isISODate(chung.ngay)) return fail(get('ngay'), 'Nhập ngày chứng từ, ví dụ 29/9');
      if (KT.isLockedDate(S.all, chung.ngay)) return fail(get('ngay'), KT.lockMessage(KT.monthOf(chung.ngay), 'ghi'));
      // bắt buộc: thu / chi với ai (NCC, thợ, chủ nhà, người nộp quỹ… đều là đối tượng trong danh mục)
      if (!chung.maNCC) return fail(get('maNCC'), 'Chọn nhà cung cấp / đối tượng: gõ mã hoặc tên rồi chọn trong gợi ý');
      if (!supplierByCode(chung.maNCC)) return fail(get('maNCC'), 'Mã nhà cung cấp chưa có trong danh mục. Bấm “Thêm nhà cung cấp này” hoặc chọn mã có sẵn');

      const trs = rows();
      const dongTrong = (tr) => {
        const st = rowState.get(tr);
        return !cell(tr, 'noiDung').value.trim() && !cell(tr, 'maDuAn').value.trim() && !cell(tr, 'maVT').value.trim() && !cell(tr, 'chi').value.trim() && !cell(tr, 'thu').value.trim() && !st.goc;
      };
      const dung = trs.length > 1 ? trs.filter((tr) => !dongTrong(tr)) : trs; // bỏ qua dòng mới còn trống
      const nd0 = dung.map((tr) => cell(tr, 'noiDung').value.trim()).find(Boolean) || '';
      const lines = [];
      for (let i = 0; i < dung.length; i++) {
        const tr = dung[i], st = rowState.get(tr);
        const at = trs.length > 1 ? 'Dòng ' + (trs.indexOf(tr) + 1) + ': ' : '';
        const maDuAn = resolveCode(S.db.projects, cell(tr, 'maDuAn').value);
        const maVT = loai === 'thu' ? '' : resolveCode(S.db.materials, cell(tr, 'maVT').value);
        const noiDung = cell(tr, 'noiDung').value.trim() || nd0;
        const thu = loai === 'chi' ? 0 : st.getThu(), chi = loai === 'thu' ? 0 : st.getChi();
        // mỗi dòng thu / chi bắt buộc có công trình (khoản chung, văn phòng... thì chọn công trình chung) để công nợ, chi phí tính đúng chỗ
        if (!maDuAn) return fail(cell(tr, 'maDuAn'), at + 'Chọn công trình cho dòng này (khoản chung / văn phòng thì chọn công trình chung)');
        if (!projectByCode(maDuAn)) return fail(cell(tr, 'maDuAn'), at + 'Mã công trình chưa có trong danh mục. Bấm “Thêm công trình này” hoặc chọn mã có sẵn');
        if (maVT && !S.db.materials.some((x) => KT.keyOf(x.ma) === KT.keyOf(maVT))) return fail(cell(tr, 'maVT'), at + 'Mã vật tư chưa có trong danh mục vật tư. Chọn mã có sẵn hoặc để trống');
        if (!noiDung) return fail(cell(tr, 'noiDung'), at + 'Nhập nội dung thu, chi');
        if (isNaN(chi)) return fail(cell(tr, 'chi'), at + 'Số tiền chi không hợp lệ. Ví dụ: 1.250.000, 50tr, 300k');
        if (isNaN(thu)) return fail(cell(tr, 'thu'), at + 'Số tiền thu không hợp lệ. Ví dụ: 1.250.000, 50tr, 300k');
        if (loai === 'chi' && !chi) return fail(cell(tr, 'chi'), at + 'Nhập số tiền chi');
        if (loai === 'thu' && !thu) return fail(cell(tr, 'thu'), at + 'Nhập số tiền thu');
        if (loai === 'ca-hai' && !thu && !chi) return fail(cell(tr, 'chi'), at + 'Nhập số tiền thu hoặc chi');
        const goc = st.goc;
        lines.push(Object.assign({}, chung, {
          id: goc && goc.id ? goc.id : undefined,
          maDuAn, maVT, noiDung, thu, chi,
          nguoiNhan: goc && !dirty.nguoiNhan ? goc.nguoiNhan || '' : nguoiNhan,
          ghiChu: goc && !dirty.ghiChu ? goc.ghiChu || '' : ghiChu
        }));
      }
      // một dòng thì giữ cách ghi cũ (một lệnh thêm / sửa); nhiều dòng hoặc có dòng bị bỏ thì ghi cả phiếu trong một lần
      const viaPhieu = lines.length > 1 || xoaIds.length > 0 || (isEdit && lines.length === 1 && !lines[0].id);
      saving = true;
      const btn = el.querySelector(asDraft ? '[data-act=save-draft]' : next ? '[data-act=save-next]' : '[data-act=save]');
      const done = busy(btn, isEdit || asDraft ? 'Đang lưu…' : 'Đang ghi…');
      try {
        let idDau;
        if (viaPhieu) {
          const r = await api('POST', '/api/entries/phieu', { rows: lines, xoa: xoaIds });
          idDau = r.ids && r.ids[0];
        } else if (isEdit) { await api('PUT', '/api/entries/' + e.id, lines[0]); idDau = e.id; }
        else { const r = await api('POST', '/api/entries', lines[0]); idDau = r.id; }
        if (!isEdit) {
          const cho = pendingFiles(choKey);
          if (cho.length && idDau) {
            const n = await uploadFiles('entries', idDau, cho);
            clearPending(choKey);
            if (n) toast('Đã đính kèm ' + n + ' / ' + cho.length + ' file vào ' + (lines.length > 1 ? 'dòng đầu của phiếu' : 'dòng vừa ghi'));
            const box = el.querySelector('[data-att-pending]');
            if (box) { box.outerHTML = pendingBlock(choKey, 'Ghi sổ (hoặc Lưu nháp)'); bindPending(el); }
          }
        }
        lastUsed = { ngay: chung.ngay, soPhieu: chung.soPhieu, maDuAn: lines[0].maDuAn, maNCC: chung.maNCC, loai };
        const tongTien = lines.reduce((s, x) => s + (x.chi || x.thu), 0);
        toast(asDraft ? 'Đã lưu nháp (chưa ghi sổ, chưa tính vào tồn quỹ)' : isDraftRec ? 'Đã ghi sổ dòng nháp' : isEdit ? 'Đã lưu thay đổi' :
          lines.length > 1 ? 'Đã ghi sổ phiếu ' + lines.length + ' dòng, tổng ' + money(tongTien) + ' đ' :
          'Đã ghi sổ ' + (lines[0].chi ? 'khoản chi ' + money(lines[0].chi) : 'khoản thu ' + money(lines[0].thu)) + ' đ');
        if (next) {
          // giữ ngày, số phiếu, nhà cung cấp; bỏ các dòng thừa, xóa nội dung dòng đầu
          rows().slice(1).forEach((tr) => { rowState.delete(tr); tr.remove(); });
          const tr0 = rows()[0];
          ['noiDung', 'chi', 'thu', 'maVT'].forEach((k) => { cell(tr0, k).value = ''; });
          cell(tr0, 'chi').dispatchEvent(new Event('input'));
          cell(tr0, 'thu').dispatchEvent(new Event('input'));
          vtHint(tr0);
          ['nguoiNhan', 'ghiChu'].forEach((n) => { get(n).value = ''; });
          danhSo();
          updateSoHint();
          nccHint();
          tong();
          cell(tr0, 'noiDung').focus();
        } else {
          m.close();
        }
        if (opts.onSaved) opts.onSaved();
      } catch (err) {
        showError(err);
      } finally {
        saving = false;
        if (btn && btn.isConnected) done();
      }
    }

    // Lỗi hiện ngay dưới ô (không che nút Ghi sổ như thông báo góc màn hình)
    function fail(input, msg) {
      if (input.closest('#phieu-dong')) { // ô trong bảng dòng không có chỗ dưới ô: báo ở khung lỗi dưới bảng
        focusInput(input);
        input.classList.add('invalid');
        input.setAttribute('aria-invalid', 'true');
        const box = $('#phieu-loi', el);
        box.innerHTML = icon('warn') + '<span>' + esc(msg) + '</span>';
        box.hidden = false;
        const off = () => { input.classList.remove('invalid'); input.removeAttribute('aria-invalid'); box.hidden = true; };
        input.addEventListener('input', off, { once: true });
        input.addEventListener('change', off, { once: true });
        return;
      }
      if (!fieldError(input, msg)) toast(msg, 'error');
    }

    danhSo();
    applyLoai();
    if (lockedRec) f.querySelectorAll('input, textarea, select, button').forEach((x) => { x.disabled = true; });
    nccHint();
    let touched = false;
    ['pointerdown', 'keydown', 'input'].forEach((t) => el.addEventListener(t, () => { touched = true; }, true));
    setTimeout(() => { if (!touched) focusInput(isEdit ? cell(rows()[0], 'noiDung') : get('ngay')); }, 40);
  }
}

export async function deleteEntry(e) {
  const ok = await confirmDialog({
    trash: true,
    title: 'Xóa dòng sổ thu chi',
    html: 'Xóa dòng ngày <b class="text-ink">' + esc(KT.fmtDate(e.ngay)) + '</b>: “' + esc(e.noiDung || '') + '” ' +
      (e.chi ? '(chi <b class="text-ink">' + money(e.chi) + ' đ</b>)' : '(thu <b class="text-ink">' + money(e.thu) + ' đ</b>)') + '?' +
      '<p class="mt-2 text-[13px] text-ink-3">Tồn quỹ các dòng sau tự tính lại.</p>',
    hauQua: hauQuaCongNo(e.maNCC, (e.chi || 0) - (e.thu || 0), e.maDuAn),
    okText: 'Xóa dòng',
    danger: true
  });
  if (!ok) return false;
  try {
    await api('DELETE', '/api/entries/' + e.id);
    toast('Đã xóa dòng sổ, chuyển vào Thùng rác');
    return true;
  } catch (err) {
    showError(err);
    return false;
  }
}

/* ============================== CÔNG TRÌNH ============================== */

export const PROJECT_STATUSES = ['Đang thực hiện', 'Đang thi công', 'Tạm dừng', 'Hoàn thành', 'Đã quyết toán'];

export function openProjectForm(p, onSaved) {
  const isEdit = !!(p && p.id);
  p = Object.assign({ ma: '', ten: '', nganSach: 0, trangThai: 'Đang thực hiện', ghiChu: '', ngayKhoiCong: '', diaChi: '' }, p || {});
  const used = isEdit ? S.all.entries.filter((e) => KT.keyOf(e.maDuAn) === KT.keyOf(p.ma)).length + S.all.costs.filter((c) => KT.keyOf(c.maCT) === KT.keyOf(p.ma)).length : 0;
  return openModal({
    title: isEdit ? 'Sửa công trình ' + p.ma : 'Thêm công trình',
    body:
      '<form class="grid grid-cols-2 gap-x-5 gap-y-4 max-sm:grid-cols-1" id="p-form" novalidate autocomplete="off">' +
      '<label class="field"><span class="label">Mã công trình <b class="req">*</b></span><input name="ma" class="input" value="' + esc(p.ma) + '" placeholder="VD: DA34PHK" required>' +
      '<span class="hint">' + (used ? 'Đổi mã sẽ cập nhật ' + used + ' dòng sổ thu chi và chi phí đang dùng mã này' : '') + '</span></label>' +
      '<label class="field"><span class="label">Trạng thái</span><select name="trangThai" class="input">' +
      PROJECT_STATUSES.concat(PROJECT_STATUSES.includes(p.trangThai) ? [] : [p.trangThai]).map((s) => '<option' + (s === p.trangThai ? ' selected' : '') + '>' + esc(s) + '</option>').join('') +
      '</select></label>' +
      '<label class="field col-span-2 max-sm:col-span-1"><span class="label">Tên công trình <b class="req">*</b></span><input name="ten" class="input" value="' + esc(p.ten) + '" required></label>' +
      '<label class="field"><span class="label">Ngân sách dự kiến (đồng)</span><input name="nganSach" inputmode="decimal" class="input text-right tabular-nums" value="' + (p.nganSach ? money(p.nganSach) : '') + '" placeholder="Để trống nếu chưa có">' +
      '<span class="hint" id="ns-hint"></span></label>' +
      '<label class="field"><span class="label">Ghi chú</span><input name="ghiChu" class="input" value="' + esc(p.ghiChu) + '"></label>' +
      '<label class="field"><span class="label">Ngày khởi công</span>' + dateField({ name: 'ngayKhoiCong', value: p.ngayKhoiCong, label: 'Ngày khởi công' }) + '</label>' +
      '<label class="field"><span class="label">Địa chỉ công trình</span><input name="diaChi" class="input" value="' + esc(p.diaChi) + '"></label>' +
      '</form>',
    footer: '<span class="flex-1"></span><button type="button" class="btn btn-ghost" data-act="cancel">Hủy</button><button type="button" class="btn btn-primary" data-act="save">' + (isEdit ? 'Lưu thay đổi' : 'Thêm công trình') + '</button>',
    onMount(el, h) {
      const f = $('#p-form', el);
      const getNs = bindMoneyInput(f.elements.nganSach, $('#ns-hint', el));
      const save = async () => {
        const data = { ma: f.elements.ma.value.trim(), ten: f.elements.ten.value.trim(), nganSach: getNs(), trangThai: f.elements.trangThai.value, ghiChu: f.elements.ghiChu.value.trim(),
          ngayKhoiCong: f.elements.ngayKhoiCong.value, diaChi: f.elements.diaChi.value.trim() };
        if (!data.ma) return fieldError(f.elements.ma, 'Nhập mã công trình');
        if (!data.ten) return fieldError(f.elements.ten, 'Nhập tên công trình');
        if (isNaN(data.nganSach)) return fieldError(f.elements.nganSach, 'Ngân sách không hợp lệ. Ví dụ: 500tr, 1.200.000.000');
        const done = busy(el.querySelector('[data-act=save]'), 'Đang lưu…');
        try {
          const r = isEdit ? await api('PUT', '/api/projects/' + p.id, data) : await api('POST', '/api/projects', data);
          toast(isEdit ? 'Đã lưu công trình' + (r.renamed ? ', cập nhật mã trên ' + r.renamed + ' dòng sổ' : '') : 'Đã thêm công trình ' + data.ma);
          h.close();
          if (onSaved) onSaved(data);
        } catch (err) { done(); showError(err); }
      };
      el.addEventListener('click', (ev) => {
        const a = ev.target.closest('[data-act]');
        if (!a) return;
        if (a.dataset.act === 'cancel') h.close();
        if (a.dataset.act === 'save') save();
      });
      f.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); save(); } });
    }
  });
}

/* ============================== NHÀ CUNG CẤP ============================== */

export function openSupplierForm(s, onSaved) {
  const isEdit = !!(s && s.id);
  s = Object.assign({ ma: '', ten: '', loai: '', sdt: '', diaChi: '', ghiChu: '' }, s || {});
  const used = isEdit ? S.all.entries.filter((e) => KT.keyOf(e.maNCC) === KT.keyOf(s.ma)).length : 0;
  const types = Array.from(new Set(S.db.suppliers.map((x) => x.loai).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'vi'));
  openModal({
    title: isEdit ? 'Sửa ' + s.ma : 'Thêm nhà cung cấp, đối tượng',
    body:
      '<form class="grid grid-cols-2 gap-x-5 gap-y-4 max-sm:grid-cols-1" id="s-form" novalidate autocomplete="off">' +
      '<datalist id="dl-types">' + types.map((t) => '<option value="' + esc(t) + '">').join('') + '</datalist>' +
      '<label class="field"><span class="label">Mã <b class="req">*</b></span><input name="ma" class="input" value="' + esc(s.ma) + '" placeholder="VD: NCC_HoaLan" required>' +
      '<span class="hint">' + (used ? 'Đổi mã sẽ cập nhật ' + used + ' dòng sổ đang dùng mã này' : 'Nên đặt dạng NCC_TenNgan') + '</span></label>' +
      '<label class="field"><span class="label">Loại đối tượng</span><input name="loai" class="input" list="dl-types" value="' + esc(s.loai) + '" placeholder="Vật tư, nhân công, chủ thầu"></label>' +
      '<label class="field col-span-2 max-sm:col-span-1"><span class="label">Tên nhà cung cấp, đối tượng <b class="req">*</b></span><input name="ten" class="input" value="' + esc(s.ten) + '" required></label>' +
      '<label class="field"><span class="label">Số điện thoại</span><input name="sdt" class="input" value="' + esc(s.sdt) + '" inputmode="tel"></label>' +
      '<label class="field"><span class="label">Địa chỉ</span><input name="diaChi" class="input" value="' + esc(s.diaChi) + '"><span class="hint">Được in lên phiếu chi</span></label>' +
      '<label class="field col-span-2 max-sm:col-span-1"><span class="label">Ghi chú</span><input name="ghiChu" class="input" value="' + esc(s.ghiChu) + '"></label>' +
      '</form>',
    footer: '<span class="flex-1"></span><button type="button" class="btn btn-ghost" data-act="cancel">Hủy</button><button type="button" class="btn btn-primary" data-act="save">' + (isEdit ? 'Lưu thay đổi' : 'Thêm nhà cung cấp') + '</button>',
    onMount(el, h) {
      const f = $('#s-form', el);
      const save = async () => {
        const data = {};
        ['ma', 'ten', 'loai', 'sdt', 'diaChi', 'ghiChu'].forEach((k) => { data[k] = f.elements[k].value.trim(); });
        if (!data.ma) return fieldError(f.elements.ma, 'Nhập mã nhà cung cấp');
        if (!data.ten) return fieldError(f.elements.ten, 'Nhập tên nhà cung cấp');
        const done = busy(el.querySelector('[data-act=save]'), 'Đang lưu…');
        try {
          const r = isEdit ? await api('PUT', '/api/suppliers/' + s.id, data) : await api('POST', '/api/suppliers', data);
          toast(isEdit ? 'Đã lưu ' + data.ma + (r.renamed ? ', cập nhật mã trên ' + r.renamed + ' dòng sổ' : '') : 'Đã thêm ' + data.ma);
          h.close();
          if (onSaved) onSaved(data);
        } catch (err) { done(); showError(err); }
      };
      el.addEventListener('click', (ev) => {
        const a = ev.target.closest('[data-act]');
        if (!a) return;
        if (a.dataset.act === 'cancel') h.close();
        if (a.dataset.act === 'save') save();
      });
      f.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); save(); } });
    }
  });
}
