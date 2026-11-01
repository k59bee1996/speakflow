"use client";

import { useEffect, useState } from "react";
import { useApp } from "./AppContext";
import { todayISO, viDate, iso } from "@/lib/dates";
import { speak } from "@/lib/speech";
import type { Note, NoteOption } from "@/lib/types";

type Msg = { text: string; error?: boolean } | null;

export default function NotesView() {
  const { sb, userId, refreshDue, setError } = useApp();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [asking, setAsking] = useState<Record<string, boolean>>({});
  const [noteErr, setNoteErr] = useState<Record<string, string>>({});
  const [manual, setManual] = useState<Record<string, string>>({});

  useEffect(() => {
    sb.from("notes")
      .select("*")
      .order("created_at", { ascending: false })
      .then((r) => {
        if (r.error) {
          setNotes([]);
          setError("Không tải được sổ câu bí.");
        } else setNotes(r.data as Note[]);
      });
  }, [sb, setError]);

  const patchNote = (id: string, patch: Partial<Note>) =>
    setNotes((ns) => (ns ? ns.map((n) => (n.id === id ? { ...n, ...patch } : n)) : ns));

  async function ask(note: Note) {
    setAsking((a) => ({ ...a, [note.id]: true }));
    setNoteErr((e) => ({ ...e, [note.id]: "" }));
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId: note.id }),
      });
      const data = (await res.json()) as { options?: NoteOption[]; error?: string };
      if (!res.ok || !data.options) throw new Error(data.error ?? "Chưa lấy được gợi ý.");
      patchNote(note.id, { options: data.options });
    } catch (e) {
      setNoteErr((er) => ({ ...er, [note.id]: e instanceof Error ? e.message : "Chưa lấy được gợi ý." }));
    } finally {
      setAsking((a) => ({ ...a, [note.id]: false }));
    }
  }

  async function create(withAI: boolean) {
    const vi = input.trim();
    if (!vi) {
      setMsg({ text: "Nhập ý bạn muốn nói trước đã.", error: true });
      return;
    }
    const r = await sb.from("notes").insert({ user_id: userId, vi }).select("*").single();
    if (r.error) {
      setMsg({ text: "Chưa lưu được. Thử lại sau.", error: true });
      return;
    }
    const note = r.data as Note;
    setNotes((ns) => [note, ...(ns ?? [])]);
    setInput("");
    setMsg(null);
    if (withAI) ask(note);
  }

  async function addManual(note: Note) {
    const en = (manual[note.id] ?? "").trim();
    if (!en) {
      setNoteErr((e) => ({ ...e, [note.id]: "Nhập câu tiếng Anh trước đã." }));
      return;
    }
    const options = [...note.options, { en, note: "Bạn tự nhập" }].slice(-3);
    const r = await sb.from("notes").update({ options }).eq("id", note.id);
    if (r.error) {
      setNoteErr((e) => ({ ...e, [note.id]: "Chưa lưu được. Thử lại sau." }));
      return;
    }
    patchNote(note.id, { options });
    setManual((m) => ({ ...m, [note.id]: "" }));
    setNoteErr((e) => ({ ...e, [note.id]: "" }));
  }

  async function toCard(note: Note, i: number) {
    const o = note.options[i];
    if (!o || note.carded.includes(i)) return;
    const ins = await sb
      .from("cards")
      .insert({ user_id: userId, front: note.vi, back: o.en, note: o.note === "Bạn tự nhập" ? "" : o.note, week: 0, is_new: false, due: todayISO() });
    if (ins.error) {
      setNoteErr((e) => ({ ...e, [note.id]: "Chưa thêm được thẻ." }));
      return;
    }
    const carded = [...note.carded, i];
    await sb.from("notes").update({ carded }).eq("id", note.id);
    patchNote(note.id, { carded });
    refreshDue();
  }

  async function remove(id: string) {
    const r = await sb.from("notes").delete().eq("id", id);
    if (r.error) {
      setError("Không xoá được ghi chú.");
      return;
    }
    setNotes((ns) => (ns ? ns.filter((n) => n.id !== id) : ns));
  }

  return (
    <>
      <h1>Sổ câu bí</h1>
      <p className="muted">Muốn nói gì mà chưa biết nói bằng tiếng Anh? Ghi lại ngay bằng tiếng Việt.</p>
      <div className="field">
        <label htmlFor="nb-input">Ý bạn muốn nói</label>
        <textarea
          id="nb-input"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setMsg(null);
          }}
          placeholder="Ví dụ: Tôi muốn dời cuộc họp sang chiều mai"
        />
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" type="button" onClick={() => create(true)}>Gợi ý cách nói</button>
        <button className="btn ghost" type="button" onClick={() => create(false)}>Lưu, tra sau</button>
      </div>
      {msg && <p className={`status${msg.error ? " err" : ""}`}>{msg.text}</p>}

      {notes === null ? (
        <p className="muted">Đang tải…</p>
      ) : notes.length === 0 ? (
        <p className="muted small" style={{ marginTop: 20 }}>
          Chưa có câu nào. Lần tới bị bí khi nói, mở màn này và ghi lại ngay.
        </p>
      ) : (
        notes.map((n) => (
          <div className="nb" key={n.id}>
            <div className="row between">
              <span className="vi">{n.vi}</span>
              <button className="x" type="button" onClick={() => remove(n.id)} aria-label="Xoá ghi chú">Xoá</button>
            </div>
            <div className="when">{viDate(iso(new Date(n.created_at)))}</div>

            {n.options.map((o, i) => (
              <div className="opt" key={i}>
                <div className="en">{o.en}</div>
                {o.note && <div className="why">{o.note}</div>}
                <div className="extra">
                  <button className="btn sm ghost" type="button" onClick={() => speak(o.en)}>Nghe</button>
                  {n.carded.includes(i) ? (
                    <span className="added">Đã thành thẻ</span>
                  ) : (
                    <button className="btn sm" type="button" onClick={() => toCard(n, i)}>Thêm thành thẻ</button>
                  )}
                </div>
              </div>
            ))}

            {asking[n.id] ? <p className="status">Đang hỏi Claude…</p> : null}
            {noteErr[n.id] ? <p className="status err">{noteErr[n.id]}</p> : null}
            {!n.options.length && !asking[n.id] ? (
              <div className="extra">
                <button className="btn sm ghost" type="button" onClick={() => ask(n)}>Gợi ý cách nói</button>
              </div>
            ) : null}

            <div className="manual">
              <input
                type="text"
                aria-label="Tự nhập cách nói tiếng Anh"
                placeholder="Tự nhập cách nói tiếng Anh"
                value={manual[n.id] ?? ""}
                onChange={(e) => setManual((m) => ({ ...m, [n.id]: e.target.value }))}
              />
              <button className="btn sm ghost" type="button" onClick={() => addManual(n)}>Thêm</button>
            </div>
          </div>
        ))
      )}
    </>
  );
}
