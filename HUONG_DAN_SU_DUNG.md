# KẾ TOÁN CÔNG TRÌNH — Hướng dẫn sử dụng

(Tên cũ: Sổ Thu Chi. Logo công ty Điền Thủy hiện ở đầu menu bên trái và màn hình đăng nhập. Giao diện bố cục mới (menu trái, thanh công trình, thanh kỳ), màu nền và chữ Archivo như bản cũ; khung nét mảnh có dấu + ở góc.)

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

Muốn có biểu tượng trên Desktop: bấm đúp **`TaoBieuTuongDesktop.bat`** một lần. Trên Desktop sẽ có biểu tượng **Kế Toán Công Trình** (logo Điền Thủy); từ đó bấm đúp biểu tượng này thay cho `KhoiDong.bat`. Biểu tượng cũ tên “So Thu Chi” (nếu có) được tự bỏ. Dời thư mục phần mềm sang chỗ khác thì bấm lại `TaoBieuTuongDesktop.bat` để tạo lại biểu tượng.

> Nếu bấm `KhoiDong.bat` khi phần mềm đang chạy, nó chỉ mở lại trình duyệt, không chạy thêm bản thứ hai.

> Lần đầu mở bản mới, phần mềm tự nâng cấp dữ liệu cũ lên phiên bản có phần chi phí công trình
> và **tự sao lưu bản cũ** trước (bản sao lưu “Trước khi nâng cấp phần mềm” trong Cài đặt).

> **Từ phiên bản lưu bằng SQLite** (cần **Node.js 24.16.0 trở lên** hoặc **26.1.0 trở lên**): lần đầu mở, phần mềm tự chuyển dữ liệu
> từ `data\ketoan.json` sang `data\ketoan.db`, đối chiếu từng con số (tồn quỹ, tổng thu / chi, từng dự án, từng NCC, chi phí…)
> rồi mới dùng. Cửa sổ đen báo *“Đã chuyển dữ liệu sang SQLite”*; chi tiết đối chiếu ở `data\migrate-bao-cao.txt`.
> File cũ được giữ lại (đổi tên thành `ketoan.json.da-chuyen-sqlite.bak`) và có thêm một bản trong `data\backups`. Xem mục 17.

---

## 2. Khung màn hình và các màn hình (tương ứng với các sheet Excel)

**Khung chung** (giống nhau ở mọi màn hình):

- **Menu bên trái** chia theo trình tự công việc: *Tổng quan* · **Nhập liệu** (Phiếu nhập chi phí, Ghi thu / chi, Số dư đầu kỳ NCC, Nhập từ Excel) ·
  **Sổ sách** (Sổ quỹ thu chi, Phiếu thu / chi, Sổ chi phí, Sổ chi tiết NCC) · **Báo cáo** (Chi phí theo nhóm, Tổng hợp chi phí, Công nợ NCC theo kỳ, Giá vật tư) ·
  **Danh mục** (Công trình nhà/lô, NCC đối tượng, Vật tư hạng mục, Gộp mã) · **Hệ thống** (Kiểm soát, Cài đặt sao lưu, Người dùng). Mỗi mục có biểu tượng riêng; mục Kiểm soát có nhãn số việc cần xử lý (ẩn khi bằng 0).
  Cuối menu là **tồn quỹ hiện tại**, giờ lưu gần nhất và nút thu gọn. **Ctrl B** thu gọn menu (rộng 248px → 56px) chỉ còn logo và biểu tượng, rê chuột vào biểu tượng để xem tên mục; trạng thái này được nhớ theo từng người dùng.
- **Thanh trên cùng**: ô **Công trình** (chọn một công trình thì mọi sổ chi phí, báo cáo, công nợ chỉ hiện công trình đó; chọn “Tất cả công trình” để bỏ lọc), ô **Tìm** toàn cục
  (**Ctrl K**: gõ số phiếu, tên NCC, vật tư, nội dung hoặc số tiền như `45tr`), nút **Nhập phiếu chi phí** (**F2**), nút **Ghi thu / chi** (**F3**), và (khi bật đăng nhập) tên người dùng + nút khóa màn hình (**Ctrl L**).
  Trên điện thoại, menu bên trái được thay bằng thanh 5 nút ở đáy màn hình (Tổng quan, Sổ quỹ, Ghi, Công nợ, Thêm).
- **Chọn kỳ** giống nhau ở mọi sổ và báo cáo: **Tháng | Quý | Năm | Khoảng ngày | Toàn bộ**, mũi tên ‹ › để sang kỳ trước / sau, nhãn ghi rõ “Tháng 09/2026 · 01/09 – 30/09/2026”.
- **Mật độ bảng Gọn / Thoáng** (lưu theo từng máy), dòng tổng luôn hiện ở đáy bảng, nút thao tác ở từng dòng luôn hiện rõ theo thứ tự **Xem → Sửa → Nhân bản → In → Xóa** (xóa luôn ở cuối, màu đỏ, vào Thùng rác).
- **Phím trên dòng đang chọn** (bấm Tab tới dòng): **Enter** mở / sửa · **Ctrl D** nhân bản · **Delete** xóa · **Ctrl P** in phiếu.
- **Nhân bản luôn hỏi trước và chưa lưu gì**: bấm Nhân bản (dòng sổ quỹ, dòng chi phí, phiếu nhập chi phí) hoặc **Ctrl D** thì hiện hộp thoại tóm tắt dữ liệu sắp chép. Bấm **Hủy** thì không có gì xảy ra; bấm **Nhân bản và mở trang nhập** thì mở trang nhập đã điền sẵn dữ liệu để bạn kiểm tra, sửa, rồi tự bấm **Ghi sổ**. Nhờ vậy lỡ bấm nhầm cũng không sinh ra dòng thừa.
- Tháng đã **khóa sổ**: nút sửa / xóa của dòng thuộc tháng đó thành ổ khóa; bấm vào thì hiện hộp “Kỳ … đã khóa” giải thích và chỉ đường mở khóa (cần tài khoản Chủ và lý do).
- **Quy ước công nợ**: **Dư Có = mình còn phải trả NCC**; **Dư Nợ = mình đã ứng trước / trả dư**. Công nợ không bao giờ hiện số âm; số dư lũy kế ghi kèm chữ Có / Nợ (Nợ màu vàng nâu).
  Nhãn **Còn nợ** là trạng thái bình thường (màu xanh thép, không đỏ); **Ứng dư** màu vàng nâu; **Đã tất toán** màu xanh lá; phiếu / dòng **Nháp** có viền đứt.

| Màn hình | Sheet Excel tương ứng | Làm được gì |
|---|---|---|
| **Tổng quan** | `Tong_Quan` | Đẳng thức tồn quỹ (đầu kỳ + thu − chi = hiện tại), biểu đồ thu / chi theo ngày, chi phí theo dự án so với ngân sách, **Cần chú ý hôm nay** (mỗi mục có nút đi thẳng tới nơi xử lý), ghi gần đây, thẻ chi phí công trình. |
| **Sổ quỹ thu chi** | `So_Thu_Chi_Hang_Ngay` | Ghi / sửa / xóa / nhân bản / in dòng thu chi. Tồn quỹ tự tính lũy kế. Lọc theo kỳ, dự án, NCC, thu / chi, trạng thái (Nháp), tìm kiếm. Tích chọn nhiều dòng để **Ghi sổ các dòng nháp** hoặc **Xóa** cùng lúc. |
| **Phiếu thu / chi** | `Phieu_Chi` | Các dòng cùng **số phiếu** được gộp thành 1 phiếu. Danh sách bên trái, xem trước **2 liên trên 1 tờ A4** ở giữa, nội dung in bên phải. **Ctrl P** in. Số phiếu **PT** là phiếu thu, **PC** là phiếu chi. |
| **Công trình, nhà/lô** | `Danh_Muc_Du_An`, `DM_CONGTRINH` | Mã, tên, ngân sách, trạng thái, ngày khởi công; đã chi, còn lại. Nút **Sổ chi phí** của công trình. Công trình đã có dòng thì nút Xóa mờ đi và chỉ dẫn dùng **Gộp mã**. |

**Chọn nhiều dòng ở danh mục** (Công trình, NCC, Vật tư, Hạng mục, Nhà/khu): tích ô đầu dòng, thanh **Đã chọn N** hiện phía trên bảng với nút **Gộp mã N**, **Xóa N** và **Bỏ chọn**. Xóa nhiều chỉ xóa các mã chưa có dòng nào (vào Thùng rác); mã đang dùng được giữ lại và phần mềm nêu rõ mã nào không xóa được.

