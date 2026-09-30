#!/usr/bin/env node
'use strict';
/*
 * Chụp ảnh giao diện để review UI/UX và đo tự động (tràn ngang, lỗi console, axe-core: tương phản & truy cập).
 *   node ui-review/chup-anh.js before     → ui-review/before/<trạng thái>/<cỡ>/<màn hình>.png + bao-cao.json
 *   node ui-review/chup-anh.js after
 * Cần Playwright (devDependency hoặc cài toàn cục) và axe-core (devDependency). Dữ liệu chạy trên bản sao tạm, không đụng data/.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { startServer, makeBigDb } = require('../tests/helpers');

let chromium;
try { chromium = require('playwright').chromium; } catch (e) { chromium = require(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')).chromium; }
let AXE = null;
for (const p of [path.join(__dirname, '..', 'node_modules', 'axe-core', 'axe.min.js'), process.env.AXE_PATH].filter(Boolean)) { if (fs.existsSync(p)) { AXE = p; break; } }

const OUT = path.join(__dirname, process.argv[2] || 'before');
const V2 = path.join(__dirname, '..', 'tests', 'fixtures', 'ketoan-v2-hien-tai.json');
const ROUTES = ['tong-quan', 'so-thu-chi', 'phieu', 'du-an', 'ncc', 'tong-hop-ncc', 'cai-dat', 'cp-tong-hop', 'cp-nhap', 'cp-so', 'cp-chi-tiet', 'cp-cong-no', 'cp-gia', 'cp-danh-muc'];
const SIZES = { '1366x768': [1366, 768], '1920x1080': [1920, 1080], '768x1024': [768, 1024], '390x844': [390, 844] };
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;

async function server(state) {
  if (state === 'trong') return startServer({});
  if (state === 'mau') return startServer({ seed: V2 });
  return startServer({ seed: makeBigDb(1500, 1200) });
}

(async () => {
  const report = { luc: new Date().toISOString(), states: {} };
  const browser = await chromium.launch();
  for (const state of ['trong', 'mau', 'lon']) {
    if (ONLY && !ONLY.includes(state)) continue;
    const srv = await server(state);
    report.states[state] = {};
    try {
      for (const [sz, [w, h]] of Object.entries(SIZES)) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, bypassCSP: true, deviceScaleFactor: 1 });
        const page = await ctx.newPage();
        await page.addInitScript(() => { window.print = () => {}; });
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(srv.base + '/');
        await page.waitForFunction(() => document.querySelector('#view') && document.querySelector('#view').innerText.length > 5);
        const dir = path.join(OUT, state, sz);
        fs.mkdirSync(dir, { recursive: true });
        const res = report.states[state][sz] = {};
        for (const r of ROUTES) {
          const e0 = errors.length;
          await page.evaluate((x) => { location.hash = '#/' + x; }, r);
          await page.waitForTimeout(350);
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: path.join(dir, r + '.png') });
          const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
          const item = { overflowX: m.sw > m.iw + 1 ? m.sw - m.iw : 0, errors: errors.slice(e0) };
          if (AXE && sz === '1366x768' && state !== 'lon') {
            if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
            const ax = await page.evaluate(async () => {
              const r2 = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] }, resultTypes: ['violations'] });
              return r2.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, vd: v.nodes.slice(0, 4).map((x) => x.target.join(' ') + (x.any && x.any[0] && x.any[0].message ? ' — ' + x.any[0].message.slice(0, 140) : '')) }));
            });
            item.axe = ax;
          }
          res[r] = item;
        }
        // biểu mẫu và hộp thoại
        if (state !== 'lon') {
          await page.evaluate(() => { location.hash = '#/so-thu-chi'; });
          await page.waitForTimeout(300);
          await page.keyboard.press('F2');
          await page.waitForSelector('#entry-form');
          await page.waitForTimeout(300);
          await page.screenshot({ path: path.join(dir, 'form-ghi-thu-chi.png') });
          await page.fill('#entry-form input[name=chi]', '50tr');
          await page.locator('#entry-form input[name=chi]').press('Tab');
          await page.screenshot({ path: path.join(dir, 'form-ghi-thu-chi-da-go.png') });
          await page.keyboard.press('Control+Enter');
          await page.waitForTimeout(400);
          await page.screenshot({ path: path.join(dir, 'form-ghi-thu-chi-loi.png') });
          await page.keyboard.press('Escape');
          await page.waitForTimeout(250);
          // phiếu nhập có vài dòng
          await page.evaluate(() => { location.hash = '#/cp-nhap'; });
          await page.waitForSelector('#cp-head');
          await page.waitForTimeout(250);
          if (state === 'mau') {
            await page.fill('#cp-head input[name=maCT]', 'DATT111');
            await page.fill('#cp-head input[name=maNCC]', 'NCC_VuongThinh');
            await page.fill('#cp-head input[name=hm]', 'Vật tư VLXD');
            await page.locator('#cp-head input[name=hm]').press('Tab');
            await page.fill('#cp-body [data-row="0"][data-col=maVT]', 'VL-CATXAY');
            await page.locator('#cp-body [data-row="0"][data-col=maVT]').press('Enter');
            await page.keyboard.press('Enter');
            await page.keyboard.type('2,5'); await page.keyboard.press('Enter');
            await page.keyboard.press('Enter');
            await page.keyboard.type('XX-LA'); await page.keyboard.press('Enter');
            await page.waitForTimeout(200);
          }
          await page.screenshot({ path: path.join(dir, 'phieu-nhap-co-dong.png'), fullPage: sz !== '390x844' });
          await page.evaluate(() => { localStorage.removeItem('stc.cp.draft'); });
          // xác nhận xóa
          await page.evaluate(() => { location.hash = '#/so-thu-chi'; });
          await page.waitForTimeout(300);
          const del = page.locator('#so-body [data-act=del]').first();
          if (await del.count()) { await del.click({ force: true }); await page.waitForTimeout(250); await page.screenshot({ path: path.join(dir, 'hop-thoai-xoa.png') }); await page.keyboard.press('Escape'); }
          // phiếu in
          if (state === 'mau') {
            await page.evaluate(() => { location.hash = '#/phieu'; });
            await page.waitForTimeout(400);
            // bấm In trước (nút In ẩn khi ở chế độ in), rồi mới xuất PDF theo khổ giấy CSS (@page)
            await page.locator('#view [data-act=print]').first().click().catch(() => {});
            await page.waitForTimeout(200);
            if (sz === '1366x768') {
              await page.pdf({ path: path.join(dir, 'in-phieu.pdf'), preferCSSPageSize: true, printBackground: true }).catch(() => {});
              await page.evaluate(() => document.body.classList.remove('printing-doc', 'printing-view'));
              for (const [r, file] of [['so-thu-chi', 'in-so-thu-chi.pdf'], ['cp-so', 'in-so-chi-phi.pdf'], ['cp-cong-no', 'in-cong-no.pdf']]) {
                await page.evaluate((x) => { location.hash = '#/' + x; }, r);
                await page.waitForTimeout(400);
                await page.locator('#view [data-act=print]').first().click().catch(() => {});
                await page.waitForTimeout(250);
                await page.pdf({ path: path.join(dir, file), preferCSSPageSize: true, printBackground: true }).catch(() => {});
                await page.evaluate(() => document.body.classList.remove('printing-doc', 'printing-view'));
              }
            }
            await page.evaluate(() => document.body.classList.remove('printing-doc', 'printing-view'));
          }
        }
        res._errors = errors;
        await ctx.close();
      }
      // mất kết nối máy chủ (làm sau cùng vì phải tắt máy chủ)
      if (state === 'mau') {
        const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, bypassCSP: true });
        const page = await ctx.newPage();
        await page.goto(srv.base + '/#/so-thu-chi');
        await page.waitForSelector('#so-body tr');
        await srv.stop();
        await page.keyboard.press('F2');
        await page.waitForSelector('#entry-form');
        await page.fill('#entry-form textarea[name=noiDung]', 'thử mất kết nối');
        await page.fill('#entry-form input[name=chi]', '1000');
        await page.keyboard.press('Control+Enter');
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(OUT, state, '1366x768', 'mat-ket-noi.png') });
        await page.keyboard.press('Escape');
        await page.evaluate(() => { location.hash = '#/cp-so'; });
        await page.waitForTimeout(300);
        await page.reload().catch(() => {});
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(OUT, state, '1366x768', 'mat-ket-noi-tai-lai.png') }).catch(() => {});
        await ctx.close();
      }
    } finally { await srv.stop(); }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'bao-cao.json'), JSON.stringify(report, null, 1));
  // tóm tắt
  for (const [st, sizes] of Object.entries(report.states)) {
    for (const [sz, routes] of Object.entries(sizes)) {
      const ov = Object.entries(routes).filter(([k, v]) => k !== '_errors' && v.overflowX).map(([k, v]) => k + '+' + v.overflowX);
      const er = (routes._errors || []).length;
      console.log(st, sz, 'tràn ngang:', ov.join(' ') || '-', '| lỗi console:', er);
    }
  }
  const axe = {};
  for (const [st, sizes] of Object.entries(report.states)) for (const [r, v] of Object.entries(sizes['1366x768'] || {})) (v.axe || []).forEach((a) => { const k = a.id + ' (' + a.impact + ')'; axe[k] = axe[k] || []; axe[k].push(st + '/' + r + ':' + a.n); });
  console.log('axe:', JSON.stringify(axe, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
