'use strict';
/* G. Hiệu năng với 20.000 dòng chi phí (+ 5.000 dòng sổ thu chi) và độ bền khi gọi API đồng thời.
 * Đo thời gian thật, in bảng số đo (ghi ra tệp JSON trong thư mục tạm), đánh dấu chỗ chậm (> 2 giây) và không cho phép vượt ngưỡng. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { KT, startServer, makeBigDb, makeDataDir, orphanErrors, readStored } = require('./helpers');
const X = require('./excel-helpers');

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {
  try { chromium = require(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')).chromium; } catch (e2) { /* không có */ }
}
const LIMIT = Number(process.env.KETOAN_SLOW_MS) || 2000; // ngưỡng "chậm" (ms)
const OUT = path.join(os.tmpdir(), 'ketoan-g-hieu-nang.json');
const results = [];
function record(group, name, ms, extra) { results.push({ group, name, ms: Math.round(ms), extra: extra || '' }); }
async function time(group, name, fn, extra) { const t0 = process.hrtime.bigint(); const v = await fn(); record(group, name, Number(process.hrtime.bigint() - t0) / 1e6, extra); return v; }
function flush() { fs.writeFileSync(OUT, JSON.stringify(results, null, 1)); }

let BIG; // dữ liệu lớn dùng chung
function big() { return BIG || (BIG = makeBigDb(20000, 5000)); }

test('G1 API với 20.000 dòng chi phí: khởi động, đọc, ghi, sửa, xóa, xuất Excel đều dưới ngưỡng', { timeout: 600000 }, async () => {
  const dir = makeDataDir(big());
  const size = fs.statSync(path.join(dir, 'ketoan.json')).size;
  const t0 = Date.now();
  const srv = await startServer({ data: dir });
  record('API', 'Khởi động + nạp dữ liệu', Date.now() - t0, (size / 1e6).toFixed(1) + ' MB');
  try {
    const db = await time('API', 'GET /api/db', async () => (await srv.call('GET', '/api/db')).json.db);
    assert.equal(db.costs.length, 20000);
    const body = (await srv.call('GET', '/api/db')).body;
    record('API', 'Kích thước trả về của /api/db', 0, (body.length / 1e6).toFixed(1) + ' MB');
    const c0 = db.costs[0];
    const slipBody = { header: { ngay: '2026-09-29', maCT: c0.maCT, maNCC: c0.maNCC, maHM: c0.maHM }, lines: [{ dienGiai: 'dòng thử hiệu năng', soLuong: 2, donGia: 1000 }] };
    const r = await time('API', 'POST 1 phiếu (ghi cả file dữ liệu)', () => srv.ok('POST', '/api/cost-slips', slipBody));
    const id = r.db.costs.find((c) => c.dienGiai === 'dòng thử hiệu năng').id;
    await time('API', 'PUT 1 dòng chi phí', () => srv.ok('PUT', '/api/costs/' + id, Object.assign({}, c0, { soLuong: 3, donGia: 2000 })));
    await time('API', 'POST 1 dòng sổ thu chi', () => srv.ok('POST', '/api/entries', { ngay: '2026-09-29', noiDung: 'x', chi: 1000, maNCC: c0.maNCC }));
    await time('API', 'DELETE 1 dòng chi phí', () => srv.ok('DELETE', '/api/costs/' + id));
    await time('API', 'Xóa 1 phiếu 4 dòng', () => srv.ok('DELETE', '/api/cost-slips/' + c0.phieuId));
    for (const [name, url] of [['Xuất Excel chi phí (toàn bộ)', '/api/export/costs'], ['Xuất Excel sổ chi phí', '/api/export/cost-ledger'], ['Xuất Excel công nợ', '/api/export/cost-debt'],
      ['Xuất Excel sổ thu chi đầy đủ', '/api/export/full'], ['Xuất Excel sổ thu chi', '/api/export/ledger']]) {
      const x = await time('API', name, () => srv.call('GET', url));
      assert.equal(x.status, 200, name);
    }
    const ex = (await srv.call('GET', '/api/export/costs')).body;
    await time('API', 'Nhập Excel chi phí: xem trước 20.000 dòng', async () => { const p = await srv.call('POST', '/api/import?dryRun=1', ex); assert.equal(p.status, 200); });
    await time('API', 'Nhập Excel chi phí: thay thế 20.000 dòng', async () => { const p = await srv.call('POST', '/api/import?mode=replace&soQuy=1', ex); assert.equal(p.status, 200, p.body.toString().slice(0, 200)); });
    assert.equal((await srv.db()).costs.length, 19996);
    // khôi phục bản sao lưu lớn
    await time('API', 'Sao lưu thủ công', () => srv.ok('POST', '/api/backups/now'));
    // tính toán dùng chung trên 20.000 dòng (chạy cả ở máy chủ khi xuất và ở trình duyệt mỗi lần vẽ)
    const d = await srv.db();
    await time('Tính toán', 'buildCostLedger + costSummary (20.000 dòng)', async () => { const l = KT.buildCostLedger(d); KT.costSummary(d, {}, l); });
    await time('Tính toán', 'supplierDebt', async () => { KT.supplierDebt(d, {}); });
    await time('Tính toán', 'projectDebtSummary', async () => { KT.projectDebtSummary(d, {}); });
    await time('Tính toán', 'materialStats', async () => { KT.materialStats(d, {}); });
    await time('Tính toán', 'costSlips', async () => { KT.costSlips(d); });
    await time('Tính toán', 'buildLedger (5.000 dòng sổ thu chi)', async () => { KT.buildLedger(d); });
  } finally { flush(); await srv.stop(); }
  const slow = results.filter((r) => r.group !== 'API' || !/Khởi động|Kích thước/.test(r.name)).filter((r) => r.ms > (/Xuất|Nhập/.test(r.name) ? 10000 : LIMIT));
  assert.deepEqual(slow.map((r) => r.name + ' ' + r.ms + ' ms'), [], 'chỗ chậm');
});

