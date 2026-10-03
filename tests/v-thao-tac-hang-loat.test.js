'use strict';
/* V. Thao tác nhiều dòng ở danh mục (tích chọn → thanh "Đã chọn N" → Xóa / Bỏ chọn) và phím Tab khi sửa trực tiếp trong Sổ chi phí. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, readStored } = require('./helpers');
const { SKIP, openPage, settle } = require('./ui-helpers');

test('V1 danh mục NCC: tích 3 mã → thanh "Đã chọn 3"; Bỏ chọn xóa dấu tích; Xóa chỉ xóa mã chưa dùng, mã đang có dòng sổ được giữ và báo lý do; mã xóa vào Thùng rác', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({});
  await srv.ok('POST', '/api/projects', { ma: 'CT1', ten: 'Công trình 1' });
  for (const s of ['S1', 'S2', 'S3']) await srv.ok('POST', '/api/suppliers', { ma: s, ten: 'Nhà cung cấp ' + s });
  await srv.ok('POST', '/api/entries', { ngay: '2026-09-01', soPhieu: 'PC001/09', noiDung: 'S3 đang dùng', chi: 100000, maDuAn: 'CT1', maNCC: 'S3' });
  const { browser, page, errors } = await openPage(srv, '#/ncc');
  try {
    await page.waitForSelector('#ncc-body tr[data-id]');
    assert.equal(await page.locator('#sel-bar').count(), 0, 'chưa chọn gì thì không có thanh chọn');
    for (const m of ['S1', 'S2', 'S3']) await page.check('[data-pick="' + m + '"]');
    await page.waitForSelector('#sel-bar');
    assert.match(await page.$eval('#sel-bar', (e) => e.innerText), /Đã chọn 3/);
    assert.equal(await page.locator('#sel-bar [data-bar=merge]').count(), 1, 'từ 2 mã trở lên có nút Gộp mã');
    // Bỏ chọn
    await page.click('#sel-bar [data-bar=clear]');
    await page.waitForFunction(() => !document.querySelector('#sel-bar'));
    assert.equal(await page.locator('[data-pick]:checked').count(), 0);
    // Xóa 3 mã: S3 có dòng sổ nên bị từ chối
    for (const m of ['S1', 'S2', 'S3']) await page.check('[data-pick="' + m + '"]');
    await page.click('#sel-bar [data-bar=del]');
    await page.waitForSelector('.modal [data-act=yes]');
    assert.match(await page.$eval('.modal', (e) => e.innerText), /S1, S2, S3/);
    await page.click('.modal [data-act=yes]');
    await page.waitForFunction(() => /không xóa được/.test(document.querySelector('#toast-root').textContent), null, { timeout: 10000 });
    await settle(page);
    const db = readStored(srv.dataDir);
    assert.deepEqual(db.suppliers.map((s) => s.ma), ['S3'], 'chỉ còn mã đang dùng');
    assert.equal(db.trash.filter((t) => t.kind === 'suppliers').length, 2, 'hai mã đã xóa nằm trong Thùng rác');
    assert.equal(await page.locator('#sel-bar').count(), 0, 'xong việc thì thanh chọn biến mất');
    assert.deepEqual(errors.filter((e) => !/status of (400|409)/.test(e)), []);
  } finally { await browser.close(); await srv.stop(); }
});

test('V2 danh mục vật tư: xóa nhiều mã vật tư chưa dùng; thanh chọn hiện đúng ở tab Vật tư', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({});
  const db0 = await srv.db();
  const hm = db0.costItems[0].ma;
  for (const m of ['V1', 'V2']) await srv.ok('POST', '/api/materials', { ma: m, ten: 'Vật tư ' + m, dvt: 'cái', maHM: hm });
  const { browser, page, errors } = await openPage(srv, '#/cp-danh-muc');
  try {
    await page.click('label:has(input[name=dm-tab][value=vat-tu])');
    await page.waitForSelector('[data-pick="V1"]');
    await page.check('[data-pick="V1"]'); await page.check('[data-pick="V2"]');
    await page.waitForSelector('#sel-bar');
    await page.click('#sel-bar [data-bar=del]');
    await page.click('.modal [data-act=yes]');
    await page.waitForFunction(() => !document.querySelector('[data-pick="V1"]') && !document.querySelector('[data-pick="V2"]'), null, { timeout: 10000 });
    await settle(page);
    assert.deepEqual(readStored(srv.dataDir).materials, []);
    // tab Nhóm chi phí: có ô tích và thanh chọn, nhưng không có nút Gộp mã; nhóm còn hạng mục thì không xóa được
    await page.click('label:has(input[name=dm-tab][value=nhom])');
    await page.waitForSelector('#dm-table [data-pick]');
    const nhoms = await page.$$eval('#dm-table [data-pick]', (c) => c.slice(0, 2).map((x) => x.dataset.pick));
    for (const m of nhoms) await page.check('[data-pick="' + m + '"]');
    await page.waitForSelector('#sel-bar');
    assert.equal(await page.locator('#sel-bar [data-bar=merge]').count(), 0, 'nhóm chi phí không có Gộp mã');
    assert.equal(await page.locator('#sel-bar [data-bar=del]').count(), 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('V3 Sổ chi phí, sửa trực tiếp: Tab lưu ô này rồi sang ô kế tiếp của dòng, Shift+Tab quay lại, Esc bỏ; ô không đổi thì Tab không ghi gì', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({});
  await srv.ok('POST', '/api/projects', { ma: 'CT1', ten: 'Công trình 1' });
  await srv.ok('POST', '/api/suppliers', { ma: 'S1', ten: 'Nhà cung cấp 1' });
  const db0 = await srv.db();
  await srv.ok('POST', '/api/cost-slips', { header: { ngay: '2026-09-02', maCT: 'CT1', maNCC: 'S1', maHM: db0.costItems[0].ma }, lines: [{ dienGiai: 'Dòng gốc', soLuong: 2, donGia: 1000 }] });
  const { browser, page, errors } = await openPage(srv, '#/cp-so');
  try {
    await page.waitForSelector('#cl-body tr[data-id] td[data-edit=dienGiai]');
    const tdOf = (f) => '#cl-body tr[data-id] td[data-edit=' + f + ']';
    // Tab từ Diễn giải: lưu rồi mở ô Số lượng
    await page.dblclick(tdOf('dienGiai'));
    await page.waitForSelector(tdOf('dienGiai') + ' input');
    await page.fill(tdOf('dienGiai') + ' input', 'Đã sửa bằng Tab');
    await page.keyboard.press('Tab');
    await page.waitForSelector(tdOf('soLuong') + ' input');
    assert.equal(readStored(srv.dataDir).costs[0].dienGiai, 'Đã sửa bằng Tab');
    // ô Số lượng không đổi: Tab không ghi, mở Đơn giá
    const t0 = readStored(srv.dataDir).costs[0].updatedAt;
    await page.keyboard.press('Tab');
    await page.waitForSelector(tdOf('donGia') + ' input');
    assert.equal(readStored(srv.dataDir).costs[0].updatedAt, t0, 'không đổi thì không ghi');
    // đổi Đơn giá rồi Shift+Tab: lưu và quay lại Số lượng
    await page.fill(tdOf('donGia') + ' input', '1.500');
    await page.keyboard.press('Shift+Tab');
    await page.waitForSelector(tdOf('soLuong') + ' input');
    const c = readStored(srv.dataDir).costs[0];
    assert.deepEqual([c.donGia, c.thanhTien], [1500, 3000]);
    // giá trị sai: giữ nguyên ô, báo lỗi, không sang ô khác
    await page.fill(tdOf('soLuong') + ' input', 'abc');
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => /Số lượng không hợp lệ/.test(document.querySelector('#toast-root').textContent));
    assert.equal(await page.locator(tdOf('soLuong') + ' input').count(), 1, 'vẫn ở ô Số lượng');
    assert.equal(await page.locator(tdOf('donGia') + ' input').count(), 0);
    await page.keyboard.press('Escape');
    await settle(page);
    assert.equal(await page.locator('#cl-body td input').count(), 0, 'Esc đóng ô đang sửa');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('V4 menu trái (bản 1a): rộng 248px, mục cao 30px có biểu tượng (không còn ô mã 2 chữ); Ctrl B thu gọn còn 56px, tên mục thành chú thích, nhớ sau khi tải lại; nhãn số ở Kiểm soát ẩn khi 0', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({});
  const { browser, page, errors } = await openPage(srv, '#/tong-quan');
  try {
    await page.waitForSelector('#nav a.nav-item');
    const m = () => page.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
      const it = r('#nav a[data-route=cp-so]');
      return { w: Math.round(r('.app-sidebar').width), h: Math.round(it.height), ic: !!document.querySelector('#nav a[data-route=cp-so] i.ph'), code: document.querySelectorAll('.nav-code').length,
        tip: document.querySelector('#nav a[data-route=cp-so]').getAttribute('title'), side: document.body.classList.contains('side-thu'),
        label: getComputedStyle(document.querySelector('#nav a[data-route=cp-so] .nav-label')).display, badge: document.querySelector('#nav-badge') ? document.querySelector('#nav-badge').hidden : null,
        foot: (document.querySelector('.foot-lbl') || {}).textContent, heads: [...document.querySelectorAll('.nav-head')].map((e) => e.textContent) };
    });
    let x = await m();
    assert.deepEqual([x.w, x.h, x.ic, x.code, x.tip, x.side], [248, 30, true, 0, null, false]);
    assert.deepEqual(x.heads, ['Nhập liệu', 'Sổ sách', 'Báo cáo', 'Danh mục', 'Hệ thống']);
    assert.match(x.foot, /^Tồn quỹ hiện tại · (lưu \d\d:\d\d)?$/);
    // Ctrl B: thu gọn
    await page.keyboard.press('Control+b'); await settle(page);
    x = await m();
    assert.deepEqual([x.w, x.side, x.label, x.tip], [56, true, 'none', 'Sổ chi phí']);
    assert.equal(await page.getAttribute('#side-toggle', 'aria-label'), 'Mở rộng menu (Ctrl B)');
    // nhớ sau khi tải lại
    await page.reload(); await page.waitForSelector('#nav a.nav-item'); await settle(page);
    assert.equal((await m()).side, true);
    await page.click('#side-toggle'); await settle(page);
    x = await m();
    assert.deepEqual([x.w, x.side, x.tip], [248, false, null]);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('V5 biểu đồ Thu, chi trong ngày (Tổng quan): mỗi ngày hai cột Thu / Chi cạnh nhau đúng số liệu, rê chuột hiện thu, chi, thay đổi, tồn quỹ cuối ngày; không còn đường tồn quỹ', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({});
  await srv.ok('POST', '/api/projects', { ma: 'CT1', ten: 'Công trình 1' });
  await srv.ok('POST', '/api/entries', { ngay: '2026-09-01', soPhieu: 'PT001/09', noiDung: 'Thu 1', thu: 5000000, maDuAn: 'CT1' });
  await srv.ok('POST', '/api/entries', { ngay: '2026-09-03', soPhieu: 'PC001/09', noiDung: 'Chi 1', chi: 2000000, maDuAn: 'CT1' });
  await srv.ok('POST', '/api/entries', { ngay: '2026-09-03', soPhieu: 'PT002/09', noiDung: 'Thu 2', thu: 1000000, maDuAn: 'CT1' });
  const { browser, page, errors } = await openPage(srv, '#/tong-quan');
  try {
    await page.waitForSelector('#flow svg .hit');
    assert.equal(await page.locator('#flow .bar-thu').count(), 2, 'hai ngày có thu');
    assert.equal(await page.locator('#flow .bar-chi').count(), 1, 'một ngày có chi');
    assert.equal(await page.locator('#flow .line, #flow .area, #flow .end-dot').count(), 0, 'không còn đường tồn quỹ');
    const w = await page.$eval('#flow .bar-thu', (e) => Number(e.getAttribute('width')));
    assert.ok(w > 1, 'cột có bề rộng');
    // rê chuột vào cụm cột ngày 3/9: thu 1.000.000, chi 2.000.000, thay đổi −1.000.000, tồn quỹ cuối ngày 4.000.000
    const [thuBox, chiBox] = await Promise.all([page.locator('#flow .bar-thu').nth(1).boundingBox(), page.locator('#flow .bar-chi').first().boundingBox()]);
    assert.ok(Math.abs(thuBox.x - chiBox.x) < 40, 'cột thu và chi của cùng ngày nằm cạnh nhau');
    const hit = await page.locator('#flow .hit').boundingBox();
    await page.mouse.move(chiBox.x + chiBox.width / 2, hit.y + hit.height / 2);
    await page.waitForSelector('#flow .tip.show');
    const t = await page.$eval('#flow .tip', (e) => e.innerText);
    assert.match(t, /03\/09\/2026/); assert.match(t, /1\.000\.000/); assert.match(t, /2\.000\.000/); assert.match(t, /Tồn quỹ cuối ngày[\s\S]*4\.000\.000/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});
