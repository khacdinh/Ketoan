/* Dùng chung cho các màn công nợ nhà cung cấp (Công nợ theo kỳ, Sổ chi tiết, Biên bản đối chiếu).
 * Quy ước hiển thị: Dư Có = mình còn phải trả NCC; Dư Nợ = mình đã ứng trước / trả dư. Không hiện số âm cho công nợ. */
import { esc, money, icon, openModal } from './ui.js';
import { S, saveFilter } from './state.js';
import { comboHtml, bindCombo, comboResolve } from './combo.js';
import { datCongTrinh } from './ctpick.js';

const KT = window.KT;

// 516.836.000 Có / 22.906.000 Nợ (Nợ màu cảnh báo). Cột chữ rộng cố định để số thẳng hàng.
export function coNoHtml(n) {
  if (!n) return '<span class="text-ink-3">0</span>';
  return '<span class="cono">' + money(Math.abs(n)) + '</span><span class="cono-lbl' + (n < 0 ? ' no' : '') + '">' + (n > 0 ? 'Có' : 'Nợ') + '</span>';
}

// Nhãn tình trạng (luôn kèm biểu tượng + chữ). Còn nợ = bình thường (xanh thép, KHÔNG đỏ).
export function debtChip(status) {
  if (status === 'no') return '<span class="chip chip-owe">' + icon('clock') + 'Còn nợ</span>';
  if (status === 'du') return '<span class="chip chip-near">' + icon('arrowOut') + 'Ứng dư</span>';
  return '<span class="chip chip-ok">' + icon('check') + 'Đã tất toán</span>';
}
export const debtLabel = (status) => (status === 'no' ? 'Còn nợ' : status === 'du' ? 'Ứng dư' : 'Đã tất toán');

// Chuyển sang Sổ chi phí / Sổ thu chi đã lọc theo NCC
export function goCostLedger(ma, ct) {
  Object.assign(S.filters.cpSo, { period: 'tat-ca', from: '', to: '', rel: false, ct: ct || '', nha: '', nhom: '', hm: '', loai: '', ncc: ma, vt: '', q: '' });
  saveFilter('cpSo');
  location.hash = '#/cp-so';
}
export function goCashLedger(ma, ct) {
  Object.assign(S.filters.so, { duAn: ct || '', ncc: ma, loai: '', q: '', period: 'tat-ca', from: '', to: '', rel: false });
  datCongTrinh(ct || '', true);
  saveFilter('so');
  location.hash = '#/so-thu-chi';
}

// Hỏi chọn một nhà cung cấp rồi gọi fn(mã) — dùng khi bấm "Biên bản đối chiếu" mà chưa chọn NCC nào
export function chonNCC(title, okText, fn, goiY) {
  const cb = { id: 'cn-pick', list: S.db.suppliers.map((x) => ({ ma: x.ma, ten: x.ten, sub: x.loai })), value: goiY || '', noun: 'nhà cung cấp', placeholder: 'Gõ mã hoặc tên nhà cung cấp', label: 'Nhà cung cấp', type: 'text', quiet: true };
  openModal({
    title,
    size: 'small',
    body: '<label class="field"><span class="label">Nhà cung cấp</span>' + comboHtml(cb) + '<span class="hint"></span></label>',
    footer: '<span class="flex-1"></span><button type="button" class="btn btn-ghost" data-act="no">Hủy</button><button type="button" class="btn btn-primary" data-act="ok">' + esc(okText) + '</button>',
    onMount(el, h) {
      const inp = el.querySelector('#cn-pick');
      bindCombo(inp, cb, null);
      const ok = () => {
        const r = comboResolve(cb, inp.value);
        if (!r.ok || !r.value) { el.querySelector('.hint').textContent = 'Chọn một nhà cung cấp trong danh mục'; el.querySelector('.hint').className = 'hint bad'; inp.focus(); return; }
        h.close();
        fn(r.value);
      };
      el.querySelector('[data-act=ok]').addEventListener('click', ok);
      el.querySelector('[data-act=no]').addEventListener('click', () => h.close());
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const open = el.querySelector('.combo-list') && !el.querySelector('.combo-list').hidden; if (!open) { e.preventDefault(); ok(); } } });
      setTimeout(() => inp.focus(), 40);
    }
  });
}

