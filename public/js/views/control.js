/* Kiểm soát sổ sách: nhật ký thay đổi, thùng rác (và các thẻ khác của nhóm "độ chính xác và truy vết"). */
import { $, esc, money, icon, api, toast, showError, confirmDialog, openModal, freshRoot, debounce, dateField, LS, fieldError } from '../ui.js';
import { S, anomalies, saveFilter } from '../state.js';
import { openEntryForm } from '../forms.js';
import { openCostLineForm } from './cost-ledger.js';
import { openMaterialForm } from './cost-catalogs.js';

const KT = window.KT;

// Các thẻ; tính năng sau đăng ký thêm qua registerTab (giữ thứ tự hiển thị theo order)
const TABS = [];
export function registerTab(t) { TABS.push(t); TABS.sort((a, b) => a.order - b.order); }

function tabOf() {
  const m = /[?&]tab=([\w-]+)/.exec(location.hash);
  const k = m ? m[1] : LS.get('ks.tab', '');
  return TABS.find((t) => t.key === k) ? k : TABS[0].key;
}

export function renderControl(root) {
  root = freshRoot(root);
  const tab = tabOf();
  LS.set('ks.tab', tab);
  root.innerHTML =
    '<div class="no-print flex flex-wrap items-center gap-2" role="tablist" aria-label="Kiểm soát sổ sách">' +
    TABS.map((t) => '<a href="#/kiem-soat?tab=' + t.key + '" role="tab" aria-selected="' + (t.key === tab) + '" class="btn ' + (t.key === tab ? 'btn-primary' : 'btn-secondary') + '">' +
      icon(t.icon) + esc(t.label) + (t.badge ? t.badge() : '') + '</a>').join('') +
    '</div><div id="ks-body" class="flex flex-col gap-5"></div>';
  TABS.find((t) => t.key === tab).render($('#ks-body', root));
}

/* ============================== NHẬT KÝ THAY ĐỔI ============================== */

const FIELD = {
  ngay: 'Ngày', soPhieu: 'Số phiếu', maDuAn: 'Dự án', maNCC: 'Nhà cung cấp', noiDung: 'Nội dung', thu: 'Thu', chi: 'Chi', nguoiNhan: 'Người nhận',
  ghiChu: 'Ghi chú', maCT: 'Công trình', maNha: 'Nhà', maHM: 'Hạng mục', loaiCP: 'Loại CP', maVT: 'Vật tư', dienGiai: 'Diễn giải', soLuong: 'Số lượng',
  donGia: 'Đơn giá', thanhTien: 'Thành tiền', ma: 'Mã', ten: 'Tên', trangThai: 'Trạng thái', nganSach: 'Ngân sách', loai: 'Loại', sdt: 'Điện thoại',
  diaChi: 'Địa chỉ', maNhom: 'Nhóm', dvt: 'ĐVT', chuNha: 'Chủ nhà', dienTich: 'Diện tích', chung: 'Dùng chung', ngayKhoiCong: 'Ngày khởi công',
  tenDonVi: 'Tên đơn vị', giamDoc: 'Giám đốc', keToanTruong: 'Kế toán trưởng', thuQuy: 'Thủ quỹ', nguoiLap: 'Người lập', hinhThucMacDinh: 'Hình thức',
  hienKeToanTruong: 'In chỗ ký KTT', lyDo: 'Lý do', hinhThuc: 'Hình thức', kemTheo: 'Kèm theo', phieuId: 'Phiếu nhập'
};
const SKIP = new Set(['createdAt', 'updatedAt', 'seq', 'id', 'nguon']);
const MONEYISH = new Set(['thu', 'chi', 'donGia', 'thanhTien', 'nganSach']);

function val(k, v) {
  if (v === undefined || v === null || v === '') return '<span class="text-ink-3">(trống)</span>';
  if (typeof v === 'boolean') return v ? 'Có' : 'Không';
  if (MONEYISH.has(k) && typeof v === 'number') return money(v);
  if (k === 'soLuong' && typeof v === 'number') return esc(KT.fmtQty(v));
  if ((k === 'ngay' || k === 'ngayKhoiCong') && KT.isISODate(v)) return esc(KT.fmtDate(v));
  return esc(typeof v === 'object' ? JSON.stringify(v) : String(v));
}

