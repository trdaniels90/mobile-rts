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

let hooks = { eva() {}, gameOver() {}, sfx() {}, shake() {} };

// ---------------------------------------------------------------------------
// New game
// ---------------------------------------------------------------------------
function newWorld(playerFaction, diffKey, seed) {
  seed = seed || (Math.random() * 1e9) | 0;
  const enemyFaction = playerFaction === 'allies' ? 'soviets' : 'allies';
  G = {
    t: 0, seed, diff: DIFFICULTY[diffKey], diffKey, nextId: 1,
    entities: [], byId: new Map(), effects: [], projectiles: [], pathQueue: [], groups: [],
    terr: new Uint8Array(NCELLS), block: new Uint8Array(NCELLS), bld: new Int32Array(NCELLS), resv: new Uint8Array(NCELLS),
    ore: new Uint16Array(NCELLS), gem: new Uint8Array(NCELLS), seen: new Uint8Array(NCELLS), shroudDirty: true, oreFields: [],
    selection: [], place: null, over: null, paused: false,
    timers: { power: 0, shroud: 0, ore: 0, ai: 0, win: 0 },
    teams: [makeTeam(PLAYER, playerFaction, false), makeTeam(ENEMY, enemyFaction, true)],
  };
  G.teams[ENEMY].credits = G.diff.credits;
  // Start positions: a random one of the eight for the player, and for the enemy a random one
  // of the four across the lakes, so the two bases never start on the same side.
  const sr = rng(Math.imul(seed ^ 0x2545f491, 0x9e3779b1) ^ (seed >>> 7)); sr(); sr();
  G.spawns = spawnPoints();
  const pi = Math.floor(sr() * 8), ei = (pi < 4 ? 4 : 0) + Math.floor(sr() * 4);
  G.teams[PLAYER].start = { ...G.spawns[pi] };
  G.teams[ENEMY].start = { ...G.spawns[ei] };
  genMap(seed);
  G.terrainCanvas = paintTerrain(G.terr, seed, G.road, G.bridges);
  G.tctx = G.terrainCanvas.getContext('2d');
  // Bodies and wrecks get their own layer above the ground, so later craters and scorch
  // marks never paint over them.
  G.decals = mkCanvas(WORLD, WORLD);
  G.dctx = G.decals.getContext('2d');

  for (const team of G.teams) {
    const b = addBuilding('cy', team, team.start.cx - 1, team.start.cy - 1);
    b.buildT = 1;
    const a = Math.atan2(MID - team.start.cy, MID - team.start.cx);   // out toward the middle
    for (let i = 0; i < 3; i++) {
      const fwd = 56, side = (i - 1) * 18;
      const u = addUnit('rifle', team, b.x + Math.cos(a) * fwd - Math.sin(a) * side, b.y + Math.sin(a) * fwd + Math.cos(a) * side);
      setGuard(u);
    }
  }
  updatePower();
  revealAround();
  return G;
}

function makeTeam(id, faction, isAI) {
  return {
    id, faction, isAI, pal: FACTIONS[faction].pal, credits: 5000, shown: 5000, start: null,
    power: { prod: 0, use: 0 }, low: false, auto: !!isAI,
    queues: { structure: null, infantry: [], vehicle: [], aircraft: [] },
    stats: { built: 0, lost: 0, killed: 0, harvested: 0 },
    cool: {}, powers: { spy: 0, para: 0, bomb: 0 }, defending: false, calm: 0, harvHit: null,
  };
}

// ---------------------------------------------------------------------------
// Map: a fixed layout after the classic "A Path Beyond", with random dressing
// ---------------------------------------------------------------------------
// Two long lakes cross the middle of the island from corner to corner. Armies can go over the
// land gap in the centre (the main road), over a bridge across either lake, or around the far
// ends of the lakes. Each side of the lakes has four start positions (a corner, one by each
// bridge and one forward on the main road), each with its own ore; the ones nobody starts on
// are free expansions. More ore lies on the lake shores between the crossings, with a rare gem
// field on each side. Shorelines, woods and rocks vary per game. The map is point-symmetric,
// so both sides are equal.
//
// Layout coordinates: t runs along the lakes (map diagonal x = y), d runs across them (d > 0 is
// the lower-left side, d < 0 the upper-right).
const LT = (x, y) => (x + y) / 2, LD = (x, y) => (y - x) / Math.SQRT2;
const LX = (t, d) => t - d / Math.SQRT2, LY = (t, d) => t + d / Math.SQRT2;
// The layout was designed on an 88-cell map; K scales it to the current map size.
const MID = (MAP - 1) / 2, K = MAP / 88, S96 = MAP / 96;
const BASE_CLEAR = 14;   // radius of open ground kept clear of woods and rocks around each start position
const LAKE_IN = 3.4 * K, LAKE_OUT = 34.5 * K, LAKE_W = 8 * K, BRIDGE_T = 18 * K;
// Start positions on the lower-left side, in cells on a 96-cell map, each with its two ore
// fields; the upper-right side mirrors them.
const SPAWNS_HALF = [
  { at: [12, 83], ore: [[8, 72], [22, 88]] },     // the corner
  { at: [11, 48], ore: [[9, 37], [10, 59]] },     // left edge, by the near bridge
  { at: [47, 84], ore: [[58, 86], [36, 86]] },    // bottom edge, by the far bridge
  { at: [31, 64], ore: [[24, 56], [39, 72]] },    // forward, on the main road
];
function spawnPoints() {
  const half = SPAWNS_HALF.map((s) => ({ cx: Math.round(s.at[0] * S96), cy: Math.round(s.at[1] * S96) }));
  return half.concat(half.map((s) => ({ cx: MAP - 1 - s.cx, cy: MAP - 1 - s.cy })));
}

function genMap(seed) {
  const r = rng(seed ^ 0x5bd1e995);
  const T = G.terr;
  const spawns = G.spawns, half = spawns.slice(0, 4);
  const set = (cx, cy, v) => {
    if (!inMap(cx, cy)) return;
    T[idx(cx, cy)] = v; T[idx(MAP - 1 - cx, MAP - 1 - cy)] = v;
  };
  // Smooth 1-D noise for organic edges.
  const wobble = (n, amp) => { const v = Array.from({ length: n + 2 }, () => (r() - 0.5) * 2 * amp); return (u) => { u = Math.max(0, Math.min(n, u)); const i = Math.floor(u), f = u - i, s = f * f * (3 - 2 * f); return v[i] + (v[i + 1] - v[i]) * s; }; };
  const coastW = wobble(40, 1.4), lakeW = wobble(30, 2.4), lakeEnd = wobble(4, 2);
  const at = (t, d) => [LX(MID + t, d), LY(MID + t, d)];   // layout to cells

  // Ore, for the lower-left side; mirrored for the other.
  // Each start position's own fields sit just outside its cleared building ground.
  const fieldsHalf = [];
  SPAWNS_HALF.forEach((s, i) => s.ore.forEach(([x, y], j) => {
    const sp = half[i], r0 = j ? 3.1 : 3.4, dx = x * S96 - sp.cx, dy = y * S96 - sp.cy, d = Math.hypot(dx, dy) || 1;
    const far = Math.max(d, BASE_CLEAR + r0 * 0.5), lo = r0 + 4.5, hi = MAP - 1 - lo;
    fieldsHalf.push({ cx: Math.max(lo, Math.min(hi, sp.cx + dx / d * far)), cy: Math.max(lo, Math.min(hi, sp.cy + dy / d * far)), r: r0, rich: j ? 0.95 : 1.05 });
  }));
  for (const [t, d, rad, rich, gem] of [
    [-10, 12.5, 3, 1.15],          // forward fields on the lake shores, between the crossings
    [10, 12.5, 2.4, 1, true],      // the rare gem field, out in the contested middle
  ]) { const [cx, cy] = at(t * K, d * K); fieldsHalf.push({ cx, cy, r: rad, rich, gem }); }
  const fields = [];
  for (const f of fieldsHalf) fields.push({ ...f, gem: !!f.gem }, { ...f, cx: MAP - 1 - f.cx, cy: MAP - 1 - f.cy, gem: !!f.gem });
  G.oreFields = fields;

  // Routes to keep open (cell polylines on the lower-left side, mirrored).
  const hub = at(0, 17 * K), mid = at(0, 0);
  const bridgeIn = (sg) => [at(sg * BRIDGE_T, 21 * K), at(sg * BRIDGE_T, 0)];
  const endIn = (sg) => [at(sg * 33 * K, 24 * K), at(sg * 39 * K, 0)];
  const P = (s) => [s.cx, s.cy];
  const routes = [[hub, mid]];
  for (const s of half) {
    routes.push([P(s), hub]);
    const sg = LT(s.cx, s.cy) < MID ? -1 : 1;   // to the nearer bridge
    routes.push([P(s), ...bridgeIn(sg)]);
  }
  routes.push([P(half[1]), ...endIn(-1)], [P(half[2]), ...endIn(1)], [P(half[0]), P(half[1])], [P(half[0]), P(half[2])], [P(half[1]), P(half[3])], [P(half[2]), P(half[3])]);
  const routeCells = new Uint8Array(NCELLS);
  const markRoute = (pts, w) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
      for (let k = 0; k <= n; k++) {
        const x0 = ax + (bx - ax) * k / n, y0 = ay + (by - ay) * k / n;
        for (const [x, y] of [[x0, y0], [MAP - 1 - x0, MAP - 1 - y0]]) {
          for (let oy = -w; oy <= w; oy++) for (let ox = -w; ox <= w; ox++) {
            const cx = Math.round(x + ox), cy = Math.round(y + oy);
            if (inMap(cx, cy) && Math.hypot(ox, oy) <= w) routeCells[idx(cx, cy)] = 1;
          }
        }
      }
    }
  };
  for (const rt of routes) markRoute(rt, 1.8);
  // A lane from every ore field (lower-left side; mirrored) to the nearest road or start position,
  // so woods never wall a field in.
  const anchors = [hub, mid, ...half.map(P), ...[-1, 1].flatMap((sg) => bridgeIn(sg))];
  for (const f of fieldsHalf) {
    const a = anchors.reduce((p, q) => (Math.hypot(q[0] - f.cx, q[1] - f.cy) < Math.hypot(p[0] - f.cx, p[1] - f.cy) ? q : p));
    markRoute([[f.cx, f.cy], a], 1.5);
  }
  const nearField = (cx, cy, pad) => fields.some((f) => Math.hypot(cx - f.cx, cy - f.cy) < f.r + pad);
  const nearBase = (cx, cy, rad) => spawns.some((s) => Math.hypot(cx - s.cx, cy - s.cy) < rad);
  const keepClear = (cx, cy) => routeCells[idx(cx, cy)] || nearField(cx, cy, 1.5) || nearBase(cx, cy, BASE_CLEAR);

  // Shoreline, lakes and bridges, computed on the lower-left side (d >= 0) and mirrored.
  G.bridges = [];
  for (let cy = 0; cy < MAP; cy++) for (let cx = 0; cx < MAP; cx++) {
    if (cy < cx) continue;
    const t = LT(cx, cy), d = LD(cx, cy), at = Math.abs(t - MID);
    const edge = Math.min(cx, cy, MAP - 1 - cx, MAP - 1 - cy);
    const along = (cx + cy) / 2 + (cy - cx) * 0.7;   // position round the coast
    let v = 0;
    if (edge < 2.6 + coastW(along / 4.5)) v = 4;
    const halfW = LAKE_W + lakeW(t / 2.9) + lakeW((t + d * 1.7) / 2.2) * 0.45 - Math.max(0, (at - (LAKE_OUT - 4)) * 1.4) - Math.max(0, (LAKE_IN + 3 - at) * 1.2);
    if (at > LAKE_IN && at < LAKE_OUT + lakeEnd(t / 22) && d < halfW && edge > 6) v = 4;
    if (v === 4 && Math.abs(at - BRIDGE_T) < 1.3 && d < LAKE_W + 3 && edge > 5) v = 5;
    if (v) set(cx, cy, v);
  }
  for (const sgn of [-1, 1]) {
    const tb = MID + sgn * BRIDGE_T, w = LAKE_W + 2.8;
    const a = { x: (LX(tb, w) + 0.5) * CELL, y: (LY(tb, w) + 0.5) * CELL }, b = { x: (LX(tb, -w) + 0.5) * CELL, y: (LY(tb, -w) + 0.5) * CELL };
    G.bridges.push({ a, b, w: 3.4 * CELL });
  }

  // Dressing: clumps of forest, woods along the coast and lake shores, patches of open earth,
  // rock outcrops.
  const halfPt = () => { let x, y; do { x = 2 + r() * (MAP - 4); y = 2 + r() * (MAP - 4); } while (y < x); return [x, y]; };
  const blob = (x0, y0, rad, v, density) => {
    for (let y = Math.floor(y0 - rad - 1); y <= y0 + rad + 1; y++) for (let x = Math.floor(x0 - rad - 1); x <= x0 + rad + 1; x++) {
      if (!inMap(x, y) || T[idx(x, y)] >= 4) continue;
      const dd = Math.hypot(x - x0, (y - y0) * 1.15) + (r() - 0.5) * 1.6;
      if (dd < rad && r() < density && !keepClear(x, y) && !keepClear(MAP - 1 - x, MAP - 1 - y)) set(x, y, v);
    }
  };
  const shore = (cx, cy) => [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [0, 2], [-2, 0], [0, -2]].some(([ox, oy]) => inMap(cx + ox, cy + oy) && T[idx(cx + ox, cy + oy)] === 4);
  for (let i = 0; i < 14 * S96 * S96; i++) blob(...halfPt(), 1.5 + r() * 3, 1, 0.9);
  // Forest clumps: a few overlapping blobs each, so they grow into irregular stands of trees.
  for (let i = 0; i < 24 * S96 * S96; i++) {
    let [x, y] = halfPt();
    const n = 2 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      blob(x, y, 2 + r() * 3, 2, 0.88 + r() * 0.1);
      const a = r() * Math.PI * 2; x += Math.cos(a) * (2 + r() * 2.5); y += Math.sin(a) * (2 + r() * 2.5);
    }
  }
  for (let i = 0; i < 36 * S96 * S96; i++) {
    let [x, y] = halfPt();
    if (!shore(Math.round(x), Math.round(y)) && r() < 0.8) continue;
    blob(x, y, 1.6 + r() * 2.6, 2, 0.8);
  }
  for (let i = 0; i < 9 * S96 * S96; i++) {
    let [x, y] = halfPt(); x = Math.floor(x); y = Math.floor(y);
    const len = 3 + Math.floor(r() * 5), dx = r() < 0.5 ? 1 : 0, dy = 1 - dx;
    for (let k = 0; k < len; k++) { if (inMap(x, y) && T[idx(x, y)] < 2 && !keepClear(x, y) && !keepClear(MAP - 1 - x, MAP - 1 - y)) set(x, y, 3); x += dx + (r() < 0.25 ? 1 : 0); y += dy + (r() < 0.25 ? 1 : 0); }
  }

  // Dirt roads: the main road over the centre gap, and a track from each start position to it.
  G.road = [];
  const lay = (pts) => {
    const line = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.ceil(Math.hypot(bx - ax, by - ay) * 4);
      for (let k = 0; k < n + (i === pts.length - 2 ? 1 : 0); k++) {
        const x = ax + (bx - ax) * k / n, y = ay + (by - ay) * k / n;
        line.push({ x: (x + 0.5) * CELL, y: (y + 0.5) * CELL });
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const cx = Math.round(x + ox), cy = Math.round(y + oy);
          if (inMap(cx, cy) && Math.hypot(ox, oy) <= 1.2 && T[idx(cx, cy)] < 4) T[idx(cx, cy)] = 1;
        }
      }
    }
    G.road.push(line);
  };
  const bend = (a, b, k, amt) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, o = (r() - 0.5) * 2 * amt; return [a[0] + dx * k - dy / l * o, a[1] + dy * k + dx / l * o]; };
  const flip = ([x, y]) => [MAP - 1 - x, MAP - 1 - y];
  const spine = [hub, at(1.5, 11 * K), at(-1, 5 * K), mid];
  lay(spine.concat(spine.slice(0, -1).reverse().map(flip)));
  for (const s of half) {
    if (Math.hypot(s.cx - hub[0], s.cy - hub[1]) < 6) continue;
    const pts = [P(s), bend(P(s), hub, 0.35, 2), bend(P(s), hub, 0.7, 2), hub];
    lay(pts); lay(pts.map(flip));
  }
  // Earth around each start position, as if the ground had been cleared for it.
  for (const s of half) blob(s.cx + 0.5, s.cy - 0.5, 6.5, 1, 0.7);
  for (const s of half) for (let y = s.cy - 7; y <= s.cy + 7; y++) for (let x = s.cx - 7; x <= s.cx + 7; x++) if (inMap(x, y) && T[idx(x, y)] === 0 && Math.hypot(x - s.cx, y - s.cy) < 5.5 + r() * 1.5) set(x, y, 1);

  for (let i = 0; i < NCELLS; i++) G.block[i] = T[i] >= 2 && T[i] <= 4 ? 1 : 0;

  // Safety net: if the dressing ever walls a start position off, cut a road straight through
  // toward the middle.
  for (const s of spawns) {
    if (connected(idx(s.cx, s.cy), idx(Math.round(mid[0]), Math.round(mid[1])))) continue;
    for (let k = 0; k <= 100; k++) {
      const x = Math.round(s.cx + (mid[0] - s.cx) * k / 100), y = Math.round(s.cy + (mid[1] - s.cy) * k / 100);
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1]]) if (inMap(x + ox, y + oy)) { const c = idx(x + ox, y + oy); if (T[c] !== 5) T[c] = T[c] === 4 ? 5 : 1; G.block[c] = 0; }
    }
  }
  for (const f of fields) {
    for (let y = Math.floor(f.cy - f.r); y <= f.cy + f.r; y++) {
      for (let x = Math.floor(f.cx - f.r); x <= f.cx + f.r; x++) {
        if (!inMap(x, y)) continue;
        const d = Math.hypot(x - f.cx, y - f.cy);
        if (d > f.r) continue;
        const c = idx(x, y);
        if (T[c] >= 4) continue;
        if (G.block[c]) { G.block[c] = 0; T[c] = 0; }
        G.ore[c] = Math.round(Math.min(ORE_MAX * ORE_START, (60 + (1 - d / f.r) * 190) * f.rich * ORE_START));
        if (f.gem) G.gem[c] = 1;
      }
    }
  }
  // Last safety net: any ore field still cut off from the bases gets a track cleared through the
  // trees and rocks to the nearest open ground that connects (on both sides of the map).
  const reach = () => {
    const seen = new Uint8Array(NCELLS), q = [idx(spawns[0].cx, spawns[0].cy)];
    seen[q[0]] = 1;
    for (let i = 0; i < q.length; i++) {
      const c = q[i];
      for (let k = 0; k < 4; k++) { const x = cellX(c) + DIRS8[k][0], y = cellY(c) + DIRS8[k][1]; if (!inMap(x, y)) continue; const n = idx(x, y); if (!seen[n] && !G.block[n]) { seen[n] = 1; q.push(n); } }
    }
    return seen;
  };
  const open = (x, y) => {
    for (const [px, py] of [[x, y], [MAP - 1 - x, MAP - 1 - y]]) {
      if (!inMap(px, py)) continue;
      const c = idx(px, py);
      if (T[c] === 2 || T[c] === 3) { T[c] = 1; G.block[c] = 0; }
    }
  };
  let R = reach();
  for (const f of fields) {
    const cells = [];
    for (let y = Math.floor(f.cy - f.r); y <= f.cy + f.r; y++) for (let x = Math.floor(f.cx - f.r); x <= f.cx + f.r; x++) if (inMap(x, y) && G.ore[idx(x, y)]) cells.push(idx(x, y));
    if (!cells.length || cells.some((c) => R[c])) continue;
    const from = new Int32Array(NCELLS).fill(-1), q = cells.slice();
    for (const c of cells) from[c] = c;
    let hit = -1;
    for (let i = 0; i < q.length && hit < 0; i++) {
      const c = q[i];
      for (let k = 0; k < 4; k++) {
        const x = cellX(c) + DIRS8[k][0], y = cellY(c) + DIRS8[k][1];
        if (!inMap(x, y)) continue;
        const n = idx(x, y);
        if (from[n] >= 0 || T[n] === 4) continue;
        from[n] = c;
        if (R[n]) { hit = n; break; }
        q.push(n);
      }
    }
    for (let c = hit; c >= 0 && from[c] !== c; c = from[c]) { const x = cellX(c), y = cellY(c); open(x, y); open(x + 1, y); open(x, y + 1); }
    R = reach();
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
    if (++expanded > 14000) break;
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
  u.path = null; u.pathIdx = 0; u.stuckN = 0; u.nearBest = null;
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

// How close counts as arrived. Alone, a unit walks right up to the point; when friendly units
// already stand there it stops at the edge of the crowd instead of shoving into it, and a unit
// that is close but has stopped getting any closer for a couple of seconds settles where it is.
function arriveRadius(u, p, d) {
  if (d > CELL * 4 || u.def.harvester) { u.nearBest = null; return 3; }   // Ore Trucks must reach the exact spot to mine or dock
  if ((u.crowdT = (u.crowdT || 0) - 1) <= 0) {
    u.crowdT = 8;   // recount every few steps
    let n = 0;
    for (const e of G.entities) {
      if (e === u || !e.alive || e.kind !== 'unit' || e.team !== u.team || e.cls === 'air' || e.dest) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) < CELL * 2.5) n++;
    }
    u.crowdR = n ? 6 + Math.sqrt(n) * 11 : 3;
  }
  if (!u.nearBest || d < u.nearBest.d - 2) u.nearBest = { d, t: G.t };
  else if (G.t - u.nearBest.t > 2) return Infinity;   // no closer for two seconds
  return u.crowdR;
}

