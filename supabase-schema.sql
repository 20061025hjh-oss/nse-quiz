-- 国家安全教育答题网站：Supabase 数据表与权限
-- 使用方法：Supabase 项目后台 -> SQL Editor -> New query -> 粘贴全部内容 -> Run。

create extension if not exists pgcrypto;

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 20),
  score integer not null check (score between 0 and 100),
  correct_count integer not null default 0 check (correct_count between 0 and 50),
  total_count integer not null default 50 check (total_count between 1 and 50),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  details jsonb not null default '[]'::jsonb check (jsonb_typeof(details) = 'array'),
  created_at timestamptz not null default now(),
  check (correct_count <= total_count)
);

-- 兼容已经跑过旧版 SQL 的项目：补齐新版字段，并尽量从旧字段回填。
alter table public.quiz_attempts
  add column if not exists correct_count integer not null default 0 check (correct_count between 0 and 50),
  add column if not exists total_count integer not null default 50 check (total_count between 1 and 50),
  add column if not exists duration_seconds integer not null default 0 check (duration_seconds >= 0),
  add column if not exists answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  add column if not exists details jsonb not null default '[]'::jsonb check (jsonb_typeof(details) = 'array'),
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'quiz_attempts' and column_name = 'correct'
  ) then
    execute 'update public.quiz_attempts set correct_count = correct where correct_count = 0 and correct is not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'quiz_attempts' and column_name = 'total'
  ) then
    execute 'update public.quiz_attempts set total_count = total where total_count = 50 and total is not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'quiz_attempts' and column_name = 'submitted_at'
  ) then
    execute 'update public.quiz_attempts set created_at = submitted_at where submitted_at is not null';
    execute 'alter table public.quiz_attempts alter column submitted_at set default now()';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'quiz_attempts' and column_name = 'correct'
  ) then
    execute 'alter table public.quiz_attempts alter column correct set default 0';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'quiz_attempts' and column_name = 'total'
  ) then
    execute 'alter table public.quiz_attempts alter column total set default 50';
  end if;
end $$;

create index if not exists quiz_attempts_rank_idx
on public.quiz_attempts (score desc, created_at asc);

alter table public.quiz_attempts enable row level security;

drop policy if exists "quiz_attempts_select_all" on public.quiz_attempts;
create policy "quiz_attempts_select_all"
on public.quiz_attempts
for select
to anon, authenticated
using (true);

drop policy if exists "quiz_attempts_insert_public" on public.quiz_attempts;
create policy "quiz_attempts_insert_public"
on public.quiz_attempts
for insert
to anon, authenticated
with check (
  char_length(trim(name)) between 1 and 20
  and score between 0 and 100
  and correct_count between 0 and 50
  and total_count between 1 and 50
  and correct_count <= total_count
  and duration_seconds >= 0
  and jsonb_typeof(answers) = 'array'
  and jsonb_typeof(details) = 'array'
);

grant usage on schema public to anon, authenticated;
grant select, insert on public.quiz_attempts to anon, authenticated;
revoke update, delete on public.quiz_attempts from anon, authenticated;

-- 开启 Realtime。若已加入 publication，则跳过。
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'quiz_attempts'
  ) then
    alter publication supabase_realtime add table public.quiz_attempts;
  end if;
end $$;
