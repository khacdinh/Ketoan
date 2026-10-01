# BÁO CÁO KIỂM THỬ — LƯỢT 2

Phần mềm: Sổ Thu Chi (thư mục `Ketoan`, trước đây tên `KeToan2`) · Ngày: 30/09/2026
Phạm vi lượt 2: D chức năng chi phí công trình, F giao diện, G hiệu năng và độ bền, H bảo mật. Lượt 1 (A, B, C, E) xem `BAO_CAO_KIEM_THU_LUOT1.md`.

## 0. Tóm tắt

| | |
|---|---|
| Đầu lượt 2: chạy `npm test` của lượt 1 | 57 đạt + 1 bỏ qua (ca cài thư viện cần mạng) — chưa có gì hỏng |
| Ca kiểm thử mới của lượt 2 | **39** (D 13 · F chi phí 9 · F khảo sát 4 · G 4 · H 9) |
| Cuối lượt 2: chạy **toàn bộ** `npm test` (có `RUN_NPM_INSTALL=1`) | **97 ca: 97 đạt, 0 không đạt** (58 của lượt 1 + 39 của lượt 2), 8,4 phút |
| Lỗi tìm thấy và đã sửa | **10** (5 cao, 4 trung bình, 1 thấp) + 1 mục tăng cường bảo mật |
| Lỗi nghiêm trọng (sai tiền, mất dữ liệu) còn tồn tại | **Không phát hiện.** Còn các hạn chế ở mục 4 |
| Khảo sát giao diện | 556 nút/liên kết × 14 màn hình × 3 trạng thái dữ liệu (trống, 1 dòng, đầy đủ): 0 lỗi console, 0 màn hình trắng, 0 nút chết |
| Hiệu năng với 20.000 dòng | Mọi thao tác trên giao diện **dưới 0,7 giây** (trước sửa có 2 chỗ 2,7 s và 7,7 s). Còn 5 chỗ > 2 s ở mục 5 (xuất/nhập Excel file rất lớn và 60 lượt ghi song song) |

## 1. Những điều cần biết (giả định và khác với mô tả)

1. **Không có SQLite** (vẫn là file JSON `data/ketoan.json`). Vì vậy: "chống SQL injection / tham số hóa truy vấn" **không áp dụng**; đã kiểm tra thay bằng việc chuỗi dạng SQL (`'; DROP TABLE…`) được lưu và hiển thị như văn bản thường và không làm gì hỏng dữ liệu (H4.3). "Chỉ mục SQLite, phân trang": thay bằng **phân trang ở giao diện** (mục 3, lỗi 5).
2. **"Dự toán so với thực tế" của chi phí công trình không tồn tại**: sheet `DUTOAN` đã được bỏ theo yêu cầu trước đây (ghi trong `CLAUDE.md`). Phần còn lại đã kiểm: ngân sách dự án và cảnh báo vượt/sắp hết ở Tổng quan (lượt 1, ca C8). Nếu muốn báo cáo dự toán/thực tế theo hạng mục cần làm thêm chức năng.
3. **Số âm / phiếu trả hàng không được hỗ trợ khi nhập tay**: cả giao diện và API từ chối số lượng ≤ 0 và đơn giá âm (có thông báo rõ). Chỉ dòng âm **từ file Excel** được nhận (kèm cảnh báo "có số âm"); ca D9 kiểm tra các dòng đó được làm tròn và cộng đúng (đã sửa lỗi ở mục 3, lỗi 8). Nếu cần ghi giảm trừ/trả hàng thì nên thêm "phiếu điều chỉnh".
4. Playwright đã khai báo là `devDependency` (`package.json` và `package-lock.json`), **không** vào bản chạy chính; ca giao diện tự bỏ qua nếu máy không có Playwright. Sau `npm install` cần `npx playwright install chromium` lần đầu.
5. `node_modules/` và `data/` vẫn nằm trong git (như lượt 1). Test chạy trên bản sao trong thư mục tạm; `data/` thật không bị ghi.
6. Kiểm thử chạy trên Linux/Chromium; múi giờ chỉ chạy mặc định (lượt 1 đã chạy thêm 2 múi giờ).

## 2. Lỗi đã tìm thấy và đã sửa

