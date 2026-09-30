/* Trạng thái dùng chung của ứng dụng. */
import { LS, esc } from './ui.js';

const KT = window.KT;

export const S = {
  db: null,
  ledger: [],
  costLedger: [],
  _vouchers: null,
  savedAt: null,
  filters: {
    so: LS.get('filter.so', { period: 'tat-ca', from: '', to: '', duAn: '', ncc: '', loai: '', q: '' }),
    dash: LS.get('filter.dash', { period: 'tat-ca', from: '', to: '' }),
    thncc: LS.get('filter.thncc', { period: 'tat-ca', from: '', to: '', chiCoPhatSinh: true, sort: 'amount' }),
    phieu: LS.get('filter.phieu', { q: '', loai: '' }),
    // Chi phí công trình
    cpSo: LS.get('filter.cpSo', { period: 'tat-ca', from: '', to: '', ct: '', nha: '', nhom: '', hm: '', loai: '', ncc: '', vt: '', q: '' }),
    cpTh: LS.get('filter.cpTh', { period: 'tat-ca', from: '', to: '', ct: '', nha: '' }),
    cpCt: LS.get('filter.cpCt', { period: 'tat-ca', from: '', to: '', ct: '', nha: '', loai: '', ncc: '', level: 3 }),
    cpCn: LS.get('filter.cpCn', { ct: '', to: '', pham: 'ct', sort: 'conLai' }),
    cpGia: LS.get('filter.cpGia', { q: '', ncc: '', hm: '', vt: '' }),
    cpDm: LS.get('filter.cpDm', { tab: 'hang-muc', q: '' })
  },
  selectedVoucher: null,
  flash: new Set(),
  listeners: []
};

// Dòng vừa ghi / vừa sửa (so với dữ liệu trước) để tô sáng trong sổ một lúc; không đổi dữ liệu
let flashTimer = null;
function markChanged(prev, db) {
  S.flash = new Set();
  if (!prev) return;
  const sig = (x) => JSON.stringify(x);
  [['entries', 'entries'], ['costs', 'costs']].forEach(([k]) => {
    const old = new Map((prev[k] || []).map((x) => [x.id, sig(x)]));
    const changed = (db[k] || []).filter((x) => old.get(x.id) !== sig(x));
    // nhập Excel / khôi phục: quá nhiều dòng đổi → không tô
    if (changed.length && changed.length <= 50) changed.forEach((x) => S.flash.add(k + ':' + x.id));
  });
  clearTimeout(flashTimer);
  if (S.flash.size) flashTimer = setTimeout(() => { S.flash = new Set(); }, 2600);
}

export function setDb(db) {
  markChanged(S.db, db);
  S.db = db;
  S.ledger = KT.buildLedger(db);
  S.costLedger = KT.buildCostLedger(db);
  S._vouchers = null;
  S.savedAt = new Date();
  S.listeners.forEach((fn) => fn());
}

export function onChange(fn) { S.listeners.push(fn); }

export function vouchers() {
  if (!S._vouchers) S._vouchers = KT.buildVouchers(S.db, S.ledger);
  return S._vouchers;
}

export function saveFilter(name) { LS.set('filter.' + name, S.filters[name]); }

export function projectByCode(ma) { return KT.indexBy(S.db.projects).get(KT.keyOf(ma)); }
export function supplierByCode(ma) { return KT.indexBy(S.db.suppliers).get(KT.keyOf(ma)); }

export function projectOptions(selected, opts) {
  opts = opts || {};
  let html = '<option value="">' + esc(opts.allLabel || 'Tất cả dự án') + '</option>';
  if (opts.withNone) html += '<option value="__none__"' + (selected === '__none__' ? ' selected' : '') + '>(Chưa gán dự án)</option>';
  S.db.projects.forEach((p) => {
    html += '<option value="' + esc(p.ma) + '"' + (KT.keyOf(selected) === KT.keyOf(p.ma) ? ' selected' : '') + '>' + esc(p.ma + ' — ' + p.ten) + '</option>';
  });
  return html;
}

export function supplierOptions(selected, opts) {
  opts = opts || {};
  let html = '<option value="">' + esc(opts.allLabel || 'Tất cả NCC / đối tượng') + '</option>';
  if (opts.withNone) html += '<option value="__none__"' + (selected === '__none__' ? ' selected' : '') + '>(Chưa gán NCC)</option>';
  S.db.suppliers.slice().sort((a, b) => a.ten.localeCompare(b.ten, 'vi')).forEach((s) => {
    html += '<option value="' + esc(s.ma) + '"' + (KT.keyOf(selected) === KT.keyOf(s.ma) ? ' selected' : '') + '>' + esc(s.ten + ' (' + s.ma + ')') + '</option>';
  });
  return html;
}