**Sửa trực tiếp trong Sổ chi phí**: bấm đúp một ô để sửa; **Tab** lưu ô đó rồi sang ô kế tiếp cùng dòng, **Shift+Tab** quay lại ô trước, **Enter** lưu và đóng, **Esc** bỏ. Ô không đổi thì không ghi gì.
| **NCC, đối tượng** | `Danh_Muc_NCC`, `DM_NCC` | Mã, tên, loại, SĐT, địa chỉ (in tự động lên phiếu). Nút **Sổ chi tiết công nợ** ở mỗi dòng. |
| **Số dư đầu kỳ NCC** | (mới) | Mọi khoản số dư đầu kỳ đã nhập, cột Dư Có / Dư Nợ; thêm, sửa, xóa. Xem mục 12. |
| **Nhập từ Excel** | — | Chọn file Excel (thu chi hoặc chi phí), xem trước, rồi mới ghi. |
| **Cài đặt, sao lưu** | — | Tên đơn vị, địa chỉ, tên Giám đốc / Kế toán trưởng / Thủ quỹ (in trên phiếu); xuất Excel; sao lưu / khôi phục; xóa dữ liệu; đăng nhập và phân quyền. |

Nhóm **Chi phí công trình**:

| Màn hình | Sheet Excel tương ứng | Làm được gì |
|---|---|---|
| **Tổng hợp chi phí** | `TONGHOP` | Tổng chi phí; theo loại Vật tư / Nhân công / Dịch vụ-Phí; đã trả, còn nợ NCC; bảng Nhóm → Hạng mục bung / thu gọn; chi phí theo tháng và lũy kế. |
| **Phiếu nhập chi phí** (**F2**) | `PHIEU_NHAP` + macro `GhiPhieuNhap` | Đầu phiếu nhập một lần (Ngày, Công trình mặc định, Nhà/lô, NCC, Số phiếu — không còn chọn hạng mục), rồi nhập nhiều dòng Mã VT × Số lượng × Đơn giá (hoặc chỉ Thành tiền cho khoản khoán). Dòng có **lỗi** (đỏ, chặn ghi sổ) hoặc **cảnh báo** đơn giá lệch (vàng, có nút “Dùng giá cũ” / “Giữ”). **Ctrl Enter** ghi sổ, **Ctrl S** lưu nháp, **Ctrl D** nhân bản dòng. Danh sách phiếu đã nhập có Sửa / Nhân bản / **In** / Xóa. |
| **Sổ chi phí** | `NHATKYCHUNG` | Toàn bộ dòng chi phí; lọc theo kỳ, nhà/lô, nhóm, hạng mục, loại CP, NCC, vật tư (ô đang lọc đổi màu, có nhãn “Đang lọc” và nút Xóa lọc); tìm kiếm; sửa trực tiếp trong bảng; dòng tổng cuối bảng, số lượng nhiều đơn vị gom vào nút **“6 ĐVT”**. |
| **Chi phí theo nhóm** | `CHI_TIET_THEO_NHOM` | Nhóm → Hạng mục → từng dòng, 3 mức hiển thị, **Bung hết / Thu gọn**, nút **Xem trong sổ** ở từng nhóm, hạng mục. |
| **Công nợ NCC theo kỳ** | `CONGNO_NCC` + `Tong_Hop_NCC` | Gộp “Tổng hợp NCC” và “Công nợ NCC”: theo từng NCC **Số dư đầu kỳ (Dư Nợ | Dư Có) · Phát sinh · Thanh toán · Số dư cuối kỳ (Dư Nợ | Dư Có) · Tình trạng · Giao dịch gần nhất**; bấm nhãn Tất cả / Còn nợ / Ứng dư / Đã tất toán để lọc; bấm một dòng để mở hàng thao tác (Sổ chi tiết, Biên bản đối chiếu, Sổ chi phí / Sổ thu chi của NCC, Số dư đầu kỳ, Trả từ nguồn khác, Ghi phiếu chi). Xem theo công trình bằng nút **Theo công trình**. Đường dẫn cũ “Tổng hợp NCC” cũng mở màn này. |
| **Sổ chi tiết NCC** | (mới) | Một NCC: số dư đầu kỳ, **từng chứng từ** (mỗi phiếu nhập một dòng, bấm để bung các dòng hàng; khoản chi sổ quỹ và khoản trả ngoài quỹ nền xanh nhạt), số dư lũy kế kèm Có / Nợ, dòng cộng cuối bảng. **Alt ↑ ↓** chuyển NCC khác. Nút **Ghi thanh toán**, **Biên bản đối chiếu**, In sổ. |
| **Biên bản đối chiếu công nợ** | (mới) | A4 dọc, đen trắng: đầu đơn vị, quốc hiệu, Bên A / Bên B, bảng 4 mục (đầu kỳ + phát sinh − thanh toán = cuối kỳ), bằng chữ, bảng kê chứng từ có lũy kế, điều khoản 07 ngày, chỗ ký. Xem trước rồi bấm **In biên bản**. |
| **Giá vật tư** | (mới) | Lịch sử đơn giá từng vật tư theo NCC, giá thấp / cao / gần nhất, biểu đồ giá; mỗi dòng có nút mở phiếu nhập, xem trong sổ chi phí, sửa đơn giá. |
| **Vật tư, hạng mục** | `DM_NHOM`, `DM_HANGMUC`, `DM_VATTU`, `DM_NHA` | Danh mục chi phí: tab **Vật tư** (cây nhóm chi phí → hạng mục bên trái, bảng vật tư bên phải) và tab **Nhà / khu**. |

Mục **Kiểm soát** (con số màu vàng = số việc cần xử lý): **Cần xử lý**, **Kiểm quỹ**, **Khóa sổ**,
**Nhật ký thay đổi**, **Thùng rác** — xem mục 16.

> **Phím tắt đổi so với bản trước**: **F2** giờ là *Nhập phiếu chi phí* và **F3** là *Ghi thu / chi* (bản cũ ngược lại). **Alt + N** vẫn mở Ghi thu / chi.

> **Mất kết nối**: nếu cửa sổ đen bị tắt, đầu trang hiện dải đỏ “Phần mềm đã bị tắt, hãy mở lại bằng biểu tượng trên màn hình”, màn hình cũ mờ đi; phần mềm tự thử nối lại mỗi 5 giây.
> **Chỉ xem**: tài khoản vai trò Chỉ xem thấy dải xám có ổ khóa, các nút thêm / sửa / xóa được ẩn.

---

## 3. Ghi sổ nhanh

- Bấm **Ghi thu / chi** (hoặc phím **F3**): mở **trang Ghi thu / chi** (không còn là hộp thoại). **Hủy** hoặc **Esc** quay lại màn hình trước; ghi sổ xong cũng tự quay lại.
  Ô **Ngày** luôn mặc định là **hôm nay**, kể cả sau khi vừa ghi một phiếu ngày khác hoặc rời trang rồi mở lại.
  Bắt buộc chọn **Nhà cung cấp, đối tượng** (đầu phiếu) và **Công trình** cho **từng dòng**; thiếu thì phần mềm báo ngay tại ô và chưa ghi.
  Người nộp quỹ, thợ, chủ nhà… cũng thêm vào danh mục NCC, đối tượng. Khoản chung hay văn phòng thì chọn công trình chung (ví dụ VP).
  **Cảnh báo NCC – công trình**: khi khoản chi cho một NCC (đã có chi phí ở công trình khác) ghi vào công trình mà NCC đó **chưa có chi phí**, phần mềm làm hai việc. Không chặn, vì có thể là tạm ứng trước khi có hóa đơn.
  - Ngay ở dòng hiện chữ vàng “NCC này chưa có chi phí ở công trình này”.
  - Khi bấm Ghi sổ thì hỏi lại: **Xem lại** để sửa công trình, **Vẫn ghi** nếu đúng như vậy.
