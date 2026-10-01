/* Khung ứng dụng: điều hướng, thanh trên cùng, tải dữ liệu. */
import { $, esc, api, onDatabase, showError, duo, attachMenu, download, hasOpenModal } from './ui.js';
import { S, setDb, onChange, vouchers, anomalies } from './state.js';
import { openEntryForm } from './forms.js';
import { renderDashboard } from './views/dashboard.js';
import { renderLedger } from './views/ledger.js';
import { renderVouchers } from './views/vouchers.js';
import { renderProjects, renderSuppliers, renderSupplierReport } from './views/catalogs.js';
import { renderSettings } from './views/settings.js';
import { renderCostEntry } from './views/cost-entry.js';
import { renderCostLedger } from './views/cost-ledger.js';
import { renderCostDashboard, renderCostDetail, renderDebt, renderPrices } from './views/cost-reports.js';
import { renderCostCatalogs } from './views/cost-catalogs.js';
import { renderControl } from './views/control.js';
import { renderMerge } from './merge.js';
import { A, napTrangThai, dangNhap, doiMatKhauBatBuoc, coQuyen, onAuthChange } from './auth.js';

const KT = window.KT;

const ROUTES = {
  'tong-quan': { title: 'Tổng quan', sub: 'Tình hình quỹ tiền mặt và chi phí các công trình', icon: 'dashboard', render: renderDashboard },
  'so-thu-chi': { title: 'Sổ thu chi', sub: 'Nhật ký thu, chi và tồn quỹ hằng ngày', icon: 'book', render: renderLedger },
  'phieu': { title: 'Phiếu thu, phiếu chi', sub: 'Các dòng cùng số phiếu được gộp lại để in 2 liên', icon: 'receipt', render: renderVouchers },
  'du-an': { title: 'Dự án', sub: 'Mã dự án và ngân sách phê duyệt', icon: 'hardhat', render: renderProjects },
  'ncc': { title: 'Nhà cung cấp và đối tượng', sub: 'Nhà cung cấp, thầu phụ, nhân viên, người nhận tiền', icon: 'contacts', render: renderSuppliers },
  'tong-hop-ncc': { title: 'Tổng hợp theo nhà cung cấp', sub: 'Đã thanh toán bao nhiêu cho từng nhà cung cấp', icon: 'bars', render: renderSupplierReport },
  'cai-dat': { title: 'Cài đặt và dữ liệu', sub: 'Thông tin in trên phiếu, nhập và xuất Excel, sao lưu', icon: 'gear', render: renderSettings },
  // Chi phí công trình
  'cp-tong-hop': { title: 'Chi phí công trình', sub: 'Tổng chi phí theo loại, nhóm, hạng mục và theo tháng', icon: 'crane', render: renderCostDashboard },
  'cp-nhap': { title: 'Phiếu nhập chi phí', sub: 'Khai báo đầu phiếu một lần, nhập nhiều dòng số lượng × đơn giá', icon: 'notePencil', render: renderCostEntry },
  'cp-so': { title: 'Sổ chi phí', sub: 'Nhật ký chung các dòng chi phí công trình', icon: 'table', render: renderCostLedger },
  'cp-chi-tiet': { title: 'Chi tiết chi phí theo nhóm', sub: 'Nhóm, hạng mục, từng dòng; bung hoặc thu gọn 3 cấp', icon: 'tree', render: renderCostDetail },
  'cp-cong-no': { title: 'Công nợ nhà cung cấp', sub: 'Chi phí phát sinh trừ số đã trả trong sổ thu chi', icon: 'scales', render: renderDebt },
  'cp-gia': { title: 'Giá vật tư', sub: 'Lịch sử đơn giá theo vật tư và nhà cung cấp', icon: 'tag', render: renderPrices },
  'cp-danh-muc': { title: 'Danh mục chi phí', sub: 'Nhóm chi phí, hạng mục, vật tư, nhà và khu', icon: 'squares', render: renderCostCatalogs },
  // Kiểm soát sổ sách (nhóm độ chính xác và truy vết)
  'kiem-soat': { title: 'Kiểm soát sổ sách', sub: 'Nhật ký thay đổi, thùng rác và các việc cần xử lý để số liệu luôn đúng', icon: 'shield', render: renderControl },
  'gop-ma': { title: 'Gộp mã', sub: 'Đưa các mã trùng (NCC, vật tư, hạng mục, nhà, dự án) về một mã — có xem trước và hoàn tác', icon: 'merge', render: renderMerge }
};
const NAV_LABEL = {
  'tong-quan': 'Tổng quan',
  'so-thu-chi': 'Sổ thu chi',
  'phieu': 'Phiếu thu, chi',
  'du-an': 'Dự án',
  'ncc': 'Nhà cung cấp',
  'tong-hop-ncc': 'Tổng hợp NCC',
  'cai-dat': 'Cài đặt',
  'cp-tong-hop': 'Tổng hợp chi phí',
  'cp-nhap': 'Phiếu nhập chi phí',
  'cp-so': 'Sổ chi phí',
  'cp-chi-tiet': 'Chi tiết theo nhóm',
  'cp-cong-no': 'Công nợ NCC',
  'cp-gia': 'Giá vật tư',
  'cp-danh-muc': 'Danh mục chi phí',
  'kiem-soat': 'Kiểm soát',
  'gop-ma': 'Gộp mã'
};
const NAV = [['tong-quan', 'so-thu-chi', 'phieu'], ['du-an', 'ncc', 'tong-hop-ncc'],
  ['cp-tong-hop', 'cp-nhap', 'cp-so', 'cp-chi-tiet', 'cp-cong-no', 'cp-gia', 'cp-danh-muc'], ['kiem-soat', 'gop-ma', 'cai-dat']];