// Follows the current path. Returns true once there is nowhere left to go.
function followPath(u, dt) {
  if (!u.dest) return true;
  if (u.needPath || !u.path) return false;
  if (u.pathIdx >= u.path.length) { u.dest = null; return true; }
  const p = u.path[u.pathIdx], last = u.pathIdx === u.path.length - 1;
  const dx = p.x - u.x, dy = p.y - u.y, d = Math.hypot(dx, dy);
  if (d < (last ? arriveRadius(u, p, d) : 7)) {
    u.pathIdx++;
    if (u.pathIdx >= u.path.length) {
      // Settled short of the exact point (beside a crowd): guard from here, not from the point.
      if (d > 3 && u.order.type === 'guard' && Math.hypot(u.order.x - p.x, u.order.y - p.y) < CELL) { u.order.x = u.x; u.order.y = u.y; }
      u.dest = null; return true;
    }
    return false;
  }
  const want = Math.atan2(dy, dx);
  let speed = u.def.speed, mx, my;
  // Keep to the group's pace, except to catch up with a slot left far behind.
  if (u.groupSpeed && u.order.type === 'hunt' && !u.target && !(u.group && u.slotFar)) speed = Math.min(speed, u.groupSpeed);
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
  if (d.cls === 'air') { u.ammo = d.weapon ? d.weapon.ammo : 0; u.aam = d.weapon2 ? d.weapon2.ammo : 0; u.bombs = d.bombs || 0; u.flares = d.flares || 0; u.alt = 0; u.as = 'takeoff'; u.rt = 0; u.passT = 0; u.speedCur = 0; }
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
    if (e.kind === 'bld') score += e.def.weapon ? 15 : 60;   // defences before harmless structures
    else if (!e.def.weapon && !e.def.harvester) score += 20;
    if (score < bs) { bs = score; best = e; }
  }
  return best;
}

// Where attacking units head: the enemy Construction Yard, or failing that the nearest structure.
function nearestEnemyBuilding(u) {
  // Raiding an outlying site: stay on it, finish off what else stands there, then move on.
  if (u.focus) {
    if (u.focus.alive) return u.focus;
    const f = u.focus;
    let nb = null, nd = CELL * 9;
    for (const e of G.entities) {
      if (!e.alive || e.kind !== 'bld' || e.team === u.team) continue;
      const d = Math.hypot(e.x - f.x, e.y - f.y);
      if (d < nd) { nd = d; nb = e; }
    }
    u.focus = nb;
    if (nb) return nb;
  }
  let best = null, bd = Infinity, cy = null, cd = Infinity;
  for (const e of G.entities) {
    if (!e.alive || e.kind !== 'bld' || e.team === u.team) continue;
    const d = dist(u, e);
    if (d < bd) { bd = d; best = e; }
    if (e.type === 'cy' && d < cd) { cd = d; cy = e; }
  }
  if (u.raider) return u.huntTarget && u.huntTarget.alive ? u.huntTarget : best;
  return cy || best;
}

// New units spread out to random open spots around their base. Auto attack sends them out
// together once this many are waiting, each heading for the enemy at its own top speed.
const GROUP_SIZE = 10;
// A random open spot inside the build area: beside one of the side's buildings, off ore, roads
// out of factories and refinery docks, picked from a few tries as the one with the fewest units.
function scatterSpot(team) {
  const mine = buildingsOf(team.id).filter((b) => !b.def.defense);
  if (!mine.length) return rallyPoint(team);
  let best = null, bn = Infinity;
  for (let k = 0; k < 14; k++) {
    const b = mine[Math.floor(Math.random() * mine.length)], a = Math.random() * Math.PI * 2;
    const reach = (Math.max(b.w, b.h) / 2 + 1 + Math.random() * 4) * CELL;
    const x = b.x + Math.cos(a) * reach, y = b.y + Math.sin(a) * reach, c = cellOfPos(x, y);
    if (!inMap(cellX(c), cellY(c)) || !freeCell(c) || G.ore[c] || G.resv[c]) continue;
    let crowded = false;
    for (const e of mine) if (e.def.exit && e.exitCell !== undefined && Math.hypot(cellX(c) - cellX(e.exitCell), cellY(c) - cellY(e.exitCell)) < 2.5) crowded = true;
    if (crowded) continue;
    let n = 0;
    for (const u of G.entities) if (u.alive && u.kind === 'unit' && u.team === team.id && u.cls !== 'air' && Math.hypot(u.x - x, u.y - y) < CELL * 2.5) n++;
    if (n < bn) { bn = n; best = cellCenter(c); }
    if (n === 0 && k >= 4) break;
  }
  return best || rallyPoint(team);
}
const inBase = (team, u) => buildingsOf(team.id).some((b) => distTo(u, b) < CELL * 12);
function rallyPoint(team) {
  const e = enemyOf(team).start, s = team.start;
  const a = Math.atan2(e.cy - s.cy, e.cx - s.cx);
  return { x: (s.cx + 0.5 + Math.cos(a) * 7) * CELL, y: (s.cy + 0.5 + Math.sin(a) * 7) * CELL };
}
// Switching Auto Attack on sends every idle armed ground unit at once, wherever it stands (units
// busy defending, or on a move or attack order, carry on); after that new units go out in batches.
function launchAll(team) {
  const idle = unitsOf(team.id).filter((u) => u.def.weapon && !u.def.harvester && !u.def.scripted && !u.chute && !u.defending && !u.homeward &&
    u.cls !== 'air' && u.order.type === 'guard');
  for (const u of idle) { setHunt(u); u.staged = false; }
  return idle.length;
}
function launchGroups() {
  for (const team of G.teams) {
    defendBase(team);
    const rally = rallyPoint(team);
    const waiting = G.entities.filter((u) => u.alive && u.kind === 'unit' && u.team === team.id && u.staged && !u.defending && !u.def.harvester && (u.def.weapon || u.cls === 'air') && u.order.type === 'guard');
    // Aircraft do not wait for a group: each one heads out on its own.
    if (team.auto) for (const u of waiting) if (u.cls === 'air' && !u.interceptor) launchAircraft(u);
    const ready = waiting.filter((u) => u.cls !== 'air' && !u.dest && inBase(team, u));
    team.waiting = ready.length;
    // The computer plans its own waves (sizes, formations, routes, targets): see aiLaunch.
    if (team.isAI && team.auto) { aiLaunch(team, ready); continue; }
    if (!team.auto || ready.length < GROUP_SIZE) continue;
    // Each heads straight out from where it waits, at its own top speed, fighting what it meets.
    for (const u of ready) { setHunt(u); u.staged = false; }
    // Most waves go for the main base; one in three raids an outlying Outpost or refinery.
    team.waves = (team.waves || 0) + 1;
    const exp = expansionsOf(enemyOf(team), rally);
    const raid = exp.length && team.waves % 3 === 0 ? exp[0] : null;
    if (raid) for (const u of ready) u.focus = raid;
    team.waiting = 0;
    if (team.id === PLAYER) hooks.eva('Attack group moving out');
  }
}

// A side's outlying sites: Outposts and refineries well away from its Construction Yard, nearest
// to `from` first, Outposts before refineries.
function expansionsOf(team, from) {
  const cy = G.entities.find((e) => e.alive && e.team === team.id && e.type === 'cy');
  if (!cy) return [];
  return buildingsOf(team.id).filter((b) => (b.type === 'outpost' || b.type === 'refinery') && dist(b, cy) > CELL * 14)
    .sort((a, b) => (a.type !== 'outpost') - (b.type !== 'outpost') || dist(a, from) - dist(b, from));
}
function launchAircraft(u) {
  setHunt(u);
  u.staged = false;
  const exp = expansionsOf(enemyOf(G.teams[u.team]), u);
  if (exp.length && Math.random() < 1 / 3) u.focus = exp[0];
  if (u.as === 'landed' && !airEmpty(u)) u.as = 'takeoff';
}

