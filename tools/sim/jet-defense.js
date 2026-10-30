const { chromium, devices } = require('playwright');
// Soviet MiGs defend a base against a raid with anti-air in it. Reports MiG losses, raiders killed and the
// longest any MiG stayed on one target without firing. node jet-defense.js <repo> <seeds>
(async () => {
  const [root, seeds] = process.argv.slice(2);
  const b = await chromium.launch();
  for (const seed of seeds.split(',')) {
    const p = await (await b.newContext({ ...devices['iPhone 13 landscape'] })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.route(/fonts|supabase/, (r) => r.abort());
    await p.goto('file://' + root + '/index.html'); await p.tap('#startBtn'); await p.waitForTimeout(600);
    const r = await p.evaluate((seed) => {
      newWorld('soviets', 'normal', +seed);
      const me = G.teams[0], foe = G.teams[1]; me.auto = true; me.credits = 1e5; foe.credits = 0; G.paused = true;
      const step = (s) => { for (let i = 0; i < s * 30; i++) { G.paused = false; update(1 / 30); G.paused = true; } };
      step(5);
      const cy = buildingsOf(0).find((b) => b.type === 'cy');
      for (let r = 3; r < 16; r++) { let done = false; for (let a = 0; a < 6.28; a += 0.3) { const cx = Math.round(cy.cx + Math.cos(a) * r), cyy = Math.round(cy.cy + Math.sin(a) * r); if (canPlace(me, 'airfield', cx, cyy, 1)) { addBuilding('airfield', me, cx, cyy); done = true; break; } } if (done) break; }
      const migs = []; for (let i = 0; i < 4; i++) { const m = spawnUnit(me, 'mig'); if (m) migs.push(m); }
      step(25);   // let them take off and settle on guard
      const raiders = []; const types = ['mtank', 'mtank', 'ranger', 'ranger', 'rocket', 'rocket', 'rifle', 'rifle', 'rifle'];
      types.forEach((t, i) => { const a = i * 0.7; const u = addUnit(t, foe, cy.x + 300 + Math.cos(a) * 30, cy.y + Math.sin(a) * 30 + 40); if (u) { raiders.push(u); u.order = { type: 'hunt' }; } });
      const last = new Map(); let worst = 0; const t0 = G.t;
      while (G.t - t0 < 120) {
        step(0.5);
        for (const m of migs) {
          if (!m.alive) continue;
          const key = (m.target ? m.target.id : -1) + ':' + m.ammo + ':' + m.aam + ':' + m.bombs;
          const l = last.get(m);
          if (!l || l.key !== key) last.set(m, { key, t: G.t });
          else if (m.target && m.as === 'fly') worst = Math.max(worst, G.t - l.t);
        }
      }
      return { seed, migs: migs.length, migsLost: migs.filter((m) => !m.alive).length, raiders: raiders.length, raidersKilled: raiders.filter((u) => !u.alive).length, worstNoFireSecs: Math.round(worst) };
    }, seed);
    console.log(JSON.stringify(r), errs.slice(0, 2));
  }
  await b.close();
})();
