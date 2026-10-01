'use strict';
/* S2. Độ bền của kho SQLite: kill -9 lặp lại khi đang ghi (sổ + phiếu nhập), file .db hỏng / cắt ngang / phiên bản mới hơn,
 * ổ đĩa đầy (giả lập SQLITE_FULL), chương trình khác ghi chen / khóa file, ghi đồng thời, khởi động lại nhiều lần. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { startServer, makeDataDir, readStored, orphanErrors, KT } = require('./helpers');
const { Store } = require('../lib/store');
const { SqliteDb } = require('../lib/db');

const V2 = path.join(__dirname, 'fixtures', 'ketoan-v2-hien-tai.json');
const quiet = (fn) => { const w = console.warn; const l = console.log; console.warn = () => {}; console.log = () => {}; try { return fn(); } finally { console.warn = w; console.log = l; } };
// mở đọc-ghi như phần mềm khi khởi động lại (tự hoàn tác giao dịch dở dang nếu còn file -journal), rồi kiểm tra toàn vẹn
const integrity = (dir) => { const d = new SqliteDb(path.join(dir, 'ketoan.db')); try { return d.problem(); } finally { d.close(); } };

// Dữ liệu đã chuyển sang SQLite sẵn (ketoan.db), không còn ketoan.json
function sqliteDir(seed) {
  const dir = makeDataDir(seed || V2);
  quiet(() => new Store(dir)).close();
  return dir;
}

test('S2.1 kill -9 lặp lại giữa lúc ghi dòng sổ và phiếu nhập 30 dòng: file luôn nguyên vẹn, không mất thao tác đã xác nhận, không có phiếu nửa vời', { timeout: 300000 }, async (t) => {
  const dir = sqliteDir();
  const acked = { entries: new Set(), slips: new Map() };
  let hot = 0; // số lần bị giết đúng lúc đang giữa giao dịch (còn file -journal)
  for (let round = 0; round < 10; round++) {
    const srv = await startServer({ data: dir });
    const db0 = await srv.db();
    const ct = db0.costs[0];
    let stop = false;
    const w1 = (async () => {
      for (let i = 0; !stop; i++) {
        try {
          const r = await srv.call('POST', '/api/entries', { ngay: '2026-09-0' + (1 + (i % 9)), noiDung: 'k' + round + '-' + i, chi: 1000 + i });
          if (r.status === 200) acked.entries.add(r.json.id);
        } catch (e) { break; }
      }
    })();
    const w2 = (async () => {
      for (let i = 0; !stop; i++) {
        const lines = Array.from({ length: 30 }, (_, k) => ({ dienGiai: 'dòng ' + k, soLuong: 1 + k / 4, donGia: 1000 + k }));
        try {
          const r = await srv.call('POST', '/api/cost-slips', { header: { ngay: '2026-09-15', maCT: ct.maCT, maNCC: ct.maNCC, maHM: ct.maHM }, lines });
          if (r.status === 200) acked.slips.set(r.json.phieuId, 30);
        } catch (e) { break; }
      }
    })();
    await new Promise((r) => setTimeout(r, 120 + round * 45));
    stop = true;
    srv.child.kill('SIGKILL');
    await new Promise((r) => srv.child.once('exit', r));
    await Promise.all([w1, w2]);
    if (fs.existsSync(path.join(dir, 'ketoan.db-journal'))) hot++;
    assert.equal(integrity(dir), null, 'vòng ' + round + ': file .db phải nguyên vẹn');
    const disk = readStored(dir);
    const ids = new Set(disk.entries.map((e) => e.id));
    acked.entries.forEach((id) => assert.ok(ids.has(id), 'mất dòng đã xác nhận ' + id + ' (vòng ' + round + ')'));
    const bySlip = new Map();
    disk.costs.forEach((c) => bySlip.set(c.phieuId, (bySlip.get(c.phieuId) || 0) + 1));
    acked.slips.forEach((n, pid) => assert.equal(bySlip.get(pid), n, 'phiếu ' + pid + ' phải đủ 30 dòng'));
    bySlip.forEach((n, pid) => { if (!db0.costs.some((c) => c.phieuId === pid)) assert.equal(n, 30, 'phiếu nửa vời ' + pid + ': ' + n + ' dòng'); });
  }
  const srv = await startServer({ data: dir });
  try {
    const db = await srv.db();
    assert.deepEqual(orphanErrors(db), []);
    assert.equal(new Set(db.entries.map((e) => e.id)).size, db.entries.length);
    assert.equal(new Set(db.costs.map((e) => e.id)).size, db.costs.length);
    t.diagnostic('bị giết giữa giao dịch ' + hot + '/10 vòng; đã xác nhận ' + acked.entries.size + ' dòng sổ, ' + acked.slips.size + ' phiếu 30 dòng');
    assert.ok(acked.entries.size > 20 && acked.slips.size > 5, 'đã ghi đủ nhiều: ' + acked.entries.size + ' dòng, ' + acked.slips.size + ' phiếu');
  } finally { await srv.stop(); }
});

test('S2.2 file ketoan.db hỏng (rác / cắt ngang / ghi đè giữa file): tự lấy bản sao lưu .db gần nhất, giữ file hỏng; không có bản sao lưu thì dừng và không xóa gì', async () => {
  const cases = {
    rac: (f) => fs.writeFileSync(f, Buffer.alloc(8192, 0x41)),
    catNgang: (f) => { const b = fs.readFileSync(f); fs.writeFileSync(f, b.subarray(0, Math.floor(b.length / 3))); },
    ghiDeGiua: (f) => { const fd = fs.openSync(f, 'r+'); fs.writeSync(fd, Buffer.alloc(4096 * 3, 0x5a), 0, 4096 * 3, 4096); fs.closeSync(fd); },
    rong: (f) => fs.writeFileSync(f, '')
  };
  for (const [name, breakIt] of Object.entries(cases)) {
    const dir = sqliteDir();
    let srv = await startServer({ data: dir });
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-30', noiDung: 'trước khi hỏng', chi: 1 }); // tạo bản sao lưu tự động .db
    await srv.ok('POST', '/api/backups/now');
    await srv.stop();
    breakIt(path.join(dir, 'ketoan.db'));
    const broken = fs.readFileSync(path.join(dir, 'ketoan.db'));
    srv = await startServer({ data: dir });
    try {
      assert.ok(!srv.exited, name + ': ' + srv.log);
      const db = await srv.db();
      assert.ok(db.entries.some((e) => e.noiDung === 'trước khi hỏng'), name + ': lấy được bản sao lưu mới nhất');
      assert.match(srv.log, /hỏng/);
      const kept = fs.readdirSync(dir).find((f) => /^ketoan\.db\.hong-/.test(f) && !/journal/.test(f));
      assert.ok(kept, name + ': giữ file hỏng');
      assert.ok(fs.readFileSync(path.join(dir, kept)).equals(broken), name + ': file hỏng còn nguyên');
      assert.equal(integrity(dir), null);
    } finally { await srv.stop(); }
  }
  // không có bản sao lưu nào
  const dir = sqliteDir();
  fs.readdirSync(path.join(dir, 'backups')).forEach((f) => fs.unlinkSync(path.join(dir, 'backups', f)));
  fs.writeFileSync(path.join(dir, 'ketoan.db'), Buffer.alloc(5000, 0x42));
  const srv = await startServer({ data: dir });
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(srv.exited || srv.child.exitCode !== null, 'phải dừng');
  assert.match(srv.log, /bị hỏng/);
  assert.ok(fs.readFileSync(path.join(dir, 'ketoan.db')).equals(Buffer.alloc(5000, 0x42)), 'không được xóa / ghi đè file hỏng');
});

test('S2.3 file .db của phiên bản phần mềm mới hơn: từ chối, không đụng tới file, không "khôi phục" đè lên', async () => {
  const dir = sqliteDir();
  const f = path.join(dir, 'ketoan.db');
  const c = new DatabaseSync(f);
  c.exec('PRAGMA user_version = 9');
  c.close();
  const before = fs.readFileSync(f);
  const srv = await startServer({ data: dir });
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(srv.exited || srv.child.exitCode !== null);
  assert.match(srv.log, /phiên bản phần mềm mới hơn/);
  assert.ok(fs.readFileSync(f).equals(before));
  assert.ok(!fs.readdirSync(dir).some((x) => /hong/.test(x)));
});

test('S2.4 ổ đĩa đầy (giả lập SQLITE_FULL): thao tác báo lỗi rõ, không ghi nửa vời, dữ liệu đang có giữ nguyên; giải phóng chỗ thì ghi tiếp được', async () => {
  const dir = sqliteDir();
  const pages = fs.statSync(path.join(dir, 'ketoan.db')).size / 4096;
  let srv = await startServer({ data: dir, env: { KETOAN_THU_MAX_PAGE: String(Math.ceil(pages) + 3) } });
  let failed = null;
  let okCount = 0;
  try {
    const db0 = await srv.db();
    const ct = db0.costs[0];
    for (let i = 0; i < 200 && !failed; i++) {
      const lines = Array.from({ length: 30 }, (_, k) => ({ dienGiai: 'dòng dài '.repeat(20) + k, soLuong: 1, donGia: 1000 + k }));
      const r = await srv.call('POST', '/api/cost-slips', { header: { ngay: '2026-09-15', maCT: ct.maCT, maNCC: ct.maNCC, maHM: ct.maHM }, lines });
      if (r.status === 200) okCount++; else failed = r;
    }
    assert.ok(failed, 'phải gặp lỗi đầy ổ đĩa');
    assert.equal(failed.status, 500);
    assert.match(failed.json.error, /Không lưu được dữ liệu/);
    assert.match(failed.json.error, /CHƯA được ghi/);
    // bộ nhớ = đĩa, mọi phiếu đủ 30 dòng
    const mem = await srv.db();
    const disk = readStored(dir);
    assert.deepEqual(disk.costs.map((c) => c.id), mem.costs.map((c) => c.id));
    assert.equal(mem.costs.length, db0.costs.length + okCount * 30);
    // vẫn đọc / xuất báo cáo được
    assert.equal((await srv.call('GET', '/api/export/ledger')).status, 200);
  } finally { await srv.stop(); }
  assert.equal(integrity(dir), null);
  srv = await startServer({ data: dir });
  try {
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-30', noiDung: 'sau khi có chỗ trống', chi: 1 });
    assert.ok(readStored(dir).entries.some((e) => e.noiDung === 'sau khi có chỗ trống'));
  } finally { await srv.stop(); }
});

test('S2.5 chương trình khác ghi vào ketoan.db trong lúc phần mềm chạy: lần lưu kế tiếp bị chặn (409), màn hình nạp lại dữ liệu mới, không ghi đè', async () => {
  const dir = sqliteDir();
  const srv = await startServer({ data: dir });
  try {
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-30', noiDung: 'của phần mềm', chi: 1 });
    // công cụ khác sửa trực tiếp một dòng (tham số hóa)
    const c = new DatabaseSync(path.join(dir, 'ketoan.db'));
    c.prepare('UPDATE "entries" SET "noiDung" = ? WHERE "id" = ?').run('sửa từ ngoài', (await srv.db()).entries[0].id);
    c.close();
    const r = await srv.call('POST', '/api/entries', { ngay: '2026-09-30', noiDung: 'bị chặn', chi: 2 });
    assert.equal(r.status, 409);
    assert.match(r.json.error, /chương trình khác/);
    const db = await srv.db();
    assert.equal(db.entries[0].noiDung, 'sửa từ ngoài', 'đã nạp lại dữ liệu mới nhất');
    assert.ok(!db.entries.some((e) => e.noiDung === 'bị chặn'));
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-30', noiDung: 'làm lại thì được', chi: 3 });
    const disk = readStored(dir);
    assert.equal(disk.entries[0].noiDung, 'sửa từ ngoài');
    assert.ok(disk.entries.some((e) => e.noiDung === 'làm lại thì được'));
  } finally { await srv.stop(); }
});

test('S2.6 file bị khóa (chương trình khác giữ khóa ghi): chờ tối đa 5 giây rồi báo lỗi rõ, dữ liệu không đổi; hết khóa thì ghi và sao lưu bình thường', { timeout: 60000 }, async () => {
  const dir = sqliteDir();
  const srv = await startServer({ data: dir });
  try {
    const n0 = (await srv.db()).entries.length;
    // khóa ngắn (1 giây): phần mềm chờ rồi ghi được
    const lockHolder = (ms) => {
      const { spawn } = require('child_process');
      const code = "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1]);d.exec('BEGIN EXCLUSIVE');console.log('KHOA');setTimeout(()=>{d.exec('COMMIT');d.close();},Number(process.argv[2]));";
      const ch = spawn(process.execPath, ['-e', code, path.join(dir, 'ketoan.db'), String(ms)], { stdio: ['ignore', 'pipe', 'ignore'] });
      ch.done = new Promise((r) => ch.once('exit', r));
      return new Promise((r) => ch.stdout.once('data', () => r(ch)));
    };
    let ch = await lockHolder(1000);
    const t0 = Date.now();
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-30', noiDung: 'chờ khóa ngắn', chi: 1 });
    assert.ok(Date.now() - t0 >= 500, 'phải chờ khóa');
    await ch.done;
    // khóa dài (15 giây): báo lỗi sau khoảng 5 giây, bộ nhớ trở về trạng thái đã lưu (không cần đọc file đang bị khóa)
    ch = await lockHolder(15000);
    const t1 = Date.now();
    const r = await srv.call('POST', '/api/entries', { ngay: '2026-09-30', noiDung: 'bị khóa', chi: 2 });
    assert.equal(r.status, 500);
    assert.ok(Date.now() - t1 < 12000, 'không treo quá lâu: ' + (Date.now() - t1) + ' ms');
    assert.ok(!(await srv.db()).entries.some((e) => e.noiDung === 'bị khóa'), 'thay đổi chưa lưu không còn trong bộ nhớ');
    assert.match(r.json.error, /Không lưu được dữ liệu/);
    assert.equal((await srv.db()).entries.length, n0 + 1);
    await ch.done;
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-30', noiDung: 'hết khóa', chi: 3 });
    await srv.ok('POST', '/api/backups/now');
    assert.equal(readStored(dir).entries.length, n0 + 2);
  } finally { await srv.stop(); }
});

test('S2.7 ghi đồng thời 300 yêu cầu (dòng sổ, phiếu nhập, danh mục, xóa): không mất, không trùng id/seq, đĩa = bộ nhớ', async () => {
  const dir = sqliteDir();
  const srv = await startServer({ data: dir });
  try {
    const db0 = await srv.db();
    const ct = db0.costs[0];
    const jobs = [];
    for (let i = 0; i < 300; i++) {
      if (i % 3 === 0) jobs.push(srv.call('POST', '/api/entries', { ngay: '2026-09-' + String(1 + (i % 28)).padStart(2, '0'), noiDung: 'song song ' + i, thu: i }));
      else if (i % 3 === 1) jobs.push(srv.call('POST', '/api/cost-slips', { header: { ngay: '2026-09-10', maCT: ct.maCT, maNCC: ct.maNCC, maHM: ct.maHM }, lines: [{ dienGiai: 'x' + i, soLuong: 2, donGia: i + 1 }, { dienGiai: 'y' + i, soLuong: 0.5, donGia: 2 * i + 2 }] }));
      else jobs.push(srv.call('POST', '/api/suppliers', { ma: 'SS' + i, ten: 'NCC song song ' + i }));
    }
    const rs = await Promise.all(jobs);
    assert.ok(rs.every((r) => r.status === 200), rs.filter((r) => r.status !== 200).map((r) => r.status + ' ' + r.body).slice(0, 2).join(' | '));
    const db = await srv.db();
    assert.equal(db.entries.length, db0.entries.length + 100);
    assert.equal(db.costs.length, db0.costs.length + 200);
    assert.equal(db.suppliers.length, db0.suppliers.length + 100);
    const all = ['projects', 'suppliers', 'entries', 'costGroups', 'costItems', 'materials', 'houses', 'costs'].flatMap((k) => db[k].map((x) => x.id));
    assert.equal(new Set(all).size, all.length, 'id không trùng');
    assert.equal(new Set(db.entries.map((e) => e.seq)).size, db.entries.length);
    // (các dòng của cùng một phiếu nhập dùng chung số thứ tự seq — hành vi sẵn có của bản JSON, không thuộc phạm vi đổi lưu trữ)
    const disk = readStored(dir);
    ['entries', 'costs', 'suppliers'].forEach((k) => assert.deepEqual(disk[k], db[k], k));
    assert.equal(disk.nextId, db.nextId);
  } finally { await srv.stop(); }
});

test('S2.8 khởi động lại 15 lần xen kẽ ghi / xóa / khôi phục: số liệu luôn khớp bản tính độc lập, file luôn nguyên vẹn', { timeout: 300000 }, async () => {
  const dir = sqliteDir();
  let expectTon = null;
  for (let i = 0; i < 15; i++) {
    const srv = await startServer({ data: dir });
    try {
      const db = await srv.db();
      const ton = KT.filterLedger(KT.buildLedger(KT.postedDb(db)), {}).tonCuoiKy;
      if (expectTon !== null) assert.equal(ton, expectTon, 'lần ' + i);
      const id = (await srv.ok('POST', '/api/entries', { ngay: '2026-09-2' + (i % 9), noiDung: 'lần ' + i, thu: 1000 * (i + 1) })).id;
      if (i % 3 === 1) await srv.ok('DELETE', '/api/entries/' + id);
      if (i % 3 === 2) { const t = (await srv.ok('GET', '/api/trash')).items[0]; await srv.ok('POST', '/api/trash/' + t.id + '/restore'); }
      const after = await srv.db();
      expectTon = KT.filterLedger(KT.buildLedger(KT.postedDb(after)), {}).tonCuoiKy;
    } finally { await srv.stop(); }
    assert.equal(integrity(dir), null);
  }
});
