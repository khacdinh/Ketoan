/* Cài đặt: thông tin đơn vị, nhập Excel, xuất/sao lưu/khôi phục, xóa dữ liệu. */
import { $, esc, money, icon, duo, download, api, toast, showError, confirmDialog, openModal, freshRoot, busy, LS } from '../ui.js';
import { S } from '../state.js';

export function renderSettings(root) {
  root = freshRoot(root);
  const s = S.db.settings;
  root.innerHTML =
    '<div class="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-2">' +

    /* ---- Thông tin in trên phiếu ---- */
    '<section class="sheet" aria-labelledby="h-dv"><div class="sheet-head"><div><h2 id="h-dv" class="sheet-title">Thông tin in trên phiếu và báo cáo</h2>' +
    '<p class="sheet-note">Tên, địa chỉ đơn vị và người ký in trên phiếu thu, phiếu chi và các file Excel.</p></div></div>' +
    '<form id="st-form" class="grid grid-cols-2 gap-x-5 gap-y-4 px-5 pb-5 max-sm:grid-cols-1" autocomplete="off">' +
    f('tenDonVi', 'Tên đơn vị', s.tenDonVi, 'col-span-2 max-sm:col-span-1') +
    f('diaChi', 'Địa chỉ', s.diaChi, 'col-span-2 max-sm:col-span-1') +
    f('giamDoc', 'Giám đốc', s.giamDoc) +
    f('keToanTruong', 'Kế toán trưởng', s.keToanTruong) +
    f('thuQuy', 'Thủ quỹ', s.thuQuy) +
    f('nguoiLap', 'Người lập biểu (in trên sổ)', s.nguoiLap) +
    '<label class="field"><span class="label">Hình thức thanh toán thường dùng</span><select name="hinhThucMacDinh" class="input">' +
    ['Tiền mặt', 'Chuyển khoản'].map((h) => '<option' + (h === s.hinhThucMacDinh ? ' selected' : '') + '>' + h + '</option>').join('') + '</select></label>' +
    '<label class="check self-end pb-2"><input type="checkbox" name="hienKeToanTruong"' + (s.hienKeToanTruong ? ' checked' : '') + '>In thêm chỗ ký của kế toán trưởng</label>' +
    '<div class="col-span-2 flex justify-end max-sm:col-span-1"><button type="submit" class="btn btn-primary">' + icon('save') + 'Lưu thông tin</button></div>' +
    '</form></section>' +

    /* ---- Nhập Excel ---- */
    '<section class="sheet" aria-labelledby="h-nhap"><div class="sheet-head"><div><h2 id="h-nhap" class="sheet-title">Nhập dữ liệu từ file Excel</h2>' +
    '<p class="sheet-note">File “Quản lý thu chi” (So_Thu_Chi_Hang_Ngay, Danh_Muc_Du_An, Danh_Muc_NCC) hoặc file “Chi phí công trình” (NHATKYCHUNG, DM_HANGMUC, DM_VATTU, DM_NHA, SO_QUY), kể cả file xuất từ phần mềm này. Phần mềm tự nhận ra loại file.</p></div></div>' +
    '<div class="px-5 pb-5"><label class="dropzone" id="imp-drop"><input type="file" id="imp-file" accept=".xlsx,.xlsm" class="sr-only">' +
    duo('excel', 'text-[34px] text-income') +
    '<span class="font-semibold text-ink">Chọn file Excel, hoặc kéo thả vào đây</span>' +
    '<span class="text-[13px] text-ink-3">Phần mềm đọc thử và cho xem trước, chưa thay đổi gì cho đến khi bạn xác nhận.</span></label>' +
    '<div id="imp-preview"></div></div></section>' +

    /* ---- Xuất & sao lưu ---- */
    '<section class="sheet" aria-labelledby="h-xuat"><div class="sheet-head"><div><h2 id="h-xuat" class="sheet-title">Xuất Excel và sao lưu</h2>' +
    '<p class="sheet-note">Dữ liệu tự lưu vào thư mục <b class="font-medium text-ink-2">data</b> của phần mềm sau mỗi thao tác.</p></div></div>' +
    '<div class="flex flex-col gap-2 px-5 pb-5">' +
    act('export-full', 'excel', 'Xuất toàn bộ sổ sách ra Excel', 'Đủ các sheet như file gốc: Tổng quan có biểu đồ, Sổ thu chi, Phiếu chi chọn số phiếu để in, các danh mục, Tổng hợp NCC. Giữ nguyên công thức.') +
    act('export-costs', 'crane', 'Xuất chi phí công trình ra Excel', 'Cấu trúc như file ChiPhi_CongTrinh: TONGHOP có biểu đồ, NHATKYCHUNG, CHI_TIET_THEO_NHOM, CONGNO_NCC, SO_QUY, giá vật tư, các danh mục. Giữ công thức SUMIFS, INDEX/MATCH.') +
    act('backup-zip', 'database', 'Tải bản sao lưu đầy đủ (.zip)', 'Toàn bộ dữ liệu, chứng từ đính kèm (ảnh, PDF) và nhật ký thay đổi trong một file. Nên cất ra USB hoặc Google Drive định kỳ.') +
    act('backup', 'database', 'Tải bản sao lưu chỉ dữ liệu (.json)', 'File nhỏ, không kèm ảnh chứng từ.') +
    act('restore', 'history', 'Khôi phục từ file sao lưu', 'Thay toàn bộ dữ liệu hiện tại bằng dữ liệu trong file .zip hoặc .json đã tải trước đó. Chứng từ trong file .zip được chép lại.') +
    '<input type="file" id="restore-file" accept=".json,.zip" class="sr-only" tabindex="-1" aria-label="Chọn file sao lưu .zip hoặc .json để khôi phục">' +
    '</div></section>' +

    /* ---- Sao lưu tự động ---- */
    '<section class="sheet" aria-labelledby="h-bk"><div class="sheet-head"><div><h2 id="h-bk" class="sheet-title">Bản sao lưu tự động</h2>' +
    '<p class="sheet-note">Tạo định kỳ khi đang làm việc và trước mỗi thao tác lớn: nhập Excel, khôi phục, xóa dữ liệu.</p></div>' +
    '<button type="button" class="btn btn-secondary btn-sm" data-act="backup-now">' + icon('save') + 'Sao lưu ngay</button></div>' +
    '<div id="bk-list" class="max-h-[360px] overflow-auto"><p class="px-5 pb-5 text-ink-3">Đang tải danh sách</p></div></section>' +

    /* ---- Người đang dùng máy này (ghi vào nhật ký thay đổi) ---- */
    '<section class="sheet" aria-labelledby="h-nd"><div class="sheet-head"><div><h2 id="h-nd" class="sheet-title">Người đang dùng máy này</h2>' +
    '<p class="sheet-note">Tên này được ghi vào <a class="font-semibold text-pen underline underline-offset-2" href="#/kiem-soat?tab=nhat-ky">nhật ký thay đổi</a> mỗi lần thêm, sửa, xóa. Chỉ lưu trên trình duyệt của máy này; mỗi máy đặt tên riêng. Để trống thì nhật ký ghi “không rõ”.</p></div></div>' +
    '<form id="nd-form" class="flex flex-wrap items-end gap-3 px-5 pb-5" autocomplete="off"><label class="field min-w-[240px] flex-1"><span class="label">Tên người thao tác</span>' +
    '<input name="nguoiDung" class="input" maxlength="60" value="' + esc(LS.get('nguoiDung', '')) + '" placeholder="VD: Thúy kế toán"></label>' +
    '<button type="submit" class="btn btn-secondary">' + icon('save') + 'Lưu tên</button></form></section>' +

    /* ---- Xóa dữ liệu ---- */
    '<section class="sheet border-alert/30 xl:col-span-2" aria-labelledby="h-xoa"><div class="sheet-head items-center"><div><h2 id="h-xoa" class="sheet-title">Bắt đầu sổ mới</h2>' +
    '<p class="sheet-note">Xóa các dòng sổ thu chi, hoặc xóa riêng dữ liệu chi phí công trình. Hai phần độc lập với nhau; dữ liệu cũ được sao lưu tự động ngay trước khi xóa.</p></div>' +
    '<div class="flex flex-wrap gap-2"><button type="button" class="btn btn-danger-ghost border border-alert/40" data-act="reset">' + icon('trash') + 'Xóa dữ liệu sổ thu chi</button>' +
    '<button type="button" class="btn btn-danger-ghost border border-alert/40" data-act="reset-costs">' + icon('trash') + 'Xóa dữ liệu chi phí công trình</button></div></div></section>' +

    '</div>';

  $('#st-form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fm = e.target;
    const data = {};
    ['tenDonVi', 'diaChi', 'giamDoc', 'keToanTruong', 'thuQuy', 'nguoiLap', 'hinhThucMacDinh'].forEach((k) => { data[k] = fm.elements[k].value.trim(); });
    data.hienKeToanTruong = fm.elements.hienKeToanTruong.checked;
    try { await api('PUT', '/api/settings', data); toast('Đã lưu thông tin in trên phiếu'); } catch (err) { showError(err); }
  });

  $('#nd-form', root).addEventListener('submit', (e) => {
    e.preventDefault();
    const v = e.target.elements.nguoiDung.value.replace(/\s+/g, ' ').trim().slice(0, 60);
    LS.set('nguoiDung', v);
    toast(v ? 'Từ giờ nhật ký ghi người thao tác là “' + v + '”' : 'Đã bỏ tên người thao tác');
  });

  // ---- nhập Excel ----
  const fileInput = $('#imp-file', root);
  const drop = $('#imp-drop', root);
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) previewImport(fileInput.files[0], root); });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const file = e.dataTransfer.files[0];
    if (file) previewImport(file, root);
  });

  // ---- khôi phục ----
  const restoreInput = $('#restore-file', root);
  restoreInput.addEventListener('change', async () => {
    const file = restoreInput.files[0];
    restoreInput.value = '';
    if (!file) return;
    if (/\.zip$/i.test(file.name)) {
      if (!(await confirmDialog({
        title: 'Khôi phục từ bản sao lưu đầy đủ',
        html: 'Khôi phục từ <b class="text-ink">' + esc(file.name) + '</b>?<p class="mt-2">Toàn bộ dữ liệu hiện tại sẽ được thay bằng dữ liệu trong file; ảnh chứng từ còn thiếu được chép lại. Phần mềm tự sao lưu dữ liệu hiện tại trước khi thay. Nhật ký thay đổi hiện có được giữ nguyên.</p>',
        okText: 'Khôi phục', danger: true
      }))) return;
      try { const r = await api('POST', '/api/restore-zip', await file.arrayBuffer(), true); toast('Đã khôi phục dữ liệu' + (r.copied ? ', chép lại ' + r.copied + ' file chứng từ' : '')); } catch (err) { showError(err); }
      return;
    }
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { return toast('File này không phải bản sao lưu của phần mềm', 'error'); }
    const n = (data.entries || []).length;
    if (!(await confirmDialog({
      title: 'Khôi phục dữ liệu',
      html: 'File sao lưu có <b class="text-ink">' + n + '</b> dòng sổ, <b class="text-ink">' + (data.projects || []).length + '</b> dự án, <b class="text-ink">' + (data.suppliers || []).length + '</b> nhà cung cấp.' +
        '<p class="mt-2">Toàn bộ dữ liệu hiện tại sẽ được thay thế. Phần mềm tự sao lưu dữ liệu hiện tại trước khi thay.</p>',
      okText: 'Khôi phục', danger: true
    }))) return;
    try { await api('POST', '/api/restore', data); toast('Đã khôi phục dữ liệu'); } catch (err) { showError(err); }
  });

  root.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const k = a.dataset.act;
    if (k === 'export-full') download('/api/export/full');
    else if (k === 'export-costs') download('/api/export/costs');
    else if (k === 'reset-costs') openResetCosts();
    else if (k === 'backup') { location.href = '/api/backup'; }
    else if (k === 'backup-zip') { location.href = '/api/backup-zip'; toast('Đang đóng gói bản sao lưu đầy đủ, file sẽ nằm trong thư mục Downloads', 'info'); }
    else if (k === 'restore') restoreInput.click();
    else if (k === 'backup-now') {
      try { await api('POST', '/api/backups/now'); toast('Đã tạo bản sao lưu'); loadBackups(root); } catch (err) { showError(err); }
    } else if (k === 'restore-bk') {
      const name = a.dataset.name;
      if (!(await confirmDialog({ title: 'Khôi phục bản sao lưu', html: 'Đưa dữ liệu về bản <b class="text-ink">' + esc(a.dataset.label || name) + '</b>?<p class="mt-2">Dữ liệu hiện tại được sao lưu trước khi thay thế.</p>', okText: 'Khôi phục', danger: true }))) return;
      try { await api('POST', '/api/backups/restore', { name }); toast('Đã khôi phục bản sao lưu'); } catch (err) { showError(err); }
    } else if (k === 'reset') openReset();
  });

  loadBackups(root);
}

