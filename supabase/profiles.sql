-- Red Horizon player profiles (Supabase Auth, email and a one-time code). Run after schema.sql.
-- Paste the whole file into the Supabase SQL editor and run it once. It is safe to run again.
--
-- A profile is a commander name on a Supabase account. Signing in links that phone's matches to
-- the account, past ones included, and the profile page adds them up: play time, lifetime kills and
-- the most ore gathered in one game. Playing without an account works as before.
--
-- What a signed-in player may do, only through the functions below and only for their own account:
--   set their name, link this phone's matches, read their own profile numbers, delete their account.
-- Nobody can read anyone else's email, profile or matches through the API.

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 3 and 20),
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_name_key on public.profiles (lower(name));
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;

-- Which account a match belongs to: set when it starts with someone signed in, or later when
-- they sign in on the phone it was played on. Deleting the account unlinks its matches.
alter table public.matches add column if not exists user_id uuid references auth.users (id) on delete set null;
alter table public.matches alter column user_id set default auth.uid();
create index if not exists matches_user_idx on public.matches (user_id);

-- The commander name: 3 to 20 characters, letters, digits, spaces and . _ - only, one of a kind
-- (ignoring capitals). Returns 'ok', 'taken', 'invalid' or 'signed out'.
create or replace function public.set_profile_name(p_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  n text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if auth.uid() is null then return 'signed out'; end if;
  if char_length(n) < 3 or char_length(n) > 20 or n !~ '^[A-Za-z0-9][A-Za-z0-9 ._-]*$' then return 'invalid'; end if;
  if exists (select 1 from public.profiles where lower(name) = lower(n) and id <> auth.uid()) then return 'taken'; end if;
  insert into public.profiles (id, name) values (auth.uid(), n)
  on conflict (id) do update set name = excluded.name;
  return 'ok';
exception when unique_violation then
  return 'taken';
end;
$$;

-- Link this phone's matches that belong to nobody yet to the signed-in account. The device id is
-- never readable through the API, so only the phone itself knows it. Returns how many were linked.
create or replace function public.claim_device(p_device uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if auth.uid() is null then return 0; end if;
  update public.matches set user_id = auth.uid() where device_id = p_device and user_id is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- The signed-in player's profile: name, when they joined and their numbers over every linked
-- match (play time counts quits and matches the app was closed on, up to their last minute).
create or replace function public.my_profile()
returns table (name text, joined timestamptz, matches bigint, wins bigint, losses bigint,
               play_s bigint, kills bigint, best_ore bigint, best_ore_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select m.*, coalesce((m.stats->>'player')::int, 0) as pl
    from public.matches m
    where m.user_id = auth.uid()
  ), nums as (
    select count(*) as matches,
      count(*) filter (where result = 'win') as wins,
      count(*) filter (where result = 'loss') as losses,
      coalesce(sum(duration_s), 0)::bigint as play_s,
      coalesce(sum(coalesce((stats->'teams'->pl->'stats'->>'killed')::numeric, 0)), 0)::bigint as kills
    from mine
  ), ore as (
    select round((stats->'teams'->pl->'stats'->>'harvested')::numeric)::bigint as best_ore, started_at as best_ore_at
    from mine where stats->'teams'->pl->'stats'->>'harvested' is not null
    order by (stats->'teams'->pl->'stats'->>'harvested')::numeric desc limit 1
  )
  select p.name, p.created_at, n.matches, n.wins, n.losses, n.play_s, n.kills, o.best_ore, o.best_ore_at
  from public.profiles p cross join nums n left join ore o on true
  where p.id = auth.uid()
  union all
  -- Signed in but no name chosen yet: the numbers still come back, without a name.
  select null, null, n.matches, n.wins, n.losses, n.play_s, n.kills, o.best_ore, o.best_ore_at
  from nums n left join ore o on true
  where auth.uid() is not null and not exists (select 1 from public.profiles where id = auth.uid());
$$;

-- Delete the signed-in account and its profile for good. Its matches stay in the stats, unlinked.
create or replace function public.delete_my_account()
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return false; end if;
  delete from auth.users where id = auth.uid();
  return true;
end;
$$;

revoke all on function public.set_profile_name(text) from public;
revoke all on function public.claim_device(uuid) from public;
revoke all on function public.my_profile() from public;
revoke all on function public.delete_my_account() from public;
grant execute on function public.set_profile_name(text) to authenticated;
grant execute on function public.claim_device(uuid) to authenticated;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
