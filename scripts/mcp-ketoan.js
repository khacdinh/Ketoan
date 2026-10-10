#!/usr/bin/env node
'use strict';
/* Cổng MCP cho trợ lý AI (Claude Desktop): cho trợ lý TRA CỨU số liệu của phần mềm bằng câu hỏi tiếng Việt.
 *
 * - CHỈ ĐỌC: mở data/ketoan.db ở chế độ chỉ đọc, không ghi / sửa / xóa gì. Không đọc bảng đăng nhập, file đính kèm, nhật ký.
 * - Không cần mở phần mềm: đọc thẳng file dữ liệu (đọc lại khi file thay đổi). Thư mục dữ liệu: KETOAN_DATA, mặc định ../data.
 * - Mọi phép tính dùng chung public/js/shared.js nên số khớp các màn hình. Chỉ tính chứng từ đã ghi sổ (bỏ phiếu nháp).
 * - Giao thức MCP qua stdin/stdout (JSON-RPC 2.0, mỗi dòng một thông điệp). stdout chỉ dành cho giao thức: ghi log ra stderr.
 *
 * Cài vào Claude Desktop: chạy CaiTroLyAI.bat (xem HUONG_DAN_TRO_LY_AI.md). */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const KT = require('../public/js/shared.js');

const TEN = 'ke-toan-cong-trinh';
const PHIEN_BAN = '1.0.0';
const GIAO_THUC = ['2025-06-18', '2025-03-26', '2024-11-05'];
const DATA_DIR = path.resolve(process.env.KETOAN_DATA || path.join(__dirname, '..', 'data'));
const DB_FILE = path.join(DATA_DIR, 'ketoan.db');
const GIOI_HAN_MAC_DINH = 50;
const GIOI_HAN_TOI_DA = 500;

const log = (...a) => process.stderr.write('[mcp-ketoan] ' + a.join(' ') + '\n');

/* ---------- đọc dữ liệu (chỉ đọc, có bộ nhớ đệm theo thời điểm sửa file) ---------- */

let cache = null;
function duLieu() {
  let st;
  try { st = fs.statSync(DB_FILE); } catch (e) {
    throw new Error('Không thấy file dữ liệu ' + DB_FILE + '. Hãy mở phần mềm Kế Toán Công Trình ít nhất một lần, hoặc đặt KETOAN_DATA đúng thư mục data.');
  }
  const dau = st.mtimeMs + ':' + st.size;
  if (cache && cache.dau === dau) return cache;
  // nạp lười: máy không có node:sqlite vẫn trả lời được initialize / tools/list và báo lỗi rõ khi gọi công cụ
  const { readDbFile } = require('../lib/db.js');
  const goc = readDbFile(DB_FILE);
  const db = KT.activeDb(KT.postedDb(goc));
  cache = { dau, db, goc, ledger: null, costLedger: null, docLuc: new Date().toISOString() };
  return cache;
}
const soQuy = (c) => c.ledger || (c.ledger = KT.buildLedger(c.db));
// cảnh báo tính trên toàn bộ dữ liệu (kể cả phiếu nháp, như màn Cần xử lý)
const dsCanhBao = (c) => c.canhBao || (c.canhBao = KT.anomalies(c.goc).items.filter((x) => !x.ignored));
const soChiPhi = (c) => c.costLedger || (c.costLedger = KT.buildCostLedger(c.db));

/* ---------- tìm mã theo mã hoặc tên ---------- */

const LOAI_DM = {
  ct: { list: 'projects', ten: 'công trình', alias: 'da' },
  ncc: { list: 'suppliers', ten: 'nhà cung cấp', alias: 'ncc' },
  vt: { list: 'materials', ten: 'vật tư', alias: 'vt' },
  hm: { list: 'costItems', ten: 'hạng mục', alias: 'hm' },
  nhom: { list: 'costGroups', ten: 'nhóm chi phí' },
  nha: { list: 'houses', ten: 'nhà / khu', alias: 'nha' }
};
// nơi mã được dùng trong chứng từ (mã chưa có trong danh mục vẫn tra được)
const CHUNG_TU = {
  ct: [['costs', 'maCT'], ['entries', 'maDuAn'], ['soDuDauKy', 'maDuAn'], ['extPayments', 'maDuAn']],
  ncc: [['costs', 'maNCC'], ['entries', 'maNCC'], ['soDuDauKy', 'maNCC'], ['extPayments', 'maNCC']],
  vt: [['costs', 'maVT'], ['entries', 'maVT']],
  hm: [['costs', 'maHM']],
  nha: [['costs', 'maNha']]
};
const chuan = (s) => KT.normalizeText(s).replace(/\s+/g, ' ').trim();

class LoiNguoiDung extends Error {}