// Enemies near or inside a base (paratroopers, flanking squads), or shooting at an Ore Truck,
// are met by idle units close enough to help, on either side and with auto attack on or off,
// only as many as it takes. The computer also recalls attack waves still on its own half. Units
// the player has sent somewhere are left alone. Each defender goes for the nearest raider it can
// hit; once the area has been quiet for a few seconds, defenders return to where they were waiting.
// Runs once a second.
const DEFEND_CALM = 4;
function defendBase(team) {
  const mine = buildingsOf(team.id);
  // Measured from building edges, so a big base is covered all the way round.
  const nearBase = (u, r) => mine.some((b) => distTo(u, b) < CELL * r);
  const hh = team.harvHit && team.harvHit.until > G.t ? team.harvHit : null;
  const nearHarv = (u, r) => hh && Math.hypot(u.x - hh.x, u.y - hh.y) < CELL * r;
  const bh = team.baseHit && team.baseHit.until > G.t ? team.baseHit : null;
  const nearShooter = (u) => bh && Math.hypot(u.x - bh.x, u.y - bh.y) < CELL * 8;
  // Once fighting has started the zone widens, so raiders stepping back do not end the defence.
  const zone = team.defending ? 18 : 14;
  const threats = unitsOf(enemyOf(team).id).filter((u) => !isAirborne(u) && !u.def.harvester && !u.def.scripted && !u.chute &&
    (nearBase(u, zone) || nearHarv(u, 9) || nearShooter(u)));
  // Only an Ore Truck under fire, away from the base: a few units close to it go to help.
  const truckOnly = threats.length && !threats.some((u) => nearBase(u, zone) || nearShooter(u));
  const idle = (u) => u.order.type === 'guard' && (nearBase(u, 16) || nearHarv(u, truckOnly ? 16 : 24) || nearShooter(u));
  // The computer also recalls attack waves still on its own half of the map; past halfway they press on.
  const ecy = buildingsOf(enemyOf(team).id).find((b) => b.type === 'cy'), own = mine.find((b) => b.type === 'cy');
  const homeHalf = (u) => !ecy || !own || dist(u, own) < dist(u, ecy);
  let army = unitsOf(team.id).filter((u) => u.def.weapon && !u.def.harvester && !u.def.scripted && !u.chute && !u.homeward &&
    (u.cls !== 'air' || (!airEmpty(u) && u.order.type === 'guard')) &&
    (u.defending || idle(u) || (team.isAI && u.cls !== 'air' && !truckOnly && homeHalf(u))));
  if (!threats.length) {
    if (!team.defending || ++team.calm < DEFEND_CALM) return;
    team.defending = false;
    for (const u of army) {
      if (!u.defending) continue;
      u.defending = false;
      const h = u.post;
      setGuard(u, h.x, h.y); u.staged = h.staged; u.order.pad = h.pad;
      if (u.cls !== 'air') goTo(u, h.x, h.y);
    }
    return;
  }
  team.defending = true; team.calm = 0;
  // The computer remembers which way attacks come from, to put new defences there.
  const cy = mine.find((b) => b.type === 'cy');
  if (team.isAI && cy && G.t - (team.fromT || -99) > 5) {
    team.fromT = G.t;
    const t = threats.reduce((a, b) => (dist(a, cy) < dist(b, cy) ? a : b));
    (team.attackFrom = team.attackFrom || []).push(Math.atan2(t.y - cy.y, t.x - cy.x));
    if (team.attackFrom.length > 8) team.attackFrom.shift();
  }
  // Either side sends only what it takes: those already defending, then the nearest others,
  // until they are worth half again as much as the raiders (a few at most for a truck).
  const worth = (u) => u.def.cost || 300;
  const need = threats.reduce((a, t) => a + worth(t), 0) * 1.5;
  const near = (u) => Math.min(...threats.map((t) => Math.hypot(u.x - t.x, u.y - t.y)));
  army = army.filter((u) => threats.some((t) => canTarget(u, t)));
  army.sort((a, b) => (b.defending - a.defending) || near(a) - near(b));
  let got = 0, picked = [];
  for (const u of army) {
    if (got >= need || (truckOnly && picked.length >= 4)) { if (!u.defending) continue; }
    picked.push(u); got += worth(u);
  }
  army = picked;
  for (const u of army) {
    let best = null, bd = CELL * 32;
    for (const t of threats) { const d = Math.hypot(u.x - t.x, u.y - t.y); if (d < bd && canTarget(u, t)) { bd = d; best = t; } }
    if (!best) continue;
    if (!u.defending) {
      // Remember where to return: the guard spot, or for attack groups already out, the rally point.
      const r = rallyPoint(team), g = u.order.type === 'guard';
      u.post = { x: g ? u.order.x : r.x, y: g ? u.order.y : r.y, staged: u.staged || (team.isAI && !g), pad: g && u.order.pad };
    }
    u.defending = true; u.staged = false;
    if (u.target === best || (u.target && u.target.alive && threats.includes(u.target))) continue;
    setGuard(u, best.x, best.y); u.target = best;
    if (u.cls !== 'air') goTo(u, best.x, best.y);
  }
}

// --- Attack-group formations ----------------------------------------------------
// A group follows one route, led by an invisible marker. Every unit keeps its own slot in a
// formation around the marker (tanks in front, infantry behind), so the group moves spread
// out instead of in single file, squeezing through gaps and fanning out again after.
// The player's groups march in a block; the computer picks a shape for each wave, and can send
// a wave by way of a chosen crossing (`via`).
const SLOT_GAP = 32, ROW_GAP = 28;
function formationSlots(form, n, spread) {
  const S = SLOT_GAP * spread, R = ROW_GAP * spread, out = [];
  for (let i = 0; i < n; i++) {
    let side, back;
    if (form === 'line') { side = (i - (n - 1) / 2) * S * 0.9; back = 0; }                         // line abreast
    else if (form === 'column') { side = ((i % 2) - 0.5) * S * 0.8; back = Math.floor(i / 2) * R; }   // two files
    else if (form === 'wedge') { const k = Math.ceil(i / 2); side = (i % 2 ? -1 : 1) * k * S * 0.75; back = k * R * 0.9; }   // arrowhead
    else if (form === 'echelon') { side = (i - (n - 1) / 2) * S * 0.7; back = i * R * 0.55; }         // staggered diagonal
    else if (form === 'skirmish') {                                                                   // loose, uneven spread
      const cols = Math.max(3, Math.ceil(Math.sqrt(n * 2))), row = Math.floor(i / cols);
      side = (i % cols - (Math.min(cols, n - row * cols) - 1) / 2) * S * 1.45 + (Math.random() - 0.5) * 14;
      back = row * R * 1.5 + (Math.random() - 0.5) * 14;
    } else {                                                                                          // block
      const cols = Math.min(n, Math.max(3, Math.ceil(Math.sqrt(n * 2)))), row = Math.floor(i / cols);
      side = (i % cols - (Math.min(cols, n - row * cols) - 1) / 2) * S; back = row * R;
    }
    out.push({ side, back });
  }
  return out;
}
function makeGroup(team, units, target, pace, opts) {
  opts = opts || {};
  let x = 0, y = 0;
  for (const u of units) { x += u.x; y += u.y; }
  x /= units.length; y /= units.length;
  if (opts.from) { x = opts.from.x; y = opts.from.y; }   // muster at the rally point, then march
  let path = null;
  if (opts.via) {
    const a = findPath(x, y, opts.via.x, opts.via.y, 10), b = a && findPath(opts.via.x, opts.via.y, target.x, target.y, 10);
    if (a && b) path = a.concat(b);
  }
  path = path || findPath(x, y, target.x, target.y, 10) || [{ x: target.x, y: target.y }];
  const g = { team: team.id, units: units.slice(), x, y, a: Math.atan2(path[0].y - y, path[0].x - x), target, pace: pace * 0.9, path, i: 0,
    form: opts.form || 'block', strike: opts.strike || null };
  g.units.sort((a, b) => (a.cls === 'inf') - (b.cls === 'inf') || b.def.hp - a.def.hp);
  const slots = formationSlots(g.form, g.units.length, opts.spread || 1);
  g.units.forEach((u, i) => { u.slot = slots[i]; u.group = g; u.slotGoal = null; });
  G.groups.push(g);
  return g;
}
// Where a unit's slot is right now, nudged ahead so units keep rolling instead of stopping
// every few steps. Slots that fall on rocks or water collapse onto the route itself.
function slotPos(u) {
  const g = u.group, fx = Math.cos(g.a), fy = Math.sin(g.a);
  const x = g.x - fx * u.slot.back - fy * u.slot.side, y = g.y - fy * u.slot.back + fx * u.slot.side;
  const ok = passableAt(x, y);
  return { x: (ok ? x : g.x) + fx * 26, y: (ok ? y : g.y) + fy * 26 };
}
function updateGroups(dt) {
  for (const g of G.groups) {
    g.units = g.units.filter((u) => {
      const keep = u.alive && u.group === g && u.order.type === 'hunt';
      if (!keep && u.group === g) u.group = null;   // given other orders: out of the formation
      return keep;
    });
    // Arrived (or nothing left to lead): units fight on their own from here.
    if (!g.units.length || !g.target.alive || g.i >= g.path.length || Math.hypot(g.target.x - g.x, g.target.y - g.y) < CELL * 6) {
      for (const u of g.units) { u.group = null; if (g.raid) u.focus = g.target; }
      g.done = true;
      continue;
    }
    // Passing close to an enemy Outpost or outlying refinery: divert and destroy it first.
    if (!g.raid && (g.scanT = (g.scanT || 0) - dt) <= 0) {
      g.scanT = 1;
      const near = expansionsOf(enemyOf(G.teams[g.team]), g).find((b) => Math.hypot(b.x - g.x, b.y - g.y) < CELL * 10);
      if (near) {
        g.target = near; g.raid = true;
        g.path = findPath(g.x, g.y, near.x, near.y, 10) || [{ x: near.x, y: near.y }]; g.i = 0;
        for (const u of g.units) { u.focus = near; u.slotGoal = null; }
      }
    }
    // Closing in on the target: call in the Airfield powers held back for this push.
    if (g.strike && Math.hypot(g.target.x - g.x, g.target.y - g.y) < CELL * 22) {
      const team = G.teams[g.team];
      for (const key of g.strike) launchPower(team, key, g.target.x, g.target.y + (key === 'para' ? CELL * 3 : 0));
      g.strike = null; team.holdFor = null;
    }
    // Hold the marker back while the group is strung out or busy fighting.
    let err = 0, fighting = 0;
    for (const u of g.units) {
      const fx = Math.cos(g.a), fy = Math.sin(g.a);
      err += Math.hypot(u.x - (g.x - fx * u.slot.back - fy * u.slot.side), u.y - (g.y - fy * u.slot.back + fx * u.slot.side));
      if (u.target) fighting++;
    }
    err /= g.units.length;
    const p = g.path[g.i], dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy);
    if (d < 8) { g.i++; continue; }
    g.a = turnToward(g.a, Math.atan2(dy, dx), 1.2 * dt);
    const k = fighting > 0 ? 0 : err > 70 ? 0.15 : err > 40 ? 0.5 : 1;
    const step = Math.min(d, g.pace * k * dt);
    g.x += (dx / d) * step; g.y += (dy / d) * step;
  }
  if (G.groups.some((g) => g.done)) G.groups = G.groups.filter((g) => !g.done);
}

function setGuard(u, x, y) {
  u.order = { type: 'guard', x: x === undefined ? u.x : x, y: y === undefined ? u.y : y };
  u.target = null; u.groupSpeed = 0; u.group = null; u.raider = false;
}
function setHunt(u) { u.order = { type: 'hunt' }; u.target = null; u.huntTarget = null; u.group = null; u.focus = null; }

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
  if (t.cls === 'inf' && !t.moving && t.stance === 'prone') return t.y - 2;
  if (t.cls === 'inf' && !t.moving && t.stance === 'crouch') return t.y - 5;
  return t.y - (t.alt || 0) - (t.cls === 'inf' ? 8 : 4);
}

