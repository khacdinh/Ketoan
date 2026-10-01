# BÁO CÁO KIỂM THỬ — LƯỢT 1

Phần mềm: Sổ Thu Chi (thư mục `Ketoan`, trước đây tên `KeToan2`) · Ngày kiểm thử: 30/09/2026
Phạm vi lượt 1: A môi trường/khởi động, B lưu trữ, C hồi quy chức năng cũ, E nhập/xuất Excel và đối chiếu số liệu.

## 0. Tóm tắt

| | |
|---|---|
| Số ca kiểm thử tự động (`npm test`) | **58** (A: 11, B: 16, C giao diện: 8, C nghiệp vụ: 10, E: 13) |
| Kết quả trên bản đã sửa | **58 đạt, 0 không đạt** (kèm ca cài thư viện sạch); chạy lại với `TZ=Asia/Ho_Chi_Minh` và `TZ=America/Los_Angeles` đều đạt hết (57 ca + 1 ca cài thư viện được bỏ qua); mỗi lượt ~90 giây |
| Kết quả trên bản gốc (trước khi sửa) | chạy lại 50 ca nhóm A, B, C-nghiệp vụ, E trên mã gốc: **12 không đạt**, tương ứng 11 lỗi ở mục 3 |
| Lỗi tìm thấy / đã sửa | **11 / 11** (3 nghiêm trọng, 5 cao, 3 trung bình; không còn lỗi chưa sửa) |
| Lỗi nghiêm trọng còn tồn tại | Không phát hiện thêm. Nhưng **có 3 điều chưa kiểm tra được** (mục 1) |
| Số liệu so với Excel | Phần chi phí (tổng, 3 loại CP, 5 nhóm, 9 hạng mục, phát sinh 10 NCC, 104 dòng) **khớp tuyệt đối từng đồng** |

## 1. Những điều cần biết trước (khác với mô tả ban đầu)

1. **Bản này không dùng SQLite.** `lib/store.js` vẫn lưu một file JSON (`data/ketoan.json`, schema 2), không có `node:sqlite`. Vì vậy mục B.1 "migrate" được hiểu là *nâng cấp schema 1 → 2 từ dữ liệu gốc* (66 dòng, 15 dự án, 43 NCC, tồn quỹ 943.000 đ) và đã kiểm thử đầy đủ. Nếu có bản SQLite riêng, cần gửi để kiểm thử lượt sau; các test B sẽ dùng lại được (chúng chỉ gọi API thật).
2. **File `ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm` không có trong kho mã** (chỉ có `tai-lieu/DoiChieu_ChiPhi_voi_Excel.md` và `DongThieu_NHATKYCHUNG_Thang8.xlsx`). Đã làm được: (a) dữ liệu chi phí đã nhập từ file đó (`data/ketoan.json`: 104 dòng) đối chiếu với **số do Microsoft Excel tính lại** ghi trong tài liệu đối chiếu (đã cố định thành hằng số trong test `E2.1`); (b) sổ quỹ `SO_QUY` của file mẫu **không có**, nên phần "đã trả / còn nợ" được dựng lại sao cho đúng bằng số Excel trong tài liệu (có khoản thu lại, khoản không ghi NCC…) — phần này kiểm tra *cách phần mềm cộng trừ, ghép NCC, xếp trạng thái* chứ không kiểm tra việc đọc `SO_QUY` thật. (c) Đã viết sẵn **`tests/doi-chieu-xlsm.js`**: chạy trên máy bạn với file thật sẽ tự cộng Số lượng × Đơn giá từng dòng (không tin ô công thức), đọc `SO_QUY`, nhập bằng bộ nhập thật vào kho tạm và in bảng đối chiếu. Đã chạy thử bằng file xuất của phần mềm: 49/49 chỉ tiêu khớp.
3. **Sổ quỹ hiện có trong `data/ketoan.json` (66 dòng) không phải `SO_QUY` của file mẫu**, nên trong dữ liệu thật hiện tại "Đã trả nhà cung cấp" = 689.589.000 đ, không phải 1.230.569.000 đ như bảng đối chiếu của file Excel. Đó là khác biệt về dữ liệu đầu vào, không phải lỗi.
4. Hai thư mục `node_modules/` (có tệp nhị phân của Windows) và `data/` (dữ liệu thật) đang nằm trong git. Test **không bao giờ ghi vào `data/`** (chạy trên bản sao trong thư mục tạm; `git status data/` sạch sau mỗi lượt). Nên cân nhắc thêm vào `.gitignore` (không tự đổi).
5. Dữ liệu thử cố định nằm ở `tests/fixtures/` (bản gốc schema 1 và bản hiện tại schema 2).

## 2. Môi trường kiểm thử