// Nhận mã hoặc tên (không dấu cũng được) → mã trong danh mục. Không thấy / nhiều kết quả → báo lỗi kèm gợi ý để trợ lý hỏi lại.
function timMa(db, loai, vao) {
  if (vao === undefined || vao === null || String(vao).trim() === '') return '';
  const s = String(vao).trim();
  if (s === '__none__') return s;
  const def = LOAI_DM[loai];
  const list = db[def.list] || [];
  const k = KT.keyOf(s);
  const dung = list.find((x) => KT.keyOf(x.ma) === k);
  if (dung) return dung.ma;
  if (def.alias) {
    const goc = KT.resolveAlias(db, def.alias, s);
    const sauGop = list.find((x) => KT.keyOf(x.ma) === KT.keyOf(goc));
    if (sauGop) return sauGop.ma;
  }
  const q = chuan(s);
  const trungTen = list.filter((x) => chuan(x.ten) === q);
  if (trungTen.length === 1) return trungTen[0].ma;
  const chua = list.filter((x) => chuan(x.ten + ' ' + x.ma).includes(q));
  if (chua.length === 1) return chua[0].ma;
  if (!chua.length) {
    // mã có trong chứng từ nhưng chưa có trong danh mục: vẫn lọc được. Không có ở đâu cả: báo lại, không trả số 0 gây hiểu nhầm
    if ((CHUNG_TU[loai] || []).some(([l, f]) => (db[l] || []).some((r) => KT.keyOf(r[f]) === k))) return s;
    throw new LoiNguoiDung('Không thấy ' + def.ten + ' “' + s + '” trong danh mục hay chứng từ. Dùng tim_danh_muc để tìm đúng tên / mã.');
  }
  throw new LoiNguoiDung('“' + s + '” khớp ' + chua.length + ' ' + def.ten + ': ' +
    chua.slice(0, 12).map((x) => x.ma + ' (' + x.ten + ')').join('; ') + (chua.length > 12 ? '; …' : '') + '. Hãy chọn đúng một mã.');
}

function tenCua(db, loai, ma) {
  if (!ma) return '';
  if (ma === '__none__') return loai === 'ct' ? 'Chưa gán công trình' : 'Không ghi';
  const x = (db[LOAI_DM[loai].list] || []).find((r) => KT.keyOf(r.ma) === KT.keyOf(ma));
  return x ? x.ten : '(chưa có trong danh mục)';
}

/* ---------- kiểm tra tham số ---------- */

function ngay(v, ten) {
  if (v === undefined || v === null || v === '') return '';
  const s = String(v).trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s; // tháng, mở rộng ở kyTuDen
  if (!KT.isISODate(s)) throw new LoiNguoiDung(ten + ' phải có dạng YYYY-MM-DD (ví dụ 2026-09-30), nhận được “' + s + '”.');
  return s;
}
function cuoiThang(ym) { const [y, m] = ym.split('-').map(Number); return ym + '-' + String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0'); }
function kyTuDen(a) {
  let tu = ngay(a.tu, 'tu');
  let den = ngay(a.den, 'den');
  if (/^\d{4}-\d{2}$/.test(tu)) tu += '-01';
  if (/^\d{4}-\d{2}$/.test(den)) den = cuoiThang(den);
  if (tu && den && tu > den) throw new LoiNguoiDung('Ngày “tu” (' + tu + ') sau ngày “den” (' + den + ').');
  return { from: tu, to: den };
}
function gioiHan(v) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0) return GIOI_HAN_MAC_DINH;
  return Math.min(n, GIOI_HAN_TOI_DA);
}
function cat(rows, n) {
  return { rows: rows.slice(0, n), tongSoDong: rows.length, conLai: Math.max(0, rows.length - n) };
}
function chon(v, ds, ten) {
  if (v === undefined || v === null || v === '') return '';
  if (!ds.includes(v)) throw new LoiNguoiDung(ten + ' chỉ nhận: ' + ds.join(', ') + '.');
  return v;
}
const kyMoTa = (f) => (f.from || f.to) ? KT.describeRange(f.from, f.to) : 'Toàn bộ số liệu';

/* ---------- công cụ ---------- */

const KY = {
  tu: { type: 'string', description: 'Từ ngày, YYYY-MM-DD (hoặc YYYY-MM = đầu tháng). Bỏ trống = từ đầu sổ.' },
  den: { type: 'string', description: 'Đến ngày, YYYY-MM-DD (hoặc YYYY-MM = cuối tháng). Bỏ trống = đến cuối sổ.' }
};
const CT = { type: 'string', description: 'Công trình: mã hoặc tên (không dấu cũng được). "__none__" = chứng từ chưa gán công trình.' };
const NCC = { type: 'string', description: 'Nhà cung cấp: mã hoặc tên (không dấu cũng được).' };
const GH = { type: 'integer', description: 'Số dòng tối đa trả về (mặc định 50, tối đa 500).' };
const CHIEU = ['ct', 'ncc', 'nhom', 'hm', 'vt', 'loai', 'thang', 'quy', 'nam'];
const MO_TA_CHIEU = 'ct = công trình, ncc = nhà cung cấp, nhom = nhóm chi phí, hm = hạng mục, vt = vật tư, loai = loại chi phí, thang / quy / nam';

