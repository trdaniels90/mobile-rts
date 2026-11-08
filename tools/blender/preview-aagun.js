// Draws the AA Gun (base + head, 8 facings) with the game's own renderer, enlarged, to a PNG.
// node tools/blender/preview-aagun.js <repo path> <out.png> [allies|soviets] [generated aagun.preview.js]
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [root, out, faction = 'allies', override] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage(); await p.route(/fonts|supabase/, (r) => r.abort());
  await p.goto('file://' + root + '/index.html'); await p.waitForTimeout(800);
  if (override) await p.evaluate(fs.readFileSync(override, 'utf8'));   // generated models replace the game's
  const data = await p.evaluate(([faction, S0, pick]) => {
    const S = S0, N = pick.length, W = 40, H = 40;
    const c = document.createElement('canvas'); c.width = W * N * S; c.height = H * S;
    const g = c.getContext('2d'); g.fillStyle = '#5c6b3a'; g.fillRect(0, 0, c.width, c.height);
    const t = document.createElement('canvas'); t.width = W * N; t.height = H;
    const tg = t.getContext('2d');
    const head = HEADS.aagun;
    for (let i = 0; i < N; i++) {
      const x = i * W + 8, y = 12, a = pick[i] * Math.PI * 2 / 8;
      blit(tg, structureSprite('aagun', faction), x, y);
      blit(tg, headSprite('aagun', faction, a, 0), x + head[1], y + head[2] - head[3] * VK, false);
    }
    g.imageSmoothingEnabled = false; g.drawImage(t, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }, [faction, +(process.env.PREVIEW_S || 6), (process.env.PREVIEW_PICK || '0,1,2,3,4,5,6,7').split(',').map(Number)]);
  fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
  await b.close();
})();
