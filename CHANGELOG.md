# Nhật ký phiên bản (CHANGELOG)

## Loại chi phí đặt theo hạng mục (06/10/2026)

- Bỏ ô **Loại CP mặc định** ở hộp sửa vật tư. Thay vào đó mỗi **hạng mục** có ô **Loại chi phí** (Vật tư / Nhân công / Dịch vụ-Phí / Tự xác định).
- Mọi dòng chi phí theo loại của hạng mục:
  - Phiếu mới lấy loại của hạng mục.
  - Đổi loại của hạng mục thì các dòng đang có đổi theo, trừ tháng đã khóa sổ.
  - Vật tư chuyển sang hạng mục khác thì dòng lấy loại của hạng mục mới.
  - Sổ chi phí không cho đổi loại riêng từng dòng của hạng mục đã đặt loại.
- Dữ liệu nâng lên **lược đồ 8**. Trước khi nâng, phần mềm tự sao lưu. Loại của từng hạng mục được điền sẵn theo dữ liệu cũ (loại chiếm nhiều tiền nhất); hạng mục chưa có dòng mà tên bắt đầu “Nhân công” thì là Nhân công. Không dòng chi phí nào bị đổi khi nâng.
- Excel: sheet DM_HANGMUC có thêm cột **Loại chi phí**, nhập lại được. Hạng mục mới nhập mà file không ghi loại thì được điền theo dữ liệu.

## Bỏ tab Hạng mục, Nhóm chi phí (06/10/2026)

- Danh mục chi phí chỉ còn tab **Vật tư** và **Nhà / khu**. Hạng mục và nhóm chi phí quản lý trên cây **Khoản mục chi phí** của tab Vật tư.
- Dưới cây có thêm **Gộp** (gộp hạng mục đang chọn vào hạng mục khác) và **Xóa** (nhóm / hạng mục không còn dùng). Tiêu đề bảng có số dòng và tổng tiền trong sổ chi phí của nhóm / hạng mục đang chọn, thay cho cột Tổng chi phí của tab cũ.
- Menu trái gộp hai mục “Vật tư” và “Hạng mục, nhóm CP” thành **Vật tư, hạng mục**.

## Sửa lỗi sau rà soát (06/10/2026)

- **Sổ chi tiết NCC**: chọn “Chưa gán công trình” ở Sổ quỹ rồi mở sổ này, mọi số không còn về 0 (lựa chọn đó chỉ có nghĩa ở Sổ quỹ). Bấm cảnh báo công nợ sẽ mở sổ cho mọi công trình, kỳ Toàn bộ, để thấy đúng số được báo.
- **Sổ quỹ**:
  - Nút Bỏ lọc đổi ngay nhãn công trình ở thanh trên.
  - “Xem nháp” ở Tổng quan và bấm một dòng sổ quỹ trong Ctrl K không còn bị ẩn do đang lọc công trình.
- **Cảnh báo** bớt báo nhầm:
  - Ngưỡng “Khoản chi lớn” đặt 0 nay được tôn trọng (trước đây bị đổi lại thành 5 triệu).
  - Trả NCC theo công trình của số dư đầu kỳ hoặc khoản trả ngoài quỹ không còn bị coi là ghi nhầm công trình.
  - “Còn nợ quá N ngày” tính theo khoản nợ còn lại, tiền trả trừ vào khoản cũ nhất trước. NCC đã trả hết nợ cũ, chỉ còn nợ mới thì không bị báo. Số dư đầu kỳ chưa trả cũng được báo.
  - Tồn quỹ âm xét theo tồn cuối ngày.
  - Phần tính cảnh báo công nợ nhanh hơn khi dữ liệu lớn: chỉ đọc dữ liệu một lượt.
- **Đổi / gán hạng mục cho vật tư**: các dòng chi phí cũ của vật tư tự chuyển theo (trừ tháng đã khóa sổ), không còn hàng trăm cảnh báo “nằm ở hạng mục khác” phải sửa từng dòng.

## Danh mục vật tư dạng cây khoản mục (06/10/2026)

- **Danh mục › Vật tư** chia hai phần. Bên trái là cây **Khoản mục chi phí**: Tất cả vật tư → nhóm chi phí → hạng mục, mỗi mục có số vật tư, bấm mũi tên để mở / thu gọn nhóm. Bên phải là bảng vật tư của mục đang chọn, có tiêu đề là tên mục.
- Cây có thêm mục **Vật tư chưa có hạng mục** khi có vật tư chưa gắn hạng mục. Dưới cây có các nút **+ Hạng mục** (điền sẵn nhóm đang chọn), **+ Nhóm** và **Sửa** (nhóm / hạng mục đang chọn).
- Đang chọn một hạng mục mà bấm **Thêm vật tư** thì hạng mục đã điền sẵn. Mục đang chọn và các nhóm đang mở được nhớ cho lần sau.
- Cột bảng: Mã vật tư · Tên vật tư · ĐVT · **Khoản mục mặc định** · **Giá thường** · **Đang dùng** · Lịch sử giá / Sửa / Xóa.
  - Giá thường là đơn giá bình quân; rê chuột xem thấp nhất, cao nhất và gần nhất.
  - Đang dùng là số dòng chi phí; rê chuột xem tổng đã mua.
  - Bỏ cột Loại CP.
