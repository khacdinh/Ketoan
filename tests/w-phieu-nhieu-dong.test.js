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
    assert.match(await page.textContent('#phieu-tong'), /2 dòng/);
    assert.equal(await page.textContent('#phieu-tong-chi'), '100.000.000');
    assert.match(await page.textContent('#phieu-chu'), /Một trăm triệu đồng/);
    assert.ok(parseFloat(await page.$eval('#phieu-tong-chi', (e) => getComputedStyle(e).fontSize)) >= 20, 'tổng phiếu chữ lớn');
    // dòng 3 lỗi: dự án lạ → báo "Dòng 3", chưa ghi
    await page.click('[data-act=them-dong]');
    await page.fill(row(3) + ' [data-c=maDuAn]', 'LA'); await page.fill(row(3) + ' [data-c=chi]', '1tr');
    await page.keyboard.press('Control+Enter');
    await settle(page);
    assert.match(await page.$eval('.modal', (e) => e.innerText), /Dòng 3: Mã công trình chưa có/);
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

/* ---------- Phiếu nhập chi phí: mỗi dòng một công trình ---------- */
const slipHead = (o) => Object.assign({ ngay: '2026-07-20', maCT: 'CT1', maNCC: 'ONGA', soPhieu: 'GH-1', maHM: 'Vật tư' }, o);
const dongCP = (o) => Object.assign({ dienGiai: 'Xi măng', thanhTien: 1000000 }, o);

test('W3 API phiếu nhập chi phí: dòng ghi công trình riêng; đầu phiếu bỏ trống công trình khi mọi dòng đều có; thiếu / sai công trình báo đúng dòng; sửa phiếu giữ công trình từng dòng; công nợ tách theo công trình', async () => {
  const srv = await startServer({ seed: seed() });
  try {
    const dau = (await srv.db()).costs.length;
    // đầu phiếu CT1, dòng 2 sang CT2
    const r = await srv.ok('POST', '/api/cost-slips', { header: slipHead({}), lines: [dongCP({ thanhTien: 5000000 }), dongCP({ thanhTien: 3000000, maCT: 'ct2' }), dongCP({ thanhTien: 2000000, maCT: 'CT1' })] });
    let db = await srv.db();
    let recs = db.costs.filter((c) => c.phieuId === r.phieuId);
    assert.deepEqual(recs.map((c) => [c.maCT, c.thanhTien]), [['CT1', 5000000], ['CT2', 3000000], ['CT1', 2000000]]);
    assert.equal(recs.every((c) => c.maNCC === 'ONGA' && c.soPhieu === 'GH-1'), true, 'các dòng cùng nhà cung cấp, cùng số phiếu');
    const goc1 = KT.supplierDebt(seedDb(), { ct: 'CT1' }).rows.find((x) => x.ma === 'ONGA').phatSinh;
    assert.equal(KT.supplierDebt(db, { ct: 'CT1' }).rows.find((x) => x.ma === 'ONGA').phatSinh, goc1 + 7000000, 'CT1 thêm 5tr + 2tr');
    assert.equal(KT.supplierDebt(db, { ct: 'CT2' }).rows.find((x) => x.ma === 'ONGA').phatSinh, 40000000 + 3000000, 'CT2 thêm 3tr');
    // đầu phiếu để trống công trình, mọi dòng có công trình riêng
    const r2 = await srv.ok('POST', '/api/cost-slips', { header: slipHead({ maCT: '', soPhieu: 'GH-2' }), lines: [dongCP({ maCT: 'CT1' }), dongCP({ maCT: 'CT3' })] });
    recs = (await srv.db()).costs.filter((c) => c.phieuId === r2.phieuId);
    assert.deepEqual(recs.map((c) => c.maCT), ['CT1', 'CT3']);
    // đầu phiếu trống mà có dòng không ghi công trình → báo đúng dòng, không ghi gì
    const n = (await srv.db()).costs.length;
    const bad = await srv.call('POST', '/api/cost-slips', { header: slipHead({ maCT: '' }), lines: [dongCP({ maCT: 'CT1' }), dongCP({})] });
    assert.equal(bad.status, 400); assert.match(JSON.stringify(bad.json || bad.body), /Thiếu Mã công trình/);
    const la = await srv.call('POST', '/api/cost-slips', { header: slipHead({}), lines: [dongCP({}), dongCP({ maCT: 'KHONGCO' })] });
    assert.equal(la.status, 400); assert.match(JSON.stringify(la.json || la.body), /Dòng 2/);
    assert.equal((await srv.db()).costs.length, n, 'nguyên khối: không ghi dòng nào');
    // sửa phiếu: gửi lại các dòng (đổi dòng 2 sang CT3)
    await srv.ok('PUT', '/api/cost-slips/' + r.phieuId, { header: slipHead({}), lines: [dongCP({ thanhTien: 5000000 }), dongCP({ thanhTien: 3000000, maCT: 'CT3' })] });
    recs = (await srv.db()).costs.filter((c) => c.phieuId === r.phieuId);
    assert.deepEqual(recs.map((c) => [c.maCT, c.thanhTien]), [['CT1', 5000000], ['CT3', 3000000]]);
    assert.equal((await srv.db()).costs.length, dau + 4, 'tổng số dòng: phiếu đầu còn 2 sau khi sửa, phiếu thứ hai 2 dòng');
  } finally { await srv.stop(); }
});

