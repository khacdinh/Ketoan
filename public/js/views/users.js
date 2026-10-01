/* Người dùng (chỉ Chủ): danh sách tài khoản, thêm, sửa họ tên / vai trò, vô hiệu hóa / kích hoạt, đặt lại mật khẩu (người dùng phải
 * đổi ở lần đăng nhập kế tiếp), mở khóa; thẻ Sự kiện bảo mật (đăng nhập, khóa, đổi mật khẩu… — không bao giờ có mật khẩu / mã).
 * Không có nút xóa: tài khoản đã có thao tác phải giữ để truy vết — chỉ vô hiệu hóa. */
import { $, esc, icon, api, toast, showError, openModal, busy, freshRoot, fdate, confirmDialog } from '../ui.js';
import { A, oMatKhau, ganOMatKhau } from '../auth.js';

let the = 'nguoi-dung';

const gio = (iso) => (iso ? fdate(iso.slice(0, 10)) + ' ' + new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '');

export function renderUsers(root) {
  root = freshRoot(root);
  if (!A.bat) { root.innerHTML = '<div class="sheet p-6"><p>Đăng nhập đang tắt. Bật ở <a class="font-semibold text-pen underline" href="#/cai-dat">Cài đặt → Đăng nhập và phân quyền</a>.</p></div>'; return; }
  root.innerHTML = '<div class="no-print flex flex-wrap items-center gap-2" role="tablist" aria-label="Người dùng">' +
    [['nguoi-dung', 'Người dùng', 'contacts'], ['su-kien', 'Sự kiện bảo mật', 'shield']].map(([k, l, ic]) =>
      '<button type="button" role="tab" data-the="' + k + '" aria-selected="' + (the === k) + '" class="btn ' + (the === k ? 'btn-primary' : 'btn-secondary') + '">' + icon(ic) + l + '</button>').join('') +
    '<span class="flex-1"></span>' + (the === 'nguoi-dung' ? '<button type="button" class="btn btn-primary" data-act="them-nd">' + icon('plus') + 'Thêm người dùng</button>' : '') +
    '</div><div id="nd-body" class="flex flex-col gap-5"></div>';
  root.querySelectorAll('[data-the]').forEach((b) => b.addEventListener('click', () => { the = b.dataset.the; renderUsers(root); }));
  const them = root.querySelector('[data-act=them-nd]');
  if (them) them.addEventListener('click', () => moFormNguoi(null, () => veDanhSach($('#nd-body', root))));
  if (the === 'nguoi-dung') veDanhSach($('#nd-body', root)); else veSuKien($('#nd-body', root));
}

function trangThai(u) {
  const out = [];
  out.push(u.hoatDong ? '<span class="chip chip-ok">' + icon('checkCircle') + 'Hoạt động</span>' : '<span class="chip chip-idle">' + icon('minus') + 'Vô hiệu hóa</span>');
  if (u.dangKhoa) out.push('<span class="chip chip-near">' + icon('lock') + 'Đang khóa đến ' + esc(gio(u.khoaDen)) + '</span>');
  if (u.phaiDoiMatKhau) out.push('<span class="chip chip-near">' + icon('warn') + 'Phải đổi mật khẩu</span>');
  return out.join(' ');
}

