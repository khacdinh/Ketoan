# BÁO CÁO RÀ SOÁT VÀ SỬA GIAO DIỆN (UI/UX)

Phần mềm: Sổ Thu Chi (thư mục `Ketoan`, trước đây `KeToan2`) · Ngày: 30/09/2026
Phạm vi: mọi màn hình của sổ thu chi cũ và phần chi phí công trình mới. **Chỉ sửa giao diện và trải nghiệm**: không đổi cách tính, cấu trúc dữ liệu, API. Kiến trúc giữ nguyên (web thuần + Tailwind v4, font Archivo, icon Phosphor, không thêm thư viện chạy).

## 0. Tóm tắt

| | Trước khi sửa | Sau khi sửa |
|---|---|---|
| Vấn đề tìm thấy | **40** (4 cao, 20 trung bình, 16 thấp; không có mức nghiêm trọng) | **35 đã sửa** (4 cao, 19 trung bình + 1 sửa một phần, 11 thấp), 4 để lại kèm lý do (mục 5) |
| axe-core (WCAG 2.0/2.1 A + AA), 14 màn hình × 2 trạng thái dữ liệu | **5 loại vi phạm, 36 lượt** trên 14/14 màn hình (tương phản, ARIA sai vai trò, ô chọn file không nhãn, thuộc tính ARIA không hợp lệ, vùng cuộn không dùng được bàn phím) | **0 vi phạm** |
| Tràn ngang cả trang (14 màn hình × 4 cỡ × 3 trạng thái = 168 lần đo) | 1 (390 px, Tổng hợp chi phí, dữ liệu lớn: +16 px) | **0** |
| Lỗi JavaScript / console | 0 | 0 |
| Thanh điều hướng ở 1366×768 | thiếu 118 px, 2 mục cuối (Danh mục chi phí, Cài đặt) bị khuất | vừa đủ 14 mục + ô tồn quỹ, không phải cuộn |
| Bảng rộng hơn khung ở 1366×768 | 6 bảng (Sổ thu chi +84 px, Dự án +198, Sổ chi phí +243, Chi tiết nhóm +24, Công nợ +110, Giá vật tư +303) | 4 bảng còn cuộn ngang (Sổ thu chi và Chi tiết nhóm hết tràn), **có bóng mờ ở mép** báo còn cột và cuộn được bằng bàn phím |
| `npm test` | 97 ca: 95 đạt, 1 bỏ qua, **1 không đạt** (G1: ngưỡng thời gian xuất Excel 20.000 dòng, do máy chậm — không liên quan giao diện) | **97 ca: 96 đạt, 0 không đạt**, 1 bỏ qua (ca cài thư viện cần mạng) |

Ảnh trước/sau: `ui-review/before/` và `ui-review/after/` (mỗi thư mục: `<trạng thái>/<cỡ màn hình>/<màn hình>.png`, trạng thái `trong` = chưa có dữ liệu, `mau` = dữ liệu thật hiện tại, `lon` = 1.500 dòng sổ + 1.200 dòng chi phí; cỡ 1366x768, 1920x1080, 768x1024, 390x844). Số đo tự động ở `bao-cao.json` mỗi thư mục. Bản in PDF ở `ui-review/before/in/` và `ui-review/after/in/`. Chụp lại bằng `node ui-review/chup-anh.js after` (cần Playwright; axe-core là devDependency).

## 1. Giả định (làm tự chủ, không hỏi lại)

