-- Speakflow v0.1 schema
-- Chạy file này trong Supabase SQL Editor (hoặc `supabase db push` nếu dùng Supabase CLI).

-- Hồ sơ học: ngày bắt đầu lộ trình, chế độ 30/60 phút, các tuần đã nạp thẻ, các mốc đã đánh dấu
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  start_date date not null default current_date,
  mode text not null default '30' check (mode in ('30', '60')),
  seeded_weeks int[] not null default '{}',
  checks text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Mỗi ngày một dòng: các hoạt động đã làm trong buổi tập
create table if not exists public.sessions (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  done text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- Thẻ lật ngược: mặt trước tiếng Việt, mặt sau tiếng Anh, kèm lịch ôn
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  front text not null check (char_length(front) <= 500),
  back text not null check (char_length(back) <= 500),
  note text not null default '',
  week int not null default 0,           -- 0 = thẻ do người dùng tạo
  seed_key text,                         -- ví dụ 'w3-2' cho thẻ có sẵn; null cho thẻ tự tạo
  due date not null default current_date,
  interval_days int not null default 0,
  ease real not null default 2.5,
  reps int not null default 0,
  lapses int not null default 0,
  is_new boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, seed_key)
);
create index if not exists cards_user_due_idx on public.cards (user_id, is_new, due);

-- Lịch sử chấm thẻ: dùng để giới hạn thẻ mới mỗi ngày và để phân tích sau này
create table if not exists public.reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  grade smallint not null check (grade between 0 and 3),
  was_new boolean not null default false,
  reviewed_at timestamptz not null default now()
);
create index if not exists reviews_user_time_idx on public.reviews (user_id, reviewed_at);

-- Sổ câu bí: ý bằng tiếng Việt và các cách nói tiếng Anh gợi ý
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  vi text not null check (char_length(vi) <= 500),
  options jsonb not null default '[]'::jsonb,
  carded int[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists notes_user_created_idx on public.notes (user_id, created_at desc);

-- Nhật ký gọi Claude API: dùng để giới hạn số lần gọi mỗi ngày
create table if not exists public.ai_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'suggest',
  created_at timestamptz not null default now()
);
create index if not exists ai_requests_user_time_idx on public.ai_requests (user_id, created_at);

-- Row Level Security: mỗi người chỉ đọc và ghi dữ liệu của chính mình
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.cards enable row level security;
alter table public.reviews enable row level security;
alter table public.notes enable row level security;
alter table public.ai_requests enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sessions" on public.sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own cards" on public.cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own reviews" on public.reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own notes" on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own ai requests read" on public.ai_requests
  for select using (auth.uid() = user_id);
create policy "own ai requests insert" on public.ai_requests
  for insert with check (auth.uid() = user_id);
