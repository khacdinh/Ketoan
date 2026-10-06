/* Đánh số chứng từ: tiền tố, số tiếp theo, độ dài, hậu tố của phiếu thu, phiếu chi, ủy nhiệm chi, phiếu mua vật tư (phiếu nhập chi phí),
 * biên bản đối chiếu. Số được tự điền khi lập chứng từ mới (KT.soChungTuTiep); sửa ở đây áp cho các chứng từ lập sau. */
import { $, esc, icon, api, toast, showError, openModal, freshRoot, busy, fieldError } from '../ui.js';
import { S } from '../state.js';
import { coQuyen } from '../auth.js';

const KT = window.KT;

const DUNG_O = {
  thu: 'Ghi thu / chi, khi chọn Thu tiền',
  chi: 'Ghi thu / chi, khi chọn Chi tiền',
  unc: 'Ghi thu / chi, khi chọn Ủy nhiệm chi (chuyển khoản)',
  mh: 'Phiếu nhập chi phí (số phiếu)',
  dc: 'Biên bản đối chiếu công nợ NCC'
};

const nccMau = () => (S.db.suppliers[0] && S.db.suppliers[0].ma) || 'NCC';
const kyText = (cfg) => (/MM/.test(cfg.hauTo) ? 'Đánh lại từ 1 mỗi tháng' : /YY/.test(cfg.hauTo) ? 'Đánh lại từ 1 mỗi năm' : 'Chạy liên tục, không đánh lại');

export function renderNumbering(root) {
  root = freshRoot(root);
  const hom = KT.todayISO();
  const sua = coQuyen('cai-dat');
  const rows = KT.LOAI_SO.map((loai) => {
    const t = KT.soChungTuTiep(S.all, loai, hom, nccMau());
    const c = t.cfg;
    return '<tr data-loai="' + loai + '"' + (sua ? ' class="cursor-pointer"' : '') + '>' +
      '<td><div class="font-medium text-ink">' + esc(c.ten) + '</div><div class="text-[12px] text-ink-3">' + esc(DUNG_O[loai]) + '</div></td>' +
      '<td class="code" data-c="tienTo">' + esc(c.tienTo) + '</td>' +
      '<td class="num tabular-nums" data-c="soTiep">' + (c.doDai > 0 ? esc(String(t.so).padStart(c.doDai, '0')) : '<span class="text-ink-3">—</span>') + '</td>' +
      '<td class="num tabular-nums">' + (c.doDai > 0 ? c.doDai : '<span class="text-ink-3">—</span>') + '</td>' +
      '<td class="code">' + esc(c.hauTo) + (c.doDai > 0 ? '<div class="text-[12px] font-normal text-ink-3">' + esc(kyText(c)) + '</div>' : '') + '</td>' +
      '<td class="code" data-c="viDu">' + esc(t.soPhieu) + '</td>' +
      '<td class="w-10 text-right">' + (sua ? '<button type="button" class="icon-btn" data-act="sua" title="Sửa" aria-label="Sửa cách đánh số ' + esc(c.ten.toLowerCase()) + '">' + icon('edit') + '</button>' : '') + '</td></tr>';
  }).join('');
  root.innerHTML =
    '<section class="sheet overflow-hidden" aria-labelledby="h-danh-so"><div class="sheet-head"><div><h2 id="h-danh-so" class="sheet-title">Đánh số chứng từ</h2>' +
    '<p class="sheet-note">Số chứng từ = Tiền tố + số thứ tự (đủ Độ dài) + Hậu tố. Phần mềm tự điền số tiếp theo khi lập phiếu mới; vẫn sửa tay được trước khi ghi.</p></div></div>' +
    '<div class="scroll-x overflow-x-auto"><table class="ledger" id="danh-so"><thead><tr><th>Loại chứng từ</th><th>Tiền tố</th><th class="num">Số tiếp theo</th><th class="num">Độ dài</th><th>Hậu tố</th><th>Ví dụ</th><th><span class="sr-only">Sửa</span></th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div>' +
    '<div class="border-t border-rule px-5 py-3 text-[12.5px] leading-relaxed text-ink-3">' + icon('info', 'mr-1 align-[-3px] text-[15px]') +
    'Hậu tố dùng các mẫu <b class="font-medium text-ink-2">MM</b> (tháng), <b class="font-medium text-ink-2">YYYY</b> / <b class="font-medium text-ink-2">YY</b> (năm), <b class="font-medium text-ink-2">DD</b> (ngày) theo ngày chứng từ và <b class="font-medium text-ink-2">NCC</b> (mã nhà cung cấp). ' +
    'Số tiếp theo = số lớn nhất đã dùng trong kỳ + 1, nên xóa phiếu cuối thì số đó được dùng lại. Ví dụ tính theo hôm nay' + (KT.LOAI_SO.includes('dc') ? ', biên bản lấy mã NCC ' + esc(nccMau()) : '') + '.' +
    (sua ? '' : '<br>' + icon('lock', 'mr-1 align-[-3px] text-[15px]') + 'Chỉ tài khoản Chủ đổi được cách đánh số.') + '</div></section>';
  if (!sua) return;
  root.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-loai]');
    if (tr) moSua(tr.dataset.loai);
  });
}

