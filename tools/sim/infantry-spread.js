const { chromium, devices } = require('playwright');
// How bunched an infantry wave is while it marches: after 25 s on the attack, the most units inside one
// V2 blast (30 px) of any single unit. node infantry-spread.js <repo> <runs>
(async () => {
  const [root, runs] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await (await b.newContext({ ...devices['iPhone 13 landscape'] })).newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); await p.route(/fonts|supabase/, (r) => r.abort());
  await p.goto('file://' + root + '/index.html'); await p.tap('#startBtn'); await p.waitForTimeout(600);
  const r = await p.evaluate((runs) => {
    const res = [];
    for (let k = 0; k < runs; k++) {
      newWorld('allies', 'normal', 1 + k); G.teams[0].auto = false; G.teams[1].credits = 0;
      const me = G.teams[0], cy = buildingsOf(0).find((b) => b.type === 'cy');
      const inf = []; for (let i = 0; i < 24; i++) { const u = addUnit('rifle', me, cy.x + 60 + (i % 6) * 14, cy.y + 80 + Math.floor(i / 6) * 14); inf.push(u); }
      for (const u of inf) { setHunt(u); u.staged = false; }
      G.teams[0].fogAll = true; for (let i = 0; i < G.seen.length; i++) G.seen[i] = 1;
      for (let i = 0; i < 30 * 25; i++) { G.paused = false; update(1 / 30); G.paused = true; }
      let worst = 0, sum = 0;
      for (const a of inf) { if (!a.alive) continue; const n = inf.filter((o) => o.alive && Math.hypot(o.x - a.x, o.y - a.y) < 30).length; worst = Math.max(worst, n); sum += n; }
      res.push({ tight: G.laneRoll ? G.laneRoll.tight : null, inBlast: worst, avg: +(sum / inf.length).toFixed(1) });
    }
    return res;
  }, +runs || 8);
  console.log(JSON.stringify(r), errs.slice(0, 2));
  await b.close();
})();