async function veDanhSach(box) {
  box.innerHTML = '<p class="text-ink-3">Đang tải…</p>';
  let d;
  try { d = await api('GET', '/api/users'); } catch (err) { box.innerHTML = '<p class="form-error">' + esc(err.message) + '</p>'; return; }
  const toi = A.nguoiDung ? A.nguoiDung.id : 0;
  box.innerHTML = '<section class="sheet overflow-hidden"><div class="overflow-x-auto"><table class="ledger" id="nd-bang"><thead><tr><th>Tên đăng nhập</th><th>Họ tên</th><th>Vai trò</th><th>Trạng thái</th>' +
    '<th>Đăng nhập lần cuối</th><th class="no-print"><span class="sr-only">Thao tác</span></th></tr></thead><tbody>' +
    d.items.map((u) => '<tr data-id="' + u.id + '"><td class="code">' + esc(u.tenDangNhap) + (u.id === toi ? ' <span class="pill">bạn</span>' : '') + '</td><td>' + esc(u.hoTen) + '</td>' +
      '<td>' + esc(u.tenVaiTro) + '</td><td>' + trangThai(u) + '</td><td class="whitespace-nowrap text-ink-2">' + esc(gio(u.lanDangNhapCuoi)) + '</td>' +
      '<td class="actions no-print"><div class="flex flex-wrap justify-end gap-1">' +
      '<button type="button" class="btn btn-ghost btn-sm" data-u="sua">' + icon('edit') + 'Sửa</button>' +
      (u.id !== toi ? '<button type="button" class="btn btn-ghost btn-sm" data-u="dat-lai">' + icon('lock') + 'Đặt lại mật khẩu</button>' : '') +
      (u.dangKhoa || u.saiLienTiep ? '<button type="button" class="btn btn-ghost btn-sm" data-u="mo-khoa">' + icon('unlock') + 'Mở khóa</button>' : '') +
      (u.id !== toi ? '<button type="button" class="btn btn-ghost btn-sm" data-u="' + (u.hoatDong ? 'vo-hieu' : 'kich-hoat') + '">' + icon(u.hoatDong ? 'minus' : 'checkCircle') + (u.hoatDong ? 'Vô hiệu hóa' : 'Kích hoạt') + '</button>' : '') +
      '</div></td></tr>').join('') + '</tbody></table></div></section>' +
    '<p class="text-[12.5px] leading-relaxed text-ink-3">' + icon('info') + ' Không xóa được tài khoản (để giữ truy vết ai đã làm gì) — dùng Vô hiệu hóa. Luôn phải còn ít nhất một tài khoản Chủ đang hoạt động. ' +
    'Đổi vai trò, vô hiệu hóa, đặt lại mật khẩu: người đó bị đăng xuất ngay.</p>' +
    '<section class="sheet p-5 text-[13px] leading-relaxed text-ink-2"><h3 class="mb-2 text-[14px] font-semibold text-ink">Vai trò</h3>' +
    '<p><b class="text-ink">Chủ</b>: toàn quyền — quản lý người dùng, cài đặt, khôi phục sao lưu, xóa vĩnh viễn, khóa sổ, gộp mã, nhập Excel thay thế toàn bộ, bật / tắt đăng nhập.</p>' +
    '<p class="mt-1"><b class="text-ink">Kế toán</b>: xem, thêm, sửa, xóa (vào thùng rác, khôi phục được), nhập Excel gộp thêm, xuất Excel, in phiếu, tạo sao lưu, xem nhật ký.</p>' +
    '<p class="mt-1"><b class="text-ink">Chỉ xem</b>: xem, lọc, tìm, in, xuất Excel. Không thêm / sửa / xóa gì.</p></section>';
  box.onclick = async (e) => {
    const b = e.target.closest('[data-u]');
    if (!b) return;
    const u = d.items.find((x) => x.id === Number(b.closest('tr').dataset.id));
    const lai = () => veDanhSach(box);
    const goi = async (url, body, msg) => { try { await api('POST', url, body); toast(msg); lai(); } catch (err) { showError(err); } };
    if (b.dataset.u === 'sua') moFormNguoi(u, lai);
    if (b.dataset.u === 'dat-lai') moDatLai(u, lai);
    if (b.dataset.u === 'mo-khoa') goi('/api/users/' + u.id + '/mo-khoa', {}, 'Đã mở khóa ' + u.tenDangNhap);
    if (b.dataset.u === 'kich-hoat') goi('/api/users/' + u.id + '/trang-thai', { hoatDong: true }, 'Đã kích hoạt ' + u.tenDangNhap);
    if (b.dataset.u === 'vo-hieu') {
      if (!(await confirmDialog({ title: 'Vô hiệu hóa tài khoản', html: 'Vô hiệu hóa <b class="text-ink">' + esc(u.tenDangNhap) + '</b> (' + esc(u.hoTen) + ')? Người đó bị đăng xuất ngay và không đăng nhập được nữa. Kích hoạt lại được bất cứ lúc nào.', okText: 'Vô hiệu hóa', danger: true }))) return;
      goi('/api/users/' + u.id + '/trang-thai', { hoatDong: false }, 'Đã vô hiệu hóa ' + u.tenDangNhap);
    }
  };
}

