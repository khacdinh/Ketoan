/* Đăng nhập và phân quyền ở giao diện (kiểm quyền THẬT nằm ở máy chủ — lib/quyen.js; ở đây chỉ ẩn / khóa nút cho tiện).
 * - Màn hình đăng nhập (khi đăng nhập đang bật mà chưa có phiên), đổi mật khẩu bắt buộc, quên mật khẩu.
 * - Hết phiên giữa chừng: hộp đăng nhập lại hiện NGAY trên màn hình đang dùng (dữ liệu đang gõ còn nguyên), đăng nhập xong thì
 *   gửi tiếp đúng thao tác đang dở (ui.js api() thử lại).
 * - Khung tên người đăng nhập + vai trò + Đăng xuất ở góc trên. */
import { $, esc, icon, toast, openModal, busy, attachMenu, onAuthNeeded } from './ui.js';

export const A = { bat: false, nguoiDung: null, quyen: new Set(), tenNguoi: {}, phien: null, cauHinh: {}, vaiTro: {}, coTaiKhoan: false, nhanLuc: 0 };

const nghe = [];
export function onAuthChange(fn) { nghe.push(fn); }

function apDung(d) {
  A.bat = !!d.bat;
  A.nguoiDung = d.nguoiDung || null;
  A.quyen = new Set(d.quyen || []);
  A.tenNguoi = d.tenNguoi || {};
  A.phien = d.phien || null;
  A.cauHinh = d.cauHinh || {};
  A.vaiTro = d.vaiTro || {};
  A.coTaiKhoan = !!d.coTaiKhoan;
  A.nhanLuc = Date.now();
  document.body.dataset.vai = A.bat && A.nguoiDung ? A.nguoiDung.vaiTro : '';
  veUserBox();
  nghe.forEach((f) => { try { f(A); } catch (e) { /* bỏ qua */ } });
}

// Đọc trạng thái (không qua api() để không vòng lặp đăng nhập lại)
export async function napTrangThai() {
  const r = await fetch('/api/auth/trang-thai', { headers: { Accept: 'application/json' } });
  const d = await r.json();
  apDung(d);
  return d;
}
// Gọi sau mọi trả lời của /api/auth/* có trạng thái mới
export function capNhat(d) { if (d && typeof d.bat === 'boolean') apDung(d); }

// Có được làm hành động này không (đăng nhập tắt: được tất cả)
export function coQuyen(hd) { return !A.bat || A.quyen.has(hd); }
export const laChu = () => !A.bat || (A.nguoiDung && A.nguoiDung.vaiTro === 'chu');

// Tên hiển thị của người tạo / người sửa một bản ghi
export function tenNguoi(v) {
  if (v == null || v === '') return 'Dữ liệu cũ';
  if (/^\d+$/.test(String(v))) return A.tenNguoi[v] || 'Người dùng số ' + v;
  return String(v);
}

