const { chromium } = require('playwright');
const fs = require('fs');
// Before/after frames for proposal items 4-6 (src/lookfx.js LOOK.alive, .blasts, .sidebar), one page:
//   node tools/look/record-fx.js <repo> <out dir> <map> <alive|blasts|sidebar> [seconds]
// Bases built by the AI for 5 minutes, fog lifted. alive: the camera on our base, the AI still building (it produces, and
// a Power Plant is placed in view at the start); blasts: the enemy's base, a staged barrage (shells, then structures and
// tanks destroyed); sidebar: the whole screen, the radar knocked out and back on (static). before = off, after = on.
// Frames: <out>/a, <out>/b. Prints page errors.
const [root, out, map, part, secs = '6'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route(/fonts|supabase/, (r) => r.abort());
  await p.goto('file://' + root + '/index.html'); await p.waitForTimeout(800);
  await p.click('#startBtn'); await p.click(`#maps [data-map="${map}"]`); await p.click('#maps [data-map-go]'); await p.waitForTimeout(1000);
  await p.evaluate((part) => {
    const ps = window.__ps;
    for (const t of G.teams) { t.isAI = true; t.auto = false; }
    for (let i = 0; i < 5 * 60 * 30; i++) ps.update(1 / 30);
    for (const t of G.teams) t.isAI = part === 'alive' && t.id === G.me;
    G.fog[G.me].fill(1); G.shroudDirty = true; G.weather = null;
    const me = G.teams[G.me], foe = G.teams.find((t) => t.id !== G.me);
    const cy = G.entities.find((e) => e.alive && e.team === G.me && e.kind === 'bld' && e.type === 'cy');
    let x = cy.x + 60, y = cy.y + 60, z = 1.6;
    if (part === 'alive') {
      const pw = G.entities.find((e) => e.alive && e.team === G.me && e.type === 'refinery') || cy;
      x = (pw.x + cy.x) / 2; y = (pw.y + cy.y) / 2;
      me.credits += 20000;
      for (let r = 2; r < 9 && !window.__spot; r++) for (let j = -r; j <= r && !window.__spot; j++) for (let i = -r; i <= r && !window.__spot; i++) {
        const cx = Math.round(x / CELL) + i, cyy = Math.round(y / CELL) + j;
        if (canPlace(me, 'power', cx, cyy)) window.__spot = [cx, cyy];
      }
    } else if (part === 'blasts') {
      const fb = G.entities.filter((e) => e.alive && e.team === foe.id && e.kind === 'bld' && !e.def.defense);
      const c = fb.find((e) => e.type === 'cy') || fb[0];
      x = c.x; y = c.y; z = 2;
      window.__targets = fb.filter((e) => Math.hypot(e.x - c.x, e.y - c.y) < 260).slice(0, 4).map((e) => e.id);
    }
    window.__aim = (x, y, z) => { const [X, Y] = toView(x, y); ps.cam.z = z; ps.cam.x = X - (innerWidth - 180) / 2 / z; ps.cam.y = Y - innerHeight / 2 / z; };
    window.__mid = [x, y, z];
    __aim(x, y, z);
    G.paused = true;
  }, part);
  await p.evaluate(() => new Promise((r) => setTimeout(r, 3000)));
  const N = +secs * 15, raf = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  for (const d of ['a', 'b']) fs.mkdirSync(`${out}/${d}`, { recursive: true });
  for (let f = 0; f < N; f++) {
    await p.evaluate(([f, part]) => {
      const ps = window.__ps, me = G.teams[G.me], foe = G.teams.find((t) => t.id !== G.me);
      if (part === 'alive' && f === 3 && window.__spot) addBuilding('power', me, ...window.__spot);
      if (part === 'blasts') {
        const [mx, my] = window.__mid;
        if (f % 4 === 0 && f < 40) {   // a barrage of shells round the base
          const x = mx + (Math.random() - 0.5) * 300, y = my + (Math.random() - 0.5) * 220, big = Math.random() < 0.4;
          G.effects.push({ type: 'expl', x, y, size: big ? 13 : 9, t: 0, life: big ? 0.7 : 0.5, seed: (Math.random() * 1e6) | 0, debris: true });
        }
        const ids = window.__targets, at = { 30: 0, 46: 1, 62: 2, 74: 3 };
        if (at[f] !== undefined && ids[at[f]]) { const e = G.byId.get(ids[at[f]]); if (e && e.alive) damage(e, e.hp + 10, 'HE', null); }
        if (f === 20) { for (let i = 0; i < 3; i++) { const u = addUnit('ltank', foe, mx + 120 + i * 30, my + 90); damage(u, u.hp + 10, 'AP', null); } }
      }
      if (part === 'sidebar' && f === 2) { for (const e of G.entities) if (e.alive && e.team === G.me && e.type === 'dome') e._keepHp = e.hp; me.low = true; }
      if (part === 'sidebar' && f === 20) me.low = false;
      G.paused = false; ps.update(1 / 30); ps.update(1 / 30); G.paused = true;
    }, [f, part]);
    if (part !== 'sidebar') await p.evaluate(([x, y, z, f]) => __aim(x - 30 + f * 0.6, y, z), [...(await p.evaluate(() => window.__mid)), f]);
    for (const [dir, on] of [['a', false], ['b', true]]) {
      await p.evaluate(([k, on]) => { LOOK[k] = on; if (k === 'sidebar') lookSteel(); }, [part, on]); await raf();
      if (part === 'sidebar') await p.evaluate(() => new Promise((r) => setTimeout(r, 60)));
      await p.screenshot({ path: `${out}/${dir}/${String(f).padStart(4, '0')}.png` });
    }
  }
  console.log(map, part, 'errors', errs.slice(0, 3));
  await b.close();
})();
