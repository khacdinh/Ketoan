/* Tiện ích giao diện dùng chung: API, hộp thoại, thông báo, định dạng, icon. */
const KT = window.KT;

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const money = (n, emptyIfZero) => KT.fmtMoney(n, emptyIfZero);
export const fdate = (iso) => KT.fmtDate(iso);

// 1.234.567.890 -> "1,2 tỷ"; 562.219.000 -> "562 tr"
export function fmtShort(n) {
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (a >= 1e9) return sign + (a / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace('.', ',') + ' tỷ';
  if (a >= 1e6) return sign + Math.round(a / 1e6) + ' tr';
  if (a >= 1e3) return sign + Math.round(a / 1e3) + ' k';
  return sign + a;
}

// Tô sáng từ khóa tìm kiếm (không phân biệt dấu / hoa thường)
export function highlight(text, q) {
  const s = String(text == null ? '' : text);
  const needle = KT.normalizeText(q || '').trim();
  if (!needle) return esc(s);
  const hay = KT.normalizeText(s);
  if (hay.length !== s.length) return esc(s); // chuẩn hóa làm lệch độ dài -> bỏ tô sáng cho an toàn
  let out = '';
  let i = 0;
  for (;;) {
    const j = hay.indexOf(needle, i);
    if (j < 0) break;
    out += esc(s.slice(i, j)) + '<mark class="hl">' + esc(s.slice(j, j + needle.length)) + '</mark>';
    i = j + needle.length;
  }
  return out + esc(s.slice(i));
}

/* ---------------- Lưu cài đặt giao diện (bộ lọc...) trên trình duyệt ---------------- */
export const LS = {
  get(k, d) {
    try { const v = localStorage.getItem('stc.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
  },
  set(k, v) {
    try { localStorage.setItem('stc.' + k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ }
  }
};

/* ---------------- Icon (Phosphor) ---------------- */
const ICONS = {
  plus: 'ph-plus',
  edit: 'ph-pencil-simple',
  copy: 'ph-copy',
  trash: 'ph-trash',
  print: 'ph-printer',
  excel: 'ph-file-xls',
  download: 'ph-download-simple',
  upload: 'ph-upload-simple',
  search: 'ph-magnifying-glass',
  x: 'ph-x',
  check: 'ph-check',
  checkCircle: 'ph-check-circle',
  caret: 'ph-caret-down',
  warn: 'ph-warning-circle',
  warnTri: 'ph-warning',
  info: 'ph-info',
  minus: 'ph-minus-circle',
  dot: 'ph-circle',
  calendar: 'ph-calendar-blank',
  book: 'ph-book-open-text',
  notebook: 'ph-notebook',
  receipt: 'ph-receipt',
  hardhat: 'ph-hard-hat',
  contacts: 'ph-address-book',
  bars: 'ph-chart-bar-horizontal',
  chartLine: 'ph-chart-line-up',
  gear: 'ph-gear-six',
  refresh: 'ph-arrow-counter-clockwise',
  database: 'ph-database',
  history: 'ph-clock-counter-clockwise',
  save: 'ph-floppy-disk',
  arrowIn: 'ph-arrow-down-left',
  arrowOut: 'ph-arrow-up-right',
  eraser: 'ph-eraser',
  scissors: 'ph-scissors',
  keyboard: 'ph-keyboard',
  phone: 'ph-phone',
  mapPin: 'ph-map-pin',
  building: 'ph-buildings',
  crane: 'ph-crane',
  package: 'ph-package',
  stack: 'ph-stack',
  list: 'ph-list-bullets',
  house: 'ph-house-line',
  tree: 'ph-tree-structure',
  scales: 'ph-scales',
  tag: 'ph-tag',
  chartLineSimple: 'ph-chart-line',
  calculator: 'ph-calculator',
  notePencil: 'ph-note-pencil',
  caretRight: 'ph-caret-right',
  link: 'ph-arrow-square-out',
  coins: 'ph-coins',
  handCoins: 'ph-hand-coins',
  rows: 'ph-rows',
  funnel: 'ph-funnel',
  grid: 'ph-squares-four',
  spinner: 'ph-circle-notch'
};
const DUO = {
  dashboard: 'ph-chart-line-up',
  book: 'ph-book-open-text',
  receipt: 'ph-receipt',
  hardhat: 'ph-hard-hat',
  contacts: 'ph-address-book',
  bars: 'ph-chart-bar-horizontal',
  gear: 'ph-gear-six',
  notebook: 'ph-notebook',
  excel: 'ph-file-xls',
  database: 'ph-database',
  history: 'ph-clock-counter-clockwise',
  warn: 'ph-warning-circle',
  crane: 'ph-crane',
  notePencil: 'ph-note-pencil',
  table: 'ph-table',
  tree: 'ph-tree-structure',
  calculator: 'ph-calculator',
  scales: 'ph-scales',
  tag: 'ph-tag',
  stack: 'ph-stack',
  squares: 'ph-squares-four',
  package: 'ph-package'
};

export function icon(name, cls) {
  return '<i class="ph ' + (ICONS[name] || ICONS.dot) + (cls ? ' ' + cls : '') + '" aria-hidden="true"></i>';
}
export function duo(name, cls) {
  return '<i class="ph-duotone ' + (DUO[name] || DUO.notebook) + (cls ? ' ' + cls : '') + '" aria-hidden="true"></i>';
}

/* ---------------- Gọi máy chủ ---------------- */
let onDb = null;
export function onDatabase(fn) { onDb = fn; }

export async function api(method, url, body, isRaw) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': isRaw ? 'application/octet-stream' : 'application/json' },
      body: body === undefined ? undefined : isRaw ? body : JSON.stringify(body)
    });
  } catch (e) {
    setOffline(true);
    throw new Error('Không kết nối được phần mềm. Kiểm tra cửa sổ KhoiDong.bat còn mở không.');
  }
  setOffline(false);
  let data;
  try { data = await res.json(); } catch (e) { throw new Error('Máy chủ trả về dữ liệu không hợp lệ (mã ' + res.status + ')'); }
  if (!res.ok || data.ok === false) throw new Error(data.error || 'Lỗi ' + res.status);
  if (data.db && onDb) onDb(data.db);
  return data;
}

