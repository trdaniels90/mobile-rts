const { chromium } = require('playwright');
const fs = require('fs');
// Frames of tools/look/webgl-light.html (real-time lighting demo: top the game's way now, bottom WebGL), 30 a second:
//   node tools/look/record-webgl.js <repo> <out dir> [seconds]     then ffmpeg -framerate 30 -i <out>/%04d.png ...
const [root, out, secs = '10.5'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 960, height: 1080 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + root + '/tools/look/webgl-light.html'); await p.waitForTimeout(1500);
  fs.mkdirSync(out, { recursive: true });
  for (let f = 0; f < +secs * 30; f++) { await p.evaluate((t) => window.frame(t), f / 30); await p.screenshot({ path: `${out}/${String(f).padStart(4, '0')}.png` }); }
  console.log('errors', errs); await b.close();
})();
