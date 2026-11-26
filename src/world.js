'use strict';
// Simulation: map, pathfinding, units, structures, combat, harvesting and production.

let G = null;
const PLAYER = 0, ENEMY = 1;   // the two sides; which one is "you" is G.me
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

const idx = (cx, cy) => cy * MAP + cx;
const cellX = (c) => c % MAP, cellY = (c) => (c / MAP) | 0;
const cellOfPos = (x, y) => idx(Math.max(0, Math.min(MAP - 1, Math.floor(x / CELL))), Math.max(0, Math.min(MAP - 1, Math.floor(y / CELL))));
const cellCenter = (c) => ({ x: cellX(c) * CELL + CELL / 2, y: cellY(c) * CELL + CELL / 2 });
const inMap = (cx, cy) => cx >= 0 && cy >= 0 && cx < MAP && cy < MAP;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
function turnToward(cur, target, step) { const d = angDiff(target, cur); return Math.abs(d) <= step ? target : cur + Math.sign(d) * step; }

// evaFor(side, msg): the announcer for a human side this device does not show (the PvP guest).
let hooks = { eva() {}, evaFor() {}, gameOver() {}, sfx() {}, shake() {} };

// ---------------------------------------------------------------------------
// New game
// ---------------------------------------------------------------------------
// The two sides are 0 and 1. `G.me` is the side this device shows and takes orders for (its
// camera, map, sidebar, announcer and debrief); either side can be "you". `G.fog[side]` is what
// each side has uncovered, and `G.seen` is the one this device draws, `G.fog[G.me]`.
// `me`: the side the human plays (default 0). The other side is the computer, or with `pvp`
// a second human (online: see net.js).
// sides (optional, for team games): one entry per side, { faction, ally, ai, name }. Sides with the
// same `ally` fight together and share what they have uncovered (their G.fog entries are one array).
// Without it: the classic 1 v 1, this device's side (me) against the computer (or, pvp, a person).
// empty: the map explorer (ui.js startExplore): no starting bases or units, and no battle to win or lose (G.explore).
function newWorld(playerFaction, diffKey, seed, me = PLAYER, pvp = false, mapId = DEFAULT_MAP, sides = null, empty = false) {
  seed = seed || (Math.random() * 1e9) | 0;
  mapId = validMap(mapId);
  setMapSize(mapSize(mapId));
  const enemyFaction = playerFaction === 'allies' ? 'soviets' : 'allies';
  if (!sides) {
    sides = [0, 1].map((i) => (i === me ? { faction: playerFaction, ally: i, ai: false } : { faction: enemyFaction, ally: i, ai: !pvp }));
  }
  const teams = sides.map((d, i) => Object.assign(makeTeam(i, d.faction, !!d.ai), { ally: d.ally, name: d.name || null }));
  // A teammate of the same faction as an earlier teammate gets the faction's alternate colours (a third, in
  // 3 v 3, the second alternate).
  teams.forEach((t, i) => {
    const n = teams.slice(0, i).filter((o) => o.ally === t.ally && o.faction === t.faction).length;
    if (n) { t.variant = Math.min(2, n); t.pal = FACTIONS[t.faction][n > 1 ? 'alt2' : 'alt']; }
  });
  const fogFor = new Map();
  const fog = teams.map((t) => fogFor.get(t.ally) || fogFor.set(t.ally, new Uint8Array(NCELLS)).get(t.ally));
  G = {
    t: 0, seed, mapId, diff: DIFFICULTY[diffKey], diffKey, nextId: 1,
    entities: [], byId: new Map(), effects: [], projectiles: [], pathQueue: [], groups: [],
    terr: new Uint8Array(NCELLS), block: new Uint8Array(NCELLS), bld: new Int32Array(NCELLS), resv: new Uint8Array(NCELLS),
    ore: new Uint16Array(NCELLS), gem: new Uint8Array(NCELLS), oreRich: teams.length > 2 ? TEAM_ORE_RICH : 1, fog, me, seen: fog[me] || fog[0], shroudDirty: true, oreFields: [],
    selection: [], place: null, over: null, paused: false,
    timers: { power: 0, shroud: 0, ore: 0, ai: 0, win: 0, log: 0 },
    log: { samples: [], events: [], fallen: [], waves: teams.map(() => 0), lastH: teams.map(() => 0) },   // for the debrief
    teams,
  };
  for (const t of teams) if (t.isAI) t.credits = G.diff.credits;
  // Start positions: a random one for side 0, and for the enemy a random one from the other half of
  // the list (across the lakes or the river), so the two bases never start on the same side. In a
  // team game (2 v 2, 3 v 3, co-op) each alliance gets its own half, one position each, none shared.
  const sr = rng(Math.imul(seed ^ 0x2545f491, 0x9e3779b1) ^ (seed >>> 7)); sr(); sr();
  G.spawns = spawnPoints(mapId);
  const nh = G.spawns.length / 2;
  if (teams.length === 2 && teams[0].ally !== teams[1].ally) {
    const pi = Math.floor(sr() * nh * 2), ei = (pi < nh ? nh : 0) + Math.floor(sr() * nh);
    teams[0].start = { ...G.spawns[pi] };
    teams[1].start = { ...G.spawns[ei] };
  } else {
    const flip = sr() < 0.5, used = new Set();
    for (const t of teams) {
      const half = (t.ally % 2 === 0) !== flip ? 0 : nh;
      let free = [];
      for (let i = half; i < half + nh; i++) if (!used.has(i)) free.push(i);
      // (more sides in an alliance than its half has start positions: any free one; battleFits keeps
      // the menus from offering such a battle)
      if (!free.length) free = G.spawns.map((_, k) => k).filter((k) => !used.has(k));
      const i = free[Math.floor(sr() * free.length)];
      used.add(i);
      t.start = { ...G.spawns[i] };
    }
  }
  ensureWalls();
  genMap(seed);
  G.hgt = makeHeights(G.mapId);   // hills: the height of the ground (Tiberian Sun look test, with high-ground rules)
  // The ground, painted in tiles as it is looked at, and the marks of battle (art.js makeGround): G.tctx is
  // the ground's layer, G.dctx the layer of bodies and wrecks above it, so later craters and scorch marks
  // never paint over them.
  newGround(G);
  G.weather = rollWeather(mapId, seed);   // rain or snow for this battle, or none (looks only; art.js drawWeather)

  if (empty) { G.explore = true; for (const t of G.teams) t.isAI = false; }
  else for (const team of G.teams) {
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
// Which side this device shows. Switching it redraws the map from that side's view.
function setViewer(side) {
  G.me = side; G.seen = G.fog[side]; G.shroudDirty = true;
  G.selection = []; G.place = null;
}
// Alliances: sides with the same `ally` number fight together (a team game); in a 1 v 1 each side
// is its own. `hostile` is the test for "enemy" everywhere.
const hostile = (a, b) => a !== b && !!G.teams[a] && !!G.teams[b] && G.teams[a].ally !== G.teams[b].ally;
const alliedSides = (a, b) => a === b || (!!G.teams[a] && !!G.teams[b] && G.teams[a].ally === G.teams[b].ally);
const foesOf = (side) => G.teams.filter((t) => hostile(side, t.id)).map((t) => t.id);
const foeOf = (side) => foesOf(side)[0];
const teamGame = () => G.teams.length > 2;

function makeTeam(id, faction, isAI) {
  return {
    id, faction, isAI, pal: FACTIONS[faction].pal, credits: 10000, shown: 10000, start: null,
    power: { prod: 0, use: 0 }, low: false, auto: !!isAI, focusSide: null,
    queues: { structure: null, defense: null, infantry: [], vehicle: [], heli: [], jet: [] },
    stats: { built: 0, units: 0, lost: 0, killed: 0, bldKilled: 0, bldLost: 0, harvested: 0 },
    cool: {}, powers: { spy: 0, para: 0, bomb: 0, cas: 0 }, upgrades: {}, research: null, defending: false, calm: 0, allyCalm: 0, assist: false, assistSide: null, harvHit: null,
  };
}

// ---------------------------------------------------------------------------
// Map "bridge" (A Bridge Too Far, see maps.js): a fixed layout after the classic "A Path Beyond", with random dressing
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
// The layout was designed on an 88-cell map; K scales it to the default map size (144: genMap's map,
// A Bridge Too Far, has no `size` of its own, so these are worked out once, at that size).
const MID = (MAP - 1) / 2, K = MAP / 88, S96 = MAP / 96;
// Ore fields grow with the map (FR is 1 at 112 cells), but each keeps its inner edge where it was, so the
// ground around a start position stays as open for building as before. Gem fields stay small: they are rare.
const FR = MAP / 112;
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
function spawnPoints(mapId) {
  if (MAPS[mapId] && MAPS[mapId].rows) return MAPS[mapId].spawns.map(([cx, cy]) => ({ cx, cy }));
  const half = SPAWNS_HALF.map((s) => ({ cx: Math.round(s.at[0] * S96), cy: Math.round(s.at[1] * S96) }));
  return half.concat(half.map((s) => ({ cx: MAP - 1 - s.cx, cy: MAP - 1 - s.cy })));
}

// ---- Terrain height (Tiberian Sun look test: "Height with rules", both modes; docs/NOTES.md "Tiberian Sun look") ----
// G.hgt: the ground's height at every cell's middle, in world pixels (0 to HG_MAX), the same on every copy of the battle
// (the server's and every phone's): worked out from the map's own layout and its ground seed, never at random. Rolling hills
// from two layers of smooth noise, flat low ground near water (so shores, bridges and fords stay level) and level ground
// round every start position (a base needs flat ground), at that spot's own height. Cliffs keep their own (they block).
// hgtAt(x, y): the height anywhere, between cell middles smoothly. Rules (all here, so online copies agree):
//  - sight: +HG_SIGHT cells at the top of a hill (revealAround);
//  - reach: firing down from high ground reaches up to HG_DOWN further, up a hill up to HG_UP less (distTo);
//  - speed: up a slope slower, down it a little faster (slopeMul in followPath and slideOut).
const HG_MAX = 30, HG_SIGHT = 2, HG_DOWN = 0.2, HG_UP = 0.1, BASE_FLAT = 21, BASE_EASE = 9;
function makeHeights(mapId) {
  const h = new Float32Array(NCELLS), seed = MAPS[validMap(mapId)].rows ? 0x2b1d5eed : G.seed;
  const hash = (i, j, k) => { let v = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k + seed, 1442695041); v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };
  const S = (a) => a * a * (3 - 2 * a);
  const vn = (x, y, sc, k) => { const fx = x / sc, fy = y / sc, i = Math.floor(fx), j = Math.floor(fy), u = S(fx - i), v = S(fy - j);
    const a = hash(i, j, k), b = hash(i + 1, j, k), c = hash(i, j + 1, k), d = hash(i + 1, j + 1, k);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v; };
  // How far each cell is from water (in cells, up to 6).
  const wd = new Uint8Array(NCELLS).fill(255), q = [];
  for (let c = 0; c < NCELLS; c++) if (G.terr[c] >= 4) { wd[c] = 0; q.push(c); }
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % MAP, y = (c / MAP) | 0;
    if (wd[c] >= 6) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= MAP || ny >= MAP) continue; const n = ny * MAP + nx; if (wd[n] === 255) { wd[n] = wd[c] + 1; q.push(n); } }
  }
  const raw = (x, y) => { const n = vn(x, y, 16, 1) * 0.65 + vn(x, y, 7, 2) * 0.35; return HG_MAX * S(Math.max(0, Math.min(1, (n - 0.42) / 0.38))); };
  // Every base on level ground out to BASE_FLAT cells (a whole base and the AI's wall ring round it), then easing into the
  // hills over BASE_EASE. All starts alike, so no side starts with the high ground: low ground (0), or on a map with
  // `startHill` a broad hilltop (HG_MAX), but only if every start is far enough from water (heights drop to 0 at shores).
  const sp = G.spawns || [], hillOk = MAPS[validMap(mapId)].startHill && sp.every((p) => {
    for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) if (G.terr[y * MAP + x] >= 4 && Math.hypot(x - p.cx, y - p.cy) < BASE_FLAT + 5) return false;
    return true; });
  const flat = sp.map((p) => [p.cx + 0.5, p.cy + 0.5, hillOk ? HG_MAX : 0]);
  // A map with `plateau` (Heron Fen): every base on a high plateau, flat out to r cells, falling to the low ground over
  // ease (its cliffs and ramps are in the layout); the low ground only gentle swells (low x the usual hills).
  const pl = MAPS[validMap(mapId)].plateau;
  const mesas = MAPS[validMap(mapId)].mesas || [];
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
    const c = y * MAP + x;
    let v = raw(x + 0.5, y + 0.5);
    if (pl) {
      v *= pl.low;
      for (const p of sp) { const d = Math.hypot(x - p.cx, y - p.cy); v = Math.max(v, HG_MAX * (1 - S(Math.max(0, Math.min(1, (d - pl.r) / pl.ease))))); }
    } else for (const [fx, fy, fh] of flat) { const d = Math.hypot(x + 0.5 - fx, y + 0.5 - fy); if (d < BASE_FLAT + BASE_EASE) { const k = S(Math.max(0, Math.min(1, (d - BASE_FLAT) / BASE_EASE))); v = fh + (v - fh) * k; } }
    for (const m of mesas) {   // a map's `mesas`: high ground ringed by cliff, with a ramp (Lakeside)
      const dx = x + 0.5 - m.x, dy = y + 0.5 - m.y, d = Math.hypot(dx, dy);
      const T = HG_MAX * (m.h || 1);   // the top's height
      v *= S(Math.max(0, Math.min(1, (d - m.r) / 6)));   // the low ground round its foot level, so its walls are as tall all round
      v = Math.max(v, T * (1 - S(Math.max(0, Math.min(1, (d - m.top) / (m.r - m.top))))));   // sheer: down under the rim's rock
      const along = dx * m.ramp[0] + dy * m.ramp[1], across = Math.abs(-dx * m.ramp[1] + dy * m.ramp[0]);
      if (along > 0) v = Math.max(v, T * (1 - S(Math.max(0, Math.min(1, (along - m.top) / m.rampLen))))
        * (1 - S(Math.max(0, Math.min(1, (across - m.rampW) / 2)))));
    }
    v *= S(Math.min(1, (wd[c] === 255 ? 6 : wd[c]) / 5));   // down to the water's edge
    h[c] = G.terr[c] >= 4 ? 0 : v;
  }
  return h;
}
function hgtAt(x, y, noDig) {   // (noDig: the ground before any crater was dug)
  const H = G.hgt;
  if (!H) return 0;
  const fx = Math.max(0, Math.min(MAP - 1.001, x / CELL - 0.5)), fy = Math.max(0, Math.min(MAP - 1.001, y / CELL - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, x1 = Math.min(MAP - 1, x0 + 1), y1 = Math.min(MAP - 1, y0 + 1);
  let a = H[y0 * MAP + x0], b = H[y0 * MAP + x1], c = H[y1 * MAP + x0], d = H[y1 * MAP + x1];
  const D = G.dig;   // craters dug by heavy blasts (digCrater)
  if (D && !noDig) { a += D[y0 * MAP + x0]; b += D[y0 * MAP + x1]; c += D[y1 * MAP + x0]; d += D[y1 * MAP + x1]; }
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}
// The ground height a unit or structure stands on (aircraft in the air: none of these rules).
function standH(e) {
  if (!G.hgt || !e || e.x === undefined || (e.kind === 'unit' && isAirborne(e))) return null;
  return e.kind === 'bld' ? hgtAt((e.cx + e.w / 2) * CELL, (e.cy + e.h / 2) * CELL) : hgtAt(e.x, e.y);
}
// Moving along (mx, my) from (x, y): uphill slower (to 65%), downhill a little faster (to 112%).
function slopeMul(x, y, mx, my) {
  if (!G.hgt) return 1;
  const sl = (hgtAt(x + mx * 8, y + my * 8) - hgtAt(x, y)) / 8;
  return Math.max(0.65, Math.min(1.12, 1 - sl * 2.2));
}

// Craters that dig the ground (owner, 2026-11-19: "ground marks depending on the explosion can make craters like in Tiberian
// Sun and actually affect the ground where units can go in them"; both modes, heavy blasts only). G.dig: per cell, added to
// G.hgt's heights by hgtAt, so units drive down into a crater and every height rule follows it: slower climbing out
// (slopeMul), a little less reach and sight from the bottom (distTo, revealAround). Nothing is blocked. Dug by craterAt from
// DIG_MIN (artillery and V2 rockets, bombs, aircraft crashing, tanks and heavy shells hitting home; not rifles or tank
// shells); a bowl of radius 0.6 + rad / 10 cells (TS-sized: about a cell), rad x DIG_K deep, with a low rim; a cell no deeper than DIG_MAX. A structure
// placed over a crater fills it (addBuilding). G.craters keeps each one ([x, y, rad], plain data) for drawing (lookfx.js).
// Online: the host's crater marks carry a flag (net.js digs on the guest's copy too). Saved with G (a typed array).
const DIG_MIN = 5, DIG_K = 0.5, DIG_MAX = 7;
function digCrater(x, y, rad) {
  if (!G.hgt) return;
  if (!G.dig) G.dig = new Float32Array(NCELLS);
  if (!G.craters) G.craters = [];
  const R = 0.6 + rad / 10, depth = rad * DIG_K, fx = x / CELL - 0.5, fy = y / CELL - 0.5, n = Math.ceil(R * 1.3);
  for (let j = Math.floor(fy) - n; j <= Math.ceil(fy) + n; j++) for (let i = Math.floor(fx) - n; i <= Math.ceil(fx) + n; i++) {
    if (i < 0 || j < 0 || i >= MAP || j >= MAP) continue;
    const c = j * MAP + i, d = Math.hypot(i - fx, j - fy) / R;
    if (d >= 1.3 || G.terr[c] >= 4 || G.bld[c] || (G.cliff && G.cliff[c])) continue;
    const v = d < 1 ? -depth * (1 - d * d) : depth * 0.12 * Math.sin((d - 1) / 0.3 * Math.PI);   // the bowl, then a low rim
    G.dig[c] = Math.max(-DIG_MAX, Math.min(1.5, G.dig[c] + v));
  }
  G.craters.push([Math.round(x), Math.round(y), rad]);
  if (G.craters.length > 400) G.craters.shift();
  if (typeof lookDug === 'function') lookDug(x, y, (R * 1.3 + 1) * CELL);   // (the raised ground's cached shape there)
}
// A structure fills the craters under it.
function fillCraters(cx, cy, w, h) {
  if (!G.dig) return;
  for (let y = cy; y < cy + h; y++) for (let x = cx; x < cx + w; x++) if (inMap(x, y)) G.dig[idx(x, y)] = 0;
  if (typeof lookDug === 'function') lookDug((cx + w / 2) * CELL, (cy + h / 2) * CELL, (Math.max(w, h) / 2 + 2) * CELL);
}

function genMap(seed) {
  G.spans = [];   // bridge spans that can be destroyed (genLayoutMap, maps with `breakable`)
  G.houses = []; G.props = []; G.birds = null; G.folk = null; G.hens = null;   // village houses, props and pigeons (genVillage, maps with `village`)
  if (MAPS[G.mapId].rows) { genLayoutMap(MAPS[G.mapId]); genVillage(MAPS[G.mapId], seed); return; }
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
    const sp = half[i], r0 = j ? 3.1 : 3.4, rN = r0 * FR, dx = x * S96 - sp.cx, dy = y * S96 - sp.cy, d = Math.hypot(dx, dy) || 1;
    const far = Math.max(d, BASE_CLEAR + r0 * 0.5) + (rN - r0), lo = rN + 4.5, hi = MAP - 1 - lo;
    fieldsHalf.push({ cx: Math.max(lo, Math.min(hi, sp.cx + dx / d * far)), cy: Math.max(lo, Math.min(hi, sp.cy + dy / d * far)), r: rN, rich: j ? 0.95 : 1.05 });
  }));
  for (const [t, d, rad, rich, gem] of [
    [-10, 12.5, 3, 1.15],          // forward fields on the lake shores, between the crossings
    [10, 12.5, 2.4, 1, true],      // the rare gem field, out in the contested middle
    [-27, 15, 2.4, 1, true],       // a second gem field, out by the far end of the lakes: a long way from either base
  ]) { const [cx, cy] = at(t * K, d * K); fieldsHalf.push({ cx, cy, r: gem ? rad : rad * FR, rich, gem }); }
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
        G.ore[c] = Math.round(Math.min(ORE_MAX * ORE_START, (60 + (1 - d / f.r) * 190) * f.rich * ORE_START) * G.oreRich);
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

// A fixed layout (a map in maps.js with `rows`, see tools/map-from-image.py): the same every game.
function genLayoutMap(m) {
  G.cliff = new Uint8Array(NCELLS);   // rock painted as cliff ridges (art.js paintCliffs), not loose boulders
  G.ford = new Uint8Array(NCELLS);    // shallow water units can cross: walkable like a bridge, painted as a creek bed
  const T = G.terr, code = { '.': 0, ',': 1, 'T': 2, '#': 3, '~': 4, '=': 5, 'f': 5, 'o': 0 }, oreAt = [];
  m.rows.forEach((row, y) => {
    let x = 0;
    for (const [, n, ch] of row.matchAll(/(\d*)(\D)/g)) for (let k = +(n || 1); k-- > 0; x++) {
      if (!inMap(x, y)) continue;
      T[idx(x, y)] = code[ch];
      if (ch === 'o') oreAt.push(idx(x, y));
      if (ch === '#') G.cliff[idx(x, y)] = 1;
      if (ch === 'f') G.ford[idx(x, y)] = 1;
    }
  });
  // A ford's ends that reach past the river onto the bank (no water just up or down stream) are just bank.
  const fordOff = [];
  for (let c = 0; c < NCELLS; c++) {
    if (!G.ford[c]) continue;
    let wet = false;
    for (let dy = -3; dy <= 3; dy++) { const x = cellX(c), y = cellY(c) + dy; if (inMap(x, y) && T[idx(x, y)] === 4) wet = true; }
    if (!wet) fordOff.push(c);
  }
  if (!m.marsh) for (const c of fordOff) { G.ford[c] = 0; T[c] = 1; }   // (a fen's shallows stay wherever they are)
  // Bridges no wider than m.bridgeW cells (Lakeside, owner 2026-11-24: "these two bridges are huge they need to be smaller"):
  // each run of deck cells keeps a band that wide along its main axis (as the bridge is drawn below); the rest is lake.
  if (m.bridgeW) {
    const seen = new Uint8Array(NCELLS);
    for (let c0 = 0; c0 < NCELLS; c0++) {
      if (T[c0] !== 5 || G.ford[c0] || seen[c0]) continue;
      const cells = [c0]; seen[c0] = 1;
      for (let i = 0; i < cells.length; i++) for (const [dx, dy] of DIRS8) {
        const x = cellX(cells[i]) + dx, y = cellY(cells[i]) + dy;
        if (inMap(x, y) && T[idx(x, y)] === 5 && !G.ford[idx(x, y)] && !seen[idx(x, y)]) { seen[idx(x, y)] = 1; cells.push(idx(x, y)); }
      }
      const xs = cells.map(cellX), ys = cells.map(cellY), mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length;
      let sxx = 0, syy = 0, sxy = 0;
      xs.forEach((x, i) => { sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; sxy += (x - mx) * (ys[i] - my); });
      const ang = Math.atan2(2 * sxy, sxx - syy) / 2, ux = Math.cos(ang), uy = Math.sin(ang);
      const across = xs.map((x, i) => -(x - mx) * uy + (ys[i] - my) * ux), mid = (Math.max(...across) + Math.min(...across)) / 2;
      cells.forEach((c, i) => { if (Math.abs(across[i] - mid) > m.bridgeW / 2) T[c] = 4; });
    }
  }
  // Ground cleared for each start position's Construction Yard.
  for (const s of G.spawns) for (let y = s.cy - 3; y <= s.cy + 3; y++) for (let x = s.cx - 3; x <= s.cx + 3; x++) {
    if (inMap(x, y) && Math.hypot(x - s.cx, y - s.cy) < 3.2 && T[idx(x, y)] <= 3) T[idx(x, y)] = 1;
  }
  for (let i = 0; i < NCELLS; i++) G.block[i] = T[i] >= 2 && T[i] <= 4 ? 1 : 0;
  // Ore: each patch of touching ore cells is a field, richest at its middle.
  const isOre = new Uint8Array(NCELLS), done = new Uint8Array(NCELLS);
  for (const c of oreAt) isOre[c] = 1;
  G.oreFields = [];
  for (const c0 of oreAt) {
    if (done[c0]) continue;
    const cells = [c0]; done[c0] = 1;
    for (let i = 0; i < cells.length; i++) for (const [dx, dy] of DIRS8) {
      const x = cellX(cells[i]) + dx, y = cellY(cells[i]) + dy;
      if (inMap(x, y) && isOre[idx(x, y)] && !done[idx(x, y)]) { done[idx(x, y)] = 1; cells.push(idx(x, y)); }
    }
    const cx = cells.reduce((a, c) => a + cellX(c), 0) / cells.length, cy = cells.reduce((a, c) => a + cellY(c), 0) / cells.length;
    const far = Math.max(...cells.map((c) => Math.hypot(cellX(c) - cx, cellY(c) - cy))) + 1;
    for (const c of cells) G.ore[c] = Math.round(Math.min(ORE_MAX * ORE_START, (60 + (1 - Math.hypot(cellX(c) - cx, cellY(c) - cy) / far) * 190) * ORE_START) * G.oreRich);
    G.oreFields.push({ cx, cy, r: Math.sqrt(cells.length / Math.PI) * 1.15, rich: 1, gem: false });
  }
  // Extra ore fields placed in code (MAPS ore: [x, y, radius]), on open ground only, like any traced field.
  for (const [ox, oy, orr] of m.ore || []) {
    for (let y = Math.floor(oy - orr); y <= oy + orr; y++) for (let x = Math.floor(ox - orr); x <= ox + orr; x++) {
      const d = Math.hypot(x - ox, y - oy), c = inMap(x, y) && idx(x, y);
      if (c === false || d > orr || T[c] > 1 || G.cliff[c] || G.ore[c]) continue;
      G.ore[c] = Math.round(Math.min(ORE_MAX * ORE_START, (60 + (1 - d / (orr + 1)) * 190) * ORE_START) * G.oreRich);
    }
    G.oreFields.push({ cx: ox, cy: oy, r: orr, rich: 1, gem: false });
  }
  // Gem fields (rare ore, worth twice as much and never growing back) on open ground.
  for (const [gx, gy, gr] of m.gems || []) {
    for (let y = Math.floor(gy - gr); y <= gy + gr; y++) for (let x = Math.floor(gx - gr); x <= gx + gr; x++) {
      const d = Math.hypot(x - gx, y - gy), c = inMap(x, y) && idx(x, y);
      if (c === false || d > gr || T[c] > 1 || G.ore[c]) continue;
      G.ore[c] = Math.round(Math.min(ORE_MAX * ORE_START, (60 + (1 - d / gr) * 190) * ORE_START) * G.oreRich);
      G.gem[c] = 1;
    }
    G.oreFields.push({ cx: gx, cy: gy, r: gr, rich: 1, gem: true });
  }
  // Bridges: each run of bridge cells is drawn as one timber bridge along its long side.
  G.road = []; G.bridges = [];
  const seenB = new Uint8Array(NCELLS);
  for (let c0 = 0; c0 < NCELLS; c0++) {
    if (T[c0] !== 5 || G.ford[c0] || seenB[c0]) continue;
    const cells = [c0]; seenB[c0] = 1;
    for (let i = 0; i < cells.length; i++) for (const [dx, dy] of DIRS8) {
      const x = cellX(cells[i]) + dx, y = cellY(cells[i]) + dy;
      if (inMap(x, y) && T[idx(x, y)] === 5 && !G.ford[idx(x, y)] && !seenB[idx(x, y)]) { seenB[idx(x, y)] = 1; cells.push(idx(x, y)); }
    }
    const xs = cells.map(cellX), ys = cells.map(cellY), x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, y0 = Math.min(...ys), y1 = Math.max(...ys) + 1;
    if (m.breakable) addSpan(cells, x0, y0, x1, y1, G.bridges.length);   // (its picture is the bridge pushed below)
    // A diagonal run (Lakeside's bridges): drawn along its main axis, from end to end, as wide as the run across it.
    const mx = xs.reduce((a, v) => a + v, 0) / xs.length, my = ys.reduce((a, v) => a + v, 0) / ys.length;
    let sxx = 0, syy = 0, sxy = 0;
    xs.forEach((x, i) => { sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; sxy += (x - mx) * (ys[i] - my); });
    const ang = Math.atan2(2 * sxy, sxx - syy) / 2, off = Math.abs(((ang % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2) - Math.PI / 4);
    if (cells.length >= 6 && off < Math.PI / 8) {   // within 22.5 degrees of a diagonal
      const ux = Math.cos(ang), uy = Math.sin(ang), along = xs.map((x, i) => (x - mx) * ux + (ys[i] - my) * uy);
      const across = xs.map((x, i) => -(x - mx) * uy + (ys[i] - my) * ux);
      const u0 = Math.min(...along) - 0.6, u1 = Math.max(...along) + 0.6, w = Math.max(...across) - Math.min(...across) + 0.4;
      const v0 = (Math.max(...across) + Math.min(...across)) / 2, cx = mx + 0.5 - uy * v0, cy = my + 0.5 + ux * v0;
      G.bridges.push({ a: { x: (cx + ux * u0) * CELL, y: (cy + uy * u0) * CELL }, b: { x: (cx + ux * u1) * CELL, y: (cy + uy * u1) * CELL }, w: w * CELL });
      continue;
    }
    // A square run (Twin Lakes' short span) crosses the water: it runs north-south when the water is to its west and east.
    let wide = x1 - x0 >= y1 - y0;
    if (x1 - x0 === y1 - y0) {
      const wet = (x, y) => (inMap(x, y) && T[idx(x, y)] === 4 ? 1 : 0);
      let we = 0, ns = 0;
      for (let y = y0; y < y1; y++) we += wet(x0 - 1, y) + wet(x1, y);
      for (let x = x0; x < x1; x++) ns += wet(x, y0 - 1) + wet(x, y1);
      wide = we <= ns;
    }
    G.bridges.push(wide
      ? { a: { x: x0 * CELL, y: (y0 + y1) / 2 * CELL }, b: { x: x1 * CELL, y: (y0 + y1) / 2 * CELL }, w: (y1 - y0 + 0.4) * CELL }
      : { a: { x: (x0 + x1) / 2 * CELL, y: y0 * CELL }, b: { x: (x0 + x1) / 2 * CELL, y: y1 * CELL }, w: (x1 - x0 + 0.4) * CELL });
  }
}

// ---------------------------------------------------------------------------
// Bridges that can be destroyed (MAPS `breakable`): each run of bridge cells is a span with health. It is not in
// G.entities (nothing looks for it, draws it or sends it as an entity) but it is in G.byId, so an attack order and
// an online order can name it. Neutral: only an ordered attack hurts it. Down, its cells are water; any side can
// send an Engineer to rebuild it (commandEngineer). The map is laid out the same on every copy of a battle, so the ids match.
function addSpan(cells, x0, y0, x1, y1, bi) {
  const s = { id: G.nextId++, kind: 'span', type: 'span', def: SPAN, team: -1, cx: x0, cy: y0, w: x1 - x0, h: y1 - y0,
    x: (x0 + x1) / 2 * CELL, y: (y0 + y1) / 2 * CELL, cells: cells.slice(), bi, hp: SPAN.hp, maxHp: SPAN.hp, alive: true, hitT: -99 };
  G.spans.push(s); G.byId.set(s.id, s);
}
// After G.byId is rebuilt (a loaded game, an online copy starting afresh).
function registerSpans() {
  for (const s of G.spans || []) { s.def = SPAN; G.byId.set(s.id, s); }
  for (const h of G.houses || []) { h.def = HOUSE; G.byId.set(h.id, h); }
}
const spanAt = (x, y) => { const c = cellOfPos(x, y); return (G.spans || []).find((s) => s.cells.includes(c)) || null; };
// The terrain under a span: deck (walkable) or open water.
function setSpan(s, up) {
  s.alive = up;
  for (const c of s.cells) { G.terr[c] = up ? 5 : 4; G.block[c] = up ? 0 : 1; }
}
function breakSpan(s, attacker) {
  s.hp = 0;
  setSpan(s, false);
  // Whatever stood on it goes down with it; everyone on the way somewhere finds a new way.
  for (const u of G.entities.slice()) if (u.alive && u.kind === 'unit' && !isAirborne(u) && s.cells.includes(cellOfPos(u.x, u.y))) kill(u, attacker, 'HE', s);
  for (const u of G.entities) if (u.alive && u.kind === 'unit' && u.cls !== 'air' && u.dest) goTo(u, u.dest.x, u.dest.y);
  hooks.sfx('explodeBig', s.x, s.y); hooks.sfx('collapse', s.x, s.y); hooks.shake(s.x, s.y, 8);
  for (let i = 0; i < 7; i++) {
    const c = s.cells[(Math.random() * s.cells.length) | 0], p = cellCenter(c);
    G.effects.push({ type: 'expl', x: p.x + (Math.random() - 0.5) * CELL, y: p.y + (Math.random() - 0.5) * CELL, size: 12 + Math.random() * 8, t: -i * 0.12, life: 0.8, seed: (Math.random() * 1e6) | 0, debris: true });
  }
  for (let i = 0; i < 5; i++) { const p = cellCenter(s.cells[(Math.random() * s.cells.length) | 0]); waterSplash(p.x, p.y, true); }
  for (const t of G.teams) say(t.id, 'Bridge destroyed');
}
// Attack ground: fire at a point, whatever is there. On a bridge span that can be destroyed, the span is the
// target; anywhere else the units shell the spot (a target of its own, never hurt, never in G.entities) until
// they are given another order.
function commandAttackGround(units, x, y) {
  if (!(x >= 0 && y >= 0 && x < WORLD && y < WORLD)) return;
  const s = spanAt(x, y) || houseAt(x, y), c = cellOfPos(x, y);
  const spot = { kind: 'spot', type: 'spot', def: SPOT, team: -1, x, y, hp: 1, maxHp: 1, alive: true, hitT: -99 };
  if (G.wall[c]) { const p = cellCenter(c); spot.wall = c; spot.x = p.x; spot.y = p.y; }   // a wall or gate: fire until it is down
  commandAttack(units, s && s.alive ? s : spot);
}

// ---------------------------------------------------------------------------
// Walls and gates (WALLS in data.js): G.wall holds the kind of piece in each cell (0 none), G.wallTeam its side,
// G.wallHp its health, G.wallN how many stand. Hard pieces also set G.block; wire and gates are judged by who is
// moving (softBlocks). Saved with the game as they are; an online copy is sent the cells that changed (netcore).
function ensureWalls() {
  if (G.wall && G.wall.length === NCELLS) return;
  G.wall = new Uint8Array(NCELLS); G.wallTeam = new Uint8Array(NCELLS); G.wallHp = new Uint16Array(NCELLS); G.wallN = 0;
}
const wallAvailable = (team, kind) => { const d = WALLS[kind]; return !!d && !d.part && d.factions.includes(team.faction) && hasBuilt(team, 'cy') && hasBuilt(team, d.req); };
// Whether a piece may stand in this cell: open ground with nothing on it, near one of the side's own buildings.
function wallOk(team, c, blds) {
  const x = cellX(c), y = cellY(c);
  if (x < 1 || y < 1 || x > MAP - 2 || y > MAP - 2 || G.terr[c] > 1 || G.block[c] || G.bld[c] || G.ore[c] > 0 || G.resv[c] || G.wall[c]) return false;
  for (const e of G.entities) if (e.alive && e.kind === 'unit' && !isAirborne(e) && cellOfPos(e.x, e.y) === c) return false;
  for (const b of blds || buildingsOf(team.id)) {
    const reach = b.def.buildRadius || BUILD_RANGE;
    if (x <= b.cx + b.w + reach && x >= b.cx - reach - 1 && y <= b.cy + b.h + reach && y >= b.cy - reach - 1) return true;
  }
  return false;
}
// A gate's middle kind and the step between its cells (G.wall index): 4 west-east, 5 north-south, 7 and 8 diagonal.
const gateStep = (id) => (id === 5 ? MAP : id === 7 ? MAP + 1 : id === 8 ? MAP - 1 : 1);   // (MAP changes with the map)
// Which way a gate lies diagonally: 1 north-west to south-east, -1 north-east to south-west, 0 straight (or not a gate).
function gateDiag(c) { const m = G.wall[gateCells(c).find((k) => G.wall[k] !== 6) ?? c]; return m === 7 ? 1 : m === 8 ? -1 : 0; }
// Every cell of the gate a gate cell belongs to: its middle and the ends that stand (a save from before gates were
// three cells wide has middles alone).
function gateCells(c) {
  const id = G.wall[c], t = G.wallTeam[c], is = (k, want) => k >= 0 && k < NCELLS && G.wall[k] === want && G.wallTeam[k] === t;
  // A neighbour k of c (cells apart by its step) that does not wrap round the map's side.
  const near = (k) => Math.abs(cellX(k) - cellX(c)) <= 1;
  if (id === 6) {
    for (const m of [4, 5, 7, 8]) {
      const st = gateStep(m);
      if (is(c - st, m) && near(c - st)) { c -= st; break; }
      if (is(c + st, m) && near(c + st)) { c += st; break; }
    }
  }
  const mid = G.wall[c];
  if (mid !== 4 && mid !== 5 && mid !== 7 && mid !== 8) return [c];
  const st = gateStep(mid);
  return [c - st, c, c + st].filter((k) => k === c || (is(k, 6) && Math.abs(cellX(k) - cellX(c)) <= 1));
}
// The cells of a straight line between two cells (at most WALL_LINE_MAX). A gate is three cells with the first cell
// in the middle, lying north-south when the second cell is further off up or down than across, diagonally when it is
// as far off both ways, else west-east.
function wallLine(kind, x0, y0, x1, y1) {
  if (WALLS[kind] && WALLS[kind].gate) {
    const ax = Math.abs(x1 - x0), ay = Math.abs(y1 - y0);
    const dx = ay > ax ? 0 : Math.sign(x1 - x0) || 1, dy = ay < ax ? 0 : Math.sign(y1 - y0);
    return inMap(x0 - dx, y0 - dy) && inMap(x0 + dx, y0 + dy) ? [idx(x0 - dx, y0 - dy), idx(x0, y0), idx(x0 + dx, y0 + dy)] : [];
  }
  // A slanted line is laid as two straight runs, a diagonal one and a straight one, the longer first: mixing the two kinds of
  // step along the way drew a saw-tooth in the iso view. One piece a step; nothing slips between two pieces that touch at a
  // corner (findPath, tryMove and los treat such a corner as shut).
  const out = [], ax = Math.abs(x1 - x0), ay = Math.abs(y1 - y0), sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
  const nd = Math.min(ax, ay), ns = Math.max(ax, ay) - nd, st = ax > ay ? [sx, 0] : [0, sy];
  const runs = nd >= ns ? [[[sx, sy], nd], [st, ns]] : [[st, ns], [[sx, sy], nd]];
  const add = (x, y) => { if (out.length < WALL_LINE_MAX && inMap(x, y)) out.push(idx(x, y)); };
  let x = x0, y = y0;
  add(x, y);
  for (const [[dx, dy], n] of runs) for (let i = 0; i < n; i++) { x += dx; y += dy; add(x, y); }
  return out;
}
// A gate may also be laid over pieces of the side's own wall (sandbags, wire, concrete; not another gate), so a player
// need not leave a gap first: the pieces it covers are replaced, half their price back as if sold (owner's pick).
const ownPiece = (team, c) => G.wall[c] > 0 && G.wallTeam[c] === team.id && !WALL_BY_ID[G.wall[c]].gate;
const gateCellOk = (team, c, blds) => ownPiece(team, c) || wallOk(team, c, blds);
const gateMid = (st) => (Math.abs(st) === 1 ? 4 : Math.abs(st) === MAP ? 5 : Math.abs(st) === MAP + 1 ? 7 : 8);
const gateRefund = (team, cs) => cs.reduce((s, c) => s + (ownPiece(team, c) ? Math.floor(WALL_BY_ID[G.wall[c]].cost / 2) : 0), 0);
function setWall(c, id, tid, hp) {
  const was = WALL_BY_ID[G.wall[c]], d = WALL_BY_ID[id];
  if (was && was.hard) G.block[c] = 0;
  if (!was && d) G.wallN++; else if (was && !d) G.wallN--;
  G.wall[c] = id; G.wallTeam[c] = d ? tid : 0; G.wallHp[c] = d ? hp : 0;
  if (d && d.hard) G.block[c] = 1;
  G.wallEver = true; G.wallRev = (G.wallRev || 0) + 1;
}
// Lays a line of pieces from one cell to another: every cell that can take one, as far as the money goes.
// Returns how many were laid.
function placeWalls(team, kind, x0, y0, x1, y1) {
  if (!team || team.out || !wallAvailable(team, kind) || ![x0, y0, x1, y1].every(Number.isInteger)) return 0;
  const d = WALLS[kind], blds = buildingsOf(team.id);
  let n = 0;
  if (d.gate) {                                                            // all three cells or nothing, one price
    const cs = wallLine(kind, x0, y0, x1, y1), refund = gateRefund(team, cs);
    if (cs.length === 3 && team.credits + refund >= d.cost && cs.every((c) => gateCellOk(team, c, blds))) {
      team.credits += refund - d.cost; n = 1;
      setWall(cs[0], 6, team.id, d.hp); setWall(cs[1], gateMid(cs[1] - cs[0]), team.id, d.hp); setWall(cs[2], 6, team.id, d.hp);
    }
  } else for (const c of wallLine(kind, x0, y0, x1, y1)) {
    if (team.credits < d.cost) break;
    if (!wallOk(team, c, blds)) continue;
    team.credits -= d.cost; setWall(c, d.id, team.id, d.hp); n++;
  }
  if (n) { const p = cellCenter(idx(x0, y0)); hooks.sfx('place', p.x, p.y); }
  return n;
}
function removeWall(c) {
  const d = WALL_BY_ID[G.wall[c]];
  if (!d) return;
  const p = cellCenter(c);
  setWall(c, 0, 0, 0);
  hooks.sfx(d.wire ? 'hitMed' : 'collapse', p.x, p.y);
  G.effects.push({ type: 'expl', x: p.x, y: p.y, size: d.wire ? 5 : 9, t: 0, life: 0.5, seed: (Math.random() * 1e6) | 0, debris: !d.wire });
}
function hitWall(c, dmg) {
  if (!G.wall[c] || !(dmg > 0)) return;
  if (WALL_BY_ID[G.wall[c]].gate) {                                         // a gate's cells share one health and fall together
    const cs = gateCells(c), hp = G.wallHp[c] > dmg ? Math.max(1, Math.round(G.wallHp[c] - dmg)) : 0;
    for (const k of cs) { if (hp) G.wallHp[k] = hp; else removeWall(k); }
    G.wallRev++;
    return;
  }
  if (G.wallHp[c] > dmg) { G.wallHp[c] = Math.max(1, Math.round(G.wallHp[c] - dmg)); G.wallRev++; }
  else removeWall(c);
}
// Taking down a piece of your own (a gate: the whole of it): half its price back.
function sellWall(team, x, y) {
  if (!team || !Number.isInteger(x) || !Number.isInteger(y) || !inMap(x, y)) return false;
  const c = idx(x, y), d = WALL_BY_ID[G.wall[c]];
  if (!d || G.wallTeam[c] !== team.id) return false;
  for (const k of d.gate ? gateCells(c) : [c]) setWall(k, 0, 0, 0);
  team.credits += Math.floor(d.cost / 2);
  const p = cellCenter(c); hooks.sfx('place', p.x, p.y);
  return true;
}
// An online copy: the cells the host sent, [cell, kind, side, health] in a row.
function applyWalls(list) {
  ensureWalls();
  for (let i = 0; i < list.length; i += 4) setWall(list[i], list[i + 1], list[i + 2], list[i + 3]);
}
function clearWalls() {
  if (!G.wall) return;
  for (let c = 0; c < NCELLS; c++) if (G.wall[c]) setWall(c, 0, 0, 0);
}

// Units on an Auto Attack (or the computer's waves) that find the way to their target walled off shoot a way
// through: the first enemy wall or gate on the shortest way in, then they go on. Each side in turn, a few groups
// at a time. A player's direct orders are left alone (Attack ground is theirs to give).
const BREACH_REACH = 15;   // cells: the units around the one that found the way shut join in
const BREACH_CROWD = 8;    // a group this big widens a gap it would squeeze through (wallInTheWay's `out.choke`)
const CHOKE_NEAR = 25;     // cells: only gaps this far along its way count
function breachWalls(team) {
  if (!G.wallN) return;
  const units = unitsOf(team.id).filter((u) => u.cls !== 'air' && u.def.weapon && !u.def.harvester && !u.chute);
  // Back to the hunt once the wall is down.
  for (const u of units) if (u.breach && !(u.order.type === 'attack' && u.order.target.alive)) { u.breach = false; if (u.order.type === 'guard' || u.order.type === 'attack') setHunt(u); }   // (an attack order whose wall just fell: its own look round has not stood it down yet)
  const hunters = units.filter((u) => u.order.type === 'hunt' && !u.breach && !(u.target && u.target.alive));
  const done = [];
  let tries = 0;
  for (const lead of hunters) {
    if (done.length >= 3 || tries >= 6) break;
    if (done.some((o) => Math.hypot(o.x - lead.x, o.y - lead.y) < BREACH_REACH * CELL)) continue;
    const goal = nearestEnemyBuilding(lead);
    if (!goal) continue;
    tries++;
    const out = {}, c = wallInTheWay(lead, goal, out);
    // (A unit whose own cell is shut in, by trees or another unit, finds no way at all: the next one speaks for the group.)
    if (c < 0 && out.walk < 0) continue;
    done.push(lead);
    let group = hunters.filter((u) => Math.hypot(u.x - lead.x, u.y - lead.y) < BREACH_REACH * CELL), w = c;
    // The way in is open but squeezes through a gap in a wall: a big group does not all queue for it. Half of it (those
    // nearest) shoots the wall beside the gap to widen it while the rest go through; again each turn until it is wide.
    if (c < 0) {
      if (!(out.choke >= 0) || group.length < BREACH_CROWD) continue;
      w = out.choke;
      // (Only units that can hurt a wall: rifles would spend a minute on one piece of concrete.)
      const q = cellCenter(w), d = (u) => Math.hypot(u.x - q.x, u.y - q.y), half = Math.ceil(group.length / 2);
      group = group.filter((u) => WARHEADS[u.def.weapon.wh].bld >= 0.25).sort((a, b) => d(a) - d(b)).slice(0, half);
      if (!group.length) continue;
    }
    const p = cellCenter(w);
    commandAttackGround(group, p.x, p.y);
    for (const u of group) if (u.order.type === 'attack') { u.breach = true; u.manual = false; u.manualFrom = undefined; }   // (not a player's order: see takeOver)
  }
}
// The enemy wall or gate to shoot through for a unit to reach a structure, or -1 when it can walk there (or no wall
// is to blame). Two floods from the unit: one as it walks, one that also goes through enemy walls and gates.
// A way round that is BREACH_DETOUR times longer than the way through (plus BREACH_SLACK cells) counts as shut too:
// a ring with a one-cell gap at the back of the base (ore it could not wall) is shot through at the front.
const BREACH_DETOUR = 1.6, BREACH_SLACK = 12;
// out (optional): when it can walk there, out.choke is an enemy wall beside a gap the way squeezes through (enemy walls
// within 2 cells on both sides of a cell of the way, within CHOKE_NEAR cells of the unit), the one met first; else -1.
function wallInTheWay(u, goal, out) {
  const s = cellOfPos(u.x, u.y), n = NCELLS, from = new Int32Array(n).fill(-2), dist = new Int32Array(n);
  const atGoal = (x, y) => x >= goal.cx - 1 && x <= goal.cx + goal.w && y >= goal.cy - 1 && y <= goal.cy + goal.h;
  const enemyWall = (c) => G.wall[c] && hostile(u.team, G.wallTeam[c]);
  const flood = (through) => {
    from.fill(-2); from[s] = -1; dist[s] = 0;
    const q = [s];
    for (let i = 0; i < q.length; i++) {
      const c = q[i], cx = cellX(c), cy = cellY(c);
      if (atGoal(cx, cy)) return c;
      for (let k = 0; k < 4; k++) {
        const nx = cx + DIRS8[k][0], ny = cy + DIRS8[k][1];
        if (!inMap(nx, ny)) continue;
        const m = idx(nx, ny);
        if (from[m] !== -2) continue;
        if (!(freeCell(m) || (through && enemyWall(m) && !G.bld[m]))) continue;
        from[m] = c; dist[m] = dist[c] + 1; q.push(m);
      }
    }
    return -1;
  };
  MOVER = u;
  try {
    const walk = flood(false), dWalk = walk >= 0 ? dist[walk] : -1;
    if (out) {
      out.choke = -1; out.walk = walk;
      for (let p = walk; p >= 0; p = from[p]) {
        if (dist[p] > CHOKE_NEAR) continue;
        const px = cellX(p), py = cellY(p);
        let L = false, R = false, U = false, D = false, best = -1, bd = 99;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          if (!inMap(px + dx, py + dy)) continue;
          const m = idx(px + dx, py + dy);
          if (!enemyWall(m)) continue;
          if (dx < 0) L = true; if (dx > 0) R = true; if (dy < 0) U = true; if (dy > 0) D = true;
          const dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = m; }
        }
        if ((L && R) || (U && D)) out.choke = best;   // (walking back from the goal: the last found is the first met)
      }
    }
    let c = flood(true), wall = -1;
    if (walk >= 0 && (c < 0 || dWalk <= dist[c] * BREACH_DETOUR + BREACH_SLACK)) return -1;
    for (; c >= 0; c = from[c]) if (enemyWall(c)) wall = c;   // (walking back from the goal: the last one found is the first met)
    return wall;
  } finally { MOVER = null; }
}

// Engineers: sent to a destroyed bridge span, or to a damaged structure of their own alliance, they walk up to it,
// put it right at once (the span stands again, the structure is back at full health) and are used up.
// Or to an enemy structure (owner's rule, both modes, classic Red Alert): it walks in and the structure is its side's at once,
// Construction Yards too (captureBuilding); the Engineer is used up.
const engineerJob = (u, t) => !!t && (t.kind === 'span' ? !t.alive : t.kind === 'bld' && t.alive && t.buildT >= 1 && t.sellT <= 0 &&
  (hostile(u.team, t.team) ? !camoHidden(t, u.team) : t.hp < t.maxHp && alliedSides(u.team, t.team)));
// A structure changes sides: it keeps its health and place, takes the new owner's colours and look (its faction), and what the old
// owner had tied to it (rally point, primary, Ore Trucks docking, aircraft based there, its door's next vehicle) is let go.
function captureBuilding(b, team) {
  const old = G.teams[b.team];
  if (!old || old === team || !b.alive) return;
  b.team = team.id; b.faction = team.faction;
  b.rally = null; b.primary = false; b.repairing = false; b.target = null; b.doorAt = null; b.dockU = null; b.exposed = true; b.capture = 0; b.capU = null;
  if (G.doorQ) G.doorQ = G.doorQ.filter((d) => d.p !== b.id);   // (a vehicle the old owner had rolling out is lost with it)
  for (const u of G.entities) {
    if (!u.alive || u.kind !== 'unit' || u.team !== old.id) continue;
    if (u.home === b.id) u.home = null;
    if (u.ref === b) { u.ref = null; if (u.hs === 'unload') u.hs = 'return'; }
    if (u.target === b) u.target = null;
  }
  // Every side now friendly to it (the captor and its allies) stops shooting at it: an attack order on it ends where the unit stands, as
  // when a target dies (a computer's unit goes back to hunting), and its guns and shells in flight leave it alone (updateProjectiles).
  for (const e of G.entities) {
    if (!e.alive || e === b || e.team === old.id || hostile(e.team, b.team)) continue;
    if (e.target === b) e.target = null;
    if (e.kind === 'unit' && e.order && e.order.type === 'attack' && e.order.target === b) { if (G.teams[e.team].isAI) setHunt(e); else if (e.cls === 'air') setGuard(e); else setGuard(e, e.x, e.y); }
  }
  old.stats.bldLost++; team.stats.bldKilled++;
  team.stats.captured = (team.stats.captured || 0) + 1;
  if (b.type === 'cy' || b.type === 'outpost') logEvent(old.id, b.type + ' lost');
  if (b.type === 'cy') old.cyLostT = G.t;
  if (b.type === 'tech' && old.upgrades && Object.keys(old.upgrades).length && !hasBuilt(old, 'tech')) { old.upgrades = {}; notify(old, 'upgrade', 'Upgrades lost', 4); }
  updatePower();
  say(team.id, 'Building captured');
  say(old.id, 'Building lost to the enemy');
  hooks.sfx('place', b.x, b.y);
}
// The free cell beside a span or structure nearest the unit that it can walk to.
function besideSpot(u, t) {
  const here = cellOfPos(u.x, u.y), ring = [];
  for (let y = t.cy - 1; y <= t.cy + t.h; y++) for (let x = t.cx - 1; x <= t.cx + t.w; x++) {
    if (!inMap(x, y) || (x >= t.cx && x < t.cx + t.w && y >= t.cy && y < t.cy + t.h) || !freeCell(idx(x, y))) continue;
    ring.push(idx(x, y));
  }
  const d = (c) => Math.hypot(cellX(c) * CELL + CELL / 2 - u.x, cellY(c) * CELL + CELL / 2 - u.y);
  ring.sort((a, b) => d(a) - d(b));
  for (const c of ring) if (c === here || connected(here, c)) return cellCenter(c);
  return null;
}
function commandEngineer(units, t) {
  for (const u of units) {
    if (!u.alive || !u.def.engineer || !engineerJob(u, t)) continue;
    const p = besideSpot(u, t);
    if (!p) { say(u.team, 'Cannot reach it'); continue; }
    u.order = { type: 'engineer', target: t, x: p.x, y: p.y }; u.target = null; u.staged = false; takeOver(u, 'move');
    goTo(u, p.x, p.y);
  }
}
// Capturing a Construction Yard is not instant (owner's pick, both modes): the Engineer works at it for CAPTURE_CY seconds beside it.
// b.capture (0 to 1, synced) and b.capU (the Engineer's id) show the bar; killed, moved off or sent elsewhere, it starts again.
const CAPTURE_CY = 8;
const captureTime = (b) => (b.type === 'cy' ? CAPTURE_CY : 0);
function updateEngineer(u, dt) {
  const o = u.order, t = o.target;
  if (!engineerJob(u, t)) { setGuard(u); return; }   // someone else got there first, or it is gone
  // Beside it is enough, and a little further off when it has settled as near as the crowd lets it (followPath).
  const d = distTo(u, t), settled = !u.dest && !u.needPath;
  if (d > CELL * 1.5 && !(settled && d <= CELL * 3)) {
    if (settled) { const p = besideSpot(u, t); if (p) goTo(u, p.x, p.y); else setGuard(u); }
    return;
  }
  if (t.kind === 'span') {
    t.hp = t.maxHp; setSpan(t, true);
    for (const tm of G.teams) say(tm.id, 'Bridge rebuilt');
  } else if (hostile(u.team, t.team)) {
    const need = captureTime(t);
    if (need) {
      if (t.capU && t.capU !== u.id && G.byId.get(t.capU) && G.byId.get(t.capU).alive && G.byId.get(t.capU).order.target === t) return;   // (one at a time; the next takes over if he falls)
      if (t.capU !== u.id) { t.capU = u.id; t.capture = 0; notify(teamOf(t), 'capture', 'Construction Yard under capture', 8); }
      u.dest = null; u.path = null;
      t.capture = Math.min(1, (t.capture || 0) + dt / need);
      if (t.capture < 1) return;
      t.capture = 0; t.capU = null;
    }
    captureBuilding(t, G.teams[u.team]);
  } else {
    t.hp = t.maxHp;
    say(u.team, 'Structure repaired');
  }
  hooks.sfx('place', t.x, t.y); hooks.sfx('build', t.x, t.y);
  u.alive = false;   // used up (not a loss)
}

// An online copy: the spans as the host sent them, [health, standing] each.
function applySpans(list) {
  list.forEach((v, i) => {
    const s = G.spans && G.spans[i];
    if (!s) return;
    if (v[0] < s.hp) s.hitT = G.t;
    s.hp = v[0];
    if (!!v[1] !== s.alive) setSpan(s, !!v[1]);
  });
}

// ---------------------------------------------------------------------------
// Village houses (maps with `village` in MAPS). Each battle rolls its own village from its seed on the map's plots
// (`lots`), so every copy of an online battle (and the game server) lays out the same houses with the same ids. Like a
// bridge span, a house is not in G.entities (nothing looks for it, counts it or sends it as an entity) but it is in
// G.byId, so an attack order can name it. Neutral: never chosen as a target, hurt only by blasts near it (houseBlast)
// and by an ordered attack (ATTACK GROUND on it). Standing, its cells block like a building; down, they are rubble
// anyone can cross. Plain data, so saves keep it; an online copy is sent the health of every house when one changes.
const HOUSE_SPLASH = 12;   // px round a shell, rocket or missile hitting the ground that reaches a house
const HOUSE_LOOKS = 6;     // designs per footprint in a battle (models.js houseModel), so a village has a few dozen looks
function genVillage(m, seed) {
  if (!m.village || !(m.lots || m.houses)) return;
  const lots = m.lots || [];
  const r = rng(seed ^ 0x1f0a77e5), taken = new Uint8Array(NCELLS), look = () => (seed * 31 + ((r() * HOUSE_LOOKS) | 0)) >>> 0;
  const free = (x0, y0, w, h, L) => {
    if (x0 < L[0] || y0 < L[1] || x0 + w - 1 > L[2] || y0 + h - 1 > L[3]) return false;
    for (let y = y0 - 1; y <= y0 + h; y++) for (let x = x0 - 1; x <= x0 + w; x++) {   // a cell of yard all round
      if (!inMap(x, y)) return false;
      const inside = x >= x0 && y >= y0 && x < x0 + w && y < y0 + h;
      if (taken[idx(x, y)] || (inside && (G.terr[idx(x, y)] > 1 || G.ore[idx(x, y)]))) return false;
    }
    return true;
  };
  const snow = mapTheme(G.mapId) === 'snow' ? ':s' : '';   // snow on the roofs (models.js houseModel)
  const put = (x0, y0, w, h, kind) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) taken[idx(x, y)] = 1;
    const church = kind.startsWith('church'), fountain = kind === 'fountain', hp = fountain ? 1200 : church ? 1400 : Math.min(1000, 150 + 70 * w * h);
    const h1 = { id: G.nextId++, kind: 'house', type: houseType(kind, w, h, church || fountain ? seed >>> 0 : look()) + snow, def: HOUSE, team: -1,
      cx: x0, cy: y0, w, h, x: (x0 + w / 2) * CELL, y: (y0 + h / 2) * CELL, hp, maxHp: hp, alive: true, hitT: -99,
      cap: fountain ? 0 : church ? 10 : Math.max(3, Math.min(6, w * h)), n: 0 };
    G.houses.push(h1); G.byId.set(h1.id, h1);
    setHouse(h1, true);
  };
  // Houses placed one by one (maps made in the map editor, editor.js): [x0, y0, w, h, kind] (kind 'house', 'church0',
  // 'church1' (the tower's end), 'fountain'), where they fit (on open ground, not overlapping).
  const fits = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (!inMap(x, y) || taken[idx(x, y)] || G.terr[idx(x, y)] > 1 || G.ore[idx(x, y)]) return false; return true; };
  for (const [x0, y0, w, h, kind] of m.houses || []) if (fits(x0, y0, w, h)) put(x0, y0, w, h, kind || 'house');
  // The fountain in the middle of each square.
  for (const [a, b, c, d] of villageSquares(m)) put(Math.round((a + c + 1) / 2) - 2, Math.round((b + d + 1) / 2) - 2, 4, 4, 'fountain');
  // The church: on one of the long plots beside the square, its tower toward the square. A map of several villages
  // (`squares`) has one in each, on a plot of 4 x 6 or more within 3 cells of its square, lying along the plot.
  if (m.squares) for (const [a, b, c, d] of m.squares) {
    const sx = (a + c + 1) / 2, sy = (b + d + 1) / 2, gap = (L) => Math.max(a - L[2], L[0] - c, b - L[3], L[1] - d, 0);
    const fit = lots.filter((L) => Math.min(L[2] - L[0], L[3] - L[1]) >= 3 && Math.max(L[2] - L[0], L[3] - L[1]) >= 5 && gap(L) <= 3);
    if (!fit.length) continue;
    const L = fit[(r() * fit.length) | 0], tall = L[3] - L[1] > L[2] - L[0];
    const w = tall ? 4 : 6, h = tall ? 6 : 4, mx = (L[0] + L[2] + 1) / 2, my = (L[1] + L[3] + 1) / 2, near = tall ? my < sy : mx < sx;
    const x0 = tall ? L[0] + ((L[2] - L[0] + 1 - w) >> 1) : near ? L[2] - w + 1 : L[0], y0 = tall ? (near ? L[3] - h + 1 : L[1]) : L[1] + ((L[3] - L[1] + 1 - h) >> 1);
    if (free(x0, y0, w, h, L)) put(x0, y0, w, h, 'church' + (near ? 1 : 0));
  }
  const longLots = m.squares || m.houses ? [] : lots.filter((L) => Math.min(L[2] - L[0], L[3] - L[1]) === 3);
  if (longLots.length) {
    const L = longLots[(r() * longLots.length) | 0], tall = L[3] - L[1] > L[2] - L[0];
    const w = tall ? 4 : 6, h = tall ? 6 : 4, mx = (L[0] + L[2]) / 2, my = (L[1] + L[3]) / 2;
    const toward = tall ? (my < (MAP - 1) / 2 ? L[3] - h + 1 : L[1]) : (mx < (MAP - 1) / 2 ? L[2] - w + 1 : L[0]);
    put(tall ? L[0] : toward, tall ? toward : L[1], w, h, 'church' + ((tall ? my : mx) < (MAP - 1) / 2 ? 1 : 0));
  }
  const SIZES = [[2, 2], [2, 2], [3, 2], [2, 3], [3, 2], [2, 3], [3, 3], [4, 2], [2, 4]];
  for (const L of lots) {
    const fill = 0.6 + r() * 0.4, area = (L[2] - L[0] + 1) * (L[3] - L[1] + 1);
    let used = 0;
    for (let tries = 0; tries < 160 && used < area * fill * 0.8; tries++) {
      const [w, h] = SIZES[(r() * SIZES.length) | 0];
      // Mostly along the plot's edges, facing the lanes.
      const edge = r() < 0.8, sx = L[2] - L[0] - w + 1, sy = L[3] - L[1] - h + 1;
      if (sx < 0 || sy < 0) continue;
      let x0 = L[0] + Math.round(r() * sx), y0 = L[1] + Math.round(r() * sy);
      if (edge) { if (r() < 0.5) x0 = r() < 0.5 ? L[0] : L[0] + sx; else y0 = r() < 0.5 ? L[1] : L[1] + sy; }
      if (!free(x0, y0, w, h, L)) continue;
      put(x0, y0, w, h, 'house');
      used += w * h;
    }
  }
  villageProps(m, r, taken);
}
// What makes the village look lived in (looks only, every copy rolls the same): street lamps (MAPS lamps), market stalls
// and benches on the square, barrels, crates and hay by the houses, carts in the lanes. None of them block; a blast or a
// passing vehicle knocks them over (houseFx). G.props: { kind: 'prop', k, x, y (px), v (look), up }.
const LAMP_VILLAGE = 3, LAMP_ROAD = 4, LAMP_BASE = 16, LAMP_EDGE = 1.6;
function villageProps(m, r, taken) {
  G.props = [];
  const add = (k, cx, cy, v) => G.props.push({ kind: 'prop', k, x: cx * CELL, y: cy * CELL, v: v === undefined ? (r() * 4) | 0 : v, up: true });
  const open = (cx, cy) => inMap(Math.floor(cx), Math.floor(cy)) && !taken[idx(Math.floor(cx), Math.floor(cy))] && !G.block[idx(Math.floor(cx), Math.floor(cy))];
  // Street lamps only light roads and villages (owner, 2026-11-21: "Street lights should only be on roads and villages", for
  // every map now and later): a lamp stands only in a village (a house within LAMP_VILLAGE cells) or beside a road (a
  // dirt track within LAMP_ROAD), and none in a base (within LAMP_BASE cells of a start position) unless right at a road's
  // edge (LAMP_EDGE: "unless the bases have a main road next to them").
  const nearT = (x, y, d, t) => { for (let j = -Math.ceil(d); j <= Math.ceil(d); j++) for (let i = -Math.ceil(d); i <= Math.ceil(d); i++) { const cx = Math.floor(x) + i, cy = Math.floor(y) + j; if (inMap(cx, cy) && G.terr[idx(cx, cy)] === t && Math.hypot(cx + 0.5 - x, cy + 0.5 - y) <= d) return true; } return false; };
  const inVillage = (x, y) => (G.houses || []).some((h) => Math.hypot(Math.max(h.cx - x, 0, x - (h.cx + h.w)), Math.max(h.cy - y, 0, y - (h.cy + h.h))) <= LAMP_VILLAGE);
  const inBase = (x, y) => (m.spawns || []).some(([sx, sy]) => Math.hypot(sx - x, sy - y) < LAMP_BASE);
  for (const [x, y] of m.lamps || []) {
    if (!open(x, y)) continue;
    const village = inVillage(x, y);
    if (!village && !nearT(x, y, LAMP_ROAD, 1)) continue;
    if (!village && inBase(x, y) && !nearT(x, y, LAMP_EDGE, 1)) continue;
    add('lamp', x, y, 0);
  }
  for (const [a, b, c, d] of villageSquares(m)) {
    const mx = (a + c + 1) / 2, my = (b + d + 1) / 2;
    // Market stalls round the square's edge, clear of the streets coming in, and benches round the fountain.
    for (const [sx, sy] of [[a + 1.5, b + 2.5], [a + 1.5, b + 5], [c - 0.5, b + 2.5], [c - 0.5, b + 5], [a + 1.5, d - 4], [a + 1.5, d - 1.5], [c - 0.5, d - 4], [c - 0.5, d - 1.5],
      [a + 3, b + 1.2], [c - 2, b + 1.2], [a + 3, d - 0.2], [c - 2, d - 0.2]]) if (r() < 0.8) add('stall', sx, sy);
    for (const [bx, by, v] of [[mx, my - 3.2, 0], [mx, my + 3.4, 0], [mx - 3.2, my, 1], [mx + 3.2, my, 1]]) add('bench', bx, by, v);
  }
  // By the houses: barrels, crates or hay in a yard corner.
  for (const h of G.houses) {
    if (h.cap === 0 || r() < 0.45) continue;
    const k = ['barrels', 'crates', 'hay', 'barrels', 'crates'][(r() * 5) | 0], east = r() < 0.5;
    const x = east ? h.cx + h.w + 0.45 : h.cx - 0.45, y = h.cy + 0.5 + r() * (h.h - 1);
    if (open(x, y)) add(k, x, y);
  }
  // Washing hung out in front of some houses (drawn by art.js drawProp; not while the house is held or gone).
  for (const h of G.houses) {
    if (h.cap === 0 || h.cap >= 10 || r() > 0.3) continue;
    G.props.push({ kind: 'prop', k: 'laundry', x: (h.cx + h.w / 2) * CELL, y: (h.cy + h.h) * CELL + 1, v: (r() * 1000) | 0, up: true, h: h.id, w: h.w * CELL - 14 });
  }
  // A fishing village (Heron Fen): rowboats moored by the jetties, on the water (v: 0 along x, 1 along y), and nets drying on frames.
  for (const [x, y, v] of m.boats || []) add('boat', x, y, v);
  for (const [x, y, v] of m.racks || []) if (open(x, y)) add('nets', x, y, v);
  // Carts left in the lanes, beside a lamp.
  const lamps = G.props.filter((p) => p.k === 'lamp');
  for (let i = 0; i < 5 && lamps.length; i++) {
    const l = lamps[(r() * lamps.length) | 0], x = l.x / CELL + (r() - 0.5) * 2, y = l.y / CELL + (r() - 0.5) * 2;
    if (open(x, y)) add('cart', x, y);
  }
}
// The village squares of a map: `squares` on a map of several villages, else its one `square`.
const villageSquares = (m) => (m && (m.squares || (m.square ? [m.square] : []))) || [];
// A house's look: the sprite key models.js builds it from (houseModel), as plain text so saves and copies keep it.
const houseType = (kind, w, h, look) => `hv:${kind}:${w}:${h}:${look}`;
const houseAt = (x, y) => {
  if (!G.houses || !G.houses.length) return null;
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  return G.houses.find((h) => h.alive && cx >= h.cx && cy >= h.cy && cx < h.cx + h.w && cy < h.cy + h.h) || null;
};
function setHouse(h, up) {
  h.alive = up;
  for (let y = h.cy; y < h.cy + h.h; y++) for (let x = h.cx; x < h.cx + h.w; x++) G.block[idx(x, y)] = up ? 1 : 0;
}
// A blast at (x, y): every standing house within `rad` px of it takes a share, less toward the edge. `skip`: the
// target hit directly (already hurt by the shot itself).
function houseBlast(x, y, rad, dmg, wh, attacker, skip) {
  if (!G.houses || !G.houses.length || G.remote || !dmg) return;
  for (const h of G.houses) {
    if (!h.alive || h === skip) continue;
    const d = distTo({ x, y }, h);
    if (d < rad) damage(h, dmg * (1 - d / rad * 0.6), wh, attacker, { x, y });
  }
}
function collapseHouse(h) {
  h.hp = 0;
  setHouse(h, false);
  // Whoever held it is thrown out into the street, hurt.
  for (const u of G.entities.slice()) {
    if (!u.alive || u.inHouse !== h) continue;
    leaveHouse(u); setGuard(u, u.x, u.y);
    u.hp -= u.maxHp * GARRISON_FALL; u.hitT = G.t;
    if (u.hp <= 0) kill(u, null, 'HE');
  }
  h.n = 0; h.team = -1;
  const seed = (h.id * 7919) | 0;
  hooks.sfx('explodeBig', h.x, h.y); hooks.sfx('collapse', h.x, h.y); hooks.shake(h.x, h.y, 2 + h.w * h.h * 0.4);
  const n = h.w * h.h + 1;
  for (let i = 0; i < n; i++) {
    G.effects.push({ type: 'expl', x: (h.cx + Math.random() * h.w) * CELL, y: (h.cy + Math.random() * h.h) * CELL, size: 8 + Math.random() * 7,
      t: -i * 0.15, life: 0.8, seed: seed + i, debris: i % 2 === 0 });
  }
  for (let i = 0; i < 3; i++) smoulder((h.cx + 0.3 + Math.random() * (h.w - 0.6)) * CELL, (h.cy + 0.3 + Math.random() * (h.h - 0.6)) * CELL, 14 + Math.random() * 10);
  rubble(G.tctx, h.cx * CELL, h.cy * CELL, h.w * CELL, h.h * CELL, seed);
  scorch(G.tctx, h.x, h.y, Math.min(h.w, h.h) * CELL * 0.45, seed + 3);
}
// Fire and smoke from a badly damaged house (below 30% health), run with the effects on every copy.
function houseFx(dt) {
  if (!G.houses || !G.houses.length) return;
  for (const h of G.houses) {
    if (!h.alive || h.hp > h.maxHp * DMG_AT[1]) continue;
    if ((h.fxT = (h.fxT || 0) - dt) > 0) continue;
    h.fxT = 0.25 + Math.random() * 0.35;
    const x = (h.cx + 0.25 + Math.random() * (h.w - 0.5)) * CELL, y = (h.cy + 0.25 + Math.random() * (h.h - 0.5)) * CELL;
    if (Math.random() < 0.5) G.effects.push({ type: 'fire', x, y: y - 10, t: 0, life: 0.6 + Math.random() * 0.5, vy: -14 });
    G.effects.push({ type: 'smoke', x, y: y - 14, r: 3, t: 0, life: 2.4, alpha: 0.5, color: '#3a3632', vy: -10, vx: 2 });
  }
}
// Garrisons. Infantry sent into a house (commandGarrison, or a tap on the house) walk to it and go in, up to its `cap`
// (3 to 6, the church 10); one side holds a house at a time (`h.team`, `h.n`). Inside, a soldier is hidden in the house
// (u.inHouse; still an entity, at the house's middle, so enemies can aim at him), cannot be run into, fires from the
// windows with GARRISON_REACH more range, and takes GARRISON_COVER of each hit while the house takes it all. Any other
// order brings him out; a house that falls throws its garrison out hurt (GARRISON_FALL of their health).
const GARRISON_REACH = CELL, GARRISON_COVER = 0.3, GARRISON_FALL = 0.35;
const canGarrison = (u) => !!u && u.kind === 'unit' && u.alive && u.cls === 'inf' && !!u.def.weapon && !u.def.engineer && !u.chute && !u.def.scripted;
const houseOpen = (h, side) => !!h && h.kind === 'house' && h.alive && h.cap > 0 && (!h.n || h.team === side) && (h.n || 0) < h.cap;
const garrisonOf = (h) => G.entities.filter((u) => u.alive && u.inHouse === h);
function commandGarrison(units, h) {
  if (!h || h.kind !== 'house' || !h.alive) return;
  for (const u of units) {
    if (!canGarrison(u) || u.inHouse === h) continue;
    if (!houseOpen(h, u.team)) { if (!G.teams[u.team].isAI) say(u.team, 'Building full'); return; }
    const p = u.inHouse ? houseDoor(u.inHouse) : besideSpot(u, h);
    if (!p) { say(u.team, 'Cannot reach it'); continue; }
    u.order = { type: 'garrison', target: h }; u.target = null; u.staged = false; u.defending = false; u.homeward = false; takeOver(u, 'move');
    if (!u.inHouse) goTo(u, p.x, p.y);
  }
}
// Out of whatever house they are in, standing in the doorway.
function commandExit(units) {
  for (const u of units) {
    if (!u.alive || !u.inHouse) continue;
    leaveHouse(u); setGuard(u, u.x, u.y); u.staged = false; takeOver(u, 'move');
  }
}
// A free cell beside the house, the south side (its door) first.
function houseDoor(h) {
  const ring = [];
  for (let y = h.cy - 1; y <= h.cy + h.h; y++) for (let x = h.cx - 1; x <= h.cx + h.w; x++) {
    if (!inMap(x, y) || (x >= h.cx && x < h.cx + h.w && y >= h.cy && y < h.cy + h.h) || G.block[idx(x, y)]) continue;
    ring.push([x, y, (y === h.cy + h.h ? 0 : 2) + Math.abs(x + 0.5 - h.cx - h.w / 2) / h.w + Math.random() * 0.8]);
  }
  ring.sort((a, b) => a[2] - b[2]);
  const c = ring[0];
  return c ? { x: (c[0] + 0.3 + Math.random() * 0.4) * CELL, y: (c[1] + 0.3 + Math.random() * 0.4) * CELL } : { x: h.x, y: (h.cy + h.h) * CELL + 4 };
}
function enterHouse(u, h) {
  u.inHouse = h; h.team = u.team; h.n = (h.n || 0) + 1;
  u.x = h.x; u.y = h.y; u.dest = null; u.path = null; u.target = null; u.stance = null; u.burst = null; u.moving = false;
  u.order = { type: 'garrison', target: h };
  hooks.sfx('place', h.x, h.y);
}
function leaveHouse(u) {
  const h = u.inHouse;
  if (!h) return;
  u.inHouse = null;
  h.n = Math.max(0, (h.n || 0) - 1);
  if (!h.n) h.team = -1;
  const p = houseDoor(h);
  u.x = p.x; u.y = p.y; u.dest = null; u.path = null; u.burst = null;
}
function updateEnterHouse(u) {
  const h = u.order.target;
  if (!houseOpen(h, u.team)) {
    if (h && h.alive && h.n >= h.cap && h.team === u.team && !G.teams[u.team].isAI) say(u.team, 'Building full');
    setGuard(u, u.x, u.y); return;
  }
  const d = distTo(u, h), settled = !u.dest && !u.needPath;
  if (d > CELL * 1.2 && !(settled && d <= CELL * 2.5)) {
    if (settled) { const p = besideSpot(u, h); if (p) goTo(u, p.x, p.y); else setGuard(u, u.x, u.y); }
    return;
  }
  enterHouse(u, h);
}
function updateGarrison(u, dt) {
  const h = u.inHouse, w = u.def.weapon, w2 = u.def.weapon2, more = GARRISON_REACH + Math.max(h.w, h.h) * CELL / 2;
  u.moving = false;
  if (u.target && (!u.target.alive || !canTarget(u, u.target) || distTo(u, u.target) > wRange(u, w) + more)) u.target = null;
  if ((u.think -= dt) <= 0) {
    u.think = 0.35 + Math.random() * 0.2;
    if (!u.target || u.target.kind !== 'unit') u.target = acquire(u, wRange(u, w) + more, [w]) || u.target;
  }
  const t = u.target;
  if (t && u.cd <= 0 && canHit(w, t) && clearShot(u, t, w)) {
    u.face = Math.atan2(t.y - (t.alt || 0) - u.y, t.x - u.x);
    shoot(u, w, t);   // full bursts from the window (rifles 3, the MG Team 6)
    u.cd = w.rof * VET.reload[u.rank || 0];
  }
  if (w2 && u.cd2 <= 0 && u.cd <= 0) {   // a Rocket Soldier's anti-aircraft missile, out of the window too
    const t2 = acquire(u, wRange(u, w2) + more, [w2]);
    if (t2) { fireWeapon(u, w2, t2); u.cd2 = w2.rof * VET.reload[u.rank || 0]; u.cd = Math.max(u.cd, u.cd2); } else u.cd2 = 0.3;
  }
}

// The village's life, looks only (each copy works it out from what it sees; the game server skips it): props knocked
// over by blasts and passing vehicles, smoke from some chimneys, and pigeons on the square and the church roof that
// take off when fighting comes near and come back once it is quiet.
const knockSeen = new WeakSet(), folkSeen = new WeakSet();
function knockProp(p) {
  p.up = false;
  G.effects.push({ type: 'smoke', x: p.x, y: p.y - 2, r: 3, t: 0, life: 0.9, alpha: 0.35, color: '#8a7a62', vy: -6 });
  if (p.k === 'lamp') G.effects.push({ type: 'spark', x: p.x + 4, y: p.y, lift: 16, t: 0, life: 0.15 });
}
function villageLife(dt) {
  if (G.me < 0 || !G.houses || !G.houses.length) return;
  const props = G.props || [];
  // Blasts knock over what stands near them.
  for (const fx of G.effects) {
    if (fx.type !== 'expl' || fx.t < 0 || knockSeen.has(fx)) continue;
    knockSeen.add(fx);
    const rad = Math.max(10, (fx.size || 6) * 1.6);
    for (const p of props) if (p.up && Math.abs(p.x - fx.x) < rad && Math.abs(p.y - fx.y) < rad && Math.hypot(p.x - fx.x, p.y - fx.y) < rad) knockProp(p);
    for (const f of birdFlocks()) if (f.st !== 1 && Math.hypot(f.hx - fx.x, f.hy - fx.y) < 240) scareFlock(f, fx.x, fx.y);
  }
  flyBirds(dt); moveFolk(dt); moveHens(dt); villageSounds(dt);
  for (const fx of G.effects) {   // (blasts scare the villagers and the hens too)
    if (fx.type !== 'expl' || fx.t < 0 || folkSeen.has(fx)) continue;
    folkSeen.add(fx);
    for (const v of villagers()) if (v.st !== 'in' && Math.abs(v.x - fx.x) < 260 && Math.abs(v.y - fx.y) < 260) scareFolk(v, fx.x, fx.y);
    for (const c of hens()) if (Math.abs(c.hx - fx.x) < 160 && Math.abs(c.hy - fx.y) < 160) scareHen(c, fx.x, fx.y);
    G.calmAt = G.t + 30;
  }
  if ((G.lifeT = (G.lifeT || 0) - dt) > 0) return;
  G.lifeT = 0.25;
  // Vehicles drive them down; anyone near the pigeons sends them up.
  const box = G.villageBox || (G.villageBox = props.concat(G.houses).reduce((b, p) => [Math.min(b[0], p.x), Math.min(b[1], p.y), Math.max(b[2], p.x), Math.max(b[3], p.y)], [1e9, 1e9, -1e9, -1e9]));
  for (const u of G.entities) {
    if (!u.alive || u.kind !== 'unit' || u.inHouse || isAirborne(u) || u.x < box[0] - 60 || u.y < box[1] - 60 || u.x > box[2] + 60 || u.y > box[3] + 60) continue;
    if (u.cls === 'veh') for (const p of props) if (p.up && Math.abs(p.x - u.x) < 10 && Math.abs(p.y - u.y) < 10) { knockProp(p); hooks.sfx('hitSmall', p.x, p.y); }
    for (const f of birdFlocks()) if (f.st === 0 && Math.hypot(f.hx - u.x, f.hy - u.y) < 75) scareFlock(f, u.x, u.y);
    if (u.def.weapon) {   // soldiers and guns send the villagers indoors
      for (const v of villagers()) if (v.st !== 'in' && v.st !== 'flee' && Math.abs(v.x - u.x) < 200 && Math.abs(v.y - u.y) < 200) scareFolk(v, u.x, u.y);
      G.calmAt = Math.max(G.calmAt || 0, G.t + 20);
    }
    for (const c of hens()) if (Math.abs(c.hx - u.x) < 50 && Math.abs(c.hy - u.y) < 50) scareHen(c, u.x, u.y);
  }
  for (const f of birdFlocks()) if (f.st === 0) for (const p of G.projectiles) if (Math.abs(p.x - f.hx) < 90 && Math.abs(p.y - f.hy) < 90) { scareFlock(f, p.x, p.y); break; }
  // Chimney smoke from about two houses in five that are not badly hurt.
  for (const h of G.houses) {
    if (!h.alive || h.cap === 0 || h.id % 5 > 1 || h.hp < h.maxHp * 0.6 || !G.seen[idx(h.cx, h.cy)]) continue;
    if ((h.smokeT = (h.smokeT || Math.random() * 2) - 0.25) > 0) continue;
    h.smokeT = 1.4 + Math.random();
    const m = modelCache.get('S' + h.type + 'allies');
    if (m && m.chim) G.effects.push({ type: 'smoke', x: h.cx * CELL + m.chim.x, y: h.cy * CELL + m.chim.y, lift: m.chim.z * VK, r: 2.2, t: 0, life: 3.5, alpha: 0.32, color: '#bdb8ae', vy: -7, vx: 1.5 });
  }
}
// A flock on each square round the fountain, and one on each church roof.
function birdFlocks() {
  if (G.birds) return G.birds;
  G.birds = [];
  const fs = G.houses.filter((h) => h.type.startsWith('hv:fountain')), cs = G.houses.filter((h) => h.type.startsWith('hv:church'));
  const flock = (hx, hy, ha, n, spread) => {
    const fl = { hx, hy, ha, st: 0, t: 0, birds: [] };
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = ha ? spread * (0.5 + Math.random() * 0.5) : spread + Math.random() * 30;
      const b = { ox: Math.cos(a) * d, oy: Math.sin(a) * d * (ha ? 0.25 : 0.8), x: 0, y: 0, alt: ha, vx: 0, vy: 0, ph: Math.random() * 6, face: Math.random() < 0.5 ? 1 : -1 };
      b.x = hx + b.ox; b.y = hy + b.oy; fl.birds.push(b);
    }
    G.birds.push(fl);
  };
  for (const f of fs) flock(f.x, f.y + 4, 0, 14, 54);   // round the basin's rim, not under it
  for (const c of cs) flock(c.x, c.y, 34, 7, 26);
  return G.birds;
}
function scareFlock(f, x, y) {
  f.st = 1; f.t = 20 + Math.random() * 25;
  const away = Math.atan2(f.hy - y, f.hx - x);
  for (const b of f.birds) { const a = away + (Math.random() - 0.5) * 1.6, sp = 55 + Math.random() * 30; b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.turn = (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.4); }
}
function flyBirds(dt) {
  for (const f of birdFlocks()) {
    for (const b of f.birds) {
      b.ph += dt * (f.st ? 14 : 1.5);
      if (f.st === 0) {   // pecking about, now and then a hop
        if (Math.random() < dt * 0.4) { b.ox += (Math.random() - 0.5) * 6; b.oy += (Math.random() - 0.5) * 4; b.face = Math.random() < 0.5 ? 1 : -1; }
        b.x = f.hx + b.ox; b.y = f.hy + b.oy; b.alt = f.ha;
        continue;
      }
      if (f.st === 1) {   // away: up and wheeling round
        const a = Math.atan2(b.vy, b.vx) + b.turn * dt, sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.alt = Math.min(60, b.alt + dt * 30);
      } else {   // home again
        const tx = f.hx + b.ox, ty = f.hy + b.oy, d = Math.hypot(tx - b.x, ty - b.y);
        if (d < 4) { b.alt = Math.max(f.ha, b.alt - dt * 40); b.vx = b.vy = 0; continue; }
        b.vx = (tx - b.x) / d * 60; b.vy = (ty - b.y) / d * 60; b.alt = Math.max(f.ha, Math.min(60, d * 0.3 + f.ha));
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.face = b.vx >= 0 ? 1 : -1;
    }
    if (f.st === 1 && (f.t -= dt) <= 0) f.st = 2;
    if (f.st === 2 && f.birds.every((b) => Math.hypot(f.hx + b.ox - b.x, f.hy + b.oy - b.y) < 4 && b.alt <= f.ha + 0.5)) f.st = 0;
  }
}

// Villagers (looks only, like the pigeons): a dozen or so walk the lanes from lamp to lamp (the lamps stand in the
// streets, so the lines between them in a row are streets), stop to chat, and run into the nearest house that is still
// standing and not held when soldiers, shots or blasts come near; they come out again once it has been calm a while.
let folkNet = null, folkNetFor = null;
const FOLK_SHIRTS = ['#a33a2a', '#3a5a8a', '#d8cfa8', '#5a7a3a', '#8a5a8a', '#c9a227', '#e2ddd0', '#6b4a2a'];
function streetNet() {
  if (folkNetFor === G && folkNet) return folkNet;
  const pts = (G.props || []).filter((p) => p.k === 'lamp').map((p) => ({ x: p.x, y: p.y + 6, n: [] }));
  // The square: a ring round the fountain and points along its edges, so people cross it and stroll round.
  for (const [a, b, c, d] of villageSquares(MAPS[G.mapId])) {
    const mx = (a + c + 1) / 2 * CELL, my = (b + d + 1) / 2 * CELL;
    for (let i = 0; i < 10; i++) pts.push({ x: mx + Math.cos(i * Math.PI / 5) * CELL * 3.3, y: my + Math.sin(i * Math.PI / 5) * CELL * 3.1, n: [] });
    for (const t of [0.25, 0.5, 0.75]) for (const [x, y] of [[a + 3 + (c - a - 5) * t, b + 3], [a + 3 + (c - a - 5) * t, d - 1], [a + 3, b + 3 + (d - b - 5) * t], [c - 1, b + 3 + (d - b - 5) * t]]) pts.push({ x: x * CELL, y: y * CELL, n: [] });
  }
  const clear = (a, b) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8); for (let i = 0; i <= n; i++) { const x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n; if (G.block[cellOfPos(x, y)]) return false; } return true; };
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const a = pts[i], b = pts[j], dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
    const dd = Math.hypot(dx, dy);
    if ((((dx < 40 || dy < 40) && dd < CELL * 17) || dd < CELL * 6) && clear(a, b)) { a.n.push(j); b.n.push(i); }
  }
  folkNet = pts; folkNetFor = G;
  return pts;
}
function villagers() {
  if (G.folk) return G.folk;
  G.folk = [];
  const net = streetNet().map((p, i) => [p, i]).filter(([p]) => p.n.length);
  const nv = Math.max(1, villageSquares(MAPS[G.mapId]).length);   // 16 for one village, 8 more for each other
  for (let k = 0; k < Math.min(Math.min(48, 8 + 8 * nv), net.length); k++) {
    const [p, i] = net[(Math.random() * net.length) | 0];
    G.folk.push({ x: p.x + (Math.random() - 0.5) * 8, y: p.y, node: i, to: p.n[(Math.random() * p.n.length) | 0], st: 'walk', t: 0, sp: 13 + Math.random() * 7,
      look: (Math.random() * 1e6) | 0, face: 1, ph: Math.random() * 6, side: (Math.random() - 0.5) * 10 });
  }
  return G.folk;
}
const doorOf = (h) => ({ x: h.x, y: (h.cy + h.h) * CELL + 3 });
function scareFolk(v, x, y) {
  if (v.st === 'in' || v.st === 'flee') return;
  const net = streetNet(), open = G.houses.filter((h) => h.alive && h.cap > 0 && !h.n);
  let best = null, bd = Infinity;
  for (const h of open) { const d = doorOf(h), dd = Math.hypot(d.x - v.x, d.y - v.y) + (Math.hypot(d.x - x, d.y - y) < 60 ? 400 : 0); if (dd < bd) { bd = dd; best = h; } }
  if (!best) return;
  v.st = 'flee'; v.slow = false; v.house = best.id; v.via = net[v.to] ? { x: net[v.to].x, y: net[v.to].y } : null;
  if (v.via && Math.hypot(v.via.x - v.x, v.via.y - v.y) > Math.hypot(doorOf(best).x - v.x, doorOf(best).y - v.y)) v.via = null;
}
function moveFolk(dt) {
  if (!G.folk) { if (G.props && G.props.length) villagers(); else return; }
  const net = streetNet(), dark = nightLevel() > 0.5, calm = G.t > (G.calmAt || 0) && !dark;   // at night they stay in
  const step = (v, tx, ty, sp) => { const dx = tx - v.x, dy = ty - v.y, d = Math.hypot(dx, dy); if (d < sp * dt + 0.5) { v.x = tx; v.y = ty; return true; } v.x += dx / d * sp * dt; v.y += dy / d * sp * dt; if (Math.abs(dx) > 0.5) v.face = dx > 0 ? 1 : -1; v.ph += dt * sp * 0.6; return false; };
  for (const v of G.folk) {
    if (v.st === 'in') {   // indoors: out again once it is calm, or at once if the house is coming down
      const h = G.byId.get(v.house);
      if (h && h.alive && ((v.t -= dt) > 0 || !calm) && !h.n) continue;
      const d = h ? doorOf(h) : v; v.x = d.x; v.y = d.y; v.st = h && h.alive ? 'home' : 'walk'; v.slow = false;
      let bi = 0, bd = Infinity; net.forEach((p, i) => { const dd = Math.hypot(p.x - v.x, p.y - v.y); if (p.n.length && dd < bd) { bd = dd; bi = i; } });
      v.to = bi; continue;
    }
    if (v.st === 'flee') {
      const h = G.byId.get(v.house);
      if (!h || !h.alive || h.n) { v.st = 'walk'; continue; }
      const sp = v.slow ? 20 : 48;   // (home for the night at a walk; from danger at a run)
      if (v.via) { if (step(v, v.via.x, v.via.y, sp)) v.via = null; continue; }
      const d = doorOf(h);
      if (step(v, d.x, d.y, sp)) { v.st = 'in'; v.t = 25 + Math.random() * 30; }
      continue;
    }
    if (dark) { scareFolk(v, -1e5, -1e5); v.slow = true; continue; }   // nightfall: everyone walks home
    if (v.st === 'idle') { if ((v.t -= dt) <= 0) v.st = 'walk'; continue; }
    const p = net[v.to];
    if (!p) continue;
    if (step(v, p.x + v.side * (Math.abs(p.x - v.x) < 30 ? 1 : 0), p.y + v.side * (Math.abs(p.y - v.y) < 30 ? 0.6 : 0), v.st === 'home' ? 20 : v.sp)) {
      const back = v.node; v.node = v.to; v.st = 'walk';
      const next = p.n.filter((j) => j !== back);
      v.to = (next.length ? next : p.n)[(Math.random() * (next.length || p.n.length)) | 0];
      if (Math.random() < 0.3) { v.st = 'idle'; v.t = 1.5 + Math.random() * 5; }
    }
  }
}
// Hens in a few yards: pecking about, scattering from anyone who comes near, and back.
function hens() {
  if (G.hens) return G.hens;
  G.hens = [];
  const yards = G.houses.filter((h) => h.alive && h.cap > 0 && h.cap < 10);
  for (let k = 0; k < 4 && yards.length; k++) {
    const h = yards[(Math.random() * yards.length) | 0], hx = (h.cx - 0.5) * CELL, hy = (h.cy + h.h / 2) * CELL;
    for (let i = 0; i < 4 + ((Math.random() * 3) | 0); i++) G.hens.push({ hx: hx + (Math.random() - 0.5) * 10, hy: hy + (Math.random() - 0.5) * 20, x: hx, y: hy, vx: 0, vy: 0, run: 0, ph: Math.random() * 6, face: 1, white: Math.random() < 0.6 });
  }
  return G.hens;
}
function scareHen(c, x, y) { const a = Math.atan2(c.y - y, c.x - x) + (Math.random() - 0.5); c.vx = Math.cos(a) * 55; c.vy = Math.sin(a) * 55; c.run = 0.8 + Math.random() * 0.6; }
function moveHens(dt) {
  if (!G.hens) { if (G.houses.length && G.props && G.props.length) hens(); else return; }
  for (const c of G.hens) {
    c.ph += dt * (c.run > 0 ? 20 : 2);
    if (c.run > 0) { c.run -= dt; c.x += c.vx * dt; c.y += c.vy * dt; c.face = c.vx > 0 ? 1 : -1; c.flap = true; continue; }
    c.flap = false;
    const dx = c.hx - c.x, dy = c.hy - c.y, d = Math.hypot(dx, dy);
    if (d > 6) { c.x += dx / d * 12 * dt; c.y += dy / d * 12 * dt; c.face = dx > 0 ? 1 : -1; }
    else if (Math.random() < dt * 0.5) { c.hx += (Math.random() - 0.5) * 8; c.hy += (Math.random() - 0.5) * 6; }
  }
}
// The church bell now and then while the village is quiet, and birdsong from the square.
function villageSounds(dt) {
  const church = G.houses.find((h) => h.alive && h.type.startsWith('hv:church')), fountain = G.houses.find((h) => h.alive && h.type.startsWith('hv:fountain'));
  const calm = G.t > (G.calmAt || 0);
  if (church && calm && !church.n) {
    if (G.bellN > 0 && G.t >= G.bellAt) { hooks.sfx('bell', church.x, church.y); G.bellN--; G.bellAt = G.t + 1.9; }
    else if (!(G.bellN > 0) && G.t >= (G.bellNext || (G.bellNext = G.t + 20 + Math.random() * 40))) { G.bellN = 3 + ((Math.random() * 3) | 0); G.bellAt = G.t; G.bellNext = G.t + 110 + Math.random() * 90; }
  }
  if (fountain && calm && nightLevel() < 0.3 && G.birds && G.birds[0] && G.birds[0].st === 0 && G.t >= (G.chirpAt || 0)) {
    G.chirpAt = G.t + 2.5 + Math.random() * 5;
    hooks.sfx('chirp', fountain.x + (Math.random() - 0.5) * 120, fountain.y + (Math.random() - 0.5) * 120);
  }
}

// An online copy: the houses' health as the host sent it (0: down).
function applyHouses(list) {
  list.forEach((v, i) => {
    const h = G.houses && G.houses[i];
    if (!h) return;
    if (Array.isArray(v)) { h.team = v[1]; h.n = v[2]; v = v[0]; }
    if (v < h.hp) h.hitT = G.t;
    h.hp = v;
    if ((v > 0) !== h.alive) setHouse(h, v > 0);
  });
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

// Each map has its own size (`size` in MAPS): set it before a battle is made or loaded. Everything sized by the
// map (G's arrays, the ground pictures) is made after this; the pathfinder's arrays and the target buckets here.
function setMapSize(n) {
  if (n === MAP) return;
  MAP = n; WORLD = MAP * CELL; NCELLS = MAP * MAP;
  GRID_N = Math.ceil(MAP / GRID_CELLS);
  Object.assign(PF, { g: new Float32Array(NCELLS), from: new Int32Array(NCELLS), open: new Uint32Array(NCELLS), closed: new Uint32Array(NCELLS), stamp: 0 });
}
// MOVER: the unit a path or a step is being worked out for, so barbed wire stops only infantry and a gate only those
// who are not of its alliance (softBlocks). With no unit named, wire and gates stop everything. Hard walls are in G.block.
let MOVER = null;
function softBlocks(c) {
  const d = WALL_BY_ID[G.wall[c]];
  if (!d || d.hard) return false;
  if (!MOVER) return true;
  return d.wire ? MOVER.cls === 'inf' : !alliedSides(MOVER.team, G.wallTeam[c]);
}
const freeCell = (c) => !G.block[c] && !G.bld[c] && !(G.wallN && softBlocks(c));
function passableAt(x, y) {
  if (x < 2 || y < 2 || x > WORLD - 2 || y > WORLD - 2) return false;
  return freeCell(cellOfPos(x, y));
}
// A step from one cell to a diagonal neighbour is shut when both cells between them are blocked: two wall pieces that
// touch at a corner (a diagonal wall), or two buildings or rocks. findPath never routes through one; this keeps a unit's
// own steps (tryMove) and straight-line shortcuts (los) from slipping through it either.
function cornerShut(a, b) {
  const ax = cellX(a), ay = cellY(a), bx = cellX(b), by = cellY(b);
  if (Math.abs(ax - bx) !== 1 || Math.abs(ay - by) !== 1) return false;
  return !freeCell(idx(bx, ay)) && !freeCell(idx(ax, by));
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

// How far (in cells, along the ground, by the pathfinder's rules) every cell is from world point (sx, sy), out to
// maxCost: one search answers "how long is the way to each of these points" at once (the computer's flanking
// planner, aiApproachSpots, asked findPath up to 26 times in one step, a quarter-second stall in a 3 v 3).
// Infinity where it is out of reach or further. The array is reused: read it before the next call.
let FIELD = null;
function pathField(sx, sy, maxCost) {
  if (!FIELD || FIELD.d.length !== NCELLS) FIELD = { d: new Float64Array(NCELLS), hk: new Float64Array(NCELLS * 8 + 8), hv: new Int32Array(NCELLS * 8 + 8), key: '' };
  const d = FIELD.d, hk = FIELD.hk, hv = FIELD.hv;
  let s = cellOfPos(sx, sy);
  if (!freeCell(s)) s = nearestFreeCell(s, 3);
  const key = s + ':' + maxCost + ':' + G.t;   // asked again in the same step (aiPincerStart tries 3 squads, then 2): the same answer
  if (FIELD.key === key) return d;
  FIELD.key = key;
  d.fill(Infinity);
  if (s < 0) return d;
  let n = 0;
  const push = (k, v) => { let i = n++; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = k; hv[i] = v; };
  const pop = () => {
    const v = hv[0], lk = hk[--n], lv = hv[n];
    if (n) { let i = 0; while (true) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && hk[c + 1] < hk[c]) c++; if (hk[c] >= lk) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; } hk[i] = lk; hv[i] = lv; }
    return v;
  };
  d[s] = 0; push(0, s);
  while (n) {
    const k = hk[0], c = pop();
    if (k > d[c]) continue;
    if (k > maxCost) break;
    const cx = cellX(c), cy = cellY(c);
    for (let i = 0; i < 8; i++) {
      const dx = DIRS8[i][0], dy = DIRS8[i][1], nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= MAP || ny >= MAP) continue;
      const m = ny * MAP + nx;
      if (G.block[m] || G.bld[m]) continue;
      if (dx && dy && (G.block[cy * MAP + nx] || G.bld[cy * MAP + nx] || G.block[ny * MAP + cx] || G.bld[ny * MAP + cx])) continue;
      const ng = k + (dx && dy ? 1.414 : 1);
      if (ng < d[m] && n < hk.length) { d[m] = ng; push(ng, m); }
    }
  }
  return d;
}

function findPath(sx, sy, tx, ty, rad) {
  let s = cellOfPos(sx, sy), t = cellOfPos(tx, ty);
  const exactEnd = freeCell(t);
  if (!exactEnd) t = nearestFreeCell(t, 12);
  if (!freeCell(s)) s = nearestFreeCell(s, 3);
  if (s < 0 || t < 0) return null;
  if (s === t) return [exactEnd ? { x: tx, y: ty } : cellCenter(t)];   // (a goal inside water or rock: stop at the nearest open cell, never push at the goal itself)
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
  const h = (c) => { const dx = Math.abs(cellX(c) - tx0), dy = Math.abs(cellY(c) - ty0); return (Math.max(dx, dy) + 0.414 * Math.min(dx, dy)) * 1.001; };   // (a hair over: ties go to the cell nearer the goal, so far fewer cells are searched)
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
  let pc = cellOfPos(ax, ay);
  for (let i = 1; i <= n; i++) {
    const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n, c = cellOfPos(x, y);
    if (!passableAt(x, y) || !passableAt(x + px, y + py) || !passableAt(x - px, y - py) || cornerShut(pc, c)) return false;
    pc = c;
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

// The computer re-sends a defending or hunting unit after a moving target every second or so (defendBase, defendAllies, the
// hunt look-round): in a big fight that was about 140 new routes a second, every one throwing away the unit's path and putting it at the
// back of the queue, so units stood waiting for a route instead of walking (match with units idle 10 s+, `need` true at place 37
// of 108). A computer unit that already has a route (or is queued for one) keeps it while its goal has moved less than
// REROUTE_MIN cells, or REROUTE_FRAC of the way left; `force` (a stuck unit, a retry) always works a new one out.
const REROUTE_MIN = 3, REROUTE_FRAC = 0.15, REROUTE_AGE = 4;   // (a route older than REROUTE_AGE s is worked out again: walls, buildings and bridges change)
function goTo(u, x, y, force, auto) {
  // `auto`: a re-send by the game's own logic (defendAllies, ...) rather than a player's order: a human's unit keeps its route like the computer's.
  if (!force && u.dest && (u.path || u.needPath) && (auto || G.teams[u.team].isAI) && !u.def.harvester && !u.def.deploys) {
    if ((u.needPath || G.t - (u.pathT || 0) < REROUTE_AGE) && Math.hypot(u.dest.x - x, u.dest.y - y) < Math.max(CELL * REROUTE_MIN, Math.hypot(u.x - x, u.y - y) * REROUTE_FRAC)) return;
  }
  u.dest = { x, y };
  u.path = null; u.pathIdx = 0; u.stuckN = 0; u.nearBest = null;
  if (!u.needPath) { u.needPath = true; G.pathQueue.push(u); }
}
// Infantry on the attack march a little off the straight line, each by its own sideways offset
// (its lane), so a wave arrives strung out instead of in one ball that a V2 or a shell wipes out.
// Each wave rolls once, shared by the orders given within 2 seconds of each other: most waves
// spread out (wide lanes), but about one in three stays tight, so big splash kills still happen.
// Lanes are dealt out evenly across the width (not at random), and a loose wave also gets a small
// speed spread so it strings out in depth over a long march.
// Ground vehicles get lanes too, wider (they are bigger) and never fully tight: a tight wave of
// tanks is a narrower column, not a ball. Their pace spread only slows them (never past top speed).
const LANE_LOOSE = 70, LANE_TIGHT = 10, TIGHT_CHANCE = 0.3, LANE_VEH_LOOSE = 100, LANE_VEH_TIGHT = 50;
function assignLane(u) {
  if ((u.cls !== 'inf' && u.cls !== 'veh') || u.def.harvester || u.def.deploys) { u.lane = 0; u.paceMul = 1; return; }
  if (!G.laneRoll || G.t - G.laneRoll.t > 2) G.laneRoll = { t: G.t, tight: Math.random() < TIGHT_CHANCE, n: 0, off: Math.random() };
  const r = G.laneRoll, frac = (r.n++ * 0.618034 + r.off) % 1, veh = u.cls === 'veh';
  u.lane = (frac * 2 - 1) * (veh ? (r.tight ? LANE_VEH_TIGHT : LANE_VEH_LOOSE) : r.tight ? LANE_TIGHT : LANE_LOOSE);
  u.paceMul = veh ? 0.88 + Math.random() * 0.12 : r.tight ? 1 : 0.88 + Math.random() * 0.2;
}
// Bends each leg of the path sideways by the unit's lane, easing back to the route at the corners
// (so narrow gaps stay passable) but holding the full offset on the way in to the target.
function laneOffsetPath(u) {
  const out = []; let px = u.x, py = u.y;
  const lastIdx = u.path.length - 1;
  u.path.forEach((q, i) => {
    const dx = q.x - px, dy = q.y - py, len = Math.hypot(dx, dy);
    if (len > 90) {
      const n = Math.floor(len / 60), nx = -dy / len, ny = dx / len;
      for (let k = 1; k <= n; k++) {
        const f = k / (n + 1), off = u.lane * (i === lastIdx ? Math.min(1, f * 4) : Math.sin(Math.PI * f));
        const x = px + dx * f + nx * off, y = py + dy * f + ny * off;
        if (passableAt(x, y)) out.push({ x, y });
      }
    }
    out.push(q); px = q.x; py = q.y;
  });
  u.path = out;
}
// Routes are worked out from a queue: up to 8 a step, and once PATH_MS of route-finding is spent the rest wait
// for the next step (a long route round the river can take 20 to 40 ms; 8 at once stalled the battle).
const PATH_MS = 6;
const clockMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
function processPaths() {
  let budget = 8;
  const t0 = clockMs();
  while (budget-- > 0 && G.pathQueue.length && (budget === 7 || clockMs() - t0 < PATH_MS)) {
    // A player's units are served before the computer's (a big computer wave must not hold a human's army in the queue).
    let qi = 0;
    for (let k = 0, n = Math.min(G.pathQueue.length, 64); k < n; k++) if (!G.teams[G.pathQueue[k].team].isAI) { qi = k; break; }
    const u = qi ? G.pathQueue.splice(qi, 1)[0] : G.pathQueue.shift();
    if (!u.alive || !u.needPath || !u.dest) { u.needPath = false; continue; }
    u.needPath = false;
    MOVER = u;
    try { u.path = findPath(u.x, u.y, u.dest.x, u.dest.y, u.def.r); } finally { MOVER = null; }
    u.pathIdx = 0; u.pathT = G.t;
    if (!u.path || !u.path.length) u.dest = null;
    else if (u.lane && (u.order.type === 'hunt' || u.order.type === 'attack')) laneOffsetPath(u);
  }
}

function tryMove(u, dx, dy) {
  MOVER = u;
  try {
    const nx = u.x + dx, ny = u.y + dy;
    let ok = false;
    if (passableAt(nx, ny) && !cornerShut(cellOfPos(u.x, u.y), cellOfPos(nx, ny))) { u.x = nx; u.y = ny; ok = true; }
    else if (dx && passableAt(nx, u.y)) { u.x = nx; ok = true; }
    else if (dy && passableAt(u.x, ny)) { u.y = ny; ok = true; }
    // A vehicle flattens the barbed wire it drives over.
    if (ok && G.wallN && u.cls === 'veh' && !G.remote) { const c = cellOfPos(u.x, u.y), d = WALL_BY_ID[G.wall[c]]; if (d && d.wire) removeWall(c); }
    return ok;
  } finally { MOVER = null; }
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
const CORNER_R = CELL * 1.5;
const SQUEEZE_AFTER = 1.5, SQUEEZE_FOR = 3;
function followPath(u, dt) {
  if (!u.dest) return true;
  if (u.needPath || !u.path) return false;
  if (u.pathIdx >= u.path.length) { u.dest = null; return true; }
  const p = u.path[u.pathIdx], last = u.pathIdx === u.path.length - 1;
  const dx = p.x - u.x, dy = p.y - u.y, d = Math.hypot(dx, dy);
  let reached = d < (last ? arriveRadius(u, p, d) : 7);
  // A column shares its route's corners, and friends stand on the exact point, so in a crowd a unit could not get within 7 px of
  // a corner and milled round it until the others had gone (owner's piles: 11 of 24 units round one corner, moving but going nowhere
  // for 10 s+). Within CORNER_R of a corner, a unit with a clear straight line to the point after it takes the corner from there.
  if (!reached && !last && d < CORNER_R && (u.cornerT = (u.cornerT || 0) - 1) <= 0) {
    u.cornerT = 4;   // (a look every few steps)
    const q = u.path[u.pathIdx + 1];
    MOVER = u;
    try { reached = los(u.x, u.y, q.x, q.y, u.def.r * 0.8); } finally { MOVER = null; }
  }
  // Squeezing past friends: a unit that has got no nearer its next point for SQUEEZE_AFTER s (a crowd in a one-cell gap between woods,
  // two columns meeting head-on: the spacing push between friends is stronger than an infantryman's step, so it was shoved back, stepped
  // forward, shoved back again, for minutes) walks through its allies for SQUEEZE_FOR s (separate skips it), as OpenRA's infantry share cells.
  if (!reached) {
    const pr = u.prog;
    if (!pr || pr.i !== u.pathIdx || d < pr.d - 4) u.prog = { i: u.pathIdx, d, t: G.t };
    else if (G.t - pr.t > SQUEEZE_AFTER) {
      // A waiting unit (guard order) that cannot get into the crowd at its spot settles where it is instead.
      if (u.order.type === 'guard' && !u.defending && Math.hypot(u.dest.x - u.x, u.dest.y - u.y) < CELL * 4) { u.order.x = u.x; u.order.y = u.y; u.dest = null; u.prog = null; return true; }
      u.squeezeT = G.t + SQUEEZE_FOR; u.prog = { i: u.pathIdx, d, t: G.t };
    }
  }
  if (reached) {
    u.pathIdx++; u.prog = null;
    if (u.pathIdx >= u.path.length) {
      // Settled short of the exact point (beside a crowd): guard from here, not from the point.
      if (d > 3 && u.order.type === 'guard' && Math.hypot(u.order.x - p.x, u.order.y - p.y) < CELL) { u.order.x = u.x; u.order.y = u.y; }
      u.dest = null; return true;
    }
    return false;
  }
  if (u.def.setup && u.setup > 0) { u.setup = Math.max(0, u.setup - dt / u.def.pack); return false; }   // an MG Team packs its gun up (a V2 lowers its rocket) before it moves
  const want = Math.atan2(dy, dx);
  let speed = u.def.speed * VET.speed[u.rank || 0], mx, my;
  // Infantry in a loose wave, and vehicles, each keep their own pace (paceMul).
  if (u.paceMul && u.paceMul !== 1 && (u.order.type === 'hunt' || u.order.type === 'attack')) speed *= u.paceMul;
  if (u.cls === 'inf' && u.stance === 'prone') speed *= CRAWL_SPEED;   // under fire: crawling
  if (u.cls === 'veh') {
    const diff = angDiff(want, u.face);
    u.face = turnToward(u.face, want, u.def.turn * dt);
    if (Math.abs(diff) > 0.8) speed = 0; else speed *= Math.max(0.3, Math.cos(diff));
    mx = Math.cos(u.face); my = Math.sin(u.face);
  } else { u.face = want; mx = dx / d; my = dy / d; }
  speed *= slopeMul(u.x, u.y, mx, my);   // up a hill slower, down it faster
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
  u.tface = u.face; u.born = G.t;
  if (!d.harvester && !d.scripted && type !== 'pilot' && type !== 'technician') team.stats.units++;
  if (d.harvester) { u.load = 0; u.hs = 'seek'; u.hcell = -1; u.htimer = 0; }
  if (d.cls === 'air') { u.ammo = d.weapon ? d.weapon.ammo : 0; u.aam = d.weapon2 ? d.weapon2.ammo : 0; u.guns = d.gun ? d.gun.runs : 0; u.flares = d.flares || 0; u.alt = 0; u.as = 'takeoff'; u.rt = 0; u.passT = 0; u.speedCur = 0; }
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
  fillCraters(cx, cy, d.w, d.h);   // (craters under it filled: digCrater)
  if (d.exit) { b.exitCell = idx(cx + Math.floor(d.w / 2), cy + d.h); G.resv[b.exitCell] = 1; }
  if (G.tctx && !d.camo) bibDecal(G.tctx, cx * CELL, cy * CELL, d.w * CELL, d.h * CELL, b.id * 977, b.type);   // (a camouflaged structure leaves no pad to give it away)
  if (G.tctx && d.depot) padDecal(G.tctx, cellX(b.exitCell) * CELL, cellY(b.exitCell) * CELL);
  G.entities.push(b); G.byId.set(b.id, b);
  team.stats.built++;
  return b;
}

const teamOf = (e) => G.teams[e.team];
// The enemy side a side is fighting now: in a 1 v 1 the other one; in a team game the nearest enemy
// still in the fight (kept a while, so waves and raids keep going the same way).
function enemyOf(team) {
  const foes = G.teams.filter((t) => hostile(team.id, t.id));
  if (foes.length === 1) return foes[0];
  const chosen = chosenFoe(team);
  if (chosen) return chosen;
  let f = G.teams[team.foe];
  if (f && hostile(team.id, f.id) && G.t < (team.foeT || 0) && !f.out) return f;
  const live = foes.filter((t) => !t.out && inTheFight(t.id));
  const pool = live.length ? live : foes;
  const d = (t) => Math.hypot(t.start.cx - team.start.cx, t.start.cy - team.start.cy);
  f = pool.reduce((a, b) => (d(a) <= d(b) ? a : b));
  team.foe = f.id; team.foeT = G.t + 20;
  return f;
}
const enemyBuildingsOf = (tid) => G.entities.filter((e) => e.alive && e.kind === 'bld' && hostile(tid, e.team));
const enemyUnitsOf = (tid) => G.entities.filter((e) => e.alive && e.kind === 'unit' && hostile(tid, e.team));
const buildingsOf = (tid) => G.entities.filter((e) => e.alive && e.kind === 'bld' && e.team === tid);
const unitsOf = (tid) => G.entities.filter((e) => e.alive && e.kind === 'unit' && e.team === tid);
const isAirborne = (e) => e.cls === 'air' && e.as !== 'landed';

function distTo(a, e) {
  let d;
  if (e.kind === 'bld' || e.kind === 'span' || e.kind === 'house') {
    const x0 = e.cx * CELL, y0 = e.cy * CELL;
    const dx = Math.max(x0 - a.x, 0, a.x - (x0 + e.w * CELL)), dy = Math.max(y0 - a.y, 0, a.y - (y0 + e.h * CELL));
    d = Math.hypot(dx, dy);
  } else d = Math.max(0, Math.hypot(a.x - e.x, a.y - e.y) - (e.def.r || 0) * 0.5);
  // High ground: from above, as if nearer (a gun reaches further down a hill); from below, as if further.
  if (G.hgt && a.kind && (a.kind === 'unit' || a.kind === 'bld') && (e.kind === 'unit' || e.kind === 'bld')) {
    const ha = standH(a), he = standH(e);
    if (ha !== null && he !== null) { const r = Math.max(-1, Math.min(1, (ha - he) / HG_MAX)); d /= r > 0 ? 1 + HG_DOWN * r : 1 + HG_UP * r; }
  }
  return d;
}

const isTank = (t) => t.kind === 'unit' && t.def.draw === 'tank';
// What the Comanche's missiles are for (and its gun leaves to them while it has any): tanks and Ore Trucks.
const missileMark = (t) => isTank(t) || (t.kind === 'unit' && !!t.def.harvester);
function canHit(w, t) {
  if (!w) return false;
  if (t.kind === 'unit' && isAirborne(t)) return !!w.air && !(w.heliOnly && t.def.fly === 'jet');   // heliOnly weapons cannot reach jets
  if (w.tanksOnly && !missileMark(t)) return false;    // the Comanche's missiles: tanks and Ore Trucks
  if (w.spareTanks && missileMark(t)) return false;    // its chain gun leaves those to the missiles (airWeapons lifts this once they are spent)
  return w.ground !== false;
}
// Cliffs block direct fire (owner, 2026-11-21: "tanks/soldiers are shooting through cliffs"; both modes). A line from the
// shooter to the target (a structure: its nearest edge) that crosses a ridge cell of G.cliff is blocked; lone boulders
// (a cliff cell with under 2 cliff neighbours) are not. Lobbed rounds (artillery, V2 rockets, grenades) go over, and
// nothing to or from the air is blocked. acquire skips blocked targets; engage walks round to a clear shot.
const LOBBED = { artyshell: 1, v2: 1, grenade: 1 };
// Spotting (owner, 2026-11-22, both modes): Artillery and V2s (lobbed rounds reaching past their own sight) pick targets
// anywhere in reach that their side or a teammate has in sight right now (liveSight), not only within their own sight.
const spotter = (u) => !!(u.def.weapon && LOBBED[u.def.weapon.proj] && u.def.weapon.range > u.def.sight * CELL);
// What an alliance sees this moment (sight circles of its units and structures, further from a hilltop, as revealAround),
// worked out at most once a step per alliance; kept off G (not saved).
let liveSightOf = { G: null, t: -1, m: {} };
function liveSight(side) {
  const ally = G.teams[side] ? G.teams[side].ally : side;
  if (liveSightOf.G !== G || liveSightOf.t !== G.t) liveSightOf = { G, t: G.t, m: {} };
  let s = liveSightOf.m[ally];
  if (s) return s;
  s = liveSightOf.m[ally] = new Uint8Array(NCELLS);
  for (const e of G.entities) {
    if (!e.alive || !e.def || e.def.scripted || e.inHouse || !alliedSides(e.team, side)) continue;
    let rad = e.kind === 'bld' ? (e.def.sight || 3) + Math.max(e.w, e.h) / 2 : e.def.sight;
    if (!rad) continue;
    const sh = G.hgt ? standH(e) : null;
    if (sh) rad += HG_SIGHT * sh / HG_MAX;
    revealCircle(e.x / CELL, e.y / CELL, rad, s);
  }
  return s;
}
const spottedBy = (side) => { const s = liveSight(side); return (e) => !!s[cellOfPos(e.x, e.y)]; };
let ridgeOf = null, ridge = null;
function ridgeCells() {
  if (ridgeOf === G.cliff) return ridge;
  ridgeOf = G.cliff; ridge = new Uint8Array(NCELLS);
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
    if (!G.cliff[y * MAP + x]) continue;
    let n = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if ((i || j) && inMap(x + i, y + j) && G.cliff[(y + j) * MAP + x + i]) n++;
    if (n >= 2) ridge[y * MAP + x] = 1;
  }
  return ridge;
}
function clearShot(a, t, w) {
  if (G.smokes && G.smokes.length && !(w && LOBBED[w.proj]) && smokeBlocks(a, t)) return false;   // a Specialist's smoke screen
  if (!G.cliff || (w && LOBBED[w.proj])) return true;
  if ((a.kind === 'unit' && isAirborne(a)) || (t.kind === 'unit' && isAirborne(t))) return true;
  let tx = t.x, ty = t.y;
  if (t.kind === 'bld' || t.kind === 'span' || t.kind === 'house') {
    tx = Math.max(t.cx * CELL + 1, Math.min((t.cx + t.w) * CELL - 1, a.x)); ty = Math.max(t.cy * CELL + 1, Math.min((t.cy + t.h) * CELL - 1, a.y));
  }
  const R = ridgeCells(), dx = tx - a.x, dy = ty - a.y, n = Math.ceil(Math.hypot(dx, dy) / (CELL / 3));
  for (let i = 1; i < n; i++) {
    const cx = Math.floor((a.x + dx * i / n) / CELL), cy = Math.floor((a.y + dy * i / n) / CELL);
    if (inMap(cx, cy) && R[cy * MAP + cx]) return false;
  }
  return true;
}
function canTarget(u, t) { return canHit(u.def.weapon, t) || canHit(u.def.weapon2, t); }

// Who is where, in buckets of GRID_CELLS cells, rebuilt at the start of every step (update): target
// searches look only at the buckets within reach instead of at every entity on the map. Not saved or
// sent (save.js and net.js leave G.grid out); without one (between steps), searches look at everything.
const GRID_CELLS = 8, GRID_PX = GRID_CELLS * CELL;
let GRID_N = Math.ceil(MAP / GRID_CELLS);
function buildGrid() {
  const g = G.grid && G.grid.length === GRID_N * GRID_N ? G.grid : (G.grid = Array.from({ length: GRID_N * GRID_N }, () => []));
  for (const b of g) b.length = 0;
  const at = (v) => Math.max(0, Math.min(GRID_N - 1, Math.floor(v / GRID_PX)));
  for (const e of G.entities) if (e.alive) g[at(e.y) * GRID_N + at(e.x)].push(e);
  // Who is already firing at whom, and the damage of their next shots (see pledge).
  atkOn.clear();
  for (const e of G.entities) if (e.alive && e.kind === 'unit' && e.target && e.target.alive) pledge(e, e.target);
}
// Spreading the fire: units count who is already after each enemy (atkOn: n attackers, dmg their next shots
// together). acquire and base defence pass over an enemy whose attackers' next shots already kill it, and
// approachSpot fans the attackers out round it by their number. Rebuilt every step (not saved).
const atkOn = new Map();
function pledge(e, t) {
  let a = atkOn.get(t);
  if (!a) { a = { n: 0, dmg: 0 }; atkOn.set(t, a); }
  a.n++;
  const w = canHit(e.def.weapon, t) ? e.def.weapon : null;
  if (w) a.dmg += w.dmg * (w.burst || 1) * ((WARHEADS[w.wh] || {})[armorOf(t)] || 0);
}
const overkill = (t) => { const a = atkOn.get(t); return !!a && t.kind === 'unit' && a.dmg >= t.hp * 1.2; };
const OVERKILL = CELL * 3;   // how much further off a target no one is killing yet may be and still come first
// The buckets within r of (x, y), as a list of arrays to loop through.
const nearOut = [];
function nearBuckets(x, y, r) {
  const g = G.grid;
  nearOut.length = 0;
  if (!g) { nearOut.push(G.entities); return nearOut; }
  const at = (v) => Math.max(0, Math.min(GRID_N - 1, Math.floor(v / GRID_PX)));
  const x0 = at(x - r), x1 = at(x + r), y0 = at(y - r), y1 = at(y + r);
  for (let by = y0; by <= y1; by++) for (let bx = x0; bx <= x1; bx++) { const b = g[by * GRID_N + bx]; if (b.length) nearOut.push(b); }
  return nearOut;
}
// Helicopters favour what their weapon is made for: the Hind's chain gun goes for infantry, the
// Hellfires for tanks and vehicles. A favoured target is one the warhead hits at least 80% as hard as
// its best kind of ground unit; anything else is only picked when nothing favoured is in sight.
const armorOf = (e) => e.kind === 'bld' || e.kind === 'span' || e.kind === 'house' ? 'bld' : isAirborne(e) ? 'air' : e.def.armor === 'air' ? 'light' : e.def.armor;
function favoured(w, e) {
  const t = WARHEADS[w.wh];
  return isAirborne(e) || t[armorOf(e)] >= 0.8 * Math.max(t.inf, t.light, t.heavy);
}
function acquire(src, range, weapons, visible, favour) {
  let best = null, bs = Infinity;
  const buckets = nearBuckets(src.x, src.y, range + CELL * 3);
  for (let bi = 0; bi < buckets.length; bi++) for (const e of buckets[bi]) {
    if (!e.alive || !hostile(e.team, src.team) || e.sellT > 0) continue;
    if (Math.abs(e.x - src.x) > range + CELL * 3 || Math.abs(e.y - src.y) > range + CELL * 3) continue;   // far off: no need to measure (structures are at most 4 cells across)
    if (!weapons.some((w) => canHit(w, e))) continue;
    if (e.kind === 'bld' && camoHidden(e, src.team)) continue;
    if (e.kind === 'bld' && src.def && src.def.demo && (e.c4T || src.clearT > G.t)) continue;   // a Specialist leaves a structure already set to blow, and gets clear of his own
    if (visible && !visible(e)) continue;
    const d = distTo(src, e);
    if (d > range) continue;
    if (!weapons.some((w) => w && canHit(w, e) && clearShot(src, e, w))) continue;   // behind a cliff
    let score = d;
    if (e.kind === 'bld') score += e.def.weapon ? 15 : 60;   // defences before harmless structures
    else if (!e.def.weapon && !e.def.harvester) score += 20;
    if (e.cls === 'inf' && weapons.every((w) => w.prefersArmor)) score += CELL * 4;   // tank killers look for vehicles first
    if (favour && !weapons.some((w) => favoured(w, e))) score += range + CELL * 4;   // behind every favoured target in reach
    if (e !== src.target && overkill(e)) score += OVERKILL;   // already as good as dead: shoot something else
    if (score < bs) { bs = score; best = e; }
  }
  return best;
}

// Where attacking units head: the enemy Construction Yard, or failing that the nearest structure.
// Each side only knows the enemy buildings on ground it has uncovered, in its own G.fog. Units sent to attack go after those alone, so attacking never finds
// the enemy base: it has to be scouted first (the computer's scouting: see aiScout).
function knownTo(tid, b) {
  const grid = G.fog[tid];
  for (let y = b.cy; y < b.cy + b.h; y++) for (let x = b.cx; x < b.cx + b.w; x++) if (inMap(x, y) && grid[idx(x, y)]) return true;
  return false;
}
// Camouflage (the Pillbox): hidden from the other side until an enemy ground unit comes within
// CAMO_DETECT, or until it fires or is hit, and for CAMO_REVEAL seconds after. A hidden structure
// cannot be seen, picked, targeted or aimed at by either side's units, and the host never tells an
// online guest it exists (net.js `shown`). `exposed` is the flag the guest's copy reads.
const CAMO_DETECT = CELL * 3, CAMO_REVEAL = 4;
const camoHidden = (b, viewer) => b.kind === 'bld' && !!b.def.camo && !alliedSides(b.team, viewer) && !b.exposed;
const targetable = (team, b) => knownTo(team, b) && !camoHidden(b, team);
// The win rule: production buildings keep a side in the fight, and so does a Mobile Construction Yard
// still driving. Once a side has no production building left, the enemy knows where its Mobile
// Construction Yards are (lastStand), so a hidden one cannot drag the battle out.
const PRODUCTION = ['cy', 'barracks', 'factory', 'helipad', 'airfield'];
const hasProduction = (tid) => G.entities.some((e) => e.alive && e.kind === 'bld' && e.team === tid && PRODUCTION.includes(e.type));
const mcvsOf = (tid) => G.entities.filter((e) => e.alive && e.kind === 'unit' && e.team === tid && e.def.deploys === 'cy');
const inTheFight = (tid) => hasProduction(tid) || mcvsOf(tid).length > 0;
function lastStand(u) {
  let best = null, bd = Infinity;
  for (const foe of foesOf(u.team)) {
    if (hasProduction(foe)) continue;
    for (const m of mcvsOf(foe)) { const d = dist(u, m); if (d < bd) { bd = d; best = m; } }
  }
  return best;
}
// side: only that enemy side (the Auto Attack picker asks it of each one).
function enemyBaseKnown(tid = G.me, side = null) {
  return foesOf(tid).some((f) => (side == null || f === side) && (buildingsOf(f).some((b) => targetable(tid, b)) || (!hasProduction(f) && mcvsOf(f).length > 0)));
}
// The enemy side a side has picked to attack (team.focusSide: the Auto Attack picker, or the
// computer's own choice in aiPickFoe), while it is still in the fight and its base is known.
// Null: no choice, so attackers go for whatever enemy base is nearest (and enemyOf picks the nearest side).
function chosenFoe(team) {
  const f = team.focusSide == null ? null : G.teams[team.focusSide];
  return f && hostile(team.id, f.id) && !f.out && inTheFight(f.id) && enemyBaseKnown(team.id, f.id) ? f : null;
}

// The computer's attackers: one passing within 10 cells of a known enemy Outpost, or of a refinery
// well away from every enemy Construction Yard, turns aside to destroy it (and what stands beside
// it), then goes back to the target it was sent for (u.resume). Checked every second or so while it
// has nothing to shoot at.
function detourToSite(u) {
  if (u.resume || u.raider || (u.detourT = (u.detourT || 0) - 1) > 0) return;
  u.detourT = 3;
  const theirs = enemyBuildingsOf(u.team), yards = theirs.filter((b) => b.type === 'cy');
  let best = null, bd = CELL * 10;
  for (const b of theirs) {
    if (b === u.focus || !targetable(u.team, b)) continue;
    if (b.type !== 'outpost' && !(b.type === 'refinery' && yards.every((y) => dist(b, y) > CELL * 14))) continue;
    const d = dist(u, b);
    if (d < bd) { bd = d; best = b; }
  }
  if (!best) return;
  u.resume = u.focus && u.focus.alive ? u.focus : null;
  if (!u.resume) u.resume = true;   // (no particular target: just carry on afterwards)
  u.focus = best; u.huntTarget = null;
}
function nearestEnemyBuilding(u) {
  // Raiding an outlying site: stay on it, finish off what else stands there, then move on.
  if (u.focus) {
    if (u.focus.alive) return u.focus;
    const f = u.focus;
    let nb = null, nd = CELL * 9;
    for (const e of G.entities) {
      if (!e.alive || e.kind !== 'bld' || !hostile(e.team, u.team) || !targetable(u.team, e)) continue;
      const d = Math.hypot(e.x - f.x, e.y - f.y);
      if (d < nd) { nd = d; nb = e; }
    }
    u.focus = nb;
    if (nb) return nb;
  }
  // A detour is over: back to what it was sent for.
  if (u.resume) { const r = u.resume; u.resume = null; if (r !== true && r.alive) { u.focus = r; return r; } }
  // Aircraft on the attack steer round anti-air the side has found (see airPick).
  if (u.cls === 'air') { const aa = knownAA(u.team, u.def.fly === 'jet'); if (aa.length) { const b = airPick(u, aa); if (b) return b; } }
  let best = null, bd = Infinity, cy = null, cd = Infinity;
  const only = chosenFoe(G.teams[u.team]);   // a picked enemy side: its base alone (others are still fought on the way)
  for (const e of G.entities) {
    if (!e.alive || e.kind !== 'bld' || !hostile(e.team, u.team) || !targetable(u.team, e)) continue;
    if (only && e.team !== only.id) continue;
    const d = dist(u, e);
    if (d < bd) { bd = d; best = e; }
    if (e.type === 'cy' && d < cd) { cd = d; cy = e; }
  }
  if (u.raider) return u.huntTarget && u.huntTarget.alive ? u.huntTarget : best || lastStand(u);
  return cy || best || lastStand(u);
}

// Anti-air a side knows about: SAM Sites and AA Guns on ground it has uncovered (finished ones), and anti-air
// soldiers and vehicles on that ground. Anti-air it has not found yet is not counted, so it can still catch
// aircraft out. Each entry is where it is and how far it reaches (plus a margin). `jet`: Rangers' guns
// (heliOnly) cannot touch jets. Worked out once a second per side.
const AA_CACHE = {};
function knownAA(tid, jet) {
  const key = tid * 2 + (jet ? 1 : 0), c = AA_CACHE[key];
  if (c && G.t >= c.t && G.t - c.t < 1) return c.list;
  const list = [], seen = inViewOf(tid);
  const add = (e, w) => { if (w && w.air && !(jet && w.heliOnly)) list.push({ x: e.x, y: e.y, r: (w.range || 150) + CELL * 2 }); };
  for (const e of G.entities) {
    if (!e.alive || !hostile(tid, e.team)) continue;
    if (e.kind === 'bld') { if (e.def.antiAir && (e.buildT === undefined || e.buildT >= 1) && targetable(tid, e)) add(e, e.def.weapon); }
    else if (e.cls !== 'air' && !e.def.scripted && seen(e)) { add(e, e.def.weapon); add(e, e.def.weapon2); }
  }
  AA_CACHE[key] = { t: G.t, list };
  return list;
}
const aaCover = (aa, t) => { let n = 0; for (const a of aa) if (Math.hypot(a.x - t.x, a.y - t.y) < a.r) n++; return n; };
// An aircraft sent to attack goes for a known building no detected anti-air covers: the Construction Yard
// first if it is open, else the nearest. If every one is covered it goes for the least covered (Construction
// Yard first, then the nearest) so it still attacks. u.aaClear says whether it found an open target: if so
// it also ignores covered targets met on the way (airTarget). Re-chosen once a second.
function airPick(u, aa) {
  if (u.aaPick && u.aaPick.alive && G.t - u.aaPickT < 1) return u.aaPick;
  let best = null, bs = Infinity, bc = 0;
  const only = chosenFoe(G.teams[u.team]);   // a picked enemy side (Auto Attack picker, aiPickFoe): its buildings alone
  for (const e of G.entities) {
    if (!e.alive || e.kind !== 'bld' || !hostile(e.team, u.team) || !targetable(u.team, e)) continue;
    if (only && e.team !== only.id) continue;
    const c = aaCover(aa, e), sc = c * 1e5 + dist(u, e) - (e.type === 'cy' ? CELL * 60 : 0);
    if (sc < bs) { bs = sc; best = e; bc = c; }
  }
  u.aaPick = best; u.aaPickT = G.t; u.aaClear = !!best && bc === 0;
  return best;
}

// New units spread out to random open spots around their base. Auto attack sends them out
// together once this many are waiting, each heading for the enemy at its own top speed.
const GROUP_SIZE = 10;
// A random open spot inside the build area: beside one of the side's buildings, off ore, roads
// out of factories and refinery docks, picked from a few tries as the one with the fewest units.
// near: a building or unit; only buildings of that base (within BASE_REACH of it) are used, so
// units made at an Outpost wait there rather than walking back to the main base.
const BASE_REACH = 14 * CELL;
function scatterSpot(team, near) {
  let mine = buildingsOf(team.id).filter((b) => !b.def.defense);
  if (near) { const local = mine.filter((b) => Math.hypot(b.x - near.x, b.y - near.y) < BASE_REACH); if (local.length) mine = local; }
  if (!mine.length) return rallyPoint(team);
  let best = null, bn = Infinity;
  for (let k = 0; k < 14; k++) {
    const b = mine[Math.floor(Math.random() * mine.length)], a = Math.random() * Math.PI * 2;
    const reach = (Math.max(b.w, b.h) / 2 + 1 + Math.random() * 4) * CELL;
    const x = b.x + Math.cos(a) * reach, y = b.y + Math.sin(a) * reach, c = cellOfPos(x, y);
    if (!inMap(cellX(c), cellY(c)) || !freeCell(c) || G.ore[c] || G.resv[c]) continue;
    if (!roomyCell(c)) continue;   // never in a gap between woods or buildings: a crowd waiting there blocks the way through
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
// Spots for a crowd sent to one point (defenders going back to the rally point, a squad pulling back, a wave gathering):
// each unit gets its own open cell round (x, y), nearest first, found by a flood over open ground (so it is reachable from
// the point), skipping cells a friend stands still on or waits for. Vehicles take a cell with its neighbours. Before, all of
// them were sent to the same spot: they walked into a pile there, and units pushed out walked back in (owner's report:
// 15-20 units of a computer side heaped on its rally point for minutes, headless Frostlight 3 v 3 the same).
// spotDealer(team) returns deal(u, x, y) -> { x, y }; one dealer per batch, so the batch's units do not share cells.
const DEAL_R = 12;
function spotDealer(team) {
  const used = new Set();
  for (const e of unitsOf(team.id)) {
    if (e.cls === 'air') continue;
    if (!e.dest && !e.needPath) used.add(cellOfPos(e.x, e.y));
    if (e.order.type === 'guard' && e.order.x !== undefined) used.add(cellOfPos(e.order.x, e.order.y));
  }
  return (u, x, y) => {
    used.delete(cellOfPos(u.x, u.y));
    if (u.order.type === 'guard' && u.order.x !== undefined) used.delete(cellOfPos(u.order.x, u.order.y));
    const start = nearestFreeCell(cellOfPos(x, y), 6);
    if (start < 0) return { x, y };
    const big = u.def.r > 8, sx = cellX(start), sy = cellY(start);
    const seen = new Set([start]), q = [start];
    let fallback = -1;
    for (let i = 0; i < q.length; i++) {
      const c = q[i], cx = cellX(c), cy = cellY(c);
      const ok = !used.has(c) && !G.resv[c] && (!big || [[-1, 0], [1, 0], [0, -1], [0, 1]].every(([dx, dy]) => !used.has(idx(cx + dx, cy + dy))));
      if (ok) {
        if (!G.ore[c]) { fallback = c; break; }
        if (fallback < 0) fallback = c;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!inMap(nx, ny) || Math.abs(nx - sx) > DEAL_R || Math.abs(ny - sy) > DEAL_R) continue;
        const n = idx(nx, ny);
        if (!seen.has(n) && freeCell(n)) { seen.add(n); q.push(n); }
      }
    }
    if (fallback < 0) return { x, y };
    used.add(fallback);
    if (big) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) used.add(idx(cellX(fallback) + dx, cellY(fallback) + dy));
    return cellCenter(fallback);
  };
}
// A friend (no route of its own) stands on (x, y), closer than units keep apart.
function spotTaken(u, x, y) {
  for (const b of nearBuckets(x, y, CELL)) for (const e of b) {
    if (e === u || !e.alive || e.kind !== 'unit' || e.cls === 'air' || e.dest || !alliedSides(e.team, u.team)) continue;
    if (Math.hypot(e.x - x, e.y - y) < (e.def.r + u.def.r) * 1.4) return true;
  }
  return false;
}
// Open ground round a cell: its 3 x 3 is free and it is not in a gap under 4 cells wide (woods, rock, water or buildings 2 cells off on
// both sides, straight or across), so units waiting there leave the way through open.
function roomyCell(c) {
  const cx = cellX(c), cy = cellY(c), shut = (x, y) => !inMap(x, y) || !freeCell(idx(x, y));
  for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) if (shut(x, y)) return false;
  for (const [dx, dy] of [[2, 0], [0, 2], [2, 2], [2, -2]]) if (shut(cx + dx, cy + dy) && shut(cx - dx, cy - dy)) return false;
  return true;
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
    u.cls !== 'air' && u.order.type === 'guard' && !u.order.hold && !u.assisting && !u.manual);
  for (const u of idle) { setHunt(u); u.staged = false; }
  if (idle.length) logWave(team.id, idle.length >= 15);
  return idle.length;
}

// ---------------------------------------------------------------------------
// Helping an ally (team games). The Ally button (`setAssist`) sends every idle ground unit to stand
// guard around an ally's base, and new units follow while it is on; when the ally's base is attacked,
// those garrison units go for the raiders (`defendAllies`). A computer ally does the same without
// being asked, on every difficulty but Easy: its idle units near its own base answer an allied
// base's call, only as many as it takes. Aircraft stay out of it. Runs once a second.
// ---------------------------------------------------------------------------
const alliesOf = (team) => G.teams.filter((o) => o !== team && o.ally === team.ally && !o.out && buildingsOf(o.id).length);
const idleGround = (team) => unitsOf(team.id).filter((u) => u.def.weapon && !u.def.harvester && !u.def.scripted && !u.chute && !u.defending && !u.assisting && !u.homeward && !u.manual &&
  u.cls !== 'air' && u.order.type === 'guard' && !u.order.hold);
// The ally a human's Ally button defends: the one picked (`team.assistSide`) while it is still in the fight, else the first.
function assistAlly(team) {
  const all = alliesOf(team);
  return all.find((o) => o.id === team.assistSide) || all[0] || null;
}
function sendToAlly(team, units) {
  const ally = assistAlly(team);
  if (!ally) return 0;
  for (const u of units) { const s = scatterSpot(ally); setGuard(u, s.x, s.y); u.staged = false; u.garrison = true; goTo(u, s.x, s.y); }
  return units.length;
}
function setAssist(team, on, side) {
  on = !!on && alliesOf(team).length > 0;
  team.assist = on;
  if (!on) return;   // off: the units already sent keep defending, new ones stay home (recallAlly brings them back)
  team.auto = false;
  const was = assistAlly(team);
  if (Number.isInteger(side) && alliesOf(team).some((o) => o.id === side)) team.assistSide = side;
  const now = assistAlly(team);
  sendToAlly(team, idleGround(team).filter((u) => !u.garrison));
  // Switched to another ally: the units already garrisoned (and not out fighting) move over to it.
  if (was && now && was !== now) sendToAlly(team, unitsOf(team.id).filter((u) => u.garrison && !u.assisting && u.order.type === 'guard' && !u.order.hold));
}
// Giving credits to an ally (team games, the GIVE button). Only to another side of the same alliance
// that is still in the fight; the amount is cut down to what the sender has. `toSide` is a side
// number, not a team (netcore.js turns a team in a remote order into the sender's own). Returns the
// amount that moved. The computer never gives or asks.
const GIVE_AMOUNTS = [500, 1000, 2500];
const allyLabel = (team) => team.name || (team.isAI ? 'your computer ally' : 'your ally');
function sendCredits(team, toSide, amount) {
  const to = Number.isInteger(toSide) ? G.teams[toSide] : null;
  amount = Math.floor(+amount);
  if (!team || !team.stats || !to || to === team || to.ally !== team.ally || team.out || to.out || !(amount > 0)) return 0;
  amount = Math.min(amount, Math.floor(team.credits));
  if (!(amount > 0)) return 0;
  team.credits -= amount; to.credits += amount;
  team.stats.given = (team.stats.given || 0) + amount;
  to.stats.received = (to.stats.received || 0) + amount;
  say(team.id, `Sent ${amount} credits to ${allyLabel(to)}`);
  say(to.id, `Received ${amount} credits from ${allyLabel(team)}`);
  return amount;
}
// The Return button: everything sent to an ally, every ground unit out attacking (hunt or attack
// orders) and every aircraft out attacking goes home and waits there again. Auto attack and Ally support are turned off so they stay.
function recallAlly(team, garrisonOnly) {
  team.assist = false; if (!garrisonOnly) team.auto = false;
  for (const u of unitsOf(team.id)) {
    // Aircraft out attacking (or waiting away from their pad) fly home and stay on their pad.
    if (!garrisonOnly && u.cls === 'air' && !u.def.scripted && !u.leaving && !u.defending && !u.scrambled &&
      (u.order.type === 'hunt' || u.order.type === 'attack' || (u.order.type === 'guard' && !u.order.pad && !u.order.hold))) {
      u.target = null; u.focus = null; u.huntTarget = null; u.oneStrike = false; u.manual = false;
      setGuard(u); u.order.pad = true; u.staged = false;
      continue;
    }
    const attacking = !garrisonOnly && u.cls !== 'air' && u.def.weapon && !u.def.harvester && !u.def.scripted && !u.chute && !u.homeward &&
      (u.order.type === 'hunt' || u.order.type === 'attack');
    if (!u.garrison && !attacking) continue;
    u.garrison = false;
    if (!attacking && (u.order.type !== 'guard' || u.order.hold)) continue;
    const s = scatterSpot(team);
    setGuard(u, s.x, s.y); u.staged = true; u.assisting = false; u.defending = false; u.focus = null; u.huntTarget = null; goTo(u, s.x, s.y);
  }
}
const AI_ALLY_REACH = 35;   // cells: a computer ally sends only idle units this close to the raiders (was 70)
const AI_ALLY_DELAY = 10;   // seconds an ally's base must be under attack before another computer comes to help
function defendAllies(team) {
  if (!teamGame()) return;
  if (!alliesOf(team).length && unitsOf(team.id).some((u) => u.garrison)) recallAlly(team, true);   // nobody left to help
  const helping = team.isAI ? G.diff.ai.adapt : unitsOf(team.id).some((u) => u.garrison);
  if (!helping && !unitsOf(team.id).some((u) => u.assisting)) return;
  // A human defends the ally they picked; the computer answers any ally's call.
  const allies = team.isAI ? alliesOf(team) : [assistAlly(team)].filter(Boolean);
  if (!allies.length) return;
  const allyBlds = new Map(allies.map((a) => [a, buildingsOf(a.id)]));   // once, not per enemy unit
  // Each ally's buildings' box, 14 cells wider: an enemy outside it is near none of them (the exact test below
  // was 330,000 distance checks a second in a 3 v 3, a tenth of the whole game's time).
  const R = CELL * 14, R2 = CELL * 22, box = new Map(allies.map((a) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of allyBlds.get(a)) { x0 = Math.min(x0, b.cx * CELL); y0 = Math.min(y0, b.cy * CELL); x1 = Math.max(x1, (b.cx + b.w) * CELL); y1 = Math.max(y1, (b.cy + b.h) * CELL); }
    return [a, [x0 - R2, y0 - R2, x1 + R2, y1 + R2]];
  }));
  const inBox = (a, u) => { const q = box.get(a); return u.x >= q[0] && u.x <= q[2] && u.y >= q[1] && u.y <= q[3]; };
  // Raiders at the base, or enemy units (a little further out) shooting at that ally's units just outside it.
  const onUnits = (a, u) => u.target && u.target.alive && u.target.kind === 'unit' && G.teams[u.target.team] && G.teams[u.target.team].ally === a.ally;
  const hit = (a, u) => (inBox(a, u) && allyBlds.get(a).some((b) => { const d = distTo(u, b); return d < R || (d < R2 && onUnits(a, u)); })) ||
    (a.baseHit && a.baseHit.until > G.t && Math.hypot(u.x - a.baseHit.x, u.y - a.baseHit.y) < CELL * 8);
  const threats = helping ? enemyUnitsOf(team.id).filter((u) => !isAirborne(u) && !u.def.harvester && !u.def.scripted && !u.chute && allies.some((a) => hit(a, u))) : [];
  if (!threats.length) {
    if (++team.allyCalm < DEFEND_CALM) return;
    team.allyT = undefined;
    const deal = spotDealer(team);
    for (const u of unitsOf(team.id)) {
      if (!u.assisting || (u.target && u.target.alive)) continue;
      u.assisting = false;
      if (u.garrison && allies.length) { const s = scatterSpot(allies[0]); setGuard(u, s.x, s.y); goTo(u, s.x, s.y); }
      else if (u.post) { const p = deal(u, u.post.x, u.post.y); setGuard(u, p.x, p.y); u.staged = u.post.staged; goTo(u, p.x, p.y); }
    }
    return;
  }
  team.allyCalm = 0;
  // A computer ally only answers once the base has been under attack for AI_ALLY_DELAY s, so a quick strike gets a window.
  if (team.isAI) {
    if (team.allyT === undefined) team.allyT = G.t;
    if (G.t - team.allyT < (aiOf(team).allyDelay || AI_ALLY_DELAY) && !unitsOf(team.id).some((u) => u.assisting)) return;
  }
  const nearC = new Map();   // each unit's distance to the nearest threat, worked out once (it is used in sorts)
  const near = (u) => { let d = nearC.get(u); if (d === undefined) { d = Infinity; for (const t of threats) d = Math.min(d, Math.hypot(u.x - t.x, u.y - t.y)); nearC.set(u, d); } return d; };
  let army = unitsOf(team.id).filter((u) => u.assisting).concat(idleGround(team).filter((u) => (team.isAI ? near(u) < CELL * (aiOf(team).allyReach || AI_ALLY_REACH) : u.garrison)))
    .filter((u) => threats.some((t) => canTarget(u, t)));
  army.sort((a, b) => (!!b.assisting - !!a.assisting) || near(a) - near(b));
  // A human's garrison units all go; the computer sends worth half again what the raiders are.
  const need = threats.reduce((a, t) => a + (t.def.cost || 300), 0) * (team.isAI && aiOf(team).allyNeed || 1.5);   // (a turtle sends more: AI_STYLES allyNeed)
  let got = 0;
  for (const u of army) {
    if (team.isAI && !u.assisting && got >= need) continue;
    got += u.def.cost || 300;
    let best = null, bd = Infinity;
    for (const t of threats) { const d = Math.hypot(u.x - t.x, u.y - t.y); if (d < bd && canTarget(u, t)) { bd = d; best = t; } }
    if (!best) continue;
    if (!u.assisting) { const g = u.order.type === 'guard'; u.post = { x: g ? u.order.x : u.x, y: g ? u.order.y : u.y, staged: !!u.staged }; }
    u.assisting = true; u.staged = false;
    if (u.target === best || (u.target && u.target.alive && threats.includes(u.target))) continue;
    setGuard(u, best.x, best.y); u.target = best; goTo(u, best.x, best.y, false, true);
  }
}
function launchGroups(only) {
  for (const team of only ? [only] : G.teams) {
    releaseIdle(team);
    defendBase(team);
    defendAllies(team);
    // New units follow the others to an ally's base while the Ally button is on.
    if (team.assist) sendToAlly(team, idleGround(team).filter((u) => !u.garrison && u.staged && inBase(team, u) && !u.dest));
    const rally = rallyPoint(team);
    const waiting = G.entities.filter((u) => u.alive && u.kind === 'unit' && u.team === team.id && u.staged && !u.defending && !u.assisting && !u.manual && !u.def.harvester && (u.def.weapon || (u.cls === 'air' && !u.def.lift)) && u.order.type === 'guard');
    // The player's aircraft do not wait for a group: each one heads out on its own.
    // (A jet that came home early waits on its pad until it is fully rearmed.)
    // The computer sends helicopters together and jets together: two or more at once, and a lone
    // one only after waiting AIR_GROUP_WAIT seconds for company.
    if (team.auto && enemyBaseKnown(team.id)) {
      const flyers = waiting.filter((u) => u.cls === 'air' && !u.interceptor), ok = (u) => u.as !== 'landed' || airFull(u);
      if (!team.isAI) for (const u of flyers) { if (ok(u)) { launchAircraft(u); if (oneWave(u)) u.oneStrike = true; } }
      else for (const kind of ['heli', 'jet']) {
        const mine = flyers.filter((u) => u.def.fly === kind), ready = mine.filter(ok);
        for (const u of mine) if (!ok(u)) u.airReadyT = undefined;
        for (const u of ready) if (u.airReadyT === undefined) u.airReadyT = G.t;
        if (ready.length < 2 && !ready.some((u) => G.t - u.airReadyT >= AIR_GROUP_WAIT)) continue;
        // Air attacks are spaced out: none before the first ground attack is due, then AIR_STRIKE_GAP between
        // strikes of each kind (they went out again as soon as two were rearmed: a constant threat).
        const airNext = team.airNext || (team.airNext = {});
        if (G.t < aiOf(team).firstWave || G.t < (airNext[kind] || 0)) continue;
        airNext[kind] = G.t + AIR_STRIKE_GAP * (aiOf(team).airGap || 1);
        const exp = expansionsOf(enemyOf(team), ready[0]), focus = exp.length && Math.random() < 1 / 3 ? exp[0] : null;
        for (const u of ready) { launchAircraft(u, focus); u.airReadyT = undefined; }
      }
    }
    scramble(team);
    const ready = waiting.filter((u) => u.cls !== 'air' && !u.dest && inBase(team, u));
    team.waiting = ready.length;
    // The computer plans its own waves (sizes, formations, routes, targets): see aiLaunch.
    if (team.isAI && team.auto) { aiLaunch(team, ready); continue; }
    if (!team.auto || ready.length < GROUP_SIZE || !enemyBaseKnown(team.id)) continue;   // nowhere known to go: wait
    // Each heads straight out from where it waits, at its own top speed, fighting what it meets.
    for (const u of ready) { setHunt(u); u.staged = false; }
    logWave(team.id, false);
    // Most waves go for the main base; one in three raids an outlying Outpost or refinery.
    team.waves = (team.waves || 0) + 1;
    const exp = expansionsOf(enemyOf(team), rally);
    const raid = exp.length && team.waves % 3 === 0 ? exp[0] : null;
    if (raid) for (const u of ready) u.focus = raid;
    team.waiting = 0;
    say(team.id, 'Attack group moving out');
  }
}

// A side's outlying sites: Outposts and refineries well away from its Construction Yard, nearest
// to `from` first, Outposts before refineries.
function expansionsOf(team, from) {
  const cy = G.entities.find((e) => e.alive && e.team === team.id && e.type === 'cy');
  if (!cy) return [];
  return buildingsOf(team.id).filter((b) => (b.type === 'outpost' || b.type === 'refinery') && dist(b, cy) > CELL * 14 && foesOf(team.id).some((f) => targetable(f, b)))
    .sort((a, b) => (a.type !== 'outpost') - (b.type !== 'outpost') || dist(a, from) - dist(b, from));
}
// Enemy jets or helicopters over the base scramble the fighters waiting on their Airfield, on
// either side (not the computer on Easy). Once the sky over the base is clear they fly home.
function scramble(team) {
  if (team.isAI && !G.diff.ai.adapt) return;
  const mine = buildingsOf(team.id);
  const intruders = enemyUnitsOf(team.id).filter((u) => u.cls === 'air' && !u.def.scripted && isAirborne(u) && mine.some((b) => distTo(u, b) < CELL * 20));
  for (const u of unitsOf(team.id)) {
    if (u.def.fly !== 'jet' || !(u.aam > 0) || u.repairHold || u.retreat || u.manual) continue;
    const waiting = u.as === 'landed' && u.order.type === 'guard' && !u.order.hold;
    if (!u.scrambled && !waiting && !u.interceptor) continue;
    if (intruders.length) {
      if (u.order.type === 'attack' && u.order.target.alive && isAirborne(u.order.target)) continue;
      const t = intruders.reduce((a, b) => (dist(u, a) < dist(u, b) ? a : b));
      if (!canTarget(u, t)) continue;
      if (!u.scrambled) { u.scrambled = true; u.wasStaged = u.staged; notify(team, 'scramble', 'Scrambling fighters', 20); }
      commandAttack([u], t);
      // A scramble is the game's own order, not the player's: commandAttack marks a player's unit as under a
      // direct order (takeOver), which kept scrambled jets out of base defence and later scrambles.
      u.manual = false; u.manualFrom = undefined;
      if (u.as === 'landed') u.as = 'takeoff';
    } else if (u.scrambled || (u.interceptor && (u.order.type !== 'guard' || !u.order.pad))) {
      setGuard(u); u.order.pad = true; u.staged = !!u.wasStaged; u.scrambled = false;   // all clear: back to the Airfield
    }
  }
}

// The player's jets fly one wave per Auto Attack: out once, home, and they wait on the pad until
// Auto Attack is switched on (or a target side picked) again. Helicopters and the computer's jets keep going out.
const oneWave = (u) => u.def.fly === 'jet' && !G.teams[u.team].isAI;
const AIR_GROUP_WAIT = 150;   // seconds a lone computer aircraft waits for others before going out alone
const AIR_STRIKE_GAP = 270;   // seconds between the computer's jet strikes (and between its helicopter strikes)
// `focus`: where a group of aircraft all go (null: the main base); left out, one in three picks an outlying site.
function launchAircraft(u, focus) {
  setHunt(u);
  u.staged = false;
  if (focus === undefined) { const exp = expansionsOf(enemyOf(G.teams[u.team]), u); focus = exp.length && Math.random() < 1 / 3 ? exp[0] : null; }
  if (focus) u.focus = focus;
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
  // (A box round the whole base first: most enemy units are nowhere near it.)
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const b of mine) { bx0 = Math.min(bx0, b.cx * CELL); by0 = Math.min(by0, b.cy * CELL); bx1 = Math.max(bx1, (b.cx + b.w) * CELL); by1 = Math.max(by1, (b.cy + b.h) * CELL); }
  const nearBase = (u, r) => u.x > bx0 - CELL * r && u.x < bx1 + CELL * r && u.y > by0 - CELL * r && u.y < by1 + CELL * r && mine.some((b) => distTo(u, b) < CELL * r);
  const hh = team.harvHit && team.harvHit.until > G.t ? team.harvHit : null;
  const nearHarv = (u, r) => hh && Math.hypot(u.x - hh.x, u.y - hh.y) < CELL * r;
  const bh = team.baseHit && team.baseHit.until > G.t ? team.baseHit : null;
  const nearShooter = (u) => bh && Math.hypot(u.x - bh.x, u.y - bh.y) < CELL * 8;
  // Once fighting has started the zone widens, so raiders stepping back do not end the defence.
  const zone = team.defending ? 18 : 14;
  const threats = enemyUnitsOf(team.id).filter((u) => !isAirborne(u) && !u.def.harvester && !u.def.scripted && !u.chute &&
    (nearBase(u, zone) || nearHarv(u, 9) || nearShooter(u)));
  // Only an Ore Truck under fire, away from the base: a few units close to it go to help.
  const truckOnly = threats.length && !threats.some((u) => nearBase(u, zone) || nearShooter(u));
  // Aircraft answer an Ore Truck's call from much further away: they get there in seconds.
  const idle = (u) => u.order.type === 'guard' && !u.order.hold && (nearBase(u, 16) || nearHarv(u, u.cls === 'air' ? 48 : truckOnly ? 16 : 24) || nearShooter(u));
  // The computer also recalls attack waves still on its own half of the map; past halfway they press on.
  const ecy = buildingsOf(enemyOf(team).id).find((b) => b.type === 'cy'), own = mine.find((b) => b.type === 'cy');
  const homeHalf = (u) => !ecy || !own || dist(u, own) < dist(u, ecy);
  let army = unitsOf(team.id).filter((u) => u.def.weapon && !u.def.harvester && !u.def.scripted && !u.chute && !u.homeward && !u.manual &&
    (u.cls !== 'air' || (!airEmpty(u) && (u.as === 'landed' && u.def.fly !== 'jet' ? padReady(u) : !u.rearming) && u.order.type === 'guard' && !u.order.hold)) &&
    (u.defending || idle(u) || (team.isAI && !G.diff.ai.planner && u.cls !== 'air' && !truckOnly && homeHalf(u))));
  if (!threats.length) {
    team.raiders = []; team.defShort = 0;
    if (++team.calm < DEFEND_CALM) return;
    team.defending = false;
    // Everyone pulled into a defence (aircraft that turned on a shooter too) goes back once its fight is over,
    // ground units each to an open cell of their own near where they were (spotDealer: many share the rally point).
    const deal = spotDealer(team);
    for (const u of unitsOf(team.id)) {
      if (!u.defending || !u.post || (u.cls !== 'air' && u.target && u.target.alive)) continue;
      u.defending = false; u.cover = null;
      const h = u.cls === 'air' ? u.post : Object.assign({}, u.post, deal(u, u.post.x, u.post.y));
      setGuard(u, h.x, h.y); u.staged = h.staged; u.order.pad = h.pad;
      // Aircraft do not wait in the air where the fight ended: they fly home, land, rearm and repair.
      if (u.cls === 'air' && padFor(u)) { u.order.pad = true; u.rearming = true; }
      if (u.cls !== 'air') goTo(u, h.x, h.y);
    }
    return;
  }
  team.defending = true; team.calm = 0;
  team.raiders = threats.map((t) => t.id);
  // The computer remembers which way attacks come from, to put new defences there.
  const cy = mine.find((b) => b.type === 'cy');
  if (team.isAI && cy && G.t - (team.fromT || -99) > 5) {
    team.fromT = G.t;
    const t = threats.reduce((a, b) => (dist(a, cy) < dist(b, cy) ? a : b));
    (team.attackFrom = team.attackFrom || []).push(Math.atan2(t.y - cy.y, t.x - cy.x));
    if (team.attackFrom.length > 8) team.attackFrom.shift();
  }
  // Either side sends only what it takes: those already defending, then aircraft (they get there
  // first), then the nearest others, until they are worth half again as much as the raiders
  // (a few at most for a truck). Ground units make up whatever the aircraft at hand cannot.
  // Aircraft count at a quarter of their price: one helicopter is no match for a squad of infantry.
  const worth = (u) => (u.def.cost || 300) * (u.cls === 'air' && u.team === team.id ? 0.25 : 1);
  const need = threats.reduce((a, t) => a + worth(t), 0) * 1.5;
  const nearC = new Map();   // each unit's distance to the nearest threat, worked out once (it is used in sorts)
  const near = (u) => { let d = nearC.get(u); if (d === undefined) { d = Infinity; for (const t of threats) d = Math.min(d, Math.hypot(u.x - t.x, u.y - t.y)); nearC.set(u, d); } return d; };
  army = army.filter((u) => threats.some((t) => (u.cls === 'air' ? airWeapons(u).some((w) => canHit(w, t)) : canTarget(u, t))));
  army.sort((a, b) => (b.defending - a.defending) || ((b.cls === 'air') - (a.cls === 'air')) || near(a) - near(b));
  let got = 0, picked = [];
  for (const u of army) {
    if (got >= need || (truckOnly && picked.length >= 4)) { if (!u.defending) continue; }
    picked.push(u); got += worth(u);
  }
  army = picked;
  team.defShort = Math.max(0, need - got);   // worth still missing: the computer's planner (aiSquads) sends squads to cover it
  const bags = sandbagCells(team, bx0 - CELL * 18, by0 - CELL * 18, bx1 + CELL * 18, by1 + CELL * 18), claimed = new Set();
  if (bags) for (const u of army) if (u.cover) claimed.add(u.cover.c);   // spots already taken stay with whoever has them
  for (const u of army) {
    let best = null, bd = CELL * 32;
    // Jets spread out: each takes a raider the others have not, and keeps it until it is dead.
    if (u.def.fly === 'jet') best = u.target && u.target.alive && threats.includes(u.target) ? u.target : pickRaider(u);
    else for (const t of threats) { const d = Math.hypot(u.x - t.x, u.y - t.y) + (t !== u.target && overkill(t) ? OVERKILL : 0); if (d < bd && canTarget(u, t)) { bd = d; best = t; } }
    if (!best) continue;
    if (best !== u.target) pledge(u, best);   // so the next defenders spread over the raiders
    if (u.cls === 'air' && u.as === 'landed') { u.as = 'takeoff'; u.repairHold = false; u.rearming = false; }   // part-rearmed or part-repaired: good enough for a fight at home
    if (!u.defending) {
      // Remember where to return: the guard spot, or for attack groups already out, the rally point.
      const r = rallyPoint(team), g = u.order.type === 'guard';
      u.post = { x: g ? u.order.x : r.x, y: g ? u.order.y : r.y, staged: u.staged || (team.isAI && !g), pad: g && u.order.pad };
    }
    u.defending = true; u.staged = false;
    // Infantry fight from behind their side's sandbags where there are some in reach of the raider (coverSpot).
    let spot = null;
    if (bags && u.cls === 'inf' && !u.inHouse) {
      const tt = u.target && u.target.alive && threats.includes(u.target) ? u.target : best;
      if (!(u.cover && G.wall[u.cover.s] === SANDBAG_ID && coverFits(u, tt, u.cover.c))) {
        if (u.cover) claimed.delete(u.cover.c);
        spot = coverSpot(u, tt, bags, claimed); u.cover = spot; if (spot) claimed.add(spot.c);
      }
    }
    if (spot && u.target === best) { const p = cellCenter(spot.c); goTo(u, p.x, p.y); continue; }
    if (u.target === best || (u.target && u.target.alive && threats.includes(u.target))) continue;
    setGuard(u, best.x, best.y); u.target = best;
    if (u.cls !== 'air') { if (u.cover) { const p = cellCenter(u.cover.c); goTo(u, p.x, p.y); } else goTo(u, best.x, best.y, false, true); }
  }
}

// Sandbags as cover (both modes). An infantryman (not in a house) right beside a sandbag of his alliance that lies toward
// whoever hit him takes SANDBAG_COVER of the damage (on top of going prone). Defending infantry seek such spots (coverSpot).
const SANDBAG_ID = 1, SANDBAG_COVER = 0.65, COVER_SNAP = 9, COVER_SEEK = 12, COVER_WAIT = 8;
function sandbagCover(u, sx, sy) {
  const cx = Math.floor(u.x / CELL), cy = Math.floor(u.y / CELL);
  const ax = sx - u.x, ay = sy - u.y, al = Math.hypot(ax, ay);
  if (al < CELL) return false;   // point blank, or a blast at his feet: no cover
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const x = cx + dx, y = cy + dy;
    if (!inMap(x, y)) continue;
    const c = idx(x, y);
    if (G.wall[c] !== SANDBAG_ID || hostile(G.wallTeam[c], u.team)) continue;
    const bx = (x + 0.5) * CELL - u.x, by = (y + 0.5) * CELL - u.y;
    if ((bx * ax + by * ay) / (Math.hypot(bx, by) * al) > 0.75) return true;   // the bag is on the shooter's side
  }
  return false;
}
// The alliance's sandbag cells near the base (defendBase), or null when it has none.
function sandbagCells(team, x0, y0, x1, y1) {
  if (!G.wallN) return null;
  const out = [];
  const X0 = Math.max(0, Math.floor(x0 / CELL)), Y0 = Math.max(0, Math.floor(y0 / CELL)), X1 = Math.min(MAP - 1, Math.floor(x1 / CELL)), Y1 = Math.min(MAP - 1, Math.floor(y1 / CELL));
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) { const c = idx(x, y); if (G.wall[c] === SANDBAG_ID && !hostile(G.wallTeam[c], team.id)) out.push(c); }
  return out.length ? out : null;
}
// A spot cell is good for u against t: it can shoot t from there.
function coverFits(u, t, c) {
  const w = u.def.weapon, p = cellCenter(c);
  return w && Math.hypot(t.x - p.x, t.y - p.y) <= w.range + CELL * 2;
}
// The nearest free cell behind one of the bags (on the far side from the raider t, beside the bag), within COVER_SEEK
// cells of u and in reach of t: { c: the spot, s: the sandbag }.
function coverSpot(u, t, bags, claimed) {
  const w = u.def.weapon;
  if (!w || !canTarget(u, t) || u.coverBan > G.t) return null;
  let best = null, bd = CELL * COVER_SEEK;
  for (const s of bags) {
    const sp = cellCenter(s);
    if (Math.abs(sp.x - u.x) > bd || Math.abs(sp.y - u.y) > bd) continue;
    const ax = sp.x - t.x, ay = sp.y - t.y, al = Math.hypot(ax, ay);
    if (al < CELL * 1.5) continue;   // the raider is at the bag already
    const sx = cellX(s) + Math.round(ax / al), sy = cellY(s) + Math.round(ay / al);
    if (!inMap(sx, sy)) continue;
    const c = idx(sx, sy);
    if (claimed.has(c) || G.block[c] || G.wall[c] || !coverFits(u, t, c)) continue;
    const p = cellCenter(c), d = Math.hypot(p.x - u.x, p.y - u.y);
    if (d < bd) { bd = d; best = { c, s }; }
  }
  return best;
}

// A helicopter rearming on its pad still answers a raid on its own base (the Comanche sat out whole raids while it loaded
// missiles it had no use for against infantry): landed, at least half its health, and (checked in defendBase) carrying
// something that can hit one of the raiders; half a load of gun or missiles. Jets still make one pass and rearm fully.
function padReady(u) {
  if (u.hp < u.maxHp * 0.5) return false;
  const L = airLoad(u.def);   // half a load of its gun or of its missiles, so it does not bob up and down with one burst
  return (L.ammo > 0 && u.ammo >= L.ammo / 2) || (L.aam > 0 && (u.aam || 0) >= L.aam / 2);
}
// A defending jet's next raider: the nearest one no other defending aircraft is already after.
function pickRaider(u) {
  const claims = new Map();
  for (const m of unitsOf(u.team)) if (m !== u && m.cls === 'air' && m.defending && m.target && m.target.alive) claims.set(m.target, (claims.get(m.target) || 0) + 1);
  const ws = airWeapons(u);
  let best = null, bs = Infinity;
  for (const id of G.teams[u.team].raiders || []) {
    const t = G.byId.get(id);
    if (!t || !t.alive || !ws.some((w) => canHit(w, t))) continue;
    const s = (claims.get(t) || 0) * 1e5 + Math.hypot(u.x - t.x, u.y - t.y);
    if (s < bs) { bs = s; best = t; }
  }
  return best;
}
// Point a guard order at a target without losing the target.
function setGuardKeep(u, t) { setGuard(u, t.x, t.y); u.target = t; }

function setGuard(u, x, y) {
  u.order = { type: 'guard', x: x === undefined ? u.x : x, y: y === undefined ? u.y : y };
  u.target = null; u.raider = false;
}
// How far from its spot a unit on a Guard order goes after enemies: aircraft by their sight (jets
// see further), ground units a little past theirs, and long-range guns (Artillery, V2) as far as
// they can shoot. The placement ring shows the same distance.
function guardReach(u) {
  const sight = u.def.sight * CELL, w = u.def.weapon;
  if (u.cls === 'air') return sight * (u.def.fly === 'jet' ? 1.6 : 1);
  return w && wRange(u, w) > sight ? wRange(u, w) : sight * 1.6;
}
// What a side has in view: there is no fog, only shroud, so anything on explored ground.
const inViewOf = (side) => (e) => !!G.fog[side][cellOfPos(e.x, e.y)];
function setHunt(u) { u.order = { type: 'hunt' }; u.target = null; u.huntTarget = null; u.focus = null; u.resume = null; assignLane(u); }

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------
const SAM_FUEL = 3;   // SAM Sites have the longest burn: they are the answer to aircraft that fly away
const AA_FUEL = 1.5;   // anti-air missiles fly this many times their weapon's range, then burn out (a weapon's own `fuel` overrides it)
const PROJ_SPEED = { shell: 430, rocket: 250, missile: 330, flak: 560, fireball: 230 };

// A garrisoned soldier's shots leave a window on the wall facing the target (models.js FORT_INFO: the house's windows on its
// south and east faces, mirrored onto the north and west walls), not the middle of the roof. Each soldier keeps to one
// of the two windows nearest the target (by id). Worked out on the host from the house's type, so the game server
// builds the model once to learn its windows; without them, the middle of that wall.
function windowSpot(h, t, salt) {
  let fi = typeof FORT_INFO !== 'undefined' ? FORT_INFO.get(h.type) : null;
  if (!fi && h.type && typeof houseModel === 'function') { try { houseModel(h.type); fi = FORT_INFO.get(h.type); } catch (_) {} }
  const ox = h.cx * CELL, oy = h.cy * CELL, b = (fi && fi.box) || [4, 4, h.w * CELL - 4, h.h * CELL - 4];
  const cx = ox + (b[0] + b[2]) / 2, cy = oy + (b[1] + b[3]) / 2, dx = t.x - cx, dy = t.y - cy;
  const face = Math.abs(dx) / ((b[2] - b[0]) / 2) > Math.abs(dy) / ((b[3] - b[1]) / 2) ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n');
  const spots = [];
  for (const w of (fi && fi.wins) || []) {
    if ((face === 's' || face === 'n') && w.face === 's') spots.push([w.x + 2, face === 's' ? w.y : b[1], w.z + 2.5]);
    if ((face === 'e' || face === 'w') && w.face === 'e') spots.push([face === 'e' ? w.x : b[0], w.y + 2, w.z + 2.5]);
  }
  if (!spots.length) spots.push(face === 's' ? [(b[0] + b[2]) / 2, b[3], 7] : face === 'n' ? [(b[0] + b[2]) / 2, b[1], 7] : [face === 'e' ? b[2] : b[0], (b[1] + b[3]) / 2, 7]);
  spots.sort((p, q) => Math.hypot(ox + p[0] - t.x, oy + p[1] - t.y) - Math.hypot(ox + q[0] - t.x, oy + q[1] - t.y));
  const s = spots[(salt | 0) % Math.min(2, spots.length)];
  return { x: ox + s[0], y: oy + s[1] - s[2] * VK, h: s[2] * VK };
}
// Where a shot leaves a gun: (x, y) as the game has always used it, the gun's height above the ground folded into y,
// and that height (h), so drawing (voxel.js liftPt) can put it straight up the screen.
function muzzle(src, t) {
  if (src.inHouse && t && t.x !== undefined) return windowSpot(src.inHouse, t, src.id);
  if (src.kind === 'bld') {
    if (src.type === 'tesla') return { x: src.cx * CELL + 12, y: src.cy * CELL + 35 - 50 * VK, h: 50 * VK };
    if (src.type === 'pillbox') {   // out of the firing slit nearest to where it aims (slits sit at 30 degrees plus 60 per side), low on the wall and in front of the roof
      const sa = Math.round((src.tface - Math.PI / 6) / (Math.PI / 3)) * (Math.PI / 3) + Math.PI / 6;
      return { x: src.x + Math.cos(sa) * 13, y: src.y + Math.sin(sa) * 13 - 4, h: 4 };
    }
    if (src.type === 'ftur') return { x: src.cx * CELL + 12, y: src.cy * CELL + 13 - 25 * VK, h: 25 * VK };
    if (HEAD_TIPS[src.type]) return headTip(src, src.shots || 0);
    const h = HEADS[src.type];
    const hx = src.cx * CELL + h[1], hy = src.cy * CELL + h[2] - (h[3] + 2) * VK;
    return { x: hx + Math.cos(src.tface) * 13, y: hy + Math.sin(src.tface) * 13, h: (h[3] + 2) * VK };
  }
  if (src.cls === 'air') return { x: src.x + Math.cos(src.face) * 9, y: src.y - (src.alt || 0) + Math.sin(src.face) * 9, h: src.alt || 0 };
  if (src.cls === 'inf' && src.def.setup) { const r = (src.faction === 'soviets' ? 21 : 19) * INF_SCALE, h = 8 * INF_SCALE; return { x: src.x + Math.cos(src.face) * r, y: src.y + Math.sin(src.face) * r - h, h }; }   // the MG Team's gun on its mount
  if (src.cls === 'inf') {
    const r = (src.stance === 'prone' ? 12 : 10) * INF_SCALE;
    const h = (src.stance === 'prone' ? 2 : 11) * INF_SCALE;
    return { x: src.x + Math.cos(src.face) * r, y: src.y + Math.sin(src.face) * r - h, h };
  }
  const s = src.def.size;
  if (s && s.tesla) return { x: src.x, y: src.y - (turretZ(src.def) + TESLA_TOP) * VK, h: (turretZ(src.def) + TESLA_TOP) * VK };   // the Tesla Tank: from the ball on its coil
  const len = s.tur ? s.tur + s.barrel : 8, z = (turretZ(src.def) + 1.5) * VK;
  return { x: src.x + Math.cos(src.tface) * len, y: src.y + Math.sin(src.tface) * len - z, h: z };
}
// The end of barrel n of a head with HEAD_TIPS (models.js), as muzzle gives it. Twin barrels take turns: shot n from
// barrel n % 2 (art.js lights the flash on the one that fired last, shots - 1).
function headTip(b, n) {
  const h = HEADS[b.type], t = HEAD_TIPS[b.type], c = Math.cos(b.tface), s = Math.sin(b.tface);
  const side = (n % 2 ? 1 : -1) * t[1], z = (h[3] + t[2]) * VK;
  return { x: b.cx * CELL + h[1] + c * t[0] - s * side, y: b.cy * CELL + h[2] + s * t[0] + c * side - z, h: z };
}
const TESLA_TOP = 10;   // height of the glowing cap on the Tesla Tank's dome above its turret's base (models.js teslaTurret)
// Infantry under fire: seconds they stay prone after the last hit, the share of damage they take
// while prone, and how fast they crawl (a share of walking speed).
const PRONE_TIME = 6, PRONE_COVER = 0.5, CRAWL_SPEED = 0.6;
// Where shots should land on a target (its body, not its feet).
function aimY(t) {
  if (t.kind === 'bld' || t.kind === 'house') return t.y - 6;
  if (t.cls === 'inf' && t.stance === 'prone') return t.y - 2 * INF_SCALE;
  return t.y - (t.alt || 0) - (t.cls === 'inf' ? 8 * INF_SCALE : 4);
}
// The height aimY folds into y (for drawing: shots, sparks and bursts stand that high up the screen).
function aimH(t) {
  if (!t || t.x === undefined) return 0;
  if (t.kind === 'bld' || t.kind === 'house') return 6;
  if (t.kind === 'spot') return 0;
  if (t.cls === 'inf' && t.stance === 'prone') return 2 * INF_SCALE;
  return (t.alt || 0) + (t.cls === 'inf' ? 8 * INF_SCALE : 4);
}

function weaponSound(src, w) {
  if (w.sound === 'hmg') return src.faction === 'soviets' ? 'dshk' : 'cal50';   // the MG Team: the M2's deep thump, the DShK's harder crack
  if (w.sound) return w.sound;   // a weapon with a sound of its own (the RedEye)
  if (w.proj === 'bullet') return src.cls !== 'inf' ? 'mg' : src.faction === 'allies' ? 'm16' : 'rifle';   // each side's own rifle
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
  if (!b.target.alive || distTo(u, b.target) > wRange(u, b.w) + 12) { u.burst = null; return; }
  if ((b.t -= dt) > 0) return;
  fireWeapon(u, b.w, b.target);
  b.t = b.w.gap;
  if (--b.left <= 0) u.burst = null;
}

// A jet's gun run: `rounds` cannon shells walked along the flight line through where the target
// stood, from `walk`/2 short of it to `walk`/2 past it. Each shell hurts every enemy on the ground
// within `splash` (full damage, small arms: deadly to infantry, weak against armour and buildings).
function startStrafe(u, t) {
  const g = u.def.gun, c = Math.cos(u.face), s = Math.sin(u.face);
  u.strafe = { left: g.rounds, n: 0, t: 0, x0: t.x - c * g.walk / 2, y0: t.y - s * g.walk / 2, dx: c * g.walk / (g.rounds - 1), dy: s * g.walk / (g.rounds - 1) };
}
function tickStrafe(u, dt) {
  const st = u.strafe;
  if (!st) return;
  if (!u.alive || !isAirborne(u)) { u.strafe = null; return; }
  if ((st.t -= dt) > 0) return;
  const g = u.def.gun, m = muzzle(u);
  const x = st.x0 + st.dx * st.n + (Math.random() - 0.5) * 6, y = st.y0 + st.dy * st.n + (Math.random() - 0.5) * 6;
  if (st.n % 3 === 0) hooks.sfx('mg', u.x, u.y);
  u.fireT = 0.1; u.shots = (u.shots || 0) + 1; u.shotAt = G.t;
  G.effects.push({ type: 'tracer', x: m.x, y: m.y, x2: x, y2: y, h0: m.h, t: 0, life: 0.07 });
  G.effects.push({ type: 'spark', x, y, t: 0, life: 0.12 });
  if (st.n % 2 === 0) G.effects.push({ type: 'smoke', x, y, r: 3, t: 0, life: 0.6, alpha: 0.45, color: '#b8a888', vy: -6 });   // dust kicked up
  const once = new Set();
  if (!G.remote) for (const e of G.entities) {
    if (!e.alive || !hostile(e.team, u.team) || isAirborne(e)) continue;
    if (e.kind === 'bld' ? (x >= e.cx * CELL && x < (e.cx + e.w) * CELL && y >= e.cy * CELL && y < (e.cy + e.h) * CELL) : Math.hypot(e.x - x, e.y - y) < g.splash + (e.def.r || 0)) damage(e, g.dmg, g.wh, u, { x, y }, once);
  }
  st.n++; st.t = g.gap;
  if (--st.left <= 0) u.strafe = null;
}

// Smoke out of a gun turret's barrel (a heavier puff that rolls forward and up) or a pillbox's
// machine gun (a thin wisp for each round of the burst). Pushed on the host like any effect, so an
// online guest gets it in the snapshot.
function barrelSmoke(src, m) {
  const cx = Math.cos(src.tface), cy = Math.sin(src.tface), r = Math.random;
  if (src.type === 'turret') {
    // Six puffs a shell: three roll out along the barrel, three hang about the muzzle and fade slowly.
    for (let i = 0; i < 6; i++) {
      const slow = i >= 3;
      G.effects.push({ type: 'smoke', x: m.x + cx * i * 1.2 + (r() - 0.5) * 3, y: m.y + m.h + cy * i * 1.2 + (r() - 0.5) * 3, lift: m.h,
        r: 5 + r() * 4, t: -i * 0.03, life: slow ? 2.6 + r() * 1.4 : 1.8 + r() * 1, alpha: 0.7, color: '#c9c7c0',
        vx: cx * (slow ? 3 + r() * 5 : 12 + r() * 14) + (r() - 0.5) * 6, vy: cy * (slow ? 2 + r() * 4 : 8 + r() * 10) * 0.7 - (slow ? 4 + r() * 4 : 7 + r() * 5), drag: slow ? 1.2 : 1.6 });
    }
  } else {
    G.effects.push({ type: 'smoke', x: m.x + (r() - 0.5) * 2, y: m.y + m.h + (r() - 0.5) * 2, lift: m.h, r: 2 + r() * 1.3, t: 0, life: 0.7 + r() * 0.5, alpha: 0.38, color: '#c9c7c0',
      vx: cx * (5 + r() * 8) + (r() - 0.5) * 6, vy: cy * (4 + r() * 6) * 0.7 - (5 + r() * 3), drag: 1.2 });
  }
}
// A side fired on from ground it has never uncovered gets a glimpse of the shooter: SHOT_REVEAL cells round
// it are uncovered (a V2 or artillery out of sight no longer fires unseen).
const SHOT_REVEAL = 2;
// follow: the second barrel of a staggered twin gun (w.stagger), fired from the unit's update.
function fireWeapon(src, w, t, follow) {
  if (t && !G.remote && t.team !== undefined && hostile(src.team, t.team)) {
    const fog = G.fog[t.team];
    if (fog && !fog[cellOfPos(src.x, src.y)]) revealCircle(src.x / CELL, src.y / CELL, SHOT_REVEAL, fog);
  }
  const m = muzzle(src, t);
  hooks.sfx(weaponSound(src, w), src.x, src.y);
  if (src.kind === 'bld' && (src.type === 'turret' || src.type === 'pillbox')) barrelSmoke(src, m);
  src.fireT = w.proj === 'grenade' ? 0.35 : 0.1;
  src.shots = (src.shots || 0) + 1;
  src.shotAt = G.t;   // the gun's recoil (art.js recoil)   // online copies light their own muzzle flash when this changes (net.js)
  if (w.sound === 'redeye' && src.cls === 'inf') src.aaUntil = G.t + 1.1;
  if (src.kind === 'unit' && src.def.setup) {   // MG Team: a puff of smoke from the muzzle every round, and the hot barrel smoking on after a burst
    const fx = Math.cos(src.face), fy = Math.sin(src.face);
    G.effects.push({ type: 'smoke', x: m.x, y: m.y + m.h, lift: m.h, r: 3.5 + Math.random() * 1.5, t: 0, life: 1 + Math.random() * 0.6, alpha: 0.6, color: '#c9c7c0', vx: fx * 16, vy: fy * 9 - 7, drag: 1.6 });
    if (Math.random() < 0.4) G.effects.push({ type: 'smoke', x: m.x - fx * (4 + Math.random() * 8), y: m.y + m.h - fy * 4, lift: m.h + 1, r: 2.5 + Math.random(), t: -0.2 - Math.random() * 0.4, life: 1.8 + Math.random() * 0.8, alpha: 0.45, color: '#9a968c', vx: (Math.random() - 0.5) * 3, vy: -10, drag: 0.6 });
  }   // shows the shoulder-fired RedEye launcher a moment
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
    if (!v2) G.effects.push({ type: 'smoke', x: m.x, y: m.y + m.h, lift: m.h, r: 4, t: 0, life: 0.8, alpha: 0.5, color: '#c9c7c0', vy: -8 });   // muzzle smoke
    else {
      // Launch: flame and a great cloud of exhaust billowing out behind and around the truck.
      const bx = Math.cos(src.face), by = Math.sin(src.face);
      G.effects.push({ type: 'expl', x: src.x - bx * 10, y: src.y - by * 10, lift: 6, size: 7, t: 0, life: 0.35, seed: (Math.random() * 1e6) | 0 });
      for (let i = 0; i < 14; i++) {
        const a = Math.atan2(-by, -bx) + (Math.random() - 0.5) * 2.2, sp = 14 + Math.random() * 30;
        G.effects.push({ type: 'smoke', x: src.x - bx * 10 + (Math.random() - 0.5) * 6, y: src.y - by * 10 + (Math.random() - 0.5) * 4, r: 4 + Math.random() * 3, t: -i * 0.04,
          life: 2 + Math.random() * 1.2, alpha: 0.6, color: '#c9c7c0', vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - 3, drag: 1.4 });
      }
    }
  } else if (w.proj === 'bullet') {
    const jx = (Math.random() - 0.5) * 6, jy = (Math.random() - 0.5) * 6;
    damage(t, w.dmg, w.wh, src);
    if (w.splash && !isAirborne(t)) {   // rifle bullets: a little splash on hostile ground units next to the target (full at the target, half at the edge)
      for (const e of G.entities) {
        if (!e.alive || e === t || e.kind !== 'unit' || isAirborne(e) || !hostile(e.team, src.team) || e.inHouse) continue;   // walls stop bullet splash
        const d = Math.hypot(e.x - t.x, e.y - t.y);
        if (d < w.splash) damage(e, w.dmg * (1 - d / w.splash * 0.5), w.wh, src, { x: t.x, y: t.y }, true);
      }
    }
    const H = aimH(t);
    G.effects.push({ type: 'tracer', x: m.x, y: m.y, x2: t.x + jx, y2: ty + jy, h0: m.h, h2: H, t: 0, life: 0.07 });
    G.effects.push({ type: 'spark', x: t.x + jx, y: ty + jy + H, lift: H, t: 0, life: 0.12 });
  } else if (w.proj === 'tesla') {
    src.charge = 1;
    damage(t, w.dmg, w.wh, src);
    G.effects.push({ type: 'tesla', x: m.x, y: m.y, x2: t.x, y2: ty, h0: m.h, h2: aimH(t), t: 0, life: 0.35, seed: (Math.random() * 1e6) | 0 });
  } else {
    if (w.proj === 'flak') {
      // Most of a flak barrage bursts around the target rather than on it.
      const d = Math.hypot(t.x - m.x, ty - m.y), eta = d / PROJ_SPEED.flak;
      for (let i = 0; i < 2; i++) { const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 18; flakBurst(t.x + Math.cos(a) * r, ty + Math.sin(a) * r * 0.7, eta + 0.05 + Math.random() * 0.25, aimH(t)); }
    }
    if (src.kind === 'bld' && src.type === 'sam') {
      // Backblast: smoke billows out behind the launcher as the missile leaves.
      const bx = Math.cos(src.tface), by = Math.sin(src.tface);
      G.effects.push({ type: 'expl', x: m.x - bx * 6, y: m.y + m.h - by * 6, lift: m.h, size: 5, t: 0, life: 0.25, seed: (Math.random() * 1e6) | 0 });
      for (let i = 0; i < 10; i++) {
        const sp = 22 + Math.random() * 30, a = Math.atan2(-by, -bx) + (Math.random() - 0.5) * 1.3;
        G.effects.push({ type: 'smoke', x: m.x - bx * 8, y: m.y + m.h - by * 8, lift: m.h, r: 4 + Math.random() * 3, t: -i * 0.03, life: 1.8 + Math.random() * 1, alpha: 0.7, color: '#9a968c', vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - 4, drag: 1.5 });
      }
    }
    // A twin gun fires both shells together, unless it staggers them: one barrel now, the other
    // w.stagger seconds later, each with its own flash, sound and recoil.
    const shots = w.twin && !w.stagger ? 2 : 1;
    if (w.stagger) {
      src.barrel = follow ? 1 : -1;
      if (!follow) { src.twinNext = G.t + w.stagger; src.twinTarget = t; }
    }
    // The Comanche's missiles leave its side bays, left and right in turn, drop clear and then light up (updateProjectiles).
    if (w.bay || w.atgm) {
      src.fireT = 0; src.shots--;   // no flash at the nose (an online copy lights one when `shots` changes)
      const side = (src.bayN = (src.bayN || 0) + 1) % 2 ? 1 : -1, c = Math.cos(src.face), sn = Math.sin(src.face), alt = src.alt || 0;
      const off = w.atgm ? 9 : 5, bx = src.x - sn * side * off + c, by = src.y + c * side * off + sn;   // (an ATGM hangs under the wing, further out than a bay)
      const arc = w.atgm ? Math.min(46, Math.hypot(t.x - bx, t.y - by) * 0.14) : 0;
      G.projectiles.push({ x: bx, y: by - alt + 3, target: t, w, from: src, team: src.team, speed: w.speed || PROJ_SPEED.missile || 400, kind: 'missile', trail: 0, delay: 0, ...(w.atgm ? { atgm: true, arc } : null),
        x0: bx, y0: by - alt + 3, h0: Math.max(0, alt - 3), drop: BAY_DROP, dropV: { x: c * src.def.speed * 0.4 - sn * side * 14, y: sn * src.def.speed * 0.4 + c * side * 14 }, aa: false, fuel: wRange(src, w) * 2 });
      return;
    }
    for (let i = 0; i < shots; i++) {
      const off = shots > 1 ? (i ? 2 : -2) : w.stagger ? src.barrel * 2 : 0;
      G.projectiles.push({ x: m.x + off * Math.sin(src.tface || 0), y: m.y - off * Math.cos(src.tface || 0), target: t, w, from: src, team: src.team,
        speed: PROJ_SPEED[w.proj] || 400, kind: w.proj, trail: 0, delay: i * 0.1, thick: src.kind === 'bld' && src.type === 'sam',
        x0: m.x, y0: m.y, h0: m.h || 0,   // (for drawing it at its height: projH)
        ...(w.proj === 'fireball' ? { sx: m.x, sy: m.y } : null),   // where it left: the stream of fire is drawn from there (ui.js fireStream, when its tower's own jet is not showing)
        // A missile fired at an aircraft only has fuel for a little past its weapon's range, and
        // gives up if the aircraft lands: it cannot chase a jet across the map.
        aa: (w.proj === 'missile' || w.proj === 'rocket') && isAirborne(t), fuel: wRange(src, w) * (w.fuel || (src.kind === 'bld' && src.type === 'sam' ? SAM_FUEL : AA_FUEL)) });
    }
  }
}

// A missile dropped from the Comanche's bay (p.drop seconds): it falls away beside the helicopter, carried along by its speed,
// then its motor lights with a puff of smoke and it flies on to its target as any missile. Looks only (the guest runs it too,
// net.js flyShots). Returns true while still falling.
const BAY_DROP = 0.22;
function dropStep(p, dt) {
  p.drop -= dt;
  p.x += p.dropV.x * dt; p.y += p.dropV.y * dt;
  const fall = 40 * dt;
  p.h0 = Math.max(0, p.h0 - fall); p.y += fall;   // (h folds into y on the screen: lower in the air is further down)
  p.x0 = p.x; p.y0 = p.y;
  p.a = Math.atan2(p.dropV.y, p.dropV.x);
  if (p.drop > 0) return true;
  p.drop = 0;
  if (!G.remote) G.effects.push({ type: 'smoke', x: p.x, y: p.y + p.h0, lift: p.h0, r: 3, t: 0, life: 0.7, alpha: 0.6, color: '#c9c7c0', vy: -4 });
  return false;
}
// How high a shell, rocket or missile is now (drawing only): from its gun's height to the target's, by how far it has come.
function projH(p) {
  if (p.h0 === undefined) return 0;
  const t = p.target, d0 = Math.hypot(p.x - p.x0, p.y - p.y0), d1 = t ? Math.hypot(t.x - p.x, aimY(t) - p.y) : 0;
  const k = d0 + d1 > 0 ? d0 / (d0 + d1) : 1;
  return p.h0 + (aimH(t) - p.h0) * k + (p.arc ? p.arc * 4 * k * (1 - k) : 0);   // an ATGM climbs, then dives onto its target
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
        G.effects.push({ type: 'smoke', x: p.x, y: p.gy, lift: p.gy - p.y, r: p.style === 'v2' ? 3.2 : 1.4, t: 0, life: p.style === 'v2' ? 2.6 : 0.6, alpha: p.style === 'v2' ? 0.55 : 0.3, color: '#c9c7c0', vx: p.style === 'v2' ? 2 : 0, vy: p.style === 'v2' ? -2 : 0 });
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
    if (p.drop > 0) { if (dropStep(p, dt)) continue; }
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
      if (p.trail <= 0) {   // SAM missiles leave a thicker trail that hangs longer; an ATGM a long white contrail
        p.trail = p.atgm ? 0.02 : 0.03;
        const h = projH(p);
        G.effects.push(p.atgm ? { type: 'smoke', x: p.x, y: p.y + h, lift: h, r: 2, t: 0, life: 2.2, alpha: 0.6, color: '#e6e4de', vx: 1, vy: -1.5 } : p.thick ? { type: 'smoke', x: p.x, y: p.y + h, lift: h, r: 2.4, t: 0, life: 1.3, alpha: 0.5, color: '#c9c7c0', vx: 2, vy: -2 } : { type: 'smoke', x: p.x, y: p.y + h, lift: h, r: 1.6, t: 0, life: 0.5, alpha: 0.5, color: '#9a968c' });
      }
    } else if (p.kind === 'fireball') {
      p.trail -= dt;
      if (p.trail <= 0) { p.trail = 0.035; const h = projH(p); G.effects.push({ type: 'smoke', x: p.x, y: p.y + h, lift: h, r: 2, t: 0, life: 0.45, alpha: 0.45, color: '#3a3733' }); }
    }
    // An anti-air missile burns out when its fuel is gone, or when its target has landed.
    if (p.aa && !p.decoy && t.alive && (p.fuel <= 0 || !isAirborne(t))) { p.dead = true; impact('flak', p.x, p.y, true, projH(p)); continue; }
    if (p.aa) p.fuel -= step;
    if (d <= step + 3 || !t.alive) {
      p.dead = true;
      if (p.decoy) { impact('flak', tx, ty, true, aimH(t)); continue; }   // burst harmlessly on a flare
      if (p.kind === 'fireball') { fireBlast(p, t.alive ? t.x : p.x, t.alive ? t.y : p.y); continue; }
      if (p.atgm) { atgmBlast(p, t, tx, ty); continue; }
      if (t.alive && !capturedFriend(t, p.team)) damage(t, p.w.dmg, p.w.wh, p.from || null, { x: p.x, y: p.y });
      impact(p.kind, t.alive ? tx : p.x, t.alive ? ty : p.y, isAirborne(t), t.alive ? aimH(t) : projH(p));
      if ((p.w.wh === 'HE' || p.w.wh === 'GR') && t.kind === 'unit' && !isAirborne(t)) splash(tx, ty, 14, p.w.dmg * 0.4, p.team, t, p.from);
      if (G.houses && G.houses.length && !p.aa && p.kind !== 'bullet' && !isAirborne(t)) houseBlast(tx, ty, HOUSE_SPLASH, p.w.dmg * 0.5, p.w.wh, p.from, t);
      continue;
    }
    p.x += (dx / d) * step; p.y += (dy / d) * step;
  }
  G.projectiles = G.projectiles.filter((p) => !p.dead);
}

// A shell fired at a structure that was captured by the shooter's side or an ally while it flew does it no harm.
const capturedFriend = (t, team) => t.kind === 'bld' && t.team >= 0 && team != null && team >= 0 && !hostile(t.team, team);
// An ATGM (Maverick / Kh-29L) hitting: full damage to what it was fired at, a big blast with a little splash round it.
function atgmBlast(p, t, x, y) {
  const w = p.w, from = p.from || null, h = t.alive ? aimH(t) : projH(p);
  hooks.sfx('explodeVeh', x, y);
  hooks.shake(x, y, 1.5);
  G.effects.push({ type: 'expl', x, y: y + h, lift: h, size: 14, t: 0, life: 0.75, seed: (Math.random() * 1e6) | 0, debris: true });
  G.effects.push({ type: 'smoke', x, y: y + h - 2, lift: h + 2, r: 6, t: 0, life: 1.6, alpha: 0.55, color: '#4a4640', vy: -10 });
  if (t.alive && !capturedFriend(t, p.team)) damage(t, w.dmg, w.wh, from, { x: p.x, y: p.y });
  if (!isAirborne(t)) {
    scorch(G.tctx, x, y, 10, (Math.random() * 1e6) | 0);
    craterAt(x, y, 6);
    splash(x, y, w.splash, w.dmg * 0.5, p.team, t, from);
    houseBlast(x, y, w.splash, w.dmg, w.wh, from, t);
  }
}

// The Flamethrower's fuel tanks going up as he dies (`explodes` in data.js, its chance): a fireball that hurts every ground
// unit within FLAMER_BLAST px, friend or foe, and sets the soldiers in it on fire for BURN_TIME s. A burning soldier takes
// BURN_DPS (FIRE warhead) a second in ticks of BURN_TICK and trails flames; it counts as hit by whoever killed the
// Flamethrower. Another Flamethrower killed by it may go up too. Host only; `burnT` is synced, its timers are not (netcore SKIP).
const FLAMER_BLAST = 36, FLAMER_DMG = 25, BURN_TIME = 4, BURN_DPS = 15, BURN_TICK = 0.25;
function flamerBlast(e, by) {
  const x = e.x, y = e.y, from = by && by.alive ? by : null;
  hooks.sfx('fireHit', x, y);
  hooks.sfx('dieBlast', x, y);
  G.effects.push({ type: 'expl', x, y: y - 4, size: 14, t: 0, life: 0.6, seed: (Math.random() * 1e6) | 0 });
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * FLAMER_BLAST * 0.7;
    G.effects.push({ type: 'fire', x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.7, t: -i * 0.04, life: 1.4 + Math.random() * 1.4 });
  }
  scorch(G.tctx, x, y, 12, (Math.random() * 1e6) | 0);
  for (const t of G.entities) {
    if (!t.alive || t.kind !== 'unit' || isAirborne(t) || t.inHouse) continue;
    const d = Math.hypot(t.x - x, t.y - y);
    if (d >= FLAMER_BLAST) continue;
    if (t.cls === 'inf') setOnFire(t, from);
    damage(t, FLAMER_DMG * (1 - d / FLAMER_BLAST * 0.5), 'FIRE', from, { x, y }, true);
  }
  houseBlast(x, y, FLAMER_BLAST, FLAMER_DMG, 'FIRE', from);
}
function setOnFire(u, by) {
  u.burnT = Math.max(u.burnT || 0, BURN_TIME);
  u.burnBy = by || null;
}
function tickBurn(u, dt) {
  u.burnT -= dt;
  if (Math.random() < dt * 9) G.effects.push({ type: 'fire', x: u.x + (Math.random() - 0.5) * 4, y: u.y - 3, t: 0, life: 0.5 + Math.random() * 0.3 });
  if (G.remote) return;
  if ((u.burnTick = (u.burnTick || 0) - dt) <= 0) {
    u.burnTick += BURN_TICK;
    const by = u.burnBy && u.burnBy.alive ? u.burnBy : null;
    damage(u, BURN_DPS * BURN_TICK, 'FIRE', by, by ? null : u, true);
  }
  if (u.burnT <= 0) { u.burnT = 0; u.burnBy = null; u.burnTick = 0; }
}

// The Specialist (data.js `spec`). Explosives: sent at an enemy structure (an attack order, a hunt, or one he picks up himself),
// he walks up beside it, kneels SPEC_PLANT s to plant a charge, then moves SPEC_CLEAR px off and goes on; SPEC_FUSE s after it is
// planted the structure is destroyed outright (c4Blast), and what stands close round it is hurt. The charge (b.c4T: the time it
// blows, b.c4Team, synced; b.c4By host-only) shows as a blinking light and a fuse bar to both sides (ui.js). One charge a structure;
// it is let go if the structure is captured by the planter's side. Killed while planting, nothing is planted.
const SPEC_PLANT = 1.5, SPEC_FUSE = 5, SPEC_CLEAR = CELL * 3.5, C4_SPLASH = CELL * 1.2, C4_DMG = 80;
function dropDemo(u, t) {
  u.target = null; u.plantT = 0; u.round = null;
  if (u.order && u.order.type === 'attack' && u.order.target === t) { if (teamOf(u).isAI) setHunt(u); else setGuard(u, u.x, u.y); }
}
function demolish(u, t, dt) {
  if (t.c4T || t.sellT > 0 || camoHidden(t, u.team)) { dropDemo(u, t); return; }   // already set to blow (or going)
  const d = distTo(u, t), settled = !u.dest && !u.needPath;
  if (d > CELL * 0.9 && !(settled && d <= CELL * 2)) {
    u.plantT = 0;
    if (u.demoAt !== t.id || settled) {
      const p = besideSpot(u, t);
      if (!p) { if (u.demoAt === t.id) { dropDemo(u, t); return; } u.demoAt = t.id; goTo(u, t.x, t.y); }
      else { u.demoAt = t.id; goTo(u, p.x, p.y); }
    }
    followPath(u, dt);
    return;
  }
  u.dest = null; u.path = null; u.face = Math.atan2(t.y - u.y, t.x - u.x);
  if (!u.plantT) hooks.sfx('build', u.x, u.y);
  u.plantT = (u.plantT || 0) + dt;
  if (u.plantT < SPEC_PLANT) return;
  u.plantT = 0; u.demoAt = null;
  t.c4T = G.t + SPEC_FUSE; t.c4Team = u.team; t.c4By = u;
  notify(teamOf(t), 'c4', 'Explosive charge planted on our base', 6);
  say(u.team, 'Charge set');
  hooks.sfx('place', u.x, u.y);
  // Off to a safe distance, away from the structure, then carry on (the computer's to the next target).
  const a = Math.atan2(u.y - t.y, u.x - t.x), R = Math.max(t.w, t.h) * CELL / 2 + SPEC_CLEAR;
  let gx = t.x + Math.cos(a) * R, gy = t.y + Math.sin(a) * R;
  gx = Math.max(CELL, Math.min(WORLD - CELL, gx)); gy = Math.max(CELL, Math.min(WORLD - CELL, gy));
  u.target = null;
  const hunting = u.order.type === 'hunt';
  u.clearT = G.t + SPEC_FUSE + 0.3;
  setGuard(u, gx, gy); goTo(u, gx, gy);
  if (hunting) u.rehunt = G.t + SPEC_FUSE + 0.5;   // (hunting: back to it once the charge has gone off, not back to the structure)
}
function c4Blast(b) {
  const by = b.c4By && b.c4By.alive ? b.c4By : { team: b.c4Team, kind: 'charge', x: b.x, y: b.y, alive: false };
  b.c4T = 0; b.c4By = null;
  const x = b.x, y = b.y;
  hooks.sfx('explodeBig', x, y); hooks.shake(x, y, 5);
  for (let i = 0; i < 4; i++) G.effects.push({ type: 'expl', x: x + (Math.random() - 0.5) * b.w * CELL * 0.6, y: y - 4 + (Math.random() - 0.5) * b.h * CELL * 0.6, size: 18 + Math.random() * 8, t: -i * 0.08, life: 0.7, seed: (Math.random() * 1e6) | 0 });
  // What stands close round it (either side's soldiers and vehicles, as a real blast would): measured from the structure's edge.
  for (const e of G.entities) {
    if (!e.alive || e.kind !== 'unit' || isAirborne(e) || e.inHouse) continue;
    const dd = distTo(e, b);
    if (dd < C4_SPLASH) damage(e, C4_DMG * (1 - dd / C4_SPLASH * 0.6), 'HE', by.alive ? by : null, { x, y }, true);
  }
  if (b.alive) kill(b, by, 'HE', { x, y });
}
// Smoke grenades: shot at by an enemy, a Specialist may (SMOKE_CHANCE a hit, once every SMOKE_CD s) throw one a little way
// toward the shooter. The cloud (G.smokes: x, y, r, end; plain data, saved; the host's alone, online copies only see the puffs it
// sends) blocks direct fire through it, into it and out of it (clearShot: lobbed rounds go over; soldiers almost on top of each
// other still see each other). Units that picked a target themselves let it go; ones ordered at it walk round or in.
const SMOKE_CHANCE = 0.3, SMOKE_CD = 25, SMOKE_R = CELL * 1.8, SMOKE_LIFE = 12, SMOKE_NEAR = CELL * 1.1;
function throwSmoke(u, from) {
  u.smokeT = G.t + SMOKE_CD;
  const a = Math.atan2(from.y - u.y, from.x - u.x), k = Math.min(CELL * 2, Math.hypot(from.x - u.x, from.y - u.y) * 0.35);
  const x = u.x + Math.cos(a) * k, y = u.y + Math.sin(a) * k;
  (G.smokes || (G.smokes = [])).push({ x, y, r: SMOKE_R, end: G.t + SMOKE_LIFE, puff: 0 });
  u.fireT = 0.3;
  hooks.sfx('throw', u.x, u.y);
  for (let i = 0; i < 30; i++) smokePuff(x, y, SMOKE_R * 0.85, 1);
}
function smokePuff(x, y, r, grow) {
  const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
  G.effects.push({ type: 'smoke', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.8, r: 8 + Math.random() * 3 * grow, t: -Math.random() * 0.3, life: 3 + Math.random() * 1.4,
    alpha: 0.95, color: Math.random() < 0.5 ? '#c9c7c0' : '#9a968c', vx: (Math.random() - 0.5) * 3, vy: -1.5 - Math.random() * 1.5, drag: 0.4 });
}
function updateSmokes(dt) {
  G.smokes = G.smokes.filter((s) => s.end > G.t);
  for (const s of G.smokes) {
    const left = s.end - G.t;
    if ((s.puff -= dt) <= 0) { s.puff = left < 2 ? 0.15 : 0.035; smokePuff(s.x, s.y, s.r, 1); }
  }
}
// Is the line between a and t in smoke? From or to an aircraft, only if the one on the ground is inside a cloud.
function smokeBlocks(a, t) {
  const air = (a.kind === 'unit' && isAirborne(a)) || (t.kind === 'unit' && isAirborne(t));
  let tx = t.x, ty = t.y;
  if (t.kind === 'bld' || t.kind === 'span' || t.kind === 'house') {
    tx = Math.max(t.cx * CELL + 1, Math.min((t.cx + t.w) * CELL - 1, a.x)); ty = Math.max(t.cy * CELL + 1, Math.min((t.cy + t.h) * CELL - 1, a.y));
  }
  const dx = tx - a.x, dy = ty - a.y, L2 = dx * dx + dy * dy;
  if (L2 < SMOKE_NEAR * SMOKE_NEAR) return false;
  for (const s of G.smokes) {
    if (s.end <= G.t) continue;
    if (air) {
      const g = a.kind === 'unit' && isAirborne(a) ? { x: tx, y: ty } : a;
      if (Math.hypot(g.x - s.x, g.y - s.y) < s.r) return true;
      continue;
    }
    const k = Math.max(0, Math.min(1, ((s.x - a.x) * dx + (s.y - a.y) * dy) / L2));
    if (Math.hypot(a.x + dx * k - s.x, a.y + dy * k - s.y) < s.r) return true;
  }
  return false;
}

// Flame tower fireball: a burst of fire that splashes and leaves flames burning for a moment.
function fireBlast(p, x, y) {
  const w = p.w, from = p.from || null;
  hooks.sfx('fireHit', x, y);
  G.effects.push({ type: 'expl', x, y: y - 3, size: 9, t: 0, life: 0.45, seed: (Math.random() * 1e6) | 0 });
  for (let i = 0; i < 5; i++) G.effects.push({ type: 'fire', x: x + (Math.random() - 0.5) * 18, y: y + (Math.random() - 0.5) * 12, t: -i * 0.05, life: 1.2 + Math.random() * 1.2 });
  scorch(G.tctx, x, y, 8, (Math.random() * 1e6) | 0);
  for (const e of G.entities) {
    if (!e.alive || !hostile(e.team, p.team) || isAirborne(e)) continue;
    const d = distTo({ x, y }, e);
    if (d < w.splash) damage(e, w.dmg * (1 - d / w.splash * 0.5), w.wh, from, { x, y }, true);
  }
  houseBlast(x, y, w.splash, w.dmg, w.wh, from);
}

function grenadeBlast(p) {
  const { tx: x, ty: y, w } = p;
  hooks.sfx('hitMed', x, y);
  G.effects.push({ type: 'expl', x, y: y - 3, size: 9, t: 0, life: 0.5, seed: (Math.random() * 1e6) | 0, debris: true });
  scorch(G.tctx, x, y, 7, (Math.random() * 1e6) | 0);
  craterAt(x, y, 4);
  const from = p.from || null;
  for (const e of G.entities) {
    if (!e.alive || !hostile(e.team, p.team) || isAirborne(e)) continue;
    const d = distTo({ x, y }, e);
    if (d < w.splash) damage(e, w.dmg * (1 - d / w.splash * 0.6), w.wh, from, { x, y }, true);
  }
  houseBlast(x, y, w.splash, w.dmg, w.wh, from);
}

// An artillery shell or V2 rocket coming down: a big blast that hurts everything around it.
function lobBlast(p) {
  const { tx: x, ty: y, w } = p, v2 = p.style === 'v2';
  hooks.sfx(v2 ? 'explodeVeh' : 'hitMed', x, y);
  G.effects.push({ type: 'expl', x, y: y - 4, size: v2 ? 18 : 11, t: 0, life: v2 ? 0.9 : 0.6, seed: (Math.random() * 1e6) | 0, debris: true });
  if (v2) hooks.shake(x, y, 2.5);
  scorch(G.tctx, x, y, v2 ? 13 : 8, (Math.random() * 1e6) | 0);
  craterAt(x, y, v2 ? 9 : 5);
  const from = p.from || null;
  for (const e of G.entities) {
    if (!e.alive || !hostile(e.team, p.team) || isAirborne(e)) continue;
    const d = distTo({ x, y }, e);
    if (d < w.splash) damage(e, w.dmg * (1 - d / w.splash * (v2 ? V2_FALLOFF : 0.65)), w.wh, from, { x, y }, true);
  }
  houseBlast(x, y, w.splash, w.dmg, w.wh, from);
}
// How much of a V2's damage is lost at the edge of its blast (artillery: 0.65). A direct hit is full damage.
const V2_FALLOFF = 0.85;   // 2026.11.05.3: was 0.65 (35% at the edge, now 15%)
function bombBlast(p) {
  const { tx: x, ty: y, w } = p;
  hooks.sfx('explodeVeh', x, y);
  G.effects.push({ type: 'expl', x, y: y - 4, size: 13, t: 0, life: 0.7, seed: (Math.random() * 1e6) | 0, debris: true });
  scorch(G.tctx, x, y, 11, (Math.random() * 1e6) | 0);
  craterAt(x, y, 8);
  for (const e of G.entities) {
    if (!e.alive || !hostile(e.team, p.team) || isAirborne(e)) continue;
    const d = distTo({ x, y }, e);
    if (d < w.splash) damage(e, w.dmg * (1 - d / w.splash * 0.5), w.wh, p.from || null, { x, y }, true);
  }
  houseBlast(x, y, w.splash, w.dmg, w.wh, p.from || null);
}

// Craters only on open ground: not in water or under a structure.
function craterAt(x, y, rad) {
  const c = cellOfPos(x, y);
  if (G.terr[c] >= 4 || G.bld[c]) return;
  const dig = rad >= DIG_MIN && !!G.hgt;   // heavy blasts dig the ground (digCrater); the flag tells an online guest's copy to dig too
  crater(G.tctx, x, y, rad, (Math.random() * 1e6) | 0, dig ? 1 : 0);
  if (dig) digCrater(x, y, rad);
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
    if ((fx.smokeT -= dt) <= 0) { fx.smokeT = 0.05; G.effects.push({ type: 'smoke', x: fx.x, y: fx.y, lift: fx.z, r: 2 + r(), t: 0, life: 1.1, alpha: 0.5, color: '#3a3631', vy: -6 }); }
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

// How a vehicle comes apart (looks only, both modes; owner, 2026-11-25: "rangers have their tires launched around and the
// driver and gunner die like physics infantry"). Wheeled vehicles lose some of their wheels, which fly off tumbling, bounce,
// roll away on their rims and fall over (updateWheel); tracked ones throw a road wheel or two and a length of track (more when
// they cook off). Plates of the hull fly in the side's colour. The crew who sat in the open are thrown out as ragdolls:
// the Ranger's driver and gunner (one fewer when a crewman got out alive, crewBailOut), a truck's driver now and then, a
// tank's commander from his hatch sometimes. The wreck stays where it was (bakeWreck).
// r: wheel radius (px), at: wheel places [forward, side], n: [fewest, most] thrown; crew: [forward, side, seat height, chance].
const VEH_DEATH = {
  jeep: { r: 2.5, at: [[5.5, -5], [5.5, 5], [-5.5, -5], [-5.5, 5]], n: [2, 4], crew: [[1.5, -2, 5, 1], [-2, 1.5, 8, 1]] },
  harv: { r: 3.4, at: [[6, -6], [6, 6], [-6, -6], [-6, 6]], n: [1, 3], crew: [[6, -2, 7, 0.45]] },
  v2: { r: 2.4, at: [[7, -5], [7, 5], [-3, -5], [-3, 5], [-8, -5], [-8, 5]], n: [1, 3], crew: [[8, -2, 6, 0.45]] },
  fob: { r: 2.5, at: [[8, -5], [8, 5], [-2, -5], [-2, 5], [-8, -5], [-8, 5]], n: [1, 3], crew: [[9, -2, 6, 0.45]] },
  mcv: { r: 2.6, at: [[10, -6], [10, 6], [0, -6], [0, 6], [-10, -6], [-10, 6]], n: [1, 3], crew: [[11, -2, 7, 0.45]] },
  btr: { r: 2.7, at: [[8, -5], [8, 5], [3, -5], [3, 5], [-3, -5], [-3, 5], [-8, -5], [-8, 5]], n: [1, 3] },
  tracked: { r: 1.5, at: [[5, -5], [5, 5], [0, -5], [0, 5], [-5, -5], [-5, 5]], n: [0, 2], track: true },
  tank: { r: 1.5, at: [[5, -5], [5, 5], [0, -5], [0, 5], [-5, -5], [-5, 5]], n: [0, 2], track: true, crew: [[-1, -1.5, 10, 0.3]] },
};
function vehicleDeath(e, wh, from, cook, bailed) {
  const d = e.def, r = Math.random;
  const spec = d.draw === 'jeep' || d.draw === 'harv' || d.draw === 'v2' || d.draw === 'fob' || d.draw === 'mcv' ? VEH_DEATH[d.draw]
    : e.type === 'btr' ? VEH_DEATH.btr : d.draw === 'tank' ? VEH_DEATH.tank : VEH_DEATH.tracked;
  const big = spec.track && d.size && d.size.len ? Math.max(0.9, Math.min(1.6, d.size.len / 17)) : 1, ca = Math.cos(e.face), sa = Math.sin(e.face);
  const away = from && (from.x !== e.x || from.y !== e.y) ? Math.atan2(e.y - from.y, e.x - from.x) : r() * Math.PI * 2;
  const at = (f, sd) => [e.x + (f * ca - sd * sa) * big, e.y + (f * sa + sd * ca) * big];
  // Wheels: a random few of its own, from where they were on the hull.
  const places = spec.at.slice().sort(() => r() - 0.5), n = Math.min(places.length, spec.n[0] + Math.floor(r() * (spec.n[1] - spec.n[0] + 1)) + (cook && spec.track ? 2 : 0));
  for (let i = 0; i < n; i++) {
    const [f, sd] = places[i % places.length], [x, y] = at(f, sd);
    const out = Math.atan2(y - e.y, x - e.x), a = (r() < 0.6 ? out : away) + (r() - 0.5) * 0.9, sp = 30 + r() * 60 + (cook ? 30 : 0);
    G.effects.push({ type: 'wheel', x, y, z: spec.r * big + 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 70 + r() * 110 + (cook ? 60 : 0),
      r: spec.r * Math.min(1.3, big), hd: e.face, lean: 0, leanV: (r() - 0.5) * 18, yawV: (r() - 0.5) * 10, roll: 0, rolling: false, flat: false,
      burn: r() < 0.4 ? 2 + r() * 4 : 0, smokeT: 0, t: 0, life: 16 + r() * 6 });
  }
  // A length of track flung off a tracked hull.
  if (spec.track) for (let i = 0, m = (cook ? 2 : 0) + (r() < 0.6 ? 1 : 0); i < m; i++) {
    const a = away + (r() - 0.5) * 2, sp = 25 + r() * 50;
    G.effects.push({ type: 'frag', x: e.x + (r() - 0.5) * 8, y: e.y + (r() - 0.5) * 6, alt: 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: -40 - r() * 50,
      rot: r() * 6, spin: (r() - 0.5) * 14, w: 6 + r() * 4, h: 1.6, color: '#2a2925', burning: false, t: 0, life: 14, smokeT: 0 });
  }
  // Plates of the hull: hatches, mudguards, panels, in the side's colour or bare steel.
  const pal = FACTIONS[e.faction].pal;
  for (let i = 0, m = 2 + Math.floor(r() * 3) + (cook ? 2 : 0); i < m; i++) {
    const a = r() * Math.PI * 2, sp = 20 + r() * 60;
    G.effects.push({ type: 'frag', x: e.x, y: e.y, alt: 4 + r() * 4, vx: Math.cos(a) * sp + Math.cos(away) * 20, vy: Math.sin(a) * sp + Math.sin(away) * 20, vz: -50 - r() * 80,
      rot: r() * 6, spin: (r() - 0.5) * 24, w: 2.5 + r() * 3, h: 1.5 + r() * 2, color: r() < 0.65 ? pal.main || '#555' : r() < 0.5 ? pal.dark || '#3b3a36' : '#3b3a36',
      burning: r() < 0.3, t: 0, life: 10, smokeT: 0 });
  }
  // The crew out in the open, thrown out by the blast. (A crewman who got out alive takes one place.)
  if (!spec.crew || cook) return;
  let left = bailed ? 1 : 0, cried = false;
  for (const [f, sd, z, ch] of spec.crew) {
    if (left > 0) { left--; continue; }
    if (r() >= ch) continue;
    const [x, y] = at(f, sd);
    ragdoll({ ...e, type: 'rifle', x, y, face: e.face + (r() - 0.5) }, 'HE', from || e, { lift: z * big, burn: 0.25, quiet: cried });
    cried = true;
  }
}
// A wheel torn off: it tumbles through the air (its axle turning end over end and swinging round), bounces, then, landing on
// its tread, rolls away on it, wobbling more as it slows, and falls over flat. Some smoke as the tyre burns.
function updateWheel(fx, dt) {
  const r = Math.random;
  if (fx.burn > 0 && (fx.smokeT -= dt) <= 0) { fx.smokeT = 0.09; fx.burn -= 0.09; G.effects.push({ type: 'smoke', x: fx.x, y: fx.y, lift: fx.z, r: 1.4 + r(), t: 0, life: 1.2, alpha: 0.5, color: '#2c2a27', vy: -8 }); }
  if (fx.flat) return;
  const R = fx.r, rest = () => R * Math.abs(Math.cos(fx.lean)) + 0.6 * Math.abs(Math.sin(fx.lean));
  const moveTo = (nx, ny) => {
    if (nx < 4 || ny < 4 || nx > WORLD - 4 || ny > WORLD - 4 || (!passableAt(nx, ny) && !(G.terr[cellOfPos(Math.max(0, Math.min(WORLD - 1, nx)), Math.max(0, Math.min(WORLD - 1, ny)))] >= 4))) {
      fx.vx *= -0.4; fx.vy *= -0.4; return;   // off a wall, a building, a rock
    }
    fx.x = nx; fx.y = ny;
  };
  if (!fx.rolling) {
    fx.vz -= 420 * dt; fx.z += fx.vz * dt;
    moveTo(fx.x + fx.vx * dt, fx.y + fx.vy * dt);
    fx.lean += fx.leanV * dt; fx.hd += fx.yawV * dt; fx.roll += 12 * dt;
    if (fx.z > rest() || fx.vz > 0) return;
    if (wetAt(fx.x, fx.y)) { waterSplash(fx.x, fx.y, false); fx.t = fx.life; return; }
    fx.z = rest();
    if (fx.vz < -45) {   // bounce
      fx.vz *= -0.42; fx.vx *= 0.75; fx.vy *= 0.75; fx.leanV = fx.leanV * 0.6 + (r() - 0.5) * 8; fx.yawV *= 0.6;
      G.effects.push({ type: 'smoke', x: fx.x, y: fx.y, r: 2, t: 0, life: 0.6, alpha: 0.4, color: '#8a7a62' });
      return;
    }
    // Down for good: on its tread (rolls away) if near upright, else on its side.
    fx.vz = 0;
    const up = Math.abs(Math.cos(fx.lean));
    if (up > 0.6 && Math.hypot(fx.vx, fx.vy) > 12) {
      fx.rolling = true; fx.lean = Math.atan2(Math.sin(fx.lean), Math.abs(Math.cos(fx.lean))) * 0.3; fx.leanV = 0;
      fx.hd = Math.atan2(fx.vy, fx.vx);
    } else fx.rolling = true, fx.vx *= 0.2, fx.vy *= 0.2;
    return;
  }
  // Rolling on its tread: slowed by the ground, steered by its lean, wobbling more as it slows, until it falls over.
  let sp = Math.hypot(fx.vx, fx.vy);
  sp = Math.max(0, sp - 22 * dt);
  const wob = Math.max(0, 1 - sp / 50);
  fx.leanV += (Math.sin(fx.lean) * 9 * (0.3 + wob) + (r() - 0.5) * 4 * wob) * dt;
  fx.lean += fx.leanV * dt;
  fx.hd += Math.sin(fx.lean) * 1.6 * dt * (sp > 1 ? 1 : 0);   // a leaning wheel turns toward its lean
  fx.vx = Math.cos(fx.hd) * sp; fx.vy = Math.sin(fx.hd) * sp;
  fx.roll += sp / R * dt;
  moveTo(fx.x + fx.vx * dt, fx.y + fx.vy * dt);
  if (fx.vx || fx.vy) fx.hd = Math.atan2(fx.vy, fx.vx);
  if (wetAt(fx.x, fx.y)) { waterSplash(fx.x, fx.y, false); fx.t = fx.life; return; }
  if (Math.abs(fx.lean) >= Math.PI / 2) { fx.lean = Math.sign(fx.lean) * Math.PI / 2; fx.flat = true; fx.vx = fx.vy = 0; }
  fx.z = rest();
}

// A wreck smoulders for a while after the flames die down.
function smoulder(x, y, life) { G.effects.push({ type: 'smoulder', x, y, t: 0, life, puffT: 0 }); }

function splash(x, y, rad, dmg, team, skip, attacker) {
  for (const e of G.entities) {
    if (!e.alive || e === skip || !hostile(e.team, team) || e.kind !== 'unit' || isAirborne(e)) continue;
    if (Math.hypot(e.x - x, e.y - y) < rad) damage(e, dmg, 'HE', attacker || null, { x, y }, true);
  }
}

// A flak burst: a flash, then a ragged cloud of black smoke that hangs in the air and drifts.
function flakBurst(x, y, delay, h) {
  G.effects.push({ type: 'flakburst', x, y: y + (h || 0), lift: h || 0, t: -(delay || 0), life: 1.8 + Math.random() * 0.6, seed: (Math.random() * 1e6) | 0, vx: 3 + Math.random() * 3, vy: -2 });
}
// (x, y): where the shot ended, with the target's height h folded into y as aimY does; the burst is drawn h up the
// screen and the marks go on the ground under it.
function impact(kind, x, y, inAir, h) {
  h = h || 0; y += h;
  if (kind === 'flak') {
    flakBurst(x, y - h, 0, h);
    G.effects.push({ type: 'spark', x, y, lift: h, t: 0, life: 0.1 });
  } else {
    hooks.sfx(kind === 'shell' ? 'hitSmall' : 'hitMed', x, y);
    const size = kind === 'shell' ? 6 : 8;
    G.effects.push({ type: 'expl', x, y, lift: h, size, t: 0, life: 0.45, seed: (Math.random() * 1e6) | 0 });
    if (!inAir) {
      if (Math.random() < 0.5) scorch(G.tctx, x, y, size * 0.8, (Math.random() * 1e6) | 0);
      if (kind !== 'shell' || Math.random() < 0.6) craterAt(x + (Math.random() - 0.5) * 3, y + (Math.random() - 0.5) * 3, kind === 'shell' ? 3 : 4.5);
    }
  }
}

// `from`: where the hit came from (a blast centre or the shooter), for how a soldier falls.
// Veterancy (VET in data.js). Only armed units that cost something earn ranks; structures never do.
// A weapon's reach for this unit: longer with each rank (VET.range). Buildings have no rank.
function wRange(u, w) { return w.range * VET.range[u.rank || 0]; }
function gainsRank(u) { return u.kind === 'unit' && u.def.cost > 0 && !u.def.scripted && !u.def.harvester && !!(u.def.weapon || u.def.weapon2 || u.def.gun); }
function promote(u) {
  if (G.remote || !u.alive || !gainsRank(u)) return;
  let r = u.rank || 0;
  while (r < VET.at.length && u.killWorth >= VET.at[r] * u.def.cost) r++;
  if (r === (u.rank || 0)) return;
  u.rank = r;
  G.effects.push({ type: 'ring', x: u.x, y: u.y, lift: u.alt || 0, t: 0, life: 1.2, color: 'rgba(255,214,90,0.95)' });
  notify(G.teams[u.team], 'promo', r >= VET.at.length ? 'Unit promoted to elite' : 'Unit promoted', 12);
}
function vetHeal(u, dt) {   // an elite unit mends itself when it has not been hit for a while
  if (u.hp >= u.maxHp || G.t - u.hitT < VET.healWait) { u.healT = 0; return; }
  u.healT = (u.healT || 0) + dt;
  if (u.healT >= VET.healEvery) { u.healT = 0; u.hp = Math.min(u.maxHp, u.hp + u.maxHp * VET.heal); }
}

// splashed: this soldier was caught in a blast or a splash that hits the house on its own (houseBlast, or the shot at the
// soldier it was aimed at), so a garrisoned soldier passes nothing on to his house. Without it, every soldier inside
// passed the whole blast on and a house of 4 took one grenade 5 times. A Set instead: pass each house on once (events
// with no houseBlast of their own: strafing shells, falling debris, the Flame Tower's jet).
function damage(t, amount, wh, attacker, from, splashed) {
  if (!t.alive || G.remote) return;
  if (t.kind === 'spot') {   // a point on the ground: only a wall or gate standing there is hurt
    if (t.wall !== undefined) { if (G.wall[t.wall]) hitWall(t.wall, amount * (WARHEADS[wh].bld || 0)); if (!G.wall[t.wall]) t.alive = false; }
    return;
  }   // (a PvP guest's copy only shows the host's battle)
  if (t.inHouse) {   // a soldier in a house: the house takes the hit, he only a share of it
    const relay = !splashed || (splashed instanceof Set && !splashed.has(t.inHouse) && splashed.add(t.inHouse));
    if (t.inHouse.alive && relay) damage(t.inHouse, amount, wh, attacker, from);
    amount *= GARRISON_COVER;
    if (!t.alive) return;
  }
  if (t.kind === 'bld' && t.def.camo && !(attacker && alliedSides(attacker.team, t.team))) t.revealT = CAMO_REVEAL;   // being hit gives it away
  // As in Red Alert: whoever fires at a support plane (Spy Plane, Paratroopers transport, bomber)
  // gives away where it stands, to either side.
  if (t.def && t.def.scripted && attacker && hostile(attacker.team, t.team)) revealCircle(attacker.x / CELL, attacker.y / CELL, 2.5, G.fog[t.team]);
  const armor = armorOf(t);
  const mult = WARHEADS[wh][armor];
  if (!mult) return;
  if (t.kind === 'span') {   // a bridge span: no side, no alarms
    t.hp -= amount * mult * (0.9 + Math.random() * 0.2); t.hitT = G.t;
    if (t.hp <= 0) breakSpan(t, attacker);
    return;
  }
  if (t.kind === 'house') {   // a village house: neutral, no alarms
    t.hp -= amount * mult * (0.9 + Math.random() * 0.2); t.hitT = G.t;
    if (t.hp <= 0) collapseHouse(t);
    return;
  }
  if (attacker && attacker.rank) amount *= VET.fire[attacker.rank];
  if (t.rank) amount *= VET.armor[t.rank];
  // As in Red Alert: infantry under fire go prone and stay down (crawling if they have to move)
  // until they have not been hit for a while. Prone, they take PRONE_COVER of the damage.
  let cover = 1;
  if (t.kind === 'unit' && t.cls === 'inf' && t.def.setup) { if (t.setup >= 1) cover = PRONE_COVER; }   // an MG Team never goes prone: dug in behind its gun once it is set up
  else if (t.kind === 'unit' && t.cls === 'inf' && !t.chute) {
    t.stance = 'prone';
    t.stanceUntil = G.t + PRONE_TIME;
    cover = PRONE_COVER;
  }
  if (t.kind === 'unit' && t.cls === 'inf' && !t.inHouse) { const src = attacker || from; if (src && sandbagCover(t, src.x, src.y)) cover *= SANDBAG_COVER; }   // dug in behind friendly sandbags
  t.hp -= amount * mult * cover * (0.9 + Math.random() * 0.2);
  t.hitT = G.t;
  const team = teamOf(t);
  if (attacker) {
    if (t.kind === 'bld') notify(team, 'base', 'Our base is under attack', 15);
    else if (t.def.harvester) notify(team, 'harv', 'Ore Truck under attack', 15);
  }
  // Either side: an Ore Truck under fire calls nearby units to its aid.
  if (t.def && t.def.harvester && attacker && attacker.kind === 'unit') team.harvHit = { x: t.x, y: t.y, until: G.t + 8 };
  if (t.def && t.def.harvester && attacker && hostile(attacker.team, t.team)) truckRetreat(t, attacker);
  // A structure shot at from outside the base zone: answer the fire wherever it comes from.
  else if (t.kind === 'bld' && attacker && attacker.kind === 'unit' && !isAirborne(attacker)) team.baseHit = { x: attacker.x, y: attacker.y, until: G.t + 8 };
  if (attacker && attacker.cls === 'air' && !attacker.def.scripted && G.teams[t.team]) { const tm = G.teams[t.team]; tm.airHit = { x: t.x, y: t.y, t: G.t }; tm.sawAir = true; }   // where enemy aircraft strike
  // Shot at while guarding or on the attack: turn on the shooter, wherever it is, unless
  // already trading fire with an enemy unit in range.
  if (attacker && attacker.alive && hostile(attacker.team, t.team) && t.kind === 'unit' && t.alive && t.cls !== 'air' && !t.def.harvester &&
      (t.order.type === 'guard' || t.order.type === 'hunt' || (t.order.type === 'attack' && t.breach && distTo(t, attacker) <= breachReach(t))) && t.target !== attacker && canTarget(t, attacker)) {
    const c = t.target;
    // (its target may have taken off since it was picked, out of reach of every weapon it has)
    const cw = c && (canHit(t.def.weapon, c) ? t.def.weapon : t.def.weapon2 && canHit(t.def.weapon2, c) ? t.def.weapon2 : null);
    const busy = c && c.alive && c.kind === 'unit' && cw && distTo(t, c) <= wRange(t, cw);
    if (!busy) { t.target = attacker; t.avenge = attacker; }
  }
  // Aircraft shot at, parked or flying, turn on the shooter too. A parked one takes off if it has
  // any ammunition, even while waiting on repairs: sitting on a pad under fire only gets it killed.
  // Base defence brings it home once that fight is over; aircraft guarding an area keep to it.
  if (attacker && attacker.alive && hostile(attacker.team, t.team) && t.kind === 'unit' && t.alive && t.cls === 'air' && !t.def.scripted &&
      (t.order.type === 'guard' || t.order.type === 'hunt') && !airEmpty(t) && !t.retreat && canTarget(t, attacker)) {
    const parked = t.as === 'landed';
    if (parked || !(t.target && t.target.alive && t.target.kind === 'unit')) {
      if (t.order.type === 'guard' && !t.order.hold) {
        if (!t.defending) t.post = { x: t.order.x, y: t.order.y, staged: t.staged, pad: !!t.order.pad };
        t.defending = true; t.staged = false;
        setGuard(t, attacker.x, attacker.y);
      }
      if (!(t.target && t.target.alive && t.target.kind === 'unit')) t.target = attacker;
      if (parked) { t.as = 'takeoff'; t.repairHold = false; }
    }
  }
  if (t.hp > 0 && t.kind === 'unit' && t.def.smoke && attacker && attacker.alive && hostile(attacker.team, t.team) && !t.inHouse && !isAirborne(t) &&
      G.t >= (t.smokeT || 0) && Math.random() < SMOKE_CHANCE) throwSmoke(t, attacker);
  if (t.hp <= 0) kill(t, attacker, wh, from || attacker);
}

// The announcer speaks to human sides only: this device's, or the PvP guest's through net.js.
function say(side, msg) {
  if (side === G.me) hooks.eva(msg);
  else if (!G.teams[side].isAI) hooks.evaFor(side, msg);
}
function notify(team, key, msg, cooldown) {
  if (team.isAI) return;
  if (team.cool[key] && G.t < team.cool[key]) return;
  team.cool[key] = G.t + cooldown;
  say(team.id, msg);
}

// A side that is defeated (`out`) loses everything it has left: each unit and building blows up at its own moment over
// the next WIPE_SPREAD seconds (`t.wipe`: [id, time] pairs, plain data so it saves). The blasts leave no survivors and are
// not counted as losses in the debrief.
const WIPE_SPREAD = 5;
let WIPING = false;
function startWipe(t) {
  if (G.remote) return;
  t.wipe = [];
  for (const e of G.entities) if (e.alive && e.team === t.id) t.wipe.push([e.id, G.t + 0.3 + Math.random() * WIPE_SPREAD]);
}
function tickWipe(t) {
  const w = t.wipe, keep = [];
  for (const p of w) {
    const e = G.byId.get(p[0]);
    if (!e || !e.alive) continue;
    if (p[1] > G.t) { keep.push(p); continue; }
    const lost = t.stats.lost, bl = t.stats.bldLost;
    WIPING = true;
    try { kill(e, null); } finally { WIPING = false; }
    t.stats.lost = lost; t.stats.bldLost = bl;
  }
  t.wipe = keep.length ? keep : null;
}
function kill(e, attacker, wh, from) {
  if (e.inHouse) leaveHouse(e);   // (falls in the doorway)
  e.alive = false;
  if (e.flight && e.flight.strike) casLost(e);   // (a Close Air Support plane shot down)
  const team = teamOf(e);
  if (e.cargo && e.cargo.length && e.def.apc && !G.remote && !WIPING) {   // an APC: some of those aboard get out of the wreck
    const n = e.cargo.length, out = apcEscape(e);
    team.stats.lost += n - out;
    if (attacker && hostile(attacker.team, e.team)) G.teams[attacker.team].stats.killed += n - out;
    if (out) say(e.team, out === 1 ? 'A soldier got out of the APC' : out + ' soldiers got out of the APC');
  }
  if (e.cargo && e.cargo.length) {   // a transport shot down: everyone aboard goes with it
    team.stats.lost += e.cargo.length;
    if (attacker && hostile(attacker.team, e.team)) G.teams[attacker.team].stats.killed += e.cargo.length;
    e.cargo = [];
  }
  if (attacker && hostile(attacker.team, e.team)) {
    const st = G.teams[attacker.team].stats;
    if (e.kind === 'unit') st.killed++; else st.bldKilled++;
    if (attacker.kind === 'unit') { attacker.kills = (attacker.kills || 0) + 1; attacker.killWorth = (attacker.killWorth || 0) + (e.def.cost || 0); promote(attacker); }
  }
  if (e.kind === 'unit' && e.def.deploys === 'cy' && team.isAI && typeof aiLog === 'function') aiLog(team, 'mcv lost', { why: aiMcvJob(e) });   // (ai.js: a computer's base moves)
  if (e.kind === 'bld' && e.sellT <= 0) {
    team.stats.bldLost++;
    if (e.type === 'cy' || e.type === 'outpost') logEvent(e.team, e.type + ' lost');
    if (e.type === 'cy') team.cyLostT = G.t;   // a breather before the computers gang up on it again (ai.js aiGangPlan)
    // Jets parked on a destroyed Airfield go with it; those in the air survive (see updateReserves).
    if (e.type === 'airfield' && !G.remote) for (const j of G.entities.filter((u) => u.alive && u.kind === 'unit' && u.home === e.id && u.as === 'landed' && !u.leaving)) kill(j, attacker, wh, from);
  }
  // Owner's rule: a side whose last Tech Center falls (or is sold) loses every upgrade and must research them again.
  if (e.kind === 'bld' && e.type === 'tech' && !G.remote && team.upgrades && Object.keys(team.upgrades).length && !hasBuilt(team, 'tech')) {
    team.upgrades = {};
    notify(team, 'upgrade', 'Upgrades lost', 4);
  }
  if (e.kind === 'unit' && e.def.explodes && !G.remote && !WIPING && !e.inHouse && Math.random() < e.def.explodes) flamerBlast(e, attacker);
  if (e.kind === 'unit' && e.kills) G.log.fallen.push({ team: e.team, type: e.type, faction: e.faction, kills: e.kills, worth: e.killWorth, born: e.born, died: G.t });
  const seed = (Math.random() * 1e6) | 0;
  if (e.kind === 'unit') {
    team.stats.lost++;
    if (e.cls === 'inf' && e.def.setup) {   // the MG Team: both men go down
      const ca = Math.cos(e.face), sa = Math.sin(e.face);
      for (const [f, sd] of [[3, -3], [-6, 6]]) ragdoll({ ...e, type: 'rifle', x: e.x + (f * ca - sd * sa) * INF_SCALE, y: e.y + (f * sa + sd * ca) * INF_SCALE }, wh, from);
    } else if (e.cls === 'inf') {
      ragdoll(e, wh, from);
    } else if (e.cls === 'veh') {
      const cook = e.def.draw === 'tank' && Math.random() < 0.35;   // ammunition cook-off
      hooks.sfx('explodeVeh', e.x, e.y);
      G.effects.push({ type: 'expl', x: e.x, y: e.y - 4, size: 16, t: 0, life: 0.8, seed, debris: true });
      scorch(G.tctx, e.x, e.y, 12, seed);
      craterAt(e.x + Math.cos(e.face) * 6, e.y + Math.sin(e.face) * 6, 5);
      bakeWreck(G.dctx, e.x, e.y, e.def, e.face, e.tface, cook);
      let bailed = false;
      if (cook) cookOff(e, seed);
      else if (!G.remote && Math.random() < CREW_SURVIVES) bailed = !!crewBailOut(e);   // no cook-off: the crew may get out
      vehicleDeath(e, wh, from || attacker, cook, bailed);   // wheels, plates and crew thrown (looks only)
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
        roll: 0, rollV: jet ? side * (0.6 + Math.random() * 1.6) : 0, pitch: 0, bounced: false, ground: false, hit: [], z: (e.alt || 0) + crashGround(e.x, e.y),
        wob: Math.random() * 6, side,
        def: e.def, faction: e.faction, v: teamOf(e).variant | 0, t: 0, life: 40, smokeT: 0, shedT: 0.3, furrowT: 0 });
      for (let i = 0; i < 2; i++) shed(e.x, e.y, e.alt, vx, vy, e.faction, true);
    } else {
      crashLanding(e.x, e.y, e.face, e.def, e.faction, seed);
    }
    notify(team, 'lost', 'Unit lost', 4);
  } else {
    for (let y = e.cy; y < e.cy + e.h; y++) for (let x = e.cx; x < e.cx + e.w; x++) if (G.bld[idx(x, y)] === e.id) G.bld[idx(x, y)] = 0;
    if (e.exitCell !== undefined) G.resv[e.exitCell] = 0;
    // The repair pad is painted into the ground: cover it with worn earth (the host's mark reaches a guest as an event).
    if (e.def.depot && e.exitCell !== undefined && G.tctx && !G.remote) bibDecal(G.tctx, cellX(e.exitCell) * CELL, cellY(e.exitCell) * CELL, CELL, CELL, e.id * 977 + 5);
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
      if (!e.def.defense || e.w * e.h > 1) craterAt(e.x, e.y, 6 + Math.min(4, e.w * e.h * 0.5));   // its fall digs a crater (digCrater)
      notify(team, 'slost', 'Structure lost', 4);
    } else escapeSurvivors(e, true);   // sold: the staff walk out
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
// opt (a crewman thrown from a dying vehicle, vehicleDeath): lift, how high he sat (px); burn, the chance he burns; quiet, no cry.
function ragdoll(e, wh, from, opt) {
  const r = Math.random;
  const a = from && (from.x !== e.x || from.y !== e.y) ? Math.atan2(e.y - from.y, e.x - from.x) : r() * Math.PI * 2;
  const blast = wh === 'HE' || wh === 'GR' || wh === 'AP' || wh === 'ART' || wh === 'AT' || wh === 'HF' || wh === 'TD';
  const fx = { type: 'ragdoll', x: e.x, y: e.y, unitType: e.type, faction: e.faction, v: teamOf(e).variant | 0, face: e.face, t: 0, life: 14, age: 0, still: 0, acc: 0 };
  // Joints in world space, standing as the soldier stood.
  const n = RAG_PTS.length, ca = Math.cos(e.face), sa = Math.sin(e.face);
  const P = new Float32Array(n * 3), V = new Float32Array(n * 3);
  const lift = (opt && opt.lift) || 0;
  RAG_PTS.forEach(([f, sd, z], i) => { f *= INF_SCALE; sd *= INF_SCALE; P[i * 3] = e.x + f * ca - sd * sa; P[i * 3 + 1] = e.y + f * sa + sd * ca; P[i * 3 + 2] = z * INF_SCALE + lift; });
  const dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx;
  const kick = (i, vx, vy, vz) => { V[i * 3] += vx; V[i * 3 + 1] += vy; V[i * 3 + 2] += vz; };
  if (blast) {
    // Thrown up and away, spinning about a random axis.
    const p = 30 + r() * 50, up = 80 + r() * 90;
    const w = [(r() - 0.5) * 2, (r() - 0.5) * 2, (r() - 0.5) * 2], wl = Math.hypot(...w) || 1, ws = 5 + r() * 9;
    for (let i = 0; i < n; i++) {
      const rx = P[i * 3] - e.x, ry = P[i * 3 + 1] - e.y, rz = P[i * 3 + 2] - 8 * INF_SCALE;
      const ox = w[0] / wl * ws, oy = w[1] / wl * ws, oz = w[2] / wl * ws;
      kick(i, dx * p + oy * rz - oz * ry, dy * p * 0.8 + oz * rx - ox * rz, up + ox * ry - oy * rx);
    }
    for (const i of [5, 6, 9, 10]) kick(i, (r() - 0.5) * 70, (r() - 0.5) * 70, (r() - 0.3) * 50);   // arms and legs flailing
    fx.stiff = 0;
    if (opt && r() < (opt.burn || 0)) fx.burnt = true;
  } else if (wh === 'SN') {
    // A sniper's round: the head snaps back and he drops where he stands, the legs folding under him.
    kick(0, dx * 70, dy * 70, 10); kick(1, dx * 20, dy * 20, 0);
    kick(2, 0, 0, -45); kick(7, ca * 22 + (r() - 0.5) * 16, sa * 22 + (r() - 0.5) * 16, 0); kick(8, ca * 18 + (r() - 0.5) * 16, sa * 18 + (r() - 0.5) * 16, 0);
    for (const i of [5, 6]) kick(i, (r() - 0.5) * 30, (r() - 0.5) * 30, 15);   // the arms fly loose
    fx.stiff = 0;
  } else if ((!wh || wh === 'SA' || wh === 'RF' || wh === 'CG') && r() < 0.4) {
    if (r() < 0.55) {
      // Hit, he sinks to his knees, then pitches forward onto his face.
      kick(2, -ca * 6, -sa * 6, -55); kick(7, ca * 30, sa * 30, 0); kick(8, ca * 26, sa * 26, 0);
      for (const i of [0, 1, 3, 4]) kick(i, ca * 22 + dx * 8, sa * 22 + dy * 8, -6);
      for (const i of [5, 6]) kick(i, ca * 10, sa * 10, 18);   // hands to the wound
      fx.stiff = 0;
    } else {
      // Spun round by the hit, arms out, and down on his side.
      const sp = (r() < 0.5 ? -1 : 1) * (90 + r() * 50), p = 25 + r() * 20;
      kick(3, px * sp + dx * p, py * sp + dy * p, 8); kick(4, -px * sp + dx * p, -py * sp + dy * p, 8);
      kick(5, px * sp * 1.6, py * sp * 1.6, 20); kick(6, -px * sp * 1.6, -py * sp * 1.6, 20);
      kick(0, dx * p, dy * p, 0); kick(2, 0, 0, -20);
      fx.stiff = r() < 0.5 ? 0.12 : 0;
    }
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
    if (wh === 'TESLA') { G.effects.push({ type: 'spark', x: e.x, y: e.y, lift: 8 * INF_SCALE, t: 0, life: 0.3 }); fx.burnt = true; fx.shock = 0.5 + r() * 0.3; }
  }
  // The weapon, flung loose from the hands.
  const wl = (e.type === 'rocket' ? 12 : e.type === 'sniper' ? 13 : e.type === 'grenadier' || e.type === 'pilot' || e.type === 'technician' || e.type === 'engineer' ? 0 : 8) * INF_SCALE;
  if (wl) {
    const hx = P[18], hy = P[19], hz = (e.type === 'rocket' ? 15 : 10) * INF_SCALE;
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
  if (!(opt && opt.quiet)) hooks.sfx(blast ? 'dieBlast' : wh === 'FIRE' ? 'dieFire' : 'die', e.x, e.y);
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
  if (fx.shock > 0) { fx.shock -= dt; if (r() < dt * 8) G.effects.push({ type: 'spark', x: fx.x + (r() - 0.5) * 6, y: fx.y, lift: 6 + r() * 6, t: 0, life: 0.15 }); return; }
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
  fx.pool = { t: 0, dur: 2 + r() * 1.5, r: (3 + r() * 2) * INF_SCALE, seed: (r() * 1e6) | 0, a: r() * Math.PI * 2 };
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
  if (!spot) { say(u.team, 'Cannot deploy here'); return null; }
  const team = G.teams[u.team];
  u.alive = false;
  const b = addBuilding(u.def.deploys, team, spot.cx, spot.cy);
  b.hp = Math.max(1, Math.round(b.maxHp * Math.min(1, u.hp / u.maxHp)));   // the damage comes with it: same share of health
  hooks.sfx('place', b.x, b.y); hooks.sfx('build', b.x, b.y);
  updatePower();
  return b;
}

// People get out of a structure as it goes: more from bigger buildings, Rifle Infantry and Technicians (about one in three).
// Sold, they all walk out unhurt; destroyed, there is a SURVIVORS_ESCAPE chance anyone gets out at all, and those who do
// are hurt (25-50% health). Owner's rules, 2026-11-25, both modes.
// A destroyed ground vehicle that did not cook off may leave one rifleman: the crew scrambles out of the
// wreck and stands guard. Made on the host only (a PvP guest gets the unit in a snapshot).
const CREW_SURVIVES = 1 / 3;
function crewBailOut(e) {
  if (WIPING) return;   // a defeated side's wreckage leaves no survivors
  const c = nearestFreeCell(cellOfPos(Math.max(0, Math.min(WORLD - 1, e.x)), Math.max(0, Math.min(WORLD - 1, e.y))), 3);
  if (c < 0) return;
  const p = cellCenter(c), u = addUnit('rifle', G.teams[e.team], p.x, p.y);
  u.face = u.tface = e.face;
  setGuard(u);
  return u;
}
const SURVIVORS_ESCAPE = 0.5, SURVIVOR_TECH = 1 / 3;
function escapeSurvivors(b, sold) {
  if (WIPING || G.remote) return;   // a defeated side's wreckage leaves no survivors; a PvP guest gets them in a snapshot
  if (!sold && Math.random() >= SURVIVORS_ESCAPE) return;
  const team = G.teams[b.team], n = b.type === 'cy' ? 4 : Math.min(3, Math.max(1, Math.round(b.w * b.h / 2)));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const c = nearestFreeCell(cellOfPos(b.x + Math.cos(a) * b.w * CELL * 0.6, b.y + Math.sin(a) * b.h * CELL * 0.6), 4);
    if (c < 0) continue;
    const p = cellCenter(c), u = addUnit(Math.random() < SURVIVOR_TECH ? 'technician' : 'rifle', team, p.x + (Math.random() - 0.5) * 8, p.y + (Math.random() - 0.5) * 8);
    if (!sold) u.hp = Math.max(1, Math.round(u.maxHp * (0.25 + Math.random() * 0.25)));
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
  { const once = new Set(); for (const e of G.entities) if (e.alive && e.kind === 'unit' && !isAirborne(e) && Math.hypot(e.x - x, e.y - y) < 14) damage(e, 30, 'HE', null, null, once); }   // a held house takes it once
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
// A jet that bounces off the ground comes apart (owner: "they need to break into a bunch of pieces"): a blast where it hit, and
// the airframe in pieces carried on by its speed (wings and tail in its colours, the fuselage in sections, engines burning),
// tumbling and bouncing on, with a shower of small bits; it burns and leaves its wreck where it hit (crashLanding).
function breakUp(fx) {
  const main = FACTIONS[fx.faction].pal.main || '#555', dark = '#3b3a36', sp = Math.hypot(fx.vx, fx.vy);
  const fwd = sp > 1 ? Math.atan2(fx.vy, fx.vx) : fx.face, up = Math.max(30, Math.min(90, fx.vz * 0.6 + 25));
  const part = (w, h, color, burning, carry, spread) => {
    const a = fwd + (Math.random() - 0.5) * spread, v = sp * carry * (0.7 + Math.random() * 0.5);
    G.effects.push({ type: 'frag', x: fx.x, y: fx.y, alt: 2 + Math.random() * 3, vx: Math.cos(a) * v + (Math.random() - 0.5) * 30, vy: Math.sin(a) * v + (Math.random() - 0.5) * 30,
      vz: -up * (0.6 + Math.random() * 0.7), rot: Math.random() * 6, spin: (Math.random() - 0.5) * 26, w, h, color, burning, t: 0, life: 12 + Math.random() * 4, smokeT: 0 });
  };
  for (let i = 0; i < 2; i++) part(9 + Math.random() * 3, 3, main, i === 0, 0.7, 1.6);   // the wings
  part(5, 4, main, false, 0.6, 1.2);                                                       // the tail
  for (let i = 0; i < 3; i++) part(6 + Math.random() * 3, 3.5, i ? dark : main, i === 1, 0.85, 0.7);   // fuselage sections
  for (let i = 0; i < 2; i++) part(3.5, 3.5, '#2a2926', true, 0.9, 0.9);                   // engines
  for (let i = 0; i < 12; i++) shed(fx.x, fx.y, 3, fx.vx * 0.9, fx.vy * 0.9, fx.faction, i < 4);
  for (let i = 0; i < 3; i++) G.effects.push({ type: 'expl', x: fx.x + Math.cos(fwd) * i * 8, y: fx.y + Math.sin(fwd) * i * 8 - 3, size: 12 - i * 2, t: -i * 0.1, life: 0.7, seed: (Math.random() * 1e6) | 0, debris: true });
  hooks.shake(fx.x, fx.y, 5);
  fx.t = fx.life; crashLanding(fx.x, fx.y, fx.face, fx.def, fx.faction, (Math.random() * 1e6) | 0);
}
// (Named apart from splash(), the blast damage: with one name, this replaced it.)
function waterSplash(x, y, big) {
  hooks.sfx('splash', x, y);
  for (let i = 0; i < (big ? 9 : 3); i++) G.effects.push({ type: 'smoke', x: x + (Math.random() - 0.5) * (big ? 16 : 5), y: y + (Math.random() - 0.5) * 6, r: big ? 4 : 2, t: -i * 0.03, life: 1.1, alpha: 0.75, color: '#dfe8ec', vy: -(big ? 30 : 14) * Math.random(), vx: 0 });
  if (big) G.effects.push({ type: 'ring', x, y, t: 0, life: 1.4, color: 'rgba(225,238,245,0.85)' });
}
// Crashes (looks only: where it comes down and what it hits stay as before). The airframe keeps a real attitude: pitch (nose
// down positive) and roll, drawn by turning its model (models.js tiltSprite). fx.z: its height on the drawn ground's scale (view
// px, look.js gLift), so it comes down on a hillside where the hill is and not at the height it would have over flat ground;
// fx.alt is what that leaves above the ground under it (what the drawing lifts it by).
// Jet: the wing loses lift slowly, the nose follows the flight path down, it banks into a spiral (a roll turns the flight path).
//   Comes in steep (CRASH_STEEP): nose-in, a deep crater, the end. Shallow, a wing tip first at speed: cartwheels (spins round,
//   sheds the wing, bounces once). Otherwise bounces once if hard, then skids on its belly or back, slowed by the ground and pulled
//   down any slope, and burns where it stops.
// Helicopter: the tail rotor gone, it spins up round its mast; the main rotor still turning holds the fall to CRASH_HELI_VZ
//   (autorotation), and it wallows (pitch and roll swing wider as it falls). On the ground it rolls onto its side as the blades
//   break off, then burns.
const CRASH_STEEP = 0.9, CRASH_HELI_VZ = 38, CRASH_TIP = 0.55;
const crashGround = (x, y) => (typeof gLift === 'function' ? gLift(x, y, true) : 0);
function crashSlope(x, y) {   // the drawn ground's fall (view px per px) toward +x and +y
  const e = 6;
  return [(crashGround(x + e, y) - crashGround(x - e, y)) / (2 * e), (crashGround(x, y + e) - crashGround(x, y - e)) / (2 * e)];
}
function updateCrash(fx, dt) {
  if (fx.z === undefined) fx.z = fx.alt + crashGround(fx.x, fx.y);   // (an older save's crash)
  if (fx.pitch === undefined) fx.pitch = 0;
  const sp = Math.hypot(fx.vx, fx.vy);
  if (fx.tip !== undefined) {   // a helicopter down, going over onto its side
    fx.tip += dt;
    fx.roll += (fx.tipTo - fx.roll) * Math.min(1, dt * 7); fx.pitch *= Math.exp(-4 * dt);
    if (fx.tip > 0.55) { fx.t = fx.life; crashLanding(fx.x, fx.y, fx.face, fx.def, fx.faction, (Math.random() * 1e6) | 0); }
    return;
  }
  if (!fx.ground) {
    if (fx.jet) {
      fx.vz += 60 * Math.min(1, 0.3 + fx.t * 0.45) * dt;   // the wings stop lifting
      const drag = Math.exp(-0.25 * dt); fx.vx *= drag; fx.vy *= drag;
      fx.rollV *= Math.exp(-0.15 * dt); fx.roll += fx.rollV * dt;
      if (fx.cart) fx.face += fx.spin * dt;   // cartwheeling off its wing tip
      else {
        const turn = Math.sin(fx.roll) * 0.7 * dt, c = Math.cos(turn), s = Math.sin(turn);   // banked: the flight path turns
        [fx.vx, fx.vy] = [fx.vx * c - fx.vy * s, fx.vx * s + fx.vy * c];
        fx.face = Math.atan2(fx.vy, fx.vx);
      }
      const path = Math.atan2(fx.vz, Math.hypot(fx.vx, fx.vy));
      fx.pitch += (path - fx.pitch) * Math.min(1, dt * 2.5);
    } else {
      fx.vz += (60 - fx.vz * (60 / CRASH_HELI_VZ)) * dt;   // the rotor still turning holds it to CRASH_HELI_VZ
      const drag = Math.exp(-0.9 * dt); fx.vx *= drag; fx.vy *= drag;
      fx.spin += fx.spinUp * dt; fx.spin = Math.max(-9, Math.min(9, fx.spin));
      fx.face += fx.spin * dt;
      const w = Math.min(1, 0.25 + fx.t * 0.35);
      fx.pitch = 0.35 * w * Math.sin(fx.t * 2.7 + fx.wob); fx.roll = 0.45 * w * Math.sin(fx.t * 2.1 + fx.wob * 1.7);
    }
    fx.x += fx.vx * dt; fx.y += fx.vy * dt; fx.z -= fx.vz * dt;
    const gz = crashGround(fx.x, fx.y);
    fx.alt = fx.z - gz;
    if ((fx.smokeT -= dt) <= 0) { fx.smokeT = 0.04; G.effects.push({ type: 'smoke', x: fx.x, y: fx.y - fx.alt, r: 2.5 + fx.t * 0.6, t: 0, life: 1.4, alpha: 0.6, color: '#3a3733' }); }
    if ((fx.shedT -= dt) <= 0) { fx.shedT = 0.35 + Math.random() * 0.5; shed(fx.x, fx.y, fx.alt, fx.vx, fx.vy, fx.faction, Math.random() < 0.5); }
    if (fx.alt > 0) return;
    fx.alt = 0; fx.z = gz;
    if (wetAt(fx.x, fx.y)) { waterSplash(fx.x, fx.y, true); fx.t = fx.life; return; }
    const seed = (Math.random() * 1e6) | 0;
    if (!fx.jet) {   // rotor blades break away; it goes over onto its side, then burns where it fell
      for (let i = 0; i < 4; i++) shed(fx.x, fx.y, 6, fx.vx, fx.vy, fx.faction, false, true);
      hooks.sfx('explodeVeh', fx.x, fx.y); hooks.shake(fx.x, fx.y, 2);
      fx.tip = 0; fx.tipTo = (Math.sin(fx.roll) < 0 ? -1 : fx.roll > 0 ? 1 : fx.side || 1) * Math.PI / 2; fx.vz = 0;
      return;
    }
    const angle = Math.atan2(fx.vz, sp);
    hooks.sfx('explodeVeh', fx.x, fx.y); hooks.shake(fx.x, fx.y, angle > CRASH_STEEP ? 6 : 4);
    G.effects.push({ type: 'expl', x: fx.x, y: fx.y - 3, size: angle > CRASH_STEEP ? 18 : 11, t: 0, life: 0.7, seed, debris: true });
    { const once = new Set(); for (const e of G.entities) if (e.alive && e.kind === 'unit' && !isAirborne(e) && Math.hypot(e.x - fx.x, e.y - fx.y) < 12) damage(e, 20, 'HE', null, null, once); }   // a held house takes it once
    if (angle > CRASH_STEEP) {   // nose-in: buried where it hit
      for (let i = 0; i < 6; i++) shed(fx.x, fx.y, 3, fx.vx * 0.3, fx.vy * 0.3, fx.faction, i < 2);
      fx.t = fx.life; crashLanding(fx.x, fx.y, fx.face, fx.def, fx.faction, seed); craterAt(fx.x, fx.y, 11);
      return;
    }
    for (let i = 0; i < 3; i++) shed(fx.x, fx.y, 2, fx.vx, fx.vy, fx.faction, i === 0);
    // Would bounce (a wing tip digging in at speed, or a hard landing): it breaks up instead.
    if (!fx.bounced && ((sp > 60 && Math.abs(Math.sin(fx.roll)) > CRASH_TIP) || (sp > 45 && fx.vz > 25))) { breakUp(fx); return; }
    fx.ground = true; fx.vz = 0; fx.rollV = 0; fx.pitch = 0;
    fx.roll = Math.round(fx.roll / Math.PI) * Math.PI;   // settles on its belly or its back
    return;
  }
  // Skidding along the ground: friction, and pulled down any slope.
  const [gx, gy] = crashSlope(fx.x, fx.y);
  fx.vx -= gx * 160 * dt; fx.vy -= gy * 160 * dt;
  const sp2 = Math.hypot(fx.vx, fx.vy), f = Math.max(0, sp2 - 70 * dt) / (sp2 || 1);
  fx.vx *= f; fx.vy *= f; fx.spin *= Math.exp(-2.5 * dt);
  fx.face += (fx.cart ? fx.spin : fx.spin * 0.3) * dt;
  const nx = fx.x + fx.vx * dt, ny = fx.y + fx.vy * dt;
  if (wetAt(nx, ny)) { waterSplash(nx, ny, true); fx.t = fx.life; return; }
  const c = cellOfPos(Math.max(0, Math.min(WORLD - 1, nx)), Math.max(0, Math.min(WORLD - 1, ny))), b = G.bld[c] && G.byId.get(G.bld[c]);
  const blocked = !passableAt(nx, ny);
  if (b && b.alive) damage(b, 60, 'HE', null);
  if (!blocked) { fx.x = nx; fx.y = ny; }
  fx.z = crashGround(fx.x, fx.y); fx.alt = 0;
  if ((fx.furrowT -= dt) <= 0) {
    fx.furrowT = 0.06;
    scorch(G.tctx, fx.x, fx.y, 2.2, (Math.random() * 1e6) | 0);
    G.effects.push({ type: 'smoke', x: fx.x - fx.vx * 0.05, y: fx.y, r: 3, t: 0, life: 0.9, alpha: 0.5, color: '#7a6a52', vy: -8, vx: 0 });
    if (Math.random() < 0.25) shed(fx.x, fx.y, 1, fx.vx * 0.5, fx.vy * 0.5, fx.faction, false);
  }
  for (const e of G.entities) if (e.alive && e.kind === 'unit' && !isAirborne(e) && !fx.hit.includes(e.id) && Math.hypot(e.x - fx.x, e.y - fx.y) < 10) { fx.hit.push(e.id); damage(e, 35, 'HE', null, null, !!e.inHouse && fx.hit.some((id) => id !== e.id && G.byId.get(id) && G.byId.get(id).inHouse === e.inHouse)); }
  if (blocked || Math.hypot(fx.vx, fx.vy) < 6) { fx.t = fx.life; crashLanding(fx.x, fx.y, fx.face, fx.def, fx.faction, (Math.random() * 1e6) | 0); }
}
function updateFrag(fx, dt) {
  if (fx.alt > 0 || fx.vz < 0) {
    fx.vz += 70 * dt; fx.alt -= fx.vz * dt;
    if (fx.alt <= 0) {
      fx.alt = 0;
      if (wetAt(fx.x, fx.y)) { waterSplash(fx.x, fx.y, false); fx.t = fx.life; return; }
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
    team: e.team, faction: e.faction, v: teamOf(e).variant | 0, t: 0, life: 0.85, smokeT: 0 });
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
  if (WIPING) return;   // a defeated side's wreckage leaves no survivors
  if (G.remote) return;   // a PvP guest's copy runs the effect but never makes units: the host's pilot arrives in a snapshot
  // Over water the pilot still parachutes down (landChute drowns it); anywhere else it needs open ground nearby.
  const over = cellOfPos(Math.max(0, Math.min(WORLD - 1, e.x)), Math.max(0, Math.min(WORLD - 1, e.y)));
  const c = wetAt(e.x, e.y) ? over : nearestFreeCell(over, 4);
  if (c < 0) return;
  const team = G.teams[e.team], p = cellCenter(c);
  const u = addUnit('pilot', team, p.x, p.y);
  u.chute = (e.alt || 30) / 26 + 0.3;
  u.x = e.x; u.y = e.y;   // drifts down where it bailed out, stepping clear on landing
  u.homeward = true;
  if (!pilotHome(u)) { u.homeward = false; if (team.auto) setHunt(u); else setGuard(u); }
}
// Down in trees, water or on a roof: walk out to the nearest open ground, and set off from there.
// An ejected pilot that comes down on water drowns instead: no swimming to the nearest shore.
function landChute(u) {
  u.chute = 0;   // exactly 0: checks for "on the ground" test !u.chute, and the countdown overshoots below 0
  if (u.type === 'pilot' && wetAt(u.x, u.y)) { u.alive = false; waterSplash(u.x, u.y, false); return; }
  const c = cellOfPos(Math.max(0, Math.min(WORLD - 1, u.x)), Math.max(0, Math.min(WORLD - 1, u.y)));
  if (!freeCell(c)) {
    const n = nearestFreeCell(c, 8);
    if (n < 0 && wetAt(u.x, u.y)) { u.alive = false; waterSplash(u.x, u.y, false); return; }   // too far out to swim
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
  say(team.id, 'Pilot recovered');
  return true;
}

// ---------------------------------------------------------------------------
// Unit behaviour
// ---------------------------------------------------------------------------
function updateUnit(u, dt) {
  u.cd = Math.max(0, u.cd - dt); u.cd2 = Math.max(0, u.cd2 - dt); u.fireT = Math.max(0, u.fireT - dt);
  if (u.twinNext && G.t >= u.twinNext) {   // the second barrel of a staggered twin gun
    const t = u.twinTarget;
    u.twinNext = 0; u.twinTarget = null;
    if (t && t.alive) fireWeapon(u, u.def.weapon, t, true);
  }
  if (u.rank >= VET.at.length) vetHeal(u, dt);
  if (u.burnT > 0) { tickBurn(u, dt); if (!u.alive) return; }
  if (u.stance && G.t > u.stanceUntil) u.stance = null;   // quiet for a while: back on their feet
  u.moving = false;
  tickBurst(u, dt);
  tickStrafe(u, dt);
  if (u.cls === 'air' && u.def.fly === 'jet') { jetAbove(u, () => (u.def.scripted ? updateFlight(u, dt) : updateAir(u, dt))); return; }
  if (u.def.scripted) { updateFlight(u, dt); return; }
  if (u.chute > 0) { u.chute -= dt; if (u.chute <= 0) landChute(u); return; }
  if (u.cls === 'air') { updateAir(u, dt); return; }
  if (u.order.type === 'repair') { updateRepairOrder(u, dt); followPath(u, dt); checkStuck(u, dt); return; }
  if (u.order.type === 'engineer') { updateEngineer(u, dt); if (u.alive) { followPath(u, dt); checkStuck(u, dt); } return; }
  if (u.inHouse) {   // garrisoned (village houses): fires from the windows until given another order
    if (u.order.type === 'garrison' && u.order.target === u.inHouse) { updateGarrison(u, dt); return; }
    const d = u.dest; leaveHouse(u);
    if (d) goTo(u, d.x, d.y, true);
  }
  if (u.unload) updateUnload(u, dt);
  if (u.order.type === 'board') { updateBoard(u); if (u.alive) { followPath(u, dt); checkStuck(u, dt); } return; }
  if (u.order.type === 'garrison') { updateEnterHouse(u); if (u.alive && !u.inHouse) { followPath(u, dt); checkStuck(u, dt); } return; }
  u.repairing = false;
  if (u.def.harvester) { updateHarvester(u, dt); followPath(u, dt); checkStuck(u, dt); return; }

  const o = u.order, w = u.def.weapon, sight = u.def.sight * CELL;
  if (u.target && (!u.target.alive || !canTarget(u, u.target))) u.target = null;
  u.think -= dt;
  if (u.think <= 0) {
    u.think = 0.35 + Math.random() * 0.2;
    if (u.rehunt && G.t > u.rehunt) { u.rehunt = 0; if (o.type === 'guard' && !o.hold) setHunt(u); }
    if (o.type === 'attack') {
      if (!o.target.alive) setGuard(u);
      else if (u.breach) {
        // Shooting a way through a wall (breachWalls): anything hostile within reach of its guns comes first, defences and
        // structures included; the wall only when nothing else is. Before, a group sent at a wall drove past guns and buildings
        // that were shooting it, round to the piece it had been given. Only what is in reach: whatever stands behind the wall
        // (the base it is breaking into) would have it driving round looking for a way in again.
        const reach = breachReach(u);
        if (u.target && u.target !== o.target && distTo(u, u.target) > reach) u.target = null;
        if (!u.target || u.target === o.target || u.target.kind === 'bld') {
          const t = acquire(u, reach, [w, u.def.weapon2]);
          if (t && (!u.target || u.target === o.target || t.kind === 'unit')) u.target = t;
        }
        if (!u.target) u.target = o.target;
      } else u.target = o.target;
    } else if (o.type !== 'move') {
      // Whoever fired on this unit is chased a little past its own reach; anything else is
      // dropped once out of sight.
      // Long-range guns guarding an area fire at whatever their side has in view within reach.
      const far = o.type === 'guard' && o.hold && !o.amove && w && wRange(u, w) > sight;
      const spot = !far && spotter(u);   // (Artillery, V2: whatever its side sees in reach)
      const avenging = u.target && u.target === u.avenge;
      const spotted = spot && u.target && distTo(u, u.target) <= wRange(u, w) && spottedBy(u.team)(u.target);
      const reach = avenging ? Math.max(sight * 1.5, ((u.target.def.weapon && u.target.def.weapon.range) || 0) + CELL * 3) : far ? wRange(u, w) : spotted ? wRange(u, w) : sight * 1.5;
      // A raider base defence gave this unit (defendBase picks one up to 32 cells off) is kept however far while it is still raiding:
      // dropping it here and taking a nearer enemy, then being given the raider again a second later, turned defenders round every
      // second (they ran back and forth without getting anywhere).
      const told = u.defending && u.target && u.target.kind === 'unit' && (teamOf(u).raiders || []).includes(u.target.id);
      if (u.target && !told && distTo(u, u.target) > reach) u.target = null;
      if (o.type === 'guard' && !o.amove && u.target && !avenging && !told && Math.hypot(u.target.x - o.x, u.target.y - o.y) > (o.hold ? guardReach(u) : spotted ? Math.max(sight * 1.6, wRange(u, w)) : sight * 1.6)) u.target = null;
      if (!u.target || u.target.kind === 'bld') {
        const t = far ? acquire(u, wRange(u, w), [w, u.def.weapon2], teamOf(u).isAI ? null : inViewOf(u.team)) :
          (spot && acquire(u, sight, [w, u.def.weapon2])) || (spot ? acquire(u, wRange(u, w), [w], spottedBy(u.team)) : acquire(u, sight, [w, u.def.weapon2]));
        if (t && (!u.target || t.kind === 'unit')) u.target = t;
      }
      if (!u.target) {
        if ((o.type === 'hunt' || o.amove) && aaOnly(u) && trailArmy(u, o)) {
          // (an anti-aircraft unit keeping to the back of the army: trailArmy moves it)
        } else if (o.type === 'hunt') {
          if (teamOf(u).isAI) detourToSite(u);
          const b = nearestEnemyBuilding(u);
          if (!b) nothingKnown(u);
          else if (u.huntTarget !== b || (!u.dest && !u.needPath)) { u.huntTarget = b; goTo(u, b.x, b.y); }
        } else if (o.amove && !u.dest && !u.needPath && Math.hypot(u.x - o.x, u.y - o.y) <= CELL * 1.5) {
          o.amove = false;   // an attack move that has arrived: it holds the spot like a Guard order
        } else if (!u.dest && !u.needPath && Math.hypot(u.x - o.x, u.y - o.y) > 24) {
          // Shoved off its spot by friends: if one of them stands there now, it guards from where it is (walking back shoved that one
          // off in turn, and a crowd of waiting units ran back and forth for minutes: 234 such units in a 30-minute 2 v 2).
          if (spotTaken(u, o.x, o.y)) { o.x = u.x; o.y = u.y; } else goTo(u, o.x, o.y);
        }
      }
    }
  }
  if (o.type === 'move') {
    if (followPath(u, dt) && !u.needPath && !(u.homeward && recoverPilot(u)) && !u.homeward) setGuard(u);
  } else if (u.target) {
    engage(u, u.target, dt);
  } else if (u.waitLeader > G.t) {
    // holding for the squad's leader (aiLeader): stays put, fights if anything turns up
  } else {
    followPath(u, dt);
  }
  if (u.cls === 'veh' && !u.target) u.tface = turnToward(u.tface, u.face, 3 * dt);
  // Second weapons pick their own targets: Mammoth missiles, a Rocket Soldier's anti-aircraft
  // missile. A soldier has one launcher, so his two weapons share one reload.
  if (u.def.weapon2 && u.cd2 <= 0 && (u.cls !== 'inf' || u.cd <= 0)) {
    const t2 = u.target && canHit(u.def.weapon2, u.target) && distTo(u, u.target) <= wRange(u, u.def.weapon2) ? u.target : acquire(u, wRange(u, u.def.weapon2), [u.def.weapon2]);
    if (t2) {
      if (u.cls === 'inf') { u.face = Math.atan2(t2.y - (t2.alt || 0) - u.y, t2.x - u.x); u.cd = Math.max(u.cd, u.def.weapon2.rof * VET.reload[u.rank || 0]); }
      fireWeapon(u, u.def.weapon2, t2); u.cd2 = u.def.weapon2.rof * VET.reload[u.rank || 0];
    } else u.cd2 = 0.3;   // nothing in reach: look again shortly (not every frame)
  }
  if (u.def.setup && u.cls === 'inf' && !u.target && !u.moving && !u.dest && !u.needPath) setUpGun(u, dt);   // an MG Team standing still digs in, ready for whatever comes
  if (u.def.setup && u.cls !== 'inf') {   // a V2 lowers its rocket onto the bed again 3 s after its last target
    if (u.target) u.lowT = 0;
    else if (u.setup > 0 && (u.lowT = (u.lowT || 0) + dt) > 3) u.setup = Math.max(0, u.setup - dt / u.def.pack);
  }
  checkStuck(u, dt);
}

const breachReach = (u) => (u.def.weapon && wRange(u, u.def.weapon)) || 0;   // (its main gun: a second weapon is often for aircraft only)
function engage(u, t, dt) {
  const w = canHit(u.def.weapon, t) ? u.def.weapon : u.def.weapon2 && canHit(u.def.weapon2, t) ? u.def.weapon2 : null;
  if (!w) { u.target = null; return; }   // e.g. a helicopter that took off out of a rifleman's reach
  if (u.def.demo && t.kind === 'bld' && hostile(u.team, t.team)) { demolish(u, t, dt); return; }   // a Specialist: explosives, not bullets
  const d = distTo(u, t);
  const ang = Math.atan2(t.y - (t.alt || 0) - u.y, t.x - u.x);
  // A defender sent to a spot behind sandbags (defendBase, coverSpot) walks there and fights from it; it leaves
  // once the sandbag is gone, the defence is over, or its target has moved well out of reach of the spot.
  let inCover = false, off;
  if (u.cover) {
    const p = cellCenter(u.cover.c);
    if (!u.defending || G.wall[u.cover.s] !== SANDBAG_ID || Math.hypot(t.x - p.x, t.y - p.y) > wRange(u, w) + CELL * 2) u.cover = null;
    else if ((off = Math.hypot(u.x - p.x, u.y - p.y)) > CELL || (off > COVER_SNAP && (u.dest || u.needPath))) {
      if (!u.needPath && (!u.dest || Math.hypot(u.dest.x - p.x, u.dest.y - p.y) > 4)) {
        if ((u.cover.go = (u.cover.go || 0) + 1) > 4) { u.cover = null; return; }   // cannot get there (or keeps being shoved off)
        goTo(u, p.x, p.y);   // (not the route-keeping 'auto': the spot is close to the old goal)
      }
      followPath(u, dt);
      return;
    } else {
      inCover = true;
      if (d > wRange(u, w)) {   // waits in cover for it to come into reach, but not for ever (a gun that outranges it, a raider that stays off)
        u.dest = null; u.path = null; u.face = ang; setUpGun(u, dt);
        if ((u.cover.w = (u.cover.w || 0) + dt) > COVER_WAIT) { u.cover = null; u.coverBan = G.t + 20; }
        return;
      }
    }
  }
  // In reach but behind a cliff: a unit that picked it itself lets it go; ordered at it (or at a structure), it goes round
  // (u.round: the target it is going round to, so the way round taking it out of reach does not turn it back).
  const blocked = (d <= wRange(u, w) || u.round === t.id) && !clearShot(u, t, w);
  if (!blocked) u.round = null;
  if (blocked) {
    if (t.kind === 'unit' && !(u.order && u.order.type === 'attack')) { u.target = null; u.round = null; return; }
    u.round = t.id;
    if (!u.needPath && (!u.dest || Math.hypot(u.dest.x - t.x, u.dest.y - t.y) > 40)) goTo(u, t.x, t.y);
    followPath(u, dt);
    if (u.cls === 'veh') u.tface = turnToward(u.tface, ang, 3 * dt);
  } else if (d <= wRange(u, w)) {
    u.dest = null; u.path = null;
    if (!inCover && !(u.def.setup && u.setup > 0) && slideOut(u, t, w, dt) && u.cls === 'inf') return;   // infantry find their place first, then fire (an MG Team setting up stays put)
    let aligned = true;
    if (u.def.fixed) { u.face = u.tface = turnToward(u.face, ang, u.def.turn * dt); aligned = Math.abs(angDiff(ang, u.face)) < 0.08; }   // no turret: turn the vehicle
    else if (u.cls === 'veh') { u.tface = turnToward(u.tface, ang, 5 * dt); aligned = Math.abs(angDiff(ang, u.tface)) < 0.12; }
    else u.face = ang;
    if (!setUpGun(u, dt)) return;
    if (aligned && u.cd <= 0 && w === u.def.weapon) { shoot(u, w, t); u.cd = w.rof * VET.reload[u.rank || 0]; if (u.cls === 'inf' && u.def.weapon2) u.cd2 = Math.max(u.cd2, u.cd); }
  } else {
    const p = approachSpot(u, t, w);
    if (!u.needPath && (!u.dest || Math.hypot(u.dest.x - p.x, u.dest.y - p.y) > 40)) goTo(u, p.x, p.y);
    followPath(u, dt);
    if (u.cls === 'veh') u.tface = turnToward(u.tface, ang, 3 * dt);
  }
}

// Where a unit closes in on its target from. Not the target's centre: every attacker walked to the same point
// and the group ended up in one ball (and one V2 blast). Instead a spot just inside the unit's own reach, on the
// side it comes from, turned round the target by its place in the group (u.fan, dealt out evenly by id) over an
// arc as wide as the number of attackers needs (atkOn). The bearing is fixed when it takes the target
// (u.apT its id, u.apA), so the spot does not creep round the target as the unit walks.
function approachSpot(u, t, w) {
  const R = fanR(u, t, w);
  fanAngle(u, t, R);
  const d = Math.hypot(u.x - t.x, u.y - t.y);
  if (d < R + CELL) return t;   // already about there: just step in until it is in reach
  const direct = Math.atan2(u.y - t.y, u.x - t.x);
  for (const k of [1, 0.5, 0]) {   // its own spot; if that is water or rock, nearer its straight line in
    const ang = direct + angDiff(u.apA, direct) * k;
    const x = t.x + Math.cos(ang) * R, y = t.y + Math.sin(ang) * R;
    if (x > 0 && y > 0 && x < WORLD && y < WORLD && passableAt(x, y)) return { x, y };
  }
  return t;
}
// The widest arc (radians either side of the unit's own bearing: 2.4 is most of the way round) and the room
// each unit gets on it (px).
const FAN_MAX = 1.95, FAN_GAP_INF = 16, FAN_GAP_VEH = 31;
const fanR = (u, t, w) => Math.max(12, wRange(u, w) * 0.85) + (t.kind === 'bld' || t.kind === 'span' || t.kind === 'house' ? Math.max(t.w, t.h) * CELL / 2 : 0);
function fanAngle(u, t, R) {
  const key = t.id !== undefined ? t.id : t.x + ',' + t.y;   // a ground spot has no id: its place is its key
  if (u.apT === key) return;
  if (u.fan === undefined) u.fan = ((u.id * 0.618034) % 1) * 2 - 1;
  // The arc is sized for the group: those already after the target, or the friends around it now
  // (who will mostly come in on the same target), whichever is more.
  const a = atkOn.get(t);
  let n = a ? a.n : 1, near = 1;
  const bs = nearBuckets(u.x, u.y, CELL * 5);
  for (let bi = 0; bi < bs.length; bi++) for (const e of bs[bi]) if (e !== u && e.alive && e.kind === 'unit' && e.team === u.team && e.cls !== 'air' && e.def.weapon && !e.def.harvester && Math.abs(e.x - u.x) < CELL * 5 && Math.abs(e.y - u.y) < CELL * 5) near++;
  n = Math.max(n, near);
  const spread = Math.min(FAN_MAX, n * (u.cls === 'inf' ? FAN_GAP_INF : FAN_GAP_VEH) / (2 * R));
  u.apT = key; u.apA = Math.atan2(u.y - t.y, u.x - t.x) + u.fan * spread; u.slideT = 0;
}
// A unit that comes into reach on the near side of the target, in a crowd of its own side, steps along to its
// own spot round the target (approachSpot) before it settles: infantry for at most SLIDE_MAX seconds without
// firing, vehicles (and anything without a fixed gun) while they fire. True while it is stepping.
const SLIDE_MAX = 4;
// Front rank (owner's pick, both modes): a soldier coming into reach with no friend in front of him (within FRONT_NEAR px, nearer the
// target by FRONT_GAP px or more, within FRONT_CONE rad of his line to it) fires at once; only those behind step out to their spots first.
const FRONT_NEAR = 30, FRONT_GAP = 4, FRONT_CONE = 1.1;
function frontRank(u, t) {
  const du = Math.hypot(t.x - u.x, t.y - u.y), a = Math.atan2(t.y - u.y, t.x - u.x);
  const bs = nearBuckets(u.x, u.y, FRONT_NEAR);
  for (let bi = 0; bi < bs.length; bi++) for (const e of bs[bi]) {
    if (e === u || !e.alive || e.kind !== 'unit' || e.team !== u.team || e.cls === 'air' || e.inHouse) continue;
    const dx = e.x - u.x, dy = e.y - u.y;
    if (dx * dx + dy * dy > FRONT_NEAR * FRONT_NEAR) continue;
    if (Math.hypot(t.x - e.x, t.y - e.y) > du - FRONT_GAP) continue;
    if (Math.abs(angDiff(Math.atan2(dy, dx), a)) < FRONT_CONE) return false;
  }
  return true;
}
function slideOut(u, t, w, dt) {
  if (u.def.fixed || u.cls === 'air' || !u.def.speed || t.kind === 'unit' && t.cls === 'air' || u.setup > 0) return false;
  const R = fanR(u, t, w);
  fanAngle(u, t, R);
  if (u.slideT >= SLIDE_MAX) return false;
  const x = t.x + Math.cos(u.apA) * R, y = t.y + Math.sin(u.apA) * R, dx = x - u.x, dy = y - u.y, d = Math.hypot(dx, dy);
  if (d < 10) { u.slideT = SLIDE_MAX; return false; }   // there: stays put for this target
  let crowd = 0;
  const bs = nearBuckets(u.x, u.y, 20);
  for (let bi = 0; bi < bs.length; bi++) for (const e of bs[bi]) if (e !== u && e.alive && e.kind === 'unit' && e.team === u.team && e.cls !== 'air' && Math.abs(e.x - u.x) < 20 && Math.abs(e.y - u.y) < 20) crowd++;
  if (crowd < 1) return false;
  if (u.cls === 'inf' && u.slideT === 0 && frontRank(u, t)) { u.slideT = SLIDE_MAX; return false; }   // the front rank opens fire where it stands
  u.slideT += dt;
  const want = Math.atan2(dy, dx);
  let speed = u.def.speed * VET.speed[u.rank || 0] * (u.cls === 'inf' && u.stance === 'prone' ? CRAWL_SPEED : 1);
  if (u.cls === 'veh') { u.face = turnToward(u.face, want, u.def.turn * dt); speed *= Math.max(0, Math.cos(angDiff(want, u.face))); }
  else u.face = want;
  speed *= slopeMul(u.x, u.y, Math.cos(u.cls === 'veh' ? u.face : want), Math.sin(u.cls === 'veh' ? u.face : want));
  const step = Math.min(speed * dt, d);
  if (step > 0 && tryMove(u, Math.cos(u.cls === 'veh' ? u.face : want) * step, Math.sin(u.cls === 'veh' ? u.face : want) * step)) { u.anim += step; u.moving = true; }
  return true;
}

// An MG Team or a V2 (def.setup): sets its gun up (raises its rocket), standing still, before it can fire; true once it is up. followPath packs it
// up again (def.pack) before the team walks off. u.setup runs 0 to 1, synced and saved as a plain field.
function setUpGun(u, dt) {
  if (!u.def.setup) return true;
  if ((u.setup || 0) >= 1) return true;
  u.setup = Math.min(1, (u.setup || 0) + dt / u.def.setup);
  return false;
}

function checkStuck(u, dt) {
  u.stuckT += dt;
  if (u.stuckT < 1) return;
  u.stuckT = 0;
  const moved = Math.hypot(u.x - u.lastX, u.y - u.lastY);
  u.lastX = u.x; u.lastY = u.y;
  if (!u.dest || u.needPath || moved > 3) { u.stuckN = 0; return; }
  u.stuckN++;
  if (u.stuckN === 2 || u.stuckN === 4) { const n = u.stuckN, d = u.dest; goTo(u, d.x, d.y, true); u.stuckN = n; }
  else if (u.stuckN >= 6) { u.dest = null; u.path = null; u.stuckN = 0; }
}

// Ore trucks run entirely on their own. Like the classic harvesters, a truck stays on its field and mines it
// down to bare ground (richest cells first), then moves to the next field (see pickField).
const fieldReach = (f) => f.r + 0.8 + (f.ext || 0);
const inFieldCell = (f, x, y) => Math.hypot(x - f.cx, y - f.cy) <= fieldReach(f);
function fieldValue(f) {
  let ore = 0;
  const R = fieldReach(f);
  for (let y = Math.floor(f.cy - R); y <= f.cy + R; y++) for (let x = Math.floor(f.cx - R); x <= f.cx + R; x++) {
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
      if (dist[n] < 0 && freeCell(n) && !cornerShut(c, n)) { dist[n] = dist[c] + 1; q.push(n); }
    }
  }
  return dist;
}
// A truck works one field until it is almost bare (FIELD_EMPTY; a player who sends it to a field sets it), then picks the cheapest field to drive to from
// its refinery: the distance by road (round the lakes), counted FOE_SIDE times over for a field nearer an enemy
// building than to its own side's, plus FIELD_CROWD steps for each truck (of any side) already working it.
// So trucks spread over the fields at home and only cross to the enemy's side once home is mined out.
// (Before 2026.11.05.1 a field left at 1/8 rested until it regrew to 6/8, which sent half the trucks across the
// map while home fields held thousands of ore.) If every field is nearly bare, the richest one.
const FIELD_EMPTY = 300;   // less ore than this on a field: move on
const FOE_SIDE = 3;
const FIELD_CROWD = 12;
// Called every couple of seconds from growOre: keeps each field's full size (for the stats).
function updateFieldRest(f) { f.max = Math.max(f.max || 0, fieldValue(f)); }
// The ore field a cell belongs to (the nearest centre, where fields touch).
function fieldAt(c) {
  const x = cellX(c), y = cellY(c);
  let best = null, bd = Infinity;
  for (const f of G.oreFields) { const d = Math.hypot(x - f.cx, y - f.cy); if (inFieldCell(f, x, y) && d < bd) { bd = d; best = f; } }
  return best;
}
function foeSideField(f, team) {
  let own = Infinity, foe = Infinity;
  for (const b of G.entities) {
    if (!b.alive || b.kind !== 'bld') continue;
    const d = Math.hypot(b.cx + b.w / 2 - f.cx, b.cy + b.h / 2 - f.cy);
    if (hostile(b.team, team)) { if (d < foe) foe = d; } else if (d < own) own = d;
  }
  return foe < own;
}
function pickField(u) {
  if (u.field && u.fieldPick) { if (fieldValue(u.field) > 0) return u.field; u.fieldPick = false; }   // the player's field: worked until bare
  if (u.field && fieldValue(u.field) >= FIELD_EMPTY) return u.field;
  const ref = nearestOwn(u, 'refinery');
  const walk = walkDistances(cellOfPos(ref ? dockPoint(ref).x : u.x, ref ? dockPoint(ref).y : u.y));
  const crowd = new Map();
  for (const e of G.entities) if (e.alive && e !== u && e.def.harvester && e.field) crowd.set(e.field, (crowd.get(e.field) || 0) + 1);
  let best = null, bc = Infinity, rich = null, rv = 0;
  for (const f of G.oreFields) {
    const v = fieldValue(f);
    if (v <= 0) continue;
    if (v < FIELD_EMPTY) { if (v > rv) { rv = v; rich = f; } continue; }
    const R = fieldReach(f);
    let w = Infinity;
    for (let y = Math.floor(f.cy - R); y <= f.cy + R; y++) for (let x = Math.floor(f.cx - R); x <= f.cx + R; x++) {
      if (!inMap(x, y) || !inFieldCell(f, x, y)) continue;
      const d = walk[idx(x, y)];
      if (d >= 0 && d < w) w = d;
    }
    if (w === Infinity) continue;
    const cost = w * (foeSideField(f, u.team) ? FOE_SIDE : 1) + (crowd.get(f) || 0) * FIELD_CROWD;
    if (cost < bc) { bc = cost; best = f; }
  }
  return best || rich;
}
function findOre(u) {
  const start = cellOfPos(u.x, u.y);
  const seen = new Uint8Array(NCELLS), q = [start];
  seen[start] = 1;
  const f = pickField(u);
  u.field = f;
  const inField = (c) => !f || inFieldCell(f, cellX(c), cellY(c));
  let fallback = -1, shared = -1, best = -1, bs = -Infinity, bestD = Infinity;
  const claimed = new Set();
  for (const e of G.entities) if (e.alive && e !== u && e.def.harvester && e.team === u.team && e.hcell >= 0) claimed.add(e.hcell);
  for (let qi = 0; qi < q.length && qi < 14000; qi++) {
    const c = q[qi];
    if (G.ore[c] > 0) {
      if (fallback < 0 && !claimed.has(c)) fallback = c;
      if (shared < 0 && f && inFieldCell(f, cellX(c), cellY(c))) shared = c;   // in the field, if another truck's cell
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
      if (!seen[n] && freeCell(n) && !cornerShut(c, n)) { seen[n] = 1; q.push(n); }
    }
  }
  return best >= 0 ? best : u.fieldPick && shared >= 0 ? shared : fallback;   // the player's field: stay on it while it has ore
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
    if (u.fieldPick && u.field && !inFieldCell(u.field, x, y)) continue;   // the player's field only
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
  return G.entities.some((e) => e.alive && e.kind === 'unit' && hostile(e.team, u.team) && !e.def.scripted && Math.hypot(e.x - u.threat.x, e.y - u.threat.y) < CELL * 9);
}
// Another truck of this refinery holds its dock (on its way in or unloading).
// A truck that holds the dock must keep getting nearer to it (4 px in DOCK_PATIENCE seconds) or it loses the claim.
const DOCK_PATIENCE = 5, DOCK_BAN = 8;
function dockProgress(u, d) {
  if (!u.dockBest || d < u.dockBest.d - 4) { u.dockBest = { d, t: G.t }; return true; }
  return G.t - u.dockBest.t < DOCK_PATIENCE;
}
function dockBusy(ref, u) {
  const h = ref.dockU;
  if (!h || h === u) return false;
  if (!h.alive || h.ref !== ref || (h.hs !== 'return' && h.hs !== 'unload')) { ref.dockU = null; return false; }
  return true;
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
      const dd = dist(u, dock);
      if (dd < 10) { ref.dockU = u; u.qSpot = null; u.dest = null; u.path = null; u.hs = 'unload'; u.htimer = 0; }
      else if (ref.dockU === u && !dockProgress(u, dd)) {
        // Holding the dock but not getting any nearer (the trucks queued round it block the way): give it up for a
        // while so the next in line can take it, instead of everyone waiting on a truck that cannot arrive.
        ref.dockU = null; u.dockBan = G.t + DOCK_BAN; u.qSpot = null; u.dest = null; u.path = null; u.dockBest = null;
      }
      else if (dockBusy(ref, u) || G.t < (u.dockBan || 0)) {
        // One truck unloads at a time: the rest wait in a ring round the dock instead of all
        // pushing for the same cell and jamming (separate() keeps them from ever reaching it).
        if (!u.qSpot || u.qRef !== ref) {
          const a = (u.id % 8) * Math.PI / 4, c = nearestFreeCell(cellOfPos(dock.x + Math.cos(a) * CELL * 3, dock.y + Math.abs(Math.sin(a)) * CELL * 3), 4);
          u.qRef = ref; u.qSpot = c >= 0 ? cellCenter(c) : { x: u.x, y: u.y };
          goTo(u, u.qSpot.x, u.qSpot.y);
        }
      } else {
        if (ref.dockU !== u) u.dockBest = null;
        ref.dockU = u; u.qSpot = null;
        if (dist(u, dock) < CELL * 1.3) {   // close: roll straight onto the dock (the building's edge can stop a path short)
          const a = Math.atan2(dock.y - u.y, dock.x - u.x), step = Math.min(dist(u, dock), u.def.speed * 0.6 * dt);
          u.dest = null; u.path = null; u.needPath = false;
          u.face = turnToward(u.face, a, 4 * dt); u.x += Math.cos(a) * step; u.y += Math.sin(a) * step; u.moving = true;
        } else if ((!u.dest && !u.needPath) || (u.dest && Math.hypot(u.dest.x - dock.x, u.dest.y - dock.y) > 4)) goTo(u, dock.x, dock.y);
      }
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
          u.load = 0; u.hs = 'seek'; if (u.ref.dockU === u) u.ref.dockU = null;
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

// --- Service Depot ---------------------------------------------------------
// A vehicle sent for repairs drives to its Service Depot's pad, the open cell in front of it. One
// at a time is repaired there, at the rate and price of aircraft on their pads (2% of its health
// every quarter second for 1% of its price, so a full repair costs half its price); the rest wait
// to one side until the pad is free. Repaired, it goes back to waiting around the base like a new
// unit (Ore Trucks back to harvesting).
const canService = (u) => u.alive && u.kind === 'unit' && u.cls === 'veh' && !u.def.scripted;
function depotFor(u) {
  let best = null, bd = Infinity;
  for (const e of G.entities) {
    if (!e.alive || e.kind !== 'bld' || e.team !== u.team || !e.def.depot || e.buildT < 1 || e.sellT > 0) continue;
    const d = dist(u, e);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function commandRepair(units, depot) {
  for (const u of units) {
    if (!canService(u) || u.hp >= u.maxHp) continue;
    const d = depot && depot.alive && depot.team === u.team && depot.def.depot ? depot : depotFor(u);
    if (!d) continue;
    u.order = { type: 'repair', depot: d };
    u.target = null; u.focus = null; u.huntTarget = null; u.resume = null;
    u.staged = false; u.defending = false; u.homeward = false; u.raider = false;
    u.dest = null; u.path = null; u.svcGoal = null;
  }
}
const padTaken = (d, u) => { const s = d.svc; return !!(s && s !== u && s.alive && s.order.type === 'repair' && s.order.depot === d); };
function endRepair(u) {
  const d = u.order.depot;
  if (d && d.svc === u) d.svc = null;
  u.repairing = false; u.svcGoal = null; u.svcWait = null;
  if (u.def.harvester) { setGuard(u); u.hs = u.load > 0 ? 'return' : 'seek'; u.hcell = -1; u.dest = null; u.path = null; return; }
  const s = scatterSpot(G.teams[u.team]);
  setGuard(u, s.x, s.y); u.staged = true; goTo(u, s.x, s.y);
}
function updateRepairOrder(u, dt) {
  const o = u.order;
  u.repairing = false;
  if (!o.depot || !o.depot.alive || o.depot.sellT > 0) {
    o.depot = depotFor(u); u.svcGoal = null;
    if (!o.depot) { endRepair(u); return; }
  }
  if (u.hp >= u.maxHp) { endRepair(u); return; }
  const d = o.depot, pad = cellCenter(d.exitCell);
  if (!padTaken(d, u)) {
    d.svc = u;
    if (Math.hypot(u.x - pad.x, u.y - pad.y) < 10) {
      u.dest = null; u.path = null;
      u.face = turnToward(u.face, -Math.PI / 2, 3 * dt);
      const team = G.teams[u.team], cost = Math.max(1, u.def.cost * 0.01);
      if (team.credits >= cost) {
        u.repairing = true; u.svcBroke = 0;
        if ((u.repT = (u.repT || 0) + dt) >= 0.25) { u.repT = 0; team.credits -= cost; u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.02); }
      } else {
        notify(team, 'funds', 'Insufficient funds', 30);
        // Out of money: an Ore Truck goes straight back to work (it is what brings money in), and
        // the computer's vehicles give up after a while so they do not block the pad.
        u.svcBroke = (u.svcBroke || 0) + dt;
        if (u.def.harvester || (team.isAI && u.svcBroke > 8)) { u.svcBroke = 0; endRepair(u); }
      }
    } else if (Math.hypot(u.x - pad.x, u.y - pad.y) < CELL * 1.3) {
      // Close: roll straight onto the pad (the building's edge can stop a path a little short).
      const a = Math.atan2(pad.y - u.y, pad.x - u.x), step = Math.min(Math.hypot(u.x - pad.x, u.y - pad.y), u.def.speed * 0.6 * dt);
      u.dest = null; u.path = null; u.needPath = false;
      u.face = turnToward(u.face, a, 4 * dt); u.x += Math.cos(a) * step; u.y += Math.sin(a) * step; u.moving = true;
    } else if (u.svcGoal !== 'pad' || (!u.dest && !u.needPath)) { u.svcGoal = 'pad'; goTo(u, pad.x, pad.y); }
    return;
  }
  // The pad is busy: wait off to one side of it.
  if (u.svcGoal !== 'wait' || !u.svcWait) {
    const side = (u.id % 2 ? 1 : -1) * (2 + (u.id % 3) * 0.6);
    const c = nearestFreeCell(cellOfPos(pad.x + side * CELL, pad.y + CELL * (1 + (u.id % 2))), 4);
    u.svcGoal = 'wait'; u.svcWait = c >= 0 && c !== d.exitCell ? cellCenter(c) : { x: u.x, y: u.y };
    goTo(u, u.svcWait.x, u.svcWait.y);
  }
}

// --- Aircraft ---------------------------------------------------------------
// Loads: ammo (main weapon), aam (jets' air-to-air missiles), guns (jets' gun runs), flares (jets).
const airLoad = (d) => ({ ammo: d.weapon ? d.weapon.ammo : 0, aam: d.weapon2 ? d.weapon2.ammo : 0, guns: d.gun ? d.gun.runs : 0 });
const airEmpty = (u) => u.ammo <= 0 && !(u.aam > 0) && !(u.guns > 0);
function airFull(u) { const L = airLoad(u.def); return u.ammo >= L.ammo && (u.aam || 0) >= L.aam && (u.guns || 0) >= L.guns; }
function rearmStep(u) {
  const L = airLoad(u.def);
  if (u.ammo < L.ammo) u.ammo++;
  else if ((u.aam || 0) < L.aam) u.aam = (u.aam || 0) + 1;
  else if ((u.guns || 0) < L.guns) u.guns = (u.guns || 0) + 1;
  u.flares = u.def.flares || 0;
}
// The Comanche's chain gun takes on tanks too once its missiles are spent: the same gun without `spareTanks`.
function anyTarget(w) { return w.all || (w.all = Object.assign({}, w, { spareTanks: false, all: null })); }
function airWeapons(u) {
  const ws = [];
  const w = u.def.weapon;
  if (w && (u.ammo > 0 || u.guns > 0)) ws.push(w.spareTanks && !(u.aam > 0) ? anyTarget(w) : w);
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
  G.effects.push({ type: 'flare', x: t.x - Math.cos(t.face) * 10, y: t.y - Math.sin(t.face) * 10, lift: t.alt || 0,   // (drawn at its height: ui.js)
    vx: Math.cos(a) * 34 + Math.cos(t.face) * sp, vy: Math.sin(a) * 20 + Math.sin(t.face) * sp, t: 0, life: 2.8, trail: [] });
}

const HELI_ALT = 20, JET_ALT = 30;

// Jets and planes fly above the hills (owner, 2026-11-25: "make jets and planes fly higher so they're not influenced by the
// terrain as much? leave helicopters alone"). The ground is drawn raised (look.js gLift: hgt x VK x HILL_DRAW) and aircraft
// are drawn on it, so a jet rose and dipped with every hill it crossed. Now a flying jet's alt is topped up by the gap
// between the map's highest ground and the ground under it, so it cruises level just above the highest hill. The flight
// code works on the plain height (u.altB, from 0 to JET_ALT); jetAbove adds the top-up after it runs (in full at JET_ALT,
// less on the climb and descent, none landed), so everything drawn at its height follows (shots, lights, crashes, taps).
const JET_HILL = 2.5;   // = look.js HILL_DRAW (the hills are drawn that many times as tall as G.hgt)
let hgtTopOf = null, hgtTop = 0;
function hillTop() {
  const H = G.hgt;
  if (!H) return 0;
  if (hgtTopOf !== H) { hgtTopOf = H; hgtTop = 0; for (let i = 0; i < H.length; i++) if (H[i] > hgtTop) hgtTop = H[i]; }
  return hgtTop;
}
function jetAbove(u, fly) {
  if (u.altB !== undefined && u.alt === u.altD) u.alt = u.altB;   // (alt set anywhere else since: taken as the plain height)
  fly();
  const b = u.alt || 0, k = Math.max(0, Math.min(1, b / JET_ALT));
  u.altB = b;
  u.alt = u.altD = b + (k > 0 ? Math.max(0, hillTop() - hgtAt(u.x, u.y, true)) * VK * JET_HILL * k : 0);
}

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
// An Airfield holds AIRFIELD_SLOTS jets, parked two by two on the open asphalt beside the tower
// and hangar (offsets from its corner). Jets cannot be built while every Airfield is full.
// A Helicopter Base has four landing pads, one in each quarter (offsets from its centre).
const HELIBASE_SPOTS = [[-24, -24], [24, -24], [-24, 24], [24, 24]], HELIBASE_SLOTS = 4;   // one helicopter a pad: more needs another base
const AIRFIELD_SLOTS = 4, AIRFIELD_SPOTS = [[40, 16], [74, 16], [40, 52], [74, 52]];   // a 4 x 3 Airfield: tower and hangar on the west side
// Free parking for new aircraft from this producer: slots on its usable pads, less the aircraft
// based there or anywhere else (in the air too) and those already in a queue. Infinity if uncapped.
function padRoom(team, producer) {
  const per = producer === 'airfield' ? AIRFIELD_SLOTS : producer === 'helipad' ? HELIBASE_SLOTS : 0;
  if (!per) return Infinity;
  let room = 0;
  for (const e of G.entities) {
    if (padUsable(e, team.id, producer)) room += per;
    else if (e.alive && e.kind === 'unit' && e.team === team.id && e.def.producer === producer) room--;
  }
  room -= producer === 'airfield' ? team.queues.jet.length + (team.reserve ? team.reserve.length : 0) : team.queues.heli.length;
  return room;
}

// --- Jet reserves ---------------------------------------------------------------
// When an Airfield is lost or sold and the others have no room, the surplus jets fly off the
// map into reserve (kept as plain data in team.reserve). When room appears again, for example a
// new Airfield, they fly back in from the edge nearest the base and land. Host only: the guest
// just sees the jets leave and arrive like any other entity.
function edgePoint(x, y, out) {
  const l = x, r = WORLD - x, t = y, b = WORLD - y, m = Math.min(l, r, t, b);
  return m === l ? { x: -out, y } : m === r ? { x: WORLD + out, y } : m === t ? { x, y: -out } : { x, y: WORLD + out };
}
function updateReserves() {
  for (const team of G.teams) {
    const cap = AIRFIELD_SLOTS * G.entities.filter((e) => padUsable(e, team.id, 'airfield')).length;
    const res = team.reserve || (team.reserve = []);
    const jets = G.entities.filter((e) => e.alive && e.kind === 'unit' && e.team === team.id && e.def.producer === 'airfield' && !e.def.scripted);
    const active = jets.filter((j) => !j.leaving);
    if (active.length > cap) {
      // Jets whose Airfield is gone go first, and parked ones before those in the air.
      const rank = (j) => (padUsable(G.byId.get(j.home), team.id, 'airfield') ? 2 : 0) + (j.as === 'landed' ? 0 : 1);
      active.sort((a, b) => rank(a) - rank(b) || a.id - b.id);
      for (const j of active.slice(0, active.length - cap)) {
        j.leaving = true; j.defending = false; j.retreat = false; j.rearming = false; j.target = null; j.exitX = undefined;
        setGuard(j);
      }
      notify(team, 'reserve', 'No room at the Airfield. Jets flying to reserve', 20);
    } else {
      let free = cap - active.length;
      // Jets still on their way out turn back first, then the reserve flies in.
      for (const j of jets) if (free > 0 && j.leaving) { j.leaving = false; free--; setGuard(j); j.order.pad = true; j.staged = true; j.home = null; }
      let back = 0;
      while (free > 0 && res.length) { free--; back++; callFromReserve(team, res.shift()); }
      if (back) notify(team, 'reserve-back', 'Jets returning from reserve', 20);
    }
  }
}
function callFromReserve(team, r) {
  const pad = leastBusyPad(team.id, 'airfield');
  const e = edgePoint((team.start.cx + 0.5) * CELL, (team.start.cy + 0.5) * CELL, 0);
  const u = addUnit(r.type, team, Math.max(8, Math.min(WORLD - 8, e.x)), Math.max(8, Math.min(WORLD - 8, e.y)));
  team.stats.units--;   // already counted when it was built
  u.hp = r.hp; u.ammo = r.ammo; u.aam = r.aam; u.guns = r.guns; u.flares = r.flares;
  u.as = 'fly'; u.alt = JET_ALT; u.speedCur = u.def.speed;
  u.home = pad ? pad.id : null;
  u.face = u.tface = pad ? Math.atan2(pad.y - u.y, pad.x - u.x) : Math.atan2(WORLD / 2 - u.y, WORLD / 2 - u.x);
  setGuard(u); u.order.pad = true; u.staged = true;
}
// A jet leaving for reserve takes off if parked, then flies straight off the nearest map edge.
function flyAway(u, dt) {
  if (u.as === 'landed') u.as = 'takeoff';
  if (u.as === 'takeoff') {
    u.roll = 0; u.final = false;
    u.alt = Math.min(JET_ALT, u.alt + 25 * dt);
    u.speedCur = Math.min(u.def.speed, u.speedCur + 160 * dt);
    u.x += Math.cos(u.face) * u.speedCur * dt; u.y += Math.sin(u.face) * u.speedCur * dt; u.moving = true;
    if (u.alt >= JET_ALT) u.as = 'fly';
    return;
  }
  if (u.exitX === undefined) { const e = edgePoint(u.x, u.y, 80); u.exitX = e.x; u.exitY = e.y; }
  const ang = Math.atan2(u.exitY - u.y, u.exitX - u.x);
  u.face = turnToward(u.face, ang, u.def.turn * dt);
  u.speedCur = Math.min(u.def.speed, (u.speedCur || 0) + 160 * dt);
  u.x += Math.cos(u.face) * u.speedCur * dt; u.y += Math.sin(u.face) * u.speedCur * dt; u.moving = true;
  if (u.x < -40 || u.y < -40 || u.x > WORLD + 40 || u.y > WORLD + 40) {
    (G.teams[u.team].reserve || (G.teams[u.team].reserve = [])).push({ type: u.type, hp: u.hp, ammo: u.ammo, aam: u.aam, guns: u.guns, flares: u.flares });
    u.alive = false;   // gone without a wreck
  }
}
function padSpot(pad, u) {
  // Each aircraft based at a pad gets its own parking slot: on the Airfield's asphalt, or on the
  // pad and the ground around it for helicopters.
  const mates = G.entities.filter((e) => e.alive && e.kind === 'unit' && e.team === u.team && e.home === pad.id).sort((a, b) => a.id - b.id);
  // Past six helicopters, a wider ring round the pad. Jets past the Airfield's slots (only after
  // another Airfield was lost) line up on the ground below it.
  const k = Math.max(0, mates.indexOf(u));
  let s;
  if (pad.type === 'airfield') s = k < AIRFIELD_SLOTS ? { x: pad.cx * CELL + AIRFIELD_SPOTS[k][0], y: pad.cy * CELL + AIRFIELD_SPOTS[k][1] }
    : { x: pad.cx * CELL + 14 + ((k - AIRFIELD_SLOTS) % 3) * 22, y: pad.cy * CELL + 86 + Math.floor((k - AIRFIELD_SLOTS) / 3) * 29 };
  else if (k < 4) s = { x: pad.x + HELIBASE_SPOTS[k][0], y: pad.y + HELIBASE_SPOTS[k][1] };   // the Helicopter Base's four pads
  else { const a = (k - 4) * 0.9 - 1.6, r = 80 + Math.floor((k - 4) / 7) * 34; s = { x: pad.x + Math.cos(a) * r, y: pad.y + Math.sin(a) * r }; }   // the rest park on the ground round it
  s.x = Math.max(8, Math.min(WORLD - 8, s.x)); s.y = Math.max(8, Math.min(WORLD - 8, s.y));
  return s;
}

function airTarget(u) {
  const o = u.order, sight = u.def.sight * CELL * (u.def.fly === 'jet' ? 1.6 : 1);
  const ws = airWeapons(u);
  // An ordered target: the Comanche with its gun spent cannot touch a building with its tank missiles, so meanwhile it takes on
  // a tank or Ore Truck in reach (or, with none, goes home to rearm: gunSpent) instead of hovering over the target for ever.
  if (o.type === 'attack') { if (o.target.alive) { if (!u.def.standoff || ws.some((w) => canHit(w, o.target))) return o.target; } else setGuard(u); }
  if (o.type === 'move' && u.def.fly === 'heli') return null;
  // A defender keeps the raider base defence gave it, however far away: each jet has its own.
  if (u.defending && u.target && u.target.alive && ws.some((w) => canHit(w, u.target))) return u.target;
  const heli = u.def.fly === 'heli';
  // (A helicopter on something it is not made for keeps looking, and switches when a favoured target turns up.)
  if (u.target && u.target.alive && ws.some((w) => canHit(w, u.target)) && distTo(u, u.target) < sight * 1.4 &&
    !(heli && !ws.some((w) => favoured(w, u.target)))) return u.target;
  const src = o.type === 'guard' ? { x: o.x, y: o.y, team: u.team } : u;
  // On the attack with an open target to go for (airPick), it leaves targets covered by detected anti-air alone.
  let open = null;
  // (Not the Comanche's units: it outranges most anti-air, so it takes on every unit it meets on the way.)
  if (o.type === 'hunt' && u.aaClear) { const aa = knownAA(u.team, u.def.fly === 'jet'), units = u.def.standoff; if (aa.length) open = (e) => isAirborne(e) || (units && e.kind === 'unit') || !aaCover(aa, e); }
  if (!ws.length) return null;
  // A stand-off helicopter (the Comanche) looks as far as its missiles lock on.
  // With only its missiles left it looks twice their reach for a tank or Ore Truck before going home (gunSpent).
  const reach = u.def.standoff ? (u.ammo > 0 ? Math.max(sight, ...ws.map((w) => wRange(u, w))) : wRange(u, u.def.weapon2) * MISSILE_SEEK) : sight;
  const pick = acquire(src, reach, ws, open, heli);
  // Nothing new in sight: carry on with the unfavoured target it had.
  if (heli && !pick && u.target && u.target.alive && ws.some((w) => canHit(w, u.target)) && distTo(u, u.target) < sight * 1.4) return u.target;
  return pick;
}

function padRepair(u, dt) {
  u.repairing = false;
  if (u.hp < u.maxHp && padFor(u) && Math.hypot(padFor(u).x - u.x, padFor(u).y - u.y) < CELL * 3) {
    const team = G.teams[u.team], cost = Math.max(1, u.def.cost * 0.01);
    if (team.credits >= cost) {
      u.repairing = true;
      if ((u.repT = (u.repT || 0) + dt) >= 0.25) { u.repT = 0; team.credits -= cost; u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.02); }
    } else notify(team, 'funds', 'Insufficient funds', 30);
  }
}

function updateAir(u, dt) {
  const w = u.def.weapon, jet = u.def.fly === 'jet';
  if (u.leaving) { flyAway(u, dt); return; }   // off to reserve: nothing else matters
  if (u.def.lift) { updateLift(u, dt); return; }   // transport helicopters: their own orders (below)
  if (u.def.standoff) {   // the Comanche's side bays: open while it has a missile target in reach (standoffFight), shut after
    const want = G.t < (u.bayHold || 0) ? 1 : 0, b = u.bay || 0;
    if (b !== want) u.bay = want > b ? Math.min(1, b + dt / BAY_OPEN) : Math.max(0, b - dt / BAY_OPEN);
  }
  if (u.flareSeq) dropFlare(u);
  if (u.target && !u.target.alive) u.target = null;
  if (u.order.type === 'attack' && !u.order.target.alive) setGuard(u);   // its target is gone: hold here
  // A jet out of air-to-air missiles cannot fight an aircraft: it gives up the chase and flies home.
  if (jet && u.order.type === 'attack' && isAirborne(u.order.target) && !(u.aam > 0) && padFor(u)) {
    setGuard(u); u.order.pad = true; u.staged = u.scrambled ? !!u.wasStaged : G.teams[u.team].auto && !oneWave(u); u.scrambled = false;
  }

  if (u.as === 'landed') {
    if (u.roll > 0) { rollOut(u, dt); return; }   // still braking down the runway after touchdown
    u.alt = 0; u.speedCur = 0;
    if (Math.abs(angDiff(0, u.face)) > 0.02) u.face = turnToward(u.face, 0, 3 * dt);   // taxi round to face the way parked jets do
    u.rt += dt;
    if (!airFull(u) && u.rt >= (jet ? 3.4 : 0.5)) { rearmStep(u); u.rt = 0; }   // a jet takes about 20 s to rearm fully
    // Ground crews patch up damage at the same rate and price as structure repairs: 2% of its
    // health every quarter second for 1% of its price, so a full repair costs half the price.
    padRepair(u, dt);
    if (u.repairHold && u.hp >= u.maxHp) u.repairHold = false;
    // Aircraft told to wait on their pad stay parked until auto attack, an order or a raid sends them up.
    // They also wait while repairs are under way, and one that came home damaged waits until it is
    // fully repaired, even if that means waiting for money.
    if (airFull(u)) u.rearming = false;   // topped up: a defender can go out for another pass
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
  if (!u.retreat && !u.defending && u.hp < u.maxHp * 0.35 && (u.order.type === 'hunt' || u.order.type === 'guard') && padFor(u)) {
    u.retreat = true;
    notify(G.teams[u.team], 'retreat', 'Aircraft returning for repairs', 10);
  }
  if (u.retreat && !padFor(u)) u.retreat = false;   // pad lost on the way: fight on
  // Out of ammo, retreating, or told to wait on the pad: head home and land.
  // Jets go home once their missiles (both kinds: air-to-air ones are fired at the ground too) and gun runs are spent, keeping any
  // air-to-air missiles for enemy aircraft met on the way (or for an air target the player picked).
  const o0 = u.order, huntingAir = o0.type === 'attack' && o0.target.alive && isAirborne(o0.target) && u.aam > 0;
  const strikeSpent = jet && u.ammo <= 0 && !(u.guns > 0) && !(u.aam > 0) && !huntingAir;
  // The Comanche with its gun spent goes home to rearm unless a tank or Ore Truck is in reach of its missiles: those hit
  // tanks alone, so it would otherwise fly on to the enemy base and hang there without a shot.
  const gunSpent = u.def.standoff && u.ammo <= 0 && !(u.aam > 0 && ((u.target && u.target.alive && missileMark(u.target)) || acquire(u, wRange(u, u.def.weapon2) * MISSILE_SEEK, [u.def.weapon2])));
  if (airEmpty(u) || strikeSpent || gunSpent || u.retreat || u.rearming || (u.order.type === 'guard' && u.order.pad)) {
    const pad = padFor(u);
    if (pad) {
      const spot = padSpot(pad, u);
      const d = Math.hypot(spot.x - u.x, spot.y - u.y);
      if (jet) {
        if (u.aam > 0 && u.cd <= 0) {
          const a = acquire(u, wRange(u, u.def.weapon2), [u.def.weapon2], isAirborne);
          if (a && isAirborne(a) && Math.abs(angDiff(Math.atan2(a.y - u.y, a.x - u.x), u.face)) < 0.5) { shoot(u, u.def.weapon2, a); u.cd = u.def.weapon2.rof * VET.reload[u.rank || 0]; u.aam--; }
        }
        landJet(u, spot, runwayDir(pad, spot), dt);
      } else {
        if (d < 3) { u.alt = Math.max(0, u.alt - 20 * dt); if (u.alt <= 0) { u.as = 'landed'; u.rt = 0; if (u.retreat || u.rearming) u.repairHold = u.hp < u.maxHp; u.retreat = false; strikeOver(u); } return; }
        flyHeli(u, spot.x, spot.y, dt);
      }
      return;
    }
    // No pad: limp back to base and rearm slowly in the air.
    u.rt += dt;
    if (u.rt > 6) { while (!airFull(u)) rearmStep(u); u.rt = 0; u.rearming = false; }
    const home = buildingsOf(u.team)[0] || u;
    if (jet) orbit(u, home.x, home.y, dt); else flyHeli(u, home.x, home.y, dt);
    return;
  }

  u.final = false;   // back to the fight: no longer lined up for a landing
  u.think -= dt;
  if (u.think <= 0) {
    u.think = 0.3; u.target = airTarget(u);
    // A defender whose raider died on the way takes the next one that nobody else has.
    if (!u.target && jet && u.defending && u.order.type === 'guard') { u.target = pickRaider(u); if (u.target) setGuardKeep(u, u.target); }
  }
  const t = u.target;
  const o = u.order;
  if (jet) {
    if (u.passT > 0) { u.passT -= dt; flyJet(u, u.x + Math.cos(u.face) * 100, u.y + Math.sin(u.face) * 100, dt); return; }
    if (t) {
      const d = distTo(u, t), ang = Math.atan2(t.y - u.y, t.x - u.x), air = isAirborne(t);
      // Air targets get air-to-air missiles; ground targets get the ground-attack missiles from range, then
      // the air-to-air ones once those are spent, and the gun runs.
      const mw = air ? (u.aam > 0 ? u.def.weapon2 : null) : (u.ammo > 0 ? w : u.aam > 0 ? u.def.weapon2 : null);
      if (mw && d <= wRange(u, mw) && Math.abs(angDiff(ang, u.face)) < 0.35 && u.cd <= 0) {
        shoot(u, mw, t); u.cd = mw.rof * VET.reload[u.rank || 0];
        if (mw === u.def.weapon2) u.aam--; else u.ammo--;
        if (Math.random() < 0.5) u.passT = 0.9;
        // A jet defending the base makes one pass, then flies home to rearm: a missile at an aircraft,
        // or at a ground target it has no gun runs left for, ends it; otherwise the gun run does.
        if (u.defending && o.type !== 'attack' && (air || !(u.guns > 0))) u.rearming = true;
      } else if (!air && u.guns > 0 && !u.strafe && d <= wRange(u, u.def.gun) && Math.abs(angDiff(ang, u.face)) < 0.3 && u.cd2 <= 0) {
        startStrafe(u, t);
        u.guns--; u.cd2 = 1.6;
        if (u.defending && o.type !== 'attack') u.rearming = true;
      } else if (!(u.extT > 0) && d < (u.def.speed / u.def.turn) * 1.6 && Math.abs(angDiff(ang, u.face)) > 0.8) {
        // Too close to turn onto it (a raider beside the Airfield sits inside the turning circle, and the jet
        // would circle it for ever without a shot): fly straight out, then come round for a proper run.
        u.extT = 3;
      }
      // Flying out: far enough to turn round (one turning circle) and still line up before it is in range.
      if (u.extT > 0) {
        u.extT -= dt;
        if (d < (u.def.speed / u.def.turn) * 2 + (mw ? wRange(u, mw) : 0) + 40) { flyJet(u, u.x + Math.cos(u.face) * 100, u.y + Math.sin(u.face) * 100, dt); return; }
        u.extT = 0;
      }
      flyJet(u, t.x, t.y, dt);
    } else if (o.type === 'hunt') {
      const b = nearestEnemyBuilding(u);
      if (b) flyJet(u, b.x, b.y, dt); else { nothingKnown(u); orbit(u, u.x, u.y, dt); }
    } else {
      // A jet cannot hover: with nothing to hit near where it was told to wait, it soon flies home.
      if (!o.hold && (u.idleT = (u.idleT || 0) + dt) > 3 && padFor(u)) { setGuard(u); u.order.pad = true; u.staged = G.teams[u.team].auto && !oneWave(u); u.idleT = 0; }
      orbit(u, o.x, o.y, dt);
    }
    if (t) u.idleT = 0;
    return;
  }
  // Helicopter
  if (o.type === 'move') {
    if (Math.hypot(o.x - u.x, o.y - u.y) < 6) setGuard(u, o.x, o.y);
    else { flyHeli(u, o.x, o.y, dt); return; }
  }
  if (t && u.def.standoff) standoffFight(u, t, dt);
  else if (t) {
    const d = distTo(u, t), ang = Math.atan2(t.y - u.y, t.x - u.x);
    if (d > wRange(u, w) * 0.9) flyHeli(u, t.x, t.y, dt);
    else {
      u.face = turnToward(u.face, ang, 4 * dt);
      if (Math.abs(angDiff(ang, u.face)) < 0.2 && u.cd <= 0) { shoot(u, w, t); u.cd = w.rof * VET.reload[u.rank || 0]; u.ammo--; }
    }
  } else if (o.type === 'hunt') {
    const b = nearestEnemyBuilding(u);
    if (b) flyHeli(u, b.x, b.y, dt); else nothingKnown(u);
  } else if (Math.hypot(o.x - u.x, o.y - u.y) > 8) flyHeli(u, o.x, o.y, dt);
}

// A unit of the player's on the attack with no enemy building left that the player knows of
// (the rest are still hidden): aircraft fly home (a one-strike sortie ends), ground units go back
// to wait around the base.
function nothingKnown(u) {
  const team = G.teams[u.team];
  if (!u.alive) return;
  notify(team, 'unknown', 'Enemy base not located', 20);   // (says nothing for the computer)
  if (u.cls === 'air') { setGuard(u); u.order.pad = true; u.staged = !u.oneStrike; u.oneStrike = false; return; }
  const s = scatterSpot(team);
  setGuard(u, s.x, s.y); u.staged = true; goTo(u, s.x, s.y);
}
// An aircraft sent on one strike has landed: it stays on its pad until given another order.
function strikeOver(u) {
  if (!u.oneStrike) return;
  u.oneStrike = false;
  setGuard(u); u.order.pad = true; u.staged = false;
}
// The Comanche's fight: it holds near the edge of its reach and backs away (still facing the target) from anything that comes
// closer than STANDOFF_NEAR of it. Tanks get the anti-tank missiles while it has them: the bays open (BAY_OPEN s), it holds a
// lock for the weapon's `lock` seconds (kept while the target stays the same and in reach) and fires one missile per `rof`.
// Everything else, and tanks once the missiles are spent, gets the chain gun.
const MISSILE_SEEK = 2;
const BAY_OPEN = 0.4, STANDOFF_FAR = 0.92, STANDOFF_NEAR = 0.8, BACK_SPEED = 0.55;
function standoffFight(u, t, dt) {
  const mw = u.def.weapon2, missile = u.aam > 0 && canHit(mw, t);
  const w = missile ? mw : airWeapons(u).find((x) => x !== mw && canHit(x, t));
  if (!w) { u.target = null; return; }
  const d = distTo(u, t), ang = Math.atan2(t.y - u.y, t.x - u.x);
  if (missile && d <= wRange(u, mw) * 1.15) u.bayHold = G.t + 0.8;
  if (u.lockOn !== t.id || !missile || d > wRange(u, mw)) { u.lockOn = missile && d <= wRange(u, mw) ? t.id : null; u.lock = 0; }
  if (d > wRange(u, w) * STANDOFF_FAR) { flyHeli(u, t.x, t.y, dt); return; }
  if (d < wRange(u, w) * STANDOFF_NEAR) {   // too close: back off, nose still on the target
    const step = u.def.speed * BACK_SPEED * dt;
    u.x -= Math.cos(ang) * step; u.y -= Math.sin(ang) * step; u.moving = true;
    clampAir(u);
  }
  spreadHelis(u, dt);
  u.face = turnToward(u.face, ang, 4 * dt);
  const facing = Math.abs(angDiff(ang, u.face)) < 0.2;
  if (missile) {
    if (facing) u.lock = (u.lock || 0) + dt;
    if (u.lock >= mw.lock && (u.bay || 0) >= 1 && !(u.cd2 > 0)) { shoot(u, mw, t); u.cd2 = mw.rof * VET.reload[u.rank || 0]; u.aam--; u.bayHold = G.t + 1.5; }
  } else if (facing && u.cd <= 0) { shoot(u, w, t); u.cd = w.rof * VET.reload[u.rank || 0]; u.ammo--; }
}
// Comanches holding at the edge of their reach on one target all end up on the same spot: each eases away from a friendly
// helicopter within HELI_SPACE px (looks and a little less splash from one blast; flying on is unchanged).
const HELI_SPACE = 34;
function spreadHelis(u, dt) {
  for (const b of nearBuckets(u.x, u.y, HELI_SPACE)) for (const e of b) {
    if (e === u || !e.alive || e.cls !== 'air' || e.def.fly !== 'heli' || e.as !== 'fly' || e.team !== u.team) continue;
    let dx = u.x - e.x, dy = u.y - e.y; const d = Math.hypot(dx, dy);
    if (d >= HELI_SPACE) continue;
    if (d < 0.5) { dx = Math.cos(u.id); dy = Math.sin(u.id); }
    const k = Math.min(1, (HELI_SPACE - d) / HELI_SPACE) * 40 * dt / Math.max(d, 1);
    u.x += dx * k; u.y += dy * k;
  }
  clampAir(u);
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
// --- Transport helicopters (Chinook, Halo) -----------------------------------------
// Passengers are kept on the transport as plain data (u.cargo: type, health, rank, kills), like jets in reserve, and are
// made again with addUnit when it unloads (host only: an online guest never makes entities). Orders (u.order.type 'lift'):
//   step 'pick': fly to (x, y), land and wait for the soldiers ordered aboard (commandBoard). With a drop zone (dx, dy: an
//     Air Assault) it takes off when full, when nobody else is coming, or after LIFT_WAIT; otherwise it waits for an order.
//   step 'go': fly to (x, y) and land; step 'drop': unload one soldier every LIFT_DROP_GAP, then fly home (or, if it
//     carried nobody, stay parked there: an empty transport sent somewhere waits there to pick troops up).
// A guard order on its pad (setGuard + pad) flies it home to land and be repaired. Shot down, everyone aboard is lost.
const LIFT_WAIT = 25, LIFT_DROP_GAP = 0.25, LIFT_BOARD_R = CELL * 1.5, ASSAULT_MIN = 4, ASSAULT_REACH = 14;
const canBoard = (u) => !!u && u.kind === 'unit' && u.alive && u.cls === 'inf' && !u.chute && !u.def.scripted && u.type !== 'pilot';
const boardersOf = (h) => G.entities.filter((u) => u.alive && u.kind === 'unit' && u.order.type === 'board' && u.order.target === h);
const liftWaiting = (h) => !!h && h.alive && h.kind === 'unit' && !!h.def.lift && h.order.type === 'lift' && h.order.step === 'pick';
// Ready for an Air Assault: empty, not on a job, not badly hurt.
const liftReady = (h) => h.alive && h.def.lift && !(h.cargo && h.cargo.length) && h.order.type !== 'lift' && h.hp >= h.maxHp * 0.4 && !boardersOf(h).length;
// Somewhere to set down near (x, y): open ground, not a building's exit, clear of where other transports are landing.
function landSpot(x, y, self) {
  const c0 = cellOfPos(Math.max(0, Math.min(WORLD - 1, x)), Math.max(0, Math.min(WORLD - 1, y))), cx = cellX(c0), cy = cellY(c0);
  const taken = [];
  for (const e of G.entities) if (e !== self && e.alive && e.kind === 'unit' && e.def.lift) {
    taken.push(e.as === 'landed' ? e : null);
    if (e.order.type === 'lift') taken.push(e.order);
  }
  const ok = (c) => {
    if (!freeCell(c) || G.resv[c]) return false;
    const p = cellCenter(c);
    return !taken.some((t) => t && Math.hypot(t.x - p.x, t.y - p.y) < CELL * 1.8);
  };
  for (let rad = 0; rad <= 6; rad++) {
    let best = -1, bd = Infinity;
    for (let yy = cy - rad; yy <= cy + rad; yy++) for (let xx = cx - rad; xx <= cx + rad; xx++) {
      if (Math.max(Math.abs(xx - cx), Math.abs(yy - cy)) !== rad || !inMap(xx, yy)) continue;
      const c = idx(xx, yy), d = Math.hypot(xx - cx, yy - cy);
      if (d < bd && ok(c)) { bd = d; best = c; }
    }
    if (best >= 0) return cellCenter(best);
  }
  return null;
}
// Up, across and down: true once it is on the ground at (x, y).
function liftFly(u, x, y, dt) {
  const d = Math.hypot(x - u.x, y - u.y);
  if (u.as === 'landed') { if (d < 4) return true; u.as = 'takeoff'; }
  if (u.as === 'takeoff') { u.alt = Math.min(HELI_ALT, u.alt + 18 * dt); if (u.alt >= HELI_ALT) u.as = 'fly'; return false; }
  if (d < 3) {
    u.alt = Math.max(0, u.alt - 20 * dt);
    if (u.alt <= 0) { u.as = 'landed'; u.alt = 0; u.rt = 0; return true; }
    return false;
  }
  flyHeli(u, x, y, dt);
  return false;
}
function liftHome(u) { setGuard(u); u.order.pad = true; u.staged = false; }
function updateLift(u, dt) {
  const cargo = u.cargo || (u.cargo = []);
  let o = u.order;
  u.repairing = false;
  if (o.type === 'move') { liftTo(u, o.x, o.y); o = u.order; }
  else if (o.type !== 'lift' && o.type !== 'guard') { liftHome(u); o = u.order; }   // (it has no weapons: auto attack and the like send it home)
  if (o.type === 'guard') {
    if (o.pad) {
      const pad = padFor(u);
      if (!pad) { if (u.as !== 'landed') liftFly(u, o.x, o.y, dt); return; }
      const sp = padSpot(pad, u);
      if (liftFly(u, sp.x, sp.y, dt)) padRepair(u, dt);
    } else liftFly(u, o.x, o.y, dt);   // parked where it was sent
    return;
  }
  if (o.step === 'pick') {
    if (!liftFly(u, o.x, o.y, dt)) return;
    o.t = (o.t || 0) + dt;
    if (o.dx === undefined) return;   // boarded by hand: it waits for a drop order
    const coming = boardersOf(u).length, hold = o.goAt !== undefined && G.t < o.goAt;   // (goAt: the computer times a drop to land with its wave)
    if (!hold && (cargo.length >= u.def.carry || (cargo.length && (!coming || o.t > LIFT_WAIT)))) { u.order = { type: 'lift', step: 'go', x: o.dx, y: o.dy, ai: o.ai }; return; }
    if (cargo.length) return;
    if (o.t > LIFT_WAIT + 10 || (!coming && o.t > 3)) { for (const b of boardersOf(u)) setGuard(b, b.x, b.y); liftHome(u); }
    return;
  }
  if (o.step === 'go') {
    if (!liftFly(u, o.x, o.y, dt)) return;
    o.step = 'drop'; o.t = 0; o.n = cargo.length;
    return;
  }
  if (o.step === 'drop') {
    if (u.as !== 'landed') { liftFly(u, o.x, o.y, dt); return; }
    o.t = (o.t || 0) - dt;
    if (cargo.length && o.t <= 0) { o.t = LIFT_DROP_GAP; unloadOne(u, o.ai); }
    if (!cargo.length && o.t <= 0) { if (o.n) liftHome(u); else setGuard(u, u.x, u.y); }
  }
}
// ai: how the computer's soldiers carry on once down: 'hunt' (attack), 'guard' (hold the spot: a turtle's reinforcements), 'wait'
// (hold the spot until the ground wave they came with engages, at most LIFT_HOLD_MAX s: ai.js aiLiftRelease).
const LIFT_HOLD_MAX = 75;
function unloadOne(h, ai) {
  const r = h.cargo.shift(), team = G.teams[h.team];
  if (!r || !UNIT_DEFS[r.type]) return;
  const a = Math.random() * Math.PI * 2, k = 1 + Math.random() * 1.5;
  let c = cellOfPos(Math.max(0, Math.min(WORLD - 1, h.x + Math.cos(a) * CELL * k)), Math.max(0, Math.min(WORLD - 1, h.y + Math.sin(a) * CELL * k)));
  if (!freeCell(c)) c = nearestFreeCell(cellOfPos(h.x, h.y), 4);
  const p = c >= 0 ? cellCenter(c) : { x: h.x, y: h.y };
  const u = addUnit(r.type, team, h.x + (p.x - h.x) * 0.4, h.y + (p.y - h.y) * 0.4);
  if (r.type !== 'pilot' && r.type !== 'technician') team.stats.units--;   // counted when it was trained
  u.hp = Math.min(u.maxHp, r.hp); u.rank = r.rank || 0; u.kills = r.kills || 0; u.killWorth = r.kw || 0; u.born = r.born;
  u.face = u.tface = Math.atan2(p.y - h.y, p.x - h.x);
  if (ai === 'guard') { setGuard(u, p.x, p.y); u.staged = true; }
  else if (ai === 'wait') { setGuard(u, p.x, p.y); u.staged = false; u.liftWait = G.t + LIFT_HOLD_MAX; }   // (the computer's drop with a wave: aiLiftRelease sends it in)
  else if (ai || team.isAI) { setHunt(u); u.staged = false; }
  else { setGuard(u, p.x, p.y); u.staged = false; takeOver(u, 'move'); }
  goTo(u, p.x, p.y);
  hooks.sfx('place', h.x, h.y);
  return u;
}
// Infantry ordered aboard walk to where the transport is landing and climb in.
function updateBoard(u) {
  const h = u.order.target;
  if (h && h.def && h.def.apc) {   // an APC: walk up to it wherever it is and climb in
    if (!h.alive || h.team !== u.team || (h.cargo || []).length >= h.def.carry) { setGuard(u, u.x, u.y); if (teamOf(u).isAI) { u.staged = true; u.raidCrew = false; } return; }
    const d = Math.hypot(h.x - u.x, h.y - u.y), settled = !u.dest && !u.needPath;
    if (d < h.def.r + APC_BOARD_R || (settled && d < CELL * 2.5)) { climbIn(u, h); return; }
    if (settled || (u.dest && Math.hypot(u.dest.x - h.x, u.dest.y - h.y) > CELL)) goTo(u, h.x, h.y);
    return;
  }
  if (!liftWaiting(h) || h.team !== u.team || (h.cargo || []).length >= h.def.carry) { setGuard(u, u.x, u.y); return; }
  const o = h.order, d = Math.hypot(o.x - u.x, o.y - u.y), settled = !u.dest && !u.needPath;
  if (h.as === 'landed' && Math.hypot(h.x - o.x, h.y - o.y) < 6 && (d < LIFT_BOARD_R || (settled && d < CELL * 3))) { climbIn(u, h); return; }
  if (settled && d > LIFT_BOARD_R) goTo(u, o.x, o.y);
}
function climbIn(u, h) {
  (h.cargo || (h.cargo = [])).push({ type: u.type, hp: u.hp, rank: u.rank || 0, kills: u.kills || 0, kw: u.killWorth || 0, born: u.born });
  if (u.inHouse) leaveHouse(u);
  u.alive = false;   // aboard (made again when it unloads); not a loss
  hooks.sfx('place', h.x, h.y);
}
// Infantry selected, a transport tapped: it comes and lands beside them (or waits where it is parked) and they get in.
function commandBoard(units, h) {
  if (!h || !h.alive || h.kind !== 'unit' || !(h.def.lift || h.def.apc)) return;
  const inf = units.filter((u) => canBoard(u) && u.team === h.team).sort((a, b) => dist(a, h) - dist(b, h));
  if (!inf.length) return;
  const room = h.def.carry - (h.cargo || []).length - boardersOf(h).filter((b) => !inf.includes(b)).length;
  if (room <= 0) { say(h.team, 'Transport full'); return; }
  const go = inf.slice(0, room);
  if (inf.length > room) say(h.team, 'Transport full');
  if (h.def.apc) {
    for (const u of go) {
      u.order = { type: 'board', target: h }; u.target = null; u.staged = false; u.defending = false; u.homeward = false; u.assisting = false; takeOver(u, 'move');
      goTo(u, h.x, h.y);
    }
    return;
  }
  if (!liftWaiting(h)) {
    const mx = go.reduce((s, u) => s + u.x, 0) / go.length, my = go.reduce((s, u) => s + u.y, 0) / go.length;
    const parked = h.as === 'landed' && h.order.type === 'guard' && !h.order.pad && Math.hypot(h.x - mx, h.y - my) < CELL * 12;
    const s = parked ? { x: h.x, y: h.y } : landSpot(mx, my, h);
    if (!s) { say(h.team, 'Cannot land there'); return; }
    h.order = { type: 'lift', step: 'pick', x: s.x, y: s.y, t: 0 }; h.target = null; takeOver(h, 'move');
  }
  for (const u of go) {
    u.order = { type: 'board', target: h }; u.target = null; u.staged = false; u.defending = false; u.homeward = false; u.assisting = false; takeOver(u, 'move');
    goTo(u, h.order.x, h.order.y);
  }
}
// A transport sent somewhere: loaded, it lands there and unloads, then flies home; empty, it lands there and waits.
function liftTo(u, x, y) {
  const s = landSpot(x, y, u);
  if (!s) { say(u.team, 'Cannot land there'); if (u.order.type === 'move') setGuard(u); return; }
  for (const b of boardersOf(u)) setGuard(b, b.x, b.y);
  u.order = { type: 'lift', step: 'go', x: s.x, y: s.y }; u.target = null; u.repairHold = false;
}
// --- Armoured personnel carriers (APC, `def.apc`) --------------------------------------
// Boarding as for a transport helicopter (commandBoard, updateBoard: they walk up to the APC wherever it is), the passengers kept
// as plain data in u.cargo. commandUnload: it stops and lets one out every APC_DROP_GAP (unloadOne), unless given another order.
// Destroyed with soldiers aboard (kill): each gets out of the wreck with APC_ESCAPE chance, with APC_ESCAPE_HP of the health
// they had; the rest are lost. Host only, like every new entity.
const APC_BOARD_R = CELL * 0.9, APC_DROP_GAP = 0.3, APC_ESCAPE = 0.5, APC_ESCAPE_HP = 0.5;
function commandUnload(units) {
  for (const u of units) {
    if (!u || !u.alive || u.kind !== 'unit' || !u.def.apc || !(u.cargo && u.cargo.length)) continue;
    setGuard(u, u.x, u.y); u.target = null; u.unload = true; u.unloadT = 0;
  }
}
function updateUnload(u, dt) {
  if (!u.cargo || !u.cargo.length || u.order.type !== 'guard') { u.unload = false; return; }
  if (u.moving) return;
  if ((u.unloadT = (u.unloadT || 0) - dt) > 0) return;
  u.unloadT = APC_DROP_GAP;
  unloadOne(u);
  if (!u.cargo.length) u.unload = false;
}
function apcEscape(e) {
  const out = [];
  for (const r of e.cargo) if (Math.random() < APC_ESCAPE) out.push(Object.assign({}, r, { hp: Math.max(1, Math.round(r.hp * APC_ESCAPE_HP)) }));
  const n = out.length;
  e.cargo = out;
  while (e.cargo.length) {
    const u = unloadOne(e);
    if (u && u.alive && !teamOf(u).isAI) { u.manual = false; u.manualFrom = 0; }   // (not an order of the player's: they defend themselves as usual)
  }
  return n;
}
// Air Assault: the side's idle infantry by a Barracks, as even a mix of kinds as there is, up to a transport's load.
// prefer (the computer's personalities): kinds taken more than once a round, e.g. { rifle: 3 }.
function assaultCrew(team, bar, n, prefer) {
  const pool = unitsOf(team.id).filter((u) => canBoard(u) && !u.def.engineer && !u.inHouse && u.order.type === 'guard' && !u.order.hold &&
    !u.defending && !u.assisting && !u.garrison && !u.homeGuard && !(u.target && u.target.alive) && dist(u, bar) < CELL * ASSAULT_REACH);
  const kinds = new Map();
  for (const u of pool.sort((a, b) => dist(a, bar) - dist(b, bar))) (kinds.get(u.type) || kinds.set(u.type, []).get(u.type)).push(u);
  const w = (l) => (prefer && prefer[l[0].type]) || 1;
  const lists = [...kinds.values()].sort((a, b) => w(b) - w(a) || b.length - a.length), out = [], at = lists.map(() => 0);
  while (out.length < n && lists.some((l, j) => at[j] < l.length)) {
    lists.forEach((l, j) => { for (let k = 0; k < w(l) && at[j] < l.length && out.length < n; k++) out.push(l[at[j]++]); });
  }
  return out;
}
// What an Air Assault would use now: { heli, bar, crew }, or why not ('heli': no free transport, 'crew': too few idle infantry).
// opt (the computer): prefer (assaultCrew), min (fewest soldiers worth flying).
function assaultPlan(team, opt = {}) {
  const helis = unitsOf(team.id).filter(liftReady);
  if (!helis.length) return 'heli';
  const carry = helis[0].def.carry;
  let best = null;
  for (const bar of buildingsOf(team.id)) {
    if (bar.type !== 'barracks' || bar.buildT < 1 || bar.sellT > 0) continue;
    const crew = assaultCrew(team, bar, carry, opt.prefer);
    if (!best || crew.length > best.crew.length) best = { bar, crew };
  }
  if (!best || best.crew.length < Math.min(carry, opt.min || ASSAULT_MIN)) return 'crew';
  best.heli = helis.reduce((a, b) => (dist(a, best.bar) <= dist(b, best.bar) ? a : b));
  return best;
}
function commandAirAssault(team, x, y) {
  const plan = assaultPlan(team);
  if (typeof plan === 'string') { say(team.id, plan === 'heli' ? 'No transport available' : 'Not enough infantry at the Barracks'); return false; }
  const drop = landSpot(x, y, plan.heli);
  if (!drop) { say(team.id, 'Cannot land there'); return false; }
  return startAssault(team, plan, drop);
}
// The pickup by the Barracks and the flight to `drop`. extra (the computer): mode (unloadOne's ai), goAt (not before then).
function startAssault(team, plan, drop, extra = {}) {
  const { heli, bar, crew } = plan;
  const pick = landSpot(bar.x, (bar.cy + bar.h + 2.5) * CELL, heli);
  if (!pick) { say(team.id, 'Cannot land there'); return false; }
  heli.order = { type: 'lift', step: 'pick', x: pick.x, y: pick.y, dx: drop.x, dy: drop.y, t: 0, ai: extra.mode || (team.isAI ? 'hunt' : false) }; heli.target = null;
  if (extra.goAt !== undefined) heli.order.goAt = extra.goAt;
  for (const u of crew) {
    u.order = { type: 'board', target: heli }; u.target = null; u.staged = false; u.homeward = false; takeOver(u, 'move');
    goTo(u, pick.x, pick.y);
  }
  say(team.id, 'Air assault under way');
  return true;
}

// --- Jet landings ---------------------------------------------------------------
// A jet lines up with its slot's runway, descends along a glide path at landing speed, touches down
// short of the slot, brakes along the ground and then taxis round to park. Slots in the Airfield's
// east column land westward so nobody rolls through a jet parked in the west column.
const LAND_GLIDE = 170, LAND_ROLL = 50, LAND_SPEED = 100;
function runwayDir(pad, spot) {
  if (pad.type !== 'airfield') return 1;
  const dx = spot.x - pad.cx * CELL;
  const dir = dx > 57 ? -1 : 1;
  // Near a map edge there may be no room for the approach on that side: land the other way.
  const room = LAND_ROLL + LAND_GLIDE + 150, fits = (d) => spot.x - d * room >= 8 && spot.x - d * room <= WORLD - 8;
  return fits(dir) || !fits(-dir) ? dir : -dir;
}
function landJet(u, spot, dir, dt) {
  const T = { x: spot.x - dir * LAND_ROLL, y: spot.y };
  const along = (T.x - u.x) * dir, lat = Math.abs(u.y - T.y);   // along: run still to go to the touchdown point
  const head = Math.abs(angDiff(dir > 0 ? 0 : Math.PI, u.face));
  if (!u.final && along > 50 && along < LAND_GLIDE + 230 && lat < Math.min(150, along * 0.75) && head < 1.4) u.final = true;
  if (u.final && along < 45 && lat > 32) u.final = false;      // too far off the line: go round again
  if (!u.final) {
    // Fly to a point well out on the approach line, climbing back to cruise height if it had started down.
    u.alt = Math.min(JET_ALT, (u.alt || 0) + 25 * dt);
    flyJet(u, Math.max(8, Math.min(WORLD - 8, T.x - dir * (LAND_GLIDE + 150))), T.y, dt);
    return;
  }
  const frac = Math.max(0, Math.min(1, along / LAND_GLIDE));
  u.face = turnToward(u.face, Math.atan2(T.y - u.y, T.x - u.x), u.def.turn * 1.8 * dt);   // banking hard to get onto the line
  u.alt = JET_ALT * frac;
  u.speedCur = LAND_SPEED + (u.def.speed - LAND_SPEED) * frac * frac;
  u.x += Math.cos(u.face) * u.speedCur * dt; u.y += Math.sin(u.face) * u.speedCur * dt;
  u.moving = true;
  clampAir(u);
  if (along <= 4) {   // wheels down
    u.as = 'landed'; u.alt = 0; u.speedCur = LAND_SPEED;
    u.roll = LAND_ROLL; u.rollTo = { x: spot.x, y: spot.y }; u.final = false; u.rt = 0;
    if (u.retreat || u.rearming) u.repairHold = u.hp < u.maxHp; u.retreat = false; strikeOver(u);
  }
}
function rollOut(u, dt) {
  const to = u.rollTo, left = Math.hypot(to.x - u.x, to.y - u.y);
  u.alt = 0; u.moving = true;
  if (left <= 1.5) { u.x = to.x; u.y = to.y; u.roll = 0; u.rollTo = null; u.speedCur = 0; u.moving = false; return; }
  u.face = turnToward(u.face, Math.atan2(to.y - u.y, to.x - u.x), 6 * dt);   // wheels steer it onto its slot
  u.speedCur = Math.max(14, LAND_SPEED * Math.min(1, left / LAND_ROLL));
  const step = Math.min(left, u.speedCur * dt);
  u.x += (to.x - u.x) / left * step; u.y += (to.y - u.y) / left * step;
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
// A power with `upgrade` (Close Air Support) is only there once that Tech Center upgrade is researched; it charges from then on.
const hasPower = (team, key) => !POWERS[key].upgrade || hasUpgrade(team, POWERS[key].upgrade);
function powerReady(team, key) { return hasBuilt(team, 'airfield') && hasPower(team, key) && (team.powers[key] || 0) >= POWERS[key].charge; }
// How many close air support planes fly in: the highest tier researched (cas1 to cas3).
const casPlanes = (team) => hasUpgrade(team, 'cas3') ? 3 : hasUpgrade(team, 'cas2') ? 2 : 1;
// Close Air Support shot down (owner, 2026-11-22, both modes): when every plane of a strike is shot down (none flies home), the
// power takes CAS_LOST_PEN seconds longer to charge (240 s becomes 360 s from the launch). team.powerPen[key]: the extra
// seconds this charge carries (the sidebar shows the bar over the longer time); cleared when it is ready or used.
const CAS_LOST_PEN = 120;
function casLost(u) {
  const S = u.flight && u.flight.strike;
  if (!S || ++S.lost < S.n) return;
  const team = G.teams[S.team];
  if (!team || G.remote) return;
  team.powers.cas = (team.powers.cas || 0) - CAS_LOST_PEN;
  (team.powerPen || (team.powerPen = {})).cas = CAS_LOST_PEN;
  say(team.id, 'Air support lost: it will take longer to be ready');
}
function updatePowers(team, dt) {
  if (!hasBuilt(team, 'airfield')) return;
  for (const [key, p] of Object.entries(POWERS)) {
    if (!hasPower(team, key)) continue;
    if ((team.powers[key] || 0) >= p.charge) continue;
    team.powers[key] = Math.min(p.charge, (team.powers[key] || 0) + dt * (team.low ? 0.5 : 1));
    if (team.powers[key] >= p.charge) { notify(team, 'pw' + key, p.ready, 1); if (team.powerPen) delete team.powerPen[key]; }
  }
}
// The plane takes off from behind its own base and flies straight over the target.
function launchPower(team, key, x, y) {
  if (!powerReady(team, key)) return false;
  team.powers[key] = 0;
  const type = key === 'spy' ? 'spyplane' : key === 'para' ? 'transport' : key === 'cas' ? CAS_PLANE[team.faction] : 'bomber';
  const hx = (team.start.cx + 0.5) * CELL, hy = (team.start.cy + 0.5) * CELL;
  const a = Math.atan2(y - hy, x - hx), back = Math.hypot(x - hx, y - hy) + 260;
  // With the Airborne division upgrade (para2) a second transport flies alongside, 70 px to one side and a little behind.
  // Close air support: 1 to 3 planes by tier, the lead in the middle and the others 60 px to either side, a little behind; each works its own part of the area.
  const planes = key === 'para' && hasUpgrade(team, 'para2') ? [0, 1] : key === 'cas' ? [0, 1, 2].slice(0, casPlanes(team)) : [0];
  const strike = key === 'cas' ? { team: team.id, n: planes.length, lost: 0 } : null;   // (casLost: all shot down, a longer recharge)
  if (team.powerPen) delete team.powerPen[key];
  for (const i of planes) {
    const cas = key === 'cas', side = cas ? [0, 60, -60][i] : i ? 70 : 0, lag = cas ? (i ? 45 : 0) : i ? 50 : 0, nx = -Math.sin(a) * side, ny = Math.cos(a) * side;
    const u = addUnit(type, team, x + nx - Math.cos(a) * (back + lag), y + ny - Math.sin(a) * (back + lag));
    u.face = u.tface = a; u.alt = JET_ALT; u.as = 'fly';
    u.order = { type: 'flight' };
    u.flight = { key, tx: x + nx, ty: y + ny, done: false, bombs: 0, bombT: 0 };
    if (cas) Object.assign(u.flight, { ax: x + nx, ay: y + ny, pass: 0, msl: u.def.msl.ammo, fired: 0, mslT: 0, gunDone: false, phase: 'in', strike });
  }
  return true;
}
// --- Close air support (POWERS.cas): each plane makes POWERS.cas.passes runs over the area, then leaves the way it came.
// A run: on the way in, from about the missiles' range, it fires msl.perPass homing missiles (rof apart) at what it finds in the area
// (casPick: vehicles first, then defences, then other buildings, then infantry); then, when a ground target lies nearly dead ahead within
// the gun's range, one gun run (startStrafe / tickStrafe with its own gun: anti-tank shells walked along the flight line). Past the area it
// flies on CAS_OUT px, turns round (flyJet) and comes back for the next run. Host only (the guest gets the planes and shots in snapshots).
const CAS_OUT = 230, CAS_AHEAD = 0.45, CAS_TURN_MAX = 6;   // (a full circle takes about 4 s)
function casFoes(u, x, y, r) {
  const out = [];
  for (const e of G.entities) {
    if (!e.alive || !hostile(e.team, u.team) || isAirborne(e) || e.inHouse || e.chute) continue;
    if (e.kind === 'bld' ? camoHidden(e, u.team) : e.kind !== 'unit') continue;
    if (Math.hypot(e.x - x, e.y - y) <= r + (e.kind === 'bld' ? CELL : 0)) out.push(e);
  }
  return out;
}
const casRank = (e) => e.kind === 'unit' ? (e.cls === 'veh' ? (e.def.armor === 'heavy' ? 0 : 1) : 4) : e.def.defense ? 2 : 3;
function casPick(u, list, avoid) {
  let best = null, bs = Infinity;
  for (const e of list) {
    const s = casRank(e) * 1000 + Math.hypot(e.x - u.x, e.y - u.y) * 0.5 + (avoid && avoid.has(e) ? 600 : 0);
    if (s < bs) { bs = s; best = e; }
  }
  return best;
}
function updateCas(u, dt) {
  const f = u.flight, P = POWERS.cas, d = u.def;
  u.alt = JET_ALT;
  tickStrafe(u, dt);
  if (f.phase === 'turn') {   // coming round for the next run
    // Near the map edge flyJet pins the plane inside the world, and an area closer than its turning circle can then never be lined up
    // on: it circled there for ever. After TURN_MAX seconds it gives the run up and leaves.
    if ((f.turnT = (f.turnT || 0) + dt) > CAS_TURN_MAX) { f.phase = 'out'; return; }
    flyJet(u, f.ax, f.ay, dt);
    const want = Math.atan2(f.ay - u.y, f.ax - u.x);
    if (Math.abs(angDiff(u.face, want)) < 0.12) { f.phase = 'in'; f.turnT = 0; f.fired = 0; f.gunDone = false; f.mslT = 0; }
    return;
  }
  u.speedCur = d.speed; u.moving = true;
  const ca = Math.cos(u.face), sa = Math.sin(u.face);
  let past = (u.x - f.ax) * ca + (u.y - f.ay) * sa;   // how far beyond the middle of the area (along its heading)
  if (f.phase === 'in' && past < -80) u.face = turnToward(u.face, Math.atan2(f.ay - u.y, f.ax - u.x), d.turn * 0.4 * dt);   // lines up on the area as it comes in
  u.x += Math.cos(u.face) * d.speed * dt; u.y += Math.sin(u.face) * d.speed * dt;
  past = (u.x - f.ax) * Math.cos(u.face) + (u.y - f.ay) * Math.sin(u.face);
  if (f.phase === 'in' && !G.remote) {
    const foes = past > -d.msl.range && past < 40 ? casFoes(u, f.ax, f.ay, P.r) : null;
    // Missiles: perPass a run, at targets ahead of it, a different one each where it can.
    if (foes && f.msl > 0 && f.fired < d.msl.perPass && (f.mslT -= dt) <= 0) {
      const ahead = foes.filter((e) => Math.abs(angDiff(u.face, Math.atan2(e.y - u.y, e.x - u.x))) < 1.1 && Math.hypot(e.x - u.x, e.y - u.y) <= d.msl.range);
      const shot = f.shot || (f.shot = []);
      const t = casPick(u, ahead.filter((e) => e.kind === 'bld' || e.cls === 'veh'), new Set(shot.map((id) => G.byId.get(id)).filter(Boolean)));
      if (t) { fireWeapon(u, d.msl, t); f.msl--; f.fired++; f.mslT = d.msl.rof; shot.push(t.id); if (shot.length > 6) shot.shift(); }
    }
    // The gun: one run a pass, at the best target nearly dead ahead and within reach.
    if (foes && !f.gunDone && !u.strafe) {
      const ahead = foes.filter((e) => { const dd = Math.hypot(e.x - u.x, e.y - u.y); return dd <= d.gun.range && dd > 40 && Math.abs(angDiff(u.face, Math.atan2(e.y - u.y, e.x - u.x))) < CAS_AHEAD; });
      const t = casPick(u, ahead);
      if (t) { startStrafe(u, t); f.gunDone = true; }
    }
  }
  if (f.phase === 'in' && past > CAS_OUT) {
    if (++f.pass < P.passes) f.phase = 'turn';
    else f.phase = 'out';
  }
  if (f.phase === 'out' && (past > CAS_OUT + 700 || u.x < -200 || u.y < -200 || u.x > WORLD + 200 || u.y > WORLD + 200)) u.alive = false;   // gone without a wreck
}
function updateFlight(u, dt) {
  if (u.flight.key === 'cas') { updateCas(u, dt); return; }
  const f = u.flight, ca = Math.cos(u.face), sa = Math.sin(u.face);
  u.alt = JET_ALT; u.moving = true; u.speedCur = u.def.speed;
  u.x += ca * u.def.speed * dt; u.y += sa * u.def.speed * dt;
  const past = (u.x - f.tx) * ca + (u.y - f.ty) * sa;   // distance flown beyond the target
  if (f.key === 'spy' && !f.done && past >= 0) {
    f.done = true;
    revealCircle(f.tx / CELL, f.ty / CELL, POWERS.spy.reveal, G.fog[u.team]);
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
    const a = i / squad.length * Math.PI * 2, r = squad.length > 8 ? 22 : 16;
    const c = nearestFreeCell(cellOfPos(x + Math.cos(a) * r, y + Math.sin(a) * r), 5);
    if (c < 0) return;
    const p = cellCenter(c), u = addUnit(type, team, p.x + (Math.random() - 0.5) * 8, p.y + (Math.random() - 0.5) * 8);
    u.chute = 1.3 + i * 0.14;
    setHunt(u); u.raider = true;   // once down, they wreck the nearest structures, one after another
  });
}

// ---------------------------------------------------------------------------
// Structures
// ---------------------------------------------------------------------------
const REPAIR_STEP = 0.00375;   // share of full health restored every quarter second (1.5% a second)
function updateBuilding(b, dt) {
  const team = teamOf(b);
  if (b.capU) {   // a capture under way: dropped when its Engineer is gone, sent elsewhere or no longer beside it
    const e = G.byId.get(b.capU);
    if (!e || !e.alive || e.order.type !== 'engineer' || e.order.target !== b || distTo(e, b) > CELL * 3) { b.capU = null; b.capture = 0; }
  }
  b.fireT = Math.max(0, b.fireT - dt);
  b.charge = Math.max(0, b.charge - dt * 1.5);
  if (b.c4T && !G.remote) {   // a Specialist's charge: let go if the structure came over to its side, else it blows on time
    if (!hostile(b.c4Team, b.team)) { b.c4T = 0; b.c4By = null; }
    else if (G.t >= b.c4T) { c4Blast(b); return; }
  }
  if (b.buildT < 1) {
    b.buildT = Math.min(1, b.buildT + dt / BUILD_UP);
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
      else { b.repairing = false; notify(team, 'funds', 'Insufficient funds', 30); }
    }
  }
  // (Power plant smoke: plantSmoke. Fire and smoke on damaged structures: structureDamageFx.)
  if (b.def.camo) b.exposed = b.buildT < 1 || (b.revealT = Math.max(0, (b.revealT || 0) - dt)) > 0;   // seen while going up, then only when it gives itself away
  const w = b.def.weapon;
  if (!w || b.buildT < 1) return;
  tickBurst(b, dt);
  b.cd = Math.max(0, b.cd - dt);
  if (w.needsPower && team.low) return;
  b.think -= dt;
  if (b.think <= 0) {
    b.think = 0.3;
    if (b.def.camo) for (const e of G.entities) if (e.alive && e.kind === 'unit' && hostile(e.team, b.team) && !isAirborne(e) && Math.hypot(e.x - b.x, e.y - b.y) < CAMO_DETECT) { b.revealT = CAMO_REVEAL; break; }
    const src = { x: b.x, y: b.y, team: b.team };
    if (!b.target || !b.target.alive || distTo(src, b.target) > w.range || !clearShot(b, b.target, w)) b.target = acquire(src, w.range, [w]);
  }
  const t = b.target;
  if (!t || !t.alive) return;
  const ang = Math.atan2(t.y - (t.alt || 0) - b.y, t.x - b.x);
  if (b.type !== 'tesla') b.tface = turnToward(b.tface, ang, 5 * dt);
  if (b.cd <= 0 && clearShot(b, t, w) && (b.type === 'tesla' || Math.abs(angDiff(ang, b.tface)) < 0.15)) { shoot(b, w, t); b.cd = w.rof; if (b.def.camo) b.revealT = CAMO_REVEAL; }
  if (w.jet) flameBurn(b, w, t, dt);
}

// The Flame Tower's jet of fire (drawn by ui.js flameJet) burns what stands in it. While the tower is engaging (a target in
// range and a shot within a reload, as the jet is drawn), every hostile ground unit within w.jet.width px of the line from
// the tower out along its aim, as far as the target, takes w.jet.dps (FIRE warhead) a second, in ticks of JET_TICK; the
// target itself always does. Shots still fly and land as before. burnT is a host timer (netcore.js SKIP).
const JET_TICK = 0.25;
function flameBurn(b, w, t, dt) {
  if (G.remote) return;
  if ((b.burnT = (b.burnT || 0) - dt) > 0) return;
  b.burnT += JET_TICK;
  if (b.burnT < 0) b.burnT = 0;
  const len = Math.hypot(t.x - b.x, t.y - b.y);
  if (len > w.range + 12 || G.t - (b.shotAt == null ? -99 : b.shotAt) > w.rof + 0.5) return;
  const ca = Math.cos(b.tface), sa = Math.sin(b.tface), amt = w.jet.dps * JET_TICK;
  const mx = b.x + ca * len / 2, my = b.y + sa * len / 2;
  let hitT = false;
  const once = new Set();
  for (const bucket of nearBuckets(mx, my, len / 2 + w.jet.width + 12)) for (const e of bucket) {
    if (!e.alive || e.kind !== 'unit' || isAirborne(e) || !hostile(b.team, e.team)) continue;
    const dx = e.x - b.x, dy = e.y - b.y, along = dx * ca + dy * sa;
    if (along < 6 || along > len + 6 || Math.abs(dx * sa - dy * ca) > w.jet.width + (e.def.r || 0)) continue;
    if (e === t) hitT = true;
    damage(e, amt, w.wh, b, null, once);
  }
  if (!hitT && t.alive && hostile(b.team, t.team) && !isAirborne(t)) damage(t, amt, w.wh, b, null, once);
}

// How far (in cells) from one of its own structures a side may place a new one; Outposts reach further.
const BUILD_RANGE = 6;
function canPlace(team, type, cx, cy, gap) {
  const d = BUILD_DEFS[type];
  if (cx < 1 || cy < 1 || cx + d.w > MAP - 1 || cy + d.h + (d.exit ? 1 : 0) > MAP - 1) return false;
  for (let y = cy; y < cy + d.h; y++) for (let x = cx; x < cx + d.w; x++) {
    const c = idx(x, y);
    if (G.block[c] || G.bld[c] || G.ore[c] > 0 || G.resv[c] || G.wall[c]) return false;
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
  // The computer never builds where the exit is walled in (trees, rocks, water, buildings): Ore Trucks would be stuck.
  if (near && d.exit && team.isAI && !exitOpens(idx(cx + Math.floor(d.w / 2), cy + d.h), cx, cy, d.w, d.h)) return false;
  return near;
}
// Does the cell below a new building open onto real ground? Fills outward from it (not through the new
// footprint, other buildings or blocked cells) and succeeds once it has found plenty of open cells.
function exitOpens(start, fx, fy, fw, fh) {
  const seen = new Set([start]), q = [start];
  for (let i = 0; i < q.length; i++) {
    if (q.length >= 150) return true;
    const c = q[i], x = cellX(c), y = cellY(c);
    for (let k = 0; k < 4; k++) {
      const nx = x + DIRS8[k][0], ny = y + DIRS8[k][1];
      if (!inMap(nx, ny) || (nx >= fx && nx < fx + fw && ny >= fy && ny < fy + fh)) continue;
      const n = idx(nx, ny);
      if (!seen.has(n) && !G.block[n] && !G.bld[n]) { seen.add(n); q.push(n); }
    }
  }
  return q.length >= 150;
}

// The structure or defence being built (the computer builds one at a time across both slots).
function pendingStructure(team) { return team.queues.structure || team.queues.defense || null; }
function placeStructure(team, type, cx, cy) {
  const slot = catOf(type), q = team.queues[slot];
  if (!q || !q.ready || q.type !== type || !canPlace(team, type, cx, cy, team.isAI ? 1 : 0)) return false;
  team.queues[slot] = null;
  const b = addBuilding(type, team, cx, cy);
  if (team.id === G.me && typeof Report !== 'undefined' && Report.crumb) Report.crumb('placed ' + type);
  hooks.sfx('place', b.x, b.y);
  hooks.sfx('build', b.x, b.y);
  if (type === 'refinery') {
    const p = cellCenter(b.exitCell);
    const h = addUnit('harv', team, p.x, p.y);
    h.face = Math.PI / 2;
  }
  // A new Helipad comes with a helicopter and a new Airfield with a jet, parked and ready (not one that still
  // needs a Tech Center: the Allied Attack Helicopter).
  if (type === 'helipad' || type === 'airfield') {
    const free = Object.keys(UNIT_DEFS).find((k) => UNIT_DEFS[k].producer === type && UNIT_DEFS[k].factions.includes(team.faction));
    if (free && available(team, free)) spawnUnit(team, free);
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
  if (d.upgrade && !hasUpgrade(team, d.upgrade)) return false;   // a unit a Tech Center upgrade unlocks (the Comanche)
  if (UNIT_DEFS[type]) return hasBuilt(team, d.producer) && (d.req || []).every((r) => hasBuilt(team, r));
  return hasBuilt(team, 'cy') && d.req.every((r) => hasBuilt(team, r));
}

// --- Tech Center upgrades (UPGRADES in data.js) ------------------------------------
// team.upgrades: { id: true } once researched (lost with the side's last Tech Center, see kill). team.research: { id, progress, spent } while one is under
// way, paid as it goes like production (half speed on low power). Plain data: saved, and sent to online players (netcore TEAM).
function hasUpgrade(team, id) { return !!(team.upgrades && team.upgrades[id]); }
// `needs`: an upgrade researched first (the tiers of Close Air Support); `req`: a building it also needs (the Airfield).
function canResearch(team, id) {
  const u = UPGRADES[id];
  return !!u && u.factions.includes(team.faction) && !hasUpgrade(team, id) && hasBuilt(team, 'tech')
    && (!u.needs || hasUpgrade(team, u.needs)) && (!u.req || hasBuilt(team, u.req));
}
function startResearch(team, id) {
  if (!canResearch(team, id)) return 'Not available';
  if (team.research) return team.research.id === id ? 'busy-same' : 'busy';
  team.research = { id, progress: 0, spent: 0 };
  return null;
}
function cancelResearch(team, id) {
  const r = team.research;
  if (!r || (id && r.id !== id)) return false;
  team.credits += r.spent; team.research = null;
  return true;
}
function updateResearch(team, dt) {
  const r = team.research;
  if (!r) return;
  if (!hasBuilt(team, 'tech')) { cancelResearch(team); notify(team, 'research', 'Research cancelled', 4); return; }   // the last Tech Center is gone: money back
  const up = UPGRADES[r.id], speed = (team.low ? 0.5 : 1) * (team.isAI ? G.diff.speed : 1);
  const dp = Math.min(dt * speed / up.time, 1 - r.progress), cost = up.cost * dp;
  if (team.credits < cost) { r.stalled = true; notify(team, 'funds', 'Insufficient funds', 30); return; }
  r.stalled = false;
  team.credits -= cost; r.spent += cost; r.progress += dp;
  if (r.progress >= 0.9999) {
    (team.upgrades || (team.upgrades = {}))[r.id] = true;
    team.research = null;
    notify(team, 'upgrade', 'Upgrade complete', 2);
  }
}

// A unit with `max` (the Sniper): how many a side has, alive (aboard a transport too) or queued.
function unitCount(team, type) {
  let n = (team.queues[catOf(type)] || []).filter((i) => i.type === type).length;
  for (const e of G.entities) {
    if (!e.alive || e.team !== team.id || e.kind !== 'unit') continue;
    if (e.type === type) n++;
    if (e.cargo) for (const c of e.cargo) if (c.type === type) n++;
  }
  return n;
}

// Most units one queue holds (the one being built included).
const QUEUE_MAX = 20;

function startProduction(team, type) {
  const cat = catOf(type);
  // The structure already queued answers first: one that is finished can still be placed after a building it
  // needed is lost (it is paid for), and one being built waits (updateProduction) until that is rebuilt.
  if (isBuildCat(cat) && team.queues[cat] && team.queues[cat].type === type) return team.queues[cat].ready ? 'place' : 'busy-same';
  if (!available(team, type)) return 'Not available';
  if (isBuildCat(cat)) {
    const q = team.queues[cat];
    if (q) return q.type === type ? (q.ready ? 'place' : 'busy-same') : 'busy';
    team.queues[cat] = { type, progress: 0, spent: 0, ready: false };
    return null;
  }
  const list = team.queues[cat];
  if (list.length >= QUEUE_MAX) return 'full';
  if (UNIT_DEFS[type].max && unitCount(team, type) >= UNIT_DEFS[type].max) return 'limit';
  if (padRoom(team, UNIT_DEFS[type].producer) <= 0) return 'pads-full';
  list.push({ type, progress: 0, spent: 0 });
  return null;
}

function cancelProduction(team, type) {
  const cat = catOf(type);
  if (isBuildCat(cat)) {
    const q = team.queues[cat];
    if (q && q.type === type) { team.credits += q.spent; team.queues[cat] = null; return true; }
    return false;
  }
  const list = team.queues[cat];
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].type === type) { team.credits += list[i].spent; list.splice(i, 1); return true; }
  }
  return false;
}

// Each extra Barracks, War Factory, Helicopter Base or Airfield speeds up its queue: 1.5x with two,
// 2x with three, at most 2.5x. Production still runs one unit at a time per queue.
const PRODUCER_BOOST = [1, 1, 1.5, 2, 2.5];
const BOOSTED = new Set(['barracks', 'factory', 'helipad', 'airfield', 'cy']);   // structures count Construction Yards
function producerBoost(team, def, cat) {
  const by = isBuildCat(cat) ? 'cy' : def.producer;
  if (!BOOSTED.has(by)) return 1;
  const n = G.entities.filter((e) => e.alive && e.kind === 'bld' && e.team === team.id && e.type === by && e.sellT <= 0).length;
  return PRODUCER_BOOST[Math.min(n, PRODUCER_BOOST.length - 1)];
}
// The item a queue is working on: the first one whose producer still stands, so a jet queued
// after the Airfield was lost does not hold up the helicopters behind it.
function activeItem(team, cat) {
  const list = team.queues[cat];
  return list.find((i) => available(team, i.type)) || list[0];
}
function updateProduction(team, dt) {
  const speed = (team.low ? 0.5 : 1) * (team.isAI ? G.diff.speed : 1);
  for (const cat of CATEGORIES) {
    const item = isBuildCat(cat) ? team.queues[cat] : activeItem(team, cat);
    if (!item || item.ready) continue;
    if (!available(team, item.type)) continue;
    const def = defOf(item.type);
    if (padRoom(team, def.producer) < 0) continue;   // an Airfield was lost: queued aircraft wait for room
    const dp = Math.min(dt * speed * producerBoost(team, def, cat) / buildTime(def), 1 - item.progress);
    const cost = def.cost * dp;
    if (team.credits < cost) { item.stalled = true; notify(team, 'funds', 'Insufficient funds', 30); continue; }
    item.stalled = false;
    team.credits -= cost; item.spent += cost; item.progress += dp;
    if (item.progress >= 0.9999) {
      if (isBuildCat(cat)) { item.ready = true; item.progress = 1; notify(team, 'cc', 'Construction complete', 0.5); }
      else { team.queues[cat].splice(team.queues[cat].indexOf(item), 1); spawnUnit(team, item.type); notify(team, 'ur', 'Unit ready', 4); }
    }
  }
}

// The War Factory's door (looks, both modes): a new vehicle waits inside while the door rolls up (DOOR_UP), then
// rolls out of the doorway (EMERGE; art.js drawUnit draws it from u.outX/outY to where it stands). The door stays
// open DOOR_HOLD and rolls down in DOOR_DOWN (doorOpen). G.doorQ holds the vehicles waiting (plain data, saved).
const DOOR_UP = 0.5, DOOR_HOLD = 1.4, DOOR_DOWN = 0.7, EMERGE = 0.6;
// How far the War Factory's door is open, 0 to 1, t seconds after it began to open: it rolls up in DOOR_UP,
// stays open DOOR_HOLD while the unit drives clear, then rolls down in DOOR_DOWN.
function doorOpen(t) {
  if (t < 0 || t >= DOOR_UP + DOOR_HOLD + DOOR_DOWN) return 0;
  if (t < DOOR_UP) return t / DOOR_UP;
  if (t < DOOR_UP + DOOR_HOLD) return 1;
  return 1 - (t - DOOR_UP - DOOR_HOLD) / DOOR_DOWN;
}
function updateDoors() {
  const q = G.doorQ;
  if (!q || !q.length) return;
  for (let i = q.length - 1; i >= 0; i--) {
    const w = q[i];
    if (G.t < w.at) continue;
    q.splice(i, 1);
    const team = G.teams[w.team], p = G.byId.get(w.p);
    if (team && !team.out) spawnUnit(team, w.type, p && p.alive && p.sellT <= 0 ? p : null);
  }
}

function spawnUnit(team, type, from) {
  const d = UNIT_DEFS[type];
  const producers = G.entities.filter((e) => e.alive && e.kind === 'bld' && e.team === team.id && e.type === d.producer && e.sellT <= 0);
  // Ground units come out of the side's primary building of that type (setPrimary), else the newest.
  const p = from || (d.cls === 'air' ? leastBusyPad(team.id, d.producer) : producers.find((e) => e.primary) || producers[producers.length - 1]);
  if (!p) return null;
  if (!from && d.cls !== 'air' && p.type === 'factory' && p.buildT >= 1) {   // open the door first (updateDoors)
    // From wherever the door is: rising or closing, it goes on up from there; already up, it stays up a while longer.
    const k = p.doorAt == null ? 0 : doorOpen(G.t - p.doorAt);
    p.doorAt = G.t - k * DOOR_UP;
    (G.doorQ || (G.doorQ = [])).push({ at: p.doorAt + DOOR_UP, team: team.id, type, p: p.id });
    return null;
  }
  let u;
  if (d.cls === 'air') {
    u = addUnit(type, team, 0, 0);
    u.home = p.id;
    const spot = padSpot(p, u);
    u.x = spot.x; u.y = spot.y; u.face = p.type === 'airfield' ? 0 : (team.id === PLAYER ? -0.8 : 2.35);
    u.as = 'landed'; u.alt = 0;
    setGuard(u); u.order.pad = true; u.staged = !oneWave(u) && !d.lift;
    if (d.lift) return u;
    if (team.isAI && aiKeepInterceptor(team, u)) return u;
    // The computer's new aircraft wait for its next air strike (launchGroups, AIR_STRIKE_GAP).
    if (team.auto && !oneWave(u) && !team.isAI) launchAircraft(u);
    return u;
  } else {
    let c = p.exitCell;
    if (c === undefined || !freeCell(c)) c = nearestFreeCell(idx(p.cx + Math.floor(p.w / 2), p.cy + p.h), 6);
    const pos = cellCenter(c);
    u = addUnit(type, team, pos.x + (Math.random() - 0.5) * 6, pos.y + (Math.random() - 0.5) * 4);
    u.face = u.tface = Math.PI / 2;
    if (p.type === 'factory' && from) {   // rolls out of the open door (art.js drawUnit)
      u.outT = G.t; u.outX = p.cx * CELL + 36; u.outY = p.cy * CELL + 40;
    }
  }
  if (d.harvester) return u;
  if (team.isAI && aiHomeGuard(team, u)) return u;
  // New units go to their building's rally point, else spread out around the base that made them;
  // auto attack launches them in groups.
  const { x: gx, y: gy } = p.rally ? rallySpot(p.rally) : scatterSpot(team, p);
  setGuard(u, gx, gy);
  u.staged = true;
  goTo(u, gx, gy);
  return u;
}

// A free spot near a rally point, so units sent there do not all stand on one cell.
function rallySpot(r) {
  const a = Math.random() * Math.PI * 2, d = Math.random() * 1.8 * CELL;
  let c = cellOfPos(r.x + Math.cos(a) * d, r.y + Math.sin(a) * d);
  if (!freeCell(c)) c = nearestFreeCell(c, 5);
  return c === undefined || c < 0 ? { x: r.x, y: r.y } : cellCenter(c);
}
// Primary building and rally points, for Barracks and War Factories (both modes, orders online).
const canRally = (b) => !!(b && b.alive && b.kind === 'bld' && b.def.exit && !b.def.depot && Object.values(UNIT_DEFS).some((d) => d.producer === b.type && d.cls !== 'air'));
function setPrimary(b) {
  if (!canRally(b)) return;
  for (const e of G.entities) if (e.kind === 'bld' && e.team === b.team && e.type === b.type) e.primary = false;
  b.primary = true;
}
function setRally(b, x, y) {
  if (!canRally(b)) return;
  b.rally = x == null || y == null ? null : { x: Math.max(0, Math.min(WORLD - 1, +x || 0)), y: Math.max(0, Math.min(WORLD - 1, +y || 0)) };
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
// Both sides uncover the map the same way, each into its own G.fog; only G.seen is drawn.
function revealAround() {
  for (const e of G.entities) {
    if (!e.alive || (e.def && e.def.scripted)) continue;   // support planes reveal nothing on the way (see damage)
    let rad = e.kind === 'bld' ? (e.def.sight || 3) + Math.max(e.w, e.h) / 2 : e.def.sight;
    const sh = G.hgt ? standH(e) : null;
    if (sh) rad += HG_SIGHT * sh / HG_MAX;   // from a hilltop, further
    revealCircle(e.x / CELL, e.y / CELL, rad, G.fog[e.team]);
  }
}
function revealCircle(cx, cy, rad, seen = G.seen) {
  for (let y = Math.floor(cy - rad); y <= cy + rad; y++) {
    for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      if (!inMap(x, y)) continue;
      const c = idx(x, y);
      if (!seen[c] && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= rad) { seen[c] = 1; if (seen === G.seen) G.shroudDirty = true; }
    }
  }
}

// As in Red Alert, ore grows back even while it is being mined, and spreads: now and then a field
// creeps one cell out onto open ground next to its ore (never next to a building, and at most
// ORE_SPREAD cells beyond where it started), so fields left alone slowly get bigger.
const ORE_SPREAD = 3;
function spreadOre(f) {
  const R = fieldReach(f), cells = [];
  for (let y = Math.floor(f.cy - R); y <= f.cy + R; y++) for (let x = Math.floor(f.cx - R); x <= f.cx + R; x++) if (inMap(x, y) && inFieldCell(f, x, y) && G.ore[idx(x, y)] >= 60) cells.push([x, y]);
  if (!cells.length) return;
  const [x0, y0] = cells[Math.floor(Math.random() * cells.length)], [dx, dy] = DIRS8[Math.floor(Math.random() * 8)];
  const x = x0 + dx, y = y0 + dy;
  if (!inMap(x, y)) return;
  const c = idx(x, y), d = Math.hypot(x - f.cx, y - f.cy);
  if (G.ore[c] || G.terr[c] >= 2 || G.block[c] || G.bld[c] || G.resv[c] || d > f.r + 0.8 + ORE_SPREAD) return;
  for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) if (inMap(x + ox, y + oy) && G.bld[idx(x + ox, y + oy)]) return;
  G.ore[c] = 15;
  f.ext = Math.max(f.ext || 0, d - f.r - 0.8);
}
// Team games (2 v 2, 3 v 3, co-op) have richer fields: TEAM_ORE_RICH times the ore (G.oreRich; 1 in a 1 v 1, and
// in saves from before 2026.11.05.3). Every side's Ore Trucks work the same fields, so they also grow back faster:
// ORE_REGROW_PER_SIDE cells a field per tick for each side in the battle (4 in a 2 v 2, 6 in a 3 v 3; one in a
// 1 v 1), and a nearly bare cell (under a third of what it can hold) grows back twice as fast, so a scraped-out
// field recovers in a couple of minutes instead of several.
const TEAM_ORE_RICH = 1.5, ORE_REGROW_PER_SIDE = 1;
function growOre() {
  const r = Math.random, rich = G.oreRich || 1, team = rich > 1, grows = team ? G.teams.length * ORE_REGROW_PER_SIDE : 1;
  for (const f of G.oreFields) {
    updateFieldRest(f);
    if (f.gem) continue;   // gems never grow back
    if (r() < 0.05) spreadOre(f);   // about once every 40 seconds
    for (let k = 0; k < grows; k++) {   // in a 1 v 1, one cell a field every couple of seconds: a scraped-out field takes several minutes to recover
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * fieldReach(f);
      const x = Math.floor(f.cx + Math.cos(a) * d), y = Math.floor(f.cy + Math.sin(a) * d);
      const c = inMap(x, y) ? idx(x, y) : -1;
      const cap = Math.round(Math.min(ORE_MAX, (60 + (1 - Math.min(1, d / f.r)) * 190) * f.rich) * rich);
      if (c >= 0 && !G.block[c] && !G.bld[c] && G.ore[c] < cap) G.ore[c] = Math.min(cap, G.ore[c] + (team && G.ore[c] < cap / 3 ? 30 : 15));
    }
  }
}

// The debrief: every 15 seconds each side's army value, income and buildings, and the key moments
// (first waves, big pushes, Outposts and Construction Yards lost).
function logSample() {
  const L = G.log;
  L.samples.push({ t: Math.round(G.t),
    army: G.teams.map((t) => unitsOf(t.id).filter((u) => !u.def.harvester && !u.def.scripted).reduce((a, u) => a + u.def.cost, 0)),
    income: G.teams.map((t) => { const h = t.stats.harvested, d = h - L.lastH[t.id]; L.lastH[t.id] = h; return Math.round(d * 60 / Math.max(1, G.t - (L.lastT || 0))); }),
    blds: G.teams.map((t) => buildingsOf(t.id).length),
    refs: G.teams.map((t) => buildingsOf(t.id).filter((b) => b.type === 'refinery').length),
    trucks: G.teams.map((t) => unitsOf(t.id).filter((u) => u.def.harvester).length) });
  L.lastT = G.t;
}
// The announcer's nudge to grow the economy: fewer than two Ore Trucks per refinery, a War Factory
// to build one, none on the way and the money for it. The computer keeps two per refinery.
function adviseTrucks(team) {
  if (G.t < 120 || G.over || !available(team, 'harv')) return;
  const refs = buildingsOf(team.id).filter((b) => b.type === 'refinery').length;
  const trucks = unitsOf(team.id).filter((u) => u.def.harvester).length;
  if (!refs || trucks >= refs * 2 || team.queues.vehicle.some((i) => i.type === 'harv') || team.credits < UNIT_DEFS.harv.cost) return;
  notify(team, 'trucks', 'More ore trucks needed', 90);
}
// more: extra fields. ai: 1 marks a computer's base moves (ai.js aiLog): in the match report only, not drawn in the debrief.
function logEvent(team, kind, more) { G.log.events.push(Object.assign({ t: Math.round(G.t), team, kind }, more)); }
function logWave(team, big) {
  if (!G.log.waves[team]++) logEvent(team, 'first wave');
  else if (big) logEvent(team, 'big push');
}

// A side is defeated once it has no production building left (Construction Yard, Barracks, War
// Factory, Helipad, Airfield) and no Mobile Construction Yard on the move.
// A side with nothing left to fight with is out (`out`); the battle ends when only one alliance has a
// side still in it. The winner is that alliance's `ally` number (in a 1 v 1, the same as its side).
function checkWin() {
  if (G.over || G.explore) return;   // (the map explorer: nobody to win or lose)
  for (const t of G.teams) if (!t.out && !inTheFight(t.id)) {
    t.out = true; startWipe(t);
    if (teamGame()) for (const o of G.teams) if (o !== t && !o.out) say(o.id, alliedSides(o.id, t.id) ? 'Ally defeated' : 'Enemy defeated');
  }
  const left = new Set(G.teams.filter((t) => !t.out).map((t) => t.ally));
  if (left.size <= 1) endBattle(left.size ? [...left][0] : G.teams[0].ally);   // (all gone at once: side 0's alliance wins, as before)
}
const allyOf = (side) => (G.teams[side] ? G.teams[side].ally : side);
const otherAlly = (side) => (allyOf(side) === 0 ? 1 : 0);
// how: undefined for the last production building destroyed, 'quit' when the loser surrendered, 'left' when
// an online opponent did not come back.
function endBattle(winner, how) {
  if (G.over) return;
  logSample();
  G.over = { winner, won: !!G.teams[G.me] && G.teams[G.me].ally === winner, t: G.t, how };
  hooks.gameOver(G.over.won);
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
// A direct order from the player takes a unit out of the auto logic (Auto Attack launches, base defence,
// scrambles, the Ally button) until Stop is pressed on it. The computer's own orders never set it.
// An attack order is different from a move or guard: once its target is dead and the unit has stood idle for
// MANUAL_IDLE seconds, it goes home and rejoins the auto logic (releaseIdle, once a second).
const MANUAL_IDLE = 180;
function takeOver(u, from) { if (!G.teams[u.team].isAI) { u.manual = true; u.manualFrom = from; u.idleSince = undefined; } }
function releaseIdle(team) {
  for (const u of unitsOf(team.id)) {
    if (!u.manual || u.manualFrom !== 'attack') continue;
    if (u.order.type !== 'guard' || u.order.hold) { u.idleSince = undefined; continue; }
    if (u.idleSince === undefined) { u.idleSince = G.t; continue; }
    if (G.t - u.idleSince < MANUAL_IDLE) continue;
    u.manual = false; u.manualFrom = undefined; u.idleSince = undefined;
    if (u.cls === 'air') { setGuard(u); u.order.pad = true; u.staged = true; continue; }
    const sp = scatterSpot(team, u);
    setGuard(u, sp.x, sp.y); u.staged = true; goTo(u, sp.x, sp.y);
  }
}
function commandMove(units, x, y) {
  const spots = formationSpots(units.length, x, y);
  const sorted = units.slice().sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  sorted.forEach((u, i) => {
    const s = spots[i];
    u.target = null; u.staged = false; u.defending = false; u.homeward = false; takeOver(u, 'move');
    if (u.def.harvester) {
      const c = cellOfPos(x, y);
      if (G.ore[c] > 0) { u.hcell = c; u.hs = 'seek'; u.field = fieldAt(c) || u.field; u.fieldPick = !!fieldAt(c); goTo(u, x, y); }   // sent to a field: it keeps coming back until the field is bare
      else { u.hs = 'manual'; u.fieldPick = false; goTo(u, s.x, s.y); }
    } else if (u.def.lift) {
      liftTo(u, s.x, s.y);
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
    u.order = { type: 'attack', target }; u.staged = false; u.homeward = false; u.defending = false; u.repairHold = false; u.retreat = false; takeOver(u, 'attack');
    u.target = target; assignLane(u);
    if (u.cls === 'air' && u.as === 'landed' && !airEmpty(u)) u.as = 'takeoff';
  }
}
// Attack: ground units hunt until told otherwise; the player's aircraft fly one strike (until their
// weapons are spent or they are badly hurt), then land and stay home.
function commandHunt(units) {
  for (const u of units) {
    if (u.def.harvester) continue;
    setHunt(u); u.staged = false; u.defending = false; takeOver(u, 'attack');
    if (u.cls === 'air') { u.oneStrike = true; if (u.as === 'landed' && !airEmpty(u)) u.as = 'takeoff'; }
  }
}
// Guard: hold an area until further notice. Nothing pulls them away (auto attack, base defence,
// scrambles); aircraft go home only to rearm or for repairs, then fly back to it.
function commandGuard(units, x, y) {
  const spots = formationSpots(units.length, x, y);
  units.forEach((u, i) => {
    if (u.def.harvester) return;
    const s = u.cls === 'air' ? { x, y } : spots[i];
    setGuard(u, s.x, s.y); u.order.hold = true;
    u.staged = false; u.defending = false; u.homeward = false; u.focus = null; u.oneStrike = false; u.scrambled = false; takeOver(u, 'guard');
    if (u.cls === 'air') { if (u.as === 'landed' && !airEmpty(u) && !u.repairHold) u.as = 'takeoff'; }
    else goTo(u, s.x, s.y);
  });
}
// Anti-aircraft-only ground units (the Mobile SAM) on an Auto Attack, a computer wave or an Attack move: they cannot hit
// anything on the ground, so they keep to the back of the army instead of driving at the enemy base ahead of it (they
// raced in front and died to the first defences). Each second: the nearest friendly ground fighter on the same kind of
// order within TRAIL_LOOK cells, and a spot TRAIL_GAP cells behind it (away from where the army is heading). Aircraft
// that come into reach are still shot at (the target search above runs first). No such friend: on a hunt it waits where
// it is for the next wave; on an Attack move it holds where it stopped once its escort has arrived, or goes on alone if it
// never had one (sent there by itself). Returns false to let the usual hunt or Attack move carry on.
const TRAIL_LOOK = 40, TRAIL_GAP = 4;
const aaOnly = (u) => { const w = u.def.weapon; return u.cls !== 'air' && !!w && w.ground === false && !(u.def.weapon2 && u.def.weapon2.ground !== false); };
function trailArmy(u, o) {
  if (u.trailT > G.t) return true;
  u.trailT = G.t + 1;
  const hunt = o.type === 'hunt';
  let lead = null, best = (TRAIL_LOOK * CELL) ** 2;
  for (const f of unitsOf(u.team)) {
    if (f === u || !f.alive || f.cls === 'air' || f.inHouse || f.def.harvester || !f.def.weapon || f.def.weapon.ground === false) continue;
    if (hunt ? f.order.type !== 'hunt' : !(f.order.type === 'guard' && f.order.amove)) continue;
    const d = (f.x - u.x) ** 2 + (f.y - u.y) ** 2;
    if (d < best) { best = d; lead = f; }
  }
  if (!lead) {
    if (hunt) { if (nearestEnemyBuilding(u)) { if (u.dest) goTo(u, u.x, u.y, true); return true; } return false; }
    if (!u.trailed) return false;
    o.amove = false; o.x = u.x; o.y = u.y; u.trailed = false;
    if (u.dest) goTo(u, u.x, u.y, true);
    return true;
  }
  u.trailed = true;
  const goal = hunt ? (lead.huntTarget && lead.huntTarget.alive ? lead.huntTarget : nearestEnemyBuilding(lead)) : lead.order;
  if (!goal) return false;
  const a = Math.atan2(goal.y - lead.y, goal.x - lead.x);
  let x = lead.x - Math.cos(a) * TRAIL_GAP * CELL, y = lead.y - Math.sin(a) * TRAIL_GAP * CELL;
  x = Math.max(CELL, Math.min(WORLD - CELL, x)); y = Math.max(CELL, Math.min(WORLD - CELL, y));
  // Already about there: stay put (no shuffling about behind a group that has stopped to fight).
  if (Math.hypot(u.x - x, u.y - y) < CELL * 1.5) { if (u.dest) goTo(u, u.x, u.y, true); return true; }
  if (!u.dest || Math.hypot(u.dest.x - x, u.dest.y - y) > CELL * 1.5) goTo(u, x, y, true);
  return true;
}
// Attack move (the AUTO button's picker, then a tap on the map): one trip, not a standing order. Every armed ground unit
// heads for the spot and fights whatever it meets on the way (o.amove: no leash to the spot while travelling), then holds
// the spot like a Guard order once there. A Guard with hold, so the auto logic (Auto Attack, base defence, the Ally
// button) leaves them be.
// Armed aircraft go too: a Guard on the spot (as commandGuard), so they fly there, fight whatever is about it and stay.
const canAttackMove = (u) => u.alive && u.kind === 'unit' && !u.def.harvester && !u.def.lift && !u.def.scripted && !u.inHouse && !u.chute && !!(u.def.weapon || u.def.demo);
function commandAttackMove(units, x, y) {
  const air = units.filter((u) => canAttackMove(u) && u.cls === 'air');
  if (air.length) commandGuard(air, x, y);
  const list = units.filter((u) => canAttackMove(u) && u.cls !== 'air');
  const spots = formationSpots(list.length, x, y);
  const sorted = list.slice().sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  sorted.forEach((u, i) => {
    const s = spots[i];
    setGuard(u, s.x, s.y); u.order.hold = true; u.order.amove = true;
    u.target = null; u.focus = null; u.huntTarget = null; u.staged = false; u.defending = false; u.homeward = false; u.oneStrike = false;
    takeOver(u, 'guard');
    goTo(u, s.x, s.y);
  });
}
// Stop: every order dropped, back to what a new unit does: ground units wait around the base,
// aircraft on their pad, both ready for auto attack; Ore Trucks go back to harvesting.
// Sidebar buttons, as functions so a PvP guest's taps can be sent to the host.
// side: in a team game, the enemy side to attack (the picker by the AUTO button); null for whichever is nearest.
// Units already out hunting turn towards the new choice.
function setAuto(team, on, side = null) {
  team.auto = !!on;
  if (!on) return;
  const was = team.focusSide;
  team.focusSide = side == null || !G.teams[side] || !hostile(team.id, side) ? null : side;
  if (team.focusSide !== was && team.focusSide != null) {
    for (const u of unitsOf(team.id)) if (u.order.type === 'hunt' && u.focus && u.focus.team !== team.focusSide) { u.focus = null; u.resume = null; u.huntTarget = null; }
  }
  if (team.assist) { team.assist = false; for (const u of unitsOf(team.id)) u.garrison = false; }
  // Every idle ground unit attacks now; aircraft waiting on their pads take off.
  launchAll(team);
  for (const u of unitsOf(team.id)) if (u.cls === 'air' && !u.def.scripted && !u.def.lift && u.order.type === 'guard' && !u.manual) u.staged = true;
}
function setRepair(b, on) { b.repairing = !!on; }
function sellStructure(b) { if (b.sellT <= 0) { b.sellT = 1.2; b.buildT = 1; } }
function commandStop(units) {
  for (const u of units) {
    u.target = null; u.focus = null; u.huntTarget = null; u.defending = false; u.homeward = false; u.oneStrike = false; u.manual = false;
    if (u.def.harvester) { u.hs = 'seek'; u.hcell = -1; u.dest = null; u.path = null; continue; }
    if (u.cls === 'air') { setGuard(u); u.order.pad = true; u.staged = true; u.scrambled = false; continue; }
    const s = scatterSpot(G.teams[u.team]);
    setGuard(u, s.x, s.y); u.staged = true; goTo(u, s.x, s.y);
  }
}

// ---------------------------------------------------------------------------
// Main update
// ---------------------------------------------------------------------------
function separate() {
  const buckets = new Map();
  const list = [];
  for (const e of G.entities) {
    if (!e.alive || e.kind !== 'unit' || (e.cls === 'air' && e.def.fly === 'jet') || e.inHouse) continue;
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
        // Ground units keep a little more than their own size apart (they used to overlap by 15%,
        // and a fight became one ball), allies more than strangers.
        // A unit squeezing past (followPath) is not pushed by its allies, and does not push them: the friend in its way is moved aside instead.
        const sa = !air && a.squeezeT > G.t, so = !air && o.squeezeT > G.t;
        if (sa && so && alliedSides(a.team, o.team)) continue;
        const rr = (a.def.r + o.def.r) * (air ? 1.2 : a.team === o.team ? 1.4 : 1);
        const dx = o.x - a.x, dy = o.y - a.y, d = Math.hypot(dx, dy);
        if (d >= rr) continue;
        const nx = d > 0.01 ? dx / d : Math.random() - 0.5, ny = d > 0.01 ? dy / d : Math.random() - 0.5;
        const push = Math.min(air ? 2 : 3, (rr - d) * 0.5);
        // Heavier, busier units shove lighter, idle ones.
        // A set-up MG Team is not shoved off its gun.
        let wa = (a.setup >= 1 ? 0.02 : a.cls === 'inf' ? 1 : 0.4) * (a.moving ? 0.5 : 1), wo = (o.setup >= 1 ? 0.02 : o.cls === 'inf' ? 1 : 0.4) * (o.moving ? 0.5 : 1);
        if ((sa || so) && alliedSides(a.team, o.team)) { if (sa) wa = 0; else wo = 0; }
        const ws = wa + wo;
        if (air) { a.x -= nx * push * wa / ws; a.y -= ny * push * wa / ws; o.x += nx * push * wo / ws; o.y += ny * push * wo / ws; }
        else { tryMove(a, -nx * push * 2 * wa / ws, -ny * push * 2 * wa / ws); tryMove(o, nx * push * 2 * wo / ws, ny * push * 2 * wo / ws); }
      }
    }
  }
}

function update(dt) {
  if (!G || G.paused || G.hold) return;   // hold: an online battle waiting for a player
  G.t += dt;
  buildGrid();
  for (const e of G.entities) {
    if (!e.alive) continue;
    if (e.kind === 'unit') updateUnit(e, dt); else updateBuilding(e, dt);
  }
  separate();
  if (!G.remote) for (const t of G.teams) if (t.wipe) tickWipe(t);
  updateProjectiles(dt);
  if (G.smokes && G.smokes.length) updateSmokes(dt);
  processPaths();
  if (!G.over) for (const team of G.teams) { updateProduction(team, dt); updateResearch(team, dt); updatePowers(team, dt); }
  if (!G.over) updateDoors();
  const T = G.timers;
  if ((T.power -= dt) <= 0) { T.power = 0.5; updatePower(); }
  if ((T.shroud -= dt) <= 0) { T.shroud = 0.25; revealAround(); }
  if ((T.ore -= dt) <= 0) { T.ore = 2; growOre(); }
  // Each side thinks (aiThink) and sends out its groups (launchGroups) once a second, but the sides take turns
  // through the second instead of all in one step (in a 3 v 3 that one step stalled a phone for a tenth of a second).
  const nT = G.teams.length;
  if ((T.ai -= dt) <= 0) { T.ai += 1 / nT; if (T.ai <= 0) T.ai = 1 / nT; T.aiI = ((T.aiI || 0) + 1) % nT; const team = G.teams[T.aiI]; if (!G.over && team && team.isAI) aiThink(team); }
  if ((T.grp = (T.grp === undefined ? 0 : T.grp) - dt) <= 0) { T.grp += 1 / nT; if (T.grp <= 0) T.grp = 1 / nT; T.grpI = ((T.grpI || 0) + 1) % nT; if (!G.over) { launchGroups(G.teams[T.grpI]); T.brN = (T.brN || 0) + 1; if (G.wallN && Math.floor(T.brN / nT) % 4 === 0 && !G.teams[T.grpI].out) breachWalls(G.teams[T.grpI]); } }
  if ((T.win -= dt) <= 0) { T.win = 1; if (!G.remote) updateReserves(); checkWin(); }
  if ((T.log -= dt) <= 0 && !G.over) { T.log = 15; logSample(); for (const t of G.teams) if (!t.isAI) adviseTrucks(t); }
  if (!G.over && (T.stuck = (T.stuck === undefined ? 5 : T.stuck) - dt) <= 0) { T.stuck = 5; stuckWatch(); pileWatch(); }
  lightningStrikes(dt);
  stormStrikes(dt);
  updateEffects(dt);
  sweepDead();
  rollCredits(dt);
}
// Stall recovery for the computer's ground units (both modes, every difficulty), as OpenRA's squads do: a unit that has somewhere
// to go (a hunt, attack or move order, a defence call, a path) but has not moved 6 px in STUCK_AFTER seconds, with nothing in
// weapon reach and not waiting for its squad's leader, is `unstick`ed. The first stall picks its target and its way again, the
// second sends it home to rejoin the next wave. The first few stalls of a match are also written to `stats.errors` as
// 'stuck1'..'stuck3' (3 a match, 60 s apart at least) with what the unit was doing, so a cause can be found afterwards.
const STUCK_AFTER = 10;
let STUCK_SEEN = null;
function unstick(u) {
  const o = u.order;
  u.stallN = (u.stallN || 0) + 1;
  u.target = null; u.huntTarget = null; u.apT = null; u.slideT = 0; u.fan = Math.random() * 2 - 1;
  u.dest = null; u.path = null; u.needPath = false; u.stuckN = 0; u.nearBest = null; u.waitLeader = 0;
  if (u.stallN === 1) {
    if (o.type === 'attack' && o.target && o.target.alive) goTo(u, o.target.x, o.target.y);
    else if (o.type === 'move' || o.type === 'guard') goTo(u, o.x, o.y);
    return;   // a hunt or a defence call: its next look round picks the target and the way
  }
  const sp = scatterSpot(G.teams[u.team], u);
  u.assisting = false; u.defending = false; u.focus = null;
  setGuard(u, sp.x, sp.y); u.staged = true; goTo(u, sp.x, sp.y);
}
// Pile diagnostic (after 2026.11.16.4, reports only: nothing in the game changes). Owner's reports: a human's army stopped in a heap, then moved on
// after a while (route queue, shore strips on Crossroads Village). Every 5 s a human side's ground units with nothing to shoot are looked at: a
// heap is PILE_MIN of them within PILE_R px of one of them, 70% of them not moving, seen on every look for 10 s. The first 3 a match (60 s apart) go to
// `Report.oops('pile1'..'pile3')`: `stack` holds JSON: n units, cell, how many are waiting for a route (`np`), moving (`mv`), have a destination (`dd`),
// the orders (`ord`), types (`ty`), path queue length (`q`), nearest blocked-looking neighbours (`rock`: impassable cells within 3 cells), seconds it has lasted.
const PILE_MIN = 20, PILE_R = 40;
let PILE_SEEN = null;
function pileWatch() {
  if (G.remote) return;
  if (!PILE_SEEN || PILE_SEEN.g !== G) PILE_SEEN = { g: G, n: 0, last: -999, since: new Map() };
  if (PILE_SEEN.n >= 3 || G.t - PILE_SEEN.last < 60) return;
  for (const team of G.teams) {
    if (team.isAI || team.out) continue;
    const us = unitsOf(team.id).filter((u) => u.cls !== 'air' && !u.def.harvester && !u.def.scripted && u.def.speed && !u.inHouse && !(u.target && u.target.alive));
    if (us.length < PILE_MIN) continue;
    let best = null;
    for (const a of us) {
      const c = us.filter((o) => Math.abs(o.x - a.x) < PILE_R && Math.abs(o.y - a.y) < PILE_R && Math.hypot(o.x - a.x, o.y - a.y) < PILE_R);
      if (c.length >= PILE_MIN && (!best || c.length > best.length)) best = c;
    }
    if (!best) { PILE_SEEN.since.delete(team.id); continue; }
    const still = best.filter((u) => !u.moving), going = best.filter((u) => u.dest || u.needPath);
    if (still.length < best.length * 0.7 || !going.length) { PILE_SEEN.since.delete(team.id); continue; }   // a parked army is not a heap
    const since = PILE_SEEN.since.get(team.id);
    if (since === undefined) { PILE_SEEN.since.set(team.id, G.t); continue; }
    if (G.t - since < 10) continue;
    PILE_SEEN.n++; PILE_SEEN.last = G.t; PILE_SEEN.since.delete(team.id);
    const count = (f) => { const o = {}; for (const u of best) { const k = f(u); o[k] = (o[k] || 0) + 1; } return o; };
    const a = best[0], c0 = cellOfPos(a.x, a.y);
    let rock = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const x = cellX(c0) + dx, y = cellY(c0) + dy; if (inMap(x, y) && !freeCell(idx(x, y))) rock++; }
    if (typeof Report !== 'undefined' && Report.oops) Report.oops('pile' + PILE_SEEN.n, { message: 'a heap of ' + best.length + ' stopped for ' + Math.round(G.t - since) + ' s', stack: JSON.stringify({
      n: best.length, tm: team.id, t: Math.round(G.t), c: [cellX(c0), cellY(c0)], np: best.filter((u) => u.needPath).length, mv: best.length - still.length, dd: going.length,
      ord: count((u) => u.order.type + (u.assisting ? '/asst' : '') + (u.staged ? '/staged' : '')), ty: count((u) => u.type), q: G.pathQueue.length, rock, auto: !!team.auto, assist: !!team.assist,
      old: Math.round(Math.max(...best.map((u) => (u.nearBest ? G.t - u.nearBest.t : 0)))), sn: best.filter((u) => u.stuckN > 0).length }) });
    return;
  }
}
function stuckWatch() {
  if (G.remote) return;
  if (!STUCK_SEEN || STUCK_SEEN.g !== G) { STUCK_SEEN = new Map(); STUCK_SEEN.g = G; STUCK_SEEN.n = 0; STUCK_SEEN.last = -999; }
  const found = [];
  for (const u of G.entities) {
    if (!u.alive || u.kind !== 'unit' || u.cls === 'air' || u.def.harvester || u.def.scripted || !u.def.speed || u.def.deploys || u.def.engineer || !G.teams[u.team].isAI) continue;
    const o = u.order.type;
    if (o === 'repair' || o === 'engineer' || u.repairing || u.chute > 0) { STUCK_SEEN.delete(u.id); continue; }
    if (!(o === 'hunt' || o === 'attack' || o === 'move' || u.assisting || u.dest || u.needPath)) { STUCK_SEEN.delete(u.id); continue; }
    const inReach = u.target && u.target.alive && u.def.weapon && distTo(u, u.target) <= Math.max(wRange(u, u.def.weapon), (u.def.weapon2 && wRange(u, u.def.weapon2)) || 0) * 1.15;
    const s = STUCK_SEEN.get(u.id), moved = !s || Math.hypot(u.x - s[0], u.y - s[1]) > 6;
    if (inReach || u.waitLeader > G.t || moved) { STUCK_SEEN.set(u.id, [u.x, u.y, G.t]); if (moved) u.stallN = 0; continue; }
    if (G.t - s[2] >= STUCK_AFTER) found.push(u);
  }
  if (!found.length) return;
  if (typeof Report !== 'undefined' && Report.oops && STUCK_SEEN.n < 3 && G.t - STUCK_SEEN.last >= 60) {
    STUCK_SEEN.n++; STUCK_SEEN.last = G.t;
    const near = (u, r, f) => { let n = 0; for (const e of G.entities) if (e !== u && e.alive && e.kind === 'unit' && e.cls !== 'air' && Math.abs(e.x - u.x) < r && Math.abs(e.y - u.y) < r && f(e)) n++; return n; };
    const info = found.slice(0, 2).map((u) => ({
      id: u.id, ty: u.type, tm: u.team, c: [cellX(cellOfPos(u.x, u.y)), cellY(cellOfPos(u.x, u.y))], ord: u.order.type, as: !!u.assisting, df: !!u.defending, sg: !!u.staged,
      dest: u.dest ? [Math.round(u.dest.x / CELL), Math.round(u.dest.y / CELL)] : null, np: !!u.needPath, pl: u.path ? u.path.length : null, pi: u.pathIdx, sn: u.stuckN, mv: !!u.moving,
      tg: u.target && u.target.alive ? [u.target.type, Math.round(distTo(u, u.target))] : null, foe: near(u, CELL * 8, (e) => hostile(u.team, e.team)), fr: near(u, CELL * 2, (e) => e.team === u.team),
      pin: !!(G.teams[u.team].pincer && G.teams[u.team].pincer.groups.some((g) => g.includes(u))), st: u.stallN || 0, n: found.length,
    }));
    Report.oops('stuck' + STUCK_SEEN.n, { message: 'idle on an order for ' + STUCK_AFTER + ' s', stack: JSON.stringify(info) });
  }
  for (const u of found) { unstick(u); STUCK_SEEN.set(u.id, [u.x, u.y, G.t]); }
}
// Wind: blows smoke along. It holds one direction for a spell, then swings round to a new random one,
// and swells and eases slowly. Every direction is worked out from the map seed and the match clock, so
// an online guest sees the same wind as the host. The older a puff, the more it is carried, so a firing
// turret trails a plume and burning buildings lean over. Looks only.
const WIND = 30, WIND_SPELL = 50;   // px/s at its steady strength; seconds between changes of direction
function windDirection(n) {   // the nth spell's direction: a fixed random angle per seed and spell
  let x = ((G.seed ^ 0x6c8e9cf5) + Math.imul(n + 1, 0x85ebca6b)) | 0;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d); x = Math.imul(x ^ (x >>> 12), 0x297a2d39); x ^= x >>> 15;
  return ((x >>> 0) / 4294967296) * Math.PI * 2;
}
function windNow() {
  const k = Math.floor(G.t / WIND_SPELL), f = G.t / WIND_SPELL - k;
  const a0 = windDirection(k), turn = ((windDirection(k + 1) - a0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI;   // the shorter way round
  const s = f < 0.7 ? 0 : (f - 0.7) / 0.3, a = a0 + turn * s * s * (3 - 2 * s);                                 // holds, then swings over the last 15 s
  const g = 1 + 0.4 * Math.sin(G.t * 0.35) + 0.2 * Math.sin(G.t * 0.9 + 1.3);
  return { x: Math.cos(a) * WIND * g, y: Math.sin(a) * WIND * g * 0.6, a };
}
// Trees on fire (drawn by drawTree in art.js). An explosion sets the trees round it alight; a burning tree may
// catch a neighbour or two a few seconds later, then the fire dies out and leaves burnt trees. G.treeFire holds
// when each burning or burnt tree (its number in G.ground.trees) caught, G.treeHot those still burning. It runs in
// the effects pass from the explosions each copy sees, so nothing goes over the network. Looks only.
const litFx = new WeakSet();
const TREE_SPREAD = 0.22;   // chance a burning tree catches each tree within 16 px
function igniteTrees(x, y, r) {
  const T = G.ground && G.ground.trees;
  if (!T || !T.length) return;
  const fire = G.treeFire || (G.treeFire = {}), hot = G.treeHot || (G.treeHot = []);
  const cellsOf = T.cells || (T.cells = treeCells(T));
  const near = (x, y, r, fn) => {
    for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r + 14) / CELL); cy++) for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
      const list = cx >= 0 && cy >= 0 && cx < MAP && cy < MAP && cellsOf.get(cy * MAP + cx);
      if (list) for (const i of list) if (Math.hypot(T[i].x - x, T[i].y - 8 - y) <= r) fn(i);
    }
  };
  const queue = [];
  near(x, y, r, (i) => { if (fire[i] === undefined) { fire[i] = G.t; hot.push(i); queue.push(i); } });
  // Where the fire goes on to: worked out now, each catching a little after the tree beside it.
  while (queue.length && hot.length < 400) {
    const i = queue.shift();
    near(T[i].x, T[i].y - 8, 16, (j) => {
      if (fire[j] !== undefined || Math.random() >= TREE_SPREAD) return;
      fire[j] = fire[i] + 2.5 + Math.random() * 3; hot.push(j); queue.push(j);
    });
  }
}
function treeCells(T) {
  const m = new Map();
  T.forEach((tr, i) => { const k = Math.floor(tr.y / CELL) * MAP + Math.floor(tr.x / CELL); if (!m.has(k)) m.set(k, []); m.get(k).push(i); });
  return m;
}
function treeFires(dt) {
  const hot = G.treeHot, T = G.ground && G.ground.trees;
  if (!hot || !hot.length || !T || !T.length) return;
  const show = G.me >= 0 && G.seen;
  G.treeHot = hot.filter((i) => {
    const tr = T[i], age = G.t - G.treeFire[i];
    if (!tr) return false;
    if (age > TREE_BURN) { scorch(G.tctx, tr.x, tr.y - 3, 14, (i * 7919) | 0); return false; }   // ash round the foot of the burnt tree
    if (age < 0 || !show || !G.seen[idx(Math.floor(tr.x / CELL), Math.floor(tr.y / CELL))]) return true;
    const heat = treeHeat(age / TREE_BURN);
    // Flames leaping from all over the crown and above it, and a column of smoke.
    for (let n = dt * 26 * heat; n > 0; n--) if (n >= 1 || Math.random() < n) G.effects.push({ type: 'fire', x: tr.x + (Math.random() - 0.5) * 18, y: tr.y - 6 - Math.random() * 20, t: 0, life: 0.4 + Math.random() * 0.5, s: 1.2 + Math.random() * 0.6 * heat, vy: -18 - Math.random() * 14 });
    if (Math.random() < dt * 5 * heat) G.effects.push({ type: 'smoke', x: tr.x + (Math.random() - 0.5) * 10, y: tr.y - 26, r: 4, t: 0, life: 2.8, alpha: 0.55, color: '#2e2a26', vy: -14, vx: 2, drag: 0.4 });
    return true;
  });
}
// Lightning that lands (owner's request, both modes). Every strike flashes the screen and thunders (art.js lightning, on every
// phone); BOLT_SHARE of them come down as a bolt you can see, somewhere on the map: on a building, a bridge span, a wood
// or open ground, chosen here by the host. It sets the spot alight: the trees there catch (the 'expl' it leaves goes to
// guests as usual), the ground is scorched, and a building or span burns for BOLT_BURN s, losing BOLT_DMG of its full
// health over that time. G.bolts holds the fires (plain data, saved); the guests get the bolt, flames and health.
const BOLT_SHARE = 0.35, BOLT_BURN = 10, BOLT_DMG = 0.1;
function lightningStrikes(dt) {
  const w = G.weather;
  if (G.remote || !w || w.kind !== 'rain') return;
  const t0 = G.boltT === undefined ? G.t - dt : G.boltT;
  G.boltT = G.t;
  if (G.t - t0 < 2) for (let s = Math.floor(t0); s <= Math.floor(G.t); s++) {
    const hit = lightningAt(w, s);
    if (hit && s + hit[0] > t0 && s + hit[0] <= G.t && hit[3] < BOLT_SHARE) boltStrike();
  }
  if (!G.bolts || !G.bolts.length) return;
  G.bolts = G.bolts.filter((f) => {
    f.t -= dt;
    const e = f.id ? G.byId.get(f.id) : null;
    if (f.id && (!e || !e.alive)) return false;
    let x = f.x, y = f.y, wd = 12, ht = 10;
    if (e) {
      if (e.kind === 'bld') { x = (e.cx + e.w / 2) * CELL; y = (e.cy + e.h / 2) * CELL; wd = e.w * CELL * 0.8; ht = e.h * CELL * 0.7; }
      else { x = e.x; y = e.y; wd = Math.min(60, e.w * CELL); ht = Math.min(40, e.h * CELL); }
      damage(e, e.maxHp * BOLT_DMG / BOLT_BURN * dt, 'GR', null);   // GR: full damage on structures; no attacker, so no alarm
    }
    const heat = Math.min(1, f.t / 3);
    if (Math.random() < dt * (e ? 10 : 6) * heat) G.effects.push({ type: 'fire', x: x + (Math.random() - 0.5) * wd, y: y + (Math.random() - 0.5) * ht, t: 0, life: 0.6 + Math.random() * 0.6, s: 1.2 + Math.random() * 0.5, vy: -14 - Math.random() * 10 });
    if (Math.random() < dt * 2.5 * heat) G.effects.push({ type: 'smoke', x: x + (Math.random() - 0.5) * wd * 0.6, y: y - 10, r: 4, t: 0, life: 2.6, alpha: 0.5, color: '#2e2a26', vy: -12, vx: 2, drag: 0.4 });
    return f.t > 0;
  });
}
// Storms (look branch, proposal item 7; owner, 2026-11-19: their bolts land as the rain's do, both modes, and rarely). Now and
// then a storm rolls in, planned from the battle's seed on the battle's clock (G.t), so the host, the server and every phone
// agree: the first after STORM_FIRST s, then every STORM_GAP, lasting STORM_LEN, building over STORM_IN and clearing over
// STORM_OUT (stormLevel: 0 to 1). At its height (above 0.6) each second has a STORM_BOLT_P chance of a bolt (boltStrike, as
// the rain's: it scorches, sets trees alight, a building or span burns). The host decides (not guests); none on snow maps
// (a blizzard there, looks only). The look (darker sky, heavy rain, sheet lightning) is src/lookstorm.js.
const STORM_FIRST = [70, 160], STORM_GAP = [160, 320], STORM_LEN = [70, 110], STORM_IN = 16, STORM_OUT = 20, STORM_BOLT_P = 1 / 75;
let stormPlan = null;
function stormLevel(t) {
  if (!G) return 0;
  if (MAPS[validMap(G.mapId)].lightning === false) return 0;   // (Heron Fen: a soft rain, no storms)
  if (!stormPlan || stormPlan.seed !== G.seed) {
    const h = Math.imul((G.seed | 0) ^ 0x2f6b1d3a, 0x9e3779b1), r = rng(h ^ (h >>> 15));
    stormPlan = { seed: G.seed, r, list: [], end: 0 };
  }
  const P = stormPlan, span = (a) => a[0] + P.r() * (a[1] - a[0]);
  while (P.end <= t) { const st = P.end + span(P.list.length ? STORM_GAP : STORM_FIRST), len = span(STORM_LEN); P.list.push([st, len]); P.end = st + len; }
  const sm = (v) => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
  for (const [st, len] of P.list) { const u = t - st; if (u >= 0 && u <= len) return Math.min(sm(u / STORM_IN), sm((len - u) / STORM_OUT)); }
  return 0;
}
const stormSnowy = () => mapTheme(G.mapId) === 'snow' || !!(G.weather && G.weather.kind === 'snow');
function stormStrikes(dt) {
  if (G.remote || stormSnowy()) return;
  const t0 = G.stormT === undefined ? G.t - dt : G.stormT;
  G.stormT = G.t;
  if (G.t - t0 >= 2) return;
  for (let s = Math.floor(t0); s <= Math.floor(G.t); s++) {
    if (stormLevel(s) < 0.6) continue;
    let h = Math.imul((G.seed | 0) ^ 0x6a09e667, 0x2c1b3c6d) + Math.imul(s, 0x297a2d39);
    const r = rng(h ^ (h >>> 15)); r();
    const at = r();
    if (r() < STORM_BOLT_P && s + at > t0 && s + at <= G.t) boltStrike();
  }
}
// Where a bolt comes down: anywhere on the map's dry land (bridges included), every spot as likely as any other.
// Whatever stands there takes it: a building, a bridge span, a wood (its trees catch) or open ground.
function boltStrike(at) {   // (at: a cell, for recorders)
  let c = at === undefined ? -1 : at;
  for (let i = 0; i < 200 && c < 0; i++) { const k = Math.floor(Math.random() * NCELLS); if (G.terr[k] !== 4) c = k; }
  if (c < 0) return;
  const x = (cellX(c) + Math.random()) * CELL, y = (cellY(c) + Math.random()) * CELL;
  const tgt = G.entities.find((e) => e.alive && e.kind === 'bld' && e.buildT >= 1 && cellX(c) >= e.cx && cellX(c) < e.cx + e.w && cellY(c) >= e.cy && cellY(c) < e.cy + e.h)
    || (G.spans || []).find((s) => s.alive && s.cells.includes(c))
    || (G.houses || []).find((h) => h.alive && cellX(c) >= h.cx && cellX(c) < h.cx + h.w && cellY(c) >= h.cy && cellY(c) < h.cy + h.h) || null;   // a village house burns too
  const seed = (Math.random() * 1e6) | 0;
  G.effects.push({ type: 'bolt', x, y, t: 0, life: 0.45, seed });
  G.effects.push({ type: 'expl', x, y: y - 2, size: 12, t: 0.02, life: 0.6, seed: seed + 1 });   // sets trees round it alight (updateEffects)
  scorch(G.tctx, x, y, 12, seed);
  (G.bolts || (G.bolts = [])).push({ x, y, t: BOLT_BURN, id: tgt ? tgt.id : 0 });
}
// Smoke, debris, bodies and the like. A PvP guest runs these itself; G.inFx marks what they set
// off (more effects, sounds, marks on the ground), which the host need not send.
function updateEffects(dt) {
  const n0 = G.effects.length;
  G.inFx = true;
  const wind = windNow();
  for (const fx of G.effects) {
    if (fx.type === 'crash') updateCrash(fx, dt);
    else if (fx.type === 'frag') updateFrag(fx, dt);
    else if (fx.type === 'eject') updateEject(fx, dt);
    else if (fx.type === 'ragdoll') updateRagdoll(fx, dt);
    else if (fx.type === 'turret') updateTurret(fx, dt);
    else if (fx.type === 'wheel') updateWheel(fx, dt);
    else if (fx.type === 'expl' && fx.t >= 0 && fx.size >= 9 && !litFx.has(fx)) { litFx.add(fx); igniteTrees(fx.x, fx.y + 3, Math.max(12, fx.size * 1.4)); }
    else if (fx.type === 'flare' && fx.t >= 0) {
      fx.vx *= Math.exp(-1.4 * dt); fx.vy += (14 - fx.vy) * (1 - Math.exp(-1.2 * dt));   // drag, then a slow fall
      if (fx.lift) fx.lift = Math.max(0, fx.lift - 14 * dt);   // (dropping toward the ground)
      if ((fx.trailT = (fx.trailT || 0) - dt) <= 0) { fx.trailT = 0.05; fx.trail.push({ x: fx.x, y: fx.y, l: fx.lift || 0 }); if (fx.trail.length > 18) fx.trail.shift(); }
    }
    else if (fx.type === 'smoulder' && (fx.puffT -= dt) <= 0) {
      fx.puffT = 0.35 + fx.t / fx.life * 0.6;
      G.effects.push({ type: 'smoke', x: fx.x + (Math.random() - 0.5) * 4, y: fx.y, r: 2.5, t: 0, life: 2.2, alpha: 0.45 * (1 - fx.t / fx.life), color: '#35322e', vy: -9, vx: 3 });
    }
    fx.t += dt;
    if (fx.drag && fx.t > 0) { const k = Math.exp(-fx.drag * dt); fx.vx *= k; fx.vy = fx.vy * k - 3 * (1 - k); }   // billowing smoke slows, then rises
    if (fx.type === 'smoke' && fx.t > 0) { const carry = Math.min(1, fx.t / 1.2) * dt; fx.x += wind.x * carry; fx.y += wind.y * carry; }
    if (fx.vy && fx.t > 0 && fx.type !== 'crash' && fx.type !== 'ragdoll' && fx.type !== 'turret' && fx.type !== 'wheel') {
      // Smoke and flames rise: their climb is kept as a height (fx.lift), drawn straight up the screen whatever the camera
      // (ui.js), while wind and vx carry them over the ground.
      if (fx.type === 'smoke' || fx.type === 'fire' || fx.type === 'flakburst') fx.lift = (fx.lift || 0) - fx.vy * dt; else fx.y += fx.vy * dt;
      fx.x += (fx.vx || 0) * dt;
    }
  }
  structureDamageFx(dt);
  houseFx(dt);
  villageLife(dt);
  plantSmoke(dt);
  treeFires(dt);
  updateSamPits(dt);
  for (let i = n0; i < G.effects.length; i++) G.effects[i].sent = true;
  G.inFx = false;
  G.effects = G.effects.filter((fx) => fx.t < fx.life);
}
// Power plant smoke, out of each stack (plantStacks in models.js). The Allied coal chimneys send up a
// steady dark plume that rises, slows, spreads, drifts with the wind and thins away; the Soviet
// reactor vents give a little pale vapour. It runs in the effects pass, so each phone makes its own
// and nothing goes over the network, and only for plants this player has uncovered.
function plantSmoke(dt) {
  if (G.me < 0 || !G.seen) return;   // the game server draws nothing
  for (const b of G.entities) {
    if (!b.alive || b.kind !== 'bld' || (b.type !== 'power' && b.type !== 'apower' && b.type !== 'refinery') || !(b.buildT >= 1) || !G.seen[idx(b.cx, b.cy)]) continue;
    const sov = b.faction === 'soviets', big = b.type === 'apower', ref = b.type === 'refinery';
    // kind of plume: Allied power plants a dark coal plume (old look), Soviet power plants white steam from the
    // cooling towers, Soviet refineries grey smoke from the chimneys, Allied refineries a faint vapour from the roof vents
    const style = ref ? (sov ? 'grey' : 'vapour') : (sov ? 'steam' : 'coal');
    if ((b.plumeT = (b.plumeT || 0) - dt) > 0) continue;
    b.plumeT = style === 'coal' ? 0.14 + Math.random() * 0.05 : style === 'steam' ? 0.16 + Math.random() * 0.06 : style === 'grey' ? 0.22 + Math.random() * 0.06 : 0.4 + Math.random() * 0.2;
    for (const [tx, ty, h] of plantStacks(b.type, b.faction)) {
      const x = b.cx * CELL + tx + (Math.random() - 0.5) * 1.5, y = b.cy * CELL + ty, lift = h * VK;
      if (style === 'coal') G.effects.push({ type: 'smoke', x, y, lift, r: big ? 5 : 4.2, t: 0, life: 4.2 + Math.random() * 1, alpha: 0.85, color: '#2a2724', vy: -17 - Math.random() * 4, vx: (Math.random() - 0.5) * 3, drag: 0.45 });
      else if (style === 'steam') G.effects.push({ type: 'smoke', x: x + (Math.random() - 0.5) * 6, y, lift, r: big ? 6 : 5.4, t: 0, life: 3.4 + Math.random() * 0.8, alpha: 0.7, color: '#eceeee', vy: -14 - Math.random() * 4, vx: 4 + Math.random() * 3, drag: 0.4 });
      else if (style === 'grey') G.effects.push({ type: 'smoke', x, y, lift, r: 3.6 + Math.random() * 1.2, t: 0, life: 3.8 + Math.random() * 0.8, alpha: 0.75, color: '#5a5856', vy: -15 - Math.random() * 4, vx: 5 + Math.random() * 3, drag: 0.4 });
      else if (Math.random() < 0.6) G.effects.push({ type: 'smoke', x, y, lift, r: 2.4, t: 0, life: 1.8, alpha: 0.3, color: '#dcdcd8', vy: -12, vx: 5 });
    }
    // the Soviet refinery's flare stack burns
    if (ref && sov && (b.flareT = (b.flareT || 0) - 0.15) < 0) {
      b.flareT = 0;
      G.effects.push({ type: 'fire', x: b.cx * CELL + 5 + (Math.random() - 0.5), y: b.cy * CELL + 6, lift: 54 * VK, t: 0, life: 0.5 + Math.random() * 0.3, s: 1.1, vy: -6, flare: true });
    }
  }
}
// Damaged structures burn and smoke out of the holes in their damaged model (damageSpots) and
// shed pieces: a shower when they reach a new stage of damage, a piece or two when hit again,
// and now and then one falls off on its own. It runs in the effects pass, so an online guest
// works it out from the health it is sent, and none of it goes over the network. Repairs
// bring a structure back below the thresholds and it all stops.
// SAM Sites open up and raise the launcher when enemy aircraft come within a few cells of their
// range, and stay up until none are left, then wait a moment and go back underground. Looks
// only: the launcher rises in well under a second, and firing is not held back by it. Runs in
// the effects pass, so an online guest works it out from what it is sent.
function updateSamPits(dt) {
  for (const b of G.entities) {
    if (b.kind !== 'bld' || b.type !== 'sam' || !b.alive) continue;
    if (b.buildT < 1) { b.popK = 0; continue; }
    const R = b.def.weapon.range + 3 * CELL, tgt = b.target && b.target.alive;
    let threat = tgt || b.fireT > 0;
    if (!threat) for (const e of G.entities) if (e.alive && e.kind === 'unit' && hostile(e.team, b.team) && isAirborne(e) && Math.hypot(e.x - b.x, e.y - b.y) < R) { threat = true; break; }
    b.popHold = threat ? 1.5 : (b.popHold || 0) - dt;
    b.popK = b.popHold > 0 ? Math.min(1, (b.popK || 0) + dt / (tgt ? 0.35 : 0.7)) : Math.max(0, (b.popK || 0) - dt / 1.1);
  }
}
let dmgWarmT = 0;
function structureDamageFx(dt) {
  // Where a building type's holes go (damageSpots) is worked out from its model the first time one is damaged: up to
  // 0.1 s on the game server, which never draws and so has no models yet. Done ahead instead, one type a second.
  if ((dmgWarmT -= dt) <= 0) {
    dmgWarmT = 1;
    const b = G.entities.find((e) => e.kind === 'bld' && e.alive && !dmgSpotCache.has(e.type));
    if (b) damageSpots(b.type, b.faction);
  }
  for (const b of G.entities) {
    if (b.kind !== 'bld' || !b.alive || b.buildT < 1 || b.sellT > 0) continue;
    const stage = dmgStage(b);
    if (b.dmgSeen === undefined) { b.dmgSeen = stage; b.dmgHp = b.hp; }
    if (!stage) { b.dmgSeen = 0; b.dmgHp = b.hp; continue; }
    const spots = damageSpots(b.type, b.faction), ox = b.cx * CELL, oy = b.cy * CELL, pal = FACTIONS[b.faction].pal;
    const live = spots.filter((p) => p.s <= stage);
    if (!live.length) continue;
    const spot = () => live[(Math.random() * live.length) | 0];
    const piece = (p, kick) => {
      const a = Math.random() * Math.PI, sp = 4 + Math.random() * kick;
      G.effects.push({ type: 'frag', x: ox + p.x + (Math.random() - 0.5) * p.r, y: oy + p.y, alt: p.z * VK, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8 + 4, vz: -6 - Math.random() * kick * 0.5,
        rot: Math.random() * 6, spin: (Math.random() - 0.5) * 16, w: 1.5 + Math.random() * 3, h: 1.5 + Math.random() * 2,
        color: [pal.main, pal.dark || '#3b3a36', '#d6d3c9', '#2a2622', '#8f8d84'][(Math.random() * 5) | 0], burning: stage === 2 && Math.random() < 0.3, t: 0, life: 4, smokeT: 0 });
    };
    if (stage > b.dmgSeen) {   // a chunk gives way
      const fresh = live.filter((p) => p.s === stage), p = fresh.length ? fresh[0] : spot();
      G.effects.push({ type: 'expl', x: ox + p.x, y: oy + p.y, lift: p.z * VK, size: 9, t: 0, life: 0.6, seed: (Math.random() * 1e6) | 0, debris: true });
      for (let i = 0; i < 7; i++) piece(p, 26);
      for (let i = 0; i < 4; i++) G.effects.push({ type: 'smoke', x: ox + p.x + (Math.random() - 0.5) * 10, y: oy + p.y, lift: p.z * VK * 0.5, r: 4, t: -i * 0.05, life: 1.4, alpha: 0.6, color: '#8a7a62', vy: -10, vx: (Math.random() - 0.5) * 20, drag: 1.5 });
      hooks.sfx('hitMed', ox + p.x, oy + p.y);
    }
    b.dmgSeen = stage;
    if (b.dmgHp - b.hp > b.maxHp * 0.015) { const p = spot(); for (let i = 0; i < 1 + (Math.random() * 2 | 0); i++) piece(p, 16); }
    b.dmgHp = b.hp;
    if ((b.dropT = (b.dropT === undefined ? Math.random() * 3 : b.dropT) - dt) <= 0) { b.dropT = stage === 2 ? 1.2 + Math.random() * 2 : 3 + Math.random() * 4; piece(spot(), 8); }
    if ((b.dmgFxT = (b.dmgFxT || 0) - dt) > 0) continue;
    b.dmgFxT = stage === 2 ? 0.12 : 0.2;
    // Thick black smoke rolling away on the wind, from one of the holes each tick.
    const p = spot(), px = ox + p.x + (Math.random() - 0.5) * p.r, py = oy + p.y;
    G.effects.push({ type: 'smoke', x: px, y: py, lift: p.z * VK + 2, vy: -20 - Math.random() * 6, vx: 7 + Math.random() * 3, r: (stage === 2 ? 6.5 : 4.5) + Math.random() * 2.5, t: 0,
      life: stage === 2 ? 3.6 : 2.8, alpha: stage === 2 ? 0.85 : 0.7, color: '#2e2b28' });
    // Flames: in every hole at stage 2, in the first one at stage 1.
    const fp = stage === 2 ? spot() : live[0];
    if (Math.random() < (stage === 2 ? 0.6 : 0.35)) G.effects.push({ type: 'fire', x: ox + fp.x + (Math.random() - 0.5) * fp.r, y: oy + fp.y, lift: fp.z * VK - 3 - Math.random() * 2, t: 0,
      life: 0.5 + Math.random() * 0.3, s: stage === 2 ? 1.3 + Math.random() * 0.5 : 1, vy: -5 });
  }
}
function sweepDead() {
  if (G.entities.some((e) => !e.alive)) {
    for (const e of G.entities) if (!e.alive) G.byId.delete(e.id);
    G.entities = G.entities.filter((e) => e.alive);
    G.selection = G.selection.filter((e) => e.alive);
  }
}
function rollCredits(dt) {
  for (const team of G.teams) team.shown += Math.sign(team.credits - team.shown) * Math.min(Math.abs(team.credits - team.shown), Math.max(60, Math.abs(team.credits - team.shown) * 0.2) * dt * 10);
}