// Dải báo mất kết nối ở đầu trang: còn hiện đến khi gọi được máy chủ lại (dữ liệu đang gõ trong hộp thoại vẫn giữ nguyên)
let offline = false;
function setOffline(on) {
  if (on === offline) return;
  offline = on;
  const root = document.getElementById('offline-root');
  if (!root) return;
  if (!on) { root.innerHTML = ''; toast('Đã kết nối lại với phần mềm'); return; }
  root.innerHTML = '<div class="offline-bar no-print" role="alert">' + icon('warnTri', 'text-[18px]') +
    '<span class="flex-1"><b class="font-semibold">Mất kết nối với phần mềm.</b> Các thay đổi chưa được lưu. Mở lại <b class="font-semibold">KhoiDong.bat</b> rồi bấm Thử lại.</span>' +
    '<button type="button" class="btn" data-act="reconnect">' + icon('refresh') + 'Thử lại</button></div>';
  root.querySelector('[data-act=reconnect]').addEventListener('click', () => { api('GET', '/api/db').catch(() => toast('Vẫn chưa kết nối được. Kiểm tra cửa sổ KhoiDong.bat.', 'error')); });
}

// Nút đang xử lý: khóa nút, đổi chữ (vd. "Đang lưu…"), trả về hàm khôi phục
export function busy(btn, text) {
  if (!btn) return () => {};
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  if (text) btn.innerHTML = icon('spinner') + esc(text);
  return () => { btn.disabled = false; btn.removeAttribute('aria-busy'); btn.innerHTML = html; };
}

export function download(url) {
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('Đang tạo file Excel. File sẽ nằm trong thư mục Downloads.', 'info');
}

