-- The dedicated game server's records for the owner's stats page: its live status (one row) and one
-- row per battle it runs. Written only through the two functions below, which need the server's token
-- (a Fly secret, SERVER_TOKEN). Only its SHA-256 is kept, in server_secret, which nobody can read through the API.
create table if not exists public.server_secret (id int primary key default 1 check (id = 1), token_sha256 text not null);
create or replace function public.server_token_ok(p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.server_secret where token_sha256 = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex'));
$$;
revoke all on function public.server_token_ok(text) from public, anon, authenticated;
alter table public.server_secret enable row level security;

create table if not exists public.server_status (
  id int primary key default 1 check (id = 1),
  version text, started_at timestamptz, last_seen timestamptz,
  rooms int, battles int, players int, mem_mb int, step_ms real, step_max_ms real, cpu_pct real, cpu text);
alter table public.server_status enable row level security;

create table if not exists public.server_battles (
  id uuid primary key, code text, version text, mode text, map text, difficulty text,
  players jsonb, started_at timestamptz, ended_at timestamptz, duration_s int,
  winner int, how text, errors jsonb, perf jsonb);
alter table public.server_battles enable row level security;
create index if not exists server_battles_started on public.server_battles (started_at desc);

create or replace function public.server_beat(p_token text, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.server_token_ok(p_token) then raise exception 'bad token'; end if;
  insert into public.server_status as s (id, version, started_at, last_seen, rooms, battles, players, mem_mb, step_ms, step_max_ms, cpu_pct, cpu)
  values (1, p->>'version', (p->>'started_at')::timestamptz, now(), (p->>'rooms')::int, (p->>'battles')::int,
          (p->>'players')::int, (p->>'mem_mb')::int, (p->>'step_ms')::real, (p->>'step_max_ms')::real, (p->>'cpu_pct')::real, p->>'cpu')
  on conflict (id) do update set version = excluded.version, started_at = excluded.started_at, last_seen = now(),
    rooms = excluded.rooms, battles = excluded.battles, players = excluded.players, mem_mb = excluded.mem_mb,
    step_ms = excluded.step_ms, step_max_ms = excluded.step_max_ms, cpu_pct = excluded.cpu_pct, cpu = excluded.cpu;
end $$;

create or replace function public.server_battle(p_token text, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.server_token_ok(p_token) then raise exception 'bad token'; end if;
  insert into public.server_battles as b (id, code, version, mode, map, difficulty, players, started_at, ended_at, duration_s, winner, how, errors, perf)
  values ((p->>'id')::uuid, p->>'code', p->>'version', p->>'mode', p->>'map', p->>'difficulty', nullif(p->'players', 'null'::jsonb),
          (p->>'started_at')::timestamptz, (p->>'ended_at')::timestamptz, (p->>'duration_s')::int,
          (p->>'winner')::int, p->>'how', nullif(p->'errors', 'null'::jsonb), nullif(p->'perf', 'null'::jsonb))
  on conflict (id) do update set ended_at = excluded.ended_at, duration_s = excluded.duration_s, winner = excluded.winner,
    how = excluded.how, errors = excluded.errors, perf = excluded.perf, players = excluded.players;
end $$;

revoke all on function public.server_beat(text, jsonb) from public;
revoke all on function public.server_battle(text, jsonb) from public;
grant execute on function public.server_beat(text, jsonb) to anon, authenticated;
grant execute on function public.server_battle(text, jsonb) to anon, authenticated;
-- Then, once: insert into public.server_secret (token_sha256) values ('<sha256 hex of the SERVER_TOKEN Fly secret>');
