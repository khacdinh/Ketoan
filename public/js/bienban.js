/* Biên bản đối chiếu công nợ nhà cung cấp (A4 dọc, đen trắng): đầu đơn vị + quốc hiệu, Bên A / Bên B, bảng 4 mục (1 + 2 − 3 = 4),
 * bằng chữ, bảng kê chứng từ có lũy kế, điều khoản 07 ngày, chữ ký. Xem trước trong hộp thoại, in bằng nút In. */
import { $, esc, money, fdate, icon, openModal } from './ui.js';
import { S } from './state.js';
import { printHtml } from './print.js';
import { soChiTiet, tenNCC, ctNhan } from './congno.js';

const KT = window.KT;

const coNoText = (n) => (n === 0 ? '0' : money(Math.abs(n)) + (n > 0 ? ' (Dư Có)' : ' (Dư Nợ)'));
const coNoNgan = (n) => (n === 0 ? '0' : money(Math.abs(n)) + (n > 0 ? ' Có' : ' Nợ'));

export function bienBanHtml(ma, o) {
  const s = S.db.settings;
  const sup = S.db.suppliers.find((x) => KT.keyOf(x.ma) === KT.keyOf(ma)) || { ma, ten: ma };
  const d = soChiTiet(ma, o);
  const today = KT.todayISO();
  const ky = o.from || o.to ? 'từ ngày ' + (o.from ? fdate(o.from) : '…') + ' đến ngày ' + (o.to ? fdate(o.to) : fdate(today)) : 'từ đầu đến ngày ' + fdate(o.to || today);
  const so = 'ĐC-' + today.replace(/-/g, '').slice(0, 8) + '/' + String(ma).toUpperCase().slice(0, 12);
  const cuoi = d.cuoiKy;
  return (
    '<div class="bb-head"><div><div class="vc-company">' + esc(s.tenDonVi || '') + '</div><div>' + esc(s.diaChi || '') + '</div><div class="mt-2">Số: ' + esc(so) + '</div></div>' +
    '<div class="bb-qh"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><div><b>Độc lập – Tự do – Hạnh phúc</b></div><div class="bb-gach"></div></div></div>' +
    '<div class="vc-title bb-title">BIÊN BẢN ĐỐI CHIẾU CÔNG NỢ</div>' +
    '<div class="vc-date">Kỳ đối chiếu ' + esc(ky) + (o.ct ? ' · Công trình ' + esc(ctNhan(o.ct)) : '') + '</div>' +
    '<p>Hôm nay, ' + esc(KT.ngayChu(today).replace(/^Ngày /, 'ngày ')) + ', chúng tôi gồm:</p>' +
    '<p><b>BÊN A (bên mua): ' + esc(s.tenDonVi || '') + '</b><br>Địa chỉ: ' + esc(s.diaChi || '') + '<br>Đại diện: ' + esc(s.giamDoc ? 'Ông/Bà ' + s.giamDoc + ' – Giám đốc' : '................................') + (s.keToanTruong ? '; Kế toán: ' + esc(s.keToanTruong) : '') + '</p>' +
    '<p><b>BÊN B (nhà cung cấp): ' + esc(sup.ten) + '</b> (mã ' + esc(sup.ma) + ')<br>Địa chỉ: ' + esc(sup.diaChi || '................................') + (sup.sdt ? '<br>Điện thoại: ' + esc(sup.sdt) : '') + '<br>Đại diện: ................................</p>' +
    '<p>Hai bên cùng đối chiếu công nợ đến hết kỳ như sau:</p>' +
    '<table class="bb-t"><thead><tr><th style="width:9%">STT</th><th>Nội dung</th><th style="width:26%">Số tiền (đồng)</th></tr></thead><tbody>' +
    '<tr><td class="r">1</td><td>Số dư đầu kỳ</td><td class="r">' + esc(coNoText(d.per.dauKy)) + '</td></tr>' +
    '<tr><td class="r">2</td><td>Phát sinh trong kỳ (tiền hàng, chi phí bên A đã nhận)</td><td class="r">' + money(d.phatSinh) + '</td></tr>' +
    '<tr><td class="r">3</td><td>Bên A đã thanh toán trong kỳ</td><td class="r">' + money(d.thanhToan) + '</td></tr>' +
    '<tr class="b"><td class="r">4</td><td>Số dư cuối kỳ (4 = 1 + 2 − 3): ' + (cuoi > 0 ? 'Bên A còn phải trả Bên B' : cuoi < 0 ? 'Bên A đã ứng trước cho Bên B' : 'Hai bên đã tất toán') + '</td><td class="r">' + esc(coNoText(cuoi)) + '</td></tr></tbody></table>' +
    '<p><b>Bằng chữ:</b> <i>' + esc(cuoi === 0 ? 'Không đồng' : KT.docTienBangChu(Math.abs(cuoi))) + '</i></p>' +
    '<p><b>Bảng kê chứng từ trong kỳ:</b></p>' +
    '<table class="bb-t bb-ke"><thead><tr><th>Ngày</th><th>Chứng từ</th><th>Diễn giải</th><th>Phát sinh</th><th>Thanh toán</th><th>Số dư lũy kế</th></tr></thead><tbody>' +
    '<tr><td></td><td colspan="2"><b>Số dư đầu kỳ</b></td><td></td><td></td><td class="r nw">' + esc(coNoNgan(d.per.dauKy)) + '</td></tr>' +
    d.docs.map((x) => '<tr><td class="nw">' + esc(fdate(x.ngay)) + '</td><td class="nw">' + esc(x.kind === 'pn' ? 'Phiếu nhập ' + (x.ma || '') : x.kind === 'tt' ? (x.ma || 'Chi') : 'Ngoài quỹ') + '</td><td>' + esc((x.ct ? x.ct + ' – ' : '') + (x.dienGiai || '')) + '</td>' +
      '<td class="r">' + (x.phatSinh ? money(x.phatSinh) : '') + '</td><td class="r">' + (x.thanhToan ? money(x.thanhToan) : '') + '</td><td class="r">' + esc(coNoText(x.luyKe)) + '</td></tr>').join('') +
    '<tr class="b"><td colspan="3">Cộng ' + d.docs.length + ' chứng từ</td><td class="r">' + money(d.phatSinh) + '</td><td class="r">' + money(d.thanhToan) + '</td><td class="r nw">' + esc(coNoNgan(cuoi)) + '</td></tr></tbody></table>' +
    '<p>Nếu sau 07 ngày kể từ ngày nhận biên bản này mà Bên B không có ý kiến thì số liệu trên được coi là đã thống nhất. Biên bản lập thành 02 bản, mỗi bên giữ 01 bản.</p>' +
    '<div class="vc-signs bb-signs" style="grid-template-columns:1fr 1fr 1fr 1fr"><div class="vc-sign"><b>Bên B</b><i>(Ký, họ tên, đóng dấu)</i></div>' +
    [['Người lập', s.nguoiLap], ['Kế toán', s.keToanTruong], ['Giám đốc', s.giamDoc]].map(([t, n]) => '<div class="vc-sign"><b>Bên A: ' + t + '</b><i>(Ký, họ tên)</i><span class="vc-name">' + esc(n || '') + '</span></div>').join('') + '</div>' +
    '<div class="bb-foot">In ngày ' + esc(fdate(today)) + ' · ' + esc(s.tenDonVi || '') + '</div>'
  );
}

export function moBienBan(ma, o) {
  o = o || {};
  const html = bienBanHtml(ma, o);
  const m = openModal({
    title: 'Biên bản đối chiếu công nợ · ' + tenNCC(ma),
    size: 'wide',
    body: '<div class="paper-wrap"><div class="paper bb-preview"><div class="vc-page bb">' + html + '</div></div></div>',
    footer: '<span class="text-[12px] text-ink-3">A4 dọc, đen trắng. Nhiều trang thì lặp tiêu đề bảng kê.</span><span class="flex-1"></span><button type="button" class="btn btn-ghost" data-act="no">Đóng</button>' +
      '<button type="button" class="btn btn-primary" data-act="print">' + icon('print') + 'In biên bản</button>',
    onMount(el, h) {
      el.querySelector('[data-act=no]').addEventListener('click', () => h.close());
      el.querySelector('[data-act=print]').addEventListener('click', () => printHtml(html));
      const wrap = el.querySelector('.paper-wrap');
      const paper = el.querySelector('.paper');
      const apply = () => { paper.style.zoom = String(Math.max(0.4, Math.min(1, (wrap.clientWidth - 32) / 794))); };
      new ResizeObserver(apply).observe(wrap);
      apply();
    }
  });
  return m;
}
