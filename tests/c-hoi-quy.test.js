'use strict';
/* C. Hồi quy chức năng sổ thu chi (phần nghiệp vụ, qua API thật và module tính toán dùng chung) */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { KT, startServer, makeDataDir, readJsonFile, orphanErrors } = require('./helpers');

const V2 = path.join(__dirname, 'fixtures', 'ketoan-v2-hien-tai.json');

// bộ sinh số ngẫu nhiên cố định (lặp lại được)
function prng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

test('C1 parseAmount: các dạng nhập tiền hợp lệ', () => {
  const ok = {
    '1.250.000': 1250000, '1,250,000': 1250000, '1250000': 1250000, '50tr': 50000000, '50 tr': 50000000, '1,5tr': 1500000, '1.5tr': 1500000,
    '0,5tr': 500000, '300k': 300000, '300K': 300000, '58000+11000': 69000, '50tr+300k': 50300000, '1.250.000 đ': 1250000, '1.250.000đ': 1250000,
    '=5000*3': 15000, '(1+2)*1000': 3000, '5tr/2': 2500000, '2 tỷ': 2000000000, '1,2 tỷ': 1200000000, '100 000': 100000, '': 0, '0': 0, '2.500': 2500,
    '3 triệu': 3000000, '750 nghìn': 750000
  };
  Object.keys(ok).forEach((s) => assert.equal(KT.parseAmount(s), ok[s], JSON.stringify(s)));
  assert.equal(KT.parseAmount(1250000.4), 1250000);
  assert.equal(KT.parseAmount(1250000.5), 1250001);
});

test('C1b parseAmount: dữ liệu sai phải cho NaN, không được ra số tiền bậy', () => {
  ['abc', '1e6', '12.5', '1,5', '1/0', '5tr abc', '1..2', '((1)', '2tr5', '1tr250k', '1tỷ2', '3k5', '--', '1+', '*5', 'Infinity', 'NaN', '0x10', ';DROP'].forEach((s) => {
    const v = KT.parseAmount(s);
    assert.ok(Number.isNaN(v), JSON.stringify(s) + ' phải là NaN nhưng ra ' + v);
  });
});

test('C2 docTienBangChu: đọc số tiền bằng chữ đúng chính tả', () => {
  const want = {
    1: 'Một đồng', 5: 'Năm đồng', 10: 'Mười đồng', 11: 'Mười một đồng', 14: 'Mười bốn đồng', 15: 'Mười lăm đồng', 21: 'Hai mươi mốt đồng', 24: 'Hai mươi bốn đồng',
    25: 'Hai mươi lăm đồng', 31: 'Ba mươi mốt đồng', 100: 'Một trăm đồng', 101: 'Một trăm linh một đồng', 105: 'Một trăm linh năm đồng', 110: 'Một trăm mười đồng',
    115: 'Một trăm mười lăm đồng', 1000: 'Một nghìn đồng', 1005: 'Một nghìn không trăm linh năm đồng', 21000: 'Hai mươi mốt nghìn đồng', 100500: 'Một trăm nghìn năm trăm đồng',
    1000000: 'Một triệu đồng', 1250000: 'Một triệu hai trăm năm mươi nghìn đồng', 15000000: 'Mười lăm triệu đồng', 1000000000: 'Một tỷ đồng',
    123456789: 'Một trăm hai mươi ba triệu bốn trăm năm mươi sáu nghìn bảy trăm tám mươi chín đồng',
    2532577035: 'Hai tỷ năm trăm ba mươi hai triệu năm trăm bảy mươi bảy nghìn không trăm ba mươi lăm đồng',
    1000000000000: 'Một nghìn tỷ đồng'
  };
  Object.keys(want).forEach((n) => assert.equal(KT.docTienBangChu(Number(n)), want[n], 'số ' + n));
  assert.equal(KT.docTienBangChu(0), '');
});

test('C3 costAmount = SL × ĐG làm tròn chính xác theo số nguyên (đối chiếu BigInt), không lệch 1 đồng', () => {
  const rnd = prng(12345);
  let bad = 0;
  for (let i = 0; i < 20000; i++) {
    const sl4 = Math.floor(rnd() * 5e7) + 1; // số lượng × 10000 (tối đa 4 chữ số thập phân), đến 5000
    const dg = Math.floor(rnd() * 2e9); // đơn giá nguyên
    const sl = sl4 / 10000;
    const exact = (BigInt(sl4) * BigInt(dg) * 2n + 10000n) / 20000n; // làm tròn nửa lên
    if (BigInt(KT.costAmount(sl, dg)) !== exact) { bad++; if (bad < 5) console.log('lệch', sl, dg, KT.costAmount(sl, dg), exact); }
  }
  assert.equal(bad, 0);
  assert.equal(KT.costAmount(2.5, 580000), 1450000);
  assert.equal(KT.costAmount(0.1, 3), 0);
  assert.equal(KT.costAmount(1.1, 3), 3); // 3.3 → 3
  assert.equal(KT.costAmount(12, 60000), 720000);
  assert.equal(KT.costAmount(8000, 2300), 18400000);
});