1. Người dùng chính làm việc trên **laptop Windows 1366×768 hoặc màn hình 1920×1080**, trình duyệt Chrome/Edge. Cỡ 768 và 390 được đảm bảo "dùng được, không vỡ bố cục" chứ không thiết kế riêng cho điện thoại.
2. **Quy ước thuật ngữ nút bấm** (áp dụng thống nhất, ghi lại để các lần sửa sau theo):
   - **Ghi sổ** = tạo mới một nghiệp vụ vào sổ (Ghi thu / chi, Ghi sổ, Ghi sổ và ghi tiếp, Ghi vào sổ chi phí). Thông báo: "Đã ghi…".
   - **Lưu thay đổi** = sửa cái đã có (dòng sổ, phiếu, danh mục); **Lưu thông tin** = cài đặt.
   - **Thêm …** = thêm vào danh mục (Thêm dự án, Thêm nhà cung cấp, Thêm hạng mục…).
   - **Nhập** = nhập dữ liệu từ file Excel và danh từ "phiếu nhập" (thuật ngữ nghiệp vụ); lời nhắc "Nhập nội dung…" nghĩa là gõ vào ô (cách nói thông thường, giữ nguyên).
   - **Xuất Excel** cho mọi nút xuất file (bỏ "Xuất báo cáo").
3. Khi ở chế độ dữ liệu lớn, bảng sổ vẫn vẽ 500 dòng mỗi lần như lượt 2 (không đổi).
4. Kiểm thử chạy trên Linux + Chromium (Playwright). Font Archivo tải cục bộ nên hiển thị như trên Windows; riêng **máy in thật chưa kiểm được** (mục 7).

## 2. Danh sách vấn đề

Mức: **Cao** = dễ nhập sai / mất thao tác / không dùng được; **Trung bình** = gây chậm, khó hiểu, vi phạm WCAG AA; **Thấp** = thẩm mỹ, nhất quán.

### A. Nhập liệu và bàn phím

