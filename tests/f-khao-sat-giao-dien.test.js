'use strict';
/* F. Khảo sát giao diện: đi qua từng màn hình và từng nút với dữ liệu trống / 1 dòng / đầy đủ; cửa sổ hẹp - rộng; xem trước khi in; font tiếng Việt */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { KT, startServer, readJsonFile } = require('./helpers');
const { chromium, SKIP, settle } = require('./ui-helpers');

const V2 = path.join(__dirname, 'fixtures', 'ketoan-v2-hien-tai.json');
const ROUTES = ['tong-quan', 'so-thu-chi', 'phieu', 'du-an', 'ncc', 'tong-hop-ncc', 'cai-dat', 'cp-tong-hop', 'cp-nhap', 'cp-so', 'cp-chi-tiet', 'cp-cong-no', 'cp-gia', 'cp-danh-muc'];
const SHOTS = path.join(os.tmpdir(), 'ketoan-ui-shots');

async function browserPage(srv, viewport) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.print = () => { window.__printCalls = (window.__printCalls || 0) + 1; }; });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of (400|404)/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('download', (d) => { d.cancel().catch(() => {}); });
  await page.goto(srv.base + '/');
  await page.waitForFunction(() => document.querySelector('#view') && document.querySelector('#view').innerText.trim().length > 5, null, { timeout: 30000 });
  return { browser, page, errors };
}

// Trạng thái dữ liệu
async function makeServer(kind) {
  if (kind === 'day-du') return startServer({ seed: V2 });
  const srv = await startServer({});
  if (kind === 'mot-dong') {
    await srv.ok('POST', '/api/projects', { ma: 'CT1', ten: 'Công trình duy nhất' });
    await srv.ok('POST', '/api/suppliers', { ma: 'S1', ten: 'Nhà cung cấp duy nhất' });
    const db = await srv.db();
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-01', soPhieu: 'PC001/09', noiDung: 'Một dòng duy nhất', chi: 100000, maDuAn: 'CT1', maNCC: 'S1' });
    await srv.ok('POST', '/api/cost-slips', { header: { ngay: '2026-09-02', maCT: 'CT1', maNCC: 'S1', maHM: db.costItems[0].ma }, lines: [{ dienGiai: 'Một dòng chi phí', soLuong: 1, donGia: 250000 }] });
  }
  return srv;
}

const CONTROLS = 'button, a[href], [data-act], [role=button], [role=link], tr.clickable, .stat-link, input[type=checkbox], input[type=radio], summary, label.seg-item';
// nút có tác dụng phụ không hồi phục được hoặc thoát khỏi ứng dụng
const SKIP_CTRL = /^(javascript:|mailto:|http)/;

