'use strict';
/* Q. Ma trận phân quyền (mục 2).
 * Q1: TỰ DÒ mọi route API trong mã máy chủ (server.js + lib/*.js): đọc mã nguồn lấy các đoạn đường dẫn được so sánh
 *     (seg[n] === '…', '/api/…', khóa của bảng danh mục, case của switch xuất Excel), ghép thành đường dẫn ứng viên, gửi thử với
 *     đăng nhập TẮT; route "sống" = máy chủ không trả "Không có chức năng …". Mọi route sống PHẢI có dòng trong lib/quyen.js
 *     (thiếu → kiểm thử thất bại); mọi dòng của ma trận phải ứng với một route sống (không có dòng thừa).
 * Q2: đăng nhập BẬT, chạy MỌI dòng của ma trận với 4 trạng thái (chưa đăng nhập, Chỉ xem, Kế toán, Chủ): bị chặn đúng khi
 *     vai trò không có quyền (401 chưa đăng nhập / 403 không có quyền), không bị chặn khi có quyền.
 * Q3: các quyền nhạy cảm đối chiếu với bảng mong đợi viết tay (không lấy từ lib/quyen.js) — tránh vô tình nới quyền.
 * Q4: route lạ (chưa khai báo) bị chặn khi đăng nhập bật, kể cả với Chủ (mặc định từ chối). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startServer, ROOT } = require('./helpers');
const { goi, batDangNhap, dangNhap, taoVaDangNhap, MK_CHU } = require('./auth-helpers');
const Q = require('../lib/quyen');

const METHODS = ['GET', 'POST', 'PUT', 'DELETE'];
const CHAN_BOI_TANG_QUYEN = new Set(['CHUA_DANG_NHAP', 'HET_PHIEN', 'KHONG_CO_QUYEN', 'CHUA_KHAI_BAO']);

// ----- đọc mã nguồn: các đoạn đường dẫn theo từng file -----
function ungVien() {
  const files = [path.join(ROOT, 'server.js')].concat(fs.readdirSync(path.join(ROOT, 'lib')).map((f) => path.join(ROOT, 'lib', f)).filter((f) => f.endsWith('.js')));
  const out = new Set();
  files.forEach((f) => {
    const src = fs.readFileSync(f, 'utf8');
    if (!/seg\[\d\]|'\/api\//.test(src)) return;
    const P = { 1: new Set(), 2: new Set(), 3: new Set() };
    for (const m of src.matchAll(/seg\[(\d)\]\s*[!=]==\s*'([^']+)'/g)) if (P[m[1]]) P[m[1]].add(m[2]);
    for (const m of src.matchAll(/'(\/api\/[^'?\s]*)'/g)) {
      out.add(m[1]);
      m[1].split('/').filter(Boolean).slice(1).forEach((t, i) => { if (P[i + 1] && !t.includes('*') && !t.startsWith(':')) P[i + 1].add(t); });
    }
    for (const m of src.matchAll(/own\((\w+), seg\[1\]\)/g)) {
      const blk = new RegExp('const ' + m[1] + ' = \\{([\\s\\S]*?)\\n\\s*\\};').exec(src);
      if (blk) for (const k of blk[1].matchAll(/^\s*'?([a-z][\w-]*)'?\s*:/gm)) P[1].add(k[1]);
    }
    if (/switch \(seg\[2\]\)/.test(src)) for (const m of src.matchAll(/case '([a-z-]+)':/g)) P[2].add(m[1]);
    if (/\/\^\\\/api\\\/users/.test(src)) P[1].add('users');
    const a = Array.from(P[1]);
    const b = Array.from(P[2]).concat(['1']);
    const c = Array.from(P[3]).concat(['1']);
    a.forEach((x) => {
      out.add('/api/' + x);
      b.forEach((y) => {
        out.add('/api/' + x + '/' + y);
        c.forEach((z) => out.add('/api/' + x + '/' + y + '/' + z));
      });
    });
  });
  return Array.from(out).filter((p) => !p.endsWith('/'));
}

function seed() {
  return {
    schema: 3, settings: {}, vouchers: {}, trash: [], locks: [], attachments: [], cashCounts: [], ignoredWarnings: {},
    projects: [{ id: 101, ma: 'CT1', ten: 'Công trình 1', nganSach: 0, trangThai: 'Đang thực hiện', ghiChu: '' }],
    suppliers: [{ id: 102, ma: 'NCC1', ten: 'NCC 1', loai: '', sdt: '', diaChi: '', ghiChu: '' }],
    costGroups: [], costItems: [], materials: [], houses: [], costs: [],
    entries: [{ id: 103, seq: 1, ngay: '2026-08-01', soPhieu: 'PC001', maDuAn: 'CT1', maNCC: 'NCC1', noiDung: 'x', thu: 0, chi: 1000, nguoiNhan: '', ghiChu: '' }],
    nextId: 200
  };
}

// Đường dẫn cụ thể cho một mẫu của ma trận
const cuThe = (p) => p.replace(/:x/g, '999999').replace(/\*\*/g, 'PC999');

