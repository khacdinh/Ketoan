/* Khung ứng dụng: điều hướng, thanh trên cùng, tải dữ liệu. */
import { $, esc, api, onDatabase, showError, icon, attachMenu, download, hasOpenModal, dangCheDangNhap, LS, datMau, setPageActions, openModal } from './ui.js';
import { S, setDb, onChange, vouchers, anomalies, saveFilter } from './state.js';
import { veChonCongTrinh, moChonCongTrinh } from './ctpick.js';
import { apDungLienKet } from './lienket.js';
import { moTimKiem } from './search.js';
import { openEntryForm, renderEntryPage } from './forms.js';
import { renderDashboard } from './views/dashboard.js';
import { renderLedger } from './views/ledger.js';
import { renderVouchers } from './views/vouchers.js';
import { renderProjects, renderSuppliers } from './views/catalogs.js';
import { renderSettings } from './views/settings.js';
import { renderCostEntry } from './views/cost-entry.js';
import { renderCostLedger } from './views/cost-ledger.js';
import { renderAnalytics } from './views/analytics.js';
import { renderCostDashboard, renderCostDetail, renderPrices } from './views/cost-reports.js';
import { renderDebt } from './views/debt.js';
import { renderCostCatalogs } from './views/cost-catalogs.js';
import { renderControl } from './views/control.js';
import { renderMerge } from './merge.js';
import { renderUsers } from './views/users.js';
import { renderOpeningBalances } from './sodudau.js';
import { renderSupplierLedger } from './views/supplier-ledger.js';
import { renderImportPage } from './views/settings.js';
import { renderNumbering } from './views/numbering.js';
import { renderDebtByProject } from './views/debt-project.js';
import { A, napTrangThai, dangNhap, doiMatKhauBatBuoc, coQuyen, onAuthChange, khoaManHinh } from './auth.js';

const KT = window.KT;

