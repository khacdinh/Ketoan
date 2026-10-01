#!/usr/bin/env node
'use strict';
/*
 * Số kỳ vọng tính ĐỘC LẬP từ ô nguồn của file ChiPhi_CongTrinh_*.xlsm — không dùng ExcelJS, không dùng mã của công cụ import:
 * đọc thẳng XML trong file (JSZip), lấy ô nhập tay, bỏ mọi giá trị công thức đã lưu sẵn.
 *   NHATKYCHUNG: dòng có ô nhập tay (trừ cột Nguồn); tiền của dòng = Thành tiền gõ tay nếu có, ngược lại Số lượng × Đơn giá;
 *                không có cả hai = dòng không có tiền.
 *   SO_QUY:      dòng có Số tiền gõ tay khác 0; ô Số tiền là công thức thì lấy số gõ tay ở cột Chi/Thu.
 * Dùng: node scripts/so-ky-vong-excel.js [thư mục hoặc file .xlsm ...]   (mặc định import-input/)
 * Công cụ import (scripts/import-excel-chiphi.js) gọi computeExpected() để đối chiếu trước khi ghi.
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const lower = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[_\s]+/g, ' ').trim();
const nameKey = (s) => lower(String(s || '').normalize('NFC')).replace(/[^a-z0-9]+/g, ' ').trim();
const codeKey = (s) => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');

function colIndex(ref) {
  const m = /^([A-Z]+)/.exec(ref);
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

async function readSheets(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const wbXml = await zip.file('xl/workbook.xml').async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const relMap = {};
  rels.replace(/<Relationship\b[^>]*>/g, (tag) => {
    const id = /Id="([^"]+)"/.exec(tag);
    const t = /Target="([^"]+)"/.exec(tag);
    if (id && t) relMap[id[1]] = t[1];
    return '';
  });
  const shared = [];
  const ss = zip.file('xl/sharedStrings.xml');
  if (ss) {
    const xml = await ss.async('string');
    xml.replace(/<si>([\s\S]*?)<\/si>/g, (m, inner) => {
      let t = '';
      inner.replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, (mm, x) => { t += x; return ''; });
      shared.push(unxml(t));
      return '';
    });
  }
  const sheets = {};
  const list = [];
  wbXml.replace(/<sheet\b[^>]*>/g, (tag) => {
    const name = /name="([^"]+)"/.exec(tag);
    const rid = /r:id="([^"]+)"/.exec(tag);
    if (name && rid) list.push({ name: unxml(name[1]), target: relMap[rid[1]] });
    return '';
  });
  for (const s of list) {
    const p = 'xl/' + s.target.replace(/^\/?xl\//, '').replace(/^\.\//, '');
    const f = zip.file(p);
    if (!f) continue;
    const xml = await f.async('string');
    const rows = new Map();
    xml.replace(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g, (m, rn, inner) => {
      const cells = new Map();
      inner.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (mm, attrs, body) => {
        const ref = /r="([A-Z]+\d+)"/.exec(attrs)[1];
        const t = (/\bt="([^"]+)"/.exec(attrs) || [])[1] || 'n';
        body = body || '';
        const formula = /<f\b/.test(body);
        const v = /<v>([\s\S]*?)<\/v>/.exec(body);
        let value = null;
        if (!formula) {
          if (t === 's' && v) value = shared[Number(v[1])];
          else if (t === 'inlineStr') { const is = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(body); value = is ? unxml(is[1]) : null; }
          else if (t === 'str' && v) value = unxml(v[1]);
          else if (t === 'b' && v) value = v[1] === '1';
          else if (v) value = Number(v[1]);
          if (typeof value === 'string' && !value.trim()) value = null;
        }
        cells.set(colIndex(ref), { formula, value });
        return '';
      });
      rows.set(Number(rn), cells);
      return '';
    });
    sheets[s.name] = rows;
  }
  return sheets;
}

function headerOf(rows) {
  const h = new Map();
  const r1 = rows.get(1) || new Map();
  r1.forEach((c, col) => { if (c.value != null) h.set(lower(c.value), col); });
  return h;
}
const find = (h, pred) => { for (const [k, v] of h) if (pred(k)) return v; return 0; };
const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && /^-?[\d.,]+$/.test(v.trim()) ? Number(v.replace(/\./g, '').replace(',', '.')) : null);

// SL × ĐG chính xác bằng BigInt (SL tối đa 4 số lẻ, ĐG tối đa 2 số lẻ), làm tròn nửa ra xa 0
function exactProduct(sl, dg) {
  const a = BigInt(Math.round(sl * 10000));
  const b = BigInt(Math.round(dg * 100));
  const p = a * b; // đơn vị 1e-6
  const neg = p < 0n;
  const q = (neg ? -p : p);
  const r = (q + 500000n) / 1000000n;
  return Number(neg ? -r : r);
}

async function computeExpected(file) {
  const sheets = await readSheets(file);
  const out = { file: path.basename(file).normalize('NFC'), nkcRows: 0, nkcTong: 0, nkcKhongTien: 0, nkcKhoan: 0, theoHangMuc: {}, theoNCC: {}, theoNha: {}, theoLoai: {}, sqRows: 0, sqTong: 0, sqChi: 0, sqThu: 0, sqLoaiTrong: 0 };
  const nk = sheets.NHATKYCHUNG;
  if (nk) {
    const h = headerOf(nk);
    const c = {
      ngay: find(h, (k) => k === 'ngay'), maCT: find(h, (k) => k === 'ma ct'), maNha: find(h, (k) => k === 'ma nha'), hm: find(h, (k) => k === 'hang muc'),
      loai: find(h, (k) => k === 'loai cp'), maVT: find(h, (k) => k === 'ma vt'), dg2: find(h, (k) => k.startsWith('dien giai')), sl: find(h, (k) => k.startsWith('so luong')),
      dg: find(h, (k) => k.startsWith('don gia')), tt: find(h, (k) => k.startsWith('thanh tien')), ncc: find(h, (k) => k === 'ma ncc'), sp: find(h, (k) => k.startsWith('so phieu')),
      gc: find(h, (k) => k.startsWith('ghi chu'))
    };
    const inputCols = [c.ngay, c.maCT, c.maNha, c.hm, c.loai, c.maVT, c.dg2, c.sl, c.dg, c.tt, c.ncc, c.sp, c.gc].filter(Boolean);
    const rowNums = Array.from(nk.keys()).filter((r) => r > 1).sort((a, b) => a - b);
    for (const r of rowNums) {
      const cells = nk.get(r);
      const val = (col) => { const x = cells.get(col); return x && !x.formula ? x.value : null; };
      if (!inputCols.some((col) => val(col) != null)) continue;
      out.nkcRows++;
      const sl = num(val(c.sl));
      const dg = num(val(c.dg));
      const tt = num(val(c.tt));
      let amt = null;
      if (tt != null) { amt = Math.round(tt); if (sl == null || dg == null) out.nkcKhoan++; }
      else if (sl != null && dg != null) amt = exactProduct(sl, dg);
      if (amt == null) { out.nkcKhongTien++; continue; }
      out.nkcTong += amt;
      const add = (m, k) => { m[k] = (m[k] || 0) + amt; };
      add(out.theoHangMuc, nameKey(val(c.hm)));
      add(out.theoNCC, codeKey(val(c.ncc)));
      add(out.theoNha, codeKey(val(c.maNha)));
      add(out.theoLoai, String(val(c.loai) || '').trim());
    }
  }
  const sq = sheets.SO_QUY;
  if (sq) {
    const h = headerOf(sq);
    const k = find(h, (x) => x === 'so tien');
    const loai = find(h, (x) => x === 'loai');
    const thu = find(h, (x) => x === 'thu');
    const chi = find(h, (x) => x === 'chi');
    for (const [r, cells] of sq) {
      if (r === 1) continue;
      const cell = cells.get(k);
      let amt = null;
      if (cell && !cell.formula) amt = num(cell.value);
      else if (cell && cell.formula) {
        const o = cells.get(chi); const n = cells.get(thu);
        amt = o && !o.formula && num(o.value) ? num(o.value) : n && !n.formula && num(n.value) ? num(n.value) : null;
      }
      if (!amt) continue;
      out.sqRows++;
      out.sqTong += Math.round(amt);
      const l = cells.get(loai);
      const lv = l && !l.formula && l.value ? lower(l.value) : '';
      if (!lv) out.sqLoaiTrong++;
      if (lv.startsWith('thu')) out.sqThu += Math.round(amt); else out.sqChi += Math.round(amt);
    }
  }
  return out;
}

module.exports = { computeExpected, readSheets };

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const targets = args.length ? args : [path.join(__dirname, '..', 'import-input')];
    const files = [];
    targets.forEach((t) => {
      if (fs.statSync(t).isDirectory()) fs.readdirSync(t).filter((f) => /\.(xlsm|xlsx)$/i.test(f) && !/^~\$/.test(f)).forEach((f) => files.push(path.join(t, f)));
      else files.push(t);
    });
    const fmt = (n) => Number(n).toLocaleString('vi-VN');
    for (const f of files.sort()) {
      const e = await computeExpected(f);
      console.log(e.file);
      console.log('  NHATKYCHUNG: ' + e.nkcRows + ' dòng dữ liệu, ' + e.nkcKhongTien + ' dòng không có tiền, ' + e.nkcKhoan + ' dòng chỉ có Thành tiền; Σ ' + fmt(e.nkcTong));
      console.log('  SO_QUY:      ' + e.sqRows + ' dòng có tiền; Σ ' + fmt(e.sqTong) + ' (chi ' + fmt(e.sqChi) + ', thu ' + fmt(e.sqThu) + ', Loại trống ' + e.sqLoaiTrong + ')');
      console.log('  Theo Loại CP: ' + Object.entries(e.theoLoai).map(([k, v]) => (k || '(trống)') + ' ' + fmt(v)).join('; '));
    }
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
