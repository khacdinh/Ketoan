# Đối chiếu phần mềm với file ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm

Ngày đối chiếu: 30/09/2026. Cách làm: nhập file mẫu vào một bộ dữ liệu trống (kèm SO_QUY để có số đã trả), so với:

- **(A)** số do chính Microsoft Excel tính lại (mở bản sao file, tắt macro, CalculateFull);
- **(B)** số đang lưu sẵn trong file (lần tính cuối trước khi file bị sửa);
- **(C)** cộng thẳng Số lượng × Đơn giá từ các ô dữ liệu của NHATKYCHUNG, theo đúng điều kiện SUMIFS của file;
- **(D)** phần mềm.

## Tổng hợp

| Chỉ tiêu | Excel tính lại (A) | Số lưu sẵn trong file (B) | Cộng thẳng từ NHATKYCHUNG (C) | Phần mềm (D) | A = C = D |
|---|---:|---:|---:|---:|---|
| TỔNG CHI PHÍ | 1.129.929.000 | 1.271.799.000 | 1.129.929.000 | 1.129.929.000 | Khớp |
| Vật tư | 763.957.000 | 843.627.000 | 763.957.000 | 763.957.000 | Khớp |
| Nhân công | 250.000.000 | 310.600.000 | 250.000.000 | 250.000.000 | Khớp |
| Dịch vụ - Phí | 115.972.000 | 117.572.000 | 115.972.000 | 115.972.000 | Khớp |
| Đã trả nhà cung cấp | 1.230.569.000 | 1.230.569.000 | 1.230.569.000 | 1.230.569.000 | Khớp |
| Số dòng chi phí | 103 (công thức COUNTA−1 của file bị hụt 1) | 125 | 104 | 104 | |
| Nhóm: 1. Chi phí ban đầu | 550.000 | 550.000 | 550.000 | 550.000 | Khớp |
| Nhóm: 2. Chi phí phần thô | 1.021.250.000 | 1.075.770.000 | 1.021.250.000 | 1.021.250.000 | Khớp |
| Nhóm: 3. Hệ thống điện nước | 17.303.000 | 27.303.000 | 17.303.000 | 17.303.000 | Khớp |
| Nhóm: 4. Hoàn thiện | 49.426.000 | 49.426.000 | 49.426.000 | 49.426.000 | Khớp |
| Nhóm: 6. Chi phí khác | 41.400.000 | 41.400.000 | 41.400.000 | 41.400.000 | Khớp |
| Hạng mục: Hồ sơ pháp lý | 550.000 | 550.000 | 550.000 | 550.000 | Khớp |
| Hạng mục: Bê tông | 216.305.000 | 241.645.000 | 216.305.000 | 216.305.000 | Khớp |
| Hạng mục: Sắt thép xây dựng | 298.313.000 | 298.313.000 | 298.313.000 | 298.313.000 | Khớp |
| Hạng mục: Vật tư VLXD | 182.610.000 | 232.910.000 | 182.610.000 | 182.610.000 | Khớp |
| Hạng mục: Chi phí chung CT | 74.022.000 | 74.022.000 | 74.022.000 | 74.022.000 | Khớp |
| Hạng mục: Nhân công thợ nề | 250.000.000 | 300.000.000 | 250.000.000 | 250.000.000 | Khớp |
| Hạng mục: Vật tư điện nước | 17.303.000 | 23.533.000 | 17.303.000 | 17.303.000 | Khớp |
| Hạng mục: Thiết bị vệ sinh | 49.426.000 | 49.426.000 | 49.426.000 | 49.426.000 | Khớp |
| Hạng mục: Chi phí quản lý (giám sát, VP) | 41.400.000 | 41.400.000 | 41.400.000 | 41.400.000 | Khớp |

## Công nợ NCC

