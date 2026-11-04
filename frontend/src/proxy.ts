import { NextResponse, type NextRequest } from "next/server";
import { backendRequest, SESSION_COOKIE } from "@/lib/backend/server";

function uncached(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function proxy(request: NextRequest) {
  const login = request.nextUrl.pathname === "/login";
  if (!request.cookies.has(SESSION_COOKIE)) return uncached(login ? NextResponse.next() : NextResponse.redirect(new URL("/login", request.url)));
  try {
    const session = await backendRequest("auth/session", request.headers.get("cookie") ?? "");
    if (session.status === 401) return uncached(login ? NextResponse.next() : NextResponse.redirect(new URL("/login", request.url)));
    if (!session.ok) throw new Error("Session unavailable");
    return uncached(login ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next());
  } catch {
    return new NextResponse("Không thể kết nối máy chủ. Bạn hãy tải lại trang để thử lại.", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
export const config = { matcher: ["/((?!api/|_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"] };
