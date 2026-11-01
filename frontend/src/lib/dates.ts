// Mọi ngày trong app là ngày theo giờ địa phương của người dùng, dạng "YYYY-MM-DD".

const pad = (n: number) => (n < 10 ? "0" : "") + n;

export function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return iso(new Date());
}

export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 864e5);
}

export function viDate(s: string): string {
  const d = parseISO(s);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/** Tuần của lộ trình (1 là tuần đầu). 0 nghĩa là chưa tới ngày bắt đầu. */
export function weekOf(startDate: string, day: string = todayISO()): number {
  const d = diffDays(startDate, day);
  return d < 0 ? 0 : Math.floor(d / 7) + 1;
}

/** Thời điểm 0 giờ hôm nay theo giờ địa phương, dạng ISO để so với timestamptz. */
export function localMidnightISO(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}