const CONG_CU = [
  {
    name: 'tong_quan',
    description: 'Tổng quan nhanh: tồn quỹ hiện tại, thu / chi và chi phí công trình trong tháng, tổng còn phải trả nhà cung cấp, số cảnh báo cần xử lý, khoảng ngày có số liệu. Nên gọi đầu tiên khi chưa rõ số liệu có từ ngày nào.',
    inputSchema: { type: 'object', properties: { thang: { type: 'string', description: 'Tháng cần xem, YYYY-MM. Bỏ trống = tháng có chứng từ mới nhất.' } } },
    chay: tongQuan
  },
  {
    name: 'tim_danh_muc',
    description: 'Tìm mã và tên trong danh mục (công trình, nhà cung cấp, vật tư, hạng mục, nhóm chi phí, nhà / khu) theo một phần mã hoặc tên, không phân biệt dấu. Dùng khi người hỏi nói tên gần đúng.',
    inputSchema: {
      type: 'object',
      properties: {
        loai: { type: 'string', enum: ['tat-ca', 'ct', 'ncc', 'vt', 'hm', 'nhom', 'nha'], description: 'Danh mục cần tìm (mặc định tat-ca).' },
        tim: { type: 'string', description: 'Chữ cần tìm. Bỏ trống = liệt kê.' },
        gioi_han: GH
      }
    },
    chay: timDanhMuc
  },
  {
    name: 'cong_no_ncc',
    description: 'Công nợ nhà cung cấp trong kỳ, mỗi NCC một dòng: đầu kỳ, phát sinh (nhập hàng / chi phí), thanh toán, cuối kỳ. Cuối kỳ dương = còn phải trả (Dư Có), âm = đã ứng trước (Dư Nợ). Giống màn "Công nợ NCC theo kỳ".',
    inputSchema: {
      type: 'object',
      properties: Object.assign({}, KY, {
        ncc: NCC,
        cong_trinh: CT,
        tinh_trang: { type: 'string', enum: ['no', 'du', 'khac0'], description: 'no = còn phải trả, du = ứng dư, khac0 = còn số dư. Bỏ trống = mọi NCC có số liệu.' },
        gioi_han: GH
      })
    },
    chay: congNoNCC
  },
  {
    name: 'cong_no_theo_cong_trinh',
    description: 'Công nợ nhà cung cấp chia theo từng công trình (mỗi công trình: các NCC với đầu kỳ, phát sinh, thanh toán, cuối kỳ). Thanh toán / số dư không ghi công trình gom vào nhóm "Chưa gán công trình". Giống màn "Công nợ theo công trình".',
    inputSchema: {
      type: 'object',
      properties: Object.assign({}, KY, {
        cong_trinh: CT,
        ncc: NCC,
        tinh_trang: { type: 'string', enum: ['no', 'du', 'khac0'], description: 'Lọc NCC theo tình trạng cuối kỳ.' },
        gioi_han: { type: 'integer', description: 'Số NCC tối đa mỗi công trình (mặc định 50).' }
      })
    },
    chay: congNoTheoCT
  },
  {
    name: 'tuoi_no',
    description: 'Tuổi nợ nhà cung cấp tính đến một ngày: số còn phải trả chia theo 0–30, 31–60, 61–90, trên 90 ngày (tiền trả trừ vào khoản cũ nhất trước).',
    inputSchema: { type: 'object', properties: { den: { type: 'string', description: 'Tính đến ngày YYYY-MM-DD. Bỏ trống = hôm nay.' }, cong_trinh: CT, ncc: NCC, gioi_han: GH } },
    chay: tuoiNo
  },
  {
    name: 'so_chi_phi',
    description: 'Liệt kê các dòng chi phí công trình (phiếu nhập: vật tư, nhân công, dịch vụ) theo bộ lọc, kèm tổng tiền. Tìm phiếu theo số phiếu / diễn giải bằng tham số "tim".',
    inputSchema: {
      type: 'object',
      properties: Object.assign({}, KY, {
        cong_trinh: CT,
        ncc: NCC,
        vat_tu: { type: 'string', description: 'Vật tư: mã hoặc tên.' },
        hang_muc: { type: 'string', description: 'Hạng mục: mã hoặc tên.' },
        nhom: { type: 'string', description: 'Nhóm chi phí: mã hoặc tên.' },
        loai_cp: { type: 'string', enum: KT.LOAI_CP, description: 'Loại chi phí.' },
        tim: { type: 'string', description: 'Tìm trong số phiếu, diễn giải, tên vật tư, NCC… (không dấu cũng được).' },
        gioi_han: GH
      })
    },
    chay: soChiPhiTool
  },
  {
    name: 'tong_hop_chi_phi',
    description: 'Tổng hợp chi phí công trình theo một chiều (và tùy chọn chiều thứ hai thành cột): ' + MO_TA_CHIEU + '. Chỉ số: tổng tiền hoặc đơn giá bình quân. Giống màn "Phân tích".',
    inputSchema: {
      type: 'object',
      required: ['theo'],
      properties: Object.assign({}, KY, {
        theo: { type: 'string', enum: CHIEU, description: 'Chiều chính (hàng).' },
        cot: { type: 'string', enum: CHIEU, description: 'Chiều phụ (cột), tùy chọn.' },
        chi_so: { type: 'string', enum: ['tien', 'gia_tb'], description: 'tien = tổng thành tiền (mặc định), gia_tb = đơn giá bình quân (chỉ dòng có số lượng).' },
        cong_trinh: CT,
        ncc: NCC,
        vat_tu: { type: 'string', description: 'Vật tư: mã hoặc tên.' },
        hang_muc: { type: 'string', description: 'Hạng mục: mã hoặc tên.' },
        nhom: { type: 'string', description: 'Nhóm chi phí: mã hoặc tên.' },
        loai_cp: { type: 'string', enum: KT.LOAI_CP },
        gioi_han: { type: 'integer', description: 'Số hàng tối đa, phần còn lại gộp thành "Khác" (mặc định 30).' }
      })
    },
    chay: tongHopChiPhi
  },
  {
    name: 'so_quy',
    description: 'Sổ quỹ (sổ thu chi tiền mặt): các phiếu thu / chi theo bộ lọc, tồn đầu kỳ, tổng thu, tổng chi, tồn cuối kỳ. Tìm theo số phiếu / nội dung / người nhận bằng "tim".',
    inputSchema: {
      type: 'object',
      properties: Object.assign({}, KY, {
        cong_trinh: CT,
        ncc: NCC,
        loai: { type: 'string', enum: ['thu', 'chi'], description: 'Chỉ phiếu thu hoặc chỉ phiếu chi.' },
        tim: { type: 'string', description: 'Tìm trong số phiếu, nội dung, người nhận, ghi chú.' },
        gioi_han: GH
      })
    },
    chay: soQuyTool
  },
  {
    name: 'tong_hop_thu_chi',
    description: 'Tổng thu, tổng chi, chênh lệch của sổ quỹ gom theo tháng / quý / năm / công trình / nhà cung cấp.',
    inputSchema: {
      type: 'object',
      required: ['theo'],
      properties: Object.assign({}, KY, {
        theo: { type: 'string', enum: ['thang', 'quy', 'nam', 'ct', 'ncc'] },
        cong_trinh: CT,
        ncc: NCC,
        gioi_han: { type: 'integer', description: 'Số hàng tối đa (mặc định 50).' }
      })
    },
    chay: tongHopThuChi
  },
  {
    name: 'gia_vat_tu',
    description: 'Giá một vật tư: đơn giá gần nhất, thấp nhất, cao nhất, bình quân, so sánh giữa các nhà cung cấp, và lịch sử các lần mua gần đây.',
    inputSchema: {
      type: 'object',
      required: ['vat_tu'],
      properties: Object.assign({}, KY, { vat_tu: { type: 'string', description: 'Vật tư: mã hoặc tên.' }, ncc: NCC, cong_trinh: CT, gioi_han: { type: 'integer', description: 'Số lần mua gần nhất cần xem (mặc định 20).' } })
    },
    chay: giaVatTu
  },
  {
    name: 'canh_bao',
    description: 'Danh sách cảnh báo trong mục "Cần xử lý": nghi trùng, đơn giá lệch, ngày bất thường, thiếu mã, công nợ cần xem lại, sổ thu chi / chi phí cần xem lại… (bỏ các cảnh báo người dùng đã đánh dấu bỏ qua).',
    inputSchema: { type: 'object', properties: { loai: { type: 'string', enum: Object.keys(KT.ANOMALY_TYPES), description: 'Chỉ một nhóm cảnh báo.' }, gioi_han: GH } },
    chay: canhBao
  }
].map((t) => Object.assign(t, { annotations: { readOnlyHint: true, openWorldHint: false } }));

