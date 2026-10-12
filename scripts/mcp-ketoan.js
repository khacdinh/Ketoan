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
const PHIEN_BAN = '1.3.0'; // 1.1: link xem trên phần mềm; 1.2: lời nhắc đưa link nằm trong mô tả công cụ; 1.3: lập phiếu (xem trước → đồng ý → ghi)
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

/* ---------- đường link mở màn hình trên phần mềm (public/js/lienket.js) ---------- */

// Cổng phần mềm đang chạy: server.js ghi data/.dang-chay-cong.json khi mở, xóa khi tắt
function phanMem() {
  try {
    const x = JSON.parse(fs.readFileSync(path.join(DATA_DIR, '.dang-chay-cong.json'), 'utf8'));
    if (Number.isInteger(x.port) && conSong(x.pid)) return { port: x.port, dangChay: true };
  } catch (e) { /* chưa mở phần mềm */ }
  return { port: Number(process.env.PORT) || 3939, dangChay: false };
}
function conSong(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
// route + tham số (ct, ncc, tu, den, vt, hm, nhom, nha, loai, q, tt, bao-cao) → { url, luuY? }
function lienKet(route, p) {
  const q = Object.keys(p || {}).filter((k) => p[k]).map((k) => k + '=' + encodeURIComponent(p[k])).join('&');
  const pm = phanMem();
  // màn có bộ lọc luôn kèm "?" (kể cả rỗng) để link đặt lại bộ lọc cũ đang lưu trong trình duyệt
  const coLoc = !['tong-quan', 'kiem-soat'].includes(route);
  const out = { url: 'http://localhost:' + pm.port + '/#/' + route + (coLoc || q ? '?' + q : '') };
  if (!pm.dangChay) out.luuY = 'Phần mềm đang tắt: mở phần mềm (KhoiDong.bat) rồi mới bấm link.';
  return out;
}

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
  },
  {
    name: 'xem_truoc_phieu_thu_chi',
    coLink: false,
    ghi: false,
    description: 'BƯỚC 1 để lập phiếu thu / chi tiền (sổ quỹ). KHÔNG ghi gì. Kiểm tra dữ liệu, tìm đúng mã, đánh số phiếu, tính ảnh hưởng công nợ, cảnh báo trùng / bất thường, rồi trả bảng xem trước. ' +
      'Bắt buộc hiện NGUYÊN bảng xem trước (trường banXemTruoc) cho người dùng và hỏi "OK ghi phiếu không?". Chỉ gọi ghi_phieu khi người dùng trả lời đồng ý rõ ràng; sai / muốn sửa thì gọi lại công cụ này với nội dung đã sửa. ' +
      'Mỗi phiếu PHẢI nói rõ nhà cung cấp và công trình của TỪNG dòng, không được tự đoán hay lấy từ phiếu trước: thiếu thì hỏi người dùng. Mặc định lưu thành phiếu NHÁP (chưa tính vào sổ, người dùng bấm Ghi sổ trong phần mềm); chỉ dùng che_do "ghi_so" khi người dùng nói rõ muốn ghi sổ luôn.',
    inputSchema: {
      type: 'object',
      required: ['loai', 'ncc', 'dong'],
      properties: {
        loai: { type: 'string', enum: ['chi', 'thu'], description: 'chi = phiếu chi (trả tiền), thu = phiếu thu (nhận tiền).' },
        ngay: { type: 'string', description: 'Ngày phiếu YYYY-MM-DD. Bỏ trống = hôm nay.' },
        ncc: Object.assign({}, NCC, { description: 'Nhà cung cấp / đối tượng (bắt buộc): mã hoặc tên.' }),
        so_phieu: { type: 'string', description: 'Số phiếu. Bỏ trống = phần mềm tự đánh số theo trang Đánh số chứng từ.' },
        nguoi_nhan: { type: 'string', description: 'Người nhận / người nộp tiền (tùy chọn).' },
        ghi_chu: { type: 'string', description: 'Ghi chú (tùy chọn).' },
        che_do: { type: 'string', enum: ['nhap', 'ghi_so'], description: 'nhap (mặc định) = lưu nháp; ghi_so = ghi sổ luôn (chỉ khi người dùng yêu cầu).' },
        dong: {
          type: 'array', minItems: 1, maxItems: 50,
          description: 'Các dòng của phiếu, mỗi dòng một công trình.',
          items: {
            type: 'object', required: ['cong_trinh', 'noi_dung', 'so_tien'],
            properties: {
              cong_trinh: { type: 'string', description: 'Công trình của dòng (bắt buộc): mã hoặc tên. Khoản chung / văn phòng thì chọn công trình chung.' },
              noi_dung: { type: 'string', description: 'Nội dung dòng.' },
              so_tien: { type: 'integer', description: 'Số tiền (đồng), số nguyên dương.' },
              vat_tu: { type: 'string', description: 'Vật tư (tùy chọn): mã hoặc tên.' }
            }
          }
        }
      }
    },
    chay: xemTruocPhieuThuChi
  },
  {
    name: 'xem_truoc_phieu_nhap_chi_phi',
    coLink: false,
    ghi: false,
    description: 'BƯỚC 1 để lập phiếu nhập chi phí công trình (vật tư, nhân công, dịch vụ). KHÔNG ghi gì. Kiểm tra, tìm mã, tính thành tiền, so với giá lần mua trước, tính ảnh hưởng công nợ, rồi trả bảng xem trước. ' +
      'Bắt buộc hiện NGUYÊN bảng xem trước (banXemTruoc) cho người dùng và hỏi "OK ghi phiếu không?"; chỉ gọi ghi_phieu khi người dùng đồng ý rõ ràng. ' +
      'Nhà cung cấp và công trình của TỪNG dòng phải do người dùng nói rõ, không tự đoán hay lấy từ phiếu trước. Mỗi dòng cần vat_tu hoặc dien_giai, và (so_luong + don_gia) hoặc thanh_tien (hoặc so_luong + thanh_tien). Mặc định lưu NHÁP; chỉ dùng che_do "ghi_so" khi người dùng yêu cầu rõ.',
    inputSchema: {
      type: 'object',
      required: ['ncc', 'dong'],
      properties: {
        ngay: { type: 'string', description: 'Ngày phiếu YYYY-MM-DD. Bỏ trống = hôm nay.' },
        ncc: Object.assign({}, NCC, { description: 'Nhà cung cấp (bắt buộc): mã hoặc tên.' }),
        so_phieu: { type: 'string', description: 'Số phiếu / số phiếu giao hàng. Bỏ trống = phần mềm tự đánh số MH.' },
        che_do: { type: 'string', enum: ['nhap', 'ghi_so'], description: 'nhap (mặc định) = lưu nháp; ghi_so = ghi sổ luôn (chỉ khi người dùng yêu cầu).' },
        dong: {
          type: 'array', minItems: 1, maxItems: 50,
          items: {
            type: 'object', required: ['cong_trinh'],
            properties: {
              cong_trinh: { type: 'string', description: 'Công trình của dòng (bắt buộc).' },
              vat_tu: { type: 'string', description: 'Vật tư: mã hoặc tên.' },
              dien_giai: { type: 'string', description: 'Diễn giải (cần khi không có vat_tu).' },
              hang_muc: { type: 'string', description: 'Hạng mục (mã hoặc tên). BẮT BUỘC khi dòng không có vat_tu, hoặc vật tư chưa gắn hạng mục; có vật tư đã gắn hạng mục thì bỏ qua (lấy theo vật tư).' },
              so_luong: { type: 'number' },
              don_gia: { type: 'number', description: 'Đơn giá (đồng).' },
              thanh_tien: { type: 'number', description: 'Thành tiền (đồng). Chỉ nhập thành tiền = dòng theo khoản.' }
            }
          }
        }
      }
    },
    chay: xemTruocPhieuNhapChiPhi
  },
  {
    name: 'ghi_phieu',
    coLink: true,
    ghi: true,
    description: 'BƯỚC 2: ghi phiếu đã xem trước. CHỈ gọi sau khi người dùng đã xem bảng xem trước và trả lời đồng ý rõ ràng (ví dụ "OK", "ghi đi") trong cuộc trò chuyện; tuyệt đối không tự quyết định. ' +
      'Cần ma_xac_nhan từ công cụ xem_truoc_*; mã dùng một lần, hết hạn sau 15 phút, chỉ ghi đúng nội dung đã xem. Cần phần mềm đang chạy. Sau khi ghi, đưa link xem phiếu cho người dùng.',
    inputSchema: {
      type: 'object',
      required: ['ma_xac_nhan', 'nguoi_dung_da_dong_y'],
      properties: {
        ma_xac_nhan: { type: 'string', description: 'Mã xác nhận từ bước xem trước.' },
        nguoi_dung_da_dong_y: { type: 'boolean', description: 'Chỉ đặt true khi người dùng đã nói đồng ý ghi sau khi xem bảng xem trước.' }
      }
    },
    chay: ghiPhieu
  }
].map((t) => Object.assign(t, {
  // Nhiều ứng dụng không chuyển phần "instructions" của máy chủ cho Claude, nên lời nhắc đưa link nằm ngay trong mô tả từng công cụ
  description: t.description + (t.coLink === false ? '' : ' QUAN TRỌNG: kết quả có trường xemTrenPhanMem.url; cuối câu trả lời LUÔN đưa link dạng [Xem trên phần mềm](url), dùng nguyên văn url.'),
  annotations: t.ghi ? { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } : { readOnlyHint: true, openWorldHint: false }
}));

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
    phienBanCong: PHIEN_BAN,
    soLieuTu: dau, soLieuDen: cuoi,
    tonQuyHienTai: led.length ? led[led.length - 1].ton : 0,
    thang: { thang, thu: quyThang.tongThu, chi: quyThang.tongChi, tonCuoiThang: quyThang.tonCuoiKy, chiPhiCongTrinh: cpThang.total, chiPhiTheoLoai: cpThang.byLoai },
    congNoNCC: { conPhaiTra: cn.conNo, daUngTruoc: cn.ungDu, thuan: cn.cuoiKy },
    soCongTrinh: (db.projects || []).length, soNCC: (db.suppliers || []).length, soVatTu: (db.materials || []).length,
    soCanhBao: cb.length,
    xemTrenPhanMem: lienKet('tong-quan'),
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
    xemTrenPhanMem: lienKet(ncc ? 'so-chi-tiet-ncc' : 'cp-cong-no', { ct, ncc, tu: f.from, den: f.to, tt: ['no', 'du'].includes(tt) ? tt : '' }),
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
    xemTrenPhanMem: lienKet('cong-no-ct', { ct: ct === '__none__' ? '' : ct, ncc, tu: f.from, den: f.to, tt }),
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
    xemTrenPhanMem: lienKet('phan-tich', { 'bao-cao': 'tuoi-no', den: res.ngayTinh, ct, ncc }),
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

