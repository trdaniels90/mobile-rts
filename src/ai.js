'use strict';
// Computer opponent. It plays by the same rules as the player: same tech tree, same costs.
// How it attacks and defends depends on the difficulty (DIFFICULTY[...].ai in data.js).

function aiCount(team) {
  const c = {};
  for (const e of G.entities) if (e.alive && e.team === team.id) c[e.type] = (c[e.type] || 0) + 1;
  return c;
}

function aiNextStructure(team, c) {
  const p = team.power, defense = team.faction === 'allies' ? 'turret' : 'tesla', aa = team.faction === 'allies' ? 'aagun' : 'sam';
  const antiInf = team.faction === 'allies' ? 'pillbox' : 'ftur';
  const pending = team.queues.structure;
  if (pending) return null;
  const n = (t) => c[t] || 0;
  const powerNeed = (t) => -Math.min(0, BUILD_DEFS[t].power);
  const pwr = available(team, 'apower') ? 'apower' : 'power';
  // An Outpost with no refinery beside it yet comes first: that is what it was sent out for.
  if (aiLonelyOutpost(team) && available(team, 'refinery') && n('refinery') < 6) {
    return p.prod - p.use < powerNeed('refinery') + 10 && available(team, pwr) ? pwr : 'refinery';
  }
  // How many defences it may have depends on the difficulty; more AA once the enemy flies.
  const A = G.diff.ai, capMain = Math.round(A.defMax * 0.6), capInf = A.defMax - capMain;
  const enemyAir = unitsOf(enemyOf(team).id).filter((u) => u.cls === 'air' && !u.def.scripted).length;
  if (enemyAir) team.sawAir = true;
  const aaWant = team.sawAir ? Math.min(A.aaMax, A.aa + Math.ceil(enemyAir / 2)) : A.aa;
  const wants = [
    ['refinery', 1], ['barracks', 1], [antiInf, Math.min(1, capInf)], ['factory', 1], [defense, Math.min(1, capMain)], ['refinery', 2], ['dome', 1],
    ['helipad', 1], [antiInf, Math.min(2, capInf)], [defense, Math.min(2, capMain)], [aa, Math.min(1, aaWant)], ['airfield', 1],
    ['factory', 2], [defense, Math.min(3, capMain)], [aa, aaWant], ['refinery', 3], [defense, Math.min(4, capMain)],
  ];
  const build = (type) => (p.prod - p.use < powerNeed(type) + 10 && available(team, pwr) ? pwr : type);   // power first if needed
  for (const [type, count] of wants) {
    if (n(type) >= count || !available(team, type)) continue;
    return build(type);
  }
  // Then a gun at each Outpost (and on Hard each outlying refinery), and more defences while rich.
  if (available(team, defense) && aiGuardSite(team) && n(defense) < capMain) return build(defense);
  if (team.credits > 1500) {
    const t = n(defense) / Math.max(1, capMain) <= n(antiInf) / Math.max(1, capInf) ? defense : antiInf;
    const other = t === defense ? antiInf : defense, cap = (x) => (x === defense ? capMain : capInf);
    for (const x of [t, other]) if (n(x) < cap(x) && available(team, x)) return build(x);
  }
  if (p.prod - p.use < 40) return pwr;
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
    const sc = aas.filter((a) => dist(a, b) < CELL * 6).length * 10 + (hit ? Math.hypot(b.x - hit.x, b.y - hit.y) / CELL * 0.3 : Math.random() * 3);
    if (sc < bs) { bs = sc; best = b; }
  }
  return best;
}
// Normal and Hard keep a few anti-aircraft soldiers or vehicles at home once enemy aircraft are
// about, posted beside the key buildings, instead of sending them out with the waves.
function aiHomeGuard(team, u) {
  const A = G.diff.ai;
  const hitsAir = (w) => !!(w && w.air);
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
  const A = G.diff.ai;
  if (!A.adapt || !team.sawAir || !(u.def.weapon2 && u.def.weapon2.air)) return false;
  if (unitsOf(team.id).filter((e) => e.interceptor).length >= A.interceptors) return false;
  u.interceptor = true;
  return true;
}
function aiScramble(team) {
  const A = G.diff.ai;
  if (!A.adapt || !team.sawAir) return;
  const mine = buildingsOf(team.id);
  const intruders = unitsOf(enemyOf(team).id).filter((u) => u.cls === 'air' && !u.def.scripted && isAirborne(u) && mine.some((b) => distTo(u, b) < CELL * 20));
  for (const u of unitsOf(team.id)) {
    if (!u.interceptor || u.repairHold || !(u.aam > 0)) continue;
    if (intruders.length) {
      if (u.order.type === 'attack' && u.order.target.alive) continue;
      const t = intruders.reduce((a, b) => (dist(u, a) < dist(u, b) ? a : b));
      if (canTarget(u, t)) commandAttack([u], t);
    } else if (u.order.type !== 'guard' || !u.order.pad) { setGuard(u); u.order.pad = true; }   // all clear: back to the Airfield
  }
}
// An Outpost (or on Hard an outlying refinery) with no gun beside it yet.
function aiGuardSite(team) {
  const A = G.diff.ai;
  if (!A.guard.length) return null;
  const mine = buildingsOf(team.id), cy = mine.find((b) => b.type === 'cy');
  const guns = mine.filter((b) => b.def.defense && !b.def.antiAir);
  return mine.find((b) => A.guard.includes(b.type) && b.buildT >= 1 && (b.type !== 'refinery' || (cy && dist(b, cy) > CELL * 14)) &&
    !guns.some((d) => dist(d, b) < CELL * 6)) || null;
}

