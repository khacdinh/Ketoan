/* In phiếu thu/chi (A4, 2 liên) và in báo cáo đang xem. */
import { $, esc, money } from './ui.js';

const KT = window.KT;

function part(v, s, lien) {
  const thu = v.loai === 'thu';
  const signs = [['Giám đốc', s.giamDoc]];
  if (s.hienKeToanTruong) signs.push(['Kế toán trưởng', s.keToanTruong]);
  signs.push([thu ? 'Người nộp tiền' : 'Người nhận tiền', '']);
  signs.push(['Thủ quỹ', s.thuQuy]);
  return '<div class="vc">' +
    '<div class="vc-top">' +
    '<div class="vc-org"><div class="vc-company">' + esc(s.tenDonVi) + '</div><div>' + esc(s.diaChi) + '</div></div>' +
    '<div class="vc-meta"><div class="vc-lien">' + (lien === 1 ? 'LIÊN 1: lưu' : 'LIÊN 2: giao khách') + '</div>' +
    '<div>Quyển số: ................</div><div class="vc-so">Số: ' + esc(v.soPhieu) + '</div></div>' +
    '</div>' +
    '<div class="vc-title">' + (thu ? 'PHIẾU THU' : 'PHIẾU CHI') + '</div>' +
    '<div class="vc-date">' + esc(KT.ngayChu(v.ngay)) + '</div>' +
    '<div class="vc-body">' +
    '<div class="vc-row"><span class="vc-l">' + (thu ? 'Họ và tên người nộp tiền:' : 'Họ và tên người nhận tiền:') + '</span><span class="vc-v strong">' + esc(v.nguoiNhan) + '</span></div>' +
    '<div class="vc-row"><span class="vc-l">Địa chỉ:</span><span class="vc-v">' + esc(v.diaChi) + '</span></div>' +
    '<div class="vc-row vc-reason"><span class="vc-l">' + (thu ? 'Lý do nộp:' : 'Lý do chi:') + '</span><span class="vc-v">' + esc(v.lyDo) + '</span></div>' +
    '<div class="vc-row"><span class="vc-l">Số tiền:</span><span class="vc-v strong vc-amount">' + money(v.soTien) + ' đ</span>' +
    '<span class="vc-l vc-l2">Hình thức:</span><span class="vc-v vc-form">' + esc(v.hinhThuc) + '</span></div>' +
    '<div class="vc-row"><span class="vc-l">Bằng chữ:</span><span class="vc-v italic">' + esc(v.bangChu) + '</span></div>' +
    '<div class="vc-row"><span class="vc-l">Kèm theo:</span><span class="vc-v plain">' + esc(String(v.kemTheo || '').trim() || '................') + ' chứng từ gốc</span></div>' +
    '</div>' +
    '<div class="vc-date2">' + esc(KT.ngayChu(v.ngay)) + '</div>' +
    '<div class="vc-signs" style="grid-template-columns:repeat(' + signs.length + ',1fr)">' +
    signs.map(([t, n]) => '<div class="vc-sign"><b>' + esc(t) + '</b><i>(Ký, họ tên)</i><span class="vc-name">' + esc(n || '') + '</span></div>').join('') +
    '</div>' +
    '</div>';
}

export function voucherHtml(v, settings) {
  return '<div class="vc-page">' + part(v, settings, 1) +
    '<div class="vc-cut"><span>cắt theo đường này</span></div>' +
    part(v, settings, 2) + '</div>';
}

let cleanupTimer = null;
function cleanup() {
  document.body.classList.remove('printing-doc', 'printing-view');
  const root = $('#print-root');
  if (root) root.innerHTML = '';
}
window.addEventListener('afterprint', () => {
  clearTimeout(cleanupTimer);
  cleanupTimer = setTimeout(cleanup, 100);
});

export function printVoucher(v, settings) {
  const root = $('#print-root');
  root.innerHTML = voucherHtml(v, settings);
  document.body.classList.add('printing-doc');
  setTimeout(() => window.print(), 50);
}

// In màn hình hiện tại (báo cáo / sổ). Thêm tiêu đề đơn vị + tên báo cáo.
export function printView(title, subtitle, settings) {
  const head = $('#print-head');
  head.innerHTML = '<div class="ph-org"><b>' + esc(settings.tenDonVi || '') + '</b><br>' + esc(settings.diaChi || '') + '</div>' +
    '<h1>' + esc(title) + '</h1>' + (subtitle ? '<div class="ph-sub">' + esc(subtitle) + '</div>' : '');
  document.body.classList.add('printing-view');
  setTimeout(() => window.print(), 50);
}
