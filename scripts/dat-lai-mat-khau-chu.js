#!/usr/bin/env node
'use strict';
/*
 * LỆNH CỨU HỘ: đặt lại mật khẩu một tài khoản CHỦ ngay trên máy chạy phần mềm (khi quên hết mật khẩu Chủ và mất mã dự phòng).
 *
 *   node scripts/dat-lai-mat-khau-chu.js                 (dữ liệu ở thư mục data cạnh phần mềm)
 *   node scripts/dat-lai-mat-khau-chu.js --data D:\SoThuChi\data --ten chuthau
 *
 * Hỏi tên tài khoản Chủ, mật khẩu mới (gõ không hiện), rồi bắt gõ CO để xác nhận. Đặt lại mật khẩu, mở khóa, kích hoạt lại tài khoản,
 * hủy mọi phiên của tài khoản đó và ghi sự kiện bảo mật "Đặt lại mật khẩu Chủ bằng lệnh cứu hộ".
 *
 * LƯU Ý (chủ ý thiết kế cho phần mềm chạy cục bộ): ai mở được máy này và thư mục phần mềm thì dùng được lệnh này. Đăng nhập chỉ bảo vệ
 * giao diện phần mềm, không mã hóa dữ liệu — hãy đặt mật khẩu tài khoản Windows và (nếu được) bật mã hóa ổ đĩa.
 * Nên TẮT phần mềm (đóng cửa sổ KhoiDong.bat) trước khi chạy lệnh này.
 */
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { nodeOk, NODE_YEU_CAU } = require('../lib/node-version');
if (!nodeOk(process.versions.node) && process.env.KETOAN_CHO_NODE_CU !== '1') {
  console.error('Cần Node.js ' + NODE_YEU_CAU + ' (máy đang có ' + process.versions.node + ').');
  process.exit(1);
}
const { SqliteDb, AUTH_SQL } = require('../lib/db');
const MK = require('../lib/matKhau');

function thamSo(ten) {
  const i = process.argv.indexOf(ten);
  return i > 0 ? process.argv[i + 1] : undefined;
}
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Đặt lại mật khẩu một tài khoản Chủ.\n  node scripts/dat-lai-mat-khau-chu.js [--data <thư mục dữ liệu>] [--ten <tên đăng nhập Chủ>]');
  process.exit(0);
}

const dataDir = path.resolve(thamSo('--data') || process.env.KETOAN_DATA || path.join(__dirname, '..', 'data'));
const file = path.join(dataDir, 'ketoan.db');

// Đọc từng câu trả lời: bàn phím (ô mật khẩu không hiện chữ) hoặc từ stdin (chạy tự động / kiểm thử)
const tty = !!process.stdin.isTTY;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: tty });
const dong = rl[Symbol.asyncIterator]();
let an = false;
if (tty) {
  const goc = rl._writeToOutput.bind(rl);
  rl._writeToOutput = (s) => { if (!an) goc(s); else if (/\r|\n/.test(s)) goc('\n'); };
}
async function hoi(cau, matKhau) {
  process.stdout.write(cau);
  an = !!matKhau && tty;
  const r = await dong.next();
  an = false;
  if (!tty) process.stdout.write('\n');
  if (r.done) throw new Error('Không nhận được câu trả lời (đã hủy).');
  return String(r.value);
}

