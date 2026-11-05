const { chromium, devices } = require('playwright');
// A beaten side in a team game (2 v 2 skirmish, online co-op through the server): the defeat card,
// Keep watching (whole map; the alliance's result) and Debrief (a loss now; online, with the battle log).
// node tools/sim/team-beaten.js <repo>
(async () => {
  const root = process.argv[2];
  process.env.PORT = '18473';
  const { rooms } = require(root + '/server/server.js');
  const b = await chromium.launch();
  const out = {};
  const page = async (tag, q = '') => {
    const p = await (await b.newContext({ ...devices['iPhone 13 landscape'] })).newPage();
    p.errs = []; p.on('pageerror', (e) => p.errs.push(tag + ': ' + e.message));
    await p.route(/fonts|supabase\.co/, (r) => r.abort());
    await p.goto('file://' + root + '/index.html' + q);
    await p.evaluate((t) => { Account.name = t; }, tag).catch(() => {});
    return p;
  };
  const kill = `(side) => { for (const e of G.entities) if (e.alive && e.team === side && (PRODUCTION.includes(e.type) || e.def.deploys === 'cy')) damage(e, 1e7, 'HE', null); }`;
  // --- skirmish 2 v 2 ---
  for (const choice of ['watch', 'debrief']) {
    const p = await page('S');
    await p.tap('#startBtn'); await p.tap('#maps [data-mode="2v2"]'); await p.tap('#maps [data-map-go]'); await p.waitForTimeout(800);
    await p.evaluate(`(${kill})(G.me)`);
    await p.waitForFunction(() => G.teams[G.me].out, null, { timeout: 10000 });
    await p.waitForTimeout(300);
    const r = { card: await p.evaluate(() => { const c = document.getElementById('beaten'); return c && !c.hidden; }) };
    await p.tap(`#beaten [data-b="${choice}"]`);
    await p.waitForTimeout(500);
    r.after = await p.evaluate(() => ({ over: G.over && { won: G.over.won, how: G.over.how }, watching: !!G.watching, seenAll: G.seen.every((v) => v), allyFogShared: G.fog[G.me] === G.fog[G.teams.find((t) => t.id !== G.me && t.ally === G.teams[G.me].ally).id], allyFogNotAll: !G.fog[G.me].every((v) => v) }));
    if (choice === 'watch') {
      await p.evaluate(`(${kill.replace('e.team === side', 'G.teams[e.team].ally !== G.teams[G.me].ally')})()`);
      await p.waitForTimeout(1500);
      r.end = await p.evaluate(() => ({ over: G.over && { won: G.over.won, how: G.over.how }, title: document.getElementById('dbTitle') && document.getElementById('dbTitle').textContent }));
    } else r.title = await p.textContent('#dbTitle').catch(() => null);
    r.errs = p.errs; out['skirmish_' + choice] = r;
    await p.context().close();
  }
  // --- online co-op ---
  for (const choice of ['watch', 'debrief']) {
    const P = [await page('P0', '?server=ws%3A%2F%2Flocalhost%3A18473'), await page('P1', '?server=ws%3A%2F%2Flocalhost%3A18473')];
    for (const p of P) await p.tap('#onlineBtn');
    await P[0].tap('[data-on=host]'); await P[0].waitForSelector('.on-code');
    const code = await P[0].textContent('.on-code');
    await P[1].fill('#onCode', code); await P[1].tap('#online form button[type=submit]'); await P[1].waitForFunction(() => Net.lobby && Net.lobby.connected, null, { timeout: 15000 });
    await P[0].tap('[data-on=mode][data-v="coop"]'); await P[0].waitForFunction(() => Net.lobby.mode === 'coop' && Net.lobby.ready);
    await P[0].tap('[data-on=start]');
    for (const p of P) await p.waitForFunction(() => Net.role === 'guest' && G.entities.length > 0, null, { timeout: 15000 });
    const R = rooms.get(code), S = R.G;
    await P[0].waitForTimeout(3000);
    const me = await P[0].evaluate(() => G.me);
    const foesSeen = () => P[0].evaluate(() => G.entities.filter((e) => e.alive && G.teams[e.team].ally !== G.teams[G.me].ally).length);
    const r = { foesBefore: await foesSeen() };
    R.run(`(${kill})(${me})`);
    await P[0].waitForFunction(() => G.teams[G.me].out, null, { timeout: 10000 });
    await P[0].waitForTimeout(300);
    r.card = await P[0].evaluate(() => { const c = document.getElementById('beaten'); return c && !c.hidden; });
    await P[0].tap(`#beaten [data-b="${choice}"]`);
    await P[0].waitForTimeout(2000);
    r.server = { over: !!S.over, watch: !!R.seats.find((s) => s.side === me).peer.watch };
    if (choice === 'watch') {
      r.foesAfter = await foesSeen();
      R.run(`for (const e of G.entities) if (e.alive && G.teams[e.team].ally === 1 && (PRODUCTION.includes(e.type) || e.def.deploys === 'cy')) damage(e, 1e7, 'HE', null);`);
      await P[0].waitForTimeout(3000);
    }
    r.p0 = await P[0].evaluate(() => ({ over: G.over && { won: G.over.won, how: G.over.how }, samples: G.log.samples.length, title: document.getElementById('dbTitle') && document.getElementById('dbTitle').textContent }));
    r.p1over = await P[1].evaluate(() => !!G.over);
    r.serverSamples = S.log.samples.length;
    r.errs = P.flatMap((p) => p.errs);
    out['online_' + choice] = r;
    for (const p of P) await p.context().close();
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close(); process.exit(0);
})();
