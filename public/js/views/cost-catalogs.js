/* Danh mục chi phí công trình: nhóm CP, hạng mục, vật tư, nhà / khu (DM_NHOM, DM_HANGMUC, DM_VATTU, DM_NHA). */
import { $, esc, money, icon, api, toast, showError, confirmDialog, openModal, freshRoot, debounce, highlight, download, fieldError, busy } from '../ui.js';
import { S, saveFilter, groupName, itemByCode, costProjects, selectOptions } from '../state.js';
import { comboHtml, comboResolve, bindCombo } from '../combo.js';
import { mergeToolbarHtml, bindMergeUI, pickHead, pickCell, mergedRecords, mergedChip } from '../merge.js';

const KT = window.KT;

/* ============================== BIỂU MẪU DÙNG CHUNG ============================== */

// fields: [{ name, label, type: 'text'|'select'|'combo'|'check'|'textarea'|'qty', options, combo: { list, show, noun }, required, hint, list, placeholder, wide }]
// combo = ô gõ tìm có gợi ý (combo.js): gõ mã hoặc tên, khi lưu đổi về mã
function catalogForm(o) {
  const isEdit = !!(o.values && o.values.id);
  const v = o.values || {};
  const combos = {};
  const field = (f) => {
    const val = v[f.name] == null ? '' : v[f.name];
    const cls = 'field' + (f.wide ? ' col-span-2 max-sm:col-span-1' : '');
    const req = f.required ? ' <b class="req">*</b>' : '';
    if (f.type === 'check') {
      return '<label class="check ' + (f.wide ? 'col-span-2 max-sm:col-span-1' : 'self-end pb-2') + '"><input type="checkbox" name="' + f.name + '"' + (val ? ' checked' : '') + '>' + esc(f.label) + '</label>';
    }
    let input;
    if (f.type === 'combo') {
      combos[f.name] = Object.assign({ name: f.name, value: val, type: 'text', placeholder: f.placeholder, quiet: true }, f.combo);
      input = comboHtml(combos[f.name]);
    } else if (f.type === 'select') {
      input = '<select name="' + f.name + '" class="input">' + f.options.map(([ov, ol]) => '<option value="' + esc(ov) + '"' + (KT.keyOf(ov) === KT.keyOf(val) ? ' selected' : '') + '>' + esc(ol) + '</option>').join('') + '</select>';
    } else if (f.type === 'textarea') {
      input = '<textarea name="' + f.name + '" class="input" rows="2">' + esc(val) + '</textarea>';
    } else {
      input = '<input name="' + f.name + '" class="input' + (f.type === 'qty' ? ' text-right tabular-nums' : '') + '" value="' + esc(f.type === 'qty' && val !== '' ? KT.fmtQty(val) : val) + '"' +
        (f.list ? ' list="' + f.list + '"' : '') + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + (f.type === 'qty' ? ' inputmode="decimal"' : '') + '>';
    }
    return '<label class="' + cls + '"><span class="label">' + esc(f.label) + req + '</span>' + input + '<span class="hint">' + (f.hint || '') + '</span></label>';
  };
  return openModal({
    title: o.title,
    size: o.size,
    body: '<form class="grid grid-cols-2 gap-x-5 gap-y-4 max-sm:grid-cols-1" novalidate autocomplete="off">' + (o.extra || '') + o.fields.map(field).join('') + '</form>',
    footer: '<span class="flex-1"></span><button type="button" class="btn btn-ghost" data-act="cancel">Hủy</button>' +
      '<button type="button" class="btn btn-primary" data-act="save">' + (isEdit ? 'Lưu thay đổi' : esc(o.addText || 'Thêm vào danh mục')) + '</button>',
    onMount(el, h) {
      const f = el.querySelector('form');
      Object.keys(combos).forEach((k) => bindCombo(f.elements[k], combos[k], null));
      if (o.onMount) o.onMount(f, el);
      const save = async () => {
        const data = {};
        o.fields.forEach((fd) => {
          const inp = f.elements[fd.name];
          data[fd.name] = fd.type === 'check' ? inp.checked : inp.value.trim();
        });
        for (const fd of o.fields) {
          if (fd.type !== 'combo' || !data[fd.name]) continue;
          const r = comboResolve(fd.combo, data[fd.name]);
          if (!r.ok) { fieldError(f.elements[fd.name], fd.label + ' “' + data[fd.name] + '” chưa có trong danh mục. Gõ mã hoặc tên rồi chọn trong gợi ý'); return; }
          data[fd.name] = r.value;
        }
        if (o.transform) o.transform(data);
        for (const fd of o.fields) {
          if (fd.required && !data[fd.name]) {
            fieldError(f.elements[fd.name], (fd.type === 'select' || fd.type === 'combo' ? 'Chọn ' : 'Nhập ') + fd.label.toLowerCase());
            return;
          }
        }
        const done = busy(el.querySelector('[data-act=save]'), 'Đang lưu…');
        try {
          const r = isEdit ? await api('PUT', o.endpoint + '/' + v.id, data) : await api('POST', o.endpoint, data);
          toast((isEdit ? 'Đã lưu ' : 'Đã thêm ') + data.ma + (r.renamed ? ', cập nhật mã trên ' + r.renamed + ' chỗ đang dùng' : ''));
          h.close();
          if (o.onSaved) o.onSaved(Object.assign({}, data, { ma: r.ma || data.ma }));
        } catch (err) { done(); showError(err); }
      };
      el.addEventListener('click', (ev) => {
        const a = ev.target.closest('[data-act]');
        if (!a) return;
        if (a.dataset.act === 'cancel') h.close();
        if (a.dataset.act === 'save') save();
      });
      f.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && ev.target.tagName !== 'TEXTAREA') { ev.preventDefault(); save(); }
      });
    }
  });
}

