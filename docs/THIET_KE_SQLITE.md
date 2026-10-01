# Thiết kế chuyển lưu trữ từ JSON sang SQLite

Phạm vi: chỉ đổi **cách lưu dữ liệu**. Không thêm tính năng nghiệp vụ, không đổi giao diện (trừ phần sao lưu / khôi phục bắt buộc phải
đổi vì file sao lưu nay là `.db`), không đổi cách tính. Mọi con số vẫn do `public/js/shared.js` tính trên cùng một đối tượng dữ liệu
như trước, nên chúng giống hệt bản JSON.

## 1. Hiện trạng (đọc từ mã và từ `data/ketoan.json`)

### 1.1 Cách lưu hiện tại

- Toàn bộ dữ liệu là **một file JSON** `data/ketoan.json`, nạp hết vào bộ nhớ (`store.db`) khi khởi động.
- Mọi API ghi theo cùng một kiểu: sửa thẳng `store.db` (push / filter / gán trường) rồi gọi `store.save()` → ghi lại **cả file**
  (file tạm + đổi tên, dự phòng chép đè khi Windows khóa file). Các thao tác lớn (nhập Excel thay thế, khôi phục, xóa toàn bộ) gọi
  `store.replaceAll(db, lyDo)`: sao lưu trước rồi thay cả kho.
- Sao lưu tự động: `data/backups/ketoan-<yyyymmdd-hhmmss>-<lý do>.json`, tối đa 1 bản / 10 phút khi đang sửa, luôn có trước thao tác lớn,
  giữ 60 bản. File dữ liệu hỏng → tự lấy bản sao lưu đọc được gần nhất, file hỏng được giữ lại (`ketoan.json.hong-<giờ>`).
- Nhật ký thay đổi nằm riêng `data/nhat-ky.jsonl` (chỉ ghi nối thêm) — **không thuộc phạm vi chuyển đổi**, giữ nguyên (khôi phục dữ
  liệu cũ không được xóa lịch sử, và file chỉ ghi nối thêm vốn đã an toàn).
- Chứng từ đính kèm là file trong `data/attachments/`, chỉ có siêu dữ liệu nằm trong kho → giữ nguyên.

### 1.2 Các khóa cấp cao của kho (schema 3)

| Khóa | Kiểu | Ghi chú |
|---|---|---|
| `schema` | số | phiên bản dữ liệu; file thật đang là **2** |
| `settings` | đối tượng | `tenDonVi, diaChi, giamDoc, keToanTruong, thuQuy, nguoiLap, hinhThucMacDinh, hienKeToanTruong (bool)`, có thể thêm `nguongLechGia, soNgayNhapTon` |
| `projects` | mảng | `id, ma, ten, nganSach (tiền), trangThai, ghiChu, ngayKhoiCong, diaChi` — dự án = công trình |
| `suppliers` | mảng | `id, ma, ten, loai, sdt, diaChi, ghiChu` |
| `entries` | mảng | dòng sổ thu chi: `id, seq, ngay, soPhieu, maDuAn, maNCC, noiDung, thu, chi, nguoiNhan, ghiChu, createdAt, updatedAt, trangThai?` |
| `vouchers` | đối tượng (map) | số phiếu (viết hoa) → `{ ngay, nguoiNhan, diaChi, lyDo, hinhThuc, kemTheo }` (chỉ phần sửa khi in) |
| `costGroups` | mảng | `id, ma, ten, ghiChu` |
| `costItems` | mảng | `id, ma, ten, maNhom, ghiChu` |
| `materials` | mảng | `id, ma, ten, dvt, maHM, loaiCP, ghiChu` |
| `houses` | mảng | `id, ma, ten, maCT, dienTich (chuỗi), chuNha, chung (bool), ghiChu` |
| `costs` | mảng | dòng chi phí: `id, seq, phieuId, ngay, maCT, maNha, maHM, loaiCP, maVT, dienGiai, soLuong (thập phân), donGia (≤ 2 số lẻ), thanhTien (tiền), maNCC, soPhieu, ghiChu, nguon, createdAt, updatedAt, trangThai?` |
| `trash` | mảng | thùng rác: `id, at, by, kind, label, records[] (ảnh chụp bản ghi), attachments[]?, group?, phieuId?` |
| `locks` | mảng | khóa sổ: `thang (yyyy-mm), at, by` |
| `attachments` | mảng | `id, owner, ownerId, name, file, size, type, sha256, createdAt, by` |
| `cashCounts` | mảng | kiểm quỹ: `id, ngay, thucTe, tonSo, menhGia {mệnh giá: số tờ}, nguoiKiem, ghiChu, createdAt, by` |
| `ignoredWarnings` | đối tượng (map) | khóa cảnh báo → `{ at, by, label, note }` |
| `nextId` | số | bộ đếm id **dùng chung** cho mọi danh sách (kể cả id trong thùng rác, phiếu nhập `phieuId`) |
| `updatedAt` | chuỗi ISO | |
| `budgets` | mảng (bản cũ) | chức năng dự toán đã bỏ; `normalize()` xóa khóa này (đã như vậy từ trước) |