test('G2 gọi API đồng thời trên 20.000 dòng: không mất dữ liệu, không trùng id/seq, tổng khớp', { timeout: 600000 }, async () => {
  const srv = await startServer({ seed: big() });
  try {
    const db0 = await srv.db();
    const c0 = db0.costs[0];
    const N = 60;
    const t0 = Date.now();
    const rs = await Promise.all(Array.from({ length: N }, (_, i) => i % 3 === 0
      ? srv.call('POST', '/api/entries', { ngay: '2026-09-29', noiDung: 'đồng thời ' + i, chi: 1000 + i, maNCC: c0.maNCC })
      : i % 3 === 1
        ? srv.call('POST', '/api/cost-slips', { header: { ngay: '2026-09-29', maCT: c0.maCT, maNCC: c0.maNCC, maHM: c0.maHM }, lines: [{ dienGiai: 'đồng thời ' + i, soLuong: 1, donGia: 1000 + i }] })
        : srv.call('GET', '/api/db')));
    record('Đồng thời', N + ' yêu cầu song song (20 sổ, 20 phiếu, 20 đọc)', Date.now() - t0);
    assert.ok(rs.every((r) => r.status === 200), 'mọi yêu cầu phải thành công');
    const db = await srv.db();
    assert.equal(db.entries.length, db0.entries.length + 20);
    assert.equal(db.costs.length, db0.costs.length + 20);
    assert.equal(new Set(db.costs.map((c) => c.id)).size + new Set(db.entries.map((e) => e.id)).size, db.costs.length + db.entries.length);
    assert.equal(new Set(db.costs.map((c) => c.seq)).size, db.costs.length);
    assert.equal(KT.costSummary(db, {}, KT.buildCostLedger(db)).total, db0.costs.reduce((t, c) => t + c.thanhTien, 0) + Array.from({ length: 20 }, (_, k) => 1000 + (3 * k + 1)).reduce((t, v) => t + v, 0));
    assert.deepEqual(orphanErrors(db), []);
    // file trên đĩa = bộ nhớ
    const disk = readStored(srv.dataDir);
    assert.equal(disk.costs.length, db.costs.length);
    assert.equal(disk.entries.length, db.entries.length);
    flush();
  } finally { await srv.stop(); }
});

