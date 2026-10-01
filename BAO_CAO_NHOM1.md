# BÁO CÁO CẢI TIẾN NHÓM 1 — ĐỘ CHÍNH XÁC VÀ TRUY VẾT

Phần mềm: Sổ Thu Chi (thư mục `Ketoan`, trước đây `KeToan2`) · Ngày: 30/09/2026
Nhánh gốc (BRANCH_GOC): `claude/focused-maxwell-3a2m5y` · Nhánh làm việc: `feature/truy-vet-chinh-xac` (chưa merge, chưa push)

## 0. Tóm tắt

| | Kết quả |
|---|---|
| Tính năng | 6/6 xong theo đúng thứ tự: nhật ký + xóa mềm → Nháp → khóa sổ → Cần xử lý → kiểm quỹ → đính kèm chứng từ |
| Thay đổi cấu trúc dữ liệu | schema **2 → 3**, nâng cấp tự động, sao lưu trước khi nâng, chạy lại không nhân đôi, **không bản ghi cũ nào bị thêm / đổi trường** |
| Số liệu khi chưa dùng tính năng mới | **Giống hệt trước cải tiến** — so từng con số của 12 báo cáo trên dữ liệu thật và dữ liệu gốc (ca N0, mục 3) |
| `npm test` trước khi bắt đầu | 97 ca: 96 đạt, 1 bỏ qua (ca cài thư viện cần mạng) |
| `npm test` cuối cùng | **127 ca: 126 đạt, 0 không đạt, 1 bỏ qua** (thêm 30 ca mới: N0, N1.1–N1.8, N2.1–N2.3, N3.1–N3.5, N4.1–N4.5, N5.1–N5.2, N6.1–N6.4, N7.1–N7.2) |
| Hiệu năng 20.000 dòng chi phí + 5.000 dòng sổ | Không chậm đi: ghi / sửa / xóa 200–263 ms (trước 243–347 ms), xóa mềm + khôi phục 217–263 ms, lọc nhật ký 3 ms, rà soát bất thường ~200 ms (chạy sau khi vẽ màn hình) — mục 4 |
| Phát hiện đáng chú ý trên dữ liệu thật | “Cần xử lý” tìm ra **16 đơn giá lệch mạnh**, nổi bật: bê tông **BT-M250R7 giá 60.000 (3 dòng: 17/06, 03/07, 25/07/2026) — thấp hơn 97%** so với giá thường mua 1.730.000 (có thể là phí bơm ghi nhầm mã, cần kế toán xem lại); 1 dòng dùng mã **XX-CHUAXACDINH**; 2 vật tư đang dùng chưa gán hạng mục |

## 1. Bước 0 — Git

1. `git status` sạch, `git branch --show-current` = `claude/focused-maxwell-3a2m5y` → **BRANCH_GOC**. Repo đã có sẵn (không cần `git init`), không có thay đổi chưa commit (không cần commit WIP).
2. `git switch -c feature/truy-vet-chinh-xac`; mọi commit nằm trên nhánh này; **không merge, không push, không rebase, không xóa nhánh**.
3. Thêm `.gitignore` cho `data/nhat-ky.jsonl`, `data/attachments/`, `logs/`, file tạm, `*.zip`. Lưu ý: `data/ketoan.json` và `data/backups/` **vốn đã nằm trong git từ trước** (tôi không đổi việc đó để không làm mất lịch sử); trong nhóm này không commit gì thuộc `data/` — test chạy trên thư mục tạm.

## 2. Từng tính năng