const lienKetSoChiPhi = (f) => lienKet('cp-so', { ct: f.ct, ncc: f.ncc, vt: f.vt, hm: f.hm, nhom: f.nhom, loai: f.loai || f.loaiCP, q: f.q, tu: f.from, den: f.to });

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
    xemTrenPhanMem: lienKetSoChiPhi(f),
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
    }),
    xemTrenPhanMem: lienKetSoChiPhi(f)
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
    xemTrenPhanMem: lienKet('so-thu-chi', { ct: f.duAn, ncc: f.ncc, loai: f.loai, q: f.q, tu: f.from, den: f.to }),
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
  return { ky: kyMoTa(f), tongThu, tongChi, chenhLech: tongThu - tongChi, hang: cat(rows, gioiHan(a.gioi_han)),
    xemTrenPhanMem: lienKet('so-thu-chi', { ct: f.ct, ncc, tu: f.from, den: f.to }), ghiChu: 'Đơn vị: đồng.' };
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
    xemTrenPhanMem: lienKet('cp-gia', { vt: m ? m.ma : vt, ncc }),
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
    xemTrenPhanMem: lienKet('kiem-soat'),
    ghiChu: 'Xem và xử lý trong phần mềm: mục Kiểm soát → Cần xử lý.'
  };
}