// Phiếu chi trả NCC (tiền quỹ): mở form Ghi thu / chi điền sẵn
export async function ghiPhieuChi(openEntryForm, r, ct) {
  openEntryForm({ maNCC: r.ma, maDuAn: ct || '', chi: r.cuoiKy != null ? r.cuoiKy : r.conLai, noiDung: 'Thanh toán công nợ ' + r.ten + (ct ? ' công trình ' + ct : '') }, { loai: 'chi' });
}

export const tenNCC = (ma) => { const x = S.db.suppliers.find((s) => KT.keyOf(s.ma) === KT.keyOf(ma)); return x ? x.ten : ma; };
export const ctNhan = (ct) => { const p = ct ? S.db.projects.find((x) => KT.keyOf(x.ma) === KT.keyOf(ct)) : null; return p ? p.ma + ' – ' + p.ten : ct || 'Tất cả công trình'; };

/* ---------------- Dữ liệu Sổ chi tiết công nợ một nhà cung cấp ----------------
 * Đầu kỳ = số dư nhập tay + chi phí trước kỳ − thanh toán trước kỳ (cùng KT.supplierPeriod, nên Cuối kỳ khớp màn Công nợ theo kỳ).
 * Trong kỳ: mỗi phiếu nhập chi phí một dòng (tăng nợ), mỗi khoản chi sổ quỹ / trả ngoài quỹ một dòng (giảm nợ). Lũy kế = đầu kỳ + phát sinh − thanh toán.
 * o.bo = [{ ma, dauKy, nhapDauKy }]: bỏ chứng từ của các công trình này (công trình đã tất toán, ma '' = chưa gán) và trừ đầu kỳ của chúng,
 * nên lũy kế chỉ còn các công trình đang hiện; cuối kỳ không đổi vì công trình bị bỏ có số dư cuối kỳ bằng 0. */
export function soChiTiet(ma, o) {
  o = o || {};
  const k = KT.keyOf(ma);
  const rg = (ngay) => (!o.from || ngay >= o.from) && (!o.to || ngay <= o.to);
  const bo = new Map((o.bo || []).map((x) => [KT.keyOf(x.ma), x]));
  const okCt = (x, f) => (!o.ct || KT.keyOf(x[f]) === KT.keyOf(o.ct)) && !bo.has(KT.keyOf(x[f]));
  let per = KT.supplierPeriod(S.db, { from: o.from, to: o.to, ct: o.ct, ncc: [ma] }).rows.find((r) => KT.keyOf(r.ma) === k) ||
    { ma, ten: tenNCC(ma), loai: '', dauKy: 0, nhapDauKy: 0, phatSinh: 0, thanhToan: 0, cuoiKy: 0, soDongDK: 0, status: 'ok', inCatalog: false };
  if (bo.size) {
    per = Object.assign({}, per);
    bo.forEach((x) => { per.dauKy -= x.dauKy || 0; per.nhapDauKy -= x.nhapDauKy || 0; });
  }
  const costs = S.costLedger.filter((c) => KT.keyOf(c.maNCC) === k && rg(c.ngay) && okCt(c, 'maCT'));
  const slips = KT.costSlips(Object.assign({}, S.db, { costs }), costs);
  const docs = [];
  slips.forEach((s) => docs.push({ kind: 'pn', ngay: s.ngay, ma: s.soPhieu || '', phieuId: s.phieuId, ct: s.maCT, nha: s.maNha, dienGiai: s.hangMuc.join(', '), phatSinh: s.total, thanhToan: 0, lines: s.lines, id: s.phieuId || s.lines[0].id }));
  S.ledger.filter((e) => KT.keyOf(e.maNCC) === k && rg(e.ngay) && okCt(e, 'maDuAn') && ((e.chi || 0) - (e.thu || 0)) !== 0).forEach((e) => docs.push({ kind: 'tt', ngay: e.ngay, ma: e.soPhieu || '', ct: e.maDuAn, dienGiai: e.noiDung, phatSinh: 0, thanhToan: (e.chi || 0) - (e.thu || 0), entryId: e.id, hoan: !!e.thu && !e.chi, id: e.id }));
  (S.db.extPayments || []).filter((p) => KT.keyOf(p.maNCC) === k && rg(p.ngay) && okCt(p, 'maDuAn')).forEach((p) => docs.push({ kind: 'xp', ngay: p.ngay, ma: 'Ngoài quỹ', ct: p.maDuAn, dienGiai: (p.nguon || 'Nguồn khác') + (p.ghiChu ? ' · ' + p.ghiChu : ''), phatSinh: 0, thanhToan: p.soTien, id: p.id, rec: p }));
  const order = { pn: 0, tt: 1, xp: 2 };
  docs.sort((a, b) => (a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : order[a.kind] - order[b.kind] || a.id - b.id));
  let run = per.dauKy;
  docs.forEach((d) => { run += d.phatSinh - d.thanhToan; d.luyKe = run; });
  const sumPS = docs.reduce((t, d) => t + d.phatSinh, 0);
  const sumTT = docs.reduce((t, d) => t + d.thanhToan, 0);
  return {
    per, docs, phatSinh: sumPS, thanhToan: sumTT, cuoiKy: per.dauKy + sumPS - sumTT,
    nPhieu: docs.filter((d) => d.kind === 'pn').length, nDong: docs.filter((d) => d.kind === 'pn').reduce((t, d) => t + d.lines.length, 0), nLanTT: docs.filter((d) => d.kind !== 'pn').length,
    cts: Array.from(new Set(docs.map((d) => d.ct).filter(Boolean)))
  };
}