const ROUTES = {
  'tong-quan': { title: 'Tổng quan', sub: 'Quỹ tiền mặt và chi phí các công trình', render: renderDashboard },
  'so-thu-chi': { title: 'Sổ quỹ thu chi', sub: 'Nhật ký thu, chi và tồn quỹ hằng ngày. Bấm đúp một dòng để sửa.', render: renderLedger },
  'phieu': { title: 'Phiếu thu / chi', sub: 'Các dòng sổ quỹ cùng số phiếu được gộp lại để in 2 liên.', render: renderVouchers },
  'du-an': { title: 'Công trình', sub: 'Mã công trình và ngân sách phê duyệt', render: renderProjects },
  'ncc': { title: 'Nhà cung cấp và đối tượng', sub: 'Nhà cung cấp, thầu phụ, nhân viên, người nhận tiền', render: renderSuppliers },
  'tong-hop-ncc': { title: 'Công nợ nhà cung cấp theo kỳ', sub: 'Số dư đầu kỳ + phát sinh − thanh toán = số dư cuối kỳ', render: renderDebt },
  'cai-dat': { title: 'Cài đặt và dữ liệu', sub: 'Thông tin in trên phiếu, sao lưu, khôi phục, xóa dữ liệu', render: renderSettings },
  'danh-so': { title: 'Đánh số chứng từ', sub: 'Tiền tố, số tiếp theo, độ dài, hậu tố của phiếu thu, phiếu chi, ủy nhiệm chi, phiếu mua vật tư, biên bản', render: renderNumbering },
  'nhap-excel': { title: 'Nhập từ Excel', sub: 'Đưa dữ liệu từ file Excel vào sổ (xem trước, rồi mới ghi)', render: renderImportPage },
  'so-du-dau': { title: 'Số dư đầu kỳ nhà cung cấp', sub: 'Công nợ có từ trước khi ghi sổ trong phần mềm: còn nợ hoặc đã ứng trước', render: renderOpeningBalances },
  'so-chi-tiet-ncc': { title: 'Sổ chi tiết công nợ', sub: 'Từng chứng từ của một nhà cung cấp, số dư lũy kế', render: renderSupplierLedger },
  // Chi phí công trình
  'cp-tong-hop': { title: 'Tổng hợp chi phí công trình', sub: 'Tổng chi phí theo loại, nhóm, hạng mục và theo tháng', render: renderCostDashboard },
  'cp-nhap': { title: 'Phiếu nhập chi phí', sub: 'Khai báo đầu phiếu một lần, nhập nhiều dòng (số lượng × đơn giá, hoặc chỉ thành tiền)', render: renderCostEntry },
  'ghi-thu-chi': { title: 'Ghi thu / chi', sub: 'Phiếu thu, phiếu chi nhiều dòng; mỗi dòng một công trình', render: renderEntryPage },
  'cp-so': { title: 'Sổ chi phí', sub: 'Nhật ký chung các dòng chi phí công trình', render: renderCostLedger },
  'phan-tich': { title: 'Phân tích', sub: 'Chọn chỉ số, chia theo hàng / cột, lọc; tuổi nợ, công nợ theo tháng, xuất dữ liệu cho BI', render: renderAnalytics },
  'cp-chi-tiet': { title: 'Chi phí theo nhóm', sub: 'Nhóm, hạng mục, từng dòng; bung hoặc thu gọn 3 cấp', render: renderCostDetail },
  'cong-no-ct': { title: 'Công nợ theo công trình', sub: 'Công trình nào còn nợ nhà cung cấp nào, bao nhiêu', render: renderDebtByProject },
  'cp-cong-no': { title: 'Công nợ nhà cung cấp theo kỳ', sub: 'Số dư đầu kỳ + phát sinh − thanh toán = số dư cuối kỳ', render: renderDebt },
  'cp-gia': { title: 'Giá vật tư', sub: 'Lịch sử đơn giá theo vật tư và nhà cung cấp', render: renderPrices },
  'cp-danh-muc': { title: 'Danh mục chi phí', sub: 'Nhóm chi phí, hạng mục, vật tư, nhà và khu', render: renderCostCatalogs },
  // Kiểm soát sổ sách (nhóm độ chính xác và truy vết)
  'kiem-soat': { title: 'Kiểm soát sổ sách', sub: 'Nhật ký thay đổi, thùng rác và các việc cần xử lý để số liệu luôn đúng', render: renderControl },
  'gop-ma': { title: 'Gộp mã', sub: 'Đưa các mã trùng (NCC, vật tư, hạng mục, nhà, công trình) về một mã, có xem trước và hoàn tác', render: renderMerge },
  'nguoi-dung': { title: 'Người dùng', sub: 'Tài khoản, vai trò, mở khóa, đặt lại mật khẩu, sự kiện bảo mật', render: renderUsers }
};
// Menu: nhóm theo trình tự công việc. Mỗi mục: [đường dẫn, biểu tượng Lucide, tên, phím tắt (chỉ hiện ở chú thích), tab]; tab = mở sẵn tab của danh mục chi phí
const NAV = [
  { items: [['tong-quan', 'ph-layout-dashboard', 'Tổng quan']] },
  { head: 'Nhập liệu', items: [['cp-nhap', 'ph-file-plus', 'Phiếu nhập chi phí', 'F2'], ['ghi-thu-chi', 'ph-arrow-left-right', 'Ghi thu / chi', 'F3'], ['nhap-excel', 'ph-file-spreadsheet', 'Nhập từ Excel']] },
  { head: 'Sổ sách', items: [['so-thu-chi', 'ph-wallet', 'Sổ quỹ thu chi'], ['phieu', 'ph-receipt', 'Phiếu thu / chi'], ['cp-so', 'ph-book-open', 'Sổ chi phí']] },
  // Công nợ nhà cung cấp: gom một chỗ (theo kỳ, theo công trình, sổ chi tiết, số dư đầu kỳ)
  { head: 'Công nợ', items: [['cp-cong-no', 'ph-scale', 'Công nợ NCC theo kỳ'], ['cong-no-ct', 'ph-table', 'Công nợ theo công trình'], ['so-chi-tiet-ncc', 'ph-list', 'Sổ chi tiết NCC'], ['so-du-dau', 'ph-flag', 'Số dư đầu kỳ NCC']] },
  { head: 'Báo cáo', items: [['phan-tich', 'ph-chart-line-up', 'Phân tích'], ['cp-chi-tiet', 'ph-chart-pie', 'Chi phí theo nhóm'], ['cp-tong-hop', 'ph-target', 'Tổng hợp chi phí'], ['cp-gia', 'ph-trending-up', 'Giá vật tư']] },
  { head: 'Danh mục', items: [['du-an', 'ph-building-2', 'Công trình, nhà/lô'], ['ncc', 'ph-truck', 'NCC, đối tượng'], ['cp-danh-muc', 'ph-package', 'Vật tư, hạng mục', '', 'vat-tu'], ['gop-ma', 'ph-merge', 'Gộp mã']] },
  { head: 'Hệ thống', items: [['kiem-soat', 'ph-shield-check', 'Kiểm soát'], ['cai-dat', 'ph-database', 'Cài đặt, sao lưu'], ['danh-so', 'ph-file-text', 'Đánh số chứng từ'], ['nguoi-dung', 'ph-users', 'Người dùng']] }
];
// Màn hình cần quyền riêng (đăng nhập bật). Không có quyền: ẩn khỏi menu, mở bằng đường dẫn thì báo không có quyền.
const QUYEN_MAN = { 'gop-ma': 'gop-ma', 'cp-nhap': 'ghi', 'ghi-thu-chi': 'ghi', 'nguoi-dung': 'quan-ly-nguoi-dung', 'nhap-excel': 'nhap-excel' };
const duocMo = (k) => (k !== 'nguoi-dung' || A.bat) && (!QUYEN_MAN[k] || coQuyen(QUYEN_MAN[k]));

