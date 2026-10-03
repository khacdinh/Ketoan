/* Ô chọn gõ tìm có danh sách gợi ý — thay cho danh sách chọn (dropdown) khi chọn công trình, nhà, NCC, nhóm, hạng mục, vật tư, dự án.
 * Gõ vài chữ của mã hoặc tên (không phân biệt hoa thường, có dấu hay không dấu đều được): danh sách gợi ý "mã – tên" hiện ngay
 * dưới ô; ↑ ↓ để chọn, Enter để lấy, Esc để đóng; bấm chuột vào một dòng cũng được. Gõ đủ mã / đúng tên rồi Enter hay rời ô cũng
 * được; xóa trắng = tất cả.
 *
 * o: { id | name, list: [{ ma, ten, sub }], value (mã đang chọn, '' = tất cả, '__none__' = chưa gán), show: 'ma' | 'ten'
 *      (ô hiện mã hay tên sau khi chọn), none: '(Không gán nhà)' (thêm lựa chọn "chưa gán"), noun: 'nhà cung cấp' (cho câu báo lỗi),
 *      placeholder, label (aria-label), cls (lớp của khung ô: độ rộng…), type ('search' mặc định cho ô lọc),
 *      accept(text) -> mã lạ vẫn nhận (vd. mã chỉ có trong sổ), multi: true (chọn xong thì xóa trắng ô để chọn tiếp),
 *      exclude: Set các mã (keyOf) không gợi ý nữa, quiet: true (không báo lỗi khi rời ô — dùng trong biểu mẫu, lưu mới kiểm tra) } */
import { esc, toast } from './ui.js';

const KT = window.KT;
const NONE = '__none__';
const MAX_SHOW = 80;

function byCode(list, v) { return list.find((x) => KT.keyOf(x.ma) === KT.keyOf(v)); }
const norm = (s) => KT.normalizeText(String(s == null ? '' : s)).replace(/\s+/g, ' ').trim();

// Chữ hiện trong ô cho một giá trị
export function comboText(o, v) {
  if (!v || o.multi) return '';
  if (v === NONE) return o.none || '';
  const x = byCode(o.list, v);
  return o.show === 'ten' && x ? x.ten : x ? x.ma : String(v);
}