function seedDb() { return seed(); }

test('W4 phiếu nhập chi phí trên giao diện: cột Công trình riêng, đầu phiếu trống công trình, ghi nhiều công trình; mở lại phiếu giữ đúng công trình từng dòng; danh sách phiếu ghi “+N công trình”', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({ seed: seed() });
  await srv.ok('POST', '/api/materials', { ma: 'XM', ten: 'Xi măng', dvt: 'bao', maHM: 'HM01' });
  await srv.ok('POST', '/api/materials', { ma: 'CAT', ten: 'Cát', dvt: 'm3', maHM: 'HM01' });
  const { browser, page, errors } = await openPage(srv, '#/cp-nhap');
  const cell = (row, col) => 'tr[data-row="' + row + '"] [data-col=' + col + ']';
  try {
    await page.waitForSelector('#cp-body tr[data-row]');
    assert.equal(await page.locator('#cp-lines thead th', { hasText: 'Công trình' }).count(), 1, 'có cột Công trình');
    await page.fill('#cp-head input[name=maNCC]', 'ONGA'); await page.locator('#cp-head input[name=maNCC]').dispatchEvent('change');
    // dòng chưa có công trình, đầu phiếu trống → báo lỗi tại ô Công trình của dòng
    await page.fill(cell(0, 'maVT'), 'XM'); await page.locator(cell(0, 'maVT')).dispatchEvent('change');
    await page.fill(cell(0, 'dienGiai'), 'Xi măng'); await page.fill(cell(0, 'thanhTien'), '5tr'); await page.locator(cell(0, 'thanhTien')).dispatchEvent('change');
    await page.focus(cell(0, 'thanhTien'));
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => /chọn Công trình/i.test(document.querySelector('#toast-root').textContent), null, { timeout: 4000 });
    // dòng 1: CT1, dòng 2: CT2
    await page.fill(cell(0, 'ct'), 'CT1'); await page.locator(cell(0, 'ct')).dispatchEvent('change');
    await page.fill(cell(1, 'ct'), 'công trình 2'); await page.locator(cell(1, 'ct')).dispatchEvent('change');
    assert.equal(await page.inputValue(cell(1, 'ct')), 'CT2', 'gõ tên thì đổi sang mã');
    await page.fill(cell(1, 'maVT'), 'CAT'); await page.locator(cell(1, 'maVT')).dispatchEvent('change');
    await page.fill(cell(1, 'dienGiai'), 'Cát'); await page.fill(cell(1, 'thanhTien'), '3tr'); await page.locator(cell(1, 'thanhTien')).dispatchEvent('change');
    await page.focus(cell(1, 'thanhTien'));
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => /Đã ghi 2 dòng/.test(document.querySelector('#toast-root').textContent), null, { timeout: 6000 });
    let db = await srv.db();
    const moi = db.costs.filter((c) => c.dienGiai === 'Xi măng' || c.dienGiai === 'Cát');
    assert.deepEqual(moi.map((c) => [c.maCT, c.thanhTien]), [['CT1', 5000000], ['CT2', 3000000]]);
    assert.equal(new Set(moi.map((c) => c.phieuId)).size, 1, 'cùng một phiếu');
    // danh sách phiếu đã nhập: phiếu có 2 công trình
    await page.waitForSelector('#rc-body tr[data-phieu]');
    assert.match(await page.$eval('#rc-body tr[data-phieu]', (e) => e.innerText), /\+1 công trình/);
    // mở lại phiếu: ô Công trình của từng dòng khớp (đầu phiếu lấy công trình có nhiều dòng nhất, dòng còn lại ghi riêng)
    await page.locator('#rc-body tr[data-phieu]').first().locator('a[href*="cp-nhap?phieu="]').click();
    await page.waitForSelector(cell(1, 'ct'));
    await page.waitForTimeout(200);
    const cts = [await page.inputValue(cell(0, 'ct')), await page.inputValue(cell(1, 'ct'))];
    // dòng ô Công trình trống = theo đầu phiếu; hợp lại phải đủ CT1 và CT2
    assert.deepEqual(cts.sort(), ['CT1', 'CT2'], 'mở lại: mỗi dòng hiện đúng công trình');
    assert.deepEqual(errors.filter((e) => !/status of 4/.test(e)), []);
  } finally { await browser.close(); await srv.stop(); }
});

