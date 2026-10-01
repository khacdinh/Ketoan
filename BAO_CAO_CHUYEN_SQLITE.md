# Báo cáo chuyển lưu trữ JSON → SQLite

Nhánh: **`feature/chuyen-sqlite`**, tách từ **`feature/truy-vet-chinh-xac`** (BRANCH_GOC). Thiết kế chi tiết: `docs/THIET_KE_SQLITE.md`.
Phạm vi: chỉ đổi cách lưu. Không thêm tính năng nghiệp vụ, không đổi cách tính; giao diện chỉ đổi ở khung sao lưu / khôi phục (bắt buộc
phải đổi vì file sao lưu nay là `.db`).

## 1. Kết quả chính

| Hạng mục | Kết quả |
|---|---|
| Đối chiếu dữ liệu thật (`data/ketoan.json`, bản sao) với bản JSON gốc | **75/75 khớp**: toàn bộ bản ghi, 12 nhóm số liệu báo cáo, thùng rác, từng ô của 10 file Excel; ở 3 thời điểm: mở dữ liệu, sau chuỗi thao tác ghi, sau khi tắt và mở lại |
| Đối chiếu bộ mẫu v1 (schema 1) + v2 (dữ liệu thật) | **148/148 khớp** |
| Tồn quỹ | 943.000 đ trước = 943.000 đ sau (tổng thu 2.532.577.035, tổng chi 2.531.634.035) |
| Chi phí công trình | 1.129.929.000 đ trước = sau |
| Kiểm thử trước khi đổi (bản JSON) | 127 ca: 125 đạt, 1 lỗi (G1, xuất Excel 10,2 giây > ngưỡng, do máy chậm), 1 bỏ qua (A3) |
| Kiểm thử sau khi đổi (bản SQLite) | 155 ca (thêm 28 ca mới); xem mục 7 |
| Thao tác tương tác với 20.000 dòng chi phí + 20.000 dòng sổ | 0,05–0,41 giây (ngưỡng 2 giây), nhanh bằng hoặc hơn bản JSON |

## 2. Lược đồ cuối cùng

SQLite qua `node:sqlite` (`DatabaseSync`), file `data/ketoan.db`, `PRAGMA user_version = 4`. Mọi bảng `STRICT`, tên cột = tên trường JS.
Mỗi bảng bản ghi có thêm `vt` (vị trí trong danh sách) và `khac` (JSON, giữ những gì không vừa cột).

| Bảng | Khóa | Cột (kiểu) | Chỉ mục |
|---|---|---|---|
| `meta` | `khoa` | `giaTri` (JSON): `settings`, `nextId`, `updatedAt`, `khacGoc`, `ungDung`, `taoLuc`, `chuyenTu` | — |
| `projects` | `id` | ma, ten, nganSach (INT), trangThai, ghiChu, ngayKhoiCong, diaChi | ma |
| `suppliers` | `id` | ma, ten, loai, sdt, diaChi, ghiChu | ma |
| `entries` | `id` | seq (INT), ngay, soPhieu, maDuAn, maNCC, noiDung, thu (INT), chi (INT), nguoiNhan, ghiChu, trangThai, createdAt, updatedAt | (ngay, seq), maDuAn, maNCC, soPhieu |
| `costGroups` | `id` | ma, ten, ghiChu | ma |
| `costItems` | `id` | ma, ten, maNhom, ghiChu | ma, maNhom |
| `materials` | `id` | ma, ten, dvt, maHM, loaiCP, ghiChu | ma, maHM |
| `houses` | `id` | ma, ten, maCT, dienTich (ANY), chuNha, chung (0/1), ghiChu | ma, maCT |
| `costs` | `id` | seq, phieuId (INT), ngay, maCT, maNha, maHM, loaiCP, maVT, dienGiai, soLuong (REAL), donGia (REAL), thanhTien (INT), maNCC, soPhieu, ghiChu, nguon, trangThai, createdAt, updatedAt | (ngay, seq), maCT, maNCC, maHM, maVT, maNha, phieuId, soPhieu |
| `vouchers` | `so` | ngay, nguoiNhan, diaChi, lyDo, hinhThuc, kemTheo | — |
| `locks` | `thang` | at, by | — |
| `ignoredWarnings` | `khoa` | at, by, label, note | — |
| `cashCounts` | `id` | ngay, thucTe (INT), tonSo (INT), menhGia (JSON), nguoiKiem, ghiChu, createdAt, by | ngay |
| `attachments` | `id` | owner, ownerId (INT), name, file, size (INT), type, sha256, createdAt, by | (owner, ownerId) |
| `trash` | `id` | at, by, kind, label, group, phieuId, records (JSON), attachments (JSON) | kind |

