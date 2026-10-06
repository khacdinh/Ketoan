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
 * Trong kỳ: mỗi phiếu nhập chi phí một dòng (tăng nợ), mỗi khoản chi sổ quỹ / trả ngoài quỹ một dòng (giảm nợ). Lũy kế = đầu kỳ + phát sinh − thanh toán. */
export function soChiTiet(ma, o) {
  o = o || {};
  const k = KT.keyOf(ma);
  const rg = (ngay) => (!o.from || ngay >= o.from) && (!o.to || ngay <= o.to);
  const okCt = (x, f) => !o.ct || KT.keyOf(x[f]) === KT.keyOf(o.ct);
  const per = KT.supplierPeriod(S.db, { from: o.from, to: o.to, ct: o.ct, ncc: [ma] }).rows.find((r) => KT.keyOf(r.ma) === k) ||
    { ma, ten: tenNCC(ma), loai: '', dauKy: 0, nhapDauKy: 0, phatSinh: 0, thanhToan: 0, cuoiKy: 0, soDongDK: 0, status: 'ok', inCatalog: false };
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

// Hậu quả công nợ của một lần xóa, để ghi vào hộp xác nhận. delta = thay đổi của số dư cuối kỳ (dương = còn nợ nhiều hơn)
export function hauQuaCongNo(maNCC, delta, ct) {
  if (!maNCC || !delta) return '';
  const d = KT.debtOf(S.db, maNCC, ct || '');
  const now = d ? d.conLai : 0;
  const fmt = (n) => (n === 0 ? 'đã tất toán' : (n > 0 ? 'Dư Có ' : 'Dư Nợ ') + money(Math.abs(n)) + ' đ');
  return 'Công nợ ' + esc(tenNCC(maNCC)) + ' sau khi xóa: ' + fmt(now) + ' → <b class="text-ink">' + fmt(now + delta) + '</b>.';
}
