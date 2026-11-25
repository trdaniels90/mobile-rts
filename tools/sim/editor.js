// The map editor (src/editor.js), end to end in headless Chromium: a new 96 map painted through the real pointer handlers
// (water, bridge, ore, trees, gems, two starts, a plateau, a square, a plot, houses, a church, a lamp), checked, saved, picked on
// the skirmish screen and played; after a reload the map is still there and Explore opens it. Screenshots ed1.png (editor) and
// ed2.png (battle) go to <out dir>. node tools/sim/editor.js <repo> [out dir]
const { chromium } = require('playwright');
(async () => {
  const root = require('path').resolve(process.argv[2] || '.'), out = process.argv[3] || require('os').tmpdir();
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1200, height: 900 } }); const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await pg.route(/fonts|supabase\.co|fly\.dev/, (r) => r.abort());
  await pg.goto('file://' + root + '/index.html'); await pg.waitForTimeout(600);
  await pg.click('#editorBtn'); await pg.waitForTimeout(300);
  // new 96 map
  await pg.click('[data-ed="maps"]'); await pg.selectOption('[data-ed-size]', '96'); await pg.click('[data-ed="new"]'); await pg.waitForTimeout(300);
  const r = await pg.evaluate(() => { const c = document.querySelector('#editor canvas').getBoundingClientRect(); return [c.left, c.top, c.width, c.height]; });
  const N = 96, z = Math.min(r[2], r[3]) / N * 0.95, cx0 = N / 2 - r[2] / z / 2, cy0 = N / 2 - r[3] / z / 2;
  const P = (x, y) => [r[0] + (x + 0.5 - cx0) * z, r[1] + (y + 0.5 - cy0) * z];
  const tool = (k) => pg.click(`[data-tool="${k}"]`);
  const stroke = async (pts) => { await pg.mouse.move(...P(...pts[0])); await pg.mouse.down(); for (const p of pts.slice(1)) await pg.mouse.move(...P(...p), { steps: 8 }); await pg.mouse.up(); };
  const tapAt = async (x, y) => { await pg.mouse.click(...P(x, y)); };
  await tool('~'); await pg.click('[data-brush="5"]'); await stroke([[48, 0], [48, 40]]); await stroke([[48, 56], [48, 95]]);
  await tool('='); await pg.click('[data-brush="3"]'); await stroke([[42, 48], [54, 48]]);
  await tool('o'); await pg.click('[data-brush="3"]'); await stroke([[20, 70], [28, 72]]); await stroke([[70, 22], [78, 24]]);
  await tool('T'); await pg.click('[data-brush="2"]'); await stroke([[10, 40], [30, 45]]);
  await tool('gem'); await tapAt(30, 30); await tapAt(66, 66);
  await tool('start'); await pg.click('[data-team="0"]'); await tapAt(16, 80); await pg.click('[data-team="1"]'); await tapAt(80, 16);
  await tool('mesa'); await pg.click('[data-plat="6"]'); await stroke([[24, 24], [24, 12]]);
  await tool('square'); await stroke([[60, 60], [69, 69]]);
  await tool('lot'); await stroke([[60, 72], [68, 78]]);
  await tool('house'); await tapAt(73, 62); await tapAt(73, 67);
  await tool('church'); await tapAt(64, 55);
  await tool('lamp'); await tapAt(59, 59);
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: out + '/ed1.png' });
  const chk = await pg.evaluate(() => MapEditor.check());
  console.log('check', JSON.stringify(chk));
  await pg.click('[data-ed="save"]'); await pg.waitForTimeout(300);
  const saved = await pg.evaluate(() => { const id = MapEditor.state.id; const m = MAPS[id]; return { id, n: MAP_LIST.length, houses: (m.houses || []).length, lots: (m.lots || []).length, sq: (m.squares || []).length, mesas: (m.mesas || []).length, spawns: m.spawns, team: m.teamSize }; });
  console.log('saved', JSON.stringify(saved));
  await pg.click('[data-ed="play"]'); await pg.waitForTimeout(400);
  const vis = await pg.evaluate((id) => !!document.querySelector(`#maps [data-map="${id}"][aria-pressed="true"]`), saved.id);
  console.log('selected on skirmish screen', vis);
  await pg.click('#maps [data-map-go]'); await pg.waitForTimeout(6000);
  const game = await pg.evaluate(() => ({ map: G.mapId, size: MAP, houses: G.houses.length, ore: G.oreFields.length, teams: G.teams.map((t) => t.start), hgtMax: Math.max(...G.hgt), bridges: G.bridges.length }));
  console.log('game', JSON.stringify(game));
  await pg.evaluate(() => { for (let i = 0; i < 600; i++) __ps.update(1 / 30); });
  await pg.screenshot({ path: out + '/ed2.png' });
  // reload: the map is still there, Explore it from the editor
  await pg.reload(); await pg.waitForTimeout(800);
  console.log('after reload', await pg.evaluate((id) => !!MAPS[id] && MAP_LIST.includes(id), saved.id));
  await pg.click('#editorBtn'); await pg.waitForTimeout(300);
  console.log('draft back', await pg.evaluate(() => MapEditor.state.id));
  await pg.click('[data-ed="explore"]'); await pg.waitForTimeout(5000);
  console.log('explore', await pg.evaluate(() => ({ map: G.mapId, explore: !!G.explore, houses: G.houses.length })));
  console.log('errors', errs.slice(0, 8));
  await b.close();
})();
