'use strict';
/* K. Đăng nhập (mục 1): mặc định tắt; bật kèm tạo tài khoản Chủ; mật khẩu băm scrypt; phiên (cookie, hết hạn theo đồng hồ giả lập,
 * đăng xuất, chống cố định phiên); chống giả mạo yêu cầu (Origin); tắt / bật lại; tự nâng tham số băm; nâng cấp lược đồ 5 → 6. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const { startServer, readStored } = require('./helpers');
const { MK_CHU, goi, layCookie, batDangNhap, dangNhap, dongHo } = require('./auth-helpers');
const MK = require('../lib/matKhau');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
function docBang(dir, sql) {
  const c = new DatabaseSync(path.join(dir, 'ketoan.db'), { readOnly: true });
  try { return c.prepare(sql).all(); } finally { c.close(); }
}

test('K1 mặc định TẮT: không màn hình đăng nhập, API chạy như trước (không cần cookie / Origin), các chức năng đăng nhập trả 409', async () => {
  const srv = await startServer({});
  try {
    const r = await srv.call('GET', '/api/auth/trang-thai');
    assert.equal(r.status, 200);
    assert.equal(r.json.bat, false);
    assert.equal(r.json.coTaiKhoan, false);
    assert.equal((await srv.call('GET', '/api/db')).status, 200);
    const e = await srv.call('POST', '/api/entries', { ngay: '2026-09-01', chi: 1000, noiDung: 'không cookie, không Origin' });
    assert.equal(e.status, 200, 'như trước: không cần Origin');
    assert.equal(e.json.db.entries[0].nguoiTao, 'Người dùng máy này');
    for (const [m, u] of [['POST', '/api/auth/dang-nhap'], ['POST', '/api/auth/quen-mat-khau'], ['GET', '/api/users'], ['POST', '/api/auth/tat']]) {
      const x = await goi(srv, m, u, m === 'GET' ? undefined : {});
      assert.equal(x.status, 409, m + ' ' + u);
    }
    assert.deepEqual(docBang(srv.dataDir, 'SELECT * FROM "nguoiDung"'), []);
  } finally { await srv.stop(); }
});

test('K2 bật đăng nhập: bắt buộc tạo tài khoản Chủ hợp lệ trong cùng bước (chính sách mật khẩu); mật khẩu chỉ lưu dạng băm scrypt (N=2^15, r=8, p=1, muối 16 byte, khóa 64 byte); mã dự phòng hiện một lần, CSDL chỉ có bản băm', async () => {
  const srv = await startServer({});
  try {
    const sai = [
      [{ tenDangNhap: 'a', hoTen: 'X', matKhau: MK_CHU, matKhau2: MK_CHU }, /Tên đăng nhập/],
      [{ tenDangNhap: 'chu thau', hoTen: 'X', matKhau: MK_CHU, matKhau2: MK_CHU }, /Tên đăng nhập/],
      [{ tenDangNhap: 'chu', hoTen: '', matKhau: MK_CHU, matKhau2: MK_CHU }, /họ tên/],
      [{ tenDangNhap: 'chu', hoTen: 'X', matKhau: 'ngắn', matKhau2: 'ngắn' }, /ít nhất 8/],
      [{ tenDangNhap: 'chu', hoTen: 'X', matKhau: '12345678', matKhau2: '12345678' }, /phổ biến/],
      [{ tenDangNhap: 'chuthau99', hoTen: 'X', matKhau: 'ChuThau99', matKhau2: 'ChuThau99' }, /trùng tên đăng nhập/],
      [{ tenDangNhap: 'chu', hoTen: 'X', matKhau: MK_CHU, matKhau2: MK_CHU + 'x' }, /không khớp/]
    ];
    for (const [b, re] of sai) {
      const r = await goi(srv, 'POST', '/api/auth/bat', b);
      assert.equal(r.status, 400, JSON.stringify(b));
      assert.match(r.json.error, re);
      assert.ok(!r.json.error.includes(b.matKhau), 'thông báo lỗi không chứa mật khẩu');
    }
    assert.equal((await srv.call('GET', '/api/auth/trang-thai')).json.bat, false, 'chưa tạo xong thì chưa bật');
    const { cookie, maDuPhong, json } = await batDangNhap(srv, { tenDangNhap: 'ChuThau', hoTen: '<b>Chủ</b> Thầu' });
    assert.equal(json.bat, true);
    assert.equal(json.nguoiDung.vaiTro, 'chu');
    assert.match(maDuPhong, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/);
    assert.ok(cookie.startsWith('stc_phien='));
    const u = docBang(srv.dataDir, 'SELECT * FROM "nguoiDung"')[0];
    const p = u.matKhau.split('$');
    assert.deepEqual(p.slice(0, 4), ['scrypt', '32768', '8', '1']);
    assert.equal(Buffer.from(p[4], 'base64').length, 16);
    assert.equal(Buffer.from(p[5], 'base64').length, 64);
    // file dữ liệu, bản sao lưu, nhật ký không có mật khẩu thô hay mã dự phòng thô
    const raw = fs.readFileSync(path.join(srv.dataDir, 'ketoan.db'));
    assert.ok(!raw.includes(Buffer.from(MK_CHU, 'utf8')), 'không có mật khẩu thô trong ketoan.db');
    assert.ok(!raw.includes(Buffer.from(maDuPhong.replace(/-/g, ''))), 'không có mã dự phòng thô');
    const cfg = docBang(srv.dataDir, 'SELECT * FROM "cauHinhDangNhap" WHERE "khoa" = \'maDuPhong\'')[0];
    assert.equal(JSON.parse(cfg.giaTri).bam, sha(maDuPhong.replace(/-/g, '')));
    const audit = fs.readFileSync(path.join(srv.dataDir, 'nhat-ky.jsonl'), 'utf8');
    assert.ok(!audit.includes(MK_CHU) && !audit.includes(maDuPhong));
    const ev = docBang(srv.dataDir, 'SELECT * FROM "suKienBaoMat"');
    assert.ok(ev.some((e) => e.loai === 'bat-dang-nhap'));
    assert.ok(!JSON.stringify(ev).includes(MK_CHU));
    // dữ liệu gửi giao diện không kèm bảng người dùng
    const db = (await goi(srv, 'GET', '/api/db', undefined, cookie)).json.db;
    assert.ok(!('nguoiDung' in db) && !JSON.stringify(db).includes('scrypt$'));
    // bật lần nữa khi đang bật → 409
    assert.equal((await goi(srv, 'POST', '/api/auth/bat', {}, cookie)).status, 409);
  } finally { await srv.stop(); }
});

test('K3 đăng nhập / đăng xuất / phiên: sai → 401 thông báo chung; đúng (tên không phân biệt hoa thường, mật khẩu tiếng Việt NFC/NFD) → cookie HttpOnly SameSite=Strict Path=/; CSDL chỉ lưu SHA-256 mã phiên; mã phiên mới mỗi lần đăng nhập (chống cố định phiên); đăng xuất xóa phiên, mã cũ không dùng lại được', async () => {
  const srv = await startServer({});
  try {
    const { cookie: c0 } = await batDangNhap(srv);
    const sai = await dangNhap(srv, 'chu', 'mật khẩu sai hoàn toàn');
    assert.equal(sai.status, 401);
    assert.equal(sai.json.error, 'Sai tên đăng nhập hoặc mật khẩu.');
    const khongCo = await dangNhap(srv, 'khong-ton-tai', MK_CHU);
    assert.equal(khongCo.status, 401);
    assert.equal(khongCo.json.error, sai.json.error, 'không lộ tài khoản có tồn tại hay không');
    const l1 = await dangNhap(srv, 'CHU', MK_CHU.normalize('NFD'));
    assert.equal(l1.status, 200, JSON.stringify(l1.json));
    const sc = String(l1.r.headers['set-cookie']);
    assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/); assert.match(sc, /Path=\//);
    assert.doesNotMatch(sc, /Secure/, 'http trên localhost: không đặt Secure');
    const token = l1.cookie.split('=')[1];
    assert.match(token, /^[A-Za-z0-9_-]{43}$/, '32 byte ngẫu nhiên');
    const phien = docBang(srv.dataDir, 'SELECT "bam" FROM "phienDangNhap"').map((x) => x.bam);
    assert.ok(phien.includes(sha(token)) && !phien.includes(token), 'chỉ lưu bản băm');
    // đăng nhập lại khi đang gửi kèm cookie cũ: cookie cũ bị hủy, cấp mã mới
    const l2 = await dangNhap(srv, 'chu', MK_CHU);
    const l3 = (await goi(srv, 'POST', '/api/auth/dang-nhap', { tenDangNhap: 'chu', matKhau: MK_CHU }, l2.cookie));
    assert.notEqual(layCookie(l3), l2.cookie);
    assert.equal((await goi(srv, 'GET', '/api/db', undefined, l2.cookie)).status, 401, 'mã phiên cũ (cố định phiên) không dùng được');
    assert.equal((await goi(srv, 'GET', '/api/db', undefined, layCookie(l3))).status, 200);
    // đăng xuất
    const out = await goi(srv, 'POST', '/api/auth/dang-xuat', {}, l1.cookie);
    assert.match(String(out.headers['set-cookie']), /Max-Age=0/);
    const sau = await goi(srv, 'GET', '/api/db', undefined, l1.cookie);
    assert.equal(sau.status, 401);
    assert.equal((await goi(srv, 'GET', '/api/db', undefined, c0)).status, 200, 'phiên khác không bị ảnh hưởng');
    // không có cookie → 401 CHUA_DANG_NHAP; trang thái công khai
    const no = await goi(srv, 'GET', '/api/db');
    assert.equal(no.status, 401); assert.equal(no.json.code, 'CHUA_DANG_NHAP');
    assert.equal((await srv.call('GET', '/api/auth/trang-thai')).json.nguoiDung, null);
    assert.equal((await goi(srv, 'GET', '/api/auth/trang-thai', undefined, c0)).json.nguoiDung.tenDangNhap, 'chu');
  } finally { await srv.stop(); }
});

test('K4 hết phiên (đồng hồ giả lập): không thao tác 60 phút → hết; thao tác đều thì gia hạn nhưng tối đa 12 giờ kể từ khi đăng nhập; cấu hình được thời gian (chỉ Chủ)', async () => {
  const dh = dongHo();
  const srv = await startServer({ env: dh.env });
  try {
    const { cookie } = await batDangNhap(srv);
    dh.tien(59 * 60000);
    assert.equal((await goi(srv, 'GET', '/api/db', undefined, cookie)).status, 200, '59 phút: còn phiên');
    dh.tien(59 * 60000);
    assert.equal((await goi(srv, 'GET', '/api/db', undefined, cookie)).status, 200, 'thao tác gia hạn thời gian chờ');
    dh.tien(61 * 60000);
    const het = await goi(srv, 'GET', '/api/db', undefined, cookie);
    assert.equal(het.status, 401); assert.equal(het.json.code, 'HET_PHIEN');
    // tối đa 12 giờ
    const l = await dangNhap(srv, 'chu', MK_CHU);
    for (let i = 0; i < 14; i++) {
      dh.tien(50 * 60000);
      const r = await goi(srv, 'GET', '/api/db', undefined, l.cookie);
      const gio = (i + 1) * 50 / 60;
      if (gio <= 12) assert.equal(r.status, 200, 'giờ ' + gio.toFixed(1));
      else { assert.equal(r.status, 401, 'quá 12 giờ'); break; }
    }
    // cấu hình: 5 phút chờ
    const l2 = await dangNhap(srv, 'chu', MK_CHU);
    assert.equal((await goi(srv, 'PUT', '/api/auth/cau-hinh', { phutCho: 3 }, l2.cookie)).status, 400);
    const c = await goi(srv, 'PUT', '/api/auth/cau-hinh', { phutCho: 5, gioToiDa: 1 }, l2.cookie);
    assert.equal(c.status, 200); assert.deepEqual(c.json.cauHinh, { phutCho: 5, gioToiDa: 1 });
    dh.tien(6 * 60000);
    assert.equal((await goi(srv, 'GET', '/api/db', undefined, l2.cookie)).status, 401);
    // trạng thái báo thời gian còn lại để giao diện cảnh báo trước khi hết phiên
    const l3 = await dangNhap(srv, 'chu', MK_CHU);
    const tt = (await goi(srv, 'GET', '/api/auth/trang-thai', undefined, l3.cookie)).json;
    assert.ok(tt.phien.conLaiCho > 4 * 60000 && tt.phien.conLaiCho <= 5 * 60000);
    assert.ok(tt.phien.conLaiToiDa <= 3600000);
  } finally { await srv.stop(); }
});

test('K5 chống giả mạo yêu cầu (CSRF): đăng nhập bật thì yêu cầu thay đổi dữ liệu phải có Origin (hoặc Referer) đúng địa chỉ máy chủ; GET không cần', async () => {
  const srv = await startServer({});
  try {
    const { cookie } = await batDangNhap(srv);
    const body = { ngay: '2026-09-01', chi: 1000, noiDung: 'csrf' };
    assert.equal((await srv.call('POST', '/api/entries', body, { Cookie: cookie, Origin: 'http://evil.example' })).status, 403);
    assert.equal((await srv.call('POST', '/api/entries', body, { Cookie: cookie, Origin: 'http://localhost:1' })).status, 403, 'đúng localhost nhưng sai cổng');
    const noOrigin = await srv.call('POST', '/api/entries', body, { Cookie: cookie });
    assert.equal(noOrigin.status, 403); assert.equal(noOrigin.json.code, 'SAI_NGUON');
    assert.equal((await srv.call('POST', '/api/entries', body, { Cookie: cookie, Referer: 'http://evil.example/' })).status, 403);
    assert.equal((await srv.call('POST', '/api/entries', body, { Cookie: cookie, Referer: srv.base + '/#/so-thu-chi' })).status, 200, 'Referer đúng');
    assert.equal((await srv.call('POST', '/api/entries', body, { Cookie: cookie, Origin: srv.base })).status, 200);
    assert.equal((await srv.call('GET', '/api/db', undefined, { Cookie: cookie })).status, 200, 'GET không cần Origin');
    // đăng nhập cũng phải đúng nguồn (chống đăng nhập giả mạo)
    assert.equal((await srv.call('POST', '/api/auth/dang-nhap', { tenDangNhap: 'chu', matKhau: MK_CHU })).status, 403);
    assert.equal(readStored(srv.dataDir).entries.length, 2);
  } finally { await srv.stop(); }
});

test('K6 tắt đăng nhập: chỉ khi nhập lại đúng mật khẩu; tắt thì hủy mọi phiên, GIỮ tài khoản; khi tắt mọi thao tác ghi "Người dùng máy này"; bật lại phải đăng nhập bằng tài khoản Chủ cũ, cấp mã dự phòng mới', async () => {
  const srv = await startServer({});
  try {
    const { cookie, maDuPhong } = await batDangNhap(srv);
    assert.equal((await goi(srv, 'POST', '/api/auth/tat', { matKhau: 'sai mật khẩu rồi' }, cookie)).status, 400);
    assert.equal((await srv.call('GET', '/api/auth/trang-thai')).json.bat, true);
    const t = await goi(srv, 'POST', '/api/auth/tat', { matKhau: MK_CHU }, cookie);
    assert.equal(t.status, 200);
    assert.equal(t.json.bat, false);
    assert.deepEqual(docBang(srv.dataDir, 'SELECT * FROM "phienDangNhap"'), [], 'mọi phiên bị hủy');
    assert.equal(docBang(srv.dataDir, 'SELECT * FROM "nguoiDung"').length, 1, 'tài khoản giữ nguyên');
    const e = await srv.call('POST', '/api/entries', { ngay: '2026-09-02', chi: 5, noiDung: 'khi tắt' });
    assert.equal(e.status, 200);
    assert.equal(e.json.db.entries.find((x) => x.noiDung === 'khi tắt').nguoiTao, 'Người dùng máy này');
    assert.equal((await srv.call('GET', '/api/auth/trang-thai')).json.coTaiKhoan, true);
    // bật lại: phải là tài khoản Chủ cũ, đúng mật khẩu; thông tin "tạo mới" bị bỏ qua
    const sai = await goi(srv, 'POST', '/api/auth/bat', { tenDangNhap: 'moi', hoTen: 'Mới', matKhau: 'mat khau moi 123', matKhau2: 'mat khau moi 123' });
    assert.equal(sai.status, 401);
    assert.equal(docBang(srv.dataDir, 'SELECT * FROM "nguoiDung"').length, 1);
    const b = await goi(srv, 'POST', '/api/auth/bat', { tenDangNhap: 'chu', matKhau: MK_CHU });
    assert.equal(b.status, 200);
    assert.notEqual(b.json.maDuPhong, maDuPhong);
    assert.equal((await goi(srv, 'GET', '/api/db', undefined, layCookie(b))).status, 200);
  } finally { await srv.stop(); }
});

test('K7 mật khẩu: hai người cùng mật khẩu có mã băm khác nhau; so sánh đúng / sai; mật khẩu tiếng Việt; mã băm tham số cũ được tự nâng khi đăng nhập đúng', async () => {
  const a = await MK.bam('mật khẩu chung 2026');
  const b = await MK.bam('mật khẩu chung 2026');
  assert.notEqual(a, b, 'muối riêng');
  assert.equal(await MK.kiemTra('mật khẩu chung 2026', a), true);
  assert.equal(await MK.kiemTra('mật khẩu chung 2026'.normalize('NFD'), a), true, 'NFC');
  assert.equal(await MK.kiemTra('mat khau chung 2026', a), false, 'bỏ dấu là mật khẩu khác');
  assert.equal(await MK.kiemTra('x', 'hỏng'), false);
  assert.equal(await MK.kiemTra('x', null), false);
  const cu = await MK.bam(MK_CHU, { N: 16384, r: 8, p: 1 });
  assert.equal(MK.canBamLai(cu), true); assert.equal(MK.canBamLai(a), false);
  // tự nâng trên máy chủ
  const srv = await startServer({});
  await batDangNhap(srv);
  await srv.stop();
  const c = new DatabaseSync(path.join(srv.dataDir, 'ketoan.db'));
  c.prepare('UPDATE "nguoiDung" SET "matKhau" = ?').run(cu);
  c.close();
  const srv2 = await startServer({ data: srv.dataDir });
  try {
    const l = await dangNhap(srv2, 'chu', MK_CHU);
    assert.equal(l.status, 200);
    const h = docBang(srv.dataDir, 'SELECT "matKhau" FROM "nguoiDung"')[0].matKhau;
    assert.match(h, /^scrypt\$32768\$8\$1\$/, 'đã băm lại theo tham số mới');
    assert.equal((await dangNhap(srv2, 'chu', MK_CHU)).status, 200);
  } finally { await srv2.stop(); }
});

test('K8 nâng cấp lược đồ 5 → 6: tự sao lưu, thêm bảng / cột, đăng nhập mặc định tắt, dữ liệu cũ giữ nguyên (người tạo trống = "Dữ liệu cũ"), mở lại không nâng lần nữa', async () => {
  const { SqliteDb } = require('../lib/db');
  const srv0 = await startServer({ seed: path.join(__dirname, 'fixtures', 'ketoan-v2-hien-tai.json') });
  await srv0.stop();
  const dir = srv0.dataDir;
  const c = new DatabaseSync(path.join(dir, 'ketoan.db'));
  ['nguoiDung', 'phienDangNhap', 'suKienBaoMat', 'cauHinhDangNhap'].forEach((t) => c.exec('DROP TABLE "' + t + '"'));
  ['projects', 'suppliers', 'entries', 'costGroups', 'costItems', 'materials', 'houses', 'costs', 'cashCounts', 'extPayments'].forEach((t) => {
    c.exec('ALTER TABLE "' + t + '" DROP COLUMN "nguoiTao"'); c.exec('ALTER TABLE "' + t + '" DROP COLUMN "nguoiSua"');
  });
  c.exec('PRAGMA user_version = 5');
  c.close();
  fs.readdirSync(path.join(dir, 'backups')).forEach((f) => fs.unlinkSync(path.join(dir, 'backups', f)));
  const v5 = readStored(dir);
  assert.equal(v5.schema, 5);
  const srv = await startServer({ data: dir });
  try {
    assert.match(srv.log, /lược đồ 6/);
    const db = readStored(dir);
    assert.equal(db.schema, 6);
    ['projects', 'suppliers', 'entries', 'costs', 'costItems', 'materials', 'houses'].forEach((k) => assert.deepEqual(db[k], v5[k], k));
    assert.ok(db.entries.every((e) => e.nguoiTao === undefined), 'dữ liệu cũ: không có người tạo (hiển thị "Dữ liệu cũ")');
    assert.equal(fs.readdirSync(path.join(dir, 'backups')).filter((f) => /truoc-nang-cap-luoc-do-6/.test(f)).length, 1);
    assert.equal((await srv.call('GET', '/api/auth/trang-thai')).json.bat, false);
    assert.equal((await srv.call('GET', '/api/db')).status, 200);
  } finally { await srv.stop(); }
  const srv2 = await startServer({ data: dir });
  try { assert.doesNotMatch(srv2.log, /nâng cấp dữ liệu lên lược đồ/i); } finally { await srv2.stop(); }
  const s = new SqliteDb(path.join(dir, 'ketoan.db'));
  try { assert.deepEqual(s.migrate(), []); } finally { s.close(); }
});
