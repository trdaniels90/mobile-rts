const { chromium } = require('playwright');
const fs = require('fs');
// Before/after frames for light pools, ground dressing and per-map mood (src/look.js LOOK.pools, .dress, .mood), one page:
//   node tools/look/record-pools.js <repo> <out dir> <map> <pools|dress|mood> [seconds] [night|rain|dusk]
// Bases built by the AI for 5 minutes, fog lifted, the camera drifting over our base's edge (pools: the lamp posts near our
// Construction Yard; dress: a worn path near it). before = the part off, after = on (dress: the ground repainted for each).
// night/dusk: the clock moved on to night or dusk (day/night maps); rain: rain at full strength. Frames: <out>/a, <out>/b.
const [root, out, map, part, secs = '6', opt = ''] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route(/fonts|supabase/, (r) => r.abort());
  await p.goto('file://' + root + '/index.html'); await p.waitForTimeout(800);
  await p.click('#startBtn'); await p.click(`#maps [data-map="${map}"]`); await p.click('#maps [data-map-go]'); await p.waitForTimeout(1000);
  await p.evaluate(([part, opt]) => {
    const ps = window.__ps;
    LOOK.smoke = false;
    for (const t of G.teams) { t.isAI = true; t.auto = false; }
    for (let i = 0; i < 5 * 60 * 30; i++) ps.update(1 / 30);
    for (const t of G.teams) t.isAI = false;
    G.fog[G.me].fill(1); G.shroudDirty = true;
    if (opt === 'rain') { G.weather = { kind: 'rain', chance: 1 }; window.weatherLevel = () => 1; }
    else if (opt !== 'keepweather') G.weather = null;
    if (opt === 'night' || opt === 'dusk') { let best = 0, bv = -1; for (let t = G.t; t < G.t + 4000; t += 2) { const d = dayNight(t), v = opt === 'night' ? d.night : d.warm * (1 - d.night); if (v > bv) { bv = v; best = t; } } G.t = best; }
    const cy = G.entities.find((e) => e.alive && e.team === G.me && e.kind === 'bld' && e.type === 'cy') || G.entities.find((e) => e.alive && e.team === G.me && e.kind === 'bld');
    let x = cy.x + 120, y = cy.y + 100;
    if (part === 'pools') {
      const ls = poolLampsFor().lamps.filter((l) => !G.bld[l.c]).sort((a, b) => Math.hypot(a.x - cy.x, a.y - cy.y) - Math.hypot(b.x - cy.x, b.y - cy.y));
      if (ls[0]) { x = (ls[0].x * 2 + cy.x) / 3; y = (ls[0].y * 2 + cy.y) / 3; }
    } else if (part === 'dress') {
      const D = dressFor(); let best = null;
      for (const l of D.by) for (const it of l) if (it.t === 'path') { const d = Math.hypot(it.x - cy.x, it.y - cy.y); if (d > 320 && (!best || d < best.d)) best = { d, x: it.x, y: it.y }; }
      if (best) { x = best.x; y = best.y; }
    }
    window.__aim = (x, y, z) => { const [X, Y] = toView(x, y); ps.cam.z = z; ps.cam.x = X - (innerWidth - 120) / 2 / z; ps.cam.y = Y - innerHeight / 2 / z; };
    window.__mid = [x, y];
    __aim(x, y, 1.4);
    G.paused = true;
  }, [part, opt]);
  await p.evaluate(() => new Promise((r) => setTimeout(r, 3500)));
  const N = +secs * 15, raf = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const Z = part === 'dress' ? 2 : 1.4, pan = (f) => p.evaluate(([f, Z]) => __aim(__mid[0] - 80 + f * 1.1, __mid[1] - 10 + f * 0.4, Z), [f, Z]);
  for (const d of ['a', 'b']) fs.mkdirSync(`${out}/${d}`, { recursive: true });
  if (part === 'dress') {   // two passes: the ground repainted with the dressing off, then on
    for (const [dir, on] of [['a', false], ['b', true]]) {
      await p.evaluate((on) => { LOOK.dress = on; G.ground.forget(); }, on);
      await pan(0); await p.evaluate(() => new Promise((r) => setTimeout(r, 3000)));
      for (let f = 0; f < N; f++) { await p.evaluate(() => { const ps = window.__ps; G.paused = false; ps.update(1 / 30); G.paused = true; }); await pan(f); await raf(); await p.screenshot({ path: `${out}/${dir}/${String(f).padStart(4, '0')}.png` }); }
    }
  } else {
    for (let f = 0; f < N; f++) {
      await p.evaluate(() => { const ps = window.__ps; G.paused = false; ps.update(1 / 30); ps.update(1 / 30); G.paused = true; });
      await pan(f);
      for (const [dir, on] of [['a', false], ['b', true]]) {
        await p.evaluate(([k, on]) => { LOOK[k] = on; }, [part, on]); await raf();
        await p.screenshot({ path: `${out}/${dir}/${String(f).padStart(4, '0')}.png` });
      }
    }
  }
  console.log(map, part, opt, 'errors', errs.slice(0, 3));
  await b.close();
})();
