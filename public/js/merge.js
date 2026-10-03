/* Gộp mã: hộp thoại chọn mã nguồn / mã đích → XEM TRƯỚC (số bản ghi, tiền, thuộc tính nguồn / đích, cảnh báo) → xác nhận → kết quả
 * kèm nút Hoàn tác; màn hình "Gộp mã" (#/gop-ma): lịch sử gộp + hoàn tác, gợi ý mã trùng, tách mã hạng mục. */
import { $, esc, money, fdate, icon, api, toast, showError, confirmDialog, openModal, freshRoot, busy, dateField } from './ui.js';
import { S } from './state.js';
import { comboHtml, bindCombo } from './combo.js';

const KT = window.KT;

export const LOAI = {
  ncc: { list: 'suppliers', ten: 'nhà cung cấp', Ten: 'Nhà cung cấp', sub: (x) => x.loai },
  vt: { list: 'materials', ten: 'vật tư', Ten: 'Vật tư', sub: (x) => x.dvt },
  hm: { list: 'costItems', ten: 'hạng mục', Ten: 'Hạng mục', sub: () => '' },
  nha: { list: 'houses', ten: 'nhà / khu', Ten: 'Nhà / khu', sub: (x) => x.maCT },
  da: { list: 'projects', ten: 'dự án / công trình', Ten: 'Dự án / công trình', sub: () => '' }
};
const COUNT_LABEL = { entries: 'dòng sổ thu chi', costs: 'dòng chi phí', materials: 'vật tư dùng làm hạng mục hay dùng', houses: 'nhà / khu', extPayments: 'khoản trả NCC ngoài quỹ', soDuDauKy: 'số dư đầu kỳ NCC' };
const XAC_NHAN = { dvt: 'Tôi xác nhận: ĐVT khác nhau, số lượng giữ nguyên', khoan: 'Tôi xác nhận gộp mã khoản / chung với vật tư thường', ten: 'Tôi xác nhận hai hạng mục CÙNG NGHĨA' };

const countsText = (c, trash) => {
  const parts = Object.keys(c || {}).map((k) => c[k] + ' ' + (COUNT_LABEL[k] || k));
  return (parts.join(', ') || 'không có bản ghi nào') + (trash ? ' (trong đó ' + trash + ' trong thùng rác)' : '');
};
const tienText = (t) => [t.chiPhi ? 'chi phí ' + money(t.chiPhi) : '', t.chi ? 'chi ' + money(t.chi) : '', t.thu ? 'thu ' + money(t.thu) : '', t.traNgoai ? 'trả ngoài quỹ ' + money(t.traNgoai) : ''].filter(Boolean).join(' · ') || '—';
const valText = (f, v) => (v === '' || v == null ? '(trống)' : typeof v === 'boolean' ? (v ? 'Có' : 'Không') : f === 'nganSach' ? money(v) : f === 'ngayKhoiCong' ? fdate(v) : String(v));

function activeList(loai) { return (S.db[LOAI[loai].list] || []).map((x) => ({ ma: x.ma, ten: x.ten || '', sub: LOAI[loai].sub(x) || '' })); }

/* ============================== Hộp thoại gộp mã ============================== */

