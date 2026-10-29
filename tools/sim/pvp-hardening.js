const { chromium, devices } = require('playwright');
// Online play when things go wrong: a dropped connection (both hold, then reconnect and catch up),
// a phone going to sleep, a surrender, a rematch over the same connection, and an opponent who
// never comes back. Uses the real Supabase Realtime for the room code.
// node tools/sim/pvp-hardening.js <repo>
(async () => {
  const [root] = process.argv.slice(2);
  const b = await chromium.launch();
  const open = async (tag) => {
    const p = await (await b.newContext({ ...devices['iPhone 13 landscape'] })).newPage();
    p.errs = []; p.on('pageerror', (e) => p.errs.push(tag + ': ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]));
    await p.route(/fonts|supabase\.co\/(rest|auth)/, (r) => r.abort());
    await p.goto('file://' + root + '/index.html');
    await p.tap('#onlineBtn');
    return p;
  };
  const A = await open('host'), B = await open('guest'), out = {};
  const state = (p) => p.evaluate(() => ({ role: Net.role, waiting: Net.waiting, hold: !!(G && G.hold), connected: !!(Net.lobby && Net.lobby.connected), over: G.over && G.over.how, ents: G.entities.length, t: Math.round(G.t),
    overlay: !document.getElementById('netWait').hidden ? document.querySelector('#netWait .nw-title').textContent : null, hud: document.getElementById('netHud') && !document.getElementById('netHud').hidden ? document.getElementById('netHud').textContent : null }));
  const until = async (p, fn, ms = 30000) => { const t = Date.now(); await p.waitForFunction(fn, null, { timeout: ms }); return Date.now() - t; };
  const start = async () => {
    await A.waitForFunction(() => Net.lobby && Net.lobby.guest, null, { timeout: 10000 });
    await A.tap('[data-on=start]');
    try { await until(B, () => Net.role === 'guest' && G.entities.length > 0, 10000); }
    catch (e) { console.log('start failed', JSON.stringify([await state(A), await state(B), A.errs, B.errs])); throw e; }
  };
  await A.tap('[data-on=host]'); await A.waitForSelector('.on-code');
  await B.fill('#onCode', await A.textContent('.on-code')); await B.tap('#online form button[type=submit]');
  await A.waitForSelector('[data-on=start]', { timeout: 30000 });
  await start();
  await A.waitForTimeout(3000);
  out.playing = [await state(A), await state(B)];

  // 1. The guest's connection drops: both hold, then reconnect through the room code and catch up.
  await B.evaluate(() => Net.test.drop());
  out.dropped = [await state(A), await state(B)];
  out.reconnectMs = await until(A, () => Net.lobby.connected && !Net.waiting, 40000);
  await B.waitForFunction(() => !Net.waiting, null, { timeout: 10000 });
  await A.waitForTimeout(1500);
  out.afterReconnect = [await state(A), await state(B)];
  out.resyncs = await B.evaluate(() => Net.test.resyncs);
  out.sameAfter = await (async () => { const h = await A.evaluate(() => G.entities.filter((e) => e.team === 1).map((e) => e.id).sort().join()); const g = await B.evaluate(() => G.entities.filter((e) => e.team === 1).map((e) => e.id).sort().join()); return h === g; })();

  // 2. The host's phone goes to sleep for a moment, then comes back.
  const hide = (p, on) => p.evaluate((on) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => on }); document.dispatchEvent(new Event('visibilitychange')); }, on);
  await hide(A, true); await B.waitForTimeout(800);
  out.away = await state(B);
  await hide(A, false); await B.waitForTimeout(800);
  out.back = await state(B);

  // 3. The guest surrenders from the menu (Quit mission, tapped twice).
  await B.evaluate(() => document.getElementById('menuBtn').click());
  await B.waitForTimeout(300);
  out.menuSub = await B.textContent('#menuSub');
  await B.tap('#quitBtn'); await B.tap('#quitBtn');
  await A.waitForTimeout(3500);
  out.surrender = [await A.evaluate(() => [document.querySelector('#dbTitle').textContent, document.querySelector('.db-kick').textContent]), await B.evaluate(() => [document.querySelector('#dbTitle').textContent, document.querySelector('.db-kick').textContent])];

  // 4. Rematch: both back in the lobby, still connected; the host starts again.
  await A.tap('.db-rematch'); await B.tap('.db-rematch');
  await A.waitForSelector('[data-on=start]', { timeout: 5000 });
  out.lobbyAgain = await B.evaluate(() => !!document.querySelector('.on-lobby'));
  await start();
  await A.waitForTimeout(2000);
  out.rematch = [await state(A), await state(B)];

  // 5. The guest vanishes for good (no goodbye): after the wait the host wins.
  await A.evaluate(() => Net.test.waitLimit(8)); await B.evaluate(() => Net.test.waitLimit(8));
  await B.evaluate(() => { Net.test.drop(); Net.leave = () => {}; });
  await B.close();
  out.leftMs = await until(A, () => G.over && G.over.how === 'left', 30000);
  await A.waitForTimeout(2600);
  out.left = await A.evaluate(() => [document.querySelector('#dbTitle').textContent, document.querySelector('.db-kick').textContent]);
  out.errs = [...A.errs, ...B.errs].slice(0, 6);
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
