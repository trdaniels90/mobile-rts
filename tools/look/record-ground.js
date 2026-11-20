const { chromium } = require('playwright');
const fs = require('fs');
// Before/after frames for the ground and water parts of the look (src/look.js): two page loads of the same staged scene on
// River Crossing (the middle crossing: water, shore, dirt road and grass; tanks destroyed there for wrecks, others driving
// past for tracks). Before: ?lookoff=ground,water (the soft blends are painted with the ground, so they cannot be switched
// within one page); after: everything on. Frames to <out>/a and <out>/b; make the MP4 with tools/look/video.sh.
//   node tools/look/record-ground.js <repo> <out dir> [seconds] [still]
const [root, out, secs = '12', still] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  for (const [dir, q] of [['a', '?lookoff=ground,water'], ['b', '']]) {
    const p = await (await b.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 })).newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.route(/fonts|supabase/, (r) => r.abort());
    await p.goto('file://' + root + '/index.html' + q); await p.waitForTimeout(800);
    await p.click('#startBtn'); await p.click('#maps [data-map="river"]'); await p.click('#maps [data-map-go]'); await p.waitForTimeout(1000);
    await p.evaluate(() => {
      const ps = window.__ps, me = G.teams[G.me], foe = G.teams.find((t) => t.id !== G.me);
      for (const t of G.teams) t.isAI = false;
      G.fog[G.me].fill(1); G.shroudDirty = true; G.weather = null;
      // The crossing nearest the middle: a water cell with land a few cells either side.
      let best = null; const m = MAP / 2;
      for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
        const c = idx(x, y); if (G.terr[c] !== 5) continue;   // a bridge or ford
        const d = Math.hypot(x - m, y - m); if (!best || d < best.d) best = { d, x, y };
      }
      const mx = (best.x + 0.5) * CELL, my = (best.y + 0.5) * CELL;
      const land = (x, y) => { const c = cellOfPos(x, y); return c !== false && G.terr[c] <= 1 && !G.cliff[c]; };
      let n = 0;
      for (let i = 0; i < 300 && n < 6; i++) { const a = i * 2.4, d = 60 + (i % 7) * 12, x = mx + Math.cos(a) * d, y = my + Math.sin(a) * d; if (land(x, y)) { const u = addUnit(['mtank', 'htank', 'ltank'][n % 3], foe, x, y); damage(u, 1e7, 'HE', null); n++; } }
      for (let i = 0; i < 30 * 30; i++) ps.update(1 / 30);   // burnt out: the wrecks are marks on the ground
      const movers = [];
      for (let i = 0; i < 300 && movers.length < 5; i++) { const x = mx - 220 + (i % 10) * 14, y = my - 60 + Math.floor(i / 10) * 14; if (land(x, y)) movers.push(addUnit('mtank', me, x, y)); }
      ps.commandMove(movers, mx + 200, my + 120);
      window.__aim = (x, y, z) => { const [X, Y] = toView(x, y); ps.cam.z = z; ps.cam.x = X - (innerWidth - 120) / 2 / z; ps.cam.y = Y - innerHeight / 2 / z; };
      window.__mid = [mx, my];
      __aim(mx, my, 1.6);
      G.paused = true;
    });
    await p.evaluate(() => new Promise((r) => setTimeout(r, 3500)));   // ground tiles painted
    fs.mkdirSync(`${out}/${dir}`, { recursive: true });
    const N = still ? 1 : +secs * 15;
    for (let f = 0; f < N; f++) {
      await p.evaluate((f) => { const ps = window.__ps; G.paused = false; ps.update(1 / 30); ps.update(1 / 30); G.paused = true; __aim(__mid[0] - 60 + f * 0.7, __mid[1] + 20 - f * 0.3, 1.6); }, f);
      await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await p.screenshot({ path: `${out}/${dir}/${String(f).padStart(4, '0')}.png` });
    }
    console.log(dir, 'errors', errs.slice(0, 3));
    await p.context().close();
  }
  await b.close();
})();
