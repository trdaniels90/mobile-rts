// Veterancy: a unit is promoted at 2, 4, 8 and 16 times its own cost destroyed; each rank deals more, takes less,
// reloads and moves faster and reaches further; an elite unit heals itself. Headless. node tools/sim/veterancy.js <repo>
const vm = require('vm');
const root = process.argv[2];
const headless = require(root + '/server/headless.js');
const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
run(`newWorld('allies', 'normal', 5); G.me = 0; for (const t of G.teams) { t.isAI = false; t.auto = false; } 0`);
const r = run(`(() => {
  const step = (s) => { for (let i = 0; i < s * 30; i++) update(1 / 30); };
  const me = G.teams[0], foe = G.teams[1], res = {};
  for (const b of G.entities) if (b.kind === 'bld') { b.hp = b.maxHp = 1e9; b.buildT = 1; }
  const cy = buildingsOf(0).find((b) => b.type === 'cy');
  const at = (i) => ({ x: cy.x + 8 * CELL + i * 30, y: cy.y - 8 * CELL });
  // 1: ranks by the worth destroyed (kills credited through damage)
  const tank = addUnit('mtank', me, at(0).x, at(0).y), cost = tank.def.cost;
  const victim = (worthType) => { const v = addUnit(worthType, foe, at(3).x, at(3).y); v.hp = 1; return v; };
  res.ranks = [];
  let n = 0;
  while ((tank.rank || 0) < 4 && n++ < 400) { damage(victim('mtank'), 50, 'AP', tank); res.ranks[tank.rank || 0] = tank.killWorth / cost; }
  res.rank = tank.rank;
  // 2: firepower and armour (average of many hits; damage rolls 0.9 to 1.1)
  const dealt = (a, t) => { let s = 0; for (let i = 0; i < 400; i++) { t.hp = t.maxHp = 1e6; damage(t, 100, 'AP', a); s += 1e6 - t.hp; } return s / 400; };
  const rookie = addUnit('mtank', me, at(1).x, at(1).y), dummy = addUnit('mtank', foe, at(5).x, at(5).y);
  dummy.order = { type: 'guard', x: dummy.x, y: dummy.y, hold: true };
  res.fire = +(dealt(tank, dummy) / dealt(rookie, dummy)).toFixed(2);
  dummy.rank = 4; const a4 = dealt(rookie, dummy); dummy.rank = 0; res.armor = +(a4 / dealt(rookie, dummy)).toFixed(2);
  dummy.alive = false;
  // 3: an elite unit heals itself; a rookie does not
  const he = addUnit('mtank', me, cy.x - 9 * CELL, cy.y - 9 * CELL), hr = addUnit('mtank', me, cy.x - 9 * CELL, cy.y - 6 * CELL); he.rank = 4;
  he.hp = he.maxHp * 0.5; hr.hp = hr.maxHp * 0.5; he.hitT = hr.hitT = G.t;
  step(4); res.healEarly = +(he.hp / he.maxHp).toFixed(2);
  step(10); res.healElite = +(he.hp / he.maxHp).toFixed(2); res.healRookie = +(hr.hp / hr.maxHp).toFixed(2);
  // 4: speed (infantry: no turning)
  tank.alive = false;
  const run = (rank) => { const u = addUnit('rifle', me, cy.x, cy.y - 12 * CELL); u.rank = rank; commandMove([u], u.x + 20 * CELL, u.y); step(0.5); const a = u.x; step(3); const d = u.x - a; u.alive = false; return d; };
  res.speed = +(run(4) / run(0)).toFixed(2);
  // 5: reload: shots in 30 s at a tough target
  const shots = (rank) => { const u = addUnit('mtank', me, at(0).x, at(0).y - 100), t = addUnit('mtank', foe, u.x + 60, u.y); t.hp = t.maxHp = 1e9; t.order = { type: 'guard', x: t.x, y: t.y, hold: true }; t.def = Object.assign({}, t.def, { weapon: null });
    u.rank = rank; u.target = t; step(30); const s = u.shots || 0; u.alive = t.alive = false; return s; };
  const s0 = shots(0), s4 = shots(4); res.shots = [s0, s4];
  // 5b: range: a tank that cannot move, a target 12% past its normal reach (Elite reaches 20% further)
  const reachShots = (rank) => { const u = addUnit('mtank', me, at(0).x, at(0).y - 160); u.def = Object.assign({}, u.def, { speed: 0 });
    const t = addUnit('mtank', foe, u.x + u.def.weapon.range * 1.12, u.y); t.hp = t.maxHp = 1e9; t.def = Object.assign({}, t.def, { weapon: null, speed: 0 });
    u.rank = rank; u.target = t; step(10); const s = u.shots || 0; u.alive = t.alive = false; return s; };
  res.reach = [reachShots(0), reachShots(4)];
  // 6: no ranks for Ore Trucks or structures
  const truck = addUnit('harv', me, at(0).x, at(0).y + 60); truck.killWorth = 0;
  for (let i = 0; i < 5; i++) damage(victim('mtank'), 50, 'AP', truck);
  res.truckRank = truck.rank || 0;
  const gun = buildingsOf(0)[0]; for (let i = 0; i < 5; i++) damage(victim('mtank'), 50, 'AP', gun); res.bldRank = gun.rank || 0;
  // 7: a real fight: riflemen walking into a tank get it promoted by its own shots
  const hero = addUnit('mtank', me, cy.x + 10 * CELL, cy.y + 8 * CELL);
  for (let i = 0; i < 6; i++) { const v = addUnit('ltank', foe, hero.x + 70 + (i % 3) * 26, hero.y + (i >> 1) * 26); v.hp = 30; v.def = Object.assign({}, v.def, { weapon: null }); }
  step(150); res.fightRank = hero.rank || 0; res.fightWorth = hero.killWorth || 0;
  return JSON.stringify(res);
})()`);
const res = JSON.parse(r);
console.log(res);
const ok = res.rank === 4 && Math.abs(res.fire - 1.3) < 0.03 && Math.abs(res.armor - 0.75) < 0.03 && res.healEarly === 0.5 && res.healElite > 0.55 && res.healRookie <= 0.5 &&
  Math.abs(res.speed - 1.4) < 0.08 && res.shots[1] > res.shots[0] * 1.2 && res.reach[0] === 0 && res.reach[1] > 0 && res.truckRank === 0 && res.bldRank === 0 && res.fightRank >= 1;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
