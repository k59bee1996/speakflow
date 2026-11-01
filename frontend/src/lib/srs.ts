// Lặp lại ngắt quãng, biến thể đơn giản của SM-2.
// Có thể thay bằng FSRS (thư viện ts-fsrs) khi cần lịch ôn chính xác hơn.

export type Grade = 0 | 1 | 2 | 3; // Quên, Khó, Được, Dễ

export const GRADE_LABELS = ["Quên", "Khó", "Được", "Dễ"] as const;

export interface SrsState {
  interval_days: number;
  ease: number;
  reps: number;
}

export function plan(c: SrsState, g: Grade): SrsState {
  if (g === 0) return { interval_days: 0, ease: Math.max(1.3, c.ease - 0.2), reps: 0 };

  let iv: number;
  if (c.reps === 0) iv = g === 3 ? 3 : 1;
  else if (c.reps === 1) iv = g === 1 ? 2 : g === 2 ? 3 : 5;
  else iv = Math.round(c.interval_days * (g === 1 ? 1.2 : g === 2 ? c.ease : c.ease * 1.3));

  let ease = c.ease;
  if (g === 1) ease = Math.max(1.3, ease - 0.15);
  if (g === 3) ease += 0.15;

  return { interval_days: Math.max(1, iv), ease, reps: c.reps + 1 };
}

export function intervalLabel(days: number): string {
  if (days === 0) return "hôm nay";
  if (days === 1) return "1 ngày";
  if (days < 30) return `${days} ngày`;
  return `${Math.round(days / 30)} tháng`;
}

/** Độ khớp giữa câu người dùng nói và đáp án, 0–100 (hệ số Dice trên từ). */
export function matchScore(said: string, target: string): number {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  const a = norm(said).split(" ").filter(Boolean);
  const b = norm(target).split(" ").filter(Boolean);
  const bag = new Map<string, number>();
  b.forEach((w) => bag.set(w, (bag.get(w) ?? 0) + 1));
  let hit = 0;
  a.forEach((w) => {
    const n = bag.get(w) ?? 0;
    if (n > 0) {
      hit++;
      bag.set(w, n - 1);
    }
  });
  return a.length + b.length ? Math.round(((2 * hit) / (a.length + b.length)) * 100) : 0;
}