function f(name, label, value, cls) {
  return '<label class="field ' + (cls || '') + '"><span class="label">' + esc(label) + '</span><input name="' + name + '" class="input" value="' + esc(value || '') + '"></label>';
}

function act(key, ic, title, desc) {
  return '<button type="button" class="flex w-full cursor-pointer items-start gap-3.5 rounded-lg border border-rule bg-sheet px-4 py-3 text-left transition-colors hover:border-[#C5D6EF] hover:bg-pen-soft" data-act="' + key + '">' +
    duo(ic, 'mt-0.5 text-[24px] text-cover') +
    '<span class="flex flex-col gap-0.5"><span class="font-semibold">' + esc(title) + '</span><span class="text-[13px] leading-snug text-ink-3">' + esc(desc) + '</span></span></button>';
}

const REASONS = {
  'tu-dong': 'Tự động',
  'thu-cong': 'Sao lưu thủ công',
  'truoc-nhap-excel': 'Trước khi nhập Excel',
  'truoc-gop-excel': 'Trước khi gộp Excel',
  'truoc-khoi-phuc': 'Trước khi khôi phục',
  'truoc-xoa-du-lieu': 'Trước khi xóa dữ liệu',
  'truoc-thay-the': 'Trước khi thay thế',
  'truoc-nhap-chi-phi': 'Trước khi nhập Excel chi phí',
  'truoc-gop-chi-phi': 'Trước khi gộp Excel chi phí',
  'truoc-xoa-chi-phi': 'Trước khi xóa dữ liệu chi phí',
  'truoc-nang-cap-v2': 'Trước khi nâng cấp phần mềm'
};