/* ---------- lập phiếu: xem trước → người dùng đồng ý → ghi (qua phần mềm đang chạy) ---------- */

const cho = new Map(); // ma_xac_nhan → { loai, payload, hetHan }
const HAN_XAC_NHAN = 15 * 60 * 1000;
const money = (n) => KT.fmtMoney(n) + ' đ';
const homNay = () => KT.todayISO();

function soTien(v, ten) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || Math.round(n) !== n) throw new LoiNguoiDung(ten + ' phải là số nguyên dương (đồng), nhận được “' + v + '”.');
  if (n > 1e13) throw new LoiNguoiDung(ten + ' quá lớn.');
  return n;
}
function ngayPhieu(v) {
  const d = v ? String(v).trim() : homNay();
  if (!KT.isISODate(d)) throw new LoiNguoiDung('ngay phải có dạng YYYY-MM-DD (ví dụ 2026-10-12), nhận được “' + v + '”.');
  return d;
}
function kiemTraKhoa(db, ngayP) {
  if (KT.isLockedDate(db, ngayP)) throw new LoiNguoiDung(KT.lockMessage(KT.monthOf(ngayP), 'ghi phiếu'));
}
function canhBaoNgay(ngayP, ds) {
  const t = homNay();
  if (ngayP > t) ds.push('Ngày phiếu ' + KT.fmtDate(ngayP) + ' ở TƯƠNG LAI (hôm nay ' + KT.fmtDate(t) + ').');
  else if (ngayP < new Date(Date.parse(t) - 60 * 864e5).toISOString().slice(0, 10)) ds.push('Ngày phiếu ' + KT.fmtDate(ngayP) + ' đã cũ hơn 60 ngày.');
}
// NCC chưa có chi phí / số dư / trả ngoài quỹ ở công trình này (như cảnh báo ở form Ghi thu / chi)
function nccChuaCoOCongTrinh(db, ncc, ct) {
  const k = KT.keyOf(ncc);
  const c = KT.keyOf(ct);
  const cap = (x, f) => KT.keyOf(x.maNCC) === k && KT.keyOf(x[f]) === c;
  return !((db.costs || []).some((x) => cap(x, 'maCT')) || (db.soDuDauKy || []).some((x) => cap(x, 'maDuAn')) || (db.extPayments || []).some((x) => cap(x, 'maDuAn')));
}
function taoMaXacNhan(loai, payload) {
  const now = Date.now();
  cho.forEach((v, k) => { if (v.hetHan < now) cho.delete(k); });
  const ma = require('crypto').randomBytes(4).toString('hex').toUpperCase();
  cho.set(ma, { loai, payload, hetHan: now + HAN_XAC_NHAN });
  return ma;
}
const bang = (cot, dong) => '| ' + cot.join(' | ') + ' |\n|' + cot.map(() => '---').join('|') + '|\n' + dong.map((r) => '| ' + r.join(' | ') + ' |').join('\n');
const cheDoNhan = (cd) => (cd === 'ghi_so' ? 'GHI SỔ NGAY (tính vào sổ quỹ / chi phí / công nợ)' : 'LƯU NHÁP (chưa tính vào sổ; bạn mở phần mềm bấm Ghi sổ sau khi kiểm tra)');

