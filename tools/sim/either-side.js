const { chromium, devices } = require('playwright');
// PvP stage 1: either side can be "you". Plays as side 1 (?side=1) with the computer on side 0,
// then hands the view to the other side mid-game. Checks the camera, fog, sidebar, announcer,
// commands and the debrief all follow the viewer's side.
// node tools/sim/either-side.js <repo> [minutes]
(async () => {
  const [root, minutes = '6'] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await (await b.newContext({ ...devices['iPhone 13 landscape'] })).newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route(/fonts|supabase/, (r) => r.abort());
  await p.goto('file://' + root + '/index.html?side=1'); await p.tap('#startBtn'); await p.waitForTimeout(600);
  const r = await p.evaluate(({ minutes }) => {
    const ps = window.__ps, out = {}, said = [];
    const eva = hooks.eva; hooks.eva = (m) => { said.push(m); eva(m); };
    const cy = (s) => G.entities.find((e) => e.alive && e.team === s && e.type === 'cy');
    const fogAt = (s, e) => G.fog[s][cellOfPos(e.x, e.y)];
    const view = () => ({ x: ps.cam.x + innerWidth / 2 / ps.cam.z, y: ps.cam.y + innerHeight / 2 / ps.cam.z });
    out.start = { me: G.me, ai: G.teams.map((t) => t.isAI), drawn: G.seen === G.fog[1], sidebar: document.querySelector('#sidebar, .sidebar')?.dataset.faction, mine: G.teams[1].faction,
      ownBaseSeen: !!fogAt(1, cy(1)), foeBaseSeen: !!fogAt(1, cy(0)), camNearMine: Math.round(dist(view(), cy(1))), camToFoe: Math.round(dist(view(), cy(0))) };
    // A command from this device moves side 1's units, and side 0's ignore taps.
    const rifles = unitsOf(1).filter((u) => u.type === 'rifle');
    ps.commandMove(rifles, cy(1).x + 60, cy(1).y + 60);
    out.produce = startProduction(G.teams[1], 'power') !== false;
    for (let i = 0; i < minutes * 60 * 30 && !G.over; i++) { G.paused = false; ps.update(1 / 30); }
    out.run = { t: Math.round(G.t), cpuBuilt: buildingsOf(0).length, cpuUnits: unitsOf(0).length, mineBlds: buildingsOf(1).length,
      cpuFoundMe: enemyBaseKnown(0), iFoundCpu: enemyBaseKnown(1), cpuWaves: G.teams[0].waves || 0, said: [...new Set(said)] };
    // Hand the view to side 0 (as the PvP guest would see it).
    ps.viewSide(0);
    out.swapped = { me: G.me, drawn: G.seen === G.fog[0], camNear0: Math.round(dist(view(), cy(0))) };
    ps.viewSide(1);
    // Destroy the computer's Construction Yard: side 1 (this device) wins.
    const c = cy(0); if (c) damage(c, 1e6, 'HE', null);
    for (let i = 0; i < 40; i++) ps.update(1 / 30);
    out.over = G.over;
    return out;
  }, { minutes: +minutes });
  await p.waitForTimeout(2600);
  r.debrief = await p.evaluate(() => (document.querySelector('#dbTitle') || {}).textContent || null);
  r.errs = errs.slice(0, 3);
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