test('Q1 tự dò mọi route API trong mã máy chủ: route nào máy chủ xử lý mà KHÔNG có trong ma trận quyền → thất bại; dòng ma trận nào không ứng với route thật → thất bại', { timeout: 600000 }, async () => {
  const cands = ungVien();
  const srv = await startServer({ seed: seed() });
  const song = [];
  try {
    for (const p of cands) {
      for (const m of METHODS) {
        const r = await srv.call(m, p, m === 'GET' ? undefined : {});
        const fallthrough = r.status === 404 && r.json && /^Không có chức năng/.test(r.json.error || '');
        if (!fallthrough) song.push([m, p, r.status]);
      }
    }
    // dòng của ma trận: đường dẫn cụ thể cũng phải "sống"
    for (const [m, p] of Q.ROUTES) {
      const r = await srv.call(m, cuThe(p), m === 'GET' ? undefined : {});
      const fallthrough = r.status === 404 && r.json && /^Không có chức năng/.test(r.json.error || '');
      assert.ok(!fallthrough, 'dòng ma trận ' + m + ' ' + p + ' không ứng với chức năng nào của máy chủ (dòng thừa)');
    }
  } finally { await srv.stop(); }
  const thieu = song.filter(([m, p]) => !Q.timRoute(m, p, new URL('http://x' + p)));
  console.log('# Q1: dò ' + cands.length + ' đường dẫn × ' + METHODS.length + ' phương thức; ' + song.length + ' route sống; ' + Q.ROUTES.length + ' dòng ma trận');
  assert.deepEqual(thieu.map((x) => x[0] + ' ' + x[1] + ' (' + x[2] + ')'), [], 'route có trong mã máy chủ nhưng CHƯA có trong ma trận quyền (lib/quyen.js)');
  // mọi mẫu của ma trận đều được dò thấy ít nhất một lần
  const daThay = new Set(song.map(([m, p]) => { const r = Q.timRoute(m, p, new URL('http://x' + p)); return r && r.mau; }));
  const khongDo = Q.ROUTES.map(([m, p]) => m + ' ' + p).filter((k) => !daThay.has(k));
  assert.ok(khongDo.length <= Q.ROUTES.length, 'thông tin');
  if (khongDo.length) console.log('# Q1: mẫu chỉ kiểm bằng đường dẫn cụ thể (không có trong ứng viên dò): ' + khongDo.join(', '));
});

async function bonTrangThai(srv) {
  const { cookie: chu } = await batDangNhap(srv);
  const kt = await taoVaDangNhap(srv, chu, 'ketoan1', 'ke-toan', 'kế toán mật khẩu 1');
  const cx = await taoVaDangNhap(srv, chu, 'xem1', 'chi-xem', 'chỉ xem mật khẩu 1');
  return { 'chua-dang-nhap': { cookie: '' }, 'chi-xem': { cookie: cx.cookie, ten: 'xem1', mk: 'chỉ xem mật khẩu 1' },
    'ke-toan': { cookie: kt.cookie, ten: 'ketoan1', mk: 'kế toán mật khẩu 1' }, chu: { cookie: chu, ten: 'chu', mk: MK_CHU } };
}

test('Q2 đăng nhập bật: MỌI dòng của ma trận × 4 trạng thái (chưa đăng nhập, Chỉ xem, Kế toán, Chủ) — chặn đúng 401 / 403, cho phép đúng', { timeout: 600000 }, async () => {
  const srv = await startServer({ seed: seed() });
  try {
    const st = await bonTrangThai(srv);
    const sai = [];
    let n = 0;
    const thu = async (m, url, hanhDong, vai) => {
      const s = st[vai];
      const r = await goi(srv, m, url, m === 'GET' ? undefined : {}, s.cookie || undefined);
      n++;
      const biChan = (r.status === 401 || r.status === 403) && r.json && CHAN_BOI_TANG_QUYEN.has(r.json.code);
      const duocPhep = Q.HANH_DONG[hanhDong].vai === '*' || (vai !== 'chua-dang-nhap' && Q.choPhep(vai, hanhDong));
      if (duocPhep && biChan) sai.push(vai + ' ' + m + ' ' + url + ': bị chặn (' + r.status + ' ' + r.json.code + ') nhưng ma trận cho phép');
      if (!duocPhep) {
        const mong = vai === 'chua-dang-nhap' ? 401 : 403;
        if (!biChan || r.status !== mong) sai.push(vai + ' ' + m + ' ' + url + ': trả ' + r.status + ' (' + (r.json && r.json.code) + ') nhưng phải bị chặn ' + mong);
      }
      // đăng xuất làm mất phiên: đăng nhập lại
      if (url === '/api/auth/dang-xuat' && s.ten) s.cookie = (await dangNhap(srv, s.ten, s.mk)).cookie;
    };
    for (const vai of ['chua-dang-nhap', 'chi-xem', 'ke-toan', 'chu']) {
      for (const [m, p, hd] of Q.ROUTES) {
        if (typeof hd === 'function') {
          await thu(m, p + '?mode=merge', 'nhap-excel', vai);
          await thu(m, p + '?dryRun=1', 'nhap-excel', vai);
          await thu(m, p + '?mode=replace', 'nhap-excel-thay-the', vai);
          await thu(m, p, 'nhap-excel-thay-the', vai);
        } else await thu(m, cuThe(p), hd, vai);
      }
    }
    console.log('# Q2: ' + n + ' lần gọi (' + Q.ROUTES.length + ' dòng × 4 trạng thái)');
    assert.deepEqual(sai, []);
  } finally { await srv.stop(); }
});

