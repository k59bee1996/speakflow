# Speakflow design system

Tài liệu này là luật thiết kế của Speakflow. Mọi màn hình, mọi thay đổi layout, dù do người hay AI agent làm, đều phải theo đúng tài liệu này.

- Wireframe gốc v0.2: https://claude.ai/artifact/DBJxog1GcvzqXdEiZBUcaw
- Token: `web/src/styles/tokens.css`
- Component dùng chung: `web/src/components/ui/`

Thứ tự ưu tiên khi có mâu thuẫn: tài liệu này, rồi `tokens.css`, rồi wireframe.

## 1. Nguyên tắc

1. **Tập trung vào việc nói.** Mỗi màn chỉ có một việc chính và một nút chính. Không thêm trang trí, hình minh hoạ hay số liệu không giúp người dùng nói.
2. **Tối giản, chuyên nghiệp.** Phong cách Minimalism & Swiss: nền phẳng, viền mảnh, không bóng đổ, không gradient, không claymorphism, không emoji trong giao diện.
3. **Người dùng luôn biết mình đang ở đâu.** Màn trong buổi học luôn có thanh tiến độ 5 phần và dòng “Buổi N, phần X trên 5”.
4. **Điện thoại trước.** Thiết kế ở khổ 390 × 844, sau đó mới kiểm trên màn rộng.
5. **Ai cũng dùng được.** Vùng chạm từ 44px, viền focus nhìn rõ, tương phản đạt WCAG AA, tôn trọng chế độ giảm chuyển động.

## 2. Token

Luôn dùng biến CSS, không bao giờ viết giá trị trực tiếp. Danh sách đầy đủ ở `tokens.css`; bảng dưới là ý nghĩa của từng nhóm.

### Màu

| Token | Dùng cho |
| --- | --- |
| `--color-bg` | Nền màn hình |
| `--color-surface` | Thẻ, khung, thanh điều hướng |
| `--color-surface-muted` | Khối phụ bên trong thẻ: ghi chú, câu lệnh, gợi ý |
| `--color-border`, `--color-border-strong` | Viền, phần tiến độ chưa tới, viền nét đứt |
| `--color-text`, `--color-text-muted` | Chữ chính, chữ phụ |
| `--color-primary` | Nút chính, phần đang làm, mục điều hướng đang chọn, âm nhấn, liên kết |
| `--color-inverse` | Nút hành động phụ nhưng quan trọng trong phần (ví dụ “Lật thẻ”, “Tôi đã nói theo”), lựa chọn đang bật của segmented control |
| `--color-success` | Phần đã xong, huy hiệu hoàn thành |
| `--color-danger` | Chỉ cho nút “Quên” và thông báo lỗi |
| `--color-highlight-bg`, `--color-highlight-text` | Chip từ khoá, ô biến cần điền như `[company]` |

Màu chỉ mang thêm ý nghĩa, không bao giờ là cách duy nhất để truyền đạt thông tin: phần đã xong vẫn có chữ hoặc vị trí cho biết.

### Chữ

- `--font-ui` (Be Vietnam Pro) cho toàn bộ giao diện tiếng Việt.
- `--font-display` (Lexend) cho tiêu đề màn, logo, đồng hồ, và mọi câu tiếng Anh người dùng phải đọc hoặc nói. Câu tiếng Anh luôn có `lang="en"`.
- Không thêm font nào khác. Font mới phải có bộ dấu tiếng Việt.

| Vai trò | Token | Font | Độ đậm |
| --- | --- | --- | --- |
| Tiêu đề màn Hôm nay | `--text-display` | display | bold |
| Tiêu đề phần | `--text-title` | display | bold |
| Đồng hồ | `--text-timer` | display | bold, số đều nhau |
| Câu cần luyện | `--text-practice` (câu nghe-nhại 24px) | display | regular hoặc semibold |
| Nội dung | `--text-body`, `--text-ui` | ui | regular, medium |
| Chữ phụ, nhãn | `--text-small`, `--text-caption` | ui | regular |

### Khoảng cách, bo góc, kích thước

- Lề màn hình `--screen-padding` (20px). Khoảng cách giữa các khối dùng thang `--space-*`; không dùng giá trị ngoài thang.
- Bo góc: chip 6, ô nhập 10, nút chấm điểm 12, thẻ 14, thẻ chính của màn (câu luyện, flashcard) 16, nút dạng viên thuốc 999.
- Nút chính cao `--cta-height` (52px). Mọi thứ bấm được cao tối thiểu `--touch-min` (44px).

## 3. Component

Chỉ dựng màn từ các component trong `web/src/components/ui/`. Thiếu component thì thêm vào đó và ghi vào bảng này trong cùng pull request.

