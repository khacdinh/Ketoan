'use strict';
/* B. Lưu trữ, nâng cấp dữ liệu cũ (schema 1 → 2), sao lưu/khôi phục, ràng buộc.
 * Lưu ý: bản này lưu bằng file JSON (lib/store.js), không dùng SQLite — các ca "migrate" kiểm tra đường nâng cấp schema 1 → 2. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { ROOT, KT, startServer, makeDataDir, readJsonFile, ledgerTotals, orphanErrors, tmpDir } = require('./helpers');
const { SCHEMA_VERSION } = require('../lib/store');

const V1 = path.join(__dirname, 'fixtures', 'ketoan-v1-goc.json');
const V2 = path.join(__dirname, 'fixtures', 'ketoan-v2-hien-tai.json');
const FIELDS = ['ngay', 'soPhieu', 'maDuAn', 'maNCC', 'noiDung', 'thu', 'chi', 'nguoiNhan', 'ghiChu'];
const pick = (o, f) => f.reduce((r, k) => { r[k] = o[k] === undefined ? '' : o[k]; return r; }, {});

test('B1.1 dữ liệu gốc schema 1 (66 dòng, 15 dự án, 43 NCC, tồn quỹ 943.000) nâng cấp tự động và khớp 100%', async () => {
  const orig = readJsonFile(V1);
  assert.equal(orig.schema, 1);
  const srv = await startServer({ seed: V1 });
  try {
    const db = await srv.db();
    assert.equal(db.schema, SCHEMA_VERSION, 'nâng lên schema hiện hành');
    // từng bảng
    assert.equal(db.entries.length, 66);
    assert.equal(db.projects.length, 15);
    assert.equal(db.suppliers.length, 43);
    assert.deepEqual(db.entries.map((e) => pick(e, FIELDS)), orig.entries.map((e) => pick(e, FIELDS)), 'từng dòng sổ thu chi phải giống bản gốc (theo thứ tự)');
    const PF = ['ma', 'ten', 'nganSach', 'trangThai', 'ghiChu'];
    assert.deepEqual(db.projects.map((p) => pick(p, PF)), orig.projects.map((p) => pick(p, PF)));
    const SF = ['ma', 'ten', 'loai', 'sdt', 'diaChi', 'ghiChu'];
    assert.deepEqual(db.suppliers.map((s) => pick(s, SF)), orig.suppliers.map((s) => pick(s, SF)));
    assert.deepEqual(db.settings, Object.assign({}, db.settings, orig.settings), 'cài đặt bản gốc được giữ nguyên');
    assert.deepEqual(db.vouchers, orig.vouchers || {});
    // tổng: tính độc lập từ file gốc, và tính bằng phần mềm
    const t = ledgerTotals(orig.entries);
    assert.equal(t.thu, 2532577035);
    assert.equal(t.chi, 2531634035);
    assert.equal(t.ton, 943000);
    const led = KT.filterLedger(KT.buildLedger(db), {});
    assert.equal(led.tongThu, t.thu);
    assert.equal(led.tongChi, t.chi);
    assert.equal(led.tonCuoiKy, 943000);
    assert.equal(led.rows[led.rows.length - 1].ton, 943000, 'tồn lũy kế dòng cuối');
    // từng dự án và NCC
    const ps = KT.projectSummary(db);
    Object.keys(t.theoDuAn).filter(Boolean).forEach((k) => {
      const r = ps.rows.find((x) => KT.keyOf(x.ma) === k);
      assert.ok(r, 'thiếu dự án ' + k);
      assert.equal(r.chi, t.theoDuAn[k].chi, 'chi dự án ' + k);
      assert.equal(r.thu, t.theoDuAn[k].thu, 'thu dự án ' + k);
      assert.equal(r.soDong, t.theoDuAn[k].soDong, 'số dòng dự án ' + k);
    });
    const ss = KT.supplierSummary(db);
    Object.keys(t.theoNCC).filter(Boolean).forEach((k) => {
      const r = ss.rows.find((x) => KT.keyOf(x.ma) === k);
      assert.ok(r, 'thiếu NCC ' + k);
      assert.equal(r.chi, t.theoNCC[k].chi, 'chi NCC ' + k);
      assert.equal(r.thu, t.theoNCC[k].thu, 'thu NCC ' + k);
    });
    // phần chi phí công trình: danh mục mặc định được nạp, chưa có dòng chi phí
    assert.equal(db.costGroups.length, 6);
    assert.equal(db.costItems.length, 37);
    assert.equal(db.costs.length, 0);
    assert.deepEqual(orphanErrors(db), []);
    // id không trùng
    // bản sao lưu nguyên bản trước khi nâng cấp
    const bdir = path.join(srv.dataDir, 'backups');
    const names = fs.readdirSync(bdir).filter((f) => /truoc-nang-cap-v/.test(f));
    assert.equal(names.length, 1, 'phải có đúng 1 bản sao lưu trước nâng cấp');
    assert.deepEqual(readJsonFile(path.join(bdir, names[0])), orig, 'bản sao lưu phải giống hệt bản gốc');
    // file trên đĩa đã được ghi ở schema hiện hành
    assert.equal(readJsonFile(path.join(srv.dataDir, 'ketoan.json')).schema, SCHEMA_VERSION);
  } finally { await srv.stop(); }
});

test('B2.1 mở lại nhiều lần: không nâng cấp lần hai, không nhân đôi dữ liệu, không thêm bản sao lưu nâng cấp', async () => {
  const dir = makeDataDir(V1);
  let first;
  for (let i = 0; i < 3; i++) {
    const srv = await startServer({ data: dir });
    try {
      const db = await srv.db();
      if (i === 0) first = db; else {
        assert.equal(db.entries.length, 66);
        assert.equal(db.projects.length, 15);
        assert.equal(db.suppliers.length, 43);
        assert.equal(db.costGroups.length, 6);
        assert.equal(db.costItems.length, 37);
        assert.deepEqual(db.entries, first.entries);
        assert.equal(db.nextId, first.nextId);
      }
    } finally { await srv.stop(); }
  }
  assert.equal(fs.readdirSync(path.join(dir, 'backups')).filter((f) => /truoc-nang-cap/.test(f)).length, 1);
});

test('B2.2 dữ liệu hiện tại (schema 2, có chi phí công trình) mở lại nguyên vẹn, không ghi đè', async () => {
  const dir = makeDataDir(V2);
  const before = readJsonFile(V2);
  const srv = await startServer({ data: dir });
  try {
    const db = await srv.db();
    ['entries', 'projects', 'suppliers', 'costs', 'costGroups', 'costItems', 'materials', 'houses'].forEach((k) => assert.deepEqual(db[k], before[k], k));
    assert.deepEqual(orphanErrors(db), []);
  } finally { await srv.stop(); }
});

test('B3.1 kill -9 giữa lúc đang ghi: file luôn đọc được, không mất dữ liệu đã được xác nhận', async () => {
  for (let round = 0; round < 6; round++) {
    const dir = makeDataDir(V2);
    const srv = await startServer({ data: dir });
    const acked = [];
    let killed = false;
    const killAt = 150 + round * 70;
    const worker = (async () => {
      for (let i = 0; i < 400 && !killed; i++) {
        try {
          const r = await srv.call('POST', '/api/entries', { ngay: '2026-09-01', noiDung: 'kill-test ' + round + '-' + i, chi: 1000 + i });
          if (r.status === 200) acked.push(r.json.id);
        } catch (e) { break; }
      }
    })();
    await new Promise((r) => setTimeout(r, killAt));
    killed = true;
    srv.child.kill('SIGKILL');
    await new Promise((r) => srv.child.once('exit', r));
    await worker;
    // file chính phải đọc được
    const file = path.join(dir, 'ketoan.json');
    const db = readJsonFile(file);
    const ids = new Set(db.entries.map((e) => e.id));
    acked.forEach((id) => assert.ok(ids.has(id), 'mất dòng đã lưu thành công (id ' + id + ') ở vòng ' + round));
    assert.ok(acked.length > 0, 'vòng ' + round + ' chưa ghi được dòng nào trước khi kill — tăng thời gian chờ');
    // mở lại bình thường
    const again = await startServer({ data: dir });
    try {
      const d2 = await again.db();
      assert.ok(d2.entries.length >= 66 + acked.length);
      assert.deepEqual(orphanErrors(d2), []);
      // vẫn ghi tiếp được
      await again.ok('POST', '/api/entries', { ngay: '2026-09-02', noiDung: 'sau khi mở lại', chi: 5 });
    } finally { await again.stop(); }
  }
});

test('B3.2 file dữ liệu bị hỏng (cắt ngang) → phần mềm tự khôi phục từ bản sao lưu gần nhất, không sập', async () => {
  const dir = makeDataDir(V2);
  const bdir = path.join(dir, 'backups');
  fs.mkdirSync(bdir, { recursive: true });
  const good = fs.readFileSync(V2, 'utf8');
  fs.writeFileSync(path.join(bdir, 'ketoan-20260930-100000-tu-dong.json'), good);
  fs.writeFileSync(path.join(dir, 'ketoan.json'), good.slice(0, Math.floor(good.length / 2))); // hỏng
  const srv = await startServer({ data: dir });
  try {
    assert.ok(!srv.exited, 'server không được thoát: ' + srv.log.slice(0, 300));
    const db = await srv.db();
    assert.equal(db.entries.length, 66);
    assert.equal(db.costs.length, 104);
    assert.match(srv.log, /hỏng|khôi phục/i, 'phải báo bằng tiếng Việt');
    assert.ok(fs.readdirSync(dir).some((f) => /hong/.test(f)), 'file hỏng phải được giữ lại để kiểm tra');
  } finally { await srv.stop(); }
});

test('B3.3 file dữ liệu hỏng và không có bản sao lưu → báo lỗi tiếng Việt rõ ràng, không ghi đè file hỏng', async () => {
  const dir = makeDataDir(V2);
  const good = fs.readFileSync(V2, 'utf8');
  const broken = good.slice(0, 500);
  fs.writeFileSync(path.join(dir, 'ketoan.json'), broken);
  const srv = await startServer({ data: dir });
  try {
    await new Promise((r) => setTimeout(r, 500));
    assert.ok(srv.exited || srv.child.exitCode !== null, 'phải dừng thay vì chạy với dữ liệu trống');
    assert.match(srv.log, /ketoan\.json/);
    assert.ok(!/at .*node:internal/.test(srv.log.split('\n').slice(0, 6).join('\n')) || /hỏng/.test(srv.log), 'nên có thông báo tiếng Việt');
    // không được ghi đè/xóa file hỏng
    const left = fs.readdirSync(dir).filter((f) => /ketoan.*json/.test(f));
    assert.ok(left.some((f) => fs.readFileSync(path.join(dir, f), 'utf8') === broken), 'file hỏng phải còn nguyên để cứu dữ liệu');
  } finally { await srv.stop(); }
});

test('B4.1 sao lưu tự động, thủ công, tải về và khôi phục: sau khôi phục dữ liệu đúng thời điểm sao lưu', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const bdir = path.join(srv.dataDir, 'backups');
    const listNames = () => fs.readdirSync(bdir).sort();
    // lần sửa đầu tiên sau khi mở → có 1 bản tự động chứa trạng thái TRƯỚC sửa
    const before = await srv.db();
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-10', noiDung: 'A', chi: 100 });
    const auto = listNames().filter((n) => /tu-dong/.test(n));
    assert.equal(auto.length >= 1, true, 'chưa có bản sao lưu tự động');
    const autoNewest = readJsonFile(path.join(bdir, auto[auto.length - 1]));
    assert.equal(autoNewest.entries.length, before.entries.length, 'bản tự động phải là trạng thái trước khi sửa');
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-10', noiDung: 'B', chi: 200 });
    assert.equal(listNames().filter((n) => /tu-dong/.test(n)).length, auto.length, 'không sao lưu tự động lại trong 10 phút');
    // sao lưu thủ công ở thời điểm T
    const snap = await srv.db();
    const r = await srv.ok('POST', '/api/backups/now');
    assert.match(r.name, /thu-cong/);
    // tải bản sao lưu về = đúng dữ liệu hiện tại
    const dl = await srv.call('GET', '/api/backup');
    assert.equal(dl.status, 200);
    assert.match(dl.headers['content-disposition'], /attachment/);
    assert.deepEqual(JSON.parse(dl.body.toString('utf8')).entries, snap.entries);
    // thay đổi lớn sau T
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-11', noiDung: 'C', chi: 300 });
    const c = (await srv.db()).entries.find((e) => e.noiDung === 'C');
    await srv.ok('DELETE', '/api/entries/' + c.id);
    await srv.ok('POST', '/api/projects', { ma: 'TMP1', ten: 'Tạm' });
    await srv.ok('POST', '/api/reset', { confirm: 'XOA', keepCatalogs: false });
    assert.equal((await srv.db()).entries.length, 0);
    // khôi phục bản thủ công
    await srv.ok('POST', '/api/backups/restore', { name: r.name });
    const after = await srv.db();
    assert.deepEqual(after.entries, snap.entries);
    assert.deepEqual(after.projects, snap.projects);
    assert.deepEqual(after.suppliers, snap.suppliers);
    assert.deepEqual(after.costs, snap.costs);
    assert.equal(KT.filterLedger(KT.buildLedger(after), {}).tonCuoiKy, KT.filterLedger(KT.buildLedger(snap), {}).tonCuoiKy);
    // dữ liệu khôi phục đã được ghi ra đĩa
    assert.deepEqual(readJsonFile(path.join(srv.dataDir, 'ketoan.json')).entries, snap.entries);
    // luôn có bản sao lưu ngay trước khi xóa toàn bộ / khôi phục
    assert.ok(listNames().some((n) => /truoc-xoa-du-lieu/.test(n)));
    assert.ok(listNames().some((n) => /truoc-khoi-phuc/.test(n)));
    // khôi phục từ file tải lên
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-12', noiDung: 'D', chi: 1 });
    await srv.ok('POST', '/api/restore', JSON.parse(dl.body.toString('utf8')));
    assert.deepEqual((await srv.db()).entries, snap.entries);
    // khôi phục file rác
    const bad = await srv.call('POST', '/api/restore', { foo: 1 });
    assert.equal(bad.status, 400);
    assert.match(bad.json.error, /không hợp lệ/);
    const notJson = await srv.call('POST', '/api/restore', Buffer.from('xin chào'), { 'Content-Type': 'application/json' });
    assert.equal(notJson.status, 400);
  } finally { await srv.stop(); }
});

test('B4.2 khôi phục: tên bản sao lưu bất hợp lệ / đường dẫn lạ bị từ chối', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    for (const name of ['../../etc/passwd', '..\\ketoan.json', 'ketoan-../../x.json', '', 'khac.json', 'ketoan-x.txt']) {
      const r = await srv.call('POST', '/api/backups/restore', { name });
      assert.notEqual(r.status, 200, 'không được chấp nhận ' + JSON.stringify(name));
    }
    const miss = await srv.call('POST', '/api/backups/restore', { name: 'ketoan-19990101-000000-khong-co.json' });
    assert.notEqual(miss.status, 200);
    assert.ok(miss.json && miss.json.error, 'phải trả lỗi dạng JSON để giao diện hiển thị');
    assert.equal((await srv.db()).entries.length, 66, 'dữ liệu không đổi sau yêu cầu lỗi');
  } finally { await srv.stop(); }
});

test('B4.3 giữ tối đa 60 bản sao lưu, xóa bản cũ nhất', async () => {
  const { Store } = require(path.join(ROOT, 'lib', 'store'));
  const dir = makeDataDir(V2);
  const st = new Store(dir);
  const bdir = path.join(dir, 'backups');
  for (let i = 0; i < 70; i++) {
    const f = path.join(bdir, 'ketoan-20200101-0000' + String(i).padStart(2, '0') + '-tu-dong.json');
    fs.writeFileSync(f, '{}');
    const t = new Date(2020, 0, 1, 0, 0, i);
    fs.utimesSync(f, t, t);
  }
  st.backup('thu-cong');
  const left = fs.readdirSync(bdir);
  assert.equal(left.length, 60);
  assert.ok(left.some((n) => /thu-cong/.test(n)), 'bản mới nhất phải còn');
  assert.ok(!left.includes('ketoan-20200101-000000-tu-dong.json'), 'bản cũ nhất phải bị xóa');
});

test('B4.4 sao lưu trước nhập Excel và trước xóa chi phí', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const bdir = path.join(srv.dataDir, 'backups');
    await srv.ok('POST', '/api/reset-costs', { confirm: 'XOA', keepCatalogs: true });
    assert.ok(fs.readdirSync(bdir).some((n) => /truoc-xoa-chi-phi/.test(n)));
    const b = readJsonFile(path.join(bdir, fs.readdirSync(bdir).find((n) => /truoc-xoa-chi-phi/.test(n))));
    assert.equal(b.costs.length, 104, 'bản sao lưu phải chứa dữ liệu trước khi xóa');
    const bad = await srv.call('POST', '/api/reset-costs', { confirm: 'xoa' });
    assert.equal(bad.status, 400);
  } finally { await srv.stop(); }
});

/* ---------- B5. Ràng buộc toàn vẹn ---------- */

