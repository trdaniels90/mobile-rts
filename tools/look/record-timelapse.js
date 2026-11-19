const { chromium } = require('playwright');
const fs = require('fs');
// A time lapse of the lighting through a whole day on a day/night map (art.js dayNight, drawNight; look.js lamps, light
// pools, window glow, mood, fog): bases built by the AI first, then one battle day (DAY_LEN) squeezed into <seconds> of
// video while the AI plays on, the camera drifting slowly over our base. One view (no before/after).
//   node tools/look/record-timelapse.js <repo> <out dir> [map=village] [seconds=24]
// Frames: <out>/f (15 a second). MP4: ffmpeg -framerate 15 -i <out>/f/%04d.png ...
const [root, out, map = 'village', secs = '24'] = process.argv.slice(2);
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
    for (let i = 0; i < 5 * 60 * 30; i++) ps.update(1 / 30);
    G.fog[G.me].fill(1); G.shroudDirty = true;
    const bs = G.entities.filter((e) => e.alive && e.team === G.me && e.kind === 'bld' && !e.def.defense);
    const cy = bs.find((e) => e.type === 'cy') || bs[0], near = bs.filter((e) => Math.hypot(e.x - cy.x, e.y - cy.y) < 280);
    window.__mid = [near.reduce((s, e) => s + e.x, 0) / near.length, near.reduce((s, e) => s + e.y, 0) / near.length];
    window.__aim = (x, y, z) => { const [X, Y] = toView(x, y); ps.cam.z = z; ps.cam.x = X - (innerWidth - 180) / 2 / z; ps.cam.y = Y - innerHeight / 2 / z; };
    G.paused = true;
  });
  await p.evaluate(() => new Promise((r) => setTimeout(r, 3000)));
  fs.mkdirSync(`${out}/f`, { recursive: true });
  const N = +secs * 15, perFrame = DAYLEN(N);
  function DAYLEN(n) { return 720 / n; }   // game seconds a frame (art.js DAY_LEN 720: one day)
  for (let f = 0; f < N; f++) {
    await p.evaluate(([f, N, per]) => {
      const ps = window.__ps; spriteSpend = -1e9;
      G.paused = false;
      for (let i = 0, n = Math.round(per * 30); i < n; i++) ps.update(1 / 30);
      const [x, y] = window.__mid, u = f / N;
      __aim(x - 90 + u * 180, y - 30 + u * 40, 1.5);
    }, [f, N, perFrame]);
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await p.evaluate(() => { G.paused = true; });
    await p.screenshot({ path: `${out}/f/${String(f).padStart(4, '0')}.png` });
  }
  console.log(map, 'errors', errs.slice(0, 3));
  await b.close();
})();