function tongQuan(a) {
  const c = duLieu();
  const db = c.db;
  const dau = KT.ngayDauSoLieu(db);
  const cuoi = KT.ngayCuoiSoLieu(db);
  let thang = a.thang ? String(a.thang).trim() : String(cuoi || KT.todayISO()).slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(thang)) throw new LoiNguoiDung('thang phải có dạng YYYY-MM.');
  const from = thang + '-01';
  const to = cuoiThang(thang);
  const led = soQuy(c);
  const quyThang = KT.filterLedger(led, { from, to });
  const cpThang = KT.filterCosts(soChiPhi(c), { from, to });
  const cn = KT.supplierPeriod(db, {}).total;
  const cb = dsCanhBao(c);
  return {
    soLieuTu: dau, soLieuDen: cuoi,
    tonQuyHienTai: led.length ? led[led.length - 1].ton : 0,
    thang: { thang, thu: quyThang.tongThu, chi: quyThang.tongChi, tonCuoiThang: quyThang.tonCuoiKy, chiPhiCongTrinh: cpThang.total, chiPhiTheoLoai: cpThang.byLoai },
    congNoNCC: { conPhaiTra: cn.conNo, daUngTruoc: cn.ungDu, thuan: cn.cuoiKy },
    soCongTrinh: (db.projects || []).length, soNCC: (db.suppliers || []).length, soVatTu: (db.materials || []).length,
    soCanhBao: cb.length,
    ghiChu: 'Đơn vị tiền: đồng. Chỉ tính chứng từ đã ghi sổ (không tính phiếu nháp).'
  };
}

function timDanhMuc(a) {
  const db = duLieu().db;
  const loai = chon(a.loai, ['tat-ca', 'ct', 'ncc', 'vt', 'hm', 'nhom', 'nha'], 'loai') || 'tat-ca';
  const q = chuan(a.tim || '');
  const n = gioiHan(a.gioi_han);
  const out = {};
  const nhom = new Map((db.costGroups || []).map((g) => [KT.keyOf(g.ma), g.ten]));
  const hm = new Map((db.costItems || []).map((h) => [KT.keyOf(h.ma), h]));
  (loai === 'tat-ca' ? Object.keys(LOAI_DM) : [loai]).forEach((l) => {
    const rows = (db[LOAI_DM[l].list] || []).filter((x) => !q || chuan(x.ma + ' ' + x.ten + ' ' + (x.ghiChu || '')).includes(q)).map((x) => {
      const r = { ma: x.ma, ten: x.ten };
      if (l === 'ct') { r.trangThai = x.trangThai || ''; if (x.nganSach) r.nganSach = x.nganSach; }
      if (l === 'ncc') { r.loai = x.loai || ''; r.sdt = x.sdt || ''; }
      if (l === 'vt') { r.dvt = x.dvt || ''; r.maHM = x.maHM || ''; const h = hm.get(KT.keyOf(x.maHM)); r.tenHM = h ? h.ten : ''; }
      if (l === 'hm') { r.maNhom = x.maNhom || ''; r.tenNhom = nhom.get(KT.keyOf(x.maNhom)) || ''; r.loaiCP = x.loaiCP || ''; }
      return r;
    });
    if (rows.length || loai !== 'tat-ca') out[LOAI_DM[l].ten] = cat(rows, n);
  });
  return out;
}