test('W5 hạng mục theo vật tư: dòng có mã vật tư luôn lấy hạng mục (và nhóm) của vật tư dù gửi hạng mục khác; dòng không có vật tư dùng hạng mục dòng / đầu phiếu; đầu phiếu không cần hạng mục khi mọi dòng có vật tư; sửa dòng lẻ cũng theo vật tư', async () => {
  const srv = await startServer({ seed: seed() });
  try {
    const hm2 = await srv.ok('POST', '/api/cost-items', { ma: 'HM02', ten: 'Nhân công', maNhom: 'G1' });
    await srv.ok('POST', '/api/materials', { ma: 'XM', ten: 'Xi măng', dvt: 'bao', maHM: 'HM01' });
    await srv.ok('POST', '/api/materials', { ma: 'CHUA', ten: 'Vật tư chưa gắn hạng mục', dvt: 'cái' });
    // đầu phiếu không có hạng mục; dòng có vật tư XM gửi "Nhân công" (sai) → vẫn theo vật tư (HM01)
    const r = await srv.ok('POST', '/api/cost-slips', { header: slipHead({ maHM: '' }), lines: [dongCP({ maVT: 'xm', maHM: 'Nhân công', soLuong: 10, donGia: 95000, thanhTien: undefined })] });
    let c = (await srv.db()).costs.find((x) => x.phieuId === r.phieuId);
    assert.equal(c.maHM, 'HM01', 'hạng mục theo vật tư, bỏ hạng mục gửi lên');
    assert.equal(c.maVT, 'XM');
    // dòng không có vật tư và đầu phiếu không có hạng mục → báo lỗi đúng dòng
    const bad = await srv.call('POST', '/api/cost-slips', { header: slipHead({ maHM: '' }), lines: [dongCP({ maVT: 'XM', soLuong: 1, donGia: 1000, thanhTien: undefined }), dongCP({})] });
    assert.equal(bad.status, 400); assert.match(JSON.stringify(bad.json || bad.body), /Dòng 2.*Hạng mục/i);
    // dòng khoán (không vật tư) lấy hạng mục của dòng hoặc đầu phiếu; vật tư chưa gắn hạng mục thì dùng hạng mục đầu phiếu
    const r2 = await srv.ok('POST', '/api/cost-slips', { header: slipHead({ maHM: 'Nhân công' }), lines: [dongCP({}), dongCP({ maVT: 'CHUA', soLuong: 2, donGia: 500, thanhTien: undefined }), dongCP({ maHM: 'Vật tư' })] });
    const l2 = (await srv.db()).costs.filter((x) => x.phieuId === r2.phieuId);
    assert.deepEqual(l2.map((x) => x.maHM), ['HM02', 'HM02', 'HM01']);
    // sửa dòng lẻ: gửi hạng mục khác cho dòng có vật tư → vẫn theo vật tư
    const goc = (await srv.db()).costs.find((x) => x.phieuId === r.phieuId);
    await srv.ok('PUT', '/api/costs/' + goc.id, Object.assign({}, goc, { maHM: 'HM02' }));
    assert.equal((await srv.db()).costs.find((x) => x.id === goc.id).maHM, 'HM01');
    assert.ok(hm2);
  } finally { await srv.stop(); }
});

