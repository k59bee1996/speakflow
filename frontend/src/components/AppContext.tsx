"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/backend/client";
import type { Profile } from "@/lib/types";
interface AppState {
  email: string; profile: Profile; dueCount: number; error: string | null;
  setError: (message: string | null) => void;
  refreshDue: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<Profile, "start_date" | "mode">>) => Promise<void>;
  signOut: () => Promise<void>; reload: () => Promise<void>;
}
const Context = createContext<AppState | null>(null);
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
const getAppData = () => Promise.all([api.session(), api.profile(), api.queue()]);
export function AppProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [dueCount, setDueCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const refreshDue = useCallback(async () => {
    try { setDueCount((await api.queue()).length); }
    catch (e) { setError(e instanceof Error ? e.message : "Không tải được thẻ."); }
  }, []);
  const applyData = useCallback(([session, profile, queue]: Awaited<ReturnType<typeof getAppData>>) => {
    setError(null); setEmail(session.email); setProfile(profile); setDueCount(queue.length);
  }, []);
  const loadError = useCallback((e: unknown) => { setError(e instanceof Error ? e.message : "Không tải được dữ liệu."); }, []);
  const load = useCallback(async () => { await getAppData().then(applyData).catch(loadError); }, [applyData, loadError]);
  useEffect(() => { void getAppData().then(applyData).catch(loadError); }, [applyData, loadError]);
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);
  const signOut = useCallback(async () => {
    try { await api.logout(); window.location.replace("/login"); }
    catch (e) { setError(e instanceof Error ? e.message : "Chưa đăng xuất được. Bạn hãy thử lại."); }
  }, []);
  const updateProfile = useCallback(async (patch: Partial<Pick<Profile, "start_date" | "mode">>) => {
    if (!profile) return;
    try { setProfile(await api.updateProfile({ ...profile, ...patch })); }
    catch (e) { setError(e instanceof Error ? e.message : "Không lưu được cài đặt."); }
  }, [profile]);
  if (!profile) return <main className="min-h-dvh bg-token-bg p-screen text-token-text" aria-live="polite">
    <p role={error ? "alert" : "status"}>{error ?? "Đang tải…"}</p>
    {error ? <button type="button" onClick={() => void load()} className="min-h-touch rounded-token-card border border-solid border-token-border bg-token-surface px-space-4 text-token-primary">Thử lại</button> : null}
  </main>;
  return <Context.Provider value={{ email, profile, dueCount, error, setError, refreshDue, updateProfile, signOut, reload: load }}>{children}</Context.Provider>;
}
