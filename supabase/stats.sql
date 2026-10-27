-- Queries behind the owner's stats page (https://claude.ai/artifact/M6HpucTzaWMnQvx5g59BH9),
-- run live through the Supabase connector with the owner's own access, never the game's public key.
-- Days and weeks are counted in UTC.

-- Headline numbers: Players right now (a heartbeat in the last 2 minutes), matches today and this week (UTC), and the average length of finished matches. Reads public.matches.
with s as (
  select
    (select count(distinct device_id) from public.matches where ended_at is null and last_seen > now() - interval '2 minutes') as playing_now,
    (select count(*) from public.matches where started_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') as matches_today,
    (select count(*) from public.matches where started_at >= date_trunc('week', now() at time zone 'UTC') at time zone 'UTC') as matches_this_week,
    (select count(distinct device_id) from public.matches where started_at >= date_trunc('week', now() at time zone 'UTC') at time zone 'UTC') as players_this_week,
    (select round(avg(duration_s))::int from public.matches where result in ('win', 'loss')) as avg_length_s,
    (select count(*) from public.matches where result in ('win', 'loss')) as finished_matches
)
select s.*, case when avg_length_s is null then null else (avg_length_s / 60) || ':' || lpad(mod(avg_length_s, 60)::text, 2, '0') end as avg_length
from s;

-- Results by side and difficulty: Wins, losses and quits against the computer for each side and difficulty, with the win rate and average length. Reads public.matches.
with grid as (
  select s.side, d.difficulty, d.ord
  from (values ('allies'), ('soviets')) as s(side)
  cross join (values ('easy', 1), ('normal', 2), ('hard', 3)) as d(difficulty, ord)
), agg as (
  select side, difficulty,
    count(*) filter (where result = 'win') as wins,
    count(*) filter (where result = 'loss') as losses,
    count(*) filter (where result = 'quit') as quits,
    round(avg(duration_s) filter (where result in ('win', 'loss')))::int as avg_s
  from public.matches where mode = 'skirmish'
  group by side, difficulty
)
select initcap(g.side) || ' · ' || initcap(g.difficulty) as matchup,
  initcap(g.side) as side, initcap(g.difficulty) as difficulty,
  coalesce(a.wins, 0) as wins, coalesce(a.losses, 0) as losses, coalesce(a.quits, 0) as quits,
  case when coalesce(a.wins, 0) + coalesce(a.losses, 0) = 0 then null
       else round(100.0 * a.wins / (a.wins + a.losses))::int end as win_rate_pct,
  case when a.avg_s is null then null else (a.avg_s / 60) || ':' || lpad(mod(a.avg_s, 60)::text, 2, '0') end as avg_length
from grid g left join agg a on a.side = g.side and a.difficulty = g.difficulty
order by g.side, g.ord;

-- Matches per day: Matches started and devices playing on each of the last 30 days (UTC). Reads public.matches.
select to_char(d.day, 'YYYY-MM-DD') as day, count(m.id)::int as matches, count(distinct m.device_id)::int as players
from generate_series((now() at time zone 'UTC')::date - 29, (now() at time zone 'UTC')::date, interval '1 day') as d(day)
left join public.matches m on (m.started_at at time zone 'UTC')::date = d.day::date
group by d.day order by d.day;

-- Latest matches: The 25 most recent matches: when, side, difficulty, outcome, length, leaderboard name and game version. Reads public.matches.
select left(id::text, 8) as match, to_char(started_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as started_utc,
  initcap(side) as side, initcap(coalesce(difficulty, '')) as difficulty,
  case when result is not null then initcap(result)
       when last_seen > now() - interval '2 minutes' then 'Playing'
       else 'Abandoned' end as outcome,
  case when duration_s is null then null else (duration_s / 60) || ':' || lpad(mod(duration_s, 60)::text, 2, '0') end as length,
  coalesce(player_name, '') as name, coalesce(version, '') as version
from public.matches order by started_at desc limit 25;
