'use strict';
/*
 * Mật khẩu: băm bằng crypto.scrypt (bản bất đồng bộ — không chặn máy chủ), muối ngẫu nhiên 16 byte riêng cho từng người,
 * khóa 64 byte, tham số mặc định N = 2^15, r = 8, p = 1. Chuỗi lưu: "scrypt$N$r$p$<muối base64>$<băm base64>" — kèm tham số
 * để sau này nâng tham số được: đăng nhập đúng bằng mã băm tham số cũ thì băm lại theo tham số mới (canBamLai).
 * So sánh bằng crypto.timingSafeEqual. Mật khẩu chuẩn hóa NFC trước khi băm (chữ có dấu gõ kiểu tổ hợp / dựng sẵn là một).
 * KHÔNG bao giờ ghi mật khẩu (hay mã băm) vào nhật ký, thông báo lỗi, file xuất.
 */
const crypto = require('crypto');

const THAM_SO = { N: 32768, r: 8, p: 1 };
const DO_DAI_KHOA = 64;
const DO_DAI_MUOI = 16;
// scrypt cần khoảng 128 · N · r byte bộ nhớ (32 MB với tham số trên); mặc định Node chỉ cho 32 MB nên nới lên
const maxmem = (t) => 256 * t.N * t.r + 1024 * 1024;
const DO_DAI_TOI_THIEU = 8;
const DO_DAI_TOI_DA = 200;

// Danh sách nhỏ các mật khẩu quá phổ biến (so sau khi bỏ dấu, viết thường)
const PHO_BIEN = new Set([
  '12345678', '123456789', '1234567890', '0123456789', '87654321', '11111111', '00000000', '88888888', '66666666', '12341234', '11223344',
  '123123123', '1q2w3e4r', '1qaz2wsx', 'qwertyui', 'qwerty123', 'qwertyuiop', 'asdfghjk', 'zxcvbnm1', 'password', 'password1', 'password123',
  'passw0rd', 'iloveyou', 'abc12345', 'abcd1234', 'aa123456', 'admin123', 'administrator', 'welcome1', 'letmein1', 'sunshine', 'princess',
  'football', 'baseball', 'superman', 'trustno1', 'matkhau1', 'matkhau123', 'matkhau', 'anhyeuem', 'emyeuanh', 'yeuemmaimai', 'vietnam1',
  'vietnam123', 'hanoi123', 'saigon123', 'danang123', 'ketoan123', 'ketoan2024', 'ketoan2025', 'ketoan2026', 'sothuchi', 'sothuchi123',
  'congty123', 'admin2024', 'admin2025', 'admin2026', '123456aa', '123456abc', 'abc123456', 'a1234567', 'q1w2e3r4', 'zaq12wsx'
]);

const b64 = (buf) => buf.toString('base64');
const chuan = (s) => String(s == null ? '' : s).normalize('NFC');
const boDau = (s) => chuan(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

function scryptAsync(matKhau, muoi, t, len) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(Buffer.from(chuan(matKhau), 'utf8'), muoi, len, { N: t.N, r: t.r, p: t.p, maxmem: maxmem(t) }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function bam(matKhau, thamSo) {
  const t = thamSo || THAM_SO;
  const muoi = crypto.randomBytes(DO_DAI_MUOI);
  const key = await scryptAsync(matKhau, muoi, t, DO_DAI_KHOA);
  return ['scrypt', t.N, t.r, t.p, b64(muoi), b64(key)].join('$');
}

function doc(chuoi) {
  const p = String(chuoi || '').split('$');
  if (p.length !== 6 || p[0] !== 'scrypt') return null;
  const t = { N: Number(p[1]), r: Number(p[2]), p: Number(p[3]) };
  if (![t.N, t.r, t.p].every((n) => Number.isSafeInteger(n) && n > 0) || (t.N & (t.N - 1)) !== 0 || t.N > 1048576 || t.r > 64 || t.p > 16) return null;
  const muoi = Buffer.from(p[4], 'base64');
  const key = Buffer.from(p[5], 'base64');
  if (muoi.length < 8 || key.length < 16) return null;
  return { t, muoi, key };
}

// Mã băm giả (tham số hiện hành) để chạy scrypt với tên đăng nhập không tồn tại: thời gian trả lời như tài khoản có thật
let gia = null;
async function bamGia() {
  if (!gia) gia = await bam(crypto.randomBytes(24).toString('hex'));
  return gia;
}

// Kiểm tra mật khẩu với chuỗi đã lưu. Luôn chạy scrypt (kể cả chuỗi hỏng / không có người dùng) để thời gian như nhau.
async function kiemTra(matKhau, chuoi) {
  const d = doc(chuoi) || doc(await bamGia());
  const key = await scryptAsync(matKhau, d.muoi, d.t, d.key.length);
  const dung = key.length === d.key.length && crypto.timingSafeEqual(key, d.key);
  return dung && !!doc(chuoi);
}

// Mã băm dùng tham số cũ (yếu hơn hiện hành) → nên băm lại khi người dùng đăng nhập đúng
function canBamLai(chuoi) {
  const d = doc(chuoi);
  if (!d) return true;
  return d.t.N < THAM_SO.N || d.t.r < THAM_SO.r || d.t.p < THAM_SO.p || d.key.length < DO_DAI_KHOA || d.muoi.length < DO_DAI_MUOI;
}

// Chính sách: ≥ 8 ký tự, không trùng tên đăng nhập, không nằm trong danh sách quá phổ biến. Trả câu báo lỗi hoặc null.
function loiChinhSach(matKhau, tenDangNhap) {
  const s = chuan(matKhau);
  if (typeof matKhau !== 'string') return 'Mật khẩu không hợp lệ';
  if (Array.from(s).length < DO_DAI_TOI_THIEU) return 'Mật khẩu phải có ít nhất ' + DO_DAI_TOI_THIEU + ' ký tự';
  if (Array.from(s).length > DO_DAI_TOI_DA) return 'Mật khẩu dài quá ' + DO_DAI_TOI_DA + ' ký tự';
  const k = boDau(s);
  if (tenDangNhap && k.replace(/\s+/g, '') === boDau(tenDangNhap).replace(/\s+/g, '')) return 'Mật khẩu không được trùng tên đăng nhập';
  if (PHO_BIEN.has(k) || PHO_BIEN.has(k.replace(/\s+/g, '')) || /^(.)\1+$/.test(k)) return 'Mật khẩu này quá phổ biến, dễ bị đoán. Hãy chọn mật khẩu khác (vd một câu ngắn dễ nhớ)';
  return null;
}

module.exports = { bam, kiemTra, canBamLai, loiChinhSach, THAM_SO, DO_DAI_TOI_THIEU, _doc: doc };