### 1.3 Tham chiếu giữa các bảng

Tất cả tham chiếu đều **bằng mã (chuỗi)**, so khớp **không phân biệt hoa thường, bỏ khoảng trắng đầu cuối** (`KT.keyOf` =
`trim().toLowerCase()`), mã rỗng `''` nghĩa là "không có":

- `entries.maDuAn → projects.ma`, `entries.maNCC → suppliers.ma` (được phép rỗng)
- `costs.maCT → projects.ma`, `costs.maNCC → suppliers.ma`, `costs.maHM → costItems.ma`, `costs.maVT → materials.ma` (được rỗng),
  `costs.maNha → houses.ma` (được rỗng)
- `costItems.maNhom → costGroups.ma` (được rỗng), `materials.maHM → costItems.ma` (được rỗng), `houses.maCT → projects.ma`
- Theo id: `attachments.ownerId → entries.id | costs.id | phieuId` tùy `owner` (đa hình); `costs.phieuId` là nhóm, không có bảng riêng.

### 1.4 Dữ liệu thật `data/ketoan.json` (đo ngày 01/10/2026)

- schema **2**, `nextId` 609; 66 dòng sổ, 15 dự án, **62** nhà cung cấp (đề bài ghi 43 — file thật có 62, trong đó 25 NCC có phát
  sinh), 6 nhóm CP, 37 hạng mục, 317 vật tư, 1 nhà, 104 dòng chi phí (56 phiếu nhập), `vouchers` rỗng, `budgets` rỗng.
- Tổng thu 2.532.577.035, tổng chi 2.531.634.035, **tồn quỹ 943.000**; tổng chi phí công trình 1.129.929.000.
- Kiểu dữ liệu đồng nhất: mọi id/tiền là số nguyên, ngày đều `YYYY-MM-DD`, không có số dạng chuỗi, không có ký tự NUL.
- Không trùng mã trong danh mục, không trùng id (608 id, lớn nhất 608), không trùng `seq`, **không có mã mồ côi**.
- Mã rỗng: 8 dòng sổ không dự án, 10 dòng không NCC, 2 vật tư không hạng mục. `soLuong` có số lẻ (4,5; 2,5…), `donGia` đều nguyên.
- Thứ tự mảng **không** theo (ngày, seq) mà theo thứ tự thêm vào (push); id tăng dần nhưng khôi phục từ thùng rác chèn id cũ vào cuối.
  → phải lưu **thứ tự** của từng danh sách.

## 2. Quyết định chính

### 2.1 Thư viện: `node:sqlite` (`DatabaseSync`)

