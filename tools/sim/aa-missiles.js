const { chromium, devices } = require('playwright');
// Anti-air missiles against a MiG that flies away from the shooter: how far the missiles chase, and whether
// they hit. Also one aimed at a MiG that lands. node aa-missiles.js <repo>
(async () => {
  const [root] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await (await b.newContext({ ...devices['iPhone 13 landscape'] })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route(/fonts|supabase/, (r) => r.abort());
  await p.goto('file://' + root + '/index.html'); await p.tap('#startBtn'); await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    newWorld('allies', 'normal', 1);
    const out = {};
    const step = (s) => { for (let i = 0; i < Math.round(s * 30); i++) { G.paused = false; update(1 / 30); G.paused = true; } };
    const kill = () => { for (const e of G.entities) if (e.kind === 'unit' && e.team === 1 && e.alive && e.cls === 'air') e.alive = false; };
    // 1) A MiG flying straight away at full speed from a Rocket Soldier that has just fired.
    const run = (name, land) => {
      const me = G.teams[0], foe = G.teams[1];
      const sx = 400, sy = 400;
      const sol = addUnit('rocket', me, sx, sy); sol.hold = true;
      const mig = addUnit('mig', foe, sx + 150, sy); mig.as = 'fly'; mig.alt = 30; mig.order = { type: 'move', x: 0, y: 0 }; mig.scripted = true;
      const w = sol.def.weapon2; const hp0 = mig.hp;
      fireWeapon(sol, w, mig);
      let maxD = 0, hit = false, mode = 'flew';
      for (let i = 0; i < 30 * 12; i++) {
        mig.x += 245 / 30; mig.face = 0;   // straight away, east
        if (land && i === 20) { mig.as = 'landed'; mig.alt = 0; }
        G.paused = false; updateProjectiles(1 / 30); G.paused = true;
        for (const q of G.projectiles) if (q.from === sol) maxD = Math.max(maxD, Math.hypot(q.x - sx, q.y - sy));
        if (mig.hp < hp0) { hit = true; break; }
        if (!G.projectiles.some((q) => q.from === sol)) break;
      }
      out[name] = { hit, maxChaseFromShooter: Math.round(maxD), range: w.range };
      mig.alive = false; sol.alive = false; G.projectiles = [];
    };
    run('flyingAway', false);
    run('landsMidFlight', true);
    return out;
  });
  console.log(JSON.stringify(r), errs.slice(0, 2));
  await b.close();
})();
