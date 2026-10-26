'use strict';
// Simulation: map, pathfinding, units, structures, combat, harvesting and production.

let G = null;
const PLAYER = 0, ENEMY = 1;
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

const idx = (cx, cy) => cy * MAP + cx;
const cellX = (c) => c % MAP, cellY = (c) => (c / MAP) | 0;
const cellOfPos = (x, y) => idx(Math.max(0, Math.min(MAP - 1, Math.floor(x / CELL))), Math.max(0, Math.min(MAP - 1, Math.floor(y / CELL))));
const cellCenter = (c) => ({ x: cellX(c) * CELL + CELL / 2, y: cellY(c) * CELL + CELL / 2 });
const inMap = (cx, cy) => cx >= 0 && cy >= 0 && cx < MAP && cy < MAP;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
function turnToward(cur, target, step) { const d = angDiff(target, cur); return Math.abs(d) <= step ? target : cur + Math.sign(d) * step; }

let hooks = { eva() {}, gameOver() {}, sfx() {} };

// ---------------------------------------------------------------------------
// New game
// ---------------------------------------------------------------------------
function newWorld(playerFaction, diffKey, seed) {
  seed = seed || (Math.random() * 1e9) | 0;
  const enemyFaction = playerFaction === 'allies' ? 'soviets' : 'allies';
  G = {
    t: 0, seed, diff: DIFFICULTY[diffKey], diffKey, nextId: 1,
    entities: [], byId: new Map(), effects: [], projectiles: [], pathQueue: [],
    terr: new Uint8Array(NCELLS), block: new Uint8Array(NCELLS), bld: new Int32Array(NCELLS), resv: new Uint8Array(NCELLS),
    ore: new Uint16Array(NCELLS), seen: new Uint8Array(NCELLS), shroudDirty: true, oreFields: [],
    selection: [], place: null, over: null, paused: false,
    timers: { power: 0, shroud: 0, ore: 0, ai: 0, win: 0 },
    teams: [makeTeam(PLAYER, playerFaction, false), makeTeam(ENEMY, enemyFaction, true)],
  };
  G.teams[ENEMY].credits = G.diff.credits;
  genMap(seed);
  G.terrainCanvas = paintTerrain(G.terr, seed, G.road);
  G.tctx = G.terrainCanvas.getContext('2d');

  for (const team of G.teams) {
    const b = addBuilding('cy', team, team.start.cx - 1, team.start.cy - 1);
    b.buildT = 1;
    const dir = team.id === PLAYER ? 1 : -1;
    for (let i = 0; i < 3; i++) {
      const u = addUnit('rifle', team, b.x + dir * (52 + i * 10), b.y - dir * (30 - i * 16));
      setGuard(u);
    }
  }
  updatePower();
  revealAround();
  return G;
}

function makeTeam(id, faction, isAI) {
  const start = id === PLAYER ? { cx: 13, cy: 74 } : { cx: MAP - 1 - 13, cy: MAP - 1 - 74 };
  return {
    id, faction, isAI, pal: FACTIONS[faction].pal, credits: 5000, shown: 5000, start,
    power: { prod: 0, use: 0 }, low: false, auto: true,
    queues: { structure: null, infantry: [], vehicle: [], aircraft: [] },
    stats: { built: 0, lost: 0, killed: 0, harvested: 0 },
    cool: {}, powers: { spy: 0, para: 0, bomb: 0 },
  };
}

// ---------------------------------------------------------------------------
// Map generation (point-symmetric so both bases are equal)
// ---------------------------------------------------------------------------
function genMap(seed) {
  const r = rng(seed ^ 0x5bd1e995);
  const T = G.terr;
  const P = G.teams[PLAYER].start, E = G.teams[ENEMY].start;
  const set = (cx, cy, v) => {
    if (!inMap(cx, cy)) return;
    T[idx(cx, cy)] = v; T[idx(MAP - 1 - cx, MAP - 1 - cy)] = v;
  };
  const fieldsHalf = [
    { cx: 23, cy: 77, r: 3.2, rich: 0.8 }, { cx: 10, cy: 62, r: 3, rich: 0.8 },
    { cx: 30, cy: 56, r: 3.6, rich: 1 }, { cx: 20, cy: 42, r: 3, rich: 0.9 },
    { cx: 46, cy: 70, r: 3, rich: 0.9 },
  ];
  const center = { cx: 43.5, cy: 43.5, r: 4.5, rich: 1.2 };
  const fields = [center];
  for (const f of fieldsHalf) { fields.push(f, { cx: MAP - 1 - f.cx, cy: MAP - 1 - f.cy, r: f.r, rich: f.rich }); }
  G.oreFields = fields;
  let protectedCell = (cx, cy) => {
    for (const s of [P, E]) if (Math.hypot(cx - s.cx, cy - s.cy) < 11) return true;
    for (const f of fields) if (Math.hypot(cx - f.cx, cy - f.cy) < f.r + 1.5) return true;
    return false;
  };
  const blob = (cx, cy, rad, v, density) => {
    for (let y = Math.floor(cy - rad - 1); y <= cy + rad + 1; y++) {
      for (let x = Math.floor(cx - rad - 1); x <= cx + rad + 1; x++) {
        const d = Math.hypot(x - cx, (y - cy) * 1.15) + (r() - 0.5) * 1.6;
        if (d < rad && r() < density && !protectedCell(x, y)) set(x, y, v);
      }
    }
  };
  // A dirt road winds from base to base through the middle of the map.
  const half = [[P.cx + 3, P.cy - 5], [P.cx + 9 + r() * 3, P.cy - 12 - r() * 3], [27 + r() * 3, 52 + r() * 3], [36 + r() * 2, 47 + r() * 2], [MAP / 2 - 0.5, MAP / 2 - 0.5]];
  const pts = half.concat(half.slice(0, -1).reverse().map(([x, y]) => [MAP - 1 - x, MAP - 1 - y]));
  const roadCells = new Set();
  G.road = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.ceil(Math.hypot(bx - ax, by - ay) * 4);
    for (let k = 0; k < n; k++) {
      const t = k / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      G.road.push({ x: (x + 0.5) * CELL, y: (y + 0.5) * CELL });
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (Math.hypot(ox, oy) <= 1.2) roadCells.add(idx(Math.round(x + ox), Math.round(y + oy)));
    }
  }
  for (const c of roadCells) if (c >= 0 && c < NCELLS) T[c] = 1;
  const baseProtected = protectedCell;
  const onRoad = (cx, cy) => { for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (roadCells.has(idx(cx + ox, cy + oy))) return true; return false; };
  protectedCell = (cx, cy) => baseProtected(cx, cy) || onRoad(cx, cy) || onRoad(MAP - 1 - cx, MAP - 1 - cy);

  // Generate across the half below the anti-diagonal; set() mirrors it.
  const halfPt = () => { let x, y; do { x = 2 + r() * (MAP - 4); y = 2 + r() * (MAP - 4); } while (x + y < MAP - 6); return [x, y]; };
  for (let i = 0; i < 9; i++) { const [x, y] = halfPt(); blob(x, y, 2 + r() * 4, 1, 0.95); }
  for (let i = 0; i < 2; i++) { const [x, y] = halfPt(); blob(x, y, 2.5 + r() * 2.5, 4, 1); }
  for (let i = 0; i < 9; i++) { const [x, y] = halfPt(); blob(x, y, 1.5 + r() * 2.8, 2, 0.75); }
  for (let i = 0; i < 6; i++) {
    let [x, y] = halfPt(); x = Math.floor(x); y = Math.floor(y);
    const len = 3 + Math.floor(r() * 6), dx = r() < 0.5 ? 1 : 0, dy = 1 - dx;
    for (let k = 0; k < len; k++) { if (!protectedCell(x, y)) set(x, y, 3); x += dx + (r() < 0.25 ? 1 : 0); y += dy + (r() < 0.25 ? 1 : 0); }
  }
  // Thin forest along the map edge.
  for (let i = 0; i < MAP; i++) {
    for (const [x, y] of [[i, 0], [0, i], [i, MAP - 1], [MAP - 1, i]]) if (r() < 0.75 && !protectedCell(x, y)) set(x, y, 2);
    for (const [x, y] of [[i, 1], [1, i]]) if (r() < 0.3 && !protectedCell(x, y)) set(x, y, 2);
  }
  for (let i = 0; i < NCELLS; i++) G.block[i] = T[i] >= 2 ? 1 : 0;

  // Make sure the bases connect; carve a road if a lake or forest walls them off.
  if (!connected(idx(P.cx, P.cy), idx(E.cx, E.cy))) {
    for (let k = 0; k <= 100; k++) {
      const x = Math.round(P.cx + (E.cx - P.cx) * k / 100), y = Math.round(P.cy + (E.cy - P.cy) * k / 100);
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1]]) if (inMap(x + ox, y + oy)) { T[idx(x + ox, y + oy)] = 1; G.block[idx(x + ox, y + oy)] = 0; }
    }
  }
  for (const f of fields) {
    for (let y = Math.floor(f.cy - f.r); y <= f.cy + f.r; y++) {
      for (let x = Math.floor(f.cx - f.r); x <= f.cx + f.r; x++) {
        if (!inMap(x, y)) continue;
        const d = Math.hypot(x - f.cx, y - f.cy);
        if (d > f.r) continue;
        const c = idx(x, y);
        if (G.block[c]) { G.block[c] = 0; T[c] = 0; }
        G.ore[c] = Math.round(Math.min(ORE_MAX, (60 + (1 - d / f.r) * 190) * f.rich));
      }
    }
  }
}