| # | Màn hình | Vấn đề | Mức | Đã sửa? | Cách sửa |
|---|---|---|---|---|---|
| A1 | Form Ghi thu / chi | Lỗi (thiếu nội dung, số tiền sai, mã chưa có) **chỉ hiện ở thông báo góc dưới 6 giây**, đè lên nút Lưu; cạnh ô chỉ có viền đỏ, không có chữ; trình đọc màn hình không biết ô nào sai | Cao | Có | Lời nhắc hiện **ngay dưới ô sai** (icon + chữ đỏ, `role=alert`, `aria-invalid`, `aria-describedby`), con trỏ nhảy vào ô; sửa là tự mất. Hàm dùng chung `fieldError()` trong `ui.js` |
| A2 | Form Ghi thu / chi | Thứ tự báo lỗi không theo thứ tự ô trên màn hình (số tiền trước nội dung, mã dự án sau cùng) → nhảy lung tung | Trung bình | Có | Kiểm theo thứ tự hiển thị: ngày → dự án → NCC → nội dung → số tiền; lời nhắc có ví dụ ("Ví dụ: 1.250.000, 50tr, 300k") |
| A3 | Form Ghi thu / chi | Ô số tiền để chữ mờ "0" trông như đã có số; gõ liền `1250000` không thấy tách nhóm cho tới khi rời ô | Trung bình | Có | Chữ mờ "VD: 1.250.000 hoặc 50tr"; dòng dưới ô luôn hiện "= 1.250.000 đ · Một triệu hai trăm năm mươi nghìn đồng" khi gõ khác dạng chuẩn |
| A4 | Mọi form lưu (thu chi, phiếu nhập, dự án, NCC, danh mục, nhập Excel) | Bấm Lưu không có dấu hiệu đang xử lý; nhập Excel file lớn chỉ có chữ "Đang đọc file", nút Gộp/Thay vẫn bấm được | Trung bình | Có | Nút chuyển "Đang ghi… / Đang lưu… / Đang nhập…" có vòng xoay, bị khóa đến khi xong (`aria-busy`); lỗi thì trả lại nút |
| A5 | Mọi hộp xác nhận xóa / thay dữ liệu | Con trỏ mặc định ở nút **Xóa** → lỡ bấm Enter là xóa | Cao | Có | Thao tác nguy hiểm: con trỏ đặt sẵn ở **Hủy**; nút Xóa có icon thùng rác |
| A6 | Phiếu nhập chi phí | Không nhắc khi đơn giá lệch bất thường so với lần mua trước (gõ thừa/thiếu số 0 là lỗi hay gặp) | Trung bình | Có | Ô đơn giá chuyển vàng + dòng "Cao hơn 900% giá lần trước" khi lệch quá 1,5 lần; rê chuột xem giá và ngày lần trước. **Chỉ nhắc, không chặn lưu.** Dùng hàm có sẵn `KT.lastPrice`, không thêm logic tính |
| A7 | Phiếu nhập chi phí | Lỗi ở đầu phiếu (thiếu công trình, NCC, hạng mục…) chỉ báo ở góc | Trung bình | Có | Báo dưới ô như A1, vẫn giữ thông báo tóm tắt (cho biết "Dòng n: …" với lỗi ở bảng) |
| A8 | Phiếu nhập chi phí | Cột Mã VT bị bóp, mã dài bị cắt ("VL-CATX…"); ở 768 px cột chỉ còn 40 px | Thấp | Có | Độ rộng tối thiểu cho Mã VT, Số lượng, Đơn giá, Hạng mục riêng, Loại CP |
| A9 | Form Dự án, NCC, 4 danh mục chi phí, sửa dòng chi phí | Lỗi thiếu mã/tên chỉ báo ở góc | Trung bình | Có | Báo dưới ô như A1 (sửa dòng chi phí giữ thêm thông báo tóm tắt) |
| A10 | Toàn bộ | Thuật ngữ nút lẫn lộn: "Lưu" / "Lưu và nhập tiếp" / "Ghi vào sổ chi phí" / "Thêm vào danh mục" / "Xuất báo cáo"; tiêu đề "Ghi thu, chi mới" khác tên nút "Ghi thu / chi" | Thấp | Có | Theo quy ước ở mục 1.2: **Ghi sổ**, **Ghi sổ và ghi tiếp**, **Thêm nhà cung cấp**, **Xuất Excel**; tiêu đề "Ghi thu / chi" |
| A11 | Thanh trên cùng, form | Phím tắt F2 chỉ có trong chú thích khi rê chuột; form không nói Esc để đóng | Thấp | Có | Nhãn **F2** trên nút Ghi thu / chi (màn ≥ 1280 px); dòng hướng dẫn form thêm "đóng bằng Esc" |
| A12 | Mọi hộp thoại | Hộp thoại tự đặt con trỏ sau 30–40 ms; nếu người dùng đã kịp bấm vào ô khác thì bị giật về ô Ngày (chữ gõ vào nhầm ô ngày) | Thấp | Có | Chỉ tự đặt con trỏ khi người dùng chưa bấm/gõ gì trong hộp thoại |

### B. Bảng

