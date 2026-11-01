// Giọng đọc và nhận dạng giọng nói có sẵn trong trình duyệt.
// Nhận dạng giọng nói chạy tốt nhất trên Chrome; Safari hỗ trợ hạn chế.

export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/…/g, ""));
  u.lang = "en-US";
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

/* Web Speech API chưa có trong thư viện kiểu DOM của TypeScript nên khai báo phần cần dùng. */
export interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
}
export type RecognitionCtor = new () => Recognition;

export function getRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
