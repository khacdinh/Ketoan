'use strict';
/* K-NT. Ghi người thao tác (mục 6): nguoiTao / nguoiSua trên bản ghi, nhật ký lấy người từ phiên (không tin tiêu đề gửi lên),
 * nhập Excel ghi người đang đăng nhập, lọc sự kiện bảo mật; sao lưu / khôi phục giữ nguyên người dùng, mật khẩu, trạng thái bật. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DatabaseSync } = require('node:sqlite');
const { startServer, readStored, tmpDir } = require('./helpers');
const { MK_CHU, goi, batDangNhap, dangNhap, taoVaDangNhap } = require('./auth-helpers');

const NGUOI_MAY = 'Người dùng máy này';

function seed() {
  return {
    schema: 3, settings: {}, vouchers: {}, trash: [], locks: [], attachments: [], cashCounts: [], ignoredWarnings: {},
    projects: [{ id: 101, ma: 'CT1', ten: 'Công trình 1', nganSach: 0, trangThai: 'Đang thực hiện', ghiChu: '' }],
    suppliers: [{ id: 102, ma: 'NCC1', ten: 'NCC 1', loai: '', sdt: '', diaChi: '', ghiChu: '' }],
    costGroups: [{ id: 104, ma: 'N1', ten: 'Nhóm 1' }],
    costItems: [{ id: 105, ma: 'HM1', ten: 'Bê tông', maNhom: 'N1', dvt: 'm3' }],
    materials: [], houses: [], costs: [],
    entries: [{ id: 103, seq: 1, ngay: '2026-08-01', soPhieu: 'PC001', maDuAn: 'CT1', maNCC: 'NCC1', noiDung: 'dòng có sẵn', thu: 0, chi: 1000, nguoiNhan: '', ghiChu: '' }],
    nextId: 200
  };
}
const nhatKy = (dir) => {
  const f = path.join(dir, 'nhat-ky.jsonl');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
};
function bang(file, sql) {
  const c = new DatabaseSync(file, { readOnly: true });
  try { return c.prepare(sql).all(); } finally { c.close(); }
}
const SLIP = (noiDung) => ({ header: { ngay: '2026-08-05', maCT: 'CT1', maNCC: 'NCC1', maHM: 'HM1' }, lines: [{ dienGiai: noiDung, soLuong: 2, donGia: 1000 }, { dienGiai: noiDung + ' 2', soLuong: 1, donGia: 500 }] });

test('T1 đăng nhập TẮT: bản ghi mới ghi "Người dùng máy này", sửa ghi người sửa; dữ liệu cũ không bị ghi đè người tạo; nhật ký vẫn nhận tên ở ô "Người đang dùng máy này"', async () => {
  const srv = await startServer({ seed: seed() });
  try {
    const r = await srv.ok('POST', '/api/entries', { ngay: '2026-08-02', noiDung: 'mới', chi: 5 });
    const e = r.db.entries.find((x) => x.noiDung === 'mới');
    assert.equal(e.nguoiTao, NGUOI_MAY);
    assert.equal(e.nguoiSua, undefined);
    const cu = r.db.entries.find((x) => x.id === 103);
    await srv.ok('PUT', '/api/entries/103', Object.assign({}, cu, { noiDung: 'dòng có sẵn (sửa)' }));
    const st = readStored(srv.dataDir);
    const cu2 = st.entries.find((x) => x.id === 103);
    assert.equal(cu2.nguoiTao, undefined, 'dữ liệu cũ: không có người tạo (giao diện hiện "Dữ liệu cũ")');
    assert.equal(cu2.nguoiSua, NGUOI_MAY);
    const s = await srv.ok('POST', '/api/cost-slips', SLIP('cát'));
    const rows = readStored(srv.dataDir).costs.filter((c) => c.phieuId === s.phieuId);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((c) => c.nguoiTao === NGUOI_MAY));
    // tên ở ô "Người đang dùng máy này" (tiêu đề X-Nguoi-Dung) vẫn vào nhật ký như trước khi có đăng nhập
    await srv.call('POST', '/api/entries', { ngay: '2026-08-03', noiDung: 'có tên', chi: 7 }, { 'X-Nguoi-Dung': encodeURIComponent('Chị Hoa') });
    const nk = nhatKy(srv.dataDir).find((x) => x.label && /có tên/.test(x.label));
    assert.equal(nk.by, 'Chị Hoa');
  } finally { await srv.stop(); }
});

test('T2 đăng nhập BẬT: người tạo / người sửa là tài khoản đang đăng nhập (dòng sổ, danh mục, phiếu nhập — sửa phiếu vẫn giữ người lập); nhật ký lấy tên từ phiên, bỏ qua tiêu đề giả', async () => {
  const srv = await startServer({ seed: seed() });
  try {
    const { cookie: chu, json } = await batDangNhap(srv);
    const idChu = String(json.nguoiDung.id);
    const kt = await taoVaDangNhap(srv, chu, 'ketoan1', 'ke-toan', 'kế toán mật khẩu 1');
    const idKt = String(kt.id);
    const gia = { 'X-Nguoi-Dung': encodeURIComponent('Kẻ giả danh') };
    let r = await goi(srv, 'POST', '/api/entries', { ngay: '2026-08-02', noiDung: 'kế toán ghi', chi: 5 }, kt.cookie, gia);
    assert.equal(r.status, 200);
    const e = r.json.db.entries.find((x) => x.noiDung === 'kế toán ghi');
    assert.equal(e.nguoiTao, idKt);
    r = await goi(srv, 'PUT', '/api/entries/' + e.id, Object.assign({}, e, { noiDung: 'chủ sửa' }), chu);
    assert.equal(r.status, 200);
    const e2 = readStored(srv.dataDir).entries.find((x) => x.id === e.id);
    assert.equal(e2.nguoiTao, idKt, 'sửa không đổi người tạo');
    assert.equal(e2.nguoiSua, idChu);
    // danh mục
    r = await goi(srv, 'POST', '/api/suppliers', { ma: 'NCC2', ten: 'NCC hai' }, kt.cookie);
    assert.equal(r.status, 200);
    assert.equal(readStored(srv.dataDir).suppliers.find((x) => x.ma === 'NCC2').nguoiTao, idKt);
    // phiếu nhập chi phí: sửa phiếu tạo lại dòng (id mới) nhưng người lập phiếu giữ nguyên
    r = await goi(srv, 'POST', '/api/cost-slips', SLIP('đá'), kt.cookie);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const phieuId = r.json.phieuId;
    r = await goi(srv, 'PUT', '/api/cost-slips/' + phieuId, SLIP('đá sửa'), chu);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const rows = readStored(srv.dataDir).costs.filter((c) => c.phieuId === phieuId);
    assert.equal(rows.length, 2);
    rows.forEach((c) => { assert.equal(c.nguoiTao, idKt, 'người lập phiếu'); assert.equal(c.nguoiSua, idChu, 'người sửa phiếu'); });
    // nhật ký: tên + id từ phiên, không phải tiêu đề giả
    const nk = nhatKy(srv.dataDir);
    const them = nk.find((x) => x.action === 'them' && x.kind === 'entries' && /kế toán ghi/.test(x.label));
    assert.equal(them.by, 'Người ketoan1 (ketoan1)');
    assert.equal(String(them.nguoiDungId), idKt);
    assert.ok(!nk.some((x) => /Kẻ giả danh/.test(x.by || '')), 'không tin tiêu đề X-Nguoi-Dung khi đăng nhập bật');
    // danh sách tên cho giao diện (id → "Họ tên (tên đăng nhập)") — không lộ mã băm
    const tt = await goi(srv, 'GET', '/api/auth/trang-thai', null, kt.cookie);
    assert.equal(tt.json.tenNguoi[idKt], 'Người ketoan1 (ketoan1)');
    assert.doesNotMatch(JSON.stringify(tt.json), /scrypt\$/);
    // /api/db, file xuất Excel không mang dữ liệu đăng nhập
    const db = await goi(srv, 'GET', '/api/db', null, kt.cookie);
    assert.doesNotMatch(db.body.toString(), /scrypt\$|matKhau|phienDangNhap/);
  } finally { await srv.stop(); }
});

test('T3 nhập Excel ghi người đang đăng nhập cho các dòng thêm vào (gộp thêm bởi Kế toán; thay thế bởi Chủ); nhật ký ghi đúng người', async () => {
  const nguon = await startServer({ seed: seed() });
  let file, fileCp;
  try {
    for (let i = 0; i < 3; i++) await nguon.ok('POST', '/api/entries', { ngay: '2026-08-1' + i, noiDung: 'từ file ' + i, chi: 100 + i, maDuAn: 'CT1' });
    await nguon.ok('POST', '/api/cost-slips', SLIP('thép'));
    file = (await nguon.call('GET', '/api/export/full')).body;
    fileCp = (await nguon.call('GET', '/api/export/costs')).body;
  } finally { await nguon.stop(); }
  const srv = await startServer({ seed: seed() });
  try {
    const { cookie: chu, json } = await batDangNhap(srv);
    const kt = await taoVaDangNhap(srv, chu, 'ketoan1', 'ke-toan', 'kế toán mật khẩu 1');
    let r = await goi(srv, 'POST', '/api/import?mode=merge', file, kt.cookie);
    assert.equal(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    let st = readStored(srv.dataDir);
    const moi = st.entries.filter((x) => /từ file/.test(x.noiDung));
    assert.equal(moi.length, 3);
    moi.forEach((x) => assert.equal(x.nguoiTao, String(kt.id)));
    assert.equal(st.entries.find((x) => x.id === 103).nguoiTao, undefined, 'dòng cũ không bị đổi người tạo');
    assert.ok(nhatKy(srv.dataDir).some((x) => /^nhap-excel/.test(x.action) && x.by === 'Người ketoan1 (ketoan1)'), JSON.stringify(nhatKy(srv.dataDir).map((x) => [x.action, x.by])));
    // file chi phí (ChiPhi_CongTrinh), gộp thêm bởi Kế toán
    r = await goi(srv, 'POST', '/api/import?mode=merge', fileCp, kt.cookie);
    assert.equal(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    const cp = readStored(srv.dataDir).costs.filter((c) => /thép/.test(c.dienGiai));
    assert.equal(cp.length, 2);
    cp.forEach((c) => assert.equal(c.nguoiTao, String(kt.id)));
    // Kế toán không được nhập thay thế
    r = await goi(srv, 'POST', '/api/import?mode=replace', file, kt.cookie);
    assert.equal(r.status, 403);
    // Chủ nhập thay thế: dòng mới ghi Chủ
    r = await goi(srv, 'POST', '/api/import?mode=replace', file, chu);
    assert.equal(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    st = readStored(srv.dataDir);
    assert.ok(st.entries.length >= 3);
    st.entries.forEach((x) => assert.equal(x.nguoiTao, String(json.nguoiDung.id), x.noiDung));
  } finally { await srv.stop(); }
});

test('T4 sự kiện bảo mật: Chủ lọc theo loại / chữ tìm / ngày; Kế toán, Chỉ xem không xem được; chữ tìm có ký tự đặc biệt không gây lỗi', async () => {
  const srv = await startServer({ seed: seed() });
  try {
    const { cookie: chu } = await batDangNhap(srv);
    const kt = await taoVaDangNhap(srv, chu, 'ketoan1', 'ke-toan', 'kế toán mật khẩu 1');
    await dangNhap(srv, 'ketoan1', 'sai mật khẩu nè');
    await dangNhap(srv, 'khongco', 'sai mật khẩu nè');
    let r = await goi(srv, 'GET', '/api/auth/su-kien', null, chu);
    assert.equal(r.status, 200);
    const loai = new Set(r.json.items.map((x) => x.loai));
    ['bat-dang-nhap', 'tao-nguoi-dung', 'dang-nhap', 'dang-nhap-that-bai'].forEach((l) => assert.ok(loai.has(l), l + ' ' + [...loai]));
    r = await goi(srv, 'GET', '/api/auth/su-kien?loai=dang-nhap-that-bai', null, chu);
    assert.ok(r.json.items.length >= 2 && r.json.items.every((x) => x.loai === 'dang-nhap-that-bai'));
    r = await goi(srv, 'GET', '/api/auth/su-kien?q=khongco', null, chu);
    assert.ok(r.json.items.length >= 1 && r.json.items.every((x) => /khongco/.test(JSON.stringify(x))));
    r = await goi(srv, 'GET', '/api/auth/su-kien?q=' + encodeURIComponent("%_'\"; DROP TABLE x;--"), null, chu);
    assert.equal(r.status, 200);
    assert.equal(r.json.items.length, 0);
    const homNay = new Date().toISOString().slice(0, 10);
    r = await goi(srv, 'GET', '/api/auth/su-kien?tu=2000-01-01&den=2000-01-02', null, chu);
    assert.equal(r.json.items.length, 0);
    r = await goi(srv, 'GET', '/api/auth/su-kien?tu=' + homNay + '&den=' + homNay, null, chu);
    assert.ok(r.json.items.length > 0);
    // sự kiện không chứa mật khẩu đã gõ
    assert.doesNotMatch(JSON.stringify(r.json), /sai mật khẩu nè|kế toán mật khẩu 1/);
    r = await goi(srv, 'GET', '/api/auth/su-kien', null, kt.cookie);
    assert.equal(r.status, 403);
    const xem = await taoVaDangNhap(srv, chu, 'xem1', 'chi-xem', 'chỉ xem mật khẩu 1');
    r = await goi(srv, 'GET', '/api/auth/su-kien', null, xem.cookie);
    assert.equal(r.status, 403);
  } finally { await srv.stop(); }
});

test('T5 sao lưu / khôi phục: khôi phục bản sao lưu cũ (tạo TRƯỚC khi bật đăng nhập) — đăng nhập vẫn bật, người dùng và mật khẩu hiện tại giữ nguyên, mọi phiên bị hủy; file tải về (.db, .zip, .json) không có dữ liệu đăng nhập', async () => {
  const srv = await startServer({ seed: seed() });
  try {
    const bk = await srv.ok('POST', '/api/backups/now'); // lúc chưa bật đăng nhập
    const { cookie: chu } = await batDangNhap(srv);
    const kt = await taoVaDangNhap(srv, chu, 'ketoan1', 'ke-toan', 'kế toán mật khẩu 1');
    const MK_MOI = 'Chủ đổi mật khẩu mới 2026';
    let r = await goi(srv, 'POST', '/api/auth/doi-mat-khau', { matKhauCu: MK_CHU, matKhauMoi: MK_MOI, matKhauMoi2: MK_MOI }, chu);
    assert.equal(r.status, 200);
    const chu2 = (await dangNhap(srv, 'chu', MK_MOI)).cookie;
    await goi(srv, 'POST', '/api/entries', { ngay: '2026-08-09', noiDung: 'sau sao lưu', chi: 9 }, chu2);
    // file tải về không mang người dùng / mã băm / phiên / mã khôi phục
    const tai = tmpDir('tai-ve');
    r = await goi(srv, 'GET', '/api/backup', null, chu2);
    assert.equal(r.status, 200);
    fs.writeFileSync(path.join(tai, 'a.db'), r.body);
    ['nguoiDung', 'phienDangNhap', 'suKienBaoMat', 'cauHinhDangNhap'].forEach((t) => {
      const n = bang(path.join(tai, 'a.db'), 'SELECT count(*) AS n FROM sqlite_master WHERE name = \'' + t + '\'')[0].n;
      if (n) assert.equal(bang(path.join(tai, 'a.db'), 'SELECT count(*) AS n FROM "' + t + '"')[0].n, 0, t);
    });
    assert.ok(!r.body.includes(Buffer.from('scrypt$')), 'không còn mã băm trong trang trống của file');
    r = await goi(srv, 'GET', '/api/backup-zip', null, chu2);
    const zip = await JSZip.loadAsync(r.body);
    const zdb = await zip.file('ketoan.db').async('nodebuffer');
    assert.ok(!zdb.includes(Buffer.from('scrypt$')));
    assert.doesNotMatch(await zip.file('ketoan.json').async('string'), /scrypt\$|matKhau|nguoiDung"/);
    r = await goi(srv, 'GET', '/api/backup-json', null, chu2);
    assert.doesNotMatch(r.body.toString(), /scrypt\$|"matKhau"|phienDangNhap/);
    // khôi phục bản sao lưu cũ (Chủ)
    r = await goi(srv, 'POST', '/api/backups/restore', { name: bk.name }, chu2);
    assert.equal(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    assert.ok(!r.json.db.entries.some((x) => x.noiDung === 'sau sao lưu'), 'dữ liệu đã về bản cũ');
    assert.match(String(r.headers['set-cookie'] || ''), /stc_phien=;/, 'xóa cookie phiên');
    // mọi phiên bị hủy
    for (const c of [chu2, kt.cookie]) assert.equal((await goi(srv, 'GET', '/api/db', null, c)).status, 401);
    // vẫn bật, mật khẩu hiện tại (mới) dùng được, mật khẩu cũ thì không; người dùng khác còn nguyên
    const tt = await goi(srv, 'GET', '/api/auth/trang-thai', null, null);
    assert.equal(tt.json.bat, true);
    assert.equal((await dangNhap(srv, 'chu', MK_CHU)).status, 401);
    const l = await dangNhap(srv, 'chu', MK_MOI);
    assert.equal(l.status, 200);
    assert.equal((await dangNhap(srv, 'ketoan1', 'kế toán mật khẩu 1')).status, 200);
    // khôi phục từ file .db tải về (cũng không làm mất tài khoản)
    r = await goi(srv, 'POST', '/api/restore', fs.readFileSync(path.join(tai, 'a.db')), l.cookie);
    assert.equal(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    assert.ok(r.json.db.entries.some((x) => x.noiDung === 'sau sao lưu'));
    assert.equal((await dangNhap(srv, 'chu', MK_MOI)).status, 200);
    // Kế toán không khôi phục được
    const kt2 = await dangNhap(srv, 'ketoan1', 'kế toán mật khẩu 1');
    r = await goi(srv, 'POST', '/api/backups/restore', { name: bk.name }, kt2.cookie);
    assert.equal(r.status, 403);
    // sự kiện bảo mật ghi lại việc khôi phục
    const sk = bang(path.join(srv.dataDir, 'ketoan.db'), 'SELECT "loai" FROM "suKienBaoMat"').map((x) => x.loai);
    assert.ok(sk.filter((x) => x === 'khoi-phuc-sao-luu').length >= 2);
  } finally { await srv.stop(); }
});

test('T6 không lộ bí mật: mật khẩu, mã phiên, mã dự phòng không xuất hiện trong nhật ký thay đổi, log máy chủ, sự kiện bảo mật, file Excel xuất', async () => {
  const srv = await startServer({ seed: seed() });
  try {
    const { cookie: chu, maDuPhong } = await batDangNhap(srv);
    const kt = await taoVaDangNhap(srv, chu, 'ketoan1', 'ke-toan', 'kế toán mật khẩu 1');
    await goi(srv, 'POST', '/api/entries', { ngay: '2026-08-02', noiDung: 'x', chi: 5 }, kt.cookie);
    await dangNhap(srv, 'chu', 'mật khẩu sai bí mật 9');
    const xls = (await goi(srv, 'GET', '/api/export/full', null, chu)).body;
    const zip = await JSZip.loadAsync(xls);
    let xml = '';
    for (const n of Object.keys(zip.files)) if (!zip.files[n].dir) xml += await zip.files[n].async('string');
    const tokenChu = chu.split('=')[1];
    const bimat = [MK_CHU, 'kế toán mật khẩu 1', 'mật khẩu sai bí mật 9', maDuPhong, maDuPhong.replace(/-/g, ''), tokenChu, kt.cookie.split('=')[1]];
    const nk = fs.readFileSync(path.join(srv.dataDir, 'nhat-ky.jsonl'), 'utf8');
    const sk = JSON.stringify(bang(path.join(srv.dataDir, 'ketoan.db'), 'SELECT * FROM "suKienBaoMat"'));
    const phien = JSON.stringify(bang(path.join(srv.dataDir, 'ketoan.db'), 'SELECT * FROM "phienDangNhap"'));
    for (const s of bimat) {
      assert.ok(!nk.includes(s), 'nhật ký');
      assert.ok(!srv.log.includes(s), 'log máy chủ');
      assert.ok(!sk.includes(s), 'sự kiện bảo mật');
      assert.ok(!xml.includes(s), 'file Excel');
      assert.ok(!phien.includes(s), 'bảng phiên chỉ giữ mã băm');
    }
    assert.doesNotMatch(xml, /scrypt\$/);
  } finally { await srv.stop(); }
});