function xemTruocPhieuThuChi(a) {
  const c = duLieu();
  const db = c.db;
  const loai = chon(a.loai, ['chi', 'thu'], 'loai');
  if (!loai) throw new LoiNguoiDung('Cần loai = chi hoặc thu.');
  const cheDo = chon(a.che_do, ['nhap', 'ghi_so'], 'che_do') || 'nhap';
  const ngayP = ngayPhieu(a.ngay);
  kiemTraKhoa(db, ngayP);
  if (!a.ncc || !String(a.ncc).trim()) throw new LoiNguoiDung('Thiếu nhà cung cấp: hỏi người dùng phiếu này của nhà cung cấp / đối tượng nào.');
  const ncc = timMa(db, 'ncc', a.ncc);
  if (ncc === '__none__' || !(db.suppliers || []).some((x) => KT.keyOf(x.ma) === KT.keyOf(ncc))) throw new LoiNguoiDung('Nhà cung cấp “' + a.ncc + '” chưa có trong danh mục. Dùng tim_danh_muc hoặc tạo trong phần mềm trước.');
  const dong = Array.isArray(a.dong) ? a.dong : [];
  if (!dong.length) throw new LoiNguoiDung('Phiếu cần ít nhất một dòng.');
  if (dong.length > 50) throw new LoiNguoiDung('Một phiếu tối đa 50 dòng.');
  const canhBao = [];
  canhBaoNgay(ngayP, canhBao);
  const rows = dong.map((d, i) => {
    const at = 'Dòng ' + (i + 1) + ': ';
    try {
      if (!d || !String(d.cong_trinh || '').trim()) throw new LoiNguoiDung('thiếu công trình: hỏi người dùng dòng này thuộc công trình nào (không tự đoán).');
      const ct = timMa(db, 'ct', d.cong_trinh);
      if (ct === '__none__' || !(db.projects || []).some((x) => KT.keyOf(x.ma) === KT.keyOf(ct))) throw new LoiNguoiDung('công trình “' + d.cong_trinh + '” chưa có trong danh mục.');
      const nd = String(d.noi_dung || '').trim();
      if (!nd) throw new LoiNguoiDung('thiếu nội dung.');
      const tien = soTien(d.so_tien, 'so_tien');
      const vt = d.vat_tu ? timMa(db, 'vt', d.vat_tu) : '';
      return { ct, nd, tien, vt };
    } catch (e) { if (e instanceof LoiNguoiDung) throw new LoiNguoiDung(at + e.message); throw e; }
  });
  const tong = rows.reduce((t, r) => t + r.tien, 0);
  const soPhieu = a.so_phieu && String(a.so_phieu).trim() ? String(a.so_phieu).trim() : '';
  const soDuKien = soPhieu || KT.soChungTuTiep(db, loai === 'thu' ? 'thu' : 'chi', ngayP, ncc).soPhieu;
  if (soPhieu) {
    const trungSo = (c.goc.entries || []).some((e) => KT.keyOf(e.soPhieu) === KT.keyOf(soPhieu));
    if (trungSo) canhBao.push('Số phiếu ' + soPhieu + ' ĐÃ CÓ trong sổ. Bỏ trống so_phieu để phần mềm tự đánh số, hoặc kiểm tra xem có nhập trùng không.');
  }
  // trùng: cùng ngày + NCC + số tiền (kể cả phiếu nháp)
  rows.forEach((r, i) => {
    const t = (c.goc.entries || []).filter((e) => e.ngay === ngayP && KT.keyOf(e.maNCC) === KT.keyOf(ncc) && ((loai === 'chi' ? e.chi : e.thu) || 0) === r.tien);
    if (t.length) canhBao.push('Dòng ' + (i + 1) + ': đã có ' + t.length + ' phiếu CÙNG ngày, NCC và số tiền ' + money(r.tien) + ' (' + t.map((e) => (e.soPhieu || 'không số') + (KT.isDraft(e) ? ' nháp' : '')).join(', ') + '). Nghi nhập trùng.');
    if (loai === 'chi' && nccChuaCoOCongTrinh(db, ncc, r.ct)) canhBao.push('Dòng ' + (i + 1) + ': ' + tenCua(db, 'ncc', ncc) + ' CHƯA có chi phí / số dư nào ở công trình ' + r.ct + '. Khoản chi có thể thành ứng trước hoặc chọn nhầm công trình.');
  });
  // ảnh hưởng công nợ NCC theo từng công trình (chỉ có nghĩa khi ghi sổ)
  const theoCT = new Map();
  rows.forEach((r) => theoCT.set(r.ct, (theoCT.get(r.ct) || 0) + r.tien));
  const congNo = Array.from(theoCT.entries()).map(([ct, t]) => {
    const truoc = ((KT.debtOf(db, ncc, ct) || {}).conLai) || 0;
    const sau = truoc + (loai === 'chi' ? -t : t);
    return { congTrinh: ct, truoc, sau };
  });
  const payload = {
    kieu: 'thu-chi', cheDo, loai, ngay: ngayP, ncc, soPhieu, nguoiNhan: String(a.nguoi_nhan || '').trim(), ghiChu: String(a.ghi_chu || '').trim(),
    rows: rows.map((r) => ({ maDuAn: r.ct, noiDung: r.nd, soTien: r.tien, maVT: r.vt }))
  };
  const ma = taoMaXacNhan('thu-chi', payload);
  const banXemTruoc = '**PHIẾU ' + (loai === 'chi' ? 'CHI' : 'THU') + ' — ' + soDuKien + (soPhieu ? '' : ' (số tự đánh, có thể đổi nếu có phiếu khác được ghi trước)') + '**\n' +
    'Ngày: ' + KT.fmtDate(ngayP) + ' · ' + (loai === 'chi' ? 'Trả' : 'Nhận từ') + ': **' + tenCua(db, 'ncc', ncc) + '** (' + ncc + ')' + (payload.nguoiNhan ? ' · Người nhận: ' + payload.nguoiNhan : '') + '\n\n' +
    bang(['#', 'Công trình', 'Nội dung', 'Vật tư', 'Số tiền'], rows.map((r, i) => [i + 1, r.ct + ' – ' + tenCua(db, 'ct', r.ct), r.nd, r.vt || '', money(r.tien)])) + '\n\n' +
    '**Tổng: ' + money(tong) + '**\n\n' +
    'Công nợ ' + tenCua(db, 'ncc', ncc) + ' theo công trình' + (cheDo === 'ghi_so' ? '' : ' (nếu sau này ghi sổ)') + ' — dương = còn phải trả:\n' +
    bang(['Công trình', 'Trước', 'Sau'], congNo.map((x) => [x.congTrinh, money(x.truoc), money(x.sau)])) + '\n\n' +
    'Khi bạn đồng ý, mình sẽ: **' + cheDoNhan(cheDo) + '**.' + (canhBao.length ? '\n\n⚠️ Cảnh báo:\n' + canhBao.map((x) => '- ' + x).join('\n') : '');
  return {
    chuaGhi: true, maXacNhan: ma, hetHanSau: '15 phút', cheDo, soPhieuDuKien: soDuKien, tongTien: tong, canhBao, banXemTruoc,
    nhacTraLoi: 'Hiện NGUYÊN trường banXemTruoc cho người dùng (cả cảnh báo), hỏi "OK ghi phiếu không?". CHƯA ghi gì. Chỉ gọi ghi_phieu(ma_xac_nhan, nguoi_dung_da_dong_y=true) sau khi người dùng đồng ý rõ ràng; nếu họ muốn sửa thì gọi lại công cụ xem trước.'
  };
}