async function pressAll(page, errors, route, state, report) {
  await page.evaluate((h) => { location.hash = '#/' + h; }, route);
  await page.waitForTimeout(250);
  await settle(page);
  const view0 = (await page.$eval('#view', (e) => e.innerText.trim())).length;
  if (view0 < 5) report.blank.push(state + ' ' + route + ': màn hình trắng');
  const total = await page.locator('#view ' + CONTROLS.split(', ').join(', #view ')).count();
  const max = Math.min(total, 45);
  for (let i = 0; i < max; i++) {
    const loc = page.locator('#view ' + CONTROLS.split(', ').join(', #view ')).nth(i);
    if (!(await loc.count()) || !(await loc.isVisible().catch(() => false)) || !(await loc.isEnabled().catch(() => false))) continue;
    const label = await loc.evaluate((e) => (e.getAttribute('data-act') || e.getAttribute('aria-label') || e.getAttribute('title') || e.innerText || e.tagName).toString().trim().slice(0, 40).replace(/\s+/g, ' ') + ' <' + e.tagName.toLowerCase() + (e.getAttribute('href') ? ' ' + e.getAttribute('href') : '') + '>').catch(() => '?');
    const href = await loc.getAttribute('href').catch(() => null);
    if (href && SKIP_CTRL.test(href)) continue;
    const errs0 = errors.length;
    // quan sát: có thay đổi gì sau cú bấm không (DOM, hộp thoại, địa chỉ, yêu cầu mạng, tải về)
    await page.evaluate(() => {
      window.__mut = 0; window.__req = 0;
      if (window.__mo) window.__mo.disconnect();
      window.__mo = new MutationObserver((m) => { window.__mut += m.length; });
      window.__mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      if (!window.__fetchPatched) { const of = window.fetch; window.fetch = function () { window.__req++; return of.apply(this, arguments); }; window.__fetchPatched = true; }
    });
    const hash0 = await page.evaluate(() => location.hash);
    const dl = page.waitForEvent('download', { timeout: 300 }).then(() => true, () => false);
    try { await loc.click({ timeout: 3000, noWaitAfter: true }); } catch (e) { report.unclickable.push(state + ' ' + route + ' #' + i + ' ' + label + ': ' + e.message.split('\n')[0]); continue; }
    await page.waitForTimeout(120);
    const changed = await page.evaluate(() => ({ mut: window.__mut, req: window.__req, hash: location.hash, modal: !!document.querySelector('#modal-root .modal'), print: window.__printCalls || 0 }));
    const downloaded = await dl;
    if (!changed.mut && !changed.req && changed.hash === hash0 && !changed.modal && !downloaded && !changed.print) report.dead.push(state + ' ' + route + ' #' + i + ' ' + label);
    // đóng hộp thoại, quay lại màn hình đang khảo sát
    for (let k = 0; k < 3 && await page.locator('#modal-root .modal').count(); k++) { await page.keyboard.press('Escape'); await page.waitForTimeout(220); }
    if (errors.length > errs0) report.errors.push(state + ' ' + route + ' #' + i + ' ' + label + ' → ' + errors.slice(errs0).join(' | '));
    if ((await page.evaluate(() => location.hash)) !== '#/' + route) {
      await page.evaluate((h) => { location.hash = '#/' + h; }, route);
      await page.waitForTimeout(200);
    }
    const len = await page.$eval('#view', (e) => e.innerText.trim().length).catch(() => 0);
    if (len < 5) report.blank.push(state + ' ' + route + ' #' + i + ' ' + label + ': màn hình trắng sau khi bấm');
    report.pressed++;
  }
}

test('F8 đi qua từng màn hình và từng nút với dữ liệu trống, 1 dòng và đầy đủ: không lỗi console, không màn hình trắng, không nút chết', { skip: SKIP, timeout: 1500000 }, async () => {
  const report = { pressed: 0, blank: [], errors: [], dead: [], unclickable: [] };
  for (const state of ['trong', 'mot-dong', 'day-du']) {
    const srv = await makeServer(state);
    const { browser, page, errors } = await browserPage(srv);
    try {
      for (const r of ROUTES) await pressAll(page, errors, r, state, report);
      // mọi ô chọn: thử từng lựa chọn
      for (const r of ROUTES) {
        await page.evaluate((h) => { location.hash = '#/' + h; }, r);
        await page.waitForTimeout(250);
        const n = await page.locator('#view select').count();
        for (let i = 0; i < n; i++) {
          const sel = page.locator('#view select').nth(i);
          if (!(await sel.isVisible().catch(() => false))) continue;
          const opts = await sel.locator('option').evaluateAll((os2) => os2.map((o) => o.value));
          const e0 = errors.length;
          for (const v of opts.slice(0, 6)) { await sel.selectOption(v).catch(() => {}); await page.waitForTimeout(40); }
          if (errors.length > e0) report.errors.push(state + ' ' + r + ' select#' + i + ' → ' + errors.slice(e0).join(' | '));
          // sau khi đổi, màn hình vẫn có nội dung
          const len = await page.$eval('#view', (e) => e.innerText.trim().length).catch(() => 0);
          if (len < 5) report.blank.push(state + ' ' + r + ' select#' + i + ': màn hình trắng');
          // trả về lựa chọn đầu để các ô kế tiếp không bị lọc hết
          await sel.selectOption(opts[0]).catch(() => {});
        }
      }
      report.errors.push.apply(report.errors, errors.filter((e) => !report.errors.some((x) => x.includes(e))).map((e) => state + ' (lỗi chưa gắn với nút nào) ' + e));
    } finally { await browser.close(); await srv.stop(); }
  }
  console.log('    đã bấm ' + report.pressed + ' nút/liên kết trên ' + ROUTES.length + ' màn hình × 3 trạng thái dữ liệu; ' + report.unclickable.length + ' phần tử không bấm được');
  if (report.dead.length) console.log('    nút không phản ứng:\n      ' + report.dead.join('\n      '));
  if (report.unclickable.length) console.log('    không bấm được:\n      ' + report.unclickable.slice(0, 20).join('\n      '));
  assert.deepEqual(report.blank, [], 'màn hình trắng');
  assert.deepEqual(report.errors, [], 'lỗi console / trang');
  assert.deepEqual(report.dead.filter((d) => !/\(không ảnh hưởng\)/.test(d)), [], 'nút chết (bấm không có tác dụng gì)');
});