- Chọn **Chi tiền / Thu tiền / Thu & chi cùng lúc** (loại thứ ba dùng cho các khoản "đã thanh toán trước, thực tế không có thu" như trong file cũ).
- **Ngày** luôn nhập dạng ngày/tháng/năm: gõ `29/9` là đủ (tự hiểu năm nay), hoặc `29/09/2026`, `290926`. Phím ↑ ↓ để tăng/giảm 1 ngày.
- **Số phiếu tự đánh**: phiếu mới tự có số kế tiếp theo trang **Đánh số chứng từ** (mặc định `PC045/09` cho phiếu chi, `PT022/09` cho phiếu thu, `UNC013/09` cho ủy nhiệm chi). Ô chọn cạnh số phiếu đổi giữa **Phiếu chi** (tiền mặt) và **Ủy nhiệm chi** (chuyển khoản).
  - Số tự đổi theo ngày chứng từ và theo Chi / Thu. Muốn dùng số khác thì bấm vào ô rồi gõ (số cũ được chọn sẵn nên gõ là thay); từ đó số không tự đổi nữa.
  - **Số mới** quay lại số tự đánh. Khi ghi, phần mềm lấy lại số mới nhất, phòng trường hợp số vừa bị một phiếu khác dùng.
  - Nhiều dòng dùng chung một số phiếu sẽ được gộp khi in.
- **Phiếu nhiều dòng**: phần trên của form là thông tin chung của cả phiếu (ngày, số phiếu, nhà cung cấp / đối tượng, người nhận, ghi chú); bên dưới là bảng **Các dòng của phiếu**, mỗi dòng có **Nội dung · Dự án · Mã vật tư · Số tiền** riêng. Ví dụ chi cho ông A 100 triệu nhưng muốn tính cho 5 công trình: chọn ông A, bấm **Thêm dòng** (hoặc Enter ở ô cuối của dòng cuối) cho đủ 5 dòng, mỗi dòng chọn một dự án và nhập 20tr. Ô Dự án hiện luôn **số NCC còn nợ tại dự án đó** để chia cho đúng; dưới bảng là tổng phiếu. Nội dung dòng để trống thì lấy theo dòng đầu. Mỗi dòng là một dòng sổ cùng số phiếu nên **Công nợ NCC theo công trình** giảm đúng từng dự án (phiếu không gắn dự án thì công trình vẫn còn nợ). Ghi sổ ghi **cả phiếu trong một lần**: một dòng sai thì không ghi dòng nào và báo rõ “Dòng N”. Bấm × cuối dòng để bỏ dòng.
- **Sửa phiếu nhiều dòng**: mở một dòng của phiếu từ Sổ quỹ, bấm liên kết **Sửa cả phiếu (N dòng)** để sửa, thêm, bỏ dòng cùng lúc (dòng bỏ khỏi phiếu vào Thùng rác).
- **Mã dự án / Mã NCC**: gõ mã **hoặc gõ tên** rồi chọn trong danh sách gợi ý. Nếu chưa có, bấm “thêm mới” ngay trong form.
- **Mã vật tư** (không bắt buộc, chỉ khi Chi tiền, mỗi dòng một mã): chọn vật tư mà phiếu chi này trả tiền — gõ mã **hoặc tên**, dưới ô hiện tên và đơn vị tính. Mã được lưu trong dòng sổ, hiện ở Sổ quỹ (dòng “Vật tư: …”), ở danh sách dòng của Phiếu thu / chi, trên **phiếu in 2 liên** (dòng “Vật tư:”), trong file Excel sổ thu chi (cột **Mã Vật Tư**, nhập lại được) và tìm kiếm được. Vật tư chưa có thì thêm ở Danh mục › Vật tư trước. Đổi mã vật tư thì dòng sổ đi theo; vật tư đã có dòng sổ không xóa được (dùng Gộp mã).
- Khi chọn nhà cung cấp có chi phí công trình, dưới ô hiện luôn **công nợ còn lại** (theo dự án đang chọn) và nút **Điền số này**.
- **Số tiền** gõ được: `1.250.000`, `1250000`, `50tr`, `1,5tr`, `300k`, hoặc phép tính `58000+11000` (giống cách ghi công thức trong Excel cũ). Cách ghi dính như `2tr5` hoặc `1tr250k` bị từ chối (phần mềm không đoán ý) — hãy viết `2,5tr` hoặc `1tr+250k`. Bên dưới hiện luôn số tiền bằng chữ để đối chiếu.
- Bấm **Ghi sổ** (hoặc **Ctrl + Enter**) để ghi vào sổ; **Esc** để đóng. Nút **Ghi sổ và ghi tiếp** giữ lại ngày, NCC và để trống các dòng. Số phiếu đang tự đánh thì sang số kế tiếp (phiếu mới); số gõ tay thì giữ nguyên, để ghi thêm dòng vào cùng phiếu.
- Nếu còn thiếu hoặc sai (chưa có nội dung, số tiền không hợp lệ, mã chưa có trong danh mục...), lời nhắc **hiện ngay dưới ô bị sai** và con trỏ nhảy vào ô đó; sửa xong lời nhắc tự mất.
- Dòng vừa ghi hoặc vừa sửa được **tô vàng** trong sổ vài giây để dễ kiểm tra lại.
- Bấm đúp vào một dòng trong sổ để sửa.

**Ô lọc gõ tìm.** Ở mọi màn hình, ô lọc / ô chọn **dự án, công trình, nhà, nhà cung cấp, nhóm chi phí, hạng mục, vật tư** đều là ô
gõ tìm (không còn danh sách thả xuống), dùng giống ô Mã NCC ở trên: gõ vài chữ của mã hoặc tên, danh sách gợi ý hiện ra, **chọn
một gợi ý là lọc ngay**; hoặc gõ đủ mã (chữ hoa hay thường đều được) / đúng tên rồi **Enter**. Gõ không khớp mục nào thì phần mềm
báo và giữ bộ lọc cũ. Xóa trắng ô rồi Enter (hoặc bấm dấu × trong ô) để bỏ lọc. Gõ “(Chưa gán dự án)”, “(Chưa gán NCC)”,
“(Không gán nhà)” (có sẵn trong gợi ý) để lọc các dòng chưa ghi mã. Ô nhóm chi phí và hạng mục hiện **tên**, các ô khác hiện **mã**
(rê chuột lên ô để xem tên). Các ô chọn có ít lựa chọn cố định (kỳ, loại CP, sắp xếp, trạng thái…) vẫn là danh sách chọn.

---

## 4. In phiếu thu / chi

1. Vào **Phiếu thu / chi**, chọn phiếu ở danh sách bên trái (hoặc bấm vào số phiếu trong sổ).
2. Kiểm tra bản xem trước. Có thể sửa riêng cho phiếu: ngày in, người nhận, địa chỉ, lý do, hình thức, số chứng từ kèm theo
   (để trống = tự lấy từ sổ và danh mục). Bấm **Lưu thông tin phiếu** để ghi nhớ.
3. Bấm **In phiếu (2 liên)** — in ra 1 tờ A4 dọc gồm Liên 1 (lưu) và Liên 2 (giao khách) có đường cắt.

Tên Giám đốc, Thủ quỹ… in dưới chữ ký được đặt trong **Cài đặt & dữ liệu**. Phiếu thu/chi chỉ có chỗ ký Giám đốc, người nộp/nhận tiền và Thủ quỹ (không có Kế toán trưởng).

---

## 4a. Đánh số chứng từ

Menu **Hệ thống › Đánh số chứng từ**. Bảng gồm 5 loại: Phiếu thu (PT), Phiếu chi (PC), Ủy nhiệm chi (UNC), Mua vật tư, dịch vụ (MH, là số phiếu nhập chi phí) và Biên bản đối chiếu (ĐC-).

- Số chứng từ = **Tiền tố** + số thứ tự đệm 0 cho đủ **Độ dài** + **Hậu tố**. Ví dụ PC + 045 + /09 = `PC045/09`.
- Hậu tố dùng các mẫu sau, lấy theo ngày chứng từ:
  - `MM` tháng, `YYYY` / `YY` năm, `DD` ngày;
  - `NCC` là mã nhà cung cấp.