async function post(srv, url, body) { return srv.call('POST', url, body); }

test('B5.1 không cho xóa mã đang được dùng (công trình, NCC, nhóm, hạng mục, vật tư, nhà); xóa mã chưa dùng thì được', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const db = await srv.db();
    const expectBlocked = async (url, what) => {
      const r = await srv.call('DELETE', url);
      assert.equal(r.status, 400, what + ' → phải bị chặn, nhận ' + r.status);
      assert.match(r.json.error, /Không thể xóa/, what);
    };
    const pWithEntries = db.projects.find((p) => db.entries.some((e) => e.maDuAn === p.ma));
    await expectBlocked('/api/projects/' + pWithEntries.id, 'dự án có sổ thu chi');
    const pWithCosts = db.projects.find((p) => db.costs.some((c) => c.maCT === p.ma));
    await expectBlocked('/api/projects/' + pWithCosts.id, 'công trình có chi phí');
    const sEntries = db.suppliers.find((s) => db.entries.some((e) => e.maNCC === s.ma));
    await expectBlocked('/api/suppliers/' + sEntries.id, 'NCC có sổ thu chi');
    const sCosts = db.suppliers.find((s) => db.costs.some((c) => c.maNCC === s.ma) && !db.entries.some((e) => e.maNCC === s.ma));
    if (sCosts) await expectBlocked('/api/suppliers/' + sCosts.id, 'NCC chỉ có chi phí');
    const item = db.costItems.find((i) => db.costs.some((c) => c.maHM === i.ma));
    await expectBlocked('/api/cost-items/' + item.id, 'hạng mục có chi phí');
    const grp = db.costGroups.find((g) => db.costItems.some((i) => i.maNhom === g.ma));
    await expectBlocked('/api/cost-groups/' + grp.id, 'nhóm có hạng mục');
    const vt = db.materials.find((m) => db.costs.some((c) => c.maVT === m.ma));
    await expectBlocked('/api/materials/' + vt.id, 'vật tư có chi phí');
    // nhà
    const nhaMa = await srv.ok('POST', '/api/houses', { ma: 'NHA_TEST', ten: 'Nhà thử', maCT: pWithCosts.ma });
    const cost = await srv.ok('POST', '/api/costs', { ngay: '2026-09-01', maCT: pWithCosts.ma, maNha: 'NHA_TEST', maNCC: sEntries.ma, maHM: item.ma, dienGiai: 'thử', soLuong: 1, donGia: 10 });
    await expectBlocked('/api/houses/' + nhaMa.id, 'nhà có chi phí');
    await srv.ok('DELETE', '/api/costs/' + cost.id);
    await srv.ok('DELETE', '/api/houses/' + nhaMa.id);
    // nhà gắn với công trình → công trình không xóa được dù chưa có chi phí
    const p2 = await srv.ok('POST', '/api/projects', { ma: 'CT_RONG', ten: 'Rỗng' });
    const h2 = await srv.ok('POST', '/api/houses', { ma: 'NHA_CT_RONG', ten: 'Nhà', maCT: 'CT_RONG' });
    await expectBlocked('/api/projects/' + p2.id, 'công trình có nhà');
    await srv.ok('DELETE', '/api/houses/' + h2.id);
    await srv.ok('DELETE', '/api/projects/' + p2.id);
    // mã chưa dùng xóa được
    const s2 = await srv.ok('POST', '/api/suppliers', { ma: 'NCC_RONG', ten: 'Rỗng' });
    await srv.ok('DELETE', '/api/suppliers/' + s2.id);
    const g2 = await srv.ok('POST', '/api/cost-groups', { ma: 'NHOM_RONG', ten: 'Nhóm rỗng' });
    const i2 = await srv.ok('POST', '/api/cost-items', { ma: 'HM_RONG', ten: 'Hạng mục rỗng', maNhom: 'NHOM_RONG' });
    await expectBlocked('/api/cost-groups/' + g2.id, 'nhóm vừa thêm hạng mục');
    const m2 = await srv.ok('POST', '/api/materials', { ma: 'VT_RONG', ten: 'Vật tư rỗng', maHM: 'HM_RONG' });
    await expectBlocked('/api/cost-items/' + i2.id, 'hạng mục có vật tư');
    await srv.ok('DELETE', '/api/materials/' + m2.id);
    await srv.ok('DELETE', '/api/cost-items/' + i2.id);
    await srv.ok('DELETE', '/api/cost-groups/' + g2.id);
    const after = await srv.db();
    assert.deepEqual(orphanErrors(after), []);
    assert.equal((await srv.call('DELETE', '/api/projects/999999')).status, 404);
  } finally { await srv.stop(); }
});