/* ---------------- ô mật khẩu: hiện / ẩn, báo Caps Lock ---------------- */
let pwSeq = 0;
export function oMatKhau(name, label, opts) {
  opts = opts || {};
  const id = 'pw-' + (++pwSeq);
  return '<label class="field' + (opts.cls ? ' ' + opts.cls : '') + '" for="' + id + '"><span class="label">' + esc(label) + (opts.req ? ' <b class="req">*</b>' : '') + '</span>' +
    '<span class="pw-wrap"><input id="' + id + '" type="password" name="' + name + '" class="input" autocomplete="' + (opts.ac || 'current-password') + '" maxlength="200"' + (opts.autofocus ? ' autofocus' : '') + '>' +
    '<button type="button" class="pw-toggle" data-pw-toggle aria-label="Hiện mật khẩu" aria-pressed="false" title="Hiện / ẩn mật khẩu">' + icon('eye') + '</button></span>' +
    '<span class="caps-warn" hidden>' + icon('warnTri') + 'Đang bật Caps Lock (chữ hoa)</span>' +
    (opts.hint ? '<span class="hint">' + esc(opts.hint) + '</span>' : '') + '</label>';
}
export function ganOMatKhau(root) {
  root.querySelectorAll('[data-pw-toggle]').forEach((b) => {
    b.addEventListener('click', () => {
      const inp = b.parentNode.querySelector('input');
      const hien = inp.type === 'password';
      inp.type = hien ? 'text' : 'password';
      b.setAttribute('aria-pressed', String(hien));
      b.setAttribute('aria-label', hien ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
      b.innerHTML = icon(hien ? 'eyeSlash' : 'eye');
      inp.focus();
    });
  });
  root.querySelectorAll('.pw-wrap input').forEach((inp) => {
    const warn = inp.closest('.field').querySelector('.caps-warn');
    const check = (e) => { if (e.getModifierState) warn.hidden = !e.getModifierState('CapsLock'); };
    inp.addEventListener('keydown', check);
    inp.addEventListener('keyup', check);
    inp.addEventListener('blur', () => { warn.hidden = true; });
  });
}

function hienLoi(box, msg) { box.hidden = !msg; box.innerHTML = msg ? icon('warn') + '<span>' + esc(msg) + '</span>' : ''; }

// Gọi API xác thực trực tiếp (không qua cơ chế đăng nhập lại của api())
async function goi(method, url, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  let d = {};
  try { d = await r.json(); } catch (e) { d = { ok: false, error: 'Máy chủ trả về dữ liệu không hợp lệ (mã ' + r.status + ')' }; }
  if (!r.ok || d.ok === false) throw Object.assign(new Error(d.error || 'Lỗi ' + r.status), { status: r.status, data: d });
  return d;
}

/* ---------------- màn hình đăng nhập ---------------- */
let dangMo = null; // Promise của lần đăng nhập đang hiện (nhiều yêu cầu cùng hết phiên chỉ mở một hộp)

// opts.lai: đăng nhập lại khi hết phiên (hiện đè lên màn hình đang dùng, không xóa gì)
export function dangNhap(opts) {
  if (dangMo) return dangMo;
  opts = opts || {};
  dangMo = new Promise((resolve) => {
    const root = $('#auth-root');
    const tenCu = opts.ten || (A.nguoiDung && A.nguoiDung.tenDangNhap) || '';
    const wrap = document.createElement('div');
    wrap.className = 'auth-screen' + (opts.lai ? ' lai' : '');
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'dn-tieu-de');
    root.appendChild(wrap);
    const veDangNhap = (thongBao) => {
      wrap.innerHTML = '<form class="auth-card" id="dn-form" novalidate autocomplete="on">' +
        '<div class="auth-brand"><span class="logo">' + icon('notebook') + '</span><div><div class="text-[16px] font-bold">Sổ Thu Chi</div><div class="text-[12.5px] text-ink-3">Phần mềm kế toán</div></div></div>' +
        '<h1 id="dn-tieu-de">' + (opts.lai ? 'Phiên đăng nhập đã hết hạn' : 'Đăng nhập') + '</h1>' +
        (opts.lai ? '<p class="mt-1 text-[13.5px] text-ink-2">Dữ liệu bạn đang nhập vẫn còn nguyên. Đăng nhập lại để lưu tiếp.</p>' : '') +
        (thongBao ? '<p class="mt-2 rounded-md bg-pen-soft px-3 py-2 text-[13px] text-ink-2">' + esc(thongBao) + '</p>' : '') +
        '<div class="mt-4 flex flex-col gap-3">' +
        '<label class="field"><span class="label">Tên đăng nhập</span><input name="ten" class="input" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="60" value="' + esc(tenCu) + '"' + (tenCu ? '' : ' autofocus') + '></label>' +
        oMatKhau('mk', 'Mật khẩu', { autofocus: !!tenCu }) +
        '<p class="form-error" id="dn-loi" role="alert" hidden></p>' +
        '<button type="submit" class="btn btn-primary w-full justify-center">' + icon('check') + 'Đăng nhập</button>' +
        '<button type="button" class="self-start text-[13px] font-semibold text-pen underline underline-offset-2" data-act="quen">Quên mật khẩu?</button>' +
        (opts.lai ? '<button type="button" class="self-start text-[13px] text-ink-3 underline underline-offset-2" data-act="bo">Đăng nhập tài khoản khác (bỏ thao tác đang dở)</button>' : '') +
        '</div></form>';
      ganOMatKhau(wrap);
      const fm = $('#dn-form', wrap);
      const loi = $('#dn-loi', wrap);
      setTimeout(() => { const f = fm.querySelector('[autofocus]'); if (f) f.focus(); }, 20);
      fm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ten = fm.elements.ten.value.trim();
        const mk = fm.elements.mk.value;
        if (!ten) { hienLoi(loi, 'Nhập tên đăng nhập'); fm.elements.ten.focus(); return; }
        if (!mk) { hienLoi(loi, 'Nhập mật khẩu'); fm.elements.mk.focus(); return; }
        const done = busy(fm.querySelector('[type=submit]'), 'Đang đăng nhập…');
        try {
          const d = await goi('POST', '/api/auth/dang-nhap', { tenDangNhap: ten, matKhau: mk });
          fm.elements.mk.value = '';
          apDung(d);
          if (A.nguoiDung && A.nguoiDung.phaiDoiMatKhau) { veDoiBatBuoc(wrap, xong); return; }
          xong();
        } catch (err) {
          done();
          fm.elements.mk.value = '';
          hienLoi(loi, err.message);
          fm.elements.mk.focus();
        }
      });
      wrap.querySelector('[data-act=quen]').addEventListener('click', () => veQuen(wrap, fm.elements.ten.value.trim(), veDangNhap));
      const bo = wrap.querySelector('[data-act=bo]');
      if (bo) bo.addEventListener('click', () => { location.reload(); });
    };
    const xong = () => { wrap.remove(); dangMo = null; resolve(true); };
    veDangNhap(opts.thongBao);
  });
  return dangMo;
}

