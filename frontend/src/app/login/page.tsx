"use client";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/backend/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try { await api.login(email.trim(), password); window.location.replace("/"); }
    catch (e) {
      setPassword("");
      setError(e instanceof ApiError && e.retryAt
        ? `Đăng nhập tạm khóa. Bạn có thể thử lại lúc ${new Date(e.retryAt).toLocaleString("vi-VN")}.`
        : e instanceof Error ? e.message : "Chưa đăng nhập được. Bạn hãy thử lại.");
      setBusy(false);
    }
  }
  const field = "focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] box-border w-full min-h-touch rounded-token-input border border-solid border-token-border bg-token-surface px-space-3 py-space-3 text-token-text focus-visible:outline-token-primary";
  return <main className="box-border min-h-dvh bg-token-bg p-screen font-token-ui text-token-text">
    <div className="mx-auto flex w-full flex-col gap-space-6 sm:w-1/2 lg:w-1/3">
      <header className="pt-space-7">
        <h1 className="font-token-display text-token-display text-token-primary">Speakflow</h1>
        <p className="text-token-body text-token-text-muted">Đăng nhập để tiếp tục luyện nói.</p>
      </header>
      <form onSubmit={submit} className="flex flex-col gap-space-4" aria-busy={busy}>
        <div className="flex flex-col gap-space-2">
          <label htmlFor="email">Email</label>
          <input className={field} id="email" name="email" type="email" autoComplete="username" required maxLength={256} value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="flex flex-col gap-space-2">
          <label htmlFor="password">Mật khẩu</label>
          <input className={field} id="password" name="password" type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={e => setPassword(e.target.value)} aria-describedby={error ? "login-error" : undefined} />
        </div>
        {error ? <p id="login-error" role="alert" className="m-0 break-words text-token-danger">{error}</p> : null}
        <button type="submit" disabled={busy} className="focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] min-h-cta cursor-pointer rounded-token-card border-0 bg-token-primary px-space-4 text-token-on-primary hover:bg-token-primary-hover focus-visible:outline-token-primary disabled:cursor-wait disabled:opacity-50">{busy ? "Đang đăng nhập…" : "Đăng nhập"}</button>
      </form>
    </div>
  </main>;
}
