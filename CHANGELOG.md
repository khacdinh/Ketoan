# Nhật ký phiên bản (CHANGELOG)

## Công nợ NCC: ô lọc NCC gõ tìm (01/10/2026)

- Ô lọc nhà cung cấp đổi từ danh sách chọn sang ô gõ tìm có gợi ý (mã + tên), như ô Nhà cung cấp ở form phiếu chi: chọn gợi ý là lọc
  ngay; gõ mã (không phân biệt hoa thường) hoặc đúng tên rồi Enter; tên không có thì báo lỗi; xóa trắng rồi Enter để bỏ lọc. Kiểm thử F6c.

## Công nợ NCC: lọc theo mã NCC (01/10/2026)

- Màn Công nợ NCC có ô chọn nhà cung cấp: chỉ hiện NCC đó (bỏ qua ô phạm vi), chi tiết mở sẵn, bảng theo công trình chỉ còn các
  công trình NCC đó có phát sinh / thanh toán (cột Chi khác không áp dụng). Bộ lọc được nhớ; In và Xuất Excel theo bộ lọc
  (`/api/export/cost-debt?ncc=`).
- `KT.supplierDebt` và `KT.projectDebtSummary` nhận thêm `ncc`. Kiểm thử D6.3, F6c.

## Nhập Thành tiền không cần Số lượng, Đơn giá (01/10/2026)

- Phiếu nhập chi phí: ô **Thành tiền** nhập được. Chỉ gõ Thành tiền (để trống SL, ĐG) → dòng khoán, lưu SL 1 × ĐG = Thành tiền
  (giống cách công cụ nhập Excel xử lý dòng chỉ có Thành tiền), nên công thức SL × ĐG = Thành tiền vẫn đúng ở mọi dòng, báo cáo và
  Excel không đổi. Gõ SL + Thành tiền → Đơn giá tự tính (máy chủ tính tới 0,01 sao cho nhân lại đúng Thành tiền, không chia đều thì báo lỗi).
  Ô người dùng tự gõ không bị ghi đè khi sửa ô khác.
- Sổ chi phí: bấm đúp ô Thành tiền để sửa (giữ SL, tính lại ĐG); form sửa dòng có ô Thành tiền, SL và ĐG không còn bắt buộc.
- API `/api/cost-slips`, `/api/costs`: nhận thêm `thanhTien`; khi có đủ `soLuong` và `donGia` thì vẫn tự tính và bỏ qua `thanhTien` gửi kèm
  (tương thích bản cũ). Hàm dùng chung `KT.costFromInput`, `KT.syncCostInputs`. Kiểm thử D3.4, F1c.

## Bỏ Kế toán trưởng trên phiếu thu/chi (01/10/2026)

- Phiếu thu, phiếu chi (in từ phần mềm, file Excel một phiếu và sheet `Phieu_Chi` trong file xuất) chỉ còn ba chỗ ký: Giám đốc,
  người nộp/nhận tiền, Thủ quỹ. Bỏ ô chọn “In thêm chỗ ký của kế toán trưởng” trong Cài đặt (giá trị cũ vẫn lưu nhưng không còn tác dụng).
- Tên Kế toán trưởng vẫn được nhập trong Cài đặt và vẫn in trên sổ quỹ, báo cáo chi phí và biên bản kiểm quỹ.

## Nhập Excel công trình (01/10/2026, nhánh `feature/import-excel-cong-trinh`)

### Thêm
- **`scripts/import-excel-chiphi.js`**: nhập nhiều file `ChiPhi_CongTrinh_*.xlsm` (NHATKYCHUNG → dòng chi phí theo phiếu, SO_QUY → sổ thu
  chi, DM_* → danh mục gộp hợp nhất) với `--dry-run` (không ghi gì, báo cáo), `--apply` (sao lưu `truoc-import-excel`, một giao dịch, đối
  chiếu trước khi chốt), `--rollback <mã lần nhập>` (vào Thùng rác). Dấu vân tay từng dòng nguồn → chạy lại không nhân đôi. Làm sạch theo
  quy tắc: dòng khoán (chỉ có Thành tiền), mã CT / mã nhà thiếu hoặc sai, Loại CP suy ra, NCC khác hoa / thường, hạng mục trùng mã khác
  nghĩa, số phiếu giả / chữ thường, ngày hoán đổi, nhà mẫu thừa, khoản sổ quỹ đã có trong Sổ thu chi… Mọi chỗ sửa / suy ra / bỏ qua đều có
  trong báo cáo kèm số dòng gốc.