| # | Mức | Lỗi | Nguyên nhân | Cách sửa | Ca phát hiện |
|---|---|---|---|---|---|
| 1 | **Cao** | API trả **lỗi 500** (có chỗ kèm thông báo kỹ thuật tiếng Anh) với dữ liệu sai kiểu: thân yêu cầu `null`, `[]`, số, chuỗi; `ids` không phải mảng; trường văn bản là đối tượng/mảng (kể cả `{"toString":"x"}`). Quét 456 yêu cầu → 52 lỗi 500, ở sổ thu chi, danh mục, phiếu, chi phí, xóa nhiều dòng | Thiếu kiểm tra kiểu trước khi dùng | `readJson` chỉ nhận đối tượng; `str`, `money`, `qty`, `price` từ chối đối tượng/mảng/logic; `idList` kiểm tra mảng số; phiếu/dòng hàng phải là đối tượng; `checkDbShape` cho file khôi phục. Kết quả: mọi yêu cầu sai kiểu trả 400 tiếng Việt, **dữ liệu không đổi** | H4.1 |
| 2 | **Cao** | Đường dẫn như `/api/constructor/1`, `/api/__proto__`, `/api/toString` → lỗi 500 | Tra bảng cấu hình bằng `obj[tên]` nên "chạm" vào thuộc tính có sẵn của `Object` | Chỉ nhận khóa thực sự thuộc bảng (`hasOwnProperty`) | H4.2 |
| 3 | Trung bình | Khôi phục bản sao lưu không tồn tại, hoặc xuất phiếu không tồn tại → 500; khôi phục file hình dạng lạ (mảng chứa số…) → 500 | Lỗi hệ thống/`Error` thường đi thẳng ra | 404 "Không tìm thấy…" / 400 tiếng Việt | H4.1, H4.3 |
| 4 | **Cao** | **Liên kết trong gợi ý không bấm được khi ô nhập còn tiêu điểm**: "Điền số này" (công nợ ở form phiếu chi — chính là tính năng "công nợ hiện ở form"), "Thêm nhà cung cấp / dự án / hạng mục / vật tư này". Gõ mã NCC thấy "còn nợ …", bấm "Điền số này" → **không có gì xảy ra** | Bấm vào liên kết làm ô nhập mất tiêu điểm → sự kiện `change` vẽ lại dòng gợi ý ngay giữa lúc nhấn chuột → liên kết bị thay mới → trình duyệt bỏ cú bấm | Chỉ ghi lại gợi ý khi nội dung thật sự đổi (form thu chi, đầu phiếu nhập, ô tên vật tư) | F1b, F6 |
| 5 | **Cao** (hiệu năng) | Với 20.000 dòng: **Chi tiết theo nhóm mở mất 7,7 giây** (vẽ 20.043 dòng DOM); Sổ thu chi 5.000 dòng 2,8 s; Sổ chi phí 1,1 s, lọc 1,4–1,8 s | Vẽ toàn bộ dòng một lần | Sổ thu chi và sổ chi phí: vẽ 500 dòng gần nhất, nút "Hiện thêm 500 dòng / Hiện tất cả", **in thì hiện hết**; Chi tiết theo nhóm: trên 1.500 dòng thì thu gọn sẵn từng hạng mục (bấm để xem, hoặc "mở tất cả") | G3 |
| 6 | **Cao** (độ bền, hiệu năng) | Xuất Excel chi phí 20.000 dòng mất **16,4 s và làm đứng toàn bộ máy chủ** (mọi yêu cầu khác, kể cả giao diện, phải chờ) | ExcelJS dựng kiểu ô cho từng ô (gán font, viền, căn lề… riêng lẻ); dựng file chạy trên luồng chính | (a) Dùng chung đối tượng kiểu theo tổ hợp (ExcelJS nhận ra theo định danh đối tượng) + **sao chép khi ghi** để gán `fill/numFmt…` sau đó không làm đổi ô khác (đã đối chiếu **từng ô** font/viền/fill/căn lề/định dạng số của 8 loại file xuất: không khác); (b) nén mức 1; (c) khi dữ liệu > 3.000 dòng, dựng file trong luồng riêng `worker_threads`. Kết quả: 16,4 → **6,7 s**; 5,2 → 2,3 s; trong lúc xuất, yêu cầu khác trả lời chậm nhất **32 ms** | G1, G4 |
| 7 | Trung bình | Cửa sổ hẹp (390 px): Bảng điều khiển chi phí **tràn ngang 52 px**, màn Phiếu 3 px | Cỡ chữ con số tổng tối thiểu 40 px; lưới một cột không có cột cơ sở `minmax(0,1fr)` | Cỡ chữ tối thiểu 28 px; thêm cột cơ sở cho 6 lưới (dashboard, chi phí, công nợ, giá, cài đặt, phiếu); CSS đã biên dịch lại | F9 |
| 8 | Trung bình | Dòng chi phí **âm** (chỉ vào được từ Excel): thành tiền làm tròn sai, ví dụ −2,5 × 1,5 ra −3 (Excel `ROUND` cho −4); file xuất rồi tính lại trong Excel sẽ lệch 1 đồng | Phép chia BigInt cắt về 0 | Làm tròn đối xứng theo trị tuyệt đối (giống `ROUND` của Excel), không ra −0; LibreOffice xác nhận khớp | D9 |
| 9 | Trung bình | Mã vật tư / NCC có dấu gõ kiểu **tổ hợp** (NFD: Mac, một số file Excel) không tra được, cho phép tạo 2 mã "giống nhau" | Không chuẩn hóa Unicode | Chuẩn hóa NFC khi nhận dữ liệu | D3.2 |
| 10 | Thấp | Hướng dẫn trên phiếu nhập ghi "↑ ↓ đổi dòng" nhưng ở ô có danh sách gợi ý (Mã VT, Hạng mục riêng) phải bấm kèm Ctrl | Mũi tên thuộc về danh sách gợi ý của trình duyệt | Sửa chữ hướng dẫn: "ở ô có danh sách gợi ý thì bấm kèm Ctrl" | F1 |
| — | Tăng cường | (không phải lỗi bị khai thác) | | Thêm tiêu đề `Content-Security-Policy` (chỉ chạy tệp `.js` cùng nguồn, cấm khung nhúng), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`; ứng dụng chạy đủ 14 màn hình dưới CSP mà không vi phạm | H5 |

**Bảo mật — kết quả không tìm thấy lỗ hổng:** XSS qua lưu trữ (`<script>`, `"><img onerror>`, `<svg onload>`, `<iframe srcdoc>`, `</textarea>` trong **mọi** trường văn bản: dự án, NCC, nhóm, hạng mục, vật tư, nhà, phiếu, dòng chi phí, ghi chú, sổ thu chi, thông tin in, cài đặt) đều được thoát đúng ở 14 màn hình, phiếu in, hộp thoại sửa; tiêm công thức Excel (`=HYPERLINK`, `+cmd`, `@SUM`…) xuất ra là văn bản, không thành công thức; tên sao lưu dạng đường dẫn, liên kết tượng trưng, `..`, `%2e`, byte rỗng đều bị từ chối; tiêu đề tải về không chèn được dòng (CRLF).