function nccRow(r) {
  return { ma: r.ma, ten: r.ten, dauKy: r.dauKy, phatSinh: r.phatSinh, thanhToan: r.thanhToan, cuoiKy: r.cuoiKy, tinhTrang: r.status === 'no' ? 'còn phải trả' : r.status === 'du' ? 'ứng dư' : 'hết nợ', giaoDichCuoi: r.last || '' };
}
function hopTT(tt) { return (r) => tt === 'no' ? r.cuoiKy > 0 : tt === 'du' ? r.cuoiKy < 0 : tt === 'khac0' ? r.cuoiKy !== 0 : r.coSoLieu; }

function congNoNCC(a) {
  const db = duLieu().db;
  const f = kyTuDen(a);
  const ncc = timMa(db, 'ncc', a.ncc);
  const ct = timMa(db, 'ct', a.cong_trinh);
  const tt = chon(a.tinh_trang, ['no', 'du', 'khac0'], 'tinh_trang');
  const res = KT.supplierPeriod(db, Object.assign({}, f, { ct: ct === '__none__' ? '' : ct, ncc: ncc ? [ncc] : undefined }));
  const rows = res.rows.filter(hopTT(tt)).sort((x, y) => y.cuoiKy - x.cuoiKy);
  const t = res.sumRows(rows);
  return {
    ky: kyMoTa(f), congTrinh: ct ? ct + ' — ' + tenCua(db, 'ct', ct) : 'Tất cả',
    tong: { dauKy: t.dauKy, phatSinh: t.phatSinh, thanhToan: t.thanhToan, cuoiKy: t.cuoiKy, conPhaiTra: t.conNo, daUngTruoc: t.ungDu },
    ncc: cat(rows.map(nccRow), gioiHan(a.gioi_han)),
    ghiChu: 'Đơn vị: đồng. Cuối kỳ = Đầu kỳ + Phát sinh − Thanh toán; dương = còn phải trả, âm = đã ứng trước.' + (ct === '__none__' ? ' Lọc "chưa gán công trình" không áp dụng ở đây: hãy dùng cong_no_theo_cong_trinh.' : '')
  };
}

function congNoTheoCT(a) {
  const db = duLieu().db;
  const f = kyTuDen(a);
  const ct = timMa(db, 'ct', a.cong_trinh);
  const ncc = timMa(db, 'ncc', a.ncc);
  const tt = chon(a.tinh_trang, ['no', 'du', 'khac0'], 'tinh_trang');
  const n = gioiHan(a.gioi_han);
  const res = KT.supplierDebtByProject(db, Object.assign({}, f, { ct: ct === '__none__' ? '' : ct, ncc: ncc ? [ncc] : undefined, tt }));
  const nhom = (g) => ({ ma: g.ma, ten: g.ten, conPhaiTra: g.tong.conNo, daUngTruoc: g.tong.ungDu, cuoiKyThuan: g.tong.cuoiKy, phatSinh: g.tong.phatSinh, thanhToan: g.tong.thanhToan, ncc: cat(g.rows.map(nccRow), n) });
  let groups = res.groups.map(nhom);
  const chuaGan = res.chuaGan ? nhom(res.chuaGan) : null;
  if (ct === '__none__') groups = [];
  return {
    ky: kyMoTa(f),
    tong: { conPhaiTra: res.total.conNo, daUngTruoc: res.total.ungDu, cuoiKyThuan: res.total.cuoiKy, soCongTrinhConNo: res.total.soCongTrinhNo },
    congTrinh: groups,
    chuaGanCongTrinh: ct && ct !== '__none__' ? undefined : chuaGan,
    ghiChu: 'Đơn vị: đồng. Tổng "còn phải trả" theo công trình có thể lớn hơn ở cong_no_ncc vì một NCC có thể còn nợ ở công trình này nhưng ứng dư ở công trình khác; số thuần luôn bằng nhau.'
  };
}

function tuoiNo(a) {
  const db = duLieu().db;
  const den = ngay(a.den, 'den');
  const ct = timMa(db, 'ct', a.cong_trinh);
  const ncc = timMa(db, 'ncc', a.ncc);
  const res = KT.tuoiNo(db, { to: /^\d{4}-\d{2}$/.test(den) ? cuoiThang(den) : den, ct: ct === '__none__' ? '' : ct, nccs: ncc ? [ncc] : undefined });
  const nhan = ['0-30 ngày', '31-60 ngày', '61-90 ngày', 'trên 90 ngày'];
  const theoNhom = (b) => Object.fromEntries(nhan.map((t, i) => [t, b[i]]));
  return {
    tinhDen: res.ngayTinh,
    tong: Object.assign({ tatCa: res.tongAll }, theoNhom(res.tong)),
    ncc: cat(res.rows.map((r) => Object.assign({ ma: r.ma, ten: r.ten, tong: r.tong, khoanCuNhat: r.cu, soNgayNoLauNhat: r.ngay }, theoNhom(r.b))), gioiHan(a.gioi_han)),
    ghiChu: 'Đơn vị: đồng. Tiền đã trả được trừ vào khoản nợ cũ nhất trước.'
  };
}