Thiết lập: `journal_mode = DELETE`, `synchronous = FULL`, `foreign_keys = ON`, `busy_timeout = 5000`.

## 3. Quyết định và lý do

1. **Giữ mô hình dữ liệu trong bộ nhớ, SQLite làm nơi lưu.** Khoảng 60 chỗ trong mã nghiệp vụ sửa `store.db` rồi gọi `store.save()`.
   Giữ nguyên hợp đồng đó nên không phải sửa dòng logic nghiệp vụ nào, và mọi phép tính vẫn ở `shared.js`, do đó số liệu giống hệt.
   `save()` so từng bản ghi với ảnh chụp lần ghi trước và chỉ ghi các dòng thay đổi, trong **một giao dịch**.
2. **Ghi lỗi thì bộ nhớ trở về trạng thái đã lưu** (dựng từ ảnh chụp, không cần đọc đĩa). Bản JSON cũ giữ thay đổi chưa lưu trong bộ
   nhớ. Ca S2.6 phát hiện rằng nạp lại từ đĩa khi file đang bị khóa cũng thất bại, nên phải dùng ảnh chụp.
3. **Không đặt khóa ngoại trên mã.** Ứng dụng so mã không phân biệt hoa thường (`keyOf`), coi `''` là "không có", và cố ý chấp nhận mã lạ
   (màn "Cần xử lý" báo "mã lạ"). Khóa ngoại của SQLite so khớp chính xác từng ký tự nên sẽ từ chối dữ liệu hợp lệ về nghiệp vụ. Quan hệ
   theo id duy nhất (`attachments.ownerId`) lại là đa hình. Toàn vẹn do API bảo đảm như trước; mồ côi được liệt kê trong báo cáo chuyển đổi.
   `PRAGMA foreign_keys = ON` vẫn bật (yêu cầu), cho các khóa ngoại về sau.
4. **Không đặt UNIQUE trên `ma`.** Dữ liệu bất thường có mã trùng vẫn phải nạp được nguyên trạng (đổi mã sẽ làm lệch tổng hợp theo mã).
   Tính duy nhất của mã do API kiểm tra (kể cả khác hoa thường). UNIQUE có ở khóa `id` từng bảng, `vouchers.so`, `locks.thang`,
   `ignoredWarnings.khoa`, `meta.khoa`.
5. **Tiền là INTEGER đồng; số lượng và đơn giá là REAL.** REAL của SQLite là số thực IEEE-754 8 byte, trùng khít kiểu `number` của JS,
   nên ghi rồi đọc ra đúng từng bit (`0.1+0.2` đọc lại vẫn bằng `0.1+0.2`). SQLite không làm phép tính nào; quy tắc làm tròn sẵn có
   (SL 4 số lẻ, ĐG 0,01, thành tiền nguyên) vẫn ở `shared.js`. Phương án số nguyên ×10.000 bị loại vì phải làm tròn lúc ghi, làm đổi
   giá trị nhập từ Excel không đúng 4 số lẻ.