// Forward mining: an ore field on its own half of the map that its refineries are far from.
function aiRemoteField(team) {
  const mine = buildingsOf(team.id).filter((b) => b.type === 'refinery' || b.type === 'outpost' || b.type === 'cy');
  const home = team.start, foe = enemyOf(team).start;
  let best = null, bd = Infinity;
  for (const f of G.oreFields) {
    let ore = 0;
    for (let y = Math.floor(f.cy - f.r); y <= f.cy + f.r; y++) for (let x = Math.floor(f.cx - f.r); x <= f.cx + f.r; x++) if (inMap(x, y)) ore += G.ore[idx(x, y)];
    if (ore < 800) continue;
    const dHome = Math.hypot(f.cx - home.cx, f.cy - home.cy);
    if (dHome > Math.hypot(f.cx - foe.cx, f.cy - foe.cy)) continue;
    if (mine.some((b) => Math.hypot(b.cx - f.cx, b.cy - f.cy) < 15)) continue;
    if (dHome < bd) { bd = dHome; best = f; }
  }
  return best;
}
function aiLonelyOutpost(team) {
  const mine = buildingsOf(team.id);
  return mine.find((b) => b.type === 'outpost' && !mine.some((r) => r.type === 'refinery' && dist(r, b) < CELL * 9)) || null;
}
// Drive a Mobile Outpost to just short of the field (on the home side) and deploy it there.
function aiDriveFob(team, u) {
  if (!u.aiGoal) {
    const f = aiRemoteField(team);
    if (!f) return;
    const a = Math.atan2(team.start.cy - f.cy, team.start.cx - f.cx), back = f.r + 3;
    u.aiGoal = { x: (f.cx + 0.5 + Math.cos(a) * back) * CELL, y: (f.cy + 0.5 + Math.sin(a) * back) * CELL };
    commandMove([u], u.aiGoal.x, u.aiGoal.y);
    return;
  }
  const d = Math.hypot(u.x - u.aiGoal.x, u.y - u.aiGoal.y);
  if (d < CELL * 2.5 || (u.order.type === 'guard' && d < CELL * 6)) { if (!deployFob(u)) u.aiGoal = null; }
  else if (u.order.type === 'guard') commandMove([u], u.aiGoal.x, u.aiGoal.y);
}

