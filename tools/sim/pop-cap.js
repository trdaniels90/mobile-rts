// How each computer side's army sits against its cap (armyUnits / armyWorth), once a minute. Headless 2 v 2 of
// computers. node tools/sim/pop-cap.js <repo> [minutes] [difficulty] [map] [seed]
const vm = require('vm');
const [root, mins = '20', diff = 'normal', map = 'bridge', seed = '1000'] = process.argv.slice(2);
const ctx = require(root + '/server/headless.js').load(), run = (s) => vm.runInContext(s, ctx);
run(`newWorld('allies', '${diff}', ${seed}, 0, false, '${map}', [{ faction: 'allies', ally: 0, ai: true }, { faction: 'soviets', ally: 1, ai: true }, { faction: 'soviets', ally: 0, ai: true }, { faction: 'allies', ally: 1, ai: true }]); for (const t of G.teams) t.auto = true; G.me = -1; 0`);
const cap = run('({ units: G.diff.ai.armyUnits || ARMY_UNITS, worth: G.diff.ai.armyWorth || ARMY_WORTH })');
console.log('cap', JSON.stringify(cap), diff, map);
const stats = () => run(`G.teams.map((t) => { const us = unitsOf(t.id).filter((u) => !u.def.harvester); return { a: us.length, w: Math.round(us.reduce((s, u) => s + u.def.cost, 0)), tr: unitsOf(t.id).length - us.length, c: Math.round(t.credits), wave: t.stats.waves || 0 }; })`);
const first = [null, null, null, null];
for (let i = 1; i <= +mins * 60 * 30 && !run('G.over'); i++) {
  ctx.get('update')(1 / 30);
  if (i % 450 === 0) {   // every 15 s: note when each side first reaches a cap
    const s = stats();
    s.forEach((x, k) => { if (!first[k] && (x.a > cap.units || x.w > cap.worth)) first[k] = { t: i / 1800, by: x.a > cap.units ? 'units' : 'worth' }; });
  }
  if (i % 1800 === 0) console.log('min', i / 1800, stats().map((x) => `${x.a}u/${Math.round(x.w / 1000)}k tr${x.tr}`).join('  '));
}
console.log('first over cap (min):', JSON.stringify(first));
console.log('final', JSON.stringify(stats()), 'over', JSON.stringify(run('G.over && { winner: G.over.winner, t: Math.round(G.over.t / 6) / 10 }')));