- Hậu tố có `MM` thì mỗi tháng số chạy lại từ 1. Chỉ có năm thì mỗi năm chạy lại. Không có mẫu ngày thì chạy liên tục.
- **Số tiếp theo** = số lớn nhất đã dùng trong kỳ + 1. Xóa phiếu cuối thì số đó được dùng lại. Muốn bắt đầu từ số lớn hơn (ví dụ tiếp nối sổ giấy), bấm biểu tượng bút ở dòng đó, sửa ô **Số tiếp theo**. Số này chỉ áp dụng cho kỳ hiện tại và không được nhỏ hơn số đã dùng.
- Biên bản đối chiếu không có số thứ tự. Mặc định số là `ĐC-<tháng>/<năm cuối kỳ đối chiếu>-<mã NCC>`, ví dụ `ĐC-09/2026-XT`.
- Quy tắc:
  - Phiếu thu phải bắt đầu bằng **PT**, và các loại khác thì không, vì phần mềm nhận phiếu thu nhờ chữ PT.
  - Mỗi loại một tiền tố riêng.
  - Hậu tố của loại có số thứ tự phải bắt đầu bằng dấu `/` hoặc `-`, để không dính vào số.
- Chỉ tài khoản Chủ đổi được (khi bật đăng nhập). Đổi cách đánh số không sửa số của các phiếu đã ghi.

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

**Nhập liệu → Nhập từ Excel**: chọn file theo mẫu cũ (hoặc file xuất từ phần mềm).
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
2. Mỗi chuyến hàng / mỗi hóa đơn: vào **Phiếu nhập chi phí** (phím **F2**), khai báo đầu phiếu rồi nhập từng dòng.
3. Mỗi lần trả tiền NCC: ghi **phiếu chi** trong **Sổ thu chi** như cũ, nhớ chọn **đúng Mã NCC và Mã dự án** —
   công nợ tự trừ.
4. Xem **Tổng hợp chi phí**, **Chi tiết theo nhóm**, **Công nợ NCC** bất cứ lúc nào; số liệu luôn tính lại ngay.

---

## 10. Phiếu nhập chi phí

- **Đầu phiếu**: Ngày, Nhà cung cấp, Số phiếu. Công trình, Nhà / khu ghi ở từng dòng; hạng mục lấy theo vật tư.
  Phiếu mới (và phiếu nhân bản) tự có **số phiếu mua vật tư, dịch vụ** theo trang Đánh số chứng từ, mặc định `MH0210/10`. Muốn ghi số phiếu giao hàng / số chuyến thì bấm vào ô rồi gõ đè; **Số mới** quay lại số tự đánh.
  Ô **Ngày** mặc định là **hôm nay**. Chọn ngày khác thì giữ trong lúc đang nhập phiếu đó; rời trang rồi quay lại (hoặc mở lại phần mềm) thì ngày trở về hôm nay, các dòng đang nhập dở vẫn còn.
- **Các dòng hàng**: Mã VT → tự hiện **Tên vật tư, ĐVT**; gõ Số lượng, Đơn giá → **Thành tiền tự tính**, tổng phiếu
  và số tiền bằng chữ hiện ở cuối bảng.
  - Gõ mã hoặc **gõ đúng tên vật tư** đều được. Danh sách gợi ý đưa vật tư của hạng mục đang chọn lên đầu.
  - **Gợi ý đơn giá**: chọn mã VT xong, ô đơn giá tự điền giá **lần mua gần nhất của vật tư đó với NCC này**
    (chữ xanh nghiêng; nếu NCC này chưa bán thì lấy giá gần nhất của NCC khác). Gõ đè để đổi.
  - Số lượng nhận `2,5` / `2.5` / `1.000` / `10+5` / `3*2,5`. Đơn giá nhận `1.250.000`, `50tr`, `1,5tr`, `300k`, `58000+11000`.
  - Khoản không có mã vật tư (nhân công, phí, thuế): bỏ trống Mã VT, ghi **Diễn giải**.
  - **Chỉ biết tổng tiền (theo khoản)** — nhân công, phí, hoặc hóa đơn bán lẻ nhiều món chỉ muốn ghi tổng: để trống Số lượng
    và Đơn giá, gõ thẳng vào ô **Thành tiền** (nhận `12tr`, `7.099.000`…), ghi nội dung ở Diễn giải (vd “HĐ điện nước Minh
    17/8”). Dòng được lưu **đúng như vậy**: Số lượng, Đơn giá để trống (phần mềm KHÔNG tự gán Số lượng 1). Sổ chi phí hiện
    “theo khoản” ở cột Đơn giá; tổng tiền, công nợ, báo cáo và file Excel tính theo Thành tiền. Dòng theo khoản không được
    tính vào thống kê / lịch sử / gợi ý đơn giá vật tư (vì không có đơn giá).
  - **Biết số lượng và tổng tiền**: gõ Số lượng và Thành tiền, Đơn giá tự tính (= Thành tiền ÷ Số lượng). Chia không chẵn
    đồng thì ô Đơn giá để trống (chữ “tự tính”), khi lưu phần mềm tính đơn giá tới 2 số lẻ sao cho Số lượng × Đơn giá đúng
    bằng Thành tiền.
  - **Nhóm › Hạng mục**: không chọn tay nữa. Mỗi dòng phải có **mã vật tư**; cột Nhóm › Hạng mục tự hiện nhóm chi phí và hạng mục đã gắn cho vật tư ở Danh mục › Vật tư, không sửa được ở phiếu (nhờ vậy một vật tư không bao giờ nằm ở hai hạng mục / hai nhóm). Nhân công, phí, hóa đơn bán lẻ… cũng tạo thành vật tư (ví dụ “Nhân công thợ nề”, ĐVT công) gắn hạng mục tương ứng; vật tư chưa có thì bấm **Thêm** ngay ở dòng, ô Hạng mục trong hộp thêm vật tư là bắt buộc. Dòng cũ không có vật tư vẫn giữ hạng mục đã lưu khi sửa lại phiếu.
  - **Loại CP** (Vật tư / Nhân công / Dịch vụ-Phí…) không chọn ở phiếu nhập: tự xác định theo vật tư (loại mặc định của vật tư, nếu không có thì theo hạng mục).
    hạng mục tên “Nhân công…” → Nhân công; có mã VT → Vật tư; không có mã VT → Dịch vụ-Phí) hoặc chọn tay.
  - Mã chưa có trong danh mục: ô báo đỏ kèm nút **Thêm** để thêm nhanh ngay trong phiếu.
- **Phím tắt**: **Enter** sang ô kế tiếp (Mã VT → Diễn giải → Số lượng → Đơn giá → dòng sau; Đơn giá để trống thì
  sang ô Thành tiền rồi mới sang dòng sau), **↑ ↓** đổi dòng,
  **Ctrl + Delete** xóa dòng, **Ctrl + Enter** lưu phiếu. Gõ vào dòng cuối là tự thêm dòng mới.
- **Ghi vào sổ chi phí**: giống macro `GhiPhieuNhap` — các dòng được ghi vào Sổ chi phí, phần hàng và số phiếu được xóa trắng,
  đầu phiếu giữ lại để nhập chuyến tiếp theo. Phiếu đang nhập dở được giữ lại nếu lỡ chuyển sang màn hình khác.
- **Một phiếu, nhiều công trình**: một nhà cung cấp thường giao hàng cho nhiều công trình trong cùng một chuyến. Bảng dòng có cột **Công trình**: để trống thì dòng thuộc công trình ở đầu phiếu (**Công trình mặc định**); ghi mã hoặc tên công trình thì dòng đó tính cho công trình ấy. Nếu mọi dòng đều ghi công trình riêng thì đầu phiếu được để trống công trình. Mỗi dòng vẫn là một dòng chi phí nên **Công nợ NCC theo công trình**, Sổ chi phí và báo cáo tách đúng từng công trình. Enter ở ô Thành tiền đưa con trỏ xuống ô Công trình của dòng sau (khi phiếu có dòng nhiều công trình). Nhà / khu của đầu phiếu chỉ áp cho công trình đầu phiếu; dòng thuộc công trình khác không gán nhà / khu. Mở lại phiếu thì công trình có nhiều dòng nhất lên đầu phiếu, các dòng còn lại hiện công trình riêng; danh sách phiếu đã nhập ghi “+N công trình”; phiếu in thêm cột Công trình.
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
    để **sửa ngay trong bảng** (Enter lưu, Esc bỏ). Sửa Thành tiền thì giữ Số lượng, Đơn giá được tính lại. **Xóa trống** ô Số lượng hoặc Đơn giá thì dòng thành “theo khoản”
    (giữ nguyên Thành tiền) — dùng để sửa các dòng cũ đã bị lưu Số lượng 1 × Đơn giá = Thành tiền. Nút bút chì mở form sửa đủ các cột; nút nhân bản, xóa ở cuối dòng;
    nút phiếu mở cả phiếu nhập chứa dòng đó.
  - Đổi ngày / công trình / nhà / NCC / số phiếu của riêng một dòng thì dòng đó tự tách thành phiếu riêng.