test('B5.2 đổi mã lan tới mọi nơi đang dùng, không sinh dòng mồ côi; mã trùng (kể cả khác hoa/thường) bị từ chối', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const db = await srv.db();
    const p = db.projects.find((x) => db.entries.some((e) => e.maDuAn === x.ma) && db.costs.some((c) => c.maCT === x.ma));
    const nEntries = db.entries.filter((e) => e.maDuAn === p.ma).length;
    const nCosts = db.costs.filter((c) => c.maCT === p.ma).length;
    const r = await srv.ok('PUT', '/api/projects/' + p.id, Object.assign({}, p, { ma: 'CT_MOI' }));
    assert.ok(r.renamed >= nEntries + nCosts);
    let d2 = await srv.db();
    assert.equal(d2.entries.filter((e) => e.maDuAn === 'CT_MOI').length, nEntries);
    assert.equal(d2.costs.filter((c) => c.maCT === 'CT_MOI').length, nCosts);
    assert.equal(d2.entries.filter((e) => e.maDuAn === p.ma).length, 0);
    assert.deepEqual(orphanErrors(d2), []);
    // NCC
    const s = d2.suppliers.find((x) => d2.entries.some((e) => e.maNCC === x.ma) && d2.costs.some((c) => c.maNCC === x.ma)) || d2.suppliers.find((x) => d2.costs.some((c) => c.maNCC === x.ma));
    await srv.ok('PUT', '/api/suppliers/' + s.id, Object.assign({}, s, { ma: 'NCC_MOI' }));
    d2 = await srv.db();
    assert.equal(d2.costs.filter((c) => c.maNCC === s.ma).length, 0);
    assert.ok(d2.costs.some((c) => c.maNCC === 'NCC_MOI'));
    assert.deepEqual(orphanErrors(d2), []);
    // hạng mục, nhóm, vật tư
    const it = d2.costItems.find((i) => d2.costs.some((c) => c.maHM === i.ma));
    await srv.ok('PUT', '/api/cost-items/' + it.id, Object.assign({}, it, { ma: 'HM_MOI' }));
    const g = d2.costGroups.find((x) => x.ma === it.maNhom);
    await srv.ok('PUT', '/api/cost-groups/' + g.id, Object.assign({}, g, { ma: 'NHOM_MOI' }));
    const vt = d2.materials.find((m) => d2.costs.some((c) => c.maVT === m.ma));
    await srv.ok('PUT', '/api/materials/' + vt.id, Object.assign({}, vt, { ma: 'VT_MOI' }));
    d2 = await srv.db();
    assert.deepEqual(orphanErrors(d2), []);
    assert.ok(d2.costs.some((c) => c.maHM === 'HM_MOI'));
    assert.ok(d2.costs.some((c) => c.maVT === 'VT_MOI'));
    // trùng mã
    const dup1 = await srv.call('POST', '/api/projects', { ma: 'ct_moi', ten: 'Trùng hoa thường' });
    assert.equal(dup1.status, 400);
    const other = d2.projects.find((x) => x.ma !== 'CT_MOI');
    const dup2 = await srv.call('PUT', '/api/projects/' + other.id, Object.assign({}, other, { ma: 'CT_MOI' }));
    assert.equal(dup2.status, 400);
    const dup3 = await srv.call('POST', '/api/suppliers', { ma: 'ncc_moi', ten: 'x' });
    assert.equal(dup3.status, 400);
    assert.deepEqual(orphanErrors(await srv.db()), []);
  } finally { await srv.stop(); }
});