/* ---------------- đổi mật khẩu ---------------- */
function formDoi(batBuoc) {
  return '<div class="flex flex-col gap-3">' +
    (batBuoc ? '<p class="rounded-md bg-caution-soft px-3 py-2 text-[13px] text-ink">' + icon('info') + ' Mật khẩu của bạn vừa được đặt bởi người quản trị (hoặc đã quá cũ). Hãy đặt mật khẩu MỚI của riêng bạn để tiếp tục.</p>' : '') +
    oMatKhau('cu', 'Mật khẩu hiện tại', { req: true, autofocus: true }) +
    oMatKhau('moi', 'Mật khẩu mới', { req: true, ac: 'new-password', hint: 'Ít nhất 8 ký tự; gõ tiếng Việt có dấu được. Nên dùng một câu ngắn dễ nhớ, vd "nhà em ở Đà Nẵng 2026".' }) +
    oMatKhau('moi2', 'Nhập lại mật khẩu mới', { req: true, ac: 'new-password' }) +
    '<p class="form-error" id="dmk-loi" role="alert" hidden></p></div>';
}
async function guiDoi(root, fm) {
  const loi = $('#dmk-loi', root);
  const b = { matKhauCu: fm.querySelector('[name=cu]').value, matKhauMoi: fm.querySelector('[name=moi]').value, matKhauMoi2: fm.querySelector('[name=moi2]').value };
  if (!b.matKhauCu || !b.matKhauMoi) { hienLoi(loi, 'Nhập đủ mật khẩu hiện tại và mật khẩu mới'); return false; }
  if (b.matKhauMoi !== b.matKhauMoi2) { hienLoi(loi, 'Hai lần nhập mật khẩu mới không khớp'); return false; }
  try {
    const d = await goi('POST', '/api/auth/doi-mat-khau', b);
    apDung(d);
    toast('Đã đổi mật khẩu');
    return true;
  } catch (err) { hienLoi(loi, err.message); return false; }
}
function veDoiBatBuoc(wrap, xong) {
  wrap.innerHTML = '<form class="auth-card" id="dmk-form" novalidate><h1 id="dn-tieu-de">Đổi mật khẩu</h1>' +
    '<p class="mt-1 text-[13.5px] text-ink-2">' + esc(A.nguoiDung.hoTen) + ' (' + esc(A.nguoiDung.tenDangNhap) + ')</p><div class="mt-4">' + formDoi(true) + '</div>' +
    '<div class="mt-4 flex items-center gap-2"><button type="button" class="btn btn-ghost" data-act="thoat">Đăng xuất</button><span class="flex-1"></span>' +
    '<button type="submit" class="btn btn-primary">' + icon('check') + 'Đổi mật khẩu</button></div></form>';
  ganOMatKhau(wrap);
  const fm = $('#dmk-form', wrap);
  setTimeout(() => fm.querySelector('[name=cu]').focus(), 20);
  fm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const done = busy(fm.querySelector('[type=submit]'), 'Đang lưu…');
    if (await guiDoi(wrap, fm)) xong(); else done();
  });
  wrap.querySelector('[data-act=thoat]').addEventListener('click', dangXuat);
}
// Đổi mật khẩu bắt buộc khi mở phần mềm (người dùng vừa được Chủ đặt lại mật khẩu)
export function doiMatKhauBatBuoc() {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'auth-screen';
    $('#auth-root').appendChild(wrap);
    veDoiBatBuoc(wrap, () => { wrap.remove(); resolve(true); });
  });
}
export function moDoiMatKhau() {
  openModal({
    title: 'Đổi mật khẩu', size: 'small',
    body: '<form id="dmk-form" novalidate>' + formDoi(false) + '<button type="submit" hidden></button></form>',
    footer: '<button type="button" class="btn btn-ghost" data-act="no">Hủy</button><button type="button" class="btn btn-primary" data-act="yes">' + icon('check') + 'Đổi mật khẩu</button>',
    onMount(el, h) {
      ganOMatKhau(el);
      const fm = $('#dmk-form', el);
      const go = async () => { const done = busy(el.querySelector('[data-act=yes]'), 'Đang lưu…'); if (await guiDoi(el, fm)) h.close(); else done(); };
      fm.addEventListener('submit', (e) => { e.preventDefault(); go(); });
      el.querySelector('[data-act=yes]').addEventListener('click', go);
      el.querySelector('[data-act=no]').addEventListener('click', () => h.close());
    }
  });
}

