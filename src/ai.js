'use strict';
// Computer opponent. It plays by the same rules as the player: same tech tree, same costs,
// and its combat units also attack-move to the enemy base as soon as they roll out.

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
  const wants = [
    ['refinery', 1], ['barracks', 1], [antiInf, 1], ['factory', 1], [defense, 1], ['refinery', 2], ['helipad', 1], [antiInf, 2],
    [defense, 2], [aa, 1], ['airfield', 1], ['factory', 2], [defense, 3], [aa, 2], ['refinery', 3], [defense, 4],
  ];
  for (const [type, count] of wants) {
    if (n(type) >= count || !available(team, type)) continue;
    // Build power first if this structure would push us into low power.
    if (p.prod - p.use < powerNeed(type) + 10 && available(team, pwr)) return pwr;
    return type;
  }
  if (p.prod - p.use < 40) return pwr;
  return null;
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
  const anchor = lonely || cy || buildingsOf(team.id)[0];
  if (!anchor) return null;
  const d = BUILD_DEFS[type], foe = enemyOf(team).start;
  const toFoe = Math.atan2(foe.cy - anchor.cy, foe.cx - anchor.cx);
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
    const a = d.defense ? toFoe + (Math.random() - 0.5) * 1.6 : type === 'refinery' && i < 100 ? toOre + (Math.random() - 0.5) * 1.2 : Math.random() * Math.PI * 2;
    const rad = d.defense ? 5 + Math.random() * 4 + i * 0.02 : 3 + i * 0.06 + Math.random() * 3;
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
  const iq = team.queues.infantry;
  if (c.barracks && iq.length < 2 && money > 150) {
    const r = Math.random();
    startProduction(team, r < 0.45 ? 'rifle' : team.faction === 'soviets' && r < 0.72 ? 'grenadier' : 'rocket');
  }
  if (c.factory && vq.length < 2 && money > 500) {
    const opts = team.faction === 'allies' ? ['ltank', 'mtank', 'mtank', 'ranger'] : ['htank', 'htank', 'htank', 'mammoth'];
    startProduction(team, opts[Math.floor(Math.random() * opts.length)]);
  }
  const aq = team.queues.aircraft;
  const air = G.entities.filter((e) => e.alive && e.team === team.id && e.cls === 'air').length;
  if (aq.length < 1 && money > 900 && air < 6) {
    const heli = team.faction === 'allies' ? 'heli' : 'hind', jet = team.faction === 'allies' ? 'jet' : 'mig';
    if (c.helipad && (Math.random() < 0.5 || !c.airfield)) startProduction(team, heli);
    else if (c.airfield) startProduction(team, jet);
  }

  // Airfield support powers: bomb the thickest part of the enemy base, drop troops on its economy.
  if (powerReady(team, 'bomb')) { const t = aiPowerTarget(team, true); if (t) launchPower(team, 'bomb', t.x, t.y); }
  if (powerReady(team, 'para')) { const t = aiPowerTarget(team, false); if (t) launchPower(team, 'para', t.x, t.y); }

  // Patch up damaged buildings when there is cash to spare.
  if (team.credits > 800) for (const b of buildingsOf(team.id)) if (b.hp < b.maxHp * 0.6) b.repairing = true;
  // Pour surplus cash into extra tanks.
  if (team.credits > 4000 && c.factory && vq.length < 3) startProduction(team, team.faction === 'allies' ? 'mtank' : 'htank');
}