/* ---------------- Dòng phương trình công nợ dùng chung ----------------
 * Công nợ NCC theo kỳ và Công nợ theo công trình vẽ cùng một dòng, để hai màn đọc giống hệt nhau:
 * Số dư đầu kỳ + Phát sinh − Thanh toán = Số dư cuối kỳ. Số dư ghi thuần (Có − Nợ) nên phép tính cộng trừ đúng ngay trên màn hình;
 * bên dưới tách Còn phải trả (Dư Có) và Đã ứng trước (Dư Nợ).
 * o: { dauCo, dauNo, phatSinh, thanhToan, traNgoai, cuoiCo, cuoiNo, nCo, nNo, donVi, kyTu, kyDen, idCo, cauNoi } — cauNoi: dòng nối sang màn kia (HTML) */
export function phuongTrinhHtml(o) {
  const tach = (co, no, nCo, nNo, idCo) => '<span class="eq-rows">' +
    '<span>Còn phải trả <span class="text-ink-3">(Dư Có)</span></span><b' + (idCo ? ' id="' + idCo + '"' : '') + '>' + money(co) + '</b><span class="text-ink-3">' + (nCo == null ? '' : nCo + ' ' + o.donVi) + '</span>' +
    '<span>Đã ứng trước <span class="text-ink-3">(Dư Nợ)</span></span><b class="text-caution">' + money(no) + '</b><span class="text-ink-3">' + (nNo == null ? '' : nNo + ' ' + o.donVi) + '</span></span>';
  return '<div class="equation" role="group" aria-label="Số dư đầu kỳ cộng phát sinh trừ thanh toán bằng số dư cuối kỳ">' +
    '<div class="eq-cell"><span class="eq-label">Số dư đầu kỳ' + (o.kyTu || '') + '</span><span class="eq-value" data-eq="dau">' + coNoHtml(o.dauCo - o.dauNo) + '</span>' + tach(o.dauCo, o.dauNo) + '</div><span class="eq-op">+</span>' +
    '<div class="eq-cell"><span class="eq-label">Phát sinh trong kỳ</span><span class="eq-value" data-eq="ps">' + money(o.phatSinh) + '</span><span class="eq-label">từ sổ chi phí</span></div><span class="eq-op">−</span>' +
    '<div class="eq-cell"><span class="eq-label">Thanh toán trong kỳ</span><span class="eq-value" data-eq="tt">' + money(o.thanhToan) + '</span><span class="eq-label">sổ quỹ' + (o.traNgoai ? ' + nguồn khác ' + money(o.traNgoai) : '') + '</span></div><span class="eq-op">=</span>' +
    '<div class="eq-cell eq-wide"><span class="eq-label" title="Thuần = Còn phải trả − Đã ứng trước">Số dư cuối kỳ' + (o.kyDen || '') + ' · thuần</span><span class="eq-value" data-eq="cuoi">' + coNoHtml(o.cuoiCo - o.cuoiNo) + '</span>' +
    tach(o.cuoiCo, o.cuoiNo, o.nCo, o.nNo, o.idCo) + (o.cauNoi ? '<span class="eq-cau-noi">' + o.cauNoi + '</span>' : '') + '</div></div>';
}

