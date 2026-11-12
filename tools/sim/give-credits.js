const { chromium, devices } = require('playwright');
const vm = require('vm');
// Giving credits to an ally (`sendCredits`, the GIVE button): the rule headless, the card in a 2 v 2
// skirmish, and online co-op through the server (one player gives, both phones see it; an order to
// give to an enemy or from someone else's side is refused).
// node tools/sim/give-credits.js <repo>
(async () => {
  const root = process.argv[2];
  const out = {};
  // --- the rule, no browser ---
  {
    const ctx = require(root + '/server/headless.js').load(), run = (s) => vm.runInContext(s, ctx);
    run(`newWorld('allies', 'hard', 7, 0, false, 'bridge', [{ faction: 'allies', ally: 0 }, { faction: 'soviets', ally: 1, ai: true }, { faction: 'soviets', ally: 0, ai: true }, { faction: 'allies', ally: 1, ai: true }]); G.me = -1;
      for (const t of G.teams) t.credits = 3000; 0`);
    const c = () => run('G.teams.map((t) => t.credits).join()');
    const r = {};
    r.ally = [run('sendCredits(G.teams[0], 2, 1000)'), c()];
    r.enemy = [run('sendCredits(G.teams[0], 1, 1000)'), c()];
    r.self = [run('sendCredits(G.teams[0], 0, 1000)'), c()];
    r.bad = [run('[sendCredits(G.teams[0], 2, -500), sendCredits(G.teams[0], 2, NaN), sendCredits(G.teams[0], 2, "x"), sendCredits(G.teams[0], 9, 500), sendCredits(G.teams[0], G.teams[2], 500), sendCredits(G.teams[0], 2.5, 500)].join()'), c()];
    r.clamped = [run('sendCredits(G.teams[0], 2, 1e9)'), c()];
    r.empty = [run('sendCredits(G.teams[0], 2, 500)'), c()];
    run('G.teams[2].credits = 5000; G.teams[0].out = true; 0');
    r.toOut = [run('sendCredits(G.teams[2], 0, 500)'), run('sendCredits(G.teams[0], 2, 500)'), c()];
    r.stats = run('[G.teams[0].stats.given, G.teams[2].stats.received].join()');
    r.oneVone = run(`newWorld('allies', 'hard', 7); G.teams[0].credits = 3000; sendCredits(G.teams[0], 1, 500)`);
    out.rule = r;
  }
  process.env.PORT = '18474';
  const { rooms } = require(root + '/server/server.js');
  const b = await chromium.launch();
  const page = async (tag, q = '') => {
    const p = await (await b.newContext({ ...devices['iPhone 13 landscape'] })).newPage();
    p.errs = []; p.on('pageerror', (e) => p.errs.push(tag + ': ' + e.message));
    await p.route(/fonts|supabase\.co/, (r) => r.abort());
    await p.goto('file://' + root + '/index.html' + q);
    await p.evaluate((t) => { Account.name = t; }, tag).catch(() => {});
    return p;
  };
  const shown = (p) => p.evaluate(() => { const c = document.getElementById('give'); return !!c && !c.hidden; });
  // --- skirmish: hidden in a 1 v 1; the card in a 2 v 2 ---
  {
    let p = await page('S');
    await p.tap('#startBtn'); await p.tap('#maps [data-map-go]'); await p.waitForTimeout(800);
    const r = { hiddenIn1v1: await p.evaluate(() => document.getElementById('giveBtn').hidden) };
    await p.context().close();
    p = await page('S');
    await p.tap('#startBtn'); await p.tap('#maps [data-mode="2v2"]'); await p.tap('#maps [data-map-go]'); await p.waitForTimeout(800);
    const ally = await p.evaluate(() => G.teams.find((t) => t.id !== G.me && t.ally === G.teams[G.me].ally).id);
    const cr = () => p.evaluate((a) => [Math.round(G.teams[G.me].credits), Math.round(G.teams[a].credits)], ally);
    await p.evaluate(() => { for (const t of G.teams) t.isAI && (t.credits = 0); G.paused = true; G.teams[G.me].credits = 1200; });
    r.before = await cr();
    await p.tap('#giveBtn'); r.card = await shown(p);
    r.buttons = await p.$$eval('#give [data-to]', (l) => l.map((x) => x.dataset.n + (x.disabled ? ' off' : '')));
    if (process.argv[3]) await p.screenshot({ path: process.argv[3] });
    await p.tap('#give [data-n="1000"]');
    r.after = await cr(); r.closed = !(await shown(p));
    r.eva = await p.textContent('#eva');
    await p.tap('#giveBtn'); await p.tap('#give [data-b="close"]'); r.closeBtn = !(await shown(p)); r.unchanged = await cr();
    // a typed amount: nothing typed keeps the card open, letters are refused, a number sends, too much sends all
    await p.evaluate(() => { G.teams[G.me].credits = 900; });
    await p.tap('#giveBtn'); await p.tap('#give [data-send]'); r.emptyStaysOpen = await shown(p);
    await p.fill('#give [data-in]', '12a'); await p.tap('#give [data-send]'); r.lettersRefused = (await shown(p)) && (await cr())[0] === 900;
    await p.fill('#give [data-in]', '350'); await p.tap('#give [data-send]'); r.typed = [await cr(), !(await shown(p)), await p.textContent('#eva')];
    await p.tap('#giveBtn'); await p.fill('#give [data-in]', '99999'); await p.press('#give [data-in]', 'Enter'); r.typedTooMuch = [await cr(), !(await shown(p))];
    r.errs = p.errs; out.skirmish = r;
    await p.context().close();
  }
  // --- online co-op through the server ---
  {
    const q = '?server=ws%3A%2F%2Flocalhost%3A18474';
    const P = [await page('P0', q), await page('P1', q)];
    for (const p of P) await p.tap('#onlineBtn');
    await P[0].tap('[data-on=host]'); await P[0].waitForSelector('.on-code');
    const code = await P[0].textContent('.on-code');
    await P[1].fill('#onCode', code); await P[1].tap('#online form button[type=submit]'); await P[1].waitForFunction(() => Net.lobby && Net.lobby.connected, null, { timeout: 15000 });
    await P[0].tap('[data-on=mode][data-v="coop"]'); await P[0].waitForFunction(() => Net.lobby.mode === 'coop' && Net.lobby.ready);
    await P[0].tap('[data-on=start]');
    for (const p of P) await p.waitForFunction(() => Net.role === 'guest' && G.entities.length > 0, null, { timeout: 15000 });
    const R = rooms.get(code);
    await P[0].waitForTimeout(1500);
    const [a, bb] = [await P[0].evaluate(() => G.me), await P[1].evaluate(() => G.me)];
    const foe = R.run(`G.teams.find((t) => t.ally !== G.teams[${a}].ally).id`);
    const sv = () => R.run(`[${a}, ${bb}, ${foe}].map((i) => Math.round(G.teams[i].credits)).join()`);
    R.run(`G.paused = false; for (const t of G.teams) t.credits = 4000; 0`);
    const r = { before: sv() };
    await P[0].tap('#giveBtn'); await P[0].tap('#give [data-n="2500"]');
    await P[1].waitForFunction(() => /Received 2500/.test(document.getElementById('eva').textContent), null, { timeout: 5000 }).catch(() => {});
    r.evaSender = await P[0].textContent('#eva'); r.evaReceiver = await P[1].textContent('#eva');
    const mid = R.run(`[${a}, ${bb}].map((i) => Math.round(G.teams[i].credits))`);
    r.moved = mid[0] <= 1500 && mid[1] >= 6500 ? 'yes' : 'no: ' + mid;
    // forged orders straight to the server: to an enemy, and naming the ally's team as the giver
    const sum = () => R.run(`G.teams.map((t) => (t.stats.given || 0) + '/' + (t.stats.received || 0)).join()`);
    r.statsBefore = sum();
    NetCoreCheck: {
      const NC = R.ctx ? R.ctx.get('NetCore') : null;
      if (!NC) { r.forged = 'no NetCore handle'; break NetCoreCheck; }
      NC.applyCommand(a, { f: 'sendCredits', a: [{ $t: a }, foe, 500] });
      NC.applyCommand(a, { f: 'sendCredits', a: [{ $t: bb }, a, 500] });      // $t always becomes the sender: gives to self, refused
      NC.applyCommand(a, { f: 'sendCredits', a: [{ $t: a }, { $t: bb }, 500] });
      r.forged = sum() === r.statsBefore ? 'refused' : 'MOVED ' + sum();
    }
    r.stats = sum();
    r.errs = P.flatMap((p) => p.errs);
    out.online = r;
    for (const p of P) await p.context().close();
  }
  console.log(JSON.stringify(out, null, 1));
  await b.close(); process.exit(0);
})();
