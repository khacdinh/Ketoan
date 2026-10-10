'use strict';
/* T. Cổng MCP cho trợ lý AI (scripts/mcp-ketoan.js): giao thức, số liệu (kỳ vọng tính tay từ dữ liệu mẫu), tìm mã theo tên,
 * bỏ phiếu nháp, CHỈ ĐỌC (file dữ liệu không đổi), tự đọc lại khi phần mềm ghi thêm. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { ROOT, startServer } = require('./helpers');
const { SKIP, chromium, settle } = require('./ui-helpers');

const SCRIPT = path.join(ROOT, 'scripts', 'mcp-ketoan.js');

function seed() {
  let id = 1;
  const db = {
    schema: 3, settings: {}, vouchers: {}, trash: [], locks: [], attachments: [], cashCounts: [], ignoredWarnings: {},
    projects: [
      { id: id++, ma: 'CT1', ten: 'Công trình Lê Lợi', nganSach: 0, trangThai: 'Đang thực hiện', ghiChu: '' },
      { id: id++, ma: 'CT2', ten: 'Công trình Trần Phú', nganSach: 0, trangThai: 'Đang thực hiện', ghiChu: '' }
    ],
    suppliers: [
      { id: id++, ma: 'NCC_A', ten: 'Vật liệu Hòa Phát', loai: 'Vật tư', sdt: '', diaChi: '', ghiChu: '' },
      { id: id++, ma: 'NCC_B', ten: 'Đội thợ Bình', loai: 'Nhân công', sdt: '', diaChi: '', ghiChu: '' }
    ],
    costGroups: [{ id: id++, ma: 'G1', ten: 'Vật liệu', ghiChu: '' }],
    costItems: [{ id: id++, ma: 'HM01', ten: 'Sắt thép', maNhom: 'G1', ghiChu: '' }],
    materials: [{ id: id++, ma: 'VT1', ten: 'Thép phi 10', dvt: 'kg', maHM: 'HM01', ghiChu: '' }],
    houses: [], costs: [], entries: []
  };
  const cost = (ngay, ct, ncc, tt, extra) => db.costs.push(Object.assign({ id: id++, seq: db.costs.length + 1, phieuId: 0, ngay, maCT: ct, maNha: '', maHM: 'HM01', loaiCP: 'Vật tư', maVT: '',
    dienGiai: 'cp ' + db.costs.length, soLuong: null, donGia: null, thanhTien: tt, maNCC: ncc, soPhieu: '', ghiChu: '', nguon: 'mau' }, extra || {}));
  const entry = (ngay, ct, ncc, thu, chi, soPhieu) => db.entries.push({ id: id++, seq: db.entries.length + 1, ngay, soPhieu: soPhieu || '', maDuAn: ct, maNCC: ncc,
    noiDung: 'tc ' + db.entries.length, thu, chi, nguoiNhan: '', ghiChu: '' });
  cost('2026-06-20', 'CT1', 'NCC_A', 7000000);
  cost('2026-07-02', 'CT1', 'NCC_A', 40000000);
  cost('2026-07-10', 'CT2', 'NCC_A', 25000000);
  cost('2026-07-12', 'CT1', 'NCC_B', 18000000, { loaiCP: 'Nhân công' });
  cost('2026-07-20', 'CT1', 'NCC_A', 1500000, { maVT: 'VT1', soLuong: 100, donGia: 15000, soPhieu: 'MH0001/07' });
  cost('2026-07-25', 'CT1', 'NCC_A', 800000, { maVT: 'VT1', soLuong: 50, donGia: 16000 });
  cost('2026-08-03', 'CT1', 'NCC_A', 9000000);
  cost('2026-07-28', 'CT1', 'NCC_A', 99000000, { trangThai: 'nhap' }); // phiếu nháp: không tính
  entry('2026-06-01', '', '', 200000000, 0, 'PT001/06');
  entry('2026-06-25', 'CT1', 'NCC_A', 0, 2000000, 'PC001/06');
  entry('2026-07-15', 'CT1', 'NCC_A', 0, 10000000, 'PC001/07');
  entry('2026-07-16', 'CT1', 'NCC_B', 0, 5000000, 'PC002/07');
  entry('2026-07-18', 'CT1', 'NCC_A', 500000, 0, 'PT001/07');
  db.nextId = id + 5;
  return db;
}

// Máy khách MCP tối thiểu: mỗi dòng stdout một thông điệp JSON-RPC
function moCong(dataDir) {
  const ch = spawn(process.execPath, [SCRIPT], { env: Object.assign({}, process.env, { KETOAN_DATA: dataDir }) });
  let buf = '';
  let stderr = '';
  const cho = new Map();
  ch.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      const m = JSON.parse(line); // stdout chỉ được có JSON-RPC
      const w = cho.get(m.id);
      if (w) { cho.delete(m.id); w(m); }
    }
  });
  ch.stderr.on('data', (d) => { stderr += d; });
  let n = 0;
  const gui = (method, params) => new Promise((resolve, reject) => {
    const id = ++n;
    const t = setTimeout(() => reject(new Error('Không trả lời ' + method + '\n' + stderr)), 10000);
    cho.set(id, (m) => { clearTimeout(t); resolve(m); });
    ch.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const goi = async (name, args) => {
    const m = await gui('tools/call', { name, arguments: args || {} });
    assert.ok(m.result, JSON.stringify(m));
    return m.result;
  };
  const so = async (name, args) => {
    const r = await goi(name, args);
    assert.equal(r.isError, false, r.content[0].text);
    return JSON.parse(r.content[0].text);
  };
  return { ch, gui, goi, so, raw: (s) => ch.stdin.write(s + '\n'), dong: () => { ch.stdin.end(); return new Promise((r) => ch.on('exit', r)); }, get stderr() { return stderr; } };
}

const bam = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

test('T1 giao thức MCP: initialize, tools/list, lỗi đúng chuẩn', async () => {
  const srv = await startServer({ seed: seed() });
  const c = moCong(srv.dataDir);
  try {
    const init = await c.gui('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    assert.equal(init.result.protocolVersion, '2025-06-18');
    assert.equal(init.result.serverInfo.name, 'ke-toan-cong-trinh');
    assert.ok(init.result.capabilities.tools);
    assert.match(init.result.instructions, /chỉ đọc/);
    const cu = await c.gui('initialize', { protocolVersion: '2099-01-01' });
    assert.equal(cu.result.protocolVersion, '2025-06-18', 'phiên bản lạ → trả bản mới nhất máy chủ hỗ trợ');
    c.raw(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
    const ds = await c.gui('tools/list', {});
    const ten = ds.result.tools.map((t) => t.name).sort();
    assert.deepEqual(ten, ['canh_bao', 'cong_no_ncc', 'cong_no_theo_cong_trinh', 'gia_vat_tu', 'so_chi_phi', 'so_quy', 'tim_danh_muc', 'tong_hop_chi_phi', 'tong_hop_thu_chi', 'tong_quan', 'tuoi_no']);
    ds.result.tools.forEach((t) => {
      assert.equal(t.inputSchema.type, 'object', t.name);
      assert.equal(t.annotations.readOnlyHint, true, t.name + ' phải đánh dấu chỉ đọc');
      assert.ok(t.description.length > 20, t.name);
    });
    assert.deepEqual((await c.gui('ping')).result, {});
    assert.equal((await c.gui('khong/co')).error.code, -32601);
    assert.equal((await c.gui('tools/call', { name: 'xoa_het', arguments: {} })).error.code, -32602);
  } finally { await c.dong(); await srv.stop(); }
});

test('T2 số liệu khớp kỳ vọng tính tay; phiếu nháp không tính; tìm theo tên', async () => {
  const srv = await startServer({ seed: seed() });
  const c = moCong(srv.dataDir);
  try {
    await c.gui('initialize', { protocolVersion: '2025-06-18' });
    // Tồn quỹ = 200 − 2 − 10 − 5 + 0,5 = 183,5 triệu. Nợ A = (7+40+25+1,5+0,8+9) − (2+10−0,5) = 71,8 tr; B = 18 − 5 = 13 tr
    const tq = await c.so('tong_quan', {});
    assert.equal(tq.tonQuyHienTai, 183500000);
    assert.equal(tq.congNoNCC.conPhaiTra, 84800000);
    assert.equal(tq.soLieuDen, '2026-08-03');
    assert.equal(tq.thang.thang, '2026-08');
    assert.equal(tq.thang.chiPhiCongTrinh, 9000000);

    // Tháng 7, NCC tìm theo tên không dấu: đầu kỳ 7 − 2 = 5; phát sinh 40+25+1,5+0,8 = 67,3; thanh toán 10 − 0,5 = 9,5; cuối 62,8
    const a7 = await c.so('cong_no_ncc', { ncc: 'hoa phat', tu: '2026-07', den: '2026-07' });
    assert.equal(a7.ncc.rows.length, 1);
    const r = a7.ncc.rows[0];
    assert.deepEqual([r.ma, r.dauKy, r.phatSinh, r.thanhToan, r.cuoiKy], ['NCC_A', 5000000, 67300000, 9500000, 62800000]);
    assert.equal(r.tinhTrang, 'còn phải trả');

    // Theo công trình: CT2 chỉ có 25 tr của A, chưa trả
    const ct2 = await c.so('cong_no_theo_cong_trinh', { cong_trinh: 'tran phu' });
    assert.equal(ct2.congTrinh.length, 1);
    assert.equal(ct2.congTrinh[0].ma, 'CT2');
    assert.equal(ct2.congTrinh[0].conPhaiTra, 25000000);

    const tn = await c.so('tuoi_no', { den: '2026-08-31' });
    assert.equal(tn.tong.tatCa, 84800000, 'tổng tuổi nợ = tổng còn phải trả');

    // Chi phí: tổng 101,3 tr (không có 99 tr nháp); CT1 76,3; CT2 25
    const th = await c.so('tong_hop_chi_phi', { theo: 'ct' });
    assert.equal(th.tong, 101300000);
    assert.deepEqual(th.hang.map((h) => [h.ma, h.giaTri]), [['CT1', 76300000], ['CT2', 25000000]]);
    const thLoai = await c.so('tong_hop_chi_phi', { theo: 'ct', cot: 'loai', cong_trinh: 'CT1' });
    assert.equal(thLoai.hang[0].theoCot['Nhân công'], 18000000);

    const cp = await c.so('so_chi_phi', { tim: 'MH0001' });
    assert.equal(cp.dong.tongSoDong, 1);
    assert.equal(cp.dong.rows[0].vatTu, 'Thép phi 10');
    assert.equal(cp.tongTien, 1500000);
    const khoan = await c.so('so_chi_phi', { ncc: 'NCC_B' });
    assert.equal(khoan.dong.rows[0].soLuong, null, 'dòng theo khoản: không có số lượng');

    // Giá vật tư: gần nhất 16.000, thấp 15.000, cao 16.000, bình quân (1,5 tr + 0,8 tr) / 150 = 15.333
    const g = await c.so('gia_vat_tu', { vat_tu: 'thep phi 10' });
    assert.deepEqual([g.giaGanNhat.donGia, g.giaThapNhat, g.giaCaoNhat, g.giaBinhQuan, g.soLanMua], [16000, 15000, 16000, 15333, 2]);
    assert.equal(g.theoNCC[0].ma, 'NCC_A');

    const sq = await c.so('so_quy', { tu: '2026-07-01', den: '2026-07-31', loai: 'chi' });
    assert.equal(sq.tonDauKy, 198000000);
    assert.equal(sq.tongChi, 15000000);
    assert.equal(sq.phieu.rows[0].soPhieu, 'PC002/07', 'mới nhất trước');
    const tc = await c.so('tong_hop_thu_chi', { theo: 'thang' });
    assert.deepEqual(tc.hang.rows.map((x) => [x.ma, x.thu, x.chi]), [['2026-06', 200000000, 2000000], ['2026-07', 500000, 15000000]]);

    const dm = await c.so('tim_danh_muc', { loai: 'vt', tim: 'thep' });
    assert.equal(dm['vật tư'].rows[0].tenHM, 'Sắt thép');

    const cb = await c.so('canh_bao', {});
    assert.ok(cb.theoNhom['Phiếu nháp để lâu chưa ghi sổ'] >= 1, 'cảnh báo tính cả phiếu nháp như màn Cần xử lý');

    // Tên khớp nhiều mục / tham số sai → isError kèm gợi ý, không làm hỏng phiên
    const nhieu = await c.goi('cong_no_ncc', { cong_trinh: 'công trình' });
    assert.equal(nhieu.isError, true);
    assert.match(nhieu.content[0].text, /khớp 2 công trình.*CT1.*CT2/);
    const khongCo = await c.goi('cong_no_ncc', { ncc: 'hoa phatt' });
    assert.equal(khongCo.isError, true, 'gõ sai tên: báo không thấy, không trả số 0');
    assert.match(khongCo.content[0].text, /Không thấy nhà cung cấp/);
    const sai = await c.goi('so_quy', { tu: '30/09/2026' });
    assert.equal(sai.isError, true);
    assert.match(sai.content[0].text, /YYYY-MM-DD/);
    assert.equal((await c.goi('tong_hop_chi_phi', {})).isError, true);
    assert.equal((await c.so('tong_quan', {})).tonQuyHienTai, 183500000);
    assert.equal(c.stderr.includes('Lỗi khi chạy'), false, c.stderr);
  } finally { await c.dong(); await srv.stop(); }
});

test('T3 chỉ đọc: file dữ liệu không đổi; phần mềm ghi thêm thì trợ lý thấy ngay', async () => {
  const srv = await startServer({ seed: seed() });
  const file = path.join(srv.dataDir, 'ketoan.db');
  const c = moCong(srv.dataDir);
  try {
    await c.gui('initialize', { protocolVersion: '2025-06-18' });
    const truoc = bam(file);
    const ds = (await c.gui('tools/list', {})).result.tools;
    for (const t of ds) {
      const args = t.name === 'gia_vat_tu' ? { vat_tu: 'VT1' } : (t.inputSchema.required || []).includes('theo') ? { theo: 'thang' } : {};
      const r = await c.goi(t.name, args);
      assert.equal(r.isError, false, t.name + ': ' + r.content[0].text);
    }
    assert.equal(bam(file), truoc, 'cổng MCP không được ghi vào file dữ liệu');

    await new Promise((r) => setTimeout(r, 20));
    await srv.ok('POST', '/api/entries', { ngay: '2026-08-05', noiDung: 'chi thêm', chi: 3500000 });
    const tq = await c.so('tong_quan', {});
    assert.equal(tq.tonQuyHienTai, 180000000, 'đọc lại dữ liệu sau khi phần mềm ghi');
  } finally { await c.dong(); await srv.stop(); }
});

test('T4 --kiem-tra: báo đọc được dữ liệu / báo lỗi rõ khi không có file', async () => {
  const srv = await startServer({ seed: seed() });
  await srv.stop();
  const chay = (dir) => new Promise((resolve) => {
    const ch = spawn(process.execPath, [SCRIPT, '--kiem-tra'], { env: Object.assign({}, process.env, { KETOAN_DATA: dir }) });
    let out = '';
    ch.stdout.on('data', (d) => { out += d; });
    ch.on('exit', (code) => resolve({ code, out }));
  });
  const ok = await chay(srv.dataDir);
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /Tồn quỹ: 183\.500\.000 đ/);
  const loi = await chay(path.join(srv.dataDir, 'khong-co'));
  assert.equal(loi.code, 1);
  assert.match(loi.out, /LỖI: Không thấy file dữ liệu/);
});

test('T5 link "Xem trên phần mềm": đúng cổng, mở đúng màn hình đã lọc sẵn, đặt lại bộ lọc cũ', { skip: SKIP }, async () => {
  const srv = await startServer({ seed: seed() });
  const fileCong = path.join(srv.dataDir, '.dang-chay-cong.json');
  const c = moCong(srv.dataDir);
  const browser = await chromium.launch();
  try {
    assert.equal(JSON.parse(fs.readFileSync(fileCong, 'utf8')).port, srv.port, 'phần mềm ghi cổng đang chạy');
    await c.gui('initialize', { protocolVersion: '2025-06-18' });
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const mo = async (lk) => {
      assert.equal(lk.luuY, undefined, 'phần mềm đang chạy: không cần nhắc mở');
      assert.match(lk.url, new RegExp('^http://localhost:' + srv.port + '/#/'));
      await page.goto('about:blank');
      await page.goto(lk.url);
      await page.waitForFunction(() => document.querySelector('#view') && document.querySelector('#view').innerText.trim().length > 10, null, { timeout: 30000 });
      await settle(page);
      return page.evaluate(() => ({ hash: location.hash, view: document.querySelector('#view').innerText, ct: (document.querySelector('#tb-ct-val') || {}).textContent || '', ls: Object.fromEntries(Object.keys(localStorage).map((k) => [k, JSON.parse(localStorage.getItem(k))])) }));
    };

    // Sổ quỹ tháng 7, chỉ phiếu chi: tổng chi 15 tr
    let r = await mo((await c.so('so_quy', { tu: '2026-07-01', den: '2026-07-31', loai: 'chi' })).xemTrenPhanMem);
    assert.equal(r.hash, '#/so-thu-chi', 'bỏ phần "?…" sau khi áp dụng');
    const so = r.ls['stc.filter.so'];
    assert.deepEqual([so.period, so.from, so.to, so.loai], ['khoang', '2026-07-01', '2026-07-31', 'chi']);
    assert.match(r.view, /15\.000\.000/);
    assert.doesNotMatch(r.view, /PT001\/07/, 'phiếu thu không hiện khi lọc chi');

    // Link không lọc gì: đặt lại bộ lọc cũ của Sổ quỹ
    r = await mo((await c.so('tong_hop_thu_chi', { theo: 'thang' })).xemTrenPhanMem);
    assert.deepEqual([r.ls['stc.filter.so'].period, r.ls['stc.filter.so'].loai], ['tat-ca', '']);
    assert.match(r.view, /PT001\/07/);

    // Một NCC, một công trình → Sổ chi tiết NCC, công trình chung ở thanh trên
    const cn = await c.so('cong_no_ncc', { ncc: 'hoa phat', cong_trinh: 'le loi', tu: '2026-07' });
    assert.equal(cn.tong.cuoiKy, 46800000);
    r = await mo(cn.xemTrenPhanMem);
    assert.equal(r.hash, '#/so-chi-tiet-ncc');
    assert.equal(r.ls['stc.sct.ncc'], 'NCC_A');
    assert.equal(r.ls['stc.ct'], 'CT1');
    assert.match(r.ct, /CT1/);
    assert.match(r.view, /Số dư đầu kỳ 01\/07/);
    assert.match(r.view, /Cộng phát sinh từ ngày 01\/07\/2026[^\n]*46\.800\.000/, 'màn hình ra đúng số cuối kỳ trợ lý trả lời');

    // Sổ chi phí theo vật tư: 1,5 tr + 0,8 tr
    r = await mo((await c.so('so_chi_phi', { vat_tu: 'thep phi 10' })).xemTrenPhanMem);
    assert.equal(r.hash, '#/cp-so');
    assert.equal(r.ls['stc.filter.cpSo'].vt, 'VT1');
    assert.equal(r.ls['stc.ct'], '', 'link không ghi công trình: bỏ công trình đang chọn');
    assert.match(r.view, /2\.300\.000/);

    // Tuổi nợ → Phân tích, báo cáo tuổi nợ, ngày tính đến
    r = await mo((await c.so('tuoi_no', { den: '2026-08-31' })).xemTrenPhanMem);
    assert.equal(r.hash, '#/phan-tich');
    assert.deepEqual([r.ls['stc.filter.bi'].rep, r.ls['stc.filter.bi'].den], ['tuoi-no', '2026-08-31']);
    assert.match(r.view, /84\.800\.000|84,8/);

    // Giá vật tư, công nợ theo công trình, cảnh báo
    r = await mo((await c.so('gia_vat_tu', { vat_tu: 'VT1' })).xemTrenPhanMem);
    assert.equal(r.ls['stc.filter.cpGia'].vt, 'VT1');
    r = await mo((await c.so('cong_no_theo_cong_trinh', { cong_trinh: 'CT2', tinh_trang: 'no' })).xemTrenPhanMem);
    assert.equal(r.hash, '#/cong-no-ct');
    assert.equal(r.ls['stc.filter.cnCt'].tt, 'no');
    assert.equal(r.ls['stc.ct'], 'CT2');
    r = await mo((await c.so('canh_bao', {})).xemTrenPhanMem);
    assert.equal(r.hash, '#/kiem-soat');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await c.dong(); await srv.stop(); }

  assert.equal(fs.existsSync(fileCong), false, 'tắt phần mềm thì xóa file cổng');
  const c2 = moCong(srv.dataDir);
  try {
    await c2.gui('initialize', { protocolVersion: '2025-06-18' });
    const lk = (await c2.so('tong_quan', {})).xemTrenPhanMem;
    assert.match(lk.luuY, /Phần mềm đang tắt/);
  } finally { await c2.dong(); }
});
