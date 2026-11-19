'use strict';
// Computer opponent. It plays by the same rules as the player: same tech tree, same costs.
// How it attacks and defends depends on the difficulty (DIFFICULTY[...].ai in data.js).

function aiCount(team) {
  const c = {};
  for (const e of G.entities) if (e.alive && e.team === team.id) c[e.type] = (c[e.type] || 0) + 1;
  return c;
}

// The computer does not out-mine the people it plays with (match 553c3209: its sides ended with 4 to 7 refineries and up to
// 16 Ore Trucks against a player's 2 or 3, and took more than half of the ore). Its refineries are capped at the average
// of the human sides still in the fight (at least 2); with no human in the game there is no cap. Every refinery brings a
// free Ore Truck, so this caps the trucks too. Counts refineries being built as well.
// Since 2026.11.17.18 (owner: a little looser, both modes) it may have REF_CAP_OVER more than that average: the
// computers mined about 60% of the owner's ore in his last eight wins.
const REF_CAP_OVER = 1;
function aiRefCap(team) {
  const humans = G.teams.filter((t) => !t.isAI && !t.out);
  if (!humans.length) return Infinity;
  let total = 0;
  for (const h of humans) total += buildingsOf(h.id).filter((b) => b.type === 'refinery').length;
  return Math.max(2, Math.ceil(total / humans.length)) + REF_CAP_OVER;
}

// Another Helicopter Base when it still wants a transport (AI_STYLES lift) and every pad is taken (attack helicopters keep theirs),
// once it has the money for it with some to spare; at most three bases.
function aiLiftPad(team, c) {
  const L = aiOf(team).lift, lift = team.faction === 'allies' ? 'chinook' : 'halo';
  return !!L && (c.helipad || 0) >= 1 && (c.helipad || 0) < 3 && (c[lift] || 0) < L.n && G.t > aiOf(team).firstWave * L.from &&
    padRoom(team, 'helipad') <= 0 && team.credits > BUILD_DEFS.helipad.cost + 500;
}
// slot: 'structure' (the main queue) or 'defense' (guns and anti-air, their own queue, so both build at once).
function aiNextStructure(team, c, slot = 'structure') {
  const p = team.power, defense = team.faction === 'allies' ? 'turret' : 'tesla', aa = team.faction === 'allies' ? 'aagun' : 'sam';
  const antiInf = team.faction === 'allies' ? 'pillbox' : 'ftur';
  if (team.queues[slot]) return null;
  c = Object.assign({}, c);
  for (const s of ['structure', 'defense']) { const q = team.queues[s]; if (q) c[q.type] = (c[q.type] || 0) + 1; }   // what is being built counts
  const n = (t) => c[t] || 0;
  const powerNeed = (t) => -Math.min(0, BUILD_DEFS[t].power);
  const pwr = available(team, 'apower') ? 'apower' : 'power';
  const build = (type) => (p.prod - p.use < powerNeed(type) + 10 && available(team, pwr) ? pwr : type);   // power first if needed
  // Which queue a pick is for: a defence goes in the defence queue, and when power is short the main queue builds the power plant first.
  const take = (type) => {
    const r = build(type), def = catOf(type) === 'defense';
    if (slot === 'defense') return def && r === type ? r : null;
    return def && r === type ? null : r;
  };
  // Normal and Hard: one AA site from 2:00 (up by about 2:30) whether or not it has seen aircraft (beside the
  // Construction Yard), and a second as soon as enemy aircraft turn up. These come before anything else.
  const A = aiOf(team);
  if (enemyUnitsOf(team.id).some((u) => u.cls === 'air' && !u.def.scripted)) team.sawAir = true;
  if (A.adapt && available(team, aa) && n(aa) < (team.sawAir ? 2 : G.t >= 120 ? 1 : 0)) { const r = take(aa); if (r) return r; }
  // An Outpost with no refinery beside it yet comes first: that is what it was sent out for.
  const outpostRef = aiOutpostForRefinery(team);
  const refCap = aiRefCap(team);   // an Outpost's first refinery may go one over: that is what it was sent out for
  if (outpostRef && outpostRef.got === 0 && available(team, 'refinery') && n('refinery') < Math.min(8, refCap + 1)) {
    if (slot === 'structure') return p.prod - p.use < powerNeed('refinery') + 10 && available(team, pwr) ? pwr : 'refinery';
  }
  // How many defences it may have depends on the difficulty; more AA once the enemy flies.
  const capMain = Math.round(A.defMax * 0.6), capInf = A.defMax - capMain;
  const enemyAir = enemyUnitsOf(team.id).filter((u) => u.cls === 'air' && !u.def.scripted).length;
  if (enemyAir) team.sawAir = true;
  const aaWant = team.sawAir ? Math.min(A.aaMax, A.aa + Math.ceil(enemyAir / 2)) : A.aa;
  const fast = A.econ.fast;   // Normal and Hard: the second refinery straight after the Barracks
  const wants = [
    ['refinery', 1], ['barracks', 1], ['refinery', fast ? 2 : 1],
    [antiInf, Math.min(1, capInf)], ['factory', 1], [defense, Math.min(1, capMain)], ['refinery', 2], ['dome', 1], ['depot', 1],
    ['tech', 1], ['helipad', 1], [antiInf, Math.min(2, capInf)], [defense, Math.min(2, capMain)], [aa, Math.min(1, aaWant)], ['airfield', 1],
    ['factory', 2], [defense, Math.min(3, capMain)], [aa, aaWant], ['refinery', 3], [defense, Math.min(4, capMain)],
    ['refinery', A.econ.refineries],
  ];
  for (const [type, want] of wants) {
    const count = type === 'refinery' ? Math.min(want, refCap) : want;
    if (n(type) >= count || !available(team, type)) continue;
    { const r = take(type); if (r) return r; }
  }
  // The rest of an Outpost's refineries (it wants 1 to 3, rolled when it deploys).
  if (outpostRef && available(team, 'refinery') && n('refinery') < Math.min(8, refCap)) { const r = take('refinery'); if (r) return r; }
  // Money piling up: more Barracks and War Factories, so it can build faster.
  if (team.credits > 5000) {
    if (n('factory') < 3 && available(team, 'factory')) { const r = take('factory'); if (r) return r; }
    if (n('barracks') < 2 && available(team, 'barracks')) { const r = take('barracks'); if (r) return r; }
  }
  // Then a gun at each Outpost (and on Hard each outlying refinery), and more defences while rich.
  if (available(team, defense) && aiGuardSite(team) && n(defense) < capMain) { const r = take(defense); if (r) return r; }
  if (team.credits > (A.defRich || 1500)) {   // a turtle tops its guns up from less money (defRich)
    const t = n(defense) / Math.max(1, capMain) <= n(antiInf) / Math.max(1, capInf) ? defense : antiInf;
    const other = t === defense ? antiInf : defense, cap = (x) => (x === defense ? capMain : capInf);
    for (const x of [t, other]) if (n(x) < cap(x) && available(team, x)) { const r = take(x); if (r) return r; }
  }
  if (slot === 'structure' && p.prod - p.use < 40) return pwr;
  return null;
}
// Where the next AA site goes: beside whichever refinery, power plant, Outpost or other key
// building has the least AA cover, favouring the area enemy aircraft last struck.
function aiAaSite(team) {
  const mine = buildingsOf(team.id), aas = mine.filter((b) => b.def.antiAir);
  const keys = mine.filter((b) => ['refinery', 'power', 'apower', 'outpost', 'cy', 'factory', 'airfield'].includes(b.type) && b.buildT >= 1);
  const hit = team.airHit && G.t - team.airHit.t < 90 ? team.airHit : null;
  let best = null, bs = Infinity;
  for (const b of keys) {
    const sc = aas.filter((a) => dist(a, b) < CELL * 6).length * 10 + (hit ? Math.hypot(b.x - hit.x, b.y - hit.y) / CELL * 0.3 : Math.random() * 3) -
      (b.type === 'cy' ? 5 : 0);   // the Construction Yard is covered first: losing it loses the game
    if (sc < bs) { bs = sc; best = b; }
  }
  return best;
}
// Normal and Hard keep a few anti-aircraft soldiers or vehicles at home once enemy aircraft are
// about, posted beside the key buildings, instead of sending them out with the waves.
function aiHomeGuard(team, u) {
  const A = aiOf(team);
  const hitsAir = (w) => !!(w && w.air && !w.heliOnly);   // Rangers (heliOnly) cannot hit jets, so they are not posted as anti-air
  if (!A.adapt || !team.sawAir || u.cls === 'air' || !(hitsAir(u.def.weapon) || hitsAir(u.def.weapon2))) return false;
  if (unitsOf(team.id).filter((e) => e.homeGuard).length >= A.homeGuard) return false;
  const site = aiAaSite(team);
  if (!site) return false;
  const a = Math.random() * Math.PI * 2, x = site.x + Math.cos(a) * CELL * 2.5, y = site.y + Math.sin(a) * CELL * 2.5;
  setGuard(u, x, y); u.staged = false; u.homeGuard = true;
  goTo(u, x, y);
  return true;
}
// And a fighter or two kept back on the Airfield to go after enemy aircraft over the base.
function aiKeepInterceptor(team, u) {
  const A = aiOf(team);
  if (!A.adapt || !team.sawAir || !(u.def.weapon2 && u.def.weapon2.air)) return false;
  if (unitsOf(team.id).filter((e) => e.interceptor).length >= A.interceptors) return false;
  u.interceptor = true;
  return true;
}
// An Outpost short of guns (or on Hard an outlying refinery with none beside it yet).
function aiGuardSite(team) {
  const A = aiOf(team);
  if (!A.guard.length) return null;
  const mine = buildingsOf(team.id), cy = mine.find((b) => b.type === 'cy');
  const guns = mine.filter((b) => b.def.defense && !b.def.antiAir);
  // Outposts get guns up to A.outpostGuns; outlying refineries (Hard) one each.
  return mine.find((b) => A.guard.includes(b.type) && b.buildT >= 1 && (b.type !== 'refinery' || (cy && dist(b, cy) > CELL * 14)) &&
    guns.filter((d) => dist(d, b) < CELL * 6).length < (b.type === 'outpost' ? A.outpostGuns || 1 : 1)) || null;
}

// Little ore left within reach of its refineries (and Outposts): under STARVED credits' worth (not counting gems)
// within 14 cells of any of them. Worked out every 10 seconds.
const STARVED = 2500;
function aiStarved(team) {
  if (team.starvedT !== undefined && G.t - team.starvedT < 10 && G.t >= team.starvedT) return !!team.starved;
  team.starvedT = G.t;
  const sites = buildingsOf(team.id).filter((b) => b.type === 'refinery' || b.type === 'outpost');
  let ore = 0;
  for (const b of sites) {
    for (let y = b.cy - 14; y <= b.cy + 14; y++) for (let x = b.cx - 14; x <= b.cx + 14; x++) {
      if (!inMap(x, y)) continue;
      const c = idx(x, y);
      if (G.ore[c] && !G.gem[c] && Math.hypot(x - b.cx, y - b.cy) <= 14) ore += G.ore[c];
    }
    if (ore >= STARVED) break;
  }
  team.starved = sites.length > 0 && ore < STARVED;
  return team.starved;
}
// Forward mining: an ore field on its own half of the map that its refineries are far from.
// On Normal and Hard (expand) only fields well past its own base fields count, and a field is taken
// only when a refinery or Outpost stands right beside it.
function aiRemoteField(team) {
  const mine = buildingsOf(team.id).filter((b) => b.type === 'refinery' || b.type === 'outpost' || b.type === 'cy');
  const home = team.start, foe = enemyOf(team).start, expand = aiOf(team).expand || 0;
  let best = null, bd = Infinity;
  for (const f of G.oreFields) {
    let ore = 0;
    for (let y = Math.floor(f.cy - f.r); y <= f.cy + f.r; y++) for (let x = Math.floor(f.cx - f.r); x <= f.cx + f.r; x++) if (inMap(x, y)) ore += G.ore[idx(x, y)];
    if (ore < 800) continue;
    const dHome = Math.hypot(f.cx - home.cx, f.cy - home.cy);
    if (dHome > Math.hypot(f.cx - foe.cx, f.cy - foe.cy)) continue;
    if (expand) {
      if (dHome < expand) continue;
      if (mine.some((b) => b.type !== 'cy' && Math.hypot(b.cx - f.cx, b.cy - f.cy) < f.r + 5)) continue;
    } else if (mine.some((b) => Math.hypot(b.cx - f.cx, b.cy - f.cy) < 15)) continue;
    if (dHome < bd) { bd = dHome; best = f; }
  }
  return best;
}
// Refineries at an Outpost: the ones built for it (b.refineries; they can land a little over 9 cells
// away) plus any other right beside it.
function aiOutpostRefineries(team, o) {
  const own = (o.refineries || []).filter((r) => r.alive);
  return own.length + buildingsOf(team.id).filter((r) => r.type === 'refinery' && !own.includes(r) && dist(r, o) < CELL * 9).length;
}
// An Outpost that wants another refinery, fewest first; .got says how many it has. Each Outpost wants
// 1 to 3 (o.refWant, rolled once), so a player cannot count on finding just one.
function aiOutpostForRefinery(team) {
  let best = null, bg = Infinity;
  for (const o of buildingsOf(team.id)) {
    if (o.type !== 'outpost' || o.buildT < 1) continue;
    if (!o.refWant) o.refWant = 1 + Math.floor(Math.random() * 3);
    const got = aiOutpostRefineries(team, o);
    if (got < o.refWant && got < bg) { bg = got; best = o; }
  }
  if (best) best.got = bg;
  return best;
}
// A driving Outpost or Construction Yard that has not moved for AI_DRIVE_STALL seconds is jammed (a wall of units, a
// path that leads nowhere): true after it has had a go at unpacking where it stands (the caller picks a new goal if not).
const AI_DRIVE_STALL = 20;
function aiDriveStalled(u) {
  if (!u.aiMove || Math.hypot(u.x - u.aiMove.x, u.y - u.aiMove.y) > 6) { u.aiMove = { x: u.x, y: u.y, t: G.t }; return false; }
  if (G.t - u.aiMove.t < AI_DRIVE_STALL) return false;
  u.aiMove = null;
  return true;
}
// Drive a Mobile Outpost to just short of the field (on the home side) and deploy it there; on
// Normal and Hard right at the field's edge, so the refinery that follows sits on the ore.
function aiDriveFob(team, u) {
  if (!u.aiGoal) {
    const f = aiRemoteField(team);
    if (!f) return;
    const a = Math.atan2(team.start.cy - f.cy, team.start.cx - f.cx), back = f.r + (aiOf(team).expand ? 1.5 : 3);
    u.aiGoal = { x: (f.cx + 0.5 + Math.cos(a) * back) * CELL, y: (f.cy + 0.5 + Math.sin(a) * back) * CELL };
    commandMove([u], u.aiGoal.x, u.aiGoal.y);
    return;
  }
  const d = Math.hypot(u.x - u.aiGoal.x, u.y - u.aiGoal.y);
  if (u.order.type !== 'guard' && aiDriveStalled(u)) { if (!deployFob(u)) { u.aiGoal = null; commandStop([u]); } return; }
  if (d < CELL * 2.5 || (u.order.type === 'guard' && d < CELL * 6)) { if (!deployFob(u)) u.aiGoal = null; }
  else if (u.order.type === 'guard') commandMove([u], u.aiGoal.x, u.aiGoal.y);
}