function nextItemCode() {
  let n = 0;
  S.db.costItems.forEach((x) => { const m = /^HM(\d+)$/i.exec(x.ma); if (m) n = Math.max(n, +m[1]); });
  return 'HM' + String(n + 1).padStart(2, '0');
}

export function openGroupForm(g, onSaved) {
  const used = g && g.id ? S.db.costItems.filter((i) => KT.keyOf(i.maNhom) === KT.keyOf(g.ma)).length : 0;
  return catalogForm({
    title: g && g.id ? 'Sửa nhóm chi phí' : 'Thêm nhóm chi phí',
    endpoint: '/api/cost-groups',
    values: g,
    onSaved,
    fields: [
      { name: 'ma', label: 'Mã nhóm', required: true, placeholder: 'VD: NHOM_HoanThien', hint: used ? 'Đổi mã sẽ cập nhật ' + used + ' hạng mục' : '' },
      { name: 'ten', label: 'Tên nhóm chi phí', required: true, placeholder: 'VD: 4. Hoàn thiện', hint: 'Đặt số thứ tự ở đầu để báo cáo xếp đúng thứ tự' },
      { name: 'ghiChu', label: 'Ghi chú', wide: true }
    ]
  });
}

export function openItemForm(it, onSaved) {
  const isEdit = !!(it && it.id);
  const used = isEdit ? S.all.costs.filter((c) => KT.keyOf(c.maHM) === KT.keyOf(it.ma)).length : 0;
  return catalogForm({
    title: isEdit ? 'Sửa hạng mục' : 'Thêm hạng mục chi phí',
    endpoint: '/api/cost-items',
    values: Object.assign({ ma: nextItemCode(), ten: '', maNhom: '', ghiChu: '' }, it || {}),
    onSaved,
    fields: [
      { name: 'ma', label: 'Mã hạng mục', required: true, hint: used ? 'Đang dùng trong ' + used + ' dòng chi phí' : '' },
      { name: 'maNhom', label: 'Thuộc nhóm', type: 'combo', combo: { list: S.db.costGroups, show: 'ten', noun: 'nhóm chi phí' }, placeholder: 'Gõ tên nhóm', required: true, hint: 'Đổi nhóm: mọi báo cáo tự xếp lại' },
      { name: 'ten', label: 'Tên hạng mục', required: true, wide: true, hint: isEdit ? 'Đổi tên: sổ chi phí và báo cáo tự đổi theo' : '' },
      { name: 'ghiChu', label: 'Ghi chú', wide: true }
    ]
  });
}

export function openMaterialForm(m, onSaved) {
  const isEdit = !!(m && m.id);
  const it = m && m.maHM ? itemByCode(m.maHM) : null;
  const used = isEdit ? S.all.costs.filter((c) => KT.keyOf(c.maVT) === KT.keyOf(m.ma)).length : 0;
  return catalogForm({
    title: isEdit ? 'Sửa vật tư ' + m.ma : 'Thêm vật tư',
    endpoint: '/api/materials',
    values: Object.assign({ ma: '', ten: '', dvt: '', ghiChu: '', loaiCP: '' }, m || {}, { hmTen: it ? it.ten : (m && m.hmTen) || '' }),
    onSaved,
    extra: '<datalist id="dl-hm-f">' + S.db.costItems.map((x) => '<option value="' + esc(x.ten) + '">').join('') + '</datalist>' +
      '<datalist id="dl-dvt-f">' + Array.from(new Set(S.db.materials.map((x) => x.dvt).filter(Boolean))).map((x) => '<option value="' + esc(x) + '">').join('') + '</datalist>',
    fields: [
      { name: 'ma', label: 'Mã vật tư', required: true, placeholder: 'VD: ST-D16, VL-CATXAY', hint: used ? 'Đổi mã sẽ cập nhật ' + used + ' dòng chi phí' : 'Tiền tố hạng mục + tên viết tắt không dấu' },
      { name: 'dvt', label: 'Đơn vị tính chuẩn', list: 'dl-dvt-f', placeholder: 'cây, kg, m3, viên...' },
      { name: 'ten', label: 'Tên vật tư', required: true, wide: true },
      { name: 'hmTen', label: 'Hạng mục', required: true, list: 'dl-hm-f', placeholder: 'Gõ tên hạng mục', hint: 'Mọi dòng chi phí của vật tư này tính vào hạng mục (và nhóm chi phí) này' },
      { name: 'loaiCP', label: 'Loại CP mặc định', type: 'select', options: [['', 'Tự xác định']].concat(KT.LOAI_CP.map((l) => [l, l])) },
      { name: 'ghiChu', label: 'Ghi chú', wide: true }
    ],
    transform(d) { d.maHM = d.hmTen; } // giữ hmTen để kiểm tra ô bắt buộc (máy chủ bỏ qua trường lạ)
  });
}

