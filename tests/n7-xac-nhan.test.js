'use strict';
/* N7. Xác nhận cuối nhóm 1: nâng cấp thẳng từ dữ liệu gốc (schema 1), khôi phục bản sao lưu "trước nâng cấp",
 * dữ liệu lớn 20.000 dòng: nhật ký + xóa mềm không làm chậm đáng kể. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startServer, makeDataDir, makeBigDb, readJsonFile, orphanErrors } = require('./helpers');
const { summarize, FILE: MOC } = require('./so-lieu-moc');
const { SCHEMA_VERSION } = require('../lib/store');

const FIX = path.join(__dirname, 'fixtures');

test('N7.1 dữ liệu gốc schema 1 nâng thẳng lên schema mới; khôi phục bản sao lưu "trước nâng cấp" cho lại đúng số liệu; nhật ký giữ đủ', async () => {
  const dir = makeDataDir(path.join(FIX, 'ketoan-v1-goc.json'));
  const srv = await startServer({ data: dir });
  try {
    const moc = readJsonFile(MOC).v1;
    const db = await srv.db();
    assert.equal(db.schema, SCHEMA_VERSION);
    assert.deepEqual(summarize(db), moc);
    // làm vài việc với tính năng mới
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-30', noiDung: 'sau nâng cấp', chi: 1000 });
    await srv.ok('POST', '/api/locks', { months: ['2026-08'] });
    // khôi phục bản sao lưu trước nâng cấp (file .json schema 1, tạo lúc chuyển sang SQLite) → được nâng cấp lại, số liệu như mốc, khóa sổ của bản cũ không có
    const name = (await srv.ok('GET', '/api/backups')).backups.find((b) => /truoc-khi-chuyen-sqlite/.test(b.name)).name;
    const r = await srv.ok('POST', '/api/backups/restore', { name });
    assert.equal(r.db.schema, SCHEMA_VERSION);
    assert.deepEqual(summarize(r.db), moc);
    assert.deepEqual(r.db.locks, []);
    assert.deepEqual(orphanErrors(r.db), []);
    const items = (await srv.ok('GET', '/api/audit')).items;
    assert.deepEqual(items.map((a) => a.action), ['khoi-phuc-sao-luu', 'khoa-so', 'them', 'khoi-tao']);
  } finally { await srv.stop(); }
  assert.equal(fs.readdirSync(path.join(dir, 'backups')).filter((f) => /truoc-khi-chuyen-sqlite/.test(f)).length, 1);
});

test('N7.2 hiệu năng 20.000 dòng chi phí + 5.000 dòng sổ: ghi / sửa / xóa mềm / khôi phục có nhật ký vẫn nhanh; nhật ký 1.000 mục lọc nhanh', { timeout: 300000 }, async () => {
  const srv = await startServer({ seed: makeBigDb(20000, 5000) });
  try {
    const db = await srv.db();
    const c0 = db.costs[0];
    const time = async (fn) => { const t = Date.now(); await fn(); return Date.now() - t; };
    const T = {};
    T.post = await time(() => srv.ok('POST', '/api/cost-slips', { header: { ngay: '2026-09-29', maCT: c0.maCT, maNCC: c0.maNCC, maHM: c0.maHM }, lines: [{ dienGiai: 'đo', soLuong: 1, donGia: 1 }] }));
    T.put = await time(() => srv.ok('PUT', '/api/costs/' + c0.id, Object.assign({}, c0, { soLuong: c0.soLuong + 1 })));
    T.del = await time(() => srv.ok('DELETE', '/api/cost-slips/' + db.costs[100].phieuId));
    const t = (await srv.ok('GET', '/api/trash')).items[0];
    T.restore = await time(() => srv.ok('POST', '/api/trash/' + t.id + '/restore'));
    for (let i = 0; i < 200; i++) await srv.ok('POST', '/api/entries', { ngay: '2026-09-29', noiDung: 'n' + i, chi: i + 1 });
    T.audit = await time(() => srv.ok('GET', '/api/audit?q=n19'));
    // 60 thao tác xóa mềm liên tiếp rồi mở lại phần mềm
    for (let i = 0; i < 60; i++) await srv.ok('DELETE', '/api/costs/' + db.costs[1000 + i].id);
    T.trashList = await time(() => srv.ok('GET', '/api/trash'));
    fs.writeFileSync(path.join(require('os').tmpdir(), 'ketoan-n7-hieu-nang.json'), JSON.stringify(T));
    Object.entries(T).forEach(([k, ms]) => assert.ok(ms < 2000, k + ' mất ' + ms + ' ms'));
    const size = fs.statSync(path.join(srv.dataDir, 'nhat-ky.jsonl')).size;
    assert.ok(size < 5e6, 'nhật ký ' + size + ' byte');
  } finally { await srv.stop(); }
});