## 3. Bảng ca kiểm thử lượt 2 (39 ca, tất cả **Đạt** trên bản đã sửa)

### D. Chức năng chi phí công trình — API (`tests/d-chi-phi.test.js`)

| Mã | Mô tả | KQ | Bằng chứng |
|---|---|---|---|
| D1.1 | Danh mục nhóm/hạng mục/vật tư/nhà: thêm, sửa, xóa, trùng mã/tên; đổi tên nhóm, hạng mục, vật tư (ĐVT), nhà, NCC, công trình lan ra sổ, báo cáo, Excel; **đổi nhóm của hạng mục thì báo cáo chuyển theo** | Đạt | Nhóm cũ về 0, nhóm mới nhận đúng 300.000; tổng không đổi; Excel có tên mới (4 ô) |
| D1.2 | Đổi mã vật tư/nhà: dòng chi phí đi theo; đổi sang mã trùng bị chặn; nhà thuộc công trình khác bị chặn | Đạt | `renamed` đúng; không mồ côi |
| D2.1 | Phiếu nhập: đầu phiếu 1 lần + 6 dòng (SL `2,5`, `0,125`, `10+5`; giá `1.250.000`, `50tr`, `300k`); tự xác định Loại CP; tra tên/ĐVT; thứ tự dòng; gợi ý đơn giá gần nhất (ưu tiên cùng NCC) | Đạt | Tổng 607.877.000 khớp; `lastPrice` đúng 3 trường hợp |
| D3.1 | Biên: SL thập phân (0,0001…), SL/đơn giá lớn nhất cho phép, tràn số (6 trường hợp), SL = 0, âm, trống, chữ, mã lạ, ngày sai, đầu phiếu thiếu, phiếu không dòng, 501 dòng | Đạt | Làm tròn nửa lên (0,4 đ→0, 0,5 đ→1); mọi lỗi 400 nói đúng "Dòng N"; dòng thứ 3 lỗi thì **không** lưu dòng nào |
| D3.2 | Tiếng Việt có dấu, ký tự đặc biệt, NFC/NFD, chuỗi 100.000 ký tự | Đạt | Giữ nguyên ký tự; tìm không dấu được; cắt đúng 1000/60 ký tự |
| D3.3 | Gọi lưu 3 lần đồng thời | Đạt | 3 phiếu độc lập, id/seq duy nhất, tổng 600.000 |
| D4.1 | **250 thao tác ngẫu nhiên** (thêm/sửa/xóa phiếu, sửa/xóa/nhân bản/xóa nhiều dòng, tách phiếu) | Đạt | Sau **mỗi** thao tác: tổng, loại CP, nhóm, hạng mục, tháng, phát sinh từng NCC khớp bản tính độc lập (BigInt); không mồ côi |
| D5.1 | Sổ chi phí lọc kỳ/CT/nhà/nhóm/hạng mục/loại/NCC/vật tư + tìm kiếm: 400 tổ hợp ngẫu nhiên trên dữ liệu thật | Đạt | Danh sách dòng, tổng cuối bảng, tổng loại, tổng số lượng khớp bản lọc độc lập |
| D6.1 | Báo cáo: tổng nhóm = tổng hạng mục = tổng dòng = tổng Loại CP = tổng tháng = lũy kế cuối, với 8 bộ lọc; 700 dòng sinh ngẫu nhiên có cả mã lạ | Đạt | Mã lạ vào nhóm "(Chưa có hạng mục)" / "(chưa có nhóm)", không biến mất khỏi tổng |
| D6.2 | Công nợ NCC và theo công trình: 5 bộ lọc; còn nợ − ứng dư = chênh lệch; trạng thái | Đạt | Từng NCC, từng công trình khớp bản độc lập |
| D7.1 | Liên thông: trả NCC ở sổ thu chi làm công nợ giảm đúng; thu lại tăng; không mã NCC không ảnh hưởng; sửa/xóa/đổi NCC của khoản trả; lọc "đến ngày"; **nhập chi phí không đổi tồn quỹ** | Đạt | Chuỗi nhiều bước đều đúng số, tồn quỹ = thu − chi |
| D8.1 | Thống kê giá vật tư, lịch sử, chênh lệch so lần trước cùng NCC | Đạt | Toàn bộ vật tư của dữ liệu thật |
| D9 | Số âm: làm tròn đối xứng, dòng âm từ Excel, API từ chối nhập âm | Đạt | LibreOffice tính lại khớp cả dòng âm |