// opts: { nguon: [mã...], dich, onDone }
export function openMergeDialog(loai, opts) {
  opts = opts || {};
  const L = LOAI[loai];
  const st = { nguon: (opts.nguon || []).slice(), dich: opts.dich || '', preview: null, giuLai: {}, xacNhan: {}, nhaMap: {} };
  return openModal({
    title: 'Gộp mã ' + L.ten,
    size: 'wide',
    dismissible: false,
    body: '<div id="mg-pick"></div><div id="mg-preview" class="mt-4"></div>',
    footer: '<span class="flex-1"></span><button type="button" class="btn btn-ghost" data-act="cancel">Đóng</button>' +
      '<button type="button" class="btn btn-secondary" data-act="preview">' + icon('eye') + 'Xem trước</button>' +
      '<button type="button" class="btn btn-primary" data-act="merge" disabled>' + icon('merge') + 'Gộp mã</button>',
    onMount(el, h) {
      const pickBox = $('#mg-pick', el);
      const pvBox = $('#mg-preview', el);
      const btnMerge = el.querySelector('[data-act=merge]');
      const drawPick = () => {
        const list = activeList(loai);
        const cbN = { id: 'mg-nguon', list, value: '', multi: true, exclude: new Set(st.nguon.map(KT.keyOf).concat(st.dich ? [KT.keyOf(st.dich)] : [])), noun: L.ten,
          placeholder: 'Gõ mã hoặc tên mã bị gộp', label: 'Mã nguồn (bị gộp), chọn được nhiều', cls: 'w-full' };
        const cbD = { id: 'mg-dich', list: list.filter((x) => !st.nguon.some((n) => n === x.ma)), value: st.dich, noun: L.ten, placeholder: 'Gõ mã hoặc tên mã giữ lại', label: 'Mã đích (giữ lại)', cls: 'w-full' };
        pickBox.innerHTML =
          '<div class="grid grid-cols-2 gap-x-5 gap-y-3 max-sm:grid-cols-1">' +
          '<div class="field"><span class="label">Mã NGUỒN — bị gộp, chọn một hoặc nhiều <b class="req">*</b></span>' + comboHtml(cbN) +
          '<div class="mt-1 flex flex-wrap gap-1.5" id="mg-chips">' + (st.nguon.map((m) => { const x = list.find((y) => y.ma === m); return '<span class="filter-chip" data-ma="' + esc(m) + '"><span><b>' + esc(m) + '</b>' +
            (x ? ' – ' + esc(x.ten) : '') + '</span><button type="button" data-act="rm" aria-label="Bỏ ' + esc(m) + '">' + icon('x') + '</button></span>'; }).join('') || '<span class="text-[12.5px] text-ink-3">Chưa chọn mã nào</span>') + '</div></div>' +
          '<div class="field"><span class="label">Mã ĐÍCH — giữ lại <b class="req">*</b></span>' + comboHtml(cbD) +
          '<span class="hint">Mọi chỗ đang dùng mã nguồn sẽ chuyển sang mã này. Mã đã gộp vào mã khác không làm đích được.</span></div></div>';
        bindCombo($('#mg-nguon', el), cbN, (v) => { if (!st.nguon.includes(v)) st.nguon.push(v); if (KT.keyOf(v) === KT.keyOf(st.dich)) st.dich = ''; reset(); drawPick(); $('#mg-nguon', el).focus(); });
        bindCombo($('#mg-dich', el), cbD, (v) => { st.dich = v; st.nguon = st.nguon.filter((m) => m !== v); reset(); drawPick(); });
      };
      const reset = () => { st.preview = null; st.giuLai = {}; st.xacNhan = {}; st.nhaMap = {}; pvBox.innerHTML = ''; btnMerge.disabled = true; };
      const body = () => ({ loai, nguon: st.nguon, dich: st.dich, giuLai: st.giuLai, xacNhan: st.xacNhan, nhaMap: loai === 'da' ? st.nhaMap : undefined, phienBan: st.preview ? st.preview.phienBan : undefined });
      const doPreview = async () => {
        if (!st.nguon.length) { toast('Chọn ít nhất một mã nguồn (mã bị gộp)', 'error'); $('#mg-nguon', el).focus(); return; }
        if (!st.dich) { toast('Chọn mã đích (mã giữ lại)', 'error'); $('#mg-dich', el).focus(); return; }
        const done = busy(el.querySelector('[data-act=preview]'), 'Đang xem trước…');
        try {
          const r = await api('POST', '/api/merge/preview', body());
          st.preview = r.preview;
          drawPreview();
        } catch (err) { pvBox.innerHTML = '<p class="form-error">' + icon('warn') + '<span>' + esc(err.message) + '</span></p>'; btnMerge.disabled = true; } finally { done(); }
      };
      const drawPreview = () => {
        const p = st.preview;
        const hardBlock = p.chan.filter((c) => !c.can);
        const needOk = p.chan.filter((c) => c.can);
        pvBox.innerHTML =
          '<h3 class="text-[14px] font-semibold">Xem trước</h3>' +
          '<div class="overflow-x-auto"><table class="ledger ledger-compact mt-1" id="mg-table"><thead><tr><th>Mã</th><th>Tên</th><th>Sẽ chuyển sang ' + esc(p.dich.ma) + '</th><th class="num">Tiền chịu ảnh hưởng</th></tr></thead><tbody>' +
          p.nguon.map((n) => '<tr><td class="code">' + esc(n.ma) + '</td><td>' + esc(n.ten) + '</td><td>' + esc(countsText(n.counts, n.trash)) + '</td><td class="num">' + esc(tienText(n.tien)) + '</td></tr>').join('') +
          '<tr class="sub-total"><td class="code">' + esc(p.dich.ma) + '</td><td>' + esc(p.dich.ten) + ' <span class="pill">đích</span></td><td>Đang có: ' + esc(countsText(p.dich.counts, p.dich.trash)) + '</td><td class="num">' + esc(tienText(p.dich.tien)) + '</td></tr>' +
          '</tbody><tfoot><tr><td colspan="2">Tổng sẽ chuyển</td><td>' + p.tong.soBanGhi + ' bản ghi</td><td class="num">' + esc(tienText(p.tong.tien)) + '</td></tr></tfoot></table></div>' +
          '<p class="mt-1 text-[12.5px] text-ink-3">Chỉ đổi MÃ trên các bản ghi; số tiền không đổi. Tổng của mã đích sau gộp = tổng đích hiện tại + tổng các mã nguồn.</p>' +
          '<h3 class="mt-3 text-[14px] font-semibold">Thông tin giữ lại cho mã đích</h3>' +
          '<table class="ledger ledger-compact mt-1"><thead><tr><th>Thuộc tính</th><th>Đích ' + esc(p.dich.ma) + '</th><th>Nguồn</th><th>Giữ lại</th></tr></thead><tbody>' +
          p.thuocTinh.map((a) => '<tr' + (a.khac ? ' class="bg-caution-soft"' : '') + '><td>' + esc(a.label) + (a.khac ? ' <span class="chip chip-near">khác</span>' : '') + '</td><td>' + esc(valText(a.f, a.dich)) + '</td>' +
            '<td>' + a.nguon.map((x) => '<div><span class="code">' + esc(x.ma) + '</span>: ' + esc(valText(a.f, x.v)) + '</div>').join('') + '</td>' +
            '<td><select class="input input-sm" data-giu="' + esc(a.f) + '" aria-label="Giữ ' + esc(a.label) + '"><option value="dich"' + (a.chon === 'dich' ? ' selected' : '') + '>Của đích</option>' +
            a.nguon.map((x) => '<option value="' + esc(x.ma) + '"' + (a.chon === x.ma ? ' selected' : '') + '>Của ' + esc(x.ma) + '</option>').join('') +
            (a.coCong ? '<option value="cong"' + (a.chon === 'cong' ? ' selected' : '') + '>Cộng</option>' : '') + '</select></td></tr>').join('') +
          '</tbody></table>' +
          (p.nha && p.nha.length ? '<h3 class="mt-3 text-[14px] font-semibold">Nhà / khu của công trình nguồn</h3><p class="text-[12.5px] text-ink-3">Mặc định chuyển sang công trình đích; nhà trùng thì chọn gộp vào nhà của công trình đích.</p>' +
            '<table class="ledger ledger-compact mt-1"><thead><tr><th>Nhà nguồn</th><th class="num">Dòng chi phí</th><th>Xử lý</th></tr></thead><tbody>' +
            p.nha.map((x) => '<tr><td><span class="code">' + esc(x.ma) + '</span> ' + esc(x.ten) + (x.chung ? ' <span class="pill">dùng chung</span>' : '') + '</td><td class="num">' + x.soDong + '</td>' +
              '<td><select class="input input-sm" data-nha="' + esc(x.ma) + '" aria-label="Xử lý nhà ' + esc(x.ma) + '"><option value="">Chuyển sang công trình đích, giữ mã</option>' +
              (S.db.houses.filter((hh) => KT.keyOf(hh.maCT) === KT.keyOf(p.dich.ma)).map((hh) => '<option value="' + esc(hh.ma) + '"' + ((st.nhaMap[x.ma] !== undefined ? st.nhaMap[x.ma] : x.vao) === hh.ma ? ' selected' : '') + '>Gộp vào ' + esc(hh.ma + ' – ' + hh.ten) +
                (x.goiY === hh.ma ? ' (gợi ý)' : '') + '</option>').join('')) + '</select></td></tr>').join('') + '</tbody></table>' : '') +
          (p.canhBao.length ? '<div class="mt-3 rounded-md bg-caution-soft px-3 py-2 text-[13px]" role="note"><b>' + icon('warnTri') + ' Cảnh báo</b><ul class="mt-1 list-disc pl-5">' + p.canhBao.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' : '') +
          (needOk.length ? '<div class="mt-3 flex flex-col gap-2">' + needOk.map((c) => '<div class="rounded-md bg-alert-soft px-3 py-2 text-[13px] text-alert">' + esc(c.text) +
            '<label class="check mt-1.5 text-ink"><input type="checkbox" data-xn="' + esc(c.can) + '"' + (st.xacNhan[c.can] ? ' checked' : '') + '>' + esc(XAC_NHAN[c.can] || 'Tôi xác nhận') + '</label></div>').join('') + '</div>' : '') +
          (hardBlock.length ? '<div class="form-error mt-3">' + icon('warn') + '<span>' + hardBlock.map((c) => esc(c.text)).join('<br>') + '</span></div>' : '') +
          (p.soKhoa ? '<div class="form-error mt-3">' + icon('lock') + '<span>Có ' + p.soKhoa + ' bản ghi thuộc tháng đã khóa sổ nên không gộp được (mở khóa tháng đó ở Kiểm soát → Khóa sổ):<br>' +
            p.khoa.slice(0, 8).map((x) => esc(x.label)).join('<br>') + (p.soKhoa > 8 ? '<br>…' : '') + '</span></div>' : '');
        const blocked = () => hardBlock.length > 0 || p.soKhoa > 0 || needOk.some((c) => !st.xacNhan[c.can]);
        btnMerge.disabled = blocked();
        pvBox.querySelectorAll('[data-giu]').forEach((s) => s.addEventListener('change', () => { st.giuLai[s.dataset.giu] = s.value; doPreview(); }));
        pvBox.querySelectorAll('[data-nha]').forEach((s) => s.addEventListener('change', () => { st.nhaMap[s.dataset.nha] = s.value; doPreview(); }));
        pvBox.querySelectorAll('[data-xn]').forEach((c) => c.addEventListener('change', () => { st.xacNhan[c.dataset.xn] = c.checked; btnMerge.disabled = blocked(); }));
        // ngân sách cả hai bên đều có: bắt chọn (không tự cộng)
        if (p.chan.some((c) => c.ma === 'ngan-sach') && st.giuLai.nganSach === undefined) btnMerge.disabled = true;
      };
      const doMerge = async () => {
        const p = st.preview;
        if (!p) return;
        const ok = await confirmDialog({
          title: 'Gộp mã ' + L.ten,
          html: '<p>Chuyển <b class="text-ink">' + p.tong.soBanGhi + ' bản ghi</b> của ' + p.nguon.map((n) => '<b class="text-ink">' + esc(n.ma) + '</b>').join(', ') + ' sang <b class="text-ink">' + esc(p.dich.ma) + '</b>.</p>' +
            '<ul class="mt-2 list-disc pl-5 text-[13.5px]"><li>Mã nguồn chuyển sang trạng thái “Đã gộp vào ' + esc(p.dich.ma) + '”: ẩn khỏi ô chọn, danh sách, báo cáo; không dùng để nhập mới.</li>' +
            '<li>Nhập tay hoặc nhập Excel gặp mã cũ sẽ tự đổi sang ' + esc(p.dich.ma) + '.</li><li>Tổng tiền không đổi. Có bản sao lưu ngay trước khi gộp và có thể <b>Hoàn tác</b> ở màn Gộp mã.</li></ul>',
          okText: 'Gộp mã'
        });
        if (!ok) return;
        const done = busy(btnMerge, 'Đang gộp…');
        try {
          const r = await api('POST', '/api/merge', body());
          const g = r.merge;
          h.close();
          showResult(g, opts.onDone);
        } catch (err) { done(); showError(err); if (err.status === 409) { st.preview = null; doPreview(); } }
      };
      el.addEventListener('click', (e) => {
        const a = e.target.closest('[data-act]');
        if (!a) return;
        if (a.dataset.act === 'cancel') h.close();
        if (a.dataset.act === 'preview') doPreview();
        if (a.dataset.act === 'merge') doMerge();
        if (a.dataset.act === 'rm') { st.nguon = st.nguon.filter((m) => m !== a.closest('[data-ma]').dataset.ma); reset(); drawPick(); }
      });
      drawPick();
      if (st.nguon.length && st.dich) doPreview();
    }
  });
}

// Kết quả gộp: số bản ghi đã chuyển + nút Hoàn tác
function showResult(g, onDone) {
  const m = openModal({
    title: 'Đã gộp mã',
    size: 'small',
    body: '<p class="leading-relaxed">' + esc(g.nhan) + '.</p><p class="mt-2 text-[13.5px] text-ink-2">Đã chuyển <b class="text-ink">' + g.soBanGhi + ' bản ghi</b> (' + esc(countsText(g.counts)) + ').</p>' +
      '<p class="mt-2 text-[12.5px] text-ink-3">Có thể hoàn tác bất cứ lúc nào ở màn Gộp mã → Lịch sử, miễn là chưa có lần gộp sau đụng tới cùng mã.</p>',
    footer: '<button type="button" class="btn btn-ghost" data-act="undo">' + icon('undo') + 'Hoàn tác gộp</button><span class="flex-1"></span>' +
      '<a href="#/gop-ma" class="btn btn-ghost" data-act="log">Lịch sử gộp mã</a><button type="button" class="btn btn-primary" data-act="ok" autofocus>Xong</button>'
  });
  m.el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'ok' || a.dataset.act === 'log') m.close();
    if (a.dataset.act === 'undo') { const done = await undoMerge(g); if (done) m.close(); }
  });
  toast('Đã gộp: ' + g.nhan + ' (' + g.soBanGhi + ' bản ghi)');
  if (onDone) onDone(g);
}