Linux, Node 22.22, Chromium 1194 + Playwright 1.56 (có sẵn trên máy, **không** thêm vào `package.json`), LibreOffice Calc (cài thêm để tính lại công thức). Lệnh: `npm test` (mỗi tệp `tests/*.test.js` khởi động server thật trên cổng ngẫu nhiên với thư mục dữ liệu tạm, gọi API thật hoặc điều khiển trình duyệt thật). `RUN_NPM_INSTALL=1 npm test` chạy thêm ca cài thư viện sạch.

## 3. Lỗi đã tìm thấy và đã sửa

| # | Mức | Lỗi | Nguyên nhân | Cách sửa | Ca phát hiện |
|---|---|---|---|---|---|
| 1 | **Nghiêm trọng** | `ketoan.json` bị cắt/hỏng (mất điện khi ghi, ổ lỗi, đường dự phòng `copyFileSync` khi Windows khóa file không nguyên tử) → phần mềm **sập với thông báo lỗi kỹ thuật**, không mở lại được, không tự cứu dữ liệu | `Store.load()` gọi `JSON.parse` không bắt lỗi | `Store.recover()`: nếu file hỏng thì đổi tên giữ lại thành `ketoan.json.hong-<giờ>`, lấy bản sao lưu gần nhất còn đọc được và báo tiếng Việt; nếu không có bản nào: dừng với thông báo rõ, **không ghi đè/xóa** file hỏng. `server.js` bắt lỗi khởi động, không in stack trace | B3.2, B3.3 |
| 2 | **Nghiêm trọng** (sai tiền, lặng lẽ) | Gõ `2tr5` được lưu **20.000.005 đ**; `1tr250k` được lưu **1.000.000.250.000 đ**; `3k5` tương tự | `parseAmount` đổi `2tr` → `2000000` rồi dính nguyên chữ số đứng sau | Chữ số dán ngay sau đơn vị (tr, k, tỷ, nghìn…) → **không hợp lệ** (NaN, phần mềm báo sai, không đoán ý). Viết `2,5tr` hoặc `1tr+250k` vẫn được. *Đổi hành vi có chủ đích; đã ghi vào hướng dẫn* | C1, C1b |
| 3 | **Nghiêm trọng** (mất tiền) | Gộp Excel sổ thu chi **bỏ mất** các khoản giống hệt nhau (cùng ngày, số phiếu, NCC, nội dung, số tiền) — ví dụ 2 lần mua vé 50.000 đ cùng ngày chỉ còn 1 | `applyImport` dedupe bằng `Set` thay vì đếm số lần | Dedupe bằng bộ đếm (như bộ nhập chi phí): nhập lại cùng file không nhân đôi, nhưng không mất khoản trùng hợp lệ | E8 |
| 4 | Cao (mất dữ liệu) | Chế độ **Thay thế** bằng file không có dòng hợp lệ xóa sạch dữ liệu: file sổ thu chi chỉ có danh mục NCC → xóa hết sổ; file `NHATKYCHUNG` sai tiêu đề cột → xóa hết dòng chi phí (có sao lưu nhưng người dùng không biết) | Không kiểm tra số dòng đọc được trước khi thay | Từ chối (HTTP 400, tiếng Việt, gợi ý dùng "Gộp thêm") khi file không có dòng nào mà kho đang có dữ liệu | E5.1 |
| 5 | Cao | Khi cổng 3939 bận, phần mềm **in sai địa chỉ và mở trình duyệt vào cổng của chương trình khác** (rồi mở thêm tab thứ hai đúng cổng) | Hàm `listening` của lần `listen` thất bại vẫn còn gắn, chạy khi cổng kế tiếp mở được | `server.removeAllListeners('listening')` khi gặp lỗi | A1.3 |
| 6 | Cao (bảo mật) | Trang web lạ có thể đọc toàn bộ sổ qua DNS rebinding (truy vấn GET cùng nguồn không có `Origin`, chỉ có `Host` lạ; server không kiểm `Host`) | Chỉ kiểm tra `Origin` | Từ chối API khi `Host` không phải `localhost`, `127.0.0.1`, `[::1]` | A2.2 |
| 7 | Cao | **Không đổi được mã hạng mục chi phí** (chỉ sửa mã, giữ tên) — luôn báo "Tên hạng mục … đã có" | Kiểm tra trùng tên so luôn với chính hạng mục đang sửa | Loại bản ghi đang sửa khỏi phép so | B5.2 |
| 8 | Cao | Ngày không có thật như `2026-02-30`, `2026-04-31` được API và nhập Excel chấp nhận và lưu | `isISODate` dựa vào `Date.parse`, V8 tự nhảy sang tháng sau | So lại ngày chuẩn hóa với chuỗi gốc | C6 |
| 9 | Trung bình | Dòng chi phí thiếu **Mã công trình** vẫn được nhập với mã rỗng → dòng "mồ côi" không thuộc công trình nào | Chỉ cảnh báo nhưng không bỏ qua | Bỏ qua dòng và cảnh báo rõ | E1.2 |
| 10 | Trung bình | Không có kiểm tra phiên bản Node; Node cũ chạy ra lỗi cú pháp khó hiểu | Thiếu kiểm tra | `server.js` kiểm tra Node ≥ 18 và báo tiếng Việt; `KhoiDong.bat` kiểm tra tương tự; `package.json` thêm `engines` | A1.2 |
| 11 | Trung bình (hiếm) | `costAmount` lệch 1 đồng khi Số lượng × Đơn giá lớn (thành tiền ≳ 900 tỷ đồng) | Nhân số thực vượt 2^53 | Tính bằng số nguyên; vượt ngưỡng an toàn thì dùng BigInt | C3 (20.000 cặp ngẫu nhiên đối chiếu BigInt) |