function weaponSound(src, w) {
  if (w.proj === 'bullet') return src.cls === 'inf' ? 'rifle' : 'mg';
  if (w.proj === 'grenade') return 'throw';
  if (w.proj === 'fireball') return 'flame';
  if (w.proj === 'shell') return src.kind === 'bld' ? 'turretGun' : w.twin ? 'cannonHeavy' : 'cannon';
  if (w.proj === 'artyshell') return 'cannonHeavy';
  if (w.proj === 'v2') return 'missile';
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
  } else if (w.proj === 'artyshell' || w.proj === 'v2') {
    // Artillery shells and V2 rockets climb high and come down where the target stood, a little
    // off: they hit what is standing still and can miss what is moving.
    const sp = w.spread, tx = t.x + (Math.random() - 0.5) * sp, tgy = t.y + (Math.random() - 0.5) * sp * 0.7;
    const d = Math.hypot(tx - src.x, tgy - src.y), v2 = w.proj === 'v2';
    G.projectiles.push({ kind: 'lob', style: w.proj, x: m.x, y: m.y, sx: m.x, sy: src.y, tx, ty: tgy, t: 0, dur: Math.max(0.6, d / (v2 ? 150 : 230)),
      h: 30 + d * (v2 ? 0.5 : 0.32), z: src.y - m.y, w, from: src, team: src.team, smokeT: 0 });
    if (!v2) G.effects.push({ type: 'smoke', x: m.x, y: m.y, r: 4, t: 0, life: 0.8, alpha: 0.5, color: '#c9c7c0', vy: -8 });   // muzzle smoke
    else {
      // Launch: flame and a great cloud of exhaust billowing out behind and around the truck.
      const bx = Math.cos(src.face), by = Math.sin(src.face);
      G.effects.push({ type: 'expl', x: src.x - bx * 10, y: src.y - by * 10 - 6, size: 7, t: 0, life: 0.35, seed: (Math.random() * 1e6) | 0 });
      for (let i = 0; i < 14; i++) {
        const a = Math.atan2(-by, -bx) + (Math.random() - 0.5) * 2.2, sp = 14 + Math.random() * 30;
        G.effects.push({ type: 'smoke', x: src.x - bx * 10 + (Math.random() - 0.5) * 6, y: src.y - by * 10 + (Math.random() - 0.5) * 4, r: 4 + Math.random() * 3, t: -i * 0.04,
          life: 2 + Math.random() * 1.2, alpha: 0.6, color: '#c9c7c0', vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - 3, drag: 1.4 });
      }
    }
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
    if (w.proj === 'flak') {
      // Most of a flak barrage bursts around the target rather than on it.
      const d = Math.hypot(t.x - m.x, ty - m.y), eta = d / PROJ_SPEED.flak;
      for (let i = 0; i < 2; i++) { const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 18; flakBurst(t.x + Math.cos(a) * r, ty + Math.sin(a) * r * 0.7, eta + 0.05 + Math.random() * 0.25); }
    }
    if (src.kind === 'bld' && src.type === 'sam') {
      // Backblast: smoke billows out behind the launcher as the missile leaves.
      const bx = Math.cos(src.tface), by = Math.sin(src.tface);
      G.effects.push({ type: 'expl', x: m.x - bx * 6, y: m.y - by * 6, size: 5, t: 0, life: 0.25, seed: (Math.random() * 1e6) | 0 });
      for (let i = 0; i < 10; i++) {
        const sp = 22 + Math.random() * 30, a = Math.atan2(-by, -bx) + (Math.random() - 0.5) * 1.3;
        G.effects.push({ type: 'smoke', x: m.x - bx * 8, y: m.y - by * 8, r: 4 + Math.random() * 3, t: -i * 0.03, life: 1.8 + Math.random() * 1, alpha: 0.7, color: '#9a968c', vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - 4, drag: 1.5 });
      }
    }
    const shots = w.twin ? 2 : 1;
    for (let i = 0; i < shots; i++) {
      const off = shots > 1 ? (i ? 2 : -2) : 0;
      G.projectiles.push({ x: m.x + off * Math.sin(src.tface || 0), y: m.y - off * Math.cos(src.tface || 0), target: t, w, from: src, team: src.team,
        speed: PROJ_SPEED[w.proj] || 400, kind: w.proj, trail: 0, delay: i * 0.1, thick: src.kind === 'bld' && src.type === 'sam' });
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
    if (p.kind === 'lob') {
      p.t += dt;
      const k = Math.min(1, p.t / p.dur), px = p.x, py = p.y;
      p.gx = p.sx + (p.tx - p.sx) * k; p.gy = p.sy + (p.ty - p.sy) * k;
      p.x = p.gx; p.y = p.gy - (p.z * (1 - k) + p.h * 4 * k * (1 - k));
      p.a = Math.atan2(p.y - py, p.x - px);
      if ((p.smokeT -= dt) <= 0) {
        p.smokeT = p.style === 'v2' ? 0.025 : 0.07;
        G.effects.push({ type: 'smoke', x: p.x, y: p.y, r: p.style === 'v2' ? 3.2 : 1.4, t: 0, life: p.style === 'v2' ? 2.6 : 0.6, alpha: p.style === 'v2' ? 0.55 : 0.3, color: '#c9c7c0', vx: p.style === 'v2' ? 2 : 0, vy: p.style === 'v2' ? -2 : 0 });
      }
      if (k >= 1) { p.dead = true; lobBlast(p); }
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
    if ((p.kind === 'missile' || p.kind === 'rocket') && !p.flareChecked && t.alive && t.def && t.def.flares && isAirborne(t) &&
        Math.hypot(t.x - p.x, aimY(t) - p.y) < 90) {
      p.flareChecked = true;
      if (popFlares(t) && Math.random() < 0.45) {
        p.decoy = true;
        p.target = { x: t.x - Math.cos(t.face) * 30, y: t.y - Math.sin(t.face) * 30 + 16, alt: t.alt, kind: 'decoy', alive: true };
        continue;
      }
    }
    const tx = t.x, ty = aimY(t);
    const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy), step = p.speed * dt;
    p.a = Math.atan2(dy, dx);
    if (p.kind === 'rocket' || p.kind === 'missile') {
      p.trail -= dt;
      if (p.trail <= 0) {   // SAM missiles leave a thicker trail that hangs longer
        p.trail = 0.03;
        G.effects.push(p.thick ? { type: 'smoke', x: p.x, y: p.y, r: 2.4, t: 0, life: 1.3, alpha: 0.5, color: '#c9c7c0', vx: 2, vy: -2 } : { type: 'smoke', x: p.x, y: p.y, r: 1.6, t: 0, life: 0.5, alpha: 0.5, color: '#9a968c' });
      }
    } else if (p.kind === 'fireball') {
      p.trail -= dt;
      if (p.trail <= 0) { p.trail = 0.035; G.effects.push({ type: 'smoke', x: p.x, y: p.y, r: 2, t: 0, life: 0.45, alpha: 0.45, color: '#3a3733' }); }
    }
    if (d <= step + 3 || !t.alive) {
      p.dead = true;
      if (p.decoy) { impact('flak', tx, ty, true); continue; }   // burst harmlessly on a flare
      if (p.kind === 'fireball') { fireBlast(p, t.alive ? t.x : p.x, t.alive ? t.y : p.y); continue; }
      if (t.alive) damage(t, p.w.dmg, p.w.wh, p.from.alive ? p.from : null, { x: p.x, y: p.y });
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
    if (d < w.splash) damage(e, w.dmg * (1 - d / w.splash * 0.5), w.wh, from, { x, y });
  }
}

function grenadeBlast(p) {
  const { tx: x, ty: y, w } = p;
  hooks.sfx('hitMed', x, y);
  G.effects.push({ type: 'expl', x, y: y - 3, size: 9, t: 0, life: 0.5, seed: (Math.random() * 1e6) | 0, debris: true });
  scorch(G.tctx, x, y, 7, (Math.random() * 1e6) | 0);
  craterAt(x, y, 4);
  const from = p.from.alive ? p.from : null;
  for (const e of G.entities) {
    if (!e.alive || e.team === p.team || isAirborne(e)) continue;
    const d = distTo({ x, y }, e);
    if (d < w.splash) damage(e, w.dmg * (1 - d / w.splash * 0.6), w.wh, from, { x, y });
  }
}

// An artillery shell or V2 rocket coming down: a big blast that hurts everything around it.
function lobBlast(p) {
  const { tx: x, ty: y, w } = p, v2 = p.style === 'v2';
  hooks.sfx(v2 ? 'explodeVeh' : 'hitMed', x, y);
  G.effects.push({ type: 'expl', x, y: y - 4, size: v2 ? 18 : 11, t: 0, life: v2 ? 0.9 : 0.6, seed: (Math.random() * 1e6) | 0, debris: true });
  if (v2) hooks.shake(x, y, 2.5);
  scorch(G.tctx, x, y, v2 ? 13 : 8, (Math.random() * 1e6) | 0);
  craterAt(x, y, v2 ? 9 : 5);
  const from = p.from.alive ? p.from : null;
  for (const e of G.entities) {
    if (!e.alive || e.team === p.team || isAirborne(e)) continue;
    const d = distTo({ x, y }, e);
    if (d < w.splash) damage(e, w.dmg * (1 - d / w.splash * 0.65), w.wh, from, { x, y });
  }
}
function bombBlast(p) {
  const { tx: x, ty: y, w } = p;
  hooks.sfx('explodeVeh', x, y);
  G.effects.push({ type: 'expl', x, y: y - 4, size: 13, t: 0, life: 0.7, seed: (Math.random() * 1e6) | 0, debris: true });
  scorch(G.tctx, x, y, 11, (Math.random() * 1e6) | 0);
  craterAt(x, y, 8);
  for (const e of G.entities) {
    if (!e.alive || e.team === p.team || isAirborne(e)) continue;
    const d = distTo({ x, y }, e);
    if (d < w.splash) damage(e, w.dmg * (1 - d / w.splash * 0.5), w.wh, null, { x, y });
  }
}

// Craters only on open ground: not in water or under a structure.
function craterAt(x, y, rad) {
  const c = cellOfPos(x, y);
  if (G.terr[c] >= 4 || G.bld[c]) return;
  crater(G.tctx, x, y, rad, (Math.random() * 1e6) | 0);
}
// Ammunition cook-off: the tank's rounds go up, blowing the turret off into the air, spinning,
// while flame roars out of the hull and more rounds keep popping. The turret crashes down
// nearby and stays there as a wreck of its own.
function cookOff(e, seed) {
  const r = Math.random, a = r() * Math.PI * 2, p = 14 + r() * 30;
  G.effects.push({ type: 'turret', x: e.x, y: e.y, z: TURRET_Z.tank, vx: Math.cos(a) * p, vy: Math.sin(a) * p * 0.8, vz: 150 + r() * 100,
    rot: 0, spin: (r() < 0.5 ? -1 : 1) * (5 + r() * 9), def: e.def, tface: e.tface, seed, t: 0, life: 14, smokeT: 0,
    hx: e.x, hy: e.y, pops: [0.4 + r() * 0.2, 0.9 + r() * 0.3, 1.5 + r() * 0.4, 2.2 + r() * 0.6].slice(0, 2 + Math.floor(r() * 3)) });
  for (let i = 0; i < 7; i++) G.effects.push({ type: 'fire', x: e.x + (r() - 0.5) * 4, y: e.y - 6 - r() * 4, t: -i * 0.1, life: 0.8 + r() * 0.6, vy: -16 - r() * 10 });
  G.effects.push({ type: 'expl', x: e.x, y: e.y - 10, size: 11, t: -0.05, life: 0.6, seed: seed + 3 });
}
function updateTurret(fx, dt) {
  const r = Math.random;
  while (fx.pops.length && fx.t >= fx.pops[0]) {   // rounds still cooking off in the hull
    fx.pops.shift();
    hooks.sfx('hitMed', fx.hx, fx.hy);
    G.effects.push({ type: 'expl', x: fx.hx + (r() - 0.5) * 8, y: fx.hy - 5 + (r() - 0.5) * 5, size: 5 + r() * 4, t: 0, life: 0.4, seed: (r() * 1e6) | 0 });
    for (let i = 0; i < 2; i++) G.effects.push({ type: 'fire', x: fx.hx + (r() - 0.5) * 5, y: fx.hy - 7, t: -i * 0.1, life: 0.6 + r() * 0.4, vy: -20 });
  }
  if (!fx.down) {
    fx.vz -= 420 * dt; fx.z += fx.vz * dt; fx.x += fx.vx * dt; fx.y += fx.vy * dt; fx.rot += fx.spin * dt;
    if ((fx.smokeT -= dt) <= 0) { fx.smokeT = 0.05; G.effects.push({ type: 'smoke', x: fx.x, y: fx.y - fx.z, r: 2 + r(), t: 0, life: 1.1, alpha: 0.5, color: '#3a3631', vy: -6 }); }
    if (fx.z <= 0 && fx.vz < 0) {
      fx.z = 0;
      if (!fx.bounced && fx.vz < -60) {
        fx.bounced = true; fx.vz *= -0.28; fx.vx *= 0.4; fx.vy *= 0.4; fx.spin *= 0.35;
        hooks.sfx('hitMed', fx.x, fx.y);
        G.effects.push({ type: 'smoke', x: fx.x, y: fx.y, r: 4, t: 0, life: 0.8, alpha: 0.45, color: '#8a7a62' });
      } else {
        fx.down = true;
        fx.x = Math.max(6, Math.min(WORLD - 6, fx.x)); fx.y = Math.max(6, Math.min(WORLD - 6, fx.y));
        if (G.terr[cellOfPos(fx.x, fx.y)] >= 4 && G.terr[cellOfPos(fx.x, fx.y)] !== 5) G.effects.push({ type: 'smoke', x: fx.x, y: fx.y, r: 5, t: 0, life: 0.9, alpha: 0.5, color: '#c9c7c0' });
        else { craterAt(fx.x, fx.y, 3); bakeTurret(G.dctx, fx); smoulder(fx.x, fx.y - 2, 10); }
      }
    }
  }
  if (fx.down && !fx.pops.length) fx.t = fx.life;
}

// A wreck smoulders for a while after the flames die down.
function smoulder(x, y, life) { G.effects.push({ type: 'smoulder', x, y, t: 0, life, puffT: 0 }); }

function splash(x, y, rad, dmg, team, skip) {
  for (const e of G.entities) {
    if (!e.alive || e === skip || e.team === team || e.kind !== 'unit' || isAirborne(e)) continue;
    if (Math.hypot(e.x - x, e.y - y) < rad) damage(e, dmg, 'HE', null, { x, y });
  }
}

// A flak burst: a flash, then a ragged cloud of black smoke that hangs in the air and drifts.
function flakBurst(x, y, delay) {
  G.effects.push({ type: 'flakburst', x, y, t: -(delay || 0), life: 1.8 + Math.random() * 0.6, seed: (Math.random() * 1e6) | 0, vx: 3 + Math.random() * 3, vy: -2 });
}
function impact(kind, x, y, inAir) {
  if (kind === 'flak') {
    flakBurst(x, y);
    G.effects.push({ type: 'spark', x, y, t: 0, life: 0.1 });
  } else {
    hooks.sfx(kind === 'shell' ? 'hitSmall' : 'hitMed', x, y);
    const size = kind === 'shell' ? 6 : 8;
    G.effects.push({ type: 'expl', x, y, size, t: 0, life: 0.45, seed: (Math.random() * 1e6) | 0 });
    if (!inAir) {
      if (Math.random() < 0.5) scorch(G.tctx, x, y, size * 0.8, (Math.random() * 1e6) | 0);
      if (kind !== 'shell' || Math.random() < 0.6) craterAt(x + (Math.random() - 0.5) * 3, y + (Math.random() - 0.5) * 3, kind === 'shell' ? 3 : 4.5);
    }
  }
}

// `from`: where the hit came from (a blast centre or the shooter), for how a soldier falls.
function damage(t, amount, wh, attacker, from) {
  if (!t.alive) return;
  const armor = t.kind === 'bld' ? 'bld' : isAirborne(t) ? 'air' : t.def.armor === 'air' ? 'light' : t.def.armor;
  const mult = WARHEADS[wh][armor];
  if (!mult) return;
  // Infantry under fire drop into cover: a mix of staying up, crouching and going prone, held
  // until they move or have not been hit for a while. Lower is harder to hit.
  let cover = 1;
  if (t.kind === 'unit' && t.cls === 'inf' && !t.chute) {
    if (!t.stance || G.t > t.stanceUntil) { const r = Math.random(); t.stance = r < 0.34 ? 'stand' : r < 0.67 ? 'crouch' : 'prone'; }
    t.stanceUntil = G.t + 6;
    if (!t.moving) cover = t.stance === 'prone' ? 0.65 : t.stance === 'crouch' ? 0.85 : 1;
  }
  t.hp -= amount * mult * cover * (0.9 + Math.random() * 0.2);
  t.hitT = G.t;
  const team = teamOf(t);
  if (t.team === PLAYER && attacker) {
    if (t.kind === 'bld') notify(team, 'base', 'Our base is under attack', 15);
    else if (t.def.harvester) notify(team, 'harv', 'Ore Truck under attack', 15);
  }
  // Either side: an Ore Truck under fire calls nearby units to its aid.
  if (t.def && t.def.harvester && attacker && attacker.kind === 'unit') team.harvHit = { x: t.x, y: t.y, until: G.t + 8 };
  if (t.def && t.def.harvester && attacker && attacker.team !== t.team) truckRetreat(t, attacker);
  // A structure shot at from outside the base zone: answer the fire wherever it comes from.
  else if (t.kind === 'bld' && attacker && attacker.kind === 'unit' && !isAirborne(attacker)) team.baseHit = { x: attacker.x, y: attacker.y, until: G.t + 8 };
  if (attacker && attacker.cls === 'air' && !attacker.def.scripted && G.teams[t.team]) { const tm = G.teams[t.team]; tm.airHit = { x: t.x, y: t.y, t: G.t }; tm.sawAir = true; }   // where enemy aircraft strike
  // Shot at while guarding or on the attack: turn on the shooter, wherever it is, unless
  // already trading fire with an enemy unit in range.
  if (attacker && attacker.alive && attacker.team !== t.team && t.kind === 'unit' && t.alive && t.cls !== 'air' && !t.def.harvester &&
      (t.order.type === 'guard' || t.order.type === 'hunt') && t.target !== attacker && canTarget(t, attacker)) {
    const c = t.target;
    const busy = c && c.alive && c.kind === 'unit' && distTo(t, c) <= (canHit(t.def.weapon, c) ? t.def.weapon : t.def.weapon2).range;
    if (!busy) { t.target = attacker; t.avenge = attacker; }
    if (t.group) t.group.hitBy = attacker;   // the rest of the wave learns where the fire comes from
  }
  if (t.hp <= 0) kill(t, attacker, wh, from || attacker);
}

function notify(team, key, msg, cooldown) {
  if (team.isAI) return;
  if (team.cool[key] && G.t < team.cool[key]) return;
  team.cool[key] = G.t + cooldown;
  hooks.eva(msg);
}

function kill(e, attacker, wh, from) {
  e.alive = false;
  const team = teamOf(e);
  if (attacker && attacker.team !== e.team) G.teams[attacker.team].stats.killed++;
  const seed = (Math.random() * 1e6) | 0;
  if (e.kind === 'unit') {
    team.stats.lost++;
    if (e.cls === 'inf') {
      ragdoll(e, wh, from);
    } else if (e.cls === 'veh') {
      const cook = e.def.draw === 'tank' && Math.random() < 0.35;   // ammunition cook-off
      hooks.sfx('explodeVeh', e.x, e.y);
      G.effects.push({ type: 'expl', x: e.x, y: e.y - 4, size: 16, t: 0, life: 0.8, seed, debris: true });
      scorch(G.tctx, e.x, e.y, 12, seed);
      craterAt(e.x + Math.cos(e.face) * 6, e.y + Math.sin(e.face) * 6, 5);
      bakeWreck(G.dctx, e.x, e.y, e.def, e.face, e.tface, cook);
      if (cook) cookOff(e, seed);
      for (let i = 0; i < 4; i++) G.effects.push({ type: 'fire', x: e.x + (Math.random() - 0.5) * 8, y: e.y + (Math.random() - 0.5) * 6, t: -i * 0.3, life: 2.5 + Math.random() * 2 });
      smoulder(e.x, e.y - 4, 25);
    } else if ((e.alt || 0) > 4) {
      // Shot down: a burst in the air, the pilot ejects or bails out, the airframe falls and crashes.
      hooks.sfx('hitMed', e.x, e.y);
      G.effects.push({ type: 'expl', x: e.x, y: e.y - e.alt, size: 10, t: 0, life: 0.6, seed, debris: true });
      const jet = e.def.fly === 'jet', sp = jet ? (e.speedCur || e.def.speed) * 0.85 : 18, side = Math.random() < 0.5 ? -1 : 1;
      const vx = Math.cos(e.face) * sp, vy = Math.sin(e.face) * sp;
      if (jet) ejectSeat(e, vx, vy); else ejectPilot(e);
      G.effects.push({ type: 'crash', x: e.x, y: e.y, alt: e.alt, vz: jet ? -6 : 0, face: e.face, vx, vy, jet, seed,
        spin: jet ? side * 0.2 : side * (3 + Math.random() * 2), spinUp: jet ? side * (0.4 + Math.random() * 0.4) : side * 2.5,
        roll: 0, rollV: jet ? side * (1.5 + Math.random() * 2) : 0, bounced: false, ground: false, hit: [],
        def: e.def, faction: e.faction, t: 0, life: 40, smokeT: 0, shedT: 0.3, furrowT: 0 });
      for (let i = 0; i < 2; i++) shed(e.x, e.y, e.alt, vx, vy, e.faction, true);
    } else {
      crashLanding(e.x, e.y, e.face, e.def, e.faction, seed);
    }
    if (e.team === PLAYER) notify(team, 'lost', 'Unit lost', 4);
  } else {
    for (let y = e.cy; y < e.cy + e.h; y++) for (let x = e.cx; x < e.cx + e.w; x++) if (G.bld[idx(x, y)] === e.id) G.bld[idx(x, y)] = 0;
    if (e.exitCell !== undefined) G.resv[e.exitCell] = 0;
    if (e.sellT <= 0) {
      hooks.sfx('explodeBig', e.x, e.y);
      hooks.sfx('collapse', e.x, e.y);
      hooks.shake(e.x, e.y, 3 + e.w * e.h * 0.8);
      escapeSurvivors(e);
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

// How a soldier dies: a small physics ragdoll (eleven joints held together by sticks) is
// thrown by whatever hit him, so no two fall the same way. Bullets knock the upper body back
// while the legs buckle or stay stiff for a moment; blasts throw the whole body into the air,
// tumbling; flame sometimes sends him staggering a few steps first, and a Tesla bolt makes him
// convulse before he drops. His weapon flies loose. Once still, the body is painted into the
// ground and stays.
const RAG_PTS = [   // [forward, side, height]
  [0.5, 0, 15.5], [0, 0, 13], [0, 0, 8], [0, -2.5, 12.5], [0, 2.5, 12.5], [3, -2.5, 10], [3, 2.5, 10],
  [0.3, -1, 4.5], [0.3, 1, 4.5], [0, -1, 0.5], [0, 1, 0.5],
];   // head, neck, pelvis, shoulders L/R, hands L/R, knees L/R, feet L/R
const RAG_STICKS = [[0, 1], [1, 2], [3, 4], [1, 3], [1, 4], [3, 2], [4, 2], [0, 3], [0, 4], [3, 5], [4, 6], [2, 7], [2, 8], [7, 9], [8, 10], [7, 8]];
const RAG_STIFF = [[2, 9], [2, 10], [1, 9], [1, 10]];          // legs locked straight for a moment
const RAG_MIN = [[2, 9, 0.5], [2, 10, 0.5], [1, 5, 0.45], [1, 6, 0.45], [0, 2, 0.95]];   // no folding flat
function ragdoll(e, wh, from) {
  const r = Math.random;
  const a = from && (from.x !== e.x || from.y !== e.y) ? Math.atan2(e.y - from.y, e.x - from.x) : r() * Math.PI * 2;
  const blast = wh === 'HE' || wh === 'AP' || wh === 'ART' || wh === 'AT';
  const fx = { type: 'ragdoll', x: e.x, y: e.y, unitType: e.type, faction: e.faction, face: e.face, t: 0, life: 14, age: 0, still: 0, acc: 0 };
  // Joints in world space, standing as the soldier stood.
  const n = RAG_PTS.length, ca = Math.cos(e.face), sa = Math.sin(e.face);
  const P = new Float32Array(n * 3), V = new Float32Array(n * 3);
  RAG_PTS.forEach(([f, sd, z], i) => { P[i * 3] = e.x + f * ca - sd * sa; P[i * 3 + 1] = e.y + f * sa + sd * ca; P[i * 3 + 2] = z; });
  const dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx;
  const kick = (i, vx, vy, vz) => { V[i * 3] += vx; V[i * 3 + 1] += vy; V[i * 3 + 2] += vz; };
  if (blast) {
    // Thrown up and away, spinning about a random axis.
    const p = 30 + r() * 50, up = 80 + r() * 90;
    const w = [(r() - 0.5) * 2, (r() - 0.5) * 2, (r() - 0.5) * 2], wl = Math.hypot(...w) || 1, ws = 5 + r() * 9;
    for (let i = 0; i < n; i++) {
      const rx = P[i * 3] - e.x, ry = P[i * 3 + 1] - e.y, rz = P[i * 3 + 2] - 8;
      const ox = w[0] / wl * ws, oy = w[1] / wl * ws, oz = w[2] / wl * ws;
      kick(i, dx * p + oy * rz - oz * ry, dy * p * 0.8 + oz * rx - ox * rz, up + ox * ry - oy * rx);
    }
    fx.stiff = 0;
  } else {
    // Knocked back at the chest; sometimes forward instead (hit from behind, or slumping).
    const dir = r() < 0.22 ? -0.6 : 1, p = (40 + r() * 50) * dir, twist = (r() - 0.5) * 50;
    for (const i of [0, 1, 3, 4, 5, 6]) kick(i, dx * p + (r() - 0.5) * 12, dy * p + (r() - 0.5) * 12, (r() - 0.3) * 20);
    kick(3, px * twist, py * twist, 0); kick(4, -px * twist, -py * twist, 0);
    kick(2, dx * p * 0.3, dy * p * 0.3, 0);
    if (r() < 0.4) { kick(7, -dx * 25, -dy * 25, 0); kick(8, -dx * 22, -dy * 22, 0); kick(2, 0, 0, -30); }   // knees buckle
    fx.stiff = r() < 0.45 ? 0.15 + r() * 0.3 : 0;                                                         // or he goes down straight
    if (wh === 'FIRE') {
      for (let i = 0; i < 3; i++) G.effects.push({ type: 'fire', x: e.x + (r() - 0.5) * 6, y: e.y - 4 + (r() - 0.5) * 4, t: -i * 0.15, life: 1.2 + r() });
      fx.burnt = true;
      if (r() < 0.45) fx.stagger = { t: 0.8 + r() * 0.8, a: r() * Math.PI * 2 };
    }
    if (wh === 'TESLA') { G.effects.push({ type: 'spark', x: e.x, y: e.y - 8, t: 0, life: 0.3 }); fx.burnt = true; fx.shock = 0.5 + r() * 0.3; }
  }
  // The weapon, flung loose from the hands.
  const wl = e.type === 'rocket' ? 12 : e.type === 'grenadier' || e.type === 'pilot' ? 0 : 8;
  if (wl) {
    const hx = P[18], hy = P[19], hz = e.type === 'rocket' ? 15 : 10;
    fx.gun = { P: new Float32Array([hx - ca * wl / 2, hy - sa * wl / 2, hz, hx + ca * wl / 2, hy + sa * wl / 2, hz + 0.5]), len: wl };
    fx.gun.V = new Float32Array([V[18] * 0.7 + (r() - 0.5) * 40, V[19] * 0.7 + (r() - 0.5) * 40, V[20] * 0.6 + 20 + r() * 30, 0, 0, 0]);
    fx.gun.V.copyWithin(3, 0, 3); fx.gun.V[3] += (r() - 0.5) * 50; fx.gun.V[4] += (r() - 0.5) * 50;
  }
  // Verlet state: previous positions from the starting velocities (fixed 1/60 s steps).
  const h = 1 / 60, toPrev = (P, V) => { const Q = new Float32Array(P.length); for (let i = 0; i < P.length; i++) Q[i] = P[i] - V[i] * h; return Q; };
  fx.P = P; fx.Q = toPrev(P, V);
  fx.rest = RAG_STICKS.concat(RAG_STIFF).map(([i, j]) => Math.hypot(P[i * 3] - P[j * 3], P[i * 3 + 1] - P[j * 3 + 1], P[i * 3 + 2] - P[j * 3 + 2]));
  fx.minL = RAG_MIN.map(([i, j, f]) => Math.hypot(P[i * 3] - P[j * 3], P[i * 3 + 1] - P[j * 3 + 1], P[i * 3 + 2] - P[j * 3 + 2]) * f);
  if (fx.gun) fx.gun.Q = toPrev(fx.gun.P, fx.gun.V);
  hooks.sfx(blast ? 'dieBlast' : wh === 'FIRE' ? 'dieFire' : 'die', e.x, e.y);
  G.effects.push(fx);
}
// One fixed physics step for a set of points: gravity, damping, ground contact with friction
// and a weak bounce.
function ragIntegrate(P, Q, h) {
  for (let i = 0; i < P.length; i += 3) {
    let vx = (P[i] - Q[i]) * 0.995, vy = (P[i + 1] - Q[i + 1]) * 0.995, vz = (P[i + 2] - Q[i + 2]) * 0.995;
    Q[i] = P[i]; Q[i + 1] = P[i + 1]; Q[i + 2] = P[i + 2];
    vz -= 420 * h * h;
    P[i] += vx; P[i + 1] += vy; P[i + 2] += vz;
    if (P[i + 2] < 0) {
      P[i + 2] = 0; Q[i + 2] = vz < -1.2 ? vz * 0.25 : 0;                     // bounce off the ground
      Q[i] = P[i] - vx * 0.55; Q[i + 1] = P[i + 1] - vy * 0.55;               // and drag along it
    }
  }
}
function ragStick(P, i, j, L, mode) {
  const ax = P[i * 3], ay = P[i * 3 + 1], az = P[i * 3 + 2], bx = P[j * 3], by = P[j * 3 + 1], bz = P[j * 3 + 2];
  const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz) || 1e-3;
  if (mode === 'min' && d >= L) return;
  const k = (d - L) / d * 0.5;
  P[i * 3] += dx * k; P[i * 3 + 1] += dy * k; P[i * 3 + 2] += dz * k;
  P[j * 3] -= dx * k; P[j * 3 + 1] -= dy * k; P[j * 3 + 2] -= dz * k;
}
function updateRagdoll(fx, dt) {
  const r = Math.random;
  if (fx.stagger && fx.stagger.t > 0) {
    // On fire: stagger a few steps before collapsing.
    const st = fx.stagger, sp = 34 * dt;
    st.t -= dt; st.a += (r() - 0.5) * 6 * dt; fx.face = st.a;
    const mx = Math.cos(st.a) * sp, my = Math.sin(st.a) * sp;
    if (!passableAt(fx.x + mx, fx.y + my)) st.a += Math.PI / 2;
    else { fx.x += mx; fx.y += my; for (const A of [fx.P, fx.Q]) for (let i = 0; i < A.length; i += 3) { A[i] += mx; A[i + 1] += my; } if (fx.gun) for (const A of [fx.gun.P, fx.gun.Q]) for (let i = 0; i < 6; i += 3) { A[i] += mx; A[i + 1] += my; } }
    if (r() < dt * 5) G.effects.push({ type: 'fire', x: fx.x + (r() - 0.5) * 4, y: fx.y - 6, t: 0, life: 0.7 });
    return;
  }
  if (fx.pool) {   // lying still while the blood spreads; then painted into the ground
    fx.pool.t += dt;
    if (fx.pool.t >= fx.pool.dur) { fx.t = fx.life; bakeRagdoll(G.dctx, fx); }
    return;
  }
  if (fx.shock > 0) { fx.shock -= dt; if (r() < dt * 8) G.effects.push({ type: 'spark', x: fx.x + (r() - 0.5) * 6, y: fx.y - 6 - r() * 6, t: 0, life: 0.15 }); return; }
  const h = 1 / 60, P = fx.P, Q = fx.Q, nS = RAG_STICKS.length;
  fx.acc += dt;
  while (fx.acc >= h) {
    fx.acc -= h; fx.age += h;
    ragIntegrate(P, Q, h);
    const stiff = fx.age < fx.stiff;
    for (let it = 0; it < 6; it++) {
      for (let k = 0; k < nS; k++) ragStick(P, RAG_STICKS[k][0], RAG_STICKS[k][1], fx.rest[k]);
      if (stiff) for (let k = 0; k < RAG_STIFF.length; k++) ragStick(P, RAG_STIFF[k][0], RAG_STIFF[k][1], fx.rest[nS + k]);
      for (let k = 0; k < RAG_MIN.length; k++) ragStick(P, RAG_MIN[k][0], RAG_MIN[k][1], fx.minL[k], 'min');
    }
    if (fx.gun) {
      const g = fx.gun;
      ragIntegrate(g.P, g.Q, h);
      for (let it = 0; it < 2; it++) ragStick(g.P, 0, 1, g.len);
    }
    // Settled once nothing moves for a while.
    let mv = 0;
    for (let i = 0; i < P.length; i++) mv = Math.max(mv, Math.abs(P[i] - Q[i]));
    fx.still = mv < 0.04 && fx.age > 0.4 ? fx.still + h : 0;
    if (fx.still > 0.3 || fx.age > 5) break;
  }
  fx.x = P[6]; fx.y = P[7];
  if (fx.still <= 0.3 && fx.age <= 5) return;
  if (G.terr[cellOfPos(Math.max(0, Math.min(WORLD - 1, fx.x)), Math.max(0, Math.min(WORLD - 1, fx.y)))] >= 4) { fx.t = fx.life; G.effects.push({ type: 'smoke', x: fx.x, y: fx.y, r: 3, t: 0, life: 0.6, alpha: 0.5, color: '#c9c7c0' }); return; }
  if (fx.burnt) { fx.t = fx.life; bakeRagdoll(G.dctx, fx); return; }
  fx.pool = { t: 0, dur: 2 + r() * 1.5, r: 3 + r() * 2, seed: (r() * 1e6) | 0, a: r() * Math.PI * 2 };
}

// Mobile Outpost: unpack into an Outpost on the spot, or the nearest clear 2x2 ground beside it.
function deploySpot(u) {
  const d = BUILD_DEFS[u.def.deploys], c0x = Math.floor(u.x / CELL) - 1, c0y = Math.floor(u.y / CELL) - 1;
  for (let r = 0; r <= 3; r++) for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
    if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
    const cx = c0x + ox, cy = c0y + oy;
    if (cx < 1 || cy < 1 || cx + d.w > MAP - 1 || cy + d.h > MAP - 1) continue;
    let ok = true;
    for (let y = cy; y < cy + d.h && ok; y++) for (let x = cx; x < cx + d.w && ok; x++) {
      const c = idx(x, y);
      if (G.block[c] || G.bld[c] || G.ore[c] > 0 || G.resv[c]) ok = false;
    }
    for (const e of G.entities) if (ok && e !== u && e.alive && e.kind === 'unit' && !isAirborne(e) && e.x > cx * CELL - 2 && e.x < (cx + d.w) * CELL + 2 && e.y > cy * CELL - 2 && e.y < (cy + d.h) * CELL + 2) ok = false;
    if (ok) return { cx, cy };
  }
  return null;
}
function deployFob(u) {
  if (!u.alive || !u.def.deploys) return null;
  const spot = deploySpot(u);
  if (!spot) { if (u.team === PLAYER) hooks.eva('Cannot deploy here'); return null; }
  const team = G.teams[u.team];
  u.alive = false;
  const b = addBuilding(u.def.deploys, team, spot.cx, spot.cy);
  hooks.sfx('place', b.x, b.y); hooks.sfx('build', b.x, b.y);
  updatePower();
  return b;
}

// Soldiers stumble out of a destroyed structure and join the defence: more from bigger buildings.
function escapeSurvivors(b) {
  const team = G.teams[b.team], n = b.type === 'cy' ? 4 : Math.min(3, Math.max(1, Math.round(b.w * b.h / 2)));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const c = nearestFreeCell(cellOfPos(b.x + Math.cos(a) * b.w * CELL * 0.6, b.y + Math.sin(a) * b.h * CELL * 0.6), 4);
    if (c < 0) continue;
    const p = cellCenter(c), u = addUnit('rifle', team, p.x + (Math.random() - 0.5) * 8, p.y + (Math.random() - 0.5) * 8);
    u.face = u.tface = a;
    setGuard(u);
  }
}

// Ground impact of an aircraft: fireball, burning wreck, scorched earth.
function crashLanding(x, y, face, def, faction, seed) {
  hooks.sfx('explodeVeh', x, y);
  G.effects.push({ type: 'expl', x, y: y - 4, size: 15, t: 0, life: 0.8, seed, debris: true });
  scorch(G.tctx, x, y, 13, seed);
  if (G.terr[cellOfPos(x, y)] < 4) {
    craterAt(x, y, 9);
    bakeWreck(G.dctx, x, y, def, face, face);
    smoulder(x, y - 3, 30);
  }
  for (let i = 0; i < 4; i++) G.effects.push({ type: 'fire', x: x + (Math.random() - 0.5) * 12, y: y + (Math.random() - 0.5) * 8, t: -i * 0.3, life: 3 + Math.random() * 3 });
  for (const e of G.entities) if (e.alive && e.kind === 'unit' && !isAirborne(e) && Math.hypot(e.x - x, e.y - y) < 14) damage(e, 30, 'HE', null);
}
// A downed aircraft falls as a small rigid body: gravity (a jet's wings still hold it up a
// little at first), air drag, and a spin that winds up as control is lost; a jet's yaw bends
// its path into a spiral and it rolls (drawn by squashing the wingspan). It sheds burning
// pieces on the way down. A fast jet hitting the ground bounces once, then skids, gouging a
// furrow and throwing up dirt, until it stops or hits something, and blows up. A helicopter
// spirals down and its rotor blades fly off on impact. Into the water, it is a splash.
const wetAt = (x, y) => { const c = G.terr[cellOfPos(Math.max(0, Math.min(WORLD - 1, x)), Math.max(0, Math.min(WORLD - 1, y)))]; return c >= 4 && c !== 5; };
function shed(x, y, alt, vx, vy, faction, burning, blade) {
  const a = Math.random() * Math.PI * 2, kick = 15 + Math.random() * 30;
  G.effects.push({ type: 'frag', x, y, alt: Math.max(0.5, alt), vx: vx * 0.7 + Math.cos(a) * kick, vy: vy * 0.7 + Math.sin(a) * kick, vz: -15 - Math.random() * 35,
    rot: Math.random() * 6, spin: (Math.random() - 0.5) * 22, w: blade ? 13 : 2 + Math.random() * 4, h: blade ? 1.5 : 1.5 + Math.random() * 2,
    color: blade ? '#2c2c28' : Math.random() < 0.5 ? '#3b3a36' : FACTIONS[faction].pal.main || '#555', burning, t: 0, life: 9, smokeT: 0 });
}
function splash(x, y, big) {
  hooks.sfx('splash', x, y);
  for (let i = 0; i < (big ? 9 : 3); i++) G.effects.push({ type: 'smoke', x: x + (Math.random() - 0.5) * (big ? 16 : 5), y: y + (Math.random() - 0.5) * 6, r: big ? 4 : 2, t: -i * 0.03, life: 1.1, alpha: 0.75, color: '#dfe8ec', vy: -(big ? 30 : 14) * Math.random(), vx: 0 });
  if (big) G.effects.push({ type: 'ring', x, y, t: 0, life: 1.4, color: 'rgba(225,238,245,0.85)' });
}
function updateCrash(fx, dt) {
  const sp = Math.hypot(fx.vx, fx.vy);
  if (!fx.ground) {
    fx.vz += (fx.jet ? 60 * Math.min(1, 0.4 + fx.t * 0.5) : 60) * dt;   // the wings stop lifting
    fx.alt -= fx.vz * dt;
    const drag = Math.exp(-(fx.jet ? 0.3 : 0.9) * dt);
    fx.vx *= drag; fx.vy *= drag;
    fx.spin += fx.spinUp * dt; fx.spin = Math.max(-9, Math.min(9, fx.spin));
    fx.face += fx.spin * dt; fx.roll += fx.rollV * dt;
    if (fx.jet) { const a = fx.spin * dt * 0.15, c = Math.cos(a), s = Math.sin(a); [fx.vx, fx.vy] = [fx.vx * c - fx.vy * s, fx.vx * s + fx.vy * c]; }
    fx.x += fx.vx * dt; fx.y += fx.vy * dt;
    if ((fx.smokeT -= dt) <= 0) { fx.smokeT = 0.04; G.effects.push({ type: 'smoke', x: fx.x, y: fx.y - fx.alt, r: 2.5 + fx.t * 0.6, t: 0, life: 1.2, alpha: 0.6, color: '#3a3733' }); }
    if ((fx.shedT -= dt) <= 0) { fx.shedT = 0.35 + Math.random() * 0.5; shed(fx.x, fx.y, fx.alt, fx.vx, fx.vy, fx.faction, Math.random() < 0.5); }
    if (fx.alt > 0) return;
    fx.alt = 0;
    if (wetAt(fx.x, fx.y)) { splash(fx.x, fx.y, true); fx.t = fx.life; return; }
    const seed = (Math.random() * 1e6) | 0;
    if (!fx.jet) {   // rotor blades break away and the fuselage burns where it falls
      for (let i = 0; i < 3; i++) shed(fx.x, fx.y, 6, fx.vx, fx.vy, fx.faction, false, true);
      fx.t = fx.life; crashLanding(fx.x, fx.y, fx.face, fx.def, fx.faction, seed); return;
    }
    hooks.sfx('explodeVeh', fx.x, fx.y); hooks.shake(fx.x, fx.y, 4);
    G.effects.push({ type: 'expl', x: fx.x, y: fx.y - 3, size: 11, t: 0, life: 0.7, seed, debris: true });
    for (let i = 0; i < 3; i++) shed(fx.x, fx.y, 2, fx.vx, fx.vy, fx.faction, i === 0);
    for (const e of G.entities) if (e.alive && e.kind === 'unit' && !isAirborne(e) && Math.hypot(e.x - fx.x, e.y - fx.y) < 12) damage(e, 20, 'HE', null);
    if (!fx.bounced && sp > 45 && fx.vz > 25) { fx.bounced = true; fx.vz = -fx.vz * 0.3; fx.alt = 0.5; fx.vx *= 0.6; fx.vy *= 0.6; fx.rollV *= 0.5; return; }
    fx.ground = true; fx.vz = 0; fx.rollV = 0;
    fx.roll = Math.round(fx.roll / Math.PI) * Math.PI;   // settles on its belly or its back
    return;
  }
  // Skidding along the ground.
  const f = Math.max(0, sp - 70 * dt) / (sp || 1);
  fx.vx *= f; fx.vy *= f; fx.spin *= Math.exp(-2.5 * dt); fx.face += fx.spin * dt;
  const nx = fx.x + fx.vx * dt, ny = fx.y + fx.vy * dt;
  if (wetAt(nx, ny)) { splash(nx, ny, true); fx.t = fx.life; return; }
  const c = cellOfPos(Math.max(0, Math.min(WORLD - 1, nx)), Math.max(0, Math.min(WORLD - 1, ny))), b = G.bld[c] && G.byId.get(G.bld[c]);
  const blocked = !passableAt(nx, ny);
  if (b && b.alive) damage(b, 60, 'HE', null);
  if (!blocked) { fx.x = nx; fx.y = ny; }
  if ((fx.furrowT -= dt) <= 0) {
    fx.furrowT = 0.06;
    scorch(G.tctx, fx.x, fx.y, 2.2, (Math.random() * 1e6) | 0);
    G.effects.push({ type: 'smoke', x: fx.x - fx.vx * 0.05, y: fx.y, r: 3, t: 0, life: 0.9, alpha: 0.5, color: '#7a6a52', vy: -8, vx: 0 });
    if (Math.random() < 0.25) shed(fx.x, fx.y, 1, fx.vx * 0.5, fx.vy * 0.5, fx.faction, false);
  }
  for (const e of G.entities) if (e.alive && e.kind === 'unit' && !isAirborne(e) && !fx.hit.includes(e.id) && Math.hypot(e.x - fx.x, e.y - fx.y) < 10) { fx.hit.push(e.id); damage(e, 35, 'HE', null); }
  if (blocked || Math.hypot(fx.vx, fx.vy) < 6) { fx.t = fx.life; crashLanding(fx.x, fx.y, fx.face, fx.def, fx.faction, (Math.random() * 1e6) | 0); }
}
// Loose pieces: thrown, tumbling, bouncing and sliding to rest; burning ones trail smoke.
function updateFrag(fx, dt) {
  if (fx.alt > 0 || fx.vz < 0) {
    fx.vz += 70 * dt; fx.alt -= fx.vz * dt;
    if (fx.alt <= 0) {
      fx.alt = 0;
      if (wetAt(fx.x, fx.y)) { splash(fx.x, fx.y, false); fx.t = fx.life; return; }
      if (fx.vz > 18) { fx.vz = -fx.vz * 0.35; fx.vx *= 0.6; fx.vy *= 0.6; fx.spin *= 0.6; fx.alt = 0.01; } else fx.vz = 0;
    }
  } else { const k = Math.exp(-7 * dt); fx.vx *= k; fx.vy *= k; fx.spin *= k; }
  fx.x += fx.vx * dt; fx.y += fx.vy * dt; fx.rot += fx.spin * dt;
  if (fx.burning && fx.t < 3 && (fx.smokeT -= dt) <= 0) { fx.smokeT = 0.08; G.effects.push({ type: 'smoke', x: fx.x, y: fx.y - fx.alt, r: 1.5, t: 0, life: 0.8, alpha: 0.5, color: '#3a3733' }); }
}
// A jet's ejection seat: the canopy blows off, a rocket kicks the seat up and clear of the
// tumbling airframe, the pilot drops free of it and the parachute opens.
function ejectSeat(e, vx, vy) {
  hooks.sfx('rocket', e.x, e.y);
  G.effects.push({ type: 'frag', x: e.x, y: e.y, alt: e.alt + 2, vx: vx * 0.8 + (Math.random() - 0.5) * 20, vy: vy * 0.8 + (Math.random() - 0.5) * 20, vz: -55,
    rot: e.face, spin: 9, w: 5, h: 3, color: 'rgba(150,185,205,0.85)', burning: false, t: 0, life: 7, smokeT: 0 });
  G.effects.push({ type: 'eject', x: e.x, y: e.y, alt: e.alt + 2, vx: vx * 0.45, vy: vy * 0.45, vz: -95, face: e.face,
    team: e.team, faction: e.faction, t: 0, life: 0.85, smokeT: 0 });
}
function updateEject(fx, dt) {
  const burn = fx.t < 0.3;
  fx.vz += (burn ? -40 : 110) * dt;
  fx.alt = Math.max(1, fx.alt - fx.vz * dt);
  const k = Math.exp(-1.5 * dt); fx.vx *= k; fx.vy *= k;
  fx.x += fx.vx * dt; fx.y += fx.vy * dt;
  if (burn && (fx.smokeT -= dt) <= 0) { fx.smokeT = 0.03; G.effects.push({ type: 'smoke', x: fx.x, y: fx.y - fx.alt + 4, r: 2, t: 0, life: 0.8, alpha: 0.55, color: '#b9b4aa' }); }
  if (fx.t + dt < fx.life) return;
  // Seat away, chute open.
  G.effects.push({ type: 'frag', x: fx.x, y: fx.y, alt: fx.alt, vx: fx.vx + (Math.random() - 0.5) * 16, vy: fx.vy + (Math.random() - 0.5) * 10, vz: -10,
    rot: fx.face, spin: 5, w: 4, h: 4, color: '#2b2b27', burning: false, t: 0, life: 8, smokeT: 0 });
  ejectPilot({ x: fx.x, y: fx.y, alt: fx.alt, team: fx.team });
}
// The crew of a downed aircraft parachutes down and runs for home without stopping to fight.
// Reaching any of its side's structures, the pilot is recovered: off the field, with a small bonus.
const PILOT_BOUNTY = 100;
function ejectPilot(e) {
  const c = nearestFreeCell(cellOfPos(e.x, e.y), 4);
  if (c < 0) return;
  const team = G.teams[e.team], p = cellCenter(c);
  const u = addUnit('pilot', team, p.x, p.y);
  u.chute = (e.alt || 30) / 26 + 0.3;
  u.x = e.x; u.y = e.y;   // drifts down where it bailed out, stepping clear on landing
  u.homeward = true;
  if (!pilotHome(u)) { u.homeward = false; if (team.auto) setHunt(u); else setGuard(u); }
}
// Down in trees, water or on a roof: walk out to the nearest open ground, and set off from there.
function landChute(u) {
  const c = cellOfPos(Math.max(0, Math.min(WORLD - 1, u.x)), Math.max(0, Math.min(WORLD - 1, u.y)));
  if (!freeCell(c)) {
    const n = nearestFreeCell(c, 8);
    if (n < 0 && wetAt(u.x, u.y)) { u.alive = false; splash(u.x, u.y, false); return; }   // too far out to swim
    if (n >= 0) { const p = cellCenter(n); u.x = p.x; u.y = p.y; }
  }
  if (u.homeward) pilotHome(u);
  else if (u.order.type === 'guard') { u.order.x = u.x; u.order.y = u.y; }
}
// Send a pilot to the nearest friendly structure; false when there is none left.
function pilotHome(u) {
  let best = null, bd = Infinity;
  for (const b of buildingsOf(u.team)) { const d = dist(u, b); if (d < bd) { bd = d; best = b; } }
  if (!best) return false;
  u.order = { type: 'move', x: best.x, y: best.y }; u.target = null; u.home = best;
  goTo(u, best.x, best.y);
  return true;
}
function recoverPilot(u) {
  if (!u.home || !u.home.alive || distTo(u, u.home) > CELL * 3) {   // home lost or not reached: try again
    if (!pilotHome(u)) u.homeward = false;
    return false;
  }
  const team = G.teams[u.team];
  u.alive = false; team.credits += PILOT_BOUNTY;
  if (team.id === PLAYER) hooks.eva('Pilot recovered');
  return true;
}

// ---------------------------------------------------------------------------
// Unit behaviour
// ---------------------------------------------------------------------------
function updateUnit(u, dt) {
  u.cd = Math.max(0, u.cd - dt); u.cd2 = Math.max(0, u.cd2 - dt); u.fireT = Math.max(0, u.fireT - dt);
  if (u.stance && G.t > u.stanceUntil) u.stance = null;   // quiet for a while: back on their feet
  u.moving = false;
  tickBurst(u, dt);
  if (u.def.scripted) { updateFlight(u, dt); return; }
  if (u.chute > 0) { u.chute -= dt; if (u.chute <= 0) landChute(u); return; }
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
      // Whoever fired on this unit is chased a little past its own reach; anything else is
      // dropped once out of sight.
      const avenging = u.target && u.target === u.avenge;
      const reach = avenging ? Math.max(sight * 1.5, ((u.target.def.weapon && u.target.def.weapon.range) || 0) + CELL * 3) : sight * 1.5;
      if (u.target && distTo(u, u.target) > reach) u.target = null;
      if (o.type === 'guard' && u.target && !avenging && Math.hypot(u.target.x - o.x, u.target.y - o.y) > sight * 1.6) u.target = null;
      if (!u.target || u.target.kind === 'bld') {
        const t = acquire(u, sight, [w, u.def.weapon2]);
        if (t && (!u.target || t.kind === 'unit')) u.target = t;
      }
      // Part of a wave: join in on whatever the nearest squadmate is fighting.
      if (!u.target && o.type === 'hunt' && u.group) {
        let bd = Infinity;
        const shooter = u.group.hitBy && u.group.hitBy.alive ? [{ target: u.group.hitBy, avenge: u.group.hitBy }] : [];
        for (const m of u.group.units.concat(shooter)) {
          const t = m.target;
          if (m === u || !t || !t.alive || !canTarget(u, t)) continue;
          const d = distTo(u, t), far = t === m.avenge ? ((t.def.weapon && t.def.weapon.range) || 0) + CELL * 3 : 0;
          if (d < Math.max(sight * 1.4, far) && d < bd) { bd = d; u.target = t; u.avenge = far ? t : u.avenge; }
        }
      }
      if (!u.target) {
        if (o.type === 'hunt' && u.group) {
          // In formation: head for this unit's slot, re-routing only when the slot has moved on.
          const s = slotPos(u);
          u.slotFar = Math.hypot(s.x - u.x, s.y - u.y) > 60;
          if (!u.slotGoal || Math.hypot(s.x - u.slotGoal.x, s.y - u.slotGoal.y) > 18 || (!u.dest && !u.needPath && Math.hypot(s.x - u.x, s.y - u.y) > 12)) {
            u.slotGoal = s; goTo(u, s.x, s.y);
          }
        } else if (o.type === 'hunt') {
          const b = nearestEnemyBuilding(u);
          if (b && (u.huntTarget !== b || (!u.dest && !u.needPath))) { u.huntTarget = b; goTo(u, b.x, b.y); }
        } else if (!u.dest && !u.needPath && Math.hypot(u.x - o.x, u.y - o.y) > 24) goTo(u, o.x, o.y);
      }
    }
  }
  if (o.type === 'move') {
    if (followPath(u, dt) && !u.needPath && !(u.homeward && recoverPilot(u)) && !u.homeward) setGuard(u);
  } else if (u.target) {
    engage(u, u.target, dt);
  } else {
    followPath(u, dt);
  }
  if (u.cls === 'veh' && !u.target) u.tface = turnToward(u.tface, u.face, 3 * dt);
  // Second weapons pick their own targets: Mammoth missiles, a Rocket Soldier's anti-aircraft
  // missile. A soldier has one launcher, so his two weapons share one reload.
  if (u.def.weapon2 && u.cd2 <= 0 && (u.cls !== 'inf' || u.cd <= 0)) {
    const t2 = u.target && canHit(u.def.weapon2, u.target) && distTo(u, u.target) <= u.def.weapon2.range ? u.target : acquire(u, u.def.weapon2.range, [u.def.weapon2]);
    if (t2) {
      if (u.cls === 'inf') { u.face = Math.atan2(t2.y - (t2.alt || 0) - u.y, t2.x - u.x); u.cd = Math.max(u.cd, u.def.weapon2.rof); }
      fireWeapon(u, u.def.weapon2, t2); u.cd2 = u.def.weapon2.rof;
    }
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
    if (u.def.fixed) { u.face = u.tface = turnToward(u.face, ang, u.def.turn * dt); aligned = Math.abs(angDiff(ang, u.face)) < 0.08; }   // no turret: turn the vehicle
    else if (u.cls === 'veh') { u.tface = turnToward(u.tface, ang, 5 * dt); aligned = Math.abs(angDiff(ang, u.tface)) < 0.12; }
    else u.face = ang;
    if (aligned && u.cd <= 0 && w === u.def.weapon) { shoot(u, w, t); u.cd = w.rof; if (u.cls === 'inf' && u.def.weapon2) u.cd2 = Math.max(u.cd2, w.rof); }
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

// Ore trucks run entirely on their own. They work the field nearest their refinery until every
// last bit of it is gone, then the next nearest, leaving worked-out fields to regrow. Within the
// field they go for the richest cells first.
const inFieldCell = (f, x, y) => Math.hypot(x - f.cx, y - f.cy) <= f.r + 0.8;   // ore grows this far out
function fieldValue(f) {
  let ore = 0;
  for (let y = Math.floor(f.cy - f.r - 1); y <= f.cy + f.r + 1; y++) for (let x = Math.floor(f.cx - f.r - 1); x <= f.cx + f.r + 1; x++) {
    if (inMap(x, y) && inFieldCell(f, x, y)) ore += G.ore[idx(x, y)];
  }
  return ore;
}
// How far every cell is from `start` by land, in steps (-1: cannot be reached).
function walkDistances(start) {
  const dist = new Int16Array(NCELLS).fill(-1), q = [start];
  dist[start] = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi], cx = cellX(c), cy = cellY(c);
    for (let i = 0; i < 8; i++) {
      const nx = cx + DIRS8[i][0], ny = cy + DIRS8[i][1];
      if (!inMap(nx, ny)) continue;
      const n = idx(nx, ny);
      if (dist[n] < 0 && freeCell(n)) { dist[n] = dist[c] + 1; q.push(n); }
    }
  }
  return dist;
}
// A truck keeps to its field while any ore is left on it. Then it takes the nearest field by road
// from its refinery (round the lakes, not as the crow flies) that has ore worth the drive and room
// for another truck: once a field has three trucks on it, the rest go on to the next nearest.
const FIELD_EMPTY = 150;   // less ore than this on a field: not worth driving to
const FIELD_TRUCKS = 3;    // most trucks (of either side) working one field
function pickField(u) {
  const others = G.entities.filter((e) => e.alive && e !== u && e.def.harvester && e.field && e.hs !== 'manual');
  if (u.field && fieldValue(u.field) > 0 && others.filter((e) => e.field === u.field).length < FIELD_TRUCKS) return u.field;
  const ref = nearestOwn(u, 'refinery');
  const walk = walkDistances(cellOfPos(ref ? dockPoint(ref).x : u.x, ref ? dockPoint(ref).y : u.y));
  let best = null, bd = Infinity;
  for (const f of G.oreFields) {
    if (fieldValue(f) < FIELD_EMPTY || others.filter((e) => e.field === f).length >= FIELD_TRUCKS) continue;
    for (let y = Math.floor(f.cy - f.r); y <= f.cy + f.r; y++) for (let x = Math.floor(f.cx - f.r); x <= f.cx + f.r; x++) {
      if (!inMap(x, y) || Math.hypot(x - f.cx, y - f.cy) > f.r + 0.8) continue;
      const w = walk[idx(x, y)];
      if (w >= 0 && w < bd) { bd = w; best = f; }
    }
  }
  return best;
}
function findOre(u) {
  const start = cellOfPos(u.x, u.y);
  const seen = new Uint8Array(NCELLS), q = [start];
  seen[start] = 1;
  const f = pickField(u);
  u.field = f;
  const inField = (c) => !f || inFieldCell(f, cellX(c), cellY(c));
  let fallback = -1, best = -1, bs = -Infinity, bestD = Infinity;
  const claimed = new Set();
  for (const e of G.entities) if (e.alive && e !== u && e.def.harvester && e.team === u.team && e.hcell >= 0) claimed.add(e.hcell);
  for (let qi = 0; qi < q.length && qi < 14000; qi++) {
    const c = q[qi];
    if (G.ore[c] > 0) {
      if (fallback < 0 && !claimed.has(c)) fallback = c;
      if (inField(c) && !claimed.has(c)) {
        // Richest cells first, among those reached soon after the first one in the field.
        if (bestD === Infinity) bestD = qi;
        const sc = G.ore[c] * (G.gem[c] ? 2 : 1) - (qi - bestD) * 0.4;
        if (sc > bs) { bs = sc; best = c; }
        if (qi - bestD > 250) break;
      }
    }
    const cx = cellX(c), cy = cellY(c);
    for (let i = 0; i < 8; i++) {
      const nx = cx + DIRS8[i][0], ny = cy + DIRS8[i][1];
      if (!inMap(nx, ny)) continue;
      const n = idx(nx, ny);
      if (!seen[n] && freeCell(n)) { seen[n] = 1; q.push(n); }
    }
  }
  return best >= 0 ? best : fallback;
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
  for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) {
    const x = cx + ox, y = cy + oy;
    if (!inMap(x, y)) continue;
    const c = idx(x, y);
    if (!G.ore[c] || !freeCell(c)) continue;
    const d = dist(u, cellCenter(c)), sc = d - G.ore[c] * (G.gem[c] ? 2 : 1) * 0.15;   // close and rich
    if (sc < bd) { bd = sc; best = c; }
  }
  if (best < 0) { u.hs = 'seek'; u.hcell = -1; return; }
  bd = dist(u, cellCenter(best));
  u.hcell = best;
  if (bd < 36) { u.hs = 'mine'; u.htimer = 0; return; }
  const p = cellCenter(best);
  u.hs = 'seek';
  u.dest = p; u.path = [p]; u.pathIdx = 0; u.needPath = false; u.stuckN = 0;
}