async function loadBackups(root) {
  const el = $('#bk-list', root);
  if (!el) return;
  try {
    const r = await api('GET', '/api/backups');
    if (!r.backups.length) { el.innerHTML = '<p class="px-5 pb-5 text-ink-3">Chưa có bản sao lưu nào. Bản đầu tiên được tạo khi bạn ghi sổ hoặc bấm “Sao lưu ngay”.</p>'; return; }
    el.innerHTML = '<table class="ledger ledger-compact"><thead><tr><th>Thời điểm</th><th>Lý do</th><th class="num">Dung lượng</th><th><span class="sr-only">Thao tác</span></th></tr></thead><tbody>' +
      r.backups.slice(0, 15).map((b) => {
        const m = /ketoan-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-?(.*)\.json$/.exec(b.name) || [];
        const when = m[1] ? m[3] + '/' + m[2] + '/' + m[1] + ' lúc ' + m[4] + ':' + m[5] : b.name;
        return '<tr><td class="whitespace-nowrap tabular-nums">' + esc(when) + '</td><td class="text-ink-2">' + esc(REASONS[m[7]] || m[7] || '') + '</td>' +
          '<td class="num text-ink-2">' + Math.max(1, Math.round(b.size / 1024)) + ' KB</td>' +
          '<td class="text-right"><button type="button" class="btn btn-ghost btn-sm" data-act="restore-bk" data-name="' + esc(b.name) + '" data-label="' + esc(when) + '">' + icon('history') + 'Khôi phục</button></td></tr>';
      }).join('') + '</tbody></table>' +
      (r.backups.length > 15 ? '<p class="px-5 py-3 text-[12.5px] text-ink-3">Còn ' + (r.backups.length - 15) + ' bản cũ hơn trong thư mục data/backups.</p>' : '');
  } catch (err) {
    el.innerHTML = '<p class="px-5 pb-5 text-alert">' + esc(err.message) + '</p>';
  }
}