Ghi chú: lỗi 2 và 8 làm thay đổi hành vi cũ (chặt hơn) — là chủ đích, vì hành vi cũ ghi sai dữ liệu tiền/ngày.

### Lỗi chưa sửa / tồn tại có chủ đích
- Không có lỗi nào tìm thấy mà chưa sửa.
- Quan sát (không phải lỗi): xuất Excel 20.000 dòng mất ~13 giây; `Thay toàn bộ` của sổ thu chi vẫn có sao lưu tự động trước khi thay; khi nhập Excel chi phí, công trình trong `DM_CONGTRINH` chưa có phát sinh mặc định **không** được tạo (người dùng chọn "Thêm công trình mới" ở màn xem trước nếu muốn) — đúng thiết kế, đã kiểm tra cả hai cách.
- File xuất không có sheet `PHIEU_NHAP` (biểu mẫu nhập liệu của file mẫu) — do thiết kế (nhập bằng màn hình phần mềm).
- Mã NCC trong file mẫu có chỗ `NCC_Khac`, chỗ `NCC_KHAC`; phần mềm không phân biệt hoa thường nên gộp đúng.

## 4. Bảng đối chiếu số liệu với Excel (dữ liệu chi phí đã nhập từ file mẫu)

Cột *Excel* = số Microsoft Excel tính lại (`DoiChieu_ChiPhi_voi_Excel.md`, cột A). Cột *Cộng thẳng* = tự cộng Số lượng × Đơn giá từng dòng bằng số nguyên (BigInt), không dùng hàm tổng hợp của phần mềm. Cột *Phần mềm* = số do `KT.costSummary` / `KT.supplierDebt`. Test `E2.1` (mọi dòng đều khớp tuyệt đối).

| Chỉ tiêu | Excel | Cộng thẳng | Phần mềm | Kết quả |
|---|---:|---:|---:|---|
| TỔNG CHI PHÍ | 1.129.929.000 | 1.129.929.000 | 1.129.929.000 | Khớp |
| Vật tư | 763.957.000 | 763.957.000 | 763.957.000 | Khớp |
| Nhân công | 250.000.000 | 250.000.000 | 250.000.000 | Khớp |
| Dịch vụ - Phí | 115.972.000 | 115.972.000 | 115.972.000 | Khớp |
| Số dòng chi phí | 104 | 104 | 104 | Khớp |
| Nhóm 1. Chi phí ban đầu | 550.000 | 550.000 | 550.000 | Khớp |
| Nhóm 2. Chi phí phần thô | 1.021.250.000 | 1.021.250.000 | 1.021.250.000 | Khớp |
| Nhóm 3. Hệ thống điện nước | 17.303.000 | 17.303.000 | 17.303.000 | Khớp |
| Nhóm 4. Hoàn thiện | 49.426.000 | 49.426.000 | 49.426.000 | Khớp |
| Nhóm 6. Chi phí khác | 41.400.000 | 41.400.000 | 41.400.000 | Khớp |
| Hạng mục Hồ sơ pháp lý | 550.000 | 550.000 | 550.000 | Khớp |
| Hạng mục Bê tông | 216.305.000 | 216.305.000 | 216.305.000 | Khớp |
| Hạng mục Sắt thép xây dựng | 298.313.000 | 298.313.000 | 298.313.000 | Khớp |
| Hạng mục Vật tư VLXD | 182.610.000 | 182.610.000 | 182.610.000 | Khớp |
| Hạng mục Chi phí chung CT | 74.022.000 | 74.022.000 | 74.022.000 | Khớp |
| Hạng mục Nhân công thợ nề | 250.000.000 | 250.000.000 | 250.000.000 | Khớp |
| Hạng mục Vật tư điện nước | 17.303.000 | 17.303.000 | 17.303.000 | Khớp |
| Hạng mục Thiết bị vệ sinh | 49.426.000 | 49.426.000 | 49.426.000 | Khớp |
| Hạng mục Chi phí quản lý (giám sát, VP) | 41.400.000 | 41.400.000 | 41.400.000 | Khớp |

