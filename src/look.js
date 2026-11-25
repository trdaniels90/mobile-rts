'use strict';
// The "Tiberian Sun look" prototype (looks only; lives only on the branch claude/ts-look, ON there unless the address has
// ?look=off, for comparing; see "Tiberian Sun look" in docs/NOTES.md). Four parts, each with its own switch in LOOK so before/after videos can show one at a time:
//  - light:    a colour grade, a low sun from the upper left, cloud shadows drifting over the ground, and light from
//              fires, explosions and structures (ui.js draw, after the view is put on the screen; not on day/night maps)
//  - cliffs:   the rock ridges (G.cliff) stand up as tall crags, sorted in with the units (ui.js draw, kind 'cliff')
//  - concrete: structures sit on concrete slabs instead of trodden dirt (art.js bibDecal)
//  - lamps:    red beacons blinking on structures' high points, lit windows, searchlights sweeping from defences (drawLook)
//  - ground:   tank tracks that fade, large soft patches of drier and lusher grass (lookGround, under the units), debris
//              scattered round wrecks (bakeWreck), and soft blends where grass meets dirt, road and sand (art.js groundPixels,
//              LOOK_SOFT: read once when the ground workers start, so switch it with ?lookoff=ground, not at run time)
//  - water:    ripples moving over open water and foam lapping at the shore (drawWater, under the units)
//  - hills:    the ground drawn raised by its height (G.hgt, terrain height stage 2), and everything on it standing at that
//              height (gLift; ground warped in chunks by hillWarp from art.js makeGround's draw; ?lookoff=hills: flat as before)
//  - smoke:    tall smoke columns leaning with the wind, bigger flames and embers from damaged structures and fires (lookSmoke, over the units)
//  - pools:    lamp posts with coloured pools of light, window light spilling onto the ground, ore glowing (drawLook / drawNight)
//  - dress:    rocks, gravel, bushes, puddles, worn paths, cracks and oil painted into the ground tiles once (lookDress)
//  - mood:     drawLook's colours per map and weather (MOOD); also by day on the day/night maps
//  - fog:      on grass day/night maps, fog lying on the low ground on some calm, dry nights, lifting in the morning (lookFogGround / lookFogOver)
// (LOOK_SOFT below: the soft ground blends, read by art.js groundPixels and copied into its workers)
const LOOK = (() => {
  const q = typeof location !== 'undefined' ? location.search : '';
  const on = !/[?&]look=off\b/.test(q), off = (q.match(/[?&]lookoff=([a-z,]+)/) || [, ''])[1].split(',');   // ?lookoff=ground,water: parts off
  const L = { light: on, cliffs: on, concrete: on, lamps: on, ground: on, water: on, smoke: on, hills: on, pools: on, dress: on, mood: on, fog: on };
  for (const k of off) if (k in L) L[k] = false;
  return L;
})();

// ---- Raised ground (terrain height, stage 2: looks only) ------------------------------------------------------------
// The ground (G.hgt, world.js hgtAt: the rules' own heights) is drawn raised: a point at height h shows h x VK view pixels
// up the screen. gLift(x, y) is that lift, faded to nothing over the outer HILL_EDGE px of the map, so the land past the
// edge (drawn flat) meets it. Everything standing on the ground is drawn through it: onHill moves a world transform up
// the screen by the lift under one spot (units, structures, trees, ore...), and hillWarp draws the ground tiles (and the
// shroud) in HILL_CH px squares, each through its own affine transform fitted to the lift at its four corners, drawn a
// little larger than itself so neighbours overlap (no seams). The hills are smooth and gentle (no slope hides the ground
// behind it), so nothing needs sorting. Rules, saves and online play do not change: this is drawing only.
const HILL_EDGE = 160, HILL_CH = 32, HILL_LAP = 0.7;
// HILL_DRAW: the hills are drawn this many times as tall as the rules' heights (G.hgt). The rules compare heights as a
// share of HG_MAX (reach, sight) or by slope (speed), and none of that changes: only the picture is taller.
const HILL_DRAW = 2.5;
let LIFT_V = null;   // the world vector that shows one view pixel straight up
// Craters (world.js G.dig) are left out of the ground's drawn shape (noDig, hillFit): too small for its chunks. What stands
// in one sinks DIG_SHOW view px per unit of depth (not x HILL_DRAW), into the pit lookfx.js lookCraters paints.
const DIG_SHOW = 0.9;
function gLift(x, y, noDig) {
  if (!LOOK.hills || !G || !G.hgt) return 0;
  const m = Math.min(x, y, WORLD - x, WORLD - y);
  if (m <= 0) return 0;
  const h0 = hgtAt(x, y, true), h = h0 * VK * HILL_DRAW + (G.dig && !noDig ? (hgtAt(x, y) - h0) * DIG_SHOW : 0);
  if (m >= HILL_EDGE) return h;
  const k = m / HILL_EDGE;
  return h * k * k * (3 - 2 * k);
}
// With WebGL, a picture is tested against the ground's depth at its base plus a margin, and the drawn ground leaves craters
// out, so what sinks into a crater (up to about 6 view px) slipped under the ground and lost its lower half (owner,
// 2026-11-22: "vehicles kind of disappear with those new big ground craters"). craterSink: the extra depth (world units of
// viewDepth) to add to the margin, the sink's view px turned into depth (/ VIEW.F), with a little to spare.
function craterSink(x, y) {
  if (!G || !G.dig || !LOOK.hills) return 0;
  const s = gLift(x, y, true) - gLift(x, y);
  return s > 0 ? s / VIEW.F + 2 : 0;
}
const hillMax = () => HG_MAX * VK * HILL_DRAW;
// The world point that shows where (x, y) does on the raised ground (for things drawn in world coordinates).
function hillPt(x, y, extra) { return liftPt(x, y, gLift(x, y) + (extra || 0)); }
// fn() drawn with g's transform moved up the screen by the lift at (x, y).
function onHill(g, x, y, fn) {
  const L = gLift(x, y);
  if (!L) return fn();
  if (!LIFT_V) LIFT_V = fromView(0, -1);
  const m = g.getTransform();
  g.translate(LIFT_V[0] * L, LIFT_V[1] * L);
  try { return fn(); } finally { g.setTransform(m); }
}
// The ground in HILL_CH px chunks on a fixed world grid, each drawn through an affine transform fitted to the lift at its
// corners (a plane: Lc + Lx (x - mid) + Ly (y - mid)). Worked out once a battle per chunk (hillFit), with `occ`: whether
// the chunk hides ground behind it (some point of it stands higher on the screen than ground up to hillMax() behind it in
// its screen column). Chunks are drawn back to front (key: the depth of their back corner), so a hill hides what is behind
// it; ui.js redraws the hiding chunks (occ) over the units and trees behind them.
let hillFits = null;
const HILL_FLAT_FIT = { Lx: 0, Ly: 0, F0: 0, occ: false, flat: true };
// Whether a ground tile (and a cell round it) is all height 0: drawn in one piece (kept per battle).
function hillTileFlat(k, x0, y0, x1, y1) {
  if (!hillFits || hillFits.g !== G || hillFits.h !== G.hgt) hillFits = { g: G, h: G.hgt, m: new Map() };
  const T = hillFits.t || (hillFits.t = new Map());
  let f = T.get(k);
  if (f === undefined) {
    f = true;
    const c0 = Math.max(0, Math.floor(x0 / CELL) - 1), c1 = Math.min(MAP - 1, Math.floor(x1 / CELL) + 1), r0 = Math.max(0, Math.floor(y0 / CELL) - 1), r1 = Math.min(MAP - 1, Math.floor(y1 / CELL) + 1);
    for (let y = r0; y <= r1 && f; y++) for (let x = c0; x <= c1; x++) if (G.hgt[y * MAP + x] > 0) { f = false; break; }
    T.set(k, f);
  }
  return f;
}
function hillFit(gx, gy) {
  if (!hillFits || hillFits.g !== G || hillFits.h !== G.hgt) hillFits = { g: G, h: G.hgt, m: new Map() };
  const id = gy * 4096 + gx;
  let f = hillFits.m.get(id);
  if (f) return f;
  const N = HILL_CH, X0 = gx * N, Y0 = gy * N, X1 = X0 + N, Y1 = Y0 + N;
  const a = gLift(X0, Y0, true), b = gLift(X1, Y0, true), c = gLift(X0, Y1, true), d = gLift(X1, Y1, true);
  const Lx = (b - a + d - c) / (2 * N), Ly = (c - a + d - b) / (2 * N), Lc = (a + b + c + d) / 4;
  let occ = false;
  const S = VIEW.s, C = VIEW.c, F = VIEW.F, far = hillMax() / F + 8;
  for (const [px, py, L] of [[X0, Y0, a], [X1, Y0, b], [X0, Y1, c], [X1, Y1, d], [X0 + N / 2, Y0 + N / 2, gLift(X0 + N / 2, Y0 + N / 2, true)]]) {
    if (L <= 0) continue;
    for (let t = 4; t < far && !occ; t += 4) if (L - gLift(px - S * t, py - C * t, true) > t * F + 0.5) occ = true;
    if (occ) break;
  }
  f = { Lx, Ly, F0: Lc - Lx * (X0 + X1) / 2 - Ly * (Y0 + Y1) / 2, occ, flat: !a && !b && !c && !d };
  hillFits.m.set(id, f);
  return f;
}
// The ground's warp for one frame of the view canvas g (top left (vx, vy) on the view plane), or null (hills off).
//  set(c): g's transform for chunk c ({ X0, Y0, X1, Y1 } inside one grid chunk); flat(): the plain world transform;
//  each(x0, y0, x1, y1, fn): fn(X0, Y0, X1, Y1) for the chunks of a world box, back to front, each with its transform
//  set (left in the plain world transform after); box(c): chunk c's box on the view plane.
function hillWarp(g, vx, vy) {
  if (!LOOK.hills || !G || !G.hgt) return null;
  const C = VIEW.c, S = VIEW.s, F = VIEW.F, N = HILL_CH;
  const flat = () => g.setTransform(C, S * F, -S, C * F, -vx, -vy);
  const fitOf = (c) => c.fit || (c.fit = hillFit(Math.floor(c.X0 / N), Math.floor(c.Y0 / N)));
  const set = (c) => { const f = fitOf(c); g.setTransform(C, S * F - f.Lx, -S, C * F - f.Ly, -vx, -vy - f.F0); };
  return {
    flat, set, fitOf,
    box(c) {
      const f = fitOf(c);
      let a = Infinity, b = Infinity, cc = -Infinity, d = -Infinity;
      for (const [x, y] of [[c.X0, c.Y0], [c.X1, c.Y0], [c.X0, c.Y1], [c.X1, c.Y1]]) {
        const X = x * C - y * S, Y = (x * S + y * C) * F - (f.F0 + f.Lx * x + f.Ly * y);
        a = Math.min(a, X); b = Math.min(b, Y); cc = Math.max(cc, X); d = Math.max(d, Y);
      }
      return [a, b, cc, d];
    },
    // skip(X0, Y0, X1, Y1): leave a chunk out before it is sorted and its transform set (ui.js: the fog's, where none is dark)
    each(x0, y0, x1, y1, fn, skip) {
      const list = [];
      for (let cy = Math.floor(y0 / N) * N; cy < y1; cy += N) for (let cx = Math.floor(x0 / N) * N; cx < x1; cx += N) {
        const X0 = Math.max(x0, cx), Y0 = Math.max(y0, cy), X1 = Math.min(x1, cx + N), Y1 = Math.min(y1, cy + N);
        if (X1 > X0 && Y1 > Y0 && !(skip && skip(X0, Y0, X1, Y1))) list.push({ X0, Y0, X1, Y1, key: cx * S + cy * C });
      }
      list.sort((p, q) => p.key - q.key);
      for (const c of list) { set(c); fn(c.X0, c.Y0, c.X1, c.Y1); }
      flat();
    },
  };
}
// The soft patches of the ground (lookGround), for one chunk of it (drawn with the ground's warp, after its tile).
function hillPatch(g, x0, y0, x1, y1) {   // (no longer used: the patches are in the tiles, lookPatchTile)
  return;
  if (!hillPatch.pat || hillPatch.g !== g) { hillPatch.g = g; hillPatch.pat = g.createPattern(patchPic, 'repeat'); hillPatch.pat.setTransform(new DOMMatrix([12, 0, 0, 12, 0, 0])); }
  const op = g.globalCompositeOperation, sm = g.imageSmoothingEnabled;
  g.globalCompositeOperation = 'soft-light'; g.imageSmoothingEnabled = true; g.fillStyle = hillPatch.pat;
  g.fillRect(x0 - HILL_LAP, y0 - HILL_LAP, x1 - x0 + 2 * HILL_LAP, y1 - y0 + 2 * HILL_LAP);
  g.globalCompositeOperation = op; g.imageSmoothingEnabled = sm;
}