/* ---------------- quên mật khẩu (mã ghi vào file trên máy chủ) ---------------- */
function veQuen(wrap, ten, quayLai) {
  wrap.innerHTML = '<form class="auth-card" id="qmk-form" novalidate><h1 id="dn-tieu-de">Quên mật khẩu</h1>' +
    '<p class="mt-1 text-[13.5px] leading-relaxed text-ink-2">Phần mềm sẽ ghi một <b>mã khôi phục</b> vào file trên máy đang chạy phần mềm (không gửi đi đâu). Mở file đó để lấy mã.</p>' +
    '<div class="mt-4 flex flex-col gap-3"><label class="field"><span class="label">Tên đăng nhập</span><input name="ten" class="input" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="60" value="' + esc(ten || '') + '"></label>' +
    '<button type="button" class="btn btn-secondary" data-act="lay-ma">' + icon('notePencil') + 'Lấy mã khôi phục</button>' +
    '<p class="hidden rounded-md bg-pen-soft px-3 py-2 text-[13px] text-ink-2" id="qmk-tb" role="status"></p>' +
    '<label class="field"><span class="label">Mã khôi phục</span><input name="ma" class="input font-mono uppercase tracking-wider" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" maxlength="40" placeholder="VD ABCDE-FGHJK"></label>' +
    oMatKhau('moi', 'Mật khẩu mới', { ac: 'new-password', hint: 'Ít nhất 8 ký tự.' }) + oMatKhau('moi2', 'Nhập lại mật khẩu mới', { ac: 'new-password' }) +
    '<p class="form-error" id="qmk-loi" role="alert" hidden></p>' +
    '<button type="submit" class="btn btn-primary justify-center">' + icon('check') + 'Đặt lại mật khẩu</button>' +
    '<div class="flex flex-wrap gap-x-4 gap-y-1 text-[13px]"><button type="button" class="font-semibold text-pen underline underline-offset-2" data-act="ve">← Quay lại đăng nhập</button>' +
    '<button type="button" class="text-ink-3 underline underline-offset-2" data-act="du-phong">Dùng mã dự phòng của Chủ</button></div></div></form>';
  ganOMatKhau(wrap);
  const fm = $('#qmk-form', wrap);
  const loi = $('#qmk-loi', wrap);
  setTimeout(() => fm.elements.ten.focus(), 20);
  wrap.querySelector('[data-act=ve]').addEventListener('click', () => quayLai());
  wrap.querySelector('[data-act=du-phong]').addEventListener('click', () => veDuPhong(wrap, fm.elements.ten.value.trim(), quayLai));
  wrap.querySelector('[data-act=lay-ma]').addEventListener('click', async (e) => {
    const ten2 = fm.elements.ten.value.trim();
    if (!ten2) { hienLoi(loi, 'Nhập tên đăng nhập trước'); fm.elements.ten.focus(); return; }
    const done = busy(e.currentTarget, 'Đang tạo mã…');
    try {
      const d = await goi('POST', '/api/auth/quen-mat-khau', { tenDangNhap: ten2 });
      const tb = $('#qmk-tb', wrap);
      tb.textContent = d.thongBao;
      tb.classList.remove('hidden');
      hienLoi(loi, '');
      fm.elements.ma.focus();
    } catch (err) { hienLoi(loi, err.message); } finally { done(); }
  });
  fm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = { tenDangNhap: fm.elements.ten.value.trim(), ma: fm.elements.ma.value, matKhauMoi: fm.elements.moi.value, matKhauMoi2: fm.elements.moi2.value };
    if (!b.tenDangNhap || !b.ma || !b.matKhauMoi) { hienLoi(loi, 'Nhập tên đăng nhập, mã khôi phục và mật khẩu mới'); return; }
    if (b.matKhauMoi !== b.matKhauMoi2) { hienLoi(loi, 'Hai lần nhập mật khẩu mới không khớp'); return; }
    const done = busy(fm.querySelector('[type=submit]'), 'Đang đặt lại…');
    try {
      const d = await goi('POST', '/api/auth/dat-lai-bang-ma', b);
      quayLai(d.thongBao);
    } catch (err) { done(); hienLoi(loi, err.message); }
  });
}