export async function undoMerge(g) {
  const ok = await confirmDialog({ title: 'Hoàn tác', html: '<p>Trả <b class="text-ink">' + g.soBanGhi + ' bản ghi</b> về mã cũ và dùng lại mã nguồn: <br>' + esc(g.nhan) + '</p>', okText: 'Hoàn tác' });
  if (!ok) return false;
  try {
    await api('POST', '/api/merge/' + g.id + '/undo', {});
    toast('Đã hoàn tác: ' + g.nhan);
    return true;
  } catch (err) { showError(err); return false; }
}

/* ============================== Màn hình Gộp mã ============================== */

const TABS = [['lich-su', 'Lịch sử gộp mã', 'history'], ['goi-y', 'Gợi ý mã trùng', 'dupes'], ['tach', 'Tách mã hạng mục', 'split']];
let tab = 'lich-su';

export function renderMerge(root) {
  root = freshRoot(root);
  root.innerHTML =
    '<div class="no-print flex flex-wrap items-center gap-2"><div class="seg" role="tablist" aria-label="Gộp mã">' +
    TABS.map(([k, l, ic]) => '<label class="seg-item"><input type="radio" name="gm-tab" value="' + k + '"' + (tab === k ? ' checked' : '') + '><span>' + icon(ic, 'mr-1 align-[-2px]') + l + '</span></label>').join('') +
    '</div><span class="flex-1"></span>' +
    '<span class="text-[13px] text-ink-2">Gộp mã mới:</span>' +
    Object.keys(LOAI).map((l) => '<button type="button" class="btn btn-secondary btn-sm" data-new="' + l + '">' + icon('merge') + LOAI[l].Ten + '</button>').join('') + '</div>' +
    '<div id="gm-body"></div>';
  root.querySelectorAll('input[name=gm-tab]').forEach((r) => r.addEventListener('change', () => { tab = r.value; draw(); }));
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-new]');
    if (b) openMergeDialog(b.dataset.new, { onDone: () => { if (tab === 'lich-su') draw(); } });
  });
  const draw = () => {
    const box = $('#gm-body', root);
    if (tab === 'lich-su') return drawLog(box);
    if (tab === 'goi-y') return drawSuggest(box, root);
    return drawSplit(box);
  };
  draw();
}