/* ---------------- Thông báo nhỏ ---------------- */
export function toast(msg, type) {
  const root = $('#toast-root');
  const el = document.createElement('div');
  el.className = 'toast ' + (type || 'ok');
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = icon(type === 'error' ? 'warn' : type === 'info' ? 'info' : 'checkCircle') + '<span>' + esc(msg) + '</span>' +
    (type === 'error' ? '<button type="button" class="toast-x" aria-label="Đóng thông báo">' + icon('x') + '</button>' : '');
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  const close = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); };
  if (type === 'error') el.querySelector('.toast-x').addEventListener('click', close);
  // lỗi để lâu hơn cho kịp đọc; rê chuột vào thì giữ lại
  let t = setTimeout(close, type === 'error' ? 8000 : 3200);
  el.addEventListener('mouseenter', () => clearTimeout(t));
  el.addEventListener('mouseleave', () => { t = setTimeout(close, 2500); });
}

/* ---------------- Báo lỗi ngay tại ô nhập ---------------- */
let errSeq = 0;
// Hiện lỗi dưới ô (trong .field), đánh dấu aria-invalid, đưa con trỏ vào ô; tự xóa khi người dùng sửa
export function fieldError(input, msg) {
  if (!input) return null;
  const shown = focusInput(input);
  const field = shown.closest('.field');
  clearFieldError(shown);
  shown.classList.add('invalid');
  shown.setAttribute('aria-invalid', 'true');
  if (field) {
    const id = 'ferr-' + (++errSeq);
    const box = document.createElement('span');
    box.className = 'field-error';
    box.id = id;
    box.setAttribute('role', 'alert');
    box.innerHTML = icon('warn') + '<span>' + esc(msg) + '</span>';
    const hint = field.querySelector(':scope > .hint');
    if (hint) hint.hidden = true;
    field.appendChild(box);
    shown.setAttribute('aria-describedby', ((shown.getAttribute('aria-describedby') || '') + ' ' + id).trim());
  }
  const off = () => clearFieldError(shown);
  shown.addEventListener('input', off, { once: true });
  shown.addEventListener('change', off, { once: true });
  return shown;
}

export function clearFieldError(input) {
  if (!input) return;
  input.classList.remove('invalid');
  input.removeAttribute('aria-invalid');
  const field = input.closest('.field');
  if (!field) return;
  field.querySelectorAll(':scope > .field-error').forEach((b) => {
    const ids = (input.getAttribute('aria-describedby') || '').split(' ').filter((x) => x && x !== b.id);
    if (ids.length) input.setAttribute('aria-describedby', ids.join(' ')); else input.removeAttribute('aria-describedby');
    b.remove();
  });
  const hint = field.querySelector(':scope > .hint');
  if (hint) hint.hidden = false;
}

export function showError(e) {
  toast(e && e.message ? e.message : String(e), 'error');
}

/* ---------------- Hộp thoại ---------------- */
const openModals = [];

export function openModal(opts) {
  const root = $('#modal-root');
  const wrap = document.createElement('div');
  const id = 'modal-title-' + Date.now();
  wrap.className = 'modal-backdrop';
  wrap.innerHTML =
    '<div class="modal ' + (opts.size || '') + '" role="dialog" aria-modal="true" aria-labelledby="' + id + '">' +
    '<div class="modal-head"><h2 id="' + id + '">' + esc(opts.title) + '</h2>' +
    '<button type="button" class="icon-btn modal-x" aria-label="Đóng">' + icon('x') + '</button></div>' +
    '<div class="modal-body">' + (opts.body || '') + '</div>' +
    (opts.footer ? '<div class="modal-foot">' + opts.footer + '</div>' : '') +
    '</div>';
  root.appendChild(wrap);
  const prevFocus = document.activeElement;
  const modal = wrap.firstChild;
  const handle = {
    el: modal,
    close() {
      const i = openModals.indexOf(handle);
      if (i >= 0) openModals.splice(i, 1);
      wrap.classList.remove('show');
      setTimeout(() => wrap.remove(), 160);
      if (opts.onClose) opts.onClose();
      if (prevFocus && prevFocus.focus) prevFocus.focus();
    }
  };
  openModals.push(handle);
  modal.querySelector('.modal-x').addEventListener('click', () => handle.close());
  wrap.addEventListener('mousedown', (e) => {
    if (e.target === wrap && opts.dismissible !== false) handle.close();
  });
  requestAnimationFrame(() => wrap.classList.add('show'));
  if (opts.onMount) opts.onMount(modal, handle);
  const first = modal.querySelector('[autofocus]') || modal.querySelector('input:not([type=hidden]):not([type=radio]):not([disabled]):not(.date-native), select, textarea, button.btn');
  if (first) setTimeout(() => first.focus(), 30);
  return handle;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openModals.length) {
    e.preventDefault();
    openModals[openModals.length - 1].close();
  }
});

