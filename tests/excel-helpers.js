'use strict';
/* Tiện ích kiểm thử Excel: đọc bằng exceljs, tính lại công thức bằng LibreOffice, tự dựng file mẫu. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');

async function loadWb(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

// Giá trị hiển thị của ô (công thức → kết quả đã lưu)
function cellVal(c) {
  let v = c.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) v = v.result;
    else if ('formula' in v || 'sharedFormula' in v) v = null;
    else if (v.richText) v = v.richText.map((t) => t.text).join('');
    else if (v.text) v = v.text;
    else if (v.error) v = v.error;
  }
  return v === undefined ? null : v;
}

function hasFormula(c) {
  const v = c.value;
  return !!(v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v));
}

function sheetRows(ws) {
  const out = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => { out.push({ n, row }); });
  return out;
}

// Bỏ kết quả lưu sẵn của mọi ô công thức để buộc LibreOffice tính lại từ đầu
async function stripCachedValues(buf) {
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  for (const n of names) {
    let xml = await zip.file(n).async('string');
    xml = xml.replace(/(<f(?:\s[^>]*)?>[^<]*<\/f>|<f(?:\s[^>]*)?\/>)\s*<v>[^<]*<\/v>/g, '$1');
    zip.file(n, xml);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function findSoffice() {
  for (const c of ['soffice', 'libreoffice']) {
    const r = spawnSync('which', [c], { encoding: 'utf8' });
    if (r.status === 0) return r.stdout.trim();
  }
  return null;
}

// LibreOffice tính lại rồi lưu ra xlsx mới; trả về buffer
function recalcWithLibreOffice(buf, tag) {
  const soffice = findSoffice();
  if (!soffice) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-' + (tag || 'x') + '-'));
  const inp = path.join(dir, 'in.xlsx');
  const out = path.join(dir, 'out');
  fs.mkdirSync(out);
  fs.writeFileSync(inp, buf);
  const r = spawnSync(soffice, ['-env:UserInstallation=file://' + path.join(dir, 'profile'), '--headless', '--norestore', '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', out, inp],
    { encoding: 'utf8', timeout: 180000 });
  const f = path.join(out, 'in.xlsx');
  if (!fs.existsSync(f)) throw new Error('LibreOffice không chuyển được file: ' + (r.stderr || r.stdout));
  return fs.readFileSync(f);
}

function same(a, b) {
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : false;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6;
  if (a === '' || a == null) return b === '' || b == null;
  if (b === '' || b == null) return false;
  return String(a) === String(b);
}

/*
 * Với MỌI ô công thức: kết quả LibreOffice tính lại phải bằng kết quả phần mềm đã ghi sẵn cạnh công thức.
 * Trả về { formulas, mismatches: [...], errors: [...] } (errors = ô có giá trị lỗi Excel như #REF!, #NAME?)
 */
async function recalcCompare(buf, tag) {
  const stripped = await stripCachedValues(buf);
  const lo = recalcWithLibreOffice(stripped, tag);
  if (!lo) return null;
  const orig = await loadWb(buf);
  const re = await loadWb(lo);
  const res = { formulas: 0, mismatches: [], errors: [] };
  orig.eachSheet((ws) => {
    const w2 = re.getWorksheet(ws.name);
    if (!w2) { res.mismatches.push(ws.name + ': sheet biến mất sau khi tính lại'); return; }
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (c) => {
        const after = cellVal(w2.getCell(c.address));
        if (typeof after === 'string' && /^(#[A-Z0-9/!?]+|Err:\d+)$/.test(after)) res.errors.push(ws.name + '!' + c.address + ' = ' + after);
        if (!hasFormula(c)) return;
        res.formulas++;
        const before = cellVal(c);
        if (!same(before, after)) res.mismatches.push(ws.name + '!' + c.address + ' = ' + JSON.stringify(c.value.formula || c.value.sharedFormula).slice(0, 90) + ' | phần mềm: ' + JSON.stringify(before) + ' | LibreOffice: ' + JSON.stringify(after));
      });
    });
  });
  return res;
}

// Tiền = số nguyên: SL (4 số lẻ) × ĐG (2 số lẻ), làm tròn nửa lên, bằng BigInt (độc lập với shared.js)
function thanhTien(sl, dg) {
  const a = BigInt(Math.round(Number(sl) * 10000));
  const b = BigInt(Math.round(Number(dg) * 100));
  return Number((a * b * 2n + 1000000n) / 2000000n);
}

function isoOfCell(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}

module.exports = { ExcelJS, JSZip, loadWb, cellVal, hasFormula, sheetRows, stripCachedValues, findSoffice, recalcWithLibreOffice, recalcCompare, thanhTien, isoOfCell };
