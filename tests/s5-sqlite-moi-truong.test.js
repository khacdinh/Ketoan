'use strict';
/* S5. Môi trường cho bản SQLite: quy tắc phiên bản Node (≥ 24.16.0 hoặc ≥ 26.1.0), server và KhoiDong.bat từ chối Node cũ bằng tiếng Việt,
 * không dùng thư viện biên dịch C++, chuỗi có ký tự NUL không bị cắt kể cả trên Node có lỗi node:sqlite. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { ROOT, makeDataDir, tmpDir } = require('./helpers');
const { nodeOk } = require('../lib/node-version');

test('S5.1 quy tắc phiên bản Node', () => {
  const ok = ['24.16.0', '24.16.1', '24.20.3', '26.1.0', '26.4.2', '27.0.0', 'v24.16.0'];
  const bad = ['18.20.0', '20.19.0', '22.22.2', '24.0.0', '24.15.9', '25.0.0', '25.9.1', '26.0.0', '26.0.9', '', 'abc'];
  ok.forEach((v) => assert.equal(nodeOk(v), true, v));
  bad.forEach((v) => assert.equal(nodeOk(v), false, v));
});

test('S5.2 server từ chối Node không đạt yêu cầu bằng thông báo tiếng Việt (bỏ qua chỉ khi đặt KETOAN_CHO_NODE_CU=1)', { skip: nodeOk(process.versions.node) ? 'máy kiểm thử đang dùng Node đạt yêu cầu' : false }, () => {
  const env = Object.assign({}, process.env, { KETOAN_DATA: makeDataDir(), NO_OPEN: '1', PORT: '0' });
  delete env.KETOAN_CHO_NODE_CU;
  const r = spawnSync(process.execPath, [path.join(ROOT, 'server.js'), '--no-open'], { env, encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /không dùng được/);
  assert.match(r.stderr, /24\.16\.0/);
  assert.match(r.stderr, /nodejs\.org/);
  assert.ok(!fs.existsSync(path.join(env.KETOAN_DATA, 'ketoan.db')), 'không đụng tới dữ liệu');
});

test('S5.3 KhoiDong.bat kiểm tra đúng quy tắc phiên bản và hướng dẫn tải Node; package.json khai báo engines; không có thư viện C++ cho SQLite', () => {
  const bat = fs.readFileSync(path.join(ROOT, 'KhoiDong.bat'), 'utf8');
  assert.match(bat, /require\('\.\/lib\/node-version'\)\.nodeOk/);
  assert.match(bat, /24\.16\.0/);
  assert.match(bat, /26\.1\.0/);
  assert.match(bat, /https:\/\/nodejs\.org/);
  const pkg = require(path.join(ROOT, 'package.json'));
  assert.equal(pkg.engines.node, '>=24.16.0 <25 || >=26.1.0');
  const deps = Object.keys(Object.assign({}, pkg.dependencies, pkg.optionalDependencies));
  assert.deepEqual(deps.filter((d) => /sqlite|better-sqlite|sql\.js/.test(d)), [], 'chỉ dùng node:sqlite có sẵn');
  // lib/node-version.js viết kiểu cũ để chạy được cả trên Node rất cũ (báo lỗi rõ thay vì lỗi cú pháp)
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'node-version.js'), 'utf8');
  assert.ok(!/=>|\bconst\b|\blet\b|`/.test(src));
});

test('S5.4 ký tự NUL và chuỗi rất dài qua SQLite: đọc lại đủ ký tự (không phụ thuộc lỗi node:sqlite trên Node cũ)', () => {
  const { SqliteDb } = require('../lib/db');
  const f = path.join(tmpDir(), 'nul.db');
  const d = new SqliteDb(f, { create: true });
  d.createSchema();
  const long = 'Đ'.repeat(200000) + '\u0000' + 'x'.repeat(10);
  const db = { settings: { tenDonVi: 'A\u0000B' }, entries: [{ id: 1, seq: 1, ngay: '2026-09-01', noiDung: 'trước\u0000sau', ghiChu: long, thu: 0, chi: 1 }], nextId: 2 };
  d.tx(() => d.writeDiff(db, null));
  d.close();
  const d2 = new SqliteDb(f, { readOnly: true });
  const back = d2.readAll().db;
  d2.close();
  assert.equal(back.entries[0].noiDung, 'trước\u0000sau');
  assert.equal(back.entries[0].ghiChu, long);
  assert.equal(back.settings.tenDonVi, 'A\u0000B');
});