| # | Màn hình | Vấn đề | Mức | Đã sửa? | Cách sửa |
|---|---|---|---|---|---|
| B1 | Sổ thu chi, Dự án, Sổ chi phí, Chi tiết nhóm, Công nợ, Giá vật tư (1366×768) | Bảng rộng hơn khung: cột Tồn quỹ / nút thao tác / NCC bị khuất, **không có dấu hiệu còn cột bên phải** | Trung bình | Một phần | Thanh bên 212 px ở màn < 1536 px; lề ô 10 px; nút thao tác 28 px; Dự án gộp "Khởi công" vào cột Trạng thái. Sổ thu chi, Chi tiết nhóm hết tràn. Bảng còn lại: **bóng mờ ở mép** cho biết còn cột, và khung bảng nhận Tab + phím mũi tên. Không bỏ cột nào (mục 5) |
| B2 | Mọi bảng | Nút sửa/nhân bản/xóa ở cuối dòng mờ 40%, khó thấy; màn hình cảm ứng không rê chuột được | Thấp | Có | 60%, rõ hẳn khi rê chuột hoặc Tab tới dòng; màn cảm ứng luôn rõ |
| B3 | Sổ thu chi, Sổ chi phí | Ghi xong không biết dòng vừa ghi nằm đâu (sổ dài, dòng mới ở cuối) | Trung bình | Có | Dòng vừa ghi / vừa sửa **tô vàng rồi nhạt dần** (2,4 giây) và tự cuộn tới |
| B4 | Sổ chi phí | Ô "Cộng" cột Số lượng cộng lẫn nhiều đơn vị (viên + kg + cây + m3… = "37.383,5") — con số vô nghĩa, dễ đọc nhầm | Trung bình | Có | Nhiều ĐVT thì chỉ hiện tổng theo từng ĐVT ("33.900 VIÊN · 1.930 kg · …"); một ĐVT giữ như cũ |
| B5 | Danh mục chi phí | Cột Số dòng để trống còn Tổng chi phí ghi "0" cho mục chưa dùng — không đồng nhất | Thấp | Không | Chưa sửa (mục 5) |
| B6 | Giá vật tư | Cột "Biến động ±5733,3%" khó hiểu (dấu ± gợi ý dao động quanh giá, thực ra là cao nhất so với thấp nhất) | Thấp | Có | Đổi tên **Chênh giá**, bỏ ±, rê chuột thấy "Giá cao nhất …, thấp nhất …" |
| B7 | Tổng hợp chi phí | Tỷ trọng của khoản nhỏ hiện "0,0%" dù có phát sinh | Thấp | Có | Hiện "< 0,1%" |

### C. Báo cáo và in

| # | Màn hình | Vấn đề | Mức | Đã sửa? | Cách sửa |
|---|---|---|---|---|---|
| C1 | Công nợ NCC | Ô "Đến ngày" dùng ô ngày của trình duyệt: trên máy/trình duyệt tiếng Anh hiện **mm/dd/yyyy**, khác mọi màn hình khác (dd/mm/yyyy) → dễ nhầm ngày/tháng | Trung bình | Có | Dùng ô ngày chung dd/mm/yyyy (gõ `29/9`, có nút lịch, ↑↓ đổi ngày) |
| C2 | In báo cáo (sổ, công nợ, chi tiết…) | Bản in không có số trang và ngày in; in cả lời hướng dẫn thao tác "Bấm một công trình để…", "Rê chuột lên đường…" | Thấp | Có | Chân trang "Trang x / y" (Chrome/Edge 131+), "Ngày in: dd/mm/yyyy hh:mm" dưới tiêu đề; ẩn các câu hướng dẫn khi in. Phiếu thu/chi không đổi |
| C3 | Phiếu in 2 liên | Chữ "cắt theo đường này" #777 trên nền trắng 4,47:1 (dưới AA) | Thấp | Có | #595959 (7:1), "LIÊN 1/2" đậm hơn |

### D. Điều hướng

| # | Màn hình | Vấn đề | Mức | Đã sửa? | Cách sửa |
|---|---|---|---|---|---|
| D1 | Thanh bên, 1366×768 | 14 mục + ô tồn quỹ không vừa: **"Danh mục chi phí" và "Cài đặt" bị khuất**, phải cuộn trong thanh bên mà không có dấu hiệu | Cao | Có | Màn thấp (≤ 900 px) tự thu gọn khoảng cách mục, logo, ô tồn quỹ → vừa khít (đo: cần 567 px, có 567 px) |
| D2 | Thanh bên 768 / 390 px | Chỉ còn icon, tên mục chỉ hiện khi rê chuột | Thấp | Không | Giữ (máy bàn là chính; mục 5) |

### E. Hình thức, tương phản (WCAG AA ≥ 4,5:1 cho chữ thường)

