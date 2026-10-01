# Nhật ký phiên bản (CHANGELOG)

## Đăng nhập đơn giản và phân quyền — mặc định TẮT (01/10/2026)

- **Mặc định tắt**: không bật thì phần mềm chạy y như trước (không màn hình đăng nhập, không thêm bước; toàn bộ kiểm thử cũ vẫn qua).
  Bật / tắt ở Cài đặt → **Đăng nhập và phân quyền** (bật phải tạo ngay tài khoản Chủ; tắt phải nhập lại mật khẩu; tài khoản được giữ).
- **Ba vai trò** Chủ / Kế toán / Chỉ xem. Kiểm quyền THẬT ở tầng API theo một bảng duy nhất `lib/quyen.js` (mặc định từ chối: route
  chưa khai báo bị chặn 403 khi đăng nhập bật); giao diện chỉ ẩn nút cho tiện. Việc chưa rõ (nhập Excel thay thế, gộp mã, khóa sổ,
  xóa vĩnh viễn, khôi phục sao lưu) thuộc Chủ. 401 khi chưa đăng nhập / hết phiên, 403 kèm thông báo tiếng Việt.
- **Mật khẩu**: băm scrypt (N=2^15, r=8, p=1, muối 16 byte, khóa 64 byte, dạng `scrypt$N$r$p$muoi$bam`, tự băm lại khi đổi tham số),
  so sánh thời gian hằng, chuẩn hóa NFC, ≥ 8 ký tự, khác tên, không nằm trong danh sách phổ biến. Chỉ dùng `crypto` / `node:sqlite`.
- **Phiên**: mã ngẫu nhiên 32 byte, CSDL chỉ giữ SHA-256; cookie `HttpOnly; SameSite=Strict; Path=/` (không `Secure` vì chạy http
  cục bộ); hết sau 60 phút không thao tác, tối đa 12 giờ (Chủ chỉnh được); hủy khi đổi mật khẩu / vai trò, vô hiệu hóa, tắt đăng
  nhập, khôi phục sao lưu; dọn phiên hết hạn định kỳ. Chống giả mạo yêu cầu: kiểm Origin / Referer cho mọi thao tác ghi.
- **Chống đoán**: sai 5 lần → khóa 5, rồi 15, rồi 60 phút; giới hạn theo địa chỉ nguồn (20 lần sai / 15 phút); thông báo chung, tên
  không tồn tại xử lý giống hệt (kể cả thời gian băm); Chủ mở khóa được.
- **Quản lý người dùng** (`#/nguoi-dung`): thêm, sửa họ tên / vai trò, đặt lại mật khẩu (bắt đổi ở lần đăng nhập sau), mở khóa, vô hiệu
  hóa / kích hoạt (không xóa hẳn); không khóa được Chủ hoạt động cuối cùng. Tự đổi mật khẩu phải nhập mật khẩu cũ. Thẻ **Sự kiện bảo mật**.
- **Không bao giờ bị khóa ngoài**: quên mật khẩu → mã một lần (15 phút) ghi vào `data/khoi-phuc/MA_KHOI_PHUC.txt` (CSDL chỉ giữ bản băm);
  mã dự phòng của Chủ (hiện một lần khi bật, tạo mới sau khi dùng); lệnh cứu hộ `node scripts/dat-lai-mat-khau-chu.js`.
- **Ghi người thao tác**: cột `nguoiTao` / `nguoiSua` trên dòng sổ, chi phí, danh mục, kiểm quỹ, trả ngoài quỹ (“Dữ liệu cũ” cho dữ liệu
  trước đây, “Người dùng máy này” khi tắt); nhật ký thay đổi lấy người từ phiên (bỏ qua tiêu đề `X-Nguoi-Dung` khi bật); nhập Excel ghi
  người đang đăng nhập.
- **Trải nghiệm**: Enter để đăng nhập, hiện / ẩn mật khẩu, cảnh báo Caps Lock; báo trước khi hết phiên 2 phút + nút **Tiếp tục làm việc**;
  hết phiên giữa chừng thì hộp đăng nhập lại đè lên, dữ liệu đang nhập còn nguyên, thao tác dở được gửi tiếp sau khi đăng nhập.
- **Sao lưu / khôi phục**: bảng đăng nhập nằm trong `ketoan.db` nhưng ngoài kho dữ liệu nghiệp vụ — khôi phục giữ nguyên người dùng, mật
  khẩu, trạng thái bật; file sao lưu tải về, `/api/db` và file Excel không chứa dữ liệu đăng nhập.
