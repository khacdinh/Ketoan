'use strict';
/*
 * MA TRẬN QUYỀN — nơi DUY NHẤT quy định ai được làm gì. Dùng chung cho máy chủ (kiểm quyền thật ở tầng API: lib/auth.js) và
 * giao diện (ẩn / khóa nút cho tiện: /api/auth/trang-thai gửi danh sách hành động được phép).
 *
 * - HANH_DONG: hành động → các vai trò được phép (+ tên để báo lỗi dễ hiểu).
 * - ROUTES: [phương thức, mẫu đường dẫn, hành động]. Mẫu: ":x" khớp đúng một đoạn bất kỳ, "**" khớp phần còn lại (≥ 1 đoạn).
 *   Hành động có thể là hàm (url) → tên hành động khi cùng một đường dẫn có mức quyền khác nhau (nhập Excel thay thế toàn bộ).
 * - MẶC ĐỊNH TỪ CHỐI: khi đăng nhập đang bật, yêu cầu tới /api/* không khớp dòng nào ở ROUTES bị chặn (403) — không route nào
 *   bị bỏ sót vì quên khai báo. Kiểm thử tests/q-ma-tran-quyen.test.js tự dò mọi route trong mã máy chủ và đối chiếu với bảng này.
 * Khi đăng nhập TẮT: bảng này không được dùng, phần mềm chạy y như trước.
 */

const VAI_TRO = { chu: 'Chủ', 'ke-toan': 'Kế toán', 'chi-xem': 'Chỉ xem' };
const MOI_VAI = ['chu', 'ke-toan', 'chi-xem'];

// cong-khai: không cần đăng nhập. da-dang-nhap: mọi người đã đăng nhập (kể cả khi đang bị bắt đổi mật khẩu).
const HANH_DONG = {
  'cong-khai': { vai: '*', ten: 'đăng nhập / trạng thái' },
  'da-dang-nhap': { vai: MOI_VAI, ten: 'xem thông tin tài khoản của mình, đổi mật khẩu của mình' },
  'xem': { vai: MOI_VAI, ten: 'xem dữ liệu' },
  'xuat-excel': { vai: MOI_VAI, ten: 'xuất Excel' },
  'ghi': { vai: ['chu', 'ke-toan'], ten: 'thêm, sửa, xóa dữ liệu' },
  'nhap-excel': { vai: ['chu', 'ke-toan'], ten: 'nhập Excel (gộp thêm)' },
  'nhap-excel-thay-the': { vai: ['chu'], ten: 'nhập Excel thay thế toàn bộ dữ liệu' },
  'xem-sao-luu': { vai: ['chu', 'ke-toan'], ten: 'xem danh sách bản sao lưu' },
  'tao-sao-luu': { vai: ['chu', 'ke-toan'], ten: 'tạo / tải bản sao lưu' },
  'khoi-phuc-sao-luu': { vai: ['chu'], ten: 'khôi phục sao lưu' },
  'khoi-phuc-thung-rac': { vai: ['chu', 'ke-toan'], ten: 'khôi phục dữ liệu từ thùng rác' },
  'xoa-vinh-vien': { vai: ['chu'], ten: 'xóa vĩnh viễn / dọn thùng rác' },
  'xoa-toan-bo': { vai: ['chu'], ten: 'xóa toàn bộ sổ' },
  'cai-dat': { vai: ['chu'], ten: 'đổi cài đặt' },
  'khoa-so': { vai: ['chu'], ten: 'khóa / mở khóa sổ' },
  'gop-ma': { vai: ['chu'], ten: 'gộp mã / tách mã' },
  'sua-hang-loat': { vai: ['chu'], ten: 'sửa hàng loạt dữ liệu cũ (chuyển dòng chi phí sang theo khoản)' },
  'xem-nhat-ky': { vai: ['chu', 'ke-toan'], ten: 'xem nhật ký thay đổi' },
  'quan-ly-nguoi-dung': { vai: ['chu'], ten: 'quản lý người dùng' },
  'cau-hinh-dang-nhap': { vai: ['chu'], ten: 'bật / tắt và cấu hình đăng nhập' }
};

// Nhập Excel: xem trước và "gộp thêm" là thao tác thường; mọi trường hợp khác (thay thế toàn bộ, hoặc không ghi rõ chế độ —
// file sổ thu chi mặc định là thay thế) xếp vào "thay thế toàn bộ".
function hanhDongNhap(url) {
  const q = url.searchParams;
  if (q.get('dryRun') === '1' || q.get('mode') === 'merge') return 'nhap-excel';
  return 'nhap-excel-thay-the';
}