| Component | Mô tả và luật dùng |
| --- | --- |
| `Screen` | Khung màn hình: nền `--color-bg`, lề 20px, cột dọc. |
| `SessionHeader` | Nút đóng (X, 44px, về Hôm nay), dòng “Buổi N, phần X trên 5”, thời lượng hoặc đồng hồ chuẩn bị, `ProgressSegments`, tiêu đề phần. Bắt buộc ở mọi màn trong buổi học. |
| `ProgressSegments` | 5 đoạn cao 6px, cách nhau 6px. Đã xong: `--color-success`; đang làm: `--color-primary`; chưa tới: `--color-border`. |
| `Button` | Biến thể `primary` (nền primary, cao 52px, bo 14), `inverse`, `outline` (nền surface, viền border, dạng viên thuốc), `link` (chữ primary, không nền). Mỗi màn tối đa một `primary`. |
| `Card` | Nền surface, viền 1px border, bo 14, đệm 14–16px. `Card hero` cho câu luyện và flashcard: bo 16, đệm 20–24px. |
| `Chip` | Từ khoá và nhãn ngắn: nền highlight, chữ highlight, bo 6. |
| `FillSlot` | Ô biến cần điền như `[company]`: nền highlight, chữ highlight đậm, bấm vào để sửa. |
| `SegmentedControl` | Chọn 30 hoặc 60 phút, các lần nói 4/3/2. Lựa chọn đang bật dùng màu inverse. |
| `GradeButtons` | 4 nút Quên, Khó, Được, Dễ, mỗi nút có nhãn và khoảng thời gian ôn tiếp. “Quên” dùng chữ màu danger. |
| `Timer` | Số lớn Lexend, chú thích bên dưới, nút “Tạm dừng” và “Thêm 1 phút” dạng outline. |
| `BottomNav` | 4 mục: Hôm nay, Thẻ, Sổ câu bí, Lịch sử. Biểu tượng nét 1.8, mục đang chọn màu primary và có `aria-current="page"`. Cài đặt nằm ở góc phải trên màn Hôm nay. |
| `Notice` | Thông báo có nút: nền highlight nhạt, viền primary nhạt, bo 14. |
| `Field` | Ô nhập và ô văn bản luôn có `label`, bo 10, viền border. |

## 4. Mẫu màn hình

### Màn trong buổi học

1. `SessionHeader`
2. Phần nội dung chính, cuộn được nếu dài
3. Vùng hành động dưới cùng: một nút `primary` cho bước tiếp theo, có thể kèm một nút `link` như “Bỏ qua phần này”.

### Màn ngoài buổi học (Hôm nay, Thẻ, Sổ câu bí, Lịch sử)

1. Thanh trên: logo “Speakflow” màu primary bên trái, thông tin phụ và nút Cài đặt bên phải
2. Nội dung
3. `BottomNav`

### Trạng thái

Mỗi màn phải có đủ: đang tải, trống, lỗi, bình thường. Lỗi hiển thị thông báo tiếng Việt từ API (`detail`), không bao giờ để màn trắng.

## 5. Chữ trong giao diện

- Giao diện bằng tiếng Việt, câu ngắn, giọng thân thiện, xưng “bạn”.
- Dùng dấu ngoặc kép cong “ ” và dấu nháy ’ trong chữ hiển thị.
- Nhãn nút là động từ chỉ đúng việc sẽ xảy ra: “Bắt đầu buổi 1”, “Lật thẻ”, “Sang phần 3: bài nói chính”.

## 6. Chế độ tối

Chế độ tối chỉ được làm bằng cách đổi token trong `tokens.css`. Component không được có màu riêng cho chế độ tối.

## 7. Điều cấm

- Viết mã màu, font, hay khoảng cách trực tiếp trong component.
- Thêm thư viện UI (MUI, Chakra, Bootstrap…) hoặc bộ icon khác.
- Thêm bóng đổ, gradient, ảnh minh hoạ, emoji trong giao diện.
- Đặt hai nút `primary` trên cùng một màn.
- Sửa `tokens.css` hoặc tài liệu này khi chưa được Hoàng yêu cầu.

## 8. Kiểm tra trước khi merge

- [ ] `npm run lint` và `npm run lint:styles` không có lỗi
- [ ] Ảnh chụp màn hình ở khổ 390 × 844, cả chế độ sáng và tối, đính kèm trong pull request
- [ ] Đối chiếu với wireframe; ghi rõ chỗ nào khác và vì sao
- [ ] Đi hết màn bằng bàn phím: thứ tự focus hợp lý, viền focus nhìn thấy