- Có sẵn trong Node, không cần biên dịch C++ (không dùng better-sqlite3 / sqlite3), chạy offline.
- **Yêu cầu Node ≥ 24.16.0 (dòng 24) hoặc ≥ 26.1.0**; dòng 25 và 26.0 bị từ chối. Bản cũ có lỗi cắt chuỗi tại ký tự NUL — đã kiểm
  chứng trên Node 22.22.2: ghi `'ab\0cd'` vào cột TEXT đọc lại được `'ab'`. `KhoiDong.bat` và `server.js` đều kiểm tra phiên bản.
- **Phòng thủ thêm, không phụ thuộc phiên bản Node**: chuỗi chứa ký tự NUL **không bao giờ** được ghi vào cột TEXT thường mà đi vào
  cột JSON `khac` (JSON viết NUL thành `\u0000`, không bị cắt). Nhờ vậy dữ liệu an toàn kể cả khi chạy kiểm thử trên Node cũ.
- Biến môi trường `KETOAN_CHO_NODE_CU=1` cho phép chạy trên Node cũ hơn **chỉ để kiểm thử** (máy phát triển đang có Node 22); có cảnh báo.
- Không dùng `sql.js` (không cần: `node:sqlite` dùng được).

### 2.2 Kiến trúc: giữ mô hình "dữ liệu trong bộ nhớ", SQLite là nơi lưu

Toàn bộ mã nghiệp vụ (server, costApi, traceApi, importer…, ~60 chỗ dùng `store.db`) đọc / sửa `store.db` rồi gọi `store.save()`.
Giữ nguyên hợp đồng này (đề bài: ưu tiên giữ các hàm công khai của `lib/store.js`) để **không đổi một dòng logic nghiệp vụ nào**:

- Khởi động: đọc mọi bảng SQLite → dựng lại đúng đối tượng `db` như bản JSON (cùng trường, cùng kiểu, cùng thứ tự mảng).
- `save()`: so sánh từng bản ghi với ảnh chụp lần lưu trước (chuỗi JSON của bản ghi + vị trí) → chỉ ghi các dòng **thêm / sửa / xóa**,
  tất cả trong **một giao dịch** (`BEGIN IMMEDIATE … COMMIT`). Đổi tên mã lan sang 5.000 dòng = 5.001 câu UPDATE trong một giao dịch.
- Lỗi khi ghi (đĩa đầy, file bị khóa, ràng buộc…) → `ROLLBACK`, **nạp lại bộ nhớ từ đĩa** (bỏ thay đổi chưa lưu được) rồi báo lỗi.
  Bản JSON cũ khi ghi lỗi vẫn giữ thay đổi trong bộ nhớ (lần lưu sau có thể ghi nửa vời); bản mới bảo đảm bộ nhớ = đĩa.
- `replaceAll()`: sao lưu → xóa sạch và chèn lại toàn bộ trong **một giao dịch**.
- Truy vấn báo cáo vẫn chạy trong JS trên dữ liệu bộ nhớ (như cũ) → số liệu giống hệt; SQLite không tính tổng.
  ("tối ưu truy vấn sau khi đúng": đo ở mục hiệu năng; với 40.000 dòng không cần chuyển phép tính sang SQL.)

### 2.3 Lược đồ

Mọi bảng `STRICT` (SQLite kiểm tra kiểu cột thật sự). Tên cột trùng tên trường JS (dễ ánh xạ, dễ đọc bằng DB Browser). Mỗi bảng bản
ghi có thêm:

- `vt INTEGER NOT NULL` — vị trí trong mảng (giữ đúng thứ tự). Thuật toán gán: duyệt mảng, bản ghi cũ giữ `vt` nếu vẫn tăng dần,
  bản ghi mới / bị đảo thứ tự nhận `vt = vt trước + 1`. Thêm vào cuối, xóa ở giữa (cách app vẫn làm) không phải đánh số lại.
- `khac TEXT` — JSON chứa các trường **không vừa cột** của bản ghi: trường lạ, giá trị `null`, sai kiểu (vd tiền dạng chuỗi `"1.000"`,
  tiền có số lẻ), chuỗi có ký tự NUL, trường mã vắng mặt. Nhờ vậy **nạp nguyên trạng** mọi dữ liệu bất thường, đọc ra giống hệt.