- **Chi tiết theo nhóm**: chọn mức **1** (chỉ tổng nhóm), **2** (thêm cộng hạng mục), **3** (toàn bộ chi tiết);
  bấm vào dòng nhóm / hạng mục để bung, thu gọn từng khối.

---

## 12. Công nợ, giá vật tư

- **Nợ và đã thanh toán theo công trình**: ở màn **Công nợ NCC theo kỳ** bấm nút **Theo công trình** (và cuối màn Tổng hợp chi phí): mỗi công trình một dòng gồm
  Chi phí phát sinh, **Đã thanh toán NCC**, % đã thanh toán, **Dư Có (còn phải trả)** (kèm số NCC), **Dư Nợ (đã ứng trước)** và Chi khác
  (khoản chi có mã dự án nhưng không ghi NCC). Dư Có và Dư Nợ cộng theo từng NCC: NCC này ứng trước không bù cho NCC khác
  còn nợ. Bấm một công trình để chọn công trình đó ở thanh trên và xem công nợ từng NCC của công trình. Nếu có khoản trả cho NCC công trình mà chưa ghi mã
  dự án, phần mềm nhắc ngay dưới bảng.
- **Số dư đầu kỳ nhà cung cấp** — công nợ đã có **trước khi ghi sổ trong phần mềm** (vd còn nợ từ năm trước theo biên bản đối
  chiếu, hoặc đã ứng trước cho thợ). Nhập ở menu **Nhập liệu → Số dư đầu kỳ NCC** (thấy mọi khoản), nút **Số dư đầu kỳ** ở đầu màn **Công nợ NCC theo kỳ**,
  hoặc nút **Số dư đầu kỳ** ở hàng thao tác của một NCC; sửa ở nút bút chì ngay trên dòng “Số dư đầu kỳ” của **Sổ chi tiết NCC**. Mỗi khoản gồm:
  - **Nhà cung cấp**, **Công trình** (để trống nếu nợ chung nhiều công trình; ghi công trình thì công nợ theo công trình đúng);
  - **Số dư là**: “Mình còn nợ nhà cung cấp” (Dư Có) hoặc “Mình đã ứng trước / trả dư (NCC đang giữ tiền)” (Dư Nợ), và **Số tiền**;
  - **Tính đến đầu ngày**: thường là ngày bắt đầu ghi sổ trong phần mềm (phần mềm gợi ý ngày sớm nhất có trong sổ). Báo cáo đến ngày
    trước ngày này thì chưa tính khoản này;
  - **Ghi chú** (vd số biên bản đối chiếu).
  Một NCC có thể có nhiều khoản (vd mỗi công trình một khoản). Số dư đầu kỳ **không** phải chi phí phát sinh, không vào Sổ thu chi,
  không đổi tồn quỹ; sửa / xóa được (xóa thì vào Thùng rác), tôn trọng khóa sổ, ghi nhật ký, đi theo khi đổi mã / gộp mã NCC, công trình.
- **Công nợ NCC theo kỳ**: chọn kỳ ở thanh chọn kỳ; mỗi NCC một dòng:
  - **Số dư đầu kỳ** = số dư đầu kỳ nhập tay + chi phí trước ngày đầu kỳ − thanh toán trước ngày đầu kỳ, hiện ở cột **Dư Nợ (đã ứng trước)** hoặc **Dư Có (còn phải trả)**;
  - **Phát sinh** = chi phí trong Sổ chi phí công trình trong kỳ;
  - **Thanh toán** = Sổ thu chi (chi trừ thu lại của cùng Mã NCC) + khoản trả từ nguồn khác, ngoài quỹ (dòng nhỏ “ngoài quỹ …”);
  - **Số dư cuối kỳ** = Đầu kỳ + Phát sinh − Thanh toán, ở cột Dư Có (còn nợ) hoặc Dư Nợ (ứng dư). Công nợ chỉ có hai trạng thái dương / âm nên **không hiện số âm**.
  Dòng phương trình trên đầu bảng cộng cả kỳ (đầu kỳ Có / Nợ, phát sinh, thanh toán, cuối kỳ Dư Có và Dư Nợ). Công trình chọn ở thanh trên áp dụng cho cả bảng.
  Đánh dấu **Chỉ NCC có số liệu** để ẩn NCC không có đầu kỳ / phát sinh / thanh toán. Nút **Tất cả / Còn nợ / Ứng dư / Đã tất toán** (kèm số lượng) lọc nhanh theo tình trạng.
  **Lọc theo NCC** (chọn được **nhiều** NCC): ở ô “NCC”, gõ mã hoặc tên — có dấu hay không dấu, hoa hay thường đều được — rồi chọn trong danh sách gợi ý
  dạng “mã – tên” (↑ ↓ để di chuyển, Enter để chọn). Mỗi NCC đã chọn hiện thành một **chip** “Đang lọc: …”; bấm × bỏ riêng NCC đó, **Xóa lọc** bỏ hết.
  Bộ lọc được **nhớ** khi chuyển màn hình. **In** và **Xuất Excel** (sheet `Tong_Hop_NCC` có 4 cột Số dư đầu kỳ, Phát sinh trong kỳ, Thanh toán trong kỳ, Số dư cuối kỳ) đúng theo kỳ.
  Cuối kỳ luôn bằng “Còn lại” tính đến ngày cuối kỳ, và bằng số dư cuối ở **Sổ chi tiết NCC**.
  - **Trả tiền** (ghi phiếu chi trong sổ thu chi, điền sẵn NCC và số còn nợ) và **Nguồn khác** (khoản trả ngoài quỹ) có ngay ở từng dòng còn nợ.
  - **Sổ chi tiết** (Enter trên dòng): xem từng phiếu nhập, từng khoản thanh toán; **Biên bản đối chiếu** in gửi NCC ký xác nhận.
  - Bấm một NCC để xem các phiếu chi phí và các lần trả tiền; nút **Trả tiền / Ghi phiếu chi** mở sẵn form ghi chi
    trong Sổ thu chi với đúng NCC, dự án và số còn nợ.
  - **Trả từ nguồn khác (ngoài quỹ)** — khi NCC đã được trả bằng tiền KHÔNG thuộc quỹ tiền mặt do thủ quỹ quản lý
    (công ty chuyển khoản, chủ nhà / chủ đầu tư trả thẳng cho thợ, giám đốc trả…), nên không thể ghi phiếu chi vào Sổ thu chi:
    bấm nút **Nguồn khác** ở dòng NCC (hoặc **Trả từ nguồn khác** trong khung chi tiết). Form điền sẵn NCC, công trình đang lọc
    và số còn nợ; ghi **Ngày trả**, **Số tiền**, **Nguồn tiền** (chọn gợi ý hoặc gõ) và **Ghi chú** (vd số UNC, ai chuyển, đợt
    mấy). Khoản này:
    - được cộng vào cột **Đã trả / đã ứng** (dưới số có dòng nhỏ “ngoài quỹ …”), nên công nợ giảm đúng; ghi công trình thì
      công nợ theo công trình cũng giảm đúng chỗ (không ghi công trình thì phần mềm nhắc “trả chưa gán công trình”);
    - **không** vào Sổ thu chi, **không** làm đổi Tồn quỹ, không có phiếu chi để in;
    - hiện ở khung chi tiết NCC, mục “Đã trả từ nguồn khác, ngoài quỹ”, có nút sửa / xóa (xóa thì vào Thùng rác, khôi phục được);
    - tôn trọng **khóa sổ** tháng, được ghi vào **Nhật ký thay đổi**; đổi mã / gộp mã NCC, dự án thì khoản trả đi theo;
    - có trong file Excel: sheet **TRA_NGOAI_QUY** của file Chi phí công trình (CONGNO_NCC, CONGNO_CONGTRINH cộng sheet này bằng
      công thức) và sheet **Tra_Ngoai_Quy** của file Công nợ; nhập lại file chi phí thì khoản trả được nhập theo, khoản trùng bỏ qua.
- **Giá vật tư**: danh sách vật tư đã mua (số lần, giá gần nhất, cột **Chênh giá** = giá cao nhất so với giá thấp nhất, rê chuột để xem hai mức giá); chọn một vật tư để xem lịch sử đơn giá
  từng lần mua theo NCC, chênh lệch so với lần trước, biểu đồ giá.