export function datalists() {
  return '<datalist id="dl-projects">' + S.db.projects.map((p) => '<option value="' + esc(p.ma) + '">' + esc(p.ten) + '</option>').join('') + '</datalist>' +
    '<datalist id="dl-suppliers">' + S.db.suppliers.map((s) => '<option value="' + esc(s.ma) + '">' + esc(s.ten + (s.loai ? ' · ' + s.loai : '')) + '</option>').join('') + '</datalist>';
}

// Cho phép gõ tên thay vì mã: trả về mã khớp (không phân biệt hoa thường, dấu)
export function resolveCode(list, text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const byCode = list.find((x) => KT.keyOf(x.ma) === KT.keyOf(t));
  if (byCode) return byCode.ma;
  const n = KT.normalizeText(t);
  const byName = list.filter((x) => KT.normalizeText(x.ten) === n);
  if (byName.length === 1) return byName[0].ma;
  const m = /\(([^()]+)\)\s*$/.exec(t); // "Tên (MÃ)"
  if (m) {
    const c = list.find((x) => KT.keyOf(x.ma) === KT.keyOf(m[1]));
    if (c) return c.ma;
  }
  return t;
}

/* ---------------- Chi phí công trình ---------------- */

export function itemByCode(ma) { return KT.indexBy(S.db.costItems).get(KT.keyOf(ma)); }
export function materialByCode(ma) { return KT.indexBy(S.db.materials).get(KT.keyOf(ma)); }
export function houseByCode(ma) { return KT.indexBy(S.db.houses).get(KT.keyOf(ma)); }
export function groupByCode(ma) { return KT.indexBy(S.db.costGroups).get(KT.keyOf(ma)); }

// Gõ tên hoặc mã hạng mục -> mã hạng mục ('' nếu không thấy)
export function resolveItem(text) {
  const it = KT.findCostItem(S.db, text);
  return it ? it.ma : '';
}

export function groupName(maNhom) {
  const g = groupByCode(maNhom);
  return g ? g.ten : '';
}

// Datalist cho biểu mẫu chi phí: công trình, NCC (dùng lại danh mục thu chi), hạng mục (theo tên), vật tư, nhà
export function costDatalists(ct) {
  const items = S.db.costItems.map((it) => '<option value="' + esc(it.ten) + '">' + esc(groupName(it.maNhom) || 'Chưa có nhóm') + '</option>').join('');
  return datalists() +
    '<datalist id="dl-hm">' + items + '</datalist>' +
    '<datalist id="dl-vt">' + S.db.materials.map((m) => '<option value="' + esc(m.ma) + '">' + esc(m.ten + (m.dvt ? ' · ' + m.dvt : '')) + '</option>').join('') + '</datalist>' +
    '<datalist id="dl-nha">' + houseListOptions(ct) + '</datalist>';
}

export function houseListOptions(ct) {
  return S.db.houses.filter((h) => !ct || KT.keyOf(h.maCT) === KT.keyOf(ct))
    .map((h) => '<option value="' + esc(h.ma) + '">' + esc(h.ten + (h.chung ? ' (dùng chung)' : '') + (ct ? '' : ' · ' + h.maCT)) + '</option>').join('');
}

export function selectOptions(list, selected, opts) {
  opts = opts || {};
  let html = '<option value="">' + esc(opts.allLabel || 'Tất cả') + '</option>';
  if (opts.withNone) html += '<option value="__none__"' + (selected === '__none__' ? ' selected' : '') + '>' + esc(opts.noneLabel || '(Chưa gán)') + '</option>';
  list.forEach((x) => {
    const v = opts.value ? opts.value(x) : x.ma;
    html += '<option value="' + esc(v) + '"' + (KT.keyOf(selected) === KT.keyOf(v) && selected !== '' ? ' selected' : '') + '>' + esc(opts.label ? opts.label(x) : x.ma + ' — ' + x.ten) + '</option>';
  });
  return html;
}

// Công trình = dự án có dùng trong chi phí / nhà (lên đầu), sau đó các dự án còn lại
export function costProjects() {
  const used = new Set();
  S.db.costs.forEach((c) => used.add(KT.keyOf(c.maCT)));
  S.db.houses.forEach((h) => used.add(KT.keyOf(h.maCT)));
  const a = S.db.projects.filter((p) => used.has(KT.keyOf(p.ma)));
  const b = S.db.projects.filter((p) => !used.has(KT.keyOf(p.ma)));
  return a.concat(b);
}

export function ctOptions(selected, allLabel) {
  return selectOptions(costProjects(), selected, { allLabel: allLabel || 'Tất cả công trình' });
}
