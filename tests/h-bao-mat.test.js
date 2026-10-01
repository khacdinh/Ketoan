'use strict';
/* H. Bảo mật cơ bản: dữ liệu sai kiểu, đường dẫn lạ, chèn mã (XSS / công thức Excel), tiêm SQL (không dùng SQL), tiêu đề HTTP */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { KT, startServer, readJsonFile, orphanErrors, rawRequest } = require('./helpers');
const X = require('./excel-helpers');

const V2 = path.join(__dirname, 'fixtures', 'ketoan-v2-hien-tai.json');

// Mọi điểm vào ghi dữ liệu: [phương thức, đường dẫn, mẫu thân yêu cầu hợp lệ]
function endpoints(db) {
  const p = db.projects[0]; const s = db.suppliers[0]; const it = db.costItems[0];
  const cost = db.costs[0]; const e = db.entries[0];
  return [
    ['POST', '/api/entries', { ngay: '2026-09-01', noiDung: 'x', chi: 1 }],
    ['PUT', '/api/entries/' + e.id, { ngay: '2026-09-01', noiDung: 'x', chi: 1 }],
    ['POST', '/api/entries/delete', { ids: [999999] }],
    ['POST', '/api/projects', { ma: 'FZ1', ten: 'x' }],
    ['PUT', '/api/projects/' + p.id, { ma: p.ma, ten: p.ten }],
    ['POST', '/api/suppliers', { ma: 'FZ2', ten: 'x' }],
    ['PUT', '/api/suppliers/' + s.id, { ma: s.ma, ten: s.ten }],
    ['PUT', '/api/vouchers/PC001%2F09', { nguoiNhan: 'x' }],
    ['PUT', '/api/settings', { tenDonVi: 'x' }],
    ['POST', '/api/cost-groups', { ma: 'FZG', ten: 'x' }],
    ['POST', '/api/cost-items', { ma: 'FZI', ten: 'Hạng mục fuzz', maNhom: db.costGroups[0].ma }],
    ['POST', '/api/materials', { ma: 'FZM', ten: 'x' }],
    ['POST', '/api/houses', { ma: 'FZH', ten: 'x', maCT: p.ma }],
    ['POST', '/api/cost-slips', { header: { ngay: '2026-09-01', maCT: cost.maCT, maNCC: cost.maNCC, maHM: it.ma }, lines: [{ dienGiai: 'x', soLuong: 1, donGia: 1 }] }],
    ['PUT', '/api/cost-slips/' + cost.phieuId, { header: { ngay: '2026-09-01', maCT: cost.maCT, maNCC: cost.maNCC, maHM: it.ma }, lines: [{ dienGiai: 'x', soLuong: 1, donGia: 1 }] }],
    ['POST', '/api/costs', { ngay: '2026-09-01', maCT: cost.maCT, maNCC: cost.maNCC, maHM: it.ma, dienGiai: 'x', soLuong: 1, donGia: 1 }],
    ['PUT', '/api/costs/' + cost.id, { ngay: '2026-09-01', maCT: cost.maCT, maNCC: cost.maNCC, maHM: it.ma, dienGiai: 'x', soLuong: 1, donGia: 1 }],
    ['POST', '/api/costs/delete', { ids: [999999] }],
    ['POST', '/api/backups/restore', { name: 'ketoan-x.json' }],
    ['POST', '/api/reset', { confirm: 'sai' }],
    ['POST', '/api/reset-costs', { confirm: 'sai' }],
    ['POST', '/api/restore', { entries: [], projects: [], suppliers: [] }]
  ];
}

// các giá trị sai kiểu để thay vào từng trường
const BAD = [null, true, false, [], [1, 2], {}, { a: 1 }, '', ' ', 1e309, -1, 'abc', { toString: 'x' }, [[]], { $gt: '' }, '__proto__', 'constructor', 1.5e300, '\u0000'];

