# Hướng dẫn dùng trợ lý AI (Claude) để tra cứu số liệu

Thay vì mở từng màn hình để tìm, bạn hỏi bằng tiếng Việt trong ứng dụng **Claude Desktop**. Claude tự lấy số từ phần mềm
Kế Toán Công Trình rồi trả lời.

Ví dụ:

- *Còn nợ Hòa Phát bao nhiêu? Ở những công trình nào?*
- *Tháng 9 công trình K85 chi bao nhiêu? Chia theo nhóm chi phí.*
- *Thép phi 10 mua ở đâu rẻ nhất? Lần gần nhất giá bao nhiêu?*
- *Nhà cung cấp nào nợ quá 60 ngày?*
- *Tồn quỹ hôm nay bao nhiêu? Tháng này thu chi thế nào?*
- *Tìm phiếu chi PC049/10.*
- *Có cảnh báo nào cần xử lý không?*

## Trợ lý làm được gì, không làm được gì

| Được | Không được |
|---|---|
| Xem sổ quỹ, chi phí công trình, công nợ NCC, tuổi nợ, giá vật tư, cảnh báo | Ghi, sửa, xóa phiếu hay danh mục |
| Tổng hợp theo công trình, NCC, nhóm, hạng mục, vật tư, tháng, quý, năm | Xem file đính kèm, nhật ký, tài khoản đăng nhập |
| Hiểu tên gần đúng, không dấu ("hoa phat", "thep phi 10") | Đoán số khi không có dữ liệu |

- Số liệu tính bằng **đúng các hàm của phần mềm**, nên khớp với màn hình.
- Chỉ tính chứng từ **đã ghi sổ**, không tính phiếu nháp. Riêng phần cảnh báo có tính cả phiếu nháp, giống màn Cần xử lý.
- Không cần mở phần mềm khi hỏi. Trợ lý đọc thẳng file `data\ketoan.db`. Phần mềm vừa ghi thêm phiếu thì trợ lý thấy ngay.

## 1. Chuẩn bị

1. **Node.js**: máy đã chạy được phần mềm (bấm `KhoiDong.bat`) là đã có.
2. **Claude Desktop**: tải ở <https://claude.ai/download>, cài rồi đăng nhập tài khoản Claude.
3. Mở phần mềm Kế Toán Công Trình **ít nhất một lần** để có file dữ liệu.

## 2. Cài trợ lý (tự động)

1. Trong thư mục phần mềm, bấm đúp **`CaiTroLyAI.bat`**.
2. Cửa sổ hiện các dòng như sau là đã cài xong:
   ```
   OK: đọc được dữ liệu ...\data\ketoan.db
     Số liệu từ 26/01/2026 đến 08/10/2026
     Tồn quỹ: 6.158.041 đ · Còn phải trả NCC: 5.955.670.259 đ
   Đã ghi cấu hình: C:\Users\...\AppData\Roaming\Claude\claude_desktop_config.json
   ```
3. **Thoát hẳn Claude Desktop**: bấm chuột phải biểu tượng Claude ở góc phải thanh tác vụ (cạnh đồng hồ) → **Quit**. Chỉ đóng cửa sổ là chưa đủ.
4. Mở lại Claude Desktop. Trong khung chat, mở danh sách công cụ (biểu tượng công cụ / "Search and tools"). Bạn sẽ thấy
   **ke-toan-cong-trinh** với 11 công cụ.
5. Hỏi thử: *"Tổng quan số liệu kế toán của tôi"*.
6. Lần đầu dùng, Claude hỏi có cho phép dùng công cụ không. Chọn **Allow always** (luôn cho phép). Các công cụ này chỉ xem, không sửa gì.

Nếu file cấu hình cũ đã có, file cài sẽ lưu bản sao `claude_desktop_config.json.truoc-tro-ly-ai.bak`, rồi **giữ nguyên** các mục
có sẵn và chỉ thêm mục `ke-toan-cong-trinh`.

## 3. Cài bằng tay (khi file cài báo lỗi)

