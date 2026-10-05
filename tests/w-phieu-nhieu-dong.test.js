'use strict';
/* W. Phiếu thu / chi nhiều dòng: mỗi dòng gắn một dự án riêng để công nợ NCC tách đúng theo dự án.
 * API ghi cả phiếu trong một lần (POST /api/entries/phieu) và biểu mẫu Ghi thu / chi dạng bảng nhiều dòng. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { KT, startServer, readStored } = require('./helpers');
const { SKIP, openPage, settle } = require('./ui-helpers');

function seed() {
  let id = 1;
  const db = {
    schema: 3, settings: {}, vouchers: {}, trash: [], locks: [], attachments: [], cashCounts: [], ignoredWarnings: {},
    projects: ['CT1', 'CT2', 'CT3'].map((ma) => ({ id: id++, ma, ten: 'Công trình ' + ma.slice(2), nganSach: 0, trangThai: 'Đang thực hiện', ghiChu: '' })),
    suppliers: [{ id: id++, ma: 'ONGA', ten: 'Ông A', loai: 'Vật tư', sdt: '', diaChi: '', ghiChu: '' }],
    costGroups: [{ id: id++, ma: 'G1', ten: 'Vật liệu', ghiChu: '' }],
    costItems: [{ id: id++, ma: 'HM01', ten: 'Vật tư', maNhom: 'G1', ghiChu: '' }],
    materials: [], houses: [], costs: [], entries: []
  };
  const cost = (ct, tt) => db.costs.push({ id: id++, seq: db.costs.length + 1, phieuId: 0, ngay: '2026-07-02', maCT: ct, maNha: '', maHM: 'HM01', loaiCP: 'Vật tư', maVT: '',
    dienGiai: 'cp ' + ct, soLuong: 1, donGia: tt, thanhTien: tt, maNCC: 'ONGA', soPhieu: '', ghiChu: '', nguon: 'mau' });
  cost('CT1', 60000000); cost('CT2', 40000000);
  db.entries.push({ id: id++, seq: 1, ngay: '2026-07-01', soPhieu: 'PT001/07', maDuAn: '', maNCC: '', noiDung: 'Nộp quỹ', thu: 500000000, chi: 0, nguoiNhan: '', ghiChu: '' });
  db.nextId = id + 5;
  return db;
}
const dong = (o) => Object.assign({ ngay: '2026-07-20', soPhieu: 'PC001/07', maNCC: 'ONGA', noiDung: 'Thanh toán ông A', thu: 0, chi: 0 }, o);
const conNo = (db, ct) => KT.supplierDebt(db, { ct }).rows.find((r) => r.ma === 'ONGA').conLai;

test('W1 API ghi cả phiếu: 2 dòng khác dự án trong một lần → công nợ từng dự án về 0; dòng hỏng thì không ghi gì; sửa, thêm, bỏ dòng; tháng khóa bị chặn', async () => {
  const srv = await startServer({ seed: seed() });
  try {
    assert.equal(conNo(await srv.db(), 'CT1'), 60000000);
    // phiếu ông A chi 100tr nhưng không gắn dự án: dự án vẫn còn nợ (ghi đúng như người dùng mô tả)
    const x = await srv.ok('POST', '/api/entries', dong({ chi: 100000000, soPhieu: 'PC000/07' }));
    assert.equal(conNo(await srv.db(), 'CT1'), 60000000, 'không gắn dự án thì dự án vẫn nợ');
    await srv.ok('DELETE', '/api/entries/' + x.id);

    // dòng hỏng (mã dự án lạ) → không ghi dòng nào, thông báo nói rõ dòng nào
    const nTruoc = (await srv.db()).entries.length;
    const bad = await srv.call('POST', '/api/entries/phieu', { rows: [dong({ chi: 60000000, maDuAn: 'CT1' }), dong({ chi: 40000000, maDuAn: 'KHONGCO' })] });
    assert.equal(bad.status, 400); assert.match(JSON.stringify(bad.json || bad.body), /Dòng 2/);
    assert.equal((await srv.db()).entries.length, nTruoc, 'nguyên khối: không ghi dòng nào');
    assert.equal((await srv.call('POST', '/api/entries/phieu', { rows: [] })).status, 400);

    const r = await srv.ok('POST', '/api/entries/phieu', { rows: [dong({ chi: 60000000, maDuAn: 'CT1' }), dong({ chi: 40000000, maDuAn: 'ct2' })] });
    assert.equal(r.ids.length, 2);
    let db = await srv.db();
    const rec = db.entries.filter((e) => e.soPhieu === 'PC001/07');
    assert.deepEqual(rec.map((e) => [e.maDuAn, e.chi]), [['CT1', 60000000], ['CT2', 40000000]]);
    assert.ok(rec[0].seq < rec[1].seq, 'giữ thứ tự dòng');
    assert.equal(conNo(db, 'CT1'), 0); assert.equal(conNo(db, 'CT2'), 0);
    const pv = KT.buildVouchers(db).find((v) => v.soPhieu === 'PC001/07');
    assert.equal(pv.lines.length, 2, 'in cùng một phiếu 2 dòng'); assert.equal(pv.lines.reduce((t, x) => t + x.chi, 0), 100000000);

    // sửa dòng 1, thêm dòng 3, bỏ dòng 2 (vào Thùng rác)
    const [a, b] = r.ids;
    await srv.ok('POST', '/api/entries/phieu', { rows: [dong({ id: a, chi: 50000000, maDuAn: 'CT1' }), dong({ chi: 10000000, maDuAn: 'CT3' })], xoa: [b] });
    db = readStored(srv.dataDir);
    const sau = db.entries.filter((e) => e.soPhieu === 'PC001/07');
    assert.deepEqual(sau.map((e) => [e.maDuAn, e.chi]), [['CT1', 50000000], ['CT3', 10000000]]);
    assert.equal(sau[0].id, a, 'dòng cũ giữ id');
    assert.ok(db.trash.some((t) => JSON.stringify(t).includes(String(b))), 'dòng bị bỏ nằm trong Thùng rác');
    assert.equal((await srv.call('POST', '/api/entries/phieu', { rows: [dong({ id: a, chi: 1 })], xoa: [a] })).status, 400, 'vừa sửa vừa xóa');
    assert.equal((await srv.call('POST', '/api/entries/phieu', { rows: [dong({ chi: 1 })], xoa: [999999] })).status, 404);

    // tháng khóa sổ
    await srv.ok('POST', '/api/locks', { months: ['2026-07'] });
    const kho = await srv.call('POST', '/api/entries/phieu', { rows: [dong({ chi: 1, maDuAn: 'CT1' })] });
    assert.equal(kho.status, 423);
  } finally { await srv.stop(); }
});

test('W2 biểu mẫu nhiều dòng: thêm dòng, mỗi dòng một dự án, tổng phiếu, ghi sổ; dòng lỗi báo đúng dòng; sửa cả phiếu (đổi số tiền, bỏ dòng)', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({ seed: seed() });
  const { browser, page, errors } = await openPage(srv, '#/so-thu-chi');
  const row = (n) => '#phieu-dong tbody tr:nth-child(' + n + ')';
  try {
    await page.waitForSelector('#view tr[data-id]');
    await page.keyboard.press('F3');
    await page.waitForSelector('#entry-form');
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#phieu-dong tbody tr').count(), 1, 'mở ra có một dòng');
    assert.equal(await page.locator(row(1) + ' [data-act=bo-dong]').isHidden(), true, 'một dòng thì chưa có nút bỏ dòng');
    await page.fill('input[name=soPhieu]', 'PC050/07');
    await page.fill('input[name=maNCC]', 'ONGA'); await page.locator('input[name=maNCC]').dispatchEvent('change');
    await page.click('.modal [name=noiDung]'); await page.fill('.modal [name=noiDung]', 'Thanh toán ông A đợt 1');
    await page.fill('.modal [name=maDuAn]', 'CT1'); await page.locator('.modal [name=maDuAn]').dispatchEvent('change');
    await page.fill('.modal [name=chi]', '60tr');
    // Enter ở ô cuối của dòng cuối → thêm dòng mới
    await page.locator('.modal [name=chi]').press('Enter');
    await page.waitForSelector(row(2));
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-c')), 'noiDung', 'tiêu điểm sang nội dung dòng mới');
    assert.equal(await page.locator('#phieu-dong tbody tr[data-row]').count(), 2);
    // dòng 2: để trống nội dung (lấy theo dòng đầu), dự án CT2, 40tr
    await page.fill(row(2) + ' [data-c=maDuAn]', 'CT2'); await page.locator(row(2) + ' [data-c=maDuAn]').dispatchEvent('change');
    await page.fill(row(2) + ' [data-c=chi]', '40tr');
    // gợi ý số còn nợ tại dự án của dòng
    assert.match(await page.$eval(row(2), (e) => e.innerText), /NCC còn nợ tại đây: 40\.000\.000/);
    assert.match(await page.textContent('#phieu-tong'), /2 dòng.*100\.000\.000/);
    // dòng 3 lỗi: dự án lạ → báo "Dòng 3", chưa ghi
    await page.click('[data-act=them-dong]');
    await page.fill(row(3) + ' [data-c=maDuAn]', 'LA'); await page.fill(row(3) + ' [data-c=chi]', '1tr');
    await page.keyboard.press('Control+Enter');
    await settle(page);
    assert.match(await page.$eval('.modal', (e) => e.innerText), /Dòng 3: Mã dự án chưa có/);
    assert.equal(readStored(srv.dataDir).entries.filter((x) => x.soPhieu === 'PC050/07').length, 0, 'chưa ghi dòng nào');
    // bỏ dòng 3 rồi ghi sổ
    await page.click(row(3) + ' [data-act=bo-dong]');
    assert.equal(await page.locator('#phieu-dong tbody tr[data-row]').count(), 2);
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => !document.querySelector('.modal'), null, { timeout: 8000 }).catch(async (e) => { throw new Error(e.message + ' | ' + (await page.$eval('.modal', (m) => m.innerText).catch(() => '')).slice(0, 600)); });
    let db = readStored(srv.dataDir);
    let rec = db.entries.filter((x) => x.soPhieu === 'PC050/07');
    assert.deepEqual(rec.map((x) => [x.maDuAn, x.chi, x.noiDung, x.maNCC]), [['CT1', 60000000, 'Thanh toán ông A đợt 1', 'ONGA'], ['CT2', 40000000, 'Thanh toán ông A đợt 1', 'ONGA']]);
    assert.equal(conNo(db, 'CT1'), 0); assert.equal(conNo(db, 'CT2'), 0);

    // sửa một dòng của phiếu → có liên kết "Sửa cả phiếu (2 dòng)"
    await settle(page);
    await page.dblclick('#view tr[data-id="' + rec[0].id + '"]');
    await page.waitForSelector('#entry-form');
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#phieu-dong tbody tr').count(), 1, 'sửa một dòng chỉ hiện dòng đó');
    await page.click('[data-act=sua-phieu]');
    await page.waitForFunction(() => /Sửa phiếu PC050\/07 \(2 dòng\)/.test(document.querySelector('.modal h2') && document.querySelector('.modal h2').textContent));
    await page.waitForFunction(() => document.querySelectorAll('#phieu-dong tbody tr').length === 2);
    await page.waitForTimeout(150);
    assert.equal(await page.inputValue(row(2) + ' [data-c=maDuAn]'), 'CT2');
    // đổi dòng 1 còn 50tr, bỏ dòng 2, thêm dòng 3 (CT3 10tr)
    await page.fill(row(1) + ' [data-c=chi]', '50tr');
    await page.click(row(2) + ' [data-act=bo-dong]');
    await page.click('[data-act=them-dong]');
    await page.fill(row(2) + ' [data-c=maDuAn]', 'CT3'); await page.fill(row(2) + ' [data-c=chi]', '10tr');
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => !document.querySelector('.modal'));
    db = readStored(srv.dataDir);
    rec = db.entries.filter((x) => x.soPhieu === 'PC050/07');
    assert.deepEqual(rec.map((x) => [x.maDuAn, x.chi]), [['CT1', 50000000], ['CT3', 10000000]]);
    assert.equal(db.trash.length >= 1, true, 'dòng bỏ khỏi phiếu vào Thùng rác');
    assert.deepEqual(errors.filter((e) => !/status of (400|409)/.test(e)), []);
  } finally { await browser.close(); await srv.stop(); }
});