function mutations(body) {
  // trả về danh sách thân yêu cầu: mỗi trường lần lượt thay bằng giá trị sai; và các thân yêu cầu sai cấu trúc
  const out = [];
  (function walk(obj, pathKeys) {
    Object.keys(obj).forEach((k) => {
      BAD.forEach((bad) => {
        const copy = JSON.parse(JSON.stringify(body));
        let ref = copy;
        pathKeys.forEach((pk) => { ref = ref[pk]; });
        ref[k] = bad;
        out.push(copy);
      });
      if (obj[k] && typeof obj[k] === 'object') walk(obj[k], pathKeys.concat(k));
    });
  })(body, []);
  return out;
}

test('H4.1 API từ chối dữ liệu sai kiểu: không bao giờ trả 500, không sập, dữ liệu không đổi khi bị từ chối', { timeout: 600000 }, async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const db0 = await srv.db();
    const bad500 = [];
    let sent = 0; let changed = 0;
    for (const [method, url, body] of endpoints(db0)) {
      // thân yêu cầu có kiểu JSON khác hẳn object
      const raws = [Buffer.from('null'), Buffer.from('[]'), Buffer.from('123'), Buffer.from('"chuỗi"'), Buffer.from('true'), Buffer.from('{"__proto__":{"x":1}}'), Buffer.from('{hỏng')];
      for (const raw of raws.concat(mutations(body).map((b) => Buffer.from(JSON.stringify(b))))) {
        const before = JSON.stringify((await srv.call('GET', '/api/db')).json.db);
        const r = await srv.call(method, url, raw, { 'Content-Type': 'application/json' });
        sent++;
        if (r.status >= 500) bad500.push(method + ' ' + url + ' ' + raw.toString().slice(0, 120) + ' → ' + r.status + ' ' + r.body.toString().slice(0, 100));
        else if (r.status >= 400) {
          const after = JSON.stringify((await srv.call('GET', '/api/db')).json.db);
          if (before !== after && !/updatedAt/.test('')) { // updatedAt không đổi khi bị từ chối
            changed++;
            if (changed < 6) bad500.push('DỮ LIỆU ĐỔI dù bị từ chối (' + r.status + '): ' + method + ' ' + url + ' ' + raw.toString().slice(0, 120));
          }
        }
        if (bad500.length > 40) break;
      }
    }
    assert.deepEqual(bad500.slice(0, 15), [], bad500.length + ' lỗi / ' + sent + ' yêu cầu');
    assert.equal((await srv.call('GET', '/api/ping')).status, 200, 'server phải còn sống');
    assert.deepEqual(orphanErrors(await srv.db()), [], 'không được sinh dòng mồ côi');
  } finally { await srv.stop(); }
});

test('H4.2 đường dẫn API lạ / tên đối tượng hệ thống (constructor, __proto__, toString) không gây lỗi 500', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    for (const m of ['GET', 'POST', 'PUT', 'DELETE']) {
      for (const p of ['/api/constructor', '/api/constructor/1', '/api/__proto__', '/api/__proto__/1', '/api/toString', '/api/hasOwnProperty/2', '/api/valueOf',
        '/api/export/constructor', '/api/export/__proto__', '/api/vouchers/__proto__', '/api/cost-slips/abc', '/api/cost-slips/-1', '/api/costs/NaN', '/api/entries/1e3', '/api/projects/%00', '/api/', '/api']) {
        const r = await srv.call(m, p, m === 'GET' || m === 'DELETE' ? undefined : {});
        assert.ok(r.status < 500, m + ' ' + p + ' → ' + r.status + ' ' + r.body.toString().slice(0, 100));
      }
    }
    // không làm bẩn Object.prototype của server (kiểm tra gián tiếp: bản ghi mới không có trường lạ)
    await srv.call('PUT', '/api/vouchers/__proto__', { nguoiNhan: 'x' });
    await srv.call('PUT', '/api/vouchers/constructor', { nguoiNhan: 'x' });
    const r = await srv.ok('POST', '/api/entries', { ngay: '2026-09-01', noiDung: 'sau proto', chi: 1 });
    const e = r.db.entries.find((x) => x.id === r.id);
    assert.deepEqual(Object.keys(e).sort(), ['chi', 'createdAt', 'ghiChu', 'id', 'maDuAn', 'maNCC', 'ngay', 'nguoiNhan', 'noiDung', 'seq', 'soPhieu', 'thu', 'updatedAt']);
    assert.equal(({}).polluted, undefined);
  } finally { await srv.stop(); }
});