export function hasOpenModal() { return openModals.length > 0; }

export function confirmDialog(o) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title: o.title || 'Xác nhận',
      size: 'small',
      body: '<div class="leading-relaxed text-ink-2">' + (o.html || esc(o.message || '')) + '</div>',
      footer: '<span class="flex-1"></span><button type="button" class="btn btn-ghost" data-act="no">' + esc(o.cancelText || 'Hủy') + '</button>' +
        '<button type="button" class="btn ' + (o.danger ? 'btn-danger' : 'btn-primary') + '" data-act="yes" autofocus>' + esc(o.okText || 'Đồng ý') + '</button>',
      onClose() { if (!done) resolve(false); }
    });
    m.el.querySelector('[data-act=no]').addEventListener('click', () => m.close());
    m.el.querySelector('[data-act=yes]').addEventListener('click', () => { done = true; resolve(true); m.close(); });
  });
}

/* ---------------- Menu thả xuống ---------------- */
export function attachMenu(button, items) {
  let menu = null;
  function close() {
    if (menu) { menu.remove(); menu = null; button.setAttribute('aria-expanded', 'false'); }
    document.removeEventListener('mousedown', outside, true);
  }
  function outside(e) {
    if (menu && !menu.contains(e.target) && !button.contains(e.target)) close();
  }
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', () => {
    if (menu) { close(); return; }
    const list = typeof items === 'function' ? items() : items;
    menu = document.createElement('div');
    menu.className = 'menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = list.map((it, i) => it.sep ? '<div class="menu-sep"></div>'
      : '<button type="button" role="menuitem" data-i="' + i + '"' + (it.disabled ? ' disabled' : '') + '>' + (it.icon ? icon(it.icon) : '') +
        '<span><span class="menu-label">' + esc(it.label) + '</span>' + (it.hint ? '<span class="menu-hint">' + esc(it.hint) + '</span>' : '') + '</span></button>').join('');
    document.body.appendChild(menu);
    const r = button.getBoundingClientRect();
    const w = menu.offsetWidth;
    menu.style.top = (r.bottom + 6 + window.scrollY) + 'px';
    menu.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + 'px';
    button.setAttribute('aria-expanded', 'true');
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      const it = list[Number(b.dataset.i)];
      close();
      if (it && it.action) it.action();
    });
    menu.addEventListener('keydown', (e) => {
      const btns = $$('button:not([disabled])', menu);
      const i = btns.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
      if (e.key === 'Escape') { e.stopPropagation(); close(); button.focus(); }
    });
    setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
    const firstBtn = menu.querySelector('button:not([disabled])');
    if (firstBtn) firstBtn.focus();
  });
}

/* ---------------- Ô nhập số tiền: chấp nhận 1.250.000, 50tr, 58000+11000 ---------------- */
export function bindMoneyInput(input, hintEl) {
  function update() {
    const raw = input.value.trim();
    if (!hintEl) return;
    if (!raw) { hintEl.textContent = ''; hintEl.className = 'hint'; return; }
    const n = KT.parseAmount(raw);
    if (isNaN(n)) {
      hintEl.textContent = 'Số tiền không hợp lệ';
      hintEl.className = 'hint bad';
    } else {
      // luôn cho thấy số đã tách nhóm khi người dùng gõ liền (1250000) hoặc viết tắt (50tr, 300k, 58000+11000)
      hintEl.textContent = (raw !== money(n) ? '= ' + money(n) + ' đ · ' : '') + (KT.docTienBangChu(n) || 'Không đồng');
      hintEl.className = 'hint';
    }
  }
  input.addEventListener('input', update);
  input.addEventListener('blur', () => {
    const n = KT.parseAmount(input.value);
    if (!isNaN(n) && input.value.trim()) input.value = money(n);
    update();
  });
  update();
  return () => KT.parseAmount(input.value);
}

