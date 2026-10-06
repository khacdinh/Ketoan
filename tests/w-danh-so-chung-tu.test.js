'use strict';
/* Đánh số chứng từ: cấu hình tiền tố / độ dài / hậu tố / số tiếp theo (settings.danhSo, PUT /api/danh-so/:loai), số tự điền khi lập
 * Ghi thu / chi (PT, PC, UNC), Phiếu nhập chi phí (MH) và biên bản đối chiếu (ĐC-MM/YYYY-NCC). */
const test = require('node:test');
const assert = require('node:assert/strict');
const { KT, startServer, readStored } = require('./helpers');
const { SKIP, openPage, settle, dienBatBuoc } = require('./ui-helpers');

const hom = KT.todayISO();
const MM = hom.slice(5, 7);
const YYYY = hom.slice(0, 4);

test('DS1 lõi đánh số: mặc định như mẫu, đếm theo kỳ (tháng trong năm), bỏ khoảng trắng / hoa thường, số đặt tay chỉ áp cho kỳ lúc đặt', () => {
  const db = {
    settings: {},
    entries: [
      { ngay: '2026-09-03', soPhieu: 'PC044/09' }, { ngay: '2026-09-05', soPhieu: 'pc 045 / 09' }, { ngay: '2025-09-05', soPhieu: 'PC099/09' },
      { ngay: '2026-09-05', soPhieu: 'UNC012/09' }, { ngay: '2026-09-06', soPhieu: 'PT021/09' }, { ngay: '2026-09-07', soPhieu: 'PCX900/09' }
    ],
    costs: [{ ngay: '2026-10-01', soPhieu: 'MH0209/10' }, { ngay: '2026-10-01', soPhieu: 'GH-77' }]
  };
  assert.equal(KT.nextVoucherNo(db, 'chi', '2026-09-20'), 'PC046/09', 'PC099/09 của năm trước và PCX900 không tính');
  assert.equal(KT.nextVoucherNo(db, 'thu', '2026-09-20'), 'PT022/09');
  assert.equal(KT.nextVoucherNo(db, 'unc', '2026-09-20'), 'UNC013/09');
  assert.equal(KT.nextVoucherNo(db, 'chi', '2026-10-02'), 'PC001/10', 'tháng mới đánh lại từ 1');
  assert.equal(KT.soChungTuTiep(db, 'mh', '2026-10-06').soPhieu, 'MH0210/10', 'MH đếm trong chi phí công trình');
  assert.equal(KT.soChungTuTiep(db, 'dc', '2026-09-30', 'xt').soPhieu, 'ĐC-09/2026-XT');
  db.settings.danhSo = { chi: { tienTo: 'PC', doDai: 3, hauTo: '/MM', soTiep: 60, ky: '2026-09' } };
  assert.equal(KT.nextVoucherNo(db, 'chi', '2026-09-20'), 'PC060/09');
  assert.equal(KT.nextVoucherNo(db, 'chi', '2026-10-20'), 'PC001/10', 'số đặt tay không áp cho kỳ khác');
  db.settings.danhSo = { chi: { tienTo: 'C-', doDai: 5, hauTo: '/YYYY' } };
  assert.equal(KT.nextVoucherNo(db, 'chi', '2026-09-20'), 'C-00001/2026', 'hậu tố chỉ có năm: đánh số cả năm');
  db.entries.push({ ngay: '2026-01-02', soPhieu: 'C-00007/2026' });
  assert.equal(KT.nextVoucherNo(db, 'chi', '2026-12-20'), 'C-00008/2026');
  assert.equal(KT.voucherType('UNC001/09'), 'chi');
});