// A Mobile Construction Yard rebuilds a lost yard: it drives to where the first one stood (or near it,
// further out after each failed try) and unpacks there.
function aiDriveMcv(team, u) {
  if (u.evac === undefined && team.evacFor != null) { u.evac = team.evacFor; team.evacFor = null; u.expand = false; }   // the escape MCV (aiEvac)
  if (u.evac != null) { aiDriveEvac(team, u); return; }
  if (u.expand === undefined) u.expand = !!aiMainYard(team);   // built while the main yard stands: it is for a second base
  if (u.expand && !u.aiGoal) {
    const f = team.expField || aiExpandField(team), k = u.mcvTries || 0;   // the field it was bought for
    if (!f) { u.expand = false; return; }
    const a = Math.atan2(team.start.cy - f.cy, team.start.cx - f.cx) + (k ? (Math.random() - 0.5) * 1.5 : 0), back = f.fwd ? k * 1.5 : f.r + 4 + k * 1.5;
    u.aiGoal = { x: (f.cx + 0.5 + Math.cos(a) * back) * CELL, y: (f.cy + 0.5 + Math.sin(a) * back) * CELL };
    commandMove([u], u.aiGoal.x, u.aiGoal.y);
    return;
  }
  if (!u.aiGoal) {
    const k = u.mcvTries || 0, a = Math.random() * Math.PI * 2, r = k ? 2 + k * 1.5 : 0;
    u.aiGoal = { x: (team.start.cx + 0.5 + Math.cos(a) * r) * CELL, y: (team.start.cy + 0.5 + Math.sin(a) * r) * CELL };
    commandMove([u], u.aiGoal.x, u.aiGoal.y);
    return;
  }
  const d = Math.hypot(u.x - u.aiGoal.x, u.y - u.aiGoal.y);
  if (u.order.type !== 'guard' && aiDriveStalled(u)) { if (!deployFob(u)) { u.aiGoal = null; u.mcvTries = (u.mcvTries || 0) + 1; commandStop([u]); } return; }
  if (d < CELL * 2.5 || (u.order.type === 'guard' && d < CELL * 6)) { if (!deployFob(u)) { u.aiGoal = null; u.mcvTries = (u.mcvTries || 0) + 1; } }
  else if (u.order.type === 'guard') commandMove([u], u.aiGoal.x, u.aiGoal.y);
}

// --- Escape to an ally (team games, every difficulty, both modes) -------------------------------------------
// A computer that rolled it (EVAC_CHANCE by personality, once a battle: team.evac) and thinks it is about to be beaten
// buys one MCV (it jumps the queue), drives it to an ally's base and unpacks it at the edge away from the enemy, so it can
// rebuild there. About to be beaten: a Construction Yard below half health and hit in the last EVAC_HIT seconds, or at most
// EVAC_LEFT of its most buildings left with EVAC_FOES enemy units within EVAC_NEAR cells of its yard. Once a battle.
const EVAC_CHANCE = { turtle: 0.7, balanced: 0.5, raider: 0.4, rusher: 0.25 }, EVAC_HIT = 10, EVAC_LEFT = 0.4, EVAC_FOES = 3, EVAC_NEAR = 14, EVAC_PAY = 0.25;
const aiAllyYard = (o) => { const ys = aiYards(o); return ys.find((b) => Math.hypot(b.cx - o.start.cx, b.cy - o.start.cy) < BASE2_SEP) || ys[0]; };
function aiEvac(team, mcvs) {
  if (team.evac === undefined) team.evac = Math.random() < (EVAC_CHANCE[team.style] || EVAC_CHANCE.balanced);
  const n = buildingsOf(team.id).length;
  team.peakB = Math.max(team.peakB || 0, n);
  if (!team.evac || team.evacDone || mcvs.length || team.queues.vehicle.some((i) => i.type === 'mcv') || !available(team, 'mcv')) return;
  const home = aiMainYard(team) || aiYards(team)[0];
  if (!home) return;   // no yard at all: the ordinary rebuild at home takes over
  const allies = alliesOf(team).filter((o) => aiAllyYard(o));
  if (!allies.length) return;
  const hit = aiYards(team).some((b) => b.hp < b.maxHp * 0.5 && G.t - (b.hitT || -99) < EVAC_HIT);
  const foes = enemyUnitsOf(team.id).filter((u) => !isAirborne(u) && Math.hypot(u.x - home.x, u.y - home.y) < EVAC_NEAR * CELL).length;
  if (!hit && !(team.peakB >= 5 && n <= team.peakB * EVAC_LEFT && foes >= EVAC_FOES)) return;
  if (team.credits < UNIT_DEFS.mcv.cost * EVAC_PAY) return;   // it pays as it builds (front of the queue): a start is enough; tries again each think
  const to = allies.reduce((a, o) => (buildingsOf(o.id).length > buildingsOf(a.id).length ? o : a));   // the strongest ally
  team.evacFor = to.id; team.evacDone = true;
  startProduction(team, 'mcv');
  const vq = team.queues.vehicle, i = vq.findIndex((x) => x.type === 'mcv');
  if (i > 0) vq.unshift(vq.splice(i, 1)[0]);
}
// Drive the escape MCV to its ally's yard and unpack it EVAC_OFF cells out on the side away from the enemy (further out
// and turned a little after each failed try). If that ally has no yard left, another ally's; if none, home as usual.
const EVAC_OFF = 8;
function aiDriveEvac(team, u) {
  let to = G.teams[u.evac];
  if (!to || to.out || !aiAllyYard(to)) {
    to = alliesOf(team).find((o) => aiAllyYard(o));
    if (!to) { u.evac = null; u.aiGoal = null; return; }
    u.evac = to.id; u.aiGoal = null;
  }
  if (!u.aiGoal) {
    const y = aiAllyYard(to), foe = enemyOf(to).start, k = u.mcvTries || 0;
    const a = Math.atan2(y.cy - foe.cy, y.cx - foe.cx) + (k ? (Math.random() - 0.5) * 2 : 0), r = EVAC_OFF + k * 1.5;
    const cx = Math.max(2, Math.min(MAP - 3, y.cx + 1 + Math.cos(a) * r)), cy = Math.max(2, Math.min(MAP - 3, y.cy + 1 + Math.sin(a) * r));
    u.aiGoal = { x: cx * CELL, y: cy * CELL };
    commandMove([u], u.aiGoal.x, u.aiGoal.y);
    return;
  }
  const d = Math.hypot(u.x - u.aiGoal.x, u.y - u.aiGoal.y);
  if (u.order.type !== 'guard' && aiDriveStalled(u)) { if (!deployFob(u)) { u.aiGoal = null; u.mcvTries = (u.mcvTries || 0) + 1; commandStop([u]); } return; }
  if (d < CELL * 2.5 || (u.order.type === 'guard' && d < CELL * 6)) { if (!deployFob(u)) { u.aiGoal = null; u.mcvTries = (u.mcvTries || 0) + 1; } }
  else if (u.order.type === 'guard') commandMove([u], u.aiGoal.x, u.aiGoal.y);
}

// --- Second base (Normal and Hard, both modes) --------------------------------------------------------------
// From EXPAND_FROM, with money to spare, a computer that rolled it (EXPAND_CHANCE by personality, once a battle: team.exp2)
// buys a Mobile Construction Yard, drives it to a rich ore field on its own half (aiExpandField) and unpacks it there,
// then builds a small base round it (aiBase2Next): refineries, power, a Barracks and a War Factory, guns and anti-air.
// One at a time; if it is lost, it may try again after EXPAND_RETRY. The main yard is the one within BASE2_SEP cells of its start.
const EXPAND_CHANCE = { balanced: 0.8, raider: 0.8, turtle: 0.5, rusher: 0 }, EXPAND_FROM = 600, EXPAND_RETRY = 300, BASE2_SEP = 18;
const aiYards = (team) => buildingsOf(team.id).filter((b) => b.type === 'cy');
const aiMainYard = (team) => aiYards(team).find((b) => Math.hypot(b.cx - team.start.cx, b.cy - team.start.cy) < BASE2_SEP);
const aiBase2 = (team) => aiYards(team).find((b) => Math.hypot(b.cx - team.start.cx, b.cy - team.start.cy) >= BASE2_SEP);
// The richest ore field on its own half, 20 cells or more from its start, with no yard of its own or known enemy building near.
function aiExpandField(team) {
  const home = team.start, foe = enemyOf(team).start, yards = aiYards(team);
  const theirs = enemyBuildingsOf(team.id).filter((b) => knownTo(team.id, b));
  // Only fields its units can drive to from the main base (not across a lake or behind cliffs and trees), by a road no more than
  // twice as long as the straight line (+20 cells): a base on an island or in a pocket could never send its army out.
  const main = aiMainYard(team);
  let walk = null;
  if (main) {
    const c0 = cellOfPos(main.x, main.y + main.h * CELL / 2 + CELL), c1 = freeCell(c0) ? c0 : nearestFreeCell(c0, 4);
    if (c1 >= 0) walk = walkDistances(c1);
  }
  if (!walk) return null;
  let best = null, bs = 0;
  for (const f of G.oreFields) {
    const dHome = Math.hypot(f.cx - home.cx, f.cy - home.cy);
    const fc = idx(Math.round(f.cx), Math.round(f.cy)), fw = walk[freeCell(fc) ? fc : (nearestFreeCell(fc, 6) >= 0 ? nearestFreeCell(fc, 6) : 0)];
    if (!(fw >= 0) || fw > dHome * 2 + 20) continue;
    if (dHome < 20 || dHome > Math.hypot(f.cx - foe.cx, f.cy - foe.cy)) continue;
    if (yards.some((b) => Math.hypot(b.cx - f.cx, b.cy - f.cy) < BASE2_SEP + f.r + 4) || theirs.some((b) => Math.hypot(b.cx - f.cx, b.cy - f.cy) < 15)) continue;
    let ore = 0;
    for (let y = Math.floor(f.cy - f.r); y <= f.cy + f.r; y++) for (let x = Math.floor(f.cx - f.r); x <= f.cx + f.r; x++) if (inMap(x, y)) ore += G.ore[idx(x, y)];
    if (ore < 3000) continue;
    const sc = ore / (1 + dHome / 30);
    if (sc > bs) { bs = sc; best = f; }
  }
  return best;
}
// A rusher's second base is a forward base (owner's pick): once it has found an enemy base, it unpacks a Mobile Construction Yard
// FWD_DIST cells out from the nearest known enemy building, on its own side of it (the way toward its start, turned up to about
// 45 degrees either way), FWD_GUNS cells clear of the guns it knows of and of every known enemy building, on ground it can drive
// to; nearer an ore field is better. Then it builds production first (aiBase2Next), so its new units start close to the enemy.
const FWD_DIST = 35, FWD_GUNS = 6;
function aiForwardSpot(team) {
  const yard = aiMainYard(team);
  if (!yard) return null;
  const theirs = enemyBuildingsOf(team.id).filter((b) => targetable(team.id, b));
  if (!theirs.length) return null;
  const home = team.start, near = theirs.reduce((a, b) => (Math.hypot(a.cx - home.cx, a.cy - home.cy) <= Math.hypot(b.cx - home.cx, b.cy - home.cy) ? a : b));
  const guns = theirs.filter((b) => b.def.weapon && !b.def.antiAir);
  const c0 = cellOfPos(yard.x, yard.y + yard.h * CELL / 2 + CELL), c1 = freeCell(c0) ? c0 : nearestFreeCell(c0, 4);
  if (!(c1 >= 0)) return null;
  const walk = walkDistances(c1);
  const toHome = Math.atan2(home.cy - near.cy, home.cx - near.cx);
  let best = null, bs = -Infinity;
  for (let da = -0.8; da <= 0.81; da += 0.2) for (let r = FWD_DIST - 3; r <= FWD_DIST + 3; r += 2) {
    const cx = Math.round(near.cx + Math.cos(toHome + da) * r), cy = Math.round(near.cy + Math.sin(toHome + da) * r);
    if (!inMap(cx, cy) || walk[idx(cx, cy)] < 0) continue;
    if (theirs.some((b) => Math.hypot(b.cx - cx, b.cy - cy) < FWD_DIST - 4)) continue;
    if (guns.some((b) => Math.hypot(b.cx - cx, b.cy - cy) < (b.def.weapon.range / CELL) + FWD_GUNS)) continue;
    if (Math.hypot(home.cx - cx, home.cy - cy) < BASE2_SEP + 4) continue;   // (no nearer home than a second base would be)
    let ore = 0;
    for (const f of G.oreFields) if (Math.hypot(f.cx - cx, f.cy - cy) < f.r + 8) ore = 1;
    const sc = ore * 3 - Math.abs(da) * 2 - Math.abs(r - FWD_DIST) * 0.2 + Math.random() * 0.5;
    if (sc > bs) { bs = sc; best = { cx, cy, r: 0, fwd: true }; }
  }
  return best;
}
// What the second base wants next (counted within 12 cells of its yard), or null.
function aiBase2Next(team, b2, c) {
  const near = buildingsOf(team.id).filter((b) => dist(b, b2) < CELL * 12), n = (t) => near.filter((b) => b.type === t).length;
  const p = team.power, pwr = available(team, 'apower') ? 'apower' : 'power';
  const gun = team.faction === 'allies' ? 'turret' : 'tesla', aa = team.faction === 'allies' ? 'aagun' : 'sam';
  const ore = G.oreFields.some((f) => Math.hypot(f.cx - b2.cx, f.cy - b2.cy) < f.r + 10);
  const wants = team.expField && team.expField.fwd ?   // a rusher's forward base: production first, a refinery only with ore beside it
    [[pwr, 1], ['barracks', 1], ['factory', 1], [gun, 1], ['refinery', ore ? 1 : 0], [gun, 2], [aa, team.sawAir ? 1 : 0], [gun, aiOf(team).guns2 || 2]] :
    [['refinery', 1], [pwr, 1], ['barracks', 1], [gun, 1], ['refinery', 2], ['factory', 1], [gun, 2], [aa, team.sawAir ? 1 : 0], [gun, aiOf(team).guns2 || 2]];
  for (const [t, want] of wants) {
    if (n(t) >= want || !available(team, t)) continue;
    if (t === 'refinery' && (c.refinery || 0) >= Math.min(8, aiRefCap(team) + 1)) continue;
    const need = -Math.min(0, BUILD_DEFS[t].power);
    return p.prod - p.use < need + 10 && available(team, pwr) ? pwr : t;
  }
  return null;
}
function aiFindSpot(team, type, at) {
  const cy = aiMainYard(team) || G.entities.find((e) => e.alive && e.team === team.id && e.type === 'cy');
  const lonely = !at && type === 'refinery' && aiOutpostForRefinery(team);
  const d = BUILD_DEFS[type], foe = enemyOf(team).start;
  const guard = !at && ((d.defense && !d.antiAir && aiGuardSite(team)) || (d.antiAir && aiOf(team).adapt && aiAaSite(team)));
  const anchor = at || guard || lonely || cy || buildingsOf(team.id)[0];
  if (!anchor) return null;
  // Guns face the enemy base, or on Normal and Hard the way recent attacks came from.
  const from = team.attackFrom && team.attackFrom.length && aiOf(team).targets !== 'cy' && !guard ? team.attackFrom : null;
  const toFoe = from ? from[Math.floor(Math.random() * from.length)] : Math.atan2(foe.cy - anchor.cy, foe.cx - anchor.cx);
  // Refineries go toward the nearest ore field so trucks have short trips.
  let toOre = 0;
  // At an Outpost every refinery faces its own field, even when one already stands there.
  if (type === 'refinery') {
    let bd = Infinity;
    for (const f of G.oreFields) {
      const dd = Math.hypot(f.cx - anchor.cx, f.cy - anchor.cy);
      if (dd < bd && (anchor === lonely || anchor === at || !buildingsOf(team.id).some((b) => b.type === 'refinery' && Math.hypot(f.cx - b.cx, f.cy - b.cy) < 7))) { bd = dd; toOre = Math.atan2(f.cy - anchor.cy, f.cx - anchor.cx); }
    }
  }
  for (let i = 0; i < 160; i++) {
    const a = d.antiAir || guard ? Math.random() * Math.PI * 2 : d.defense ? toFoe + (Math.random() - 0.5) * 1.6 : type === 'refinery' && i < 100 ? toOre + (Math.random() - 0.5) * 1.2 : Math.random() * Math.PI * 2;
    const rad = guard ? 2 + Math.random() * 3 + i * 0.03 : d.defense ? 5 + Math.random() * 4 + i * 0.02 : 3 + i * 0.06 + Math.random() * 3;
    const cx = Math.round(anchor.cx + 1 + Math.cos(a) * rad - d.w / 2), cy2 = Math.round(anchor.cy + 1 + Math.sin(a) * rad - d.h / 2);
    if (canPlace(team, type, cx, cy2, 1)) return { cx, cy: cy2 };
  }
  return null;
}

