# Speakflow v0.1

Web app luyện phản xạ nói tiếng Anh theo lộ trình 12 tuần, 30–60 phút mỗi ngày.

Bản này có ba màn:

- **Hôm nay**: tự tính tuần và giai đoạn, hiện lịch tập theo chế độ 30/60 phút, đánh dấu hoạt động, chuỗi ngày, checkpoint ghi âm.
- **Ôn thẻ**: thẻ lật ngược (tiếng Việt → tiếng Anh) có lịch ôn ngắt quãng, nghe phát âm, “Nói thử” bằng nhận dạng giọng nói của trình duyệt.
- **Sổ câu bí**: ghi ý bằng tiếng Việt, Claude gợi ý hai cách nói, một chạm để thành thẻ.

Công nghệ: Next.js 16 (App Router, TypeScript), Supabase (đăng nhập bằng email, Postgres, Row Level Security), Claude API.

## Chạy trên máy (khoảng 20 phút)

**1. Tạo project Supabase.** Vào [supabase.com](https://supabase.com), tạo project mới. Nên chọn region Singapore cho gần Việt Nam.

**2. Tạo bảng.** Mở SQL Editor trong Supabase, dán toàn bộ nội dung `supabase/migrations/0001_init.sql` rồi chạy. File này tạo 6 bảng và bật Row Level Security để mỗi người chỉ thấy dữ liệu của mình.

**3. Cấu hình đăng nhập.** Trong phần Authentication của Supabase:

- Đảm bảo nhà cung cấp Email đang bật.
- Ở URL Configuration, đặt Site URL là `http://localhost:3000` và thêm `http://localhost:3000/auth/callback` vào Redirect URLs.

**4. Lấy API key Claude.** Tạo key tại [console.anthropic.com](https://console.anthropic.com). Mỗi lần gợi ý sổ câu bí tốn rất ít token; route có giới hạn 50 lần mỗi người mỗi 24 giờ.

**5. Điền biến môi trường.**

```bash
cp .env.example .env.local
```

Điền URL và anon (publishable) key của Supabase (trong phần API của project), cùng `ANTHROPIC_API_KEY`.

**6. Chạy.**

```bash
npm install
npm run dev
```

Mở `http://localhost:3000`, nhập email, bấm link trong email là vào app.

## Đưa lên mạng với Vercel

1. Đẩy code lên GitHub.
2. Trên [vercel.com](https://vercel.com), import repo, thêm 4 biến môi trường giống `.env.local`.
3. Sau khi có domain (ví dụ `speakflow.vercel.app`), quay lại Supabase: đổi Site URL thành domain đó và thêm `https://speakflow.vercel.app/auth/callback` vào Redirect URLs.

Email đăng nhập mặc định của Supabase bị giới hạn số lượng mỗi giờ, đủ cho bạn tự dùng. Khi mời người khác dùng thử, hãy cấu hình SMTP riêng trong Supabase.

## Cấu trúc

```
supabase/migrations/0001_init.sql   Bảng, chỉ mục, Row Level Security
src/proxy.ts                        Làm mới phiên đăng nhập, chặn trang khi chưa đăng nhập
src/app/login                       Đăng nhập bằng link qua email
src/app/auth/callback               Đổi mã trong link thành phiên đăng nhập
src/app/(app)/                      Các màn: / (Hôm nay), /cards, /notes, /settings
src/app/api/suggest/route.ts        Gọi Claude để gợi ý cách nói (chạy trên server, giữ kín API key)
src/components/AppContext.tsx       Hồ sơ, tiến độ, chuỗi ngày, nạp bộ thẻ theo tuần
src/components/*View.tsx            Giao diện từng màn
src/lib/content.ts                  Nội dung lộ trình: giai đoạn, hoạt động, chủ đề, bộ thẻ có sẵn
src/lib/srs.ts                      Thuật toán lịch ôn (biến thể SM-2)
src/lib/queue.ts                    Chọn thẻ cần ôn hôm nay
```

Dữ liệu đi thế nào: trình duyệt đọc và ghi thẳng vào Supabase, Row Level Security đảm bảo mỗi người chỉ chạm được dữ liệu của mình. Chỉ việc gọi Claude đi qua server (`/api/suggest`) để API key không lộ ra trình duyệt.

## Sửa nội dung

Toàn bộ chủ đề tuần, cụm từ, bộ thẻ có sẵn và câu lệnh mẫu nằm trong `src/lib/content.ts`. Sửa ở đó là app cập nhật theo. Thẻ có sẵn được nạp vào tài khoản khi tuần tương ứng tới; thẻ đã nạp sẽ không bị ghi đè.

## Việc tiếp theo

**v0.2: ghi âm và phản hồi bài nói**

- Ghi âm bằng `MediaRecorder` trong trình duyệt, lưu vào Supabase Storage (bucket riêng tư, có policy theo `user_id`).
- Gửi file ghi âm tới dịch vụ nhận dạng giọng nói có mốc thời gian từng từ để lấy transcript.
- Gửi transcript cho Claude để nhận phản hồi: 1 điểm làm tốt, tối đa 3 lỗi kèm cách nói tốt hơn, các cụm của tuần đã dùng.
- Dùng cho ghi âm ngày 0, bài nói 1 phút và checkpoint.

**v0.3: checkpoint có số liệu**

- Tính tốc độ nói (từ/phút), số lần ngập ngừng trên 2 giây, tỉ lệ từ đệm từ transcript.
- Màn so sánh bản ghi ngày 0 với tuần 4, 8, 12.

**Nên làm sớm**

- Thêm `manifest.webmanifest` và icon để cài app lên màn hình điện thoại.
- Viết test cho `src/lib/srs.ts` và `src/lib/queue.ts`.
- Cân nhắc đổi sang thuật toán FSRS (thư viện `ts-fsrs`) khi có nhiều dữ liệu ôn.

## Thiết kế

Mọi thay đổi giao diện phải tuân theo [hệ thống thiết kế](docs/design/DESIGN.md).
