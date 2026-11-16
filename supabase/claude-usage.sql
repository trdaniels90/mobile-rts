-- Claude token tracker: one row per Claude reply (API message), sent by the Stop hook
-- (tools/claude-usage.js). The table is not readable or writable through the API;
-- the hook writes with log_claude_usage and the dashboard reads with claude_usage_report.

create table if not exists claude_usage (
  msg_id      text primary key,
  session_id  text not null,
  ts          timestamptz not null,
  model       text,
  input       int not null default 0,
  output      int not null default 0,
  cache_read  int not null default 0,
  cache_write int not null default 0,
  sidechain   boolean not null default false,
  branch      text
);
create index if not exists claude_usage_ts on claude_usage (ts);
create index if not exists claude_usage_session on claude_usage (session_id);
alter table claude_usage enable row level security;
revoke all on claude_usage from anon, authenticated;

-- rows: [{ id, s, t, m, i, o, cr, cw, sc, b }]; replays of the same message overwrite.
create or replace function log_claude_usage(rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 2000 then
    raise exception 'bad rows';
  end if;
  insert into claude_usage (msg_id, session_id, ts, model, input, output, cache_read, cache_write, sidechain, branch)
  select left(r->>'id', 80), left(r->>'s', 80), (r->>'t')::timestamptz, left(r->>'m', 60),
         greatest(0, least((r->>'i')::int, 10000000)), greatest(0, least((r->>'o')::int, 10000000)),
         greatest(0, least((r->>'cr')::int, 10000000)), greatest(0, least((r->>'cw')::int, 10000000)),
         coalesce((r->>'sc')::boolean, false), left(r->>'b', 120)
  from jsonb_array_elements(rows) r
  where r->>'id' like 'msg_%' and r->>'s' is not null
  on conflict (msg_id) do update set
    input = excluded.input, output = excluded.output,
    cache_read = excluded.cache_read, cache_write = excluded.cache_write;
  get diagnostics n = row_count;
  return n;
end $$;

-- Totals only: per day (UTC) and the most recent sessions.
create or replace function claude_usage_report(days int default 60)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'days', coalesce((select jsonb_agg(d order by d.day) from (
      select ts::date as day, count(distinct session_id) as sessions, count(*) as replies,
             sum(input) as input, sum(output) as output, sum(cache_read) as cache_read, sum(cache_write) as cache_write
      from claude_usage where ts > now() - make_interval(days => least(greatest(days, 1), 366))
      group by 1) d), '[]'),
    'sessions', coalesce((select jsonb_agg(s order by s.last desc) from (
      select session_id, min(ts) as first, max(ts) as last, count(*) as replies,
             sum(input) as input, sum(output) as output, sum(cache_read) as cache_read, sum(cache_write) as cache_write,
             max(branch) as branch, max(model) as model
      from claude_usage group by session_id order by max(ts) desc limit 40) s), '[]'),
    'models', coalesce((select jsonb_agg(m) from (
      select model, count(*) as replies, sum(input) as input, sum(output) as output,
             sum(cache_read) as cache_read, sum(cache_write) as cache_write
      from claude_usage group by model) m), '[]')
  );
$$;

revoke all on function log_claude_usage(jsonb) from public;
revoke all on function claude_usage_report(int) from public;
grant execute on function log_claude_usage(jsonb) to anon, authenticated;
grant execute on function claude_usage_report(int) to anon, authenticated;