function current() {
  const k = location.hash.replace(/^#\/?/, '').split('?')[0];
  return ROUTES[k] ? k : 'tong-quan';
}

// Menu bên trái (vẽ lại khi trạng thái đăng nhập / vai trò đổi)
function veNav() {
  $('#nav').innerHTML = NAV.map((g) => {
    const items = g.items.filter((it) => it[0].startsWith('@') || duocMo(it[0]));
    if (!items.length) return '';
    return '<div class="nav-group">' + (g.head ? '<div class="nav-head">' + esc(g.head) + '</div>' : '') + items.map((it) => {
      const [k, icono, label, key, tab] = it;
      const act = k.startsWith('@');
      return '<a href="' + (act ? '#' : '#/' + k) + '" class="nav-item" data-route="' + esc(k) + '"' + (tab ? ' data-tab="' + tab + '"' : '') + ' data-tip="' + esc(label + (key ? ' (' + key + ')' : '')) + '" aria-label="' + esc(label) + '">' +
        '<i class="ph ' + icono + '" aria-hidden="true"></i><span class="nav-label">' + esc(label) + '</span>' +
        (k === 'kiem-soat' ? '<span class="nav-badge" id="nav-badge" hidden></span>' : '') + '</a>';
    }).join('') + '</div>';
  }).join('');
  capNhatTip();
}

function renderShell() {
  veNav();

  attachMenu($('#btn-export'), () => {
    const f = S.filters.so;
    const q = ['from', 'to', 'duAn', 'ncc', 'loai', 'q'].filter((k) => f[k]).map((k) => k + '=' + encodeURIComponent(f[k])).join('&');
    const d = S.filters.dash;
    const dq = ['from', 'to'].filter((k) => d[k]).map((k) => k + '=' + d[k]).join('&');
    const t = S.filters.thncc;
    const tq = ['from', 'to'].filter((k) => t[k]).map((k) => k + '=' + t[k]).concat(t.chiCoPhatSinh ? ['chiCoPhatSinh=1'] : []).join('&');
    const v = S.selectedVoucher && vouchers().find((x) => x.key === S.selectedVoucher);
    return [
      { icon: 'excel', label: 'Toàn bộ sổ sách', hint: 'Đủ các sheet như file gốc, giữ nguyên công thức', action: () => download('/api/export/full') },
      { sep: true },
      { icon: 'book', label: 'Sổ thu chi', hint: q ? 'Theo bộ lọc đang chọn ở màn hình Sổ thu chi' : 'Toàn bộ sổ', action: () => download('/api/export/ledger?' + q) },
      { icon: 'hardhat', label: 'Chi phí theo công trình', hint: 'Tổng hợp và chi tiết. ' + KT.describeRange(d.from, d.to), action: () => download('/api/export/projects?' + dq) },
      { icon: 'contacts', label: 'Thanh toán theo nhà cung cấp', hint: 'Tổng hợp và chi tiết. ' + KT.describeRange(t.from, t.to), action: () => download('/api/export/suppliers?' + tq) },
      { icon: 'receipt', label: v ? 'Phiếu ' + v.soPhieu : 'Phiếu thu, phiếu chi', hint: v ? 'Phiếu đang chọn, 2 liên' : 'Chọn một phiếu ở màn hình Phiếu trước', disabled: !v, action: () => download('/api/export/voucher?so=' + encodeURIComponent(v.soPhieu)) },
      { sep: true },
      { icon: 'crane', label: 'Chi phí công trình', hint: 'Đủ các sheet như file ChiPhi_CongTrinh: TONGHOP, NHATKYCHUNG, CHI_TIET_THEO_NHOM, CONGNO_NCC... giữ công thức', action: () => download('/api/export/costs') },
      { icon: 'rows', label: 'Sổ chi phí', hint: 'Theo bộ lọc đang chọn ở màn hình Sổ chi phí', action: () => download('/api/export/cost-ledger?' + ['from', 'to', 'ct', 'nha', 'nhom', 'hm', 'loai', 'ncc', 'vt', 'q'].filter((k) => S.filters.cpSo[k]).map((k) => k + '=' + encodeURIComponent(S.filters.cpSo[k])).join('&')) },
      { icon: 'scales', label: 'Công nợ nhà cung cấp', hint: S.filters.cpCn.ct ? 'Công trình ' + S.filters.cpCn.ct : 'Tất cả công trình', action: () => { const c = S.filters.cpCn; download('/api/export/cost-debt?' + [c.ct ? 'ct=' + encodeURIComponent(c.ct) : ''].concat((c.nccs || []).map((x) => 'ncc=' + encodeURIComponent(x)), [c.tt ? 'tt=' + c.tt : '', c.to ? 'to=' + c.to : '']).filter(Boolean).join('&')); } }
    ];
  });
  $('#btn-new').addEventListener('click', () => openEntryForm(null));
  $('#btn-phieu').addEventListener('click', () => { location.hash = '#/cp-nhap'; });
  $('#tb-search').addEventListener('click', moTimKiem);
  $('#tb-ct').addEventListener('click', moChonCongTrinh);
  $('#side-toggle').addEventListener('click', doiMenu);
  $('#nav').addEventListener('click', (e) => {
    const a = e.target.closest('a.nav-item');
    if (!a) return;
    if (a.dataset.route === 'ghi-thu-chi') { e.preventDefault(); openEntryForm(null); return; }
    if (a.dataset.tab) { S.filters.cpDm.tab = a.dataset.tab; saveFilter('cpDm'); if (current() === 'cp-danh-muc') render(); }
  });
  $('#bn-ghi').addEventListener('click', moGhi);
  $('#bn-them').addEventListener('click', moMenuDayDu);
  window.matchMedia('(max-width: 767px)').addEventListener('change', () => { if (S.db) render(); });
  datMau(LS.get('density', 'gon'));
  thuGonMenu(LS.get(khoaMenu(), LS.get('side-thu', false)), true);
  window.matchMedia('(max-width: 1023px)').addEventListener('change', capNhatTip);
}

// Trạng thái thu gọn lưu theo người dùng (khi đăng nhập bật) hoặc theo máy
const khoaMenu = () => 'side-thu' + (A.bat && A.nguoiDung ? '.' + A.nguoiDung.id : '');
const menuHep = () => window.matchMedia('(max-width: 1023px)').matches;
// Chú thích (tooltip) tên mục: chỉ khi menu thu gọn (hoặc cửa sổ hẹp), vì khi mở rộng tên đã hiện ngay trên mục
function capNhatTip() {
  const thu = document.body.classList.contains('side-thu') || menuHep();
  document.querySelectorAll('#nav .nav-item').forEach((a) => { if (thu) a.title = a.dataset.tip || ''; else a.removeAttribute('title'); });
}
function thuGonMenu(on, khongLuu) {
  document.body.classList.toggle('side-thu', !!on);
  if (!khongLuu) LS.set(khoaMenu(), !!on);
  const t = $('#side-toggle');
  if (t) {
    const nhan = on ? 'Mở rộng menu (Ctrl B)' : 'Thu gọn menu (Ctrl B)';
    t.setAttribute('aria-label', nhan); t.title = nhan;
    t.querySelector('i').className = on ? 'ph ph-panel-left-open' : 'ph ph-panel-left-close';
  }
  capNhatTip();
}
function doiMenu() { thuGonMenu(!document.body.classList.contains('side-thu')); }

// Điện thoại: nút "Ghi" hỏi ghi gì; nút "Thêm" liệt kê toàn bộ chức năng (menu bên trái ẩn đi)
function moGhi() {
  const m = openModal({
    title: 'Ghi gì?',
    size: 'small',
    body: '<div class="flex flex-col gap-2.5"><button type="button" class="btn btn-primary !h-12 w-full" data-go="thu-chi">' + icon('plus') + 'Ghi thu / chi</button>' +
      '<button type="button" class="btn btn-secondary !h-12 w-full" data-go="phieu">' + icon('plus') + 'Phiếu nhập chi phí</button></div>',
    onMount(el, h) {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-go]');
        if (!b) return;
        h.close();
        if (b.dataset.go === 'thu-chi') openEntryForm(null); else location.hash = '#/cp-nhap';
      });
    }
  });
  return m;
}
function moMenuDayDu() {
  openModal({
    title: 'Tất cả chức năng',
    size: 'small',
    body: NAV.map((g) => '<div class="mb-3">' + (g.head ? '<div class="mb-1 text-[11px] font-bold text-ink-3">' + esc(g.head) + '</div>' : '') +
      g.items.filter((it) => it[0].startsWith('@') || duocMo(it[0])).map(([k, icono, label, , tab]) =>
        '<a href="' + (k.startsWith('@') ? '#' : '#/' + k) + '" data-route="' + esc(k) + '"' + (tab ? ' data-tab="' + tab + '"' : '') + ' class="flex h-12 items-center gap-3 border-b border-rule px-1 text-[15px]"><i class="ph ' + icono + ' text-[18px] text-neutral-700" aria-hidden="true"></i>' + esc(label) + '</a>').join('') + '</div>').join(''),
    onMount(el, h) {
      el.addEventListener('click', (e) => {
        const a = e.target.closest('a[data-route]');
        if (!a) return;
        if (a.dataset.route === 'ghi-thu-chi') { e.preventDefault(); h.close(); openEntryForm(null); return; }
        if (a.dataset.tab) { S.filters.cpDm.tab = a.dataset.tab; saveFilter('cpDm'); }
        h.close();
      });
    }
  });
}

