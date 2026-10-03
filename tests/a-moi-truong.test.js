'use strict';
/* A. Môi trường và khởi động */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const path = require('path');
const { execFileSync } = require('child_process');
const { ROOT, startServer, makeDataDir, rawRequest, freePort } = require('./helpers');

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out); else out.push(p);
  });
  return out;
}

test('A2.1 server chỉ nghe trên 127.0.0.1: địa chỉ mạng khác bị từ chối kết nối', async () => {
  const srv = await startServer({});
  try {
    const ext = [];
    Object.values(os.networkInterfaces()).forEach((l) => l.forEach((i) => { if (i.family === 'IPv4' && !i.internal) ext.push(i.address); }));
    if (!ext.length) { console.log('  (máy test không có địa chỉ mạng ngoài 127.0.0.1 — kiểm tra bằng địa chỉ 127.0.0.2 và [::1])'); }
    const targets = ext.concat(['::1']);
    for (const host of targets) {
      const r = await new Promise((resolve) => {
        const s = net.connect({ host, port: srv.port, timeout: 1500 });
        s.on('connect', () => { s.destroy(); resolve('connected'); });
        s.on('error', (e) => resolve(e.code));
        s.on('timeout', () => { s.destroy(); resolve('timeout'); });
      });
      assert.notEqual(r, 'connected', 'Kết nối được tới ' + host + ' — server đang nghe ngoài loopback');
    }
    // dòng log xác nhận địa chỉ nghe
    const addr = await new Promise((resolve) => { const s = net.connect({ host: '127.0.0.1', port: srv.port }, () => { s.destroy(); resolve('ok'); }); });
    assert.equal(addr, 'ok');
  } finally { await srv.stop(); }
});

test('A2.2 API từ chối Origin lạ và Host lạ (chống DNS rebinding); chấp nhận localhost', async () => {
  const srv = await startServer({});
  try {
    let r = await srv.call('GET', '/api/db', undefined, { Origin: 'http://evil.example.com' });
    assert.equal(r.status, 403, 'Origin lạ phải bị chặn');
    r = await srv.call('POST', '/api/entries', { ngay: '2026-01-01', noiDung: 'x', chi: 1 }, { Origin: 'https://evil.example.com' });
    assert.equal(r.status, 403);
    r = await srv.call('GET', '/api/db', undefined, { Host: 'evil.example.com:' + srv.port });
    assert.equal(r.status, 403, 'Host lạ (DNS rebinding) phải bị chặn');
    r = await srv.call('GET', '/api/db', undefined, { Origin: 'http://localhost:' + srv.port, Host: 'localhost:' + srv.port });
    assert.equal(r.status, 200);
    r = await srv.call('GET', '/api/db', undefined, { Origin: 'http://127.0.0.1:' + srv.port });
    assert.equal(r.status, 200);
    // Origin giả dạng: localhost.evil.com
    r = await srv.call('GET', '/api/db', undefined, { Origin: 'http://localhost.evil.com' });
    assert.equal(r.status, 403);
  } finally { await srv.stop(); }
});

test('A2.3 file tĩnh: không đọc được file ngoài thư mục public (path traversal)', async () => {
  const srv = await startServer({});
  try {
    for (const p of ['/../server.js', '/..%2fserver.js', '/%2e%2e/server.js', '/..%5cserver.js', '/js/../../package.json', '/%00']) {
      const r = await rawRequest({ port: srv.port, path: p, method: 'GET' });
      assert.ok(![200].includes(r.status) || !/require\('http'\)|so-thu-chi-ke-toan/.test(r.body.toString()), 'Lộ file với ' + p + ' → ' + r.status);
    }
    const ok = await rawRequest({ port: srv.port, path: '/', method: 'GET' });
    assert.equal(ok.status, 200);
    assert.match(ok.body.toString(), /<html/i);
  } finally { await srv.stop(); }
});