---

## 13. Danh mục chi phí

Màn hình có hai tab: **Vật tư** và **Nhà / khu**. Nhóm chi phí và hạng mục được quản lý ngay trên cây **Khoản mục chi phí** của tab Vật tư (không còn tab riêng).

- **Nhóm chi phí** (6 nhóm lớn như file mẫu): đổi tên thoải mái, mọi hạng mục và báo cáo tự đổi theo.
  Nên giữ số thứ tự ở đầu tên (`1. `, `2. `...) để báo cáo xếp đúng thứ tự.
- **Hạng mục**: mã HM, tên, thuộc nhóm. **Đổi tên / chuyển nhóm** thì sổ chi phí và báo cáo tự cập nhật
  (sổ chỉ lưu mã hạng mục, không lưu tên).
- **Loại chi phí** của hạng mục (Vật tư / Nhân công / Dịch vụ-Phí): quyết định dòng chi phí được tính vào ô nào trong 3 ô Vật tư · Nhân công · Dịch vụ-Phí ở Tổng hợp chi phí và Tổng quan.
  - Đặt ở hộp Sửa hạng mục: chọn hạng mục trên cây rồi bấm Sửa. Mọi dòng chi phí của hạng mục đều theo loại này, nên ở Sổ chi phí không đổi loại riêng từng dòng được.
  - Đổi loại thì các dòng đang có đổi theo, trừ tháng đã khóa sổ.
  - Để **Tự xác định** thì phần mềm đoán: hạng mục có tên bắt đầu “Nhân công” → Nhân công, dòng có mã vật tư → Vật tư.
  - Khi cập nhật lên bản này, phần mềm đã tự điền loại cho các hạng mục theo dữ liệu cũ (loại chiếm nhiều tiền nhất). Nên xem lại một lượt, nhất là các hạng mục phí hoặc dịch vụ chưa có dòng nào.
  - Vật tư không còn ô “Loại CP mặc định”.
- **Vật tư** (menu Danh mục › Vật tư) chia hai phần:
  - Bên trái là cây **Khoản mục chi phí**: **Tất cả vật tư**, rồi các nhóm chi phí (1. Chi phí ban đầu, 2. Chi phí phần thô…). Bấm mũi tên ở đầu nhóm để mở / thu gọn các hạng mục của nhóm. Số bên phải mỗi mục là số vật tư trong mục đó. Nếu có vật tư chưa gắn hạng mục, cây có thêm mục **Vật tư chưa có hạng mục** để gắn bổ sung.
  - Bấm một nhóm hoặc hạng mục: bảng bên phải chỉ hiện vật tư của mục đó, tiêu đề ghi tên mục. Ô tìm kiếm cũng chỉ tìm trong mục đang chọn; muốn tìm toàn bộ thì chọn Tất cả vật tư. Phần mềm nhớ mục đang chọn cho lần mở sau.
  - Các nút dưới cây:
    - **+ Hạng mục** (thêm hạng mục, điền sẵn nhóm đang chọn) và **+ Nhóm**.
    - **Sửa**: sửa nhóm / hạng mục đang chọn.
    - **Gộp**: gộp hạng mục đang chọn vào hạng mục khác.
    - **Xóa**: chỉ xóa được nhóm không còn hạng mục, hoặc hạng mục không còn vật tư hay dòng chi phí nào.
  - Khi chọn một nhóm hoặc hạng mục, góc phải tiêu đề có số dòng và tổng tiền trong sổ chi phí của mục đó.
  - Khi đang chọn một hạng mục, bấm **Thêm vật tư** thì ô Hạng mục trong hộp thêm đã điền sẵn.
  - Bảng gồm các cột: Mã vật tư, Tên vật tư, ĐVT, **Khoản mục mặc định** (hạng mục, kèm nhóm), **Giá thường** và **Đang dùng**. Giá thường là đơn giá bình quân các lần mua; rê chuột vào để xem giá thấp nhất, cao nhất và gần nhất. Đang dùng là số dòng trong sổ chi phí; rê chuột vào để xem tổng đã mua. Cuối mỗi dòng có các nút Lịch sử giá, Sửa và Xóa.
- **Nhà / khu**: thuộc công trình nào; đánh dấu “Dùng chung cả công trình”.
- Đổi mã ở bất kỳ danh mục nào (kể cả dự án, NCC) thì mọi dòng đang dùng mã cũ được đổi theo.
  Không xóa được mã đang được dùng.

---

## 14. Nhập / xuất Excel chi phí