/* ---------------- Hộp chọn kỳ báo cáo ---------------- */
export const PERIODS = [
  ['tat-ca', 'Toàn bộ thời gian'],
  ['thang-nay', 'Tháng này'],
  ['thang-truoc', 'Tháng trước'],
  ['quy-nay', 'Quý này'],
  ['nam-nay', 'Năm nay'],
  ['tuy-chon', 'Tùy chọn ngày']
];

export function periodControls(state, idPrefix) {
  return '<div class="flex flex-wrap items-center gap-2">' +
    '<label class="sr-only" for="' + idPrefix + '-period">Kỳ báo cáo</label>' +
    '<select id="' + idPrefix + '-period" class="input w-auto min-w-[170px]">' +
    PERIODS.map(([v, l]) => '<option value="' + v + '"' + (state.period === v ? ' selected' : '') + '>' + l + '</option>').join('') +
    '</select>' +
    dateField({ id: idPrefix + '-from', value: state.from, label: 'Từ ngày' }) +
    '<span class="text-ink-3" aria-hidden="true">đến</span>' +
    dateField({ id: idPrefix + '-to', value: state.to, label: 'Đến ngày' }) +
    '</div>';
}

export function bindPeriodControls(root, state, idPrefix, onChange) {
  const sel = $('#' + idPrefix + '-period', root);
  const from = $('#' + idPrefix + '-from', root);
  const to = $('#' + idPrefix + '-to', root);
  sel.addEventListener('change', () => {
    state.period = sel.value;
    if (sel.value !== 'tuy-chon') {
      const r = KT.periodRange(sel.value);
      state.from = r.from;
      state.to = r.to;
    }
    onChange();
  });
  [from, to].forEach((el) => el.addEventListener('change', () => {
    state.period = 'tuy-chon';
    state.from = from.value;
    state.to = to.value;
    onChange();
  }));
}

// Làm mới kỳ tương đối (tháng này...) mỗi lần mở để không bị "kẹt" ở tháng cũ
export function refreshPeriod(state) {
  if (state.period && state.period !== 'tuy-chon') {
    const r = KT.periodRange(state.period);
    state.from = r.from;
    state.to = r.to;
  }
  return state;
}

/* ---------------- Đẳng thức sổ quỹ: Tồn đầu kỳ + Thu − Chi = Tồn cuối kỳ ---------------- */
export function equationHtml(o) {
  const cell = (label, value, cls) => '<div class="eq-cell"><span class="eq-label">' + esc(label) + '</span>' +
    '<span class="eq-value ' + (cls || '') + '">' + money(value) + '</span></div>';
  const op = (s, label) => '<span class="eq-op" aria-label="' + label + '">' + s + '</span>';
  if (o.filtered) {
    const sep = '<span class="eq-sep" aria-hidden="true"></span>';
    return '<div class="equation">' +
      cell(o.dauLabel || 'Tồn quỹ đầu kỳ', o.dau) + sep +
      cell('Thu của các dòng đang lọc', o.thu, 'text-income') + sep +
      cell('Chi của các dòng đang lọc', o.chi) + sep +
      cell(o.cuoiLabel || 'Tồn quỹ cuối kỳ', o.cuoi, o.cuoi < 0 ? 'neg' : '') + '</div>';
  }
  return '<div class="equation" role="group" aria-label="Tồn đầu kỳ cộng thu trừ chi bằng tồn cuối kỳ">' +
    cell(o.dauLabel || 'Tồn quỹ đầu kỳ', o.dau) + op('+', 'cộng') +
    cell('Tổng thu', o.thu, 'text-income') + op('−', 'trừ') +
    cell('Tổng chi', o.chi) + op('=', 'bằng') +
    cell(o.cuoiLabel || 'Tồn quỹ cuối kỳ', o.cuoi, o.cuoi < 0 ? 'neg' : '') + '</div>';
}

export function debounce(fn, ms) {
  let t;
  return function () {
    const args = arguments;
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), ms);
  };
}

// Thay phần tử gốc bằng bản sao rỗng để bỏ hết sự kiện cũ trước khi vẽ lại màn hình
export function freshRoot(root) {
  const n = root.cloneNode(false);
  root.replaceWith(n);
  return n;
}

