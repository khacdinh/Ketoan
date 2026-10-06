'use strict';
/* Danh mục vật tư dạng cây: bên trái "Khoản mục chi phí" (nhóm → hạng mục), bên phải bảng vật tư lọc theo mục đang chọn. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, readStored } = require('./helpers');
const { SKIP, openPage, settle } = require('./ui-helpers');

const KT = require('../public/js/shared.js');
const rows = (page) => page.$$eval('#dm-table tbody tr[data-id] td.code', (t) => t.map((x) => x.textContent).sort());

test('DV1 cây khoản mục: Tất cả → nhóm → hạng mục lọc đúng bảng; số đếm đúng; thêm vật tư khi đang chọn hạng mục thì điền sẵn hạng mục; lựa chọn giữ sau khi tải lại', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({});
  const db0 = await srv.db();
  const g = db0.costGroups[1];
  const [h1, h2] = db0.costItems.filter((i) => KT.keyOf(i.maNhom) === KT.keyOf(g.ma));
  const hKhac = db0.costItems.find((i) => KT.keyOf(i.maNhom) !== KT.keyOf(g.ma));
  for (const [ma, hm] of [['VA', h1.ma], ['VB', h1.ma], ['VC', h2.ma], ['VD', hKhac.ma]]) await srv.ok('POST', '/api/materials', { ma, ten: 'Vật tư ' + ma, dvt: 'cái', maHM: hm });
  await srv.ok('POST', '/api/projects', { ma: 'CT1', ten: 'Công trình 1' });
  await srv.ok('POST', '/api/suppliers', { ma: 'S1', ten: 'Nhà cung cấp 1' });
  await srv.ok('POST', '/api/cost-slips', { ngay: '2026-09-01', maCT: 'CT1', maNCC: 'S1', lines: [{ maVT: 'VA', soLuong: 2, donGia: 100000 }, { maVT: 'VA', soLuong: 1, donGia: 140000 }] });
  const { browser, page, errors } = await openPage(srv, '#/cp-danh-muc');
  try {
    await page.click('label:has(input[name=dm-tab][value=vat-tu])');
    await page.waitForSelector('#dm-tree [data-tree=""]');
    assert.equal(await page.locator('#dm-tree').isVisible(), true);
    assert.deepEqual(await rows(page), ['VA', 'VB', 'VC', 'VD'], 'mặc định Tất cả vật tư');
    assert.equal(await page.$eval('#dm-tree [data-tree=""] .tree-n', (e) => e.textContent), '4');
    assert.match(await page.$eval('.nav-item.active', (e) => e.textContent), /Vật tư/, 'menu trái sáng mục Vật tư');
    // chọn nhóm: chỉ vật tư thuộc các hạng mục của nhóm, nhóm mở ra
    await page.click('#dm-tree [data-tree="g:' + g.ma + '"]'); await settle(page);
    assert.deepEqual(await rows(page), ['VA', 'VB', 'VC']);
    assert.equal(await page.$eval('#dm-head .dm-head-title', (e) => e.textContent), g.ten);
    assert.equal(await page.$eval('#dm-tree [data-tree="h:' + h1.ma + '"] .tree-n', (e) => e.textContent), '2');
    // chọn hạng mục
    await page.click('#dm-tree [data-tree="h:' + h1.ma + '"]'); await settle(page);
    assert.deepEqual(await rows(page), ['VA', 'VB']);
    assert.equal(await page.$eval('#dm-tree .tree-node.is-on', (e) => e.dataset.tree), 'h:' + h1.ma);
    assert.equal(await page.$eval('#dm-head .dm-head-title', (e) => e.textContent), h1.ten);
    assert.equal(await page.$eval('#dm-table tr[data-id] .dm-use', (e) => e.textContent), '2', 'Đang dùng = số dòng chi phí');
    assert.match(await page.$eval('#dm-table tbody tr[data-id]', (e) => e.innerText), /113\.333/, 'Giá thường = bình quân (2×100.000 + 140.000) / 3');
    // tìm trong mục đang chọn; số đếm trên cây theo từ khóa
    await page.fill('#dm-q', 'VB'); await page.waitForTimeout(300); await settle(page);
    assert.deepEqual(await rows(page), ['VB']);
    assert.equal(await page.$eval('#dm-tree [data-tree=""] .tree-n', (e) => e.textContent), '1');
    await page.fill('#dm-q', ''); await page.waitForTimeout(300); await settle(page);
    // Thêm vật tư: điền sẵn hạng mục đang chọn
    await page.click('[data-act=add]');
    await page.waitForSelector('.modal [name=hmTen]');
    assert.equal(await page.inputValue('.modal [name=hmTen]'), h1.ten);
    await page.fill('.modal [name=ma]', 'VE'); await page.fill('.modal [name=ten]', 'Vật tư VE');
    await page.click('.modal [data-act=save]');
    await page.waitForSelector('#dm-table td.code:text-is("VE")');
    assert.equal(KT.keyOf(readStored(srv.dataDir).materials.find((m) => m.ma === 'VE').maHM), KT.keyOf(h1.ma));
    // tải lại: vẫn đang chọn hạng mục đó
    await page.reload(); await page.waitForSelector('#dm-tree .tree-node.is-on');
    assert.equal(await page.$eval('#dm-tree .tree-node.is-on', (e) => e.dataset.tree), 'h:' + h1.ma);
    assert.deepEqual(await rows(page), ['VA', 'VB', 'VE']);
    // thu gọn nhóm đang chứa mục chọn → chọn cả nhóm
    await page.click('#dm-tree [data-tree-mo="' + KT.keyOf(g.ma) + '"]'); await settle(page);
    assert.equal(await page.$eval('#dm-tree .tree-node.is-on', (e) => e.dataset.tree), 'g:' + g.ma);
    assert.equal(await page.locator('#dm-tree [data-tree="h:' + h1.ma + '"]').count(), 0, 'nhóm đã thu gọn');
    // tab Nhà / khu thì không có cây; menu trái vẫn sáng "Vật tư, hạng mục"
    await page.click('label:has(input[name=dm-tab][value=nha])'); await settle(page);
    assert.equal(await page.locator('#dm-tree').isVisible(), false);
    assert.match(await page.$eval('.nav-item.active', (e) => e.textContent), /Vật tư, hạng mục/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('DV2 cây khoản mục: Sửa mở đúng hạng mục / nhóm đang chọn; + Hạng mục điền sẵn nhóm; mục rỗng có lời nhắc; lựa chọn đã bị xóa thì về Tất cả', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({});
  const db0 = await srv.db();
  const g = db0.costGroups[0];
  await srv.ok('POST', '/api/cost-items', { ma: 'HMX', ten: 'Hạng mục thử', maNhom: g.ma });
  const { browser, page, errors } = await openPage(srv, '#/cp-danh-muc');
  try {
    await page.click('label:has(input[name=dm-tab][value=vat-tu])');
    await page.waitForSelector('#dm-tree');
    assert.equal(await page.locator('#dm-tree [data-act=tree-edit]').isDisabled(), true, 'đang ở Tất cả thì không có gì để sửa');
    await page.click('#dm-tree [data-tree="g:' + g.ma + '"]'); await settle(page);
    await page.click('#dm-tree [data-tree="h:HMX"]'); await settle(page);
    assert.match(await page.$eval('#dm-table tbody', (e) => e.innerText), /chưa có vật tư nào/);
    await page.click('#dm-tree [data-act=tree-edit]');
    await page.waitForSelector('.modal [name=ten]');
    assert.equal(await page.inputValue('.modal [name=ten]'), 'Hạng mục thử');
    await page.click('.modal [data-act=cancel]'); await settle(page);
    // chọn nhóm → + Hạng mục: ô nhóm điền sẵn
    await page.click('#dm-tree [data-tree="g:' + g.ma + '"]'); await settle(page);
    await page.click('#dm-tree [data-act=tree-add-hm]');
    await page.waitForSelector('.modal [name=maNhom]');
    assert.notEqual(await page.inputValue('.modal [name=maNhom]'), '');
    await page.click('.modal [data-act=cancel]'); await settle(page);
    // xóa hạng mục đang chọn ở nơi khác → về Tất cả, không lỗi
    await page.click('#dm-tree [data-tree="h:HMX"]'); await settle(page);
    const it = (await srv.db()).costItems.find((i) => i.ma === 'HMX');
    await page.evaluate(async (id) => { await fetch('/api/cost-items/' + id, { method: 'DELETE' }); }, it.id);
    await page.reload(); await page.waitForSelector('#dm-tree .tree-node.is-on');
    assert.equal(await page.$eval('#dm-tree .tree-node.is-on', (e) => e.dataset.tree), '');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});
