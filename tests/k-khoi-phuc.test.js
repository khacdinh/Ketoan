'use strict';
/* K-KP. Quên mật khẩu (mục 5): mã một lần trong file cục bộ (không hiện ở giao diện / API / nhật ký / log), hết hạn 15 phút, sai mã,
 * dùng một lần; mã dự phòng của Chủ; lệnh cứu hộ dòng lệnh; không bị khóa ngoài. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const { startServer, ROOT } = require('./helpers');
const { MK_CHU, goi, batDangNhap, dangNhap, taoVaDangNhap, dongHo } = require('./auth-helpers');

const fileMa = (srv) => path.join(srv.dataDir, 'khoi-phuc', 'MA_KHOI_PHUC.txt');
function docMa(srv) {
  const t = fs.readFileSync(fileMa(srv), 'utf8');
  const m = /Mã:\s+([A-Z2-9]{5}-[A-Z2-9]{5})/.exec(t);
  return m ? m[1] : null;
}
function suKien(dir) {
  const c = new DatabaseSync(path.join(dir, 'ketoan.db'), { readOnly: true });
  try { return c.prepare('SELECT * FROM "suKienBaoMat" ORDER BY "id"').all(); } finally { c.close(); }
}

test('R1 quên mật khẩu: mã ghi vào data/khoi-phuc/MA_KHOI_PHUC.txt, KHÔNG có trong trả lời API, nhật ký, sự kiện, log máy chủ, CSDL (chỉ bản băm); trả lời giống hệt với tên không tồn tại (không ghi file); dùng đúng mã + mật khẩu mới → đặt lại, file bị xóa, phiên cũ bị hủy; mã không dùng lại được', async () => {
  const srv = await startServer({});
  try {
    const { cookie } = await batDangNhap(srv);
    const kt = await taoVaDangNhap(srv, cookie, 'ketoan1', 'ke-toan', 'kế toán mật khẩu 1');
    const khong = await goi(srv, 'POST', '/api/auth/quen-mat-khau', { tenDangNhap: 'khongtontai' });
    assert.equal(khong.status, 200);
    assert.ok(!fs.existsSync(fileMa(srv)), 'tên không tồn tại: không ghi file');
    const r = await goi(srv, 'POST', '/api/auth/quen-mat-khau', { tenDangNhap: 'KETOAN1' });
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.json).sort(), Object.keys(khong.json).sort());
    assert.equal(r.json.thongBao, khong.json.thongBao, 'cùng một câu trả lời');
    const ma = docMa(srv);
    assert.ok(ma, 'file có mã');
    const raw = ma.replace('-', '');
    assert.match(fs.readFileSync(fileMa(srv), 'utf8'), /Hết hạn/);
    assert.ok(!JSON.stringify(r.json).includes(raw) && !JSON.stringify(r.json).includes(ma), 'API không trả mã');
    assert.ok(!fs.readFileSync(path.join(srv.dataDir, 'nhat-ky.jsonl'), 'utf8').includes(raw), 'nhật ký không có mã');
    assert.ok(!JSON.stringify(suKien(srv.dataDir)).includes(raw), 'sự kiện không có mã');
    assert.ok(!srv.log.includes(raw), 'log máy chủ không có mã');
    assert.ok(!fs.readFileSync(path.join(srv.dataDir, 'ketoan.db')).includes(Buffer.from(raw)), 'CSDL chỉ có bản băm');
    // mật khẩu mới sai chính sách: mã chưa bị dùng
    assert.equal((await goi(srv, 'POST', '/api/auth/dat-lai-bang-ma', { tenDangNhap: 'ketoan1', ma, matKhauMoi: 'ngan', matKhauMoi2: 'ngan' })).status, 400);
    const d = await goi(srv, 'POST', '/api/auth/dat-lai-bang-ma', { tenDangNhap: 'ketoan1', ma: ma.toLowerCase(), matKhauMoi: 'mật khẩu mới của Thúy', matKhauMoi2: 'mật khẩu mới của Thúy' });
    assert.equal(d.status, 200, JSON.stringify(d.json));
    assert.ok(!fs.existsSync(fileMa(srv)), 'dùng xong file bị xóa');
    assert.equal((await goi(srv, 'GET', '/api/db', undefined, kt.cookie)).status, 401, 'phiên cũ bị hủy');
    assert.equal((await dangNhap(srv, 'ketoan1', 'mật khẩu mới của Thúy')).status, 200);
    const lai = await goi(srv, 'POST', '/api/auth/dat-lai-bang-ma', { tenDangNhap: 'ketoan1', ma, matKhauMoi: 'mật khẩu khác nữa 1', matKhauMoi2: 'mật khẩu khác nữa 1' });
    assert.equal(lai.status, 400, 'mã chỉ dùng một lần');
    const ev = suKien(srv.dataDir).map((e) => e.loai);
    assert.ok(ev.includes('yeu-cau-ma-khoi-phuc') && ev.includes('dat-lai-bang-ma') && ev.includes('ma-khoi-phuc-sai'));
  } finally { await srv.stop(); }
});

test('R2 mã khôi phục quá hạn (15 phút, đồng hồ giả lập) bị từ chối; sai mã 5 lần thì mã bị hủy (kể cả nhập đúng sau đó); mã của người A không dùng cho người B; lấy mã mới thì mã cũ hết hiệu lực', async () => {
  const dh = dongHo();
  const srv = await startServer({ env: dh.env });
  try {
    const { cookie } = await batDangNhap(srv);
    await taoVaDangNhap(srv, cookie, 'ketoan1', 'ke-toan', 'kế toán mật khẩu 1');
    const moi = { matKhauMoi: 'mật khẩu mới 2026 x', matKhauMoi2: 'mật khẩu mới 2026 x' };
    await goi(srv, 'POST', '/api/auth/quen-mat-khau', { tenDangNhap: 'ketoan1' });
    let ma = docMa(srv);
    dh.tien(16 * 60000);
    assert.equal((await goi(srv, 'POST', '/api/auth/dat-lai-bang-ma', Object.assign({ tenDangNhap: 'ketoan1', ma }, moi))).status, 400, 'quá hạn');
    await goi(srv, 'POST', '/api/auth/quen-mat-khau', { tenDangNhap: 'ketoan1' });
    ma = docMa(srv);
    assert.equal((await goi(srv, 'POST', '/api/auth/dat-lai-bang-ma', Object.assign({ tenDangNhap: 'chu', ma }, moi))).status, 400, 'mã của ketoan1 không dùng cho chu');
    for (let i = 0; i < 5; i++) assert.equal((await goi(srv, 'POST', '/api/auth/dat-lai-bang-ma', Object.assign({ tenDangNhap: 'ketoan1', ma: 'AAAAA-AAAA' + i }, moi))).status, 400);
    assert.equal((await goi(srv, 'POST', '/api/auth/dat-lai-bang-ma', Object.assign({ tenDangNhap: 'ketoan1', ma }, moi))).status, 400, 'sai 5 lần: mã bị hủy');
    assert.ok(!fs.existsSync(fileMa(srv)));
    await goi(srv, 'POST', '/api/auth/quen-mat-khau', { tenDangNhap: 'ketoan1' });
    const ma1 = docMa(srv);
    await goi(srv, 'POST', '/api/auth/quen-mat-khau', { tenDangNhap: 'ketoan1' });
    const ma2 = docMa(srv);
    assert.notEqual(ma1, ma2);
    assert.equal((await goi(srv, 'POST', '/api/auth/dat-lai-bang-ma', Object.assign({ tenDangNhap: 'ketoan1', ma: ma1 }, moi))).status, 400, 'mã cũ hết hiệu lực');
    assert.equal((await goi(srv, 'POST', '/api/auth/dat-lai-bang-ma', Object.assign({ tenDangNhap: 'ketoan1', ma: ma2 }, moi))).status, 200);
  } finally { await srv.stop(); }
});

test('R3 mã dự phòng: quên hết mật khẩu Chủ vẫn vào lại được; dùng xong sinh mã mới (mã cũ hết hiệu lực); mã sai / tên không phải Chủ bị từ chối; Chủ tạo được mã mới (cần mật khẩu)', async () => {
  const srv = await startServer({});
  try {
    const { cookie, maDuPhong } = await batDangNhap(srv);
    await taoVaDangNhap(srv, cookie, 'ketoan1', 'ke-toan', 'kế toán mật khẩu 1');
    const moi = { matKhauMoi: 'chủ lấy lại quyền 2026', matKhauMoi2: 'chủ lấy lại quyền 2026' };
    assert.equal((await goi(srv, 'POST', '/api/auth/dung-ma-du-phong', Object.assign({ tenDangNhap: 'chu', maDuPhong: 'AAAA-BBBB-CCCC-DDDD-EEEE' }, moi))).status, 400);
    assert.equal((await goi(srv, 'POST', '/api/auth/dung-ma-du-phong', Object.assign({ tenDangNhap: 'ketoan1', maDuPhong }, moi))).status, 400, 'chỉ cho tài khoản Chủ');
    const r = await goi(srv, 'POST', '/api/auth/dung-ma-du-phong', Object.assign({ tenDangNhap: 'chu', maDuPhong: maDuPhong.toLowerCase().replace(/-/g, ' ') }, moi));
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.match(r.json.maDuPhong, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/);
    assert.notEqual(r.json.maDuPhong, maDuPhong);
    assert.equal((await goi(srv, 'GET', '/api/db', undefined, cookie)).status, 401, 'phiên cũ của Chủ bị hủy');
    const l = await dangNhap(srv, 'chu', 'chủ lấy lại quyền 2026');
    assert.equal(l.status, 200);
    assert.equal((await goi(srv, 'POST', '/api/auth/dung-ma-du-phong', Object.assign({ tenDangNhap: 'chu', maDuPhong }, moi))).status, 400, 'mã cũ hết hiệu lực');
    // Chủ tạo mã mới
    assert.equal((await goi(srv, 'POST', '/api/auth/ma-du-phong', { matKhau: 'sai rồi' }, l.cookie)).status, 400);
    const m = await goi(srv, 'POST', '/api/auth/ma-du-phong', { matKhau: 'chủ lấy lại quyền 2026' }, l.cookie);
    assert.equal(m.status, 200);
    assert.equal((await goi(srv, 'POST', '/api/auth/dung-ma-du-phong', Object.assign({ tenDangNhap: 'chu', maDuPhong: r.json.maDuPhong }, moi))).status, 400, 'mã trước đó hết hiệu lực');
    const ev = suKien(srv.dataDir);
    assert.ok(ev.some((e) => e.loai === 'dung-ma-du-phong') && ev.some((e) => e.loai === 'ma-du-phong-sai'));
    assert.ok(!JSON.stringify(ev).includes(maDuPhong.replace(/-/g, '')));
  } finally { await srv.stop(); }
});

function chayCuuHo(dir, input, args) {
  return spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'dat-lai-mat-khau-chu.js'), '--data', dir].concat(args || []), {
    input, encoding: 'utf8', env: Object.assign({}, process.env, { KETOAN_CHO_NODE_CU: '1' })
  });
}

test('R4 lệnh cứu hộ dòng lệnh: xác nhận bằng chữ CO; đặt lại mật khẩu Chủ, mở khóa, hủy phiên, ghi sự kiện; không xác nhận / mật khẩu yếu / không phải Chủ thì không đổi gì; không in mật khẩu ra màn hình', async () => {
  const srv = await startServer({});
  const { cookie } = await batDangNhap(srv);
  await taoVaDangNhap(srv, cookie, 'ketoan1', 'ke-toan', 'kế toán mật khẩu 1');
  for (let i = 0; i < 5; i++) await dangNhap(srv, 'chu', 'sai ' + i); // khóa tài khoản Chủ
  await srv.stop();
  const dir = srv.dataDir;
  const hashCu = () => { const c = new DatabaseSync(path.join(dir, 'ketoan.db'), { readOnly: true }); try { return c.prepare('SELECT "matKhau" FROM "nguoiDung" WHERE "tenDangNhap" = \'chu\'').get().matKhau; } finally { c.close(); } };
  const h0 = hashCu();
  let r = chayCuuHo(dir, 'mật khẩu cứu hộ 2026\nmật khẩu cứu hộ 2026\nkhong\n');
  assert.equal(r.status, 1); assert.match(r.stderr, /Không xác nhận/);
  r = chayCuuHo(dir, '12345678\n12345678\nCO\n');
  assert.equal(r.status, 1); assert.match(r.stderr, /phổ biến/);
  r = chayCuuHo(dir, 'mật khẩu cứu hộ 2026\nmật khẩu cứu hộ 2026\nCO\n', ['--ten', 'ketoan1']);
  assert.equal(r.status, 1); assert.match(r.stderr, /không phải tài khoản Chủ/);
  assert.equal(hashCu(), h0, 'chưa đổi gì');
  r = chayCuuHo(dir, 'mật khẩu cứu hộ 2026\nmật khẩu cứu hộ 2026\nCO\n');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ĐÃ ĐẶT LẠI/);
  assert.match(r.stdout, /Ai mở được máy này/);
  assert.ok(!r.stdout.includes('mật khẩu cứu hộ 2026'), 'không in mật khẩu');
  assert.notEqual(hashCu(), h0);
  const srv2 = await startServer({ data: dir });
  try {
    assert.equal((await goi(srv2, 'GET', '/api/db', undefined, cookie)).status, 401, 'phiên cũ bị hủy');
    assert.equal((await dangNhap(srv2, 'chu', 'mật khẩu cứu hộ 2026')).status, 200, 'đăng nhập được (đã mở khóa)');
    assert.ok(suKien(dir).some((e) => e.loai === 'cuu-ho-dong-lenh'));
  } finally { await srv2.stop(); }
});
