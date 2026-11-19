const { chromium } = require('playwright');
// Frame times of a battle at a phone's size (844 x 390, 3x pixels), CPU slowed 4x: node tools/look/prof.js <repo> <query>...
// (each query an address query such as lookoff=hills, or - for none); prints frames a second, the median frame and drawParts.
const [root, ...variants] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  for (const q of variants) {
    const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.route(/fonts|supabase/, (r) => r.abort());
    await p.goto('file://' + root + '/index.html' + (q === '-' ? '' : '?' + q)); await p.waitForTimeout(800);
    await p.click('#startBtn'); await p.click('#maps [data-map="river"]'); await p.click('#maps [data-map-go]');
    await p.waitForTimeout(1500);
    await p.evaluate(() => {
      const ps = window.__ps;
      Math.random = (() => { let s = 12345; return () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5 | 0) >>> 0) / 4294967296; })();
      for (const t of G.teams) { t.isAI = true; t.auto = false; }
      for (let i = 0; i < 5 * 60 * 30; i++) ps.update(1 / 30);
      const cy = G.entities.find((e) => e.alive && e.team === G.me && e.kind === 'bld');
      const [X, Y] = toView(cy.x + 120, cy.y + 120); ps.cam.x = X - innerWidth / 2 / ps.cam.z; ps.cam.y = Y - innerHeight / 2 / ps.cam.z;
    });
    await p.waitForTimeout(4000);   // tiles, sprites
    const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const r = await p.evaluate(() => new Promise((res) => {
      const acc = {}; let n = 0, last = performance.now(), t0 = last, gaps = [];
      const tick = (now) => {
        gaps.push(now - last); last = now; n++;
        for (const k in drawParts) acc[k] = (acc[k] || 0) + drawParts[k];
        if (now - t0 < 5000) requestAnimationFrame(tick);
        else { gaps.sort((a, b) => a - b); const o = {}; for (const k in acc) if (!/^n[A-Z]/.test(k)) o[k] = +(acc[k] / n).toFixed(1); res({ fps: +(n / 5).toFixed(1), median: +gaps[gaps.length >> 1].toFixed(1), parts: o, z: window.__ps.cam.z }); }
      };
      requestAnimationFrame(tick);
    }));
    console.log(q.padEnd(34), JSON.stringify(r), errs.slice(0, 2).join('|'));
    await ctx.close();
  }
  await b.close();
})();
