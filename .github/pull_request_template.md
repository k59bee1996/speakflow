## Thay đổi

<!-- Mô tả ngắn. Ghi "Closes #<số issue>" nếu PR đóng một issue. -->

## Checklist thiết kế (bắt buộc nếu PR đụng tới giao diện)

- [ ] Chỉ dùng token trong `frontend/src/styles/tokens.css`, không có mã màu hay font viết tay
- [ ] Chỉ dùng component trong `frontend/src/components/ui/`; component mới đã được ghi vào `docs/design/DESIGN.md`
- [ ] Màn theo đúng mẫu ở mục 4 của `docs/design/DESIGN.md`, có đủ trạng thái đang tải, trống, lỗi
- [ ] `npm --prefix frontend run lint` và `npm --prefix frontend run lint:styles` không có lỗi
- [ ] Đính kèm ảnh chụp 390 × 844, chế độ sáng và tối
- [ ] Đã đối chiếu wireframe; khác biệt (nếu có) và lý do:

## Kiểm tra

- [ ] `npm --prefix frontend run lint`
- [ ] `npm --prefix frontend run lint:styles`
- [ ] `npm --prefix frontend run build`