function veDuPhong(wrap, ten, quayLai) {
  wrap.innerHTML = '<form class="auth-card" id="dp-form" novalidate><h1 id="dn-tieu-de">Dùng mã dự phòng</h1>' +
    '<p class="mt-1 text-[13.5px] leading-relaxed text-ink-2">Mã dự phòng là mã 20 ký tự hiện ra MỘT lần khi bật đăng nhập (đã in hoặc chép cất đi). Dùng được để đặt lại mật khẩu của một tài khoản <b>Chủ</b>. Dùng xong, phần mềm cấp mã dự phòng mới.</p>' +
    '<div class="mt-4 flex flex-col gap-3"><label class="field"><span class="label">Tên đăng nhập (tài khoản Chủ)</span><input name="ten" class="input" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="60" value="' + esc(ten || '') + '"></label>' +
    '<label class="field"><span class="label">Mã dự phòng</span><input name="ma" class="input font-mono uppercase tracking-wider" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="60" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"></label>' +
    oMatKhau('moi', 'Mật khẩu mới', { ac: 'new-password' }) + oMatKhau('moi2', 'Nhập lại mật khẩu mới', { ac: 'new-password' }) +
    '<p class="form-error" id="dp-loi" role="alert" hidden></p>' +
    '<button type="submit" class="btn btn-primary justify-center">' + icon('check') + 'Đặt lại mật khẩu</button>' +
    '<button type="button" class="self-start text-[13px] font-semibold text-pen underline underline-offset-2" data-act="ve">← Quay lại đăng nhập</button></div></form>';
  ganOMatKhau(wrap);
  const fm = $('#dp-form', wrap);
  const loi = $('#dp-loi', wrap);
  setTimeout(() => fm.elements.ten.focus(), 20);
  wrap.querySelector('[data-act=ve]').addEventListener('click', () => quayLai());
  fm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = { tenDangNhap: fm.elements.ten.value.trim(), maDuPhong: fm.elements.ma.value, matKhauMoi: fm.elements.moi.value, matKhauMoi2: fm.elements.moi2.value };
    if (!b.tenDangNhap || !b.maDuPhong || !b.matKhauMoi) { hienLoi(loi, 'Nhập đủ tên đăng nhập, mã dự phòng và mật khẩu mới'); return; }
    if (b.matKhauMoi !== b.matKhauMoi2) { hienLoi(loi, 'Hai lần nhập mật khẩu mới không khớp'); return; }
    const done = busy(fm.querySelector('[type=submit]'), 'Đang đặt lại…');
    try {
      const d = await goi('POST', '/api/auth/dung-ma-du-phong', b);
      await hienMaDuPhong(d.maDuPhong, 'Mã dự phòng MỚI');
      quayLai(d.thongBao);
    } catch (err) { done(); hienLoi(loi, err.message); }
  });
}

