// Draws maps/<id>.png for every map in MAPS (the map screen's picture). node tools/make-map-previews.js <repo path>
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const root = process.argv[2];
  const b = await chromium.launch();
  const p = await b.newPage(); await p.route(/fonts|supabase/, (r) => r.abort());
  await p.goto('file://' + root + '/index.html'); await p.waitForTimeout(800);
  const out = await p.evaluate(() => MAP_LIST.map((id) => {
    newWorld('allies', 'normal', 7, 0, false, id);
    const S = 4, c = document.createElement('canvas'); c.width = c.height = MAP * S;
    const g = c.getContext('2d');
    for (let i = 0; i < NCELLS; i++) { g.fillStyle = TERRAIN_MINI[G.terr[i]]; g.fillRect(cellX(i) * S, cellY(i) * S, S, S); }
    for (const sp of G.spawns) { g.fillStyle = '#e8c24a'; g.beginPath(); g.arc((sp.cx + 0.5) * S, (sp.cy + 0.5) * S, 6, 0, 7); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 2; g.stroke(); }   // the start positions
    return { id, data: c.toDataURL('image/png') };
  }));
  for (const m of out) fs.writeFileSync(`${root}/maps/${m.id}.png`, Buffer.from(m.data.split(',')[1], 'base64'));
  console.log(out.map((m) => m.id));
  await b.close();
})();