test('F9 cửa sổ hẹp và rộng: không tràn ngang toàn trang, điều hướng và nút chính dùng được, chụp ảnh để xem', { skip: SKIP, timeout: 600000 }, async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await makeServer('day-du');
  const sizes = [[1920, 1080], [1440, 900], [1024, 768], [768, 1024], [390, 844]];
  const bad = [];
  try {
    for (const [w, h] of sizes) {
      const { browser, page, errors } = await browserPage(srv, { width: w, height: h });
      try {
        for (const r of ROUTES) {
          await page.evaluate((x) => { location.hash = '#/' + x; }, r);
          await page.waitForTimeout(250);
          await settle(page);
          const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, bodyW: document.body.scrollWidth,
            nav: [...document.querySelectorAll('[data-route]')].filter((e) => e.offsetParent !== null).length, view: document.querySelector('#view').innerText.length }));
          if (m.sw > m.iw + 1) bad.push(w + 'px ' + r + ': tràn ngang ' + m.sw + ' > ' + m.iw);
          if (m.nav < 5) bad.push(w + 'px ' + r + ': thanh điều hướng không dùng được (' + m.nav + ' mục nhìn thấy)');
          if (m.view < 20) bad.push(w + 'px ' + r + ': nội dung trống');
          if ((w === 390 || w === 1920) && ['tong-quan', 'cp-nhap', 'cp-so', 'cp-tong-hop', 'cp-cong-no'].includes(r)) await page.screenshot({ path: path.join(SHOTS, r + '-' + w + '.png') });
        }
        // form nhập thu chi trên cửa sổ hẹp: hộp thoại nằm gọn trong màn hình
        await page.keyboard.press('F2');
        await page.waitForSelector('#entry-form'); await page.waitForTimeout(300);
        const box = await page.$eval('#modal-root .modal', (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, w: window.innerWidth, t: b.top, b: b.bottom, h: window.innerHeight }; });
        if (box.l < -1 || box.r > box.w + 1) bad.push(w + 'px: hộp thoại ghi thu chi vượt chiều ngang (' + Math.round(box.l) + '..' + Math.round(box.r) + ' / ' + box.w + ')');
        const saveBtn = await page.locator('#modal-root [data-act=save]').boundingBox();
        if (!saveBtn || saveBtn.x + saveBtn.width > w + 1) bad.push(w + 'px: nút Lưu nằm ngoài màn hình');
        if (w === 390) await page.screenshot({ path: path.join(SHOTS, 'form-thu-chi-390.png') });
        await page.keyboard.press('Escape');
        assert.deepEqual(errors, [], w + 'px lỗi console');
      } finally { await browser.close(); }
    }
  } finally { await srv.stop(); }
  assert.deepEqual(bad, []);
});