Kiểu cột và quy tắc mã hóa:

| Loại | Kiểu SQLite | Nhận giá trị JS | Không hợp → `khac` |
|---|---|---|---|
| id | `INTEGER PRIMARY KEY` | số nguyên an toàn > 0 | (id hỏng được `normalize()` cấp lại như trước) |
| tiền (`int`) | `INTEGER` | `Number.isSafeInteger` | số lẻ, chuỗi, null |
| số lượng / đơn giá (`real`) | `REAL` | số hữu hạn | chuỗi, null |
| chữ / ngày (`text`) | `TEXT` | chuỗi không chứa `\0` | số, null, chuỗi có `\0` |
| mã (`code`) | `TEXT`, `''` ghi thành `NULL` | chuỗi | trường vắng mặt (ghi nhận `$vang`) |
| đúng/sai (`bool`) | `INTEGER` 0/1 | `true/false` | số, chuỗi |
| JSON (`json`) | `TEXT` | mọi giá trị | — |
| tùy (`any`) | `ANY` | chuỗi không `\0` hoặc số | khác |

Cột `NULL` (trừ loại mã) nghĩa là **trường không có** trong bản ghi (vd dòng sổ chưa từng có `trangThai` = đã ghi sổ) → đọc ra cũng
không có trường đó; không thêm trường mới vào bản ghi cũ.

**Số lượng thập phân — chọn `REAL`**: REAL của SQLite là số thực 8 byte IEEE-754, **trùng khít** kiểu `number` của JS → ghi rồi đọc
lại được đúng từng bit (đã kiểm: `0.1 + 0.2` đọc lại `=== 0.1 + 0.2`). Mọi phép tính vẫn ở `shared.js` với quy tắc làm tròn sẵn có
(`soLuong` 4 số lẻ, `donGia` 0,01, `costAmount` nhân an toàn ra số nguyên đồng), SQLite **không làm phép tính nào** → không có sai số
mới. Phương án số nguyên đơn vị nhỏ nhất (×10.000) bị loại vì phải làm tròn lúc ghi: giá trị nhập từ Excel không đúng 4 số lẻ sẽ bị
đổi (sai lệch thanh tiền). Tiền (`thu, chi, thanhTien, nganSach, thucTe, tonSo`) là `INTEGER` đồng.

**Ngày** là `TEXT` `YYYY-MM-DD` (như cũ). Không đặt `CHECK` định dạng: dữ liệu ngày lạ (nếu có) vẫn nạp được và được liệt kê trong
báo cáo chuyển đổi.

Bảng (cột ngoài `vt`, `khac`):

```
meta(khoa TEXT PK, giaTri TEXT)              -- settings (JSON), nextId, updatedAt, khacGoc (khóa cấp cao lạ), ungDung, taoLuc, chuyenTu
projects(id PK, ma, ten, nganSach INT, trangThai, ghiChu, ngayKhoiCong, diaChi)
suppliers(id PK, ma, ten, loai, sdt, diaChi, ghiChu)
entries(id PK, seq INT, ngay, soPhieu, maDuAn, maNCC, noiDung, thu INT, chi INT, nguoiNhan, ghiChu, trangThai, createdAt, updatedAt)
costGroups(id PK, ma, ten, ghiChu)
costItems(id PK, ma, ten, maNhom, ghiChu)
materials(id PK, ma, ten, dvt, maHM, loaiCP, ghiChu)
houses(id PK, ma, ten, maCT, dienTich ANY, chuNha, chung BOOL, ghiChu)
costs(id PK, seq INT, phieuId INT, ngay, maCT, maNha, maHM, loaiCP, maVT, dienGiai, soLuong REAL, donGia REAL, thanhTien INT,
      maNCC, soPhieu, ghiChu, nguon, trangThai, createdAt, updatedAt)
vouchers(so TEXT PK, ngay, nguoiNhan, diaChi, lyDo, hinhThuc, kemTheo)
locks(thang TEXT PK, at, by)
ignoredWarnings(khoa TEXT PK, at, by, label, note)
cashCounts(id PK, ngay, thucTe INT, tonSo INT, menhGia JSON, nguoiKiem, ghiChu, createdAt, by)
attachments(id PK, owner, ownerId INT, name, file, size INT, type, sha256, createdAt, by)
trash(id PK, at, by, kind, label, "group", phieuId INT, records JSON, attachments JSON)
```

