'use strict';
/* S3. Sao lưu / khôi phục với SQLite (.db, .json cũ, .zip mới và cũ), từ chối file hỏng / lạ mà giữ nguyên dữ liệu,
 * chống tiêm SQL ở mọi ô nhập và bộ lọc, chống path traversal khi khôi phục / tải về. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DatabaseSync } = require('node:sqlite');
const { startServer, makeDataDir, readStored, readBackupFile, readJsonFile, tmpDir } = require('./helpers');
const { summarize } = require('./so-lieu-moc');
const { TABLE_NAMES } = require('../lib/db');

const V1 = path.join(__dirname, 'fixtures', 'ketoan-v1-goc.json');
const V2 = path.join(__dirname, 'fixtures', 'ketoan-v2-hien-tai.json');
const MOC = readJsonFile(path.join(__dirname, 'fixtures', 'moc-so-lieu-nhom1.json'));

test('S3.1 vòng sao lưu → khôi phục: .db tải về khôi phục vào máy mới giống hệt (kể cả thùng rác, khóa sổ, kiểm quỹ, nháp); bản .db tự động khôi phục được', async () => {
  const src = await startServer({ seed: V2 });
  let dbBuf; let jsonBuf; let zipBuf; let want;
  try {
    const d = await src.db();
    await src.ok('POST', '/api/entries', { ngay: '2026-09-21', noiDung: 'nháp', chi: 5, trangThai: 'nhap' });
    await src.ok('DELETE', '/api/entries/' + d.entries[3].id);
    await src.ok('POST', '/api/cash-counts', { ngay: '2026-09-25', thucTe: 900000 });
    await src.ok('POST', '/api/locks', { months: ['2026-01'] });
    await src.ok('PUT', '/api/vouchers/' + encodeURIComponent(d.entries.find((e) => e.soPhieu).soPhieu), { lyDo: 'in thử' });
    want = await src.db();
    dbBuf = (await src.call('GET', '/api/backup')).body;
    jsonBuf = (await src.call('GET', '/api/backup-json')).body;
    zipBuf = (await src.call('GET', '/api/backup-zip')).body;
    want.trash = (await src.ok('GET', '/api/trash')).items.length;
  } finally { await src.stop(); }
  assert.equal(dbBuf.subarray(0, 15).toString(), 'SQLite format 3');
  for (const [name, body] of [['.db', dbBuf], ['.json', JSON.parse(jsonBuf.toString('utf8'))]]) {
    const dst = await startServer({});
    try {
      const r = await dst.ok('POST', '/api/restore', body);
      const got = r.db;
      ['entries', 'costs', 'projects', 'suppliers', 'materials', 'cashCounts', 'locks', 'vouchers', 'ignoredWarnings', 'attachments', 'settings', 'nextId'].forEach((k) => assert.deepEqual(got[k], want[k], name + ' ' + k));
      assert.equal((await dst.ok('GET', '/api/trash')).items.length, want.trash, name + ' thùng rác');
      assert.equal(readStored(dst.dataDir).entries.length, want.entries.length);
    } finally { await dst.stop(); }
  }
  // .zip mới có cả ketoan.db và ketoan.json
  const zip = await JSZip.loadAsync(zipBuf);
  assert.ok(zip.file('ketoan.db') && zip.file('ketoan.json') && zip.file('nhat-ky.jsonl'));
  const dz = await startServer({});
  try {
    const r = await dz.ok('POST', '/api/restore-zip', zipBuf);
    assert.deepEqual(r.db.entries, want.entries);
  } finally { await dz.stop(); }
});

test('S3.2 khôi phục dữ liệu cũ: file .json schema 1/2, .zip của bản JSON (chỉ có ketoan.json), bản sao lưu .json trong thư mục backups', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-30', noiDung: 'sẽ mất', chi: 1 });
    let r = await srv.ok('POST', '/api/restore', readJsonFile(V1));
    assert.deepEqual(summarize(r.db), MOC.v1);
    const old = new JSZip();
    old.file('ketoan.json', fs.readFileSync(V2, 'utf8'));
    r = await srv.ok('POST', '/api/restore-zip', await old.generateAsync({ type: 'nodebuffer' }));
    assert.deepEqual(summarize(r.db), MOC.v2);
    // bản sao lưu .json thời trước trong backups/
    fs.copyFileSync(V1, path.join(srv.dataDir, 'backups', 'ketoan-20250101-080000-tu-dong.json'));
    const list = (await srv.ok('GET', '/api/backups')).backups.map((b) => b.name);
    assert.ok(list.includes('ketoan-20250101-080000-tu-dong.json'));
    assert.ok(list.some((n) => /\.db$/.test(n)));
    r = await srv.ok('POST', '/api/backups/restore', { name: 'ketoan-20250101-080000-tu-dong.json' });
    assert.deepEqual(summarize(r.db), MOC.v1);
    // khôi phục luôn có bản sao lưu .db ngay trước
    assert.match(r.backup, /^ketoan-.*-truoc-khoi-phuc\.db$/);
    assert.equal(readBackupFile(path.join(srv.dataDir, 'backups', r.backup)).entries.length, 66);
  } finally { await srv.stop(); }
});

test('S3.3 file khôi phục hỏng / lạ / phiên bản mới hơn / chứa dữ liệu sai hình dạng → 400, dữ liệu hiện tại không đổi, không sinh bản sao lưu thừa', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const before = await srv.db();
    const good = (await srv.call('GET', '/api/backup')).body;
    const dir = tmpDir();
    const mk = (fn) => { const f = path.join(dir, Math.random().toString(36).slice(2) + '.db'); const d = new DatabaseSync(f); fn(d); d.close(); return fs.readFileSync(f); };
    const bads = {
      'cắt ngang': good.subarray(0, Math.floor(good.length / 2)),
      'chỉ có chữ ký': Buffer.concat([Buffer.from('SQLite format 3\0'), Buffer.alloc(200)]),
      'ghi đè giữa file': (() => { const b = Buffer.from(good); b.fill(0x33, 4096, 4096 * 4); return b; })(),
      'SQLite của chương trình khác': mk((d) => d.exec('CREATE TABLE khach (id INTEGER, ten TEXT); INSERT INTO khach VALUES (1, \'x\')')),
      'phiên bản mới hơn': (() => { const f = path.join(dir, 'moi.db'); fs.writeFileSync(f, good); const d = new DatabaseSync(f); d.exec('PRAGMA user_version = 99'); d.close(); return fs.readFileSync(f); })(),
      'thiếu bảng': (() => { const f = path.join(dir, 'thieu.db'); fs.writeFileSync(f, good); const d = new DatabaseSync(f); d.exec('DROP TABLE "costs"'); d.close(); return fs.readFileSync(f); })(),
      'entries sai hình dạng': (() => { const f = path.join(dir, 'hd.db'); fs.writeFileSync(f, good); const d = new DatabaseSync(f); d.prepare('UPDATE "meta" SET "giaTri" = ? WHERE "khoa" = ?').run('"chuỗi"', 'settings'); d.close(); return fs.readFileSync(f); })(),
      'rác': Buffer.from('xin chào, đây không phải bản sao lưu'),
      'rỗng': Buffer.alloc(0)
    };
    const nBk = fs.readdirSync(path.join(srv.dataDir, 'backups')).length;
    for (const [name, buf] of Object.entries(bads)) {
      const r = await srv.call('POST', '/api/restore', buf);
      assert.equal(r.status, 400, name + ' → ' + r.status + ' ' + r.body.toString().slice(0, 200));
      assert.ok(r.json && r.json.error, name);
    }
    const z = new JSZip();
    z.file('ketoan.db', bads['cắt ngang']);
    assert.equal((await srv.call('POST', '/api/restore-zip', await z.generateAsync({ type: 'nodebuffer' }))).status, 400);
    assert.deepEqual(await srv.db(), before, 'dữ liệu không đổi');
    assert.equal(fs.readdirSync(path.join(srv.dataDir, 'backups')).length, nBk, 'không tạo bản sao lưu thừa');
    assert.ok(!fs.readdirSync(srv.dataDir).some((f) => /dang-khoi-phuc/.test(f)), 'không để lại file tạm');
  } finally { await srv.stop(); }
});

test('S3.4 tiêm SQL: chuỗi SQL ở mọi ô nhập (sổ, danh mục, phiếu nhập, cài đặt, phiếu in, kiểm quỹ) và mọi bộ lọc được lưu / so khớp đúng như chữ, không chạy; bảng còn nguyên sau khi mở lại', async () => {
  const INJ = ["'); DROP TABLE entries; --", "\" OR 1=1 --", "x'; UPDATE meta SET giaTri='0'; --", "1; DELETE FROM costs", "Robert'); DROP TABLE \"suppliers\";--", "%' OR ''='", '\\\'; ATTACH DATABASE \'/tmp/x.db\' AS x; --'];
  const srv = await startServer({ seed: V2 });
  try {
    const d0 = await srv.db();
    const ct = d0.costs[0];
    for (let i = 0; i < INJ.length; i++) {
      const s = INJ[i];
      await srv.ok('POST', '/api/projects', { ma: 'P' + i, ten: s, ghiChu: s, diaChi: s });
      await srv.ok('POST', '/api/suppliers', { ma: 'S' + i, ten: s, sdt: s, ghiChu: s });
      await srv.ok('POST', '/api/entries', { ngay: '2026-09-1' + (i % 9), noiDung: s, nguoiNhan: s, ghiChu: s, soPhieu: 'PC9' + i, maDuAn: 'P' + i, maNCC: 'S' + i, chi: 1000 + i });
      await srv.ok('POST', '/api/cost-slips', { header: { ngay: '2026-09-10', maCT: ct.maCT, maNCC: ct.maNCC, maHM: ct.maHM, ghiChu: s }, lines: [{ dienGiai: s, soLuong: 1, donGia: 10 }] });
      await srv.ok('PUT', '/api/vouchers/' + encodeURIComponent('PC9' + i), { lyDo: s, nguoiNhan: s });
      await srv.ok('POST', '/api/cash-counts', { ngay: '2026-09-20', thucTe: 1, nguoiKiem: s, ghiChu: s });
    }
    await srv.ok('PUT', '/api/settings', Object.assign({}, d0.settings, { tenDonVi: INJ[0], diaChi: INJ[1] }));
    // tìm kiếm / lọc / xuất với chuỗi SQL
    for (const s of INJ) {
      for (const u of ['/api/audit?q=', '/api/export/ledger?q=', '/api/export/cost-ledger?q=', '/api/export/ledger?duAn=', '/api/export/costs?ct=', '/api/export/voucher?so=', '/api/audit?kind=', '/api/audit?action=']) {
        const r = await srv.call('GET', u + encodeURIComponent(s));
        assert.ok(r.status < 500, u + s + ' → ' + r.status);
      }
      const r = await srv.call('POST', '/api/backups/restore', { name: s });
      assert.ok(r.status >= 400 && r.status < 500);
    }
    await srv.stop();
    const again = await startServer({ data: srv.dataDir });
    try {
      const db = await again.db();
      assert.equal(db.entries.length, d0.entries.length + INJ.length);
      assert.equal(db.costs.length, d0.costs.length + INJ.length);
      assert.equal(db.suppliers.length, d0.suppliers.length + INJ.length);
      INJ.forEach((s, i) => {
        assert.equal(db.entries.find((e) => e.soPhieu === 'PC9' + i).noiDung, s);
        assert.equal(db.projects.find((p) => p.ma === 'P' + i).ten, s);
        assert.equal(db.vouchers['PC9' + i].lyDo, s);
      });
      assert.equal(db.settings.tenDonVi, INJ[0]);
      assert.ok(db.nextId > 1);
      // đủ bảng, toàn vẹn
      const c = new DatabaseSync(path.join(again.dataDir, 'ketoan.db'), { readOnly: true });
      const tables = c.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
      assert.equal(c.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      assert.deepEqual(c.prepare('PRAGMA database_list').all().map((r) => r.name).filter((n) => n !== 'main' && n !== 'temp'), [], 'không có cơ sở dữ liệu nào bị gắn thêm');
      c.close();
      TABLE_NAMES.concat(['meta']).forEach((t) => assert.ok(tables.includes(t), 'mất bảng ' + t));
      assert.ok(!fs.existsSync('/tmp/x.db'));
    } finally { await again.stop(); }
  } finally { await srv.stop(); }
});

test('S3.5 path traversal: tên bản sao lưu .db dạng đường dẫn / file ngoài thư mục / liên kết; tải về không lộ ketoan.db qua web', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const before = await srv.db();
    fs.copyFileSync(path.join(srv.dataDir, 'ketoan.db'), path.join(srv.dataDir, 'ngoai.db'));
    try { fs.symlinkSync(path.join(srv.dataDir, 'ngoai.db'), path.join(srv.dataDir, 'backups', 'ketoan-20200101-000000-lien-ket.db')); } catch (e) { /* không tạo được liên kết */ }
    for (const name of ['../ketoan.db', '..\\ketoan.db', 'ketoan-../ketoan.db', 'ketoan-x/../../ngoai.db', '/etc/passwd', 'ketoan-%2e%2e%2fketoan.db', 'ketoan-x.db\u0000.json', 'ketoan-x.db.exe', 'KETOAN-x.db', '....//ketoan.db']) {
      const r = await srv.call('POST', '/api/backups/restore', { name });
      assert.ok(r.status >= 400 && r.status < 500, name + ' → ' + r.status);
    }
    assert.deepEqual(await srv.db(), before);
    for (const u of ['/ketoan.db', '/data/ketoan.db', '/../data/ketoan.db', '/%2e%2e/ketoan.db', '/backups/', '/..%5cketoan.db', '/api/backup/../../ketoan.db']) {
      const r = await srv.call('GET', u);
      assert.ok(!r.body.subarray(0, 16).toString('latin1').startsWith('SQLite format 3'), u + ' lộ file dữ liệu');
    }
  } finally { await srv.stop(); }
});
