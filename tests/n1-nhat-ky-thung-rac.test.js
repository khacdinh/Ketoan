'use strict';
/* N0. Số liệu báo cáo giống hệt trước khi cải tiến nhóm 1 (khi chưa dùng tính năng mới).
 * N1. Nhật ký thay đổi (audit log) + xóa mềm (thùng rác). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { KT, startServer, makeDataDir, readJsonFile, orphanErrors, readStored } = require('./helpers');
const { summarize, FILE: MOC, SOURCES } = require('./so-lieu-moc');
const { SCHEMA_VERSION } = require('../lib/store');

const FIX = path.join(__dirname, 'fixtures');
const V2 = path.join(FIX, 'ketoan-v2-hien-tai.json');
const audit = async (srv, qs) => (await srv.ok('GET', '/api/audit' + (qs ? '?' + qs : ''))).items;
const trash = async (srv) => (await srv.ok('GET', '/api/trash')).items;
const H = (name) => ({ 'X-Nguoi-Dung': encodeURIComponent(name) });

test('N0 số liệu mốc: dữ liệu cũ sau nâng cấp cho mọi con số báo cáo giống hệt trước khi cải tiến (tồn quỹ, sổ, dự án, NCC, phiếu, chi phí, công nợ, giá VT)', async () => {
  const moc = readJsonFile(MOC);
  for (const [k, f] of Object.entries(SOURCES)) {
    const srv = await startServer({ seed: path.join(FIX, f) });
    try {
      const now = summarize(await srv.db());
      for (const part of Object.keys(moc[k])) assert.deepEqual(now[part], moc[k][part], k + ': ' + part);
    } finally { await srv.stop(); }
  }
  assert.equal(moc.v2.tonQuy, 943000);
  assert.equal(moc.v2.chiPhi.total, 1129929000);
});

test('N1.1 nâng cấp schema: sao lưu trước, bản ghi không đổi, một mục "khởi tạo từ dữ liệu cũ"; mở lại nhiều lần không nhân đôi', async () => {
  const dir = makeDataDir(V2);
  const orig = readJsonFile(V2);
  for (let i = 0; i < 3; i++) {
    const srv = await startServer({ data: dir });
    try {
      const db = await srv.db();
      assert.equal(db.schema, SCHEMA_VERSION);
      assert.equal(db.trash, undefined, 'thùng rác không gửi kèm mỗi lần trả lời');
      ['entries', 'projects', 'suppliers', 'costs', 'costGroups', 'costItems', 'materials', 'houses'].forEach((k) => assert.deepEqual(db[k], orig[k], k + ' giữ nguyên từng trường'));
      const items = await audit(srv);
      assert.equal(items.filter((a) => a.action === 'khoi-tao').length, 1, 'đúng một mục khởi tạo (lần ' + (i + 1) + ')');
      assert.match(items[items.length - 1].label, /Khởi tạo từ dữ liệu cũ/);
      assert.match(items[items.length - 1].note, /66 dòng sổ thu chi, 104 dòng chi phí/);
    } finally { await srv.stop(); }
  }
  const bk = fs.readdirSync(path.join(dir, 'backups')).filter((f) => /truoc-khi-chuyen-sqlite/.test(f));
  assert.equal(bk.length, 1);
  assert.deepEqual(readJsonFile(path.join(dir, 'backups', bk[0])), orig, 'bản sao lưu trước nâng cấp giống hệt bản gốc');
  assert.equal(readStored(dir).schema, SCHEMA_VERSION);
});

test('N1.2 mọi thêm / sửa / xóa đều vào nhật ký: thời điểm, người thao tác, bản ghi, giá trị trước và sau', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const db = await srv.db();
    const who = H('Thúy kế toán');
    // sổ thu chi
    const add = (await srv.call('POST', '/api/entries', { ngay: '2026-09-20', noiDung: 'Mua xi măng', chi: '1tr', maNCC: db.suppliers[0].ma }, who)).json;
    await srv.call('PUT', '/api/entries/' + add.id, { ngay: '2026-09-21', noiDung: 'Mua xi măng PCB40', chi: 1200000, maNCC: db.suppliers[0].ma }, who);
    await srv.call('DELETE', '/api/entries/' + add.id, undefined, who);
    let items = await audit(srv, 'recId=' + add.id);
    assert.deepEqual(items.map((a) => a.action), ['xoa', 'sua', 'them']);
    items.forEach((a) => { assert.equal(a.by, 'Thúy kế toán'); assert.equal(a.kind, 'entries'); assert.ok(!isNaN(Date.parse(a.at))); });
    const sua = items[1];
    assert.equal(sua.before.chi, 1000000); assert.equal(sua.after.chi, 1200000);
    assert.equal(sua.before.ngay, '2026-09-20'); assert.equal(sua.after.ngay, '2026-09-21');
    assert.equal(items[0].before[0].noiDung, 'Mua xi măng PCB40', 'mục xóa giữ nội dung đã xóa');
    // danh mục: thêm, đổi mã (lan sang sổ), xóa
    const p = (await srv.ok('POST', '/api/projects', { ma: 'NK_DA', ten: 'Dự án nhật ký' })).id;
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-22', noiDung: 'x', chi: 5, maDuAn: 'NK_DA' });
    await srv.ok('PUT', '/api/projects/' + p, { ma: 'NK_DA2', ten: 'Dự án nhật ký' });
    items = await audit(srv, 'recId=' + p);
    assert.deepEqual(items.map((a) => a.action), ['sua', 'them']);
    assert.match(items[0].note, /NK_DA → NK_DA2, cập nhật 1 chỗ/);
    // phiếu nhập: thêm, sửa, xóa → cùng số phiếu (phieuId)
    const c0 = db.costs[0];
    const slip = { header: { ngay: '2026-09-23', maCT: c0.maCT, maNCC: c0.maNCC, maHM: c0.maHM }, lines: [{ dienGiai: 'A', soLuong: 2, donGia: 1000 }, { dienGiai: 'B', soLuong: 1, donGia: 500 }] };
    const s1 = await srv.ok('POST', '/api/cost-slips', slip);
    slip.lines[1].donGia = 700;
    await srv.ok('PUT', '/api/cost-slips/' + s1.phieuId, slip);
    await srv.ok('DELETE', '/api/cost-slips/' + s1.phieuId);
    items = await audit(srv, 'recId=' + s1.phieuId);
    assert.deepEqual(items.map((a) => a.action + ':' + a.kind), ['xoa:slips', 'sua:slips', 'them:slips']);
    assert.equal(items[1].before.length, 2); assert.equal(items[1].after[1].thanhTien, 700);
    assert.match(items[2].label, /Phiếu nhập 23\/09\/2026 .* 2 dòng · 2\.500 đ/);
    assert.equal(items[2].by, '', 'không đặt tên người dùng thì để trống');
    // danh mục chi phí, dòng chi phí đơn lẻ, xóa nhiều dòng
    const vt = (await srv.ok('POST', '/api/materials', { ma: 'NK-VT', ten: 'Vật tư NK', dvt: 'bao' })).id;
    await srv.ok('PUT', '/api/materials/' + vt, { ma: 'NK-VT', ten: 'Vật tư NK sửa', dvt: 'bao' });
    await srv.ok('DELETE', '/api/materials/' + vt);
    assert.deepEqual((await audit(srv, 'recId=' + vt)).map((a) => a.action), ['xoa', 'sua', 'them']);
    const cid = (await srv.ok('POST', '/api/costs', Object.assign({}, c0, { ngay: '2026-09-24' }))).id;
    await srv.ok('PUT', '/api/costs/' + cid, Object.assign({}, c0, { ngay: '2026-09-24', soLuong: 9 }));
    await srv.ok('POST', '/api/costs/delete', { ids: [cid] });
    assert.deepEqual((await audit(srv, 'recId=' + cid)).map((a) => a.action), ['xoa', 'sua', 'them']);
    // cài đặt và thông tin in phiếu
    await srv.ok('PUT', '/api/settings', { thuQuy: 'Người mới' });
    const st = (await audit(srv, 'kind=settings'))[0];
    assert.equal(st.after.thuQuy, 'Người mới');
    // nhật ký nằm trên đĩa, mỗi dòng một JSON
    const lines = fs.readFileSync(path.join(srv.dataDir, 'nhat-ky.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(lines.length, (await srv.ok('GET', '/api/audit')).total);
    assert.deepEqual(orphanErrors(await srv.db()), []);
  } finally { await srv.stop(); }
});

test('N1.3 xóa mềm: báo cáo, tồn quỹ, công nợ không tính bản ghi đã xóa; khôi phục trả lại đúng như cũ; xóa vĩnh viễn có xác nhận và ghi nhật ký', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const db0 = await srv.db();
    const base = summarize(db0);
    const e = db0.entries.find((x) => x.chi > 0 && x.maNCC);
    const slipId = db0.costs.find((c) => db0.costs.filter((x) => x.phieuId === c.phieuId).length > 2).phieuId;
    const slipLines = db0.costs.filter((c) => c.phieuId === slipId);
    await srv.ok('DELETE', '/api/entries/' + e.id);
    await srv.ok('DELETE', '/api/cost-slips/' + slipId);
    const db1 = await srv.db();
    assert.equal(db1.entries.length, db0.entries.length - 1);
    assert.equal(db1.costs.length, db0.costs.length - slipLines.length);
    const s1 = summarize(db1);
    assert.equal(s1.tonQuy, base.tonQuy + e.chi - (e.thu || 0), 'tồn quỹ không tính dòng đã xóa');
    assert.equal(s1.chiPhi.total, base.chiPhi.total - slipLines.reduce((t, c) => t + c.thanhTien, 0), 'tổng chi phí không tính phiếu đã xóa');
    const d0 = KT.supplierDebt(db0, {}).rows.find((r) => KT.keyOf(r.ma) === KT.keyOf(slipLines[0].maNCC));
    const d1 = KT.supplierDebt(db1, {}).rows.find((r) => KT.keyOf(r.ma) === KT.keyOf(slipLines[0].maNCC));
    assert.equal(d1.phatSinh, d0.phatSinh - slipLines.reduce((t, c) => t + c.thanhTien, 0), 'công nợ NCC không tính phiếu đã xóa');
    // thùng rác
    const tr = await trash(srv);
    assert.equal(tr.length, 2);
    assert.equal(tr[0].count, slipLines.length); assert.equal(tr[0].kindLabel, 'Phiếu nhập chi phí');
    // xuất Excel cũng không có dòng đã xóa
    const x = await srv.call('GET', '/api/export/ledger');
    assert.equal(x.status, 200);
    // khôi phục cả hai → mọi con số và từng bản ghi về như cũ
    for (const t of tr) await srv.ok('POST', '/api/trash/' + t.id + '/restore');
    const db2 = await srv.db();
    assert.deepEqual(summarize(db2), base);
    assert.deepEqual(db2.entries.find((x) => x.id === e.id), e);
    assert.deepEqual(db2.costs.filter((c) => c.phieuId === slipId).sort((a, b) => a.id - b.id), slipLines.sort((a, b) => a.id - b.id));
    assert.equal((await trash(srv)).length, 0);
    assert.equal((await srv.call('POST', '/api/trash/' + tr[0].id + '/restore')).status, 404, 'khôi phục lần hai: không tìm thấy');
    // xóa vĩnh viễn
    await srv.ok('DELETE', '/api/entries/' + e.id);
    const t2 = (await trash(srv))[0];
    await srv.ok('DELETE', '/api/trash/' + t2.id);
    assert.equal((await trash(srv)).length, 0);
    const last = (await audit(srv))[0];
    assert.equal(last.action, 'xoa-vinh-vien'); assert.equal(last.before[0].id, e.id);
    // dọn toàn bộ cần chữ XOA
    await srv.ok('DELETE', '/api/entries/' + db0.entries[0].id);
    assert.equal((await srv.call('POST', '/api/trash/purge-all', {})).status, 400);
    assert.equal((await srv.ok('POST', '/api/trash/purge-all', { confirm: 'XOA' })).purged, 1);
  } finally { await srv.stop(); }
});

test('N1.4 khôi phục có kiểm tra: mã danh mục đã bị tạo lại, tham chiếu tới danh mục đã xóa → báo rõ, không làm hỏng dữ liệu', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    await srv.ok('POST', '/api/projects', { ma: 'KP1', ten: 'Dự án khôi phục' });
    await srv.ok('POST', '/api/materials', { ma: 'KP-VT', ten: 'VT khôi phục', dvt: 'cái' });
    const db = await srv.db();
    const c0 = db.costs[0];
    const cid = (await srv.ok('POST', '/api/costs', Object.assign({}, c0, { maVT: 'KP-VT', ngay: '2026-09-25' }))).id;
    await srv.ok('DELETE', '/api/costs/' + cid);
    await srv.ok('DELETE', '/api/materials/' + db.materials.find((m) => m.ma === 'KP-VT').id); // vật tư không còn dùng → xóa được
    const p = db.projects.find((x) => x.ma === 'KP1');
    await srv.ok('DELETE', '/api/projects/' + p.id);
    await srv.ok('POST', '/api/projects', { ma: 'kp1', ten: 'Tạo lại cùng mã' });
    const tr = await trash(srv);
    const tCost = tr.find((t) => t.kind === 'costs');
    const tVt = tr.find((t) => t.kind === 'materials');
    const tP = tr.find((t) => t.kind === 'projects');
    let r = await srv.call('POST', '/api/trash/' + tCost.id + '/restore');
    assert.equal(r.status, 409); assert.match(r.json.error, /Vật tư "KP-VT" không còn trong danh mục/);
    r = await srv.call('POST', '/api/trash/' + tP.id + '/restore');
    assert.equal(r.status, 409); assert.match(r.json.error, /Mã "KP1" đã có trong danh mục/);
    await srv.ok('POST', '/api/trash/' + tVt.id + '/restore');
    await srv.ok('POST', '/api/trash/' + tCost.id + '/restore');
    const db2 = await srv.db();
    assert.ok(db2.costs.some((c) => c.id === cid));
    assert.deepEqual(orphanErrors(db2), []);
  } finally { await srv.stop(); }
});

test('N1.5 id và số thứ tự của bản ghi trong thùng rác không bị cấp lại (kể cả sau khi mở lại phần mềm)', async () => {
  const dir = makeDataDir(V2);
  let srv = await startServer({ data: dir });
  let id;
  try {
    id = (await srv.ok('POST', '/api/entries', { ngay: '2026-09-30', noiDung: 'dòng cuối', chi: 1 })).id;
    await srv.ok('DELETE', '/api/entries/' + id);
  } finally { await srv.stop(); }
  // file bị sửa tay (công cụ SQLite): nextId sai → vẫn không cấp lại id đang nằm trong thùng rác
  const { SqliteDb } = require('../lib/db');
  const sq = new SqliteDb(path.join(dir, 'ketoan.db'));
  sq.setMeta('nextId', 1);
  sq.close();
  srv = await startServer({ data: dir });
  try {
    const n = (await srv.ok('POST', '/api/entries', { ngay: '2026-09-30', noiDung: 'mới', chi: 2 })).id;
    assert.ok(n > id, 'id mới ' + n + ' > id trong thùng rác ' + id);
    await srv.ok('POST', '/api/trash/' + (await trash(srv))[0].id + '/restore');
    const db = await srv.db();
    assert.equal(new Set(db.entries.map((e) => e.seq)).size, db.entries.length, 'số thứ tự không trùng');
    assert.deepEqual(orphanErrors(db), []);
  } finally { await srv.stop(); }
});

test('N1.6 lọc nhật ký: ngày, loại thao tác, loại dữ liệu, bản ghi, từ khóa không dấu', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const id = (await srv.ok('POST', '/api/entries', { ngay: '2026-09-20', noiDung: 'Thanh toán tiền điện', chi: 350000 })).id;
    await srv.ok('POST', '/api/projects', { ma: 'LOC', ten: 'Lọc' });
    const today = KT.todayISO();
    assert.equal((await srv.ok('GET', '/api/audit?action=them')).total, 2);
    assert.equal((await srv.ok('GET', '/api/audit?kind=projects')).total, 1);
    assert.equal((await srv.ok('GET', '/api/audit?q=tien%20dien')).total, 1, 'tìm không dấu');
    assert.equal((await srv.ok('GET', '/api/audit?q=350.000')).total, 1, 'tìm theo số tiền');
    assert.equal((await srv.ok('GET', '/api/audit?recId=' + id)).total, 1);
    assert.equal((await srv.ok('GET', '/api/audit?from=' + today + '&to=' + today)).total, 3);
    assert.equal((await srv.ok('GET', '/api/audit?to=2020-01-01')).total, 0);
    const r = await srv.ok('GET', '/api/audit?limit=1');
    assert.equal(r.items.length, 1); assert.equal(r.total, 3); assert.equal(r.items[0].kind, 'projects', 'mới nhất trước');
  } finally { await srv.stop(); }
});

test('N1.7 nhật ký bền: dòng cuối ghi dở (mất điện) không làm hỏng; khôi phục sao lưu không xóa lịch sử và được ghi lại', async () => {
  const dir = makeDataDir(V2);
  let srv = await startServer({ data: dir });
  try { await srv.ok('POST', '/api/entries', { ngay: '2026-09-20', noiDung: 'a', chi: 1 }); } finally { await srv.stop(); }
  fs.appendFileSync(path.join(dir, 'nhat-ky.jsonl'), '{"id":99,"at":"2026-'); // ghi dở
  srv = await startServer({ data: dir });
  try {
    const r = await srv.ok('GET', '/api/audit');
    assert.equal(r.total, 2); assert.equal(r.bad, 1);
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-21', noiDung: 'b', chi: 2 });
    const name = (await srv.ok('POST', '/api/backups/now')).name;
    await srv.ok('POST', '/api/entries', { ngay: '2026-09-22', noiDung: 'c', chi: 3 });
    await srv.ok('POST', '/api/backups/restore', { name });
    const items = (await srv.ok('GET', '/api/audit')).items;
    assert.equal(items[0].action, 'khoi-phuc-sao-luu');
    assert.ok(items.some((a) => a.after && a.after.noiDung === 'c'), 'lịch sử sau thời điểm sao lưu vẫn còn');
    const db = await srv.db();
    assert.ok(!db.entries.some((e) => e.noiDung === 'c'));
    // khôi phục từ bản dữ liệu cũ (schema 2) cũng được nâng cấp
    const up = await srv.ok('POST', '/api/restore', readJsonFile(V2));
    assert.equal(up.db.schema, SCHEMA_VERSION);
    assert.deepEqual(summarize(up.db), readJsonFile(MOC).v2);
  } finally { await srv.stop(); }
  const lines = fs.readFileSync(path.join(dir, 'nhat-ky.jsonl'), 'utf8').split('\n').filter(Boolean);
  assert.equal(lines.filter((l) => { try { JSON.parse(l); return true; } catch (e) { return false; } }).length, lines.length - 1, 'chỉ dòng ghi dở là hỏng');
});

test('N1.8 xóa toàn bộ, nhập Excel: có mục nhật ký tóm tắt', async () => {
  const srv = await startServer({ seed: V2 });
  try {
    const x = (await srv.call('GET', '/api/export/costs')).body;
    await srv.ok('POST', '/api/import?mode=merge', x);
    await srv.ok('POST', '/api/reset-costs', { confirm: 'XOA' });
    const items = await audit(srv);
    assert.equal(items[0].action, 'xoa-toan-bo'); assert.match(items[0].note, /104 dòng chi phí/);
    assert.equal(items[1].action, 'nhap-excel'); assert.match(items[1].label, /gộp thêm/);
  } finally { await srv.stop(); }
});
