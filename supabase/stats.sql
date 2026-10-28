-- Queries behind the owner's stats page (https://claude.ai/artifact/M6HpucTzaWMnQvx5g59BH9),
-- run live through the Supabase connector with the owner's own access, never the game's public key.
-- Days and weeks are counted in Central time (America/Chicago). {{match}} is the match picked on the
-- page (NULL: the latest finished match).

-- Headline numbers: Players right now (a heartbeat in the last 2 minutes), matches today and this week (Central time), and the average length of finished matches. Reads public.matches.
with s as (
  select
    (select count(distinct device_id) from public.matches where ended_at is null and last_seen > now() - interval '2 minutes') as playing_now,
    (select count(*) from public.matches where started_at >= date_trunc('day', now() at time zone 'America/Chicago') at time zone 'America/Chicago') as matches_today,
    (select count(*) from public.matches where started_at >= date_trunc('week', now() at time zone 'America/Chicago') at time zone 'America/Chicago') as matches_this_week,
    (select count(distinct device_id) from public.matches where started_at >= date_trunc('week', now() at time zone 'America/Chicago') at time zone 'America/Chicago') as players_this_week,
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

-- Matches per day: Matches started and devices playing on each of the last 30 days (Central time). Reads public.matches.
select to_char(d.day, 'YYYY-MM-DD') as day, count(m.id)::int as matches, count(distinct m.device_id)::int as players
from generate_series((now() at time zone 'America/Chicago')::date - 29, (now() at time zone 'America/Chicago')::date, interval '1 day') as d(day)
left join public.matches m on (m.started_at at time zone 'America/Chicago')::date = d.day::date
group by d.day order by d.day;

-- Latest matches: The 25 most recent matches: when, side, difficulty, outcome, length, leaderboard name and game version. Reads public.matches.
select id::text as id, left(id::text, 8) as match, to_char(started_at at time zone 'America/Chicago', 'YYYY-MM-DD HH24:MI') as started,
  initcap(side) as side, initcap(coalesce(difficulty, '')) as difficulty,
  case when result is not null then initcap(result)
       when last_seen > now() - interval '2 minutes' then 'Playing'
       else 'Abandoned' end as outcome,
  case when duration_s is null then null else (duration_s / 60) || ':' || lpad(mod(duration_s, 60)::text, 2, '0') end as length,
  coalesce(player_name, '') as name, coalesce(version, '') as version
from public.matches order by started_at desc limit 25;

-- Picked match details: Side, difficulty, outcome, length, start time (Central), leaderboard name and version of the match picked in Latest matches, or the latest finished one. Reads public.matches.
with pick as (
  select m.*, coalesce((m.stats->>'player')::int, 0) as pl
  from public.matches m
  where m.id = coalesce(cast({{match}} as uuid), (select id from public.matches where stats is not null order by started_at desc limit 1))
)
select id::text as id, left(id::text, 8) as match, to_char(started_at at time zone 'America/Chicago', 'YYYY-MM-DD HH24:MI') as started,
  initcap(side) as side, initcap(coalesce(stats->'teams'->(1 - pl)->>'faction', case side when 'allies' then 'soviets' else 'allies' end)) as enemy_side,
  initcap(coalesce(difficulty, '')) as difficulty,
  case when result = 'win' then 'Mission accomplished' when result = 'loss' then 'Mission failed'
       when result = 'quit' then 'Quit' when last_seen > now() - interval '2 minutes' then 'In progress'
       else 'Abandoned (the app was closed)' end as outcome,
  case when duration_s is null then null else (duration_s / 60) || ':' || lpad(mod(duration_s, 60)::text, 2, '0') end as length,
  coalesce(player_name, '') as name, coalesce(version, '') as version, (stats is not null) as has_debrief
from pick;

-- Picked match scorecard: Each side's units built and lost, kills, buildings destroyed and lost, and ore harvested, from the match's debrief report. Reads public.matches.stats.
with pick as (
  select m.*, coalesce((m.stats->>'player')::int, 0) as pl
  from public.matches m
  where m.id = coalesce(cast({{match}} as uuid), (select id from public.matches where stats is not null order by started_at desc limit 1))
), m as (
  select x.ord, x.measure, x.low, x.money,
    coalesce((p.stats->'teams'->p.pl->'stats'->>x.k)::bigint, 0) as y,
    coalesce((p.stats->'teams'->(1 - p.pl)->'stats'->>x.k)::bigint, 0) as e
  from pick p
  cross join (values (1, 'Units built', 'units', false, false), (2, 'Units lost', 'lost', true, false),
    (3, 'Enemies destroyed', 'killed', false, false), (4, 'Buildings destroyed', 'bldKilled', false, false),
    (5, 'Buildings lost', 'bldLost', true, false), (6, 'Ore harvested', 'harvested', false, true)) as x(ord, measure, k, low, money)
  where p.stats is not null
)
select measure,
  case when money then chr(36) || to_char(y, 'FM999,999,990') else to_char(y, 'FM999,999,990') end as you,
  case when money then chr(36) || to_char(e, 'FM999,999,990') else to_char(e, 'FM999,999,990') end as enemy,
  case when y = e then 'even' when (y < e) = low then 'you' else 'enemy' end as ahead
from m order by ord;

-- Picked match strength: Army value, income per minute (averaged over the last minute) and buildings of both sides every 15 seconds through the match. Reads public.matches.stats.
with pick as (
  select m.*, coalesce((m.stats->>'player')::int, 0) as pl
  from public.matches m
  where m.id = coalesce(cast({{match}} as uuid), (select id from public.matches where stats is not null order by started_at desc limit 1))
), s as (
  select (x.v->>'t')::int as t, x.n,
    (x.v->'army'->>p.pl)::int as army_you, (x.v->'army'->>(1 - p.pl))::int as army_enemy,
    (x.v->'income'->>p.pl)::int as inc_you, (x.v->'income'->>(1 - p.pl))::int as inc_enemy,
    (x.v->'blds'->>p.pl)::int as blds_you, (x.v->'blds'->>(1 - p.pl))::int as blds_enemy
  from pick p cross join lateral jsonb_array_elements(coalesce(p.stats->'log'->'samples', '[]'::jsonb)) with ordinality as x(v, n)
)
select t, (t / 60) || ':' || lpad(mod(t, 60)::text, 2, '0') as clock, army_you, army_enemy,
  round(avg(inc_you) over w)::int as income_you, round(avg(inc_enemy) over w)::int as income_enemy,
  blds_you, blds_enemy
from s window w as (order by n rows between 3 preceding and current row)
order by n;

-- Picked match key moments: The match's key moments: first waves, big pushes, Outposts and Construction Yards lost. Reads public.matches.stats.
with pick as (
  select m.*, coalesce((m.stats->>'player')::int, 0) as pl
  from public.matches m
  where m.id = coalesce(cast({{match}} as uuid), (select id from public.matches where stats is not null order by started_at desc limit 1))
)
select (x.v->>'t')::int as t, ((x.v->>'t')::int / 60) || ':' || lpad(mod((x.v->>'t')::int, 60)::text, 2, '0') as clock,
  case when (x.v->>'team')::int = p.pl then 'You' else 'Enemy' end as who,
  case when (x.v->>'team')::int = p.pl then 'Your ' else 'Enemy ' end ||
    case x.v->>'kind' when 'cy lost' then 'Construction Yard destroyed' when 'outpost lost' then 'Outpost lost' else x.v->>'kind' end as moment
from pick p cross join lateral jsonb_array_elements(coalesce(p.stats->'log'->'events', '[]'::jsonb)) with ordinality as x(v, n)
order by x.n;

-- Picked match MVP: The player's unit with the most kills in the match, standing or fallen. Reads public.matches.stats.
with pick as (
  select m.*, coalesce((m.stats->>'player')::int, 0) as pl
  from public.matches m
  where m.id = coalesce(cast({{match}} as uuid), (select id from public.matches where stats is not null order by started_at desc limit 1))
), u as (
  select x.v->>'type' as type, coalesce(p.stats->'names'->>(x.v->>'type'), initcap(x.v->>'type')) as unit,
    coalesce((x.v->>'kills')::int, 0) as kills, coalesce((x.v->>'worth')::int, 0) as worth,
    (x.v->>'born')::numeric as born, (x.v->>'died')::numeric as died, coalesce(p.duration_s, 0) as end_t
  from pick p cross join lateral jsonb_array_elements(coalesce(p.stats->'log'->'fallen', '[]'::jsonb) || coalesce(p.stats->'log'->'alive', '[]'::jsonb)) as x(v)
), best as (select * from u order by kills desc, worth desc limit 1)
select unit, kills, chr(36) || to_char(worth, 'FM999,999,990') as enemy_value,
  (round(born)::int / 60) || ':' || lpad(mod(round(born)::int, 60)::text, 2, '0') as built_at,
  case when died is null then 'Survived' else 'Fell at ' || (round(died)::int / 60) || ':' || lpad(mod(round(died)::int, 60)::text, 2, '0') end as fate,
  (round(coalesce(died, end_t) - born)::int / 60) || ':' || lpad(mod(round(coalesce(died, end_t) - born)::int, 60)::text, 2, '0') as in_action
from best;

-- Picked match kills by unit: The player's kills in the match by unit type. Reads public.matches.stats.
with pick as (
  select m.*, coalesce((m.stats->>'player')::int, 0) as pl
  from public.matches m
  where m.id = coalesce(cast({{match}} as uuid), (select id from public.matches where stats is not null order by started_at desc limit 1))
), u as (
  select x.v->>'type' as type, coalesce(p.stats->'names'->>(x.v->>'type'), initcap(x.v->>'type')) as unit,
    coalesce((x.v->>'kills')::int, 0) as kills, coalesce((x.v->>'worth')::int, 0) as worth,
    (x.v->>'born')::numeric as born, (x.v->>'died')::numeric as died, coalesce(p.duration_s, 0) as end_t
  from pick p cross join lateral jsonb_array_elements(coalesce(p.stats->'log'->'fallen', '[]'::jsonb) || coalesce(p.stats->'log'->'alive', '[]'::jsonb)) as x(v)
)
select unit, sum(kills)::int as kills from u group by unit having sum(kills) > 0 order by kills desc, unit;