export function openHouseForm(h, onSaved) {
  const isEdit = !!(h && h.id);
  const used = isEdit ? S.all.costs.filter((c) => KT.keyOf(c.maNha) === KT.keyOf(h.ma)).length : 0;
  return catalogForm({
    title: isEdit ? 'Sửa nhà / khu ' + h.ma : 'Thêm nhà / khu',
    endpoint: '/api/houses',
    values: Object.assign({ ma: '', maCT: '', ten: '', dienTich: '', chuNha: '', chung: false, ghiChu: '' }, h || {}),
    onSaved,
    fields: [
      { name: 'ma', label: 'Mã nhà', required: true, placeholder: 'VD: N1', hint: used ? 'Đổi mã sẽ cập nhật ' + used + ' dòng chi phí' : '' },
      { name: 'maCT', label: 'Thuộc công trình', type: 'combo', required: true, combo: { list: costProjects(), noun: 'công trình' }, placeholder: 'Gõ mã hoặc tên công trình' },
      { name: 'ten', label: 'Tên nhà / khu', required: true, wide: true },
      { name: 'dienTich', label: 'Diện tích sàn (m2)', type: 'qty' },
      { name: 'chuNha', label: 'Chủ nhà' },
      { name: 'chung', label: 'Dùng chung cả công trình (chi phí không tách được về một nhà)', type: 'check', wide: true },
      { name: 'ghiChu', label: 'Ghi chú', wide: true }
    ]
  });
}

/* ============================== MÀN HÌNH DANH MỤC ============================== */

const TABS = [
  ['hang-muc', 'Hạng mục', 'list'],
  ['nhom', 'Nhóm chi phí', 'stack'],
  ['vat-tu', 'Vật tư', 'package'],
  ['nha', 'Nhà / khu', 'house']
];

function usageMap(field) {
  const m = new Map();
  S.db.costs.forEach((c) => {
    const k = KT.keyOf(c[field]);
    const a = m.get(k) || { n: 0, tien: 0 };
    a.n++;
    a.tien += c.thanhTien || 0;
    m.set(k, a);
  });
  return m;
}

function actions(label, extra) {
  return '<td class="actions no-print">' + (extra || '') +
    '<button type="button" class="icon-btn" data-act="edit" title="Sửa" aria-label="Sửa ' + esc(label) + '">' + icon('edit') + '</button>' +
    '<button type="button" class="icon-btn danger" data-act="del" title="Xóa" aria-label="Xóa ' + esc(label) + '">' + icon('trash') + '</button></td>';
}

/* Cây "Khoản mục chi phí" bên trái tab Vật tư: nhóm chi phí → hạng mục, chọn để lọc bảng vật tư.
   f.vtSel: '' = tất cả, 'g:<mã nhóm>' (g: = chưa có nhóm), 'h:<mã hạng mục>' (h: = vật tư chưa có hạng mục); f.vtMo: các nhóm đang mở. */