### 2.1 Nhật ký thay đổi + xóa mềm
**Mô tả.** Mọi thêm / sửa / xóa (dòng sổ, phiếu nhập, dòng chi phí, 6 loại danh mục, cài đặt, thông tin in phiếu), nhập Excel, khôi phục sao lưu, xóa toàn bộ, khóa / mở khóa sổ, bỏ qua cảnh báo, kiểm quỹ, đính kèm đều được ghi: thời điểm, người thao tác, loại dữ liệu, số bản ghi, mô tả, **giá trị trước và sau** (phiếu nhập: toàn bộ dòng trước / sau). Xóa = chuyển vào thùng rác: bản ghi rời khỏi danh sách đang dùng nên **mọi báo cáo, tồn quỹ, công nợ, file Excel tự động không tính** mà không phải sửa từng báo cáo; khôi phục trả lại đúng bản ghi (giữ id, số thứ tự). Id và số thứ tự của bản ghi trong thùng rác không bao giờ bị cấp lại.
**Cách dùng.** Cài đặt → “Người đang dùng máy này”. Kiểm soát → Nhật ký thay đổi (lọc ngày / thao tác / loại / số bản ghi / từ khóa không dấu; bấm dòng xem trước–sau; bấm số bản ghi xem lịch sử). Nút “Lịch sử” trong form. Kiểm soát → Thùng rác (Khôi phục, Xóa vĩnh viễn, Xóa vĩnh viễn tất cả cần gõ XOA).
**Migrate.** Dữ liệu cũ không có lịch sử: một mục “Khởi tạo từ dữ liệu cũ (nâng cấp từ phiên bản 2 lên 3)” kèm số dòng hiện có và tên bản sao lưu trước nâng cấp. Mở lại nhiều lần vẫn chỉ một mục.
**File.** Mới `lib/audit.js`, `lib/traceApi.js`, `public/js/views/control.js`; sửa `lib/store.js`, `server.js`, `lib/costApi.js`, `public/js/{app,ui,forms,state}.js`, các view có nút xóa.
**Schema.** `trash: [{ id, at, by, kind, label, records, attachments?, group?, phieuId? }]`. Nhật ký ở **file riêng** `data/nhat-ky.jsonl` (không nằm trong ketoan.json).

### 2.2 Trạng thái chứng từ Nháp → Đã ghi sổ
**Mô tả.** Dòng thu chi và phiếu nhập chi phí có thể “Lưu nháp”. Nháp **không tính** vào tồn quỹ, sổ, báo cáo, công nợ NCC, công nợ theo công trình, file Excel xuất; hiện trong sổ với nhãn vàng “Nháp”, cột tồn quỹ “—”. Bộ lọc “Mọi trạng thái / Đã ghi sổ / Nháp” chỉ hiện khi có nháp (người không dùng không thấy thêm gì). Ghi sổ bằng nút ✓ trên dòng hoặc “Ghi sổ” trong form; nhật ký ghi “Ghi sổ (từ nháp)”.
**Cách làm.** Hàm `KT.postedDb(db)` (trong `shared.js`) bỏ dòng nháp; khi không có nháp trả về **chính đối tượng dữ liệu cũ** → số liệu và tốc độ như trước. Ở giao diện: `S.db` = dữ liệu cho báo cáo (bỏ nháp), `S.all` = toàn bộ (dùng khi tìm bản ghi để sửa).
**Schema.** Trường `trangThai: 'nhap'` trên dòng nháp; dòng đã ghi sổ **không có** trường này (dữ liệu cũ mặc định “Đã ghi sổ”, không phải ghi thêm gì).
**File.** `public/js/shared.js`, `server.js`, `lib/costApi.js`, `public/js/{state,forms}.js`, `views/{ledger,cost-ledger,cost-entry}.js`.

### 2.3 Khóa sổ theo tháng
**Mô tả.** Tháng đã khóa: mọi thêm / sửa / xóa / khôi phục / ghi sổ nháp dòng thu chi, dòng chi phí, phiếu nhập bị máy chủ từ chối (HTTP 423) kèm câu hướng dẫn “vào Kiểm soát sổ sách → Khóa sổ, bấm Mở khóa tháng mm/yyyy (cần ghi lý do, có lưu nhật ký)”. “Xóa toàn bộ dữ liệu” bị chặn nếu còn dữ liệu tháng khóa. Nhập Excel: dòng tháng khóa bị **bỏ qua kèm cảnh báo**; chế độ “thay toàn bộ” **giữ nguyên** dữ liệu tháng khóa (và các danh mục chúng dùng). Không khóa được tháng còn dòng nháp. Mở khóa **bắt buộc lý do**, nhật ký ghi lý do và ai đã khóa trước đó.
**Giao diện.** Thẻ Khóa sổ (bảng từng tháng, Khóa / Mở khóa, “Khóa sổ đến hết tháng …” mặc định đề xuất tháng trước); trong sổ dòng tháng khóa có ổ khóa thay nút sửa / xóa; form và phiếu nhập mở ra ở chế độ chỉ xem với dải đỏ giải thích.
**Schema.** `locks: [{ thang: 'yyyy-mm', at, by }]`. **File.** `lib/traceApi.js` (`assertOpen`, API), `server.js`, `lib/costApi.js`, `lib/importer.js`, `lib/costImporter.js`, `public/js/shared.js`, views.