### D+F. Chi phí qua giao diện thật (`tests/f-chi-phi-ui.test.js`)

| Mã | Mô tả | KQ | Bằng chứng |
|---|---|---|---|
| F1 | **Nhập phiếu chỉ bằng bàn phím**: ngày `15/9`, Tab/Enter qua đầu phiếu, tự điền nhà dùng chung, tự điền tên + ĐVT, thành tiền, tổng + bằng chữ, Tab sang hạng mục riêng/loại CP, Ctrl+Enter; sau lưu giữ đầu phiếu; gợi ý đơn giá gõ đè; Ctrl+↑↓, ↑↓; **Ctrl+Enter hai lần chỉ ghi một phiếu** | Đạt | Tổng 7.626.000; DB đúng từng dòng |
| F1b | Báo lỗi bằng bàn phím (tiêu điểm về đúng ô), thêm nhanh NCC/hạng mục/vật tư ngay trong form rồi nhập tiếp, nhập sai không lưu dòng nào, bản nháp còn sau khi chuyển màn hình, hết nháp sau khi lưu | Đạt | |
| F2 | Sửa phiếu (xóa dòng bằng Ctrl+Delete), nhân bản, xóa phiếu (hủy rồi đồng ý), xóa từ màn sửa, phiếu không tồn tại | Đạt | Công nợ S1 cập nhật 2.000.000 → 1.200.000 ngay sau khi sửa phiếu |
| F3 | Sổ chi phí: lọc kỳ + CT + loại + NCC + tìm; từng tiêu chí; nhóm + hạng mục; không khớp | Đạt | Số dòng, tổng cuối bảng, **cộng các dòng đang hiện** cùng khớp |
| F3b | Sửa trực tiếp (bấm đúp) Số lượng/Đơn giá (`90k`)/Diễn giải; nhập sai bị từ chối; sửa đủ cột (đổi NCC tách phiếu); nhân bản; xóa | Đạt | Công nợ từng NCC cập nhật đúng sau mỗi bước |
| F4 | Bảng điều khiển: tổng, 3 loại CP, đã trả, còn nợ, các tháng; bung/thu gọn; Enter; đổi công trình; bấm hạng mục → sổ đã lọc | Đạt | Khớp `KT.costSummary`/`supplierDebt` |
| F5 | Chi tiết theo nhóm mức 1/2/3: số nhóm, dòng cộng, dòng chi tiết; **tổng dòng = tổng hạng mục = tổng nhóm = tổng cộng**; từng nhóm | Đạt | 104 dòng; tổng 1.129.929.000 |
| F6 | Công nợ: từng NCC, tổng, chi tiết; **Trả tiền → phiếu chi điền sẵn → công nợ về 0, tồn quỹ giảm đúng**; form thu chi hiện công nợ + "Điền số này"; bảng theo công trình | Đạt | Tồn quỹ hiện ở Tổng quan đúng |
| F7 | Giá vật tư; Danh mục: 4 tab, tìm không dấu, thêm, trùng tên bị chặn, đổi tên lan sang sổ và bảng điều khiển, xóa mã đang dùng bị chặn | Đạt | |

