const { chromium, devices } = require('playwright');
// When does the computer find the player's base, how, and when does its first attack land?
// node scouttest.js <repo> <difficulty> <minutes> <faction> <seeds>
(async () => {
  const [root, diff, minutes, faction, seeds] = process.argv.slice(2);
  const b = await chromium.launch();
  for (const seed of seeds.split(',')) {
    const p = await (await b.newContext({ ...devices['iPhone 13 landscape'] })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.route(/fonts|supabase/, (r) => r.abort());
    await p.goto('file://' + root + '/index.html'); await p.tap('#startBtn'); await p.tap('#maps [data-map-go]'); await p.waitForTimeout(600);
    const r = await p.evaluate(({ diff, minutes, faction, seed }) => {
      newWorld(faction, diff, +seed);
      const me = G.teams[0], ai = G.teams[1]; me.auto = false; G.paused = true;
      const out = { seed, foundAt: null, scouts: [], firstWaveAt: null, firstHitAt: null, over: null };
      let lastScout = null;
      for (let i = 0; i < minutes * 60 * 30 && !G.over; i++) {
        G.paused = false; update(1 / 30); G.paused = true;
        if (i % 15) continue;
        const s = ai.scout && ai.scout.u;
        if (s && s !== lastScout) { out.scouts.push({ t: Math.round(G.t), type: s.type }); lastScout = s; }
        if (ai.scout && ai.scout.until > G.t && !out.scouts.some((x) => x.type === 'spy plane')) out.scouts.push({ t: Math.round(G.t), type: 'spy plane' });
        if (out.foundAt === null && enemyBaseKnown(1)) out.foundAt = Math.round(G.t);
        if (out.firstWaveAt === null && ai.waves) out.firstWaveAt = Math.round(G.t);
        if (out.firstHitAt === null && buildingsOf(0).some((b) => b.hp < b.maxHp && G.t - (b.hitT || -99) < 1)) out.firstHitAt = Math.round(G.t);
      }
      out.over = G.over ? Math.round(G.t) : null;
      return out;
    }, { diff, minutes, faction, seed });
    r.errs = errs.slice(0, 2);
    console.log(JSON.stringify(r));
  }
  await b.close();
})();
