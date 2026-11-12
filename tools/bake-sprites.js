// Bakes the game's sprites into image sheets (sprites/*.webp and sprites/manifest.json), so the game loads finished
// pictures instead of rendering voxel models while you play (models.js SpriteSheets). Every unit in every facing, look
// and soldier pose, every structure, in each team colour (both factions, the teammate colours of 2 v 2 and 3 v 3), and
// the burnt hulls and turrets of wrecks. Rendered by the game's own code in headless Chromium, so they match exactly.
//   node tools/bake-sprites.js <repo>           bake
//   node tools/bake-sprites.js <repo> --check   exit 1 if the sheets are stale (models, voxel renderer or colours changed)
// Rebake after changing src/models.js, src/voxel.js or FACTIONS colours in src/data.js (the release checklist runs --check).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [root, flag] = process.argv.slice(2);
const outDir = path.join(root, 'sprites');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.route(/fonts|supabase|fly\.dev/, (r) => r.abort());
  await p.goto('file://' + path.resolve(root) + '/index.html'); await p.waitForTimeout(800);
  const colours = await p.evaluate(() => JSON.stringify([FACTIONS, BURNT]));
  const hash = crypto.createHash('sha1').update(fs.readFileSync(path.join(root, 'src/models.js'))).update(fs.readFileSync(path.join(root, 'src/voxel.js'))).update(colours).digest('hex').slice(0, 16);
  if (flag === '--check') {
    let old = null;
    try { old = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8')).hash; } catch (_) {}
    console.log(old === hash ? 'sprites up to date' : `sprites STALE (baked ${old}, now ${hash}): run node tools/bake-sprites.js <repo>`);
    await b.close(); process.exit(old === hash ? 0 : 1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) fs.unlinkSync(path.join(outDir, f));
  // Each set: the sprites one palette makes (faction and variant), or the burnt ones. Rendered in the page, packed
  // into a sheet there, sent back as lossless WebP (PNG if WebP does not come back pixel for pixel).
  const sets = [];
  for (const faction of ['allies', 'soviets']) for (const v of [0, 1, 2]) sets.push({ faction, v });
  sets.push({ burnt: true });
  const manifest = { hash, sheets: [] };
  let total = 0;
  for (const set of sets) {
    const r = await p.evaluate(async (set) => {
      spriteSpend = -1e9;
      const before = new Set(spriteCache2.keys());
      const keep = drawVar;
      drawVar = set.v || 0;
      const T = Math.PI * 2;
      try {
        if (set.burnt) {
          for (const def of Object.values(UNIT_DEFS)) {
            if (def.cls === 'inf' || def.cls === 'air') continue;
            for (let i = 0; i < FACINGS; i++) { const a = i * T / FACINGS; hullSprite({ def, face: a, tface: a, load: 0 }, BURNT); turretSprite({ def, tface: a }, BURNT); }
          }
        } else {
          const f = set.faction, pal = () => palFor(f);
          for (const [type, def] of Object.entries(UNIT_DEFS)) {
            if (!def.factions.includes(f)) continue;
            if (def.cls === 'inf') { for (let pose = 0; pose < 16; pose++) for (let i = 0; i < 16; i++) infSprite({ type, faction: f, face: i * T / 16 }, pal(), pose); continue; }
            const looks = def.draw === 'v2' ? [{ cd: 0 }, { cd: 2 }] : def.draw === 'harv' ? [{ load: 0 }, { load: def.capacity }] : [{}];
            for (let i = 0; i < FACINGS; i++) {
              const a = i * T / FACINGS;
              for (const l of looks) hullSprite({ def, faction: f, face: a, ...l }, pal());
              turretSprite({ def, faction: f, tface: a }, pal());
            }
          }
          for (const type of Object.keys(BUILD_DEFS)) if (BUILD_DEFS[type].factions.includes(f)) { try { structureSprite(type, f); } catch (_) {} }
        }
      } finally { drawVar = keep; }
      const keys = [...spriteCache2.keys()].filter((k) => !before.has(k));
      // Shelf packing, tallest first, 2048 wide, a pixel of space round each picture.
      const pics = [];
      for (const k of keys) { const s = spriteCache2.get(k); pics.push({ k, c: s.img, part: 'img' }); if (s.sh) pics.push({ k, c: s.sh, part: 'sh' }); }
      pics.sort((a, b) => b.c.height - a.c.height);
      const W = 2048; let x = 0, y = 0, rowH = 0;
      for (const q of pics) { if (x + q.c.width + 1 > W) { x = 0; y += rowH + 1; rowH = 0; } q.x = x; q.y = y; x += q.c.width + 1; rowH = Math.max(rowH, q.c.height); }
      const sheet = document.createElement('canvas'); sheet.width = W; sheet.height = y + rowH; const g = sheet.getContext('2d');
      for (const q of pics) g.drawImage(q.c, q.x, q.y);
      const at = new Map(pics.map((q) => [q.k + '/' + q.part, q]));
      const entries = keys.map((k) => {
        const s = spriteCache2.get(k), a = at.get(k + '/img'), e = [k, a.x, a.y, s.img.width, s.img.height, s.ox, s.oy];
        if (s.sh) { const h = at.get(k + '/sh'); e.push(h.x, h.y, s.sh.width, s.sh.height, s.sox, s.soy); }
        return e;
      });
      // Lossless WebP if it decodes back to the same pixels, else PNG.
      const toB64 = async (blob) => { const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
      const same = async (blob) => {
        const bmp = await createImageBitmap(blob), c = document.createElement('canvas'); c.width = W; c.height = sheet.height;
        const cg = c.getContext('2d'); cg.drawImage(bmp, 0, 0);
        const a = g.getImageData(0, 0, W, sheet.height).data, bb = cg.getImageData(0, 0, W, sheet.height).data;
        // Solid pixels exact; see-through edge pixels within 4/255 (the canvas keeps colours premultiplied by alpha).
        for (let i = 0; i < a.length; i++) { const al = a[i + 3 - (i % 4)]; if (al === 255 ? a[i] !== bb[i] : al && Math.abs(a[i] - bb[i]) > 4) return false; }
        return true;
      };
      let blob = await new Promise((res) => sheet.toBlob(res, 'image/webp', 1)), ext = 'webp';
      if (!blob || blob.type !== 'image/webp' || !(await same(blob))) { blob = await new Promise((res) => sheet.toBlob(res, 'image/png')); ext = 'png'; }
      return { entries, w: W, h: sheet.height, ext, data: await toB64(blob) };
    }, set);
    const name = (set.burnt ? 'burnt' : set.faction + set.v) + '.' + r.ext;
    const buf = Buffer.from(r.data, 'base64');
    fs.writeFileSync(path.join(outDir, name), buf);
    total += buf.length;
    manifest.sheets.push({ file: name, w: r.w, h: r.h, sprites: r.entries });
    console.log(name, r.entries.length, 'sprites,', r.w + 'x' + r.h, (buf.length / 1e6).toFixed(2), 'MB');
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest));
  console.log('total', (total / 1e6).toFixed(2), 'MB; manifest', (fs.statSync(path.join(outDir, 'manifest.json')).size / 1e3).toFixed(0), 'KB; hash', hash);
  await b.close();
})();