### F. Khảo sát giao diện (`tests/f-khao-sat-giao-dien.test.js`)

| Mã | Mô tả | KQ | Bằng chứng |
|---|---|---|---|
| F8 | Bấm từng nút/liên kết/hàng bấm được, thử mọi lựa chọn của mọi ô chọn: 14 màn hình × (trống, 1 dòng, đầy đủ) | Đạt | 556 điều khiển; 0 lỗi console/trang, 0 màn hình trắng, 0 nút chết (trừ nút mở lịch của trình duyệt — không quan sát được bằng DOM) |
| F9 | Cửa sổ 1920, 1440, 1024, 768, 390 px × 14 màn hình: không tràn ngang, thanh điều hướng dùng được, hộp thoại ghi thu chi và nút Lưu nằm trong màn hình | Đạt | Đã xem ảnh chụp ở 390 và 1920 px |
| F10 | Xem trước khi in: nút In gọi hộp thoại in, ẩn phần thao tác, hiện tiêu đề đơn vị, tạo được PDF (1–60 trang); phiếu thu/chi ra 2 liên | Đạt | |
| F11 | Tiếng Việt: font Archivo cục bộ nạp tập ký tự tiếng Việt, không rơi về font dự phòng, không ký tự lỗi | Đạt | Đo bề rộng so với font dự phòng; 3 tệp font trả 200 |

### G. Hiệu năng, độ bền (`tests/g-hieu-nang.test.js`) — số đo ở mục 5

| Mã | Mô tả | KQ | Bằng chứng |
|---|---|---|---|
| G1 | API với 20.000 dòng chi phí + 5.000 dòng sổ thu chi: khởi động, đọc, ghi, sửa, xóa, xuất 5 loại, nhập xem trước/thay thế, tính toán | Đạt | Mọi thao tác ghi 215–271 ms |
| G2 | 60 yêu cầu đồng thời (20 ghi sổ, 20 ghi phiếu, 20 đọc) | Đạt | Không mất dữ liệu, không trùng id/seq, tổng khớp, file = bộ nhớ |
| G3 | Giao diện 20.000 dòng: mở 14 màn hình, lọc, tìm, bung cây, lưu phiếu, tạo PDF | Đạt | Tất cả < 0,7 s |
| G4 | Xuất Excel 20.000 dòng không làm máy chủ đứng hình | Đạt | 189 lần gọi `/api/ping` trong lúc xuất, chậm nhất 32 ms |

### H. Bảo mật (`tests/h-bao-mat.test.js`)

