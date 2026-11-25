// Attack move (AUTO button picker, then a tap): every armed ground unit heads for the spot, fights what it meets on the
// way, then holds the spot; Auto Attack stays off (one trip, not a standing order). A plain move, for contrast, walks
// past. Headless. node tools/sim/attack-move.js <repo>
const vm = require('vm');
const root = process.argv[2];
const headless = require(root + '/server/headless.js');
const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
run(`newWorld('allies', 'normal', 5); G.me = 0; for (const t of G.teams) { t.isAI = false; t.auto = false; } G.fog[0].fill(1); G.fog[1].fill(1); 0`);
const r = run(`(() => {
  const step = (s) => { for (let i = 0; i < s * 30; i++) update(1 / 30); };
  const me = G.teams[0], cy = buildingsOf(0).find((b) => b.type === 'cy'), ecy = buildingsOf(1).find((b) => b.type === 'cy'), res = {};
  for (const b of G.entities) if (b.kind === 'bld') b.hp = b.maxHp = 1e9;
  for (const u of unitsOf(0).concat(unitsOf(1))) u.alive = false;
  // destination: a third of the way towards the enemy; a squad of enemy riflemen stands near the route, half-way there
  const dx = ecy.x - cy.x, dy = ecy.y - cy.y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
  const dest = { x: cy.x + ux * 900, y: cy.y + uy * 900 }, mid = { x: cy.x + ux * 450 - uy * 90, y: cy.y + uy * 450 + ux * 90 };
  const mine = Array.from({ length: 6 }, (_, i) => { const u = addUnit(i < 3 ? 'mtank' : 'rifle', me, cy.x + 60 + (i % 3) * 20, cy.y + 80 + Math.floor(i / 3) * 20); setGuard(u, u.x, u.y); u.staged = true; return u; });
  const foes = Array.from({ length: 4 }, (_, i) => { const u = addUnit('rifle', G.teams[1], mid.x + i * 14, mid.y); setGuard(u, u.x, u.y); u.order.hold = true; u.hp = u.maxHp = 1; return u; });
  commandAttackMove(mine, dest.x, dest.y);
  res.allAmove = mine.every((u) => u.order.amove && u.order.hold && u.manual);
  step(5); for (const f of foes) f.hp = f.maxHp = 200;   // (kept alive till the column is on its way)
  for (let i = 0; i < 120 && foes.some((f) => f.alive); i++) step(0.5);
  res.foesKilled = foes.filter((f) => !f.alive).length;
  for (let i = 0; i < 120 && mine.some((u) => u.alive && u.order.amove); i++) step(0.5);
  const alive = mine.filter((u) => u.alive);
  res.arrived = alive.filter((u) => Math.hypot(u.x - dest.x, u.y - dest.y) < 140).length + '/' + alive.length;
  res.holding = alive.every((u) => u.order.type === 'guard' && u.order.hold && !u.order.amove);
  res.autoOff = !me.auto;
  return res;
})()`);
console.log(JSON.stringify(r));
const [a, n] = r.arrived.split('/').map(Number);
const ok = r.allAmove && r.foesKilled === 4 && n > 0 && a === n && r.holding && r.autoOff;
console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