- **`scripts/so-ky-vong-excel.js`**: tính số kỳ vọng (số dòng, tổng tiền, sổ quỹ) thẳng từ XML của file Excel, độc lập với ExcelJS và với
  công cụ nhập — dùng để đối chiếu.
- `lib/importCongTrinh.js` (lõi), `Store.commitChecked()` (ghi trạng thái mới trong một giao dịch, kiểm tra trên dữ liệu đọc lại trước
  khi COMMIT), kiểm thử `tests/i-import-excel.test.js`, hướng dẫn mục 18, báo cáo `import-bao-cao/BAO_CAO_IMPORT.md`.

## Lưu dữ liệu bằng SQLite (01/10/2026, nhánh `feature/chuyen-sqlite`)

Chỉ đổi **cách lưu dữ liệu**: không thêm tính năng nghiệp vụ, không đổi cách tính. Đối chiếu với bản JSON trên dữ liệu thật: mọi bản ghi,
mọi con số báo cáo và từng ô của mọi file Excel xuất ra giống hệt (148/148 hạng mục, xem `BAO_CAO_CHUYEN_SQLITE.md`).

### Thay đổi
- Dữ liệu nằm ở **`data/ketoan.db`** (SQLite có sẵn trong Node.js — `node:sqlite`, không cần thư viện biên dịch). Lược đồ phiên bản 4
  (`PRAGMA user_version`), bảng có kiểu cột và chỉ mục; thiết kế ở `docs/THIET_KE_SQLITE.md`.
- **Tự chuyển** từ `data/ketoan.json` lần đầu chạy: sao lưu file JSON (`backups/ketoan-…-truoc-khi-chuyen-sqlite.json`, không bao giờ tự
  xóa), dựng file tạm trong một giao dịch, đối chiếu toàn bộ bản ghi và mọi tổng số trước khi ghi; lệch thì dừng và giữ nguyên file
  JSON. Báo cáo ở `data/migrate-bao-cao.txt`. File gốc đổi tên `ketoan.json.da-chuyen-sqlite.bak`. Chạy lại không chuyển lần hai.
- Mỗi lần lưu là **một giao dịch** (trọn vẹn hoặc không có gì); chỉ ghi các dòng thay đổi. Lưu lỗi (ổ đầy, file bị khóa) → báo rõ
  “CHƯA được ghi” và dữ liệu trên màn hình trở về đúng trạng thái đã lưu. Chương trình khác ghi chen vào file → phát hiện, nạp lại,
  không ghi đè (HTTP 409).
- Sao lưu tự động là file `.db` nhất quán (`VACUUM INTO`); vẫn khôi phục được các bản `.json` cũ. File `.db` hỏng khi khởi động → tự lấy
  bản sao lưu gần nhất, giữ file hỏng.
- Cài đặt → **Tải bản sao lưu chỉ dữ liệu** nay là file `.db`; thêm **Xuất dữ liệu ra file .json** (để quay lại bản cũ); bản đầy đủ
  `.zip` chứa cả `ketoan.db` lẫn `ketoan.json`; **Khôi phục** nhận `.db`, `.json`, `.zip`, kiểm tra file trước khi thay.
- Yêu cầu **Node.js ≥ 24.16.0 (dòng 24) hoặc ≥ 26.1.0**; `KhoiDong.bat` và `server.js` báo lỗi tiếng Việt kèm cách cài.
- Hướng dẫn sử dụng: mục 7, 8 cập nhật; mục 17 mới (chuyển đổi, kiểm tra, **kế hoạch quay lại bản JSON**).

### Tệp mới
`lib/db.js`, `lib/migrate.js`, `lib/node-version.js`, `docs/THIET_KE_SQLITE.md`, `BAO_CAO_CHUYEN_SQLITE.md`, `tests/doi-chieu-sqlite.js`,
`tests/s1…s5-sqlite-*.test.js`.

## Nhóm 1 — Độ chính xác và truy vết (30/09/2026, nhánh `feature/truy-vet-chinh-xac`)

