"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { DECK, TOTAL_WEEKS, isSessionComplete } from "@/lib/content";
import { addDays, todayISO, weekOf } from "@/lib/dates";
import { loadQueue } from "@/lib/queue";
import type { Profile } from "@/lib/types";

interface AppState {
  sb: SupabaseClient;
  userId: string;
  email: string;
  profile: Profile;
  week: number;
  sessions: Record<string, string[]>;
  streak: number;
  dueCount: number;
  error: string | null;
  setError: (msg: string | null) => void;
  refreshDue: () => Promise<void>;
  updateProfile: (patch: Partial<Omit<Profile, "user_id">>) => Promise<void>;
  toggleActivity: (key: string) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}

const SESSION_HISTORY_DAYS = 400;

/** Nạp bộ thẻ có sẵn cho những tuần đã tới mà chưa nạp. */
async function seedDeck(sb: SupabaseClient, p: Profile): Promise<Profile> {
  const upTo = Math.min(weekOf(p.start_date), TOTAL_WEEKS);
  const need: number[] = [];
  for (let w = 1; w <= upTo; w++) if (!p.seeded_weeks.includes(w)) need.push(w);
  if (!need.length) return p;

  const today = todayISO();
  const rows = need.flatMap((w) =>
    DECK[w - 1].map(([front, back, note], j) => ({
      user_id: p.user_id,
      front,
      back,
      note: note ?? "",
      week: w,
      seed_key: `w${w}-${j + 1}`,
      due: today,
      is_new: true,
    })),
  );
  const ins = await sb.from("cards").upsert(rows, { onConflict: "user_id,seed_key", ignoreDuplicates: true });
  if (ins.error) throw ins.error;

  const seeded_weeks = Array.from(new Set([...p.seeded_weeks, ...need])).sort((a, b) => a - b);
  const up = await sb.from("profiles").update({ seeded_weeks }).eq("user_id", p.user_id);
  if (up.error) throw up.error;
  return { ...p, seeded_weeks };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const sb = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<Record<string, string[]>>({});
  const [dueCount, setDueCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refreshDue = useCallback(async () => {
    try {
      const q = await loadQueue(sb);
      setDueCount(q.length);
    } catch {
      /* badge là phụ, không chặn giao diện */
    }
  }, [sb]);

  const load = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) {
        window.location.href = "/login";
        return;
      }
      setUserId(user.id);
      setEmail(user.email ?? "");

      const found = await sb.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (found.error) throw found.error;
      let p = found.data as Profile | null;
      if (!p) {
        const created = await sb.from("profiles").insert({ user_id: user.id, start_date: todayISO() }).select("*").single();
        if (created.error) throw created.error;
        p = created.data as Profile;
      }
      p = await seedDeck(sb, p);
      setProfile(p);

      const from = addDays(todayISO(), -SESSION_HISTORY_DAYS);
      const s = await sb.from("sessions").select("day, done").gte("day", from);
      if (s.error) throw s.error;
      const map: Record<string, string[]> = {};
      (s.data as { day: string; done: string[] }[]).forEach((r) => (map[r.day] = r.done));
      setSessions(map);

      await refreshDue();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được dữ liệu. Kiểm tra kết nối và cấu hình Supabase.");
    }
  }, [sb, refreshDue]);

  useEffect(() => {
    load();
  }, [load]);

  const updateProfile = useCallback(
    async (patch: Partial<Omit<Profile, "user_id">>) => {
      if (!profile) return;
      let next: Profile = { ...profile, ...patch };
      setProfile(next);
      const r = await sb.from("profiles").update(patch).eq("user_id", profile.user_id);
      if (r.error) {
        setError("Không lưu được thay đổi. Thử lại sau.");
        setProfile(profile);
        return;
      }
      if (patch.start_date) {
        try {
          next = await seedDeck(sb, next);
          setProfile(next);
          await refreshDue();
        } catch {
          setError("Không nạp được thẻ cho tuần mới.");
        }
      }
    },
    [profile, sb, refreshDue],
  );

  const toggleActivity = useCallback(
    async (key: string) => {
      if (!profile) return;
      const day = todayISO();
      const cur = sessions[day] ?? [];
      const done = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
      setSessions((s) => ({ ...s, [day]: done }));
      const r = await sb
        .from("sessions")
        .upsert({ user_id: profile.user_id, day, done, updated_at: new Date().toISOString() }, { onConflict: "user_id,day" });
      if (r.error) {
        setSessions((s) => ({ ...s, [day]: cur }));
        setError("Không lưu được tiến độ. Thử lại sau.");
      }
    },
    [profile, sessions, sb],
  );

  const signOut = useCallback(async () => {
    await sb.auth.signOut();
    window.location.href = "/login";
  }, [sb]);

  const week = profile ? weekOf(profile.start_date) : 0;

  const streak = useMemo(() => {
    if (!profile) return 0;
    const complete = (day: string) => isSessionComplete(weekOf(profile.start_date, day), sessions[day] ?? []);
    let d = todayISO();
    if (!complete(d)) d = addDays(d, -1);
    let n = 0;
    while (n < SESSION_HISTORY_DAYS && complete(d)) {
      n++;
      d = addDays(d, -1);
    }
    return n;
  }, [profile, sessions]);

  if (!profile) {
    return (
      <div className="wrap" style={{ paddingTop: 48 }}>
        {error ? <p className="err">{error}</p> : <p className="muted">Đang tải…</p>}
      </div>
    );
  }

  const value: AppState = {
    sb, userId, email, profile, week, sessions, streak, dueCount, error, setError,
    refreshDue, updateProfile, toggleActivity, signOut, reload: load,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
