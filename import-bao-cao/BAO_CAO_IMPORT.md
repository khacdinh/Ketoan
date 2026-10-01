# Báo cáo nhập 5 file Excel công trình vào KeToan2

Nhánh `feature/import-excel-cong-trinh`, tách từ `feature/chuyen-sqlite`. Ngày 01/10/2026.
Lần nhập vào dữ liệu thật của bản này: **`IMP-20261001-020033`**. Bản sao lưu trước khi nhập: `data/backups/ketoan-20261001-020033-truoc-import-excel.db`.

## 1. Kết quả tóm tắt

**Tổng tiền khớp tuyệt đối từng đồng** ở cả 5 file, theo 4 nguồn độc lập:
1. công cụ nhập (đọc bằng ExcelJS);
2. bộ tính số kỳ vọng `scripts/so-ky-vong-excel.js`, đọc thẳng XML của file, không dùng ExcelJS và không dùng mã của công cụ nhập;
3. số "TỔNG CHI PHÍ" đang lưu sẵn trong TONGHOP của từng file;
4. số sơ bộ bạn tự đếm.

Phần mềm sau khi nhập tính lại đúng các con số đó.

| File (công trình → dự án trong phần mềm) | Dòng chi phí: đọc / nhập mới / đã có sẵn / bỏ qua | Σ Thành tiền sau nhập (phần mềm) | Σ kỳ vọng từ ô nguồn | Số sơ bộ của bạn | Sổ quỹ: dòng có tiền / đã có trong Sổ thu chi / nhập Nháp / bỏ qua | Σ sổ quỹ (kỳ vọng) |
|---|---|---:|---:|---:|---|---:|
| 10PQA (→ dự án mới `10PQA`) | 20 / 20 / 0 / 0 | 128.818.000 | 128.818.000 | 20 / 128.818.000 | 0 / 0 / 0 / 2 (số tiền 0) | 0 |
| NDC7T (→ mới `NDC7T`) | 4 / 4 / 0 / 0 | 28.370.000 | 28.370.000 | 4 / 28.370.000 | 5 / 5 / 0 / 0 | 28.510.000 |
| NDC_7lo (→ mới `NĐC7lo`) | 128 / 123 / 0 / 5 (không có tiền) | 1.483.227.000 | 1.483.227.000 | 128 / 1.483.227.000 | 16 / 11 / 5 / 0 | 883.154.000 |
| nhà Cô Hạnh (→ mới `NHAMsHANH`) | 9 / 9 / 0 / 0 | 47.435.000 | 47.435.000 | 9 / 47.435.000 | 2 / 1 / 1 / 0 | 565.000 |
| Copy of 111 (→ dự án ĐÃ CÓ `DATT111`) | 137 / 32 / 104 (bản cũ đã nhập trước đây) / 1 (không có tiền) | 1.519.943.000 | 1.519.943.000 | 137 / 1.519.943.000 | 13 / 3 / 10 / 0 | 1.359.943.000 |
| **Cộng** | **298 / 188 / 104 / 6** | **3.207.793.000** | **3.207.793.000** | | **36 / 20 / 16 / 2** | **2.272.172.000** |

| Chỉ tiêu toàn phần mềm | Trước | Sau |
|---|---:|---:|
| Tổng chi phí công trình | 1.129.929.000 | 3.207.793.000 (+2.077.864.000 = đúng Σ 188 dòng mới) |
| Số dòng chi phí | 104 | 292 |
| Sổ thu chi | 66 dòng | 82 dòng (16 dòng mới đều là **Nháp**) |
| **Tồn quỹ** | **943.000** | **943.000 (không đổi)** |
| Dự án / Nhà / Hạng mục / Vật tư / NCC | 15 / 1 / 37 / 317 / 62 | 19 / 9 / 38 / 330 / 65 |
| Dòng mồ côi (mã không có trong danh mục) | 0 | 0 |
| File Excel "Chi phí công trình" xuất từ phần mềm | 104 dòng, Σ 1.129.929.000 | 292 dòng, Σ 3.207.793.000; TONGHOP khớp |

Dữ liệu cũ (66 dòng sổ, 15 dự án, 62 NCC, 104 dòng chi phí, cài đặt, phiếu) **không bị sửa hay xóa**. Điều này được kiểm tra từng bản ghi
trước khi chốt giao dịch.

**Chênh với số sơ bộ trong đề bài** (đều đã giải thích được):
- Dòng khoán:
  - NDC_7lo có **19 dòng chỉ có Thành tiền** (đề bài ước ~24). 5 dòng còn lại (dòng 2–6) có SL = 1, có ĐG, và Thành tiền gõ tay bằng
    đúng SL × ĐG, nên không phải khoán.
  - File 111 có **0 dòng khoán** (đề bài ước ~1). Dòng lạ duy nhất là dòng 138: không có số tiền, bị bỏ qua.
- NDC_7lo có **15 dòng trống Mã Nhà** (khớp đề bài), nhưng chỉ **10 dòng** được gán "Dùng chung", vì 5 dòng còn lại (125–129) không có
  tiền nên bị bỏ qua.
- File đề bài gọi là "nhà Cô Hạnh" có tên thật trong zip là `ChiPhi_CongTrinh_nha Cô Hạnh.xlsm` (chữ "nha" không dấu, tên được mã hóa NFD).
  Công cụ đọc đúng và lưu tên dạng NFC.
- Đề bài ghi app có 43 NCC; dữ liệu thật có **62 NCC**. 43 là số của bản gốc schema 1.

## 2. Ba phát hiện quan trọng (đọc trước)

### 2.1 Dữ liệu file 111 bản cũ đã nằm sẵn trong phần mềm
104 dòng chi phí của dự án `DATT111` (Σ 1.129.929.000) chính là bản cũ `111_ThanhTHuy_OK_FIX.xlsm`: trùng số dòng và tổng tiền đề bài nêu,
cùng địa chỉ và ngày khởi công 31/07/2026, cùng mã nhà `111THANHTHUY`. Bản cũ đã được nhập trước đây, với `111THANHTHUY` ghép vào
`DATT111`.

Nếu tạo công trình mới cho bản "Copy of" thì 111 bị tính hai lần (thừa 1,13 tỷ). Mã nhà `111THANHTHUY` cũng không thể dùng cho hai công
trình. Vì vậy công cụ:
- nhập bản "Copy of" **vào `DATT111`**;
- so từng dòng với 104 dòng có sẵn: 103 dòng trùng hoàn toàn;
- ghép thêm 1 dòng cùng khoản nhưng đã được sửa ở file mới (dòng 2: 550.000, Mã VT bản cũ `XX-CHUAXACDINH` → bản mới `XX-KHAC`). Dòng này
  không nhập thêm và giữ nguyên dòng #505;
- **chỉ thêm 32 dòng mới** (Σ 390.014.000).

Kết quả: `DATT111` = 1.519.943.000 = đúng tổng file mới. Không có dòng nào chỉ có ở bản cũ. File bản cũ không có trong thư mục gửi kèm;
"bản cũ" ở đây là 104 dòng đang có trong phần mềm.

### 2.2 Sổ quỹ (SO_QUY) trong file phần lớn đã có trong Sổ thu chi của phần mềm
Sổ thu chi của phần mềm là sổ quỹ thật của kế toán (tồn quỹ 943.000). 20 khoản trong SO_QUY của các file đã có sẵn trong đó: cùng số tiền,
ngày lệch ≤ 3 ngày, cùng NCC hoặc số phiếu hoặc dự án. Có trường hợp kế toán tách một khoản thành 2 dòng, vd Sông Hàn 73.240.000 =
53.780.000 + 19.460.000 cùng PC005/09. Nhập lại sẽ **trừ tiền hai lần**, nên 20 khoản này **không nhập**; mỗi khoản được liệt kê kèm dòng
đã có (`#id`) ở phụ lục.

16 khoản còn lại (Σ **1.394.463.000**) được nhập **dạng Nháp**:
- 1.230.569.000 của 111 và 83.394.000 của NDC_7lo: các khoản tháng 8 ghi "c Dung chi", trả trước khi bàn giao quỹ, không đi qua quỹ của
  kế toán;
- 80.000.000 "Vương thợ nề" của NDC_7lo: nghi đã có (xem 3.4);
- 500.000 "Nghi đóng dấu" của Cô Hạnh: không tìm thấy trong sổ.

Ghi sổ thẳng các khoản này sẽ làm tồn quỹ âm khoảng 1,39 tỷ. Dạng Nháp hiện trong Sổ thu chi có nhãn "Nháp", **không tính vào tồn quỹ và
công nợ** cho tới khi bạn quyết định (mục 3.5).

### 2.3 Công trình trong file chưa được ghép với các dự án Nguyễn Đình Chiểu / 10 PQA / Ms Hạnh đang có
Theo đúng quy tắc ("không tự gộp; chỉ dùng lại khi mã hoặc tên trùng khớp hoàn toàn"), `NĐC7lo`, `NDC7T`, `10PQA`, `NHAMsHANH` được tạo
mới. Các khoản trả NCC đang ghi trong Sổ thu chi theo dự án cũ (`DANDC34`, `DANDCCHUNG`, `DANDC5`, `DAPQA10`…). Hệ quả:
- **công nợ NCC lọc theo công trình mới hiện chưa trừ phần đã trả**;
- công nợ NCC **toàn công ty** (không lọc công trình) vẫn đúng.

Muốn công nợ theo công trình đúng, cần quyết định ghép dự án (mục 3.1).

## 3. Cần bạn quyết định

1. **Công trình nghi trùng** (không tự gộp):
   - `10PQA` "10 Phạm Quang Ảnh" ↔ `DAPQA10` "Dự án 10 Phạm Quang Ảnh";
   - `NDC7T` "NDC 7 tầng" ↔ `DANDC7T` "Dự án Nguyễn Đình Chiều 7 tầng";
   - `NHAMsHANH` "Nhà Ms Hạnh" ↔ `DANHAMsHanh` "Dự án nhà Ms Hạnh";
   - `NĐC7lo` ↔ `DANDCCHUNG` (chung 7 lô). Các nhà của NĐC7lo tương ứng: `NĐC34` ↔ `DANDC34`, `NĐC910` ↔ `DANDC910`, `NĐC78` ↔ `DANC78`,
     `NĐC5` ↔ `DANDC5`.

   Cách làm nếu đồng ý gộp: đổi mã dự án cũ thành mã mới (hoặc ngược lại) trong Danh mục dự án. Phần mềm lan mã sang mọi dòng. Muốn làm
   lại từ đầu: `--rollback IMP-20261001-020033`, sửa mã công trình trong file Excel cho trùng mã dự án cũ, rồi nhập lại.
2. **`DATT111`**: xác nhận việc nhập file 111 mới vào dự án đã có (2.1). Dòng #505 (550.000): bản mới ghi Mã VT `XX-KHAC`, phần mềm giữ
   `XX-CHUAXACDINH`. Sửa tay nếu muốn theo file mới.
3. **Dòng `34PHK`** (10PQA, NHATKYCHUNG dòng 2: 05/09/2026, Vương Thịnh, "TT CP xe múc hạ nền, VC đất…", 6.000.000, Mã nhà `CHUNG`): đã
   nhập vào 10PQA, mã gốc ghi ở Ghi chú. Gợi ý: Sổ thu chi có khoản 6.000.000 trả Vương Thịnh ngày 05/09 ghi cho **DAPQA10** (PC006/09),
   nên nhiều khả năng dòng này đúng là của 10PQA. Nếu thuộc Phạm Hữu Kính (DA34PHK) thì sửa Mã CT của dòng đó.
4. **Khoản sổ quỹ nghi đã có**: NDC_7lo SO_QUY dòng 14, 80.000.000 ngày 19/09 "Vương xin ứng tiền trả lương thợ" (NCC_VuongThoNe). Sổ thu
   chi có #109 PC029/09, cùng ngày, cùng tiền, nhưng NCC_Vuong và dự án DANDC910. Đã nhập Nháp; **xóa dòng Nháp** nếu đúng là một.
5. **16 dòng Nháp từ SO_QUY** (Σ 1.394.463.000; danh sách ở `dong-so-quy.csv`): với mỗi dòng chọn
   - (a) **Ghi sổ** nếu tiền thật sự chi từ quỹ này;
   - (b) nếu "c Dung chi" từ nguồn khác: ghi theo cách phần mềm đang làm cho khoản tương tự (vd DA34PHK 31/08 ghi cả thu và chi cùng số
     tiền, "c Dung đã TT trước bàn giao");
   - (c) xóa.
6. **Dòng thiếu NCC**: NDC_7lo NHATKYCHUNG dòng 124 (30/09, Vật tư điện nước, 622.000) đã gán tạm `NCC_CHUAXACDINH`. Dòng ngay trên (123)
   cùng ngày, cùng hạng mục là Minh điện nước, nên rất có thể cùng NCC.
7. **NCC nghi trùng**:
   - `NCC_Vinaconex25` "Vinaconex25" (tạo mới) ↔ `NCC_Vina` "Vina". Sổ thu chi ghi khoản trả bê tông Vinaconex 25 ở PC016/09 cho NCC_Tai.
   - `NCC_MinhLongPhat` "Minh Long Phát" (tạo mới, từ DM_NCC Cô Hạnh) ↔ `NCC_ChienMLP` "Chiến MLP / Chiến Minh Long Phát".
   - `NCC_TBCNQUANGDA` (file 111) đã **khớp theo tên** với `NCC_TBCNQĐ` "TBCN Quảng Đà" có sẵn và dùng lại mã có sẵn.
   - `NCC_Vuong` "Vương thầu" ↔ `NCC_VuongThoNe` "Vương (thợ nề)" (cả hai đã có sẵn trong phần mềm): có thể cùng người.
8. **Hai khoản SO_QUY 10PQA số tiền 0** (dòng 2, 3: `pc001/09` 50.000 và `pc002/09` 6.000.000, cột Chi gõ tay, ngày 09/05/2026 nghi hoán
   đổi → 05/09/2026). Đã bỏ qua theo quy tắc. Cả hai **đã có trong Sổ thu chi**: PC001/09 03/09 DAPQA10 50.000 và PC006/09 05/09 DAPQA10
   6.000.000. Không mất đồng nào.
9. **Dòng sổ quỹ thiếu ngày**: Cô Hạnh SO_QUY dòng 2 (Nghi, "đóng dấu hồ sơ", 500.000) được suy ra ngày **17/09/2026** từ dòng chi phí
   NHATKYCHUNG dòng 2 (cùng NCC, cùng tiền, cùng nội dung).
