# Bảng màu Industry – hành Kim

Dùng để đưa giao diện Kế Toán Công Trình sang web khác.

| File | Dùng khi |
|---|---|
| `mau-sac.css` | Web thường (HTML/CSS thuần, React, Vue…). Có biến CSS và vài mẫu nút, bảng, chip. |
| `tailwind-v4.css` | Dự án Tailwind v4: dán khối `@theme`. |
| `tailwind.config.js` | Dự án Tailwind v3: gộp vào `theme.extend`. |
| `tokens.json` | Figma Tokens, Style Dictionary hoặc công cụ khác. |

## Quy tắc dùng màu
- **Nền trang** `paper`, **thẻ / bảng / ô nhập** `sheet`, **đầu cột bảng** `head`, **dòng tổng** `surface`.
- **Chữ chính** `ink`, **phụ** `ink-2`, **mờ** `ink-3`. Không dùng xám nhạt hơn `ink-3` cho chữ.
- **Nút chính, liên kết, viền focus** dùng `pen` (vàng đồng đậm). Menu đang chọn dùng `accent-700`.
- **Đỏ chỉ cho lỗi, xóa, số âm.** Tiền thu và hoàn tất dùng xanh lá `income`. Cảnh báo dùng `caution`.
- **Trạng thái luôn kèm biểu tượng và chữ**, không chỉ dựa vào màu.
- **Góc vuông** (`radius: 0`), viền mảnh 1px, đổ bóng nhẹ. Không dùng gradient màu.
- **Biểu đồ:** 3 màu vàng đồng, xanh thép, xanh rêu (người khó phân biệt màu vẫn đọc được), xám cho "Khác". Dữ liệu chi dùng vàng đồng, thu dùng xanh lá.
- **Font:** Archivo Variable (tải từ Google Fonts hoặc tự host), dự phòng Segoe UI.

## Độ tương phản đã tính (WCAG, đạt 4.5:1 cho chữ thường)
| Cặp màu | Tỉ lệ |
|---|---|
| ink / paper | 12,3 |
| ink / sheet | 14,5 |
| ink-2 / sheet | 8,1 |
| ink-3 / paper | 5,4 |
| pen (liên kết) / sheet | 5,9 |
| paper / pen (chữ nút chính) | 5,0 |
| paper / accent-700 (menu chọn) | 5,5 |
| alert / alert-soft | 5,4 |
| income / income-soft | 5,3 |
| caution / caution-soft | 5,2 |
| viền ô nhập `field` / sheet | 3,3 (đạt 3:1 cho thành phần giao diện) |