/* Dòng nối dưới Còn phải trả / Đã ứng trước, chỉ ra con số tương ứng ở màn kia và vì sao lệch (d = KT.doiChieuCongNo).
 * man = 'ncc' (đang ở màn Công nợ NCC theo kỳ) | 'ct' (đang ở màn Công nợ theo công trình) */
export function cauNoiHtml(d, man) {
  if (!d || !d.buTru) return '';
  const kia = man === 'ncc' ? d.ct : d.ncc;
  const ten = d.dsNCC.slice(0, 4).map((x) => esc(x.ten)).join(', ') + (d.dsNCC.length > 4 ? ', …' : '');
  // liên kết mở khung đối chiếu (danh sách NCC, ví dụ tính tay) ở màn Công nợ theo công trình
  const link = '<a class="whitespace-nowrap font-medium text-pen underline underline-offset-2" data-dc-mo href="' + (man === 'ncc' ? '#/cong-no-ct' : '#cnct-doi-chieu') + '">Xem ' +
    d.dsNCC.length + ' NCC này' + (man === 'ncc' ? ' ở màn Công nợ theo công trình' : '') + ' ›</a>';
  return (man === 'ncc' ? 'Màn theo công trình ghi ' : 'Màn theo NCC ghi ') + '<b>' + money(kia.conNo) + '</b> / <b>' + money(kia.ungDu) + '</b>: mỗi số ' +
    (man === 'ncc' ? 'lớn hơn ' : 'nhỏ hơn ') + '<b>' + money(d.buTru) + '</b> vì ' + d.dsNCC.length + ' NCC (' + ten + ') còn nợ ở công trình này nhưng ứng trước ở công trình khác — ' +
    (man === 'ncc' ? 'màn này trừ cho nhau, màn kia giữ riêng. ' : 'màn kia trừ cho nhau, màn này giữ riêng. ') + link;
}

// Tên công trình trong đối chiếu ('' = khoản không ghi công trình)
const tenCT = (ma) => (ma ? esc(ma) : '<span class="text-caution">chưa ghi công trình</span>');
const dsCT = (xs, max) => xs.slice(0, max || 99).map((y) => tenCT(y.ma) + ' ' + money(y.so)).join(', ') + (max && xs.length > max ? ', … (' + xs.length + ' công trình)' : '');

/* Khung "Đối chiếu với màn Công nợ NCC theo kỳ" ở màn Công nợ theo công trình: hai bộ Dư Có / Dư Nợ, chênh lệch, NCC gây chênh.
 * d = KT.doiChieuCongNo(...); mo = đang mở */