Công nợ từng NCC (phát sinh / đã trả / còn lại; "đã trả" = sổ quỹ dựng lại theo số Excel, xem mục 1.2):

| Mã NCC | Phát sinh (Excel = PM) | Đã trả (Excel = PM) | Còn lại (Excel = PM) | Tình trạng |
|---|---:|---:|---:|---|
| NCC_HoaLan | 1.400.000 | 1.400.000 | 0 | Đã tất toán |
| NCC_Khac | 41.600.000 | 1.600.000 | 40.000.000 | Còn nợ |
| NCC_VuongThinh | 182.610.000 | 232.910.000 | −50.300.000 | Ứng dư |
| NCC_SongHan | 216.305.000 | 241.645.000 | −25.340.000 | Ứng dư |
| NCC_NhatQuang | 49.426.000 | 49.426.000 | 0 | Đã tất toán |
| NCC_VUTHANH | 17.303.000 | 17.303.000 | 0 | Đã tất toán |
| NCC_Quân | 0 | 15.000.000 | −15.000.000 | Ứng dư |
| NCC_Tai | 63.900.000 | 63.900.000 | 0 | Đã tất toán |
| NCC_Hau | 259.072.000 | 309.072.000 | −50.000.000 | Ứng dư |
| NCC_CUCHANH | 298.313.000 | 298.313.000 | 0 | Đã tất toán |
| **Tổng** | **1.129.929.000** | **1.230.569.000** | **−100.640.000** | |

Thêm: nhập `DongThieu_NHATKYCHUNG_Thang8.xlsx` (22 dòng, 141.870.000 đ) bằng chế độ Gộp → tổng **1.271.799.000** (Vật tư 843.627.000, Nhân công 310.600.000, Dịch vụ-Phí 117.572.000), **126 dòng**; còn nợ NCC_Khac 40.000.000, NCC_VUTHANH 6.230.000, ứng dư NCC_Quân 5.000.000, các NCC còn lại tất toán — đúng các số lưu sẵn cũ của file mẫu; nhập lần hai không nhân đôi (test `E1.x`).

Nguyên nhân chênh "số lưu sẵn trong file" (1.271.799.000) so với "tính lại" (1.129.929.000) đã được tài liệu đối chiếu giải thích: file mẫu thiếu đúng 22 dòng tháng 8 (141.870.000 đ); phần mềm khớp cả hai cách khi có/không có 22 dòng đó.

## 5. Bảng ca kiểm thử (58 ca, tất cả **Đạt** trên bản đã sửa)

Cột "Trước sửa" = kết quả khi chạy cùng ca trên mã gốc (chỉ chạy lại các ca A, B, C-nghiệp vụ, E; ca giao diện không thay đổi mã nên không chạy lại).

### A. Môi trường và khởi động (`tests/a-moi-truong.test.js`)

| Mã | Mô tả | Kết quả | Trước sửa | Bằng chứng |
|---|---|---|---|---|
| A1.1 | `KhoiDong.bat`, `TaoBieuTuongDesktop.bat`: kiểm tra Node, báo lỗi tiếng Việt, tự `npm install --omit=dev`, `chcp 65001` | Đạt | Đạt | Kiểm tra nội dung tệp (không chạy được `.bat` trên Linux — xem mục 7) |
| A1.2 | Node cũ → thông báo tiếng Việt, `engines.node` | Đạt | **Hỏng** | `server.js` kiểm `process.versions.node`; `package.json` có `engines >=18` |
| A1.3 | Cổng bận → tự chuyển cổng kế tiếp, địa chỉ in ra đúng | Đạt | **Hỏng** | Chiếm cổng bằng server giả; phần mềm chạy ở cổng lớn hơn, `/api/ping` trả đúng ứng dụng |
| A1.4 | Bấm lần hai khi đang chạy → không mở server mới, thoát mã 0, báo "đang chạy sẵn" | Đạt | Đạt | Tiến trình 2 thoát mã 0; tiến trình 1 vẫn trả `/api/ping` |
| A1.5 | Hết cổng → thông báo lỗi tiếng Việt | Đạt | Đạt | Có chuỗi "Không khởi động được máy chủ" (chỉ kiểm tra tĩnh) |
| A2.1 | Chỉ nghe 127.0.0.1 | Đạt | Đạt | Kết nối tới địa chỉ mạng khác và `::1` bị từ chối |
| A2.2 | Từ chối Origin lạ (kể cả `localhost.evil.com`) và Host lạ; chấp nhận localhost / 127.0.0.1 | Đạt | **Hỏng** | 403 cho Origin/Host lạ; 200 cho localhost và 127.0.0.1 |
| A2.3 | Không đọc file ngoài `public/` (`/../server.js`, `%2e%2e`, `%5c`, `%00`…) | Đạt | Đạt | Không lộ nội dung `server.js` |
| A2.4 | Offline: không có URL mạng ngoài trong html/css/js; font và icon cục bộ | Đạt | Đạt | Quét toàn bộ `public/`; có `.woff2` và `vendor/phosphor/icons.css` |
| A2.5 | Mọi tệp `index.html` và CSS tham chiếu đều tồn tại | Đạt | Đạt | Đối chiếu đường dẫn |
| A3 | `npm install --omit=dev` sạch trong thư mục mới, không gói cần C++ | Đạt | — | Cài xong có `exceljs`, không có `binding.gyp`, `require('exceljs')` chạy |