test('H4.3 tham số truy vấn lạ (chuỗi SQL, ký tự điều khiển, rất dài) an toàn; không có SQL nên không có tiêm SQL', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const evil = ["'; DROP TABLE entries;--", '" OR 1=1 --', '%27%20OR%20%271%27%3D%271', '\u0000\u0001', 'a'.repeat(100000), '../../../etc/passwd', '{{7*7}}', '${7*7}'];
    for (const v of evil) {
      const q = encodeURIComponent(v);
      for (const u of ['/api/export/ledger?q=' + q + '&duAn=' + q + '&ncc=' + q + '&loai=' + q, '/api/export/cost-ledger?q=' + q + '&ct=' + q + '&hm=' + q + '&vt=' + q, '/api/export/costs?ct=' + q,
        '/api/export/cost-debt?ct=' + q + '&to=' + q, '/api/vouchers/next?loai=' + q + '&ngay=' + q, '/api/export/voucher?so=' + q]) {
        let r;
        try { r = await srv.call('GET', u); } catch (e) { if (v.length > 50000) continue; throw e; } // URL 100 KB: Node cắt kết nối, chấp nhận
        assert.ok(r.status < 500 || (v.length > 50000 && r.status === 431), u.slice(0, 60) + ' → ' + r.status);
      }
    }
    const db = await srv.db();
    assert.equal(db.entries.length, 66); assert.equal(db.costs.length, 104);
    // mã có dấu nháy lưu được và tra lại đúng (không bị cắt/diễn giải)
    const r = await srv.ok('POST', '/api/suppliers', { ma: "O'Brien\"; DROP", ten: "Tên ' \" ; -- <b>" });
    const s = r.db.suppliers.find((x) => x.id === r.id);
    assert.equal(s.ma, "O'Brien\"; DROP"); assert.equal(s.ten, "Tên ' \" ; -- <b>");
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-02', noiDung: "'; DROP TABLE x;--", chi: 1, maNCC: s.ma });
    assert.equal((await srv.db()).entries.length, 67);
  } finally { await srv.stop(); }
});

test('H1.1 tiêu đề tải về không bị chèn dòng (CRLF) và tên tệp an toàn', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const so = encodeURIComponent('PC001/09\r\nX-Injected: 1');
    const r = await srv.call('GET', '/api/export/voucher?so=' + so);
    assert.ok(r.status < 500);
    assert.equal(r.headers['x-injected'], undefined);
    if (r.status === 200) assert.match(r.headers['content-disposition'], /filename="[\w.\-]+"/);
    const names = ['../../x', 'a\\b', 'PC001/09', 'Phiếu "lạ" <x>'];
    for (const n of names) {
      const r2 = await srv.call('GET', '/api/export/voucher?so=' + encodeURIComponent(n));
      if (r2.status === 200) assert.ok(!/[\\/]/.test((/filename="([^"]*)"/.exec(r2.headers['content-disposition']) || [, ''])[1]), 'tên tệp chứa dấu phân cách đường dẫn: ' + n);
    }
  } finally { await srv.stop(); }
});

