/* Sổ chi phí công trình (tương đương sheet NHATKYCHUNG): lọc, tìm, sửa trực tiếp, tổng cuối bảng. */
import { $, esc, money, fdate, icon, highlight, download, periodControls, bindPeriodControls, syncPeriodControls, refreshPeriod, freshRoot, debounce, setDateValue,
  api, toast, showError, confirmDialog, openModal, dateField, focusInput, fieldError, busy, LS, setPageActions, densityToggle, bindDensity } from '../ui.js';
import { coQuyen } from '../auth.js';
import { S, saveFilter, costProjects, costDatalists, resolveCode, resolveItem, materialByCode, itemByCode, houseByCode, projectByCode, supplierByCode, groupName, allCostLedger } from '../state.js';
import { printView } from '../print.js';
import { comboHtml, bindCombo, filterBox } from '../combo.js';
import { attachBlock, bindAttach, clipHtml, openAttachList } from '../attach.js';
import { moKyKhoa } from '../khoa.js';
import { hauQuaCongNo } from '../congno.js';

const KT = window.KT;
const PAGE = 500; // số dòng vẽ mỗi lần (bảng lớn vẽ chậm); bấm "Hiện thêm" để xem tiếp, in thì hiện hết
let shown = PAGE;
// về lại số dòng mặc định khi chuyển màn hình (vẽ lại sau khi sửa dữ liệu thì giữ nguyên số dòng đang hiện)
window.addEventListener('hashchange', () => { shown = PAGE; });

function exportQuery(f) {
  const p = { from: f.from, to: f.to, ct: f.ct, nha: f.nha, nhom: f.nhom, hm: f.hm, loai: f.loai, ncc: f.ncc, vt: f.vt, q: f.q };
  return Object.keys(p).filter((k) => p[k]).map((k) => k + '=' + encodeURIComponent(p[k])).join('&');
}

// Dữ liệu gửi lên máy chủ khi sửa 1 dòng (đủ SL và ĐG: máy chủ tính lại Thành tiền; dòng theo khoản: giữ Thành tiền)
function payloadOf(c, patch) {
  const it = itemByCode(c.maHM);
  return Object.assign({
    phieuId: c.phieuId, ngay: c.ngay, maCT: c.maCT, maNha: c.maNha || '', maNCC: c.maNCC || '', soPhieu: c.soPhieu || '',
    maHM: it ? it.ma : c.maHM, loaiCP: c.loaiCP, maVT: c.maVT || '', dienGiai: c.dienGiai || '', soLuong: c.soLuong == null ? '' : c.soLuong,
    donGia: c.donGia == null ? '' : c.donGia, thanhTien: c.thanhTien, ghiChu: c.ghiChu || ''
  }, patch || {});
}

