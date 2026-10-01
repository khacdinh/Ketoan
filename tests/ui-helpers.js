'use strict';
/* Tiện ích kiểm thử giao diện (Playwright). Playwright là devDependency; nếu chưa cài cục bộ thì dùng bản cài toàn cục. */
const path = require('path');
const { execSync } = require('child_process');

let chromium = null;
try { chromium = require('playwright').chromium; } catch (e) {
  try { chromium = require(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')).chromium; } catch (e2) { /* không có */ }
}
const SKIP = chromium ? false : 'không có Playwright (npm i -D playwright) — kiểm tra giao diện bằng tay';

// Mở trình duyệt + trang, gom lỗi console / lỗi trang / yêu cầu ra mạng ngoài
async function openPage(srv, hash, opts) {
  opts = opts || {};
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  const external = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => { if (!/^(http:\/\/127\.0\.0\.1|http:\/\/localhost|data:|blob:)/.test(r.url())) external.push(r.url()); });
  if (opts.clock) await page.clock.install(); // đồng hồ giả của trình duyệt (tua nhanh thời gian bằng page.clock.fastForward)
  await page.goto(srv.base + '/' + (hash || ''));
  await page.waitForFunction(() => document.querySelector('#view') && document.querySelector('#view').innerText.trim().length > 10, null, { timeout: 30000 });
  return { browser, page, errors, external };
}

// Chờ giao diện vẽ xong (2 khung hình)
function settle(page) { return page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); }

// "1.250.000" → 1250000 ; "−5" / "-5" → -5
function num(s) {
  const t = String(s == null ? '' : s).replace(/[−–]/g, '-').replace(/[^\d,-]/g, '').replace(',', '.');
  return t === '' || t === '-' ? NaN : Number(t);
}

// Ô lọc gõ tìm (combo.js): gõ mã hoặc tên rồi Enter, chờ vẽ lại
async function pick(page, sel, text) {
  await page.fill(sel, text);
  await page.press(sel, 'Enter');
  await settle(page);
}

module.exports = { chromium, SKIP, openPage, settle, num, pick };
