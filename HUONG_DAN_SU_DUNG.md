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
| **Phiếu nhập chi phí** | `PHIEU_NHAP` + macro `GhiPhieuNhap` | Khai báo đầu phiếu một lần, nhập nhiều dòng Mã VT × Số lượng × Đơn giá, lưu một lần. Sửa / nhân bản / xóa phiếu. Phím **F3**. |
| **Sổ chi phí** | `NHATKYCHUNG` | Toàn bộ dòng chi phí; lọc theo kỳ, công trình, nhà, nhóm, hạng mục, loại CP, NCC, vật tư; tìm kiếm; sửa trực tiếp trong bảng; tổng cuối bảng. |
| **Chi tiết theo nhóm** | `CHI_TIET_THEO_NHOM` | Nhóm → Hạng mục → từng dòng, 3 mức hiển thị như nút 1 / 2 / 3 của Excel, có cộng hạng mục và tổng nhóm. |
| **Công nợ NCC** | `CONGNO_NCC` | Bảng tổng hợp **theo công trình** (chi phí, đã thanh toán, % đã thanh toán, còn nợ, ứng dư), rồi công nợ từng NCC: Chi phí phát sinh − Đã trả (lấy từ Sổ thu chi) = Còn nợ / Ứng dư / Đã tất toán. |
| **Giá vật tư** | (mới) | Lịch sử đơn giá từng vật tư theo NCC, giá thấp / cao / gần nhất, biểu đồ giá. |
| **Danh mục chi phí** | `DM_NHOM`, `DM_HANGMUC`, `DM_VATTU`, `DM_NHA` | Nhóm chi phí, hạng mục, vật tư, nhà / khu. |

---

## 3. Ghi sổ nhanh

- Bấm **Ghi thu / chi** (hoặc phím **F2**).
- Chọn **Chi tiền / Thu tiền / Thu & chi cùng lúc** (loại thứ ba dùng cho các khoản "đã thanh toán trước, thực tế không có thu" như trong file cũ).
- **Ngày** luôn nhập dạng ngày/tháng/năm: gõ `29/9` là đủ (tự hiểu năm nay), hoặc `29/09/2026`, `290926`. Phím ↑ ↓ để tăng/giảm 1 ngày.
- **Số phiếu**: bấm **Số mới** để lấy số kế tiếp trong tháng (VD `PC045/09`). Nhiều dòng dùng chung một số phiếu sẽ được gộp khi in.
- **Mã dự án / Mã NCC**: gõ mã **hoặc gõ tên** rồi chọn trong danh sách gợi ý. Nếu chưa có, bấm “thêm mới” ngay trong form.
- Khi chọn nhà cung cấp có chi phí công trình, dưới ô hiện luôn **công nợ còn lại** (theo dự án đang chọn) và nút **Điền số này**.
- **Số tiền** gõ được: `1.250.000`, `1250000`, `50tr`, `1,5tr`, `300k`, hoặc phép tính `58000+11000` (giống cách ghi công thức trong Excel cũ). Bên dưới hiện luôn số tiền bằng chữ để đối chiếu.
- **Ctrl + Enter** để lưu. Nút **Lưu & nhập tiếp** giữ lại ngày, số phiếu, dự án, NCC để nhập dòng kế tiếp của cùng phiếu.
- Bấm đúp vào một dòng trong sổ để sửa.

---

## 4. In phiếu thu / chi

1. Vào **Phiếu thu / chi**, chọn phiếu ở danh sách bên trái (hoặc bấm vào số phiếu trong sổ).
2. Kiểm tra bản xem trước. Có thể sửa riêng cho phiếu: ngày in, người nhận, địa chỉ, lý do, hình thức, số chứng từ kèm theo
   (để trống = tự lấy từ sổ và danh mục). Bấm **Lưu thông tin phiếu** để ghi nhớ.
3. Bấm **In phiếu (2 liên)** — in ra 1 tờ A4 dọc gồm Liên 1 (lưu) và Liên 2 (giao khách) có đường cắt.

