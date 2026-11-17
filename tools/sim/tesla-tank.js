// The Tesla Tank: locked until the Tesla program is researched (Soviets only), fires its bolt from the coil, kills infantry,
// hurts tanks, never fires at aircraft. Headless. node tools/sim/tesla-tank.js <repo>
const vm = require('vm');
const root = process.argv[2];
const headless = require(root + '/server/headless.js');
const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
run(`newWorld('soviets', 'normal', 9); G.me = 0; for (const t of G.teams) { t.isAI = false; t.auto = false; } 0`);
const r = JSON.parse(run(`(() => {
  const step = (s, f) => { for (let i = 0; i < s * 30; i++) { update(1 / 30); if (f) f(); } };
  const me = G.teams[0], foe = G.teams[1], r = {};
  const cy = buildingsOf(0).find((b) => b.type === 'cy');
  const place = (type) => { for (let d = 3; d < 30; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) if (canPlace(me, type, cy.cx + dx, cy.cy + dy, 0)) { const b = addBuilding(type, me, cy.cx + dx, cy.cy + dy); b.buildT = 1; return b; } };
  for (const t of ['power', 'power', 'power', 'refinery', 'factory', 'dome', 'power']) place(t);
  place('tech'); updatePower(); me.credits = 20000;
  r.alliesCannot = !canResearch(foe, 'teslatank');
  r.lockedBefore = startProduction(me, 'ttank') === 'Not available';
  startResearch(me, 'teslatank'); step(61);
  r.unlocked = available(me, 'ttank') && startProduction(me, 'ttank') === null;
  me.queues.vehicle.length = 0;
  let fx = 0, fy = 0;
  search: for (let dy = -40; dy <= 40; dy++) for (let dx = -40; dx <= 40; dx++) {
    const bx = cy.x + dx * CELL, by = cy.y + dy * CELL;
    let ok = Math.hypot(dx, dy) > 14; for (let k = -1; k < 10 && ok; k++) for (const oy of [-1, 0, 1]) if (!passableAt(bx + k * CELL, by + oy * CELL)) ok = false;
    if (ok) { fx = bx; fy = by; break search; }
  }
  const tt = addUnit('ttank', me, fx, fy); setGuard(tt, fx, fy);
  const dummy = (type, x, y) => { const d = addUnit(type, foe, x, y); d.def = Object.assign({}, d.def, { weapon: null, weapon2: null, speed: 0 }); return d; };
  const inf = dummy('rifle', fx + 120, fy); let bolt = 0;
  step(4, () => { if (G.effects.some((e) => e.type === 'tesla')) bolt++; });
  r.infKilled = !inf.alive; r.boltSeen = bolt > 0;
  const tank = dummy('htank', fx + 120, fy); tank.hp = tank.maxHp = 1e6;
  step(5); r.tankDamage = Math.round(1e6 - tank.hp); tank.alive = false;
  const heli = addUnit('hind', foe, fx + 100, fy); heli.alt = HELI_ALT; heli.as = 'fly'; heli.def = Object.assign({}, heli.def, { weapon: null }); setGuard(heli, heli.x, heli.y);
  const s0 = tt.shots || 0; step(4); r.firedAtAir = (tt.shots || 0) - s0;
  return JSON.stringify(r);
})()`));
console.log(JSON.stringify(r));
const ok = r.alliesCannot && r.lockedBefore && r.unlocked && r.infKilled && r.boltSeen && r.tankDamage >= 100 && r.firedAtAir === 0;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
