// Raw WebSocket players (no browser) against the game server: 3 v AI is refused on a map not made for it, then
// with ANY_BATTLE=1 a 3 v AI and a 3 v 3 start with six sides, own sides, shared sight and three colours.
// Needs `npm install` in server/. Run twice: node tools/sim/server-3v3.js <repo>; ANY_BATTLE=1 node tools/sim/server-3v3.js <repo>
const root = process.argv[2];
process.env.PORT = '18473'; process.env.SPEED = '4';
const WebSocket = require(root + '/server/node_modules/ws');
const { rooms, server } = require(root + '/server/server.js');
const VERSION = require(root + '/server/headless.js').load().get('VERSION');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function player(name) {
  const ws = new WebSocket('ws://127.0.0.1:18473'), p = { ws, name, msgs: [], last: {} };
  ws.on('message', (d) => { const m = JSON.parse(d); p.msgs.push(m.k); p.last[m.k] = m; });
  p.open = new Promise((r) => ws.on('open', r));
  p.send = (m) => ws.send(JSON.stringify(m));
  return p;
}
(async () => {
  const fails = [];
  const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) fails.push(what); };
  for (const [mode, n, any] of [['coop3', 3, false], ['coop3', 3, true], ['3v3', 6, true]]) {
    if (any !== !!process.env.ANY_BATTLE) continue;
    const ps = [];
    const lead = player('P0'); ps.push(lead); await lead.open;
    lead.send({ k: 'create', name: 'P0', v: VERSION, gid: 'g0' + mode + any, faction: 'allies', map: 'river' });
    await wait(200);
    const code = lead.last.room.code;
    lead.send({ k: 'setup', mode });
    await wait(300);
    for (let i = 1; i < n; i++) { const p = player('P' + i); ps.push(p); await p.open; p.send({ k: 'join', code, name: 'P' + i, v: VERSION, gid: 'g' + i + mode + any }); }
    await wait(300);
    const L = lead.last.lobby;
    if (!any) { check(L.mode === '1v1', `${mode} refused on river (teamSize 2) without ANY_BATTLE: mode ${L.mode}`); ps.forEach((p) => p.ws.close()); continue; }
    check(L.mode === mode && L.slots.length === 6, `${mode}: lobby has ${L.slots.length} slots, mode ${L.mode}`);
    check(L.ready, `${mode}: ready with ${n} players`);
    lead.send({ k: 'go' });
    await wait(4000);
    const st = ps.map((p) => p.last.start);
    check(st.every(Boolean), `${mode}: every player got start`);
    if (st[0]) {
      check(st[0].sides.length === 6 && st[0].sides.filter((s) => s.ai).length === (mode === 'coop3' ? 3 : 0), `${mode}: sides ${st[0].sides.map((s) => (s.ai ? 'AI' : s.name) + '/' + s.ally).join(' ')}`);
      check(new Set(st.map((s) => s.side)).size === n, `${mode}: every player has their own side`);
      check(ps.every((p) => p.msgs.filter((k) => k === 's').length > 5), `${mode}: snapshots flowing (${ps.map((p) => p.msgs.filter((k) => k === 's').length).join(',')})`);
      const R = [...rooms.values()].find((r) => r.code === code);
      const G = R.G;
      check(G.teams.length === 6 && new Set(G.teams.map((t) => t.start.cx + ',' + t.start.cy)).size === 6, `${mode}: six bases, all on different start positions`);
      check(G.teams.every((t) => G.fog[t.id] === G.fog[t.ally]), `${mode}: allies share sight`);
      check(G.teams.map((t) => t.variant | 0).join() === '0,0,1,1,2,2', `${mode}: colour variants ${G.teams.map((t) => t.variant | 0)}`);
    }
    ps.forEach((p) => p.ws.close());
    await wait(300);
  }
  console.log(fails.length ? fails.length + ' failed' : 'all passed');
  server.close(); process.exit(fails.length ? 1 : 0);
})();
