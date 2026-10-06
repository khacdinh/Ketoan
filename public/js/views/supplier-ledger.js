/* Sổ chi tiết công nợ một nhà cung cấp (6a): số dư đầu kỳ, từng chứng từ (phiếu nhập chi phí, khoản chi sổ quỹ, trả ngoài quỹ), lũy kế Có / Nợ.
 * Bấm một phiếu để bung các dòng hàng; "Bung tất cả dòng hàng" bung hết. Alt ↑ ↓ chuyển sang nhà cung cấp khác. */
import { $, $$, esc, money, fdate, icon, download, periodControls, bindPeriodControls, refreshPeriod, freshRoot, LS, setPageActions, setPageTitle, setPageTags, confirmDialog } from '../ui.js';
import { S, saveFilter, allCostLedger } from '../state.js';
import { printView, printSlip } from '../print.js';
import { comboHtml, bindCombo } from '../combo.js';
import { openEntryForm } from '../forms.js';
import { openExtPayForm, deleteExtPay } from '../extpay.js';
import { openSoDuDauList } from '../sodudau.js';
import { coNoHtml, debtChip, soChiTiet, tenNCC, ctNhan, ghiPhieuChi } from '../congno.js';
import { moBienBan } from '../bienban.js';

const KT = window.KT;
let keyHandler = null;
const dm = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');