test('H1.2 khôi phục / tải tệp: tên sao lưu dạng đường dẫn, liên kết tượng trưng, tệp lạ trong thư mục sao lưu không bị đọc', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const bdir = path.join(srv.dataDir, 'backups');
    fs.mkdirSync(bdir, { recursive: true });
    fs.writeFileSync(path.join(srv.dataDir, 'bi-mat.json'), JSON.stringify({ entries: [], projects: [], suppliers: [], bimat: true }));
    try { fs.symlinkSync(path.join(srv.dataDir, 'bi-mat.json'), path.join(bdir, 'ketoan-20200101-000000-lien-ket.json')); } catch (e) { /* hệ thống không cho tạo liên kết */ }
    const before = await srv.db();
    for (const name of ['../bi-mat.json', '..%2fbi-mat.json', '..\\bi-mat.json', 'ketoan-../bi-mat.json', 'ketoan-x/../../bi-mat.json', 'ketoan-\u0000.json', 'KETOAN-x.json', 'ketoan-x.json.exe']) {
      const r = await srv.call('POST', '/api/backups/restore', { name });
      assert.notEqual(r.status, 200, name);
      assert.ok(r.status < 500, name + ' → ' + r.status);
    }
    assert.deepEqual(await srv.db(), before);
    // danh sách sao lưu chỉ gồm tệp đúng mẫu tên
    fs.writeFileSync(path.join(bdir, 'khac.txt'), 'x');
    const list = (await srv.ok('GET', '/api/backups')).backups.map((b) => b.name);
    assert.ok(list.every((n) => /^ketoan-.*\.(db|json)$/.test(n)));
    // tệp tĩnh: bản sao lưu / dữ liệu không được phục vụ qua web
    for (const u of ['/data/ketoan.json', '/../data/ketoan.json', '/backups/x', '/ketoan.json', '/data/ketoan.db', '/ketoan.db', '/../ketoan.db', '/..%2fketoan.db', '/%2e%2e/data/ketoan.db']) {
      const r = await rawRequest({ port: srv.port, path: u, method: 'GET' });
      assert.ok(!/"entries"|SQLite format 3/.test(r.body.toString('latin1')), u + ' lộ dữ liệu');
    }
  } finally { await srv.stop(); }
});