test('C4 sổ thu chi: thêm/sửa/xóa/xóa nhiều; tồn quỹ lũy kế khớp bản tính độc lập qua 300 thao tác ngẫu nhiên', async () => {
  const srv = await startServer({});
  try {
    await srv.ok('POST', '/api/projects', { ma: 'P1', ten: 'Dự án 1', nganSach: 50000000 });
    await srv.ok('POST', '/api/projects', { ma: 'P2', ten: 'Dự án 2' });
    await srv.ok('POST', '/api/suppliers', { ma: 'S1', ten: 'Nhà cung cấp 1' });
    await srv.ok('POST', '/api/suppliers', { ma: 'S2', ten: 'Nhà cung cấp 2' });
    // các dạng nhập tiền qua API
    const forms = [['1.250.000', 1250000], ['50tr', 50000000], ['1,5tr', 1500000], ['300k', 300000], ['58000+11000', 69000]];
    for (const [s, n] of forms) {
      const r = await srv.ok('POST', '/api/entries', { ngay: '2026-09-01', noiDung: 'dạng ' + s, chi: s });
      const e = (await srv.db()).entries.find((x) => x.id === r.id);
      assert.equal(e.chi, n, s);
      assert.equal(e.thu, 0);
      await srv.ok('DELETE', '/api/entries/' + r.id);
    }
    assert.equal((await srv.db()).entries.length, 0);

    const rnd = prng(2026);
    const model = new Map(); // id → bản ghi mong đợi
    const dates = ['2026-08-30', '2026-09-01', '2026-09-05', '2026-09-05', '2026-09-12', '2026-09-28', '2026-10-01'];
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    for (let step = 0; step < 300; step++) {
      const op = rnd();
      const ids = Array.from(model.keys());
      if (op < 0.55 || ids.length < 5) {
        const isThu = rnd() < 0.35;
        const amt = (Math.floor(rnd() * 5000) + 1) * 1000 + (rnd() < 0.2 ? Math.floor(rnd() * 999) : 0);
        const body = { ngay: pick(dates), noiDung: 'dòng ' + step, maDuAn: pick(['', 'P1', 'P2']), maNCC: pick(['', 'S1', 'S2']) };
        body[isThu ? 'thu' : 'chi'] = amt;
        const r = await srv.ok('POST', '/api/entries', body);
        model.set(r.id, Object.assign({ thu: 0, chi: 0 }, body));
      } else if (op < 0.75) {
        const id = pick(ids); const cur = model.get(id);
        const body = Object.assign({}, cur, { ngay: pick(dates), chi: cur.chi ? cur.chi + 500 : 0, thu: cur.thu ? cur.thu + 500 : 0 });
        await srv.ok('PUT', '/api/entries/' + id, body);
        model.set(id, body);
      } else if (op < 0.92) {
        const id = pick(ids);
        await srv.ok('DELETE', '/api/entries/' + id);
        model.delete(id);
      } else {
        const del = [pick(ids), pick(ids)];
        const r = await srv.ok('POST', '/api/entries/delete', { ids: del });
        assert.equal(r.deleted, new Set(del).size);
        del.forEach((i) => model.delete(i));
      }
    }
    const db = await srv.db();
    assert.equal(db.entries.length, model.size);
    // bản tính độc lập: sắp xếp theo (ngày, seq) rồi cộng dồn
    const sorted = db.entries.slice().sort((a, b) => (a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : a.seq - b.seq));
    let ton = 0;
    const led = KT.buildLedger(db);
    assert.equal(led.length, sorted.length);
    sorted.forEach((e, i) => {
      const m = model.get(e.id);
      assert.equal(e.thu, m.thu); assert.equal(e.chi, m.chi); assert.equal(e.ngay, m.ngay);
      ton += e.thu - e.chi;
      assert.equal(led[i].id, e.id);
      assert.equal(led[i].ton, ton, 'tồn quỹ dòng ' + (i + 1));
    });
    // seq duy nhất
    assert.equal(new Set(db.entries.map((e) => e.seq)).size, db.entries.length);
    assert.deepEqual(orphanErrors(db), []);
    // đọc lại từ file trên đĩa giống bộ nhớ
    assert.deepEqual(readJsonFile(path.join(srv.dataDir, 'ketoan.json')).entries, db.entries);
  } finally { await srv.stop(); }
});

