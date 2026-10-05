'use strict';
/*
 * Chuẩn bị tài nguyên giao diện chạy offline:
 *  - Font Archivo (biến thiên, có tiếng Việt) có sẵn trong public/vendor/fonts — script chỉ đếm, không chép
 *  - Icon Lucide (nét 1.5): chỉ giữ các icon thực sự được dùng trong public/ (quét tên "ph-..."), vẽ bằng CSS mask
 *    nên mã giao diện vẫn viết <i class="ph ph-plus"> như trước. Tên ph-... cũ được đổi sang icon Lucide tương ứng (BANG_DOI).
 * Nguồn icon: node_modules (devDependencies lucide-static)
 *        hoặc thư mục trong biến môi trường KETOAN_NGUON_TAI_NGUYEN (chứa các gói đã giải nén: <tên-gói>/package/...).
 * Chạy: npm run build:assets  (npm run build = assets + Tailwind CSS). File sinh ra được đưa vào git nên máy dùng phần mềm không cần chạy lệnh này.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const VENDOR = path.join(PUBLIC, 'vendor');
const NM = path.join(ROOT, 'node_modules');
const EXTRA = process.env.KETOAN_NGUON_TAI_NGUYEN || '';

function ensure(dir) { fs.mkdirSync(dir, { recursive: true }); }
function pkgDir(name) {
  const cands = [path.join(NM, name)];
  if (EXTRA) cands.push(path.join(EXTRA, name.replace(/^@/, '').replace('/', '-'), 'package'));
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error('Không tìm thấy gói ' + name + ' (đã tìm: ' + cands.join(', ') + ')');
}

/* ---------- Font Archivo (đã đóng gói sẵn trong public/vendor/fonts, không cần sinh lại) ---------- */
ensure(path.join(VENDOR, 'fonts'));
const nFont = fs.readdirSync(path.join(VENDOR, 'fonts')).filter((f) => f.startsWith('archivo-')).length;

/* ---------- Icon Lucide ---------- */
function walk(dir, out) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { if (f !== 'vendor') walk(p, out); } else if (/\.(js|html)$/.test(f)) out.push(p);
  }
  return out;
}
// tên cũ (Phosphor) -> tên Lucide
const BANG_DOI = {
  'address-book': 'contact', 'arrow-counter-clockwise': 'undo-2', 'arrow-down-left': 'arrow-down-left', 'arrow-square-out': 'external-link',
  'arrow-up-right': 'arrow-up-right', 'arrows-left-right': 'arrow-left-right', 'arrows-merge': 'merge', 'bank': 'landmark',
  'book-open-text': 'book-open-text', 'buildings': 'building-2', 'calculator': 'calculator', 'calendar-blank': 'calendar',
  'caret-down': 'chevron-down', 'caret-right': 'chevron-right', 'chart-bar-horizontal': 'chart-bar', 'chart-line': 'chart-line',
  'chart-line-up': 'chart-no-axes-combined', 'check': 'check', 'check-circle': 'circle-check', 'circle': 'circle',
  'circle-notch': 'loader-circle', 'clock-counter-clockwise': 'history', 'coins': 'coins', 'copy': 'copy', 'crane': 'construction',
  'database': 'database', 'download-simple': 'download', 'eraser': 'eraser', 'eye': 'eye', 'eye-slash': 'eye-off',
  'file-dashed': 'file-pen-line', 'file-xls': 'file-spreadsheet', 'flag': 'flag', 'floppy-disk': 'save', 'funnel': 'funnel',
  'gear-six': 'settings', 'git-fork': 'git-fork', 'hand-coins': 'hand-coins', 'hard-hat': 'hard-hat', 'house-line': 'house',
  'info': 'info', 'intersect': 'combine', 'keyboard': 'keyboard', 'list': 'list', 'list-bullets': 'list', 'lock-simple': 'lock',
  'lock-simple-open': 'lock-open', 'magnifying-glass': 'search', 'map-pin': 'map-pin', 'minus-circle': 'circle-minus',
  'money': 'banknote', 'note-pencil': 'square-pen', 'notebook': 'notebook', 'package': 'package', 'paperclip': 'paperclip',
  'pencil-simple': 'pencil', 'phone': 'phone', 'plus': 'plus', 'printer': 'printer', 'receipt': 'receipt', 'rows': 'rows-3',
  'scales': 'scale', 'scissors': 'scissors', 'shield-check': 'shield-check', 'squares-four': 'layout-grid', 'stack': 'layers',
  'table': 'table', 'tag': 'tag', 'trash': 'trash-2', 'tree-structure': 'network', 'upload-simple': 'upload',
  'user-circle': 'circle-user', 'warning': 'triangle-alert', 'warning-circle': 'circle-alert', 'x': 'x'
};
const used = new Set();
for (const file of walk(PUBLIC, [])) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\bph-([a-z0-9]+(?:-[a-z0-9]+)*)/g)) used.add(m[1]);
}
const lucideDir = path.join(pkgDir('lucide-static'), 'icons');
const rules = [];
const thieu = [];
for (const ten of [...used].sort()) {
  if (ten === 'duotone') continue;
  const lu = BANG_DOI[ten] || ten; // tên mới viết thẳng theo Lucide
  const f = path.join(lucideDir, lu + '.svg');
  if (!fs.existsSync(f)) { thieu.push(ten); continue; }
  const inner = /<svg[^>]*>([\s\S]*?)<\/svg>/.exec(fs.readFileSync(f, 'utf8'))[1].replace(/\s*\n\s*/g, '');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  const uri = 'url("data:image/svg+xml,' + encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22') + '")';
  rules.push('.ph-' + ten + ' { --ph: ' + uri + '; }');
}
ensure(path.join(VENDOR, 'lucide'));
fs.writeFileSync(path.join(VENDOR, 'lucide', 'icons.css'),
  '/* Lucide (ISC) — chỉ gồm các icon phần mềm đang dùng, nét 1.5; tạo bởi scripts/build-assets.js */\n' +
  '.ph, .ph-duotone {\n  display: inline-block; flex: none; width: 1em; height: 1em; vertical-align: -0.125em;\n  background-color: currentColor;\n' +
  '  -webkit-mask: var(--ph) center / contain no-repeat; mask: var(--ph) center / contain no-repeat;\n}\n' + rules.join('\n') + '\n');
// thư mục cũ của Phosphor không còn dùng
fs.rmSync(path.join(VENDOR, 'phosphor'), { recursive: true, force: true });

console.log('Đã chép ' + nFont + ' file font Archivo (có sẵn) và ' + rules.length + ' icon Lucide vào public/vendor' + (thieu.length ? '. Bỏ qua (không phải icon): ' + thieu.join(', ') : ''));
