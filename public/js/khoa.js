/* Hộp "Kỳ đã khóa" (12e): bấm vào dòng / nút của tháng đã khóa sổ thì giải thích vì sao không sửa được và mở khóa thế nào. */
import { esc, icon, openModal } from './ui.js';
import { laChu } from './auth.js';

const KT = window.KT;

export function moKyKhoa(ngay, verb) {
  const thang = KT.monthOf(ngay);
  const nhan = String(thang).slice(5, 7) + '/' + String(thang).slice(0, 4);
  return openModal({
    title: 'Kỳ ' + nhan + ' đã khóa',
    size: 'small',
    body: '<div class="flex items-start gap-3"><span class="grid size-10 flex-none place-items-center border border-rule bg-neutral-200 text-[18px]">' + icon('lock') + '</span>' +
      '<div class="leading-relaxed"><p>' + esc(KT.lockMessage(thang, verb || 'sửa')) + '</p>' +
      '<p class="mt-2 text-[13px] text-ink-2">Khóa sổ chặn sửa, xóa, nhân bản vào ngày thuộc kỳ. Mở khóa cần tài khoản <b>Chủ</b> và phải ghi lý do (có trong nhật ký).</p></div></div>',
    footer: '<span class="flex-1"></span><button type="button" class="btn btn-ghost" data-act="no">Đóng</button>' +
      (laChu() ? '<a href="#/kiem-soat?tab=khoa-so" class="btn btn-secondary" data-act="go">' + icon('unlock') + 'Mở khóa…</a>' : ''),
    onMount(el, h) {
      el.querySelector('[data-act=no]').addEventListener('click', () => h.close());
      const go = el.querySelector('[data-act=go]');
      if (go) go.addEventListener('click', () => h.close());
    }
  });
}
