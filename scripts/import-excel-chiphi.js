#!/usr/bin/env node
'use strict';
/*
 * Nhập các file Excel công trình ChiPhi_CongTrinh_*.xlsm vào phần mềm (chi phí công trình + sổ quỹ), chạy lại được.
 *
 *   node scripts/import-excel-chiphi.js --dry-run               # mặc định: chỉ đọc, không ghi gì, xuất báo cáo
 *   node scripts/import-excel-chiphi.js --apply                 # ghi vào dữ liệu (tự sao lưu "truoc-import-excel", một giao dịch)
 *   node scripts/import-excel-chiphi.js --rollback IMP-...      # gỡ đúng những gì lần nhập đó đã thêm (vào Thùng rác)
 *
 * Tùy chọn:
 *   --input <thư mục>     thư mục chứa file Excel (mặc định import-input/)
 *   --data <thư mục>      thư mục dữ liệu của phần mềm (mặc định biến KETOAN_DATA hoặc data/)
 *   --report <thư mục>    nơi ghi báo cáo (mặc định import-bao-cao/)
 *   --so-quy nhap|ghi-so|bo-qua   dòng SO_QUY chưa có trong sổ thu chi: nhập dạng Nháp (mặc định) / ghi sổ luôn / bỏ qua
 *   --nguoi "<tên>"       tên người thao tác ghi vào nhật ký
 *   --bo-qua-kiem-tra-phan-mem   không kiểm tra phần mềm có đang chạy (chỉ dùng khi chắc chắn)
 * Phần mềm phải TẮT khi --apply / --rollback (công cụ kiểm tra cổng 3939–3958).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const KT = require('../public/js/shared.js');
const imp = require('../lib/importCongTrinh');
const { computeExpected } = require('./so-ky-vong-excel');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const o = { mode: 'dry-run', input: path.join(ROOT, 'import-input'), data: process.env.KETOAN_DATA || path.join(ROOT, 'data'), report: path.join(ROOT, 'import-bao-cao'),
    soQuy: 'nhap', nguoi: '', checkServer: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.mode = 'dry-run';
    else if (a === '--apply') o.mode = 'apply';
    else if (a === '--rollback') { o.mode = 'rollback'; o.lan = argv[++i]; }
    else if (a === '--input') o.input = path.resolve(argv[++i]);
    else if (a === '--data') o.data = path.resolve(argv[++i]);
    else if (a === '--report') o.report = path.resolve(argv[++i]);
    else if (a === '--so-quy') o.soQuy = argv[++i];
    else if (a === '--nguoi') o.nguoi = argv[++i];
    else if (a === '--bo-qua-kiem-tra-phan-mem') o.checkServer = false;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new imp.ImportError('THAM_SO', 'Tham số không hiểu: ' + a + ' (xem --help)');
  }
  if (!['nhap', 'ghi-so', 'bo-qua'].includes(o.soQuy)) throw new imp.ImportError('THAM_SO', '--so-quy phải là nhap, ghi-so hoặc bo-qua');
  if (o.mode === 'rollback' && !o.lan) throw new imp.ImportError('THAM_SO', 'Thiếu mã lần nhập sau --rollback (vd --rollback IMP-20261001-101500)');
  return o;
}

function stamp(d) {
  d = d || new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

// Đọc dữ liệu hiện tại KHÔNG ghi gì (dry-run): ketoan.db mở chỉ-đọc; chỉ có ketoan.json thì đọc file JSON
function loadReadOnly(dataDir) {
  const { Store } = require('../lib/store');
  const norm = (d) => Store.prototype.normalize.call({ fixes: [] }, d);
  const dbFile = path.join(dataDir, 'ketoan.db');
  const jsonFile = path.join(dataDir, 'ketoan.json');
  if (fs.existsSync(dbFile)) {
    if (fs.existsSync(dbFile + '-journal')) throw new imp.ImportError('DB_DO_DANG', 'ketoan.db đang có giao dịch dở dang (file -journal). Hãy mở phần mềm một lần rồi tắt, sau đó chạy lại.');
    const { readDbFile } = require('../lib/db');
    return { db: norm(readDbFile(dbFile)), from: 'ketoan.db' };
  }
  if (fs.existsSync(jsonFile)) return { db: norm(JSON.parse(fs.readFileSync(jsonFile, 'utf8').replace(/^﻿/, ''))), from: 'ketoan.json (chưa chuyển sang SQLite — lần --apply đầu tiên sẽ chuyển như khi mở phần mềm)' };
  throw new imp.ImportError('KHONG_CO_DU_LIEU', 'Thư mục dữ liệu ' + dataDir + ' chưa có ketoan.db / ketoan.json');
}

function appRunning() {
  const ports = [];
  const base = Number(process.env.PORT) || 3939;
  for (let p = base; p < base + 20; p++) ports.push(p);
  return Promise.all(ports.map((port) => new Promise((resolve) => {
    const r = http.get({ host: '127.0.0.1', port, path: '/api/ping', timeout: 400 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body).app === 'so-thu-chi-ke-toan' ? port : 0); } catch (e) { resolve(0); } });
    });
    r.on('error', () => resolve(0));
    r.on('timeout', () => { r.destroy(); resolve(0); });
  }))).then((list) => list.filter(Boolean));
}

async function readAll(o, log) {
  const { files, lockOwners } = imp.listInputFiles(o.input);
  if (!files.length) throw new imp.ImportError('KHONG_CO_FILE', 'Thư mục ' + o.input + ' không có file .xlsm/.xlsx nào');
  const { use, old } = imp.pickVersions(files);
  const parsed = [];
  const oldParsed = [];
  const errors = [];
  lockOwners.forEach((f) => errors.push({ file: f, code: 'KHOA', message: 'Có file khóa "' + f + '" của Excel: file ' + f.replace(/^~\$/, '') + ' có thể đang mở trong Excel. Hãy đóng Excel trước khi nhập (để chắc dữ liệu đã được lưu).' }));
  for (const f of use) {
    try { log('Đọc ' + f); parsed.push(await imp.parseFile(path.join(o.input, f))); } catch (e) { errors.push({ file: f, code: e.code || 'LOI', message: e.message }); }
  }
  for (const f of old) {
    try { oldParsed.push(await imp.parseFile(path.join(o.input, f))); } catch (e) { errors.push({ file: f, code: e.code || 'LOI', message: e.message + ' (bản cũ, chỉ dùng để so sánh)' }); }
  }
  const expected = {};
  for (const pf of parsed) expected[pf.file] = await computeExpected(path.join(o.input, pf.file));
  return { parsed, oldParsed, old, errors, expected };
}

/* ---------------- báo cáo ---------------- */