Dữ liệu nâng từ **schema 2 lên schema 3**: tự sao lưu trước khi nâng (`backups/ketoan-…-truoc-nang-cap-v3.json`), không bản ghi cũ
nào bị đổi, chạy lại nhiều lần không nhân đôi. Chưa dùng tính năng mới thì mọi con số báo cáo giống hệt bản trước (ca kiểm thử N0).

### Thêm
- **Nhật ký thay đổi** (`data/nhat-ky.jsonl`, chỉ ghi thêm): mọi thêm / sửa / xóa, nhập Excel, khôi phục, khóa sổ, kiểm quỹ, đính kèm…
  kèm thời điểm, người thao tác, giá trị trước / sau. Màn hình xem và lọc (ngày, thao tác, loại dữ liệu, bản ghi, từ khóa); nút “Lịch sử”
  trong form sửa. Dữ liệu cũ có một mục “Khởi tạo từ dữ liệu cũ”.
- **Người đang dùng máy này** (Cài đặt) để nhật ký ghi ai thao tác.
- **Xóa mềm + Thùng rác** cho dòng sổ, phiếu nhập, dòng chi phí, mọi danh mục, biên bản kiểm quỹ, chứng từ: khôi phục nguyên trạng
  (có kiểm tra xung đột mã / danh mục đã xóa / tháng khóa), xóa vĩnh viễn có xác nhận và ghi nhật ký.
- **Trạng thái chứng từ Nháp → Đã ghi sổ** cho dòng thu chi và phiếu nhập chi phí: nháp không tính vào tồn quỹ, báo cáo, công nợ,
  file Excel; nhãn “Nháp”, bộ lọc trạng thái, nút ghi sổ trên dòng.
- **Khóa sổ theo tháng**: chặn thêm / sửa / xóa / khôi phục / ghi sổ nháp; mở khóa bắt buộc lý do; nhập Excel bỏ qua tháng khóa
  (chế độ thay thế giữ nguyên dữ liệu tháng khóa); dòng tháng khóa có ổ khóa, form chỉ xem.
- **Cần xử lý**: tự phát hiện nghi trùng, đơn giá lệch (ngưỡng mặc định 30%), ngày bất thường, vật tư chưa xác định / chưa phân loại,
  thiếu hạng mục / mã lạ, nháp để lâu (mặc định 7 ngày), số tiền âm / 0, kiểm quỹ chênh lệch. Mở để sửa, Bỏ qua (có nhật ký),
  số việc trên menu và Tổng quan.
- **Kiểm quỹ**: nhập số đếm thực tế (hoặc bảng kê mệnh giá), chênh lệch so với tồn quỹ theo sổ, lịch sử, in biên bản kiểm kê quỹ A4,
  xuất Excel biên bản.
- **Đính kèm chứng từ** (ảnh JPG/PNG/WEBP, PDF, ≤ 10 MB) vào dòng sổ, dòng chi phí, phiếu nhập; lưu ở `data/attachments/`, tên file
  do phần mềm đặt, kiểm tra nội dung file, không ghi đè; kẹp giấy trong sổ.
- **Bản sao lưu đầy đủ (.zip)**: dữ liệu + chứng từ + nhật ký; khôi phục từ `.zip` chép lại chứng từ (chỉ nhận đúng dạng tên file).

### Thay đổi
- Nút Xóa ở mọi nơi nay chuyển vào Thùng rác (hộp xác nhận nói rõ).
- Gửi dữ liệu quá lớn nay nhận thông báo 413 rõ ràng thay vì bị cắt kết nối.
- Menu thu gọn thêm ở màn hình thấp để thêm mục “Kiểm soát”.

### Tệp mới
`lib/audit.js`, `lib/traceApi.js`, `lib/cashCountApi.js`, `lib/attachApi.js`, `public/js/attach.js`, `public/js/views/control.js`,
`public/js/views/cash-count.js`, `tests/n1…n7-*.test.js`, `tests/so-lieu-moc.js`, `tests/fixtures/moc-so-lieu-nhom1.json`, `.gitignore`.

## Trước đó
- Lượt rà soát giao diện (UI/UX): xem `BAO_CAO_UI_UX.md`.
- Kiểm thử lượt 1, lượt 2 và các sửa lỗi: xem `BAO_CAO_KIEM_THU_LUOT1.md`, `BAO_CAO_KIEM_THU_LUOT2.md`.