export function doiChieuHtml(d, mo) {
  const dong = (ten, a, b, cls) => '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + ten + '</td><td class="num money">' + a + '</td><td class="num money">' + b + '</td>';
  const chenh = (n) => '<td class="num money">' + (n ? '+ ' + money(n) : '<span class="text-income">' + icon('check', 'mr-1 align-[-2px]') + 'bằng nhau</span>') + '</td></tr>';
  return '<details class="sheet doi-chieu" id="cnct-doi-chieu"' + (mo ? ' open' : '') + '><summary class="doi-chieu-head">' +
    '<span class="caret">' + icon('caretRight') + '</span><span><b>Đối chiếu với màn Công nợ NCC theo kỳ</b> · cả hai đều đúng: thuần (Có − Nợ) bằng nhau <b class="tabular-nums">' + money(d.ct.thuan) + '</b>' +
    (d.buTru ? '; Dư Có và Dư Nợ ở màn này cùng lớn hơn <b class="tabular-nums">' + money(d.buTru) + '</b> do ' + d.dsNCC.length + ' NCC được bù trừ giữa các công trình' : '') + '</span></summary>' +
    '<div class="doi-chieu-body"><div class="w-max max-w-full overflow-x-auto"><table class="ledger" id="cnct-dc-tong"><thead><tr><th></th>' +
    '<th class="num money">Màn theo NCC<div class="sub font-normal">bù trừ mọi công trình của một NCC</div></th>' +
    '<th class="num money">Màn theo công trình<div class="sub font-normal">giữ riêng từng công trình</div></th><th class="num money">Chênh</th></tr></thead><tbody>' +
    dong('Còn phải trả (Dư Có)', money(d.ncc.conNo), money(d.ct.conNo)) + chenh(d.ct.conNo - d.ncc.conNo) +
    dong('Đã ứng trước (Dư Nợ)', '<span class="text-caution">' + money(d.ncc.ungDu) + '</span>', '<span class="text-caution">' + money(d.ct.ungDu) + '</span>') + chenh(d.ct.ungDu - d.ncc.ungDu) +
    dong('<b>Thuần (Có − Nợ)</b>', '<b>' + coNoHtml(d.ncc.thuan) + '</b>', '<b>' + coNoHtml(d.ct.thuan) + '</b>', 'font-bold') + chenh(d.ct.thuan - d.ncc.thuan) +
    '</tbody></table></div>' +
    viDu(d.dsNCC[0]) +
    '<ul class="doi-chieu-note"><li><b>Trả tiền, đối chiếu với nhà cung cấp</b>: dùng số màn theo NCC — mỗi NCC chỉ có một số dư sau khi bù trừ mọi công trình.</li>' +
    '<li><b>Theo dõi từng công trình còn nợ bao nhiêu</b>: dùng số màn này — tiền đã ứng ở công trình kia không tự trả cho công trình này.</li>' +
    '<li>Số liệu tính trên mọi NCC có số liệu trong kỳ, không theo ô lọc tình trạng / tìm kiếm.</li></ul>' +
    (d.dsNCC.length ? '<p class="mb-1.5 text-[12.5px] text-ink-2">' + d.dsNCC.length + ' NCC vừa còn nợ ở công trình này vừa đã ứng trước ở công trình khác (cộng phần bù trừ = chênh ' + money(d.buTru) + '). ' +
      'Nếu khoản ứng trước thật ra thuộc công trình đang còn nợ, sửa Mã công trình của phiếu chi / số dư đầu kỳ đó thì chênh lệch mất.</p>' +
      '<div class="overflow-x-auto"><table class="ledger" id="cnct-dc-ncc"><thead><tr><th>Nhà cung cấp</th><th>Đã ứng trước ở</th><th>Còn nợ ở</th><th class="num money">Bù trừ</th><th class="num money">Số dư thuần của NCC</th><th class="no-print"><span class="sr-only">Thao tác</span></th></tr></thead><tbody>' +
      d.dsNCC.map((x) => '<tr data-dc-ncc="' + esc(x.ma) + '"><td><b class="code">' + esc(x.ten) + '</b><div class="sub">' + esc(x.ma) + '</div></td>' +
        '<td class="text-caution">' + dsCT(x.ung) + '</td><td>' + dsCT(x.no, 4) + '</td><td class="num money font-bold">' + money(x.buTru) + '</td><td class="num money">' + coNoHtml(x.cuoiKy) + '</td>' +
        '<td class="actions no-print"><button type="button" class="icon-btn" data-act="dc-ledger" title="Sổ chi tiết NCC: số dư từng công trình" aria-label="Sổ chi tiết ' + esc(x.ten) + '">' + icon('book') + '</button></td></tr>').join('') +
      '</tbody><tfoot><tr><td colspan="3">Cộng ' + d.dsNCC.length + ' NCC</td><td class="num money"><span class="dbl">' + money(d.buTru) + '</span></td><td colspan="2"></td></tr></tfoot></table></div>' : '') +
    '</div></details>';
}