Tên Giám đốc, Thủ quỹ… in dưới chữ ký được đặt trong **Cài đặt & dữ liệu**. Có thể bật thêm ô ký “Kế toán trưởng”.

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

- Dữ liệu: `C:\KeToan\data\ketoan.json` (lưu ngay sau mỗi thao tác).
- Sao lưu tự động: `C:\KeToan\data\backups\` — tự tạo định kỳ và **trước mỗi thao tác lớn** (nâng cấp phần mềm, nhập Excel,
  khôi phục, xóa). Khôi phục bằng 1 nút trong **Cài đặt & dữ liệu → Bản sao lưu tự động**.
- Nên định kỳ bấm **Tải bản sao lưu (.json)** và cất ra USB / Google Drive.

**Chuyển sang máy khác:** chép cả thư mục `C:\KeToan` sang máy mới (đã cài Node.js) rồi bấm `KhoiDong.bat`.

---

## 8. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Bấm `KhoiDong.bat` báo chưa cài Node.js | Cài Node.js bản LTS tại https://nodejs.org rồi chạy lại. |
| Trình duyệt báo “Không kết nối được” | Cửa sổ đen đã bị đóng → bấm lại `KhoiDong.bat`. |
| Nhập nhầm / xóa nhầm | Vào **Cài đặt & dữ liệu → Bản sao lưu tự động**, khôi phục bản trước thời điểm nhầm. |
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
  - **Hạng mục riêng**: ghi nếu dòng đó khác hạng mục đầu phiếu. **Loại CP** để “Tự động” (theo loại mặc định của vật tư;
    hạng mục tên “Nhân công…” → Nhân công; có mã VT → Vật tư; không có mã VT → Dịch vụ-Phí) hoặc chọn tay.
  - Mã chưa có trong danh mục: ô báo đỏ kèm nút **Thêm** để thêm nhanh ngay trong phiếu.
- **Phím tắt**: **Enter** sang ô kế tiếp (Mã VT → Diễn giải → Số lượng → Đơn giá → dòng sau), **↑ ↓** đổi dòng,
  **Ctrl + Delete** xóa dòng, **Ctrl + Enter** lưu phiếu. Gõ vào dòng cuối là tự thêm dòng mới.
- **Lưu**: giống macro `GhiPhieuNhap` — các dòng được ghi vào Sổ chi phí, phần hàng và số phiếu được xóa trắng,
  đầu phiếu giữ lại để nhập chuyến tiếp theo. Phiếu đang nhập dở được giữ lại nếu lỡ chuyển sang màn hình khác.
- **Phiếu đã nhập** (cuối trang): tìm, **sửa**, **nhân bản**, **xóa** cả phiếu.
- Phần mềm **không cho lưu** khi: thiếu ngày / công trình / NCC / hạng mục, mã không có trong danh mục,
  số lượng ≤ 0, đơn giá âm, nhà không thuộc công trình đã chọn.

---

## 11. Sổ chi phí, chi tiết theo nhóm

- **Sổ chi phí**: lọc theo kỳ, công trình, nhà, nhóm, hạng mục, loại CP, NCC, vật tư, tìm chữ hoặc số tiền.
  Đầu bảng có tổng và tổng theo từng loại CP.
  - **Bấm đúp** vào ô Diễn giải, Số lượng, Đơn giá, Hạng mục, Loại CP (nhãn nhỏ dưới hạng mục), Vật tư, NCC, Nhà
    để **sửa ngay trong bảng** (Enter lưu, Esc bỏ). Nút bút chì mở form sửa đủ các cột; nút nhân bản, xóa ở cuối dòng;
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
  - Bấm một NCC để xem các phiếu chi phí và các lần trả tiền; nút **Trả tiền / Ghi phiếu chi** mở sẵn form ghi chi
    trong Sổ thu chi với đúng NCC, dự án và số còn nợ.
- **Giá vật tư**: danh sách vật tư đã mua (số lần, giá gần nhất, mức dao động); chọn một vật tư để xem lịch sử đơn giá
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
- Dữ liệu `data/ketoan.json` phiên bản (schema) 2. Bản phần mềm cũ hơn không đọc được phần chi phí.