let lastRoute = null;

function render() {
  if (!S.db) return;
  const k = current();
  apDungLienKet(k); // link có "?ct=…&ncc=…": đặt bộ lọc của màn hình trước khi vẽ
  const r = ROUTES[k];
  document.querySelectorAll('.nav-item').forEach((a) => {
    const on = a.dataset.route === k;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.querySelectorAll('#bottom-nav [data-bn]').forEach((a) => { const on = a.dataset.bn === k; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  $('#page-title').textContent = r.title;
  $('#page-sub').textContent = r.sub;
  $('#page-tags').innerHTML = '';
  setPageActions('');
  veChonCongTrinh();
  document.title = r.title + ' | Kế Toán Công Trình';
  const keepScroll = lastRoute === k ? window.scrollY : 0;
  if (!duocMo(k)) {
    $('#view').innerHTML = '<div class="sheet p-6"><p class="font-semibold">Tài khoản của bạn không có quyền mở màn hình này.</p><p class="mt-1 text-ink-2">Hỏi người có vai trò Chủ nếu cần.</p></div>';
    lastRoute = k;
    updateFooter();
    return;
  }
  r.render($('#view'));
  window.scrollTo(0, lastRoute === k ? keepScroll : 0);
  lastRoute = k;
  updateFooter();
  scheduleBadge();
}

// Số cảnh báo chưa xử lý trên menu: tính sau khi đã vẽ xong màn hình để không làm chậm thao tác
let badgeTimer = null;
function scheduleBadge() {
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => {
    const b = $('#nav-badge');
    if (!b || !S.all) return;
    const n = anomalies().open;
    b.hidden = !n;
    b.textContent = n > 99 ? '99+' : String(n);
    b.title = n + ' việc cần xử lý';
    b.closest('a').setAttribute('aria-label', 'Kiểm soát sổ sách' + (n ? ', ' + n + ' việc cần xử lý' : ''));
  }, 60);
}

function updateFooter() {
  const s = S.db.settings;
  $('#org-name').textContent = s.tenDonVi || 'Chưa đặt tên đơn vị';
  const ton = S.ledger.length ? S.ledger[S.ledger.length - 1].ton : 0;
  $('#side-fund').innerHTML = '<div class="fund' + (ton < 0 ? ' neg' : '') + '">' + KT.fmtMoney(ton) + ' đ</div>';
  const t = S.savedAt;
  $('#save-state').textContent = t ? 'lưu ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') : '';
}

window.addEventListener('hashchange', render);

// Khung bảng cuộn được: cho phép dùng bàn phím (Tab vào rồi ← →) khi bên trong không có ô/nút nào nhận tiêu điểm
function enhanceScrollers() {
  document.querySelectorAll('#view :is(.overflow-x-auto, .overflow-auto, .table-scroll):not([data-sx])').forEach((el) => {
    if (!el.querySelector(':scope > table')) return;
    el.dataset.sx = '1';
    if (el.querySelector('a[href], button, input, select, textarea, [tabindex]')) return;
    el.tabIndex = 0;
    el.setAttribute('role', 'region');
    const h = el.closest('section') && el.closest('section').querySelector('h2, h3');
    el.setAttribute('aria-label', (h ? h.textContent + ': ' : '') + 'bảng, dùng phím mũi tên để cuộn');
  });
}
let sxPending = false;
new MutationObserver(() => {
  if (sxPending) return;
  sxPending = true;
  requestAnimationFrame(() => { sxPending = false; enhanceScrollers(); });
}).observe(document.getElementById('view').parentNode, { childList: true, subtree: true });

// Chỉ xem: bấm đúp một dòng không mở form sửa (nút sửa đã ẩn); máy chủ vẫn là nơi chặn thật
document.addEventListener('dblclick', (e) => {
  if (!coQuyen('ghi') && e.target.closest && e.target.closest('#view')) { e.stopPropagation(); e.preventDefault(); }
}, true);

document.addEventListener('keydown', (e) => {
  if (hasOpenModal() || dangCheDangNhap()) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); moTimKiem(); return; }
  if (ctrl && !e.altKey && !e.shiftKey && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); doiMenu(); return; }
  if (ctrl && !e.altKey && !e.shiftKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); if (A.bat && A.nguoiDung) khoaManHinh(); return; }
  if (!coQuyen('ghi') && (e.key === 'F2' || e.key === 'F3' || (e.altKey && (e.key === 'n' || e.key === 'N')))) { e.preventDefault(); return; }
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
  if (e.key === 'F2') {
    e.preventDefault();
    location.hash = '#/cp-nhap';
  } else if (e.key === 'F3' || (e.altKey && (e.key === 'n' || e.key === 'N'))) {
    e.preventDefault();
    openEntryForm(null);
  } else if (!typing && e.key === '/' && $('#view input[type=search]')) {
    e.preventDefault();
    $('#view input[type=search]').focus();
  }
});