6. **Cột `khac` giữ dữ liệu bất thường nguyên trạng**: tiền dạng chuỗi, tiền có số lẻ, `null`, trường lạ, mã kiểu số, chuỗi có ký tự NUL.
   Cột `vt` giữ đúng thứ tự mảng (đánh số cách quãng 1024, chèn giữa không phải đánh số lại cả bảng).
7. **Ký tự NUL**: đã kiểm chứng `node:sqlite` trên Node 22.22.2 cắt chuỗi `'ab\0cd'` thành `'ab'`. Ngoài việc yêu cầu Node
   ≥ 24.16.0 / ≥ 26.1.0, chuỗi có NUL luôn được ghi vào cột JSON (`\u0000`) nên an toàn trên mọi phiên bản.
8. **Không dùng WAL.** Phần mềm một người dùng, một tiến trình, lần ghi ngắn. WAL sinh thêm `-wal`/`-shm`; người dùng chép thư mục `data`
   sang máy khác hoặc OneDrive có thể bỏ sót phần nằm trong `-wal` và mất dữ liệu. Với chế độ DELETE, lúc không ghi chỉ có một file.
9. **Chuyển đổi thất bại thì dừng, không chạy tiếp bằng JSON.** Chạy song song hai cơ chế lưu dễ làm dữ liệu nằm lẫn hai nơi. Khi dừng,
   file gốc còn nguyên, thông báo rõ ràng và có báo cáo.
10. **Phát hiện chương trình khác ghi chen** (`PRAGMA data_version`): lần lưu đó bị từ chối (409) và màn hình nạp lại dữ liệu mới, thay
    vì ghi đè. Trong tình huống này bản JSON cũ ghi đè cả file.
11. Nhật ký `nhat-ky.jsonl` và thư mục chứng từ **giữ nguyên** (không thuộc phạm vi). Nhật ký vốn chỉ ghi nối thêm và phải sống sót qua
    các lần khôi phục.

## 4. Tệp thay đổi

| Tệp | Thay đổi |
|---|---|
| `lib/db.js` (mới) | Lược đồ, mã hóa bản ghi ↔ dòng, ghi phần thay đổi, đọc toàn bộ, kiểm tra file `.db`, `VACUUM INTO`, dựng lại từ ảnh chụp |
| `lib/store.js` | Viết lại trên SQLite, giữ mọi hàm công khai; chuyển đổi từ JSON; khôi phục khi `.db` hỏng; sao lưu `.db`; `exportJson`, `snapshotBuffer`, `readDbBuffer`, `close` |
| `lib/migrate.js` (mới) | Phân tích dữ liệu bất thường, số liệu đối chiếu, nội dung `migrate-bao-cao.txt` |
| `lib/node-version.js` (mới) | Quy tắc Node ≥ 24.16.0 / ≥ 26.1.0 (viết kiểu cũ để chạy được trên Node cũ và báo lỗi rõ) |
| `server.js` | Kiểm tra phiên bản Node; `/api/backup` trả `.db`; thêm `/api/backup-json`; `.zip` chứa cả `.db` và `.json`; khôi phục nhận `.db`; đóng file khi tắt |
| `public/js/views/settings.js` | Nhãn nút `.db`, nút "Xuất dữ liệu ra file .json", chọn file `.db` để khôi phục, danh sách sao lưu nhận `.db` |
| `KhoiDong.bat`, `package.json`, `package-lock.json` | Kiểm tra Node mới, hướng dẫn cài bằng tiếng Việt; `engines.node` |
| `HUONG_DAN_SU_DUNG.md`, `CHANGELOG.md`, `CLAUDE.md`, `docs/THIET_KE_SQLITE.md`, `.gitignore` | Tài liệu; bỏ qua file dữ liệu SQLite sinh ra |
| `tests/…` | Sửa 6 file ca cũ đọc `ketoan.json` sang đọc `ketoan.db`; thêm `doi-chieu-sqlite.js` và `s1…s5-*.test.js` |

## 5. Bảng đối chiếu trước / sau (dữ liệu thật)