- Lược đồ dữ liệu **6** (tự nâng cấp, sao lưu `truoc-nang-cap-luoc-do-6` giữ mãi, chạy lại không nhân đôi): bảng `nguoiDung`,
  `phienDangNhap`, `suKienBaoMat`, `cauHinhDangNhap`; cột `nguoiTao`, `nguoiSua`.
- Kiểm thử: K1–K8, Q1–Q4 (tự dò mọi route trong mã × 4 trạng thái), B1–B4, N1–N6, R1–R4, T1–T6, U1–U3. Báo cáo: `BAO_CAO_DANG_NHAP.md`.
- Sửa kèm: cấu hình đăng nhập giữ trong bộ nhớ (chương trình khác khóa file thì phần mềm vẫn đọc được như trước); route API chặt hơn
  (phương thức / số đoạn đường dẫn sai → 404 thay vì rơi vào xử lý khác).

## Gộp mã trùng, tách mã hạng mục, lọc công nợ nhiều NCC (01/10/2026)

- **Công nợ NCC lọc theo nhiều NCC**: ô gõ tìm chọn nhiều (không dấu, hoa / thường), chip “Đang lọc” bỏ từng NCC, **Xóa lọc**, lọc nhanh
  tình trạng (còn nợ / ứng dư / ẩn đã tất toán), tổng = các dòng đang hiện, bảng theo công trình theo NCC đã chọn, nhớ bộ lọc; In / Excel
  ghi rõ bộ lọc (`/api/export/cost-debt?ncc=…&ncc=…&tt=`). Màn Tổng hợp NCC (sổ thu chi) cũng lọc được nhiều NCC.
- **Gộp mã** cho NCC, vật tư, hạng mục, nhà / khu, dự án / công trình: chọn mã nguồn + mã đích → **xem trước** (số bản ghi theo bảng, kể
  cả thùng rác; tiền chịu ảnh hưởng; thuộc tính giữ lại) → xác nhận → gộp trong **một giao dịch**, có sao lưu `truoc-gop-ma`. Chỉ đổi
  trường mã; mọi tổng tiền bất biến. Mã nguồn không bị xóa mà thành “Đã gộp vào …” (ẩn khỏi danh mục, ô chọn, báo cáo, Excel xuất ra;
  không sửa / xóa / tạo lại). Quy tắc riêng: vật tư khác ĐVT hoặc mã khoản `XX-` / `CHUNG` với vật tư thường phải xác nhận; hạng mục
  khác tên phải xác nhận CÙNG NGHĨA, khác nhóm thì cảnh báo; nhà / khu chỉ gộp trong cùng công trình; dự án: nhà chuyển theo (nhà trùng
  chọn gộp vào nhà của đích), ngân sách hai bên phải chọn giữ / cộng, ngày khởi công sớm nhất, cảnh báo địa chỉ / thời gian. Tháng đã
  khóa sổ chặn (423, liệt kê dòng). Dữ liệu đổi giữa xem trước và gộp: 409.
- **Bí danh**: mã đã gộp tự đổi sang mã đích khi gõ tay (phiếu thu chi, phiếu nhập chi phí, khoản trả ngoài quỹ…), khi nhập Excel (sổ thu
  chi, chi phí công trình, công cụ dòng lệnh ChiPhi_CongTrinh; bước xem trước có bảng file / sheet / dòng / cột / mã cũ → mã mới, dòng
  danh mục của mã cũ bị bỏ), và trong bộ lọc đã nhớ.
- **Tách mã hạng mục** (một mã mang hai nghĩa): lọc theo công trình / nhà / NCC / vật tư / kỳ (bắt buộc ít nhất một điều kiện), xem trước
  từng dòng để tích / bỏ tích, đổi sang hạng mục có sẵn hoặc **tạo mới ngay**.
- **Lịch sử gộp mã + hoàn tác** (màn **Gộp mã** `#/gop-ma`): hoàn tác trả mọi dòng, thông tin mã đích, mã nguồn, bí danh, cảnh báo đã bỏ
  qua về như cũ (sao lưu `truoc-hoan-tac-gop`); từ chối có lý do khi có lần gộp sau đụng cùng mã hoặc dữ liệu đã sửa sau khi gộp.