10. **Tiền chủ nhà ứng (NDC_7lo, ô ngoài bảng DM_CONGTRINH I2:K4)**: "ứng đợt 1: 30% = 305.600.000; ứng đợt 2: 305.600.000; tổng đã ứng 2
    đợt 60% = 611.200.000". **Không tạo giao dịch thu.** Lưu ý: Sổ thu chi có các khoản 305.600.000 "tạm ứng 30%" trả Trà Quang cho
    DA34PHK. Có thể ô này chép từ file Phạm Hữu Kính; cần bạn xác nhận đây là tiền chủ nhà NĐC ứng hay không.
11. **Sheet `thanh toán` (NDC_7lo)**: "TỔNG HỢP THANH TOÁN 11/9/2026: trung thầu 150.000.000; hậu thầu 100.000.000; quân điện nước
    5.000.000; vinacoonex 25 31.350.000; TỔNG 286.350.000" (ghi chú cột K: trung thầu 34, vương thầu 910, tài lô 5, hiển78). Cả 4 khoản đều
    đã có trong Sổ thu chi (PC015/09, PC014/09, PC013/09, PC016/09). Không nhập.
12. **Ngày nghi ngờ**: 26 dòng của file 111 có ngày từ 22/04 đến 30/05/2026, sớm hơn ngày khởi công 31/07/2026 hơn 2 tháng. Giữ nguyên;
    danh sách ở phụ lục. **Không có ngày nào bị tự sửa** trong dữ liệu đã nhập: trường hợp đủ điều kiện sửa duy nhất là hai khoản 10PQA ở
    mục 8, vốn bị bỏ qua.
13. **"Cần xử lý" sau nhập** (màn hình Kiểm soát): 8 nghi trùng, 45 đơn giá lệch, 4 vật tư chưa xác định. Ví dụ nghi trùng: NDC_7lo dòng
    76–80 giống hệt dòng 21–25 (sắt thép 04/09/2026, Xuân Trang, Σ 59.540.000). Theo quy tắc **không loại dòng giống hệt**, nhưng đây rất có
    thể là nhập trùng trong Excel. Đề nghị bạn kiểm tra.

## 4. Quy tắc làm sạch đã áp dụng (và số lần)

| Điểm bẩn | Cách xử lý | Số dòng |
|---|---|---|
| 1. Dòng khoán (chỉ có Thành tiền) | SL = 1, ĐG = Thành tiền; Ghi chú "Nhập theo khoản: …". ĐVT hiển thị là ĐVT của vật tư (phần mềm lấy ĐVT từ danh mục vật tư, không lưu riêng từng dòng). Tổng = đúng Thành tiền gốc | 10PQA 10, NDC7T 4, NDC_7lo 19, Cô Hạnh 3, 111 0 |
| 1b. Có SL, ĐG mà Thành tiền gõ tay lệch | Giữ số gõ tay làm chuẩn tiền, cờ cảnh báo | 0 (không có trường hợp nào) |
| 1c. Không có số tiền | Bỏ qua, liệt kê | NDC_7lo 5 (dòng 125–129), 111 1 (dòng 138) |
| 2. Mã CT trống / sai | Gán công trình của file; mã gốc vào Ghi chú; `34PHK` vào danh sách cần quyết định | 10PQA 19 (18 trống + 34PHK), Cô Hạnh 9 (8 trống + NHACOHANH) |
| 2b. Mã Nhà trống / sai | Gán nhà "Dùng chung cả công trình" của file; mã gốc vào Ghi chú | 10PQA 19 (18 trống + CHUNG), NDC_7lo 10 |
| 3. Loại CP trống | Suy ra; Nhóm CP luôn theo hạng mục | 10PQA 18, NDC7T 3, NDC_7lo 123, Cô Hạnh 8, 111 32 trong số dòng nhập mới |
| 4. NCC khác hoa / thường, khác tên | So mã không phân biệt hoa thường và khoảng trắng; gộp, chọn tên đầy đủ nhất; NCC đã có trong phần mềm giữ nguyên tên cũ | NCC_THienHAi = NCC_ThienHai; 5 NCC khác tên/loại (Hậu, Khôi, Quân, ChienMLP, HoaLan) |
| 5. HM37 hai nghĩa | Đối chiếu theo TÊN; "Bảo hành" (HM37 của 10PQA) thành hạng mục riêng `HM39` (mã không file nào dùng); "Chi phí quản lý" dùng HM37 có sẵn | 1 hạng mục mới; không dòng chi phí nào dùng "Bảo hành" |
| 6. Vật tư xung đột | Gộp; vật tư đã có trong phần mềm giữ nguyên; vật tư mới chọn tên dài nhất, ĐVT phổ biến nhất; `XX-*`, `CHUNG` giữ nguyên; dòng "TỔNG" trong DM_VATTU bị bỏ | 13 vật tư mới. Xung đột: NỀ-CONGNE (hạng mục hay dùng khác nhau), BT-BOMDUN ("Bê tông bơm đùn" / "BÊ tông bơm/đùn" — giữ bản đang có trong phần mềm), VL-XERAC6 (ĐVT trống ở 3 file, "XE" ở NDC_7lo → chọn XE). Lưu ý VL-XERAC6 "6 xe rác" (mới) và VL-XERAC "xe rác" (đã có, dùng ở file 111) có thể là cùng một loại |
| 7. Số phiếu giả / chữ thường / trùng | Giả (`PC…/09`, `PC00../08`) → để trống, mã gốc vào Ghi chú; chữ thường → viết hoa; trùng (`PC003/08`) → giữ cả hai, cờ cảnh báo. Không bịa số mới (phần mềm không bắt buộc số phiếu) | 12 giả, 2 trùng |
| 8. Ngày hoán đổi | Chỉ sửa khi ngày ≤ 12 và hậu tố tháng của số phiếu khớp; còn lại chỉ cảnh báo | 0 sửa trong dữ liệu đã nhập; 26 cảnh báo |
| 9. SO_QUY: Loại trống | Số tiền > 0 → "Chi" (suy ra) | 14 |
| 9b. SO_QUY: số tiền 0 / trống | Bỏ qua | 2 (10PQA) |
| 9c. SO_QUY: ô Số tiền là công thức | Lấy số gõ tay ở cột Chi (không dùng giá trị lưu sẵn) | 2 (NDC_7lo dòng 8, 15) |
| 9d. SO_QUY: ô Ngày là công thức `=B13` | Lần theo ô B13 | 1 (NDC_7lo dòng 14) |
| 10. Nhà mẫu N1..N5, NAM (Mã CT `NCT`) | Không nhập (không dòng nào dùng) | 11 |
| 11. Mã có dấu (`NĐC7lo`…) | Giữ Unicode, chuẩn hóa NFC; so khớp không phân biệt hoa thường, không bỏ dấu | |
| 12. Trùng giữa các file / lần nhập | Dấu vân tay từng dòng; dòng giống hệt trong cùng file vẫn nhập (đánh số lần lặp) | 9 dòng giống hệt (cảnh báo) |

**Loại CP suy ra — vì sao không dùng nguyên quy tắc trong đề bài.** Tôi đo trên 136 dòng **đã ghi Loại CP** trong 5 file:
- quy tắc của đề bài ("ĐVT khoản → Dịch vụ-Phí") sai 8/136 dòng: các dòng Điện nước Vũ Thanh và thiết bị vệ sinh có ĐVT "khoản" nhưng
  file ghi "Vật tư";
- macro gốc của file (`GhiPhieuNhap`: có Mã VT → Vật tư, ngược lại → Dịch vụ-Phí) còn sai nhiều hơn, vì xếp cả Nhân công vào Vật tư;
- quy tắc đã dùng khớp **136/136**: (1) hạng mục "Nhân công…" → Nhân công; (2) mã `XX-*` hoặc `CHUNG` → Dịch vụ-Phí; (3) có mã vật tư khác →
  Vật tư; (4) không có mã VT: hạng mục hồ sơ / chi phí chung / quản lý / phí → Dịch vụ-Phí, còn lại → Vật tư.

DM_VATTU không có cột Loại CP. DM_NCC.Loại ghi tự do (Chủ thầu, Kỹ thuật, Điện nước…), không đủ tin cậy để suy ra.

## 5. Cách nhập (ánh xạ sang phần mềm)
- **Công trình** ← DM_CONGTRINH: ngày khởi công dạng chữ d/m/yyyy đọc theo ngày trước tháng. **Nhà** ← DM_NHA (chỉ nhà thuộc công trình
  của file). **Nhóm CP / Hạng mục / Vật tư / NCC** ← danh mục gộp từ 5 file; mục đã có trong phần mềm được dùng lại nguyên trạng.
- **NHATKYCHUNG** → dòng chi phí. Các dòng liền nhau cùng ngày, nhà, NCC, số phiếu được gom thành một phiếu nhập (`phieuId`). Gom phiếu
  không đổi tổng tiền vì mỗi dòng giữ nguyên SL × ĐG. Thành tiền luôn = SL × ĐG tính lại; tên vật tư, ĐVT, tên NCC, nhóm CP tra từ danh mục.
  **Không dùng giá trị công thức lưu sẵn** (bài test I2 cố ý ghi giá trị lưu sẵn sai để chứng minh).
- **SO_QUY** → Sổ thu chi: Loại → cột thu/chi; Mã CT → dự án; Mã NCC → NCC; Lý do → nội dung; Họ tên (nếu gõ tay) → người nhận;
  Nhóm thu chi, Hình thức (nếu khác mặc định), Kèm chứng từ → Ghi chú. Cột Thu/Chi/Tồn quỹ là công thức nên bỏ; cột `Column1` (rác) chỉ
  được nêu trong báo cáo. **Tồn quỹ đầu kỳ** trong DM_NHOMTHUCHI của cả 5 file đều là 0 và **không ghi đè** tồn quỹ của phần mềm.
- **Nguồn gốc** mỗi bản ghi nhập: trường `importRef = { lan, file, sheet, dong, fp }`. Sổ đăng ký các lần nhập nằm trong dữ liệu
  (`importBatches`, không gửi lên giao diện), ghi dấu vân tay → bản ghi, để chạy lại không nhân đôi và để rollback.

## 6. Kiểm tra đã làm
- **Dry-run**: không ghi gì (bài I2 so từng byte file `.db`). Báo cáo `DRY_RUN.md` + 4 file CSV.
- **Số kỳ vọng độc lập** (mục 1): khớp tuyệt đối số dòng, tổng tiền, số dòng không có tiền, tổng sổ quỹ, tổng theo hạng mục từng file.
- **Nhập thử vào bản sao** dữ liệu, rồi vào dữ liệu thật: một giao dịch; đọc lại từ SQLite **ngay trong giao dịch** và đối chiếu trước
  khi COMMIT. Bài I5 giả lập lệch thì ROLLBACK, dữ liệu giữ nguyên.
- **Báo cáo của phần mềm sau nhập**:
  - tổng chi phí từng công trình = kỳ vọng = TONGHOP lưu sẵn;
  - Vật tư / Nhân công / Dịch vụ của 111 lệch TONGHOP lưu sẵn vì 32 dòng mới trong file 111 trống Loại CP: Excel SUMIFS không cộng các
    dòng đó vào loại nào; phần mềm suy ra Loại nên cộng đủ. Tổng vẫn khớp;
  - công nợ NCC: phát sinh từng NCC = CONGNO_NCC trong file; "đã trả" khác file vì lý do ở mục 2.2–2.3;
  - tồn quỹ 943.000 không đổi;
  - 0 mồ côi;
  - xuất Excel chi phí: 292 dòng, Σ 3.207.793.000;
  - sửa và lưu lại một phiếu nhập: số không đổi.
- **Chạy `--apply` lần hai**: "Không có gì mới để nhập", dữ liệu giữ nguyên.
- **Rollback trên bản sao rồi nhập lại**: sau rollback trở về đúng 104 dòng / 66 dòng / 15 dự án / 62 NCC / 317 vật tư, Σ 1.129.929.000;
  nhập lại cho kết quả như lần đầu. Bài I7: dòng đã sửa trong phần mềm thì báo để kiểm tra tay.
- **File đầu vào lỗi** (bài I4): file hỏng, thiếu sheet, Excel đang mở file (`~$…`), Windows khóa file (EBUSY) → từ chối, báo tiếng Việt,
  không ghi gì. Phần mềm đang chạy → `--apply` từ chối (bài I5).
- **Bài test tự động mới** `tests/i-import-excel.test.js` (I1–I7) dùng dữ liệu tổng hợp nhỏ: **7/7 đạt**.
- **`npm test` toàn bộ** (sau khi nhập, chức năng cũ): 162 ca, **159 đạt**, 2 bỏ qua (A3 cần mạng; S3.6 cần thư mục mã bản JSON gốc),
  1 lỗi là **S1.7**. S1.7 là bài kiểm thử chuyển SQLite của nhánh trước, phụ thuộc thời điểm: hai lần chuyển đổi trong cùng một giây tạo
  bản sao lưu trùng tên. Đã sửa bài kiểm thử (kiểm tra nội dung bản sao lưu thay vì đếm file) và chạy lại đạt. Không liên quan công cụ nhập.

## 7. Giả định
1. Mỗi file = một công trình theo DM_CONGTRINH của chính file (mọi file chỉ có 1 dòng).
2. `111THANHTHUY` → `DATT111` (lý do ở 2.1). Đây là ngoại lệ duy nhất của quy tắc "chỉ dùng lại khi mã/tên trùng khớp hoàn toàn": căn cứ là
   **mã nhà trùng khớp hoàn toàn**. Mã nhà là duy nhất trong phần mềm và đã gắn với DATT111.
3. Dòng chi phí đã có trong dự án đích được coi là "đã có" khi trùng hoàn toàn ngày, hạng mục, mã VT, diễn giải, SL, ĐG, thành tiền, NCC;
   hoặc trùng ngày + hạng mục + thành tiền + NCC và là cặp duy nhất (khi đó coi là dòng đã sửa ở file mới, giữ dòng cũ).
4. Khoản SO_QUY "đã có trong Sổ thu chi" khi cùng loại thu/chi, cùng số tiền (hoặc tổng nhiều dòng cùng ngày, cùng số phiếu, cùng NCC),
   ngày lệch ≤ 3 ngày, và cùng NCC hoặc số phiếu hoặc dự án. Chỉ trùng tiền + ngày thì là "nghi" (nhập Nháp + cảnh báo).
