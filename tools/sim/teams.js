// Team games headless (no browser): the computer plays every side of a 2 v 2 (or a 1 v 1 with
// "1v1"), fast, and reports how it went. node tools/sim/teams.js <repo> [games] [minutes] [map] [1v1]
const vm = require('vm');
const [root, games = '2', mins = '25', map = 'bridge', mode = '2v2'] = process.argv.slice(2);
const headless = require(root + '/server/headless.js');
for (let g = 0; g < +games; g++) {
  const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
  const seed = 1000 + g * 7919;
  const sides = mode === '1v1' ? `[{ faction: 'allies', ally: 0, ai: true }, { faction: 'soviets', ally: 1, ai: true }]`
    : `[{ faction: 'allies', ally: 0, ai: true }, { faction: 'soviets', ally: 1, ai: true }, { faction: 'soviets', ally: 0, ai: true }, { faction: 'allies', ally: 1, ai: true }]`;
  run(`newWorld('allies', 'hard', ${seed}, 0, false, '${map}', ${sides}); for (const t of G.teams) t.auto = true; G.me = -1; 0`);
  const t0 = Date.now();
  let err = null, outAt = {};
  try {
    for (let i = 0; i < +mins * 60 * 30 && !run('G.over'); i++) {
      ctx.get('update')(1 / 30);
      if (i % 3600 === 0 && i) console.log('  min', i / 1800, 'cpu', Math.round((Date.now() - t0) / 1000), 's,', run('G.entities.filter((e) => e.alive).length'), 'alive, kills', run('G.teams.map((t) => t.stats.killed).join()'));
      if (i % 300 === 0) for (const t of run('G.teams')) if (t.out && outAt[t.id] === undefined) outAt[t.id] = Math.round(run('G.t') / 6) / 10;
    }
  } catch (e) { err = e.stack.split('\n').slice(0, 4).join(' | '); }
  const r = run(`({ t: Math.round(G.t / 6) / 10, over: G.over && { winner: G.over.winner, t: Math.round(G.over.t / 6) / 10 },
    starts: G.teams.map((t) => [t.start.cx, t.start.cy]),
    sides: G.teams.map((t) => ({ id: t.id, ally: t.ally, f: t.faction[0], out: !!t.out, units: unitsOf(t.id).length, blds: buildingsOf(t.id).length, killed: t.stats.killed, bk: t.stats.bldKilled, lost: t.stats.lost, waves: G.log.waves[t.id], foe: t.foe })) })`);
  console.log(JSON.stringify({ game: g, seed, cpuSec: Math.round((Date.now() - t0) / 1000), ...r, outAt, err }));
}
