"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/backend/client";
import { useApp } from "./AppContext";
import { viDate, iso } from "@/lib/dates";
import { speak } from "@/lib/speech";
import type { Note } from "@/lib/types";

type Msg = { text: string; error?: boolean } | null;

export default function NotesView() {
  const { refreshDue, setError } = useApp();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [asking, setAsking] = useState<Record<string, boolean>>({});
  const [noteErr, setNoteErr] = useState<Record<string, string>>({});
  const [manual, setManual] = useState<Record<string, string>>({});

  useEffect(() => {
    api.notes().then(setNotes).catch(e => {
      setNotes([]); setError(e instanceof Error ? e.message : "Không tải được sổ câu bí.");
    });
  }, [setError]);

  const patchNote = (id: string, patch: Partial<Note>) =>
    setNotes((ns) => (ns ? ns.map((n) => (n.id === id ? { ...n, ...patch } : n)) : ns));

  async function ask(note: Note) {
    setAsking((a) => ({ ...a, [note.id]: true }));
    setNoteErr((e) => ({ ...e, [note.id]: "" }));
    try {
      patchNote(note.id, await api.suggest(note.id));
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
    try {
      const note = await api.addNote(vi);
      setNotes(ns => [note, ...(ns ?? [])]); setInput(""); setMsg(null);
      if (withAI) void ask(note);
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : "Chưa lưu được ghi chú.", error: true }); }
  }
  async function addManual(note: Note) {
    try {
      patchNote(note.id, await api.addOption(note.id, manual[note.id] ?? ""));
      setManual(m => ({ ...m, [note.id]: "" })); setNoteErr(e => ({ ...e, [note.id]: "" }));
    } catch (e) { setNoteErr(er => ({ ...er, [note.id]: e instanceof Error ? e.message : "Chưa lưu được cách nói." })); }
  }
  async function toCard(note: Note, i: number) {
    if (note.carded.includes(i)) return;
    try { patchNote(note.id, await api.optionToCard(note.id, i, note.options_version)); await refreshDue(); }
    catch (e) { setNoteErr(er => ({ ...er, [note.id]: e instanceof Error ? e.message : "Chưa thêm được thẻ." })); }
  }
  async function remove(id: string) {
    try { await api.deleteNote(id); setNotes(ns => ns ? ns.filter(n => n.id !== id) : ns); }
    catch (e) { setError(e instanceof Error ? e.message : "Không xoá được ghi chú."); }
  }

  return (
    <>
      <h1 className="font-token-display text-token-title">Sổ câu bí</h1>
      <p className="text-token-text-muted">Muốn nói gì mà chưa biết nói bằng tiếng Anh? Ghi lại ngay bằng tiếng Việt.</p>
      <div className="my-space-3 flex flex-col gap-space-2">
        <label htmlFor="nb-input">Ý bạn muốn nói</label>
        <textarea className="focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] w-full min-w-0 min-h-touch rounded-token-input border border-solid border-token-border bg-token-surface px-space-3 py-space-3 text-token-text"
          id="nb-input"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setMsg(null);
          }}
          placeholder="Ví dụ: Tôi muốn dời cuộc họp sang chiều mai"
        />
      </div>
      <div className="my-space-3 flex flex-wrap items-center gap-space-3">
        <button className="focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] min-h-cta cursor-pointer rounded-token-card border-0 bg-token-primary px-space-4 py-space-3 text-token-on-primary disabled:opacity-50" type="button" onClick={() => create(true)}>Gợi ý cách nói</button>
        <button className="focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] min-h-touch cursor-pointer rounded-token-pill border border-solid border-token-border bg-token-surface px-space-4 py-space-2 text-token-small text-token-primary disabled:opacity-50" type="button" onClick={() => create(false)}>Lưu, tra sau</button>
      </div>
      {msg && <p className={msg.error ? "text-token-small text-token-danger" : "text-token-small text-token-success"}>{msg.text}</p>}

      {notes === null ? (
        <p className="text-token-text-muted">Đang tải…</p>
      ) : notes.length === 0 ? (
        <p className="text-token-small text-token-text-muted">
          Chưa có câu nào. Lần tới bị bí khi nói, mở màn này và ghi lại ngay.
        </p>
      ) : (
        notes.map((n) => (
          <div className="my-space-4 rounded-token-card border border-solid border-token-border bg-token-surface p-space-4" key={n.id}>
            <div className="flex items-start justify-between gap-space-3">
              <span className="min-w-0 break-words font-semibold">{n.vi}</span>
              <button className="focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] min-h-touch shrink-0 cursor-pointer border-0 bg-transparent px-space-2 text-token-small text-token-text-muted" type="button" onClick={() => remove(n.id)} aria-label="Xoá ghi chú">Xoá</button>
            </div>
            <div className="my-space-2 text-token-caption text-token-text-muted">{viDate(iso(new Date(n.created_at)))}</div>

            {n.options.map((o, i) => (
              <div className="my-space-3 border-t border-solid border-token-border pt-space-3" key={i}>
                <div lang="en" className="font-token-display text-token-lead">{o.en}</div>
                {o.note && <div className="my-space-2 text-token-small text-token-text-muted">{o.note}</div>}
                <div className="my-space-3 flex flex-wrap items-center gap-space-2">
                  <button className="focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] min-h-touch cursor-pointer rounded-token-pill border border-solid border-token-border bg-token-surface px-space-4 py-space-2 text-token-small text-token-primary disabled:opacity-50" type="button" onClick={() => speak(o.en)}>Nghe</button>
                  {n.carded.includes(i) ? (
                    <span className="text-token-small text-token-success">Đã thành thẻ</span>
                  ) : (
                    <button className="focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] min-h-touch cursor-pointer rounded-token-pill border border-solid border-token-border bg-token-surface px-space-4 py-space-2 text-token-small text-token-primary disabled:opacity-50" type="button" onClick={() => toCard(n, i)}>Thêm thành thẻ</button>
                  )}
                </div>
              </div>
            ))}

            {asking[n.id] ? <p className="my-space-3 text-token-small text-token-text-muted">Đang hỏi Claude…</p> : null}
            {noteErr[n.id] ? <p className="my-space-3 text-token-small text-token-danger">{noteErr[n.id]}</p> : null}
            {!n.options.length && !asking[n.id] ? (
              <div className="my-space-3 flex flex-wrap items-center gap-space-2">
                <button className="focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] min-h-touch cursor-pointer rounded-token-pill border border-solid border-token-border bg-token-surface px-space-4 py-space-2 text-token-small text-token-primary disabled:opacity-50" type="button" onClick={() => ask(n)}>Gợi ý cách nói</button>
              </div>
            ) : null}

            <div className="mt-space-4 flex items-center gap-space-2">
              <input className="focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] w-full min-w-0 min-h-touch rounded-token-input border border-solid border-token-border bg-token-surface px-space-3 py-space-3 text-token-text"
                type="text"
                aria-label="Tự nhập cách nói tiếng Anh"
                placeholder="Tự nhập cách nói tiếng Anh"
                value={manual[n.id] ?? ""}
                onChange={(e) => setManual((m) => ({ ...m, [n.id]: e.target.value }))}
              />
              <button className="focus-visible:[outline:var(--focus-ring)] focus-visible:[outline-offset:var(--focus-offset)] min-h-touch cursor-pointer rounded-token-pill border border-solid border-token-border bg-token-surface px-space-4 py-space-2 text-token-small text-token-primary disabled:opacity-50" type="button" onClick={() => addManual(n)}>Thêm</button>
            </div>
          </div>
        ))
      )}
    </>
  );
}