async function drawLog(box) {
  box.innerHTML = '<p class="text-ink-3">Đang tải…</p>';
  let items;
  try { items = (await api('GET', '/api/merge/log')).items; } catch (err) { box.innerHTML = '<p class="form-error">' + esc(err.message) + '</p>'; return; }
  const LOAI_TEN = { ncc: 'NCC', vt: 'Vật tư', hm: 'Hạng mục', nha: 'Nhà / khu', da: 'Dự án', 'tach-hm': 'Tách hạng mục' };
  box.innerHTML = '<section class="sheet overflow-hidden"><div class="overflow-x-auto"><table class="ledger" id="gm-log"><thead><tr><th>Lúc</th><th>Loại</th><th>Nội dung</th><th class="num">Bản ghi</th><th>Tiền chịu ảnh hưởng</th><th>Trạng thái</th><th class="no-print"></th></tr></thead><tbody>' +
    (items.length ? items.map((g) => '<tr data-id="' + g.id + '"><td class="whitespace-nowrap">' + esc(fdate(g.at.slice(0, 10))) + ' ' + esc(g.at.slice(11, 16)) + (g.by ? '<div class="sub">' + esc(g.by) + '</div>' : '') + '</td>' +
      '<td>' + esc(LOAI_TEN[g.loai] || g.loai) + '</td><td>' + esc(g.nhan) + (g.xacNhan.length ? '<div class="sub">Đã xác nhận: ' + esc(g.xacNhan.join(' | ')) + '</div>' : '') + '</td>' +
      '<td class="num">' + g.soBanGhi + '</td><td>' + esc(tienText(g.tien || {})) + '</td>' +
      '<td>' + (g.trangThai === 'hieu-luc' ? '<span class="chip chip-ok">' + icon('checkCircle') + 'Đang hiệu lực</span>' : '<span class="chip chip-idle">' + icon('undo') + 'Đã hoàn tác' + (g.hoanTacLuc ? ' ' + esc(fdate(g.hoanTacLuc.slice(0, 10))) : '') + '</span>') + '</td>' +
      '<td class="actions no-print">' + (g.trangThai === 'hieu-luc' ? '<button type="button" class="btn btn-ghost btn-sm" data-act="undo"' + (g.coTheHoanTac ? '' : ' disabled title="' + esc(g.lyDo) + '"') + '>' + icon('undo') + 'Hoàn tác</button>' +
        (g.coTheHoanTac ? '' : '<div class="sub max-w-[260px] whitespace-normal">' + esc(g.lyDo) + '</div>') : '') + '</td></tr>').join('')
      : '<tr><td colspan="7" class="empty">Chưa gộp mã lần nào.</td></tr>') + '</tbody></table></div></section>';
  box.onclick = async (e) => {
    const a = e.target.closest('[data-act=undo]');
    if (!a) return;
    const g = items.find((x) => x.id === Number(a.closest('tr').dataset.id));
    if (g && await undoMerge(g)) drawLog(box);
  };
}

