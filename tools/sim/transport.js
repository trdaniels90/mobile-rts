// Transport helicopters (Chinook, Halo) and Air Assault. Headless. node tools/sim/transport.js <repo>
// 1 boarding by hand: infantry ordered aboard, the transport comes down beside them, they get in (not counted as lost).
// 2 drop: sent across the map it lands, unloads every one (health and rank kept), flies home to its pad.
// 3 empty transport sent somewhere parks there; soldiers ordered aboard walk to it.
// 4 Air Assault: picks a balanced load from idle infantry by a Barracks (no Engineers, no busy soldiers), flies, lands them.
// 5 shot down loaded: everyone aboard is lost. 6 an online order (forged for the other side) is refused.
// 7 a Normal computer builds a transport and flies an air assault in a headless 1 v 1.
const vm = require('vm');
const root = process.argv[2];
const headless = require(root + '/server/headless.js');
const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
run(`setTransports(true); newWorld('allies', 'normal', 11); G.me = 0; for (const t of G.teams) { t.isAI = false; t.auto = false; } 0`);
const res = JSON.parse(run(`(() => {
  const step = (s, f) => { for (let i = 0; i < s * 30; i++) { update(1 / 30); if (f && f()) return true; } return false; };
  const me = G.teams[0], foe = G.teams[1], r = {};
  const cy = buildingsOf(0).find((b) => b.type === 'cy');
  const place = (type) => {
    for (let d = 3; d < 30; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      const x = cy.cx + dx, y = cy.cy + dy;
      if (canPlace(me, type, x, y, 0)) { const b = addBuilding(type, me, x, y); b.buildT = 1; return b; }
    }
  };
  for (const t of ['power', 'power', 'refinery', 'factory', 'power']) place(t);
  const bar = place('barracks'), pad = place('helipad');
  for (const u of G.entities.filter((e) => e.kind === 'unit' && e.cls === 'air')) u.alive = false;
  updatePower(); me.credits = 20000;
  const h = spawnUnit(me, 'chinook');
  r.newOnPad = h.as === 'landed' && h.order.pad && !h.staged;
  step(1);
  // --- 1: board by hand, a squad 10 cells from the pad
  const sx = pad.x + CELL * 10, sy = pad.y + CELL * 6, squad = [];
  for (let i = 0; i < 5; i++) { const c = nearestFreeCell(cellOfPos(sx + i * 12, sy), 6); const p = cellCenter(c); squad.push(addUnit(i < 3 ? 'rifle' : 'rocket', me, p.x, p.y)); }
  squad[0].hp = 30; squad[0].rank = 2;
  const lost0 = me.stats.lost;
  commandBoard(squad, h);
  r.boardOrder = h.order.type === 'lift' && h.order.step === 'pick';
  r.boardT = step(40, () => (h.cargo || []).length === 5) ? +G.t.toFixed(1) : null;
  r.aboard = h.cargo.length; r.notLost = me.stats.lost === lost0; r.squadGone = squad.every((u) => !u.alive);
  r.waitsLanded = (step(5), h.as === 'landed' && h.order.type === 'lift');
  // --- 2: drop far away
  let fx = 0, fy = 0;
  search: for (let d = 40; d < 80; d++) for (const [dx, dy] of [[d, 0], [0, d], [-d, 0], [0, -d], [d, d], [-d, d]]) {
    const x = pad.x + dx * CELL, y = pad.y + dy * CELL;
    if (x > 50 && y > 50 && x < WORLD - 50 && y < WORLD - 50 && landSpot(x, y, h)) { fx = x; fy = y; break search; }
  }
  const nUnits0 = me.stats.units;
  commandMove([h], fx, fy);
  const out = [];
  step(90, () => h.order.type === 'guard' && h.order.pad);
  const landed = unitsOf(0).filter((u) => u.cls === 'inf' && Math.hypot(u.x - fx, u.y - fy) < CELL * 5);
  r.unloaded = landed.length; r.rankKept = landed.some((u) => u.rank === 2 && u.hp === 30);
  r.unitsNotRecounted = me.stats.units === nUnits0;
  r.goingHome = h.order.type === 'guard' && h.order.pad;
  r.backOnPad = step(60, () => h.as === 'landed' && Math.hypot(h.x - padSpot(pad, h).x, h.y - padSpot(pad, h).y) < 4);
  // --- 3: empty and sent: it parks there, then soldiers walk to it
  const px = pad.x + CELL * 8, py = pad.y - CELL * 10;
  commandMove([h], px, py);
  step(30);
  r.parked = h.as === 'landed' && h.order.type === 'guard' && !h.order.pad && Math.hypot(h.x - px, h.y - py) < CELL * 4;
  const two = landed.slice(0, 2);
  commandBoard(two, h);
  r.walkedAboard = step(60, () => h.cargo.length === 2);
  commandMove([h], h.x, h.y);   // UNLOAD HERE
  r.unloadHere = step(20, () => !h.cargo.length) && unitsOf(0).filter((u) => u.cls === 'inf' && distTo(u, h) < CELL * 4).length >= 2;
  step(30);
  // --- 4: Air Assault
  for (const u of unitsOf(0)) if (u.cls === 'inf') u.alive = false;
  step(0.1);
  const mk = (type, n) => { for (let i = 0; i < n; i++) { const c = nearestFreeCell(cellOfPos(bar.x + (i - 2) * 14, bar.y + CELL * 3), 6); const p = cellCenter(c); const u = addUnit(type, me, p.x, p.y); setGuard(u, p.x, p.y); u.staged = true; } };
  mk('rifle', 7); mk('rocket', 3); mk('grenadier' in UNIT_DEFS && available(me, 'grenadier') ? 'grenadier' : 'hmg', 2); mk('engineer', 1);
  step(80, () => h.as === 'landed' && h.order.type === 'guard' && h.order.pad);
  const busy = unitsOf(0).find((u) => u.type === 'rifle'); commandAttack([busy], buildingsOf(1)[0]);
  r.planCrew = (() => { const p = assaultPlan(me); return typeof p === 'string' ? p : p.crew.map((u) => u.type).sort().join(','); })();
  r.assault = commandAirAssault(me, fx, fy);
  r.notEngineer = unitsOf(0).filter((u) => u.order.type === 'board').every((u) => u.type !== 'engineer' && u !== busy);
  r.assaultTook = step(60, () => h.order.type === 'lift' && h.order.step === 'go') ? h.cargo.length : 0;
  step(90, () => h.order.type === 'guard' && h.order.pad);
  r.assaultLanded = unitsOf(0).filter((u) => u.cls === 'inf' && Math.hypot(u.x - fx, u.y - fy) < CELL * 5).length;
  r.secondNoCrew = assaultPlan(me);
  // --- 5: shot down loaded
  step(40, () => h.as === 'landed');
  const sq = unitsOf(0).filter((u) => u.cls === 'inf' && Math.hypot(u.x - fx, u.y - fy) < CELL * 5).slice(0, 4);
  commandBoard(sq, h);
  step(60, () => h.cargo.length === sq.length);
  const lostA = me.stats.lost, killedB = foe.stats.killed;
  const aa = addUnit('rocket', foe, h.x, h.y); kill(h, aa);
  r.shotDown = { lost: me.stats.lost - lostA, killed: foe.stats.killed - killedB, of: sq.length };
  // --- 6: a forged online order for the other side's transport is refused
  const theirs = addUnit('halo', foe, pad.x, pad.y + CELL * 20); theirs.as = 'landed';
  const mine2 = addUnit('rifle', me, pad.x + CELL, pad.y + CELL * 20);
  NetCore.applyCommand(0, { f: 'commandBoard', a: [[{ $e: mine2.id }], { $e: theirs.id }] });
  r.forged = mine2.order.type !== 'board' && theirs.order.type !== 'lift';
  return JSON.stringify(r);
})()`));
console.log(res);
// --- 7: the computer flies an air assault
const ctx2 = headless.load(), run2 = (s) => vm.runInContext(s, ctx2);
run2(`setTransports(true); newWorld('soviets', 'normal', 5); G.me = -1; for (const t of G.teams) { t.isAI = true; t.auto = true; } 0`);
const ai = JSON.parse(run2(`(() => {
  let built = null, assault = null, errors = 0;
  for (let i = 0; i < 30 * 60 * 22 && !assault; i++) {
    try { update(1 / 30); } catch (e) { errors++; if (errors < 3) console.log(e.stack); }
    if (i % 30) continue;
    for (const u of G.entities) if (u.alive && u.def && u.def.lift) {
      if (!built) built = { t: Math.round(G.t), type: u.type };
      if (u.order.type === 'lift' && u.order.step === 'drop' && u.order.n) assault = { t: Math.round(G.t), n: u.order.n, side: u.team };
    }
  }
  return JSON.stringify({ built, assault, errors, minutes: +(G.t / 60).toFixed(1) });
})()`));
console.log(ai);