test('B5.3 không cho tạo dòng tham chiếu mã không tồn tại (sổ thu chi và chi phí)', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const db = await srv.db();
    const p = db.projects[0].ma; const s = db.suppliers[0].ma; const it = db.costItems[0].ma;
    let r = await srv.call('POST', '/api/entries', { ngay: '2026-09-01', noiDung: 'x', chi: 1, maDuAn: 'KHONG_CO' });
    assert.equal(r.status, 400); assert.match(r.json.error, /chưa có trong danh mục/);
    r = await srv.call('POST', '/api/entries', { ngay: '2026-09-01', noiDung: 'x', chi: 1, maNCC: 'KHONG_CO' });
    assert.equal(r.status, 400);
    r = await srv.call('POST', '/api/costs', { ngay: '2026-09-01', maCT: 'KHONG_CO', maNCC: s, maHM: it, dienGiai: 'x', soLuong: 1, donGia: 1 });
    assert.equal(r.status, 400);
    r = await srv.call('POST', '/api/costs', { ngay: '2026-09-01', maCT: p, maNCC: 'KHONG_CO', maHM: it, dienGiai: 'x', soLuong: 1, donGia: 1 });
    assert.equal(r.status, 400);
    r = await srv.call('POST', '/api/costs', { ngay: '2026-09-01', maCT: p, maNCC: s, maHM: 'KHONG_CO', dienGiai: 'x', soLuong: 1, donGia: 1 });
    assert.equal(r.status, 400);
    r = await srv.call('POST', '/api/costs', { ngay: '2026-09-01', maCT: p, maNCC: s, maHM: it, maVT: 'KHONG_CO', dienGiai: 'x', soLuong: 1, donGia: 1 });
    assert.equal(r.status, 400);
    r = await srv.call('POST', '/api/materials', { ma: 'V', ten: 'x', maHM: 'KHONG_CO' });
    assert.equal(r.status, 400);
    r = await srv.call('POST', '/api/houses', { ma: 'H', ten: 'x', maCT: 'KHONG_CO' });
    assert.equal(r.status, 400);
    r = await srv.call('POST', '/api/cost-items', { ma: 'H', ten: 'x', maNhom: 'KHONG_CO' });
    assert.equal(r.status, 400);
    assert.deepEqual(await srv.db(), db, 'dữ liệu không đổi sau các yêu cầu bị từ chối');
  } finally { await srv.stop(); }
});