test('C5 lọc sổ theo kỳ / dự án / NCC / thu-chi / từ khóa khớp bản lọc độc lập (dữ liệu thật)', () => {
  const db = readJsonFile(V2);
  const led = KT.buildLedger(db);
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  const cases = [
    {}, { from: '2026-09-05' }, { to: '2026-09-10' }, { from: '2026-09-05', to: '2026-09-20' }, { duAn: 'DANDC10' }, { duAn: '__none__' }, { ncc: 'NCC_DIENTHUY' }, { ncc: '__none__' },
    { loai: 'thu' }, { loai: 'chi' }, { q: 'xi măng' }, { q: 'XI MANG' }, { q: '1.250.000' }, { q: 'pc001' }, { duAn: 'DANDC10', loai: 'chi', from: '2026-09-01', to: '2026-09-30' }, { q: 'không có gì khớp zzz' }
  ];
  cases.forEach((f) => {
    const res = KT.filterLedger(led, f);
    const expectRows = led.filter((r) => {
      if (f.from && r.ngay < f.from) return false;
      if (f.to && r.ngay > f.to) return false;
      if (f.duAn === '__none__' ? r.maDuAn : f.duAn && r.maDuAn.toLowerCase() !== f.duAn.toLowerCase()) return false;
      if (f.ncc === '__none__' ? r.maNCC : f.ncc && r.maNCC.toLowerCase() !== f.ncc.toLowerCase()) return false;
      if (f.loai === 'thu' && !(r.thu > 0)) return false;
      if (f.loai === 'chi' && !(r.chi > 0)) return false;
      if (f.q) {
        const hay = norm([r.soPhieu, r.maDuAn, r.tenDuAn, r.maNCC, r.tenNCC, r.noiDung, r.nguoiNhan, r.ghiChu, KT.fmtMoney(r.thu), KT.fmtMoney(r.chi)].join(' '));
        if (!hay.includes(norm(f.q).trim())) return false;
      }
      return true;
    });
    assert.deepEqual(res.rows.map((r) => r.id), expectRows.map((r) => r.id), JSON.stringify(f));
    assert.equal(res.tongThu, expectRows.reduce((t, r) => t + r.thu, 0), 'tổng thu ' + JSON.stringify(f));
    assert.equal(res.tongChi, expectRows.reduce((t, r) => t + r.chi, 0), 'tổng chi ' + JSON.stringify(f));
    if (f.from) {
      const before = led.filter((r) => r.ngay < f.from);
      assert.equal(res.tonDauKy, before.length ? before[before.length - 1].ton : 0, 'tồn đầu kỳ ' + JSON.stringify(f));
    }
  });
  // tồn đầu kỳ + thu − chi = tồn cuối kỳ khi không có bộ lọc phụ
  const r = KT.filterLedger(led, { from: '2026-09-05', to: '2026-09-20' });
  assert.equal(r.tonDauKy + r.tongThu - r.tongChi, r.tonCuoiKy);
});

