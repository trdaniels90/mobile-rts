// Tech Center upgrades and the Comanche. Headless. node tools/sim/comanche.js <repo>
// 1 research: the Comanche needs the upgrade; research is paid as it goes, cancelled with a refund when the last Tech
//   Center falls, lost with the last Tech Center once finished (owner's rule); one at a time; needs a free Helicopter Base pad.
// 2 combat: against a tank it opens its bays, holds a lock for 1 s and fires its four missiles, never the gun while it
//   has missiles; then the gun takes on the tank for little damage. Against infantry it uses the gun from the edge of its
//   reach and backs away from infantry that comes close. A staged fight against riflemen and one against tanks.
const vm = require('vm');
const root = process.argv[2];
const headless = require(root + '/server/headless.js');
const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
run(`newWorld('allies', 'normal', 7); G.me = 0; for (const t of G.teams) { t.isAI = false; t.auto = false; } 0`);
const res = JSON.parse(run(`(() => {
  const step = (s, f) => { for (let i = 0; i < s * 30; i++) { update(1 / 30); if (f) f(); } };
  const me = G.teams[0], foe = G.teams[1], r = {};
  const cy = buildingsOf(0).find((b) => b.type === 'cy');
  const place = (type) => {
    for (let d = 3; d < 30; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      const x = cy.cx + dx, y = cy.cy + dy;
      if (canPlace(me, type, x, y, 0)) { const b = addBuilding(type, me, x, y); b.buildT = 1; return b; }
    }
  };
  for (const t of ['power', 'power', 'refinery', 'factory', 'dome', 'power', 'power']) place(t);
  let tech = place('tech'); const pad = place('helipad');
  for (const u of G.entities.filter((e) => e.kind === 'unit' && e.cls === 'air')) u.alive = false;   // the Helicopter Base's free helicopter
  updatePower();
  me.credits = 20000;
  // --- 1: research
  r.lockedBefore = !available(me, 'comanche') && startProduction(me, 'comanche') === 'Not available';
  r.start = startResearch(me, 'comanche');
  r.second = startResearch(me, 'comanche');
  const c0 = me.credits;
  step(30);
  r.half = +me.research.progress.toFixed(2); r.paid = Math.round(c0 - me.credits);
  kill(tech, null); step(0.1);
  r.refunded = !me.research && Math.abs(me.credits - c0) < 1;
  tech = place('tech');
  startResearch(me, 'comanche'); step(61);
  r.done = hasUpgrade(me, 'comanche') && !me.research;
  kill(tech, null); step(0.1);
  r.lostWithoutTech = !hasUpgrade(me, 'comanche') && !available(me, 'comanche');
  tech = place('tech'); startResearch(me, 'comanche'); step(61);
  r.notTwice = startResearch(me, 'comanche') === 'Not available';
  const helis = []; for (let i = 0; i < 4; i++) helis.push(spawnUnit(me, 'heli'));
  r.padsFull = startProduction(me, 'comanche') === 'pads-full';
  for (const h of G.entities.filter((e) => e.kind === 'unit' && e.cls === 'air')) h.alive = false;
  r.queued = startProduction(me, 'comanche') === null;
  me.queues.heli.length = 0;
  // --- 2: combat. Open ground away from the base.
  let fx = 0, fy = 0;
  search: for (let dy = -40; dy <= 40; dy++) for (let dx = -40; dx <= 40; dx++) {
    const bx = cy.x + dx * CELL, by = cy.y + dy * CELL;
    let ok = Math.hypot(dx, dy) > 14; for (let k = -2; k < 14 && ok; k++) for (const oy of [-CELL, 0, CELL]) if (!passableAt(bx + k * CELL, by + oy)) ok = false;
    if (ok) { fx = bx; fy = by; break search; }
  }
  const fly = (x, y) => { const u = addUnit('comanche', me, x, y); u.alt = HELI_ALT; u.as = 'fly'; setGuard(u, x, y); return u; };
  const dummy = (type, x, y) => { const d = addUnit(type, foe, x, y); d.hp = d.maxHp = 1e6; d.def = Object.assign({}, d.def, { weapon: null, weapon2: null, speed: 0 }); return d; };
  // a tank at 190 px: inside missile reach (210), outside the gun's (150)
  let c = fly(fx, fy); const tank = dummy('mtank', fx + 190, fy);
  // (allied mtank as a foe stand-in: same draw, armour)
  let missileDmg = 0, open = null, lockT = null, firstMissile = null, gunAtTank = 0, minD = 1e9; const t0 = G.t; let inReach = null;
  const shotsGun = () => c.ammo;
  const a0 = c.ammo; c.ammo = 0;   // (no gun until the missiles have landed, so their damage can be measured: then it gets its rounds back)
  step(12, () => {
    const d = distTo(c, tank);
    if (inReach === null && d <= 210) inReach = G.t;
    if (open === null && c.bay >= 1) open = G.t - t0;
    if (firstMissile === null && c.aam < 4) firstMissile = G.t - (inReach || t0);
    if (c.aam > 0 && c.ammo < 0) gunAtTank++;
    if (c.aam === 0 && !missileDmg && !G.projectiles.some((p) => p.from === c)) { missileDmg = Math.round(1e6 - tank.hp); c.ammo = a0; }
    minD = Math.min(minD, d);
  });
  r.bayOpenAt = open === null ? null : +open.toFixed(2);
  r.firstMissileAfterReach = firstMissile === null ? null : +firstMissile.toFixed(2);
  r.missilesLeft = c.aam; r.gunWhileMissiles = gunAtTank;
  r.missileDamage = missileDmg;
  r.bayShutAfter = (() => { step(3); return c.bay; })();
  // missiles spent: the gun now takes on the tank, for little damage
  const hpG = tank.hp, ammo1 = c.ammo; step(8);
  r.gunOnTankBursts = ammo1 - c.ammo; r.gunOnTankDamage = Math.round(hpG - tank.hp);
  c.alive = false; tank.alive = false;
  // infantry at 140 px: the gun, no missiles; it does not close in
  c = fly(fx, fy); const inf = dummy('rifle', fx + 140, fy);
  const aam0 = c.aam; let dmin = 1e9;
  step(6, () => { dmin = Math.min(dmin, distTo(c, inf)); });
  r.gunOnInf = Math.round(1e6 - inf.hp); r.missilesAtInf = aam0 - c.aam; r.infMinDist = Math.round(dmin);
  // infantry walking up to it: it backs away (the dummy is moved 40 px a second toward it)
  const start = distTo(c, inf); let backed = 0;
  step(4, () => { const a = Math.atan2(c.y - inf.y, c.x - inf.x); inf.x += Math.cos(a) * 40 / 30; inf.y += Math.sin(a) * 40 / 30; });
  r.keptDistance = Math.round(distTo(c, inf)); r.startDistance = Math.round(start);
  c.alive = false; inf.alive = false;
  // --- staged fights: 2 Comanches ($3,000) on guard, enemies standing their ground 170 px off: 10 riflemen; 3 Heavy Tanks;
  // 6 riflemen and 3 Rocket Soldiers (who can shoot back)
  const fight = (types, secs) => {
    const cs = [fly(fx, fy), fly(fx, fy + 20)], foes = [];
    types.forEach((t, i) => { const u = addUnit(t, foe, fx + 170 + (i % 4) * 14, fy - 20 + (i >> 2) * 18); setGuard(u, u.x, u.y); foes.push(u); });
    step(secs);
    const out = { comanchesLeft: cs.filter((u) => u.alive).length, hp: cs.map((u) => Math.round(u.alive ? u.hp : 0)), foesLeft: foes.filter((u) => u.alive).length, of: foes.length };
    for (const u of cs.concat(foes)) u.alive = false;
    return out;
  };
  r.vsRiflemen = fight(Array(10).fill('rifle'), 45);
  r.vsTanks = fight(['htank', 'htank', 'htank'], 45);
  r.vsRockets = fight(['rifle', 'rifle', 'rifle', 'rocket', 'rifle', 'rifle', 'rifle', 'rocket', 'rocket'], 45);
  return JSON.stringify(r);
})()`));
console.log(JSON.stringify(res, null, 1));
const ok = res.lockedBefore && res.start === null && res.second === 'busy-same' && Math.abs(res.half - 0.5) < 0.05 && Math.abs(res.paid - 750) < 40 && res.refunded &&
  res.done && res.lostWithoutTech && res.notTwice && res.padsFull && res.queued &&
  res.bayOpenAt !== null && res.firstMissileAfterReach >= 1 && res.missilesLeft === 0 && res.gunWhileMissiles === 0 && res.missileDamage >= 430 && res.missileDamage <= 530 && res.bayShutAfter === 0 &&
  res.gunOnTankBursts > 0 && res.gunOnTankDamage > 0 && res.gunOnInf > 0 && res.missilesAtInf === 0 && res.infMinDist > 80 && res.keptDistance > 60;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
