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
  opponent    text check (char_length(opponent) <= 20),  -- PvP: the other player's name
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
grant insert (id, device_id, mode, side, difficulty, version, opponent) on public.matches to anon, authenticated;

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
      stats = case when octet_length(p_stats::text) <= 100000 then p_stats else stats end
  where id = p_id and device_id = p_device and ended_at is null
    and p_result in ('win', 'loss', 'quit');
$$;

-- The name for the leaderboard, given after a win (allowed for a day after the match ended).
create or replace function public.match_name(p_id uuid, p_device uuid, p_name text)
returns void language sql security definer set search_path = '' as $$
  update public.matches set player_name = nullif(left(btrim(p_name), 20), '')
  where id = p_id and device_id = p_device and ended_at > now() - interval '1 day';
$$;

-- A win's leaderboard score, from the stats the game saved: 10 points a kill, 50 a building
-- destroyed and 1 per 100 ore, plus a speed bonus of 5000 that shrinks with time (to a third by
-- 16 minutes), all times the difficulty (Easy 0.5, Normal 1, Hard 1.5). Report.score in the game
-- shows the same number in the debrief: change both together.
create or replace function public.match_score(p_stats jsonb, p_duration integer, p_difficulty text)
returns integer language sql immutable set search_path = '' as $$
  select round((
      coalesce((s->>'killed')::numeric, 0) * 10 + coalesce((s->>'bldKilled')::numeric, 0) * 50 + coalesce((s->>'harvested')::numeric, 0) / 100
      + 5000 * exp(-greatest(coalesce(p_duration, 0), 0) / 900.0)
    ) * case p_difficulty when 'hard' then 1.5 when 'easy' then 0.5 else 1 end)::integer
  from (select p_stats->'teams'->coalesce((p_stats->>'player')::int, 0)->'stats' as s) x;
$$;

-- A co-op team's score: match_score's sum over every player's side together (the stats keep all
-- sides; the players are the ones that are not the computer). Report.teamStats in the game: change both.
create or replace function public.team_score(p_stats jsonb, p_duration integer, p_difficulty text)
returns integer language sql immutable set search_path = '' as $$
  select round((
      coalesce(sum((t->'stats'->>'killed')::numeric), 0) * 10 + coalesce(sum((t->'stats'->>'bldKilled')::numeric), 0) * 50
      + coalesce(sum((t->'stats'->>'harvested')::numeric), 0) / 100
      + 5000 * exp(-greatest(coalesce(p_duration, 0), 0) / 900.0)
    ) * case p_difficulty when 'hard' then 1.5 when 'easy' then 0.5 else 1 end)::integer
  from jsonb_array_elements(case when jsonb_typeof(p_stats->'teams') = 'array' then p_stats->'teams' else '[]'::jsonb end) t
  where not coalesce((t->>'ai')::boolean, false);
$$;

-- The leaderboard: the five best scores at each difficulty, hardest first, each commander's best only
-- (names match ignoring case and spaces at the ends). p_limit (at most 5) is the places per difficulty.
-- p_mode 'skirmish': one row per match. 'pve' (online co-op): one row per battle (stats.battle, the same
-- on both phones), player_name is the teammates' names joined with ' & ' (a teammate who gave no name is
-- taken from the named player's opponent column, which holds the teammate), side likewise, and the score
-- is the team's; each team's best counts.
create or replace function public.get_leaderboard(p_mode text default 'skirmish', p_limit integer default 5)
returns table (rank bigint, player_name text, side text, difficulty text, duration_s integer, ended_at timestamptz, score integer)
language sql stable security definer set search_path = '' as $$
  with wins as (
    select m.player_name, m.opponent, m.side, m.difficulty, m.duration_s, m.ended_at,
           case when m.mode = 'pve' then coalesce(m.stats->>'battle', m.id::text) else m.id::text end as grp,
           case when m.mode = 'pve' then public.team_score(m.stats, m.duration_s, m.difficulty)
                else public.match_score(m.stats, m.duration_s, m.difficulty) end as score
    from public.matches m
    where m.mode = p_mode and m.result = 'win' and m.duration_s is not null
  ), games as (
    select w.grp, max(w.difficulty) as difficulty, max(w.duration_s) as duration_s, max(w.ended_at) as ended_at, max(w.score) as score,
           string_agg(distinct w.side, ' & ') as side,
           array_agg(btrim(w.player_name)) filter (where w.player_name is not null) as named,
           max(w.opponent) filter (where p_mode = 'pve' and w.player_name is not null and w.opponent not like 'Computer%') as opp
    from wins w group by w.grp
  ), scored as (
    select g.side, g.difficulty, g.duration_s, g.ended_at, g.score,
           (select string_agg(n, ' & ' order by lower(n)) from (select distinct n from unnest(
              case when cardinality(g.named) = 1 and g.opp is not null and lower(btrim(g.opp)) <> lower(g.named[1]) then g.named || btrim(g.opp) else g.named end) n) x) as player_name
    from games g where g.named is not null
  ), best as (
    select s.*, row_number() over (partition by s.difficulty, lower(s.player_name) order by s.score desc, s.duration_s, s.ended_at) as mine
    from scored s
  ), ranked as (
    select b.*, row_number() over (partition by b.difficulty order by b.score desc, b.duration_s, b.ended_at) as rk from best b where b.mine = 1
  )
  select r.rk, r.player_name, r.side, r.difficulty, r.duration_s, r.ended_at, r.score
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
revoke all on function public.team_score(jsonb, integer, text) from public, anon, authenticated;