function xemTruocPhieuNhapChiPhi(a) {
  const c = duLieu();
  const db = c.db;
  const cheDo = chon(a.che_do, ['nhap', 'ghi_so'], 'che_do') || 'nhap';
  const ngayP = ngayPhieu(a.ngay);
  kiemTraKhoa(db, ngayP);
  if (!a.ncc || !String(a.ncc).trim()) throw new LoiNguoiDung('Thiếu nhà cung cấp: hỏi người dùng phiếu này của nhà cung cấp nào.');
  const ncc = timMa(db, 'ncc', a.ncc);
  if (ncc === '__none__' || !(db.suppliers || []).some((x) => KT.keyOf(x.ma) === KT.keyOf(ncc))) throw new LoiNguoiDung('Nhà cung cấp “' + a.ncc + '” chưa có trong danh mục.');
  const dong = Array.isArray(a.dong) ? a.dong : [];
  if (!dong.length) throw new LoiNguoiDung('Phiếu cần ít nhất một dòng.');
  if (dong.length > 50) throw new LoiNguoiDung('Một phiếu tối đa 50 dòng.');
  const canhBao = [];
  canhBaoNgay(ngayP, canhBao);
  const soPhieu = a.so_phieu && String(a.so_phieu).trim() ? String(a.so_phieu).trim() : '';
  const soDuKien = soPhieu || KT.soChungTuTiep(db, 'mh', ngayP).soPhieu;
  const mat = new Map((db.materials || []).map((m) => [KT.keyOf(m.ma), m]));
  const rows = dong.map((d, i) => {
    const at = 'Dòng ' + (i + 1) + ': ';
    try {
      if (!d || !String(d.cong_trinh || '').trim()) throw new LoiNguoiDung('thiếu công trình: hỏi người dùng dòng này thuộc công trình nào (không tự đoán).');
      const ct = timMa(db, 'ct', d.cong_trinh);
      if (ct === '__none__' || !(db.projects || []).some((x) => KT.keyOf(x.ma) === KT.keyOf(ct))) throw new LoiNguoiDung('công trình “' + d.cong_trinh + '” chưa có trong danh mục.');
      const vt = d.vat_tu ? timMa(db, 'vt', d.vat_tu) : '';
      const m = vt ? mat.get(KT.keyOf(vt)) : null;
      if (vt && !m) throw new LoiNguoiDung('vật tư “' + d.vat_tu + '” chưa có trong danh mục.');
      const dg = String(d.dien_giai || '').trim();
      if (!vt && !dg) throw new LoiNguoiDung('cần vat_tu hoặc dien_giai.');
      const num = (v, ten) => { if (v === undefined || v === null || v === '') return null; const n = Number(v); if (!Number.isFinite(n) || n < 0) throw new LoiNguoiDung(ten + ' không hợp lệ.'); return n; };
      const r = KT.costFromInput(num(d.so_luong, 'so_luong'), num(d.don_gia, 'don_gia'), num(d.thanh_tien, 'thanh_tien'));
      if (r.loi) throw new LoiNguoiDung(r.loi + '.');
      if (!(r.thanhTien > 0)) throw new LoiNguoiDung('thành tiền phải lớn hơn 0.');
      let hm = m && m.maHM ? m.maHM : '';
      if (!hm) {
        if (!d.hang_muc || !String(d.hang_muc).trim()) throw new LoiNguoiDung(vt ? 'vật tư ' + vt + ' chưa gắn hạng mục trong danh mục: cần hang_muc (hỏi người dùng).' : 'dòng không có vật tư: cần hang_muc (hỏi người dùng khoản này thuộc hạng mục nào).');
        hm = timMa(db, 'hm', d.hang_muc);
        if (!(db.costItems || []).some((x) => KT.keyOf(x.ma) === KT.keyOf(hm))) throw new LoiNguoiDung('hạng mục “' + d.hang_muc + '” chưa có trong danh mục.');
      }
      if (m && r.donGia) {
        const lp = KT.lastPrice(db, m.ma, ncc);
        if (lp && lp.donGia > 0) {
          const lech = (r.donGia - lp.donGia) / lp.donGia;
          if (Math.abs(lech) >= 0.3) canhBao.push(at + 'đơn giá ' + money(r.donGia) + ' lệch ' + Math.round(lech * 100) + '% so với lần mua gần nhất ' + money(lp.donGia) + ' (' + KT.fmtDate(lp.ngay) + (lp.cungNCC ? ', cùng NCC' : ', NCC ' + lp.maNCC) + ').');
        }
      }
      return { ct, vt, dg, sl: r.soLuong, dgia: r.donGia, tt: r.thanhTien, ten: m ? m.ten : '', dvt: m ? m.dvt || '' : '', hm, hmGhi: m && m.maHM ? '' : hm };
    } catch (e) { if (e instanceof LoiNguoiDung) throw new LoiNguoiDung(at + e.message); throw e; }
  });
  const tong = rows.reduce((t, r) => t + r.tt, 0);
  if (soPhieu && (c.goc.costs || []).some((x) => KT.keyOf(x.soPhieu) === KT.keyOf(soPhieu) && KT.keyOf(x.maNCC) === KT.keyOf(ncc))) canhBao.push('Số phiếu ' + soPhieu + ' của NCC này ĐÃ CÓ trong sổ chi phí. Nghi nhập trùng.');
  rows.forEach((r, i) => {
    const t = (c.goc.costs || []).filter((x) => x.ngay === ngayP && KT.keyOf(x.maNCC) === KT.keyOf(ncc) && x.thanhTien === r.tt && (KT.keyOf(x.maVT) || '') === KT.keyOf(r.vt));
    if (t.length) canhBao.push('Dòng ' + (i + 1) + ': đã có ' + t.length + ' dòng chi phí CÙNG ngày, NCC, vật tư và thành tiền ' + money(r.tt) + '. Nghi nhập trùng.');
  });
  const theoCT = new Map();
  rows.forEach((r) => theoCT.set(r.ct, (theoCT.get(r.ct) || 0) + r.tt));
  const congNo = Array.from(theoCT.entries()).map(([ct, t]) => {
    const truoc = ((KT.debtOf(db, ncc, ct) || {}).conLai) || 0;
    return { congTrinh: ct, truoc, sau: truoc + t };
  });
  const payload = {
    kieu: 'nhap-chi-phi', cheDo, ngay: ngayP, ncc, soPhieu,
    rows: rows.map((r) => ({ maCT: r.ct, maVT: r.vt, dienGiai: r.dg, maHM: r.hmGhi, soLuong: r.sl, donGia: r.dgia, thanhTien: r.tt }))
  };
  const ma = taoMaXacNhan('nhap-chi-phi', payload);
  const banXemTruoc = '**PHIẾU NHẬP CHI PHÍ — ' + soDuKien + (soPhieu ? '' : ' (số tự đánh, có thể đổi nếu có phiếu khác được ghi trước)') + '**\n' +
    'Ngày: ' + KT.fmtDate(ngayP) + ' · Nhà cung cấp: **' + tenCua(db, 'ncc', ncc) + '** (' + ncc + ')\n\n' +
    bang(['#', 'Công trình', 'Vật tư / diễn giải', 'Hạng mục', 'SL', 'Đơn giá', 'Thành tiền'], rows.map((r, i) => [i + 1, r.ct + ' – ' + tenCua(db, 'ct', r.ct), (r.vt ? r.vt + ' ' + r.ten : r.dg) + (r.vt && r.dg ? ' · ' + r.dg : ''), r.hm + ' ' + (((db.costItems || []).find((x) => KT.keyOf(x.ma) === KT.keyOf(r.hm)) || {}).ten || ''), r.sl == null ? 'theo khoản' : r.sl + (r.dvt ? ' ' + r.dvt : ''), r.dgia == null ? '' : money(r.dgia), money(r.tt)])) + '\n\n' +
    '**Tổng: ' + money(tong) + '**\n\n' +
    'Công nợ ' + tenCua(db, 'ncc', ncc) + ' theo công trình' + (cheDo === 'ghi_so' ? '' : ' (nếu sau này ghi sổ)') + ' — dương = còn phải trả:\n' +
    bang(['Công trình', 'Trước', 'Sau'], congNo.map((x) => [x.congTrinh, money(x.truoc), money(x.sau)])) + '\n\n' +
    'Khi bạn đồng ý, mình sẽ: **' + cheDoNhan(cheDo) + '**.' + (canhBao.length ? '\n\n⚠️ Cảnh báo:\n' + canhBao.map((x) => '- ' + x).join('\n') : '');
  return {
    chuaGhi: true, maXacNhan: ma, hetHanSau: '15 phút', cheDo, soPhieuDuKien: soDuKien, tongTien: tong, canhBao, banXemTruoc,
    nhacTraLoi: 'Hiện NGUYÊN trường banXemTruoc cho người dùng (cả cảnh báo), hỏi "OK ghi phiếu không?". CHƯA ghi gì. Chỉ gọi ghi_phieu(ma_xac_nhan, nguoi_dung_da_dong_y=true) sau khi người dùng đồng ý rõ ràng; nếu họ muốn sửa thì gọi lại công cụ xem trước.'
  };
}

