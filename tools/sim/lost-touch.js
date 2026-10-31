const { chromium, devices } = require('playwright');
// A finger whose "lifted" event is lost, then an ordinary one-finger drag. node ghosttouch.js <repo>
(async () => {
  const [root] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await (await b.newContext({ ...devices['iPhone 13 landscape'] })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route(/fonts|supabase/, (r) => r.abort());
  await p.goto('file://' + root + '/index.html'); await p.tap('#startBtn'); await p.tap('#maps [data-map-go]'); await p.waitForTimeout(1000);
  const r = await p.evaluate(() => {
    const c = document.querySelector('canvas');
    const ev = (type, id, x, y, primary) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: primary, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    const cam = window.__ps.cam;
    // A finger goes down and its pointerup never arrives (an alert, a swipe from the screen edge...).
    ev('pointerdown', 7, 300, 200, true);
    // Later, a fresh one-finger drag.
    const z0 = cam.z, x0 = cam.x;
    ev('pointerdown', 8, 400, 200, true);
    for (let i = 1; i <= 10; i++) ev('pointermove', 8, 400 - i * 15, 200, true);
    ev('pointerup', 8, 250, 200, true);
    return { zoomChanged: +(cam.z - z0).toFixed(3), panned: +(cam.x - x0).toFixed(1) };
  });
  console.log(JSON.stringify(r), errs.slice(0, 2)); await b.close();
})();