Theo `data/migrate-bao-cao.txt` khi chuyển bản sao `data/ketoan.json` (schema 2):

| Chỉ tiêu | JSON | SQLite | |
|---|---|---|---|
| Dự án / NCC / dòng sổ / nhóm CP / hạng mục / vật tư / nhà / dòng chi phí | 15 / 62 / 66 / 6 / 37 / 317 / 1 / 104 | 15 / 62 / 66 / 6 / 37 / 317 / 1 / 104 | khớp |
| Tổng thu | 2.532.577.035 | 2.532.577.035 | khớp |
| Tổng chi | 2.531.634.035 | 2.531.634.035 | khớp |
| Tồn quỹ | 943.000 | 943.000 | khớp |
| Tổng chi phí công trình | 1.129.929.000 | 1.129.929.000 | khớp |
| Theo 15 dự án + "không dự án" (thu, chi, số dòng) | 16 mục | 16 mục | khớp |
| Theo 62 NCC + "không NCC" | 63 mục | 63 mục | khớp |
| Chi phí theo công trình / theo NCC, công nợ NCC | 1 / 9 / 22 mục | 1 / 9 / 22 mục | khớp |
| Bộ đếm id | 609 | 609 | khớp |
| So sánh toàn bộ bản ghi (mọi trường, thứ tự) | | | khớp |

Công cụ `tests/doi-chieu-sqlite.js` chạy **bản JSON gốc và bản SQLite song song** trên cùng dữ liệu, so ở ba thời điểm: lúc mở dữ liệu;
sau cùng một chuỗi thao tác (thêm / sửa / xóa / khôi phục dòng, phiếu nhập 2 dòng có số lẻ, dự án mới, nháp, ghi sổ nháp, kiểm quỹ, thông
tin in phiếu, bỏ qua cảnh báo, khóa sổ); và sau khi tắt rồi mở lại. Mỗi thời điểm so: toàn bộ dữ liệu, 12 nhóm số liệu báo cáo (tồn quỹ,
sổ, lọc sổ, dự án, NCC, phiếu, chi phí, công nợ NCC, công nợ công trình, giá vật tư, phiếu nhập), thùng rác, và **từng ô** (giá trị + công
thức) cùng biểu đồ của 10 file Excel (toàn bộ sổ sách, sổ thu chi, sổ lọc, dự án, NCC, chi phí công trình, sổ chi phí, công nợ NCC, phiếu,
chi phí một công trình; thêm biên bản kiểm quỹ ở thời điểm sau). Ví dụ "Chi phí công trình" 9.274 ô và "Toàn bộ sổ sách" 2.474 ô đều khớp.
Tồn quỹ sau chuỗi thao tác: 1.570.001 ở cả hai bản.

## 6. Dữ liệu bất thường và cách xử lý

- **Dữ liệu thật**: không có dữ liệu bất thường. Không mồ côi, không trùng mã / id / seq, tiền đều nguyên, ngày đều ISO, không có NUL.
  Chỉ có hai việc nâng cấp như bản trước vẫn làm: schema 2 → 4, và bỏ khóa `budgets` (rỗng).
- **Đề bài ghi 43 NCC; file thật có 62 NCC** (25 NCC có phát sinh). 43 là số NCC của bản gốc schema 1 (`ketoan-v1-goc.json`).
- Dữ liệu bất thường cài sẵn (ca S1.4) đều nạp **nguyên trạng** và được liệt kê trong báo cáo: mồ côi, tiền `"1.500.000"`, tiền
  `12345.5`, NUL, Unicode tổ hợp / emoji, `null`, trường lạ, thiếu trường mã, mã kiểu số, ngày `30/09/2026`, mã trùng khác hoa thường,
  số lượng `"2,5"`, `0.1+0.2`, `vouchers` không phải đối tượng, khóa lạ cấp cao, `nextId` sai.