// So sánh trước / sau: liệt kê các trường đổi
function diffHtml(e) {
  const b = e.before;
  const a = e.after;
  if (Array.isArray(b) || Array.isArray(a)) {
    const line = (x) => esc(KT.fmtDate(x.ngay) + ' · ' + (x.maVT || x.dienGiai || x.noiDung || '') + ' · ' + (x.soLuong != null ? KT.fmtQty(x.soLuong) + ' × ' + KT.fmtMoney(x.donGia) + ' = ' : '') +
      KT.fmtMoney(x.thanhTien != null ? x.thanhTien : (x.thu || x.chi || 0)));
    const col = (title, list) => list && list.length ? '<div><div class="font-semibold text-ink-2">' + title + ' (' + list.length + ' dòng)</div><ul class="mt-1 list-disc pl-5">' +
      list.slice(0, 50).map((x) => '<li>' + line(x) + '</li>').join('') + (list.length > 50 ? '<li>…</li>' : '') + '</ul></div>' : '';
    return '<div class="grid gap-3 md:grid-cols-2">' + col('Trước', b) + col('Sau', a) + '</div>';
  }
  if (b && a && typeof b === 'object' && typeof a === 'object') {
    const keys = Array.from(new Set(Object.keys(b).concat(Object.keys(a)))).filter((k) => !SKIP.has(k) && JSON.stringify(b[k]) !== JSON.stringify(a[k]));
    if (!keys.length) return '<p class="text-ink-3">Không có trường nào thay đổi.</p>';
    return '<table class="ledger ledger-compact w-auto"><thead><tr><th>Trường</th><th>Trước</th><th>Sau</th></tr></thead><tbody>' +
      keys.map((k) => '<tr><td class="font-medium">' + esc(FIELD[k] || k) + '</td><td class="text-alert line-through decoration-alert/40">' + val(k, b[k]) + '</td><td class="text-income">' + val(k, a[k]) + '</td></tr>').join('') +
      '</tbody></table>';
  }
  const one = a || b;
  if (one && typeof one === 'object') {
    return '<table class="ledger ledger-compact w-auto"><tbody>' + Object.keys(one).filter((k) => !SKIP.has(k) && one[k] !== '' && one[k] != null)
      .map((k) => '<tr><td class="font-medium">' + esc(FIELD[k] || k) + '</td><td>' + val(k, one[k]) + '</td></tr>').join('') + '</tbody></table>';
  }
  return '';
}