/* ---- Gợi ý mã trùng (mục 6) ---- */
async function drawSuggest(box, root) {
  box.innerHTML = '<p class="text-ink-3">Đang tìm…</p>';
  let r;
  try { r = await api('GET', '/api/merge/suggest'); } catch (err) { box.innerHTML = '<p class="form-error">' + esc(err.message) + '</p>'; return; }
  const LOAI_TEN = { ncc: 'Nhà cung cấp', vt: 'Vật tư', hm: 'Hạng mục', nha: 'Nhà / khu', da: 'Dự án' };
  const show = r.nhom.filter((g) => !g.boQua);
  const hidden = r.nhom.length - show.length;
  box.innerHTML =
    '<p class="text-[13px] text-ink-2">Phần mềm chỉ GỢI Ý các nhóm mã nghi trùng; không bao giờ tự gộp. Bấm “Gộp…” để xem trước và quyết định; “Bỏ qua” để không nhắc lại nhóm này.</p>' +
    '<section class="sheet overflow-hidden mt-2"><div class="overflow-x-auto"><table class="ledger" id="gm-suggest"><thead><tr><th>Loại</th><th>Lý do</th><th>Các mã</th><th class="no-print"></th></tr></thead><tbody>' +
    (show.length ? show.map((g, i) => '<tr data-i="' + r.nhom.indexOf(g) + '"><td>' + esc(LOAI_TEN[g.loai]) + '</td><td>' + esc(g.ly) + '</td><td>' +
      g.ma.map((x) => '<div><span class="code">' + esc(x.ma) + '</span> – ' + esc(x.ten) + (x.dvt ? ' · ' + esc(x.dvt) : '') + (x.maCT && g.loai === 'nha' ? ' · ' + esc(x.maCT) : '') + ' <span class="text-ink-3">(' + x.dung + ' chỗ dùng)</span></div>').join('') + '</td>' +
      '<td class="actions no-print"><button type="button" class="btn btn-secondary btn-sm" data-act="gop">' + icon('merge') + 'Gộp…</button><button type="button" class="btn btn-ghost btn-sm" data-act="bo-qua">Bỏ qua gợi ý này</button></td></tr>').join('')
      : '<tr><td colspan="4" class="empty">Không có nhóm mã nào nghi trùng' + (hidden ? ' (đã bỏ qua ' + hidden + ' nhóm)' : '') + '.</td></tr>') + '</tbody></table></div></section>' +
    (hidden ? '<p class="mt-1 text-[12.5px] text-ink-3">Đã bỏ qua ' + hidden + ' nhóm gợi ý. <a href="#" class="font-semibold text-pen underline" data-act="hien-bo-qua">Hiện lại</a></p>' : '') +
    '<h3 class="mt-4 text-[15px] font-semibold">Nhà / khu không có dòng chi phí nào</h3><p class="text-[12.5px] text-ink-3">Gợi ý dọn dẹp (vd. nhà mẫu tạo thừa). Phần mềm không tự xóa: vào Danh mục chi phí → Nhà / khu để xóa nếu đúng là thừa.</p>' +
    '<p class="mt-1 text-[13.5px]" id="gm-nha-trong">' + (r.nhaKhongDung.length ? r.nhaKhongDung.map((x) => '<span class="code">' + esc(x.ma) + '</span> (' + esc(x.maCT || 'chưa gán công trình') + ')').join(', ') : 'Không có.') + '</p>';
  box.onclick = async (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'hien-bo-qua') {
      e.preventDefault();
      for (const g of r.nhom.filter((x) => x.boQua)) await api('DELETE', '/api/merge/suggest/ignore', { khoa: g.khoa });
      drawSuggest(box, root);
      return;
    }
    const g = r.nhom[Number(a.closest('tr').dataset.i)];
    if (a.dataset.act === 'bo-qua') {
      await api('POST', '/api/merge/suggest/ignore', { khoa: g.khoa, label: g.ma.map((x) => x.ma).join(', ') });
      toast('Đã bỏ qua gợi ý ' + g.ma.map((x) => x.ma).join(', '));
      drawSuggest(box, root);
    }
    if (a.dataset.act === 'gop') {
      // đích mặc định: mã đang được dùng nhiều nhất
      const sorted = g.ma.slice().sort((x, y) => y.dung - x.dung);
      openMergeDialog(g.loai, { dich: sorted[0].ma, nguon: sorted.slice(1).map((x) => x.ma), onDone: () => drawSuggest(box, root) });
    }
  };
}