const ROUTES = [
  // ----- đăng nhập (lib/auth.js) -----
  ['GET', '/api/ping', 'cong-khai'],
  ['GET', '/api/auth/trang-thai', 'cong-khai'],
  ['POST', '/api/auth/dang-nhap', 'cong-khai'],
  ['POST', '/api/auth/dang-xuat', 'cong-khai'],
  ['POST', '/api/auth/quen-mat-khau', 'cong-khai'],
  ['POST', '/api/auth/dat-lai-bang-ma', 'cong-khai'],
  ['POST', '/api/auth/dung-ma-du-phong', 'cong-khai'],
  ['GET', '/api/auth/toi', 'da-dang-nhap'],
  ['POST', '/api/auth/gia-han', 'da-dang-nhap'],
  ['POST', '/api/auth/doi-mat-khau', 'da-dang-nhap'],
  ['POST', '/api/auth/bat', 'cau-hinh-dang-nhap'],
  ['POST', '/api/auth/tat', 'cau-hinh-dang-nhap'],
  ['PUT', '/api/auth/cau-hinh', 'cau-hinh-dang-nhap'],
  ['POST', '/api/auth/ma-du-phong', 'cau-hinh-dang-nhap'],
  ['GET', '/api/auth/su-kien', 'quan-ly-nguoi-dung'],
  ['GET', '/api/users', 'quan-ly-nguoi-dung'],
  ['POST', '/api/users', 'quan-ly-nguoi-dung'],
  ['PUT', '/api/users/:x', 'quan-ly-nguoi-dung'],
  ['POST', '/api/users/:x/trang-thai', 'quan-ly-nguoi-dung'],
  ['POST', '/api/users/:x/dat-lai-mat-khau', 'quan-ly-nguoi-dung'],
  ['POST', '/api/users/:x/mo-khoa', 'quan-ly-nguoi-dung'],

  // ----- dữ liệu chung, sổ thu chi, danh mục dự án / NCC (server.js) -----
  ['GET', '/api/db', 'xem'],
  ['POST', '/api/entries', 'ghi'],
  ['POST', '/api/entries/delete', 'ghi'],
  ['POST', '/api/entries/post', 'ghi'],
  ['PUT', '/api/entries/:x', 'ghi'],
  ['DELETE', '/api/entries/:x', 'ghi'],
  ['POST', '/api/projects', 'ghi'],
  ['PUT', '/api/projects/:x', 'ghi'],
  ['DELETE', '/api/projects/:x', 'ghi'],
  ['POST', '/api/suppliers', 'ghi'],
  ['PUT', '/api/suppliers/:x', 'ghi'],
  ['DELETE', '/api/suppliers/:x', 'ghi'],
  ['GET', '/api/vouchers/next', 'xem'],
  ['PUT', '/api/vouchers/**', 'ghi'],
  ['PUT', '/api/settings', 'cai-dat'],
  ['POST', '/api/import', hanhDongNhap],
  ['GET', '/api/backup', 'tao-sao-luu'],
  ['GET', '/api/backup-json', 'tao-sao-luu'],
  ['GET', '/api/backup-zip', 'tao-sao-luu'],
  ['GET', '/api/backups', 'xem-sao-luu'],
  ['POST', '/api/backups/now', 'tao-sao-luu'],
  ['POST', '/api/backups/restore', 'khoi-phuc-sao-luu'],
  ['POST', '/api/restore', 'khoi-phuc-sao-luu'],
  ['POST', '/api/restore-zip', 'khoi-phuc-sao-luu'],
  ['POST', '/api/reset', 'xoa-toan-bo'],
  ['GET', '/api/export/full', 'xuat-excel'],
  ['GET', '/api/export/ledger', 'xuat-excel'],
  ['GET', '/api/export/projects', 'xuat-excel'],
  ['GET', '/api/export/suppliers', 'xuat-excel'],
  ['GET', '/api/export/voucher', 'xuat-excel'],
  ['GET', '/api/export/costs', 'xuat-excel'],
  ['GET', '/api/export/cost-ledger', 'xuat-excel'],
  ['GET', '/api/export/cost-debt', 'xuat-excel'],
  ['GET', '/api/export/cash-count', 'xuat-excel'],

  // ----- nhật ký, khóa sổ, cảnh báo, thùng rác (lib/traceApi.js) -----
  ['GET', '/api/audit', 'xem-nhat-ky'],
  ['POST', '/api/locks', 'khoa-so'],
  ['POST', '/api/locks/unlock', 'khoa-so'],
  ['POST', '/api/warnings/ignore', 'ghi'],
  ['POST', '/api/warnings/unignore', 'ghi'],
  ['GET', '/api/trash', 'xem'],
  ['POST', '/api/trash/purge-all', 'xoa-vinh-vien'],
  ['POST', '/api/trash/:x/restore', 'khoi-phuc-thung-rac'],
  ['DELETE', '/api/trash/:x', 'xoa-vinh-vien'],

  // ----- kiểm quỹ, chứng từ đính kèm -----
  ['POST', '/api/cash-counts', 'ghi'],
  ['DELETE', '/api/cash-counts/:x', 'ghi'],
  ['POST', '/api/attachments', 'ghi'],
  ['GET', '/api/attachments/:x', 'xem'],
  ['DELETE', '/api/attachments/:x', 'ghi'],

  // ----- gộp mã (lib/mergeApi.js) -----
  ['POST', '/api/merge', 'gop-ma'],
  ['POST', '/api/merge/preview', 'gop-ma'],
  ['GET', '/api/merge/log', 'xem'],
  ['POST', '/api/merge/split', 'gop-ma'],
  ['POST', '/api/merge/split/preview', 'gop-ma'],
  ['GET', '/api/merge/suggest', 'xem'],
  ['POST', '/api/merge/suggest/ignore', 'gop-ma'],
  ['DELETE', '/api/merge/suggest/ignore', 'gop-ma'],
  ['POST', '/api/merge/:x/undo', 'gop-ma'],

  // ----- trả NCC ngoài quỹ (lib/extPayApi.js) -----
  ['POST', '/api/ext-payments', 'ghi'],
  ['PUT', '/api/ext-payments/:x', 'ghi'],
  ['DELETE', '/api/ext-payments/:x', 'ghi'],

  // ----- chi phí công trình (lib/costApi.js) -----
  ['POST', '/api/cost-groups', 'ghi'],
  ['PUT', '/api/cost-groups/:x', 'ghi'],
  ['DELETE', '/api/cost-groups/:x', 'ghi'],
  ['POST', '/api/cost-items', 'ghi'],
  ['PUT', '/api/cost-items/:x', 'ghi'],
  ['DELETE', '/api/cost-items/:x', 'ghi'],
  ['POST', '/api/materials', 'ghi'],
  ['PUT', '/api/materials/:x', 'ghi'],
  ['DELETE', '/api/materials/:x', 'ghi'],
  ['POST', '/api/houses', 'ghi'],
  ['PUT', '/api/houses/:x', 'ghi'],
  ['DELETE', '/api/houses/:x', 'ghi'],
  ['POST', '/api/cost-slips', 'ghi'],
  ['POST', '/api/cost-slips/:x/post', 'ghi'],
  ['PUT', '/api/cost-slips/:x', 'ghi'],
  ['DELETE', '/api/cost-slips/:x', 'ghi'],
  ['POST', '/api/costs', 'ghi'],
  ['POST', '/api/costs/delete', 'ghi'],
  ['POST', '/api/costs/theo-khoan', 'sua-hang-loat'],
  ['PUT', '/api/costs/:x', 'ghi'],
  ['DELETE', '/api/costs/:x', 'ghi'],
  ['POST', '/api/reset-costs', 'xoa-toan-bo']
];

