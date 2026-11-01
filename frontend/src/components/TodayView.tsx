"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "./AppContext";
import {
  ACT, PHASES, TOPICS, TOTAL_WEEKS, WEEKS, activitiesFor, isSessionComplete, phaseIndex, quickQaPrompt, rolePlayPrompt,
} from "@/lib/content";
import { addDays, diffDays, todayISO, viDate, weekOf } from "@/lib/dates";

const CHECKPOINT_WEEKS = [4, 8, 12];

function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export default function TodayView() {
  const { profile, week, sessions, streak, dueCount, updateProfile, toggleActivity } = useApp();
  const [topic, setTopic] = useState("");
  const today = todayISO();

  if (week === 0) {
    return (
      <>
        <h1>Sắp bắt đầu</h1>
        <p className="muted">
          Lộ trình của bạn bắt đầu ngày {viDate(profile.start_date)}. Đổi ngày trong <Link href="/settings">Cài đặt</Link> nếu muốn bắt đầu sớm hơn.
        </p>
      </>
    );
  }
  if (week > TOTAL_WEEKS) {
    return (
      <>
        <h1>Hoàn thành 12 tuần</h1>
        <p className="muted">
          Bạn đã đi hết lộ trình. Ghi âm bài 2 phút cuối cùng, nghe song song với bản ngày 0, và giữ thói quen ôn thẻ mỗi ngày.
        </p>
        <Link className="btn" href="/cards">Ôn thẻ</Link>
      </>
    );
  }

  const phase = PHASES[phaseIndex(week)];
  const topicOfWeek = WEEKS[week - 1];
  const dayIdx = diffDays(profile.start_date, today) % 7;
  const done = sessions[today] ?? [];
  const list = activitiesFor(week, profile.mode);
  const checks = profile.checks;
  const addCheck = (k: string) => updateProfile({ checks: Array.from(new Set([...checks, k])) });

  const pickTopic = () => {
    let next = topic;
    while (next === topic) next = TOPICS[Math.floor(Math.random() * TOPICS.length)];
    setTopic(next);
  };

  const cpDue = CHECKPOINT_WEEKS.includes(week) && dayIdx >= 4 && !checks.includes(`cp${week}`);

  return (
    <>
      <h1>
        Tuần {week} <small>trên 12, ngày {dayIdx + 1}</small>
      </h1>
      <div className="phase">
        {phase.name}: {phase.title}
      </div>
      <div className="dots" aria-label="Các buổi trong tuần">
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(profile.start_date, (week - 1) * 7 + i);
          const complete = isSessionComplete(weekOf(profile.start_date, d), sessions[d] ?? []);
          return <i key={d} className={`${complete ? "done" : ""}${d === today ? " today" : ""}`} />;
        })}
      </div>

      {!checks.includes("cp0") ? (
        <div className="note">
          <p>
            <strong>Trước khi bắt đầu:</strong> ghi âm 2 phút nói về bản thân và công việc, không chuẩn bị, không dừng lại. Giữ file này để so sánh ở tuần 4, 8 và 12.
          </p>
          <button className="btn sm" type="button" onClick={() => addCheck("cp0")}>Đã ghi âm bản gốc</button>
        </div>
      ) : cpDue ? (
        <div className="note">
          <p>
            <strong>Checkpoint tuần {week}:</strong> ghi âm lại bài 2 phút giới thiệu bản thân, nghe song song với bản ngày 0. Bạn nghe thấy điều gì khác?
          </p>
          <button className="btn sm" type="button" onClick={() => addCheck(`cp${week}`)}>Đã ghi âm checkpoint</button>
        </div>
      ) : null}

      <div className="topic">
        <strong>Chủ đề tuần: {topicOfWeek.vi}</strong>
        <div className="chunks">
          {topicOfWeek.chunks.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      </div>

      <div className="row between" style={{ marginTop: 26 }}>
        <h2 style={{ margin: 0 }}>Buổi tập hôm nay</h2>
        <div className="seg" role="group" aria-label="Thời lượng">
          {(["30", "60"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={profile.mode === m} onClick={() => updateProfile({ mode: m })}>
              {m} phút
            </button>
          ))}
        </div>
      </div>

      <div className="acts">
        {list.map(([key, minutes]) => {
          const a = ACT[key];
          const on = done.includes(key);
          return (
            <div key={key} className={`act${on ? " done" : ""}`}>
              <button className="tick" type="button" aria-pressed={on} aria-label={`Đánh dấu ${a.name} đã xong`} onClick={() => toggleActivity(key)}>
                <Check />
              </button>
              <div className="body">
                <div className="head">
                  <strong>{a.name}</strong>
                  <span className="min">{minutes} phút</span>
                </div>
                <p>{a.how}</p>
                {key === "flashcard" && (
                  <div className="extra">
                    <Link className="btn sm" href="/cards">Mở thẻ{dueCount ? ` (${dueCount})` : ""}</Link>
                  </div>
                )}
                {(key === "tranh" || key === "sobi") && (
                  <div className="extra">
                    <Link className="btn sm ghost" href="/notes">Mở sổ câu bí</Link>
                  </div>
                )}
                {(key === "motphut" || key === "khoidong") && (
                  <div className="extra">
                    <button className="btn sm ghost" type="button" onClick={pickTopic}>Bốc chủ đề</button>
                    <span className="topic-out" aria-live="polite">{topic}</span>
                  </div>
                )}
                {key === "hoidap" && <div className="prompt">{quickQaPrompt(topicOfWeek.en)}</div>}
                {key === "hoithoai" && <div className="prompt">{rolePlayPrompt(topicOfWeek.en)}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {isSessionComplete(week, done) ? <p className="done-msg">Xong buổi hôm nay. Chuỗi hiện tại: {streak} ngày.</p> : null}
    </>
  );
}