// ---- Light: grade, sun, clouds, lights --------------------------------------------------------------------------
let lookPics = null;
function lookGlowPic(c0, c1, c2) {
  const c = mkCanvas(64, 64), x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, c0); gr.addColorStop(0.38, c1); gr.addColorStop(1, c2); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return c;
}
// g: the screen; (vx, vy, vw, vh): the screen on the view plane; k: screen pixels per view pixel; t: battle clock.
// night: on the day/night maps (Village, Frost) how dark it is (0 by day; drawNight darkens after this), else undefined.
function drawLook(g, vx, vy, vw, vh, k, t, night) {
  const W = Math.round(vw * k), H = Math.round(vh * k), dn = night === undefined ? 1 : 1 - night, M = lookMood(t), rgba = (c, m) => `rgba(${c[0]},${c[1]},${c[2]},${(c[3] * m).toFixed(3)})`;
  g.save();
  g.globalCompositeOperation = 'saturation'; g.fillStyle = `rgba(128,128,128,${(M.sat * dn).toFixed(3)})`; g.fillRect(0, 0, W, H);   // muted colours
  const gr = M.grade.map((c) => Math.round(255 - (255 - c) * dn));
  g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgb(${gr})`; g.fillRect(0, 0, W, H);           // the map's grade
  const sun = g.createLinearGradient(0, 0, W * 0.8, H * 1.2);                                                    // low sun, upper left
  sun.addColorStop(0, rgba(M.sun, dn)); sun.addColorStop(0.45, 'rgba(128,128,128,0)'); sun.addColorStop(1, rgba(M.shade, dn));
  g.globalCompositeOperation = 'soft-light'; g.fillStyle = sun; g.fillRect(0, 0, W, H);
  if (M.haze[3] > 0.005) {   // haze: thicker toward the far (upper) side of the screen
    const hz = g.createLinearGradient(0, 0, 0, H);
    hz.addColorStop(0, rgba(M.haze, dn)); hz.addColorStop(1, rgba(M.haze, dn * 0.35));
    g.globalCompositeOperation = 'screen'; g.fillStyle = hz; g.fillRect(0, 0, W, H);
  }
  if (dn > 0.02) { g.globalAlpha = dn; cloudShadows(g, vx, vy, k, t); g.globalAlpha = 1; }
  g.restore();
  if (!lookPics) lookPoolPics();   // (day/night maps drawn the 2D way could get here first: "reading 'sh'" of null)
  const L = lookPics, lights = lookDayLights(vx, vy, vw, vh, night);
  drawLookLights(g, vx, vy, vw, vh, k, t, night, M, dn, lights, W, H, rgba, L);
}
// drawLook's lights, as [view x, view y, radius, strength, picture, squash] (also read by gl.js's light pass): structures
// (not defences), fires, blasts, bolts, the bigger blasts (lookfx.js) and, by day, the light pools.
function lookDayLights(vx, vy, vw, vh, night) {
  const dn = night === undefined ? 1 : 1 - night, M = lookMood(G.t), lights = [];
  lookPoolPics();
  const near = (x, y, m) => x > vx - m && y > vy - m && x < vx + vw + m && y < vy + vh + m;
  const add = (x, y, r, a, col, h, f) => { [x, y] = toView(...liftPt(x, y, (h || 0) + gLift(x, y))); if (near(x, y, r)) lights.push([x, y, r, Math.max(0, Math.min(1, a)), col, f || 1]); };
  for (const e of G.entities) {
    if (!e.alive || e.kind !== 'bld' || e.buildT < 1 || e.def.defense || !G.seen[idx(e.cx, e.cy)]) continue;   // (defences give off no light: owner)
    add((e.cx + e.w / 2) * CELL, (e.cy + e.h) * CELL - 4, 20 + e.w * 8, 0.45, 'warm');
  }
  for (const fx of G.effects) {
    if (fx.t < 0) continue;
    const h = fx.lift || 0;
    if (fx.type === 'fire') add(fx.x, fx.y, 40, 0.6, 'warm', h);
    else if (fx.type === 'expl' && fx.t < fx.life) add(fx.x, fx.y, (fx.size || 8) * 6.5, 0.9 * (1 - fx.t / fx.life), 'warm', h);
    else if (fx.type === 'flakburst' && fx.t < (fx.life || 0.4)) add(fx.x, fx.y, 40, 1 - fx.t / (fx.life || 0.4), 'warm', h);
    else if (fx.type === 'spark') add(fx.x, fx.y, 14, 0.6, 'warm', h);
    else if (fx.type === 'bolt' || fx.type === 'tesla') add(fx.x, fx.y, 90, 1, 'blue', h);
  }
  for (const b of G.bolts || []) add(b.x, b.y, 60, Math.min(1, b.t / 3), 'warm');
  lookFxLights(add);   // lookfx.js: the bigger blasts' light, merged here
  if (dn > 0.02) {   // light pools (lamp posts, window spill, ore): by day here; at night on the day/night maps from drawNight
    const cs = [[vx, vy], [vx + vw, vy], [vx, vy + vh], [vx + vw, vy + vh]].map(([X, Y]) => fromView(X, Y));
    const box = [Math.min(...cs.map((c) => c[0])) - 40, Math.min(...cs.map((c) => c[1])) - 40, Math.max(...cs.map((c) => c[0])) + 40, Math.max(...cs.map((c) => c[1])) + 80];
    poolLights(add, M.pool * dn, box);
  }
  return lights;
}
function drawLookLights(g, vx, vy, vw, vh, k, t, night, M, dn, lights, W, H, rgba, L) {
  const near = (x, y, m) => x > vx - m && y > vy - m && x < vx + vw + m && y < vy + vh + m;
  // A light shade over everything with soft holes where things glow (at half size, stretched up smoothly), then the
  // glow itself added once: each spot as bright as its brightest light ('lighten'), so overlapping blasts never pile
  // up into a white blob (owner, after the first video). Pools on the ground are squashed to the ground's slant (f).
  const R = 0.5, sW = Math.max(1, Math.round(W * R)), sH = Math.max(1, Math.round(H * R)), nk = k * R;
  for (const c of [L.sh, L.gl]) if (c.width !== sW || c.height !== sH) { c.width = sW; c.height = sH; }
  const n = L.sh.getContext('2d');
  n.globalCompositeOperation = 'source-over'; n.clearRect(0, 0, sW, sH);
  n.fillStyle = rgba(M.tint, dn); n.fillRect(0, 0, sW, sH);
  n.globalCompositeOperation = 'destination-out';
  for (const [x, y, r, a, , f] of lights) { n.globalAlpha = a; n.drawImage(L.hole, (x - vx - r) * nk, (y - vy - r * f) * nk, r * 2 * nk, r * 2 * f * nk); }
  n.globalAlpha = 1; n.globalCompositeOperation = 'source-over';
  const q = L.gl.getContext('2d'); q.clearRect(0, 0, sW, sH); q.globalCompositeOperation = 'lighten';
  for (const [x, y, r, a, col, f] of lights) { q.globalAlpha = a; const rr = col[0] === 'p' ? r : r * 0.75; q.drawImage(L[col], (x - vx - rr) * nk, (y - vy - rr * f) * nk, rr * 2 * nk, rr * 2 * f * nk); }
  q.globalAlpha = 1; q.globalCompositeOperation = 'source-over';
  g.save(); g.imageSmoothingEnabled = true; g.drawImage(L.sh, 0, 0, W, H);
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.3 * (0.5 + 0.5 * dn); g.drawImage(L.gl, 0, 0, W, H);
  // The pools' colour, screened on at full size (the shared glow above is too faint by day for them).
  g.globalCompositeOperation = 'screen';
  for (const [x, y, r, a, col, f] of lights) if (col[0] === 'p') { g.globalAlpha = Math.min(1, a * POOL_DAY); g.drawImage(L[col], (x - vx - r) * k, (y - vy - r * f) * k, r * 2 * k, r * 2 * f * k); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  if (LOOK.lamps && night === undefined) drawLamps(g, vx, vy, k, t, near);   // (day/night maps: drawLampsAlone, after drawNight)
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);   // vignette
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, rgba(M.vig, dn)); g.fillStyle = vg; g.fillRect(0, 0, W, H);
  g.restore();
}
// ---- Per-map mood (LOOK.mood) -----------------------------------------------------------------------------------------
// drawLook's colours per map (G.mapId) and theme: saturation taken out, the multiply grade, the low sun's warm side and the
// far side's shadow tint (soft-light), a haze ('screen', thicker toward the far side), the light shade's tint, the
// vignette, and how strong the light pools are by day. Rain (G.weather) pulls toward an overcast grey as it gets heavier
// (weatherLevel), falling snow toward a white haze. Without LOOK.mood every map gets BASE (the first grade, as before).
const MOOD_BASE = { sat: 0.26, grade: [218, 226, 228], sun: [255, 205, 140, 0.6], shade: [10, 25, 60, 0.4], haze: [200, 215, 230, 0],
  tint: [8, 16, 30, 0.22], vig: [0, 4, 12, 0.42], pool: 1 };
const MOOD = {
  bridge: {},                                                                                            // as BASE: a clear afternoon
  river: { sat: 0.3, grade: [210, 222, 210], sun: [235, 215, 165, 0.5], shade: [20, 45, 45, 0.42], haze: [190, 208, 196, 0.1], tint: [10, 22, 18, 0.24], vig: [2, 12, 8, 0.44] },   // green-grey river valley
  lakes: { sat: 0.24, grade: [210, 222, 234], sun: [255, 215, 175, 0.5], shade: [10, 30, 75, 0.42], haze: [205, 222, 242, 0.13], vig: [0, 6, 20, 0.42] },                         // cool, damp, misty
  twinlakes: { sat: 0.18, grade: [236, 226, 206], sun: [255, 196, 120, 0.7], shade: [60, 32, 22, 0.36], haze: [245, 222, 182, 0.1], tint: [24, 14, 6, 0.2], vig: [22, 8, 0, 0.4] },   // late summer, dry and warm
  marsh: { sat: 0.34, grade: [214, 222, 214], sun: [255, 196, 140, 0.5], shade: [24, 44, 58, 0.42], haze: [214, 222, 218, 0.2], tint: [12, 22, 22, 0.26], vig: [6, 12, 14, 0.46] },     // fen at dawn: grey-green, a low warm sun through the mist
  village: { sat: 0.2, grade: [232, 228, 214], sun: [255, 212, 150, 0.6], shade: [30, 30, 64, 0.38], haze: [236, 226, 206, 0.08], vig: [8, 6, 10, 0.38] },                          // pastoral, golden by day
  snow: { sat: 0.3, grade: [226, 236, 250], sun: [242, 246, 255, 0.55], shade: [20, 52, 115, 0.44], haze: [236, 243, 255, 0.17], tint: [10, 24, 54, 0.18], vig: [0, 12, 34, 0.32] },   // cold and bright (snowbound, frost)
  desert: { sat: 0.14, grade: [244, 226, 196], sun: [255, 190, 110, 0.75], shade: [85, 42, 20, 0.36], haze: [250, 226, 186, 0.15], tint: [30, 16, 4, 0.18], vig: [32, 12, 0, 0.38] },  // warm (for a desert theme)
  rain: { sat: 0.46, grade: [194, 202, 212], sun: [205, 210, 220, 0.14], shade: [20, 30, 46, 0.32], haze: [172, 182, 194, 0.2], tint: [10, 16, 26, 0.3], vig: [0, 4, 10, 0.5], pool: 1.4 },   // overcast
  snowfall: { haze: [238, 242, 250, 0.26], sun: [235, 240, 250, 0.3] },
};
let moodCache = null;
// Maps with day and night (MAPS daynight, every one now and later): their day is lit clearly brighter than the mood's
// usual afternoon, so day and night are easy to tell apart (owner, 2026-11-21: "It's just hard to tell when it's
// daylight"). The darkening layers (tint where nothing glows, the shade, the vignette) are lighter and the grade nearer
// white; the night (art.js drawNight, gl.js uNight) is as before.
const DAY_LIFT = { tint: 0.35, shade: 0.5, vig: 0.45, grade: 0.6, sat: 0.6 };
function dayLift(id, m) {
  if (!MAPS[id] || !MAPS[id].daynight) return m;
  const a = (c, k) => [c[0], c[1], c[2], c[3] * k];
  return { ...m, tint: a(m.tint, DAY_LIFT.tint), shade: a(m.shade, DAY_LIFT.shade), vig: a(m.vig, DAY_LIFT.vig),
    grade: m.grade.map((v) => Math.round(v + (255 - v) * DAY_LIFT.grade)), sat: m.sat * DAY_LIFT.sat };
}
function lookMood(t) {
  if (!LOOK.mood || !G) return MOOD_BASE;
  const id = validMap(G.mapId), th = mapTheme(G.mapId);
  if (!moodCache || moodCache.g !== G) moodCache = { g: G, m: dayLift(id, { ...MOOD_BASE, ...(MOOD[th === 'snow' || th === 'desert' ? th : id] || {}) }) };
  const m = moodCache.m, w = G.weather;
  if (!w) return m;
  const o = MOOD[w.kind === 'rain' ? 'rain' : 'snowfall'], f = Math.min(1, weatherLevel(w, t)) * 0.8, out = {};
  for (const key in m) {
    const a = m[key], b = o[key];
    out[key] = b === undefined ? a : Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * f) : a + (b - a) * f;
  }
  for (const c of ['grade']) out[c] = out[c].map(Math.round);
  for (const c of ['sun', 'shade', 'haze', 'tint', 'vig']) out[c] = out[c].map((v, i) => (i < 3 ? Math.round(v) : v));
  return out;
}
// Cloud shadows: a tileable soft noise (4 octaves) cut into cloud shapes, fixed to the ground (the view plane) and
// drifting with the wind; multiplied over the picture, so they darken without hiding anything.
let cloudPic = null;
function cloudShadows(g, vx, vy, k, t) {
  cloudShadowPic();
  const S = 7, dx = t * 9, dy = t * 3.5;   // a noise pixel is 7 view pixels (clouds a few hundred across); drift, view px a second
  const pat = g.createPattern(cloudPic, 'repeat');
  pat.setTransform(new DOMMatrix([S * k, 0, 0, S * k * 0.75, (-vx + dx) * k, (-vy + dy) * k]));
  g.save(); g.imageSmoothingEnabled = true; g.globalCompositeOperation = 'multiply'; g.fillStyle = pat; g.fillRect(0, 0, g.canvas.width, g.canvas.height); g.restore();
}
function cloudShadowPic() {   // (also gl.js's light pass)
  if (!cloudPic) {
    const N = 256, c = mkCanvas(N, N), x = c.getContext('2d'), img = x.createImageData(N, N);
    const hash = (i, j, p) => { let h = (((i % p) + p) % p) * 374761393 + (((j % p) + p) % p) * 668265263 + p * 97; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const sm = (a) => a * a * (3 - 2 * a);
    const vn = (u, v, p) => { const i = Math.floor(u), j = Math.floor(v), fu = sm(u - i), fv = sm(v - j);
      const a = hash(i, j, p), b = hash(i + 1, j, p), cc = hash(i, j + 1, p), d = hash(i + 1, j + 1, p);
      return a + (b - a) * fu + (cc - a) * fv + (a - b - cc + d) * fu * fv; };
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      let v = 0, amp = 0.5, p = 4;
      for (let o = 0; o < 4; o++) { v += amp * vn(px / N * p, py / N * p, p); amp *= 0.5; p *= 2; }
      const a = sm(Math.max(0, Math.min(1, (v - 0.52) / 0.1))), i = (py * N + px) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 - a * 140); img.data[i + 3] = 255;   // white: no shadow
    }
    x.putImageData(img, 0, 0);
    cloudPic = c;
  }
  return cloudPic;
}

// ---- Cliffs: the rock ridges stand up -----------------------------------------------------------------------------
// The ridge's own height field (art.js paintCliffs, the same noise and seed, so the crag stands exactly on its painted
// foot), raised CLIFF_UP times and drawn as a voxel-space picture per cell: every world pixel a column from the ground
// to its height, back to front, shaded by its slope (light from the upper left of the screen, as the grade's sun), with
// rock strata and darker toward the foot. Pictures are made once per cell (a few a frame) and sorted in with the units
// by the cell's middle, so a tank behind a ridge goes behind it.
const CLIFF_UP = 1, CLIFF_TOP = 34;   // world units of height (x VK on the screen: about 28 px)
let cliffLook = null;
// Baked crags (tools/bake-cliffs.js): the fixed maps' crags drawn once into sheets, cliffs/<map>/<i>.webp, with
// cliffs/<map>/index.json saying where each cell's picture is. A battle on a fixed map loads all of its sheets while the
// deploying card is up (ui.js loading, cliffsReady), so no crag is made in play and none pops in; the old way (made a few a
// frame, below) is kept for generated maps, a stale or missing bake, ?lookoff=bake, and the moments before the sheets are in.
// Their shadows are baked into the ground (tools/bake-ground.js, cliffShadowPaint) when the ground is baked: no picture each.
const CliffSheets = (() => {
  let man = null, settled = false;
  const ok = () => GroundSheets.ok() && !/[?&]lookoff=[a-z,]*\bbake\b/.test(location.search);
  // HD ground: the crags baked at its detail (tools/bake-cliffs.js --hd, cliffs-hd/, manifest k); none: made in play at it.
  const dir = typeof GK !== 'undefined' && GK > 1 ? 'cliffs-hd/' : 'cliffs/';
  if (ok()) fetch(dir + 'manifest.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((m) => { man = m && (m.k || 1) === (typeof GK !== 'undefined' ? GK : 1) ? m : null; }).catch(() => {}).then(() => { settled = true; });
  else settled = true;
  return { get manifest() { return man; }, get settled() { return settled; }, ok, dir };
})();
function cliffBakeStart(L) {
  if (L.bake !== undefined || !CliffSheets.settled) return;
  const man = CliffSheets.manifest, id = validMap(G.mapId), m = man && man.maps && man.maps[id];
  if (!m || m.key !== groundKey(G)) { L.bake = null; return; }
  const dir = CliffSheets.dir + id + '/', q = '?k=' + m.key + '.' + man.code, B = L.bake = { ready: false, failed: false, n: 0, of: m.files || 1 };
  const get = (f) => fetch(dir + f + q).then((r) => { if (!r.ok) throw new Error(f + ' ' + r.status); return r; });
  get('index.json').then((r) => r.json()).then((ix) => Promise.all(Array.from({ length: ix.sheets }, (_, i) => get(i + '.webp').then((r) => r.blob()).then((b) => createImageBitmap(b)).then((bmp) => { B.n++; return bmp; })))
    .then((bmps) => {
      const P = ix.pics, has = new Set();
      for (let i = 0; i < P.length; i += 8) { L.pics.set(P[i], { c: bmps[P[i + 1]], sx: P[i + 2], sy: P[i + 3], w: P[i + 4], h: P[i + 5], X0: P[i + 6], Y0: P[i + 7], k: man.k || 1, baked: 1 }); has.add(P[i]); }
      for (const c of L.cells.keys()) if (!has.has(c)) L.pics.set(c, null);
      B.ready = true;
    }))
    .catch((e) => { B.failed = true; if (typeof Report !== 'undefined' && Report.oops) Report.oops('cliffSheet', e.message || e); });
}
// For ui.js's deploying card: the crags are in (or will be made in play).
function cliffsReady() {
  if (!LOOK.cliffs || !G || !G.cliff) return true;
  const L = cliffLookFor(); cliffBakeStart(L);
  return L.bake === null || (L.bake !== undefined && (L.bake.ready || L.bake.failed));
}
// For the loading card's bar: how much of the crags is in (0 to 1).
function cliffsProgress() {
  if (cliffsReady()) return 1;
  const B = cliffLook && cliffLook.bake;
  return B ? Math.min(0.95, B.n / B.of) : 0;
}
// The crags' shadows are in the ground's own pictures (the baked ground, made with them).
// (HD ground: painted into each tile as it is made, art.js finishSome, the same way)
const cliffShadowsBaked = () => !!(G.ground && ((G.ground.K > 1 && !G.ground.resident) || (G.ground.baked && G.ground.bakedOk && GroundSheets.manifest && GroundSheets.manifest.shadows)));
function cliffLookFor() {
  if (cliffLook && cliffLook.g === G) return cliffLook;
  const cells = G.cliff ? cliffCells(G.terr, G.cliff) : new Map();
  let h = null;
  cliffLook = { g: G, cells, get height() { return h || (h = cliffHeight(cells)); }, pics: new Map(), snow: mapTheme(G.mapId) === 'snow' };
  return cliffLook;
}
// The height of the rock at world (x, y) (worked out only when a crag is made in play, or baked).
function cliffHeight(cells) {
  // paintCliffs' own mound sum with its ragged edge (where it passes 0.5 the painted ridge begins), cut from its source.
  const src = paintCliffs.toString(), cut = src.indexOf('const q = (o - 0.5) / 0.5;');
  const mk = (0, eval)('(' + src.slice(0, cut) + 'return o; }; return height; })');
  const mound = mk(null, cells, groundSeed(G), false);
  // A plateau: from the painted foot the rock rises steeply to a flat top CLIFF_TOP high, with a little roughness.
  // Ore and gems the painted rock reaches (a cell or two on some maps, tools/sim/map-check.js): the crag fades out over them
  // so the ore stays in sight (looks only; the cells were always open and harvestable).
  const oreCell = new Set(); if (G.ore) for (let c = 0; c < NCELLS; c++) if (G.ore[c]) oreCell.add(c);
  // Likewise the rock agrees with the rules cell by cell: an open cell next to a cliff that its rock would mostly cover
  // fades as ore does (it looked blocked), and a cliff cell its rock hardly reaches gets a boulder (it looked open).
  const bare = new Set();
  if (G.cliff) {
    const cov = (c) => { let k = 0; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (mound((c % MAP + (i + 0.5) / 4) * CELL, (((c / MAP) | 0) + (j + 0.5) / 4) * CELL) > 0.5) k++; return k / 16; };
    const near = new Set();
    for (let c = 0; c < NCELLS; c++) if (G.cliff[c]) { if (cov(c) < 0.25) bare.add(c); const x = c % MAP, y = (c / MAP) | 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const nx = x + i, ny = y + j; if (nx >= 0 && ny >= 0 && nx < MAP && ny < MAP && !G.cliff[ny * MAP + nx] && !G.block[ny * MAP + nx]) near.add(ny * MAP + nx); } }
    for (const c of near) if (!oreCell.has(c) && cov(c) > 0.5) oreCell.add(c);
  }
  const oreFade = (x, y) => {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL); let d = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (oreCell.has((cy + j) * MAP + cx + i)) d = Math.min(d, Math.hypot(x / CELL - (cx + i + 0.5), y / CELL - (cy + j + 0.5)));
    if (d >= 1.2) return 1;
    const k = Math.max(0, Math.min(1, (d - 0.55) / 0.65)); return k * k * (3 - 2 * k);
  };
  // A map's mesas (MAPS mesas, world.js makeHeights; Lakeside): the rim's crags rise from the low ground to the top's
  // drawn height (gLift: HILL_DRAW x the rules' height), so the plateau stands as one block of cliff, its top level with the rock.
  const mesas = (G.hgt && MAPS[validMap(G.mapId)].mesas) || [], tops = new Map();
  const topOf = (c) => {
    if (!mesas.length) return CLIFF_TOP;
    let t = tops.get(c);
    if (t === undefined) {
      t = CLIFF_TOP;   // (a rim cell up on the top itself: only a lip, so the top stays level)
      for (const m of mesas) if (Math.hypot(c % MAP + 0.5 - m.x, ((c / MAP) | 0) + 0.5 - m.y) < m.r + 1.5) t = (HG_MAX * (m.h || 1) - G.hgt[c]) * HILL_DRAW + 2;
      tops.set(c, t);
    }
    return t;
  };
  // (c: the cell whose crag is being made: its margin's samples are sized for its own foot, so its top is level.)
  return (x, y, c) => {
    let q = (mound(x, y) - 0.5) * (oreCell.size ? oreFade(x, y) : 1);
    if (bare.size) { const c = Math.floor(y / CELL) * MAP + Math.floor(x / CELL); if (bare.has(c)) q = Math.max(q, 0.12 * (1 - Math.hypot(x / CELL - (c % MAP + 0.5), y / CELL - ((c / MAP | 0) + 0.5)) / 0.75)); }
    if (q <= 0) return 0;
    const s = Math.min(1, q / 0.22), l = cells.get(Math.floor(y / CELL) * MAP + Math.floor(x / CELL));
    const big = Math.min(1, 0.3 + (l ? l.length / 2 : 0) / 9);   // a lone rock stays a boulder; a ridge rises full height
    return topOf(c === undefined ? Math.floor(y / CELL) * MAP + Math.floor(x / CELL) : c) * big * s * s * (3 - 2 * s) + (hash3(x >> 2, y >> 2, 21) - 0.5) * 1.5;
  };
}
// The rock's columns over cell c: [x, y, height, slope x, slope y, foot, xi, yi] per world pixel, and the highest.
// K (HD crags): K x K columns per world pixel, each at its own middle (x, y: world, fractional; xi, yi: the fine grid).
function cliffPts(L, c, K = 1) {
  const cx = c % MAP, cy = (c / MAP) | 0, Hf = L.height;
  // The height over the cell and a margin, smoothed (5 x 5): raised CLIFF_UP times, the ridge's fine noise made the tops
  // bumpy and streaked. (K: sampled at the fine grid and smoothed over the same world width, in two passes.)
  const B = 4 * K, N = CELL * K + 2 * B, raw = new Float32Array(N * N), sm = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) raw[j * N + i] = Hf(cx * CELL - 4 + (i + 0.5) / K, cy * CELL - 4 + (j + 0.5) / K, c);
  if (K === 1) for (let j = 2; j < N - 2; j++) for (let i = 2; i < N - 2; i++) {
    let a = 0; for (let v = -2; v <= 2; v++) for (let u = -2; u <= 2; u++) a += raw[(j + v) * N + i + u];
    sm[j * N + i] = raw[j * N + i] > 0.4 ? a / 25 : 0;
  } else {
    const R = 2 * K, D = (2 * R + 1) * (2 * R + 1), row = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = R; i < N - R; i++) { let a = 0; for (let u = -R; u <= R; u++) a += raw[j * N + i + u]; row[j * N + i] = a; }
    for (let j = R; j < N - R; j++) for (let i = R; i < N - R; i++) { let a = 0; for (let v = -R; v <= R; v++) a += row[(j + v) * N + i]; sm[j * N + i] = raw[j * N + i] > 0.4 ? a / D : 0; }
  }
  const at = (x, y) => sm[(y - cy * CELL * K + B) * N + x - cx * CELL * K + B];   // (x, y: the fine grid)
  // On a map with mesas (Lakeside), the ground under a rim crag is not level: each column stops at the ground it stands on
  // (its foot, f world units above the cell's middle), so none of it shows on the plateau's top. Elsewhere f is 0.
  const ms = G.hgt && MAPS[validMap(G.mapId)].mesas, h0 = ms ? hgtAt((cx + 0.5) * CELL, (cy + 0.5) * CELL, true) : 0;
  const pts = [];
  let top = 0;
  for (let yi = cy * CELL * K; yi < (cy + 1) * CELL * K; yi++) for (let xi = cx * CELL * K; xi < (cx + 1) * CELL * K; xi++) {
    const h = at(xi, yi);
    if (h <= 0.4) continue;
    const x = K === 1 ? xi : (xi + 0.5) / K - 0.5, y = K === 1 ? yi : (yi + 0.5) / K - 0.5;
    const gx = (at(xi + 1, yi) - at(xi - 1, yi)) * K, gy = (at(xi, yi + 1) - at(xi, yi - 1)) * K;
    pts.push([x, y, h, gx, gy, ms ? (hgtAt(x + 0.5, y + 0.5, true) - h0) * HILL_DRAW : 0, xi, yi]); top = Math.max(top, h);
  }
  // A mesa's crag (ms): its flat top takes the ground's own grass (groundPixels, painted without the rock, lit as level
  // ground at its height), so the rim's top matches the plateau's middle; and the foot's height (h0, drawn units) for its shadow.
  let gcol = null;
  if (ms) {
    if (!L.gp) L.gp = groundPixels(G.terr, groundSeed(G), G.road, null, G.ford, mapTheme(G.mapId), null);
    gcol = new Uint8ClampedArray(CELL * CELL * K * K * 4); L.gp.pixels(gcol, cx * CELL, cy * CELL, CELL, CELL, K);
  }
  let tAbs = 0;   // the mesa's top (drawn units)
  if (ms) for (const m of ms) if (Math.hypot(cx + 0.5 - m.x, cy + 0.5 - m.y) < m.r + 1.5) tAbs = HG_MAX * (m.h || 1) * HILL_DRAW;
  return { pts, top, gcol, h0: h0 * HILL_DRAW, tAbs };
}
// Its shadow falls away from the sun: CLIFF_SL x its height along (CLIFF_SDX, CLIFF_SDY) on the ground (world px), drawn
// at CLIFF_SA (each crag's own: where two meet, darker).
const CLIFF_SL = 1.1, CLIFF_SDX = 0.8, CLIFF_SDY = -0.3, CLIFF_SA = 0.45;
// A mesa's crag (Lakeside): its shadow's ray, at height z (drawn units) over world (x, y), lands only where the ground is
// lower, so the rim casts none over the plateau's own top.
const mesaShade = (z, x, y) => z > hgtAt(x, y, true) * HILL_DRAW + 1;
// noShadow: the crag only (its shadow is in the baked ground, or the bake: tools/bake-cliffs.js).
// K (HD ground): the picture (and its shadow) at K pixels per view pixel (_k), its columns on the fine grid; X0, Y0, w, h
// stay in view pixels.
function cliffPic(L, c, noShadow, K = 1) {
  const cx = c % MAP, cy = (c / MAP) | 0, mx = (cx + 0.5) * CELL, my = (cy + 0.5) * CELL;
  const { pts, top, gcol, h0, tAbs } = cliffPts(L, c, K);
  if (!pts.length) return null;
  const up = top * CLIFF_UP * VK;
  const lev = gcol ? 1 + (h0 + top) / HILL_DRAW * 0.005 * (typeof HILL_SHADE !== 'undefined' ? HILL_SHADE : 1) : 1;   // (groundPixels' light on level ground that high)
  const cs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => toView(a * CELL / 2, b * CELL / 2));
  const X0 = Math.floor(Math.min(...cs.map((p) => p[0]))) - 2, X1 = Math.ceil(Math.max(...cs.map((p) => p[0]))) + 2;
  const Y0 = Math.floor(Math.min(...cs.map((p) => p[1])) - up) - 2, Y1 = Math.ceil(Math.max(...cs.map((p) => p[1]))) + 2;
  const W = X1 - X0, H = Y1 - Y0, WK = W * K, HK = H * K, pic = mkCanvas(WK, HK), ctx = pic.getContext('2d'), img = ctx.createImageData(WK, HK), d = img.data;
  // Its shadow on the ground, away from the sun (to the screen's right and a little down), drawn under everything.
  const SL = CLIFF_SL, [sdx, sdy] = toView(CLIFF_SDX, CLIFF_SDY), sx1 = X1 + Math.ceil(top * CLIFF_UP * SL * sdx) + 2, sy1 = Y1 + Math.ceil(top * CLIFF_UP * SL * Math.max(0, sdy)) + 2;
  const SW = sx1 - X0, SH = sy1 - Y0, SWK = SW * K, SHK = SH * K, sm2 = noShadow ? null : new Uint8Array(SWK * SHK);
  const ROCK = L.snow ? [[40, 42, 50], [58, 60, 68], [80, 82, 92], [104, 106, 116], [150, 156, 170], [206, 214, 226], [236, 240, 247]]
    : [[44, 34, 26], [62, 49, 36], [84, 67, 49], [108, 88, 65], [134, 112, 84], [162, 139, 106], [190, 168, 132]];
  const Lx = -0.8, Ly = 0.3, Lz = 0.6, Ll = Math.hypot(Lx, Ly, Lz);   // towards the sun: the screen's upper left
  pts.sort((a, b) => viewDepth(a[0], a[1]) - viewDepth(b[0], b[1]));   // back to front
  for (const [x, y, h, gx, gy, f, xi, yi] of pts) {
    const [vX, vY] = toView(x + 0.5 - mx, y + 0.5 - my), hz = h * CLIFF_UP;
    const nx = -gx * 0.5 * CLIFF_UP, ny = -gy * 0.5 * CLIFF_UP, nl = Math.hypot(nx, ny, 1);
    const lit = (nx * Lx + ny * Ly + Lz) / nl / Ll, steep = 1 - 1 / nl;
    const sp = hash3(xi, yi, 11);
    if (sm2) for (let st = 0, len = hz * SL; st <= len; st += 1 / K) {
      // (a mesa's crag: only where the ray lands on ground at the crag's own foot, as this picture lies at the foot's height)
      if (gcol && (!mesaShade(h0 + hz - st / SL, x + CLIFF_SDX * st, y + CLIFF_SDY * st) || Math.abs(hgtAt(x + CLIFF_SDX * st, y + CLIFF_SDY * st, true) * HILL_DRAW - h0) > 3)) continue;
      const qx = Math.round((vX - X0 + sdx * st) * K), qy = Math.round((vY - Y0 + sdy * st) * K);
      if (qx >= 0 && qx < SWK - 1 && qy >= 0 && qy < SHK) sm2[qy * SWK + qx] = sm2[qy * SWK + qx + 1] = 1;
    }
    const px0 = Math.round((vX - X0) * K - 0.5), yTop = Math.round((vY - hz * VK - Y0) * K), yBot = Math.round((vY - Y0) * K);
    for (let py = yTop; py <= yBot; py++) {
      const z = hz - (py - yTop) / (VK * K);   // the height of this pixel of the column
      if (f > 0 && z < f) break;          // (below the ground it stands on: cliffPts)
      let v = 1.2 + lit * 4.4 + (sp - 0.5) * 0.7 + Math.min(1, z / CLIFF_TOP) * 0.8;
      if (steep > 0.45 && ((z + hash3(Math.floor(x) >> 3, Math.floor(y) >> 3, 5) * 3) % 8) < 1.2) v -= 0.8;   // strata on the faces
      if (z < 4) v -= (4 - z) * 0.3;                                                     // darker at the foot
      if (py === yTop && steep < 0.5) v += 0.4;                                          // a lit lip on flat tops
      let t = ROCK[Math.max(0, Math.min(ROCK.length - 1, Math.floor(v)))];
      if (gcol && ((py - yTop < 3 * K && steep < 0.55) || (tAbs && h0 + z > tAbs - 3))) {   // a mesa's top (and rock just under its level): the ground's grass
        const j = ((yi - cy * CELL * K) * CELL * K + xi - cx * CELL * K) * 4, m = tAbs && h0 + z > tAbs - 3 ? 1 : Math.min(1, (0.55 - steep) * 3);
        t = [t[0] + (gcol[j] * lev - t[0]) * m, t[1] + (gcol[j + 1] * lev - t[1]) * m, t[2] + (gcol[j + 2] * lev - t[2]) * m];
      } else if (py - yTop < 2 * K && steep < 0.55) {   // the top: grass and moss over the rock, lit by the sun
        const gr = L.snow ? [214, 220, 230] : [64, 84, 40], k = 0.75 + lit * 0.45 + (hash3(xi, yi, 13) - 0.5) * 0.25, m = Math.min(1, (0.55 - steep) * 3);
        t = [t[0] + (gr[0] * k - t[0]) * m, t[1] + (gr[1] * k - t[1]) * m, t[2] + (gr[2] * k - t[2]) * m];
      }
      for (const px of [px0, px0 + 1]) {
        if (px < 0 || px >= WK || py < 0 || py >= HK) continue;
        const i = (py * WK + px) * 4; d[i] = t[0]; d[i + 1] = t[1]; d[i + 2] = t[2]; d[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  if (K > 1) pic._k = K;
  if (!sm2) return { c: pic, sh: null, X0, Y0, w: W, h: H, k: K };
  const shp = mkCanvas(SWK, SHK), sc = shp.getContext('2d'), si = sc.createImageData(SWK, SHK);
  for (let i = 0; i < sm2.length; i++) if (sm2[i]) { si.data[i * 4 + 1] = 6; si.data[i * 4 + 2] = 18; si.data[i * 4 + 3] = 255; }
  sc.putImageData(si, 0, 0);
  if (K > 1) shp._k = K;
  return { c: pic, sh: shp, X0, Y0, w: W, h: H, k: K };
}
// For tools/bake-ground.js: the crags' shadows painted into the ground at world (x0, y0, w, h) of g (at its 0, 0), as
// cliffPic draws them on the ground in play (each crag's shadow at CLIFF_SA, lying in the world, so the ground's own hills
// carry it). The shadows are worked out once a battle (cliffLook.shades).
function cliffShadowPaint(g, x0, y0, w, h) {
  if (!LOOK.cliffs || !G.cliff) return;
  const L = cliffLookFor();
  if (!L.shades) {
    L.shades = [];
    for (const c of L.cells.keys()) {
      const { pts, gcol, h0 } = cliffPts(L, c);
      if (!pts.length) continue;
      const on = new Map();
      for (const [x, y, hh] of pts) for (let st = 0, len = hh * CLIFF_UP * CLIFF_SL; st <= len; st += 0.5) if (!gcol || mesaShade(h0 + hh - st / CLIFF_SL, x + 0.5 + CLIFF_SDX * st, y + 0.5 + CLIFF_SDY * st)) on.set(Math.floor(y + 0.5 + CLIFF_SDY * st) * 65536 + Math.floor(x + 0.5 + CLIFF_SDX * st), 1);
      if (!on.size) continue;   // (a mesa's crag whose shadow all falls on the top: none)
      let a = 1e9, b = 1e9, A = -1e9, Bm = -1e9;
      for (const k of on.keys()) { const X = k % 65536, Y = Math.floor(k / 65536); a = Math.min(a, X); A = Math.max(A, X); b = Math.min(b, Y); Bm = Math.max(Bm, Y); }
      const W = A - a + 1, H = Bm - b + 1, m = mkCanvas(W, H), mc = m.getContext('2d'), id = mc.createImageData(W, H);
      for (const k of on.keys()) { const i = ((Math.floor(k / 65536) - b) * W + k % 65536 - a) * 4; id.data[i + 1] = 6; id.data[i + 2] = 18; id.data[i + 3] = 255; }
      mc.putImageData(id, 0, 0);
      L.shades.push({ x: a, y: b, m });
    }
  }
  g.save(); g.globalAlpha = CLIFF_SA;
  for (const s of L.shades) if (s.x < x0 + w && s.y < y0 + h && s.x + s.m.width > x0 && s.y + s.m.height > y0) g.drawImage(s.m, s.x - x0, s.y - y0);
  g.restore();
}
// From ui.js draw: the cliff cells round the screen as things to sort in with the units.
// Crags not baked are made on screen within CLIFF_MS a frame (and at least 9), then those within CLIFF_AHEAD px of the
// screen; one made on screen fades in over CLIFF_FADE ms. A phone keeps CLIFF_KEEP of them (least recently seen let go).
const CLIFF_MS = 4, CLIFF_AHEAD = 320, CLIFF_FADE = 250;
const CLIFF_KEEP = typeof GROUND_ROOMY !== 'undefined' && GROUND_ROOMY ? Infinity : 3500;
const cliffAlpha = (p) => { if (!p.born) return 1; const a = (performance.now() - p.born) / CLIFF_FADE; if (a >= 1) { p.born = 0; return 1; } return Math.max(0, a); };
function cliffItems(list, x0, y0, x1, y1, shows) {
  lookGround(lookView, x0, y0, x1, y1, shows && ((x, y) => shows(x, y, 40, 40, 40)));   // (the ground's patches and tracks first: under the cliffs' shadows)
  lookFxGround(lookView, x0, y0, x1, y1);   // lookfx.js: blasts' scorch marks and rings, and the update of its particles
  lookPuddles(lookView, x0, y0, x1, y1, shows && ((x, y) => shows(x, y, 60, 50, 160)));   // puddles in the rain (under the fog)
  lookFogGround(lookView, x0, y0, x1, y1);   // fog lying on the ground, under the units
  poolItems(list, x0, y0, x1, y1, shows);   // lamp posts (light pools), with their shadows
  if (!LOOK.cliffs || !G.cliff) return;
  const L = cliffLookFor(), now = performance.now(), until = now + CLIFF_MS;
  cliffBakeStart(L);
  const baked = !!(L.bake && L.bake.ready), noSh = cliffShadowsBaked();
  if (L.bake && !baked && !L.bake.failed) return;   // (the sheets are coming: behind the deploying card, so none are made meanwhile)
  L.frame = (L.frame || 0) + 1;
  let made = 0, behind = false;
  // The cliff cells by map row (made once: the cells are fixed for a battle), so only the rows round the screen are
  // looked at, not every cliff cell of the map each frame (thousands on Heron Fen's plateaus).
  if (!L.rows) { L.rows = Array.from({ length: MAP }, () => []); for (const c of L.cells.keys()) L.rows[(c / MAP) | 0].push(c); }
  const r0 = Math.max(0, Math.floor((y0 - 40) / CELL - 0.5)), r1 = Math.min(MAP - 1, Math.ceil((y1 + 120) / CELL - 0.5));
  for (let r = r0; r <= r1; r++) for (const c of L.rows[r]) {
    const x = (c % MAP + 0.5) * CELL, y = (r + 0.5) * CELL;
    if (x < x0 - 40 || x > x1 + 40 || y < y0 - 40 || y > y1 + 120 || !shows(x, y) || !G.seen[c]) continue;
    let p = L.pics.get(c);
    if (p === undefined) {
      if (made > 8 && performance.now() >= until) { behind = true; continue; }
      made++; p = cliffPic(L, c, noSh, GK); L.pics.set(c, p);
      if (p && L.frame > 3) p.born = now;   // (made while on screen: it rises in over CLIFF_FADE rather than popping up)
    }
    if (p) { p.used = L.frame; list.push({ kind: 'cliff', x, y, p }); }
  }
  // Time left: the crags just off screen are made ahead (nearest first is not needed: the ring is narrow), so a scroll or
  // a short jump finds them ready.
  if (!behind && !baked) {
    const M = CLIFF_AHEAD;
    for (const c of L.cells.keys()) {
      if (performance.now() >= until) break;
      if (L.pics.has(c) || !G.seen[c]) continue;
      const x = (c % MAP + 0.5) * CELL, y = (((c / MAP) | 0) + 0.5) * CELL;
      if (x < x0 - M || x > x1 + M || y < y0 - M || y > y1 + M + 80) continue;
      const p = cliffPic(L, c, noSh, GK); L.pics.set(c, p); if (p) p.used = L.frame;
    }
  }
  // A phone keeps the crags last seen only (each is a picture and its shadow: a whole explored Snowbound came to ~170 MB).
  // Baked ones are parts of the sheets, kept whole.
  if (!baked && L.pics.size > CLIFF_KEEP * 1.25) {
    const old = [...L.pics].filter(([, p]) => p && !p.baked && p.used < L.frame).sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < old.length && L.pics.size > CLIFF_KEEP; i++) L.pics.delete(old[i][0]);
  }
  // The shadows now, on the ground under everything (the list is drawn after).
  for (const e of list) if (e.kind === 'cliff' && !e.post && e.p.sh && !noSh) onHill(lookView, e.x, e.y, () => cliffShadow(lookView, e));
}
let lookView = null;   // the view canvas's context, set by ui.js before cliffItems
function cliffShadow(g, e) {
  if (!g || !e.p.sh) return;
  const m = g.getTransform(), up = g.upright;
  const sx = m.a * e.x + m.c * e.y + m.e, sy = m.b * e.x + m.d * e.y + m.f;
  g.upright = false; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = CLIFF_SA * cliffAlpha(e.p);
  const k = e.p.k || 1;
  g.drawImage(e.p.sh, Math.round(sx + e.p.X0), Math.round(sy + e.p.Y0), e.p.sh.width / k, e.p.sh.height / k);
  g.globalAlpha = 1; g.setTransform(m); g.upright = up;
}
// The same as onHill + drawCliff, for a run of crags in the list (ui.js, WebGL): g already in screen px (identity, not
// upright), WM the world transform the list is drawn through. Its spot on the screen is worked out here, so a run of crags
// costs no transform changes (zoomed out over Lakeside ~1,100 crags a frame, each with five, were most of "bld").
function drawCliffAt(g, e, WM) {
  const p = e.p, L = gLift(e.x, e.y);
  if (!LIFT_V) LIFT_V = fromView(0, -1);
  const x = e.x + (L ? LIFT_V[0] * L : 0), y = e.y + (L ? LIFT_V[1] * L : 0);
  const sx = WM.a * x + WM.c * y + WM.e, sy = WM.b * x + WM.d * y + WM.f;
  const a = cliffAlpha(p), ga = g.globalAlpha; if (a < 1) g.globalAlpha = ga * a;
  const X = Math.round(sx + p.X0), Y = Math.round(sy + p.Y0);
  cliffBlit(g, p, X, Y);
  g.globalAlpha = ga;
}
// A crag's picture at view (X, Y): its part of a sheet (sx, sy, w, h in the sheet's pixels: k per view pixel), or its own.
function cliffBlit(g, p, X, Y) {
  const k = p.k || 1;
  if (p.sx !== undefined) g.drawImage(p.c, p.sx, p.sy, p.w, p.h, X, Y, p.w / k, p.h / k);
  else if (k > 1) g.drawImage(p.c, X, Y, p.c.width / k, p.c.height / k);
  else g.drawImage(p.c, X, Y);
}
function drawCliff(g, e) {
  const m = g.getTransform(), up = g.upright, p = e.p;
  const sx = m.a * e.x + m.c * e.y + m.e, sy = m.b * e.x + m.d * e.y + m.f;
  g.upright = false; g.setTransform(1, 0, 0, 1, 0, 0);
  const a = cliffAlpha(p), ga = g.globalAlpha; if (a < 1) g.globalAlpha = ga * a;
  const X = Math.round(sx + p.X0), Y = Math.round(sy + p.Y0);
  cliffBlit(g, p, X, Y);   // (baked: its part of a sheet)
  g.globalAlpha = ga; g.setTransform(m); g.upright = up;
}

// ---- Ground round structures (Tiberian Sun style; owner, 2026-11-19, from a Tiberian Sun screenshot) ------------------
// In place of bibDecal's trodden dirt: ragged patches of worn ground round every structure (dark wet earth on snow maps,
// trodden dirt elsewhere), reaching out up to CON_M px, their edges cut by a noise of the world position so the patches of
// neighbouring structures run together. A concrete slab only under the structures trucks and vehicles use (CON_SLABBED:
// Ore Refinery, War Factory), exactly their footprint, with a neat edge; everything else stands on its own base. Every
// pixel depends only on its world position (hash3), so overlapping marks and tile edges match (art.js "The ground in tiles").
// (Before: concrete under every structure with a ring of slabs round it, first with gaps, then whole with cracked edges.)
const CON_SLAB = 12, CON_M = 40, CON_SLABBED = { refinery: 1, factory: 1 };
function conNoise(x, y, sc, k) {
  const fx = x / sc, fy = y / sc, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const a = hash3(i, j, k), b = hash3(i + 1, j, k), c = hash3(i, j + 1, k), d = hash3(i + 1, j + 1, k);
  return (a + (b - a) * su) * (1 - sv) + (c + (d - c) * su) * sv;
}
function concreteDecal(tg, x, y, w, h, seed, type) {
  const snow = snowy(), M = CON_M, X0 = x - M, Y0 = y - M, W = w + 2 * M, H = h + 2 * M;
  const slab = !!CON_SLABBED[type];
  const c = mkCanvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  for (let py = Y0; py < Y0 + H; py++) for (let px = X0; px < X0 + W; px++) {
    const q = ((py - Y0) * W + px - X0) * 4;
    const inside = px >= x && px < x + w && py >= y && py < y + h;
    if (slab && inside) {   // the slab: pale slabs with joints, grit, a stain or two, a neat edge
      const i = Math.floor(px / CON_SLAB), j = Math.floor(py / CON_SLAB), lx = px - i * CON_SLAB, ly = py - j * CON_SLAB;
      let v = (snow ? 158 : 146) + (hash3(i, j, 33) - 0.5) * 12 + (hash3(px, py, 35) - 0.5) * 8;
      if (lx === 0 || ly === 0) v -= 22; else if (lx === 1 || ly === 1) v += 5;
      const st = conNoise(px, py, 7, 37);
      if (st > 0.72) v -= (st - 0.72) * 90;
      const e = Math.min(px - x, py - y, x + w - 1 - px, y + h - 1 - py);
      if (e === 0) v -= 38; else if (e === 1) v += 10;   // the edge: a dark line, a lit lip
      d[q] = v; d[q + 1] = v; d[q + 2] = v + (snow ? 6 : 3); d[q + 3] = 255;
      continue;
    }
    // Worn ground: out from the footprint as far as the noise lets it.
    const dx = Math.max(x - px, 0, px - (x + w - 1)), dy = Math.max(y - py, 0, py - (y + h - 1)), dist = Math.hypot(dx, dy);
    const n = conNoise(px, py, 22, 61) * 0.65 + conNoise(px, py, 8, 63) * 0.35;
    const reach = M * (0.2 + 0.85 * n);
    if (dist > reach) continue;
    const edge = Math.min(1, (reach - dist) / 6), f = conNoise(px, py, 3, 65), grain = hash3(px, py, 67);
    if (edge < 1 && grain > edge + 0.15) continue;   // a ragged edge
    let r, gg, b;
    if (snow) { const t = 62 + f * 22 + grain * 8; r = t; gg = t - 1; b = t + 2; if (grain > 0.93) { r += 60; gg += 62; b += 66; } }   // dark wet earth, flecks of snow
    else { const t = 58 + f * 22 + grain * 8; r = t; gg = t * 0.86; b = t * 0.66; if (grain > 0.95) { r = gg = b = 96; } }          // trodden earth, pebbles
    d[q] = r; d[q + 1] = gg; d[q + 2] = b; d[q + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  tg.drawImage(c, X0, Y0);
}

// ---- Lamps on structures ---------------------------------------------------------------------------------------
// Worked out once per structure type from its own voxel model (models.js, as damageSpots): red beacons on its one or
// two highest points (chimneys, masts, domes), and the glass of windows the camera can see (faces to the east or south,
// the camera's side), a light for every 4 x 4 x 4 block of glass. Model coordinates are world pixels from the footprint's
// corner, heights x VK on the screen (world.js structureDamageFx).
const lampCache = new Map(), AA_LOOK = 320;   // (world px: how far the AA Gun's searchlight looks for aircraft)
function structLamps(type, faction) {
  const key = type + faction;
  if (lampCache.has(key)) return lampCache.get(key);
  const pal = palFor(faction), m = model('S' + type + pal.key, () => STRUCTURES[type](pal, faction)), top = topOf(m);
  let maxZ = 0;
  for (let i = 0; i < top.length; i++) maxZ = Math.max(maxZ, top[i]);
  const peaks = [];
  const cols = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (top[y * m.w + x] >= Math.max(8, maxZ * 0.6)) cols.push([x, y, top[y * m.w + x]]);
  cols.sort((a, b) => b[2] - a[2]);
  for (const [x, y, z] of cols) { if (peaks.length >= 2) break; if (peaks.every((p) => Math.hypot(p.x - x - m.x0, p.y - y - m.y0) > 10)) peaks.push({ x: x + m.x0, y: y + m.y0, z: z + 1.5 }); }
  const at = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < m.w && y < m.h && z < m.d ? m.col[(z * m.h + y) * m.w + x] : -1;
  const blocks = new Map();
  for (let z = 0; z < m.d; z++) for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const i = (z * m.h + y) * m.w + x;
    if (m.col[i] < 0 || m.mat[i] !== M_GLASS || (at(x + 1, y, z) >= 0 && at(x, y + 1, z) >= 0)) continue;
    const b = ((z >> 2) * 64 + (y >> 2)) * 64 + (x >> 2);
    if (!blocks.has(b)) blocks.set(b, { x: x + m.x0 + 0.5, y: y + m.y0 + 0.5, z: z + 0.5 });
  }
  const wins = [...blocks.values()].slice(0, 10);
  const r = { peaks, wins, maxZ };
  lampCache.set(key, r);
  return r;
}
let lampPics = null;
function drawLamps(g, vx, vy, k, t, near) {
  if (!lampPics) drawLamps.init();
  drawLampsOn(g, vx, vy, k, t, near);
}
// On the day/night maps (Village, Frost) drawLook is not used (art.js drawNight lights them instead), so the lamps are
// drawn on their own, after drawNight (ui.js). They were missing there (owner, 2026-11-19: "my buildings as allies had no lights").
function drawLampsAlone(g, vx, vy, vw, vh, k, t) {
  if (!LOOK.lamps || !G) return;
  if (!lampPics) drawLamps.init();
  const near = (x, y, m) => x > vx - m && y > vy - m && x < vx + vw + m && y < vy + vh + m;
  drawLampsOn(g, vx, vy, k, t, near);
}
drawLamps.init = () => {
  lampPics = { red: lookGlowPic('rgba(255,90,70,1)', 'rgba(255,30,20,0.45)', 'rgba(255,0,0,0)'),
    win: lookGlowPic('rgba(255,226,160,1)', 'rgba(255,180,90,0.4)', 'rgba(255,140,40,0)'), beam: lookGlowPic('rgba(255,250,225,0.9)', 'rgba(255,245,210,0.35)', 'rgba(255,240,200,0)') };
};
function drawLampsOn(g, vx, vy, k, t, near) {
  const P = lampPics, scr = (x, y, h) => { const [X, Y] = toView(...liftPt(x, y, h + gLift(x, y))); return [(X - vx) * k, (Y - vy) * k, X, Y]; };
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const e of G.entities) {
    if (!e.alive || e.kind !== 'bld' || e.buildT < 1 || e.def.defense || !G.seen[idx(e.cx, e.cy)]) continue;   // defences: no lamps at all (owner: it did not look right on them)
    const ox = e.cx * CELL, oy = e.cy * CELL, [, , cX, cY] = scr(ox + e.w * CELL / 2, oy + e.h * CELL / 2, 0);
    if (!near(cX, cY, 160)) continue;
    const Ls = structLamps(e.type, e.faction), ph = (e.id * 0.37) % 1, dark = e.hp < e.maxHp * 0.3;
    // Red beacons: a short bright blink every 1.6 s, a faint glow between.
    const on = ((t / 1.6 + ph) % 1) < 0.14;
    for (const p of Ls.peaks) {
      const [x, y] = scr(ox + p.x, oy + p.y, p.z * VK), R = (on ? 9 : 5) * k;
      g.globalAlpha = on ? 0.95 : 0.3; g.drawImage(P.red, x - R, y - R, R * 2, R * 2);
      if (on) { g.globalAlpha = 1; g.fillStyle = '#ffd0c0'; g.fillRect(x - k * 0.75, y - k * 0.75, k * 1.5, k * 1.5); }
    }
    // Lit windows (out in a badly damaged structure), a slow flicker of their own.
    if (!dark) for (let i = 0; i < Ls.wins.length; i++) {
      const w = Ls.wins[i], [x, y] = scr(ox + w.x, oy + w.y, w.z * VK), R = 4 * k;
      g.globalAlpha = 0.55 + 0.1 * Math.sin(t * 2.3 + i * 1.7 + e.id); g.drawImage(P.win, x - R, y - R, R * 2, R * 2);
    }
  }
  g.restore();
}

// ---- Richer ground ---------------------------------------------------------------------------------------------
// Drawn on the ground under everything that stands on it (from ui.js through cliffItems, the world transform set):
// large soft patches (a fixed noise, 1.5k px across, soft-light: drier and yellower, lusher, darker) so open grass is
// not one even carpet, and tank tracks: a ground vehicle leaves a pair of tread marks every 5 px it moves, fading over
// TRACK_LIFE seconds (kept here, not in G: looks only, not saved).
const TRACK_LIFE = 25, TRACK_MAX = 6000;
let lookTracks = null, patchPic = null;
function patchPicMake() {
  if (patchPic) return patchPic;
    const N = 128, c = mkCanvas(N, N), x = c.getContext('2d'), img = x.createImageData(N, N);
    const hash = (i, j, p, s) => { let h = (((i % p) + p) % p) * 374761393 + (((j % p) + p) % p) * 668265263 + p * 97 + s * 1013; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const sm = (a) => a * a * (3 - 2 * a);
    const vn = (u, v, p, s) => { const i = Math.floor(u), j = Math.floor(v), fu = sm(u - i), fv = sm(v - j);
      const a = hash(i, j, p, s), b = hash(i + 1, j, p, s), cc = hash(i, j + 1, p, s), d = hash(i + 1, j + 1, p, s);
      return a + (b - a) * fu + (cc - a) * fv + (a - b - cc + d) * fu * fv; };
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const l = vn(px / N * 4, py / N * 4, 4, 1) * 0.65 + vn(px / N * 8, py / N * 8, 8, 2) * 0.35;   // light or dark
      const dry = sm(Math.max(0, Math.min(1, (vn(px / N * 3, py / N * 3, 3, 3) - 0.55) / 0.2)));      // dry patches
      const v = 128 + (l - 0.5) * 95, i = (py * N + px) * 4;
      img.data[i] = v + dry * 30; img.data[i + 1] = v + dry * 18; img.data[i + 2] = v - dry * 22; img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    patchPic = c;
  return patchPic;
}
// The patches painted into a ground tile once, when it is finished (art.js makeGround finishSome; they used to be laid over
// the whole view every frame, which on a phone cost a soft-light pass per chunk of the raised ground).
function lookPatchTile(g, x0, y0) {
  if (!LOOK.ground || !G || (typeof HEADLESS !== 'undefined' && HEADLESS)) return;
  const pat = g.createPattern(patchPicMake(), 'repeat');
  pat.setTransform(new DOMMatrix([12, 0, 0, 12, -x0, -y0]));
  g.save(); g.globalCompositeOperation = 'soft-light'; g.imageSmoothingEnabled = true; g.fillStyle = pat;
  g.fillRect(0, 0, GROUND_TILE, GROUND_TILE); g.restore();
}
function lookGround(g, x0, y0, x1, y1, shows) {
  if (!g) return;
  if (!LOOK.ground) { drawWater(g, x0, y0, x1, y1, shows); return; }
  drawWater(g, x0, y0, x1, y1, shows);
  // Tracks.
  if (!lookTracks || lookTracks.g !== G) lookTracks = { g: G, list: [], last: new Map() };
  const T = lookTracks;
  for (const e of G.entities) {
    if (!e.alive || e.kind !== 'unit' || e.cls !== 'veh') continue;
    const l = T.last.get(e.id);
    if (!l) { T.last.set(e.id, [e.x, e.y]); continue; }
    const dx = e.x - l[0], dy = e.y - l[1], d = Math.hypot(dx, dy);
    if (d < 5) continue;
    const tc = cellOfPos(e.x, e.y);
    if (d < 30 && tc !== false && G.terr[tc] < 4) T.list.push([e.x, e.y, Math.atan2(dy, dx), (e.def.r || 8) * 0.5, G.t]);   // (none on bridges, fords or water)
    l[0] = e.x; l[1] = e.y;
  }
  if (T.list.length > TRACK_MAX || (T.list.length && G.t - T.list[0][4] > TRACK_LIFE)) T.list = T.list.filter((s) => G.t - s[4] < TRACK_LIFE).slice(-TRACK_MAX);
  // Each fade band as one path built on g itself (moveTo, lineTo): the WebGL recording (gl.js) turns that into lines. A
  // Path2D handed to stroke() was invisible to it: only the part inside the last path's box showed, so tracks were missing
  // or flashed up and went (owner, 2026-11-22).
  const snow = snowy(), B = 5, bands = Array.from({ length: B }, () => []);
  for (const tr of T.list) {
    const x = tr[0], y = tr[1];
    if (x < x0 - 10 || x > x1 + 10 || y < y0 - 10 || y > y1 + 10) continue;
    bands[Math.min(B - 1, Math.max(0, Math.floor((1 - (G.t - tr[4]) / TRACK_LIFE) * B)))].push(tr);
  }
  g.save(); g.lineWidth = 2.2; g.lineCap = 'butt';
  for (let b = 0; b < B; b++) {
    if (!bands[b].length) continue;
    g.strokeStyle = snow ? `rgba(60,70,92,${(0.18 + b * 0.12).toFixed(2)})` : `rgba(22,17,10,${(0.2 + b * 0.13).toFixed(2)})`;
    const L = bands[b];
    for (let i = 0; i < L.length; i += 1500) {   // (stroked 1,500 at a time: gl.js makes lines of up to 4,000 segments a stroke)
    g.beginPath();
    for (const [x, y, a, w] of L.slice(i, i + 1500)) {
      const c = Math.cos(a), s = Math.sin(a), [hx, hy] = hillPt(x, y), lx = hx - x, ly = hy - y;   // (on the raised ground)
      for (const o of [-w, w]) { const px = x - s * o + lx, py = y + c * o + ly; g.moveTo(px - c * 3, py - s * 3); g.lineTo(px + c * 3, py + s * 3); }
    }
    g.stroke();
    }
  }
  // Rain: the ruts hold water (look.js flowing water), a thin pale line of it in each, the newer the brighter.
  const wet = typeof RAIN_FX !== 'undefined' && RAIN_FX && !snow && rainS && rainS.g === G ? rainS.wet : 0;
  if (wet > 0.35) {
    g.lineWidth = 0.9;
    for (let b = 1; b < B; b++) {
      if (!bands[b].length) continue;
      g.strokeStyle = `rgba(150,172,192,${((wet - 0.35) * (0.12 + b * 0.09)).toFixed(2)})`;
      const L = bands[b];
      for (let i = 0; i < L.length; i += 1500) {
        g.beginPath();
        for (const [x, y, a, w] of L.slice(i, i + 1500)) {
          const c = Math.cos(a), s = Math.sin(a), [hx, hy] = hillPt(x, y), lx = hx - x, ly = hy - y;
          for (const o of [-w, w]) { const px = x - s * o + lx, py = y + c * o + ly - 0.4; g.moveTo(px - c * 2.5, py - s * 2.5); g.lineTo(px + c * 2.5, py + s * 2.5); }
        }
        g.stroke();
      }
    }
  }
  g.restore();
}

// The Allied AA Gun's searchlight, the one light a defence has (owner), and only at night (ui.js, after drawNight on day/night
// maps; night 0..1 from dayNight): a beam up into the sky, sweeping slowly overhead, locked on the nearest enemy aircraft it can
// see within AA_LOOK (owner: "pointing up in the air looking for planes").
// The searchlight's beam at full night: a wedge from 1.5 to 14 wide (W0, W1 in drawSkyBeams; the picture's width is 2 x W1),
// pale blue-white fading from 0.36 at the lamp to nothing at its end, with soft sides.
let skyBeamC = null;
function skyBeamPic() {
  if (skyBeamC) return skyBeamC;
  const w = 56, h = 192, c = mkCanvas(w, h), x = c.getContext('2d'), img = x.createImageData(w, h), d = img.data;
  for (let j = 0; j < h; j++) {
    const u = (j + 0.5) / h, half = (1.5 + (14 - 1.5) * u) / 14 * (w / 2), a = 0.36 * (1 - u);
    for (let i = 0; i < w; i++) {
      const o = Math.abs(i + 0.5 - w / 2), cover = Math.max(0, Math.min(1, half - o + 0.5)), p = (j * w + i) * 4;
      d[p] = 235; d[p + 1] = 245; d[p + 2] = 255; d[p + 3] = Math.round(255 * a * cover);
    }
  }
  x.putImageData(img, 0, 0);
  return (skyBeamC = c);
}
function drawSkyBeams(g, vx, vy, k, t, night) {
  if (!LOOK.lamps || night < 0.05) return;
  if (!lampPics) drawLamps.init();
  const P = lampPics, scr = (x, y, h) => { const [X, Y] = toView(...liftPt(x, y, h + gLift(x, y))); return [(X - vx) * k, (Y - vy) * k]; };
  // The beam is one picture (skyBeamPic) laid along it by a transform: drawn as a gradient-filled shape it was cut out
  // of WebGL's 2D layer and uploaded every frame (~30,000 px a beam at a PC's size). Aircraft are gathered once.
  const B = skyBeamPic(), planes = [];
  for (const u of G.entities) if (u.alive && u.cls === 'air' && u.alt > 4 && G.seen[cellOfPos(u.x, u.y)]) planes.push(u);
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const e of G.entities) {
    if (!e.alive || e.type !== 'aagun' || e.buildT < 1 || !G.seen[idx(e.cx, e.cy)]) continue;
    const mx = (e.cx + e.w / 2) * CELL, my = (e.cy + e.h / 2) * CELL, [sx, sy] = scr(mx, my, Math.max(8, structLamps(e.type, e.faction).maxZ) * VK);
    if (sx < -400 || sy < -400 || sx > g.canvas.width + 400 || sy > g.canvas.height + 600) continue;
    let tx, ty, best = AA_LOOK;
    for (const u of planes) {
      if (alliedSides(u.team, e.team)) continue;
      const d = Math.hypot(u.x - mx, u.y - my);
      if (d < best) { best = d; [tx, ty] = scr(u.x, u.y, u.alt); }
    }
    if (tx === undefined) { const a = -Math.PI / 2 + Math.sin(t * 0.5 + e.id * 1.3) * 0.55 + Math.sin(t * 0.23 + e.id) * 0.2; tx = sx + Math.cos(a) * 190 * k; ty = sy + Math.sin(a) * 190 * k; }
    else { tx += (tx - sx) * 0.25; ty += (ty - sy) * 0.25; }   // on past the plane
    const dx = tx - sx, dy = ty - sy, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, W1 = 14 * k;
    // (the picture's x across the beam, -W1..W1 over its width; its y along it, lamp at 0, end at its height)
    g.save(); g.globalAlpha = night; g.transform(nx * W1 * 2 / B.width, ny * W1 * 2 / B.width, dx / B.height, dy / B.height, sx - nx * W1, sy - ny * W1);
    g.drawImage(B, 0, 0); g.restore();
    g.globalAlpha = 0.8 * night; g.drawImage(P.beam, sx - 4 * k, sy - 4 * k, 8 * k, 8 * k);   // the lamp itself
  }
  g.restore();
}

var LOOK_SOFT = LOOK.ground;
// The hill shading's strength in the ground (art.js groundPixels, copied into its workers; part of groundKey, so the baked
// grounds are used only when baked with the same). ?hillshade=1 shows the first, fainter version.
var HILL_SHADE = (() => { const m = typeof location !== 'undefined' && location.search.match(/[?&]hillshade=([0-9.]+)/); return m ? +m[1] : 2.2; })();   // (owner picked A, 2026-11-19; 1 was the first, fainter version)

// ---- Debris round wrecks ----------------------------------------------------------------------------------------
// Drawn into the ground under each wreck (art.js bakeWreck, a mark: once, kept on the tiles): a scatter of torn metal, rust,
// grey plates, a few bright scraps and broken track links, thicker near the hull, all from the wreck's own seed so every tile
// paints it the same. Within 34 px, inside the mark's box (96).
if (typeof MARK_DRAW !== 'undefined' && MARK_DRAW.bakeWreck) {
  const f = MARK_DRAW.bakeWreck;
  MARK_DRAW.bakeWreck = function (tg, x, y, def, face, tface, noTurret, seed) {
    if (LOOK.ground && tg && tg.fillRect) wreckDebris(tg, x, y, seed | 0, def);
    return f.apply(this, arguments);
  };
}
function wreckDebris(tg, x, y, seed, def) {
  const r = rng(seed * 7 + 11), big = def && def.r ? def.r / 9 : 1, snow = snowy();
  const COL = ['#25231f', '#33302a', '#4a3524', '#5e4129', '#6f6c64', '#8a877d', '#1b1a18'];
  const n = Math.round(55 * big);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = (5 + Math.pow(r(), 1.4) * 30) * big, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.9;
    const k = r();
    if (k < 0.12) {   // a broken run of track links
      tg.fillStyle = '#211f1b'; const ang = r() * Math.PI, c = Math.cos(ang), s = Math.sin(ang);
      for (let j = 0; j < 4; j++) tg.fillRect(Math.round(px + c * j * 1.6), Math.round(py + s * j * 1.6), 2, 1);
      continue;
    }
    tg.fillStyle = k > 0.94 ? '#b8b2a2' : COL[Math.floor(r() * COL.length)];
    const w = 1 + Math.floor(r() * 4), h = 1 + Math.floor(r() * 2);
    tg.fillRect(Math.round(px), Math.round(py), w, h);
    if (w > 1 && r() < 0.5) { tg.fillStyle = 'rgba(0,0,0,0.35)'; tg.fillRect(Math.round(px) + 1, Math.round(py) + h, w, 1); }   // its shadow
  }
  // Ash and soot darkening the ground round it.
  for (let i = 0; i < 26 * big; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 30 * big;
    tg.fillStyle = snow ? 'rgba(40,40,46,0.18)' : 'rgba(20,16,12,0.18)';
    tg.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d * 0.9), 3, 2);
  }
}

// ---- Water: ripples and shore foam --------------------------------------------------------------------------------
// Open water (terr 4) as a mask a quarter of the world's size, from the cells' water field sampled bilinearly (the ground's
// own shoreline, roughly: it adds a little noise); a band just off the shore for the foam. Each frame, over the water on
// screen: two layers of thin bright wave crests drifting different ways (added), then foam that swells and ebbs along the
// shore. Not on winter maps (icy, frozen water). Drawn from lookGround, under everything that stands on the ground.
const WATER_Q = 4;
let waterLook = null;
function waterMasks() {
  if (waterLook && waterLook.g === G) return waterLook;
  const Wm = Math.ceil(WORLD / WATER_Q), wet = new Float32Array(NCELLS);
  for (let i = 0; i < NCELLS; i++) wet[i] = G.terr[i] === 4 ? 1 : 0;
  const bil = (fx, fy) => {
    const x0 = Math.max(0, Math.min(MAP - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(MAP - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
    const a = wet[y0 * MAP + x0], b = wet[y0 * MAP + x0 + 1], c = wet[(y0 + 1) * MAP + x0], d = wet[(y0 + 1) * MAP + x0 + 1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
  const wm = mkCanvas(Wm, Wm), sm = mkCanvas(Wm, Wm), wi = wm.getContext('2d').createImageData(Wm, Wm), si = sm.getContext('2d').createImageData(Wm, Wm);
  const ss = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  let any = false;
  for (let j = 0; j < Wm; j++) for (let i = 0; i < Wm; i++) {
    const v = bil((i + 0.5) * WATER_Q / CELL - 0.5, (j + 0.5) * WATER_Q / CELL - 0.5), w = ss(0.52, 0.6, v);
    if (w <= 0) continue;
    any = true;
    const q = (j * Wm + i) * 4;
    wi.data[q] = wi.data[q + 1] = wi.data[q + 2] = 255; wi.data[q + 3] = Math.round(w * 255);
    const band = w * (1 - ss(0.6, 0.78, v));
    si.data[q] = si.data[q + 1] = si.data[q + 2] = 255; si.data[q + 3] = Math.round(band * 255);
  }
  wm.getContext('2d').putImageData(wi, 0, 0); sm.getContext('2d').putImageData(si, 0, 0);
  // The patterns: crests (thin bright arcs from noise bands) and foam (blotchy noise).
  const N = 128, hash = (i, j, p, s) => { let h = (((i % p) + p) % p) * 374761393 + (((j % p) + p) % p) * 668265263 + p * 97 + s * 1013; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const S = (a) => a * a * (3 - 2 * a);
  const vn = (u, v, p, s) => { const i = Math.floor(u), j = Math.floor(v), fu = S(u - i), fv = S(v - j);
    const a = hash(i, j, p, s), b = hash(i + 1, j, p, s), c = hash(i, j + 1, p, s), d = hash(i + 1, j + 1, p, s);
    return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv; };
  const mkPat = (fn) => { const c = mkCanvas(N, N), x = c.getContext('2d'), im = x.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = fn(i, j), q = (j * N + i) * 4; im.data[q] = 225; im.data[q + 1] = 238; im.data[q + 2] = 248; im.data[q + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255); }
    x.putImageData(im, 0, 0); return c; };
  const crest = mkPat((i, j) => { const v = vn(i / N * 4, j / N * 8, 4, 5) * 0.7 + vn(i / N * 8, j / N * 16, 8, 6) * 0.3, f = (v * 9) % 1; return f < 0.07 ? (0.07 - f) / 0.07 * (0.4 + vn(i / N * 6, j / N * 6, 6, 7)) : 0; });
  const foam = mkPat((i, j) => { const v = vn(i / N * 8, j / N * 8, 8, 8) * 0.6 + vn(i / N * 16, j / N * 16, 16, 9) * 0.4; return S(Math.max(0, Math.min(1, (v - 0.35) / 0.3))); });
  // (two scratch canvases, crests and foam: WebGL uploads a picture at the end of the frame, so one canvas drawn twice
  // would show its last content twice; _own and _ver, bumped each frame, make gl.js upload them again)
  const tmp = () => { const c = mkCanvas(1, 1); c._own = true; c._ver = 0; return c; };
  waterLook = { g: G, wm, sm, any, crest, foam, tmp: [tmp(), tmp()] };
  return waterLook;
}
const WATER_PX = 4.5;
function drawWater(g, x0, y0, x1, y1, shows) {
  if (!LOOK.water || snowy() || mapTheme(G.mapId) === 'marsh') return;   // (no waves or surf on a fen's still water)
  const W = waterMasks();
  if (!W.any) return;
  if (shows) {   // only round the water that shows (the box round a turned screen is about three times the screen; this was a
    // third of a phone's frame on River Crossing): the cells of open water on screen, and two cells round them for the foam
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    const c0 = Math.max(0, Math.floor(x0 / CELL)), c1 = Math.min(MAP - 1, Math.floor(x1 / CELL)), r0 = Math.max(0, Math.floor(y0 / CELL)), r1 = Math.min(MAP - 1, Math.floor(y1 / CELL));
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      if (G.terr[cy * MAP + cx] < 4 || !shows((cx + 0.5) * CELL, (cy + 0.5) * CELL)) continue;
      if (cx < a) a = cx; if (cx > c) c = cx; if (cy < b) b = cy; if (cy > d) d = cy;
    }
    if (a === Infinity) return;
    x0 = Math.max(x0, (a - 2) * CELL); y0 = Math.max(y0, (b - 2) * CELL); x1 = Math.min(x1, (c + 3) * CELL); y1 = Math.min(y1, (d + 3) * CELL);
  }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(WORLD, Math.ceil(x1)); y1 = Math.min(WORLD, Math.ceil(y1));
  if (x1 <= x0 || y1 <= y0) return;
  // Resolution of the scratch canvases (px per world px): 0.5, but zoomed out on a computer no finer than a pixel per WATER_PX
  // screen px. They are filled and uploaded to WebGL whole every frame: at 0.5, zoomed out over Twin Lakes on a 2560 x 1370
  // screen, two of 1524 x 1296 (4 million px a frame). Phones (3x pixels) already sit above WATER_PX: unchanged.
  const zs = (typeof window !== 'undefined' && window.__ps && window.__ps.cam ? window.__ps.cam.z : 1) * ((typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
  const R = Math.max(0.2, Math.min(0.5, zs / WATER_PX)), tw = Math.ceil((x1 - x0) * R), th = Math.ceil((y1 - y0) * R);
  // (sized to what is drawn, in steps of 64 px: WebGL uploads the whole canvas, so one left at its largest after zooming
  // out stayed that size, and that costly, for the rest of the battle)
  const cw = Math.ceil(tw / 64) * 64, ch = Math.ceil(th / 64) * 64;
  const t = (G && G.t) || 0;
  // Filled again only when the battle's clock has moved on a step (1/30 s, as the battle is stepped) or the box has changed:
  // in between the canvases (and WebGL's copies of them) are drawn as they are. At 60 frames a second that halves the cost,
  // at 120 it quarters it; the ripples move a few px a second.
  const key = x0 + ',' + y0 + ',' + x1 + ',' + y1 + ',' + R, fresh = W.key !== key || !(t >= W.t && t - W.t < 1 / 30);
  if (fresh) { W.key = key; W.t = t; for (const T of W.tmp) { if (T.width !== cw || T.height !== ch) { T.width = cw; T.height = ch; } T._ver++; } }
  let T = W.tmp[0], c = T.getContext('2d');
  const layer = (pat, sc, dx, dy, alpha) => {
    const P = c.createPattern(pat, 'repeat');
    P.setTransform(new DOMMatrix([sc * R, 0, 0, sc * R, (-x0 + dx) * R, (-y0 + dy) * R]));
    c.globalAlpha = alpha; c.fillStyle = P; c.fillRect(0, 0, tw, th);
  };
  const mask = (m) => { c.globalAlpha = 1; c.globalCompositeOperation = 'destination-in'; c.imageSmoothingEnabled = true;
    c.drawImage(m, x0 / WATER_Q, y0 / WATER_Q, (x1 - x0) / WATER_Q, (y1 - y0) / WATER_Q, 0, 0, (x1 - x0) * R, (y1 - y0) * R); c.globalCompositeOperation = 'source-over'; };
  g.save(); g.imageSmoothingEnabled = true;
  // Ripples.
  if (fresh) { c.clearRect(0, 0, tw, th); layer(W.crest, 3, t * 7, t * 2.5, 0.8); layer(W.crest, 2.2, -t * 5, t * 4, 0.55); mask(W.wm); }
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.3; g.drawImage(T, 0, 0, tw, th, x0, y0, x1 - x0, y1 - y0);
  // Foam, swelling and ebbing.
  T = W.tmp[1]; c = T.getContext('2d');
  if (fresh) { c.clearRect(0, 0, tw, th); layer(W.foam, 1.5, Math.sin(t * 0.7) * 6, t * 3, 1); mask(W.sm); }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 0.45 + 0.25 * Math.sin(t * 1.3); g.drawImage(T, 0, 0, tw, th, x0, y0, x1 - x0, y1 - y0);
  g.restore();
}

// ---- Bigger smoke and fires ---------------------------------------------------------------------------------------
// A particle layer of the look's own (not in G: not saved, not sent online), fed each frame from what burns in the game:
//  - structures below 60% health: dark smoke from their damage spots (models.js damageSpots, as world.js structureDamageFx),
//    thicker below 30%, where the spots also burn with big flames;
//  - fires ('fire' effects: wrecks, flame towers, burning ground): a puff of smoke now and then, and a larger flame;
//  - smouldering craters: a thin grey trail.
// Puffs rise and swell, are carried more by the wind (world.js windNow) the older they are, and fade; drawn over the units
// (ui.js, after the sorted list) as soft blobs standing at their height. Flames flicker from a few drawn frames, added.
const SMOKE_MAX = 1400;
let lookSmokeS = null;
function smokePics() {
  const blob = (r, g, b) => { const c = mkCanvas(48, 48), x = c.getContext('2d'), gr = x.createRadialGradient(24, 24, 0, 24, 24, 24);
    gr.addColorStop(0, `rgba(${r},${g},${b},1)`); gr.addColorStop(0.55, `rgba(${r},${g},${b},0.55)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`); x.fillStyle = gr; x.fillRect(0, 0, 48, 48);
    // a little lumpiness
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) { const a = i * 0.7, d = 14 + (i % 3) * 3; x.fillStyle = 'rgba(0,0,0,0.25)'; x.beginPath(); x.arc(24 + Math.cos(a) * d, 24 + Math.sin(a) * d, 6, 0, 7); x.fill(); }
    return c; };
  const flames = [];
  for (let f = 0; f < 6; f++) {   // flame frames: a tongue of fire, its tip swaying
    const c = mkCanvas(20, 40), x = c.getContext('2d');
    for (const [col, w, h, o] of [['rgba(255,90,20,0.85)', 9, 36, 0], ['rgba(255,170,40,0.9)', 6, 26, 1], ['rgba(255,240,170,0.95)', 3, 14, 2]]) {
      const sway = Math.sin(f / 6 * Math.PI * 2 + o) * 2.5;
      x.fillStyle = col; x.beginPath(); x.moveTo(10 - w, 39); x.quadraticCurveTo(10 - w, 39 - h * 0.45, 10 + sway, 39 - h); x.quadraticCurveTo(10 + w, 39 - h * 0.45, 10 + w, 39); x.closePath(); x.fill();
    }
    flames.push(c);
  }
  return { dark: blob(34, 32, 30), grey: blob(92, 90, 86), flames };
}
function lookSmoke(g) {
  lookRunoff(g);   // rain running off the roofs
  lookFalls(g);    // and off the plateaus' edges
  lookFogOver(g);   // (the fog over the units, lighter: under the smoke)
  if (!LOOK.smoke || !G) return;
  if (!lookSmokeS || lookSmokeS.g !== G) lookSmokeS = { g: G, puffs: [], embers: [], t: G.t, pics: (lookSmokeS && lookSmokeS.pics) || smokePics(), acc: new Map() };
  const S = lookSmokeS, dt = Math.max(0, Math.min(0.1, G.t - S.t)), P = S.puffs;
  S.t = G.t;
  const wind = typeof windNow === 'function' ? windNow() : { x: 10, y: 0 };
  const emit = (key, rate, mk) => { let a = (S.acc.get(key) || 0) + rate * dt; while (a >= 1) { a -= 1; if (P.length < SMOKE_MAX) mk(); } S.acc.set(key, a); };
  const r = Math.random, fires = [], seenFire = new Set();
  // Structures.
  for (const e of G.entities) {
    if (!e.alive || e.kind !== 'bld' || e.buildT < 1 || e.def.camo || !G.seen[idx(e.cx, e.cy)]) continue;
    const f = e.hp / e.maxHp;
    if (f >= 0.6) continue;
    const spots = damageSpots(e.type, e.faction), stage = f < 0.3 ? 2 : 1, ox = e.cx * CELL, oy = e.cy * CELL;
    spots.forEach((sp, i) => {
      if (sp.s > stage) return;
      const x = ox + sp.x, y = oy + sp.y, h = sp.z * VK + gLift(ox + e.w * CELL / 2, oy + e.h * CELL / 2);
      emit('b' + e.id + '.' + i, stage === 2 ? 5 : 2.5, () => P.push({ x: x + (r() - 0.5) * 4, y, h, r0: 3 + r() * 2, r1: (stage === 2 ? 34 : 24) + r() * 8, rise: 18 + r() * 8, t: 0, life: 5 + r() * 3, a: stage === 2 ? 0.38 : 0.28, dark: true }));
      if (stage === 2) fires.push([x, y, h, 0.75, e.id * 13 + i]);
    });
  }
  // Fires and smouldering ground.
  for (const fx of G.effects) {
    if (fx.t < 0) continue;
    if (fx.type === 'fire' && fx.t < fx.life) {
      const k = 1 - fx.t / fx.life;
      const key = ((fx.x / 14) | 0) * 100003 + ((fx.y / 14) | 0);   // nearby flames of one fire: one bigger flame
      if (fx.flare) continue;   // (the Soviet refinery's flare: its own small flame only; owner 2026-11-22)
      const gl = gLift(fx.x, fx.y);
      if (!seenFire.has(key)) { seenFire.add(key); fires.push([fx.x, fx.y + 6, gl, 0.4 + 0.25 * k, key]); }
      if (r() < dt * 2.2) P.length < SMOKE_MAX && P.push({ x: fx.x, y: fx.y + 6, h: 8 + gl, r0: 3, r1: 18 + r() * 6, rise: 18 + r() * 6, t: 0, life: 2.6 + r() * 1.5, a: 0.3, dark: true });
    } else if (fx.type === 'smoulder') {
      if (r() < dt * 1.5) P.length < SMOKE_MAX && P.push({ x: fx.x + (r() - 0.5) * 6, y: fx.y, h: 2 + gLift(fx.x, fx.y), r0: 2, r1: 12 + r() * 4, rise: 10 + r() * 4, t: 0, life: 2.5 + r(), a: 0.22, dark: false });
    }
  }
  // Move the smoke on.
  for (const p of P) {
    p.t += dt;
    const age = p.t / p.life;
    p.h += p.rise * dt * (1 - age * 0.6);
    p.x += wind.x * dt * (0.25 + age * 1.1); p.y += wind.y * dt * (0.25 + age * 1.1);
  }
  if (P.length && (P[0].t > P[0].life || P.length > SMOKE_MAX)) S.puffs = P.filter((p) => p.t < p.life);
  // Embers from the bigger fires.
  for (const [x, y, h, sz] of fires) if (r() < dt * 3 * sz && S.embers.length < 300) S.embers.push({ x: x + (r() - 0.5) * 8, y, h: h + 6, vh: 20 + r() * 25, t: 0, life: 0.8 + r() * 0.8 });
  for (const m of S.embers) { m.t += dt; m.h += m.vh * dt; m.x += wind.x * dt * 0.6 + (r() - 0.5) * 0.6; m.y += wind.y * dt * 0.6; }
  if (S.embers.length && S.embers[0].t > S.embers[0].life) S.embers = S.embers.filter((m) => m.t < m.life);
  // Draw: smoke (oldest, highest first), then flames and embers added on top.
  const up = g.upright; g.upright = true; g.imageSmoothingEnabled = true;
  for (const p of S.puffs) {
    const age = p.t / p.life, R = p.r0 + (p.r1 - p.r0) * Math.sqrt(age), a = p.a * Math.min(1, p.t / 0.25) * (1 - age) * (1 - age * 0.3);
    if (a < 0.01) continue;
    const [wx, wy] = liftPt(p.x, p.y, p.h);
    g.globalAlpha = a; g.drawImage(p.dark ? S.pics.dark : S.pics.grey, wx - R, wy - R, R * 2, R * 2);
  }
  g.globalCompositeOperation = 'lighter';
  const ft = performance.now() / 70;
  for (const [x, y, h, sz, seed] of fires) {
    for (let j = 0; j < 2; j++) {
      const fr = S.pics.flames[((ft + seed + j * 3) | 0) % 6], w = 10 * sz * (1 - j * 0.25), hh = 20 * sz * (1 - j * 0.3), dx = (j - 0.5) * 4 * sz;
      const [wx, wy] = liftPt(x + dx, y + j, h + hh / 2);
      g.globalAlpha = 0.6; g.drawImage(fr, wx - w / 2, wy - hh / 2, w, hh);
    }
  }
  for (const m of S.embers) {
    const [wx, wy] = liftPt(m.x, m.y, m.h);
    g.globalAlpha = 1 - m.t / m.life; g.fillStyle = m.t < m.life * 0.4 ? '#ffe2a0' : '#ff8a30'; g.fillRect(wx - 0.5, wy - 0.5, 1, 1);
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.imageSmoothingEnabled = false; g.upright = up;
}

// ---- Light pools (LOOK.pools) ---------------------------------------------------------------------------------------
// Lamp posts of our own design (a slim post on a plinth, a bent arm, a hooded head lit from below) along the roads (not
// round the bases any more), placed once a battle from the map's ground seed (kept here, not in G: not saved).
// Each casts a soft coloured pool on the ground (mostly warm yellow, some cool blue, a few red), drawn into drawLook's
// shade and glow, so units passing through are lit too. Structures' windows spill light onto the ground in front of
// them, and ore and gems glow faintly. Defences give off no light (owner). On the day/night maps the pools come from
// lookNightLights (art.js drawNight's lights) and lookNightPools (their colour), stronger as night falls.
const POOL_R = 46, POOL_GAP = 150, POOL_DAY = 0.55;   // POOL_DAY: the pools' colour screened on by day (x their strength)   // pool radius (view px), road lamps every POOL_GAP world px
const POOL_COL = { warm: [255, 214, 130], cool: [140, 190, 255], red: [255, 90, 70] };
let poolLook = null;
function poolLampsFor() {
  if (poolLook && poolLook.g === G) return poolLook;
  const r = rng(groundSeed(G) ^ 0x51a7e), lamps = [], T = G.terr;
  const villageLamps = (G.props || []).filter((p) => p.k === 'lamp');
  const ok = (x, y) => {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    if (cx < 2 || cy < 2 || cx > MAP - 3 || cy > MAP - 3) return false;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const t = T[idx(cx + i, cy + j)]; if (t >= 4) return false; }
    const c = idx(cx, cy);
    if (T[c] > 1 || G.ore[c] || (G.cliff && G.cliff[c]) || (G.block && G.block[c])) return false;
    if (lamps.some((l) => Math.hypot(l.x - x, l.y - y) < CELL * 3)) return false;
    return !villageLamps.some((p) => Math.hypot(p.x - x, p.y - y) < CELL * 3);
  };
  const colour = () => { const v = r(); return v < 0.7 ? 'warm' : v < 0.88 ? 'cool' : 'red'; };
  for (const line of G.road || []) {
    let run = r() * POOL_GAP, side = r() < 0.5 ? 1 : -1;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i], d = Math.hypot(b.x - a.x, b.y - a.y);
      run += d;
      if (run < POOL_GAP || !d) continue;
      run = 0; side = -side;
      const nx = -(b.y - a.y) / d, ny = (b.x - a.x) / d, x = b.x + nx * side * CELL * 1.7, y = b.y + ny * side * CELL * 1.7;
      if (ok(x, y)) lamps.push({ x, y, col: colour(), c: idx(Math.floor(x / CELL), Math.floor(y / CELL)) });
    }
  }
  // (No ring of lamps round each start position any more: owner, 2026-11-21, "Street lights should only be on roads and
  // villages"; bases get light from their own structures' windows.)
  poolLook = { g: G, lamps, pics: {}, spill: new Map() };
  return poolLook;
}
// The lamp post (view px, foot at its picture's (5, 33)) and its shadow, one per colour.
const POST_H = 28, POST_ARM = 6;
function postPic(col) {
  const P = poolLampsFor();
  if (P.pics[col]) return P.pics[col];
  const c = mkCanvas(14, 36), g = c.getContext('2d'), [lr, lg, lb] = POOL_COL[col];
  g.fillStyle = '#2a2c2e'; g.fillRect(3, 31, 5, 3); g.fillStyle = '#4a4d50'; g.fillRect(3, 31, 2, 2);   // plinth
  g.fillStyle = '#2f3234'; g.fillRect(4.5, 33 - POST_H, 2, POST_H - 2);                                    // post
  g.fillStyle = '#5c6064'; g.fillRect(4.5, 33 - POST_H, 0.8, POST_H - 2);                                  // its lit edge
  g.strokeStyle = '#2f3234'; g.lineWidth = 1.4; g.beginPath();                                             // bent arm
  g.moveTo(5.5, 34 - POST_H); g.quadraticCurveTo(6, 31 - POST_H, 5.5 + POST_ARM, 32 - POST_H); g.stroke();
  g.fillStyle = '#1e2022'; g.fillRect(4 + POST_ARM, 31 - POST_H, 5, 2);                                    // hood
  g.fillStyle = `rgb(${lr},${lg},${lb})`; g.fillRect(4.5 + POST_ARM, 33 - POST_H, 4, 1);                   // lit glass
  g.fillStyle = 'rgba(255,255,240,0.9)'; g.fillRect(5.5 + POST_ARM, 33 - POST_H, 2, 1);
  const s = mkCanvas(48, 46), q = s.getContext('2d');                                                       // shadow: to the lower right (same origin)
  q.strokeStyle = 'rgba(0,0,0,0.8)'; q.lineWidth = 2; q.beginPath(); q.moveTo(6, 34); q.lineTo(36, 40); q.stroke();
  q.fillStyle = 'rgba(0,0,0,0.8)'; q.fillRect(35, 39, 7, 3);
  return (P.pics[col] = { c, X0: -5, Y0: -33, sh: s });
}
// From cliffItems: the lamp posts round the screen, sorted in with the units (drawn like a cliff picture).
function poolItems(list, x0, y0, x1, y1, shows) {
  if (!LOOK.pools || !G) return;
  for (const l of poolLampsFor().lamps) {
    if (l.x < x0 - 40 || l.x > x1 + 40 || l.y < y0 - 40 || l.y > y1 + 120 || !G.seen[l.c] || G.bld[l.c] || (G.wall && G.wall[l.c]) || !shows(l.x, l.y)) continue;
    const p = postPic(l.col);
    const e = { kind: 'cliff', post: true, x: l.x, y: l.y, p };
    list.push(e);
    onHill(lookView, e.x, e.y, () => cliffShadow(lookView, e));
  }
}
// The lights of the pools for drawLook (add: its light adder, ground spots in world px, h in view px up), or for drawNight.
function poolLights(add, strength, box) {
  if (!LOOK.pools || !G) return;
  const P = poolLampsFor(), [ax, ay] = fromView(POST_ARM + 2, 0);
  for (const l of P.lamps) {
    if (!G.seen[l.c] || G.bld[l.c]) continue;
    add(l.x + ax, l.y + ay, POOL_R, 0.85 * strength, 'p' + l.col, 0, VIEW.F);
    add(l.x + ax, l.y + ay, 9, 0.9 * strength, 'p' + l.col, POST_H - 1);   // the lamp's own glow
  }
  // Window light spilling onto the ground in front of structures (not defences: owner).
  for (const e of G.entities) {
    if (!e.alive || e.kind !== 'bld' || e.buildT < 1 || e.def.defense || e.hp < e.maxHp * 0.3 || !G.seen[idx(e.cx, e.cy)]) continue;
    for (const [x, y] of windowSpill(e)) add(x, y, 22, 0.5 * strength, 'pwarm', 0, VIEW.F);
  }
  // Ore glows faintly gold, gems a cold violet: one soft light per cell on screen.
  if (box) {
    const cx0 = Math.max(0, Math.floor(box[0] / CELL)), cx1 = Math.min(MAP - 1, Math.ceil(box[2] / CELL));
    const cy0 = Math.max(0, Math.floor(box[1] / CELL)), cy1 = Math.min(MAP - 1, Math.ceil(box[3] / CELL));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const c = idx(cx, cy), o = G.ore[c];
      if (!o || !G.seen[c] || (cx + cy) & 1) continue;   // (every other cell: the pools are wide and soft)
      add((cx + 0.5) * CELL, (cy + 0.5) * CELL, 30, Math.min(1, 0.25 + o / 600) * 0.32 * strength, G.gem[c] ? 'pgem' : 'pore', 0, VIEW.F);
    }
  }
}
// Up to 4 spots on the ground just in front of a structure's lit windows (toward the camera), per type.
function windowSpill(e) {
  const P = poolLampsFor(), key = e.type + '/' + e.faction;
  let s = P.spill.get(key);
  if (!s) {
    const Ls = structLamps(e.type, e.faction), W = e.w * CELL, H = e.h * CELL;
    s = [];
    for (const w of Ls.wins.slice(0, 4)) {
      let x = w.x, y = w.y;
      for (let i = 0; i < 40 && x > -1 && y > -1 && x < W + 1 && y < H + 1; i++) { x += VIEW.s * 3; y += VIEW.c * 3; }
      s.push([x + VIEW.s * 8, y + VIEW.c * 8]);
    }
    P.spill.set(key, s);
  }
  const ox = e.cx * CELL, oy = e.cy * CELL;
  return s.map(([x, y]) => [ox + x, oy + y]);
}
// Day/night maps: drawNight's lights (art.js calls this with its own adder); round holes in the dark, the colour after.
function lookNightLights(add, night) {
  if (!LOOK.pools || !G) return;
  poolLights((x, y, r, a, col, h) => add(x, y, r * 1.15, Math.min(1, a * 1.2), col === 'pwarm' || col === 'pore', h), 1, null);
}
// After drawNight: the pools' colour, stronger as night falls (view px, as drawLook).
function lookNightPools(g, vx, vy, vw, vh, k, night) {
  if (!LOOK.pools || !G || night < 0.02) return;
  lookPoolPics();
  const near = (x, y, m) => x > vx - m && y > vy - m && x < vx + vw + m && y < vy + vh + m;
  g.save(); g.globalCompositeOperation = 'lighter';
  poolLights((x, y, r, a, col, h, f) => {
    [x, y] = toView(...liftPt(x, y, (h || 0) + gLift(x, y)));
    if (!near(x, y, r)) return;
    const fy = f || 1;
    g.globalAlpha = Math.min(1, a * 0.55 * night); g.drawImage(lookPics[col], (x - vx - r) * k, (y - vy - r * fy) * k, r * 2 * k, r * 2 * fy * k);
  }, 1, null);
  g.restore();
}
function lookPoolPics() {
  if (!lookPics) lookPics = { hole: lookGlowPic('rgba(255,255,255,1)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)'),
    warm: lookGlowPic('rgba(255,190,110,1)', 'rgba(255,120,40,0.5)', 'rgba(255,80,20,0)'),
    blue: lookGlowPic('rgba(170,210,255,1)', 'rgba(90,150,255,0.5)', 'rgba(60,100,255,0)'), sh: mkCanvas(1, 1), gl: mkCanvas(1, 1) };
  if (lookPics.pwarm) return;
  for (const [n, [r0, g0, b0]] of Object.entries(POOL_COL)) lookPics['p' + n] = lookGlowPic(`rgba(${r0},${g0},${b0},1)`, `rgba(${r0},${g0},${b0},0.45)`, `rgba(${r0},${g0},${b0},0)`);
  lookPics.pore = lookGlowPic('rgba(255,215,90,1)', 'rgba(220,170,40,0.4)', 'rgba(200,140,20,0)');
  lookPics.pgem = lookGlowPic('rgba(200,150,255,1)', 'rgba(150,90,240,0.4)', 'rgba(120,60,220,0)');
}

// ---- Ground dressing (LOOK.dress) ------------------------------------------------------------------------------------
// Small details painted into each ground tile once, when it is painted (art.js makeGround's finishSome calls lookDress
// before the marks of battle, so pads, scorches and wrecks go over it): rock clusters, gravel, bushes and puddles on open
// ground, cracks, oil and gravel on the roads, and worn dirt paths from each start position to its nearest ore fields.
// Placed once a battle from the map's ground seed (kept here, not in G), each from its own seed, so a detail split
// between two tiles is drawn the same on both. Never on water or next to it, on ore, cliffs, trees or bridges.
const DRESS_TILE = GROUND_TILE;
let dressLook = null;
function dressFor() {
  if (dressLook && dressLook.g === G) return dressLook;
  const n = Math.ceil(WORLD / DRESS_TILE), by = Array.from({ length: n * n }, () => []), T = G.terr, snow = snowy();
  const r = rng(groundSeed(G) ^ 0xd7e55);
  const put = (it, rad) => {
    const tx0 = Math.max(0, Math.floor((it.x - rad) / DRESS_TILE)), tx1 = Math.min(n - 1, Math.floor((it.x + rad) / DRESS_TILE));
    const ty0 = Math.max(0, Math.floor((it.y - rad) / DRESS_TILE)), ty1 = Math.min(n - 1, Math.floor((it.y + rad) / DRESS_TILE));
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) by[ty * n + tx].push(it);
  };
  const clear = (cx, cy) => {
    if (cx < 1 || cy < 1 || cx > MAP - 2 || cy > MAP - 2) return false;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const c = idx(cx + i, cy + j); if (T[c] >= 4 || G.ore[c] || (G.cliff && G.cliff[c])) return false; }
    const c = idx(cx, cy);
    return T[c] <= 1 && !(G.block && G.block[c]) && !(G.ford && G.ford[c]);
  };
  const roadCell = new Uint8Array(MAP * MAP);
  for (const line of G.road || []) for (const p of line) roadCell[idx(Math.min(MAP - 1, Math.floor(p.x / CELL)), Math.min(MAP - 1, Math.floor(p.y / CELL)))] = 1;
  for (let cy = 0; cy < MAP; cy++) for (let cx = 0; cx < MAP; cx++) {
    const v = r(), s = (r() * 1e9) | 0, x = (cx + r()) * CELL, y = (cy + r()) * CELL;
    if (!clear(cx, cy)) continue;
    const road = roadCell[idx(cx, cy)], dirt = T[idx(cx, cy)] === 1;
    let t = null;
    if (road) t = v < 0.12 ? 'crack' : v < 0.2 ? 'oil' : v < 0.26 ? 'gravel' : v < 0.3 && !snow ? 'puddle' : null;
    else if (dirt) t = v < 0.08 ? 'gravel' : v < 0.13 ? 'rocks' : v < 0.17 && !snow ? 'puddle' : null;
    else t = v < 0.05 ? 'rocks' : v < 0.1 ? 'gravel' : v < 0.17 ? 'bush' : v < 0.185 && !snow ? 'puddle' : null;
    if (t) put({ t, x, y, s }, 18);
  }
  // Worn paths: a wobbly line from each start position to its two nearest ore fields, cut into short pieces.
  for (const sp of G.spawns || []) {
    const fs = (G.oreFields || []).map((f) => [Math.hypot(f.cx - sp.cx, f.cy - sp.cy), f]).sort((a, b) => a[0] - b[0]).slice(0, 2);
    for (const [d, f] of fs) {
      if (d > 40) continue;
      const ax = (sp.cx + 0.5) * CELL, ay = (sp.cy + 0.5) * CELL, bx = (f.cx + 0.5) * CELL, by2 = (f.cy + 0.5) * CELL;
      const L = Math.hypot(bx - ax, by2 - ay), nx = -(by2 - ay) / L, ny = (bx - ax) / L, bend = (r() - 0.5) * L * 0.35, ph = r() * 6;
      let piece = null;
      for (let u = 0; u <= L; u += 3) {
        const k = u / L, w = Math.sin(k * Math.PI) * bend + Math.sin(k * 9 + ph) * 6;
        const x = ax + (bx - ax) * k + nx * w, y = ay + (by2 - ay) * k + ny * w, cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
        if (!clear(cx, cy) || roadCell[idx(cx, cy)] || k < 0.12 || k > 0.9) { piece = null; continue; }
        if (!piece || piece.pts.length >= 10) { if (piece) put(piece, 40); piece = { t: 'path', x, y, s: (r() * 1e9) | 0, pts: [], nx, ny }; }
        piece.pts.push([x, y]);
      }
      if (piece) put(piece, 40);
    }
  }
  dressLook = { g: G, by, n, snow };
  return dressLook;
}
// From art.js makeGround: tile (x0, y0) just painted (g: its canvas, tile pixels).
function lookDress(g, x0, y0) {
  if (!LOOK.dress || !G || !G.terr || (typeof HEADLESS !== 'undefined' && HEADLESS)) return;
  const D = dressFor(), list = D.by[Math.floor(y0 / DRESS_TILE) * D.n + Math.floor(x0 / DRESS_TILE)];
  if (!list || !list.length) return;
  g.save(); g.translate(-x0, -y0);
  for (const it of list) if (it.t === 'path') dressOne(g, it, D.snow);   // paths first, under the rest
  for (const it of list) if (it.t !== 'path') dressOne(g, it, D.snow);
  g.restore();
}
// For tools/bake-ground.js: the soft patches and (dress) the dressing painted into world (x0, y0, w, h) of g (at its 0, 0),
// exactly as makeGround paints them into each tile (one GROUND_TILE at a time, cut to it, so a detail reaching two tiles is
// drawn as twice in play).
function bakeTileLook(g, x0, y0, w, h, dress) {
  const T = GROUND_TILE;
  for (let ty = y0; ty < y0 + h; ty += T) for (let tx = x0; tx < x0 + w; tx += T) {
    g.save(); g.beginPath(); g.rect(tx - x0, ty - y0, T, T); g.clip(); g.translate(tx - x0, ty - y0);
    lookPatchTile(g, tx, ty); if (dress) lookDress(g, tx, ty);
    g.restore();
  }
}
// For gl.js stage 6 (the whole ground on the GPU): the dressing painted into world (x0, y0, w, h) of g, on a map whose
// baked ground does not have it (Village, Frostlight: it depends on the houses), as each tile gets it in play.
function lookDressRegion(g, x0, y0, w, h) {
  const T = GROUND_TILE;
  for (let ty = y0; ty < y0 + h; ty += T) for (let tx = x0; tx < x0 + w; tx += T) {
    g.save(); g.beginPath(); g.rect(tx - x0, ty - y0, T, T); g.clip(); g.translate(tx - x0, ty - y0);
    lookDress(g, tx, ty);
    g.restore();
  }
}
function dressOne(g, it, snow) {
  const r = rng(it.s), { x, y } = it;
  const ell = (px, py, rx, ry, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
  if (it.t === 'path') {   // two worn ruts and trodden dirt between them
    for (const [px, py] of it.pts) {
      ell(px + (r() - 0.5) * 2, py + (r() - 0.5) * 2, 6 + r() * 2, 5 + r() * 2, snow ? 'rgba(150,140,128,0.16)' : 'rgba(132,104,64,0.2)');
      for (const sd of [-1, 1]) g.fillStyle = snow ? 'rgba(90,84,80,0.26)' : 'rgba(84,64,40,0.28)', g.fillRect(Math.round(px + it.nx * sd * 3.5), Math.round(py + it.ny * sd * 3.5), 2, 2);
    }
    return;
  }
  if (it.t === 'rocks') {
    const m = 3 + Math.floor(r() * 6);
    for (let i = 0; i < m; i++) {
      const a = r() * Math.PI * 2, d = r() * 9, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d, s = 1.6 + r() * (i ? 2.4 : 4), tone = 100 + Math.floor(r() * 60);
      ell(px + 1.6, py + 1.4, s, s * 0.8, 'rgba(0,0,0,0.4)');                                   // shadow
      ell(px, py, s, s * 0.8, `rgb(${tone},${tone - 4},${tone - 12})`);
      ell(px - s * 0.3, py - s * 0.3, s * 0.5, s * 0.38, snow ? 'rgba(245,248,255,0.9)' : `rgba(255,250,235,0.42)`);   // lit top (snow on winter maps)
    }
  } else if (it.t === 'gravel') {
    const m = 30 + Math.floor(r() * 30), R = 6 + r() * 7;
    ell(x, y, R * 0.9, R * 0.75, snow ? 'rgba(120,116,110,0.18)' : 'rgba(110,92,64,0.22)');   // bare earth under it
    for (let i = 0; i < m; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R, tone = 80 + Math.floor(r() * 110), sz = r() < 0.3 ? 2 : 1;
      g.fillStyle = `rgba(${tone},${tone - 6},${tone - 14},0.9)`; g.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d), sz, sz);
    }
  } else if (it.t === 'bush') {
    const m = 5 + Math.floor(r() * 6), base = snow ? [52, 66, 58] : r() < 0.3 ? [72, 74, 30] : [40, 72, 28];
    ell(x + 2.5, y + 2.5, 7.5, 5.5, 'rgba(0,0,0,0.35)');
    for (let i = 0; i < m; i++) {
      const a = r() * Math.PI * 2, d = r() * 5, s = 2 + r() * 2.4, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d, l = r() * 24;
      ell(px, py, s, s, `rgb(${base[0] + l},${base[1] + l},${base[2] + l * 0.6})`);
      ell(px - s * 0.35, py - s * 0.35, s * 0.45, s * 0.45, snow ? 'rgba(240,245,255,0.8)' : 'rgba(150,190,90,0.35)');
    }
  } else if (it.t === 'puddle') {
    const rx = 5 + r() * 8, ry = rx * (0.5 + r() * 0.3);
    ell(x, y, rx + 1.5, ry + 1.5, 'rgba(70,52,30,0.3)');               // wet mud round it
    ell(x, y, rx, ry, 'rgba(58,70,82,0.75)');                            // water, darker than the sky
    ell(x - rx * 0.25, y - ry * 0.3, rx * 0.5, ry * 0.25, 'rgba(190,210,230,0.35)');   // the sky's sheen
  } else if (it.t === 'crack') {
    g.strokeStyle = 'rgba(30,24,18,0.65)'; g.lineWidth = 1; g.beginPath();
    let px = x, py = y, a = r() * Math.PI * 2;
    g.moveTo(px, py);
    for (let i = 0; i < 6 + r() * 6; i++) {
      a += (r() - 0.5) * 1.2; px += Math.cos(a) * (2 + r() * 2); py += Math.sin(a) * (2 + r() * 2); g.lineTo(px, py);
      if (r() < 0.2) { g.moveTo(px, py); g.lineTo(px + Math.cos(a + 1.2) * 3, py + Math.sin(a + 1.2) * 3); g.moveTo(px, py); }
    }
    g.stroke();
  } else if (it.t === 'oil') {
    const rx = 4 + r() * 5;
    ell(x, y, rx, rx * 0.7, 'rgba(18,16,18,0.42)'); ell(x + 0.5, y, rx * 0.55, rx * 0.4, 'rgba(10,10,12,0.45)');
    ell(x - rx * 0.3, y - rx * 0.2, rx * 0.4, rx * 0.2, 'rgba(110,90,150,0.12)');   // a faint sheen
  }
}

// ---- Night and morning fog (LOOK.fog) --------------------------------------------------------------------------------
// On the grass maps with day and night (Village; not the snow maps): on some nights (FOG_CHANCE, rolled per night from the
// battle's seed, so every phone of a battle sees the same) fog rolls in after dusk, lies thickest before dawn and lifts in
// the morning. Only when the weather allows it: never in a battle with rain or snow (G.weather), thinner when the wind
// gusts (windNow). Two layers of soft tileable noise drifting with the wind over a thin veil, drawn before drawNight (so
// the night darkens it and lamps' colour shines through it). Looks only: sight and fog of war do not change.
const FOG_CHANCE = 0.55, FOG_MAX = 0.75;   // share of nights with fog; its greatest opacity
// The day phase (0 midnight, 0.5 noon, as art.js dayNight): in from 0.82 to 0.95, lifting from 0.26 to 0.38.
function lookFogLevel(t) {
  if (!LOOK.fog || !G) return 0;
  const m = MAPS[validMap(G.mapId)];
  if (m.mist) {   // a map misty all battle long (Heron Fen): thinner in rain and when the wind gusts
    const w = typeof windNow === 'function' ? windNow() : null, gust = w ? Math.hypot(w.x, w.y / 0.6) / WIND : 1;
    return m.mist * (G.weather ? 0.75 : 1) * Math.max(0.6, Math.min(1, (1.8 - gust) / 0.8));
  }
  if (G.weather || !m.daynight || m.theme === 'snow') return 0;
  const d = t / DAY_LEN + DAY_START, p = d % 1, night = Math.floor(d + 0.2);   // (a night and its morning share a number)
  const sm = (a) => { a = Math.max(0, Math.min(1, a)); return a * a * (3 - 2 * a); };
  const env = p > 0.5 ? sm((p - 0.82) / 0.13) : 1 - sm((p - 0.26) / 0.12);
  if (env <= 0) return 0;
  let h = Math.imul(night + 1, 374761393) ^ Math.imul((G.seed | 0) + 7, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177);
  const r = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  if (r >= FOG_CHANCE) return 0;
  const thick = 0.6 + 0.4 * (r / FOG_CHANCE);                                     // some nights thicker than others
  const w = typeof windNow === 'function' ? windNow() : null, gust = w ? Math.hypot(w.x, w.y / 0.6) / WIND : 1;
  return env * thick * Math.max(0.35, Math.min(1, (1.6 - gust) / 0.7));
}
// The fog lies on the ground: a density field fixed to the world (fogField, an eighth of world size), thick in low ground
// and along water, thin on the hills and gone on the tops, broken into banks by a fixed noise, then thinned and thickened
// by a second noise drifting slowly downwind (fogFrame, each frame). Drawn in the view's world transform, so it keeps to
// the ground's perspective: a thick sheet under the units (lookFogGround, from cliffItems after the ground) and stacked,
// each a few view px higher, so banks show a soft top; then a lighter sheet over the units (lookFogOver, before the smoke)
// so they stand in it with their feet hidden more than their heads. The highest ground (lifted most by the raised ground)
// has almost no fog, so drawing it flat costs nothing in looks. Before drawNight (the night darkens it).
const FOG_Q = 8;   // world px per fog pixel
let fogLook = null, fogPic = null;
function fogField() {
  if (fogLook && fogLook.g === G) return fogLook;
  const N = Math.ceil(WORLD / FOG_Q), c = mkCanvas(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), T = G.terr;
  const wet = new Float32Array(MAP * MAP), R = 4;   // nearness to water, 1 on it, 0 from R cells away
  for (let cy = 0; cy < MAP; cy++) for (let cx = 0; cx < MAP; cx++) {
    if (T[idx(cx, cy)] < 4) continue;
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
      const X = cx + i, Y = cy + j; if (X < 0 || Y < 0 || X >= MAP || Y >= MAP) continue;
      const v = 1 - Math.hypot(i, j) / (R + 1), k = idx(X, Y); if (v > wet[k]) wet[k] = v;
    }
  }
  const sd = (G.seed | 0) * 0.0001, sm = (a) => { a = Math.max(0, Math.min(1, a)); return a * a * (3 - 2 * a); };
  const vn = (u, v, o) => { const i = Math.floor(u), j = Math.floor(v), fu = sm(u - i), fv = sm(v - j), h = (a, b) => hash3(a, b, o) / 1;
    const A = h(i, j), B = h(i + 1, j), C = h(i, j + 1), D = h(i + 1, j + 1); return A + (B - A) * fu + (C - A) * fv + (A - B - C + D) * fu * fv; };
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    const wx = (px + 0.5) * FOG_Q, wy = (py + 0.5) * FOG_Q, h = G.hgt ? hgtAt(wx, wy) / HG_MAX : 0;
    const low = 1 - sm(h / 0.45), w = wet[idx(Math.min(MAP - 1, Math.floor(wx / CELL)), Math.min(MAP - 1, Math.floor(wy / CELL)))];
    const n = vn(px / 22 + sd, py / 22, 61) * 0.7 + vn(px / 9, py / 9 + sd, 62) * 0.3;   // banks, a few hundred px across
    const d = sm(((low * 0.8 + w * 0.5) * (0.3 + n) - 0.42) / 0.25) * (T[idx(Math.min(MAP - 1, Math.floor(wx / CELL)), Math.min(MAP - 1, Math.floor(wy / CELL)))] >= 4 ? 1 : 0.95);
    const i = (py * N + px) * 4;
    img.data[i] = 212; img.data[i + 1] = 220; img.data[i + 2] = 228; img.data[i + 3] = Math.round(255 * d);
  }
  x.putImageData(img, 0, 0);
  fogLook = { g: G, c, N, frame: mkCanvas(N, N), at: -1 };
  return fogLook;
}
// This frame's fog: the field, thinned by a noise drifting downwind (0.15 to 1) (made once a frame, at the field's size).
function fogFrame(t) {
  const F = fogField();
  if (F.at === t) return F.frame;
  F.at = t;
  if (!fogPic) {   // tileable soft noise as alpha (0.3 to 1)
    const N = 64, c = mkCanvas(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), sm = (a) => a * a * (3 - 2 * a);   // (0.15 to 1)
    const hash = (i, j) => { let h = (((i % 8) + 8) % 8) * 374761393 + (((j % 8) + 8) % 8) * 668265263 + 977; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const u = px / 8, v = py / 8, i0 = Math.floor(u), j0 = Math.floor(v), fu = sm(u - i0), fv = sm(v - j0);
      const A = hash(i0, j0), B = hash(i0 + 1, j0), C = hash(i0, j0 + 1), D = hash(i0 + 1, j0 + 1), n = A + (B - A) * fu + (C - A) * fv + (A - B - C + D) * fu * fv;
      const i = (py * N + px) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(255 * (0.15 + 0.85 * n));
    }
    x.putImageData(img, 0, 0); fogPic = c;
  }
  const g = F.frame.getContext('2d'), w = typeof windNow === 'function' ? windNow() : { x: 3, y: 1 };
  g.globalCompositeOperation = 'copy'; g.drawImage(F.c, 0, 0);
  const pat = g.createPattern(fogPic, 'repeat');
  pat.setTransform(new DOMMatrix([2, 0, 0, 2, (t * w.x * 0.12) / FOG_Q, (t * w.y * 0.12) / FOG_Q]));
  g.globalCompositeOperation = 'destination-in'; g.fillStyle = pat; g.fillRect(0, 0, F.N, F.N);
  g.globalCompositeOperation = 'source-over';
  F.frame._own = true; F.frame._ver = (F.frame._ver || 0) + 1;   // (changed: gl.js uploads it again)
  return F.frame;
}
let fogBox = null;   // the world box on screen, from cliffItems
// layers: [lift in view px, opacity] each.
function fogSheets(g, x0, y0, x1, y1, f, layers) {
  const c = fogFrame(G.t), N = fogLook.N;
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(WORLD, x1); y1 = Math.min(WORLD, y1);
  if (x1 <= x0 || y1 <= y0) return;
  const sx = x0 / FOG_Q, sy = y0 / FOG_Q, sw = Math.min(N - sx, (x1 - x0) / FOG_Q), sh = Math.min(N - sy, (y1 - y0) / FOG_Q);
  if (!LIFT_V) LIFT_V = fromView(0, -1);
  const up = g.upright; g.upright = false;
  g.save(); g.imageSmoothingEnabled = true;
  for (const [h, a] of layers) {
    g.globalAlpha = Math.min(1, a * f);
    g.drawImage(c, sx, sy, sw, sh, x0 + LIFT_V[0] * h, y0 + LIFT_V[1] * h, sw * FOG_Q, sh * FOG_Q);
  }
  g.restore(); g.upright = up;
}
function lookFogGround(g, x0, y0, x1, y1) {
  fogBox = null;
  if (!g || !G) return;
  const f = lookFogLevel(G.t) * FOG_MAX * (1 - 0.35 * dayNight(G.t).night);   // (thinner in the dark: it read milky)
  if (f < 0.01) return;
  fogBox = [x0, y0 - 60, x1, y1 + 60];
  fogSheets(g, x0, y0 - 60, x1, y1 + 60, f, [[0, 0.8], [4, 0.5], [9, 0.35], [15, 0.22]]);
}
function lookFogOver(g) {
  if (!fogBox || !g) return;
  const f = lookFogLevel(G.t) * FOG_MAX * (1 - 0.35 * dayNight(G.t).night);   // (thinner in the dark: it read milky)
  if (f < 0.01) return;
  fogSheets(g, ...fogBox, f, [[0, 0.45], [7, 0.25]]);
}

// ---- Rain on the ground and off the roofs (looks only, both modes; nothing in G) --------------------------------------
// Owner, 2026-11-23 (Heron Fen): "make the rain run off buildings realistically ... and make small puddles". In any battle
// with rain (G.weather rain): the ground gets wet over the first minute or so (rainState: soaked after
// RAIN_SOAK s), then
//  - puddles (lookPuddles, on the ground under the units and the fog): spots picked once a battle from the ground seed on
//    open grass and dirt (more on tracks), each filling at its own wetness and growing to its size, dark water with a pale
//    sky sheen, and rings from the drops landing in it;
//  - runoff (lookRunoff, from lookSmoke): every built structure and village house on screen sheds water from the edges of
//    its roofs the camera sees (runoffSpots: from its voxel model, where a broad roof drops 4 or more voxels to the south or
//    east), as falling streams of drops onto the ground or a lower roof, with splashes where they land.
// Drawn with pictures only (drawImage), so the WebGL renderer records them like the smoke. ?lookoff=rain: off.
const RAIN_FX = !(typeof location !== 'undefined' && /[?&]lookoff=[^&]*\brain\b/.test(location.search));
const PUDDLE_BIG = 0.22, PUDDLE_GROW = 240;   // share of puddles that keep growing, and over how many seconds after the soak
const RIV_MAX = 140, RIV_STEP = 6, RIV_IN = 45;   // rivulets: at most, step (world px), seconds after the soak to run fully
const PUDDLE_MAX = 700, RUNOFF_SPOTS = 3, RAIN_SOAK = 75;   // RAIN_SOAK: seconds of rain until the ground is soaked
// RUNOFF_GAP: px between two streams off one structure (was 12: the war factory ran four across its front, a curtain of water)
const RUNOFF_GAP = 26;
let rainS = null, rainBox = null;
// S.rt: seconds of rain the ground has had (soaked at RAIN_SOAK; the rivulets and the puddles' growth go by it too), S.L: how
// hard it rains now (0: not raining). A battle with rain: rt is the battle clock (its rain never stops, so a continued game is
// wet already). A storm (lookstorm.js, world.js stormLevel; on any map but a snowy one or Heron Fen) rains as hard as its
// stand-in weather and soaks the ground the same way, which then dries one second of rain a second once it has passed
// (stormRainT, from the storm plan on the battle clock). Owner, 2026-11-25, in a storm: "i dont see any runoff": the storm's
// rain had no puddles or runoff, as these went by the battle's own weather only.
const rainSnowy = () => (typeof mapTheme === 'function' && mapTheme(G.mapId) === 'snow') || (G.weather && G.weather.kind === 'snow');
function stormRainT(t) {
  if (!LOOK.storms || typeof stormLevel !== 'function' || rainSnowy()) return 0;
  if (stormLevel(t) <= 0 && !(stormPlan && stormPlan.seed === G.seed && stormPlan.list.length)) return 0;
  let rt = 0, last = 0;
  for (const [st, len] of stormPlan.list) {
    if (st >= t) break;
    rt = Math.max(0, rt - (st - last));
    const e = Math.min(t, st + len);
    rt += e - st; last = e;
  }
  return last < t ? Math.max(0, rt - (t - last)) : rt;
}
function rainState() {
  if (!rainS || rainS.g !== G) rainS = { g: G, wet: 0, t: G.t, pud: null, pics: null, spots: new Map() };
  const S = rainS, w = G.weather, real = w && w.kind === 'rain';
  if (S.t !== G.t || S.rt === undefined) {
    const s = LOOK.storms && typeof stormLevel === 'function' && !rainSnowy() ? stormLevel(G.t) : 0;
    S.L = Math.max(real ? Math.min(1, weatherLevel(w, G.t)) : 0, s >= 0.01 ? 0.12 + 0.88 * s : 0);   // (as lookStorm's stand-in)
    S.rt = Math.max(real ? G.t : 0, stormRainT(G.t));
    S.wet = Math.min(1, S.rt / RAIN_SOAK);
    S.t = G.t;
  }
  return S;
}
function rainPics(S) {
  if (S.pics) return S.pics;
  const P = { pud: [], ring: null, drop: [], splash: [] };
  for (let v = 0; v < 6; v++) {   // puddles: a few lobes, dark water, a lighter sheen toward the upper left, a darker wet rim
    const W = 40, H = 28, c = mkCanvas(W, H), x = c.getContext('2d'), r = rng(9173 + v * 131);
    const lobes = Array.from({ length: 2 + (v % 3) }, () => [W / 2 + (r() - 0.5) * 12, H / 2 + (r() - 0.5) * 6, 6 + r() * 7, 4 + r() * 4]);
    const fill = (grow, col) => { x.fillStyle = col; for (const [a, b, rx, ry] of lobes) { x.beginPath(); x.ellipse(a, b, rx + grow, ry + grow * 0.7, 0, 0, 7); x.fill(); } };
    fill(2.2, 'rgba(20,22,18,0.32)'); fill(0, 'rgba(46,58,66,0.86)');
    x.globalCompositeOperation = 'source-atop';
    const gr = x.createLinearGradient(0, 0, W, H); gr.addColorStop(0, 'rgba(190,205,215,0.42)'); gr.addColorStop(0.55, 'rgba(120,138,150,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, W, H);
    P.pud.push(c);
  }
  { const c = mkCanvas(32, 32), x = c.getContext('2d'); x.strokeStyle = 'rgba(215,228,236,0.9)'; x.lineWidth = 2; x.beginPath(); x.arc(16, 16, 13, 0, 7); x.stroke(); P.ring = c; }
  for (let f = 0; f < 4; f++) {   // a stream of drops (tiles down the screen), four frames of their fall
    const c = mkCanvas(3, 48), x = c.getContext('2d'), r = rng(4421);
    for (let i = 0; i < 3; i++) {
      const y0 = ((i * 16 + f * 4 + r() * 3) % 48), len = 3 + r() * 2;
      const gr = x.createLinearGradient(0, y0, 0, y0 + len); gr.addColorStop(0, 'rgba(200,215,228,0)'); gr.addColorStop(1, 'rgba(225,236,245,0.95)');
      x.fillStyle = gr; x.fillRect(1, y0, 1, len); if (y0 + len > 48) x.fillRect(1, 0, 1, y0 + len - 48);
    }
    x.fillStyle = 'rgba(190,205,220,0.16)'; x.fillRect(1, 0, 1, 48);   // a faint trickle joining them
    P.drop.push(c);
  }
  P.stream = [];
  for (let f = 0; f < 4; f++) {   // a roof's runoff stream (tiles down the screen), four frames: a bright 2 px core, soft edges, pulses running down
    const c = mkCanvas(4, 48), x = c.getContext('2d');
    x.fillStyle = 'rgba(170,190,206,0.35)'; x.fillRect(0, 0, 4, 48);
    x.fillStyle = 'rgba(214,228,240,0.8)'; x.fillRect(1, 0, 2, 48);
    x.fillStyle = 'rgba(245,250,255,1)';
    for (let i = 0; i < 4; i++) { const y0 = (i * 12 + f * 3) % 48; x.fillRect(1, y0, 2, 4); if (y0 + 4 > 48) x.fillRect(1, 0, 2, y0 + 4 - 48); }
    P.stream.push(c);
  }
  { const c = mkCanvas(16, 16), x = c.getContext('2d'), gr = x.createRadialGradient(8, 8, 0, 8, 8, 8);   // a soft dab of running water (rivulets)
    gr.addColorStop(0, 'rgba(52,66,76,0.9)'); gr.addColorStop(0.55, 'rgba(46,58,66,0.7)'); gr.addColorStop(1, 'rgba(40,48,52,0)'); x.fillStyle = gr; x.fillRect(0, 0, 16, 16); P.blob = c; }
  { const c = mkCanvas(2, 4), x = c.getContext('2d'); x.fillStyle = 'rgba(200,215,230,0.55)'; x.fillRect(0, 0, 2, 2); x.fillStyle = 'rgba(232,240,248,0.95)'; x.fillRect(0, 2, 2, 2); P.dot = c; }   // a drip
  P.rimw = [];
  for (let v = 0; v < 4; v++) {   // a plateau's pond over the top of its rim's rock (lookFalls): a blob of water with a ragged edge
    const N = 36, c = mkCanvas(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data, r = rng(5113 + v * 71);
    const ph = [r() * 6, r() * 6, r() * 6];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const dx = (i + 0.5) / N * 2 - 1, dy = (j + 0.5) / N * 2 - 1, a = Math.atan2(dy, dx);
      const edge = 0.78 + 0.1 * Math.sin(a * 3 + ph[0]) + 0.07 * Math.sin(a * 7 + ph[1]) + 0.05 * Math.sin(a * 13 + ph[2]);
      if (Math.hypot(dx, dy) > edge) continue;
      const sh = 0.5 + 0.5 * Math.max(0, -(dx + dy) * 0.5), o = (j * N + i) * 4, gr = (r() - 0.5) * 8;
      d[o] = 50 + 60 * sh * 0.45 + gr; d[o + 1] = 62 + 68 * sh * 0.45 + gr; d[o + 2] = 70 + 72 * sh * 0.45 + gr; d[o + 3] = 238;
    }
    x.putImageData(img, 0, 0); P.rimw.push(c);
  }
  { const c = mkCanvas(32, 32), x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);   // spray and mist at a waterfall's foot
    gr.addColorStop(0, 'rgba(225,235,242,0.7)'); gr.addColorStop(0.5, 'rgba(210,222,232,0.3)'); gr.addColorStop(1, 'rgba(200,215,228,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); P.mist = c; }
  { const c = mkCanvas(32, 32), x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);   // fire or a blast shining in a puddle
    gr.addColorStop(0, 'rgba(255,190,90,0.95)'); gr.addColorStop(0.45, 'rgba(240,120,40,0.45)'); gr.addColorStop(1, 'rgba(200,70,20,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); P.glow = c; }
  for (let f = 0; f < 3; f++) {   // a splash where it lands: droplets thrown up and out
    const c = mkCanvas(14, 8), x = c.getContext('2d'), r = rng(77 + f);
    x.fillStyle = 'rgba(225,236,245,0.85)';
    for (let i = 0; i < 6; i++) { const a = Math.PI * (0.1 + 0.8 * r()), d = 2 + f * 1.6 + r() * 2; x.fillRect(Math.round(7 + Math.cos(a) * d * 1.4), Math.round(7 - Math.sin(a) * d), 1, 1); }
    x.fillStyle = 'rgba(200,215,228,0.5)'; x.fillRect(4 - f, 7, 6 + f * 2, 1);
    P.splash.push(c);
  }
  return (S.pics = P);
}
// Puddle spots, bucketed by cell row: [x, y, picture, size, wetness it starts at, phase].
function puddleSpots(S) {
  if (S.pud) return S.pud;
  const rows = Array.from({ length: MAP }, () => []), seed = (typeof groundSeed === 'function' ? groundSeed(G) : G.seed) | 0;
  for (let cy = 1; cy < MAP - 1; cy++) for (let cx = 1; cx < MAP - 1; cx++) {
    const c = idx(cx, cy), t = G.terr[c];
    if (t > 1 || (G.cliff && G.cliff[c]) || G.ore[c] || (G.ford && G.ford[c])) continue;
    const h = hash3(cx, cy, seed + 4049), road = t === 1;
    if (h > (road ? 0.2 : 0.045)) continue;
    const r = rng(Math.imul(c + 1, 2654435761) ^ seed);
    rows[cy].push([(cx + 0.2 + r() * 0.6) * CELL, (cy + 0.2 + r() * 0.6) * CELL, (r() * 6) | 0, (road ? 0.55 : 0.4) + r() * 0.45, 0.08 + r() * 0.5, r() * 10,
      r() < PUDDLE_BIG ? 1.6 + r() * 1.4 : 1]);   // (some keep growing the longer it rains: up to this many times their size)
  }
  return (S.pud = rows);
}
// shows(x, y): on the screen (ui.js onScr). The box x0..y1 is the world round a turned screen, about three times its
// area: without it a PC zoomed out drew ~700 puddles and their rings a frame, most of them off the screen.
function lookPuddles(g, x0, y0, x1, y1, shows) {
  rainBox = [x0, y0, x1, y1];
  if (!RAIN_FX || !g || !G) return;
  const S = rainState();
  if (S.wet < 0.09) return;
  const P = rainPics(S), rows = puddleSpots(S), t = G.t, rings = S.L > 0, grown = Math.min(1, Math.max(0, (S.rt - RAIN_SOAK) / PUDDLE_GROW));
  const up = g.upright; g.upright = false; g.imageSmoothingEnabled = true;
  rivulets(g, S, P, x0, y0, x1, y1, shows);
  const mv = puddleMovers(S, x0, y0, x1, y1), lights = puddleLights(x0, y0, x1, y1);
  const F = flowTick(S);
  // WebGL draws the water itself (gl.js water(): pools, wet ground, running water): here only what moves over it, the
  // splashes and rings of units and blasts and the glow of fire, found from the water's depth instead of the puddles.
  if (F && typeof GLR !== 'undefined' && GLR.waterOn) {
    for (const l of mv.values()) for (const u of l) { const c = idx(Math.floor(u.x / CELL), Math.floor(u.y / CELL)), w = F.W[c]; if (w >= 0.18 && G.seen[c]) puddleWade(S, u, null, Math.min(1.6, 0.7 + w)); }
    if (lights.length) for (const [lx, ly, b] of lights) for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
      const cx = Math.floor(lx / CELL) + i, cy = Math.floor(ly / CELL) + j; if (cx < 0 || cy < 0 || cx >= MAP || cy >= MAP) continue;
      const c = cy * MAP + cx, w = F.W[c]; if (w < 0.18 || !G.seen[c]) continue;
      const x = (cx + 0.5) * CELL, y = (cy + 0.5) * CELL, d = Math.hypot(x - lx, y - ly), k = b * (1 - d / 90) * Math.min(1, w * 2);
      if (k < 0.04) continue;
      const [wx, wy] = hillPt(x, y), op = g.globalCompositeOperation; g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(0.7, k);
      g.drawImage(P.glow, wx - 16, wy - 11, 32, 22); g.globalCompositeOperation = op;
    }
    puddleBlasts(S, rows, F); puddleRipples(g, S, P);
    g.globalAlpha = 1; g.upright = up;
    return;
  }
  if (F) flowDraw(g, S, P, F, x0, y0, x1, y1, shows);
  let n = 0;
  const cy0 = Math.max(0, Math.floor((y0 - 40) / CELL)), cy1 = Math.min(MAP - 1, Math.ceil((y1 + 120) / CELL));
  for (let cy = cy0; cy <= cy1 && n < PUDDLE_MAX; cy++) for (const p of rows[cy]) {
    if (p[0] < x0 - 30 || p[0] > x1 + 30) continue;
    const c = idx(Math.floor(p[0] / CELL), cy);
    if (G.block[c] || !G.seen[c] || (shows && !shows(p[0], p[1]))) continue;   // (a building on it, ground not yet uncovered, off the screen)
    const k = Math.min(1, (S.wet - p[4]) / 0.3);
    if (k <= 0) continue;
    const fw = F ? Math.max(0.35, Math.min(1.7, 0.55 + F.W[c] / FLOW_REF)) : 1;   // (flowing water: drained off a slope, or filled in a hollow)
    const sz = p[3] * (0.45 + 0.55 * k) * (1 + (p[6] - 1) * grown) * fw, W = 40 * sz, H = 28 * sz, [wx, wy] = hillPt(p[0], p[1]);
    g.globalAlpha = Math.min(1, k * 1.6); g.drawImage(P.pud[p[2]], wx - W / 2, wy - H / 2, W, H);
    if (k > 0.3) {
      const rx = 13 * sz, ry = 9 * sz;
      for (let r = cy - 1; r <= cy + 1; r++) { const l = mv.get(r); if (l) for (const u of l) if (((u.x - p[0]) / rx) ** 2 + ((u.y - p[1]) / ry) ** 2 < 1) puddleWade(S, u, p, sz); }
      if (lights.length) puddleGlow(g, P, lights, p, wx, wy, W, H, k);
    }
    if (rings && n < 300) for (let j = 0; j < 2; j++) {   // drops landing: a ring every so often, growing and fading
      const ph = (t * (0.9 + S.L) + p[5] + j * 0.5) % 1, R = 2 + ph * 7 * sz;
      g.globalAlpha = (1 - ph) * 0.5 * S.L; g.drawImage(P.ring, wx + (j ? 3 : -4) * sz - R, wy + (j ? -1 : 2) * sz - R * 0.7, R * 2, R * 1.4);
    }
    n++;
  }
  puddleBlasts(S, rows);
  puddleRipples(g, S, P);
  g.globalAlpha = 1; g.upright = up;
}
// ---- Water that flows (owner, 2026-11-25: "lets do option 3"): a water depth per cell over the whole map (FL.W, in G.hgt's
// units), stepped every FLOW_DT s of battle clock. Rain fills every open cell by its strength, the ground soaks it up (faster
// once the rain stops), and each cell passes water to lower neighbours by how much higher its surface is (ground: the hills,
// dug craters, and a little roughness from the ground seed so flat maps have hollows too). Structures, cliffs, woods and
// the lakes take none (a lake swallows what runs into it). Drawn (flowDraw) as pools where it gathers and glints running
// downhill where it flows; the puddles grow or shrink with the water round them, and wet tank ruts shine. Looks only.
// Rain FLOW_RAIN x its strength a second; the ground takes FLOW_SOAK (FLOW_DRY once dry weather) plus FLOW_SEEP x the depth, so
// a level cell stays below a pool and only hollows with water running in fill (and a pool stops growing).
const FALL_DROP = 4, FALL_MIN = 0.3, FALL_K = 0.35, MESA_DISH = 0.7;   // MESA_DISH: how much lower a plateau's middle is (its pond)   // a waterfall: the drop it needs (G.hgt units), the depth on the lip it starts at, the share of the rest it pours a step
const FLOW_SPLIT = 3, FLOW_RELAX = 0.1, FLOW_DT = 0.5, FLOW_RAIN = 0.014, FLOW_SOAK = 0.004, FLOW_SEEP = 0.06, FLOW_DRY = 0.02, FLOW_K = 1.6, FLOW_REF = 0.5, FLOW_MIN = 0.22, FLOW_Q = 0.012, FLOW_POOLS = 500;
function flowTick(S) {
  if (!LOOK.hills && !G.hgt && S.wet < 0.09) return null;
  let F = S.flow;
  if (!F || F.n !== NCELLS) {
    const seed = (typeof groundSeed === 'function' ? groundSeed(G) : G.seed) | 0, base = new Float32Array(NCELLS);
    // Roughness: smooth rolling bumps at two scales (value noise between lattice points 3 and 8 cells apart) and a little
    // per-cell grain, so water winds round them. (Blocky noise made the runnels run straight along the block edges.)
    const vn = (x, y, sc, k) => { const fx = x / sc, fy = y / sc, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
      const a = hash3(i, j, k), b = hash3(i + 1, j, k), c = hash3(i, j + 1, k), d = hash3(i + 1, j + 1, k); return (a + (b - a) * su) * (1 - sv) + (c + (d - c) * su) * sv; };
    for (let c = 0; c < NCELLS; c++) {
      const x = c % MAP, y = (c / MAP) | 0;
      base[c] = (vn(x, y, 3, seed + 811) - 0.5) * 0.9 + (vn(x, y, 8, seed + 812) - 0.5) * 1.4 + (hash3(x, y, seed + 813) - 0.5) * 0.25;
    }
    // A plateau's top (MAPS mesas) is a shallow basin (owner: rain pools on top, and when the pool is big enough it runs off the
    // sides): lower toward the middle and smoother, so its rain gathers in a pond that spreads to the rim in heavy rain and
    // then spills over (the waterfalls).
    // (thin soil over rock: it soaks the water up more slowly, sk)
    const sk = new Float32Array(NCELLS).fill(1);
    for (const ms of (G.hgt && MAPS[validMap(G.mapId)].mesas) || []) { const R = ms.r + 4; for (let y = Math.max(0, Math.floor(ms.y - R)); y <= Math.min(MAP - 1, Math.ceil(ms.y + R)); y++) for (let x = Math.max(0, Math.floor(ms.x - R)); x <= Math.min(MAP - 1, Math.ceil(ms.x + R)); x++) {
      const d = Math.hypot(x + 0.5 - ms.x, y + 0.5 - ms.y) / R, c = y * MAP + x; if (d >= 1 || G.hgt[c] < HG_MAX * (ms.h || 1) - 3) continue;   // (the top only, not the ramp or the ground below)
      base[c] = base[c] * 0.3 + MESA_DISH * (Math.min(1, d / 0.7) ** 2 - 1); sk[c] = 0.3;   // (level for its outer ring: a full pond reaches the rim)
    } }
    // the puddle spots are small hollows (the rain fills them first, as before)
    for (const row of puddleSpots(S)) for (const q of row) base[idx(Math.floor(q[0] / CELL), Math.floor(q[1] / CELL))] -= 0.25 + q[3] * 0.3;
    // Waterfalls: each open cell on high ground beside a cliff, where its water would land if it spilled over (the first open
    // cell across the cliff, FALL_DROP or more lower), and which way.
    const spill = new Int32Array(NCELLS).fill(-1), sdir = new Int8Array(NCELLS), gh = (c) => (G.hgt ? G.hgt[c] : 0);
    if (G.cliff && G.hgt) for (let y = 1; y < MAP - 1; y++) for (let x = 1; x < MAP - 1; x++) {
      const c = y * MAP + x;
      if (G.cliff[c] || G.terr[c] >= 2 || G.block[c]) continue;
      let best = -1, bd = FALL_DROP, bi = 0;
      for (let i = 0; i < 8; i++) {
        if (!G.cliff[(y + FL_DY[i]) * MAP + x + FL_DX[i]]) continue;
        for (let k = 2; k <= 4; k++) {
          const nx = x + FL_DX[i] * k, ny = y + FL_DY[i] * k; if (nx < 0 || ny < 0 || nx >= MAP || ny >= MAP) break;
          const n = ny * MAP + nx; if (G.cliff[n]) continue;
          if (G.terr[n] === 2 || G.terr[n] === 3 || G.block[n]) break;
          const d = gh(c) - gh(n); if (d > bd) { bd = d; best = n; bi = i; }
          break;
        }
      }
      if (best >= 0) { spill[c] = best; sdir[c] = bi; }
    }
    F = S.flow = { n: NCELLS, dt: FLOW_DT, sk, spill, sdir, SQ: new Float32Array(NCELLS), base, to: new Int32Array(NCELLS).fill(-1), W: new Float32Array(NCELLS), D: new Float32Array(NCELLS), Q: new Float32Array(NCELLS), qx: new Float32Array(NCELLS), qy: new Float32Array(NCELLS), t: G.t };
    // A battle already wet (continued, or long in the rain): the water as it would be, worked out at once (coarse steps).
    const pre = Math.min(40, Math.floor(S.rt / 2));
    for (let i = 0; i < pre; i++) flowStep(F, S, 2);
    F.t = G.t;
  }
  if (G.t < F.t) { F.t = G.t; F.row = -1; }   // (a load or a new clock)
  if (F.row === undefined || F.row < 0) {   // between steps: start the next when due
    if (G.t - F.t < FLOW_DT) return F;
    if (G.t - F.t > 2) F.t = G.t - FLOW_DT;   // (far behind, as after a pause in the menu: skip ahead)
    flowBegin(F, S, FLOW_DT); F.row = 0;
  }
  const r1 = Math.min(MAP, F.row + Math.ceil(MAP / FLOW_SPLIT));
  flowRows(F, FLOW_DT, F.row, r1); F.row = r1;
  if (r1 >= MAP) { flowEnd(F); F.t += FLOW_DT; F.row = -1; }
  return F;
}
const FL_DX = [1, -1, 0, 0, 1, 1, -1, -1], FL_DY = [0, 0, 1, -1, 1, -1, 1, -1], FL_W = [1, 1, 1, 1, Math.SQRT1_2, Math.SQRT1_2, Math.SQRT1_2, Math.SQRT1_2];
const FL_D8 = new Float32Array(8), FL_NB = new Int32Array(8);
// For gl.js: the water to draw this frame, or none (no rain look, dry, or not made yet).
function flowForGl() {
  if (!RAIN_FX || !rainS || rainS.g !== G || !rainS.flow || rainS.flow.n !== NCELLS || rainS.wet < 0.02) return null;
  return { F: rainS.flow, S: rainS };
}
// One step: flowBegin (rain, soaking), flowRows (the water passed on, a band of rows; play spreads them over FLOW_SPLIT frames
// so a phone never spends a whole step in one frame), flowEnd (moved).
function flowStep(F, S, dt) { flowBegin(F, S, dt); flowRows(F, dt, 0, MAP); flowEnd(F); }
function flowBegin(F, S, dt) {
  const { W, D } = F, T = G.terr, B = G.block, C = G.cliff;
  const rain = S.L * FLOW_RAIN * dt, loss = (S.L > 0 ? FLOW_SOAK : FLOW_DRY) * dt, seep = Math.min(0.5, FLOW_SEEP * dt);
  D.fill(0);
  for (let c = 0; c < NCELLS; c++) {
    const t = T[c];
    if (t >= 2 || B[c] || (C && C[c])) { W[c] = 0; continue; }   // (woods, rock, lakes and fords, structures: no standing water)
    const k = F.sk ? F.sk[c] : 1;
    let w = W[c] * (1 - seep * k) + rain - loss * k;
    if (w <= 0) { W[c] = 0; continue; }
    W[c] = w;
  }
}
function flowRows(F, dt, y0, y1) {
  const { W, D, Q, qx, qy, base, to } = F, H = G.hgt, Dg = G.dig, T = G.terr, B = G.block, C = G.cliff;
  for (let y = y0; y < y1; y++) for (let x = 0; x < MAP; x++) {
    const c = y * MAP + x, w = W[c];
    let ox = 0, oy = 0, out = 0;
    if (w > 0.002) {
      const s0 = (H ? H[c] : 0) + (Dg ? Dg[c] : 0) + base[c] + w;
      // eight neighbours (a diagonal's drop counts over its longer way), so water runs any way down a slope, not along the grid
      let tot = 0; const d8 = FL_D8, nb = FL_NB;
      for (let i = 0; i < 8; i++) {
        d8[i] = 0; nb[i] = -1;
        const nx = x + FL_DX[i], ny = y + FL_DY[i];
        if (nx < 0 || ny < 0 || nx >= MAP || ny >= MAP) continue;
        const n = ny * MAP + nx, tn = T[n];
        if (B[n] || (C && C[n]) || tn === 2 || tn === 3) continue;
        const sn = tn >= 4 ? -1e3 : (H ? H[n] : 0) + (Dg ? Dg[n] : 0) + base[n] + W[n];   // (a lake: everything runs in)
        const d = (s0 - sn) * FL_W[i];
        if (d > 0) { d8[i] = Math.min(d, w); nb[i] = n; tot += d8[i]; }
      }
      if (tot > 0) {
        // each neighbour takes FLOW_RELAX of the difference (with eight of them, more made the water slosh to and fro and the
        // pools' shapes flicker), and never more than the cell holds
        const scale = Math.min(FLOW_RELAX, w * 0.9 / tot);
        let big = 0; to[c] = -1;
        for (let i = 0; i < 8; i++) if (nb[i] >= 0) {
          const m = d8[i] * scale;
          if (m > big) { big = m; to[c] = nb[i]; }   // (where most of it goes: the stream drawn to there)
          D[nb[i]] += m; out += m; ox += m * FL_DX[i] * FL_W[i]; oy += m * FL_DY[i] * FL_W[i];
        }
        D[c] -= out;
      } else to[c] = -1;
      // over the edge: water standing past FALL_MIN on a cliff's lip pours down to the foot
      const sc = F.spill[c];
      if (sc >= 0 && w - out > FALL_MIN) { const m = (w - out - FALL_MIN) * FALL_K; D[c] -= m; D[sc] += m; F.SQ[c] += (m / dt - F.SQ[c]) * Math.min(1, dt * 2); }
      else if (sc >= 0) F.SQ[c] *= 1 - Math.min(1, dt);
    }
    // how much runs through (per second, smoothed) and which way, for the glints
    const a = Math.min(1, dt * 2);
    Q[c] += (out / dt - Q[c]) * a; qx[c] += (ox - qx[c]) * a; qy[c] += (oy - qy[c]) * a;
  }
}
function flowEnd(F) {
  const { W, D } = F, T = G.terr;
  F.ver = (F.ver || 0) + 1;   // (gl.js uploads the water again)
  for (let c = 0; c < NCELLS; c++) if (D[c]) { const t = T[c]; W[c] = t >= 4 ? 0 : Math.max(0, W[c] + D[c]); }
}
// Pools (lobed water, its size and darkness by depth; neighbours overlap into one sheet) and, where water runs, a dark wet
// line with glints sliding downhill.
function flowDraw(g, S, P, F, x0, y0, x1, y1, shows) {
  const { W, Q, qx, qy } = F, t = G.t;
  const cx0 = Math.max(0, Math.floor(x0 / CELL) - 1), cx1 = Math.min(MAP - 1, Math.ceil(x1 / CELL) + 1);
  const cy0 = Math.max(0, Math.floor(y0 / CELL) - 1), cy1 = Math.min(MAP - 1, Math.ceil(y1 / CELL) + 3);
  let n = 0;
  const segs = new Map();   // cell -> how much runs through it (0..1, log scale), for the streams
  for (let cy = cy0; cy <= cy1 && n < FLOW_POOLS; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const c = cy * MAP + cx, w = W[c], q = Q[c];
    if (w < FLOW_MIN * 0.5 && q < FLOW_Q) continue;
    if (!G.seen[c] || G.ore[c]) continue;   // (not over ore, which must stay in sight)
    const h = hash3(cx, cy, 977), mx = (cx + 0.5) * CELL + (h - 0.5) * 8, my = (cy + 0.5) * CELL + (hash3(cx, cy, 978) - 0.5) * 6;
    if (shows && !shows(mx, my)) continue;
    const [wx, wy] = hillPt(mx, my);
    if (w >= FLOW_MIN) {   // a pool
      const k = Math.min(1, (w - FLOW_MIN) / FLOW_REF), sz = 0.7 + 0.9 * Math.sqrt(k), Wd = 40 * sz, Hd = 28 * sz;
      g.globalAlpha = Math.min(0.95, 0.35 + k * 0.7) * Math.min(1, S.wet * 1.5);
      g.drawImage(P.pud[(h * 6) | 0], wx - Wd / 2, wy - Hd / 2, Wd, Hd);
      n++;
    }
    if (q > FLOW_Q) {   // water running through (streams: collected, drawn after the pools)
      const a = Math.max(0, Math.min(1, (Math.log10(q) + 1.95) / 1.4)), tc = F.to[c];
      if (tc >= 0 && a > 0.3 && w < FLOW_MIN) segs.set(c, a);   // (not in a pool: a runnel ends where it reaches one)
      n++;
    }
  }
  // (no runnels drawn: lines on the ground never looked like water; WebGL shows running water in gl.js water())
  g.globalAlpha = 1;
}
// The streams: the cells water runs through, followed downhill cell to cell (F.to) into runnels, each drawn as one smooth
// path: a darker wet edge, a pale line of water catching the sky (wider where more runs), and highlights sliding along the
// whole of it, so the water is seen to run.
function flowStreams(g, P, F, segs, t, S) {
  if (!segs.size) return;
  const into = new Set();
  for (const c of segs.keys()) { const d = F.to[c]; if (segs.has(d)) into.add(d); }
  const spot = (c) => { const x = c % MAP, y = (c / MAP) | 0; return hillPt((x + 0.5) * CELL + (hash3(x, y, 977) - 0.5) * 10, (y + 0.5) * CELL + (hash3(x, y, 978) - 0.5) * 8); };
  const runs = [], used = new Set(), diag = new Set();
  for (const c0 of segs.keys()) {
    if (into.has(c0)) continue;   // (a runnel starts where none runs in)
    const cells = []; let c = c0;
    while (c >= 0 && cells.length < 60) {
      cells.push(c);
      if (used.has(c)) break;   // (joins one already drawn: ends there)
      used.add(c);
      let d = F.to[c];
      if (d >= 0 && Math.abs(d - c) !== 1 && Math.abs(d - c) !== MAP) {   // a diagonal step: not across another runnel's diagonal
        const k1 = Math.min(c + (d % MAP) - (c % MAP), d - (d % MAP) + (c % MAP)), k2 = Math.max(c + (d % MAP) - (c % MAP), d - (d % MAP) + (c % MAP));
        if (diag.has(k1 * NCELLS + k2)) d = -1; else diag.add(Math.min(c, d) * NCELLS + Math.max(c, d));
      }
      if (d >= 0 && !segs.has(d) && F.W[d] >= FLOW_MIN) { cells.push(d); break; }   // (into a pool: ends at it)
      c = d >= 0 && segs.has(d) ? d : -1;
    }
    if (cells.length < 2) continue;
    // a smooth curve through the cells' spots (Catmull-Rom, 4 points a cell), and how much runs at each
    const P0 = cells.map(spot), pts = [], amt = [];
    for (let i = 0; i < P0.length - 1; i++) {
      const a = P0[Math.max(0, i - 1)], b = P0[i], c2 = P0[i + 1], d = P0[Math.min(P0.length - 1, i + 2)];
      for (let k = 0; k < 4; k++) {
        const u = k / 4, u2 = u * u, u3 = u2 * u;
        pts.push(0.5 * (2 * b[0] + (-a[0] + c2[0]) * u + (2 * a[0] - 5 * b[0] + 4 * c2[0] - d[0]) * u2 + (-a[0] + 3 * b[0] - 3 * c2[0] + d[0]) * u3),
          0.5 * (2 * b[1] + (-a[1] + c2[1]) * u + (2 * a[1] - 5 * b[1] + 4 * c2[1] - d[1]) * u2 + (-a[1] + 3 * b[1] - 3 * c2[1] + d[1]) * u3));
        amt.push(segs.get(cells[i]) || 0.3);
      }
    }
    const e = P0[P0.length - 1]; pts.push(e[0], e[1]); amt.push(segs.get(cells[cells.length - 1]) || 0.3);
    // Meander: each point pushed sideways by two waves of its own along the runnel (lengths and phases from the start cell),
    // so it bends and wanders as running water does, fading out at the ends (they meet the cells it joins).
    const h = hash3(c0 % MAP, (c0 / MAP) | 0, 979), h2 = hash3(c0 % MAP, (c0 / MAP) | 0, 980), np = pts.length / 2, mp = pts.slice();
    let sAt = 0;
    for (let i = 0; i < np; i++) {
      if (i) sAt += Math.hypot(mp[i * 2] - mp[i * 2 - 2], mp[i * 2 + 1] - mp[i * 2 - 1]);
      const a = mp[Math.max(0, i - 1) * 2], b = mp[Math.max(0, i - 1) * 2 + 1], c2 = mp[Math.min(np - 1, i + 1) * 2], d = mp[Math.min(np - 1, i + 1) * 2 + 1];
      const tl = Math.hypot(c2 - a, d - b) || 1, nx = -(d - b) / tl, ny = (c2 - a) / tl;
      const off = (Math.sin(sAt / (9 + h * 6) + h * 20) * 3.2 + Math.sin(sAt / (4 + h2 * 3) + h2 * 30) * 1.4) * Math.min(1, i / 4, (np - 1 - i) / 4);
      pts[i * 2] += nx * off; pts[i * 2 + 1] += ny * off * 0.7;
      if (i < 6) amt[i] *= 0.4 + 0.1 * i;   // (it starts as a trickle)
    }
    runs.push({ pts, amt, h });
  }
  // drawn in three widths (by how much runs), each as one path: the wet edge, then the water
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [lo, hi, wd] of [[0, 0.4, 1.4], [0.4, 0.7, 2.4], [0.7, 2, 3.4]]) for (const [col, add] of [['rgba(24,30,30,0.38)', 1.6], [`rgba(150,170,186,${S.L > 0 ? 0.62 : 0.45})`, 0]]) {
    g.strokeStyle = col; g.lineWidth = wd + add; g.beginPath();
    let any = false;
    for (const R of runs) for (let i = 0; i + 1 < R.amt.length; i++) {
      if (R.amt[i] < lo || R.amt[i] >= hi) continue;
      g.moveTo(R.pts[i * 2], R.pts[i * 2 + 1]); g.lineTo(R.pts[i * 2 + 2], R.pts[i * 2 + 3]); any = true;
    }
    if (any) g.stroke();
  }
  g.restore();
  // highlights sliding down each runnel, spaced along its length, faster where more runs
  const shine = S.L > 0 ? 1 : 0.55;
  for (const R of runs) {
    const n = R.amt.length, len = [0];
    for (let i = 1; i < n; i++) len.push(len[i - 1] + Math.hypot(R.pts[i * 2] - R.pts[i * 2 - 2], R.pts[i * 2 + 1] - R.pts[i * 2 - 1]));
    const L = len[n - 1]; if (L < 6) continue;
    // (a fixed, uneven spacing of glints that all slide together: each its own size and brightness, flickering a little)
    const sp = 14 + 18 * Math.max(...R.amt), shift = (t * sp + R.h * 50);
    for (let k = 0, base = 0; base < L + 40; k++) {
      const r = hash3(k, (R.h * 9973) | 0, 981), gap = 6 + r * 14; base += gap;
      const d = ((base + shift) % (L + 40)) - 20;
      if (d < 0 || d > L) continue;
      let i = 1; while (i < n - 1 && len[i] < d) i++;
      const f = (d - len[i - 1]) / (len[i] - len[i - 1] || 1), x = R.pts[i * 2 - 2] + (R.pts[i * 2] - R.pts[i * 2 - 2]) * f, y = R.pts[i * 2 - 1] + (R.pts[i * 2 + 1] - R.pts[i * 2 - 1]) * f;
      const a = R.amt[i], sz = (1 + a * 1.6) * (0.7 + r * 0.6), fl = 0.75 + 0.25 * Math.sin(t * (6 + r * 5) + k);
      g.globalAlpha = shine * Math.min(1, 0.4 + a) * (0.5 + r * 0.5) * fl * Math.min(1, d / 8, (L - d) / 8);
      g.drawImage(P.dot, x - sz / 2, y - sz * 0.6, sz, sz * 1.2);
    }
  }
  g.globalAlpha = 1;
}
// ---- Puddles that react (owner, 2026-11-25: "add physics to the puddles", options 1 and 2): a unit wading through one sets
// off rings and a splash (a vehicle a wake of them, faster and bigger), a blast near one throws its water up and sends a
// ring across it, and fire or a blast nearby shines in it. Looks only: rainS.rip (no G state, nothing online).
const RIP_MAX = 160, RIP_LIFE = 0.9, SPRAY_G = 70;
// The ground units on and round the screen, by map row, with how far they moved since the last frame.
function puddleMovers(S, x0, y0, x1, y1) {
  const out = new Map(), last = S.mvLast || (S.mvLast = new Map()), now = new Map();
  for (const e of G.entities) {
    if (!e.alive || e.kind !== 'unit' || (e.cls !== 'veh' && e.cls !== 'inf') || e.x < x0 - 30 || e.x > x1 + 30 || e.y < y0 - 30 || e.y > y1 + 30) continue;
    if ((e.alt || 0) > 1 || e.inHouse) continue;
    const l = last.get(e.id), sp = l ? Math.hypot(e.x - l[0], e.y - l[1]) : 0;
    now.set(e.id, [e.x, e.y]);
    if (sp < 0.05 || sp > 30) continue;   // (standing still, or jumped: a new unit, a transport)
    const r = Math.floor(e.y / CELL); let a = out.get(r); if (!a) out.set(r, a = []);
    a.push({ id: e.id, x: e.x, y: e.y, veh: e.cls === 'veh', big: e.type === 'htank' || e.type === 'mammoth' || e.type === 'harv', dx: e.x - l[0], dy: e.y - l[1] });
  }
  S.mvLast = now;
  return out;
}
// A unit in a puddle: rings now and then (a vehicle more often, bigger), a splash of droplets thrown up and back.
function puddleWade(S, u, p, sz) {
  const next = S.wade || (S.wade = new Map()), t = G.t, due = next.get(u.id) || 0;
  if (t < due) return;
  next.set(u.id, t + (u.veh ? 0.22 : 0.4));
  const l = Math.hypot(u.dx, u.dy) || 1;
  // (centred a little behind it, larger than the unit, so the wake shows round and after it, not only under its hull)
  const back = u.veh ? 7 : 2;
  puddleRip(S, { x: u.x + (u.dx / l) * -back, y: u.y + (u.dy / l) * -back, t0: t, R: Math.min(13 * sz, u.veh ? (u.big ? 15 : 12) : 6), a: u.veh ? 0.55 : 0.5, life: u.veh ? 1.1 : 0.9, one: 1,
    n: u.veh ? 6 : 3, sp: u.veh ? 26 : 14, hx: -u.dx / l, hy: -u.dy / l, seed: (t * 1000 + u.id * 7) | 0 });
}
// New blasts: the puddles within reach of each send rings across and throw their water up.
function puddleBlasts(S, rows, F) {
  const seen = S.fxSeen || (S.fxSeen = new WeakSet());
  for (const f of G.effects) {
    if (f.type !== 'expl' || f.t < 0 || seen.has(f)) continue;
    seen.add(f);
    if (f.t > 0.2) continue;
    const reach = (f.size || 8) * 2.5 + 14, cy0 = Math.max(0, Math.floor((f.y - reach) / CELL)), cy1 = Math.min(MAP - 1, Math.floor((f.y + reach) / CELL));
    let hit = 0;
    if (F) {   // (WebGL water: the pooled cells within reach, nearest first)
      const cells = [];
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = Math.max(0, Math.floor((f.x - reach) / CELL)); cx <= Math.min(MAP - 1, Math.floor((f.x + reach) / CELL)); cx++) {
        const c = cy * MAP + cx, d = Math.hypot((cx + 0.5) * CELL - f.x, (cy + 0.5) * CELL - f.y); if (F.W[c] >= 0.18 && d < reach) cells.push([d, (cx + 0.5) * CELL, (cy + 0.5) * CELL]);
      }
      cells.sort((a, b) => a[0] - b[0]);
      for (const [d, x, y] of cells.slice(0, 4)) {
        const pw = Math.max(0, 1 - d / reach), l = d || 1;
        puddleRip(S, { x, y, t0: G.t, R: 16, a: 0.6 + 0.4 * pw, life: 1.3, n: 0 });
        puddleRip(S, { x, y, t0: G.t, R: 0, a: 0, life: 1.2, n: 8 + Math.round(10 * pw), sp: 30 + 40 * pw, hx: (x - f.x) / l, hy: (y - f.y) / l, up: 1.6, seed: (f.seed || 1) + hit++ * 31 });
      }
      continue;
    }
    for (let cy = cy0; cy <= cy1 && hit < 4; cy++) for (const p of rows[cy]) {
      const d = Math.hypot(p[0] - f.x, p[1] - f.y);
      if (d > reach || p[4] > S.wet - 0.1) continue;
      const pw = Math.max(0, 1 - d / reach), sz = p[3] * (1 + (p[6] - 1) * Math.min(1, Math.max(0, (S.rt - RAIN_SOAK) / PUDDLE_GROW)));
      puddleRip(S, { x: p[0], y: p[1], t0: G.t, R: Math.min(22, 11 * sz), a: 0.6 + 0.4 * pw, life: 1.3, n: 0 });
      puddleRip(S, { x: p[0], y: p[1], t0: G.t + 0.18, R: Math.min(16, 8 * sz), a: 0.4 + 0.3 * pw, life: 1.1, n: 0 });
      const l = d || 1;
      puddleRip(S, { x: p[0], y: p[1], t0: G.t, R: 0, a: 0, life: 1.2, n: 8 + Math.round(10 * pw), sp: 30 + 40 * pw, hx: (p[0] - f.x) / l, hy: (p[1] - f.y) / l, up: 1.6, seed: (f.seed || 1) + hit * 31 });
      if (++hit >= 4) break;
    }
  }
}
function puddleRip(S, r) {
  const L = S.rip || (S.rip = []);
  if (L.length >= RIP_MAX) L.shift();
  L.push(r);
}
// The rings (spreading, fading, two a ripple) and the droplets (thrown up and out, falling back).
function puddleRipples(g, S, P) {
  const L = S.rip; if (!L || !L.length) return;
  const t = G.t;
  let w = 0;
  for (const r of L) {
    const age = t - r.t0;
    if (age > r.life) continue;
    L[w++] = r;
    if (age < 0) continue;
    const k = age / r.life;
    if (r.R > 0) for (let j = 0; j < (r.one ? 1 : 2); j++) {
      const q = k - j * 0.22; if (q <= 0) continue;
      const R = 1.5 + r.R * Math.sqrt(q), [wx, wy] = hillPt(r.x, r.y);
      g.globalAlpha = (1 - q) * r.a * 0.8; g.drawImage(P.ring, wx - R, wy - R * 0.7, R * 2, R * 1.4);
    }
    if (r.n) {
      const rr = rng(r.seed | 0);
      for (let i = 0; i < r.n; i++) {
        const a = Math.atan2(r.hy, r.hx) + (rr() - 0.5) * 2.4, v = r.sp * (0.4 + rr() * 0.6), vz = (18 + rr() * 22) * (r.up || 1);
        const z = vz * age - SPRAY_G * age * age;
        if (z < 0) continue;
        const [wx, wy] = hillPt(r.x + Math.cos(a) * v * age, r.y + Math.sin(a) * v * age * 0.8, z);
        g.globalAlpha = Math.min(1, 1.4 - k) * 0.9; g.drawImage(P.dot, wx - 0.5, wy - 1, 1.5, 3);
      }
    }
  }
  L.length = w;
}
// Fire and blasts on and round the screen, as [x, y, brightness].
function puddleLights(x0, y0, x1, y1) {
  const out = [];
  for (const f of G.effects) {
    if ((f.type !== 'fire' && f.type !== 'expl') || f.t < 0 || f.x < x0 - 80 || f.x > x1 + 80 || f.y < y0 - 80 || f.y > y1 + 80) continue;
    const b = f.type === 'expl' ? Math.max(0, 1 - f.t / (f.life || 1)) * Math.min(1.5, (f.size || 8) / 10) : 0.55 * Math.max(0, Math.min(1, (f.life - f.t) / 0.5));
    if (b > 0.05) out.push([f.x, f.y, b]);
    if (out.length >= 40) break;
  }
  return out;
}
// The nearest light within 90 px shining in puddle p, a warm glow over its water.
function puddleGlow(g, P, lights, p, wx, wy, W, H, k) {
  let best = 0;
  for (const [x, y, b] of lights) { const d = Math.hypot(x - p[0], y - p[1]); if (d < 90) best = Math.max(best, b * (1 - d / 90)); }
  if (best < 0.04) return;
  const op = g.globalCompositeOperation;
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(0.8, best * k);
  g.drawImage(P.glow, wx - W * 0.4, wy - H * 0.4, W * 0.8, H * 0.8);
  g.globalCompositeOperation = op;
}
// Where a structure's roofs shed water, in its model's voxels (= world px from its top left): [x, y, eave z, landing z].
function runoffSpots(type, faction) {
  const key = type + '|' + faction, S = rainS;
  if (S.spots.has(key)) return S.spots.get(key);
  if (!STRUCTURES[type]) return [];   // (a village house not drawn yet: its model is registered when first drawn)
  let out = [];
  try {
    const pal = palFor(faction), m = model('S' + type + pal.key, () => STRUCTURES[type](pal, faction)), top = topOf(m), W = m.w, H = m.h;
    const T = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : top[y * W + x]);
    const cand = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const z = T(x, y);
      if (z < 5) continue;
      const broad = T(x - 1, y) >= z - 2 && T(x + 1, y) >= z - 3 && T(x, y - 1) >= z - 2 && T(x - 2, y) >= z - 3 && T(x, y - 2) >= z - 3;   // a roof, not a mast or a chimney
      if (!broad) continue;
      // ...and broad behind the eave too: most of a 13 x 7 patch on the roof's side at about this height. The 5-neighbour test
      // alone let a chimney's or tower's top pass (the Allied Power Plant poured water from its small stack's rim, in the air).
      const behind = (sx, sy) => { let n = 0; for (let j = 0; j < 7; j++) for (let i = -6; i <= 6; i++) if (T(x + (sx ? -j : i), y + (sx ? i : -j)) >= z - 3) n++; return n >= 70; };
      const zs = T(x, y + 1), ze = T(x + 1, y);
      if (z - zs >= 4 && !behind(0, 1)) continue;
      if (z - zs < 4 && z - ze >= 4 && !behind(1, 0)) continue;
      if (z - zs >= 4) cand.push([x + m.x0 + 0.5, y + m.y0 + 1.2, z + 0.5, Math.max(0, zs + 1)]);
      else if (z - ze >= 4) cand.push([x + m.x0 + 1.2, y + m.y0 + 0.5, z + 0.5, Math.max(0, ze + 1)]);
    }
    const r = rng(strSeed(type) ^ 0x51ed);
    for (let i = cand.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [cand[i], cand[j]] = [cand[j], cand[i]]; }
    // Eaves that drop to the ground first, then the longest falls: a step down onto a lower roof (a few px) could not be seen.
    const fallOf = (c) => c[2] - c[3], rank = (c) => (c[3] <= 3 ? 0 : 1);
    cand.sort((a, b) => rank(a) - rank(b) || (fallOf(b) >= 10) - (fallOf(a) >= 10));
    for (const c of cand) if (fallOf(c) >= 6) if (out.length < RUNOFF_SPOTS && out.every((o) => Math.hypot(o[0] - c[0], o[1] - c[1]) > RUNOFF_GAP)) out.push(c);
  } catch (_) { out = []; }
  S.spots.set(key, out);
  return out;
}
// Waterfalls (owner, 2026-11-25, of Lakeside's plateau: "rain can also pool on top of these and if the pool gets enough it can
// run off the sides like waterfalls"): every lip pouring (rainS.flow.SQ, look.js flowStep) drawn as falling water from the lip
// down the cliff face to the foot (the roof runoff's stream pictures, as wide as the flow, turned to run between the two
// spots on the screen), with spray and mist where it lands. Over the units (lookSmoke), as the roof runoff.
let DOWN_V = null;
function lookFalls(g) {
  if (!DOWN_V) { const v = fromView(0, 1), l = Math.hypot(v[0], v[1]); DOWN_V = [v[0] / l, v[1] / l]; }   // (the world's way toward the camera)
  if (!RAIN_FX || !g || !G || !rainBox || !rainS || rainS.g !== G || !rainS.flow) return;
  const F = rainS.flow, S = rainS, P = rainPics(S), [x0, y0, x1, y1] = rainBox, t = G.t;
  if (!F.spill) return;
  const cx0 = Math.max(0, Math.floor(x0 / CELL) - 2), cx1 = Math.min(MAP - 1, Math.ceil(x1 / CELL) + 2), cy0 = Math.max(0, Math.floor(y0 / CELL) - 2), cy1 = Math.min(MAP - 1, Math.ceil(y1 / CELL) + 6);
  const m = g.getTransform(), up = g.upright, zs = Math.hypot(m.a, m.b);
  // The pond over the rim: the crags' tops are pictures over the ground, so the ground's water stops at their inner edge.
  // Each rim cliff cell beside a top cell holding pond water gets the pond drawn over its top, at the top's height, out to
  // the edge the falls pour from (owner: "its still not making it to the edge").
  if (F.rim === undefined) {
    F.rim = [];
    for (const ms of (G.hgt && MAPS[validMap(G.mapId)].mesas) || []) for (let y = Math.max(1, Math.floor(ms.y - ms.r - 3)); y <= Math.min(MAP - 2, Math.ceil(ms.y + ms.r + 3)); y++) for (let x = Math.max(1, Math.floor(ms.x - ms.r - 3)); x <= Math.min(MAP - 2, Math.ceil(ms.x + ms.r + 3)); x++) {
      const c = y * MAP + x; if (!G.cliff[c]) continue;
      const tops = [];
      for (let i = 0; i < 8; i++) { const n = (y + FL_DY[i]) * MAP + x + FL_DX[i]; if (!G.cliff[n] && F.sk[n] < 1) tops.push(n); }
      if (tops.length) F.rim.push([c, tops]);
    }
  }
  // (the rim's rock can be two cells deep: a cell beside a wet one takes its water too, out to the edge)
  let rimOn = false;
  const wetRim = F.wetRim || (F.wetRim = new Map());
  wetRim.clear();
  for (const [c, tops] of F.rim) { let w = 0, tn = -1; for (const n of tops) if (F.W[n] > w) { w = F.W[n]; tn = n; } if (w >= 0.24) wetRim.set(c, [w, tn]); }
  if (!F.rimAll) { F.rimAll = []; const inRim = new Set(F.rim.map((r) => r[0])); for (let y = 1; y < MAP - 1; y++) for (let x = 1; x < MAP - 1; x++) { const c = y * MAP + x; if (!G.cliff[c] || inRim.has(c)) continue; const nb = []; for (let i = 0; i < 8; i++) { const n = (y + FL_DY[i]) * MAP + x + FL_DX[i]; if (inRim.has(n)) nb.push(n); } if (nb.length) F.rimAll.push([c, nb]); } }
  for (const [c, nb] of F.rimAll) { let best = null; for (const n of nb) { const v = wetRim.get(n); if (v && (!best || v[0] > best[0])) best = v; } if (best) wetRim.set(c, best); }
  for (const [c, [w, tn]] of wetRim) {
    if (!G.seen[c]) continue;
    const x = (c % MAP) * CELL, y = ((c / MAP) | 0) * CELL;
    if (x < x0 - 40 || x > x1 + 40 || y < y0 - 40 || y > y1 + 120) continue;
    if (!rimOn) { rimOn = true; g.upright = false; g.imageSmoothingEnabled = false; }
    const [lx, ly] = liftPt(x, y, gLift((tn % MAP + 0.5) * CELL, (((tn / MAP) | 0) + 0.5) * CELL));
    g.globalAlpha = Math.min(0.95, (w - 0.2) * 6); g.drawImage(P.rimw[c & 3], lx - CELL * 0.35, ly - CELL * 0.35, CELL * 1.7, CELL * 1.7);
  }
  if (rimOn) g.globalAlpha = 1;
  let any = false;
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const c = cy * MAP + cx, q = F.SQ[c], tc = F.spill[c];
    if (tc < 0 || q < 0.004 || !G.seen[c]) continue;
    const i = F.sdir[c], dx = FL_DX[i], dy = FL_DY[i], dl = Math.hypot(dx, dy), tx = tc % MAP, ty = (tc / MAP) | 0;
    if ((dx * DOWN_V[0] + dy * DOWN_V[1]) / dl < 0.25) continue;   // (a lip facing away from the camera: its fall is behind the plateau)
    // straight down from the lip (at the top's height) to the foot (at the height of the ground it lands on)
    const lx = (tx + 0.5 - dx / dl * 0.75) * CELL, ly = (ty + 0.5 - dy / dl * 0.75) * CELL;   // (the cliff's outer face, over the foot)
    const [ax, ay] = liftPt(lx, ly, gLift((cx + 0.5) * CELL, (cy + 0.5) * CELL)), [bx, by] = liftPt(lx, ly, gLift((tx + 0.5) * CELL, (ty + 0.5) * CELL));
    const X0 = m.a * ax + m.c * ay + m.e, Y0 = m.b * ax + m.d * ay + m.f, X1 = m.a * bx + m.c * by + m.e, Y1 = m.b * bx + m.d * by + m.f;
    if (Y1 < Y0 + 2) continue;
    if (!any) { any = true; g.upright = false; g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = true; }
    const k = Math.min(1, Math.sqrt(q * 12)), w = (3.5 + 8 * k) * zs * 0.5, len = Math.hypot(X1 - X0, Y1 - Y0), ang = Math.atan2(Y1 - Y0, X1 - X0) - Math.PI / 2;
    const fr = P.stream[Math.floor(t * 18 + cx) & 3], shine = 0.55 + 0.45 * Math.min(1, S.L * 2 + 0.3);
    g.save(); g.translate(X0, Y0); g.rotate(ang);
    for (const [ww, a] of [[w * 1.8, 0.25], [w, 0.85]]) {   // a soft sheet, then the falling water in it
      g.globalAlpha = a * shine * (0.4 + 0.6 * k);
      for (let y = 0; y < len; y += 48 * zs * 0.5) { const hh = Math.min(48 * zs * 0.5, len - y); g.drawImage(fr, 0, 0, 4, hh / (zs * 0.5), -ww / 2, y, ww, hh); }
    }
    g.restore();
    // spray and mist where it lands, and a splash of its own now and then
    const mz = (10 + 22 * k) * zs * 0.5;
    g.globalAlpha = (0.35 + 0.35 * k) * (0.8 + 0.2 * Math.sin(t * 5 + cx)); g.drawImage(P.mist, X1 - mz, Y1 - mz * 0.75, mz * 2, mz * 1.2);
    g.globalAlpha = 0.7 + 0.3 * k; g.drawImage(P.splash[Math.floor(t * 12 + cx) % 3], X1 - 10 * zs * 0.5 * (1 + k), Y1 - 8 * zs * 0.5, 20 * zs * 0.5 * (1 + k), 11 * zs * 0.5);
  }
  if (any) { g.globalAlpha = 1; g.setTransform(m); }
  g.upright = up;
}
function lookRunoff(g) {
  if (!RAIN_FX || !g || !G || !rainBox) return;
  const S = rainState();
  if (S.wet < 0.12 || S.L <= 0) return;   // (once a storm has passed the roofs stop running; the puddles dry more slowly)
  const P = rainPics(S), [x0, y0, x1, y1] = rainBox, t = G.t, flow = Math.min(1, (S.wet - 0.12) / 0.4) * (0.45 + 0.55 * S.L) * Math.min(1, S.L / 0.12);
  const up = g.upright; g.upright = true; g.imageSmoothingEnabled = false;
  const shed = (e, type, faction, ox, oy, bw, bh) => {
    if (ox > x1 + 20 || ox + bw < x0 - 20 || oy > y1 + 160 || oy + bh < y0 - 20) return;
    const lift = gLift(ox + bw / 2, oy + bh / 2), sp = runoffSpots(type, faction);
    g.upright = false;   // a little wet pool where each lands (on the ground, so lying flat)
    for (const [sx, sy, z0, z1] of sp) {
      if (z1 > 3 || (z0 - z1) * VK < 3) continue;
      const [px, py] = liftPt(ox + sx, oy + sy + 3, lift);
      g.globalAlpha = 0.7 * flow; g.drawImage(P.pud[(sx | 0) % 6], px - 7, py - 4, 14, 9);
    }
    g.upright = true;
    sp.forEach(([sx, sy, z0, z1], i) => {
      const len = (z0 - z1) * VK;
      if (len < 3) return;
      // A steady trickle from the eave to the ground (the stream pictures, flowing down), drips falling along it (two at a time
      // from each spot, every `per` s, 0.7-1.6, its own, speeding up as they fall) and splashes where it lands. Heavier in
      // heavier rain. (Owner, 2026-11-24, raining on Lakeside: "i dont see any run off": single 2 px drips were too faint.)
      const per = 0.7 + ((e.id * 5 + i * 11) % 10) * 0.1, fall = Math.max(0.12, Math.sqrt(len) * 0.07), ph = e.id * 0.37 + i * 0.61;
      const [ex, ey] = liftPt(ox + sx, oy + sy, lift + z0 * VK), [gx, gy] = liftPt(ox + sx, oy + sy, lift + z1 * VK);
      const fr = P.stream[Math.floor(t * 16 + i) & 3], h = gy - ey;
      g.globalAlpha = (0.7 + 0.3 * S.L) * flow;
      for (let y = 0; y < h; y += 48) { const k = Math.min(48, h - y); g.drawImage(fr, 0, 0, 4, k, ex - 2, ey + y, 4, k); }
      g.globalAlpha = 0.5 * flow; g.drawImage(P.dot, ex - 1.5, ey - 1, 3, 3);   // water gathering at the eave
      for (const off of [0, 0.5]) {
        const u = ((t / per + ph + off) % 1) * per;
        if (u < fall) { const f = (u / fall) ** 2; g.globalAlpha = 0.95 * flow; g.drawImage(P.dot, ex + (gx - ex) * f - 1.5, ey + (gy - ey) * f - 3, 3, 6); }
        else if (u < fall + 0.24) g.globalAlpha = flow, g.drawImage(P.splash[Math.min(2, Math.floor((u - fall) / 0.08))], gx - 10, gy - 9, 20, 11);
      }
      g.globalAlpha = 0.85 * flow; g.drawImage(P.splash[Math.floor(t * 10 + i * 2) % 3], gx - 8, gy - 7, 16, 9);   // the stream splashing as it lands
    });
  };
  for (const e of G.entities) {
    // None off defences (owner, 2026-11-25, Tesla Coils and Flame Towers in the rain: "two random streams that just stick out":
    // their small high tops passed as roofs, and neither a stream nor a thin trickle of drops looked right there).
    if (!e.alive || e.kind !== 'bld' || e.buildT < 1 || e.def.defense || !G.seen[idx(e.cx, e.cy)]) continue;
    shed(e, e.type, e.faction, e.cx * CELL, e.cy * CELL, e.w * CELL, e.h * CELL);
  }
  for (const h of G.houses || []) {
    if (!h.alive || h.cap === 0 || !G.seen[idx(h.cx, h.cy)]) continue;   // (not the fountain)
    shed(h, h.type, 'allies', h.cx * CELL, h.cy * CELL, h.w * CELL, h.h * CELL);
  }
  g.globalAlpha = 1; g.upright = up; g.imageSmoothingEnabled = false;
}

// Rivulets (owner, 2026-11-23: "puddles have a chance to get bigger and run down the hill from our base"): once the ground is
// soaked, water runs off the high ground: from spots on hills and plateaus (65-98% of HG_MAX, picked once a battle from the
// ground seed), each traced down the steepest way (hgtAt, with a little meander) in RIV_STEP px steps until it reaches low
// ground, water, a cliff or a structure, where it pools (a puddle that grows). Cliffs stop it, so off a plateau the water
// runs down the ramps. Drawn lying on the raised ground: a dark wet channel widening as it goes, glints running down it.
function rivuletPaths(S) {
  if (S.riv) return S.riv;
  const out = [], seed = (typeof groundSeed === 'function' ? groundSeed(G) : G.seed) | 0;
  if (G.hgt) for (let cy = 2; cy < MAP - 2; cy++) for (let cx = 2; cx < MAP - 2; cx++) {
    const c = idx(cx, cy), h = G.hgt[c];
    if (h < HG_MAX * 0.65 || h > HG_MAX * 0.98 || G.terr[c] > 1 || (G.cliff && G.cliff[c]) || hash3(cx, cy, seed + 811) > 0.09) continue;
    const r = rng(Math.imul(c + 7, 2246822519) ^ seed), pts = [];
    let x = (cx + r()) * CELL, y = (cy + r()) * CELL;
    for (let i = 0; i < 160; i++) {
      pts.push(x, y);
      const e = 3, gx = hgtAt(x + e, y, true) - hgtAt(x - e, y, true), gy = hgtAt(x, y + e, true) - hgtAt(x, y - e, true), gl = Math.hypot(gx, gy);
      if (gl < 0.004 || hgtAt(x, y, true) < 1.5) break;
      const wob = (hash3(Math.floor(x / 9), Math.floor(y / 9), seed + 812) - 0.5) * 0.9, ux = -gx / gl, uy = -gy / gl;
      x += (ux - uy * wob) * RIV_STEP; y += (uy + ux * wob) * RIV_STEP;
      const cc = idx(Math.max(0, Math.min(MAP - 1, Math.floor(x / CELL))), Math.max(0, Math.min(MAP - 1, Math.floor(y / CELL))));
      if (G.terr[cc] >= 2 || (G.cliff && G.cliff[cc])) break;   // into rock, woods or water: it ends here
    }
    if (pts.length < 20) continue;   // (shorter than about 60 px: not worth a channel)
    let a = Infinity, b = Infinity, A = -Infinity, B = -Infinity;
    for (let i = 0; i < pts.length; i += 2) { a = Math.min(a, pts[i]); A = Math.max(A, pts[i]); b = Math.min(b, pts[i + 1]); B = Math.max(B, pts[i + 1]); }
    out.push({ pts, box: [a - 30, b - 30, A + 30, B + 30], ph: r() * 50, big: 1.4 + r() * 1.4 });
  }
  out.sort((p, q) => q.pts.length - p.pts.length);
  return (S.riv = out.slice(0, RIV_MAX));
}
// Zoomed out (under RIV_ZS screen px per world px), a rivulet that has run its full length is one picture (rivPic) instead of
// a dab per half step: on a PC zoomed out over Lakeside in the rain, ~17 ms a frame went on the dabs.
const RIV_ZS = 2, RIV_Q = 0.5, RIV_PICS = typeof GROUND_ROOMY !== 'undefined' && !GROUND_ROOMY ? 40 : 200;
function lookZoomPx() { return (typeof window !== 'undefined' && window.__ps && window.__ps.cam ? window.__ps.cam.z : 1) * ((typeof devicePixelRatio === 'number' && devicePixelRatio) || 1); }
// The channel's dabs drawn once into a picture at RIV_Q px per world px (in the raised ground's world coordinates), made
// again when a cell of it is uncovered or built on (sig). Kept for up to RIV_PICS rivulets, the least lately drawn dropped.
function rivPic(R, P, S) {
  const pts = R.pts, n = pts.length / 2;
  let sig = 0;
  for (let i = 0; i < n; i++) { const c = idx(Math.floor(pts[i * 2] / CELL), Math.floor(pts[i * 2 + 1] / CELL)); if (G.block[c] || !G.seen[c]) sig = (Math.imul(sig, 31) + i + 1) | 0; }
  const M = S.rivPics || (S.rivPics = new Map());
  let e = M.get(R);
  if (e && e.sig === sig) { M.delete(R); M.set(R, e); return e; }   // (to the end: most lately drawn)
  const dabs = [];
  let a = Infinity, b = Infinity, A = -Infinity, B = -Infinity;
  for (let i = 0; i < n; i++) {
    const c = idx(Math.floor(pts[i * 2] / CELL), Math.floor(pts[i * 2 + 1] / CELL));
    if (G.block[c] || !G.seen[c]) continue;
    const w = 5 + 6 * (i / n);
    for (const f of i + 1 < n ? [0, 0.5] : [0]) {
      const [wx, wy] = hillPt(pts[i * 2] + (pts[i * 2 + 2] - pts[i * 2]) * f, pts[i * 2 + 1] + (pts[i * 2 + 3] - pts[i * 2 + 1]) * f);
      dabs.push(wx, wy, w);
      a = Math.min(a, wx - w / 2); b = Math.min(b, wy - w / 2); A = Math.max(A, wx + w / 2); B = Math.max(B, wy + w / 2);
    }
  }
  if (!dabs.length) { e = { sig, c: null }; M.set(R, e); return e; }
  const cw = Math.max(1, Math.ceil((A - a) * RIV_Q) + 2), ch = Math.max(1, Math.ceil((B - b) * RIV_Q) + 2);
  const c = (e && e.c) || mkCanvas(cw, ch);
  if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; } else c.getContext('2d').clearRect(0, 0, cw, ch);
  const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.globalAlpha = 0.5;
  for (let i = 0; i < dabs.length; i += 3) { const w = dabs[i + 2]; x.drawImage(P.blob, (dabs[i] - w / 2 - a) * RIV_Q + 1, (dabs[i + 1] - w / 2 - b) * RIV_Q + 1, w * RIV_Q, w * RIV_Q); }
  c._own = true; c._ver = (c._ver || 0) + 1;   // (gl.js: a texture of its own, uploaded again only when made again)
  e = { sig, c, x: a - 1 / RIV_Q, y: b - 1 / RIV_Q, w: cw / RIV_Q, h: ch / RIV_Q };
  M.delete(R); M.set(R, e);
  if (M.size > RIV_PICS) M.delete(M.keys().next().value);
  return e;
}
function rivulets(g, S, P, x0, y0, x1, y1, shows) {
  const run = Math.min(1, Math.max(0, (S.rt - RAIN_SOAK * 0.6) / RIV_IN));
  if (run <= 0) return;
  const t = G.t, whole = run >= 1 && lookZoomPx() < RIV_ZS;
  for (const R of rivuletPaths(S)) {
    if (R.box[2] < x0 || R.box[0] > x1 || R.box[3] < y0 || R.box[1] > y1 + 120) continue;
    const pts = R.pts, n = pts.length / 2, m = Math.max(2, Math.floor(n * run));   // (it runs further down as the rain goes on)
    if (whole) { const e = rivPic(R, P, S); if (e.c) { g.globalAlpha = 1; g.drawImage(e.c, e.x, e.y, e.w, e.h); } }
    else for (let i = 0; i < m; i++) {
      const c = idx(Math.floor(pts[i * 2] / CELL), Math.floor(pts[i * 2 + 1] / CELL));
      if (G.block[c] || !G.seen[c] || (shows && !shows(pts[i * 2], pts[i * 2 + 1]))) continue;
      const w = 5 + 6 * (i / n);
      for (const f of i + 1 < m ? [0, 0.5] : [0]) {   // (half steps too, so the channel is unbroken)
        const [wx, wy] = hillPt(pts[i * 2] + (pts[i * 2 + 2] - pts[i * 2]) * f, pts[i * 2 + 1] + (pts[i * 2 + 3] - pts[i * 2 + 1]) * f);
        g.globalAlpha = 0.5; g.drawImage(P.blob, wx - w / 2, wy - w / 2, w, w);
      }
    }
    g.globalAlpha = 0.75;   // glints running down it (while it rains)
    if (S.L > 0) for (let j = 0; j < 4; j++) {
      const f = ((t * 7 + R.ph + j * m / 4) % m) | 0, [wx, wy] = hillPt(pts[f * 2], pts[f * 2 + 1]);
      g.drawImage(P.dot, wx - 1, wy - 1, 2, 2);
    }
    if (run >= 1) {   // where it ends it pools, and the pool grows
      const k = Math.min(1, (S.rt - RAIN_SOAK * 0.6 - RIV_IN) / PUDDLE_GROW), sz = 0.7 + R.big * k, [wx, wy] = hillPt(pts[pts.length - 2], pts[pts.length - 1]);
      const c = idx(Math.floor(pts[pts.length - 2] / CELL), Math.floor(pts[pts.length - 1] / CELL));
      if (!G.block[c] && G.seen[c]) { g.globalAlpha = 0.95; g.drawImage(P.pud[(R.ph | 0) % 6], wx - 20 * sz, wy - 14 * sz, 40 * sz, 28 * sz); }
    }
  }
  g.globalAlpha = 1;
}