const doan = (p) => String(p).split('/').filter(Boolean);
const MAU = ROUTES.map(([m, p, hd]) => ({ m, p, hd, doan: doan(p) }));

function khop(mau, ds) {
  for (let i = 0; i < mau.length; i++) {
    if (mau[i] === '**') return ds.length > i;
    if (i >= ds.length) return false;
    if (mau[i] !== ':x' && mau[i] !== ds[i]) return false;
  }
  return mau.length === ds.length;
}

// Tìm dòng của ma trận cho một yêu cầu. Trả { mau, hanhDong } hoặc null (= chưa khai báo → bị chặn khi đăng nhập bật).
// Đoạn đường dẫn rỗng (//), '.', '..' coi như không khớp.
function timRoute(method, pathname, url) {
  const ds = doan(pathname);
  if (String(pathname).includes('//') || ds.some((x) => x === '.' || x === '..')) return null;
  const m = String(method || '').toUpperCase() === 'HEAD' ? 'GET' : String(method || '').toUpperCase();
  for (const r of MAU) {
    if (r.m !== m || !khop(r.doan, ds)) continue;
    const hanhDong = typeof r.hd === 'function' ? r.hd(url || new URL('http://x' + pathname)) : r.hd;
    return { mau: r.m + ' ' + r.p, hanhDong };
  }
  return null;
}

function choPhep(vaiTro, hanhDong) {
  const h = HANH_DONG[hanhDong];
  if (!h) return false;
  if (h.vai === '*') return true;
  return h.vai.includes(vaiTro);
}

// Các hành động một vai trò được làm (giao diện dùng để ẩn / khóa nút)
function hanhDongCua(vaiTro) {
  return Object.keys(HANH_DONG).filter((k) => choPhep(vaiTro, k));
}

function thongBaoCam(hanhDong) {
  const h = HANH_DONG[hanhDong];
  return 'Tài khoản của bạn không có quyền ' + (h ? h.ten : 'dùng chức năng này') + '.';
}

module.exports = { VAI_TRO, MOI_VAI, HANH_DONG, ROUTES, timRoute, choPhep, hanhDongCua, thongBaoCam, hanhDongNhap };