const NAV_HEAD = { 2: 'Chi phí công trình' };
// Màn hình cần quyền riêng (đăng nhập bật). Không có quyền: ẩn khỏi menu, mở bằng đường dẫn thì báo không có quyền.
const QUYEN_MAN = { 'gop-ma': 'gop-ma', 'cp-nhap': 'ghi' };
const duocMo = (k) => !QUYEN_MAN[k] || coQuyen(QUYEN_MAN[k]);

function current() {
  const k = location.hash.replace(/^#\/?/, '').split('?')[0];
  return ROUTES[k] ? k : 'tong-quan';
}

// Menu bên trái (vẽ lại khi trạng thái đăng nhập / vai trò đổi)
function veNav() {
  $('#nav').innerHTML = NAV.map((group, gi) =>
    (gi ? '<div class="nav-sep" aria-hidden="true"></div>' : '') +
    (NAV_HEAD[gi] ? '<div class="nav-head max-lg:sr-only">' + esc(NAV_HEAD[gi]) + '</div>' : '') +
    group.filter(duocMo).map((k) =>
      '<a href="#/' + k + '" class="nav-item max-lg:ml-2 max-lg:justify-center max-lg:px-0" data-route="' + k + '" title="' + esc(ROUTES[k].title) + '">' +
      duo(ROUTES[k].icon) + '<span class="max-lg:sr-only">' + esc(NAV_LABEL[k]) + '</span>' +
      (k === 'kiem-soat' ? '<span class="nav-badge" id="nav-badge" hidden></span>' : '') + '</a>').join('')
  ).join('');
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
      { icon: 'hardhat', label: 'Chi phí theo dự án', hint: 'Tổng hợp và chi tiết. ' + KT.describeRange(d.from, d.to), action: () => download('/api/export/projects?' + dq) },
      { icon: 'contacts', label: 'Thanh toán theo nhà cung cấp', hint: 'Tổng hợp và chi tiết. ' + KT.describeRange(t.from, t.to), action: () => download('/api/export/suppliers?' + tq) },
      { icon: 'receipt', label: v ? 'Phiếu ' + v.soPhieu : 'Phiếu thu, phiếu chi', hint: v ? 'Phiếu đang chọn, 2 liên' : 'Chọn một phiếu ở màn hình Phiếu trước', disabled: !v, action: () => download('/api/export/voucher?so=' + encodeURIComponent(v.soPhieu)) },
      { sep: true },
      { icon: 'crane', label: 'Chi phí công trình', hint: 'Đủ các sheet như file ChiPhi_CongTrinh: TONGHOP, NHATKYCHUNG, CHI_TIET_THEO_NHOM, CONGNO_NCC... giữ công thức', action: () => download('/api/export/costs') },
      { icon: 'rows', label: 'Sổ chi phí', hint: 'Theo bộ lọc đang chọn ở màn hình Sổ chi phí', action: () => download('/api/export/cost-ledger?' + ['from', 'to', 'ct', 'nha', 'nhom', 'hm', 'loai', 'ncc', 'vt', 'q'].filter((k) => S.filters.cpSo[k]).map((k) => k + '=' + encodeURIComponent(S.filters.cpSo[k])).join('&')) },
      { icon: 'scales', label: 'Công nợ nhà cung cấp', hint: S.filters.cpCn.ct ? 'Công trình ' + S.filters.cpCn.ct : 'Tất cả công trình', action: () => { const c = S.filters.cpCn; download('/api/export/cost-debt?' + [c.ct ? 'ct=' + encodeURIComponent(c.ct) : ''].concat((c.nccs || []).map((x) => 'ncc=' + encodeURIComponent(x)), [c.tt ? 'tt=' + c.tt : '', c.to ? 'to=' + c.to : '']).filter(Boolean).join('&')); } }
    ];
  });
  $('#btn-new').addEventListener('click', () => openEntryForm(null));
}

let lastRoute = null;

function render() {
  if (!S.db) return;
  const k = current();
  const r = ROUTES[k];
  document.querySelectorAll('.nav-item').forEach((a) => {
    const on = a.dataset.route === k;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('#page-title').textContent = r.title;
  $('#page-sub').textContent = r.sub;
  document.title = r.title + ' | Sổ Thu Chi';
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
  $('#side-fund').innerHTML = '<div class="text-[12px] text-cover-ink-2">Tồn quỹ hiện tại</div>' +
    '<div class="mt-0.5 text-[20px] font-semibold tabular-nums font-stretch-[110%] ' + (ton < 0 ? 'text-[#FFB4AB]' : 'text-white') + '">' +
    KT.fmtMoney(ton) + '<span class="ml-1 text-[12px] font-medium text-cover-ink-2">đ</span></div>';
  const t = S.savedAt;
  $('#save-state').textContent = t ? 'Đã lưu lúc ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') + ', ' + S.db.entries.length + ' dòng sổ' : '';
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
  if (hasOpenModal()) return;
  if (!coQuyen('ghi') && (e.key === 'F2' || e.key === 'F3' || (e.altKey && (e.key === 'n' || e.key === 'N')))) { e.preventDefault(); return; }
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
  if (e.key === 'F3') {
    e.preventDefault();
    location.hash = '#/cp-nhap';
  } else if (e.key === 'F2' || (e.altKey && (e.key === 'n' || e.key === 'N'))) {
    e.preventDefault();
    openEntryForm(null);
  } else if (!typing && e.key === '/' && $('#view input[type=search]')) {
    e.preventDefault();
    $('#view input[type=search]').focus();
  }
});

onAuthChange(() => { veNav(); if (S.db) render(); });

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
