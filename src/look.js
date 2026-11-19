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
// (LOOK_SOFT below: the soft ground blends, read by art.js groundPixels and copied into its workers)
const LOOK = (() => {
  const q = typeof location !== 'undefined' ? location.search : '';
  const on = !/[?&]look=off\b/.test(q), off = (q.match(/[?&]lookoff=([a-z,]+)/) || [, ''])[1].split(',');   // ?lookoff=ground,water: parts off
  const L = { light: on, cliffs: on, concrete: on, lamps: on, ground: on, water: on, smoke: on, hills: on };
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
const HILL_EDGE = 72, HILL_CH = 32, HILL_LAP = 0.6;
let LIFT_V = null;   // the world vector that shows one view pixel straight up
function gLift(x, y) {
  if (!LOOK.hills || !G || !G.hgt) return 0;
  const m = Math.min(x, y, WORLD - x, WORLD - y);
  if (m <= 0) return 0;
  const h = hgtAt(x, y) * VK;
  return m >= HILL_EDGE ? h : h * (m / HILL_EDGE);
}
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
// Whether G.hgt is 0 all over a world box (and a cell round it): drawn flat in one piece. Kept per battle, per 256 px square.
let hillFlat = null;
function hillFlatBox(x0, y0) {
  if (!hillFlat || hillFlat.g !== G || hillFlat.h !== G.hgt) hillFlat = { g: G, h: G.hgt, m: new Map() };
  const S = 256, k = Math.floor(y0 / S) * 4096 + Math.floor(x0 / S);
  let f = hillFlat.m.get(k);
  if (f === undefined) {
    f = true;
    const bx = Math.floor(x0 / S) * S, by = Math.floor(y0 / S) * S;
    const c0 = Math.max(0, Math.floor(bx / CELL) - 1), c1 = Math.min(MAP - 1, Math.floor((bx + S) / CELL) + 1), r0 = Math.max(0, Math.floor(by / CELL) - 1), r1 = Math.min(MAP - 1, Math.floor((by + S) / CELL) + 1);
    for (let y = r0; y <= r1 && f; y++) for (let x = c0; x <= c1; x++) if (G.hgt[y * MAP + x] > 0) { f = false; break; }
    hillFlat.m.set(k, f);
  }
  return f;
}
// The ground's warp for one frame of the view canvas g (top left (vx, vy) on the view plane), or null (hills off).
// each(x0, y0, x1, y1, fn): fn(X0, Y0, X1, Y1) for every chunk of the world box with g's transform set for it (the box
// in one piece where it is flat); the transform is left in the plain world one after.
function hillWarp(g, vx, vy) {
  if (!LOOK.hills || !G || !G.hgt) return null;
  const C = VIEW.c, S = VIEW.s, F = VIEW.F;
  const flatT = () => g.setTransform(C, S * F, -S, C * F, -vx, -vy);
  return {
    each(x0, y0, x1, y1, fn) {
      if (hillFlatBox(x0, y0) && hillFlatBox(x1 - 1, y1 - 1) && hillFlatBox(x1 - 1, y0) && hillFlatBox(x0, y1 - 1)) { flatT(); fn(x0, y0, x1, y1); return; }
      const N = HILL_CH;
      for (let cy = Math.floor(y0 / N) * N; cy < y1; cy += N) for (let cx = Math.floor(x0 / N) * N; cx < x1; cx += N) {
        const X0 = Math.max(x0, cx), Y0 = Math.max(y0, cy), X1 = Math.min(x1, cx + N), Y1 = Math.min(y1, cy + N);
        if (X1 <= X0 || Y1 <= Y0) continue;
        const a = gLift(X0, Y0), b = gLift(X1, Y0), c = gLift(X0, Y1), d = gLift(X1, Y1);
        const Lx = (b - a + d - c) / (2 * (X1 - X0)), Ly = (c - a + d - b) / (2 * (Y1 - Y0)), Lc = (a + b + c + d) / 4;
        g.setTransform(C, S * F - Lx, -S, C * F - Ly, -vx, -vy - Lc + Lx * (X0 + X1) / 2 + Ly * (Y0 + Y1) / 2);
        fn(X0, Y0, X1, Y1);
      }
      flatT();
    },
  };
}
// The soft patches of the ground (lookGround), for one chunk of it (drawn with the ground's warp, after its tile).
function hillPatch(g, x0, y0, x1, y1) {
  if (!LOOK.ground || !patchPic) return;
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
function drawLook(g, vx, vy, vw, vh, k, t) {
  const W = g.canvas.width, H = g.canvas.height;
  g.save();
  g.globalCompositeOperation = 'saturation'; g.fillStyle = 'rgba(128,128,128,0.26)'; g.fillRect(0, 0, W, H);   // muted colours
  g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgb(218,226,228)'; g.fillRect(0, 0, W, H);           // a cool grade
  const sun = g.createLinearGradient(0, 0, W * 0.8, H * 1.2);                                                    // low sun, upper left
  sun.addColorStop(0, 'rgba(255,205,140,0.6)'); sun.addColorStop(0.45, 'rgba(128,128,128,0)'); sun.addColorStop(1, 'rgba(10,25,60,0.4)');
  g.globalCompositeOperation = 'soft-light'; g.fillStyle = sun; g.fillRect(0, 0, W, H);
  cloudShadows(g, vx, vy, k, t);
  g.restore();
  if (!lookPics) lookPics = { hole: lookGlowPic('rgba(255,255,255,1)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)'),
    warm: lookGlowPic('rgba(255,190,110,1)', 'rgba(255,120,40,0.5)', 'rgba(255,80,20,0)'),
    blue: lookGlowPic('rgba(170,210,255,1)', 'rgba(90,150,255,0.5)', 'rgba(60,100,255,0)'), sh: mkCanvas(1, 1), gl: mkCanvas(1, 1) };
  const L = lookPics, lights = [];
  const near = (x, y, m) => x > vx - m && y > vy - m && x < vx + vw + m && y < vy + vh + m;
  const add = (x, y, r, a, col, h) => { [x, y] = toView(...liftPt(x, y, (h || 0) + gLift(x, y))); if (near(x, y, r)) lights.push([x, y, r, Math.max(0, Math.min(1, a)), col]); };
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
  // A light shade over everything with soft holes where things glow (at half size, stretched up smoothly), then the
  // glow itself added once: each spot as bright as its brightest light ('lighten'), so overlapping blasts never pile
  // up into a white blob (owner, after the first video).
  const R = 0.5, sW = Math.max(1, Math.round(W * R)), sH = Math.max(1, Math.round(H * R)), nk = k * R;
  for (const c of [L.sh, L.gl]) if (c.width !== sW || c.height !== sH) { c.width = sW; c.height = sH; }
  const n = L.sh.getContext('2d');
  n.globalCompositeOperation = 'source-over'; n.clearRect(0, 0, sW, sH);
  n.fillStyle = 'rgba(8,16,30,0.22)'; n.fillRect(0, 0, sW, sH);
  n.globalCompositeOperation = 'destination-out';
  for (const [x, y, r, a] of lights) { n.globalAlpha = a; n.drawImage(L.hole, (x - vx - r) * nk, (y - vy - r) * nk, r * 2 * nk, r * 2 * nk); }
  n.globalAlpha = 1; n.globalCompositeOperation = 'source-over';
  const q = L.gl.getContext('2d'); q.clearRect(0, 0, sW, sH); q.globalCompositeOperation = 'lighten';
  for (const [x, y, r, a, col] of lights) { q.globalAlpha = a; q.drawImage(L[col], (x - vx - r * 0.75) * nk, (y - vy - r * 0.75) * nk, r * 1.5 * nk, r * 1.5 * nk); }
  q.globalAlpha = 1; q.globalCompositeOperation = 'source-over';
  g.save(); g.imageSmoothingEnabled = true; g.drawImage(L.sh, 0, 0, W, H);
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.3; g.drawImage(L.gl, 0, 0, W, H);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  if (LOOK.lamps) drawLamps(g, vx, vy, k, t, near);
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);   // vignette
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,4,12,0.42)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
  g.restore();
}
// Cloud shadows: a tileable soft noise (4 octaves) cut into cloud shapes, fixed to the ground (the view plane) and
// drifting with the wind; multiplied over the picture, so they darken without hiding anything.
let cloudPic = null;
function cloudShadows(g, vx, vy, k, t) {
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
  const S = 7, dx = t * 9, dy = t * 3.5;   // a noise pixel is 7 view pixels (clouds a few hundred across); drift, view px a second
  const pat = g.createPattern(cloudPic, 'repeat');
  pat.setTransform(new DOMMatrix([S * k, 0, 0, S * k * 0.75, (-vx + dx) * k, (-vy + dy) * k]));
  g.save(); g.imageSmoothingEnabled = true; g.globalCompositeOperation = 'multiply'; g.fillStyle = pat; g.fillRect(0, 0, g.canvas.width, g.canvas.height); g.restore();
}

// ---- Cliffs: the rock ridges stand up -----------------------------------------------------------------------------
// The ridge's own height field (art.js paintCliffs, the same noise and seed, so the crag stands exactly on its painted
// foot), raised CLIFF_UP times and drawn as a voxel-space picture per cell: every world pixel a column from the ground
// to its height, back to front, shaded by its slope (light from the upper left of the screen, as the grade's sun), with
// rock strata and darker toward the foot. Pictures are made once per cell (a few a frame) and sorted in with the units
// by the cell's middle, so a tank behind a ridge goes behind it.
const CLIFF_UP = 1, CLIFF_TOP = 34;   // world units of height (x VK on the screen: about 28 px)
let cliffLook = null;
function cliffLookFor() {
  if (cliffLook && cliffLook.g === G) return cliffLook;
  // paintCliffs' own mound sum with its ragged edge (where it passes 0.5 the painted ridge begins), cut from its source.
  const src = paintCliffs.toString(), cut = src.indexOf('const q = (o - 0.5) / 0.5;');
  const mk = (0, eval)('(' + src.slice(0, cut) + 'return o; }; return height; })');
  const cells = G.cliff ? cliffCells(G.terr, G.cliff) : new Map(), mound = mk(null, cells, groundSeed(G), false);
  // A plateau: from the painted foot the rock rises steeply to a flat top CLIFF_TOP high, with a little roughness.
  const height = (x, y) => {
    const q = mound(x, y) - 0.5;
    if (q <= 0) return 0;
    const s = Math.min(1, q / 0.22), l = cells.get(Math.floor(y / CELL) * MAP + Math.floor(x / CELL));
    const big = Math.min(1, 0.3 + (l ? l.length / 2 : 0) / 9);   // a lone rock stays a boulder; a ridge rises full height
    return CLIFF_TOP * big * s * s * (3 - 2 * s) + (hash3(x >> 2, y >> 2, 21) - 0.5) * 1.5;
  };
  cliffLook = { g: G, cells, height, pics: new Map(), snow: mapTheme(G.mapId) === 'snow' };
  return cliffLook;
}
function cliffPic(L, c) {
  const cx = c % MAP, cy = (c / MAP) | 0, mx = (cx + 0.5) * CELL, my = (cy + 0.5) * CELL, Hf = L.height;
  // The height over the cell and a margin, smoothed (5 x 5): raised CLIFF_UP times, the ridge's fine noise made the tops
  // bumpy and streaked.
  const B = 4, N = CELL + 2 * B, raw = new Float32Array(N * N), sm = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) raw[j * N + i] = Hf(cx * CELL - B + i + 0.5, cy * CELL - B + j + 0.5);
  for (let j = 2; j < N - 2; j++) for (let i = 2; i < N - 2; i++) {
    let a = 0; for (let v = -2; v <= 2; v++) for (let u = -2; u <= 2; u++) a += raw[(j + v) * N + i + u];
    sm[j * N + i] = raw[j * N + i] > 0.4 ? a / 25 : 0;
  }
  const at = (x, y) => sm[(y - cy * CELL + B) * N + x - cx * CELL + B];
  const pts = [];
  let top = 0;
  for (let y = cy * CELL; y < (cy + 1) * CELL; y++) for (let x = cx * CELL; x < (cx + 1) * CELL; x++) {
    const h = at(x, y);
    if (h <= 0.4) continue;
    const gx = at(x + 1, y) - at(x - 1, y), gy = at(x, y + 1) - at(x, y - 1);
    pts.push([x, y, h, gx, gy]); top = Math.max(top, h);
  }
  if (!pts.length) return null;
  const up = top * CLIFF_UP * VK;
  const cs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => toView(a * CELL / 2, b * CELL / 2));
  const X0 = Math.floor(Math.min(...cs.map((p) => p[0]))) - 2, X1 = Math.ceil(Math.max(...cs.map((p) => p[0]))) + 2;
  const Y0 = Math.floor(Math.min(...cs.map((p) => p[1])) - up) - 2, Y1 = Math.ceil(Math.max(...cs.map((p) => p[1]))) + 2;
  const W = X1 - X0, H = Y1 - Y0, pic = mkCanvas(W, H), ctx = pic.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
  // Its shadow on the ground, away from the sun (to the screen's right and a little down), drawn under everything.
  const SL = 1.1, [sdx, sdy] = toView(0.8, -0.3), sx1 = X1 + Math.ceil(top * CLIFF_UP * SL * sdx) + 2, sy1 = Y1 + Math.ceil(top * CLIFF_UP * SL * Math.max(0, sdy)) + 2;
  const SW = sx1 - X0, SH = sy1 - Y0, sm2 = new Uint8Array(SW * SH);
  const ROCK = L.snow ? [[40, 42, 50], [58, 60, 68], [80, 82, 92], [104, 106, 116], [150, 156, 170], [206, 214, 226], [236, 240, 247]]
    : [[44, 34, 26], [62, 49, 36], [84, 67, 49], [108, 88, 65], [134, 112, 84], [162, 139, 106], [190, 168, 132]];
  const Lx = -0.8, Ly = 0.3, Lz = 0.6, Ll = Math.hypot(Lx, Ly, Lz);   // towards the sun: the screen's upper left
  pts.sort((a, b) => viewDepth(a[0], a[1]) - viewDepth(b[0], b[1]));   // back to front
  for (const [x, y, h, gx, gy] of pts) {
    const [vX, vY] = toView(x + 0.5 - mx, y + 0.5 - my), hz = h * CLIFF_UP;
    const nx = -gx * 0.5 * CLIFF_UP, ny = -gy * 0.5 * CLIFF_UP, nl = Math.hypot(nx, ny, 1);
    const lit = (nx * Lx + ny * Ly + Lz) / nl / Ll, steep = 1 - 1 / nl;
    const sp = hash3(x, y, 11);
    for (let st = 0, len = hz * SL; st <= len; st += 1) {
      const qx = Math.round(vX - X0 + sdx * st), qy = Math.round(vY - Y0 + sdy * st);
      if (qx >= 0 && qx < SW - 1 && qy >= 0 && qy < SH) sm2[qy * SW + qx] = sm2[qy * SW + qx + 1] = 1;
    }
    const px0 = Math.round(vX - X0 - 0.5), yTop = Math.round(vY - hz * VK - Y0), yBot = Math.round(vY - Y0);
    for (let py = yTop; py <= yBot; py++) {
      const z = hz - (py - yTop) / VK;   // the height of this pixel of the column
      let v = 1.2 + lit * 4.4 + (sp - 0.5) * 0.7 + (z / CLIFF_TOP) * 0.8;
      if (steep > 0.45 && ((z + hash3(x >> 3, y >> 3, 5) * 3) % 8) < 1.2) v -= 0.8;   // strata on the faces
      if (z < 4) v -= (4 - z) * 0.3;                                                     // darker at the foot
      if (py === yTop && steep < 0.5) v += 0.4;                                          // a lit lip on flat tops
      let t = ROCK[Math.max(0, Math.min(ROCK.length - 1, Math.floor(v)))];
      if (py - yTop < 2 && steep < 0.55) {   // the top: grass and moss over the rock, lit by the sun
        const gr = L.snow ? [214, 220, 230] : [64, 84, 40], k = 0.75 + lit * 0.45 + (hash3(x, y, 13) - 0.5) * 0.25, m = Math.min(1, (0.55 - steep) * 3);
        t = [t[0] + (gr[0] * k - t[0]) * m, t[1] + (gr[1] * k - t[1]) * m, t[2] + (gr[2] * k - t[2]) * m];
      }
      for (const px of [px0, px0 + 1]) {
        if (px < 0 || px >= W || py < 0 || py >= H) continue;
        const i = (py * W + px) * 4; d[i] = t[0]; d[i + 1] = t[1]; d[i + 2] = t[2]; d[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const shp = mkCanvas(SW, SH), sc = shp.getContext('2d'), si = sc.createImageData(SW, SH);
  for (let i = 0; i < sm2.length; i++) if (sm2[i]) { si.data[i * 4 + 1] = 6; si.data[i * 4 + 2] = 18; si.data[i * 4 + 3] = 255; }
  sc.putImageData(si, 0, 0);
  return { c: pic, sh: shp, X0, Y0 };
}
// From ui.js draw: the cliff cells round the screen as things to sort in with the units.
function cliffItems(list, x0, y0, x1, y1, shows) {
  lookGround(lookView, x0, y0, x1, y1);   // (the ground's patches and tracks first: under the cliffs' shadows)
  if (!LOOK.cliffs || !G.cliff) return;
  const L = cliffLookFor();
  let made = 0;
  for (const c of L.cells.keys()) {
    const x = (c % MAP + 0.5) * CELL, y = (((c / MAP) | 0) + 0.5) * CELL;
    if (x < x0 - 40 || x > x1 + 40 || y < y0 - 40 || y > y1 + 120 || !shows(x, y) || !G.seen[c]) continue;
    let p = L.pics.get(c);
    if (p === undefined) { if (made++ > 8) continue; p = cliffPic(L, c); L.pics.set(c, p); }
    if (p) list.push({ kind: 'cliff', x, y, p });
  }
  // The shadows now, on the ground under everything (the list is drawn after).
  for (const e of list) if (e.kind === 'cliff') onHill(lookView, e.x, e.y, () => cliffShadow(lookView, e));
}
let lookView = null;   // the view canvas's context, set by ui.js before cliffItems
function cliffShadow(g, e) {
  if (!g) return;
  const m = g.getTransform(), up = g.upright;
  const sx = m.a * e.x + m.c * e.y + m.e, sy = m.b * e.x + m.d * e.y + m.f;
  g.upright = false; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 0.45;
  g.drawImage(e.p.sh, Math.round(sx + e.p.X0), Math.round(sy + e.p.Y0));
  g.globalAlpha = 1; g.setTransform(m); g.upright = up;
}
function drawCliff(g, e) {
  const m = g.getTransform(), up = g.upright;
  const sx = m.a * e.x + m.c * e.y + m.e, sy = m.b * e.x + m.d * e.y + m.f;
  g.upright = false; g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(e.p.c, Math.round(sx + e.p.X0), Math.round(sy + e.p.Y0));
  g.setTransform(m); g.upright = up;
}

// ---- Concrete under structures ------------------------------------------------------------------------------------
// In place of bibDecal's trodden dirt: square slabs on a world grid (CON_SLAB px, so neighbouring pads meet without a
// seam), each its own shade, with dark joints, fine grit, oil stains and the odd crack; past the footprint a ring of
// slabs, some broken off at the outer edge, then a little scattered dirt. Every pixel depends only on its world
// position (hash3), so overlapping pads and tile edges match (art.js "The ground in tiles").
const CON_SLAB = 12, CON_M = 12;
function concreteDecal(tg, x, y, w, h, seed) {
  const snow = snowy();
  const M = CON_M, X0 = x - M - 6, Y0 = y - M - 6, W = w + 2 * M + 12, H = h + 2 * M + 12;
  const c = mkCanvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  const sx0 = Math.floor((x - M) / CON_SLAB), sy0 = Math.floor((y - M) / CON_SLAB), sx1 = Math.floor((x + w + M - 1) / CON_SLAB), sy1 = Math.floor((y + h + M - 1) / CON_SLAB);
  const inner = (i, j) => (i + 0.5) * CON_SLAB > x - 2 && (i + 0.5) * CON_SLAB < x + w + 2 && (j + 0.5) * CON_SLAB > y - 2 && (j + 0.5) * CON_SLAB < y + h + 2;
  const slabOn = (i, j) => i >= sx0 && i <= sx1 && j >= sy0 && j <= sy1 && (inner(i, j) || hash3(i, j, 31) > 0.22);
  const base = snow ? 150 : 122;
  for (let py = Y0; py < Y0 + H; py++) for (let px = X0; px < X0 + W; px++) {
    const q = ((py - Y0) * W + px - X0) * 4, i = Math.floor(px / CON_SLAB), j = Math.floor(py / CON_SLAB);
    if (!slabOn(i, j)) {   // a little dirt kicked over the ground round the edge
      const dx = Math.max(x - M - px, 0, px - (x + w + M - 1)), dy = Math.max(y - M - py, 0, py - (y + h + M - 1));
      if (hash3(px, py, 41) < 0.45 - Math.hypot(dx, dy) * 0.08) { const t = 70 + hash3(px, py, 43) * 30; d[q] = t; d[q + 1] = t * 0.86; d[q + 2] = t * 0.66; d[q + 3] = 255; }
      continue;
    }
    const lx = px - i * CON_SLAB, ly = py - j * CON_SLAB;
    let v = base + (hash3(i, j, 33) - 0.5) * 16 + (hash3(px, py, 35) - 0.5) * 9;   // the slab's shade, grit
    if (lx === 0 || ly === 0) v -= 26; else if (lx === 1 || ly === 1) v += 6;        // joint, and its lit edge
    const st = hash3(px >> 2, py >> 2, 37) * 0.5 + hash3(px >> 3, py >> 3, 39) * 0.5;  // oil stains
    if (st > 0.78) v -= (st - 0.78) * 120;
    if (hash3(i, j, 45) > 0.86 && Math.abs(lx - ly - (hash3(i, j, 47) - 0.5) * 6) < 0.8) v -= 30;   // a crack across the slab
    const blue = snow ? 6 : 4;
    d[q] = v; d[q + 1] = v + 1; d[q + 2] = v + blue; d[q + 3] = 255;
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
function lookGround(g, x0, y0, x1, y1) {
  if (!g) return;
  if (!LOOK.ground) { drawWater(g, x0, y0, x1, y1); return; }
  if (!patchPic) {
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
  }
  const pat = g.createPattern(patchPic, 'repeat');
  pat.setTransform(new DOMMatrix([12, 0, 0, 12, 0, 0]));
  if (!(LOOK.hills && G.hgt)) {   // (raised ground: drawn with it, chunk by chunk: hillPatch)
    g.save(); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = 1; g.imageSmoothingEnabled = true; g.fillStyle = pat;
    g.fillRect(Math.max(0, x0), Math.max(0, y0), Math.min(WORLD, x1) - Math.max(0, x0), Math.min(WORLD, y1) - Math.max(0, y0)); g.restore();
  }
  drawWater(g, x0, y0, x1, y1);
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
  const snow = snowy(), B = 5, paths = Array.from({ length: B }, () => new Path2D());
  for (const [x, y, a, w, t0] of T.list) {
    if (x < x0 - 10 || x > x1 + 10 || y < y0 - 10 || y > y1 + 10) continue;
    const f = 1 - (G.t - t0) / TRACK_LIFE, b = Math.min(B - 1, Math.floor(f * B)), c = Math.cos(a), s = Math.sin(a), P = paths[b];
    const [hx, hy] = hillPt(x, y), lx = hx - x, ly = hy - y;   // (on the raised ground)
    for (const o of [-w, w]) { const px = x - s * o + lx, py = y + c * o + ly; P.moveTo(px - c * 3, py - s * 3); P.lineTo(px + c * 3, py + s * 3); }
  }
  g.save(); g.lineWidth = 2.2; g.lineCap = 'butt';
  for (let b = 0; b < B; b++) { g.strokeStyle = snow ? `rgba(60,70,92,${(0.18 + b * 0.12).toFixed(2)})` : `rgba(22,17,10,${(0.2 + b * 0.13).toFixed(2)})`; g.stroke(paths[b]); }
  g.restore();
}

// The Allied AA Gun's searchlight, the one light a defence has (owner), and only at night (ui.js, after drawNight on day/night
// maps; night 0..1 from dayNight): a beam up into the sky, sweeping slowly overhead, locked on the nearest enemy aircraft it can
// see within AA_LOOK (owner: "pointing up in the air looking for planes").
function drawSkyBeams(g, vx, vy, k, t, night) {
  if (!LOOK.lamps || night < 0.05) return;
  if (!lampPics) drawLamps.init();
  const P = lampPics, scr = (x, y, h) => { const [X, Y] = toView(...liftPt(x, y, h + gLift(x, y))); return [(X - vx) * k, (Y - vy) * k]; };
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const e of G.entities) {
    if (!e.alive || e.type !== 'aagun' || e.buildT < 1 || !G.seen[idx(e.cx, e.cy)]) continue;
    const mx = (e.cx + e.w / 2) * CELL, my = (e.cy + e.h / 2) * CELL, [sx, sy] = scr(mx, my, Math.max(8, structLamps(e.type, e.faction).maxZ) * VK);
    if (sx < -400 || sy < -400 || sx > g.canvas.width + 400 || sy > g.canvas.height + 600) continue;
    let tx, ty, best = AA_LOOK;
    for (const u of G.entities) {
      if (!u.alive || u.cls !== 'air' || !(u.alt > 4) || alliedSides(u.team, e.team) || !G.seen[cellOfPos(u.x, u.y)]) continue;
      const d = Math.hypot(u.x - mx, u.y - my);
      if (d < best) { best = d; [tx, ty] = scr(u.x, u.y, u.alt); }
    }
    if (tx === undefined) { const a = -Math.PI / 2 + Math.sin(t * 0.5 + e.id * 1.3) * 0.55 + Math.sin(t * 0.23 + e.id) * 0.2; tx = sx + Math.cos(a) * 190 * k; ty = sy + Math.sin(a) * 190 * k; }
    else { tx += (tx - sx) * 0.25; ty += (ty - sy) * 0.25; }   // on past the plane
    const dx = tx - sx, dy = ty - sy, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, W0 = 1.5 * k, W1 = 14 * k;
    const gr = g.createLinearGradient(sx, sy, tx, ty); gr.addColorStop(0, `rgba(235,245,255,${(0.36 * night).toFixed(3)})`); gr.addColorStop(1, 'rgba(235,245,255,0)');
    g.globalAlpha = 1; g.fillStyle = gr; g.beginPath();
    g.moveTo(sx + nx * W0, sy + ny * W0); g.lineTo(tx + nx * W1, ty + ny * W1); g.lineTo(tx - nx * W1, ty - ny * W1); g.lineTo(sx - nx * W0, sy - ny * W0); g.closePath(); g.fill();
    g.globalAlpha = 0.8 * night; g.drawImage(P.beam, sx - 4 * k, sy - 4 * k, 8 * k, 8 * k);   // the lamp itself
  }
  g.restore();
}

var LOOK_SOFT = LOOK.ground;

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
  waterLook = { g: G, wm, sm, any, crest, foam, tmp: mkCanvas(1, 1) };
  return waterLook;
}
function drawWater(g, x0, y0, x1, y1) {
  if (!LOOK.water || snowy()) return;
  const W = waterMasks();
  if (!W.any) return;
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(WORLD, Math.ceil(x1)); y1 = Math.min(WORLD, Math.ceil(y1));
  if (x1 <= x0 || y1 <= y0) return;
  const R = 0.5, tw = Math.ceil((x1 - x0) * R), th = Math.ceil((y1 - y0) * R), T = W.tmp;
  if (T.width < tw || T.height < th) { T.width = Math.max(T.width, tw); T.height = Math.max(T.height, th); }
  const c = T.getContext('2d'), t = (G && G.t) || 0;
  const layer = (pat, sc, dx, dy, alpha) => {
    const P = c.createPattern(pat, 'repeat');
    P.setTransform(new DOMMatrix([sc * R, 0, 0, sc * R, (-x0 + dx) * R, (-y0 + dy) * R]));
    c.globalAlpha = alpha; c.fillStyle = P; c.fillRect(0, 0, tw, th);
  };
  const mask = (m) => { c.globalAlpha = 1; c.globalCompositeOperation = 'destination-in'; c.imageSmoothingEnabled = true;
    c.drawImage(m, x0 / WATER_Q, y0 / WATER_Q, (x1 - x0) / WATER_Q, (y1 - y0) / WATER_Q, 0, 0, (x1 - x0) * R, (y1 - y0) * R); c.globalCompositeOperation = 'source-over'; };
  g.save(); g.imageSmoothingEnabled = true;
  // Ripples.
  c.clearRect(0, 0, tw, th);
  layer(W.crest, 3, t * 7, t * 2.5, 0.8); layer(W.crest, 2.2, -t * 5, t * 4, 0.55);
  mask(W.wm);
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.3; g.drawImage(T, 0, 0, tw, th, x0, y0, x1 - x0, y1 - y0);
  // Foam, swelling and ebbing.
  c.clearRect(0, 0, tw, th);
  layer(W.foam, 1.5, Math.sin(t * 0.7) * 6, t * 3, 1);
  mask(W.sm);
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