### B. Lưu trữ (`tests/b-luu-tru.test.js`)

| Mã | Mô tả | Kết quả | Trước sửa | Bằng chứng |
|---|---|---|---|---|
| B1.1 | Dữ liệu gốc schema 1 → nâng cấp: 66 dòng, 15 dự án, 43 NCC, từng dòng/dự án/NCC giống bản gốc, thu 2.532.577.035, chi 2.531.634.035, tồn 943.000, từng dự án/NCC khớp tính độc lập | Đạt | Đạt | So từng trường 66 dòng theo thứ tự; bản sao lưu `truoc-nang-cap-v2` giống hệt bản gốc |
| B2.1 | Mở lại 3 lần: không nhân đôi, không thêm sao lưu nâng cấp | Đạt | Đạt | Số dòng/`nextId` không đổi; đúng 1 bản `truoc-nang-cap` |
| B2.2 | Dữ liệu schema 2 thật (104 dòng chi phí) mở lại nguyên vẹn | Đạt | Đạt | Các danh sách giống hệt file |
| B3.1 | `kill -9` giữa lúc đang ghi (6 vòng, kill sau 150–500 ms) | Đạt | Đạt | File luôn đọc được; mọi dòng đã nhận HTTP 200 đều còn; mở lại và ghi tiếp được |
| B3.2 | File hỏng + có sao lưu → tự khôi phục | Đạt | **Hỏng** | 66 dòng + 104 chi phí trở lại; file hỏng giữ tên `.hong-…`; log tiếng Việt |
| B3.3 | File hỏng, không sao lưu → lỗi tiếng Việt, không ghi đè | Đạt | **Hỏng** | Tiến trình dừng, file hỏng còn nguyên |
| B3.4 | 150 yêu cầu ghi đồng thời | Đạt | — | 150 id và seq duy nhất, tổng tiền đúng, file = bộ nhớ |
| B3.5 | Windows khóa file (đổi tên lỗi) → ghi đè trực tiếp | Đạt | — | Dữ liệu đủ, không còn `.tmp` |
| B4.1 | Sao lưu tự động (chụp trạng thái trước sửa, không lặp trong 10 phút), thủ công, tải về, khôi phục, khôi phục từ file tải lên; sau khôi phục dữ liệu đúng như lúc sao lưu | Đạt | Đạt | So sánh từng dòng/dự án/NCC/chi phí; có `truoc-xoa-du-lieu`, `truoc-khoi-phuc`; file rác → 400 |
| B4.2 | Tên sao lưu lạ (`../../etc/passwd`, `..\\…`…) bị từ chối | Đạt | Đạt | Dữ liệu không đổi |
| B4.3 | Giữ tối đa 60 bản | Đạt | Đạt | 70 tệp giả → còn 60, bản cũ nhất bị xóa |
| B4.4 | Sao lưu trước xóa chi phí | Đạt | Đạt | Bản sao lưu chứa đủ 104 dòng; xác nhận sai chữ → 400 |
| B5.1 | Không xóa mã đang dùng (dự án, NCC, nhóm, hạng mục, vật tư, nhà); xóa mã chưa dùng được | Đạt | Đạt | 400 "Không thể xóa…" cho mọi trường hợp; xóa thành công khi hết dùng; 404 cho id lạ |
| B5.2 | Đổi mã lan tới mọi nơi dùng; mã trùng (kể cả khác hoa/thường) bị từ chối | Đạt | **Hỏng** | Không có dòng mồ côi sau mỗi lần đổi (dự án, NCC, hạng mục, nhóm, vật tư) |
| B5.3 | Không tạo dòng tham chiếu mã không có | Đạt | Đạt | 9 yêu cầu bị từ chối, dữ liệu không đổi |
| B5.4 | `/api/reset`, `/api/reset-costs` không để lại mồ côi | Đạt | Đạt | `orphanErrors = []` |