### 2.4 Kiểm tra bất thường + “Cần xử lý”
**Mô tả.** `KT.anomalies(db)` phát hiện: (a) nghi trùng — chi phí cùng ngày + NCC + vật tư (hoặc diễn giải) + thành tiền; sổ thu chi cùng ngày + NCC (hoặc nội dung) + số tiền; (b) đơn giá lệch hơn ngưỡng (mặc định 30%) so với **giá thường mua** cùng vật tư + NCC (trung vị các lần mua khác, ≥ 3 lần; chỉ 2 lần thì so lần trước; bỏ các mã chung “XX-…”); (c) ngày ở tương lai (> 7 ngày), trước năm 2000, hoặc khác xa (> 180 ngày) các dòng nhập liền trước / liền sau theo thứ tự nhập; (d) mã `XX-CHUAXACDINH` và vật tư đang dùng chưa gán hạng mục; (e) chi phí chưa gán hạng mục / mã NCC, dự án, công trình chưa có trong danh mục; (f) nháp để quá N ngày (mặc định 7); (g) thu / chi âm hoặc bằng 0, thành tiền ≤ 0; (h) kiểm quỹ có chênh lệch.
**Cách dùng.** Kiểm soát → Cần xử lý: gom theo loại (nút lọc có số lượng), mỗi mục có **Mở để sửa** (mở đúng form dòng / phiếu / vật tư), **Xem trong sổ** (nghi trùng: sổ lọc đúng ngày, NCC, vật tư), **Bỏ qua** (kèm ghi chú, có nhật ký; “Hiện cả cảnh báo đã bỏ qua” → Theo dõi lại). Chỉnh ngưỡng ngay trên màn hình. Số việc chưa xử lý hiện trên menu và ô “Cần chú ý” ở Tổng quan.
**Schema.** `ignoredWarnings: { key: { at, by, label, note } }`; ngưỡng `settings.nguongLechGia`, `settings.soNgayNhapTon`. Khóa cảnh báo gồm id + giá trị liên quan, nên sửa bản ghi (vd đổi giá) thì cảnh báo cũ đã bỏ qua không che cảnh báo mới.
**File.** `public/js/shared.js`, `lib/traceApi.js`, `server.js`, `public/js/{app,state}.js`, `views/{control,dashboard}.js`.

### 2.5 Đối chiếu tồn quỹ (kiểm quỹ)
**Mô tả.** Nhập số tiền đếm được tại một ngày (hoặc bảng kê số tờ 11 mệnh giá — tự cộng, phải khớp số thực tế), phần mềm tính **tồn quỹ theo sổ** đến hết ngày đó (không tính nháp) và **chênh lệch thừa / thiếu** ngay khi gõ. Lưu biên bản (chụp lại số theo sổ lúc kiểm); bảng lịch sử có thêm “theo sổ hiện nay” (đổi màu nếu sổ bị sửa sau ngày kiểm). **In biên bản kiểm kê quỹ** A4 (theo bố cục mẫu 08a-TT rút gọn, có bằng chữ và chỗ ký) và **xuất Excel** biên bản (có công thức số tờ × mệnh giá, tổng). Chênh lệch khác 0 (tính lại theo sổ hiện tại) nằm trong “Cần xử lý”. Xóa biên bản vào thùng rác.
**Schema.** `cashCounts: [{ id, ngay, thucTe, tonSo, menhGia, nguoiKiem, ghiChu, createdAt, by }]`. **File.** `lib/cashCountApi.js`, `public/js/views/cash-count.js`, `server.js`, `src/styles/app.css` (khung in).