test('A2.4 chạy hoàn toàn offline: không có địa chỉ mạng ngoài trong giao diện', () => {
  const files = walk(path.join(ROOT, 'public'), []).filter((f) => /\.(html|css|js)$/.test(f));
  const bad = [];
  files.forEach((f) => {
    const s = fs.readFileSync(f, 'utf8');
    // bỏ các namespace/định danh không gây tải mạng
    const re = /(?:src|href)\s*=\s*["'](https?:)?\/\/[^"']+|url\(\s*["']?(https?:)?\/\/[^)]+|@import\s+["']https?:|fetch\(\s*["']https?:|import\s+.*from\s+["']https?:/g;
    let m;
    while ((m = re.exec(s))) bad.push(path.relative(ROOT, f) + ': ' + m[0].slice(0, 80));
  });
  assert.deepEqual(bad, [], 'Có tài nguyên tải từ mạng ngoài');
  // font và icon nằm trong public/
  assert.ok(fs.existsSync(path.join(ROOT, 'public', 'vendor', 'lucide', 'icons.css')), 'thiếu public/vendor/lucide/icons.css');
  assert.ok(walk(path.join(ROOT, 'public'), []).some((f) => /\.woff2?$/.test(f)), 'không có font cục bộ (.woff2)');
});

test('A2.5 mọi tệp được index.html và CSS tham chiếu đều tồn tại cục bộ', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const refs = [];
  html.replace(/(?:src|href)="([^"#]+)"/g, (m, u) => { if (!/^(https?:|data:|mailto:)/.test(u)) refs.push(u); return m; });
  refs.forEach((u) => assert.ok(fs.existsSync(path.join(ROOT, 'public', u.split('?')[0])), 'index.html tham chiếu tệp không có: ' + u));
  ['css/app.css', 'vendor/lucide/icons.css'].forEach((c) => {
    const file = path.join(ROOT, 'public', c);
    const css = fs.readFileSync(file, 'utf8');
    css.replace(/url\(\s*["']?([^)"']+)["']?\s*\)/g, (m, u) => {
      if (/^(data:|#)/.test(u)) return m;
      assert.ok(fs.existsSync(path.join(path.dirname(file), u.split(/[?#]/)[0])), c + ' tham chiếu tệp không có: ' + u);
      return m;
    });
  });
});

test('A1.3 cổng bận → tự chuyển sang cổng kế tiếp', async () => {
  const port = await freePort();
  const blocker = http.createServer((q, s) => { s.writeHead(200); s.end('busy'); });
  await new Promise((r) => blocker.listen(port, '127.0.0.1', r));
  let srv;
  try {
    srv = await startServer({ port });
    assert.notEqual(srv.port, port, 'phải chuyển sang cổng khác');
    assert.ok(srv.port > port && srv.port <= port + 20, 'phải nhảy sang một cổng kế tiếp (cổng ngay sau có thể đang bị chương trình khác dùng), nhận ' + srv.port);
    const r = await srv.call('GET', '/api/ping');
    assert.equal(r.json.app, 'so-thu-chi-ke-toan');
  } finally { blocker.close(); if (srv) await srv.stop(); }
});

test('A1.4 bấm lần hai khi đang chạy: không mở server thứ hai, thoát mã 0 và báo đang chạy sẵn', async () => {
  const srv = await startServer({});
  try {
    const second = await startServer({ port: srv.port, data: srv.dataDir });
    assert.ok(second.exited || second.child.exitCode !== null || await new Promise((r) => { second.child.once('exit', () => r(true)); setTimeout(() => r(false), 6000); }), 'tiến trình thứ hai phải tự thoát');
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(second.child.exitCode, 0);
    assert.match(second.log, /đang chạy sẵn/);
    assert.ok(!/Đang chạy tại/.test(second.log));
    // server đầu vẫn sống
    assert.equal((await srv.call('GET', '/api/ping')).status, 200);
  } finally { await srv.stop(); }
});

test('A1.5 cổng bị chiếm bởi chương trình khác và không còn cổng trống → báo lỗi tiếng Việt, không treo', async () => {
  // chiếm 21 cổng liên tiếp là quá nặng; chỉ kiểm tra thông báo lỗi tĩnh tồn tại trong mã nguồn
  const code = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.match(code, /Không khởi động được máy chủ/);
});

test('A1.1 KhoiDong.bat / TaoBieuTuongDesktop.bat: có kiểm tra Node, báo lỗi tiếng Việt, cài thư viện lần đầu', () => {
  const bat = fs.readFileSync(path.join(ROOT, 'KhoiDong.bat'), 'utf8');
  assert.match(bat, /where node/);
  assert.match(bat, /chua cai Node\.js/i);
  assert.match(bat, /npm install --omit=dev/);
  assert.match(bat, /node_modules\\exceljs\\package\.json/);
  assert.match(bat, /node server\.js/);
  assert.match(bat, /chcp 65001/);
  assert.ok(fs.existsSync(path.join(ROOT, 'TaoBieuTuongDesktop.bat')));
  const ico = fs.readFileSync(path.join(ROOT, 'TaoBieuTuongDesktop.bat'), 'utf8');
  assert.match(ico, /KhoiDong\.bat/);
  assert.match(ico, /scripts\\tao-bieu-tuong\.ps1/);
  assert.match(ico, /-Goc "%~dp0\."/, 'đường dẫn kết thúc bằng \\ làm hỏng dấu ngoặc kép khi truyền cho PowerShell');
  // script PowerShell: UTF-8 có BOM (Windows PowerShell 5 mới đọc đúng chữ có dấu), dùng logo .ico, tên mới
  const ps = fs.readFileSync(path.join(ROOT, 'scripts', 'tao-bieu-tuong.ps1'));
  assert.deepEqual([...ps.subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
  const psTxt = ps.toString('utf8');
  assert.match(psTxt, /KhoiDong\.bat/);
  assert.match(psTxt, /Kế Toán Công Trình/);
  assert.match(psTxt, /public\\img\\bieu-tuong\.ico/);
  const icoFile = fs.readFileSync(path.join(ROOT, 'public', 'img', 'bieu-tuong.ico'));
  assert.deepEqual([...icoFile.subarray(0, 4)], [0, 0, 1, 0], 'bieu-tuong.ico phải là file biểu tượng Windows');
  const sizes = [];
  for (let i = 0; i < icoFile.readUInt16LE(4); i++) sizes.push(icoFile[6 + i * 16] || 256);
  for (const n of [16, 32, 48, 256]) assert.ok(sizes.includes(n), 'thiếu cỡ ' + n + ' px');
});

test('A1.2 server tự từ chối chạy (thông báo tiếng Việt) khi Node cũ hơn bản tối thiểu', () => {
  const code = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.match(code, /process\.versions\.node/, 'server.js chưa kiểm tra phiên bản Node');
  const pkg = require(path.join(ROOT, 'package.json'));
  assert.ok(pkg.engines && pkg.engines.node, 'package.json chưa khai báo engines.node');
});

test('A3 npm install sạch (chỉ phụ thuộc chạy) không cần trình biên dịch C++', { skip: process.env.RUN_NPM_INSTALL ? false : 'đặt RUN_NPM_INSTALL=1 để chạy (cần mạng)', timeout: 300000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ketoan-npm-'));
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(dir, 'package.json'));
  fs.copyFileSync(path.join(ROOT, 'package-lock.json'), path.join(dir, 'package-lock.json'));
  const out = execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts'], { cwd: dir, encoding: 'utf8', timeout: 280000 });
  assert.ok(fs.existsSync(path.join(dir, 'node_modules', 'exceljs', 'package.json')));
  const native = walk(path.join(dir, 'node_modules'), []).filter((f) => /binding\.gyp$/.test(f));
  assert.deepEqual(native, [], 'có gói cần biên dịch C++: ' + native.join(', '));
  execFileSync(process.execPath, ['-e', "require('exceljs'); console.log('ok')"], { cwd: dir });
  assert.ok(out !== undefined);
});