async function previewImport(file, root) {
  const box = $('#imp-preview', root);
  box.innerHTML = '<p class="mt-3 flex items-center gap-2 text-ink-2" role="status">' + icon('spinner', 'animate-spin text-[18px]') + 'Đang đọc file ' + esc(file.name) + '. File lớn có thể mất vài giây…</p>';
  let buf;
  try {
    buf = await file.arrayBuffer();
    const r = await api('POST', '/api/import?dryRun=1', buf, true);
    const p = r.preview;
    if (p.kind === 'chi-phi') return previewCostImport(file, buf, p, box, root);
    const st = p.stats;
    box.innerHTML =
      '<div class="mt-4 rounded-[10px] border border-rule p-4">' +
      '<div class="flex items-center gap-2 font-semibold">' + icon('check', 'text-income') + esc(file.name) + '</div>' +
      '<p class="mt-0.5 text-[12.5px] text-ink-3">Đọc được từ các sheet: ' + esc(st.sheets.join(', ')) + '</p>' +
      '<dl class="mt-3 grid grid-cols-3 gap-2 max-sm:grid-cols-2">' +
      stat('Dòng sổ thu chi', st.soDong) + stat('Dự án', st.soDuAn) + stat('Nhà cung cấp', st.soNCC) +
      stat('Tổng thu', money(st.tongThu)) + stat('Tổng chi', money(st.tongChi)) + stat('Tồn quỹ', money(st.tonQuy)) +
      '</dl>' +
      (p.warnings.length ? '<details class="mt-3 text-[13px]"><summary class="cursor-pointer font-semibold text-caution">' + p.warnings.length + ' điều cần biết khi đọc file</summary>' +
        '<ul class="mt-2 max-h-40 list-disc overflow-auto pl-5 text-ink-2">' + p.warnings.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul></details>' : '') +
      '<div class="mt-4 flex flex-wrap items-center gap-2">' +
      '<button type="button" class="btn btn-ghost" data-imp="cancel">Hủy</button><span class="flex-1"></span>' +
      '<button type="button" class="btn btn-secondary" data-imp="merge" title="Giữ dữ liệu hiện có, chỉ thêm các dòng, dự án, nhà cung cấp chưa có">Gộp thêm vào dữ liệu hiện có</button>' +
      '<button type="button" class="btn btn-primary" data-imp="replace">Thay toàn bộ dữ liệu</button>' +
      '</div></div>';
  } catch (err) {
    box.innerHTML = '<p class="mt-3 rounded-lg bg-alert-soft px-4 py-3 text-alert">' + esc(err.message) + '</p>';
    return;
  }
  box.onclick = async (e) => {
    const b = e.target.closest('[data-imp]');
    if (!b) return;
    if (b.dataset.imp === 'cancel') { box.innerHTML = ''; $('#imp-file', root).value = ''; return; }
    const mode = b.dataset.imp;
    if (mode === 'replace' && !(await confirmDialog({
      title: 'Thay toàn bộ dữ liệu',
      html: 'Dữ liệu hiện có (<b class="text-ink">' + S.all.entries.length + '</b> dòng sổ) sẽ được thay bằng dữ liệu trong file Excel.<p class="mt-2">Phần mềm tự sao lưu dữ liệu cũ trước khi thay.</p>',
      okText: 'Thay dữ liệu', danger: true
    }))) return;
    const done = busy(b, 'Đang nhập…');
    box.querySelectorAll('[data-imp]').forEach((x) => { x.disabled = true; });
    try {
      const r = await api('POST', '/api/import?mode=' + mode, buf, true);
      const a = r.result.added;
      toast('Đã nhập ' + a.entries + ' dòng sổ, ' + a.projects + ' dự án, ' + a.suppliers + ' nhà cung cấp' + (r.result.skipped ? '. Bỏ qua ' + r.result.skipped + ' dòng trùng' : ''));
    } catch (err) { showError(err); }
    if (b.isConnected) { done(); box.querySelectorAll('[data-imp]').forEach((x) => { x.disabled = false; }); }
  };
}

function stat(label, value) {
  return '<div class="rounded-lg bg-paper px-3 py-2"><dt class="text-[12px] text-ink-3">' + esc(label) + '</dt><dd class="text-[16px] font-semibold tabular-nums">' + esc(String(value)) + '</dd></div>';
}

function openReset() {
  return openModal({
    title: 'Xóa dữ liệu sổ',
    size: 'small',
    body: '<p class="leading-relaxed text-ink-2">Thao tác này xóa toàn bộ <b class="text-ink">' + S.all.entries.length + ' dòng sổ thu chi</b>. Một bản sao lưu được tạo ngay trước khi xóa.</p>' +
      '<label class="check mt-4"><input type="checkbox" id="rs-keep" checked>Giữ lại danh mục dự án và nhà cung cấp</label>' +
      '<label class="field mt-4"><span class="label">Gõ chữ XOA để xác nhận</span><input id="rs-confirm" class="input" autocomplete="off"></label>',
    footer: '<span class="flex-1"></span><button type="button" class="btn btn-ghost" data-act="no">Hủy</button><button type="button" class="btn btn-danger" data-act="yes" disabled>Xóa dữ liệu sổ</button>',
    onMount(el, h) {
      const inp = $('#rs-confirm', el);
      const yes = el.querySelector('[data-act=yes]');
      inp.addEventListener('input', () => { yes.disabled = inp.value.trim().toUpperCase() !== 'XOA'; });
      el.querySelector('[data-act=no]').addEventListener('click', () => h.close());
      yes.addEventListener('click', async () => {
        try {
          await api('POST', '/api/reset', { confirm: 'XOA', keepCatalogs: $('#rs-keep', el).checked });
          toast('Đã xóa dữ liệu sổ. Bản sao lưu nằm trong mục Bản sao lưu tự động.');
          h.close();
        } catch (err) { showError(err); }
      });
      setTimeout(() => inp.focus(), 50);
    }
  });
}

/* ---------------- Nhập file Excel chi phí công trình ---------------- */
function previewCostImport(file, buf, p, box, root) {
  const st = p.stats;
  const projOpts = (sel) => p.projects.map((x) => '<option value="' + esc(x.ma) + '"' + (sel === x.ma ? ' selected' : '') + '>Ghép vào ' + esc(x.ma + ' — ' + x.ten) + '</option>').join('');
  box.innerHTML =
    '<div class="mt-4 rounded-[10px] border border-rule p-4">' +
    '<div class="flex flex-wrap items-center gap-2 font-semibold">' + icon('check', 'text-income') + esc(file.name) + ' <span class="pill">File chi phí công trình</span></div>' +
    '<p class="mt-0.5 text-[12.5px] text-ink-3">Đọc được từ các sheet: ' + esc(st.sheets.join(', ')) + '</p>' +
    '<dl class="mt-3 grid grid-cols-3 gap-2 max-sm:grid-cols-2">' +
    stat('Dòng chi phí', st.soDong) + stat('Tổng chi phí', money(st.tongChiPhi)) + stat('Vật tư', money(st.byLoai['Vật tư'] || 0)) +
    stat('Nhân công', money(st.byLoai['Nhân công'] || 0)) + stat('Dịch vụ-Phí', money(st.byLoai['Dịch vụ-Phí'] || 0)) + stat('Hạng mục / nhóm', st.soHangMuc + ' / ' + st.soNhom) +
    stat('Mã vật tư', st.soVatTu) + stat('Nhà cung cấp', st.soNCC) + stat('Nhà / khu', st.soNha) +
    '</dl>' +
    (st.trungKhiGop ? '<p class="mt-2 text-[13px] text-ink-2">' + icon('info', 'mr-1 align-[-3px] text-pen') + st.trungKhiGop + ' dòng chi phí đã có sẵn trong phần mềm sẽ được bỏ qua khi gộp.</p>' : '') +
    '<h3 class="mt-4 text-[13.5px] font-semibold">Mã công trình trong file</h3>' +
    '<p class="text-[12.5px] text-ink-3">Công trình trong phần mềm chính là dự án trong danh mục dự án. Ghép đúng mã để sổ chi phí và sổ thu chi nối được với nhau (công nợ nhà cung cấp).</p>' +
    '<table class="ledger ledger-compact mt-2"><thead><tr><th>Mã trong file</th><th>Dữ liệu</th><th>Xử lý</th></tr></thead><tbody>' +
    p.ctCodes.map((c) => '<tr><td><span class="code">' + esc(c.ma) + '</span>' + (c.ten ? '<div class="sub">' + esc(c.ten) + '</div>' : '') + '</td>' +
      '<td class="text-[12.5px] text-ink-2">' + [c.soDong ? c.soDong + ' dòng chi phí' : '', c.soQuy ? c.soQuy + ' dòng SO_QUY' : '', 'có trong ' + c.nguon.join(', ')].filter(Boolean).join(' · ') + '</td>' +
      '<td><select class="input input-sm min-w-[240px]" data-ct="' + esc(c.ma) + '" aria-label="Xử lý mã ' + esc(c.ma) + '">' +
      (c.coSan ? '<option value="' + esc(c.ma) + '" selected>Đã có trong danh mục (' + esc(c.ma) + ')</option>' : '<option value="__new__"' + (c.macDinh === '__new__' ? ' selected' : '') + '>Thêm công trình mới ' + esc(c.ma) + '</option>') +
      projOpts(c.coSan ? '' : c.macDinh) +
      '<option value="__skip__"' + (c.macDinh === '__skip__' ? ' selected' : '') + '>Bỏ qua (không nhập dữ liệu của mã này)</option></select>' +
      (c.goiY ? '<div class="hint good">Gợi ý theo tên: ' + esc(c.goiY) + '</div>' : '') + '</td></tr>').join('') + '</tbody></table>' +
    (st.soQuy.soDong ? '<label class="check mt-4 items-start"><input type="checkbox" id="imp-soquy" class="mt-0.5"><span>Nhập cả sheet SO_QUY (' + st.soQuy.soDong + ' dòng, chi ' + money(st.soQuy.tongChi) + ' đ' + (st.soQuy.tongThu ? ', thu ' + money(st.soQuy.tongThu) + ' đ' : '') + ') vào Sổ thu chi' +
      '<span class="block text-[12.5px] text-ink-3">Chỉ chọn khi các khoản trả tiền này CHƯA được ghi trong Sổ thu chi của phần mềm, nếu không sẽ bị tính trùng tồn quỹ và công nợ. Dòng trùng hoàn toàn được bỏ qua.</span></span></label>' : '') +
    (p.warnings.length ? '<details class="mt-3 text-[13px]"><summary class="cursor-pointer font-semibold text-caution">' + p.warnings.length + ' điều cần biết khi đọc file</summary>' +
      '<ul class="mt-2 max-h-48 list-disc overflow-auto pl-5 text-ink-2">' + p.warnings.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul></details>' : '') +
    '<div class="mt-4 flex flex-wrap items-center gap-2">' +
    '<button type="button" class="btn btn-ghost" data-imp="cancel">Hủy</button><span class="flex-1"></span>' +
    '<button type="button" class="btn btn-secondary" data-imp="merge" title="Giữ dữ liệu hiện có, chỉ thêm dòng, hạng mục, vật tư... chưa có">Gộp thêm vào dữ liệu hiện có</button>' +
    '<button type="button" class="btn btn-primary" data-imp="replace" title="Thay sổ chi phí và danh mục chi phí bằng dữ liệu trong file. Sổ thu chi không bị động tới.">Thay toàn bộ dữ liệu chi phí</button>' +
    '</div></div>';
  box.onclick = async (e) => {
    const b = e.target.closest('[data-imp]');
    if (!b) return;
    if (b.dataset.imp === 'cancel') { box.innerHTML = ''; $('#imp-file', root).value = ''; return; }
    const mode = b.dataset.imp;
    const map = {};
    box.querySelectorAll('select[data-ct]').forEach((sel) => { map[sel.dataset.ct] = sel.value; });
    const soQuy = !!(box.querySelector('#imp-soquy') && box.querySelector('#imp-soquy').checked);
    if (mode === 'replace' && !(await confirmDialog({
      title: 'Thay toàn bộ dữ liệu chi phí',
      html: 'Sổ chi phí hiện có (<b class="text-ink">' + S.all.costs.length + '</b> dòng) và danh mục chi phí sẽ được thay bằng dữ liệu trong file. Sổ thu chi, danh mục dự án và nhà cung cấp được giữ nguyên.' +
        '<p class="mt-2">Phần mềm tự sao lưu dữ liệu cũ trước khi thay.</p>',
      okText: 'Thay dữ liệu chi phí', danger: true
    }))) return;
    const done = busy(b, 'Đang nhập…');
    box.querySelectorAll('[data-imp]').forEach((x) => { x.disabled = true; });
    try {
      const r = await api('POST', '/api/import?mode=' + mode + (soQuy ? '&soQuy=1' : '') + '&map=' + encodeURIComponent(JSON.stringify(map)), buf, true);
      const a = r.result.added;
      toast('Đã nhập ' + a.costs + ' dòng chi phí, ' + a.materials + ' vật tư, ' + a.items + ' hạng mục' + (a.entries ? ', ' + a.entries + ' dòng sổ thu chi' : '') +
        (r.result.skipped ? '. Bỏ qua ' + r.result.skipped + ' dòng trùng' : ''));
    } catch (err) {
      showError(err);
      if (b.isConnected) { done(); box.querySelectorAll('[data-imp]').forEach((x) => { x.disabled = false; }); }
    }
  };
}

function openResetCosts() {
  return openModal({
    title: 'Xóa dữ liệu chi phí công trình',
    size: 'small',
    body: '<p class="leading-relaxed text-ink-2">Thao tác này xóa toàn bộ <b class="text-ink">' + S.all.costs.length + ' dòng chi phí</b>. Sổ thu chi không bị ảnh hưởng. Một bản sao lưu được tạo ngay trước khi xóa.</p>' +
      '<label class="check mt-4"><input type="checkbox" id="rc-keep" checked>Giữ lại vật tư và nhà</label>' +
      '<label class="field mt-4"><span class="label">Gõ chữ XOA để xác nhận</span><input id="rc-confirm" class="input" autocomplete="off"></label>',
    footer: '<span class="flex-1"></span><button type="button" class="btn btn-ghost" data-act="no">Hủy</button><button type="button" class="btn btn-danger" data-act="yes" disabled>Xóa dữ liệu chi phí</button>',
    onMount(el, h) {
      const inp = $('#rc-confirm', el);
      const yes = el.querySelector('[data-act=yes]');
      inp.addEventListener('input', () => { yes.disabled = inp.value.trim().toUpperCase() !== 'XOA'; });
      el.querySelector('[data-act=no]').addEventListener('click', () => h.close());
      yes.addEventListener('click', async () => {
        try {
          await api('POST', '/api/reset-costs', { confirm: 'XOA', keepCatalogs: $('#rc-keep', el).checked });
          toast('Đã xóa dữ liệu chi phí. Bản sao lưu nằm trong mục Bản sao lưu tự động.');
          h.close();
        } catch (err) { showError(err); }
      });
      setTimeout(() => inp.focus(), 50);
    }
  });
}
