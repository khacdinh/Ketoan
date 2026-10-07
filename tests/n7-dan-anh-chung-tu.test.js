'use strict';
/* N7. Dán ảnh (Ctrl + V) và kéo thả file vào khung "Chứng từ đính kèm": không cần lưu ảnh ra file rồi mới chọn.
 * Phiếu chưa lưu: ảnh dán vào danh sách chờ (có ảnh xem trước, tên anh-dan-<thời điểm>.png), tải lên khi lưu.
 * Chứng từ đã lưu: tải lên ngay. Dán chữ vào ô nhập (bộ nhớ tạm có cả chữ lẫn ảnh, vd ô Excel) vẫn là dán chữ. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, readStored } = require('./helpers');
const { SKIP, openPage, dienBatBuoc } = require('./ui-helpers');

// Giả lập Ctrl + V trên phần tử sel: bộ nhớ tạm có một ảnh PNG (vẽ bằng canvas) và tùy chọn có thêm chữ
function dan(page, sel, opts) {
  return page.evaluate(async ([sel, opts]) => {
    const c = document.createElement('canvas'); c.width = 40; c.height = 30;
    const g = c.getContext('2d'); g.fillStyle = '#b8963f'; g.fillRect(0, 0, 40, 30);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer();
    if (opts && opts.chu) dt.setData('text/plain', opts.chu);
    dt.items.add(new File([blob], (opts && opts.ten) || 'image.png', { type: 'image/png' }));
    const el = sel ? document.querySelector(sel) : document.body;
    if (sel) el.focus();
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  }, [sel, opts || null]);
}
// Giả lập kéo thả một file PNG vào phần tử sel
function tha(page, sel, ten) {
  return page.evaluate(async ([sel, ten]) => {
    const c = document.createElement('canvas'); c.width = 20; c.height = 20;
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], ten, { type: 'image/png' }));
    const el = document.querySelector(sel);
    el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    const on = el.classList.contains('is-drop');
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    return on;
  }, [sel, ten]);
}

async function seed(srv) {
  await srv.ok('POST', '/api/projects', { ma: 'CT1', ten: 'Công trình 1' });
  await srv.ok('POST', '/api/suppliers', { ma: 'S1', ten: 'Nhà cung cấp 1' });
  const db = await srv.db();
  await srv.ok('POST', '/api/materials', { ma: 'VA', ten: 'Vật tư A', dvt: 'cái', maHM: db.costItems[0].ma });
}

test('N7a phiếu nhập chi phí MỚI: Ctrl + V ảnh → danh sách chờ có ảnh xem trước, tên anh-dan-…; dán chữ vào ô nhập vẫn là chữ; kéo thả file; lưu phiếu → chứng từ gắn vào phiếu', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({});
  await seed(srv);
  const { browser, page, errors } = await openPage(srv, '#/cp-nhap');
  try {
    await page.waitForSelector('[data-att-pending]');
    assert.match(await page.$eval('[data-att-pending]', (e) => e.innerText), /Dán ảnh/);
    // dán khi không đứng ở ô nào (ảnh chụp màn hình): vào danh sách chờ
    assert.equal(await dan(page, null), true, 'ảnh được nhận (chặn hành vi mặc định)');
    await page.waitForFunction(() => document.querySelectorAll('[data-att-pending] .att-item').length === 1);
    assert.match(await page.$eval('[data-att-pending] .att-name', (e) => e.textContent), /^anh-dan-\d{8}-\d{6}\.png/);
    assert.equal(await page.locator('[data-att-pending] img.att-thumb').count(), 1, 'ảnh dán có ảnh xem trước');
    // đang ở ô nhập, bộ nhớ tạm có cả chữ (sao chép ô Excel): không nhận ảnh, để trình duyệt dán chữ
    assert.equal(await dan(page, '[data-row="0"][data-col=dienGiai]', { chu: 'Xi măng PCB40' }), false);
    // đang ở ô nhập, bộ nhớ tạm chỉ có ảnh: vẫn nhận vào chứng từ; ảnh có tên riêng thì giữ tên
    assert.equal(await dan(page, '#cp-head [name=maNCC]', { ten: 'hoa-don-12.png' }), true);
    await page.waitForFunction(() => document.querySelectorAll('[data-att-pending] .att-item').length === 2);
    // kéo thả
    assert.equal(await tha(page, '[data-att-pending]', 'phieu giao hang.png'), true, 'khung sáng viền khi kéo file vào');
    await page.waitForFunction(() => document.querySelectorAll('[data-att-pending] .att-item').length === 3);
    assert.equal(await page.locator('[data-att-pending].is-drop').count(), 0);
    // lưu phiếu → 3 chứng từ gắn vào phiếu
    await page.fill('#cp-head [name=maNCC]', 'S1'); await page.locator('#cp-head [name=maNCC]').dispatchEvent('change');
    for (const [col, v] of [['ct', 'CT1'], ['maVT', 'VA'], ['soLuong', '2'], ['donGia', '5000']]) {
      await page.fill('tr[data-row="0"] [data-col=' + col + ']', v); await page.locator('tr[data-row="0"] [data-col=' + col + ']').dispatchEvent('change');
    }
    await page.click('#view [data-act=save]');
    await page.waitForFunction(() => /Đã đính kèm 3 \/ 3 file/.test(document.querySelector('#toast-root').textContent), null, { timeout: 10000 });
    const st = readStored(srv.dataDir);
    const pid = st.costs[0].phieuId;
    const ten = st.attachments.filter((a) => a.owner === 'slips' && a.ownerId === pid).map((a) => a.name).sort();
    assert.equal(ten.length, 3);
    assert.match(ten[0], /^anh-dan-\d{8}-\d{6}\.png$/);
    assert.deepEqual(ten.slice(1), ['hoa-don-12.png', 'phieu giao hang.png']);
    assert.ok(st.attachments.every((a) => a.type === 'image/png'), 'máy chủ nhận đúng ảnh PNG');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});

test('N7b chứng từ đã lưu: Ctrl + V trên trang sửa dòng thu chi tải lên ngay; hộp thoại chỉ xem không nhận ảnh dán', { skip: SKIP, timeout: 180000 }, async () => {
  const srv = await startServer({});
  await seed(srv);
  const { browser, page, errors } = await openPage(srv, '#/so-thu-chi');
  try {
    // Ghi thu / chi mới: dán vào danh sách chờ, Ghi sổ thì tải lên
    await page.keyboard.press('F3');
    await page.waitForSelector('#entry-page [data-att-pending]');
    await page.fill('#entry-page [name=noiDung]', 'Trả tiền vật tư');
    await page.fill('#entry-page [name=chi]', '150000');
    await dienBatBuoc(page, 'S1', 'CT1');
    assert.equal(await dan(page, null), true);
    await page.waitForFunction(() => document.querySelectorAll('#entry-page [data-att-pending] .att-item').length === 1);
    await page.click('#entry-page [data-act=save]');
    await page.waitForFunction(() => /Đã đính kèm 1 \/ 1 file/.test(document.querySelector('#toast-root').textContent), null, { timeout: 10000 });
    let st = readStored(srv.dataDir);
    const e = st.entries.find((x) => x.noiDung === 'Trả tiền vật tư');
    assert.equal(st.attachments.filter((a) => a.owner === 'entries' && a.ownerId === e.id).length, 1);
    // mở sửa dòng đó: dán thêm ảnh → tải lên ngay
    await page.evaluate(() => { location.hash = '#/so-thu-chi'; });
    await page.waitForSelector('#view tr[data-id="' + e.id + '"]');
    await page.dblclick('#view tr[data-id="' + e.id + '"]');
    await page.waitForSelector('#entry-page [data-att-owner]');
    assert.equal(await dan(page, null), true);
    await page.waitForFunction(() => document.querySelectorAll('#entry-page [data-att-owner] .att-item').length === 2, null, { timeout: 10000 });
    st = readStored(srv.dataDir);
    assert.equal(st.attachments.filter((a) => a.owner === 'entries' && a.ownerId === e.id).length, 2);
    // hộp thoại chỉ xem (bấm kẹp giấy): dán không làm gì
    await page.keyboard.press('Escape');
    await page.waitForSelector('#view .clip');
    await page.click('#view .clip');
    await page.waitForSelector('.modal [data-att-ro]');
    assert.equal(await dan(page, null), false);
    await page.waitForTimeout(300);
    assert.equal(readStored(srv.dataDir).attachments.length, 2);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await srv.stop(); }
});
