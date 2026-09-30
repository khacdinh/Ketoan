'use strict';
/* Tiện ích dùng chung cho các bài kiểm thử: chạy server thật trên cổng ngẫu nhiên với thư mục dữ liệu tạm. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DATA_SRC = path.join(ROOT, 'data', 'ketoan.json');
const KT = require(path.join(ROOT, 'public', 'js', 'shared.js'));

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix || 'ketoan-test-'));
}

// Tạo thư mục dữ liệu tạm; seed = đường dẫn file JSON (hoặc object) để chép vào, không có thì để trống
function makeDataDir(seed) {
  const dir = tmpDir();
  if (seed) {
    const obj = typeof seed === 'string' ? fs.readFileSync(seed, 'utf8') : JSON.stringify(seed);
    fs.writeFileSync(path.join(dir, 'ketoan.json'), obj);
  }
  return dir;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on('error', reject);
  });
}

function rawRequest(opts, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(Object.assign({ host: '127.0.0.1' }, opts), (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

class TestServer {
  constructor(dataDir, port, child) {
    this.dataDir = dataDir; this.port = port; this.child = child; this.log = '';
    child.stdout.on('data', (d) => { this.log += d; });
    child.stderr.on('data', (d) => { this.log += d; });
  }
  get base() { return 'http://127.0.0.1:' + this.port; }
  // Gọi API, trả { status, json, body, headers }
  async call(method, url, body, headers) {
    const isBuf = Buffer.isBuffer(body);
    const payload = body === undefined ? null : isBuf ? body : Buffer.from(JSON.stringify(body));
    const r = await rawRequest({ port: this.port, method, path: url, headers: Object.assign(
      payload ? { 'Content-Type': isBuf ? 'application/octet-stream' : 'application/json', 'Content-Length': payload.length } : {}, headers || {}) }, payload);
    let json = null;
    if ((r.headers['content-type'] || '').includes('json')) { try { json = JSON.parse(r.body.toString('utf8')); } catch (e) { /* để null */ } }
    return { status: r.status, json, body: r.body, headers: r.headers };
  }
  // Gọi và yêu cầu thành công (HTTP 200 + ok:true)
  async ok(method, url, body) {
    const r = await this.call(method, url, body);
    if (r.status !== 200 || !r.json || r.json.ok === false) throw new Error(method + ' ' + url + ' -> ' + r.status + ' ' + r.body.toString('utf8').slice(0, 300));
    return r.json;
  }
  async db() { return (await this.ok('GET', '/api/db')).db; }
  stop(signal) {
    return new Promise((resolve) => {
      if (this.child.exitCode !== null || this.child.signalCode) return resolve();
      this.child.once('exit', () => resolve());
      this.child.kill(signal || 'SIGTERM');
    });
  }
}

// Khởi động server thật. opts: { data: thư mục dữ liệu, seed, port, env }
async function startServer(opts) {
  opts = opts || {};
  const dataDir = opts.data || makeDataDir(opts.seed);
  const port = opts.port || await freePort();
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--no-open'], {
    cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(port), KETOAN_DATA: dataDir, NO_OPEN: '1' }, opts.env || {})
  });
  const srv = new TestServer(dataDir, port, child);
  const t0 = Date.now();
  // chờ server sẵn sàng (cổng có thể tự nhảy nếu bận: đọc từ log)
  for (;;) {
    const m = /Đang chạy tại: http:\/\/localhost:(\d+)/.exec(srv.log);
    if (m) { srv.port = Number(m[1]); break; }
    if (child.exitCode !== null) { srv.exited = true; break; }
    if (Date.now() - t0 > 15000) throw new Error('Server không khởi động được: ' + srv.log);
    await new Promise((r) => setTimeout(r, 40));
  }
  return srv;
}

function readJsonFile(f) { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); }

// Số liệu thu chi tính độc lập (không dùng KT) để đối chiếu
function ledgerTotals(entries) {
  const t = { thu: 0, chi: 0, soDong: entries.length, theoDuAn: {}, theoNCC: {} };
  entries.forEach((e) => {
    t.thu += e.thu || 0; t.chi += e.chi || 0;
    [['theoDuAn', e.maDuAn], ['theoNCC', e.maNCC]].forEach(([k, ma]) => {
      const key = String(ma || '').trim().toLowerCase();
      const a = t[k][key] || (t[k][key] = { thu: 0, chi: 0, soDong: 0 });
      a.thu += e.thu || 0; a.chi += e.chi || 0; a.soDong++;
    });
  });
  t.ton = t.thu - t.chi;
  return t;
}

// Kiểm tra toàn vẹn tham chiếu: trả danh sách lỗi "mồ côi"
function orphanErrors(db) {
  const key = (x) => String(x == null ? '' : x).trim().toLowerCase();
  const set = (list) => new Set(list.map((x) => key(x.ma)));
  const P = set(db.projects); const S = set(db.suppliers); const G = set(db.costGroups);
  const I = set(db.costItems); const M = set(db.materials); const H = set(db.houses);
  const errs = [];
  db.entries.forEach((e) => {
    if (e.maDuAn && !P.has(key(e.maDuAn))) errs.push('entry#' + e.id + ' maDuAn ' + e.maDuAn);
    if (e.maNCC && !S.has(key(e.maNCC))) errs.push('entry#' + e.id + ' maNCC ' + e.maNCC);
  });
  db.costs.forEach((c) => {
    if (!P.has(key(c.maCT))) errs.push('cost#' + c.id + ' maCT ' + c.maCT);
    if (!S.has(key(c.maNCC))) errs.push('cost#' + c.id + ' maNCC ' + c.maNCC);
    if (!I.has(key(c.maHM))) errs.push('cost#' + c.id + ' maHM ' + c.maHM);
    if (c.maVT && !M.has(key(c.maVT))) errs.push('cost#' + c.id + ' maVT ' + c.maVT);
    if (c.maNha && !H.has(key(c.maNha))) errs.push('cost#' + c.id + ' maNha ' + c.maNha);
  });
  // hạng mục chưa gán nhóm là trạng thái được phép (giao diện cảnh báo "hạng mục chưa có nhóm"), nhóm ghi mã lạ thì là mồ côi
  db.costItems.forEach((i) => { if (i.maNhom && !G.has(key(i.maNhom))) errs.push('item ' + i.ma + ' maNhom ' + i.maNhom); });
  db.materials.forEach((m) => { if (m.maHM && !I.has(key(m.maHM))) errs.push('vt ' + m.ma + ' maHM ' + m.maHM); });
  db.houses.forEach((h) => { if (h.maCT && !P.has(key(h.maCT))) errs.push('nha ' + h.ma + ' maCT ' + h.maCT); });
  const ids = new Map();
  ['projects', 'suppliers', 'entries', 'costGroups', 'costItems', 'materials', 'houses', 'costs'].forEach((k) => db[k].forEach((x) => {
    if (ids.has(x.id)) errs.push('trùng id ' + x.id + ' (' + k + ' và ' + ids.get(x.id) + ')'); else ids.set(x.id, k);
  }));
  return errs;
}

module.exports = { ROOT, KT, DATA_SRC, tmpDir, makeDataDir, freePort, rawRequest, startServer, readJsonFile, ledgerTotals, orphanErrors };