test('DS2 API /api/danh-so: kiểm tra đầu vào (PT chỉ cho phiếu thu, tiền tố không trùng, hậu tố không dính số, số tiếp theo không lùi về số đã dùng), lưu vào cài đặt', async () => {
  const srv = await startServer({});
  try {
    await srv.ok('POST', '/api/projects', { ma: 'CT1', ten: 'Công trình 1' });
    await srv.ok('POST', '/api/entries', { ngay: hom, soPhieu: 'PC005/' + MM, noiDung: 'chi', chi: 100000, maDuAn: 'CT1' });
    const loi = async (loai, body, re) => {
      const r = await srv.call('PUT', '/api/danh-so/' + loai, body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.match(r.json.error, re);
    };
    await loi('xyz', { tienTo: 'A', doDai: 3 }, /Loại chứng từ/);
    await loi('chi', { tienTo: '', doDai: 3, hauTo: '/MM' }, /tiền tố/);
    await loi('thu', { tienTo: 'THU', doDai: 3, hauTo: '/MM' }, /bắt đầu bằng PT/);
    await loi('chi', { tienTo: 'PTC', doDai: 3, hauTo: '/MM' }, /Chỉ phiếu thu/);
    await loi('unc', { tienTo: 'PC', doDai: 3, hauTo: '/MM' }, /đang dùng cho phiếu chi/);
    await loi('chi', { tienTo: 'PC', doDai: 3, hauTo: 'MM' }, /Hậu tố cần bắt đầu/);
    await loi('chi', { tienTo: 'PC2', doDai: 3, hauTo: '/MM' }, /kết thúc bằng chữ số/);
    await loi('chi', { tienTo: 'P C', doDai: 0, hauTo: '/MM' }, /Độ dài/);
    await loi('chi', { tienTo: 'PC', doDai: 3, hauTo: '/MM', soTiep: 4 }, /đã dùng/);
    await loi('mh', { tienTo: 'MH<', doDai: 4, hauTo: '/MM' }, /chỉ gồm chữ, số/);
    // hợp lệ: số tiếp theo 40 → phiếu chi kế tiếp PC040
    await srv.ok('PUT', '/api/danh-so/chi', { tienTo: 'PC', doDai: 3, hauTo: '/MM', soTiep: 40 });
    let db = await srv.db();
    assert.deepEqual(db.settings.danhSo.chi, { tienTo: 'PC', doDai: 3, hauTo: '/MM', soTiep: 40, ky: hom.slice(0, 7) });
    assert.equal((await srv.ok('GET', '/api/vouchers/next?loai=chi&ngay=' + hom)).soPhieu, 'PC040/' + MM);
    // số tiếp theo bằng đúng số kế tiếp tự nhiên thì không lưu (để trống = theo dữ liệu)
    await srv.ok('PUT', '/api/danh-so/unc', { tienTo: 'CK', doDai: 4, hauTo: '-MM/YY', soTiep: 1 });
    db = await srv.db();
    assert.deepEqual(db.settings.danhSo.unc, { tienTo: 'CK', doDai: 4, hauTo: '-MM/YY' });
    assert.equal((await srv.ok('GET', '/api/vouchers/next?loai=unc&ngay=' + hom)).soPhieu, 'CK0001-' + MM + '/' + YYYY.slice(2));
    // biên bản: không có số thứ tự, độ dài luôn 0
    await srv.ok('PUT', '/api/danh-so/dc', { tienTo: 'BB-', doDai: 5, hauTo: 'NCC/MM.YYYY' });
    assert.equal(KT.soChungTuTiep(await srv.db(), 'dc', '2026-09-30', 's1').soPhieu, 'BB-S1/09.2026');
    assert.equal(readStored(srv.dataDir).settings.danhSo.dc.doDai, 0, 'đã ghi xuống đĩa');
    // các cài đặt khác giữ nguyên
    await srv.ok('PUT', '/api/settings', { tenDonVi: 'Công ty X' });
    assert.equal((await srv.db()).settings.danhSo.chi.soTiep, 40);
  } finally { await srv.stop(); }
});

test('DS3 trang Đánh số chứng từ + Ghi thu / chi: bảng 5 loại có ví dụ; sửa phiếu chi; số tự điền theo Thu / Chi / UNC, đổi ngày đổi tháng; gõ tay thì giữ; ghi tiếp sang số kế tiếp', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({});
  await srv.ok('POST', '/api/projects', { ma: 'CT1', ten: 'Công trình 1' });
  await srv.ok('POST', '/api/suppliers', { ma: 'S1', ten: 'Nhà cung cấp 1' });
  await srv.ok('POST', '/api/entries', { ngay: hom, soPhieu: 'PT021/' + MM, noiDung: 'thu', thu: 100000, maDuAn: 'CT1', maNCC: 'S1' });
  const { browser, page, errors } = await openPage(srv, '#/danh-so');
  try {
    await page.waitForSelector('#danh-so tbody tr[data-loai]');
    assert.deepEqual(await page.$$eval('#danh-so tr[data-loai]', (t) => t.map((x) => x.dataset.loai)), ['thu', 'chi', 'unc', 'mh', 'dc']);
    const viDu = (loai) => page.$eval('#danh-so tr[data-loai="' + loai + '"] [data-c=viDu]', (e) => e.textContent);
    assert.equal(await viDu('thu'), 'PT022/' + MM);
    assert.equal(await viDu('chi'), 'PC001/' + MM);
    assert.equal(await viDu('mh'), 'MH0001/' + MM);
    assert.equal(await viDu('dc'), 'ĐC-' + MM + '/' + YYYY + '-S1');
    assert.equal(await page.$eval('.nav-item.active', (e) => e.dataset.route), 'danh-so');
    // sửa phiếu chi: tiền tố C-, số tiếp theo 7; xem trước đổi theo
    await page.click('#danh-so tr[data-loai=chi] [data-act=sua]');
    await page.waitForSelector('#ds-form');
    await page.fill('#ds-form [name=tienTo]', 'C-');
    await page.fill('#ds-form [name=soTiep]', '7');
    assert.equal(await page.textContent('#ds-vidu'), 'C-007/' + MM);
    await page.fill('#ds-form [name=tienTo]', 'PT');
    await page.click('.modal [data-act=luu]');
    await page.waitForSelector('#ds-loi:not([hidden])');
    assert.match(await page.textContent('#ds-loi'), /Chỉ phiếu thu/);
    await page.fill('#ds-form [name=tienTo]', 'C-');
    await page.click('.modal [data-act=luu]');
    await page.waitForSelector('#ds-form', { state: 'detached' });
    await page.waitForFunction(() => document.querySelector('#danh-so tr[data-loai=chi] [data-c=viDu]').textContent.startsWith('C-'));
    assert.equal(await viDu('chi'), 'C-007/' + MM);

    // Ghi thu / chi: phiếu mới tự có số
    await page.keyboard.press('F3');
    await page.waitForSelector('#entry-page');
    const so = () => page.inputValue('#entry-page [name=soPhieu]');
    assert.equal(await so(), 'C-007/' + MM);
    await page.click('#entry-page label:has(input[name=loai][value=thu])');
    assert.equal(await so(), 'PT022/' + MM, 'chọn Thu tiền → số phiếu thu');
    assert.equal(await page.locator('#entry-page [name=loaiSo]').isVisible(), false, 'phiếu thu không có lựa chọn PC / UNC');
    await page.click('#entry-page label:has(input[name=loai][value=chi])');
    await page.selectOption('#entry-page [name=loaiSo]', 'unc');
    assert.equal(await so(), 'UNC001/' + MM);
    // đổi ngày sang tháng khác: số theo tháng đó
    const date = page.locator('#entry-page .date-field .date-text').first();
    await date.click(); await page.keyboard.press('Control+A'); await page.keyboard.type('15/01/' + YYYY); await page.keyboard.press('Tab');
    assert.equal(await so(), 'UNC001/01');
    await date.click(); await page.keyboard.press('Control+A'); await page.keyboard.type(hom.split('-').reverse().join('/')); await page.keyboard.press('Tab');
    await page.selectOption('#entry-page [name=loaiSo]', 'chi');
    assert.equal(await so(), 'C-007/' + MM);
    assert.match(await page.textContent('#so-hint'), /số tự đánh/);
    // ghi và ghi tiếp: lưu số tự đánh rồi sang số kế tiếp
    await page.fill('#entry-page [name=noiDung]', 'Chi lần 1');
    await page.fill('#entry-page [name=chi]', '200000');
    await dienBatBuoc(page, 'S1', 'CT1');
    await page.click('#entry-page [data-act=save-next]');
    await page.waitForFunction((mm) => document.querySelector('#entry-page [name=soPhieu]').value === 'C-008/' + mm, MM, { timeout: 10000 });
    let st = readStored(srv.dataDir);
    assert.equal(st.entries.find((e) => e.noiDung === 'Chi lần 1').soPhieu, 'C-007/' + MM);
    // gõ số tay: không tự đổi nữa (kể cả khi đổi loại), ghi tiếp thì giữ số đó
    await page.click('#entry-page [name=soPhieu]');
    await page.keyboard.type('C-100/' + MM); // ô đang chọn sẵn số tự đánh → gõ là thay
    assert.equal(await so(), 'C-100/' + MM);
    await page.selectOption('#entry-page [name=loaiSo]', 'unc');
    assert.equal(await so(), 'UNC001/' + MM, 'chủ động đổi PC / UNC thì lấy số mới theo loại');
    await page.selectOption('#entry-page [name=loaiSo]', 'chi');
    await page.fill('#entry-page [name=soPhieu]', 'C-100/' + MM);
    await page.click('#entry-page label:has(input[name=loai][value=thu])');
    await page.click('#entry-page label:has(input[name=loai][value=chi])');
    assert.equal(await so(), 'C-100/' + MM, 'số gõ tay giữ nguyên khi đổi thu / chi');
    await page.fill('#entry-page [name=noiDung]', 'Chi lần 2');
    await page.fill('#entry-page [name=chi]', '300000');
    await page.click('#entry-page [data-act=save-next]');
    await page.waitForFunction(() => document.querySelector('#entry-page [name=chi]').value === '', null, { timeout: 10000 });
    assert.equal(await so(), 'C-100/' + MM, 'số gõ tay giữ để ghi thêm dòng vào cùng phiếu');
    // Số mới → về tự đánh
    await page.click('#entry-page [data-act=so-moi]');
    assert.equal(await so(), 'C-101/' + MM, 'số kế tiếp sau số lớn nhất đã dùng');
    st = readStored(srv.dataDir);
    assert.equal(st.entries.find((e) => e.noiDung === 'Chi lần 2').soPhieu, 'C-100/' + MM);
    assert.deepEqual(errors.filter((e) => !/status of 400/.test(e)), [], 'chỉ có lỗi 400 cố ý (tiền tố PT cho phiếu chi)');
  } finally { await browser.close(); await srv.stop(); }
});