function moSua(loai) {
  const hom = KT.todayISO();
  const t = KT.soChungTuTiep(S.all, loai, hom, nccMau());
  const c = t.cfg;
  const dc = loai === 'dc';
  const goc = KT.DANH_SO[loai];
  const body =
    '<form id="ds-form" class="grid grid-cols-2 gap-x-4 gap-y-4" novalidate autocomplete="off">' +
    '<label class="field"><span class="label">Tiền tố <b class="req">*</b></span><input name="tienTo" class="input code" maxlength="10" value="' + esc(c.tienTo) + '"></label>' +
    '<label class="field"><span class="label">Hậu tố</span><input name="hauTo" class="input code" maxlength="20" value="' + esc(c.hauTo) + '"><span class="hint">MM tháng, YYYY / YY năm, DD ngày, NCC mã nhà cung cấp</span></label>' +
    (dc ? '<p class="col-span-2 text-[13px] text-ink-3">Biên bản đối chiếu không có số thứ tự: số gồm tiền tố, tháng / năm cuối kỳ đối chiếu và mã nhà cung cấp.</p>' :
      '<label class="field"><span class="label">Độ dài số thứ tự <b class="req">*</b></span><input name="doDai" class="input" type="number" min="1" max="10" value="' + c.doDai + '"><span class="hint">Số chữ số, thêm 0 phía trước cho đủ</span></label>' +
      '<label class="field"><span class="label">Số tiếp theo</span><input name="soTiep" class="input" type="number" min="1" value="' + t.so + '"><span class="hint" id="ds-dadung">' +
      (t.daDung ? 'Số lớn nhất đã dùng trong kỳ: ' + t.daDung + '. Chỉ đặt được số lớn hơn' : 'Kỳ này chưa có chứng từ nào') + '</span></label>') +
    '<div class="col-span-2 border border-rule bg-paper px-4 py-3"><span class="label">Số chứng từ tiếp theo</span><div class="code text-[20px] font-semibold text-ink" id="ds-vidu"></div>' +
    '<div class="text-[12px] text-ink-3" id="ds-ky"></div></div>' +
    '<p class="form-error col-span-2" id="ds-loi" role="alert" hidden></p></form>';
  openModal({
    title: 'Đánh số ' + c.ten.toLowerCase(),
    body,
    footer: '<button type="button" class="btn btn-ghost" data-act="mac-dinh" title="Điền lại tiền tố, độ dài, hậu tố mặc định: ' + esc(goc.tienTo + (goc.doDai ? '0'.repeat(goc.doDai - 1) + '1' : '') + goc.hauTo) + '">Về mặc định</button><span class="flex-1"></span>' +
      '<button type="button" class="btn btn-ghost" data-act="huy">Hủy</button><button type="button" class="btn btn-primary" data-act="luu">' + icon('save') + 'Lưu</button>',
    onMount(el, h) {
      const f = $('#ds-form', el);
      const get = (n) => f.elements[n];
      const docForm = () => ({
        tienTo: get('tienTo').value.replace(/\s+/g, ''),
        hauTo: get('hauTo').value.replace(/\s+/g, ''),
        doDai: dc ? 0 : Math.max(0, Math.min(10, parseInt(get('doDai').value, 10) || 0)),
        soTiep: dc ? '' : get('soTiep').value.trim()
      });
      const xem = () => {
        const v = docForm();
        const cfg = Object.assign({}, c, v);
        const so = dc ? 0 : parseInt(v.soTiep, 10) || 1;
        $('#ds-vidu', el).textContent = KT.soChungTu(cfg, so, hom, nccMau()) || '—';
        $('#ds-ky', el).textContent = dc ? 'Ví dụ với nhà cung cấp ' + nccMau() + ', kỳ đến hôm nay' : kyText(cfg);
      };
      f.addEventListener('input', xem);
      xem();
      el.querySelector('[data-act=huy]').addEventListener('click', () => h.close());
      el.querySelector('[data-act=mac-dinh]').addEventListener('click', () => {
        get('tienTo').value = goc.tienTo; get('hauTo').value = goc.hauTo;
        if (!dc) get('doDai').value = goc.doDai;
        xem();
      });
      const luu = async (ev) => {
        if (ev) ev.preventDefault();
        const v = docForm();
        const loi = $('#ds-loi', el);
        loi.hidden = true;
        if (!v.tienTo) return fieldError(get('tienTo'), 'Nhập tiền tố, ví dụ ' + goc.tienTo);
        const done = busy(el.querySelector('[data-act=luu]'), 'Đang lưu…');
        try {
          await api('PUT', '/api/danh-so/' + loai, v);
          toast('Đã lưu cách đánh số ' + c.ten.toLowerCase() + '. Số tiếp theo: ' + KT.soChungTuTiep(S.all, loai, hom, nccMau()).soPhieu);
          h.close();
        } catch (err) {
          if (err && err.status === 400) { loi.textContent = err.message; loi.hidden = false; } else showError(err);
        } finally { done(); }
      };
      el.querySelector('[data-act=luu]').addEventListener('click', luu);
      f.addEventListener('submit', luu);
      f.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') luu(ev); });
    }
  });
}