`trash.records` lưu dạng JSON: đó là **ảnh chụp** bản ghi đã xóa (không phải dữ liệu đang dùng), phải khôi phục y nguyên.

**Chỉ mục**: `entries(ngay, seq)`, `entries(maDuAn)`, `entries(maNCC)`, `entries(soPhieu)`; `costs(ngay, seq)`, `costs(maCT)`,
`costs(maNCC)`, `costs(maHM)`, `costs(maVT)`, `costs(maNha)`, `costs(phieuId)`, `costs(soPhieu)`; `ma` của mọi danh mục;
`costItems(maNhom)`, `materials(maHM)`, `houses(maCT)`; `attachments(owner, ownerId)`; `trash(kind)`; `cashCounts(ngay)`; `vt` của mọi
bảng bản ghi (đọc theo thứ tự).

**Khóa ngoại — không đặt trên các cột mã** (vẫn bật `PRAGMA foreign_keys = ON`):
1. Ứng dụng so khớp mã không phân biệt hoa thường (`keyOf`), còn khóa ngoại SQLite so khớp chính xác từng ký tự: dòng sổ ghi `da01`
   cho dự án `DA01` là hợp lệ với nghiệp vụ nhưng sẽ bị SQLite từ chối → đổi hành vi.
2. `''` là "không có mã" — khóa ngoại cần NULL; được, nhưng còn lý do 1.
3. Ứng dụng **cố ý cho phép** mã lạ tồn tại (màn "Cần xử lý" phát hiện "mã lạ / thiếu hạng mục"; nhập Excel có thể mang mã chưa có).
   Khóa ngoại sẽ làm lần lưu đó thất bại.
4. Đề bài: "FK chỉ ở nơi dữ liệu thật cho phép; dữ liệu mồ côi giữ nguyên và báo cáo". Toàn vẹn mã tiếp tục do lớp API bảo đảm như
   trước (đổi mã lan theo, chặn xóa khi đang dùng), mồ côi được liệt kê trong báo cáo chuyển đổi.
Quan hệ theo id duy nhất (`attachments.ownerId`) là đa hình (3 nơi, trong đó `phieuId` không có bảng) → cũng không đặt được khóa ngoại.

**UNIQUE**: khóa chính `id` từng bảng; `vouchers.so`, `locks.thang`, `ignoredWarnings.khoa`, `meta.khoa`. **Không** đặt UNIQUE trên
`ma`: tính duy nhất của mã theo `keyOf` do API bảo đảm; dữ liệu bất thường có mã trùng vẫn phải nạp được nguyên trạng (đổi mã sẽ làm
lệch tổng hợp theo mã) — mã trùng được liệt kê trong báo cáo.

### 2.4 Phiên bản lược đồ

- File JSON hiện tại là schema **3** → SQLite dùng `PRAGMA user_version = 4` và `SCHEMA_VERSION = 4` (trường `db.schema` gửi cho giao
  diện = 4). Hình dạng bản ghi không đổi so với 3, nên file `.json` xuất ra từ bản mới vẫn mở được bằng bản JSON cũ (bản cũ chỉ nâng
  cấp khi schema nhỏ hơn của nó) — đây là đường quay lại.
- Mở file `.db` có `user_version` lớn hơn phần mềm biết → từ chối (dữ liệu của phiên bản mới hơn).
- Lần nâng cấp sau: tăng `SCHEMA_VERSION`, thêm bước `ALTER`/chuyển dữ liệu theo `user_version` trong `lib/db.js`.

