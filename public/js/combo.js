/* Ô gõ tìm có gợi ý — thay cho danh sách chọn (dropdown) khi chọn công trình, nhà, NCC, nhóm, hạng mục, vật tư, dự án.
 * Dùng giống ô Nhà cung cấp ở form phiếu chi: gõ vài chữ, danh sách gợi ý hiện mã + tên; chọn một gợi ý là áp dụng ngay;
 * hoặc gõ đủ mã (không phân biệt hoa thường) / đúng tên rồi Enter hay rời ô; xóa trắng = tất cả.
 *
 * o: { id | name, list: [{ ma, ten, sub }], value (mã đang chọn, '' = tất cả, '__none__' = chưa gán), show: 'ma' | 'ten'
 *      (ô hiện mã hay tên sau khi chọn), none: '(Không gán nhà)' (thêm lựa chọn "chưa gán"), noun: 'nhà cung cấp' (cho câu báo lỗi),
 *      placeholder, label (aria-label), cls, type ('search' mặc định cho ô lọc), accept(text) -> mã lạ vẫn nhận (vd. mã chỉ có trong sổ) } */
import { esc, toast } from './ui.js';

const KT = window.KT;
const NONE = '__none__';

function byCode(list, v) { return list.find((x) => KT.keyOf(x.ma) === KT.keyOf(v)); }

// Chữ hiện trong ô cho một giá trị
export function comboText(o, v) {
  if (!v) return '';
  if (v === NONE) return o.none || '';
  const x = byCode(o.list, v);
  return o.show === 'ten' && x ? x.ten : x ? x.ma : String(v);
}

export function comboHtml(o) {
  const dl = 'dl-' + (o.id || o.name) + '-goi-y';
  const x = o.value && o.value !== NONE ? byCode(o.list, o.value) : null;
  const opts = (o.none ? '<option value="' + esc(o.none) + '"></option>' : '') + o.list.map((it) => o.show === 'ten'
    ? '<option value="' + esc(it.ten) + '">' + esc(it.ma + (it.sub ? ' · ' + it.sub : '')) + '</option>'
    : '<option value="' + esc(it.ma) + '">' + esc(it.ten + (it.sub ? ' · ' + it.sub : '')) + '</option>').join('');
  return '<input' + (o.id ? ' id="' + esc(o.id) + '"' : '') + (o.name ? ' name="' + esc(o.name) + '"' : '') + ' type="' + (o.type || 'search') + '"' +
    ' class="input combo' + (o.cls ? ' ' + o.cls : '') + '" list="' + dl + '" autocomplete="off" value="' + esc(comboText(o, o.value)) + '"' +
    (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') + (o.label ? ' aria-label="' + esc(o.label) + '"' : '') +
    (x ? ' title="' + esc(o.show === 'ten' ? x.ma : x.ten) + '"' : '') + '>' +
    '<datalist id="' + dl + '">' + opts + '</datalist>';
}

// Chữ đã gõ -> { ok, value }: mã, đúng tên (một kết quả), "Tên (MÃ)", lựa chọn "chưa gán", hoặc mã lạ o.accept nhận
export function comboResolve(o, text) {
  const t = String(text == null ? '' : text).trim();
  if (!t) return { ok: true, value: '' };
  const n = KT.normalizeText(t).trim();
  if (o.none && n === KT.normalizeText(o.none).trim()) return { ok: true, value: NONE };
  const c = byCode(o.list, t);
  if (c) return { ok: true, value: c.ma };
  const byName = o.list.filter((x) => KT.normalizeText(x.ten).trim() === n);
  if (byName.length === 1) return { ok: true, value: byName[0].ma };
  const m = /\(([^()]+)\)\s*$/.exec(t);
  if (m && byCode(o.list, m[1])) return { ok: true, value: byCode(o.list, m[1]).ma };
  const extra = o.accept ? o.accept(t) : '';
  return extra ? { ok: true, value: extra } : { ok: false, value: '' };
}

// Ô lọc: gọi onPick(mã) khi chọn gợi ý / Enter / rời ô với giá trị mới; gõ sai thì báo và trả lại giá trị cũ
export function bindCombo(input, o, onPick) {
  if (!input) return;
  const apply = () => {
    const t = input.value.trim();
    const r = comboResolve(o, t);
    if (!r.ok) {
      toast('Không có ' + (o.noun || 'mục') + ' “' + t + '”. Gõ mã hoặc tên rồi chọn trong danh sách gợi ý.', 'error');
      input.value = comboText(o, o.value);
      return;
    }
    if (KT.keyOf(r.value) === KT.keyOf(o.value || '')) { input.value = comboText(o, o.value); return; }
    o.value = r.value;
    input.value = comboText(o, r.value);
    onPick(r.value);
  };
  // chọn một dòng gợi ý (trình duyệt không gửi inputType gõ phím) hoặc bấm nút × của ô tìm: áp dụng ngay; gõ từng chữ thì chờ Enter / rời ô
  input.addEventListener('input', (e) => { if (!e.inputType || e.inputType === 'insertReplacementText') apply(); });
  input.addEventListener('change', apply);
}