test('C6 kiểm tra dữ liệu nhập của sổ thu chi: ngày, số tiền, mã, độ dài', async () => {
  const srv = await startServer({});
  try {
    await srv.ok('POST', '/api/projects', { ma: 'P1', ten: 'Dự án 1' });
    const bad = async (body, re) => {
      const r = await srv.call('POST', '/api/entries', Object.assign({ ngay: '2026-09-01', noiDung: 'x', chi: 100 }, body));
      assert.equal(r.status, 400, JSON.stringify(body));
      if (re) assert.match(r.json.error, re);
    };
    await bad({ ngay: '' }, /Ngày/);
    await bad({ ngay: '2026-02-30' }, /Ngày/);
    await bad({ ngay: '01/09/2026' }, /Ngày/);
    await bad({ ngay: '2026-13-01' }, /Ngày/);
    await bad({ chi: -5 }, /âm/);
    await bad({ chi: 'abc' }, /không hợp lệ/);
    await bad({ chi: 2e15 }, /quá lớn/);
    await bad({ noiDung: '', chi: 0, thu: 0 }, /Cần nhập/);
    await bad({ maDuAn: 'XX' }, /chưa có trong danh mục/);
    const good = await srv.call('POST', '/api/entries', { ngay: '2026-09-01', noiDung: 'chỉ có nội dung', thu: 0, chi: 0 });
    assert.equal(good.status, 200);
    const mp = await srv.call('POST', '/api/entries', { ngay: '2026-09-01', noiDung: 'a'.repeat(5000), chi: '1.000' });
    assert.equal(mp.status, 200);
    const e = mp.json.db.entries.find((x) => x.id === mp.json.id);
    assert.equal(e.noiDung.length, 1000, 'nội dung bị cắt ở 1000 ký tự');
    assert.equal(e.chi, 1000);
    // mã dự án không phân biệt hoa thường, lưu đúng dạng của danh mục
    const lc = await srv.ok('POST', '/api/entries', { ngay: '2026-09-01', noiDung: 'mã thường', chi: 1, maDuAn: 'p1' });
    assert.equal(lc.db.entries.find((x) => x.id === lc.id).maDuAn, 'P1');
    // JSON hỏng
    const junk = await srv.call('POST', '/api/entries', Buffer.from('{hỏng'), { 'Content-Type': 'application/json' });
    assert.equal(junk.status, 400);
    assert.match(junk.json.error, /JSON/);
    // sửa/xóa bản ghi không tồn tại
    assert.equal((await srv.call('PUT', '/api/entries/99999', { ngay: '2026-09-01', noiDung: 'x', chi: 1 })).status, 404);
    assert.equal((await srv.call('DELETE', '/api/entries/99999')).status, 404);
    // đường dẫn lạ
    assert.equal((await srv.call('GET', '/api/khong-co')).status, 404);
  } finally { await srv.stop(); }
});

test('C7 phiếu thu/chi: gộp theo số phiếu, PT/PC, số tiền bằng chữ, đánh số tiếp theo, lưu thông tin phiếu', async () => {
  const srv = await startServer({});
  try {
    await srv.ok('POST', '/api/suppliers', { ma: 'S1', ten: 'Công ty ABC', diaChi: '12 Lê Lợi' });
    const add = (b) => srv.ok('POST', '/api/entries', Object.assign({ ngay: '2026-09-05' }, b));
    await add({ soPhieu: 'PC001/09', noiDung: 'Mua xi măng', chi: '1.250.000', maNCC: 'S1' });
    await add({ soPhieu: 'pc001/09', noiDung: 'Mua cát', chi: 750000, maNCC: 'S1' });
    await add({ soPhieu: 'PC002/09', noiDung: 'Tiền công', chi: 500000, nguoiNhan: 'Anh Ba' });
    await add({ soPhieu: 'PT001/09', noiDung: 'Nhận tạm ứng', thu: '10tr' });
    await add({ noiDung: 'Không số phiếu', chi: 1 });
    const db = await srv.db();
    const vs = KT.buildVouchers(db);
    assert.equal(vs.length, 3);
    const pc1 = vs.find((v) => v.key === 'PC001/09');
    assert.equal(pc1.loai, 'chi'); assert.equal(pc1.soDong, 2); assert.equal(pc1.soTien, 2000000);
    assert.equal(pc1.bangChu, 'Hai triệu đồng');
    assert.equal(pc1.nguoiNhan, 'Công ty ABC'); assert.equal(pc1.diaChi, '12 Lê Lợi');
    assert.equal(pc1.lyDo, 'Mua xi măng; Mua cát');
    const pt1 = vs.find((v) => v.key === 'PT001/09');
    assert.equal(pt1.loai, 'thu'); assert.equal(pt1.soTien, 10000000); assert.equal(pt1.bangChu, 'Mười triệu đồng');
    assert.equal(vs.find((v) => v.key === 'PC002/09').nguoiNhan, 'Anh Ba');
    // số phiếu kế tiếp
    assert.equal((await srv.ok('GET', '/api/vouchers/next?loai=chi&ngay=2026-09-20')).soPhieu, 'PC003/09');
    assert.equal((await srv.ok('GET', '/api/vouchers/next?loai=thu&ngay=2026-09-20')).soPhieu, 'PT002/09');
    assert.equal((await srv.ok('GET', '/api/vouchers/next?loai=chi&ngay=2026-10-02')).soPhieu, 'PC001/10');
    assert.equal(KT.nextVoucherNo(db, 'chi', '2027-09-01'), 'PC001/09', 'sang năm mới đánh số lại');
    // lưu thông tin phiếu (ghi đè) và xóa khi rỗng
    await srv.ok('PUT', '/api/vouchers/' + encodeURIComponent('PC001/09'), { nguoiNhan: 'Anh Tư', lyDo: 'Lý do riêng', hinhThuc: 'Chuyển khoản', kemTheo: '2 chứng từ', ngay: '2026-09-07' });
    let v = KT.buildVouchers(await srv.db()).find((x) => x.key === 'PC001/09');
    assert.equal(v.nguoiNhan, 'Anh Tư'); assert.equal(v.lyDo, 'Lý do riêng'); assert.equal(v.hinhThuc, 'Chuyển khoản'); assert.equal(v.kemTheo, '2 chứng từ'); assert.equal(v.ngay, '2026-09-07');
    assert.equal(v.soTien, 2000000, 'ghi đè thông tin in không đổi số tiền');
    await srv.ok('PUT', '/api/vouchers/' + encodeURIComponent('PC001/09'), {});
    v = KT.buildVouchers(await srv.db()).find((x) => x.key === 'PC001/09');
    assert.equal(v.nguoiNhan, 'Công ty ABC');
    assert.deepEqual((await srv.db()).vouchers, {});
  } finally { await srv.stop(); }
});