test('W6 phiếu nhập chi phí trên giao diện: không còn ô hạng mục ở đầu phiếu; cột Nhóm chi phí › Hạng mục chỉ hiển thị theo vật tư; dòng không có vật tư bị chặn', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({ seed: seed() });
  await srv.ok('POST', '/api/cost-items', { ma: 'HM02', ten: 'Nhân công', maNhom: 'G1' });
  await srv.ok('POST', '/api/materials', { ma: 'XM', ten: 'Xi măng', dvt: 'bao', maHM: 'HM01' });
  await srv.ok('POST', '/api/materials', { ma: 'NC', ten: 'Công thợ', dvt: 'công', maHM: 'HM02' });
  const { browser, page, errors } = await openPage(srv, '#/cp-nhap');
  const cell = (row, col) => 'tr[data-row="' + row + '"] [data-col=' + col + ']';
  try {
    await page.waitForSelector('#cp-body tr[data-row]');
    assert.equal(await page.locator('#cp-head input[name=hm]').count(), 0, 'đầu phiếu không còn ô hạng mục');
    assert.equal(await page.locator('#cp-body [data-col=hm]').count(), 0, 'dòng không còn ô gõ hạng mục');
    await page.fill(cell(0, 'ct'), 'CT1'); await page.locator(cell(0, 'ct')).dispatchEvent('change');
    await page.fill('#cp-head input[name=maNCC]', 'ONGA'); await page.locator('#cp-head input[name=maNCC]').dispatchEvent('change');
    await page.fill(cell(0, 'maVT'), 'XM'); await page.locator(cell(0, 'maVT')).dispatchEvent('change');
    await page.fill(cell(0, 'soLuong'), '10'); await page.fill(cell(0, 'donGia'), '95k'); await page.locator(cell(0, 'donGia')).dispatchEvent('change');
    assert.match(await page.$eval('tr[data-row="0"] .vt-hm', (e) => e.textContent), /Vật liệu.*›.*Vật tư/, 'hiện nhóm › hạng mục của vật tư');
    // dòng không có mã vật tư → không ghi, báo cần mã vật tư
    await page.fill(cell(1, 'dienGiai'), 'Công thợ'); await page.fill(cell(1, 'thanhTien'), '2tr'); await page.locator(cell(1, 'thanhTien')).dispatchEvent('change');
    await page.focus(cell(1, 'thanhTien'));
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => /Dòng 2: cần Mã vật tư/.test(document.querySelector('#toast-root').textContent), null, { timeout: 4000 });
    assert.equal((await srv.db()).costs.filter((x) => x.maVT === 'XM').length, 0, 'chưa ghi');
    await page.fill(cell(1, 'maVT'), 'NC'); await page.locator(cell(1, 'maVT')).dispatchEvent('change');
    assert.match(await page.$eval('tr[data-row="1"] .vt-hm', (e) => e.textContent), /Nhân công/);
    await page.focus(cell(1, 'thanhTien'));
    await page.keyboard.press('Control+Enter');
    await page.waitForFunction(() => /Đã ghi 2 dòng/.test(document.querySelector('#toast-root').textContent), null, { timeout: 6000 });
    const cs = (await srv.db()).costs.filter((x) => x.maVT === 'XM' || x.maVT === 'NC');
    assert.deepEqual(cs.map((x) => x.maHM).sort(), ['HM01', 'HM02']);
    assert.deepEqual(errors.filter((e) => !/status of 4/.test(e)), []);
  } finally { await browser.close(); await srv.stop(); }
});
