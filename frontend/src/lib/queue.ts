import type { SupabaseClient } from "@supabase/supabase-js";
import { NEW_PER_DAY } from "./content";
import { localMidnightISO, todayISO } from "./dates";
import type { Card } from "./types";

/** Thẻ cần ôn hôm nay: thẻ đến hạn trước, rồi thẻ mới (tối đa NEW_PER_DAY mỗi ngày). */
export async function loadQueue(sb: SupabaseClient): Promise<Card[]> {
  const today = todayISO();

  const [due, used] = await Promise.all([
    sb.from("cards").select("*").eq("is_new", false).lte("due", today).order("due", { ascending: true }),
    sb.from("reviews").select("id", { count: "exact", head: true }).eq("was_new", true).gte("reviewed_at", localMidnightISO()),
  ]);
  if (due.error) throw due.error;
  if (used.error) throw used.error;

  const left = Math.max(0, NEW_PER_DAY - (used.count ?? 0));
  let fresh: Card[] = [];
  if (left > 0) {
    const r = await sb
      .from("cards")
      .select("*")
      .eq("is_new", true)
      .order("week", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(left);
    if (r.error) throw r.error;
    fresh = r.data as Card[];
  }
  return [...(due.data as Card[]), ...fresh];
}