// Hiện mã dự phòng MỘT lần, bắt xác nhận đã lưu (không đóng được khi chưa tích)
export function hienMaDuPhong(ma, tieuDe) {
  return new Promise((resolve) => {
    openModal({
      title: tieuDe || 'Mã khôi phục dự phòng', size: 'small', dismissible: false,
      body: '<p class="text-[13.5px] leading-relaxed text-ink-2">Đây là <b class="text-ink">mã khôi phục dự phòng</b>. Khi quên hết mật khẩu tài khoản Chủ, dùng mã này để đặt lại mật khẩu. ' +
        'Mã <b class="text-ink">chỉ hiện MỘT lần</b> — hãy chép ra giấy (hoặc in) và cất ở nơi an toàn, không để chung với máy tính.</p>' +
        '<div class="code-box mt-3" id="ma-du-phong">' + esc(ma) + '</div>' +
        '<label class="check mt-4"><input type="checkbox" id="da-luu">Tôi đã chép (hoặc in) mã này và cất ở nơi an toàn</label>',
      footer: '<button type="button" class="btn btn-ghost" data-act="in">' + icon('print') + 'In mã</button><span class="flex-1"></span>' +
        '<button type="button" class="btn btn-primary" data-act="xong" disabled>' + icon('check') + 'Xong</button>',
      onMount(el, h) {
        el.querySelector('.modal-x').hidden = true;
        const ok = el.querySelector('[data-act=xong]');
        el.querySelector('#da-luu').addEventListener('change', (e) => { ok.disabled = !e.target.checked; });
        ok.addEventListener('click', () => { h.close(); resolve(); });
        el.querySelector('[data-act=in]').addEventListener('click', () => {
          const root = $('#print-root');
          root.innerHTML = '<div class="p-10"><h1 class="text-[20px] font-bold">Sổ Thu Chi — mã khôi phục dự phòng</h1><p class="mt-2">Dùng khi quên hết mật khẩu tài khoản Chủ (màn hình đăng nhập → Quên mật khẩu → Dùng mã dự phòng).</p>' +
            '<p class="mt-6 font-mono text-[28px] font-bold tracking-wider">' + esc(ma) + '</p><p class="mt-6">Ngày tạo: ' + esc(new Date().toLocaleString('vi-VN')) + '. Cất nơi an toàn.</p></div>';
          document.body.classList.add('printing-doc');
          window.print();
          setTimeout(() => { root.innerHTML = ''; document.body.classList.remove('printing-doc'); }, 500);
        });
      }
    });
  });
}

/* ---------------- đăng xuất, khung người dùng ---------------- */
export async function dangXuat() {
  try { await goi('POST', '/api/auth/dang-xuat', {}); } catch (e) { /* vẫn tải lại */ }
  location.hash = '#/tong-quan';
  location.reload();
}

function veUserBox() {
  const box = $('#user-root');
  if (!box) return;
  if (!A.bat || !A.nguoiDung) { box.innerHTML = ''; return; }
  const u = A.nguoiDung;
  box.innerHTML = '<button type="button" class="user-box" id="btn-user" aria-haspopup="menu" title="Tài khoản đang đăng nhập">' + icon('contacts', 'text-[18px] text-ink-2') +
    '<span class="max-w-[160px] truncate font-semibold max-md:hidden">' + esc(u.hoTen) + '</span><span class="vai">' + esc(u.tenVaiTro) + '</span></button>';
  attachMenu($('#btn-user'), () => [
    { icon: 'contacts', label: u.hoTen, hint: 'Tên đăng nhập: ' + u.tenDangNhap + ' · Vai trò: ' + u.tenVaiTro, disabled: true, action: () => {} },
    { sep: true },
    { icon: 'lock', label: 'Đổi mật khẩu', hint: 'Phải nhập mật khẩu hiện tại', action: moDoiMatKhau },
    ...(u.vaiTro === 'chu' ? [{ icon: 'contacts', label: 'Quản lý người dùng', hint: 'Thêm tài khoản, vai trò, mở khóa, đặt lại mật khẩu', action: () => { location.hash = '#/nguoi-dung'; } }] : []),
    { sep: true },
    { icon: 'unlock', label: 'Đăng xuất', hint: 'Thoát khỏi phần mềm trên máy này', action: dangXuat }
  ]);
}

/* ---------------- gắn vào ui.js api(): 401 → đăng nhập lại rồi gửi tiếp; bắt đổi mật khẩu ---------------- */
onAuthNeeded(async (status, data) => {
  if (status === 401) {
    if (!A.bat) { try { await napTrangThai(); } catch (e) { /* mất kết nối */ } if (!A.bat) return false; }
    await dangNhap({ lai: true, thongBao: data && data.code === 'HET_PHIEN' ? '' : (data && data.error) });
    return true;
  }
  if (status === 403 && data && data.code === 'PHAI_DOI_MAT_KHAU') { await doiMatKhauBatBuoc(); return true; }
  return false;
});

export { goi as goiAuth };