| # | Màn hình | Vấn đề | Mức | Đã sửa? | Cách sửa |
|---|---|---|---|---|---|
| E1 | Thanh bên (mọi màn) | Tiêu đề nhóm "CHI PHÍ CÔNG TRÌNH" 3,77:1; "Đã lưu lúc…" 4,17:1; tên đơn vị, nhãn tồn quỹ mờ | Trung bình | Có | Màu mới `cover-ink-2` #B9CCBF → **6,27:1** |
| E2 | Phiếu thu/chi (phiếu đang chọn), Giá vật tư, Phiếu đã nhập (dòng đang chọn) | Chữ xám #667085 trên nền xanh nhạt 4,26:1 | Trung bình | Có | Dòng đang chọn dùng #4A5670 → 6,31:1 |

### F. Cỡ màn hình, thông báo

| # | Màn hình | Vấn đề | Mức | Đã sửa? | Cách sửa |
|---|---|---|---|---|---|
| F1 | Toàn bộ | Thông báo ở góc phải dưới **che nút chính** của hộp thoại (Lưu) và phiếu nhập (Ghi vào sổ chi phí) | Trung bình | Có | Thông báo ở giữa dưới; khi đang mở hộp thoại hoặc trên điện thoại thì lên đầu màn hình. Lỗi có nút đóng, để 8 giây, rê chuột thì giữ lại |
| F2 | 390 px | Tồn quỹ đầu/thu/chi/cuối xếp dọc chiếm gần hết màn hình; ô chọn lọc lệch | Thấp | Có | Lưới 2×2, ô chọn giãn đủ ngang |
| F3 | 390 px | Nút gạt "Chi tiền / Thu tiền" bị ngắt giữa chữ thành 2 dòng | Thấp | Có | Không ngắt chữ; hết chỗ thì cả nút xuống hàng |
| F4 | 390 px, dữ liệu lớn | Tổng hợp chi phí tràn ngang 16 px (bảng theo tháng với số 11 chữ số) | Thấp | Có | Bảng nằm trong khung cuộn riêng |

### G. Truy cập (bàn phím, trình đọc màn hình) và phản hồi

| # | Màn hình | Vấn đề (axe) | Mức | Đã sửa? | Cách sửa |
|---|---|---|---|---|---|
| G1 | Phiếu thu/chi | Danh sách `role=listbox` rỗng khi chưa có phiếu; các nút dùng `role=option` | Trung bình | Có | Danh sách nút thường, phiếu đang chọn có `aria-current` |
| G2 | Danh mục chi phí | 4 tab dùng `role=tablist` nhưng bên trong là nút radio | Trung bình | Có | `role=radiogroup` (như các nút gạt khác) |
| G3 | Cài đặt | Ô chọn file khôi phục không có nhãn | Trung bình | Có | `aria-label`, bỏ khỏi thứ tự Tab (đã có nút "Khôi phục…") |
| G4 | Tổng hợp chi phí, Chi tiết theo nhóm | Dòng bảng mang `aria-expanded` (không hợp lệ trong bảng thường) | Trung bình | Có | Nút bung/thu gọn trong ô đầu dòng có `aria-expanded`; bấm xong con trỏ ở lại đúng nút |
| G5 | Giá vật tư (và mọi bảng cuộn không có nút) | Vùng cuộn không dùng được bằng bàn phím | Trung bình | Có | Khung bảng tự nhận Tab (`role=region` + nhãn) khi bên trong không có gì nhận tiêu điểm |
| G6 | Toàn bộ | **Mất kết nối** (lỡ tắt cửa sổ KhoiDong.bat): chỉ có thông báo 6 giây, sau đó không còn dấu hiệu gì, người dùng tưởng đã ghi | Cao | Có | **Dải đỏ cố định đầu trang** "Mất kết nối với phần mềm. Các thay đổi chưa được lưu…" + nút **Thử lại**; kết nối lại thì tự ẩn và báo "Đã kết nối lại". Nội dung đang gõ trong form vẫn giữ nguyên |
| G7 | Cài đặt → Nhập Excel | Xem trước file lớn: chữ tĩnh "Đang đọc file" | Thấp | Có | Vòng xoay + "File lớn có thể mất vài giây…" (`role=status`) |

