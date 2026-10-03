/* In phiếu thu/chi (A4, 2 liên) và in báo cáo đang xem. */
import { $, esc, money } from './ui.js';

const KT = window.KT;

function part(v, s, lien) {
  const thu = v.loai === 'thu';
  const signs = [['Giám đốc', s.giamDoc]];
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

// In một tài liệu A4 dọc bất kỳ (phiếu nhập chi phí, biên bản đối chiếu công nợ…): html là phần thân, dùng lớp .bb-t cho bảng kê
export function printHtml(html) {
  const root = $('#print-root');
  root.innerHTML = '<div class="vc-page bb">' + html + '</div>';
  document.body.classList.add('printing-doc');
  setTimeout(() => window.print(), 50);
}

// Phiếu nhập chi phí (một chuyến hàng / một hóa đơn): đầu phiếu, bảng dòng hàng, tổng, bằng chữ, chỗ ký
export function printSlip(slip, lines, settings) {
  const sl = (c) => (c.soLuong == null || c.soLuong === '' ? '' : KT.fmtQty(c.soLuong));
  const dg = (c) => (KT.isKhoan(c) ? 'theo khoản' : money(c.donGia));
  const total = lines.reduce((t, c) => t + (c.thanhTien || 0), 0);
  printHtml(
    '<div class="vc-top"><div class="vc-org"><div class="vc-company">' + esc(settings.tenDonVi || '') + '</div><div>' + esc(settings.diaChi || '') + '</div></div>' +
    '<div class="vc-meta"><div class="vc-so">Số phiếu: ' + esc(slip.soPhieu || '................') + '</div><div>Ngày: ' + esc(KT.fmtDate(slip.ngay)) + '</div></div></div>' +
    '<div class="vc-title">PHIẾU NHẬP CHI PHÍ CÔNG TRÌNH</div>' +
    '<div class="vc-date">' + esc(KT.ngayChu(slip.ngay)) + '</div>' +
    '<p><b>Công trình:</b> ' + esc(slip.maCT) + (slip.tenCT ? ' – ' + esc(slip.tenCT) : '') + (slip.maNha ? ' · Nhà/lô: ' + esc(slip.maNha) : '') + '</p>' +
    '<p><b>Nhà cung cấp:</b> ' + esc(slip.tenNCC || slip.maNCC || '') + (slip.maNCC ? ' (' + esc(slip.maNCC) + ')' : '') + '</p>' +
    '<table class="bb-t"><thead><tr><th>STT</th><th>Mã VT</th><th>Tên vật tư / diễn giải</th><th>ĐVT</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th><th>Hạng mục</th></tr></thead><tbody>' +
    lines.map((c, i) => '<tr><td class="r">' + (i + 1) + '</td><td>' + esc(c.maVT || '') + '</td><td>' + esc((c.tenVT || '') + (c.tenVT && c.dienGiai ? ' – ' : '') + (c.dienGiai || '')) + '</td><td>' + esc(c.dvt || '') +
      '</td><td class="r">' + sl(c) + '</td><td class="r">' + dg(c) + '</td><td class="r">' + money(c.thanhTien) + '</td><td>' + esc(c.tenHM || c.maHM || '') + '</td></tr>').join('') +
    '<tr class="b"><td colspan="6">Cộng ' + lines.length + ' dòng</td><td class="r">' + money(total) + '</td><td></td></tr></tbody></table>' +
    '<p><b>Bằng chữ:</b> <i>' + esc(KT.docTienBangChu(total)) + '</i></p>' +
    '<div class="vc-signs" style="grid-template-columns:repeat(3,1fr)">' +
    [['Người lập phiếu', settings.nguoiLap], ['Kế toán', settings.keToanTruong], ['Giám đốc', settings.giamDoc]].map(([t, n]) => '<div class="vc-sign"><b>' + esc(t) + '</b><i>(Ký, họ tên)</i><span class="vc-name">' + esc(n || '') + '</span></div>').join('') + '</div>');
}

// In màn hình hiện tại (báo cáo / sổ). Thêm tiêu đề đơn vị + tên báo cáo.
export function printView(title, subtitle, settings) {
  const head = $('#print-head');
  head.innerHTML = '<div class="ph-org"><b>' + esc(settings.tenDonVi || '') + '</b><br>' + esc(settings.diaChi || '') + '</div>' +
    '<h1>' + esc(title) + '</h1>' + (subtitle ? '<div class="ph-sub">' + esc(subtitle) + '</div>' : '') +
    '<div class="ph-date">Ngày in: ' + esc(KT.fmtDate(KT.todayISO())) + ' ' + String(new Date().getHours()).padStart(2, '0') + ':' + String(new Date().getMinutes()).padStart(2, '0') + '</div>';
  document.body.classList.add('printing-view');
  setTimeout(() => window.print(), 50);
}