- **Nhập**: menu Nhập từ Excel → chọn file `ChiPhi_CongTrinh_*.xlsm` (hoặc file chi phí xuất từ
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
- **Công nợ NCC**:
  - Trả NCC nhưng chưa ghi công trình.
  - Trả NCC cho một công trình mà NCC đó không có chi phí, số dư đầu kỳ hay khoản trả ngoài quỹ ở công trình ấy.
  - Đã trả nhiều hơn chi phí.
  - **Còn nợ quá N ngày** (mặc định 90): tiền đã trả được trừ vào khoản nợ cũ nhất trước. Phần mềm chỉ báo phần nợ thật sự quá hạn và ghi ngày của khoản nợ đó. Số dư đầu kỳ chưa trả cũng được tính.
  - Bấm Mở để sửa sẽ mở Sổ chi tiết NCC cho mọi công trình, kỳ Toàn bộ.
- **Sổ thu chi**:
  - Số phiếu sai loại (PT cho khoản chi, PC cho khoản thu).
  - Khoản chi chưa có số phiếu.
  - Khoản chi lớn chưa ghi NCC / công trình: ngưỡng chỉnh được, đặt 0 để báo mọi khoản.
  - **Tồn quỹ cuối ngày âm**: trong ngày ghi khoản chi trước khoản thu thì không bị báo.
- **Sổ chi phí**: dòng nằm khác hạng mục của vật tư, dòng chưa có công trình, Thành tiền ≠ SL × ĐG.
  Khi đổi hoặc gán hạng mục cho một vật tư, mọi dòng chi phí của vật tư đó tự chuyển sang hạng mục mới, trừ các dòng thuộc tháng đã khóa sổ.

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
Mở một dòng sổ thu chi (sửa), một dòng chi phí, hoặc một phiếu nhập đã lưu → khung **Chứng từ đính kèm** → **Đính kèm ảnh / tài liệu**
(chọn được nhiều file; chụp hóa đơn bằng điện thoại rồi chép vào máy cũng được).
- Nhận ảnh JPG, PNG, WEBP, PDF, Word (.docx, .doc) và Excel (.xlsx, .xls), tối đa 10 MB mỗi file (file Word / Excel có macro không
  được nhận). Bấm tên file để xem (ảnh hiện ngay, PDF mở tab mới, Word / Excel tải về để mở bằng Word / Excel), nút tải về, nút xóa.
- **Phiếu nhập chi phí mới** và **Ghi thu / chi** (dòng mới): có thể chọn ảnh / tài liệu ngay khi đang lập (khung **Chứng từ đính kèm** dưới bảng dòng hàng,
  bỏ bớt bằng nút ×). File được tải lên và gắn vào phiếu / dòng ngay khi bấm **Ghi phiếu** / **Ghi sổ** (hoặc **Lưu nháp**). Chưa lưu phiếu mà tải lại
  trang thì phải chọn lại file.
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

---

## 19. Gộp mã trùng, tách mã hạng mục

Dùng khi **cùng một thứ** đang có **nhiều mã** (vd NCC `NCC_ThienHai` và `NCC_THienHAi`, vật tư `VL-XERAC6` và `VL-XERAC6B`, dự án
`DANHAMsHanh` và `NHAMsHANH`), làm báo cáo, công nợ bị tách đôi. Gộp mã **chỉ đổi mã** trên các dòng; **không đổi số tiền nào** —
tổng chi phí, tổng thu, tổng chi, tồn quỹ, công nợ luôn giữ nguyên, chỉ dồn về một mã.

### 19.1 Gộp mã
1. Mở danh mục: **Nhà cung cấp**, **Dự án**, hoặc **Danh mục chi phí** (tab Vật tư / Nhà và khu). Tích ô đầu dòng các mã cần
   gộp — **mã tích đầu tiên là mã giữ lại (mã đích)** — rồi bấm **Gộp mã**. Hoặc vào màn **Gộp mã** (menu bên trái, nhóm Kiểm soát)
   → bấm loại mã ở “Gộp mã mới”, gõ chọn mã nguồn (bị gộp, chọn được nhiều) và mã đích.
   Hạng mục: chọn hạng mục trên cây Khoản mục chi phí (tab Vật tư) rồi bấm **Gộp**, gõ chọn hạng mục đích.
2. Bấm **Xem trước**: phần mềm cho biết mỗi mã nguồn có bao nhiêu dòng sổ thu chi / dòng chi phí / vật tư / nhà / khoản trả ngoài quỹ
   (kể cả dòng trong Thùng rác) và số tiền liên quan; bảng **Thông tin giữ lại** cho chọn giữ tên, loại, địa chỉ… của mã nào (mặc định giữ
   của mã đích; mã đích để trống thì lấy của mã nguồn).
3. Đọc **cảnh báo** và các ô phải **xác nhận**:
   - NCC khác loại / khác tên: cảnh báo, chọn thông tin giữ lại.
   - Vật tư **khác ĐVT**: chỉ gộp khi tích “ĐVT khác nhau, số lượng giữ nguyên”. Mã khoản (`XX-…`, `CHUNG`) với vật tư thường: phải xác nhận.
   - Hạng mục **khác tên**: chỉ gộp khi tích “hai hạng mục CÙNG NGHĨA”. Nếu một mã đang mang hai nghĩa thì dùng **Tách mã** (19.3).
     Khác nhóm chi phí: các dòng của hạng mục nguồn sẽ tính vào nhóm của hạng mục đích (tổng tiền không đổi).
   - Nhà / khu: **chỉ gộp trong cùng một công trình** (khác công trình thì không gộp được).
   - Dự án: cả hai có **ngân sách** thì phải chọn giữ ngân sách của mã nào hoặc **Cộng**; ngày khởi công mặc định lấy ngày sớm nhất;
     nhà của công trình nguồn chuyển sang công trình đích (nhà trùng, vd hai nhà “dùng chung”, chọn **Gộp vào** nhà của công trình đích).
     Khác địa chỉ, thời gian phát sinh không giao nhau: cảnh báo để kiểm tra.
   - Có dòng thuộc **tháng đã khóa sổ**: không gộp được, phần mềm liệt kê các dòng đó (mở khóa ở Kiểm soát → Khóa sổ nếu thật cần).
4. Bấm **Gộp mã** → xác nhận. Phần mềm tự **sao lưu** (`truoc-gop-ma`) rồi gộp trong **một lần ghi** (mất điện giữa chừng thì hoặc chưa
   gộp gì, hoặc đã gộp xong — không bao giờ gộp dở). Kết quả hiện số bản ghi đã chuyển và nút **Hoàn tác**.

Sau khi gộp, mã nguồn **không bị xóa** mà chuyển sang trạng thái **“Đã gộp vào &lt;mã đích&gt;”**: ẩn khỏi danh mục, ô chọn, báo cáo, file
Excel xuất ra (tích **Hiện mã đã gộp** ở danh mục để xem lại); không sửa / xóa / tạo lại được mã đó.

### 19.2 Bí danh: gõ hoặc nhập Excel bằng mã cũ
Mã đã gộp trở thành **bí danh** của mã đích: gõ mã cũ (hoa hay thường đều được) ở phiếu thu chi, phiếu nhập chi phí, khoản trả ngoài
quỹ… thì phần mềm tự ghi mã đích. **Nhập file Excel** có mã cũ: ở bước xem trước có bảng **“… chỗ dùng mã cũ đã gộp — sẽ tự đổi sang mã đích”**
(tên file, sheet, dòng, cột, mã cũ → mã mới); dòng danh mục của mã cũ trong file bị bỏ qua (không tạo lại mã đã gộp). Báo cáo nhập và
nhật ký ghi lại số lần đổi. Bộ lọc đang nhớ (sổ thu chi, sổ chi phí, công nợ…) có mã cũ cũng tự chuyển sang mã đích.

### 19.3 Tách mã hạng mục
Khi **một mã hạng mục mang hai nghĩa** (vd HM37 vừa dùng cho “Bảo hành” vừa cho “Chi phí quản lý”): màn **Gộp mã** → tab **Tách mã
hạng mục**:
1. Chọn **Hạng mục cần tách** và **Đổi sang hạng mục** (có sẵn), hoặc tích **Tạo hạng mục mới** rồi ghi mã, tên, nhóm chi phí.
2. Lọc nhóm dòng của nghĩa sai: công trình, nhà / khu, nhà cung cấp, vật tư, từ ngày – đến ngày (phải có ít nhất một điều kiện).
3. **Xem trước**: danh sách từng dòng (ngày, công trình / nhà, diễn giải, NCC, thành tiền), mặc định tích hết; **bỏ tích** các dòng
   không đổi. Phần mềm báo nếu nhóm chi phí của các dòng sẽ thay đổi.
4. **Đổi sang hạng mục mới** → xác nhận. Tổng tiền không đổi; có sao lưu; kết quả hiện ngay kèm nút **Hoàn tác** (hoàn tác thì các
   dòng trở về hạng mục cũ, hạng mục vừa tạo được gỡ vào Thùng rác nếu không còn dùng).

### 19.4 Lịch sử gộp mã, hoàn tác
Màn **Gộp mã** → tab **Lịch sử gộp mã**: mỗi lần gộp / tách một dòng (lúc nào, ai, nội dung, số bản ghi, tiền chịu ảnh hưởng, đã xác
nhận gì). **Hoàn tác** trả mọi dòng về mã cũ, trả thông tin mã đích như trước, mã nguồn dùng lại bình thường, bí danh bị gỡ; có sao lưu
`truoc-hoan-tac-gop`. Phần mềm **từ chối hoàn tác** (và ghi rõ lý do) khi:
- có lần gộp / tách **sau** đụng tới cùng mã — hoàn tác lần sau trước (ngược thứ tự);
- dữ liệu đã bị **sửa sau khi gộp** (vd một dòng đã chuyển sang NCC khác, thông tin mã đích đã sửa, dòng đã bị xóa vĩnh viễn) — để tránh làm sai.
Mọi lần gộp, tách, hoàn tác đều có trong **Nhật ký thay đổi**.

### 19.5 Gợi ý mã trùng
Màn **Gộp mã** → tab **Gợi ý mã trùng**: phần mềm **chỉ gợi ý**, không bao giờ tự gộp:
- mã chỉ khác chữ hoa / thường hoặc khoảng trắng;
- trùng tên (không tính dấu, hoa / thường, dấu câu); vật tư phải cùng ĐVT; nhà phải cùng công trình;
- NCC, hạng mục, dự án có tên gần giống (tên này nằm trọn trong tên kia, vd “10 Phạm Quang Ảnh” và “Dự án 10 Phạm Quang Ảnh”);
- nhà / khu không có dòng chi phí nào (gợi ý dọn — phần mềm không tự xóa).
Mỗi nhóm có số chỗ đang dùng của từng mã. **Gộp…** mở hộp thoại gộp với mã dùng nhiều nhất làm đích (đổi được); **Bỏ qua gợi ý này** thì
không nhắc lại (nhớ cả khi mở lại phần mềm; bấm **Hiện lại** để xem lại các nhóm đã bỏ qua).

### 19.6 Lưu ý
- Trước khi gộp nhiều mã trên dữ liệu thật: **sao lưu thư mục `data`** (Cài đặt → **Sao lưu ngay**, hoặc chép cả thư mục), thử gộp + hoàn tác một cặp,
  so công nợ / tổng hợp trước và sau.
- Lần đầu mở bản có gộp mã, phần mềm tự nâng cấp dữ liệu lên lược đồ 5 và tạo bản sao lưu `truoc-nang-cap-luoc-do-5` (giữ mãi).


## 20. Đăng nhập và phân quyền (tùy chọn — mặc định TẮT)

> **LƯU Ý QUAN TRỌNG:** đăng nhập chỉ bảo vệ giao diện phần mềm, KHÔNG mã hóa file dữ liệu; ai chép được thư mục `data/` vẫn đọc
> được dữ liệu, nên cần đặt mật khẩu tài khoản Windows (và nếu được thì bật mã hóa ổ đĩa).

Mặc định phần mềm **không có đăng nhập**: mở là dùng, y như trước. Chỉ bật khi máy có nhiều người dùng chung và cần chia quyền.

### 20.1 Bật đăng nhập

1. **Sao lưu** trước (Cài đặt → Sao lưu đầy đủ .zip).
2. Cài đặt → **Đăng nhập và phân quyền** → **Bật đăng nhập**. Tạo tài khoản **Chủ** ngay trong bước này: tên đăng nhập, họ tên,
   mật khẩu (ít nhất 8 ký tự, khác tên đăng nhập, không phải mật khẩu quá phổ biến như `12345678`; nên dùng một câu dễ nhớ, có dấu
   tiếng Việt cũng được).
3. Phần mềm hiện **mã khôi phục dự phòng** (20 ký tự) **một lần duy nhất**. In ra hoặc chép cất ở nơi an toàn (không để cạnh máy).
   Phải tích “Tôi đã chép (hoặc in) mã này…” mới đóng được hộp này.

Từ lúc này, mở phần mềm sẽ thấy màn hình đăng nhập (Enter để đăng nhập; nút con mắt để hiện / ẩn mật khẩu; có cảnh báo khi đang bật
Caps Lock). Góc trên bên phải hiện tên, vai trò, menu **Đổi mật khẩu / Quản lý người dùng / Đăng xuất**.

### 20.2 Vai trò

| Việc | Chủ | Kế toán | Chỉ xem |
|---|:-:|:-:|:-:|
| Xem sổ, báo cáo, công nợ, thùng rác; xuất Excel; in phiếu | ✓ | ✓ | ✓ |
| Thêm / sửa / xóa (vào thùng rác) dòng sổ, phiếu nhập, danh mục, kiểm quỹ, chứng từ, trả ngoài quỹ | ✓ | ✓ | |
| Nhập Excel **gộp thêm** (và xem trước) | ✓ | ✓ | |
| Xem nhật ký thay đổi; tạo / tải sao lưu; khôi phục từ thùng rác | ✓ | ✓ | |
| Nhập Excel **thay thế toàn bộ**, khôi phục sao lưu, xóa toàn bộ sổ | ✓ | | |
| Xóa vĩnh viễn / dọn thùng rác, khóa / mở khóa sổ, gộp mã / tách mã | ✓ | | |
| Đổi cài đặt; quản lý người dùng; bật / tắt / cấu hình đăng nhập; sự kiện bảo mật | ✓ | | |

Nút không được phép thì ẩn; nếu cố gọi thẳng, phần mềm từ chối với thông báo “Bạn không có quyền …”.

### 20.3 Quản lý người dùng (Chủ)

Menu tên → **Quản lý người dùng** (hoặc Cài đặt → Đăng nhập và phân quyền):

- **Thêm người dùng**: tên đăng nhập (không phân biệt hoa / thường), họ tên, vai trò, mật khẩu tạm. Người mới đăng nhập lần đầu **bắt
  buộc đổi** mật khẩu của riêng mình.
- **Sửa**: họ tên, vai trò (đổi vai trò thì người đó bị đăng xuất ngay).
- **Đặt lại mật khẩu** khi nhân viên quên: đặt mật khẩu tạm, người đó bị đăng xuất và phải đổi ở lần đăng nhập sau.
- **Mở khóa** tài khoản đang bị khóa vì nhập sai nhiều lần.
- **Vô hiệu hóa / Kích hoạt lại** (không có xóa hẳn — để nhật ký luôn biết ai đã làm gì). Không hạ quyền hay vô hiệu hóa được tài
  khoản Chủ đang hoạt động cuối cùng.
- Thẻ **Sự kiện bảo mật**: đăng nhập đúng / sai, khóa tài khoản, đổi / đặt lại mật khẩu, bật / tắt, khôi phục sao lưu… lọc theo
  loại, ngày, chữ tìm.

Mỗi người tự **Đổi mật khẩu** ở menu tên (phải nhập đúng mật khẩu hiện tại). Đổi mật khẩu thì các phiên khác của người đó bị đăng xuất.

### 20.4 Nhập sai mật khẩu, hết phiên

- Sai 5 lần liên tiếp: tài khoản khóa **5 phút**; lần khóa tiếp theo 15 phút, rồi 60 phút. Chủ mở khóa sớm được. Thông báo lỗi luôn
  là “Sai tên đăng nhập hoặc mật khẩu” (không tiết lộ tên nào có thật).
- Phiên đăng nhập hết sau **60 phút không thao tác**, và tối đa **12 giờ** kể từ lúc đăng nhập (Chủ đổi được ở Cài đặt).
- **2 phút trước khi hết** phiên, đầu màn hình hiện dải cảnh báo đếm ngược và nút **Tiếp tục làm việc**.
- Nếu phiên đã hết khi đang gõ dở một phiếu: hộp **Đăng nhập lại** hiện đè lên, **phiếu đang gõ vẫn còn nguyên**; đăng nhập lại rồi bấm
  lưu như bình thường (nếu vừa bấm lưu đúng lúc hết phiên, đăng nhập xong phần mềm tự lưu tiếp, không bị ghi hai lần).

### 20.5 Quên mật khẩu

- **Nhân viên** quên: nhờ Chủ **Đặt lại mật khẩu** (mục 20.3), hoặc tự làm như dưới đây.
- **Ai cũng làm được trên chính máy chạy phần mềm**: màn đăng nhập → **Quên mật khẩu?** → nhập tên → **Lấy mã khôi phục**. Mã KHÔNG hiện
  trên màn hình mà được ghi vào file `data\khoi-phuc\MA_KHOI_PHUC.txt` (mở bằng Notepad). Nhập mã + mật khẩu mới. Mã dùng **một lần**,
  hết hạn sau **15 phút**, nhập sai 5 lần thì phải lấy mã mới. Dùng xong file tự xóa.
- **Chủ quên mật khẩu**: cách trên, hoặc **Dùng mã dự phòng của Chủ** (mã 20 ký tự đã cất ở bước bật). Dùng xong phần mềm cấp **mã dự
  phòng mới** (hiện một lần — cất lại). Chủ tự tạo mã mới bất cứ lúc nào: Cài đặt → **Tạo mã dự phòng mới**.
- **Cứu hộ cuối cùng** (mất cả mật khẩu Chủ lẫn mã dự phòng): đóng cửa sổ KhoiDong.bat, mở cửa sổ lệnh ở thư mục phần mềm, chạy

  ```
  node scripts\dat-lai-mat-khau-chu.js
  ```

  rồi làm theo câu hỏi (mật khẩu mới gõ hai lần, gõ `CO` để xác nhận). Lệnh mở khóa, kích hoạt lại tài khoản Chủ và ghi vào sự kiện
  bảo mật. Ai mở được máy và thư mục phần mềm thì dùng được lệnh này — đó là chủ ý (phần mềm chạy trên máy; xem lưu ý đầu mục).

### 20.6 Ai đã làm gì

Mỗi dòng sổ, phiếu nhập, danh mục… ghi **người tạo** và **người sửa gần nhất** (xem trong form sửa dòng sổ). Dữ liệu có từ trước khi có
chức năng này hiện “Dữ liệu cũ”; khi đăng nhập tắt, ghi “Người dùng máy này”. Nhật ký thay đổi (Kiểm soát sổ sách → Nhật ký) ghi tên
người đăng nhập — ô “Người đang dùng máy này” ở Cài đặt chỉ dùng khi đăng nhập tắt. Nhập Excel cũng ghi người đang đăng nhập.

### 20.7 Sao lưu, khôi phục, tắt đăng nhập

- **Khôi phục sao lưu không đụng tới tài khoản**: người dùng, mật khẩu, trạng thái bật / tắt đăng nhập giữ nguyên như hiện tại (kể cả
  khi khôi phục một bản sao lưu từ trước lúc bật đăng nhập). Sau khi khôi phục, mọi người phải đăng nhập lại.
- File sao lưu **tải về** (.db / .zip / .json) và file Excel xuất ra **không chứa** tài khoản, mật khẩu, phiên đăng nhập.
- **Tắt đăng nhập**: Cài đặt → Đăng nhập và phân quyền → **Tắt đăng nhập** (nhập lại mật khẩu của bạn). Phần mềm quay về như chưa bật;
  các tài khoản vẫn được giữ, **Bật lại đăng nhập** chỉ cần đăng nhập bằng một tài khoản Chủ cũ.
- Mở phần mềm ở máy khác qua mạng LAN: KHÔNG hỗ trợ (phần mềm chỉ nghe trên chính máy này).
