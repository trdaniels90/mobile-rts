// Draws a structure with the game's own renderer, enlarged, to a PNG. Also its two damaged stages.
// node tools/blender/preview-structure.js <repo path> <out.png> <type> [faction] [generated .preview.js]
// env: PREVIEW_S scale (default 6)
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [root, out, type, faction = 'allies', override] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage(); await p.route(/fonts|supabase/, (r) => r.abort());
  await p.goto('file://' + root + '/index.html'); await p.waitForTimeout(800);
  if (override) await p.evaluate(fs.readFileSync(override, 'utf8'));
  const data = await p.evaluate(async ([type, faction, S]) => {
    newWorld(faction, 'normal', 7, 0, false);
    spriteSpend = -1e9;   // no stand-ins: every sprite is made when asked for
    for (let i = 0; i < 3; i++) { if (typeof pumpDamaged === 'function') for (let k = 0; k < 40; k++) pumpDamaged(); await new Promise((r) => setTimeout(r, 60)); }
    const d = BUILD_DEFS[type], W = d.w * CELL + 24, H = d.h * CELL + 96;
    const t = document.createElement('canvas'); t.width = W * 3; t.height = H;
    const tg = t.getContext('2d'); tg.fillStyle = '#5c6b3a'; tg.fillRect(0, 0, t.width, t.height);
    for (let st = 0; st < 3; st++) {
      const x = st * W + 12, y = 80;
      blit(tg, st ? damagedSprite(type, faction, st, undefined) : structureSprite(type, faction), x, y);
      const head = HEADS[type]; if (head) blit(tg, headSprite(type, faction, 0.6, st), x + head[1], y + head[2] - head[3] * VK, false);
    }
    const c = document.createElement('canvas'); c.width = t.width * S; c.height = H * S;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(t, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }, [type, faction, +(process.env.PREVIEW_S || 6)]);
  fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
  await b.close();
})();