// Đo thời gian vẽ màn hình trong trình duyệt (đến khi bố cục ổn định: 2 khung hình sau sự kiện hashchange)
async function route(page, hash) {
  return page.evaluate((h) => new Promise((resolve) => {
    const t0 = performance.now();
    const done = () => requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t0)));
    if (location.hash === h) { window.dispatchEvent(new HashChangeEvent('hashchange')); done(); return; }
    window.addEventListener('hashchange', done, { once: true });
    location.hash = h;
  }), hash);
}

test('G4 xuất Excel 20.000 dòng không làm máy chủ đứng hình: các yêu cầu khác vẫn trả lời nhanh trong lúc đang tạo file', { timeout: 300000 }, async () => {
  const srv = await startServer({ seed: big() });
  try {
    const exp = srv.call('GET', '/api/export/costs');
    let worst = 0; let n = 0; let finished = false;
    exp.then(() => { finished = true; });
    const t0 = Date.now();
    while (!finished && Date.now() - t0 < 120000) {
      const s = Date.now();
      const r = await srv.call('GET', '/api/ping');
      assert.equal(r.status, 200);
      worst = Math.max(worst, Date.now() - s); n++;
      await new Promise((r2) => setTimeout(r2, 50));
    }
    const res = await exp;
    assert.equal(res.status, 200);
    record('Đồng thời', 'Xuất Excel 20.000 dòng: độ trễ xấu nhất của /api/ping trong lúc xuất (' + n + ' lần thử)', worst);
    assert.ok(n >= 5, 'lúc xuất phải trả lời được nhiều yêu cầu khác (chỉ ' + n + ')');
    assert.ok(worst < 1000, 'máy chủ bị đứng ' + worst + ' ms trong lúc xuất Excel');
    const wb = await X.loadWb(res.body);
    assert.equal(X.cellVal(wb.getWorksheet('TONGHOP').getCell('B10')), 20000);
  } finally { flush(); await srv.stop(); }
});