- **Gợi ý mã trùng**: mã khác hoa / thường / khoảng trắng; trùng tên bỏ dấu, dấu câu (vật tư cùng ĐVT, nhà cùng công trình); tên gần
  giống (NCC, hạng mục, dự án); nhà không dùng. Chỉ gợi ý, không tự gộp; Bỏ qua được nhớ, Hiện lại.
- Lược đồ dữ liệu **5** (tự nâng cấp khi mở, sao lưu `truoc-nang-cap-luoc-do-5` giữ mãi, chạy lại không sao): cột `gopVao` ở 5 danh mục,
  bảng `aliases`, `mergeLog`, `ignoredDupes`, `extPayments`. API `/api/merge/preview`, `/api/merge`, `/api/merge/log`,
  `/api/merge/:id/undo`, `/api/merge/split[/preview]`, `/api/merge/suggest`, `/api/merge/suggest/ignore`. Nhật ký: `gop-ma`, `tach-ma`,
  `hoan-tac-gop`, `nang-cap`.
- Ô chọn gõ tìm (`combo.js`) chọn được nhiều mã (chip), loại trừ mã, gợi ý “mã – tên”; ↑ ↓ Enter, Esc chỉ đóng danh sách gợi ý.
- Kiểm thử M0–M14 (`tests/m-gop-ma.test.js`: nâng cấp lược đồ, bất biến tiền, không mồ côi, hoàn tác về nguyên trạng từng bảng, trường
  hợp biên, thùng rác, bí danh nhập Excel, hiệu năng 20.000 dòng, từng loại mã, tách mã, gợi ý, tắt ngang khi gộp), MU1–MU5
  (giao diện thật), D6.3–D6.4, F6c, F6d, F8.
- Báo cáo chi tiết: `BAO_CAO_GOP_MA.md`.

## Trả nhà cung cấp từ nguồn khác, ngoài quỹ (01/10/2026)

- Công nợ NCC: nút **Nguồn khác** (dòng NCC) / **Trả từ nguồn khác** (khung chi tiết) ghi khoản đã trả NCC bằng tiền không thuộc
  quỹ tiền mặt (chuyển khoản công ty, chủ nhà trả thẳng, giám đốc trả…) kèm ngày, số tiền, nguồn tiền, công trình, ghi chú. Khoản này
  cộng vào **Đã trả** của công nợ (theo NCC và theo công trình, “tính đến ngày”, gợi ý công nợ ở form phiếu chi) nhưng không vào Sổ thu chi,
  không đổi tồn quỹ. Cột Đã trả có dòng phụ “ngoài quỹ …”; khung chi tiết liệt kê, sửa, xóa (vào Thùng rác, khôi phục được).
- Bảng mới `extPayments` (lược đồ 5, tự tạo khi mở dữ liệu cũ); API `POST/PUT/DELETE /api/ext-payments`; kiểm tra dữ liệu vào, khóa sổ
  tháng (423), nhật ký thay đổi; đổi mã / xóa NCC, dự án tính cả khoản trả này; gộp mã NCC / dự án chuyển cả khoản trả (xem trước hiện
  “trả ngoài quỹ”), hoàn tác trả lại.
- Excel: sheet `TRA_NGOAI_QUY` trong file chi phí (CONGNO_NCC và CONGNO_CONGTRINH cộng bằng SUMIFS), sheet `Tra_Ngoai_Quy` trong file
  công nợ; nhập file chi phí đọc lại sheet này (bỏ khoản trùng kiểu đa tập, đổi mã cũ theo bí danh, bỏ tháng đã khóa).
- Kiểm thử X1–X5 (`tests/x-tra-ngoai-quy.test.js`); dữ liệu mẫu gộp mã có khoản trả ngoài quỹ (M1 kiểm bất biến cả phần này);
  `tests/so-lieu-moc.js` kiểm các trường mới bằng 0 khi không có khoản ngoài quỹ rồi so với mốc cũ.

## Ô lọc gõ tìm thay cho danh sách chọn (01/10/2026)

- Mọi ô lọc / ô chọn dự án, công trình, nhà, nhà cung cấp, nhóm CP, hạng mục, vật tư đổi từ danh sách thả xuống sang ô gõ tìm có gợi ý
  (như ô NCC ở form phiếu chi): Sổ thu chi (dự án, NCC), Sổ chi phí (công trình, nhà, nhóm, hạng mục, NCC, vật tư), Tổng hợp chi phí
  (công trình, nhà), Chi tiết theo nhóm (công trình, nhà, NCC), Công nợ NCC (công trình, NCC), Giá vật tư (NCC, hạng mục), form hạng mục
  (Thuộc nhóm) và form nhà (Thuộc công trình). Chọn gợi ý là áp dụng ngay; gõ mã / tên rồi Enter; gõ sai báo lỗi; xóa trắng bỏ lọc;
  giữ lựa chọn “chưa gán”. Ô chọn có ít lựa chọn cố định (kỳ, loại CP, sắp xếp…) giữ nguyên.