- Tích chọn nhiều dòng, Gộp mã, Xóa nhiều vẫn như cũ.
- Menu trái sáng đúng mục khi đổi tab: tab Hạng mục / Nhóm chi phí sáng “Hạng mục, nhóm CP”, tab Vật tư / Nhà-khu sáng “Vật tư”. Trước đây tab Nhóm chi phí lại sáng mục Vật tư.

## Thanh tab chữ lớn hơn (06/10/2026)

- Các thanh tab / nút gạt (Tháng · Quý · Năm · Khoảng ngày · Toàn bộ, Theo NCC · Theo công trình, Thu và chi · Thu · Chi, Mọi trạng thái · Đã ghi sổ · Nháp…) chữ 15px (trước 13,5px); mục đang chọn chữ đậm, nền trắng và có vạch vàng ở dưới để dễ phân biệt.

## Chỉ còn một ô lọc Công trình (06/10/2026)

- **Sổ quỹ thu chi** bỏ ô “Công trình” riêng trong trang: ô **Công trình ở thanh trên** là ô lọc công trình duy nhất, dùng chung cho Sổ quỹ, Sổ chi phí, Tổng hợp chi phí, Chi phí theo nhóm, Công nợ NCC theo kỳ, Sổ chi tiết NCC (chọn một lần, sang màn khác vẫn giữ). Ở Sổ quỹ ô này có thêm lựa chọn **Chưa gán công trình**.
- Rà soát các màn hình khác: không màn nào còn ô Công trình thứ hai. Ô ở thanh trên **ẩn** ở các màn hình không lọc theo công trình (Tổng quan, Phiếu thu / chi, Phiếu nhập chi phí, Ghi thu / chi, danh mục, Kiểm soát, Cài đặt…) để khỏi tưởng là đang lọc.
- Bấm từ công trình / NCC / cảnh báo sang Sổ quỹ (lọc theo công trình) nay đặt ô ở thanh trên; nút Xóa lọc của Sổ quỹ cũng bỏ chọn công trình.

## Cảnh báo mới: công nợ, sổ thu chi, sổ chi phí (06/10/2026)

Ở **Kiểm soát › Cần xử lý** (và ô “Cần chú ý hôm nay” ở Tổng quan) có thêm 3 nhóm; mỗi cảnh báo có nút **Mở để sửa** tới đúng chỗ sửa, hoặc **Bỏ qua** nếu đúng thật:
- **Công nợ nhà cung cấp**: trả NCC (có chi phí công trình) nhưng chưa ghi công trình → khoản trả không trừ vào công nợ công trình nào; trả NCC cho công trình mà NCC đó không có chi phí (ghi nhầm công trình); đã trả nhiều hơn chi phí (Dư Nợ); còn nợ quá N ngày chưa trả (mặc định 90). Mở dòng sổ quỹ trên trang Ghi thu / chi, hoặc mở Sổ chi tiết NCC.
- **Sổ thu chi**: số phiếu PT… mà là khoản chi (hoặc PC… mà là khoản thu); khoản chi chưa có số phiếu (không in được); khoản chi lớn (mặc định từ 5 triệu) chưa ghi NCC / đối tượng và công trình; tồn quỹ âm (báo dòng làm quỹ âm).
- **Sổ chi phí**: dòng có hạng mục khác hạng mục của vật tư (mở form sửa dòng, hạng mục tự theo vật tư, bấm Lưu); dòng chưa có công trình; Thành tiền khác Số lượng × Đơn giá.
- Hai ngưỡng mới chỉnh được ngay trên màn hình: **Nợ NCC lâu quá (ngày)**, **Khoản chi lớn từ (đồng)**.

## Ghi thu / chi thành một trang riêng (06/10/2026)

- Phiếu thu / chi không còn mở trong hộp thoại: F3, menu **Ghi thu / chi**, nút trên thanh trên, Sửa / Nhân bản dòng ở Sổ quỹ, Phiếu thu / chi, Kiểm soát… đều mở **trang `#/ghi-thu-chi`** (rộng hết khung, thanh nút Ghi sổ / Lưu nháp / Hủy dính ở đáy). Mục Ghi thu / chi trên menu sáng lên khi đang ở trang.
- **Hủy**, **Esc** hoặc **Ghi sổ** quay lại đúng màn hình trước đó; “Ghi sổ và ghi tiếp” ở lại trang. Dữ liệu tải lại giữa chừng (thêm nhanh công trình / NCC) không làm mất những gì đang gõ.
- Nội dung form, phím tắt, kiểm tra dữ liệu, phiếu nhiều dòng giữ nguyên như trước.

## Phiếu nhập: bỏ Công trình ở đầu phiếu; thống nhất gọi “Công trình” (06/10/2026)