### C. Hồi quy chức năng cũ — nghiệp vụ (`tests/c-hoi-quy.test.js`)

| Mã | Mô tả | Kết quả | Trước sửa | Bằng chứng |
|---|---|---|---|---|
| C1 | Nhập tiền hợp lệ: `1.250.000`, `1,250,000`, `50tr`, `1,5tr`, `300k`, `58000+11000`, `50tr+300k`, `2 tỷ`, `5tr/2`… | Đạt | Đạt | 25 dạng đúng số |
| C1b | Nhập sai phải NaN (`abc`, `1e6`, `2tr5`, `1tr250k`, `1/0`…) | Đạt | **Hỏng** | `2tr5` ra 20.000.005 trước khi sửa |
| C2 | Đọc số tiền bằng chữ (1, 11, 15, 21, 101, 105, 1005, 2.532.577.035, nghìn tỷ…) | Đạt | Đạt | 26 số đúng chính tả ("linh", "mốt", "lăm") |
| C3 | `costAmount` = SL × ĐG đúng từng đồng | Đạt | **Hỏng** | 20.000 cặp ngẫu nhiên đối chiếu BigInt; trước sửa lệch 1 đồng ở 2 cặp |
| C4 | Sổ thu chi thêm/sửa/xóa/xóa nhiều: 300 thao tác ngẫu nhiên, tồn lũy kế từng dòng khớp bản tính độc lập | Đạt | Đạt | seq duy nhất; file trên đĩa = bộ nhớ |
| C5 | Lọc kỳ / dự án / NCC / thu-chi / từ khóa (có dấu, không dấu, số tiền) trên dữ liệu thật: 16 tổ hợp | Đạt | Đạt | Danh sách dòng, tổng thu/chi, tồn đầu kỳ khớp bản lọc độc lập |
| C6 | Kiểm tra dữ liệu nhập: ngày sai (kể cả 30/02), tiền âm/chữ/quá lớn, mã lạ, JSON hỏng, 404 | Đạt | **Hỏng** | `2026-02-30` được nhận trước khi sửa |
| C7 | Phiếu thu/chi: gộp theo số phiếu (không phân biệt hoa thường), PT/PC, bằng chữ, đánh số kế tiếp (đổi tháng/năm), lưu/xóa thông tin in | Đạt | Đạt | `PC003/09`, `PT002/09`, `PC001/10`; số tiền phiếu 2.000.000 → "Hai triệu đồng" |
| C8 | Tổng hợp dự án/NCC, cảnh báo ngân sách (vượt/sắp hết/trong hạn) | Đạt | Đạt | Tổng chi từng dự án khớp tính độc lập; ngưỡng 100%/90% |
| C9 | Danh mục dự án/NCC, cài đặt, giữ sau khi khởi động lại | Đạt | Đạt | Ngân sách `2 tỷ` = 2.000.000.000; trạng thái mặc định |

### C. Hồi quy — giao diện (`tests/c-giao-dien.test.js`, Chromium thật)

| Mã | Mô tả | Kết quả | Bằng chứng |
|---|---|---|---|
| UI1 | 14 màn hình hiển thị với dữ liệu thật | Đạt | Không lỗi JS, không chữ `undefined/NaN/[object Object]`, không gọi mạng ngoài |
| UI2 | Tổng quan hiện đúng tồn quỹ | Đạt | Có chuỗi 943.000 |
| UI3 | Form nhập: F2; ngày `29/9`, `290926`, `29.9.26`, `29-09-2026`, `1/10/2026`, `29 9`, sai (`30/02/2026`, `abc`) báo sai; ↑↓ đổi ngày; tiền + số tiền bằng chữ; Lưu và nhập tiếp giữ ngày/phiếu/dự án/NCC; Ctrl+Enter | Đạt | 6 dòng lưu đúng 1.250.000, 50.000.000, 1.500.000, 300.000, 69.000, 2.000.000 |
| UI4 | Sổ: tìm kiếm, nhân bản, sửa, xóa (hủy rồi đồng ý); tồn quỹ hiển thị | Đạt | Số dòng tìm khớp `filterLedger`; số dòng trên màn hình = trong DB |
| UI5 | Phiếu: 2 liên, PHIẾU CHI, LIÊN 1/LIÊN 2, số tiền và bằng chữ, nút In; xuất PDF A4 | Đạt | PDF đúng **1 trang** (đã xem ảnh: phiếu "207.000 đ — Hai trăm linh bảy nghìn đồng") |
| UI6 | Tính năng mới: bấm ô Vật tư/Nhân công/Dịch vụ-Phí → sổ chi phí đã lọc; ô Đã trả/Còn nợ → công nợ; bằng phím Enter | Đạt | Số dòng khớp `filterCosts` |
| UI7 | Cài đặt: lưu thông tin in, tải Excel, nhập lại (xem trước, gộp → "Bỏ qua N dòng trùng"), file lỗi → báo tiếng Việt, sao lưu ngay, khôi phục, xóa dữ liệu (nút chỉ bật khi gõ `xoa`) | Đạt | Sau xóa: 0 dòng sổ, 104 dòng chi phí còn nguyên |
| UI8 | Danh mục dự án/NCC: thêm (`2 tỷ`), trùng mã, đổi mã lan sang sổ, xóa mã đang dùng bị chặn, xóa mã hết dùng, lọc NCC, Tổng hợp NCC | Đạt | Chạy ổn định 6/6 lần liên tiếp |