- Thành phần dùng chung `public/js/combo.js` (`comboHtml`, `bindCombo`, `comboResolve`). Kiểm thử F8; cập nhật F1b, F3, F4, F5, F6c, F7, G3.

## Công nợ NCC: ô lọc NCC gõ tìm (01/10/2026)

- Ô lọc nhà cung cấp đổi từ danh sách chọn sang ô gõ tìm có gợi ý (mã + tên), như ô Nhà cung cấp ở form phiếu chi: chọn gợi ý là lọc
  ngay; gõ mã (không phân biệt hoa thường) hoặc đúng tên rồi Enter; tên không có thì báo lỗi; xóa trắng rồi Enter để bỏ lọc. Kiểm thử F6c.

## Công nợ NCC: lọc theo mã NCC (01/10/2026)

- Màn Công nợ NCC có ô chọn nhà cung cấp: chỉ hiện NCC đó (bỏ qua ô phạm vi), chi tiết mở sẵn, bảng theo công trình chỉ còn các
  công trình NCC đó có phát sinh / thanh toán (cột Chi khác không áp dụng). Bộ lọc được nhớ; In và Xuất Excel theo bộ lọc
  (`/api/export/cost-debt?ncc=`).
- `KT.supplierDebt` và `KT.projectDebtSummary` nhận thêm `ncc`. Kiểm thử D6.3, F6c.

## Nhập Thành tiền không cần Số lượng, Đơn giá (01/10/2026)

- Phiếu nhập chi phí: ô **Thành tiền** nhập được. Chỉ gõ Thành tiền (để trống SL, ĐG) → dòng khoán, lưu SL 1 × ĐG = Thành tiền
  (giống cách công cụ nhập Excel xử lý dòng chỉ có Thành tiền), nên công thức SL × ĐG = Thành tiền vẫn đúng ở mọi dòng, báo cáo và
  Excel không đổi. Gõ SL + Thành tiền → Đơn giá tự tính (máy chủ tính tới 0,01 sao cho nhân lại đúng Thành tiền, không chia đều thì báo lỗi).
  Ô người dùng tự gõ không bị ghi đè khi sửa ô khác.
- Sổ chi phí: bấm đúp ô Thành tiền để sửa (giữ SL, tính lại ĐG); form sửa dòng có ô Thành tiền, SL và ĐG không còn bắt buộc.
- API `/api/cost-slips`, `/api/costs`: nhận thêm `thanhTien`; khi có đủ `soLuong` và `donGia` thì vẫn tự tính và bỏ qua `thanhTien` gửi kèm
  (tương thích bản cũ). Hàm dùng chung `KT.costFromInput`, `KT.syncCostInputs`. Kiểm thử D3.4, F1c.

## Bỏ Kế toán trưởng trên phiếu thu/chi (01/10/2026)

- Phiếu thu, phiếu chi (in từ phần mềm, file Excel một phiếu và sheet `Phieu_Chi` trong file xuất) chỉ còn ba chỗ ký: Giám đốc,
  người nộp/nhận tiền, Thủ quỹ. Bỏ ô chọn “In thêm chỗ ký của kế toán trưởng” trong Cài đặt (giá trị cũ vẫn lưu nhưng không còn tác dụng).
- Tên Kế toán trưởng vẫn được nhập trong Cài đặt và vẫn in trên sổ quỹ, báo cáo chi phí và biên bản kiểm quỹ.

## Nhập Excel công trình (01/10/2026, nhánh `feature/import-excel-cong-trinh`)

