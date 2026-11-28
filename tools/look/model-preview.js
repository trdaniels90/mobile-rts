// A unit or structure drawn with the game's own renderer, as HD graphics bakes it (tools/hd-vox.js, models at 4x detail,
// 2 pixels per world pixel) or the classic way, enlarged, on grass, to a PNG. For judging a model's detail.
//   node tools/look/model-preview.js <repo> <out.png> <type> [faction=soviets] [hd=1] [scale=3]
// A unit: hull and turret at four facings (env PICK, facings 0-7, default 1,3,5,7). A structure: the whole of it, healthy.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const [root, out, type, faction = 'soviets', hd = '1', scale = '3'] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage(); await p.route(/fonts|supabase/, (r) => r.abort());
  await p.goto('file://' + root + '/index.html'); await p.waitForTimeout(800);
  if (hd === '1') {
    await p.addScriptTag({ path: path.join(root, 'tools/hd-vox.js') });
    await p.evaluate(() => installHdVox(4, 2));
  }
  const data = await p.evaluate(([type, faction, S, pick]) => {
    spriteSpend = -1e9; spriteCache2.clear(); modelCache.clear();
    const K = 2, put = (g, s, x, y, shadow) => {
      const k = s.img._k || 1;
      if (shadow !== false && s.sh) { g.globalAlpha = 0.45; g.drawImage(s.sh, x + s.sox, y + s.soy, s.sh.width / (s.sh._k || 1), s.sh.height / (s.sh._k || 1)); g.globalAlpha = 1; }
      g.drawImage(s.img, x + s.ox, y + s.oy, s.img.width / k, s.img.height / k);
    };
    const unit = UNIT_DEFS[type], pal = palFor(faction);
    const st = unit ? null : structureSprite(type, faction), sk = st ? st.img._k || 1 : 1;
    const W = unit ? 52 : st.img.width / sk + 40, H = unit ? 46 : st.img.height / sk + 12, N = unit ? pick.length : 1;
    const t = document.createElement('canvas'); t.width = W * N * K; t.height = H * K;
    const g = t.getContext('2d'); g.fillStyle = '#5c6b3a'; g.fillRect(0, 0, t.width, t.height); g.scale(K, K); g.imageSmoothingEnabled = true;
    if (unit) {
      pick.forEach((f, i) => {
        const a = f * Math.PI * 2 / 8, u = { def: unit, type, faction, face: a, tface: a, x: i * W + W / 2, y: H / 2 + 6 };
        put(g, hullSprite(u, pal), u.x, u.y);
        const ts = turretSprite(u, pal);
        if (ts) { const z = turretZ(unit) * VK; put(g, ts, u.x - Math.cos(a), u.y - Math.sin(a) - z, false); }
      });
    } else {
      put(g, st, 6 - st.ox, 6 - st.oy);
    }
    const c = document.createElement('canvas'); c.width = t.width * S / K; c.height = t.height * S / K;
    const cg = c.getContext('2d'); cg.imageSmoothingEnabled = false; cg.drawImage(t, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }, [type, faction, +scale, (process.env.PICK || '1,3,5,7').split(',').map(Number)]);
  fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
  await b.close();
})();