function locChiPhi(db, a) {
  const loai = chon(a.loai_cp, KT.LOAI_CP, 'loai_cp');
  return {
    ct: timMa(db, 'ct', a.cong_trinh), ncc: timMa(db, 'ncc', a.ncc), vt: timMa(db, 'vt', a.vat_tu),
    hm: timMa(db, 'hm', a.hang_muc), nhom: timMa(db, 'nhom', a.nhom), loai
  };
}

function soChiPhiTool(a) {
  const c = duLieu();
  const f = Object.assign(kyTuDen(a), locChiPhi(c.db, a), { q: a.tim || '' });
  const res = KT.filterCosts(soChiPhi(c), f);
  const rows = res.rows.slice().reverse().map((r) => ({
    ngay: r.ngay, soPhieu: r.soPhieu || '', congTrinh: r.maCT || '', nha: r.tenNha || r.maNha || '', ncc: r.tenNCC || r.maNCC || '',
    nhom: r.tenNhom, hangMuc: r.tenHM || r.maHM || '', vatTu: r.tenVT || r.maVT || '', dienGiai: r.dienGiai || '', loaiCP: r.loaiCP,
    soLuong: KT.isKhoan(r) ? null : r.soLuong, dvt: r.dvt, donGia: KT.isKhoan(r) ? null : r.donGia, thanhTien: r.thanhTien
  }));
  return {
    ky: kyMoTa(f), tongTien: res.total, theoLoai: res.byLoai, soLuongTheoDvt: f.vt ? res.slTheoDvt : undefined,
    dong: cat(rows, gioiHan(a.gioi_han)),
    ghiChu: 'Đơn vị: đồng. Dòng mới nhất trước. soLuong / donGia = null là dòng "theo khoản" (chỉ có thành tiền).'
  };
}

function tongHopChiPhi(a) {
  const db = duLieu().db;
  const hang = chon(a.theo, CHIEU, 'theo');
  if (!hang) throw new LoiNguoiDung('Cần tham số "theo".');
  const cot = chon(a.cot, CHIEU, 'cot');
  const giaTB = chon(a.chi_so, ['tien', 'gia_tb'], 'chi_so') === 'gia_tb';
  const loc = locChiPhi(db, a);
  const f = Object.assign(kyTuDen(a), { ct: loc.ct, ncc: loc.ncc, vt: loc.vt, hm: loc.hm, nhom: loc.nhom, loaiCP: loc.loai });
  const n = Math.min(gioiHan(a.gioi_han || 30), 100);
  const res = KT.phanTichChiPhi(db, Object.assign({}, f, { hang, cot: cot || '', chiSo: giaTB ? 'giaTB' : 'chiPhi', topHang: n, topCot: 12 }));
  const tenK = (h) => h.k === '__khac__' ? 'Khác (gộp các mục nhỏ)' : h.t;
  return {
    ky: kyMoTa(f), chiSo: giaTB ? 'đơn giá bình quân (đồng / đơn vị)' : 'thành tiền (đồng)', theo: KT.biChieu[hang][0], cot: cot ? KT.biChieu[cot][0] : undefined,
    tong: res.tong, soDong: res.soDong,
    hang: res.hang.map((h) => {
      const r = { ma: h.k === '__khac__' ? '' : h.k, ten: tenK(h), giaTri: h.tong };
      if (h.s) r.phu = h.s;
      if (cot) r.theoCot = Object.fromEntries(res.cot.map((c) => [c.k === '__khac__' ? 'Khác' : c.t, h.o[c.k]]));
      return r;
    })
  };
}

function soQuyTool(a) {
  const c = duLieu();
  const f = Object.assign(kyTuDen(a), { duAn: timMa(c.db, 'ct', a.cong_trinh), ncc: timMa(c.db, 'ncc', a.ncc), loai: chon(a.loai, ['thu', 'chi'], 'loai'), q: a.tim || '' });
  const res = KT.filterLedger(soQuy(c), f);
  const rows = res.rows.slice().reverse().map((r) => ({
    ngay: r.ngay, soPhieu: r.soPhieu || '', noiDung: r.noiDung || '', congTrinh: r.maDuAn || '', ncc: r.tenNCC || r.maNCC || '', vatTu: r.maVT || '',
    nguoiNhan: r.nguoiNhan || '', thu: r.thu || 0, chi: r.chi || 0, ton: r.ton
  }));
  return {
    ky: kyMoTa(f), tonDauKy: res.tonDauKy, tongThu: res.tongThu, tongChi: res.tongChi, tonCuoiKy: res.tonCuoiKy,
    phieu: cat(rows, gioiHan(a.gioi_han)),
    ghiChu: 'Đơn vị: đồng. Dòng mới nhất trước. Tồn đầu / cuối kỳ là tồn quỹ chung (không theo bộ lọc công trình / NCC); "ton" ở từng dòng là tồn quỹ chung sau dòng đó.'
  };
}