function fmtTime(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

const ACTION_CHIP = { them: 'chip-ok', sua: 'chip-near', xoa: 'chip-over', 'xoa-vinh-vien': 'chip-over', 'khoi-phuc': 'chip-ok', 'xoa-toan-bo': 'chip-over', 'khoi-phuc-sao-luu': 'chip-near', 'mo-khoa': 'chip-near', 'khoa-so': 'chip-ok' };

const auditState = { from: '', to: '', action: '', kind: '', q: '', recId: '' };

function renderAudit(el) {
  const f = auditState;
  let meta = { actions: {}, kinds: {} };
  let shown = 200;
  el.innerHTML =
    '<div class="no-print flex flex-wrap items-center gap-2">' +
    dateField({ id: 'nk-from', value: f.from, label: 'Từ ngày' }) + '<span class="text-ink-3" aria-hidden="true">đến</span>' + dateField({ id: 'nk-to', value: f.to, label: 'Đến ngày' }) +
    '<select id="nk-action" class="input w-auto" aria-label="Loại thao tác"><option value="">Mọi thao tác</option></select>' +
    '<select id="nk-kind" class="input w-auto" aria-label="Loại dữ liệu"><option value="">Mọi loại dữ liệu</option></select>' +
    '<label class="search min-w-[220px] flex-1">' + icon('search') + '<input id="nk-q" type="search" class="input" placeholder="Tìm nội dung, mã, số tiền, người thao tác" value="' + esc(f.q) + '" aria-label="Tìm trong nhật ký"></label>' +
    '<input id="nk-rec" class="input w-[130px]" inputmode="numeric" placeholder="Số bản ghi" value="' + esc(f.recId) + '" aria-label="Lọc theo số bản ghi">' +
    '<button type="button" class="btn btn-ghost btn-sm" data-act="clear">' + icon('eraser') + 'Bỏ lọc</button></div>' +
    '<section class="sheet overflow-hidden"><p class="border-b border-rule px-4 py-2.5 text-[13px] text-ink-2" id="nk-count" aria-live="polite">Đang tải…</p>' +
    '<div class="table-scroll max-h-[calc(100vh-260px)] overflow-auto"><table class="ledger"><thead><tr><th>Thời điểm</th><th>Người thao tác</th><th>Thao tác</th><th>Loại dữ liệu</th><th>Nội dung</th><th class="num">Số bản ghi</th></tr></thead>' +
    '<tbody id="nk-body"></tbody></table></div></section>';

  const load = async () => {
    const qs = new URLSearchParams();
    Object.keys(f).forEach((k) => { if (f[k]) qs.set(k, f[k]); });
    qs.set('limit', String(shown));
    try {
      const r = await api('GET', '/api/audit?' + qs.toString());
      meta = r;
      const selA = $('#nk-action', el);
      if (selA.options.length === 1) {
        selA.innerHTML += Object.entries(r.actions).map(([k, l]) => '<option value="' + k + '"' + (f.action === k ? ' selected' : '') + '>' + esc(l) + '</option>').join('');
        $('#nk-kind', el).innerHTML += Object.entries(r.kinds).map(([k, l]) => '<option value="' + k + '"' + (f.kind === k ? ' selected' : '') + '>' + esc(l) + '</option>').join('');
      }
      $('#nk-count', el).innerHTML = '<b class="font-semibold text-ink">' + r.total + '</b> mục nhật ký' + (r.total > r.items.length ? ', đang hiện ' + r.items.length + ' mục mới nhất' : '') +
        '. Bấm một dòng để xem trước / sau; bấm số bản ghi để xem toàn bộ lịch sử của bản ghi đó.' + (r.bad ? ' <span class="text-caution">(' + r.bad + ' dòng nhật ký hỏng đã bỏ qua)</span>' : '');
      $('#nk-body', el).innerHTML = r.items.length ? r.items.map((e) =>
        '<tr class="clickable" data-id="' + e.id + '" tabindex="0"><td class="whitespace-nowrap tabular-nums">' + fmtTime(e.at) + '</td>' +
        '<td>' + (e.by ? esc(e.by) : '<span class="text-ink-3">(không rõ)</span>') + '</td>' +
        '<td><span class="chip ' + (ACTION_CHIP[e.action] || 'chip-idle') + '">' + esc(r.actions[e.action] || e.action) + '</span></td>' +
        '<td class="whitespace-nowrap text-ink-2">' + esc(r.kinds[e.kind] || e.kind || '') + '</td>' +
        '<td class="wrap-text">' + esc(e.label || '') + (e.note ? '<div class="text-[12.5px] text-ink-3">' + esc(e.note) + '</div>' : '') + '</td>' +
        '<td class="num">' + (e.recId !== '' && e.recId != null ? '<a href="#" class="font-semibold text-pen hover:underline" data-rec="' + esc(e.recId) + '">' + esc(e.recId) + '</a>' : '') + '</td></tr>' +
        '<tr class="nk-detail" data-for="' + e.id + '" hidden><td colspan="6" class="bg-[#FAFBF8] text-[13px]">' + diffHtml(e) + '</td></tr>').join('') +
        (r.total > r.items.length ? '<tr><td colspan="6"><button type="button" class="btn btn-ghost btn-sm" data-act="more">Hiện thêm 200 mục cũ hơn</button></td></tr>' : '')
        : '<tr><td colspan="6" class="empty">Không có mục nhật ký nào khớp bộ lọc.</td></tr>';
    } catch (err) { $('#nk-count', el).textContent = err.message; }
  };
  const reload = () => { shown = 200; load(); };

  ['from', 'to'].forEach((k) => $('#nk-' + k, el).addEventListener('change', (e) => { f[k] = e.target.value; reload(); }));
  $('#nk-action', el).addEventListener('change', (e) => { f.action = e.target.value; reload(); });
  $('#nk-kind', el).addEventListener('change', (e) => { f.kind = e.target.value; reload(); });
  $('#nk-q', el).addEventListener('input', debounce((e) => { f.q = e.target.value; reload(); }, 250));
  $('#nk-rec', el).addEventListener('input', debounce((e) => { f.recId = e.target.value.trim(); reload(); }, 300));
  el.addEventListener('click', (e) => {
    const rec = e.target.closest('[data-rec]');
    if (rec) { e.preventDefault(); f.recId = rec.dataset.rec; $('#nk-rec', el).value = f.recId; reload(); return; }
    const a = e.target.closest('[data-act]');
    if (a && a.dataset.act === 'more') { shown += 200; load(); return; }
    if (a && a.dataset.act === 'clear') { Object.keys(f).forEach((k) => { f[k] = ''; }); renderAudit(el); return; }
    const tr = e.target.closest('tr[data-id]');
    if (tr) { const d = el.querySelector('tr[data-for="' + tr.dataset.id + '"]'); if (d) d.hidden = !d.hidden; }
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr[data-id]')) e.target.click(); });
  load();
  return meta;
}

// Mở nhật ký lọc sẵn theo một bản ghi (dùng từ các màn hình khác: "Lịch sử")
export function openHistory(recId) {
  Object.keys(auditState).forEach((k) => { auditState[k] = ''; });
  auditState.recId = String(recId);
  location.hash = '#/kiem-soat?tab=nhat-ky';
}

/* ============================== THÙNG RÁC ============================== */

function renderTrash(el) {
  el.innerHTML = '<section class="sheet overflow-hidden"><div class="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-2.5">' +
    '<p class="flex-1 text-[13px] text-ink-2" id="tr-count">Đang tải…</p>' +
    '<button type="button" class="btn btn-danger-ghost btn-sm" data-act="purge-all">' + icon('trash') + 'Xóa vĩnh viễn tất cả</button></div>' +
    '<div class="table-scroll max-h-[calc(100vh-240px)] overflow-auto"><table class="ledger"><thead><tr><th>Thời điểm xóa</th><th>Người xóa</th><th>Loại dữ liệu</th><th>Nội dung</th><th class="num">Số bản ghi</th><th class="no-print"><span class="sr-only">Thao tác</span></th></tr></thead>' +
    '<tbody id="tr-body"></tbody></table></div></section>';
  let items = [];
  const load = async () => {
    try {
      items = (await api('GET', '/api/trash')).items;
      $('#tr-count', el).innerHTML = items.length ? '<b class="font-semibold text-ink">' + items.length + '</b> mục trong thùng rác. Bản ghi đã xóa không được tính vào sổ, báo cáo, công nợ. Khôi phục là đưa về nguyên như cũ.'
        : 'Thùng rác trống.';
      $('#tr-body', el).innerHTML = items.length ? items.map((t) =>
        '<tr data-id="' + t.id + '"><td class="whitespace-nowrap tabular-nums">' + fmtTime(t.at) + '</td><td>' + (t.by ? esc(t.by) : '<span class="text-ink-3">(không rõ)</span>') + '</td>' +
        '<td class="whitespace-nowrap">' + esc(t.kindLabel) + '</td><td class="wrap-text">' + esc(t.label) + '</td><td class="num">' + t.count + '</td>' +
        '<td class="actions no-print"><button type="button" class="btn btn-secondary btn-sm" data-act="restore">' + icon('refresh') + 'Khôi phục</button>' +
        '<button type="button" class="icon-btn danger" data-act="purge" title="Xóa vĩnh viễn" aria-label="Xóa vĩnh viễn mục ' + t.id + '">' + icon('trash') + '</button></td></tr>').join('')
        : '<tr><td colspan="6" class="empty">Không có gì trong thùng rác.</td></tr>';
      el.querySelector('[data-act=purge-all]').hidden = !items.length;
    } catch (err) { $('#tr-count', el).textContent = err.message; }
  };
  el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const tr = a.closest('tr[data-id]');
    const t = tr ? items.find((x) => x.id === Number(tr.dataset.id)) : null;
    if (a.dataset.act === 'restore' && t) {
      try { await api('POST', '/api/trash/' + t.id + '/restore'); toast('Đã khôi phục: ' + t.label); load(); } catch (err) { showError(err); }
    } else if (a.dataset.act === 'purge' && t) {
      if (!(await confirmDialog({ title: 'Xóa vĩnh viễn', html: 'Xóa vĩnh viễn <b class="text-ink">' + esc(t.label) + '</b>?<p class="mt-2 text-[13px] text-ink-3">Không khôi phục từ thùng rác được nữa (nhật ký vẫn giữ nội dung đã xóa; bản sao lưu cũ vẫn còn).</p>', okText: 'Xóa vĩnh viễn', danger: true }))) return;
      try { await api('DELETE', '/api/trash/' + t.id); toast('Đã xóa vĩnh viễn'); load(); } catch (err) { showError(err); }
    } else if (a.dataset.act === 'purge-all') {
      const m = openModal({
        title: 'Xóa vĩnh viễn toàn bộ thùng rác', size: 'small',
        body: '<p class="text-ink-2">Xóa vĩnh viễn <b class="text-ink">' + items.length + '</b> mục trong thùng rác. Gõ <b class="text-ink">XOA</b> để xác nhận.</p><label class="field mt-3"><span class="label">Xác nhận</span><input class="input" id="pa-confirm" autocomplete="off"></label>',
        footer: '<span class="flex-1"></span><button type="button" class="btn btn-ghost" data-act="no" autofocus>Hủy</button><button type="button" class="btn btn-danger" data-act="yes" disabled>' + icon('trash') + 'Xóa vĩnh viễn</button>'
      });
      const yes = m.el.querySelector('[data-act=yes]');
      m.el.querySelector('#pa-confirm').addEventListener('input', (ev) => { yes.disabled = ev.target.value.trim().toUpperCase() !== 'XOA'; });
      m.el.querySelector('[data-act=no]').addEventListener('click', () => m.close());
      yes.addEventListener('click', async () => {
        try { await api('POST', '/api/trash/purge-all', { confirm: 'XOA' }); toast('Đã dọn sạch thùng rác'); m.close(); load(); } catch (err) { showError(err); }
      });
    }
  });
  load();
}

/* ============================== CẦN XỬ LÝ ============================== */

const ANOM_ICON = { trung: 'copy', gia: 'tag', ngay: 'calendar', vt: 'package', thieu: 'warnTri', nhap: 'draft', tien: 'coins', quy: 'money' };
const cxl = { loai: '', showIgnored: false, more: {} };

// Mở đúng chỗ để sửa bản ghi của cảnh báo
export function openTarget(t) {
  if (t.kind === 'entries') {
    const e = S.all.entries.find((x) => x.id === t.id);
    if (e) openEntryForm(e); else toast('Không còn thấy dòng này (có thể đã xóa)', 'info');
  } else if (t.kind === 'costs') {
    const c = S.all.costs.find((x) => x.id === t.id);
    if (c) openCostLineForm(c); else toast('Không còn thấy dòng này (có thể đã xóa)', 'info');
  } else if (t.kind === 'slip') {
    location.hash = '#/cp-nhap?phieu=' + t.phieuId;
  } else if (t.kind === 'materials') {
    const m = S.all.materials.find((x) => KT.keyOf(x.ma) === KT.keyOf(t.ma));
    if (m) openMaterialForm(m);
  } else if (t.kind === 'cashCounts') {
    location.hash = '#/kiem-soat?tab=kiem-quy';
  }
}

// Xem các dòng nghi trùng trong sổ (lọc đúng ngày)
function showInLedger(it) {
  const t = it.target;
  if (t.kind === 'entries') {
    Object.assign(S.filters.so, { period: 'tuy-chon', from: it.ngay, to: it.ngay, duAn: '', ncc: '', loai: '', q: '', trangThai: '' });
    saveFilter('so');
    location.hash = '#/so-thu-chi';
  } else {
    const c = S.all.costs.find((x) => x.id === t.id) || {};
    Object.assign(S.filters.cpSo, { period: 'tuy-chon', from: it.ngay, to: it.ngay, ct: '', nha: '', nhom: '', hm: '', loai: '', ncc: c.maNCC || '', vt: c.maVT || '', q: '', trangThai: '' });
    saveFilter('cpSo');
    location.hash = '#/cp-so';
  }
}

function renderIssues(el) {
  const a = anomalies();
  const st = Object.assign({}, KT.ANOMALY_DEFAULTS, S.all.settings);
  const nIgnored = a.items.filter((x) => x.ignored).length;
  const list = a.items.filter((x) => (cxl.showIgnored || !x.ignored) && (!cxl.loai || x.loai === cxl.loai));
  const byType = new Map();
  list.forEach((x) => { if (!byType.has(x.loai)) byType.set(x.loai, []); byType.get(x.loai).push(x); });
  const chip = (k, label, n) => '<button type="button" class="btn btn-sm ' + (cxl.loai === k ? 'btn-primary' : 'btn-secondary') + '" data-loai="' + k + '">' + esc(label) +
    ' <span class="tabular-nums opacity-80">' + n + '</span></button>';
  el.innerHTML =
    '<section class="sheet"><div class="sheet-head"><div><h2 class="sheet-title">' + (a.open ? a.open + ' việc cần xử lý' : 'Không có việc gì cần xử lý') + '</h2>' +
    '<p class="sheet-note">Phần mềm tự rà soát các dấu hiệu sai sót thường gặp. Bấm “Mở để sửa” để tới đúng dòng. Trường hợp đúng thật (ví dụ hai khoản giống nhau hợp lệ) thì bấm “Bỏ qua” — có lưu nhật ký, không hỏi lại nữa.</p></div>' +
    '<form id="cxl-nguong" class="flex flex-wrap items-end gap-2 text-[13px]" autocomplete="off">' +
    '<label class="field w-[150px]"><span class="label">Giá lệch quá (%)</span><input name="nguongLechGia" class="input input-sm text-right" inputmode="numeric" value="' + esc(st.nguongLechGia) + '"></label>' +
    '<label class="field w-[150px]"><span class="label">Nháp để quá (ngày)</span><input name="soNgayNhapTon" class="input input-sm text-right" inputmode="numeric" value="' + esc(st.soNgayNhapTon) + '"></label>' +
    '<button type="submit" class="btn btn-secondary btn-sm">' + icon('save') + 'Lưu ngưỡng</button></form></div>' +
    '<div class="flex flex-wrap items-center gap-2 px-5 pb-4">' + chip('', 'Tất cả', cxl.showIgnored ? a.items.length : a.open) +
    Object.keys(KT.ANOMALY_TYPES).filter((k) => a.counts[k] || (cxl.showIgnored && a.items.some((x) => x.loai === k))).map((k) => chip(k, KT.ANOMALY_TYPES[k], cxl.showIgnored ? a.items.filter((x) => x.loai === k).length : a.counts[k])).join('') +
    '<span class="flex-1"></span>' + (nIgnored ? '<label class="check"><input type="checkbox" id="cxl-ign"' + (cxl.showIgnored ? ' checked' : '') + '>Hiện cả ' + nIgnored + ' cảnh báo đã bỏ qua</label>' : '') + '</div></section>' +
    (list.length ? Array.from(byType.entries()).map(([k, items]) => {
      const lim = cxl.more[k] ? items.length : 30;
      return '<section class="sheet overflow-hidden" aria-labelledby="cxl-h-' + k + '"><div class="flex items-center gap-2 border-b border-rule px-4 py-2.5">' +
        '<span class="text-[18px] text-caution">' + icon(ANOM_ICON[k] || 'flag') + '</span><h3 id="cxl-h-' + k + '" class="sheet-title">' + esc(KT.ANOMALY_TYPES[k]) + '</h3>' +
        '<span class="pill">' + items.length + '</span></div><ul class="divide-y divide-rule">' +
        items.slice(0, lim).map((it) => '<li class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5' + (it.ignored ? ' opacity-60' : '') + '" data-key="' + esc(it.key) + '">' +
          '<div class="min-w-[260px] flex-1"><div class="font-medium text-ink">' + esc(it.tieuDe) + (it.ignored ? ' <span class="chip chip-idle">đã bỏ qua</span>' : '') + '</div>' +
          '<div class="text-[12.5px] text-ink-2">' + esc(it.chiTiet) + '</div></div>' +
          (it.soTien ? '<div class="text-right font-semibold tabular-nums' + (it.soTien < 0 ? ' neg' : '') + '">' + money(it.soTien) + '</div>' : '') +
          '<div class="flex gap-1.5">' + (k === 'trung' ? '<button type="button" class="btn btn-ghost btn-sm" data-act="xem">' + icon('eye') + 'Xem trong sổ</button>' : '') +
          '<button type="button" class="btn btn-secondary btn-sm" data-act="mo">' + icon('edit') + 'Mở để sửa</button>' +
          (it.ignored ? '<button type="button" class="btn btn-ghost btn-sm" data-act="theo-doi">' + icon('refresh') + 'Theo dõi lại</button>'
            : '<button type="button" class="btn btn-ghost btn-sm" data-act="bo-qua">' + icon('eyeSlash') + 'Bỏ qua</button>') + '</div></li>').join('') +
        (items.length > lim ? '<li class="px-4 py-2"><button type="button" class="btn btn-ghost btn-sm" data-more="' + k + '">Hiện thêm ' + (items.length - lim) + ' mục</button></li>' : '') +
        '</ul></section>';
    }).join('') : '<section class="sheet p-10 text-center text-ink-3">' + icon('checkCircle', 'text-[28px] text-income') + '<p class="mt-2">Không có cảnh báo nào' + (cxl.loai ? ' loại này' : '') + '.</p></section>');

  const find = (li) => a.items.find((x) => x.key === li.dataset.key);
  el.addEventListener('click', async (e) => {
    const lo = e.target.closest('[data-loai]');
    if (lo) { cxl.loai = lo.dataset.loai; renderIssues(freshEl(el)); return; }
    const mo = e.target.closest('[data-more]');
    if (mo) { cxl.more[mo.dataset.more] = true; renderIssues(freshEl(el)); return; }
    const b = e.target.closest('[data-act]');
    const li = b && b.closest('li[data-key]');
    const it = li && find(li);
    if (!it) return;
    if (b.dataset.act === 'mo') openTarget(it.target);
    else if (b.dataset.act === 'xem') showInLedger(it);
    else if (b.dataset.act === 'bo-qua') {
      const m = openModal({
        title: 'Bỏ qua cảnh báo', size: 'small',
        body: '<p class="text-ink-2">' + esc(it.tieuDe) + '</p><p class="mt-1 text-[13px] text-ink-3">' + esc(it.chiTiet) + '</p>' +
          '<label class="field mt-3"><span class="label">Ghi chú (không bắt buộc)</span><input class="input" id="bq-note" placeholder="VD: hai chuyến xe khác nhau, đúng"></label>',
        footer: '<span class="flex-1"></span><button type="button" class="btn btn-ghost" data-act="no">Hủy</button><button type="button" class="btn btn-primary" data-act="yes">' + icon('eyeSlash') + 'Bỏ qua cảnh báo</button>'
      });
      m.el.querySelector('[data-act=no]').addEventListener('click', () => m.close());
      m.el.querySelector('[data-act=yes]').addEventListener('click', async () => {
        try { await api('POST', '/api/warnings/ignore', { key: it.key, label: it.tieuDe, note: m.el.querySelector('#bq-note').value }); toast('Đã bỏ qua cảnh báo (có ghi nhật ký)'); m.close(); } catch (err) { showError(err); }
      });
    } else if (b.dataset.act === 'theo-doi') {
      try { await api('POST', '/api/warnings/unignore', { key: it.key }); toast('Đã theo dõi lại cảnh báo'); } catch (err) { showError(err); }
    }
  });
  const ign = $('#cxl-ign', el);
  if (ign) ign.addEventListener('change', () => { cxl.showIgnored = ign.checked; renderIssues(freshEl(el)); });
  $('#cxl-nguong', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fm = e.target;
    const data = { nguongLechGia: Number(fm.elements.nguongLechGia.value), soNgayNhapTon: Number(fm.elements.soNgayNhapTon.value) };
    if (!Number.isInteger(data.nguongLechGia) || data.nguongLechGia < 1 || data.nguongLechGia > 1000) return fieldError(fm.elements.nguongLechGia, 'Nhập số từ 1 đến 1000');
    if (!Number.isInteger(data.soNgayNhapTon) || data.soNgayNhapTon < 1 || data.soNgayNhapTon > 365) return fieldError(fm.elements.soNgayNhapTon, 'Nhập số từ 1 đến 365');
    try { await api('PUT', '/api/settings', data); toast('Đã lưu ngưỡng kiểm tra'); } catch (err) { showError(err); }
  });
}

