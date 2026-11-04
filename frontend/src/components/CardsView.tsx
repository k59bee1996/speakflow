"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "./AppContext";
import { NEW_PER_DAY } from "@/lib/content";
import { viDate } from "@/lib/dates";
import { api } from "@/lib/backend/client";
import { GRADE_LABELS, intervalLabel, matchScore, plan, type Grade } from "@/lib/srs";
import { getRecognition, speak } from "@/lib/speech";
import type { Card } from "@/lib/types";

export default function CardsView() {
  const { refreshDue, setError } = useApp();
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [heard, setHeard] = useState<{ text: string; error?: boolean } | null>(null);
  const [listening, setListening] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [all, setAll] = useState<Card[]>([]);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [formMsg, setFormMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [canListen, setCanListen] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    Promise.all([api.queue(), api.cards()]).then(([queue, cards]) => {
      setCanListen(!!getRecognition()); setQueue(queue); setAll(cards);
    }).catch(e => { setQueue([]); setError(e instanceof Error ? e.message : "Không tải được thẻ."); });
  }, [setError]);

  const cur = queue && queue.length ? queue[0] : null;
  const curId = useRef<string | null>(null);
  useEffect(() => {
    curId.current = cur ? cur.id : null;
  }, [cur]);

  async function grade(g: Grade) {
    if (!cur || busy.current) return;
    busy.current = true;
    try {
      const updated = await api.grade(cur, g);
      setQueue(q => q ? (g === 0 ? [...q.filter(c => c.id !== cur.id), updated] : q.filter(c => c.id !== cur.id)) : q);
      setAll(cards => cards.map(c => c.id === cur.id ? updated : c));
      setFlipped(false); setHeard(null); setReviewed(n => n + 1);
      await refreshDue();
    } catch (e) { setError(e instanceof Error ? e.message : "Không lưu được kết quả ôn thẻ."); }
    finally { busy.current = false; }
  }

  function listen() {
    const Ctor = getRecognition();
    if (!Ctor || !cur) return;
    try {
      const rec = new Ctor();
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      const target = cur.id;
      rec.onresult = (e) => {
        if (curId.current !== target) return;
        setHeard({ text: e.results[0][0].transcript });
        setFlipped(true);
      };
      rec.onerror = (e) => {
        const blocked = ["not-allowed", "service-not-allowed", "audio-capture"].includes(e.error);
        if (blocked) setCanListen(false);
        setHeard({ text: blocked ? "Micro không dùng được. Cứ nói to rồi lật thẻ." : "Chưa nghe rõ, thử lại hoặc lật thẻ.", error: true });
      };
      rec.onend = () => setListening(false);
      setListening(true);
      rec.start();
    } catch {
      setCanListen(false);
      setListening(false);
    }
  }

  async function addCard() {
    const f = front.trim();
    const b = back.trim();
    if (!f || !b) {
      setFormMsg({ text: "Điền cả hai mặt thẻ.", error: true });
      return;
    }
    try {
      const card = await api.addCard(f, b);
      setQueue(q => [...(q ?? []), card]); setAll(a => [card, ...a]);
      setFront(""); setBack(""); setFormMsg({ text: "Đã thêm." });
      await refreshDue();
    } catch (e) { setFormMsg({ text: e instanceof Error ? e.message : "Chưa thêm được thẻ.", error: true }); }
  }
  async function removeCard(id: string) {
    try {
      await api.deleteCard(id);
      setAll(a => a.filter(c => c.id !== id)); setQueue(q => q ? q.filter(c => c.id !== id) : q);
      await refreshDue();
    } catch (e) { setError(e instanceof Error ? e.message : "Không xoá được thẻ."); }
  }

  return (
    <>
      <h1 className="font-token-display text-token-title">Ôn thẻ</h1>

      {queue === null ? (
        <p className="text-token-text-muted">Đang tải thẻ…</p>
      ) : !cur ? (
        <>
          <p className="my-space-4 font-semibold">{reviewed ? `Xong! Hôm nay bạn đã ôn ${reviewed} thẻ.` : "Hôm nay không còn thẻ nào đến hạn."}</p>
          <p className="text-token-small text-token-text-muted">
            Mỗi ngày bạn học tối đa {NEW_PER_DAY} thẻ mới. Ý nào bí khi nói, hãy ghi vào sổ câu bí để thành thẻ.
          </p>
        </>
      ) : (
        <>
          <div className="my-space-4 rounded-token-hero border border-solid border-token-border bg-token-surface p-space-5">
            <div className="flex justify-between gap-space-2 text-token-small text-token-text-muted">
              <span>{cur.is_new ? "Thẻ mới" : cur.lapses ? `Ôn lại, đã quên ${cur.lapses} lần` : "Ôn lại"}</span>
              <span>{cur.week ? `Tuần ${cur.week}` : "Thẻ của bạn"}</span>
            </div>
            <div className="my-space-4 text-token-practice font-semibold">{cur.front}</div>

            {!flipped ? (
              <>
                <p className="text-token-small text-token-text-muted">Nói to câu tiếng Anh trước, rồi mới lật thẻ.</p>
                <div className="my-space-3 flex flex-wrap items-center gap-space-3">
                  <button className="focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] min-h-cta cursor-pointer rounded-token-card border-0 bg-token-primary px-space-4 py-space-3 text-token-on-primary disabled:opacity-50" type="button" onClick={() => setFlipped(true)}>Lật thẻ</button>
                  {canListen && (
                    <button className="focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] min-h-touch cursor-pointer rounded-token-pill border border-solid border-token-border bg-token-surface px-space-4 py-space-2 text-token-small text-token-primary disabled:opacity-50" type="button" onClick={listen} disabled={listening}>
                      {listening ? "Đang nghe…" : "Nói thử"}
                    </button>
                  )}
                </div>
                {heard?.error && <div className="my-space-3 text-token-small text-token-danger">{heard.text}</div>}
              </>
            ) : (
              <>
                <div lang="en" className="my-space-4 border-t border-dashed border-token-border pt-space-4 font-token-display text-token-practice text-token-primary">{cur.back}</div>
                {cur.note && <p className="my-space-2 text-token-small text-token-text-muted">{cur.note}</p>}
                {heard && !heard.error && (
                  <div className="my-space-3 rounded-token-input bg-token-surface-muted p-space-3 text-token-small">
                    Bạn nói: “{heard.text}”, khớp {matchScore(heard.text, cur.back)}%
                  </div>
                )}
                <div className="my-space-3 flex flex-wrap items-center gap-space-3">
                  <button className="focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] min-h-touch cursor-pointer rounded-token-pill border border-solid border-token-border bg-token-surface px-space-4 py-space-2 text-token-small text-token-primary disabled:opacity-50" type="button" onClick={() => speak(cur.back)}>Nghe phát âm</button>
                </div>
                <div className="mt-space-5 grid grid-cols-4 gap-space-2">
                  {GRADE_LABELS.map((label, g) => (
                    <button key={label} type="button" className={"flex min-h-cta flex-col items-center justify-center rounded-token-control border border-solid border-token-border bg-token-bg p-space-2 text-token-small " + (g === 0 ? "text-token-danger" : "text-token-text")} onClick={() => grade(g as Grade)}>
                      <b>{label}</b>
                      <span>{intervalLabel(plan(cur, g as Grade).interval_days)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <p className="my-space-3 text-token-small text-token-text-muted">Còn {queue.length - 1} thẻ trong lượt này.</p>
        </>
      )}

      <details className="mt-space-6 rounded-token-card border border-solid border-token-border bg-token-surface">
        <summary className="focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] min-h-touch cursor-pointer px-space-4 py-space-3 font-medium">Thêm thẻ của riêng bạn</summary>
        <div className="flex flex-col gap-space-3 p-space-4">
          <div className="my-space-3 flex flex-col gap-space-2">
            <label htmlFor="nc-front">Mặt trước (tiếng Việt)</label>
            <input className="focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] w-full min-w-0 min-h-touch rounded-token-input border border-solid border-token-border bg-token-surface px-space-3 py-space-3 text-token-text" id="nc-front" type="text" value={front} onChange={(e) => { setFront(e.target.value); setFormMsg(null); }} placeholder="Tôi sẽ gửi email cho anh trước 5 giờ" />
          </div>
          <div className="my-space-3 flex flex-col gap-space-2">
            <label htmlFor="nc-back">Mặt sau (tiếng Anh)</label>
            <input className="focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] w-full min-w-0 min-h-touch rounded-token-input border border-solid border-token-border bg-token-surface px-space-3 py-space-3 text-token-text" id="nc-back" type="text" value={back} onChange={(e) => { setBack(e.target.value); setFormMsg(null); }} placeholder="I’ll email you before 5." />
          </div>
          <div className="my-space-3 flex flex-wrap items-center gap-space-3">
            <button className="focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] min-h-touch cursor-pointer rounded-token-pill border border-solid border-token-border bg-token-surface px-space-4 py-space-2 text-token-small text-token-primary disabled:opacity-50" type="button" onClick={addCard}>Thêm thẻ</button>
            {formMsg && <span className={formMsg.error ? "text-token-small text-token-danger" : "text-token-small text-token-success"}>{formMsg.text}</span>}
          </div>
        </div>
      </details>

      <details className="mt-space-6 rounded-token-card border border-solid border-token-border bg-token-surface">
        <summary className="focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] min-h-touch cursor-pointer px-space-4 py-space-3 font-medium">Tất cả thẻ ({all.length})</summary>
        <div className="flex flex-col gap-space-3 p-space-4">
          {all.map((c) => (
            <div className="flex items-start justify-between gap-space-3 border-t border-solid border-token-border py-space-3" key={c.id}>
              <div className="min-w-0">
                {c.front}
                <span lang="en" className="block font-token-display">{c.back}</span>
                <span className="block text-token-small text-token-text-muted">
                  {c.is_new ? ", chưa học" : `, ôn lại ${viDate(c.due)}`}
                </span>
              </div>
              <button className="focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] min-h-touch shrink-0 cursor-pointer border-0 bg-transparent px-space-2 text-token-small text-token-text-muted" type="button" onClick={() => removeCard(c.id)} aria-label={`Xoá thẻ ${c.front}`}>
                Xoá
              </button>
            </div>
          ))}
        </div>
      </details>
    </>
  );
}