5. Khoản SO_QUY chưa có trong Sổ thu chi được nhập dạng **Nháp** (tùy chọn `--so-quy ghi-so` để ghi sổ luôn): tránh làm lệch tồn quỹ
   thật khi chưa rõ tiền có đi qua quỹ hay không.
6. Dòng thiếu NCC được gán NCC tạm `NCC_CHUAXACDINH` vì phần mềm bắt buộc mọi dòng chi phí có NCC.
7. Số phiếu giả để trống. Số phiếu SO_QUY trùng với số phiếu đã dùng trong Sổ thu chi cho khoản khác thì để trống (giữ trong Ghi chú),
   để không bị gộp nhầm vào phiếu in của khoản khác (1 dòng: PC027/09 của khoản Vương 80.000.000, vì PC027/09 trong Sổ thu chi là khoản Điện nước Vũ Thanh của 111).
8. Dòng khoán: ĐVT hiển thị theo vật tư. ĐVT trong file cũng là công thức tra từ DM_VATTU nên giống hệt; SL/ĐG gốc (trống) ghi trong Ghi chú. Phần mềm không có ĐVT riêng từng dòng.
9. Nguồn của dòng nhập: `nguon = "excel"`.
10. Báo cáo markdown (`DRY_RUN.md`, `BAO_CAO_IMPORT.md`, `APPLY_*.md`) được commit vì là sản phẩm giao. Các file CSV (bảng kê dữ liệu
    thật) và file Excel gốc (`import-input/`) **không** commit (đã `.gitignore`).
11. Thư mục `data/` của repo (bản này) đã được nhập thật. `data/ketoan.json` được phần mềm chuyển sang `data/ketoan.db` và đổi tên thành
    `.bak`, nên git hiện hiển thị `data/ketoan.json` là "đã xóa". **Không commit** thay đổi này. Dữ liệu thật của bạn trên máy Windows
    chưa bị đụng tới: bạn tự chạy theo hướng dẫn mục 18.

---

# Phụ lục: báo cáo chi tiết của lần nhập (sinh tự động)

- Thời điểm: 02:00:33 1/10/2026 · mã lần nhập: **IMP-20261001-020033**
- Thư mục nguồn: `import-input` · dữ liệu: `data` (ketoan.db)
- Sổ quỹ (SO_QUY) chưa có trong sổ thu chi: nhập dạng **Nháp** (không tính tồn quỹ / công nợ cho tới khi bấm Ghi sổ)
- Kiểm tra trước khi ghi: **ĐẠT** — dữ liệu cũ không đổi, tổng tiền khớp số kỳ vọng tính độc lập từ ô nguồn

### 1. Theo từng file

| File | Công trình → dự án | Dòng chi phí đọc | Nhập mới | Đã có sẵn | Đã nhập lần trước | Bỏ qua | Σ sẽ nhập | Σ đã có sẵn / đã nhập trước | Σ kỳ vọng (độc lập) | Khớp |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| ChiPhi_CongTrinh_10PQA.xlsm | 10PQA → 10PQA | 20 | 20 | 0 | 0 | 0 | 128.818.000 | 0 | 128.818.000 | khớp |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NĐC7lo → NĐC7lo | 128 | 123 | 0 | 0 | 5 | 1.483.227.000 | 0 | 1.483.227.000 | khớp |
| ChiPhi_CongTrinh_NDC7T.xlsm | NDC7T → NDC7T | 4 | 4 | 0 | 0 | 0 | 28.370.000 | 0 | 28.370.000 | khớp |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | NHAMsHANH → NHAMsHANH | 9 | 9 | 0 | 0 | 0 | 47.435.000 | 0 | 47.435.000 | khớp |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | 111THANHTHUY → DATT111 | 137 | 32 | 104 | 0 | 1 | 390.014.000 | 1.129.929.000 | 1.519.943.000 | khớp |

| File | Dòng sổ quỹ có tiền | Đã có trong sổ thu chi | Nhập (Nháp) | Bỏ qua | Σ đã có | Σ nhập (chi / thu) | Σ kỳ vọng | Khớp | Tồn quỹ đầu kỳ trong file |
|---|---:|---:|---:|---:|---:|---:|---:|---|---:|
| ChiPhi_CongTrinh_10PQA.xlsm | 0 | 0 | 0 | 2 | 0 | 0 / 0 | 0 | khớp | 0 (không ghi đè tồn quỹ của phần mềm) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | 16 | 11 | 5 | 0 | 719.760.000 | 163.394.000 / 0 | 883.154.000 | khớp | 0 (không ghi đè tồn quỹ của phần mềm) |
| ChiPhi_CongTrinh_NDC7T.xlsm | 5 | 5 | 0 | 0 | 28.510.000 | 0 / 0 | 28.510.000 | khớp | 0 (không ghi đè tồn quỹ của phần mềm) |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | 2 | 1 | 1 | 0 | 65.000 | 500.000 / 0 | 565.000 | khớp | 0 (không ghi đè tồn quỹ của phần mềm) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | 13 | 3 | 10 | 0 | 129.374.000 | 1.230.569.000 / 0 | 1.359.943.000 | khớp | 0 (không ghi đè tồn quỹ của phần mềm) |

Đếm theo loại xử lý (dòng chi phí): ChiPhi_CongTrinh_10PQA: khoán 10, Loại CP suy ra 18, Mã CT sửa 19, Mã nhà sửa 19, ngày sửa 0, ngày nghi ngờ 0, Thành tiền lệch 0 · ChiPhi_CongTrinh_NDC_7lo: khoán 19, Loại CP suy ra 123, Mã CT sửa 0, Mã nhà sửa 10, ngày sửa 0, ngày nghi ngờ 0, Thành tiền lệch 0 · ChiPhi_CongTrinh_NDC7T: khoán 4, Loại CP suy ra 3, Mã CT sửa 0, Mã nhà sửa 0, ngày sửa 0, ngày nghi ngờ 0, Thành tiền lệch 0 · ChiPhi_CongTrinh_nha Cô Hạnh: khoán 3, Loại CP suy ra 8, Mã CT sửa 9, Mã nhà sửa 0, ngày sửa 0, ngày nghi ngờ 0, Thành tiền lệch 0 · Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX: khoán 0, Loại CP suy ra 32, Mã CT sửa 0, Mã nhà sửa 0, ngày sửa 0, ngày nghi ngờ 26, Thành tiền lệch 0

### 2. Số liệu phần mềm trước / sau

| Chỉ tiêu | Trước | Sau | Chênh |
|---|---:|---:|---:|
| Tổng chi phí công trình (đã ghi sổ) | 1.129.929.000 | 3.207.793.000 | 2.077.864.000 |
| Số dòng chi phí | 104 | 292 | 188 |
| Số dòng sổ thu chi (kể cả nháp) | 66 | 82 | 16 |
| Tồn quỹ (đã ghi sổ) | 943.000 | 943.000 | 0 |
| Dự án / công trình | 15 | 19 | 4 |
| Nhà | 1 | 9 | 8 |
| Hạng mục | 37 | 38 | 1 |
| Vật tư | 317 | 330 | 13 |
| Nhà cung cấp | 62 | 65 | 3 |

#### Theo công trình (phần mềm tính sau khi nhập) và đối chiếu số lưu sẵn trong Excel (TONGHOP / CONGNO_NCC)

**ChiPhi_CongTrinh_10PQA.xlsm** → dự án `10PQA`

| Chỉ tiêu | Phần mềm sau nhập | Kỳ vọng từ ô nguồn | TONGHOP lưu sẵn trong file | Ghi chú |
|---|---:|---:|---:|---|
| Tổng chi phí | 128.818.000 | 128.818.000 | 128.818.000 | so với TONGHOP: khớp |
| Vật tư | 122.768.000 | 0 (Loại ghi sẵn) |  |  |
| Nhân công | 0 | 0 (Loại ghi sẵn) |  |  |
| Dịch vụ-Phí | 6.050.000 | 6.050.000 (Loại ghi sẵn) |  |  |

Công nợ NCC: phần mềm (theo dự án 10PQA) ↔ CONGNO_NCC lưu sẵn trong file

| Mã NCC | Phát sinh PM | Phát sinh file | Đã trả PM | Đã trả file | Còn lại PM | Còn lại file |
|---|---:|---:|---:|---:|---:|---:|
| NCC_VuongThinh | 70.685.000 | 70.685.000 | 0 | 6.000.000 | 70.685.000 |  |
| NCC_XuanTrang | 46.814.000 | 46.814.000 | 0 |  | 46.814.000 |  |
| NCC_MinhDienNuoc | 11.269.000 | 11.269.000 | 0 |  | 11.269.000 |  |
| NCC_THienHAi | 50.000 | 50.000 | 0 | 50.000 | 50.000 |  |

**ChiPhi_CongTrinh_NDC_7lo.xlsm** → dự án `NĐC7lo`

| Chỉ tiêu | Phần mềm sau nhập | Kỳ vọng từ ô nguồn | TONGHOP lưu sẵn trong file | Ghi chú |
|---|---:|---:|---:|---|
| Tổng chi phí | 1.483.227.000 | 1.483.227.000 | 1.483.227.000 | so với TONGHOP: khớp |
| Vật tư | 1.037.304.000 | 0 (Loại ghi sẵn) |  |  |
| Nhân công | 430.000.000 | 0 (Loại ghi sẵn) |  |  |
| Dịch vụ-Phí | 15.923.000 | 0 (Loại ghi sẵn) |  |  |

Công nợ NCC: phần mềm (theo dự án NĐC7lo) ↔ CONGNO_NCC lưu sẵn trong file

| Mã NCC | Phát sinh PM | Phát sinh file | Đã trả PM | Đã trả file | Còn lại PM | Còn lại file |
|---|---:|---:|---:|---:|---:|---:|
| NCC_Vinaconex25 | 31.350.000 | 31.350.000 | 0 | 31.350.000 | 31.350.000 |  |
| NCC_Khac | 11.225.000 | 11.225.000 | 0 | 11.225.000 | 11.225.000 |  |
| NCC_VuongThinh | 2.400.000 | 2.400.000 | 0 | 1.200.000 | 2.400.000 |  |
| NCC_VuongThoNe | 80.000.000 | 80.000.000 | 0 | 80.000.000 | 80.000.000 |  |
| NCC_XuanTrang | 544.407.000 | 544.407.000 | 0 | 180.795.000 | 544.407.000 |  |
| NCC_SongHan | 73.240.000 | 73.240.000 | 0 | 73.240.000 | 73.240.000 |  |
| NCC_MinhDienNuoc | 17.115.000 | 17.115.000 | 0 | 12.521.000 | 17.115.000 |  |
| NCC_HoaLan | 329.440.000 | 329.440.000 | 0 | 105.725.000 | 329.440.000 |  |
| NCC_Quoc | 4.530.000 | 4.530.000 | 0 | 4.530.000 | 4.530.000 |  |
| NCC_ThienHai | 168.000 | 168.000 | 0 | 168.000 | 168.000 |  |
| NCC_ChienMLP | 6.330.000 | 6.330.000 | 0 |  | 6.330.000 |  |
| NCC_666 | 32.400.000 | 32.400.000 | 0 | 32.400.000 | 32.400.000 |  |
| NCC_Trung | 300.000.000 | 300.000.000 | 0 | 300.000.000 | 300.000.000 |  |
| NCC_Tai | 50.000.000 | 50.000.000 | 0 | 50.000.000 | 50.000.000 |  |

**ChiPhi_CongTrinh_NDC7T.xlsm** → dự án `NDC7T`

| Chỉ tiêu | Phần mềm sau nhập | Kỳ vọng từ ô nguồn | TONGHOP lưu sẵn trong file | Ghi chú |
|---|---:|---:|---:|---|
| Tổng chi phí | 28.370.000 | 28.370.000 | 28.370.000 | so với TONGHOP: khớp |
| Vật tư | 0 | 0 (Loại ghi sẵn) |  |  |
| Nhân công | 0 | 0 (Loại ghi sẵn) |  |  |
| Dịch vụ-Phí | 28.370.000 | 27.500.000 (Loại ghi sẵn) |  |  |

Công nợ NCC: phần mềm (theo dự án NDC7T) ↔ CONGNO_NCC lưu sẵn trong file

| Mã NCC | Phát sinh PM | Phát sinh file | Đã trả PM | Đã trả file | Còn lại PM | Còn lại file |
|---|---:|---:|---:|---:|---:|---:|
| NCC_THienHAi | 870.000 | 870.000 | 0 | 1.010.000 | 870.000 |  |
| NCC_Khoi | 27.500.000 | 27.500.000 | 0 | 27.500.000 | 27.500.000 |  |

**ChiPhi_CongTrinh_nha Cô Hạnh.xlsm** → dự án `NHAMsHANH`

| Chỉ tiêu | Phần mềm sau nhập | Kỳ vọng từ ô nguồn | TONGHOP lưu sẵn trong file | Ghi chú |
|---|---:|---:|---:|---|
| Tổng chi phí | 47.435.000 | 47.435.000 | 47.435.000 | so với TONGHOP: khớp |
| Vật tư | 46.870.000 | 0 (Loại ghi sẵn) |  |  |
| Nhân công | 0 | 0 (Loại ghi sẵn) |  |  |
| Dịch vụ-Phí | 565.000 | 500.000 (Loại ghi sẵn) |  |  |

Công nợ NCC: phần mềm (theo dự án NHAMsHANH) ↔ CONGNO_NCC lưu sẵn trong file

| Mã NCC | Phát sinh PM | Phát sinh file | Đã trả PM | Đã trả file | Còn lại PM | Còn lại file |
|---|---:|---:|---:|---:|---:|---:|
| NCC_XuanTrang | 46.870.000 | 46.870.000 | 0 |  | 46.870.000 |  |
| NCC_ThienHai | 65.000 | 65.000 | 0 | 65.000 | 65.000 |  |
| NCC_Nghi | 500.000 | 500.000 | 0 | 500.000 | 500.000 |  |

**Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm** → dự án `DATT111`

| Chỉ tiêu | Phần mềm sau nhập | Kỳ vọng từ ô nguồn | TONGHOP lưu sẵn trong file | Ghi chú |
|---|---:|---:|---:|---|
| Tổng chi phí | 1.519.943.000 | 1.519.943.000 | 1.519.943.000 | dự án có 104 dòng nhập từ bản cũ; so với TONGHOP: khớp |
| Vật tư | 983.971.000 | 763.957.000 (Loại ghi sẵn) | 763.957.000 | lệch 220.014.000 |
| Nhân công | 420.000.000 | 250.000.000 (Loại ghi sẵn) | 250.000.000 | lệch 170.000.000 |
| Dịch vụ-Phí | 115.972.000 | 115.972.000 (Loại ghi sẵn) |  |  |

