-- Creator Hub — multi-user workspace
-- Run AFTER 20260928000000_init.sql, in Supabase → SQL Editor.
-- Adds: profiles + invite-only sign-up, media metadata (files live in Cloudflare R2), Launchpad,
-- hashtag sets, program tags, the Characters album and the Prompt library. Every row belongs to one
-- user; row level security hides everyone else's rows.

-- ─── Invites & profiles ──────────────────────────────────────────────────────
-- Sign-up is invite-only: an email must be in public.invites before its first login creates an account.
-- Only the service role (the app's admin page) can read or change invites.
create table public.invites (
  email       text primary key check (email = lower(email) and email like '%@%'),
  is_admin    boolean not null default false,
  note        text not null default '',
  invited_at  timestamptz not null default now(),
  accepted_at timestamptz
);
alter table public.invites enable row level security; -- no policies: service role only

create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  email               text not null,
  display_name        text not null default '' check (char_length(display_name) <= 80),
  is_admin            boolean not null default false,
  program_tags_seeded boolean not null default false,
  created_at          timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "read own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "update own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant select on public.profiles to authenticated;
-- users may change their name and the seeding flag, never is_admin/email
grant update (display_name, program_tags_seeded) on public.profiles to authenticated;

-- Defence in depth: refuse to create an auth user whose email wasn't invited, even if the app has a bug.
create or replace function public.enforce_invite() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.invites i where i.email = lower(new.email)) then
    raise exception 'Sign-up is invite-only.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger enforce_invite before insert on auth.users
for each row execute function public.enforce_invite();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare inv public.invites;
begin
  select * into inv from public.invites where email = lower(new.email);
  insert into public.profiles (id, email, is_admin)
  values (new.id, lower(coalesce(new.email, '')), coalesce(inv.is_admin, false));
  update public.invites set accepted_at = now() where email = lower(new.email) and accepted_at is null;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

revoke execute on function public.enforce_invite() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ─── Media (metadata only; the bytes are in R2 under <user_id>/<id>/…) ────────
create table public.assets (
  id         text primary key check (id ~ '^[a-f0-9]{16}$'),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 200),
  file       text not null check (file ~ '^original(\.[a-z0-9]{1,8})?$'),
  kind       text not null check (kind in ('image', 'video', 'other')),
  mime       text not null default '',
  size       bigint not null default 0 check (size >= 0),
  width      integer,
  height     integer,
  duration   real,
  has_thumb  boolean not null default false,
  status     text not null default 'pending' check (status in ('pending', 'ready')),
  created_at timestamptz not null default now()
);
create index assets_user_idx on public.assets (user_id, created_at);

-- ─── Launchpad ───────────────────────────────────────────────────────────────
create table public.launch_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title         text not null default '' check (char_length(title) <= 200),
  notes         text not null default '',
  caption       text not null default '',
  hashtags      text[] not null default '{}',
  first_comment text not null default '',
  link          text not null default '',
  asset_ids     text[] not null default '{}',
  collab_ids    text[] not null default '{}',
  character_ids text[] not null default '{}',
  platforms     jsonb not null,
  ready         boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index launch_items_user_idx on public.launch_items (user_id, updated_at desc);
create trigger launch_items_touch before update on public.launch_items
for each row execute function public.touch_updated_at();

create table public.hashtag_sets (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name    text not null check (char_length(name) between 1 and 60),
  tags    text[] not null default '{}'
);

create table public.program_tags (
  collab_id uuid primary key references public.collabs (id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tags      text[] not null default '{}'
);

-- ─── Characters album ────────────────────────────────────────────────────────
create table public.album (
  asset_id text primary key references public.assets (id) on delete cascade,
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

-- ─── Prompt library ──────────────────────────────────────────────────────────
create table public.prompts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null default '' check (char_length(title) <= 200),
  kind       text not null default 'video' check (kind in ('video', 'image')),
  model      text not null default '',
  prompt     text not null,
  negative   text not null default '',
  links      jsonb not null default '[]',
  asset_ids  text[] not null default '{}',
  tags       text[] not null default '{}',
  collab_ids text[] not null default '{}',
  notes      text not null default '',
  favorite   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prompts_user_idx on public.prompts (user_id, updated_at desc);
-- Starring a prompt isn't an edit: keep updated_at (the library's sort order) unless content changed.
create or replace function public.prompts_touch() returns trigger
language plpgsql as $$
begin
  if (to_jsonb(new) - 'favorite' - 'updated_at') is distinct from (to_jsonb(old) - 'favorite' - 'updated_at') then
    new.updated_at = now();
  else
    new.updated_at = old.updated_at;
  end if;
  return new;
end $$;
create trigger prompts_touch before update on public.prompts
for each row execute function public.prompts_touch();

-- ─── Row level security: own rows only ──────────────────────────────────────
alter table public.assets enable row level security;
alter table public.launch_items enable row level security;
alter table public.hashtag_sets enable row level security;
alter table public.program_tags enable row level security;
alter table public.album enable row level security;
alter table public.prompts enable row level security;

create policy "own assets" on public.assets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own launch items" on public.launch_items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own hashtag sets" on public.hashtag_sets for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own program tags" on public.program_tags for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.collabs c where c.id = collab_id and c.user_id = (select auth.uid()))
  );
create policy "own album" on public.album for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.assets a where a.id = asset_id and a.user_id = (select auth.uid()))
  );
create policy "own prompts" on public.prompts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on
  public.assets, public.launch_items, public.hashtag_sets, public.program_tags, public.album, public.prompts
to authenticated;

-- ─── First admin ─────────────────────────────────────────────────────────────
-- Invite yourself before your first login (change the email if needed):
insert into public.invites (email, is_admin, note) values ('vuquocanh12052007@gmail.com', true, 'owner')
on conflict (email) do update set is_admin = true;