test('H2.1 XSS qua lưu trữ: mọi trường văn bản chứa <script>, "><img onerror> được thoát đúng ở mọi màn hình, phiếu in, hộp thoại', { timeout: 300000 }, async () => {
  let chromium = null;
  try { chromium = require('playwright').chromium; } catch (e) {
    try { chromium = require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')).chromium; } catch (e2) { /* không có */ }
  }
  if (!chromium) return; // cần Playwright
  const PAY = ['<script>window.__xss=1</script>', '"><img src=x onerror="window.__xss=2">', "'><svg onload=window.__xss=3>", '<iframe srcdoc="<script>parent.__xss=4</script>"></iframe>', '</textarea></script><b id=xssb>hack</b>', 'javascript:window.__xss=5'];
  const srv = await startServer({ seed: V2 });
  const pay = (i, tag) => PAY[i % PAY.length] + tag;
  try {
    // dữ liệu độc vào mọi nơi có thể
    const db0 = await srv.db();
    const ct = await srv.ok('POST', '/api/projects', { ma: 'XSS_CT', ten: pay(0, ' tên CT'), ghiChu: pay(1, ' gc'), diaChi: pay(2, ' dc'), nganSach: 1000000 });
    await srv.ok('POST', '/api/suppliers', { ma: 'XSS_NCC', ten: pay(1, ' tên NCC'), loai: pay(2, ' loại'), sdt: pay(3, ' sdt'), diaChi: pay(4, ' dc'), ghiChu: pay(5, ' gc') });
    await srv.ok('POST', '/api/cost-groups', { ma: 'XSS_G', ten: pay(2, ' nhóm'), ghiChu: pay(3, '') });
    await srv.ok('POST', '/api/cost-items', { ma: 'XSS_HM', ten: pay(3, ' hạng mục'), maNhom: 'XSS_G', ghiChu: pay(4, '') });
    await srv.ok('POST', '/api/materials', { ma: 'XSS_VT', ten: pay(4, ' vật tư'), dvt: pay(5, ''), maHM: 'XSS_HM', ghiChu: pay(0, '') });
    await srv.ok('POST', '/api/houses', { ma: 'XSS_NHA', ten: pay(5, ' nhà'), maCT: 'XSS_CT', chuNha: pay(0, ' chủ'), ghiChu: pay(1, '') });
    await srv.ok('POST', '/api/cost-slips', { header: { ngay: '2026-09-10', maCT: 'XSS_CT', maNha: 'XSS_NHA', maNCC: 'XSS_NCC', soPhieu: pay(2, ' sp'), maHM: 'XSS_HM' },
      lines: [{ maVT: 'XSS_VT', dienGiai: pay(3, ' diễn giải'), soLuong: 2, donGia: 1000, ghiChu: pay(4, ' ghi chú dòng') }] });
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-10', soPhieu: 'PC777/09', noiDung: pay(4, ' nội dung'), chi: 5000, maDuAn: 'XSS_CT', maNCC: 'XSS_NCC', nguoiNhan: pay(5, ' nhận'), ghiChu: pay(0, ' gc') });
    await srv.ok('PUT', '/api/vouchers/PC777%2F09', { nguoiNhan: pay(1, ' n'), diaChi: pay(2, ' đc'), lyDo: pay(3, ' lý do'), hinhThuc: pay(4, ''), kemTheo: pay(5, '') });
    await srv.ok('PUT', '/api/settings', { tenDonVi: pay(0, ' đv'), diaChi: pay(1, ' đc'), giamDoc: pay(2, ''), keToanTruong: pay(3, ''), thuQuy: pay(4, ''), nguoiLap: pay(5, ''), hienKeToanTruong: true });
    const browser = await chromium.launch();
    try {
      const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
      const dialogs = [];
      page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss(); });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(srv.base + '/');
      await page.waitForFunction(() => document.querySelector('#view') && document.querySelector('#view').innerText.length > 10);
      const routes = ['tong-quan', 'so-thu-chi', 'phieu', 'du-an', 'ncc', 'tong-hop-ncc', 'cai-dat', 'cp-tong-hop', 'cp-nhap', 'cp-so', 'cp-chi-tiet', 'cp-cong-no', 'cp-gia', 'cp-danh-muc'];
      for (const r of routes) {
        await page.evaluate((h) => { location.hash = '#/' + h; }, r);
        await page.waitForTimeout(300);
        // mở rộng các cây / chọn dòng có dữ liệu độc để chắc chắn được vẽ
        const flag = await page.evaluate(() => ({ xss: window.__xss || 0, injected: !!document.querySelector('#xssb, #view script, #view iframe, #view img[src=x], #view svg[onload]') }));
        assert.equal(flag.xss, 0, 'mã độc đã chạy ở màn ' + r);
        assert.equal(flag.injected, false, 'phần tử độc đã chèn vào DOM ở màn ' + r);
      }
      // phiếu in và hộp thoại sửa dòng
      await page.evaluate(() => { location.hash = '#/phieu'; });
      await page.waitForSelector('#ph-q');
      await page.fill('#ph-q', 'PC777');
      await page.waitForTimeout(300);
      await page.locator('#ph-list > *').first().click();
      await page.waitForSelector('#ph-paper .vc');
      await page.evaluate(() => { window.print = () => {}; });
      await page.click('[data-act=print]');
      await page.waitForTimeout(300);
      const paper = await page.$eval('#ph-paper', (e) => e.innerHTML);
      assert.ok(!/<script|<img src=x|<iframe|<svg onload/i.test(paper), 'phiếu chứa phần tử độc');
      assert.ok((await page.$eval('#print-root', (e) => e.innerText)).includes('<script>'), 'văn bản độc phải hiện nguyên dạng (đã thoát), không bị ăn mất');
      // sổ chi phí: sửa dòng
      await page.evaluate(() => { location.hash = '#/cp-so'; });
      await page.waitForSelector('#cl-body tr[data-id]');
      await page.fill('#cl-q', 'diễn giải');
      await page.waitForTimeout(300);
      await page.locator('#cl-body tr[data-id] [data-act=edit]').first().click();
      await page.waitForSelector('#cl-form');
      await page.waitForTimeout(150);
      const formHtml = await page.$eval('#cl-form', (e) => e.innerHTML);
      assert.ok(!/<script|<img src=x|<iframe|<svg onload/i.test(formHtml), 'form sửa chứa phần tử độc');
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => window.__xss || 0), 0);
      assert.deepEqual(dialogs, [], 'không được có hộp thoại alert từ mã độc');
      assert.deepEqual(errors.filter((e) => !/status of/.test(e)), []);
      // khi xuất Excel: chuỗi độc được ghi như văn bản
      const wb = await X.loadWb((await srv.call('GET', '/api/export/costs')).body);
      let found = false;
      wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => { const v = X.cellVal(c); if (typeof v === 'string' && v.includes('<script>')) found = true; })));
      assert.ok(found, 'chuỗi độc phải được giữ nguyên dạng văn bản trong Excel');
    } finally { await browser.close(); }
  } finally { await srv.stop(); }
});