function connected(a, b) {
  const seen = new Uint8Array(NCELLS), q = [a];
  seen[a] = 1;
  while (q.length) {
    const c = q.pop();
    if (c === b) return true;
    const cx = cellX(c), cy = cellY(c);
    for (let i = 0; i < 4; i++) {
      const nx = cx + DIRS8[i][0], ny = cy + DIRS8[i][1];
      if (!inMap(nx, ny)) continue;
      const n = idx(nx, ny);
      if (!seen[n] && !G.block[n]) { seen[n] = 1; q.push(n); }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Pathfinding (A* over cells, 8-way, no corner cutting)
// ---------------------------------------------------------------------------
const PF = { g: new Float32Array(NCELLS), from: new Int32Array(NCELLS), open: new Uint32Array(NCELLS), closed: new Uint32Array(NCELLS), stamp: 0 };
const freeCell = (c) => !G.block[c] && !G.bld[c];
function passableAt(x, y) {
  if (x < 2 || y < 2 || x > WORLD - 2 || y > WORLD - 2) return false;
  return freeCell(cellOfPos(x, y));
}

function nearestFreeCell(c, maxR) {
  if (freeCell(c)) return c;
  const cx = cellX(c), cy = cellY(c);
  for (let rad = 1; rad <= (maxR || 10); rad++) {
    let best = -1, bd = Infinity;
    for (let y = cy - rad; y <= cy + rad; y++) {
      for (let x = cx - rad; x <= cx + rad; x++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== rad || !inMap(x, y)) continue;
        const n = idx(x, y);
        if (!freeCell(n)) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d < bd) { bd = d; best = n; }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

function findPath(sx, sy, tx, ty, rad) {
  let s = cellOfPos(sx, sy), t = cellOfPos(tx, ty);
  const exactEnd = freeCell(t);
  if (!exactEnd) t = nearestFreeCell(t, 12);
  if (!freeCell(s)) s = nearestFreeCell(s, 3);
  if (s < 0 || t < 0) return null;
  if (s === t) return [{ x: tx, y: ty }];
  const stamp = ++PF.stamp;
  const heapK = [], heapV = [];
  const push = (k, v) => {
    let i = heapK.length; heapK.push(k); heapV.push(v);
    while (i > 0) { const p = (i - 1) >> 1; if (heapK[p] <= k) break; heapK[i] = heapK[p]; heapV[i] = heapV[p]; i = p; }
    heapK[i] = k; heapV[i] = v;
  };
  const pop = () => {
    const v = heapV[0], lk = heapK.pop(), lv = heapV.pop(), n = heapK.length;
    if (n) {
      let i = 0;
      while (true) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && heapK[c + 1] < heapK[c]) c++;
        if (heapK[c] >= lk) break;
        heapK[i] = heapK[c]; heapV[i] = heapV[c]; i = c;
      }
      heapK[i] = lk; heapV[i] = lv;
    }
    return v;
  };
  const tx0 = cellX(t), ty0 = cellY(t);
  const h = (c) => { const dx = Math.abs(cellX(c) - tx0), dy = Math.abs(cellY(c) - ty0); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  PF.g[s] = 0; PF.from[s] = -1; PF.open[s] = stamp;
  push(h(s), s);
  let best = s, bestH = h(s), expanded = 0, found = false;
  while (heapK.length) {
    const c = pop();
    if (PF.closed[c] === stamp) continue;
    PF.closed[c] = stamp;
    if (c === t) { found = true; break; }
    if (++expanded > 5000) break;
    const hc = h(c);
    if (hc < bestH) { bestH = hc; best = c; }
    const cx = cellX(c), cy = cellY(c);
    for (let i = 0; i < 8; i++) {
      const dx = DIRS8[i][0], dy = DIRS8[i][1], nx = cx + dx, ny = cy + dy;
      if (!inMap(nx, ny)) continue;
      const n = idx(nx, ny);
      if (!freeCell(n) || PF.closed[n] === stamp) continue;
      if (dx && dy && (!freeCell(idx(cx + dx, cy)) || !freeCell(idx(cx, cy + dy)))) continue;
      const ng = PF.g[c] + (dx && dy ? 1.414 : 1);
      if (PF.open[n] !== stamp || ng < PF.g[n]) { PF.g[n] = ng; PF.from[n] = c; PF.open[n] = stamp; push(ng + h(n), n); }
    }
  }
  const end = found ? t : best;
  const cells = [];
  for (let c = end; c >= 0; c = PF.from[c]) { cells.push(c); if (c === s) break; }
  cells.reverse();
  const pts = cells.slice(1).map(cellCenter);
  if (found && exactEnd) { if (pts.length) pts[pts.length - 1] = { x: tx, y: ty }; else pts.push({ x: tx, y: ty }); }
  return smoothPath(sx, sy, pts, rad);
}

function los(ax, ay, bx, by, rad) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 6);
  const px = d ? -(by - ay) / d * rad : 0, py = d ? (bx - ax) / d * rad : 0;
  for (let i = 1; i <= n; i++) {
    const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
    if (!passableAt(x, y) || !passableAt(x + px, y + py) || !passableAt(x - px, y - py)) return false;
  }
  return true;
}
function smoothPath(sx, sy, pts, rad) {
  if (pts.length < 2) return pts;
  const out = [];
  let cx = sx, cy = sy, i = 0;
  while (i < pts.length) {
    let j = Math.min(pts.length - 1, i + 10);
    while (j > i && !los(cx, cy, pts[j].x, pts[j].y, rad * 0.8)) j--;
    out.push(pts[j]); cx = pts[j].x; cy = pts[j].y; i = j + 1;
  }
  return out;
}

function goTo(u, x, y) {
  u.dest = { x, y };
  u.path = null; u.pathIdx = 0; u.stuckN = 0;
  if (!u.needPath) { u.needPath = true; G.pathQueue.push(u); }
}
function processPaths() {
  let budget = 8;
  while (budget-- > 0 && G.pathQueue.length) {
    const u = G.pathQueue.shift();
    if (!u.alive || !u.needPath || !u.dest) { u.needPath = false; continue; }
    u.needPath = false;
    u.path = findPath(u.x, u.y, u.dest.x, u.dest.y, u.def.r);
    u.pathIdx = 0;
    if (!u.path || !u.path.length) u.dest = null;
  }
}

function tryMove(u, dx, dy) {
  const nx = u.x + dx, ny = u.y + dy;
  if (passableAt(nx, ny)) { u.x = nx; u.y = ny; return true; }
  if (dx && passableAt(nx, u.y)) { u.x = nx; return true; }
  if (dy && passableAt(u.x, ny)) { u.y = ny; return true; }
  return false;
}

// Follows the current path. Returns true once there is nowhere left to go.
function followPath(u, dt) {
  if (!u.dest) return true;
  if (u.needPath || !u.path) return false;
  if (u.pathIdx >= u.path.length) { u.dest = null; return true; }
  const p = u.path[u.pathIdx], last = u.pathIdx === u.path.length - 1;
  const dx = p.x - u.x, dy = p.y - u.y, d = Math.hypot(dx, dy);
  if (d < (last ? 3 : 7)) {
    u.pathIdx++;
    if (u.pathIdx >= u.path.length) { u.dest = null; return true; }
    return false;
  }
  const want = Math.atan2(dy, dx);
  let speed = u.def.speed, mx, my;
  if (u.groupSpeed && u.order.type === 'hunt' && !u.target) speed = Math.min(speed, u.groupSpeed);
  if (u.cls === 'veh') {
    const diff = angDiff(want, u.face);
    u.face = turnToward(u.face, want, u.def.turn * dt);
    if (Math.abs(diff) > 0.8) speed = 0; else speed *= Math.max(0.3, Math.cos(diff));
    mx = Math.cos(u.face); my = Math.sin(u.face);
  } else { u.face = want; mx = dx / d; my = dy / d; }
  const step = Math.min(speed * dt, d);
  if (step > 0 && tryMove(u, mx * step, my * step)) { u.anim += step; u.moving = true; }
  return false;
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------
function addUnit(type, team, x, y) {
  const d = UNIT_DEFS[type];
  const u = {
    id: G.nextId++, kind: 'unit', type, def: d, cls: d.cls, team: team.id, faction: team.faction,
    x, y, hp: d.hp, maxHp: d.hp, alive: true, face: team.id === PLAYER ? -0.8 : 2.35, tface: 0,
    order: { type: 'guard', x, y }, target: null, dest: null, path: null, pathIdx: 0, needPath: false,
    cd: Math.random() * 0.5, cd2: 0, fireT: 0, anim: 0, think: Math.random() * 0.4, hitT: -99, moving: false,
    stuckN: 0, lastX: x, lastY: y, stuckT: 0,
  };
  u.tface = u.face;
  if (d.harvester) { u.load = 0; u.hs = 'seek'; u.hcell = -1; u.htimer = 0; }
  if (d.cls === 'air') { u.ammo = d.weapon ? d.weapon.ammo : 0; u.alt = 0; u.as = 'takeoff'; u.rt = 0; u.passT = 0; u.speedCur = 0; }
  G.entities.push(u); G.byId.set(u.id, u);
  return u;
}

function addBuilding(type, team, cx, cy) {
  const d = BUILD_DEFS[type];
  const b = {
    id: G.nextId++, kind: 'bld', type, def: d, team: team.id, faction: team.faction,
    cx, cy, w: d.w, h: d.h, x: (cx + d.w / 2) * CELL, y: (cy + d.h / 2) * CELL,
    hp: d.hp, maxHp: d.hp, alive: true, buildT: 0, sellT: 0, repairing: false, cd: 0, tface: team.id === PLAYER ? -0.8 : 2.35,
    fireT: 0, smokeT: Math.random(), charge: 0, think: 0, hitT: -99,
  };
  for (let y = cy; y < cy + d.h; y++) for (let x = cx; x < cx + d.w; x++) G.bld[idx(x, y)] = b.id;
  if (d.exit) { b.exitCell = idx(cx + Math.floor(d.w / 2), cy + d.h); G.resv[b.exitCell] = 1; }
  if (G.tctx) bibDecal(G.tctx, cx * CELL, cy * CELL, d.w * CELL, d.h * CELL, b.id * 977);
  G.entities.push(b); G.byId.set(b.id, b);
  team.stats.built++;
  return b;
}

const teamOf = (e) => G.teams[e.team];
const enemyOf = (team) => G.teams[1 - team.id];
const buildingsOf = (tid) => G.entities.filter((e) => e.alive && e.kind === 'bld' && e.team === tid);
const unitsOf = (tid) => G.entities.filter((e) => e.alive && e.kind === 'unit' && e.team === tid);
const isAirborne = (e) => e.cls === 'air' && e.as !== 'landed';

function distTo(a, e) {
  if (e.kind === 'bld') {
    const x0 = e.cx * CELL, y0 = e.cy * CELL;
    const dx = Math.max(x0 - a.x, 0, a.x - (x0 + e.w * CELL)), dy = Math.max(y0 - a.y, 0, a.y - (y0 + e.h * CELL));
    return Math.hypot(dx, dy);
  }
  return Math.max(0, Math.hypot(a.x - e.x, a.y - e.y) - (e.def.r || 0) * 0.5);
}

function canHit(w, t) {
  if (!w) return false;
  if (t.kind === 'unit' && isAirborne(t)) return !!w.air;
  return w.ground !== false;
}
function canTarget(u, t) { return canHit(u.def.weapon, t) || canHit(u.def.weapon2, t); }

function acquire(src, range, weapons) {
  let best = null, bs = Infinity;
  for (const e of G.entities) {
    if (!e.alive || e.team === src.team || e.sellT > 0) continue;
    if (!weapons.some((w) => canHit(w, e))) continue;
    const d = distTo(src, e);
    if (d > range) continue;
    let score = d;
    if (e.kind === 'bld') score += 60;
    else if (!e.def.weapon && !e.def.harvester) score += 20;
    if (score < bs) { bs = score; best = e; }
  }
  return best;
}

// Where attacking units head: the enemy Construction Yard, or failing that the nearest structure.
function nearestEnemyBuilding(u) {
  let best = null, bd = Infinity, cy = null, cd = Infinity;
  for (const e of G.entities) {
    if (!e.alive || e.kind !== 'bld' || e.team === u.team) continue;
    const d = dist(u, e);
    if (d < bd) { bd = d; best = e; }
    if (e.type === 'cy' && d < cd) { cd = d; cy = e; }
  }
  return cy || best;
}

// Auto attack holds new units at a rally point in front of the base and sends them
// out together once a group of this size has gathered.
const GROUP_SIZE = 5;
function rallyPoint(team) {
  const e = enemyOf(team).start, s = team.start;
  const a = Math.atan2(e.cy - s.cy, e.cx - s.cx);
  return { x: (s.cx + 0.5 + Math.cos(a) * 7) * CELL, y: (s.cy + 0.5 + Math.sin(a) * 7) * CELL };
}
function launchGroups() {
  for (const team of G.teams) {
    defendBase(team);
    const rally = rallyPoint(team);
    const waiting = G.entities.filter((u) => u.alive && u.kind === 'unit' && u.team === team.id && u.staged && !u.def.harvester && u.order.type === 'guard');
    // Aircraft do not wait for a group: each one heads out on its own.
    if (team.auto) for (const u of waiting) if (u.cls === 'air') launchAircraft(u);
    const ready = waiting.filter((u) => u.cls !== 'air' && Math.hypot(u.x - rally.x, u.y - rally.y) < CELL * 6);
    team.waiting = ready.length;
    if (!team.auto || ready.length < GROUP_SIZE) continue;
    // March at the pace of the slowest unit so the group arrives together.
    const pace = Math.min(...ready.map((u) => u.def.speed));
    for (const u of ready) {
      setHunt(u);
      u.staged = false;
      u.groupSpeed = pace;
    }
    team.waiting = 0;
    if (team.id === PLAYER) hooks.eva('Attack group moving out');
  }
}

function launchAircraft(u) {
  setHunt(u);
  u.staged = false;
  if (u.as === 'landed' && u.ammo > 0) u.as = 'takeoff';
}

// Enemies near or inside a base (paratroopers, flanking squads) are met by every idle unit
// waiting around that base, on either side and with auto attack on or off. The computer also
// recalls attack groups still on their way out. Units the player has sent somewhere are left
// alone. Once the base is clear, defenders go back to where they were waiting.
function defendBase(team) {
  const mine = buildingsOf(team.id);
  const nearBase = (u, r) => mine.some((b) => Math.hypot(b.x - u.x, b.y - u.y) < CELL * r);
  const threats = unitsOf(enemyOf(team).id).filter((u) => !isAirborne(u) && !u.def.harvester && !u.def.scripted && !u.chute && nearBase(u, 10));
  const idle = (u) => u.order.type === 'guard' && nearBase(u, 16);
  const army = unitsOf(team.id).filter((u) => u.def.weapon && !u.def.harvester && !u.def.scripted && !u.chute &&
    (u.cls !== 'air' || (u.ammo > 0 && u.order.type === 'guard')) &&
    (u.defending || idle(u) || (team.isAI && u.cls !== 'air')));
  if (!threats.length) {
    for (const u of army) {
      if (!u.defending) continue;
      u.defending = false;
      const h = u.post;
      setGuard(u, h.x, h.y); u.staged = h.staged; u.order.pad = h.pad;
      if (u.cls !== 'air') goTo(u, h.x, h.y);
    }
    return;
  }
  let x = 0, y = 0;
  for (const t of threats) { x += t.x; y += t.y; }
  x /= threats.length; y /= threats.length;
  for (const u of army) {
    if (Math.hypot(u.x - x, u.y - y) > CELL * 32) continue;
    if (u.defending && Math.hypot(u.order.x - x, u.order.y - y) < CELL * 3) continue;
    if (!u.defending) {
      // Remember where to return: the guard spot, or for attack groups already out, the rally point.
      const r = rallyPoint(team), g = u.order.type === 'guard';
      u.post = { x: g ? u.order.x : r.x, y: g ? u.order.y : r.y, staged: u.staged || (team.isAI && !g), pad: g && u.order.pad };
    }
    u.defending = true; u.staged = false;
    setGuard(u, x, y);
    if (u.cls !== 'air') goTo(u, x, y);
  }
}

function setGuard(u, x, y) {
  u.order = { type: 'guard', x: x === undefined ? u.x : x, y: y === undefined ? u.y : y };
  u.target = null; u.groupSpeed = 0;
}
function setHunt(u) { u.order = { type: 'hunt' }; u.target = null; u.huntTarget = null; }

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------
const PROJ_SPEED = { shell: 430, rocket: 250, missile: 330, flak: 560, fireball: 230 };

function muzzle(src) {
  if (src.kind === 'bld') {
    if (src.type === 'tesla') return { x: src.cx * CELL + 12, y: src.cy * CELL + 35 - 50 * VK };
    if (src.type === 'pillbox') return { x: src.x + Math.cos(src.tface) * 9, y: src.y - 5 + Math.sin(src.tface) * 7 };
    if (src.type === 'ftur') return { x: src.cx * CELL + 12, y: src.cy * CELL + 13 - 25 * VK };
    const h = HEADS[src.type];
    const hx = src.cx * CELL + h[1], hy = src.cy * CELL + h[2] - (h[3] + 2) * VK;
    return { x: hx + Math.cos(src.tface) * 13, y: hy + Math.sin(src.tface) * 13 };
  }
  if (src.cls === 'air') return { x: src.x + Math.cos(src.face) * 9, y: src.y - (src.alt || 0) + Math.sin(src.face) * 9 };
  if (src.cls === 'inf') return { x: src.x + Math.cos(src.face) * 10, y: src.y + Math.sin(src.face) * 10 - 11 };
  const s = src.def.size, len = s.tur ? s.tur + s.barrel : 8, z = (TURRET_Z[src.def.draw] + 1.5) * VK;
  return { x: src.x + Math.cos(src.tface) * len, y: src.y + Math.sin(src.tface) * len - z };
}
// Where shots should land on a target (its body, not its feet).
function aimY(t) {
  if (t.kind === 'bld') return t.y - 6;
  return t.y - (t.alt || 0) - (t.cls === 'inf' ? 8 : 4);
}

function weaponSound(src, w) {
  if (w.proj === 'bullet') return src.cls === 'inf' ? 'rifle' : 'mg';
  if (w.proj === 'grenade') return 'throw';
  if (w.proj === 'fireball') return 'flame';
  if (w.proj === 'shell') return src.kind === 'bld' ? 'turretGun' : w.twin ? 'cannonHeavy' : 'cannon';
  return w.proj;
}

// Fires a weapon. Burst weapons queue their follow-up rounds, fired by tickBurst().
function shoot(src, w, t) {
  fireWeapon(src, w, t);
  if (w.burst > 1) src.burst = { left: w.burst - 1, t: w.gap, w, target: t };
}
function tickBurst(u, dt) {
  const b = u.burst;
  if (!b) return;
  if (!b.target.alive || distTo(u, b.target) > b.w.range + 12) { u.burst = null; return; }
  if ((b.t -= dt) > 0) return;
  fireWeapon(u, b.w, b.target);
  b.t = b.w.gap;
  if (--b.left <= 0) u.burst = null;
}

function fireWeapon(src, w, t) {
  const m = muzzle(src);
  hooks.sfx(weaponSound(src, w), src.x, src.y);
  src.fireT = w.proj === 'grenade' ? 0.35 : 0.1;
  const ty = aimY(t);
  if (w.proj === 'grenade') {
    // Lobbed in an arc at where the target stands now; it can miss a moving target.
    const tx = t.x + (Math.random() - 0.5) * 10, tgy = t.y + (Math.random() - 0.5) * 8;
    const d = Math.hypot(tx - src.x, tgy - src.y);
    G.projectiles.push({ kind: 'grenade', x: m.x, y: m.y, sx: m.x, sy: src.y, tx, ty: tgy, t: 0, dur: Math.max(0.35, d / 170), h: 14 + d * 0.18, z: src.y - m.y, w, from: src, team: src.team });
  } else if (w.proj === 'bullet') {
    const jx = (Math.random() - 0.5) * 6, jy = (Math.random() - 0.5) * 6;
    damage(t, w.dmg, w.wh, src);
    G.effects.push({ type: 'tracer', x: m.x, y: m.y, x2: t.x + jx, y2: ty + jy, t: 0, life: 0.07 });
    G.effects.push({ type: 'spark', x: t.x + jx, y: ty + jy, t: 0, life: 0.12 });
  } else if (w.proj === 'tesla') {
    src.charge = 1;
    damage(t, w.dmg, w.wh, src);
    G.effects.push({ type: 'tesla', x: m.x, y: m.y, x2: t.x, y2: ty, t: 0, life: 0.35, seed: (Math.random() * 1e6) | 0 });
  } else {
    const shots = w.twin ? 2 : 1;
    for (let i = 0; i < shots; i++) {
      const off = shots > 1 ? (i ? 2 : -2) : 0;
      G.projectiles.push({ x: m.x + off * Math.sin(src.tface || 0), y: m.y - off * Math.cos(src.tface || 0), target: t, w, from: src, team: src.team,
        speed: PROJ_SPEED[w.proj] || 400, kind: w.proj, trail: 0, delay: i * 0.1 });
    }
  }
}

function updateProjectiles(dt) {
  for (const p of G.projectiles) {
    if (p.delay > 0) { p.delay -= dt; continue; }
    if (p.kind === 'bomb') {
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.x = p.tx; p.y = p.ty - p.z * (1 - k * k);
      if (k >= 1) { p.dead = true; bombBlast(p); }
      continue;
    }
    if (p.kind === 'grenade') {
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.gx = p.sx + (p.tx - p.sx) * k; p.gy = p.sy + (p.ty - p.sy) * k;
      p.x = p.gx; p.y = p.gy - (p.z * (1 - k) + p.h * 4 * k * (1 - k));
      p.a = (p.a || 0) + dt * 14;
      if (k >= 1) { p.dead = true; grenadeBlast(p); }
      continue;
    }
    const t = p.target;
    const tx = t.x, ty = aimY(t);
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy), step = p.speed * dt;
    p.a = Math.atan2(dy, dx);
    if (p.kind === 'rocket' || p.kind === 'missile') {
      p.trail -= dt;
      if (p.trail <= 0) { p.trail = 0.03; G.effects.push({ type: 'smoke', x: p.x, y: p.y, r: 1.6, t: 0, life: 0.5, alpha: 0.5, color: '#9a968c' }); }
    } else if (p.kind === 'fireball') {
      p.trail -= dt;
      if (p.trail <= 0) { p.trail = 0.035; G.effects.push({ type: 'smoke', x: p.x, y: p.y, r: 2, t: 0, life: 0.45, alpha: 0.45, color: '#3a3733' }); }
    }
    if (d <= step + 3 || !t.alive) {
      p.dead = true;
      if (p.kind === 'fireball') { fireBlast(p, t.alive ? t.x : p.x, t.alive ? t.y : p.y); continue; }
      if (t.alive) damage(t, p.w.dmg, p.w.wh, p.from.alive ? p.from : null);
      impact(p.kind, t.alive ? tx : p.x, t.alive ? ty : p.y, isAirborne(t));
      if (p.w.wh === 'HE' && t.kind === 'unit' && !isAirborne(t)) splash(tx, ty, 14, p.w.dmg * 0.4, p.team, t);
      continue;
    }
    p.x += (dx / d) * step; p.y += (dy / d) * step;
  }
  G.projectiles = G.projectiles.filter((p) => !p.dead);
}

// Flame tower fireball: a burst of fire that splashes and leaves flames burning for a moment.
function fireBlast(p, x, y) {
  const w = p.w, from = p.from.alive ? p.from : null;
  hooks.sfx('fireHit', x, y);
  G.effects.push({ type: 'expl', x, y: y - 3, size: 9, t: 0, life: 0.45, seed: (Math.random() * 1e6) | 0 });
  for (let i = 0; i < 5; i++) G.effects.push({ type: 'fire', x: x + (Math.random() - 0.5) * 18, y: y + (Math.random() - 0.5) * 12, t: -i * 0.05, life: 1.2 + Math.random() * 1.2 });
  scorch(G.tctx, x, y, 8, (Math.random() * 1e6) | 0);
  for (const e of G.entities) {
    if (!e.alive || e.team === p.team || isAirborne(e)) continue;
    const d = distTo({ x, y }, e);
    if (d < w.splash) damage(e, w.dmg * (1 - d / w.splash * 0.5), w.wh, from);
  }
}

function grenadeBlast(p) {
  const { tx: x, ty: y, w } = p;
  hooks.sfx('hitMed', x, y);
  G.effects.push({ type: 'expl', x, y: y - 3, size: 9, t: 0, life: 0.5, seed: (Math.random() * 1e6) | 0, debris: true });
  scorch(G.tctx, x, y, 7, (Math.random() * 1e6) | 0);
  const from = p.from.alive ? p.from : null;
  for (const e of G.entities) {
    if (!e.alive || e.team === p.team || isAirborne(e)) continue;
    const d = distTo({ x, y }, e);
    if (d < w.splash) damage(e, w.dmg * (1 - d / w.splash * 0.6), w.wh, from);
  }
}

function bombBlast(p) {
  const { tx: x, ty: y, w } = p;
  hooks.sfx('explodeVeh', x, y);
  G.effects.push({ type: 'expl', x, y: y - 4, size: 13, t: 0, life: 0.7, seed: (Math.random() * 1e6) | 0, debris: true });
  scorch(G.tctx, x, y, 11, (Math.random() * 1e6) | 0);
  for (const e of G.entities) {
    if (!e.alive || e.team === p.team || isAirborne(e)) continue;
    const d = distTo({ x, y }, e);
    if (d < w.splash) damage(e, w.dmg * (1 - d / w.splash * 0.5), w.wh, null);
  }
}

function splash(x, y, rad, dmg, team, skip) {
  for (const e of G.entities) {
    if (!e.alive || e === skip || e.team === team || e.kind !== 'unit' || isAirborne(e)) continue;
    if (Math.hypot(e.x - x, e.y - y) < rad) damage(e, dmg, 'HE', null);
  }
}

function impact(kind, x, y, inAir) {
  if (kind === 'flak') {
    G.effects.push({ type: 'smoke', x, y, r: 4, t: 0, life: 0.6, alpha: 0.8, color: '#2a2826' });
    G.effects.push({ type: 'spark', x, y, t: 0, life: 0.1 });
  } else {
    hooks.sfx(kind === 'shell' ? 'hitSmall' : 'hitMed', x, y);
    const size = kind === 'shell' ? 6 : 8;
    G.effects.push({ type: 'expl', x, y, size, t: 0, life: 0.45, seed: (Math.random() * 1e6) | 0 });
    if (!inAir && Math.random() < 0.5) scorch(G.tctx, x, y, size * 0.8, (Math.random() * 1e6) | 0);
  }
}

function damage(t, amount, wh, attacker) {
  if (!t.alive) return;
  const armor = t.kind === 'bld' ? 'bld' : isAirborne(t) ? 'air' : t.def.armor === 'air' ? 'light' : t.def.armor;
  const mult = WARHEADS[wh][armor];
  if (!mult) return;
  t.hp -= amount * mult * (0.9 + Math.random() * 0.2);
  t.hitT = G.t;
  const team = teamOf(t);
  if (t.team === PLAYER && attacker) {
    if (t.kind === 'bld') notify(team, 'base', 'Our base is under attack', 15);
    else if (t.def.harvester) notify(team, 'harv', 'Ore Truck under attack', 15);
  }
  if (attacker && attacker.alive && t.kind === 'unit' && t.order.type === 'guard' && !t.target && canTarget(t, attacker)) t.target = attacker;
  if (t.hp <= 0) kill(t, attacker);
}

function notify(team, key, msg, cooldown) {
  if (team.isAI) return;
  if (team.cool[key] && G.t < team.cool[key]) return;
  team.cool[key] = G.t + cooldown;
  hooks.eva(msg);
}

function kill(e, attacker) {
  e.alive = false;
  const team = teamOf(e);
  if (attacker && attacker.team !== e.team) G.teams[attacker.team].stats.killed++;
  const seed = (Math.random() * 1e6) | 0;
  if (e.kind === 'unit') {
    team.stats.lost++;
    if (e.cls === 'inf') {
      G.effects.push({ type: 'corpse', x: e.x, y: e.y, faction: e.faction, t: 0, life: 8 });
    } else if (e.cls === 'veh') {
      hooks.sfx('explodeVeh', e.x, e.y);
      G.effects.push({ type: 'expl', x: e.x, y: e.y - 4, size: 16, t: 0, life: 0.8, seed, debris: true });
      G.effects.push({ type: 'husk', x: e.x, y: e.y, face: e.face, tface: e.tface, def: e.def, t: 0, life: 12 });
      for (let i = 0; i < 4; i++) G.effects.push({ type: 'fire', x: e.x + (Math.random() - 0.5) * 8, y: e.y + (Math.random() - 0.5) * 6, t: -i * 0.3, life: 2.5 + Math.random() * 2 });
      scorch(G.tctx, e.x, e.y, 12, seed);
    } else if ((e.alt || 0) > 4) {
      // Shot down: a burst in the air, the pilot bails out, the airframe falls and crashes.
      hooks.sfx('hitMed', e.x, e.y);
      G.effects.push({ type: 'expl', x: e.x, y: e.y - e.alt, size: 10, t: 0, life: 0.6, seed, debris: true });
      ejectPilot(e);
      const jet = e.def.fly === 'jet', sp = jet ? (e.speedCur || e.def.speed) * 0.6 : 15;
      G.effects.push({ type: 'crash', x: e.x, y: e.y, alt: e.alt, vz: 0, face: e.face, spin: jet ? 0.8 : 5 + Math.random() * 3,
        vx: Math.cos(e.face) * sp, vy: Math.sin(e.face) * sp, def: e.def, faction: e.faction, t: 0, life: 20, smokeT: 0 });
    } else {
      crashLanding(e.x, e.y, e.face, e.def, e.faction, seed);
    }
    if (e.team === PLAYER) notify(team, 'lost', 'Unit lost', 4);
  } else {
    for (let y = e.cy; y < e.cy + e.h; y++) for (let x = e.cx; x < e.cx + e.w; x++) if (G.bld[idx(x, y)] === e.id) G.bld[idx(x, y)] = 0;
    if (e.exitCell !== undefined) G.resv[e.exitCell] = 0;
    if (e.sellT <= 0) {
      hooks.sfx('explodeBig', e.x, e.y);
      const n = e.w * e.h + 2;
      for (let i = 0; i < n; i++) {
        G.effects.push({ type: 'expl', x: (e.cx + Math.random() * e.w) * CELL, y: (e.cy + Math.random() * e.h) * CELL, size: 10 + Math.random() * 8,
          t: -i * 0.18, life: 0.8, seed: seed + i, debris: i % 2 === 0 });
      }
      rubble(G.tctx, e.cx * CELL, e.cy * CELL, e.w * CELL, e.h * CELL, seed);
      if (e.team === PLAYER) notify(team, 'slost', 'Structure lost', 4);
    }
  }
}

// Ground impact of an aircraft: fireball, burning wreck, scorched earth.
function crashLanding(x, y, face, def, faction, seed) {
  hooks.sfx('explodeVeh', x, y);
  G.effects.push({ type: 'expl', x, y: y - 4, size: 15, t: 0, life: 0.8, seed, debris: true });
  G.effects.push({ type: 'husk', x, y, face, tface: face, def, t: 0, life: 40 });
  for (let i = 0; i < 4; i++) G.effects.push({ type: 'fire', x: x + (Math.random() - 0.5) * 12, y: y + (Math.random() - 0.5) * 8, t: -i * 0.3, life: 3 + Math.random() * 3 });
  scorch(G.tctx, x, y, 13, seed);
  for (const e of G.entities) if (e.alive && e.kind === 'unit' && !isAirborne(e) && Math.hypot(e.x - x, e.y - y) < 14) damage(e, 30, 'HE', null);
}
function updateCrash(fx, dt) {
  fx.vz += 60 * dt;
  fx.alt -= fx.vz * dt;
  fx.x += fx.vx * dt; fx.y += fx.vy * dt; fx.face += fx.spin * dt;
  if ((fx.smokeT -= dt) <= 0) { fx.smokeT = 0.05; G.effects.push({ type: 'smoke', x: fx.x, y: fx.y - fx.alt, r: 2.5, t: 0, life: 0.9, alpha: 0.6, color: '#3a3733' }); }
  if (fx.alt <= 0) { fx.t = fx.life; crashLanding(fx.x, fx.y, fx.face, fx.def, fx.faction, (Math.random() * 1e6) | 0); }
}
// The crew of a downed aircraft parachutes down and joins the fight on the ground.
function ejectPilot(e) {
  const c = nearestFreeCell(cellOfPos(e.x, e.y), 4);
  if (c < 0) return;
  const team = G.teams[e.team], p = cellCenter(c);
  const u = addUnit('pilot', team, p.x, p.y);
  u.chute = (e.alt || 30) / 26 + 0.3;
  if (team.auto) setHunt(u); else setGuard(u);
}

// ---------------------------------------------------------------------------
// Unit behaviour
// ---------------------------------------------------------------------------
function updateUnit(u, dt) {
  u.cd = Math.max(0, u.cd - dt); u.cd2 = Math.max(0, u.cd2 - dt); u.fireT = Math.max(0, u.fireT - dt);
  u.moving = false;
  tickBurst(u, dt);
  if (u.def.scripted) { updateFlight(u, dt); return; }
  if (u.chute > 0) { u.chute -= dt; return; }
  if (u.cls === 'air') { updateAir(u, dt); return; }
  if (u.def.harvester) { updateHarvester(u, dt); followPath(u, dt); checkStuck(u, dt); return; }

  const o = u.order, w = u.def.weapon, sight = u.def.sight * CELL;
  if (u.target && (!u.target.alive || !canTarget(u, u.target))) u.target = null;
  u.think -= dt;
  if (u.think <= 0) {
    u.think = 0.35 + Math.random() * 0.2;
    if (o.type === 'attack') {
      if (!o.target.alive) setGuard(u); else u.target = o.target;
    } else if (o.type !== 'move') {
      if (u.target && distTo(u, u.target) > sight * 1.5) u.target = null;
      if (o.type === 'guard' && u.target && Math.hypot(u.target.x - o.x, u.target.y - o.y) > sight * 1.6) u.target = null;
      if (!u.target || u.target.kind === 'bld') {
        const t = acquire(u, sight, [w, u.def.weapon2]);
        if (t && (!u.target || t.kind === 'unit')) u.target = t;
      }
      if (!u.target) {
        if (o.type === 'hunt') {
          const b = nearestEnemyBuilding(u);
          if (b && (u.huntTarget !== b || (!u.dest && !u.needPath))) { u.huntTarget = b; goTo(u, b.x, b.y); }
        } else if (!u.dest && !u.needPath && Math.hypot(u.x - o.x, u.y - o.y) > 24) goTo(u, o.x, o.y);
      }
    }
  }
  if (o.type === 'move') {
    if (followPath(u, dt) && !u.needPath) setGuard(u);
  } else if (u.target) {
    engage(u, u.target, dt);
  } else {
    followPath(u, dt);
  }
  if (u.cls === 'veh' && !u.target) u.tface = turnToward(u.tface, u.face, 3 * dt);
  // Mammoth missiles pick their own targets, including aircraft.
  if (u.def.weapon2 && u.cd2 <= 0) {
    const t2 = u.target && canHit(u.def.weapon2, u.target) && distTo(u, u.target) <= u.def.weapon2.range ? u.target : acquire(u, u.def.weapon2.range, [u.def.weapon2]);
    if (t2) { fireWeapon(u, u.def.weapon2, t2); u.cd2 = u.def.weapon2.rof; }
  }
  checkStuck(u, dt);
}

function engage(u, t, dt) {
  const w = canHit(u.def.weapon, t) ? u.def.weapon : u.def.weapon2;
  const d = distTo(u, t);
  const ang = Math.atan2(t.y - (t.alt || 0) - u.y, t.x - u.x);
  if (d <= w.range) {
    u.dest = null; u.path = null;
    let aligned = true;
    if (u.cls === 'veh') { u.tface = turnToward(u.tface, ang, 5 * dt); aligned = Math.abs(angDiff(ang, u.tface)) < 0.12; }
    else u.face = ang;
    if (aligned && u.cd <= 0 && w === u.def.weapon) { shoot(u, w, t); u.cd = w.rof; }
  } else {
    if (!u.needPath && (!u.dest || Math.hypot(u.dest.x - t.x, u.dest.y - t.y) > 40)) goTo(u, t.x, t.y);
    followPath(u, dt);
    if (u.cls === 'veh') u.tface = turnToward(u.tface, ang, 3 * dt);
  }
}

function checkStuck(u, dt) {
  u.stuckT += dt;
  if (u.stuckT < 1) return;
  u.stuckT = 0;
  const moved = Math.hypot(u.x - u.lastX, u.y - u.lastY);
  u.lastX = u.x; u.lastY = u.y;
  if (!u.dest || u.needPath || moved > 3) { u.stuckN = 0; return; }
  u.stuckN++;
  if (u.stuckN === 2 || u.stuckN === 4) { const n = u.stuckN, d = u.dest; goTo(u, d.x, d.y); u.stuckN = n; }
  else if (u.stuckN >= 6) { u.dest = null; u.path = null; u.stuckN = 0; }
}

// Ore trucks run entirely on their own.
function findOre(u) {
  const start = cellOfPos(u.x, u.y);
  const seen = new Uint8Array(NCELLS), q = [start];
  seen[start] = 1;
  let fallback = -1;
  const claimed = new Set();
  for (const e of G.entities) if (e.alive && e !== u && e.def.harvester && e.team === u.team && e.hcell >= 0) claimed.add(e.hcell);
  for (let qi = 0; qi < q.length && qi < 6000; qi++) {
    const c = q[qi];
    if (G.ore[c] > 0) { if (!claimed.has(c)) return c; if (fallback < 0) fallback = c; }
    const cx = cellX(c), cy = cellY(c);
    for (let i = 0; i < 8; i++) {
      const nx = cx + DIRS8[i][0], ny = cy + DIRS8[i][1];
      if (!inMap(nx, ny)) continue;
      const n = idx(nx, ny);
      if (!seen[n] && freeCell(n)) { seen[n] = 1; q.push(n); }
    }
  }
  return fallback;
}
function dockPoint(ref) { return cellCenter(ref.exitCell); }
function nearestOwn(u, type) {
  let best = null, bd = Infinity;
  for (const e of G.entities) {
    if (!e.alive || e.kind !== 'bld' || e.team !== u.team || e.type !== type || e.sellT > 0) continue;
    const d = dist(u, e);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// Keep mining nearby cells without a full pathfinding trip: reach into adjacent
// cells in place, or roll straight onto the next one.
function nextOreCell(u) {
  const c0 = cellOfPos(u.x, u.y), cx = cellX(c0), cy = cellY(c0);
  let best = -1, bd = Infinity;
  for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
    const x = cx + ox, y = cy + oy;
    if (!inMap(x, y)) continue;
    const c = idx(x, y);
    if (!G.ore[c] || !freeCell(c)) continue;
    const d = dist(u, cellCenter(c));
    if (d < bd) { bd = d; best = c; }
  }
  if (best < 0) { u.hs = 'seek'; u.hcell = -1; return; }
  u.hcell = best;
  if (bd < 36) { u.hs = 'mine'; u.htimer = 0; return; }
  const p = cellCenter(best);
  u.hs = 'seek';
  u.dest = p; u.path = [p]; u.pathIdx = 0; u.needPath = false; u.stuckN = 0;
}

function updateHarvester(u, dt) {
  const cap = u.def.capacity, team = teamOf(u);
  switch (u.hs) {
    case 'seek': {
      if (u.load >= cap) { u.hs = 'return'; break; }
      if (u.hcell >= 0 && G.ore[u.hcell] > 0 && dist(u, cellCenter(u.hcell)) < (u.dest ? 6 : 22)) {
        u.dest = null; u.path = null; u.hs = 'mine'; u.htimer = 0;
      } else if (u.hcell >= 0 && G.ore[u.hcell] <= 0) {
        u.hcell = -1; u.dest = null;
      } else if (!u.dest && !u.needPath) {
        const c = findOre(u);
        if (c < 0) { if (u.load > 0) u.hs = 'return'; else { u.hs = 'wait'; u.htimer = 3; } break; }
        u.hcell = c;
        const p = cellCenter(c);
        goTo(u, p.x, p.y);
      }
      break;
    }
    case 'mine': {
      u.htimer += dt;
      u.anim += dt * 6;
      if (Math.random() < dt * 4) G.effects.push({ type: 'smoke', x: u.x + (Math.random() - 0.5) * 14, y: u.y + 4, r: 2.5, t: 0, life: 0.7, alpha: 0.35, color: '#8a7650' });
      if (u.htimer >= 0.3) {
        u.htimer = 0;
        const c = u.hcell, take = Math.min(60, G.ore[c], cap - u.load);
        G.ore[c] -= take; u.load += take;
        if (u.load >= cap) { u.hs = 'return'; u.hcell = -1; }
        else if (G.ore[c] <= 0) nextOreCell(u);
      }
      break;
    }
    case 'return': {
      const ref = nearestOwn(u, 'refinery');
      if (!ref) { u.hs = 'wait'; u.htimer = 3; break; }
      const dock = dockPoint(ref);
      u.ref = ref;
      if (dist(u, dock) < 10) { u.dest = null; u.path = null; u.hs = 'unload'; u.htimer = 0; }
      else if ((!u.dest && !u.needPath) || (u.dest && Math.hypot(u.dest.x - dock.x, u.dest.y - dock.y) > 4)) goTo(u, dock.x, dock.y);
      break;
    }
    case 'unload': {
      if (!u.ref || !u.ref.alive) { u.hs = 'return'; break; }
      u.face = turnToward(u.face, -Math.PI / 2, 3 * dt);
      u.htimer += dt;
      if (u.htimer >= 0.1) {
        u.htimer = 0;
        const amt = Math.min(80, u.load);
        u.load -= amt;
        const gain = amt * (team.isAI ? G.diff.income : 1);
        team.credits += gain; team.stats.harvested += gain;
        if (u.load <= 0) { u.load = 0; u.hs = 'seek'; }
      }
      break;
    }
    case 'wait':
      u.htimer -= dt;
      if (u.htimer <= 0) u.hs = 'seek';
      break;
    case 'manual':
      if (!u.dest && !u.needPath) u.hs = u.load >= cap ? 'return' : 'seek';
      break;
  }
}

// --- Aircraft ---------------------------------------------------------------
const HELI_ALT = 20, JET_ALT = 30;

function padFor(u) {
  const type = u.def.producer;
  let best = null, bd = Infinity;
  for (const e of G.entities) {
    if (!e.alive || e.kind !== 'bld' || e.team !== u.team || e.type !== type || e.sellT > 0) continue;
    const d = dist(u, e);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function padSpot(pad, u) {
  // Each aircraft gets its own parking slot: three along the runway, or the pad itself and then
  // the ground beside it for helicopters.
  const mates = G.entities.filter((e) => e.alive && e.kind === 'unit' && e.team === u.team && e.def.producer === pad.type);
  const k = Math.max(0, mates.indexOf(u)) % 3;
  if (pad.type === 'airfield') return { x: pad.cx * CELL + 14 + k * 22, y: pad.cy * CELL + 27 };
  return [{ x: pad.x, y: pad.y }, { x: pad.x + 36, y: pad.y - 4 }, { x: pad.x + 34, y: pad.y + 28 }][k];
}

function airTarget(u) {
  const o = u.order, sight = u.def.sight * CELL * (u.def.fly === 'jet' ? 1.6 : 1);
  if (o.type === 'attack') { if (o.target.alive) return o.target; setGuard(u); }
  if (o.type === 'move' && u.def.fly === 'heli') return null;
  if (u.target && u.target.alive && canHit(u.def.weapon, u.target) && distTo(u, u.target) < sight * 1.4) return u.target;
  const src = o.type === 'guard' ? { x: o.x, y: o.y, team: u.team } : u;
  return acquire(src, sight, [u.def.weapon]);
}

function updateAir(u, dt) {
  const w = u.def.weapon, maxAmmo = w.ammo, jet = u.def.fly === 'jet';
  if (u.target && !u.target.alive) u.target = null;

  if (u.as === 'landed') {
    u.alt = 0; u.speedCur = 0;
    u.rt += dt;
    if (u.ammo < maxAmmo && u.rt >= (jet ? 1.5 : 0.5)) { u.ammo++; u.rt = 0; }
    // Aircraft told to wait on their pad stay parked until auto attack, an order or a raid sends them up.
    if (u.ammo >= maxAmmo && u.order.type !== 'rearm-hold' && !(u.order.type === 'guard' && u.order.pad)) u.as = 'takeoff';
    return;
  }
  if (u.as === 'takeoff') {
    u.alt = Math.min(jet ? JET_ALT : HELI_ALT, u.alt + (jet ? 25 : 18) * dt);
    if (jet) { u.speedCur = Math.min(u.def.speed, u.speedCur + 160 * dt); u.x += Math.cos(u.face) * u.speedCur * dt; u.y += Math.sin(u.face) * u.speedCur * dt; u.moving = true; }
    if (u.alt >= (jet ? JET_ALT : HELI_ALT)) u.as = 'fly';
    clampAir(u);
    return;
  }

  // Out of ammo, or told to wait on the pad: head home and land.
  if (u.ammo <= 0 || (u.order.type === 'guard' && u.order.pad)) {
    const pad = padFor(u);
    if (pad) {
      const spot = padSpot(pad, u);
      const d = Math.hypot(spot.x - u.x, spot.y - u.y);
      if (jet) {
        if (d < 26) { u.as = 'landed'; u.x = spot.x; u.y = spot.y; u.face = 0; u.rt = 0; return; }
        flyJet(u, spot.x, spot.y, dt);
      } else {
        if (d < 3) { u.alt = Math.max(0, u.alt - 20 * dt); if (u.alt <= 0) { u.as = 'landed'; u.rt = 0; } return; }
        flyHeli(u, spot.x, spot.y, dt);
      }
      return;
    }
    // No pad: limp back to base and rearm slowly in the air.
    u.rt += dt;
    if (u.rt > 6) { u.ammo = maxAmmo; u.rt = 0; }
    const home = buildingsOf(u.team)[0] || u;
    if (jet) orbit(u, home.x, home.y, dt); else flyHeli(u, home.x, home.y, dt);
    return;
  }

  u.think -= dt;
  if (u.think <= 0) { u.think = 0.3; u.target = airTarget(u); }
  const t = u.target;
  const o = u.order;
  if (jet) {
    if (u.passT > 0) { u.passT -= dt; flyJet(u, u.x + Math.cos(u.face) * 100, u.y + Math.sin(u.face) * 100, dt); return; }
    if (t) {
      const d = distTo(u, t), ang = Math.atan2(t.y - u.y, t.x - u.x);
      if (d <= w.range && Math.abs(angDiff(ang, u.face)) < 0.35 && u.cd <= 0) {
        shoot(u, w, t); u.cd = w.rof; u.ammo--;
        if (u.ammo <= 0 || Math.random() < 0.5) u.passT = 0.9;
      }
      flyJet(u, t.x, t.y, dt);
    } else if (o.type === 'hunt') {
      const b = nearestEnemyBuilding(u);
      if (b) flyJet(u, b.x, b.y, dt); else orbit(u, u.x, u.y, dt);
    } else {
      orbit(u, o.x, o.y, dt);
    }
    return;
  }
  // Helicopter
  if (o.type === 'move') {
    if (Math.hypot(o.x - u.x, o.y - u.y) < 6) setGuard(u, o.x, o.y);
    else { flyHeli(u, o.x, o.y, dt); return; }
  }
  if (t) {
    const d = distTo(u, t), ang = Math.atan2(t.y - u.y, t.x - u.x);
    if (d > w.range * 0.9) flyHeli(u, t.x, t.y, dt);
    else {
      u.face = turnToward(u.face, ang, 4 * dt);
      if (Math.abs(angDiff(ang, u.face)) < 0.2 && u.cd <= 0) { shoot(u, w, t); u.cd = w.rof; u.ammo--; }
    }
  } else if (o.type === 'hunt') {
    const b = nearestEnemyBuilding(u);
    if (b) flyHeli(u, b.x, b.y, dt);
  } else if (Math.hypot(o.x - u.x, o.y - u.y) > 8) flyHeli(u, o.x, o.y, dt);
}

function flyHeli(u, x, y, dt) {
  const ang = Math.atan2(y - u.y, x - u.x), d = Math.hypot(x - u.x, y - u.y);
  u.face = turnToward(u.face, ang, 4 * dt);
  if (Math.abs(angDiff(ang, u.face)) < 1) {
    const step = Math.min(d, u.def.speed * dt);
    u.x += Math.cos(ang) * step; u.y += Math.sin(ang) * step; u.moving = true;
  }
  clampAir(u);
}
function flyJet(u, x, y, dt) {
  const ang = Math.atan2(y - u.y, x - u.x);
  u.face = turnToward(u.face, ang, u.def.turn * dt);
  u.speedCur = Math.min(u.def.speed, (u.speedCur || 0) + 160 * dt);
  u.x += Math.cos(u.face) * u.speedCur * dt; u.y += Math.sin(u.face) * u.speedCur * dt;
  u.moving = true;
  clampAir(u);
}
function orbit(u, cx, cy, dt) {
  const a = Math.atan2(u.y - cy, u.x - cx) + 0.9;
  flyJet(u, cx + Math.cos(a) * 90, cy + Math.sin(a) * 90, dt);
}
function clampAir(u) { u.x = Math.max(8, Math.min(WORLD - 8, u.x)); u.y = Math.max(8, Math.min(WORLD - 8, u.y)); }

// --- Airfield support powers ---------------------------------------------------
function powerReady(team, key) { return hasBuilt(team, 'airfield') && team.powers[key] >= POWERS[key].charge; }
function updatePowers(team, dt) {
  if (!hasBuilt(team, 'airfield')) return;
  for (const [key, p] of Object.entries(POWERS)) {
    if (team.powers[key] >= p.charge) continue;
    team.powers[key] = Math.min(p.charge, team.powers[key] + dt * (team.low ? 0.5 : 1));
    if (team.powers[key] >= p.charge) notify(team, 'pw' + key, p.ready, 1);
  }
}
// The plane takes off from behind its own base and flies straight over the target.
function launchPower(team, key, x, y) {
  if (!powerReady(team, key)) return false;
  team.powers[key] = 0;
  const type = key === 'spy' ? 'spyplane' : key === 'para' ? 'transport' : 'bomber';
  const hx = (team.start.cx + 0.5) * CELL, hy = (team.start.cy + 0.5) * CELL;
  const a = Math.atan2(y - hy, x - hx), back = Math.hypot(x - hx, y - hy) + 260;
  const u = addUnit(type, team, x - Math.cos(a) * back, y - Math.sin(a) * back);
  u.face = u.tface = a; u.alt = JET_ALT; u.as = 'fly';
  u.order = { type: 'flight' };
  u.flight = { key, tx: x, ty: y, done: false, bombs: 0, bombT: 0 };
  return true;
}
function updateFlight(u, dt) {
  const f = u.flight, ca = Math.cos(u.face), sa = Math.sin(u.face);
  u.alt = JET_ALT; u.moving = true; u.speedCur = u.def.speed;
  u.x += ca * u.def.speed * dt; u.y += sa * u.def.speed * dt;
  const past = (u.x - f.tx) * ca + (u.y - f.ty) * sa;   // distance flown beyond the target
  if (f.key === 'spy' && !f.done && past >= 0) {
    f.done = true;
    if (u.team === PLAYER) revealCircle(f.tx / CELL, f.ty / CELL, POWERS.spy.reveal);
  } else if (f.key === 'para' && !f.done && past >= -8) {
    f.done = true;
    dropTroops(u, f.tx, f.ty);
  } else if (f.key === 'bomb' && f.bombs < POWERS.bomb.bombs && past >= -90) {
    f.bombT -= dt;
    if (f.bombT <= 0) {
      f.bombT = 0.085; f.bombs++;
      G.projectiles.push({ kind: 'bomb', team: u.team, from: u, w: POWERS.bomb.bomb, tx: u.x, ty: u.y, x: u.x, y: u.y - JET_ALT, z: JET_ALT, t: 0, dur: 0.55 });
    }
  }
  if (past > 600) u.alive = false;   // flown off: gone without a wreck
}
function dropTroops(plane, x, y) {
  const team = G.teams[plane.team], squad = POWERS.para.squad[team.faction];
  squad.forEach((type, i) => {
    const a = i / squad.length * Math.PI * 2;
    const c = nearestFreeCell(cellOfPos(x + Math.cos(a) * 16, y + Math.sin(a) * 16), 5);
    if (c < 0) return;
    const p = cellCenter(c), u = addUnit(type, team, p.x + (Math.random() - 0.5) * 8, p.y + (Math.random() - 0.5) * 8);
    u.chute = 1.3 + i * 0.18;
    if (team.auto) setHunt(u); else setGuard(u);
  });
}

// ---------------------------------------------------------------------------
// Structures
// ---------------------------------------------------------------------------
function updateBuilding(b, dt) {
  const team = teamOf(b);
  b.fireT = Math.max(0, b.fireT - dt);
  b.charge = Math.max(0, b.charge - dt * 1.5);
  if (b.buildT < 1) b.buildT = Math.min(1, b.buildT + dt / 1.4);
  if (b.sellT > 0) {
    b.sellT -= dt;
    if (b.sellT <= 0) { b.sellT = 0.0001; team.credits += Math.floor(b.def.cost * 0.5 * b.hp / b.maxHp); kill(b, null); }
    return;
  }
  if (b.repairing) {
    b.repT = (b.repT || 0) + dt;
    if (b.repT >= 0.25) {
      b.repT = 0;
      const heal = b.maxHp * 0.02, cost = Math.max(1, b.def.cost * 0.01);
      if (b.hp >= b.maxHp) b.repairing = false;
      else if (team.credits >= cost) { team.credits -= cost; b.hp = Math.min(b.maxHp, b.hp + heal); }
      else { b.repairing = false; notify(team, 'funds', 'Insufficient funds', 4); }
    }
  }
  // Smoke and fire on damaged structures; steam from power plants.
  b.smokeT -= dt;
  if (b.smokeT <= 0) {
    const f = b.hp / b.maxHp;
    b.smokeT = 0.18 + Math.random() * 0.2;
    const px = (b.cx + 0.2 + Math.random() * (b.w - 0.4)) * CELL, py = (b.cy + 0.2 + Math.random() * (b.h - 0.6)) * CELL - 10;
    if (f < 0.5) G.effects.push({ type: 'smoke', x: px, y: py, vy: -14, vx: 5, r: 3 + Math.random() * 3, t: 0, life: 1.6, alpha: 0.55, color: '#3a3733' });
    if (f < 0.25) G.effects.push({ type: 'fire', x: px, y: py + 4, t: 0, life: 0.6 });
    if (b.type === 'power' && b.buildT >= 1 && Math.random() < 0.6) G.effects.push({ type: 'smoke', x: b.cx * CELL + 38, y: b.cy * CELL + 14 - 42 * VK, vy: -16, vx: 6, r: 2.5, t: 0, life: 1.8, alpha: 0.4, color: '#c9c7c0' });
  }
  const w = b.def.weapon;
  if (!w || b.buildT < 1) return;
  tickBurst(b, dt);
  b.cd = Math.max(0, b.cd - dt);
  if (w.needsPower && team.low) return;
  b.think -= dt;
  if (b.think <= 0) {
    b.think = 0.3;
    const src = { x: b.x, y: b.y, team: b.team };
    if (!b.target || !b.target.alive || distTo(src, b.target) > w.range) b.target = acquire(src, w.range, [w]);
  }
  const t = b.target;
  if (!t || !t.alive) return;
  const ang = Math.atan2(t.y - (t.alt || 0) - b.y, t.x - b.x);
  if (b.type !== 'tesla') b.tface = turnToward(b.tface, ang, 5 * dt);
  if (b.cd <= 0 && (b.type === 'tesla' || Math.abs(angDiff(ang, b.tface)) < 0.15)) { shoot(b, w, t); b.cd = w.rof; }
}

function canPlace(team, type, cx, cy, gap) {
  const d = BUILD_DEFS[type];
  if (cx < 1 || cy < 1 || cx + d.w > MAP - 1 || cy + d.h + (d.exit ? 1 : 0) > MAP - 1) return false;
  for (let y = cy; y < cy + d.h; y++) for (let x = cx; x < cx + d.w; x++) {
    const c = idx(x, y);
    if (G.block[c] || G.bld[c] || G.ore[c] > 0 || G.resv[c]) return false;
  }
  if (d.exit) { const c = idx(cx + Math.floor(d.w / 2), cy + d.h); if (G.block[c] || G.bld[c]) return false; }
  const x0 = cx * CELL, y0 = cy * CELL, x1 = (cx + d.w) * CELL, y1 = (cy + d.h) * CELL;
  for (const e of G.entities) {
    if (e.alive && e.kind === 'unit' && !isAirborne(e) && e.x > x0 - 2 && e.x < x1 + 2 && e.y > y0 - 2 && e.y < y1 + 2) return false;
  }
  let near = false;
  for (const b of G.entities) {
    if (!b.alive || b.kind !== 'bld') continue;
    if (gap && cx < b.cx + b.w + gap && cx + d.w + gap > b.cx && cy < b.cy + b.h + gap && cy + d.h + gap > b.cy) return false;
    if (b.team === team.id && cx <= b.cx + b.w + 3 && cx + d.w >= b.cx - 3 && cy <= b.cy + b.h + 3 && cy + d.h >= b.cy - 3) near = true;
  }
  return near;
}

function placeStructure(team, type, cx, cy) {
  const q = team.queues.structure;
  if (!q || !q.ready || q.type !== type || !canPlace(team, type, cx, cy, team.isAI ? 1 : 0)) return false;
  team.queues.structure = null;
  const b = addBuilding(type, team, cx, cy);
  hooks.sfx('place', b.x, b.y);
  if (type === 'refinery') {
    const p = cellCenter(b.exitCell);
    const h = addUnit('harv', team, p.x, p.y);
    h.face = Math.PI / 2;
  }
  updatePower();
  return b;
}

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------
function hasBuilt(team, type) { return G.entities.some((e) => e.alive && e.kind === 'bld' && e.team === team.id && e.type === type && e.sellT <= 0); }
function available(team, type) {
  const d = defOf(type);
  if (!d.factions.includes(team.faction)) return false;
  if (UNIT_DEFS[type]) return hasBuilt(team, d.producer);
  return hasBuilt(team, 'cy') && d.req.every((r) => hasBuilt(team, r));
}

function startProduction(team, type) {
  if (!available(team, type)) return 'Not available';
  const cat = catOf(type);
  if (cat === 'structure') {
    const q = team.queues.structure;
    if (q) return q.type === type ? (q.ready ? 'place' : 'busy-same') : 'busy';
    team.queues.structure = { type, progress: 0, spent: 0, ready: false };
    return null;
  }
  const list = team.queues[cat];
  if (list.length >= 9) return 'full';
  list.push({ type, progress: 0, spent: 0 });
  return null;
}

function cancelProduction(team, type) {
  const cat = catOf(type);
  if (cat === 'structure') {
    const q = team.queues.structure;
    if (q && q.type === type) { team.credits += q.spent; team.queues.structure = null; return true; }
    return false;
  }
  const list = team.queues[cat];
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].type === type) { team.credits += list[i].spent; list.splice(i, 1); return true; }
  }
  return false;
}

function updateProduction(team, dt) {
  const speed = (team.low ? 0.5 : 1) * (team.isAI ? G.diff.speed : 1);
  for (const cat of CATEGORIES) {
    const item = cat === 'structure' ? team.queues.structure : team.queues[cat][0];
    if (!item || item.ready) continue;
    if (!available(team, item.type)) continue;
    const def = defOf(item.type);
    const dp = Math.min(dt * speed / buildTime(def), 1 - item.progress);
    const cost = def.cost * dp;
    if (team.credits < cost) { item.stalled = true; notify(team, 'funds', 'Insufficient funds', 8); continue; }
    item.stalled = false;
    team.credits -= cost; item.spent += cost; item.progress += dp;
    if (item.progress >= 0.9999) {
      if (cat === 'structure') { item.ready = true; item.progress = 1; notify(team, 'cc', 'Construction complete', 0.5); }
      else { team.queues[cat].shift(); spawnUnit(team, item.type); notify(team, 'ur', 'Unit ready', 0.5); }
    }
  }
}

function spawnUnit(team, type) {
  const d = UNIT_DEFS[type];
  const producers = G.entities.filter((e) => e.alive && e.kind === 'bld' && e.team === team.id && e.type === d.producer && e.sellT <= 0);
  const p = producers[producers.length - 1];
  if (!p) return null;
  let u;
  if (d.cls === 'air') {
    u = addUnit(type, team, 0, 0);
    const spot = padSpot(p, u);
    u.x = spot.x; u.y = spot.y; u.face = p.type === 'airfield' ? 0 : (team.id === PLAYER ? -0.8 : 2.35);
    u.as = 'landed'; u.alt = 0;
    setGuard(u); u.order.pad = true; u.staged = true;
    if (team.auto) launchAircraft(u);
    return u;
  } else {
    let c = p.exitCell;
    if (c === undefined || !freeCell(c)) c = nearestFreeCell(idx(p.cx + Math.floor(p.w / 2), p.cy + p.h), 6);
    const pos = cellCenter(c);
    u = addUnit(type, team, pos.x + (Math.random() - 0.5) * 6, pos.y + (Math.random() - 0.5) * 4);
    u.face = u.tface = Math.PI / 2;
  }
  if (d.harvester) return u;
  // New units gather at the rally point; auto attack launches them in groups.
  const r = rallyPoint(team);
  const gx = r.x + (Math.random() - 0.5) * 70, gy = r.y + (Math.random() - 0.5) * 70;
  setGuard(u, gx, gy);
  u.staged = true;
  goTo(u, gx, gy);
  return u;
}

function updatePower() {
  for (const team of G.teams) {
    let prod = 0, use = 0;
    for (const b of G.entities) {
      if (!b.alive || b.kind !== 'bld' || b.team !== team.id) continue;
      if (b.def.power > 0) prod += Math.round(b.def.power * (0.5 + 0.5 * b.hp / b.maxHp));
      else use -= b.def.power;
    }
    const wasLow = team.low;
    team.power.prod = prod; team.power.use = use;
    team.low = use > prod;
    if (team.low && !wasLow) notify(team, 'power', 'Low power', 10);
  }
}

// ---------------------------------------------------------------------------
// Shroud, ore growth, win check
// ---------------------------------------------------------------------------
function revealAround() {
  for (const e of G.entities) {
    if (!e.alive || e.team !== PLAYER) continue;
    const rad = e.kind === 'bld' ? (e.def.sight || 3) + Math.max(e.w, e.h) / 2 : e.def.sight;
    revealCircle(e.x / CELL, e.y / CELL, rad);
  }
}
function revealCircle(cx, cy, rad) {
  const seen = G.seen;
  for (let y = Math.floor(cy - rad); y <= cy + rad; y++) {
    for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      if (!inMap(x, y)) continue;
      const c = idx(x, y);
      if (!seen[c] && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= rad) { seen[c] = 1; G.shroudDirty = true; }
    }
  }
}

function growOre() {
  const r = Math.random;
  for (const f of G.oreFields) {
    for (let i = 0; i < 3; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (f.r + 0.8);
      const x = Math.floor(f.cx + Math.cos(a) * d), y = Math.floor(f.cy + Math.sin(a) * d);
      if (!inMap(x, y)) continue;
      const c = idx(x, y);
      if (G.block[c] || G.bld[c]) continue;
      const cap = Math.round(Math.min(ORE_MAX, (60 + (1 - Math.min(1, d / f.r)) * 190) * f.rich));
      if (G.ore[c] < cap) G.ore[c] = Math.min(cap, G.ore[c] + 25);
    }
  }
}

// A side is defeated the moment its Construction Yard is destroyed.
function checkWin() {
  if (G.over) return;
  const hasCY = (tid) => G.entities.some((e) => e.alive && e.kind === 'bld' && e.team === tid && e.type === 'cy');
  const p = hasCY(PLAYER), e = hasCY(ENEMY);
  if (!p || !e) {
    G.over = { won: !e, t: G.t };
    hooks.gameOver(!e);
  }
}

// ---------------------------------------------------------------------------
// Commands from the player
// ---------------------------------------------------------------------------
function formationSpots(n, x, y) {
  const cols = Math.ceil(Math.sqrt(n)), gap = 16, out = [];
  for (let i = 0; i < n; i++) {
    const cx = (i % cols) - (cols - 1) / 2, cy = Math.floor(i / cols) - (Math.ceil(n / cols) - 1) / 2;
    out.push({ x: x + cx * gap, y: y + cy * gap });
  }
  return out;
}
function commandMove(units, x, y) {
  const spots = formationSpots(units.length, x, y);
  const sorted = units.slice().sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  sorted.forEach((u, i) => {
    const s = spots[i];
    u.target = null; u.staged = false; u.defending = false;
    if (u.def.harvester) {
      const c = cellOfPos(x, y);
      if (G.ore[c] > 0) { u.hcell = c; u.hs = 'seek'; goTo(u, x, y); }
      else { u.hs = 'manual'; goTo(u, s.x, s.y); }
    } else if (u.cls === 'air') {
      if (u.ammo <= 0) return;
      u.order = u.def.fly === 'jet' ? { type: 'guard', x, y } : { type: 'move', x: s.x, y: s.y };
      if (u.as === 'landed') u.as = 'takeoff';
    } else {
      u.order = { type: 'move', x: s.x, y: s.y };
      goTo(u, s.x, s.y);
    }
  });
}
function commandAttack(units, target) {
  for (const u of units) {
    if (u.def.harvester || !canTarget(u, target)) continue;
    u.order = { type: 'attack', target }; u.staged = false; u.defending = false;
    u.target = target;
    if (u.cls === 'air' && u.as === 'landed' && u.ammo > 0) u.as = 'takeoff';
  }
}
function commandHunt(units) {
  for (const u of units) if (!u.def.harvester) { setHunt(u); u.staged = false; u.defending = false; if (u.cls === 'air' && u.as === 'landed' && u.ammo > 0) u.as = 'takeoff'; }
}
function commandStop(units) {
  for (const u of units) {
    if (u.def.harvester) { u.hs = 'manual'; u.dest = null; u.path = null; continue; }
    setGuard(u); u.dest = null; u.path = null; u.staged = false; u.defending = false;
  }
}

// ---------------------------------------------------------------------------
// Main update
// ---------------------------------------------------------------------------
function separate() {
  const buckets = new Map();
  const list = [];
  for (const e of G.entities) {
    if (!e.alive || e.kind !== 'unit' || (e.cls === 'air' && e.def.fly === 'jet')) continue;
    const air = isAirborne(e);
    if (e.cls === 'air' && !air) continue;
    const key = (air ? 100000 : 0) + Math.floor(e.x / 32) * 200 + Math.floor(e.y / 32);
    let b = buckets.get(key);
    if (!b) { b = []; buckets.set(key, b); }
    b.push(e); list.push(e);
  }
  for (const a of list) {
    const air = isAirborne(a), base = air ? 100000 : 0, bx = Math.floor(a.x / 32), by = Math.floor(a.y / 32);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const b = buckets.get(base + (bx + ox) * 200 + by + oy);
      if (!b) continue;
      for (const o of b) {
        if (o.id <= a.id) continue;
        const rr = (a.def.r + o.def.r) * (air ? 1.2 : 0.85);
        const dx = o.x - a.x, dy = o.y - a.y, d = Math.hypot(dx, dy);
        if (d >= rr) continue;
        const nx = d > 0.01 ? dx / d : Math.random() - 0.5, ny = d > 0.01 ? dy / d : Math.random() - 0.5;
        const push = Math.min(2, (rr - d) * 0.5);
        // Heavier, busier units shove lighter, idle ones.
        const wa = (a.cls === 'inf' ? 1 : 0.4) * (a.moving ? 0.5 : 1), wo = (o.cls === 'inf' ? 1 : 0.4) * (o.moving ? 0.5 : 1), ws = wa + wo;
        if (air) { a.x -= nx * push * wa / ws; a.y -= ny * push * wa / ws; o.x += nx * push * wo / ws; o.y += ny * push * wo / ws; }
        else { tryMove(a, -nx * push * 2 * wa / ws, -ny * push * 2 * wa / ws); tryMove(o, nx * push * 2 * wo / ws, ny * push * 2 * wo / ws); }
      }
    }
  }
}