function aiCasTarget(team) {
  const seen = G.fog[team.id], vehs = enemyUnitsOf(team.id).filter((u) => u.cls === 'veh' && !u.def.harvester && seen && seen[cellOfPos(u.x, u.y)]);
  let best = null, bn = 2;
  for (const v of vehs) {
    const n = vehs.filter((o) => Math.hypot(o.x - v.x, o.y - v.y) < POWERS.cas.r).length;
    if (n > bn) { bn = n; best = v; }
  }
  return best && { x: best.x, y: best.y };
}
function aiPowerTarget(team, cluster) {
  const theirs = buildingsOf(enemyOf(team).id).filter((b) => targetable(team.id, b));
  if (!theirs.length) return null;
  if (!cluster) {
    const econ = theirs.filter((b) => b.type === 'refinery' || b.type === 'power' || b.type === 'apower');
    const pick = (econ.length ? econ : theirs)[Math.floor(Math.random() * (econ.length || theirs.length))];
    return { x: pick.x, y: pick.y + CELL * 2 };
  }
  let best = null, bn = -1;
  for (const b of theirs) {
    const n = theirs.filter((o) => Math.hypot(o.x - b.x, o.y - b.y) < CELL * 4).length;
    if (n > bn) { bn = n; best = b; }
  }
  return { x: best.x, y: best.y };
}

