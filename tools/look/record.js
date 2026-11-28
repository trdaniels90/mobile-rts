const { chromium } = require('playwright');
const fs = require('fs');
// Before/after frames for the "Tiberian Sun look" prototype (src/look.js; docs/NOTES.md "Tiberian Sun look").
//   node tools/look/record.js <repo> <out dir> <scene> [seconds] [still]
// scene 'battle': a tank fight beside a base on A Bridge Too Far; before = the game, after = LOOK.light. Each frame drawn twice.
// scene 'cliffs': River Crossing, tanks fighting round a rock ridge; before = light only, after = light + tall cliffs. Each frame drawn twice.
// scene 'lamps':  River Crossing, tanks fighting beside a base; before = light, cliffs, concrete; after = + lamps on structures and the
//                 richer ground (patches, tank tracks). Each frame drawn twice.
// scene 'smoke':  as 'lamps', with some of the base's structures badly damaged; after = + bigger smoke and fires.
// scene 'base':   a pan over a built base, battle paused; before = light only, after = light + concrete (two passes, the ground repainted).
// scene 'hills':  River Crossing, tanks fighting over the hilliest ground near our base; before = the ground flat (as stage 1), after
//                 = the raised ground (LOOK.hills). The camera drifts slowly. Each frame drawn twice.
// scene 'ra2':   as 'battle' with the whole look on; before = the Tiberian Sun colours, after = the Red Alert 2 test (LOOK_STYLE).
// Frames go to <out>/a and <out>/b (PNG, 15 a second); make the MP4 with tools/look/video.sh.
const [root, out, scene = 'cliffs', secs = '12', still] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route(/fonts|supabase/, (r) => r.abort());
  await p.goto('file://' + root + '/index.html'); await p.waitForTimeout(800);
  await p.click('#startBtn');
  const map = scene === 'battle' || scene === 'ra2' ? 'bridge' : 'river';
  await p.click(`#maps [data-map="${map}"]`); await p.click('#maps [data-map-go]'); await p.waitForTimeout(1000);
  const info = await p.evaluate((scene) => {
    const ps = window.__ps;
    LOOK.light = scene !== 'battle';
    if (scene === 'hills') LOOK.light = LOOK.cliffs = LOOK.concrete = LOOK.lamps = LOOK.ground = LOOK.water = true; LOOK.cliffs = LOOK.concrete = scene === 'lamps' || scene === 'smoke'; LOOK.lamps = LOOK.ground = scene === 'smoke'; LOOK.smoke = false;
    if (scene === 'ra2') for (const k in LOOK) LOOK[k] = true;
    for (const t of G.teams) { t.isAI = true; t.auto = false; }
    for (let i = 0; i < 6 * 60 * 30; i++) ps.update(1 / 30);   // bases built
    G.teams[G.me].isAI = false;
    const cy = G.entities.find((e) => e.alive && e.team === G.me && e.kind === 'bld' && e.type === 'cy') || G.entities.find((e) => e.alive && e.team === G.me && e.kind === 'bld');
    const foe = G.teams.find((t) => t.id !== G.me);
    let mx = cy.x + 150, my = cy.y + 120;
    if (scene === 'cliffs') {   // the middle of the biggest group of cliff cells near our base
      let best = null;
      for (let c = 0; c < NCELLS; c++) if (G.cliff[c]) {
        const x = (cellX(c) + 0.5) * CELL, y = (cellY(c) + 0.5) * CELL; let n = 0;
        for (let d = 0; d < NCELLS; d += 1) if (G.cliff[d] && Math.abs(cellX(d) - cellX(c)) < 6 && Math.abs(cellY(d) - cellY(c)) < 6) n++;
        const s = n * 40 - Math.hypot(x - cy.x, y - cy.y) / CELL;
        if (!best || s > best.s) best = { s, x, y };
      }
      mx = best.x; my = best.y;
    }
    if (scene === 'hills') {   // the most up-and-down ground within 30 cells of our base
      let best = null;
      for (let y = 4; y < MAP - 4; y += 2) for (let x = 4; x < MAP - 4; x += 2) {
        const d = Math.hypot(x * CELL - cy.x, y * CELL - cy.y) / CELL;
        if (d < 16 || d > 40) continue;
        let lo = 99, hi = 0;
        for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) { const h = G.hgt[(y + j) * MAP + x + i]; lo = Math.min(lo, h); hi = Math.max(hi, h); }
        const s = hi - lo - d * 0.2;
        if (!best || s > best.s) best = { s, x: (x + 0.5) * CELL, y: (y + 0.5) * CELL };
      }
      mx = best.x; my = best.y;
    }
    if (scene !== 'base') {
      const army = ['mtank', 'rifle', 'htank', 'rocket', 'ltank', 'grenadier', 'mtank', 'arty'];
      const free = (x, y) => { const c = cellOfPos(x, y); return c !== false && G.terr[c] <= 1 && !(G.cliff && G.cliff[c]); };
      let n = 0;
      for (let i = 0; i < 400 && n < 20; i++) { const x = mx - 200 + (i % 20) * 13, y = my - 130 + Math.floor(i / 20) * 13; if (free(x, y)) { addUnit(army[n % army.length], G.teams[G.me], x, y); n++; } }
      n = 0;
      for (let i = 0; i < 400 && n < 20; i++) { const x = mx + 200 - (i % 20) * 13, y = my + 130 - Math.floor(i / 20) * 13; if (free(x, y)) { addUnit(army[(n + 3) % army.length], foe, x, y); n++; } }
      ps.commandHunt(G.entities.filter((e) => e.kind === 'unit' && e.alive && Math.hypot(e.x - mx, e.y - my) < 400));
    }
    G.fog[G.me].fill(1); G.shroudDirty = true; G.weather = null;
    if (scene === 'smoke') {   // badly damaged structures near the view: burning and smoking
      const near = G.entities.filter((e) => e.alive && e.kind === 'bld' && e.team === G.me && !e.def.defense && Math.hypot(e.x - cy.x - 90, e.y - cy.y - 70) < 260);
      near.slice(0, 4).forEach((e, i) => { e.hp = e.maxHp * (i % 2 ? 0.45 : 0.2); });
    }
    window.__aim = (x, y, z) => { const [X, Y] = toView(x, y); ps.cam.z = z; ps.cam.x = X - (innerWidth - 120) / 2 / z; ps.cam.y = Y - innerHeight / 2 / z; };
    window.__base = { x: cy.x, y: cy.y };
    window.__mid = { x: mx, y: my };
    if (scene === 'base') __aim(cy.x + 60, cy.y + 40, 1.3); else if (scene === 'lamps' || scene === 'smoke') __aim(cy.x + 90, cy.y + 70, 1.15); else __aim(mx, my, 1.15);
    for (let i = 0; i < 40; i++) ps.update(1 / 30);
    G.paused = true;
    return { map: G.mapId, t: Math.round(G.t), cliffs: G.cliff ? G.cliff.reduce((a, v) => a + v, 0) : 0 };
  }, scene);
  console.log(JSON.stringify(info));
  const raf = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const shot = (dir, f) => p.screenshot({ path: `${out}/${dir}/${String(f).padStart(4, '0')}.png` });
  // Ground tiles painted, and (cliffs) every crag's picture made, so none pops in during the recording.
  await p.evaluate((scene) => { if (scene === 'cliffs' || scene === 'lamps' || scene === 'smoke') LOOK.cliffs = true; return new Promise((r) => setTimeout(r, 4000)); }, scene);
  await p.waitForFunction(() => { const d = document.getElementById('deploying'); return !d || d.hidden || getComputedStyle(d).display === 'none' || getComputedStyle(d).opacity === '0'; }, null, { timeout: 60000 }).catch(() => p.evaluate(() => { const d = document.getElementById('deploying'); if (d) d.remove(); }));
  fs.mkdirSync(out + '/a', { recursive: true }); fs.mkdirSync(out + '/b', { recursive: true });
  const N = still ? 1 : +secs * 15;
  if (scene === 'base') {   // a slow pan, twice
    const pan = (f) => p.evaluate((f) => { const ps = window.__ps; __aim(__base.x + 60 - 120 + f * 2, __base.y + 40 + 60 - f * 1, 1.3); }, f);
    for (const [dir, on] of [['a', false], ['b', true]]) {
      await p.evaluate((on) => { LOOK.concrete = LOOK.cliffs = on; G.ground.forget(); }, on);
      await pan(0); await p.evaluate(() => new Promise((r) => setTimeout(r, 3000)));
      for (let f = 0; f < N; f++) { await pan(f); await raf(); await raf(); await shot(dir, f); }
    }
  } else {
    const keys = scene === 'ra2' ? [] : scene === 'hills' ? ['hills'] : scene === 'battle' ? ['light'] : scene === 'lamps' ? ['lamps', 'ground'] : scene === 'smoke' ? ['smoke'] : ['cliffs'];
    for (let f = 0; f < N; f++) {
      if (scene === 'hills') await p.evaluate((f) => __aim(__mid.x - 160 + f * 2.6, __mid.y - 40 + f * 0.7, 1.6), f);
      await p.evaluate((keys) => { const ps = window.__ps; G.paused = false; ps.update(1 / 30); ps.update(1 / 30); G.paused = true; for (const k of keys) LOOK[k] = false; }, keys);
      if (scene === 'ra2') await p.evaluate(() => setLookStyle('ts'));
      await raf(); await shot('a', f);
      await p.evaluate(([keys, scene]) => { for (const k of keys) LOOK[k] = true; if (scene === 'ra2') setLookStyle('ra2'); }, [keys, scene]); await raf(); await shot('b', f);
    }
  }
  console.log('tracks', await p.evaluate(() => lookTracks ? lookTracks.list.length : null));
  console.log('errors', errs.slice(0, 3));
  await b.close();
})();