function tongHopThuChi(a) {
  const db = duLieu().db;
  const theo = chon(a.theo, ['thang', 'quy', 'nam', 'ct', 'ncc'], 'theo');
  if (!theo) throw new LoiNguoiDung('Cần tham số "theo".');
  const f = Object.assign(kyTuDen(a), { ct: timMa(db, 'ct', a.cong_trinh) });
  const ncc = timMa(db, 'ncc', a.ncc);
  if (f.ct === '__none__') throw new LoiNguoiDung('Dùng so_quy với cong_trinh = "__none__" để xem phiếu chưa gán công trình.');
  const g = { from: f.from, to: f.to, ct: f.ct, nccs: ncc ? [ncc] : undefined, hang: theo, topHang: 9999 };
  const thu = KT.phanTichThuChi(db, Object.assign({}, g, { chiSo: 'thu' }));
  const chi = KT.phanTichThuChi(db, Object.assign({}, g, { chiSo: 'chi' }));
  const map = new Map();
  thu.hang.forEach((h) => map.set(h.k, { ma: h.k, ten: h.t, thu: h.tt, chi: 0 }));
  chi.hang.forEach((h) => { const r = map.get(h.k) || { ma: h.k, ten: h.t, thu: 0, chi: 0 }; r.chi = h.tt; map.set(h.k, r); });
  let rows = Array.from(map.values()).map((r) => Object.assign(r, { chenhLech: r.thu - r.chi }));
  rows.sort(['thang', 'quy', 'nam'].includes(theo) ? (x, y) => String(x.ma).localeCompare(String(y.ma)) : (x, y) => (y.chi + y.thu) - (x.chi + x.thu));
  const tongThu = thu.tongTien;
  const tongChi = chi.tongTien;
  return { ky: kyMoTa(f), tongThu, tongChi, chenhLech: tongThu - tongChi, hang: cat(rows, gioiHan(a.gioi_han)), ghiChu: 'Đơn vị: đồng.' };
}

function giaVatTu(a) {
  const db = duLieu().db;
  const vt = timMa(db, 'vt', a.vat_tu);
  if (!vt) throw new LoiNguoiDung('Cần tham số "vat_tu".');
  const f = kyTuDen(a);
  const ncc = timMa(db, 'ncc', a.ncc);
  const ct = timMa(db, 'ct', a.cong_trinh);
  const m = (db.materials || []).find((x) => KT.keyOf(x.ma) === KT.keyOf(vt));
  const loc = (h) => KT.inRange(h.ngay, f.from, f.to) && (!ncc || KT.keyOf(h.maNCC) === KT.keyOf(ncc)) && (!ct || KT.keyOf(h.maCT) === KT.keyOf(ct));
  const ls = KT.priceHistory(db, vt).filter(loc);
  const theoNCC = new Map();
  ls.forEach((h) => {
    const k = KT.keyOf(h.maNCC);
    const x = theoNCC.get(k) || { ma: h.maNCC, ten: h.tenNCC || h.maNCC || 'Không ghi NCC', soLan: 0, tongSL: 0, tongTien: 0, min: Infinity, max: -Infinity, ganNhat: 0, ngayGanNhat: '' };
    x.soLan++; x.tongSL += Number(h.soLuong) || 0; x.tongTien += h.thanhTien || 0;
    x.min = Math.min(x.min, h.donGia); x.max = Math.max(x.max, h.donGia); x.ganNhat = h.donGia; x.ngayGanNhat = h.ngay;
    theoNCC.set(k, x);
  });
  const nccRows = Array.from(theoNCC.values()).map((x) => ({ ma: x.ma, ten: x.ten, soLan: x.soLan, giaGanNhat: x.ganNhat, ngayGanNhat: x.ngayGanNhat, giaThapNhat: x.min, giaCaoNhat: x.max, giaBinhQuan: x.tongSL ? Math.round(x.tongTien / x.tongSL) : null }))
    .sort((p, q) => (p.giaBinhQuan || 0) - (q.giaBinhQuan || 0));
  const tongSL = ls.reduce((t, h) => t + (Number(h.soLuong) || 0), 0);
  const tongTien = ls.reduce((t, h) => t + (h.thanhTien || 0), 0);
  const n = a.gioi_han ? gioiHan(a.gioi_han) : 20;
  return {
    vatTu: { ma: m ? m.ma : vt, ten: m ? m.ten : '(chưa có trong danh mục)', dvt: m ? (m.dvt || '') : '' }, ky: kyMoTa(f),
    soLanMua: ls.length,
    giaGanNhat: ls.length ? { donGia: ls[ls.length - 1].donGia, ngay: ls[ls.length - 1].ngay, ncc: ls[ls.length - 1].tenNCC || ls[ls.length - 1].maNCC } : null,
    giaThapNhat: ls.length ? Math.min(...ls.map((h) => h.donGia)) : null,
    giaCaoNhat: ls.length ? Math.max(...ls.map((h) => h.donGia)) : null,
    giaBinhQuan: tongSL ? Math.round(tongTien / tongSL) : null,
    theoNCC: nccRows,
    lichSu: cat(ls.slice().reverse().map((h) => ({ ngay: h.ngay, ncc: h.tenNCC || h.maNCC, congTrinh: h.maCT, soLuong: h.soLuong, donGia: h.donGia, thanhTien: h.thanhTien, soPhieu: h.soPhieu, chenhLechSoVoiLanTruocCungNCC: h.chenhLech })), n),
    ghiChu: 'Đơn vị: đồng. Không tính dòng "theo khoản" (không có đơn giá).'
  };
}