test('C8 tổng hợp dự án / NCC và cảnh báo ngân sách (dữ liệu thật) khớp tính độc lập', () => {
  const db = readJsonFile(V2);
  const ps = KT.projectSummary(db);
  const sum = { chi: 0, thu: 0 };
  db.projects.forEach((p) => {
    const es = db.entries.filter((e) => e.maDuAn.toLowerCase() === p.ma.toLowerCase());
    const r = ps.rows.find((x) => x.ma === p.ma);
    assert.equal(r.chi, es.reduce((t, e) => t + e.chi, 0), p.ma);
    assert.equal(r.thu, es.reduce((t, e) => t + e.thu, 0), p.ma);
    assert.equal(r.soDong, es.length);
    assert.equal(r.chenhLech, p.nganSach - r.chi);
    sum.chi += r.chi; sum.thu += r.thu;
  });
  const none = db.entries.filter((e) => !e.maDuAn);
  assert.equal(ps.khongDuAn.chi, none.reduce((t, e) => t + e.chi, 0));
  assert.equal(ps.total.chi + ps.khongDuAn.chi, db.entries.reduce((t, e) => t + e.chi, 0));
  // cảnh báo ngân sách
  assert.equal(KT.budgetStatus(100, 101), 'over');
  assert.equal(KT.budgetStatus(100, 100), 'near');
  assert.equal(KT.budgetStatus(100, 90), 'near');
  assert.equal(KT.budgetStatus(100, 89), 'ok');
  assert.equal(KT.budgetStatus(0, 5), 'none');
  assert.equal(KT.budgetStatus(0, 0), 'idle');
  const ss = KT.supplierSummary(db);
  assert.equal(ss.total.chi + ss.khongNCC.chi, db.entries.reduce((t, e) => t + e.chi, 0));
});

test('C9 danh mục dự án/NCC và cài đặt qua API', async () => {
  const srv = await startServer({});
  try {
    let r = await srv.call('POST', '/api/projects', { ma: '', ten: 'x' });
    assert.equal(r.status, 400);
    r = await srv.call('POST', '/api/projects', { ma: 'A', ten: '' });
    assert.equal(r.status, 400);
    r = await srv.call('POST', '/api/projects', { ma: 'A', ten: 'Dự án A', nganSach: '2 tỷ', trangThai: '' });
    assert.equal(r.status, 200);
    const p = r.json.db.projects[0];
    assert.equal(p.nganSach, 2000000000); assert.equal(p.trangThai, 'Đang thực hiện');
    r = await srv.call('POST', '/api/projects', { ma: 'B', ten: 'B', ngayKhoiCong: '2026-13-45' });
    assert.equal(r.status, 400);
    r = await srv.ok('PUT', '/api/settings', { tenDonVi: 'CÔNG TY THỬ', thuQuy: 'Người Thu', hienKeToanTruong: true, bậy: 'x' });
    const s = (await srv.db()).settings;
    assert.equal(s.tenDonVi, 'CÔNG TY THỬ'); assert.equal(s.thuQuy, 'Người Thu'); assert.equal(s.hienKeToanTruong, true);
    assert.equal(s['bậy'], undefined);
    // tồn tại sau khi khởi động lại
    const dir = srv.dataDir;
    await srv.stop();
    const again = await startServer({ data: dir });
    try {
      const d = await again.db();
      assert.equal(d.settings.tenDonVi, 'CÔNG TY THỬ');
      assert.equal(d.projects.length, 1);
    } finally { await again.stop(); }
  } finally { await srv.stop(); }
});
