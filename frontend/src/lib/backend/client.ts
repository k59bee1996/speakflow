import type { Card, Note, Profile } from "@/lib/types";
import { todayISO } from "@/lib/dates";

export class ApiError extends Error {
  constructor(message: string, public status: number, public retryAt?: string) { super(message); }
}
async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/backend/${path}`, {
      method, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch { throw new ApiError("Không thể kết nối. Bạn hãy thử lại sau.", 0); }
  if (!response.ok) {
    const problem = await response.json().catch(() => ({})) as { detail?: string; retryAt?: string };
    if (response.status === 401 && path !== "auth/login" && typeof window !== "undefined") window.location.replace("/login");
    throw new ApiError(problem.detail ?? "Không thể hoàn tất yêu cầu. Bạn hãy thử lại.", response.status, problem.retryAt);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
export const api = {
  login: (email: string, password: string) => request<{ user_id: string; email: string }>("auth/login", "POST", { email, password }),
  session: () => request<{ user_id: string; email: string }>("auth/session"),
  logout: () => request<void>("auth/logout", "POST"),
  profile: () => request<Profile>("profile"),
  updateProfile: (profile: Pick<Profile, "start_date" | "mode">) => request<Profile>("profile", "PUT", profile),
  resetData: () => request<void>(`data?today=${todayISO()}`, "DELETE"),
  cards: () => request<Card[]>("cards"),
  queue: () => request<Card[]>(`cards/queue?today=${todayISO()}`),
  addCard: (front: string, back: string) => request<Card>("cards", "POST", { front, back, today: todayISO() }),
  grade: (id: string, grade: number) => request<Card>(`cards/${id}/grade`, "POST", { grade, today: todayISO() }),
  deleteCard: (id: string) => request<void>(`cards/${id}`, "DELETE"),
  notes: () => request<Note[]>("notes"),
  addNote: (vi: string) => request<Note>("notes", "POST", { vi }),
  suggest: (id: string) => request<Note>(`notes/${id}/suggest`, "POST"),
  addOption: (id: string, en: string) => request<Note>(`notes/${id}/options`, "POST", { en }),
  optionToCard: (id: string, index: number, optionsVersion: string) => request<Note>(`notes/${id}/cards`, "POST", { index, today: todayISO(), options_version: optionsVersion }),
  deleteNote: (id: string) => request<void>(`notes/${id}`, "DELETE"),
};