| Mã NCC | Chi phí phát sinh (Excel / PM) | Đã trả (Excel / PM) | Còn lại (Excel / PM) | Tình trạng (Excel / PM) | Khớp |
|---|---:|---:|---:|---|---|
| NCC_HoaLan | 1.400.000 / 1.400.000 | 1.400.000 / 1.400.000 | 0 / 0 | Đã tất toán / Đã tất toán | Khớp |
| NCC_Khac | 41.600.000 / 41.600.000 | 1.600.000 / 1.600.000 | 40.000.000 / 40.000.000 | Còn nợ / Còn nợ | Khớp |
| NCC_VuongThinh | 182.610.000 / 182.610.000 | 232.910.000 / 232.910.000 | -50.300.000 / -50.300.000 | ỨNG DƯ / Ứng dư | Khớp |
| NCC_SongHan | 216.305.000 / 216.305.000 | 241.645.000 / 241.645.000 | -25.340.000 / -25.340.000 | ỨNG DƯ / Ứng dư | Khớp |
| NCC_NhatQuang | 49.426.000 / 49.426.000 | 49.426.000 / 49.426.000 | 0 / 0 | Đã tất toán / Đã tất toán | Khớp |
| NCC_VUTHANH | 17.303.000 / 17.303.000 | 17.303.000 / 17.303.000 | 0 / 0 | Đã tất toán / Đã tất toán | Khớp |
| NCC_Quân | 0 / 0 | 15.000.000 / 15.000.000 | -15.000.000 / -15.000.000 | ỨNG DƯ / Ứng dư | Khớp |
| NCC_Tai | 63.900.000 / 63.900.000 | 63.900.000 / 63.900.000 | 0 / 0 | Đã tất toán / Đã tất toán | Khớp |
| NCC_Hau | 259.072.000 / 259.072.000 | 309.072.000 / 309.072.000 | -50.000.000 / -50.000.000 | ỨNG DƯ / Ứng dư | Khớp |
| NCC_CUCHANH | 298.313.000 / 298.313.000 | 298.313.000 / 298.313.000 | 0 / 0 | Đã tất toán / Đã tất toán | Khớp |
| **Tổng** | 1.129.929.000 / 1.129.929.000 | 1.230.569.000 / 1.230.569.000 | -100.640.000 / -100.640.000 | | |

KẾT LUẬN: TẤT CẢ KHỚP

## Vì sao số lưu sẵn (B) khác

File đang lưu số của một lần tính cũ. So với sheet CHI_TIET_THEO_NHOM (do macro CapNhatChiTiet dựng lần trước), NHATKYCHUNG hiện **thiếu 22 dòng tháng 8/2026, tổng 141.870.000 đ**:

```
2026-08-15 | Bê tông | BT-PHUGIAR7 |  | Sông Hàn | 12 | 60000 | 720000
2026-08-15 | Bê tông | BT-BOMDUN |  | Sông Hàn | 1 | 3500000 | 3500000
2026-08-04 | Vật tư VLXD | VL-XIMANGHOAN |  | Vương Thịnh | 4 | 1870000 | 7480000
2026-08-04 | Vật tư VLXD | VL-CATTO |  | Vương Thịnh | 2.5 | 580000 | 1450000
2026-08-04 | Vật tư VLXD | VL-CATTO |  | Vương Thịnh | 2.5 | 580000 | 1450000
2026-08-04 | Vật tư VLXD | VL-CATTO |  | Vương Thịnh | 2.5 | 580000 | 1450000
2026-08-11 | Vật tư VLXD | VL-XERAC |  | Vương Thịnh | 1 | 800000 | 800000
2026-08-13 | Vật tư VLXD | VL-CATTO |  | Vương Thịnh | 3 | 580000 | 1740000
2026-08-15 | Vật tư VLXD | VL-GACHONG |  | Vương Thịnh | 8000 | 2300 | 18400000
2026-08-15 | Vật tư VLXD | VL-GACHONG | bồi dưỡng phu dời gạch | Vương Thịnh | 1 | 600000 | 600000
2026-08-20 | Vật tư VLXD | VL-CATXAY |  | Vương Thịnh | 2.5 | 580000 | 1450000
2026-08-22 | Vật tư VLXD | VL-XIMANGHOAN |  | Vương Thịnh | 4 | 1870000 | 7480000
2026-08-22 | Vật tư VLXD | VL-CATXAY |  | Vương Thịnh | 3 | 580000 | 1740000
2026-08-27 | Vật tư VLXD | VL-CATXAY |  | Vương Thịnh | 3 | 580000 | 1740000
2026-08-28 | Vật tư VLXD | VL-XERAC | xe lớn | Vương Thịnh | 1 | 800000 | 800000
2026-08-31 | Vật tư VLXD | VL-DA12 |  | Vương Thịnh | 3 | 660000 | 1980000
2026-08-31 | Vật tư VLXD | VL-CATXAY |  | Vương Thịnh | 3 | 580000 | 1740000
2026-08-31 | Nhân công điện nước | DIENNUOCNC | Nhân công điện nước | Quân điện nước | 1 | 10000000 | 10000000
2026-08-15 | Bê tông | BT-M250R7 |  |  | 12 | 1760000 | 21120000
2026-08-20 | Nhân công thợ nề | NỀ-CONGNE |  | Hậu thầu | 1 | 50000000 | 50000000
2026-08-31 | Vật tư điện nước | DNUOC-VUTHANH |  | Vũ Thanh | 1 | 2018000 | 2018000
2026-08-31 | Vật tư điện nước | DNUOC-VUTHANH |  | Vũ Thanh | 1 | 4212000 | 4212000
Tổng 22 dòng = 141870000
```

22 dòng này đã được tách ra file `DongThieu_NHATKYCHUNG_Thang8.xlsx` (cùng thư mục). Dòng Bê tông M250R7 ngày 15/08 (21.120.000 đ) không ghi NCC trong CHI_TIET; đã điền NCC_SongHan vì số công nợ lưu sẵn cũ của Sông Hàn (241.645.000 đ) chỉ khớp khi có dòng này — cần kiểm tra lại. Loại CP của 2 dòng xe rác (Dịch vụ-Phí) và dòng bồi dưỡng phu dời gạch (Nhân công) lấy theo số lưu sẵn cũ.

Khi nhập thêm file đó (chế độ Gộp thêm), phần mềm cho đúng các số lưu sẵn (B):

```
tong 1271799000 {"Vật tư":843627000,"Nhân công":310600000,"Dịch vụ-Phí":117572000} so dong 126
   Hồ sơ pháp lý 550000
   Bê tông 241645000
   Sắt thép xây dựng 298313000
   Vật tư VLXD 232910000
   Chi phí chung CT 74022000
   Nhân công thợ nề 300000000
   Vật tư điện nước 23533000
   Nhân công điện nước 10000000
   Thiết bị vệ sinh 49426000
   Chi phí quản lý (giám sát, VP) 41400000

```

Công nợ NCC khi đó cũng khớp CONGNO_NCC lưu sẵn: chỉ còn NCC_Khac còn nợ 40.000.000, NCC_VUTHANH còn nợ 6.230.000, NCC_Quân ứng dư 5.000.000; các NCC khác đã tất toán.

## File Excel xuất từ phần mềm

File xuất (TONGHOP, NHATKYCHUNG, CHI_TIET_THEO_NHOM, CONGNO_NCC, SO_QUY, GIA_VATTU, DM_*) được mở bằng Excel, tính lại toàn bộ công thức: tổng chi phí, từng loại CP, từng nhóm, đã trả, còn nợ, công nợ từng NCC trùng với phần mềm; không có ô lỗi. Nhập lại chính file xuất vào dữ liệu trống cho lại đúng 104 dòng, 56 phiếu, cùng tổng và công nợ.