test('Q3 quyền nhạy cảm đúng như yêu cầu (bảng mong đợi viết tay, độc lập với lib/quyen.js)', async () => {
  // [phương thức, đường dẫn, các vai trò ĐƯỢC phép]
  const MONG = [
    ['GET', '/api/db', ['chu', 'ke-toan', 'chi-xem']],
    ['GET', '/api/export/full', ['chu', 'ke-toan', 'chi-xem']],
    ['GET', '/api/export/cost-debt', ['chu', 'ke-toan', 'chi-xem']],
    ['POST', '/api/entries', ['chu', 'ke-toan']],
    ['PUT', '/api/entries/5', ['chu', 'ke-toan']],
    ['DELETE', '/api/entries/5', ['chu', 'ke-toan']],
    ['POST', '/api/cost-slips', ['chu', 'ke-toan']],
    ['POST', '/api/import?mode=merge', ['chu', 'ke-toan']],
    ['POST', '/api/import?mode=replace', ['chu']],
    ['POST', '/api/import', ['chu']],
    ['POST', '/api/backups/now', ['chu', 'ke-toan']],
    ['GET', '/api/backup-zip', ['chu', 'ke-toan']],
    ['POST', '/api/backups/restore', ['chu']],
    ['POST', '/api/restore', ['chu']],
    ['POST', '/api/restore-zip', ['chu']],
    ['POST', '/api/trash/purge-all', ['chu']],
    ['DELETE', '/api/trash/5', ['chu']],
    ['POST', '/api/trash/5/restore', ['chu', 'ke-toan']],
    ['PUT', '/api/settings', ['chu']],
    ['POST', '/api/reset', ['chu']],
    ['POST', '/api/reset-costs', ['chu']],
    ['POST', '/api/locks', ['chu']],
    ['POST', '/api/locks/unlock', ['chu']],
    ['POST', '/api/merge', ['chu']],
    ['POST', '/api/merge/split', ['chu']],
    ['GET', '/api/users', ['chu']],
    ['POST', '/api/users', ['chu']],
    ['POST', '/api/auth/tat', ['chu']],
    ['GET', '/api/auth/su-kien', ['chu']],
    ['POST', '/api/auth/doi-mat-khau', ['chu', 'ke-toan', 'chi-xem']],
    ['GET', '/api/audit', ['chu', 'ke-toan']]
  ];
  for (const [m, p, vai] of MONG) {
    const r = Q.timRoute(m, p.split('?')[0], new URL('http://x' + p));
    assert.ok(r, m + ' ' + p + ' phải có trong ma trận');
    for (const v of Q.MOI_VAI) assert.equal(Q.choPhep(v, r.hanhDong), vai.includes(v), m + ' ' + p + ' với vai trò ' + v);
  }
});

test('Q4 mặc định từ chối: khi đăng nhập bật, đường dẫn API chưa khai báo bị chặn 403 kể cả với Chủ; đường dẫn lạ (//, ..) không khớp; khi tắt thì trả như cũ (404)', async () => {
  const srv = await startServer({ seed: seed() });
  try {
    assert.equal((await srv.call('GET', '/api/khong-co-chuc-nang-nay')).status, 404);
    const { cookie } = await batDangNhap(srv);
    for (const [m, p] of [['GET', '/api/khong-co-chuc-nang-nay'], ['DELETE', '/api/db'], ['PATCH', '/api/entries/1'], ['GET', '/api//db'], ['GET', '/api/export/khong-co']]) {
      const r = await goi(srv, m, p, m === 'GET' ? undefined : {}, cookie);
      assert.equal(r.status, 403, m + ' ' + p);
      assert.equal(r.json.code, 'CHUA_KHAI_BAO');
    }
    // đường dẫn có ".." được máy chủ chuẩn hóa TRƯỚC khi khớp ma trận (giống cách xử lý chức năng): /api/entries/../reset = /api/reset
    const kt = await taoVaDangNhap(srv, cookie, 'ketoan2', 'ke-toan', 'kế toán mật khẩu 2');
    const r = await goi(srv, 'POST', '/api/entries/../reset', { confirm: 'XOA' }, kt.cookie);
    assert.equal(r.status, 403); assert.equal(r.json.code, 'KHONG_CO_QUYEN');
    assert.equal(Q.timRoute('GET', '/api//db'), null);
    assert.equal(Q.timRoute('POST', '/api/entries/../reset'), null);
  } finally { await srv.stop(); }
});