function chonVaiTro(v) {
  return '<label class="field"><span class="label">Vai trò <b class="req">*</b></span><select name="vaiTro" class="input">' +
    [['ke-toan', 'Kế toán'], ['chi-xem', 'Chỉ xem'], ['chu', 'Chủ']].map(([k, l]) => '<option value="' + k + '"' + (v === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>';
}

function moFormNguoi(u, xong) {
  const moi = !u;
  openModal({
    title: moi ? 'Thêm người dùng' : 'Sửa người dùng ' + u.tenDangNhap, size: 'small',
    body: '<form id="nd-form" class="flex flex-col gap-3" novalidate autocomplete="off">' +
      (moi ? '<label class="field"><span class="label">Tên đăng nhập <b class="req">*</b></span><input name="ten" class="input" autocapitalize="none" spellcheck="false" maxlength="40" autofocus>' +
        '<span class="hint">3–40 ký tự: chữ, số, dấu chấm, gạch dưới, gạch ngang.</span></label>' : '') +
      '<label class="field"><span class="label">Họ tên <b class="req">*</b></span><input name="hoTen" class="input" maxlength="100" value="' + esc(u ? u.hoTen : '') + '"' + (moi ? '' : ' autofocus') + '></label>' +
      chonVaiTro(u ? u.vaiTro : 'ke-toan') +
      (moi ? oMatKhau('mk', 'Mật khẩu tạm', { req: true, ac: 'new-password', hint: 'Báo mật khẩu này cho người dùng; họ phải đổi sang mật khẩu riêng ở lần đăng nhập đầu tiên.' }) +
        oMatKhau('mk2', 'Nhập lại mật khẩu tạm', { req: true, ac: 'new-password' }) : '<p class="text-[12.5px] text-ink-3">Đổi vai trò thì người đó bị đăng xuất ngay để đăng nhập lại theo vai trò mới.</p>') +
      '<p class="form-error" id="nd-loi" role="alert" hidden></p><button type="submit" hidden></button></form>',
    footer: '<button type="button" class="btn btn-ghost" data-act="no">Hủy</button><button type="button" class="btn btn-primary" data-act="yes">' + icon('check') + (moi ? 'Thêm người dùng' : 'Lưu') + '</button>',
    onMount(el, h) {
      ganOMatKhau(el);
      const fm = $('#nd-form', el);
      const go = async () => {
        const loi = $('#nd-loi', el);
        const done = busy(el.querySelector('[data-act=yes]'), 'Đang lưu…');
        try {
          if (moi) {
            await api('POST', '/api/users', { tenDangNhap: fm.elements.ten.value.trim(), hoTen: fm.elements.hoTen.value.trim(), vaiTro: fm.elements.vaiTro.value,
              matKhau: fm.elements.mk.value, matKhau2: fm.elements.mk2.value });
            toast('Đã thêm người dùng ' + fm.elements.ten.value.trim());
          } else {
            await api('PUT', '/api/users/' + u.id, { hoTen: fm.elements.hoTen.value.trim(), vaiTro: fm.elements.vaiTro.value });
            toast('Đã lưu ' + u.tenDangNhap);
          }
          h.close();
          xong();
        } catch (err) { done(); loi.hidden = false; loi.textContent = err.message; }
      };
      fm.addEventListener('submit', (e) => { e.preventDefault(); go(); });
      el.querySelector('[data-act=yes]').addEventListener('click', go);
      el.querySelector('[data-act=no]').addEventListener('click', () => h.close());
    }
  });
}

function moDatLai(u, xong) {
  openModal({
    title: 'Đặt lại mật khẩu ' + u.tenDangNhap, size: 'small',
    body: '<p class="text-[13.5px] leading-relaxed text-ink-2">Đặt mật khẩu tạm cho <b class="text-ink">' + esc(u.hoTen) + '</b>. Người đó bị đăng xuất ngay và phải đổi sang mật khẩu riêng ở lần đăng nhập kế tiếp.</p>' +
      '<form id="dl-form" class="mt-3 flex flex-col gap-3" novalidate autocomplete="off">' + oMatKhau('mk', 'Mật khẩu tạm', { req: true, ac: 'new-password', autofocus: true }) +
      oMatKhau('mk2', 'Nhập lại', { req: true, ac: 'new-password' }) + '<p class="form-error" id="dl-loi" role="alert" hidden></p><button type="submit" hidden></button></form>',
    footer: '<button type="button" class="btn btn-ghost" data-act="no">Hủy</button><button type="button" class="btn btn-primary" data-act="yes">' + icon('lock') + 'Đặt lại</button>',
    onMount(el, h) {
      ganOMatKhau(el);
      const fm = $('#dl-form', el);
      const go = async () => {
        const done = busy(el.querySelector('[data-act=yes]'), 'Đang lưu…');
        try {
          await api('POST', '/api/users/' + u.id + '/dat-lai-mat-khau', { matKhau: fm.elements.mk.value, matKhau2: fm.elements.mk2.value });
          toast('Đã đặt lại mật khẩu cho ' + u.tenDangNhap);
          h.close();
          xong();
        } catch (err) { done(); const l = $('#dl-loi', el); l.hidden = false; l.textContent = err.message; }
      };
      fm.addEventListener('submit', (e) => { e.preventDefault(); go(); });
      el.querySelector('[data-act=yes]').addEventListener('click', go);
      el.querySelector('[data-act=no]').addEventListener('click', () => h.close());
    }
  });
}

/* ---------------- sự kiện bảo mật ---------------- */
const loc = { loai: '', tu: '', den: '', q: '' };
async function veSuKien(box) {
  box.innerHTML = '<p class="text-ink-3">Đang tải…</p>';
  const qs = Object.keys(loc).filter((k) => loc[k]).map((k) => k + '=' + encodeURIComponent(loc[k])).join('&');
  let d;
  try { d = await api('GET', '/api/auth/su-kien?' + qs); } catch (err) { box.innerHTML = '<p class="form-error">' + esc(err.message) + '</p>'; return; }
  box.innerHTML = '<form id="sk-loc" class="no-print flex flex-wrap items-end gap-2" autocomplete="off">' +
    '<label class="field"><span class="label">Loại sự kiện</span><select name="loai" class="input w-auto"><option value="">Tất cả</option>' +
    Object.keys(d.loai).map((k) => '<option value="' + esc(k) + '"' + (loc.loai === k ? ' selected' : '') + '>' + esc(d.loai[k]) + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="label">Từ ngày</span><input type="date" name="tu" class="input" value="' + esc(loc.tu) + '"></label>' +
    '<label class="field"><span class="label">Đến ngày</span><input type="date" name="den" class="input" value="' + esc(loc.den) + '"></label>' +
    '<label class="field min-w-[200px] flex-1"><span class="label">Tìm (tài khoản, người làm, địa chỉ, chi tiết)</span><input type="search" name="q" class="input" value="' + esc(loc.q) + '"></label>' +
    '<button type="submit" class="btn btn-secondary">' + icon('funnel') + 'Lọc</button></form>' +
    '<section class="sheet overflow-hidden"><div class="overflow-x-auto"><table class="ledger" id="sk-bang"><thead><tr><th>Lúc</th><th>Sự kiện</th><th>Tài khoản</th><th>Người làm</th><th>Địa chỉ</th><th>Chi tiết</th></tr></thead><tbody>' +
    (d.items.length ? d.items.map((x) => '<tr><td class="whitespace-nowrap tabular-nums">' + esc(gio(x.luc)) + '</td><td>' + esc(d.loai[x.loai] || x.loai) + '</td><td class="code">' + esc(x.tenDangNhap || '') + '</td>' +
      '<td>' + esc(x.nguoiLam || '') + '</td><td class="text-ink-2">' + esc(x.ip || '') + '</td><td class="text-[12.5px] text-ink-2">' + esc(x.chiTiet || '') + '</td></tr>').join('')
      : '<tr><td colspan="6" class="empty">Không có sự kiện nào khớp.</td></tr>') + '</tbody></table></div></section>';
  $('#sk-loc', box).addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target.elements;
    Object.assign(loc, { loai: f.loai.value, tu: f.tu.value, den: f.den.value, q: f.q.value.trim() });
    veSuKien(box);
  });
}
