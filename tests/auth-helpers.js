'use strict';
/* Tiện ích kiểm thử đăng nhập: bật đăng nhập, đăng nhập lấy cookie, gọi API kèm cookie + Origin đúng, đồng hồ giả lập. */
const fs = require('fs');
const path = require('path');
const { tmpDir } = require('./helpers');

const MK_CHU = 'nhà em ở Đà Nẵng 2026';

// Gọi API như trình duyệt của phần mềm: kèm Origin đúng địa chỉ máy chủ (chống CSRF) và cookie phiên (nếu có)
function goi(srv, method, url, body, cookie, extra) {
  const h = Object.assign({ Origin: srv.base }, cookie ? { Cookie: cookie } : {}, extra || {});
  return srv.call(method, url, body, h);
}

function layCookie(r) {
  const sc = r.headers['set-cookie'];
  const v = Array.isArray(sc) ? sc[0] : sc;
  return v ? String(v).split(';')[0] : '';
}

async function batDangNhap(srv, o) {
  o = Object.assign({ tenDangNhap: 'chu', hoTen: 'Chủ Thầu', matKhau: MK_CHU }, o || {});
  const r = await goi(srv, 'POST', '/api/auth/bat', { tenDangNhap: o.tenDangNhap, hoTen: o.hoTen, matKhau: o.matKhau, matKhau2: o.matKhau });
  if (r.status !== 200) throw new Error('Bật đăng nhập lỗi ' + r.status + ' ' + JSON.stringify(r.json));
  return { cookie: layCookie(r), maDuPhong: r.json.maDuPhong, json: r.json };
}

async function dangNhap(srv, ten, mk) {
  const r = await goi(srv, 'POST', '/api/auth/dang-nhap', { tenDangNhap: ten, matKhau: mk });
  return { status: r.status, cookie: layCookie(r), json: r.json, r };
}

// Tạo người dùng (bằng Chủ), rồi người đó đăng nhập và đổi mật khẩu bắt buộc → trả cookie dùng được
async function taoVaDangNhap(srv, cookieChu, ten, vaiTro, mk) {
  const tam = 'tạm thời ' + ten + ' 123';
  const r = await goi(srv, 'POST', '/api/users', { tenDangNhap: ten, hoTen: 'Người ' + ten, vaiTro, matKhau: tam, matKhau2: tam }, cookieChu);
  if (r.status !== 200) throw new Error('Tạo người dùng lỗi ' + r.status + ' ' + JSON.stringify(r.json));
  const l = await dangNhap(srv, ten, tam);
  const d = await goi(srv, 'POST', '/api/auth/doi-mat-khau', { matKhauCu: tam, matKhauMoi: mk, matKhauMoi2: mk }, l.cookie);
  if (d.status !== 200) throw new Error('Đổi mật khẩu lỗi ' + d.status + ' ' + JSON.stringify(d.json));
  return { cookie: l.cookie, id: r.json.nguoiDung.id };
}

// Đồng hồ giả lập: máy chủ đọc số mili-giây cộng thêm từ file (biến môi trường KETOAN_DONG_HO_GIA, chỉ dùng khi kiểm thử)
function dongHo() {
  const file = path.join(tmpDir('dong-ho'), 'lech.txt');
  fs.writeFileSync(file, '0');
  return { file, env: { KETOAN_DONG_HO_GIA: file }, tien(ms) { const cur = Number(fs.readFileSync(file, 'utf8')) || 0; fs.writeFileSync(file, String(cur + ms)); } };
}

module.exports = { MK_CHU, goi, layCookie, batDangNhap, dangNhap, taoVaDangNhap, dongHo };
