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

// Chọn công trình ở thanh trên ('' = tất cả công trình): áp dụng cho mọi sổ và báo cáo
async function chonCongTrinh(page, ma) {
  await page.click('#tb-ct');
  await page.waitForSelector('#ct-q');
  if (ma) await page.fill('#ct-q', ma);
  await page.waitForTimeout(60);
  if (ma) await page.press('#ct-q', 'Enter'); else await page.click('#ct-list [data-ma=""]');
  await settle(page);
}

// Thanh chọn kỳ thống nhất: kind = thang | quy | nam | khoang | tat-ca; khoảng ngày thì gõ từ ngày / đến ngày (dd/mm/yyyy)
async function chonKy(page, prefix, kind, from, to) {
  await page.click('label:has(input[name="' + prefix + '-pk"][value="' + kind + '"])');
  await settle(page);
  if (kind === 'khoang' && (from || to)) {
    const box = (id) => page.locator('.date-field:has(#' + id + ') .date-text');
    if (from) { await box(prefix + '-from').fill(from); await box(prefix + '-from').press('Tab'); }
    if (to) { await box(prefix + '-to').fill(to); await box(prefix + '-to').press('Tab'); }
    await settle(page);
  }
}

// Trang Ghi thu / chi: điền hai ô bắt buộc — Nhà cung cấp / đối tượng (đầu phiếu) và Công trình (dòng 1)
async function dienBatBuoc(page, ncc, ct) {
  if (ncc) { await page.fill('#entry-page input[name=maNCC]', ncc); await page.locator('#entry-page input[name=maNCC]').dispatchEvent('change'); }
  if (ct) { await page.fill('#entry-page [name=maDuAn]', ct); await page.locator('#entry-page [name=maDuAn]').dispatchEvent('change'); }
}

module.exports = { chromium, SKIP, openPage, settle, num, pick, chonCongTrinh, chonKy, dienBatBuoc };
