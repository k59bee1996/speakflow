import "server-only";

export const SESSION_COOKIE = "__Host-speakflow";
export async function backendRequest(path: string, cookie: string, init?: RequestInit): Promise<Response> {
  const base = process.env.BACKEND_URL;
  if (!base || new URL(base).protocol !== "https:") throw new Error("Configure BACKEND_URL with an HTTPS URL.");
  const headers = new Headers(init?.headers);
  headers.set("Cookie", cookie);
  headers.set("X-Speakflow-Request", "1");
  headers.set("Content-Type", "application/json");
  return fetch(new URL(`/api/${path}`, base), { ...init, headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(25000) });
}