test('F10 xem trước khi in: các màn hình có nút In ẩn đúng phần thao tác, hiện tiêu đề đơn vị, xuất PDF được', { skip: SKIP, timeout: 600000 }, async () => {
  const srv = await makeServer('day-du');
  const { browser, page, errors } = await browserPage(srv);
  const problems = [];
  try {
    for (const r of ROUTES) {
      await page.evaluate((h) => { location.hash = '#/' + h; }, r);
      await page.waitForTimeout(250);
      const btn = page.locator('#view [data-act=print]').first();
      if (!(await btn.count())) continue;
      await btn.click();
      await page.waitForTimeout(150);
      assert.ok(await page.evaluate(() => window.__printCalls >= 1), r + ': nút In không gọi hộp thoại in');
      await page.emulateMedia({ media: 'print' });
      const st = await page.evaluate(() => ({
        visibleNoPrint: [...document.querySelectorAll('.no-print')].filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).length,
        head: (document.querySelector('#print-head') || { innerText: '' }).innerText,
        headVisible: !!document.querySelector('#print-head') && getComputedStyle(document.querySelector('#print-head')).display !== 'none',
        side: [...document.querySelectorAll('aside, nav')].filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0 && !e.closest('#view')).length
      }));
      if (st.visibleNoPrint) problems.push(r + ': còn ' + st.visibleNoPrint + ' phần tử .no-print hiện khi in');
      // phiếu thu/chi in bằng khổ phiếu riêng (#print-root), không dùng tiêu đề báo cáo
      if (r === 'phieu') {
        const v = await page.evaluate(() => ({ n: document.querySelectorAll('#print-root .vc').length, vis: !!document.querySelector('#print-root .vc') && document.querySelector('#print-root .vc').getBoundingClientRect().width > 0 }));
        if (v.n !== 2 || !v.vis) problems.push('phieu: khi in phải hiện 2 liên (có ' + v.n + ')');
      } else if (!st.headVisible || !/ĐIỀN THỦY|THỦY/i.test(st.head)) problems.push(r + ': thiếu tiêu đề đơn vị khi in (' + JSON.stringify(st.head.slice(0, 40)) + ')');
      if (st.side) problems.push(r + ': thanh bên vẫn hiện khi in');
      const pdf = await page.pdf({ format: 'A4', landscape: r.startsWith('cp-so') || r === 'so-thu-chi', printBackground: true });
      const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
      if (pages < 1 || pages > 60) problems.push(r + ': PDF có ' + pages + ' trang');
      await page.emulateMedia({ media: 'screen' });
      await page.evaluate(() => { document.body.classList.remove('printing-view', 'printing-doc'); });
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
  assert.deepEqual(problems, []);
});

test('F11 chữ tiếng Việt hiển thị đúng: font cục bộ có tập ký tự tiếng Việt, đủ dấu thanh, không rơi về font dự phòng', { skip: SKIP, timeout: 120000 }, async () => {
  const srv = await makeServer('day-du');
  const { browser, page, errors } = await browserPage(srv);
  try {
    await page.evaluate(() => { location.hash = '#/cp-tong-hop'; });
    await page.waitForTimeout(400);
    await page.evaluate(() => document.fonts.ready);
    const info = await page.evaluate(async () => {
      const probe = 'ẮẰẲẴẶĂẤẦẨẪẬÂÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐắằẳẵặăấầẩẫậâéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ';
      await Promise.all([...document.fonts].map((f) => f.load(undefined, probe).catch(() => null)));
      const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
      const fam = getComputedStyle(document.body).fontFamily;
      // đo bề rộng: nếu ký tự tiếng Việt rơi về font dự phòng thì bề rộng khác font chính
      const c = document.createElement('canvas').getContext('2d');
      c.font = '16px "Archivo Variable"';
      const w1 = c.measureText(probe).width;
      c.font = '16px monospace';
      const w2 = c.measureText(probe).width;
      return { loaded, fam, w1, w2, check: document.fonts.check('16px "Archivo Variable"', probe), hasViet: [...document.fonts].some((f) => /Archivo/.test(f.family) && f.status === 'loaded') };
    });
    assert.match(info.fam, /Archivo/, 'font của giao diện: ' + info.fam);
    assert.ok(info.hasViet && info.check, 'font Archivo (tập tiếng Việt) chưa nạp được: ' + JSON.stringify(info.loaded));
    assert.notEqual(Math.round(info.w1), Math.round(info.w2), 'chữ có dấu đang hiển thị bằng font dự phòng');
    // tệp font nằm cục bộ và tải được
    for (const f of ['archivo-vietnamese-standard-normal.woff2', 'archivo-latin-ext-standard-normal.woff2', 'archivo-latin-standard-normal.woff2']) {
      const r = await srv.call('GET', '/vendor/fonts/' + f);
      assert.equal(r.status, 200); assert.ok(r.body.length > 10000, f);
    }
    // nội dung dữ liệu tiếng Việt có dấu hiển thị nguyên vẹn trên màn hình và trong ô nhập
    await page.evaluate(() => { location.hash = '#/du-an'; });
    await page.waitForSelector('#pj-body tr[data-id]');
    const txt = await page.$eval('#pj-body', (e) => e.innerText);
    assert.match(txt, /Dự án Nguyễn Đình Chiểu/);
    assert.ok(!/�/.test(txt), 'ký tự lỗi �');
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, 'tieng-viet-du-an.png') });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});
