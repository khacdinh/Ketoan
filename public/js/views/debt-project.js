/* Công nợ NCC theo công trình: công trình nào còn nợ nhà cung cấp nào, bao nhiêu.
 * Hai cách xem: danh sách nhóm theo công trình (mỗi công trình bung ra các NCC: Đầu kỳ / Phát sinh / Thanh toán / Cuối kỳ)
 * và bảng chéo NCC × công trình (ô = số dư cuối kỳ). Số liệu từ KT.supplierDebtByProject: mỗi NCC cộng các công trình
 * (kể cả nhóm "Chưa gán công trình") bằng đúng số ở màn Công nợ NCC theo kỳ. */
import { $, esc, money, icon, download, periodControls, bindPeriodControls, refreshPeriod, freshRoot, debounce, LS, setPageActions } from '../ui.js';
import { S, saveFilter } from '../state.js';
import { printView } from '../print.js';
import { openEntryForm } from '../forms.js';
import { debtChip, ghiPhieuChi, ctNhan, coNoHtml, phuongTrinhHtml, doiChieuHtml, cauNoiHtml } from '../congno.js';
import { datCongTrinh } from '../ctpick.js';

const KT = window.KT;
const TT = [['no', 'Còn nợ'], ['du', 'Ứng dư'], ['khac0', 'Còn nợ hoặc ứng dư'], ['', 'Tất cả có số liệu']];
const dash = '<span class="text-ink-3">–</span>';
const so = (n) => (n ? '<span class="tabular-nums">' + money(n) + '</span>' : dash);

function chuanHoa(f) {
  if (!f.period) f.period = 'tat-ca';
  if (!TT.some(([v]) => v === f.tt)) f.tt = 'no';
  if (f.view !== 'mt') f.view = 'ds';
  if (typeof f.q !== 'string') f.q = '';
  if (!Array.isArray(f.dong)) f.dong = [];
  refreshPeriod(f);
  return f;
}

function tongCua(rows) {
  return rows.reduce((t, r) => {
    ['dauKy', 'phatSinh', 'thanhToan', 'traNgoai', 'cuoiKy'].forEach((k) => { t[k] += r[k]; });
    if (r.cuoiKy > 0) t.conNo += r.cuoiKy; else t.ungDu -= r.cuoiKy;
    if (r.dauKy > 0) t.dauCo += r.dauKy; else t.dauNo -= r.dauKy;
    return t;
  }, { dauKy: 0, phatSinh: 0, thanhToan: 0, traNgoai: 0, cuoiKy: 0, conNo: 0, ungDu: 0, dauCo: 0, dauNo: 0 });
}

