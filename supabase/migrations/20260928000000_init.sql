-- Creator Hub — initial schema
-- Run once in Supabase → SQL Editor (or `supabase db push` if you use the CLI).
-- Every row belongs to one auth user; RLS makes other users' rows invisible.

create type public.post_stage as enum ('idea', 'draft', 'ready', 'posted');

-- ─── Collabs: one row per brand/platform deal ───────────────────────────────
create table public.collabs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  color         text not null default '#B5532C' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  platforms     text[] not null default '{}',
  monthly_quota integer not null check (monthly_quota between 0 and 500),
  -- months are 'YYYY-MM'; quota applies to every month in [start_month, end_month]
  start_month   text not null check (start_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  end_month     text check (end_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  notes         text not null default '',
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint collab_month_order check (end_month is null or end_month >= start_month)
);

-- ─── Posts: each deliverable moves idea → draft → ready → posted ────────────
create table public.posts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collab_id  uuid not null references public.collabs (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  platform   text not null default '',
  stage      public.post_stage not null default 'idea',
  due_date   date,
  posted_at  date,          -- the day it went live; decides which month it counts toward
  url        text,          -- proof link
  notes      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posted_needs_date check (stage <> 'posted' or posted_at is not null)
);

create index posts_user_collab_idx on public.posts (user_id, collab_id);
create index posts_posted_at_idx on public.posts (user_id, posted_at);
create index posts_due_date_idx on public.posts (user_id, due_date);
create index collabs_user_idx on public.collabs (user_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger posts_touch before update on public.posts
for each row execute function public.touch_updated_at();

-- ─── Row Level Security ─────────────────────────────────────────────────────
alter table public.collabs enable row level security;
alter table public.posts enable row level security;

create policy "own collabs" on public.collabs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own posts" on public.posts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.collabs c where c.id = collab_id and c.user_id = (select auth.uid()))
  );

grant select, insert, update, delete on public.collabs, public.posts to authenticated;
