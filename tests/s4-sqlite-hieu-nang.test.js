'use strict';
/* S4. Hiệu năng với 20.000 dòng chi phí + 20.000 dòng sổ thu chi: chuyển đổi, mở phần mềm, mở sổ, lọc, báo cáo, lưu phiếu 30 dòng,
 * sửa / xóa / khôi phục / đổi mã lan, sao lưu, xuất / nhập Excel. Thao tác tương tác phải dưới 2 giây.
 * Đặt KETOAN_BAN_GOC=<thư mục mã bản JSON> để đo cả bản JSON gốc trên cùng máy và in bảng so sánh (ghi ra tmp/ketoan-s4-hieu-nang.json). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startServer, makeDataDir, makeBigDb, KT } = require('./helpers');

const OUT = path.join(os.tmpdir(), 'ketoan-s4-hieu-nang.json');
const INTERACTIVE = ['Mở sổ (GET /api/db)', 'Lưu phiếu nhập 30 dòng', 'Sửa 1 dòng sổ', 'Xóa 1 dòng sổ (vào thùng rác)', 'Khôi phục từ thùng rác',
  'Đổi mã NCC (lan sang mọi dòng)', 'Lọc sổ thu chi + tồn quỹ', 'Báo cáo chi phí + công nợ', 'Sao lưu ngay (.db)'];

async function measure(root, seed) {
  const T = {};
  const time = async (name, fn) => { const t = process.hrtime.bigint(); const v = await fn(); T[name] = Math.round(Number(process.hrtime.bigint() - t) / 1e6); return v; };
  const dir = makeDataDir(seed);
  // lần đầu: bản SQLite chuyển đổi từ ketoan.json; bản JSON chỉ mở file
  let srv = await time('Lần chạy đầu (bản mới: gồm chuyển sang SQLite)', () => startServer({ data: dir, root }));
  await srv.stop();
  srv = await time('Mở phần mềm (khởi động + nạp dữ liệu)', () => startServer({ data: dir, root }));
  try {
    const db = await time('Mở sổ (GET /api/db)', async () => (await srv.call('GET', '/api/db')).json.db);
    await time('Lọc sổ thu chi + tồn quỹ', async () => {
      const led = KT.buildLedger(KT.postedDb(db));
      KT.filterLedger(led, { from: '2026-03-01', to: '2026-06-30', q: 'xi mang' });
      return KT.filterLedger(led, {}).tonCuoiKy;
    });
    await time('Báo cáo chi phí + công nợ', async () => { KT.costSummary(db, {}); KT.supplierDebt(db, {}); return KT.projectSummary(db, {}); });
    const c0 = db.costs[0];
    const lines = Array.from({ length: 30 }, (_, k) => ({ dienGiai: 'vật tư ' + k, soLuong: 1 + k / 8, donGia: 10000 + k * 7 }));
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-29', noiDung: 'khởi động bộ đệm', chi: 1 }); // bản sao lưu tự động lần đầu không tính vào phép đo
    await time('Lưu phiếu nhập 30 dòng', () => srv.ok('POST', '/api/cost-slips', { header: { ngay: '2026-09-29', maCT: c0.maCT, maNCC: c0.maNCC, maHM: c0.maHM }, lines }));
    const e0 = db.entries[100];
    await time('Sửa 1 dòng sổ', () => srv.ok('PUT', '/api/entries/' + e0.id, Object.assign({}, e0, { ghiChu: 'đo hiệu năng' })));
    await time('Xóa 1 dòng sổ (vào thùng rác)', () => srv.ok('DELETE', '/api/entries/' + db.entries[200].id));
    const t = (await srv.ok('GET', '/api/trash')).items[0];
    await time('Khôi phục từ thùng rác', () => srv.ok('POST', '/api/trash/' + t.id + '/restore'));
    const s = db.suppliers.find((x) => x.ma === c0.maNCC);
    await time('Đổi mã NCC (lan sang mọi dòng)', () => srv.ok('PUT', '/api/suppliers/' + s.id, Object.assign({}, s, { ma: s.ma + '_MOI' })));
    await time('Sao lưu ngay (.db)', () => srv.ok('POST', '/api/backups/now'));
    const xl = await time('Xuất Excel chi phí công trình', async () => (await srv.call('GET', '/api/export/costs')).body);
    await time('Xuất Excel toàn bộ sổ sách', async () => (await srv.call('GET', '/api/export/full')).body);
    await time('Nhập lại Excel chi phí (gộp, bỏ trùng)', () => srv.ok('POST', '/api/import?mode=merge', xl));
    const after = await srv.db();
    T._soDong = { costs: after.costs.length, entries: after.entries.length };
    T._dungLuong = fs.readdirSync(dir).filter((f) => /^ketoan\.(db|json)$/.test(f)).map((f) => f + ' ' + (fs.statSync(path.join(dir, f)).size / 1e6).toFixed(1) + ' MB').join(', ');
  } finally { await srv.stop(); }
  return T;
}

test('S4 20.000 dòng chi phí + 20.000 dòng sổ: mọi thao tác tương tác dưới 2 giây; so sánh với bản JSON nếu có', { timeout: 900000 }, async () => {
  const seed = makeBigDb(20000, 20000);
  assert.ok(seed.entries.length >= 20000 && seed.costs.length === 20000);
  const res = { sqlite: await measure(undefined, seed) };
  const goc = process.env.KETOAN_BAN_GOC;
  if (goc && fs.existsSync(path.join(goc, 'server.js'))) res.json = await measure(goc, seed);
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  console.log('\n  Thao tác'.padEnd(52) + 'SQLite'.padStart(10) + (res.json ? 'JSON'.padStart(10) : ''));
  Object.keys(res.sqlite).filter((k) => !k.startsWith('_')).forEach((k) => console.log('  ' + k.padEnd(50) + (res.sqlite[k] + ' ms').padStart(10) + (res.json ? (res.json[k] + ' ms').padStart(10) : '')));
  console.log('  ' + res.sqlite._dungLuong + (res.json ? ' | ' + res.json._dungLuong : ''));
  const slow = INTERACTIVE.filter((k) => res.sqlite[k] >= 2000).map((k) => k + ' ' + res.sqlite[k] + ' ms');
  assert.deepEqual(slow, [], 'thao tác chậm');
  assert.ok(res.sqlite['Mở phần mềm (khởi động + nạp dữ liệu)'] < 5000);
});