### 2.6 Đính kèm chứng từ
**Mô tả.** Gắn ảnh / PDF vào dòng sổ thu chi, dòng chi phí, hoặc cả phiếu nhập. Chỉ nhận JPG, PNG, WEBP, PDF **nhận dạng theo nội dung file** (không tin đuôi), tối đa 10 MB; tên file trên đĩa do phần mềm đặt `attachments/<yyyy-mm>/<id>-<8 hex>.<đuôi>` (tên người dùng chỉ để hiển thị → không path traversal), ghi bằng cờ `wx` (không bao giờ ghi đè); trả về với `nosniff`, ảnh có CSP `sandbox`. Xem ảnh trong hộp thoại, PDF mở tab mới, tải về, xóa (vào thùng rác). Xóa bản ghi chủ → chứng từ đi theo vào thùng rác, khôi phục cùng. Sửa phiếu nhập (các dòng được tạo lại) → chứng từ ở dòng cũ tự chuyển lên gắn với cả phiếu, không mồ côi. Xóa vĩnh viễn → file chuyển sang `attachments/_da-xoa/` (bản sao lưu cũ vẫn mở được). Kẹp giấy kèm số lượng trong sổ.
**Sao lưu / khôi phục.** Nút mới “Tải bản sao lưu đầy đủ (.zip)” = `ketoan.json` + chứng từ + `nhat-ky.jsonl`. “Khôi phục” nhận `.zip` (chỉ chép file đúng dạng tên và đúng nội dung ảnh/PDF, không ghi đè file đang có) hoặc `.json` như cũ. Các bản sao lưu tự động (.json) vẫn như cũ; file chứng từ nằm cố định trong `data/attachments` nên luôn khớp.
**Schema.** `attachments: [{ id, owner: 'entries'|'costs'|'slips', ownerId, name, file, size, type, sha256, createdAt, by }]`. **File.** `lib/attachApi.js`, `public/js/attach.js`, `server.js` (backup-zip, restore-zip), `lib/traceApi.js`, `lib/costApi.js`, views.

## 3. Kết quả kiểm thử và đối chiếu số liệu

**Số liệu mốc (ca N0).** Trước khi sửa bất cứ gì, chạy `tests/so-lieu-moc.js` bằng mã cũ trên dữ liệu thật hiện tại (`ketoan-v2-hien-tai.json`, chính là dữ liệu đã nhập từ `ChiPhi_CongTrinh_111_ThanhTHuy_OK_FIX.xlsm`) và dữ liệu gốc (`ketoan-v1-goc.json`), lưu `tests/fixtures/moc-so-lieu-nhom1.json`. Ca N0 chạy mã mới (sau nâng cấp schema) và so **từng con số** của: tồn quỹ, sổ thu chi (cả lọc tháng 8), tổng hợp dự án, tổng hợp NCC, 43 phiếu thu/chi, tổng hợp chi phí (theo loại, nhóm, hạng mục, tháng), công nợ NCC, công nợ theo công trình, giá vật tư, phiếu nhập → **giống hệt**. Một số con số chính:

| Chỉ tiêu | Trước | Sau |
|---|---|---|
| Tồn quỹ | 943.000 | 943.000 |
| Tổng thu / tổng chi sổ thu chi | 2.532.577.035 / 2.531.634.035 | như trước |
| Tổng chi phí công trình | 1.129.929.000 (Vật tư 763.957.000, Nhân công 250.000.000, Dịch vụ-Phí 115.972.000) | như trước |
| Theo nhóm: phần thô / điện nước / hoàn thiện / chi phí khác / ban đầu | 1.021.250.000 / 17.303.000 / 49.426.000 / 41.400.000 / 550.000 | như trước |
| Công nợ NCC (tổng): phát sinh / đã trả / còn nợ / ứng dư | 1.129.929.000 / 689.589.000 / 854.186.000 / 413.846.000 | như trước |
| Công nợ theo công trình DATT111: còn nợ / ứng dư | 1.012.626.000 / 127.071.000 | như trước |

Đối chiếu với **Excel tính lại**: ca E2.1 (sẵn có) so dữ liệu đã nhập với số liệu Excel tính lại trong `tai-lieu/DoiChieu_ChiPhi_voi_Excel.md` (tổng 1.129.929.000, từng loại CP, nhóm, hạng mục, công nợ từng NCC) → vẫn **đạt** sau cải tiến; E3.x tính lại mọi công thức của file xuất bằng LibreOffice → đạt. File `.xlsm` gốc **không có trong kho mã** nên không nạp lại trực tiếp được; khi có file, chạy `node tests/doi-chieu-xlsm.js "<đường dẫn>.xlsm"`.

**Nâng cấp và khôi phục.** N1.1 (schema 2 → 3: sao lưu trước giống hệt bản gốc, từng bản ghi không đổi, mở lại 3 lần không nhân đôi, đúng 1 mục khởi tạo); N7.1 (dữ liệu gốc schema 1 nâng thẳng lên 3, số liệu = mốc; khôi phục bản “trước nâng cấp” sau khi đã dùng tính năng mới → được nâng lại, số liệu = mốc, nhật ký giữ đủ); N1.7 (khôi phục không xóa nhật ký; dòng nhật ký ghi dở do mất điện không làm hỏng); B1–B4 cũ vẫn đạt.

