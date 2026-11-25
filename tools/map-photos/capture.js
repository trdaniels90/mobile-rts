// Photographs every map whole, as the game draws it (WebGL, hills, cliffs, trees, water; fog lifted, no clouds or weather),
// in screen-sized tiles at zoom 1, for tools/map-photos/stitch.py to join. Used for the owner's map viewer page.
// node tools/map-photos/capture.js <repo> <out dir> [map ids]
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [root, outDir, ...only] = process.argv.slice(2);
  const b = await chromium.launch();
  const pg0 = await b.newPage(); await pg0.goto('file://' + root + '/index.html'); const all = await pg0.evaluate(() => MAP_LIST); await pg0.close();
  for (const id of (only.length ? only : all)) {
    const pg = await b.newPage({ viewport: { width: 1800, height: 1100 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
    await pg.route(/fonts|supabase\.co/, (r) => r.abort());
    await pg.goto('file://' + root + '/index.html'); await pg.waitForTimeout(400);
    await pg.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 4; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 4, 4); window.cloudShadowPic = () => c; });
    await pg.click('#startBtn');
    for (const m of ['1v1', '2v2', '3v3']) { const t = await pg.$(`#maps [data-mode="${m}"]`); if (t) await t.click(); if (await pg.$(`#maps [data-map="${id}"]`)) break; }
    await pg.click(`#maps [data-map="${id}"]`); await pg.click('#maps [data-map-go]'); await pg.waitForTimeout(1500);
    await pg.addStyleTag({ content: 'body > :not(#game):not(#gl) { visibility: hidden !important; }' });
    const info = await pg.evaluate(() => {
      G.weather = null; G.t = 120; G.seen = new Uint8Array(G.fog[G.me].length).fill(1); for (const f of G.fog) f.fill(1);
      for (const t of G.teams) t.isAI = false;
      const pts = [[0, 0], [WORLD, 0], [0, WORLD], [WORLD, WORLD]].map(([x, y]) => toView(x, y)), xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      const r = document.getElementById('game').getBoundingClientRect();
      return { x0: Math.min(...xs) - 60, x1: Math.max(...xs) + 60, y0: Math.min(...ys) - 200, y1: Math.max(...ys) + 60, r: [r.left, r.top, r.width, r.height] };
    });
    const [rl, rt, rw, rh] = info.r, step = [Math.round(rw / 2), Math.round(rh / 2)], shots = [];
    for (let y = info.y0; y < info.y1; y += step[1]) for (let x = info.x0; x < info.x1; x += step[0]) {
      await pg.evaluate(([x, y]) => { const c = __ps.cam; c.z = 1; c.x = x; c.y = y; }, [x, y]);
      await pg.waitForTimeout(1400);
      const cam = await pg.evaluate(() => ({ x: __ps.cam.x, y: __ps.cam.y, z: __ps.cam.z }));
      const f = `${outDir}/${id}_${shots.length}.png`;
      await pg.screenshot({ path: f, clip: { x: rl, y: rt, width: rw, height: rh }, timeout: 60000 });
      shots.push({ f, x: cam.x - info.x0, y: cam.y - info.y0, want: [x - info.x0, y - info.y0], z: cam.z });
    }
    fs.writeFileSync(`${outDir}/${id}.json`, JSON.stringify({ w: info.x1 - info.x0, h: info.y1 - info.y0, shots }));
    console.log(id, shots.length, 'tiles', errs.slice(0, 3));
    await pg.close();
  }
  await b.close();
})();