export function renderSupplierLedger(root) {
  root = freshRoot(root);
  const f = S.filters.sct || (S.filters.sct = { period: 'tat-ca', from: '', to: '', tatCa: false });
  if (!f.period) f.period = 'tat-ca';
  refreshPeriod(f);
  const ct = S.ct === '__none__' ? '' : S.ct || ''; // "Chưa gán công trình" chỉ có nghĩa ở Sổ quỹ: ở đây coi như tất cả
  // NCC đang xem: lấy từ lần chọn trước; chưa có thì NCC có số dư lớn nhất
  const ds = KT.supplierPeriod(S.db, { from: f.from, to: f.to, ct }).rows.filter((r) => r.coSoLieu).sort((a, b) => b.cuoiKy - a.cuoiKy);
  let ma = LS.get('sct.ncc', '');
  if (!ma || !S.db.suppliers.some((x) => KT.keyOf(x.ma) === KT.keyOf(ma))) ma = ds.length ? ds[0].ma : (S.db.suppliers[0] ? S.db.suppliers[0].ma : '');
  if (!ma) { root.innerHTML = '<div class="sheet p-10 text-center text-ink-3">Chưa có nhà cung cấp nào. Thêm nhà cung cấp ở mục “NCC, đối tượng”.</div>'; return; }
  LS.set('sct.ncc', ma);
  const sup = S.db.suppliers.find((x) => KT.keyOf(x.ma) === KT.keyOf(ma));
  const d = soChiTiet(ma, { from: f.from, to: f.to, ct });
  const open = new Set();
  const cb = { id: 'sct-ncc', list: S.db.suppliers.map((x) => ({ ma: x.ma, ten: x.ten, sub: x.loai })), value: ma, show: 'ma', noun: 'nhà cung cấp', placeholder: 'Gõ mã hoặc tên', label: 'Nhà cung cấp' };

  setPageTitle('Sổ chi tiết công nợ · ' + (sup ? sup.ten : ma), ma + (sup && sup.loai ? ' · ' + sup.loai : '') + (d.cts.length ? ' · ' + d.cts.length + ' công trình: ' + d.cts.slice(0, 5).join(', ') + (d.cts.length > 5 ? '…' : '') : ''));
  const cur = d.cuoiKy > 0 ? 'no' : d.cuoiKy < 0 ? 'du' : 'ok';
  setPageTags(debtChip(cur));
  const action = (act) => {
    if (act === 'pay') ghiPhieuChi(openEntryForm, { ma, ten: tenNCC(ma), cuoiKy: Math.max(0, d.cuoiKy) }, ct);
    else if (act === 'bien-ban') moBienBan(ma, { from: f.from, to: f.to, ct });
    else if (act === 'print') { $$('tr.docline', root).forEach((x) => { x.hidden = false; }); printView('SỔ CHI TIẾT CÔNG NỢ ' + (sup ? sup.ten.toUpperCase() : ma), KT.describeRange(f.from, f.to) + '. ' + ctNhan(ct), S.db.settings); }
    else if (act === 'export') download('/api/export/cost-debt?ncc=' + encodeURIComponent(ma) + (ct ? '&ct=' + encodeURIComponent(ct) : '') + (f.to ? '&to=' + f.to : ''));
  };
  setPageActions('<button type="button" class="btn btn-secondary !border-pen !text-accent-800" data-act="pay">' + icon('plus') + 'Ghi thanh toán</button>' +
    '<button type="button" class="btn btn-secondary" data-act="bien-ban">' + icon('paper') + 'Biên bản đối chiếu</button>' +
    '<button type="button" class="btn btn-secondary" data-act="print">' + icon('print') + 'In sổ</button>' +
    '<button type="button" class="btn btn-secondary" data-act="export">' + icon('excel') + 'Xuất Excel</button>', action);

  const kyTu = f.from ? dm(f.from) : '';
  const kyDen = f.to ? dm(f.to) : '';
  root.innerHTML =
    '<div class="print-only" id="print-head"></div>' +
    '<nav class="no-print -mb-2 text-[12px] text-ink-3" aria-label="Đường dẫn"><a class="text-pen underline underline-offset-2" href="#/cp-cong-no">Công nợ NCC theo kỳ</a> <span aria-hidden="true">/</span> Sổ chi tiết</nav>' +
    '<div class="no-print flex flex-wrap items-center gap-2.5">' +
    '<div class="fbox on w-[300px]"><span class="lbl">NCC</span>' + comboHtml(cb) + '</div>' +
    periodControls(f, 'sct') +
    '<div class="seg" role="radiogroup" aria-label="Cách xem">' + [[false, 'Theo phiếu'], [true, 'Bung tất cả dòng hàng']].map(([v, l]) => '<label class="seg-item"><input type="radio" name="sct-bung" value="' + v + '"' + (!!f.tatCa === v ? ' checked' : '') + '><span>' + l + '</span></label>').join('') + '</div>' +
    '<span class="flex-1"></span><span class="text-[12px] text-ink-3"><b>Có</b> = còn phải trả · <b class="text-caution">Nợ</b> = đã ứng trước · <kbd>Alt</kbd> <kbd>↑</kbd><kbd>↓</kbd> NCC khác</span></div>' +
    '<div class="equation" role="group" aria-label="Đầu kỳ cộng phát sinh trừ thanh toán bằng cuối kỳ">' +
    '<div class="eq-cell"><span class="eq-label">Số dư đầu kỳ' + (kyTu ? ' ' + kyTu : '') + '</span><span class="eq-value">' + coNoHtml(d.per.dauKy) + '</span></div><span class="eq-op">+</span>' +
    '<div class="eq-cell"><span class="eq-label">Phát sinh · ' + d.nPhieu + ' phiếu, ' + d.nDong + ' dòng</span><span class="eq-value">' + money(d.phatSinh) + '</span></div><span class="eq-op">−</span>' +
    '<div class="eq-cell"><span class="eq-label">Thanh toán · ' + d.nLanTT + ' lần</span><span class="eq-value">' + money(d.thanhToan) + '</span></div><span class="eq-op">=</span>' +
    '<div class="eq-cell"><span class="eq-label">Số dư cuối kỳ' + (kyDen ? ' ' + kyDen : '') + ' · ' + (d.cuoiKy >= 0 ? 'Dư Có (còn phải trả)' : 'Dư Nợ (đã ứng trước)') + '</span><span class="eq-value">' + coNoHtml(d.cuoiKy) + '</span></div></div>' +
    '<section class="sheet overflow-hidden"><div class="table-scroll scroll-x max-h-[calc(100vh-380px)] min-h-[220px] overflow-auto"><table class="ledger" id="sct-table"><thead><tr>' +
    '<th>Ngày</th><th>Chứng từ</th><th>Công trình / nhà</th><th>Diễn giải</th><th class="num money">Phát sinh <span class="font-normal">(tăng nợ)</span></th><th class="num money">Thanh toán <span class="font-normal">(giảm nợ)</span></th><th class="num money">Số dư lũy kế</th><th class="no-print"><span class="sr-only">Thao tác</span></th></tr></thead>' +
    '<tbody id="sct-body"></tbody><tfoot id="sct-foot"></tfoot></table></div></section>';

  const kyNhan = KT.periodLabel(f.period, f.from, f.to).title;
  function draw() {
    const rows = [];
    const dk = d.per;
    rows.push('<tr class="open-balance"><td class="whitespace-nowrap tabular-nums">' + (f.from ? fdate(f.from) : '') + '</td><td colspan="3"><b>Số dư đầu kỳ</b>' +
      (dk.nhapDauKy ? ' <span class="text-ink-3">· gồm ' + money(Math.abs(dk.nhapDauKy)) + ' nhập tay' + (dk.nhapDauKy < 0 ? ' (đã ứng trước)' : '') + '</span>' : '') +
      (f.from ? ' <span class="text-ink-3">· chuyển từ cuối kỳ trước</span>' : '') + '</td><td></td><td></td>' +
      '<td class="num money font-bold">' + coNoHtml(dk.dauKy) + '</td><td class="actions no-print"><button type="button" class="icon-btn" data-act="dk-list" title="Xem và sửa số dư đầu kỳ nhập tay" aria-label="Sửa số dư đầu kỳ">' + icon('edit') + '</button></td></tr>');
    d.docs.forEach((x, i) => {
      const lkey = x.kind + ':' + x.id;
      const isOpen = x.kind === 'pn' && (f.tatCa || open.has(lkey));
      const tt = x.kind !== 'pn';
      const first = x.lines && x.lines[0];
      rows.push('<tr data-i="' + i + '"' + (x.kind === 'pn' ? ' class="clickable" tabindex="0" aria-expanded="' + isOpen + '"' : ' class="pay-row"') + '>' +
        '<td class="whitespace-nowrap tabular-nums">' + fdate(x.ngay) + '</td>' +
        '<td class="whitespace-nowrap">' + (x.kind === 'pn' ? '<span class="caret' + (isOpen ? ' open' : '') + '">' + icon('caretRight') + '</span><b>Phiếu nhập</b>' + (x.ma ? ' ' + esc(x.ma) : '') + (x.lines.length > 1 ? ' <span class="pill">' + x.lines.length + ' dòng</span>' : '')
          : x.kind === 'tt' ? '<b>' + esc(x.ma || 'Chi') + '</b>' : '<b>Ngoài quỹ</b>') + '</td>' +
        '<td class="whitespace-nowrap">' + (x.ct ? '<b class="code">' + esc(x.ct) + '</b>' : '') + (x.nha && KT.keyOf(x.nha) !== KT.keyOf(x.ct) ? '<div class="sub">' + esc(x.nha) + '</div>' : '') + '</td>' +
        '<td class="wrap-text">' + esc(x.dienGiai || '') + (x.hoan ? ' <span class="pill">NCC hoàn lại</span>' : '') + '</td>' +
        '<td class="num money">' + (x.phatSinh ? money(x.phatSinh) : '') + '</td><td class="num money' + (tt ? ' pay-cell' : '') + '">' + (x.thanhToan ? money(x.thanhToan) : '') + '</td>' +
        '<td class="num money font-bold">' + coNoHtml(x.luyKe) + '</td>' +
        '<td class="actions no-print">' + actionsOf(x) + '</td></tr>');
      if (x.kind === 'pn') {
        x.lines.forEach((c) => {
          const r = allCostLedger().find((y) => y.id === c.id) || c;
          rows.push('<tr class="docline" data-of="' + i + '"' + (isOpen ? '' : ' hidden') + '><td></td><td></td><td class="sub">' + esc(r.tenHM || '') + '</td><td class="text-[12.5px] text-ink-2">' + (c.maVT ? '<b>' + esc(c.maVT) + '</b> ' + esc(r.tenVT || '') : '') + (c.dienGiai ? ' ' + esc(c.dienGiai) : '') + '</td>' +
            '<td class="num money text-[12.5px] text-ink-2">' + money(c.thanhTien) + (c.soLuong != null && c.soLuong !== '' ? '<div class="sub">' + KT.fmtQty(c.soLuong) + (r.dvt ? ' ' + esc(r.dvt) : '') + ' × ' + (KT.isKhoan(c) ? 'khoản' : money(c.donGia)) + '</div>' : '<div class="sub">theo khoản</div>') + '</td><td></td><td></td><td class="no-print"></td></tr>');
        });
      }
    });
    if (!d.docs.length) rows.push('<tr><td colspan="8" class="empty">Không có chứng từ nào của nhà cung cấp này trong kỳ' + (ct ? ' tại công trình ' + esc(ct) : '') + '.</td></tr>');
    $('#sct-body', root).innerHTML = rows.join('');
    $('#sct-foot', root).innerHTML = '<tr><td colspan="4" class="text-ink-2"><b>Cộng phát sinh ' + esc(kyNhan.toLowerCase().replace('toàn bộ thời gian', 'toàn bộ thời gian')) + ' · ' + (d.nPhieu + d.nLanTT) + ' chứng từ</b></td>' +
      '<td class="num money">' + money(d.phatSinh) + '</td><td class="num money">' + money(d.thanhToan) + '</td><td class="num money"><span class="dbl">' + coNoHtml(d.cuoiKy) + '</span></td><td class="no-print"></td></tr>';
  }
  function actionsOf(x) {
    if (x.kind === 'pn') {
      const s = x.phieuId;
      return (s ? '<a class="icon-btn" href="#/cp-nhap?phieu=' + s + '" title="Mở phiếu nhập để xem / sửa" aria-label="Mở phiếu nhập">' + icon('notePencil') + '</a>' : '') +
        '<button type="button" class="icon-btn" data-act="print-slip" title="In phiếu nhập" aria-label="In phiếu nhập">' + icon('print') + '</button>';
    }
    if (x.kind === 'tt') return '<button type="button" class="icon-btn" data-act="edit-entry" title="Mở dòng sổ quỹ để xem / sửa" aria-label="Sửa dòng sổ quỹ">' + icon('edit') + '</button>';
    return '<button type="button" class="icon-btn" data-act="xp-edit" title="Sửa khoản trả ngoài quỹ" aria-label="Sửa khoản trả ngoài quỹ">' + icon('edit') + '</button>' +
      '<button type="button" class="icon-btn danger" data-act="xp-del" title="Xóa (vào Thùng rác)" aria-label="Xóa khoản trả ngoài quỹ">' + icon('trash') + '</button>';
  }

  bindCombo($('#sct-ncc', root), cb, (v) => { if (v) { LS.set('sct.ncc', v); renderSupplierLedger(root); } });
  bindPeriodControls(root, f, 'sct', () => { saveFilter('sct'); renderSupplierLedger(root); });
  root.querySelectorAll('input[name=sct-bung]').forEach((r) => r.addEventListener('change', () => { f.tatCa = r.value === 'true'; saveFilter('sct'); renderSupplierLedger(root); }));
  const toggle = (tr) => {
    const x = d.docs[Number(tr.dataset.i)];
    if (!x || x.kind !== 'pn') return;
    const k = x.kind + ':' + x.id;
    const on = !open.has(k);
    if (on) open.add(k); else open.delete(k);
    tr.setAttribute('aria-expanded', String(on));
    tr.querySelector('.caret').classList.toggle('open', on);
    $$('tr.docline[data-of="' + tr.dataset.i + '"]', root).forEach((l) => { l.hidden = !on && !f.tatCa; });
  };
  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    if (a) {
      const tr = a.closest('tr[data-i]');
      const x = tr ? d.docs[Number(tr.dataset.i)] : null;
      const act = a.dataset.act;
      if (act === 'dk-list') openSoDuDauList(ma);
      else if (act === 'print-slip' && x) { const sl = KT.costSlips(S.all, allCostLedger()).find((y) => String(y.phieuId) === String(x.phieuId)) || { ngay: x.ngay, soPhieu: x.ma, maCT: x.ct, maNha: x.nha, maNCC: ma, tenNCC: tenNCC(ma), lines: x.lines }; printSlip(sl, sl.lines, S.db.settings); }
      else if (act === 'edit-entry' && x) { const en = S.all.entries.find((y) => y.id === x.entryId); if (en) openEntryForm(en); }
      else if (act === 'xp-edit' && x) openExtPayForm(x.rec);
      else if (act === 'xp-del' && x) deleteExtPay(x.rec);
      return;
    }
    if (e.target.closest('a, button')) return;
    const tr = e.target.closest('tr[data-i].clickable');
    if (tr) toggle(tr);
  });
  root.addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr[data-i].clickable');
    if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(tr); }
  });
  // Alt ↑ ↓: nhà cung cấp trước / sau (theo thứ tự số dư lớn đến nhỏ)
  const onKey = (e) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || !location.hash.startsWith('#/so-chi-tiet-ncc') || document.querySelector('.modal-backdrop')) return;
    const i = ds.findIndex((r) => KT.keyOf(r.ma) === KT.keyOf(ma));
    const n = ds[i + (e.key === 'ArrowDown' ? 1 : -1)];
    if (n) { e.preventDefault(); LS.set('sct.ncc', n.ma); renderSupplierLedger(root); }
  };
  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = onKey;
  document.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', () => { document.removeEventListener('keydown', onKey); if (keyHandler === onKey) keyHandler = null; }, { once: true });
  draw();
}