// An Ore Truck that comes under fire heads home to its refinery (unloading what it carries) and
// waits beside it until it has gone unshot for a while and no enemy is left near where it was hit.
function truckRetreat(u, from) {
  u.holdUntil = G.t + 10;
  u.threat = { x: from.x, y: from.y };
  if (u.hs === 'seek' || u.hs === 'mine') { u.hs = 'return'; u.hcell = -1; u.dest = null; u.path = null; }
}
function threatNear(u) {
  if (!u.threat) return false;
  return G.entities.some((e) => e.alive && e.kind === 'unit' && e.team !== u.team && !e.def.scripted && Math.hypot(e.x - u.threat.x, e.y - u.threat.y) < CELL * 9);
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
        if (G.gem[c]) u.bonus = (u.bonus || 0) + take;   // gems are worth twice as much as ore
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
        const amt = Math.min(80, u.load), extra = Math.min(u.bonus || 0, amt);
        u.load -= amt; u.bonus = (u.bonus || 0) - extra;
        const gain = (amt + extra) * (team.isAI ? G.diff.income : 1);
        team.credits += gain; team.stats.harvested += gain;
        if (u.load <= 0) {
          u.load = 0; u.hs = 'seek';
          if (G.t < (u.holdUntil || 0)) {   // retreating: wait to one side of the refinery, clear of the dock
            u.hs = 'wait'; u.htimer = u.holdUntil - G.t;
            const a = Math.random() * Math.PI * 2, x = u.ref.x + Math.cos(a) * CELL * 3, y = u.ref.y + CELL * 1.5 + Math.abs(Math.sin(a)) * CELL * 2;
            const c = nearestFreeCell(cellOfPos(x, y), 4);
            if (c >= 0) { const q = cellCenter(c); goTo(u, q.x, q.y); }
          }
        }
      }
      break;
    }
    case 'wait':
      u.htimer -= dt;
      if (u.htimer <= 0) {
        if (G.t < (u.holdUntil || 0) || threatNear(u)) u.htimer = 2;   // still dangerous out there
        else { u.hs = 'seek'; u.threat = null; }
      }
      break;
    case 'manual':
      if (!u.dest && !u.needPath) u.hs = u.load >= cap ? 'return' : 'seek';
      break;
  }
}