- **Phiếu nhập chi phí**: đầu phiếu chỉ còn Ngày, Nhà cung cấp, Số phiếu. Mỗi dòng có cột **Công trình** (bắt buộc) và **Nhà / khu** (tự điền nhà dùng chung của công trình, sửa được). Dòng mới tự chép công trình, nhà / khu của dòng trên; Enter ở ô cuối đầu phiếu / cuối dòng dừng ở ô Công trình nếu dòng chưa có. Phiếu mới gợi ý công trình đang chọn ở thanh trên, không thì công trình của phiếu vừa ghi.
- **Thống nhất tên gọi**: mọi chữ “Dự án” trên giao diện, thông báo lỗi, nhật ký, gộp mã đổi thành **Công trình** (một danh mục chung cho sổ thu chi và chi phí). Tên cột trong file Excel giữ nguyên như file gốc (`Mã Dự Án`…) để nhập lại được; mã trong dữ liệu không đổi.

## Phiếu nhập chi phí: bỏ chọn hạng mục, nhóm › hạng mục theo vật tư (06/10/2026)

- Bỏ ô **Hạng mục** ở đầu phiếu và ô gõ hạng mục ở từng dòng. Cột mới **Nhóm › Hạng mục** chỉ hiển thị nhóm chi phí và hạng mục đã gắn cho mã vật tư (Danh mục › Vật tư), không sửa được, nên không còn lệch dữ liệu giữa phiếu và danh mục.
- Mỗi dòng mới phải có **mã vật tư** (đã gắn hạng mục); dòng không có vật tư hoặc vật tư chưa gắn hạng mục bị chặn khi ghi, báo đúng dòng. Nhân công / phí / hóa đơn bán lẻ tạo thành vật tư gắn hạng mục; hộp thêm nhanh vật tư bắt buộc chọn **Hạng mục**.
- Dòng cũ không có vật tư (nhập trước đây hoặc từ Excel) vẫn giữ hạng mục đã lưu khi mở sửa phiếu.
- Bỏ cột **Loại CP** ở phiếu nhập: loại chi phí tự xác định theo vật tư (loại mặc định của vật tư, nếu không thì theo hạng mục). Sửa lại phiếu cũ thì loại CP của các dòng cũng được tính lại theo vật tư.

## Phiếu nhập chi phí: mỗi dòng một công trình (06/10/2026)

- Bảng dòng hàng có thêm cột **Công trình** (để trống = công trình đầu phiếu). Một nhà cung cấp giao hàng cho nhiều công trình trong cùng một phiếu thì ghi công trình riêng ở từng dòng; đầu phiếu đổi tên “Công trình (mặc định)” và được **để trống** khi mọi dòng đều ghi công trình riêng. Gõ tên công trình thì tự đổi sang mã.
- Mỗi dòng vẫn là một dòng sổ chi phí (`maCT` riêng) nên công nợ NCC theo công trình, Sổ chi phí, báo cáo, Excel không đổi cách tính. Lược đồ dữ liệu không đổi.
- API `POST` / `PUT /api/cost-slips`: dòng nhận thêm `maCT` (và `maNha` nếu khác công trình đầu phiếu); thiếu công trình (đầu phiếu trống mà có dòng không ghi riêng) hoặc mã lạ thì báo lỗi, một dòng sai thì không ghi dòng nào.
- **Hạng mục theo vật tư**: dòng có mã vật tư luôn lấy hạng mục (và nhóm chi phí) đã gắn ở Danh mục vật tư, không còn chọn hạng mục riêng cho dòng đó (tránh một vật tư nằm ở hai hạng mục / hai nhóm). Ô Hạng mục của dòng hiện mờ và không sửa được; ô Hạng mục ở đầu phiếu không còn bắt buộc, chỉ dùng cho dòng không có mã vật tư (nhân công, phí…) hoặc vật tư chưa gắn hạng mục. Áp dụng ở máy chủ cho cả phiếu nhập và sửa từng dòng ở Sổ chi phí (ô Hạng mục của dòng có vật tư không sửa được; gửi hạng mục khác lên vẫn lấy theo vật tư). Dòng cũ lệch hạng mục so với vật tư sẽ được đồng bộ theo vật tư khi sửa lại phiếu.
- Mở lại phiếu: đầu phiếu lấy công trình có nhiều dòng nhất, các dòng khác hiện công trình riêng (giữ nguyên nhà / khu của dòng). Danh sách phiếu đã nhập ghi “+N công trình”, phiếu in có cột Công trình, nhật ký ghi “CT1 +2 công trình”. Phím Enter ở ô Thành tiền xuống ô Công trình của dòng sau khi phiếu có nhiều công trình.

## Bảng màu hợp mệnh Kim (nữ 1993 – Quý Dậu, Kiếm Phong Kim) (05/10/2026)

- Theo ngũ hành: mệnh Kim hợp **trắng, xám, bạc, vàng ánh kim**; Thổ sinh Kim nên dùng thêm **vàng nhạt / be**; tránh Hỏa (đỏ, cam, hồng, tím) khắc Kim.
- **Nền trang** trắng xám ấm #ECEAE5, khung / bảng trắng #FDFDFB, đầu cột bảng vàng champagne #E8E0CB, đường kẻ xám ấm.
- **Menu trái** xám than chì #3E4248 (kim loại), chữ trắng ngà, tên nhóm và vạch mục đang mở vàng đồng; mục đang mở là thẻ trắng ngà.
- **Màu nhấn** (liên kết, nút phụ, viền chọn, biểu đồ cột, thẻ) chuyển từ xanh tím sang dải **vàng đồng**; nút chính xám than. Cột Chi của biểu đồ vàng đồng (bỏ cam / đất nung), tiền thu vẫn xanh lá. Chỉ cảnh báo lỗi / xóa còn dùng đỏ vì cần nổi bật.
- Không đổi bố cục, chữ, dữ liệu.