### Thêm
- **`scripts/import-excel-chiphi.js`**: nhập nhiều file `ChiPhi_CongTrinh_*.xlsm` (NHATKYCHUNG → dòng chi phí theo phiếu, SO_QUY → sổ thu
  chi, DM_* → danh mục gộp hợp nhất) với `--dry-run` (không ghi gì, báo cáo), `--apply` (sao lưu `truoc-import-excel`, một giao dịch, đối
  chiếu trước khi chốt), `--rollback <mã lần nhập>` (vào Thùng rác). Dấu vân tay từng dòng nguồn → chạy lại không nhân đôi. Làm sạch theo
  quy tắc: dòng khoán (chỉ có Thành tiền), mã CT / mã nhà thiếu hoặc sai, Loại CP suy ra, NCC khác hoa / thường, hạng mục trùng mã khác
  nghĩa, số phiếu giả / chữ thường, ngày hoán đổi, nhà mẫu thừa, khoản sổ quỹ đã có trong Sổ thu chi… Mọi chỗ sửa / suy ra / bỏ qua đều có
  trong báo cáo kèm số dòng gốc.
- **`scripts/so-ky-vong-excel.js`**: tính số kỳ vọng (số dòng, tổng tiền, sổ quỹ) thẳng từ XML của file Excel, độc lập với ExcelJS và với
  công cụ nhập — dùng để đối chiếu.
- `lib/importCongTrinh.js` (lõi), `Store.commitChecked()` (ghi trạng thái mới trong một giao dịch, kiểm tra trên dữ liệu đọc lại trước
  khi COMMIT), kiểm thử `tests/i-import-excel.test.js`, hướng dẫn mục 18, báo cáo `import-bao-cao/BAO_CAO_IMPORT.md`.

## Lưu dữ liệu bằng SQLite (01/10/2026, nhánh `feature/chuyen-sqlite`)

Chỉ đổi **cách lưu dữ liệu**: không thêm tính năng nghiệp vụ, không đổi cách tính. Đối chiếu với bản JSON trên dữ liệu thật: mọi bản ghi,
mọi con số báo cáo và từng ô của mọi file Excel xuất ra giống hệt (148/148 hạng mục, xem `BAO_CAO_CHUYEN_SQLITE.md`).

### Thay đổi
- Dữ liệu nằm ở **`data/ketoan.db`** (SQLite có sẵn trong Node.js — `node:sqlite`, không cần thư viện biên dịch). Lược đồ phiên bản 4
  (`PRAGMA user_version`), bảng có kiểu cột và chỉ mục; thiết kế ở `docs/THIET_KE_SQLITE.md`.
- **Tự chuyển** từ `data/ketoan.json` lần đầu chạy: sao lưu file JSON (`backups/ketoan-…-truoc-khi-chuyen-sqlite.json`, không bao giờ tự
  xóa), dựng file tạm trong một giao dịch, đối chiếu toàn bộ bản ghi và mọi tổng số trước khi ghi; lệch thì dừng và giữ nguyên file
  JSON. Báo cáo ở `data/migrate-bao-cao.txt`. File gốc đổi tên `ketoan.json.da-chuyen-sqlite.bak`. Chạy lại không chuyển lần hai.
- Mỗi lần lưu là **một giao dịch** (trọn vẹn hoặc không có gì); chỉ ghi các dòng thay đổi. Lưu lỗi (ổ đầy, file bị khóa) → báo rõ
  “CHƯA được ghi” và dữ liệu trên màn hình trở về đúng trạng thái đã lưu. Chương trình khác ghi chen vào file → phát hiện, nạp lại,
  không ghi đè (HTTP 409).
- Sao lưu tự động là file `.db` nhất quán (`VACUUM INTO`); vẫn khôi phục được các bản `.json` cũ. File `.db` hỏng khi khởi động → tự lấy
  bản sao lưu gần nhất, giữ file hỏng.
- Cài đặt → **Tải bản sao lưu chỉ dữ liệu** nay là file `.db`; thêm **Xuất dữ liệu ra file .json** (để quay lại bản cũ); bản đầy đủ
  `.zip` chứa cả `ketoan.db` lẫn `ketoan.json`; **Khôi phục** nhận `.db`, `.json`, `.zip`, kiểm tra file trước khi thay.
- Yêu cầu **Node.js ≥ 24.16.0 (dòng 24) hoặc ≥ 26.1.0**; `KhoiDong.bat` và `server.js` báo lỗi tiếng Việt kèm cách cài.
- Hướng dẫn sử dụng: mục 7, 8 cập nhật; mục 17 mới (chuyển đổi, kiểm tra, **kế hoạch quay lại bản JSON**).

### Tệp mới
`lib/db.js`, `lib/migrate.js`, `lib/node-version.js`, `docs/THIET_KE_SQLITE.md`, `BAO_CAO_CHUYEN_SQLITE.md`, `tests/doi-chieu-sqlite.js`,
`tests/s1…s5-sqlite-*.test.js`.

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
