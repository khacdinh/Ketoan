/* Tìm toàn cục (Ctrl K): phiếu, dòng sổ quỹ, nhà cung cấp, công trình, vật tư, dòng chi phí, số tiền (gõ 45tr để tìm 45.000.000). */
import { $, esc, money, fdate, icon, openModal, LS, debounce } from './ui.js';
import { S, vouchers, saveFilter } from './state.js';
import { datCongTrinh } from './ctpick.js';

const KT = window.KT;
const GIOI_HAN = 6;

function chuyenDen(hash) { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; }

export function timKiem(raw) {
  const q = String(raw || '').trim();
  if (!q) return [];
  const n = KT.normalizeText(q);
  const so = /^[\d.,\s+]+(k|tr|ty|tỷ|triệu|nghìn)?$/i.test(q) || /^\d+(tr|k|ty)$/i.test(q) ? KT.parseAmount(q) : NaN;
  const coSo = !isNaN(so) && so > 0;
  const nhom = [];
  const them = (tieuDe, items, tong) => { if (items.length) nhom.push({ tieuDe, items, tong: tong == null ? items.length : tong }); };
  const lay = (arr, fn) => { const out = []; let t = 0; for (const x of arr) { if (fn(x)) { t++; if (out.length < GIOI_HAN) out.push(x); } } return [out, t]; };

  // phiếu
  const [vs, vt] = lay(vouchers(), (v) => KT.normalizeText(v.soPhieu).includes(n) || (coSo && v.soTien === so));
  them('Phiếu thu / chi', vs.map((v) => ({ ten: v.soPhieu, phu: (v.loai === 'thu' ? 'Phiếu thu' : 'Phiếu chi') + ' · ' + fdate(v.ngay || (v.lines[0] && v.lines[0].ngay)), phai: money(v.soTien || 0), di: () => { S.selectedVoucher = v.key; chuyenDen('#/phieu'); } })), vt);
  // dòng sổ quỹ
  const [es, et] = lay(S.ledger, (e) => KT.normalizeText([e.soPhieu, e.noiDung, e.tenNCC, e.maNCC, e.tenDuAn, e.maDuAn, e.nguoiNhan, e.ghiChu].join(' ')).includes(n) || (coSo && (e.thu === so || e.chi === so)));
  them('Dòng sổ quỹ', es.map((e) => ({ ten: e.noiDung || e.soPhieu || '(không nội dung)', phu: fdate(e.ngay) + (e.soPhieu ? ' · ' + e.soPhieu : '') + (e.maDuAn ? ' · ' + e.maDuAn : ''), phai: money(e.thu || e.chi), di: () => { Object.assign(S.filters.so, { period: 'tat-ca', from: '', to: '', ncc: '', loai: '', q }); saveFilter('so'); chuyenDen('#/so-thu-chi'); } })), et);
  // nhà cung cấp
  const [ss, st] = lay(S.db.suppliers, (x) => KT.normalizeText(x.ma + ' ' + x.ten).includes(n));
  them('Nhà cung cấp', ss.map((x) => ({ ten: x.ten, phu: x.ma + (x.loai ? ' · ' + x.loai : ''), phai: 'Sổ chi tiết', di: () => { LS.set('sct.ncc', x.ma); chuyenDen('#/so-chi-tiet-ncc'); } })), st);
  // công trình
  const [ps, pt] = lay(S.db.projects, (x) => KT.normalizeText(x.ma + ' ' + x.ten).includes(n));
  them('Công trình', ps.map((x) => ({ ten: x.ten, phu: x.ma, phai: 'Chọn công trình', di: () => { datCongTrinh(x.ma); chuyenDen('#/cp-so'); } })), pt);
  // vật tư
  const [ms, mt] = lay(S.db.materials, (x) => KT.normalizeText(x.ma + ' ' + x.ten).includes(n));
  them('Vật tư', ms.map((x) => ({ ten: x.ten, phu: x.ma + (x.dvt ? ' · ' + x.dvt : ''), phai: 'Giá vật tư', di: () => { Object.assign(S.filters.cpGia, { q: '', ncc: '', hm: '', vt: x.ma }); saveFilter('cpGia'); chuyenDen('#/cp-gia'); } })), mt);
  // dòng chi phí
  const [cs, ct] = lay(S.costLedger, (c) => KT.normalizeText([c.dienGiai, c.tenVT, c.maVT, c.tenNCC, c.maNCC, c.soPhieu].join(' ')).includes(n) || (coSo && c.thanhTien === so));
  them('Dòng chi phí công trình', cs.map((c) => ({ ten: c.tenVT || c.dienGiai || c.maVT || '(dòng chi phí)', phu: fdate(c.ngay) + ' · ' + (c.maCT || '') + (c.tenNCC ? ' · ' + c.tenNCC : ''), phai: money(c.thanhTien), di: () => { Object.assign(S.filters.cpSo, { period: 'tat-ca', from: '', to: '', nha: '', nhom: '', hm: '', loai: '', ncc: '', vt: '', q }); saveFilter('cpSo'); chuyenDen('#/cp-so'); } })), ct);
  return nhom;
}

