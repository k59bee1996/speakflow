"use client";

import { useEffect, useState } from "react";
import { useApp } from "./AppContext";
import { TOTAL_WEEKS } from "@/lib/content";
import { todayISO } from "@/lib/dates";

export default function SettingsView() {
  const { sb, profile, week, email, updateProfile, signOut, reload, setError } = useApp();
  const [armed, setArmed] = useState(false);
  const [counts, setCounts] = useState<{ cards: number; notes: number } | null>(null);

  useEffect(() => {
    Promise.all([
      sb.from("cards").select("id", { count: "exact", head: true }),
      sb.from("notes").select("id", { count: "exact", head: true }),
    ]).then(([c, n]) => setCounts({ cards: c.count ?? 0, notes: n.count ?? 0 }));
  }, [sb]);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  async function resetAll() {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    const uid = profile.user_id;
    const results = await Promise.all([
      sb.from("reviews").delete().eq("user_id", uid),
      sb.from("sessions").delete().eq("user_id", uid),
      sb.from("notes").delete().eq("user_id", uid),
    ]);
    const cards = await sb.from("cards").delete().eq("user_id", uid);
    const prof = await sb.from("profiles").update({ seeded_weeks: [], checks: [], start_date: todayISO(), mode: "30" }).eq("user_id", uid);
    if ([...results, cards, prof].some((r) => r.error)) {
      setError("Chưa xoá hết được dữ liệu. Thử lại sau.");
    }
    await reload();
  }

  const where = week === 0 ? "trước ngày bắt đầu" : week > TOTAL_WEEKS ? "sau tuần 12" : `tuần ${week}`;

  return (
    <>
      <h1>Cài đặt</h1>
      <div className="field">
        <label htmlFor="start">Ngày bắt đầu lộ trình</label>
        <input
          id="start"
          type="date"
          value={profile.start_date}
          onChange={(e) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) updateProfile({ start_date: e.target.value });
          }}
        />
      </div>
      <p className="muted small">
        Hiện bạn đang ở {where}. Đổi ngày bắt đầu sẽ đổi tuần hiện tại và chủ đề tương ứng.
      </p>

      <h2>Tài khoản</h2>
      <p className="muted small">Đăng nhập bằng {email}.</p>
      <button className="btn ghost sm" type="button" onClick={signOut}>Đăng xuất</button>

      <h2>Dữ liệu</h2>
      <p className="muted small">
        {counts ? `${counts.cards} thẻ, ${counts.notes} câu trong sổ câu bí.` : "Đang đếm…"}
      </p>
      <button className="btn danger sm" type="button" onClick={resetAll}>
        {armed ? "Bấm lần nữa để xoá hết" : "Xoá toàn bộ dữ liệu học"}
      </button>

      <h2>Phiên bản</h2>
      <p className="muted small">Speakflow v0.1: màn Hôm nay, ôn thẻ lật ngược, sổ câu bí.</p>
    </>
  );
}
