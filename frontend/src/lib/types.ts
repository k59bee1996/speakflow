export type Mode = "30" | "60";

export interface Profile {
  user_id: string;
  start_date: string;
  mode: Mode;
  seeded_weeks: number[];
  checks: string[];
}

export interface Card {
  id: string;
  user_id: string;
  front: string;
  back: string;
  note: string;
  week: number;
  seed_key: string | null;
  due: string;
  interval_days: number;
  ease: number;
  reps: number;
  lapses: number;
  is_new: boolean;
  created_at: string;
}

export interface NoteOption {
  en: string;
  note: string;
}

export interface Note {
  id: string;
  user_id: string;
  vi: string;
  options: NoteOption[];
  options_version: string;
  carded: number[];
  created_at: string;
}
