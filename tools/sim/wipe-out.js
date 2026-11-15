// A defeated side loses everything it has left, in a team game. node tools/sim/wipe-out.js <repo>
const vm = require('vm');
const root = process.argv[2];
const ctx = require(root + '/server/headless.js').load(), run = (s) => vm.runInContext(s, ctx);
run(`newWorld('allies', 'hard', 7, 0, false, 'twinlakes', [{ faction: 'allies', ally: 0, ai: true }, { faction: 'soviets', ally: 1, ai: true }, { faction: 'soviets', ally: 0, ai: true }, { faction: 'allies', ally: 1, ai: true }]); for (const t of G.teams) t.auto = true; G.me = -1; 0`);
for (let i = 0; i < 240 * 30; i++) ctx.get('update')(1 / 30);
const before = run(`({ units: unitsOf(1).length, blds: buildingsOf(1).length, lost: G.teams[1].stats.lost, bl: G.teams[1].stats.bldLost, ally: unitsOf(3).length })`);
run(`for (const b of buildingsOf(1)) if (PRODUCTION.includes(b.type)) kill(b, null); for (const u of mcvsOf(1)) kill(u, null); 0`);
run(`G.teams[1].stats.lost = ${before.lost}; G.teams[1].stats.bldLost = ${before.bl}; 0`);
let maxEnt = 0;
for (let i = 0; i < 20 * 30; i++) { ctx.get('update')(1 / 30); maxEnt = Math.max(maxEnt, run('G.entities.filter((e) => e.alive && e.team === 1).length')); }
const after = run(`({ out: G.teams[1].out, units: unitsOf(1).length, blds: buildingsOf(1).length, lost: G.teams[1].stats.lost, bl: G.teams[1].stats.bldLost, wipe: G.teams[1].wipe, over: !!G.over, allyOut: G.teams[3].out, allyUnits: unitsOf(3).length, fobs: mcvsOf(1).length })`);
console.log('before', JSON.stringify(before)); console.log('after', JSON.stringify(after));
const ok = after.out && after.units === 0 && after.blds === 0 && !after.wipe && !after.over && !after.allyOut && after.allyUnits > 0 && after.lost <= before.lost + 0;
console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