**Toàn bộ `npm test`:** trước 96/97 đạt (1 bỏ qua) → cuối **126/127 đạt, 0 lỗi, 1 bỏ qua** (ca `A3` cài thư viện cần mạng, như các lượt trước). Chạy `npm test` sau từng tính năng: F1 105/106, F2 107/109 (sửa 1 lỗi giao diện chân hộp thoại 390 px rồi đạt), F3 113/114, F4 118/119, F5 120/121, F6 126/127 — các “/” còn lại đều là ca bỏ qua.

Các ca cũ phải chỉnh theo thay đổi có chủ đích (không đổi điều được kiểm): B1.1 / B2 (số schema 2 → số schema hiện hành, tên bản sao lưu `truoc-nang-cap-v3`).

## 4. Hiệu năng (20.000 dòng chi phí + 5.000 dòng sổ thu chi, cùng máy, ms)

| Thao tác | Trước | Sau |
|---|---|---|
| Khởi động + nạp dữ liệu 8,7 MB | 384 | 456 |
| Thêm 1 phiếu / sửa 1 dòng / thêm 1 dòng sổ | 298 / 276 / 243 | 243 / 209 / 207 |
| Xóa 1 dòng chi phí / 1 phiếu 4 dòng (nay là xóa mềm + nhật ký) | 347 / 296 | 200 / 263 |
| Khôi phục 1 phiếu từ thùng rác (N7.2) | — | 217 |
| Lọc nhật ký theo từ khóa (≈ 260 mục) / mở thùng rác 60 mục | — | 3 / 2 |
| Rà soát bất thường toàn bộ dữ liệu (N4.4) | — | ~200 (chạy sau khi vẽ màn hình) |
| Mở Sổ thu chi / Sổ chi phí / Tổng quan | 237 / 490 / 63 | 292 / 558 / 44 |
| Xuất Excel chi phí toàn bộ | 8.811 | 7.154 |

Chênh lệch vài chục ms là dao động của máy thử. Nhật ký ghi nối thêm (không ghi lại file lớn); xóa mềm không thêm vòng lọc nào vào báo cáo; không cần thêm chỉ mục (dữ liệu là JSON trong bộ nhớ, không có SQLite).

## 5. Giả định đã tự quyết

1. **Không có SQLite / node:sqlite**: dữ liệu vẫn là file JSON `data/ketoan.json` (như các lượt trước). “Bảng audit_log” được làm bằng file `data/nhat-ky.jsonl` chỉ ghi thêm; “chỉ mục” không áp dụng. Không thêm thư viện nào (JSZip đã có sẵn vì là phụ thuộc của exceljs).
2. **“Dự toán”** không có trong phần mềm (đã bỏ theo yêu cầu trước) nên không liên quan.
3. **Một lần nâng schema (2 → 3) cho cả 6 tính năng**, vì cả nhóm được giao cùng lúc trên một nhánh; mỗi tính năng chỉ thêm trường mới có giá trị mặc định rỗng.
4. **Người thao tác**: phần mềm không có đăng nhập; mỗi máy tự đặt tên (lưu ở trình duyệt), gửi kèm mỗi yêu cầu. Đây là ghi nhận, **không phải xác thực** (người dùng có thể gõ tên khác).
5. **Xóa mềm áp dụng cho từng bản ghi và phiếu**; hai nút “Xóa toàn bộ dữ liệu sổ / chi phí” ở Cài đặt và chế độ “thay toàn bộ” khi nhập Excel vẫn thay hẳn (đã có bản sao lưu tự động ngay trước + mục nhật ký), nhưng không được đụng tới tháng đã khóa.
6. **Dòng nháp vẫn phải hợp lệ** như dòng thường (đủ ngày, mã có trong danh mục, số tiền…), chỉ khác là chưa tính vào sổ.
7. **Khóa sổ không chặn**: đổi tên mã danh mục (mã mới lan cả sang dòng của tháng khóa — chỉ đổi nhãn, không đổi số), thông tin in phiếu, **đính kèm thêm** chứng từ cho dòng tháng khóa (bổ sung hóa đơn nhận muộn); **có chặn** xóa chứng từ của dòng tháng khóa. Khôi phục sao lưu thay luôn danh sách khóa theo bản sao lưu.
8. **Ngày bất thường** không so với ngày nhập máy (dữ liệu nhập từ Excel cũ sẽ bị báo hàng loạt) mà so với các dòng nhập liền trước / liền sau; ngưỡng 180 ngày, tương lai > 7 ngày.
9. **Giá lệch** so với trung vị các lần mua khác (tránh báo qua lại khi giá dao động); bỏ các mã chung `XX-…` (XX-KHAC gom nhiều khoản khác nhau).
10. Biên bản kiểm quỹ theo bố cục mẫu 08a-TT **rút gọn** (không có mục vàng bạc, ngoại tệ); ngày kiểm không được ở tương lai.

