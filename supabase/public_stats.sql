-- Read-only stats for stats.html, shared by a private link. The link carries a key (in the address after #k=);
-- only its SHA-256 is kept here, in stats_secret, which nobody can read through the API. Rotate the key by
-- updating that row. Set it with:  insert into public.stats_secret values (1, encode(extensions.digest('<key>','sha256'),'hex'))
--   on conflict (id) do update set key_sha256 = excluded.key_sha256;
create table if not exists public.stats_secret (id int primary key default 1 check (id = 1), key_sha256 text not null);
alter table public.stats_secret enable row level security;

create or replace function public.public_stats(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  tz constant text := 'America/Chicago';
  wk timestamptz := date_trunc('week', now() at time zone tz) at time zone tz;
  dy timestamptz := date_trunc('day', now() at time zone tz) at time zone tz;
  r jsonb;
begin
  if not exists (select 1 from public.stats_secret where key_sha256 = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')) then
    raise exception 'bad key' using errcode = '28000';
  end if;
  select jsonb_build_object(
    'headline', (select jsonb_build_object(
      'playing_now', (select count(distinct device_id) from public.matches where ended_at is null and last_seen > now() - interval '2 minutes'),
      'matches_today', (select count(*) from public.matches where started_at >= dy),
      'matches_this_week', (select count(*) from public.matches where started_at >= wk),
      'players_this_week', (select count(distinct device_id) from public.matches where started_at >= wk),
      'avg_length_s', (select round(avg(duration_s))::int from public.matches where result in ('win', 'loss')))),
    'results', (select coalesce(jsonb_agg(to_jsonb(x) order by x.side, x.ord), '[]') from (
      select initcap(g.side) as side, initcap(g.difficulty) as difficulty, g.ord,
        count(m.id) filter (where m.result = 'win') as wins, count(m.id) filter (where m.result = 'loss') as losses,
        count(m.id) filter (where m.result = 'quit') as quits,
        round(avg(m.duration_s) filter (where m.result in ('win', 'loss')))::int as avg_s
      from (values ('allies'), ('soviets')) as s(side) cross join (values ('easy', 1), ('normal', 2), ('hard', 3)) as d(difficulty, ord)
        cross join lateral (select s.side, d.difficulty, d.ord) g
      left join public.matches m on m.mode = 'skirmish' and m.side = g.side and m.difficulty = g.difficulty
      group by g.side, g.difficulty, g.ord) x),
    'perday', (select coalesce(jsonb_agg(jsonb_build_object('day', to_char(d.day, 'YYYY-MM-DD'), 'matches', c.n) order by d.day), '[]')
      from generate_series((now() at time zone tz)::date - 29, (now() at time zone tz)::date, interval '1 day') d(day)
      cross join lateral (select count(*)::int as n from public.matches m where (m.started_at at time zone tz)::date = d.day::date) c),
    'latest', (select coalesce(jsonb_agg(to_jsonb(x) order by x.ts desc), '[]') from (
      select left(id::text, 8) as match, started_at as ts, to_char(started_at at time zone tz, 'YYYY-MM-DD HH24:MI') as started,
        initcap(side) as side, initcap(coalesce(difficulty, '')) as difficulty,
        case when result is not null then initcap(result) when last_seen > now() - interval '2 minutes' then 'Playing' else 'Abandoned' end as outcome,
        duration_s, coalesce(player_name, '') as name, coalesce(version, '') as version
      from public.matches order by started_at desc limit 25) x)
  ) into r;
  return r;
end $$;
revoke all on function public.public_stats(text) from public;
grant execute on function public.public_stats(text) to anon, authenticated;

-- Debrief of one match for stats.html: p_id is the first 8 characters of its id (null: the latest match with a debrief).
create or replace function public.public_match(p_key text, p_id text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m public.matches; pl int; r jsonb;
begin
  if not exists (select 1 from public.stats_secret where key_sha256 = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')) then
    raise exception 'bad key' using errcode = '28000';
  end if;
  select * into m from public.matches
    where stats is not null and (p_id is null or p_id !~ '^[0-9a-f]{8}$' or id::text like p_id || '%')
    order by (p_id is not null and p_id ~ '^[0-9a-f]{8}$' and id::text like p_id || '%') desc, started_at desc limit 1;
  if m.id is null then return null; end if;
  pl := coalesce((m.stats->>'player')::int, 0);
  select jsonb_build_object(
    'match', left(m.id::text, 8), 'side', initcap(m.side), 'difficulty', initcap(coalesce(m.difficulty, '')),
    'enemy_side', initcap(coalesce(m.stats->'teams'->(1 - pl)->>'faction', case m.side when 'allies' then 'soviets' else 'allies' end)),
    'result', m.result, 'duration_s', m.duration_s, 'name', coalesce(m.player_name, ''), 'version', coalesce(m.version, ''),
    'started', to_char(m.started_at at time zone 'America/Chicago', 'YYYY-MM-DD HH24:MI'),
    'score', (select coalesce(jsonb_agg(jsonb_build_object('measure', x.measure, 'you', coalesce((m.stats->'teams'->pl->'stats'->>x.k)::bigint, 0),
        'enemy', coalesce((m.stats->'teams'->(1 - pl)->'stats'->>x.k)::bigint, 0), 'low', x.low, 'money', x.money) order by x.ord), '[]')
      from (values (1, 'Units built', 'units', false, false), (2, 'Units lost', 'lost', true, false), (3, 'Enemies destroyed', 'killed', false, false),
        (4, 'Buildings destroyed', 'bldKilled', false, false), (5, 'Buildings lost', 'bldLost', true, false), (6, 'Ore harvested', 'harvested', false, true)) as x(ord, measure, k, low, money)),
    'samples', (select coalesce(jsonb_agg(jsonb_build_object('t', (v->>'t')::int,
        'army_you', (v->'army'->>pl)::int, 'army_enemy', (v->'army'->>(1 - pl))::int,
        'inc_you', (v->'income'->>pl)::int, 'inc_enemy', (v->'income'->>(1 - pl))::int,
        'blds_you', (v->'blds'->>pl)::int, 'blds_enemy', (v->'blds'->>(1 - pl))::int) order by n), '[]')
      from jsonb_array_elements(coalesce(m.stats->'log'->'samples', '[]'::jsonb)) with ordinality as x(v, n)),
    'moments', (select coalesce(jsonb_agg(jsonb_build_object('t', (v->>'t')::int,
        'who', case when (v->>'team')::int = pl then 'You' else 'Enemy' end,
        'moment', case when (v->>'team')::int = pl then 'Your ' else 'Enemy ' end ||
          case v->>'kind' when 'cy lost' then 'Construction Yard destroyed' when 'outpost lost' then 'Outpost lost' else v->>'kind' end) order by n), '[]')
      from jsonb_array_elements(coalesce(m.stats->'log'->'events', '[]'::jsonb)) with ordinality as x(v, n)),
    'kills', (select coalesce(jsonb_agg(jsonb_build_object('unit', unit, 'kills', k) order by k desc, unit), '[]') from (
      select coalesce(m.stats->'names'->>(v->>'type'), initcap(v->>'type')) as unit, sum(coalesce((v->>'kills')::int, 0))::int as k
      from jsonb_array_elements(coalesce(m.stats->'log'->'fallen', '[]'::jsonb) || coalesce(m.stats->'log'->'alive', '[]'::jsonb)) as x(v)
      group by 1 having sum(coalesce((v->>'kills')::int, 0)) > 0) q),
    'mvp', (select to_jsonb(q) from (
      select coalesce(m.stats->'names'->>(v->>'type'), initcap(v->>'type')) as unit, coalesce((v->>'kills')::int, 0) as kills,
        coalesce((v->>'worth')::int, 0) as worth, (v->>'born')::numeric as born, (v->>'died')::numeric as died
      from jsonb_array_elements(coalesce(m.stats->'log'->'fallen', '[]'::jsonb) || coalesce(m.stats->'log'->'alive', '[]'::jsonb)) as x(v)
      order by 2 desc, 3 desc limit 1) q)
  ) into r;
  return r;
end $$;
revoke all on function public.public_match(text, text) from public;
grant execute on function public.public_match(text, text) to anon, authenticated;