### H. Lỗi và trường hợp biên

| # | Màn hình | Vấn đề | Mức | Đã sửa? | Ghi chú |
|---|---|---|---|---|---|
| H1 | Toàn bộ | Máy chủ đã tắt mà bấm tải lại trang (F5) → trang trắng / trang lỗi của trình duyệt | Thấp | Không | Ngoài tầm giao diện (không có máy chủ thì không có trang). Hướng dẫn sử dụng mục 8 đã ghi cách xử lý |
| H2 | Dữ liệu trống | Các màn hình khi chưa có dữ liệu đều có lời nhắc và lối đi tiếp (Lập phiếu, nhập Excel) | — | Đạt sẵn | Ảnh `ui-review/*/trong/` |

**Tổng: 40 vấn đề** — Cao 4 (sửa 4) · Trung bình 20 (sửa 19, B1 sửa một phần) · Thấp 16 (sửa 13; B5, D2, H1 không sửa; H2 không phải lỗi, không tính).

## 3. Những gì đã thay đổi và vì sao

**Thành phần dùng chung mới** (`src/styles/app.css`, `public/js/ui.js`) — để mọi màn hình dùng cùng một cách:

| Thành phần | Dùng ở | Lý do |
|---|---|---|
| `fieldError(ô, lời nhắc)` / `.field-error` | Mọi form | Báo lỗi tại chỗ, đúng chuẩn truy cập (A1, A7, A9) |
| `busy(nút, chữ)` / `.btn[aria-busy]` | Mọi nút Lưu/Ghi/Nhập | Phản hồi đang xử lý, chống bấm hai lần (A4) |
| `.offline-bar` + `setOffline()` trong `api()` | Toàn trang | Trạng thái mất kết nối bền, có nút Thử lại (G6) |
| `#toast-root` mới (giữa dưới / đầu trang khi có hộp thoại) + nút đóng | Toàn trang | Không che nút chính (F1) |
| `.scroll-x` + tự nhận bàn phím | Mọi khung bảng | Dấu hiệu còn cột, dùng được bằng bàn phím (B1, G5) |
| `tr.flash` (từ `S.flash` trong `state.js`, so dữ liệu trước/sau lần lưu) | Sổ thu chi, Sổ chi phí | Thấy ngay dòng vừa ghi (B3). Chỉ so sánh để tô màu, không đổi dữ liệu |
| `.tree-toggle` | Bảng cây | Bung/thu gọn chuẩn truy cập (G4) |
| `.grid-entry .cell.warn` / `.price-warn` | Phiếu nhập | Cảnh báo giá lệch (A6) |
| Màu `cover-ink`, `cover-ink-2`; biến `--side-w` (232 px / 212 px ở < 1536 px); khoảng cách thanh bên theo chiều cao màn hình | Khung ứng dụng | D1, E1, B1 |
| `@page` có số trang; `.ph-date`; `.screen-hint` | In báo cáo | C2 |

Icon mới dùng: `ph-circle-notch` (vòng xoay) — đã chạy `node scripts/build-assets.js` và build CSS; `public/css/app.css`, `public/vendor/phosphor/icons.css` đã cập nhật, chạy offline như cũ.

**Tệp đã sửa:** `src/styles/app.css`, `public/css/app.css` (bản build), `public/vendor/phosphor/icons.css`, `public/index.html`, `public/js/{app,ui,state,forms,print}.js`, `public/js/views/{ledger,cost-entry,cost-ledger,cost-reports,cost-catalogs,catalogs,dashboard,settings,vouchers}.js`, `HUONG_DAN_SU_DUNG.md` (mục 3, 8, 11, 12: tên nút mới, lỗi tại ô, dòng tô vàng, cảnh báo giá, dải mất kết nối, cột Chênh giá). `public/js/shared.js` (phần tính toán) **không đổi**.

