// The Tank Destroyer (Allies): locked until a Tech Center stands (War Factory builds it), Soviets cannot build it, turns its
// whole hull to aim, out-ranges a Heavy Tank (and nearly wins one on one at $50 less), does little to infantry, never fires at aircraft.
// Headless. node tools/sim/tank-destroyer.js <repo>
const vm = require('vm');
const root = process.argv[2];
const headless = require(root + '/server/headless.js');
const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
run(`newWorld('allies', 'normal', 9); G.me = 0; for (const t of G.teams) { t.isAI = false; t.auto = false; } 0`);
const r = JSON.parse(run(`(() => {
  const step = (s, f) => { for (let i = 0; i < s * 30; i++) { update(1 / 30); if (f) f(); } };
  const me = G.teams[0], foe = G.teams[1], r = {};
  const cy = buildingsOf(0).find((b) => b.type === 'cy');
  const place = (type) => { for (let d = 3; d < 30; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) if (canPlace(me, type, cy.cx + dx, cy.cy + dy, 0)) { const b = addBuilding(type, me, cy.cx + dx, cy.cy + dy); b.buildT = 1; return b; } };
  for (const t of ['power', 'power', 'power', 'refinery', 'factory', 'dome', 'power']) place(t);
  updatePower(); me.credits = 20000;
  r.sovietsCannot = !UNIT_DEFS.tdest.factions.includes(foe.faction);
  r.lockedBefore = startProduction(me, 'tdest') === 'Not available';
  place('tech'); updatePower();
  r.unlocked = available(me, 'tdest') && startProduction(me, 'tdest') === null;
  me.queues.vehicle.length = 0;
  let fx = 0, fy = 0;
  search: for (let dy = -40; dy <= 40; dy++) for (let dx = -40; dx <= 40; dx++) {
    const bx = cy.x + dx * CELL, by = cy.y + dy * CELL;
    let ok = Math.hypot(dx, dy) > 14; for (let k = -1; k < 10 && ok; k++) for (const oy of [-1, 0, 1]) if (!passableAt(bx + k * CELL, by + oy * CELL)) ok = false;
    if (ok) { fx = bx; fy = by; break search; }
  }
  const td = addUnit('tdest', me, fx, fy); td.face = td.tface = Math.PI; setGuard(td, fx, fy);
  const dummy = (type, x, y) => { const d = addUnit(type, foe, x, y); d.def = Object.assign({}, d.def, { weapon: null, weapon2: null, speed: 0 }); return d; };
  // Out of a tank's reach (114) but in its own (150): it turns round (no turret) and hits.
  const far = dummy('htank', fx + 140, fy); far.hp = far.maxHp = 1e6;
  step(6); r.farDamage = Math.round(1e6 - far.hp); r.turned = Math.abs(angDiff(td.face, 0)) < 0.1 && td.face === td.tface; far.alive = false;
  const inf = dummy('rifle', fx + 100, fy); inf.hp = inf.maxHp = 1e6;
  step(6.6); r.infDamage = Math.round(1e6 - inf.hp); inf.alive = false;
  const heli = addUnit('hind', foe, fx + 100, fy); heli.alt = HELI_ALT; heli.as = 'fly'; heli.def = Object.assign({}, heli.def, { weapon: null }); setGuard(heli, heli.x, heli.y);
  const s0 = td.shots || 0; step(4); r.firedAtAir = (td.shots || 0) - s0; heli.alive = false;
  // One on one against a live Heavy Tank, starting at the Destroyer's range.
  td.hp = td.maxHp;
  const ht = addUnit('htank', foe, fx + 148, fy); setGuard(ht, ht.x, ht.y);
  step(40); r.duel = td.alive && !ht.alive ? 'td' : ht.alive && !td.alive ? 'htank' : 'none'; r.tdHpLeft = Math.round(td.hp); r.htankHpLeft = Math.round(ht.hp);
  return JSON.stringify(r);
})()`));
console.log(JSON.stringify(r));
const ok = r.sovietsCannot && r.lockedBefore && r.unlocked && r.turned && r.farDamage >= 150 && r.infDamage > 0 && r.infDamage < 100 && r.firedAtAir === 0 && (r.duel === 'td' || r.htankHpLeft < 150);
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