function vtTree(tree, f, match) {
  const items = S.db.costItems;
  const itemKeys = new Set(items.map((i) => KT.keyOf(i.ma)));
  const groupKeys = new Set(S.db.costGroups.map((g) => KT.keyOf(g.ma)));
  const nhomCua = (i) => (groupKeys.has(KT.keyOf(i.maNhom)) ? KT.keyOf(i.maNhom) : '');
  const hmCua = (m) => (itemKeys.has(KT.keyOf(m.maHM)) ? KT.keyOf(m.maHM) : '');
  const nItem = new Map();
  let nAll = 0;
  S.db.materials.forEach((m) => {
    if (!match(m.ma + ' ' + m.ten + ' ' + ((itemByCode(m.maHM) || {}).ten || '') + ' ' + (m.ghiChu || ''))) return;
    nAll++;
    const k = hmCua(m);
    nItem.set(k, (nItem.get(k) || 0) + 1);
  });
  const groups = S.db.costGroups.map((g) => ({ k: KT.keyOf(g.ma), ma: g.ma, ten: g.ten, items: items.filter((i) => nhomCua(i) === KT.keyOf(g.ma)) }));
  const moCo = items.filter((i) => !nhomCua(i));
  if (moCo.length) groups.push({ k: '', ma: '', ten: '(Chưa có nhóm)', items: moCo });
  // lựa chọn cũ không còn (đã xóa / đổi mã) → về Tất cả
  let v = f.vtSel || '';
  if (v.startsWith('h:') && v.length > 2 && !itemKeys.has(KT.keyOf(v.slice(2)))) v = '';
  if (v.startsWith('g:') && !groups.some((g) => 'g:' + g.k === 'g:' + KT.keyOf(v.slice(2)))) v = '';
  f.vtSel = v;
  const kind = v.slice(0, 1);
  const key = KT.keyOf(v.slice(2));
  const mo = new Set((f.vtMo || []).map(KT.keyOf));
  if (kind === 'h' && key) { const it = itemByCode(key); if (it) mo.add(nhomCua(it)); }

  const node = (sel, attrs, inner, n, cls) => '<button type="button" class="tree-node ' + (cls || '') + (sel ? ' is-on' : '') + '"' + attrs + (sel ? ' aria-current="true"' : '') + '>' + inner +
    '<span class="tree-n">' + n + '</span></button>';
  let html = '<div class="dm-tree-head">' + icon('stack') + 'Khoản mục chi phí</div><div class="dm-tree-body" role="tree">' +
    node(!v, ' data-tree=""', icon('package') + '<span class="tree-label">Tất cả vật tư</span>', nAll, 'tree-all');
  groups.forEach((g) => {
    const open = mo.has(g.k);
    const n = g.items.reduce((t, i) => t + (nItem.get(KT.keyOf(i.ma)) || 0), 0);
    html += '<div class="tree-grp" role="treeitem" aria-expanded="' + open + '">' +
      '<div class="tree-row"><button type="button" class="tree-caret' + (open ? ' open' : '') + '" data-tree-mo="' + esc(g.k) + '" aria-label="' + (open ? 'Thu gọn ' : 'Mở ') + esc(g.ten) + '">' + icon('caretRight') + '</button>' +
      node(kind === 'g' && key === g.k, ' data-tree="g:' + esc(g.ma) + '"', '<span class="tree-label">' + esc(g.ten) + '</span>', n, 'tree-g') + '</div>' +
      (open ? '<div class="tree-kids" role="group">' + (g.items.map((i) =>
        node(kind === 'h' && key === KT.keyOf(i.ma), ' data-tree="h:' + esc(i.ma) + '" title="' + esc(i.ma + ' · ' + i.ten) + '"', '<span class="tree-label">' + esc(i.ten) + '</span>', nItem.get(KT.keyOf(i.ma)) || 0, 'tree-h')).join('') ||
        '<div class="tree-empty">Chưa có hạng mục</div>') + '</div>' : '') + '</div>';
  });
  if (nItem.get('')) html += node(kind === 'h' && !key, ' data-tree="h:"', icon('warn') + '<span class="tree-label">Vật tư chưa có hạng mục</span>', nItem.get(''), 'tree-all tree-warn');
  html += '</div><div class="dm-tree-foot">' +
    '<button type="button" class="btn btn-secondary btn-sm" data-act="tree-add-hm" title="Thêm hạng mục vào nhóm đang chọn">' + icon('plus') + 'Hạng mục</button>' +
    '<button type="button" class="btn btn-secondary btn-sm" data-act="tree-add-nhom">' + icon('plus') + 'Nhóm</button>' +
    '<button type="button" class="btn btn-secondary btn-sm" data-act="tree-edit"' + ((kind === 'h' && key) || (kind === 'g' && key) ? '' : ' disabled') + ' title="Sửa nhóm / hạng mục đang chọn">' + icon('edit') + 'Sửa</button></div>';
  tree.innerHTML = html;

  let sel;
  if (!v) sel = { k: '', ten: 'Tất cả vật tư', sub: S.db.costGroups.length + ' nhóm chi phí · ' + items.length + ' hạng mục' };
  else if (kind === 'g') {
    const g = groups.find((x) => x.k === key);
    sel = { k: 'g', ma: g.ma, ten: g.ten, sub: 'Cả nhóm · ' + g.items.length + ' hạng mục' };
  } else if (key) {
    const it = itemByCode(key);
    sel = { k: 'h', ma: it.ma, ten: it.ten, sub: it.ma + ' · ' + (groupName(it.maNhom) || 'Chưa có nhóm') };
  } else sel = { k: 'h', ma: '', ten: 'Vật tư chưa có hạng mục', sub: 'Gán hạng mục để chi phí vào đúng nhóm trong báo cáo' };
  const inSel = (m) => {
    if (!v) return true;
    const h = hmCua(m);
    if (kind === 'h') return h === key;
    if (!h) return false;
    return nhomCua(itemByCode(h)) === key;
  };
  return { sel, inSel };
}

