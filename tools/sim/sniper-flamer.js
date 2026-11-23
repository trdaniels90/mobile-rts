// The Allied Sniper and the Soviet Flamethrower. Sniper: locked until the Sniper program is researched (Allies only), at most
// 5 alive or queued, one-shots a rifleman at long range, outranges rifles, barely hurts a tank. Flamethrower: needs a Tech
// Center (Soviets only), no cap, burns infantry; killed, his tanks go up about 1 time in 3 and set nearby infantry (either
// side) on fire. Headless. node tools/sim/sniper-flamer.js <repo>
const vm = require('vm');
const root = process.argv[2];
const headless = require(root + '/server/headless.js');
const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
run(`newWorld('allies', 'normal', 9); G.me = 0; for (const t of G.teams) { t.isAI = false; t.auto = false; } 0`);
const r = JSON.parse(run(`(() => {
  const step = (s, f) => { for (let i = 0; i < s * 30; i++) { update(1 / 30); if (f) f(); } };
  const me = G.teams[0], foe = G.teams[1], r = {};
  const base = (team) => {
    const cy = buildingsOf(team.id).find((b) => b.type === 'cy');
    const place = (type) => { for (let d = 3; d < 30; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) if (canPlace(team, type, cy.cx + dx, cy.cy + dy, 0)) { const b = addBuilding(type, team, cy.cx + dx, cy.cy + dy); b.buildT = 1; return b; } };
    for (const t of ['power', 'power', 'power', 'barracks', 'refinery', 'dome', 'power']) place(t);
    return { cy, place };
  };
  const A = base(me), S = base(foe);
  updatePower(); me.credits = foe.credits = 50000;
  r.sovietsCannotResearch = !canResearch(foe, 'sniper');
  r.sovietNoFlamerBeforeTech = !available(foe, 'flamer');
  r.alliesNoFlamer = !available(me, 'flamer');
  A.place('tech'); S.place('tech'); updatePower();
  r.sniperLocked = startProduction(me, 'sniper') === 'Not available';
  r.flamerAvailable = available(foe, 'flamer');
  startResearch(me, 'sniper'); step(61);
  r.unlocked = available(me, 'sniper');
  const res = []; for (let i = 0; i < 6; i++) res.push(startProduction(me, 'sniper'));
  r.capQueue = res.slice(0, 5).every((x) => x === null) && res[5] === 'limit';
  me.queues.infantry.length = 0;
  let fx = 0, fy = 0;
  search: for (let dy = -40; dy <= 40; dy++) for (let dx = -40; dx <= 40; dx++) {
    const bx = A.cy.x + dx * CELL, by = A.cy.y + dy * CELL;
    let ok = Math.hypot(dx, dy) > 14; for (let k = -2; k < 12 && ok; k++) for (const oy of [-2, -1, 0, 1, 2]) if (!passableAt(bx + k * CELL, by + oy * CELL)) ok = false;
    if (ok) { fx = bx; fy = by; break search; }
  }
  const sn = []; for (let i = 0; i < 5; i++) sn.push(addUnit('sniper', me, fx - 200, fy + i * 30));
  r.capAlive = startProduction(me, 'sniper') === 'limit';
  sn[4].alive = false; r.roomAfterLoss = startProduction(me, 'sniper') === null; me.queues.infantry.length = 0;
  for (let i = 1; i < 4; i++) sn[i].alive = false;
  const s = sn[0]; s.x = fx; s.y = fy; setGuard(s, fx, fy);
  const dummy = (type, team, x, y) => { const d = addUnit(type, team, x, y); d.def = Object.assign({}, d.def, { weapon: null, weapon2: null, speed: 0 }); setGuard(d, x, y); return d; };
  const inf = dummy('rifle', foe, fx + 215, fy); const s0 = s.shots || 0;
  step(4); r.oneShotAtRange = !inf.alive && (s.shots || 0) - s0 === 1;
  const tank = dummy('htank', foe, fx + 150, fy); tank.hp = tank.maxHp = 1e6;
  step(9); r.tankDamage = Math.round(1e6 - tank.hp); tank.alive = false;
  // The Flamethrower's blast: many deaths, count how often it goes up and who burns.
  let blasts = 0, burnedFriend = 0, burnedFoe = 0, n = 60;
  for (let k = 0; k < n; k++) {
    const x = fx + 400, y = fy;
    const f = addUnit('flamer', foe, x, y);
    const friend = dummy('rifle', foe, x + 15, y), enemy = dummy('rifle', me, x - 15, y), far = dummy('rifle', me, x + 80, y);
    const fires0 = G.effects.length;
    kill(f, s, 'SA');
    if (friend.burnT > 0 || enemy.burnT > 0) blasts++;
    if (friend.burnT > 0) burnedFriend++;
    if (enemy.burnT > 0) burnedFoe++;
    if (far.burnT > 0) r.farBurned = true;
    step(5);
    if (k === 0 && (friend.burnT > 0 || !friend.alive)) r.firstBlastKillOrBurn = true;
    for (const e of [friend, enemy, far]) if (e.alive) { r.burnEnds = r.burnEnds !== false && !(e.burnT > 0); e.alive = false; }
  }
  r.blastRate = +(blasts / n).toFixed(2); r.burnedBothSides = burnedFriend > 0 && burnedFoe > 0;
  // A burning rifleman at full health: how much the fire takes.
  const v = dummy('rifle', me, fx + 400, fy + 60); setOnFire(v, null); step(5); r.burnDamage = v.alive ? Math.round(v.def.hp - v.hp) : 'killed';
  // A Flamethrower against a few riflemen.
  const fl = addUnit('flamer', foe, fx + 500, fy + 120); setGuard(fl, fl.x, fl.y);
  const vic = [0, 1, 2].map((i) => dummy('rifle', me, fx + 560, fy + 110 + i * 10));
  step(8); r.flamerKills = vic.filter((e) => !e.alive).length;
  return JSON.stringify(r);
})()`));
console.log(JSON.stringify(r));
const ok = r.sovietsCannotResearch && r.sovietNoFlamerBeforeTech && r.alliesNoFlamer && r.sniperLocked && r.flamerAvailable && r.unlocked && r.capQueue && r.capAlive && r.roomAfterLoss
  && r.oneShotAtRange && r.tankDamage < 150 && r.blastRate > 0.15 && r.blastRate < 0.55 && r.burnedBothSides && !r.farBurned && r.burnEnds !== false && r.flamerKills >= 2;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