/* ---- Tách mã hạng mục (mục 4) ---- */
let lastSplit = null; // kết quả lần tách vừa xong (màn hình vẽ lại sau khi dữ liệu đổi)
function drawSplit(box) {
  const items = S.db.costItems.map((x) => ({ ma: x.ma, ten: x.ten, sub: x.maNhom || '' }));
  const st = { maHM: '', dich: '', ct: '', nha: '', ncc: '', vt: '', moi: false };
  const cb = {
    tu: { id: 'sp-tu', list: items, value: '', noun: 'hạng mục', placeholder: 'Hạng mục đang mang hai nghĩa', label: 'Hạng mục cần tách', cls: 'w-full' },
    sang: { id: 'sp-sang', list: items, value: '', noun: 'hạng mục', placeholder: 'Hạng mục đúng cho nhóm dòng này', label: 'Đổi sang hạng mục', cls: 'w-full' },
    ct: { id: 'sp-ct', list: S.db.projects.map((x) => ({ ma: x.ma, ten: x.ten })), value: '', noun: 'công trình', placeholder: 'Mọi công trình', label: 'Lọc công trình', cls: 'w-full' },
    nha: { id: 'sp-nha', list: S.db.houses.map((x) => ({ ma: x.ma, ten: x.ten, sub: x.maCT })), value: '', noun: 'nhà', placeholder: 'Mọi nhà', label: 'Lọc nhà', cls: 'w-full' },
    ncc: { id: 'sp-ncc', list: S.db.suppliers.map((x) => ({ ma: x.ma, ten: x.ten })), value: '', noun: 'nhà cung cấp', placeholder: 'Mọi NCC', label: 'Lọc nhà cung cấp', cls: 'w-full' },
    vt: { id: 'sp-vt', list: S.db.materials.map((x) => ({ ma: x.ma, ten: x.ten, sub: x.dvt })), value: '', noun: 'vật tư', placeholder: 'Mọi vật tư', label: 'Lọc vật tư', cls: 'w-full' },
    nhom: { id: 'sp-nhom', list: S.db.costGroups.map((x) => ({ ma: x.ma, ten: x.ten })), value: '', noun: 'nhóm chi phí', placeholder: 'Nhóm của hạng mục mới', label: 'Nhóm chi phí của hạng mục mới', cls: 'w-full' }
  };
  const done = lastSplit;
  lastSplit = null;
  box.innerHTML =
    (done ? '<div class="sheet mb-4 flex flex-wrap items-center gap-3 p-4" id="sp-done"><span class="text-income">' + icon('checkCircle') + '</span><span class="min-w-0 flex-1">' + esc(done.nhan) + '. Tổng tiền không đổi.</span>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="sp-undo">' + icon('undo') + 'Hoàn tác</button></div>' : '') +
    '<section class="sheet p-5"><p class="text-[13px] leading-relaxed text-ink-2">Dùng khi MỘT mã hạng mục đang mang HAI nghĩa (vd. HM37 vừa là “Bảo hành” vừa là “Chi phí quản lý”): lọc nhóm dòng của nghĩa sai, ' +
    'xem trước và bỏ tích những dòng không đổi, rồi chuyển sang hạng mục đúng (có sẵn, hoặc tạo mới ngay tại đây). Nhóm chi phí của dòng tự theo hạng mục mới; tổng tiền không đổi; hoàn tác được.</p>' +
    '<div class="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 max-sm:grid-cols-1">' +
    '<div class="field"><span class="label">Hạng mục cần tách <b class="req">*</b></span>' + comboHtml(cb.tu) + '</div>' +
    '<div class="field"><span class="label">Đổi sang hạng mục <b class="req">*</b></span><div id="sp-sang-co">' + comboHtml(cb.sang) + '</div>' +
    '<div id="sp-moi-box" class="grid grid-cols-2 gap-2" hidden><input class="input" id="sp-moi-ma" placeholder="Mã mới, vd HM37B" aria-label="Mã hạng mục mới" maxlength="60">' +
    '<input class="input" id="sp-moi-ten" placeholder="Tên, vd Chi phí quản lý" aria-label="Tên hạng mục mới" maxlength="200"><div class="col-span-2">' + comboHtml(cb.nhom) + '</div></div>' +
    '<label class="check mt-1"><input type="checkbox" id="sp-moi">Tạo hạng mục mới</label></div>' +
    '<div class="field"><span class="label">Công trình</span>' + comboHtml(cb.ct) + '</div>' +
    '<div class="field"><span class="label">Nhà / khu</span>' + comboHtml(cb.nha) + '</div>' +
    '<div class="field"><span class="label">Nhà cung cấp</span>' + comboHtml(cb.ncc) + '</div>' +
    '<div class="field"><span class="label">Vật tư</span>' + comboHtml(cb.vt) + '</div>' +
    '<label class="field"><span class="label">Từ ngày</span>' + dateField({ id: 'sp-from', label: 'Từ ngày' }) + '</label>' +
    '<label class="field"><span class="label">Đến ngày</span>' + dateField({ id: 'sp-to', label: 'Đến ngày' }) + '</label></div>' +
    '<div class="mt-4 flex flex-wrap gap-2"><button type="button" class="btn btn-secondary" data-act="sp-preview">' + icon('eye') + 'Xem trước</button>' +
    '<button type="button" class="btn btn-primary" data-act="sp-apply" disabled>' + icon('split') + 'Đổi sang hạng mục mới</button></div>' +
    '<div id="sp-result" class="mt-3"></div></section>';
  let pv = null;
  const res = $('#sp-result', box);
  const apply = box.querySelector('[data-act=sp-apply]');
  const reset = () => { pv = null; apply.disabled = true; res.innerHTML = ''; };
  Object.keys(cb).forEach((k) => bindCombo($('#' + cb[k].id, box), cb[k], (v) => { st[{ tu: 'maHM', sang: 'dich' }[k] || k] = v; reset(); }));
  ['#sp-from', '#sp-to', '#sp-moi-ma', '#sp-moi-ten'].forEach((sel) => $(sel, box).addEventListener('change', reset));
  $('#sp-moi', box).addEventListener('change', (e) => {
    st.moi = e.target.checked;
    $('#sp-moi-box', box).hidden = !st.moi;
    $('#sp-sang-co', box).hidden = st.moi;
    reset();
    if (st.moi) $('#sp-moi-ma', box).focus();
  });
  // dòng đang tích (khi xem trước có danh sách dòng)
  const checkedIds = () => Array.from(res.querySelectorAll('input[data-sp-id]:checked')).map((x) => Number(x.dataset.spId));
  const body = (withIds) => {
    const b = { maHM: st.maHM, loc: { ct: st.ct, nha: st.nha, ncc: st.ncc, vt: st.vt, from: $('#sp-from', box).value, to: $('#sp-to', box).value }, phienBan: pv ? pv.phienBan : undefined };
    if (st.moi) b.taoMoi = { ma: $('#sp-moi-ma', box).value.trim(), ten: $('#sp-moi-ten', box).value.trim(), maNhom: st.nhom };
    else b.dich = st.dich;
    if (withIds && pv && pv.dong) b.loc.ids = checkedIds();
    return b;
  };
  const sumSel = () => {
    if (!pv || !pv.dong) return;
    const ids = new Set(checkedIds());
    const rows = pv.dong.filter((r) => ids.has(r.id));
    const tong = rows.reduce((t, r) => t + (r.nhap ? 0 : r.thanhTien), 0);
    const khoa = rows.filter((r) => r.khoa).length;
    $('#sp-sel', res).innerHTML = 'Đang chọn <b>' + rows.length + '/' + pv.dong.length + ' dòng</b>, tổng ' + money(tong) + ' đ' + (khoa ? ' · <span class="text-alert">' + khoa + ' dòng thuộc tháng đã khóa sổ</span>' : '');
    apply.disabled = !rows.length || khoa > 0;
    const all = res.querySelector('#sp-all');
    if (all) { all.checked = rows.length === pv.dong.length; all.indeterminate = rows.length > 0 && rows.length < pv.dong.length; }
  };
  const drawPreview = () => {
    const nhom = (m) => { const g = S.db.costGroups.find((x) => KT.keyOf(x.ma) === KT.keyOf(m)); return g ? g.ten : m || '(trống)'; };
    res.innerHTML = '<p class="text-[14px]">Có <b>' + pv.soDong + ' dòng chi phí</b> (tổng ' + money(pv.tong) + ' đ) của <span class="code">' + esc(pv.tu.ma) + '</span> ' + esc(pv.tu.ten) +
      ' khớp điều kiện lọc. Sẽ chuyển sang <span class="code">' + esc(pv.sang.ma) + '</span> ' + esc(pv.sang.ten) + (pv.sang.moi ? ' <span class="pill">tạo mới</span>' : '') + '.</p>' +
      (KT.keyOf(pv.tu.maNhom) !== KT.keyOf(pv.sang.maNhom) ? '<p class="mt-1 text-[13px] text-caution">' + icon('info') + ' Các dòng này chuyển từ nhóm “' + esc(nhom(pv.tu.maNhom)) + '” sang nhóm “' + esc(nhom(pv.sang.maNhom)) + '” trong báo cáo.</p>' : '') +
      (pv.dong ? '<div class="mt-2 flex items-center gap-3 text-[13px]"><label class="check"><input type="checkbox" id="sp-all" checked>Chọn tất cả</label><span id="sp-sel"></span></div>' +
        '<div class="mt-2 max-h-[360px] overflow-auto rounded-md border border-rule"><table class="ledger" id="sp-rows"><thead><tr><th class="w-8"><span class="sr-only">Chọn</span></th><th>Ngày</th><th>Công trình / nhà</th><th>Diễn giải</th><th>NCC</th><th class="num money">Thành tiền</th></tr></thead><tbody>' +
        pv.dong.map((r) => '<tr' + (r.khoa ? ' class="text-ink-3"' : '') + '><td><input type="checkbox" data-sp-id="' + r.id + '" checked aria-label="Chọn dòng ' + esc(fdate(r.ngay) + ' ' + r.dienGiai) + '"></td>' +
          '<td class="whitespace-nowrap">' + esc(fdate(r.ngay)) + (r.khoa ? ' ' + icon('lock') : '') + '</td><td>' + esc(r.maCT) + (r.maNha ? '<div class="sub">' + esc(r.maNha) + '</div>' : '') + '</td>' +
          '<td>' + esc(r.dienGiai) + (r.maVT ? '<div class="sub">' + esc(r.maVT) + '</div>' : '') + (r.nhap ? ' <span class="pill">Nháp</span>' : '') + '</td><td>' + esc(r.maNCC) + '</td>' +
          '<td class="num money">' + money(r.thanhTien) + '</td></tr>').join('') + '</tbody></table></div>'
        : (pv.soKhoa ? '<p class="form-error mt-2">' + icon('lock') + '<span>' + pv.soKhoa + ' dòng thuộc tháng đã khóa sổ — mở khóa trước.</span></p>' : '') +
          '<p class="mt-2 text-[13px] text-ink-2">Quá nhiều dòng để chọn từng dòng: sẽ đổi cả ' + pv.soDong + ' dòng theo bộ lọc. Thu hẹp bộ lọc nếu cần chọn lẻ.</p>');
    if (pv.dong) sumSel(); else apply.disabled = !pv.soDong || pv.soKhoa > 0;
  };
  res.addEventListener('change', (e) => {
    if (e.target.id === 'sp-all') res.querySelectorAll('input[data-sp-id]').forEach((x) => { x.checked = e.target.checked; });
    sumSel();
  });
  box.onclick = async (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'sp-undo' && done) { await undoMerge(done); return; }
    if (a.dataset.act === 'sp-preview') {
      try {
        pv = (await api('POST', '/api/merge/split/preview', body(false))).preview;
        drawPreview();
      } catch (err) { res.innerHTML = '<p class="form-error">' + icon('warn') + '<span>' + esc(err.message) + '</span></p>'; apply.disabled = true; }
    }
    if (a.dataset.act === 'sp-apply' && pv) {
      const b = body(true);
      const n = b.loc.ids ? b.loc.ids.length : pv.soDong;
      const ok = await confirmDialog({ title: 'Tách mã hạng mục', html: '<p>Đổi ' + n + ' dòng chi phí từ ' + esc(pv.tu.ma) + ' sang ' + esc(pv.sang.ma) + (pv.sang.moi ? ' (tạo mới hạng mục ' + esc(pv.sang.ten) + ')' : '') +
        '? Tổng tiền không đổi; hoàn tác được ở Lịch sử gộp mã.</p>', okText: 'Đổi hạng mục' });
      if (!ok) return;
      const stop = busy(apply, 'Đang đổi…');
      try {
        const r = await api('POST', '/api/merge/split', b);
        lastSplit = r.merge;
        toast('Đã đổi ' + r.merge.soBanGhi + ' dòng sang hạng mục ' + pv.sang.ma);
        // màn hình đã vẽ lại khi nhận dữ liệu mới: vẽ lại khung tách để hiện kết quả + nút Hoàn tác
        const cur = document.getElementById('gm-body');
        if (cur && tab === 'tach') drawSplit(cur);
      } catch (err) { stop(); showError(err); }
    }
  };
}