export function moTimKiem() {
  let ket = [];
  let act = 0;
  const m = openModal({
    title: 'Tìm trong sổ',
    size: 'wide',
    body: '<div class="search">' + icon('search') + '<input id="gs-q" type="search" class="input" autocomplete="off" aria-label="Tìm trong sổ" placeholder="Tìm phiếu, NCC, vật tư, số tiền (gõ 45tr để tìm 45.000.000)"></div>' +
      '<div id="gs-res" class="mt-3 max-h-[56vh] overflow-auto" role="listbox" aria-live="polite"><p class="py-8 text-center text-ink-3">Gõ số phiếu, tên nhà cung cấp, tên vật tư, nội dung hoặc số tiền.</p></div>',
    footer: '<span class="text-[12px] text-ink-3"><kbd>↑</kbd> <kbd>↓</kbd> chọn · <kbd>Enter</kbd> mở · <kbd>Esc</kbd> đóng</span><span class="flex-1"></span><button type="button" class="btn btn-ghost" data-act="cancel">Đóng</button>',
    onMount(el, h) {
      const q = $('#gs-q', el);
      const res = $('#gs-res', el);
      const phang = () => ket.reduce((a, g) => a.concat(g.items), []);
      const ve = () => {
        if (!q.value.trim()) { res.innerHTML = '<p class="py-8 text-center text-ink-3">Gõ số phiếu, tên nhà cung cấp, tên vật tư, nội dung hoặc số tiền.</p>'; return; }
        if (!ket.length) { res.innerHTML = '<p class="py-8 text-center text-ink-3">Không thấy kết quả nào cho “' + esc(q.value) + '”.</p>'; return; }
        let i = 0;
        res.innerHTML = ket.map((g) => '<div class="mb-2"><div class="px-2 pb-1 text-[11px] font-bold text-ink-3">' + esc(g.tieuDe) + (g.tong > g.items.length ? ' · ' + g.tong + ' kết quả, hiện ' + g.items.length : '') + '</div>' +
          g.items.map((it) => { const k = i++; return '<button type="button" role="option" data-i="' + k + '" class="flex w-full cursor-pointer items-baseline gap-3 border-b border-rule px-2 py-1.5 text-left hover:bg-accent-100' + (k === act ? ' bg-accent-100' : '') + '" aria-selected="' + (k === act) + '">' +
            '<span class="min-w-0 flex-1"><b class="block truncate font-bold">' + esc(it.ten) + '</b><span class="text-[11.5px] text-ink-3">' + esc(it.phu) + '</span></span><span class="text-[12.5px] tabular-nums text-ink-2">' + esc(it.phai) + '</span></button>'; }).join('') + '</div>').join('');
        const cur = res.querySelector('[data-i="' + act + '"]');
        if (cur) cur.scrollIntoView({ block: 'nearest' });
      };
      const chay = () => { act = 0; ket = timKiem(q.value); ve(); };
      q.addEventListener('input', debounce(chay, 90));
      const mo = (k) => { const it = phang()[k]; if (it) { h.close(); it.di(); } };
      q.addEventListener('keydown', (e) => {
        const n = phang().length;
        if (e.key === 'ArrowDown') { e.preventDefault(); act = Math.min(n - 1, act + 1); ve(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); act = Math.max(0, act - 1); ve(); }
        else if (e.key === 'Enter') { e.preventDefault(); mo(act); }
      });
      res.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) mo(Number(b.dataset.i)); });
      el.addEventListener('click', (e) => { if (e.target.closest('[data-act=cancel]')) h.close(); });
    }
  });
  return m;
}
