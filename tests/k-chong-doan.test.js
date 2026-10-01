'use strict';
/* K-CĐ. Chống đoán mật khẩu (mục 3): khóa sau 5 lần sai liên tiếp, tự mở theo thời gian, tăng dần 5 → 15 → 60 phút; tên không tồn
 * tại bị đếm / khóa giống hệt (không lộ tài khoản nào có thật); giới hạn theo địa chỉ nguồn; Chủ mở khóa; thời gian trả lời tương đương. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { startServer } = require('./helpers');
const { MK_CHU, goi, batDangNhap, dangNhap, taoVaDangNhap, dongHo } = require('./auth-helpers');

const boSo = (s) => String(s).replace(/\d+/g, 'N');
function suKien(dir) {
  const c = new DatabaseSync(path.join(dir, 'ketoan.db'), { readOnly: true });
  try { return c.prepare('SELECT * FROM "suKienBaoMat" ORDER BY "id"').all(); } finally { c.close(); }
}

test('B1 sai 5 lần liên tiếp → khóa 5 phút (đúng mật khẩu cũng không vào được); hết 5 phút tự mở; lần khóa sau 15 phút, rồi 60 phút; đăng nhập đúng thì đếm lại từ đầu', async () => {
  const dh = dongHo();
  const srv = await startServer({ env: dh.env });
  try {
    await batDangNhap(srv);
    const sai = async (n) => { for (let i = 0; i < n; i++) assert.equal((await dangNhap(srv, 'chu', 'sai mật khẩu ' + i)).status, 401); };
    // 4 lần sai rồi đúng → đếm lại
    await sai(4);
    assert.equal((await dangNhap(srv, 'chu', MK_CHU)).status, 200);
    await sai(4);
    assert.equal((await dangNhap(srv, 'chu', MK_CHU)).status, 200, '4 + 4 lần sai xen đăng nhập đúng: không khóa');
    dh.tien(16 * 60000); // qua cửa sổ 15 phút của giới hạn theo địa chỉ (20 lần sai), để chỉ thử khóa theo tài khoản
    // khóa lần 1: 5 phút
    await sai(5);
    let r = await dangNhap(srv, 'chu', MK_CHU);
    assert.equal(r.status, 429); assert.equal(r.json.code, 'TAI_KHOAN_KHOA'); assert.match(r.json.error, /5 phút/);
    dh.tien(4 * 60000);
    assert.equal((await dangNhap(srv, 'chu', MK_CHU)).status, 429, 'còn khóa sau 4 phút');
    dh.tien(61000);
    assert.equal((await dangNhap(srv, 'chu', MK_CHU)).status, 200, 'tự mở sau 5 phút');
    // đăng nhập đúng đặt lại cả số lần khóa → lần khóa kế tiếp lại 5 phút; muốn thấy tăng dần thì phải sai liên tục qua các lần khóa
    await sai(5);
    dh.tien(5 * 60000 + 1000);
    await sai(5);
    r = await dangNhap(srv, 'chu', MK_CHU);
    assert.equal(r.status, 429); assert.match(r.json.error, /15 phút/, 'lần khóa thứ 2: 15 phút');
    dh.tien(14 * 60000);
    assert.equal((await dangNhap(srv, 'chu', MK_CHU)).status, 429);
    dh.tien(61000);
    await sai(5);
    r = await dangNhap(srv, 'chu', MK_CHU);
    assert.match(r.json.error, /60 phút/, 'lần khóa thứ 3: 1 giờ');
    dh.tien(61 * 60000);
    assert.equal((await dangNhap(srv, 'chu', MK_CHU)).status, 200);
    const ev = suKien(srv.dataDir);
    assert.ok(ev.filter((e) => e.loai === 'khoa-tai-khoan').length >= 4);
    assert.ok(!JSON.stringify(ev).includes(MK_CHU) && !JSON.stringify(ev).includes('sai mật khẩu'), 'sự kiện không chứa mật khẩu');
  } finally { await srv.stop(); }
});

test('B2 không lộ tài khoản: tên không tồn tại nhận đúng cùng thông báo, cùng mã lỗi, cùng cách khóa sau 5 lần; thời gian trả lời tương đương (vẫn chạy scrypt)', async () => {
  const srv = await startServer({});
  try {
    await batDangNhap(srv);
    const tg = { co: [], khong: [] };
    for (let i = 0; i < 4; i++) {
      for (const [k, ten] of [['co', 'chu'], ['khong', 'khongtontai']]) {
        const t0 = process.hrtime.bigint();
        const r = await dangNhap(srv, ten, 'mật khẩu sai ' + i);
        tg[k].push(Number(process.hrtime.bigint() - t0) / 1e6);
        assert.equal(r.status, 401);
        assert.equal(r.json.error, 'Sai tên đăng nhập hoặc mật khẩu.');
        assert.equal(r.json.code, 'SAI_DANG_NHAP');
      }
    }
    const a = await dangNhap(srv, 'chu', 'mật khẩu sai 5');
    const b = await dangNhap(srv, 'khongtontai', 'mật khẩu sai 5');
    assert.equal(a.status, 401); assert.equal(b.status, 401);
    const a2 = await dangNhap(srv, 'chu', 'x');
    const b2 = await dangNhap(srv, 'khongtontai', 'x');
    assert.equal(a2.status, 429); assert.equal(b2.status, 429);
    assert.equal(boSo(a2.json.error), boSo(b2.json.error), 'thông báo khóa giống nhau');
    assert.equal(a2.json.code, b2.json.code);
    const tb = (x) => x.slice().sort((p, q) => p - q)[Math.floor(x.length / 2)];
    const ty = tb(tg.co) / tb(tg.khong);
    console.log('# thời gian trả lời (trung vị): tài khoản có thật ' + tb(tg.co).toFixed(1) + ' ms, không tồn tại ' + tb(tg.khong).toFixed(1) + ' ms');
    assert.ok(ty > 0.5 && ty < 2, 'thời gian tương đương (tỉ lệ ' + ty.toFixed(2) + ')');
  } finally { await srv.stop(); }
});

test('B3 giới hạn theo địa chỉ nguồn: 20 lần sai (nhiều tên khác nhau) trong 15 phút → chặn địa chỉ 15 phút, kể cả đăng nhập đúng; hết hạn thì mở; có sự kiện "chặn địa chỉ"', async () => {
  const dh = dongHo();
  const srv = await startServer({ env: dh.env });
  try {
    await batDangNhap(srv);
    for (let i = 0; i < 20; i++) await dangNhap(srv, 'ten' + (i % 7), 'sai');
    const r = await dangNhap(srv, 'chu', MK_CHU);
    assert.equal(r.status, 429); assert.equal(r.json.code, 'CHAN_DIA_CHI');
    assert.equal((await goi(srv, 'POST', '/api/auth/quen-mat-khau', { tenDangNhap: 'chu' })).status, 429, 'quên mật khẩu cũng bị chặn');
    dh.tien(16 * 60000);
    assert.equal((await dangNhap(srv, 'chu', MK_CHU)).status, 200);
    assert.ok(suKien(srv.dataDir).some((e) => e.loai === 'chan-dia-chi'));
  } finally { await srv.stop(); }
});

test('B4 Chủ mở khóa tài khoản khác ngay (không chờ hết giờ); người không phải Chủ không mở được', async () => {
  const srv = await startServer({});
  try {
    const { cookie } = await batDangNhap(srv);
    const kt = await taoVaDangNhap(srv, cookie, 'ketoan1', 'ke-toan', 'kế toán mật khẩu 1');
    for (let i = 0; i < 5; i++) await dangNhap(srv, 'ketoan1', 'sai ' + i);
    assert.equal((await dangNhap(srv, 'ketoan1', 'kế toán mật khẩu 1')).status, 429);
    const ds = (await goi(srv, 'GET', '/api/users', undefined, cookie)).json.items;
    const u = ds.find((x) => x.tenDangNhap === 'ketoan1');
    assert.equal(u.dangKhoa, true);
    assert.equal((await goi(srv, 'POST', '/api/users/' + u.id + '/mo-khoa', {}, kt.cookie)).status, 403, 'Kế toán không mở khóa được');
    const m = await goi(srv, 'POST', '/api/users/' + u.id + '/mo-khoa', {}, cookie);
    assert.equal(m.status, 200);
    assert.equal(m.json.nguoiDung.dangKhoa, false);
    assert.equal((await dangNhap(srv, 'ketoan1', 'kế toán mật khẩu 1')).status, 200);
    assert.ok(suKien(srv.dataDir).some((e) => e.loai === 'mo-khoa' && e.nguoiLam && /chu/.test(e.nguoiLam)));
  } finally { await srv.stop(); }
});
