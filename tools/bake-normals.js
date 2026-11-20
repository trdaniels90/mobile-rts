// Bakes the normal maps of the baked sprites (WebGL renderer, branch claude/webgl): normals/<sheet>.webp, each in the same
// layout as sprites/<sheet> (the same spot for every picture), and normals/manifest.json. The game loads them with the
// sprite sheets when WebGL draws (art.js SpriteSheets), so a picture's normal map is not worked out while you play
// (gl.js nrmPic, at most 3 ms a frame). Worked out by gl.js's own nrmPic in headless Chromium, from the same models.
// Red, green: the surface's direction turned with the view; blue: height; alpha 0 where there is none (pictures not from
// one voxel model, cast shadows).
//   node tools/bake-normals.js <repo>           bake (after tools/bake-sprites.js)
//   node tools/bake-normals.js <repo> --check   exit 1 if stale (the sprites were rebaked, or nrmPic changed)
// The sprites are rendered here as tools/bake-sprites.js renders them (the same sets; keep them in step): every picture
// in sprites/manifest.json must come out again at the same size, or the bake stops.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [root, flag] = process.argv.slice(2);
const outDir = path.join(root, 'normals');

(async () => {
  const sm = JSON.parse(fs.readFileSync(path.join(root, 'sprites/manifest.json'), 'utf8'));
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  await p.route(/fonts|supabase|fly\.dev/, (r) => r.abort());
  await p.goto('file://' + path.resolve(root) + '/index.html'); await p.waitForTimeout(800);
  const src = await p.evaluate(() => GLR.nrmPic ? GLR.nrmPic.toString() : '');
  if (!src) { console.log('gl.js nrmPic not found'); await b.close(); process.exit(1); }
  const hash = crypto.createHash('sha1').update(sm.hash).update(src).digest('hex').slice(0, 16);
  if (flag === '--check') {
    let old = null;
    try { old = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8')).hash; } catch (_) {}
    console.log(old === hash ? 'normals up to date' : `normals STALE (baked ${old}, now ${hash}): run node tools/bake-normals.js <repo>`);
    await b.close(); process.exit(old === hash ? 0 : 1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) fs.unlinkSync(path.join(outDir, f));
  const manifest = { hash, sprites: sm.hash, sheets: [] };
  let total = 0;
  const layouts = new Map();   // (a sheet laid out as one already baked, as the team colours are: the same normal maps)
  for (const sh of sm.sheets) {
    const lay = JSON.stringify(sh.sprites.map((e) => e.slice(1, 5))) + sh.w + 'x' + sh.h;
    if (layouts.has(lay)) { manifest.sheets.push({ file: layouts.get(lay), of: sh.file }); console.log(sh.file, 'as', layouts.get(lay)); continue; }
    const name = sh.file.split('.')[0], set = name === 'burnt' ? { burnt: true } : { faction: name.slice(0, -1), v: +name.slice(-1) };
    const r = await p.evaluate(async ({ set, sh }) => {
      spriteSpend = -1e9;
      const keep = drawVar;
      drawVar = set.v || 0;
      const T = Math.PI * 2;
      try {   // (as tools/bake-sprites.js)
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
            const looks = def.draw === 'v2' ? [0, 1, 2, 3].flatMap((k) => [{ cd: 0, setup: k / 3 }, { cd: 2, setup: k / 3 }]) : def.draw === 'harv' ? [{ load: 0 }, { load: def.capacity }]
              : def.type === 'comanche' ? [0, 1, 2].map((k) => ({ bay: k / 2 })) : [{}];
            for (let i = 0; i < FACINGS; i++) {
              const a = i * T / FACINGS;
              for (const l of looks) hullSprite({ def, faction: f, face: a, ...l }, pal());
              turretSprite({ def, faction: f, tface: a }, pal());
              if (def.draw === 'apc') turretSprite({ def, faction: f, tface: a, fireT: 1, shots: 1 }, pal());
            }
          }
          for (const type of Object.keys(BUILD_DEFS)) if (BUILD_DEFS[type].factions.includes(f)) { try { structureSprite(type, f); } catch (_) {} }
        }
      } finally { drawVar = keep; }
      const sheet = document.createElement('canvas'); sheet.width = sh.w; sheet.height = sh.h; const g = sheet.getContext('2d');
      let n = 0, none = 0, odd = 0;
      for (const e of sh.sprites) {
        const s = spriteCache2.get(e[0]);
        if (!s) return { err: 'picture ' + e[0] + ' did not come out: run tools/bake-sprites.js first, or bring this tool in step with it' };
        if (s.img.width !== e[3] || s.img.height !== e[4]) { none++; odd++; continue; }   // (drawn differently on this branch than baked, as some structures: no normal map, as at run time)
        const c = GLR.nrmPic(s.img);
        if (c) { g.drawImage(c, e[1], e[2]); n++; } else none++;
      }
      const toB64 = async (blob) => { const u = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(t); };
      const blob = await new Promise((res) => sheet.toBlob(res, 'image/webp', 1));
      return { n, none, odd, ext: blob.type === 'image/webp' ? 'webp' : 'png', data: await toB64(blob.type === 'image/webp' ? blob : await new Promise((res) => sheet.toBlob(res, 'image/png'))) };
    }, { set, sh });
    if (r.err) { console.log(r.err); await b.close(); process.exit(1); }
    const file = name + '.' + r.ext, buf = Buffer.from(r.data, 'base64');
    fs.writeFileSync(path.join(outDir, file), buf);
    total += buf.length;
    manifest.sheets.push({ file, of: sh.file }); layouts.set(lay, file);
    console.log(file, r.n, 'normal maps,', r.none, 'without (' + r.odd + ' not as baked),', (buf.length / 1e6).toFixed(2), 'MB');
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest));
  console.log('total', (total / 1e6).toFixed(2), 'MB; hash', hash);
  await b.close();
})();
