const { chromium, devices } = require('playwright');
// Saved co-op battles in the browser, through the dedicated server (run in this process, saves in memory):
// two pages play co-op, one taps Save and leave twice in the menu, both land on the online page with the note;
// then the other hosts, the first joins, the leader opens Saved co-op battles, continues it, and both pages
// play on from the saved battle. node tools/sim/coop-save-ui.js <repo>
(async () => {
  const [root] = process.argv.slice(2);
  process.env.PORT = '18476';
  const { rooms, Saves } = require(root + '/server/server.js');
  const b = await chromium.launch();
  const fails = [];
  const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) fails.push(what); };
  const ctxs = {};
  const open = async (tag) => {
    const ctx = ctxs[tag] || (ctxs[tag] = await b.newContext({ ...devices['iPhone 13 landscape'] }));
    const p = await ctx.newPage();
    p.errs = []; p.on('pageerror', (e) => p.errs.push(tag + ': ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
    await p.route(/fonts|supabase\.co/, (r) => r.abort());
    await p.goto('file://' + root + '/index.html?server=ws%3A%2F%2Flocalhost%3A18476');
    await p.evaluate((t) => { Account.name = t; }, tag).catch(() => {});
    await p.tap('#onlineBtn');
    return p;
  };
  const gather = async (lead, other) => {
    await lead.tap('[data-on=host]');
    await lead.waitForFunction(() => Net.lobby && Net.lobby.code && Net.lobby.connected);
    const code = await lead.evaluate(() => Net.lobby.code);
    await other.tap(`[data-on=joinroom][data-v="${code}"]`, { timeout: 15000 });
    await other.waitForFunction(() => Net.lobby && Net.lobby.connected && Net.lobby.slots, null, { timeout: 15000 });
    return code;
  };
  let A = await open('Ann'), B = await open('Bo');
  let code = await gather(A, B);
  await A.tap('[data-on=mode][data-v="coop"]');
  await A.waitForFunction(() => Net.lobby.mode === 'coop' && Net.lobby.ready, null, { timeout: 5000 });
  await A.tap('[data-on=start]');
  for (const p of [A, B]) await p.waitForFunction(() => Net.role === 'guest' && G.entities.length > 0, null, { timeout: 15000 });
  await B.evaluate(() => { startProduction(G.teams[G.me], 'power'); });
  await A.waitForTimeout(6000);
  const R = rooms.get(code);
  R.run('for (let i = 0; i < 30; i++) scorch(G.tctx, 300 + i * 20, 400, 12, i); 0');
  await A.waitForTimeout(500);
  const before = { t: R.G.t, n: R.G.entities.filter((e) => e.alive).length };
  // B opens the menu: Save and leave shows; two taps.
  await B.evaluate(() => document.getElementById('menuBtn') ? document.getElementById('menuBtn').click() : null);
  await B.evaluate(() => { const m = document.getElementById('menu'); if (m.hidden) document.dispatchEvent(new Event('visibilitychange')); });
  const shown = await B.evaluate(() => !document.getElementById('saveQuitBtn').hidden);
  check(shown, 'Save and leave is on the pause menu in online co-op');
  await B.evaluate(() => { document.getElementById('saveQuitBtn').click(); document.getElementById('saveQuitBtn').click(); });
  for (const p of [A, B]) await p.waitForFunction(() => !Net.role && !document.getElementById('online').hidden, null, { timeout: 10000 }).catch(() => {});
  const notes = await Promise.all([A, B].map((p) => p.evaluate(() => document.querySelector('#online .on-body').innerText)));
  check(notes.every((t) => /saved the battle\. To continue it/.test(t)), 'both are back on the online page with how to continue it');
  check(!rooms.has(code) && Saves.mem.size === 1, 'the room closed and the battle is saved');
  // B hosts this time, A joins.
  code = await gather(B, A);
  await B.tap('[data-on=saves]');
  await B.waitForSelector('[data-on=load]', { timeout: 5000 });
  const listText = await B.evaluate(() => document.querySelector('.on-saves').innerText.replace(/\s+/g, ' '));
  check(/2 v AI/.test(listText) && /Commander, Commander/.test(listText), 'the saved battle is listed: ' + listText);
  await B.tap('[data-on=load]');
  await B.waitForFunction(() => Net.lobby.resumeOf && Net.lobby.ready, null, { timeout: 5000 }).catch(() => {});
  const lob = await A.evaluate(() => document.querySelector('#online .on-body').innerText.replace(/\s+/g, ' '));
  check(/Continuing a saved battle/.test(lob), 'the friend sees it is a saved battle');
  await B.tap('[data-on=start]');
  for (const p of [A, B]) await p.waitForFunction(() => Net.role === 'guest' && G.entities.length > 0 && G.t > 1, null, { timeout: 15000 });
  await A.waitForTimeout(3000);
  const R2 = rooms.get(code);
  const after = await Promise.all([A, B].map((p) => p.evaluate(() => ({ me: G.me, t: G.t, mine: G.entities.filter((e) => e.alive && e.team === G.me).length, match: Report.matchId }))));
  const scorches = await Promise.all([A, B].map((p) => p.evaluate(() => G.marks.filter((m) => m[1] === 'scorch').length)));
  check(scorches.every((n) => n >= 30), `each phone has the saved scorch marks again (${scorches})`);
  const srvMine = after.map((x) => R2.G.entities.filter((e) => e.alive && e.team === x.me).length);
  check(after.every((x) => x.t >= before.t), `the phones go on from ${Math.round(before.t)} s (now ${after.map((x) => Math.round(x.t))})`);
  check(after.every((x, i) => Math.abs(x.mine - srvMine[i]) <= 2), `each phone has its own side as the server does (${after.map((x) => x.mine)} / ${srvMine})`);
  // (Pages opened from a file report no matches, so the match row carried on is not checked here.)
  const errs = [A, B].flatMap((p) => p.errs);
  check(!errs.length, 'no page errors ' + errs.slice(0, 3).join(' / '));
  await b.close();
  for (const r of rooms.values()) clearInterval(r.timer);
  console.log(fails.length ? `${fails.length} FAILED` : 'all passed');
  process.exit(fails.length ? 1 : 0);
})();