## Menu trái màu cát đậm (mẫu D) (05/10/2026)

- Menu trái đổi từ xanh tím sang **cát đậm #CDBBA3** (mẫu D trong bản so sánh 4 phương án): chữ và biểu tượng nâu đen, tên nhóm nâu, rê chuột nền trắng mờ, mục đang mở là thẻ trắng ngà chữ đậm. Cùng tông ấm với nền trang be #E3D9CF, dịu mắt hơn.

## Đổi bảng màu nền theo bộ màu Adobe Color (05/10/2026)

- Theo bộ 5 màu: #CC9889 (hồng đất), #99A4C4 (xanh tím nhạt), #E3D4C1 (cát), #D6A081 (đất nung), #E3D9CF (be).
- **Nền trang** be #E3D9CF, khung / bảng / hộp thoại trắng ngà #FCFAF7, đầu cột bảng màu cát #E3D4C1, đường kẻ và viền ô nhập nâu be.
- **Menu trái** xanh tím nhạt #99A4C4, chữ và biểu tượng xanh mực, mục đang mở là thẻ trắng ngà.
- **Màu nhấn** (liên kết, viền chọn, biểu đồ cột, nút phụ, thẻ) chuyển sang dải xanh tím; nút chính vẫn xanh mực. Bút dạ quang / dòng vừa ghi màu đất nung nhạt, cột Chi của biểu đồ màu đất nung (#D08A5B). Tiền thu vẫn xanh lá.
- Không đổi bố cục, chữ, dữ liệu.

## Nhân bản phải xác nhận, rồi mở trang nhập (05/10/2026)

- Mọi nút **Nhân bản** (dòng Sổ quỹ, dòng Sổ chi phí, phiếu nhập chi phí; cả phím **Ctrl D**) giờ hiện hộp thoại tóm tắt dữ liệu sắp chép; **Hủy** thì không làm gì, **Nhân bản và mở trang nhập** thì mở trang nhập đã điền sẵn, chưa lưu gì cho đến khi bấm Ghi sổ.
- Trước đây nhân bản dòng ở Sổ chi phí lưu ngay một dòng mới; nay mở trang Phiếu nhập chi phí (địa chỉ `#/cp-nhap?nhanbandong=<id>`) với dòng đã chép (ngày hôm nay, số phiếu để trống) để kiểm tra rồi ghi sổ.
- Nút “Nhân bản dòng” trong lưới của trang Phiếu nhập chi phí chỉ chép trong bảng đang soạn (chưa lưu) nên không hỏi.

## Menu trái xanh lá đậm như giao diện cũ (05/10/2026)

- Menu trái đổi sang nền **xanh lá đậm** (#1E4636) để tách hẳn khỏi vùng nội dung: chữ và biểu tượng sáng, tên nhóm xanh nhạt, rê chuột nền sáng mờ, mục đang mở là thẻ trắng chữ xanh đậm; chân menu (tồn quỹ) và dòng ngăn cách cũng theo màu mới. Thay cho nền xám nhạt trước đó; bố cục, chữ, phím tắt không đổi.
- Chữ menu lớn hơn một chút: mục 15,5px (trước 14px), biểu tượng 19px, tên nhóm 12px, mỗi mục cao 32px.

## Phiếu thu / chi nhiều dòng, mỗi dòng một dự án (05/10/2026)

- Form **Ghi thu / chi** có bảng **Các dòng của phiếu**: phần chung (ngày, số phiếu, nhà cung cấp, người nhận, ghi chú) + nhiều dòng, mỗi dòng có nội dung, **dự án**, mã vật tư, số tiền riêng. Chi ông A 100tr chia 5 dòng × 20tr gắn 5 dự án thì công nợ NCC theo từng công trình giảm đúng (trước đây một phiếu chỉ gắn được một dự án).
- Thêm dòng bằng nút **Thêm dòng** hoặc Enter ở ô cuối dòng cuối; bấm × để bỏ dòng; có tổng phiếu (kèm số bằng chữ); ô Dự án hiện số NCC còn nợ tại dự án đó; nội dung dòng để trống thì lấy theo dòng đầu.
- Bảng dòng dựng giống lưới **Phiếu nhập chi phí** (ô gõ thẳng trong bảng, cột #, tên dự án và số NCC còn nợ ngay cạnh mã dự án); phần **Tổng phiếu** chữ lớn (22px, gạch đôi) kèm số tiền bằng chữ cỡ 16px.
- Dữ liệu không đổi lược đồ: mỗi dòng vẫn là một dòng sổ thu chi, các dòng cùng số phiếu được gộp khi in và ở Phiếu thu / chi như trước.
- **Sửa cả phiếu**: từ form sửa một dòng, liên kết “Sửa cả phiếu (N dòng)” mở mọi dòng cùng số phiếu để sửa, thêm, bỏ (dòng bỏ vào Thùng rác).
- API mới `POST /api/entries/phieu { rows, xoa }` (quyền “ghi”): thêm / sửa / bỏ nhiều dòng trong **một lần lưu**, kiểm tra hết mới ghi (một dòng sai thì không ghi dòng nào, lỗi nêu rõ “Dòng N”), tôn trọng khóa sổ, ghi nhật ký từng dòng.

## Màu nền, chữ và cỡ chữ trở lại như giao diện cũ (05/10/2026)

- Giữ nguyên bố cục và thao tác của giao diện mới (menu trái, thanh công trình, thanh kỳ, phím tắt); chỉ đổi lại **màu nền, font và cỡ chữ** theo bản cũ.
- **Màu**: nền trang xanh nhạt #f4f6f1, khung / bảng trắng, viền xanh lá nhạt, chữ xanh mực #172a4e; nút chính và mục menu đang mở màu xanh mực; biểu đồ lại dùng thu xanh lá, chi cam, đường lũy kế nâu vàng. Menu trái vẫn nền xám nhạt như đã chọn.
- **Chữ**: font Archivo (biến thiên, có tiếng Việt, đóng gói sẵn) thay Barlow; tiêu đề trang 26px, chữ thường 14px, bảng 13.5px, nút 36px (nút nhỏ 32px), ô nhập 36px, số tổng 19px.
- Góc vuông và dấu “+” ở góc khung giữ như giao diện mới. Không đổi dữ liệu, công thức, API, lược đồ.

## Menu trái nền xám nhạt (04/10/2026)

- Theo bản cập nhật menu 1a (phương án “Xám nhạt”): nền menu neutral-200 #e7e7ea, đường kẻ neutral-300, tên nhóm và chữ phụ neutral-800, rê chuột neutral-300; mục đang mở giữ nền xanh thép accent-700.

## Phiếu chi có mục Mã vật tư (03/10/2026)

- Form **Ghi thu / chi** (loại Chi tiền) thêm ô **Mã vật tư** (không bắt buộc, gõ mã hoặc tên). Lưu thành trường `maVT` của dòng sổ quỹ (không đổi lược đồ: nằm trong cột `khac`); hiện ở Sổ quỹ, ở danh sách dòng của Phiếu thu / chi, tìm kiếm được (Sổ quỹ và Ctrl K).
- Mã vật tư lạ bị từ chối; mã đã gộp tự đổi sang mã đích; đổi mã vật tư và Gộp mã đi theo dòng sổ; vật tư đang có dòng sổ không xóa được.
- **Phiếu in 2 liên** có thêm dòng “Vật tư: MÃ – Tên” khi phiếu có dòng gắn vật tư (file Excel một phiếu ghi kèm vào Lý do chi).
- **Excel sổ thu chi** (Toàn bộ sổ sách và Sổ thu chi theo bộ lọc) thêm cột cuối **Mã Vật Tư** (cột N); nhập lại đọc cột này: mã khớp danh mục (không phân biệt hoa / thường, mã cũ đã gộp tự đổi) được giữ, mã chưa có trong danh mục vật tư bị bỏ kèm cảnh báo ở bước xem trước.

## Biểu đồ theo giao diện mới (03/10/2026)

- **Tổng quan · Thu, chi trong ngày**: đổi sang cột Thu (xanh thép) và Chi (xám) cạnh nhau cho mỗi ngày (kỳ dài hơn 120 ngày gộp theo tuần), góc vuông, nền trắng, chỉ có mốc “Cao nhất” và trục ngày; bỏ đường tồn quỹ (tồn quỹ vẫn ở dòng phương trình phía trên và trong chú thích khi rê chuột: thu, chi, thay đổi, tồn quỹ cuối ngày).
- **Tổng hợp chi phí · Chi phí theo tháng**: cột vuông xanh thép, đường lũy kế nét đứt màu mực (bỏ màu nâu vàng dành cho cảnh báo).
- **Giá vật tư · Đơn giá theo thời gian**: nhiều nhà cung cấp phân biệt bằng nét liền / đứt trong thang xanh thép và xám (không dùng màu đỏ, xanh lá, nâu của trạng thái); điểm đánh dấu hình vuông.

## Giao diện mới theo design system “Industry” (03/10/2026)

Dựng lại toàn bộ giao diện theo bản thiết kế (bản vẽ kỹ thuật, xanh thép). **Không đổi dữ liệu, công thức, API, lược đồ** (vẫn lược đồ 7).

- **Nền**: chữ Barlow / Barlow Condensed đóng gói sẵn (có tiếng Việt, chạy offline, thay Archivo); icon **Lucide** nét 1.5 thay Phosphor (vẽ bằng CSS mask, mã giao diện vẫn viết `<i class="ph ph-…">`);
  bảng màu mới (nền #f2f2f3, màu hành động #416180, trạng thái nghiệp vụ luôn kèm biểu tượng + chữ); góc vuông, khung nét mảnh có dấu “+” ở 4 góc, nút chính là vật đặc duy nhất.
  `npm run build:assets` sinh lại font và icon từ `@fontsource/barlow`, `@fontsource/barlow-condensed`, `lucide-static` (file sinh ra đã nằm sẵn trong `public/vendor`).
- **Khung ứng dụng**: menu bên trái nhóm theo trình tự công việc (Nhập liệu / Sổ sách / Báo cáo / Danh mục / Hệ thống), rộng 248px, mỗi mục một biểu tượng Lucide 18px (đã bỏ ô mã 2 chữ và chú thích phím F2/F3), nhãn số việc ở Kiểm soát, chân menu một hàng (tồn quỹ · giờ lưu · nút thu gọn); thu gọn bằng **Ctrl B** còn 56px, nhớ theo người dùng;
  thanh trên có **chọn công trình dùng chung** cho mọi sổ và báo cáo, **tìm toàn cục Ctrl K**, **F2 = Nhập phiếu chi phí**, **F3 = Ghi thu / chi** (đổi chỗ so với bản trước; Alt+N vẫn mở Ghi thu / chi),
  **Ctrl L** khóa màn hình (khi bật đăng nhập). **Chọn kỳ thống nhất** Tháng | Quý | Năm | Khoảng ngày | Toàn bộ với mũi tên ‹ ›; **mật độ bảng Gọn / Thoáng**.
- **Màn hình mới**: **Số dư đầu kỳ NCC** (menu riêng), **Nhập từ Excel** (tách khỏi Cài đặt), **Sổ chi tiết công nợ** NCC (từng phiếu / khoản thanh toán, lũy kế Có / Nợ, Alt ↑↓ đổi NCC),
  **Biên bản đối chiếu công nợ** A4 để in, **Công nợ NCC theo kỳ** (gộp “Tổng hợp NCC” và “Công nợ NCC”: Dư Nợ | Dư Có đầu kỳ và cuối kỳ, hàng thao tác mở rộng).
  Quy ước hiển thị: **Dư Có = còn phải trả, Dư Nợ = đã ứng trước**, không hiện số âm cho công nợ.
- **Phiếu nhập chi phí**: đầu phiếu một hàng, dòng lỗi / cảnh báo đơn giá có dòng báo ngay dưới (nút Dùng giá cũ / Giữ), đếm lỗi — cảnh báo, **Ctrl S** lưu nháp, **Ctrl D** nhân bản dòng, **in phiếu nhập**.
  **Sổ quỹ**: tích chọn nhiều dòng để ghi sổ nháp / xóa hàng loạt, nút in phiếu. **Sổ chi phí**: nhãn “Đang lọc”, nút **“N ĐVT”** thay cho cột chữ dài ở dòng tổng. **Phiếu thu / chi**: 3 cột (danh sách, xem trước, nội dung in), **Ctrl P**.
  Tổng quan: “Cần chú ý hôm nay” có nút đi thẳng tới chỗ xử lý.
- **Thao tác ở dòng** luôn hiện (không chờ rê chuột) theo thứ tự Xem → Sửa → Nhân bản → In → Xóa; **Enter / Ctrl D / Delete / Ctrl P** trên dòng đang chọn; xóa mờ đi kèm lý do khi mã đã có dòng (dùng Gộp mã).
  Hộp xác nhận xóa viền đỏ, nêu **công nợ sau khi xóa**; bấm dòng thuộc tháng đã khóa mở hộp “Kỳ … đã khóa”.
- **Điện thoại** (≤ 767px) — bố cục cơ bản, chưa thuộc phạm vi kiểm thử: thanh dưới 5 nút, Tổng quan gọn, Sổ quỹ dạng thẻ (bấm để Ghi sổ · Sửa · Nhân bản · Xóa), mỗi dòng phiếu nhập là một thẻ.
  Một số màn hình chưa được tinh chỉnh cho điện thoại (ví dụ dải tổng ở Sổ chi phí còn rộng hơn màn hình).
- **Chọn nhiều dòng ở danh mục** (Công trình, NCC, Vật tư, Hạng mục, Nhà/khu): thanh “Đã chọn N · Gộp mã · Xóa · Bỏ chọn”; xóa nhiều bỏ qua và báo các mã đang có dòng. Sổ chi phí: **Tab / Shift+Tab** khi sửa trực tiếp lưu ô rồi sang ô kế tiếp / trước.
  Hộp thoại “Trả NCC từ nguồn khác” và “Số dư đầu kỳ” dựng lại theo bản vẽ 12b / 12c (Dư Có / Dư Nợ, “Xem sổ”, ngày phát sinh đầu tiên, chứng từ gốc).
- Trạng thái bảng: đang tải (khung xương), mất kết nối (màn cũ mờ, tự thử lại 5 giây), chỉ xem (dải xám có ổ khóa).
- Tên phần mềm giữ **Kế Toán Công Trình**; tên đơn vị (Cài đặt) hiện dưới tên phần mềm. Mục “Dự toán – thực tế” trong bản thiết kế không có dữ liệu tương ứng (sheet DUTOAN đã bỏ theo yêu cầu) nên thay bằng **Tổng hợp chi phí**.

## Công nợ nhà cung cấp theo kỳ: Đầu kỳ, Phát sinh, Thanh toán, Cuối kỳ; nhập số dư đầu kỳ (02/10/2026)

- **Số dư đầu kỳ NCC** (mới): nhập công nợ có từ trước khi ghi sổ — theo NCC, có thể ghi công trình; “còn nợ” hoặc “đã ứng trước”;
  ngày tính; ghi chú. Nhập ở Tổng hợp NCC (nút **Đầu kỳ**, **Số dư đầu kỳ**) hoặc khung chi tiết của Công nợ NCC. Sửa / xóa (Thùng rác),
  khóa sổ, nhật ký, đổi mã / gộp mã như các dữ liệu khác. Lưu trong bảng mới `soDuDauKy` (lược đồ dữ liệu **7**; lần đầu mở bản mới
  phần mềm tự sao lưu `truoc-nang-cap-luoc-do-7` rồi thêm bảng, dữ liệu cũ giữ nguyên).
- **Tổng hợp NCC** (sổ thu chi) thay cột “Đã thanh toán” bằng bảng công nợ theo kỳ: **Đầu kỳ + Phát sinh trong kỳ − Thanh toán trong kỳ
  = Cuối kỳ** cho từng mã NCC, có dòng phương trình tổng, tổng còn nợ / ứng dư, sắp xếp theo còn nợ cuối kỳ. Xuất Excel `Tong_Hop_NCC` cùng 4 cột.
- **Công nợ NCC**: thêm cột **Đầu kỳ** (Còn lại = Đầu kỳ + Chi phí phát sinh − Đã trả), mục “Số dư đầu kỳ” trong khung chi tiết; bảng theo
  công trình ghi “đầu kỳ …” dưới chi phí phát sinh, % đã thanh toán tính trên đầu kỳ + phát sinh.
- **Excel**: file Chi phí công trình có sheet **SO_DU_DAU_NCC** (khi có dữ liệu); `CONGNO_NCC` thêm cột C “Số dư đầu kỳ” (công thức SUMIFS
  sheet đó; các cột sau dời sang phải một cột); nhập lại file thì số dư đầu kỳ được nhập theo, khoản trùng bỏ qua. File Công nợ thêm cột
  “Số dư đầu kỳ” và sheet `So_Du_Dau_Ky`.
- Cửa sổ dòng lệnh khi chạy phần mềm ghi tên mới “KẾ TOÁN CÔNG TRÌNH”.

## Biểu tượng Desktop mang tên và logo mới (02/10/2026)

- `TaoBieuTuongDesktop.bat` tạo biểu tượng **Kế Toán Công Trình** với logo Điền Thủy (`public/img/bieu-tuong.ico`, nền trắng bo góc để rõ
  trên mọi hình nền) thay cho biểu tượng “So Thu Chi” hình mặc định của Windows; biểu tượng cũ trỏ vào đúng thư mục phần mềm được tự bỏ.
  Phần tạo biểu tượng nằm trong `scripts/tao-bieu-tuong.ps1` (UTF-8 có BOM để giữ đúng chữ có dấu).

## Chuyển dòng khoán cũ sang “theo khoản”; đính kèm ảnh / tài liệu khi lập phiếu nhập (02/10/2026)

- **Dòng khoán lưu kiểu cũ** (Số lượng 1 × Đơn giá = Thành tiền, do bản trước tự gán): Sổ chi phí hiện thông báo “Có N dòng…” →
  **Xem và chuyển**: danh sách các dòng (đã chọn sẵn tất cả; nút “Bỏ chọn dòng có mã vật tư” để giữ lại các lần mua thật đúng 1 đơn vị),
  bấm **Chuyển** → Số lượng, Đơn giá để trống, Thành tiền giữ nguyên. Sao lưu `truoc-chuyen-theo-khoan` trước khi đổi, bỏ qua tháng đã
  khóa sổ, ghi nhật ký từng dòng. Khi đăng nhập bật: chỉ Chủ (quyền mới “sửa hàng loạt dữ liệu cũ”).
- **Nhập dữ liệu cũ**: nhập file Excel chi phí (trong phần mềm và công cụ dòng lệnh) thì dòng Số lượng 1 × Đơn giá = Thành tiền tự nhập
  thành dòng theo khoản (bước xem trước có cảnh báo số dòng). Gộp file cũ vào dữ liệu — dù dữ liệu đã chuyển hay chưa — không nhân đôi.
  Khôi phục bản sao lưu thì giữ nguyên như lúc sao lưu (dùng nút chuyển ở Sổ chi phí nếu cần).
- **Phiếu nhập chi phí mới** và **Ghi thu / chi (dòng mới)**: chọn ảnh / tài liệu ngay khi lập; file tự tải lên và gắn vào phiếu / dòng
  khi bấm Ghi phiếu / Ghi sổ / Lưu nháp (không còn phải lưu rồi mở lại mới đính kèm được).
- Sửa lỗi: bấm Sửa phiếu nhập, bấm × xóa một dòng (chưa lưu) rồi bấm Sửa lại đúng phiếu đó thì không mở lại được — nay luôn mở phiếu như
  đã lưu (hỏi trước khi bỏ thay đổi chưa lưu); quay lại phiếu đang sửa dở có thông báo và nút **Mở lại bản đã lưu**.
- **Chứng từ đính kèm** nhận thêm Word (.docx, .doc) và Excel (.xlsx, .xls), nhận theo nội dung file, từ chối file có macro; Word / Excel
  luôn tải về (không mở trong trình duyệt).
- Kiểm thử mới DK2, DK3 (`tests/d-chi-phi-theo-khoan.test.js`), TL1, TL2 (`tests/n6-dinh-kem-tai-lieu.test.js`); E4 so sánh theo dạng
  đã chuyển.

## Đổi tên thành "Kế Toán Công Trình", thêm logo công ty Điền Thủy (02/10/2026)

- Tên phần mềm hiển thị đổi từ “Sổ Thu Chi” thành **Kế Toán Công Trình**: tiêu đề tab trình duyệt, thanh bên, màn đăng nhập, trang in
  mã dự phòng, file mã khôi phục, thông tin “người tạo” của file Excel, tiêu đề cửa sổ KhoiDong.bat, lệnh cứu hộ. Tên file tải về
  (`SoThuChi_….xlsx`, `SaoLuu_SoThuChi_….db`…) giữ nguyên để không lẫn với các bản đã lưu.
- Logo công ty (đã bỏ nền xám, `public/img/logo-dien-thuy.png`, hình ngôi nhà `logo-dien-thuy-hinh.png`): màn cao hiện logo đầy đủ trên
  thẻ trắng ở đầu thanh bên; màn thấp (laptop 1366×768) hiện hình ngôi nhà cạnh tên phần mềm để menu không phải cuộn (gọn hơn trước);
  thanh thu gọn chỉ hiện hình. Màn đăng nhập và biểu tượng tab trình duyệt dùng hình ngôi nhà.

## Dòng chi phí chỉ có Thành tiền (theo khoản) — không tự gán Số lượng 1 (02/10/2026)

- Phiếu nhập chi phí: dòng chỉ nhập **Thành tiền** (nhân công, phí, hóa đơn bán lẻ nhiều món chỉ ghi tổng) được lưu với **Số lượng
  và Đơn giá để trống** — trước đây phần mềm tự gán Số lượng 1 × Đơn giá = Thành tiền. Sổ chi phí, báo cáo chi tiết hiện “theo khoản”
  ở cột Đơn giá; tổng tiền, công nợ, báo cáo không đổi.
- Thống kê giá vật tư (giá gần nhất, thấp / cao nhất, bình quân), lịch sử giá, gợi ý giá lần trước **bỏ qua** dòng theo khoản; mục
  “Cần xử lý” không còn coi dòng theo khoản là thiếu số lượng.
- Sổ chi phí: xóa trống ô Số lượng hoặc Đơn giá (bấm đúp để sửa) thì dòng thành “theo khoản”, giữ nguyên Thành tiền — dùng để sửa các
  dòng cũ. Dữ liệu cũ KHÔNG tự đổi (không phân biệt được dòng khoán cũ với dòng mua đúng 1 đơn vị).
- Excel: xuất ghi thẳng Thành tiền (không phải công thức SL × ĐG) cho dòng theo khoản; nhập lại (gộp) không nhân đôi, nhập thay thế giữ
  nguyên. Nhập file ChiPhi_CongTrinh (trong phần mềm và công cụ dòng lệnh): dòng chỉ có Thành tiền nhập thành dòng theo khoản.
- Kiểm thử mới `tests/d-chi-phi-theo-khoan.test.js` (DK1); cập nhật D3.4, I2, I7 theo quy tắc mới.

## Biểu đồ "Nhịp tồn quỹ theo ngày" ở Tổng quan (01/10/2026)

- Hai khung chung trục ngày: trên là tồn quỹ cuối ngày (đường bậc thang, nền chuyển màu; phần âm quỹ tô đỏ nhạt), dưới là **cột thu
  (lên) / chi (xuống)** từng ngày — kỳ dài hơn 120 ngày gộp theo tuần. Nhìn là thấy ngày nào tiền vào / ra làm tồn quỹ nhảy.
- Chú thích (Tồn quỹ, ▲ Thu, ▼ Chi); nhãn Cao nhất / Thấp nhất (khi âm) / Cuối kỳ có viền nền để không lẫn vào đường; trục ngày theo
  lịch (mỗi 1–14 ngày hoặc theo tháng, thêm năm khi kỳ vắt qua năm); thang tồn quỹ bỏ khoảng trống thừa.
- Rê chuột: một đường dóng qua cả hai khung, bảng nhỏ có thu, chi, thay đổi trong ngày. Màn hẹp (điện thoại): nhãn cuối kỳ nằm trong
  vùng vẽ, không mất lề phải.
- Màu thu #2A8A66 / chi #D97A2B đã kiểm bằng công cụ kiểm bảng màu (đủ tương phản, phân biệt được với người mù màu nhờ thêm hướng cột
  lên / xuống và chú thích).

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