export function renderCostLedger(root) {
  root = freshRoot(root);
  const f = refreshPeriod(S.filters.cpSo);
  const houses = S.db.houses.filter((h) => !f.ct || KT.keyOf(h.maCT) === KT.keyOf(f.ct));
  const items = S.db.costItems.filter((i) => !f.nhom || KT.keyOf(i.maNhom) === KT.keyOf(f.nhom));
  const usedVT = new Set(S.db.costs.map((c) => KT.keyOf(c.maVT)));
  const usedNCC = new Set(S.db.costs.map((c) => KT.keyOf(c.maNCC)));
  // ô gõ tìm thay cho danh sách chọn (xem combo.js)
  const W = 'w-[200px] max-sm:w-full';
  const cb = {
    ct: { id: 'cl-ct', list: costProjects(), value: f.ct, noun: 'công trình', placeholder: 'Công trình: gõ mã, tên', label: 'Lọc theo công trình', cls: W },
    nha: { id: 'cl-nha', list: houses, value: f.nha, none: '(Không gán nhà)', noun: 'nhà', placeholder: 'Tất cả', label: 'Lọc theo nhà', cls: 'w-[160px] max-sm:w-full' },
    nhom: { id: 'cl-nhom', list: S.db.costGroups, value: f.nhom, show: 'ten', noun: 'nhóm chi phí', placeholder: 'Tất cả', label: 'Lọc theo nhóm chi phí', cls: W },
    hm: { id: 'cl-hm', list: items, value: f.hm, show: 'ten', noun: 'hạng mục', placeholder: 'Tất cả', label: 'Lọc theo hạng mục', cls: 'w-[220px] max-sm:w-full' },
    ncc: { id: 'cl-ncc', list: S.db.suppliers.filter((s) => usedNCC.has(KT.keyOf(s.ma)) || KT.keyOf(s.ma) === KT.keyOf(f.ncc)), value: f.ncc, noun: 'nhà cung cấp', placeholder: 'Tất cả', label: 'Lọc theo nhà cung cấp', cls: W },
    vt: { id: 'cl-vt', list: S.db.materials.filter((m) => usedVT.has(KT.keyOf(m.ma)) || KT.keyOf(m.ma) === KT.keyOf(f.vt)), value: f.vt, noun: 'vật tư', placeholder: 'Tất cả', label: 'Lọc theo vật tư', cls: W }
  };

  setPageActions('<button type="button" class="btn btn-secondary" data-act="print">' + icon('print') + 'In sổ</button>' +
    '<button type="button" class="btn btn-secondary" data-act="export">' + icon('excel') + 'Xuất Excel theo bộ lọc</button>' +
    '<a href="#/cp-nhap" class="btn btn-secondary !border-pen !text-accent-800">' + icon('plus') + 'Lập phiếu nhập</a>', (act) => {
    if (act === 'export') download('/api/export/cost-ledger?' + exportQuery(f));
    else if (act === 'print') { shown = Infinity; draw(true); printView('SỔ CHI PHÍ CÔNG TRÌNH', KT.describeRange(f.from, f.to), S.db.settings); }
  });
  root.innerHTML =
    '<div class="print-only" id="print-head"></div>' +
    '<div id="cl-dl">' + costDatalists(f.ct) + '</div>' +
    '<div class="no-print flex flex-wrap items-center gap-2.5">' +
    periodControls(f, 'cl') +
    '<label class="search min-w-[240px] flex-1">' + icon('search') + '<input id="cl-q" type="search" class="input" placeholder="Tìm diễn giải, vật tư, số phiếu, số tiền (gõ 45tr để tìm 45.000.000)" value="' + esc(f.q) + '" aria-label="Tìm trong sổ chi phí"></label>' +
    densityToggle() +
    '</div>' +
    '<div class="no-print filters-grid">' +
    filterBox('Nhà/lô', cb.nha) + filterBox('Nhóm CP', cb.nhom) + filterBox('Hạng mục', cb.hm) +
    '<div class="fbox' + (f.loai ? ' on' : '') + '"><span class="lbl">Loại CP</span><select id="cl-loai" class="input" aria-label="Loại chi phí"><option value="">Tất cả</option>' + KT.LOAI_CP.map((l) => '<option' + (f.loai === l ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></div>' +
    filterBox('NCC', cb.ncc) + filterBox('Vật tư', cb.vt) +
    (S.drafts.costs.length || f.trangThai ? '<div class="seg seg-sm" role="radiogroup" aria-label="Trạng thái">' +
      [['', 'Mọi trạng thái'], ['so', 'Đã ghi sổ'], ['nhap', 'Nháp (' + S.drafts.costs.length + ')']].map(([v, l]) => '<label class="seg-item"><input type="radio" name="cl-tt" value="' + v + '"' + ((f.trangThai || '') === v ? ' checked' : '') + '><span>' + l + '</span></label>').join('') +
      '</div>' : '') +
    '</div>' +
    khoanCuBanner() +
    '<div id="cl-summary"></div>' +
    '<div class="no-print flex flex-wrap items-center gap-2 text-[12.5px]" id="cl-chips"></div>' +
    '<section class="sheet overflow-hidden">' +
    '<div class="table-scroll max-h-[calc(100vh-380px)] min-h-[260px] overflow-auto"><table class="ledger cost-ledger">' +
    '<thead><tr><th>Ngày</th><th>Công trình / nhà</th><th>Hạng mục · loại CP</th><th>Vật tư</th><th>Diễn giải</th>' +
    '<th class="num">Số lượng</th><th class="num money">Đơn giá</th><th class="num money">Thành tiền</th><th>Nhà cung cấp · số phiếu</th><th class="no-print"><span class="sr-only">Thao tác</span></th></tr></thead>' +
    '<tbody id="cl-body"></tbody><tfoot id="cl-foot"></tfoot></table></div>' +
    '<p class="no-print border-t border-rule px-4 py-2 text-[12.5px] text-ink-3">Bấm đúp vào ô Diễn giải, Số lượng, Đơn giá, Hạng mục, Loại CP, Vật tư, Nhà cung cấp hoặc Nhà để sửa ngay trong bảng (<kbd>Enter</kbd> lưu, <kbd>Esc</kbd> bỏ). Nút bút chì để sửa đủ các cột.</p>' +
    '</section>';

  bindDensity(root);
  const draw = (keep) => { if (keep !== true) shown = PAGE; drawRows(root, f); };
  const syncInputs = () => {
    syncPeriodControls(root, f, 'cl');
  };
  bindPeriodControls(root, f, 'cl', () => { saveFilter('cpSo'); syncInputs(); draw(); });
  const kc = $('#khoan-cu', root);
  if (kc) {
    kc.querySelector('[data-act=khoan-cu-xem]').addEventListener('click', moChuyenKhoan);
    kc.querySelector('[data-act=khoan-cu-an]').addEventListener('click', () => { LS.set('anKhoanCu', KT.khoanCu(S.all).length); kc.remove(); });
  }
  const pick = (key, redraw) => (v) => {
    f[key] = v;
    if (key === 'ct') f.nha = '';
    if (key === 'nhom') f.hm = '';
    saveFilter('cpSo');
    if (redraw) renderCostLedger(root); else draw();
  };
  $('#cl-loai', root).addEventListener('change', (e) => { e.target.closest('.fbox').classList.toggle('on', !!e.target.value); pick('loai')(e.target.value); });
  bindCombo($('#cl-nha', root), cb.nha, pick('nha'));
  bindCombo($('#cl-nhom', root), cb.nhom, pick('nhom', true));
  bindCombo($('#cl-hm', root), cb.hm, pick('hm'));
  bindCombo($('#cl-ncc', root), cb.ncc, pick('ncc'));
  bindCombo($('#cl-vt', root), cb.vt, pick('vt'));
  root.querySelectorAll('input[name=cl-tt]').forEach((r) => r.addEventListener('change', () => { f.trangThai = r.value; saveFilter('cpSo'); draw(); }));
  $('#cl-q', root).addEventListener('input', debounce((e) => { f.q = e.target.value; saveFilter('cpSo'); draw(); }, 150));

  root.addEventListener('click', async (e) => {
    const chip = e.target.closest('[data-chip]');
    if (chip) {
      const k = chip.dataset.chip;
      if (k === 'period') Object.assign(f, { period: 'tat-ca', from: '', to: '', rel: false }); else f[k] = '';
      saveFilter('cpSo');
      renderCostLedger(root);
      return;
    }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    const tr = a.closest('tr[data-id]');
    const c = tr ? S.all.costs.find((x) => x.id === Number(tr.dataset.id)) : null;
    if (act === 'dvt') { moDvt(a); return; }
    if (act === 'clear') {
      Object.assign(f, { period: 'tat-ca', from: '', to: '', rel: false, nha: '', nhom: '', hm: '', loai: '', ncc: '', vt: '', q: '', trangThai: '' });
      saveFilter('cpSo');
      renderCostLedger(root);
    } else if (act === 'export') download('/api/export/cost-ledger?' + exportQuery(f));
    else if (act === 'print') { shown = Infinity; draw(true); printView('SỔ CHI PHÍ CÔNG TRÌNH', KT.describeRange(f.from, f.to), S.db.settings); }
    else if (act === 'more') { shown += PAGE; draw(true); }
    else if (act === 'all') { shown = Infinity; draw(true); }
    else if (act === 'edit' && c) openCostLineForm(c);
    else if (act === 'dup' && c) {
      try { await api('POST', '/api/costs', payloadOf(c, { nguon: 'nhan ban' })); toast('Đã nhân bản dòng (cùng phiếu)'); } catch (err) { showError(err); }
    } else if (act === 'del' && c) {
      if (!(await confirmDialog({ trash: true, title: 'Xóa dòng chi phí', html: 'Xóa dòng ngày <b class="text-ink">' + fdate(c.ngay) + '</b>, ' + esc(c.maVT || c.dienGiai) + ', thành tiền <b class="text-ink">' + money(c.thanhTien) + ' đ</b>?', hauQua: hauQuaCongNo(c.maNCC, -(c.thanhTien || 0), c.maCT), okText: 'Xóa dòng', danger: true }))) return;
      try { await api('DELETE', '/api/costs/' + c.id); toast('Đã xóa dòng chi phí, chuyển vào Thùng rác'); } catch (err) { showError(err); }
    } else if (act === 'clip' && c) {
      openAttachList(a.dataset.owner, Number(a.dataset.oid), 'Chứng từ của ' + (a.dataset.owner === 'slips' ? 'phiếu nhập' : 'dòng chi phí'));
    } else if (act === 'locked' && c) {
      moKyKhoa(c.ngay, 'sửa');
    } else if (act === 'post' && c) {
      try { const r = await api('POST', '/api/cost-slips/' + c.phieuId + '/post'); toast('Đã ghi sổ phiếu nháp (' + r.posted + ' dòng), đã tính vào chi phí và công nợ'); } catch (err) { showError(err); }
    } else if (act === 'slip' && c) {
      location.hash = '#/cp-nhap?phieu=' + c.phieuId;
    }
  });
  // Bàn phím trên dòng đang chọn (Tab tới dòng): Enter sửa đủ cột · Ctrl D nhân bản · Delete xóa
  root.addEventListener('keydown', (e) => {
    const tr = e.target.matches && e.target.matches('tr[data-id]') ? e.target : null;
    if (!tr) return;
    const btn = (act) => tr.querySelector('[data-act="' + act + '"]');
    const ctrl = e.ctrlKey || e.metaKey;
    const go = (act) => { const b = btn(act) || btn('locked'); if (b) { e.preventDefault(); b.click(); } };
    if (e.key === 'Enter' && !ctrl) go('edit');
    else if (ctrl && (e.key === 'd' || e.key === 'D')) go('dup');
    else if (e.key === 'Delete') go('del');
  });
  root.addEventListener('dblclick', (e) => {
    const td = e.target.closest('[data-edit]');
    if (td && !td.querySelector('input,select')) { inlineEdit(td); return; }
    const tr = e.target.closest('tr[data-id]');
    if (!tr || e.target.closest('button, a')) return;
    const c = S.all.costs.find((x) => x.id === Number(tr.dataset.id));
    if (c) openCostLineForm(c);
  });
  draw();
}

/* ---------- Dòng khoán lưu theo cách cũ (Số lượng 1 × Đơn giá = Thành tiền) → chuyển sang theo khoản ---------- */
function khoanCuBanner() {
  if (!coQuyen('sua-hang-loat')) return '';
  const n = KT.khoanCu(S.all).length;
  if (!n || Number(LS.get('anKhoanCu', 0)) >= n) return '';
  return '<div id="khoan-cu" class="banner no-print">' +
    icon('info') + '<span class="min-w-[240px] flex-1">Có <b class="font-semibold">' + n + ' dòng</b> chỉ có Thành tiền nhưng đang lưu kiểu cũ ' +
    '<b class="font-semibold">Số lượng 1 × Đơn giá = Thành tiền</b>. Có thể chuyển sang “theo khoản” (Số lượng, Đơn giá để trống, giữ nguyên Thành tiền).</span>' +
    '<button type="button" class="btn btn-secondary btn-sm !border-pen !text-accent-800" data-act="khoan-cu-xem">Xem và chuyển</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" data-act="khoan-cu-an">Ẩn</button></div>';
}

function moChuyenKhoan() {
  const rows = KT.khoanCu(S.all);
  const led = new Map(allCostLedger().map((r) => [r.id, r]));
  const khoa = KT.lockedMonths(S.all);
  const coVT = (c) => !!c.maVT && !/^xx-/i.test(String(c.maVT).trim());
  const m = openModal({
    title: 'Chuyển dòng cũ sang “theo khoản”',
    size: 'wide',
    body: '<p class="text-[13.5px] leading-relaxed text-ink-2">Các dòng dưới đây đang lưu <b class="font-semibold text-ink">Số lượng 1 × Đơn giá = Thành tiền</b> — thường là dòng khoán ' +
      '(nhân công, phí, tiền xe…) mà bản trước tự gán số lượng 1. Dòng được chọn sẽ để trống Số lượng, Đơn giá; <b class="font-semibold text-ink">Thành tiền, tổng tiền, công nợ không đổi</b>. ' +
      'Bỏ chọn những dòng mua thật đúng 1 đơn vị (ví dụ 1 m³ bê tông). Phần mềm sao lưu trước khi chuyển.</p>' +
      '<div class="mt-3 flex flex-wrap items-center gap-2"><button type="button" class="btn btn-ghost btn-sm" data-act="chon-het">Chọn tất cả</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="bo-vt">Bỏ chọn dòng có mã vật tư</button><span class="flex-1"></span>' +
      '<span class="text-[13px] text-ink-2" id="kc-dem" aria-live="polite"></span></div>' +
      '<div class="mt-2 max-h-[52vh] overflow-auto rounded-lg border border-rule"><table class="ledger ledger-compact"><thead><tr>' +
      '<th class="w-8"><input type="checkbox" id="kc-all" aria-label="Chọn tất cả" checked></th><th>Ngày</th><th>Công trình</th><th>Vật tư / diễn giải</th><th>Loại CP</th><th class="num money">Thành tiền</th></tr></thead><tbody>' +
      rows.map((c) => {
        const r = led.get(c.id) || c;
        const locked = khoa.has(KT.monthOf(c.ngay));
        return '<tr' + (locked ? ' class="text-ink-3"' : '') + '><td><input type="checkbox" data-kc="' + c.id + '"' + (locked ? ' disabled title="Tháng đã khóa sổ"' : ' checked') + ' aria-label="Chọn dòng ngày ' + esc(fdate(c.ngay)) + '"></td>' +
          '<td class="whitespace-nowrap">' + fdate(c.ngay) + (locked ? ' <span class="text-[12px]">(đã khóa sổ)</span>' : '') + '</td><td class="code">' + esc(c.maCT) + '</td>' +
          '<td>' + (c.maVT ? '<span class="font-semibold">' + esc(c.maVT) + '</span> ' + esc(r.tenVT || '') : '') + (c.dienGiai ? '<div class="sub">' + esc(c.dienGiai) + '</div>' : '') + '</td>' +
          '<td>' + esc(c.loaiCP || '') + '</td><td class="num money">' + money(c.thanhTien) + '</td></tr>';
      }).join('') + '</tbody></table></div>',
    footer: '<span class="flex-1"></span><button type="button" class="btn btn-ghost" data-act="no">Hủy</button><button type="button" class="btn btn-primary" data-act="yes">Chuyển</button>'
  });
  const boxes = () => Array.from(m.el.querySelectorAll('[data-kc]:not(:disabled)'));
  const dem = () => {
    const n = boxes().filter((b) => b.checked).length;
    m.el.querySelector('#kc-dem').textContent = 'Đã chọn ' + n + ' / ' + rows.length + ' dòng';
    m.el.querySelector('[data-act=yes]').textContent = 'Chuyển ' + n + ' dòng';
    m.el.querySelector('[data-act=yes]').disabled = !n;
    m.el.querySelector('#kc-all').checked = n === boxes().length;
  };
  m.el.addEventListener('change', (e) => {
    if (e.target.id === 'kc-all') boxes().forEach((b) => { b.checked = e.target.checked; });
    dem();
  });
  m.el.querySelector('[data-act=chon-het]').addEventListener('click', () => { boxes().forEach((b) => { b.checked = true; }); dem(); });
  m.el.querySelector('[data-act=bo-vt]').addEventListener('click', () => {
    const byId = new Map(rows.map((c) => [String(c.id), c]));
    boxes().forEach((b) => { if (coVT(byId.get(b.dataset.kc))) b.checked = false; });
    dem();
  });
  m.el.querySelector('[data-act=no]').addEventListener('click', () => m.close());
  m.el.querySelector('[data-act=yes]').addEventListener('click', async (e) => {
    const ids = boxes().filter((b) => b.checked).map((b) => Number(b.dataset.kc));
    const done = busy(e.currentTarget, 'Đang chuyển…');
    try {
      const r = await api('POST', '/api/costs/theo-khoan', { ids });
      m.close();
      toast('Đã chuyển ' + r.doi + ' dòng sang theo khoản' + (r.boQuaKhoa ? ' (bỏ qua ' + r.boQuaKhoa + ' dòng ở tháng đã khóa sổ)' : ''));
    } catch (err) { done(); showError(err); }
  });
  dem();
}

function drawRows(root, f) {
  const res = KT.filterCosts(S.costLedger, f);
  const filtered = !!(f.ct || f.nha || f.nhom || f.hm || f.loai || f.ncc || f.vt || f.q || f.from || f.to);
  const pct = (v) => (res.total ? ' · ' + (Math.round(v / res.total * 1000) / 10).toLocaleString('vi-VN') + '%' : '');
  const tile = (label, v, cls) => '<div class="border-l border-rule px-3 py-2"><div class="text-[12px] text-ink-3">' + esc(label) + '</div><div class="text-[18px] font-bold tabular-nums ' + (cls || '') + '">' + money(v) + '</div></div>';
  $('#cl-summary', root).innerHTML = '<div class="mk grid border border-rule" style="grid-template-columns:minmax(0,1.3fr) repeat(3,minmax(0,1fr))"><div class="px-3 py-2"><div class="text-[12px] text-ink-3">' +
    (filtered ? 'Tổng chi phí theo bộ lọc' : 'Tổng chi phí') + ' · <b class="text-ink">' + res.rows.length + '</b>' + (filtered ? ' / ' + S.costLedger.length : '') + ' dòng</div><div class="text-[22px] font-bold tabular-nums">' + money(res.total) + ' đ</div></div>' +
    KT.LOAI_CP.map((l) => tile(l + pct(res.byLoai[l] || 0), res.byLoai[l] || 0)).join('') + '</div>';
  // dòng "Đang lọc": từng điều kiện là một nhãn, bấm ✕ để bỏ; Xóa lọc bỏ hết
  const nm = (list, ma, k) => { const x = list.find((y) => KT.keyOf(y.ma) === KT.keyOf(ma)); return x ? (k === 'ma' ? x.ma : x.ten) : ma; };
  const chips = [];
  if (f.from || f.to) chips.push(['period', 'Kỳ ' + KT.describeRange(f.from, f.to).replace(/^Từ ngày /, '').replace(' đến ngày ', ' – ')]);
  if (f.nha) chips.push(['nha', 'Nhà/lô: ' + (f.nha === '__none__' ? 'không gán' : nm(S.db.houses, f.nha, 'ma'))]);
  if (f.nhom) chips.push(['nhom', 'Nhóm: ' + nm(S.db.costGroups, f.nhom, 'ten')]);
  if (f.hm) chips.push(['hm', 'Hạng mục: ' + nm(S.db.costItems, f.hm, 'ten')]);
  if (f.loai) chips.push(['loai', 'Loại CP: ' + f.loai]);
  if (f.ncc) chips.push(['ncc', 'NCC: ' + nm(S.db.suppliers, f.ncc, 'ten')]);
  if (f.vt) chips.push(['vt', 'Vật tư: ' + nm(S.db.materials, f.vt, 'ma')]);
  if (f.q) chips.push(['q', 'Tìm: “' + f.q + '”']);
  $('#cl-chips', root).innerHTML = chips.length ? '<span class="text-ink-3">Đang lọc:</span>' + chips.map(([k, t]) => '<span class="filter-chip">' + esc(t) + '<button type="button" data-chip="' + k + '" aria-label="Bỏ lọc ' + esc(t) + '">' + icon('x') + '</button></span>').join('') +
    '<button type="button" class="btn btn-ghost btn-sm" data-act="clear" id="cl-clear">Xóa lọc</button><span class="flex-1"></span><span class="text-ink-3" id="cl-count" aria-live="polite"></span>'
    : '<span class="text-ink-3" id="cl-count" aria-live="polite"></span>';
  // Dòng Nháp hiện xen trong sổ, không cộng vào các tổng
  const drafts = f.trangThai === 'so' || !S.drafts.costs.length ? [] : KT.filterCosts(allCostLedger().filter(KT.isDraft), f).rows;
  const posted = f.trangThai === 'nhap' ? [] : res.rows;
  const list = drafts.length ? posted.concat(drafts).sort(KT.compareEntries) : posted;
  $('#cl-count', root).innerHTML = '<b class="font-semibold text-ink">' + posted.length + '</b> dòng' + (filtered ? ' khớp bộ lọc, trong tổng số ' + S.costLedger.length + ' dòng' : ' trong sổ') +
    (drafts.length ? ', <b class="font-semibold text-caution">' + drafts.length + ' dòng nháp</b> chưa tính vào tổng' : '') + '.';
  const all = { rows: list };
  const rows = all.rows.length > shown ? all.rows.slice(-shown) : all.rows;
  const body = $('#cl-body', root);
  body.innerHTML = rows.length ? (all.rows.length > rows.length ? moreRow(rows.length, all.rows.length, 10) : '') +
    rows.map((r) => rowHtml(r, f.q)).join('')
    : '<tr><td colspan="10" class="empty">' + (S.costLedger.length ? 'Không có dòng nào khớp bộ lọc. <button type="button" class="btn btn-secondary btn-sm ml-2" data-act="clear">Xóa lọc</button>' : 'Sổ chi phí chưa có dòng nào. <a href="#/cp-nhap" class="btn btn-primary btn-sm ml-2">Lập phiếu nhập</a> hoặc nhập file Excel chi phí (mục Nhập từ Excel).') + '</td></tr>';
  const fl = body.querySelector('tr.flash');
  if (fl) fl.scrollIntoView({ block: 'nearest' });
  $('#cl-foot', root).innerHTML = res.rows.length ? '<tr><td colspan="5" class="text-ink-2"><b>Cộng · ' + res.rows.length + ' dòng</b>' + (all.rows.length > rows.length ? ' <span class="font-normal">(đang hiện ' + rows.length + ')</span>' : '') + '</td><td class="num">' + slTotalHtml(res) + '</td><td></td>' +
    '<td class="num money"><span class="dbl">' + money(res.total) + '</span></td><td class="font-normal text-[12px] text-ink-3">' + new Set(res.rows.map((r) => KT.keyOf(r.maNCC))).size + ' NCC · ' + new Set(res.rows.map((r) => r.phieuId || r.id)).size + ' phiếu</td><td></td></tr>' : '';
  slState = res;
}

let slState = null;
// Danh sách số lượng theo từng ĐVT (nút "6 ĐVT ▾" ở dòng tổng)
function moDvt(btn) {
  const old = document.getElementById('dvt-pop');
  if (old) { old.remove(); return; }
  if (!slState) return;
  const units = Object.keys(slState.slTheoDvt).sort((a, b) => slState.slTheoDvt[b] - slState.slTheoDvt[a]);
  const pop = document.createElement('div');
  pop.id = 'dvt-pop';
  pop.className = 'menu !min-w-[200px] p-2';
  pop.innerHTML = '<div class="px-2 pb-1 text-[11.5px] font-bold text-ink-3">Số lượng theo đơn vị tính</div>' +
    units.map((u) => '<div class="flex justify-between gap-6 px-2 py-0.5 text-[13px] tabular-nums"><span>' + esc(u || '(không ĐVT)') + '</span><b>' + KT.fmtQty(slState.slTheoDvt[u]) + '</b></div>').join('');
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
  pop.style.top = (r.top + window.scrollY - pop.offsetHeight - 6) + 'px';
  const off = (e) => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', off, true); } };
  setTimeout(() => document.addEventListener('mousedown', off, true), 0);
}

function moreRow(n, total, cols) {
  return '<tr><td colspan="' + cols + '" class="text-[12.5px] text-ink-3">Đang hiện ' + n + ' dòng gần nhất trong ' + total + ' dòng. ' +
    '<button type="button" class="btn btn-ghost btn-sm no-print" data-act="more">Hiện thêm ' + Math.min(PAGE, total - n) + ' dòng cũ hơn</button>' +
    '<button type="button" class="btn btn-ghost btn-sm no-print" data-act="all">Hiện tất cả</button>' +
    '<span class="no-print"> Hoặc lọc theo kỳ để thu hẹp.</span></td></tr>';
}

// Tổng số lượng: một đơn vị thì ghi kèm ĐVT; nhiều đơn vị thì chỉ tách theo từng ĐVT (cộng lẫn m3 với kg không có nghĩa)
function slTotalHtml(res) {
  const units = Object.keys(res.slTheoDvt);
  if (units.length === 1) return '<span class="dbl">' + KT.fmtQty(res.tongSL) + '</span>' + (units[0] ? ' <span class="text-[12px] font-normal text-ink-3">' + esc(units[0]) + '</span>' : '');
  return '<button type="button" class="btn btn-secondary btn-sm no-print" data-act="dvt" title="Số lượng theo từng đơn vị tính (cộng lẫn m3 với kg không có nghĩa)">' + units.length + ' ĐVT ' + icon('caret') + '</button>' +
    '<span class="print-only text-[12px] font-medium">' + esc(units.sort((a, b) => res.slTheoDvt[b] - res.slTheoDvt[a]).map((u) => KT.fmtQty(res.slTheoDvt[u]) + ' ' + (u || '(không ĐVT)')).join(' · ')) + '</span>';
}

function rowHtml(r, q) {
  const bad = (ok, text) => (ok ? text : '<span class="code bad" title="Mã chưa có trong danh mục">' + text + '</span>');
  const nhap = KT.isDraft(r);
  const cls = [S.flash.has('costs:' + r.id) ? 'flash' : '', nhap ? 'draft' : ''].filter(Boolean).join(' ');
  return '<tr data-id="' + r.id + '" tabindex="0"' + (cls ? ' class="' + cls + '"' : '') + '>' +
    '<td class="whitespace-nowrap">' + fdate(r.ngay) + (nhap ? '<div><span class="chip chip-draft mt-1" title="Nháp: chưa ghi sổ, chưa tính vào chi phí và công nợ">' + icon('draft') + 'Nháp</span></div>' : '') + '</td>' +
    '<td class="whitespace-nowrap" data-edit="maNha">' + bad(r.ctHopLe, '<span class="code" title="' + esc(r.tenCT) + '">' + highlight(r.maCT, q) + '</span>') +
    (r.maNha && KT.keyOf(r.maNha) !== KT.keyOf(r.maCT) ? '<div class="sub" title="' + esc(r.tenNha) + '">' + bad(r.nhaHopLe, highlight(r.maNha, q)) + '</div>' : '') + '</td>' +
    '<td class="min-w-[150px]" data-edit="maHM">' + (r.hmHopLe ? highlight(r.tenHM, q) : '<span class="code bad">' + esc(r.maHM || '(trống)') + '</span>') +
    '<div class="sub"><span class="loai-tag" data-edit="loaiCP" title="Bấm đúp để đổi loại chi phí">' + highlight(r.loaiCP, q) + '</span> · ' + highlight(r.tenNhom, q) + '</div></td>' +
    '<td data-edit="maVT">' + (r.maVT ? bad(r.vtHopLe, '<span class="vt-code">' + highlight(r.maVT, q) + '</span>') + '<div class="sub">' + highlight(r.tenVT, q) + '</div>' : '') + '</td>' +
    '<td class="min-w-[140px] max-w-[240px]" data-edit="dienGiai">' + highlight(r.dienGiai, q) + clipHtml('costs', r.id) + clipHtml('slips', r.phieuId) + (r.ghiChu ? '<div class="text-[12.5px] text-ink-3">Ghi chú: ' + highlight(r.ghiChu, q) + '</div>' : '') + '</td>' +
    '<td class="num" data-edit="soLuong">' + KT.fmtQty(r.soLuong) + (r.dvt ? ' <span class="text-[12px] text-ink-3">' + esc(r.dvt) + '</span>' : '') + '</td>' +
    '<td class="num money" data-edit="donGia">' + (KT.isKhoan(r) ? '<span class="text-[12.5px] text-ink-3">theo khoản</span>' : highlight(money(r.donGia), q)) + '</td>' +
    '<td class="num money font-semibold" data-edit="thanhTien">' + highlight(money(r.thanhTien), q) + '</td>' +
    '<td data-edit="maNCC"><span class="block max-w-[140px] truncate" title="' + esc(r.maNCC) + '">' + bad(r.nccHopLe, highlight(r.tenNCC || r.maNCC, q)) + '</span>' +
    (r.soPhieu ? '<div class="sub">Phiếu ' + highlight(r.soPhieu, q) + '</div>' : '') + '</td>' +
    '<td class="actions no-print">' +
    (nhap ? '<button type="button" class="icon-btn" data-act="post" title="Ghi sổ cả phiếu nháp này" aria-label="Ghi sổ phiếu nháp của dòng ' + r.stt + '">' + icon('check') + '</button>' : '') +
    '<button type="button" class="icon-btn" data-act="slip" title="Mở cả phiếu nhập" aria-label="Mở phiếu của dòng ' + r.stt + '">' + icon('notePencil') + '</button>' +
    (KT.isLockedDate(S.all, r.ngay) ? '<button type="button" class="icon-btn" data-act="locked" title="' + esc(KT.lockMessage(KT.monthOf(r.ngay), 'sửa')) + '" aria-label="Tháng đã khóa sổ">' + icon('lock') + '</button>' :
      '<button type="button" class="icon-btn" data-act="edit" title="Sửa dòng" aria-label="Sửa dòng ' + r.stt + '">' + icon('edit') + '</button>' +
      '<button type="button" class="icon-btn" data-act="dup" title="Nhân bản dòng" aria-label="Nhân bản dòng ' + r.stt + '">' + icon('copy') + '</button>' +
      '<button type="button" class="icon-btn danger" data-act="del" title="Xóa dòng" aria-label="Xóa dòng ' + r.stt + '">' + icon('trash') + '</button>') +
    '</td></tr>';
}

/* ---------------- Sửa trực tiếp 1 ô ---------------- */
function inlineEdit(td) {
  const tr = td.closest('tr[data-id]');
  const c = S.all.costs.find((x) => x.id === Number(tr.dataset.id));
  if (!c) return;
  if (KT.isLockedDate(S.all, c.ngay)) { moKyKhoa(c.ngay, 'sửa'); return; }
  const field = td.dataset.edit;
  const old = td.innerHTML;
  let input;
  if (field === 'loaiCP') {
    input = document.createElement('select');
    input.innerHTML = KT.LOAI_CP.map((l) => '<option' + (l === c.loaiCP ? ' selected' : '') + '>' + esc(l) + '</option>').join('');
  } else {
    input = document.createElement('input');
    const lists = { maHM: 'dl-hm', maVT: 'dl-vt', maNCC: 'dl-suppliers', maNha: 'dl-nha' };
    if (lists[field]) input.setAttribute('list', lists[field]);
    const it = itemByCode(c.maHM);
    input.value = field === 'soLuong' ? KT.fmtQty(c.soLuong) : field === 'donGia' || field === 'thanhTien' ? (c[field] == null ? '' : money(c[field])) : field === 'maHM' ? (it ? it.ten : c.maHM) : (c[field] || '');
    if (field === 'soLuong' || field === 'donGia' || field === 'thanhTien') input.className = 'text-right';
  }
  input.classList.add('input', 'input-sm', 'inline-cell');
  td.innerHTML = '';
  td.appendChild(input);
  input.focus();
  if (input.select) input.select();
  let done = false;
  const cancel = () => { if (done) return; done = true; td.innerHTML = old; };
  const commit = async () => {
    if (done) return;
    let v = input.value.trim();
    const patch = {};
    if (field === 'maHM') { const code = resolveItem(v); if (!code) return fail('Hạng mục "' + v + '" chưa có trong danh mục'); patch.maHM = code; }
    else if (field === 'maVT') {
      const m = v ? materialByCode(v) : null;
      if (v && !m) return fail('Mã vật tư "' + v + '" chưa có trong danh mục');
      patch.maVT = m ? m.ma : '';
    } else if (field === 'maNCC') { const code = resolveCode(S.db.suppliers, v); if (!supplierByCode(code)) return fail('Nhà cung cấp "' + v + '" chưa có trong danh mục'); patch.maNCC = code; }
    else if (field === 'maNha') { const code = v ? resolveCode(S.db.houses, v) : ''; if (code && !houseByCode(code)) return fail('Nhà "' + v + '" chưa có trong danh mục'); patch.maNha = code; }
    // Xóa trống Số lượng hoặc Đơn giá: thành dòng theo khoản (không có SL, ĐG), giữ nguyên Thành tiền
    else if ((field === 'soLuong' || field === 'donGia') && !v) {
      if (KT.isKhoan(c)) { cancel(); return; }
      patch.soLuong = ''; patch.donGia = ''; patch.thanhTien = c.thanhTien;
    }
    else if (field === 'soLuong') { const n = KT.parseQty(v); if (isNaN(n) || n <= 0) return fail('Số lượng không hợp lệ'); patch.soLuong = n; }
    else if (field === 'donGia') { const n = KT.parseAmount(v); if (isNaN(n) || n < 0) return fail('Đơn giá không hợp lệ'); patch.donGia = n; }
    else if (field === 'thanhTien') {
      // Sửa Thành tiền: giữ Số lượng, máy chủ tính lại Đơn giá (dòng theo khoản: chỉ đổi Thành tiền)
      const n = KT.parseAmount(v);
      if (isNaN(n) || n <= 0) return fail('Thành tiền không hợp lệ');
      const r = KT.costFromInput(c.soLuong, null, n);
      if (r.loi) return fail(r.loi + ' (bấm nút Sửa dòng để đổi cả số lượng)');
      patch.donGia = ''; patch.thanhTien = n;
    }
    else patch[field] = v;
    done = true;
    try {
      await api('PUT', '/api/costs/' + c.id, payloadOf(c, patch));
      toast('Đã lưu');
    } catch (err) {
      showError(err);
      td.innerHTML = old;
    }
  };
  function fail(msg) { toast(msg, 'error'); input.classList.add('invalid'); input.focus(); }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
  });
  input.addEventListener('blur', () => setTimeout(() => { if (!done && document.activeElement !== input) cancel(); }, 150));
  if (field === 'loaiCP') input.addEventListener('change', commit);
}