test('H2.2 tiêm công thức Excel (=, +, -, @ đầu ô): xuất ra là văn bản, không thành công thức; nhập vào không chạy công thức lạ', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const db0 = await srv.db();
    const PAYS = ['=HYPERLINK("http://evil","x")', '+cmd|"/c calc"!A1', '-2+3', '@SUM(1,1)', '=1+1', '\t=1+1'];
    await srv.ok('POST', '/api/suppliers', { ma: 'FX_NCC', ten: PAYS[0] });
    const cost = db0.costs[0];
    await srv.ok('POST', '/api/cost-slips', { header: { ngay: '2026-09-11', maCT: cost.maCT, maNCC: 'FX_NCC', soPhieu: PAYS[1], maHM: db0.costItems[0].ma },
      lines: PAYS.map((p, i) => ({ dienGiai: p, soLuong: 1, donGia: 1000 + i, ghiChu: p })) });
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-11', noiDung: PAYS[0], chi: 1, nguoiNhan: PAYS[3], ghiChu: PAYS[2], soPhieu: 'PC888/09' });
    for (const u of ['/api/export/costs', '/api/export/full', '/api/export/cost-ledger', '/api/export/ledger', '/api/export/suppliers']) {
      const buf = (await srv.call('GET', u)).body;
      const wb = await X.loadWb(buf);
      const formulas = [];
      wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => {
        if (X.hasFormula(c) && /HYPERLINK\("http:\/\/evil|cmd\||@SUM\(1,1\)/.test(JSON.stringify(c.value))) formulas.push(ws.name + '!' + c.address);
      })));
      assert.deepEqual(formulas, [], u + ' ghi chuỗi người dùng thành công thức');
      // kiểm tra XML thô: không có <f> chứa chuỗi độc
      const zip = await X.JSZip.loadAsync(buf);
      for (const n of Object.keys(zip.files).filter((f) => /worksheets\/sheet\d+\.xml$/.test(f))) {
        const xml = await zip.file(n).async('string');
        assert.ok(!/<f>[^<]*(HYPERLINK\(&quot;http:\/\/evil|cmd\|)/.test(xml), u + ' ' + n);
      }
    }
    // nhập lại: chuỗi bắt đầu bằng "=" trong ô văn bản không được tính
    const exp = (await srv.call('GET', '/api/export/costs')).body;
    const dst = await startServer({});
    try {
      const r = await dst.call('POST', '/api/import?mode=replace&soQuy=1', exp);
      assert.equal(r.status, 200, r.body.toString().slice(0, 200));
      const d = await dst.db();
      assert.ok(d.costs.some((c) => c.dienGiai === PAYS[0]), 'chuỗi "=HYPERLINK…" phải vào đúng là văn bản');
    } finally { await dst.stop(); }
  } finally { await srv.stop(); }
});

