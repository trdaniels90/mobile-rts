const { chromium, devices } = require('playwright');
// Save and continue a skirmish: play a while (the computer plays both sides), open the menu (which
// saves), reload the page as if the app had been closed, Continue, and check the battle is the same
// and carries on. Then finish it: the save is gone.
// node tools/sim/save-load.js <repo> [minutes]
(async () => {
  const [root, minutes = '10'] = process.argv.slice(2);
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13 landscape'] });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message + ' @ ' + (e.stack || '').split('\n')[1]));
  await p.route(/fonts|supabase/, (r) => r.abort());
  await p.goto('file://' + root + '/index.html'); await p.tap('#startBtn'); await p.tap('#maps [data-map-go]'); await p.waitForTimeout(800);
  const summary = () => p.evaluate(() => {
    let decal = 0; const d = G.dctx.getImageData(0, 0, G.decals.width, G.decals.height).data; for (let i = 3; i < d.length; i += 64) if (d[i]) decal++;
    const refsOk = G.entities.every((e) => (!e.target || !e.target.id || G.byId.get(e.target.id) === e.target || !e.target.alive)) && G.entities.every((e) => G.byId.get(e.id) === e);
    return { t: Math.round(G.t * 10) / 10, ents: G.entities.length, nextId: G.nextId, credits: G.teams.map((t) => Math.round(t.credits)), stats: G.teams.map((t) => t.stats.killed + '/' + t.stats.lost + '/' + Math.round(t.stats.harvested)),
      pos: G.entities.slice(0, 40).map((e) => Math.round(e.x) + ',' + Math.round(e.y)).join(' '), groups: G.groups.length, fogSeen: G.fog[G.me].reduce((a, x) => a + x, 0), ore: G.ore.reduce((a, x) => a + x, 0), decal, refsOk, auto: G.teams[G.me].auto };
  });
  await p.evaluate((m) => { G.teams[0].isAI = true; G.teams[0].auto = true; for (let i = 0; i < m * 60 * 30 && !G.over; i++) { G.paused = false; update(1 / 30); } G.teams[0].isAI = false; }, +minutes);
  await p.evaluate(() => document.getElementById('menuBtn').click());   // the menu pauses the game and saves it
  const before = await summary();
  await p.waitForFunction(() => !document.getElementById('continueBtn').hidden || true);
  await p.waitForTimeout(3000);
  const rec = await p.evaluate(() => new Promise((res) => { const r = indexedDB.open('red-horizon', 1); r.onsuccess = () => { const g = r.result.transaction('save').objectStore('save').get('skirmish'); g.onsuccess = () => res(g.result ? { kb: Math.round(g.result.state.length / 1024), ms: g.result.ms } : null); }; }));
  // The app is closed and opened again.
  await p.reload(); await p.waitForTimeout(1500);
  const label = await p.evaluate(() => { const c = document.getElementById('continueBtn'); return c.hidden ? null : c.textContent; });
  await p.evaluate(async () => { await SaveGame.load(); G.paused = true; });   // exactly as saved, before any frame runs
  const after = await summary();
  await p.tap('#continueBtn'); await p.waitForFunction(() => document.getElementById('menu').hidden, null, { timeout: 15000 });
  const same = {}; for (const k in before) if (k !== 'decal') same[k] = JSON.stringify(before[k]) === JSON.stringify(after[k]);
  // It carries on: two more minutes, then the player wins.
  const more = await p.evaluate(() => { G.teams[0].isAI = true; for (let i = 0; i < 2 * 60 * 30 && !G.over; i++) update(1 / 30); G.teams[0].isAI = false; return { t: Math.round(G.t), ents: G.entities.length, over: !!G.over }; });
  await p.evaluate(() => { const c = G.entities.find((e) => e.team === 1 && e.type === 'cy'); if (c) damage(c, 1e6, 'HE', null); for (let i = 0; i < 40; i++) update(1 / 30); });
  await p.waitForTimeout(3000);
  const title = await p.evaluate(() => document.querySelector('#dbTitle').textContent);
  await p.reload(); await p.waitForTimeout(1500);
  const afterEnd = await p.evaluate(() => document.getElementById('continueBtn').hidden);
  console.log(JSON.stringify({ save: rec, label, same, decals: [before.decal, after.decal], refsOk: after.refsOk, more, title, continueGoneAfterWin: afterEnd, errs: errs.slice(0, 5) }, null, 1));
  await b.close();
})();