/* ---------------- Sửa đủ các cột của 1 dòng ---------------- */
export function openCostLineForm(c) {
  const it = itemByCode(c.maHM);
  const body =
    '<form id="cl-form" class="grid grid-cols-3 gap-x-5 gap-y-4 max-md:grid-cols-2 max-sm:grid-cols-1" novalidate autocomplete="off">' +
    costDatalists(c.maCT) +
    '<label class="field"><span class="label">Ngày <b class="req">*</b></span>' + dateField({ name: 'ngay', value: c.ngay, required: true, label: 'Ngày' }) + '</label>' +
    fld('maCT', 'Công trình *', c.maCT, 'dl-projects') + fld('maNha', 'Nhà / khu', c.maNha, 'dl-nha') +
    fld('maNCC', 'Nhà cung cấp *', c.maNCC, 'dl-suppliers') + fld('soPhieu', 'Số phiếu / chuyến', c.soPhieu) + fld('maHM', 'Hạng mục *', it ? it.ten : c.maHM, 'dl-hm') +
    fld('maVT', 'Mã vật tư', c.maVT, 'dl-vt') +
    '<label class="field"><span class="label">Loại CP</span><select name="loaiCP" class="input">' + KT.LOAI_CP.map((l) => '<option' + (l === c.loaiCP ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></label>' +
    fld('dienGiai', 'Diễn giải / quy cách', c.dienGiai) +
    fld('soLuong', 'Số lượng', KT.fmtQty(c.soLuong), '', 'text-right') + fld('donGia', 'Đơn giá', KT.isKhoan(c) ? '' : money(c.donGia), '', 'text-right') +
    fld('thanhTien', 'Thành tiền *', money(c.thanhTien), '', 'text-right font-semibold') +
    '<p class="col-span-3 -mt-2 text-[12.5px] text-ink-3 max-md:col-span-2 max-sm:col-span-1">Nhập Số lượng và Đơn giá (Thành tiền tự tính), hoặc chỉ nhập Thành tiền cho khoản khoán (để trống Số lượng, Đơn giá).</p>' +
    '<label class="field col-span-3 max-md:col-span-2 max-sm:col-span-1"><span class="label">Ghi chú</span><input name="ghiChu" class="input" value="' + esc(c.ghiChu || '') + '"></label>' +
    '<p class="col-span-3 text-[12.5px] text-ink-3 max-md:col-span-2 max-sm:col-span-1">Đổi ngày, công trình, nhà, nhà cung cấp hoặc số phiếu của riêng dòng này thì dòng được tách thành phiếu riêng.</p>' +
    '</form>' + attachBlock('costs', c.id, { readonly: KT.isLockedDate(S.all, c.ngay) });
  openModal({
    title: 'Sửa dòng chi phí',
    size: 'wide',
    dismissible: false,
    body,
    footer: '<span class="flex-1"></span><button type="button" class="btn btn-ghost" data-act="cancel">Hủy</button><button type="button" class="btn btn-primary" data-act="save">Lưu thay đổi</button>',
    onMount(el, h) {
      bindAttach(el);
      const fm = $('#cl-form', el);
      const g = (n) => fm.elements[n];
      // Tự điền ô còn lại như ở phiếu nhập; ĐG có số lẻ (từ Excel) thì Thành tiền là gốc
      const so = { soLuong: g('soLuong').value, donGia: g('donGia').value, thanhTien: g('thanhTien').value,
        ttTuDong: !KT.isKhoan(c) && Number.isInteger(Number(c.donGia)), dgTuDong: !KT.isKhoan(c) && !Number.isInteger(Number(c.donGia)) };
      fm.addEventListener('input', (e) => {
        const n = e.target.name;
        if (!['soLuong', 'donGia', 'thanhTien'].includes(n)) return;
        so[n] = e.target.value;
        KT.syncCostInputs(so, n);
        ['donGia', 'thanhTien'].forEach((k) => { if (k !== n && g(k).value !== (so[k] || '')) g(k).value = so[k] || ''; });
        g('donGia').placeholder = so.dgTuDong && so.soLuong.trim() && so.thanhTien.trim() ? 'tự tính' : '';
      });
      const save = async () => {
        const data = {
          phieuId: c.phieuId, ngay: g('ngay').value, maCT: resolveCode(S.db.projects, g('maCT').value), maNha: g('maNha').value.trim() ? resolveCode(S.db.houses, g('maNha').value) : '',
          maNCC: resolveCode(S.db.suppliers, g('maNCC').value), soPhieu: g('soPhieu').value.trim(), maHM: resolveItem(g('maHM').value) || g('maHM').value.trim(),
          maVT: g('maVT').value.trim(), loaiCP: g('loaiCP').value, dienGiai: g('dienGiai').value.trim(),
          ghiChu: g('ghiChu').value.trim()
        };
        const val = (n, parse) => { const t = g(n).value.trim(); return t ? parse(t) : null; };
        const sl = val('soLuong', KT.parseQty);
        const dg = so.dgTuDong ? null : val('donGia', KT.parseAmount);
        const tt = val('thanhTien', KT.parseAmount);
        if (!KT.isISODate(data.ngay)) return bad('ngay', 'Ngày không hợp lệ');
        if (!projectByCode(data.maCT)) return bad('maCT', 'Công trình chưa có trong danh mục');
        if (!supplierByCode(data.maNCC)) return bad('maNCC', 'Nhà cung cấp chưa có trong danh mục');
        if (sl !== null && isNaN(sl)) return bad('soLuong', 'Số lượng không hợp lệ');
        if (dg !== null && (isNaN(dg) || dg < 0)) return bad('donGia', 'Đơn giá không hợp lệ');
        if (tt !== null && isNaN(tt)) return bad('thanhTien', 'Thành tiền không hợp lệ');
        const r = KT.costFromInput(sl, dg, tt, true);
        if (r.loi) return bad(r.cot, r.loi.charAt(0).toUpperCase() + r.loi.slice(1));
        Object.assign(data, { soLuong: sl === null ? '' : sl, donGia: dg === null ? '' : dg, thanhTien: tt === null ? '' : tt });
        try { await api('PUT', '/api/costs/' + c.id, data); toast('Đã lưu dòng chi phí'); h.close(); } catch (err) { showError(err); }
      };
      function bad(n, msg) { toast(msg, 'error'); fieldError(g(n), msg); }
      el.addEventListener('click', (e) => {
        const a = e.target.closest('[data-act]');
        if (!a) return;
        if (a.dataset.act === 'cancel') h.close();
        if (a.dataset.act === 'save') save();
      });
      fm.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } });
    }
  });
}

function fld(name, label, value, list, cls) {
  const req = label.endsWith(' *');
  return '<label class="field"><span class="label">' + esc(req ? label.slice(0, -2) : label) + (req ? ' <b class="req">*</b>' : '') + '</span>' +
    '<input name="' + name + '" class="input' + (cls ? ' ' + cls : '') + '" value="' + esc(value == null ? '' : value) + '"' + (list ? ' list="' + list + '"' : '') + '></label>';
}

export { groupName };
