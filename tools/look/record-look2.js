const { chromium } = require('playwright');
const fs = require('fs');
// Before/after frames for proposal items 7 and 8 (src/lookstorm.js LOOK.storms, src/lookstructs.js LOOK.structs), one page:
//   node tools/look/record-look2.js <repo> <out dir> <map> <structs|storms> [seconds]
// Bases built by the AI for 6 minutes, fog lifted, the AI still playing. structs: a slow pan over our base, then over the
// enemy's (before = the earlier models, after = the redesigned ones; lookStructs.set swaps them per frame). storms: our
// base; after = a storm rolling in fast-forwarded (0-16 s of it in 3 s), its height in real time with strikes, then
// clearing fast-forwarded. Frames: <out>/a, <out>/b. Prints page errors.
const [root, out, map, part, secs = '12'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route(/fonts|supabase/, (r) => r.abort());
  await p.goto('file://' + root + '/index.html'); await p.waitForTimeout(800);
  await p.click('#startBtn'); await p.click(`#maps [data-map="${map}"]`); await p.click('#maps [data-map-go]'); await p.waitForTimeout(1000);
  await p.evaluate(() => {
    const ps = window.__ps;
    for (const t of G.teams) { t.isAI = true; t.auto = false; }
    for (let i = 0; i < 6 * 60 * 30; i++) ps.update(1 / 30);
    G.fog[G.me].fill(1); G.shroudDirty = true; G.weather = null;
    const base = (team) => {
      const bs = G.entities.filter((e) => e.alive && e.team === team && e.kind === 'bld' && !e.def.defense);
      const cy = bs.find((e) => e.type === 'cy') || bs[0];
      const near = bs.filter((e) => Math.hypot(e.x - cy.x, e.y - cy.y) < 300);
      return [near.reduce((s, e) => s + e.x, 0) / near.length, near.reduce((s, e) => s + e.y, 0) / near.length];
    };
    window.__bases = [base(G.me), base(G.teams.find((t) => t.id !== G.me).id)];
    window.__aim = (x, y, z) => { const [X, Y] = toView(x, y); ps.cam.z = z; ps.cam.x = X - (innerWidth - 180) / 2 / z; ps.cam.y = Y - innerHeight / 2 / z; };
    spriteSpend = -1e9;
    G.paused = true;
  });
  await p.evaluate(() => new Promise((r) => setTimeout(r, 3000)));
  const N = +secs * 15, raf = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  for (const d of ['a', 'b']) fs.mkdirSync(`${out}/${d}`, { recursive: true });
  // The storm's own clock for frame f: build-up fast (0-16 s in the first quarter), the height in real time, clearing fast.
  const q1 = Math.round(N * 0.22), q3 = Math.round(N * 0.8);
  const stormAt = (f) => (f < q1 ? 16 * f / q1 : f < q3 ? 16 + (f - q1) / 15 : 75 + 20 * (f - q3) / (N - q3));
  const strikes = new Set([q1 + 8, q1 + 40, q1 + 75, q1 + 100].filter((f) => f < q3));
  for (let f = 0; f < N; f++) {
    await p.evaluate(() => { const ps = window.__ps; spriteSpend = -1e9; G.paused = false; ps.update(1 / 30); ps.update(1 / 30); G.paused = true; });
    if (part === 'structs') {
      const half = N / 2, which = f < half ? 0 : 1, u = (f % half) / half;
      await p.evaluate(([w, u]) => { const [x, y] = window.__bases[w]; __aim(x - 110 + u * 220, y - 40 + u * 60, 1.7); }, [which, u]);
    } else await p.evaluate((f) => { const [x, y] = window.__bases[0]; __aim(x - 40 + f * 0.4, y + 10, 1.4); }, f);
    for (const [dir, on] of [['a', false], ['b', true]]) {
      if (part === 'structs') await p.evaluate((on) => { LOOK.storms = false; lookStructs.set(on); spriteSpend = -1e9; }, on);
      else await p.evaluate(([on, u, hit]) => { LOOK.storms = on; lookStorm.at(u); if (on && hit) lookStorm.strike(); G.paused = false; }, [on, stormAt(f), strikes.has(f)]);
      await raf();
      await p.evaluate(() => { G.paused = true; });
      if (part === 'structs') { await p.evaluate(() => { spriteSpend = -1e9; }); await raf(); }
      await p.screenshot({ path: `${out}/${dir}/${String(f).padStart(4, '0')}.png` });
    }
  }
  console.log(map, part, 'errors', errs.slice(0, 3));
  await b.close();
})();