// --- Aircraft ---------------------------------------------------------------
// Loads: ammo (main weapon), aam (jets' air-to-air missiles), bombs (jets), flares (jets).
const airLoad = (d) => ({ ammo: d.weapon ? d.weapon.ammo : 0, aam: d.weapon2 ? d.weapon2.ammo : 0, bombs: d.bombs || 0 });
const airEmpty = (u) => u.ammo <= 0 && !(u.aam > 0) && !(u.bombs > 0);
function airFull(u) { const L = airLoad(u.def); return u.ammo >= L.ammo && (u.aam || 0) >= L.aam && (u.bombs || 0) >= L.bombs; }
function rearmStep(u) {
  const L = airLoad(u.def);
  if (u.ammo < L.ammo) u.ammo++;
  else if ((u.aam || 0) < L.aam) u.aam = (u.aam || 0) + 1;
  else if ((u.bombs || 0) < L.bombs) u.bombs = Math.min(L.bombs, (u.bombs || 0) + 2);
  u.flares = u.def.flares || 0;
}
function airWeapons(u) {
  const ws = [];
  if (u.ammo > 0 || u.bombs > 0) ws.push(u.def.weapon);
  if (u.aam > 0 && u.def.weapon2) ws.push(u.def.weapon2);
  return ws;
}
// A jet with a missile or rocket closing in pops flares; while they burn, each incoming
// missile has a fair chance (45%) to chase a flare instead.
function popFlares(t) {
  if (t.flares > 0 && G.t >= (t.flareCd || 0)) {
    t.flares--; t.flareCd = G.t + 3; t.flareT = G.t + 1.2;
    t.flareSeq = { left: 5, next: G.t, side: Math.random() < 0.5 ? 1 : -1 };   // released one at a time: see dropFlare
  }
  return G.t < (t.flareT || 0);
}
// A burst of flares comes out one by one, about 0.7 s apart, from wherever the jet is by then,
// alternating sides, so they string out behind it as it flies on.
function dropFlare(t) {
  const q = t.flareSeq;
  if (!q || G.t < q.next) return;
  if (q.left-- === 1) t.flareSeq = null;
  q.next = G.t + 0.6 + Math.random() * 0.2; q.side = -q.side;
  hooks.sfx('throw', t.x, t.y);
  // Each keeps some of the jet's speed at first, then drags to a halt and sinks.
  const a = t.face + Math.PI + q.side * (0.5 + Math.random() * 0.4), sp = (t.speedCur || t.def.speed) * 0.45;
  G.effects.push({ type: 'flare', x: t.x - Math.cos(t.face) * 10, y: t.y - (t.alt || 0) - Math.sin(t.face) * 10,
    vx: Math.cos(a) * 34 + Math.cos(t.face) * sp, vy: Math.sin(a) * 20 + Math.sin(t.face) * sp, t: 0, life: 2.8, trail: [] });
}

