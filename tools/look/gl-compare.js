const { chromium } = require('playwright');
// The same moment drawn the 2D way (GLR.paused) and with the WebGL renderer, in one page, (gl.js), plus frames a second and the ground's draw time:
//   node tools/look/gl-compare.js <repo> <out prefix> <map> [fight|fightfx|calm] [rain|snow]   (fight: 9 minutes of both sides attacking, the camera on the fighting; fightfx: 4.5 minutes, the camera on the most blasts and smoke, with six blasts and fires set off there)   (writes <prefix>_off.png, <prefix>_on.png and <prefix>_lit.png)
// node glcmp.js <repo> <out prefix> <map>: the same frame with ?gl=off and with WebGL, plus draw time.
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const mode of ['one']) {
    const p = await (await b.newContext({ viewport: { width: 960, height: 540 } })).newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => /WebGL|error/i.test(m.text()) && errs.push(m.text()));
    await p.addInitScript(() => { let s = 7; Math.random = () => ((s = Math.imul(s, 1103515245) + 12345 >>> 0) / 4294967296); });
    await p.route(/fonts|supabase/, (r) => r.abort());
    await p.goto('file://' + process.argv[2] + '/index.html' ); await p.waitForTimeout(800);
    await p.evaluate((f) => { window.__fight = f[0]; window.__fx = f[1]; window.__wx = f[2]; }, [/fight/.test(process.argv[5] || ''), /fx/.test(process.argv[5] || ''), process.argv[6] || null]); await p.click('#startBtn'); await p.click(`#maps [data-map="${process.argv[4]}"]`); await p.click('#maps [data-map-go]'); await p.waitForTimeout(800);
    await p.evaluate(() => {
      
      const fight = window.__fight; for (const t of G.teams) { t.isAI = true; t.auto = fight; }
      for (let i = 0; i < (fight ? (window.__fx ? 4.5 : 9) : 3) * 60 * 30; i++) __ps.update(1 / 30);
      if (window.__fx) for (let i = 0; i < 1800; i++) { __ps.update(1 / 30); if (G.effects.filter((f) => f.type === 'expl' && f.t > 0.05 && f.t < 0.5 * f.life).length >= 4) break; }
      G.paused = true; G.fog[G.me].fill(1); G.shroudDirty = true; G.weather = window.__wx ? { kind: window.__wx, seed: 3, lvl: 0.8 } : null; if (LOOK.storms !== undefined) LOOK.storms = false; LOOK.fog = false;
      const cy = G.entities.find((e) => e.team === G.me && e.type === 'cy');
      let best = null;   // the most up-and-down ground within 30 cells
      for (let y = 4; y < MAP - 4; y += 2) for (let x = 4; x < MAP - 4; x += 2) { const d = Math.hypot(x * CELL - cy.x, y * CELL - cy.y) / CELL; if (d < 12 || d > 30) continue; let lo = 99, hi = 0; for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) { const h = G.hgt[(y + j) * MAP + x + i]; lo = Math.min(lo, h); hi = Math.max(hi, h); } const s = hi - lo - d * 0.2; if (!best || s > best.s) best = { s, x: (x + 0.5) * CELL, y: (y + 0.5) * CELL }; }
      let px = (best.x + cy.x) / 2, py = (best.y + cy.y) / 2;
      if (fight) {   // where most units of both sides are near each other
        const us = G.entities.filter((e) => e.alive && e.kind === 'unit' && e.cls !== 'air'); let bb = null;
        for (const u of us) { let n = 0; for (const w of us) if (w.team !== u.team && Math.hypot(w.x - u.x, w.y - u.y) < 250) n++; if (!bb || n > bb.n) bb = { n, x: u.x, y: u.y }; }
        if (bb) { px = bb.x; py = bb.y; }
        let fb = null;   // (where the most shots and effects are: smoke, fire, blasts)
        const fxs = G.effects.filter((f) => f.type === 'expl' || f.type === 'smoke' || f.type === 'fire').concat(G.projectiles);
        for (const f of fxs) { let n = 0; for (const g of fxs) if (Math.hypot(g.x - f.x, g.y - f.y) < 200) n++; if (!fb || n > fb.n) fb = { n, x: f.x, y: f.y }; }
        if (window.__fx && fb) { px = fb.x; py = fb.y; window.__fxn = fb.n; }
      }
      if (window.__fx) { for (let i = 0; i < 6; i++) G.effects.push({ type: 'expl', x: px + (i % 3 - 1) * 60, y: py + (i > 2 ? 40 : -30), size: 14 + i * 2, t: -i * 0.05, life: 0.8, seed: i * 977, debris: true }); for (let i = 0; i < 6; i++) smoulder(px - 90 + i * 35, py + 70, 8); for (let i = 0; i < 9; i++) __ps.update(1 / 30); }
      const [X, Y] = toView(px, py); __ps.cam.z = 1.2; __ps.cam.x = X - 400 / 1.2; __ps.cam.y = Y - 270 / 1.2;
    });
    await p.evaluate(() => { G.paused = true; }); await p.waitForTimeout(6000);
    const t = await p.evaluate(async () => { const a = performance.now(); let n = 0; while (performance.now() - a < 2000) { await new Promise((r) => requestAnimationFrame(r)); n++; } return { fps: n / 2, gnd: drawParts.gnd && drawParts.gnd.toFixed(2), glFrames: GLR.frames, quads: GLR.quads, unsup: GLR.unsupported, calls: GLR.calls, bits: GLR.bits, lights: GLR.lights, lightQuads: GLR.lightQuads, overQuads: GLR.overQuads, lit: GLR.lit, bitRows: GLR.bitRows, normals: GLR.normals, none: GLR.nrmNone, mismatch: GLR.nrmMismatch, fxNear: window.__fxn, fx: G.effects.length, shots: G.projectiles.length }; });
    // off: the 2D way; on: WebGL with flat light (GLR.nrmK 0, to compare with 2D); lit: WebGL with the normal maps' light (stage 4)
    for (const m of ['off', 'on', 'lit']) { await p.evaluate((m) => { GLR.paused = m === 'off'; if (GLR.on) { GLR.nrmK = m === 'on' ? 0 : 0.85; GLR.sun = m !== 'on'; } }, m); await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await p.screenshot({ path: `${process.argv[3]}_${m}.png` }); }
    console.log(mode, JSON.stringify(t), errs.slice(0, 3));
    await p.close();
  }
  await b.close();
})();