// menu trái có hai mục trỏ vào màn này: "Vật tư" (tab vật tư, nhà/khu) và "Hạng mục, nhóm CP" (tab hạng mục, nhóm)
export const menuTabDanhMuc = () => (['hang-muc', 'nhom'].includes(S.filters.cpDm.tab) ? 'hang-muc' : 'vat-tu');
function dongBoMenu() {
  document.querySelectorAll('.nav-item[data-route="cp-danh-muc"][data-tab]').forEach((a) => {
    const on = a.dataset.tab === menuTabDanhMuc();
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

export function renderCostCatalogs(root) {
  root = freshRoot(root);
  const f = S.filters.cpDm;
  if (!TABS.some((t) => t[0] === f.tab)) f.tab = 'hang-muc';
  root.innerHTML =
    '<div class="no-print flex flex-wrap items-center gap-2">' +
    '<div class="seg" role="radiogroup" aria-label="Loại danh mục">' + TABS.map(([k, l]) =>
      '<label class="seg-item"><input type="radio" name="dm-tab" value="' + k + '"' + (f.tab === k ? ' checked' : '') + '><span>' + l + '</span></label>').join('') + '</div>' +
    '<label class="search min-w-[240px]">' + icon('search') + '<input id="dm-q" type="search" class="input" placeholder="Tìm mã, tên" value="' + esc(f.q) + '" aria-label="Tìm trong danh mục"></label>' +
    '<span class="flex-1"></span><span class="flex flex-wrap items-center gap-2" id="dm-merge"></span>' +
    '<button type="button" class="btn btn-secondary" data-act="export">' + icon('excel') + 'Xuất Excel</button>' +
    '<button type="button" class="btn btn-primary" data-act="add">' + icon('plus') + '<span id="dm-add-label"></span></button>' +
    '</div>' +
    '<div class="dm-split" id="dm-split"><aside class="sheet dm-tree" id="dm-tree" aria-label="Khoản mục chi phí" hidden></aside>' +
    '<section class="sheet min-w-0 overflow-hidden"><div class="dm-head" id="dm-head" hidden></div><p class="border-b border-rule px-4 py-2.5 text-[13px] text-ink-2" id="dm-count"></p>' +
    '<div class="table-scroll max-h-[calc(100vh-250px)] overflow-auto"><table class="ledger" id="dm-table"></table></div></section></div>';

  const TAB_LOAI = { 'hang-muc': 'hm', 'vat-tu': 'vt', nha: 'nha' };
  const draw = () => {
    const q = KT.normalizeText(f.q).trim();
    const match = (s) => !q || KT.normalizeText(s).includes(q);
    const loai = TAB_LOAI[f.tab];
    const showMerged = !!(f.merged && loai);
    $('#dm-merge', root).innerHTML = loai ? mergeToolbarHtml(loai, f.merged) : '';
    const pk = loai ? pickHead : '';
    const pc = (ma) => (loai ? pickCell(ma) : '');
    // mã đã gộp (ẩn mặc định): chỉ để tra cứu; muốn dùng lại thì hoàn tác ở màn Gộp mã
    const mergedRows = (cols) => (showMerged ? mergedRecords(loai).filter((x) => match(x.ma + ' ' + x.ten + ' ' + x.gopVao)).map((x) =>
      '<tr class="text-ink-3"><td class="no-print"></td><td class="code">' + esc(x.ma) + '</td><td>' + esc(x.ten || '') + '</td><td colspan="' + (cols - 3) + '">' + mergedChip(x) + '</td></tr>').join('') : '');
    $('#dm-add-label', root).textContent = { 'hang-muc': 'Thêm hạng mục', nhom: 'Thêm nhóm', 'vat-tu': 'Thêm vật tư', nha: 'Thêm nhà' }[f.tab];
    const table = $('#dm-table', root);
    const head = $('#dm-head', root);
    const tree = $('#dm-tree', root);
    head.hidden = true;
    tree.hidden = f.tab !== 'vat-tu';
    $('#dm-split', root).classList.toggle('has-tree', f.tab === 'vat-tu');
    if (f.tab !== 'vat-tu') tree.innerHTML = '';
    let count = '';
    if (f.tab === 'nhom') {
      const byItem = usageMap('maHM');
      const list = S.db.costGroups.filter((g) => match(g.ma + ' ' + g.ten + ' ' + (g.ghiChu || '')));
      table.innerHTML = '<thead><tr>' + pickHead + '<th>Mã nhóm</th><th>Tên nhóm chi phí</th><th class="num">Số hạng mục</th><th class="num money">Tổng chi phí</th><th>Ghi chú</th><th class="no-print"></th></tr></thead><tbody>' +
        (list.map((g) => {
          const items = S.db.costItems.filter((i) => KT.keyOf(i.maNhom) === KT.keyOf(g.ma));
          const tien = items.reduce((t, i) => t + ((byItem.get(KT.keyOf(i.ma)) || {}).tien || 0), 0);
          return '<tr data-id="' + g.id + '">' + pickCell(g.ma) + '<td class="code">' + highlight(g.ma, f.q) + '</td><td class="font-medium">' + highlight(g.ten, f.q) + '</td>' +
            '<td class="num">' + items.length + '</td><td class="num money">' + money(tien) + '</td><td class="text-[12.5px] text-ink-2">' + esc(g.ghiChu || '') + '</td>' + actions(g.ma) + '</tr>';
        }).join('') || '<tr><td colspan="7" class="empty">Không có nhóm nào khớp.</td></tr>') + '</tbody>';
      count = S.db.costGroups.length + ' nhóm lớn. Đổi tên nhóm: mọi hạng mục và báo cáo tự đổi theo.';
    } else if (f.tab === 'hang-muc') {
      const use = usageMap('maHM');
      let html = '<thead><tr>' + pk + '<th>Mã HM</th><th>Hạng mục</th><th>Nhóm chi phí</th><th class="num">Số dòng</th><th class="num money">Tổng chi phí</th><th>Ghi chú</th><th class="no-print"></th></tr></thead><tbody>';
      let n = 0;
      const groups = S.db.costGroups.concat([{ ma: '', ten: '(Chưa có nhóm)' }]);
      groups.forEach((g) => {
        const items = S.db.costItems.filter((i) => (g.ma ? KT.keyOf(i.maNhom) === KT.keyOf(g.ma) : !S.db.costGroups.some((x) => KT.keyOf(x.ma) === KT.keyOf(i.maNhom))) &&
          match(i.ma + ' ' + i.ten + ' ' + g.ten + ' ' + (i.ghiChu || '')));
        if (!items.length) return;
        html += '<tr class="group-row"><td colspan="8">' + esc(g.ten) + ' <span class="font-normal text-ink-3">· ' + items.length + ' hạng mục</span></td></tr>';
        items.forEach((i) => {
          n++;
          const u = use.get(KT.keyOf(i.ma)) || { n: 0, tien: 0 };
          html += '<tr data-id="' + i.id + '">' + pc(i.ma) + '<td class="code">' + highlight(i.ma, f.q) + '</td><td>' + highlight(i.ten, f.q) + '</td><td class="text-ink-2">' + esc(groupName(i.maNhom) || '') + '</td>' +
            '<td class="num">' + (u.n || '') + '</td><td class="num money' + (u.tien ? ' font-semibold' : ' text-ink-3') + '">' + money(u.tien) + '</td><td class="text-[12.5px] text-ink-2">' + esc(i.ghiChu || '') + '</td>' + actions(i.ma) + '</tr>';
        });
      });
      table.innerHTML = html + (n ? '' : '<tr><td colspan="8" class="empty">Không có hạng mục nào khớp.</td></tr>') + mergedRows(8) + '</tbody>';
      count = n + ' trên ' + S.db.costItems.length + ' hạng mục. Đổi tên hoặc chuyển nhóm: sổ chi phí và báo cáo tự cập nhật.';
    } else if (f.tab === 'vat-tu') {
      const stats = new Map(KT.materialStats(S.db).map((m) => [KT.keyOf(m.ma), m]));
      const cay = vtTree(tree, f, match);
      const sel = cay.sel;
      const list = S.db.materials.filter((m) => cay.inSel(m) && match(m.ma + ' ' + m.ten + ' ' + ((itemByCode(m.maHM) || {}).ten || '') + ' ' + (m.ghiChu || '')));
      const shown = list.slice(0, 600);
      const motNhom = sel.k === 'h';
      table.innerHTML = '<thead><tr>' + pk + '<th>Mã vật tư</th><th>Tên vật tư</th><th>ĐVT</th><th>Khoản mục mặc định</th>' +
        '<th class="num money" title="Đơn giá bình quân các lần mua (không tính dòng theo khoản); rê chuột xem giá thấp nhất, cao nhất, gần nhất">Giá thường</th>' +
        '<th class="num" title="Số dòng chi phí đang dùng mã này; rê chuột xem tổng tiền đã mua">Đang dùng</th><th class="no-print"></th></tr></thead><tbody>' +
        (shown.map((m) => {
          const st = stats.get(KT.keyOf(m.ma));
          const it = itemByCode(m.maHM);
          const gia = st && st.binhQuan ? '<span title="' + esc('Thấp nhất ' + money(st.min) + ' · cao nhất ' + money(st.max) + (st.last != null ? ' · gần nhất ' + money(st.last) : '') + (st.lastNgay ? ' (' + KT.fmtDate(st.lastNgay) + ')' : '')) + '">' + money(st.binhQuan) + '</span>' : '';
          return '<tr data-id="' + m.id + '">' + pc(m.ma) + '<td class="code dm-ma">' + highlight(m.ma, f.q).replace(/-/g, '-<wbr>') + '</td><td class="min-w-[160px] font-medium">' + highlight(m.ten, f.q) + '</td><td>' + esc(m.dvt || '') + '</td>' +
            '<td class="text-ink-2">' + (it ? esc(it.ten) + (motNhom ? '' : '<div class="text-[12px] text-ink-3">' + esc(groupName(it.maNhom) || '') + '</div>') : '<span class="pill">Chưa có hạng mục</span>') + '</td>' +
            '<td class="num money">' + gia + '</td>' +
            '<td class="num">' + (st ? '<span class="dm-use" title="' + esc(st.soLan + ' dòng chi phí · tổng đã mua ' + money(st.tongTien) + ' đ') + '">' + st.soLan + '</span>' : '<span class="text-ink-3">0</span>') + '</td>' +
            actions(m.ma, st ? '<button type="button" class="icon-btn" data-act="price" title="Lịch sử giá" aria-label="Lịch sử giá ' + esc(m.ma) + '">' + icon('chartLineSimple') + '</button>' : '') + '</tr>';
        }).join('') || '<tr><td colspan="8" class="empty">' + (q && sel.k ? 'Không có vật tư nào khớp trong mục này. Chọn “Tất cả vật tư” để tìm trong toàn bộ danh mục.' : sel.k ? 'Mục này chưa có vật tư nào. Bấm “Thêm vật tư” để thêm vào đây.' : 'Không có vật tư nào khớp.') + '</td></tr>') +
        (list.length > shown.length ? '<tr><td colspan="8" class="text-[12.5px] text-ink-3">Đang hiện ' + shown.length + ' / ' + list.length + ' mã. Gõ từ khóa để lọc.</td></tr>' : '') + mergedRows(8) + '</tbody>';
      head.hidden = false;
      head.innerHTML = '<div class="min-w-0"><div class="dm-head-title">' + esc(sel.ten) + '</div>' + (sel.sub ? '<div class="text-[12.5px] text-ink-3">' + esc(sel.sub) + '</div>' : '') + '</div>' +
        '<span class="pill">' + list.length + ' vật tư</span>';
      count = (sel.k ? list.length + ' vật tư trong mục này' : list.length + ' trên ' + S.db.materials.length + ' mã vật tư') + '. Giá thường = đơn giá bình quân các lần mua; Đang dùng = số dòng trong sổ chi phí.';
    } else {
      const use = usageMap('maNha');
      const list = S.db.houses.filter((h) => match(h.ma + ' ' + h.ten + ' ' + h.maCT + ' ' + (h.chuNha || '')));
      table.innerHTML = '<thead><tr>' + pk + '<th>Mã nhà</th><th>Công trình</th><th>Tên nhà / khu</th><th class="num">Diện tích (m2)</th><th>Chủ nhà</th><th>Dùng chung</th><th class="num">Số dòng</th><th class="num money">Tổng chi phí</th><th class="no-print"></th></tr></thead><tbody>' +
        (list.map((h) => {
          const u = use.get(KT.keyOf(h.ma)) || { n: 0, tien: 0 };
          return '<tr data-id="' + h.id + '">' + pc(h.ma) + '<td class="code">' + highlight(h.ma, f.q) + '</td><td>' + highlight(h.maCT || '', f.q) + '</td><td>' + highlight(h.ten, f.q) + '</td>' +
            '<td class="num">' + (h.dienTich !== '' && h.dienTich != null ? KT.fmtQty(h.dienTich) : '') + '</td><td>' + esc(h.chuNha || '') + '</td>' +
            '<td>' + (h.chung ? '<span class="pill">Cả công trình</span>' : '') + '</td><td class="num">' + (u.n || '') + '</td><td class="num money">' + money(u.tien) + '</td>' + actions(h.ma) + '</tr>';
        }).join('') || '<tr><td colspan="10" class="empty">Chưa có nhà nào. Mỗi công trình nên có một mục “dùng chung cả công trình” cho chi phí không tách được.</td></tr>') + mergedRows(10) + '</tbody>';
      count = list.length + ' nhà / khu. Chi phí không tách được về một nhà thì chọn nhà “dùng chung”.';
    }
    $('#dm-count', root).textContent = count;
  };

  root.querySelectorAll('input[name=dm-tab]').forEach((r) => r.addEventListener('change', () => { f.tab = r.value; saveFilter('cpDm'); draw(); dongBoMenu(); }));
  bindMergeUI(root, () => TAB_LOAI[f.tab], (v) => { f.merged = v; saveFilter('cpDm'); draw(); }, { noun: 'mã', coGop: () => !!TAB_LOAI[f.tab], list: () => listOf(), endpoint: () => ({ nhom: '/api/cost-groups', 'hang-muc': '/api/cost-items', 'vat-tu': '/api/materials', nha: '/api/houses' }[f.tab]) });
  $('#dm-q', root).addEventListener('input', debounce((e) => { f.q = e.target.value; saveFilter('cpDm'); draw(); }, 120));

  const listOf = () => ({ nhom: S.db.costGroups, 'hang-muc': S.db.costItems, 'vat-tu': S.db.materials, nha: S.db.houses }[f.tab]);
  const openForm = (x) => ({ nhom: openGroupForm, 'hang-muc': openItemForm, 'vat-tu': openMaterialForm, nha: openHouseForm }[f.tab])(x);
  const endpoint = () => ({ nhom: '/api/cost-groups', 'hang-muc': '/api/cost-items', 'vat-tu': '/api/materials', nha: '/api/houses' }[f.tab]);

  root.addEventListener('click', async (e) => {
    const mo = e.target.closest('[data-tree-mo]');
    if (mo) {
      const k = mo.dataset.treeMo;
      const s = new Set((f.vtMo || []).map(KT.keyOf));
      if (mo.classList.contains('open')) {
        s.delete(k);
        // đang chọn hạng mục trong nhóm vừa thu gọn → chọn cả nhóm
        const v = f.vtSel || '';
        const it = v.startsWith('h:') && v.length > 2 ? itemByCode(v.slice(2)) : null;
        if (it && KT.keyOf(it.maNhom) === k) f.vtSel = 'g:' + it.maNhom;
        if (v.startsWith('g:') && KT.keyOf(v.slice(2)) === k) f.vtSel = '';
      } else s.add(k);
      f.vtMo = Array.from(s);
      saveFilter('cpDm'); draw();
      return;
    }
    const tn = e.target.closest('[data-tree]');
    if (tn) {
      f.vtSel = tn.dataset.tree;
      if (f.vtSel.startsWith('g:')) f.vtMo = Array.from(new Set((f.vtMo || []).map(KT.keyOf).concat([KT.keyOf(f.vtSel.slice(2))])));
      saveFilter('cpDm'); draw();
      return;
    }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const tr = a.closest('tr[data-id]');
    const x = tr ? listOf().find((i) => i.id === Number(tr.dataset.id)) : null;
    const act = a.dataset.act;
    if (act === 'add') {
      // đang chọn một hạng mục trong cây → vật tư mới thuộc sẵn hạng mục đó
      const v = f.vtSel || '';
      if (f.tab === 'vat-tu' && v.startsWith('h:') && v.length > 2) openMaterialForm({ maHM: v.slice(2) });
      else openForm(null);
    } else if (act === 'tree-add-hm') {
      const v = f.vtSel || '';
      const it = v.startsWith('h:') && v.length > 2 ? itemByCode(v.slice(2)) : null;
      openItemForm({ maNhom: v.startsWith('g:') ? v.slice(2) : it ? it.maNhom : '' });
    } else if (act === 'tree-add-nhom') openGroupForm(null);
    else if (act === 'tree-edit') {
      const v = f.vtSel || '';
      if (v.startsWith('h:')) { const it = itemByCode(v.slice(2)); if (it) openItemForm(it); }
      else if (v.startsWith('g:')) { const g = S.db.costGroups.find((x) => KT.keyOf(x.ma) === KT.keyOf(v.slice(2))); if (g) openGroupForm(g); }
    }
    else if (act === 'export') download('/api/export/costs');
    else if (act === 'edit' && x) openForm(x);
    else if (act === 'price' && x) {
      S.filters.cpGia.vt = x.ma;
      saveFilter('cpGia');
      location.hash = '#/cp-gia';
    } else if (act === 'del' && x) {
      if (!(await confirmDialog({ trash: true, title: 'Xóa khỏi danh mục', html: 'Xóa <b class="text-ink">' + esc(x.ma) + '</b>, ' + esc(x.ten) + '?', okText: 'Xóa', danger: true }))) return;
      try { await api('DELETE', endpoint() + '/' + x.id); toast('Đã xóa ' + x.ma + ', chuyển vào Thùng rác'); } catch (err) { showError(err); }
    }
  });
  root.addEventListener('dblclick', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr || e.target.closest('button')) return;
    const x = listOf().find((i) => i.id === Number(tr.dataset.id));
    if (x) openForm(x);
  });
  draw();
}

export { selectOptions };