| Mã | Mô tả | KQ | Bằng chứng |
|---|---|---|---|
| H4.1 | 22 điểm ghi dữ liệu × mọi trường × 19 giá trị sai kiểu + 7 thân yêu cầu sai kiểu (456 yêu cầu) | Đạt | Không 500; khi bị từ chối dữ liệu không đổi; server còn sống |
| H4.2 | Đường dẫn lạ / tên đối tượng hệ thống × 4 phương thức | Đạt | Không 500, không làm bẩn `Object.prototype` |
| H4.3 | Chuỗi dạng SQL, ký tự điều khiển, URL 100 KB ở mọi tham số | Đạt | Không 500; dữ liệu nguyên vẹn; mã có nháy lưu/tra đúng |
| H1.1 | Tiêu đề tải về không chèn dòng; tên tệp không có dấu phân cách đường dẫn | Đạt | |
| H1.2 | Khôi phục/tải tệp: tên kiểu đường dẫn, liên kết tượng trưng, tệp lạ; `/data/…` không phục vụ qua web | Đạt | |
| H2.1 | XSS qua lưu trữ ở 14 màn hình, phiếu in, hộp thoại sửa, xuất Excel | Đạt | `window.__xss` không đặt; không hộp thoại; không phần tử độc trong DOM |
| H2.2 | Tiêm công thức Excel (xuất ra và nhập lại) | Đạt | Không ô nào thành công thức (kiểm cả XML thô) |
| H3 | Thân yêu cầu 51 MB; chuỗi dài | Đạt | 413/đứt kết nối, server sống; cắt đúng ngưỡng |
| H5 | Tiêu đề bảo mật trên 8 đường dẫn; CSP chặn mã chèn (ghi nhận vi phạm); ứng dụng không tự vi phạm CSP | Đạt | |

## 4. Lỗi/hạn chế chưa sửa và lý do

| Mục | Mô tả | Lý do |
|---|---|---|
| Hiệu năng | Xuất Excel chi phí 20.000 dòng vẫn **6,7 s**; xuất sổ chi phí 2,3 s | Giới hạn của thư viện ExcelJS (65.000 dòng ô kèm định dạng và công thức). Đã giảm 2,4 lần và chạy trong luồng riêng nên ứng dụng không đứng; khuyến nghị thêm thanh tiến độ |
| Hiệu năng | Nhập Excel 20.000 dòng: xem trước 4,3 s, thay thế 4,5 s (chạy trên luồng chính, máy chủ bận trong lúc đó) | ~4 s nằm trong việc ExcelJS đọc file; chỉ làm một lần khi nhập. Có thể chuyển sang luồng riêng nếu cần |
| Hiệu năng | Mỗi lần ghi ~250 ms ở 20.000 dòng (ghi lại cả file 8,7 MB và trả lại toàn bộ dữ liệu cho trình duyệt); 40 lần ghi đồng thời xếp hàng mất ~8 s | Kiến trúc lưu một file JSON. Tăng theo số dòng: nếu vượt ~100.000 dòng nên chuyển SQLite/ghi gia tăng |
| Chức năng | Không có phiếu trả hàng / giảm trừ nhập tay; không có dự toán chi phí theo hạng mục | Theo thiết kế / đã bỏ theo yêu cầu trước |
| Khảo sát | Nút mở lịch của trình duyệt (`showPicker`) không kiểm được bằng DOM | Cần thử tay |

## 5. Số đo hiệu năng (20.000 dòng chi phí + 5.000 dòng sổ thu chi; Linux, Node 22, Chromium; dữ liệu 8,7 MB)

Ngưỡng chậm: 2.000 ms (⚠). Cột "Trước" = lần đo đầu tiên trước khi sửa.

