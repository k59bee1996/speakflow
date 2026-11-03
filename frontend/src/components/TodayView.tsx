import Link from "next/link";
export default function TodayView() {
  return <section className="flex flex-col gap-space-4 text-token-text">
    <h1 className="font-token-display text-token-title">Đang chuyển sang v0.2</h1>
    <p className="m-0 text-token-text-muted">Bạn vẫn có thể ôn thẻ và ghi vào sổ câu bí.</p>
    <Link href="/cards" className="flex min-h-cta items-center justify-center rounded-token-card bg-token-primary px-space-4 text-token-on-primary no-underline">Ôn thẻ</Link>
  </section>;
}
