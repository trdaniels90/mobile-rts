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