export function comboHtml(o) {
  const id = o.id || ('cb-' + o.name);
  const x = o.value && o.value !== NONE && !o.multi ? byCode(o.list, o.value) : null;
  return '<span class="combo-wrap' + (o.cls ? ' ' + o.cls : '') + '">' +
    '<input' + (o.id ? ' id="' + esc(o.id) + '"' : '') + (o.name ? ' name="' + esc(o.name) + '"' : '') + ' type="' + (o.type || 'search') + '"' +
    ' class="input combo w-full" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="' + esc(id) + '-ds" autocomplete="off"' +
    ' value="' + esc(comboText(o, o.value)) + '"' + (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') + (o.label ? ' aria-label="' + esc(o.label) + '"' : '') +
    (x ? ' title="' + esc(x.ma + ' – ' + x.ten) + '"' : '') + '>' +
    '<ul class="combo-list" id="' + esc(id) + '-ds" role="listbox" hidden></ul></span>';
}

// Ô lọc kiểu khung nhãn: [Nhãn  giá trị ▾]; đang lọc thì viền xanh thép + nền nhạt (kèm ✕ của ô tìm)
export function filterBox(label, o) {
  return '<div class="fbox' + (o.value ? ' on' : '') + '"><span class="lbl">' + esc(label) + '</span>' + comboHtml(o) + '</div>';
}

// Chữ đã gõ -> { ok, value }: mã, đúng tên (một kết quả), "Tên (MÃ)", "MÃ – Tên", lựa chọn "chưa gán", hoặc mã lạ o.accept nhận
export function comboResolve(o, text) {
  const t = String(text == null ? '' : text).normalize('NFC').trim();
  if (!t) return { ok: true, value: '' };
  const n = norm(t);
  if (o.none && n === norm(o.none)) return { ok: true, value: NONE };
  const c = byCode(o.list, t);
  if (c) return { ok: true, value: c.ma };
  const byName = o.list.filter((x) => norm(x.ten) === n);
  if (byName.length === 1) return { ok: true, value: byName[0].ma };
  const m = /\(([^()]+)\)\s*$/.exec(t) || /^(.+?)\s+[–-]\s+/.exec(t);
  if (m && byCode(o.list, m[1].trim())) return { ok: true, value: byCode(o.list, m[1].trim()).ma };
  const extra = o.accept ? o.accept(t) : '';
  return extra ? { ok: true, value: extra } : { ok: false, value: '' };
}

// Danh sách gợi ý cho chữ đang gõ: mọi từ đều phải có trong "mã tên" (bỏ dấu); mã khớp đúng / bắt đầu bằng chữ gõ lên trước
export function comboMatches(o, text) {
  const q = norm(text);
  const toks = q ? q.split(' ') : [];
  const items = (o.none ? [{ ma: NONE, ten: o.none, none: true }] : []).concat(o.list)
    .filter((x) => x.none || !o.exclude || !o.exclude.has(KT.keyOf(x.ma)));
  if (!toks.length) return items;
  const scored = [];
  items.forEach((x) => {
    const hay = x.none ? norm(x.ten) : norm(x.ma + ' ' + x.ten + ' ' + (x.sub || ''));
    if (!toks.every((t) => hay.includes(t))) return;
    const k = norm(x.ma);
    scored.push([k === q ? 0 : k.startsWith(q) ? 1 : norm(x.ten).startsWith(q) ? 2 : 3, x]);
  });
  return scored.sort((a, b) => a[0] - b[0]).map((s) => s[1]);
}

// Gắn hành vi cho ô: gọi onPick(mã) khi chọn gợi ý / Enter / rời ô với giá trị mới; gõ sai thì báo và trả lại giá trị cũ
export function bindCombo(input, o, onPick) {
  if (!input) return;
  const lb = input.parentNode.querySelector('.combo-list');
  let shown = [];
  let active = -1;
  let open = false;

  const close = () => {
    if (!open) return;
    open = false;
    lb.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };
  const setActive = (i) => {
    active = i;
    lb.querySelectorAll('.combo-opt').forEach((li, k) => li.classList.toggle('active', k === i));
    const li = lb.children[i];
    if (li && li.classList.contains('combo-opt')) {
      input.setAttribute('aria-activedescendant', li.id);
      li.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  };
  const render = () => {
    const all = comboMatches(o, input.value);
    shown = all.slice(0, MAX_SHOW);
    const base = lb.id;
    lb.innerHTML = shown.length
      ? shown.map((x, i) => '<li class="combo-opt" role="option" id="' + base + '-' + i + '" data-i="' + i + '">' +
        (x.none ? '<span>' + esc(x.ten) + '</span>' : '<b>' + esc(x.ma) + '</b><span>– ' + esc(x.ten) + (x.sub ? ' · ' + esc(x.sub) : '') + '</span>') + '</li>').join('') +
        (all.length > shown.length ? '<li class="combo-empty" role="presentation">… còn ' + (all.length - shown.length) + ' mục, gõ thêm để thu hẹp</li>' : '')
      : '<li class="combo-empty" role="presentation">Không có mục nào khớp “' + esc(input.value.trim()) + '”</li>';
    open = true;
    lb.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(shown.length && input.value.trim() ? 0 : -1);
  };
  const commit = (v) => {
    if (o.multi) {
      input.value = '';
      if (v && onPick) onPick(v);
      return;
    }
    input.value = comboText(o, v);
    const fb = input.closest('.fbox');
    if (fb) fb.classList.toggle('on', !!v);
    if (KT.keyOf(v) === KT.keyOf(o.value || '')) return;
    o.value = v;
    const x = v && v !== NONE ? byCode(o.list, v) : null;
    input.title = x ? x.ma + ' – ' + x.ten : '';
    if (onPick) onPick(v);
  };
  // Áp dụng chữ đang gõ (Enter không chọn dòng gợi ý nào, hoặc rời ô)
  const apply = () => {
    const t = input.value.trim();
    if (o.multi && !t) return;
    const r = comboResolve(o, t);
    if (!r.ok) {
      if (o.quiet) return;
      toast('Không có ' + (o.noun || 'mục') + ' “' + t + '”. Gõ mã hoặc tên rồi chọn trong danh sách gợi ý.', 'error');
      input.value = comboText(o, o.value);
      return;
    }
    commit(r.value);
  };

  input.addEventListener('input', (e) => {
    // nút × của ô tìm: bỏ chọn ngay
    if (!input.value && !e.inputType) { close(); commit(''); return; }
    render();
  });
  input.addEventListener('click', () => { if (!open) render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { render(); if (e.key === 'ArrowDown' && shown.length) setActive(0); return; }
      if (!shown.length) return;
      const n = e.key === 'ArrowDown' ? Math.min(active + 1, shown.length - 1) : Math.max(active - 1, 0);
      setActive(n);
    } else if (e.key === 'Enter') {
      // đang mở danh sách và có dòng được chọn: Enter = lấy dòng đó (không để biểu mẫu chứa ô coi là "Lưu");
      // danh sách đóng: áp dụng chữ đang gõ rồi để Enter đi tiếp (biểu mẫu lưu như bình thường)
      if (open && active >= 0 && shown[active]) { e.preventDefault(); e.stopPropagation(); const x = shown[active]; close(); commit(x.ma); } else { close(); apply(); }
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); e.stopPropagation(); close(); }
    } else if (e.key === 'Tab') close();
  });
  lb.addEventListener('mousedown', (e) => e.preventDefault()); // giữ tiêu điểm ở ô khi bấm vào danh sách
  lb.addEventListener('click', (e) => {
    const li = e.target.closest('.combo-opt');
    if (!li) return;
    const x = shown[Number(li.dataset.i)];
    close();
    if (x) commit(x.ma);
  });
  input.addEventListener('blur', () => { setTimeout(close, 120); });
  input.addEventListener('change', () => { if (!open) apply(); });
  // rời ô khi danh sách đang mở: change đến trước blur → áp dụng sau khi đóng
  input.addEventListener('blur', () => { setTimeout(() => { if (input.value.trim() !== comboText(o, o.value) && document.activeElement !== input) apply(); }, 130); });
}