/* ---------------- Ô nhập ngày luôn dạng dd/mm/yyyy (không phụ thuộc ngôn ngữ trình duyệt) ---------------- */
function pad2(n) { return String(n).padStart(2, '0'); }
function isoOf(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return y + '-' + pad2(m) + '-' + pad2(d);
}

// '3/9' -> năm nay; '03/09/26'; '03-09-2026'; '030926'; '2026-09-03'. Trả về '' nếu rỗng, null nếu sai.
export function parseDateText(s) {
  s = String(s || '').trim();
  if (!s) return '';
  const year = new Date().getFullYear();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return isoOf(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.\-\s](\d{1,2})(?:[/.\-\s](\d{2}|\d{4}))?$/.exec(s);
  if (!m) m = /^(\d{2})(\d{2})(\d{2}|\d{4})?$/.exec(s);
  if (m) {
    let y = m[3] ? +m[3] : year;
    if (y < 100) y += 2000;
    return isoOf(y, +m[2], +m[1]);
  }
  return null;
}

export function dateField(o) {
  const v = o.value || '';
  return '<span class="date-field' + (o.cls ? ' ' + o.cls : '') + '">' +
    '<input type="text" class="input date-text" inputmode="numeric" autocomplete="off" placeholder="dd/mm/yyyy" value="' + esc(KT.fmtDate(v)) + '"' +
    (o.label ? ' aria-label="' + esc(o.label) + '"' : '') + (o.required ? ' required' : '') + '>' +
    '<button type="button" class="date-btn" tabindex="-1" aria-label="Chọn ngày trên lịch">' + icon('calendar') + '</button>' +
    '<input type="date" class="date-native" tabindex="-1" aria-hidden="true" value="' + esc(v) + '">' +
    '<input type="hidden" class="date-value"' + (o.id ? ' id="' + o.id + '"' : '') + (o.name ? ' name="' + o.name + '"' : '') + ' value="' + esc(v) + '">' +
    '</span>';
}

function setDateField(wrap, iso, silent) {
  if (!wrap) return;
  const hidden = wrap.querySelector('.date-value');
  const text = wrap.querySelector('.date-text');
  wrap.querySelector('.date-native').value = iso || '';
  text.value = iso ? KT.fmtDate(iso) : '';
  text.classList.remove('invalid');
  if (hidden.value !== (iso || '')) {
    hidden.value = iso || '';
    if (!silent) {
      hidden.dispatchEvent(new Event('input', { bubbles: true }));
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

// Đặt giá trị cho ô ngày (truyền ô ẩn .date-value hoặc phần tử bất kỳ bên trong)
export function setDateValue(el, iso, silent) { setDateField(el.closest('.date-field'), iso, silent); }

// Đưa con trỏ vào ô nhập (với ô ngày thì vào phần chữ); trả về ô được focus
export function focusInput(el) {
  if (!el) return null;
  const wrap = el.closest && el.closest('.date-field');
  const target = wrap ? wrap.querySelector('.date-text') : el;
  target.focus();
  return target;
}

function commitDateText(t) {
  const v = parseDateText(t.value);
  if (v === null) { t.classList.add('invalid'); return; }
  setDateField(t.closest('.date-field'), v);
}

document.addEventListener('change', (e) => {
  const t = e.target;
  if (!t.classList) return;
  if (t.classList.contains('date-text')) commitDateText(t);
  else if (t.classList.contains('date-native')) setDateField(t.closest('.date-field'), t.value);
}, true);

document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (!t.classList || !t.classList.contains('date-text')) return;
  if (e.key === 'Enter') commitDateText(t);
  // Mũi tên lên / xuống: tăng / giảm 1 ngày
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    const cur = parseDateText(t.value) || KT.todayISO();
    const d = new Date(cur + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + (e.key === 'ArrowUp' ? 1 : -1));
    setDateField(t.closest('.date-field'), d.toISOString().slice(0, 10));
  }
}, true);

document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('.date-btn');
  if (!b) return;
  e.preventDefault();
  const n = b.parentNode.querySelector('.date-native');
  try { n.showPicker(); } catch (err) { n.focus(); }
});
