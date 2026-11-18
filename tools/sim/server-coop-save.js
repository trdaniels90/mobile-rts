// Saved online co-op battles: three players in a 3 v AI, one picks Save and leave (everyone gets 'saved', the room
// closes); a new room led by another of them lists the save and loads it; each player takes their old place, the
// missing one's goes to the computer; the battle goes on from where it was; it autosaves; everyone leaving saves it
// too; a battle that ends deletes its save. Saves are kept in memory (no SERVER_TOKEN). Needs `npm install` in server/.
// node tools/sim/server-coop-save.js <repo>
const root = process.argv[2];
Object.assign(process.env, { PORT: '18475', SPEED: '4', SAVE_EVERY: '20', WAIT_LIMIT: '2' });
const WebSocket = require(root + '/server/node_modules/ws');
const { rooms, server, Saves } = require(root + '/server/server.js');
const VERSION = require(root + '/server/headless.js').load().get('VERSION');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function player(name, pid) {
  const ws = new WebSocket('ws://127.0.0.1:18475'), p = { ws, name, pid, msgs: [], last: {} };
  ws.on('message', (d) => { const m = JSON.parse(d); p.msgs.push(m.k); p.last[m.k] = m; });
  p.open = new Promise((r) => ws.on('open', r));
  const ping = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ k: 'ping', t: 0 })); else if (ws.readyState > 1) clearInterval(ping); }, 1000);
  p.send = (m) => ws.send(JSON.stringify(Object.assign({ name, v: VERSION, gid: 'g' + name, pids: [pid] }, m)));
  return p;
}
const roomOf = (code) => rooms.get(code);
(async () => {
  const fails = [];
  const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) fails.push(what); };
  // A 3 v AI: P0 leads, P1 and P2 join.
  const a = player('P0', 'pid-a'); await a.open; a.send({ k: 'create', faction: 'allies', map: 'snowbound' }); await wait(200);
  let code = a.last.room.code;
  a.send({ k: 'setup', mode: 'coop3', diff: 'easy' }); await wait(200);
  const b = player('P1', 'pid-b'), c = player('P2', 'pid-c');
  await b.open; b.send({ k: 'join', code }); await c.open; c.send({ k: 'join', code }); await wait(300);
  const slotOf = (p) => p.last.lobby.mine;
  const was = { a: slotOf(a), b: slotOf(b), c: slotOf(c) };
  a.send({ k: 'go' }); await wait(500);
  check(a.last.start && a.last.start.save, 'a co-op battle has a save id');
  let R = roomOf(code);
  await wait(8000);   // ~30 s of battle
  const t1 = R.G.t, n1 = R.G.entities.filter((e) => e.alive).length;
  R.run('scorch(G.tctx, 500, 500, 12, 7); crater(G.tctx, 520, 500, 9, 8); 0');   // marks of battle to keep
  const k1 = R.G.keepMarks.length;
  b.send({ k: 'savequit' }); await wait(1500);
  check([a, b, c].every((p) => p.last.saved && p.last.saved.by === 'P1'), 'Save and leave: everyone hears who saved ');
  check(!rooms.has(code), 'and the room closes');
  const id = a.last.start.save, rec = Saves.mem.get(id);
  check(rec && rec.state && Math.abs(rec.game_t - t1) < 3 && rec.players.length === 6, `saved at ${rec && rec.game_t} s (${rec && Math.round(rec.state.length / 1024)} KB)`);
  check(rec && rec.players.filter((x) => !x.ai).map((x) => x.pids[0]).sort().join() === 'pid-a,pid-b,pid-c', 'with the three players');
  [a, b, c].forEach((p) => p.ws.close());

  // A new room, led by P1 this time; P0 comes, P2 does not.
  const b2 = player('P1', 'pid-b'); await b2.open; b2.send({ k: 'create', faction: 'soviets', map: 'bridge' }); await wait(200);
  code = b2.last.room.code;
  const a2 = player('P0', 'pid-a'); await a2.open; a2.send({ k: 'join', code }); await wait(300);
  const x = player('X', 'pid-x'); await x.open;   // a stranger's room: no saves
  x.send({ k: 'create', faction: 'allies' }); await wait(200); x.send({ k: 'saves' }); await wait(300);
  check(x.last.saves && x.last.saves.list.length === 0, 'a player who was not in it does not see the save');
  x.ws.close();
  b2.send({ k: 'saves' }); await wait(300);
  check(b2.last.saves && b2.last.saves.list.some((s) => s.id === id && !s.state), 'the leader lists it (no state sent)');
  a2.send({ k: 'load', id }); await wait(300);
  check(!b2.last.lobby.resume, 'only the leader can load');
  b2.send({ k: 'load', id }); await wait(500);
  let L = b2.last.lobby;
  check(L.resume && L.resume.id === id && L.mode === 'coop3' && L.map === 'snowbound', 'loaded: the saved battle and map');
  check(b2.last.lobby.mine === was.b && a2.last.lobby.mine === was.a, 'each player in their own place again');
  check(!L.ready && L.slots[was.c].had === 'P2' && !L.slots[was.c].name, "P2's place is open, marked as P2's");
  b2.send({ k: 'setup', mode: 'coop', diff: 'hard' }); await wait(200);
  check(b2.last.lobby.mode === 'coop3' && b2.last.lobby.diff === 'easy', 'the battle and difficulty cannot be changed');
  b2.send({ k: 'mate', slot: was.c }); await wait(200);
  check(b2.last.lobby.ready && b2.last.lobby.slots[was.c].ai, 'the leader gives it to the computer: ready');
  b2.send({ k: 'go' }); await wait(800);
  R = roomOf(code);
  const st = b2.last.start;
  check(st && st.save === id && st.resume >= t1 - 1 && st.seed === R.G.seed, `continued at ${st && st.resume} s, same save and seed`);
  check(k1 >= 2 && b2.last.marks && b2.last.marks.list.length === k1 && a2.last.marks && b2.last.marks.list.some((m) => m[0] === 'crater'), `the marks of battle come back (${k1} kept, ${b2.last.marks && b2.last.marks.list.length} sent)`);
  check(R.G.teams[was.c].isAI && !R.G.teams[was.a].isAI && !R.G.teams[was.b].isAI, 'the computer plays P2, the others are players');
  const n2 = R.G.entities.filter((e) => e.alive).length;
  check(Math.abs(n2 - n1) <= n1 * 0.1 + 5, `the battle as it was (${n1} -> ${n2} alive)`);
  await wait(4000);
  check(a2.msgs.filter((k) => k === 's').length > 10 && R.G.t > st.resume + 5, `it goes on (t ${Math.round(R.G.t)})`);
  await wait(3000);   // SAVE_EVERY 20 s / SPEED 4: an autosave by now
  const rec2 = Saves.mem.get(id);
  check(rec2 && rec2.game_t > st.resume && !rec2.players[was.c].ai, `autosaved at ${rec2 && rec2.game_t} s; P2's side is still P2's`);
  // Everyone leaves: after the wait the room closes and the battle is saved as it was.
  [a2, b2].forEach((p) => p.ws.terminate());
  await wait(4000);
  check(!rooms.has(code) && Saves.mem.get(id).game_t >= rec2.game_t, 'everyone gone: closed, still saved');

  // Once more, then the battle ends: the save goes.
  const a3 = player('P0', 'pid-a'); await a3.open; a3.send({ k: 'create', faction: 'allies' }); await wait(200);
  code = a3.last.room.code;
  a3.send({ k: 'load', id }); await wait(500);
  L = a3.last.lobby;
  [was.b, was.c].forEach((i) => a3.send({ k: 'mate', slot: i })); await wait(300);
  check(a3.last.lobby.ready, 'one player alone, both friends handed to the computer');
  a3.send({ k: 'go' }); await wait(800);
  R = roomOf(code);
  R.run('endBattle(0, "win")'); await wait(500);
  check(!Saves.mem.has(id), 'the battle ended: its save is deleted');
  a3.ws.close();
  server.close();
  for (const r of rooms.values()) clearInterval(r.timer);
  console.log(fails.length ? `${fails.length} FAILED` : 'all passed');
  process.exit(fails.length ? 1 : 0);
})();
