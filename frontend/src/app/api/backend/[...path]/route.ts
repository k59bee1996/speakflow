import type { NextRequest } from "next/server";
import { backendRequest } from "@/lib/backend/server";

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (request.nextUrl.protocol !== "https:") return Response.json({ detail: "Kết nối phải sử dụng HTTPS." }, { status: 400 });
  if (!["GET", "HEAD"].includes(request.method) && request.headers.get("origin") !== request.nextUrl.origin)
    return Response.json({ detail: "Yêu cầu không hợp lệ." }, { status: 403 });
  const path = (await context.params).path.join("/");
  if (!/^(auth\/(login|logout|session)|profile|data|cards(\/queue|\/[a-f0-9-]+(\/grade)?)?|notes(\/[a-f0-9-]+(\/(suggest|options|cards))?)?)$/.test(path))
    return Response.json({ detail: "Không tìm thấy dữ liệu." }, { status: 404 });
  try {
    const response = await backendRequest(path + request.nextUrl.search, request.headers.get("cookie") ?? "", {
      method: request.method, body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.text(),
    });
    const headers = new Headers({ "Content-Type": response.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" });
    for (const cookie of response.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
    const retry = response.headers.get("retry-after");
    if (retry) headers.set("Retry-After", retry);
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    const cause = error instanceof Error ? error.cause as { code?: string } | undefined : undefined;
    console.error("Backend request failed", { name: error instanceof Error ? error.name : "Unknown", code: cause?.code });
    return Response.json({ detail: "Không thể kết nối máy chủ. Bạn hãy thử lại sau." }, { status: 503 });
  }
}
export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const DELETE = forward;
