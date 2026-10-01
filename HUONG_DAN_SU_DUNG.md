# SỔ THU CHI — Hướng dẫn sử dụng

Phần mềm kế toán gồm hai phần chạy chung một chỗ, **không cần Internet**, dữ liệu lưu trong thư mục `data`:

- **Sổ thu chi** — làm theo file Excel **Quản lý thu chi** (Tổng quan, Sổ thu chi hàng ngày, Phiếu chi,
  Danh mục dự án, Danh mục NCC, Tổng hợp NCC). Dữ liệu cũ (66 dòng sổ, 15 dự án, 43 NCC, tồn quỹ 943.000 đ) giữ nguyên.
- **Chi phí công trình** — làm theo file Excel **ChiPhi_CongTrinh** (PHIEU_NHAP, NHATKYCHUNG, TONGHOP,
  CHI_TIET_THEO_NHOM, CONGNO_NCC và các danh mục DM_*). Nhập theo **Số lượng × Đơn giá = Thành tiền**
  thay cho nhập trên Excel. Xem mục 9 đến 15.

---

## 1. Mở phần mềm

1. Bấm đúp **`KhoiDong.bat`** trong thư mục `C:\KeToan`.
2. Một cửa sổ đen hiện ra và trình duyệt tự mở trang **http://localhost:3939**.
3. **Giữ cửa sổ đen mở** trong lúc làm việc. Đóng cửa sổ đó thì phần mềm tắt (dữ liệu đã được lưu sẵn).

Muốn có biểu tượng trên Desktop: bấm đúp **`TaoBieuTuongDesktop.bat`** một lần.

> Nếu bấm `KhoiDong.bat` khi phần mềm đang chạy, nó chỉ mở lại trình duyệt, không chạy thêm bản thứ hai.

> Lần đầu mở bản mới, phần mềm tự nâng cấp dữ liệu cũ lên phiên bản có phần chi phí công trình
> và **tự sao lưu bản cũ** trước (bản sao lưu “Trước khi nâng cấp phần mềm” trong Cài đặt).

> **Từ phiên bản lưu bằng SQLite** (cần **Node.js 24.16.0 trở lên** hoặc **26.1.0 trở lên**): lần đầu mở, phần mềm tự chuyển dữ liệu
> từ `data\ketoan.json` sang `data\ketoan.db`, đối chiếu từng con số (tồn quỹ, tổng thu / chi, từng dự án, từng NCC, chi phí…)
> rồi mới dùng. Cửa sổ đen báo *“Đã chuyển dữ liệu sang SQLite”*; chi tiết đối chiếu ở `data\migrate-bao-cao.txt`.
> File cũ được giữ lại (đổi tên thành `ketoan.json.da-chuyen-sqlite.bak`) và có thêm một bản trong `data\backups`. Xem mục 17.

---

## 2. Các màn hình (tương ứng với các sheet Excel)

| Màn hình | Sheet Excel tương ứng | Làm được gì |
|---|---|---|
| **Tổng quan** | `Tong_Quan` | Tồn quỹ, tổng thu, tổng chi theo kỳ; biểu đồ chi phí theo dự án so với ngân sách; cảnh báo vượt ngân sách; bảng tổng hợp chi phí theo dự án; thẻ tóm tắt chi phí công trình. Bấm vào một dự án để xem sổ chi tiết của dự án đó. |
| **Sổ thu chi hàng ngày** | `So_Thu_Chi_Hang_Ngay` | Ghi / sửa / xóa / nhân bản dòng thu chi. Tồn quỹ tự tính lũy kế. Lọc theo kỳ, dự án, NCC, thu/chi, tìm kiếm. Hiện tồn đầu kỳ, tổng thu, tổng chi, tồn cuối kỳ. |
| **Phiếu thu / chi** | `Phieu_Chi` | Các dòng cùng **số phiếu** được gộp thành 1 phiếu (tổng tiền, lý do, người nhận, số tiền bằng chữ). Xem trước và **in 2 liên trên 1 tờ A4**, xuất Excel. Số phiếu bắt đầu bằng **PT** là phiếu thu, **PC** là phiếu chi. |
| **Danh mục dự án** | `Danh_Muc_Du_An`, `DM_CONGTRINH` | Mã, tên, ngân sách, trạng thái, ngày khởi công, địa chỉ; xem đã chi, còn lại. Mỗi **công trình** trong phần chi phí chính là một dự án ở đây. |
| **Danh mục NCC / đối tượng** | `Danh_Muc_NCC`, `DM_NCC` | Mã, tên, loại (Vật tư / Nhân công / Dịch vụ...), SĐT, địa chỉ (địa chỉ được in tự động lên phiếu). Dùng chung cho cả sổ thu chi và chi phí công trình. |
| **Tổng hợp theo NCC** | `Tong_Hop_NCC` | Tổng thanh toán, số giao dịch, tỉ trọng cho từng NCC theo kỳ. Bấm vào dòng để xem sổ chi tiết. |
| **Cài đặt & dữ liệu** | — | Tên đơn vị, địa chỉ, tên Giám đốc / Kế toán trưởng / Thủ quỹ (in trên phiếu); nhập Excel (file thu chi hoặc file chi phí); xuất Excel; sao lưu / khôi phục. |

Nhóm menu **Chi phí công trình** (bên trái, dưới “Tổng hợp NCC”):

| Màn hình | Sheet Excel tương ứng | Làm được gì |
|---|---|---|
| **Tổng hợp chi phí** | `TONGHOP` | Tổng chi phí; theo loại Vật tư / Nhân công / Dịch vụ-Phí; đã trả, còn nợ NCC; bảng Nhóm → Hạng mục bung / thu gọn; chi phí theo tháng và lũy kế. Lọc theo công trình, nhà, kỳ. |
| **Phiếu nhập chi phí** | `PHIEU_NHAP` + macro `GhiPhieuNhap` | Khai báo đầu phiếu một lần, nhập nhiều dòng Mã VT × Số lượng × Đơn giá (hoặc chỉ Thành tiền cho khoản khoán), lưu một lần. Sửa / nhân bản / xóa phiếu. Phím **F3**. |
| **Sổ chi phí** | `NHATKYCHUNG` | Toàn bộ dòng chi phí; lọc theo kỳ, công trình, nhà, nhóm, hạng mục, loại CP, NCC, vật tư; tìm kiếm; sửa trực tiếp trong bảng; tổng cuối bảng. |
| **Chi tiết theo nhóm** | `CHI_TIET_THEO_NHOM` | Nhóm → Hạng mục → từng dòng, 3 mức hiển thị như nút 1 / 2 / 3 của Excel, có cộng hạng mục và tổng nhóm. |
| **Công nợ NCC** | `CONGNO_NCC` | Bảng tổng hợp **theo công trình** (chi phí, đã thanh toán, % đã thanh toán, còn nợ, ứng dư), rồi công nợ từng NCC: Chi phí phát sinh − Đã trả (lấy từ Sổ thu chi) = Còn nợ / Ứng dư / Đã tất toán. |
| **Giá vật tư** | (mới) | Lịch sử đơn giá từng vật tư theo NCC, giá thấp / cao / gần nhất, biểu đồ giá. |
| **Danh mục chi phí** | `DM_NHOM`, `DM_HANGMUC`, `DM_VATTU`, `DM_NHA` | Nhóm chi phí, hạng mục, vật tư, nhà / khu. |

