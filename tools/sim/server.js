const { chromium, devices } = require('playwright');
// The dedicated server end to end: the server runs in this process (server/server.js), two phones
// (pages) host and join through it, play, one drops and comes back, then the battle ends. Also
// checks that with no server reachable, hosting falls back to phone to phone.
// node tools/sim/server.js <repo> [seconds]
(async () => {
  const [root, secs = '20'] = process.argv.slice(2);
  process.env.PORT = '18471'; process.env.WAIT_LIMIT = '60';
  const { rooms } = require(root + '/server/server.js');
  const R = () => [...rooms.values()][0];
  const b = await chromium.launch();
  const open = async (tag, server = 'ws://localhost:18471') => {
    const p = await (await b.newContext({ ...devices['iPhone 13 landscape'] })).newPage();
    p.errs = []; p.on('pageerror', (e) => p.errs.push(tag + ': ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
    await p.route(/fonts|supabase\.co/, (r) => r.abort());
    await p.goto('file://' + root + '/index.html?server=' + encodeURIComponent(server));
    await p.tap('#onlineBtn');
    return p;
  };
  const out = {};
  const A = await open('A'), B = await open('B');
  await A.tap('[data-on=host]');
  await A.waitForSelector('.on-code');
  const code = await A.textContent('.on-code');
  out.via = await A.evaluate(() => Net.lobby.via);
  await B.fill('#onCode', code); await B.tap('#online form button[type=submit]');
  await A.waitForSelector('[data-on=start]', { timeout: 15000 });
  await A.tap('[data-on=faction][data-slot="0"]'); await A.waitForTimeout(300);
  out.lobbyB = await B.evaluate(() => document.querySelector('.on-teams').innerText.replace(/\s+/g, ' '));
  await A.tap('[data-on=start]');
  await A.waitForFunction(() => Net.role === 'guest' && G.entities.length > 0, null, { timeout: 10000 }).catch(async () => { console.log('A stuck', await A.evaluate(() => [Net.role, G && G.entities.length, JSON.stringify(Net.lobby)]), A.errs, B.errs); process.exit(1); });
  await B.waitForFunction(() => Net.role === 'guest' && G.entities.length > 0, null, { timeout: 10000 });
  const hashTerr = () => { let h = 0; for (let i = 0; i < G.terr.length; i++) h = (h * 31 + G.terr[i]) | 0; return h; };
  out.sides = [await A.evaluate(() => [G.me, G.teams[G.me].faction, G.remote]), await B.evaluate(() => [G.me, G.teams[G.me].faction, G.remote])];
  out.sameTerr = (await A.evaluate(hashTerr)) === (await B.evaluate(hashTerr));
  // Both order: each builds a power plant and moves its riflemen.
  for (const P of [A, B]) await P.evaluate(() => {
    startProduction(G.teams[G.me], 'power');
    const cy = G.entities.find((e) => e.team === G.me && e.type === 'cy');
    commandMove(unitsOf(G.me).filter((u) => u.type === 'rifle'), cy.x + 90, cy.y + 90);
  });
  await A.waitForTimeout(+secs * 1000);
  const S = R().G;
  out.server = { t: Math.round(S.t), q: S.teams.map((t) => t.queues.structure && t.queues.structure.type + (t.queues.structure.ready ? ' ready' : '')),
    rifleOrders: [0, 1].map((s) => S.entities.filter((e) => e.alive && e.team === s && e.type === 'rifle').map((u) => u.order.type).join()) };
  const posOf = (s) => Object.fromEntries(S.entities.filter((e) => e.alive && e.team === s).map((e) => [e.id, [e.x, e.y]]));
  for (const [P, tag] of [[A, 'A'], [B, 'B']]) {
    const g = await P.evaluate(() => Object.fromEntries(G.entities.filter((e) => e.alive && e.team === G.me).map((e) => [e.id, [e.x, e.y]])));
    const side = await P.evaluate(() => G.me), h = posOf(side);
    let off = 0, missing = 0;
    for (const id in h) { if (!g[id]) { missing++; continue; } off = Math.max(off, Math.hypot(g[id][0] - h[id][0], g[id][1] - h[id][1])); }
    out[tag] = { t: await P.evaluate(() => Math.round(G.t)), mine: Object.keys(g).length, missing, extra: Object.keys(g).filter((id) => !h[id]).length, maxOff: Math.round(off),
      q: await P.evaluate(() => { const q = G.teams[G.me].queues.structure; return q && q.type + (q.ready ? ' ready' : ''); }) };
  }
  // Place both power plants.
  out.placed = [];
  for (const P of [A, B]) out.placed.push(await P.evaluate(() => {
    const t = G.teams[G.me], cy = G.entities.find((e) => e.team === G.me && e.type === 'cy');
    for (let r = 3; r < 12; r++) for (let a = 0; a < 16; a++) if (placeStructure(t, 'power', Math.round(cy.cx + Math.cos(a / 16 * 6.28) * r), Math.round(cy.cy + Math.sin(a / 16 * 6.28) * r))) return true;
    return false;
  }));
  await A.waitForTimeout(1500);
  out.powerOnServer = [0, 1].map((s) => S.entities.filter((e) => e.alive && e.team === s && e.type === 'power').length);
  // B's connection drops: A waits, the server holds; B comes back with a full snapshot.
  await B.evaluate(() => Net.test.drop());
  await A.waitForTimeout(2500);
  out.drop = { aWaiting: await A.evaluate(() => Net.waiting), serverHold: !!S.hold };
  await B.waitForFunction(() => !Net.waiting && Net.lobby.connected, null, { timeout: 15000 }).catch(() => {});
  await A.waitForTimeout(2000);
  out.back = { bWaiting: await B.evaluate(() => Net.waiting), aWaiting: await A.evaluate(() => Net.waiting), serverHold: !!S.hold, bResyncs: await B.evaluate(() => Net.test.resyncs),
    bMine: await B.evaluate(() => G.entities.filter((e) => e.alive && e.team === G.me).length), serverB: S.entities.filter((e) => e.alive && e.team === 1).length };
  // The battle ends: side 1 loses every production building.
  R().run(`for (const e of G.entities) if (e.alive && e.team === 1 && (PRODUCTION.includes(e.type) || e.def.deploys === 'cy')) damage(e, 1e7, 'HE', null);`);
  await A.waitForTimeout(4500);
  out.ends = [await A.textContent('#dbTitle').catch(() => null), await B.textContent('#dbTitle').catch(() => null)];
  out.roomPhase = R() && R().phase;
  // No server: hosting falls back to phone to phone.
  const C = await open('C', 'ws://localhost:1');
  await C.tap('[data-on=host]');
  await C.waitForSelector('.on-code', { timeout: 15000 }).catch(() => {});
  out.fallback = await C.evaluate(() => Net.lobby && Net.lobby.via);
  out.errs = [...A.errs, ...B.errs, ...C.errs].slice(0, 8);
  console.log(JSON.stringify(out, null, 1));
  await b.close();
  process.exit(0);
})();