async function main() {
  console.log('');
  console.log('  LỆNH CỨU HỘ — đặt lại mật khẩu tài khoản Chủ (Kế Toán Công Trình)');
  console.log('  Dữ liệu: ' + file);
  console.log('  Ai mở được máy này và thư mục phần mềm thì dùng được lệnh này — đó là chủ ý thiết kế cho phần mềm chạy trên máy.');
  console.log('  Nên tắt phần mềm (đóng cửa sổ KhoiDong.bat) trước khi chạy.');
  console.log('');
  if (!fs.existsSync(file)) throw new Error('Không thấy file dữ liệu ' + file + ' (dùng --data để chỉ thư mục dữ liệu).');
  const db = new SqliteDb(file);
  try {
    AUTH_SQL.forEach((s) => db.conn.exec(s)); // file cũ chưa có bảng đăng nhập: tạo bảng rỗng
    const chu = db.conn.prepare('SELECT "id", "tenDangNhap", "hoTen", "hoatDong" FROM "nguoiDung" WHERE "vaiTro" = \'chu\' ORDER BY "id"').all();
    if (!chu.length) throw new Error('Chưa có tài khoản Chủ nào (đăng nhập chưa từng được bật). Không cần cứu hộ: mở phần mềm và bật đăng nhập ở Cài đặt.');
    console.log('  Các tài khoản Chủ:');
    chu.forEach((u) => console.log('   - ' + u.tenDangNhap + ' (' + u.hoTen + ')' + (u.hoatDong ? '' : ' [đang vô hiệu hóa]')));
    console.log('');
    const tenNhap = thamSo('--ten') || (chu.length === 1 ? chu[0].tenDangNhap : await hoi('  Tên đăng nhập tài khoản Chủ cần đặt lại: '));
    const ten = String(tenNhap).normalize('NFC').trim().toLowerCase();
    const u = chu.find((x) => x.tenDangNhap.normalize('NFC').toLowerCase() === ten);
    if (!u) throw new Error('"' + tenNhap + '" không phải tài khoản Chủ.');
    const mk = (await hoi('  Mật khẩu mới cho ' + u.tenDangNhap + ': ', true)).normalize('NFC');
    const mk2 = (await hoi('  Nhập lại mật khẩu mới: ', true)).normalize('NFC');
    if (mk !== mk2) throw new Error('Hai lần nhập mật khẩu không khớp. Chưa đổi gì.');
    const loi = MK.loiChinhSach(mk, u.tenDangNhap);
    if (loi) throw new Error(loi + '. Chưa đổi gì.');
    const xn = await hoi('  Gõ CO (chữ hoa) để đặt lại mật khẩu cho "' + u.tenDangNhap + '": ');
    if (xn.trim() !== 'CO') throw new Error('Không xác nhận. Chưa đổi gì.');
    const hash = await MK.bam(mk);
    const t = new Date().toISOString();
    db.tx(() => {
      db.conn.prepare('UPDATE "nguoiDung" SET "matKhau" = ?, "phaiDoiMatKhau" = 0, "hoatDong" = 1, "saiLienTiep" = 0, "soLanKhoa" = 0, "khoaDen" = 0, "doiMatKhauLuc" = ?, "suaLuc" = ? WHERE "id" = ?')
        .run(hash, t, t, u.id);
      db.conn.prepare('DELETE FROM "phienDangNhap" WHERE "nguoiDungId" = ?').run(u.id);
      db.conn.prepare('INSERT INTO "suKienBaoMat" ("luc", "loai", "nguoiDungId", "tenDangNhap", "nguoiLam", "ip", "chiTiet") VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(t, 'cuu-ho-dong-lenh', u.id, u.tenDangNhap, 'Lệnh cứu hộ trên máy (dòng lệnh)', 'máy này', 'Đặt lại mật khẩu, mở khóa, kích hoạt lại; hủy mọi phiên của tài khoản');
    });
    console.log('');
    console.log('  ĐÃ ĐẶT LẠI mật khẩu cho "' + u.tenDangNhap + '". Mở phần mềm và đăng nhập bằng mật khẩu mới.');
    console.log('  Nên tạo mã dự phòng mới: Cài đặt → Đăng nhập và phân quyền → Tạo mã dự phòng mới.');
    console.log('');
  } finally { db.close(); }
}

main().then(() => { rl.close(); process.exit(0); }).catch((e) => { console.error('\n  LỖI: ' + e.message + '\n'); rl.close(); process.exit(1); });
