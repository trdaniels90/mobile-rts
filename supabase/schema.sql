-- Red Horizon match reporting and leaderboard (Supabase, free tier).
-- Paste the whole file into the Supabase SQL editor and run it once. It is safe to run again.
--
-- What the game (the public "anon" key) may do:
--   insert  a new match row, only the columns it starts with (everything else is set here);
--   update  only its own match, through the functions below, which check the per-device id;
--   read    only the leaderboard, through get_leaderboard (names, sides, difficulties, times);
--   delete  nothing.
-- Scores come from the game itself, so they can be faked. Fine for testers for now.

create table if not exists public.matches (
  id          uuid primary key,
  device_id   uuid not null,                         -- random per device, kept in localStorage; never readable
  mode        text not null default 'skirmish' check (mode in ('skirmish', 'pve', 'pvp')),   -- skirmish: one player against the computer
  side        text not null check (side in ('allies', 'soviets')),
  difficulty  text check (difficulty in ('easy', 'normal', 'hard')),                         -- null in PvP
  opponent    text,                                  -- reserved for PvP: the other player's name
  version     text check (char_length(version) <= 32),
  started_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),    -- heartbeat while the match runs
  ended_at    timestamptz,
  result      text check (result in ('win', 'loss', 'quit')),
  duration_s  integer check (duration_s between 0 and 86400),
  stats       jsonb,                                 -- G.stats of both sides and G.log, from the debrief
  player_name text check (char_length(player_name) between 1 and 20)
);
create index if not exists matches_started_idx on public.matches (started_at);
create index if not exists matches_live_idx on public.matches (last_seen) where ended_at is null;
create index if not exists matches_board_idx on public.matches (mode, difficulty, duration_s) where result = 'win' and player_name is not null;

alter table public.matches enable row level security;

-- Table privileges: insert of the starting columns only; no select, update or delete.
revoke all on public.matches from anon, authenticated;
grant insert (id, device_id, mode, side, difficulty, version) on public.matches to anon, authenticated;

drop policy if exists "anyone can start a match" on public.matches;
create policy "anyone can start a match" on public.matches for insert to anon, authenticated with check (true);

-- Updates: a match can only be changed by the device that started it (the device id is never
-- readable through the API, so it works as that device's key), and only until it has ended.
create or replace function public.match_heartbeat(p_id uuid, p_device uuid)
returns void language sql security definer set search_path = '' as $$
  update public.matches set last_seen = now()
  where id = p_id and device_id = p_device and ended_at is null;
$$;

-- Progress while a match runs: the heartbeat plus the debrief numbers so far, so a match the
-- app was closed on keeps its numbers up to its last minute. Only the starting device, and only
-- until the match has ended.
create or replace function public.match_progress(p_id uuid, p_device uuid, p_duration integer, p_stats jsonb)
returns void language sql security definer set search_path = '' as $$
  update public.matches
  set last_seen = now(),
      duration_s = case when p_duration between 0 and 86400 then p_duration else duration_s end,
      stats = case when octet_length(p_stats::text) <= 100000 then p_stats else stats end
  where id = p_id and device_id = p_device and ended_at is null;
$$;

create or replace function public.match_end(p_id uuid, p_device uuid, p_result text, p_duration integer, p_stats jsonb)
returns void language sql security definer set search_path = '' as $$
  update public.matches
  set ended_at = now(), last_seen = now(), result = p_result, duration_s = p_duration,
      stats = case when octet_length(p_stats::text) <= 100000 then p_stats end
  where id = p_id and device_id = p_device and ended_at is null
    and p_result in ('win', 'loss', 'quit');
$$;

-- The name for the leaderboard, given after a win (allowed for a day after the match ended).
create or replace function public.match_name(p_id uuid, p_device uuid, p_name text)
returns void language sql security definer set search_path = '' as $$
  update public.matches set player_name = nullif(left(btrim(p_name), 20), '')
  where id = p_id and device_id = p_device and ended_at > now() - interval '1 day';
$$;

-- The leaderboard: the five fastest wins at each difficulty, hardest first. Every win counts, so one
-- name can hold several places. p_limit (at most 5) is the places per difficulty; p_mode leaves room
-- for PvE and PvP boards later.
create or replace function public.get_leaderboard(p_mode text default 'skirmish', p_limit integer default 5)
returns table (rank bigint, player_name text, side text, difficulty text, duration_s integer, ended_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with ranked as (
    select m.player_name, m.side, m.difficulty, m.duration_s, m.ended_at,
      row_number() over (partition by m.difficulty order by m.duration_s, m.ended_at) as rk
    from public.matches m
    where m.mode = p_mode and m.result = 'win' and m.player_name is not null and m.duration_s is not null
  )
  select r.rk, r.player_name, r.side, r.difficulty, r.duration_s, r.ended_at
  from ranked r
  where r.rk <= least(greatest(p_limit, 1), 5)
  order by case r.difficulty when 'hard' then 0 when 'normal' then 1 when 'easy' then 2 else 3 end, r.rk;
$$;

revoke all on function public.match_heartbeat(uuid, uuid) from public;
revoke all on function public.match_progress(uuid, uuid, integer, jsonb) from public;
revoke all on function public.match_end(uuid, uuid, text, integer, jsonb) from public;
revoke all on function public.match_name(uuid, uuid, text) from public;
revoke all on function public.get_leaderboard(text, integer) from public;
grant execute on function public.match_heartbeat(uuid, uuid) to anon, authenticated;
grant execute on function public.match_progress(uuid, uuid, integer, jsonb) to anon, authenticated;
grant execute on function public.match_end(uuid, uuid, text, integer, jsonb) to anon, authenticated;
grant execute on function public.match_name(uuid, uuid, text) to anon, authenticated;
grant execute on function public.get_leaderboard(text, integer) to anon, authenticated;