// Ví dụ tính tay cho một NCC bù trừ giữa các công trình: vì sao Dư Có / Dư Nợ hai màn lệch đúng phần bù trừ
function viDu(x) {
  if (!x) return '';
  const tong = (xs) => xs.reduce((t, y) => t + y.so, 0);
  const no = tong(x.no), ung = tong(x.ung);
  const noi = (xs) => (xs.length === 1 ? (xs[0].ma ? 'ở ' + esc(xs[0].ma) : '(chưa ghi công trình)') : 'ở ' + xs.length + ' công trình');
  return '<div class="doi-chieu-vd" id="cnct-dc-vd"><span><b>Ví dụ ' + esc(x.ten) + '</b>: còn nợ <b>' + money(no) + '</b> ' + noi(x.no) + ', đã ứng trước <b class="text-caution">' + money(ung) + '</b> ' + noi(x.ung) + '.</span>' +
    '<span>• <b>Màn theo NCC</b> trừ cho nhau: ' + money(no) + ' − ' + money(ung) + ' = ' + coNoHtml(no - ung) + ' → chỉ cộng ' + money(Math.abs(no - ung)) + ' vào ' + (no >= ung ? 'Còn phải trả' : 'Đã ứng trước') + '.</span>' +
    '<span>• <b>Màn theo công trình</b> giữ riêng: cộng ' + money(no) + ' vào Còn phải trả và ' + money(ung) + ' vào Đã ứng trước → cả hai dòng lớn hơn ' + money(x.buTru) + '.</span></div>';
}

// Ghi chú dưới số dư cuối kỳ của một NCC ở màn Công nợ NCC theo kỳ: số này đã bù trừ giữa các công trình (x = phần tử của doiChieuCongNo().dsNCC)
export function buTruSub(x) {
  const ung = x.cuoiKy >= 0;
  const ds = ung ? x.ung : x.no;
  const noi = ds.length === 1 ? (ds[0].ma ? 'ở ' + esc(ds[0].ma) : '(chưa ghi công trình)') : 'ở ' + ds.length + ' công trình';
  const title = 'Còn nợ: ' + x.no.map((y) => (y.ma || 'chưa ghi công trình') + ' ' + money(y.so)).join(', ') + '. Đã ứng trước: ' + x.ung.map((y) => (y.ma || 'chưa ghi công trình') + ' ' + money(y.so)).join(', ') +
    '. Màn này bù trừ hai khoản; màn Công nợ theo công trình giữ riêng từng công trình.';
  // hai cụm không ngắt giữa chừng: màn hẹp thì xuống đúng hai dòng
  return '<div class="sub sub-wrap" title="' + esc(title) + '"><span class="whitespace-nowrap">đã trừ ' + (ung ? 'ứng trước ' : 'còn nợ ') + money(x.buTru) + '</span> <span class="whitespace-nowrap">' + noi + '</span></div>';
}

// Hậu quả công nợ của một lần xóa, để ghi vào hộp xác nhận. delta = thay đổi của số dư cuối kỳ (dương = còn nợ nhiều hơn)
export function hauQuaCongNo(maNCC, delta, ct) {
  if (!maNCC || !delta) return '';
  const d = KT.debtOf(S.db, maNCC, ct || '');
  const now = d ? d.conLai : 0;
  const fmt = (n) => (n === 0 ? 'đã tất toán' : (n > 0 ? 'Dư Có ' : 'Dư Nợ ') + money(Math.abs(n)) + ' đ');
  return 'Công nợ ' + esc(tenNCC(maNCC)) + ' sau khi xóa: ' + fmt(now) + ' → <b class="text-ink">' + fmt(now + delta) + '</b>.';
}
