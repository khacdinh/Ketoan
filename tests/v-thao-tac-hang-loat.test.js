'use strict';
/* V. Thao tác nhiều dòng ở danh mục (tích chọn → thanh "Đã chọn N" → Xóa / Bỏ chọn) và phím Tab khi sửa trực tiếp trong Sổ chi phí. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, readStored } = require('./helpers');
const { SKIP, openPage, settle, dienBatBuoc } = require('./ui-helpers');

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

test('V2 danh mục vật tư: xóa nhiều mã vật tư chưa dùng; thanh chọn hiện đúng ở tab Vật tư; chỉ còn tab Vật tư, Nhà / khu', { skip: SKIP, timeout: 180000 }, async () => {
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
    // tab Nhà / khu: không có cây khoản mục; hạng mục và nhóm chỉ còn quản lý trên cây (không còn tab riêng)
    assert.deepEqual(await page.$$eval('input[name=dm-tab]', (r) => r.map((x) => x.value)), ['vat-tu', 'nha']);
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

test('V4 menu trái (bản 1a): rộng 248px, mục cao 32px có biểu tượng (không còn ô mã 2 chữ); Ctrl B thu gọn còn 56px, tên mục thành chú thích, nhớ sau khi tải lại; nhãn số ở Kiểm soát ẩn khi 0', { skip: SKIP, timeout: 180000 }, async () => {
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
    assert.deepEqual([x.w, x.h, x.ic, x.code, x.tip, x.side], [248, 32, true, 0, null, false]);
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

test('V6 phiếu chi có mục Mã vật tư: chọn theo mã hoặc tên, lưu vào dòng sổ, hiện ở Sổ quỹ; mã lạ bị từ chối; Thu thì không lưu; sửa bỏ mã; đổi mã vật tư lan sang dòng sổ; xóa vật tư đang dùng bị chặn', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({});
  await srv.ok('POST', '/api/projects', { ma: 'CT1', ten: 'Công trình 1' });
  await srv.ok('POST', '/api/suppliers', { ma: 'NCC1', ten: 'NCC 1' });
  const hm = (await srv.db()).costItems[0].ma;
  await srv.ok('POST', '/api/materials', { ma: 'XM', ten: 'Xi măng', dvt: 'bao', maHM: hm });
  // API: mã lạ bị từ chối, mã đúng (không phân biệt hoa thường) được chuẩn hóa
  const bad = await srv.call('POST', '/api/entries', { ngay: '2026-09-01', noiDung: 'x', chi: 1000, maVT: 'KHONGCO' });
  assert.equal(bad.status, 400); assert.match(JSON.stringify(bad.json || bad.body), /vật tư/);
  await srv.ok('POST', '/api/entries', { ngay: '2026-09-01', soPhieu: 'PC001/09', noiDung: 'Mua xi măng', chi: 500000, maDuAn: 'CT1', maVT: 'xm' });
  assert.equal(readStored(srv.dataDir).entries[0].maVT, 'XM');
  const { browser, page, errors } = await openPage(srv, '#/so-thu-chi');
  try {
    await page.waitForSelector('#view tr[data-id]');
    assert.match(await page.$eval('#view tr[data-id]', (e) => e.innerText), /Vật tư: XM – Xi măng/, 'Sổ quỹ hiện vật tư');
    // form: gõ tên vật tư, lưu
    await page.keyboard.press('F3');
    await page.waitForSelector('#entry-form');
    await page.waitForTimeout(150);
    await page.click('#entry-page [name=noiDung]'); await page.fill('#entry-page [name=noiDung]', 'Chi mua xi măng đợt 2');
    await page.fill('#entry-page [name=chi]', '2tr');
    await dienBatBuoc(page, 'NCC1', 'CT1');
    await page.fill('#entry-page [name=maVT]', 'Xi măng');
    await page.locator('#entry-page [name=maVT]').dispatchEvent('change');
    assert.match(await page.$eval('#vt-hint', (e) => e.textContent), /Xi măng · bao/);
    // mã vật tư lạ: báo lỗi tại ô, không ghi
    await page.fill('#entry-page [name=maVT]', 'LA');
    await page.keyboard.press('Control+Enter');
    await settle(page);
    assert.equal(readStored(srv.dataDir).entries.length, 1, 'mã lạ thì chưa ghi');
    await page.fill('#entry-page [name=maVT]', 'Xi măng');
    await page.locator('#entry-page [name=maVT]').dispatchEvent('change');
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => !document.querySelector('#entry-page'));
    let db = readStored(srv.dataDir);
    assert.deepEqual(db.entries.map((e) => e.maVT), ['XM', 'XM']);
    // loại Thu: ô Mã vật tư ẩn
    await page.keyboard.press('F3'); await page.waitForSelector('#entry-form');
    await page.click('#entry-page label.seg-item:has(input[value=thu])');
    assert.equal(await page.$eval('#entry-page [name=maVT]', (e) => e.closest('[data-show]').hidden), true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#entry-page')); // chờ hộp thoại cũ đóng hẳn trước khi mở hộp thoại sửa
    // sửa: bỏ mã vật tư
    const id = db.entries[1].id;
    await page.dblclick('#view tr[data-id="' + id + '"]');
    await page.waitForSelector('#entry-form');
    await page.waitForTimeout(150); // qua mốc tự focus 40 ms của biểu mẫu
    assert.equal(await page.inputValue('#entry-page [name=maVT]'), 'XM');
    await page.click('#entry-page [name=maVT]'); await page.fill('#entry-page [name=maVT]', '');
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => !document.querySelector('#entry-page'));
    db = readStored(srv.dataDir);
    assert.equal(db.entries.find((e) => e.id === id).maVT, undefined, 'bỏ mã thì không còn trường');
    // đổi mã vật tư: dòng sổ đi theo; xóa vật tư đang dùng: bị chặn
    const vt = (await srv.db()).materials[0];
    await srv.ok('PUT', '/api/materials/' + vt.id, { ma: 'XM2', ten: 'Xi măng', dvt: 'bao', maHM: hm });
    assert.equal(readStored(srv.dataDir).entries[0].maVT, 'XM2');
    const del = await srv.call('DELETE', '/api/materials/' + vt.id);
    assert.ok(del.status >= 400 && del.status < 500, 'xóa vật tư đang dùng bị từ chối (' + del.status + ')');
    assert.deepEqual(errors.filter((e) => !/status of (400|409)/.test(e)), []);
  } finally { await browser.close(); await srv.stop(); }
});

test('V7 mã vật tư của phiếu chi đi theo phiếu in 2 liên và file Excel: dòng "Vật tư:" khi in, cột "Mã Vật Tư" khi xuất sổ (đầy đủ và theo bộ lọc), nhập lại giữ mã, mã lạ bị bỏ kèm cảnh báo', { skip: SKIP, timeout: 180000 }, async () => {
  const X = require('./excel-helpers');
  const srv = await startServer({});
  await srv.ok('POST', '/api/projects', { ma: 'CT1', ten: 'Công trình 1' });
  const hm = (await srv.db()).costItems[0].ma;
  await srv.ok('POST', '/api/materials', { ma: 'XM', ten: 'Xi măng', dvt: 'bao', maHM: hm });
  await srv.ok('POST', '/api/entries', { ngay: '2026-09-01', soPhieu: 'PC001/09', noiDung: 'Mua xi măng', chi: 500000, maDuAn: 'CT1', maVT: 'XM' });
  await srv.ok('POST', '/api/entries', { ngay: '2026-09-01', soPhieu: 'PC001/09', noiDung: 'Tiền xe', chi: 100000, maDuAn: 'CT1' });
  try {
    // phiếu in 2 liên: dòng Vật tư
    const { browser, page, errors } = await openPage(srv, '#/phieu');
    try {
      await page.evaluate(() => { location.hash = '#/phieu'; });
      await page.waitForFunction(() => /PC001\/09/.test(document.querySelector('#view').innerText));
      const html = await page.evaluate(async () => { const m = await import('/js/print.js'); const st = await import('/js/state.js'); const v = window.KT.buildVouchers(st.S.db).find((x) => x.soPhieu === 'PC001/09'); return m.voucherHtml(v, st.S.db.settings); });
      assert.match(html, /Vật tư:<\/span><span class="vc-v">XM – Xi măng</);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
    // xuất sổ đầy đủ và sổ theo bộ lọc: cột Mã Vật Tư
    for (const [url, sheet] of [['/api/export/full', 'So_Thu_Chi_Hang_Ngay'], ['/api/export/ledger', 'So_Thu_Chi']]) {
      const wb = await X.loadWb((await srv.call('GET', url)).body);
      const ws = wb.getWorksheet(sheet);
      let hr = 0; let col = 0;
      ws.eachRow((row, r) => { row.eachCell((c, ci) => { if (X.cellVal(c) === 'Mã Vật Tư') { hr = r; col = ci; } }); });
      assert.ok(hr && col === 14, sheet + ': có cột Mã Vật Tư (cột N)');
      const vals = [];
      ws.eachRow((row, r) => { if (r > hr && X.cellVal(row.getCell(8)) === 'Mua xi măng') vals.push(X.cellVal(row.getCell(col))); });
      assert.deepEqual(vals, ['XM'], sheet);
    }
    // nhập lại file đầy đủ vào bản sạch có danh mục vật tư: giữ mã; bản không có vật tư: bỏ mã kèm cảnh báo
    const full = (await srv.call('GET', '/api/export/full')).body;
    const srv2 = await startServer({});
    try {
      const hm2 = (await srv2.db()).costItems[0].ma;
      await srv2.ok('POST', '/api/materials', { ma: 'xm', ten: 'Xi măng', dvt: 'bao', maHM: hm2 });
      const r = await srv2.call('POST', '/api/import?mode=replace', full);
      assert.equal(r.status, 200, JSON.stringify(r.json || {}).slice(0, 300));
      const e = readStored(srv2.dataDir).entries.find((x) => x.noiDung === 'Mua xi măng');
      assert.equal(e.maVT, 'xm', 'lấy đúng cách viết của danh mục');
      assert.equal(readStored(srv2.dataDir).entries.find((x) => x.noiDung === 'Tiền xe').maVT, undefined);
    } finally { await srv2.stop(); }
    const srv3 = await startServer({});
    try {
      const dry = await srv3.call('POST', '/api/import?dryRun=1', full);
      assert.match(JSON.stringify(dry.json.preview.warnings), /mã vật tư \\"XM\\" chưa có trong danh mục vật tư/);
      const r = await srv3.call('POST', '/api/import?mode=replace', full);
      assert.equal(r.status, 200);
      assert.equal(readStored(srv3.dataDir).entries.find((x) => x.noiDung === 'Mua xi măng').maVT, undefined, 'mã lạ bị bỏ');
    } finally { await srv3.stop(); }
  } finally { await srv.stop(); }
});
