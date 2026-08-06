-- =====================================================
-- 记事本日历应用 - Supabase 初始化 SQL
-- 在 Supabase 控制台 → SQL Editor 中一次性执行
-- =====================================================

-- ---------- 笔记表 ----------
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default '',
  content text not null default '',
  tags text[] default '{}',
  note_date date,
  is_pinned boolean default false,
  is_deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  client_updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create index if not exists idx_notes_user_id on notes(user_id);
create index if not exists idx_notes_user_date on notes(user_id, note_date);
create index if not exists idx_notes_updated_at on notes(user_id, updated_at);

-- ---------- 日历事件表 ----------
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  description text default '',
  event_date date not null,
  event_time time,
  remind_minutes int,
  is_deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  client_updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create index if not exists idx_events_user_date on events(user_id, event_date);
create index if not exists idx_events_updated_at on events(user_id, updated_at);

-- ---------- 行级安全（RLS）----------
alter table notes enable row level security;
drop policy if exists "notes select" on notes;
create policy "notes select" on notes for select using (auth.uid() = user_id);
drop policy if exists "notes insert" on notes;
create policy "notes insert" on notes for insert with check (auth.uid() = user_id);
drop policy if exists "notes update" on notes;
create policy "notes update" on notes for update using (auth.uid() = user_id);
drop policy if exists "notes delete" on notes;
create policy "notes delete" on notes for delete using (auth.uid() = user_id);

alter table events enable row level security;
drop policy if exists "events select" on events;
create policy "events select" on events for select using (auth.uid() = user_id);
drop policy if exists "events insert" on events;
create policy "events insert" on events for insert with check (auth.uid() = user_id);
drop policy if exists "events update" on events;
create policy "events update" on events for update using (auth.uid() = user_id);
drop policy if exists "events delete" on events;
create policy "events delete" on events for delete using (auth.uid() = user_id);

-- ---------- 自动更新 updated_at 触发器 ----------
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_notes_updated_at on notes;
create trigger trg_notes_updated_at
  before update on notes
  for each row execute function update_updated_at();

drop trigger if exists trg_events_updated_at on events;
create trigger trg_events_updated_at
  before update on events
  for each row execute function update_updated_at();

-- ---------- 启用 Realtime（跨设备实时同步）----------
alter publication supabase_realtime add table notes;
alter publication supabase_realtime add table events;
