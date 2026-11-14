// Bakes the ground of the fixed maps (those traced from a design, `rows` in MAPS) into pictures, so the game shows
// them instead of painting the ground while you play (art.js GroundSheets, makeGround): grounds/<map>/<i>.webp, the
// ground in GROUND_SHEET squares row by row (bridges and scenery included, no marks of battle), grounds/<map>/preview.webp
// at a quarter size (the stand-in while a sheet loads), and grounds/manifest.json. Painted by the game's own code in
// headless Chromium. Lossy WebP: the ground is noisy, so lossless would be several times the size.
//   node tools/bake-ground.js <repo>           bake
//   node tools/bake-ground.js <repo> --check   exit 1 if stale (the ground painter, scenery models or a map changed)
// Rebake after changing the ground painting in src/art.js (groundPixels, groundPainter and the functions they call),
// scenery in src/models.js / src/voxel.js, or a fixed map's layout. A map whose layout changed without a rebake is
// painted as before (its `key` no longer matches), so a stale bake never shows the wrong ground.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [root, flag] = process.argv.slice(2);
const outDir = path.join(root, 'grounds'), QUALITY = 0.8;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.route(/fonts|supabase|fly\.dev/, (r) => r.abort());
  await p.goto('file://' + path.resolve(root) + '/index.html'); await p.waitForTimeout(800);
  // What the ground is painted with: the painting functions' source, scenery (models.js, voxel.js), and each map's key.
  const info = await p.evaluate(() => {
    const src = [rng, groundPixels, groundPainter, cliffCells, paintCliffs, paintRuts, fordStone, concreteBridge, groundSeed, groundKey].map(String).join('\n');
    const maps = {};
    for (const id of Object.keys(MAPS)) if (MAPS[id].rows) { newWorld('allies', 'hard', 1, 0, false, id); maps[id] = { key: groundKey(G), size: WORLD, sheet: GROUND_SHEET }; }
    return { src, maps };
  });
  const code = crypto.createHash('sha1').update(info.src).update(fs.readFileSync(path.join(root, 'src/models.js'))).update(fs.readFileSync(path.join(root, 'src/voxel.js'))).update(String(QUALITY)).digest('hex').slice(0, 16);
  if (flag === '--check') {
    let old = null;
    try { old = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8')); } catch (_) {}
    const stale = !old || old.code !== code || Object.keys(info.maps).some((id) => !old.maps[id] || old.maps[id].key !== info.maps[id].key);
    console.log(stale ? 'grounds STALE: run node tools/bake-ground.js <repo>' : 'grounds up to date');
    await b.close(); process.exit(stale ? 1 : 0);
  }
  fs.rmSync(outDir, { recursive: true, force: true });
  let total = 0;
  for (const id of Object.keys(info.maps)) {
    const dir = path.join(outDir, id); fs.mkdirSync(dir, { recursive: true });
    const n = await p.evaluate((id) => {
      newWorld('allies', 'hard', 1, 0, false, id);
      window.__painter = groundPainter(G.terr, groundSeed(G), G.road, G.bridges, G.cliff, G.ford, mapTheme(id), MAPS[id].bridge);
      window.__pv = mkCanvas(Math.ceil(WORLD / 4), Math.ceil(WORLD / 4));
      return Math.ceil(WORLD / GROUND_SHEET);
    }, id);
    const toB64 = 'async (blob) => { const u = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }';
    for (let i = 0; i < n * n; i++) {
      const data = await p.evaluate(async ([i, n, q, toB64]) => {
        const S = GROUND_SHEET, x = (i % n) * S, y = Math.floor(i / n) * S, w = Math.min(S, WORLD - x), h = Math.min(S, WORLD - y);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        window.__painter.paint(c.getContext('2d'), x, y, w, h, 0, 0);
        const pg = window.__pv.getContext('2d'); pg.imageSmoothingEnabled = true; pg.imageSmoothingQuality = 'high';
        pg.drawImage(c, 0, 0, w, h, x / 4, y / 4, w / 4, h / 4);
        return (eval(toB64))(await new Promise((r) => c.toBlob(r, 'image/webp', q)));
      }, [i, n, QUALITY, toB64]);
      const buf = Buffer.from(data, 'base64'); fs.writeFileSync(path.join(dir, i + '.webp'), buf); total += buf.length;
    }
    const pv = Buffer.from(await p.evaluate(async ([q, toB64]) => (eval(toB64))(await new Promise((r) => window.__pv.toBlob(r, 'image/webp', q))), [QUALITY, toB64]), 'base64');
    fs.writeFileSync(path.join(dir, 'preview.webp'), pv); total += pv.length;
    info.maps[id].files = n * n;
    const sz = fs.readdirSync(dir).reduce((a, f) => a + fs.statSync(path.join(dir, f)).size, 0);
    console.log(id, n * n, 'sheets +preview,', (sz / 1e6).toFixed(2), 'MB');
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ code, maps: info.maps }));
  console.log('total', (total / 1e6).toFixed(2), 'MB; code', code);
  await b.close();
})();