/* ============================== Gắn vào màn hình danh mục ============================== */

// Nút "Gộp mã" + ô "Hiện mã đã gộp" cho thanh công cụ danh mục
export function mergeToolbarHtml(loai, showMerged) {
  const n = ((S.raw && S.raw[LOAI[loai].list]) || []).filter((x) => x.gopVao).length;
  return '<button type="button" class="btn btn-secondary" data-act="merge" title="Gộp các mã đang tích chọn (hoặc chọn trong hộp thoại) vào một mã">' + icon('merge') + 'Gộp mã</button>' +
    (n ? '<label class="check"><input type="checkbox" data-merged-toggle' + (showMerged ? ' checked' : '') + '>Hiện ' + n + ' mã đã gộp</label>' : '');
}
// Ô tích chọn đầu dòng (chọn sẵn mã nguồn khi bấm Gộp mã)
export const pickHead = '<th class="no-print w-8"><span class="sr-only">Chọn để gộp</span></th>';
export const pickCell = (ma) => '<td class="no-print"><input type="checkbox" class="size-4 accent-cover" data-pick="' + esc(ma) + '" aria-label="Chọn ' + esc(ma) + ' để gộp"></td>';
// Các mã đã gộp (từ dữ liệu gốc, vì S.db chỉ còn mã đang dùng)
export function mergedRecords(loai) { return ((S.raw && S.raw[LOAI[loai].list]) || []).filter((x) => x.gopVao); }
export const mergedChip = (x) => '<span class="chip chip-idle" title="Mã này đã gộp, không dùng để nhập mới">' + icon('merge') + 'Đã gộp vào ' + esc(x.gopVao) + '</span>';
// Bấm Gộp mã: lấy các dòng đang tích làm mã nguồn
// loai: mã loại hoặc hàm trả mã loại (màn hình có nhiều tab). Dòng tích đầu tiên = mã đích gợi ý, các dòng sau = mã nguồn.
export function bindMergeUI(root, loai, onToggle, bulk) {
  const picked = () => Array.from(root.querySelectorAll('[data-pick]:checked')).map((c) => c.dataset.pick);
  const moGop = () => {
    const l = typeof loai === 'function' ? loai() : loai;
    if (!l) return;
    const picks = picked();
    openMergeDialog(l, { nguon: picks.length > 1 ? picks.slice(1) : picks, dich: picks.length > 1 ? picks[0] : '' });
  };
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-act=merge]')) moGop();
  });
  root.addEventListener('change', (e) => { if (e.target.matches('[data-merged-toggle]') && onToggle) onToggle(e.target.checked); });
  if (!bulk) return;

  // Thanh "Đã chọn N …": Gộp mã N · Xóa · Bỏ chọn. Xóa từng mã một (mã đang có dòng sổ bị từ chối như khi xóa lẻ).
  let bar = null;
  const refresh = () => {
    const picks = picked();
    if (!picks.length) { if (bar) { bar.remove(); bar = null; } return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'sel-bar';
      bar.className = 'banner no-print';
      bar.setAttribute('role', 'region');
      bar.setAttribute('aria-label', 'Thao tác với các dòng đã chọn');
      const anchor = root.querySelector('.sheet');
      if (anchor) anchor.insertAdjacentElement('beforebegin', bar); else root.appendChild(bar);
      bar.addEventListener('click', async (e) => {
        const a = e.target.closest('[data-bar]');
        if (!a) return;
        if (a.dataset.bar === 'clear') { root.querySelectorAll('[data-pick]:checked').forEach((c) => { c.checked = false; }); refresh(); }
        else if (a.dataset.bar === 'merge') moGop();
        else if (a.dataset.bar === 'del') await xoaNhieu();
      });
    }
    const html = '<b>Đã chọn ' + picks.length + ' ' + esc(bulk.noun) + '</b><span class="min-w-0 truncate text-ink-2">' + esc(picks.slice(0, 3).join(', ') + (picks.length > 3 ? '…' : '')) + '</span><span class="flex-1"></span>' +
      (picks.length > 1 && (!bulk.coGop || bulk.coGop()) ? '<button type="button" class="btn btn-secondary btn-sm" data-bar="merge">' + icon('merge') + 'Gộp mã ' + picks.length + ' ' + esc(bulk.noun) + '</button>' : '') +
      '<button type="button" class="btn btn-secondary btn-sm !text-alert" data-bar="del">' + icon('trash') + 'Xóa ' + picks.length + '</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-bar="clear">Bỏ chọn</button>';
    if (bar.innerHTML !== html) bar.innerHTML = html;
  };
  async function xoaNhieu() {
    const picks = picked();
    const recs = picks.map((ma) => bulk.list().find((x) => KT.keyOf(x.ma) === KT.keyOf(ma))).filter(Boolean);
    if (!recs.length) return;
    const ok = await confirmDialog({ trash: true, title: 'Xóa ' + recs.length + ' ' + bulk.noun, danger: true, okText: 'Xóa ' + recs.length,
      html: 'Xóa <b class="text-ink">' + esc(recs.map((x) => x.ma).slice(0, 6).join(', ') + (recs.length > 6 ? '…' : '')) + '</b>? Mã đang có dòng sổ sẽ không xóa được (dùng Gộp mã). Các mã xóa được chuyển vào Thùng rác.' });
    if (!ok) return;
    const xong = []; const loi = [];
    for (const r of recs) {
      try { await api('DELETE', bulk.endpoint() + '/' + r.id); xong.push(r.ma); } catch (err) { loi.push(r.ma + ': ' + (err && err.message ? err.message : 'không xóa được')); }
    }
    if (xong.length) toast('Đã xóa ' + xong.length + ' ' + bulk.noun + ', chuyển vào Thùng rác' + (loi.length ? '; ' + loi.length + ' mã không xóa được' : ''));
    if (loi.length) toast(loi.length + ' mã không xóa được: ' + loi.slice(0, 3).join(' | ') + (loi.length > 3 ? ' …' : ''), 'error');
  }
  root.addEventListener('change', (e) => { if (e.target.matches('[data-pick]')) refresh(); });
  new MutationObserver((muts) => { if (!muts.every((m) => bar && bar.contains(m.target))) refresh(); }).observe(root, { childList: true, subtree: true });
}