const fm = (n) => (typeof n === 'number' ? KT.fmtMoney(n) : n == null ? '' : String(n));
const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const MUC = { 'sua': 'Sửa', 'suy-ra': 'Suy ra', 'bo-qua': 'Bỏ qua', 'canh-bao': 'Cảnh báo', 'can-quyet-dinh': 'CẦN QUYẾT ĐỊNH' };

function csv(rows, cols) {
  const esc = (v) => { const s = String(v == null ? '' : v); return /[",\r\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + [cols.map((c) => c[1]).join(',')].concat(rows.map((r) => cols.map((c) => esc(typeof c[0] === 'function' ? c[0](r) : r[c[0]])).join(','))).join('\r\n') + '\r\n';
}

function projectFigures(db, ma) {
  const p = KT.postedDb(db);
  const s = KT.costSummary(p, { ct: ma });
  const debt = KT.supplierDebt(p, { ct: ma });
  const hm = {};
  s.groups.forEach((g) => g.items.forEach((i) => { if (i.total) hm[i.ten] = i.total; }));
  return { total: s.total, soDong: s.soDong, byLoai: s.byLoai, hm, debt: debt.rows.filter((r) => r.phatSinh || r.daTra) };
}

function writeReports(o, ctx) {
  const { plan, before, after, check, expected, errors, oldParsed, title, applied } = ctx;
  fs.mkdirSync(o.report, { recursive: true });
  const L = [];
  const w = (s) => L.push(s === undefined ? '' : s);
  w('# ' + title);
  w();
  w('- Thời điểm: ' + new Date().toLocaleString('vi-VN') + ' · mã lần nhập: **' + plan.lan + '**' + (applied ? '' : ' (dry-run: không ghi gì)'));
  w('- Thư mục nguồn: `' + o.input + '` · dữ liệu: `' + o.data + '` (' + ctx.from + ')');
  w('- Sổ quỹ (SO_QUY) chưa có trong sổ thu chi: ' + ({ nhap: 'nhập dạng **Nháp** (không tính tồn quỹ / công nợ cho tới khi bấm Ghi sổ)', 'ghi-so': 'nhập và ghi sổ luôn', 'bo-qua': 'không nhập' })[plan.soQuy]);
  w('- Kiểm tra trước khi ghi: ' + (check.ok ? '**ĐẠT** — dữ liệu cũ không đổi, tổng tiền khớp số kỳ vọng tính độc lập từ ô nguồn' : '**KHÔNG ĐẠT**:\n  - ' + check.errs.join('\n  - ')));
  if (errors.length) { w('- Lỗi đọc file / cảnh báo file:'); errors.forEach((e) => w('  - `' + e.file + '`: ' + e.message)); }
  w();
  w('## 1. Theo từng file');
  w();
  w('| File | Công trình → dự án | Dòng chi phí đọc | Nhập mới | Đã có sẵn | Đã nhập lần trước | Bỏ qua | Σ sẽ nhập | Σ đã có sẵn | Σ kỳ vọng (độc lập) | Khớp |');
  w('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|');
  plan.files.forEach((f) => {
    const e = expected[f.file] || {};
    const got = f.nkcTong + f.nkcDaCoTong;
    w('| ' + cell(f.file) + ' | ' + f.ct + ' → ' + f.duAn + ' | ' + f.nkcRows + ' | ' + f.nkcAdded + ' | ' + f.nkcDaCo + ' | ' + f.nkcDaNhap + ' | ' + f.nkcBoQua + ' | ' + fm(f.nkcTong) + ' | ' + fm(f.nkcDaCoTong) + ' | ' + fm(e.nkcTong) + ' | ' + (f.nkcDaNhap ? 'xem lần trước' : got === e.nkcTong ? 'khớp' : '**LỆCH**') + ' |');
  });
  w();
  w('| File | Dòng sổ quỹ có tiền | Đã có trong sổ thu chi | Nhập (' + (plan.soQuy === 'nhap' ? 'Nháp' : plan.soQuy) + ') | Bỏ qua | Σ đã có | Σ nhập (chi / thu) | Σ kỳ vọng | Khớp | Tồn quỹ đầu kỳ trong file |');
  w('|---|---:|---:|---:|---:|---:|---:|---:|---|---:|');
  plan.files.forEach((f) => {
    const e = expected[f.file] || {};
    const got = f.sqDaCoTong + f.sqTongChi + f.sqTongThu;
    w('| ' + cell(f.file) + ' | ' + (e.sqRows || 0) + ' | ' + f.sqDaCo + ' | ' + f.sqAdded + ' | ' + f.sqBoQua + ' | ' + fm(f.sqDaCoTong) + ' | ' + fm(f.sqTongChi) + ' / ' + fm(f.sqTongThu) + ' | ' + fm(e.sqTong) + ' | ' + (plan.soQuy === 'bo-qua' || f.sqDaNhap ? '—' : got === e.sqTong ? 'khớp' : '**LỆCH**') + ' | ' + fm(f.tonDauKy) + ' (không ghi đè tồn quỹ của phần mềm) |');
  });
  w();
  w('Đếm theo loại xử lý (dòng chi phí): ' + plan.files.map((f) => f.file.replace(/\.xlsm$/i, '') + ': khoán ' + f.khoan + ', Loại CP suy ra ' + f.loaiSuyRa + ', Mã CT sửa ' + f.ctSua + ', Mã nhà sửa ' + f.nhaSua + ', ngày sửa ' + f.ngaySua + ', ngày nghi ngờ ' + f.ngayNghi + ', Thành tiền lệch ' + f.lechTT).join(' · '));
  w();
  w('## 2. Số liệu phần mềm trước / sau');
  w();
  const ton = (d) => { const l = KT.buildLedger(KT.postedDb(d)); return l.length ? l[l.length - 1].ton : 0; };
  w('| Chỉ tiêu | Trước | Sau | Chênh |');
  w('|---|---:|---:|---:|');
  const row = (n, a, b) => w('| ' + n + ' | ' + fm(a) + ' | ' + fm(b) + ' | ' + fm(b - a) + ' |');
  row('Tổng chi phí công trình (đã ghi sổ)', check.totalBefore, check.totalAfter);
  row('Số dòng chi phí', before.costs.length, after.costs.length);
  row('Số dòng sổ thu chi (kể cả nháp)', before.entries.length, after.entries.length);
  row('Tồn quỹ (đã ghi sổ)', ton(before), ton(after));
  row('Dự án / công trình', before.projects.length, after.projects.length);
  row('Nhà', before.houses.length, after.houses.length);
  row('Hạng mục', before.costItems.length, after.costItems.length);
  row('Vật tư', before.materials.length, after.materials.length);
  row('Nhà cung cấp', before.suppliers.length, after.suppliers.length);
  w();
  w('### Theo công trình (phần mềm tính sau khi nhập) và đối chiếu số lưu sẵn trong Excel (TONGHOP / CONGNO_NCC)');
  w();
  plan.files.forEach((f) => {
    const fig = projectFigures(after, f.duAn);
    const e = expected[f.file] || {};
    const th = f.cache.tongHop || {};
    const find = (re) => { const k = Object.keys(th).find((x) => re.test(KT.normalizeText(x))); return k ? th[k] : null; };
    w('**' + f.file + '** → dự án `' + f.duAn + '`');
    w();
    w('| Chỉ tiêu | Phần mềm sau nhập | Kỳ vọng từ ô nguồn | TONGHOP lưu sẵn trong file | Ghi chú |');
    w('|---|---:|---:|---:|---|');
    const note = (a, b) => (b == null ? '' : a === b ? 'khớp' : 'lệch ' + fm(a - b));
    w('| Tổng chi phí | ' + fm(fig.total) + ' | ' + fm(e.nkcTong) + ' | ' + fm(find(/^tong chi phi/)) + ' | ' + (f.nkcDaCo ? 'dự án có ' + f.nkcDaCo + ' dòng nhập từ bản cũ; ' : '') + 'so với TONGHOP: ' + note(fig.total, find(/^tong chi phi/)) + ' |');
    ['Vật tư', 'Nhân công', 'Dịch vụ-Phí'].forEach((l) => {
      const cached = find(new RegExp('^' + KT.normalizeText(l).replace(/[^a-z]/g, '.?')));
      w('| ' + l + ' | ' + fm(fig.byLoai[l] || 0) + ' | ' + fm(e.theoLoai ? (e.theoLoai[l] || 0) : '') + ' (Loại ghi sẵn) | ' + fm(cached) + ' | ' + (cached == null ? '' : note(fig.byLoai[l] || 0, cached)) + ' |');
    });
    w();
    const cn = (f.cache.congNo || []).filter((x) => x.phatSinh || x.daTra);
    if (cn.length) {
      w('Công nợ NCC: phần mềm (theo dự án ' + f.duAn + ') ↔ CONGNO_NCC lưu sẵn trong file');
      w();
      w('| Mã NCC | Phát sinh PM | Phát sinh file | Đã trả PM | Đã trả file | Còn lại PM | Còn lại file |');
      w('|---|---:|---:|---:|---:|---:|---:|');
      cn.forEach((x) => {
        const maPM = (plan.supMap || {})[imp.ck(x.ma)] || x.ma;
        const r = fig.debt.find((d) => imp.ck(d.ma) === imp.ck(maPM)) || { phatSinh: 0, daTra: 0, conLai: 0 };
        w('| ' + cell(x.ma) + (imp.ck(maPM) !== imp.ck(x.ma) ? ' → ' + cell(maPM) : '') + ' | ' + fm(r.phatSinh) + ' | ' + fm(x.phatSinh) + ' | ' + fm(r.daTra) + ' | ' + fm(x.daTra) + ' | ' + fm(r.conLai) + ' | ' + fm(x.conLai) + ' |');
      });
      w();
    }
  });
  w('## 3. Ánh xạ danh mục');
  w();
  w('**Công trình**');
  w();
  plan.reuse.projects.forEach((p) => w('- `' + p.maFile + '` (' + p.file + ') → DÙNG LẠI dự án `' + p.ma + '` (' + p.ten + ') — ' + p.how));
  plan.add.projects.forEach((p) => w('- `' + p.rec.ma + '` "' + p.rec.ten + '" → TẠO MỚI (' + p.src.file + '), khởi công ' + (p.rec.ngayKhoiCong ? KT.fmtDate(p.rec.ngayKhoiCong) : '—') + ', ' + (p.rec.trangThai || '')));
  w();
  w('**Nhà**: tạo mới ' + plan.add.houses.length + ' (' + plan.add.houses.map((h) => '`' + h.rec.ma + '` ' + h.rec.ten + ' → ' + h.rec.maCT).join('; ') + '); dùng lại ' + Array.from(new Set(plan.reuse.houses)).join(', '));
  w();
  w('**Hạng mục** tạo mới: ' + (plan.add.costItems.map((x) => '`' + x.rec.ma + '` ' + x.rec.ten + ' (nhóm ' + (x.rec.maNhom || '—') + ')').join('; ') || '(không)'));
  w();
  w('**Vật tư** tạo mới: ' + plan.add.materials.length + (plan.add.materials.length ? ' — ' + plan.add.materials.map((x) => '`' + x.rec.ma + '` ' + x.rec.ten + ' (' + (x.rec.dvt || '—') + ')').join('; ') : '') + '; dùng lại ' + plan.reuse.materials.length);
  w();
  w('**Nhà cung cấp**: dùng lại ' + plan.reuse.suppliers.length + ', tạo mới ' + plan.add.suppliers.length);
  w();
  if (plan.add.suppliers.length) { w('| Mã mới | Tên | Loại | Từ file |'); w('|---|---|---|---|'); plan.add.suppliers.forEach((x) => w('| ' + cell(x.rec.ma) + ' | ' + cell(x.rec.ten) + ' | ' + cell(x.rec.loai) + ' | ' + cell(x.src.file) + ' |')); w(); }
  if (plan.reuse.suppliers.length) { w('Dùng lại: ' + plan.reuse.suppliers.map((s) => s.maFile + ' → ' + s.ma + (s.how !== 'trùng mã' ? ' (' + s.how + ')' : '')).join('; ')); w(); }
  w('### Xung đột danh mục giữa các file (đã gộp)');
  w();
  plan.conflicts.forEach((c) => w('- [' + c.loai + '] ' + c.chiTiet));
  w();
  w('## 4. Cần bạn quyết định');
  w();
  const dec = plan.canQuyetDinh.map((x) => '[' + x.loai + '] ' + x.chiTiet)
    .concat(plan.nghiTrung.map((x) => '[nghi trùng ' + x.loai + '] ' + x.moi + ' ↔ ' + x.coSan + ' (' + x.lyDo + ')'))
    .concat(plan.issues.filter((i) => i.muc === 'can-quyet-dinh').map((i) => '[' + i.loai + '] ' + i.file + ' / ' + i.sheet + ' dòng ' + i.dong + ': ' + i.chiTiet));
  dec.forEach((d) => w('- ' + d));
  if (plan.oldOnly.length) {
    w('- [bản cũ] ' + plan.oldOnly.length + ' dòng đang có trong phần mềm (nhập từ bản cũ) KHÔNG có trong file mới — giữ nguyên, không xóa; danh sách ở mục 6.');
  }
  w();
  w('## 5. Danh sách đầy đủ các dòng bị sửa / suy ra / bỏ qua / cảnh báo');
  w();
  w('Tổng: ' + Object.entries(plan.issues.reduce((m, i) => { m[MUC[i.muc] || i.muc] = (m[MUC[i.muc] || i.muc] || 0) + 1; return m; }, {})).map(([k, v]) => k + ' ' + v).join(', ') + '. Bản CSV: `van-de.csv`.');
  w();
  w('| File | Sheet | Dòng | Mức | Loại | Chi tiết |');
  w('|---|---|---:|---|---|---|');
  plan.issues.slice().sort((a, b) => (a.file + a.sheet).localeCompare(b.file + b.sheet) || (Number(a.dong) || 0) - (Number(b.dong) || 0)).forEach((i) => {
    w('| ' + cell(i.file) + ' | ' + cell(i.sheet) + ' | ' + cell(i.dong) + ' | ' + (MUC[i.muc] || i.muc) + ' | ' + cell(i.loai) + ' | ' + cell(i.chiTiet + (i.duLieu ? ' [' + i.duLieu + ']' : '')) + ' |');
  });
  w();
  w('## 6. Dòng chỉ có ở bản cũ (đang có trong phần mềm, không có trong file mới)');
  w();
  if (!plan.oldOnly.length) w('(không có)');
  else {
    w('| id | Ngày | Hạng mục | Mã VT | Diễn giải | SL | ĐG | Thành tiền | NCC |');
    w('|---:|---|---|---|---|---:|---:|---:|---|');
    plan.oldOnly.forEach((x) => w('| ' + x.id + ' | ' + KT.fmtDate(x.ngay) + ' | ' + x.maHM + ' | ' + cell(x.maVT) + ' | ' + cell(x.dienGiai) + ' | ' + x.soLuong + ' | ' + fm(x.donGia) + ' | ' + fm(x.thanhTien) + ' | ' + cell(x.maNCC) + ' |'));
    w();
    w('Σ ' + fm(plan.oldOnly.reduce((t, x) => t + x.thanhTien, 0)));
  }
  if (oldParsed.length) {
    w();
    w('Bản cũ có trong thư mục nguồn: ' + oldParsed.map((p) => p.file + ' (' + p.costs.length + ' dòng)').join(', ') + ' — chỉ dùng để so sánh, không nhập.');
  }
  w();
  w('## 7. Sheet ghi chú / rác (không nhập) và ô ngoài bảng');
  w();
  ctx.parsed.forEach((pf) => {
    pf.junk.forEach((j) => w('- `' + pf.file + '` / sheet `' + j.sheet + '`: ' + (j.cells.length ? j.cells.slice(0, 60).join(' · ') : '(trống)')));
    pf.notes.forEach((n) => w('- `' + pf.file + '` / ' + n.sheet + ': ' + n.chiTiet));
  });
  w();
  const name = applied ? 'APPLY_' + plan.lan + '.md' : 'DRY_RUN.md';
  fs.writeFileSync(path.join(o.report, name), L.join('\n'));
  fs.writeFileSync(path.join(o.report, 'van-de.csv'), csv(plan.issues, [['file', 'File'], ['sheet', 'Sheet'], ['dong', 'Dòng'], [(i) => MUC[i.muc] || i.muc, 'Mức'], ['loai', 'Loại'], ['chiTiet', 'Chi tiết'], ['duLieu', 'Dữ liệu dòng'], ['giaTriGoc', 'Giá trị gốc'], ['giaTriMoi', 'Giá trị mới']]));
  fs.writeFileSync(path.join(o.report, 'dong-chi-phi.csv'), csv(plan.add.costs, [[(x) => x.src.file, 'File'], [(x) => x.src.dong, 'Dòng'], [(x) => x.rec.ngay, 'Ngày'], [(x) => x.rec.maCT, 'Mã CT'], [(x) => x.rec.maNha, 'Mã nhà'],
    [(x) => x.rec.maHM, 'Mã HM'], [(x) => x.rec.loaiCP, 'Loại CP'], [(x) => x.rec.maVT, 'Mã VT'], [(x) => x.rec.dienGiai, 'Diễn giải'], [(x) => x.rec.soLuong, 'SL'], [(x) => x.rec.donGia, 'ĐG'], [(x) => x.rec.thanhTien, 'Thành tiền'],
    [(x) => x.rec.maNCC, 'Mã NCC'], [(x) => x.rec.soPhieu, 'Số phiếu'], [(x) => x.rec.ghiChu, 'Ghi chú'], [(x) => (x.khoan ? 'có' : ''), 'Nhập theo khoản'], [(x) => x.fp, 'Fingerprint']]));
  fs.writeFileSync(path.join(o.report, 'dong-so-quy.csv'), csv(plan.add.entries, [[(x) => x.src.file, 'File'], [(x) => x.src.dong, 'Dòng'], [(x) => x.rec.ngay, 'Ngày'], [(x) => x.rec.soPhieu, 'Số phiếu'], [(x) => x.rec.maDuAn, 'Dự án'],
    [(x) => x.rec.maNCC, 'Mã NCC'], [(x) => x.rec.noiDung, 'Nội dung'], [(x) => x.rec.thu, 'Thu'], [(x) => x.rec.chi, 'Chi'], [(x) => x.rec.trangThai || 'ghi sổ', 'Trạng thái'], [(x) => x.rec.ghiChu, 'Ghi chú'], [(x) => x.fp, 'Fingerprint']]));
  fs.writeFileSync(path.join(o.report, 'chi-co-o-ban-cu.csv'), csv(plan.oldOnly, [['id', 'id'], ['ngay', 'Ngày'], ['maHM', 'Mã HM'], ['maVT', 'Mã VT'], ['dienGiai', 'Diễn giải'], ['soLuong', 'SL'], ['donGia', 'ĐG'], ['thanhTien', 'Thành tiền'], ['maNCC', 'NCC']]));
  return path.join(o.report, name);
}

/* ---------------- chạy ---------------- */

async function main(argv, io) {
  io = io || { log: (s) => console.log(s), err: (s) => console.error(s) };
  const o = parseArgs(argv);
  if (o.help) { io.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 19).map((l) => l.replace(/^ \*\s?/, '')).join('\n')); return { code: 0 }; }
  const lan = o.mode === 'rollback' ? o.lan : 'IMP-' + stamp();
  if (o.mode === 'rollback') return rollback(o, io);
  if (o.mode === 'apply' && o.checkServer) {
    const ports = await appRunning();
    if (ports.length) throw new imp.ImportError('PHAN_MEM_DANG_CHAY', 'Phần mềm đang chạy (cổng ' + ports.join(', ') + '). Hãy tắt phần mềm (đóng cửa sổ đen) rồi chạy lại --apply.');
  }
  const r = await readAll(o, io.log);
  const fatal = r.errors.filter((e) => e.code !== 'KHOA' || !/^~\$/.test(e.file));
  const { db: before, from } = loadReadOnly(o.data);
  const plan = imp.buildPlan(r.parsed, before, { lan, soQuy: o.soQuy, by: o.nguoi });
  const { db: after } = imp.applyPlan(before, plan);
  const check = imp.verify(before, after, plan, r.expected);
  const ctx = { plan, before, after, check, expected: r.expected, errors: r.errors, oldParsed: r.oldParsed, parsed: r.parsed, from, title: 'Báo cáo dry-run nhập Excel công trình' };
  const rep = writeReports(o, ctx);
  io.log('Báo cáo: ' + rep);
  summarize(plan, check, io);
  if (o.mode === 'dry-run') return { code: check.ok && !fatal.length ? 0 : 1, plan, check, report: rep };

  /* ---- apply ---- */
  if (fatal.length) throw new imp.ImportError('LOI_FILE', 'Không nhập vì có file lỗi: ' + fatal.map((e) => e.file + ' — ' + e.message).join(' | '));
  if (r.errors.length) throw new imp.ImportError('LOI_FILE', r.errors.map((e) => e.message).join(' | '));
  if (!check.ok) throw new imp.ImportError('KHONG_KHOP', 'Không nhập vì kiểm tra không đạt: ' + check.errs.join('; '));
  const { Store } = require('../lib/store');
  const store = new Store(o.data);
  try {
    // dựng lại kế hoạch trên đúng dữ liệu đang mở (đọc-ghi)
    const cur = store.db;
    const plan2 = imp.buildPlan(r.parsed, cur, { lan, soQuy: o.soQuy, by: o.nguoi });
    const { db: next } = imp.applyPlan(cur, plan2);
    const pre = imp.verify(cur, next, plan2, r.expected);
    if (!pre.ok) throw new imp.ImportError('KHONG_KHOP', 'Không nhập vì kiểm tra không đạt: ' + pre.errs.join('; '));
    store.audit({ by: o.nguoi || '', action: 'nhap-excel', kind: 'costs', recId: lan, label: 'Nhập Excel công trình bằng công cụ dòng lệnh (lần ' + lan + ')',
      note: 'Thêm ' + plan2.add.costs.length + ' dòng chi phí (Σ ' + fm(plan2.add.costs.reduce((t, x) => t + x.rec.thanhTien, 0)) + ' đ), ' + plan2.add.entries.length + ' dòng sổ thu chi' + (o.soQuy === 'nhap' ? ' (Nháp)' : '') +
        ', ' + plan2.add.projects.length + ' công trình, ' + plan2.add.suppliers.length + ' NCC, ' + plan2.add.materials.length + ' vật tư. Từ: ' + plan2.files.map((f) => f.file).join(', ') });
    const bk = store.commitChecked(next, (back) => imp.verify(cur, back, plan2, r.expected).errs, 'truoc-import-excel');
    const ctx2 = Object.assign({}, ctx, { plan: plan2, before: cur, after: store.db, check: imp.verify(cur, store.db, plan2, r.expected), applied: true, from: 'ketoan.db', title: 'Báo cáo nhập Excel công trình (đã ghi)' });
    const rep2 = writeReports(o, ctx2);
    io.log('ĐÃ NHẬP lần ' + lan + '. Bản sao lưu trước khi nhập: backups/' + bk + '. Báo cáo: ' + rep2);
    io.log('Muốn gỡ lần nhập này: node scripts/import-excel-chiphi.js --rollback ' + lan);
    return { code: 0, plan: plan2, backup: bk, report: rep2, lan };
  } finally { store.close(); }
}

