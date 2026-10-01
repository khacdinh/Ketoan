#!/usr/bin/env node
'use strict';
/*
 * Đối chiếu bản lưu SQLite với bản lưu JSON gốc trên cùng một bộ dữ liệu.
 *   node tests/doi-chieu-sqlite.js --goc <thư mục mã bản JSON> [file.json ...]
 * <thư mục mã bản JSON>: một bản checkout của nhánh trước khi chuyển (vd `git worktree add ../goc feature/truy-vet-chinh-xac`).
 * Không ghi file .json nào thì dùng tests/fixtures/ketoan-v1-goc.json và ketoan-v2-hien-tai.json.
 * Mỗi file: chạy server bản cũ và bản mới (thư mục dữ liệu tạm, không đụng data/), so sánh
 *   1. toàn bộ dữ liệu /api/db (mọi bản ghi, mọi trường, thứ tự),
 *   2. mọi con số báo cáo (tests/so-lieu-moc.js: tồn quỹ, sổ, dự án, NCC, phiếu, chi phí, công nợ, giá vật tư…),
 *   3. từng file Excel xuất ra: từng ô (giá trị + công thức) của mọi sheet và nội dung biểu đồ,
 *   4. sau một chuỗi thao tác ghi giống nhau trên cả hai bản (thêm/sửa/xóa/khôi phục/phiếu nhập/nháp/kiểm quỹ/khóa sổ…), so lại 1–3;
 *   5. tắt cả hai rồi mở lại (bản mới đọc từ ketoan.db), so lại 1–3.
 * In bảng kết quả; thoát mã 1 nếu có bất kỳ chỗ lệch nào.
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const ExcelJS = require('exceljs');
const { startServer } = require('./helpers');
const { summarize } = require('./so-lieu-moc');

const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)
  ? Object.keys(v).sort().reduce((o, key) => { o[key] = v[key]; return o; }, {}) : v));

// Bỏ các trường đổi theo thời điểm chạy (không phải dữ liệu nghiệp vụ)
function stripVolatile(db) {
  const d = JSON.parse(JSON.stringify(db));
  delete d.updatedAt;
  delete d.schema;
  ['entries', 'costs'].forEach((k) => (d[k] || []).forEach((r) => { if (r.__moi) { delete r.createdAt; delete r.updatedAt; } }));
  return d;
}

async function dumpXlsx(buf) {
  const out = {};
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  wb.eachSheet((ws) => {
    const cells = {};
    ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
      let v = c.value;
      if (v instanceof Date) v = 'D:' + v.toISOString();
      cells[c.address] = v;
    }));
    out[ws.name] = cells;
  });
  // biểu đồ (chèn trực tiếp vào zip) và các phần khác ngoài bảng tính
  const zip = await JSZip.loadAsync(buf);
  const parts = {};
  for (const n of Object.keys(zip.files).sort()) {
    if (zip.files[n].dir || /^docProps\//.test(n)) continue; // docProps: giờ tạo file
    if (/^xl\/(charts|drawings)\//.test(n)) parts[n] = await zip.file(n).async('string');
  }
  out.__parts = parts;
  return out;
}

function diffDumps(a, b) {
  const diffs = [];
  const sheets = new Set(Object.keys(a).concat(Object.keys(b)));
  sheets.forEach((s) => {
    const A = a[s] || {};
    const B = b[s] || {};
    if (!a[s] || !b[s]) { diffs.push('sheet ' + s + ' chỉ có ở một bên'); return; }
    new Set(Object.keys(A).concat(Object.keys(B))).forEach((addr) => {
      if (canon(A[addr]) !== canon(B[addr])) diffs.push(s + '!' + addr + ': ' + JSON.stringify(A[addr]).slice(0, 80) + ' ≠ ' + JSON.stringify(B[addr]).slice(0, 80));
    });
  });
  return diffs;
}

function exportUrls(db) {
  const v = (db.entries || []).find((e) => e.soPhieu);
  const ct = (db.projects || []).find((p) => (db.costs || []).some((c) => c.maCT === p.ma));
  const cc = (db.cashCounts || [])[0];
  const u = {
    'Toàn bộ sổ sách': '/api/export/full',
    'Sổ thu chi': '/api/export/ledger',
    'Sổ thu chi (lọc)': '/api/export/ledger?from=2026-09-05&to=2026-09-20&loai=chi',
    'Tổng hợp dự án': '/api/export/projects',
    'Tổng hợp NCC': '/api/export/suppliers',
    'Chi phí công trình': '/api/export/costs',
    'Sổ chi phí': '/api/export/cost-ledger',
    'Công nợ NCC': '/api/export/cost-debt'
  };
  if (v) u['Phiếu ' + v.soPhieu] = '/api/export/voucher?so=' + encodeURIComponent(v.soPhieu);
  if (ct) u['Chi phí ' + ct.ma] = '/api/export/costs?ct=' + encodeURIComponent(ct.ma);
  if (cc) u['Biên bản kiểm quỹ'] = '/api/export/cash-count?id=' + cc.id;
  return u;
}

async function capture(srv) {
  const db = await srv.db();
  // số liệu báo cáo: bỏ giờ tạo/sửa của dòng (dòng thêm trong chuỗi thao tác có giờ khác nhau giữa hai lần chạy; dữ liệu đã so riêng)
  const so = JSON.parse(JSON.stringify(summarize(db), (k, v) => (k === 'createdAt' || k === 'updatedAt' ? undefined : v)));
  const out = { db: stripVolatile(db), so, xlsx: {} };
  for (const [name, url] of Object.entries(exportUrls(db))) {
    const r = await srv.call('GET', url);
    out.xlsx[name] = r.status === 200 ? await dumpXlsx(r.body) : { __loi: r.status + ' ' + r.body.toString().slice(0, 100) };
  }
  const tr = await srv.call('GET', '/api/trash');
  out.trash = tr.json ? tr.json.items.map((t) => ({ kind: t.kind, label: t.label, count: t.count, records: t.records.map((r) => { const x = Object.assign({}, r); delete x.createdAt; delete x.updatedAt; return x; }) })) : null;
  return out;
}

// Chuỗi thao tác ghi giống nhau trên cả hai bản (createdAt/updatedAt của bản ghi mới được bỏ qua khi so)
async function operate(srv) {
  const db = await srv.db();
  const p = db.projects.find((x) => db.costs.some((c) => c.maCT === x.ma)) || db.projects[0];
  const s = db.suppliers[0];
  const it = db.costItems[0];
  const ids = [];
  for (let i = 0; i < 5; i++) ids.push((await srv.ok('POST', '/api/entries', { ngay: '2026-09-1' + i, noiDung: 'đối chiếu ' + i, chi: 1000 * (i + 1), maDuAn: p ? p.ma : '' })).id);
  await srv.ok('POST', '/api/entries', { ngay: '2026-09-15', noiDung: 'thu đối chiếu', thu: 777777, soPhieu: 'PT900' });
  const e0 = (await srv.db()).entries.find((e) => e.id === ids[1]);
  await srv.ok('PUT', '/api/entries/' + ids[1], Object.assign({}, e0, { chi: 123456, ghiChu: 'đã sửa' }));
  await srv.ok('DELETE', '/api/entries/' + ids[2]);
  if (p && s && it) {
    await srv.ok('POST', '/api/cost-slips', { header: { ngay: '2026-09-20', maCT: p.ma, maNCC: s.ma, maHM: it.ma }, lines: [{ dienGiai: 'cát', soLuong: 2.5, donGia: 150000.5 }, { dienGiai: 'đá', soLuong: 1.3333, donGia: 99999 }] });
  }
  const t = (await srv.ok('GET', '/api/trash')).items[0];
  if (t) await srv.ok('POST', '/api/trash/' + t.id + '/restore');
  await srv.ok('POST', '/api/projects', { ma: 'DC_SQL', ten: 'Dự án đối chiếu', nganSach: 5000000 });
  // các tính năng nhóm 1: nháp, ghi sổ nháp, kiểm quỹ, thông tin in phiếu, bỏ qua cảnh báo, khóa sổ
  const d1 = (await srv.ok('POST', '/api/entries', { ngay: '2026-09-21', noiDung: 'nháp sẽ ghi sổ', chi: 4321, trangThai: 'nhap' })).id;
  await srv.ok('POST', '/api/entries', { ngay: '2026-09-22', noiDung: 'nháp để lại', chi: 9999, trangThai: 'nhap' });
  await srv.ok('POST', '/api/entries/post', { ids: [d1] });
  await srv.ok('POST', '/api/cash-counts', { ngay: '2026-09-25', thucTe: 1000000, menhGia: { 500000: 2 }, nguoiKiem: 'Thủ quỹ' });
  const vp = db.entries.find((e) => e.soPhieu);
  if (vp) await srv.ok('PUT', '/api/vouchers/' + encodeURIComponent(vp.soPhieu), { lyDo: 'Lý do in thử "đặc biệt" ở đây', kemTheo: '2' });
  await srv.ok('POST', '/api/warnings/ignore', { key: 'trung:doi-chieu', label: 'Cảnh báo thử', note: 'đã xem' });
  await srv.ok('POST', '/api/locks', { months: ['2026-01'] });
}

function markNew(db, before) {
  const old = new Set(before.entries.map((e) => e.id).concat(before.costs.map((c) => c.id)));
  ['entries', 'costs'].forEach((k) => db[k].forEach((r) => { if (!old.has(r.id)) { delete r.createdAt; delete r.updatedAt; } }));
  // giờ thao tác của các mục nhóm 1 tạo trong chuỗi thao tác
  (db.cashCounts || []).forEach((r) => { delete r.createdAt; });
  (db.locks || []).forEach((r) => { delete r.at; });
  Object.values(db.ignoredWarnings || {}).forEach((r) => { delete r.at; });
  return db;
}

async function compareFile(file, goc) {
  const rows = [];
  const add = (name, ok, note) => rows.push({ name, ok, note: note || '' });
  let oldSrv = await startServer({ seed: file, root: goc });
  let newSrv = await startServer({ seed: file });
  try {
    if (oldSrv.exited || newSrv.exited) throw new Error('server không chạy: ' + (oldSrv.exited ? oldSrv.log : newSrv.log));
    for (const phase of ['Mở dữ liệu', 'Sau chuỗi thao tác ghi', 'Tắt rồi mở lại']) {
      if (phase === 'Tắt rồi mở lại') {
        await oldSrv.stop(); await newSrv.stop();
        oldSrv = await startServer({ data: oldSrv.dataDir, root: goc });
        newSrv = await startServer({ data: newSrv.dataDir });
      }
      const A = await capture(oldSrv);
      const B = await capture(newSrv);
      if (phase === 'Mở dữ liệu') A0 = A; else { markNew(A.db, A0.db); markNew(B.db, A0.db); }
      add(phase + ': toàn bộ dữ liệu (' + B.db.entries.length + ' dòng sổ, ' + B.db.costs.length + ' dòng chi phí, ' + B.db.cashCounts.length + ' kiểm quỹ, ' + B.db.locks.length + ' tháng khóa)', canon(A.db) === canon(B.db));
      Object.keys(A.so).forEach((k) => add(phase + ': số liệu ' + k + (k === 'tonQuy' ? ' = ' + B.so.tonQuy : ''), canon(A.so[k]) === canon(B.so[k])));
      add(phase + ': thùng rác', canon(A.trash) === canon(B.trash));
      for (const name of Object.keys(A.xlsx)) {
        const d = diffDumps(A.xlsx[name], B.xlsx[name] || {});
        const nCells = Object.keys(B.xlsx[name] || {}).filter((x) => x !== '__parts').reduce((t, x) => t + Object.keys(B.xlsx[name][x]).length, 0);
        add(phase + ': Excel ' + name + ' (' + nCells + ' ô)', d.length === 0, d.slice(0, 3).join(' | '));
      }
      if (phase === 'Mở dữ liệu') { await operate(oldSrv); await operate(newSrv); }
    }
  } finally { await oldSrv.stop(); await newSrv.stop(); }
  return rows;
}
let A0;

async function main() {
  const args = process.argv.slice(2);
  const gi = args.indexOf('--goc');
  const goc = gi >= 0 ? path.resolve(args[gi + 1]) : process.env.KETOAN_BAN_GOC;
  const files = args.filter((a, i) => a !== '--goc' && i !== gi + 1);
  if (!goc || !fs.existsSync(path.join(goc, 'server.js'))) {
    console.error('Cần --goc <thư mục mã bản JSON gốc> (có server.js).');
    process.exit(2);
  }
  const list = files.length ? files : ['ketoan-v1-goc.json', 'ketoan-v2-hien-tai.json'].map((f) => path.join(__dirname, 'fixtures', f));
  let bad = 0;
  const report = {};
  for (const f of list) {
    A0 = null;
    const rows = await compareFile(path.resolve(f), goc);
    report[path.basename(f)] = rows;
    console.log('\n== ' + path.basename(f) + ' ==');
    rows.forEach((r) => { console.log((r.ok ? '  khớp  ' : '  LỆCH  ') + r.name + (r.note ? '  → ' + r.note : '')); if (!r.ok) bad++; });
  }
  const out = path.join(require('os').tmpdir(), 'doi-chieu-sqlite.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 1));
  console.log('\n' + (bad ? bad + ' chỗ LỆCH' : 'Tất cả khớp') + '. Chi tiết: ' + out);
  process.exit(bad ? 1 : 0);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(2); });

module.exports = { dumpXlsx, diffDumps, capture, canon };
