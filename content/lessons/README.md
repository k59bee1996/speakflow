# Định dạng nội dung một buổi

Mỗi buổi là một file `L001.json` … `L084.json`. Lệnh `seed-content` của API kiểm tra mọi file trước khi ghi vào SQL Server; một file sai thì cả lần seed dừng lại.

Trường bắt buộc:

- `number` (1–84), `stage` (1–12), `title`, `goal`
- `kind`: `normal` hoặc `review`
- `talkType`: `fluency` hoặc `accuracy`
- `shadowing`: đúng 5 câu, mỗi câu gồm `text` và `note`. Âm nhấn đánh dấu bằng `**…**`.
- `cards`: 5–7 thẻ, mỗi thẻ gồm `key`, `frontEn` (tình huống bằng tiếng Anh), `back`, `hintVi`.
- `talk`: `prompt`, `context`, và `steps` đúng 4 bước, mỗi bước gồm `name`, `sample`, `keywords`.
- `qa`: `prompt` và `questions` đúng 5 câu.
- `journal`: đúng 2 câu hỏi.

Buổi ôn tập (`kind: review`) được phép thay phần `talk` bằng danh sách số buổi để bốc câu hỏi.

Biến viết dạng `{{key}}`. Danh sách biến của chặng 1–2: `company`, `role`, `years`, `area`, `previous`, `project`, `result`, `goal`.

Sửa nội dung thì tăng `ContentVersion`; lượt học cũ giữ nguyên.
