'use strict';
/* N2. Trạng thái chứng từ: Nháp → Đã ghi sổ. Nháp không tính vào báo cáo, tồn quỹ, công nợ, file Excel xuất. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { KT, startServer, readJsonFile } = require('./helpers');
const { summarize, FILE: MOC } = require('./so-lieu-moc');
const { SKIP, openPage, settle, num, dienBatBuoc } = require('./ui-helpers');
const X = require('./excel-helpers');

const V2 = path.join(__dirname, 'fixtures', 'ketoan-v2-hien-tai.json');
const audit = async (srv, qs) => (await srv.ok('GET', '/api/audit' + (qs ? '?' + qs : ''))).items;

test('N2.1 dòng sổ thu chi Nháp: lưu được, không tính vào tồn quỹ / báo cáo / công nợ; Ghi sổ thì tính; nhật ký ghi "Ghi sổ"', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const moc = readJsonFile(MOC).v2;
    const db0 = await srv.db();
    const ncc = db0.costs[0].maNCC;
    const ct = db0.costs[0].maCT;
    const r = await srv.ok('POST', '/api/entries', { ngay: '2026-09-15', noiDung: 'Trả NCC (nháp)', chi: 5000000, maNCC: ncc, maDuAn: ct, trangThai: 'nhap' });
    let db = await srv.db();
    const rec = db.entries.find((e) => e.id === r.id);
    assert.equal(rec.trangThai, 'nhap');
    assert.deepEqual(summarize(KT.postedDb(db)), moc, 'báo cáo (bỏ nháp) giống hệt trước khi có dòng nháp');
    // dữ liệu thô vẫn chứa dòng nháp — chỉ phần báo cáo bỏ qua
    assert.equal(db.entries.length, db0.entries.length + 1);
    // xuất Excel sổ thu chi không có dòng nháp
    const wb = await X.loadWb((await srv.call('GET', '/api/export/ledger')).body);
    const txt = [];
    wb.worksheets[0].eachRow((row) => txt.push(row.values.join('|')));
    assert.ok(!txt.join('\n').includes('Trả NCC (nháp)'), 'file Excel không có dòng nháp');
    // ghi sổ
    await srv.ok('POST', '/api/entries/post', { ids: [r.id] });
    db = await srv.db();
    assert.equal(db.entries.find((e) => e.id === r.id).trangThai, undefined, 'đã ghi sổ thì không còn trường trạng thái');
    const s = summarize(db);
    assert.equal(s.tonQuy, moc.tonQuy - 5000000);
    const d0 = moc.congNoNCC.rows.find((x) => x.ma === ncc);
    const d1 = s.congNoNCC.rows.find((x) => x.ma === ncc);
    assert.equal(d1.daTra, d0.daTra + 5000000, 'công nợ NCC giảm đúng số tiền sau khi ghi sổ');
    const items = await audit(srv, 'recId=' + r.id);
    assert.deepEqual(items.map((a) => a.action), ['ghi-so', 'them']);
    assert.match(items[1].note, /Lưu nháp/);
    // sửa dòng nháp rồi ghi sổ bằng PUT
    const r2 = await srv.ok('POST', '/api/entries', { ngay: '2026-09-16', noiDung: 'Nháp 2', thu: 100, trangThai: 'nhap' });
    await srv.ok('PUT', '/api/entries/' + r2.id, { ngay: '2026-09-16', noiDung: 'Nháp 2', thu: 200 });
    assert.equal((await audit(srv, 'recId=' + r2.id))[0].action, 'ghi-so');
    assert.equal(summarize(await srv.db()).tonQuy, moc.tonQuy - 5000000 + 200);
  } finally { await srv.stop(); }
});

test('N2.2 phiếu nhập chi phí Nháp: không vào tổng chi phí, hạng mục, công nợ, công nợ theo công trình, file Excel; Ghi sổ cả phiếu', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const moc = readJsonFile(MOC).v2;
    const c0 = (await srv.db()).costs[0];
    const slip = { header: { ngay: '2026-09-18', maCT: c0.maCT, maNCC: c0.maNCC, maHM: c0.maHM, trangThai: 'nhap' },
      lines: [{ dienGiai: 'Cát nháp', soLuong: 3, donGia: 250000 }, { dienGiai: 'Đá nháp', soLuong: 2, donGia: 400000 }] };
    const r = await srv.ok('POST', '/api/cost-slips', slip);
    let db = await srv.db();
    const lines = db.costs.filter((c) => c.phieuId === r.phieuId);
    assert.equal(lines.length, 2);
    assert.ok(lines.every((c) => c.trangThai === 'nhap'), 'mọi dòng của phiếu đều Nháp');
    assert.deepEqual(summarize(KT.postedDb(db)), moc, 'mọi báo cáo giống hệt khi phiếu còn nháp');
    const x = await X.loadWb((await srv.call('GET', '/api/export/costs')).body);
    const nk = x.getWorksheet('NHATKYCHUNG');
    let found = false;
    nk.eachRow((row) => { if (String(row.values.join('|')).includes('Cát nháp')) found = true; });
    assert.equal(found, false, 'NHATKYCHUNG xuất ra không có dòng nháp');
    // sửa từng dòng của phiếu nháp giữ nguyên trạng thái nháp
    await srv.ok('PUT', '/api/costs/' + lines[0].id, Object.assign({}, lines[0], { soLuong: 4 }));
    assert.equal((await srv.db()).costs.find((c) => c.id === lines[0].id).trangThai, 'nhap');
    // ghi sổ cả phiếu
    const p = await srv.ok('POST', '/api/cost-slips/' + r.phieuId + '/post');
    assert.equal(p.posted, 2);
    db = await srv.db();
    const s = summarize(db);
    assert.equal(s.chiPhi.total, moc.chiPhi.total + 4 * 250000 + 800000);
    const n0 = moc.congNoNCC.rows.find((x) => x.ma === c0.maNCC);
    assert.equal(s.congNoNCC.rows.find((x) => x.ma === c0.maNCC).phatSinh, n0.phatSinh + 1800000);
    assert.equal((await audit(srv, 'recId=' + r.phieuId))[0].action, 'ghi-so');
    // phiếu mới nháp rồi PUT không kèm trạng thái = ghi sổ
    const r3 = await srv.ok('POST', '/api/cost-slips', slip);
    const body = JSON.parse(JSON.stringify(slip));
    delete body.header.trangThai;
    await srv.ok('PUT', '/api/cost-slips/' + r3.phieuId, body);
    assert.ok((await srv.db()).costs.filter((c) => c.phieuId === r3.phieuId).every((c) => !c.trangThai));
    assert.equal((await audit(srv, 'recId=' + r3.phieuId))[0].action, 'ghi-so');
  } finally { await srv.stop(); }
});

test('N2.3 giao diện: Lưu nháp từ form, dòng nháp có nhãn và không đổi tồn quỹ, lọc Nháp, nút Ghi sổ trên dòng', { skip: SKIP, timeout: 120000 }, async () => {
  const srv = await startServer({ seed: V2 });
  const { browser, page, errors } = await openPage(srv, '#/so-thu-chi');
  try {
    await page.waitForSelector('#so-body tr[data-id]');
    const ton0 = await page.$eval('#so-summary', (e) => e.innerText);
    assert.equal(await page.locator('input[name=so-tt]').count(), 3, 'bộ lọc trạng thái luôn có (Mọi trạng thái / Đã ghi sổ / Nháp)');
    await page.keyboard.press('F3');
    await page.waitForSelector('#entry-form');
    await page.waitForTimeout(100);
    await page.fill('#entry-form textarea[name=noiDung]', 'Tạm ứng thợ (nháp)');
    await page.fill('#entry-form input[name=chi]', '2tr');
    await dienBatBuoc(page, 'NCC_DIENTHUY', 'DANDC10');
    await page.click('[data-act=save-draft]');
    await page.waitForFunction(() => /Đã lưu nháp/.test(document.querySelector('#toast-root').textContent), null, { timeout: 5000 });
    await page.waitForSelector('#so-body tr.draft');
    await settle(page);
    assert.equal(await page.$eval('#so-summary', (e) => e.innerText), ton0, 'tồn quỹ và các tổng không đổi');
    assert.match(await page.$eval('#so-body tr.draft', (e) => e.innerText), /Nháp/);
    assert.match(await page.$eval('#so-count', (e) => e.innerText), /1 dòng nháp/);
    // lọc chỉ nháp
    await page.click('label.seg-item:has(input[name=so-tt][value=nhap])');
    await settle(page);
    assert.equal(await page.locator('#so-body tr[data-id]').count(), 1);
    // ghi sổ từ nút trên dòng
    await page.click('#so-body tr.draft [data-act=post]');
    await page.waitForFunction(() => /Đã ghi sổ dòng nháp/.test(document.querySelector('#toast-root').textContent), null, { timeout: 5000 });
    await page.click('label.seg-item:has(input[name=so-tt][value=""])').catch(() => {});
    await settle(page);
    const eq = await page.$eval('#so-summary', (e) => e.innerText);
    assert.notEqual(eq, ton0);
    assert.ok(eq.includes('941.000') || num(eq.split('\n').pop()) === 943000 - 2000000 || /−?1\.057\.000/.test(eq), 'tồn quỹ giảm 2 triệu: ' + eq);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});
