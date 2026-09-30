'use strict';
/*
 * Chuẩn bị tài nguyên giao diện chạy offline:
 *  - Font Archivo (variable: độ đậm 100–900, độ rộng 62–125%, có tiếng Việt và số đều cột)
 *  - Icon Phosphor: chỉ giữ các icon thực sự được dùng trong public/ (quét tên "ph-...")
 * Chạy: npm run build:assets  (npm run build = assets + Tailwind CSS)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const VENDOR = path.join(PUBLIC, 'vendor');
const NM = path.join(ROOT, 'node_modules');

function ensure(dir) { fs.mkdirSync(dir, { recursive: true }); }

/* ---------- Font Archivo ---------- */
ensure(path.join(VENDOR, 'fonts'));
const fontDir = path.join(NM, '@fontsource-variable', 'archivo', 'files');
for (const subset of ['latin', 'latin-ext', 'vietnamese']) {
  const name = 'archivo-' + subset + '-standard-normal.woff2';
  fs.copyFileSync(path.join(fontDir, name), path.join(VENDOR, 'fonts', name));
}

/* ---------- Icon Phosphor (regular + duotone), chỉ các icon đang dùng ---------- */
function walk(dir, out) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { if (f !== 'vendor') walk(p, out); } else if (/\.(js|html)$/.test(f)) out.push(p);
  }
  return out;
}
const used = new Set();
for (const file of walk(PUBLIC, [])) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\bph-([a-z0-9]+(?:-[a-z0-9]+)*)/g)) if (m[1] !== 'duotone') used.add(m[1]);
}

const phDir = path.join(NM, '@phosphor-icons', 'web', 'src');
function extract(style, familyName, fontFile, baseClass, rulePattern) {
  const css = fs.readFileSync(path.join(phDir, style, 'style.css'), 'utf8');
  const base = new RegExp('^\\' + baseClass + ' \\{[\\s\\S]*?\\n\\}', 'm').exec(css);
  if (!base) throw new Error('Không tìm thấy lớp ' + baseClass + ' trong ' + style);
  const rules = [];
  const found = new Set();
  for (const m of css.matchAll(rulePattern)) {
    if (used.has(m[1])) { rules.push(m[0]); found.add(m[1]); }
  }
  return {
    css: '@font-face {\n  font-family: "' + familyName + '";\n  src: url("./' + fontFile + '") format("woff2");\n' +
      '  font-weight: normal;\n  font-style: normal;\n  font-display: block;\n}\n' + base[0] + '\n' + rules.join('\n') + '\n',
    found
  };
}
ensure(path.join(VENDOR, 'phosphor'));
fs.copyFileSync(path.join(phDir, 'regular', 'Phosphor.woff2'), path.join(VENDOR, 'phosphor', 'Phosphor.woff2'));
fs.copyFileSync(path.join(phDir, 'duotone', 'Phosphor-Duotone.woff2'), path.join(VENDOR, 'phosphor', 'Phosphor-Duotone.woff2'));
const regular = extract('regular', 'Phosphor', 'Phosphor.woff2', '.ph', /\.ph\.ph-([a-z0-9-]+):before\s*\{[^}]*\}/g);
const duotone = extract('duotone', 'Phosphor-Duotone', 'Phosphor-Duotone.woff2', '.ph-duotone', /\.ph-duotone\.ph-([a-z0-9-]+):(?:before|after)\s*\{[^}]*\}/g);
fs.writeFileSync(path.join(VENDOR, 'phosphor', 'icons.css'),
  '/* Phosphor Icons (MIT) — chỉ gồm các icon phần mềm đang dùng; tạo bởi scripts/build-assets.js */\n' + regular.css + '\n' + duotone.css);

const included = new Set([...regular.found, ...duotone.found]);
console.log('Đã chép font Archivo (3 file) và ' + included.size + ' icon Phosphor vào public/vendor');