test('B5.4 /api/reset và /api/reset-costs không để lại dòng mồ côi', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    await srv.ok('POST', '/api/reset', { confirm: 'XOA', keepCatalogs: false });
    let db = await srv.db();
    assert.equal(db.entries.length, 0);
    assert.equal(db.costs.length, 104, 'chi phí công trình giữ nguyên');
    assert.deepEqual(orphanErrors(db), []);
    await srv.ok('POST', '/api/reset-costs', { confirm: 'XOA', keepCatalogs: false });
    db = await srv.db();
    assert.equal(db.costs.length, 0);
    assert.deepEqual(orphanErrors(db), []);
    assert.equal((await srv.call('POST', '/api/reset', {})).status, 400);
  } finally { await srv.stop(); }
});

test('B3.4 nhiều yêu cầu ghi đồng thời: không mất dòng, id và thứ tự (seq) không trùng, file khớp bộ nhớ', async () => {
  const srv = await startServer({});
  try {
    const N = 150;
    const rs = await Promise.all(Array.from({ length: N }, (_, i) => srv.call('POST', '/api/entries', { ngay: '2026-09-' + String(1 + (i % 28)).padStart(2, '0'), noiDung: 'song song ' + i, chi: 1000 + i })));
    assert.ok(rs.every((r) => r.status === 200));
    const db = await srv.db();
    assert.equal(db.entries.length, N);
    assert.equal(new Set(db.entries.map((e) => e.id)).size, N);
    assert.equal(new Set(db.entries.map((e) => e.seq)).size, N);
    assert.equal(db.entries.reduce((t, e) => t + e.chi, 0), N * 1000 + (N * (N - 1)) / 2);
    assert.deepEqual(readJsonFile(path.join(srv.dataDir, 'ketoan.json')).entries, db.entries);
  } finally { await srv.stop(); }
});

test('B3.5 Windows khóa file (đổi tên thất bại) → ghi đè trực tiếp bằng bản sao, dữ liệu vẫn đủ và không để lại file tạm', () => {
  const { Store } = require(path.join(ROOT, 'lib', 'store'));
  const dir = makeDataDir(V2);
  const st = new Store(dir);
  const realRename = fs.renameSync;
  fs.renameSync = () => { const e = new Error('EPERM: operation not permitted, rename'); e.code = 'EPERM'; throw e; };
  try {
    st.db.entries.push({ id: st.newId(), seq: 999, ngay: '2026-09-30', noiDung: 'qua đường dự phòng', thu: 0, chi: 5, soPhieu: '', maDuAn: '', maNCC: '', nguoiNhan: '', ghiChu: '' });
    st.save();
  } finally { fs.renameSync = realRename; }
  const disk = readJsonFile(path.join(dir, 'ketoan.json'));
  assert.ok(disk.entries.some((e) => e.noiDung === 'qua đường dự phòng'));
  assert.equal(disk.entries.length, 67);
  assert.ok(!fs.existsSync(path.join(dir, 'ketoan.json.tmp')), 'không được để lại file tạm');
});
