// Ships (naval units): the Naval Yard and Submarine Pen stand only in open water, ships stay on the water, a Gunboat finds and
// sinks a submerged Submarine with depth charges, torpedoes hit only ships and structures in the water, a ship never chases what
// it cannot reach, the Transport carries soldiers and vehicles across and puts them ashore, a forged order is refused, and the
// computer builds a yard and a fleet on its own. Headless. node tools/sim/naval.js <repo> [map] [minutes of the computer game]
const vm = require('vm');
const [root, map = 'twinlakes', mins = '20'] = process.argv.slice(2);
const headless = require(root + '/server/headless.js');
const out = {};
{
  const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
  run(`newWorld('allies', 'normal', 7, 0, false, '${map}'); G.me = 0; for (const t of G.teams) { t.isAI = false; t.auto = false; } 0`);
  Object.assign(out, JSON.parse(run(`(() => {
    const step = (s, f) => { for (let i = 0; i < s * 30; i++) { update(1 / 30); if (f) f(); } };
    const me = G.teams[0], foe = G.teams[1], r = {}, N = navCells();
    for (const t of G.teams) t.credits = 1e6;
    for (const c of G.fog[0].keys()) { G.fog[0][c] = 2; G.fog[1][c] = 2; }
    // The biggest water and a 3 x 3 spot in it next to land, near side 0.
    const big = N.sizes.indexOf(Math.max(...N.sizes.slice(1)));
    const cy0 = buildingsOf(0).find((b) => b.type === 'cy');
    let spot = null, bd = Infinity;
    for (let y = 2; y < MAP - 5; y++) for (let x = 2; x < MAP - 5; x++) {
      let ok = true; for (let j = 0; j < 3 && ok; j++) for (let i = 0; i < 3; i++) if (!N.cells[idx(x + i, y + j)] || N.body[idx(x + i, y + j)] !== big) ok = false;
      if (!ok) continue;
      let shore = false; for (let j = -2; j < 5; j++) for (let i = -2; i < 5; i++) if (inMap(x + i, y + j) && !N.cells[idx(x + i, y + j)] && !G.block[idx(x + i, y + j)]) shore = true;
      const d = Math.hypot(x - cy0.cx, y - cy0.cy);
      if (shore && d < bd) { bd = d; spot = { x, y }; }
    }
    r.bodies = N.sizes.length - 1; r.bigBody = N.sizes[big];
    r.yardNeeds = [available(me, 'navyard'), available(foe, 'subpen')];   // only a Construction Yard so far: not yet
    // A Power Plant on the shore beside the spot brings it into reach.
    let pw = null;
    for (let k = 0; k < 400 && !pw; k++) { const a = Math.random() * 7, rr = 3 + Math.random() * 5, x = Math.round(spot.x + Math.cos(a) * rr), y = Math.round(spot.y + Math.sin(a) * rr);
      if (inMap(x, y) && x > 1 && y > 1) { let ok = true; for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const c = idx(x + i, y + j); if (G.block[c] || G.bld[c] || G.ore[c]) ok = false; } if (ok) { pw = addBuilding('power', me, x, y); pw.buildT = 1; } } }
    updatePower();
    r.yardAfterPower = available(me, 'navyard') && !available(me, 'subpen') && UNIT_DEFS.sub.factions.join() === 'soviets';
    r.placeWater = canPlace(me, 'navyard', spot.x, spot.y, 0);
    r.placeLandRefused = !canPlace(me, 'navyard', pw.cx, pw.cy + 3, 0) && !canPlace(me, 'power', spot.x, spot.y, 0);
    me.queues.structure = { type: 'navyard', progress: 1, spent: 1000, ready: true };
    const yard = placeStructure(me, 'navyard', spot.x, spot.y); step(3);
    r.yardPlaced = !!yard && yard.exitCell >= 0 && N.cells[yard.exitCell] === 1;
    // Production: each ship comes out on the water.
    r.queue = startProduction(me, 'gunboat') === null && me.queues.naval.length === 1;
    step(25);
    const gb = unitsOf(0).find((u) => u.type === 'gunboat');
    r.built = !!gb && N.cells[cellOfPos(gb.x, gb.y)] === 1;
    // Sailing: across the lake to its far end; every step on open water.
    let far = null, fd = 0;
    for (let c = 0; c < NCELLS; c++) if (N.body[c] === big && !G.bld[c]) { const p = cellCenter(c), d = Math.hypot(p.x - gb.x, p.y - gb.y); if (d > fd && d < CELL * 45) { fd = d; far = p; } }
    let dry = 0;
    commandMove([gb], far.x, far.y);
    step(60, () => { if (!N.cells[cellOfPos(gb.x, gb.y)]) dry++; });
    r.sailed = Math.round(Math.hypot(gb.x - far.x, gb.y - far.y) / CELL); r.dryCells = dry;
    // Ordered inland: it goes to the nearest water instead.
    commandMove([gb], cy0.x, cy0.y); step(30, () => { if (!N.cells[cellOfPos(gb.x, gb.y)]) dry++; });
    r.inlandStaysWet = dry === 0;
    // Submarine against Gunboat. The sub is hidden from side 0 until near; it torpedoes the Gunboat; depth charges sink it.
    let sp = null; for (let c = 0; c < NCELLS && !sp; c++) { const p = cellCenter(c), d = Math.hypot(p.x - gb.x, p.y - gb.y); if (N.body[c] === shipBody(gb) && navFree(c) && d > SUB_DETECT + CELL * 1.5 && d < CELL * 9 && distTo(p, yard) > SUB_DETECT + CELL * 2) sp = p; }
    const sub = addUnit('sub', foe, sp.x, sp.y); setGuard(sub, sp.x, sp.y);
    step(0.5);
    r.subHiddenFar = Math.hypot(sub.x - gb.x, sub.y - gb.y) > SUB_DETECT ? camoHidden(sub, 0) : 'near';
    r.rifleCannotHitSub = !canHit(UNIT_DEFS.rifle.weapon, sub) && !canHit(UNIT_DEFS.gunboat.weapon, sub) && canHit(UNIT_DEFS.gunboat.weapon2, sub);
    r.torpedoNaval = canHit(UNIT_DEFS.sub.weapon, gb) && !canHit(UNIT_DEFS.sub.weapon, cy0) && canHit(UNIT_DEFS.sub.weapon, yard);
    const gbHp0 = gb.hp;
    gb.hp = gb.maxHp = 5000;   // (so the fight lasts long enough to see both sides)
    commandMove([gb], sub.x, sub.y);
    let seen = false; step(40, () => { if (!camoHidden(sub, 0)) seen = true; });
    r.subSpotted = seen; r.subSunk = !sub.alive; r.gunboatHit = gb.hp < 5000; r.subDist = Math.round(Math.hypot(sub.x - gb.x, sub.y - gb.y)); r.subWhy = [shipBody(sub), shipBody(gb), sub.exposed, gb.order.type, !!gb.target, sub.target && sub.target.id === gb.id, Math.round(gb.x), Math.round(gb.y), Math.round(sub.x), Math.round(sub.y)];
    r.sinkFx = G.effects.some((f) => f.type === 'sink') || !sub.alive;
    // A ship does not go after a structure it cannot reach from its water.
    const ecy = buildingsOf(1).find((b) => b.type === 'cy');
    r.cannotReachFoeYard = !shipReach(gb, ecy, gb.def.weapon);
    // Transport: two tanks and three riflemen board from the shore, it sails, they land on the far side.
    const lst = addUnit('lst', me, yard.x, (yard.cy + yard.h) * CELL + CELL); { const s = waterSpot(yard.x, yard.y, 5, shipBody(gb)); lst.x = s.x; lst.y = s.y; }
    setGuard(lst, lst.x, lst.y);
    const shore = nearestFreeCell(cellOfPos(lst.x, lst.y), 8), sc = cellCenter(shore);
    const crew = [addUnit('mtank', me, sc.x, sc.y), addUnit('ltank', me, sc.x + 8, sc.y), addUnit('rifle', me, sc.x, sc.y + 8), addUnit('rifle', me, sc.x + 6, sc.y + 6), addUnit('rifle', me, sc.x - 6, sc.y - 6), addUnit('rifle', me, sc.x - 8, sc.y)];
    for (const u of crew) setGuard(u, u.x, u.y);
    commandBoard(crew, lst); step(30);
    r.ferryAboard = (lst.cargo || []).length; r.ferryVehicles = (lst.cargo || []).filter((c) => UNIT_DEFS[c.type].cls === 'veh').length; r.ferryLeftOut = crew.filter((u) => u.alive).length; r.leftWhy = crew.filter((u) => u.alive).map((u) => [u.type, u.order.type, Math.round(Math.hypot(u.x - lst.x, u.y - lst.y)), !!u.dest, u.needPath]);
    // Out in the middle: unload refused (no shore); then to a far shore and unload there.
    let mid = null, md = -1; for (let c = 0; c < NCELLS; c++) if (N.body[c] === big && G.terr[c] === 4) { let open = 0; const x = cellX(c), y = cellY(c); for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (inMap(x + i, y + j) && G.terr[idx(x + i, y + j)] === 4) open++; if (open === 49 && Math.hypot(x - cellX(shore), y - cellY(shore)) < 30) { mid = cellCenter(c); break; } }
    if (mid) { lst.x = mid.x; lst.y = mid.y; setGuard(lst, mid.x, mid.y); commandUnload([lst]); step(2); r.unloadAtSeaRefused = lst.cargo.length === 5; }
    let dock = null, dd0 = 0;   // a far point of the lake right by the shore
    for (let c = 0; c < NCELLS; c++) { if (N.body[c] !== big || G.terr[c] !== 4) continue; const x = cellX(c), y = cellY(c); let land = false; for (const [dx, dy] of DIRS8) if (inMap(x + dx, y + dy) && passableAt((x + dx + 0.5) * CELL, (y + dy + 0.5) * CELL)) land = true;
      const p = cellCenter(c), d = Math.hypot(p.x - lst.x, p.y - lst.y); if (land && d > dd0 && d < CELL * 40) { dd0 = d; dock = p; } }
    commandMove([lst], dock.x, dock.y); step(50, () => { if (!N.cells[cellOfPos(lst.x, lst.y)]) dry++; });
    const n0 = unitsOf(0).filter((u) => !u.def.naval).length;
    commandUnload([lst]); step(6);
    const landed = unitsOf(0).filter((u) => !u.def.naval).slice(n0);
    r.ferryUnloaded = landed.length; r.landedOnLand = landed.every((u) => G.terr[cellOfPos(u.x, u.y)] !== 4 && passableAt(u.x, u.y)); r.ferryDry = dry;
    // A forged order from side 1 for side 0's Transport is refused.
    lst.cargo = [{ type: 'rifle', hp: 50, rank: 0, kills: 0, kw: 0, born: 0 }];
    NetCore.applyCommand(1, { f: 'commandUnload', a: [[{ $e: lst.id }]] }); step(1);
    r.forgedRefused = lst.cargo.length === 1;
    // Sunk with soldiers aboard: all lost.
    const lost0 = me.stats.lost; damage(lst, 99999, 'AP', null); step(0.5);
    r.sunkWithCargo = me.stats.lost - lost0 === 2 && !lst.alive;
    // The yard destroyed: no rubble on the water, side keeps going.
    kill(yard, null); step(1);
    r.yardGone = !yard.alive;
    r.errors = 0;
    return JSON.stringify(r);
  })()`)));
}
// The computer: a 1 v 1 on its own, both sides computer.
{
  const ctx = headless.load(), run = (s) => vm.runInContext(s, ctx);
  run(`newWorld('allies', 'normal', 11, 0, false, '${map}', [{ faction: 'allies', ally: 0, ai: true }, { faction: 'soviets', ally: 1, ai: true }]); for (const t of G.teams) t.auto = true; G.me = -1; 0`);
  let err = null;
  const seen = {};
  try {
    for (let i = 0; i < +mins * 60 * 30 && !run('G.over'); i++) {
      ctx.get('update')(1 / 30);
      if (i % 300 === 0) {
        const s = JSON.parse(run(`JSON.stringify(G.entities.filter((e) => e.alive && (e.def.naval || e.def.water)).map((e) => e.id + e.type))`));
        for (const k of s) seen[k] = 1;
      }
    }
  } catch (e) { err = e.stack.split('\n').slice(0, 4).join(' | '); }
  const ids = Object.keys(seen);
  out.ai = JSON.parse(run(`JSON.stringify({ t: Math.round(G.t / 60), plans: G.teams.map((t) => t.naval && { ok: t.naval.ok, creep: t.naval.creep }),
    ships: G.teams.map((t) => unitsOf(t.id).filter((u) => u.def.naval).map((u) => u.type)), killed: G.teams.map((t) => t.stats.killed), over: G.over && G.over.winner })`));
  out.ai.everSeen = { yards: ids.filter((k) => /navyard|subpen/.test(k)).length, ships: ids.filter((k) => /gunboat|destroyer|sub$/.test(k)).length };
  out.ai.err = err;
}
console.log(JSON.stringify(out, null, 1));
const want = ['yardAfterPower', 'placeWater', 'placeLandRefused', 'yardPlaced', 'queue', 'built', 'inlandStaysWet', 'subHiddenFar', 'rifleCannotHitSub', 'torpedoNaval', 'subSpotted', 'subSunk',
  'cannotReachFoeYard', 'unloadAtSeaRefused', 'landedOnLand', 'forgedRefused', 'sunkWithCargo', 'yardGone'];
const bad = want.filter((k) => out[k] !== true);
if (out.dryCells || out.ferryDry || out.ferryAboard !== 5 || out.ferryVehicles !== 2 || out.ferryUnloaded !== 5 || out.yardNeeds.some(Boolean)) bad.push('ferry/dry/needs');
if (out.ai.err || (out.ai.plans.some((p) => p && p.ok) && (!out.ai.everSeen.yards || !out.ai.everSeen.ships))) bad.push('ai');   // (on a map where its water reaches no enemy the computer builds no yard)
console.log(bad.length ? 'FAIL ' + bad.join(', ') : 'PASS');