### 2.5 Thiết lập kết nối

- `PRAGMA journal_mode = DELETE` (mặc định, **không dùng WAL**): một người dùng, một tiến trình, ghi ngắn; WAL sinh thêm
  `ketoan.db-wal`/`-shm` — người dùng chép thư mục `data` sang máy khác (hoặc OneDrive/USB) khi đang chạy có thể chỉ chép được file
  `.db` mà thiếu phần nằm trong `-wal` → mất dữ liệu. Chế độ DELETE: khi không ghi, mọi thứ nằm trong **một file**.
- `PRAGMA synchronous = FULL` (an toàn khi mất điện), `PRAGMA foreign_keys = ON`, `PRAGMA busy_timeout = 5000`.
- Mọi câu lệnh dùng tham số `?`; tên bảng/cột chỉ lấy từ hằng số định nghĩa lược đồ trong mã, không bao giờ từ dữ liệu người dùng.
  (`VACUUM INTO ?` cũng truyền đường dẫn bằng tham số.)

### 2.6 Chuyển đổi tự động (lần đầu chạy bản mới)

Điều kiện: chưa có `data/ketoan.db` và có `data/ketoan.json`.

1. Xóa file tạm sót lại của lần chuyển trước bị ngắt (`ketoan.db.dang-chuyen*`).
2. Đọc `ketoan.json`. Hỏng → làm như bản cũ: lấy bản sao lưu `.json` đọc được gần nhất, giữ file hỏng (`ketoan.json.hong-<giờ>`);
   không có bản nào → **dừng** với thông báo tiếng Việt, không đụng gì.
3. Chép nguyên văn file JSON vào `backups/ketoan-<giờ>-truoc-khi-chuyen-sqlite.json` (bản này không bao giờ bị tự xóa).
4. Kiểm tra hình dạng (các danh sách phải là mảng đối tượng…). Sai hình dạng (vd `entries` không phải mảng) → **dừng** (bản cũ sẽ
   âm thầm coi là rỗng = mất dữ liệu, không chấp nhận khi chuyển đổi).
5. Phân tích bất thường (mồ côi, trùng mã, trùng id, số dạng chuỗi, tiền lẻ, ngày lạ, NUL, trường lạ…) → ghi vào báo cáo.
6. Chuẩn hóa nhẹ bằng đúng `normalize()` cũ (bổ sung id/seq thiếu, nextId, nạp danh mục mặc định cho dữ liệu bản 1, bỏ `budgets`),
   cộng thêm: id trùng trong cùng danh sách → bản sau được cấp id mới (bắt buộc vì id là khóa chính). Mọi chỉnh sửa đều ghi log.
7. Tạo **file tạm** `ketoan.db.dang-chuyen`, tạo lược đồ, chèn toàn bộ trong **một giao dịch**; **trước khi COMMIT** đọc lại trong
   chính giao dịch đó và đối chiếu với dữ liệu nguồn:
   - so sánh **toàn bộ** đối tượng (mọi bản ghi, mọi trường, thứ tự);
   - số dòng từng bảng, tổng thu, tổng chi, tồn quỹ (cả số đã ghi sổ), tổng theo từng dự án và từng NCC, tổng chi phí theo công
     trình / NCC, công nợ NCC, `nextId`.
   Lệch dù 1 đồng → `ROLLBACK`, xóa file tạm, **giữ nguyên `ketoan.json`**, dừng phần mềm với thông báo tiếng Việt và chỉ dẫn gửi
   `migrate-bao-cao.txt`.
8. COMMIT, đóng, mở lại file tạm kiểm tra `PRAGMA integrity_check` và đối chiếu lần 2.
9. Đổi tên `ketoan.db.dang-chuyen → ketoan.db` (thao tác nguyên tử), rồi `ketoan.json → ketoan.json.da-chuyen-sqlite.bak`.
   Nếu mất điện giữa hai bước đổi tên: lần chạy sau thấy `ketoan.db` có dấu `meta.chuyenTu` mang mã băm SHA-256 của file JSON nguồn
   → nhận ra `ketoan.json` cạnh đó chính là file đã chuyển và hoàn tất việc đổi tên. `ketoan.json` khác (người dùng tự chép vào)
   thì **không** tự nhập, chỉ cảnh báo (muốn đưa vào thì dùng Khôi phục).