1. Claude Desktop → **Settings** → **Developer** → **Edit Config**. Thao tác này mở thư mục chứa `claude_desktop_config.json`.
2. Mở file bằng Notepad. Thêm mục `ke-toan-cong-trinh` vào trong `"mcpServers"`, thay đường dẫn cho đúng máy bạn.
   Mỗi dấu `\` phải viết thành `\\`:
   ```json
   {
     "mcpServers": {
       "ke-toan-cong-trinh": {
         "command": "C:\\Program Files\\nodejs\\node.exe",
         "args": ["D:\\KeToan\\scripts\\mcp-ketoan.js"],
         "env": { "KETOAN_DATA": "D:\\KeToan\\data" }
       }
     }
   }
   ```
   Muốn biết đường dẫn `node.exe`, mở Command Prompt và gõ `where node`.
3. Lưu file, thoát hẳn rồi mở lại Claude Desktop.

## 4. Link "Xem trên phần mềm"

Cuối mỗi câu trả lời, Claude kèm một link **Xem trên phần mềm**. Bấm vào thì trình duyệt mở **đúng màn hình, đã lọc sẵn**
công trình, NCC, vật tư và kỳ đúng như câu trả lời, để bạn đối chiếu ngay:

| Câu hỏi về | Link mở màn hình |
|---|---|
| Công nợ một NCC | Sổ chi tiết NCC |
| Công nợ nhiều NCC | Công nợ NCC theo kỳ |
| Công nợ theo công trình | Công nợ theo công trình |
| Tuổi nợ | Phân tích → Tuổi nợ NCC |
| Chi phí, tổng hợp chi phí | Sổ chi phí |
| Thu chi, phiếu thu / chi | Sổ quỹ thu chi |
| Giá vật tư | Giá vật tư |
| Cảnh báo | Kiểm soát → Cần xử lý |

- Phần mềm phải **đang chạy** (bấm `KhoiDong.bat`). Nếu phần mềm đang tắt, Claude sẽ nhắc mở trước rồi mới bấm link.
- Link chỉ mở được **trên chính máy cài phần mềm**. Gửi cho người khác thì họ không mở được.
- Bấm link sẽ **thay bộ lọc** đang chọn trên màn hình đó (kể cả công trình ở thanh trên cùng) bằng bộ lọc của câu trả lời.
- Nếu đã bật đăng nhập, bạn đăng nhập trước, rồi phần mềm mở đúng màn hình. Phân quyền vẫn được giữ.
- Claude không đưa link thì kiểm tra 3 việc: (1) đã cập nhật code mới; (2) đã **thoát hẳn Claude Desktop** (Quit ở thanh tác vụ) rồi mở lại, vì Claude chỉ đọc lại công cụ khi mở lại; (3) mở cuộc trò chuyện **mới**. Vẫn không có thì nói thêm: *"cho link xem trên phần mềm"*.

## 5. Mẹo hỏi cho đúng

- **Nói rõ kỳ**: "tháng 9/2026", "từ 01/07 đến 30/09", "quý 3". Không nói kỳ thì trợ lý tính trên toàn bộ số liệu.
- **Tên công trình / NCC** gõ gần đúng cũng được. Nếu khớp nhiều mục, trợ lý sẽ hỏi lại bạn muốn mục nào.
- Muốn xem bảng thì nói "kẻ bảng". Muốn so sánh thì nói "so sánh giữa các NCC" hoặc "theo từng tháng".
- **Công nợ**: số dương là **còn phải trả** (Dư Có), số âm là **đã ứng trước** (Dư Nợ). Tổng còn phải trả tính theo từng công trình có thể
  lớn hơn tổng tính theo NCC. Lý do: một NCC còn nợ ở công trình này nhưng ứng dư ở công trình khác thì chỉ được bù trừ khi tính theo NCC. Số thuần luôn bằng nhau.
- Câu trả lời quan trọng (để trả tiền, ký biên bản) nên **đối chiếu lại trên màn hình phần mềm**.

## 6. An toàn và quyền riêng tư

- Trợ lý **chỉ đọc**. Ghi, sửa, xóa vẫn phải làm trong phần mềm.
- Khi bạn hỏi, **phần kết quả liên quan tới câu hỏi** được gửi lên Claude qua internet để Claude soạn câu trả lời.
  Cả file dữ liệu không bị gửi đi. Không có internet thì trợ lý không trả lời được, còn phần mềm vẫn chạy bình thường.
- Trợ lý đọc thẳng file dữ liệu, nên **không áp dụng phân quyền đăng nhập** của phần mềm. Ai dùng Claude Desktop trên máy đó cũng
  hỏi được mọi số liệu. Chỉ nên cài trên máy của chủ / kế toán trưởng.

## 7. Gỡ trợ lý

Mở Command Prompt trong thư mục phần mềm, chạy `CaiTroLyAI.bat go`, rồi thoát hẳn và mở lại Claude Desktop.
Hoặc xóa mục `ke-toan-cong-trinh` trong file cấu hình (mục 3).

## 8. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Không thấy `ke-toan-cong-trinh` trong Claude Desktop | Thoát hẳn Claude Desktop (Quit ở thanh tác vụ) rồi mở lại. Kiểm tra file cấu hình đúng như mục 3. |
| Claude báo lỗi khi dùng công cụ | Xem nhật ký `%APPDATA%\Claude\logs\mcp-server-ke-toan-cong-trinh.log`. |
| "Không thấy file dữ liệu" | Mở phần mềm một lần. Nếu đã dời thư mục phần mềm, chạy lại `CaiTroLyAI.bat`. |
| Số khác màn hình | Kiểm tra kỳ và bộ lọc trong câu hỏi. Trợ lý không tính phiếu nháp. Màn hình đang lọc công trình ở thanh trên cùng thì phải hỏi đúng công trình đó. |
| "File cấu hình đang bị lỗi định dạng JSON" | File cấu hình bị sửa sai. Mở bằng Notepad và sửa lại, hoặc đổi tên file rồi chạy lại `CaiTroLyAI.bat`. |
| Hỏi xong không có link "Xem trên phần mềm" | Mở Command Prompt trong thư mục phần mềm, gõ `node scripts\mcp-ketoan.js --kiem-tra`: phải thấy "Phiên bản cổng trợ lý: 1.2.0" trở lên. Thấp hơn là chưa cập nhật code. Rồi thoát hẳn Claude Desktop, mở lại, hỏi trong cuộc trò chuyện mới. |
| Bấm link "Xem trên phần mềm" không mở được | Mở phần mềm (`KhoiDong.bat`) trước rồi bấm lại. Phần mềm vừa mở thì hỏi lại để Claude lấy link mới, vì cổng có thể đã đổi. |
| Đổi máy hoặc dời thư mục phần mềm | Chạy lại `CaiTroLyAI.bat` trên máy mới / ở thư mục mới. |

Kiểm tra nhanh cổng tra cứu không cần Claude: mở Command Prompt trong thư mục phần mềm và gõ
`node scripts\mcp-ketoan.js --kiem-tra`.
