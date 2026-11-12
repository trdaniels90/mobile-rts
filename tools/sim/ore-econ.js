// The economy in a team game, headless: computers on every side. Every 5 minutes, the ore left on the map
// (ore fields, without gems) and each side's income over those 5 minutes.
// node tools/sim/ore-econ.js <repo> [sides 4|6] [minutes] [map] [seed]
const vm = require('vm');
const [root, n = '4', mins = '30', map = 'bridge', seed = '1000'] = process.argv.slice(2);
const headless = require(root + '/server/headless.js');
const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
const sides = Array.from({ length: +n }, (_, i) => `{ faction: '${i % 2 ? 'soviets' : 'allies'}', ally: ${i < +n / 2 ? 0 : 1}, ai: true }`).join(',');
run(`newWorld('allies', 'hard', ${+seed}, 0, false, '${map}', [${sides}]); for (const t of G.teams) t.auto = true; G.me = -1; 0`);
const t0 = Date.now(); let last = run('G.teams.map((t) => t.stats.harvested)');
const ore = () => run('(() => { let o = 0; for (let c = 0; c < G.ore.length; c++) if (!G.gem[c]) o += G.ore[c]; return o; })()');
console.log(JSON.stringify({ min: 0, ore: ore() }));
for (let m = 1; m <= +mins; m++) {
  for (let i = 0; i < 1800 && !run('G.over'); i++) ctx.get('update')(1 / 30);
  if (m % 5 === 0) {
    const h = run('G.teams.map((t) => t.stats.harvested)');
    console.log(JSON.stringify({ min: m, ore: ore(), incomePerMin: h.map((v, i) => Math.round((v - last[i]) / 5)), trucks: run('G.teams.map((t) => unitsOf(t.id).filter((u) => u.def.harvester).length)'), cpu: Math.round((Date.now() - t0) / 1000) }));
    last = h;
  }
}
