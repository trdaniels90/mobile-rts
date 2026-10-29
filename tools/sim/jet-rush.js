const { chromium, devices } = require('playwright');
// Three Strike Jets sent at the Soviet Construction Yard around 3:00 on Normal. node jetrush.js <repo> <seeds>
(async () => {
  const [root, seeds] = process.argv.slice(2);
  const b = await chromium.launch();
  for (const seed of seeds.split(',')) {
    const p = await (await b.newContext({ ...devices['iPhone 13 landscape'] })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.route(/fonts|supabase/, (r) => r.abort());
    await p.goto('file://' + root + '/index.html'); await p.tap('#startBtn'); await p.waitForTimeout(600);
    const r = await p.evaluate((seed) => {
      newWorld('allies', 'normal', +seed);
      const me = G.teams[0]; me.auto = false; me.credits = 1e5; G.paused = true;
      const step = (s) => { for (let i = 0; i < s * 30; i++) { G.paused = false; update(1 / 30); G.paused = true; } };
      let samAt = null; for (let i = 0; i < 180; i++) { step(1); if (samAt === null && buildingsOf(1).some((b) => b.def.antiAir && b.buildT >= 1)) samAt = Math.round(G.t); }
      const cy = buildingsOf(0).find((b) => b.type === 'cy');
      for (let r = 3; r < 16; r++) { let done = false; for (let a = 0; a < 6.28; a += 0.3) { const cx = Math.round(cy.cx + Math.cos(a) * r), cyy = Math.round(cy.cy + Math.sin(a) * r); if (canPlace(me, 'airfield', cx, cyy, 1)) { addBuilding('airfield', me, cx, cyy); done = true; break; } } if (done) break; }
      const ecy = buildingsOf(1).find((b) => b.type === 'cy');
      const dmg = {}; const realDamage = damage;
      window.damage = function (t, amount, wh, attacker, from) { const h = t.hp; const res = realDamage(t, amount, wh, attacker, from); if (t === ecy) { const k = (attacker ? attacker.type : 'none') + '/' + wh; dmg[k] = (dmg[k] || 0) + Math.max(0, h - Math.max(0, t.hp)); } return res; };
      const enemyAA = buildingsOf(1).filter((b) => b.def.antiAir).length, enemyRockets = 0;
      const jets = [spawnUnit(me, 'jet'), spawnUnit(me, 'jet'), spawnUnit(me, 'jet')];
      commandAttack(jets, ecy);
      const t0 = G.t; let sorties = 0; const was = new Map();
      while (ecy.alive && G.t - t0 < 240) { step(1); for (const j of jets) { if (j.alive && j.as === 'takeoff' && was.get(j) !== 'takeoff') sorties++; was.set(j, j.alive ? j.as : 'dead'); } }
      return { samAt, seed, killed: !ecy.alive, secs: Math.round(G.t - t0), cyHp: ecy.def.hp, sorties, jetsLost: jets.filter((j) => !j.alive).length, enemyAA, enemySams: buildingsOf(1).filter((b) => b.type === 'sam').length,
        dmg: Object.fromEntries(Object.entries(dmg).map(([k, v]) => [k, Math.round(v)])), repairing: ecy.repairing };
    }, seed);
    console.log(JSON.stringify(r), errs.slice(0, 2));
  }
  await b.close();
})();
