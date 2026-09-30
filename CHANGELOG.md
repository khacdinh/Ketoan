# Nhật ký phiên bản (CHANGELOG)

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
