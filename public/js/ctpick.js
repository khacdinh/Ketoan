/* Chọn công trình ở thanh trên: áp dụng cho mọi sổ và báo cáo (thay cho ô "Dự án / Công trình" riêng ở từng màn hình).
 * Giá trị nằm ở S.ct; để các màn hình cũ vẫn chạy, mỗi lần đổi ta ghi cùng mã vào bộ lọc công trình của từng màn hình. */
import { $, esc, LS, icon } from './ui.js';
import { S, saveFilter, costProjects } from './state.js';

const KT = window.KT;
// [tên bộ lọc, tên trường chứa mã công trình]
const LOC = [['so', 'duAn'], ['cpSo', 'ct'], ['cpTh', 'ct'], ['cpCt', 'ct'], ['cpCn', 'ct']];

export function datCongTrinh(ma, nhanh) {
  S.ct = ma || '';
  LS.set('ct', S.ct);
  LOC.forEach(([f, k]) => { if (S.filters[f] && S.filters[f][k] !== S.ct) { S.filters[f][k] = S.ct; saveFilter(f); } });
  if (!nhanh) { veChonCongTrinh(); S.listeners.forEach((fn) => fn()); }
}

// Vẽ nhãn công trình ở thanh trên (và đồng bộ bộ lọc từng màn hình với lựa chọn chung)
export function veChonCongTrinh() {
  const el = $('#tb-ct-val');
  if (!el || !S.db) return;
  if (S.ct && !S.db.projects.some((p) => KT.keyOf(p.ma) === KT.keyOf(S.ct))) { S.ct = ''; LS.set('ct', ''); }
  LOC.forEach(([f, k]) => { if (S.filters[f] && (S.filters[f][k] || '') !== S.ct && S.filters[f][k] !== '__none__') { S.filters[f][k] = S.ct; saveFilter(f); } });
  const p = S.ct && S.db.projects.find((x) => KT.keyOf(x.ma) === KT.keyOf(S.ct));
  el.textContent = p ? p.ma + ' – ' + p.ten : 'Tất cả công trình';
  el.title = el.textContent;
}

let pop = null;
function dong() {
  if (!pop) return;
  pop.remove(); pop = null;
  document.removeEventListener('mousedown', ngoai, true);
  const b = $('#tb-ct'); if (b) b.setAttribute('aria-expanded', 'false');
}
function ngoai(e) { if (pop && !pop.contains(e.target) && !$('#tb-ct').contains(e.target)) dong(); }

export function moChonCongTrinh() {
  if (pop) { dong(); return; }
  const btn = $('#tb-ct');
  pop = document.createElement('div');
  pop.className = 'menu tb-ct-pop';
  pop.style.minWidth = '360px';
  pop.innerHTML = '<div class="p-1.5"><input type="search" class="input" id="ct-q" placeholder="Gõ mã hoặc tên công trình" aria-label="Tìm công trình" autocomplete="off"></div>' +
    '<div id="ct-list" role="listbox" class="max-h-[56vh] overflow-auto"></div>';
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect();
  pop.style.top = (r.bottom + 4 + window.scrollY) + 'px';
  pop.style.left = Math.max(8, r.left) + 'px';
  btn.setAttribute('aria-expanded', 'true');
  let act = 0;
  let items = [];
  const ve = () => {
    const q = KT.normalizeText($('#ct-q', pop).value.trim());
    const all = [{ ma: '', ten: 'Tất cả công trình', sub: 'Không lọc theo công trình' }].concat(costProjects().map((p) => ({ ma: p.ma, ten: p.ten, sub: p.ma })));
    items = all.filter((x) => !q || KT.normalizeText(x.ma + ' ' + x.ten).includes(q));
    if (act >= items.length) act = Math.max(0, items.length - 1);
    $('#ct-list', pop).innerHTML = items.map((x, i) => '<button type="button" role="option" class="flex w-full cursor-pointer items-baseline gap-2 px-3 py-1.5 text-left hover:bg-accent-100' + (i === act ? ' bg-accent-100' : '') + '" data-ma="' + esc(x.ma) + '" aria-selected="' + (KT.keyOf(x.ma) === KT.keyOf(S.ct)) + '">' +
      '<span class="min-w-0 flex-1"><b class="block truncate font-bold">' + esc(x.ten) + '</b>' + (x.ma ? '<span class="text-[11.5px] text-ink-3">' + esc(x.sub) + '</span>' : '<span class="text-[11.5px] text-ink-3">' + esc(x.sub) + '</span>') + '</span>' +
      (KT.keyOf(x.ma) === KT.keyOf(S.ct) ? icon('check', 'text-pen') : '') + '</button>').join('') || '<div class="px-3 py-3 text-ink-3">Không có công trình nào khớp.</div>';
  };
  const chon = (ma) => { dong(); datCongTrinh(ma); };
  ve();
  const q = $('#ct-q', pop);
  q.focus();
  q.addEventListener('input', () => { act = 0; ve(); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); act = Math.min(items.length - 1, act + 1); ve(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); act = Math.max(0, act - 1); ve(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[act]) chon(items[act].ma); }
    else if (e.key === 'Escape') { e.stopPropagation(); dong(); btn.focus(); }
  });
  pop.addEventListener('click', (e) => { const b = e.target.closest('[data-ma]'); if (b) chon(b.dataset.ma); });
  setTimeout(() => document.addEventListener('mousedown', ngoai, true), 0);
}
