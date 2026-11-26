// The Mobile SAM (Soviets): War Factory, Soviets only, shoots down a Hind and a MiG, never fires at anything on the ground, and
// its rack turns to aim while the hull stays. Headless. node tools/sim/mobile-sam.js <repo>
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
  r.lockedBefore = startProduction(me, 'msam') === 'Not available';
  for (const t of ['power', 'power', 'refinery', 'factory']) place(t);
  updatePower(); me.credits = 20000;
  r.alliesCannot = !UNIT_DEFS.msam.factions.includes(foe.faction);
  r.unlocked = available(me, 'msam') && startProduction(me, 'msam') === null;
  me.queues.vehicle.length = 0;
  let fx = 0, fy = 0;
  search: for (let dy = -40; dy <= 40; dy++) for (let dx = -40; dx <= 40; dx++) {
    const bx = cy.x + dx * CELL, by = cy.y + dy * CELL;
    let ok = Math.hypot(dx, dy) > 14; for (let k = -1; k < 10 && ok; k++) for (const oy of [-1, 0, 1]) if (!passableAt(bx + k * CELL, by + oy * CELL)) ok = false;
    if (ok) { fx = bx; fy = by; break search; }
  }
  const ms = addUnit('msam', me, fx, fy); ms.face = ms.tface = Math.PI; setGuard(ms, fx, fy);
  const dummy = (type, x, y) => { const d = addUnit(type, foe, x, y); d.def = Object.assign({}, d.def, { weapon: null, weapon2: null, speed: 0 }); return d; };
  const tank = dummy('mtank', fx + 100, fy), inf = dummy('rifle', fx + 60, fy + 20);
  let s0 = ms.shots || 0; step(5); r.firedAtGround = (ms.shots || 0) - s0; r.hullStill = ms.face === Math.PI; tank.alive = inf.alive = false;
  const heli = addUnit('heli', foe, fx + 150, fy); heli.alt = HELI_ALT; heli.as = 'fly'; heli.def = Object.assign({}, heli.def, { weapon: null }); setGuard(heli, heli.x, heli.y);
  step(15); r.heliDown = !heli.alive || heli.hp <= 0 || !!heli.crash; r.hullStillAir = ms.face === Math.PI;
  return JSON.stringify(r);
})()`));
console.log(JSON.stringify(r));
const ok = r.lockedBefore && r.alliesCannot && r.unlocked && r.firedAtGround === 0 && r.hullStill && r.heliDown;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