10. Ghi `data/migrate-bao-cao.txt` và một mục "Khởi tạo" trong nhật ký thay đổi.

**Chọn "dừng" thay vì "tiếp tục chạy bằng JSON"** khi chuyển đổi thất bại: chạy song song hai cơ chế lưu dễ dẫn tới dữ liệu nhập sau
đó nằm ở JSON trong khi lần sau lại chuyển đổi thành công từ bản khác, hoặc người dùng không biết đang ở chế độ nào. Dừng hẳn, dữ liệu
gốc nguyên vẹn, thông báo rõ → người dùng (hoặc người hỗ trợ) xử lý rồi chạy lại; hoặc tạm quay về bản cũ theo kế hoạch quay lại.

Chạy lần 2: đã có `ketoan.db` → không làm gì (không nhân đôi).

### 2.7 Sao lưu / khôi phục

- Bản sao lưu: `VACUUM INTO ?` ra file tạm trong `backups/` rồi đổi tên thành `ketoan-<giờ>-<lý do>.db` → bản sao **nhất quán** (đúng
  trạng thái đã COMMIT gần nhất), gọn, không bao giờ để lại file sao lưu ghi dở mang tên thật. Giữ nhịp như cũ (≤ 1 bản / 10 phút khi
  sửa, luôn có trước thao tác lớn), giữ 60 bản; bản `truoc-khi-chuyen-sqlite` không bị tự xóa.
- Danh sách sao lưu gồm cả `.db` mới và `.json` cũ (sinh từ thời dùng JSON) — cả hai khôi phục được.
- Tải về: "bản sao lưu chỉ dữ liệu" nay là file `.db`; thêm "xuất dữ liệu ra .json" (phục vụ kế hoạch quay lại bản cũ). Bản đầy đủ
  `.zip` chứa **cả** `ketoan.db` và `ketoan.json` (bản cũ vẫn mở được zip này) + nhật ký + chứng từ.
- Khôi phục nhận `.db`, `.json`, `.zip`. File `.db` tải lên: kiểm tra chữ ký "SQLite format 3", ghi ra file tạm, mở chỉ đọc,
  `integrity_check`, `user_version`, có đủ bảng, đọc ra đối tượng, kiểm tra hình dạng như bản JSON — chỉ khi mọi thứ hợp lệ mới tự sao
  lưu dữ liệu hiện tại rồi thay. File hỏng / lạ → báo lỗi 400, dữ liệu hiện tại không đổi.
- `ketoan.db` hỏng khi khởi động (không mở được / `integrity_check` lỗi / thiếu bảng) → như bản cũ: giữ lại `ketoan.db.hong-<giờ>`,
  lấy bản sao lưu (`.db` hoặc `.json`) đọc được gần nhất.

### 2.8 Những gì không đổi

- API (đường dẫn, dữ liệu vào/ra, `{ ok, db }`), giao diện (trừ hộp sao lưu / khôi phục), mọi phép tính, Excel nhập / xuất,
  nhật ký `nhat-ky.jsonl`, thư mục chứng từ.
- `lib/store.js` giữ các hàm công khai: `db, dir, file, backupDir, log, audit, flushAudit, publicDb, load, recover, normalize,
  newId, nextSeq, save, backup, pruneBackups, listBackups, readBackup, replaceAll` + `emptyDb, defaultSettings, dataSummary,
  SCHEMA_VERSION, DEFAULT_COST_GROUPS, DEFAULT_COST_ITEMS`. Thêm: `exportJson()`, `snapshotBuffer()`, `readDbBuffer(buf)`, `close()`.