**Test:** 2 chỗ trong `tests/f-chi-phi-ui.test.js` (ca F4) sửa theo giao diện mới: (1) trước đây đặt tiêu điểm vào **dòng** nhóm rồi Enter, nay vào **nút bung/thu gọn** trong dòng đó (G4); (2) bộ chọn bảng theo tháng thêm lớp khung cuộn (F4 mục 2F). Điều được kiểm tra giữ nguyên.

## 4. Ảnh trước / sau (gợi ý xem)

| Nội dung | Trước | Sau |
|---|---|---|
| Thanh bên 1366×768 (thấy đủ Danh mục chi phí, Cài đặt) | `ui-review/before/mau/1366x768/tong-quan.png` | `ui-review/after/mau/1366x768/tong-quan.png` |
| Form ghi thu chi báo lỗi | `…/before/mau/1366x768/form-ghi-thu-chi-loi.png` | `…/after/mau/1366x768/form-ghi-thu-chi-loi.png` |
| Số tiền đang gõ | `…/before/mau/1366x768/form-ghi-thu-chi-da-go.png` | `…/after/mau/1366x768/form-ghi-thu-chi-da-go.png` |
| Phiếu nhập chi phí (mã lạ, cột Mã VT) | `…/before/mau/1366x768/phieu-nhap-co-dong.png` | `…/after/mau/1366x768/phieu-nhap-co-dong.png` |
| Hộp thoại xóa | `…/before/mau/1366x768/hop-thoai-xoa.png` | `…/after/mau/1366x768/hop-thoai-xoa.png` |
| Mất kết nối | `…/before/mau/1366x768/mat-ket-noi.png` | `…/after/mau/1366x768/mat-ket-noi.png` |
| Công nợ NCC (ô ngày) | `…/before/mau/1366x768/cp-cong-no.png` | `…/after/mau/1366x768/cp-cong-no.png` |
| Sổ chi phí (tổng số lượng) | `…/before/mau/1366x768/cp-so.png` | `…/after/mau/1366x768/cp-so.png` |
| Giá vật tư (Chênh giá) | `…/before/mau/1366x768/cp-gia.png` | `…/after/mau/1366x768/cp-gia.png` |
| Điện thoại | `…/before/mau/390x844/so-thu-chi.png`, `form-ghi-thu-chi.png` | `…/after/mau/390x844/…` |
| Bản in | `ui-review/before/in/*.pdf` | `ui-review/after/in/*.pdf` (có "Trang x / y", "Ngày in") |

## 5. Chưa làm / cần anh chị quyết định

1. **Bảng nhiều cột vẫn cuộn ngang ở 1366×768**: Sổ chi phí (10 cột), Giá vật tư (bảng lịch sử bên phải), Công nợ NCC (bảng trái khi có khung chi tiết bên phải), Dự án (10 cột). Đã có bóng mờ + bàn phím. Muốn hết hẳn thì phải **bỏ bớt hoặc gộp cột** (ví dụ gộp "Đơn giá" vào dưới "Thành tiền", ẩn "Ghi chú" dự án) — là thay đổi cách trình bày sổ quen thuộc nên chưa tự làm.
2. **B5** (Danh mục chi phí: trống hay "0") và **D2** (tên mục ở thanh bên thu gọn) — chưa sửa, ảnh hưởng nhỏ.
3. **Hai con số "Còn nợ" ở màn Công nợ NCC khác nhau** (bảng theo công trình: 1.012.626.000; phần theo NCC, tất cả công trình: 854.186.000). Không phải lỗi tính: bảng trên chỉ tính khoản trả có ghi **cả** mã dự án và mã NCC, phần dưới tính mọi khoản trả theo mã NCC (đã có dòng giải thích). Nhưng người đọc dễ hiểu nhầm. Đề xuất đổi tên cột trên thành "Còn nợ (theo khoản trả ghi đúng công trình)" hoặc đưa hai con số cạnh nhau — **cần anh chị chọn**, vì đổi chữ ở đây là đổi cách diễn giải báo cáo.
4. **Tổng số lượng cộng lẫn đơn vị** (B4) đã bỏ khỏi màn hình Sổ chi phí; hàm `costSummary().tongSL` và file Excel xuất (nếu có ô tổng số lượng) chưa đổi vì thuộc phần tính toán/xuất — ghi lại để xem xét, **không tự sửa** theo yêu cầu.
5. Không phát hiện thêm lỗi logic tính toán trong lượt này.