## 6. Rủi ro còn lại

- **Nhật ký có thể bị sửa tay** vì là file văn bản trên máy (không ký số). Đủ để truy vết thao tác qua phần mềm, không đủ làm bằng chứng chống chối bỏ.
- **Nhật ký lớn dần**: mỗi thao tác vài KB (phiếu 500 dòng thì lớn hơn). Nhập Excel chỉ ghi 1 mục tóm tắt. Chưa có chức năng lưu trữ / cắt bớt nhật ký cũ.
- Bản phần mềm cũ hơn **không đọc được schema 3** — nếu phải quay về bản cũ, dùng bản sao lưu `truoc-nang-cap-v3`.
- Chứng từ **không nằm trong bản sao lưu tự động .json** (chỉ nằm trong .zip tải về); nếu mất cả thư mục `data/attachments` thì bản .json tự động không cứu được ảnh.
- Các cảnh báo “giá lệch” trên dữ liệu thật khá nhiều (16) vì giá thực tế dao động; người dùng cần Bỏ qua các trường hợp đúng một lần.
- PDF mở bằng trình xem PDF có sẵn của trình duyệt; chưa thử với PDF có mật khẩu / rất lớn.

## 7. Việc chưa làm và lý do

- **Trạng thái “Đã khóa” cho từng phiếu** (Nháp → Đã ghi sổ → Đã khóa): theo phạm vi “sau này”; khóa theo tháng (mục 2.3) đã phủ nhu cầu chính.
- **Không chụp ảnh / quét trực tiếp** từ camera, không nén ảnh: giữ phần mềm nhẹ, không thêm thư viện.
- **Đối chiếu trực tiếp với file `.xlsm`**: file không có trong kho mã (dùng số liệu đã đối chiếu lưu trong `tai-lieu/` và ca E2.1).
- **Kiểm tra trên Windows thật** (in, đường dẫn, khóa file): môi trường làm việc là Linux — xem danh sách tự kiểm tra ở mục 8.

## 8. Việc anh/chị cần tự kiểm tra trên máy Windows

1. Chép bản mới, chạy `KhoiDong.bat` trên **bản sao** của thư mục dữ liệu thật trước; xem `data/backups/` có `…-truoc-nang-cap-v3.json`, Tổng quan vẫn tồn quỹ 943.000 và tổng chi phí 1.129.929.000 như trước.
2. Cài đặt → Người đang dùng máy này; thêm / sửa / xóa thử một dòng → Kiểm soát → Nhật ký thay đổi thấy đủ; Thùng rác khôi phục được.
3. Lưu nháp một phiếu nhập → tổng chi phí không đổi → Ghi sổ → tổng tăng đúng.
4. Khóa sổ tháng 08/2026 → thử sửa một dòng tháng 8 (thấy ổ khóa, form chỉ xem) → Mở khóa phải ghi lý do.
5. Kiểm soát → Cần xử lý: xem lại 3 dòng bê tông BT-M250R7 giá 60.000 (17/06, 03/07, 25/07/2026).
6. Kiểm quỹ: nhập số đếm thực tế, **in biên bản ra máy in thật** (A4 dọc; tắt “Đầu trang và chân trang” trong hộp thoại in), xuất Excel biên bản mở bằng Excel.
7. Đính kèm một ảnh chụp hóa đơn từ điện thoại (JPG) và một PDF; mở PDF bằng Edge/Chrome; kiểm tra thư mục `data\\attachments`.
8. Tải bản sao lưu đầy đủ (.zip), chép sang thư mục khác / máy khác, Khôi phục từ file .zip → ảnh chứng từ xem được.