- Chuẩn hóa nhẹ duy nhất mới thêm: **id trùng trong cùng danh sách** thì bản sau được cấp id mới (bắt buộc vì id là khóa chính), có ghi log.
  Các chuẩn hóa khác giữ y như bản JSON (`normalize()`): bổ sung id / seq thiếu, `nextId`, danh mục mặc định cho dữ liệu bản 1, trường dự
  án thiếu, bỏ mục thùng rác / kiểm quỹ / chứng từ / khóa sổ sai hình dạng.
- **Từ chối không chuyển** (dừng, giữ nguyên file) khi `ketoan.json` sai cấu trúc, ví dụ `entries` không phải danh sách. Bản cũ trong
  trường hợp này sẽ âm thầm coi là rỗng.

## 7. Kiểm thử

### 7.1 Ca cũ (chạy lại trên bản SQLite)
Toàn bộ 127 ca cũ chạy lại trên SQLite. 6 file ca cũ đọc trực tiếp `ketoan.json` nên được sửa sang đọc `ketoan.db` mà giữ nguyên mục đích:
B1, B2, B3.1, B3.4, B3.5 (khóa file Windows: nay kiểm tra đường chép dự phòng khi chuyển đổi và sao lưu), B4, C4, G1, H1.2, H4.3, N1.1,
N1.5, N7.1. Tên bản sao lưu nâng cấp nay là `truoc-khi-chuyen-sqlite`.

### 7.2 Ca mới (28)
| Nhóm | Nội dung |
|---|---|
| S1 chuyển đổi | dữ liệu thật; chạy lại 4 lần không nhân đôi; schema 1; dữ liệu bất thường; JSON cắt ngang không có sao lưu; JSON sai cấu trúc; lỗi giữa chừng / lệch số liệu / lỗi sau COMMIT (giả lập); **kill -9 lúc đang chuyển 25.000 dòng** (8 lần, JSON không hỏng); thư mục có dấu cách và chữ Việt |
| S2 độ bền | **kill -9 trong lúc ghi dòng sổ + phiếu 30 dòng, 10 vòng** (trong đó 3–6 vòng bị giết đúng lúc đang giữa giao dịch): không mất thao tác đã xác nhận, không phiếu nửa vời, file nguyên vẹn; `.db` hỏng (rác / cắt ngang / ghi đè giữa file / rỗng) → lấy bản sao lưu, giữ file hỏng; không có sao lưu → dừng, không xóa; `.db` của phiên bản mới hơn → từ chối; **ổ đĩa đầy** (giả lập SQLITE_FULL bằng `max_page_count`); chương trình khác ghi chen → 409; file bị khóa (ngắn: chờ rồi ghi; dài: báo lỗi sau ~5 giây, bộ nhớ trở về trạng thái đã lưu); 300 yêu cầu ghi đồng thời; khởi động lại 15 lần |
| S3 sao lưu / bảo mật | vòng `.db` / `.json` / `.zip` → máy mới giống hệt; khôi phục dữ liệu cũ (`.json` schema 1/2, `.zip` cũ, bản `.json` trong backups); 9 loại file hỏng / lạ / mới hơn / thiếu bảng / sai hình dạng → 400, dữ liệu không đổi, không sinh sao lưu thừa; **tiêm SQL** 7 chuỗi ở mọi ô nhập, cài đặt, phiếu in, kiểm quỹ, mọi bộ lọc / tìm kiếm / xuất / tên sao lưu → lưu đúng như chữ, bảng còn nguyên, không gắn thêm CSDL; **path traversal** 10 tên `.db` / liên kết tượng trưng / URL tĩnh; **kế hoạch quay lại**: bản JSON cũ mở được `.json` xuất từ bản SQLite và khôi phục được `.zip` mới (S3.6, cần `KETOAN_BAN_GOC`) |
| S4 hiệu năng | 20.000 + 20.000 dòng, so với bản JSON (bảng dưới) |
| S5 môi trường | quy tắc phiên bản Node; server từ chối Node cũ bằng tiếng Việt; `KhoiDong.bat`; không có thư viện C++; NUL và chuỗi 200.000 ký tự |

