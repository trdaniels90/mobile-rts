const { chromium } = require('playwright');
const os = require('os'), fs = require('fs'), path = require('path');
// The ground in tiles (art.js makeGround) and the marks of battle (G.marks). A battle is staged in the middle of the
// map so every kind of mark is made (scorch, crater, wreck, turret, body, base pad), half of it under a camera that
// keeps its tiles painted. Checks, per map:
//  - tiles that took marks as they came match tiles painted again from scratch, pixel for pixel;
//  - the game's tiles at 256 and at 512 pixels give the same pixels (tile edges leave no trace);
//  - the whole ground in one picture with every mark drawn straight on it differs only by blending rounding;
//  - a skirmish saved (menu), the page reloaded and Continue: the same ground and marks, pixel for pixel.
// With [old repo path] (a checkout from before the tiles): a save made there continues here with its battle scars.
// node tools/sim/ground-tiles.js <repo> [maps, comma separated] [old repo path]
(async () => {
  const [root, maps = 'snowbound,bridge,river', oldRoot] = process.argv.slice(2);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-ground-'));
  const ctx = await chromium.launchPersistentContext(dir, { viewport: { width: 1200, height: 700 } });
  const errs = [];
  const open = async (repo) => {
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message + ' @ ' + (e.stack || '').split('\n')[1]));
    await p.route(/fonts|supabase/, (r) => r.abort());
    await p.goto('file://' + repo + '/index.html'); await p.waitForTimeout(1000);
    return p;
  };
  // Shared page code: compare two canvases; checksum of the ground and the wrecks layer.
  const HELPERS = `
    window.cmp = (A, B) => { const a = A.getContext('2d').getImageData(0, 0, WORLD, WORLD).data, b = B.getContext('2d').getImageData(0, 0, WORLD, WORLD).data;
      let diff = 0, max = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { diff++; max = Math.max(max, Math.abs(a[i] - b[i])); } return { diff, max }; };
    window.sum = (c) => { const d = c.getContext('2d').getImageData(0, 0, WORLD, WORLD).data; let h = 0; for (let i = 0; i < d.length; i += 3) h = (h * 31 + d[i]) | 0; return h; };
    window.stage = (map, minutes) => {
      const sides = [0, 1, 2, 3, 4, 5].map((i) => ({ faction: i % 2 ? 'soviets' : 'allies', ally: i % 2, ai: true }));
      newWorld('allies', 'hard', 5, 0, false, map, MAPS[map].teamSize >= 3 ? sides : null);
      for (const t of G.teams) { t.isAI = true; t.auto = true; }
      const mx = WORLD / 2, my = WORLD / 2, foe = G.teams.find((t) => t.ally !== G.teams[0].ally);
      const army = ['rifle', 'rifle', 'grenadier', 'rocket', 'mtank', 'htank', 'ltank', 'arty', 'v2rl', 'rifle', 'rifle', 'mammoth'];
      for (let i = 0; i < 40; i++) for (const [team, dx] of [[G.teams[0], -70], [foe, 70]]) addUnit(army[i % army.length], team, mx + dx + (i % 8) * 14 - 50, my + Math.floor(i / 8) * 30 - 70);
      commandHunt(G.entities.filter((e) => e.kind === 'unit' && e.alive && Math.abs(e.x - mx) < 400 && Math.abs(e.y - my) < 400));
      const cam = [mx - 900, my - 300, 900, 600];
      G.ground.update(...cam, 1e9, 0);
      for (let i = 0; i < minutes * 60 * 30 && !G.over; i++) { update(1 / 30); if (i % 3 === 0) G.ground.update(...cam, 6, 3); }
    };`;
  const out = {};
  const p = await open(root);
  await p.evaluate(HELPERS);
  for (const map of maps.split(',')) {
    out[map] = await p.evaluate((map) => {
      stage(map, 1);
      const r = { marks: G.marks.length, kinds: [...new Set(G.marks.map((m) => m[1]))].sort().join(' '), liveTiles: G.ground.tiles.size };
      const liveT = G.ground.whole('t'), liveD = G.ground.whole('d');
      G.ground.forget();
      r.liveVsRepainted = [cmp(liveT, G.ground.whole('t')), cmp(liveD, G.ground.whole('d'))];
      const g512 = eval('(' + makeGround.toString().replace('const T = GROUND_TILE', 'const T = 512') + ')')(groundPainter(G.terr, G.seed, G.road, G.bridges, G.cliff, G.ford, mapTheme(map), MAPS[map].bridge), null);
      for (let i = 0; i < G.marks.length; i++) g512.add(i);
      r.tiles256vs512 = [cmp(liveT, g512.whole('t')), cmp(liveD, g512.whole('d'))];
      const refT = paintTerrain(G.terr, G.seed, G.road, G.bridges, G.cliff, G.ford, mapTheme(map), MAPS[map].bridge), refD = mkCanvas(WORLD, WORLD);
      for (const m of G.marks) drawMark((m[0] === 't' ? refT : refD).getContext('2d'), m);
      r.vsOnePicture = [cmp(liveT, refT), cmp(liveD, refD)];
      return r;
    }, map);
  }
  // Save and continue (the map that came last, through the menu as a player would).
  await p.evaluate(() => { Report.quit && 0; });
  const before = await p.evaluate(() => { stage('snowbound', 1); G.paused = true;   // (saved paused: the game must not run on between loading and looking)
    return { marks: G.marks.length, t: sum(G.ground.whole('t')), d: sum(G.ground.whole('d')) }; });
  await p.evaluate(() => SaveGame.save({ faction: 'allies', diffKey: 'hard', cam: { x: 0, y: 0, z: 1 }, match: null }));
  await p.reload(); await p.waitForTimeout(1500); await p.evaluate(HELPERS);
  const after = await p.evaluate(async () => { const r = await SaveGame.load(); return r && { marks: G.marks.length, t: sum(G.ground.whole('t')), d: sum(G.ground.whole('d')), MAP }; });
  out.saveContinue = { before, after, same: !!after && before.marks === after.marks && before.t === after.t && before.d === after.d };
  // A save from the old code (ground kept as pictures) continues here with its scars.
  if (oldRoot) {
    const q = await open(oldRoot);
    const old = await q.evaluate(async () => {
      newWorld('allies', 'normal', 9, 0, false, 'river');
      for (const t of G.teams) { t.isAI = true; t.auto = true; }
      const mx = 72 * CELL, my = 72 * CELL;
      for (let i = 0; i < 30; i++) for (const [team, dx] of [[G.teams[0], -60], [G.teams[1], 60]]) addUnit(['mtank', 'rifle', 'htank', 'grenadier'][i % 4], team, mx + dx + (i % 6) * 14, my + Math.floor(i / 6) * 30 - 70);
      commandHunt(G.entities.filter((e) => e.kind === 'unit' && e.alive && Math.abs(e.x - mx) < 300));
      for (let i = 0; i < 60 * 30; i++) update(1 / 30);
      await SaveGame.save({ faction: 'allies', diffKey: 'normal', cam: { x: 0, y: 0, z: 1 }, match: null });
      await new Promise((res) => setTimeout(res, 4000));   // the pictures are saved after
      const c = G.decals.getContext('2d').getImageData(0, 0, WORLD, WORLD).data; let n = 0; for (let i = 3; i < c.length; i += 4) if (c[i]) n++;
      const sumC = (cv) => { const d = cv.getContext('2d').getImageData(0, 0, WORLD, WORLD).data; let h = 0; for (let i = 0; i < d.length; i += 3) h = (h * 31 + d[i]) | 0; return h; };
      return { wreckPixels: n, t: sumC(G.terrainCanvas), d: sumC(G.decals) };
    });
    await q.close();
    await p.reload(); await p.waitForTimeout(1500); await p.evaluate(HELPERS);
    const now = await p.evaluate(async () => {
      const r = await SaveGame.load(); if (!r) return null;
      const d = G.ground.whole('d'); const c = d.getContext('2d').getImageData(0, 0, WORLD, WORLD).data; let n = 0; for (let i = 3; i < c.length; i += 4) if (c[i]) n++;
      const res = { legacy: !!G.legacyGround, wreckPixels: n, t: sum(G.ground.whole('t')), d: sum(d) };
      for (let i = 0; i < 30 * 30; i++) update(1 / 30);   // it carries on, and saves again keeping its pictures
      await SaveGame.save({ faction: 'allies', diffKey: 'normal', cam: { x: 0, y: 0, z: 1 }, match: null });
      const again = await SaveGame.load(); res.againLegacy = !!(again && G.legacyGround);
      return res;
    });
    out.oldSave = { old, now, sameGround: !!now && old.t === now.t, sameWreckPixels: !!now && old.wreckPixels === now.wreckPixels };
  }
  console.log(JSON.stringify(out, null, 1));
  console.log('errors', errs.slice(0, 5));
  await ctx.close(); fs.rmSync(dir, { recursive: true, force: true });
})();
