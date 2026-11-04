"use client";
import { useEffect, useState } from "react";
import { useApp } from "./AppContext";
import { api } from "@/lib/backend/client";
export default function SettingsView() {
  const { profile, email, updateProfile, signOut, reload, setError } = useApp();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<{ cards: number; notes: number } | null>(null);
  useEffect(() => {
    Promise.all([api.cards(), api.notes()]).then(([cards, notes]) => setCounts({ cards: cards.length, notes: notes.length }))
      .catch(e => setError(e instanceof Error ? e.message : "Không tải được dữ liệu."));
  }, [setError]);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  async function reset() {
    if (!armed) { setArmed(true); return; }
    setArmed(false); setBusy(true);
    try { await api.resetData(); setCounts({ cards: 0, notes: 0 }); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : "Chưa xoá được dữ liệu."); }
    finally { setBusy(false); }
  }
  const button = "focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] min-h-touch cursor-pointer rounded-token-pill border border-solid border-token-border bg-token-surface px-space-4 text-token-primary disabled:opacity-50";
  const field = "focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] min-h-touch rounded-token-input border border-solid border-token-border bg-token-surface px-space-3 text-token-text";
  return <section className="flex flex-col gap-space-4">
    <h1 className="font-token-display text-token-title">Cài đặt</h1>
    <label htmlFor="start">Ngày bắt đầu lộ trình</label>
    <input id="start" type="date" className={field} value={profile.start_date} onChange={e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) void updateProfile({ start_date: e.target.value }); }} />
    <label htmlFor="mode">Thời lượng mỗi ngày</label>
    <select id="mode" className={field} value={profile.mode} onChange={e => void updateProfile({ mode: e.target.value as "30" | "60" })}><option value="30">30 phút</option><option value="60">60 phút</option></select>
    <h2 className="m-0 font-token-display text-token-lead">Tài khoản</h2>
    <p className="m-0 break-words text-token-text-muted">Đăng nhập bằng {email}.</p>
    <button className={button} type="button" onClick={() => void signOut()}>Đăng xuất</button>
    <h2 className="m-0 font-token-display text-token-lead">Dữ liệu</h2>
    <p className="m-0 text-token-text-muted">{counts ? `${counts.cards} thẻ, ${counts.notes} câu trong sổ câu bí.` : "Đang đếm…"}</p>
    <button className={button} type="button" disabled={busy} onClick={() => void reset()}>{busy ? "Đang xoá…" : armed ? "Bấm lần nữa để xoá hết" : "Xoá toàn bộ dữ liệu học"}</button>
  </section>;
}