test('H3 giới hạn kích thước: thân yêu cầu quá lớn bị từ chối mà không sập (413); chuỗi dài bị cắt đúng ngưỡng', async () => {
  const srv = await startServer({});
  try {
    const big = Buffer.alloc(51 * 1024 * 1024, 97);
    let st = null;
    try { st = (await srv.call('POST', '/api/entries', big, { 'Content-Type': 'application/json' })).status; } catch (e) { st = 'đứt kết nối'; }
    assert.ok(st === 413 || st === 'đứt kết nối', 'nhận ' + st);
    assert.equal((await srv.call('GET', '/api/ping')).status, 200, 'server phải còn sống');
    const r = await srv.ok('POST', '/api/suppliers', { ma: 'L'.repeat(5000), ten: 'T'.repeat(5000), ghiChu: 'G'.repeat(9999) });
    const s = r.db.suppliers.find((x) => x.id === r.id);
    assert.equal(s.ma.length, 60); assert.equal(s.ten.length, 300); assert.equal(s.ghiChu.length, 1000);
  } finally { await srv.stop(); }
});

test('H5 tiêu đề bảo mật: CSP chặn mã chạy thêm và nhúng khung, nosniff, không gửi Referer; ứng dụng vẫn chạy đủ dưới CSP', { timeout: 120000 }, async () => {
  const srv = await startServer({ seed: V2 });
  try {
    for (const u of ['/', '/index.html', '/js/app.js', '/css/app.css', '/api/db', '/api/ping', '/vendor/fonts/archivo-latin-standard-normal.woff2', '/khong-co-tep']) {
      const r = await srv.call('GET', u);
      const h = r.headers;
      assert.equal(h['x-content-type-options'], 'nosniff', u);
      assert.equal(h['x-frame-options'], 'DENY', u);
      assert.equal(h['referrer-policy'], 'no-referrer', u);
      assert.match(h['content-security-policy'] || '', /default-src 'self'/, u);
      assert.match(h['content-security-policy'], /frame-ancestors 'none'/, u);
      assert.match(h['content-security-policy'], /script-src 'self'/, u);
      assert.ok(!/script-src[^;]*unsafe-inline/.test(h['content-security-policy']) && !/unsafe-eval/.test(h['content-security-policy']), 'CSP không được nới script: ' + u);
    }
    let chromium = null;
    try { chromium = require('playwright').chromium; } catch (e) {
      try { chromium = require(path.join(require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')).chromium; } catch (e2) { /* không có */ }
    }
    if (!chromium) return;
    const browser = await chromium.launch();
    try {
      const page = await (await browser.newContext()).newPage();
      const violations = [];
      await page.exposeFunction('__violation', (d) => violations.push(d));
      await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => window.__violation(e.violatedDirective + ' ' + e.blockedURI)); });
      await page.goto(srv.base + '/#/cp-so');
      await page.waitForSelector('#cl-body tr[data-id]');
      // mã chèn vào trang (giả lập lỗ hổng XSS) không chạy được
      const ran = await page.evaluate(async () => {
        window.__p = 0;
        const d = document.createElement('div');
        d.innerHTML = '<img src="x" onerror="window.__p=1"><svg onload="window.__p=2"></svg>';
        document.body.appendChild(d);
        const s = document.createElement('script'); s.textContent = 'window.__p=3'; document.body.appendChild(s);
        await new Promise((r) => setTimeout(r, 400));
        return window.__p;
      });
      assert.equal(ran, 0, 'CSP phải chặn mã chèn thêm');
      assert.ok(violations.length >= 2, 'phải ghi nhận vi phạm CSP: ' + JSON.stringify(violations));
      // nhưng ứng dụng bình thường không vi phạm CSP nào: đi qua các màn hình
      violations.length = 0;
      for (const r of ['tong-quan', 'so-thu-chi', 'phieu', 'cp-tong-hop', 'cp-nhap', 'cp-chi-tiet', 'cp-cong-no', 'cp-gia', 'cp-danh-muc', 'cai-dat']) {
        await page.evaluate((h) => { location.hash = '#/' + h; }, r);
        await page.waitForTimeout(250);
      }
      await page.keyboard.press('F2');
      await page.waitForSelector('#entry-form');
      assert.deepEqual(violations, [], 'ứng dụng tự vi phạm CSP của chính nó');
    } finally { await browser.close(); }
  } finally { await srv.stop(); }
});