// Gọi API của phần mềm đang chạy (giữ nguyên khóa sổ, nhật ký, kiểm tra dữ liệu). Cổng MCP không bao giờ ghi thẳng vào file dữ liệu.
async function goiPhanMem(pm, duongDan, body) {
  let res;
  try {
    res = await fetch('http://127.0.0.1:' + pm.port + duongDan, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch (e) {
    throw new LoiNguoiDung('Không kết nối được phần mềm Kế Toán Công Trình (cổng ' + pm.port + '). Mở phần mềm (KhoiDong.bat) rồi gọi lại ghi_phieu: mã xác nhận vẫn dùng được trong 15 phút.');
  }
  let j = null;
  try { j = await res.json(); } catch (e) { /* không phải JSON */ }
  if (res.status === 401 || res.status === 403) throw new LoiNguoiDung('Phần mềm đang bật đăng nhập nên trợ lý chưa ghi được phiếu (chỉ xem được). Hãy nhập phiếu trong phần mềm.');
  if (!res.ok || !j || j.ok === false) throw new LoiNguoiDung('Phần mềm từ chối ghi phiếu: ' + ((j && j.error) || ('lỗi ' + res.status)) + '. Chưa ghi gì.');
  return j;
}

async function ghiPhieu(a) {
  const ma = String(a.ma_xac_nhan || '').trim().toUpperCase();
  const x = cho.get(ma);
  if (!x || x.hetHan < Date.now()) { cho.delete(ma); throw new LoiNguoiDung('Mã xác nhận không có hoặc đã hết hạn (15 phút). Gọi lại công cụ xem trước để tạo bản xem trước mới và cho người dùng xem lại.'); }
  if (a.nguoi_dung_da_dong_y !== true) throw new LoiNguoiDung('Chưa ghi: cần nguoi_dung_da_dong_y = true, chỉ khi người dùng đã xem bảng xem trước và đồng ý rõ ràng.');
  const pm = phanMem();
  if (!pm.dangChay) throw new LoiNguoiDung('Phần mềm đang tắt. Mở phần mềm (KhoiDong.bat) rồi gọi lại ghi_phieu: mã xác nhận vẫn dùng được trong 15 phút. Chưa ghi gì.');
  cho.delete(ma); // dùng một lần: gọi lại bằng cùng mã sẽ bị từ chối (tránh ghi đôi)
  const p = x.payload;
  const nhap = p.cheDo !== 'ghi_so';
  const c = duLieu();
  try {
    if (p.kieu === 'thu-chi') {
      // đánh số tại thời điểm ghi (lấy số mới nhất, tránh trùng nếu có phiếu khác được ghi từ lúc xem trước)
      const soPhieu = p.soPhieu || KT.soChungTuTiep(c.db, p.loai === 'thu' ? 'thu' : 'chi', p.ngay, p.ncc).soPhieu;
      const rows = p.rows.map((r) => Object.assign({
        ngay: p.ngay, soPhieu, maDuAn: r.maDuAn, maNCC: p.ncc, noiDung: r.noiDung, thu: p.loai === 'thu' ? r.soTien : 0, chi: p.loai === 'chi' ? r.soTien : 0,
        nguoiNhan: p.nguoiNhan, ghiChu: p.ghiChu
      }, r.maVT ? { maVT: r.maVT } : {}, nhap ? { trangThai: 'nhap' } : {}));
      const j = await goiPhanMem(pm, '/api/entries/phieu', { rows });
      const tong = p.rows.reduce((t, r) => t + r.soTien, 0);
      cache = null;
      return {
        daGhi: true, loai: 'phiếu ' + (p.loai === 'chi' ? 'chi' : 'thu'), soPhieu, soDong: j.ids.length, tongTien: tong, trangThai: nhap ? 'NHÁP (chưa ghi sổ: mở phần mềm kiểm tra rồi bấm Ghi sổ)' : 'ĐÃ GHI SỔ',
        xemTrenPhanMem: lienKet('so-thu-chi', { q: soPhieu })
      };
    }
    const soPhieu = p.soPhieu || KT.soChungTuTiep(c.db, 'mh', p.ngay).soPhieu;
    const body = { header: Object.assign({ ngay: p.ngay, maNCC: p.ncc, soPhieu }, nhap ? { trangThai: 'nhap' } : {}), lines: p.rows.map((r) => ({ maCT: r.maCT, maVT: r.maVT, dienGiai: r.dienGiai, maHM: r.maHM, soLuong: r.soLuong == null ? '' : r.soLuong, donGia: r.donGia == null ? '' : r.donGia, thanhTien: r.thanhTien })) };
    const j = await goiPhanMem(pm, '/api/cost-slips', body);
    cache = null;
    return {
      daGhi: true, loai: 'phiếu nhập chi phí', soPhieu, soDong: j.count, tongTien: j.total, trangThai: nhap ? 'NHÁP (chưa ghi sổ: mở phần mềm kiểm tra rồi bấm Ghi sổ)' : 'ĐÃ GHI SỔ',
      xemTrenPhanMem: lienKet('cp-so', { q: soPhieu })
    };
  } catch (e) {
    if (e instanceof LoiNguoiDung) { cho.set(ma, x); } // lỗi trước khi ghi: giữ mã để thử lại
    throw e;
  }
}

/* ---------- giao thức MCP (JSON-RPC 2.0 qua stdio) ---------- */

const gui = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const traLoi = (id, result) => gui({ jsonrpc: '2.0', id, result });
const baoLoi = (id, code, message) => gui({ jsonrpc: '2.0', id, error: { code, message } });

const HUONG_DAN = 'Công cụ tra cứu (chỉ đọc) số liệu phần mềm kế toán "Kế Toán Công Trình": sổ quỹ thu chi, chi phí công trình, công nợ nhà cung cấp (NCC), giá vật tư, cảnh báo. ' +
  'Tiền tính bằng đồng (VND); khi trả lời hãy viết số có dấu chấm ngăn cách hàng nghìn (1.250.000 đ). Ngày dạng YYYY-MM-DD. ' +
  'Công trình / NCC / vật tư nhận mã hoặc tên; nếu công cụ báo khớp nhiều mục, hãy hỏi lại người dùng hoặc dùng tim_danh_muc. ' +
  'Chưa biết số liệu có từ ngày nào thì gọi tong_quan trước. Công nợ: cuối kỳ dương = còn phải trả (Dư Có), âm = đã ứng trước (Dư Nợ). ' +
  'Các công cụ tra cứu chỉ đọc. Lập phiếu thu / chi / nhập chi phí theo 2 bước: xem_truoc_phieu_* (không ghi gì) → hiện NGUYÊN bảng xem trước cho người dùng và hỏi OK → CHỈ khi người dùng đồng ý rõ ràng mới gọi ghi_phieu. Không bao giờ tự đoán nhà cung cấp / công trình hay lấy từ phiếu trước: thiếu thì hỏi. Không sửa / xóa phiếu đã ghi sổ (người dùng làm trong phần mềm). ' +
  'Mỗi kết quả có xemTrenPhanMem.url mở đúng màn hình đã lọc sẵn trên phần mềm: cuối câu trả lời hãy đưa link dạng markdown [Xem trên phần mềm](url) ' +
  '(dùng nguyên văn url, không tự sửa); nếu có xemTrenPhanMem.luuY thì nhắc người dùng. Link chỉ mở được trên máy cài phần mềm.';

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
      return Promise.resolve().then(() => t.chay(p.arguments || {})).then((kq0) => {
        let kq = kq0;
        // đặt link và lời nhắc lên đầu kết quả để không bị bỏ sót
        if (kq.xemTrenPhanMem) {
          const { xemTrenPhanMem, ...con } = kq;
          kq = Object.assign({ xemTrenPhanMem, nhacTraLoi: 'Cuối câu trả lời hãy đưa link: [Xem trên phần mềm](' + xemTrenPhanMem.url + ')' + (xemTrenPhanMem.luuY ? ' và nhắc: ' + xemTrenPhanMem.luuY : '') }, con);
        }
        return traLoi(msg.id, { content: [{ type: 'text', text: JSON.stringify(kq) }], structuredContent: kq, isError: false });
      }).catch((e) => {
        if (!(e instanceof LoiNguoiDung)) log('Lỗi khi chạy', p.name + ':', e && e.stack || e);
        return traLoi(msg.id, { content: [{ type: 'text', text: (e instanceof LoiNguoiDung ? '' : 'Lỗi: ') + (e && e.message || String(e)) }], isError: true });
      });
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
      '  Phiên bản cổng trợ lý: ' + PHIEN_BAN + '\n' +
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
