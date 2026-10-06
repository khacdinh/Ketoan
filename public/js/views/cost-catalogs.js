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
    '<section class="sheet overflow-hidden"><p class="border-b border-rule px-4 py-2.5 text-[13px] text-ink-2" id="dm-count"></p>' +
    '<div class="table-scroll max-h-[calc(100vh-250px)] overflow-auto"><table class="ledger" id="dm-table"></table></div></section>';

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
      const list = S.db.materials.filter((m) => match(m.ma + ' ' + m.ten + ' ' + ((itemByCode(m.maHM) || {}).ten || '') + ' ' + (m.ghiChu || '')));
      const shown = list.slice(0, 600);
      table.innerHTML = '<thead><tr>' + pk + '<th>Mã VT</th><th>Tên vật tư</th><th>ĐVT</th><th>Hạng mục hay dùng</th><th>Loại CP</th><th class="num">Số lần mua</th><th class="num money">Tổng đã mua</th><th class="num money">Giá gần nhất</th><th class="no-print"></th></tr></thead><tbody>' +
        (shown.map((m) => {
          const st = stats.get(KT.keyOf(m.ma));
          const it = itemByCode(m.maHM);
          return '<tr data-id="' + m.id + '">' + pc(m.ma) + '<td class="code">' + highlight(m.ma, f.q) + '</td><td class="min-w-[200px]">' + highlight(m.ten, f.q) + '</td><td>' + esc(m.dvt || '') + '</td>' +
            '<td class="text-ink-2">' + esc(it ? it.ten : '') + '</td><td class="text-ink-2">' + esc(m.loaiCP || '') + '</td>' +
            '<td class="num">' + (st ? st.soLan : '') + '</td><td class="num money' + (st ? ' font-semibold' : '') + '">' + (st ? money(st.tongTien) : '') + '</td>' +
            '<td class="num money">' + (st ? money(st.last) : '') + '</td>' +
            actions(m.ma, st ? '<button type="button" class="icon-btn" data-act="price" title="Lịch sử giá" aria-label="Lịch sử giá ' + esc(m.ma) + '">' + icon('chartLineSimple') + '</button>' : '') + '</tr>';
        }).join('') || '<tr><td colspan="10" class="empty">Không có vật tư nào khớp.</td></tr>') +
        (list.length > shown.length ? '<tr><td colspan="10" class="text-[12.5px] text-ink-3">Đang hiện ' + shown.length + ' / ' + list.length + ' mã. Gõ từ khóa để lọc.</td></tr>' : '') + mergedRows(10) + '</tbody>';
      count = list.length + ' trên ' + S.db.materials.length + ' mã vật tư. Số lần mua và tổng tự tính từ sổ chi phí.';
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

  root.querySelectorAll('input[name=dm-tab]').forEach((r) => r.addEventListener('change', () => { f.tab = r.value; saveFilter('cpDm'); draw(); }));
  bindMergeUI(root, () => TAB_LOAI[f.tab], (v) => { f.merged = v; saveFilter('cpDm'); draw(); }, { noun: 'mã', coGop: () => !!TAB_LOAI[f.tab], list: () => listOf(), endpoint: () => ({ nhom: '/api/cost-groups', 'hang-muc': '/api/cost-items', 'vat-tu': '/api/materials', nha: '/api/houses' }[f.tab]) });
  $('#dm-q', root).addEventListener('input', debounce((e) => { f.q = e.target.value; saveFilter('cpDm'); draw(); }, 120));

  const listOf = () => ({ nhom: S.db.costGroups, 'hang-muc': S.db.costItems, 'vat-tu': S.db.materials, nha: S.db.houses }[f.tab]);
  const openForm = (x) => ({ nhom: openGroupForm, 'hang-muc': openItemForm, 'vat-tu': openMaterialForm, nha: openHouseForm }[f.tab])(x);
  const endpoint = () => ({ nhom: '/api/cost-groups', 'hang-muc': '/api/cost-items', 'vat-tu': '/api/materials', nha: '/api/houses' }[f.tab]);

  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const tr = a.closest('tr[data-id]');
    const x = tr ? listOf().find((i) => i.id === Number(tr.dataset.id)) : null;
    const act = a.dataset.act;
    if (act === 'add') openForm(null);
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
