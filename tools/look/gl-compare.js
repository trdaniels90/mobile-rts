const { chromium } = require('playwright');
// The same moment drawn with ?gl=off and with the WebGL renderer (gl.js), plus frames a second and the ground's draw time:
//   node tools/look/gl-compare.js <repo> <out prefix> <map>   (writes <prefix>_off.png and <prefix>_on.png)
// node glcmp.js <repo> <out prefix> <map>: the same frame with ?gl=off and with WebGL, plus draw time.
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const mode of ['off', 'on']) {
    const p = await (await b.newContext({ viewport: { width: 960, height: 540 } })).newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => /WebGL|error/i.test(m.text()) && errs.push(m.text()));
    await p.addInitScript(() => { let s = 7; Math.random = () => ((s = Math.imul(s, 1103515245) + 12345 >>> 0) / 4294967296); });
    await p.route(/fonts|supabase/, (r) => r.abort());
    await p.goto('file://' + process.argv[2] + '/index.html' + (mode === 'off' ? '?gl=off' : '')); await p.waitForTimeout(800);
    await p.click('#startBtn'); await p.click(`#maps [data-map="${process.argv[4]}"]`); await p.click('#maps [data-map-go]'); await p.waitForTimeout(800);
    await p.evaluate(() => {
      
      for (const t of G.teams) { t.isAI = true; t.auto = false; }
      for (let i = 0; i < 3 * 60 * 30; i++) __ps.update(1 / 30);
      G.paused = true; G.fog[G.me].fill(1); G.shroudDirty = true; G.weather = null; if (LOOK.storms !== undefined) LOOK.storms = false; LOOK.fog = false;
      const cy = G.entities.find((e) => e.team === G.me && e.type === 'cy');
      let best = null;   // the most up-and-down ground within 30 cells
      for (let y = 4; y < MAP - 4; y += 2) for (let x = 4; x < MAP - 4; x += 2) { const d = Math.hypot(x * CELL - cy.x, y * CELL - cy.y) / CELL; if (d < 12 || d > 30) continue; let lo = 99, hi = 0; for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) { const h = G.hgt[(y + j) * MAP + x + i]; lo = Math.min(lo, h); hi = Math.max(hi, h); } const s = hi - lo - d * 0.2; if (!best || s > best.s) best = { s, x: (x + 0.5) * CELL, y: (y + 0.5) * CELL }; }
      const [X, Y] = toView((best.x + cy.x) / 2, (best.y + cy.y) / 2); __ps.cam.z = 1.2; __ps.cam.x = X - 400 / 1.2; __ps.cam.y = Y - 270 / 1.2;
    });
    await p.evaluate(() => { G.paused = true; }); await p.waitForTimeout(6000);
    const t = await p.evaluate(async () => { const a = performance.now(); let n = 0; while (performance.now() - a < 2000) { await new Promise((r) => requestAnimationFrame(r)); n++; } return { fps: n / 2, gnd: drawParts.gnd && drawParts.gnd.toFixed(2), glFrames: GLR.frames }; });
    await p.screenshot({ path: `${process.argv[3]}_${mode}.png` });
    console.log(mode, JSON.stringify(t), errs.slice(0, 3));
    await p.close();
  }
  await b.close();
})();
