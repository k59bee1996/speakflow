"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "./AppContext";
import { NEW_PER_DAY } from "@/lib/content";
import { addDays, todayISO, viDate } from "@/lib/dates";
import { loadQueue } from "@/lib/queue";
import { GRADE_LABELS, intervalLabel, matchScore, plan, type Grade } from "@/lib/srs";
import { getRecognition, speak } from "@/lib/speech";
import type { Card } from "@/lib/types";

export default function CardsView() {
  const { sb, userId, refreshDue, setError } = useApp();
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

  const loadAll = useCallback(async () => {
    const r = await sb.from("cards").select("*").order("created_at", { ascending: false });
    if (!r.error) setAll(r.data as Card[]);
  }, [sb]);

  useEffect(() => {
    setCanListen(!!getRecognition());
    loadQueue(sb)
      .then(setQueue)
      .catch(() => {
        setQueue([]);
        setError("Không tải được thẻ. Thử tải lại trang.");
      });
    loadAll();
  }, [sb, loadAll, setError]);

  const cur = queue && queue.length ? queue[0] : null;
  const curId = useRef<string | null>(null);
  useEffect(() => {
    curId.current = cur ? cur.id : null;
  }, [cur]);

  async function grade(g: Grade) {
    if (!cur || busy.current) return;
    busy.current = true;
    const today = todayISO();
    const p = plan(cur, g);
    const updated: Card = {
      ...cur,
      ...p,
      due: g === 0 ? today : addDays(today, p.interval_days),
      lapses: cur.lapses + (g === 0 ? 1 : 0),
      is_new: false,
    };
    setQueue((q) => (q ? (g === 0 ? [...q.slice(1), updated] : q.slice(1)) : q));
    setFlipped(false);
    setHeard(null);
    setReviewed((n) => n + 1);

    const [u, r] = await Promise.all([
      sb
        .from("cards")
        .update({ interval_days: updated.interval_days, ease: updated.ease, reps: updated.reps, due: updated.due, lapses: updated.lapses, is_new: false })
        .eq("id", cur.id),
      sb.from("reviews").insert({ user_id: userId, card_id: cur.id, grade: g, was_new: cur.is_new }),
    ]);
    if (u.error || r.error) setError("Không lưu được kết quả ôn thẻ. Kiểm tra kết nối.");
    busy.current = false;
    refreshDue();
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
    const r = await sb
      .from("cards")
      .insert({ user_id: userId, front: f, back: b, week: 0, is_new: false, due: todayISO() })
      .select("*")
      .single();
    if (r.error) {
      setFormMsg({ text: "Chưa thêm được thẻ. Thử lại sau.", error: true });
      return;
    }
    const card = r.data as Card;
    setQueue((q) => (q ? [...q, card] : [card]));
    setAll((a) => [card, ...a]);
    setFront("");
    setBack("");
    setFormMsg({ text: "Đã thêm." });
    refreshDue();
  }

  async function removeCard(id: string) {
    const r = await sb.from("cards").delete().eq("id", id);
    if (r.error) {
      setError("Không xoá được thẻ.");
      return;
    }
    setAll((a) => a.filter((c) => c.id !== id));
    setQueue((q) => (q ? q.filter((c) => c.id !== id) : q));
    refreshDue();
  }

  return (
    <>
      <h1>Ôn thẻ</h1>

      {queue === null ? (
        <p className="muted">Đang tải thẻ…</p>
      ) : !cur ? (
        <>
          <p className="done-msg">{reviewed ? `Xong! Hôm nay bạn đã ôn ${reviewed} thẻ.` : "Hôm nay không còn thẻ nào đến hạn."}</p>
          <p className="muted small">
            Thẻ mới mở theo chủ đề mỗi tuần, tối đa {NEW_PER_DAY} thẻ mới một ngày. Ý nào bí khi nói, hãy ghi vào sổ câu bí để thành thẻ.
          </p>
        </>
      ) : (
        <>
          <div className="flash">
            <div className="meta">
              <span>{cur.is_new ? "Thẻ mới" : cur.lapses ? `Ôn lại, đã quên ${cur.lapses} lần` : "Ôn lại"}</span>
              <span>{cur.week ? `Tuần ${cur.week}` : "Thẻ của bạn"}</span>
            </div>
            <div className="front">{cur.front}</div>

            {!flipped ? (
              <>
                <p className="muted small">Nói to câu tiếng Anh trước, rồi mới lật thẻ.</p>
                <div className="row" style={{ marginTop: 16 }}>
                  <button className="btn" type="button" onClick={() => setFlipped(true)}>Lật thẻ</button>
                  {canListen && (
                    <button className="btn ghost" type="button" onClick={listen} disabled={listening}>
                      {listening ? "Đang nghe…" : "Nói thử"}
                    </button>
                  )}
                </div>
                {heard?.error && <div className="heard err">{heard.text}</div>}
              </>
            ) : (
              <>
                <div className="back">{cur.back}</div>
                {cur.note && <p className="cnote">{cur.note}</p>}
                {heard && !heard.error && (
                  <div className="heard">
                    Bạn nói: “{heard.text}”, khớp {matchScore(heard.text, cur.back)}%
                  </div>
                )}
                <div className="row" style={{ marginTop: 12 }}>
                  <button className="btn sm ghost" type="button" onClick={() => speak(cur.back)}>Nghe phát âm</button>
                </div>
                <div className="grades">
                  {GRADE_LABELS.map((label, g) => (
                    <button key={label} type="button" className={g === 0 ? "forgot" : undefined} onClick={() => grade(g as Grade)}>
                      <b>{label}</b>
                      <span>{intervalLabel(plan(cur, g as Grade).interval_days)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <p className="left">Còn {queue.length - 1} thẻ trong lượt này.</p>
        </>
      )}

      <details className="list">
        <summary>Thêm thẻ của riêng bạn</summary>
        <div className="items">
          <div className="field">
            <label htmlFor="nc-front">Mặt trước (tiếng Việt)</label>
            <input id="nc-front" type="text" value={front} onChange={(e) => { setFront(e.target.value); setFormMsg(null); }} placeholder="Tôi sẽ gửi email cho anh trước 5 giờ" />
          </div>
          <div className="field">
            <label htmlFor="nc-back">Mặt sau (tiếng Anh)</label>
            <input id="nc-back" type="text" value={back} onChange={(e) => { setBack(e.target.value); setFormMsg(null); }} placeholder="I’ll email you before 5." />
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn sm" type="button" onClick={addCard}>Thêm thẻ</button>
            {formMsg && <span className={`status${formMsg.error ? " err" : ""}`}>{formMsg.text}</span>}
          </div>
        </div>
      </details>

      <details className="list">
        <summary>Tất cả thẻ ({all.length})</summary>
        <div className="items">
          {all.map((c) => (
            <div className="item" key={c.id}>
              <div>
                {c.front}
                <span>
                  {c.back}
                  {c.is_new ? ", chưa học" : `, ôn lại ${viDate(c.due)}`}
                </span>
              </div>
              <button className="x" type="button" onClick={() => removeCard(c.id)} aria-label={`Xoá thẻ ${c.front}`}>
                Xoá
              </button>
            </div>
          ))}
        </div>
      </details>
    </>
  );
}