// thay phần tử bằng bản sao rỗng (bỏ sự kiện cũ) trước khi vẽ lại một thẻ
function freshEl(el) { const n = el.cloneNode(false); el.replaceWith(n); return n; }

registerTab({ key: 'can-xu-ly', order: 10, label: 'Cần xử lý', icon: 'flag', render: renderIssues,
  badge: () => { const n = anomalies().open; return n ? '<span class="ml-1 rounded-full bg-[#FFD27A] px-1.5 text-[11.5px] font-bold text-[#3D2600] tabular-nums">' + n + '</span>' : ''; } });

/* ============================== KHÓA SỔ ============================== */

function monthRows() {
  const m = new Map();
  const get = (t) => { if (!m.has(t)) m.set(t, { thang: t, nE: 0, thu: 0, chi: 0, nC: 0, cp: 0, nhap: 0 }); return m.get(t); };
  S.all.entries.forEach((e) => { const r = get(KT.monthOf(e.ngay)); if (KT.isDraft(e)) { r.nhap++; return; } r.nE++; r.thu += e.thu || 0; r.chi += e.chi || 0; });
  S.all.costs.forEach((c) => { const r = get(KT.monthOf(c.ngay)); if (KT.isDraft(c)) { r.nhap++; return; } r.nC++; r.cp += c.thanhTien || 0; });
  (S.all.locks || []).forEach((l) => get(l.thang));
  get(KT.monthOf(KT.todayISO()));
  return Array.from(m.values()).filter((r) => /^\d{4}-\d{2}$/.test(r.thang)).sort((a, b) => (a.thang < b.thang ? 1 : -1));
}