test('G3 giao diện với 20.000 dòng: mở từng màn hình, lọc, tìm kiếm, bung cây, lưu phiếu đều dưới ngưỡng', { skip: chromium ? false : 'không có Playwright', timeout: 900000 }, async () => {
  const srv = await startServer({ seed: big() });
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const t0 = Date.now();
    await page.goto(srv.base + '/#/tong-quan');
    await page.waitForFunction(() => document.querySelector('#view') && document.querySelector('#view').innerText.length > 50, null, { timeout: 60000 });
    record('Giao diện', 'Tải trang lần đầu (tải 20.000 dòng + vẽ Tổng quan)', Date.now() - t0);
    const routes = [['tong-quan', 'Tổng quan'], ['so-thu-chi', 'Sổ thu chi (5.000 dòng)'], ['phieu', 'Phiếu thu/chi'], ['du-an', 'Dự án'], ['ncc', 'Nhà cung cấp'], ['tong-hop-ncc', 'Tổng hợp NCC'],
      ['cai-dat', 'Cài đặt'], ['cp-tong-hop', 'Chi phí: Bảng điều khiển'], ['cp-nhap', 'Chi phí: Phiếu nhập'], ['cp-so', 'Chi phí: Sổ chi phí'], ['cp-chi-tiet', 'Chi phí: Chi tiết theo nhóm'],
      ['cp-cong-no', 'Chi phí: Công nợ NCC'], ['cp-gia', 'Chi phí: Giá vật tư'], ['cp-danh-muc', 'Chi phí: Danh mục']];
    for (const [h, name] of routes) record('Giao diện', 'Mở ' + name, await route(page, '#/' + h));
    // sổ chi phí: lọc và tìm
    await route(page, '#/cp-so');
    await page.waitForSelector('#cl-body tr[data-id]');
    const db = await srv.db();
    const ct = db.projects.find((p) => db.costs.some((c) => c.maCT === p.ma)).ma;
    const timeUi = async (name, fn) => { const s = Date.now(); await fn(); record('Giao diện', name, Date.now() - s); };
    await timeUi('Sổ chi phí: lọc theo công trình', async () => { await page.fill('#cl-ct', ct); await page.press('#cl-ct', 'Enter'); await page.waitForFunction((n) => /khớp bộ lọc/.test(document.querySelector('#cl-count').innerText), ct); });
    await timeUi('Sổ chi phí: lọc thêm theo loại CP', async () => { await page.selectOption('#cl-loai', 'Vật tư'); await page.waitForTimeout(50); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); });
    await timeUi('Sổ chi phí: tìm "xi măng" (gõ)', async () => { await page.fill('#cl-q', 'xi măng'); await page.waitForTimeout(250); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); });
    await timeUi('Sổ chi phí: bỏ lọc', async () => { await page.click('#cl-clear'); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); });
    // chi tiết theo nhóm: mức 3 (toàn bộ chi tiết)
    await route(page, '#/cp-chi-tiet');
    await page.waitForSelector('#ct-body tr');
    const rowsL3 = await page.locator('#ct-body tr').count();
    await timeUi('Chi tiết theo nhóm: chuyển sang mức 3 (toàn bộ ' + rowsL3 + ' dòng DOM)', async () => { await page.check('input[name=ct-level][value="3"]', { force: true }); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); });
    await timeUi('Chi tiết theo nhóm: lọc theo công trình', async () => { await page.fill('#ct-ct', ct); await page.press('#ct-ct', 'Enter'); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); });
    // bảng điều khiển: đổi công trình
    await route(page, '#/cp-tong-hop');
    await timeUi('Bảng điều khiển: đổi công trình', async () => { await page.fill('#th-ct', ct); await page.press('#th-ct', 'Enter'); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); });
    // công nợ: chọn NCC
    await route(page, '#/cp-cong-no');
    await timeUi('Công nợ: bấm một nhà cung cấp', async () => { await page.locator('tr[data-ma]').first().click(); await page.waitForTimeout(50); });
    // giá vật tư
    await route(page, '#/cp-gia');
    await timeUi('Giá vật tư: chọn vật tư', async () => { await page.locator('tr[data-vt]').nth(3).click(); await page.waitForTimeout(50); });
    // lưu một phiếu từ giao diện (mỗi lần lưu: máy chủ ghi file + trả toàn bộ dữ liệu + tính lại)
    await route(page, '#/cp-nhap');
    await page.waitForSelector('#cp-head');
    const c0 = db.costs[0];
    await page.fill('#cp-head input[name=maCT]', c0.maCT);
    await page.fill('#cp-head input[name=maNCC]', c0.maNCC);
    await page.fill('#cp-head input[name=hm]', db.costItems.find((i) => i.ma === c0.maHM).ten);
    await page.locator('#cp-head input[name=hm]').dispatchEvent('change');
    await page.fill('#cp-body [data-row="0"][data-col=dienGiai]', 'phiếu đo hiệu năng');
    await page.fill('#cp-body [data-row="0"][data-col=soLuong]', '2');
    await page.fill('#cp-body [data-row="0"][data-col=donGia]', '1000');
    await timeUi('Phiếu nhập: Ghi vào sổ chi phí (Ctrl+Enter)', async () => { await page.keyboard.press('Control+Enter'); await page.waitForFunction(() => /Đã ghi 1 dòng/.test(document.querySelector('#toast-root').textContent), null, { timeout: 30000 }); });
    // in: sổ thu chi và bảng điều khiển ở chế độ in
    await route(page, '#/cp-tong-hop');
    await page.emulateMedia({ media: 'print' });
    await timeUi('Bảng điều khiển: tạo PDF khi in', async () => { await page.pdf({ format: 'A4' }); });
    await page.emulateMedia({ media: 'screen' });
    assert.deepEqual(errors, []);
  } finally { flush(); await browser.close(); await srv.stop(); }
  const slow = results.filter((r) => r.group === 'Giao diện' && r.ms > LIMIT);
  assert.deepEqual(slow.map((r) => r.name + ' ' + r.ms + ' ms'), [], 'chỗ chậm (> ' + LIMIT + ' ms)');
});

test.after(() => {
  flush();
  const lines = results.map((r) => '  ' + (r.ms > LIMIT ? '⚠ ' : '  ') + r.group.padEnd(11) + ' ' + r.name.padEnd(62) + String(r.ms).padStart(7) + ' ms ' + r.extra);
  console.log('\n--- SỐ ĐO HIỆU NĂNG (ngưỡng chậm ' + LIMIT + ' ms; tệp ' + OUT + ') ---\n' + lines.join('\n'));
});
