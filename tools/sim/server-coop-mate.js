// Co-op with a computer teammate: two players in a 3 v AI, the leader gives the third place to the computer
// ('mate'), the battle starts with the players' team of two players and one computer side that fights on its own.
// Also: only the leader may do it, never on the leader's own or a taken place, and a friend can still take the
// place once it is opened again. Needs `npm install` in server/. node tools/sim/server-coop-mate.js <repo>
const root = process.argv[2];
process.env.PORT = '18474'; process.env.SPEED = '4'; process.env.ANY_BATTLE = '1';
const WebSocket = require(root + '/server/node_modules/ws');
const { rooms, server } = require(root + '/server/server.js');
const VERSION = require(root + '/server/headless.js').load().get('VERSION');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function player(name) {
  const ws = new WebSocket('ws://127.0.0.1:18474'), p = { ws, name, msgs: [], last: {} };
  ws.on('message', (d) => { const m = JSON.parse(d); p.msgs.push(m.k); p.last[m.k] = m; });
  p.open = new Promise((r) => ws.on('open', r));
  p.send = (m) => ws.send(JSON.stringify(m));
  return p;
}
(async () => {
  const fails = [];
  const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) fails.push(what); };
  const lead = player('P0'); await lead.open;
  lead.send({ k: 'create', name: 'P0', v: VERSION, gid: 'm0', faction: 'allies', map: 'snowbound' });
  await wait(200);
  const code = lead.last.room.code;
  lead.send({ k: 'setup', mode: 'coop3' });
  await wait(200);
  const p1 = player('P1'); await p1.open; p1.send({ k: 'join', code, name: 'P1', v: VERSION, gid: 'm1' });
  await wait(300);
  let L = lead.last.lobby;
  check(L.mode === 'coop3' && !L.ready, `3 v AI with two players is not ready (${L.slots.filter((x) => !x.ai && x.name).length} players)`);
  const open = L.slots.findIndex((x, i) => x.ally === 0 && !x.ai && !x.name);
  p1.send({ k: 'mate', slot: open }); await wait(200);
  check(!lead.last.lobby.slots[open].ai, 'a player who is not the leader cannot add a computer');
  lead.send({ k: 'mate', slot: 0 }); lead.send({ k: 'mate', slot: p1.last.lobby.mine }); await wait(200);
  check(lead.last.lobby.slots.filter((x) => x.ally === 0 && x.ai).length === 0, 'taken places cannot go to the computer');
  lead.send({ k: 'mate', slot: open }); await wait(200);
  L = lead.last.lobby;
  check(L.slots[open].ai && L.slots[open].mate && L.ready, 'the leader adds a computer teammate: ready');
  lead.send({ k: 'mate', slot: open }); await wait(200);
  check(!lead.last.lobby.slots[open].ai && !lead.last.lobby.ready, 'and opens the place again');
  const p2 = player('P2'); await p2.open; p2.send({ k: 'join', code, name: 'P2', v: VERSION, gid: 'm2' }); await wait(300);
  check(p2.last.lobby && p2.last.lobby.mine === open, 'a friend can take the reopened place');
  p2.send({ k: 'bye' }); p2.ws.close(); await wait(300);
  lead.send({ k: 'mate', slot: open }); await wait(200);
  check(lead.last.lobby.ready, 'computer teammate again after the friend left');
  lead.send({ k: 'go' });
  await wait(1500);
  const st = lead.last.start;
  check(st && st.sides.length === 6, 'battle started with six sides');
  if (st) {
    check(st.sides.filter((s) => s.ally === 0 && s.ai).length === 1 && st.sides.filter((s) => s.ally === 1 && s.ai).length === 3 && st.sides[open].mate,
      `sides: ${st.sides.map((s) => (s.ai ? (s.mate ? 'mate' : 'AI') : s.name) + '/' + s.ally).join(' ')}`);
    const R = [...rooms.values()].find((r) => r.code === code);
    await wait(25000);   // ~100 s of battle at SPEED 4
    const t = R.G.teams[open];
    const n = R.G.entities.filter((e) => e.team === open && !e.dead).length;
    check(t.isAI && n > 3, `the computer teammate builds (${n} entities at ${Math.round(R.G.t)} s)`);
    check(R.G.fog[open] === R.G.fog[0], 'and shares sight with the players');
  }
  [lead, p1].forEach((p) => p.ws.close());
  console.log(fails.length ? fails.length + ' failed' : 'all passed');
  server.close(); process.exit(fails.length ? 1 : 0);
})();
