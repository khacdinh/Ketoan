'use strict';
/* CN. Công nợ NCC theo công trình (route #/cong-no-ct, KT.supplierDebtByProject, /api/export/debt-by-project):
 * công trình nào còn nợ nhà cung cấp nào, bao nhiêu. Số kỳ vọng tính độc lập từ dữ liệu thô:
 * nợ (công trình, NCC) = chi phí + số dư đầu kỳ − (chi − thu sổ quỹ) − trả ngoài quỹ, cùng mã công trình. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { KT, startServer } = require('./helpers');
const X = require('./excel-helpers');
const { SKIP, openPage, settle, num, chonCongTrinh } = require('./ui-helpers');

const TR = 1000000;
function seed() {
  let id = 1;
  const db = {
    schema: 7, settings: {}, vouchers: {}, trash: [], locks: [], attachments: [], cashCounts: [], ignoredWarnings: {}, extPayments: [], soDuDauKy: [],
    projects: [
      { id: id++, ma: 'CT1', ten: 'Nhà phố Quận 7', nganSach: 0, trangThai: 'Đang thực hiện', ghiChu: '' },
      { id: id++, ma: 'CT2', ten: 'Biệt thự Thảo Điền', nganSach: 0, trangThai: 'Đang thực hiện', ghiChu: '' },
      { id: id++, ma: 'CT3', ten: 'Chưa làm', nganSach: 0, trangThai: 'Đang thực hiện', ghiChu: '' }
    ],
    suppliers: [
      { id: id++, ma: 'NCC_A', ten: 'Vật liệu A', loai: 'Vật tư', sdt: '', diaChi: '', ghiChu: '' },
      { id: id++, ma: 'NCC_B', ten: 'Đội thợ B', loai: 'Nhân công', sdt: '', diaChi: '', ghiChu: '' },
      { id: id++, ma: 'NCC_C', ten: 'Điện nước C', loai: 'Vật tư', sdt: '', diaChi: '', ghiChu: '' },
      { id: id++, ma: 'NCC_D', ten: 'Cửa nhôm D', loai: 'Vật tư', sdt: '', diaChi: '', ghiChu: '' }
    ],
    costGroups: [{ id: id++, ma: 'G1', ten: 'Vật liệu', ghiChu: '' }],
    costItems: [{ id: id++, ma: 'HM01', ten: 'Vật tư', maNhom: 'G1', ghiChu: '' }],
    materials: [], houses: [], costs: [], entries: []
  };
  const cost = (ngay, ct, ncc, tt) => db.costs.push({ id: id++, seq: db.costs.length + 1, phieuId: 0, ngay, maCT: ct, maNha: '', maHM: 'HM01', loaiCP: 'Vật tư', maVT: '',
    dienGiai: 'cp ' + db.costs.length, soLuong: null, donGia: null, thanhTien: tt, maNCC: ncc, soPhieu: '', ghiChu: '', nguon: 'mau' });
  const chi = (ngay, ct, ncc, tien, thu) => db.entries.push({ id: id++, seq: db.entries.length + 1, ngay, soPhieu: '', maDuAn: ct, maNCC: ncc, noiDung: 'tc ' + db.entries.length,
    thu: thu || 0, chi: thu ? 0 : tien, nguoiNhan: '', ghiChu: '' });
  cost('2026-07-02', 'CT1', 'NCC_A', 40 * TR);
  cost('2026-07-10', 'CT2', 'NCC_A', 25 * TR);
  cost('2026-07-12', 'CT1', 'NCC_B', 18 * TR);
  cost('2026-07-05', 'CT2', 'NCC_C', 10 * TR);
  cost('2026-07-06', 'CTX', 'NCC_A', 3 * TR); // mã công trình không có trong danh mục
  chi('2026-07-01', '', '', 0, 200 * TR); // nộp quỹ
  chi('2026-07-15', 'CT1', 'NCC_A', 10 * TR);
  chi('2026-07-16', 'CT1', 'NCC_B', 20 * TR); // trả dư 2tr → ứng dư
  chi('2026-07-17', '', 'NCC_A', 5 * TR); // không ghi công trình → nhóm Chưa gán
  chi('2026-07-18', 'CT2', 'NCC_C', 10 * TR); // tất toán
  db.extPayments.push({ id: id++, ngay: '2026-07-20', maNCC: 'NCC_A', maDuAn: 'CT2', soTien: 5 * TR, nguon: 'Chuyển khoản', ghiChu: '' });
  db.soDuDauKy.push({ id: id++, ngay: '2026-06-30', maNCC: 'NCC_A', maDuAn: 'CT2', soTien: 2 * TR, ghiChu: '' });
  db.soDuDauKy.push({ id: id++, ngay: '2026-06-30', maNCC: 'NCC_D', maDuAn: '', soTien: 7 * TR, ghiChu: 'nợ cũ chưa rõ công trình' });
  db.nextId = id + 5;
  return db;
}

// nợ cuối kỳ (đến ngày to) của từng cặp công trình × NCC, tính thẳng từ dữ liệu thô
function noTheoCap(db, to) {
  const m = new Map();
  const k = (ct, ncc) => KT.keyOf(ct) + '|' + KT.keyOf(ncc);
  const add = (ct, ncc, v, ngay) => { if (!ncc || (to && ngay > to)) return; m.set(k(ct, ncc), (m.get(k(ct, ncc)) || 0) + v); };
  db.costs.forEach((c) => add(c.maCT, c.maNCC, c.thanhTien, c.ngay));
  db.soDuDauKy.forEach((p) => add(p.maDuAn, p.maNCC, p.soTien, p.ngay));
  db.entries.forEach((e) => add(e.maDuAn, e.maNCC, -(e.chi || 0) + (e.thu || 0), e.ngay));
  db.extPayments.forEach((p) => add(p.maDuAn, p.maNCC, -p.soTien, p.ngay));
  return m;
}
const K = (ct, ncc) => KT.keyOf(ct) + '|' + KT.keyOf(ncc);
const keys = (...cap) => cap.map((x) => K(...x.split('|'))).sort();
const capCua = (kq) => {
  const m = new Map();
  kq.groups.concat(kq.chuaGan ? [kq.chuaGan] : []).forEach((g) => g.rows.forEach((r) => m.set(KT.keyOf(g.ma) + '|' + KT.keyOf(r.ma), r.cuoiKy)));
  return m;
};

test('CN1 tính: mỗi cặp công trình × NCC đúng số độc lập; cộng mọi nhóm của một NCC = Công nợ NCC theo kỳ; mỗi công trình = Nợ theo công trình; lọc tình trạng / công trình / từ khóa / kỳ', () => {
  const db = seed();
  const kq = KT.supplierDebtByProject(db, {});
  const mong = noTheoCap(db);
  const co = capCua(kq);
  assert.deepEqual(Object.fromEntries([...co].sort()), Object.fromEntries([...mong].sort()), 'mọi cặp có số liệu, đúng số');
  assert.equal(mong.get(K('CT1', 'NCC_A')), 30 * TR);
  assert.equal(mong.get(K('CT1', 'NCC_B')), -2 * TR);
  assert.equal(mong.get(K('CT2', 'NCC_A')), 22 * TR);
  assert.equal(mong.get(K('CT2', 'NCC_C')), 0);
  assert.equal(mong.get(K('CTX', 'NCC_A')), 3 * TR);
  assert.equal(mong.get(K('', 'NCC_A')), -5 * TR);
  assert.equal(mong.get(K('', 'NCC_D')), 7 * TR);
  // nhóm: thứ tự còn nợ giảm dần, công trình chưa có số liệu (CT3) không hiện, mã lạ CTX có nhóm riêng
  assert.deepEqual(kq.groups.map((g) => g.ma), ['CT1', 'CT2', 'CTX']);
  assert.equal(kq.groups[2].inCatalog, false);
  assert.equal(kq.chuaGan.ten, 'Chưa gán công trình');
  // nhóm Chưa gán trừ đúng cả phần nhập tay: NCC_D nợ cũ 7tr không ghi công trình, NCC_A nhập tay 2tr thuộc CT2
  assert.deepEqual(kq.chuaGan.rows.map((r) => [r.ma, r.nhapDauKy, r.dauKy]).sort(), [['NCC_A', 0, 0], ['NCC_D', 7 * TR, 7 * TR]]);
  assert.deepEqual([kq.total.conNo, kq.total.ungDu, kq.total.soCongTrinhNo], [62 * TR, 7 * TR, 3]);
  // cộng các nhóm của từng NCC = màn Công nợ NCC theo kỳ (cả 4 cột)
  const theoNCC = new Map();
  kq.groups.concat([kq.chuaGan]).forEach((g) => g.rows.forEach((r) => {
    const a = theoNCC.get(r.ma) || { dauKy: 0, phatSinh: 0, thanhToan: 0, cuoiKy: 0 };
    ['dauKy', 'phatSinh', 'thanhToan', 'cuoiKy'].forEach((x) => { a[x] += r[x]; });
    theoNCC.set(r.ma, a);
  }));
  KT.supplierPeriod(db, {}).rows.filter((r) => r.coSoLieu).forEach((r) => {
    assert.deepEqual(theoNCC.get(r.ma), { dauKy: r.dauKy, phatSinh: r.phatSinh, thanhToan: r.thanhToan, cuoiKy: r.cuoiKy }, r.ma);
  });
  // mỗi công trình: còn nợ / ứng dư = bảng Nợ theo công trình của màn Công nợ NCC
  const tom = KT.projectDebtSummary(db, {});
  kq.groups.filter((g) => g.inCatalog).forEach((g) => {
    const p = tom.rows.find((x) => x.ma === g.ma);
    assert.deepEqual([g.tong.conNo, g.tong.ungDu], [p.conNo, p.ungDu], g.ma);
  });
  // lọc tình trạng
  const no = KT.supplierDebtByProject(db, { tt: 'no' });
  assert.deepEqual([...capCua(no).keys()].sort(), keys('CT1|NCC_A', 'CT2|NCC_A', 'CTX|NCC_A', '|NCC_D'));
  assert.deepEqual([no.total.conNo, no.total.ungDu], [62 * TR, 0]);
  assert.deepEqual([...capCua(KT.supplierDebtByProject(db, { tt: 'du' })).keys()].sort(), keys('CT1|NCC_B', '|NCC_A'));
  assert.ok(!capCua(KT.supplierDebtByProject(db, { tt: 'khac0' })).has(K('CT2', 'NCC_C')), 'đã tất toán bị ẩn khi lọc khác 0');
  // lọc một công trình: không có nhóm Chưa gán
  const c2 = KT.supplierDebtByProject(db, { ct: 'ct2' });
  assert.deepEqual([c2.groups.map((g) => g.ma), c2.chuaGan], [['CT2'], null]);
  assert.deepEqual(c2.groups[0].rows.map((r) => [r.ma, r.cuoiKy]), [['NCC_A', 22 * TR], ['NCC_C', 0]]);
  // từ khóa: tên NCC → chỉ dòng của NCC đó; tên công trình → cả nhóm
  const qB = KT.supplierDebtByProject(db, { q: 'doi tho' });
  assert.deepEqual([...capCua(qB).keys()], keys('CT1|NCC_B'));
  const qCT = KT.supplierDebtByProject(db, { q: 'thảo điền' });
  assert.deepEqual([...capCua(qCT).keys()].sort(), keys('CT2|NCC_A', 'CT2|NCC_C'));
  // kỳ: đầu kỳ + phát sinh − thanh toán = cuối kỳ, cuối kỳ = số độc lập tính đến ngày cuối kỳ
  const ky = KT.supplierDebtByProject(db, { from: '2026-07-11', to: '2026-07-16' });
  const mongKy = noTheoCap(db, '2026-07-16');
  ky.groups.concat(ky.chuaGan ? [ky.chuaGan] : []).forEach((g) => g.rows.forEach((r) => {
    assert.equal(r.dauKy + r.phatSinh - r.thanhToan, r.cuoiKy, g.ma + ' ' + r.ma);
    assert.equal(r.cuoiKy, mongKy.get(K(g.ma, r.ma)), g.ma + ' ' + r.ma);
  }));
  const a1 = ky.groups.find((g) => g.ma === 'CT1').rows.find((r) => r.ma === 'NCC_A');
  assert.deepEqual([a1.dauKy, a1.phatSinh, a1.thanhToan, a1.cuoiKy], [40 * TR, 0, 10 * TR, 30 * TR]);
});

test('CN2 xuất Excel: nhóm theo công trình có dòng cộng SUBTOTAL, tổng cộng, bảng chéo; LibreOffice tính lại khớp; quyền xuất', async () => {
  const srv = await startServer({ seed: seed() });
  try {
    const r = await srv.call('GET', '/api/export/debt-by-project?tt=no');
    assert.equal(r.status, 200, r.body.toString().slice(0, 300));
    assert.match(r.headers['content-disposition'], /CongNoNCC_TheoCongTrinh/);
    const wb = await X.loadWb(r.body);
    const ws = wb.getWorksheet('Theo_Cong_Trinh');
    const dong = (txt) => { let o = null; ws.eachRow((rw) => { if (String(X.cellVal(rw.getCell(3)) || '').startsWith(txt)) o = rw; }); return o; };
    const so = (rw) => [5, 6, 7, 8, 9, 10].map((c) => X.cellVal(rw.getCell(c)) || 0); // ExcelJS không ghi kết quả 0 của công thức
    assert.deepEqual(so(dong('Cộng CT1')).slice(3), [30 * TR, 30 * TR, 0]);
    assert.deepEqual(so(dong('Cộng CT2')).slice(3), [22 * TR, 22 * TR, 0]);
    assert.deepEqual(so(dong('Cộng chưa gán')).slice(3), [7 * TR, 7 * TR, 0]);
    const tong = dong('TỔNG CỘNG');
    assert.deepEqual(so(tong).slice(3), [62 * TR, 62 * TR, 0]);
    assert.ok(X.hasFormula(tong.getCell(9)) && /SUBTOTAL\(9,I9:I\d+\)/.test(tong.getCell(9).value.formula), 'tổng = SUBTOTAL cả cột (không cộng hai lần dòng cộng nhóm)');
    // dòng NCC: cuối kỳ = công thức đầu kỳ + phát sinh − thanh toán
    let a2 = null;
    ws.eachRow((rw) => { if (X.cellVal(rw.getCell(2)) === 'NCC_A' && X.cellVal(rw.getCell(8)) === 22 * TR) a2 = rw; });
    assert.ok(a2 && X.hasFormula(a2.getCell(8)), 'NCC_A tại CT2 có cuối kỳ công thức');
    assert.deepEqual(so(a2).slice(0, 3), [2 * TR, 25 * TR, 5 * TR]);
    assert.equal(X.cellVal(a2.getCell(11)), 'Còn nợ');
    // bảng chéo: hàng NCC, cột công trình
    const wm = wb.getWorksheet('Bang_Cheo');
    const head = wm.getRow(8);
    const cot = (txt) => { for (let c = 1; c <= head.cellCount; c++) if (String(X.cellVal(head.getCell(c)) || '').startsWith(txt)) return c; return 0; };
    let hA = null;
    wm.eachRow((rw) => { if (X.cellVal(rw.getCell(1)) === 'NCC_A') hA = rw; });
    assert.deepEqual([X.cellVal(hA.getCell(cot('CT1'))), X.cellVal(hA.getCell(cot('CT2'))), X.cellVal(hA.getCell(cot('CTX'))), X.cellVal(hA.getCell(cot('Tổng')))], [30 * TR, 22 * TR, 3 * TR, 55 * TR]);
    if (X.findSoffice()) {
      const cmp = await X.recalcCompare(r.body, 'cnct');
      assert.deepEqual(cmp.errors, []);
      assert.deepEqual(cmp.mismatches.slice(0, 5), [], 'LibreOffice tính lại khớp');
      assert.ok(cmp.formulas > 20);
    }
    // lọc một công trình + mọi dòng có số liệu: chỉ CT1, có dòng ứng dư của NCC_B
    const wb2 = await X.loadWb((await srv.call('GET', '/api/export/debt-by-project?ct=CT1')).body);
    const w2 = wb2.getWorksheet('Theo_Cong_Trinh');
    const ma = [];
    w2.eachRow((rw, n) => { if (n > 8 && /^NCC_/.test(String(X.cellVal(rw.getCell(2)) || ''))) ma.push([X.cellVal(rw.getCell(2)), X.cellVal(rw.getCell(8))]); });
    assert.deepEqual(ma, [['NCC_A', 30 * TR], ['NCC_B', -2 * TR]]);
    // tham số lạ không làm hỏng
    assert.equal((await srv.call('GET', '/api/export/debt-by-project?tt=xyz&from=abc&q=' + encodeURIComponent('<script>'))).status, 200);
  } finally { await srv.stop(); }
});

test('CN3 giao diện: menu mục Công nợ, trang theo công trình (nhóm, thu gọn, lọc, bảng chéo), Trả tiền mở phiếu chi điền sẵn công trình, sổ chi tiết, xuất Excel', { skip: SKIP }, async () => {
  const srv = await startServer({ seed: seed() });
  const { browser, page, errors, external } = await openPage(srv, '#/cong-no-ct');
  try {
    // menu: mục riêng "Công nợ" ngay sau Sổ sách, gom 4 màn công nợ
    const nhom = await page.$$eval('#nav .nav-group', (gs) => gs.map((g) => [(g.querySelector('.nav-head') || {}).textContent, [...g.querySelectorAll('.nav-item')].map((a) => a.dataset.route)]));
    const cn = nhom.find((g) => g[0] === 'Công nợ');
    assert.deepEqual(cn[1], ['cp-cong-no', 'cong-no-ct', 'so-chi-tiet-ncc', 'so-du-dau']);
    assert.equal(nhom.indexOf(cn), nhom.findIndex((g) => g[0] === 'Sổ sách') + 1);
    assert.equal(await page.$eval('.nav-item.active', (e) => e.dataset.route), 'cong-no-ct');
    await page.waitForSelector('#cnct-table');
    // mặc định: còn nợ
    assert.equal(num(await page.textContent('#cnct-con-no')), 62 * TR);
    assert.deepEqual(await page.$$eval('#cnct-table tr[data-nhom]', (t) => t.map((x) => x.dataset.nhom)), ['CT1', 'CT2', 'CTX', '__chua-gan__']);
    const dongCT = (ct) => page.$$eval('#cnct-table tr[data-ma][data-ct="' + ct + '"]', (t) => t.map((x) => x.dataset.ma));
    assert.deepEqual(await dongCT('CT1'), ['NCC_A']);
    assert.equal(num(await page.textContent('#cnct-table tr[data-nhom="CT1"] [data-con-no]')), 30 * TR);
    // thu gọn / bung một nhóm, thu gọn hết, bung hết
    await page.click('#cnct-table tr[data-nhom="CT1"]'); await settle(page);
    assert.deepEqual(await dongCT('CT1'), []);
    assert.equal(await page.getAttribute('#cnct-table tr[data-nhom="CT1"]', 'aria-expanded'), 'false');
    await page.focus('#cnct-table tr[data-nhom="CT1"]'); await page.keyboard.press('Enter'); await settle(page);
    assert.deepEqual(await dongCT('CT1'), ['NCC_A']);
    await page.click('[data-act=dong-het]'); await settle(page);
    assert.equal(await page.$$eval('#cnct-table tr[data-ma]', (t) => t.length), 0);
    await page.click('[data-act=mo-het]'); await settle(page);
    assert.equal(await page.$$eval('#cnct-table tr[data-ma]', (t) => t.length), 4);
    // mọi dòng có số liệu: thấy ứng dư của NCC_B và dòng đã tất toán
    await page.click('label:has(input[name=cnct-tt][value=""])'); await settle(page);
    assert.deepEqual(await dongCT('CT1'), ['NCC_A', 'NCC_B']);
    assert.deepEqual(await dongCT('CT2'), ['NCC_A', 'NCC_C']);
    // tìm theo tên NCC
    await page.fill('#cnct-q', 'cửa nhôm'); await page.waitForTimeout(300); await settle(page);
    assert.deepEqual(await page.$$eval('#cnct-table tr[data-nhom]', (t) => t.map((x) => x.dataset.nhom)), ['__chua-gan__']);
    await page.fill('#cnct-q', ''); await page.waitForTimeout(300); await settle(page);
    // bảng chéo
    await page.click('label:has(input[name=cnct-view][value=mt])'); await settle(page);
    assert.ok(await page.isHidden('#cnct-mo'));
    const o = await page.$eval('#cnct-matrix', (t) => {
      const h = [...t.querySelectorAll('thead th')].map((x) => x.textContent);
      const r = t.querySelector('tbody tr[data-ma="NCC_A"]');
      return { h, a: [...r.children].map((x) => x.textContent) };
    });
    assert.equal(num(o.a[o.h.indexOf('CT1')]), 30 * TR);
    assert.equal(num(o.a[o.h.indexOf('CT2')]), 22 * TR);
    assert.equal(o.a[o.h.indexOf('Chưa gán')], '(5.000.000)', 'ứng dư hiện trong ngoặc');
    assert.equal(num(o.a[o.h.indexOf('Tổng')]), 50 * TR);
    // bộ lọc được nhớ khi mở lại
    await page.goto(srv.base + '/#/cp-cong-no'); await page.waitForSelector('#cn-table');
    await page.click('label:has(input[name=cn-mode][value=ct])'); await settle(page);
    await page.click('#cn-sang-ct'); await page.waitForSelector('#cnct-matrix');
    await page.click('label:has(input[name=cnct-view][value=ds])'); await settle(page);
    // xuất Excel
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.page-head [data-act=export]')]);
    assert.match(dl.suggestedFilename(), /^CongNoNCC_TheoCongTrinh_.*\.xlsx$/);
    // chọn công trình ở thanh trên: chỉ còn nhóm đó
    await chonCongTrinh(page, 'CT2');
    assert.deepEqual(await page.$$eval('#cnct-table tr[data-nhom]', (t) => t.map((x) => x.dataset.nhom)), ['CT2']);
    await chonCongTrinh(page, '');
    // Trả tiền: mở trang Ghi thu / chi điền sẵn NCC, công trình, số còn nợ
    await page.click('#cnct-table tr[data-ma="NCC_A"][data-ct="CT1"] [data-act=pay]');
    await page.waitForSelector('#entry-page');
    assert.equal(await page.inputValue('#entry-page input[name=maNCC]'), 'NCC_A');
    assert.equal(await page.inputValue('#entry-page [name=maDuAn]'), 'CT1');
    assert.equal(num(await page.inputValue('#entry-page [name=chi]')), 30 * TR);
    await page.click('#entry-page [data-act=cancel]'); await page.waitForSelector('#cnct-table');
    // sổ chi tiết của NCC tại một công trình
    await page.click('#cnct-table tr[data-ma="NCC_A"][data-ct="CT2"] [data-act=ledger]');
    await page.waitForFunction(() => location.hash === '#/so-chi-tiet-ncc');
    await settle(page);
    assert.equal(await page.inputValue('#sct-ncc'), 'NCC_A');
    assert.match(await page.textContent('#tb-ct-val'), /CT2/);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally { await browser.close(); await srv.stop(); }
});

// NCC_A thêm một công trình đã tất toán (CT3: chi phí 10tr, trả ngoài quỹ 10tr) để thử ẩn công trình đã tất toán
function seed4() {
  const db = seed();
  let id = db.nextId;
  db.costs.push({ id: id++, seq: db.costs.length + 1, phieuId: 0, ngay: '2026-07-08', maCT: 'CT3', maNha: '', maHM: 'HM01', loaiCP: 'Vật tư', maVT: '',
    dienGiai: 'cp CT3', soLuong: null, donGia: null, thanhTien: 10 * TR, maNCC: 'NCC_A', soPhieu: '', ghiChu: '', nguon: 'mau' });
  db.extPayments.push({ id: id++, ngay: '2026-07-21', maNCC: 'NCC_A', maDuAn: 'CT3', soTien: 10 * TR, nguon: 'Chuyển khoản', ghiChu: 'trả đủ CT3' });
  db.nextId = id + 5;
  return db;
}

test('CN4 Sổ chi tiết NCC: bảng số dư cuối kỳ theo công trình (cộng = cuối kỳ), ẩn công trình đã tất toán khỏi sổ, bấm công trình để xem riêng, Trả tiền theo công trình', { skip: SKIP }, async () => {
  const srv = await startServer({ seed: seed4() });
  const { browser, page, errors, external } = await openPage(srv, '#/tong-quan');
  try {
    await page.evaluate(() => { localStorage.setItem('stc.sct.ncc', JSON.stringify('NCC_A')); location.hash = '#/so-chi-tiet-ncc'; });
    await page.waitForSelector('#sct-ct-table'); await settle(page);
    const bang = () => page.$$eval('#sct-ct-table tbody tr', (t) => t.map((x) => [x.dataset.ct, x.children[4].textContent.trim()]));
    const eq = async () => (await page.$$eval('.equation .eq-value', (v) => v.map((x) => x.textContent))).map(num);
    const ctSo = () => page.$$eval('#sct-table tbody tr[data-i] td:nth-child(3)', (t) => [...new Set(t.map((x) => x.textContent.trim()).filter(Boolean))].sort());
    // mặc định ẩn công trình đã tất toán: CT3 không có trong bảng lẫn trong sổ
    assert.deepEqual(await bang(), [['CT1', '30.000.000Có'], ['CT2', '22.000.000Có'], ['CTX', '3.000.000Có'], ['', '5.000.000Nợ']]);
    assert.match(await page.textContent('#sct-ct .sheet-note'), /ẩn 1 đã tất toán \(CT3\)/);
    assert.equal(num(await page.textContent('#sct-ct-table tfoot td:nth-child(5)')), 50 * TR, 'cộng các công trình = cuối kỳ');
    assert.deepEqual(await eq(), [2 * TR, 68 * TR, 20 * TR, 50 * TR], 'đầu kỳ + phát sinh − thanh toán = cuối kỳ, không tính CT3');
    assert.deepEqual(await ctSo(), ['CT1', 'CT2', 'CTX']);
    assert.match(await page.textContent('#sct-table tr.an-tt'), /1 công trình đã tất toán.*CT3/);
    assert.ok(await page.isChecked('#sct-an-tt'));
    // hiện lại: CT3 có trong sổ, lũy kế cuối vẫn 50tr
    await page.click('#sct-an-tt'); await page.waitForSelector('#sct-table tr.an-tt', { state: 'detached' }); await settle(page);
    assert.deepEqual(await ctSo(), ['CT1', 'CT2', 'CT3', 'CTX']);
    assert.deepEqual(await eq(), [2 * TR, 78 * TR, 30 * TR, 50 * TR]);
    assert.deepEqual((await bang()).map((x) => x[0]), ['CT1', 'CT2', 'CTX', 'CT3', '']);
    // ẩn lại bằng nút trên bảng công trình, lựa chọn được nhớ khi mở lại
    await page.click('#sct-ct [data-act=tt-toggle]'); await page.waitForSelector('#sct-table tr.an-tt'); await settle(page);
    await page.reload(); await page.waitForSelector('#sct-ct-table'); await settle(page);
    assert.ok(await page.isChecked('#sct-an-tt'));
    // bấm một công trình: sổ chỉ còn công trình đó, dòng đó sáng; bấm lại hoặc "Xem tất cả công trình" để bỏ lọc
    await page.click('#sct-ct-table tr[data-ct="CT2"]'); await page.waitForSelector('#sct-ct-table tr.is-active[data-ct="CT2"]'); await settle(page);
    assert.match(await page.textContent('#tb-ct-val'), /CT2/);
    assert.deepEqual(await ctSo(), ['CT2']);
    assert.equal((await eq())[3], 22 * TR);
    await page.click('#sct-ct [data-act=ct-all]'); await page.waitForSelector('#sct-ct-table tr.is-active', { state: 'detached' }); await settle(page);
    assert.equal((await eq())[3], 50 * TR);
    // Trả tiền ở dòng công trình: phiếu chi điền sẵn công trình và số còn nợ của công trình đó
    await page.click('#sct-ct-table tr[data-ct="CT1"] [data-act=ct-pay]');
    await page.waitForSelector('#entry-page');
    assert.equal(await page.inputValue('#entry-page [name=maDuAn]'), 'CT1');
    assert.equal(num(await page.inputValue('#entry-page [name=chi]')), 30 * TR);
    // NCC đã tất toán ở mọi công trình (NCC_C chỉ có CT2, đã trả đủ): không ẩn gì, vẫn xem được lịch sử
    await page.click('#entry-page [data-act=cancel]');
    await page.evaluate(() => { localStorage.setItem('stc.sct.ncc', JSON.stringify('NCC_C')); location.hash = '#/tong-quan'; });
    await page.waitForFunction(() => location.hash === '#/tong-quan');
    await page.evaluate(() => { location.hash = '#/so-chi-tiet-ncc'; });
    await page.waitForFunction(() => document.querySelector('#sct-ncc') && document.querySelector('#sct-ncc').value === 'NCC_C'); await settle(page);
    assert.equal(await page.$$eval('#sct-table tbody tr[data-i]', (t) => t.length), 2, 'phiếu nhập + phiếu chi của NCC_C vẫn hiện');
    assert.equal(await page.$('#sct-table tr.an-tt'), null);
    assert.equal(await page.$('#sct-an-tt'), null);
    assert.equal(await page.isHidden('#sct-ct'), true, 'một công trình: không cần bảng theo công trình');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('CN5 hai màn công nợ khớp nhau: đầu kỳ ghi Có / Nợ (không số âm) và bằng nhau; Còn lại thuần cuối kỳ bằng nhau; Dư Có / Dư Nợ theo công trình chỉ lớn hơn đúng phần NCC được bù trừ giữa các công trình', { skip: SKIP }, async () => {
  const db = seed();
  // NCC_C đã ứng trước 4tr ở CT2 từ trước khi lên sổ → đầu kỳ Dư Nợ, cuối kỳ ứng dư 4tr
  db.soDuDauKy.push({ id: db.nextId++, ngay: '2026-06-30', maNCC: 'NCC_C', maDuAn: 'CT2', soTien: -4 * TR, ghiChu: 'ứng trước' });
  const srv = await startServer({ seed: db });
  const { browser, page, errors, external } = await openPage(srv, '#/cp-cong-no');
  try {
    // Công nợ NCC theo kỳ, tất cả NCC: đầu kỳ Có 9tr (NCC_A 2 + NCC_D 7), Nợ 4tr (NCC_C); cuối kỳ Có 57 (A 50 + D 7), Nợ 6 (B 2 + C 4), thuần 51
    await page.waitForSelector('#cn-table');
    await page.click('label:has(input[name=cn-tt][value=""])'); await settle(page);
    const eqNCC = await page.$$eval('.equation .eq-cell', (c) => c.map((x) => x.innerText.replace(/\s+/g, ' ')));
    assert.match(eqNCC[0], /Có 9\.000\.000 Nợ 4\.000\.000/);
    assert.match(eqNCC[3], /57\.000\.000/);
    assert.match(eqNCC[4], /6\.000\.000/);
    assert.match(await page.textContent('#cn-table tfoot'), /Còn lại thuần \(Có − Nợ\): 51\.000\.000/);
    // Công nợ theo công trình, mọi dòng có số liệu: đầu kỳ giống hệt; cuối kỳ Có 62 / Nợ 11 vì NCC_A còn nợ 55 ở CT1/CT2/CTX nhưng ứng 5 ở "chưa gán"
    await page.evaluate(() => { location.hash = '#/cong-no-ct'; });
    await page.waitForSelector('#cnct-table');
    await page.click('label:has(input[name=cnct-tt][value=""])'); await settle(page);
    assert.equal(await page.textContent('#cnct-dau-co'), 'Có 9.000.000');
    assert.equal(await page.textContent('#cnct-dau-no'), 'Nợ 4.000.000');
    assert.equal(num(await page.textContent('#cnct-con-no')), 62 * TR);
    assert.equal(num(await page.textContent('#cnct-thuan')), 51 * TR, 'còn lại thuần = màn theo NCC');
    // ô đầu kỳ: ghi Có / Nợ, không có dấu trừ
    const dauKyCT2 = await page.$$eval('#cnct-table tr[data-ct="CT2"]', (t) => t.map((x) => [x.dataset.ma, x.children[1].textContent.trim()]));
    assert.deepEqual(dauKyCT2, [['NCC_A', '2.000.000Có'], ['NCC_C', '4.000.000Nợ']]);
    assert.equal(await page.textContent('#cnct-table tr[data-nhom="CT2"] td:nth-child(2)'), '2.000.000Nợ', 'nhóm CT2: 2 Có − 4 Nợ = 2 Nợ');
    assert.equal(await page.textContent('#cnct-table tfoot td:nth-child(2)'), '5.000.000Có', 'tổng đầu kỳ ròng = 9 Có − 4 Nợ');
    assert.ok(!/-\d/.test(await page.$$eval('#cnct-table td:nth-child(2)', (t) => t.map((x) => x.textContent).join(' '))), 'không còn số âm ở cột đầu kỳ');
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } finally { await browser.close(); await srv.stop(); }
});