// Air assaults by personality (Normal and Hard; Easy has none): AI_STYLES `lift`. Drops pick up idle infantry by a Barracks
// (assaultPlan / startAssault in world.js) and land where no known anti-air covers. Allies never drop within LIFT_ALLY_R of each
// other's drops of the last LIFT_ALLY_T seconds (G.liftDrops). Hard waits a quarter less between drops of their own.
// LIFT_LAND: a paired drop lands as the wave's lead gets this many cells from the target (the wave engaging, owner's pick), and its
// soldiers attack at once; the transport leaves at once if the wave is already fighting; LIFT_OFF: how far from the target
// drops land (cells; well outside most base guns); LIFT_ENGAGED: a wave this near its target (cells), or fighting, has engaged.
const LIFT_ALLY_R = 10, LIFT_ALLY_T = 60, LIFT_LAND = 6, LIFT_OFF = [10, 12], LIFT_ENGAGED = 8;
const unitDir = (a, b) => { const d = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / d, y: (b.y - a.y) / d }; };
function liftSafe(team, from, to, wide = 1) {
  const aa = knownAA(team.id, false), hit = (p) => aa.some((a) => Math.hypot(a.x - p.x, a.y - p.y) < a.r * wide);
  if (hit(to)) return false;
  if (wide <= 1) return true;
  const n = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (CELL * 2)), on = (p) => aa.some((a) => Math.hypot(a.x - p.x, a.y - p.y) < a.r);
  for (let i = 1; i < n; i++) if (on({ x: from.x + (to.x - from.x) * i / n, y: from.y + (to.y - from.y) * i / n })) return false;
  return true;
}
function liftClash(team, p) {
  G.liftDrops = (G.liftDrops || []).filter((d) => G.t - d.t < LIFT_ALLY_T);
  return G.liftDrops.some((d) => d.side !== team.id && alliedSides(d.side, team.id) && Math.hypot(d.x - p.x, d.y - p.y) < CELL * LIFT_ALLY_R);
}
// A drop for this side: the spot `want` (moved to open ground), if safe and clear of its allies' drops.
function aiLiftGo(team, plan, want, extra) {
  const L = aiOf(team).lift, drop = landSpot(want.x, want.y, plan.heli);
  if (!drop || !liftSafe(team, plan.bar, drop, L.aaWide) || liftClash(team, drop)) return false;
  if (!startAssault(team, plan, drop, extra)) return false;
  G.liftDrops.push({ side: team.id, x: drop.x, y: drop.y, t: G.t });
  team.lifts = (team.lifts || 0) + 1;
  return true;
}
// With a ground wave (rusher: behind the target, the side the wave is not coming from; balanced and a stalled turtle: on a flank).
// The soldiers board now (taken out of the wave); the transport waits on the ground and leaves so as to land about as the wave
// arrives (aiAirAssault keeps goAt up to date).
function aiLiftWithWave(team, ready, target) {
  const L = aiOf(team).lift, plan = assaultPlan(team, { min: L.min, prefer: L.prefer });
  if (typeof plan === 'string' || !target) return ready;
  const mid = { x: ready.reduce((s, u) => s + u.x, 0) / ready.length, y: ready.reduce((s, u) => s + u.y, 0) / ready.length };
  // Spots round the target, best first: straight behind it (rusher) or square to the wave's line (flank), then turned further
  // round, a little further out; the first one clear of known anti-air is used.
  const d = unitDir(mid, target), side = Math.random() < 0.5 ? 1 : -1, base = Math.atan2(d.y, d.x);
  const turns = L.pair === 'behind' ? [0, 0.6, -0.6, 1.1, -1.1] : [1.57, -1.57, 1.1, -1.1, 2.1, -2.1].map((t) => t * side);
  const crew = new Set(plan.crew), wave = ready.filter((u) => !crew.has(u));
  if (wave.length < (L.minWave || 3)) return ready;   // (balanced: no drop with a small wave, which cannot cover a landing)
  let ok = false;
  for (const r of LIFT_OFF) for (const t of turns) {
    if (ok) break;
    ok = aiLiftGo(team, plan, { x: target.x + Math.cos(base + t) * CELL * r, y: target.y + Math.sin(base + t) * CELL * r }, { mode: 'hunt', goAt: Infinity });
  }
  if (!ok) return ready;
  team.liftPair = { heli: plan.heli.id, tid: target.id, tx: target.x, ty: target.y, wave: wave.slice(0, 12).map((u) => u.id), t: G.t };
  team.liftWave = { tx: target.x, ty: target.y, wave: team.liftPair.wave };   // for aiLiftRelease
  return wave;
}
// When the paired transport should leave: the wave's lead needs (distance - LIFT_LAND cells) / its slowest speed; the
// transport its pickup's remaining boarding plus the flight.
function aiLiftTiming(team) {
  const pr = team.liftPair, h = pr && G.byId.get(pr.heli);
  if (!pr) return;
  if (!h || !h.alive || h.order.type !== 'lift' || h.order.step !== 'pick' || G.t - pr.t > 300) { team.liftPair = null; if (h && h.alive && h.order.goAt) h.order.goAt = G.t; return; }
  const wave = pr.wave.map((id) => G.byId.get(id)).filter((u) => u && u.alive);
  if (!wave.length) { h.order.goAt = G.t; team.liftPair = null; return; }
  const lead = wave.reduce((a, b) => (Math.hypot(a.x - pr.tx, a.y - pr.ty) < Math.hypot(b.x - pr.tx, b.y - pr.ty) ? a : b));
  const slow = Math.min(...wave.map((u) => u.def.speed || 30)) * 0.8;
  const waveT = Math.max(0, Math.hypot(lead.x - pr.tx, lead.y - pr.ty) - CELL * LIFT_LAND) / slow;
  const flyT = Math.hypot(h.order.dx - h.order.x, h.order.dy - h.order.y) / h.def.speed + 4;
  const fighting = wave.some((u) => u.target && u.target.alive && Math.hypot(u.x - pr.tx, u.y - pr.ty) < CELL * 16);
  h.order.goAt = fighting ? G.t : G.t + Math.max(0, waveT - flyT);
  if (h.order.goAt <= G.t) team.liftPair = null;
}
// A turtle's reinforcements: an outlying building (a second base, a lone refinery) with raiders at it gets the idle infantry of
// the main base, set down on the side toward home, holding the spot.
function aiLiftDefend(team) {
  if (!team.raiders || !team.raiders.length || G.t < (team.liftDefT || 0)) return false;
  team.liftDefT = G.t + 5;
  const main = aiMainYard(team);
  if (!main) return false;
  const mine = buildingsOf(team.id);
  for (const id of team.raiders) {
    const r = G.byId.get(id);
    if (!r || !r.alive) continue;
    const b = mine.reduce((a, x) => (!a || distTo(r, x) < distTo(r, a) ? x : a), null);
    if (!b || distTo(r, b) > CELL * 10 || dist(b, main) < CELL * 18) continue;
    const plan = assaultPlan(team, { min: 4 });
    if (typeof plan === 'string') return false;
    const d = unitDir(b, main);
    if (aiLiftGo(team, plan, { x: b.x + d.x * CELL * 3, y: b.y + d.y * CELL * 3 }, { mode: 'guard' })) { team.liftDefT = G.t + 60; return true; }
    return false;
  }
  return false;
}
// Drops of their own (rusher, raider): the rusher at the economy or the edge of the base, the raider behind refineries, power
// and Outposts (and Ore Trucks it can see out in the open), landing on the far side from its own base.
const LIFT_OUT_W = 4;
function aiLiftSolo(team) {
  const A = aiOf(team), L = A.lift;
  if (!L.solo || G.t < A.firstWave || G.t < (team.assaultT || 0) || !enemyBaseKnown(team.id)) return;
  team.assaultT = G.t + 15;
  const plan = assaultPlan(team, { min: L.min, prefer: L.prefer });
  if (typeof plan === 'string') return;
  const home = aiMainYard(team) || plan.bar;
  // Raider: Ore Trucks in the open and refineries, Outposts and power away from their side's main base weigh LIFT_OUT_W (they are
  // seldom guarded) and land 4 cells off; anything in a main base weighs 1 and lands LIFT_OFF cells off, beyond it.
  const picks = [], yardOf = (tid) => buildingsOf(tid).find((b) => b.type === 'cy');
  const outlying = (e) => { const y = yardOf(e.team); return !y || dist(e, y) > CELL * 18; };
  if (L.eco) {
    const seen = inViewOf(team.id);
    for (const b of enemyBuildingsOf(team.id)) if (['refinery', 'power', 'apower', 'outpost'].includes(b.type) && targetable(team.id, b)) picks.push([b, outlying(b) ? LIFT_OUT_W : 1]);
    for (const u of enemyUnitsOf(team.id)) if (u.def.harvester && seen(u) && outlying(u)) picks.push([u, LIFT_OUT_W]);
  }
  const total = picks.reduce((s, p) => s + p[1], 0);
  const roll = () => { let r = Math.random() * total; for (const p of picks) if ((r -= p[1]) <= 0) return p[0]; return picks[picks.length - 1][0]; };
  for (let i = 0; i < 5; i++) {
    let want;
    const off = CELL * (LIFT_OFF[0] + Math.random() * (LIFT_OFF[1] - LIFT_OFF[0]));
    if (L.eco && picks.length) { const t = roll(), d = unitDir(home, t), r = outlying(t) ? CELL * 4 : off; want = { x: t.x + d.x * r, y: t.y + d.y * r }; }
    else {   // the rusher: off the economy, on its own side of it
      const t = aiPowerTarget(team, false);
      if (!t) return;
      const d = unitDir(t, home); want = { x: t.x + d.x * off, y: t.y + d.y * off };
    }
    if (aiLiftGo(team, plan, want, { mode: 'hunt' })) { team.assaultT = G.t + L.solo * (G.diffKey === 'hard' ? 0.75 : 1) * (0.8 + Math.random() * 0.4); return; }
  }
}
// Soldiers dropped with a wave hold where they landed (unloadOne 'wait') until the wave engages: one of its units fighting or
// within LIFT_ENGAGED cells of the target, or the wave gone. Then they attack, at most LIFT_HOLD_MAX s after landing.
function aiLiftRelease(team) {
  const lw = team.liftWave;
  let go = !lw;
  if (lw) {
    const wave = lw.wave.map((id) => G.byId.get(id)).filter((u) => u && u.alive);
    go = !wave.length || wave.some((u) => (u.target && u.target.alive) || Math.hypot(u.x - lw.tx, u.y - lw.ty) < CELL * LIFT_ENGAGED);
  }
  for (const u of unitsOf(team.id)) {
    if (!u.liftWait) continue;
    if (go || G.t >= u.liftWait || (u.target && u.target.alive)) { u.liftWait = 0; if (!(u.target && u.target.alive)) setHunt(u); u.staged = false; }
  }
  if (go && lw && !unitsOf(team.id).some((u) => u.liftWait)) team.liftWave = null;
}
function aiAirAssault(team) {
  const A = aiOf(team);
  if (!A.planner || !A.lift) return;
  aiLiftRelease(team);
  aiLiftTiming(team);
  if (A.lift.defend && aiLiftDefend(team)) return;
  aiLiftSolo(team);
}
const ARMY_UNITS = 100, ARMY_WORTH = 28000;   // defaults; DIFFICULTY ai.armyUnits and ai.armyWorth set them per difficulty (Normal 100 and 45000)
// Destroyed bridge spans: the computer trains an Engineer (one at a time, when no Engineer of its alliance is free or
// on the way) and sends each idle Engineer to the nearest destroyed span it can walk to that nobody is already
// heading for. Checked every 10 s.
function aiBridges(team) {
  if (!G.spans || !G.spans.length || G.t < (team.spanT || 0)) return;
  team.spanT = G.t + 10;
  const down = G.spans.filter((s) => !s.alive);
  if (!down.length) return;
  const friends = G.entities.filter((u) => u.alive && u.kind === 'unit' && u.def.engineer && alliedSides(u.team, team.id));
  const taken = new Set(friends.filter((u) => u.order.type === 'engineer').map((u) => u.order.target));
  const idle = friends.filter((u) => u.team === team.id && u.order.type !== 'engineer' && !u.chute);
  for (const u of idle) {
    const open = down.filter((s) => !taken.has(s)).sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y));
    for (const s of open) {
      commandEngineer([u], s);
      if (u.order.type === 'engineer') { taken.add(s); break; }   // (not taken: it cannot walk there)
    }
  }
  // Spans still waiting, and no Engineer of its own alive or on order: train one.
  if (down.some((s) => !taken.has(s)) && !friends.some((u) => u.team === team.id) && !team.queues.infantry.some((i) => i.type === 'engineer') &&
      team.credits >= UNIT_DEFS.engineer.cost + 300) startProduction(team, 'engineer');
}
// --- APCs (every personality) ---------------------------------------------------------------------------------
// Waiting at home, an APC with room takes idle staged infantry aboard (not Engineers); it then goes out with a wave like any
// unit. In the field, loaded, it lets them out when it is hurt (under half), fighting, or has known enemies within APC_UNLOAD_R,
// then hunts on. A raider's Engineer raid (aiEngRaid) uses one of its own.
const APC_MAX = 2, APC_HOME_R = 20, APC_PICK_R = 10, APC_UNLOAD_R = 7;
const apcType = (team) => (team.faction === 'allies' ? 'apc' : 'btr');
const atHome = (team, u, r) => Math.hypot(u.x / CELL - team.start.cx, u.y / CELL - team.start.cy) < r;
const APC_BAIL = 0.5, APC_BAIL_HP = 0.35;
function aiApcs(team) {
  const apcs = unitsOf(team.id).filter((u) => u.def.apc);
  if (!apcs.length) return;
  let pool = null;
  for (const a of apcs) {
    const cargo = a.cargo || [];
    if (a.apcBack && !cargo.length && !a.unload) { a.apcBack = false; setHunt(a); a.staged = false; continue; }
    if (a.raid) continue;
    // About to be destroyed (below APC_BAIL_HP and just hit): an APC that rolled it (APC_BAIL, once) lets its soldiers out, whatever it is doing.
    if (cargo.length && !a.unload) {
      if (a.bail === undefined) a.bail = Math.random() < APC_BAIL;
      if (a.bail && a.hp < a.maxHp * APC_BAIL_HP && G.t - (a.hitT ?? -99) < 2) { commandUnload([a]); a.apcBack = true; continue; }
    }
    if (cargo.length && !a.unload && (a.order.type === 'hunt' || a.order.type === 'attack' || a.defending || a.assisting)) {
      const fog = G.fog[team.id];
      const near = a.hp < a.maxHp * 0.5 || (a.target && a.target.alive) || G.t - (a.hitT || -99) < 2 ||
        enemyUnitsOf(team.id).some((e) => e.cls !== 'air' && fog[cellOfPos(e.x, e.y)] && Math.hypot(e.x - a.x, e.y - a.y) < APC_UNLOAD_R * CELL) ||
        enemyBuildingsOf(team.id).some((b) => targetable(team.id, b) && distTo(a, b) < APC_UNLOAD_R * CELL);
      if (near) { commandUnload([a]); a.apcBack = true; }
      continue;
    }
    // Loading at home.
    if (!a.staged || a.order.type !== 'guard' || a.defending || !atHome(team, a, APC_HOME_R)) continue;
    const room = a.def.carry - cargo.length - boardersOf(a).length;
    if (room <= 0) continue;
    pool = pool || unitsOf(team.id).filter((u) => canBoard(u) && !u.def.engineer && u.staged && u.order.type === 'guard' && !u.target && !u.inHouse &&
      !u.homeGuard && !u.garrison && !u.defending && !u.assisting && !u.liftWait && !u.raidCrew);
    const pick = pool.filter((u) => Math.hypot(u.x - a.x, u.y - a.y) < APC_PICK_R * CELL).sort((p, q) => dist(p, a) - dist(q, a)).slice(0, room);
    if (pick.length) { commandBoard(pick, a); for (const u of pick) { u.staged = false; pool.splice(pool.indexOf(u), 1); } }
  }
}
// --- Engineer raids (Raider personality, Normal and Hard) -------------------------------------------------------
// From ENG_RAID_FROM x its first-wave time, every ENG_RAID_GAP or so: an APC at home takes two Engineers and up to three soldiers
// aboard, drives to the least defended side of a valuable known enemy structure (aiEngTarget: worth over known guns and units
// covering the spot), lets them out there and the Engineers walk in and capture it (world.js captureBuilding). Engineers left in
// the field (an APC lost on the way: half of those aboard get out) go for the nearest enemy structure they can reach.
const ENG_RAID_FROM = 0.6, ENG_RAID_GAP = 150, ENG_RAID_ENGS = 2;
const ENG_VALUE = { cy: 6, factory: 5, tech: 5, airfield: 4, refinery: 4, helipad: 3, barracks: 3, dome: 3, depot: 2.5, apower: 2.5, power: 2, outpost: 3 };
function aiEngTarget(team, from) {
  const theirs = enemyBuildingsOf(team.id).filter((b) => targetable(team.id, b) && b.buildT >= 1 && b.sellT <= 0);
  if (!theirs.length) return null;
  const guns = theirs.filter((b) => b.def.weapon && !b.def.antiAir), fog = G.fog[team.id];
  const foes = enemyUnitsOf(team.id).filter((e) => e.cls !== 'air' && e.def.weapon && fog[cellOfPos(e.x, e.y)]);
  const cover = (x, y) => guns.filter((g) => Math.hypot(g.x - x, g.y - y) <= g.def.weapon.range + CELL * 2).length +
    0.25 * foes.filter((e) => Math.hypot(e.x - x, e.y - y) < CELL * 6).length;
  const c0 = cellOfPos(from.x, from.y), walk = walkDistances(freeCell(c0) ? c0 : nearestFreeCell(c0, 4));
  let best = null, bs = -Infinity;
  for (const b of theirs) {
    const val = ENG_VALUE[b.type] || (b.def.weapon ? 1 : 1.5), r = Math.max(b.w, b.h) / 2 + 3;
    let spot = null, ss = Infinity;
    for (let k = 0; k < 12; k++) {
      const a = k * Math.PI / 6, cx = Math.round(b.x / CELL + Math.cos(a) * r - 0.5), cy = Math.round(b.y / CELL + Math.sin(a) * r - 0.5);
      if (!inMap(cx, cy)) continue;
      const c = idx(cx, cy);
      if (!freeCell(c) || !(walk[c] >= 0)) continue;
      const p = cellCenter(c), sc = cover(p.x, p.y) + Math.random() * 0.1;
      if (sc < ss) { ss = sc; spot = p; }
    }
    if (!spot) continue;
    const score = val / (1 + ss + 0.5 * cover(b.x, b.y)) + Math.random() * 0.3;
    if (score > bs) { bs = score; best = { b, x: spot.x, y: spot.y }; }
  }
  return best;
}
function aiEngRaid(team) {
  const A = aiOf(team);
  const engs = unitsOf(team.id).filter((u) => u.def.engineer && !u.chute);
  // Engineers out in the field (not at home, not on a job): the nearest enemy structure they can take.
  for (const u of engs) {
    if (u.order.type === 'engineer' || u.order.type === 'board' || atHome(team, u, 25)) continue;
    const t = enemyBuildingsOf(team.id).filter((b) => engineerJob(u, b) && targetable(team.id, b) && distTo(u, b) < CELL * 15).sort((a, b) => distTo(u, a) - distTo(u, b))[0];
    if (t) commandEngineer([u], t);
  }
  const R = team.engRaid;
  if (R) {
    const apc = G.byId.get(R.apc);
    if (!apc || !apc.alive) { team.engRaid = null; team.engNext = G.t + 120; return; }
    const cargo = apc.cargo || [];
    if (R.step === 'load') {
      const coming = boardersOf(apc).length, engAboard = cargo.some((r) => r.type === 'engineer');
      if (engAboard && (!coming || G.t - R.t > 25)) {
        for (const b of boardersOf(apc)) { b.raidCrew = false; setGuard(b, b.x, b.y); b.staged = true; }
        commandMove([apc], R.x, R.y); R.step = 'go'; R.t = G.t;
      } else if (G.t - R.t > 60) {   // nobody came: give it up
        for (const b of boardersOf(apc)) { b.raidCrew = false; setGuard(b, b.x, b.y); b.staged = true; }
        apc.raid = false; apc.staged = true; team.engRaid = null; team.engNext = G.t + 60;
      }
      return;
    }
    if (R.step === 'go') {
      const d = Math.hypot(apc.x - R.x, apc.y - R.y), stopped = !apc.dest && !apc.needPath && !apc.moving && G.t - R.t > 5;
      if (d < CELL * 2 || stopped || apc.hp < apc.maxHp * 0.4 || G.t - R.t > 150) { commandUnload([apc]); R.step = 'drop'; R.t = G.t; }
      return;
    }
    if (R.step === 'drop') {
      if ((cargo.length || apc.unload) && G.t - R.t < 15) return;
      const tgt = G.byId.get(R.tgt);
      for (const u of unitsOf(team.id)) {
        if (u.cls !== 'inf' || Math.hypot(u.x - apc.x, u.y - apc.y) > CELL * 6) continue;
        u.raidCrew = false;
        if (u.def.engineer) {
          const t = engineerJob(u, tgt) ? tgt : enemyBuildingsOf(team.id).filter((b) => engineerJob(u, b) && targetable(team.id, b)).sort((a, b) => distTo(u, a) - distTo(u, b))[0];
          if (t) commandEngineer([u], t);
        } else if (u.order.type === 'guard' || u.order.type === 'hunt') { if (tgt && tgt.alive && hostile(team.id, tgt.team)) commandAttack([u], tgt); else setHunt(u); }
      }
      apc.raid = false; setHunt(apc); apc.staged = false;
      team.engRaid = null; team.engNext = G.t + ENG_RAID_GAP + Math.random() * 60;
    }
    return;
  }
  if (G.t < A.firstWave * ENG_RAID_FROM || G.t < (team.engNext || 0) || !enemyBaseKnown(team.id)) return;
  const homeEngs = engs.filter((u) => u.order.type === 'guard' && atHome(team, u, APC_HOME_R) && !u.raidCrew);
  const queued = (t) => team.queues.infantry.filter((i) => i.type === t).length + team.queues.vehicle.filter((i) => i.type === t).length;
  if (homeEngs.length + queued('engineer') < ENG_RAID_ENGS && available(team, 'engineer') && team.credits >= UNIT_DEFS.engineer.cost + 700) startProduction(team, 'engineer');
  const apc = unitsOf(team.id).filter((u) => u.def.apc && !u.raid && u.staged && u.order.type === 'guard' && !u.defending && atHome(team, u, APC_HOME_R) && !boardersOf(u).length)
    .sort((a, b) => (a.cargo || []).length - (b.cargo || []).length)[0];
  if (!apc) {
    if (!unitsOf(team.id).some((u) => u.def.apc) && !queued(apcType(team)) && available(team, apcType(team)) && team.credits >= 1500) startProduction(team, apcType(team));
    return;
  }
  if (!homeEngs.length) return;
  const plan = aiEngTarget(team, apc);
  if (!plan) { team.engNext = G.t + 30; return; }
  // Load: what it already carries stays aboard (up to 3 others); two Engineers and soldiers to fill it.
  while ((apc.cargo || []).length > apc.def.carry - ENG_RAID_ENGS) unloadOne(apc, 'guard');   // (make room: they wait at home)
  const crew = homeEngs.sort((a, b) => dist(a, apc) - dist(b, apc)).slice(0, ENG_RAID_ENGS);
  const room = apc.def.carry - (apc.cargo || []).length - crew.length;
  const inf = unitsOf(team.id).filter((u) => canBoard(u) && !u.def.engineer && u.staged && u.order.type === 'guard' && !u.target && !u.inHouse && !u.homeGuard &&
    !u.garrison && !u.defending && !u.assisting && Math.hypot(u.x - apc.x, u.y - apc.y) < APC_PICK_R * CELL).sort((a, b) => dist(a, apc) - dist(b, apc)).slice(0, Math.max(0, room));
  const go = crew.concat(inf);
  commandBoard(go, apc);
  for (const u of go) { u.raidCrew = true; u.staged = false; }
  apc.raid = true; apc.staged = false;
  team.engRaid = { apc: apc.id, tgt: plan.b.id, x: plan.x, y: plan.y, step: 'load', t: G.t };
}
// Village houses (Normal and Hard, from minute 4, every 15 s): the computer holds AI_GARRISON houses with up to three
// idle soldiers each, picked from its own half of the village, nearest the middle (the front line). Easy ignores them.
// Its waves never take these soldiers (they are not staged); its other orders bring them out like anyone's.
const AI_GARRISON = { normal: 2, hard: 3 };
function aiGarrison(team) {
  const want = AI_GARRISON[G.diffKey] && Math.max(1, AI_GARRISON[G.diffKey] + (aiOf(team).garAdd || 0));
  if (!want || !G.houses || !G.houses.length || G.t < 240 || G.t < (team.garT || 0)) return;
  team.garT = G.t + 15;
  const mine = unitsOf(team.id), going = new Set(mine.filter((u) => u.order.type === 'garrison').map((u) => u.order.target));
  let held = G.houses.filter((h) => h.alive && h.n && h.team === team.id).length + going.size;
  if (held >= want) return;
  const foes = G.teams.filter((t) => hostile(t.id, team.id) && !t.out).map((t) => t.start);
  if (!foes.length) return;
  const dFoe = (h) => Math.min(...foes.map((f) => Math.hypot(h.x / CELL - f.cx, h.y / CELL - f.cy)));
  const dOwn = (h) => Math.hypot(h.x / CELL - team.start.cx, h.y / CELL - team.start.cy);
  const spots = G.houses.filter((h) => h.cap > 0 && !h.n && houseOpen(h, team.id) && !going.has(h) && dOwn(h) < dFoe(h)).sort((a, b) => (dOwn(b) - dFoe(b)) - (dOwn(a) - dFoe(a)));
  const idle = mine.filter((u) => canGarrison(u) && !u.inHouse && u.order.type === 'guard' && u.staged && !u.defending && !u.assisting && !u.homeGuard);
  for (const h of spots) {
    if (held >= want || idle.length < 2) break;
    idle.sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y));
    const squad = idle.splice(0, Math.min(3, h.cap));
    commandGarrison(squad, h);
    if (squad.some((u) => u.order.type === 'garrison')) held++;
  }
}
// Walls (Normal and Hard): a short line of wall in front of each ground defence, across the way the enemy comes
// from. Five pieces, never a ring, so nothing of its own is shut in. Sandbags (Allies) or Barbed Wire (Soviets);
// on Hard, Concrete once a War Factory stands. One defence at a time, while it has money to spare, up to a cap.
const AI_WALL_CAP = { normal: 20, hard: 36 };
function aiWalls(team) {
  if (team.ring && !team.ring.skip) return;   // a ring builder (aiRing) lays no short lines
  const cap = AI_WALL_CAP[G.diffKey] && Math.round(AI_WALL_CAP[G.diffKey] * (aiOf(team).wallMul || 1));
  if (!cap || G.t < 300 || G.t < (team.wallT || 0)) return;
  team.wallT = G.t + 15;
  if (team.credits < 1200) return;
  const kind = G.diffKey === 'hard' && wallAvailable(team, 'concrete') ? 'concrete' : team.faction === 'allies' ? 'sandbag' : 'wire';
  if (!wallAvailable(team, kind)) return;
  let own = 0;
  if (G.wallN) for (let c = 0; c < NCELLS; c++) if (G.wall[c] && G.wallTeam[c] === team.id) own++;
  if (own >= cap) return;
  const b = buildingsOf(team.id).find((e) => e.def.defense && !e.def.antiAir && e.buildT >= 1 && e.sellT <= 0 && !e.walled);
  if (!b) return;
  b.walled = true;
  const foe = enemyOf(team), bx = b.cx + b.w / 2, by = b.cy + b.h / 2;
  let dx = foe.start.cx - bx, dy = foe.start.cy - by;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d; dy /= d;
  const mx = bx + dx * 2.6, my = by + dy * 2.6;   // the middle of the line, out in front
  placeWalls(team, kind, Math.floor(mx - dy * 2), Math.floor(my + dx * 2), Math.floor(mx + dy * 2), Math.floor(my - dx * 2));
}
// Base ring (Normal and Hard; the turtle from minute 6, the balanced computer from minute 12 once it holds 3,000 credits):
// a Concrete Wall round its main base, RING_MARGIN cells out from its buildings, with a Gate in the middle of each side
// (its own and its allies' units pass, enemies have to shoot a way in: breachWalls). Planned once (team.ring, plain data,
// saved), then built a piece at a time from what it can spare above RING_KEEP, the side facing the enemy first; a side's
// walls only once its Gate stands, so its own units are never shut in. Cells it cannot wall (ore, water, rock, buildings)
// stay open. Rushers and raiders keep the short lines of aiWalls.
const RING_MARGIN = 3, RING_MAX = 200, RING_FROM = { turtle: 360, balanced: 720 }, RING_KEEP = { turtle: 800, balanced: 2000 }; const RING2_AFTER = 240;
function aiRing(team) {
  const A = aiOf(team), from = RING_FROM[team.style];
  if (!A.planner || from === undefined || G.t < from || G.t < (team.ringT || 0)) return;
  team.ringT = G.t + 15;
  if (!wallAvailable(team, 'concrete') || !wallAvailable(team, 'gate')) return;
  const keep = RING_KEEP[team.style];
  const cy = aiMainYard(team) || buildingsOf(team.id).find((b) => b.type === 'cy');
  if (cy) {
    if (!team.ring) {
      if (team.style === 'balanced' && team.credits < 3000) return;
      team.ring = aiPlanRing(team, cy, team.start, 16);
    }
    if (!team.ring.skip && !aiBuildRing(team, team.ring, keep)) return;   // out of money: the second ring waits
  }
  // A turtle also rings its second base (team.ring2, for that yard's id), once that base has all it wants or
  // RING2_AFTER after the yard unpacked (one structure at a time, shared with the main base, takes long).
  const b2 = A.ring2 && aiBase2(team);
  if (!b2 || b2.buildT < 1) return;
  if (!team.ring2 || team.ring2.yard !== b2.id) {
    if (!team.b2At || team.b2At.yard !== b2.id) team.b2At = { yard: b2.id, t: G.t };
    if (G.t - team.b2At.t < RING2_AFTER && aiBase2Next(team, b2, aiCount(team))) return;
    team.ring2 = Object.assign(aiPlanRing(team, b2, b2, 12), { yard: b2.id });
  }
  if (!team.ring2.skip) aiBuildRing(team, team.ring2, keep);
}
// Lays what it can of a planned ring from the credits above `keep`. False once the money runs short.
function aiBuildRing(team, R, keep) {
  const gate = WALLS.gate, wall = WALLS.concrete;
  for (const sd of R.sides) {
    if (team.credits - keep < (sd.gate < 0 ? gate.cost : wall.cost)) return false;
    if (sd.gate < 0) {                                   // the side's Gate first: the middle cell nearest the side's middle that fits
      for (const m of sd.mids) {
        const x = cellX(m), y = cellY(m), [dx, dy] = sd.ns ? [0, 1] : [1, 0];
        if (placeWalls(team, 'gate', x, y, x + dx, y + dy)) { sd.gate = m; break; }
      }
      if (sd.gate < 0) continue;                         // nowhere fits yet (units in the way): this side waits
    }
    const skip = new Set(sd.ns ? [sd.gate - MAP, sd.gate, sd.gate + MAP] : [sd.gate - 1, sd.gate, sd.gate + 1]);
    const blds = buildingsOf(team.id);
    let run = [];
    const lay = () => {
      while (run.length) {
        const n = Math.min(run.length, WALL_LINE_MAX, Math.floor((team.credits - keep) / wall.cost));
        if (n <= 0) { run = []; return; }
        const a = run[0], b = run[n - 1];
        placeWalls(team, 'concrete', cellX(a), cellY(a), cellX(b), cellY(b));
        run = run.slice(n);
      }
    };
    for (const c of sd.cells) {
      if (!skip.has(c) && !G.wall[c] && wallOk(team, c, blds)) run.push(c);
      else lay();
    }
    lay();
  }
  return true;
}
// The ring's four sides round the main base's buildings (within 16 cells of its start), facing the enemy first.
function aiPlanRing(team, cy, at, reach) {
  const near = buildingsOf(team.id).filter((b) => Math.hypot(b.cx - at.cx, b.cy - at.cy) < reach);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of near.length ? near : [cy]) { x0 = Math.min(x0, b.cx); y0 = Math.min(y0, b.cy); x1 = Math.max(x1, b.cx + b.w - 1); y1 = Math.max(y1, b.cy + b.h - 1); }
  x0 = Math.max(2, x0 - RING_MARGIN); y0 = Math.max(2, y0 - RING_MARGIN); x1 = Math.min(MAP - 3, x1 + RING_MARGIN); y1 = Math.min(MAP - 3, y1 + RING_MARGIN);
  if (2 * (x1 - x0 + y1 - y0) > RING_MAX) return { skip: true };
  const foe = enemyOf(team).start, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const line = (ax, ay, bx, by) => { const l = []; for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) l.push(idx(x, y)); return l; };
  const side = (cells, ns, nx, ny) => {
    // Gate middles: along the side, nearest its middle first, with open ground in front and behind.
    const mid = cells[cells.length >> 1], mids = cells.slice(2, -2).filter((c) => {
      const x = cellX(c), y = cellY(c);
      const [ox, oy] = ns ? [1, 0] : [0, 1];
      return inMap(x + ox, y + oy) && inMap(x - ox, y - oy) && !G.block[idx(x + ox, y + oy)] && !G.block[idx(x - ox, y - oy)];
    }).sort((a, b) => Math.hypot(cellX(a) - cellX(mid), cellY(a) - cellY(mid)) - Math.hypot(cellX(b) - cellX(mid), cellY(b) - cellY(mid)));
    return { cells, ns, gate: -1, mids, face: (foe.cx - mx) * nx + (foe.cy - my) * ny };
  };
  const sides = [
    side(line(x0, y0, x1, y0), false, 0, -1), side(line(x0, y1, x1, y1), false, 0, 1),
    side(line(x0, y0 + 1, x0, y1 - 1), true, -1, 0), side(line(x1, y0 + 1, x1, y1 - 1), true, 1, 0),
  ].sort((a, b) => b.face - a.face);
  for (const s of sides) delete s.face;
  return { sides, box: [x0, y0, x1, y1] };
}
// Comeback (Normal and Hard): a side that has lost its Ore Refinery (no ore coming in) or its War Factory, still has a Construction Yard
// and cannot afford the replacement sells off whatever it can to pay for it, and builds it before anything else: power if the refinery
// needs it, then the refinery (it brings a free Ore Truck), then the War Factory. Sells defences first, then the dearest of the rest,
// and only when nothing else is left its Barracks, Helipads and Airfields. Never the yard, power, refineries, Outposts or War Factories.
const REBUILD_KEEP = ['cy', 'power', 'apower', 'refinery', 'outpost', 'factory'];
const REBUILD_LAST = ['barracks', 'helipad', 'airfield'];
function aiRebuildChain(team, c) {
  const chain = [];
  if (!c.refinery && team.hadRef) {
    if (!c.power && !c.apower) chain.push(available(team, 'power') ? 'power' : 'apower');
    chain.push('refinery');
  }
  if (!c.factory && team.hadFactory) chain.push('factory');
  return chain;
}
function aiRebuild(team, c) {
  if (!aiOf(team).planner) return false;
  if (c.refinery) team.hadRef = true;
  if (c.factory) team.hadFactory = true;
  const chain = c.cy ? aiRebuildChain(team, c) : [];
  if (!chain.length) { team.rebuild = false; return false; }
  const need = chain.reduce((a, t) => a + BUILD_DEFS[t].cost, 0);
  const pending = pendingStructure(team);
  const paid = pending && chain.includes(pending.type) ? BUILD_DEFS[pending.type].cost : 0;
  team.rebuild = true;
  if (team.credits + paid >= need) return true;
  if (team.rebuildT !== undefined && G.t - team.rebuildT < 3) return true;
  team.rebuildT = G.t;
  let incoming = 0;
  for (const b of buildingsOf(team.id)) if (b.sellT > 0) incoming += Math.floor(b.def.cost * 0.5 * b.hp / b.maxHp);
  if (team.credits + paid + incoming >= need + 100) return true;
  const mine = buildingsOf(team.id).filter((b) => b.alive && b.buildT >= 1 && b.sellT <= 0 && !REBUILD_KEEP.includes(b.type));
  const list = mine.filter((b) => !REBUILD_LAST.includes(b.type));
  const pool = list.length ? list : mine;
  pool.sort((a, b) => (!!b.def.weapon - !!a.def.weapon) || b.def.cost - a.def.cost);
  if (pool.length) sellStructure(pool[0]);
  return true;
}
function aiThink(team) {
  aiBridges(team);
  aiApcs(team);
  if (aiOf(team).planner && team.style === 'raider') aiEngRaid(team);
  aiRing(team);
  aiWalls(team);
  aiGarrison(team);
  const c = aiCount(team);
  aiPickFoe(team);
  aiCounter(team);
  aiPincer(team);
  aiSquads(team);
  if (enemyUnitsOf(team.id).some((u) => u.cls === 'air' && !u.def.scripted)) team.sawAir = true;
  const b2 = aiOf(team).planner ? aiBase2(team) : null;
  const rebuilding = aiRebuild(team, c);
  const SLOTS = ['structure', 'defense'];   // the main queue and the defence queue build side by side
  for (const slot of SLOTS) {
    const q = team.queues[slot];
    if (!q || !q.ready) continue;
    // A building ordered for the second base goes up there (team.buildAt: its yard's id and the type).
    const at = b2 && team.buildAt && team.buildAt.id === b2.id && team.buildAt.type === q.type ? b2 : null;
    const spot = aiFindSpot(team, q.type, at);
    if (spot && at) team.buildAt = null;
    const lone = q.type === 'refinery' && aiOutpostForRefinery(team);
    const b = spot && placeStructure(team, q.type, spot.cx, spot.cy);
    if (b && lone) (lone.refineries || (lone.refineries = [])).push(b);
    else if (!spot && Math.random() < 0.05) cancelProduction(team, q.type);
  }
  const free = SLOTS.filter((s) => !team.queues[s]);
  if (rebuilding) {
    // Comeback: the missing power, refinery or War Factory is paid for first and nothing else is started.
    if (free.includes('structure')) {
      const t = aiRebuildChain(team, c).find((x) => available(team, x));
      if (t && team.credits >= BUILD_DEFS[t].cost) startProduction(team, t);
    }
  } else if (free.length) {
    // Every other building goes to the second base while it still wants something (and money allows).
    const want2 = b2 && b2.buildT >= 1 && (team.alt2 = !team.alt2) && team.credits > 1200 ? aiBase2Next(team, b2, c) : null;
    const used2 = want2 && free.includes(catOf(want2));
    if (used2) { team.buildAt = { id: b2.id, type: want2 }; startProduction(team, want2); }
    for (const slot of free) {
      if (used2 && slot === catOf(want2)) continue;
      const next = slot === 'structure' && !want2 && aiLiftPad(team, c) ? 'helipad' : used2 && slot === 'structure' ? null : aiNextStructure(team, c, slot);
      if (next && team.credits >= Math.min(BUILD_DEFS[next].cost * 0.25, 500)) startProduction(team, next);
    }
  }

  // Construction Yard lost: build a Mobile Construction Yard and unpack it at home.
  const mcvs = unitsOf(team.id).filter((u) => u.def.deploys === 'cy');
  aiEvac(team, mcvs);
  for (const u of mcvs) aiDriveMcv(team, u);
  if (!c.cy && !mcvs.length && available(team, 'mcv') && !team.queues.vehicle.some((i) => i.type === 'mcv') && team.credits > 1250) {
    startProduction(team, 'mcv');
    const vq = team.queues.vehicle, i = vq.findIndex((x) => x.type === 'mcv');
    if (i > 0) vq.unshift(vq.splice(i, 1)[0]);   // it jumps the queue: nothing else can be built without it
  }

  const A2 = aiOf(team);
  // A rusher's forward base: once it has found an enemy base, an MCV for a spot near it (aiForwardSpot). Replaces its own-half second base.
  if (A2.planner && team.style === 'rusher' && G.t >= (team.expT || 0) && aiMainYard(team) && !aiBase2(team) && !mcvs.length && available(team, 'mcv') &&
      !team.queues.vehicle.some((i) => i.type === 'mcv') && team.credits > UNIT_DEFS.mcv.cost + 1000 && !team.starved && enemyBaseKnown(team.id)) {
    team.expT = G.t + EXPAND_RETRY;
    const f = aiForwardSpot(team);
    if (f) { team.expField = f; startProduction(team, 'mcv'); }
  }
  // A second base: an MCV for a rich field on its own half (personality's chance, rolled once).
  if (A2.planner && team.style && team.exp2 === undefined) team.exp2 = Math.random() < (EXPAND_CHANCE[team.style] || 0);
  if (team.exp2 && G.t >= EXPAND_FROM && G.t >= (team.expT || 0) && aiMainYard(team) && !aiBase2(team) && !mcvs.length && available(team, 'mcv') &&
      !team.queues.vehicle.some((i) => i.type === 'mcv') && team.credits > UNIT_DEFS.mcv.cost + 2000 && !team.starved && aiExpandField(team)) {
    team.expT = G.t + EXPAND_RETRY;
    const f = aiExpandField(team);
    team.expField = { cx: f.cx, cy: f.cy, r: f.r };
    startProduction(team, 'mcv');
  }

  // Forward outposts: send a Mobile Outpost to a rich field far from its refineries.
  const fobs = unitsOf(team.id).filter((u) => u.type === 'fob');
  for (const u of fobs) aiDriveFob(team, u);
  // Starved (little ore left near any refinery): an Outpost (a third if need be) is bought first, at the front of the queue, with
  // whatever money there is, and army production waits for it (unless the base is under attack).
  const starved = aiStarved(team);
  const fobOn = fobs.length > 0 || team.queues.vehicle.some((i) => i.type === 'fob');
  if (c.factory && !fobOn && (c.outpost || 0) < (starved ? 3 : 2) && (c.refinery || 0) >= 1 && team.credits > (starved ? 250 : 1200) && aiRemoteField(team)) {
    startProduction(team, 'fob');
    if (starved) { const q = team.queues.vehicle, i = q.findIndex((x) => x.type === 'fob'); if (i > 0) q.unshift(q.splice(i, 1)[0]); }
  }
  const saving = starved && (fobOn || team.queues.vehicle.some((i) => i.type === 'fob')) && !team.defending;

  // Damaged vehicles go to the Service Depot: ones waiting at home when hurt, Ore Trucks when badly
  // hurt, and attackers that are nearly done for (which pulls them out of the fight). At most four
  // queue at a depot.
  if (c.depot && team.credits > 400) {
    const busy = unitsOf(team.id).filter((u) => u.order.type === 'repair').length;
    let room = 4 * c.depot - busy;
    for (const u of unitsOf(team.id)) {
      if (room <= 0) break;
      if (!canService(u) || u.def.deploys || u.order.type === 'repair') continue;
      const hp = u.hp / u.maxHp;
      const go = u.def.harvester ? hp < 0.5 && u.hs !== 'unload'
        : (u.order.type === 'guard' && !u.target && hp < 0.7) || (u.order.type === 'hunt' && hp < 0.3);
      if (go) { commandRepair([u]); room--; }
    }
  }

  // Keep the economy running.
  const refineries = c.refinery || 0, trucks = c.harv || 0;
  const wantTrucks = refineries * 2 - (G.diffKey === 'easy' ? refineries : 0);
  const vq = team.queues.vehicle;
  if (c.factory && trucks < wantTrucks && !vq.some((i) => i.type === 'harv') && trucks < aiOf(team).econ.trucks) startProduction(team, 'harv');
  // Normal and Hard pay for a missing Ore Truck before buying more army.
  const truckDue = aiOf(team).econ.truckFirst && vq.some((i) => i.type === 'harv');

  // Spend the rest on an army; hold some back while a structure is being paid for.
  const sq = pendingStructure(team);
  const reserve = sq && !sq.ready ? Math.min(1500, BUILD_DEFS[sq.type].cost * (1 - sq.progress)) : 0;
  const money = team.credits - reserve;
  // A cap on the army, by headcount (for the frame rate) and by worth, so a side whose units cost
  // more (Soviet Heavy Tanks and Mammoths) does not field a stronger army of the same size.
  const armyUnits = G.entities.filter((e) => e.alive && e.team === team.id && e.kind === 'unit' && !e.def.harvester);
  // At the cap only army production stops (infantry, vehicles, aircraft, surplus tanks); the support powers and repairs carry on.
  const capped = saving || armyUnits.length > (aiOf(team).armyUnits || ARMY_UNITS) || armyUnits.reduce((a, e) => a + e.def.cost, 0) > (aiOf(team).armyWorth || ARMY_WORTH);
  // Once the enemy flies aircraft (Normal and Hard), lean on units that can shoot them down:
  // rocket soldiers, Mammoths or Rangers, and fighters rather than helicopters.
  const A = aiOf(team), anti = A.adapt && team.sawAir;
  const iq = team.queues.infantry;
  if (!capped && c.barracks && iq.length < A.queue && money > (truckDue ? 900 : 150)) {
    const r = Math.random();
    const sov = team.faction === 'soviets';   // rifles and grenadiers, with some Rocket Soldiers
    // Allies: mostly rifles, and more Rocket Soldiers once the enemy flies, but never only them.
    // Against an armoured army: more Rocket Soldiers (Allies) or Grenadiers (Soviets); against infantry, rifles.
    const k = team.counter || {}, rockets = anti ? 0.6 : k.armor ? 0.65 : k.inf ? 0.25 : 0.4;
    // Soviets: Rocket Soldiers once the enemy flies or fields armour, otherwise rifles and grenadiers.
    const sovRockets = anti ? 0.45 : k.armor ? 0.3 : k.inf ? 0 : 0.15;
    // MG Teams against infantry-heavy enemies (and a few always): every difficulty.
    const mgs = k.inf ? 0.3 : 0.12;
    if (Math.random() < mgs) startProduction(team, 'hmg');
    else if (sov && Math.random() < sovRockets) startProduction(team, 'rocket');
    else startProduction(team, sov ? (r < (k.armor ? 0.3 : 0.55) ? 'rifle' : 'grenadier') : r < rockets ? 'rocket' : 'rifle');
  }
  if (!capped && c.factory && vq.length < A.queue && money > 500 && !truckDue) {
    const opts = team.faction === 'allies' ? (anti ? ['mtank', 'mtank', 'ranger', 'ranger', 'ltank'] : ['ltank', 'mtank', 'mtank', 'ranger'])
      : (anti ? ['htank', 'mammoth', 'mammoth', 'htank'] : ['htank', 'htank', 'htank', 'mammoth']);
    if (available(team, 'ttank')) opts.push('ttank', 'ttank');                    // after the Tesla program (Tech Center upgrade)
    // APCs (every personality, every difficulty): a few to carry infantry into the fight (aiApcs).
    const apcT = team.faction === 'allies' ? 'apc' : 'btr';
    if (available(team, apcT) && (c[apcT] || 0) + vq.filter((i) => i.type === apcT).length < (team.style === 'raider' ? APC_MAX + 1 : APC_MAX)) opts.push(apcT);
    const sup = team.faction === 'allies' ? 'arty' : 'v2rl';                        // long-range support, once it has a Radar Dome
    const k = team.counter || {};
    if (!anti && k.armor) opts.push(...(team.faction === 'allies' ? ['mtank', 'mtank'] : ['mammoth', 'htank']));
    if (!anti && k.inf) opts.push(...(team.faction === 'allies' ? ['ranger', 'ranger'] : ['mammoth']));
    // Long-range guns: more of them, and more often, against infantry crowds or a fortified base.
    const supMax = k.turtle ? 8 : k.inf ? 6 : 4;
    if (available(team, sup) && (c[sup] || 0) < supMax) opts.push(sup);
    if (available(team, sup) && (c[sup] || 0) < supMax && (k.turtle || k.inf)) opts.push(sup, sup);
    // Top-tier units wait for a Tech Center: until then a Mammoth Tank is a Heavy Tank.
    const pick = opts[Math.floor(Math.random() * opts.length)];
    startProduction(team, available(team, pick) ? pick : pick === 'mammoth' ? 'htank' : 'mtank');
  }
  // Tech Center upgrades (Normal and Hard): researched once there is money to spare (the Allies' Comanche program).
  if (aiOf(team).planner && !team.research && c.tech && money > 2500) for (const id in UPGRADES) if (canResearch(team, id)) { startResearch(team, id); break; }
  // Helicopters and jets have their own queues; against aircraft it leans on fighters.
  const air = G.entities.filter((e) => e.alive && e.team === team.id && e.cls === 'air').length + team.queues.heli.length + team.queues.jet.length;
  // Transports for air assaults (AI_STYLES lift) are queued first while a pad is free; with every pad taken, aiLiftPad builds another base.
  const L = aiOf(team).lift, lift = team.faction === 'allies' ? 'chinook' : 'halo', liftsShort = L && c.helipad && G.t > aiOf(team).firstWave * L.from ? L.n - (c[lift] || 0) : 0;
  if (liftsShort > 0 && !capped && !truckDue && money > 1100 && !team.queues.heli.length && padRoom(team, 'helipad') > 0) startProduction(team, lift);
  if (!capped && money > (anti ? 600 : 900) && air < 6 && !truckDue) {
    const comanche = available(team, 'comanche') && Math.random() < ((team.counter || {}).armor ? 0.65 : 0.45);   // more of them against tanks
    const heli = team.faction === 'allies' ? (comanche ? 'comanche' : 'heli') : 'hind', jet = team.faction === 'allies' ? 'jet' : 'mig';
    if (c.airfield && !team.queues.jet.length && padRoom(team, 'airfield') > 0 && (anti || Math.random() < 0.5)) startProduction(team, jet);
    else if (c.helipad && available(team, heli) && !team.queues.heli.length && padRoom(team, 'helipad') > 0 && (!anti || !c.airfield || Math.random() < 0.25)) startProduction(team, heli);
  }

  // Airfield support powers: bomb the thickest part of the enemy base, drop troops on its economy,
  // unless they are being held back for a big push (not for more than three minutes).
  aiStrike(team);
  const held = (k) => team.holdFor && team.holdFor.keys.includes(k) && G.t - team.holdFor.since < 180;
  if (powerReady(team, 'bomb') && !held('bomb')) { const t = aiPowerTarget(team, true); if (t) launchPower(team, 'bomb', t.x, t.y); }
  // Close air support: at the biggest group of the enemy's vehicles it can see (at least 3), else the thickest part of its base.
  if (powerReady(team, 'cas') && !held('cas')) { const t = aiCasTarget(team) || aiPowerTarget(team, true); if (t) launchPower(team, 'cas', t.x, t.y); }
  if (powerReady(team, 'para') && !held('para')) { const t = aiPowerTarget(team, false); if (t) launchPower(team, 'para', t.x, t.y); }
  aiAirAssault(team);

  // Patch up damaged buildings when there is cash to spare, but not while they are being shot at.
  for (const b of buildingsOf(team.id)) {
    if (G.t - b.hitT < 3) b.repairing = false;
    else if (team.credits > 800 && b.hp < b.maxHp * 0.6) b.repairing = true;
  }
  // Pour surplus cash into extra tanks.
  if (!capped && team.credits > 4000 && c.factory && vq.length < 3) startProduction(team, team.faction === 'allies' ? 'mtank' : 'htank');
}

