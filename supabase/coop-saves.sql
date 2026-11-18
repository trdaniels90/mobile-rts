-- Saved online co-op battles (2 v AI, 3 v AI): the game server (server/server.js) keeps the battle here,
-- gzipped and base64 (about 200 KB), every few minutes and on "Save and leave", and deletes it when the battle
-- ends. The phones never read it: only the server, through these functions and its token (server.sql).
-- pids: the players' ids (a signed-in account's id, else the phone's id), so a lobby lists the saves its players were in.
create table if not exists public.coop_saves (
  id uuid primary key, saved_at timestamptz not null default now(), created_at timestamptz not null default now(),
  version text, mode text, map text, difficulty text, game_t real, players jsonb, pids text[], match text, state text not null);
alter table public.coop_saves enable row level security;
create index if not exists coop_saves_pids on public.coop_saves using gin (pids);

create or replace function public.coop_save_put(p_token text, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.server_token_ok(p_token) then raise exception 'bad token'; end if;
  insert into public.coop_saves as c (id, version, mode, map, difficulty, game_t, players, pids, match, state)
  values ((p->>'id')::uuid, p->>'version', p->>'mode', p->>'map', p->>'difficulty', (p->>'game_t')::real, p->'players',
          array(select jsonb_array_elements_text(p->'pids')), p->>'match', p->>'state')
  on conflict (id) do update set saved_at = now(), version = excluded.version, game_t = excluded.game_t,
    players = excluded.players, pids = array(select distinct x from unnest(c.pids || excluded.pids) x), state = excluded.state;
  -- Old saves go after 60 days.
  delete from public.coop_saves where saved_at < now() - interval '60 days';
end $$;

-- The newest saves any of these players took part in (no state).
create or replace function public.coop_save_list(p_token text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.server_token_ok(p_token) then raise exception 'bad token'; end if;
  return coalesce((select jsonb_agg(x order by x->>'saved_at' desc) from (
    select jsonb_build_object('id', id, 'saved_at', saved_at, 'version', version, 'mode', mode, 'map', map,
      'difficulty', difficulty, 'game_t', game_t, 'players', players) x
    from public.coop_saves where pids && array(select jsonb_array_elements_text(p->'pids'))
    order by saved_at desc limit 8) s), '[]'::jsonb);
end $$;

create or replace function public.coop_save_get(p_token text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.server_token_ok(p_token) then raise exception 'bad token'; end if;
  return (select jsonb_build_object('id', id, 'version', version, 'mode', mode, 'map', map, 'difficulty', difficulty,
    'game_t', game_t, 'players', players, 'pids', pids, 'match', match, 'state', state) from public.coop_saves where id = (p->>'id')::uuid);
end $$;

create or replace function public.coop_save_drop(p_token text, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.server_token_ok(p_token) then raise exception 'bad token'; end if;
  delete from public.coop_saves where id = (p->>'id')::uuid;
end $$;

revoke all on function public.coop_save_put(text, jsonb) from public;
revoke all on function public.coop_save_list(text, jsonb) from public;
revoke all on function public.coop_save_get(text, jsonb) from public;
revoke all on function public.coop_save_drop(text, jsonb) from public;
grant execute on function public.coop_save_put(text, jsonb) to anon, authenticated;
grant execute on function public.coop_save_list(text, jsonb) to anon, authenticated;
grant execute on function public.coop_save_get(text, jsonb) to anon, authenticated;
grant execute on function public.coop_save_drop(text, jsonb) to anon, authenticated;
