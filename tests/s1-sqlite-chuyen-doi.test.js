'use strict';
/* S1. Chuyển dữ liệu ketoan.json → ketoan.db (SQLite) lúc khởi động:
 * thành công + báo cáo, chạy lại không nhân đôi, dữ liệu bất thường nạp nguyên trạng, JSON hỏng / sai cấu trúc,
 * lỗi giữa chừng (giả lập và kill -9) không đụng file gốc, thư mục có dấu cách / chữ Việt. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { startServer, makeDataDir, makeBigDb, readStored, readJsonFile, tmpDir, orphanErrors, freePort, KT } = require('./helpers');
const { Store, SCHEMA_VERSION } = require('../lib/store');
const { summarize } = require('./so-lieu-moc');

const V1 = path.join(__dirname, 'fixtures', 'ketoan-v1-goc.json');
const V2 = path.join(__dirname, 'fixtures', 'ketoan-v2-hien-tai.json');
const MOC = readJsonFile(path.join(__dirname, 'fixtures', 'moc-so-lieu-nhom1.json'));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((o, key) => { o[key] = v[key]; return o; }, {}) : v));
const quiet = (fn) => { const w = console.warn; const l = console.log; console.warn = () => {}; console.log = () => {}; try { return fn(); } finally { console.warn = w; console.log = l; } };

test('S1.1 dữ liệu thật (schema 2): chuyển thành công, mọi con số như mốc, sao lưu "truoc-khi-chuyen-sqlite" giống hệt file gốc, báo cáo đầy đủ, nhật ký một mục', async () => {
  const dir = makeDataDir(V2);
  const h0 = sha(path.join(dir, 'ketoan.json'));
  const srv = await startServer({ data: dir });
  try {
    assert.ok(!srv.exited, srv.log);
    const db = await srv.db();
    assert.equal(db.schema, SCHEMA_VERSION);
    assert.deepEqual(summarize(db), MOC.v2, 'mọi số liệu báo cáo giống mốc của bản JSON');
    assert.deepEqual(orphanErrors(db), []);
    // file
    assert.ok(fs.existsSync(path.join(dir, 'ketoan.db')));
    assert.ok(!fs.existsSync(path.join(dir, 'ketoan.json')), 'ketoan.json được đổi tên để không chuyển lần hai');
    assert.equal(sha(path.join(dir, 'ketoan.json.da-chuyen-sqlite.bak')), h0, 'file gốc giữ nguyên nội dung');
    const bk = fs.readdirSync(path.join(dir, 'backups')).filter((f) => /truoc-khi-chuyen-sqlite\.json$/.test(f));
    assert.equal(bk.length, 1);
    assert.equal(sha(path.join(dir, 'backups', bk[0])), h0, 'bản sao lưu giống hệt từng byte');
    assert.ok(!fs.readdirSync(dir).some((f) => /dang-chuyen/.test(f)), 'không còn file tạm');
    // báo cáo
    const rep = fs.readFileSync(path.join(dir, 'migrate-bao-cao.txt'), 'utf8');
    assert.match(rep, /THÀNH CÔNG/);
    assert.match(rep, /Tồn quỹ \(mọi dòng\)\s+943\.000\s+943\.000\s+khớp/);
    assert.match(rep, /Tổng thu\s+2\.532\.577\.035\s+2\.532\.577\.035\s+khớp/);
    assert.match(rep, /Tổng chi\s+2\.531\.634\.035\s+2\.531\.634\.035\s+khớp/);
    assert.match(rep, /So sánh toàn bộ bản ghi.*khớp/);
    assert.ok(!/LỆCH/.test(rep), 'không chỉ tiêu nào lệch');
    // đúng dữ liệu trên đĩa, schema 4
    const disk = readStored(dir);
    assert.equal(disk.schema, SCHEMA_VERSION);
    assert.equal(disk.entries.length, 66);
    assert.equal(disk.costs.length, 104);
    // nhật ký
    const items = (await srv.ok('GET', '/api/audit')).items;
    assert.equal(items.length, 1);
    assert.equal(items[0].action, 'khoi-tao');
    assert.match(items[0].label, /SQLite/);
    assert.match(items[0].note, /943000|943\.000/);
  } finally { await srv.stop(); }
});

test('S1.2 chạy lại nhiều lần: không chuyển lần hai, không nhân đôi, không thêm bản sao lưu chuyển đổi; ghi tiếp được', async () => {
  const dir = makeDataDir(V2);
  let first;
  for (let i = 0; i < 4; i++) {
    const srv = await startServer({ data: dir });
    try {
      const db = await srv.db();
      if (!first) first = db;
      assert.equal(db.entries.length, 66 + i);
      assert.deepEqual(db.costs, first.costs);
      await srv.ok('POST', '/api/entries', { ngay: '2026-09-30', noiDung: 'lần ' + i, chi: 1 });
    } finally { await srv.stop(); }
  }
  assert.equal(fs.readdirSync(path.join(dir, 'backups')).filter((f) => /truoc-khi-chuyen-sqlite/.test(f)).length, 1);
  assert.equal((fs.readFileSync(path.join(dir, 'nhat-ky.jsonl'), 'utf8').match(/"khoi-tao"/g) || []).length, 1);
});

test('S1.3 dữ liệu gốc schema 1: nâng cấp và chuyển một lần, số liệu như mốc v1', async () => {
  const dir = makeDataDir(V1);
  const srv = await startServer({ data: dir });
  try {
    const db = await srv.db();
    assert.deepEqual(summarize(db), MOC.v1);
    assert.equal(db.costGroups.length, 6);
    assert.equal(db.costItems.length, 37);
    const rep = fs.readFileSync(path.join(dir, 'migrate-bao-cao.txt'), 'utf8');
    assert.match(rep, /schema 1/);
    assert.match(rep, /nạp 6 nhóm chi phí và 37 hạng mục mặc định/);
  } finally { await srv.stop(); }
});

// Dữ liệu bất thường cài sẵn
function abnormal() {
  const d = readJsonFile(V2);
  d.schema = 3;
  d.entries[0].maDuAn = 'KHONG_CO_DU_AN';                // mồ côi
  d.entries[1].thu = '1.500.000';                        // số dạng chuỗi
  d.entries[2].chi = 12345.5;                            // tiền có số lẻ
  d.entries[3].noiDung = 'Có ký tự NUL\u0000ở giữa và sau';  // NUL
  d.entries[4].noiDung = 'Tiếng Việt: Đặng Thị Ngọc Ánh — “ngoặc” ₫ 😀 é (dựng tổ hợp)';
  d.entries[5].ghiChu = null;                            // null
  d.entries[6].moiLa = { a: [1, 2] };                    // trường lạ
  delete d.entries[7].maNCC;                             // thiếu trường mã
  d.entries[8].ngay = '30/09/2026';                      // ngày lạ
  d.entries[9].id = d.entries[10].id;                    // trùng id
  d.entries[11].maNCC = 12345;                           // mã kiểu số
  d.suppliers[1].ma = d.suppliers[0].ma.toLowerCase();   // trùng mã (khác hoa thường)
  d.costs[0].soLuong = '2,5';                            // số lượng dạng chuỗi
  d.costs[1].donGia = 0.1 + 0.2;                         // số thực không tròn
  d.costs[2].maVT = 'VT_LA';                             // mồ côi vật tư
  d.houses[0].dienTich = 120.75;                         // kiểu số ở cột chữ
  d.vouchers = { 'PC001/09': { lyDo: 'in \u0000 thử', kemTheo: 2 }, LA: 'không phải đối tượng' };
  d.trash = [{ id: 99001, at: '2026-09-01T00:00:00Z', by: 'x', kind: 'entries', label: 'thùng rác', records: [{ id: 99002, thu: '1' }] }];
  d.locks = [{ thang: '2026-02', at: 'a', by: 'b' }];
  d.ignoredWarnings = { 'gia:x': { at: 'a', by: '', label: 'l', note: '' } };
  d.cashCounts = [{ id: 99003, ngay: '2026-09-01', thucTe: 5, tonSo: 6, menhGia: { 500000: 1 }, nguoiKiem: '', ghiChu: '', createdAt: '', by: '' }];
  d.khoaLaCapCao = { giuNguyen: true };
  d.nextId = 5; // sai: nhỏ hơn id đang dùng
  return d;
}

test('S1.4 dữ liệu bất thường: nạp nguyên trạng (mồ côi, số dạng chuỗi, tiền lẻ, NUL, Unicode, null, trường lạ, mã thiếu/kiểu số, ngày lạ), id trùng được cấp mới; báo cáo liệt kê; mở lại giống hệt', () => {
  const dir = makeDataDir(abnormal());
  const src = abnormal();
  const st = quiet(() => new Store(dir));
  const db = st.db;
  // nguyên trạng
  assert.equal(db.entries[0].maDuAn, 'KHONG_CO_DU_AN');
  assert.equal(db.entries[1].thu, '1.500.000');
  assert.equal(db.entries[2].chi, 12345.5);
  assert.equal(db.entries[3].noiDung, 'Có ký tự NUL\u0000ở giữa và sau');
  assert.equal(db.entries[4].noiDung, src.entries[4].noiDung);
  assert.equal(db.entries[5].ghiChu, null);
  assert.deepEqual(db.entries[6].moiLa, { a: [1, 2] });
  assert.ok(!('maNCC' in db.entries[7]), 'trường mã vắng mặt vẫn vắng mặt');
  assert.equal(db.entries[8].ngay, '30/09/2026');
  assert.equal(db.entries[11].maNCC, 12345);
  assert.equal(db.suppliers[1].ma, src.suppliers[1].ma);
  assert.equal(db.costs[0].soLuong, '2,5');
  assert.equal(db.costs[1].donGia, 0.1 + 0.2);
  assert.equal(db.houses[0].dienTich, 120.75);
  assert.deepEqual(db.vouchers, src.vouchers);
  assert.deepEqual(db.trash, src.trash);
  assert.deepEqual(db.khoaLaCapCao, { giuNguyen: true });
  // id trùng → bản sau nhận id mới, mọi id duy nhất; nextId lớn hơn mọi id (kể cả trong thùng rác)
  assert.equal(db.entries[9].id, src.entries[9].id, 'bản đầu giữ id');
  assert.notEqual(db.entries[10].id, src.entries[10].id, 'bản sau được cấp id mới');
  assert.equal(new Set(db.entries.map((e) => e.id)).size, db.entries.length);
  assert.ok(db.nextId > 99003);
  // các trường khác của mọi bản ghi giữ nguyên
  const strip = (l) => l.map((e, i) => { const x = Object.assign({}, e); if (i === 10) delete x.id; return x; });
  assert.equal(canon(strip(db.entries)), canon(strip(src.entries)));
  assert.equal(canon(db.costs), canon(src.costs));
  // tổng tính như bản JSON (cùng hàm, cùng dữ liệu)
  const ref = quiet(() => new Store(makeDataDir()).normalize(abnormal()));
  ref.entries[10].id = db.entries[10].id; ref.nextId = db.nextId;
  assert.deepEqual(summarize(db), summarize(ref));
  // báo cáo
  const rep = fs.readFileSync(path.join(dir, 'migrate-bao-cao.txt'), 'utf8');
  [/THÀNH CÔNG/, /Mồ côi: Dòng sổ thu chi ghi Dự án "KHONG_CO_DU_AN"/, /số dạng chuỗi/, /tiền có số lẻ/, /ký tự NUL/, /trường lạ "moiLa"/,
    /ngày "30\/09\/2026"/, /trùng/, /Khóa lạ ở cấp cao nhất "khoaLaCapCao"/, /Mồ côi: Dòng chi phí ghi Vật tư "VT_LA"/, /nextId/].forEach((re) => assert.match(rep, re));
  st.close();
  // mở lại: giống hệt
  const st2 = quiet(() => new Store(dir));
  assert.equal(canon(st2.db), canon(db));
  st2.close();
});

test('S1.5 ketoan.json cắt ngang, không có bản sao lưu: dừng với thông báo tiếng Việt, file gốc giữ nguyên từng byte, không tạo ketoan.db', async () => {
  const dir = makeDataDir();
  const good = fs.readFileSync(V2, 'utf8');
  fs.writeFileSync(path.join(dir, 'ketoan.json'), good.slice(0, Math.floor(good.length / 3)));
  const h0 = sha(path.join(dir, 'ketoan.json'));
  const srv = await startServer({ data: dir });
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(srv.exited || srv.child.exitCode !== null, 'phải dừng');
  assert.match(srv.log, /Chưa chuyển được dữ liệu sang SQLite/);
  assert.match(srv.log, /GIỮ NGUYÊN/);
  assert.equal(sha(path.join(dir, 'ketoan.json')), h0);
  assert.ok(!fs.existsSync(path.join(dir, 'ketoan.db')));
  assert.ok(!fs.readdirSync(dir).some((f) => /dang-chuyen/.test(f)));
  assert.match(fs.readFileSync(path.join(dir, 'migrate-bao-cao.txt'), 'utf8'), /KHÔNG CHUYỂN/);
});

test('S1.6 ketoan.json sai cấu trúc (entries không phải danh sách / bản ghi null): dừng, không âm thầm coi là rỗng', () => {
  for (const bad of [{ entries: { a: 1 }, projects: [], suppliers: [] }, { entries: [null], projects: [], suppliers: [] }, [1, 2, 3], { settings: 'x' }]) {
    const dir = makeDataDir(bad);
    const h0 = sha(path.join(dir, 'ketoan.json'));
    assert.throws(() => quiet(() => new Store(dir)), /không đúng cấu trúc|không phải một đối tượng/);
    assert.equal(sha(path.join(dir, 'ketoan.json')), h0);
    assert.ok(!fs.existsSync(path.join(dir, 'ketoan.db')));
  }
});

test('S1.7 lỗi giữa chừng / số liệu lệch / lỗi sau khi ghi (giả lập): hủy, xóa file tạm, ketoan.json nguyên vẹn; chạy lại bình thường thì thành công', async () => {
  for (const fault of ['giua', 'lech', 'sau-commit']) {
    const dir = makeDataDir(V2);
    const h0 = sha(path.join(dir, 'ketoan.json'));
    const srv = await startServer({ data: dir, env: { KETOAN_THU_LOI_CHUYEN: fault } });
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(srv.exited || srv.child.exitCode !== null, fault + ': phải dừng');
    assert.match(srv.log, /Chưa chuyển được dữ liệu sang SQLite/, fault);
    assert.equal(sha(path.join(dir, 'ketoan.json')), h0, fault + ': file gốc nguyên vẹn');
    assert.ok(!fs.existsSync(path.join(dir, 'ketoan.db')), fault + ': không có ketoan.db');
    assert.ok(!fs.readdirSync(dir).some((f) => /dang-chuyen/.test(f)), fault + ': không còn file tạm');
    const rep = fs.readFileSync(path.join(dir, 'migrate-bao-cao.txt'), 'utf8');
    assert.match(rep, /KHÔNG CHUYỂN/);
    if (fault === 'lech') assert.match(rep, /không khớp/);
    // chạy lại không có lỗi giả lập
    const ok = await startServer({ data: dir });
    try {
      assert.deepEqual(summarize(await ok.db()), MOC.v2);
      // mỗi lần thử có bản sao lưu nguyên văn file gốc (hai lần thử trong cùng một giây thì trùng tên, ghi đè đúng nội dung đó)
      const bks = fs.readdirSync(path.join(dir, 'backups')).filter((f) => /truoc-khi-chuyen-sqlite/.test(f));
      assert.ok(bks.length >= 1 && bks.length <= 2, 'có bản sao lưu trước khi chuyển: ' + bks.join(', '));
      bks.forEach((f) => assert.equal(sha(path.join(dir, 'backups', f)), h0, 'bản sao lưu giống hệt file gốc'));
    } finally { await ok.stop(); }
  }
});

test('S1.8 kill -9 trong lúc đang chuyển đổi (20.000 dòng), lặp nhiều lần: ketoan.json không bao giờ bị hỏng; lần chạy sau chuyển trọn vẹn', { timeout: 300000 }, async () => {
  const big = makeBigDb(20000, 5000);
  const dir = makeDataDir(big);
  const json = path.join(dir, 'ketoan.json');
  const h0 = sha(json);
  let killedBefore = 0;
  // tự sinh tiến trình và giết sau các khoảng thời gian khác nhau
  const { spawn } = require('child_process');
  for (const ms of [80, 200, 350, 500, 700, 900, 1200, 1600]) {
    if (fs.existsSync(path.join(dir, 'ketoan.db'))) break;
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), '--no-open'], { env: Object.assign({}, process.env, { KETOAN_DATA: dir, PORT: String(await freePort()), NO_OPEN: '1', KETOAN_CHO_NODE_CU: '1' }), stdio: 'ignore' });
    await new Promise((r) => setTimeout(r, ms));
    child.kill('SIGKILL');
    await new Promise((r) => child.once('exit', r));
    if (!fs.existsSync(path.join(dir, 'ketoan.db'))) {
      killedBefore++;
      assert.equal(sha(json), h0, 'ketoan.json phải nguyên vẹn sau khi bị giết lúc ' + ms + ' ms');
    }
  }
  assert.ok(killedBefore > 0 || fs.existsSync(path.join(dir, 'ketoan.db')));
  const srv = await startServer({ data: dir });
  try {
    const db = await srv.db();
    assert.equal(db.costs.length, 20000);
    assert.equal(db.entries.length, big.entries.length);
    assert.equal(KT.costSummary(db, {}).total, big.costs.reduce((t, c) => t + c.thanhTien, 0));
    assert.ok(!fs.readdirSync(dir).some((f) => /dang-chuyen/.test(f)));
  } finally { await srv.stop(); }
});

test('S1.9 thư mục dữ liệu có dấu cách và chữ tiếng Việt: chuyển đổi, ghi, sao lưu, khôi phục đều được', async () => {
  const root = tmpDir();
  const dir = path.join(root, 'Dữ liệu kế toán', 'Công ty Điền Thủy 2026');
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(V2, path.join(dir, 'ketoan.json'));
  const srv = await startServer({ data: dir });
  try {
    assert.ok(!srv.exited, srv.log);
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-30', noiDung: 'ở thư mục có dấu', chi: 7 });
    const name = (await srv.ok('POST', '/api/backups/now')).name;
    assert.match(name, /\.db$/);
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-30', noiDung: 'sau sao lưu', chi: 8 });
    await srv.ok('POST', '/api/backups/restore', { name });
    const db = await srv.db();
    assert.ok(db.entries.some((e) => e.noiDung === 'ở thư mục có dấu'));
    assert.ok(!db.entries.some((e) => e.noiDung === 'sau sao lưu'));
    assert.equal(readStored(dir).entries.length, 67);
  } finally { await srv.stop(); }
});
