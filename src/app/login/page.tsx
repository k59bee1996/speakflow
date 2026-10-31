"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Nhập một địa chỉ email hợp lệ.");
      return;
    }
    setError("");
    setState("sending");
    const { error } = await createClient().auth.signInWithOtp({
      email: value,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setState("idle");
      setError("Chưa gửi được email đăng nhập. Thử lại sau ít phút.");
      return;
    }
    setState("sent");
  }

  const [linkError, setLinkError] = useState(false);
  useEffect(() => {
    setLinkError(new URLSearchParams(window.location.search).get("error") === "link");
  }, []);

  return (
    <main className="wrap" style={{ paddingTop: 64, maxWidth: 440 }}>
      <h1>Speakflow</h1>
      <p className="muted">Lộ trình 12 tuần luyện phản xạ nói tiếng Anh, 30–60 phút mỗi ngày.</p>
      {state === "sent" ? (
        <div className="note">
          <p>
            Đã gửi link đăng nhập tới <strong>{email}</strong>. Mở email và bấm vào link để vào app.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              placeholder="ban@example.com"
            />
          </div>
          {error || linkError ? <p className="status err">{error || "Link đăng nhập đã hết hạn. Nhập email để nhận link mới."}</p> : null}
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn" type="submit" disabled={state === "sending"}>
              {state === "sending" ? "Đang gửi…" : "Gửi link đăng nhập"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