### E. Excel (`tests/e-excel.test.js`)

| Mã | Mô tả | Kết quả | Trước sửa | Bằng chứng |
|---|---|---|---|---|
| E1.x | Gộp 22 dòng thiếu tháng 8 → đúng số lưu sẵn cũ của file mẫu | Đạt | Đạt | Mục 4; nhập lần hai: 0 dòng thêm |
| E1.2 | File bẩn: mã VT `XX-CHUAXACDINH`, NCC lạ, nhà lạ, hạng mục lạ, loại CP lạ, thiếu ngày (lấy dòng trên), ngày/số dạng chữ, ô công thức, thành tiền cache sai, thiếu số lượng, thiếu mã CT | Đạt | **Hỏng** | 10/12 dòng vào sổ; cảnh báo đủ; thành tiền tính lại (300.000 thay vì 999); mã lạ được thêm vào danh mục; không mồ côi; tổng đúng |
| E1.3 | Nhập `.xlsm` (macro, `vbaProject.bin`) | Đạt | Đạt | 104 dòng, tổng 1.129.929.000 (file `.xlsm` thật: xem mục 7) |
| E2.1 | Đối chiếu với số Excel tính lại | Đạt | Đạt | Mục 4 |
| E2.2 | Thành tiền từng dòng = SL×ĐG (BigInt) | Đạt | Đạt | 0 dòng lệch |
| E3.1 | Xuất chi phí: 11 sheet như mẫu, tiêu đề `NHATKYCHUNG` đúng mẫu, công thức `ROUND($K*$L,0)`, `INDEX/MATCH`, `SUMIFS`, số cạnh công thức khớp Excel, không ô lỗi; tự cộng từ chính các ô của file | Đạt | — | Tổng, 3 loại CP, phát sinh 10 NCC khớp |
| E3.2 | **Tính lại bằng LibreOffice** (xóa kết quả lưu sẵn, buộc tính từ đầu) | Đạt | — | **1.614** ô công thức: 0 ô lệch, 0 ô lỗi |
| E3.3 | Như trên cho 9 tệp xuất khác | Đạt | — | sổ đầy đủ 1.094 · sổ thu chi 2 · dự án 80 · NCC 49 · phiếu 1 · sổ chi phí 109 · công nợ 31 · lọc 2 · 1 công trình 958 ô — **đều 0 lệch** |
| E3.4 | Các tệp xuất mở được, có đúng tổng thu/chi/tồn, tên tệp tải về | Đạt | — | Khớp `filterLedger`, `projectSummary`, `supplierSummary` |
| E4 | **Vòng lặp** xuất → nhập lại vào kho sạch (xem trước, thay thế, gộp ×2, thay thế lần 2, gộp sau khi thêm dòng tay) | Đạt | — | 104 dòng giống hệt, gom phiếu giống, sổ quỹ, danh mục, tổng, công nợ giống; gộp: 0 dòng thêm, 104 bỏ qua |
| E5.1 | File lỗi: rỗng, 2 byte, html, byte ngẫu nhiên, zip lạ, xlsx sai mẫu, xlsx cắt ngang, thiếu cột Số lượng (thay thế bị chặn, gộp không thêm), chỉ có danh mục NCC (thay thế bị chặn) | Đạt | **Hỏng** | Mọi trường hợp: 4xx + lỗi tiếng Việt, dữ liệu giữ nguyên |
| E5.2 | File 20.000 dòng | Đạt | — | Xem trước 1,6 s, nhập 1,7 s, xuất 13,4 s (1,2 MB); tổng khớp; xuất rồi nhập lại vẫn đúng |
| E8 | Sổ thu chi: xuất đầy đủ → nhập lại (thay thế / gộp); 2 khoản giống hệt không mất | Đạt | **Hỏng** | Từng dòng/danh mục giống hệt; gộp lại 0 dòng thêm; 2 khoản giống hệt đủ 2 dòng |

