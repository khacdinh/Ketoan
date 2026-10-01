'use strict';
/*
 * ĐĂNG NHẬP VÀ PHÂN QUYỀN — MẶC ĐỊNH TẮT. Khi tắt, xacThuc() không làm gì: phần mềm chạy y như trước.
 *
 * Lưu trữ: các bảng nguoiDung, phienDangNhap, suKienBaoMat, cauHinhDangNhap trong ketoan.db (lib/db.js AUTH_SQL), đọc / ghi trực
 * tiếp bằng câu lệnh có tham số — KHÔNG thuộc kho dữ liệu trong bộ nhớ (store.db) nên không bao giờ gửi cho giao diện qua /api/db,
 * không vào file xuất Excel / JSON, và khôi phục sao lưu không ghi đè người dùng, mật khẩu, trạng thái bật / tắt hiện tại.
 *
 * - Mật khẩu: lib/matKhau.js (scrypt). Phiên: mã ngẫu nhiên 32 byte trong cookie HttpOnly + SameSite=Strict; CSDL chỉ lưu SHA-256
 *   của mã. Hết phiên khi không thao tác X phút (mặc định 60) hoặc quá Y giờ kể từ lúc đăng nhập (mặc định 12).
 * - Chống giả mạo yêu cầu (CSRF): yêu cầu thay đổi dữ liệu phải có Origin (hoặc Referer) đúng địa chỉ máy chủ + cookie SameSite=Strict.
 * - Chống đoán mật khẩu: sai 5 lần liên tiếp → khóa 5 phút, lần sau 15 phút, rồi 1 giờ; thêm giới hạn theo địa chỉ nguồn.
 *   Tên đăng nhập không tồn tại cũng bị đếm / "khóa" y hệt và vẫn chạy scrypt → không lộ tài khoản nào có thật.
 * - Quên mật khẩu: mã dùng một lần, 15 phút, ghi vào data/khoi-phuc/MA_KHOI_PHUC.txt (không hiện trên màn hình / API / nhật ký).
 *   Mã dự phòng (hiện một lần khi bật): đặt lại mật khẩu một tài khoản Chủ khi mất hết mật khẩu; dùng xong sinh mã mới.
 * - Không bao giờ ghi mật khẩu, mã khôi phục, mã phiên vào nhật ký, thông báo lỗi, file xuất hay đường dẫn URL.
 * - Luôn còn ít nhất MỘT tài khoản Chủ đang hoạt động. Không xóa người dùng (chỉ vô hiệu hóa) để giữ truy vết.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const MK = require('./matKhau');
const Q = require('./quyen');
const { AUTH_SQL, AUTH_TABLE_NAMES } = require('./db');

const COOKIE = 'stc_phien';
const MAC_DINH = { phutCho: 60, gioToiDa: 12 };
const GIOI_HAN = { phutCho: [5, 480], gioToiDa: [1, 72] };
const SAI_TOI_DA = 5;
const PHUT_KHOA = [5, 15, 60]; // lần khóa thứ 1, 2, 3 trở đi
const IP_SAI_TOI_DA = 20;      // số lần sai từ một địa chỉ trong IP_CUA_SO thì chặn địa chỉ đó
const IP_CUA_SO = 15 * 60000;
const IP_PHUT_CHAN = 15;
const MA_KHOI_PHUC_PHUT = 15;
const MA_KHOI_PHUC_SAI_TOI_DA = 5;
const NGUOI_MAY = 'Người dùng máy này';
const BANG_CHU = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 ký tự, bỏ I O 0 1 dễ nhầm
const TEN_HOP_LE = /^[\p{L}\p{N}._-]{3,40}$/u;

const LOAI_SU_KIEN = {
  'dang-nhap': 'Đăng nhập thành công',
  'dang-nhap-that-bai': 'Đăng nhập thất bại',
  'dang-nhap-khi-khoa': 'Thử đăng nhập khi tài khoản đang khóa',
  'dang-xuat': 'Đăng xuất',
  'het-phien': 'Hết phiên đăng nhập',
  'khoa-tai-khoan': 'Khóa tài khoản (nhập sai nhiều lần)',
  'chan-dia-chi': 'Chặn địa chỉ nguồn (nhập sai nhiều lần)',
  'mo-khoa': 'Mở khóa tài khoản',
  'doi-mat-khau': 'Đổi mật khẩu',
  'doi-mat-khau-that-bai': 'Đổi mật khẩu: sai mật khẩu cũ',
  'dat-lai-mat-khau': 'Đặt lại mật khẩu (bởi Chủ)',
  'yeu-cau-ma-khoi-phuc': 'Yêu cầu mã khôi phục (quên mật khẩu)',
  'dat-lai-bang-ma': 'Đặt lại mật khẩu bằng mã khôi phục',
  'ma-khoi-phuc-sai': 'Mã khôi phục sai / hết hạn',
  'dung-ma-du-phong': 'Dùng mã khôi phục dự phòng',
  'ma-du-phong-sai': 'Mã dự phòng sai',
  'tao-ma-du-phong': 'Tạo mã khôi phục dự phòng mới',
  'bat-dang-nhap': 'Bật đăng nhập',
  'tat-dang-nhap': 'Tắt đăng nhập',
  'doi-cau-hinh': 'Đổi cấu hình đăng nhập',
  'tao-nguoi-dung': 'Tạo người dùng',
  'sua-nguoi-dung': 'Sửa họ tên người dùng',
  'doi-vai-tro': 'Đổi vai trò',
  'vo-hieu-hoa': 'Vô hiệu hóa tài khoản',
  'kich-hoat': 'Kích hoạt lại tài khoản',
  'cuu-ho-dong-lenh': 'Đặt lại mật khẩu Chủ bằng lệnh cứu hộ',
  'khoi-phuc-sao-luu': 'Khôi phục sao lưu (hủy mọi phiên)'
};

const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
function bangNhau(a, b) {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
// Mã ngẫu nhiên n ký tự từ bảng 32 chữ (256 chia hết cho 32 → không lệch phân bố)
function taoMa(n) {
  const b = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += BANG_CHU[b[i] % 32];
  return s;
}
const nhomMa = (s, k) => s.match(new RegExp('.{1,' + (k || 4) + '}', 'g')).join('-');
const chuanMa = (s) => String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const khoaTen = (t) => String(t == null ? '' : t).normalize('NFC').trim().toLowerCase();

module.exports = function createAuth(h) {
  const { store, HttpError, str, readJson, sendJson } = h;
  const als = new AsyncLocalStorage();
  const fileDongHo = process.env.KETOAN_DONG_HO_GIA || ''; // CHỈ dùng khi kiểm thử: file chứa số mili-giây cộng thêm vào đồng hồ

  function now() {
    if (!fileDongHo) return Date.now();
    let lech = 0;
    try { lech = Number(fs.readFileSync(fileDongHo, 'utf8')) || 0; } catch (e) { lech = 0; }
    return Date.now() + lech;
  }
  const iso = (t) => new Date(t).toISOString();
  const st = (sql) => store.sql.stmt(sql);
  const loi = (status, msg, code) => Object.assign(new HttpError(status, msg), code ? { code } : {});

  // File thiếu bảng (vd. file sao lưu tải về đã bỏ dữ liệu đăng nhập, chép đè bằng tay): tạo bảng rỗng → đăng nhập tắt
  function damBaoBang() { AUTH_SQL.forEach((s) => store.sql.conn.exec(s)); }
  damBaoBang();

  /* ---------------- cấu hình ---------------- */
  // Cấu hình đọc một lần rồi giữ trong bộ nhớ (chỉ máy chủ này ghi bảng cấu hình): mỗi yêu cầu cần biết "đăng nhập có bật không",
  // không được đọc file mỗi lần — khi chương trình khác đang khóa file, phần mềm (đăng nhập tắt) vẫn phải xem được dữ liệu như trước.
  const cfgNho = new Map();
  function cfg(k, def) {
    if (!cfgNho.has(k)) {
      const r = st('SELECT "giaTri" FROM "cauHinhDangNhap" WHERE "khoa" = ?').get(k);
      cfgNho.set(k, r ? r.giaTri : null);
    }
    const v = cfgNho.get(k);
    return v == null ? def : JSON.parse(v);
  }
  function datCfg(k, v) {
    cfgNho.delete(k); // ghi trong giao dịch có thể bị hủy: lần đọc sau lấy lại từ file
    st('INSERT INTO "cauHinhDangNhap" ("khoa", "giaTri") VALUES (?, ?) ON CONFLICT ("khoa") DO UPDATE SET "giaTri" = excluded."giaTri"').run(k, JSON.stringify(v));
  }
  function xoaCfg(k) { cfgNho.delete(k); st('DELETE FROM "cauHinhDangNhap" WHERE "khoa" = ?').run(k); }
  function dangBat() { return cfg('bat', false) === true; }
  function thoiGian() {
    const c = cfg('thoiGian', {}) || {};
    return { phutCho: Number(c.phutCho) || MAC_DINH.phutCho, gioToiDa: Number(c.gioToiDa) || MAC_DINH.gioToiDa };
  }

  /* ---------------- người dùng ---------------- */
  const nd = (id) => st('SELECT * FROM "nguoiDung" WHERE "id" = ?').get(Number(id)) || null;
  const ndTheoTen = (ten) => { const k = khoaTen(ten); return k ? st('SELECT * FROM "nguoiDung" WHERE "khoaTen" = ?').get(k) || null : null; };
  const soNguoiDung = () => st('SELECT count(*) AS n FROM "nguoiDung"').get().n;
  const soChuHoatDong = () => st('SELECT count(*) AS n FROM "nguoiDung" WHERE "vaiTro" = \'chu\' AND "hoatDong" = 1').get().n;

  function congKhai(u) {
    const t = now();
    return {
      id: u.id, tenDangNhap: u.tenDangNhap, hoTen: u.hoTen, vaiTro: u.vaiTro, tenVaiTro: Q.VAI_TRO[u.vaiTro] || u.vaiTro,
      hoatDong: u.hoatDong === 1, phaiDoiMatKhau: u.phaiDoiMatKhau === 1, dangKhoa: u.khoaDen > t, khoaDen: u.khoaDen > t ? iso(u.khoaDen) : '',
      saiLienTiep: u.saiLienTiep, lanDangNhapCuoi: u.lanDangNhapCuoi || '', taoLuc: u.taoLuc, doiMatKhauLuc: u.doiMatKhauLuc || ''
    };
  }
  // Tên hiển thị người thao tác (nhật ký, "người tạo / người sửa")
  const tenHienThi = (u) => u.hoTen + ' (' + u.tenDangNhap + ')';
  function tenNguoiMap() {
    const out = {};
    st('SELECT "id", "hoTen", "tenDangNhap" FROM "nguoiDung"').all().forEach((u) => { out[u.id] = tenHienThi(u); });
    return out;
  }

  function kiemTenDangNhap(v) {
    const t = str(v, 60);
    if (!TEN_HOP_LE.test(t)) throw loi(400, 'Tên đăng nhập 3–40 ký tự, chỉ gồm chữ, số, dấu chấm, gạch dưới, gạch ngang (không có khoảng trắng)');
    return t;
  }
  function kiemHoTen(v) {
    const t = str(v, 100);
    if (!t) throw loi(400, 'Cần nhập họ tên');
    return t;
  }
  function kiemVaiTro(v) {
    if (!Object.prototype.hasOwnProperty.call(Q.VAI_TRO, v)) throw loi(400, 'Vai trò không hợp lệ (Chủ, Kế toán hoặc Chỉ xem)');
    return v;
  }
  // Mật khẩu nhận từ người dùng: chuỗi, dài tối đa 1000 (chặn gửi chuỗi khổng lồ bắt máy chủ băm)
  function layMatKhau(v) {
    if (typeof v !== 'string' || v.length > 1000) return '';
    return v.normalize('NFC');
  }
  function kiemMatKhauMoi(mk, mk2, tenDangNhap) {
    const a = layMatKhau(mk);
    if (mk2 !== undefined && a !== layMatKhau(mk2)) throw loi(400, 'Hai lần nhập mật khẩu mới không khớp');
    const e = MK.loiChinhSach(a, tenDangNhap);
    if (e) throw loi(400, e);
    return a;
  }

  async function taoNguoi(x, nguoiLam, ip) {
    if (ndTheoTen(x.tenDangNhap)) throw loi(400, 'Tên đăng nhập "' + x.tenDangNhap + '" đã có');
    const hash = await MK.bam(x.matKhau);
    if (ndTheoTen(x.tenDangNhap)) throw loi(400, 'Tên đăng nhập "' + x.tenDangNhap + '" đã có');
    const t = iso(now());
    const r = st('INSERT INTO "nguoiDung" ("tenDangNhap", "khoaTen", "hoTen", "vaiTro", "matKhau", "hoatDong", "phaiDoiMatKhau", "taoLuc", "suaLuc", "doiMatKhauLuc") ' +
      'VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)').run(x.tenDangNhap, khoaTen(x.tenDangNhap), x.hoTen, x.vaiTro, hash, x.phaiDoiMatKhau ? 1 : 0, t, t, t);
    const u = nd(Number(r.lastInsertRowid));
    suKien('tao-nguoi-dung', { u, nguoiLam, ip, chiTiet: 'Vai trò ' + Q.VAI_TRO[u.vaiTro] });
    return u;
  }

  async function datMatKhau(u, matKhau, phaiDoi) {
    const hash = await MK.bam(matKhau);
    const t = iso(now());
    st('UPDATE "nguoiDung" SET "matKhau" = ?, "phaiDoiMatKhau" = ?, "doiMatKhauLuc" = ?, "suaLuc" = ?, "saiLienTiep" = 0, "soLanKhoa" = 0, "khoaDen" = 0 WHERE "id" = ?')
      .run(hash, phaiDoi ? 1 : 0, t, t, u.id);
  }

  /* ---------------- sự kiện bảo mật (không bao giờ có mật khẩu / mã) ---------------- */
  function suKien(loai, o) {
    o = o || {};
    const u = o.u || null;
    st('INSERT INTO "suKienBaoMat" ("luc", "loai", "nguoiDungId", "tenDangNhap", "nguoiLam", "ip", "chiTiet") VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(iso(now()), loai, u ? u.id : null, u ? u.tenDangNhap : (o.ten ? String(o.ten).slice(0, 60) : null), o.nguoiLam || null, o.ip || null, o.chiTiet || null);
  }

  /* ---------------- phiên ---------------- */
  function docCookie(req) {
    const raw = String((req.headers && req.headers.cookie) || '');
    for (const part of raw.split(';')) {
      const i = part.indexOf('=');
      if (i > 0 && part.slice(0, i).trim() === COOKIE) {
        const v = part.slice(i + 1).trim();
        return /^[A-Za-z0-9_-]{20,100}$/.test(v) ? v : '';
      }
    }
    return '';
  }
  // Không đặt "Secure" vì phần mềm chạy http trên chính máy (localhost). Khi có HTTPS (vd mở cho mạng nội bộ): thêm "; Secure".
  const datCookie = (res, token) => res.setHeader('Set-Cookie', COOKIE + '=' + token + '; HttpOnly; SameSite=Strict; Path=/');
  const xoaCookie = (res) => res.setHeader('Set-Cookie', COOKIE + '=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');

  function taoPhien(res, u, ip) {
    const token = crypto.randomBytes(32).toString('base64url');
    const t = now();
    st('INSERT INTO "phienDangNhap" ("bam", "nguoiDungId", "taoLuc", "hoatDongLuc", "ip") VALUES (?, ?, ?, ?, ?)').run(sha(token), u.id, t, t, ip || null);
    datCookie(res, token);
    return st('SELECT * FROM "phienDangNhap" WHERE "bam" = ?').get(sha(token));
  }
  function hetHan(p, t) {
    const tg = thoiGian();
    return t - p.hoatDongLuc > tg.phutCho * 60000 || t - p.taoLuc > tg.gioToiDa * 3600000;
  }
  // { u, phien } nếu phiên hợp lệ; { hetHan: true } nếu có cookie nhưng phiên không còn; null nếu không có cookie
  function docPhien(req) {
    const token = docCookie(req);
    if (!token) return null;
    const p = st('SELECT * FROM "phienDangNhap" WHERE "bam" = ?').get(sha(token));
    if (!p) return { hetHan: true };
    const t = now();
    const u = nd(p.nguoiDungId);
    if (!u || u.hoatDong !== 1 || hetHan(p, t)) {
      st('DELETE FROM "phienDangNhap" WHERE "bam" = ?').run(p.bam);
      if (u && u.hoatDong === 1) suKien('het-phien', { u, ip: ipOf(req) });
      return { hetHan: true };
    }
    return { u, phien: p };
  }
  function chamPhien(p, batBuoc) {
    const t = now();
    if (batBuoc || t - p.hoatDongLuc > 5000) {
      st('UPDATE "phienDangNhap" SET "hoatDongLuc" = ? WHERE "bam" = ?').run(t, p.bam);
      p.hoatDongLuc = t;
    }
  }
  const huyPhienCua = (id, truBam) => st('DELETE FROM "phienDangNhap" WHERE "nguoiDungId" = ? AND "bam" <> ?').run(id, truBam || '');
  const huyMoiPhien = () => st('DELETE FROM "phienDangNhap"').run();
  function donPhien() {
    if (!store.sql) return;
    const tg = thoiGian();
    const t = now();
    try { st('DELETE FROM "phienDangNhap" WHERE "hoatDongLuc" < ? OR "taoLuc" < ?').run(t - tg.phutCho * 60000, t - tg.gioToiDa * 3600000); } catch (e) { /* lần sau */ }
  }
  setInterval(donPhien, 10 * 60000).unref();

  function ipOf(req) {
    const a = String((req.socket && req.socket.remoteAddress) || '');
    return a.replace(/^::ffff:/, '') || 'không rõ';
  }

  /* ---------------- chống đoán mật khẩu ---------------- */
  const ipSai = new Map();  // địa chỉ → { ds: [thời điểm sai], lan, khoaDen }
  const tenLa = new Map();  // tên đăng nhập KHÔNG tồn tại → { sai, lan, khoaDen } (đếm giống hệt tài khoản thật)
  const phutConLai = (den) => Math.max(1, Math.ceil((den - now()) / 60000));
  function ipBiChan(ip) { const x = ipSai.get(ip); return x && x.khoaDen > now() ? x.khoaDen : 0; }
  function ghiSaiIp(ip) {
    const t = now();
    const x = ipSai.get(ip) || { ds: [], lan: 0, khoaDen: 0 };
    x.ds = x.ds.filter((a) => t - a < IP_CUA_SO);
    x.ds.push(t);
    if (x.ds.length >= IP_SAI_TOI_DA) {
      x.lan++;
      x.khoaDen = t + IP_PHUT_CHAN * Math.min(x.lan, 4) * 60000;
      x.ds = [];
      suKien('chan-dia-chi', { ip, chiTiet: 'Chặn ' + IP_PHUT_CHAN * Math.min(x.lan, 4) + ' phút' });
    }
    ipSai.set(ip, x);
  }
  function trangThaiSai(u, kt) {
    if (u) return { sai: u.saiLienTiep, lan: u.soLanKhoa, khoaDen: u.khoaDen };
    return Object.assign({ sai: 0, lan: 0, khoaDen: 0 }, tenLa.get(kt) || {});
  }
  function dangKhoa(u, kt) { const s = trangThaiSai(u, kt); return s.khoaDen > now() ? s.khoaDen : 0; }
  function ghiSai(u, kt, ip, loai, chiTiet) {
    const s = trangThaiSai(u, kt);
    s.sai++;
    let phut = 0;
    if (s.sai >= SAI_TOI_DA) {
      s.lan++;
      phut = PHUT_KHOA[Math.min(s.lan, PHUT_KHOA.length) - 1];
      s.khoaDen = now() + phut * 60000;
      s.sai = 0;
    }
    if (u) st('UPDATE "nguoiDung" SET "saiLienTiep" = ?, "soLanKhoa" = ?, "khoaDen" = ? WHERE "id" = ?').run(s.sai, s.lan, s.khoaDen, u.id);
    else if (kt) {
      if (tenLa.size > 5000) tenLa.clear();
      tenLa.set(kt, s);
    }
    ghiSaiIp(ip);
    suKien(loai || 'dang-nhap-that-bai', { u, ten: kt, ip, chiTiet });
    if (phut) suKien('khoa-tai-khoan', { u, ten: kt, ip, chiTiet: 'Khóa ' + phut + ' phút (lần khóa thứ ' + s.lan + ')' });
  }
  function hetSai(u) { st('UPDATE "nguoiDung" SET "saiLienTiep" = 0, "soLanKhoa" = 0, "khoaDen" = 0 WHERE "id" = ?').run(u.id); }
  const MSG_SAI = 'Sai tên đăng nhập hoặc mật khẩu.';
  const msgKhoa = (den) => 'Tài khoản đang tạm khóa vì nhập sai nhiều lần. Hãy thử lại sau ' + phutConLai(den) + ' phút (hoặc nhờ người có vai trò Chủ mở khóa).';
  const msgIp = (den) => 'Nhập sai quá nhiều lần từ máy này. Hãy thử lại sau ' + phutConLai(den) + ' phút.';

  // Kiểm tra tên + mật khẩu (luôn chạy scrypt). Trả người dùng nếu đúng; sai thì đếm, có thể khóa, rồi ném lỗi chung.
  async function xacMinh(ten, matKhau, ip, dieuKien) {
    const kt = khoaTen(str(ten, 100));
    const u = kt ? ndTheoTen(kt) : null;
    const dung = await MK.kiemTra(layMatKhau(matKhau), u ? u.matKhau : null);
    const chan = ipBiChan(ip);
    if (chan) throw loi(429, msgIp(chan), 'CHAN_DIA_CHI');
    const den = dangKhoa(u, kt);
    if (den) { suKien('dang-nhap-khi-khoa', { u, ten: kt, ip }); throw loi(429, msgKhoa(den), 'TAI_KHOAN_KHOA'); }
    if (!u || !dung || u.hoatDong !== 1 || (dieuKien && !dieuKien(u))) {
      ghiSai(u, kt, ip);
      throw loi(401, MSG_SAI, 'SAI_DANG_NHAP');
    }
    hetSai(u);
    return u;
  }

  /* ---------------- trạng thái gửi giao diện ---------------- */
  function goiTrangThai(u, p) {
    const bat = dangBat();
    const tg = thoiGian();
    const t = now();
    const out = { ok: true, bat, cauHinh: tg, vaiTro: Q.VAI_TRO, nguoiDung: null, quyen: bat ? [] : Object.keys(Q.HANH_DONG), phien: null };
    if (!bat) { out.coTaiKhoan = soNguoiDung() > 0; return out; }
    if (u) {
      out.nguoiDung = congKhai(u);
      out.quyen = Q.hanhDongCua(u.vaiTro);
      out.tenNguoi = tenNguoiMap();
      if (p) out.phien = { conLaiCho: p.hoatDongLuc + tg.phutCho * 60000 - t, conLaiToiDa: p.taoLuc + tg.gioToiDa * 3600000 - t };
    }
    return out;
  }

  /* ---------------- kiểm soát mọi yêu cầu /api/* (gọi trước khi xử lý) ---------------- */
  // Chống CSRF: yêu cầu thay đổi dữ liệu phải đến từ chính trang của phần mềm (Origin hoặc Referer khớp địa chỉ máy chủ)
  function kiemNguon(req) {
    const host = String(req.headers.host || '');
    const goc = 'http://' + host;
    const origin = req.headers.origin;
    if (origin) { if (origin === goc) return; }
    else {
      const ref = String(req.headers.referer || '');
      if (ref === goc || ref.startsWith(goc + '/')) return;
    }
    throw loi(403, 'Yêu cầu bị chặn vì không đến từ trang của phần mềm (chống giả mạo yêu cầu).', 'SAI_NGUON');
  }

  function xacThuc(req, url) {
    req.nguoiDung = null;
    if (!dangBat()) return;
    const m = String(req.method || '').toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(m)) kiemNguon(req);
    const r = Q.timRoute(m, url.pathname, url);
    const ph = docPhien(req);
    if (ph && ph.u) { req.nguoiDung = ph.u; req.phien = ph.phien; chamPhien(ph.phien); }
    if (!r) throw loi(403, 'Chức năng ' + m + ' ' + url.pathname + ' chưa được khai báo trong bảng phân quyền nên bị chặn khi đăng nhập đang bật.', 'CHUA_KHAI_BAO');
    req.hanhDong = r.hanhDong;
    if (r.hanhDong === 'cong-khai') return;
    if (!req.nguoiDung) {
      throw ph && ph.hetHan ? loi(401, 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để tiếp tục.', 'HET_PHIEN') : loi(401, 'Bạn cần đăng nhập để dùng phần mềm.', 'CHUA_DANG_NHAP');
    }
    if (req.nguoiDung.phaiDoiMatKhau === 1 && r.hanhDong !== 'da-dang-nhap') throw loi(403, 'Bạn cần đổi mật khẩu trước khi tiếp tục.', 'PHAI_DOI_MAT_KHAU');
    if (!Q.choPhep(req.nguoiDung.vaiTro, r.hanhDong)) throw loi(403, Q.thongBaoCam(r.hanhDong), 'KHONG_CO_QUYEN');
  }

  // Người thao tác: tên hiển thị (nhật ký thay đổi) và nhãn lưu vào nguoiTao / nguoiSua của bản ghi
  function ai(req) { return req && req.nguoiDung ? tenHienThi(req.nguoiDung) : ''; }
  function nhanNguoi(req) { return req && req.nguoiDung ? String(req.nguoiDung.id) : NGUOI_MAY; }
  function nhanHienTai() { const c = als.getStore(); return c && c.nguoiDung ? String(c.nguoiDung.id) : NGUOI_MAY; }

  /* ---------------- mã khôi phục (quên mật khẩu) ---------------- */
  const thuMucKhoiPhuc = () => path.join(store.dir, 'khoi-phuc');
  const fileKhoiPhuc = () => path.join(thuMucKhoiPhuc(), 'MA_KHOI_PHUC.txt');
  function xoaFileKhoiPhuc() { try { fs.unlinkSync(fileKhoiPhuc()); } catch (e) { /* không có */ } }
  function ghiFileKhoiPhuc(u, ma, den) {
    fs.mkdirSync(thuMucKhoiPhuc(), { recursive: true });
    const gio = new Date(den).toLocaleString('vi-VN', { hour12: false });
    const noiDung = [
      'MÃ KHÔI PHỤC MẬT KHẨU — Sổ Thu Chi',
      '',
      'Tài khoản: ' + u.tenDangNhap + ' (' + u.hoTen + ')',
      'Mã:        ' + nhomMa(ma, 5),
      'Hết hạn:   ' + gio + ' (' + MA_KHOI_PHUC_PHUT + ' phút kể từ lúc yêu cầu)',
      '',
      'Cách dùng: ở màn hình đăng nhập bấm "Quên mật khẩu", nhập tên đăng nhập, mã này và mật khẩu mới.',
      'Mã chỉ dùng được MỘT lần; nhập sai ' + MA_KHOI_PHUC_SAI_TOI_DA + ' lần thì mã bị hủy. Dùng xong file này tự bị xóa.',
      'Không gửi mã này cho người khác. Nếu bạn không yêu cầu mã, hãy xóa file này và báo người quản trị (Chủ).',
      ''
    ].join('\r\n');
    fs.writeFileSync(fileKhoiPhuc(), '﻿' + noiDung, { mode: 0o600 });
  }

  /* ---------------- xử lý API ---------------- */
  const USERS = /^\/api\/users(\/|$)/;
  async function handle(req, res, url) {
    const p = url.pathname;
    if (!p.startsWith('/api/auth/') && !USERS.test(p)) return false;
    const m = req.method;
    // chỉ các đường dẫn có trong ma trận quyền; đường dẫn lạ → "Không có chức năng" như mọi chỗ khác (kể cả khi đăng nhập tắt)
    if (!Q.timRoute(m, p, url)) throw new HttpError(404, 'Không có chức năng ' + m + ' ' + p);
    const seg = p.split('/').filter(Boolean);
    const ip = ipOf(req);
    const bat = dangBat();
    const tat = () => { throw loi(409, 'Chức năng đăng nhập đang tắt. Bật ở Cài đặt → Đăng nhập và phân quyền.', 'DANG_TAT'); };
    const toi = req.nguoiDung;

    if (p === '/api/auth/trang-thai' && m === 'GET') {
      const ph = bat ? docPhien(req) : null;
      sendJson(res, 200, goiTrangThai(ph && ph.u, ph && ph.phien));
      return true;
    }

    // Bật đăng nhập (chỉ khi đang tắt). Chưa có tài khoản: tạo ngay tài khoản Chủ đầu tiên. Đã có (bật lại): đăng nhập bằng một tài khoản Chủ.
    if (p === '/api/auth/bat' && m === 'POST') {
      if (bat) throw loi(409, 'Đăng nhập đang bật rồi');
      const b = await readJson(req);
      let u;
      if (!soNguoiDung()) {
        const x = { tenDangNhap: kiemTenDangNhap(b.tenDangNhap), hoTen: kiemHoTen(b.hoTen), vaiTro: 'chu' };
        x.matKhau = kiemMatKhauMoi(b.matKhau, b.matKhau2, x.tenDangNhap);
        u = await taoNguoi(x, NGUOI_MAY, ip);
      } else {
        u = await xacMinh(b.tenDangNhap, b.matKhau, ip, (x) => x.vaiTro === 'chu');
      }
      const ma = taoMa(20);
      datCfg('maDuPhong', { bam: sha(ma), taoLuc: iso(now()) });
      datCfg('bat', true);
      huyMoiPhien();
      const ph = taoPhien(res, u, ip);
      st('UPDATE "nguoiDung" SET "lanDangNhapCuoi" = ? WHERE "id" = ?').run(iso(now()), u.id);
      suKien('bat-dang-nhap', { u, ip, nguoiLam: tenHienThi(u) });
      store.audit({ by: tenHienThi(u), action: 'cai-dat', kind: 'settings', recId: 'dang-nhap', label: 'Bật đăng nhập và phân quyền' });
      store.flushAudit();
      // Mã dự phòng hiện MỘT lần duy nhất ở đây (giao diện bắt xác nhận đã lưu); CSDL chỉ giữ bản băm
      sendJson(res, 200, Object.assign(goiTrangThai(nd(u.id), ph), { maDuPhong: nhomMa(ma) }));
      return true;
    }

    if (p === '/api/auth/dang-nhap' && m === 'POST') {
      if (!bat) tat();
      const b = await readJson(req);
      const u = await xacMinh(b.tenDangNhap, b.matKhau, ip);
      // tự nâng tham số băm: mã băm cũ (tham số yếu hơn) → băm lại bằng tham số hiện hành
      if (MK.canBamLai(u.matKhau)) {
        const hash = await MK.bam(layMatKhau(b.matKhau));
        st('UPDATE "nguoiDung" SET "matKhau" = ? WHERE "id" = ?').run(hash, u.id);
      }
      const cu = docCookie(req);
      if (cu) st('DELETE FROM "phienDangNhap" WHERE "bam" = ?').run(sha(cu)); // luôn tạo mã phiên MỚI (chống cố định phiên)
      st('UPDATE "nguoiDung" SET "lanDangNhapCuoi" = ? WHERE "id" = ?').run(iso(now()), u.id);
      const ph = taoPhien(res, u, ip);
      suKien('dang-nhap', { u, ip });
      sendJson(res, 200, goiTrangThai(nd(u.id), ph));
      return true;
    }

    if (p === '/api/auth/dang-xuat' && m === 'POST') {
      const cu = docCookie(req);
      if (cu && store.sql) {
        const ph = st('SELECT * FROM "phienDangNhap" WHERE "bam" = ?').get(sha(cu));
        if (ph) { st('DELETE FROM "phienDangNhap" WHERE "bam" = ?').run(ph.bam); suKien('dang-xuat', { u: nd(ph.nguoiDungId), ip }); }
      }
      xoaCookie(res);
      sendJson(res, 200, { ok: true });
      return true;
    }

    // Quên mật khẩu: ghi mã vào file trên máy chủ. Trả lời GIỐNG NHAU dù tên có tồn tại hay không.
    if (p === '/api/auth/quen-mat-khau' && m === 'POST') {
      if (!bat) tat();
      const b = await readJson(req);
      const chan = ipBiChan(ip);
      if (chan) throw loi(429, msgIp(chan), 'CHAN_DIA_CHI');
      const kt = khoaTen(str(b.tenDangNhap, 100));
      const u = kt ? ndTheoTen(kt) : null;
      if (u && u.hoatDong === 1) {
        const ma = taoMa(10);
        const den = now() + MA_KHOI_PHUC_PHUT * 60000;
        datCfg('maKhoiPhuc', { id: u.id, bam: sha(ma), hetHan: den, sai: 0 });
        ghiFileKhoiPhuc(u, ma, den);
        suKien('yeu-cau-ma-khoi-phuc', { u, ip, chiTiet: 'Ghi mã vào file' });
      } else {
        suKien('yeu-cau-ma-khoi-phuc', { ten: kt, ip, chiTiet: 'Tên không có hoặc tài khoản không hoạt động — không ghi file' });
      }
      sendJson(res, 200, { ok: true, file: fileKhoiPhuc(), phut: MA_KHOI_PHUC_PHUT,
        thongBao: 'Nếu tên đăng nhập đúng, mã khôi phục đã được ghi vào file ' + fileKhoiPhuc() + ' trên máy đang chạy phần mềm. Hãy mở file đó để lấy mã ' +
          '(mã dùng một lần, hết hạn sau ' + MA_KHOI_PHUC_PHUT + ' phút).' });
      return true;
    }

    if (p === '/api/auth/dat-lai-bang-ma' && m === 'POST') {
      if (!bat) tat();
      const b = await readJson(req);
      const chan = ipBiChan(ip);
      if (chan) throw loi(429, msgIp(chan), 'CHAN_DIA_CHI');
      const u = ndTheoTen(str(b.tenDangNhap, 100));
      const matKhau = kiemMatKhauMoi(b.matKhauMoi, b.matKhauMoi2, u ? u.tenDangNhap : str(b.tenDangNhap, 100));
      const pk = cfg('maKhoiPhuc', null);
      const cuaNguoi = !!(pk && u && pk.id === u.id);
      const dung = cuaNguoi && pk.hetHan > now() && u.hoatDong === 1 && bangNhau(sha(chuanMa(b.ma)), pk.bam);
      if (!dung) {
        if (cuaNguoi) {
          pk.sai = (pk.sai || 0) + 1;
          if (pk.sai >= MA_KHOI_PHUC_SAI_TOI_DA || pk.hetHan <= now()) { xoaCfg('maKhoiPhuc'); xoaFileKhoiPhuc(); } else datCfg('maKhoiPhuc', pk);
        }
        ghiSaiIp(ip);
        suKien('ma-khoi-phuc-sai', { u, ten: u ? null : khoaTen(b.tenDangNhap), ip });
        throw loi(400, 'Mã khôi phục không đúng hoặc đã hết hạn. Hãy kiểm tra lại, hoặc bấm "Lấy mã mới".', 'MA_SAI');
      }
      await datMatKhau(u, matKhau, false);
      xoaCfg('maKhoiPhuc');
      xoaFileKhoiPhuc();
      huyPhienCua(u.id);
      suKien('dat-lai-bang-ma', { u, ip });
      sendJson(res, 200, { ok: true, thongBao: 'Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.' });
      return true;
    }

    // Mã khôi phục dự phòng: đặt lại mật khẩu một tài khoản Chủ (khi mất hết mật khẩu Chủ). Dùng xong sinh mã mới (hiện một lần).
    if (p === '/api/auth/dung-ma-du-phong' && m === 'POST') {
      if (!bat) tat();
      const b = await readJson(req);
      const chan = ipBiChan(ip);
      if (chan) throw loi(429, msgIp(chan), 'CHAN_DIA_CHI');
      const u = ndTheoTen(str(b.tenDangNhap, 100));
      const matKhau = kiemMatKhauMoi(b.matKhauMoi, b.matKhauMoi2, u ? u.tenDangNhap : str(b.tenDangNhap, 100));
      const d = cfg('maDuPhong', null);
      const dung = !!(d && u && u.vaiTro === 'chu' && bangNhau(sha(chuanMa(b.maDuPhong)), d.bam));
      if (!dung) {
        ghiSaiIp(ip);
        suKien('ma-du-phong-sai', { u, ten: u ? null : khoaTen(b.tenDangNhap), ip });
        throw loi(400, 'Mã dự phòng không đúng, hoặc tên đăng nhập không phải tài khoản Chủ.', 'MA_SAI');
      }
      await datMatKhau(u, matKhau, false);
      st('UPDATE "nguoiDung" SET "hoatDong" = 1 WHERE "id" = ?').run(u.id);
      huyPhienCua(u.id);
      const ma = taoMa(20);
      datCfg('maDuPhong', { bam: sha(ma), taoLuc: iso(now()) });
      suKien('dung-ma-du-phong', { u, ip, chiTiet: 'Đặt lại mật khẩu; đã tạo mã dự phòng mới' });
      sendJson(res, 200, { ok: true, maDuPhong: nhomMa(ma), thongBao: 'Đã đặt lại mật khẩu. Mã dự phòng cũ hết hiệu lực — hãy lưu mã dự phòng MỚI.' });
      return true;
    }

    // ----- từ đây: cần đăng nhập (xacThuc đã kiểm quyền theo lib/quyen.js) -----
    if (!bat) tat();
    if (!toi) throw loi(401, 'Bạn cần đăng nhập để dùng phần mềm.', 'CHUA_DANG_NHAP');

    if (p === '/api/auth/toi' && m === 'GET') { sendJson(res, 200, goiTrangThai(toi, req.phien)); return true; }

    if (p === '/api/auth/gia-han' && m === 'POST') {
      chamPhien(req.phien, true);
      sendJson(res, 200, goiTrangThai(toi, req.phien));
      return true;
    }

    if (p === '/api/auth/doi-mat-khau' && m === 'POST') {
      const b = await readJson(req);
      const dung = await MK.kiemTra(layMatKhau(b.matKhauCu), toi.matKhau);
      if (!dung) {
        ghiSai(toi, khoaTen(toi.tenDangNhap), ip, 'doi-mat-khau-that-bai');
        throw loi(400, 'Mật khẩu hiện tại không đúng.', 'SAI_MAT_KHAU_CU');
      }
      const moi = kiemMatKhauMoi(b.matKhauMoi, b.matKhauMoi2, toi.tenDangNhap);
      if (await MK.kiemTra(moi, toi.matKhau)) throw loi(400, 'Mật khẩu mới phải khác mật khẩu hiện tại');
      await datMatKhau(toi, moi, false);
      huyPhienCua(toi.id, req.phien.bam); // các phiên khác của chính người này bị hủy, phiên đang dùng giữ lại
      suKien('doi-mat-khau', { u: toi, ip, nguoiLam: tenHienThi(toi) });
      sendJson(res, 200, Object.assign(goiTrangThai(nd(toi.id), req.phien), { thongBao: 'Đã đổi mật khẩu.' }));
      return true;
    }

    if (p === '/api/auth/tat' && m === 'POST') {
      const b = await readJson(req);
      if (!(await MK.kiemTra(layMatKhau(b.matKhau), toi.matKhau))) {
        ghiSai(toi, khoaTen(toi.tenDangNhap), ip);
        throw loi(400, 'Mật khẩu không đúng — chưa tắt đăng nhập.', 'SAI_MAT_KHAU_CU');
      }
      datCfg('bat', false);
      huyMoiPhien();
      xoaCookie(res);
      suKien('tat-dang-nhap', { u: toi, ip, nguoiLam: tenHienThi(toi) });
      store.audit({ by: tenHienThi(toi), action: 'cai-dat', kind: 'settings', recId: 'dang-nhap', label: 'Tắt đăng nhập và phân quyền (tài khoản giữ nguyên)' });
      store.flushAudit();
      sendJson(res, 200, goiTrangThai(null, null));
      return true;
    }

    if (p === '/api/auth/cau-hinh' && m === 'PUT') {
      const b = await readJson(req);
      const tg = thoiGian();
      const before = Object.assign({}, tg);
      [['phutCho', 'Thời gian chờ (phút)'], ['gioToiDa', 'Thời gian tối đa (giờ)']].forEach(([k, ten]) => {
        if (b[k] === undefined) return;
        const n = Number(b[k]);
        if (!Number.isInteger(n) || n < GIOI_HAN[k][0] || n > GIOI_HAN[k][1]) throw loi(400, ten + ' phải từ ' + GIOI_HAN[k][0] + ' đến ' + GIOI_HAN[k][1]);
        tg[k] = n;
      });
      datCfg('thoiGian', tg);
      suKien('doi-cau-hinh', { u: toi, ip, nguoiLam: tenHienThi(toi), chiTiet: 'Hết phiên khi không thao tác ' + before.phutCho + ' → ' + tg.phutCho + ' phút; tối đa ' + before.gioToiDa + ' → ' + tg.gioToiDa + ' giờ' });
      sendJson(res, 200, goiTrangThai(toi, req.phien));
      return true;
    }

    if (p === '/api/auth/ma-du-phong' && m === 'POST') {
      const b = await readJson(req);
      if (!(await MK.kiemTra(layMatKhau(b.matKhau), toi.matKhau))) {
        ghiSai(toi, khoaTen(toi.tenDangNhap), ip);
        throw loi(400, 'Mật khẩu không đúng.', 'SAI_MAT_KHAU_CU');
      }
      const ma = taoMa(20);
      datCfg('maDuPhong', { bam: sha(ma), taoLuc: iso(now()) });
      suKien('tao-ma-du-phong', { u: toi, ip, nguoiLam: tenHienThi(toi) });
      sendJson(res, 200, { ok: true, maDuPhong: nhomMa(ma) });
      return true;
    }

    if (p === '/api/auth/su-kien' && m === 'GET') {
      const q = url.searchParams;
      const where = [];
      const args = [];
      if (q.get('loai') && LOAI_SU_KIEN[q.get('loai')]) { where.push('"loai" = ?'); args.push(q.get('loai')); }
      if (/^\d{4}-\d{2}-\d{2}$/.test(q.get('tu') || '')) { where.push('"luc" >= ?'); args.push(q.get('tu')); }
      if (/^\d{4}-\d{2}-\d{2}$/.test(q.get('den') || '')) { where.push('"luc" < ?'); args.push(q.get('den') + 'T99'); }
      if (q.get('q')) { where.push('("tenDangNhap" LIKE ? ESCAPE \'\\\' OR "nguoiLam" LIKE ? ESCAPE \'\\\' OR "ip" LIKE ? ESCAPE \'\\\' OR "chiTiet" LIKE ? ESCAPE \'\\\')'); const v = '%' + String(q.get('q')).slice(0, 100).replace(/[\\%_]/g, '\\$&') + '%'; args.push(v, v, v, v); }
      const lim = Math.min(Math.max(Number(q.get('limit')) || 200, 1), 2000);
      const sql = 'SELECT * FROM "suKienBaoMat"' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY "id" DESC LIMIT ?';
      const items = store.sql.conn.prepare(sql).all(...args, lim);
      sendJson(res, 200, { ok: true, items, loai: LOAI_SU_KIEN });
      return true;
    }

    /* ----- quản lý người dùng (chỉ Chủ — xacThuc đã chặn) ----- */
    if (seg[1] === 'users') {
      const danhSach = () => st('SELECT * FROM "nguoiDung" ORDER BY "id"').all().map(congKhai);
      if (seg.length === 2 && m === 'GET') { sendJson(res, 200, { ok: true, items: danhSach(), vaiTro: Q.VAI_TRO }); return true; }
      if (seg.length === 2 && m === 'POST') {
        const b = await readJson(req);
        const x = { tenDangNhap: kiemTenDangNhap(b.tenDangNhap), hoTen: kiemHoTen(b.hoTen), vaiTro: kiemVaiTro(b.vaiTro), phaiDoiMatKhau: true };
        x.matKhau = kiemMatKhauMoi(b.matKhau, b.matKhau2, x.tenDangNhap);
        const u = await taoNguoi(x, tenHienThi(toi), ip);
        sendJson(res, 200, { ok: true, nguoiDung: congKhai(u), items: danhSach() });
        return true;
      }
      const u = /^\d+$/.test(seg[2] || '') ? nd(seg[2]) : null;
      if (!u) throw loi(404, 'Không tìm thấy người dùng');
      const conChu = () => { if (soChuHoatDong() < 1) throw loi(409, 'Phải luôn còn ít nhất một tài khoản Chủ đang hoạt động — không thực hiện được.', 'CHU_CUOI'); };
      const doiTrongGiaoDich = (fn) => store.sql.tx(() => { fn(); conChu(); }); // kiểm "Chủ cuối cùng" sau khi đổi, sai thì hủy
      if (seg.length === 3 && m === 'PUT') {
        const b = await readJson(req);
        const hoTen = b.hoTen === undefined ? u.hoTen : kiemHoTen(b.hoTen);
        const vaiTro = b.vaiTro === undefined ? u.vaiTro : kiemVaiTro(b.vaiTro);
        doiTrongGiaoDich(() => st('UPDATE "nguoiDung" SET "hoTen" = ?, "vaiTro" = ?, "suaLuc" = ? WHERE "id" = ?').run(hoTen, vaiTro, iso(now()), u.id));
        if (hoTen !== u.hoTen) suKien('sua-nguoi-dung', { u, ip, nguoiLam: tenHienThi(toi), chiTiet: 'Họ tên: ' + u.hoTen + ' → ' + hoTen });
        if (vaiTro !== u.vaiTro) {
          huyPhienCua(u.id); // mọi phiên của người đó hết ngay (kể cả khi Chủ tự đổi vai trò của mình): đăng nhập lại theo vai trò mới
          suKien('doi-vai-tro', { u, ip, nguoiLam: tenHienThi(toi), chiTiet: Q.VAI_TRO[u.vaiTro] + ' → ' + Q.VAI_TRO[vaiTro] });
        }
        sendJson(res, 200, { ok: true, nguoiDung: congKhai(nd(u.id)), items: danhSach() });
        return true;
      }
      if (seg.length === 4 && seg[3] === 'trang-thai' && m === 'POST') {
        const b = await readJson(req);
        const hoatDong = b.hoatDong === true;
        doiTrongGiaoDich(() => st('UPDATE "nguoiDung" SET "hoatDong" = ?, "suaLuc" = ? WHERE "id" = ?').run(hoatDong ? 1 : 0, iso(now()), u.id));
        if (!hoatDong) huyPhienCua(u.id);
        if ((u.hoatDong === 1) !== hoatDong) suKien(hoatDong ? 'kich-hoat' : 'vo-hieu-hoa', { u, ip, nguoiLam: tenHienThi(toi) });
        sendJson(res, 200, { ok: true, nguoiDung: congKhai(nd(u.id)), items: danhSach() });
        return true;
      }
      if (seg.length === 4 && seg[3] === 'dat-lai-mat-khau' && m === 'POST') {
        const b = await readJson(req);
        if (u.id === toi.id) throw loi(400, 'Muốn đổi mật khẩu của chính mình, hãy dùng "Đổi mật khẩu" (phải nhập mật khẩu hiện tại).');
        const moi = kiemMatKhauMoi(b.matKhau, b.matKhau2, u.tenDangNhap);
        await datMatKhau(u, moi, true); // người dùng phải đổi mật khẩu ở lần đăng nhập kế tiếp
        huyPhienCua(u.id);
        suKien('dat-lai-mat-khau', { u, ip, nguoiLam: tenHienThi(toi), chiTiet: 'Bắt đổi mật khẩu ở lần đăng nhập kế tiếp' });
        sendJson(res, 200, { ok: true, nguoiDung: congKhai(nd(u.id)), items: danhSach() });
        return true;
      }
      if (seg.length === 4 && seg[3] === 'mo-khoa' && m === 'POST') {
        hetSai(u);
        suKien('mo-khoa', { u, ip, nguoiLam: tenHienThi(toi) });
        sendJson(res, 200, { ok: true, nguoiDung: congKhai(nd(u.id)), items: danhSach() });
        return true;
      }
    }
    throw new HttpError(404, 'Không có chức năng ' + m + ' ' + p);
  }

  // Sau khi khôi phục sao lưu / thay toàn bộ dữ liệu: hủy mọi phiên (người dùng, mật khẩu, trạng thái bật / tắt giữ nguyên)
  function sauKhiKhoiPhuc(req, res) {
    if (!dangBat()) return;
    huyMoiPhien();
    if (res) xoaCookie(res);
    suKien('khoi-phuc-sao-luu', { u: req && req.nguoiDung, ip: req ? ipOf(req) : null, nguoiLam: req && req.nguoiDung ? tenHienThi(req.nguoiDung) : null });
  }

  return { handle, xacThuc, dangBat, ai, nhanNguoi, nhanHienTai, als, sauKhiKhoiPhuc, huyMoiPhien, tenNguoiMap, LOAI_SU_KIEN, NGUOI_MAY, AUTH_TABLE_NAMES, COOKIE, _now: now };
};

module.exports.NGUOI_MAY = NGUOI_MAY;
module.exports.khoaTen = khoaTen;
module.exports.taoMa = taoMa;
module.exports.nhomMa = nhomMa;
module.exports.sha = sha;
module.exports.TEN_HOP_LE = TEN_HOP_LE;
