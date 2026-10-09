/* Phân tích (BI): bảng và biểu đồ tự chọn chỉ số / hàng / cột, tuổi nợ NCC, công nợ theo tháng, xuất dữ liệu cho Power BI / Excel.
 * Mọi số đều lấy từ KT.phanTichChiPhi / tuoiNo / congNoTheoThang (shared.js), cùng nguồn với Sổ chi phí và Công nợ nên luôn khớp.
 * Bấm vào cột / ô / thanh để mở sổ chi tiết đã lọc sẵn. Biểu đồ tự vẽ bằng SVG, chạy offline. */
import { $, esc, money, icon, download, periodControls, bindPeriodControls, refreshPeriod, freshRoot, LS, setPageActions, setPageTitle, setPageTags, openModal, toast } from '../ui.js';
import { S, saveFilter } from '../state.js';
import { printView } from '../print.js';
import { datCongTrinh } from '../ctpick.js';

const KT = window.KT;

/* ---------- báo cáo có sẵn và báo cáo đã lưu ---------- */
const CO_SAN = [
  { id: 'chi-phi-thang', ten: 'Chi phí theo tháng', loai: 'pivot', chiSo: 'chiPhi', hang: 'ct', cot: 'thang', mau: 'loai' },
  { id: 'tuoi-no', ten: 'Tuổi nợ NCC', loai: 'tuoi-no' },
  { id: 'cong-no-thang', ten: 'Công nợ theo tháng', loai: 'cong-no-thang' },
  { id: 'nhom-ct', ten: 'Chi phí nhóm × công trình', loai: 'pivot', chiSo: 'chiPhi', hang: 'nhom', cot: 'ct', mau: 'loai' },
  { id: 'gia-vat-tu', ten: 'Giá vật tư theo NCC', loai: 'pivot', chiSo: 'giaTB', hang: 'vt', cot: 'ncc', mau: 'loai' }
];
const daLuu = () => LS.get('bi.saved', []);
const tatCa = () => CO_SAN.concat(daLuu());
const CHI_SO = [['chiPhi', 'Chi phí phát sinh'], ['giaTB', 'Đơn giá trung bình']];
const HANG = ['ct', 'ncc', 'nhom', 'hm', 'vt', 'loai'];
const COT = ['thang', 'quy', 'nam', 'loai', 'nhom', 'ct', 'ncc'];
const MAU = [['loai', 'Loại chi phí'], ['nhom', 'Nhóm chi phí'], ['', 'Một màu']];
const KY = [['thang', 'Tháng'], ['quy', 'Quý'], ['nam', 'Năm'], ['khoang', 'Khoảng ngày'], ['tat-ca', 'Toàn bộ']];
const TUOI = ['0–30 ngày', '31–60 ngày', '61–90 ngày', 'Trên 90 ngày'];
// màu đã kiểm tra mù màu: vàng, xanh thép, xanh rêu (+ xám cho "Khác"); loại chi phí giữ màu theo tên
const MAU_LOAI = { 'Vật tư': '#A57A12', 'Nhân công': '#2E6DAA', 'Dịch vụ-Phí': '#6E8B2B' };
const MAU_HANG = ['#A57A12', '#2E6DAA', '#6E8B2B'];
const MAU_KHAC = '#8E8B83';
const MAU_TUOI = ['#CDB26A', '#B8963F', '#8F7230', '#50411B'];
const HEAT = ['#F6F0DD', '#EBDFBC', '#DDCB96', '#CDB26A', '#B8963F'];

const thangNgan = (m) => m.slice(5, 7) + '/' + m.slice(2, 4);
const thangDai = (m) => m.slice(5, 7) + '/' + m.slice(0, 4);
const ngayVN = (d) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '');
const pct = (x) => (x * 100).toFixed(1).replace('.', ',') + '%';
const ty = (n, d) => (n / 1e9).toFixed(d == null ? 1 : d).replace('.', ',') + ' tỷ';
const dash = '<span class="text-ink-3">–</span>';
const ngayHomNay = () => KT.todayISO();