Công nợ NCC: phần mềm (theo dự án DATT111) ↔ CONGNO_NCC lưu sẵn trong file

| Mã NCC | Phát sinh PM | Phát sinh file | Đã trả PM | Đã trả file | Còn lại PM | Còn lại file |
|---|---:|---:|---:|---:|---:|---:|
| NCC_TBCNQUANGDA → NCC_TBCNQĐ | 120.000.000 | 120.000.000 | 120.000.000 |  | 0 |  |
| NCC_HoaLan | 1.400.000 | 1.400.000 | 0 | 1.400.000 | 1.400.000 |  |
| NCC_Khac | 41.600.000 | 41.600.000 | 0 | 1.600.000 | 41.600.000 |  |
| NCC_VuongThinh | 232.910.000 | 232.910.000 | 0 | 232.910.000 | 232.910.000 |  |
| NCC_SongHan | 241.645.000 | 241.645.000 | 0 | 241.645.000 | 241.645.000 |  |
| NCC_NhatQuang | 49.426.000 | 49.426.000 | 0 | 49.426.000 | 49.426.000 |  |
| NCC_VUTHANH | 41.677.000 | 41.677.000 | 24.374.000 | 41.677.000 | 17.303.000 |  |
| NCC_Quân | 20.000.000 | 20.000.000 | 0 | 20.000.000 | 20.000.000 |  |
| NCC_Tai | 63.900.000 | 63.900.000 | 0 | 63.900.000 | 63.900.000 |  |
| NCC_Hau | 409.072.000 | 409.072.000 | 100.000.000 | 409.072.000 | 309.072.000 |  |
| NCC_CUCHANH | 298.313.000 | 298.313.000 | 0 | 298.313.000 | 298.313.000 |  |

### 3. Ánh xạ danh mục

**Công trình**

- `111THANHTHUY` (Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm) → DÙNG LẠI dự án `DATT111` (Dự án 111 Thanh Thủy) — mã nhà 111THANHTHUY đã thuộc dự án này (nhập từ bản cũ của file)
- `10PQA` "10 Phạm Quang Ảnh" → TẠO MỚI (ChiPhi_CongTrinh_10PQA.xlsm), khởi công 27/09/2026, Đang chuẩn bị
- `NĐC7lo` "NĐC7lo" → TẠO MỚI (ChiPhi_CongTrinh_NDC_7lo.xlsm), khởi công 31/07/2026, Đang thi công
- `NDC7T` "NDC 7 tầng" → TẠO MỚI (ChiPhi_CongTrinh_NDC7T.xlsm), khởi công 27/08/2026, Đang thi công
- `NHAMsHANH` "Nhà Ms Hạnh" → TẠO MỚI (ChiPhi_CongTrinh_nha Cô Hạnh.xlsm), khởi công —, Đang thi công

**Nhà**: tạo mới 8 (`10PQA` Dùng chung cả công trình → 10PQA; `NĐC7lo` Dùng chung cả công trình → NĐC7lo; `NĐC34` LÔ 3 + 4 → NĐC7lo; `NĐC910` LÔ 9+10 → NĐC7lo; `NĐC78` Lô 7+8 → NĐC7lo; `NĐC5` LÔ 5 → NĐC7lo; `NDC7T` Dùng chung cả công trình → NDC7T; `NHAMsHANH` Dùng chung cả công trình → NHAMsHANH); dùng lại 111THANHTHUY

**Hạng mục** tạo mới: `HM39` Bảo hành (nhóm NHOM_ChiPhiKhac)

**Vật tư** tạo mới: 13 — `BT-COCNHOI` Bê tông cọc nhổi (khoản); `DNUOC-MINH` Điện nước Minh (khoản); `VL-XERAC6` 6 xe rác (XE); `CHUNG` Chi phí chung CT(VC, múc, san nền…) (khoản); `BT-BETONG` Bê tông (khoản); `DIENNUOCVT` Vật tư điện nước (khoản); `ST-SATTHEP` Sắt thép (khoản); `VL_DATAPLO` Đá tấp lô (VIÊN); `VL-XEVC` XE VẬN CHUYỂN (XE); `VL-XEMUC` xe múc (XE); `VL_VLXD` Vật liệu xây dựng (khoản); `VL_CUVAY` Cừ vây (khoản); `DNUOC-THANGMAY` Thang máy (khoản); dùng lại 316

**Nhà cung cấp**: dùng lại 54, tạo mới 3

| Mã mới | Tên | Loại | Từ file |
|---|---|---|---|
| NCC_Vinaconex25 | Vinaconex25 | Bê tông | ChiPhi_CongTrinh_NDC_7lo.xlsm |
| NCC_MinhLongPhat | Minh Long Phát | đèn trang trí | ChiPhi_CongTrinh_nha Cô Hạnh.xlsm |
| NCC_CHUAXACDINH | Chưa xác định (thiếu mã NCC trong file Excel) |  |  |

Dùng lại: NCC_DienThuy → NCC_DIENTHUY; NCC_Khac → NCC_KHAC; NCC_Han → NCC_Han; NCC_VuongThinh → NCC_VuongThinh; NCC_NKVu → NCC_NKVu; NCC_VuongThoNe → NCC_VuongThoNe; NCC_XuanTrang → NCC_XUANTRANG; NCC_SongHan → NCC_SongHan; NCC_HienMai → NCC_HienMai; NCC_ChienMLP → NCC_ChienMLP; NCC_Quynh → NCC_Quynh; NCC_ThienHan → NCC_ThienHan; NCC_NhatQuang → NCC_NhatQuang; NCC_NguyenKhang → NCC_NguyenKhang; NCC_TamDienNuoc → NCC_TamDienNuoc; NCC_LyCoKhi → NCC_LyCoKhi; NCC_MinhDienNuoc → NCC_MinhDienNuoc; NCC_KibiHome → NCC_KibiHome; NCC_Vina → NCC_Vina; NCC_CanTach → NCC_CanTach; NCC_Hoang → NCC_Hoang; NCC_LyDaMai → NCC_LyDaMai; NCC_Hoa → NCC_Hoa; NCC_Thao → NCC_Thao; NCC_NemVui → NCC_NemVui; NCC_SayTrung → NCC_SayTrung; NCC_TuongAnKhang → NCC_TuongAnKhang; NCC_Trieu → NCC_Trieu; NCC_Thuy → NCC_Thuy; NCC_Song → NCC_Song; NCC_Jysk → NCC_Jysk; NCC_VuBaoTin → NCC_VuBaoTin; NCC_Maxxa → NCC_Maxxa; NCC_HuongQuang → NCC_HuongQuang; NCC_GRC → NCC_GRC; NCC_XTiles → NCC_XTiles; NCC_VUTHANH → NCC_VUTHANH; NCC_Quân → NCC_Quân; NCC_Tai → NCC_Tai; NCC_Hau → NCC_Hau; NCC_Thanh → NCC_Thanh; NCC_AnhTuan → NCC_AnhTuan; NCC_Thinh → NCC_Thinh; NCC_Bao → NCC_Bao; NCC_Trung → NCC_Trung; NCC_TRAQUANG → NCC_TRAQUANG; NCC_THienHAi/NCC_ThienHai → NCC_ThienHai; NCC_Nghi → NCC_Nghi; NCC_HoaLan → NCC_HoaLan; NCC_Quoc → NCC_Quoc; NCC_666 → NCC_666; NCC_Khoi → NCC_Khoi; NCC_TBCNQUANGDA → NCC_TBCNQĐ (trùng tên "TBCN Quảng Đà"); NCC_CUCHANH → NCC_CUCHANH

#### Xung đột danh mục giữa các file (đã gộp)

- [hang-muc-ma] Mã HM37 mang 2 tên khác nhau: "Bảo hành" (ChiPhi_CongTrinh_10PQA.xlsm) / "Chi phí quản lý (giám sát, VP)" (ChiPhi_CongTrinh_NDC_7lo.xlsm, ChiPhi_CongTrinh_NDC7T.xlsm, ChiPhi_CongTrinh_nha Cô Hạnh.xlsm, Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm, (phần mềm)). Dòng chi phí đối chiếu theo TÊN; tên nào chưa có thì tạo hạng mục riêng với mã không trùng.
- [vat-tu] Vật tư NỀ-CONGNE khác nhau giữa các file: ChiPhi_CongTrinh_10PQA = "Nhân công thợ nề" / khoản / HM "nhân công nề"; ChiPhi_CongTrinh_NDC_7lo = "Nhân công thợ nề" / khoản / HM "—"; ChiPhi_CongTrinh_NDC7T = "Nhân công thợ nề" / khoản / HM "nhân công nề"; ChiPhi_CongTrinh_nha Cô Hạnh = "Nhân công thợ nề" / khoản / HM "—"; Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX = "Nhân công thợ nề" / khoản / HM "Nhân công thợ nề" → chọn "Nhân công thợ nề" / khoản (vật tư đã có trong phần mềm: giữ nguyên bản của phần mềm "Nhân công thợ nề" / khoản)
- [vat-tu] Vật tư BT-BOMDUN khác nhau giữa các file: ChiPhi_CongTrinh_NDC_7lo = "Bê tông bơm đùn" / khoản / HM "Bê tông"; Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX = "BÊ tông bơm/đùn" / khoản / HM "Bê tông" → chọn "Bê tông bơm đùn" / khoản (vật tư đã có trong phần mềm: giữ nguyên bản của phần mềm "BÊ tông bơm/đùn" / khoản)
- [ncc-ten-khac-phan-mem] NCC NCC_DIENTHUY: phần mềm ghi "Công ty Điền Thủy", file ghi "Cty Điền Thủy" — giữ tên trong phần mềm (không sửa dữ liệu cũ)
- [ncc-ten-khac-phan-mem] NCC NCC_VuongThinh: phần mềm ghi "VLXD Vương Thịnh", file ghi "Vương Thịnh" — giữ tên trong phần mềm (không sửa dữ liệu cũ)
- [ncc-ten-khac-phan-mem] NCC NCC_SongHan: phần mềm ghi "Bê tông Sông Hàn", file ghi "Sông Hàn" — giữ tên trong phần mềm (không sửa dữ liệu cũ)
- [ncc-ten-loai] NCC NCC_ChienMLP có tên/loại khác nhau: ChiPhi_CongTrinh_10PQA = "Chiến MLP" / Vật tư; ChiPhi_CongTrinh_NDC_7lo = "Chiến Minh Long Phát" / đèn trang trí; ChiPhi_CongTrinh_NDC7T = "Chiến MLP" / Vật tư; ChiPhi_CongTrinh_nha Cô Hạnh = "Chiến MLP" / Vật tư; Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX = "Chiến MLP" / Vật tư → chọn "Chiến Minh Long Phát" / Vật tư
- [ncc-ten-khac-phan-mem] NCC NCC_ChienMLP: phần mềm ghi "Chiến MLP", file ghi "Chiến Minh Long Phát" — giữ tên trong phần mềm (không sửa dữ liệu cũ)
- [ncc-ten-khac-phan-mem] NCC NCC_VUTHANH: phần mềm ghi "Điện nước Vũ Thanh", file ghi "Vũ Thanh" — giữ tên trong phần mềm (không sửa dữ liệu cũ)
- [ncc-ten-loai] NCC NCC_Quân có tên/loại khác nhau: ChiPhi_CongTrinh_10PQA = "Quân" / Điện nước; ChiPhi_CongTrinh_NDC_7lo = "Quân" / Điện nước; ChiPhi_CongTrinh_NDC7T = "Quân" / Điện nước; ChiPhi_CongTrinh_nha Cô Hạnh = "Quân" / Điện nước; Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX = "Quân điện nước" / Điện nước → chọn "Quân điện nước" / Điện nước
- [ncc-ten-loai] NCC NCC_Hau có tên/loại khác nhau: ChiPhi_CongTrinh_10PQA = "Hậu" / Chủ thầu; ChiPhi_CongTrinh_NDC_7lo = "Hậu" / Chủ thầu; ChiPhi_CongTrinh_NDC7T = "Hậu" / Chủ thầu; ChiPhi_CongTrinh_nha Cô Hạnh = "Hậu" / Chủ thầu; Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX = "Hậu thầu" / Chủ thầu → chọn "Hậu thầu" / Chủ thầu
- [ncc-ten-khac-phan-mem] NCC NCC_Hau: phần mềm ghi "Hậu", file ghi "Hậu thầu" — giữ tên trong phần mềm (không sửa dữ liệu cũ)
- [ncc-ma-hoa-thuong] Cùng một NCC viết mã khác hoa/thường: NCC_THienHAi, NCC_ThienHai (ChiPhi_CongTrinh_10PQA: NCC_THienHAi "A Thiện Hải"; ChiPhi_CongTrinh_NDC_7lo: NCC_ThienHai "A Hải kỹ thuật"; ChiPhi_CongTrinh_NDC7T: NCC_THienHAi "A Thiện Hải"; ChiPhi_CongTrinh_nha Cô Hạnh: NCC_ThienHai "A Hải kỹ thuật") → gộp làm một
- [ncc-ten-loai] NCC NCC_ThienHai có tên/loại khác nhau: ChiPhi_CongTrinh_10PQA = "A Thiện Hải" / Kỹ thuật; ChiPhi_CongTrinh_NDC_7lo = "A Hải kỹ thuật" / Kỹ thuật; ChiPhi_CongTrinh_NDC7T = "A Thiện Hải" / Kỹ thuật; ChiPhi_CongTrinh_nha Cô Hạnh = "A Hải kỹ thuật" / Kỹ thuật → chọn "A Hải kỹ thuật" / Kỹ thuật
- [ncc-ten-khac-phan-mem] NCC NCC_ThienHai: phần mềm ghi "A Thiện Hải", file ghi "A Hải kỹ thuật" — giữ tên trong phần mềm (không sửa dữ liệu cũ)
- [ncc-ten-loai] NCC NCC_HoaLan có tên/loại khác nhau: ChiPhi_CongTrinh_NDC_7lo = "Hoa Lan" / Vật liệu xây dựng; ChiPhi_CongTrinh_nha Cô Hạnh = "Hoa Lan" / Vật liệu xây dựng; Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX = "VLXD Hoa Lan" / Vật tư → chọn "VLXD Hoa Lan" / Vật liệu xây dựng
- [ncc-ten-khac-phan-mem] NCC NCC_Quoc: phần mềm ghi "a Quốc Kỹ thuật", file ghi "a Quốc" — giữ tên trong phần mềm (không sửa dữ liệu cũ)
- [ncc-ten-loai] NCC NCC_Khoi có tên/loại khác nhau: ChiPhi_CongTrinh_NDC_7lo = "Khôi" / kết cấu; ChiPhi_CongTrinh_NDC7T = "Khôi kết cấu" / Kết cấu; ChiPhi_CongTrinh_nha Cô Hạnh = "Khôi" / kết cấu → chọn "Khôi kết cấu" / kết cấu
- [ncc-ten-khac-phan-mem] NCC NCC_Khoi: phần mềm ghi "Khôi", file ghi "Khôi kết cấu" — giữ tên trong phần mềm (không sửa dữ liệu cũ)
- [ncc-khop-ten] NCC NCC_TBCNQUANGDA "TBCN Quảng Đà" khớp theo tên với NCC đang có NCC_TBCNQĐ → dùng lại NCC_TBCNQĐ

