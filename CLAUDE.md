# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

"Sổ Thu Chi" — a local, offline, single-user accounting app (Vietnamese UI) with two parts that mirror two Excel workbooks: the cash book ("Quản lý thu chi": `Tong_Quan`, `So_Thu_Chi_Hang_Ngay`, `Phieu_Chi`, `Danh_Muc_Du_An`, `Danh_Muc_NCC`, `Tong_Hop_NCC`) and construction costs ("ChiPhi_CongTrinh": `PHIEU_NHAP`, `NHATKYCHUNG`, `TONGHOP`, `CHI_TIET_THEO_NHOM`, `CONGNO_NCC`, `DM_*`; the `DUTOAN` estimates sheet was deliberately dropped at the user's request and is ignored on import). Plain Node.js HTTP server + vanilla JS frontend; no framework, no bundler. The only runtime dependency is `exceljs`. End users launch it with `KhoiDong.bat`; `HUONG_DAN_SU_DUNG.md` is the end-user manual (Vietnamese).

Code identifiers, comments, UI strings and error messages are in Vietnamese — keep it that way (e.g. `thu`/`chi` = income/expense, `ton` = running cash balance, `maDuAn` = project code, `maNCC` = supplier code, `soPhieu` = voucher number, `nganSach` = budget; cost side: `maCT` = công trình = project code, `maNha` = house, `maHM` = hạng mục/cost item, `maNhom` = cost group, `maVT` = material, `loaiCP` = cost type, `soLuong`×`donGia`=`thanhTien`).

## Commands

```bash
npm start                 # node server.js — listens on 127.0.0.1:3939 and opens the browser
node server.js --no-open  # don't open a browser (also NO_OPEN=1)
npm run build             # build:assets + build:css — run after changing UI markup/classes/icons
npm run watch:css         # Tailwind watch while editing UI
```

Env vars: `PORT` (default 3939; auto-increments up to 20 ports if busy, and if the port is already held by this app it just opens the browser and exits), `KETOAN_DATA` (data directory, default `./data`). Use `KETOAN_DATA` pointing at a scratch dir when experimenting so the real `data/ketoan.json` isn't touched.

There are no tests or linter configured.

## Architecture

**Shared calculation module — `public/js/shared.js`.** UMD file loaded both as `window.KT` in the browser (classic `<script>`) and via `require` on the server (`server.js`, `lib/importer.js`, `lib/exporter.js`). All business math lives here — amount parsing (`parseAmount` accepts `1.250.000`, `50tr`, `300k`, `58000+11000`), money-in-words (`docTienBangChu`, matching the original Excel formula), running balance (`buildLedger`), filtering, project/supplier summaries, voucher grouping (`buildVouchers`), next voucher number. UI, printed vouchers and Excel exports must all go through these functions so the numbers agree. Keep it dependency-free and ES5-ish-compatible with both environments (no `import`/`export`).

**Server — `server.js`.** Single `http` server, hand-rolled routing in `handleApi`. Every mutating endpoint validates input via `cleanEntry`/`cleanProject`/`cleanSupplier`, mutates `store.db` in memory, calls `store.save()`, and **responds with the entire DB** (`ok()` → `{ ok: true, db }`). API requests with a non-localhost `Origin` are rejected. Renaming a project/supplier code cascades to all entries; deleting one that's in use is refused.

**Storage — `lib/store.js`.** Whole DB is one JSON file `data/ketoan.json` (schema 2: `{ schema, settings, projects, suppliers, entries, vouchers, costGroups, costItems, materials, houses, costs, nextId }`). Loading a schema-1 file backs it up (`truoc-nang-cap-v2`), seeds the default 6 cost groups / 37 cost items and rewrites it; bump `SCHEMA_VERSION` and extend `normalize()` for future migrations. Writes are atomic (tmp + rename, with a copy fallback for Windows file locks). Auto-backups go to `data/backups/` (at most one per 10 min during edits, plus always before import/restore/reset via `replaceAll`; keeps 60). `normalize()` repairs missing ids/`seq` (so importers can push records with `id: 0` and call `replaceAll`). Entries are ordered by `ngay` then `seq`; `id` is global across all lists. `vouchers` is a map of voucher-number (uppercased) → print overrides only; vouchers themselves are derived by grouping entries with the same `soPhieu` (prefix `PT` = receipt/thu, otherwise payment/chi).

**Frontend — `public/`.** `index.html` loads `shared.js` then ES module `js/app.js`. Hash router (`#/so-thu-chi`, etc.) in `app.js` maps routes to `render*` functions in `js/views/*.js`, each re-rendering `#view` via HTML strings (always escape with `esc()` from `ui.js`). `ui.js` `api()` wraps `fetch`; whenever a response contains `db`, it calls `setDb` (`state.js`), which recomputes the ledger and re-renders the current view — so views never patch local state after a mutation. Filters persist in `localStorage` under the `stc.` prefix. `forms.js` = entry/catalog modals, `print.js` = A4 two-copy ("2 liên") voucher printing.

**Excel — `lib/importer.js`, `lib/exporter.js`, `lib/chart.js`.** Importer recognises columns by header text (so both the original workbook and this app's own exports re-import) and supports dry-run preview, `replace` and `merge`. Exporter reproduces the original workbook layout *with live formulas* (VLOOKUP names, cumulative balance, SUMIF summaries, a `Phieu_Chi` sheet driven by a voucher-number input cell). ExcelJS can't create charts, so `chart.js` injects DrawingML column charts directly into the xlsx zip via JSZip.

**Styling/assets.** Tailwind v4: source `src/styles/app.css` (design tokens in `@theme`; scans `public/index.html` and `public/js`) → compiled, minified output (served as-is; not built at startup) `public/css/app.css`. `scripts/build-assets.js` copies Archivo fonts and generates `public/vendor/phosphor/icons.css` containing **only the Phosphor icons referenced** (`ph-...` class names found in `public/**/*.js|html`). After adding a Tailwind class or a new icon, rerun `npm run build`, otherwise it won't render. Everything must work offline — don't add CDN links.

**Construction costs (chi phí công trình).** Projects and suppliers are shared with the cash book (a công trình *is* a project; no duplicate tables). Cost rows store only codes; names, group, unit are always looked up from catalogs (`KT.buildCostLedger`), so renaming a catalog entry updates every report. A phiếu nhập is the set of rows sharing `phieuId` (allocated from `store.newId()`). All cost math is in `shared.js` (`costAmount` = integer-safe SL×ĐG, `costSummary`, `supplierDebt` = cost rows − (cash-book chi − thu) joined by `maNCC` and optionally `maCT`=`maDuAn`, `materialStats`, `priceHistory`, `lastPrice`, `costSlips`). `lib/costApi.js` holds catalog CRUD with rename cascades/delete guards (`REFS`), slip and row endpoints; `server.js` delegates to it and also calls its `cascadeRename`/`usages` for projects/suppliers. `lib/costImporter.js` is tried first in `/api/import` (returns null for non-cost workbooks); it recomputes formula columns, maps file CT codes to existing projects, dedupes as a multiset, and optionally imports `SO_QUY` into the cash book. `lib/costExporter.js` writes the ChiPhi_CongTrinh layout with live SUMIFS/INDEX-MATCH formulas and re-imports cleanly; it post-processes `<sheetPr>` child order because ExcelJS emits `outlinePr` after `pageSetUpPr` (Excel refuses to open the file otherwise). Frontend views: `views/cost-entry.js` (multi-row grid, keeps an in-progress draft in `localStorage` because every `setDb` re-renders the route), `cost-ledger.js`, `cost-reports.js`, `cost-catalogs.js`.

When verifying Excel output, open it in real Excel (COM automation via PowerShell works on this machine) — ExcelJS will happily write files Excel cannot open.

`So Thu Chi UI.html` is a large bundled design mockup, not part of the running app.
