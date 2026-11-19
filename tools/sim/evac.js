// Headless: a computer in a 2 v 2 that thinks it is about to be beaten sends an MCV to its ally's base and unpacks it there.
// After 10 minutes side 0's yard is set to 30% and hit, with team.evac forced on. node tools/sim/evac.js <repo> [diff] [map] [seed]
const vm = require('vm');
const [root, diff = 'normal', map = 'twinlakes', seed = '777'] = process.argv.slice(2);
const ctx = require(root + '/server/headless.js').load(), run = (s) => vm.runInContext(s, ctx);
run(`newWorld('allies', '${diff}', ${seed}, 0, false, '${map}', [0, 1, 2, 3].map((i) => ({ faction: i % 2 ? 'soviets' : 'allies', ally: i % 2, ai: true }))); for (const t of G.teams) t.auto = true; G.me = -1; 0`);
const step = (sec) => { for (let i = 0; i < sec * 30 && !run('G.over'); i++) ctx.get('update')(1 / 30); };
step(600);
const ally = run(`alliesOf(G.teams[0]).map((o) => o.id).join(',')`);
console.log('ally of side 0:', ally, 'evac rolled (before forcing):', run('G.teams[0].evac'));
run(`{ const t = G.teams[0]; t.evac = true; t.exp2 = false; t.expT = 1e9; for (const u of unitsOf(0).filter((u) => u.def.deploys === 'cy')) u.alive = false; t.queues.vehicle = t.queues.vehicle.filter((i) => i.type !== 'mcv'); for (const b of buildingsOf(0).filter((b) => b.type === 'cy' && b !== aiMainYard(t))) b.alive = false; t.credits = Math.max(t.credits, 3000); const y = aiMainYard(t); y.hp = y.maxHp * 0.3; y.hitT = G.t; }; 0`);
let mcv = null, done = null;
for (let s = 1; s <= 180 && done === null; s++) {
  step(1);
  const u = run(`(() => { const u = unitsOf(0).find((u) => u.def.deploys === 'cy'); return u ? [u.evac, Math.round(u.x / CELL), Math.round(u.y / CELL)] : null; })()`);
  if (u && !mcv) { mcv = s; console.log(s, 's: MCV out, heading for side', u[0]); }
  if (s % 20 === 0 && u) console.log(s, 's: MCV at', u[1], u[2]);
  const far = run(`buildingsOf(0).filter((b) => b.type === 'cy' && Math.hypot(b.cx - G.teams[0].start.cx, b.cy - G.teams[0].start.cy) >= 18).map((b) => [b.cx, b.cy, b.hp, b.maxHp])`);
  if (far.length) { done = s; console.log(s, 's: yard unpacked at', JSON.stringify(far[0]), '; ally yard at', run(`(() => { const y = aiAllyYard(G.teams[${ally.split(',')[0]}]); return [y.cx, y.cy]; })()`)); }
}
console.log('evacDone', run('G.teams[0].evacDone'), 'unpacked after', done, 's; over', run('G.over'));
step(120);
console.log('2 min later, side 0 buildings near the new yard:', run(`(() => { const y = buildingsOf(0).find((b) => b.type === 'cy' && Math.hypot(b.cx - G.teams[0].start.cx, b.cy - G.teams[0].start.cy) >= 18); return y ? buildingsOf(0).filter((b) => Math.hypot(b.cx - y.cx, b.cy - y.cy) < 14).map((b) => b.type).join(',') : 'none'; })()`));