## 6. Các giả định
1. Mã công trình, dự án, NCC… không phân biệt hoa thường (đúng như thiết kế hiện tại).
2. Tiền là số nguyên VNĐ; đơn giá được phép có tối đa 2 số lẻ, số lượng tối đa 4 số lẻ, thành tiền làm tròn nửa lên.
3. "Excel tính lại" = cột A của `DoiChieu_ChiPhi_voi_Excel.md` (file `.xlsm` gốc không có để đọc lại).
4. Hiển thị Excel bằng Microsoft Excel thật không kiểm tra được trên máy Linux; thay bằng (a) đọc lại bằng `exceljs` và (b) LibreOffice tính lại toàn bộ công thức. CLAUDE.md ghi rõ ExcelJS có thể ghi file mà Excel không mở được (đã từng gặp với thứ tự `<sheetPr>`) — cần bạn mở thử (mục 7).
5. Kiểm thử giao diện chỉ bằng Chromium; Edge/Chrome trên Windows dùng cùng lõi nhưng không được chạy thử.

## 7. Việc bạn cần tự kiểm tra bằng tay trên máy Windows

1. **`KhoiDong.bat`**: bấm đúp → mở trình duyệt; bấm lần hai khi đang chạy → chỉ mở lại trình duyệt; giữ cổng 3939 bằng một chương trình khác (vd. `python -m http.server 3939`) → phần mềm mở đúng **3940** (chỉ 1 tab); đổi tên `node_modules` → tự cài lại; máy không có Node / Node cũ hơn 18 → thông báo tiếng Việt. **`TaoBieuTuongDesktop.bat`**: tạo được biểu tượng ngoài Desktop và bấm chạy được. (Tôi chỉ kiểm tra nội dung tệp `.bat`, không chạy được trên Linux.)
2. **Mở bằng Microsoft Excel thật** các tệp xuất (`Cài đặt & dữ liệu → Xuất`; `Chi phí → Xuất Excel`): không có cảnh báo "sửa file", biểu đồ ở `TONGHOP` hiển thị, bấm `Ctrl+Alt+F9` số không đổi (LibreOffice đã xác nhận 0 lệch nhưng Excel mới là chuẩn cuối).
3. **Chạy với file `.xlsm` thật**: `node tests\doi-chieu-xlsm.js "C:\đường dẫn\ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm"` — kết quả mong đợi "TẤT CẢ … KHỚP"; đặc biệt phần `SO_QUY`/đã trả/còn nợ theo từng NCC (phần tôi chỉ dựng lại). Thử thêm nhập file đó qua giao diện (kéo thả, chọn ghép công trình, tick "Nhập cả SO_QUY").
4. **In phiếu 2 liên** ra máy in thật (hoặc Microsoft Print to PDF) khổ A4, hộp thoại in: Lề "Mặc định", bỏ tiêu đề/chân trang của trình duyệt; xem có đúng 1 trang (tôi chỉ kiểm bằng Chromium).
5. **OneDrive / phần mềm diệt virus khóa file**: làm vài thao tác ghi liên tục trong thư mục nằm trong OneDrive; phần mềm phải chạy bình thường (đường dự phòng đã test, nhưng khóa thật khó giả lập).
6. **Sao lưu thư mục `data\` trước khi thay bản mới** rồi mở bản mới trên bản sao; đối chiếu tồn quỹ **943.000 đ** ở màn Tổng quan.
7. Trên **Edge/Chrome thật**: F2, F3, Ctrl+Enter, nhập ngày `29/9`, `290926`, phím ↑↓, ô tiền `50tr`; thử gõ `2tr5` (phải báo sai, theo thay đổi ở lỗi 2).
8. `npm test` trên máy Windows (Node ≥ 18): các ca chạy trình duyệt và LibreOffice tự bỏ qua nếu máy không có Playwright / `soffice`.

## 8. Tệp đã thêm / sửa

- Sửa: `server.js`, `lib/store.js`, `lib/importer.js`, `lib/costImporter.js`, `lib/costApi.js`, `public/js/shared.js`, `KhoiDong.bat`, `package.json` (`engines`, script `test`), `HUONG_DAN_SU_DUNG.md`, `CLAUDE.md`.
- Thêm: `tests/` (`run.js`, `helpers.js`, `excel-helpers.js`, `a-moi-truong.test.js`, `b-luu-tru.test.js`, `c-hoi-quy.test.js`, `c-giao-dien.test.js`, `e-excel.test.js`, `doi-chieu-xlsm.js`, `fixtures/`).