function canhBao(a) {
  const loai = chon(a.loai, Object.keys(KT.ANOMALY_TYPES), 'loai');
  const ds = dsCanhBao(duLieu()).filter((x) => !loai || x.loai === loai);
  const dem = {};
  ds.forEach((x) => { const t = KT.ANOMALY_TYPES[x.loai] || x.loai; dem[t] = (dem[t] || 0) + 1; });
  return {
    tong: ds.length, theoNhom: dem,
    canhBao: cat(ds.map((x) => ({ nhom: KT.ANOMALY_TYPES[x.loai] || x.loai, tieuDe: x.tieuDe, chiTiet: x.chiTiet || '', ngay: x.ngay || '', soTien: x.soTien })), gioiHan(a.gioi_han)),
    ghiChu: 'Xem và xử lý trong phần mềm: mục Kiểm soát → Cần xử lý.'
  };
}

/* ---------- giao thức MCP (JSON-RPC 2.0 qua stdio) ---------- */

const gui = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const traLoi = (id, result) => gui({ jsonrpc: '2.0', id, result });
const baoLoi = (id, code, message) => gui({ jsonrpc: '2.0', id, error: { code, message } });

const HUONG_DAN = 'Công cụ tra cứu (chỉ đọc) số liệu phần mềm kế toán "Kế Toán Công Trình": sổ quỹ thu chi, chi phí công trình, công nợ nhà cung cấp (NCC), giá vật tư, cảnh báo. ' +
  'Tiền tính bằng đồng (VND); khi trả lời hãy viết số có dấu chấm ngăn cách hàng nghìn (1.250.000 đ). Ngày dạng YYYY-MM-DD. ' +
  'Công trình / NCC / vật tư nhận mã hoặc tên; nếu công cụ báo khớp nhiều mục, hãy hỏi lại người dùng hoặc dùng tim_danh_muc. ' +
  'Chưa biết số liệu có từ ngày nào thì gọi tong_quan trước. Công nợ: cuối kỳ dương = còn phải trả (Dư Có), âm = đã ứng trước (Dư Nợ). ' +
  'Các công cụ này không sửa được dữ liệu; muốn ghi / sửa phiếu người dùng phải làm trong phần mềm.';

function xuLy(msg) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    if (msg && msg.id !== undefined) baoLoi(msg.id, -32600, 'Yêu cầu không hợp lệ');
    return;
  }
  const coId = msg.id !== undefined && msg.id !== null;
  const p = msg.params || {};
  switch (msg.method) {
    case 'initialize': {
      const ban = GIAO_THUC.includes(p.protocolVersion) ? p.protocolVersion : GIAO_THUC[0];
      return traLoi(msg.id, { protocolVersion: ban, capabilities: { tools: { listChanged: false } }, serverInfo: { name: TEN, title: 'Kế Toán Công Trình', version: PHIEN_BAN }, instructions: HUONG_DAN });
    }
    case 'ping': return coId && traLoi(msg.id, {});
    case 'tools/list':
      return traLoi(msg.id, { tools: CONG_CU.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations })) });
    case 'tools/call': {
      const t = CONG_CU.find((x) => x.name === p.name);
      if (!t) return baoLoi(msg.id, -32602, 'Không có công cụ ' + p.name);
      try {
        const kq = t.chay(p.arguments || {});
        return traLoi(msg.id, { content: [{ type: 'text', text: JSON.stringify(kq) }], structuredContent: kq, isError: false });
      } catch (e) {
        if (!(e instanceof LoiNguoiDung)) log('Lỗi khi chạy', p.name + ':', e && e.stack || e);
        return traLoi(msg.id, { content: [{ type: 'text', text: (e instanceof LoiNguoiDung ? '' : 'Lỗi: ') + (e && e.message || String(e)) }], isError: true });
      }
    }
    default:
      if (msg.method.startsWith('notifications/')) return undefined; // thông báo: không trả lời
      if (coId) baoLoi(msg.id, -32601, 'Không hỗ trợ ' + msg.method);
  }
  return undefined;
}

// node scripts/mcp-ketoan.js --kiem-tra : đọc thử dữ liệu, in tổng quan rồi thoát (dùng khi cài đặt)
function kiemTra() {
  try {
    const t = tongQuan({});
    process.stdout.write('OK: đọc được dữ liệu ' + DB_FILE + '\n' +
      '  Số liệu từ ' + KT.fmtDate(t.soLieuTu) + ' đến ' + KT.fmtDate(t.soLieuDen) + '\n' +
      '  Tồn quỹ: ' + KT.fmtMoney(t.tonQuyHienTai) + ' đ · Còn phải trả NCC: ' + KT.fmtMoney(t.congNoNCC.conPhaiTra) + ' đ\n');
    return 0;
  } catch (e) {
    process.stdout.write('LỖI: ' + (e && e.message || e) + '\n');
    return 1;
  }
}

if (require.main === module && process.argv.includes('--kiem-tra')) {
  process.exitCode = kiemTra();
} else if (require.main === module) {
  log('Sẵn sàng. Dữ liệu:', DB_FILE);
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch (e) { return baoLoi(null, -32700, 'JSON không hợp lệ'); }
    if (Array.isArray(msg)) msg.forEach(xuLy); else xuLy(msg);
    return undefined;
  });
  rl.on('close', () => process.exit(0));
}

module.exports = { CONG_CU, xuLy, timMa };