const HELI_ALT = 20, JET_ALT = 30;

// Every aircraft has a home pad. New ones are based at whichever pad has the fewest aircraft,
// and if a home pad is lost they move to the least crowded one left, so aircraft spread out
// over all the player's Helipads or Airfields instead of piling onto the nearest.
const padUsable = (b, team, type) => b && b.alive && b.kind === 'bld' && b.team === team && b.type === type && b.sellT <= 0;
function padLoads(team, type) {
  const loads = new Map();
  for (const e of G.entities) if (padUsable(e, team, type)) loads.set(e.id, 0);
  for (const e of G.entities) if (e.alive && e.kind === 'unit' && e.team === team && e.home && loads.has(e.home)) loads.set(e.home, loads.get(e.home) + 1);
  return loads;
}
function leastBusyPad(team, type, near) {
  let best = null, bl = Infinity, bd = Infinity;
  for (const [id, n] of padLoads(team, type)) {
    const p = G.byId.get(id), d = near ? dist(near, p) : 0;
    if (n < bl || (n === bl && d < bd)) { best = p; bl = n; bd = d; }
  }
  return best;
}
function padFor(u) {
  const type = u.def.producer;
  if (!type) return null;
  const home = u.home && G.byId.get(u.home);
  if (padUsable(home, u.team, type)) return home;
  const p = leastBusyPad(u.team, type, u);
  u.home = p ? p.id : null;
  return p;
}
function padSpot(pad, u) {
  // Each aircraft based at a pad gets its own parking slot: on the runway and the apron below it,
  // or on the pad and the ground around it for helicopters.
  const mates = G.entities.filter((e) => e.alive && e.kind === 'unit' && e.team === u.team && e.home === pad.id).sort((a, b) => a.id - b.id);
  const k = Math.max(0, mates.indexOf(u)) % 6;
  if (pad.type === 'airfield') return { x: pad.cx * CELL + 14 + (k % 3) * 22, y: pad.cy * CELL + (k < 3 ? 27 : 56) };
  return [{ x: pad.x, y: pad.y }, { x: pad.x + 36, y: pad.y - 4 }, { x: pad.x + 34, y: pad.y + 28 },
    { x: pad.x - 36, y: pad.y - 4 }, { x: pad.x - 34, y: pad.y + 28 }, { x: pad.x, y: pad.y + 40 }][k];
}

function airTarget(u) {
  const o = u.order, sight = u.def.sight * CELL * (u.def.fly === 'jet' ? 1.6 : 1);
  if (o.type === 'attack') { if (o.target.alive) return o.target; setGuard(u); }
  if (o.type === 'move' && u.def.fly === 'heli') return null;
  const ws = airWeapons(u);
  if (u.target && u.target.alive && ws.some((w) => canHit(w, u.target)) && distTo(u, u.target) < sight * 1.4) return u.target;
  const src = o.type === 'guard' ? { x: o.x, y: o.y, team: u.team } : u;
  return ws.length ? acquire(src, sight, ws) : null;
}