### 7.3 Kết quả chạy
- **Trước** (bản JSON, `npm test`): 127 ca, 125 đạt, 1 lỗi **G1** (xuất Excel chi phí 20.000 dòng mất 10.198 ms, vượt ngưỡng; máy kiểm thử
  chậm), 1 bỏ qua (A3 cần mạng).
- **Sau** (bản SQLite, `npm test`): 155 ca, 151 đạt, 2 bỏ qua (A3; S3.6 cần `KETOAN_BAN_GOC`), 2 lỗi:
  - **G1**: cùng lỗi như bản JSON (10.225 ms). Phần xuất Excel không đổi, chạy từ dữ liệu trong bộ nhớ. Đây là giới hạn của máy kiểm
    thử, không phải do lưu trữ: trong cùng bài G1, bản JSON mất 10.198 ms, bản SQLite 10.225 ms.
  - **S2.1**: lỗi ở *công cụ kiểm thử*. Sau kill -9 còn file `ketoan.db-journal`, mà kết nối **chỉ-đọc** của bài kiểm thử không được
    phép hoàn tác nó. Phần mềm thật mở file đọc-ghi nên tự hoàn tác. Đã sửa công cụ đọc của bài kiểm thử cho giống phần mềm; chạy lại 5
    lần đều đạt.
- Chạy xác nhận cuối các nhóm S1–S3, S5, B, G1 (kèm S3.6 so với bản cũ): xem mục 7.4.
- Kiểm tra giao diện bằng Chromium: trang Cài đặt hiện danh sách sao lưu `.db` (lý do "Trước khi chuyển sang SQLite (file .json gốc)",
  "Tự động"), 3 nút tải về, chọn file `.db` để khôi phục → hộp xác nhận → "Đã khôi phục dữ liệu: 67 dòng sổ, 104 dòng chi phí", không có
  lỗi JavaScript.

### 7.4 Chạy xác nhận cuối
Sau khi sửa công cụ của S2.1, chạy lại `s1`, `s2`, `s3` (kèm **S3.6 với bản JSON gốc**), `s5`, `b-luu-tru`, `g-hieu-nang`: **47/47 đạt**,
0 lỗi, 0 bỏ qua. Lần này G1 cũng đạt (xuất Excel chi phí 8.960 ms), xác nhận lỗi G1 trước đó chỉ do dao động tốc độ máy.
Đối chiếu song song bản JSON và bản SQLite: bộ mẫu v1 + v2 **148/148 khớp**; bản sao dữ liệu thật **75/75 khớp**.

### 7.5 Hiệu năng (S4, cùng máy, 20.000 dòng chi phí + 20.066 dòng sổ)

| Thao tác | SQLite | JSON |
|---|---:|---:|
| Lần chạy đầu (bản mới: gồm chuyển sang SQLite) | 3.725 ms | 531 ms |
| Mở phần mềm (khởi động + nạp dữ liệu) | 809 ms | 412 ms |
| Mở sổ (GET /api/db) | 258 ms | 217 ms |
| Lọc sổ thu chi + tồn quỹ | 50 ms | 48 ms |
| Báo cáo chi phí + công nợ | 134 ms | 139 ms |
| Lưu phiếu nhập 30 dòng | 313 ms | 393 ms |
| Sửa 1 dòng sổ | 269 ms | 359 ms |
| Xóa 1 dòng sổ (vào thùng rác) | 342 ms | 355 ms |
| Khôi phục từ thùng rác | 407 ms | 333 ms |
| Đổi mã NCC (lan sang mọi dòng) | 381 ms | 432 ms |
| Sao lưu ngay | 51 ms (.db) | 8 ms (chép .json) |
| Xuất Excel chi phí công trình | 11.421 ms | 9.787 ms |
| Xuất Excel toàn bộ sổ sách | 3.482 ms | 3.112 ms |
| Nhập lại Excel chi phí (gộp, bỏ trùng) | 6.982 ms | 6.258 ms |
| Dung lượng file dữ liệu | 11,2 MB | 16,1 MB |