async function rollback(o, io) {
  if (o.checkServer) {
    const ports = await appRunning();
    if (ports.length) throw new imp.ImportError('PHAN_MEM_DANG_CHAY', 'Phần mềm đang chạy (cổng ' + ports.join(', ') + '). Hãy tắt phần mềm rồi chạy lại --rollback.');
  }
  const { Store } = require('../lib/store');
  const store = new Store(o.data);
  try {
    const before = store.db;
    const res = imp.rollbackPlan(before, o.lan, { by: o.nguoi });
    const batch = (before.importBatches || []).find((b) => b.ma === o.lan);
    const check = (back) => {
      const errs = [];
      ['costs', 'entries'].forEach((k) => { const ids = new Set(batch.added[k] || []); const left = back[k].filter((x) => ids.has(x.id)); if (left.length) errs.push('Còn ' + left.length + ' dòng ' + k + ' của lần nhập'); });
      const keep = (k) => before[k].filter((x) => !(batch.added[k] || []).includes(x.id));
      ['costs', 'entries'].forEach((k) => { const ids = new Set(back[k].map((x) => x.id)); keep(k).forEach((x) => { if (!ids.has(x.id)) errs.push('Mất bản ghi cũ ' + k + ' #' + x.id); }); });
      return errs;
    };
    store.audit({ by: o.nguoi || '', action: 'xoa', kind: 'costs', recId: o.lan, label: 'Rollback lần nhập Excel ' + o.lan + ' (vào Thùng rác)', note: JSON.stringify(res.removed) + (res.kept.length ? '. Giữ lại: ' + res.kept.join(', ') : '') });
    const bk = store.commitChecked(res.db, check, 'truoc-rollback-import');
    io.log('ĐÃ ROLLBACK lần ' + o.lan + ': ' + Object.entries(res.removed).filter(([, n]) => n).map(([k, n]) => k + ' ' + n).join(', ') + ' (vào Thùng rác). Sao lưu trước: backups/' + bk);
    if (res.kept.length) io.log('Giữ lại (đang được dùng): ' + res.kept.join('; '));
    return { code: 0, removed: res.removed, kept: res.kept, backup: bk };
  } finally { store.close(); }
}

function summarize(plan, check, io) {
  plan.files.forEach((f) => io.log('  ' + f.file + ': chi phí nhập ' + f.nkcAdded + ' dòng Σ ' + fm(f.nkcTong) + (f.nkcDaCo ? ', đã có sẵn ' + f.nkcDaCo + ' (Σ ' + fm(f.nkcDaCoTong) + ')' : '') + (f.nkcDaNhap ? ', đã nhập lần trước ' + f.nkcDaNhap : '') + ', bỏ qua ' + f.nkcBoQua +
    ' | sổ quỹ: đã có ' + f.sqDaCo + ', nhập ' + f.sqAdded + ', bỏ qua ' + f.sqBoQua));
  io.log('  Kiểm tra: ' + (check.ok ? 'ĐẠT' : 'KHÔNG ĐẠT — ' + check.errs.join('; ')));
}

module.exports = { main, parseArgs };

if (require.main === module) {
  main(process.argv.slice(2)).then((r) => process.exit(r.code)).catch((e) => {
    console.error('LỖI: ' + e.message);
    process.exit(2);
  });
}