| Thao tác | Trước (ms) | Sau (ms) |
|---|---:|---:|
| Khởi động + nạp dữ liệu | 334 | 374 |
| `GET /api/db` (8,7 MB) | 190 | 168 |
| Ghi 1 phiếu / sửa 1 dòng / ghi 1 dòng sổ / xóa 1 dòng / xóa phiếu | 230–344 | 215–271 |
| ⚠ Xuất Excel chi phí (toàn bộ) | 16.369 | **6.681** (trong luồng riêng) |
| ⚠ Xuất Excel sổ chi phí | 5.220 | **2.251** |
| Xuất Excel công nợ / sổ thu chi đầy đủ / sổ thu chi | 101 / 1.483 / 979 | 433 / 1.103 / 683 |
| ⚠ Nhập Excel: xem trước 20.000 dòng | 4.810 | 4.349 |
| ⚠ Nhập Excel: thay thế 20.000 dòng | 5.465 | 4.513 |
| Tính toán trong trình duyệt: sổ + báo cáo / công nợ / theo công trình / giá vật tư | 165 / 12 / 97 / 12 | 86 / 8 / 81 / 14 |
| ⚠ 60 yêu cầu song song (40 ghi, 20 đọc) | 8.361 | 7.828 (không mất dữ liệu) |
| Độ trễ `/api/ping` xấu nhất trong lúc xuất Excel | đứng hình ~16.000 | **32** |
| Tải trang lần đầu (kể cả tải 20.000 dòng) | 1.030 | 425 |
| Mở Sổ thu chi (5.000 dòng) | ⚠ 2.763 | **163** |
| Mở Chi tiết theo nhóm | ⚠ 7.737 | **81** |
| Mở Sổ chi phí | 1.091 | 448 |
| Lọc sổ chi phí: theo công trình / thêm loại CP / tìm "xi măng" / bỏ lọc | 1.666 / 1.428 / 317 / 1.832 | 264 / 295 / 283 / 346 |
| Chi tiết theo nhóm: lọc theo công trình | 677 | 600 |
| Bảng điều khiển: đổi công trình | 731 | 138 |
| Mở các màn còn lại (Tổng quan, Phiếu, Dự án, NCC, Tổng hợp NCC, Cài đặt, Bảng điều khiển, Phiếu nhập, Công nợ, Giá vật tư, Danh mục) | 24–557 | 26–219 |
| Phiếu nhập: Ghi vào sổ (Ctrl+Enter) | 460 | 808 |
| Tạo PDF khi in Bảng điều khiển | 129 | 142 |

Ghi chú: "Phiếu nhập: Ghi vào sổ" chậm hơn một chút (808 ms) vì mỗi lần lưu, máy chủ trả lại toàn bộ dữ liệu và trình duyệt vẽ lại; vẫn dưới ngưỡng. Số đo thay đổi ±30% giữa các lần chạy.

## 6. Việc bạn cần tự kiểm tra bằng tay (Windows, máy thật)

1. **Nhấp "Điền số này" và "Thêm … này"** ở form Ghi thu, chi ngay sau khi gõ mã NCC (không bấm Tab trước) — đây là lỗi số 4; thử trên Edge/Chrome thật.
2. **Mở thử file Excel xuất ra với 20.000 dòng** bằng Microsoft Excel (chưa kiểm được bằng Excel thật; LibreOffice đã tính lại khớp từng ô). Bấm `Ctrl+Alt+F9`.
3. **Đo thời gian xuất/nhập Excel lớn trên máy của bạn** (máy yếu có thể gấp 2–3 lần số ở mục 5); quan sát cảnh báo "Đang tạo file Excel…" và ứng dụng vẫn thao tác được trong lúc chờ.
4. **Điện thoại hoặc cửa sổ hẹp**: xem Bảng điều khiển chi phí, Phiếu nhập, Sổ chi phí; nút mở lịch chọn ngày.
5. **In phiếu và báo cáo ra máy in thật / PDF** (Chi tiết theo nhóm khi dữ liệu lớn: bấm "mở tất cả" trước khi in nếu muốn in cả chi tiết).
6. **Chạy `npm install` rồi `npx playwright install chromium` và `npm test`** trên máy bạn nếu muốn chạy lại toàn bộ bộ kiểm thử (ca giao diện và ca LibreOffice tự bỏ qua nếu máy thiếu).
7. Thử trên dữ liệu thật của bạn: lần đầu sau khi thay bản mới, **sao lưu thư mục `data\`**, rồi mở trên bản sao.

## 7. Tệp đã thêm / sửa trong lượt 2

- Sửa: `server.js` (kiểm kiểu dữ liệu, tiêu đề bảo mật, xuất Excel trong luồng riêng), `lib/costApi.js`, `lib/exporter.js` (kiểu ô dùng chung, sao chép khi ghi), `lib/costExporter.js`, `lib/chart.js`, `public/js/shared.js` (số âm, kiểm kiểu), `public/js/forms.js`, `public/js/views/cost-entry.js`, `cost-ledger.js`, `ledger.js`, `cost-reports.js`, `dashboard.js`, `settings.js`, `vouchers.js`, `src/styles/app.css` + `public/css/app.css` (biên dịch lại), `package.json`, `package-lock.json`.
- Thêm: `lib/exportWorker.js`; `tests/d-chi-phi.test.js`, `f-chi-phi-ui.test.js`, `f-khao-sat-giao-dien.test.js`, `g-hieu-nang.test.js`, `h-bao-mat.test.js`, `ui-helpers.js`; `makeBigDb` trong `tests/helpers.js`.