## 6. Kiểm thử

- Trước khi sửa: `npm test` — 97 ca: 95 đạt, 1 bỏ qua (cài thư viện cần mạng), 1 không đạt (**G1**: xuất Excel chi phí 20.000 dòng 13,7 s > ngưỡng 10 s — do máy thử đang tải nặng; lượt 2 đo 6,7 s).
- Sau khi sửa: `npm test` — **97 ca: 96 đạt, 0 không đạt, 1 bỏ qua** (9,5 phút; G1 lần này 8,8 s, dưới ngưỡng).
- Hai chỗ test phải sửa theo cấu trúc giao diện mới (không đổi điều được kiểm): F4 đặt tiêu điểm vào nút bung/thu gọn thay vì dòng (G4); F4 đọc bảng theo tháng nay nằm trong khung cuộn riêng (F4 ở mục 2F).
- Giữa chừng phát hiện và sửa 1 lỗi do chính thay đổi giao diện gây ra: nút gạt không ngắt chữ làm màn Danh mục chi phí và Chi tiết nhóm tràn ngang ở 390 px (ca F9 bắt được) → cho cả nút xuống hàng.
- Tự động: axe-core 4.10 (WCAG 2.0/2.1 A, AA) trên 14 màn hình × 2 trạng thái ở 1366×768: **0 vi phạm** (trước: color-contrast 28 lượt, aria-required-children 3, label 2, aria-conditional-attr 2, scrollable-region-focusable 1). Đo tràn ngang và lỗi console trên 168 tổ hợp: 0.
- Tỉ lệ tương phản các cặp màu mới: chữ thanh bên 6,27:1; chữ phụ dòng đang chọn 6,31:1; cảnh báo giá (nâu trên vàng nhạt) 5,70:1; lỗi (đỏ trên hồng nhạt) 5,65:1; dải mất kết nối (trắng trên đỏ) 6,54:1; "cắt theo đường này" 7:1.

## 7. Cần kiểm tra thủ công trên Windows

1. **In phiếu thu/chi ra máy in thật** (A4 dọc, 2 liên): lề, đường cắt ở giữa trang, chữ ký không bị đẩy sang trang 2. Trong hộp thoại in của Chrome/Edge: Khổ A4, Lề "Mặc định", **tắt "Đầu trang và chân trang"**, Tỷ lệ 100%.
2. **In báo cáo** (Sổ thu chi, Công nợ): khổ ngang, dòng "Trang x / y" ở chân trang (cần Chrome/Edge bản 131 trở lên; bản cũ hơn chỉ không có số trang), tiêu đề cột lặp lại mỗi trang.
3. Màn hình laptop 1366×768 với **Windows phóng chữ 125%** (mặc định trên nhiều laptop): thanh bên còn vừa không, bảng Sổ thu chi có phải cuộn ngang nhiều không.
4. Tắt cửa sổ KhoiDong.bat giữa chừng rồi bấm Ghi sổ → dải đỏ; mở lại KhoiDong.bat, bấm **Thử lại** → dải tắt, bấm Ghi sổ lại được.
5. Gõ đơn giá thừa một số 0 ở Phiếu nhập → ô vàng; lưu vẫn được.
6. Bấm Ctrl + F5 lần đầu mở sau khi cập nhật để trình duyệt tải CSS mới.