export function renderDebtByProject(root) {
  root = freshRoot(root);
  const f = chuanHoa(S.filters.cnCt);
  const ct = S.ct && S.ct !== '__none__' ? S.ct : '';
  const dong = new Set(f.dong);
  const khoaNhom = (g) => g.ma || '__chua-gan__';

  const tham = () => ['from', 'to'].filter((k) => f[k]).map((k) => k + '=' + f[k]).concat(f.tt ? ['tt=' + f.tt] : [], ct ? ['ct=' + encodeURIComponent(ct)] : [], f.q ? ['q=' + encodeURIComponent(f.q)] : []).join('&');
  setPageActions('<button type="button" class="btn btn-secondary" data-act="print">' + icon('print') + 'In</button>' +
    '<button type="button" class="btn btn-secondary" data-act="export">' + icon('excel') + 'Xuất Excel</button>', (act) => {
    if (act === 'export') download('/api/export/debt-by-project?' + tham());
    else if (act === 'print') printView('CÔNG NỢ NHÀ CUNG CẤP THEO CÔNG TRÌNH', KT.describeRange(f.from, f.to) + '. ' + ctNhan(ct) + '. ' + TT.find(([v]) => v === f.tt)[1], S.db.settings);
  });

  root.innerHTML =
    '<div class="print-only" id="print-head"></div>' +
    '<nav class="no-print -mb-2 text-[12px] text-ink-3" aria-label="Đường dẫn"><a class="text-pen underline underline-offset-2" href="#/cp-cong-no">Công nợ NCC theo kỳ</a> <span aria-hidden="true">/</span> Theo công trình</nav>' +
    '<div class="no-print flex flex-wrap items-center gap-2.5">' + periodControls(f, 'cnct') +
    '<div class="seg" role="radiogroup" aria-label="Cách xem">' + [['ds', 'Theo công trình'], ['mt', 'Bảng chéo NCC × công trình']].map(([v, l]) =>
      '<label class="seg-item"><input type="radio" name="cnct-view" value="' + v + '"' + (f.view === v ? ' checked' : '') + '><span>' + l + '</span></label>').join('') + '</div></div>' +
    '<div class="no-print flex flex-wrap items-center gap-2.5">' +
    '<div class="seg seg-sm" role="radiogroup" aria-label="Lọc theo tình trạng">' + TT.map(([v, l]) =>
      '<label class="seg-item"><input type="radio" name="cnct-tt" value="' + v + '"' + (f.tt === v ? ' checked' : '') + '><span>' + l + '</span></label>').join('') + '</div>' +
    '<label class="search min-w-[220px] flex-1 max-w-[380px]">' + icon('search') + '<input id="cnct-q" type="search" class="input" placeholder="Tìm công trình hoặc nhà cung cấp" value="' + esc(f.q) + '" aria-label="Tìm công trình hoặc nhà cung cấp"></label>' +
    '<span class="flex-1"></span>' +
    '<span id="cnct-mo" class="flex gap-1"><button type="button" class="btn btn-ghost btn-sm" data-act="mo-het">Bung hết</button><button type="button" class="btn btn-ghost btn-sm" data-act="dong-het">Thu gọn</button></span></div>' +
    '<div id="cnct-body" class="flex flex-col gap-3"></div>';

  let groups = [];
  function draw() {
    const kq = KT.supplierDebtByProject(S.db, { from: f.from, to: f.to, ct, tt: f.tt, q: f.q });
    groups = kq.groups.concat(kq.chuaGan ? [kq.chuaGan] : []);
    const tong = tongCua(groups.reduce((t, g) => t.concat(g.rows), []));
    const nCT = groups.filter((g) => g.ma && g.tong.conNo > 0).length;
    const nDu = groups.filter((g) => g.ma && g.tong.ungDu > 0).length;
    // đối chiếu với màn theo NCC: chỉ khi xem mọi công trình (một công trình thì hai màn là một)
    const dc = ct ? null : KT.doiChieuCongNo(S.db, { from: f.from, to: f.to });
    $('#cnct-mo', root).hidden = f.view !== 'ds';
    $('#cnct-body', root).innerHTML =
      phuongTrinhHtml({ dauCo: tong.dauCo, dauNo: tong.dauNo, phatSinh: tong.phatSinh, thanhToan: tong.thanhToan, traNgoai: tong.traNgoai,
        cuoiCo: tong.conNo, cuoiNo: tong.ungDu, nCo: nCT, nNo: nDu, donVi: 'công trình', idCo: 'cnct-con-no', cauNoi: f.tt || f.q ? '' : cauNoiHtml(dc, 'ct') }) +
      (dc ? doiChieuHtml(dc, LS.get('cnct.dcMo', false) === true) : '') + // mặc định thu gọn: dòng tóm tắt đã trả lời "số nào đúng"
      (f.view === 'mt' ? bangCheo(groups) : danhSach(groups, tong)) +
      '<p class="text-[12px] leading-relaxed text-ink-3">Mỗi dòng là công nợ của một nhà cung cấp <b>tại một công trình</b>: phát sinh = sổ chi phí của công trình đó; thanh toán = phiếu chi / thu và khoản trả từ nguồn khác có ghi công trình đó. ' +
      'Khoản trả hoặc số dư đầu kỳ <b>không ghi công trình</b> nằm ở nhóm “Chưa gán công trình”, nên cộng mọi nhóm của một NCC luôn bằng số ở màn Công nợ NCC theo kỳ.</p>';
  }

  function danhSach(gs, tong) {
    if (!gs.length) return '<section class="sheet p-8 text-center text-ink-3">Không có công nợ nào khớp bộ lọc.</section>';
    let html = '';
    gs.forEach((g) => {
      const k = khoaNhom(g);
      const mo = !dong.has(k);
      const t = tongCua(g.rows);
      html += '<tr class="grp clickable" data-nhom="' + esc(k) + '" tabindex="0" aria-expanded="' + mo + '">' +
        '<td><button type="button" class="tree-toggle" tabindex="-1"><span class="caret' + (mo ? ' open' : '') + '">' + icon('caretRight') + '</span>' +
        (g.ma ? '<span><span class="code">' + esc(g.ma) + '</span> · ' + esc(g.ten) + '</span>' : '<span class="text-caution">' + icon('warnTri', 'mr-1 align-[-2px]') + 'Chưa gán công trình</span>') + '</button>' +
        '<div class="sub pl-6 font-normal">' + g.rows.length + ' NCC' + (g.soNCCNo ? ' · ' + g.soNCCNo + ' còn nợ' : '') + '</div></td>' +
        '<td class="num money text-caution">' + so(t.dauNo) + '</td><td class="num money">' + so(t.dauCo) + '</td>' +
        '<td class="num money">' + so(g.tong.phatSinh) + '</td><td class="num money">' + so(g.tong.thanhToan) + '</td>' +
        '<td class="num money text-caution">' + so(g.tong.ungDu) + '</td><td class="num money"><span class="dbl" data-con-no>' + money(g.tong.conNo) + '</span></td><td colspan="2"></td></tr>';
      if (!mo) return;
      g.rows.forEach((r) => {
        html += '<tr data-ma="' + esc(r.ma) + '" data-ct="' + esc(g.ma) + '">' +
          '<td class="pl-9"><b class="code">' + esc(r.ten) + '</b><div class="sub">' + esc(r.ma) + (r.loai ? ' · ' + esc(r.loai) : '') + '</div></td>' +
          '<td class="num money text-caution">' + (r.dauKy < 0 ? so(-r.dauKy) : dash) + '</td><td class="num money">' + (r.dauKy > 0 ? so(r.dauKy) : dash) + '</td>' +
          '<td class="num money">' + so(r.phatSinh) + '</td>' +
          '<td class="num money">' + so(r.thanhToan) + (r.traNgoai ? '<div class="sub" title="Trả từ nguồn khác, không qua quỹ tiền mặt">ngoài quỹ ' + money(r.traNgoai) + '</div>' : '') + '</td>' +
          '<td class="num money font-bold text-caution">' + (r.cuoiKy < 0 ? so(-r.cuoiKy) : dash) + '</td><td class="num money font-bold">' + (r.cuoiKy > 0 ? so(r.cuoiKy) : dash) + '</td>' +
          '<td>' + debtChip(r.status) + '</td>' +
          '<td class="actions no-print"><div class="flex items-center justify-end gap-1">' +
          (r.cuoiKy > 0 && r.inCatalog && g.ma ? '<button type="button" class="btn btn-secondary btn-sm" data-act="pay" title="Ghi phiếu chi trả NCC này cho công trình ' + esc(g.ma) + '">Trả tiền</button>' : '') +
          '<button type="button" class="icon-btn" data-act="ledger" title="Sổ chi tiết công nợ của NCC' + (g.ma ? ' tại công trình này' : '') + '" aria-label="Sổ chi tiết ' + esc(r.ten) + '">' + icon('book') + '</button></div></td></tr>';
      });
    });
    return '<section class="sheet overflow-hidden"><div class="table-scroll scroll-x max-h-[calc(100vh-360px)] min-h-[200px] overflow-auto"><table class="ledger tree" id="cnct-table">' +
      // cùng bố cục cột với màn Công nợ NCC theo kỳ: Số dư đầu kỳ (Dư Nợ | Dư Có) · Trong kỳ (Phát sinh | Thanh toán) · Số dư cuối kỳ (Dư Nợ | Dư Có)
      '<thead><tr><th rowspan="2">Công trình / Nhà cung cấp</th><th colspan="2" class="num group">Số dư đầu kỳ</th><th colspan="2" class="num group">Trong kỳ</th><th colspan="2" class="num group">Số dư cuối kỳ</th>' +
      '<th rowspan="2">Tình trạng</th><th rowspan="2" class="no-print"><span class="sr-only">Thao tác</span></th></tr>' +
      '<tr><th class="num money sub2">Dư Nợ <span class="font-normal">(đã ứng trước)</span></th><th class="num money sub2">Dư Có <span class="font-normal">(còn phải trả)</span></th><th class="num money sub2">Phát sinh</th><th class="num money sub2">Thanh toán</th>' +
      '<th class="num money sub2">Dư Nợ <span class="font-normal">(đã ứng trước)</span></th><th class="num money sub2">Dư Có <span class="font-normal">(còn phải trả)</span></th></tr></thead>' +
      '<tbody>' + html + '</tbody><tfoot><tr><td>Tổng cộng · ' + gs.filter((g) => g.ma).length + ' công trình</td><td class="num money text-caution">' + money(tong.dauNo) + '</td><td class="num money">' + money(tong.dauCo) + '</td><td class="num money">' + money(tong.phatSinh) + '</td><td class="num money">' + money(tong.thanhToan) + '</td>' +
      '<td class="num money text-caution">' + money(tong.ungDu) + '</td><td class="num money"><span class="dbl">' + money(tong.conNo) + '</span></td>' +
      '<td colspan="2" class="whitespace-nowrap font-normal text-[12px] text-ink-3" title="Còn lại thuần = Dư Có − Dư Nợ, luôn bằng màn Công nợ NCC theo kỳ">Thuần (Có − Nợ) <b class="tabular-nums text-ink" id="cnct-thuan">' + coNoHtml(tong.cuoiKy) + '</b></td></tr></tfoot></table></div></section>';
  }

  // Bảng chéo: hàng = NCC, cột = công trình, ô = số dư cuối kỳ (dương còn nợ, âm ứng dư)
  function bangCheo(gs) {
    if (!gs.length) return '<section class="sheet p-8 text-center text-ink-3">Không có công nợ nào khớp bộ lọc.</section>';
    const ncc = new Map();
    gs.forEach((g, j) => g.rows.forEach((r) => {
      const k = KT.keyOf(r.ma);
      if (!ncc.has(k)) ncc.set(k, { ma: r.ma, ten: r.ten, o: new Array(gs.length).fill(0), tong: 0 });
      const x = ncc.get(k); x.o[j] += r.cuoiKy; x.tong += r.cuoiKy;
    }));
    const hang = Array.from(ncc.values()).sort((a, b) => b.tong - a.tong || a.ten.localeCompare(b.ten, 'vi'));
    const o = (n) => (n > 0 ? '<b class="tabular-nums">' + money(n) + '</b>' : n < 0 ? '<span class="tabular-nums text-caution" title="Đã ứng trước">(' + money(-n) + ')</span>' : dash);
    const cot = gs.map((g) => g.rows.reduce((t, r) => t + r.cuoiKy, 0));
    return '<section class="sheet overflow-hidden"><div class="table-scroll scroll-x max-h-[calc(100vh-360px)] min-h-[200px] overflow-auto"><table class="ledger" id="cnct-matrix">' +
      '<thead><tr><th class="sticky left-0 z-[3]">Nhà cung cấp</th>' + gs.map((g) => '<th class="num" title="' + esc(g.ma ? g.ma + ' – ' + g.ten : 'Chưa gán công trình') + '">' + esc(g.ma || 'Chưa gán') + '</th>').join('') + '<th class="num">Tổng</th></tr></thead><tbody>' +
      hang.map((h) => '<tr data-ma="' + esc(h.ma) + '"><td class="sticky left-0 z-[1] bg-sheet"><b class="code">' + esc(h.ten) + '</b><div class="sub">' + esc(h.ma) + '</div></td>' +
        h.o.map((n, j) => '<td class="num money' + (n ? ' clickable' : '') + '"' + (n ? ' data-act="ledger" data-ct="' + esc(gs[j].ma) + '" title="Sổ chi tiết ' + esc(h.ten) + ' tại ' + esc(gs[j].ma || 'các khoản chưa gán công trình') + '"' : '') + '>' + o(n) + '</td>').join('') +
        '<td class="num money">' + o(h.tong) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td class="sticky left-0 z-[1]">Tổng · ' + hang.length + ' NCC</td>' + cot.map((n) => '<td class="num money">' + o(n) + '</td>').join('') + '<td class="num money">' + o(cot.reduce((t, n) => t + n, 0)) + '</td></tr></tfoot></table></div></section>' +
      '<p class="text-[12px] text-ink-3">Ô là số dư cuối kỳ của NCC tại công trình: số đậm = còn phải trả, <span class="text-caution">(số trong ngoặc)</span> = đã ứng trước. Bấm một ô để mở sổ chi tiết.</p>';
  }

  const luu = () => { f.dong = Array.from(dong); saveFilter('cnCt'); };
  const veLai = () => { saveFilter('cnCt'); draw(); };
  bindPeriodControls(root, f, 'cnct', veLai);
  root.querySelectorAll('input[name=cnct-view]').forEach((x) => x.addEventListener('change', () => { f.view = x.value; veLai(); }));
  root.querySelectorAll('input[name=cnct-tt]').forEach((x) => x.addEventListener('change', () => { f.tt = x.value; veLai(); }));
  $('#cnct-q', root).addEventListener('input', debounce((e) => { f.q = e.target.value; veLai(); }, 150));

  const moSo = (ma, maCT) => { LS.set('sct.ncc', ma); datCongTrinh(maCT || '', true); location.hash = '#/so-chi-tiet-ncc'; };
  const batNhom = (k) => { if (dong.has(k)) dong.delete(k); else dong.add(k); luu(); draw(); };
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (a) {
      const act = a.dataset.act;
      if (act === 'mo-het') { dong.clear(); luu(); draw(); return; }
      if (act === 'dong-het') { groups.forEach((g) => dong.add(khoaNhom(g))); luu(); draw(); return; }
      if (act === 'dc-ledger') { moSo(a.closest('tr[data-dc-ncc]').dataset.dcNcc, ''); return; }
      const tr = a.closest('tr[data-ma]');
      if (!tr) return;
      const maCT = a.dataset.ct != null ? a.dataset.ct : tr.dataset.ct || '';
      if (act === 'ledger') moSo(tr.dataset.ma, maCT);
      else if (act === 'pay') {
        const g = groups.find((x) => x.ma === maCT);
        const r = g && g.rows.find((x) => x.ma === tr.dataset.ma);
        if (r) ghiPhieuChi(openEntryForm, r, maCT);
      }
      return;
    }
    const grp = e.target.closest('tr[data-nhom]');
    if (grp) batNhom(grp.dataset.nhom);
  });
  // mở / đóng khung đối chiếu: nhớ theo máy
  root.addEventListener('toggle', (e) => { if (e.target.id === 'cnct-doi-chieu') LS.set('cnct.dcMo', e.target.open); }, true);
  root.addEventListener('keydown', (e) => {
    const grp = e.target.closest('tr[data-nhom]');
    if (grp && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); batNhom(grp.dataset.nhom); }
  });
  draw();
}
