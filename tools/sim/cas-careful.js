// Close Air Support shot down, and the computer's care (owner, 2026-11-22, both modes). Headless.
// node tools/sim/cas-careful.js <repo>
// 1 penalty: a 2-plane strike with one plane shot down keeps the 240 s charge; with both shot down it takes 120 s more.
// 2 computer: a group of enemy tanks in the open is a target; with a SAM Site beside it, or on the way in from its base, it is not.
const vm = require('vm');
const root = process.argv[2];
const ctx = require(root + '/server/headless.js').load(), run = (s) => vm.runInContext(s, ctx);
run(`newWorld('soviets', 'normal', 7); G.me = 0; for (const t of G.teams) { t.isAI = false; t.auto = false; } 0`);
console.log(run(`JSON.stringify((() => {
  const step = (s) => { for (let i = 0; i < s * 30; i++) update(1 / 30); };
  const me = G.teams[0], foe = G.teams[1], r = {};
  const cyOf = (id) => buildingsOf(id).find((b) => b.type === 'cy');
  const place = (type, team, at) => {
    for (let d = 3; d < 30; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++)
      if (canPlace(team, type, at.cx + dx, at.cy + dy, 0)) { const b = addBuilding(type, team, at.cx + dx, at.cy + dy); b.buildT = 1; return b; }
  };
  for (const t of ['power', 'power', 'power', 'power', 'airfield', 'tech']) place(t, me, cyOf(0));
  updatePower();
  me.upgrades = me.upgrades || {}; for (const k of ['cas1', 'cas2']) me.upgrades[k] = true;
  r.planes = casPlanes(me);
  const strike = (lose) => {
    me.powers.cas = POWERS.cas.charge;
    const cx = cyOf(1).x, cy = cyOf(1).y;
    launchPower(me, 'cas', cx, cy);
    const planes = G.entities.filter((e) => e.alive && e.flight && e.flight.strike);
    for (const u of planes.slice(0, lose)) kill(u, null, 'HE');
    for (const u of planes.slice(lose)) u.alive = false;   // (flown home)
    return { charge: me.powers.cas, pen: me.powerPen && me.powerPen.cas || 0 };
  };
  r.oneLost = strike(1); r.bothLost = strike(2);
  step(240); r.after240 = Math.round(me.powers.cas); r.readyAt240 = powerReady(me, 'cas');
  step(121); r.readyAt361 = powerReady(me, 'cas'); r.penCleared = !(me.powerPen && me.powerPen.cas);
  // --- 2: the computer (side 1) with Close Air Support, side 0's tanks in the open
  for (const t of ['power', 'power', 'power', 'power', 'airfield', 'tech']) place(t, foe, cyOf(1));
  foe.upgrades = foe.upgrades || {}; foe.upgrades.cas1 = true;
  for (const e of G.entities) if (e.alive && e.kind === 'unit') e.alive = false;
  const a = cyOf(0), b = cyOf(1), mx = (a.x * 2 + b.x) / 3, my = (a.y * 2 + b.y) / 3;
  const tanks = [];
  for (let i = 0; i < 4; i++) { const u = addUnit('htank', me, mx + (i % 2) * 20, my + Math.floor(i / 2) * 20); tanks.push(u); }
  G.fog[1].fill(1);
  const tgt = () => { AA_CACHE.length = 0; for (const k in AA_CACHE) delete AA_CACHE[k]; return !!aiCasTarget(foe); };
  r.openTarget = tgt();
  const sam = addBuilding('sam', me, Math.floor(mx / CELL) + 3, Math.floor(my / CELL) + 3); sam.buildT = 1;
  r.samBeside = tgt();
  sam.alive = false; G.entities = G.entities.filter((e) => e.alive || e.kind !== 'bld');
  const px = (b.x + mx) / 2, py = (b.y + my) / 2, sam2 = addBuilding('sam', me, Math.floor(px / CELL), Math.floor(py / CELL)); sam2.buildT = 1;
  r.samOnTheWay = tgt();
  r.ok = r.oneLost.charge === 0 && r.oneLost.pen === 0 && r.bothLost.charge === -120 && r.bothLost.pen === 120 && !r.readyAt240 && r.readyAt361 && r.penCleared
    && r.openTarget && !r.samBeside && !r.samOnTheWay;
  return r;
})(), null, 1)`));