function updateAir(u, dt) {
  const w = u.def.weapon, jet = u.def.fly === 'jet';
  if (u.flareSeq) dropFlare(u);
  if (u.target && !u.target.alive) u.target = null;
  if (u.order.type === 'attack' && !u.order.target.alive) setGuard(u);   // its target is gone: hold here

  if (u.as === 'landed') {
    u.alt = 0; u.speedCur = 0;
    u.rt += dt;
    if (!airFull(u) && u.rt >= (jet ? 1.5 : 0.5)) { rearmStep(u); u.rt = 0; }
    // Ground crews patch up damage at the same rate and price as structure repairs: 2% of its
    // health every quarter second for 1% of its price, so a full repair costs half the price.
    u.repairing = false;
    if (u.hp < u.maxHp && padFor(u) && Math.hypot(padFor(u).x - u.x, padFor(u).y - u.y) < CELL * 3) {
      const team = G.teams[u.team], cost = Math.max(1, u.def.cost * 0.01);
      if (team.credits >= cost) {
        u.repairing = true;
        if ((u.repT = (u.repT || 0) + dt) >= 0.25) { u.repT = 0; team.credits -= cost; u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.02); }
      } else notify(team, 'funds', 'Insufficient funds', 8);
    }
    if (u.repairHold && u.hp >= u.maxHp) u.repairHold = false;
    // Aircraft told to wait on their pad stay parked until auto attack, an order or a raid sends them up.
    // They also wait while repairs are under way, and one that came home damaged waits until it is
    // fully repaired, even if that means waiting for money.
    if (airFull(u) && !u.repairing && !u.repairHold && u.order.type !== 'rearm-hold' && !(u.order.type === 'guard' && u.order.pad)) u.as = 'takeoff';
    return;
  }
  if (u.as === 'takeoff') {
    u.alt = Math.min(jet ? JET_ALT : HELI_ALT, u.alt + (jet ? 25 : 18) * dt);
    if (jet) { u.speedCur = Math.min(u.def.speed, u.speedCur + 160 * dt); u.x += Math.cos(u.face) * u.speedCur * dt; u.y += Math.sin(u.face) * u.speedCur * dt; u.moving = true; }
    if (u.alt >= (jet ? JET_ALT : HELI_ALT)) u.as = 'fly';
    clampAir(u);
    return;
  }

  // Badly damaged: break off and fly home, then stay on the pad until fully repaired. Short of
  // money, repairs pause until the Ore Trucks bring more in. A direct player order sends it out
  // early; aircraft already on one keep to it.
  if (!u.retreat && u.hp < u.maxHp * 0.35 && (u.order.type === 'hunt' || u.order.type === 'guard') && padFor(u)) {
    u.retreat = true;
    if (u.team === PLAYER) notify(G.teams[u.team], 'retreat', 'Aircraft returning for repairs', 10);
  }
  if (u.retreat && !padFor(u)) u.retreat = false;   // pad lost on the way: fight on
  // Out of ammo, retreating, or told to wait on the pad: head home and land.
  // Jets go home once their missiles and bombs for ground targets are spent, keeping any
  // air-to-air missiles for enemy aircraft met on the way (or for an air target the player picked).
  const o0 = u.order, huntingAir = o0.type === 'attack' && o0.target.alive && isAirborne(o0.target) && u.aam > 0;
  const strikeSpent = jet && u.ammo <= 0 && !(u.bombs > 0) && !huntingAir;
  if (airEmpty(u) || strikeSpent || u.retreat || (u.order.type === 'guard' && u.order.pad)) {
    const pad = padFor(u);
    if (pad) {
      const spot = padSpot(pad, u);
      const d = Math.hypot(spot.x - u.x, spot.y - u.y);
      if (jet) {
        if (u.aam > 0 && u.cd <= 0) {
          const a = acquire(u, u.def.weapon2.range, [u.def.weapon2]);
          if (a && Math.abs(angDiff(Math.atan2(a.y - u.y, a.x - u.x), u.face)) < 0.5) { shoot(u, u.def.weapon2, a); u.cd = u.def.weapon2.rof; u.aam--; }
        }
        if (d < 26) { u.as = 'landed'; u.x = spot.x; u.y = spot.y; u.face = 0; u.rt = 0; if (u.retreat) u.repairHold = true; u.retreat = false; return; }
        flyJet(u, spot.x, spot.y, dt);
      } else {
        if (d < 3) { u.alt = Math.max(0, u.alt - 20 * dt); if (u.alt <= 0) { u.as = 'landed'; u.rt = 0; if (u.retreat) u.repairHold = true; u.retreat = false; } return; }
        flyHeli(u, spot.x, spot.y, dt);
      }
      return;
    }
    // No pad: limp back to base and rearm slowly in the air.
    u.rt += dt;
    if (u.rt > 6) { while (!airFull(u)) rearmStep(u); u.rt = 0; }
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
      const d = distTo(u, t), ang = Math.atan2(t.y - u.y, t.x - u.x), air = isAirborne(t);
      // Air targets get air-to-air missiles; ground targets get missiles from range, then bombs overhead.
      const mw = air ? (u.aam > 0 ? u.def.weapon2 : null) : (u.ammo > 0 ? w : null);
      if (mw && d <= mw.range && Math.abs(angDiff(ang, u.face)) < 0.35 && u.cd <= 0) {
        shoot(u, mw, t); u.cd = mw.rof;
        if (air) u.aam--; else u.ammo--;
        if (Math.random() < 0.5) u.passT = 0.9;
      } else if (!air && u.bombs > 0 && d < 12 && u.cd2 <= 0) {
        for (let i = 0; i < 2; i++) {
          const ox = Math.cos(u.face) * i * 14, oy = Math.sin(u.face) * i * 14;
          G.projectiles.push({ kind: 'bomb', team: u.team, from: u, w: u.def.bomb, tx: u.x + ox, ty: u.y + oy, x: u.x + ox, y: u.y + oy - u.alt, z: u.alt, t: 0, dur: 0.5, delay: i * 0.08 });
        }
        u.bombs -= 2; u.cd2 = 1.2; u.passT = 0.9;
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
    setHunt(u); u.raider = true;   // once down, they wreck the nearest structures, one after another
  });
}

// ---------------------------------------------------------------------------
// Structures
// ---------------------------------------------------------------------------
const REPAIR_STEP = 0.00375;   // share of full health restored every quarter second (1.5% a second)
function updateBuilding(b, dt) {
  const team = teamOf(b);
  b.fireT = Math.max(0, b.fireT - dt);
  b.charge = Math.max(0, b.charge - dt * 1.5);
  if (b.buildT < 1) {
    b.buildT = Math.min(1, b.buildT + dt / 1.4);
    // Clanks and hammering while it goes up.
    if ((b.clankT = (b.clankT || 0) - dt) <= 0) { b.clankT = 0.28 + Math.random() * 0.12; hooks.sfx('build', b.x + (Math.random() - 0.5) * b.w * CELL, b.y); }
  }
  if (b.sellT > 0) {
    b.sellT -= dt;
    if (b.sellT <= 0) { b.sellT = 0.0001; team.credits += Math.floor(b.def.cost * 0.5 * b.hp / b.maxHp); kill(b, null); }
    return;
  }
  if (b.repairing) {
    // Repairs take about a minute from nearly wrecked to whole, and crawl at a quarter of that
    // while the structure is under fire, so a determined attack can still bring it down. A full
    // repair costs half the structure's price.
    b.repT = (b.repT || 0) + dt * (G.t - b.hitT < 2 ? 0.25 : 1);
    if (b.repT >= 0.25) {
      b.repT = 0;
      const heal = b.maxHp * REPAIR_STEP, cost = Math.max(1, b.def.cost * 0.5 * REPAIR_STEP);
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
    if (b.type === 'apower' && b.buildT >= 1) for (const [tx, ty, h] of [[15, 17, 40], [41, 17, 40]]) if (Math.random() < 0.5) G.effects.push({ type: 'smoke', x: b.cx * CELL + tx, y: b.cy * CELL + ty - h * VK, vy: -16, vx: 6, r: 3, t: 0, life: 2, alpha: 0.4, color: '#c9c7c0' });
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

// How far (in cells) from one of its own structures a side may place a new one; Outposts reach further.
const BUILD_RANGE = 6;
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
    const reach = b.def.buildRadius || BUILD_RANGE;
    if (b.team === team.id && cx <= b.cx + b.w + reach && cx + d.w >= b.cx - reach && cy <= b.cy + b.h + reach && cy + d.h >= b.cy - reach) near = true;
  }
  return near;
}

function placeStructure(team, type, cx, cy) {
  const q = team.queues.structure;
  if (!q || !q.ready || q.type !== type || !canPlace(team, type, cx, cy, team.isAI ? 1 : 0)) return false;
  team.queues.structure = null;
  const b = addBuilding(type, team, cx, cy);
  hooks.sfx('place', b.x, b.y);
  hooks.sfx('build', b.x, b.y);
  if (type === 'refinery') {
    const p = cellCenter(b.exitCell);
    const h = addUnit('harv', team, p.x, p.y);
    h.face = Math.PI / 2;
  }
  // A new Helipad comes with a helicopter and a new Airfield with a jet, parked and ready.
  if (type === 'helipad' || type === 'airfield') {
    const free = Object.keys(UNIT_DEFS).find((k) => UNIT_DEFS[k].producer === type && UNIT_DEFS[k].factions.includes(team.faction));
    if (free) spawnUnit(team, free);
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
  if (UNIT_DEFS[type]) return hasBuilt(team, d.producer) && (d.req || []).every((r) => hasBuilt(team, r));
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

// Each extra Barracks or War Factory speeds up its queue: 1.5x with two, 2x with three, at most
// 2.5x. Production still runs one unit at a time per queue.
const PRODUCER_BOOST = [1, 1, 1.5, 2, 2.5];
function producerBoost(team, def) {
  if (def.producer !== 'barracks' && def.producer !== 'factory') return 1;
  const n = G.entities.filter((e) => e.alive && e.kind === 'bld' && e.team === team.id && e.type === def.producer && e.sellT <= 0).length;
  return PRODUCER_BOOST[Math.min(n, PRODUCER_BOOST.length - 1)];
}
function updateProduction(team, dt) {
  const speed = (team.low ? 0.5 : 1) * (team.isAI ? G.diff.speed : 1);
  for (const cat of CATEGORIES) {
    const item = cat === 'structure' ? team.queues.structure : team.queues[cat][0];
    if (!item || item.ready) continue;
    if (!available(team, item.type)) continue;
    const def = defOf(item.type);
    const dp = Math.min(dt * speed * producerBoost(team, def) / buildTime(def), 1 - item.progress);
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
  const p = d.cls === 'air' ? leastBusyPad(team.id, d.producer) : producers[producers.length - 1];
  if (!p) return null;
  let u;
  if (d.cls === 'air') {
    u = addUnit(type, team, 0, 0);
    u.home = p.id;
    const spot = padSpot(p, u);
    u.x = spot.x; u.y = spot.y; u.face = p.type === 'airfield' ? 0 : (team.id === PLAYER ? -0.8 : 2.35);
    u.as = 'landed'; u.alt = 0;
    setGuard(u); u.order.pad = true; u.staged = true;
    if (team.isAI && aiKeepInterceptor(team, u)) return u;
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
  if (team.isAI && aiHomeGuard(team, u)) return u;
  // New units spread out around the base; auto attack launches them in groups.
  const { x: gx, y: gy } = scatterSpot(team);
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
  const worked = new Set(G.entities.filter((e) => e.alive && e.def.harvester && e.field && e.hs !== 'manual').map((e) => e.field));
  for (const f of G.oreFields) {
    if (f.gem) continue;   // gems never grow back
    if (worked.has(f)) continue;   // only while no truck is working it: no new scraps to chase
    {   // one cell a field every couple of seconds: a scraped-out field takes several minutes to recover
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (f.r + 0.8);
      const x = Math.floor(f.cx + Math.cos(a) * d), y = Math.floor(f.cy + Math.sin(a) * d);
      const c = inMap(x, y) ? idx(x, y) : -1;
      const cap = Math.round(Math.min(ORE_MAX, (60 + (1 - Math.min(1, d / f.r)) * 190) * f.rich));
      if (c >= 0 && !G.block[c] && !G.bld[c] && G.ore[c] < cap) G.ore[c] = Math.min(cap, G.ore[c] + 15);
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
    u.target = null; u.staged = false; u.defending = false; u.homeward = false;
    if (u.def.harvester) {
      const c = cellOfPos(x, y);
      if (G.ore[c] > 0) { u.hcell = c; u.hs = 'seek'; goTo(u, x, y); }
      else { u.hs = 'manual'; goTo(u, s.x, s.y); }
    } else if (u.cls === 'air') {
      if (airEmpty(u)) return;
      u.repairHold = false; u.retreat = false;
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
    u.order = { type: 'attack', target }; u.staged = false; u.homeward = false; u.defending = false; u.repairHold = false; u.retreat = false;
    u.target = target;
    if (u.cls === 'air' && u.as === 'landed' && !airEmpty(u)) u.as = 'takeoff';
  }
}
function commandHunt(units) {
  for (const u of units) if (!u.def.harvester) { setHunt(u); u.staged = false; u.defending = false; if (u.cls === 'air' && u.as === 'landed' && !airEmpty(u)) u.as = 'takeoff'; }
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
  updateGroups(dt);
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
    else if (fx.type === 'frag') updateFrag(fx, dt);
    else if (fx.type === 'eject') updateEject(fx, dt);
    else if (fx.type === 'ragdoll') updateRagdoll(fx, dt);
    else if (fx.type === 'turret') updateTurret(fx, dt);
    else if (fx.type === 'flare' && fx.t >= 0) {
      fx.vx *= Math.exp(-1.4 * dt); fx.vy += (14 - fx.vy) * (1 - Math.exp(-1.2 * dt));   // drag, then a slow fall
      if ((fx.trailT = (fx.trailT || 0) - dt) <= 0) { fx.trailT = 0.05; fx.trail.push({ x: fx.x, y: fx.y }); if (fx.trail.length > 18) fx.trail.shift(); }
    }
    else if (fx.type === 'smoulder' && (fx.puffT -= dt) <= 0) {
      fx.puffT = 0.35 + fx.t / fx.life * 0.6;
      G.effects.push({ type: 'smoke', x: fx.x + (Math.random() - 0.5) * 4, y: fx.y, r: 2.5, t: 0, life: 2.2, alpha: 0.45 * (1 - fx.t / fx.life), color: '#35322e', vy: -9, vx: 3 });
    }
    fx.t += dt;
    if (fx.drag && fx.t > 0) { const k = Math.exp(-fx.drag * dt); fx.vx *= k; fx.vy = fx.vy * k - 3 * (1 - k); }   // billowing smoke slows, then rises
    if (fx.vy && fx.t > 0 && fx.type !== 'crash' && fx.type !== 'ragdoll' && fx.type !== 'turret') { fx.y += fx.vy * dt; fx.x += (fx.vx || 0) * dt; }
  }
  G.effects = G.effects.filter((fx) => fx.t < fx.life);
  if (G.entities.some((e) => !e.alive)) {
    for (const e of G.entities) if (!e.alive) G.byId.delete(e.id);
    G.entities = G.entities.filter((e) => e.alive);
    G.selection = G.selection.filter((e) => e.alive);
  }
  for (const team of G.teams) team.shown += Math.sign(team.credits - team.shown) * Math.min(Math.abs(team.credits - team.shown), Math.max(60, Math.abs(team.credits - team.shown) * 0.2) * dt * 10);
}