function update(dt) {
  if (!G || G.paused) return;
  G.t += dt;
  for (const e of G.entities) {
    if (!e.alive) continue;
    if (e.kind === 'unit') updateUnit(e, dt); else updateBuilding(e, dt);
  }
  separate();
  updateProjectiles(dt);
  processPaths();
  if (!G.over) for (const team of G.teams) { updateProduction(team, dt); updatePowers(team, dt); }
  const T = G.timers;
  if ((T.power -= dt) <= 0) { T.power = 0.5; updatePower(); }
  if ((T.shroud -= dt) <= 0) { T.shroud = 0.25; revealAround(); }
  if ((T.ore -= dt) <= 0) { T.ore = 2; growOre(); }
  if ((T.ai -= dt) <= 0) { T.ai = 1; if (!G.over) for (const team of G.teams) if (team.isAI) aiThink(team); }
  if ((T.win -= dt) <= 0) { T.win = 1; checkWin(); if (!G.over) launchGroups(); }
  for (const fx of G.effects) {
    if (fx.type === 'crash') updateCrash(fx, dt);
    fx.t += dt;
    if (fx.vy && fx.t > 0 && fx.type !== 'crash') { fx.y += fx.vy * dt; fx.x += (fx.vx || 0) * dt; }
  }
  G.effects = G.effects.filter((fx) => fx.t < fx.life);
  if (G.entities.some((e) => !e.alive)) {
    for (const e of G.entities) if (!e.alive) G.byId.delete(e.id);
    G.entities = G.entities.filter((e) => e.alive);
    G.selection = G.selection.filter((e) => e.alive);
  }
  for (const team of G.teams) team.shown += Math.sign(team.credits - team.shown) * Math.min(Math.abs(team.credits - team.shown), Math.max(60, Math.abs(team.credits - team.shown) * 0.2) * dt * 10);
}