Mục **Kiểm soát** (trên “Cài đặt”; con số màu vàng = số việc cần xử lý): **Cần xử lý**, **Kiểm quỹ**, **Khóa sổ**,
**Nhật ký thay đổi**, **Thùng rác** — xem mục 16.

---

## 3. Ghi sổ nhanh

- Bấm **Ghi thu / chi** (hoặc phím **F2**).
- Chọn **Chi tiền / Thu tiền / Thu & chi cùng lúc** (loại thứ ba dùng cho các khoản "đã thanh toán trước, thực tế không có thu" như trong file cũ).
- **Ngày** luôn nhập dạng ngày/tháng/năm: gõ `29/9` là đủ (tự hiểu năm nay), hoặc `29/09/2026`, `290926`. Phím ↑ ↓ để tăng/giảm 1 ngày.
- **Số phiếu**: bấm **Số mới** để lấy số kế tiếp trong tháng (VD `PC045/09`). Nhiều dòng dùng chung một số phiếu sẽ được gộp khi in.
- **Mã dự án / Mã NCC**: gõ mã **hoặc gõ tên** rồi chọn trong danh sách gợi ý. Nếu chưa có, bấm “thêm mới” ngay trong form.
- Khi chọn nhà cung cấp có chi phí công trình, dưới ô hiện luôn **công nợ còn lại** (theo dự án đang chọn) và nút **Điền số này**.
- **Số tiền** gõ được: `1.250.000`, `1250000`, `50tr`, `1,5tr`, `300k`, hoặc phép tính `58000+11000` (giống cách ghi công thức trong Excel cũ). Cách ghi dính như `2tr5` hoặc `1tr250k` bị từ chối (phần mềm không đoán ý) — hãy viết `2,5tr` hoặc `1tr+250k`. Bên dưới hiện luôn số tiền bằng chữ để đối chiếu.
- Bấm **Ghi sổ** (hoặc **Ctrl + Enter**) để ghi vào sổ; **Esc** để đóng. Nút **Ghi sổ và ghi tiếp** giữ lại ngày, số phiếu, dự án, NCC để ghi dòng kế tiếp của cùng phiếu.
- Nếu còn thiếu hoặc sai (chưa có nội dung, số tiền không hợp lệ, mã chưa có trong danh mục...), lời nhắc **hiện ngay dưới ô bị sai** và con trỏ nhảy vào ô đó; sửa xong lời nhắc tự mất.
- Dòng vừa ghi hoặc vừa sửa được **tô vàng** trong sổ vài giây để dễ kiểm tra lại.
- Bấm đúp vào một dòng trong sổ để sửa.

---

## 4. In phiếu thu / chi

1. Vào **Phiếu thu / chi**, chọn phiếu ở danh sách bên trái (hoặc bấm vào số phiếu trong sổ).
2. Kiểm tra bản xem trước. Có thể sửa riêng cho phiếu: ngày in, người nhận, địa chỉ, lý do, hình thức, số chứng từ kèm theo
   (để trống = tự lấy từ sổ và danh mục). Bấm **Lưu thông tin phiếu** để ghi nhớ.
3. Bấm **In phiếu (2 liên)** — in ra 1 tờ A4 dọc gồm Liên 1 (lưu) và Liên 2 (giao khách) có đường cắt.

Tên Giám đốc, Thủ quỹ… in dưới chữ ký được đặt trong **Cài đặt & dữ liệu**. Phiếu thu/chi chỉ có chỗ ký Giám đốc, người nộp/nhận tiền và Thủ quỹ (không có Kế toán trưởng).

---

## 5. Xuất Excel

Nút **Xuất Excel** ở góc trên bên phải:

- **Toàn bộ sổ sách** — file giống file gốc, đủ các sheet: `Tong_Quan` (kèm biểu đồ), `So_Thu_Chi_Hang_Ngay`, `Phieu_Chi`,
  `Danh_Muc_Du_An`, `Danh_Muc_NCC`, `Tong_Hop_NCC`. **Vẫn giữ công thức**: tên dự án/NCC tự tra, tồn quỹ lũy kế, SUMIF tổng hợp.
  Ở sheet `Phieu_Chi` chọn số phiếu trong ô vàng C4 là cả 2 liên tự cập nhật để in từ Excel như trước.
- **Sổ thu chi** — theo đúng bộ lọc đang chọn (kỳ, dự án, NCC…), có số dư đầu kỳ, cộng phát sinh, tồn cuối kỳ, chỗ ký.
- **Tổng hợp & chi tiết theo dự án** — bảng tổng hợp + biểu đồ + sổ chi tiết từng dự án.
- **Tổng hợp & chi tiết theo NCC** — bảng tổng hợp + sổ chi tiết thanh toán từng NCC.
- **Phiếu đang chọn** — phiếu 2 liên dạng Excel để in hoặc gửi.
- **Chi phí công trình**, **Sổ chi phí**, **Công nợ nhà cung cấp** — xem mục 14.

File được tải về thư mục **Downloads** của trình duyệt.

---

## 6. Nhập dữ liệu từ Excel

**Cài đặt & dữ liệu → Nhập dữ liệu từ file Excel**: chọn file theo mẫu cũ (hoặc file xuất từ phần mềm).
Phần mềm tự nhận ra đây là file **sổ thu chi** hay file **chi phí công trình** (mục 14).
Với file sổ thu chi, phần mềm đọc thử, cho xem trước số dòng, tổng thu/chi, các lưu ý, rồi bạn chọn:

- **Thay thế toàn bộ dữ liệu** — thay phần sổ thu chi bằng dữ liệu trong file (dữ liệu chi phí công trình giữ nguyên).
- **Gộp thêm** — chỉ thêm các dòng / dự án / NCC chưa có (dòng trùng hoàn toàn được bỏ qua).

---

## 7. Sao lưu — dữ liệu nằm ở đâu

- Dữ liệu: **`C:\KeToan\data\ketoan.db`** (cơ sở dữ liệu SQLite, một file; lưu ngay sau mỗi thao tác, mỗi lần lưu là trọn vẹn
  hoặc không có gì — mất điện giữa chừng thì lần mở sau tự bỏ phần dở dang).
  Bản trước đây lưu ở `ketoan.json`; file đó nay là `ketoan.json.da-chuyen-sqlite.bak` (chỉ để dự phòng, phần mềm không dùng nữa).