### 4. Cần bạn quyết định

- [cong-trinh-dung-lai] Công trình 111THANHTHUY (111 Thanh Thủy) được nhập vào dự án ĐÃ CÓ DATT111 (Dự án 111 Thanh Thủy) vì mã nhà 111THANHTHUY đã thuộc dự án này (nhập từ bản cũ của file). Nếu không đúng: rollback lần nhập này.
- [nghi trùng cong-trinh] 10PQA (10 Phạm Quang Ảnh) ↔ DAPQA10 (Dự án 10 Phạm Quang Ảnh) (tên/địa chỉ có chung: 10, pham, quang, anh)
- [nghi trùng cong-trinh] NĐC7lo (NĐC7lo) ↔ DANDC10 (Dự án Nguyễn Đình Chiểu lô 10 (623)) (tên/địa chỉ có chung: nguyen, dinh, chieu)
- [nghi trùng cong-trinh] NĐC7lo (NĐC7lo) ↔ DANDC910 (Dự án Nguyễn Đình Chiểu lô 9 va 10) (tên/địa chỉ có chung: nguyen, dinh, chieu)
- [nghi trùng cong-trinh] NĐC7lo (NĐC7lo) ↔ DANDC34 (Dự án Nguyễn Đình Chiểu lô 3 và 4 (613+614)) (tên/địa chỉ có chung: nguyen, dinh, chieu)
- [nghi trùng cong-trinh] NĐC7lo (NĐC7lo) ↔ DANDC5 (Dự án Nguyễn Đình Chiểu lô 5) (tên/địa chỉ có chung: nguyen, dinh, chieu)
- [nghi trùng cong-trinh] NĐC7lo (NĐC7lo) ↔ DANC78 (Dự án Nguyễn Đình Chiểu lô 7 và 8) (tên/địa chỉ có chung: nguyen, dinh, chieu)
- [nghi trùng cong-trinh] NĐC7lo (NĐC7lo) ↔ DANDCCHUNG (Dự án Nguyễn Đình Chiểu chung 7 LÔ) (tên/địa chỉ có chung: nguyen, dinh, chieu)
- [nghi trùng cong-trinh] NĐC7lo (NĐC7lo) ↔ DANDC7T (Dự án Nguyễn Đình Chiều 7 tầng) (tên/địa chỉ có chung: nguyen, dinh, chieu)
- [nghi trùng cong-trinh] NDC7T (NDC 7 tầng) ↔ DANDC10 (Dự án Nguyễn Đình Chiểu lô 10 (623)) (tên/địa chỉ có chung: nguyen, dinh, chieu)
- [nghi trùng cong-trinh] NDC7T (NDC 7 tầng) ↔ DANDC910 (Dự án Nguyễn Đình Chiểu lô 9 va 10) (tên/địa chỉ có chung: nguyen, dinh, chieu)
- [nghi trùng cong-trinh] NDC7T (NDC 7 tầng) ↔ DANDC34 (Dự án Nguyễn Đình Chiểu lô 3 và 4 (613+614)) (tên/địa chỉ có chung: nguyen, dinh, chieu)
- [nghi trùng cong-trinh] NDC7T (NDC 7 tầng) ↔ DANDC5 (Dự án Nguyễn Đình Chiểu lô 5) (tên/địa chỉ có chung: nguyen, dinh, chieu)
- [nghi trùng cong-trinh] NDC7T (NDC 7 tầng) ↔ DANC78 (Dự án Nguyễn Đình Chiểu lô 7 và 8) (tên/địa chỉ có chung: nguyen, dinh, chieu)
- [nghi trùng cong-trinh] NDC7T (NDC 7 tầng) ↔ DANDCCHUNG (Dự án Nguyễn Đình Chiểu chung 7 LÔ) (tên/địa chỉ có chung: nguyen, dinh, chieu)
- [nghi trùng cong-trinh] NDC7T (NDC 7 tầng) ↔ DANDC7T (Dự án Nguyễn Đình Chiều 7 tầng) (mã gần giống)
- [nghi trùng cong-trinh] NHAMsHANH (Nhà Ms Hạnh) ↔ DANHAMsHanh (Dự án nhà Ms Hạnh) (mã gần giống)
- [nghi trùng ncc] NCC_Vinaconex25 (Vinaconex25) ↔ NCC_Vina (Vina) (tên chứa nhau)
- [nghi trùng ncc] NCC_MinhLongPhat (Minh Long Phát) ↔ NCC_ChienMLP (Chiến Minh Long Phát) (tên chứa nhau)
- [ma-ct-sai] ChiPhi_CongTrinh_10PQA.xlsm / NHATKYCHUNG dòng 2: Mã CT "34PHK" không có trong DM_CONGTRINH của file → gán công trình của file 10PQA (mã gốc ghi vào Ghi chú). CHÚ Ý: mã 34PHK giống một dự án khác đang có trong phần mềm — có thể dòng này thuộc công trình khác
- [thieu-ncc] ChiPhi_CongTrinh_NDC_7lo.xlsm / NHATKYCHUNG dòng 124: Thiếu Mã NCC → gán tạm NCC "NCC_CHUAXACDINH" (phần mềm bắt buộc có NCC); cần chỉ định NCC đúng
- [khac-ban-cu] Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm / NHATKYCHUNG dòng 2: Cùng khoản với dòng #505 đã có trong phần mềm (ngày, hạng mục, thành tiền 550.000, NCC trùng) nhưng file mới khác ở maVT: phần mềm "XX-CHUAXACDINH" / file mới "XX-KHAC" → không nhập thêm, giữ nguyên dòng đang có (sửa tay trong phần mềm nếu muốn theo file mới)
- [so-quy-khong-tien] ChiPhi_CongTrinh_10PQA.xlsm / SO_QUY dòng 2: Số tiền 0 → không nhập. CHÚ Ý: cột Chi có số gõ tay 50.000 — có thể là khoản thật, cần xem. Ngày 09/05/2026 nghi hoán đổi (số phiếu pc001/09) → nếu nhập thì là 05/09/2026
- [so-quy-khong-tien] ChiPhi_CongTrinh_10PQA.xlsm / SO_QUY dòng 3: Số tiền 0 → không nhập. CHÚ Ý: cột Chi có số gõ tay 6.000.000 — có thể là khoản thật, cần xem. Ngày 09/05/2026 nghi hoán đổi (số phiếu pc002/09) → nếu nhập thì là 05/09/2026
- [so-quy-nghi-da-co] ChiPhi_CongTrinh_NDC_7lo.xlsm / SO_QUY dòng 14: Khoản 80.000.000 ngày 19/09/2026 NGHI đã có trong sổ thu chi (#109 19/09/2026 PC029/09 DANDC910 NCC_Vuong 80.000.000 "Vương xin ứng tiền trả lương thợ ở Nguyễn Đình Chi") — nhập dạng Nháp, chỉ Ghi sổ nếu chắc chắn chưa có
- [thieu-ngay] ChiPhi_CongTrinh_nha Cô Hạnh.xlsm / SO_QUY dòng 2: Thiếu ngày → suy ra 17/09/2026 từ dòng chi phí cùng NCC, cùng số tiền, cùng nội dung (NHATKYCHUNG dòng 2)

### 5. Danh sách đầy đủ các dòng bị sửa / suy ra / bỏ qua / cảnh báo

Tổng: Sửa 56, Cảnh báo 58, Bỏ qua 37, CẦN QUYẾT ĐỊNH 7, Suy ra 286. Bản CSV: `van-de.csv`.

| File | Sheet | Dòng | Mức | Loại | Chi tiết |
|---|---|---:|---|---|---|
| ChiPhi_CongTrinh_10PQA.xlsm | DM_CONGTRINH | 2 | Sửa | ngay-khoi-cong | Ngày khởi công là chữ "27/9/2026", đọc theo ngày-trước-tháng → 27/09/2026 |
| ChiPhi_CongTrinh_10PQA.xlsm | DM_HANGMUC | 38 | Sửa | hang-muc-doi-ma | Hạng mục "Bảo hành" (mã HM37 trong file) được tạo với mã HM39 vì mã HM37 đã dùng cho hạng mục khác |
| ChiPhi_CongTrinh_10PQA.xlsm | DM_NHA | 3 | Bỏ qua | nha-mau-rac | Nhà N1 (Nhà 1, Mã CT NCT) không thuộc công trình 10PQA và không có dòng chi phí nào dùng → không nhập (phần thừa của file mẫu) |
| ChiPhi_CongTrinh_10PQA.xlsm | DM_NHA | 4 | Bỏ qua | nha-mau-rac | Nhà N2 (Nhà 2, Mã CT NCT) không thuộc công trình 10PQA và không có dòng chi phí nào dùng → không nhập (phần thừa của file mẫu) |
| ChiPhi_CongTrinh_10PQA.xlsm | DM_NHA | 5 | Bỏ qua | nha-mau-rac | Nhà N3 (Nhà 3, Mã CT NCT) không thuộc công trình 10PQA và không có dòng chi phí nào dùng → không nhập (phần thừa của file mẫu) |
| ChiPhi_CongTrinh_10PQA.xlsm | DM_NHA | 6 | Bỏ qua | nha-mau-rac | Nhà N4 (Nhà 4, Mã CT NCT) không thuộc công trình 10PQA và không có dòng chi phí nào dùng → không nhập (phần thừa của file mẫu) |
| ChiPhi_CongTrinh_10PQA.xlsm | DM_NHA | 7 | Bỏ qua | nha-mau-rac | Nhà N5 (Nhà 5, Mã CT NCT) không thuộc công trình 10PQA và không có dòng chi phí nào dùng → không nhập (phần thừa của file mẫu) |
| ChiPhi_CongTrinh_10PQA.xlsm | DM_VATTU | 311 | Cảnh báo | vat-tu-hang-muc-la | Vật tư CHUNG: "hạng mục hay dùng" "chung" không có trong danh mục hạng mục, để trống |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 2 | CẦN QUYẾT ĐỊNH | ma-ct-sai | Mã CT "34PHK" không có trong DM_CONGTRINH của file → gán công trình của file 10PQA (mã gốc ghi vào Ghi chú). CHÚ Ý: mã 34PHK giống một dự án khác đang có trong phần mềm — có thể dòng này thuộc công trình khác |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 2 | Suy ra | ma-nha-sai | Mã Nhà "CHUNG" không có trong DM_NHA của file → gán nhà dùng chung 10PQA (mã gốc ghi vào Ghi chú) |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 4 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 4 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 4 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D18) |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 5 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 5 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 5 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D16) |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 6 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 6 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 6 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D12) |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 7 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 7 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 7 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D10) |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 8 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 350.000 (SL trống, ĐG trống) → SL 1 × ĐG 350.000 |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 8 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 8 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 8 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-TIENXE) |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 9 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 421.000 (SL trống, ĐG trống) → SL 1 × ĐG 421.000 |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 9 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 9 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 9 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư DNUOC-MINH) |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 10 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 140.000 (SL trống, ĐG trống) → SL 1 × ĐG 140.000 |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 10 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 10 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 10 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư DNUOC-MINH) |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 11 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 3.472.000 (SL trống, ĐG trống) → SL 1 × ĐG 3.472.000 |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 11 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 11 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 11 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư DNUOC-MINH) |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 12 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 3.698.000 (SL trống, ĐG trống) → SL 1 × ĐG 3.698.000 |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 12 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 12 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 12 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư DNUOC-MINH) |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 13 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 665.000 (SL trống, ĐG trống) → SL 1 × ĐG 665.000 |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 13 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 13 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 13 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư DNUOC-MINH) |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 14 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 14 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 14 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D18) |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 15 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 15 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 15 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D16) |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 16 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 16 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 16 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D10) |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 17 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 17 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 17 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D6) |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 18 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 700.000 (SL trống, ĐG trống) → SL 1 × ĐG 700.000 |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 18 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 18 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 18 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-TIENXE) |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 19 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 64.685.000 (SL trống, ĐG trống) → SL 1 × ĐG 64.685.000 |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 19 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 19 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 19 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (không có mã VT, còn lại → Vật tư (hạng mục "Vật tư VLXD")) |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 20 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 1.272.000 (SL trống, ĐG trống) → SL 1 × ĐG 1.272.000 |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 20 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 20 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 20 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư DNUOC-MINH) |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 21 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 1.601.000 (SL trống, ĐG trống) → SL 1 × ĐG 1.601.000 |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 21 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 21 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung 10PQA |
| ChiPhi_CongTrinh_10PQA.xlsm | NHATKYCHUNG | 21 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư DNUOC-MINH) |
| ChiPhi_CongTrinh_10PQA.xlsm | SO_QUY | 2 | CẦN QUYẾT ĐỊNH | so-quy-khong-tien | Số tiền 0 → không nhập. CHÚ Ý: cột Chi có số gõ tay 50.000 — có thể là khoản thật, cần xem. Ngày 09/05/2026 nghi hoán đổi (số phiếu pc001/09) → nếu nhập thì là 05/09/2026 [pc001/09 / 2026-05-09 / NCC_THienHAi / thúy chi] |
| ChiPhi_CongTrinh_10PQA.xlsm | SO_QUY | 3 | CẦN QUYẾT ĐỊNH | so-quy-khong-tien | Số tiền 0 → không nhập. CHÚ Ý: cột Chi có số gõ tay 6.000.000 — có thể là khoản thật, cần xem. Ngày 09/05/2026 nghi hoán đổi (số phiếu pc002/09) → nếu nhập thì là 05/09/2026 [pc002/09 / 2026-05-09 / NCC_VuongThinh / thúy chi] |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | DM_CONGTRINH | 2 | Sửa | ngay-khoi-cong | Ngày khởi công là chữ "31/7/2026", đọc theo ngày-trước-tháng → 31/07/2026 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 2 | Suy ra | loai-cp-suy-ra | Loại CP trống → Dịch vụ-Phí (mã XX-KHAC là mã khoản/chung) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 3 | Suy ra | loai-cp-suy-ra | Loại CP trống → Dịch vụ-Phí (mã XX-KHAC là mã khoản/chung) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 4 | Suy ra | loai-cp-suy-ra | Loại CP trống → Dịch vụ-Phí (mã XX-KHAC là mã khoản/chung) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 5 | Suy ra | loai-cp-suy-ra | Loại CP trống → Dịch vụ-Phí (mã XX-KHAC là mã khoản/chung) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 6 | Suy ra | loai-cp-suy-ra | Loại CP trống → Dịch vụ-Phí (mã XX-KHAC là mã khoản/chung) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 7 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư BT-M250) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 8 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 4.500.000 (SL trống, ĐG trống) → SL 1 × ĐG 4.500.000 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 8 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư BT-M250) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 9 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư BT-M250) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 10 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 3.620.000 (SL trống, ĐG trống) → SL 1 × ĐG 3.620.000 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 10 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư BT-M250) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 11 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-XEMUC) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 12 | Suy ra | loai-cp-suy-ra | Loại CP trống → Dịch vụ-Phí (mã XX-KHAC là mã khoản/chung) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 13 | Suy ra | loai-cp-suy-ra | Loại CP trống → Dịch vụ-Phí (mã XX-KHAC là mã khoản/chung) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 14 | Suy ra | loai-cp-suy-ra | Loại CP trống → Dịch vụ-Phí (mã XX-KHAC là mã khoản/chung) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 15 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư DIENNUOCVT) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 16 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư DEN-DIEN) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 17 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL_CUVAY) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 18 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư BT-M250) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 19 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 5.100.000 (SL trống, ĐG trống) → SL 1 × ĐG 5.100.000 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 19 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư BT-BOMDUN) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 20 | Suy ra | loai-cp-suy-ra | Loại CP trống → Nhân công (hạng mục "Nhân công thợ nề" là nhân công) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 21 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D16) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 22 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D10) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 23 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D8) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 24 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D6) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 25 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-TIENXE) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 26 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-XEVC) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 27 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-XEVC) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 28 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-CATXAY) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 29 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-XIMANG) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 30 | Cảnh báo | dong-giong-het | Dòng giống hệt một dòng phía trên (lần thứ 2) — vẫn nhập (có thể là hai lần giao hàng thật) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 30 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-CATXAY) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 31 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL_DATAPLO) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 32 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-DA12) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 33 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-XEVC) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 34 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-CATXAY) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 35 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-GACHONG) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 36 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-GACHTHE) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 37 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-XEVC) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 38 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 2.500.000 (SL trống, ĐG trống) → SL 1 × ĐG 2.500.000 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 38 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-XEVC) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 39 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-DA12) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 40 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-CATXAY) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 41 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-XIMANG-TAN) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 42 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-GACHONG) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 43 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-CATXAY) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 44 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-CATXAY) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 45 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-CATXAY) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 46 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-GACHONG) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 47 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-GACHTHE) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 48 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-CATXAY) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 49 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-DA12) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 50 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D18) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 51 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D16) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 52 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D12) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 53 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D8) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 54 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D6) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 55 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-BUOC) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 56 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-TIENXE) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 57 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D16) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 58 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D10) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 59 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-TIENXE) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 60 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D18) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 61 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D16) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 62 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D6) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 63 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-BUOC) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 64 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-TIENXE) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 65 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D18) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 66 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D16) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 67 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D12) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 68 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D8) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 69 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D6) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 70 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-BUOC) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 71 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-TIENXE) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 72 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D16) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 73 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D10) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 74 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D6) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 75 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-TIENXE) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 76 | Cảnh báo | dong-giong-het | Dòng giống hệt một dòng phía trên (lần thứ 2) — vẫn nhập (có thể là hai lần giao hàng thật) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 76 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D16) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 77 | Cảnh báo | dong-giong-het | Dòng giống hệt một dòng phía trên (lần thứ 2) — vẫn nhập (có thể là hai lần giao hàng thật) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 77 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D10) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 78 | Cảnh báo | dong-giong-het | Dòng giống hệt một dòng phía trên (lần thứ 2) — vẫn nhập (có thể là hai lần giao hàng thật) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 78 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D8) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 79 | Cảnh báo | dong-giong-het | Dòng giống hệt một dòng phía trên (lần thứ 2) — vẫn nhập (có thể là hai lần giao hàng thật) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 79 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D6) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 80 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 1.000.000 (SL trống, ĐG trống) → SL 1 × ĐG 1.000.000 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 80 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-TIENXE) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 81 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D16) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 82 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D12) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 83 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D10) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 84 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D6) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 85 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 550.000 (SL trống, ĐG trống) → SL 1 × ĐG 550.000 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 85 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-TIENXE) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 86 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D16) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 87 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D10) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 88 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D8) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 89 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D6) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 90 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-BUOC) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 91 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 1.100.000 (SL trống, ĐG trống) → SL 1 × ĐG 1.100.000 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 91 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-TIENXE) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 92 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 50.000.000 (SL trống, ĐG trống) → SL 1 × ĐG 50.000.000 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 92 | Suy ra | loai-cp-suy-ra | Loại CP trống → Nhân công (hạng mục "Nhân công thợ nề" là nhân công) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 93 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 80.000.000 (SL trống, ĐG trống) → SL 1 × ĐG 80.000.000 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 93 | Suy ra | loai-cp-suy-ra | Loại CP trống → Nhân công (hạng mục "Nhân công thợ nề" là nhân công) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 94 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 60.000 (SL trống, ĐG trống) → SL 1 × ĐG 60.000 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 94 | Suy ra | loai-cp-suy-ra | Loại CP trống → Dịch vụ-Phí (mã XX-KHAC là mã khoản/chung) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 95 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D18) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 96 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D16) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 97 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D12) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 98 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D8) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 99 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-BUOC) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 100 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 800.000 (SL trống, ĐG trống) → SL 1 × ĐG 800.000 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 100 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-TIENXE) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 101 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 150.000.000 (SL trống, ĐG trống) → SL 1 × ĐG 150.000.000 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 101 | Suy ra | loai-cp-suy-ra | Loại CP trống → Nhân công (hạng mục "Nhân công thợ nề" là nhân công) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 102 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 102 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D18) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 103 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 103 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D16) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 104 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 104 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D10) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 105 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 105 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D8) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 106 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 106 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D6) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 107 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 1.100.000 (SL trống, ĐG trống) → SL 1 × ĐG 1.100.000 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 107 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 107 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-TIENXE) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 108 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D18) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 109 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D16) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 110 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D10) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 111 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D8) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 112 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D6) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 113 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-BUOC) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 114 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 800.000 (SL trống, ĐG trống) → SL 1 × ĐG 800.000 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 114 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-TIENXE) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 115 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D16) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 116 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D10) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 117 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D8) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 118 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D6) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 119 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-BUOC) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 120 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 1.000.000 (SL trống, ĐG trống) → SL 1 × ĐG 1.000.000 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 120 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-TIENXE) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 121 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 1.200.000 (SL trống, ĐG trống) → SL 1 × ĐG 1.200.000 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 121 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 121 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (không có mã VT, còn lại → Vật tư (hạng mục "Vật tư VLXD")) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 122 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 223.715.000 (SL trống, ĐG trống) → SL 1 × ĐG 223.715.000 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 122 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 122 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (không có mã VT, còn lại → Vật tư (hạng mục "Vật tư VLXD")) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 123 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 4.594.000 (SL trống, ĐG trống) → SL 1 × ĐG 4.594.000 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 123 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 123 | Cảnh báo | thieu-vt-dien-giai | Không có Mã VT lẫn Diễn giải (phần mềm sẽ yêu cầu bổ sung khi sửa dòng này) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 123 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (không có mã VT, còn lại → Vật tư (hạng mục "Vật tư điện nước")) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 124 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 622.000 (SL trống, ĐG trống) → SL 1 × ĐG 622.000 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 124 | Suy ra | thieu-ma-nha | Mã Nhà trống → gán nhà dùng chung NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 124 | Cảnh báo | thieu-vt-dien-giai | Không có Mã VT lẫn Diễn giải (phần mềm sẽ yêu cầu bổ sung khi sửa dòng này) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 124 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (không có mã VT, còn lại → Vật tư (hạng mục "Vật tư điện nước")) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 124 | CẦN QUYẾT ĐỊNH | thieu-ncc | Thiếu Mã NCC → gán tạm NCC "NCC_CHUAXACDINH" (phần mềm bắt buộc có NCC); cần chỉ định NCC đúng |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 125 | Bỏ qua | khong-co-so-tien | Không có số tiền (Thành tiền trống, thiếu SL/ĐG) → không nhập (ô Thành tiền là công thức trả về rỗng) [Vật tư điện nước] |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 126 | Cảnh báo | dong-giong-het | Dòng giống hệt một dòng phía trên (lần thứ 2) — vẫn nhập (có thể là hai lần giao hàng thật) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 126 | Bỏ qua | khong-co-so-tien | Không có số tiền (Thành tiền trống, thiếu SL/ĐG) → không nhập (ô Thành tiền là công thức trả về rỗng) [Vật tư điện nước] |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 127 | Cảnh báo | dong-giong-het | Dòng giống hệt một dòng phía trên (lần thứ 3) — vẫn nhập (có thể là hai lần giao hàng thật) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 127 | Bỏ qua | khong-co-so-tien | Không có số tiền (Thành tiền trống, thiếu SL/ĐG) → không nhập (ô Thành tiền là công thức trả về rỗng) [Vật tư điện nước] |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 128 | Cảnh báo | dong-giong-het | Dòng giống hệt một dòng phía trên (lần thứ 4) — vẫn nhập (có thể là hai lần giao hàng thật) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 128 | Bỏ qua | khong-co-so-tien | Không có số tiền (Thành tiền trống, thiếu SL/ĐG) → không nhập (ô Thành tiền là công thức trả về rỗng) [Vật tư điện nước] |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 129 | Cảnh báo | dong-giong-het | Dòng giống hệt một dòng phía trên (lần thứ 5) — vẫn nhập (có thể là hai lần giao hàng thật) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | NHATKYCHUNG | 129 | Bỏ qua | khong-co-so-tien | Không có số tiền (Thành tiền trống, thiếu SL/ĐG) → không nhập (ô Thành tiền là công thức trả về rỗng) [Vật tư điện nước] |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 2 | Suy ra | loai-thu-chi-suy-ra | Cột Loại trống, Số tiền > 0 → suy ra "Chi" (trả nhà cung cấp) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 2 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 2 | Suy ra | thieu-noi-dung | Lý do/Nội dung trống → ghi "Trả NCC_KHAC (SO_QUY dòng 2)" |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 2 | Cảnh báo | nhom-thu-chi-trong | Nhóm thu chi trống — để trống (phần mềm không có trường này) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 3 | Suy ra | loai-thu-chi-suy-ra | Cột Loại trống, Số tiền > 0 → suy ra "Chi" (trả nhà cung cấp) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 3 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 3 | Suy ra | thieu-noi-dung | Lý do/Nội dung trống → ghi "Trả NCC_ThienHai (SO_QUY dòng 3)" |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 3 | Cảnh báo | nhom-thu-chi-trong | Nhóm thu chi trống — để trống (phần mềm không có trường này) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 4 | Cảnh báo | column1 | Cột "Column1" (cột rác) có nội dung "c Dung chi" — không nhập |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 4 | Suy ra | loai-thu-chi-suy-ra | Cột Loại trống, Số tiền > 0 → suy ra "Chi" (trả nhà cung cấp) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 4 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 4 | Cảnh báo | so-phieu-trung | Số phiếu PC003/08 xuất hiện nhiều lần trong SO_QUY của file — vẫn nhập từng dòng |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 4 | Suy ra | thieu-noi-dung | Lý do/Nội dung trống → ghi "Trả NCC_MinhDienNuoc (SO_QUY dòng 4)" |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 4 | Cảnh báo | nhom-thu-chi-trong | Nhóm thu chi trống — để trống (phần mềm không có trường này) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 5 | Suy ra | loai-thu-chi-suy-ra | Cột Loại trống, Số tiền > 0 → suy ra "Chi" (trả nhà cung cấp) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 5 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 5 | Bỏ qua | so-quy-da-co | Khoản chi 121.255.000 ngày 05/09/2026 ĐÃ CÓ trong sổ thu chi (#71 05/09/2026 PC003/09 DANDCCHUNG NCC_XUANTRANG 121.255.000 "thanh toán công nợ Xuân Trang") → không nhập lại để khỏi trừ tiền hai lần |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 6 | Suy ra | loai-thu-chi-suy-ra | Cột Loại trống, Số tiền > 0 → suy ra "Chi" (trả nhà cung cấp) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 6 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 6 | Bỏ qua | so-quy-da-co | Khoản chi 1.200.000 ngày 05/09/2026 ĐÃ CÓ trong sổ thu chi (#77 05/09/2026 PC006/09 DANDCCHUNG NCC_VuongThinh 1.200.000 "thanh toán công nợ Vương Thịnh") → không nhập lại để khỏi trừ tiền hai lần |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 7 | Suy ra | loai-thu-chi-suy-ra | Cột Loại trống, Số tiền > 0 → suy ra "Chi" (trả nhà cung cấp) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 7 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 7 | Bỏ qua | so-quy-da-co | Khoản chi 73.240.000 ngày 05/09/2026 ĐÃ CÓ trong sổ thu chi (#73 05/09/2026 PC005/09 DANDCCHUNG NCC_SongHan 53.780.000 "thanh toán công nợ Sông Hàn" + #74 05/09/2026 PC005/09 DANDCCHUNG NCC_SongHan 19.460.000 "thanh toán công nợ Sông Hàn" (cộng lại)) → không nhập lại để khỏi trừ tiền hai lần |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 8 | Sửa | so-tien-cong-thuc | Ô Số tiền là công thức (=IF($K8="","",$K8*$L8), giá trị lưu sẵn 105725000) → lấy số gõ tay ở cột Chi 105.725.000 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 8 | Suy ra | loai-thu-chi-suy-ra | Cột Loại trống, Số tiền > 0 → suy ra "Chi" (trả nhà cung cấp) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 8 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 8 | Bỏ qua | so-quy-da-co | Khoản chi 105.725.000 ngày 05/09/2026 ĐÃ CÓ trong sổ thu chi (#72 05/09/2026 PC004/09 DANDCCHUNG NCC_HoaLan 105.725.000 "thanh toán công nợ Hoa Lan") → không nhập lại để khỏi trừ tiền hai lần |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 9 | Suy ra | loai-thu-chi-suy-ra | Cột Loại trống, Số tiền > 0 → suy ra "Chi" (trả nhà cung cấp) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 9 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 9 | Bỏ qua | so-quy-da-co | Khoản chi 4.530.000 ngày 05/09/2026 ĐÃ CÓ trong sổ thu chi (#78 05/09/2026 PC007/09 DANDCCHUNG NCC_Quoc 4.530.000 "thanh toán công nợ T8.2026 (Dung TT thúy đã trả lạ") → không nhập lại để khỏi trừ tiền hai lần |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 10 | Suy ra | loai-thu-chi-suy-ra | Cột Loại trống, Số tiền > 0 → suy ra "Chi" (trả nhà cung cấp) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 10 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 10 | Sửa | so-phieu-gia | Số phiếu giả "PC…/09" → để trống (giữ mã gốc trong Ghi chú) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 10 | Bỏ qua | so-quy-da-co | Khoản chi 32.400.000 ngày 08/09/2026 ĐÃ CÓ trong sổ thu chi (#88 08/09/2026 PC012/09 DANDCCHUNG NCC_666 32.400.000 "TT cừ vây NĐC lô5 (612) Nguyễn Đình Chiểu") → không nhập lại để khỏi trừ tiền hai lần |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 11 | Suy ra | loai-thu-chi-suy-ra | Cột Loại trống, Số tiền > 0 → suy ra "Chi" (trả nhà cung cấp) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 11 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 11 | Bỏ qua | so-quy-da-co | Khoản chi 150.000.000 ngày 11/09/2026 ĐÃ CÓ trong sổ thu chi (#93 12/09/2026 PC015/09 DANDC34 NCC_Trung 150.000.000 "Chi a Trung thầu lô 3.4 NDC (ứng lần 1)") → không nhập lại để khỏi trừ tiền hai lần |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 12 | Suy ra | loai-thu-chi-suy-ra | Cột Loại trống, Số tiền > 0 → suy ra "Chi" (trả nhà cung cấp) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 12 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 12 | Bỏ qua | so-quy-da-co | Khoản chi 31.350.000 ngày 11/09/2026 ĐÃ CÓ trong sổ thu chi (#94 12/09/2026 PC016/09 DANDC5 NCC_Tai 31.350.000 "Chi Tài thanh toán bê tông Vinaconex 25 (15m3 + bơ") → không nhập lại để khỏi trừ tiền hai lần |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 13 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 13 | Bỏ qua | so-quy-da-co | Khoản chi 50.000.000 ngày 19/09/2026 ĐÃ CÓ trong sổ thu chi (#104 19/09/2026 PC024/09 DANDC5 NCC_Tai 50.000.000 "Tài ứng lô 5 NDC lần 1 - 50tr") → không nhập lại để khỏi trừ tiền hai lần |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 14 | Sửa | ngay-cong-thuc | Ô Ngày là công thức, lấy theo ô B13 → 19/09/2026 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 14 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 14 | Sửa | so-phieu-trung-so-thu-chi | Số phiếu PC027/09 đã dùng cho khoản khác trong sổ thu chi → để trống số phiếu (giữ trong Ghi chú) để không gộp nhầm vào phiếu in của khoản khác |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 14 | CẦN QUYẾT ĐỊNH | so-quy-nghi-da-co | Khoản 80.000.000 ngày 19/09/2026 NGHI đã có trong sổ thu chi (#109 19/09/2026 PC029/09 DANDC910 NCC_Vuong 80.000.000 "Vương xin ứng tiền trả lương thợ ở Nguyễn Đình Chi") — nhập dạng Nháp, chỉ Ghi sổ nếu chắc chắn chưa có |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 14 | Cảnh báo | nhom-thu-chi-trong | Nhóm thu chi trống — để trống (phần mềm không có trường này) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 15 | Sửa | so-tien-cong-thuc | Ô Số tiền là công thức (=tblSoQuy[[#This Row],[Chi]], giá trị lưu sẵn 60000) → lấy số gõ tay ở cột Chi 60.000 |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 15 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 15 | Bỏ qua | so-quy-da-co | Khoản chi 60.000 ngày 19/09/2026 ĐÃ CÓ trong sổ thu chi (#114 19/09/2026 PC034/09 DANC78 NCC_ThienHai 60.000 "ship hs lô 8 ng đ chiểu 60k") → không nhập lại để khỏi trừ tiền hai lần |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 16 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 16 | Bỏ qua | so-quy-da-co | Khoản chi 150.000.000 ngày 26/09/2026 ĐÃ CÓ trong sổ thu chi (#121 26/09/2026 PC041/09 DANDC34 NCC_Trung 150.000.000 "Ứng trung thầu NDC") → không nhập lại để khỏi trừ tiền hai lần |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 17 | Suy ra | loai-thu-chi-suy-ra | Cột Loại trống, Số tiền > 0 → suy ra "Chi" (trả nhà cung cấp) |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 17 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NĐC7lo |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 17 | Cảnh báo | so-phieu-trung | Số phiếu PC003/08 xuất hiện nhiều lần trong SO_QUY của file — vẫn nhập từng dòng |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 17 | Suy ra | thieu-noi-dung | Lý do/Nội dung trống → ghi "Trả NCC_XUANTRANG (SO_QUY dòng 17)" |
| ChiPhi_CongTrinh_NDC_7lo.xlsm | SO_QUY | 17 | Cảnh báo | nhom-thu-chi-trong | Nhóm thu chi trống — để trống (phần mềm không có trường này) |
| ChiPhi_CongTrinh_NDC7T.xlsm | DM_CONGTRINH | 2 | Sửa | ngay-khoi-cong | Ngày khởi công là chữ "27/8/2026", đọc theo ngày-trước-tháng → 27/08/2026 |
| ChiPhi_CongTrinh_NDC7T.xlsm | NHATKYCHUNG | 2 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 27.500.000 (SL trống, ĐG trống) → SL 1 × ĐG 27.500.000 |
| ChiPhi_CongTrinh_NDC7T.xlsm | NHATKYCHUNG | 3 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 90.000 (SL trống, ĐG trống) → SL 1 × ĐG 90.000 |
| ChiPhi_CongTrinh_NDC7T.xlsm | NHATKYCHUNG | 3 | Suy ra | loai-cp-suy-ra | Loại CP trống → Dịch vụ-Phí (mã XX-KHAC là mã khoản/chung) |
| ChiPhi_CongTrinh_NDC7T.xlsm | NHATKYCHUNG | 4 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 400.000 (SL trống, ĐG trống) → SL 1 × ĐG 400.000 |
| ChiPhi_CongTrinh_NDC7T.xlsm | NHATKYCHUNG | 4 | Suy ra | loai-cp-suy-ra | Loại CP trống → Dịch vụ-Phí (mã XX-KHAC là mã khoản/chung) |
| ChiPhi_CongTrinh_NDC7T.xlsm | NHATKYCHUNG | 5 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 380.000 (SL trống, ĐG trống) → SL 1 × ĐG 380.000 |
| ChiPhi_CongTrinh_NDC7T.xlsm | NHATKYCHUNG | 5 | Suy ra | loai-cp-suy-ra | Loại CP trống → Dịch vụ-Phí (mã XX-KHAC là mã khoản/chung) |
| ChiPhi_CongTrinh_NDC7T.xlsm | SO_QUY | 2 | Sửa | so-phieu-gia | Số phiếu giả "PC…/09" → để trống (giữ mã gốc trong Ghi chú) |
| ChiPhi_CongTrinh_NDC7T.xlsm | SO_QUY | 2 | Bỏ qua | so-quy-da-co | Khoản chi 27.500.000 ngày 08/09/2026 ĐÃ CÓ trong sổ thu chi (#89 08/09/2026 PC013/09 DANDC7T NCC_Khoi 27.500.000 "Khôi ứng tiền (NĐC+PHK)") → không nhập lại để khỏi trừ tiền hai lần |
| ChiPhi_CongTrinh_NDC7T.xlsm | SO_QUY | 3 | Bỏ qua | so-quy-da-co | Khoản chi 90.000 ngày 14/09/2026 ĐÃ CÓ trong sổ thu chi (#96 14/09/2026 PC018/09 DANDC7T NCC_ThienHai 90.000 "In hồ sơ bản vẽ") → không nhập lại để khỏi trừ tiền hai lần |
| ChiPhi_CongTrinh_NDC7T.xlsm | SO_QUY | 4 | Bỏ qua | so-quy-da-co | Khoản chi 350.000 ngày 18/09/2026 ĐÃ CÓ trong sổ thu chi (#102 18/09/2026 PC023/09 DANDC7T NCC_ThienHai 350.000 "In hồ sơ 2 lô 7 tầng ng đình chiểu 350k") → không nhập lại để khỏi trừ tiền hai lần |
| ChiPhi_CongTrinh_NDC7T.xlsm | SO_QUY | 5 | Bỏ qua | so-quy-da-co | Khoản chi 400.000 ngày 21/09/2026 ĐÃ CÓ trong sổ thu chi (#113 19/09/2026 PC033/09 DANDC7T NCC_ThienHai 400.000 "A Hải & Hùng") → không nhập lại để khỏi trừ tiền hai lần |
| ChiPhi_CongTrinh_NDC7T.xlsm | SO_QUY | 6 | Bỏ qua | so-quy-da-co | Khoản chi 170.000 ngày 21/09/2026 ĐÃ CÓ trong sổ thu chi (#115 21/09/2026 PC035/09 DANDC7T NCC_ThienHai 170.000 "scan hs 2 lô 7 tầng ng đ chiểu 170k") → không nhập lại để khỏi trừ tiền hai lần |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | NHATKYCHUNG | 2 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 500.000 (SL trống, ĐG trống) → SL 1 × ĐG 500.000 |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | NHATKYCHUNG | 2 | Suy ra | ma-ct-sai | Mã CT "NHACOHANH" không có trong DM_CONGTRINH của file → gán công trình của file NHAMsHANH (mã gốc ghi vào Ghi chú) |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | NHATKYCHUNG | 3 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 65.000 (SL trống, ĐG trống) → SL 1 × ĐG 65.000 |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | NHATKYCHUNG | 3 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NHAMsHANH |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | NHATKYCHUNG | 3 | Suy ra | loai-cp-suy-ra | Loại CP trống → Dịch vụ-Phí (mã XX-KHAC là mã khoản/chung) |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | NHATKYCHUNG | 4 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NHAMsHANH |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | NHATKYCHUNG | 4 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D18) |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | NHATKYCHUNG | 5 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NHAMsHANH |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | NHATKYCHUNG | 5 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D12) |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | NHATKYCHUNG | 6 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NHAMsHANH |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | NHATKYCHUNG | 6 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D10) |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | NHATKYCHUNG | 7 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NHAMsHANH |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | NHATKYCHUNG | 7 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D8) |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | NHATKYCHUNG | 8 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NHAMsHANH |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | NHATKYCHUNG | 8 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-D6) |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | NHATKYCHUNG | 9 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NHAMsHANH |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | NHATKYCHUNG | 9 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-BUOC) |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | NHATKYCHUNG | 10 | Sửa | nhap-theo-khoan | Nhập theo khoản: file chỉ có Thành tiền 900.000 (SL trống, ĐG trống) → SL 1 × ĐG 900.000 |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | NHATKYCHUNG | 10 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NHAMsHANH |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | NHATKYCHUNG | 10 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư ST-TIENXE) |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | SO_QUY | 2 | Suy ra | loai-thu-chi-suy-ra | Cột Loại trống, Số tiền > 0 → suy ra "Chi" (trả nhà cung cấp) |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | SO_QUY | 2 | CẦN QUYẾT ĐỊNH | thieu-ngay | Thiếu ngày → suy ra 17/09/2026 từ dòng chi phí cùng NCC, cùng số tiền, cùng nội dung (NHATKYCHUNG dòng 2) |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | SO_QUY | 2 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NHAMsHANH |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | SO_QUY | 2 | Cảnh báo | thieu-so-phieu | Không có số phiếu — để trống (phần mềm không bắt buộc) |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | SO_QUY | 2 | Cảnh báo | nhom-thu-chi-trong | Nhóm thu chi trống — để trống (phần mềm không có trường này) |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | SO_QUY | 3 | Suy ra | loai-thu-chi-suy-ra | Cột Loại trống, Số tiền > 0 → suy ra "Chi" (trả nhà cung cấp) |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | SO_QUY | 3 | Suy ra | thieu-ma-ct | Mã CT trống → gán công trình của file NHAMsHANH |
| ChiPhi_CongTrinh_nha Cô Hạnh.xlsm | SO_QUY | 3 | Bỏ qua | so-quy-da-co | Khoản chi 65.000 ngày 17/09/2026 ĐÃ CÓ trong sổ thu chi (#100 17/09/2026 PC021/09 DANHAMsHanh NCC_ThienHai 65.000 "in/đóng dấu hồ sơ bản vẽ DA nhà Ms HẠnh") → không nhập lại để khỏi trừ tiền hai lần |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | DM_NHA | 3 | Bỏ qua | nha-mau-rac | Nhà N1 (Nhà 1, Mã CT NCT) không thuộc công trình 111THANHTHUY và không có dòng chi phí nào dùng → không nhập (phần thừa của file mẫu) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | DM_NHA | 4 | Bỏ qua | nha-mau-rac | Nhà N2 (Nhà 2, Mã CT NCT) không thuộc công trình 111THANHTHUY và không có dòng chi phí nào dùng → không nhập (phần thừa của file mẫu) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | DM_NHA | 5 | Bỏ qua | nha-mau-rac | Nhà N3 (Nhà 3, Mã CT NCT) không thuộc công trình 111THANHTHUY và không có dòng chi phí nào dùng → không nhập (phần thừa của file mẫu) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | DM_NHA | 6 | Bỏ qua | nha-mau-rac | Nhà N4 (Nhà 4, Mã CT NCT) không thuộc công trình 111THANHTHUY và không có dòng chi phí nào dùng → không nhập (phần thừa của file mẫu) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | DM_NHA | 7 | Bỏ qua | nha-mau-rac | Nhà N5 (Nhà 5, Mã CT NCT) không thuộc công trình 111THANHTHUY và không có dòng chi phí nào dùng → không nhập (phần thừa của file mẫu) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | DM_NHA | 8 | Bỏ qua | nha-mau-rac | Nhà NAM (Nhà anh Nam, Mã CT NCT) không thuộc công trình 111THANHTHUY và không có dòng chi phí nào dùng → không nhập (phần thừa của file mẫu) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 2 | CẦN QUYẾT ĐỊNH | khac-ban-cu | Cùng khoản với dòng #505 đã có trong phần mềm (ngày, hạng mục, thành tiền 550.000, NCC trùng) nhưng file mới khác ở maVT: phần mềm "XX-CHUAXACDINH" / file mới "XX-KHAC" → không nhập thêm, giữ nguyên dòng đang có (sửa tay trong phần mềm nếu muốn theo file mới) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 3 | Cảnh báo | ngay-nghi-ngo | Ngày 17/05/2026: sớm hơn ngày khởi công 31/07/2026 3 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 4 | Cảnh báo | ngay-nghi-ngo | Ngày 17/05/2026: sớm hơn ngày khởi công 31/07/2026 3 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 5 | Cảnh báo | ngay-nghi-ngo | Ngày 17/05/2026: sớm hơn ngày khởi công 31/07/2026 3 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 6 | Cảnh báo | ngay-nghi-ngo | Ngày 17/05/2026: sớm hơn ngày khởi công 31/07/2026 3 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 7 | Cảnh báo | ngay-nghi-ngo | Ngày 17/05/2026: sớm hơn ngày khởi công 31/07/2026 3 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 8 | Cảnh báo | ngay-nghi-ngo | Ngày 17/05/2026: sớm hơn ngày khởi công 31/07/2026 3 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 9 | Cảnh báo | ngay-nghi-ngo | Ngày 17/05/2026: sớm hơn ngày khởi công 31/07/2026 3 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 10 | Cảnh báo | ngay-nghi-ngo | Ngày 17/05/2026: sớm hơn ngày khởi công 31/07/2026 3 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 11 | Cảnh báo | ngay-nghi-ngo | Ngày 18/05/2026: sớm hơn ngày khởi công 31/07/2026 2 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 12 | Cảnh báo | ngay-nghi-ngo | Ngày 18/05/2026: sớm hơn ngày khởi công 31/07/2026 2 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 13 | Cảnh báo | ngay-nghi-ngo | Ngày 18/05/2026: sớm hơn ngày khởi công 31/07/2026 2 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 14 | Cảnh báo | ngay-nghi-ngo | Ngày 29/05/2026: sớm hơn ngày khởi công 31/07/2026 2 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 15 | Cảnh báo | ngay-nghi-ngo | Ngày 29/05/2026: sớm hơn ngày khởi công 31/07/2026 2 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 40 | Cảnh báo | ngay-nghi-ngo | Ngày 15/05/2026: sớm hơn ngày khởi công 31/07/2026 3 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 41 | Cảnh báo | ngay-nghi-ngo | Ngày 22/05/2026: sớm hơn ngày khởi công 31/07/2026 2 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 42 | Cảnh báo | ngay-nghi-ngo | Ngày 22/05/2026: sớm hơn ngày khởi công 31/07/2026 2 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 53 | Cảnh báo | ngay-nghi-ngo | Ngày 23/05/2026: sớm hơn ngày khởi công 31/07/2026 2 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 54 | Cảnh báo | ngay-nghi-ngo | Ngày 23/05/2026: sớm hơn ngày khởi công 31/07/2026 2 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 55 | Cảnh báo | ngay-nghi-ngo | Ngày 23/05/2026: sớm hơn ngày khởi công 31/07/2026 2 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 56 | Cảnh báo | ngay-nghi-ngo | Ngày 25/05/2026: sớm hơn ngày khởi công 31/07/2026 2 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 57 | Cảnh báo | ngay-nghi-ngo | Ngày 25/05/2026: sớm hơn ngày khởi công 31/07/2026 2 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 58 | Cảnh báo | ngay-nghi-ngo | Ngày 22/04/2026: sớm hơn ngày khởi công 31/07/2026 3 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 59 | Cảnh báo | ngay-nghi-ngo | Ngày 30/05/2026: sớm hơn ngày khởi công 31/07/2026 2 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 60 | Cảnh báo | ngay-nghi-ngo | Ngày 14/05/2026: sớm hơn ngày khởi công 31/07/2026 3 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 61 | Cảnh báo | ngay-nghi-ngo | Ngày 28/05/2026: sớm hơn ngày khởi công 31/07/2026 2 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 88 | Cảnh báo | ngay-nghi-ngo | Ngày 14/05/2026: sớm hơn ngày khởi công 31/07/2026 3 tháng — giữ nguyên |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 106 | Suy ra | loai-cp-suy-ra | Loại CP trống → Nhân công (hạng mục "Nhân công điện nước" là nhân công) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 107 | Suy ra | loai-cp-suy-ra | Loại CP trống → Nhân công (hạng mục "Nhân công điện nước" là nhân công) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 108 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư DNUOC-VUTHANH) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 109 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư DNUOC-VUTHANH) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 110 | Suy ra | loai-cp-suy-ra | Loại CP trống → Nhân công (hạng mục "Nhân công thợ nề" là nhân công) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 111 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư BT-M250R7) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 112 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư BT-PHUGIAR7) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 113 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư BT-BOMDUN) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 114 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-XIMANGHOAN) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 115 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-CATTO) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 116 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-CATTO) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 117 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-CATTO) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 118 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-XERAC) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 119 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-CATTO) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 120 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-GACHONG) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 121 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-GACHONG) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 122 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-CATXAY) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 123 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-XIMANGPROHOAN) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 124 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-CATXAY) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 125 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-CATTO) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 126 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-XERAC) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 127 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-DA12) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 128 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư VL-CATXAY) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 129 | Suy ra | loai-cp-suy-ra | Loại CP trống → Nhân công (hạng mục "Nhân công thợ nề" là nhân công) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 130 | Suy ra | loai-cp-suy-ra | Loại CP trống → Nhân công (hạng mục "Nhân công điện nước" là nhân công) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 131 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư DNUOC-VUTHANH) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 132 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư DNUOC-VUTHANH) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 133 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư DNUOC-VUTHANH) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 134 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư DNUOC-VUTHANH) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 135 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư DNUOC-VUTHANH) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 136 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư DNUOC-VUTHANH) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 137 | Suy ra | loai-cp-suy-ra | Loại CP trống → Vật tư (có mã vật tư DNUOC-THANGMAY) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | NHATKYCHUNG | 138 | Bỏ qua | khong-co-so-tien | Không có số tiền (Thành tiền trống, thiếu SL/ĐG) → không nhập (ô Thành tiền là công thức trả về rỗng) [Vật tư điện nước] |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 2 | Sửa | so-phieu-gia | Số phiếu giả "PC00../08" → để trống (giữ mã gốc trong Ghi chú) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 2 | Suy ra | thieu-noi-dung | Lý do/Nội dung trống → ghi "c Dung chi" |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 2 | Cảnh báo | nhom-thu-chi-trong | Nhóm thu chi trống — để trống (phần mềm không có trường này) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 3 | Sửa | so-phieu-gia | Số phiếu giả "PC00../08" → để trống (giữ mã gốc trong Ghi chú) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 3 | Suy ra | thieu-noi-dung | Lý do/Nội dung trống → ghi "c Dung chi" |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 3 | Cảnh báo | nhom-thu-chi-trong | Nhóm thu chi trống — để trống (phần mềm không có trường này) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 4 | Sửa | so-phieu-gia | Số phiếu giả "PC00../08" → để trống (giữ mã gốc trong Ghi chú) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 4 | Suy ra | thieu-noi-dung | Lý do/Nội dung trống → ghi "c Dung chi" |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 4 | Cảnh báo | nhom-thu-chi-trong | Nhóm thu chi trống — để trống (phần mềm không có trường này) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 5 | Sửa | so-phieu-gia | Số phiếu giả "PC00../08" → để trống (giữ mã gốc trong Ghi chú) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 5 | Suy ra | thieu-noi-dung | Lý do/Nội dung trống → ghi "c Dung chi" |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 5 | Cảnh báo | nhom-thu-chi-trong | Nhóm thu chi trống — để trống (phần mềm không có trường này) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 6 | Sửa | so-phieu-gia | Số phiếu giả "PC00../08" → để trống (giữ mã gốc trong Ghi chú) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 6 | Suy ra | thieu-noi-dung | Lý do/Nội dung trống → ghi "c Dung chi" |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 6 | Cảnh báo | nhom-thu-chi-trong | Nhóm thu chi trống — để trống (phần mềm không có trường này) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 7 | Sửa | so-phieu-gia | Số phiếu giả "PC00../08" → để trống (giữ mã gốc trong Ghi chú) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 7 | Suy ra | thieu-noi-dung | Lý do/Nội dung trống → ghi "c Dung chi" |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 7 | Cảnh báo | nhom-thu-chi-trong | Nhóm thu chi trống — để trống (phần mềm không có trường này) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 8 | Sửa | so-phieu-gia | Số phiếu giả "PC00../08" → để trống (giữ mã gốc trong Ghi chú) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 8 | Suy ra | thieu-noi-dung | Lý do/Nội dung trống → ghi "c Dung chi" |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 8 | Cảnh báo | nhom-thu-chi-trong | Nhóm thu chi trống — để trống (phần mềm không có trường này) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 9 | Sửa | so-phieu-gia | Số phiếu giả "PC00../08" → để trống (giữ mã gốc trong Ghi chú) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 9 | Suy ra | thieu-noi-dung | Lý do/Nội dung trống → ghi "c Dung chi" |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 9 | Cảnh báo | nhom-thu-chi-trong | Nhóm thu chi trống — để trống (phần mềm không có trường này) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 10 | Sửa | so-phieu-gia | Số phiếu giả "PC00../08" → để trống (giữ mã gốc trong Ghi chú) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 10 | Suy ra | thieu-noi-dung | Lý do/Nội dung trống → ghi "c Dung chi" |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 10 | Cảnh báo | nhom-thu-chi-trong | Nhóm thu chi trống — để trống (phần mềm không có trường này) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 11 | Sửa | so-phieu-gia | Số phiếu giả "PC00../08" → để trống (giữ mã gốc trong Ghi chú) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 11 | Suy ra | thieu-noi-dung | Lý do/Nội dung trống → ghi "c Dung chi" |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 11 | Cảnh báo | nhom-thu-chi-trong | Nhóm thu chi trống — để trống (phần mềm không có trường này) |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 12 | Bỏ qua | so-quy-da-co | Khoản chi 100.000.000 ngày 11/09/2026 ĐÃ CÓ trong sổ thu chi (#92 11/09/2026 PC014/09 DATT111 NCC_Hau 100.000.000 "Chi a Hậu thầu 111 Thanh thủy (tổng ứng 400tr)") → không nhập lại để khỏi trừ tiền hai lần |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 13 | Bỏ qua | so-quy-da-co | Khoản chi 5.000.000 ngày 11/09/2026 ĐÃ CÓ trong sổ thu chi (#91 11/09/2026 PC013/09 DATT111 — 5.000.000 "Chi a Quân điện nước 111 Thanh thủy (tổng ứng 20tr") → không nhập lại để khỏi trừ tiền hai lần |
| Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm | SO_QUY | 14 | Bỏ qua | so-quy-da-co | Khoản chi 24.374.000 ngày 19/09/2026 ĐÃ CÓ trong sổ thu chi (#107 19/09/2026 PC027/09 DATT111 NCC_VUTHANH 24.374.000 "Điện nước Vũ Thanh 111 Thanh Thủy") → không nhập lại để khỏi trừ tiền hai lần |

### 6. Dòng chỉ có ở bản cũ (đang có trong phần mềm, không có trong file mới)

(không có)

### 7. Sheet ghi chú / rác (không nhập) và ô ngoài bảng

- `ChiPhi_CongTrinh_10PQA.xlsm` / sheet `TBVS gửi kho`: (trống)
- `ChiPhi_CongTrinh_10PQA.xlsm` / sheet `31.8`: (trống)
- `ChiPhi_CongTrinh_NDC_7lo.xlsm` / sheet `Sheet2`: Q27=(=2500000/34 → 73529.4117647059)
- `ChiPhi_CongTrinh_NDC_7lo.xlsm` / sheet `TBVS`: (trống)
- `ChiPhi_CongTrinh_NDC_7lo.xlsm` / sheet `30.9`: (trống)
- `ChiPhi_CongTrinh_NDC_7lo.xlsm` / sheet `31.8`: (trống)
- `ChiPhi_CongTrinh_NDC_7lo.xlsm` / sheet `thanh toán`: E4=TỔNG HỢP THANH TOÁN 11/9/2026 · F4=TỔNG HỢP THANH TOÁN 11/9/2026 · K4=trung thầu 34 · E5=trung thầu · F5=150000000 · K5=vương thầu 910 · E6=hậu thầu · F6=100000000 · K6=tài lô 5 · E7=quân điện nước · F7=5000000 · K7=hiển78 · E8=vinacoonex 25 · F8=31350000 · E9=TÔng · F9=(=SUM(F5:F8) → 286350000)
- `ChiPhi_CongTrinh_NDC_7lo.xlsm` / DM_CONGTRINH: Ô ghi chú ngoài bảng: I2: ứng đợt 1 | J2: 0.3 | K2: 305600000 | I3: ứng đợt 2 | J3: (công thức =J2, giá trị lưu sẵn 0.3) | K3: 305600000 | I4: tổng đã ứng 2 đợt  | J4: 0.6 | K4: (công thức =K3+K2, giá trị lưu sẵn 611200000)
- `ChiPhi_CongTrinh_NDC_7lo.xlsm` / DM_VATTU: Dòng "TỔNG" ở DM_VATTU dòng 327 là dòng tổng, không phải vật tư — bỏ qua
- `ChiPhi_CongTrinh_NDC7T.xlsm` / sheet `TBVS gửi kho`: (trống)
- `ChiPhi_CongTrinh_nha Cô Hạnh.xlsm` / sheet `TBVS`: (trống)
- `ChiPhi_CongTrinh_nha Cô Hạnh.xlsm` / sheet `30.9`: (trống)
- `ChiPhi_CongTrinh_nha Cô Hạnh.xlsm` / sheet `31.8`: (trống)
- `Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm` / sheet `TBVS`: (trống)
- `Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm` / sheet `31.8`: (trống)
- `Copy of ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm` / DM_VATTU: Dòng "TỔNG" ở DM_VATTU dòng 316 là dòng tổng, không phải vật tư — bỏ qua