test('DS4 phiếu nhập chi phí tự có số MH; gõ số phiếu giao hàng thì giữ; biên bản đối chiếu lấy số ĐC-MM/YYYY-NCC', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({});
  const db0 = await srv.db();
  await srv.ok('POST', '/api/projects', { ma: 'CT1', ten: 'Công trình 1' });
  await srv.ok('POST', '/api/suppliers', { ma: 'S1', ten: 'Nhà cung cấp 1' });
  await srv.ok('POST', '/api/materials', { ma: 'VA', ten: 'Vật tư A', dvt: 'cái', maHM: db0.costItems[0].ma });
  await srv.ok('POST', '/api/cost-slips', { ngay: hom, maNCC: 'S1', soPhieu: 'MH0209/' + MM, lines: [{ maCT: 'CT1', maVT: 'VA', soLuong: 1, donGia: 1000 }] });
  const { browser, page, errors } = await openPage(srv, '#/cp-nhap');
  try {
    await page.waitForSelector('#cp-head');
    const so = () => page.inputValue('#cp-head [name=soPhieu]');
    assert.equal(await so(), 'MH0210/' + MM);
    assert.match(await page.textContent('#cp-head .field:has([name=soPhieu]) .hint'), /Số tự đánh/);
    const nhapDong = async () => {
      await page.fill('#cp-head [name=maNCC]', 'S1'); await page.locator('#cp-head [name=maNCC]').dispatchEvent('change');
      await page.fill('tr[data-row="0"] [data-col=ct]', 'CT1'); await page.locator('tr[data-row="0"] [data-col=ct]').dispatchEvent('change');
      await page.fill('tr[data-row="0"] [data-col=maVT]', 'VA'); await page.locator('tr[data-row="0"] [data-col=maVT]').dispatchEvent('change');
      await page.fill('tr[data-row="0"] [data-col=soLuong]', '2'); await page.locator('tr[data-row="0"] [data-col=soLuong]').dispatchEvent('change');
      await page.fill('tr[data-row="0"] [data-col=donGia]', '5000'); await page.locator('tr[data-row="0"] [data-col=donGia]').dispatchEvent('change');
    };
    await nhapDong();
    assert.equal(await so(), 'MH0210/' + MM, 'nhập dòng (trang vẽ lại) vẫn giữ số tự đánh');
    await page.click('[data-act=save]');
    await page.waitForFunction((mm) => document.querySelector('#cp-head [name=soPhieu]') && document.querySelector('#cp-head [name=soPhieu]').value === 'MH0211/' + mm, MM, { timeout: 10000 });
    let st = readStored(srv.dataDir);
    assert.ok(st.costs.some((c) => c.soPhieu === 'MH0210/' + MM && c.thanhTien === 10000), 'phiếu vừa ghi mang số MH0210');
    // gõ số phiếu giao hàng: ô chọn sẵn số tự đánh nên gõ là thay; tải lại trang vẫn giữ
    await page.click('#cp-head [name=soPhieu]');
    await page.keyboard.type('GH-77');
    assert.equal(await so(), 'GH-77');
    await nhapDong();
    assert.equal(await so(), 'GH-77');
    await page.click('[data-act=save]');
    await page.waitForFunction((mm) => document.querySelector('#cp-head [name=soPhieu]').value === 'MH0211/' + mm, MM, { timeout: 10000 });
    st = readStored(srv.dataDir);
    assert.ok(st.costs.some((c) => c.soPhieu === 'GH-77'));
    // biên bản đối chiếu
    const html = await page.evaluate(async () => (await import('/js/bienban.js')).bienBanHtml('S1', { to: '2026-09-30' }));
    assert.match(html, /Số: ĐC-09\/2026-S1/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});