- Sao lưu tự động: `C:\KeToan\data\backups\` — file `ketoan-<ngày giờ>-<lý do>.db`, tự tạo định kỳ (tối đa 1 bản / 10 phút khi đang
  sửa) và **trước mỗi thao tác lớn** (nhập Excel, khôi phục, xóa); giữ 60 bản mới nhất. Các bản `.json` từ trước khi chuyển vẫn nằm
  đó và vẫn khôi phục được; bản “Trước khi chuyển sang SQLite” không bao giờ bị tự xóa.
  Khôi phục bằng 1 nút trong **Cài đặt & dữ liệu → Bản sao lưu tự động**.
- Chứng từ đính kèm (ảnh, PDF): `C:\KeToan\data\attachments\`. Nhật ký thay đổi: `C:\KeToan\data\nhat-ky.jsonl`.
- Nên định kỳ bấm **Tải bản sao lưu đầy đủ (.zip)** — gồm dữ liệu (cả `ketoan.db` lẫn `ketoan.json`), chứng từ đính kèm và nhật ký —
  rồi cất ra USB / Google Drive. Nút **Tải bản sao lưu chỉ dữ liệu (.db)** cho file nhỏ, không kèm ảnh; nút **Xuất dữ liệu ra file .json**
  dùng khi cần quay lại phiên bản cũ (mục 17). **Khôi phục từ file sao lưu** nhận `.zip`, `.db` và `.json`; phần mềm kiểm tra file
  trước, file hỏng / không phải của phần mềm thì báo lỗi và **giữ nguyên** dữ liệu đang có; file hợp lệ thì tự sao lưu dữ liệu hiện tại
  rồi mới thay.
- Không mở `ketoan.db` bằng chương trình khác (DB Browser…) **trong lúc phần mềm đang chạy**. Nếu lỡ sửa, phần mềm phát hiện và báo
  “dữ liệu vừa bị một chương trình khác thay đổi”, nạp lại dữ liệu mới nhất, không ghi đè.

**Chuyển sang máy khác:**
1. Tắt phần mềm (đóng cửa sổ đen) — để `ketoan.db` không đang được ghi.
2. Chép **cả thư mục** `C:\KeToan` (gồm `data\ketoan.db`, `data\backups`, `data\attachments`, `data\nhat-ky.jsonl`) sang máy mới.
   Có thể đặt ở thư mục có dấu cách / chữ có dấu (vd `D:\Kế toán\Sổ thu chi`).
3. Cài Node.js **24.16.0 trở lên** (bản LTS) hoặc **26.1.0 trở lên** trên máy mới, rồi bấm `KhoiDong.bat`.
   Cách khác: trên máy cũ bấm **Tải bản sao lưu đầy đủ (.zip)**, trên máy mới cài phần mềm rồi **Khôi phục từ file sao lưu**.

---

## 8. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Bấm `KhoiDong.bat` báo chưa cài Node.js | Cài Node.js bản LTS tại https://nodejs.org rồi chạy lại. |
| `KhoiDong.bat` báo Node.js “không dùng được với phần mềm này” | Cần Node.js **24.16.0 trở lên** (dòng 24 LTS) hoặc **26.1.0 trở lên** (dòng 25 và 26.0 không dùng được). Vào https://nodejs.org, tải bản **LTS** (Windows Installer .msi), cài đè lên bản cũ, rồi chạy lại. Dữ liệu không bị ảnh hưởng. |
| Lần đầu chạy bản SQLite báo **“Chưa chuyển được dữ liệu sang SQLite”** | Phần mềm dừng để an toàn, **`ketoan.json` giữ nguyên, chưa bị sửa**. Mở `data\migrate-bao-cao.txt` xem lý do (dòng “Kết quả”). Nếu là file `ketoan.json` hỏng: lấy bản đúng trong `data\backups` (bản `.json` mới nhất) chép đè thành `data\ketoan.json` rồi chạy lại. Lý do khác: gửi cả thư mục `data` cho người hỗ trợ; trong lúc chờ có thể dùng bản cũ (mục 17). |
| Cửa sổ đen báo “Có cả ketoan.db và ketoan.json” | Phần mềm dùng `ketoan.db`; `ketoan.json` bên cạnh **không** được tự nhập. Muốn đưa dữ liệu trong file đó vào: **Cài đặt → Khôi phục từ file sao lưu** chọn file đó. |
| Báo “file dữ liệu đang bị một chương trình khác khóa” | Đóng chương trình đang mở `ketoan.db` (DB Browser, phần mềm mở ở cửa sổ khác, phần mềm sao lưu / diệt virus đang quét) rồi chạy lại. |
| Báo “Không lưu được dữ liệu… CHƯA được ghi” | Thao tác vừa rồi không được lưu, dữ liệu giữ như trước. Thường do ổ đĩa đầy hoặc file bị khóa: giải phóng ổ đĩa / đóng chương trình đang khóa file rồi làm lại. |
| Trình duyệt báo “Không kết nối được”, hoặc đầu trang hiện dải đỏ **“Mất kết nối với phần mềm”** | Cửa sổ đen đã bị đóng → bấm lại `KhoiDong.bat`, rồi bấm **Thử lại** trên dải đỏ. Nội dung đang gõ trong hộp thoại vẫn còn, bấm Ghi sổ lại là được. |
| Nhập nhầm / xóa nhầm | Vào **Cài đặt & dữ liệu → Bản sao lưu tự động**, khôi phục bản trước thời điểm nhầm. |
| Mở phần mềm báo “file dữ liệu bị hỏng” | Phần mềm tự lấy lại bản sao lưu gần nhất còn đọc được (`.db` hoặc `.json`) và giữ file hỏng với tên `ketoan.db.hong-…` trong thư mục `data`. Nếu báo không có bản sao lưu nào đọc được: đừng xóa gì, chép cả thư mục `data` cho người hỗ trợ. |
| Cổng 3939 bị phần mềm khác dùng | Phần mềm tự chuyển sang cổng kế tiếp (3940, 3941…) và mở đúng địa chỉ. |
| Màn hình không thấy chức năng mới | Bấm **Ctrl + F5** trên trình duyệt để tải lại giao diện. |

---

## 9. Chi phí công trình — cách làm việc hằng ngày

1. **Danh mục** (làm một lần): mỗi công trình là một **dự án** trong danh mục Dự án (có thêm *Ngày khởi công*,
   *Địa chỉ*, *Trạng thái*). Vào **Danh mục chi phí → Nhà / khu**, thêm các nhà của công trình và một mục
   **“Dùng chung cả công trình”** cho chi phí không tách được về một nhà.
2. Mỗi chuyến hàng / mỗi hóa đơn: vào **Phiếu nhập chi phí** (phím **F3**), khai báo đầu phiếu rồi nhập từng dòng.
3. Mỗi lần trả tiền NCC: ghi **phiếu chi** trong **Sổ thu chi** như cũ, nhớ chọn **đúng Mã NCC và Mã dự án** —
   công nợ tự trừ.
4. Xem **Tổng hợp chi phí**, **Chi tiết theo nhóm**, **Công nợ NCC** bất cứ lúc nào; số liệu luôn tính lại ngay.

---

## 10. Phiếu nhập chi phí

- **Đầu phiếu**: Ngày, Công trình, Nhà / khu (để trống hoặc chọn nhà dùng chung), Nhà cung cấp, Số phiếu / chuyến,
  **Hạng mục** mặc định cho cả phiếu. Gõ **mã hoặc tên** rồi chọn trong gợi ý. Chọn công trình xong, phần mềm tự
  điền nhà “dùng chung” của công trình đó. Dưới ô Nhà cung cấp hiện luôn **công nợ còn lại** của NCC tại công trình.
- **Các dòng hàng**: Mã VT → tự hiện **Tên vật tư, ĐVT**; gõ Số lượng, Đơn giá → **Thành tiền tự tính**, tổng phiếu
  và số tiền bằng chữ hiện ở cuối bảng.
  - Gõ mã hoặc **gõ đúng tên vật tư** đều được. Danh sách gợi ý đưa vật tư của hạng mục đang chọn lên đầu.
  - **Gợi ý đơn giá**: chọn mã VT xong, ô đơn giá tự điền giá **lần mua gần nhất của vật tư đó với NCC này**
    (chữ xanh nghiêng; nếu NCC này chưa bán thì lấy giá gần nhất của NCC khác). Gõ đè để đổi.
  - Số lượng nhận `2,5` / `2.5` / `1.000` / `10+5` / `3*2,5`. Đơn giá nhận `1.250.000`, `50tr`, `1,5tr`, `300k`, `58000+11000`.
  - Khoản không có mã vật tư (nhân công, phí, thuế): bỏ trống Mã VT, ghi **Diễn giải**.
  - **Chỉ biết tổng tiền (khoán)**: để trống Số lượng và Đơn giá, gõ thẳng vào ô **Thành tiền** (nhận `12tr`, `12.500.000`…).
    Dòng được lưu là Số lượng 1 × Đơn giá = Thành tiền, nên mọi báo cáo và file Excel vẫn khớp. Nên dùng cho dòng không có
    mã vật tư; dòng có mã vật tư mà nhập khoán thì đơn giá đó sẽ được tính vào lịch sử giá của vật tư.
  - **Biết số lượng và tổng tiền**: gõ Số lượng và Thành tiền, Đơn giá tự tính (= Thành tiền ÷ Số lượng). Chia không chẵn
    đồng thì ô Đơn giá để trống (chữ “tự tính”), khi lưu phần mềm tính đơn giá tới 2 số lẻ sao cho Số lượng × Đơn giá đúng
    bằng Thành tiền.
  - **Hạng mục riêng**: ghi nếu dòng đó khác hạng mục đầu phiếu. **Loại CP** để “Tự động” (theo loại mặc định của vật tư;
    hạng mục tên “Nhân công…” → Nhân công; có mã VT → Vật tư; không có mã VT → Dịch vụ-Phí) hoặc chọn tay.
  - Mã chưa có trong danh mục: ô báo đỏ kèm nút **Thêm** để thêm nhanh ngay trong phiếu.
- **Phím tắt**: **Enter** sang ô kế tiếp (Mã VT → Diễn giải → Số lượng → Đơn giá → dòng sau; Đơn giá để trống thì
  sang ô Thành tiền rồi mới sang dòng sau), **↑ ↓** đổi dòng,
  **Ctrl + Delete** xóa dòng, **Ctrl + Enter** lưu phiếu. Gõ vào dòng cuối là tự thêm dòng mới.
- **Ghi vào sổ chi phí**: giống macro `GhiPhieuNhap` — các dòng được ghi vào Sổ chi phí, phần hàng và số phiếu được xóa trắng,
  đầu phiếu giữ lại để nhập chuyến tiếp theo. Phiếu đang nhập dở được giữ lại nếu lỡ chuyển sang màn hình khác.
- **Phiếu đã nhập** (cuối trang): tìm, **sửa**, **nhân bản**, **xóa** cả phiếu.
- Phần mềm **không cho lưu** khi: thiếu ngày / công trình / NCC / hạng mục, mã không có trong danh mục,
  số lượng ≤ 0, đơn giá âm, không có cả (Số lượng và Đơn giá) lẫn Thành tiền, có Đơn giá và Thành tiền mà thiếu Số lượng,
  nhà không thuộc công trình đã chọn. Lỗi ở đầu phiếu hiện ngay dưới ô; lỗi ở dòng hàng tô đỏ ô đó và báo “Dòng n: …”.
- **Cảnh báo giá lệch**: nếu đơn giá gõ vào cao hơn 1,5 lần hoặc thấp hơn 2/3 giá lần mua gần nhất của vật tư đó, ô đơn giá
  chuyển màu vàng kèm dòng “Cao hơn …% giá lần trước” (rê chuột để xem giá và ngày lần trước). Đây chỉ là nhắc kiểm tra
  (hay gặp khi gõ thừa/thiếu số 0), vẫn lưu được bình thường.

---

## 11. Sổ chi phí, chi tiết theo nhóm

- **Sổ chi phí**: lọc theo kỳ, công trình, nhà, nhóm, hạng mục, loại CP, NCC, vật tư, tìm chữ hoặc số tiền.
  Đầu bảng có tổng và tổng theo từng loại CP.
  - **Bấm đúp** vào ô Diễn giải, Số lượng, Đơn giá, Thành tiền, Hạng mục, Loại CP (nhãn nhỏ dưới hạng mục), Vật tư, NCC, Nhà
    để **sửa ngay trong bảng** (Enter lưu, Esc bỏ). Sửa Thành tiền thì giữ Số lượng, Đơn giá được tính lại. Nút bút chì mở form sửa đủ các cột; nút nhân bản, xóa ở cuối dòng;
    nút phiếu mở cả phiếu nhập chứa dòng đó.
  - Đổi ngày / công trình / nhà / NCC / số phiếu của riêng một dòng thì dòng đó tự tách thành phiếu riêng.
- **Chi tiết theo nhóm**: chọn mức **1** (chỉ tổng nhóm), **2** (thêm cộng hạng mục), **3** (toàn bộ chi tiết);
  bấm vào dòng nhóm / hạng mục để bung, thu gọn từng khối.

---

## 12. Công nợ, giá vật tư

- **Nợ và đã thanh toán theo công trình** (đầu màn Công nợ NCC, và cuối màn Tổng hợp chi phí): mỗi công trình một dòng gồm
  Chi phí phát sinh, **Đã thanh toán NCC**, % đã thanh toán, **Còn nợ NCC** (kèm số NCC còn nợ), Ứng dư NCC và Chi khác
  (khoản chi có mã dự án nhưng không ghi NCC). Còn nợ và ứng dư cộng theo từng NCC: NCC này ứng dư không bù cho NCC khác
  còn nợ. Bấm một công trình để xem công nợ từng NCC của công trình đó; bấm lần nữa để bỏ lọc. Đánh dấu “Hiện cả dự án
  chưa nhập chi phí” để xem thêm số đã trả NCC của các dự án khác. Nếu có khoản trả cho NCC công trình mà chưa ghi mã
  dự án, phần mềm nhắc ngay dưới bảng.
- **Công nợ NCC** = Chi phí phát sinh (Sổ chi phí) − Đã trả (Sổ thu chi: tổng **chi** trừ tổng **thu** của cùng
  Mã NCC). Chọn công trình thì chỉ tính các dòng cùng Mã dự án. Hai sổ **không sửa dữ liệu của nhau**.
  - Còn nợ: phát sinh > đã trả. Ứng dư: đã trả nhiều hơn khối lượng đã ghi (thường do chưa nhập khối lượng nghiệm thu).
  - Mặc định chỉ hiện **NCC liên quan công trình** (có chi phí, hoặc có khoản trả gắn với công trình đang có chi phí);
    đổi ở ô chọn phạm vi để xem mọi NCC.
  - **Lọc theo mã NCC**: chọn một nhà cung cấp ở ô “Tất cả nhà cung cấp” (NCC có chi phí công trình nằm trên đầu). Bảng chỉ
    còn NCC đó, phần chi tiết mở sẵn, bảng **theo công trình** chỉ còn các công trình NCC đó có chi phí hoặc thanh toán (xem
    nhanh nợ NCC này ở từng công trình). Kết hợp được với ô Công trình và Đến ngày; In và Xuất Excel theo đúng bộ lọc.
    Bỏ lọc: chọn lại “Tất cả nhà cung cấp” hoặc bấm “Xem tất cả nhà cung cấp”.
  - Bấm một NCC để xem các phiếu chi phí và các lần trả tiền; nút **Trả tiền / Ghi phiếu chi** mở sẵn form ghi chi
    trong Sổ thu chi với đúng NCC, dự án và số còn nợ.
- **Giá vật tư**: danh sách vật tư đã mua (số lần, giá gần nhất, cột **Chênh giá** = giá cao nhất so với giá thấp nhất, rê chuột để xem hai mức giá); chọn một vật tư để xem lịch sử đơn giá
  từng lần mua theo NCC, chênh lệch so với lần trước, biểu đồ giá.

---

## 13. Danh mục chi phí

- **Nhóm chi phí** (6 nhóm lớn như file mẫu): đổi tên thoải mái, mọi hạng mục và báo cáo tự đổi theo.
  Nên giữ số thứ tự ở đầu tên (`1. `, `2. `...) để báo cáo xếp đúng thứ tự.
- **Hạng mục**: mã HM, tên, thuộc nhóm. **Đổi tên / chuyển nhóm** thì sổ chi phí và báo cáo tự cập nhật
  (sổ chỉ lưu mã hạng mục, không lưu tên).
- **Vật tư**: Mã VT, tên, ĐVT chuẩn, hạng mục hay dùng, loại CP mặc định; **số lần đã mua, tổng đã mua** tự tính.
- **Nhà / khu**: thuộc công trình nào; đánh dấu “Dùng chung cả công trình”.
- Đổi mã ở bất kỳ danh mục nào (kể cả dự án, NCC) thì mọi dòng đang dùng mã cũ được đổi theo.
  Không xóa được mã đang được dùng.

---

## 14. Nhập / xuất Excel chi phí

- **Nhập**: Cài đặt → Nhập dữ liệu từ file Excel → chọn file `ChiPhi_CongTrinh_*.xlsm` (hoặc file chi phí xuất từ
  phần mềm). Phần mềm đọc NHATKYCHUNG và các DM_* (sheet DUTOAN nếu có sẽ được bỏ qua); **các cột công thức không nhập nguyên văn mà tính lại**
  (Thành tiền = Số lượng × Đơn giá; tên vật tư, nhóm, tên NCC tra từ danh mục). Màn xem trước cho biết:
  - Số dòng, tổng chi phí, tổng theo loại; các cảnh báo (mã VT lạ, hạng mục lạ, dòng thiếu dữ liệu,
    số tổng lưu sẵn trong file khác số tính lại...). Mã lạ được tự thêm vào danh mục và báo lại.
  - **Ghép mã công trình**: mã công trình trong file (vd. `111THANHTHUY`) nên ghép vào dự án đã có (vd. `DATT111`)
    để công nợ nối được với Sổ thu chi. Phần mềm tự gợi ý theo tên.
  - Tùy chọn **nhập cả SO_QUY vào Sổ thu chi** — chỉ chọn khi các khoản trả tiền đó chưa được ghi trong Sổ thu chi.
  - **Gộp thêm** (bỏ qua dòng trùng đã có) hoặc **Thay toàn bộ dữ liệu chi phí** (Sổ thu chi không bị động tới).
  - Luôn tự sao lưu trước khi nhập.
- **Xuất**: nút **Xuất Excel → Chi phí công trình** (hoặc Cài đặt → Xuất chi phí công trình; ở màn Tổng hợp chi phí thì
  xuất riêng công trình đang chọn). File có các sheet TONGHOP (kèm biểu đồ), NHATKYCHUNG, CHI_TIET_THEO_NHOM
  (thu gọn 1/2/3), CONGNO_NCC, CONGNO_CONGTRINH (nợ và đã thanh toán theo công trình), SO_QUY, GIA_VATTU và các DM_*, **giữ công thức** SUMIFS, INDEX/MATCH như file mẫu,
  và nhập lại được vào phần mềm. Màn Sổ chi phí và Công nợ có nút xuất theo bộ lọc.

---

## 15. Lưu ý khi chuyển từ file Excel mẫu

- File `ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm` đang có số “TỔNG CHI PHÍ” lưu sẵn **1.271.799.000 đ**, nhưng
  sheet NHATKYCHUNG hiện chỉ còn 104 dòng, cộng lại **1.129.929.000 đ** (Excel tính lại cũng ra số này).
  Chênh **141.870.000 đ** là **22 dòng tháng 8/2026** vẫn còn trong sheet CHI_TIET_THEO_NHOM cũ nhưng đã mất khỏi
  NHATKYCHUNG. Các dòng này được tách sẵn ra file `tai-lieu/DongThieu_NHATKYCHUNG_Thang8.xlsx`: kiểm tra lại, đúng thì
  nhập file đó bằng chế độ **Gộp thêm** (ghép `111THANHTHUY` vào dự án `DATT111`). Chi tiết đối chiếu từng con số:
  `tai-lieu/DoiChieu_ChiPhi_voi_Excel.md`.
- Các khoản trả tiền trong sheet SO_QUY của file mẫu (10 dòng “thanh toán công nợ, c Dung chi”, 1.230.569.000 đ)
  **không** được đưa vào Sổ thu chi của phần mềm, vì Sổ thu chi đang là sổ quỹ tiền mặt thật. Nếu muốn công nợ trong
  phần mềm khớp CONGNO_NCC của file Excel, hãy ghi các khoản trả này vào Sổ thu chi (hoặc nhập lại file mẫu với tùy
  chọn “nhập cả SO_QUY”).
- Xóa riêng dữ liệu chi phí: Cài đặt → **Xóa dữ liệu chi phí công trình** (Sổ thu chi giữ nguyên).

---

## Ghi chú kỹ thuật

- Chạy bằng Node.js (`node server.js`), chỉ nhận kết nối từ chính máy này (127.0.0.1), không gửi dữ liệu ra ngoài.
- Thư viện duy nhất: `exceljs` (lần đầu chạy `KhoiDong.bat` tự cài).
- Cấu trúc: `server.js` (máy chủ + API), `lib/` (lưu trữ, nhập/xuất Excel, biểu đồ; `costApi.js`, `costImporter.js`,
  `costExporter.js` cho chi phí công trình), `public/` (giao diện; `views/cost-*.js` cho chi phí công trình),
  `public/js/shared.js` (công thức tính dùng chung: tồn quỹ, tổng hợp, gộp phiếu, đọc số tiền bằng chữ, thành tiền,
  tổng hợp chi phí, công nợ, giá vật tư).
- Dữ liệu lưu bằng SQLite có sẵn trong Node.js (`node:sqlite`, không cần cài thêm thư viện): `data/ketoan.db`, lược đồ phiên bản 4
  (`PRAGMA user_version`). Phiên bản 3 là `data/ketoan.json` (thêm thùng rác, trạng thái nháp, khóa sổ, cảnh báo đã bỏ qua, kiểm quỹ,
  chứng từ đính kèm); phiên bản 4 chỉ đổi cách lưu, hình dạng dữ liệu giữ nguyên. Thiết kế chi tiết: `docs/THIET_KE_SQLITE.md`.
- Cần Node.js ≥ 24.16.0 (dòng 24) hoặc ≥ 26.1.0: bản cũ hơn có lỗi cắt chữ tại ký tự NUL khi ghi vào SQLite.
- Nhật ký thay đổi ở `data/nhat-ky.jsonl` (mỗi dòng một thao tác, chỉ ghi thêm), chứng từ ở `data/attachments/`.

---

## 16. Kiểm soát sổ sách — số liệu luôn đúng, mọi thay đổi đều truy vết được

### 16.1 Ai đang dùng máy (ghi vào nhật ký)
Cài đặt → **Người đang dùng máy này**: gõ tên (VD “Thúy kế toán”) rồi **Lưu tên**. Từ đó mọi thêm, sửa, xóa trên máy này
được ghi kèm tên. Mỗi máy đặt tên riêng; không đặt thì nhật ký ghi “không rõ”.

### 16.2 Nhật ký thay đổi
Kiểm soát → **Nhật ký thay đổi**: mọi lần thêm / sửa / xóa dòng sổ, phiếu nhập, dòng chi phí, danh mục, cài đặt, nhập Excel,
khôi phục, khóa / mở khóa sổ, kiểm quỹ, đính kèm, bỏ qua cảnh báo… kèm thời điểm, người thao tác, giá trị **trước và sau**.
- Lọc theo ngày, loại thao tác, loại dữ liệu, số bản ghi, từ khóa (gõ không dấu cũng tìm được, gõ số tiền cũng được).
- Bấm một dòng để xem trường nào đổi (chữ đỏ gạch = trước, chữ xanh = sau). Bấm **số bản ghi** để xem toàn bộ lịch sử của bản ghi đó.
- Trong form sửa dòng sổ có nút **Lịch sử**; khi sửa phiếu nhập có nút **Lịch sử phiếu**.
- Dữ liệu từ trước khi nâng cấp không có lịch sử: nhật ký bắt đầu bằng một mục “Khởi tạo từ dữ liệu cũ”.

### 16.3 Xóa và Thùng rác
Bấm Xóa ở bất cứ đâu (dòng sổ, phiếu nhập, dòng chi phí, dự án, NCC, hạng mục, vật tư, nhà, biên bản kiểm quỹ, chứng từ) đều
**chỉ chuyển vào Thùng rác**: không còn tính vào sổ, báo cáo, tồn quỹ, công nợ, file Excel xuất ra.
- Kiểm soát → **Thùng rác** → **Khôi phục** để đưa về nguyên như cũ (giữ đúng số thứ tự, chứng từ đính kèm đi theo).
- Khôi phục bị từ chối nếu mã danh mục đã bị tạo lại, hoặc bản ghi dùng một danh mục đã xóa (phần mềm báo rõ cần khôi phục gì trước),
  hoặc thuộc tháng đã khóa sổ.
- **Xóa vĩnh viễn** (từng mục, hoặc “Xóa vĩnh viễn tất cả” phải gõ XOA) — có ghi nhật ký. File chứng từ khi xóa vĩnh viễn được chuyển
  sang `data/attachments/_da-xoa/` chứ không mất hẳn (để các bản sao lưu cũ vẫn mở được).
- Riêng “Xóa toàn bộ dữ liệu sổ / chi phí” ở Cài đặt vẫn là xóa hẳn (đã có bản sao lưu tự động ngay trước khi xóa) và bị chặn nếu
  còn tháng đã khóa sổ.

### 16.4 Phiếu Nháp
Khi chưa chắc (chờ hóa đơn, chờ duyệt), bấm **Lưu nháp** thay cho Ghi sổ (form Ghi thu / chi và Phiếu nhập chi phí).
- Dòng / phiếu **Nháp** hiện trong sổ với nhãn vàng “Nháp”, **không** tính vào tồn quỹ, tổng thu chi, báo cáo, công nợ, file Excel.
- Khi đã có dòng nháp, sổ có thêm bộ lọc **Mọi trạng thái / Đã ghi sổ / Nháp**.
- Ghi sổ: bấm dấu ✓ trên dòng nháp, hoặc mở ra rồi bấm **Ghi sổ**. Dữ liệu cũ đều là “Đã ghi sổ”.
- Nháp để quá 7 ngày (chỉnh được) sẽ hiện trong “Cần xử lý”.

### 16.5 Khóa sổ theo tháng
Kiểm soát → **Khóa sổ**: bảng từng tháng (số dòng, thu, chi, chi phí, số dòng nháp). Đối chiếu xong tháng nào thì **Khóa** tháng đó
(hoặc chọn “Khóa sổ đến hết tháng …” để khóa nhiều tháng một lần).
- Tháng đã khóa: không thêm / sửa / xóa / khôi phục / ghi sổ nháp được dòng nào; trong sổ các dòng đó có hình ổ khóa, mở ra chỉ xem.
  Nhập Excel sẽ **bỏ qua** các dòng thuộc tháng đã khóa (có cảnh báo); chế độ “thay toàn bộ” vẫn giữ nguyên dữ liệu các tháng đã khóa.
- Tháng còn dòng Nháp thì không khóa được (ghi sổ hoặc xóa nháp trước).
- Cần sửa: bấm **Mở khóa**, **bắt buộc ghi lý do** — được lưu vào nhật ký. Sửa xong nhớ khóa lại.

### 16.6 Cần xử lý (kiểm tra bất thường)
Phần mềm tự rà soát và đếm số việc (con số vàng trên menu “Kiểm soát” và ô đầu mục “Cần chú ý” ở Tổng quan):
- **Nghi trùng**: hai dòng chi phí cùng ngày, NCC, vật tư, thành tiền; hai dòng sổ cùng ngày, NCC (hoặc nội dung), số tiền.
- **Đơn giá lệch nhiều so với giá thường mua** cùng vật tư, cùng NCC (mặc định lệch quá 30%, chỉnh được). Mã chung “XX-…” không so.
- **Ngày bất thường**: ở tương lai, trước năm 2000, hoặc khác xa các dòng nhập liền trước / liền sau (hay gặp khi gõ nhầm năm).
- **Vật tư chưa xác định** (mã XX-CHUAXACDINH) hoặc vật tư đang dùng mà chưa gán hạng mục.
- **Thiếu hạng mục** hoặc mã NCC / dự án / công trình chưa có trong danh mục.
- **Phiếu nháp để lâu** chưa ghi sổ; **số tiền âm hoặc bằng 0**; **kiểm quỹ có chênh lệch**.

Mỗi cảnh báo có nút **Mở để sửa** (mở đúng dòng / phiếu), **Xem trong sổ** (với nghi trùng) và **Bỏ qua** (khi đúng thật, có thể ghi chú;
có lưu nhật ký, không nhắc lại; muốn xem lại tick “Hiện cả cảnh báo đã bỏ qua” rồi **Theo dõi lại**).

### 16.7 Kiểm quỹ (đối chiếu tồn quỹ)
Kiểm soát → **Kiểm quỹ**: chọn ngày, đếm tiền trong két, nhập **Số tiền thực tế** (hoặc mở “Bảng kê số tờ theo mệnh giá” để phần mềm
tự cộng). Phần mềm hiện ngay **tồn quỹ theo sổ** (đến hết ngày đó, không tính nháp) và **chênh lệch thừa / thiếu**.
- **Lưu biên bản kiểm quỹ** → có trong bảng “Các lần kiểm quỹ”; nút máy in để **in biên bản kiểm kê quỹ** (A4, có chỗ ký),
  nút Excel để xuất biên bản.
- Chênh lệch khác 0 được đưa vào “Cần xử lý” cho tới khi tìm ra nguyên nhân (sửa sổ cho khớp, hoặc Bỏ qua kèm lý do).
- Nếu sổ bị sửa sau ngày kiểm quỹ, cột “Theo sổ hiện nay” chuyển màu để biết số theo sổ đã khác lúc kiểm.

### 16.8 Đính kèm chứng từ
Mở một dòng sổ thu chi (sửa), một dòng chi phí, hoặc một phiếu nhập đã lưu → khung **Chứng từ đính kèm** → **Đính kèm ảnh / PDF**
(chọn được nhiều file; chụp hóa đơn bằng điện thoại rồi chép vào máy cũng được).
- Nhận ảnh JPG, PNG, WEBP hoặc PDF, tối đa 10 MB mỗi file. Bấm tên file để xem (ảnh hiện ngay, PDF mở tab mới), nút tải về, nút xóa.
- Dòng có chứng từ hiện **kẹp giấy kèm số lượng** trong sổ; bấm vào để xem nhanh.
- Chứng từ nằm trong `data/attachments/`, có trong **bản sao lưu đầy đủ (.zip)**; xóa dòng thì chứng từ vào thùng rác cùng dòng đó.

---

## 17. Dữ liệu SQLite — chuyển đổi, kiểm tra, quay lại bản cũ

### 17.1 Lần đầu chạy bản SQLite
1. **Trước khi chạy**: chép cả thư mục `C:\KeToan\data` ra một chỗ khác (USB / thư mục khác) — để chắc chắn tuyệt đối.
2. Cài Node.js 24.16.0 trở lên (hoặc 26.1.0 trở lên), bấm `KhoiDong.bat`.
3. Phần mềm tự chuyển `ketoan.json` → `ketoan.db` (vài giây; dữ liệu rất lớn có thể tới 5–10 giây). Nếu đối chiếu lệch dù 1 đồng thì
   **không chuyển**, dừng lại và giữ nguyên `ketoan.json`.
4. Kiểm tra: mở **Tổng quan** — tồn quỹ phải đúng như trước khi nâng cấp; mở `data\migrate-bao-cao.txt` — mọi dòng đều “khớp”, mục
   “Dữ liệu bất thường” liệt kê những chỗ đáng xem lại (mã mồ côi, số dạng chữ…; phần mềm giữ nguyên chúng, không tự sửa).
5. Chạy lại các lần sau: không chuyển lần hai, không nhân đôi dữ liệu.

### 17.2 Quay lại phiên bản cũ (lưu bằng JSON) — kế hoạch dự phòng
Dùng khi bản SQLite gặp sự cố mà chưa kịp sửa. **Không mất dữ liệu đã nhập sau khi chuyển**, miễn là làm đủ bước 1:
1. Đang ở bản SQLite: vào **Cài đặt & dữ liệu → Xuất dữ liệu ra file .json** (file `DuLieu_SoThuChi_<ngày giờ>.json` vào thư mục
   Downloads). File này chứa **toàn bộ** dữ liệu hiện tại (kể cả mọi thứ nhập sau khi chuyển sang SQLite, thùng rác, khóa sổ, kiểm quỹ),
   cùng dạng với `ketoan.json` cũ. Nên bấm thêm **Tải bản sao lưu đầy đủ (.zip)** (có cả chứng từ và nhật ký) và **Xuất toàn bộ sổ sách
   ra Excel** để có thêm bản đối chiếu.
   - Nếu phần mềm không mở được nữa: lấy bản `.db` mới nhất trong `data\backups` (hoặc chính `data\ketoan.db`) đưa người hỗ trợ xuất ra
     `.json` bằng bản SQLite trên máy khác (Khôi phục file `.db` → Xuất dữ liệu ra file .json). Không có máy nào chạy được thì dùng
     `ketoan.json.da-chuyen-sqlite.bak` (dữ liệu lúc chuyển đổi) và nhập bù phần phát sinh sau đó từ file Excel đã xuất.
2. Tắt phần mềm. Lấy lại mã phiên bản cũ (người hỗ trợ: `git switch feature/truy-vet-chinh-xac`, hoặc giải nén bản phần mềm cũ).
3. Trong thư mục `data`: **đổi tên** `ketoan.db` thành `ketoan.db.tam-ngung` (đừng xóa), rồi chép file `.json` ở bước 1 vào và đặt tên
   là `ketoan.json`. (Không có file bước 1 thì đổi tên `ketoan.json.da-chuyen-sqlite.bak` thành `ketoan.json` — dữ liệu lúc chuyển đổi.)
4. Bấm `KhoiDong.bat` của bản cũ (bản cũ chạy được với Node.js 18 trở lên). Kiểm tra tồn quỹ ở Tổng quan.
   Bản sao lưu `.zip` mới vẫn khôi phục được ở bản cũ (bản cũ đọc phần `ketoan.json` trong đó).
5. Khi muốn dùng lại bản SQLite: đổi tên / xóa `ketoan.db.tam-ngung`, để `ketoan.json` trong thư mục `data`, chạy bản SQLite — phần
   mềm chuyển đổi lại từ đầu (có sao lưu và đối chiếu như lần đầu).

### 17.3 Người hỗ trợ: kiểm tra bằng công cụ
- `node tests/doi-chieu-sqlite.js --goc <thư mục mã bản JSON> data\ketoan.json.da-chuyen-sqlite.bak` chạy song song bản cũ và bản
  mới trên cùng dữ liệu (thư mục tạm, không đụng `data`), so từng bản ghi, mọi con số báo cáo và từng ô của mọi file Excel xuất ra.
- `ketoan.db` mở được bằng DB Browser for SQLite (khi phần mềm đã tắt): mỗi danh sách là một bảng, tên cột trùng tên trường; cột `vt` là
  thứ tự, cột `khac` (JSON) giữ những giá trị bất thường; bảng `meta` chứa cài đặt và bộ đếm id.

---

## 18. Nhập các file Excel công trình (ChiPhi_CongTrinh_*.xlsm) bằng công cụ dòng lệnh

Dùng khi cần đưa **nhiều file Excel công trình** (mỗi file một công trình: sổ chi phí NHATKYCHUNG, sổ quỹ SO_QUY, các danh mục) vào phần
mềm một lần, có làm sạch dữ liệu và báo cáo đầy đủ. Công cụ **không sửa, không xóa** dữ liệu đang có, chỉ thêm; chạy lại không nhân đôi.

### 18.1 Chuẩn bị
1. **Tắt phần mềm** (đóng cửa sổ đen). Đóng Excel (công cụ từ chối khi file đang mở trong Excel).
2. Chép cả thư mục `C:\KeToan\data` ra chỗ khác để chắc chắn (công cụ cũng tự sao lưu `.db` trước khi ghi).
3. Đặt các file `.xlsm` vào thư mục `C:\KeToan\import-input\`. Nếu có cả bản cũ và bản "Copy of …" của cùng một file, công cụ chỉ nhập
   bản "Copy of …"; bản cũ dùng để so sánh.
4. Mở cửa sổ lệnh tại `C:\KeToan` (trong thư mục, gõ `cmd` vào thanh địa chỉ rồi Enter).

### 18.2 Chạy thử (dry-run) — không ghi gì
```
node scripts\import-excel-chiphi.js --dry-run
```
Đọc báo cáo `import-bao-cao\DRY_RUN.md` (mở bằng Notepad hoặc VS Code) và các bảng `import-bao-cao\*.csv` (mở bằng Excel):
- mục 1: số dòng đọc / sẽ nhập / bỏ qua của từng file, tổng tiền so với **số kỳ vọng tính độc lập từ ô nguồn** (phải "khớp");
- mục 4: **các việc cần bạn quyết định** (công trình / NCC nghi trùng, dòng thiếu NCC, khoản sổ quỹ nghi đã có…);
- mục 5 + `van-de.csv`: **mọi dòng bị sửa / suy ra / bỏ qua**, kèm tên file, sheet, số dòng gốc để mở Excel kiểm.
Có thể chạy `node scripts\so-ky-vong-excel.js` để xem riêng các số kỳ vọng (tổng tiền, số dòng) của từng file.

### 18.3 Nhập thật (apply)
```
node scripts\import-excel-chiphi.js --apply --nguoi "Tên của bạn"
```
- Tự sao lưu dữ liệu hiện tại thành `data\backups\ketoan-…-truoc-import-excel.db`.
- Ghi trong **một giao dịch**; trước khi chốt, đọc lại và đối chiếu: dữ liệu cũ không đổi, tổng tiền từng file khớp số kỳ vọng, không có
  dòng mồ côi. Lệch dù 1 đồng thì hủy toàn bộ, dữ liệu giữ nguyên.
- Cuối cùng in **mã lần nhập** (vd `IMP-20261001-101500`) và báo cáo `import-bao-cao\APPLY_<mã>.md`. Ghi lại mã này.
- Chạy `--apply` lần nữa với cùng file: báo "Không có gì mới để nhập". Bổ sung dòng mới vào file Excel rồi chạy lại: chỉ dòng mới được thêm.
- Sổ quỹ (SO_QUY): khoản **đã có trong Sổ thu chi** (cùng số tiền, ngày lệch ≤ 3 ngày, cùng NCC hoặc số phiếu) không nhập lại; khoản chưa
  có được nhập **dạng Nháp** — không tính vào tồn quỹ / công nợ cho tới khi bạn kiểm tra và bấm **Ghi sổ** (hoặc xóa nếu không thuộc quỹ).
  Muốn ghi sổ luôn: thêm `--so-quy ghi-so`; không nhập sổ quỹ: `--so-quy bo-qua`.

### 18.4 Gỡ một lần nhập (rollback)
```
node scripts\import-excel-chiphi.js --rollback IMP-20261001-101500
```
Mọi dòng chi phí / sổ thu chi của lần nhập đó chuyển vào **Thùng rác** (khôi phục được); công trình, nhà, NCC, vật tư, hạng mục do lần nhập
tạo ra được gỡ nếu không còn dòng nào dùng. Tự sao lưu trước (`truoc-rollback-import`). Dòng nào bạn **đã sửa trong phần mềm** sau khi
nhập (phần mềm lưu lại thành dòng mới) thì không gỡ tự động — công cụ báo số lượng để bạn kiểm tra tay. Sau rollback có thể nhập lại.

### 18.5 Tùy chọn khác
`--input <thư mục>` (nơi để file Excel), `--data <thư mục>` (thư mục dữ liệu), `--report <thư mục>` (nơi ghi báo cáo),
`--help`. Công cụ chạy được cả khi thư mục dữ liệu mới chỉ có `ketoan.json` (lần `--apply` đầu sẽ chuyển sang SQLite như khi mở phần mềm).
