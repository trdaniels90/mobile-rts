const { chromium, devices } = require('playwright');
// MiG performance in AI vs AI games. node migtest.js <repo> <difficulty> <minutes> <seeds,...>
(async () => {
  const [root, diff, minutes, seeds] = process.argv.slice(2);
  const b = await chromium.launch();
  const out = [];
  for (const seed of seeds.split(',')) {
    const ctx = await b.newContext({ ...devices['iPhone 13 landscape'] });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.route(/fonts/, (r) => r.abort());
    await p.goto('file://' + root + '/index.html'); await p.tap('#startBtn'); await p.tap('#maps [data-map-go]'); await p.waitForTimeout(600);
    const r = await p.evaluate(({ diff, minutes, seed }) => {
      newWorld('allies', diff, +seed);
      G.teams[0].isAI = true; G.teams[0].auto = true; G.paused = true;
      const s = { built: 0, died: 0, kills: 0, killWorth: 0, diedTo: {}, sortiesWithKill: 0, nanSight: 0, heli: { inf: 0, veh: 0, bld: 0, air: 0 }, migDeaths: [], allied: {} };
      const seen = new Set();
      const realKill = kill;
      window.kill = function (e, attacker, wh, from) {
        if (e.alive && e.type === 'mig') { s.migDeaths.push({ ammo: e.ammo, bombs: e.bombs, aam: e.aam, air: Math.round(G.t - (e.sortie || 0)), home: !!(e.retreat) }); s.died++; const k = attacker ? attacker.type : 'none'; s.diedTo[k] = (s.diedTo[k] || 0) + 1; }
        if (e.alive && attacker && attacker.type === 'mig' && e.team !== attacker.team) { s.kills++; s.killWorth += e.def.cost || 0; }
        if (e.alive && attacker && attacker.type === 'heli' && e.team !== attacker.team) s.heli[e.kind === 'bld' ? 'bld' : e.cls === 'inf' ? 'inf' : e.cls === 'air' ? 'air' : 'veh']++;
        return realKill(e, attacker, wh, from);
      };
      for (let i = 0; i < minutes * 60 * 30 && !G.over; i++) {
        G.paused = false; update(1 / 30); G.paused = true;
        if (i % 30 === 0) for (const e of G.entities) { if (!e.alive) continue;
          if (e.type === 'mig' && e.as === 'takeoff' && !e.inSortie) { e.inSortie = true; e.sortie = G.t; } if (e.type === 'mig' && e.as === 'landed') e.inSortie = false;
          if (e.team === 0 && e.kind === 'unit' && !seen.has(e.id)) { seen.add(e.id); s.allied[e.type] = (s.allied[e.type] || 0) + 1; }
          if (e.type === 'mig' && !seen.has(e.id)) { seen.add(e.id); s.built++; if (!(e.def.sight * CELL > 0)) s.nanSight++; } }
      }
      s.t = Math.round(G.t); s.over = G.over || null; return s;
    }, { diff, minutes, seed });
    r.seed = seed; r.errs = errs.slice(0, 2); out.push(r); await ctx.close();
  }
  console.log(JSON.stringify(out));
  await b.close();
})();