// Vai trò Chỉ xem: dải báo xám có ổ khóa (các nút thêm / sửa / xóa đã ẩn, máy chủ vẫn chặn thật)
function veChiXem() {
  const ro = A.bat && A.nguoiDung && A.nguoiDung.vaiTro === 'chi-xem';
  $('#ro-root').innerHTML = ro ? '<div class="banner !bg-neutral-200 !text-ink px-[18px]" role="note">' + icon('lock') + '<span>Tài khoản này chỉ được <b>xem</b>: xem, lọc, tìm, in, xuất Excel. Không thêm, sửa, xóa được.</span></div>' : '';
}
onAuthChange(() => { veNav(); thuGonMenu(LS.get(khoaMenu(), LS.get('side-thu', false)), true); veChiXem(); if (S.db) render(); });

async function boot() {
  onDatabase(setDb);
  onChange(render);
  renderShell();
  try {
    // Đăng nhập đang bật: đăng nhập (và đổi mật khẩu nếu bị bắt buộc) TRƯỚC khi tải dữ liệu. Đang tắt: như trước, không thêm bước nào.
    await napTrangThai();
    if (A.bat && !A.nguoiDung) await dangNhap({});
    if (A.bat && A.nguoiDung && A.nguoiDung.phaiDoiMatKhau) await doiMatKhauBatBuoc();
    await api('GET', '/api/db');
  } catch (e) {
    $('#view').innerHTML = '<div class="sheet p-6"><p class="font-semibold text-alert">Không tải được dữ liệu</p><p class="mt-1 text-ink-2">' + esc(e.message) + '</p></div>';
    showError(e);
  }
}

boot();
