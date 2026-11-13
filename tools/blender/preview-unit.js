// Draws a unit (hull + turret, 8 facings) with the game's own renderer, enlarged, to a PNG.
// node tools/blender/preview-unit.js <repo path> <out.png> <unit type> [faction] [generated .preview.js]
// env: PREVIEW_S scale (default 6), PREVIEW_PICK facings 0-7, e.g. 0,2,5
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [root, out, type, faction = 'allies', override] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage(); await p.route(/fonts|supabase/, (r) => r.abort());
  await p.goto('file://' + root + '/index.html'); await p.waitForTimeout(800);
  if (override) await p.evaluate(fs.readFileSync(override, 'utf8'));
  const data = await p.evaluate(([type, faction, S, pick]) => {
    const W = 44, H = 44, N = pick.length;
    const t = document.createElement('canvas'); t.width = W * N; t.height = H;
    const tg = t.getContext('2d'); tg.fillStyle = '#5c6b3a'; tg.fillRect(0, 0, t.width, t.height);
    const c = document.createElement('canvas'); c.width = t.width * S; c.height = H * S;
    const g = c.getContext('2d');
    const d = UNIT_DEFS[type], pal = palFor(faction);
    spriteSpend = -1e9;   // no stand-ins: every facing with its own sprite
    pick.forEach((k, i) => {
      const a = k * Math.PI * 2 / 8, u = { def: d, type, faction, face: a, tface: a, x: i * W + W / 2, y: H / 2 + 4 };
      blit(tg, hullSprite(u, pal), u.x, u.y);
      const ts = turretSprite(u, pal);
      if (ts) { const z = turretZ(d) * VK, off = d.draw === 'jeep' ? -3 : -1; blit(tg, ts, u.x + Math.cos(a) * off, u.y + Math.sin(a) * off - z, false); }
    });
    g.imageSmoothingEnabled = false; g.drawImage(t, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }, [type, faction, +(process.env.PREVIEW_S || 6), (process.env.PREVIEW_PICK || '0,1,2,3,4,5,6,7').split(',').map(Number)]);
  fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
  await b.close();
})();