function renderLocks(el) {
  const locks = new Map((S.all.locks || []).map((l) => [l.thang, l]));
  const rows = monthRows();
  const open = rows.filter((r) => !locks.has(r.thang) && (r.nE || r.nC));
  // mặc định đề xuất khóa đến tháng trước (tháng hiện tại thường còn phát sinh)
  const cur = KT.monthOf(KT.todayISO());
  const defTo = (open.find((r) => r.thang < cur) || open[0] || {}).thang;
  el.innerHTML =
    '<section class="sheet"><div class="sheet-head"><div><h2 class="sheet-title">Khóa sổ theo tháng</h2>' +
    '<p class="sheet-note">Tháng đã khóa thì không thêm, sửa, xóa, khôi phục dòng nào trong tháng đó (kể cả nhập Excel). Làm khi đã đối chiếu xong số liệu tháng. ' +
    'Cần sửa thì mở khóa (phải ghi lý do, có lưu nhật ký) rồi khóa lại.</p></div>' +
    (open.length ? '<div class="flex flex-wrap items-center gap-2"><label class="label" for="lk-den">Khóa sổ đến hết tháng</label>' +
      '<select id="lk-den" class="input w-auto">' + open.map((r) => '<option value="' + r.thang + '"' + (r.thang === defTo ? ' selected' : '') + '>' + KT.monthLabel(r.thang) + '</option>').join('') + '</select>' +
      '<button type="button" class="btn btn-primary" data-act="lock-to">' + icon('lock') + 'Khóa sổ</button></div>' : '') + '</div>' +
    '<div class="table-scroll overflow-auto"><table class="ledger"><thead><tr><th>Tháng</th><th class="num">Dòng sổ thu chi</th><th class="num money">Thu</th><th class="num money">Chi</th>' +
    '<th class="num">Dòng chi phí</th><th class="num money">Chi phí</th><th class="num">Nháp</th><th>Trạng thái</th><th class="no-print"><span class="sr-only">Thao tác</span></th></tr></thead><tbody>' +
    rows.map((r) => {
      const l = locks.get(r.thang);
      return '<tr data-thang="' + r.thang + '"><td class="font-semibold">' + KT.monthLabel(r.thang) + '</td>' +
        '<td class="num">' + (r.nE || '') + '</td><td class="num money thu">' + (r.thu ? money(r.thu) : '') + '</td><td class="num money">' + (r.chi ? money(r.chi) : '') + '</td>' +
        '<td class="num">' + (r.nC || '') + '</td><td class="num money">' + (r.cp ? money(r.cp) : '') + '</td>' +
        '<td class="num">' + (r.nhap ? '<span class="chip chip-draft">' + r.nhap + '</span>' : '') + '</td>' +
        '<td>' + (l ? '<span class="chip chip-ok">' + icon('lock') + 'Đã khóa</span><div class="text-[12px] text-ink-3">' + esc(fmtTime(l.at)) + (l.by ? ' · ' + esc(l.by) : '') + '</div>'
          : '<span class="chip chip-idle">' + icon('unlock') + 'Đang mở</span>') + '</td>' +
        '<td class="actions no-print">' + (l ? '<button type="button" class="btn btn-secondary btn-sm" data-act="unlock">' + icon('unlock') + 'Mở khóa</button>'
          : '<button type="button" class="btn btn-ghost btn-sm" data-act="lock"' + (r.nhap ? ' disabled title="Còn dòng nháp chưa ghi sổ"' : '') + '>' + icon('lock') + 'Khóa</button>') + '</td></tr>';
    }).join('') + '</tbody></table></div></section>';

  const doLock = async (months) => {
    const n = months.length;
    const ok = await confirmDialog({
      title: 'Khóa sổ', okText: 'Khóa sổ ' + (n > 1 ? n + ' tháng' : 'tháng ' + KT.monthLabel(months[0])),
      html: 'Khóa sổ ' + (n > 1 ? '<b class="text-ink">' + n + ' tháng</b> (' + months.map(KT.monthLabel).join(', ') + ')' : 'tháng <b class="text-ink">' + KT.monthLabel(months[0]) + '</b>') +
        '?<p class="mt-2 text-[13px] text-ink-3">Sau khi khóa, không thêm, sửa, xóa dòng nào của tháng này được nữa cho tới khi mở khóa.</p>'
    });
    if (!ok) return;
    try { await api('POST', '/api/locks', { months }); toast('Đã khóa sổ ' + months.map(KT.monthLabel).join(', ')); } catch (err) { showError(err); }
  };
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const tr = a.closest('tr[data-thang]');
    if (a.dataset.act === 'lock' && tr) doLock([tr.dataset.thang]);
    else if (a.dataset.act === 'lock-to') {
      const den = $('#lk-den', el).value;
      doLock(open.filter((r) => r.thang <= den).map((r) => r.thang).sort());
    } else if (a.dataset.act === 'unlock' && tr) {
      const t = tr.dataset.thang;
      const m = openModal({
        title: 'Mở khóa sổ tháng ' + KT.monthLabel(t), size: 'small',
        body: '<p class="text-ink-2">Mở khóa để sửa số liệu tháng <b class="text-ink">' + KT.monthLabel(t) + '</b>. Việc mở khóa được ghi vào nhật ký kèm lý do. Sửa xong nên khóa lại.</p>' +
          '<label class="field mt-3"><span class="label">Lý do mở khóa <b class="req">*</b></span><textarea class="input" id="uk-ly" rows="2" placeholder="VD: bổ sung hóa đơn nhận muộn"></textarea></label>',
        footer: '<span class="flex-1"></span><button type="button" class="btn btn-ghost" data-act="no">Hủy</button><button type="button" class="btn btn-danger" data-act="yes">' + icon('unlock') + 'Mở khóa</button>'
      });
      m.el.querySelector('[data-act=no]').addEventListener('click', () => m.close());
      m.el.querySelector('[data-act=yes]').addEventListener('click', async () => {
        const ly = m.el.querySelector('#uk-ly');
        if (!ly.value.trim()) { fieldError(ly, 'Ghi lý do mở khóa'); return; }
        try { await api('POST', '/api/locks/unlock', { thang: t, lyDo: ly.value.trim() }); toast('Đã mở khóa sổ tháng ' + KT.monthLabel(t)); m.close(); } catch (err) { showError(err); }
      });
    }
  });
}

registerTab({ key: 'khoa-so', order: 30, label: 'Khóa sổ', icon: 'lock', render: renderLocks });
registerTab({ key: 'nhat-ky', order: 40, label: 'Nhật ký thay đổi', icon: 'history', render: renderAudit });
registerTab({ key: 'thung-rac', order: 50, label: 'Thùng rác', icon: 'trash', render: renderTrash });