function aiFindSpot(team, type) {
  const cy = G.entities.find((e) => e.alive && e.team === team.id && e.type === 'cy');
  const lonely = type === 'refinery' && aiLonelyOutpost(team);
  const d = BUILD_DEFS[type], foe = enemyOf(team).start;
  const guard = (d.defense && !d.antiAir && aiGuardSite(team)) || (d.antiAir && G.diff.ai.adapt && aiAaSite(team));
  const anchor = guard || lonely || cy || buildingsOf(team.id)[0];
  if (!anchor) return null;
  // Guns face the enemy base, or on Normal and Hard the way recent attacks came from.
  const from = team.attackFrom && team.attackFrom.length && G.diff.ai.targets !== 'cy' && !guard ? team.attackFrom : null;
  const toFoe = from ? from[Math.floor(Math.random() * from.length)] : Math.atan2(foe.cy - anchor.cy, foe.cx - anchor.cx);
  // Refineries go toward the nearest ore field so trucks have short trips.
  let toOre = 0;
  if (type === 'refinery') {
    let bd = Infinity;
    for (const f of G.oreFields) {
      const dd = Math.hypot(f.cx - anchor.cx, f.cy - anchor.cy);
      if (dd < bd && !buildingsOf(team.id).some((b) => b.type === 'refinery' && Math.hypot(f.cx - b.cx, f.cy - b.cy) < 7)) { bd = dd; toOre = Math.atan2(f.cy - anchor.cy, f.cx - anchor.cx); }
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

function aiPowerTarget(team, cluster) {
  const theirs = buildingsOf(enemyOf(team).id);
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

function aiThink(team) {
  const c = aiCount(team);
  if (unitsOf(enemyOf(team).id).some((u) => u.cls === 'air' && !u.def.scripted)) team.sawAir = true;
  const q = team.queues.structure;
  if (q && q.ready) {
    const spot = aiFindSpot(team, q.type);
    if (spot) placeStructure(team, q.type, spot.cx, spot.cy);
    else if (Math.random() < 0.05) cancelProduction(team, q.type);
  } else if (!q) {
    const next = aiNextStructure(team, c);
    if (next && team.credits >= Math.min(BUILD_DEFS[next].cost * 0.25, 500)) startProduction(team, next);
  }

  // Forward outposts: send a Mobile Outpost to a rich field far from its refineries.
  const fobs = unitsOf(team.id).filter((u) => u.type === 'fob');
  for (const u of fobs) aiDriveFob(team, u);
  if (c.factory && !fobs.length && !team.queues.vehicle.some((i) => i.type === 'fob') && (c.outpost || 0) < 2 &&
      (c.refinery || 0) >= 1 && team.credits > 1200 && aiRemoteField(team)) startProduction(team, 'fob');

  // Keep the economy running.
  const refineries = c.refinery || 0, trucks = c.harv || 0;
  const wantTrucks = refineries * 2 - (G.diffKey === 'easy' ? refineries : 0);
  const vq = team.queues.vehicle;
  if (c.factory && trucks < wantTrucks && !vq.some((i) => i.type === 'harv') && trucks < 5) startProduction(team, 'harv');

  // Spend the rest on an army; hold some back while a structure is being paid for.
  const sq = team.queues.structure;
  const reserve = sq && !sq.ready ? Math.min(1500, BUILD_DEFS[sq.type].cost * (1 - sq.progress)) : 0;
  const money = team.credits - reserve;
  const army = G.entities.filter((e) => e.alive && e.team === team.id && e.kind === 'unit' && !e.def.harvester).length;
  if (army > 45) return;
  // Once the enemy flies aircraft (Normal and Hard), lean on units that can shoot them down:
  // rocket soldiers, Mammoths or Rangers, and fighters rather than helicopters.
  const A = G.diff.ai, anti = A.adapt && team.sawAir;
  const iq = team.queues.infantry;
  if (c.barracks && iq.length < A.queue && money > 150) {
    const r = Math.random();
    startProduction(team, anti && r < 0.5 ? 'rocket' : r < 0.45 ? 'rifle' : team.faction === 'soviets' && r < 0.72 ? 'grenadier' : 'rocket');
  }
  if (c.factory && vq.length < A.queue && money > 500) {
    const opts = team.faction === 'allies' ? (anti ? ['mtank', 'mtank', 'ranger', 'ranger', 'ltank'] : ['ltank', 'mtank', 'mtank', 'ranger'])
      : (anti ? ['htank', 'mammoth', 'mammoth', 'htank'] : ['htank', 'htank', 'htank', 'mammoth']);
    const sup = team.faction === 'allies' ? 'arty' : 'v2rl';                        // long-range support, once it has a Radar Dome
    if (available(team, sup) && (c[sup] || 0) < 4) opts.push(sup);
    startProduction(team, opts[Math.floor(Math.random() * opts.length)]);
  }
  const aq = team.queues.aircraft;
  const air = G.entities.filter((e) => e.alive && e.team === team.id && e.cls === 'air').length;
  if (aq.length < 1 && money > (anti ? 600 : 900) && air < 6) {
    const heli = team.faction === 'allies' ? 'heli' : 'hind', jet = team.faction === 'allies' ? 'jet' : 'mig';
    if (c.airfield && anti && Math.random() < 0.8) startProduction(team, jet);
    else if (c.helipad && (Math.random() < 0.5 || !c.airfield)) startProduction(team, heli);
    else if (c.airfield) startProduction(team, jet);
  }
  aiScramble(team);

  // Airfield support powers: bomb the thickest part of the enemy base, drop troops on its economy,
  // unless they are being held back for a big push (not for more than three minutes).
  const held = (k) => team.holdFor && team.holdFor.keys.includes(k) && G.t - team.holdFor.since < 180;
  if (powerReady(team, 'bomb') && !held('bomb')) { const t = aiPowerTarget(team, true); if (t) launchPower(team, 'bomb', t.x, t.y); }
  if (powerReady(team, 'para') && !held('para')) { const t = aiPowerTarget(team, false); if (t) launchPower(team, 'para', t.x, t.y); }

  // Patch up damaged buildings when there is cash to spare.
  if (team.credits > 800) for (const b of buildingsOf(team.id)) if (b.hp < b.maxHp * 0.6) b.repairing = true;
  // Pour surplus cash into extra tanks.
  if (team.credits > 4000 && c.factory && vq.length < 3) startProduction(team, team.faction === 'allies' ? 'mtank' : 'htank');
}

// --- Attack waves ------------------------------------------------------------------
// The computer does not wait for groups of eight like the player's Auto Attack. Each wave is
// planned in advance: an ordinary wave or a big push (sizes by difficulty), a formation, a
// crossing to go by and a target. Between waves, small raids of its fastest units go after
// Ore Trucks and outlying sites. Runs once a second with the units waiting at the rally point.
function aiPlanWave(team) {
  const A = G.diff.ai, r = Math.random, big = !!A.big && r() < A.bigChance;
  const [lo, hi] = big ? A.big : A.wave;
  team.holdFor = big && A.strike.length ? { keys: A.strike, since: G.t } : null;
  return { size: lo + Math.floor(r() * (hi - lo + 1)), big };
}
function aiLaunch(team, ready) {
  const A = G.diff.ai, r = Math.random;
  if (!team.plan) team.plan = aiPlanWave(team);
  if (team.raidAt === undefined) team.raidAt = A.raidFrom + r() * 30;
  if (G.t >= team.raidAt && ready.length >= 3) {
    team.raidAt = G.t + A.raidGap[0] + r() * (A.raidGap[1] - A.raidGap[0]);
    const target = aiRaidTarget(team);
    if (target) {
      const fast = ready.slice().sort((a, b) => b.def.speed - a.def.speed).slice(0, Math.min(ready.length, 3 + Math.floor(r() * 3)));
      aiSend(team, fast, target, { form: ['line', 'wedge', 'skirmish'][Math.floor(r() * 3)], focus: true });
      ready = ready.filter((u) => !fast.includes(u));
    }
  }
  if (ready.length < team.plan.size) return;
  const target = aiWaveTarget(team, ready[0]);
  if (!target) return;
  const focus = target.type !== 'cy', pick = (l) => l[Math.floor(r() * l.length)];
  const strike = team.plan.big && A.strike.length ? A.strike : null;
  if (ready.length >= 6 && r() < A.pincer) {
    // Pincer: two halves, each by a different crossing, meeting at the target.
    const c = centreOf(ready), via1 = aiPickCrossing(team, c, target), via2 = aiPickCrossing(team, c, target, via1);
    ready.sort((a, b) => b.def.hp - a.def.hp);
    const halves = [ready.filter((u, i) => i % 2 === 0), ready.filter((u, i) => i % 2 === 1)];
    aiSend(team, halves[0], target, { form: pick(A.forms), via: via1, focus, strike });
    aiSend(team, halves[1], target, { form: pick(A.forms), via: via2, focus });
  } else aiSend(team, ready, target, { form: pick(A.forms), focus, strike });
  team.waves = (team.waves || 0) + 1;
  team.plan = aiPlanWave(team);
}
function centreOf(units) {
  let x = 0, y = 0;
  for (const u of units) { x += u.x; y += u.y; }
  return { x: x / units.length, y: y / units.length };
}
function aiSend(team, units, target, o) {
  const pace = Math.min(...units.map((u) => u.def.speed));
  for (const u of units) { setHunt(u); u.staged = false; u.groupSpeed = pace; }
  const via = o.via || aiPickCrossing(team, centreOf(units), target);
  const g = makeGroup(team, units, target, pace, { form: o.form, via, spread: 0.9 + Math.random() * 0.35, strike: o.strike });
  if (o.focus) { g.raid = true; for (const u of units) u.focus = target; }
  return g;
}
// What a wave goes for. Easy: the Construction Yard, and one wave in three an outlying site.
// Normal: a mix of the Construction Yard, refineries, power and outlying sites. Hard: whatever
// valuable building is least defended.
function aiWaveTarget(team, from) {
  const A = G.diff.ai, r = Math.random, foe = enemyOf(team), theirs = buildingsOf(foe.id);
  if (!theirs.length) return null;
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
  const value = { cy: 2.4, refinery: 3, power: 2.6, apower: 2.8, factory: 2.2, outpost: 2.4, airfield: 2, helipad: 1.6, barracks: 1.6 };
  const guns = theirs.filter((b) => b.def.defense);
  let best = null, bs = -Infinity;
  for (const b of theirs) {
    if (b.def.defense) continue;
    const sc = (value[b.type] || 1) - guns.filter((d) => dist(d, b) < CELL * 8).length * 0.6 + r() * 2 - (b === team.lastTarget || b.type === team.lastType ? 1.4 : 0);
    if (sc > bs) { bs = sc; best = b; }
  }
  best = best || cy || theirs[0];
  team.lastTarget = best; team.lastType = best.type;
  return best;
}
// A raid goes for an outlying site or the most exposed Ore Truck.
function aiRaidTarget(team) {
  const foe = enemyOf(team), cy = buildingsOf(foe.id).find((b) => b.type === 'cy');
  const trucks = unitsOf(foe.id).filter((u) => u.def.harvester);
  const exp = expansionsOf(foe, rallyPoint(team));
  if (exp.length && (Math.random() < 0.4 || !trucks.length)) return exp[0];
  if (!trucks.length) return null;
  return cy ? trucks.reduce((a, b) => (dist(b, cy) > dist(a, cy) ? b : a)) : trucks[0];
}
// The ways across the lakes: the centre gap, the two bridges and round both lake ends.
function aiCrossings() {
  if (G.crossings) return G.crossings;
  const pts = [{ x: (MID + 0.5) * CELL, y: (MID + 0.5) * CELL }];
  for (const b of G.bridges) pts.push({ x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 });
  for (const sg of [-1, 1]) pts.push({ x: (LX(MID + sg * 39 * K, 0) + 0.5) * CELL, y: (LY(MID + sg * 39 * K, 0) + 0.5) * CELL });
  G.crossings = pts.map((q) => { const c = nearestFreeCell(cellOfPos(q.x, q.y), 8); return c >= 0 ? cellCenter(c) : q; });
  return G.crossings;
}
// Which crossing a wave takes. Easy mostly takes the shortest; Normal favours shorter ones;
// Hard prefers the one with the fewest enemy guns along it.
function aiPickCrossing(team, from, target, not) {
  const A = G.diff.ai, cs = aiCrossings().filter((c) => c !== not), r = Math.random;
  const L = cs.map((c) => Math.hypot(c.x - from.x, c.y - from.y) + Math.hypot(target.x - c.x, target.y - c.y)), min = Math.min(...L);
  let w;
  if (A.route === 'short') {
    if (r() < 0.75) return cs[L.indexOf(min)];
    w = cs.map((c, i) => ((aiCrossings().indexOf(c) === 1 || aiCrossings().indexOf(c) === 2) && L[i] > min ? 1 : 0));   // the other bridge
  } else if (A.route === 'weighted') w = L.map((l) => Math.exp(-(l - min) / (CELL * 14)));
  else {
    const guns = buildingsOf(enemyOf(team).id).filter((b) => b.def.defense && !b.def.antiAir);
    const near = (a, b, p) => { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1, k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)); return Math.hypot(a.x + dx * k - p.x, a.y + dy * k - p.y) < CELL * 7; };
    w = cs.map((c, i) => Math.exp(-(L[i] - min) / (CELL * 20)) * Math.pow(0.35, guns.filter((d) => near(from, c, d) || near(c, target, d)).length));
  }
  let sum = w.reduce((a, b) => a + b, 0), x = r() * sum;
  if (!(sum > 0)) return cs[L.indexOf(min)];
  for (let i = 0; i < cs.length; i++) if ((x -= w[i]) <= 0) return cs[i];
  return cs[cs.length - 1];
}
