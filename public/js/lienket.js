/* Đường link mở thẳng màn hình đã lọc sẵn, ví dụ
 *   #/so-chi-tiet-ncc?ncc=NCC_A&ct=CT1&tu=2026-09-01&den=2026-09-30
 * (trợ lý AI scripts/mcp-ketoan.js tạo các link này). Link đặt TRỌN bộ lọc của màn hình đó (tham số không có = bỏ lọc),
 * lưu như người dùng tự chọn, rồi bỏ phần "?…" khỏi địa chỉ để các lần vẽ lại sau dùng bộ lọc bình thường.
 * Tham số: ct, ncc, tu, den (YYYY-MM-DD), vt, hm, nhom, nha, loai, q, tt, bao-cao. Mã nhận cả mã cũ đã gộp. */
import { LS } from './ui.js';
import { S, saveFilter, aliasOf } from './state.js';
import { datCongTrinh } from './ctpick.js';

const KT = window.KT;

const ky = (p) => {
  const tu = KT.isISODate(p.tu) ? p.tu : '';
  const den = KT.isISODate(p.den) ? p.den : '';
  return tu || den ? { period: 'khoang', from: tu, to: den, rel: false } : { period: 'tat-ca', from: '', to: '', rel: false };
};
const ma = (loai, v) => (v && v !== '__none__' ? aliasOf(loai, v) : v || '');
const loaiCP = (v) => (KT.LOAI_CP.includes(v) ? v : '');

// route → hàm đặt bộ lọc từ tham số p (đã giải mã). ct luôn đi qua công trình chung ở thanh trên.
const MAN = {
  'so-thu-chi': (p) => Object.assign(S.filters.so, ky(p), { ncc: ma('ncc', p.ncc), loai: ['thu', 'chi'].includes(p.loai) ? p.loai : '', q: p.q || '' }) && 'so',
  'cp-so': (p) => Object.assign(S.filters.cpSo, ky(p), {
    ncc: ma('ncc', p.ncc), vt: ma('vt', p.vt), hm: ma('hm', p.hm), nhom: p.nhom || '', nha: ma('nha', p.nha), loai: loaiCP(p.loai), q: p.q || ''
  }) && 'cpSo',
  'cp-cong-no': (p) => Object.assign(S.filters.cpCn, ky(p), { nccs: p.ncc ? [ma('ncc', p.ncc)] : [], tt: ['no', 'du', 'ok'].includes(p.tt) ? p.tt : '', q: p.q || '' }) && 'cpCn',
  // màn công trình × NCC không có ô chọn NCC: lọc NCC bằng ô tìm (khớp mã / tên)
  'cong-no-ct': (p) => Object.assign(S.filters.cnCt, ky(p), { tt: ['no', 'du', 'khac0'].includes(p.tt) ? p.tt : '', q: p.ncc ? ma('ncc', p.ncc) : p.q || '' }) && 'cnCt',
  'so-chi-tiet-ncc': (p) => {
    const f = S.filters.sct || (S.filters.sct = {});
    Object.assign(f, ky(p));
    if (p.ncc) LS.set('sct.ncc', ma('ncc', p.ncc));
    return 'sct';
  },
  'cp-chi-tiet': (p) => Object.assign(S.filters.cpCt, ky(p), { nha: ma('nha', p.nha), loai: loaiCP(p.loai), ncc: ma('ncc', p.ncc) }) && 'cpCt',
  'cp-tong-hop': (p) => Object.assign(S.filters.cpTh, ky(p), { nha: ma('nha', p.nha) }) && 'cpTh',
  'cp-gia': (p) => Object.assign(S.filters.cpGia, { q: '', hm: '', ncc: ma('ncc', p.ncc), vt: ma('vt', p.vt) }) && 'cpGia',
  'phan-tich': (p) => {
    const f = S.filters.bi || (S.filters.bi = {});
    if (p['bao-cao'] && p['bao-cao'] !== f.rep) { f.rep = p['bao-cao']; delete f.cfg; } // báo cáo không có: analytics.js tự về báo cáo đầu
    Object.assign(f, ky(p), {
      loaiCP: loaiCP(p.loai), nhom: p.nhom || '', hm: ma('hm', p.hm), vt: ma('vt', p.vt), nha: ma('nha', p.nha), q: p.q || '',
      nccs: p.ncc ? [ma('ncc', p.ncc)] : [], loaiNCC: '', tt: ['no', 'du'].includes(p.tt) ? p.tt : '', loaiPhieu: ['thu', 'chi'].includes(p.loai) ? p.loai : ''
    });
    if (KT.isISODate(p.den)) { f.den = p.den; f.denTay = true; }
    return 'bi';
  }
};

// Gọi trước khi vẽ màn hình. Trả true nếu đã áp dụng một link.
export function apDungLienKet(route) {
  const i = location.hash.indexOf('?');
  const fn = MAN[route];
  if (i < 0 || !fn) return false;
  const p = {};
  new URLSearchParams(location.hash.slice(i + 1)).forEach((v, k) => { p[k] = v.trim(); });
  const ten = fn(p);
  if (ten) saveFilter(ten);
  datCongTrinh(p.ct ? ma('da', p.ct) : '', true);
  history.replaceState(null, '', location.pathname + location.search + '#/' + route);
  return true;
}