Mọi thao tác tương tác đều dưới 2 giây và phần lớn thời gian là gửi toàn bộ dữ liệu cho giao diện (như bản cũ), nên **chưa cần tối ưu
truy vấn**. Lần ghi chỉ ghi các dòng đổi: đổi mã NCC lan sang hàng nghìn dòng vẫn một giao dịch, 0,38 giây. Khởi động chậm hơn khoảng
0,4 giây vì phải dựng lại đối tượng từ các bảng. Lần chạy đầu (chuyển đổi 40.000 dòng, kèm đối chiếu hai lần) mất 3,7 giây và chỉ xảy ra
một lần. Với dữ liệu thật (66 + 104 dòng) mọi thứ tức thì.

## 8. Giả định đã tự quyết

1. Quy tắc phiên bản Node: nhận **24.x từ 24.16.0** và **từ 26.1.0 trở lên**; **từ chối dòng 25 và 26.0.x** (hiểu "≥ 24.16.0 hoặc
   ≥ 26.1.0" là theo dòng phát hành có bản sửa lỗi NUL). Máy kiểm thử chỉ có Node 22.22.2 nên mọi kiểm thử chạy với biến
   `KETOAN_CHO_NODE_CU=1` (chỉ dành cho kiểm thử, có cảnh báo). An toàn với NUL đã được bảo đảm bằng thiết kế (mục 3.7), kiểm chứng
   ngay trên Node 22 có lỗi.
2. `SCHEMA_VERSION` = `user_version` = **4** (JSON đang là 3). `db.schema` gửi cho giao diện nay là 4. Hình dạng bản ghi giữ như 3.
3. Bản sao lưu trước chuyển đổi đặt tên `…-truoc-khi-chuyen-sqlite.json` và **thay cho** `truoc-nang-cap-vN` khi dữ liệu cũ còn ở schema
   1/2 (một bản duy nhất, nguyên văn file gốc). Ca kiểm thử cũ tìm `truoc-nang-cap` được sửa theo.
4. Chuyển đổi gặp `ketoan.json` hỏng thì làm **như bản cũ**: lấy bản sao lưu `.json` đọc được gần nhất và giữ file hỏng. Không có bản
   nào đọc được thì dừng.
5. Nút "Tải bản sao lưu chỉ dữ liệu" đổi sang `.db`; thêm "Xuất dữ liệu ra file .json" (bắt buộc cho kế hoạch quay lại). Bản `.zip`
   chứa cả hai dạng để bản cũ vẫn khôi phục được.
6. Có cả `ketoan.db` và một `ketoan.json` lạ thì **không tự nhập** `ketoan.json`, chỉ cảnh báo. Nếu mã băm khớp file đã chuyển (mất
   điện giữa hai bước đổi tên) thì chỉ hoàn tất việc đổi tên.
7. Thêm một mục nhật ký "Khởi tạo" (dùng lại loại `khoi-tao` có sẵn, không đổi giao diện nhật ký) ghi lần chuyển sang SQLite.
8. Hành vi sẵn có **không sửa** vì ngoài phạm vi: các dòng của cùng một phiếu nhập dùng chung số `seq` (bản JSON cũng vậy).

## 9. Rủi ro còn lại

- **Chưa chạy trên Windows thật và Node 24.16+ thật** (máy kiểm thử là Linux, Node 22). Đường chép dự phòng khi Windows khóa file đã
  được kiểm thử bằng giả lập (B3.5). Xem danh sách cần thử ở mục 11.
- `node:sqlite` vẫn được Node đánh dấu "thử nghiệm" (phần mềm ẩn đúng dòng cảnh báo đó). Nếu một bản Node sau đổi API thì phải sửa `lib/db.js`.
- Chờ khóa file: mỗi câu lệnh chờ tối đa 5 giây, và trong lúc chờ máy chủ (đơn luồng) tạm không trả lời. Chỉ xảy ra khi chương trình
  khác giữ file (diệt virus quét, công cụ SQLite).
- Phần mềm diệt virus / OneDrive giữ khóa `ketoan.db` lâu → lưu báo lỗi "CHƯA được ghi" (dữ liệu an toàn nhưng người dùng phải làm lại).
- Mỗi lần lưu vẫn duyệt toàn bộ bản ghi để tìm thay đổi (khoảng 0,1 giây với 40.000 dòng). Từ vài trăm nghìn dòng trở lên nên chuyển sang
  đánh dấu bản ghi đã sửa.
- Hai bản phần mềm cùng mở một thư mục `data` (hai cổng): lần lưu chen được phát hiện (409), nhưng hai cửa sổ vẫn nên tránh.

## 10. Chưa làm

- Chưa chuyển nhật ký `nhat-ky.jsonl` vào SQLite (cố ý, xem mục 3.11).
- Chưa chuyển phép tính báo cáo sang SQL (không cần với hiệu năng hiện tại; giữ ở `shared.js` để số liệu giống hệt).
- Chưa có công cụ xuất `.json` từ dòng lệnh khi phần mềm không mở được. Thay vào đó dùng bản SQLite trên máy khác (Khôi phục `.db` →
  Xuất `.json`), xem hướng dẫn mục 17.2.

## 11. Người dùng cần thử trên Windows trước khi dùng dữ liệu thật

1. **Sao lưu trước**: chép cả thư mục `C:\KeToan\data` ra USB / thư mục khác.
2. Cài Node.js **24.16.0 trở lên** (bản LTS, file .msi) từ https://nodejs.org. Thử bấm `KhoiDong.bat` với Node cũ (nếu còn) → phải
   thấy thông báo tiếng Việt "không dùng được" và trang nodejs.org mở ra.
3. **Chạy thử trên bản sao**: chép `C:\KeToan` sang `C:\KeToanThu` (hoặc thư mục có dấu cách / chữ có dấu như `D:\Kế toán thử`), bấm
   `KhoiDong.bat` ở bản sao. Cửa sổ đen phải báo "Đã chuyển dữ liệu sang SQLite".
4. **Đối chiếu tồn quỹ**: Tổng quan phải hiện đúng tồn quỹ như trước (dữ liệu hiện tại: **943.000 đ**); mở
   `data\migrate-bao-cao.txt` — mọi dòng "khớp"; xem vài màn hình Sổ thu chi, Tổng hợp chi phí, Công nợ NCC.
5. Thử: ghi 1 dòng, sửa, xóa → khôi phục từ thùng rác; lưu 1 phiếu nhập; tắt bằng cách đóng cửa sổ đen rồi mở lại → dữ liệu còn.
6. Thử Cài đặt: **Sao lưu ngay**, **Tải bản sao lưu đầy đủ (.zip)**, **Tải bản sao lưu chỉ dữ liệu (.db)**, **Xuất dữ liệu ra file .json**;
   **Khôi phục** từ file `.db` vừa tải.
7. Thử khóa file: mở phần mềm, để phần mềm diệt virus quét thư mục `data` / để OneDrive đồng bộ (nếu có dùng) và ghi vài dòng → không
   được lỗi. Nếu báo "CHƯA được ghi" thì loại thư mục `data` khỏi diện quét / đồng bộ.
8. Xuất Excel toàn bộ sổ sách và chi phí công trình, mở bằng Excel thật: mở được, số liệu như trước.
9. Mọi thứ ổn thì chạy bản mới trên `C:\KeToan` thật. Có vấn đề thì làm theo **Hướng dẫn mục 17.2 — Quay lại phiên bản cũ**.