// --- Attack waves ------------------------------------------------------------------
// The computer does not wait for groups of ten like the player's Auto Attack. Each wave is
// planned in advance: an ordinary wave or a big push (sizes by difficulty) and a target. Like the
// player's, its units head out at their own top speed; any that pass near an enemy Outpost or
// outlying refinery turn aside to destroy it first (detourToSite). Runs once a second with the units waiting
// at the rally point.
function aiPlanWave(team) {
  const A = aiOf(team), r = Math.random, big = !!A.big && G.t >= A.bigFrom && r() < A.bigChance;
  const [lo, hi] = big ? A.big : A.wave;
  team.holdFor = big && A.strike.length ? { keys: A.strike, since: G.t } : null;
  return { size: lo + Math.floor(r() * (hi - lo + 1)), big };
}
function aiLaunch(team, ready) {
  const A = aiOf(team), r = Math.random;
  if (!team.plan) team.plan = aiPlanWave(team);
  // No attacks until it has found the enemy base: once the first-wave timer is up, it scouts.
  const scoutT = G.t >= Math.max(Math.min(A.firstWave, G.diff.ai.firstWave), 60);   // (a late style still scouts on the difficulty's time)
  if (!enemyBaseKnown(team.id)) { if (scoutT) aiScout(team, ready); return; }
  // Team games: one base found is not all of them. It keeps one scout out until it has found every enemy base (its
  // waves go meanwhile), so aiPickFoe has more than one enemy to share out (before, every computer stopped at the first
  // base it found, often the same player's, and all of them attacked only that player all game).
  if (foesOf(team.id).some((f) => !G.teams[f].out && inTheFight(f) && !enemyBaseKnown(team.id, f))) { if (scoutT) aiScout(team, [], true); }
  else aiScoutDone(team);
  // Planner: the clock starts once the base is found and the first-wave wait is over, then each attack
  // comes after a random wait (AI_GAP: never under a minute, never over ten).
  if (A.planner && team.attackAt === undefined && G.t >= A.firstWave) { team.attackAt = G.t + aiGap(team); }
  // A big army waiting at home does not sit out the timer: from ARMY_FULL of its army cap it attacks now
  // (still at least AI_GAP_MIN after the last wave).
  // (Since the personalities: a full army halves what is left of the wait once, instead of skipping it, so the
  // random wait still spreads the sides' attacks; they all filled up at the same moment and went together.)
  // armyMul (the turtle): its army cap is bigger, but the extra stays at home to defend: waves are measured against the
  // usual cap, and the newest `keep` units (the cap's extra) never go out with them.
  const mul = A.armyMul || 1, cap = (A.armyUnits || ARMY_UNITS) / mul, capW = (A.armyWorth || ARMY_WORTH) / mul;
  const keep = A.planner ? Math.round((A.armyUnits || ARMY_UNITS) - cap) : 0;
  // The turtle's big push (pushEvery / pushMin): it digs in, but once that long has passed since its last wave (or since its first-wave
  // time) with no wave, it comes out with everything that has gathered, the home reserve too, then digs in again. Its home
  // guard (not in `ready`) and its guns still hold the base. (Owner's eight latest wins: the turtle sent no wave in five.)
  const pushDue = A.planner && A.pushEvery && team.attackAt !== undefined && G.t >= Math.max(A.firstWave, team.lastWave || 0) + A.pushEvery;
  const push = pushDue && ready.length >= A.pushMin;
  ready = ready.slice().sort((a, b) => a.id - b.id).slice(0, push ? ready.length : Math.max(0, ready.length - keep));   // first come, first sent; the newest stay home
  const full = A.planner && team.attackAt !== undefined && ready.length >= cap * A.full && G.t - (team.lastWave || -1e9) >= AI_GAP_MIN;
  if (full && !team.fullCut && G.t < team.attackAt) { team.attackAt = G.t + (team.attackAt - G.t) / 2; team.fullCut = true; }
  // The first wave waits a while (on Easy and Normal), waves keep a gap between them, and each
  // takes only its planned number of units: the rest wait for the next one.
  // Planner waves are held until the army is big: WAVE_HOLD of the army cap, by count or by worth.
  const hold = A.planner && ready.length < cap * A.hold && ready.reduce((w, u) => w + (u.def.cost || 300), 0) < capW * A.hold;
  // A turtle under steady attack never fills up to `hold`: some minutes past its timer it goes with what it has (stallAfter).
  const stale = A.planner && A.stallAfter && team.attackAt !== undefined && G.t >= team.attackAt + A.stallAfter && ready.length >= A.stallMin;
  if (push && !team.plan.big) { team.plan.big = true; if (A.strike.length) team.holdFor = { keys: A.strike, since: G.t }; }
  if (A.planner) { if (team.attackAt === undefined || G.t < team.attackAt || ((ready.length < team.plan.size || hold) && !stale && !push)) return; }
  else if (ready.length < team.plan.size || G.t < A.firstWave || G.t - (team.lastWave || -1e9) < A.waveGap) return;
  // The planner's wave sends every unit that has gathered (the units on home guard are not in `ready`).
  const take = A.planner ? ready.length : team.plan.size;
  ready = ready.slice(0, take);   // (sorted above: first come, first sent)
  const target = aiWaveTarget(team, ready[0]);
  if (!target) return;
  const strike = team.plan.big && A.strike.length ? A.strike : null;
  const how = team.flk = team.flk || { pincer: 0, flank: 0, direct: 0 };
  // Planner: a big wave splits into two or three squads that come from different sides at once.
  const [p3, p2] = A.splitAt || [20, 12];
  const parts = !A.planner ? 2 : ready.length >= p3 && r() < (A.split3 || 0.5) ? 3 : ready.length >= p2 ? 2 : 0;
  if (A.lift && A.lift.pair && (!A.lift.stallOnly || stale)) ready = aiLiftWithWave(team, ready, target);   // (holds back the soldiers it flies)
  if (A.planner ? parts >= 2 && aiPincerStart(team, ready, target, strike, parts) : ready.length >= 6 && r() < (A.pincer || 0) && aiPincerStart(team, ready, target, strike)) how.pincer++;
  else if (A.planner && r() < (A.approach || 0) && aiApproachStart(team, ready, target, strike)) how.flank++;
  else { aiSend(team, ready, target, { strike }); how.direct++; }
  team.waves = (team.waves || 0) + 1;
  team.lastWave = G.t;
  team.fullCut = false;
  if (A.planner) team.attackAt = G.t + aiGap(team);
  team.plan = aiPlanWave(team);
}
// --- Squad planner (Normal and Hard, A.planner) ----------------------------------------
// The random wait before each attack, per difficulty (DIFFICULTY ai.gap): mostly `short`, now and then (`long`
// chance) a longer lull; never over ten minutes. ARMY_FULL: share of the army cap waiting at home that
// launches an attack early; AI_GAP_MIN: the least time between such waves.
const ARMY_FULL = 0.6, AI_GAP_MIN = 70, WAVE_HOLD = 0.5;
function aiGap(team) {
  const A = aiOf(team), g = A.gap || { short: [90, 450], long: [450, 900], chance: 0.2 }, [a, b] = Math.random() < g.chance ? g.long : g.short;
  return Math.max(AI_GAP_MIN, Math.min(900, (a + Math.random() * (b - a)) * (A.gapMul || 1)));
}
// --- Personalities (Normal and Hard, both modes) ----------------------------------------
// Each computer side rolls one style the first time it thinks (aiStyle) and keeps it all battle; a pick is completely random, and
// an ally can rarely have the same one (STYLE_DUP_CHANCE of the rolls that match an ally's; otherwise it is rolled again among the unused). Hidden from the players. Each style changes
// the difficulty's own settings (DIFFICULTY ai), so a Hard rusher is still harder than a Normal one. Easy (fixed
// waves) has none.
//   firstWave: added to the difficulty's first-wave time; hold / full: share of the army cap that must be waiting
//   before a wave goes / that halves the wait; gapMul: the random wait between waves; airGap: AIR_STRIKE_GAP;
//   defAdd / gunsAdd: ground defences at home / guns at each Outpost; wallMul, garAdd: walls and held houses;
//   armyMul: a bigger army cap (units and worth); the extra stays at home to defend (aiLaunch: waves are measured against the usual cap);
//   aaAdd: more anti-air sites (both the starting count and the cap); defRich: credits above which it keeps adding guns (default 1500); guns2: guns at a second base (default 2);
//   ring2: also rings its second base; stallAfter / stallMin: once the wave timer is this many seconds past with no
//   wave (the army never reaches `hold`), it goes with whatever has gathered if that is at least stallMin units;
//   pushEvery / pushMin: the turtle's big push, at most this many seconds after its last wave (or its first-wave time) it goes
//   with every unit gathered, its home reserve too, if that is at least pushMin; allyReach / allyDelay / allyNeed: how far (cells) it
//   sends idle units to an ally's base under attack, how soon (s) and how much (times the raiders' worth) (defendAllies in world.js);
//   splitAt / split3: wave sizes that split into 3 or 2 squads and the chance of 3; eco: the raider's taste for
//   refineries, power and Outposts in aiWaveTarget.
//   lift: how it uses transport helicopters (aiAirAssault): from (share of firstWave before it builds one), n (how many it keeps),
//   min (fewest soldiers flown), prefer (kinds it loads first), pair ('behind' / 'flank': a drop timed to land with each ground
//   wave, behind the target or on its flank; stallOnly: only with a wave its stall rule sent), solo (seconds between drops of
//   their own; eco: at refineries, power and Outposts, landing behind them), aaWide (keeps that much further from known
//   anti-air at the landing spot, and the flight never crosses its reach), defend (flies idle infantry to an outlying base or refinery under attack).
const AI_STYLES = {
  balanced: { lift: { from: 0.6, n: 1, min: 8, pair: 'flank', minWave: 15 } },
  rusher: { firstWave: -180, hold: 0.3, full: 0.4, gapMul: 0.6, defAdd: -2, wallMul: 0.5, garAdd: -1,
    lift: { from: 0.4, n: 1, min: 4, prefer: { rifle: 3 }, pair: 'behind', solo: 100 } },
  turtle: { firstWave: 90, hold: 0.75, full: 0.85, gapMul: 1.2, armyMul: 1.3, defAdd: 8, aaAdd: 4, defRich: 800, guns2: 5, ring2: true, stallAfter: 240, stallMin: 18, pushEvery: 480, pushMin: 12, allyReach: 120, allyDelay: 4, allyNeed: 2.5, gunsAdd: 1, wallMul: 1.6, garAdd: 1, splitAt: [30, 18],
    lift: { from: 0.8, n: 1, min: 8, pair: 'flank', stallOnly: true, defend: true } },
  raider: { hold: 0.4, airGap: 0.6, splitAt: [12, 8], split3: 0.75, eco: true,
    lift: { from: 0.5, n: 2, min: 6, prefer: { rocket: 2, grenadier: 2 }, solo: 90, eco: true, aaWide: 1.25 } },
};
const AI_STYLE_KEYS = Object.keys(AI_STYLES);
const STYLE_DUP_CHANCE = 0.1;   // a roll that lands on an ally's style is kept only this often; otherwise it is rolled again among the unused ones
function aiStyle(team) {
  if (!team.style) {
    const taken = new Set(G.teams.filter((t) => t !== team && t.isAI && t.style && !hostile(t.id, team.id)).map((t) => t.style));
    let pick = AI_STYLE_KEYS[Math.floor(Math.random() * AI_STYLE_KEYS.length)];
    if (taken.has(pick) && Math.random() >= STYLE_DUP_CHANCE) {
      const free = AI_STYLE_KEYS.filter((k) => !taken.has(k));
      if (free.length) pick = free[Math.floor(Math.random() * free.length)];
    }
    team.style = pick;
  }
  return team.style;
}
// The difficulty's computer settings with this side's personality applied (one copy per difficulty and style).
const aiOfCache = new Map();
function aiOf(team) {
  const base = G.diff.ai;
  if (!base.planner || !team || !team.isAI) return base;
  const key = G.diffKey + ':' + aiStyle(team) + (TRANSPORTS ? ':lift' : '');
  let A = aiOfCache.get(key);
  if (!A) {
    const s = AI_STYLES[team.style];
    A = Object.assign({}, base, s, {
      firstWave: Math.max(240, base.firstWave + (s.firstWave || 0)), hold: s.hold || WAVE_HOLD, full: s.full || ARMY_FULL,
      defMax: Math.max(2, base.defMax + (s.defAdd || 0)), outpostGuns: (base.outpostGuns || 1) + (s.gunsAdd || 0),
      aa: base.aa + (s.aaAdd || 0), aaMax: base.aaMax + (s.aaAdd || 0),
      armyUnits: Math.round((base.armyUnits || ARMY_UNITS) * (s.armyMul || 1)), armyWorth: Math.round((base.armyWorth || ARMY_WORTH) * (s.armyMul || 1)),
      lift: TRANSPORTS ? s.lift : undefined,   // (transports on hold: data.js setTransports)
    });
    aiOfCache.set(key, A);
  }
  return A;
}
// Once a second: tracks the squads that have gone out, pulls a clearly losing one back to the rally
// point, and sends squads home to a defence that is short-handed (defendBase works out the shortfall).
// A marching squad keeps together round its leader, as in OpenRA's bot: the leader is the squad's slowest unit (the one nearest
// the middle if several are as slow), and a unit that has got more than LEADER_R cells (plus a little for a big squad) ahead of
// it, measured toward the target, holds still for a couple of seconds at a time until the leader catches up (`u.waitLeader`,
// read in updateUnit). Nothing holds once any of the squad has a target or has been hit (a fight goes on as it is), no unit
// holds for more than LEADER_MAX seconds at a stretch (it then goes on for LEADER_BAN), and units behind the leader never wait.
const LEADER_R = 6, LEADER_MAX = 20, LEADER_BAN = 30;
function aiLeader(list) {
  const m = list.filter((u) => u.alive && u.cls !== 'air' && (u.order.type === 'hunt' || u.order.type === 'attack'));
  if (m.length < 4) { for (const u of m) u.waitLeader = 0; return; }
  if (m.some((u) => (u.target && u.target.alive) || G.t - u.hitT < 8)) { for (const u of m) u.waitLeader = 0; return; }
  const pace = (u) => u.def.speed * (u.paceMul || 1);
  const cx = m.reduce((a, u) => a + u.x, 0) / m.length, cy = m.reduce((a, u) => a + u.y, 0) / m.length;
  let slow = Infinity;
  for (const u of m) slow = Math.min(slow, pace(u));
  let leader = null, bd = Infinity;
  for (const u of m) if (pace(u) <= slow * 1.05) { const d = Math.hypot(u.x - cx, u.y - cy); if (d < bd) { bd = d; leader = u; } }
  const t = leader && leader.focus && leader.focus.alive ? leader.focus : null;
  if (!t) { for (const u of m) u.waitLeader = 0; return; }
  const R = CELL * (LEADER_R + Math.sqrt(m.length) * 1.5), dl = Math.hypot(leader.x - t.x, leader.y - t.y);
  for (const u of m) {
    if (u === leader || (u.waitBan || 0) > G.t) { u.waitLeader = 0; continue; }
    const ahead = dl - Math.hypot(u.x - t.x, u.y - t.y) > R;
    if (!ahead) { u.waitLeader = 0; u.waitSince = 0; continue; }
    if (!(u.waitLeader > G.t)) u.waitSince = G.t;
    if (G.t - u.waitSince > LEADER_MAX) { u.waitLeader = 0; u.waitSince = 0; u.waitBan = G.t + LEADER_BAN; continue; }
    u.waitLeader = G.t + 2.5;
  }
}
function aiSquads(team) {
  const sq = team.squads;
  if (!sq || !sq.length) return;
  const rally = rallyPoint(team), seen = inViewOf(team.id), foes = enemyUnitsOf(team.id).filter((e) => e.def.weapon && !e.def.harvester && !e.def.scripted && e.cls !== 'air' && seen(e));
  const guns = enemyBuildingsOf(team.id).filter((b) => b.def.defense && !b.def.antiAir && targetable(team.id, b));
  const live = (s) => s.units.filter((u) => u.alive && !u.defending && !u.homeward && u.order.type !== 'repair' && !u.repairHold);
  const worth = (l) => l.reduce((a, u) => a + (u.def.cost || 300), 0);
  const cy = buildingsOf(team.id).find((b) => b.type === 'cy');
  team.squads = sq.filter((s) => {
    const l = live(s);
    if (l.length < 2) return false;
    const mine = worth(l), cx = l.reduce((a, u) => a + u.x, 0) / l.length, cyy = l.reduce((a, u) => a + u.y, 0) / l.length;
    // Home defence short of units: the nearest squads still on the home side of the map turn back.
    if (team.defShort > 0 && cy && team.raiders && team.raiders.length && Math.hypot(cx - cy.x, cyy - cy.y) < CELL * 50) {
      const t = G.byId.get(team.raiders[0]);
      if (t && t.alive) {
        for (const u of l) { u.post = { x: rally.x, y: rally.y, staged: true }; u.defending = true; u.staged = false; setGuard(u, t.x, t.y); u.target = t; goTo(u, t.x, t.y); }
        team.defShort -= mine; team.sqn = team.sqn || { home: 0, back: 0 }; team.sqn.home++;
        return false;
      }
    }
    // Clearly losing: a squad that started with 8 units or more, under 35% of its starting worth left,
    // with a force at least twice as strong on top of it.
    let theirs = 0;
    for (const e of foes) if (Math.hypot(e.x - cx, e.y - cyy) < CELL * 14) theirs += e.def.cost || 300;
    for (const b of guns) if (Math.hypot(b.x - cx, b.y - cyy) < CELL * 12) theirs += 500;
    if (s.n0 >= 8 && mine < s.value0 * 0.35 && theirs > mine * 2) {
      const deal = spotDealer(team);
      for (const u of l) { const p = deal(u, rally.x, rally.y); setGuard(u, p.x, p.y); u.staged = true; goTo(u, p.x, p.y); }
      team.sqn = team.sqn || { home: 0, back: 0 }; team.sqn.back++;
      return false;
    }
    aiLeader(l);
    return true;
  });
}
// Scouting: like the player, the computer only knows the enemy buildings it has uncovered. Once its
// first-wave timer is up (a minute in on Hard) it sends a scout to the map's other starting spots
// in turn, nearest first, then to whatever ground it has not seen: the Spy Plane if it is charged,
// else a helicopter, else its fastest ground unit. Its waves wait until the base is found.
// more: a base is found already (team games), so this is one scout looking for the others. It takes no unit
// waiting for a wave (its own fastest idle unit instead), and a lost scout is replaced at most once a minute.
const SCOUT_AGAIN = 60;
function aiScout(team, ready, more) {
  const s = team.scout || (team.scout = { u: null, until: 0 });
  if (G.t < s.until) return;                                         // a Spy Plane is on its way
  if (s.u && s.u.alive && s.u.order.type === 'move') return;          // the scout is on its way
  const seen = (x, y) => G.fog[team.id][idx(Math.round(x), Math.round(y))];
  const home = team.start;
  // Not its own or an ally's start (nothing to find there).
  const friend = (p) => G.teams.some((t) => !hostile(team.id, t.id) && t.start && t.start.cx === p.cx && t.start.cy === p.cy);
  let spots = G.spawns.filter((p) => !friend(p) && !seen(p.cx, p.cy));
  if (!spots.length) for (let y = 4; y < MAP - 4; y += 8) for (let x = 4; x < MAP - 4; x += 8) if (!seen(x, y)) spots.push({ cx: x, cy: y });
  if (!spots.length) return;
  // The scout carries on to the nearest spot from where it is; a new one sets out from home.
  const kept = s.u && s.u.alive && !s.u.retreat && !(s.u.cls === 'air' && airEmpty(s.u)) ? s.u : null;
  if (more && !kept && G.t < (s.again || 0)) return;
  const from = kept ? { cx: kept.x / CELL, cy: kept.y / CELL } : home;
  const near = (p) => Math.hypot(p.cx - from.cx, p.cy - from.cy);
  let to = spots.reduce((a, b) => (near(a) <= near(b) ? a : b));
  // A scout setting out from home: the computers of an alliance each try a different start first (the k-th computer
  // its k-th nearest), so they do not all find the same base and stop there.
  if (!kept && spots.length > 1) {
    const k = G.teams.filter((t) => t.isAI && t.ally === team.ally && t.id < team.id).length;
    to = spots.slice().sort((a, b) => near(a) - near(b))[k % spots.length];
  }
  const x = (to.cx + 0.5) * CELL, y = (to.cy + 0.5) * CELL;
  if (powerReady(team, 'spy')) { launchPower(team, 'spy', x, y); s.until = G.t + 20; return; }
  const heli = unitsOf(team.id).find((u) => u.def.fly === 'heli' && !u.interceptor && !u.repairHold && (u.as === 'landed' || u.order.type === 'guard'));
  const pool = more ? idleGround(team).filter((u) => u.staged && u.def.weapon && !u.def.harvester && !u.def.deploys && !u.manual && !u.defending && !u.assisting) : ready;
  const runner = pool.filter((u) => !u.def.harvester).sort((a, b) => b.def.speed - a.def.speed)[0];
  // Something faster than the scout (a helicopter, or a vehicle over half as fast again) takes over.
  const faster = (heli && kept && kept.cls !== 'air') || (runner && kept && kept.cls !== 'air' && runner.def.speed > kept.def.speed * 1.5);
  const u = kept && !faster ? kept : heli || runner;
  if (!u) return;
  if (kept && u !== kept) aiScoutDone(team);
  if (more && u !== kept) s.again = G.t + SCOUT_AGAIN;
  if (u.cls === 'air' && u.as === 'landed') u.as = 'takeoff';
  commandMove([u], x, y);
  s.u = u;
}
// Base found: the scout comes home (a helicopter to its pad, anyone else to wait for the next wave).
function aiScoutDone(team) {
  const s = team.scout;
  if (!s || !s.u) return;
  const u = s.u; s.u = null;
  if (!u.alive) return;
  if (u.cls === 'air') { setGuard(u); u.order.pad = true; u.staged = true; return; }
  const r = spotDealer(team)(u, rallyPoint(team).x, rallyPoint(team).y);
  setGuard(u, r.x, r.y); u.staged = true; goTo(u, r.x, r.y);
}

