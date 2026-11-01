import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { NoteOption } from "@/lib/types";

const DAILY_LIMIT = 50;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

function buildPrompt(vi: string): string {
  return [
    "You help a Vietnamese learner of English (level A2 to B1) say things naturally.",
    `They want to say this (in Vietnamese): "${vi.replace(/"/g, "'")}"`,
    "",
    "Return ONLY a JSON object, no other text, in this exact shape:",
    '{"options":[{"en":"...","note":"..."},{"en":"...","note":"..."}]}',
    "Rules: exactly 2 options. Option 1 is the most natural everyday way to say it.",
    "Option 2 is a slightly different register (more casual or more polite).",
    '"en" is one short, natural English sentence a native speaker would actually say.',
    '"note" is one short sentence in Vietnamese explaining the key phrase or when to use this option.',
  ].join("\n");
}

function parseOptions(text: string): NoteOption[] {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const data = JSON.parse(cleaned.slice(start, end + 1)) as { options?: unknown };
    if (!Array.isArray(data.options)) return [];
    return data.options
      .filter((o): o is { en: string; note?: unknown } => !!o && typeof (o as { en?: unknown }).en === "string")
      .slice(0, 2)
      .map((o) => ({
        en: o.en.trim().slice(0, 300),
        note: typeof o.note === "string" ? o.note.trim().slice(0, 300) : "",
      }))
      .filter((o) => o.en.length > 0);
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) return fail(500, "Chưa cấu hình ANTHROPIC_API_KEY trên máy chủ.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "Bạn cần đăng nhập lại.");

  let noteId = "";
  try {
    const body = (await request.json()) as { noteId?: unknown };
    noteId = typeof body.noteId === "string" ? body.noteId : "";
  } catch {
    /* body sai định dạng */
  }
  if (!UUID.test(noteId)) return fail(400, "Yêu cầu không hợp lệ.");

  // Row Level Security đảm bảo chỉ đọc được ghi chú của chính người dùng này.
  const note = await supabase.from("notes").select("id, vi").eq("id", noteId).maybeSingle();
  if (note.error || !note.data) return fail(404, "Không tìm thấy ghi chú.");

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const used = await supabase.from("ai_requests").select("id", { count: "exact", head: true }).gte("created_at", since);
  if ((used.count ?? 0) >= DAILY_LIMIT) return fail(429, "Bạn đã dùng hết lượt gợi ý trong 24 giờ qua. Thử lại sau nhé.");
  await supabase.from("ai_requests").insert({ user_id: user.id, kind: "suggest" });

  let options: NoteOption[] = [];
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: buildPrompt(note.data.vi as string) }],
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    options = parseOptions(text);
  } catch (e) {
    console.error("Claude API error", e);
    return fail(502, "Claude đang bận hoặc gặp lỗi. Thử lại sau ít phút.");
  }
  if (!options.length) return fail(502, "Claude chưa trả lời đúng định dạng. Thử lại nhé.");

  const saved = await supabase.from("notes").update({ options }).eq("id", noteId);
  if (saved.error) return fail(500, "Có gợi ý nhưng chưa lưu được. Thử lại sau.");

  return NextResponse.json({ options });
}
