// Bakes the tall crags (look.js cliffPic) of the fixed maps (those traced from a design, `rows` in MAPS) into sheets, so
// the game loads them at the start of a battle instead of making them while you play (look.js CliffSheets): each cell's
// crag trimmed to its rock and packed, a region of the map at a time, into cliffs/<map>/<i>.webp (SHEET px wide);
// cliffs/<map>/index.json gives, per cell with rock, [cell, sheet, x, y, w, h, X0, Y0] (X0, Y0: where its top left
// lies from the cell's middle, view px), and cliffs/manifest.json each map's ground key. The crags' shadows are not here:
// tools/bake-ground.js paints them into the ground. Made by the game's own code in headless Chromium. Lossless WebP (the
// crags are sharp-edged pixels with alpha).
//   node tools/bake-cliffs.js <repo>           bake
//   node tools/bake-cliffs.js <repo> --check   exit 1 if stale (the crags' code or a map changed)
//   --hd (with either): the HD ground's crags (cliffPic at K = 2: 2 px per view px), into cliffs-hd/ (manifest k; index
//   x, y, w, h in the sheet's pixels, X0, Y0 in view px). Rebake with --hd after every ordinary crag rebake.
// Rebake after changing the crags in src/look.js (cliffLookFor, cliffHeight, cliffPts, cliffPic, CLIFF_* numbers),
// paintCliffs / cliffCells in src/art.js, the view (voxel.js VIEW), or a fixed map's layout. A map whose ground key no
// longer matches makes its crags in play as before, so a stale bake never shows the wrong rock.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const args = process.argv.slice(2), HDK = args.includes('--hd') ? 2 : 1, [root, flag] = args.filter((a) => a !== '--hd');
const outDir = path.join(root, HDK > 1 ? 'cliffs-hd' : 'cliffs'), SHEET = HDK > 1 ? 2048 : 1024, BLOCK = 24, QUALITY = 1;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.route(/fonts|supabase|fly\.dev/, (r) => r.abort());
  await p.goto('file://' + path.resolve(root) + '/index.html'); await p.waitForTimeout(800);
  const info = await p.evaluate(() => {
    const src = [cliffLookFor, cliffHeight, cliffPts, cliffPic, mesaShade, paintCliffs, cliffCells, groundPixels, hash3, toView, viewDepth, groundSeed, groundKey, mkCanvas].map(String).join('\n')
      + JSON.stringify([VIEW, VK, CLIFF_UP, CLIFF_TOP, CLIFF_SL, CLIFF_SDX, CLIFF_SDY, CELL]);
    const maps = {};
    for (const id of Object.keys(MAPS)) if (MAPS[id].rows) { newWorld('allies', 'hard', 1, 0, false, id); if (G.cliff && G.cliff.some((v) => v)) maps[id] = { key: groundKey(G) }; }
    return { src, maps };
  });
  const code = crypto.createHash('sha1').update(info.src).update(String(QUALITY) + SHEET + BLOCK + (HDK > 1 ? 'k' + HDK : '')).digest('hex').slice(0, 16);
  if (flag === '--check') {
    let old = null;
    try { old = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8')); } catch (_) {}
    const stale = !old || old.code !== code || Object.keys(info.maps).length !== Object.keys(old.maps).length || Object.keys(info.maps).some((id) => !old.maps[id] || old.maps[id].key !== info.maps[id].key);
    console.log(stale ? `${HDK > 1 ? 'cliffs-hd' : 'cliffs'} STALE: run node tools/bake-cliffs.js <repo>${HDK > 1 ? ' --hd' : ''}` : `${HDK > 1 ? 'cliffs-hd' : 'cliffs'} up to date`);
    await b.close(); process.exit(stale ? 1 : 0);
  }
  fs.rmSync(outDir, { recursive: true, force: true });
  let total = 0;
  for (const id of Object.keys(info.maps)) {
    const dir = path.join(outDir, id); fs.mkdirSync(dir, { recursive: true });
    // Every crag, trimmed, packed into shelves: the cells a BLOCK x BLOCK cell region at a time (so a sheet covers one part
    // of the map), tallest first within a region; a new sheet when SHEET px high is reached.
    const res = await p.evaluate(async ([id, SHEET, BLOCK, q, K]) => {
      newWorld('allies', 'hard', 1, 0, false, id); cliffLook = null;
      const L = cliffLookFor(), items = [];
      for (const c of L.cells.keys()) {
        const pic = cliffPic(L, c, true, K);
        if (!pic) continue;
        const W = pic.c.width, H = pic.c.height, d = pic.c.getContext('2d').getImageData(0, 0, W, H).data;
        let x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x1 < 0) continue;
        const cx = c % MAP, cy = (c / MAP) | 0;
        items.push({ c, pic: pic.c, x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1, X0: pic.X0 + x0 / K, Y0: pic.Y0 + y0 / K, blk: Math.floor(cy / BLOCK) * 1000 + Math.floor(cx / BLOCK) });
      }
      items.sort((a, b) => a.blk - b.blk || b.h - a.h || a.c - b.c);
      const sheets = [], out = [];
      let cv = null, g = null, sx = 0, sy = 0, rowH = 0, usedH = 0;
      const finish = () => { if (!cv) return; const t = document.createElement('canvas'); t.width = SHEET; t.height = usedH; t.getContext('2d').drawImage(cv, 0, 0); sheets.push(t); cv = null; };
      for (const it of items) {
        if (cv && sx + it.w + 1 > SHEET) { sx = 0; sy += rowH + 1; rowH = 0; }
        if (cv && sy + it.h > SHEET) finish();
        if (!cv) { cv = document.createElement('canvas'); cv.width = SHEET; cv.height = SHEET; g = cv.getContext('2d'); sx = 0; sy = 0; rowH = 0; usedH = 0; }
        g.drawImage(it.pic, it.x0, it.y0, it.w, it.h, sx, sy, it.w, it.h);
        out.push(it.c, sheets.length, sx, sy, it.w, it.h, it.X0, it.Y0);
        sx += it.w + 1; rowH = Math.max(rowH, it.h); usedH = Math.max(usedH, sy + it.h);
      }
      finish();
      const files = [];
      for (const s of sheets) {
        const blob = await new Promise((r) => s.toBlob(r, 'image/webp', q));
        const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode(...u.subarray(i, i + 0x8000));
        files.push(btoa(t));
      }
      return { files, pics: out, px: sheets.reduce((a, s) => a + s.width * s.height, 0) };
    }, [id, SHEET, BLOCK, QUALITY, HDK]);
    let sz = 0;
    res.files.forEach((f, i) => { const buf = Buffer.from(f, 'base64'); fs.writeFileSync(path.join(dir, i + '.webp'), buf); sz += buf.length; });
    fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ sheets: res.files.length, pics: res.pics }));
    sz += fs.statSync(path.join(dir, 'index.json')).size; total += sz;
    info.maps[id].files = res.files.length;
    console.log(id, res.files.length, 'sheets,', res.pics.length / 8, 'crags,', (res.px * 4 / 1e6).toFixed(1), 'MB decoded,', (sz / 1e6).toFixed(2), 'MB of files');
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(HDK > 1 ? { code, k: HDK, maps: info.maps } : { code, maps: info.maps }));
  console.log('total', (total / 1e6).toFixed(2), 'MB; code', code);
  await b.close();
})();