// Send units at a target: each heads straight for it from where it waits, at its own top speed,
// fighting what it meets. A big push calls in its held Airfield powers once the first of it closes in.
function aiSend(team, units, target, o) {
  for (const u of units) { setHunt(u); u.staged = false; u.focus = target; }
  if (aiOf(team).planner && units.length >= 3) (team.squads = team.squads || []).push({ units, n0: units.length, value0: units.reduce((a, u) => a + (u.def.cost || 300), 0) });
  if (o.strike) team.strike = { keys: o.strike, target, units };
  if (units.length >= 3) logWave(team.id, !!o.strike);
  return units;
}
function aiStrike(team) {
  const s = team.strike;
  if (!s) return;
  if (!s.target.alive || !s.units.some((u) => u.alive)) { team.strike = null; team.holdFor = null; return; }
  if (!s.units.some((u) => u.alive && dist(u, s.target) < CELL * 22)) return;
  for (const key of s.keys) launchPower(team, key, s.target.x, s.target.y + (key === 'para' ? CELL * 3 : 0));
  team.strike = null; team.holdFor = null;
}
// Two-pronged attack (Normal and Hard, A.pincer): the wave splits in two, each half gathers at a
// point on either flank of the target, out of range of its guns, and once both are in place (or
// 30 seconds after the first half gets there, or at once if a quarter of the wave is lost) they close in together, so the attack comes from two sides at once. Each half
// guards its gathering point on the way, so it fights back if attacked.
function aiPincerStart(team, units, target, strike, n = 2) {
  if (team.pincer) return false;
  let spots = null;
  if (A_PLANNER()) for (let k = n; k >= 2 && !spots; k--) spots = aiApproachSpots(team, units[0], target, k);
  if (!spots || spots.length < 2) {
    const r = rallyPoint(team), base = Math.atan2(r.y - target.y, r.x - target.x);
    spots = [];
    for (const side of [-1, 1]) {
      const a = base + side * 1.2, d = CELL * 13;
      const cx = Math.max(3, Math.min(MAP - 4, Math.floor((target.x + Math.cos(a) * d) / CELL)));
      const cy = Math.max(3, Math.min(MAP - 4, Math.floor((target.y + Math.sin(a) * d) / CELL)));
      const c = nearestFreeCell(idx(cx, cy), 6);
      if (c < 0) return false;
      spots.push({ x: (cellX(c) + 0.5) * CELL, y: (cellY(c) + 0.5) * CELL });
    }
  }
  // Split the wave evenly between the points (the units wait in one place, so nearest-point would send them all to one).
  const mix = units.slice().sort(() => Math.random() - 0.5), groups = spots.map(() => []);
  mix.forEach((u, i) => groups[i % spots.length].push(u));
  return aiGather(team, groups, spots, target, strike, units.length);
}
const A_PLANNER = () => !!G.diff.ai.planner;
// The wave goes round to one gathering point first, then in on the target (planner waves, A.approach).
function aiApproachStart(team, units, target, strike) {
  if (team.pincer) return false;
  const spots = aiApproachSpots(team, units[0], target, 1);
  if (!spots || !spots.length) return false;
  return aiGather(team, [units], spots, target, strike, units.length);
}
// Sends each group to its gathering point (guarding it on the way) and starts the wait in aiPincer.
function aiGather(team, groups, spots, target, strike, n) {
  const deal = spotDealer(team);   // each unit its own cell round the gathering point (they piled up on it)
  groups.forEach((g, i) => {
    const p = spots[i];
    for (const u of g) { const s = deal(u, p.x, p.y); setGuard(u, s.x, s.y); u.staged = false; goTo(u, s.x, s.y); }
  });
  // Long marches get longer: give up waiting only well after the slowest unit could have arrived.
  const slow = Math.min(...groups.flat().map((u) => u.def.speed * (u.paceMul || 1)));
  const far = Math.max(...groups.map((g, i) => Math.hypot(g[0].x - spots[i].x, g[0].y - spots[i].y)));
  const limit = Math.max(150, Math.min(480, far * 1.4 / slow + 60));
  team.pincer = { groups, spots, target, strike, since: G.t, n, limit };
  return true;
}
// Gathering points for an attack on `target`: about 13 to 17 cells out from it on randomly chosen sides.
// Candidates all round the target are kept only if the units can walk there without a huge detour, then
// picked at random, favouring short routes and sides the computer has not used lately (measured round
// the enemy's Construction Yard, where a player builds defences), so a base cannot count on one direction.
function aiApproachSpots(team, from, target, count) {
  const foe = G.teams[target.team] || enemyOf(team), cy = buildingsOf(foe.id).find((b) => b.type === 'cy') || target;
  const guns = enemyBuildingsOf(team.id).filter((b) => b.def.defense && !b.def.antiAir && targetable(team.id, b));
  // One search from where the wave waits gives the way's length to the target and to every candidate point.
  const far = Math.hypot(from.x - target.x, from.y - target.y) / CELL;
  const field = pathField(from.x, from.y, far * 2.6 + 40);
  const way = (x, y, r) => { const c = nearestFreeCell(cellOfPos(x, y), r); return c < 0 ? Infinity : field[c] * CELL; };
  let direct = way(target.x, target.y, 12);
  if (direct === Infinity) direct = far * CELL;   // (out of reach on the ground: as the crow flies)
  if (!direct) return null;
  const hist = team.apHist || [], r = Math.random;
  const diff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const cands = [];
  for (let i = 0; i < 12; i++) {
    const a = (i + (r() - 0.5) * 0.8) * Math.PI / 6, d = CELL * (13 + r() * 4);
    const cx = Math.max(3, Math.min(MAP - 4, Math.floor((target.x + Math.cos(a) * d) / CELL)));
    const cyy = Math.max(3, Math.min(MAP - 4, Math.floor((target.y + Math.sin(a) * d) / CELL)));
    const c = nearestFreeCell(idx(cx, cyy), 6);
    if (c < 0) continue;
    const spot = { x: (cellX(c) + 0.5) * CELL, y: (cellY(c) + 0.5) * CELL };
    if (guns.some((b) => Math.hypot(b.x - spot.x, b.y - spot.y) < CELL * 11)) continue;   // out of range of their guns
    const len = field[c] * CELL;
    if (len === Infinity) continue;   // cannot get there
    const ratio = (len + Math.hypot(spot.x - target.x, spot.y - target.y)) / direct;
    if (ratio > 2.6) continue;
    const bearing = Math.atan2(spot.y - cy.y, spot.x - cy.x);
    let w = 1 / (1 + Math.max(0, ratio - 1) * 2.5);
    for (const h of hist) if (diff(h, bearing) < 0.7) w *= 0.3;
    if (diff(a, Math.atan2(from.y - target.y, from.x - target.x)) < 0.9) w *= 0.2;   // a point straight ahead is no flank: rarely chosen
    cands.push({ spot, bearing, w });
  }
  const out = [];
  while (out.length < count && cands.length) {
    const tot = cands.reduce((a, c) => a + c.w, 0);
    let roll = r() * tot, k = 0;
    while (k < cands.length - 1 && (roll -= cands[k].w) > 0) k++;
    const pick = cands.splice(k, 1)[0];
    out.push(pick);
    for (let m = cands.length - 1; m >= 0; m--) if (diff(cands[m].bearing, pick.bearing) < 0.9) cands.splice(m, 1);   // a second point is on another side
  }
  if (out.length < count) return null;
  team.apHist = hist.concat(out.map((o) => o.bearing)).slice(-4);
  return out.map((o) => o.spot);
}
function aiPincer(team) {
  const p = team.pincer;
  if (!p) return;
  const alive = p.groups.map((g) => g.filter((u) => u.alive && u.order.type === 'guard' && !u.defending));
  const all = [].concat(...alive);
  const there = alive.map((g, i) => !g.length || g.filter((u) => Math.hypot(u.x - p.spots[i].x, u.y - p.spots[i].y) < CELL * Math.max(5, 2 + Math.sqrt(g.length))).length >= g.length * 0.6);
  if (!all.length) { team.pincer = null; return; }
  if (p.firstIn === undefined && there.some((x, i) => x && alive[i].length)) p.firstIn = G.t;
  const waited = p.firstIn !== undefined ? G.t - p.firstIn > 30 : G.t - p.since > (p.limit || 150);
  if (!there.every((x) => x) && p.target.alive && !waited && all.length >= p.n * 0.75) return;
  team.pincer = null;
  const target = p.target.alive ? p.target : aiWaveTarget(team, all[0]);
  if (target) aiSend(team, all, target, { strike: p.strike });
  else for (const u of all) setHunt(u);
}
// What the computer builds against (Normal and Hard, A.counter): the enemy ground army it can see
// (mostly infantry, or mostly armour) and how fortified the enemy base it knows of is.
// Which enemy side to attack in a team game (team.focusSide, read by enemyOf and the attackers'
// nearestEnemyBuilding). Looked at again every 30 seconds, on every difficulty. Two phases, per alliance:
// - Spread (the opening): each computer side takes an enemy of its own, nearest first, so the computers of an
//   alliance do not gang up on one player (aiSpreadPlan). Only enemies whose base has been found count: while a
//   base is still hidden, two computers may go for the same one meanwhile.
// - Gang (once the alliance's computer sides have sent SPREAD_WAVES waves each on average: a turtle sends few): the alliance picks one enemy
//   together at random (the strongest more likely, one that just lost its Construction Yard left alone for a while)
//   and all its computers go for it; picked again every GANG_HOLD seconds or when it is beaten (aiGangPlan, G.gang[ally]).
const FOE_PICK_EVERY = 30, SPREAD_WAVES = 3, GANG_HOLD = 360;
function aiPickFoe(team) {
  const foes = G.teams.filter((t) => hostile(team.id, t.id));
  if (foes.length < 2) return;
  if (team.foePickT && G.t - team.foePickT < FOE_PICK_EVERY && chosenFoe(team)) return;
  team.foePickT = G.t;
  const known = foes.filter((f) => !f.out && inTheFight(f.id) && enemyBaseKnown(team.id, f.id));
  if (!known.length) { team.focusSide = null; return; }
  const mates = G.teams.filter((t) => t.isAI && t.ally === team.ally && !t.out);
  const spread = mates.reduce((n, t) => n + (t.waves || 0), 0) < SPREAD_WAVES * mates.length;
  const pick = spread ? aiSpreadPlan(team, mates, known) : aiGangPlan(team, known);
  team.focusSide = pick ? pick.id : null;
}
// The opening: the alliance's computer sides (in side order) each take the nearest found enemy no earlier one has
// taken; with more computers than found enemies, the least taken (nearest on a tie). Worked out the same way by
// every side of the alliance, so they agree without talking.
function aiSpreadPlan(team, mates, known) {
  const taken = new Map(known.map((f) => [f.id, 0]));
  const d = (a, f) => Math.hypot(f.start.cx - a.start.cx, f.start.cy - a.start.cy);
  for (const m of mates.slice().sort((a, b) => a.id - b.id)) {
    let best = null, bs = Infinity;
    for (const f of known) {
      const sc = taken.get(f.id) * 1e6 + d(m, f);
      if (sc < bs) { bs = sc; best = f; }
    }
    if (m === team) return best;
    taken.set(best.id, taken.get(best.id) + 1);
  }
  return null;
}
// Later on: one enemy for the whole alliance, rolled at random, the strongest more likely (up to twice as likely as
// the weakest: army worth plus buildings, all of it, so a player who is ahead feels it). An enemy that lost a
// Construction Yard in the last BREATHER seconds is left alone if anyone else can be picked, and a gang on it
// breaks up at once. Kept GANG_HOLD seconds or until it is beaten. G.gang is plain data (saved).
const BREATHER = 150;
function aiGangPlan(team, known) {
  G.gang = G.gang || {};
  const resting = (f) => f.cyLostT !== undefined && G.t - f.cyLostT < BREATHER;
  const pool = known.filter((f) => !resting(f)).length ? known.filter((f) => !resting(f)) : known;
  const g = G.gang[team.ally];
  const cur = g && pool.find((f) => f.id === g.side);
  if (cur && G.t < g.until) return cur;
  const strength = (tid) => {
    let v = 0;
    for (const u of unitsOf(tid)) if (u.def.weapon && !u.def.scripted) v += u.def.cost || 300;
    for (const b of buildingsOf(tid)) v += b.def.cost || 600;
    return v;
  };
  const m = pool.map((f) => strength(f.id)), top = Math.max(1, ...m);
  const w = m.map((v) => 1 + v / top);
  let r = Math.random() * w.reduce((a, b) => a + b, 0), pick = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) if ((r -= w[i]) < 0) { pick = pool[i]; break; }
  G.gang[team.ally] = { side: pick.id, until: G.t + GANG_HOLD };
  return pick;
}
function aiCounter(team) {
  if (!aiOf(team).counter) return;
  if (team.counterT && G.t - team.counterT < 10) return;
  team.counterT = G.t;
  const foe = enemyOf(team), seen = inViewOf(team.id);
  let inf = 0, veh = 0;
  for (const u of unitsOf(foe.id)) {
    if (u.def.harvester || u.def.scripted || u.cls === 'air' || u.def.deploys || !u.def.weapon || !seen(u)) continue;
    if (u.cls === 'inf') inf += u.def.cost; else veh += u.def.cost;
  }
  const n = inf + veh;
  const guns = buildingsOf(foe.id).filter((b) => b.def.defense && !b.def.antiAir && targetable(team.id, b)).length;
  team.counter = { inf: n >= 1500 && inf > n * 0.55, armor: n >= 2500 && veh > n * 0.6, turtle: guns >= 6 };
}
// What a wave goes for. Easy: the Construction Yard, and one wave in three an outlying site.
// Normal: a mix of the Construction Yard, refineries, power and outlying sites. Hard: whatever
// valuable building is least defended.
function aiWaveTarget(team, from) {
  const A = aiOf(team), r = Math.random;
  let foe = enemyOf(team), theirs = buildingsOf(foe.id).filter((b) => targetable(team.id, b));
  // Its chosen enemy's base is not found yet but another enemy's is (team games): attack that one meanwhile.
  if (!theirs.length) {
    let bd = Infinity;
    for (const f of foesOf(team.id)) {
      const t = G.teams[f], bl = buildingsOf(f).filter((b) => targetable(team.id, b));
      if (!bl.length) continue;
      const d = Math.hypot(t.start.cx - team.start.cx, t.start.cy - team.start.cy);
      if (d < bd) { bd = d; foe = t; theirs = bl; }
    }
  }
  if (!theirs.length) return lastStand({ team: team.id, x: from.x, y: from.y });
  const cy = theirs.find((b) => b.type === 'cy');
  if (A.targets === 'cy') {
    const exp = expansionsOf(foe, from);
    return (exp.length && (team.waves || 0) % 3 === 2 ? exp[0] : null) || cy || nearestEnemyBuilding(from);
  }
  if (A.targets === 'mixed') {
    const of = (types) => { const l = theirs.filter((b) => types.includes(b.type)); return l.length ? l[Math.floor(r() * l.length)] : null; };
    const roll = r();
    return (roll < 0.45 ? cy : roll < 0.7 ? of(['refinery']) : roll < 0.85 ? of(['power', 'apower']) : expansionsOf(foe, from)[0]) || cy || theirs[0];
  }
  // Valuable and lightly guarded scores highest; whatever the last wave went for scores less.
  const value = { cy: 2.4, refinery: 3, power: 2.6, apower: 2.8, factory: 2.2, outpost: 2.4, airfield: 2, helipad: 1.6, barracks: 1.6, depot: 1.4, tech: 1.8 };
  const guns = theirs.filter((b) => b.def.defense);
  let best = null, bs = -Infinity;
  for (const b of theirs) {
    if (b.def.defense) continue;
    // The raider goes for the economy (refineries, power, Outposts) and shies from guns more.
    const eco = A.eco && ['refinery', 'power', 'apower', 'outpost'].includes(b.type) ? 1.5 : 1;
    const sc = (value[b.type] || 1) * eco - guns.filter((d) => dist(d, b) < CELL * 8).length * (A.eco ? 0.9 : 0.6) + r() * 2 - (b === team.lastTarget || b.type === team.lastType ? 1.4 : 0);
    if (sc > bs) { bs = sc; best = b; }
  }
  best = best || cy || theirs[0];
  team.lastTarget = best; team.lastType = best.type;
  return best;
}
