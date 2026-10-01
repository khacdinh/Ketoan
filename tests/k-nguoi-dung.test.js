'use strict';
/* K-ND. Quản lý người dùng và đổi mật khẩu (mục 4); không bị khóa ngoài (Chủ cuối cùng); XSS / SQL injection ở ô nhập. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { startServer } = require('./helpers');
const { MK_CHU, goi, batDangNhap, dangNhap, taoVaDangNhap } = require('./auth-helpers');

function bang(dir, sql) {
  const c = new DatabaseSync(path.join(dir, 'ketoan.db'), { readOnly: true });
  try { return c.prepare(sql).all(); } finally { c.close(); }
}

test('N1 Chủ thêm người dùng: kiểm tra dữ liệu (tên trùng không phân biệt hoa thường, vai trò, chính sách mật khẩu); người mới phải đổi mật khẩu ở lần đăng nhập đầu (trước đó mọi chức năng khác bị chặn); không ai khác thêm được', async () => {
  const srv = await startServer({});
  try {
    const { cookie } = await batDangNhap(srv);
    const tao = (b) => goi(srv, 'POST', '/api/users', b, cookie);
    const ok = { tenDangNhap: 'ketoan1', hoTen: 'Nguyễn Thị Thúy', vaiTro: 'ke-toan', matKhau: 'tạm thời 12345', matKhau2: 'tạm thời 12345' };
    for (const [b, re] of [[Object.assign({}, ok, { tenDangNhap: 'CHU' }), /đã có/], [Object.assign({}, ok, { vaiTro: 'admin' }), /Vai trò/],
      [Object.assign({}, ok, { matKhau: 'ngan', matKhau2: 'ngan' }), /ít nhất 8/], [Object.assign({}, ok, { tenDangNhap: "x' OR '1'='1" }), /Tên đăng nhập/]]) {
      const r = await tao(b);
      assert.equal(r.status, 400, JSON.stringify(b)); assert.match(r.json.error, re);
    }
    const r = await tao(ok);
    assert.equal(r.status, 200);
    assert.equal(r.json.nguoiDung.phaiDoiMatKhau, true);
    assert.ok(!JSON.stringify(r.json).includes('scrypt'), 'không trả mã băm');
    const l = await dangNhap(srv, 'KeToan1', 'tạm thời 12345');
    assert.equal(l.status, 200);
    assert.equal(l.json.nguoiDung.phaiDoiMatKhau, true);
    const bi = await goi(srv, 'GET', '/api/db', undefined, l.cookie);
    assert.equal(bi.status, 403); assert.equal(bi.json.code, 'PHAI_DOI_MAT_KHAU');
    const d = await goi(srv, 'POST', '/api/auth/doi-mat-khau', { matKhauCu: 'tạm thời 12345', matKhauMoi: 'mật khẩu riêng của Thúy', matKhauMoi2: 'mật khẩu riêng của Thúy' }, l.cookie);
    assert.equal(d.status, 200);
    assert.equal((await goi(srv, 'GET', '/api/db', undefined, l.cookie)).status, 200);
    assert.equal((await goi(srv, 'POST', '/api/users', Object.assign({}, ok, { tenDangNhap: 'khac' }), l.cookie)).status, 403, 'Kế toán không thêm được người dùng');
    assert.equal((await goi(srv, 'GET', '/api/users', undefined, l.cookie)).status, 403);
    // không có chức năng xóa người dùng (chỉ vô hiệu hóa)
    const del = await goi(srv, 'DELETE', '/api/users/' + r.json.nguoiDung.id, undefined, cookie);
    assert.equal(del.status, 403); assert.equal(del.json.code, 'CHUA_KHAI_BAO');
  } finally { await srv.stop(); }
});

test('N2 đổi vai trò / vô hiệu hóa hủy NGAY mọi phiên của người đó; người bị vô hiệu không đăng nhập được (thông báo chung); kích hoạt lại thì vào được; đổi họ tên giữ phiên', async () => {
  const srv = await startServer({});
  try {
    const { cookie } = await batDangNhap(srv);
    const kt = await taoVaDangNhap(srv, cookie, 'ketoan1', 'ke-toan', 'kế toán mật khẩu 1');
    const k2 = (await dangNhap(srv, 'ketoan1', 'kế toán mật khẩu 1')).cookie;
    let r = await goi(srv, 'PUT', '/api/users/' + kt.id, { hoTen: 'Tên mới' }, cookie);
    assert.equal(r.status, 200);
    assert.equal((await goi(srv, 'GET', '/api/db', undefined, kt.cookie)).status, 200, 'đổi họ tên: phiên còn');
    r = await goi(srv, 'PUT', '/api/users/' + kt.id, { vaiTro: 'chi-xem' }, cookie);
    assert.equal(r.status, 200);
    for (const c of [kt.cookie, k2]) assert.equal((await goi(srv, 'GET', '/api/db', undefined, c)).status, 401, 'đổi vai trò: mọi phiên hết ngay');
    const l = await dangNhap(srv, 'ketoan1', 'kế toán mật khẩu 1');
    assert.equal(l.json.nguoiDung.vaiTro, 'chi-xem');
    assert.equal((await goi(srv, 'POST', '/api/entries', { ngay: '2026-09-01', chi: 1, noiDung: 'x' }, l.cookie)).status, 403, 'vai trò mới có hiệu lực');
    r = await goi(srv, 'POST', '/api/users/' + kt.id + '/trang-thai', { hoatDong: false }, cookie);
    assert.equal(r.status, 200);
    assert.equal((await goi(srv, 'GET', '/api/db', undefined, l.cookie)).status, 401, 'vô hiệu hóa: phiên hết ngay');
    const sai = await dangNhap(srv, 'ketoan1', 'kế toán mật khẩu 1');
    assert.equal(sai.status, 401); assert.equal(sai.json.error, 'Sai tên đăng nhập hoặc mật khẩu.');
    await goi(srv, 'POST', '/api/users/' + kt.id + '/trang-thai', { hoatDong: true }, cookie);
    assert.equal((await dangNhap(srv, 'ketoan1', 'kế toán mật khẩu 1')).status, 200);
    const ev = bang(srv.dataDir, 'SELECT "loai" FROM "suKienBaoMat"').map((x) => x.loai);
    ['doi-vai-tro', 'vo-hieu-hoa', 'kich-hoat', 'sua-nguoi-dung', 'tao-nguoi-dung'].forEach((k) => assert.ok(ev.includes(k), k));
  } finally { await srv.stop(); }
});

test('N3 không bị khóa ngoài: không hạ quyền / vô hiệu hóa được tài khoản Chủ đang hoạt động cuối cùng (409, không đổi gì); có hai Chủ thì hạ được một', async () => {
  const srv = await startServer({});
  try {
    const { cookie, json } = await batDangNhap(srv);
    const idChu = json.nguoiDung.id;
    let r = await goi(srv, 'PUT', '/api/users/' + idChu, { vaiTro: 'ke-toan' }, cookie);
    assert.equal(r.status, 409); assert.equal(r.json.code, 'CHU_CUOI');
    r = await goi(srv, 'POST', '/api/users/' + idChu + '/trang-thai', { hoatDong: false }, cookie);
    assert.equal(r.status, 409);
    assert.deepEqual(bang(srv.dataDir, 'SELECT "vaiTro", "hoatDong" FROM "nguoiDung"').map((x) => [x.vaiTro, x.hoatDong]), [['chu', 1]], 'không đổi gì');
    assert.equal((await goi(srv, 'GET', '/api/db', undefined, cookie)).status, 200, 'phiên còn');
    // thêm Chủ thứ hai → hạ được Chủ thứ nhất; khi đó Chủ thứ hai thành Chủ cuối cùng
    const c2 = await taoVaDangNhap(srv, cookie, 'chu2', 'chu', 'chủ thứ hai 2026');
    r = await goi(srv, 'PUT', '/api/users/' + idChu, { vaiTro: 'ke-toan' }, c2.cookie);
    assert.equal(r.status, 200);
    assert.equal((await goi(srv, 'POST', '/api/users/' + c2.id + '/trang-thai', { hoatDong: false }, c2.cookie)).status, 409);
    // vô hiệu một Chủ khi còn Chủ khác: được
    await goi(srv, 'PUT', '/api/users/' + idChu, { vaiTro: 'chu' }, c2.cookie);
    assert.equal((await goi(srv, 'POST', '/api/users/' + idChu + '/trang-thai', { hoatDong: false }, c2.cookie)).status, 200);
  } finally { await srv.stop(); }
});

test('N4 Chủ đặt lại mật khẩu người khác: người đó bị đăng xuất, phải đổi mật khẩu ở lần đăng nhập kế tiếp; không dùng chức năng này cho chính mình', async () => {
  const srv = await startServer({});
  try {
    const { cookie, json } = await batDangNhap(srv);
    const kt = await taoVaDangNhap(srv, cookie, 'ketoan1', 'ke-toan', 'kế toán mật khẩu 1');
    const r = await goi(srv, 'POST', '/api/users/' + kt.id + '/dat-lai-mat-khau', { matKhau: 'mật khẩu tạm mới 1', matKhau2: 'mật khẩu tạm mới 1' }, cookie);
    assert.equal(r.status, 200);
    assert.equal((await goi(srv, 'GET', '/api/db', undefined, kt.cookie)).status, 401);
    assert.equal((await dangNhap(srv, 'ketoan1', 'kế toán mật khẩu 1')).status, 401, 'mật khẩu cũ hết hiệu lực');
    const l = await dangNhap(srv, 'ketoan1', 'mật khẩu tạm mới 1');
    assert.equal(l.json.nguoiDung.phaiDoiMatKhau, true);
    assert.equal((await goi(srv, 'POST', '/api/users/' + json.nguoiDung.id + '/dat-lai-mat-khau', { matKhau: 'abc def ghi 123', matKhau2: 'abc def ghi 123' }, cookie)).status, 400);
  } finally { await srv.stop(); }
});

test('N5 tự đổi mật khẩu: phải nhập đúng mật khẩu hiện tại; mật khẩu mới khác cũ, đúng chính sách; xong thì các phiên khác của mình bị hủy, phiên đang dùng giữ lại', async () => {
  const srv = await startServer({});
  try {
    const { cookie } = await batDangNhap(srv);
    const khac = (await dangNhap(srv, 'chu', MK_CHU)).cookie;
    const doi = (b) => goi(srv, 'POST', '/api/auth/doi-mat-khau', b, cookie);
    assert.equal((await doi({ matKhauCu: 'sai', matKhauMoi: 'mật khẩu mới 2026', matKhauMoi2: 'mật khẩu mới 2026' })).status, 400);
    assert.equal((await doi({ matKhauCu: MK_CHU, matKhauMoi: MK_CHU, matKhauMoi2: MK_CHU })).status, 400, 'phải khác mật khẩu cũ');
    assert.equal((await doi({ matKhauCu: MK_CHU, matKhauMoi: 'password', matKhauMoi2: 'password' })).status, 400);
    assert.equal((await doi({ matKhauCu: MK_CHU, matKhauMoi: 'mật khẩu mới 2026', matKhauMoi2: 'khác' })).status, 400);
    const r = await doi({ matKhauCu: MK_CHU, matKhauMoi: 'mật khẩu mới 2026', matKhauMoi2: 'mật khẩu mới 2026' });
    assert.equal(r.status, 200);
    assert.equal((await goi(srv, 'GET', '/api/db', undefined, cookie)).status, 200, 'phiên đang dùng giữ lại');
    assert.equal((await goi(srv, 'GET', '/api/db', undefined, khac)).status, 401, 'phiên khác bị hủy');
    assert.equal((await dangNhap(srv, 'chu', 'mật khẩu mới 2026')).status, 200);
  } finally { await srv.stop(); }
});

test('N6 tiêm mã: họ tên chứa HTML / SQL được lưu đúng nguyên văn (giao diện tự thoát ký tự); ô đăng nhập chứa câu SQL không lọt được, bảng còn nguyên', async () => {
  const srv = await startServer({});
  try {
    const { cookie } = await batDangNhap(srv);
    const xss = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const sqlTen = "Rob'); DROP TABLE \"nguoiDung\"; --";
    const r = await goi(srv, 'POST', '/api/users', { tenDangNhap: 'xem1', hoTen: xss + sqlTen, vaiTro: 'chi-xem', matKhau: 'mật khẩu tạm 1', matKhau2: 'mật khẩu tạm 1' }, cookie);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(bang(srv.dataDir, 'SELECT "hoTen" FROM "nguoiDung" WHERE "khoaTen" = \'xem1\'')[0].hoTen, xss + sqlTen);
    for (const t of ["' OR '1'='1", "chu' --", "chu'; DELETE FROM \"nguoiDung\"; --", '%', '_']) {
      const l = await dangNhap(srv, t, "' OR '1'='1");
      assert.equal(l.status, 401, t);
    }
    assert.equal(bang(srv.dataDir, 'SELECT count(*) AS n FROM "nguoiDung"')[0].n, 2);
    // tìm sự kiện với ký tự đặc biệt của LIKE
    const ev = await goi(srv, 'GET', '/api/auth/su-kien?q=' + encodeURIComponent("%' OR 1=1 --"), undefined, cookie);
    assert.equal(ev.status, 200); assert.deepEqual(ev.json.items, []);
  } finally { await srv.stop(); }
});
