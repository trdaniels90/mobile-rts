-- Queries behind the owner's stats page (run with the owner's own Supabase access, never the
-- game's public key). Days and weeks are counted in the time zone named in each query.

-- Summary: one row.
select
  (select count(distinct device_id) from public.matches
     where ended_at is null and last_seen > now() - interval '2 minutes')                         as playing_now,
  (select count(*) from public.matches
     where started_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')           as matches_today,
  (select count(*) from public.matches
     where started_at >= date_trunc('week', now() at time zone 'UTC') at time zone 'UTC')          as matches_this_week,
  (select round(avg(duration_s)) from public.matches where result in ('win', 'loss'))             as avg_length_s,
  (select count(*) from public.matches)                                                           as matches_all_time,
  (select count(distinct device_id) from public.matches)                                          as devices_all_time;

-- Results by side and difficulty against the computer.
select side, difficulty,
  count(*) filter (where result = 'win')                     as wins,
  count(*) filter (where result = 'loss')                    as losses,
  count(*) filter (where result = 'quit')                    as quits,
  count(*) filter (where result is null)                     as unfinished,
  round(avg(duration_s) filter (where result in ('win', 'loss'))) as avg_length_s
from public.matches
where mode = 'skirmish'
group by side, difficulty
order by side, case difficulty when 'easy' then 0 when 'normal' then 1 when 'hard' then 2 end;

-- Matches started per day, last 30 days.
select (started_at at time zone 'UTC')::date as day, count(*) as matches, count(distinct device_id) as players
from public.matches
where started_at > now() - interval '30 days'
group by 1 order by 1;
