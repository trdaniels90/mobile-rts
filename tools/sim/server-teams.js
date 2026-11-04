const { chromium, devices } = require('playwright');
// Team games through the dedicated server (run in this process): four pages play a 2 v 2, check
// each commands its own side and sees its ally's, one player surrenders (the computer takes over),
// then that whole team is beaten. Then two pages play co-op against the computer.
// node tools/sim/server-teams.js <repo> [seconds]
(async () => {
  const [root, secs = '12'] = process.argv.slice(2);
  process.env.PORT = '18472';
  const { rooms } = require(root + '/server/server.js');
  const b = await chromium.launch();
  const open = async (tag) => {
    const p = await (await b.newContext({ ...devices['iPhone 13 landscape'] })).newPage();
    p.errs = []; p.on('pageerror', (e) => p.errs.push(tag + ': ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
    await p.route(/fonts|supabase\.co/, (r) => r.abort());
    await p.goto('file://' + root + '/index.html?server=ws%3A%2F%2Flocalhost%3A18472');
    await p.evaluate((t) => { Account.name = t; }, tag).catch(() => {});
    await p.tap('#onlineBtn');
    return p;
  };
  const out = {};
  const room = (code) => rooms.get(code);
  async function gather(n) {
    const P = [];
    for (let i = 0; i < n; i++) P.push(await open('P' + i));
    await P[0].tap('[data-on=host]');
    await P[0].waitForSelector('.on-code');
    const code = await P[0].textContent('.on-code');
    for (const p of P.slice(1)) { await p.fill('#onCode', code); await p.tap('#online form button[type=submit]'); await p.waitForFunction(() => Net.lobby && Net.lobby.connected, null, { timeout: 15000 }); }
    return { P, code };
  }
  // --- 2 v 2 ---
  {
    const { P, code } = await gather(1);
    await P[0].tap('[data-on=mode][data-v="2v2"]');
    await P[0].waitForFunction(() => Net.lobby.mode === '2v2');
    for (let i = 1; i < 4; i++) { const p = await open('P' + i); await p.fill('#onCode', code); await p.tap('#online form button[type=submit]'); await p.waitForFunction(() => Net.lobby && Net.lobby.connected && Net.lobby.slots, null, { timeout: 15000 }); P.push(p); }
    await P[0].waitForFunction(() => Net.lobby.ready, null, { timeout: 5000 }).catch(() => {});
    // P1 switches team (to team 1 is where it is; switching moves it to team 1's other... it is full), P3 flips its faction.
    await P[3].evaluate(() => Net.setFaction(Net.lobby.mine, 'allies'));
    await P[0].waitForTimeout(400);
    out.lobby2v2 = await P[0].evaluate(() => ({ mode: Net.lobby.mode, ready: Net.lobby.ready, slots: Net.lobby.slots.map((x) => `${x.name}/${x.ally}/${x.faction[0]}`) }));
    out.lobbyText = await P[2].evaluate(() => document.querySelector('.on-teams').innerText.replace(/\s+/g, ' '));
    await P[0].tap('[data-on=start]');
    for (const p of P) await p.waitForFunction(() => Net.role === 'guest' && G.entities.length > 0, null, { timeout: 15000 });
    const R = room(code), S = R.G;
    out.sides = await Promise.all(P.map((p) => p.evaluate(() => [G.me, G.teams[G.me].ally, G.teams[G.me].faction[0], G.teams.length, document.getElementById('netHud').textContent])));
    // Each orders its riflemen out and builds a power plant.
    for (const p of P) await p.evaluate(() => {
      startProduction(G.teams[G.me], 'power');
      const cy = G.entities.find((e) => e.team === G.me && e.type === 'cy');
      commandMove(unitsOf(G.me).filter((u) => u.type === 'rifle'), cy.x + 70, cy.y + 70);
    });
    await P[0].waitForTimeout(+secs * 1000);
    out.server = { t: Math.round(S.t), q: S.teams.map((t) => t.queues.structure && t.queues.structure.type), starts: S.teams.map((t) => [t.start.cx, t.start.cy]) };
    // What each page holds: its own side, its ally's (shared sight) and nothing of hidden enemies.
    out.views = [];
    for (const p of P) out.views.push(await p.evaluate(() => {
      const by = {};
      for (const e of G.entities) if (e.alive) by[e.team] = (by[e.team] || 0) + 1;
      return { me: G.me, by, sameFog: G.fog[G.me] === G.fog[G.teams.find((t) => t.id !== G.me && t.ally === G.teams[G.me].ally).id] };
    }));
    out.serverBy = {};
    for (const e of S.entities) if (e.alive) out.serverBy[e.team] = (out.serverBy[e.team] || 0) + 1;
    // P1 (alliance 1) surrenders: the computer takes its side, the battle goes on.
    const s1 = await P[1].evaluate(() => G.me);
    await P[1].evaluate(() => Net.surrender());
    await P[0].waitForTimeout(1500);
    out.afterQuit = { over: !!S.over, side1AI: S.teams[s1].isAI, p0eva: await P[0].evaluate(() => document.getElementById('eva') && document.getElementById('eva').textContent) };
    // Alliance 1's sides lose everything: alliance 0 wins.
    R.run(`for (const e of G.entities) if (e.alive && G.teams[e.team].ally === 1 && (PRODUCTION.includes(e.type) || e.def.deploys === 'cy')) damage(e, 1e7, 'HE', null);`);
    await P[0].waitForTimeout(4500);
    out.ends2v2 = await Promise.all(P.map((p) => p.textContent('#dbTitle').catch(() => null)));
    out.over = S.over && { winner: S.over.winner };
    for (const p of P) await p.context().close();
    out.errs = P.flatMap((p) => p.errs).slice(0, 6);
  }
  // --- co-op ---
  {
    const { P, code } = await gather(2);
    await P[0].tap('[data-on=mode][data-v="coop"]');
    await P[0].waitForFunction(() => Net.lobby.mode === 'coop' && Net.lobby.ready);
    await P[0].tap('[data-on=diff][data-v="easy"]');
    await P[0].waitForFunction(() => Net.lobby.diff === 'easy');
    out.lobbyCoop = await P[1].evaluate(() => Net.lobby.slots.map((x) => `${x.ai ? 'AI' : x.name}/${x.ally}`));
    await P[0].tap('[data-on=start]');
    for (const p of P) await p.waitForFunction(() => Net.role === 'guest' && G.entities.length > 0, null, { timeout: 15000 });
    const S = room(code).G;
    out.coopSides = await Promise.all(P.map((p) => p.evaluate(() => [G.me, G.teams[G.me].ally, document.getElementById('netHud').textContent])));
    await P[0].waitForTimeout(+secs * 1000);
    out.coopServer = { diff: S.diffKey, ai: S.teams.map((t) => t.isAI), aiBuilt: S.teams.map((t) => buildingsCount(S, t.id)) };
    function buildingsCount(S, id) { return S.entities.filter((e) => e.alive && e.kind === 'bld' && e.team === id).length; }
    room(code).run(`for (const e of G.entities) if (e.alive && G.teams[e.team].ally === 0 && (PRODUCTION.includes(e.type) || e.def.deploys === 'cy')) damage(e, 1e7, 'HE', null);`);
    await P[0].waitForTimeout(4500);
    out.endsCoop = await Promise.all(P.map((p) => p.textContent('#dbTitle').catch(() => null)));
    out.errs2 = P.flatMap((p) => p.errs).slice(0, 6);
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close();
  process.exit(0);
})();
