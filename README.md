# Speakflow

Ứng dụng luyện nói tiếng Anh: Next.js 16 trong `frontend/`, ASP.NET Core .NET 10 và SQL Server trong `backend/`.

Đăng nhập bằng email/mật khẩu do CLI tạo. Phiên riêng cho từng thiết bị tồn tại 30 ngày, dùng cookie Secure, HttpOnly, SameSite Strict. Frontend và API được truy cập qua cùng origin HTTPS; Next.js chuyển tiếp yêu cầu tới API qua lớp `src/lib/backend/`. Mật khẩu, cookie và khóa Claude không được ghi vào repository.

## Chạy local

1. Làm theo [hướng dẫn backend](backend/README.md) để chạy SQL Server, cấu hình user-secrets, áp dụng migration và tạo tài khoản.
2. Trong `frontend/`, chạy `npm install`, sao chép `.env.example` thành `.env.local`, đặt `BACKEND_URL` là địa chỉ HTTPS của API.
3. Xuất chứng chỉ ASP.NET development ra thư mục bên ngoài repository:

```powershell
dotnet dev-certs https --export-path "$env:TEMP/speakflow-dev.pem" --format Pem --no-password
$env:NODE_EXTRA_CA_CERTS = "$env:TEMP/speakflow-dev.pem"
npm run dev -- --experimental-https --experimental-https-cert "$env:TEMP/speakflow-dev.pem" --experimental-https-key "$env:TEMP/speakflow-dev.key" --experimental-https-ca "$env:TEMP/speakflow-dev.pem"
```

Chạy các lệnh frontend từ `frontend/`. Mở `https://localhost:3000`. Chứng chỉ development phải được trình duyệt tin cậy khi chạy trên máy hoặc điện thoại; chứng chỉ production do hosting cung cấp. Không tắt kiểm tra TLS của Node. Cờ `--experimental-https-ca` giữ cấu hình CA trong tiến trình con của Next.js development.

## Chức năng hiện tại

- **Thẻ**: thêm/xóa, hàng đợi thẻ đến hạn rồi đến thẻ mới, tối đa 10 thẻ mới/ngày theo ngày local của người dùng, chấm điểm SM-2 trên API.
- **Sổ câu bí**: lưu ý tiếng Việt, hai gợi ý Claude, tự nhập cách nói, chuyển cách nói thành thẻ. Tối đa 50 yêu cầu gợi ý trong 24 giờ; lỗi AI không xóa ghi chú.
- **Cài đặt**: ngày bắt đầu, chế độ 30/60 phút, đăng xuất thiết bị hiện tại và xóa dữ liệu học của tài khoản.
- **Hôm nay/Lịch sử**: thông báo “Đang chuyển sang v0.2” và liên kết tới Thẻ; buổi học mới thuộc Sprint 2.

Supabase đã được gỡ. Không tự chuyển dữ liệu cũ; [migration Supabase](docs/archive/supabase/0001_init.sql) và [README v0.1](docs/archive/v0.1-README.md) được lưu để tham khảo. Tag local `v0.1-before-api-migration-20261103` giữ mốc trước khi chuyển frontend.

## Kiểm tra

Trong `frontend/`: `npm run lint`, `npm run lint:styles`, `npm run typecheck`, `npm run build`.

Trong `backend/`: `dotnet build Speakflow.sln --configuration Release`, `dotnet test Speakflow.sln --configuration Release`.

Quy tắc thiết kế nằm ở [DESIGN.md](docs/design/DESIGN.md). Cấu hình hosting, HTTPS production và backup thuộc issue #6.
