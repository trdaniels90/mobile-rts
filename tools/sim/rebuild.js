// Headless: a Normal computer that lost its War Factory and is broke sells buildings and builds a new one.
// node tools/sim/rebuild.js <repo> [diff] [factory|refinery|both]
const vm = require('vm');
const [root, diff = 'normal', lose = 'factory'] = process.argv.slice(2);
const types = lose === 'both' ? ['factory', 'refinery'] : [lose];
const ctx = require(root + '/server/headless.js').load(), run = (s) => vm.runInContext(s, ctx);
run(`newWorld('allies', '${diff}', 4242, 0, false, 'bridge', [{ faction: 'allies', ally: 0, ai: true }, { faction: 'soviets', ally: 1, ai: true }]); for (const t of G.teams) t.auto = true; G.me = -1; 0`);
const step = (sec) => { for (let i = 0; i < sec * 30 && !run('G.over'); i++) ctx.get('update')(1 / 30); };
step(600);
run(`{ const t = G.teams[1]; for (const b of buildingsOf(1).filter((b) => ${JSON.stringify(types)}.includes(b.type))) kill(b, null); t.credits = 0; for (const u of unitsOf(1).filter((u) => u.def.harvester)) kill(u, null); }; 0`);
const sold = [];
let back = null;
for (let s = 1; s <= 240 && back === null; s++) {
  step(1);
  if (s % 20 === 0) console.log(s, 'credits', run('Math.round(G.teams[1].credits)'), 'blds', run(`buildingsOf(1).map((b) => b.type + (b.sellT > 0 ? '*' : '')).join(',')`));
  if (run(`buildingsOf(1).some((b) => b.type === 'refinery' && b.buildT >= 1) && (${JSON.stringify(types)}.includes('factory') ? buildingsOf(1).some((b) => b.type === 'factory' && b.buildT >= 1) : true)`)) back = s;
}
console.log('rebuilt after', back, 's; cy', run(`buildingsOf(1).some((b) => b.type === 'cy')`));
