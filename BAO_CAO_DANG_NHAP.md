# Báo cáo: Đăng nhập đơn giản và phân quyền

Ngày: 01/10/2026 · Nhánh: `feature/dang-nhap-phan-quyen` (tách từ `feature/gop-ma-loc-cong-no`, chính là nội dung đã merge vào `master`
qua khacdinh/Ketoan#7).

## 1. Tóm tắt

- Chức năng **mặc định TẮT**. Khi tắt, `auth.xacThuc` trả về ngay ở dòng đầu: không màn hình đăng nhập, không kiểm cookie / Origin,
  API trả lời y như trước; toàn bộ kiểm thử cũ chạy ở trạng thái tắt và vẫn qua (mục 5).
- Khi bật: ba vai trò **Chủ / Kế toán / Chỉ xem**, kiểm quyền thật ở tầng API theo **một bảng duy nhất** `lib/quyen.js`, **mặc định từ
  chối** (route chưa khai báo → 403). Không có lúc nào “đã bật nhưng có API chưa kiểm quyền”: kiểm thử Q1 tự dò mọi route trong mã máy
  chủ và đỏ ngay nếu thiếu một dòng.
- **Không bị khóa ngoài**: không hạ quyền / vô hiệu hóa được Chủ hoạt động cuối; quên mật khẩu → mã một lần trong file cục bộ; mã dự
  phòng của Chủ; lệnh cứu hộ dòng lệnh; tắt đăng nhập giữ tài khoản.
- Chỉ dùng `crypto` và `node:sqlite` có sẵn của Node; không thư viện mới; chạy offline.

Bảy bước làm theo đúng thứ tự yêu cầu, mỗi bước một (vài) commit kèm kiểm thử:

| Bước | Nội dung | Kiểm thử |
|---|---|---|
| 1 | Nền tảng: bảng người dùng / phiên / sự kiện / cấu hình, scrypt, bật / tắt, đăng nhập / đăng xuất, phiên, CSRF | K1–K8 |
| 2 | Phân quyền tầng API theo ma trận, mặc định từ chối, siết route | Q1–Q4 |
| 3 | Chống đoán: khóa tăng dần, giới hạn theo địa chỉ, không lộ tài khoản | B1–B4 |
| 4 | Quản lý người dùng, đổi mật khẩu, bắt đổi sau khi đặt lại | N1–N6, U1–U2 |
| 5 | Quên mật khẩu: mã trong file cục bộ, mã dự phòng, lệnh cứu hộ | R1–R4 |
| 6 | Ghi người thao tác, nhật ký theo phiên, nhập Excel, sao lưu / khôi phục | T1–T6 |
| 7 | Cảnh báo hết phiên 2 phút trước, “Tiếp tục làm việc”, không mất dữ liệu đang nhập | U3 |

## 2. Ma trận quyền đầy đủ

### 2.1 Hành động × vai trò (`HANH_DONG` trong `lib/quyen.js`)

| Hành động | Ý nghĩa | Chủ | Kế toán | Chỉ xem |
|---|---|:-:|:-:|:-:|
| cong-khai | đăng nhập / trạng thái | ✓ | ✓ | ✓ |
| da-dang-nhap | xem thông tin tài khoản của mình, đổi mật khẩu của mình | ✓ | ✓ | ✓ |
| xem | xem dữ liệu | ✓ | ✓ | ✓ |
| xuat-excel | xuất Excel | ✓ | ✓ | ✓ |
| ghi | thêm, sửa, xóa dữ liệu | ✓ | ✓ |  |
| nhap-excel | nhập Excel (gộp thêm) | ✓ | ✓ |  |
| nhap-excel-thay-the | nhập Excel thay thế toàn bộ dữ liệu | ✓ |  |  |
| xem-sao-luu | xem danh sách bản sao lưu | ✓ | ✓ |  |
| tao-sao-luu | tạo / tải bản sao lưu | ✓ | ✓ |  |
| khoi-phuc-sao-luu | khôi phục sao lưu | ✓ |  |  |
| khoi-phuc-thung-rac | khôi phục dữ liệu từ thùng rác | ✓ | ✓ |  |
| xoa-vinh-vien | xóa vĩnh viễn / dọn thùng rác | ✓ |  |  |
| xoa-toan-bo | xóa toàn bộ sổ | ✓ |  |  |
| cai-dat | đổi cài đặt | ✓ |  |  |
| khoa-so | khóa / mở khóa sổ | ✓ |  |  |
| gop-ma | gộp mã / tách mã | ✓ |  |  |
| xem-nhat-ky | xem nhật ký thay đổi | ✓ | ✓ |  |
| quan-ly-nguoi-dung | quản lý người dùng | ✓ |  |  |
| cau-hinh-dang-nhap | bật / tắt và cấu hình đăng nhập | ✓ |  |  |

`cong-khai` = không cần đăng nhập; `da-dang-nhap` = mọi người đã đăng nhập, kể cả khi đang bị bắt đổi mật khẩu (các hành động khác trả
403 `PHAI_DOI_MAT_KHAU` cho tới khi đổi xong).

### 2.2 Từng route API (`ROUTES` — 102 dòng, sinh tự động từ mã nguồn)

| Phương thức | Đường dẫn | Hành động | Vai trò được phép |
|---|---|---|---|
| GET | `/api/ping` | cong-khai | mọi người (không cần đăng nhập) |
| GET | `/api/auth/trang-thai` | cong-khai | mọi người (không cần đăng nhập) |
| POST | `/api/auth/dang-nhap` | cong-khai | mọi người (không cần đăng nhập) |
| POST | `/api/auth/dang-xuat` | cong-khai | mọi người (không cần đăng nhập) |
| POST | `/api/auth/quen-mat-khau` | cong-khai | mọi người (không cần đăng nhập) |
| POST | `/api/auth/dat-lai-bang-ma` | cong-khai | mọi người (không cần đăng nhập) |
| POST | `/api/auth/dung-ma-du-phong` | cong-khai | mọi người (không cần đăng nhập) |
| GET | `/api/auth/toi` | da-dang-nhap | Chủ, Kế toán, Chỉ xem |
| POST | `/api/auth/gia-han` | da-dang-nhap | Chủ, Kế toán, Chỉ xem |
| POST | `/api/auth/doi-mat-khau` | da-dang-nhap | Chủ, Kế toán, Chỉ xem |
| POST | `/api/auth/bat` | cau-hinh-dang-nhap | Chủ |
| POST | `/api/auth/tat` | cau-hinh-dang-nhap | Chủ |
| PUT | `/api/auth/cau-hinh` | cau-hinh-dang-nhap | Chủ |
| POST | `/api/auth/ma-du-phong` | cau-hinh-dang-nhap | Chủ |
| GET | `/api/auth/su-kien` | quan-ly-nguoi-dung | Chủ |
| GET | `/api/users` | quan-ly-nguoi-dung | Chủ |
| POST | `/api/users` | quan-ly-nguoi-dung | Chủ |
| PUT | `/api/users/:x` | quan-ly-nguoi-dung | Chủ |
| POST | `/api/users/:x/trang-thai` | quan-ly-nguoi-dung | Chủ |
| POST | `/api/users/:x/dat-lai-mat-khau` | quan-ly-nguoi-dung | Chủ |
| POST | `/api/users/:x/mo-khoa` | quan-ly-nguoi-dung | Chủ |
| GET | `/api/db` | xem | Chủ, Kế toán, Chỉ xem |
| POST | `/api/entries` | ghi | Chủ, Kế toán |
| POST | `/api/entries/delete` | ghi | Chủ, Kế toán |
| POST | `/api/entries/post` | ghi | Chủ, Kế toán |
| PUT | `/api/entries/:x` | ghi | Chủ, Kế toán |
| DELETE | `/api/entries/:x` | ghi | Chủ, Kế toán |
| POST | `/api/projects` | ghi | Chủ, Kế toán |
| PUT | `/api/projects/:x` | ghi | Chủ, Kế toán |
| DELETE | `/api/projects/:x` | ghi | Chủ, Kế toán |
| POST | `/api/suppliers` | ghi | Chủ, Kế toán |
| PUT | `/api/suppliers/:x` | ghi | Chủ, Kế toán |
| DELETE | `/api/suppliers/:x` | ghi | Chủ, Kế toán |
| GET | `/api/vouchers/next` | xem | Chủ, Kế toán, Chỉ xem |
| PUT | `/api/vouchers/**` | ghi | Chủ, Kế toán |
| PUT | `/api/settings` | cai-dat | Chủ |
| POST | `/api/import` | `?dryRun=1` hoặc `?mode=merge` → nhap-excel; còn lại → nhap-excel-thay-the | Chủ, Kế toán / Chủ |
| GET | `/api/backup` | tao-sao-luu | Chủ, Kế toán |
| GET | `/api/backup-json` | tao-sao-luu | Chủ, Kế toán |
| GET | `/api/backup-zip` | tao-sao-luu | Chủ, Kế toán |
| GET | `/api/backups` | xem-sao-luu | Chủ, Kế toán |
| POST | `/api/backups/now` | tao-sao-luu | Chủ, Kế toán |
| POST | `/api/backups/restore` | khoi-phuc-sao-luu | Chủ |
| POST | `/api/restore` | khoi-phuc-sao-luu | Chủ |
| POST | `/api/restore-zip` | khoi-phuc-sao-luu | Chủ |
| POST | `/api/reset` | xoa-toan-bo | Chủ |
| GET | `/api/export/full` | xuat-excel | Chủ, Kế toán, Chỉ xem |
| GET | `/api/export/ledger` | xuat-excel | Chủ, Kế toán, Chỉ xem |
| GET | `/api/export/projects` | xuat-excel | Chủ, Kế toán, Chỉ xem |
| GET | `/api/export/suppliers` | xuat-excel | Chủ, Kế toán, Chỉ xem |
| GET | `/api/export/voucher` | xuat-excel | Chủ, Kế toán, Chỉ xem |
| GET | `/api/export/costs` | xuat-excel | Chủ, Kế toán, Chỉ xem |
| GET | `/api/export/cost-ledger` | xuat-excel | Chủ, Kế toán, Chỉ xem |
| GET | `/api/export/cost-debt` | xuat-excel | Chủ, Kế toán, Chỉ xem |
| GET | `/api/export/cash-count` | xuat-excel | Chủ, Kế toán, Chỉ xem |
| GET | `/api/audit` | xem-nhat-ky | Chủ, Kế toán |
| POST | `/api/locks` | khoa-so | Chủ |
| POST | `/api/locks/unlock` | khoa-so | Chủ |
| POST | `/api/warnings/ignore` | ghi | Chủ, Kế toán |
| POST | `/api/warnings/unignore` | ghi | Chủ, Kế toán |
| GET | `/api/trash` | xem | Chủ, Kế toán, Chỉ xem |
| POST | `/api/trash/purge-all` | xoa-vinh-vien | Chủ |
| POST | `/api/trash/:x/restore` | khoi-phuc-thung-rac | Chủ, Kế toán |
| DELETE | `/api/trash/:x` | xoa-vinh-vien | Chủ |
| POST | `/api/cash-counts` | ghi | Chủ, Kế toán |
| DELETE | `/api/cash-counts/:x` | ghi | Chủ, Kế toán |
| POST | `/api/attachments` | ghi | Chủ, Kế toán |
| GET | `/api/attachments/:x` | xem | Chủ, Kế toán, Chỉ xem |
| DELETE | `/api/attachments/:x` | ghi | Chủ, Kế toán |
| POST | `/api/merge` | gop-ma | Chủ |
| POST | `/api/merge/preview` | gop-ma | Chủ |
| GET | `/api/merge/log` | xem | Chủ, Kế toán, Chỉ xem |
| POST | `/api/merge/split` | gop-ma | Chủ |
| POST | `/api/merge/split/preview` | gop-ma | Chủ |
| GET | `/api/merge/suggest` | xem | Chủ, Kế toán, Chỉ xem |
| POST | `/api/merge/suggest/ignore` | gop-ma | Chủ |
| DELETE | `/api/merge/suggest/ignore` | gop-ma | Chủ |
| POST | `/api/merge/:x/undo` | gop-ma | Chủ |
| POST | `/api/ext-payments` | ghi | Chủ, Kế toán |
| PUT | `/api/ext-payments/:x` | ghi | Chủ, Kế toán |
| DELETE | `/api/ext-payments/:x` | ghi | Chủ, Kế toán |
| POST | `/api/cost-groups` | ghi | Chủ, Kế toán |
| PUT | `/api/cost-groups/:x` | ghi | Chủ, Kế toán |
| DELETE | `/api/cost-groups/:x` | ghi | Chủ, Kế toán |
| POST | `/api/cost-items` | ghi | Chủ, Kế toán |
| PUT | `/api/cost-items/:x` | ghi | Chủ, Kế toán |
| DELETE | `/api/cost-items/:x` | ghi | Chủ, Kế toán |
| POST | `/api/materials` | ghi | Chủ, Kế toán |
| PUT | `/api/materials/:x` | ghi | Chủ, Kế toán |
| DELETE | `/api/materials/:x` | ghi | Chủ, Kế toán |
| POST | `/api/houses` | ghi | Chủ, Kế toán |
| PUT | `/api/houses/:x` | ghi | Chủ, Kế toán |
| DELETE | `/api/houses/:x` | ghi | Chủ, Kế toán |
| POST | `/api/cost-slips` | ghi | Chủ, Kế toán |
| POST | `/api/cost-slips/:x/post` | ghi | Chủ, Kế toán |
| PUT | `/api/cost-slips/:x` | ghi | Chủ, Kế toán |
| DELETE | `/api/cost-slips/:x` | ghi | Chủ, Kế toán |
| POST | `/api/costs` | ghi | Chủ, Kế toán |
| POST | `/api/costs/delete` | ghi | Chủ, Kế toán |
| PUT | `/api/costs/:x` | ghi | Chủ, Kế toán |
| DELETE | `/api/costs/:x` | ghi | Chủ, Kế toán |
| POST | `/api/reset-costs` | xoa-toan-bo | Chủ |

Ghi chú:

- `POST /api/auth/bat` khi đăng nhập đang **tắt** (lần đầu, hoặc bật lại) không cần phiên: bật lần đầu phải tạo tài khoản Chủ hợp lệ
  trong cùng yêu cầu; bật lại phải đăng nhập bằng một tài khoản Chủ đã có. Khi đang bật, chỉ Chủ gọi được.
- Đăng nhập tắt: các route `/api/auth/*` (trừ `trang-thai`, `bat`) và `/api/users*` trả 409 `DANG_TAT`.
- Mã lỗi: 401 `CHUA_DANG_NHAP` / `HET_PHIEN`; 403 `KHONG_CO_QUYEN` (thông báo “Bạn không có quyền <tên hành động>…”), `PHAI_DOI_MAT_KHAU`,
  `SAI_NGUON` (CSRF), `CHUA_KHAI_BAO` (route không có trong bảng); 429 `TAI_KHOAN_KHOA` / `CHAN_DIA_CHI`; 409 `CHU_CUOI`.
- Giao diện chỉ ẩn nút / màn theo danh sách hành động máy chủ gửi (`quyen` trong `/api/auth/trang-thai`); không có chỗ nào chỉ dựa vào
  giao diện để chặn.

## 3. Thay đổi cấu trúc dữ liệu (lược đồ 5 → 6)

- `DB_VERSION = 6` (`MIN_VERSION = 4`). Mở file cũ: sao lưu nguyên trạng `data/backups/ketoan-<giờ>-truoc-nang-cap-luoc-do-6.db` (không
  bao giờ tự xóa), rồi `SqliteDb.migrate()` thêm bảng / cột trong **một giao dịch**; chạy lại không làm gì (kiểm thử K8, M0).
- Cột mới `nguoiTao TEXT`, `nguoiSua TEXT` (`since: 6`) ở `projects`, `suppliers`, `entries`, `costGroups`, `costItems`, `materials`,
  `houses`, `costs`, `cashCounts`, `extPayments`. Giá trị: id người dùng (chuỗi số) khi đăng nhập bật; `Người dùng máy này` khi tắt; để
  trống với dữ liệu có từ trước (giao diện hiện “Dữ liệu cũ”).
- Bảng mới (`AUTH_SQL` trong `lib/db.js`, `STRICT`, mọi truy vấn có tham số):
  - `nguoiDung(id, tenDangNhap, khoaTen UNIQUE, hoTen, vaiTro CHECK IN ('chu','ke-toan','chi-xem'), matKhau, hoatDong, phaiDoiMatKhau,
    saiLienTiep, soLanKhoa, khoaDen, lanDangNhapCuoi, taoLuc, suaLuc, doiMatKhauLuc)` — `khoaTen` = tên NFC, cắt khoảng trắng, chữ thường.
  - `phienDangNhap(bam PRIMARY KEY, nguoiDungId, taoLuc, hoatDongLuc, ip)` — chỉ lưu SHA-256 của mã phiên.
  - `suKienBaoMat(id, luc, loai, nguoiDungId, tenDangNhap, nguoiLam, ip, chiTiet)`.
  - `cauHinhDangNhap(khoa PRIMARY KEY, giaTri)` — `bat`, `thoiGian` {phutCho, gioToiDa}, `maDuPhong` {bam, taoLuc}, `maKhoiPhuc`
    {id, bam, hetHan, sai}.
- Bốn bảng đăng nhập nằm trong `ketoan.db` nhưng **ngoài** `TABLES` / kho dữ liệu trong bộ nhớ (`store.db`). Hệ quả: không bao giờ đi
  vào `/api/db`, file Excel xuất, `.json` xuất; `readDbFile` (khôi phục) không đọc nên khôi phục không ghi đè tài khoản; file sao lưu
  **tải về** được xóa trắng bốn bảng rồi `VACUUM` (không còn mã băm trong trang trống). Bản sao lưu tự động trong `data/backups/` thì
  giữ nguyên (nằm cùng thư mục với dữ liệu gốc vốn đã có các bảng này).
- Nhật ký thay đổi `nhat-ky.jsonl`: thêm trường `nguoiDungId` khi đăng nhập bật.
- File mới: `data/khoi-phuc/MA_KHOI_PHUC.txt` (chỉ tồn tại khi có yêu cầu quên mật khẩu đang chờ; xóa khi dùng / hết hạn / sai quá số lần).

## 4. Quyết định bảo mật và lý do

| Chủ đề | Quyết định | Lý do |
|---|---|---|
| Băm mật khẩu | `crypto.scrypt` N=2^15, r=8, p=1, muối 16 byte, khóa 64 byte, chuỗi `scrypt$N$r$p$muoi$bam` (base64url); `maxmem` đủ cho N | Có sẵn trong Node, chống dò bằng GPU tốt; tham số nằm trong chuỗi nên đổi về sau được (`canBamLai` → băm lại khi đăng nhập đúng) |
| So sánh | `timingSafeEqual`; tên không tồn tại vẫn chạy scrypt với mã băm giả | Không lộ tên có thật qua thời gian trả lời (B2 đo: trung vị 118,6 ms vs 113,9 ms) |
| Chính sách mật khẩu | NFC; ≥ 8 ký tự (≤ 200); khác tên đăng nhập (so sau khi bỏ dấu); không trong danh sách phổ biến; không một ký tự lặp | Theo yêu cầu; khuyến khích câu tiếng Việt dễ nhớ thay vì ký tự đặc biệt |
| Mã phiên | `randomBytes(32)` base64url; CSDL chỉ giữ SHA-256 | Lộ file dữ liệu không lộ phiên đang dùng |
| Cookie | `stc_phien`, `HttpOnly; SameSite=Strict; Path=/`, **không** `Secure` | Phần mềm chạy `http://localhost` — `Secure` sẽ làm trình duyệt bỏ cookie (có chú thích trong mã) |
| Thời hạn | 60 phút không thao tác, tối đa 12 giờ; Chủ chỉnh 5–480 phút / 1–72 giờ; dọn phiên hết hạn mỗi 10 phút | Theo yêu cầu |
| Hủy phiên | Đổi mật khẩu (giữ phiên đang dùng, hủy phiên khác), đặt lại mật khẩu, đổi vai trò, vô hiệu hóa, tắt đăng nhập, khôi phục sao lưu, bật lại | Quyền thay đổi phải có hiệu lực ngay |
| CSRF | Mọi yêu cầu không phải GET/HEAD/OPTIONS khi bật phải có `Origin` = `http://<host>` hoặc `Referer` bắt đầu bằng đó | Cookie SameSite=Strict + kiểm nguồn: hai lớp. Kiểm tra Host / Origin localhost (chống DNS rebinding) đã có từ trước, luôn chạy |
| Chống đoán | 5 lần sai → khóa 5 / 15 / 60 phút (tăng dần theo `soLanKhoa`); 20 lần sai / 15 phút từ một địa chỉ → chặn địa chỉ 15 phút × lần (tối đa ×4); tên không tồn tại cũng bị đếm & khóa trong bộ nhớ | Thông báo chung “Sai tên đăng nhập hoặc mật khẩu.”; scrypt luôn chạy TRƯỚC khi kiểm khóa nên thời gian không lộ trạng thái |
| Mặc định từ chối | Route không có trong `ROUTES` → 403 khi bật; đường dẫn có `//`, `.`, `..` không khớp mẫu nào | Quên khai báo route mới không thành lỗ hổng; Q1 bắt lỗi ngay khi chạy kiểm thử |
| Bí mật không ra ngoài | Mật khẩu, mã phiên, mã khôi phục, mã dự phòng không có trong log, nhật ký, sự kiện bảo mật, thông báo lỗi, file xuất, URL (mọi thứ gửi bằng thân POST) | T6, R1 kiểm tra trực tiếp |
| Mã khôi phục | 10 ký tự từ bảng 32 chữ dễ đọc (dạng XXXXX-XXXXX), hạn 15 phút, 5 lần sai thì hủy, ghi file cục bộ (BOM + CRLF cho Notepad, quyền 0600), CSDL chỉ giữ SHA-256; trả lời API giống hệt dù tên có hay không | Chỉ người ngồi ở máy (đọc được thư mục `data/`) mới lấy được — đúng mô hình phần mềm cục bộ |
| Mã dự phòng | 20 ký tự ngẫu nhiên (≈ 100 bit, nên băm SHA-256 là đủ — không đoán được bằng vét cạn), so sánh thời gian hằng, sai thì tính vào giới hạn theo địa chỉ; hiện **một lần** khi bật (phải tích “đã cất” mới đóng hộp, in được), tạo mới sau khi dùng hoặc khi Chủ yêu cầu | Đường vào lại cho Chủ không cần chạm vào máy chủ |
| Lệnh cứu hộ | `node scripts/dat-lai-mat-khau-chu.js`: nhập mật khẩu hai lần (ẩn), kiểm chính sách, gõ `CO`; đặt lại + mở khóa + kích hoạt, hủy phiên, ghi sự kiện | Đường cuối cùng; ai có quyền vào máy thì vốn đã đọc được dữ liệu |
| Người thao tác | `AsyncLocalStorage` giữ người dùng của yêu cầu → `store.save()` / `replaceAll` ghi `nguoiTao`; `trace.log` ghi `nguoiTao` / `nguoiSua` và tên trong nhật ký | Mọi đường ghi (kể cả nhập Excel) đều qua đây; khi bật không tin tiêu đề `X-Nguoi-Dung` |
| Khôi phục sao lưu | Không đụng bốn bảng đăng nhập; hủy mọi phiên, xóa cookie, ghi sự kiện | Khôi phục bản cũ không được mở lại mật khẩu cũ hay tắt đăng nhập |
| Cấu hình | Đọc một lần, giữ trong bộ nhớ (chỉ máy chủ này ghi) | Mỗi yêu cầu phải biết “đang bật?” mà không đọc file — khi chương trình khác khóa file, phần mềm (tắt đăng nhập) vẫn chạy như trước (S2.6) |
| XSS / tiêm SQL | Mọi chuỗi hiển thị qua `esc()`; mọi SQL có tham số (`LIKE … ESCAPE`); tên đăng nhập `^[\p{L}\p{N}._-]{3,40}$` | N6, U2, T4 kiểm tra |

## 5. Kết quả kiểm thử

Toàn bộ `npm test` chạy trên commit cuối của tính năng (`748f1ee`, worktree riêng, đăng nhập mặc định tắt):

| Lần chạy | Tổng | Qua | Lỗi | Bỏ qua | Thời gian |
|---|---:|---:|---:|---:|---:|
| Trước khi làm đăng nhập (`405c5aa`) | 194 | 191 | 1 (G1 hiệu năng — phụ thuộc tốc độ máy) | 2 | 14 phút 51 giây |
| **Sau khi làm xong** (`748f1ee`) | **229** | **227** | **0** | 2 | 15 phút 58 giây |

Hai bài bỏ qua là có chủ ý: A3 (`npm install` sạch — chỉ chạy khi đặt `RUN_NPM_INSTALL=1`) và S3.6 (cần bản mã JSON cũ để đối chiếu).
Toàn bộ 194 bài cũ chạy với đăng nhập TẮT và vẫn qua (yêu cầu 1). Bài cũ phải sửa: H4.2 (bản ghi mới có thêm trường `nguoiTao`), M0
(kiểm nâng cấp lược đồ viết tổng quát cho lược đồ mới nhất). Lần chạy giữa chừng phát hiện S2.6 (đọc cấu hình đăng nhập khi file đang bị
chương trình khác khóa) — đã sửa (cấu hình giữ trong bộ nhớ).

35 bài mới theo 12 nhóm yêu cầu:

| Yêu cầu | Bài kiểm thử |
|---|---|
| 1. Tắt: mọi bài cũ qua; tắt không có bước nào thêm | toàn bộ bộ cũ; K1 |
| 2. Ma trận route tự động (dò route trong mã, 4 trạng thái: tắt / chưa đăng nhập / từng vai trò; thiếu route ⇒ đỏ) | Q1–Q4 |
| 3. Mật khẩu (scrypt, muối, chính sách, NFC, băm lại) | K2, K7, N5 |
| 4. Phiên (hết 60 phút / 12 giờ bằng đồng hồ giả, hủy khi đổi mật khẩu / vai trò / vô hiệu, cookie, CSRF) | K3–K6, N2, N4 |
| 5. Chống đoán (khóa 5 / 15 / 60 phút, theo địa chỉ, không lộ tài khoản kể cả thời gian, Chủ mở khóa) | B1–B4 |
| 6. Khôi phục (mã trong file, hết hạn, sai quá lần, mã dự phòng, lệnh cứu hộ) | R1–R4 |
| 7. Không bị khóa ngoài (Chủ cuối, tắt giữ tài khoản, bật lại) | N3, K6, R3, R4 |
| 8. Sao lưu / khôi phục (giữ tài khoản + trạng thái bật, hủy phiên, file tải về không có dữ liệu đăng nhập) | T5 |
| 9. XSS / tiêm SQL / không lộ bí mật trong log, nhật ký, sự kiện, Excel | N6, U2, T4, T6, R1 |
| 10. Giao diện theo vai trò; không mất dữ liệu khi hết phiên | U1–U3 |
| 11. Nâng cấp lược đồ 5 → 6 (sao lưu, chạy lại không nhân đôi) | K8, M0 |
| 12. Ghi người thao tác, nhập Excel, lọc sự kiện | T1–T4 |


## 6. Giả định (tự quyết định, không hỏi lại)

1. **Việc chưa rõ thuộc Chủ**: nhập Excel thay thế toàn bộ (và nhập không ghi rõ chế độ — file sổ thu chi mặc định là thay thế), khôi
   phục sao lưu, xóa toàn bộ sổ / chi phí, xóa vĩnh viễn và dọn thùng rác, khóa / mở khóa sổ, gộp mã / tách mã / hoàn tác gộp / bỏ qua
   gợi ý trùng, đổi cài đặt.
2. **Kế toán** được: ghi / sửa / xóa (vào thùng rác), khôi phục từ thùng rác, nhập Excel gộp thêm, xem nhật ký, tạo / tải sao lưu (sao lưu
   là thao tác an toàn — không đổi dữ liệu; file tải về đã bỏ dữ liệu đăng nhập).
3. **Chỉ xem** được xem mọi màn báo cáo, thùng rác, lịch sử gộp mã, gợi ý mã trùng, chứng từ đính kèm; xuất Excel / in phiếu; KHÔNG xem
   nhật ký thay đổi (có giá trị trước / sau chi tiết — coi là việc của người ghi sổ).
4. **“Dữ liệu cũ”** xử lý ở tầng hiển thị: bản ghi có từ trước để trống `nguoiTao` (không viết lại hàng loạt khi nâng cấp — giữ nguyên
   từng byte dữ liệu cũ và các mốc số liệu của kiểm thử cũ). Giao diện hiện “Dữ liệu cũ”.
5. Khi đăng nhập **tắt**, bản ghi mới ghi `nguoiTao = "Người dùng máy này"`; ô “Người đang dùng máy này” (Cài đặt) vẫn dùng cho nhật ký
   như trước. Khi bật, ô này ẩn và nhật ký lấy tên từ phiên.
6. **Giới hạn theo địa chỉ** gần như là giới hạn theo máy, vì phần mềm chỉ nghe trên `127.0.0.1` (không có truy cập LAN). Vẫn làm theo
   yêu cầu để có sẵn nếu sau này mở LAN.
7. **Bật lại** đăng nhập sau khi đã tắt: dùng lại tài khoản cũ, phải đăng nhập bằng một tài khoản Chủ; cấp mã dự phòng mới.
8. Tắt đăng nhập yêu cầu **nhập lại mật khẩu** của Chủ đang đăng nhập (chống người khác ngồi vào máy đang mở).
9. Đổi mật khẩu của chính mình giữ phiên đang dùng, hủy các phiên khác của người đó. Đặt lại mật khẩu bởi Chủ / đổi vai trò / vô hiệu hóa
   hủy mọi phiên của người đó.
10. Sau khôi phục sao lưu, **mọi** phiên bị hủy (kể cả người vừa khôi phục) — đơn giản và an toàn; giao diện hiện hộp đăng nhập lại.
11. Bản sao lưu tự động trong `data/backups/` giữ cả bảng đăng nhập (chụp nguyên file); chỉ file **tải về** bị bỏ bảng đăng nhập.
12. Tên đăng nhập 3–40 ký tự chữ (có dấu được), số, `.`, `_`, `-`; không phân biệt hoa / thường.
13. Khi đã bật mà đăng nhập bằng mã dự phòng / lệnh cứu hộ, tài khoản Chủ đó được mở khóa và kích hoạt lại.
14. Yêu cầu ban đầu “không merge, không push”; sau đó chủ phần mềm yêu cầu “làm xong thì tạo PR và merge vào master” — làm theo yêu cầu
    sau (mục 9).

## 7. Rủi ro còn lại

- **Dữ liệu không được mã hóa**: ai chép được thư mục `data/` (hoặc mở được máy) đọc được toàn bộ sổ, kể cả mã băm mật khẩu (scrypt — đủ
  chậm để dò khó, nhưng mật khẩu yếu vẫn dò được). Đã ghi rõ trong hướng dẫn: đặt mật khẩu Windows, bật mã hóa ổ đĩa (BitLocker).
- **Lệnh cứu hộ và file mã khôi phục** dùng được bởi bất kỳ ai có quyền vào máy — đúng chủ ý, nhưng có nghĩa đăng nhập không chống được
  người dùng chung tài khoản Windows có hiểu biết.
- Chạy lệnh cứu hộ **khi phần mềm đang mở**: thay đổi ghi thẳng vào file và được nhận ngay (bảng đăng nhập không có trong bộ nhớ), nhưng
  thao tác ghi kế tiếp của phần mềm có thể gặp một lần 409 “dữ liệu vừa bị chương trình khác thay đổi” rồi tự nạp lại. Hướng dẫn khuyên
  đóng phần mềm trước.
- Đếm sai theo tên không tồn tại và theo địa chỉ nằm trong bộ nhớ: khởi động lại phần mềm thì xóa (đếm theo tài khoản có thật lưu trong
  CSDL, không mất).
- Cảnh báo hết phiên tính theo đồng hồ máy dựa trên số mili-giây máy chủ gửi; nếu đồng hồ máy nhảy (ngủ máy), lúc đến mốc giao diện hỏi
  lại máy chủ trước khi bắt đăng nhập lại, và yêu cầu ghi bị 401 vẫn được gửi lại sau khi đăng nhập — không mất dữ liệu, chỉ có thể báo
  muộn / sớm.
- Nhiều cửa sổ: hết phiên ở một cửa sổ thì cửa sổ khác cũng phải đăng nhập lại ở thao tác kế tiếp (cùng cookie).
- Kiểm thử G1 (hiệu năng 20.000 dòng) phụ thuộc tốc độ máy: đã đỏ một lần TRƯỚC khi làm chức năng đăng nhập, lần chạy cuối thì qua (mục 5).

## 8. Việc chưa làm / có thể làm sau

- Truy cập qua mạng LAN (cần HTTPS + cookie `Secure` + giới hạn theo địa chỉ thật) — ngoài phạm vi; phần mềm vẫn chỉ nghe `127.0.0.1`.
- Phân quyền theo từng công trình / dự án (Kế toán chỉ thấy công trình được giao).
- Xác thực hai bước; khóa màn hình khi rời máy (ngoài hết phiên).
- Màn phiếu nhập chi phí và các danh mục chưa hiện dòng “Người tạo / Người sửa” (dữ liệu đã ghi; form sửa dòng sổ thu chi đã hiện).
- Báo cáo lọc theo người tạo.
- Không kiểm tra được trên Windows thật trong môi trường này (Linux + Chromium); xem danh sách kiểm tra ở mục 9.

## 9. Gộp nhánh và kiểm tra trên Windows

Nhánh gốc (BRANCH_GOC): `feature/gop-ma-loc-cong-no`; nhánh mới: `feature/dang-nhap-phan-quyen`.

Gộp bằng tay (nếu không dùng PR):

```
git switch feature/gop-ma-loc-cong-no
git merge feature/dang-nhap-phan-quyen
```

Danh sách kiểm tra trên máy Windows:

1. **Sao lưu** thư mục `data\` (chép nguyên thư mục ra chỗ khác).
2. Chạy `KhoiDong.bat`: phần mềm mở như cũ, **không** có màn đăng nhập; dữ liệu đủ (tự nâng cấp lược đồ 6, có file sao lưu
   `truoc-nang-cap-luoc-do-6` trong `data\backups\`).
3. Cài đặt → Đăng nhập và phân quyền → **Bật đăng nhập**, tạo tài khoản Chủ; **chép / in mã dự phòng** và cất đi.
4. Menu tên → Quản lý người dùng: tạo một tài khoản **Kế toán** và một **Chỉ xem**. Đăng xuất, đăng nhập từng tài khoản (bị bắt đổi
   mật khẩu lần đầu): Kế toán ghi được phiếu, không thấy Gộp mã / Khôi phục / Xóa vĩnh viễn; Chỉ xem không thấy nút thêm / sửa / xóa,
   xuất Excel được.
5. **Quên mật khẩu**: ở màn đăng nhập bấm Quên mật khẩu? → nhập tên → Lấy mã khôi phục → mở `data\khoi-phuc\MA_KHOI_PHUC.txt` bằng
   Notepad → nhập mã + mật khẩu mới → đăng nhập được. Thử thêm **Dùng mã dự phòng của Chủ**.
6. Nhập sai mật khẩu 5 lần → bị khóa 5 phút; Chủ mở khóa ở Quản lý người dùng.
7. Đang gõ dở một phiếu, để yên (hoặc Chủ đặt “không thao tác” 5 phút ở Cài đặt): 2 phút trước khi hết thấy cảnh báo + **Tiếp tục làm
   việc**; để hết hẳn → hộp đăng nhập lại, phiếu đang gõ còn nguyên, đăng nhập lại rồi lưu.
8. **Tắt đăng nhập** (nhập lại mật khẩu) → phần mềm về như cũ; **Bật lại** bằng tài khoản Chủ cũ → vào được, nhận mã dự phòng mới.
9. Thử lệnh cứu hộ (đóng phần mềm trước): `node scripts\dat-lai-mat-khau-chu.js`.
10. Khôi phục một bản sao lưu cũ → mọi người phải đăng nhập lại, mật khẩu vẫn là mật khẩu hiện tại, đăng nhập vẫn bật.
11. Mở file Excel xuất ra bằng Excel thật: mở được, không có thông tin tài khoản.