function nice(max, n) {
  const raw = (max || 1) / (n || 4);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((x) => x * p).find((x) => x >= raw);
  return { step, top: Math.ceil((max || 1) / step) * step };
}
const nhanTruc = (v) => (v === 0 ? '0' : v >= 1e9 ? (v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' tỷ' : v >= 1e6 ? (v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + ' tr' : v.toLocaleString('vi-VN'));

/* ---------- trạng thái ---------- */
function trangThai() {
  const f = S.filters.bi || (S.filters.bi = {});
  if (!f.rep || !tatCa().some((r) => r.id === f.rep)) f.rep = 'chi-phi-thang';
  if (!f.period) f.period = 'tat-ca';
  if (!f.cfg) f.cfg = Object.assign({}, tatCa().find((r) => r.id === f.rep));
  f.loaiCP = f.loaiCP || ''; f.nhom = f.nhom || ''; f.ncc = f.ncc || '';
  if (!['cot', 'duong', 'bang'].includes(f.xem)) f.xem = 'cot';
  if (!['dong', 'nghin', 'trieu'].includes(f.dv)) f.dv = 'trieu';
  if (!KT.isISODate(f.den)) f.den = ngayHomNay();
  refreshPeriod(f);
  return f;
}
const loc = (f) => ({ from: f.from, to: f.to, ct: S.ct && S.ct !== '__none__' ? S.ct : '', loaiCP: f.loaiCP, nhom: f.nhom, ncc: f.ncc });

/* ---------- mở sổ chi tiết đã lọc ---------- */
function moSoChiPhi(d) {
  const f = S.filters.cpSo;
  Object.assign(f, { nha: '', nhom: d.nhom || '', hm: d.hm || '', loai: d.loai || '', ncc: d.ncc || '', vt: d.vt || '', q: '' });
  if (d.from) Object.assign(f, { period: 'khoang', from: d.from, to: d.to, rel: false }); else Object.assign(f, { period: 'tat-ca', from: '', to: '', rel: false });
  datCongTrinh(d.ct != null ? d.ct : S.ct, true);
  saveFilter('cpSo');
  location.hash = '#/cp-so';
}
function khoangCua(chieu, k) {
  if (chieu === 'thang') { const u = KT.periodUnit('thang', k + '-01'); return { from: u.from, to: u.to }; }
  if (chieu === 'quy') { const m = (Number(k.slice(-1)) - 1) * 3 + 1; const u = KT.periodUnit('quy', k.slice(0, 4) + '-' + (m < 10 ? '0' : '') + m + '-01'); return { from: u.from, to: u.to }; }
  if (chieu === 'nam') return { from: k + '-01-01', to: k + '-12-31' };
  return {};
}
function dungDieuKien(chieu, k, d) {
  if (k === '__khac__') return;
  if (['thang', 'quy', 'nam'].includes(chieu)) Object.assign(d, khoangCua(chieu, k));
  else if (chieu === 'ct') d.ct = k; else if (chieu === 'loai') d.loai = k; else d[chieu] = k;
}

/* ---------- tooltip và bắt sự kiện cho vùng bấm ---------- */
function gan(box, html, click) {
  const tip = document.createElement('div');
  tip.className = 'bi-tip'; tip.hidden = true;
  box.appendChild(tip);
  const hit = (e) => e.target.closest('[data-i]');
  box.addEventListener('mousemove', (e) => {
    const h = hit(e);
    if (!h) { tip.hidden = true; return; }
    tip.innerHTML = html(Number(h.dataset.i)); tip.hidden = false;
    const b = box.getBoundingClientRect();
    let x = e.clientX - b.left + 14;
    if (x + tip.offsetWidth > b.width) x = e.clientX - b.left - tip.offsetWidth - 14;
    tip.style.left = Math.max(0, x) + 'px';
    tip.style.top = Math.max(0, Math.min(e.clientY - b.top - 10, b.height - tip.offsetHeight)) + 'px';
  });
  box.addEventListener('mouseleave', () => { tip.hidden = true; });
  box.addEventListener('click', (e) => { const h = hit(e); if (h && click) click(Number(h.dataset.i)); });
}
const tipDong = (mau, ten, v, cls) => '<div class="r' + (cls ? ' ' + cls : '') + '">' + (mau ? '<i class="bi-sw" style="--c:' + mau + '"></i>' : '') + '<span>' + esc(ten) + '</span><b>' + (v == null ? '' : v) + '</b></div>';

/* ---------- biểu đồ ---------- */
// cats: [{ t }]; series: [{ t, color, v: [] }]; kieu: 'cot' (cột chồng) | 'duong'
function bieuDoCot(el, cats, series, kieu, nhanDinh) {
  const W = Math.max(360, el.clientWidth), H = 300, m = { l: 54, r: 14, t: 26, b: 30 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const tong = cats.map((_, i) => series.reduce((t, s) => t + (s.v[i] || 0), 0));
  const maxV = kieu === 'duong' ? Math.max(0, ...series.map((s) => Math.max(0, ...s.v))) : Math.max(0, ...tong);
  const { step, top } = nice(maxV, 4);
  const y = (v) => m.t + ih - (v / top) * ih;
  const slot = iw / Math.max(1, cats.length);
  const bw = Math.min(24, slot * 0.7);
  let s = '';
  for (let v = 0; v <= top + 1; v += step) s += '<line class="g" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="ax" x="' + (m.l - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + nhanTruc(v) + '</text>';
  const cx = (i) => m.l + (i + 0.5) * slot;
  const buoc = Math.max(1, Math.ceil(cats.length / Math.max(2, Math.floor(iw / 56))));
  cats.forEach((c, i) => { if (i % buoc === 0) s += '<text class="ax" x="' + cx(i) + '" y="' + (H - 9) + '" text-anchor="middle">' + esc(c.t) + '</text>'; });
  const dinh = tong.indexOf(maxV);
  if (kieu === 'cot') {
    cats.forEach((c, i) => {
      let acc = 0;
      series.forEach((sr) => {
        const v = sr.v[i] || 0;
        if (!v) return;
        const h = y(acc) - y(acc + v) - (acc > 0 ? 2 : 0);
        if (h > 0.4) s += '<rect class="mk" x="' + (cx(i) - bw / 2).toFixed(1) + '" y="' + y(acc + v).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="' + sr.color + '"/>';
        acc += v;
      });
      if (i === dinh && maxV > 0) s += '<text class="val" x="' + cx(i) + '" y="' + (y(tong[i]) - 7) + '" text-anchor="middle">' + ty(tong[i]) + '</text>';
    });
  } else {
    series.forEach((sr) => {
      const p = cats.map((_, i) => cx(i).toFixed(1) + ',' + y(sr.v[i] || 0).toFixed(1));
      s += '<polyline class="ln" style="stroke:' + sr.color + '" points="' + p.join(' ') + '"/>';
      if (cats.length <= 24) cats.forEach((_, i) => { s += '<circle class="dot" style="fill:' + sr.color + '" cx="' + cx(i).toFixed(1) + '" cy="' + y(sr.v[i] || 0).toFixed(1) + '" r="4"/>'; });
    });
  }
  s += '<line class="base" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(0) + '" y2="' + y(0) + '"/>';
  cats.forEach((_, i) => { s += '<rect class="bi-hit" data-i="' + i + '" x="' + (m.l + i * slot).toFixed(1) + '" y="' + m.t + '" width="' + slot.toFixed(1) + '" height="' + ih + '"/>'; });
  el.innerHTML = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(nhanDinh) + '">' + s + '</svg>';
  return tong;
}
const chuGiai = (xs) => '<div class="bi-legend">' + xs.map(([t, c, kieu]) => '<span><i class="bi-sw' + (kieu === 'line' ? ' line' : '') + '" style="--c:' + c + '"></i>' + esc(t) + '</span>').join('') + '</div>';
const nhanXem = (xem, co) => '<div class="seg seg-sm" role="radiogroup" aria-label="Xem dưới dạng">' + [['bang', 'Bảng', 'ph-table'], ['cot', 'Cột', 'ph-chart-bar-horizontal'], ['duong', 'Đường', 'ph-chart-line-up']].filter((x) => co.includes(x[0])).map(([v, l, ic]) =>
  '<label class="seg-item"><input type="radio" name="bi-xem" value="' + v + '"' + (xem === v ? ' checked' : '') + '><span><i class="ph ' + ic + ' mr-1" aria-hidden="true"></i>' + l + '</span></label>').join('') + '</div>';
const the = (lbl, val, sub) => '<div class="stat"><div class="stat-label">' + esc(lbl) + '</div><div class="stat-value">' + val + '</div>' + (sub ? '<div class="stat-sub">' + sub + '</div>' : '') + '</div>';
const the4 = (xs) => '<div class="stats bi-stats">' + xs.join('') + '</div>';
const the_ = (t, note, extra, body) => '<section class="sheet bi-card"><div class="bi-card-head"><div><h3 class="sheet-title">' + esc(t) + '</h3><p class="sheet-note">' + esc(note) + '</p></div>' + (extra || '') + '</div>' + body + '</section>';

/* ---------- màn hình ---------- */
export function renderAnalytics(root) {
  root = freshRoot(root);
  const f = trangThai();
  const cfg = f.cfg;
  const ct = S.ct && S.ct !== '__none__' ? S.ct : '';
  const luu = () => saveFilter('bi');
  const L = KT.buildCostLedger(S.db);
  const nccCoCP = Array.from(new Set(S.db.costs.map((c) => c.maNCC).filter(Boolean)));
  const ten = (ma) => { const x = S.db.suppliers.find((s) => KT.keyOf(s.ma) === KT.keyOf(ma)); return x ? x.ten : ma; };
  void L;

  setPageTitle('Phân tích', 'Chọn chỉ số, chia theo hàng / cột, lọc — số liệu tính cùng cách với Sổ chi phí và Công nợ nên luôn khớp');
  setPageTags(f.rep.startsWith('u') ? '<span class="tag tag-neutral">Báo cáo của bạn</span>' : '');
  setPageActions('<button type="button" class="btn btn-secondary" data-act="luu">' + icon('save') + 'Lưu báo cáo</button>' +
    '<button type="button" class="btn btn-secondary" data-act="print">' + icon('print') + 'In</button>' +
    '<button type="button" class="btn btn-secondary" data-act="excel">' + icon('excel') + 'Xuất Excel</button>' +
    '<button type="button" class="btn btn-primary" data-act="bi">' + icon('database') + 'Xuất dữ liệu cho BI</button>', (act) => {
    if (act === 'luu') luuBaoCao();
    else if (act === 'print') printView('PHÂN TÍCH · ' + tenBaoCao().toUpperCase(), moTaLoc(), S.db.settings);
    else if (act === 'excel') download('/api/export/phan-tich?' + thamSo());
    else if (act === 'bi') xuatBI();
  });

  const tenBaoCao = () => { const r = tatCa().find((x) => x.id === f.rep); return r ? r.ten : 'Báo cáo'; };
  const moTaLoc = () => [cfg.loai === 'tuoi-no' ? 'Tính đến ' + ngayVN(f.den) : KT.describeRange(f.from, f.to), ct ? 'Công trình ' + ct : 'Tất cả công trình', f.loaiCP ? 'Loại CP ' + f.loaiCP : '', f.nhom ? 'Nhóm ' + f.nhom : '', f.ncc ? 'NCC ' + ten(f.ncc) : ''].filter(Boolean).join(' · ');
  const thamSo = () => {
    const p = new URLSearchParams({ loai: cfg.loai });
    if (cfg.loai === 'tuoi-no') p.set('to', f.den);
    else { if (f.from) p.set('from', f.from); if (f.to) p.set('to', f.to); }
    if (ct) p.set('ct', ct);
    if (cfg.loai === 'pivot') { p.set('chiSo', cfg.chiSo); p.set('hang', cfg.hang); if (cfg.cot) p.set('cot', cfg.cot); if (f.loaiCP) p.set('loaiCP', f.loaiCP); if (f.nhom) p.set('nhom', f.nhom); if (f.ncc) p.set('ncc', f.ncc); }
    return p.toString();
  };

  const baoCaoBar = '<div class="bi-reports"><span class="bi-k">Báo cáo đã lưu</span><div class="seg" role="radiogroup" aria-label="Báo cáo">' +
    tatCa().map((r) => '<label class="seg-item"><input type="radio" name="bi-r" value="' + esc(r.id) + '"' + (r.id === f.rep ? ' checked' : '') + '><span>' + esc(r.ten) + '</span></label>').join('') + '</div>' +
    (f.rep.startsWith('u') ? '<button type="button" class="btn btn-ghost btn-sm" data-act="xoa-bc" title="Xóa báo cáo đã lưu này">' + icon('trash') + 'Xóa</button>' : '') +
    '<button type="button" class="btn btn-ghost btn-sm" data-act="bc-moi">' + icon('plus') + 'Báo cáo mới</button></div>';

  const sel = (id, lbl, opts, v) => '<label class="bi-pick' + (v ? ' on' : '') + '"><span class="bi-pick-l">' + lbl + '</span><select id="' + id + '" class="bi-sel" aria-label="' + lbl + '">' +
    opts.map(([k, t]) => '<option value="' + esc(k) + '"' + (k === v ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></label>';
  const tenChieu = (k) => (KT.biChieu[k] || ['?'])[0];
  const co = (lbl, v) => '<div class="bi-pick on"><span class="bi-pick-l">' + lbl + '</span><span class="bi-pick-v">' + v + '</span></div>';
  const loaiList = KT.LOAI_CP.map((l) => [l, l]);
  const nhomList = S.db.costGroups.map((g) => [g.ma, g.ten]);
  const nccList = nccCoCP.map((m) => [m, ten(m)]).sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  let builder = '<div class="bi-builder">';
  if (cfg.loai === 'pivot') {
    builder += sel('bi-chiso', 'Chỉ số', CHI_SO, cfg.chiSo) + sel('bi-hang', 'Hàng', HANG.map((k) => [k, tenChieu(k)]), cfg.hang) +
      sel('bi-cot', 'Cột', COT.map((k) => [k, tenChieu(k)]).concat([['', 'Không chia cột']]), cfg.cot) + (cfg.chiSo === 'chiPhi' ? sel('bi-mau', 'Màu theo', MAU, cfg.mau || '') : '');
  } else if (cfg.loai === 'tuoi-no') {
    builder += co('Chỉ số', 'Còn phải trả') + co('Hàng', 'Nhà cung cấp') + co('Cột', 'Tuổi nợ') +
      '<label class="bi-pick on"><span class="bi-pick-l">Tính đến</span><input type="date" id="bi-den" class="bi-sel" value="' + esc(f.den) + '" aria-label="Tính đến ngày"></label>';
  } else {
    builder += co('Chỉ số', 'Phát sinh · Thanh toán · Còn phải trả') + co('Hàng', 'Tháng') + co('Tách theo', 'NCC lớn nhất');
  }
  builder += '<span class="bi-sep"></span>' + (cfg.loai === 'tuoi-no' ? '' : periodControls(f, 'bi') + '<span class="bi-sep"></span>') + '<span class="bi-k">Lọc</span>' +
    (ct ? '<span class="filter-chip">Công trình: ' + esc(ct) + '</span>' : '') +
    (cfg.loai === 'pivot' ? sel('bi-loai', 'Loại CP', [['', 'Tất cả']].concat(loaiList), f.loaiCP) + sel('bi-nhom', 'Nhóm', [['', 'Tất cả']].concat(nhomList), f.nhom) + sel('bi-ncc', 'NCC', [['', 'Tất cả']].concat(nccList), f.ncc) : '') +
    (!ct && cfg.loai !== 'pivot' ? '<span class="text-[12.5px] text-ink-3">Chọn công trình ở thanh trên để lọc</span>' : '') +
    ((f.loaiCP || f.nhom || f.ncc) ? '<button type="button" class="btn btn-ghost btn-sm" data-act="xoa-loc">' + icon('x') + 'Xóa lọc</button>' : '') + '</div>';

  root.innerHTML = '<div class="print-only" id="print-head"></div>' + '<div class="no-print flex flex-col gap-3">' + baoCaoBar + builder + '</div><div id="bi-body" class="flex flex-col gap-4"></div>';

  /* ----- sự kiện thanh trên ----- */
  const veLai = () => { luu(); renderAnalytics(root); };
  root.querySelectorAll('input[name=bi-r]').forEach((r) => r.addEventListener('change', () => {
    const bc = tatCa().find((x) => x.id === r.value);
    const lc = bc.loc || {};
    f.rep = r.value; f.cfg = Object.assign({}, bc); f.loaiCP = lc.loaiCP || ''; f.nhom = lc.nhom || ''; f.ncc = lc.ncc || '';
    veLai();
  }));
  const doi = (id, k, ngoai) => { const e = $('#' + id, root); if (e) e.addEventListener('change', () => { if (ngoai) f[k] = e.value; else cfg[k] = e.value; veLai(); }); };
  doi('bi-chiso', 'chiSo'); doi('bi-hang', 'hang'); doi('bi-cot', 'cot'); doi('bi-mau', 'mau'); doi('bi-loai', 'loaiCP', true); doi('bi-nhom', 'nhom', true); doi('bi-ncc', 'ncc', true);
  const den = $('#bi-den', root);
  if (den) den.addEventListener('change', () => { if (KT.isISODate(den.value)) { f.den = den.value; luu(); draw(); } });
  if (cfg.loai !== 'tuoi-no') bindPeriodControls(root, f, 'bi', () => { luu(); draw(); });
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'xoa-loc') { f.loaiCP = f.nhom = f.ncc = ''; veLai(); }
    else if (a.dataset.act === 'bc-moi') { f.rep = 'chi-phi-thang'; f.cfg = Object.assign({}, CO_SAN[0]); f.loaiCP = f.nhom = f.ncc = ''; veLai(); }
    else if (a.dataset.act === 'xoa-bc') {
      LS.set('bi.saved', daLuu().filter((r) => r.id !== f.rep)); f.rep = 'chi-phi-thang'; f.cfg = Object.assign({}, CO_SAN[0]); toast('Đã xóa báo cáo.', 'info'); veLai();
    }
  });

  /* ----- lưu báo cáo ----- */
  function luuBaoCao() {
    const goiY = (cfg.loai === 'pivot' ? tenChieu(cfg.hang) + ' × ' + (cfg.cot ? tenChieu(cfg.cot) : 'tổng') : tenBaoCao());
    const h = openModal({
      title: 'Lưu báo cáo', size: 'small',
      body: '<label class="block text-[13px] font-semibold" for="bi-ten">Tên báo cáo</label><input id="bi-ten" class="input mt-1 w-full" maxlength="60" value="' + esc(goiY) + '">' +
        '<p class="mt-2 text-[12.5px] text-ink-3">Lưu cách chia hàng / cột và các điều kiện lọc hiện tại (không lưu kỳ và công trình đang chọn). Báo cáo hiện ở hàng “Báo cáo đã lưu” trên máy này.</p>',
      footer: '<button type="button" class="btn btn-secondary" data-x="1">Hủy</button><button type="button" class="btn btn-primary" data-ok="1">Lưu</button>'
    });
    h.el.querySelector('[data-x]').addEventListener('click', () => h.close());
    const ok = () => {
      const t = $('#bi-ten', h.el).value.trim();
      if (!t) { toast('Nhập tên báo cáo.', 'error'); return; }
      const ds = daLuu();
      const id = 'u' + Date.now().toString(36);
      ds.push({ id, ten: t, loai: cfg.loai, chiSo: cfg.chiSo, hang: cfg.hang, cot: cfg.cot, mau: cfg.mau, loc: { loaiCP: f.loaiCP, nhom: f.nhom, ncc: f.ncc } });
      LS.set('bi.saved', ds);
      f.rep = id; f.cfg = Object.assign({}, ds[ds.length - 1]); h.close(); toast('Đã lưu báo cáo “' + t + '”.', 'ok'); veLai();
    };
    h.el.querySelector('[data-ok]').addEventListener('click', ok);
    $('#bi-ten', h.el).addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  }
  /* ----- xuất dữ liệu cho BI ----- */
  function xuatBI() {
    const bangs = KT.biBang(S.db, { from: f.from, to: f.to });
    const h = openModal({
      title: 'Xuất dữ liệu cho BI', size: 'wide',
      body: '<p class="mb-3 text-[13px] text-ink-2">Xuất một file gồm nhiều bảng phẳng để mở bằng <b>Power BI Desktop</b> (miễn phí) hoặc <b>Excel PivotTable</b>. Mỗi lần xuất cùng một tên file, ghi đè vào cùng chỗ, bên Power BI chỉ cần bấm <b>Refresh</b>.</p>' +
        '<table class="ledger"><thead><tr><th></th><th>Bảng</th><th>Nội dung</th><th class="num">Số dòng</th></tr></thead><tbody>' +
        bangs.map((b) => '<tr><td><input type="checkbox" class="size-4 accent-pen" data-bang="' + esc(b.ten) + '" checked aria-label="Xuất bảng ' + esc(b.ten) + '"></td><td><b class="code">' + esc(b.ten) + '</b></td><td class="text-[12.5px] text-ink-2">' + esc(b.mota) + '</td><td class="num">' + b.dong.length.toLocaleString('vi-VN') + '</td></tr>').join('') +
        '</tbody></table>' +
        '<div class="bi-form"><span class="bi-k">Kỳ của bảng công nợ</span><div><b>' + esc(KT.describeRange(f.from, f.to)) + '</b> <span class="text-ink-3">· đổi kỳ ở màn Phân tích trước khi xuất</span></div>' +
        '<span class="bi-k">Định dạng</span><div class="seg seg-sm"><label class="seg-item"><input type="radio" name="bi-f" value="xlsx" checked><span>Excel (.xlsx), mỗi bảng một sheet</span></label><label class="seg-item"><input type="radio" name="bi-f" value="csv"><span>CSV, mỗi bảng một file (.zip)</span></label></div></div>' +
        '<p class="mt-3 flex items-start gap-1.5 text-[12.5px] text-ink-3"><i class="ph ph-info mt-0.5" aria-hidden="true"></i><span>File nằm trong thư mục Downloads với tên <b>KeToan_BI.xlsx</b>. Bảng <b>CongNo_NCC_CongTrinh</b> do phần mềm tính sẵn, nên số trong Power BI khớp đúng màn Công nợ. Người chỉ có quyền xem không xuất được file này.</span></p>',
      footer: '<span class="flex-1 text-[12.5px] text-ink-3" id="bi-tong"></span><button type="button" class="btn btn-secondary" data-x="1">Hủy</button><button type="button" class="btn btn-primary" data-ok="1">' + icon('download') + 'Xuất dữ liệu</button>'
    });
    const dem = () => {
      const c = Array.from(h.el.querySelectorAll('[data-bang]:checked')).map((x) => x.dataset.bang);
      const n = bangs.filter((b) => c.includes(b.ten)).reduce((t, b) => t + b.dong.length, 0);
      $('#bi-tong', h.el).textContent = c.length + ' bảng · ' + n.toLocaleString('vi-VN') + ' dòng';
      return c;
    };
    h.el.addEventListener('change', dem); dem();
    h.el.querySelector('[data-x]').addEventListener('click', () => h.close());
    h.el.querySelector('[data-ok]').addEventListener('click', () => {
      const c = dem();
      if (!c.length) { toast('Chọn ít nhất một bảng.', 'error'); return; }
      const p = new URLSearchParams({ fmt: h.el.querySelector('input[name=bi-f]:checked').value });
      if (f.from) p.set('from', f.from); if (f.to) p.set('to', f.to);
      c.forEach((x) => p.append('bang', x));
      h.close(); download('/api/export/bi?' + p.toString());
    });
  }

  /* ---------- phần thân ---------- */
  const body = $('#bi-body', root);
  function draw() {
    if (cfg.loai === 'tuoi-no') body.innerHTML = thanTuoiNo();
    else if (cfg.loai === 'cong-no-thang') body.innerHTML = thanCongNo();
    else body.innerHTML = thanPivot();
    if (cfg.loai === 'tuoi-no') veTuoiNo(); else if (cfg.loai === 'cong-no-thang') veCongNo(); else vePivot();
    root.querySelectorAll('input[name=bi-xem]').forEach((r) => r.addEventListener('change', () => { f.xem = r.value; luu(); draw(); }));
    root.querySelectorAll('input[name=bi-dv]').forEach((r) => r.addEventListener('change', () => { f.dv = r.value; luu(); draw(); }));
  }

  /* ----- A. bảng hai chiều ----- */
  let pv = null, thangChart = null, nhomPv = null, nccPv = null;
  function thanPivot() {
    const b = loc(f);
    const gia = cfg.chiSo === 'giaTB';
    pv = KT.phanTichChiPhi(S.db, Object.assign({}, b, { chiSo: cfg.chiSo, hang: cfg.hang, cot: cfg.cot, topHang: 12, topCot: 8 }));
    let html = '';
    if (!pv.soDong) return '<section class="sheet p-10 text-center text-ink-3">Không có dữ liệu khớp bộ lọc.</section>';
    if (gia) {
      html += the4([the('Số dòng có số lượng', pv.soDong.toLocaleString('vi-VN'), 'dòng khoán (không có số lượng) không tính vào đơn giá'), the(tenChieu(cfg.hang) + ' trong bảng', String(pv.hang.length), pv.cot.length + ' cột'),
        the('Đơn giá trung bình chung', money(pv.tong), 'tổng thành tiền ÷ tổng số lượng'), '<div class="stat"></div>']);
      return html + bangHai(true);
    }
    const th = KT.phanTichChiPhi(S.db, Object.assign({}, b, { chiSo: 'chiPhi', hang: 'thang', cot: cfg.mau, topCot: 3 }));
    thangChart = th;
    nhomPv = KT.phanTichChiPhi(S.db, Object.assign({}, b, { chiSo: 'chiPhi', hang: 'nhom', cot: '' }));
    nccPv = KT.phanTichChiPhi(S.db, Object.assign({}, b, { chiSo: 'chiPhi', hang: 'ncc', cot: '', topHang: 5 }));
    const dinh = th.hang.reduce((x, h) => (h.tong > (x ? x.tong : -1) ? h : x), null);
    const lon = pv.hang.filter((h) => !h.khac)[0];
    const lo = KT.phanTichChiPhi(S.db, Object.assign({}, b, { chiSo: 'chiPhi', hang: 'loai', cot: '' }));
    const vt = lo.hang.find((h) => h.k === 'Vật tư');
    const nc = lo.hang.find((h) => h.k === 'Nhân công');
    html += the4([
      the('Tổng chi phí phát sinh', money(pv.tong), esc(KT.describeRange(f.from, f.to)) + ' · ' + pv.soDong.toLocaleString('vi-VN') + ' dòng chi phí'),
      the('Tháng cao nhất', dinh ? thangDai(dinh.k) : '–', dinh ? money(dinh.tong) + ' · ' + pct(dinh.tong / pv.tong) + ' cả kỳ' : ''),
      the(tenChieu(cfg.hang) + ' chi nhiều nhất', lon ? esc(lon.t) : '–', lon ? money(lon.tong) + ' · ' + pct(lon.tong / pv.tong) : ''),
      the('Vật tư chiếm', vt ? pct(vt.tong / pv.tong) : '–', 'Nhân công ' + (nc ? pct(nc.tong / pv.tong) : '–'))]);
    html += '<div class="bi-grid2">' + the_('Chi phí phát sinh theo tháng', 'Bấm một cột để mở Sổ chi phí của tháng đó', nhanXem(f.xem, ['bang', 'cot', 'duong']), '<div id="bi-leg"></div><div id="bi-thang" class="bi-chart"></div>') +
      '<div class="flex flex-col gap-4">' + the_('Theo nhóm chi phí', 'Cả kỳ · bấm một nhóm để mở Sổ chi phí', '', '<div id="bi-bar-nhom" class="bi-hbars"></div>') +
      the_('5 nhà cung cấp chi nhiều nhất', 'Cả kỳ · bấm để mở Sổ chi phí của NCC', '', '<div id="bi-bar-ncc" class="bi-hbars"></div>') + '</div></div>';
    return html + bangHai(false);
  }
  function bangHai(gia) {
    const dvHe = f.dv === 'dong' || gia ? 1 : f.dv === 'nghin' ? 1e3 : 1e6;
    const fmt = (v) => (v ? (gia ? money(v) : Math.round(v / dvHe).toLocaleString('vi-VN')) : '');
    const max = Math.max(1, ...pv.hang.filter((h) => !h.khac).map((h) => Math.max(0, ...pv.cot.map((c) => h.o[c.k] || 0))));
    const nen = (v) => (v > 0 ? HEAT[Math.min(4, Math.floor(Math.sqrt(v / max) * 5))] : 'transparent');
    const coCot = !!cfg.cot;
    const dvSeg = gia ? '' : '<div class="flex items-center gap-2"><span class="bi-k">Đơn vị</span><div class="seg seg-sm">' + [['dong', 'Đồng'], ['nghin', 'Nghìn'], ['trieu', 'Triệu']].map(([v, l]) => '<label class="seg-item"><input type="radio" name="bi-dv" value="' + v + '"' + (f.dv === v ? ' checked' : '') + '><span>' + l + '</span></label>').join('') + '</div></div>';
    const note = (gia ? 'Đơn giá trung bình, đồng' : 'Đơn vị: ' + { dong: 'đồng', nghin: 'nghìn đồng', trieu: 'triệu đồng' }[f.dv]) + (gia ? ' · tổng thành tiền ÷ tổng số lượng của dòng có số lượng' : ' · ô càng đậm chi càng nhiều') + ' · bấm một ô để mở Sổ chi phí đã lọc';
    return '<section class="sheet bi-card"><div class="bi-card-head"><div><h3 class="sheet-title">' + esc(tenChieu(cfg.hang)) + (coCot ? ' × ' + esc(tenChieu(cfg.cot).toLowerCase()) : '') + '</h3><p class="sheet-note">' + esc(note) + '</p></div>' + dvSeg + '</div>' +
      '<div class="overflow-x-auto"><table class="ledger bi-pivot" id="bi-pivot"><thead><tr><th>' + esc(tenChieu(cfg.hang)) + '</th>' + pv.cot.map((c) => '<th class="num">' + esc(cfg.cot === 'thang' ? thangNgan(c.k) : c.t) + '</th>').join('') + (coCot ? '<th class="num">Tổng</th>' : '') + (gia ? '' : '<th class="num">Tỷ trọng</th>') + '</tr></thead><tbody>' +
      pv.hang.map((h, i) => '<tr data-h="' + i + '"><td><b class="code">' + esc(h.t) + '</b>' + (h.s ? '<div class="sub">' + esc(h.s) + '</div>' : '') + '</td>' +
        pv.cot.map((c, j) => { const v = h.o[c.k] || 0; return '<td class="num bi-cell' + (v ? ' clickable' : '') + '" data-h="' + i + '" data-c="' + j + '" style="background:' + (h.khac ? 'transparent' : nen(v)) + '">' + (v ? fmt(v) : dash) + '</td>'; }).join('') +
        (coCot ? '<td class="num font-bold">' + (h.tong ? fmt(h.tong) : dash) + '</td>' : '') +
        (gia ? '' : '<td class="num"><span class="bi-meter"><span style="width:' + Math.min(100, h.tt / pv.tongTien * 100).toFixed(1) + '%"></span></span>' + pct(h.tt / pv.tongTien) + '</td>') + '</tr>').join('') +
      '</tbody>' + (gia ? '' : '<tfoot><tr><td>Tổng cộng</td>' + pv.cot.map((c) => '<td class="num">' + fmt(pv.tongCot[c.k] || 0) + '</td>').join('') + (coCot ? '<td class="num"><span class="dbl">' + fmt(pv.tong) + '</span></td>' : '') + '<td class="num">100%</td></tr></tfoot>') + '</table></div></section>';
  }
  function vePivot() {
    const tb = $('#bi-pivot', root);
    if (tb) tb.addEventListener('click', (e) => {
      const td = e.target.closest('td[data-h][data-c]') || e.target.closest('tr[data-h]');
      if (!td) return;
      const h = pv.hang[Number(td.dataset.h)];
      if (!h || h.khac) return;
      const d = {};
      dungDieuKien(cfg.hang, h.k, d);
      if (td.dataset.c != null && cfg.cot) { const c = pv.cot[Number(td.dataset.c)]; if (c) dungDieuKien(cfg.cot, c.k, d); }
      moSoChiPhi(Object.assign({ loai: f.loaiCP, nhom: f.nhom, ncc: f.ncc }, d));
    });
    if (!thangChart || cfg.chiSo === 'giaTB') return;
    const th = thangChart;
    const sr = th.cot.map((c, i) => ({ k: c.k, t: c.t, color: cfg.mau === 'loai' ? (MAU_LOAI[c.k] || MAU_KHAC) : c.k === '__khac__' ? MAU_KHAC : MAU_HANG[i % 3], v: th.hang.map((h) => h.o[c.k] || 0) }));
    const cats = th.hang.map((h) => ({ k: h.k, t: thangNgan(h.k) }));
    $('#bi-leg', root).innerHTML = sr.length > 1 ? chuGiai(sr.map((x) => [x.t, x.color])) : '';
    const el = $('#bi-thang', root);
    const html = (i) => '<b>' + thangDai(cats[i].k) + '</b>' + sr.filter((x) => x.v[i]).map((x) => tipDong(x.color, x.t, money(x.v[i]))).join('') + (sr.length > 1 ? tipDong('', 'Tổng', money(sr.reduce((t, x) => t + x.v[i], 0)), 't') : '') + '<div class="h">Bấm để mở Sổ chi phí tháng ' + thangDai(cats[i].k) + '</div>';
    if (f.xem === 'bang') {
      el.innerHTML = '<div class="overflow-x-auto"><table class="ledger"><thead><tr><th>Tháng</th>' + sr.map((x) => '<th class="num">' + esc(x.t) + '</th>').join('') + '<th class="num">Tổng</th></tr></thead><tbody>' +
        cats.map((c, i) => '<tr><td>' + thangDai(c.k) + '</td>' + sr.map((x) => '<td class="num">' + (x.v[i] ? money(x.v[i]) : dash) + '</td>').join('') + '<td class="num font-bold">' + money(sr.reduce((t, x) => t + x.v[i], 0)) + '</td></tr>').join('') + '</tbody></table></div>';
    } else {
      bieuDoCot(el, cats, sr, f.xem === 'duong' ? 'duong' : 'cot', 'Chi phí phát sinh theo tháng');
      gan(el, html, (i) => moSoChiPhi(Object.assign({ loai: f.loaiCP, nhom: f.nhom, ncc: f.ncc }, khoangCua('thang', cats[i].k))));
    }
    const thanhNgang = (box, pvx, mau, chieu) => {
      const mx = Math.max(1, ...pvx.hang.map((h) => h.tong));
      box.innerHTML = pvx.hang.filter((h) => !h.khac).map((h, i) => '<div class="bi-hrow clickable" data-i="' + i + '" tabindex="0"><div class="bi-hname" title="' + esc(h.t) + '">' + esc(h.t) + '</div><div class="bi-htrack"><span class="bi-hbar" style="width:' + (h.tong / mx * 100 * 0.62).toFixed(1) + '%;background:' + mau + '"></span><span class="bi-hval">' + ty(h.tong) + ' <span class="text-ink-3">· ' + pct(h.tong / pv.tong) + '</span></span></div></div>').join('');
      const mo = (r) => { const h = pvx.hang.filter((x) => !x.khac)[Number(r.dataset.i)]; const d = { loai: f.loaiCP, nhom: f.nhom, ncc: f.ncc }; dungDieuKien(chieu, h.k, d); moSoChiPhi(d); };
      box.addEventListener('click', (e) => { const r = e.target.closest('[data-i]'); if (r) mo(r); });
      box.addEventListener('keydown', (e) => { const r = e.target.closest('[data-i]'); if (r && e.key === 'Enter') mo(r); });
    };
    thanhNgang($('#bi-bar-nhom', root), nhomPv, MAU_HANG[0], 'nhom');
    thanhNgang($('#bi-bar-ncc', root), nccPv, MAU_HANG[1], 'ncc');
  }

  /* ----- B. tuổi nợ ----- */
  let tn = null;
  function thanTuoiNo() {
    tn = KT.tuoiNo(S.db, { to: f.den, ct });
    if (!tn.rows.length) return '<section class="sheet p-10 text-center text-ink-3">Không có khoản nào còn phải trả tại ngày này.</section>';
    const b = tn.tong, tong = tn.tongAll;
    const lau = tn.rows.slice().sort((x, y) => y.ngay - x.ngay)[0];
    const quaHan = b[2] + b[3];
    return the4([the('Còn phải trả', money(tong), tn.rows.length + ' NCC · bằng Dư Có ở màn Công nợ NCC theo kỳ cùng ngày'), the('Nợ quá 60 ngày', money(quaHan), pct(quaHan / tong) + ' số còn phải trả'),
      the('Nợ quá 90 ngày', money(b[3]), pct(b[3] / tong) + ' · ' + tn.rows.filter((x) => x.b[3]).length + ' NCC'), the('Nợ lâu nhất', esc(lau.ten), lau.ngay + ' ngày, từ ' + ngayVN(lau.cu))]) +
      the_('12 nhà cung cấp còn nợ nhiều nhất, chia theo tuổi nợ', 'Tuổi nợ tính từ ngày phát sinh; tiền đã trả trừ vào khoản cũ nhất trước · bấm để mở Sổ chi tiết NCC', nhanXem(f.xem === 'bang' ? 'bang' : 'cot', ['bang', 'cot']), chuGiai(TUOI.map((t, i) => [t, MAU_TUOI[i]])) + '<div id="bi-tn" class="bi-chart"></div>') +
      the_('Bảng tuổi nợ', 'Đồng · rê chuột vào thanh để xem số, bấm biểu tượng sổ để mở Sổ chi tiết NCC', '', '<div class="overflow-x-auto"><table class="ledger" id="bi-tn-bang"><thead><tr><th>Nhà cung cấp</th>' + TUOI.map((t, i) => '<th class="num"><i class="bi-sw" style="--c:' + MAU_TUOI[i] + '"></i>' + t + '</th>').join('') + '<th class="num">Còn phải trả</th><th class="num">Khoản cũ nhất</th><th class="no-print"></th></tr></thead><tbody>' +
        tn.rows.map((x, i) => '<tr data-i="' + i + '"><td><b class="code">' + esc(x.ten) + '</b><div class="sub">' + esc(x.ma) + '</div></td>' + x.b.map((v, j) => '<td class="num' + (j === 3 && v ? ' font-bold' : '') + '">' + (v ? money(v) : dash) + '</td>').join('') +
          '<td class="num font-bold">' + money(x.tong) + '</td><td class="num">' + ngayVN(x.cu) + ' <span class="text-ink-3">· ' + x.ngay + ' ngày</span></td><td class="actions no-print"><button type="button" class="icon-btn" data-so="' + i + '" aria-label="Sổ chi tiết ' + esc(x.ten) + '">' + icon('book') + '</button></td></tr>').join('') +
        '</tbody><tfoot><tr><td>Tổng ' + tn.rows.length + ' NCC</td>' + b.map((v) => '<td class="num">' + money(v) + '</td>').join('') + '<td class="num"><span class="dbl">' + money(tong) + '</span></td><td colspan="2"></td></tr></tfoot></table></div>');
  }
  const moSoNCC = (ma) => { LS.set('sct.ncc', ma); datCongTrinh(S.ct, true); location.hash = '#/so-chi-tiet-ncc'; };
  function veTuoiNo() {
    const bang = $('#bi-tn-bang', root);
    if (bang) bang.addEventListener('click', (e) => { const b = e.target.closest('[data-so]'); if (b) moSoNCC(tn.rows[Number(b.dataset.so)].ma); });
    const el = $('#bi-tn', root);
    if (!el) return;
    if (f.xem === 'bang') { el.closest('section').querySelector('.bi-legend').hidden = true; el.hidden = true; return; }
    const top = tn.rows.slice(0, 12);
    const W = Math.max(420, el.clientWidth), rh = 30, lw = Math.min(250, W * 0.3), H = top.length * rh + 6;
    const mx = top[0].tong, sx = (v) => (v / mx) * Math.max(80, W - lw - 160);
    let s = '<line class="base" x1="' + lw + '" x2="' + lw + '" y1="0" y2="' + H + '"/>';
    top.forEach((x, i) => {
      const yy = i * rh + 6;
      s += '<text class="nm" x="' + (lw - 12) + '" y="' + (yy + 13) + '" text-anchor="end">' + esc(x.ten.length > 30 ? x.ten.slice(0, 29) + '…' : x.ten) + '</text>';
      let acc = 0;
      x.b.forEach((v, j) => { if (!v) return; const w = sx(v) - (acc > 0 ? 2 : 0); if (w > 0.4) s += '<rect class="mk" x="' + (lw + sx(acc) + (acc > 0 ? 2 : 0)).toFixed(1) + '" y="' + yy + '" width="' + w.toFixed(1) + '" height="18" fill="' + MAU_TUOI[j] + '"/>'; acc += v; });
      s += '<text class="val2" x="' + (lw + sx(x.tong) + 8) + '" y="' + (yy + 13) + '">' + money(x.tong) + '</text>';
      s += '<rect class="bi-hit" data-i="' + i + '" x="0" y="' + (yy - 5) + '" width="' + W + '" height="' + rh + '"/>';
    });
    el.innerHTML = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="Tuổi nợ các nhà cung cấp còn nợ nhiều nhất">' + s + '</svg>';
    gan(el, (i) => '<b>' + esc(top[i].ten) + '</b>' + TUOI.map((t, j) => tipDong(MAU_TUOI[j], t, top[i].b[j] ? money(top[i].b[j]) : '–')).join('') + tipDong('', 'Còn phải trả', money(top[i].tong), 't') + '<div class="h">Khoản cũ nhất ' + ngayVN(top[i].cu) + ' · bấm để mở Sổ chi tiết NCC</div>', (i) => moSoNCC(top[i].ma));
  }

  /* ----- C. công nợ theo tháng ----- */
  let cn = null;
  function thanCongNo() {
    cn = KT.congNoTheoThang(S.db, { from: f.from, to: f.to, ct, top: 4 });
    if (!cn.thang.length) return '<section class="sheet p-10 text-center text-ink-3">Chưa có số liệu.</section>';
    const cuoi = cn.thang[cn.thang.length - 1];
    const ps = cn.thang.reduce((t, x) => t + x.ps, 0), tt = cn.thang.reduce((t, x) => t + x.tt, 0);
    const thangTruoc = cn.thang[cn.thang.length - 2] || cuoi;
    return the4([the('Còn phải trả cuối kỳ', money(cuoi.co), 'đến ' + thangDai(cuoi.m) + ' · khớp Công nợ NCC theo kỳ'), the('Đã ứng trước cuối kỳ', money(cuoi.no), 'tiền đã trả trước cho NCC'),
      the('Phát sinh tháng ' + thangDai(thangTruoc.m), money(thangTruoc.ps), 'thanh toán ' + money(thangTruoc.tt)), the('Tỷ lệ đã trả cả kỳ', ps ? pct(tt / ps) : '–', 'thanh toán ÷ phát sinh')]) +
      '<div class="bi-grid2">' + the_('Phát sinh, thanh toán và còn phải trả cuối tháng', 'Cùng một trục, đơn vị đồng · rê chuột xem số từng tháng', nhanXem(f.xem === 'bang' ? 'bang' : 'cot', ['bang', 'cot']),
        chuGiai([['Phát sinh trong tháng', MAU_HANG[0]], ['Thanh toán trong tháng', MAU_HANG[1]], ['Còn phải trả cuối tháng', '#25282D', 'line']]) + '<div id="bi-cn" class="bi-chart"></div>') +
      the_('Còn phải trả của 4 NCC lớn nhất', 'Cùng thang để so sánh · bấm để mở Sổ chi tiết', '', '<div class="bi-smg" id="bi-sm"></div>') + '</div>' +
      the_('Bảng theo tháng', 'Tháng cuối khớp màn Công nợ NCC theo kỳ', '', '<div class="overflow-x-auto"><table class="ledger"><thead><tr><th>Tháng</th><th class="num">Phát sinh</th><th class="num">Thanh toán</th><th class="num">Còn phải trả cuối tháng</th><th class="num">Đã ứng trước cuối tháng</th><th class="num">Thuần (Có − Nợ)</th></tr></thead><tbody>' +
        cn.thang.map((d) => '<tr><td>' + thangDai(d.m) + '</td><td class="num">' + money(d.ps) + '</td><td class="num">' + money(d.tt) + '</td><td class="num font-bold">' + money(d.co) + '</td><td class="num text-caution">' + money(d.no) + '</td><td class="num">' + money(d.co - d.no) + '</td></tr>').join('') + '</tbody></table></div>');
  }
  function veCongNo() {
    const el = $('#bi-cn', root);
    if (!el) return;
    const T = cn.thang;
    if (f.xem === 'bang') { el.closest('section').querySelector('.bi-legend').hidden = true; el.hidden = true; }
    else {
      const W = Math.max(380, el.clientWidth), H = 320, m = { l: 54, r: 74, t: 24, b: 30 };
      const iw = W - m.l - m.r, ih = H - m.t - m.b;
      const { step, top } = nice(Math.max(1, ...T.map((x) => Math.max(x.ps, x.tt, x.co))), 4);
      const y = (v) => m.t + ih - (v / top) * ih, slot = iw / T.length, bw = Math.min(18, slot * 0.4);
      let s = '';
      for (let v = 0; v <= top + 1; v += step) s += '<line class="g" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="ax" x="' + (m.l - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + nhanTruc(v) + '</text>';
      const buoc = Math.max(1, Math.ceil(T.length / Math.max(2, Math.floor(iw / 56))));
      const pts = [];
      T.forEach((d, i) => {
        const cx = m.l + (i + 0.5) * slot;
        if (d.ps) s += '<rect class="mk" x="' + (cx - bw - 1).toFixed(1) + '" y="' + y(d.ps).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (y(0) - y(d.ps)).toFixed(1) + '" fill="' + MAU_HANG[0] + '"/>';
        if (d.tt) s += '<rect class="mk" x="' + (cx + 1).toFixed(1) + '" y="' + y(d.tt).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (y(0) - y(d.tt)).toFixed(1) + '" fill="' + MAU_HANG[1] + '"/>';
        if (i % buoc === 0) s += '<text class="ax" x="' + cx + '" y="' + (H - 9) + '" text-anchor="middle">' + thangNgan(d.m) + '</text>';
        pts.push([cx, y(d.co)]);
      });
      s += '<line class="base" x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + y(0) + '" y2="' + y(0) + '"/><polyline class="ln" style="stroke:#25282D" points="' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '"/>';
      pts.forEach((p) => { s += '<circle class="dot" style="fill:#25282D" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4"/>'; });
      const lp = pts[pts.length - 1];
      s += '<text class="val" x="' + (lp[0] + 10) + '" y="' + (lp[1] + 4) + '">' + ty(T[T.length - 1].co, 2) + '</text>';
      T.forEach((_, i) => { s += '<rect class="bi-hit" data-i="' + i + '" x="' + (m.l + i * slot).toFixed(1) + '" y="' + m.t + '" width="' + slot.toFixed(1) + '" height="' + ih + '"/>'; });
      el.innerHTML = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="Phát sinh, thanh toán và còn phải trả cuối tháng">' + s + '</svg>';
      gan(el, (i) => '<b>' + thangDai(T[i].m) + '</b>' + tipDong(MAU_HANG[0], 'Phát sinh', money(T[i].ps)) + tipDong(MAU_HANG[1], 'Thanh toán', money(T[i].tt)) + tipDong('#25282D', 'Còn phải trả cuối tháng', money(T[i].co)) + (T[i].no ? tipDong('', 'Đã ứng trước', money(T[i].no)) : ''), null);
    }
    const sm = $('#bi-sm', root);
    const mxS = Math.max(1, ...cn.top.map((x) => Math.max(0, ...x.v)));
    sm.innerHTML = cn.top.map((x, k) => {
      const w = 220, h = 96, pad = { l: 4, r: 8, t: 8, b: 16 };
      const xs = (i) => pad.l + i * (w - pad.l - pad.r) / Math.max(1, T.length - 1), ys = (v) => pad.t + (h - pad.t - pad.b) * (1 - Math.max(0, v) / mxS);
      const p = T.map((_, i) => xs(i).toFixed(1) + ',' + ys(x.v[i]).toFixed(1));
      return '<div class="bi-sm clickable" data-k="' + k + '" tabindex="0"><div class="bi-sm-h"><b>' + esc(x.ten) + '</b><span>' + money(x.v[x.v.length - 1]) + '</span></div><svg width="' + w + '" height="' + h + '" role="img" aria-label="Còn phải trả của ' + esc(x.ten) + '">' +
        '<line class="base" x1="' + pad.l + '" x2="' + (w - pad.r) + '" y1="' + ys(0) + '" y2="' + ys(0) + '"/><polygon class="area" points="' + p.join(' ') + ' ' + xs(T.length - 1) + ',' + ys(0) + ' ' + xs(0) + ',' + ys(0) + '"/>' +
        '<polyline class="ln" points="' + p.join(' ') + '"/><circle class="dot" cx="' + xs(T.length - 1).toFixed(1) + '" cy="' + ys(x.v[x.v.length - 1]).toFixed(1) + '" r="4"/>' +
        '<text class="ax" x="' + pad.l + '" y="' + (h - 2) + '">' + thangNgan(T[0].m) + '</text><text class="ax" x="' + (w - pad.r) + '" y="' + (h - 2) + '" text-anchor="end">' + thangNgan(T[T.length - 1].m) + '</text></svg></div>';
    }).join('');
    const mo = (e) => { const c = e.target.closest('[data-k]'); if (c) moSoNCC(cn.top[Number(c.dataset.k)].ma); };
    sm.addEventListener('click', mo);
    sm.addEventListener('keydown', (e) => { if (e.key === 'Enter') mo(e); });
  }

  draw();
}
