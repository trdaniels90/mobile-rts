'use strict';
// Voxel models for every unit, structure and piece of scenery, plus cached sprite lookups.
// Units face +x; 1 voxel = 1 world pixel; z is height above the ground.

const C = {
  track: '#2a2925', trackHi: '#3b3a34', wheel: '#55554d', gun: '#34362f', steel: '#9ba1a3', metal: '#7b7e78',
  conc: '#8f8d84', concD: '#6e6c64', wall: '#d6d3c9', wallD: '#b9b6ac', bib: '#6e6352', bibD: '#584e40', asphalt: '#4b4b46', glass: '#35505f', glow: '#ffe9a0',
  sand: '#ad9466', sandD: '#8a744c', olive: '#5a6238', oliveD: '#454b2b', skin: '#c38d66', brick: '#8b4535',
  yellow: '#d0a426', black: '#1c1c1a', copper: '#b4692a', white: '#e4e2d8', red: '#b8302a', tan: '#b5a26c',
  leaf: ['#1d2c13', '#26391a', '#304822', '#3c592a'], pine: ['#18291a', '#1f3420', '#294228'], bark: '#4a3420',
  rock: ['#6d685e', '#7d786c', '#5c584f'], ore: ['#b48a1c', '#d2a62a', '#e8c24a', '#9a7414'],
};
const BURNT = { key: 'burnt', main: '#3b3631', light: '#4b453d', dark: '#26231f', deep: '#171512' };
// `drawVar` is 1 while drawing a teammate that shares a faction with an earlier teammate: it gets the faction's
// alternate colours (and its own sprite caches, through the palette's key).
let drawVar = 0;
function palFor(faction) {
  const f = FACTIONS[faction], alt = drawVar && f.alt, p = alt || f.pal;
  p.key = p.key || (alt ? faction + '2' : faction);
  return p;
}

const modelCache = new Map();
function model(key, build) {
  let m = modelCache.get(key);
  if (!m) { m = build(); modelCache.set(key, m); }
  return m;
}
const spriteCache2 = new Map();
function sprite(mkey, build, angle, fkey, opts) {
  const k = mkey + '|' + fkey;
  let s = spriteCache2.get(k);
  if (!s) { s = renderVox(model(mkey, build), angle, opts); spriteCache2.set(k, s); }
  return s;
}
function facingSprite(mkey, build, angle, n, opts) {
  const f = facingIndex(angle, n || FACINGS);
  return sprite(mkey, build, f * Math.PI * 2 / (n || FACINGS), f, opts);
}

// Concrete foundation with expansion joints.
// Gravel-and-concrete foundation ("bib") under a structure.
function slabV(m, x0, y0, x1, y1, col, h) {
  m.box(x0, y0, 0, x1, y1, h || 1, col || C.bib, M_ROUGH);
  m.paintTop(x0, y0, x1, y1, (x, y) => {
    const n = hash3(x, y, 7);
    if (!col && ((x - x0) % 12 === 0 || (y - y0) % 12 === 0)) return C.bibD;
    if (n > 0.86) return col ? undefined : '#857a66';
    if (n < 0.1) return col ? undefined : '#4b4236';
  });
}
function shadeInt(hex, k) {
  const c = rgbInt(hex), r = Math.min(255, ((c >> 16) & 255) * k), g = Math.min(255, ((c >> 8) & 255) * k), b = Math.min(255, (c & 255) * k);
  return (r << 16) | (g << 8) | b;
}
function hazardV(m, x0, y0, z0, x1, y1, z1) {
  m.box(x0, y0, z0, x1, y1, z1, C.yellow, M_MATTE);
  m.paint(x0, y0, z0, x1, y1, z1, (x, y, z) => ((x + y + z) >> 1) % 2 ? C.black : undefined);
}
function sandbagsV(m, x0, y0, x1, y1, h) {
  const ring = (x, y) => x < x0 + 3 || y < y0 + 3 || x >= x1 - 3 || y >= y1 - 3;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (ring(x, y)) m.box(x, y, 0, x + 1, y + 1, h, C.sand, M_ROUGH);
  m.paint(x0, y0, 0, x1, y1, h, (x, y, z) => ((x + (z % 2) * 2) % 4 === 0 || (y + (z % 2) * 2) % 4 === 0) ? C.sandD : undefined);
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------
// Soviet Heavy Tank, copied from the Red Alert original's look: a bright red slab of a hull with the
// tracks barely showing, a wide low turret with two dark hatches, a white aerial at the rear right and
// two thick black guns side by side.
const HEAVY_RED = { key: 'soviets', main: '#c9170d', light: '#f0604a', dark: '#8c0d08', deep: '#2b0604' };
// BLENDER:htank begin
function heavyHull(pal, s) {
  const P = pal.key === 'soviets' ? HEAVY_RED : pal;
  const m = new VModel(-15, -10, 14, 11, 8);
  m.box(-13, -8, 0, 9, -6, 2, '#1c1a17', M_ROUGH);
  m.box(-13, 6, 0, 9, 8, 2, '#1c1a17', M_ROUGH);
  m.box(-14, -8, 2, 10, 8, 4, P.main, M_METAL);
  m.box(10, -7, 2, 11, 7, 4, P.main, M_METAL);
  m.box(-14, -8, 4, 10, -7, 5, P.main, M_METAL);
  m.box(-14, -7, 4, 10, -6, 5, P.light, M_METAL);
  m.box(-14, -6, 4, 8, 6, 5, P.main, M_METAL);
  m.box(8, -6, 4, 10, 7, 5, P.light, M_METAL);
  m.box(-14, 6, 4, 8, 7, 5, P.light, M_METAL);
  m.box(-14, 7, 4, 10, 8, 5, P.main, M_METAL);
  m.box(-13, -6, 5, 9, 6, 6, P.light, M_METAL);
  m.box(-13, -3, 6, -10, 3, 7, P.dark, M_METAL);
  return m;
}
function heavyTurret(pal, s) {
  const P = pal.key === 'soviets' ? HEAVY_RED : pal;
  const m = new VModel(-9, -9, 21, 9, 9);
  m.box(-7, -8, 0, 0, 8, 1, P.main, M_METAL);
  m.box(-9, -7, 0, -7, 7, 1, P.main, M_METAL);
  m.box(0, -7, 0, 2, 7, 1, P.main, M_METAL);
  m.box(2, -6, 0, 4, 6, 1, P.main, M_METAL);
  m.box(4, -5, 0, 5, -4, 1, P.main, M_METAL);
  m.box(4, -4, 0, 14, -2, 3, '#16120f', M_METAL);
  m.box(4, -2, 0, 7, -1, 4, '#16120f', M_METAL);
  m.box(12, -2, 0, 14, -1, 3, '#16120f', M_METAL);
  m.box(4, -1, 0, 5, 1, 4, P.main, M_METAL);
  m.box(4, 1, 0, 7, 4, 4, '#16120f', M_METAL);
  m.box(12, 1, 0, 14, 4, 3, '#16120f', M_METAL);
  m.box(7, 2, 0, 12, 4, 3, '#16120f', M_METAL);
  m.box(4, 4, 0, 5, 5, 1, P.main, M_METAL);
  m.box(-8, -7, 1, 1, 7, 3, P.main, M_METAL);
  m.box(-9, -6, 1, -8, 6, 2, P.main, M_METAL);
  m.box(1, -6, 1, 3, 6, 2, P.main, M_METAL);
  m.box(3, -5, 1, 4, 5, 3, P.main, M_METAL);
  m.box(4, -5, 1, 7, -4, 3, '#16120f', M_METAL);
  m.box(12, -5, 1, 14, -4, 2, '#16120f', M_METAL);
  m.box(7, -2, 1, 12, -1, 3, '#16120f', M_METAL);
  m.box(7, 1, 1, 12, 2, 3, '#16120f', M_METAL);
  m.box(4, 4, 1, 7, 5, 3, '#16120f', M_METAL);
  m.box(12, 4, 1, 14, 5, 2, '#16120f', M_METAL);
  m.box(1, -6, 2, 2, 6, 4, P.main, M_METAL);
  m.box(2, -5, 2, 3, 5, 4, P.main, M_METAL);
  m.box(-7, -7, 3, 0, -6, 4, P.main, M_METAL);
  m.box(-8, -6, 3, -4, -2, 4, P.main, M_METAL);
  m.box(-4, -6, 3, -2, -1, 4, '#120403', M_MATTE);
  m.box(-2, -6, 3, 1, -5, 4, P.main, M_METAL);
  m.box(-2, -5, 3, -1, -1, 4, '#120403', M_MATTE);
  m.box(-1, -5, 3, 1, 6, 4, P.main, M_METAL);
  m.box(3, -4, 3, 4, 4, 4, P.main, M_METAL);
  m.box(4, -4, 3, 7, -2, 4, '#16120f', M_METAL);
  m.box(12, -4, 3, 14, -2, 4, '#16120f', M_METAL);
  m.box(-8, -2, 3, -6, 1, 5, P.light, M_METAL);
  m.box(-6, -2, 3, -4, 7, 4, P.main, M_METAL);
  m.box(-4, -1, 3, -1, 1, 4, P.main, M_METAL);
  m.box(-8, 1, 3, -6, 6, 4, P.main, M_METAL);
  m.box(-4, 1, 3, -1, 5, 4, '#120403', M_MATTE);
  m.box(12, 2, 3, 14, 4, 4, '#16120f', M_METAL);
  m.box(-4, 5, 3, -2, 6, 4, '#120403', M_MATTE);
  m.box(-2, 5, 3, -1, 7, 4, P.main, M_METAL);
  m.box(-7, 6, 3, -6, 7, 4, P.main, M_METAL);
  m.box(-4, 6, 3, -2, 7, 4, P.main, M_METAL);
  m.box(-1, 6, 3, 0, 7, 4, P.main, M_METAL);
  m.box(-3, -5, 4, -2, -2, 5, '#120403', M_MATTE);
  m.box(-4, -4, 4, -3, -3, 5, '#120403', M_MATTE);
  m.box(-3, 2, 4, -2, 5, 5, '#120403', M_MATTE);
  m.box(-4, 3, 4, -3, 4, 5, '#120403', M_MATTE);
  m.box(-7, 4, 4, -5, 5, 8, '#f2f0e8', M_MATTE);
  m.box(-7, 4, 8, -5, 5, 9, '#c01810', M_MATTE);
  return m;
}
// BLENDER:htank end
// Soviet Mammoth Tank, copied from the reference: two big rounded red track pods either side of a
// central hull with orange panels, a turret with a round grey emblem hatch, dark missile boxes at its
// sides, two white aerials at the rear and a pair of slim grey guns.
const MAMMOTH_ORANGE = '#cf5a1a', MAMMOTH_GREY = '#3b3e3c';
function mammothHull(pal, s) {
  const P = pal.key === 'soviets' ? HEAVY_RED : pal;
  const hl = Math.floor(s.len / 2), hw = Math.floor(s.wid / 2), pw = 7;
  const m = new VModel(-hl - 2, -hw - 2, hl + 3, hw + 3, 9);
  for (const side of [-1, 1]) {
    const y0 = side < 0 ? -hw : hw - pw, y1 = y0 + pw, out = side < 0 ? -hw : hw - 1, inn = side < 0 ? y1 - 1 : y0;
    m.box(-hl + 1, y0, 0, hl - 1, y1, 2, '#1f0f0c', M_ROUGH);                       // dark underside
    m.box(-hl, y0, 1, hl, y1, 6, P.main, M_METAL);                                   // chunky track pod
    for (const [x0, x1] of [[-hl, -hl + 1], [hl - 1, hl]]) {                          // well rounded ends
      m.clear(x0, y0, 1, x1, y1, 2); m.clear(x0, y0, 4, x1, y1, 6);
    }
    for (const [x0, x1] of [[-hl + 1, -hl + 2], [hl - 2, hl - 1]]) m.clear(x0, y0, 5, x1, y1, 6);
    m.clear(-hl, out, 5, hl, out + 1, 6); m.clear(-hl, out, 1, hl, out + 1, 2);       // rounded outer edges
    m.box(hl - 5, y0 + 1, 5, hl - 2, y1 - 1, 6, P.light, M_METAL);                    // lit front
    m.box(-hl + 2, inn, 5, hl - 2, inn + 1, 6, P.light, M_METAL);                     // lit inner shoulder
    m.paint(-hl, out, 2, hl, out + 1, 5, (x) => ((x + hl) % 5 === 0) ? P.dark : undefined);                // track blocks
    m.paint(-hl, y0, 2, hl, y1, 6, (x, y, z, c) => (hash3(x, y, z) > 0.92 && c === rgbInt(P.main)) ? P.dark : undefined);
  }
  m.box(-hl + 1, -hw + pw, 1, hl - 1, hw - pw, 4, P.main, M_METAL);                  // lower central hull between the pods
  m.box(-hl + 1, -hw + pw, 1, hl - 1, -hw + pw + 1, 4, P.deep, M_METAL); m.box(-hl + 1, hw - pw - 1, 1, hl - 1, hw - pw, 4, P.deep, M_METAL);   // dark gaps beside the pods
  m.box(hl - 6, -3, 1, hl - 1, 3, 4, MAMMOTH_ORANGE, M_METAL);                        // bright orange front plate
  m.box(hl - 6, -3, 3, hl - 1, 3, 4, '#e8832e', M_METAL);
  for (const y of [-2, 1]) m.box(hl - 6, y, 1, hl - 1, y + 1, 3, P.dark);            // seams
  m.box(-hl + 1, -3, 3, -hl + 6, 3, 4, MAMMOTH_ORANGE, M_METAL);                     // rear grille
  for (let x = -hl + 2; x < -hl + 6; x += 2) m.box(x, -3, 3, x + 1, 3, 4, P.dark);
  return m;
}
function mammothTurret(pal, s) {
  const P = pal.key === 'soviets' ? HEAVY_RED : pal;
  const r = 7, w = 6, bl = s.barrel, reach = s.tur + bl;
  const m = new VModel(-r - 4, -11, reach + 4, 11, 12);
  m.box(-r, -w, 0, r, w, 4, P.main, M_METAL);                                        // big turret box
  m.box(-r + 1, -w + 1, 4, r - 1, w - 1, 5, P.main, M_METAL);                        // roof
  for (const [x0, x1] of [[r - 1, r], [-r, -r + 1]]) { m.clear(x0, -w, 0, x1, -w + 1, 4); m.clear(x0, w - 1, 0, x1, w, 4); }
  m.box(r - 2, -w + 1, 0, r, w - 1, 4, P.light, M_METAL);                            // pale front face
  m.box(-r, -w, 3, r, -w + 1, 4, P.light, M_METAL); m.box(-r, w - 1, 3, r, w, 4, P.light, M_METAL);
  for (const sx of [-1, 1]) {                                                        // dark missile boxes at the sides
    const y0 = sx < 0 ? -w - 2 : w, y1 = y0 + 2;
    m.box(-3, y0, 0, 3, y1, 6, MAMMOTH_GREY, M_METAL);
    m.box(-3, y0, 5, 3, y1, 6, '#555957', M_METAL);
  }
  for (const y of [-4.2, 4.2]) m.box(r - 3, y - 0.5, 5, r - 1, y + 0.5, 6, P.light, M_METAL);   // pale studs
  m.cylZ(0, 0, 4, 5, 3.4, '#9a9d9b', M_METAL);                                      // flat silver emblem hatch, set into the roof
  m.cylZ(0, 0, 4, 5, 2.4, '#b4b7b5', M_METAL); m.cylZ(0, 0, 4, 5, 1.3, '#7d807e', M_METAL);
  for (const y of [-4.4, 4.4]) {                                                     // two tall white aerials, red tipped
    m.line(-r + 1, y, 5, -r + 1, y, 11, '#ecebe3'); m.set(-r + 1, y, 11, '#d12a1c'); m.set(-r + 1, y, 10, '#d12a1c');
  }
  for (const y of [-3.8, 3.8]) {                                                     // grey guns on thick bases, well apart
    m.cylX(r - 1, r + 4, y, 2.5, 1.9, '#2f3231', M_METAL);
    m.cylX(r + 3, reach, y, 2.5, 1.2, MAMMOTH_GREY, M_METAL);
    m.cylX(reach - 3, reach, y, 2.5, 1.55, '#25272a', M_METAL);
  }
  return m;
}
// Allied Medium Tank, copied from the reference: a long low pale-silver hull with striped skirt panels,
// dark track ends, a small blue-lilac turret with two round dark hatches, one thin black gun and a
// short aerial at the rear.
const GRIZ = { key: 'allies', main: '#c3cde4', light: '#f1f4fb', dark: '#7b8bb8', deep: '#2b3454', turret: '#8e9bd2', turretHi: '#b7c1ec' };
function grizzlyHull(pal, s) {
  const P = pal.key === 'allies' ? GRIZ : { ...pal, turret: pal.main, turretHi: pal.light };   // wrecks use the burnt palette
  const hl = Math.floor(s.len / 2), hw = Math.floor(s.wid / 2), sk = 3;
  const m = new VModel(-hl - 2, -hw - 2, hl + 3, hw + 3, 9);
  m.box(-hl + 1, -hw, 0, hl - 1, hw, 2, '#1c2033', M_ROUGH);                         // dark underside
  for (const side of [-1, 1]) {                                                       // skirt panels over the tracks
    const y0 = side < 0 ? -hw : hw - sk, y1 = y0 + sk, out = side < 0 ? -hw : hw - 1;
    m.box(-hl, y0, 1, hl, y1, 5, P.main, M_METAL);
    for (let x = -hl + 1; x < hl - 1; x += 4) {                                       // panel stripes
      m.box(x, y0, 4, x + 2, y1, 5, P.light, M_METAL);
      m.box(x + 3, y0, 2, x + 4, y1, 5, P.dark, M_METAL);
    }
    m.box(-hl, out, 1, hl, out + 1, 3, P.dark, M_METAL);                              // shadowed lower skirt
    for (const [x0, x1] of [[-hl, -hl + 2], [hl - 2, hl]]) { m.box(x0, y0, 1, x1, y1, 3, '#1c2033', M_ROUGH); m.box(x0, y0, 3, x1, y1, 5, P.main, M_METAL); }   // dark track ends
  }
  m.box(-hl + 1, -hw + sk, 1, hl - 1, hw - sk, 4, P.main, M_METAL);                   // central hull
  m.box(-hl + 2, -hw + sk, 4, hl - 2, hw - sk, 5, P.light, M_METAL);                  // pale deck
  m.box(hl - 3, -hw + sk, 3, hl - 1, hw - sk, 5, P.light, M_METAL);                   // sloped nose
  m.box(hl - 1, -hw + sk, 2, hl, hw - sk, 4, P.dark, M_METAL);
  for (let x = -hl + 2; x < -hl + 7; x += 2) m.box(x, -2, 5, x + 1, 2, 6, P.dark, M_METAL);   // rear engine vents
  m.paint(-hl, -hw, 2, hl, hw, 6, (x, y, z, c) => (hash3(x, y, z) > 0.95 && c === rgbInt(P.main)) ? P.dark : undefined);
  return m;
}
function grizzlyTurret(pal, s) {
  const P = pal.key === 'allies' ? GRIZ : { ...pal, turret: pal.main, turretHi: pal.light };   // wrecks use the burnt palette
  const r = 5, w = 6, f = 1, rb = 2, reach = s.tur + s.barrel;
  const m = new VModel(-r - rb - 4, -w - 3, reach + 3, w + 3, 11);
  m.box(-r - rb + f, -w, 0, r + f, w, 4, P.turret, M_METAL);                               // low blue-lilac turret
  m.box(-r - rb + 1 + f, -w + 1, 4, r - 1 + f, w - 1, 5, P.turretHi, M_METAL);             // roof
  for (const [x0, x1] of [[r - 1 + f, r + f], [-r - rb + f, -r - rb + 1 + f]]) { m.clear(x0, -w, 0, x1, -w + 1, 4); m.clear(x0, w - 1, 0, x1, w, 4); }
  m.box(r - 1 + f, -3, 0, r + 1 + f, 3, 4, P.dark, M_METAL);                          // gun mantlet
  for (const y of [-3.2, 3.2]) m.cylZ(-2 + f, y, 4, 5, 2.1, '#14172a', M_MATTE);           // two round dark hatches
  m.cylX(r + f, reach, 0, 2, 1.0, '#16182a', M_METAL);                              // thin black gun
  m.cylX(reach - 2, reach, 0, 2, 1.3, '#16182a', M_METAL);
  m.line(-r - rb + 1 + f, w - 1, 4, -r - rb + 1 + f, w - 1, 9, '#1c2033');                      // aerial, rear right
  return m;
}
// BLENDER:ltank begin
function lightTankHull(pal) {
  const m = new VModel(-10, -8, 11, 9, 10);
  m.box(-7, -6, 0, 7, -3, 1, '#2a2925', M_ROUGH);
  m.box(-7, 3, 0, 7, 6, 1, '#2a2925', M_ROUGH);
  m.box(-8, -6, 1, 8, -4, 2, '#2a2925', M_ROUGH);
  m.box(-8, -4, 1, -7, -3, 3, '#2a2925', M_ROUGH);
  m.box(-7, -4, 1, 7, 4, 4, pal.dark, M_METAL);
  m.box(7, -4, 1, 8, -3, 3, '#2a2925', M_ROUGH);
  m.box(-8, 3, 1, -7, 6, 3, '#2a2925', M_ROUGH);
  m.box(7, 3, 1, 8, 6, 3, '#2a2925', M_ROUGH);
  m.box(-7, 4, 1, 7, 6, 2, '#2a2925', M_ROUGH);
  m.box(-8, -6, 2, -7, -4, 4, '#2a2925', M_ROUGH);
  m.box(-7, -6, 2, 7, -5, 3, pal.dark, M_METAL);
  m.box(7, -6, 2, 8, -4, 4, '#2a2925', M_ROUGH);
  m.box(-7, -5, 2, 7, -4, 4, '#2a2925', M_ROUGH);
  m.box(8, -4, 2, 9, 4, 4, pal.dark, M_METAL);
  m.box(-7, 4, 2, 7, 5, 4, '#2a2925', M_ROUGH);
  m.box(-7, 5, 2, 7, 6, 3, pal.dark, M_METAL);
  m.box(-7, -6, 3, -6, -5, 5, pal.main, M_METAL);
  m.box(-6, -6, 3, -5, -5, 5, pal.light, M_METAL);
  m.box(-5, -6, 3, -4, -5, 5, pal.main, M_METAL);
  m.box(-4, -6, 3, -3, -5, 5, pal.light, M_METAL);
  m.box(-3, -6, 3, -2, -5, 5, pal.main, M_METAL);
  m.box(-2, -6, 3, -1, -5, 5, pal.light, M_METAL);
  m.box(-1, -6, 3, 0, -5, 5, pal.main, M_METAL);
  m.box(0, -6, 3, 1, -5, 5, pal.light, M_METAL);
  m.box(1, -6, 3, 2, -5, 5, pal.main, M_METAL);
  m.box(2, -6, 3, 3, -5, 5, pal.light, M_METAL);
  m.box(3, -6, 3, 4, -5, 5, pal.main, M_METAL);
  m.box(4, -6, 3, 5, -5, 5, pal.light, M_METAL);
  m.box(5, -6, 3, 6, -5, 5, pal.main, M_METAL);
  m.box(6, -6, 3, 7, -5, 5, pal.light, M_METAL);
  m.box(-8, 4, 3, -7, 6, 4, '#2a2925', M_ROUGH);
  m.box(7, 4, 3, 8, 6, 4, '#2a2925', M_ROUGH);
  m.box(-7, 5, 3, -6, 6, 5, pal.main, M_METAL);
  m.box(-6, 5, 3, -5, 6, 5, pal.light, M_METAL);
  m.box(-5, 5, 3, -4, 6, 5, pal.main, M_METAL);
  m.box(-4, 5, 3, -3, 6, 5, pal.light, M_METAL);
  m.box(-3, 5, 3, -2, 6, 5, pal.main, M_METAL);
  m.box(-2, 5, 3, -1, 6, 5, pal.light, M_METAL);
  m.box(-1, 5, 3, 0, 6, 5, pal.main, M_METAL);
  m.box(0, 5, 3, 1, 6, 5, pal.light, M_METAL);
  m.box(1, 5, 3, 2, 6, 5, pal.main, M_METAL);
  m.box(2, 5, 3, 3, 6, 5, pal.light, M_METAL);
  m.box(3, 5, 3, 4, 6, 5, pal.main, M_METAL);
  m.box(4, 5, 3, 5, 6, 5, pal.light, M_METAL);
  m.box(5, 5, 3, 6, 6, 5, pal.main, M_METAL);
  m.box(6, 5, 3, 7, 6, 5, pal.light, M_METAL);
  m.box(-8, -6, 4, -7, 6, 5, pal.light, M_METAL);
  m.box(7, -6, 4, 8, -5, 5, pal.main, M_METAL);
  m.box(-7, -5, 4, 9, 5, 5, pal.light, M_METAL);
  m.box(7, 5, 4, 8, 6, 5, pal.main, M_METAL);
  m.box(-8, -5, 5, 8, 5, 6, pal.light, M_METAL);
  return m;
}
function lightTankTurret(pal) {
  const m = new VModel(-6.5, -6.5, 17.5, 6.5, 7);
  m.box(-3, -5, 0, 3, 5, 1, pal.main, M_METAL);
  m.box(-5, -4, 0, -3, 4, 1, pal.main, M_METAL);
  m.box(3, -4, 0, 4, 4, 1, pal.main, M_METAL);
  m.box(4, -3, 0, 5, -1, 1, pal.main, M_METAL);
  m.box(-6, -2, 0, -5, 2, 1, pal.main, M_METAL);
  m.box(4, -1, 0, 5, 1, 3, pal.dark, M_METAL);
  m.box(4, 1, 0, 5, 3, 1, pal.main, M_METAL);
  m.box(-3, -5, 1, 2, -2, 2, pal.main, M_METAL);
  m.box(-4, -4, 1, -3, 4, 2, pal.main, M_METAL);
  m.box(2, -4, 1, 4, -1, 2, pal.main, M_METAL);
  m.box(-5, -3, 1, -4, 3, 2, pal.main, M_METAL);
  m.box(-3, -2, 1, -2, 5, 2, pal.main, M_METAL);
  m.box(-2, -2, 1, 0, 2, 4, pal.light, M_METAL);
  m.box(0, -2, 1, 2, -1, 2, pal.main, M_METAL);
  m.box(4, -2, 1, 6, -1, 3, pal.dark, M_METAL);
  m.box(-6, -1, 1, -5, 1, 2, pal.main, M_METAL);
  m.box(0, -1, 1, 1, 1, 4, pal.light, M_METAL);
  m.box(1, -1, 1, 3, 4, 2, pal.main, M_METAL);
  m.box(3, -1, 1, 4, 1, 3, pal.dark, M_METAL);
  m.box(5, -1, 1, 13, 1, 3, '#2a241f', M_METAL);
  m.box(13, -1, 1, 15, 1, 3, '#1f1a16', M_METAL);
  m.box(0, 1, 1, 1, 5, 2, pal.main, M_METAL);
  m.box(3, 1, 1, 4, 4, 2, pal.main, M_METAL);
  m.box(4, 1, 1, 6, 2, 3, pal.dark, M_METAL);
  m.box(-2, 2, 1, 0, 5, 2, pal.main, M_METAL);
  m.box(1, 4, 1, 2, 5, 2, pal.main, M_METAL);
  m.box(-3, -4, 2, 2, -3, 3, pal.main, M_METAL);
  m.box(-4, -3, 2, -3, -2, 3, pal.main, M_METAL);
  m.box(-3, -3, 2, 2, -2, 3, pal.light, M_METAL);
  m.box(2, -3, 2, 3, -2, 3, pal.main, M_METAL);
  m.box(-5, -2, 2, -4, 2, 3, pal.main, M_METAL);
  m.box(-4, -2, 2, -2, 2, 3, pal.light, M_METAL);
  m.box(0, -2, 2, 3, -1, 3, pal.light, M_METAL);
  m.box(3, -2, 2, 4, -1, 3, pal.main, M_METAL);
  m.box(1, -1, 2, 3, 2, 3, pal.light, M_METAL);
  m.box(0, 1, 2, 1, 3, 3, pal.light, M_METAL);
  m.box(3, 1, 2, 4, 2, 3, pal.main, M_METAL);
  m.box(-4, 2, 2, -3, 3, 3, pal.main, M_METAL);
  m.box(-3, 2, 2, 0, 3, 4, pal.light, M_METAL);
  m.box(1, 2, 2, 2, 3, 3, pal.light, M_METAL);
  m.box(2, 2, 2, 3, 3, 3, pal.main, M_METAL);
  m.box(-3, 3, 2, 2, 4, 3, pal.main, M_METAL);
  m.box(-2, -4, 3, -1, -2, 4, pal.light, M_METAL);
  m.box(-3, -3, 3, -2, -1, 4, pal.light, M_METAL);
  m.box(-1, -3, 3, 0, -2, 4, pal.light, M_METAL);
  m.box(0, -2, 3, 2, -1, 4, pal.main, M_METAL);
  m.box(-3, -1, 3, -2, 1, 4, pal.main, M_METAL);
  m.box(1, -1, 3, 2, 2, 4, pal.main, M_METAL);
  m.box(-3, 1, 3, -2, 2, 4, pal.light, M_METAL);
  m.box(0, 1, 3, 1, 2, 4, pal.main, M_METAL);
  m.box(-2, 3, 3, -1, 4, 4, pal.light, M_METAL);
  m.box(-3, -3, 4, -1, -1, 5, '#15182a', M_MATTE);
  m.box(-2, 1, 4, -1, 3, 5, '#15182a', M_MATTE);
  return m;
}
// BLENDER:ltank end
function tankHull(pal, s) {
  if (s.light) return lightTankHull(pal);
  if (s.grizzly) return grizzlyHull(pal, s);
  if (s.mammoth) return mammothHull(pal, s);
  if (s.heavy) return heavyHull(pal, s);
  const L = s.len, W = s.wid, hl = Math.floor(L / 2), hw = Math.floor(W / 2), tw = Math.max(3, Math.round(W * 0.26));
  const m = new VModel(-hl - 2, -hw - 2, hl + 3 + (s.reach || 0), hw + 3, s.height || 10);   // reach/height: room for a big gun
  for (const side of [-1, 1]) {
    const y0 = side < 0 ? -hw : hw - tw, y1 = y0 + tw;
    m.box(-hl, y0, 0, hl, y1, 4, C.track, M_ROUGH);
    m.clear(-hl, y0, 0, -hl + 1, y1, 1); m.clear(hl - 1, y0, 0, hl, y1, 1);
    for (let x = -hl; x < hl; x += 2) m.box(x, y0, 3, x + 1, y1, 4, C.trackHi, M_ROUGH);
    const outer = side < 0 ? -hw : hw - 1;
    for (let x = -hl + 2; x < hl - 2; x += 4) m.box(x, outer, 1, x + 2, outer + 1, 3, C.wheel, M_METAL);
  }
  m.box(-hl + 1, -hw + tw, 1, hl - 1, hw - tw, 4, pal.dark);
  m.box(-hl + 1, -hw, 4, hl - 1, hw, 6, pal.main, M_METAL);
  m.box(-hl + 2, -hw + 1, 6, hl - 4, hw - 1, 7, pal.main, M_METAL);
  m.clear(hl - 2, -hw, 5, hl - 1, hw, 6);
  for (let y = -hw + 2; y < hw - 2; y += 2) m.box(-hl + 2, y, 6, -hl + 6, y + 1, 7, pal.deep);
  m.box(hl - 3, -hw + 1, 5, hl - 2, -hw + 2, 6, C.glow, M_GLASS); m.box(hl - 3, hw - 2, 5, hl - 2, hw - 1, 6, C.glow, M_GLASS);
  m.box(-hl + 3, -hw, 6, -hl + 8, -hw + 1, 7, C.oliveD); // tool box
  if (s.pods) for (const y of [-hw + 1, hw - 3]) { m.box(-hl + 2, y, 7, -hl + 9, y + 2, 9, C.metal, M_METAL); m.box(-hl + 8, y, 7, -hl + 9, y + 2, 9, C.red); }
  return m;
}
function tankTurret(pal, s) {
  if (s.light) return lightTankTurret(pal);
  if (s.grizzly) return grizzlyTurret(pal, s);
  if (s.mammoth) return mammothTurret(pal, s);
  if (s.heavy) return heavyTurret(pal, s);
  const r = s.tur, bl = s.barrel;
  const m = new VModel(-r - 2, -r - 2, r + bl + 3, r + 2, 7);
  m.cylZ(0, 0, 0, 3, r, pal.main, M_METAL);
  m.cylZ(0, 0, 3, 4, r - 1, pal.main, M_METAL);
  m.box(r - 2, -2, 0, r + 1, 2, 3, pal.dark, M_METAL);
  for (const y of s.twin ? [-1.6, 1.6] : [0]) {
    m.cylX(r, r + bl, y, 1.5, 1, C.gun, M_METAL);
    m.cylX(r + bl - 2, r + bl, y, 1.5, 1.35, C.gun, M_METAL);
  }
  m.cylZ(-1, -1.5, 4, 5, 1.6, pal.light, M_METAL);
  m.line(-r + 1, r - 2, 4, -r + 1, r - 2, 7, C.black);
  return m;
}
// Allied Ranger, drawn as a Humvee: hull and roof-mounted machine gun modelled in Blender, voxelized by tools/blender/ranger.py.
function jeepModel(pal) {
  const m = new VModel(-9, -7, 9, 7, 9);
  m.box(-7, -6, 0, -4, -4, 2, '#2a2925', M_ROUGH);
  m.box(4, -6, 0, 7, -4, 2, '#2a2925', M_ROUGH);
  m.box(-7, 4, 0, -4, 6, 2, '#2a2925', M_ROUGH);
  m.box(4, 4, 0, 7, 6, 2, '#2a2925', M_ROUGH);
  m.box(-8, -6, 1, -7, -4, 2, '#2a2925', M_ROUGH);
  m.box(-4, -6, 1, -3, -4, 2, '#2a2925', M_ROUGH);
  m.box(3, -6, 1, 4, -4, 2, '#2a2925', M_ROUGH);
  m.box(7, -6, 1, 8, -4, 2, '#2a2925', M_ROUGH);
  m.box(-8, 4, 1, -7, 6, 2, '#2a2925', M_ROUGH);
  m.box(-4, 4, 1, -3, 6, 2, '#2a2925', M_ROUGH);
  m.box(3, 4, 1, 4, 6, 2, '#2a2925', M_ROUGH);
  m.box(7, 4, 1, 8, 6, 2, '#2a2925', M_ROUGH);
  m.box(-8, -6, 2, -3, -5, 4, '#2a2925', M_ROUGH);
  m.box(3, -6, 2, 8, -5, 4, '#2a2925', M_ROUGH);
  m.box(-9, -5, 2, 8, 5, 3, pal.dark, M_METAL);
  m.box(-8, 5, 2, -3, 6, 4, '#2a2925', M_ROUGH);
  m.box(3, 5, 2, 8, 6, 4, '#2a2925', M_ROUGH);
  m.box(-9, -5, 3, 8, -2, 4, pal.dark, M_METAL);
  m.box(8, -4, 3, 9, 4, 5, '#34362f', M_METAL);
  m.box(-9, -2, 3, -8, 2, 6, '#2a2925', M_ROUGH);
  m.box(-8, -2, 3, 8, 5, 4, pal.dark, M_METAL);
  m.box(-9, 2, 3, -8, 5, 4, pal.dark, M_METAL);
  m.box(-7, -6, 4, -4, -5, 5, '#2a2925', M_ROUGH);
  m.box(4, -6, 4, 7, -5, 5, '#2a2925', M_ROUGH);
  m.box(-7, -5, 4, -1, 5, 5, pal.dark, M_METAL);
  m.box(-1, -5, 4, 0, -4, 5, '#34362f', M_METAL);
  m.box(0, -5, 4, 3, 5, 5, pal.dark, M_METAL);
  m.box(3, -5, 4, 9, -4, 6, pal.light, M_MATTE);
  m.box(-1, -4, 4, 0, 4, 5, pal.dark, M_METAL);
  m.box(3, -4, 4, 8, 4, 5, pal.light, M_MATTE);
  m.box(-1, 4, 4, 0, 5, 5, '#34362f', M_METAL);
  m.box(4, 4, 4, 7, 6, 5, '#2a2925', M_ROUGH);
  m.box(-7, 5, 4, -4, 6, 5, '#2a2925', M_ROUGH);
  m.box(-7, -5, 5, -5, -4, 6, '#141e27', M_GLASS);
  m.box(-5, -5, 5, -3, 5, 7, pal.main, M_METAL);
  m.box(-3, -5, 5, 3, -4, 7, '#141e27', M_GLASS);
  m.box(-7, -4, 5, -5, 4, 7, pal.main, M_METAL);
  m.box(-3, -4, 5, 3, 4, 7, pal.main, M_METAL);
  m.box(3, -4, 5, 4, 4, 7, '#141e27', M_GLASS);
  m.box(4, -4, 5, 9, -1, 6, pal.light, M_MATTE);
  m.box(4, -1, 5, 5, 4, 6, pal.light, M_MATTE);
  m.box(5, -1, 5, 8, 1, 6, pal.dark, M_MATTE);
  m.box(8, -1, 5, 9, 4, 6, pal.light, M_MATTE);
  m.box(5, 1, 5, 8, 4, 6, pal.light, M_MATTE);
  m.box(-7, 4, 5, -5, 5, 6, '#141e27', M_GLASS);
  m.box(-3, 4, 5, 3, 5, 7, '#141e27', M_GLASS);
  m.box(-7, -5, 6, -5, -4, 7, pal.main, M_METAL);
  m.box(-9, -1, 6, -8, 1, 7, '#2a2925', M_ROUGH);
  m.box(-7, 4, 6, -5, 5, 7, pal.main, M_METAL);
  m.box(-5, -2, 7, -1, 2, 8, '#34362f', M_METAL);
  m.box(-7, 3, 7, -6, 4, 9, '#34362f', M_METAL);
  return m;
}
function mgModel(pal) {
  const m = new VModel(-3, -3, 9, 3, 4);
  m.box(-1, -1, 0, 1, 1, 1, '#34362f', M_METAL);
  m.box(2, -3, 1, 3, 3, 4, pal.main, M_MATTE);
  m.box(-2, -1, 1, 2, 1, 3, '#55574e', M_METAL);
  m.box(3, -1, 1, 5, 1, 4, '#9ba1a3', M_METAL);
  m.box(-1, 1, 1, 1, 3, 2, '#5a6238', M_MATTE);
  m.box(5, -1, 2, 8, 1, 3, '#55574e', M_METAL);
  m.box(8, -1, 2, 9, 1, 3, '#25261f', M_METAL);
  return m;
}
// Mobile Outpost: a six-wheeled truck carrying a command shelter, mast and folded radar dish.
function fobModel(pal) {
  const hl = 11, hw = 7;
  const m = new VModel(-hl - 2, -hw - 2, hl + 3, hw + 3, 16);
  for (const x of [-8, -3, 6]) for (const [y0, y1] of [[-hw, -hw + 3], [hw - 3, hw]]) m.cylY(y0, y1, x, 2.2, 2.2, C.track, M_ROUGH);
  m.box(-hl, -hw + 1, 2, hl, hw - 1, 4, C.metal, M_METAL);
  m.box(5, -hw, 4, hl, hw, 10, pal.main, M_METAL);                    // cab
  m.box(hl - 1, -hw + 1, 6, hl, hw - 1, 9, C.glass, M_GLASS);
  m.box(5, -hw, 9, hl, hw, 10, pal.dark, M_METAL);
  m.box(hl - 1, -hw + 1, 4, hl, -hw + 2, 5, C.glow, M_GLASS); m.box(hl - 1, hw - 2, 4, hl, hw - 1, 5, C.glow, M_GLASS);
  m.box(-hl, -hw, 4, 4, hw, 11, C.olive, M_MATTE);                     // shelter
  m.paint(-hl, -hw, 4, 4, hw, 11, (x, y, z) => (x % 5 === 0 || z === 10) ? C.oliveD : undefined);
  m.box(-hl + 2, -hw, 6, -hl + 6, -hw + 1, 9, pal.main);               // side markings
  m.line(-hl + 2, hw - 2, 11, -hl + 2, hw - 2, 16, C.steel, M_METAL);  // mast
  m.cylZ(-3, 0, 11, 12, 3.5, C.steel, M_METAL);                        // folded dish
  m.box(-hl + 1, -2, 11, -hl + 4, 2, 12, '#5d5e58', M_METAL);
  return m;
}
// Mobile Construction Yard: a long six-wheeled carrier with the yard folded on its back: a crane
// laid flat along the bed, a stack of wall panels and the control cabin.
function mcvModel(pal) {
  const hl = 16, hw = 9;
  const m = new VModel(-hl - 2, -hw - 2, hl + 3, hw + 3, 20);
  for (const x of [-12, -6, 0, 10]) for (const [y0, y1] of [[-hw, -hw + 3], [hw - 3, hw]]) m.cylY(y0, y1, x, 2.6, 2.6, C.track, M_ROUGH);
  m.box(-hl, -hw + 1, 2, hl, hw - 1, 4, C.metal, M_METAL);              // chassis
  m.box(8, -hw, 4, hl, hw, 12, pal.main, M_METAL);                      // cab
  m.box(hl - 1, -hw + 1, 8, hl, hw - 1, 11, C.glass, M_GLASS);
  m.box(8, -hw, 11, hl, hw, 12, pal.dark, M_METAL);
  m.box(hl - 1, -hw + 1, 5, hl, -hw + 2, 6, C.glow, M_GLASS); m.box(hl - 1, hw - 2, 5, hl, hw - 1, 6, C.glow, M_GLASS);
  m.box(-hl, -hw, 4, 7, hw, 13, C.wall, M_MATTE);                       // the yard, folded into a container
  m.paint(-hl, -hw, 4, 7, hw, 13, (x, y, z) => (x % 5 === 0 && z < 12) ? C.wallD : undefined);
  m.box(-hl, -hw, 13, 7, hw, 14, pal.main, M_METAL);                    // roof in the side's colour
  m.paint(-hl, -hw, 13, 7, hw, 14, (x, y) => (y === -hw || y === hw - 1) ? pal.dark : undefined);
  hazardV(m, -hl, -hw, 4, -hl + 1, hw, 6);                              // tail stripes
  m.box(2, -2, 14, 6, 2, 17, C.yellow, M_METAL);                        // crane turret and boom, laid along the roof
  m.box(-hl + 2, -1, 15, 2, 1, 16, C.yellow, M_METAL);
  m.box(-hl + 2, -1, 14, -hl + 3, 1, 15, C.black);
  return m;
}
// Ore Truck: an armoured four-wheeler with big knobbly tyres, a boxy cab behind a short hood, and a domed
// ore bin on the bed that is filled with ore when the truck carries a load. Same footprint as before.
function harvModel(pal, loaded) {
  const hl = 12, hw = 7;
  const m = new VModel(-hl - 2, -hw - 2, hl + 3, hw + 3, 14);
  // Wheels: two axles, tyres with a lighter hub and a mudguard over each
  for (const x of [-6.5, 6.5]) for (const y0 of [-hw, hw - 2.5]) {
    m.cylY(y0, y0 + 2.5, x, 3.4, 3.4, C.track, M_ROUGH);
    m.cylY(y0 < 0 ? y0 : y0 + 1.5, y0 < 0 ? y0 + 1 : y0 + 2.5, x, 3.4, 1.7, C.wheel, M_METAL);
    m.box(x - 4.5, y0, 6.6, x + 4.5, y0 + 2.5, 7.4, pal.dark, M_METAL);
  }
  m.box(-hl, -hw + 2.5, 3, hl, hw - 2.5, 5, C.metal, M_METAL);                      // chassis
  m.box(-hl, -hw + 1, 4, hl, hw - 1, 6, pal.dark, M_METAL);                          // running board
  // Hood and bumper
  m.box(8, -hw + 1, 5, hl - 1, hw - 1, 9, pal.main, M_METAL);
  m.box(hl - 1, -hw + 1, 4, hl, hw - 1, 8, pal.dark, M_METAL);                       // grille
  m.paint(hl - 1, -hw + 1, 4, hl, hw - 1, 8, (x, y, z) => y % 2 === 0 ? C.black : undefined);
  hazardV(m, hl - 1, -hw, 3, hl, hw, 5);                                             // bumper stripes
  m.box(hl - 1, -hw + 1, 6, hl, -hw + 2, 7, C.glow, M_GLASS); m.box(hl - 1, hw - 2, 6, hl, hw - 1, 7, C.glow, M_GLASS);
  // Armoured cab
  m.box(1, -hw, 5, 8, hw, 12, pal.main, M_METAL);
  m.box(7, -hw + 1, 8, 8, hw - 1, 11, C.glass, M_GLASS);                             // windscreen
  m.box(2, -hw, 8, 6, -hw + 1, 11, C.glass, M_GLASS);                                // side windows
  m.box(2, hw - 1, 8, 6, hw, 11, C.glass, M_GLASS);
  m.box(1, -hw, 11, 8, hw, 12, pal.dark, M_METAL);                                   // roof plate
  m.box(2, -hw + 1, 12, 7, hw - 1, 13, pal.dark, M_METAL);                           // raised roof armour
  m.paint(1, -hw, 5, 8, hw, 8, (x, y, z) => (x === 4 || z === 5) ? pal.dark : undefined);   // door seams
  // Bed and domed ore bin
  m.box(-hl, -hw + 1, 6, 1, hw - 1, 7, pal.dark, M_METAL);
  m.ellipsoid(-5.5, 0, 7, 6.5, hw - 1, 5.5, '#6f716b', M_METAL);
  m.clear(-9, -3, 11, -2, 3, 14);                                                    // the loading hatch
  m.box(-9, -3, 10, -2, 3, 11, '#3d3f38', M_METAL);
  m.paint(-hl, -hw, 7, 1, hw, 14, (x, y, z) => z >= 11 ? '#858780' : (x % 4 === 0 ? '#5d5f59' : undefined));
  if (loaded) {
    for (let y = -3; y < 3; y++) for (let x = -9; x < -2; x++) {
      const h = 11 + Math.round(1.6 - Math.hypot((x + 5.5) / 3.5, y / 3) * 1.4 + hash3(x, y, 1) * 1.4);
      m.box(x, y, 10, x + 1, y + 1, Math.max(11, h), C.ore[Math.floor(hash3(x, y, 2) * 4)], M_METAL);
    }
  }
  // Tail lights and rear stripes
  m.box(-hl, -hw + 1, 4, -hl + 1, hw - 1, 6, pal.dark, M_METAL);
  hazardV(m, -hl, -hw + 1, 3, -hl + 1, hw - 1, 4);
  return m;
}

// ---------------------------------------------------------------------------
// Aircraft (bodies only; rotors are animated separately)
// ---------------------------------------------------------------------------
// Attack helicopter, after the AH-64D Longbow Apache: a slim body with a stepped two-seat cockpit,
// the chin cannon, engine pods either side of the mast, stub wings carrying Hellfire racks and
// rocket pods, a long tail boom with a low stabilator, and the fin with its tail rotor. The
// Longbow radar dome on top of the mast is drawn over the rotor (art.js).
function heliModel(pal) {
  const m = new VModel(-19, -9, 13, 9, 11);
  const body = pal.main, dark = pal.dark, gun = C.gun;
  m.ellipsoid(1.5, 0, 4, 7.5, 1.9, 2.4, body, M_METAL);                   // fuselage
  for (let x = 8; x < 12; x++) m.cylX(x, x + 1, 0, 3.6, Math.max(0.6, 1.8 - (x - 8) * 0.35), body, M_METAL);   // nose
  m.box(6, -1, 4.5, 10, 1, 6, '#5d8fb0', M_GLASS);                        // gunner's canopy, low at the front
  m.box(2, -1, 6, 6, 1, 7.5, '#5d8fb0', M_GLASS);                         // pilot's canopy, raised behind
  m.paint(2, -1, 4.5, 10, 1, 7.5, (x) => (x === 6 || x === 2 ? dark : undefined));   // canopy frames
  m.cylX(7, 8, 0, 1.3, 0.9, gun, M_METAL); m.cylX(8, 12, 0, 1.3, 0.4, gun, M_METAL);   // chin cannon
  for (const y of [-2.6, 2.6]) {
    m.cylX(-4, 2, y, 6, 1.25, body, M_METAL);                             // engine pods
    m.cylX(-5, -4, y, 6, 0.9, '#262624', M_METAL);
    m.box(-1, y < 0 ? -8 : 2, 3.5, 2, y < 0 ? -2 : 8, 4.5, dark, M_METAL);   // stub wings
    m.cylX(-2, 3, y * 1.5, 2.8, 0.95, '#3b3d36', M_METAL);               // rocket pods
    m.set(3, Math.floor(y * 1.5), 2, '#c9c6b8');
    for (const k of [0, 1]) for (const z of [2.4, 3.3]) m.cylX(-1, 3, (y < 0 ? -6 : 6) + (y < 0 ? -k : k), z, 0.42, '#55584f', M_METAL);   // Hellfires, two by two
    m.box(2, y < 0 ? -2.8 : 2, 0, 3, y < 0 ? -2 : 2.8, 2, gun);           // main wheels
  }
  m.cylZ(0, 0, 7, 9, 1.0, gun, M_METAL);                                   // mast
  for (let x = -17; x < -4; x++) m.cylX(x, x + 1, 0, 4.4, 1.15 - (-4 - x) * 0.03, body, M_METAL);   // tail boom, tapering
  m.box(-17, -4, 3.5, -15, 4, 4.5, dark, M_METAL);                         // stabilator
  for (let z = 4; z < 10; z++) m.box(Math.round(-18 - (z - 4) * 0.25), 0, z, Math.round(-15.5 - (z - 4) * 0.25), 1, z + 1, dark, M_METAL);   // fin
  m.box(-19, -1, 6, -17, 0, 10, gun, M_METAL);                             // tail rotor, on the left
  m.box(-16, 0, 2, -15, 1, 4, gun);                                        // tail wheel
  return m;
}
// Hind-D: a big armoured body with the "double bubble" cockpit (gunner low in front, pilot raised
// behind), a chin gun turret, twin engines on top with their intakes forward, drooping stub wings
// with rocket pods and missile rails at the tips, cabin windows, and a camouflage of the side's
// colours. A five-blade rotor (art.js).
function hindModel(pal) {
  const m = new VModel(-20, -11, 16, 11, 12);
  const body = pal.main, dark = pal.dark, gun = C.gun;
  m.ellipsoid(0, 0, 4.8, 10.5, 2.7, 3.3, body, M_METAL);                   // fuselage and cabin
  m.box(-6, -2, 2, 5, 3, 7, body, M_METAL);
  for (let x = 9; x < 13; x++) m.cylX(x, x + 1, 0, 4, Math.max(1.0, 2.6 - (x - 9) * 0.4), body, M_METAL);   // nose
  const GL = '#5d8fb0';
  m.ellipsoid(11.8, 0, 4.8, 2.5, 1.9, 1.9, GL, M_GLASS);                   // gunner's bubble
  m.ellipsoid(8, 0, 7.2, 2.5, 1.9, 1.9, GL, M_GLASS);                      // pilot's bubble, raised behind
  m.paint(5, -2, 3, 15, 2, 10, (x, y, z, c) => (c === rgbInt(GL) && (x === 11 || x === 8) && y === 0 ? dark : undefined));   // canopy frames
  m.ellipsoid(12, 0, 2, 1.3, 1.3, 1.1, gun, M_METAL); m.cylX(12, 16, 0, 2, 0.45, gun, M_METAL);   // chin turret
  for (const y of [-1.7, 1.7]) {
    m.cylX(-5, 6, y, 8.2, 1.45, body, M_METAL);                             // engines on top
    m.cylX(6, 7, y, 8.2, 1.1, '#1b1b1a');                                   // intakes
    m.cylX(-7, -5, y * 1.6, 7.8, 1.0, '#262624', M_METAL);                 // exhausts, angled out
  }
  m.cylZ(0, 0, 9, 11, 1.2, gun, M_METAL);                                   // mast
  for (const s of [-1, 1]) {
    for (let k = 3; k <= 9; k++) {                                          // stub wings, drooping toward the tips
      const z = Math.round(5.5 - (k - 3) * 0.3);
      m.box(-3, s < 0 ? -k - 1 : k, z, 2, s < 0 ? -k : k + 1, z + 1, dark, M_METAL);
    }
    for (const k of [5, 7.5]) { m.cylX(-3, 2, s * k, 3, 0.95, '#3b3d36', M_METAL); m.set(2, Math.floor(s * k), 3, '#c9c6b8'); }   // rocket pods
    m.cylX(-2, 3, s * 9.6, 3.6, 0.45, '#55584f', M_METAL);                 // missile rail at the tip
    for (const x of [-5, -3, -1, 1]) m.box(x, s < 0 ? -2.4 : 2.8, 5, x + 1, s < 0 ? -2 : 3.2, 6, '#1d2226');   // cabin windows
    m.box(4, s < 0 ? -3.4 : 2.6, 0, 5, s < 0 ? -2.6 : 3.4, 2, gun);       // wheels
  }
  m.paint(-10, -4, 2, 10, 4, 10, (x, y, z, c) => (c === rgbInt(body) && hash3(x >> 2, (y + 8) >> 2, z >> 2) > 0.68 ? shadeInt(body, 0.72) : undefined));   // camouflage
  for (let x = -18; x < -6; x++) m.cylX(x, x + 1, 0, 5.6, 1.5 - (-6 - x) * 0.05, body, M_METAL);   // tail boom
  m.box(-17, -4, 5, -15, 4, 6, dark, M_METAL);                              // stabiliser
  for (let z = 5; z < 12; z++) m.box(Math.round(-19.5 - (z - 5) * 0.2), 0, z, Math.round(-16.5 - (z - 5) * 0.35), 1, z + 1, dark, M_METAL);   // fin
  m.box(-20, 1, 6, -18, 2, 11, gun, M_METAL);                               // tail rotor, on the right
  return m;
}
function jetModel(pal, mig) {
  const m = new VModel(-17, -13, 17, 13, 11);
  if (mig) {
    // MiG-23: a wide body in the side's colour with big boxy intakes beside the cockpit, a long
    // pointed nose and a bubble canopy, a raised spine running back into a tall fin with a long
    // fillet, shoulder-mounted swing wings (swept back for speed) and big low tailplanes, both
    // grey with stars, and a dark exhaust.
    const GR = '#8e9397', GRD = '#6d7276';
    for (let x = -14; x < 17; x++) {                                      // fuselage: wide behind the intakes, a cone to the nose
      const r = x < 8 ? 1.9 : Math.max(0.45, 1.9 - (x - 8) * 0.19);
      m.cylX(x, x + 1, 0, 3, r, pal.main, M_METAL);
    }
    m.box(-12, -3, 2, 4, 3, 4, pal.main, M_METAL);                         // the flat, wide centre body
    for (const sgn of [-1, 1]) {                                          // intakes: boxes beside the cockpit, open at the front
      const y0 = sgn < 0 ? -4 : 2;
      m.box(-2, y0, 1, 7, y0 + 2, 4, pal.main, M_METAL);
      m.box(6, y0, 1, 7, y0 + 2, 4, '#1b1b1a');
      m.box(-2, y0, 1, 7, y0 + 2, 2, pal.dark, M_METAL);
    }
    m.box(-12, 0, 4, 5, 1, 5, pal.main, M_METAL);                          // dorsal spine
    m.ellipsoid(8, 0, 4.4, 3, 1.15, 1.4, '#3f86c4', M_GLASS);            // canopy
    m.set(9, 0, 5, '#9fd2f2', M_GLASS);
    m.cylX(-16, -14, 0, 3, 1.7, '#2a2a28', M_METAL);                       // exhaust
    m.cylX(-17, -16, 0, 3, 1.2, '#141413');
    for (const sgn of [-1, 1]) {
      for (let k = 3; k <= 12; k++) {                                       // swing wings: a fixed glove, then swept back
        const lead = 3 - (k - 3) * 0.78, trail = -5.5 - (k - 3) * 0.3;
        m.box(Math.round(trail), sgn < 0 ? -k - 1 : k, 3, Math.round(lead) + 1, sgn < 0 ? -k : k + 1, 4, k > 11 ? GRD : GR, M_METAL);
      }
      for (let x = 2; x < 7; x++) m.set(x, sgn < 0 ? -4 : 3, 4, GR, M_METAL);   // glove leading edge along the intake
      starTop(m, -3.6, sgn * 8.4, 2.5, pal.main);
      for (let k = 2; k <= 7; k++) {                                        // tailplanes, set low
        const lead = -9 - (k - 2) * 0.75, trail = -14 - (k - 2) * 0.25;
        m.box(Math.round(trail), sgn < 0 ? -k - 1 : k, 2, Math.round(lead) + 1, sgn < 0 ? -k : k + 1, 3, GR, M_METAL);
      }
    }
    for (let z = 5; z < 11; z++) {                                          // the fin, swept, with a long fillet at its foot
      const lead = (z === 5 ? -3 : -8) - (z - 6) * 0.8, trail = -14 - (z - 5) * 0.2;
      m.box(Math.round(trail), 0, z, Math.round(lead) + 1, 1, z + 1, z === 10 ? pal.dark : pal.main, M_METAL);
    }
  } else {
    // Strike Eagle: a grey twin-engined airframe with boxy intakes beside a long two-seat canopy,
    // big clipped delta wings, stabilators and twin canted fins in the side's colour.
    const body = mixHex(pal.main, '#7a8088', 0.55), hull = shadeInt(body, 0.86), dark = shadeInt(body, 0.7);
    for (let x = -9; x < 3; x++) {                                                                // swept, clipped wings
      const span = Math.min(10, 3 + (2 - x) * 1.1);
      m.box(x, -span, 2, x + 1, span + 1, 3, body, M_METAL);
      m.set(x, -Math.floor(span), 2, dark, M_METAL); m.set(x, Math.floor(span), 2, dark, M_METAL);
    }
    for (let x = -16; x < -11; x++) { const span = Math.min(6.5, 3 + (-11 - x) * 1.2); m.box(x, -span, 2.5, x + 1, span + 1, 3.3, body, M_METAL); }   // stabilators
    for (const y of [-1.5, 1.5]) m.cylX(-14, 2, y, 3, 1.5, hull, M_METAL);                     // the two engines
    m.box(-14, -1, 2.5, 2, 1, 4.5, hull, M_METAL);
    m.cylX(1, 12, 0, 3.2, 1.5, hull, M_METAL);                                                   // forward fuselage
    m.ellipsoid(13.5, 0, 3.2, 2.8, 1.1, 1.1, hull, M_METAL);                                     // radome
    for (const y of [-3, 2]) { m.box(0, y, 2, 6, y + 1, 4.5, dark, M_METAL); m.box(6, y, 2, 7, y + 1, 4.5, C.black); }   // intakes
    m.ellipsoid(8, 0, 4.7, 3.8, 1, 1.2, C.glass, M_GLASS);                                       // two-seat canopy
    m.set(8, 0, 5, hull, M_METAL);
    for (const s of [-1, 1]) for (let z = 4; z < 8; z++) {                                        // twin fins, canted out
      const y = s > 0 ? 2 + Math.floor((z - 4) / 2) : -3 - Math.floor((z - 4) / 2);
      m.box(-14 + Math.round((z - 4) * 0.6), y, z, -9 - Math.round((z - 4) * 0.9), y + 1, z + 1, pal.main, M_METAL);
    }
    for (const y of [-2, 1]) { m.box(-15, y, 2, -14, y + 2, 4, '#2a2a28', M_METAL); m.set(-16, y, 3, C.black); m.set(-16, y + 1, 3, C.black); }   // nozzles
    for (const y of [-7, 7]) m.cylX(-6, -1, y, 1.5, 0.8, '#5d605a', M_METAL);                     // bombs under the wings
  }
  return m;
}

// Self-propelled artillery: a tracked chassis carrying an open gun mount, a shield and a long
// howitzer raised for a high shot.
function artyModel(pal) {
  const m = tankHull(pal, { len: 20, wid: 13, reach: 8, height: 20 });
  m.box(-6, -4, 7, 3, 4, 9, pal.dark, M_METAL);                                   // gun deck
  m.box(1, -4, 9, 3, 4, 13, pal.main, M_METAL);                                   // shield
  m.box(1, -1, 13, 3, 1, 13.5, pal.dark, M_METAL);
  for (let x = 0; x < 17; x++) m.box(x, -1, 10 + x * 0.32, x + 1, 1, 11.5 + x * 0.32, C.gun, M_METAL);   // the barrel, elevated
  m.box(15, -1.5, 14.5, 17, 1.5, 16.5, C.gun, M_METAL);                           // muzzle brake
  m.box(-6, -3, 9, -3, 3, 10, '#5d5e58', M_METAL);                                // breech and spades
  m.box(-10, -5, 2, -9, -3, 6, C.gun, M_METAL); m.box(-10, 3, 2, -9, 5, 6, C.gun, M_METAL);
  return m;
}
// V2 rocket launcher: a six-wheeled truck with a cab up front and a launch rail on the back,
// carrying the rocket raised for launch (not while it reloads).
function v2Model(pal, loaded) {
  const m = new VModel(-14, -8, 14, 8, 20);
  for (const x of [-8, -3, 7]) for (const y of [-5, 4]) m.cylY(y, y + 1.6, x, 2.4, 2.4, C.track);          // wheels
  m.box(-11, -4, 2, 11, 4, 4, pal.dark, M_METAL);                                 // chassis
  m.box(5, -4, 4, 11, 4, 9, pal.main, M_METAL);                                   // cab
  m.box(9, -3, 7, 11, 3, 9, C.glass, M_GLASS);
  m.box(-11, -4, 4, 4, 4, 6, pal.main, M_METAL);                                  // bed
  for (let x = -10; x < 6; x++) m.box(x, -1, 6 + (x + 10) * 0.42, x + 1, 1, 7 + (x + 10) * 0.42, '#3d3f38', M_METAL);   // launch rail
  m.box(-1, -2, 6, 1, 2, 10, '#3d3f38', M_METAL);                                 // its strut
  if (loaded) {
    for (let x = -10; x < 6; x++) {
      const z = 8 + (x + 10) * 0.42;
      m.cylX(x, x + 1, 0, z, 1.6, x > 3 ? C.red : x > 1 ? '#c9c7bd' : '#7d8650', M_METAL);   // body, band, warhead
    }
    m.box(6, -0.5, 14.5, 7, 0.5, 15.5, C.red, M_METAL);                           // nose
    for (const [y, z] of [[-3, 8], [3, 8], [0, 11]]) m.box(-10, y - 0.5, z - 0.5, -7, y + 0.5, z + 0.5, '#5a6238', M_METAL);   // fins
  }
  return m;
}

// Four-engined propeller plane: the paratrooper transport, or (darker, glazed nose) the bomber.
function cargoModel(pal, bomber) {
  const m = new VModel(-24, -25, 24, 25, 11);
  const body = bomber ? pal.dark : pal.main, trim = bomber ? pal.deep : pal.dark;
  m.cylX(-20, 17, 0, 4, 2.7, body, M_METAL);
  m.ellipsoid(17, 0, 4, 3.5, 2.6, 2.4, body, M_METAL);
  if (bomber) m.ellipsoid(19, 0, 4, 2, 1.8, 1.6, C.glass, M_GLASS);
  m.ellipsoid(14, 0, 5.8, 2.4, 1.6, 1, C.glass, M_GLASS);
  for (let x = -1; x < 6; x++) { const tip = 23 - Math.max(0, 2 - x); m.box(x, -tip, 5, x + 1, tip + 1, 6, body, M_METAL); }
  for (const y of [-15, -7, 7, 15]) {
    m.cylX(-1, 9, y, 4.5, 1.5, trim, M_METAL);
    m.box(9, y - 3, 4, 10, y + 4, 5, C.black);
  }
  for (let x = -22; x < -17; x++) m.box(x, -9, 4, x + 1, 10, 5, body, M_METAL);
  m.box(-22, 0, 4, -17, 1, 11, trim, M_METAL);
  m.paintTop(-20, -2, 17, 2, (x, y) => (x + 40) % 9 === 0 && y === 0 ? trim : undefined);
  return m;
}

// The Allied paratrooper transport, after the C-130 Hercules: a fat fuselage under a straight high wing,
// four turboprops with four-bladed propellers, a blunt nose with a stepped cockpit, gear sponsons on the
// lower sides, an upswept tail over the loading ramp and one tall fin in the side's colour.
function c130Model(pal) {
  const m = new VModel(-23, -25, 21, 25, 15);
  const body = mixHex(pal.main, '#7c8378', 0.5), hull = shadeInt(body, 0.88), dark = shadeInt(body, 0.68), prop = '#2b2c29';
  // Fuselage: a round section with a flat floor, the same width all the way to the wing.
  m.cylX(-9, 15, 0, 4.4, 3.4, body, M_METAL);
  m.box(-9, -2.5, 1, 15, 2.5, 2, hull, M_METAL);
  // The tail cone sweeps up from the floor to the fin, narrowing, with the ramp underneath.
  for (let x = -21; x < -9; x++) {
    const t = (-9 - x) / 12, bot = 1 + t * 5.2, top = 7.8 - t * 0.9, ry = 3.4 * (1 - t * 0.68), cz = (bot + top) / 2, rz = (top - bot) / 2;
    for (let y = Math.floor(-ry); y < ry; y++) for (let z = Math.floor(bot); z < top; z++) {
      if (((y + 0.5) / ry) ** 2 + ((z + 0.5 - cz) / rz) ** 2 <= 1) m.set(x, y, z, z < cz - rz * 0.5 && x > -17 ? hull : body, M_METAL);
    }
  }
  m.box(-16, -1, 1.6, -10, 1, 2.4, dark, M_METAL);                                // the ramp's hinge line
  // Blunt nose with a dark radome, and the stepped cockpit glazing wrapped round it.
  m.ellipsoid(15, 0, 4.2, 4.6, 3.4, 3.3, body, M_METAL);
  m.ellipsoid(18.4, 0, 3.4, 1.9, 2.2, 2.1, dark, M_METAL);
  m.paint(14, -4, 5, 20, 4, 7, (x, y, z) => (x >= 15 && x <= 17 && (z === 5 || (z === 6 && x <= 16)) && Math.abs(y + 0.5) < 3.4 - (x - 15) * 0.6) ? C.glass : undefined);
  m.ellipsoid(15.5, 0, 6.6, 2, 1.8, 0.9, C.glass, M_GLASS);
  // Main gear sponsons bulging from the lower sides, and a row of small windows above them.
  for (const y of [-3.2, 3.2]) m.ellipsoid(1, y, 2.4, 5, 1.3, 1.5, hull, M_METAL);
  for (let x = -7; x < 12; x += 3) { m.set(x, -4, 5, C.glass, M_GLASS); m.set(x, 3, 5, C.glass, M_GLASS); }
  m.box(-14, -3, 3, -12, -2, 6, dark, M_METAL); m.box(-14, 2, 3, -12, 3, 6, dark, M_METAL);   // paratroop doors either side
  // Straight high wing on the fuselage top, tapering a little towards the tips, side colour at the tips.
  for (let y = -24; y <= 24; y++) {
    const a = Math.abs(y), lead = 4 - Math.floor(a / 14), trail = -2 + Math.floor(a / 11);
    for (let x = trail; x <= lead; x++) {
      const tip = a >= 22;
      m.set(x, y, 8, tip ? pal.main : x === trail ? hull : body, M_METAL);
      if (a < 4) m.set(x, y, 7, body, M_METAL);                                   // the thick wing root
    }
  }
  // Four turboprops slung under the wing, each with a spinner and four blades.
  for (const y of [-15, -7.5, 7.5, 15]) {
    m.cylX(-4, 8, y, 7, 1.5, hull, M_METAL);
    m.box(-4, Math.floor(y) - 1, 5, 4, Math.floor(y) + 1, 6, dark, M_METAL);       // exhaust and the lower cowling
    m.ellipsoid(8.8, y, 7, 1.2, 1, 1, dark, M_METAL);
    for (let k = -2; k <= 2; k++) { if (k) { m.set(9, Math.floor(y) + k, 7, prop, M_METAL); m.set(9, Math.floor(y), 7 + k, prop, M_METAL); } }
  }
  // Tailplane low on the cone, swept at the front, and one tall fin with a broad dorsal fillet.
  for (let y = -9; y <= 9; y++) { const a = Math.abs(y), lead = -15 - Math.floor(a / 3); for (let x = -21; x <= lead; x++) m.set(x, y, 7, a > 7 ? pal.main : body, M_METAL); }
  for (let z = 8; z < 15; z++) {
    const lead = z < 9 ? -9 : -13 - Math.round((z - 9) * 0.7), trail = -22 + Math.floor((z - 8) * 0.15);
    m.box(trail, 0, z, lead + 1, 1, z + 1, z > 12 ? pal.dark : pal.main, M_METAL);
  }
  // A walkway line along the spine.
  m.paintTop(-9, 0, 14, 1, (x, y) => (x % 4 === 0 ? dark : undefined));
  return m;
}

// The Soviet paratrooper transport, after the Il-76: a long fuselage under a swept, drooping high wing,
// four jet engines in pods on pylons, a glazed navigator's nose with a radar chin below the cockpit,
// big gear fairings on the lower sides, an upswept tail over the ramp with a tail gunner's glazing,
// and a T-tail with the fin in the side's colour.
function il76Model(pal) {
  const m = new VModel(-25, -26, 22, 26, 17);
  const body = mixHex(pal.main, '#8e918b', 0.82), hull = shadeInt(body, 0.88), dark = shadeInt(body, 0.62), pod = shadeInt(body, 1.08);
  m.cylX(-10, 15, 0, 4.4, 3.3, body, M_METAL);                                    // fuselage
  m.box(-10, -2.5, 1, 15, 2.5, 2, hull, M_METAL);
  for (let x = -23; x < -10; x++) {                                               // the tail cone sweeping up over the ramp
    const t = (-10 - x) / 13, bot = 1 + t * 5.4, top = 7.7 - t * 0.6, ry = 3.3 * (1 - t * 0.7), cz = (bot + top) / 2, rz = (top - bot) / 2;
    for (let y = Math.floor(-ry); y < ry; y++) for (let z = Math.floor(bot); z < top; z++) {
      if (((y + 0.5) / ry) ** 2 + ((z + 0.5 - cz) / rz) ** 2 <= 1) m.set(x, y, z, z < cz - rz * 0.5 && x > -18 ? hull : body, M_METAL);
    }
  }
  m.box(-17, -1, 1.6, -11, 1, 2.4, dark, M_METAL);                                // ramp hinge line
  m.box(-24, -1, 6, -22, 1, 8, C.glass, M_GLASS);                                 // tail gunner's glazing
  // Nose: a tapering cone, the navigator's glazing low at the tip, the radar chin under it, cockpit glazing on top.
  m.ellipsoid(15, 0, 4.2, 5.5, 3.3, 3.2, body, M_METAL);
  m.ellipsoid(19, 0, 3.6, 2.2, 1.9, 1.6, C.glass, M_GLASS);
  m.ellipsoid(16, 0, 1.4, 3, 2.2, 1.3, dark, M_METAL);
  m.paint(14, -4, 5, 19, 4, 8, (x, y, z) => (x >= 15 && x <= 17 && (z === 6 || (z === 5 && x === 17)) && Math.abs(y + 0.5) < 3 - (x - 15) * 0.5) ? C.glass : undefined);
  // Main gear fairings, a row of windows and the paratroop doors.
  for (const y of [-3.4, 3.4]) m.ellipsoid(0, y, 2.3, 7, 1.4, 1.7, hull, M_METAL);
  for (let x = -6; x < 13; x += 3) { m.set(x, -4, 5, C.glass, M_GLASS); m.set(x, 3, 5, C.glass, M_GLASS); }
  m.box(-15, -3, 3, -13, -2, 6, dark, M_METAL); m.box(-15, 2, 3, -13, 3, 6, dark, M_METAL);
  // Swept, tapered high wing with anhedral (the tips droop), the side's colour at the tips.
  const lead = (a) => 5 - Math.round(a * 0.42), wz = (a) => 8 - Math.floor(a / 9);
  for (let y = -25; y <= 25; y++) {
    const a = Math.abs(y), trail = -3 - Math.round(a * 0.3);
    for (let x = trail; x <= lead(a); x++) {
      m.set(x, y, wz(a), a >= 23 ? pal.main : x === trail ? hull : body, M_METAL);
      if (a < 4) m.set(x, y, 7, body, M_METAL);                                   // thick wing root on the fuselage top
    }
  }
  // Four jet engines in pods slung forward of the wing on pylons: a dark intake in front, the exhaust behind.
  for (const y of [-15, -8, 8, 15]) {
    const a = Math.abs(y), x1 = lead(a) + 7, x0 = x1 - 9, cz = wz(a) - 2;
    m.box(x0 + 2, y, cz + 1, x1 - 2, y + 1, wz(a), dark, M_METAL);                // pylon
    m.cylX(x0, x1, y + 0.5, cz, 1.8, pod, M_METAL);
    m.cylX(x1 - 1, x1, y + 0.5, cz, 1.3, C.black);
    m.box(x1 - 2, y, Math.ceil(cz + 1.2), x1 - 1, y + 1, Math.ceil(cz + 1.8), pal.main, M_METAL);   // a band of side colour on each cowling                                // intake
    m.cylX(x0 - 1, x0, y + 0.5, cz, 1, '#3a3632', M_METAL);                       // exhaust cone
  }
  // T-tail: a tall swept fin in the side's colour with the tailplane across its top.
  for (let z = 7; z < 15; z++) {
    const ld = z < 8 ? -10 : -13 - Math.round((z - 8) * 1.1), tr = -23 + Math.floor((z - 7) * 0.2);
    m.box(tr, 0, z, ld + 1, 1, z + 1, z > 13 ? pal.dark : pal.main, M_METAL);
  }
  for (let y = -10; y <= 10; y++) {
    const a = Math.abs(y), ld = -20 - Math.round(a * 0.35), tr = -24 + Math.round(a * 0.1);
    for (let x = tr; x <= ld; x++) m.set(x, y, 15, a > 8 ? pal.main : body, M_METAL);
  }
  m.box(-22, 0, 15, -19, 1, 16, pal.dark, M_METAL);                               // the bullet fairing where they meet
  return m;
}

// The Allied bomber, after the B-1 Lancer: a long, slender blended body with a sharp nose, swing
// wings at mid sweep from wide wing gloves, two paired engine nacelles under the body, and a tall swept fin with the tailplanes low on it. Dark grey, the fin in the side's colour.
function b1Model(pal) {
  const m = new VModel(-23, -18, 24, 18, 13);
  const body = mixHex(pal.main, '#55595c', 0.78), hull = shadeInt(body, 0.85), dark = shadeInt(body, 0.6), lite = shadeInt(body, 1.12);
  // Fuselage: a long body tapering to a needle nose and to the tail.
  for (let x = -22; x < 24; x++) {
    const ry = x > 11 ? 2.6 * (1 - (x - 11) / 13) + 0.4 : x < -14 ? 2.6 - (-14 - x) * 0.18 : 2.6, rz = ry * 0.85, cz = 4.6 - (x > 15 ? (x - 15) * 0.12 : 0);
    for (let y = Math.floor(-ry); y < ry; y++) for (let z = Math.max(0, Math.floor(cz - rz)); z < cz + rz; z++) {
      if (((y + 0.5) / ry) ** 2 + ((z + 0.5 - cz) / rz) ** 2 <= 1) m.set(x, y, z, z > cz + rz * 0.4 ? lite : body, M_METAL);
    }
  }
  // Cockpit windows.
  m.paint(12, -3, 5, 17, 3, 8, (x, y, z) => (x >= 13 && x <= 14 && z >= 6 && Math.abs(y + 0.5) <= 1.2) ? '#1d2830' : undefined);
  // Blended wing gloves: a broad, thin fairing widening towards the back.
  for (let x = -10; x <= 9; x++) {
    const w = 2.6 + Math.min(4.6, (9 - x) * 0.42);
    for (let y = Math.floor(-w); y < w; y++) m.set(x, y, 4, body, M_METAL);
  }
  // Swing wings at mid sweep, from the glove pivots out to the tips (the side's colour at the tips).
  for (let a = 6; a <= 17; a++) {
    const lead = 1 - Math.round((a - 6) * 1.15), trail = lead - 5 + Math.round((a - 6) * 0.2);
    for (const sgn of [-1, 1]) {
      const y = sgn < 0 ? -a - 1 : a;
      for (let x = trail; x <= lead; x++) m.set(x, y, 4, a >= 16 ? pal.main : x === trail ? hull : body, M_METAL);
    }
  }
  // Two nacelles under the body, each holding a pair of engines: intakes in front, four exhausts behind.
  for (const y of [-5, 3]) {
    m.box(-13, y, 1, -2, y + 2, 4, hull, M_METAL);
    m.box(-2, y, 1, -1, y + 2, 3, C.black);
    m.box(-14, y, 1.5, -13, y + 2, 3, '#2a2724', M_METAL);
  }
  // Tall swept fin in the side's colour, with the tailplanes low on it.
  for (let z = 6; z < 13; z++) {
    const lead = -13 - Math.round((z - 6) * 0.9), trail = -22 + Math.round((z - 6) * 0.3);
    m.box(trail, 0, z, lead + 1, 1, z + 1, z > 11 ? pal.dark : pal.main, M_METAL);
  }
  for (let y = -8; y <= 8; y++) {
    const a = Math.abs(y), lead = -16 - Math.round(a * 0.6), trail = -22 + Math.round(a * 0.15);
    for (let x = trail; x <= lead; x++) m.set(x, y, 6, a > 6 ? pal.main : body, M_METAL);
  }
  // Panel lines along the spine.
  m.paintTop(-12, 0, 10, 1, (x) => (x % 5 === 0 ? dark : undefined));
  return m;
}

// The Soviet bomber, after the Tu-22M Backfire: a sharp radome nose, big box intakes along both sides
// feeding two engines in the wide rear body, swing wings at mid sweep from long fixed gloves, a huge
// swept fin with a long dorsal fillet, low tailplanes and a tail gun. Light grey, the side's colour on
// the fin and wingtips.
function tu22Model(pal) {
  const m = new VModel(-25, -18, 24, 18, 15);
  const body = mixHex(pal.main, '#8e918b', 0.82), hull = shadeInt(body, 0.86), dark = shadeInt(body, 0.6), lite = shadeInt(body, 1.1);
  // Fuselage, tapering to a long pointed nose with a dark radome tip.
  for (let x = -20; x < 24; x++) {
    const ry = x > 9 ? 2.3 * (1 - (x - 9) / 15) + 0.35 : 2.3, rz = ry * 0.9, cz = 4.8 - (x > 14 ? (x - 14) * 0.1 : 0);
    for (let y = Math.floor(-ry); y < ry; y++) for (let z = Math.max(0, Math.floor(cz - rz)); z < cz + rz; z++) {
      if (((y + 0.5) / ry) ** 2 + ((z + 0.5 - cz) / rz) ** 2 <= 1) m.set(x, y, z, x > 20 ? dark : z > cz + rz * 0.4 ? lite : body, M_METAL);
    }
  }
  m.paint(10, -3, 5, 15, 3, 8, (x, y, z) => (x >= 11 && x <= 13 && z >= 6 && Math.abs(y + 0.5) <= 1.2) ? '#1d2830' : undefined);   // cockpit
  // Behind the cockpit the body swells into two deep intakes on its flanks, lower than the spine, and
  // tapers smoothly from there to the two exhausts. Same colour as the wings, so it all reads as one airframe.
  const bw = (x) => x > 4 ? 3.3 + (8 - x) * 0.17 : x > -6 ? 4 : 4 - (-6 - x) * 0.12;
  for (let x = -20; x <= 8; x++) {
    const w = bw(x), z0 = 2.6, z1 = 6.2;
    for (let y = Math.floor(-w); y < w; y++) for (let z = Math.floor(z0); z < z1; z++) {
      const ey = Math.abs(y + 0.5) - (w - 1.4), ez = Math.max(z0 + 1.2 - (z + 0.5), z + 0.5 - (z1 - 1.4));
      if (ey > 0 && ez > 0 && ey * ey + ez * ez > 1.8) continue;                 // well-rounded edges
      const inlet = x >= 7 && Math.abs(y + 0.5) > 2.2 && z >= 3 && z < 6;        // the intake mouths
      m.set(x, y, z, inlet ? C.black : body, inlet ? 0 : M_METAL);
    }
  }
  for (const y of [-2, 2]) { m.cylX(-22, -20, y, 4.5, 1.8, '#3a3632', M_METAL); m.cylX(-22, -21, y, 4.5, 1.2, C.black); }
  m.box(-24, -0.5, 6, -22, 0.5, 7, dark, M_METAL);                                // tail gun
  // Long fixed gloves out from the intakes, and the swing wings at mid sweep (side colour at the tips).
  for (let x = -12; x <= 6; x++) {
    const w = 5 + Math.min(3.5, (6 - x) * 0.3);
    for (let y = Math.floor(-w); y < w; y++) if (Math.abs(y + 0.5) > bw(x) - 0.5) m.set(x, y, 5, body, M_METAL);
  }
  for (let a = 8; a <= 17; a++) {
    const lead = -1 - Math.round((a - 8) * 1.05), trail = lead - 5 + Math.round((a - 8) * 0.22);
    for (const sgn of [-1, 1]) {
      const y = sgn < 0 ? -a - 1 : a;
      for (let x = trail; x <= lead; x++) m.set(x, y, 5, a >= 16 ? pal.main : x === trail ? hull : body, M_METAL);
    }
  }
  // Huge swept fin with a dorsal fillet running far forward, and low swept tailplanes.
  for (let z = 7; z < 15; z++) {
    const lead = z === 7 ? -9 : -12 - Math.round((z - 8) * 1.1), trail = -21 + Math.round((z - 7) * 0.25);
    m.box(trail, 0, z, lead + 1, 1, z + 1, z > 13 ? pal.dark : pal.main, M_METAL);
  }
  for (let y = -12; y <= 11; y++) {
    const a = y < 0 ? -y - 1 : y, lead = -13 - Math.round(a * 0.6), trail = -21 + Math.round(a * 0.2);
    if (a < 3) continue;
    for (let x = trail; x <= lead; x++) m.set(x, y, 5, a > 9 ? pal.main : x === trail ? hull : body, M_METAL);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Infantry: 16 facings x 3 frames (standing, two walking poses)
// ---------------------------------------------------------------------------
// Frames: 0 standing, 1-2 walking, 3 throwing, 4 crouching, 5 prone, then the idle poses:
// 6 at rest (weapon shouldered or grounded), 7 aiming down the sights, 8-9 push-ups (up, down),
// 10 stretching.
function infModel(pal, faction, type, frame) {
  if (frame === 5) return proneModel(pal, faction, type);
  if (frame === 4) return crouched(infModel(pal, faction, type, 0));
  if (frame === 8 || frame === 9) return pushupModel(pal, faction, type, frame === 8);
  // A stocky figure in the side's colour from boots to collar, so a squad reads as one colour
  // at a glance: thick legs, a broad chest, a big helmet and a pack on the back.
  const m = new VModel(-9, -7, 12, 7, frame === 11 ? 30 : 22);
  const sov = faction === 'soviets', sovRk = sov && type === 'rocket';
  const step = frame === 1 ? 1.5 : frame === 2 ? -1.5 : 0, throwing = frame === 3;
  const pose = frame === 6 ? 'rest' : frame === 7 ? 'aim' : frame === 10 ? 'stretch' : frame === 11 ? 'sam' : null;
  const K = infKit(pal, faction), tunic = pal.main, sleeve = shadeInt(pal.main, 0.84), hi = shadeInt(pal.main, 1.12);
  const R = type === 'rifle', wood = '#6a4426';   // Rifle Infantry: long coat, shoulder plates, knee pads, hip satchel, wooden-furniture rifle
  // Boots and trousers, legs apart with a gap between them, swinging when walking.
  for (const [y0, s] of [[-3, step], [1, -step]]) {
    m.box(s - 1, y0, 0, s + 2, y0 + 2, 2, C.black);
    m.box(s + 1, y0, 0, s + 3, y0 + 2, 1, C.black);                               // toe caps
    m.box(s - 1, y0, 2, s + 2, y0 + 2, 8, K.pants);
    m.box(s + 1, y0, 5, s + 2, y0 + 2, 6, shadeInt(K.pants, 0.82));                // knee crease
    if (R) { m.box(s + 2, y0, 4, s + 3, y0 + 2, 7, shadeInt(K.pants, 1.3), M_METAL); m.box(s - 1, y0, 2, s + 2, y0 + 2, 3, shadeInt(K.pants, 0.7)); }   // knee pad, boot tops
  }
  m.box(-1, -1, 6, 2, 1, 8, K.pants);                                               // seat
  // Belt with pouches and buckle.
  m.box(-2, -3, 8, 2, 3, 9, K.web);
  for (const y of [-3, 2]) m.box(1, y, 8, 3, y + 1, 10, K.pouch);
  m.set(2, 0, 8, '#c9a227', M_METAL);
  if (R) {
    m.box(-2, -3, 6, 2, 3, 8, shadeInt(tunic, 0.88));                              // coat skirt over the hips
    m.box(-1, 4, 6, 2, 5, 9, K.pouch); m.box(-1, 4, 8, 2, 5, 9, shadeInt(K.pouch, 1.25));   // satchel on the right hip
  }
  // Tunic: broad chest and shoulders, a lit front panel, the collar.
  m.box(-2, -3, 9, 2, 3, 14, tunic);
  m.box(1, -2, 9, 2, 2, 13, hi);
  m.box(-2, -4, 12, 2, 4, 14, tunic);                                               // shoulders
  m.paint(-2, -3, 9, 2, 3, 14, (x, y, z) => (x === 1 && y === z - 12) ? K.web : undefined);   // strap across the chest
  m.box(-1, -1, 14, 2, 2, 14.5, shadeInt(tunic, 0.72));                             // collar
  if (R) {
    m.box(-2, -2, 14, 3, 3, 15, shadeInt(tunic, 0.8));                              // high turned-up collar
    for (const y of [-5, 4]) { m.box(-2, y, 13, 2, y + 1, 15, shadeInt(tunic, 1.25), M_METAL); m.box(-1, y, 15, 1, y + 1, 16, shadeInt(tunic, 1.1), M_METAL); }   // shoulder plates
    m.box(2, -2, 10, 3, 0, 12, K.pouch); m.box(2, 1, 10, 3, 2, 12, K.pouch);        // chest ammo pouches
  }
  // Arms, by pose.
  const hand = (x, y, z) => m.set(x, y, z, K.skin);
  if (pose === 'stretch') {
    for (const y of [-4, 3]) { m.box(-1, y, 12, 1, y + 1, 20, sleeve); hand(0, y, 20); hand(0, y, 21); }
  } else if (pose === 'rest') {
    m.box(-1, -4, 9, 1, -3, 14, sleeve); hand(0, -4, 8);
    if (type === 'grenadier' || type === 'pilot') { m.box(-1, 3, 9, 1, 4, 14, sleeve); hand(0, 3, 8); }
    else { m.box(-1, 3, 11, 1, 4, 14, sleeve); m.box(1, 3, 11, 2, 4, 12, sleeve); hand(2, 4, 11); }
  } else if (pose === 'aim') {
    m.box(-1, -4, 12, 5, -3, 13, sleeve); m.box(-1, 3, 12, 2, 4, 13, sleeve); m.box(1, 1, 12, 2, 3, 13, sleeve);
    hand(5, -3, 12); hand(2, 0, 12);
  } else if (type === 'grenadier') {
    m.box(-2, 3, 10, 1, 4, 14, sleeve); m.box(1, 3, 10, 2, 4, 11, sleeve); hand(2, 3, 10);
    if (throwing) { m.box(-2, -4, 13, 0, -3, 20, sleeve); hand(-2, -4, 20); m.box(-3, -5, 20, -1, -3, 22, '#3f4a2a'); }
    else { m.box(-2, -4, 9, 1, -3, 14, sleeve); hand(0, -4, 9); m.box(0, -5, 8, 2, -4, 9.5, '#3f4a2a'); }
  } else if (type === 'rocket') {
    m.box(-1, 3, 12, 1, 4, 14, sleeve); m.box(1, 3, 13, 3, 4, 14, sleeve); hand(3, 3, 14);      // right hand up on the grip
    m.box(-2, -4, 10, 1, -3, 14, sleeve); m.box(1, -4, 10, 3, -3, 11, sleeve); hand(3, -3, 10); // left hand steadying it
  } else if (type === 'pilot') {
    for (const y of [-4, 3]) { m.box(-1, y, 9, 1, y + 1, 14, sleeve); hand(0, y, 8); }
  } else {
    // Rifle held ready across the body: right hand at the hip on the grip, left forward on the stock.
    m.box(-1, 3, 10, 1, 4, 14, sleeve); m.box(1, 2, 10, 3, 3, 11, sleeve); hand(3, 2, 10);
    m.box(-1, -4, 11, 1, -3, 14, sleeve); m.box(1, -4, 11, 4, -3, 12, sleeve); hand(4, -3, 11);
  }
  // Back: a pack with a rolled blanket on top; the grenadier carries grenade bags instead.
  if (type === 'grenadier') {
    const band = '#b49a5e', gren = '#2f3a20';
    m.paint(-2, -4, 9, 2, 4, 14, (x, y, z) => ((x === 1 || x === -2) && y === z - 12) ? band : undefined);
    for (const [y, z] of [[-2, 10], [0, 11], [2, 12]]) { m.set(2, y, z, gren, M_METAL); m.set(2, y, z + 1, '#7d7d70', M_METAL); }
    for (const [y0, y1] of [[3, 6], [-7, -4]]) {                                  // canvas grenade bags on both hips
      m.box(-2, y0, 5, 2, y1, 9, '#9a8e58'); m.box(-2, y0, 8, 2, y1, 9, '#6e6338');
      m.set(1, y0 + 1, 6, '#c9a227', M_METAL);
    }
    m.box(-3, -2, 9, -2, 2, 13, '#6e6338');
  } else if (type === 'pilot') {
    m.box(-4, -2, 8, -2, 2, 13, '#c9c3a8'); m.box(-4, -2, 12, -2, 2, 13, '#a49d82');   // parachute pack
  } else {
    m.box(-5, -2, 9, -2, 3, 14, K.pack); m.box(-5, -2, 13, -3, 3, 14, shadeInt(K.pack, 0.8));
    m.box(-6, -1, 10, -5, 2, 12, shadeInt(K.pack, 0.85));                          // side pocket
    m.cylY(-3, 4, -4, 14.5, 1, '#8c7c58');                                         // blanket roll
  }
  if (sovRk) for (const y of [-1, 2]) {                                              // spare rockets in the pack, heads up
    m.cylZ(-5, y, 13, 19, 1, '#5f6a3c', M_METAL); m.ellipsoid(-5, y, 19.8, 1.4, 1.4, 1.6, '#4a4f3a', M_METAL); m.set(-5, y, 21, '#c8281e');
  }
  // Head: face front with eyes and a shadowed chin.
  m.box(-1, -1, 14, 2, 2, 17, K.skin);
  m.set(1, -1, 16, '#2a1e18'); m.set(1, 1, 16, '#2a1e18');
  m.set(1, 0, 14, shadeInt(K.skin, 0.8));
  // Headgear: a big helmet so the head reads at phone scale.
  if (type === 'grenadier') {
    m.box(-2, -2, 16, 2, 3, 18, '#5d6236'); m.box(-1, -1, 18, 2, 2, 18.5, '#5d6236');
    m.box(2, -2, 16, 3, 3, 16.5, '#474a28'); m.set(2, 0, 17, '#c8281e');                       // field cap, red star
  } else if (type === 'pilot') {
    m.box(-2, -2, 15, 2, 3, 18, '#e4e0d0'); m.box(-1, -1, 18, 2, 2, 19, '#e4e0d0');            // flight helmet, dark visor
    m.box(2, -1, 15, 3, 2, 17, '#22262a', M_GLASS);
    m.box(3, 2, 10, 6, 3, 11, C.gun, M_METAL);                                                 // sidearm
  } else if (sov) {
    m.ellipsoid(0.5, 0.5, 17, 2.5, 2.5, 2.2, K.helm, M_METAL);                                 // deep round steel helmet
    m.clear(1, -1, 14, 3, 2, 16.5);
    m.box(-2, -2, 15, 0, 3, 16, shadeInt(K.helm, 0.75), M_METAL);                              // flared back rim
    m.set(3, 0, 17, '#c8281e');                                                                // red star
  } else {
    m.box(-2, -2, 16, 3, 3, 17, shadeInt(K.helm, 0.78), M_METAL);                              // wide brim
    m.set(3, 0, 16, shadeInt(K.helm, 0.78), M_METAL); m.set(-3, 0, 16, shadeInt(K.helm, 0.78), M_METAL); m.set(0, -3, 16, shadeInt(K.helm, 0.78), M_METAL); m.set(0, 3, 16, shadeInt(K.helm, 0.78), M_METAL);
    m.ellipsoid(0.5, 0.5, 17, 2.1, 2.1, 2, K.helm, M_METAL);                                   // crown
    m.box(-1, -1, 18, 2, 2, 19, K.helm, M_METAL);
  }
  // Weapons.
  const RIF = !['rocket', 'grenadier', 'pilot'].includes(type);
  const tube = sovRk ? '#5f6a3c' : '#c3c4b8', tubeD = sovRk ? '#2f3520' : '#5d5f58';   // Soviet: olive RPG-style launcher
  if (pose === 'stretch') {                                                  // slung on the back
    if (type === 'rocket') { m.cylY(-6, 6, -6, 13, 1.4, tube); m.box(-7, 5, 12, -5, 6, 15, tubeD); }
    else if (RIF) { m.line(-6, -2, 6, -6, 2, 16, C.gun, M_METAL); m.box(-7, -3, 5, -5, -1, 8, '#6a4426'); }
  } else if (pose === 'rest') {
    if (type === 'rocket') { m.box(2, 4, 0, 4, 6, 13, tube); m.box(2, 4, 12, 4, 6, 14, tubeD); }   // launcher stood on the ground
    else if (RIF) { m.box(1, 4, 10, 2, 5, 21, C.gun, M_METAL); m.box(1, 4, 8, 2, 5, 12, '#6a4426'); }   // rifle on the shoulder
  } else if (pose === 'aim' && RIF) {
    m.box(2, -1, 13, R ? 13 : 11, 0, 14, C.gun, M_METAL); m.box(-1, -1, 12, 3, 0, 14, wood); m.box(5, -1, 11, 6, 0, 13, C.gun, M_METAL);
    if (R) m.box(5, -1, 13, 9, 0, 14, wood);                                  // wooden handguard
  } else if (pose === 'sam') {
    // RedEye: a long, slim tube on the shoulder pointed up at the sky, with a boxy gripstock and
    // battery under it, a seeker head at the front and a flip-up sight. Pale with an orange band
    // for the Allies; olive with a red band for the Soviets.
    const body = sov ? '#5f6a3c' : '#d9dbd0', band = sov ? '#c8281e' : '#e8742a', dk = sov ? '#2f3520' : '#4c5058';
    const x0 = -6, z0 = 12, x1 = 11, z1 = 26, n = 18;
    for (let i = 0; i <= n; i++) {
      const k = i / n, x = Math.round(x0 + (x1 - x0) * k), z = Math.round(z0 + (z1 - z0) * k);
      m.box(x - 1, 2.5, z - 1, x + 1, 4.5, z + 1, (i === 6 || i === 7 || i === 12) ? band : i >= 17 ? dk : body, M_METAL);
    }
    m.ellipsoid(12, 3.5, 26.5, 1.6, 1.6, 1.8, dk, M_METAL);                         // seeker head
    m.box(-7, 2, 11, -5, 5, 14, dk, M_METAL);                                        // rear cone
    m.box(2, 2, 12, 5, 5, 15, dk, M_METAL); m.box(3, 3, 10, 4, 4, 12, '#6a4426');   // gripstock, grip
    m.box(0, 5, 16, 2, 6, 19, sov ? '#3a4026' : '#7b8087', M_METAL);                 // flip-up sight
  } else if (type === 'rocket') {
    m.cylX(-7, 7, 3.5, 15.5, 1.5, tube);                                      // launcher tube on the right shoulder
    m.box(7, 2, 14, 9, 5, 17, tubeD); m.box(-8, 2, 14, -7, 5, 17, tubeD);    // muzzle and exhaust
    m.box(3, 3, 13, 4, 4, 15, tubeD); m.box(1, 2, 16, 3, 3, 18, '#2a2a24');  // grip and sight
    if (sovRk) {
      m.ellipsoid(9.5, 3.5, 15.5, 2.8, 2.3, 2.3, '#4a4f3a', M_METAL); m.set(12, 3, 15, '#c8281e'); m.set(12, 4, 15, '#c8281e');   // bulbous rocket head, red tip
      m.box(-2, 2, 14, 0, 5, 17, '#3a4026', M_METAL);                                                       // flared rear venturi
      m.box(3, 3, 11, 4, 4, 14, '#6a4426');                                                                // wooden grip
      m.paint(-7, 2, 14, 7, 5, 17, (x, y, z) => (x === -3 || x === 2) ? '#3a3f26' : undefined);               // steel bands
    }
  } else if (RIF) {
    m.line(0, 2.5, 9.5, R ? 11 : 9, -1.5, R ? 11.9 : 11.5, C.gun, M_METAL);   // barrel, rising forward across the body
    m.line(0, 2.5, 10.5, R ? 11 : 9, -1.5, R ? 12.9 : 12.5, C.gun, M_METAL);
    m.box(-1, 2, 9, 2, 4, 11, wood);                                         // stock at the hip
    if (R) { m.line(3, 1.2, 10, 7, -0.6, 11.4, wood); m.line(3, 1.2, 11, 7, -0.6, 12.4, wood); m.box(4, 0, 8, 5, 1, 10.5, C.gun, M_METAL); m.box(5, 0, 8, 6, 1, 9, C.gun, M_METAL); }   // wooden handguard, curved magazine
    else m.box(4, 0, 9, 5, 1, 10.5, C.gun, M_METAL);                        // magazine
  }
  return m;
}
function mixHex(a, b, k) {
  const p = rgbInt(a), q = rgbInt(b), ch = (s) => Math.round(((p >> s) & 255) * (1 - k) + ((q >> s) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
// Uniform colours shared by the standing and prone figures.
function infKit(pal, faction) {
  const sov = faction === 'soviets';
  return {
    pants: shadeInt(pal.main, 0.74), web: '#3b3324', pouch: '#4a4630', skin: '#d6a07a',
    pack: mixHex(pal.dark, sov ? '#5e5644' : '#55603f', 0.6),
    helm: sov ? 0x52663a : mixHex(pal.main, '#6f7e4a', 0.3),
  };
}

// ---------------------------------------------------------------------------
// Structures (origin = top-left corner of the footprint)
// ---------------------------------------------------------------------------
// Airfield apron markings: taxi lines along the two rows of stands, a dashed centre line between
// them, stand boxes and threshold bars at the east end. soviet: concrete slabs instead of asphalt.
function airfieldMarks(x, y, soviet) {
  if (x < 26) return soviet && (x % 8 === 0 || y % 8 === 0) ? '#4c4c47' : undefined;
  for (const sy of [16, 52]) {
    if (y === sy && x > 26) return C.yellow;                             // taxi line through the stands
    for (const sx of [40, 74]) if ((Math.abs(x + 0.5 - sx) === 11.5 && Math.abs(y + 0.5 - sy) < 10) || (Math.abs(y + 0.5 - sy) === 9.5 && Math.abs(x + 0.5 - sx) < 12)) return C.white;   // stand boxes
  }
  if (y >= 33 && y < 35 && x > 30 && x < 90 && x % 10 < 5) return C.white;   // centre line
  if (x >= 91 && x < 95 && y > 4 && y < 68 && y % 3 === 0 && (y < 26 || y > 44)) return C.white;   // thresholds
  if (soviet && (x % 8 === 0 || y % 8 === 0)) return '#4c4c47';
}
// Coal plant parts (the Allied power plants).
function brickBox(m, x0, y0, z0, x1, y1, z1) {
  m.box(x0, y0, z0, x1, y1, z1, C.brick, M_ROUGH);
  m.paint(x0, y0, z0, x1, y1, z1, (x, y, z) => {
    if (z % 3 === 0) return '#76392c';                                     // mortar courses
    if (hash3(x, y, z) > 0.88) return '#9a5241';
    if (z > z1 - 4 && hash3(x >> 1, y, 4) > 0.55) return '#5c2f25';        // soot below the eaves
  });
}
// A pitched roof along x over a box, rising h above z, in the side's colour with darker seams.
function gableRoof(m, x0, y0, x1, y1, z, h, pal) {
  const mid = (y0 + y1) / 2, half = (y1 - y0) / 2;
  for (let y = y0 - 1; y < y1 + 1; y++) {
    const k = Math.round(h * (1 - Math.abs(y + 0.5 - mid) / (half + 1)));
    m.box(x0 - 1, y, z, x1 + 1, y + 1, z + 1 + k, pal.main, M_METAL);
  }
  m.paint(x0 - 1, y0 - 1, z, x1 + 1, y1 + 1, z + h + 2, (x) => (x % 5 === 0 ? pal.dark : undefined));
}
// A brick chimney, blackened toward the top, with a dark lip.
function chimneyV(m, x, y, z0, z1, r) {
  for (let z = z0; z < z1; z++) {
    const k = (z - z0) / (z1 - z0), rr = r * (1 - 0.18 * k);
    m.cylZ(x, y, z, z + 1, rr, k > 0.75 ? '#2f2a27' : k > 0.55 && hash3(z, 1, 2) > 0.4 ? '#4a2f28' : z % 3 === 0 ? '#76392c' : C.brick, M_ROUGH);
  }
  m.cylZ(x, y, z1 - 2, z1, r * 0.82 - 1, null);
  m.cylZ(x, y, z1 - 1, z1, r * 0.82 + 0.3, '#1c1a18', M_METAL);
}
// A heap of coal: a dark mound with glints.
function coalHeap(m, cx, cy, r, h) {
  m.ellipsoid(cx, cy, 1, r, r * 0.85, h, '#1f1d1b', M_ROUGH);
  m.paintTop(cx - r, cy - r, cx + r, cy + r, (x, y) => (hash3(x, y, 8) > 0.82 ? '#45423d' : hash3(x, y, 9) > 0.9 ? '#5c5953' : undefined));
}
// Where each power plant's smoke comes out: [x, y, height] from its corner, by faction.
function plantStacks(type, faction) {
  if (faction === 'soviets') return type === 'power' ? [[38.5, 15, 49]] : [[36, 21, 59]];
  return type === 'power' ? [[38, 12, 43], [9, 10, 31]] : [[15, 9, 50], [35, 9, 50]];
}

const STRUCTURES = {
  cy(pal) {
    const m = new VModel(-2, -2, 76, 76, 48);
    slabV(m, 0, 0, 72, 72);
    m.box(4, 6, 1, 68, 54, 14, C.wall, M_MATTE);
    for (let y = 6; y < 54; y++) {
      const h = Math.round(Math.sqrt(Math.max(0, 24 * 24 - (y + 0.5 - 30) ** 2)) * 0.5);
      if (h > 0) m.box(4, y, 14, 68, y + 1, 14 + h, pal.main, M_METAL);
    }
    m.paint(4, 6, 14, 68, 54, 30, (x, y, z) => x % 8 === 0 ? pal.dark : undefined);
    m.box(4, 6, 14, 5, 54, 27, pal.dark, M_METAL); m.box(67, 6, 14, 68, 54, 27, pal.dark, M_METAL);
    m.clear(22, 52, 1, 50, 54, 12);
    m.box(22, 52, 1, 50, 53, 12, '#3e3e3a', M_METAL);
    m.paint(22, 52, 1, 50, 53, 12, (x, y, z) => z % 2 ? '#2e2e2a' : undefined);
    hazardV(m, 19, 51, 1, 22, 55, 13); hazardV(m, 50, 51, 1, 53, 55, 13);
    m.paintTop(28, 58, 44, 70, (x, y) => (y - 58) % 4 < 2 ? C.yellow : undefined);
    m.box(64, 8, 1, 67, 11, 44, C.yellow, M_METAL);
    m.paint(64, 8, 1, 67, 11, 44, (x, y, z) => (z % 4 === 0 || (x + z) % 4 === 0) ? '#8a6c12' : undefined);
    m.box(28, 8, 42, 67, 11, 45, C.yellow, M_METAL);
    m.box(64, 7, 44, 68, 12, 46, '#5d5e58', M_METAL);
    m.line(32, 9.5, 41, 32, 9.5, 22, C.black);
    m.box(30, 8, 20, 34, 11, 22, C.gun, M_METAL);
    m.box(14, 16, 22, 15, 17, 26, C.gun);
    m.ellipsoid(14.5, 16.5, 27, 4, 4, 1.5, C.steel, M_METAL);
    return m;
  },
  // Power Plant (Allied): a small coal-fired station. A brick boiler house with tall windows under a
  // pitched roof in the side's colour, two soot-blackened chimneys, and a coal heap with a conveyor.
  power(pal) {
    const m = new VModel(-2, -2, 50, 50, 46);
    slabV(m, 0, 0, 48, 48);
    brickBox(m, 2, 18, 1, 30, 44, 15);
    gableRoof(m, 2, 18, 30, 44, 15, 6, pal);
    for (const x of [5, 11, 19, 25]) m.box(x, 43, 4, x + 3, 44, 13, '#55707e', M_GLASS);   // tall windows
    m.box(13, 43, 1, 17, 44, 8, '#2c2722');                               // door
    chimneyV(m, 38, 12, 1, 43, 3.6);
    chimneyV(m, 9, 10, 1, 31, 2.6);
    m.box(4, 6, 1, 16, 17, 9, '#6d6f6a', M_METAL);                         // ash hopper by the small stack
    coalHeap(m, 40, 36, 6.5, 5);
    m.line(36, 33, 4, 29, 28, 15, '#5b5d58', M_METAL); m.line(36, 34, 4, 29, 29, 15, '#5b5d58', M_METAL);   // conveyor
    return m;
  },
  // Radar Dome: a white radome on a low concrete block, with a mast and a dish beside it.
  dome(pal) {
    const m = new VModel(-2, -2, 50, 50, 46);
    slabV(m, 0, 0, 48, 48);
    m.box(4, 10, 1, 44, 44, 12, C.wall, M_MATTE);
    m.box(4, 10, 12, 44, 44, 13, pal.main, M_METAL);
    m.paint(4, 43, 1, 44, 44, 12, (x, y, z) => (z >= 5 && z <= 7 && x % 6 < 2) ? C.glass : undefined);
    m.box(30, 43, 1, 38, 44, 9, '#5d5e58', M_METAL);
    m.ellipsoid(22, 26, 12, 15, 15, 13, '#e6e4dc', M_MATTE);                       // the radome
    m.paint(7, 11, 13, 38, 42, 26, (x, y, z) => (z === 16 || z === 21) ? '#cfccc2' : undefined);   // panel seams
    m.cylZ(40, 14, 13, 30, 1, C.steel, M_METAL);                                   // mast and dish
    m.ellipsoid(40, 14, 31, 4, 1.5, 3, C.steel, M_METAL);
    m.set(40, 14, 35, '#ff4030', M_GLOW);
    return m;
  },
  // Advanced Power Plant (Allied): a big coal-fired station. A long brick boiler house with a
  // clerestory under a pitched roof, two tall sooty chimneys behind dust filters, a coal yard
  // with two heaps and a conveyor gantry, and a transformer bank.
  apower(pal) {
    const m = new VModel(-2, -2, 74, 74, 52);
    slabV(m, 0, 0, 72, 72);
    brickBox(m, 3, 32, 1, 50, 68, 20);
    gableRoof(m, 3, 32, 50, 68, 20, 7, pal);
    m.box(10, 46, 27, 44, 54, 31, '#55707e', M_GLASS);                     // clerestory along the ridge
    m.box(10, 46, 31, 44, 54, 32, pal.dark, M_METAL);
    for (let x = 6; x < 48; x += 6) m.box(x, 67, 4, x + 3, 68, 17, '#55707e', M_GLASS);   // tall windows
    for (const x of [8, 28]) {                                             // dust filters behind the hall
      m.box(x, 18, 1, x + 14, 31, 14, '#7a7c76', M_METAL);
      m.paint(x, 18, 1, x + 14, 31, 14, (xx, y, z) => ((xx - x) % 5 === 0 || z === 13 ? '#5d5f5a' : undefined));
    }
    chimneyV(m, 15, 9, 1, 50, 4.4);
    chimneyV(m, 35, 9, 1, 50, 4.4);
    for (const x of [15, 35]) m.cylY(9, 18, x, 10, 1.6, '#5b5d58', M_METAL);   // flues into the stacks
    coalHeap(m, 62, 20, 7.5, 7); coalHeap(m, 62, 44, 6.5, 6);
    m.box(52, 30, 1, 71, 34, 3, '#3d3a35', M_ROUGH);                       // yard track
    for (const y of [26, 40]) m.box(55, y, 1, 57, y + 2, 20, '#5b5d58', M_METAL);   // conveyor gantry legs
    m.box(48, 31, 18, 66, 34, 20, '#5b5d58', M_METAL);                     // the gantry, into the hall
    m.box(54, 56, 1, 70, 70, 7, '#5d5e58', M_METAL);                       // transformers
    m.paint(54, 56, 3, 70, 70, 7, (x, y) => (x % 4 === 0 || y % 5 === 0 ? '#46473f' : undefined));
    for (const x of [58, 66]) m.line(x, 63, 7, x, 63, 14, C.steel, M_METAL);
    return m;
  },
  // BLENDER:refinery_allies begin
  refinery(pal) {
    const m = new VModel(-2, -2, 74, 50, 56);
    m.box(-1, -1, 0, 73, 4, 1, '#6e6352', M_ROUGH);
    m.box(-1, 4, 0, 4, 49, 1, '#6e6352', M_ROUGH);
    m.box(4, 4, 0, 17, 17, 1, '#d6d3c9', M_MATTE);
    m.box(17, 4, 0, 73, 20, 1, '#6e6352', M_ROUGH);
    m.box(4, 17, 0, 17, 49, 1, '#6e6352', M_ROUGH);
    m.box(17, 20, 0, 57, 21, 1, '#6e6352', M_ROUGH);
    m.box(57, 20, 0, 59, 44, 4, '#dfe3df', M_METAL);
    m.box(59, 20, 0, 73, 21, 1, '#6e6352', M_ROUGH);
    m.box(17, 21, 0, 53, 22, 1, '#6e6352', M_ROUGH);
    m.box(53, 21, 0, 57, 43, 4, '#dfe3df', M_METAL);
    m.box(59, 21, 0, 63, 43, 4, '#dfe3df', M_METAL);
    m.box(63, 21, 0, 73, 22, 1, '#6e6352', M_ROUGH);
    m.box(17, 22, 0, 51, 23, 1, '#6e6352', M_ROUGH);
    m.box(51, 22, 0, 53, 42, 4, '#dfe3df', M_METAL);
    m.box(63, 22, 0, 65, 42, 4, '#dfe3df', M_METAL);
    m.box(65, 22, 0, 73, 23, 1, '#6e6352', M_ROUGH);
    m.box(17, 23, 0, 50, 24, 1, '#6e6352', M_ROUGH);
    m.box(50, 23, 0, 51, 41, 4, '#dfe3df', M_METAL);
    m.box(65, 23, 0, 66, 41, 4, '#dfe3df', M_METAL);
    m.box(66, 23, 0, 73, 24, 1, '#6e6352', M_ROUGH);
    m.box(17, 24, 0, 49, 25, 1, '#6e6352', M_ROUGH);
    m.box(49, 24, 0, 50, 40, 4, '#dfe3df', M_METAL);
    m.box(66, 24, 0, 67, 40, 4, '#dfe3df', M_METAL);
    m.box(67, 24, 0, 73, 25, 1, '#6e6352', M_ROUGH);
    m.box(17, 25, 0, 48, 27, 1, '#6e6352', M_ROUGH);
    m.box(48, 25, 0, 49, 39, 4, '#dfe3df', M_METAL);
    m.box(67, 25, 0, 68, 39, 4, '#dfe3df', M_METAL);
    m.box(68, 25, 0, 73, 27, 1, '#6e6352', M_ROUGH);
    m.box(17, 27, 0, 47, 31, 1, '#6e6352', M_ROUGH);
    m.box(47, 27, 0, 48, 37, 4, '#dfe3df', M_METAL);
    m.box(68, 27, 0, 69, 37, 4, '#dfe3df', M_METAL);
    m.box(69, 27, 0, 73, 31, 1, '#6e6352', M_ROUGH);
    m.box(17, 31, 0, 46, 49, 1, '#6e6352', M_ROUGH);
    m.box(46, 31, 0, 47, 33, 4, '#dfe3df', M_METAL);
    m.box(69, 31, 0, 70, 33, 4, '#dfe3df', M_METAL);
    m.box(70, 31, 0, 73, 49, 1, '#6e6352', M_ROUGH);
    m.box(46, 33, 0, 47, 49, 1, '#6e6352', M_ROUGH);
    m.box(69, 33, 0, 70, 49, 1, '#6e6352', M_ROUGH);
    m.box(47, 37, 0, 48, 49, 1, '#6e6352', M_ROUGH);
    m.box(68, 37, 0, 69, 49, 1, '#6e6352', M_ROUGH);
    m.box(48, 39, 0, 49, 49, 1, '#6e6352', M_ROUGH);
    m.box(67, 39, 0, 68, 49, 1, '#6e6352', M_ROUGH);
    m.box(49, 40, 0, 50, 49, 1, '#6e6352', M_ROUGH);
    m.box(66, 40, 0, 67, 49, 1, '#6e6352', M_ROUGH);
    m.box(50, 41, 0, 51, 49, 1, '#6e6352', M_ROUGH);
    m.box(65, 41, 0, 66, 49, 1, '#6e6352', M_ROUGH);
    m.box(51, 42, 0, 53, 49, 1, '#6e6352', M_ROUGH);
    m.box(63, 42, 0, 65, 49, 1, '#6e6352', M_ROUGH);
    m.box(53, 43, 0, 57, 49, 1, '#6e6352', M_ROUGH);
    m.box(59, 43, 0, 63, 49, 1, '#6e6352', M_ROUGH);
    m.box(57, 44, 0, 59, 49, 1, '#6e6352', M_ROUGH);
    m.box(4, 4, 1, 18, 18, 2, '#b9b6ac', M_MATTE);
    m.box(25, 14, 1, 27, 15, 24, '#5b5d58', M_METAL);
    m.box(25, 17, 1, 27, 18, 24, '#5b5d58', M_METAL);
    m.box(21, 18, 1, 23, 19, 22, '#5b5d58', M_METAL);
    m.box(53, 18, 1, 63, 19, 2, '#b2ada1', M_ROUGH);
    m.box(51, 19, 1, 55, 21, 2, '#b2ada1', M_ROUGH);
    m.box(55, 19, 1, 60, 20, 8, '#46484a', M_METAL);
    m.box(60, 19, 1, 65, 21, 2, '#b2ada1', M_ROUGH);
    m.box(49, 20, 1, 51, 23, 2, '#b2ada1', M_ROUGH);
    m.box(55, 20, 1, 56, 21, 2, '#b2ada1', M_ROUGH);
    m.box(56, 20, 1, 57, 21, 4, '#dfe3df', M_METAL);
    m.box(59, 20, 1, 60, 21, 4, '#dfe3df', M_METAL);
    m.box(65, 20, 1, 67, 23, 2, '#b2ada1', M_ROUGH);
    m.box(1, 21, 1, 21, 22, 3, '#b9b6ac', M_MATTE);
    m.box(21, 21, 1, 23, 22, 9, '#5b5d58', M_METAL);
    m.box(23, 21, 1, 46, 25, 3, '#b9b6ac', M_MATTE);
    m.box(48, 21, 1, 49, 25, 2, '#b2ada1', M_ROUGH);
    m.box(51, 21, 1, 53, 22, 2, '#b2ada1', M_ROUGH);
    m.box(63, 21, 1, 65, 22, 2, '#b2ada1', M_ROUGH);
    m.box(67, 21, 1, 68, 25, 2, '#b2ada1', M_ROUGH);
    m.box(1, 22, 1, 17, 44, 3, '#b9b6ac', M_MATTE);
    m.box(17, 22, 1, 19, 23, 20, '#5b5d58', M_METAL);
    m.box(19, 22, 1, 23, 44, 3, '#b9b6ac', M_MATTE);
    m.box(47, 22, 1, 48, 27, 2, '#b2ada1', M_ROUGH);
    m.box(68, 22, 1, 69, 27, 2, '#b2ada1', M_ROUGH);
    m.box(17, 23, 1, 19, 25, 3, '#b9b6ac', M_MATTE);
    m.box(46, 23, 1, 47, 30, 2, '#b2ada1', M_ROUGH);
    m.box(49, 23, 1, 50, 24, 2, '#b2ada1', M_ROUGH);
    m.box(66, 23, 1, 67, 24, 2, '#b2ada1', M_ROUGH);
    m.box(69, 23, 1, 70, 30, 2, '#b2ada1', M_ROUGH);
    m.box(17, 25, 1, 19, 26, 20, '#5b5d58', M_METAL);
    m.box(23, 25, 1, 45, 27, 3, '#b9b6ac', M_MATTE);
    m.box(45, 25, 1, 46, 39, 2, '#b2ada1', M_ROUGH);
    m.box(70, 25, 1, 71, 39, 2, '#b2ada1', M_ROUGH);
    m.box(17, 26, 1, 19, 44, 3, '#b9b6ac', M_MATTE);
    m.box(23, 27, 1, 44, 44, 3, '#b9b6ac', M_MATTE);
    m.box(44, 27, 1, 45, 37, 2, '#b2ada1', M_ROUGH);
    m.box(71, 27, 1, 72, 37, 2, '#b2ada1', M_ROUGH);
    m.box(46, 30, 1, 47, 31, 4, '#dfe3df', M_METAL);
    m.box(69, 30, 1, 70, 31, 4, '#dfe3df', M_METAL);
    m.box(46, 33, 1, 47, 34, 4, '#dfe3df', M_METAL);
    m.box(69, 33, 1, 70, 34, 4, '#dfe3df', M_METAL);
    m.box(46, 34, 1, 47, 41, 2, '#b2ada1', M_ROUGH);
    m.box(69, 34, 1, 70, 41, 2, '#b2ada1', M_ROUGH);
    m.box(44, 37, 1, 45, 44, 3, '#b9b6ac', M_MATTE);
    m.box(47, 37, 1, 48, 42, 2, '#b2ada1', M_ROUGH);
    m.box(68, 37, 1, 69, 42, 2, '#b2ada1', M_ROUGH);
    m.box(45, 39, 1, 46, 44, 3, '#b9b6ac', M_MATTE);
    m.box(48, 39, 1, 49, 43, 2, '#b2ada1', M_ROUGH);
    m.box(67, 39, 1, 68, 43, 2, '#b2ada1', M_ROUGH);
    m.box(49, 40, 1, 50, 44, 2, '#b2ada1', M_ROUGH);
    m.box(66, 40, 1, 67, 44, 2, '#b2ada1', M_ROUGH);
    m.box(50, 41, 1, 51, 44, 2, '#b2ada1', M_ROUGH);
    m.box(65, 41, 1, 66, 44, 2, '#b2ada1', M_ROUGH);
    m.box(51, 42, 1, 53, 45, 2, '#b2ada1', M_ROUGH);
    m.box(63, 42, 1, 65, 45, 2, '#b2ada1', M_ROUGH);
    m.box(53, 43, 1, 56, 46, 2, '#b2ada1', M_ROUGH);
    m.box(56, 43, 1, 57, 44, 4, '#dfe3df', M_METAL);
    m.box(59, 43, 1, 60, 44, 4, '#dfe3df', M_METAL);
    m.box(60, 43, 1, 63, 46, 2, '#b2ada1', M_ROUGH);
    m.box(7, 44, 1, 9, 45, 6, '#b9b6ac', M_MATTE);
    m.box(15, 44, 1, 17, 45, 6, '#b9b6ac', M_MATTE);
    m.box(23, 44, 1, 25, 45, 6, '#b9b6ac', M_MATTE);
    m.box(29, 44, 1, 42, 45, 10, '#46484a', M_METAL);
    m.box(56, 44, 1, 60, 46, 2, '#b2ada1', M_ROUGH);
    m.box(26, 45, 1, 27, 47, 4, '#d0a426', M_MATTE);
    m.box(45, 45, 1, 46, 47, 4, '#d0a426', M_MATTE);
    m.box(27, 47, 1, 28, 48, 11, '#b9b6ac', M_MATTE);
    m.box(44, 47, 1, 45, 48, 11, '#b9b6ac', M_MATTE);
    m.box(4, 4, 2, 17, 17, 8, '#d6d3c9', M_MATTE);
    m.box(29, 4, 2, 35, 14, 7, '#e4e2d8', M_METAL);
    m.box(43, 4, 2, 47, 14, 7, '#e4e2d8', M_METAL);
    m.box(57, 4, 2, 59, 14, 7, '#e4e2d8', M_METAL);
    m.box(28, 5, 2, 29, 13, 7, '#e4e2d8', M_METAL);
    m.box(35, 5, 2, 36, 13, 7, '#e4e2d8', M_METAL);
    m.box(41, 5, 2, 43, 13, 7, '#e4e2d8', M_METAL);
    m.box(47, 5, 2, 49, 13, 7, '#e4e2d8', M_METAL);
    m.box(55, 5, 2, 57, 13, 7, '#e4e2d8', M_METAL);
    m.box(59, 5, 2, 61, 13, 7, '#e4e2d8', M_METAL);
    m.box(27, 6, 2, 28, 12, 7, '#e4e2d8', M_METAL);
    m.box(36, 6, 2, 37, 12, 7, '#e4e2d8', M_METAL);
    m.box(54, 6, 2, 55, 12, 7, '#e4e2d8', M_METAL);
    m.box(61, 6, 2, 62, 12, 7, '#e4e2d8', M_METAL);
    m.box(40, 7, 2, 41, 11, 7, '#e4e2d8', M_METAL);
    m.box(49, 7, 2, 50, 11, 7, '#e4e2d8', M_METAL);
    m.box(53, 8, 2, 54, 10, 7, '#e4e2d8', M_METAL);
    m.box(62, 8, 2, 63, 10, 7, '#e4e2d8', M_METAL);
    m.box(31, 14, 2, 33, 15, 32, '#7f8480', M_METAL);
    m.box(44, 14, 2, 46, 15, 26, '#7f8480', M_METAL);
    m.box(57, 14, 2, 59, 15, 20, '#7f8480', M_METAL);
    m.box(45, 25, 2, 46, 39, 3, '#b9b6ac', M_MATTE);
    m.box(44, 27, 2, 45, 37, 3, '#b9b6ac', M_MATTE);
    m.box(2, 22, 3, 17, 44, 9, '#d6d3c9', M_MATTE);
    m.box(19, 22, 3, 46, 44, 12, '#d6d3c9', M_MATTE);
    m.box(17, 23, 3, 19, 25, 12, '#d6d3c9', M_MATTE);
    m.box(17, 26, 3, 19, 44, 12, '#d6d3c9', M_MATTE);
    m.box(53, 20, 4, 63, 44, 6, pal.main, M_MATTE);
    m.box(51, 21, 4, 53, 43, 6, pal.main, M_MATTE);
    m.box(63, 21, 4, 65, 43, 6, pal.main, M_MATTE);
    m.box(50, 22, 4, 51, 42, 6, pal.main, M_MATTE);
    m.box(65, 22, 4, 66, 42, 6, pal.main, M_MATTE);
    m.box(49, 23, 4, 50, 41, 6, pal.main, M_MATTE);
    m.box(66, 23, 4, 67, 41, 6, pal.main, M_MATTE);
    m.box(48, 24, 4, 49, 40, 6, pal.main, M_MATTE);
    m.box(67, 24, 4, 68, 40, 6, pal.main, M_MATTE);
    m.box(47, 25, 4, 48, 39, 6, pal.main, M_MATTE);
    m.box(68, 25, 4, 69, 39, 6, pal.main, M_MATTE);
    m.box(46, 27, 4, 47, 37, 6, pal.main, M_MATTE);
    m.box(69, 27, 4, 70, 37, 6, pal.main, M_MATTE);
    m.box(53, 21, 6, 63, 43, 7, '#dfe3df', M_METAL);
    m.box(52, 22, 6, 53, 42, 7, '#dfe3df', M_METAL);
    m.box(63, 22, 6, 64, 42, 7, '#dfe3df', M_METAL);
    m.box(50, 23, 6, 52, 41, 7, '#dfe3df', M_METAL);
    m.box(64, 23, 6, 66, 41, 7, '#dfe3df', M_METAL);
    m.box(49, 24, 6, 50, 40, 7, '#dfe3df', M_METAL);
    m.box(66, 24, 6, 67, 40, 7, '#dfe3df', M_METAL);
    m.box(48, 26, 6, 49, 38, 7, '#dfe3df', M_METAL);
    m.box(67, 26, 6, 68, 38, 7, '#dfe3df', M_METAL);
    m.box(47, 27, 6, 48, 37, 7, '#dfe3df', M_METAL);
    m.box(68, 27, 6, 69, 37, 7, '#dfe3df', M_METAL);
    m.box(5, 44, 6, 11, 45, 10, '#35505f', M_GLASS);
    m.box(13, 44, 6, 19, 45, 10, '#35505f', M_GLASS);
    m.box(21, 44, 6, 27, 45, 10, '#35505f', M_GLASS);
    m.box(30, 3, 7, 34, 14, 8, '#b9b6ac', M_ROUGH);
    m.box(28, 4, 7, 30, 14, 8, '#b9b6ac', M_ROUGH);
    m.box(34, 4, 7, 36, 14, 8, '#b9b6ac', M_ROUGH);
    m.box(42, 4, 7, 48, 14, 8, '#b9b6ac', M_ROUGH);
    m.box(56, 4, 7, 60, 14, 8, '#b9b6ac', M_ROUGH);
    m.box(27, 5, 7, 28, 13, 8, '#b9b6ac', M_ROUGH);
    m.box(36, 5, 7, 37, 13, 8, '#b9b6ac', M_ROUGH);
    m.box(41, 5, 7, 42, 13, 8, '#b9b6ac', M_ROUGH);
    m.box(48, 5, 7, 49, 13, 8, '#b9b6ac', M_ROUGH);
    m.box(54, 5, 7, 56, 13, 8, '#b9b6ac', M_ROUGH);
    m.box(60, 5, 7, 62, 13, 8, '#b9b6ac', M_ROUGH);
    m.box(40, 6, 7, 41, 12, 8, '#b9b6ac', M_ROUGH);
    m.box(49, 6, 7, 50, 12, 8, '#b9b6ac', M_ROUGH);
    m.box(26, 7, 7, 27, 11, 8, '#b9b6ac', M_ROUGH);
    m.box(37, 7, 7, 38, 11, 8, '#b9b6ac', M_ROUGH);
    m.box(53, 7, 7, 54, 11, 8, '#b9b6ac', M_ROUGH);
    m.box(62, 7, 7, 63, 11, 8, '#b9b6ac', M_ROUGH);
    m.box(30, 14, 7, 31, 15, 8, '#b9b6ac', M_ROUGH);
    m.box(33, 14, 7, 34, 15, 8, '#b9b6ac', M_ROUGH);
    m.box(55, 21, 7, 61, 43, 8, '#dfe3df', M_METAL);
    m.box(53, 22, 7, 55, 42, 9, '#dfe3df', M_METAL);
    m.box(61, 22, 7, 63, 42, 9, '#dfe3df', M_METAL);
    m.box(51, 23, 7, 53, 41, 8, '#dfe3df', M_METAL);
    m.box(63, 23, 7, 65, 41, 8, '#dfe3df', M_METAL);
    m.box(50, 24, 7, 51, 40, 9, '#dfe3df', M_METAL);
    m.box(65, 24, 7, 66, 40, 9, '#dfe3df', M_METAL);
    m.box(49, 25, 7, 50, 39, 8, '#dfe3df', M_METAL);
    m.box(66, 25, 7, 67, 39, 8, '#dfe3df', M_METAL);
    m.box(48, 27, 7, 49, 37, 9, '#dfe3df', M_METAL);
    m.box(67, 27, 7, 68, 37, 9, '#dfe3df', M_METAL);
    m.box(47, 29, 7, 48, 35, 8, '#dfe3df', M_METAL);
    m.box(68, 29, 7, 69, 35, 8, '#dfe3df', M_METAL);
    m.box(4, 4, 8, 18, 18, 12, '#35505f', M_GLASS);
    m.box(29, 4, 8, 35, 14, 14, '#e4e2d8', M_METAL);
    m.box(43, 4, 8, 47, 14, 14, '#e4e2d8', M_METAL);
    m.box(57, 4, 8, 59, 14, 14, '#e4e2d8', M_METAL);
    m.box(28, 5, 8, 29, 13, 14, '#e4e2d8', M_METAL);
    m.box(35, 5, 8, 36, 13, 14, '#e4e2d8', M_METAL);
    m.box(41, 5, 8, 43, 13, 14, '#e4e2d8', M_METAL);
    m.box(47, 5, 8, 49, 13, 14, '#e4e2d8', M_METAL);
    m.box(55, 5, 8, 57, 13, 14, '#e4e2d8', M_METAL);
    m.box(59, 5, 8, 61, 13, 14, '#e4e2d8', M_METAL);
    m.box(27, 6, 8, 28, 12, 14, '#e4e2d8', M_METAL);
    m.box(36, 6, 8, 37, 12, 14, '#e4e2d8', M_METAL);
    m.box(54, 6, 8, 55, 12, 14, '#e4e2d8', M_METAL);
    m.box(61, 6, 8, 62, 12, 14, '#e4e2d8', M_METAL);
    m.box(40, 7, 8, 41, 11, 14, '#e4e2d8', M_METAL);
    m.box(49, 7, 8, 50, 11, 14, '#e4e2d8', M_METAL);
    m.box(53, 8, 8, 54, 10, 14, '#e4e2d8', M_METAL);
    m.box(62, 8, 8, 63, 10, 14, '#e4e2d8', M_METAL);
    m.box(57, 21, 8, 59, 43, 9, '#dfe3df', M_METAL);
    m.box(55, 22, 8, 57, 42, 10, '#dfe3df', M_METAL);
    m.box(59, 22, 8, 61, 42, 10, '#dfe3df', M_METAL);
    m.box(52, 23, 8, 53, 41, 10, '#dfe3df', M_METAL);
    m.box(63, 23, 8, 64, 41, 10, '#dfe3df', M_METAL);
    m.box(51, 24, 8, 52, 40, 10, '#dfe3df', M_METAL);
    m.box(64, 24, 8, 65, 40, 10, '#dfe3df', M_METAL);
    m.box(49, 26, 8, 50, 38, 10, '#dfe3df', M_METAL);
    m.box(66, 26, 8, 67, 38, 10, '#dfe3df', M_METAL);
    m.box(47, 31, 8, 48, 33, 9, '#dfe3df', M_METAL);
    m.box(68, 31, 8, 69, 33, 9, '#dfe3df', M_METAL);
    m.box(9, 19, 9, 11, 23, 12, '#5b5d58', M_METAL);
    m.box(4, 20, 9, 8, 22, 12, '#7f8480', M_METAL);
    m.box(8, 20, 9, 9, 22, 12, '#5b5d58', M_METAL);
    m.box(11, 20, 9, 12, 22, 12, '#5b5d58', M_METAL);
    m.box(12, 20, 9, 22, 22, 12, '#7f8480', M_METAL);
    m.box(22, 21, 9, 23, 22, 22, '#5b5d58', M_METAL);
    m.box(2, 22, 9, 9, 44, 12, '#d6d3c9', M_MATTE);
    m.box(11, 22, 9, 17, 44, 12, '#d6d3c9', M_MATTE);
    m.box(54, 22, 9, 55, 42, 10, '#dfe3df', M_METAL);
    m.box(57, 22, 9, 59, 42, 11, '#dfe3df', M_METAL);
    m.box(61, 22, 9, 62, 42, 10, '#dfe3df', M_METAL);
    m.box(9, 23, 9, 11, 44, 12, '#d6d3c9', M_MATTE);
    m.box(53, 23, 9, 54, 41, 11, '#dfe3df', M_METAL);
    m.box(62, 23, 9, 63, 41, 11, '#dfe3df', M_METAL);
    m.box(50, 25, 9, 51, 39, 10, '#dfe3df', M_METAL);
    m.box(65, 25, 9, 66, 39, 10, '#dfe3df', M_METAL);
    m.box(48, 28, 9, 49, 36, 10, '#dfe3df', M_METAL);
    m.box(67, 28, 9, 68, 36, 10, '#dfe3df', M_METAL);
    m.box(56, 22, 10, 57, 42, 11, '#dfe3df', M_METAL);
    m.box(59, 22, 10, 60, 42, 11, '#dfe3df', M_METAL);
    m.box(54, 23, 10, 56, 41, 11, '#dfe3df', M_METAL);
    m.box(60, 23, 10, 62, 41, 11, '#dfe3df', M_METAL);
    m.box(52, 24, 10, 53, 40, 11, '#dfe3df', M_METAL);
    m.box(63, 24, 10, 64, 40, 11, '#dfe3df', M_METAL);
    m.box(51, 25, 10, 52, 39, 11, '#dfe3df', M_METAL);
    m.box(64, 25, 10, 65, 39, 11, '#dfe3df', M_METAL);
    m.box(50, 26, 10, 51, 38, 11, '#dfe3df', M_METAL);
    m.box(65, 26, 10, 66, 38, 11, '#dfe3df', M_METAL);
    m.box(49, 27, 10, 50, 37, 11, '#dfe3df', M_METAL);
    m.box(66, 27, 10, 67, 37, 11, '#dfe3df', M_METAL);
    m.box(48, 30, 10, 49, 34, 11, '#dfe3df', M_METAL);
    m.box(67, 30, 10, 68, 34, 11, '#dfe3df', M_METAL);
    m.box(7, 44, 10, 9, 45, 11, '#b9b6ac', M_MATTE);
    m.box(15, 44, 10, 17, 45, 11, '#b9b6ac', M_MATTE);
    m.box(23, 44, 10, 25, 45, 11, '#b9b6ac', M_MATTE);
    m.box(28, 44, 10, 44, 46, 11, pal.main, M_MATTE);
    m.box(55, 20, 11, 61, 44, 12, pal.dark, M_MATTE);
    m.box(52, 21, 11, 55, 43, 12, pal.dark, M_MATTE);
    m.box(61, 21, 11, 64, 43, 12, pal.dark, M_MATTE);
    m.box(51, 22, 11, 52, 42, 12, pal.dark, M_MATTE);
    m.box(64, 22, 11, 65, 42, 12, pal.dark, M_MATTE);
    m.box(50, 23, 11, 51, 41, 12, pal.dark, M_MATTE);
    m.box(65, 23, 11, 66, 41, 12, pal.dark, M_MATTE);
    m.box(49, 24, 11, 50, 40, 12, pal.dark, M_MATTE);
    m.box(66, 24, 11, 67, 40, 12, pal.dark, M_MATTE);
    m.box(48, 25, 11, 49, 39, 12, pal.dark, M_MATTE);
    m.box(67, 25, 11, 68, 39, 12, pal.dark, M_MATTE);
    m.box(47, 26, 11, 48, 38, 12, pal.dark, M_MATTE);
    m.box(68, 26, 11, 69, 38, 12, pal.dark, M_MATTE);
    m.box(46, 29, 11, 47, 35, 12, pal.dark, M_MATTE);
    m.box(69, 29, 11, 70, 35, 12, pal.dark, M_MATTE);
    m.box(2, 45, 11, 4, 47, 12, '#34362f', M_METAL);
    m.box(27, 45, 11, 45, 48, 12, '#d6d3c9', M_MATTE);
    m.box(59, 45, 11, 61, 47, 12, '#34362f', M_METAL);
    m.box(4, 4, 12, 18, 18, 13, pal.main, M_MATTE);
    m.box(21, 21, 12, 22, 22, 22, '#5b5d58', M_METAL);
    m.box(1, 22, 12, 17, 44, 13, pal.main, M_METAL);
    m.box(19, 22, 12, 47, 44, 13, pal.main, M_METAL);
    m.box(17, 23, 12, 19, 25, 15, pal.main, M_METAL);
    m.box(54, 24, 12, 62, 40, 13, '#dfe3df', M_METAL);
    m.box(53, 25, 12, 54, 39, 13, '#dfe3df', M_METAL);
    m.box(62, 25, 12, 63, 39, 13, '#dfe3df', M_METAL);
    m.box(17, 26, 12, 19, 44, 13, pal.main, M_METAL);
    m.box(52, 26, 12, 53, 38, 13, '#dfe3df', M_METAL);
    m.box(63, 26, 12, 64, 38, 13, '#dfe3df', M_METAL);
    m.box(51, 27, 12, 52, 37, 13, '#dfe3df', M_METAL);
    m.box(64, 27, 12, 65, 37, 13, '#dfe3df', M_METAL);
    m.box(50, 28, 12, 51, 36, 13, '#dfe3df', M_METAL);
    m.box(65, 28, 12, 66, 36, 13, '#dfe3df', M_METAL);
    m.box(4, 4, 13, 17, 17, 16, '#d6d3c9', M_MATTE);
    m.box(2, 23, 13, 17, 43, 14, pal.main, M_METAL);
    m.box(19, 23, 13, 46, 43, 14, pal.main, M_METAL);
    m.box(57, 24, 13, 59, 40, 14, '#dfe3df', M_METAL);
    m.box(54, 25, 13, 57, 39, 14, '#dfe3df', M_METAL);
    m.box(59, 25, 13, 62, 39, 14, '#dfe3df', M_METAL);
    m.box(17, 26, 13, 19, 43, 14, pal.main, M_METAL);
    m.box(53, 26, 13, 54, 38, 14, '#dfe3df', M_METAL);
    m.box(62, 26, 13, 63, 38, 14, '#dfe3df', M_METAL);
    m.box(52, 27, 13, 53, 37, 14, '#dfe3df', M_METAL);
    m.box(63, 27, 13, 64, 37, 14, '#dfe3df', M_METAL);
    m.box(51, 28, 13, 52, 36, 14, '#dfe3df', M_METAL);
    m.box(64, 28, 13, 65, 36, 14, '#dfe3df', M_METAL);
    m.box(50, 31, 13, 51, 33, 14, '#dfe3df', M_METAL);
    m.box(65, 31, 13, 66, 33, 14, '#dfe3df', M_METAL);
    m.box(30, 3, 14, 34, 14, 15, '#b9b6ac', M_ROUGH);
    m.box(28, 4, 14, 30, 14, 15, '#b9b6ac', M_ROUGH);
    m.box(34, 4, 14, 36, 14, 15, '#b9b6ac', M_ROUGH);
    m.box(42, 4, 14, 48, 14, 15, '#b9b6ac', M_ROUGH);
    m.box(55, 4, 14, 56, 5, 18, pal.main, M_MATTE);
    m.box(56, 4, 14, 60, 14, 15, '#b9b6ac', M_ROUGH);
    m.box(60, 4, 14, 61, 5, 18, pal.main, M_MATTE);
    m.box(27, 5, 14, 28, 13, 15, '#b9b6ac', M_ROUGH);
    m.box(36, 5, 14, 37, 13, 15, '#b9b6ac', M_ROUGH);
    m.box(41, 5, 14, 42, 13, 15, '#b9b6ac', M_ROUGH);
    m.box(48, 5, 14, 49, 13, 15, '#b9b6ac', M_ROUGH);
    m.box(54, 5, 14, 56, 13, 15, '#b9b6ac', M_ROUGH);
    m.box(60, 5, 14, 62, 13, 15, '#b9b6ac', M_ROUGH);
    m.box(40, 6, 14, 41, 12, 15, '#b9b6ac', M_ROUGH);
    m.box(49, 6, 14, 50, 12, 15, '#b9b6ac', M_ROUGH);
    m.box(53, 6, 14, 54, 7, 18, pal.main, M_MATTE);
    m.box(62, 6, 14, 63, 7, 18, pal.main, M_MATTE);
    m.box(26, 7, 14, 27, 11, 15, '#b9b6ac', M_ROUGH);
    m.box(37, 7, 14, 38, 11, 15, '#b9b6ac', M_ROUGH);
    m.box(53, 7, 14, 54, 11, 15, '#b9b6ac', M_ROUGH);
    m.box(62, 7, 14, 63, 11, 15, '#b9b6ac', M_ROUGH);
    m.box(53, 11, 14, 54, 12, 18, pal.main, M_MATTE);
    m.box(62, 11, 14, 63, 12, 18, pal.main, M_MATTE);
    m.box(55, 13, 14, 56, 14, 18, pal.main, M_MATTE);
    m.box(60, 13, 14, 61, 14, 18, pal.main, M_MATTE);
    m.box(30, 14, 14, 31, 15, 15, '#b9b6ac', M_ROUGH);
    m.box(33, 14, 14, 34, 15, 15, '#b9b6ac', M_ROUGH);
    m.box(3, 23, 14, 17, 42, 15, pal.main, M_METAL);
    m.box(19, 23, 14, 45, 42, 15, pal.main, M_METAL);
    m.box(57, 25, 14, 59, 31, 15, '#dfe3df', M_METAL);
    m.box(17, 26, 14, 19, 42, 15, pal.main, M_METAL);
    m.box(54, 26, 14, 57, 38, 15, '#dfe3df', M_METAL);
    m.box(59, 26, 14, 62, 38, 15, '#dfe3df', M_METAL);
    m.box(53, 27, 14, 54, 37, 15, '#dfe3df', M_METAL);
    m.box(62, 27, 14, 63, 37, 15, '#dfe3df', M_METAL);
    m.box(52, 28, 14, 53, 36, 15, '#dfe3df', M_METAL);
    m.box(63, 28, 14, 64, 36, 15, '#dfe3df', M_METAL);
    m.box(51, 31, 14, 52, 33, 15, '#dfe3df', M_METAL);
    m.box(57, 31, 14, 59, 33, 20, '#eceae0', M_METAL);
    m.box(64, 31, 14, 65, 33, 15, '#dfe3df', M_METAL);
    m.box(57, 33, 14, 59, 39, 15, '#dfe3df', M_METAL);
    m.box(29, 4, 15, 35, 14, 25, '#e4e2d8', M_METAL);
    m.box(43, 4, 15, 47, 14, 20, '#e4e2d8', M_METAL);
    m.box(56, 4, 15, 60, 14, 18, pal.main, M_MATTE);
    m.box(28, 5, 15, 29, 13, 25, '#e4e2d8', M_METAL);
    m.box(35, 5, 15, 36, 13, 20, '#e4e2d8', M_METAL);
    m.box(41, 5, 15, 43, 13, 20, '#e4e2d8', M_METAL);
    m.box(47, 5, 15, 49, 13, 20, '#e4e2d8', M_METAL);
    m.box(54, 5, 15, 56, 13, 18, pal.main, M_MATTE);
    m.box(60, 5, 15, 62, 13, 18, pal.main, M_MATTE);
    m.box(27, 6, 15, 28, 12, 26, '#e4e2d8', M_METAL);
    m.box(36, 6, 15, 37, 12, 20, '#e4e2d8', M_METAL);
    m.box(40, 7, 15, 41, 11, 20, '#e4e2d8', M_METAL);
    m.box(49, 7, 15, 50, 11, 20, '#e4e2d8', M_METAL);
    m.box(53, 7, 15, 54, 11, 18, pal.main, M_MATTE);
    m.box(62, 7, 15, 63, 11, 18, pal.main, M_MATTE);
    m.box(4, 24, 15, 44, 25, 16, pal.main, M_METAL);
    m.box(4, 25, 15, 17, 29, 16, pal.main, M_METAL);
    m.box(19, 25, 15, 44, 41, 16, pal.main, M_METAL);
    m.box(17, 26, 15, 19, 30, 16, pal.main, M_METAL);
    m.box(56, 27, 15, 60, 29, 16, '#dfe3df', M_METAL);
    m.box(54, 28, 15, 56, 31, 16, '#dfe3df', M_METAL);
    m.box(60, 28, 15, 62, 31, 16, '#dfe3df', M_METAL);
    m.box(4, 29, 15, 11, 30, 16, pal.main, M_METAL);
    m.box(11, 29, 15, 17, 37, 18, '#7f8480', M_METAL);
    m.box(56, 29, 15, 57, 30, 16, '#dfe3df', M_METAL);
    m.box(57, 29, 15, 59, 31, 19, '#eceae0', M_METAL);
    m.box(59, 29, 15, 60, 30, 16, '#dfe3df', M_METAL);
    m.box(4, 30, 15, 10, 31, 16, pal.main, M_METAL);
    m.box(10, 30, 15, 11, 36, 19, '#7f8480', M_METAL);
    m.box(17, 30, 15, 18, 36, 19, '#7f8480', M_METAL);
    m.box(18, 30, 15, 19, 31, 16, pal.main, M_METAL);
    m.box(53, 30, 15, 54, 34, 16, '#dfe3df', M_METAL);
    m.box(56, 30, 15, 57, 34, 20, '#eceae0', M_METAL);
    m.box(59, 30, 15, 60, 34, 20, '#eceae0', M_METAL);
    m.box(62, 30, 15, 63, 34, 16, '#dfe3df', M_METAL);
    m.box(4, 31, 15, 9, 41, 16, pal.main, M_METAL);
    m.box(9, 31, 15, 10, 35, 19, '#7f8480', M_METAL);
    m.box(18, 31, 15, 19, 35, 19, '#7f8480', M_METAL);
    m.box(54, 31, 15, 55, 36, 16, '#dfe3df', M_METAL);
    m.box(55, 31, 15, 56, 33, 19, '#eceae0', M_METAL);
    m.box(60, 31, 15, 61, 33, 19, '#eceae0', M_METAL);
    m.box(61, 31, 15, 62, 36, 16, '#dfe3df', M_METAL);
    m.box(55, 33, 15, 56, 36, 16, '#dfe3df', M_METAL);
    m.box(57, 33, 15, 59, 35, 19, '#eceae0', M_METAL);
    m.box(60, 33, 15, 61, 36, 16, '#dfe3df', M_METAL);
    m.box(56, 34, 15, 57, 37, 16, '#dfe3df', M_METAL);
    m.box(59, 34, 15, 60, 37, 16, '#dfe3df', M_METAL);
    m.box(9, 35, 15, 10, 41, 16, pal.main, M_METAL);
    m.box(18, 35, 15, 19, 41, 16, pal.main, M_METAL);
    m.box(57, 35, 15, 59, 37, 16, '#dfe3df', M_METAL);
    m.box(10, 36, 15, 11, 41, 16, pal.main, M_METAL);
    m.box(17, 36, 15, 18, 41, 16, pal.main, M_METAL);
    m.box(11, 37, 15, 17, 41, 16, pal.main, M_METAL);
    m.box(4, 4, 16, 18, 18, 20, '#35505f', M_GLASS);
    m.box(5, 25, 16, 17, 28, 17, pal.main, M_METAL);
    m.box(19, 25, 16, 43, 31, 17, pal.main, M_METAL);
    m.box(17, 26, 16, 19, 29, 18, pal.main, M_METAL);
    m.box(5, 28, 16, 11, 29, 17, pal.main, M_METAL);
    m.box(11, 28, 16, 17, 29, 19, '#7f8480', M_METAL);
    m.box(5, 29, 16, 10, 30, 17, pal.main, M_METAL);
    m.box(10, 29, 16, 11, 30, 19, '#7f8480', M_METAL);
    m.box(17, 29, 16, 18, 30, 19, '#7f8480', M_METAL);
    m.box(18, 29, 16, 19, 30, 18, pal.main, M_METAL);
    m.box(55, 29, 16, 56, 30, 17, '#dfe3df', M_METAL);
    m.box(56, 29, 16, 57, 30, 19, '#eceae0', M_METAL);
    m.box(59, 29, 16, 60, 30, 19, '#eceae0', M_METAL);
    m.box(5, 30, 16, 9, 31, 17, pal.main, M_METAL);
    m.box(9, 30, 16, 10, 31, 19, '#7f8480', M_METAL);
    m.box(18, 30, 16, 19, 31, 19, '#7f8480', M_METAL);
    m.box(55, 30, 16, 56, 31, 19, '#eceae0', M_METAL);
    m.box(60, 30, 16, 61, 31, 19, '#eceae0', M_METAL);
    m.box(5, 31, 16, 8, 40, 17, pal.main, M_METAL);
    m.box(8, 31, 16, 9, 35, 19, '#7f8480', M_METAL);
    m.box(19, 31, 16, 20, 35, 19, '#7f8480', M_METAL);
    m.box(20, 31, 16, 43, 40, 17, pal.main, M_METAL);
    m.box(55, 33, 16, 56, 34, 19, '#eceae0', M_METAL);
    m.box(60, 33, 16, 61, 34, 19, '#eceae0', M_METAL);
    m.box(56, 34, 16, 57, 35, 19, '#eceae0', M_METAL);
    m.box(59, 34, 16, 60, 35, 19, '#eceae0', M_METAL);
    m.box(8, 35, 16, 9, 40, 17, pal.main, M_METAL);
    m.box(9, 35, 16, 10, 36, 19, '#7f8480', M_METAL);
    m.box(18, 35, 16, 19, 36, 19, '#7f8480', M_METAL);
    m.box(19, 35, 16, 20, 40, 17, pal.main, M_METAL);
    m.box(9, 36, 16, 10, 40, 17, pal.main, M_METAL);
    m.box(10, 36, 16, 11, 37, 19, '#7f8480', M_METAL);
    m.box(17, 36, 16, 18, 37, 19, '#7f8480', M_METAL);
    m.box(18, 36, 16, 19, 40, 17, pal.main, M_METAL);
    m.box(10, 37, 16, 11, 40, 17, pal.main, M_METAL);
    m.box(11, 37, 16, 17, 38, 19, '#7f8480', M_METAL);
    m.box(17, 37, 16, 18, 40, 17, pal.main, M_METAL);
    m.box(11, 38, 16, 17, 40, 17, pal.main, M_METAL);
    m.box(6, 26, 17, 17, 28, 18, pal.main, M_METAL);
    m.box(19, 26, 17, 42, 30, 18, pal.main, M_METAL);
    m.box(6, 28, 17, 11, 29, 18, pal.main, M_METAL);
    m.box(6, 29, 17, 10, 30, 18, pal.main, M_METAL);
    m.box(55, 29, 17, 56, 30, 18, '#eceae0', M_METAL);
    m.box(60, 29, 17, 61, 30, 18, '#eceae0', M_METAL);
    m.box(6, 30, 17, 8, 39, 18, pal.main, M_METAL);
    m.box(8, 30, 17, 9, 31, 19, '#7f8480', M_METAL);
    m.box(19, 30, 17, 20, 31, 19, '#7f8480', M_METAL);
    m.box(20, 30, 17, 42, 39, 18, pal.main, M_METAL);
    m.box(55, 34, 17, 56, 35, 18, '#eceae0', M_METAL);
    m.box(60, 34, 17, 61, 35, 18, '#eceae0', M_METAL);
    m.box(8, 35, 17, 9, 36, 19, '#7f8480', M_METAL);
    m.box(19, 35, 17, 20, 36, 19, '#7f8480', M_METAL);
    m.box(8, 36, 17, 10, 39, 18, pal.main, M_METAL);
    m.box(18, 36, 17, 20, 39, 18, pal.main, M_METAL);
    m.box(10, 37, 17, 11, 39, 18, pal.main, M_METAL);
    m.box(17, 37, 17, 18, 39, 18, pal.main, M_METAL);
    m.box(11, 38, 17, 17, 39, 18, pal.main, M_METAL);
    m.box(57, 4, 18, 59, 14, 19, '#e4e2d8', M_METAL);
    m.box(55, 5, 18, 57, 13, 19, '#e4e2d8', M_METAL);
    m.box(59, 5, 18, 61, 13, 19, '#e4e2d8', M_METAL);
    m.box(54, 6, 18, 55, 12, 20, '#e4e2d8', M_METAL);
    m.box(61, 6, 18, 62, 12, 20, '#e4e2d8', M_METAL);
    m.box(53, 8, 18, 54, 10, 20, '#e4e2d8', M_METAL);
    m.box(62, 8, 18, 63, 10, 22, '#e4e2d8', M_METAL);
    m.box(7, 27, 18, 41, 28, 19, pal.main, M_METAL);
    m.box(7, 28, 18, 10, 29, 19, pal.main, M_METAL);
    m.box(10, 28, 18, 11, 29, 19, '#7f8480', M_METAL);
    m.box(17, 28, 18, 18, 29, 19, '#7f8480', M_METAL);
    m.box(18, 28, 18, 41, 29, 19, pal.main, M_METAL);
    m.box(7, 29, 18, 9, 30, 19, pal.main, M_METAL);
    m.box(9, 29, 18, 10, 30, 19, '#7f8480', M_METAL);
    m.box(11, 29, 18, 17, 31, 19, '#7f8480', M_METAL);
    m.box(18, 29, 18, 19, 30, 19, '#7f8480', M_METAL);
    m.box(19, 29, 18, 41, 30, 19, pal.main, M_METAL);
    m.box(7, 30, 18, 8, 31, 19, pal.main, M_METAL);
    m.box(20, 30, 18, 41, 31, 19, pal.main, M_METAL);
    m.box(7, 31, 18, 8, 35, 19, '#7f8480', M_METAL);
    m.box(11, 31, 18, 13, 32, 19, '#7f8480', M_METAL);
    m.box(13, 31, 18, 15, 35, 19, '#d2a62a', M_ROUGH);
    m.box(15, 31, 18, 17, 32, 19, '#7f8480', M_METAL);
    m.box(20, 31, 18, 21, 35, 19, '#7f8480', M_METAL);
    m.box(21, 31, 18, 41, 38, 19, pal.main, M_METAL);
    m.box(11, 32, 18, 12, 37, 19, '#7f8480', M_METAL);
    m.box(12, 32, 18, 13, 34, 19, '#d2a62a', M_ROUGH);
    m.box(15, 32, 18, 16, 34, 19, '#d2a62a', M_ROUGH);
    m.box(16, 32, 18, 17, 37, 19, '#7f8480', M_METAL);
    m.box(12, 34, 18, 13, 37, 19, '#7f8480', M_METAL);
    m.box(15, 34, 18, 16, 37, 19, '#7f8480', M_METAL);
    m.box(7, 35, 18, 8, 38, 19, pal.main, M_METAL);
    m.box(13, 35, 18, 15, 37, 19, '#7f8480', M_METAL);
    m.box(20, 35, 18, 21, 38, 19, pal.main, M_METAL);
    m.box(8, 36, 18, 9, 38, 19, pal.main, M_METAL);
    m.box(9, 36, 18, 10, 37, 19, '#7f8480', M_METAL);
    m.box(18, 36, 18, 19, 37, 19, '#7f8480', M_METAL);
    m.box(19, 36, 18, 20, 38, 19, pal.main, M_METAL);
    m.box(9, 37, 18, 10, 38, 19, pal.main, M_METAL);
    m.box(10, 37, 18, 11, 38, 19, '#7f8480', M_METAL);
    m.box(17, 37, 18, 18, 38, 19, '#7f8480', M_METAL);
    m.box(18, 37, 18, 19, 38, 19, pal.main, M_METAL);
    m.box(57, 4, 19, 59, 7, 20, '#e4e2d8', M_METAL);
    m.box(55, 5, 19, 57, 8, 20, '#e4e2d8', M_METAL);
    m.box(59, 5, 19, 61, 8, 20, '#e4e2d8', M_METAL);
    m.box(57, 7, 19, 59, 11, 24, '#cfd2cf', M_METAL);
    m.box(55, 8, 19, 56, 13, 20, '#e4e2d8', M_METAL);
    m.box(56, 8, 19, 57, 10, 25, '#cfd2cf', M_METAL);
    m.box(59, 8, 19, 60, 10, 25, '#cfd2cf', M_METAL);
    m.box(60, 8, 19, 61, 13, 20, '#e4e2d8', M_METAL);
    m.box(56, 10, 19, 57, 13, 20, '#e4e2d8', M_METAL);
    m.box(59, 10, 19, 60, 13, 20, '#e4e2d8', M_METAL);
    m.box(57, 11, 19, 59, 14, 20, '#e4e2d8', M_METAL);
    m.box(15, 24, 19, 16, 29, 22, '#7f8480', M_METAL);
    m.box(11, 25, 19, 14, 26, 20, '#5b5d58', M_METAL);
    m.box(14, 25, 19, 15, 28, 22, '#7f8480', M_METAL);
    m.box(16, 25, 19, 17, 28, 22, '#7f8480', M_METAL);
    m.box(10, 26, 19, 13, 40, 20, '#5b5d58', M_METAL);
    m.box(13, 26, 19, 14, 27, 22, '#7f8480', M_METAL);
    m.box(17, 26, 19, 18, 27, 23, '#7f8480', M_METAL);
    m.box(9, 27, 19, 10, 39, 20, '#5b5d58', M_METAL);
    m.box(13, 27, 19, 14, 41, 20, '#5b5d58', M_METAL);
    m.box(17, 27, 19, 19, 39, 20, '#5b5d58', M_METAL);
    m.box(8, 28, 19, 9, 38, 20, '#5b5d58', M_METAL);
    m.box(14, 28, 19, 15, 41, 20, '#5b5d58', M_METAL);
    m.box(16, 28, 19, 17, 41, 20, '#5b5d58', M_METAL);
    m.box(19, 28, 19, 20, 38, 20, '#5b5d58', M_METAL);
    m.box(7, 29, 19, 8, 37, 20, '#5b5d58', M_METAL);
    m.box(15, 29, 19, 16, 41, 20, '#5b5d58', M_METAL);
    m.box(20, 29, 19, 21, 37, 20, '#5b5d58', M_METAL);
    m.box(6, 30, 19, 7, 36, 20, '#5b5d58', M_METAL);
    m.box(21, 30, 19, 22, 36, 20, '#5b5d58', M_METAL);
    m.box(57, 30, 19, 59, 31, 20, '#eceae0', M_METAL);
    m.box(22, 31, 19, 41, 33, 20, pal.light, M_METAL);
    m.box(57, 33, 19, 59, 34, 20, '#eceae0', M_METAL);
    m.box(17, 39, 19, 18, 40, 20, '#5b5d58', M_METAL);
    m.box(11, 40, 19, 13, 41, 20, '#5b5d58', M_METAL);
    m.box(44, 3, 20, 46, 14, 24, pal.main, M_MATTE);
    m.box(4, 4, 20, 18, 18, 21, pal.main, M_MATTE);
    m.box(42, 4, 20, 44, 14, 24, pal.main, M_MATTE);
    m.box(46, 4, 20, 48, 14, 24, pal.main, M_MATTE);
    m.box(57, 4, 20, 59, 5, 22, '#e4e2d8', M_METAL);
    m.box(35, 5, 20, 36, 8, 26, '#e4e2d8', M_METAL);
    m.box(41, 5, 20, 42, 8, 24, pal.main, M_MATTE);
    m.box(48, 5, 20, 49, 8, 24, pal.main, M_MATTE);
    m.box(55, 5, 20, 56, 6, 21, '#e4e2d8', M_METAL);
    m.box(56, 5, 20, 60, 7, 24, '#cfd2cf', M_METAL);
    m.box(60, 5, 20, 61, 6, 21, '#e4e2d8', M_METAL);
    m.box(36, 6, 20, 37, 8, 26, '#e4e2d8', M_METAL);
    m.box(40, 6, 20, 41, 8, 24, pal.main, M_MATTE);
    m.box(49, 6, 20, 50, 8, 24, pal.main, M_MATTE);
    m.box(54, 6, 20, 55, 7, 21, '#e4e2d8', M_METAL);
    m.box(55, 6, 20, 56, 12, 24, '#cfd2cf', M_METAL);
    m.box(60, 6, 20, 61, 12, 24, '#cfd2cf', M_METAL);
    m.box(61, 6, 20, 62, 7, 21, '#e4e2d8', M_METAL);
    m.box(54, 7, 20, 55, 8, 24, '#cfd2cf', M_METAL);
    m.box(56, 7, 20, 57, 8, 24, '#cfd2cf', M_METAL);
    m.box(59, 7, 20, 60, 8, 24, '#cfd2cf', M_METAL);
    m.box(61, 7, 20, 62, 11, 24, '#cfd2cf', M_METAL);
    m.box(35, 8, 20, 42, 10, 22, '#7f8480', M_METAL);
    m.box(48, 8, 20, 55, 10, 22, '#7f8480', M_METAL);
    m.box(35, 10, 20, 37, 12, 26, '#e4e2d8', M_METAL);
    m.box(40, 10, 20, 42, 12, 24, pal.main, M_MATTE);
    m.box(48, 10, 20, 50, 12, 24, pal.main, M_MATTE);
    m.box(54, 10, 20, 55, 11, 24, '#cfd2cf', M_METAL);
    m.box(56, 10, 20, 57, 13, 24, '#cfd2cf', M_METAL);
    m.box(59, 10, 20, 60, 13, 24, '#cfd2cf', M_METAL);
    m.box(54, 11, 20, 55, 12, 21, '#e4e2d8', M_METAL);
    m.box(57, 11, 20, 59, 13, 24, '#cfd2cf', M_METAL);
    m.box(61, 11, 20, 62, 12, 21, '#e4e2d8', M_METAL);
    m.box(35, 12, 20, 36, 13, 26, '#e4e2d8', M_METAL);
    m.box(41, 12, 20, 42, 13, 24, pal.main, M_MATTE);
    m.box(48, 12, 20, 49, 13, 24, pal.main, M_MATTE);
    m.box(55, 12, 20, 56, 13, 21, '#e4e2d8', M_METAL);
    m.box(60, 12, 20, 61, 13, 21, '#e4e2d8', M_METAL);
    m.box(57, 13, 20, 59, 14, 22, '#e4e2d8', M_METAL);
    m.box(17, 22, 20, 19, 26, 23, '#7f8480', M_METAL);
    m.box(16, 23, 20, 17, 25, 23, '#7f8480', M_METAL);
    m.box(19, 23, 20, 20, 25, 24, '#7f8480', M_METAL);
    m.box(13, 27, 20, 14, 28, 22, '#7f8480', M_METAL);
    m.box(10, 28, 20, 14, 32, 21, '#d2a62a', M_ROUGH);
    m.box(14, 28, 20, 15, 29, 22, '#7f8480', M_METAL);
    m.box(16, 28, 20, 18, 38, 21, '#d2a62a', M_ROUGH);
    m.box(9, 29, 20, 10, 37, 21, '#d2a62a', M_ROUGH);
    m.box(14, 29, 20, 16, 33, 21, '#d2a62a', M_ROUGH);
    m.box(18, 29, 20, 19, 37, 21, '#d2a62a', M_ROUGH);
    m.box(8, 30, 20, 9, 36, 21, '#d2a62a', M_ROUGH);
    m.box(19, 30, 20, 20, 36, 21, '#d2a62a', M_ROUGH);
    m.box(7, 32, 20, 8, 34, 21, '#d2a62a', M_ROUGH);
    m.box(10, 32, 20, 11, 33, 21, '#d2a62a', M_ROUGH);
    m.box(11, 32, 20, 14, 36, 22, '#9a7414', M_ROUGH);
    m.box(20, 32, 20, 21, 34, 21, '#d2a62a', M_ROUGH);
    m.box(10, 33, 20, 11, 35, 22, '#9a7414', M_ROUGH);
    m.box(14, 33, 20, 15, 35, 22, '#9a7414', M_ROUGH);
    m.box(15, 33, 20, 16, 38, 21, '#d2a62a', M_ROUGH);
    m.box(10, 35, 20, 11, 38, 21, '#d2a62a', M_ROUGH);
    m.box(14, 35, 20, 15, 38, 21, '#d2a62a', M_ROUGH);
    m.box(11, 36, 20, 14, 38, 21, '#d2a62a', M_ROUGH);
    m.box(4, 4, 21, 17, 17, 24, '#d6d3c9', M_MATTE);
    m.box(55, 5, 21, 56, 6, 23, '#cfd2cf', M_METAL);
    m.box(60, 5, 21, 61, 6, 23, '#cfd2cf', M_METAL);
    m.box(54, 6, 21, 55, 7, 23, '#cfd2cf', M_METAL);
    m.box(61, 6, 21, 62, 7, 23, '#cfd2cf', M_METAL);
    m.box(54, 11, 21, 55, 12, 23, '#cfd2cf', M_METAL);
    m.box(61, 11, 21, 62, 12, 23, '#cfd2cf', M_METAL);
    m.box(55, 12, 21, 56, 13, 23, '#cfd2cf', M_METAL);
    m.box(60, 12, 21, 61, 13, 23, '#cfd2cf', M_METAL);
    m.box(19, 20, 21, 21, 23, 24, '#7f8480', M_METAL);
    m.box(18, 21, 21, 19, 22, 24, '#7f8480', M_METAL);
    m.box(21, 22, 21, 22, 23, 25, '#7f8480', M_METAL);
    m.box(20, 23, 21, 21, 24, 24, '#7f8480', M_METAL);
    m.box(13, 31, 21, 15, 32, 22, '#d2a62a', M_ROUGH);
    m.box(10, 32, 21, 11, 33, 22, '#9a7414', M_ROUGH);
    m.box(14, 32, 21, 15, 33, 22, '#9a7414', M_ROUGH);
    m.box(15, 32, 21, 16, 33, 22, '#d2a62a', M_ROUGH);
    m.box(9, 33, 21, 10, 35, 22, '#9a7414', M_ROUGH);
    m.box(15, 33, 21, 16, 35, 22, '#9a7414', M_ROUGH);
    m.box(10, 35, 21, 11, 36, 22, '#9a7414', M_ROUGH);
    m.box(14, 35, 21, 15, 36, 22, '#9a7414', M_ROUGH);
    m.box(35, 8, 22, 37, 10, 26, '#e4e2d8', M_METAL);
    m.box(39, 8, 22, 42, 10, 24, pal.main, M_MATTE);
    m.box(48, 8, 22, 51, 10, 24, pal.main, M_MATTE);
    m.box(54, 8, 22, 55, 10, 24, '#cfd2cf', M_METAL);
    m.box(22, 17, 22, 23, 22, 25, '#7f8480', M_METAL);
    m.box(21, 18, 22, 22, 22, 25, '#7f8480', M_METAL);
    m.box(23, 18, 22, 24, 21, 25, '#7f8480', M_METAL);
    m.box(20, 19, 22, 21, 20, 25, '#7f8480', M_METAL);
    m.box(24, 19, 22, 25, 20, 26, '#7f8480', M_METAL);
    m.box(15, 24, 22, 16, 26, 23, '#7f8480', M_METAL);
    m.box(16, 25, 22, 17, 27, 23, '#7f8480', M_METAL);
    m.box(17, 10, 23, 27, 12, 25, '#7f8480', M_METAL);
    m.box(24, 15, 23, 25, 19, 26, '#7f8480', M_METAL);
    m.box(23, 16, 23, 24, 18, 26, '#7f8480', M_METAL);
    m.box(25, 16, 23, 26, 17, 27, '#7f8480', M_METAL);
    m.box(25, 18, 23, 26, 19, 26, '#7f8480', M_METAL);
    m.box(17, 22, 23, 19, 23, 24, '#7f8480', M_METAL);
    m.box(18, 23, 23, 19, 24, 24, '#7f8480', M_METAL);
    m.box(4, 4, 24, 18, 10, 28, '#35505f', M_GLASS);
    m.box(43, 4, 24, 47, 14, 25, '#e4e2d8', M_METAL);
    m.box(41, 5, 24, 43, 13, 25, '#e4e2d8', M_METAL);
    m.box(47, 5, 24, 49, 13, 25, '#e4e2d8', M_METAL);
    m.box(40, 7, 24, 41, 11, 27, '#e4e2d8', M_METAL);
    m.box(49, 7, 24, 50, 11, 27, '#e4e2d8', M_METAL);
    m.box(57, 7, 24, 59, 8, 25, '#cfd2cf', M_METAL);
    m.box(57, 8, 24, 59, 10, 27, '#7f8480', M_METAL);
    m.box(4, 10, 24, 17, 18, 28, '#35505f', M_GLASS);
    m.box(57, 10, 24, 59, 11, 25, '#cfd2cf', M_METAL);
    m.box(17, 12, 24, 18, 18, 28, '#35505f', M_GLASS);
    m.box(26, 13, 24, 28, 17, 27, '#7f8480', M_METAL);
    m.box(25, 14, 24, 26, 16, 27, '#7f8480', M_METAL);
    m.box(28, 14, 24, 29, 16, 28, '#7f8480', M_METAL);
    m.box(25, 17, 24, 27, 18, 27, '#7f8480', M_METAL);
    m.box(19, 20, 24, 21, 21, 25, '#7f8480', M_METAL);
    m.box(20, 21, 24, 21, 22, 25, '#7f8480', M_METAL);
    m.box(29, 4, 25, 35, 11, 26, '#e4e2d8', M_METAL);
    m.box(43, 4, 25, 47, 6, 26, '#e4e2d8', M_METAL);
    m.box(28, 5, 25, 29, 11, 26, '#e4e2d8', M_METAL);
    m.box(41, 5, 25, 43, 8, 26, '#e4e2d8', M_METAL);
    m.box(47, 5, 25, 49, 8, 26, '#e4e2d8', M_METAL);
    m.box(43, 6, 25, 44, 7, 26, '#e4e2d8', M_METAL);
    m.box(44, 6, 25, 46, 12, 30, '#cfd2cf', M_METAL);
    m.box(46, 6, 25, 47, 7, 26, '#e4e2d8', M_METAL);
    m.box(43, 7, 25, 44, 11, 31, '#cfd2cf', M_METAL);
    m.box(46, 7, 25, 47, 11, 31, '#cfd2cf', M_METAL);
    m.box(41, 8, 25, 42, 13, 26, '#e4e2d8', M_METAL);
    m.box(42, 8, 25, 43, 10, 31, '#cfd2cf', M_METAL);
    m.box(47, 8, 25, 48, 10, 31, '#cfd2cf', M_METAL);
    m.box(48, 8, 25, 49, 13, 26, '#e4e2d8', M_METAL);
    m.box(17, 10, 25, 18, 12, 28, '#35505f', M_GLASS);
    m.box(42, 10, 25, 43, 13, 26, '#e4e2d8', M_METAL);
    m.box(47, 10, 25, 48, 13, 26, '#e4e2d8', M_METAL);
    m.box(28, 11, 25, 30, 14, 27, '#7f8480', M_METAL);
    m.box(30, 11, 25, 35, 12, 26, '#e4e2d8', M_METAL);
    m.box(43, 11, 25, 44, 14, 26, '#e4e2d8', M_METAL);
    m.box(46, 11, 25, 47, 14, 26, '#e4e2d8', M_METAL);
    m.box(27, 12, 25, 28, 13, 28, '#7f8480', M_METAL);
    m.box(30, 12, 25, 31, 14, 27, '#7f8480', M_METAL);
    m.box(31, 12, 25, 35, 14, 26, '#e4e2d8', M_METAL);
    m.box(44, 12, 25, 46, 14, 26, '#e4e2d8', M_METAL);
    m.box(29, 14, 25, 30, 15, 28, '#7f8480', M_METAL);
    m.box(22, 17, 25, 23, 19, 26, '#7f8480', M_METAL);
    m.box(23, 18, 25, 24, 20, 26, '#7f8480', M_METAL);
    m.box(29, 3, 26, 35, 11, 30, pal.main, M_MATTE);
    m.box(28, 4, 26, 29, 11, 30, pal.main, M_MATTE);
    m.box(35, 4, 26, 36, 14, 30, pal.main, M_MATTE);
    m.box(43, 4, 26, 47, 5, 27, '#e4e2d8', M_METAL);
    m.box(27, 5, 26, 28, 12, 30, pal.main, M_MATTE);
    m.box(36, 5, 26, 37, 13, 30, pal.main, M_MATTE);
    m.box(41, 5, 26, 43, 6, 27, '#e4e2d8', M_METAL);
    m.box(43, 5, 26, 47, 6, 30, '#cfd2cf', M_METAL);
    m.box(47, 5, 26, 49, 6, 27, '#e4e2d8', M_METAL);
    m.box(26, 6, 26, 27, 12, 30, pal.main, M_MATTE);
    m.box(37, 6, 26, 38, 12, 30, pal.main, M_MATTE);
    m.box(41, 6, 26, 42, 7, 27, '#e4e2d8', M_METAL);
    m.box(42, 6, 26, 44, 7, 30, '#cfd2cf', M_METAL);
    m.box(46, 6, 26, 48, 7, 30, '#cfd2cf', M_METAL);
    m.box(48, 6, 26, 49, 7, 27, '#e4e2d8', M_METAL);
    m.box(41, 7, 26, 43, 8, 30, '#cfd2cf', M_METAL);
    m.box(47, 7, 26, 49, 8, 30, '#cfd2cf', M_METAL);
    m.box(41, 8, 26, 42, 11, 30, '#cfd2cf', M_METAL);
    m.box(48, 8, 26, 49, 11, 30, '#cfd2cf', M_METAL);
    m.box(42, 10, 26, 43, 12, 30, '#cfd2cf', M_METAL);
    m.box(47, 10, 26, 48, 12, 30, '#cfd2cf', M_METAL);
    m.box(30, 11, 26, 35, 12, 30, pal.main, M_MATTE);
    m.box(41, 11, 26, 42, 13, 27, '#e4e2d8', M_METAL);
    m.box(43, 11, 26, 44, 13, 30, '#cfd2cf', M_METAL);
    m.box(46, 11, 26, 47, 13, 30, '#cfd2cf', M_METAL);
    m.box(48, 11, 26, 49, 13, 27, '#e4e2d8', M_METAL);
    m.box(31, 12, 26, 35, 14, 30, pal.main, M_MATTE);
    m.box(42, 12, 26, 43, 13, 27, '#e4e2d8', M_METAL);
    m.box(44, 12, 26, 46, 13, 30, '#cfd2cf', M_METAL);
    m.box(47, 12, 26, 48, 13, 27, '#e4e2d8', M_METAL);
    m.box(43, 13, 26, 47, 14, 27, '#e4e2d8', M_METAL);
    m.box(30, 14, 26, 31, 15, 30, pal.main, M_MATTE);
    m.box(33, 14, 26, 35, 15, 30, pal.main, M_MATTE);
    m.box(24, 15, 26, 25, 17, 27, '#7f8480', M_METAL);
    m.box(43, 4, 27, 47, 5, 29, '#cfd2cf', M_METAL);
    m.box(41, 5, 27, 42, 6, 28, '#e4e2d8', M_METAL);
    m.box(42, 5, 27, 43, 6, 29, '#cfd2cf', M_METAL);
    m.box(47, 5, 27, 48, 6, 29, '#cfd2cf', M_METAL);
    m.box(48, 5, 27, 49, 6, 28, '#e4e2d8', M_METAL);
    m.box(41, 6, 27, 42, 7, 29, '#cfd2cf', M_METAL);
    m.box(48, 6, 27, 49, 7, 29, '#cfd2cf', M_METAL);
    m.box(40, 7, 27, 41, 11, 29, '#cfd2cf', M_METAL);
    m.box(49, 7, 27, 50, 11, 29, '#cfd2cf', M_METAL);
    m.box(28, 11, 27, 29, 14, 28, '#7f8480', M_METAL);
    m.box(29, 11, 27, 30, 12, 30, pal.main, M_MATTE);
    m.box(41, 11, 27, 42, 12, 29, '#cfd2cf', M_METAL);
    m.box(48, 11, 27, 49, 12, 29, '#cfd2cf', M_METAL);
    m.box(29, 12, 27, 30, 14, 28, '#7f8480', M_METAL);
    m.box(30, 12, 27, 31, 13, 30, pal.main, M_MATTE);
    m.box(41, 12, 27, 42, 13, 28, '#e4e2d8', M_METAL);
    m.box(42, 12, 27, 43, 13, 29, '#cfd2cf', M_METAL);
    m.box(47, 12, 27, 48, 13, 29, '#cfd2cf', M_METAL);
    m.box(48, 12, 27, 49, 13, 28, '#e4e2d8', M_METAL);
    m.box(26, 13, 27, 28, 14, 28, '#7f8480', M_METAL);
    m.box(30, 13, 27, 31, 14, 28, '#7f8480', M_METAL);
    m.box(43, 13, 27, 47, 14, 29, '#cfd2cf', M_METAL);
    m.box(27, 14, 27, 28, 15, 28, '#7f8480', M_METAL);
    m.box(4, 4, 28, 18, 18, 29, pal.main, M_MATTE);
    m.box(28, 11, 28, 29, 14, 30, pal.main, M_MATTE);
    m.box(27, 12, 28, 28, 13, 30, pal.main, M_MATTE);
    m.box(29, 12, 28, 30, 15, 30, pal.main, M_MATTE);
    m.box(30, 13, 28, 31, 14, 30, pal.main, M_MATTE);
    m.box(4, 4, 29, 17, 17, 34, '#d6d3c9', M_MATTE);
    m.box(29, 4, 30, 35, 14, 31, '#e4e2d8', M_METAL);
    m.box(28, 5, 30, 29, 13, 32, '#e4e2d8', M_METAL);
    m.box(35, 5, 30, 36, 13, 32, '#e4e2d8', M_METAL);
    m.box(27, 6, 30, 28, 12, 32, '#e4e2d8', M_METAL);
    m.box(36, 6, 30, 37, 12, 32, '#e4e2d8', M_METAL);
    m.box(44, 6, 30, 46, 8, 31, '#cfd2cf', M_METAL);
    m.box(44, 8, 30, 46, 10, 33, '#7f8480', M_METAL);
    m.box(44, 10, 30, 46, 12, 31, '#cfd2cf', M_METAL);
    m.box(29, 4, 31, 35, 6, 32, '#e4e2d8', M_METAL);
    m.box(29, 6, 31, 30, 7, 32, '#e4e2d8', M_METAL);
    m.box(30, 6, 31, 34, 12, 37, '#cfd2cf', M_METAL);
    m.box(34, 6, 31, 35, 7, 32, '#e4e2d8', M_METAL);
    m.box(29, 7, 31, 30, 11, 37, '#cfd2cf', M_METAL);
    m.box(34, 7, 31, 35, 11, 37, '#cfd2cf', M_METAL);
    m.box(29, 11, 31, 30, 14, 32, '#e4e2d8', M_METAL);
    m.box(34, 11, 31, 35, 14, 32, '#e4e2d8', M_METAL);
    m.box(30, 12, 31, 34, 14, 32, '#e4e2d8', M_METAL);
    m.box(29, 4, 32, 30, 5, 33, '#e4e2d8', M_METAL);
    m.box(30, 4, 32, 34, 6, 36, '#cfd2cf', M_METAL);
    m.box(34, 4, 32, 35, 5, 33, '#e4e2d8', M_METAL);
    m.box(28, 5, 32, 29, 6, 33, '#e4e2d8', M_METAL);
    m.box(29, 5, 32, 30, 7, 36, '#cfd2cf', M_METAL);
    m.box(34, 5, 32, 35, 7, 36, '#cfd2cf', M_METAL);
    m.box(35, 5, 32, 36, 6, 33, '#e4e2d8', M_METAL);
    m.box(27, 6, 32, 28, 7, 33, '#e4e2d8', M_METAL);
    m.box(28, 6, 32, 29, 12, 36, '#cfd2cf', M_METAL);
    m.box(35, 6, 32, 36, 12, 36, '#cfd2cf', M_METAL);
    m.box(36, 6, 32, 37, 7, 33, '#e4e2d8', M_METAL);
    m.box(27, 7, 32, 28, 11, 36, '#cfd2cf', M_METAL);
    m.box(36, 7, 32, 37, 11, 36, '#cfd2cf', M_METAL);
    m.box(27, 11, 32, 28, 12, 33, '#e4e2d8', M_METAL);
    m.box(29, 11, 32, 30, 13, 36, '#cfd2cf', M_METAL);
    m.box(34, 11, 32, 35, 13, 36, '#cfd2cf', M_METAL);
    m.box(36, 11, 32, 37, 12, 33, '#e4e2d8', M_METAL);
    m.box(28, 12, 32, 29, 13, 33, '#e4e2d8', M_METAL);
    m.box(30, 12, 32, 34, 14, 36, '#cfd2cf', M_METAL);
    m.box(35, 12, 32, 36, 13, 33, '#e4e2d8', M_METAL);
    m.box(29, 13, 32, 30, 14, 33, '#e4e2d8', M_METAL);
    m.box(34, 13, 32, 35, 14, 33, '#e4e2d8', M_METAL);
    m.box(29, 4, 33, 30, 5, 35, '#cfd2cf', M_METAL);
    m.box(34, 4, 33, 35, 5, 35, '#cfd2cf', M_METAL);
    m.box(28, 5, 33, 29, 6, 35, '#cfd2cf', M_METAL);
    m.box(35, 5, 33, 36, 6, 35, '#cfd2cf', M_METAL);
    m.box(27, 6, 33, 28, 7, 35, '#cfd2cf', M_METAL);
    m.box(36, 6, 33, 37, 7, 35, '#cfd2cf', M_METAL);
    m.box(27, 11, 33, 28, 12, 35, '#cfd2cf', M_METAL);
    m.box(36, 11, 33, 37, 12, 35, '#cfd2cf', M_METAL);
    m.box(28, 12, 33, 29, 13, 35, '#cfd2cf', M_METAL);
    m.box(35, 12, 33, 36, 13, 35, '#cfd2cf', M_METAL);
    m.box(29, 13, 33, 30, 14, 35, '#cfd2cf', M_METAL);
    m.box(34, 13, 33, 35, 14, 35, '#cfd2cf', M_METAL);
    m.box(3, 3, 34, 19, 19, 35, pal.main, M_MATTE);
    m.box(6, 6, 35, 15, 15, 36, '#d6d3c9', M_MATTE);
    m.box(6, 6, 36, 15, 10, 37, '#d6d3c9', M_MATTE);
    m.box(6, 10, 36, 10, 15, 37, '#d6d3c9', M_MATTE);
    m.box(10, 10, 36, 12, 12, 41, '#7f8480', M_METAL);
    m.box(12, 10, 36, 15, 15, 37, '#d6d3c9', M_MATTE);
    m.box(10, 12, 36, 12, 15, 37, '#d6d3c9', M_MATTE);
    m.box(31, 8, 37, 33, 10, 39, '#7f8480', M_METAL);
    m.box(6, 8, 40, 9, 14, 44, '#eceae0', M_METAL);
    m.box(5, 10, 40, 6, 12, 44, '#eceae0', M_METAL);
    m.box(6, 6, 41, 10, 8, 43, '#eceae0', M_METAL);
    m.box(10, 7, 41, 11, 15, 47, '#eceae0', M_METAL);
    m.box(5, 8, 41, 6, 10, 43, '#eceae0', M_METAL);
    m.box(9, 8, 41, 10, 16, 46, '#eceae0', M_METAL);
    m.box(11, 9, 41, 12, 13, 48, '#eceae0', M_METAL);
    m.box(5, 12, 41, 6, 14, 43, '#eceae0', M_METAL);
    m.box(6, 14, 41, 9, 16, 43, '#eceae0', M_METAL);
    m.box(7, 5, 42, 11, 6, 44, '#eceae0', M_METAL);
    m.box(10, 6, 42, 12, 7, 47, '#eceae0', M_METAL);
    m.box(11, 7, 42, 13, 9, 48, '#eceae0', M_METAL);
    m.box(12, 9, 42, 13, 15, 48, '#eceae0', M_METAL);
    m.box(13, 10, 42, 14, 12, 49, '#eceae0', M_METAL);
    m.box(11, 13, 42, 12, 16, 47, '#eceae0', M_METAL);
    m.box(10, 15, 42, 11, 17, 46, '#eceae0', M_METAL);
    m.box(7, 16, 42, 10, 17, 44, '#eceae0', M_METAL);
    m.box(8, 4, 43, 12, 5, 44, '#eceae0', M_METAL);
    m.box(11, 5, 43, 13, 6, 47, '#eceae0', M_METAL);
    m.box(7, 6, 43, 10, 8, 45, '#eceae0', M_METAL);
    m.box(12, 6, 43, 14, 7, 47, '#eceae0', M_METAL);
    m.box(6, 7, 43, 7, 8, 44, '#eceae0', M_METAL);
    m.box(13, 7, 43, 14, 10, 48, '#eceae0', M_METAL);
    m.box(14, 8, 43, 15, 14, 49, '#eceae0', M_METAL);
    m.box(13, 12, 43, 14, 16, 48, '#eceae0', M_METAL);
    m.box(6, 14, 43, 9, 15, 44, '#eceae0', M_METAL);
    m.box(7, 15, 43, 9, 16, 45, '#eceae0', M_METAL);
    m.box(12, 15, 43, 13, 17, 47, '#eceae0', M_METAL);
    m.box(11, 16, 43, 12, 18, 46, '#eceae0', M_METAL);
    m.box(8, 17, 43, 11, 18, 44, '#eceae0', M_METAL);
    m.box(9, 4, 44, 13, 5, 45, '#eceae0', M_METAL);
    m.box(8, 5, 44, 11, 6, 45, '#eceae0', M_METAL);
    m.box(13, 5, 44, 14, 6, 47, '#eceae0', M_METAL);
    m.box(14, 6, 44, 15, 8, 48, '#eceae0', M_METAL);
    m.box(7, 8, 44, 9, 15, 45, '#eceae0', M_METAL);
    m.box(15, 8, 44, 16, 14, 48, '#eceae0', M_METAL);
    m.box(6, 9, 44, 7, 13, 45, '#eceae0', M_METAL);
    m.box(14, 14, 44, 15, 16, 48, '#eceae0', M_METAL);
    m.box(8, 16, 44, 10, 17, 45, '#eceae0', M_METAL);
    m.box(13, 16, 44, 14, 17, 47, '#eceae0', M_METAL);
    m.box(9, 17, 44, 11, 18, 45, '#eceae0', M_METAL);
    m.box(12, 17, 44, 13, 18, 46, '#eceae0', M_METAL);
    m.box(11, 4, 45, 14, 5, 46, '#eceae0', M_METAL);
    m.box(9, 5, 45, 11, 6, 46, '#eceae0', M_METAL);
    m.box(14, 5, 45, 15, 6, 47, '#eceae0', M_METAL);
    m.box(9, 6, 45, 10, 8, 46, '#eceae0', M_METAL);
    m.box(15, 6, 45, 16, 8, 47, '#eceae0', M_METAL);
    m.box(8, 7, 45, 9, 15, 46, '#eceae0', M_METAL);
    m.box(16, 9, 45, 17, 13, 48, '#eceae0', M_METAL);
    m.box(7, 10, 45, 8, 12, 46, '#eceae0', M_METAL);
    m.box(15, 14, 45, 16, 16, 47, '#eceae0', M_METAL);
    m.box(9, 16, 45, 10, 17, 46, '#eceae0', M_METAL);
    m.box(14, 16, 45, 15, 17, 47, '#eceae0', M_METAL);
    m.box(13, 17, 45, 14, 18, 46, '#eceae0', M_METAL);
    m.box(9, 7, 46, 10, 15, 47, '#eceae0', M_METAL);
    m.box(16, 8, 46, 17, 9, 48, '#eceae0', M_METAL);
    m.box(16, 13, 46, 17, 14, 48, '#eceae0', M_METAL);
    m.box(10, 15, 46, 11, 16, 47, '#eceae0', M_METAL);
    m.box(11, 16, 46, 12, 17, 47, '#eceae0', M_METAL);
    m.box(13, 6, 47, 14, 7, 48, '#eceae0', M_METAL);
    m.box(15, 7, 47, 16, 8, 48, '#eceae0', M_METAL);
    m.box(11, 13, 47, 12, 15, 48, '#eceae0', M_METAL);
    m.box(15, 14, 47, 16, 15, 48, '#eceae0', M_METAL);
    m.box(13, 9, 48, 14, 10, 49, '#eceae0', M_METAL);
    m.box(15, 9, 48, 16, 13, 49, '#eceae0', M_METAL);
    m.box(13, 12, 48, 14, 13, 49, '#eceae0', M_METAL);
    m.box(16, 10, 50, 17, 12, 52, '#ffe9a0', M_GLOW);
    starFront(m, 12, 44, 5, 2.6, pal.main);
    return m;
  },
  // BLENDER:refinery_allies end
  // Outpost: the unpacked shelter with a raised radar dish, sandbags and a flag.
  outpost(pal) {
    const m = new VModel(-2, -2, 50, 50, 30);
    slabV(m, 0, 0, 48, 48);
    sandbagsV(m, 2, 2, 46, 46, 3);
    m.box(10, 14, 1, 34, 34, 12, C.olive, M_MATTE);
    m.paint(10, 14, 1, 34, 34, 12, (x, y, z) => (x % 6 === 0 || z === 11) ? C.oliveD : undefined);
    m.box(10, 14, 12, 34, 34, 13, pal.main, M_METAL);
    m.box(18, 33, 2, 24, 34, 9, '#3a3a33');                             // door
    m.line(14, 18, 13, 14, 18, 26, C.steel, M_METAL);                    // radar mast and dish
    m.ellipsoid(14, 18, 26, 4.5, 4.5, 1.6, C.steel, M_METAL);
    m.line(38, 10, 1, 38, 10, 22, C.steel, M_METAL);                     // flag
    m.box(38, 10, 17, 45, 11, 22, pal.main);
    for (const [x, y] of [[40, 34], [6, 38]]) m.box(x, y, 1, x + 4, y + 3, 4, '#4b4d3a', M_METAL);   // crates
    return m;
  },
  barracks(pal, faction) {
    const m = new VModel(-2, -2, 54, 50, 34);
    if (faction === 'allies') {
      m.box(0, 0, 0, 48, 48, 1, '#6d6147', M_ROUGH);
      sandbagsV(m, 0, 0, 48, 48, 4);
      m.clear(20, 45, 1, 28, 48, 4);
      for (const tx of [6, 26]) {
        for (let x = tx; x < tx + 16; x++) {
          const h = 1 + Math.round(10 - Math.abs(x + 0.5 - (tx + 8)) * 1.15);
          m.box(x, 6, 1, x + 1, 38, h, '#8c8a64', M_MATTE);
        }
        m.paint(tx, 6, 1, tx + 16, 38, 13, (x, y, z) => z >= 9 ? pal.main : (y === 37 && Math.abs(x + 0.5 - (tx + 8)) < 2.5 && z < 7 ? C.black : undefined));
      }
      m.box(44, 3, 1, 45, 4, 30, C.steel, M_METAL);
      m.box(38, 3, 24, 44, 4, 29, pal.main);
    } else {
      slabV(m, 0, 0, 48, 48);
      m.box(4, 4, 1, 44, 44, 13, C.wall, M_MATTE);
      m.paint(4, 43, 1, 44, 44, 13, (x, y, z) => (z >= 6 && z <= 8 && x % 7 < 3) ? C.glass : undefined);
      for (let y = 3; y < 45; y++) { const h = Math.round(Math.max(0, 8 - Math.abs(y + 0.5 - 24) * 0.38)); m.box(3, y, 13, 45, y + 1, 14 + h, pal.main, M_METAL); }
      m.cylZ(10, 10, 14, 28, 2.5, C.wallD, M_MATTE); m.cylZ(38, 10, 14, 28, 2.5, C.wallD, M_MATTE);
      m.paintTop(14, 12, 34, 32, (x, y) => {
        const dx = x + 0.5 - 24, dy = y + 0.5 - 22, a = Math.atan2(dy, dx) + Math.PI / 2, r = Math.hypot(dx, dy);
        const k = Math.abs(((a / (Math.PI * 2 / 5)) % 1 + 1) % 1 - 0.5) * 2;
        return r < 3.5 + 5.5 * k * k ? pal.main : undefined;
      });
      m.box(19, 43, 1, 29, 44, 9, '#2a2420');
      for (const x of [12, 32]) sandbagsV(m, x, 45, x + 6, 48, 3);
    }
    return m;
  },
  factory(pal) {
    const m = new VModel(-2, -2, 74, 50, 34);
    slabV(m, 0, 0, 72, 48);
    m.box(2, 2, 1, 70, 46, 20, C.wall, M_MATTE);
    for (let k = 0; k < 4; k++) {
      const y0 = 4 + k * 10;
      for (let y = y0; y < y0 + 10 && y < 46; y++) m.box(2, y, 20, 70, y + 1, 20 + Math.round((y - y0) * 0.5), pal.main, M_METAL);
      m.box(2, y0 + 9, 22, 70, y0 + 10, 25, '#6f93aa', M_GLASS);
    }
    m.paint(2, 45, 15, 70, 46, 18, () => pal.main);
    m.paint(2, 2, 15, 3, 46, 18, () => pal.main);
    m.clear(20, 44, 1, 52, 46, 16);
    m.box(20, 45, 1, 52, 46, 16, '#3b3b37', M_METAL);
    m.paint(20, 45, 1, 52, 46, 16, (x, y, z) => z % 2 ? '#2c2c28' : undefined);
    hazardV(m, 17, 44, 1, 20, 47, 17); hazardV(m, 52, 44, 1, 55, 47, 17);
    m.cylZ(64, 8, 20, 32, 2.5, C.steel, M_METAL);
    return m;
  },
  // Service Depot: a repair shed with its door facing the pad in front, a gantry crane over the
  // door, a parts store and a fuel tank.
  depot(pal) {
    const m = new VModel(-2, -2, 74, 50, 36);
    slabV(m, 0, 0, 72, 48);
    m.box(14, 2, 1, 58, 40, 18, C.wall, M_MATTE);                        // the shed
    for (let x = 14; x < 58; x++) { const h = Math.round(Math.max(0, 7 - Math.abs(x + 0.5 - 36) * 0.32)); m.box(x, 2, 18, x + 1, 40, 19 + h, pal.main, M_METAL); }
    m.paint(14, 2, 18, 58, 40, 26, (x, y, z) => (x % 6 === 0 && z > 18) ? pal.dark : undefined);
    m.clear(24, 38, 1, 48, 40, 15);                                      // the door, open
    m.box(24, 39, 1, 48, 40, 2, '#2c2c28', M_ROUGH);
    m.box(24, 38, 14, 48, 40, 15, '#3b3b37', M_METAL);
    hazardV(m, 21, 38, 1, 24, 41, 16); hazardV(m, 48, 38, 1, 51, 41, 16);
    for (const x of [18, 54]) m.box(x, 40, 1, x + 2, 42, 28, C.steel, M_METAL);   // gantry legs and beam
    m.box(18, 40, 28, 56, 43, 30, C.yellow, M_METAL);
    m.box(35, 41, 22, 37, 42, 28, C.black);                              // hook
    m.box(34, 40, 20, 38, 43, 22, C.steel, M_METAL);
    m.box(2, 4, 1, 12, 20, 9, C.wallD, M_MATTE);                         // parts store
    m.box(2, 4, 9, 12, 20, 10, pal.main, M_METAL);
    for (const [x, y] of [[3, 24], [3, 31], [8, 27]]) m.box(x, y, 1, x + 4, y + 4, 5, '#4b4d3a', M_METAL);   // crates
    m.cylZ(65, 12, 1, 14, 5, C.steel, M_METAL);                          // fuel tank
    m.box(60, 10, 14, 70, 14, 15, pal.main, M_METAL);
    m.box(62, 26, 1, 70, 40, 12, C.wall, M_MATTE);                       // control booth
    m.box(62, 39, 5, 70, 40, 10, C.glass, M_GLASS);
    m.set(66, 33, 12, '#ff4a30', M_GLOW);
    return m;
  },
  // Four landing pads, one in each quarter (centres 24 and 72), round a tower in the middle. The
  // Allies get an open, bright, modern apron; the Soviets a sandbagged concrete fortress.
  helipad(pal, faction) {
    const m = new VModel(-2, -2, 98, 98, 40);
    const centres = [[24, 24], [72, 24], [24, 72], [72, 72]];
    const lane = (x, y) => x >= 44 && x < 52 || y >= 44 && y < 52;
    if (faction === 'allies') {
      m.box(0, 0, 0, 96, 96, 2, '#aeb4ba', M_ROUGH);
      m.paintTop(0, 0, 96, 96, (x, y) => {
        for (const [cx, cy] of centres) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy);
          if (r > 17 && r < 19) return pal.main;
          if (r > 14.5 && r < 16) return C.white;
          if (r < 14.5) {
            if ((Math.abs(dx + 5) < 1.5 || Math.abs(dx - 5) < 1.5) && Math.abs(dy) < 8) return C.white;   // the H
            if (Math.abs(dx) < 5 && Math.abs(dy) < 1.2) return C.white;
            return pal.dark;
          }
        }
        if (lane(x, y)) return (x + y) % 8 < 4 ? '#c9ced3' : '#b3b9bf';
        if (x === 0 || y === 0 || x === 95 || y === 95) return pal.light;
      });
      for (let i = 0; i < 6; i++) for (const t of [45, 51]) {   // blue lane lights
        m.box(4 + i * 15 + (i > 2 ? 12 : 0), t - 0.5 | 0, 2, 5 + i * 15 + (i > 2 ? 12 : 0), (t - 0.5 | 0) + 1, 3, pal.light, M_GLOW);
        m.box(t - 0.5 | 0, 4 + i * 15 + (i > 2 ? 12 : 0), 2, (t - 0.5 | 0) + 1, 5 + i * 15 + (i > 2 ? 12 : 0), 3, pal.light, M_GLOW);
      }
      for (const [x, y] of [[0, 0], [90, 0], [0, 90], [90, 90]]) m.clear(x, y, 0, x + 6, y + 6, 8);   // clipped corners
      for (const [x, y] of [[6, 6], [86, 6], [6, 86], [86, 86]]) m.box(x - 1, y - 1, 2, x + 1, y + 1, 4, pal.light, M_GLOW);
      // Slim glass control tower with a radar dish.
      m.cylZ(48, 48, 2, 15, 4, C.wall, M_MATTE);
      m.cylZ(48, 48, 15, 21, 6.5, C.glass, M_GLASS);
      m.cylZ(48, 48, 21, 23, 7.5, pal.main, M_METAL);
      m.line(48, 48, 23, 48, 48, 31, C.steel, M_METAL);
      m.box(42, 47, 29, 54, 49, 31, pal.light, M_METAL);   // radar bar
      m.set(48, 48, 31, '#ff4a30', M_GLOW);
      // Fuel tanks and a windsock mast.
      m.cylZ(48, 10, 2, 9, 5, C.steel, M_METAL); m.cylZ(48, 86, 2, 9, 5, C.steel, M_METAL);
      m.box(10, 46, 2, 12, 48, 18, C.steel, M_METAL); m.box(4, 46, 14, 10, 48, 17, '#e8742a', M_MATTE);
    } else {
      m.box(0, 0, 0, 96, 96, 3, '#4a4944', M_ROUGH);
      m.paintTop(0, 0, 96, 96, (x, y) => {
        for (const [cx, cy] of centres) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          if (Math.abs(dx) < 19 && Math.abs(dy) < 19) {
            if (Math.abs(dx) > 17 || Math.abs(dy) > 17) return pal.light;   // square pad, red border
            if ((Math.abs(dx + 6) < 1.8 || Math.abs(dx - 6) < 1.8) && Math.abs(dy) < 9) return C.white;   // the H
            if (Math.abs(dx) < 6 && Math.abs(dy) < 1.6) return C.white;
            return '#383733';
          }
        }
        if (lane(x, y)) return ((x + y) >> 2) % 2 ? C.yellow : C.black;   // hazard-striped lanes
      });
      for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {         // sandbagged perimeter
        if (x < 3 || y < 3 || x >= 93 || y >= 93) {
          m.box(x, y, 3, x + 1, y + 1, 7, C.sand, M_ROUGH);
          if ((x + (y % 2) * 2) % 4 === 0 || (y + (x % 2) * 2) % 4 === 0) m.paint(x, y, 3, x + 1, y + 1, 7, () => C.sandD);
        }
      }
      m.clear(44, 0, 3, 52, 3, 8); m.clear(44, 93, 3, 52, 96, 8); m.clear(0, 44, 3, 3, 52, 8); m.clear(93, 44, 3, 96, 52, 8);   // gates
      for (const [x, y] of [[0, 0], [90, 0], [0, 90], [90, 90]]) {      // floodlight towers
        m.box(x, y, 6, x + 6, y + 6, 14, C.concD, M_MATTE);
        m.line(x + 3, y + 3, 14, x + 3, y + 3, 24, C.steel, M_METAL);
        m.box(x + 1, y + 1, 24, x + 6, y + 6, 26, pal.main, M_METAL); m.set(x + 3, y + 3, 26, C.glow, M_GLOW);
      }
      for (const [x0, y0, x1, y1] of [[44, 18, 52, 22], [44, 74, 52, 78], [18, 44, 22, 52], [74, 44, 78, 52]])
        m.box(x0, y0, 3, x1, y1, 6, C.conc, M_MATTE);                   // blast walls between the pads
      // Squat bunker tower with a red roof and a star.
      m.box(41, 41, 3, 55, 55, 16, C.concD, M_MATTE);
      m.paint(40, 55, 3, 56, 56, 18, (x, y, z) => (z >= 10 && z <= 12 && x % 4 < 2) ? C.black : undefined);   // gun slits
      m.paint(55, 40, 3, 56, 56, 18, (x, y, z) => (z >= 10 && z <= 12 && y % 4 < 2) ? C.black : undefined);
      m.box(39, 39, 16, 57, 57, 20, pal.main, M_METAL);
      m.paintTop(39, 39, 57, 57, (x, y) => {
        const dx = x + 0.5 - 48, dy = y + 0.5 - 48, a = Math.atan2(dy, dx) + Math.PI / 2, r = Math.hypot(dx, dy);
        const k = Math.abs(((a / (Math.PI * 2 / 5)) % 1 + 1) % 1 - 0.5) * 2;
        return r < 2 + 7.5 * k * k ? C.yellow : undefined;
      });
      m.line(48, 48, 22, 48, 48, 34, C.black); m.set(48, 48, 34, '#ff4a30', M_GLOW);
      for (const [x, y] of [[9, 47], [9, 51], [85, 47], [85, 51]]) m.cylZ(x, y, 3, 8, 2.2, pal.dark, M_METAL);   // fuel drums
    }
    return m;
  },
  // Airfield (4 x 3): the control tower and an arched hangar on the west side, and an apron of four
  // parking stands (AIRFIELD_SPOTS in world.js) with taxi lines and a runway centre line.
  airfield(pal) {
    const m = new VModel(-2, -2, 98, 74, 34);
    m.box(0, 0, 0, 96, 72, 1, C.asphalt, M_ROUGH);
    m.paintTop(0, 0, 96, 72, (x, y) => airfieldMarks(x, y, false));
    m.box(2, 2, 1, 20, 22, 16, C.wall, M_MATTE);                         // control tower
    m.box(3, 3, 16, 19, 21, 21, C.glass, M_GLASS);
    m.box(2, 2, 21, 20, 22, 22, pal.main, M_METAL);
    m.line(10, 10, 22, 10, 10, 30, C.black); m.set(10, 10, 30, '#ff4a30', M_GLOW);
    m.box(2, 28, 1, 24, 68, 10, C.wallD, M_MATTE);                       // hangar
    for (let y = 28; y < 68; y++) { const h = Math.round(Math.sqrt(Math.max(0, 400 - (y + 0.5 - 48) ** 2)) * 0.5); if (h) m.box(2, y, 10, 24, y + 1, 10 + h, pal.main, M_METAL); }
    m.paint(2, 28, 10, 24, 68, 22, (x, y) => ((y - 28) % 6 === 0 ? pal.dark : undefined));
    m.box(23, 34, 1, 24, 62, 9, '#2c2c28', M_METAL);                     // hangar doors
    return m;
  },
  turret() {
    const m = new VModel(-2, -2, 26, 26, 7);
    m.cylZ(12, 12, 0, 5, 10.5, C.wallD, M_MATTE);
    m.cylZ(12, 12, 5, 6, 9, C.wall, M_MATTE);
    return m;
  },
  // Allied AA Gun base: concrete pad, sandbag ring, crates. Modelled in Blender, voxelized by tools/blender/aagun.py.
  aagun(pal) {
    const m = new VModel(-2, -2, 26, 26, 7);
    m.box(0, 0, 0, 24, 4, 1, '#6e6352', M_ROUGH);
    m.box(0, 4, 0, 8, 5, 1, '#6e6352', M_ROUGH);
    m.box(8, 4, 0, 16, 20, 1, '#8f8d84', M_ROUGH);
    m.box(16, 4, 0, 24, 5, 1, '#6e6352', M_ROUGH);
    m.box(0, 5, 0, 7, 6, 1, '#6e6352', M_ROUGH);
    m.box(7, 5, 0, 8, 19, 1, '#8f8d84', M_ROUGH);
    m.box(16, 5, 0, 17, 19, 1, '#8f8d84', M_ROUGH);
    m.box(17, 5, 0, 24, 6, 1, '#6e6352', M_ROUGH);
    m.box(0, 6, 0, 6, 7, 1, '#6e6352', M_ROUGH);
    m.box(6, 6, 0, 7, 18, 1, '#8f8d84', M_ROUGH);
    m.box(17, 6, 0, 18, 18, 1, '#8f8d84', M_ROUGH);
    m.box(18, 6, 0, 24, 7, 1, '#6e6352', M_ROUGH);
    m.box(0, 7, 0, 5, 8, 1, '#6e6352', M_ROUGH);
    m.box(5, 7, 0, 6, 17, 1, '#8f8d84', M_ROUGH);
    m.box(18, 7, 0, 19, 17, 1, '#8f8d84', M_ROUGH);
    m.box(19, 7, 0, 24, 8, 1, '#6e6352', M_ROUGH);
    m.box(0, 8, 0, 4, 24, 1, '#6e6352', M_ROUGH);
    m.box(4, 8, 0, 5, 16, 1, '#8f8d84', M_ROUGH);
    m.box(19, 8, 0, 20, 16, 1, '#8f8d84', M_ROUGH);
    m.box(20, 8, 0, 24, 24, 1, '#6e6352', M_ROUGH);
    m.box(4, 16, 0, 5, 24, 1, '#6e6352', M_ROUGH);
    m.box(19, 16, 0, 20, 24, 1, '#6e6352', M_ROUGH);
    m.box(5, 17, 0, 6, 24, 1, '#6e6352', M_ROUGH);
    m.box(18, 17, 0, 19, 24, 1, '#6e6352', M_ROUGH);
    m.box(6, 18, 0, 7, 24, 1, '#6e6352', M_ROUGH);
    m.box(17, 18, 0, 18, 24, 1, '#6e6352', M_ROUGH);
    m.box(7, 19, 0, 8, 24, 1, '#6e6352', M_ROUGH);
    m.box(16, 19, 0, 17, 24, 1, '#6e6352', M_ROUGH);
    m.box(8, 20, 0, 16, 24, 1, '#6e6352', M_ROUGH);
    m.box(8, 1, 1, 9, 4, 2, '#ad9466', M_ROUGH);
    m.box(10, 1, 1, 13, 2, 3, '#8a744c', M_ROUGH);
    m.box(13, 1, 1, 16, 3, 3, '#ad9466', M_ROUGH);
    m.box(19, 1, 1, 21, 5, 3, '#5a6238', M_MATTE);
    m.box(2, 2, 1, 6, 5, 3, '#5a6238', M_MATTE);
    m.box(6, 2, 1, 8, 4, 2, '#ad9466', M_ROUGH);
    m.box(9, 2, 1, 10, 3, 2, '#ad9466', M_ROUGH);
    m.box(10, 2, 1, 12, 3, 3, '#8a744c', M_ROUGH);
    m.box(16, 2, 1, 18, 4, 3, '#8a744c', M_ROUGH);
    m.box(18, 2, 1, 19, 4, 3, '#5a6238', M_MATTE);
    m.box(21, 2, 1, 22, 6, 3, '#5a6238', M_MATTE);
    m.box(1, 3, 1, 2, 4, 3, '#5a6238', M_MATTE);
    m.box(22, 3, 1, 23, 5, 3, '#5a6238', M_MATTE);
    m.box(17, 4, 1, 19, 5, 3, '#8a744c', M_ROUGH);
    m.box(2, 5, 1, 3, 6, 3, '#5a6238', M_MATTE);
    m.box(4, 5, 1, 6, 6, 3, '#8a744c', M_ROUGH);
    m.box(19, 5, 1, 20, 7, 3, '#ad9466', M_ROUGH);
    m.box(20, 5, 1, 21, 6, 3, '#5a6238', M_MATTE);
    m.box(2, 6, 1, 4, 8, 3, '#ad9466', M_ROUGH);
    m.box(20, 6, 1, 21, 7, 3, '#ad9466', M_ROUGH);
    m.box(21, 7, 1, 22, 10, 3, '#8a744c', M_ROUGH);
    m.box(2, 8, 1, 3, 9, 5, '#ad9466', M_ROUGH);
    m.box(20, 8, 1, 21, 9, 2, '#8a744c', M_ROUGH);
    m.box(22, 8, 1, 23, 14, 2, '#8a744c', M_ROUGH);
    m.box(1, 9, 1, 3, 12, 3, '#8a744c', M_ROUGH);
    m.box(21, 11, 1, 22, 13, 3, '#8a744c', M_ROUGH);
    m.box(1, 12, 1, 3, 15, 3, '#ad9466', M_ROUGH);
    m.box(21, 14, 1, 23, 16, 3, '#ad9466', M_ROUGH);
    m.box(2, 15, 1, 3, 18, 3, '#8a744c', M_ROUGH);
    m.box(20, 15, 1, 21, 16, 2, '#ad9466', M_ROUGH);
    m.box(3, 16, 1, 4, 18, 3, '#8a744c', M_ROUGH);
    m.box(21, 16, 1, 22, 17, 3, '#ad9466', M_ROUGH);
    m.box(19, 17, 1, 21, 19, 3, '#8a744c', M_ROUGH);
    m.box(4, 18, 1, 5, 22, 3, '#5a6238', M_MATTE);
    m.box(5, 18, 1, 6, 19, 3, '#ad9466', M_ROUGH);
    m.box(1, 19, 1, 4, 21, 3, '#5a6238', M_MATTE);
    m.box(5, 19, 1, 6, 21, 3, '#5a6238', M_MATTE);
    m.box(17, 19, 1, 19, 21, 3, '#ad9466', M_ROUGH);
    m.box(19, 19, 1, 20, 20, 3, '#8a744c', M_ROUGH);
    m.box(6, 20, 1, 9, 22, 2, '#8a744c', M_ROUGH);
    m.box(16, 20, 1, 17, 22, 3, '#ad9466', M_ROUGH);
    m.box(2, 21, 1, 4, 22, 3, '#5a6238', M_MATTE);
    m.box(9, 21, 1, 10, 22, 2, '#8a744c', M_ROUGH);
    m.box(10, 21, 1, 12, 23, 3, '#ad9466', M_ROUGH);
    m.box(13, 21, 1, 16, 23, 3, '#8a744c', M_ROUGH);
    m.box(17, 21, 1, 18, 22, 3, '#ad9466', M_ROUGH);
    m.box(2, 22, 1, 3, 23, 3, '#5a6238', M_MATTE);
    m.box(8, 22, 1, 9, 23, 2, '#8a744c', M_ROUGH);
    m.box(12, 22, 1, 13, 23, 3, '#ad9466', M_ROUGH);
    m.box(7, 2, 2, 9, 4, 3, '#ad9466', M_ROUGH);
    m.box(22, 8, 2, 23, 10, 3, '#8a744c', M_ROUGH);
    m.box(22, 11, 2, 23, 13, 3, '#8a744c', M_ROUGH);
    m.box(7, 20, 2, 9, 22, 3, '#8a744c', M_ROUGH);
    m.box(8, 1, 3, 11, 3, 4, '#8a744c', M_ROUGH);
    m.box(11, 1, 3, 15, 2, 4, '#ad9466', M_ROUGH);
    m.box(15, 1, 3, 17, 4, 4, '#8a744c', M_ROUGH);
    m.box(19, 1, 3, 21, 5, 4, '#464b2b', M_MATTE);
    m.box(2, 2, 3, 6, 5, 4, '#464b2b', M_MATTE);
    m.box(6, 2, 3, 8, 4, 4, '#ad9466', M_ROUGH);
    m.box(11, 2, 3, 14, 3, 4, '#ad9466', M_ROUGH);
    m.box(14, 2, 3, 15, 3, 4, '#8a744c', M_ROUGH);
    m.box(17, 2, 3, 18, 3, 4, '#8a744c', M_ROUGH);
    m.box(18, 2, 3, 19, 4, 4, '#464b2b', M_MATTE);
    m.box(21, 2, 3, 22, 6, 4, '#464b2b', M_MATTE);
    m.box(1, 3, 3, 2, 4, 4, '#464b2b', M_MATTE);
    m.box(17, 3, 3, 18, 5, 4, '#ad9466', M_ROUGH);
    m.box(22, 3, 3, 23, 5, 4, '#464b2b', M_MATTE);
    m.box(6, 4, 3, 7, 5, 4, '#ad9466', M_ROUGH);
    m.box(18, 4, 3, 19, 6, 4, '#ad9466', M_ROUGH);
    m.box(2, 5, 3, 3, 6, 4, '#464b2b', M_MATTE);
    m.box(3, 5, 3, 5, 7, 4, '#8a744c', M_ROUGH);
    m.box(19, 5, 3, 20, 6, 5, '#ad9466', M_ROUGH);
    m.box(20, 5, 3, 21, 6, 4, '#464b2b', M_MATTE);
    m.box(20, 6, 3, 22, 8, 5, '#8a744c', M_ROUGH);
    m.box(2, 7, 3, 3, 8, 4, '#ad9466', M_ROUGH);
    m.box(1, 8, 3, 2, 10, 4, '#ad9466', M_ROUGH);
    m.box(3, 8, 3, 4, 9, 4, '#ad9466', M_ROUGH);
    m.box(21, 8, 3, 22, 9, 4, '#8a744c', M_ROUGH);
    m.box(2, 9, 3, 3, 10, 5, '#ad9466', M_ROUGH);
    m.box(21, 9, 3, 23, 15, 4, '#ad9466', M_ROUGH);
    m.box(1, 10, 3, 2, 14, 4, '#8a744c', M_ROUGH);
    m.box(2, 11, 3, 3, 13, 5, '#8a744c', M_ROUGH);
    m.box(1, 14, 3, 3, 16, 4, '#ad9466', M_ROUGH);
    m.box(3, 15, 3, 4, 16, 4, '#ad9466', M_ROUGH);
    m.box(21, 15, 3, 22, 18, 4, '#8a744c', M_ROUGH);
    m.box(2, 16, 3, 3, 17, 4, '#ad9466', M_ROUGH);
    m.box(20, 16, 3, 21, 19, 4, '#8a744c', M_ROUGH);
    m.box(4, 18, 3, 5, 22, 4, '#464b2b', M_MATTE);
    m.box(1, 19, 3, 4, 21, 4, '#464b2b', M_MATTE);
    m.box(5, 19, 3, 6, 21, 4, '#464b2b', M_MATTE);
    m.box(2, 21, 3, 4, 22, 4, '#464b2b', M_MATTE);
    m.box(2, 22, 3, 3, 23, 4, '#464b2b', M_MATTE);
    m.box(9, 1, 4, 11, 2, 5, '#8a744c', M_ROUGH);
    m.box(12, 1, 4, 14, 3, 5, '#ad9466', M_ROUGH);
    m.box(8, 2, 4, 10, 3, 5, '#8a744c', M_ROUGH);
    m.box(15, 2, 4, 17, 3, 5, '#8a744c', M_ROUGH);
    m.box(5, 3, 4, 7, 4, 5, '#ad9466', M_ROUGH);
    m.box(16, 3, 4, 17, 4, 5, '#8a744c', M_ROUGH);
    m.box(18, 3, 4, 19, 5, 5, '#ad9466', M_ROUGH);
    m.box(19, 4, 4, 20, 5, 5, '#ad9466', M_ROUGH);
    m.box(3, 5, 4, 5, 6, 5, '#8a744c', M_ROUGH);
    m.box(3, 6, 4, 4, 7, 5, '#8a744c', M_ROUGH);
    m.box(21, 9, 4, 23, 11, 5, '#ad9466', M_ROUGH);
    m.box(1, 11, 4, 2, 13, 5, '#8a744c', M_ROUGH);
    m.box(21, 13, 4, 23, 15, 5, '#ad9466', M_ROUGH);
    m.box(2, 14, 4, 3, 16, 5, '#ad9466', M_ROUGH);
    m.box(20, 16, 4, 22, 18, 5, '#8a744c', M_ROUGH);
    return m;
  },
  // BLENDER:tesla begin
  tesla(pal) {
    const m = new VModel(-2, -2, 26, 50, 58);
    m.box(8, 24, 0, 16, 46, 2, '#8f8d84', M_ROUGH);
    m.box(7, 25, 0, 8, 45, 2, '#8f8d84', M_ROUGH);
    m.box(16, 25, 0, 17, 45, 2, '#8f8d84', M_ROUGH);
    m.box(6, 26, 0, 7, 44, 2, '#8f8d84', M_ROUGH);
    m.box(17, 26, 0, 18, 44, 2, '#8f8d84', M_ROUGH);
    m.box(5, 27, 0, 6, 43, 2, '#8f8d84', M_ROUGH);
    m.box(18, 27, 0, 19, 43, 2, '#8f8d84', M_ROUGH);
    m.box(4, 28, 0, 5, 42, 2, '#8f8d84', M_ROUGH);
    m.box(19, 28, 0, 20, 42, 2, '#8f8d84', M_ROUGH);
    m.box(3, 29, 0, 4, 41, 2, '#8f8d84', M_ROUGH);
    m.box(20, 29, 0, 21, 41, 2, '#8f8d84', M_ROUGH);
    m.box(2, 30, 0, 3, 40, 2, '#8f8d84', M_ROUGH);
    m.box(21, 30, 0, 22, 40, 2, '#8f8d84', M_ROUGH);
    m.box(1, 31, 0, 2, 39, 2, '#8f8d84', M_ROUGH);
    m.box(22, 31, 0, 23, 39, 2, '#8f8d84', M_ROUGH);
    m.box(11, 24, 2, 13, 25, 3, '#1c1c1a', M_MATTE);
    m.box(7, 25, 2, 10, 26, 3, '#d0a426', M_MATTE);
    m.box(14, 25, 2, 17, 26, 3, '#d0a426', M_MATTE);
    m.box(5, 26, 2, 6, 28, 3, '#1c1c1a', M_MATTE);
    m.box(7, 26, 2, 8, 27, 3, '#d0a426', M_MATTE);
    m.box(16, 26, 2, 17, 27, 3, '#d0a426', M_MATTE);
    m.box(18, 26, 2, 19, 28, 3, '#1c1c1a', M_MATTE);
    m.box(4, 27, 2, 5, 29, 3, '#1c1c1a', M_MATTE);
    m.box(9, 27, 2, 15, 43, 3, '#a3a198', M_ROUGH);
    m.box(19, 27, 2, 20, 29, 3, '#1c1c1a', M_MATTE);
    m.box(3, 28, 2, 4, 29, 3, '#1c1c1a', M_MATTE);
    m.box(8, 28, 2, 9, 42, 4, '#a3a198', M_ROUGH);
    m.box(15, 28, 2, 16, 42, 4, '#a3a198', M_ROUGH);
    m.box(20, 28, 2, 21, 29, 3, '#1c1c1a', M_MATTE);
    m.box(7, 29, 2, 8, 41, 4, '#a3a198', M_ROUGH);
    m.box(16, 29, 2, 17, 41, 4, '#a3a198', M_ROUGH);
    m.box(2, 30, 2, 4, 31, 3, '#d0a426', M_MATTE);
    m.box(6, 30, 2, 7, 40, 4, '#a3a198', M_ROUGH);
    m.box(17, 30, 2, 18, 40, 4, '#a3a198', M_ROUGH);
    m.box(20, 30, 2, 22, 31, 3, '#d0a426', M_MATTE);
    m.box(2, 31, 2, 3, 33, 3, '#d0a426', M_MATTE);
    m.box(5, 31, 2, 6, 39, 4, '#a3a198', M_ROUGH);
    m.box(18, 31, 2, 19, 39, 4, '#a3a198', M_ROUGH);
    m.box(21, 31, 2, 22, 33, 3, '#d0a426', M_MATTE);
    m.box(4, 32, 2, 5, 38, 4, '#a3a198', M_ROUGH);
    m.box(19, 32, 2, 20, 38, 4, '#a3a198', M_ROUGH);
    m.box(1, 34, 2, 2, 36, 3, '#1c1c1a', M_MATTE);
    m.box(22, 34, 2, 23, 36, 3, '#1c1c1a', M_MATTE);
    m.box(2, 37, 2, 3, 40, 3, '#d0a426', M_MATTE);
    m.box(21, 37, 2, 22, 40, 3, '#d0a426', M_MATTE);
    m.box(3, 39, 2, 4, 40, 3, '#d0a426', M_MATTE);
    m.box(20, 39, 2, 21, 40, 3, '#d0a426', M_MATTE);
    m.box(3, 41, 2, 5, 42, 3, '#1c1c1a', M_MATTE);
    m.box(19, 41, 2, 21, 42, 3, '#1c1c1a', M_MATTE);
    m.box(4, 42, 2, 6, 43, 3, '#1c1c1a', M_MATTE);
    m.box(18, 42, 2, 20, 43, 3, '#1c1c1a', M_MATTE);
    m.box(5, 43, 2, 6, 44, 3, '#1c1c1a', M_MATTE);
    m.box(7, 43, 2, 8, 45, 3, '#d0a426', M_MATTE);
    m.box(16, 43, 2, 17, 45, 3, '#d0a426', M_MATTE);
    m.box(18, 43, 2, 19, 44, 3, '#1c1c1a', M_MATTE);
    m.box(8, 44, 2, 10, 45, 3, '#d0a426', M_MATTE);
    m.box(14, 44, 2, 16, 45, 3, '#d0a426', M_MATTE);
    m.box(11, 45, 2, 13, 46, 3, '#1c1c1a', M_MATTE);
    m.box(9, 27, 3, 15, 34, 4, '#a3a198', M_ROUGH);
    m.box(9, 34, 3, 11, 43, 4, '#a3a198', M_ROUGH);
    m.box(11, 34, 3, 13, 36, 47, '#2c2e30', M_METAL);
    m.box(13, 34, 3, 15, 43, 4, '#a3a198', M_ROUGH);
    m.box(11, 36, 3, 13, 43, 4, '#a3a198', M_ROUGH);
    m.box(5, 28, 4, 8, 31, 9, pal.light, M_METAL);
    m.box(16, 28, 4, 19, 31, 9, pal.light, M_METAL);
    m.box(8, 29, 4, 9, 31, 10, pal.light, M_METAL);
    m.box(15, 29, 4, 16, 31, 10, pal.light, M_METAL);
    m.box(6, 31, 4, 8, 32, 10, pal.light, M_METAL);
    m.box(16, 31, 4, 18, 32, 10, pal.light, M_METAL);
    m.box(10, 32, 4, 14, 34, 7, '#9ba1a3', M_METAL);
    m.box(9, 33, 4, 10, 37, 7, '#9ba1a3', M_METAL);
    m.box(14, 33, 4, 15, 37, 7, '#9ba1a3', M_METAL);
    m.box(10, 34, 4, 11, 38, 7, '#9ba1a3', M_METAL);
    m.box(13, 34, 4, 14, 38, 7, '#9ba1a3', M_METAL);
    m.box(11, 36, 4, 13, 38, 7, '#9ba1a3', M_METAL);
    m.box(6, 38, 4, 8, 42, 9, pal.light, M_METAL);
    m.box(16, 38, 4, 18, 42, 9, pal.light, M_METAL);
    m.box(5, 39, 4, 6, 42, 10, pal.light, M_METAL);
    m.box(8, 39, 4, 9, 41, 10, pal.light, M_METAL);
    m.box(15, 39, 4, 16, 41, 10, pal.light, M_METAL);
    m.box(18, 39, 4, 19, 42, 10, pal.light, M_METAL);
    m.box(3, 42, 4, 5, 44, 5, '#ff3a28', M_GLOW);
    m.box(19, 42, 4, 21, 44, 5, '#ff3a28', M_GLOW);
    m.box(10, 31, 7, 14, 32, 9, '#b4692a', M_METAL);
    m.box(9, 32, 7, 11, 33, 9, '#b4692a', M_METAL);
    m.box(11, 32, 7, 13, 33, 8, '#9ba1a3', M_METAL);
    m.box(13, 32, 7, 15, 33, 9, '#b4692a', M_METAL);
    m.box(8, 33, 7, 10, 34, 9, '#b4692a', M_METAL);
    m.box(10, 33, 7, 11, 34, 8, '#9ba1a3', M_METAL);
    m.box(11, 33, 7, 13, 34, 18, '#3a3b3e', M_METAL);
    m.box(13, 33, 7, 14, 34, 8, '#9ba1a3', M_METAL);
    m.box(14, 33, 7, 16, 34, 9, '#b4692a', M_METAL);
    m.box(8, 34, 7, 9, 37, 9, '#b4692a', M_METAL);
    m.box(9, 34, 7, 10, 36, 8, '#9ba1a3', M_METAL);
    m.box(10, 34, 7, 11, 36, 18, '#3a3b3e', M_METAL);
    m.box(13, 34, 7, 14, 36, 18, '#3a3b3e', M_METAL);
    m.box(14, 34, 7, 15, 36, 8, '#9ba1a3', M_METAL);
    m.box(15, 34, 7, 16, 37, 9, '#b4692a', M_METAL);
    m.box(9, 36, 7, 10, 38, 9, '#b4692a', M_METAL);
    m.box(10, 36, 7, 11, 37, 8, '#9ba1a3', M_METAL);
    m.box(11, 36, 7, 13, 37, 18, '#3a3b3e', M_METAL);
    m.box(13, 36, 7, 14, 37, 8, '#9ba1a3', M_METAL);
    m.box(14, 36, 7, 15, 38, 9, '#b4692a', M_METAL);
    m.box(10, 37, 7, 11, 39, 9, '#b4692a', M_METAL);
    m.box(11, 37, 7, 13, 38, 8, '#9ba1a3', M_METAL);
    m.box(13, 37, 7, 14, 39, 9, '#b4692a', M_METAL);
    m.box(11, 38, 7, 13, 39, 9, '#b4692a', M_METAL);
    m.box(10, 33, 8, 11, 34, 9, '#222426', M_METAL);
    m.box(13, 33, 8, 14, 34, 9, '#222426', M_METAL);
    m.box(10, 36, 8, 11, 37, 9, '#222426', M_METAL);
    m.box(13, 36, 8, 14, 37, 9, '#222426', M_METAL);
    m.box(5, 28, 9, 8, 30, 10, pal.light, M_METAL);
    m.box(16, 28, 9, 19, 30, 10, pal.light, M_METAL);
    m.box(5, 30, 9, 7, 31, 10, pal.light, M_METAL);
    m.box(7, 30, 9, 8, 31, 11, '#222426', M_METAL);
    m.box(16, 30, 9, 17, 31, 11, '#222426', M_METAL);
    m.box(17, 30, 9, 19, 31, 10, pal.light, M_METAL);
    m.box(8, 31, 9, 9, 32, 10, '#222426', M_METAL);
    m.box(15, 31, 9, 16, 32, 10, '#222426', M_METAL);
    m.box(6, 38, 9, 8, 39, 10, pal.light, M_METAL);
    m.box(8, 38, 9, 9, 39, 10, '#222426', M_METAL);
    m.box(15, 38, 9, 16, 39, 10, '#222426', M_METAL);
    m.box(16, 38, 9, 18, 39, 10, pal.light, M_METAL);
    m.box(6, 39, 9, 7, 42, 10, pal.light, M_METAL);
    m.box(7, 39, 9, 8, 40, 11, '#222426', M_METAL);
    m.box(16, 39, 9, 17, 40, 11, '#222426', M_METAL);
    m.box(17, 39, 9, 18, 42, 10, pal.light, M_METAL);
    m.box(7, 40, 9, 8, 42, 10, pal.light, M_METAL);
    m.box(16, 40, 9, 17, 42, 10, pal.light, M_METAL);
    m.box(6, 27, 10, 8, 30, 11, '#9ba1a3', M_METAL);
    m.box(16, 27, 10, 18, 30, 11, '#9ba1a3', M_METAL);
    m.box(5, 28, 10, 6, 32, 11, '#9ba1a3', M_METAL);
    m.box(8, 28, 10, 9, 31, 11, '#9ba1a3', M_METAL);
    m.box(15, 28, 10, 16, 31, 11, '#9ba1a3', M_METAL);
    m.box(18, 28, 10, 19, 32, 11, '#9ba1a3', M_METAL);
    m.box(4, 29, 10, 5, 31, 11, '#9ba1a3', M_METAL);
    m.box(19, 29, 10, 20, 31, 11, '#9ba1a3', M_METAL);
    m.box(6, 30, 10, 7, 32, 11, '#9ba1a3', M_METAL);
    m.box(17, 30, 10, 18, 32, 11, '#9ba1a3', M_METAL);
    m.box(7, 31, 10, 8, 32, 11, '#9ba1a3', M_METAL);
    m.box(16, 31, 10, 17, 32, 11, '#9ba1a3', M_METAL);
    m.box(5, 38, 10, 8, 39, 11, '#9ba1a3', M_METAL);
    m.box(16, 38, 10, 19, 39, 11, '#9ba1a3', M_METAL);
    m.box(4, 39, 10, 7, 41, 11, '#9ba1a3', M_METAL);
    m.box(8, 39, 10, 9, 42, 11, '#9ba1a3', M_METAL);
    m.box(15, 39, 10, 16, 42, 11, '#9ba1a3', M_METAL);
    m.box(17, 39, 10, 20, 41, 11, '#9ba1a3', M_METAL);
    m.box(7, 40, 10, 8, 43, 11, '#9ba1a3', M_METAL);
    m.box(16, 40, 10, 17, 43, 11, '#9ba1a3', M_METAL);
    m.box(5, 41, 10, 7, 42, 11, '#9ba1a3', M_METAL);
    m.box(17, 41, 10, 19, 42, 11, '#9ba1a3', M_METAL);
    m.box(6, 42, 10, 7, 43, 11, '#9ba1a3', M_METAL);
    m.box(17, 42, 10, 18, 43, 11, '#9ba1a3', M_METAL);
    m.box(10, 27, 18, 14, 29, 20, '#eceef0', M_METAL);
    m.box(8, 28, 18, 10, 29, 20, '#eceef0', M_METAL);
    m.box(14, 28, 18, 16, 29, 20, '#eceef0', M_METAL);
    m.box(6, 29, 18, 8, 30, 20, '#eceef0', M_METAL);
    m.box(16, 29, 18, 18, 30, 20, '#eceef0', M_METAL);
    m.box(6, 30, 18, 7, 31, 20, '#eceef0', M_METAL);
    m.box(17, 30, 18, 18, 31, 20, '#eceef0', M_METAL);
    m.box(5, 31, 18, 6, 39, 20, '#eceef0', M_METAL);
    m.box(18, 31, 18, 19, 39, 20, '#eceef0', M_METAL);
    m.box(4, 33, 18, 5, 37, 20, '#eceef0', M_METAL);
    m.box(19, 33, 18, 20, 37, 20, '#eceef0', M_METAL);
    m.box(6, 39, 18, 7, 41, 20, '#eceef0', M_METAL);
    m.box(17, 39, 18, 18, 41, 20, '#eceef0', M_METAL);
    m.box(7, 40, 18, 8, 41, 20, '#eceef0', M_METAL);
    m.box(16, 40, 18, 17, 41, 20, '#eceef0', M_METAL);
    m.box(8, 41, 18, 16, 42, 20, '#eceef0', M_METAL);
    m.box(10, 42, 18, 14, 43, 20, '#eceef0', M_METAL);
    m.box(9, 29, 24, 11, 30, 26, '#eceef0', M_METAL);
    m.box(13, 29, 24, 15, 30, 26, '#eceef0', M_METAL);
    m.box(7, 30, 24, 9, 31, 26, '#eceef0', M_METAL);
    m.box(15, 30, 24, 17, 31, 26, '#eceef0', M_METAL);
    m.box(7, 31, 24, 8, 32, 26, '#eceef0', M_METAL);
    m.box(16, 31, 24, 17, 32, 26, '#eceef0', M_METAL);
    m.box(6, 32, 24, 7, 34, 26, '#eceef0', M_METAL);
    m.box(17, 32, 24, 18, 34, 26, '#eceef0', M_METAL);
    m.box(6, 36, 24, 7, 38, 26, '#eceef0', M_METAL);
    m.box(17, 36, 24, 18, 38, 26, '#eceef0', M_METAL);
    m.box(7, 38, 24, 8, 40, 26, '#eceef0', M_METAL);
    m.box(16, 38, 24, 17, 40, 26, '#eceef0', M_METAL);
    m.box(8, 39, 24, 9, 40, 26, '#eceef0', M_METAL);
    m.box(15, 39, 24, 16, 40, 26, '#eceef0', M_METAL);
    m.box(9, 40, 24, 11, 41, 26, '#eceef0', M_METAL);
    m.box(13, 40, 24, 15, 41, 26, '#eceef0', M_METAL);
    m.box(10, 28, 25, 14, 29, 26, '#eceef0', M_METAL);
    m.box(8, 29, 25, 9, 30, 26, '#eceef0', M_METAL);
    m.box(11, 29, 25, 13, 30, 26, '#eceef0', M_METAL);
    m.box(15, 29, 25, 16, 30, 26, '#eceef0', M_METAL);
    m.box(6, 31, 25, 7, 32, 26, '#eceef0', M_METAL);
    m.box(17, 31, 25, 18, 32, 26, '#eceef0', M_METAL);
    m.box(5, 33, 25, 6, 37, 26, '#eceef0', M_METAL);
    m.box(18, 33, 25, 19, 37, 26, '#eceef0', M_METAL);
    m.box(6, 34, 25, 7, 36, 26, '#eceef0', M_METAL);
    m.box(17, 34, 25, 18, 36, 26, '#eceef0', M_METAL);
    m.box(6, 38, 25, 7, 39, 26, '#eceef0', M_METAL);
    m.box(17, 38, 25, 18, 39, 26, '#eceef0', M_METAL);
    m.box(8, 40, 25, 9, 41, 26, '#eceef0', M_METAL);
    m.box(11, 40, 25, 13, 42, 26, '#eceef0', M_METAL);
    m.box(15, 40, 25, 16, 41, 26, '#eceef0', M_METAL);
    m.box(10, 41, 25, 11, 42, 26, '#eceef0', M_METAL);
    m.box(13, 41, 25, 14, 42, 26, '#eceef0', M_METAL);
    m.box(11, 29, 31, 13, 31, 32, '#eceef0', M_METAL);
    m.box(9, 30, 31, 11, 31, 32, '#eceef0', M_METAL);
    m.box(13, 30, 31, 15, 31, 32, '#eceef0', M_METAL);
    m.box(8, 31, 31, 10, 32, 32, '#eceef0', M_METAL);
    m.box(14, 31, 31, 16, 32, 32, '#eceef0', M_METAL);
    m.box(7, 32, 31, 9, 33, 32, '#eceef0', M_METAL);
    m.box(15, 32, 31, 17, 33, 32, '#eceef0', M_METAL);
    m.box(7, 33, 31, 8, 38, 32, '#eceef0', M_METAL);
    m.box(16, 33, 31, 17, 38, 32, '#eceef0', M_METAL);
    m.box(6, 34, 31, 7, 36, 32, '#eceef0', M_METAL);
    m.box(17, 34, 31, 18, 36, 32, '#eceef0', M_METAL);
    m.box(8, 37, 31, 9, 39, 32, '#eceef0', M_METAL);
    m.box(15, 37, 31, 16, 39, 32, '#eceef0', M_METAL);
    m.box(9, 38, 31, 10, 40, 32, '#eceef0', M_METAL);
    m.box(14, 38, 31, 15, 40, 32, '#eceef0', M_METAL);
    m.box(10, 39, 31, 14, 40, 32, '#eceef0', M_METAL);
    m.box(11, 40, 31, 13, 41, 32, '#eceef0', M_METAL);
    m.box(11, 30, 37, 13, 32, 38, '#eceef0', M_METAL);
    m.box(9, 31, 37, 11, 32, 38, '#eceef0', M_METAL);
    m.box(13, 31, 37, 15, 32, 38, '#eceef0', M_METAL);
    m.box(8, 32, 37, 10, 33, 38, '#eceef0', M_METAL);
    m.box(14, 32, 37, 16, 33, 38, '#eceef0', M_METAL);
    m.box(8, 33, 37, 9, 38, 38, '#eceef0', M_METAL);
    m.box(15, 33, 37, 16, 38, 38, '#eceef0', M_METAL);
    m.box(7, 34, 37, 8, 36, 38, '#eceef0', M_METAL);
    m.box(16, 34, 37, 17, 36, 38, '#eceef0', M_METAL);
    m.box(9, 37, 37, 10, 39, 38, '#eceef0', M_METAL);
    m.box(14, 37, 37, 15, 39, 38, '#eceef0', M_METAL);
    m.box(10, 38, 37, 14, 39, 38, '#eceef0', M_METAL);
    m.box(11, 39, 37, 13, 40, 38, '#eceef0', M_METAL);
    m.box(10, 32, 43, 14, 33, 45, '#eceef0', M_METAL);
    m.box(9, 33, 43, 11, 34, 44, '#eceef0', M_METAL);
    m.box(13, 33, 43, 15, 34, 44, '#eceef0', M_METAL);
    m.box(9, 34, 43, 10, 37, 45, '#eceef0', M_METAL);
    m.box(14, 34, 43, 15, 37, 45, '#eceef0', M_METAL);
    m.box(10, 36, 43, 11, 38, 44, '#eceef0', M_METAL);
    m.box(13, 36, 43, 14, 38, 44, '#eceef0', M_METAL);
    m.box(11, 37, 43, 13, 38, 45, '#eceef0', M_METAL);
    m.box(9, 33, 44, 10, 34, 45, '#eceef0', M_METAL);
    m.box(14, 33, 44, 15, 34, 45, '#eceef0', M_METAL);
    m.box(10, 37, 44, 11, 38, 45, '#eceef0', M_METAL);
    m.box(13, 37, 44, 14, 38, 45, '#eceef0', M_METAL);
    m.box(11, 33, 47, 13, 37, 53, '#a7b5d6', M_METAL);
    m.box(10, 34, 47, 11, 36, 53, '#a7b5d6', M_METAL);
    m.box(13, 34, 47, 14, 36, 53, '#a7b5d6', M_METAL);
    m.box(11, 32, 48, 13, 33, 52, '#a7b5d6', M_METAL);
    m.box(10, 33, 48, 11, 34, 52, '#a7b5d6', M_METAL);
    m.box(13, 33, 48, 14, 34, 52, '#a7b5d6', M_METAL);
    m.box(9, 34, 48, 10, 36, 52, '#a7b5d6', M_METAL);
    m.box(14, 34, 48, 15, 36, 52, '#a7b5d6', M_METAL);
    m.box(10, 36, 48, 11, 37, 52, '#a7b5d6', M_METAL);
    m.box(13, 36, 48, 14, 37, 52, '#a7b5d6', M_METAL);
    m.box(11, 37, 48, 13, 38, 52, '#a7b5d6', M_METAL);
    m.box(10, 32, 49, 11, 33, 51, '#a7b5d6', M_METAL);
    m.box(13, 32, 49, 14, 33, 51, '#a7b5d6', M_METAL);
    m.box(9, 33, 49, 10, 34, 51, '#a7b5d6', M_METAL);
    m.box(14, 33, 49, 15, 34, 51, '#a7b5d6', M_METAL);
    m.box(9, 36, 49, 10, 37, 51, '#a7b5d6', M_METAL);
    m.box(14, 36, 49, 15, 37, 51, '#a7b5d6', M_METAL);
    m.box(10, 37, 49, 11, 38, 51, '#a7b5d6', M_METAL);
    m.box(13, 37, 49, 14, 38, 51, '#a7b5d6', M_METAL);
    return m;
  },
  // BLENDER:tesla end
  // Camouflaged hexagonal bunker: a turf-and-netting roof with the side's emblem, concrete buttresses
  // at the six corners and dark firing slits between them.
  pillbox(pal) {
    const m = new VModel(-2, -2, 26, 26, 12);
    const R = 10.6, H = 0.866, CX = 12, CY = 12;
    const base = pal.camo !== undefined ? pal.camo : 0x4a6330, sh = (k) => shadeInt(base, k);   // the roof takes the ground's colour
    const inHex = (x, y, r) => { const dx = Math.abs(x + 0.5 - CX), dy = Math.abs(y + 0.5 - CY); return dy <= r * H && dx + dy / 1.732 <= r; };
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (inHex(x, y, R + 0.6)) m.set(x, y, 0, sh(0.8), M_ROUGH);   // a hex of ground under it, no dirt pad
    // Walls: concrete, with a lighter course on top and a shadowed foot.
    for (let z = 1; z < 8; z++) for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      if (inHex(x, y, R)) m.set(x, y, z, z === 1 ? C.concD : z === 7 ? C.conc : (z + (x >> 3)) % 3 === 0 ? C.concD : '#7d7b72', M_ROUGH);
    }
    // Buttresses: a sloping block at each corner, leaning out from the wall.
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3, bx = CX + Math.cos(a) * (R - 0.4), by = CY + Math.sin(a) * (R - 0.4);
      for (let z = 1; z < 7; z++) m.cylZ(bx, by, z, z + 1, 2.9 - z * 0.22, z % 2 ? '#6a685f' : '#7d7b72', M_ROUGH);
    }
    // Firing slits between the buttresses, and a shadow band under the roof.
    m.paint(0, 0, 3, 24, 24, 6, (x, y, z) => {
      const dx = x + 0.5 - CX, dy = y + 0.5 - CY;
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 6 + k * Math.PI / 3, c = Math.cos(a), sn = Math.sin(a);
        if (dx * c + dy * sn > R * H - 1.6 && Math.abs(-dx * sn + dy * c) < 3.6) return '#171614';
      }
    });
    m.paint(0, 0, 6, 24, 24, 7, (x, y) => (Math.hypot(x + 0.5 - CX, y + 0.5 - CY) > R * H - 1.2) ? C.concD : undefined);
    // Roof: grass-green slab with a darker rim, mottled with camouflage patches and a few tufts.
    for (let z = 8; z < 10; z++) for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (inHex(x, y, R - 0.6 - (z - 8) * 0.8)) m.set(x, y, z, base, M_ROUGH);
    m.paint(0, 0, 8, 24, 24, 10, (x, y, z) => {
      const dx = x + 0.5 - CX, dy = y + 0.5 - CY, d = Math.hypot(dx, dy);
      if (z === 8 && !inHex(x, y, R - 2)) return sh(0.72);                               // shaded rim
      const n = hash3(x >> 1, y >> 1, 3), n2 = hash3(x, y, 11);
      if (z === 9) {
        if (d > 3.2 && d < 5.2 && Math.abs(Math.sin(Math.atan2(dy, dx) * 3)) > 0.22) return sh(0.5);   // emblem ring, broken by three gaps
        if (d < 1.9) return pal.main;                                                // the side's colour at the centre
        if (n < 0.22) return sh(0.78);
        if (n > 0.8) return sh(1.25);
        if (n > 0.66 && n2 > 0.5) return mixHex(base, '#7d6a42', 0.35);                // dry earth patches
        if (n2 > 0.9) return sh(1.45);
      }
    });
    for (let i = 0; i < 26; i++) {                                                   // tufts of grass and netting
      const a = hash3(i, 5, 1) * 6.283, r = 2 + hash3(i, 9, 2) * 7, x = Math.floor(CX + Math.cos(a) * r), y = Math.floor(CY + Math.sin(a) * r * 0.9);
      if (inHex(x, y, R - 2.2) && Math.hypot(x + 0.5 - CX, y + 0.5 - CY) > 2.4) m.set(x, y, 10, hash3(i, 1, 4) > 0.5 ? sh(1.2) : sh(0.65), M_ROUGH);
    }
    return m;
  },
  // Flame tower: a tapered tower with a nozzle on top and fuel tanks at its foot.
  ftur(pal) {
    const m = new VModel(-2, -2, 26, 26, 30);
    m.box(0, 0, 0, 24, 24, 1, C.bib, M_ROUGH);
    m.cylZ(12, 13, 1, 4, 10, C.wallD, M_ROUGH);
    for (let z = 4; z < 22; z++) m.cylZ(12, 13, z, z + 1, 6.5 - (z - 4) * 0.12, z % 5 === 0 ? pal.dark : pal.main, M_METAL);
    m.cylZ(12, 13, 22, 25, 4.5, C.gun, M_METAL);
    m.cylZ(12, 13, 24, 25, 2.5, '#120d0a');
    m.cylZ(12, 13, 23, 24, 3.2, '#ff7a1a', M_GLOW);
    for (const [x, y] of [[3, 19], [20, 19]]) { m.cylZ(x, y, 1, 9, 2.6, C.red, M_METAL); m.ellipsoid(x, y, 9, 2.6, 2.6, 1.5, C.red, M_METAL); }
    m.cylX(5, 19, 19, 3, 0.8, C.gun, M_METAL);
    return m;
  },
  // SAM Site: a launcher pit in a concrete collar, shut by two sliding steel doors (samDoor,
  // drawn apart in drawSamHead). The cameo shows the launcher up.
  sam(pal, faction, cameo) {
    const m = new VModel(-2, -2, 50, 26, 12);
    slabV(m, 0, 0, 48, 24);
    m.cylZ(24, 12, 1, 3, 9.5, C.wall, M_MATTE);
    m.cylZ(24, 12, 0, 3, 7.5, null);
    m.cylZ(24, 12, 0, 1, 7.5, '#141310', M_ROUGH);
    m.paint(14, 2, 1, 34, 22, 3, (x, y) => Math.hypot(x + 0.5 - 24, y + 0.5 - 12) < 8.6 ? C.concD : undefined);
    for (const y of [3, 20]) m.box(5, y, 2, 43, y + 1, 3, C.steel, M_METAL);   // door rails
    hazardV(m, 1, 1, 1, 4, 4, 2); hazardV(m, 44, 20, 1, 47, 23, 2);
    if (cameo) {
      const h = HEADS.sam[0](pal);
      for (let z = 0; z < h.d; z++) for (let y = 0; y < h.h; y++) for (let x = 0; x < h.w; x++) {
        const i = (z * h.h + y) * h.w + x;
        if (h.col[i] >= 0) m.set(x + h.x0 + 24, y + h.y0 + 12, z + 3, h.col[i], h.mat[i]);
      }
    }
    return m;
  },
};

// ---------------------------------------------------------------------------
// Soviet structures: Cold War Soviet in style. Grey precast concrete panels and flat roofs, strip
// windows, olive steel, and the side's colour as the accent: stars, hanging banners, parapets and
// red-and-white smokestacks. Same footprints, doors and pads as the shared models above.
// ---------------------------------------------------------------------------
const SV = { conc: '#a39e91', seam: '#878275', stain: '#938e81', light: '#b5b0a3', roof: '#77746a', roofD: '#67645b',
  win: '#1f2a30', winL: '#3d5866', olive: '#56603b', oliveD: '#414a2c', steel: '#7f8480' };
// Is (dx, dy) inside a five-pointed star of radius r, point up (dy grows downward)?
function inStar(dx, dy, r) {
  const a = Math.atan2(dy, dx) + Math.PI / 2, d = Math.hypot(dx, dy);
  const k = Math.abs(((a / (Math.PI * 2 / 5)) % 1 + 1) % 1 - 0.5) * 2;
  return d < r * (0.4 + 0.6 * k * k);
}
// A wall of precast panels: seams every 8 across and 6 up, a few weather streaks.
function panelBox(m, x0, y0, z0, x1, y1, z1) {
  m.box(x0, y0, z0, x1, y1, z1, SV.conc, M_ROUGH);
  m.paint(x0, y0, z0, x1, y1, z1, (x, y, z) => {
    if ((x - x0) % 8 === 0 || (y - y0) % 8 === 0 || (z - z0) % 6 === 5) return SV.seam;
    const n = hash3(x, y >> 2, 21);
    if (n > 0.86) return SV.stain;
    if (n < 0.06) return SV.light;
  });
}
// A flat tar roof on top of a box (at height z) with a concrete parapet; its outer face carries the side's colour.
function flatRoof(m, x0, y0, x1, y1, z, pal) {
  m.box(x0, y0, z, x1, y1, z + 1, SV.roof, M_ROUGH);
  m.paintTop(x0, y0, x1, y1, (x, y) => (hash3(x, y, 5) > 0.8 ? SV.roofD : undefined));
  m.paintTop(x0, y0, x1, y1, (x, y) => ((x - x0) % 12 === 6 || (y - y0) % 12 === 6 ? SV.roofD : undefined));   // roof slab joints
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (x === x0 || y === y0 || x === x1 - 1 || y === y1 - 1) m.set(x, y, z + 1, pal.main, M_MATTE);   // the parapet, in the side's colour
  m.box(x0, y1 - 1, z - 1, x1, y1, z, pal.dark, M_MATTE);
}
// A strip of windows on the front face (y = the wall's front row), with mullions.
function stripWin(m, x0, x1, y, z0, z1) {
  m.box(x0, y, z0, x1, y + 1, z1, SV.win, M_GLASS);
  m.paint(x0, y, z0, x1, y + 1, z1, (x, yy, z) => ((x - x0) % 4 === 3 ? SV.seam : z === z1 - 1 ? SV.winL : undefined));
}
// A star on the front face (at row y), centred on x = cx, z = cz.
function starFront(m, cx, y, cz, r, col) {
  for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    if (inStar(x + 0.5 - cx, cz - (z + 0.5), r)) m.set(x, y, z, col, M_MATTE);
  }
}
// A star painted on a roof (top voxels), point to the north.
function starTop(m, cx, cy, r, col) {
  m.paintTop(Math.floor(cx - r), Math.floor(cy - r), Math.ceil(cx + r), Math.ceil(cy + r), (x, y) => (inStar(x + 0.5 - cx, y + 0.5 - cy, r) ? col : undefined));
}
// A banner hanging down the front face from height top: the side's colour with a small gold star.
function bannerV(m, x0, x1, y, top, len, pal) {
  m.box(x0, y, top - len, x1, y + 1, top, pal.main, M_MATTE);
  m.box(x0, y, top - len, x1, y + 1, top - len + 1, pal.dark, M_MATTE);
  starFront(m, (x0 + x1) / 2, y, top - 2.5, Math.min(2, (x1 - x0) / 2 - 0.2), C.yellow);
  m.box(x0 - 1, y, top, x1 + 1, y + 1, top + 1, SV.steel, M_METAL);
}
// A smokestack banded in the side's colour and white, with a dark lip.
function stackV(m, x, y, z0, z1, r, pal) {
  for (let z = z0; z < z1; z++) m.cylZ(x, y, z, z + 1, r, z > z1 - 15 ? (Math.floor((z1 - z) / 3) % 2 ? C.white : pal.main) : SV.conc, z > z1 - 15 ? M_MATTE : M_ROUGH);
  m.cylZ(x, y, z1 - 2, z1, r - 1, null);
  m.cylZ(x, y, z1 - 1, z1, r + 0.4, '#2c2b28', M_METAL);
}
// A lattice mast (radio, cranes): steel with cross-bracing.
function latticeV(m, x, y, z0, z1, col) {
  for (const [dx, dy] of [[0, 0], [2, 0], [0, 2], [2, 2]]) m.line(x + dx, y + dy, z0, x + dx, y + dy, z1, col, M_METAL);
  for (let z = z0; z < z1; z += 3) { m.line(x, y, z, x + 2, y, z + 2, col, M_METAL); m.line(x, y + 2, z + 2, x + 2, y + 2, z, col, M_METAL); }
}

// An RBMK reactor block: pale panels in horizontal bands, its roof, and the raised reactor hall on top.
function reactorV(m, x0, y0, x1, y1, h, pal) {
  const band = (a0, b0, z0, a1, b1, z1) => {
    m.box(a0, b0, z0, a1, b1, z1, '#d2cec2', M_ROUGH);
    m.paint(a0, b0, z0, a1, b1, z1, (x, y, z) => ((z - z0) % 5 >= 3 ? '#86827a' : (x - a0) % 6 === 0 || (y - b0) % 6 === 0 ? '#bcb8ac' : undefined));
  };
  band(x0, y0, 1, x1, y1, h);
  flatRoof(m, x0, y0, x1, y1, h, pal);
  const hx0 = x0 + 5, hx1 = x1 - 5, hy0 = y0 + 4, hy1 = y1 - 6;
  band(hx0, hy0, h + 1, hx1, hy1, h + 7);
  flatRoof(m, hx0, hy0, hx1, hy1, h + 7, pal);
  m.box(hx0 + 2, hy1 - 1, h + 3, hx1 - 2, hy1, h + 5, SV.win, M_GLASS);
  starTop(m, (hx0 + hx1) / 2, (hy0 + hy1) / 2, Math.min(hx1 - hx0, hy1 - hy0) / 2 - 1.5, pal.main);
}
// The ventilation stack in its tapering lattice frame (half-width w at the foot), banded at the top.
function ventStackV(m, SX, SY, z0, top, w, pal) {
  const FR = '#5a5f5c', band = top - 17, frameTop = top - 13;
  for (let z = z0; z < top; z++) m.cylZ(SX, SY, z, z + 1, 2.4, z > band ? (Math.floor((top - z) / 3) % 2 ? C.white : pal.main) : '#c8c4b8', z > band ? M_MATTE : M_ROUGH);
  m.cylZ(SX, SY, top - 2, top, 1.4, null);
  m.cylZ(SX, SY, top - 1, top, 2.7, '#2c2b28', M_METAL);
  const half = (z) => w - (z - z0) * (w - 2.6) / (frameTop - z0);
  for (let z = z0; z < frameTop; z++) {
    const h = half(z);
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) m.set(Math.round(SX + dx * h), Math.round(SY + dy * h), z, FR, M_METAL);
  }
  for (let z = z0 + 5; z < frameTop; z += 8) {                          // rings, and a diagonal on the front per bay
    const h = half(z), hb = half(Math.max(z0, z - 8));
    m.line(SX - h, SY + h, z, SX + h, SY + h, z, FR, M_METAL); m.line(SX - h, SY - h, z, SX + h, SY - h, z, FR, M_METAL);
    m.line(SX - h, SY - h, z, SX - h, SY + h, z, FR, M_METAL); m.line(SX + h, SY - h, z, SX + h, SY + h, z, FR, M_METAL);
    m.line(SX - hb, SY + hb, z - 8, SX + h, SY + h, z, FR, M_METAL);
  }
}

const SOVIET = {
  // Construction Yard: a long assembly hall with a stepped office tower, a gold star over the gate,
  // banners, and a tower crane.
  cy(pal) {
    const m = new VModel(-2, -2, 76, 76, 48);
    slabV(m, 0, 0, 72, 72);
    panelBox(m, 4, 8, 1, 68, 54, 22);
    flatRoof(m, 4, 8, 68, 54, 22, pal);
    panelBox(m, 6, 8, 23, 30, 30, 36);                                  // office tower at the back left
    flatRoof(m, 6, 8, 30, 30, 36, pal);
    stripWin(m, 7, 29, 29, 27, 29); stripWin(m, 7, 29, 29, 31, 33);
    m.box(56, 12, 23, 64, 22, 26, SV.steel, M_METAL);                   // roof plant
    starTop(m, 46, 36, 12, pal.main);
    stripWin(m, 4, 20, 53, 15, 17); stripWin(m, 52, 68, 53, 15, 17);
    m.clear(22, 52, 1, 50, 54, 13);                                     // the gate
    m.box(22, 52, 1, 50, 53, 13, SV.olive, M_METAL);
    m.paint(22, 52, 1, 50, 53, 13, (x, y, z) => (z % 2 ? SV.oliveD : undefined));
    hazardV(m, 19, 51, 1, 22, 55, 14); hazardV(m, 50, 51, 1, 53, 55, 14);
    starFront(m, 36, 53, 17.5, 4.2, C.yellow);
    m.box(30, 53, 13, 42, 54, 14, pal.main, M_MATTE);
    bannerV(m, 8, 13, 53, 13, 10, pal); bannerV(m, 59, 64, 53, 13, 10, pal);
    m.paintTop(28, 58, 44, 70, (x, y) => (y - 58) % 4 < 2 ? C.yellow : undefined);
    latticeV(m, 63, 2, 1, 44, C.yellow);                                 // tower crane
    m.box(30, 2, 43, 67, 5, 45, C.yellow, M_METAL);
    m.box(64, 1, 45, 68, 6, 47, '#5d5e58', M_METAL);
    m.line(36, 3.5, 42, 36, 3.5, 26, C.black);
    m.box(34, 2, 24, 38, 5, 26, C.gun, M_METAL);
    return m;
  },
  // Power Plant: a small RBMK-style nuclear station. A tall reactor block with banded panels, a long
  // turbine hall in front, and the tall ventilation stack held in its steel lattice frame.
  power(pal) {
    const m = new VModel(-2, -2, 50, 50, 50);
    slabV(m, 0, 0, 48, 48);
    reactorV(m, 3, 6, 29, 30, 27, pal);
    panelBox(m, 2, 31, 1, 46, 46, 13);                                   // turbine hall
    flatRoof(m, 2, 31, 46, 46, 13, pal);
    stripWin(m, 3, 21, 45, 7, 10); stripWin(m, 27, 45, 45, 7, 10);
    starFront(m, 24, 45, 6.5, 2.6, pal.main);
    for (const x of [6, 16, 30, 40]) m.box(x, 35, 14, x + 5, 41, 16, SV.steel, M_METAL);   // roof vents
    m.box(32, 8, 1, 46, 22, 5, SV.conc, M_ROUGH);
    ventStackV(m, 38.5, 15, 5, 49, 6, pal);
    m.cylX(29, 36, 20, 18, 1.3, SV.steel, M_METAL);                    // duct from the reactor to the stack
    m.box(36, 24, 1, 46, 30, 6, '#5d5e58', M_METAL);                    // transformers
    m.paint(36, 29, 2, 46, 30, 6, (x) => (x % 3 === 0 ? '#46473f' : undefined));
    return m;
  },
  // Advanced Power Plant: a twin-reactor station. Two reactor blocks share one taller stack in its
  // lattice frame between them, with a long turbine hall across the front and a switchyard.
  apower(pal) {
    const m = new VModel(-2, -2, 74, 74, 60);
    slabV(m, 0, 0, 72, 72);
    reactorV(m, 2, 6, 28, 34, 28, pal);
    reactorV(m, 44, 6, 70, 34, 28, pal);
    m.box(28, 12, 1, 44, 30, 10, SV.conc, M_ROUGH);                       // the link block between them
    flatRoof(m, 28, 12, 44, 30, 10, pal);
    ventStackV(m, 36, 21, 10, 59, 7, pal);
    m.cylX(28, 32, 24, 22, 1.4, SV.steel, M_METAL); m.cylX(40, 44, 24, 22, 1.4, SV.steel, M_METAL);   // ducts into the stack
    panelBox(m, 2, 38, 1, 70, 68, 15);                                    // turbine hall
    flatRoof(m, 2, 38, 70, 68, 15, pal);
    stripWin(m, 3, 27, 67, 8, 11); stripWin(m, 45, 69, 67, 8, 11);
    starFront(m, 36, 67, 8.5, 3.8, pal.main);
    bannerV(m, 29, 32, 67, 14, 9, pal); bannerV(m, 40, 43, 67, 14, 9, pal);
    for (const x of [6, 16, 26, 40, 50, 60]) m.box(x, 43, 16, x + 6, 50, 18, SV.steel, M_METAL);   // roof vents
    starTop(m, 36, 57, 8, pal.main);
    for (const x of [4, 64]) {                                            // switchyard pylons by the hall
      m.line(x + 2, 36, 1, x + 2, 36, 22, SV.steel, M_METAL);
      m.line(x, 36, 20, x + 4, 36, 20, SV.steel, M_METAL);
    }
    return m;
  },
  // BLENDER:refinery_soviets begin
  refinery(pal) {
    const m = new VModel(-2, -2, 74, 50, 56);
    m.box(-1, -1, 0, 73, 49, 1, '#6e6352', M_ROUGH);
    m.box(8, 3, 1, 12, 15, 3, '#878275', M_ROUGH);
    m.box(6, 4, 1, 8, 14, 3, '#878275', M_ROUGH);
    m.box(12, 4, 1, 14, 14, 3, '#878275', M_ROUGH);
    m.box(21, 4, 1, 27, 14, 3, '#878275', M_ROUGH);
    m.box(35, 4, 1, 39, 14, 3, '#878275', M_ROUGH);
    m.box(5, 5, 1, 6, 13, 3, '#878275', M_ROUGH);
    m.box(14, 5, 1, 15, 13, 3, '#878275', M_ROUGH);
    m.box(20, 5, 1, 21, 13, 3, '#878275', M_ROUGH);
    m.box(27, 5, 1, 28, 13, 3, '#878275', M_ROUGH);
    m.box(33, 5, 1, 35, 13, 3, '#878275', M_ROUGH);
    m.box(39, 5, 1, 41, 13, 3, '#878275', M_ROUGH);
    m.box(19, 6, 1, 20, 12, 3, '#878275', M_ROUGH);
    m.box(28, 6, 1, 29, 12, 3, '#878275', M_ROUGH);
    m.box(58, 6, 1, 59, 8, 11, '#5b5d58', M_METAL);
    m.box(4, 7, 1, 5, 11, 3, '#878275', M_ROUGH);
    m.box(15, 7, 1, 16, 11, 3, '#878275', M_ROUGH);
    m.box(32, 7, 1, 33, 11, 3, '#878275', M_ROUGH);
    m.box(41, 7, 1, 42, 11, 3, '#878275', M_ROUGH);
    m.box(16, 8, 1, 18, 10, 19, '#5b5d58', M_METAL);
    m.box(29, 8, 1, 31, 10, 19, '#5b5d58', M_METAL);
    m.box(65, 8, 1, 66, 10, 8, '#5b5d58', M_METAL);
    m.box(52, 11, 1, 54, 12, 7, '#5b5d58', M_METAL);
    m.box(52, 12, 1, 53, 13, 2, '#5b5d58', M_METAL);
    m.box(10, 15, 1, 11, 16, 21, '#5b5d58', M_METAL);
    m.box(67, 15, 1, 68, 17, 2, '#5b5d58', M_METAL);
    m.box(66, 16, 1, 67, 17, 15, '#5b5d58', M_METAL);
    m.box(10, 18, 1, 12, 19, 19, '#5b5d58', M_METAL);
    m.box(54, 18, 1, 55, 20, 8, '#5b5d58', M_METAL);
    m.box(10, 19, 1, 11, 20, 21, '#5b5d58', M_METAL);
    m.box(61, 20, 1, 62, 22, 11, '#5b5d58', M_METAL);
    m.box(1, 21, 1, 3, 45, 3, '#878275', M_ROUGH);
    m.box(3, 21, 1, 5, 23, 9, '#5b5d58', M_METAL);
    m.box(5, 21, 1, 11, 44, 3, '#878275', M_ROUGH);
    m.box(11, 21, 1, 13, 23, 9, '#5b5d58', M_METAL);
    m.box(13, 21, 1, 42, 44, 3, '#878275', M_ROUGH);
    m.box(3, 23, 1, 5, 44, 3, '#878275', M_ROUGH);
    m.box(11, 23, 1, 13, 25, 3, '#878275', M_ROUGH);
    m.box(46, 24, 1, 50, 30, 7, '#4a4743', M_ROUGH);
    m.box(11, 25, 1, 12, 44, 3, '#878275', M_ROUGH);
    m.box(12, 25, 1, 13, 26, 18, '#5b5d58', M_METAL);
    m.box(45, 25, 1, 46, 29, 7, '#4a4743', M_ROUGH);
    m.box(50, 25, 1, 51, 29, 7, '#4a4743', M_ROUGH);
    m.box(12, 26, 1, 13, 44, 3, '#878275', M_ROUGH);
    m.box(52, 31, 1, 54, 40, 3, '#5b5d58', M_METAL);
    m.box(64, 31, 1, 66, 40, 3, '#5b5d58', M_METAL);
    m.box(58, 34, 1, 60, 38, 12, pal.main, M_MATTE);
    m.box(49, 35, 1, 52, 37, 12, '#8c8f8b', M_METAL);
    m.box(54, 35, 1, 58, 37, 12, '#8c8f8b', M_METAL);
    m.box(60, 35, 1, 64, 37, 12, '#8c8f8b', M_METAL);
    m.box(66, 35, 1, 69, 37, 12, '#8c8f8b', M_METAL);
    m.box(42, 43, 1, 43, 45, 10, '#878275', M_ROUGH);
    m.box(9, 44, 1, 11, 45, 11, '#878275', M_ROUGH);
    m.box(17, 44, 1, 19, 45, 6, '#878275', M_ROUGH);
    m.box(25, 44, 1, 27, 45, 6, '#878275', M_ROUGH);
    m.box(29, 44, 1, 42, 45, 6, '#1c1c1a', M_MATTE);
    m.box(26, 45, 1, 27, 47, 4, '#d0a426', M_MATTE);
    m.box(45, 45, 1, 46, 47, 4, '#d0a426', M_MATTE);
    m.box(27, 47, 1, 28, 48, 11, '#5b5d58', M_METAL);
    m.box(44, 47, 1, 45, 48, 11, '#5b5d58', M_METAL);
    m.box(53, 12, 2, 54, 13, 15, '#5b5d58', M_METAL);
    m.box(66, 15, 2, 67, 16, 15, '#5b5d58', M_METAL);
    m.box(67, 16, 2, 68, 17, 7, '#5b5d58', M_METAL);
    m.box(58, 32, 2, 60, 34, 11, pal.main, M_MATTE);
    m.box(49, 33, 2, 52, 35, 11, '#8c8f8b', M_METAL);
    m.box(54, 33, 2, 58, 35, 11, '#8c8f8b', M_METAL);
    m.box(60, 33, 2, 64, 35, 11, '#8c8f8b', M_METAL);
    m.box(66, 33, 2, 69, 35, 11, '#8c8f8b', M_METAL);
    m.box(48, 34, 2, 49, 38, 11, '#8c8f8b', M_METAL);
    m.box(69, 34, 2, 70, 38, 11, '#8c8f8b', M_METAL);
    m.box(49, 37, 2, 52, 39, 11, '#8c8f8b', M_METAL);
    m.box(54, 37, 2, 58, 39, 11, '#8c8f8b', M_METAL);
    m.box(60, 37, 2, 64, 39, 11, '#8c8f8b', M_METAL);
    m.box(66, 37, 2, 69, 39, 11, '#8c8f8b', M_METAL);
    m.box(58, 38, 2, 60, 40, 11, pal.main, M_MATTE);
    m.box(7, 5, 3, 13, 13, 5, '#8c8f8b', M_METAL);
    m.box(22, 5, 3, 26, 13, 5, '#8c8f8b', M_METAL);
    m.box(6, 6, 3, 7, 12, 5, '#8c8f8b', M_METAL);
    m.box(13, 6, 3, 14, 12, 5, '#8c8f8b', M_METAL);
    m.box(21, 6, 3, 22, 12, 5, '#8c8f8b', M_METAL);
    m.box(26, 6, 3, 27, 12, 5, '#8c8f8b', M_METAL);
    m.box(35, 6, 3, 39, 12, 5, '#8c8f8b', M_METAL);
    m.box(20, 7, 3, 21, 11, 5, '#8c8f8b', M_METAL);
    m.box(27, 7, 3, 28, 11, 5, '#8c8f8b', M_METAL);
    m.box(34, 7, 3, 35, 11, 5, '#8c8f8b', M_METAL);
    m.box(39, 7, 3, 40, 11, 5, '#8c8f8b', M_METAL);
    m.box(23, 13, 3, 25, 14, 38, '#5b5d58', M_METAL);
    m.box(36, 13, 3, 38, 14, 31, '#5b5d58', M_METAL);
    m.box(9, 14, 3, 11, 15, 44, '#5b5d58', M_METAL);
    m.box(2, 22, 3, 3, 43, 12, '#a39e91', M_ROUGH);
    m.box(5, 22, 3, 11, 43, 9, '#a39e91', M_ROUGH);
    m.box(13, 22, 3, 42, 43, 7, '#a39e91', M_ROUGH);
    m.box(3, 23, 3, 5, 44, 11, '#a39e91', M_ROUGH);
    m.box(11, 23, 3, 13, 25, 12, '#a39e91', M_ROUGH);
    m.box(11, 25, 3, 12, 44, 11, '#a39e91', M_ROUGH);
    m.box(12, 26, 3, 13, 44, 11, '#a39e91', M_ROUGH);
    m.box(58, 31, 3, 60, 32, 10, pal.main, M_MATTE);
    m.box(49, 32, 3, 58, 33, 10, '#8c8f8b', M_METAL);
    m.box(60, 32, 3, 69, 33, 10, '#8c8f8b', M_METAL);
    m.box(48, 33, 3, 49, 34, 10, '#8c8f8b', M_METAL);
    m.box(52, 33, 3, 54, 40, 10, '#8c8f8b', M_METAL);
    m.box(64, 33, 3, 66, 40, 10, '#8c8f8b', M_METAL);
    m.box(69, 33, 3, 70, 34, 10, '#8c8f8b', M_METAL);
    m.box(47, 35, 3, 48, 37, 10, '#8c8f8b', M_METAL);
    m.box(70, 35, 3, 71, 37, 10, '#8c8f8b', M_METAL);
    m.box(48, 38, 3, 49, 39, 10, '#8c8f8b', M_METAL);
    m.box(69, 38, 3, 70, 39, 10, '#8c8f8b', M_METAL);
    m.box(49, 39, 3, 52, 40, 10, '#8c8f8b', M_METAL);
    m.box(54, 39, 3, 58, 40, 10, '#8c8f8b', M_METAL);
    m.box(60, 39, 3, 64, 40, 10, '#8c8f8b', M_METAL);
    m.box(66, 39, 3, 69, 40, 10, '#8c8f8b', M_METAL);
    m.box(58, 40, 3, 60, 41, 10, pal.main, M_MATTE);
    m.box(1, 43, 3, 3, 45, 11, '#878275', M_ROUGH);
    m.box(5, 43, 3, 9, 44, 11, '#a39e91', M_ROUGH);
    m.box(9, 43, 3, 11, 44, 11, '#878275', M_ROUGH);
    m.box(13, 43, 3, 17, 44, 11, '#a39e91', M_ROUGH);
    m.box(17, 43, 3, 19, 44, 11, '#878275', M_ROUGH);
    m.box(19, 43, 3, 25, 44, 11, '#a39e91', M_ROUGH);
    m.box(25, 43, 3, 27, 44, 11, '#878275', M_ROUGH);
    m.box(27, 43, 3, 33, 44, 11, '#a39e91', M_ROUGH);
    m.box(33, 43, 3, 35, 44, 11, '#878275', M_ROUGH);
    m.box(35, 43, 3, 41, 44, 11, '#a39e91', M_ROUGH);
    m.box(41, 43, 3, 42, 44, 11, '#878275', M_ROUGH);
    m.box(49, 31, 4, 58, 32, 9, '#8c8f8b', M_METAL);
    m.box(60, 31, 4, 69, 32, 9, '#8c8f8b', M_METAL);
    m.box(48, 32, 4, 49, 33, 9, '#8c8f8b', M_METAL);
    m.box(69, 32, 4, 70, 33, 9, '#8c8f8b', M_METAL);
    m.box(47, 34, 4, 48, 35, 9, '#8c8f8b', M_METAL);
    m.box(70, 34, 4, 71, 35, 9, '#8c8f8b', M_METAL);
    m.box(47, 37, 4, 48, 38, 9, '#8c8f8b', M_METAL);
    m.box(70, 37, 4, 71, 38, 9, '#8c8f8b', M_METAL);
    m.box(48, 39, 4, 49, 40, 9, '#8c8f8b', M_METAL);
    m.box(69, 39, 4, 70, 40, 9, '#8c8f8b', M_METAL);
    m.box(49, 40, 4, 58, 41, 9, '#8c8f8b', M_METAL);
    m.box(60, 40, 4, 69, 41, 9, '#8c8f8b', M_METAL);
    m.box(8, 4, 5, 12, 14, 6, '#878275', M_ROUGH);
    m.box(6, 5, 5, 8, 13, 6, '#878275', M_ROUGH);
    m.box(12, 5, 5, 14, 13, 6, '#878275', M_ROUGH);
    m.box(21, 5, 5, 27, 13, 6, '#878275', M_ROUGH);
    m.box(35, 5, 5, 39, 13, 6, '#878275', M_ROUGH);
    m.box(20, 6, 5, 21, 12, 6, '#878275', M_ROUGH);
    m.box(27, 6, 5, 28, 12, 6, '#878275', M_ROUGH);
    m.box(34, 6, 5, 35, 12, 6, '#878275', M_ROUGH);
    m.box(39, 6, 5, 40, 12, 6, '#878275', M_ROUGH);
    m.box(5, 7, 5, 6, 11, 6, '#878275', M_ROUGH);
    m.box(14, 7, 5, 15, 11, 6, '#878275', M_ROUGH);
    m.box(33, 7, 5, 34, 11, 6, '#878275', M_ROUGH);
    m.box(40, 7, 5, 41, 11, 6, '#878275', M_ROUGH);
    m.box(64, 9, 5, 65, 10, 15, '#5b5d58', M_METAL);
    m.box(55, 18, 5, 56, 19, 15, '#5b5d58', M_METAL);
    m.box(47, 33, 5, 48, 34, 8, '#8c8f8b', M_METAL);
    m.box(70, 33, 5, 71, 34, 8, '#8c8f8b', M_METAL);
    m.box(47, 38, 5, 48, 39, 8, '#8c8f8b', M_METAL);
    m.box(70, 38, 5, 71, 39, 8, '#8c8f8b', M_METAL);
    m.box(7, 5, 6, 13, 13, 12, '#8c8f8b', M_METAL);
    m.box(22, 5, 6, 26, 13, 12, '#8c8f8b', M_METAL);
    m.box(6, 6, 6, 7, 12, 12, '#8c8f8b', M_METAL);
    m.box(13, 6, 6, 14, 12, 12, '#8c8f8b', M_METAL);
    m.box(21, 6, 6, 22, 12, 12, '#8c8f8b', M_METAL);
    m.box(26, 6, 6, 27, 12, 12, '#8c8f8b', M_METAL);
    m.box(35, 6, 6, 39, 12, 12, '#8c8f8b', M_METAL);
    m.box(20, 7, 6, 21, 11, 12, '#8c8f8b', M_METAL);
    m.box(27, 7, 6, 28, 11, 12, '#8c8f8b', M_METAL);
    m.box(34, 7, 6, 35, 11, 12, '#8c8f8b', M_METAL);
    m.box(39, 7, 6, 40, 11, 12, '#8c8f8b', M_METAL);
    m.box(58, 30, 6, 60, 31, 7, pal.main, M_MATTE);
    m.box(48, 31, 6, 49, 32, 7, '#8c8f8b', M_METAL);
    m.box(69, 31, 6, 70, 32, 7, '#8c8f8b', M_METAL);
    m.box(48, 40, 6, 49, 41, 7, '#8c8f8b', M_METAL);
    m.box(69, 40, 6, 70, 41, 7, '#8c8f8b', M_METAL);
    m.box(58, 41, 6, 60, 42, 7, pal.main, M_MATTE);
    m.box(17, 44, 6, 18, 45, 11, '#878275', M_ROUGH);
    m.box(18, 44, 6, 21, 45, 9, '#35505f', M_GLASS);
    m.box(22, 44, 6, 25, 45, 9, '#35505f', M_GLASS);
    m.box(25, 44, 6, 26, 45, 11, '#878275', M_ROUGH);
    m.box(26, 44, 6, 29, 45, 9, '#35505f', M_GLASS);
    m.box(29, 44, 6, 30, 45, 10, '#1c1c1a', M_MATTE);
    m.box(30, 44, 6, 33, 45, 9, '#35505f', M_GLASS);
    m.box(33, 44, 6, 42, 45, 10, '#1c1c1a', M_MATTE);
    m.box(53, 11, 7, 54, 12, 15, '#5b5d58', M_METAL);
    m.box(13, 22, 7, 42, 26, 9, '#a39e91', M_ROUGH);
    m.box(57, 23, 7, 60, 25, 9, '#7f8480', M_METAL);
    m.box(46, 24, 7, 50, 25, 26, '#4a4743', M_ROUGH);
    m.box(51, 24, 7, 57, 26, 9, '#7f8480', M_METAL);
    m.box(45, 25, 7, 51, 27, 9, '#7f8480', M_METAL);
    m.box(13, 26, 7, 41, 43, 12, '#a39e91', M_ROUGH);
    m.box(41, 26, 7, 45, 28, 9, '#7f8480', M_METAL);
    m.box(51, 26, 7, 55, 28, 9, '#7f8480', M_METAL);
    m.box(45, 27, 7, 49, 28, 9, '#5b5d58', M_METAL);
    m.box(49, 27, 7, 51, 28, 9, '#7f8480', M_METAL);
    m.box(41, 28, 7, 42, 43, 12, '#a39e91', M_ROUGH);
    m.box(45, 28, 7, 46, 29, 26, '#4a4743', M_ROUGH);
    m.box(46, 28, 7, 48, 29, 9, '#5b5d58', M_METAL);
    m.box(48, 28, 7, 51, 29, 26, '#4a4743', M_ROUGH);
    m.box(46, 29, 7, 50, 30, 26, '#4a4743', M_ROUGH);
    m.box(65, 9, 8, 66, 10, 15, '#5b5d58', M_METAL);
    m.box(54, 18, 8, 55, 19, 15, '#5b5d58', M_METAL);
    m.box(58, 11, 9, 62, 17, 19, '#9aa09c', M_METAL);
    m.box(57, 12, 9, 58, 16, 19, '#9aa09c', M_METAL);
    m.box(62, 12, 9, 63, 16, 19, '#9aa09c', M_METAL);
    m.box(9, 19, 9, 10, 23, 12, '#5b5d58', M_METAL);
    m.box(21, 19, 9, 23, 23, 12, '#5b5d58', M_METAL);
    m.box(33, 19, 9, 35, 23, 12, '#5b5d58', M_METAL);
    m.box(4, 20, 9, 8, 22, 12, '#7f8480', M_METAL);
    m.box(8, 20, 9, 9, 22, 12, '#5b5d58', M_METAL);
    m.box(10, 20, 9, 12, 23, 12, '#5b5d58', M_METAL);
    m.box(12, 20, 9, 20, 22, 12, '#7f8480', M_METAL);
    m.box(20, 20, 9, 21, 22, 12, '#5b5d58', M_METAL);
    m.box(23, 20, 9, 24, 22, 12, '#5b5d58', M_METAL);
    m.box(24, 20, 9, 32, 22, 12, '#7f8480', M_METAL);
    m.box(32, 20, 9, 33, 22, 12, '#5b5d58', M_METAL);
    m.box(35, 20, 9, 36, 22, 12, '#5b5d58', M_METAL);
    m.box(36, 20, 9, 42, 22, 12, '#7f8480', M_METAL);
    m.box(3, 21, 9, 4, 23, 47, '#5b5d58', M_METAL);
    m.box(4, 22, 9, 5, 23, 47, '#5b5d58', M_METAL);
    m.box(5, 22, 9, 9, 43, 12, '#a39e91', M_ROUGH);
    m.box(12, 22, 9, 13, 23, 18, '#5b5d58', M_METAL);
    m.box(13, 22, 9, 21, 26, 12, '#a39e91', M_ROUGH);
    m.box(23, 22, 9, 33, 26, 12, '#a39e91', M_ROUGH);
    m.box(35, 22, 9, 42, 26, 12, '#a39e91', M_ROUGH);
    m.box(9, 23, 9, 11, 43, 12, '#a39e91', M_ROUGH);
    m.box(21, 23, 9, 23, 26, 12, '#a39e91', M_ROUGH);
    m.box(33, 23, 9, 35, 26, 12, '#a39e91', M_ROUGH);
    m.box(45, 25, 9, 51, 28, 26, '#4a4743', M_ROUGH);
    m.box(41, 26, 9, 42, 28, 12, '#a39e91', M_ROUGH);
    m.box(46, 28, 9, 48, 29, 26, '#4a4743', M_ROUGH);
    m.box(18, 44, 9, 19, 45, 11, '#878275', M_ROUGH);
    m.box(26, 44, 9, 27, 45, 11, '#878275', M_ROUGH);
    m.box(30, 44, 9, 33, 45, 10, '#1c1c1a', M_MATTE);
    m.box(58, 9, 10, 62, 11, 19, '#9aa09c', M_METAL);
    m.box(56, 10, 10, 58, 12, 19, '#9aa09c', M_METAL);
    m.box(62, 10, 10, 64, 12, 19, '#9aa09c', M_METAL);
    m.box(55, 12, 10, 57, 16, 19, '#9aa09c', M_METAL);
    m.box(63, 12, 10, 65, 16, 19, '#9aa09c', M_METAL);
    m.box(56, 16, 10, 58, 18, 19, '#9aa09c', M_METAL);
    m.box(62, 16, 10, 64, 18, 19, '#9aa09c', M_METAL);
    m.box(58, 17, 10, 62, 19, 19, '#9aa09c', M_METAL);
    m.box(52, 33, 10, 54, 39, 11, '#8c8f8b', M_METAL);
    m.box(64, 33, 10, 66, 39, 11, '#8c8f8b', M_METAL);
    m.box(42, 43, 10, 43, 44, 11, '#878275', M_ROUGH);
    m.box(28, 44, 10, 44, 46, 11, pal.dark, M_MATTE);
    m.box(58, 7, 11, 59, 8, 15, '#5b5d58', M_METAL);
    m.box(57, 8, 11, 63, 9, 19, '#9aa09c', M_METAL);
    m.box(55, 9, 11, 58, 10, 19, '#9aa09c', M_METAL);
    m.box(62, 9, 11, 64, 10, 19, '#9aa09c', M_METAL);
    m.box(55, 10, 11, 56, 12, 19, '#9aa09c', M_METAL);
    m.box(64, 10, 11, 65, 12, 19, '#9aa09c', M_METAL);
    m.box(54, 11, 11, 55, 17, 19, '#9aa09c', M_METAL);
    m.box(65, 11, 11, 66, 17, 19, '#9aa09c', M_METAL);
    m.box(55, 16, 11, 56, 18, 19, '#9aa09c', M_METAL);
    m.box(64, 16, 11, 65, 19, 19, '#9aa09c', M_METAL);
    m.box(56, 18, 11, 58, 19, 19, '#9aa09c', M_METAL);
    m.box(62, 18, 11, 64, 19, 19, '#9aa09c', M_METAL);
    m.box(57, 19, 11, 63, 20, 19, '#9aa09c', M_METAL);
    m.box(61, 20, 11, 62, 21, 15, '#5b5d58', M_METAL);
    m.box(3, 23, 11, 5, 43, 12, '#a39e91', M_ROUGH);
    m.box(11, 25, 11, 12, 43, 12, '#a39e91', M_ROUGH);
    m.box(12, 26, 11, 13, 43, 12, '#a39e91', M_ROUGH);
    m.box(52, 35, 11, 54, 37, 12, '#8c8f8b', M_METAL);
    m.box(64, 35, 11, 66, 37, 12, '#8c8f8b', M_METAL);
    m.box(2, 43, 11, 42, 44, 12, pal.dark, M_MATTE);
    m.box(2, 45, 11, 4, 47, 12, '#34362f', M_METAL);
    m.box(27, 45, 11, 45, 48, 12, '#34362f', M_METAL);
    m.box(57, 45, 11, 59, 47, 12, '#34362f', M_METAL);
    m.box(8, 2, 12, 12, 4, 13, '#5b5d58', M_METAL);
    m.box(6, 3, 12, 8, 5, 13, '#5b5d58', M_METAL);
    m.box(12, 3, 12, 14, 5, 13, '#5b5d58', M_METAL);
    m.box(21, 3, 12, 27, 5, 13, '#5b5d58', M_METAL);
    m.box(5, 4, 12, 6, 7, 13, '#5b5d58', M_METAL);
    m.box(8, 4, 12, 12, 14, 13, '#878275', M_ROUGH);
    m.box(14, 4, 12, 15, 7, 13, '#5b5d58', M_METAL);
    m.box(20, 4, 12, 21, 6, 13, '#5b5d58', M_METAL);
    m.box(27, 4, 12, 28, 6, 13, '#5b5d58', M_METAL);
    m.box(4, 5, 12, 5, 13, 13, '#5b5d58', M_METAL);
    m.box(6, 5, 12, 8, 13, 13, '#878275', M_ROUGH);
    m.box(12, 5, 12, 14, 13, 13, '#878275', M_ROUGH);
    m.box(15, 5, 12, 16, 13, 13, '#5b5d58', M_METAL);
    m.box(19, 5, 12, 20, 13, 13, '#5b5d58', M_METAL);
    m.box(21, 5, 12, 27, 13, 13, '#878275', M_ROUGH);
    m.box(28, 5, 12, 29, 13, 13, '#5b5d58', M_METAL);
    m.box(35, 5, 12, 39, 13, 13, '#878275', M_ROUGH);
    m.box(18, 6, 12, 19, 12, 13, '#5b5d58', M_METAL);
    m.box(20, 6, 12, 21, 12, 13, '#878275', M_ROUGH);
    m.box(27, 6, 12, 28, 12, 13, '#878275', M_ROUGH);
    m.box(29, 6, 12, 30, 8, 13, '#5b5d58', M_METAL);
    m.box(34, 6, 12, 35, 12, 13, '#878275', M_ROUGH);
    m.box(39, 6, 12, 40, 12, 13, '#878275', M_ROUGH);
    m.box(3, 7, 12, 4, 11, 13, '#5b5d58', M_METAL);
    m.box(5, 7, 12, 6, 11, 13, '#878275', M_ROUGH);
    m.box(14, 7, 12, 15, 11, 13, '#878275', M_ROUGH);
    m.box(16, 7, 12, 17, 8, 13, '#5b5d58', M_METAL);
    m.box(33, 7, 12, 34, 11, 13, '#878275', M_ROUGH);
    m.box(40, 7, 12, 41, 11, 13, '#878275', M_ROUGH);
    m.box(57, 7, 12, 58, 8, 19, '#9aa09c', M_METAL);
    m.box(59, 7, 12, 63, 8, 19, '#9aa09c', M_METAL);
    m.box(55, 8, 12, 57, 9, 19, '#9aa09c', M_METAL);
    m.box(63, 8, 12, 65, 9, 19, '#9aa09c', M_METAL);
    m.box(54, 9, 12, 55, 11, 19, '#9aa09c', M_METAL);
    m.box(16, 10, 12, 17, 11, 13, '#5b5d58', M_METAL);
    m.box(29, 10, 12, 30, 12, 13, '#5b5d58', M_METAL);
    m.box(65, 10, 12, 66, 11, 19, '#9aa09c', M_METAL);
    m.box(5, 11, 12, 6, 14, 13, '#5b5d58', M_METAL);
    m.box(14, 11, 12, 15, 14, 13, '#5b5d58', M_METAL);
    m.box(66, 11, 12, 67, 15, 19, '#9aa09c', M_METAL);
    m.box(20, 12, 12, 21, 14, 13, '#5b5d58', M_METAL);
    m.box(27, 12, 12, 28, 14, 13, '#5b5d58', M_METAL);
    m.box(6, 13, 12, 8, 15, 13, '#5b5d58', M_METAL);
    m.box(12, 13, 12, 14, 15, 13, '#5b5d58', M_METAL);
    m.box(21, 13, 12, 23, 15, 13, '#5b5d58', M_METAL);
    m.box(25, 13, 12, 27, 15, 13, '#5b5d58', M_METAL);
    m.box(53, 13, 12, 54, 17, 19, '#9aa09c', M_METAL);
    m.box(8, 14, 12, 9, 16, 13, '#5b5d58', M_METAL);
    m.box(11, 14, 12, 12, 16, 13, '#5b5d58', M_METAL);
    m.box(23, 14, 12, 25, 15, 13, '#5b5d58', M_METAL);
    m.box(9, 15, 12, 10, 16, 13, '#5b5d58', M_METAL);
    m.box(54, 17, 12, 55, 18, 19, '#9aa09c', M_METAL);
    m.box(65, 17, 12, 66, 19, 19, '#9aa09c', M_METAL);
    m.box(55, 19, 12, 57, 20, 19, '#9aa09c', M_METAL);
    m.box(63, 19, 12, 65, 20, 19, '#9aa09c', M_METAL);
    m.box(57, 20, 12, 61, 21, 19, '#9aa09c', M_METAL);
    m.box(62, 20, 12, 63, 21, 19, '#9aa09c', M_METAL);
    m.box(4, 21, 12, 5, 22, 47, '#5b5d58', M_METAL);
    m.box(11, 21, 12, 13, 22, 18, '#5b5d58', M_METAL);
    m.box(2, 22, 12, 3, 44, 13, '#77746a', M_ROUGH);
    m.box(5, 22, 12, 11, 44, 13, '#77746a', M_ROUGH);
    m.box(11, 22, 12, 12, 23, 19, '#5b5d58', M_METAL);
    m.box(13, 22, 12, 42, 44, 13, '#77746a', M_ROUGH);
    m.box(3, 23, 12, 5, 44, 13, '#77746a', M_ROUGH);
    m.box(11, 23, 12, 13, 25, 13, '#77746a', M_ROUGH);
    m.box(11, 25, 12, 12, 44, 13, '#77746a', M_ROUGH);
    m.box(12, 26, 12, 13, 44, 13, '#77746a', M_ROUGH);
    m.box(7, 5, 13, 13, 13, 15, '#8c8f8b', M_METAL);
    m.box(22, 5, 13, 26, 13, 15, '#8c8f8b', M_METAL);
    m.box(6, 6, 13, 7, 12, 19, '#8c8f8b', M_METAL);
    m.box(13, 6, 13, 14, 12, 15, '#8c8f8b', M_METAL);
    m.box(21, 6, 13, 22, 12, 15, '#8c8f8b', M_METAL);
    m.box(26, 6, 13, 27, 12, 15, '#8c8f8b', M_METAL);
    m.box(35, 6, 13, 39, 12, 14, '#8c8f8b', M_METAL);
    m.box(57, 6, 13, 63, 7, 19, '#9aa09c', M_METAL);
    m.box(20, 7, 13, 21, 11, 15, '#8c8f8b', M_METAL);
    m.box(27, 7, 13, 28, 11, 15, '#8c8f8b', M_METAL);
    m.box(34, 7, 13, 35, 11, 14, '#8c8f8b', M_METAL);
    m.box(39, 7, 13, 40, 11, 14, '#8c8f8b', M_METAL);
    m.box(55, 7, 13, 57, 8, 19, '#9aa09c', M_METAL);
    m.box(63, 7, 13, 65, 8, 19, '#9aa09c', M_METAL);
    m.box(54, 8, 13, 55, 9, 19, '#9aa09c', M_METAL);
    m.box(65, 8, 13, 66, 9, 19, '#9aa09c', M_METAL);
    m.box(53, 9, 13, 54, 11, 19, '#9aa09c', M_METAL);
    m.box(66, 9, 13, 67, 11, 19, '#9aa09c', M_METAL);
    m.box(52, 11, 13, 53, 17, 19, '#9aa09c', M_METAL);
    m.box(67, 11, 13, 68, 17, 19, '#9aa09c', M_METAL);
    m.box(53, 17, 13, 54, 19, 19, '#9aa09c', M_METAL);
    m.box(66, 17, 13, 67, 19, 19, '#9aa09c', M_METAL);
    m.box(54, 19, 13, 55, 20, 19, '#9aa09c', M_METAL);
    m.box(65, 19, 13, 66, 20, 19, '#9aa09c', M_METAL);
    m.box(55, 20, 13, 57, 21, 19, '#9aa09c', M_METAL);
    m.box(63, 20, 13, 65, 21, 19, '#9aa09c', M_METAL);
    m.box(57, 21, 13, 63, 22, 19, '#9aa09c', M_METAL);
    m.box(2, 22, 13, 3, 44, 14, pal.main, M_MATTE);
    m.box(5, 22, 13, 11, 23, 14, pal.main, M_MATTE);
    m.box(13, 22, 13, 42, 23, 14, pal.main, M_MATTE);
    m.box(41, 23, 13, 42, 44, 14, pal.main, M_MATTE);
    m.box(10, 28, 13, 16, 36, 17, '#56603b', M_METAL);
    m.box(9, 29, 13, 10, 35, 17, '#56603b', M_METAL);
    m.box(16, 29, 13, 17, 35, 17, '#56603b', M_METAL);
    m.box(8, 30, 13, 9, 34, 17, '#56603b', M_METAL);
    m.box(17, 30, 13, 18, 34, 17, '#56603b', M_METAL);
    m.box(28, 36, 13, 32, 40, 17, '#7f8480', M_METAL);
    m.box(34, 36, 13, 38, 40, 17, '#7f8480', M_METAL);
    m.box(3, 43, 13, 41, 44, 14, pal.main, M_MATTE);
    m.box(36, 3, 14, 38, 13, 15, '#5b5d58', M_METAL);
    m.box(34, 4, 14, 36, 14, 15, '#5b5d58', M_METAL);
    m.box(38, 4, 14, 40, 14, 15, '#5b5d58', M_METAL);
    m.box(33, 5, 14, 34, 13, 15, '#5b5d58', M_METAL);
    m.box(40, 5, 14, 41, 13, 15, '#5b5d58', M_METAL);
    m.box(59, 5, 14, 61, 6, 19, '#9aa09c', M_METAL);
    m.box(32, 6, 14, 33, 12, 15, '#5b5d58', M_METAL);
    m.box(41, 6, 14, 42, 12, 15, '#5b5d58', M_METAL);
    m.box(56, 6, 14, 57, 7, 19, '#9aa09c', M_METAL);
    m.box(63, 6, 14, 64, 7, 19, '#9aa09c', M_METAL);
    m.box(54, 7, 14, 55, 8, 19, '#9aa09c', M_METAL);
    m.box(65, 7, 14, 66, 8, 19, '#9aa09c', M_METAL);
    m.box(31, 8, 14, 32, 10, 15, '#5b5d58', M_METAL);
    m.box(42, 8, 14, 43, 10, 15, '#5b5d58', M_METAL);
    m.box(53, 8, 14, 54, 9, 19, '#9aa09c', M_METAL);
    m.box(66, 8, 14, 67, 9, 19, '#9aa09c', M_METAL);
    m.box(52, 10, 14, 53, 11, 19, '#9aa09c', M_METAL);
    m.box(67, 10, 14, 68, 11, 19, '#9aa09c', M_METAL);
    m.box(51, 13, 14, 52, 15, 19, '#9aa09c', M_METAL);
    m.box(68, 13, 14, 69, 15, 19, '#9aa09c', M_METAL);
    m.box(36, 14, 14, 38, 15, 15, '#5b5d58', M_METAL);
    m.box(52, 17, 14, 53, 18, 19, '#9aa09c', M_METAL);
    m.box(67, 17, 14, 68, 18, 19, '#9aa09c', M_METAL);
    m.box(53, 19, 14, 54, 20, 19, '#9aa09c', M_METAL);
    m.box(66, 19, 14, 67, 20, 19, '#9aa09c', M_METAL);
    m.box(54, 20, 14, 55, 21, 19, '#9aa09c', M_METAL);
    m.box(65, 20, 14, 66, 21, 19, '#9aa09c', M_METAL);
    m.box(56, 21, 14, 57, 22, 19, '#9aa09c', M_METAL);
    m.box(63, 21, 14, 64, 22, 19, '#9aa09c', M_METAL);
    m.box(59, 22, 14, 61, 23, 19, '#9aa09c', M_METAL);
    m.box(11, 27, 14, 15, 28, 17, '#56603b', M_METAL);
    m.box(9, 28, 14, 10, 29, 17, '#56603b', M_METAL);
    m.box(16, 28, 14, 17, 29, 17, '#56603b', M_METAL);
    m.box(8, 29, 14, 9, 30, 17, '#56603b', M_METAL);
    m.box(17, 29, 14, 18, 30, 17, '#56603b', M_METAL);
    m.box(7, 30, 14, 8, 34, 17, '#56603b', M_METAL);
    m.box(18, 30, 14, 19, 34, 17, '#56603b', M_METAL);
    m.box(8, 34, 14, 9, 35, 17, '#56603b', M_METAL);
    m.box(17, 34, 14, 18, 35, 17, '#56603b', M_METAL);
    m.box(9, 35, 14, 10, 36, 17, '#56603b', M_METAL);
    m.box(16, 35, 14, 17, 36, 17, '#56603b', M_METAL);
    m.box(11, 36, 14, 15, 37, 17, '#56603b', M_METAL);
    m.box(7, 5, 15, 13, 7, 19, '#8c8f8b', M_METAL);
    m.box(22, 5, 15, 26, 7, 19, '#8c8f8b', M_METAL);
    m.box(56, 5, 15, 59, 6, 19, '#9aa09c', M_METAL);
    m.box(61, 5, 15, 64, 6, 19, '#9aa09c', M_METAL);
    m.box(13, 6, 15, 14, 7, 19, '#8c8f8b', M_METAL);
    m.box(21, 6, 15, 22, 7, 19, '#8c8f8b', M_METAL);
    m.box(26, 6, 15, 27, 7, 19, '#8c8f8b', M_METAL);
    m.box(35, 6, 15, 39, 7, 19, '#8c8f8b', M_METAL);
    m.box(55, 6, 15, 56, 7, 19, '#9aa09c', M_METAL);
    m.box(64, 6, 15, 65, 7, 19, '#9aa09c', M_METAL);
    m.box(7, 7, 15, 10, 13, 19, '#8c8f8b', M_METAL);
    m.box(10, 7, 15, 37, 8, 17, '#7f8480', M_METAL);
    m.box(37, 7, 15, 40, 11, 19, '#8c8f8b', M_METAL);
    m.box(53, 7, 15, 54, 8, 19, '#9aa09c', M_METAL);
    m.box(58, 7, 15, 59, 8, 19, '#9aa09c', M_METAL);
    m.box(66, 7, 15, 67, 8, 19, '#9aa09c', M_METAL);
    m.box(10, 8, 15, 16, 9, 17, '#7f8480', M_METAL);
    m.box(18, 8, 15, 29, 9, 17, '#7f8480', M_METAL);
    m.box(31, 8, 15, 37, 9, 17, '#7f8480', M_METAL);
    m.box(10, 9, 15, 14, 12, 19, '#8c8f8b', M_METAL);
    m.box(20, 9, 15, 28, 11, 19, '#8c8f8b', M_METAL);
    m.box(34, 9, 15, 37, 11, 19, '#8c8f8b', M_METAL);
    m.box(52, 9, 15, 53, 10, 19, '#9aa09c', M_METAL);
    m.box(64, 9, 15, 66, 10, 19, '#9aa09c', M_METAL);
    m.box(67, 9, 15, 68, 10, 19, '#9aa09c', M_METAL);
    m.box(51, 10, 15, 52, 13, 19, '#9aa09c', M_METAL);
    m.box(68, 10, 15, 69, 13, 19, '#9aa09c', M_METAL);
    m.box(21, 11, 15, 27, 12, 19, '#8c8f8b', M_METAL);
    m.box(35, 11, 15, 39, 12, 19, '#8c8f8b', M_METAL);
    m.box(53, 11, 15, 54, 13, 19, '#9aa09c', M_METAL);
    m.box(10, 12, 15, 13, 13, 19, '#8c8f8b', M_METAL);
    m.box(22, 12, 15, 26, 13, 19, '#8c8f8b', M_METAL);
    m.box(51, 15, 15, 52, 18, 19, '#9aa09c', M_METAL);
    m.box(66, 15, 15, 67, 17, 19, '#9aa09c', M_METAL);
    m.box(68, 15, 15, 69, 18, 19, '#9aa09c', M_METAL);
    m.box(52, 18, 15, 53, 19, 19, '#9aa09c', M_METAL);
    m.box(54, 18, 15, 56, 19, 19, '#9aa09c', M_METAL);
    m.box(67, 18, 15, 68, 19, 19, '#9aa09c', M_METAL);
    m.box(53, 20, 15, 54, 21, 19, '#9aa09c', M_METAL);
    m.box(61, 20, 15, 62, 21, 19, '#9aa09c', M_METAL);
    m.box(66, 20, 15, 67, 21, 19, '#9aa09c', M_METAL);
    m.box(55, 21, 15, 56, 22, 19, '#9aa09c', M_METAL);
    m.box(64, 21, 15, 65, 22, 19, '#9aa09c', M_METAL);
    m.box(56, 22, 15, 59, 23, 19, '#9aa09c', M_METAL);
    m.box(61, 22, 15, 64, 23, 19, '#9aa09c', M_METAL);
    m.box(10, 27, 15, 11, 28, 18, '#56603b', M_METAL);
    m.box(15, 27, 15, 16, 28, 18, '#56603b', M_METAL);
    m.box(10, 36, 15, 11, 37, 18, '#56603b', M_METAL);
    m.box(15, 36, 15, 16, 37, 18, '#56603b', M_METAL);
    m.box(59, 4, 16, 61, 5, 19, '#9aa09c', M_METAL);
    m.box(54, 6, 16, 55, 7, 19, '#9aa09c', M_METAL);
    m.box(65, 6, 16, 66, 7, 19, '#9aa09c', M_METAL);
    m.box(52, 8, 16, 53, 9, 19, '#9aa09c', M_METAL);
    m.box(67, 8, 16, 68, 9, 19, '#9aa09c', M_METAL);
    m.box(50, 13, 16, 51, 15, 19, '#9aa09c', M_METAL);
    m.box(69, 13, 16, 70, 15, 19, '#9aa09c', M_METAL);
    m.box(52, 19, 16, 53, 20, 19, '#9aa09c', M_METAL);
    m.box(67, 19, 16, 68, 20, 19, '#9aa09c', M_METAL);
    m.box(54, 21, 16, 55, 22, 19, '#9aa09c', M_METAL);
    m.box(65, 21, 16, 66, 22, 19, '#9aa09c', M_METAL);
    m.box(59, 23, 16, 61, 24, 19, '#9aa09c', M_METAL);
    m.box(9, 27, 16, 10, 28, 18, '#56603b', M_METAL);
    m.box(16, 27, 16, 17, 28, 18, '#56603b', M_METAL);
    m.box(8, 28, 16, 9, 29, 18, '#56603b', M_METAL);
    m.box(17, 28, 16, 18, 29, 18, '#56603b', M_METAL);
    m.box(7, 29, 16, 8, 30, 18, '#56603b', M_METAL);
    m.box(18, 29, 16, 19, 30, 18, '#56603b', M_METAL);
    m.box(7, 34, 16, 8, 35, 18, '#56603b', M_METAL);
    m.box(18, 34, 16, 19, 35, 18, '#56603b', M_METAL);
    m.box(8, 35, 16, 9, 36, 18, '#56603b', M_METAL);
    m.box(17, 35, 16, 18, 36, 18, '#56603b', M_METAL);
    m.box(9, 36, 16, 10, 37, 18, '#56603b', M_METAL);
    m.box(16, 36, 16, 17, 37, 18, '#56603b', M_METAL);
    m.box(55, 5, 17, 56, 6, 19, '#9aa09c', M_METAL);
    m.box(64, 5, 17, 65, 6, 19, '#9aa09c', M_METAL);
    m.box(10, 7, 17, 14, 9, 19, '#8c8f8b', M_METAL);
    m.box(20, 7, 17, 28, 9, 19, '#8c8f8b', M_METAL);
    m.box(34, 7, 17, 37, 9, 19, '#8c8f8b', M_METAL);
    m.box(51, 9, 17, 52, 10, 19, '#9aa09c', M_METAL);
    m.box(68, 9, 17, 69, 10, 19, '#9aa09c', M_METAL);
    m.box(51, 18, 17, 52, 19, 19, '#9aa09c', M_METAL);
    m.box(68, 18, 17, 69, 19, 19, '#9aa09c', M_METAL);
    m.box(55, 22, 17, 56, 23, 19, '#9aa09c', M_METAL);
    m.box(64, 22, 17, 65, 23, 19, '#9aa09c', M_METAL);
    m.box(11, 24, 17, 14, 25, 21, '#7f8480', M_METAL);
    m.box(11, 25, 17, 12, 27, 20, '#7f8480', M_METAL);
    m.box(13, 25, 17, 14, 27, 20, '#7f8480', M_METAL);
    m.box(10, 26, 17, 11, 27, 18, '#56603b', M_METAL);
    m.box(12, 26, 17, 13, 27, 20, '#7f8480', M_METAL);
    m.box(14, 26, 17, 16, 27, 18, '#56603b', M_METAL);
    m.box(11, 27, 17, 15, 37, 18, '#d2a62a', M_ROUGH);
    m.box(9, 28, 17, 11, 36, 18, '#d2a62a', M_ROUGH);
    m.box(15, 28, 17, 17, 36, 18, '#d2a62a', M_ROUGH);
    m.box(6, 29, 17, 7, 35, 18, '#56603b', M_METAL);
    m.box(8, 29, 17, 9, 35, 18, '#d2a62a', M_ROUGH);
    m.box(17, 29, 17, 18, 35, 18, '#d2a62a', M_ROUGH);
    m.box(19, 29, 17, 20, 35, 18, '#56603b', M_METAL);
    m.box(7, 30, 17, 8, 34, 18, '#d2a62a', M_ROUGH);
    m.box(18, 30, 17, 19, 34, 18, '#d2a62a', M_ROUGH);
    m.box(10, 37, 17, 16, 38, 18, '#56603b', M_METAL);
    m.box(58, 4, 18, 59, 5, 19, '#9aa09c', M_METAL);
    m.box(61, 4, 18, 62, 5, 19, '#9aa09c', M_METAL);
    m.box(50, 12, 18, 51, 13, 19, '#9aa09c', M_METAL);
    m.box(69, 12, 18, 70, 13, 19, '#9aa09c', M_METAL);
    m.box(50, 15, 18, 51, 16, 19, '#9aa09c', M_METAL);
    m.box(69, 15, 18, 70, 16, 19, '#9aa09c', M_METAL);
    m.box(11, 21, 18, 12, 22, 19, '#5b5d58', M_METAL);
    m.box(10, 22, 18, 11, 23, 22, '#7f8480', M_METAL);
    m.box(12, 22, 18, 14, 24, 21, '#7f8480', M_METAL);
    m.box(11, 23, 18, 12, 24, 21, '#7f8480', M_METAL);
    m.box(58, 23, 18, 59, 24, 19, '#9aa09c', M_METAL);
    m.box(61, 23, 18, 62, 24, 19, '#9aa09c', M_METAL);
    m.box(10, 24, 18, 11, 40, 19, '#5b5d58', M_METAL);
    m.box(14, 24, 18, 16, 26, 19, '#5b5d58', M_METAL);
    m.box(9, 25, 18, 10, 39, 19, '#5b5d58', M_METAL);
    m.box(12, 25, 18, 13, 26, 20, '#7f8480', M_METAL);
    m.box(16, 25, 18, 17, 39, 19, '#5b5d58', M_METAL);
    m.box(8, 26, 18, 9, 38, 19, '#5b5d58', M_METAL);
    m.box(14, 26, 18, 15, 27, 20, '#7f8480', M_METAL);
    m.box(15, 26, 18, 16, 40, 19, '#5b5d58', M_METAL);
    m.box(17, 26, 18, 18, 38, 19, '#5b5d58', M_METAL);
    m.box(7, 27, 18, 8, 37, 19, '#5b5d58', M_METAL);
    m.box(11, 27, 18, 12, 28, 20, '#7f8480', M_METAL);
    m.box(12, 27, 18, 15, 40, 19, '#5b5d58', M_METAL);
    m.box(18, 27, 18, 19, 37, 19, '#5b5d58', M_METAL);
    m.box(6, 28, 18, 7, 36, 19, '#5b5d58', M_METAL);
    m.box(11, 28, 18, 12, 40, 19, '#5b5d58', M_METAL);
    m.box(19, 28, 18, 20, 36, 19, '#5b5d58', M_METAL);
    m.box(5, 29, 18, 6, 35, 19, '#5b5d58', M_METAL);
    m.box(20, 29, 18, 21, 35, 19, '#5b5d58', M_METAL);
    m.box(8, 4, 19, 12, 14, 20, '#878275', M_ROUGH);
    m.box(56, 4, 19, 64, 24, 20, pal.main, M_MATTE);
    m.box(6, 5, 19, 8, 13, 20, '#878275', M_ROUGH);
    m.box(12, 5, 19, 14, 13, 20, '#878275', M_ROUGH);
    m.box(21, 5, 19, 27, 13, 20, '#878275', M_ROUGH);
    m.box(35, 5, 19, 39, 13, 20, '#878275', M_ROUGH);
    m.box(54, 5, 19, 56, 23, 20, pal.main, M_MATTE);
    m.box(64, 5, 19, 66, 23, 20, pal.main, M_MATTE);
    m.box(20, 6, 19, 21, 12, 20, '#878275', M_ROUGH);
    m.box(27, 6, 19, 28, 12, 20, '#878275', M_ROUGH);
    m.box(34, 6, 19, 35, 12, 20, '#878275', M_ROUGH);
    m.box(39, 6, 19, 40, 12, 20, '#878275', M_ROUGH);
    m.box(53, 6, 19, 54, 22, 20, pal.main, M_MATTE);
    m.box(66, 6, 19, 67, 22, 20, pal.main, M_MATTE);
    m.box(5, 7, 19, 6, 11, 20, '#878275', M_ROUGH);
    m.box(14, 7, 19, 15, 11, 20, '#878275', M_ROUGH);
    m.box(33, 7, 19, 34, 11, 20, '#878275', M_ROUGH);
    m.box(40, 7, 19, 41, 11, 20, '#878275', M_ROUGH);
    m.box(52, 7, 19, 53, 21, 20, pal.main, M_MATTE);
    m.box(67, 7, 19, 68, 21, 20, pal.main, M_MATTE);
    m.box(51, 8, 19, 52, 20, 20, pal.main, M_MATTE);
    m.box(68, 8, 19, 69, 20, 20, pal.main, M_MATTE);
    m.box(50, 10, 19, 51, 18, 20, pal.main, M_MATTE);
    m.box(69, 10, 19, 70, 18, 20, pal.main, M_MATTE);
    m.box(10, 18, 19, 11, 19, 21, '#5b5d58', M_METAL);
    m.box(10, 20, 19, 13, 22, 22, '#7f8480', M_METAL);
    m.box(11, 22, 19, 12, 23, 22, '#7f8480', M_METAL);
    m.box(12, 27, 19, 14, 28, 20, '#7f8480', M_METAL);
    m.box(10, 28, 19, 16, 30, 20, '#d2a62a', M_ROUGH);
    m.box(9, 29, 19, 10, 31, 20, '#d2a62a', M_ROUGH);
    m.box(16, 29, 19, 17, 35, 20, '#d2a62a', M_ROUGH);
    m.box(8, 30, 19, 9, 32, 20, '#d2a62a', M_ROUGH);
    m.box(10, 30, 19, 11, 31, 20, '#d2a62a', M_ROUGH);
    m.box(11, 30, 19, 12, 36, 20, '#9a7414', M_ROUGH);
    m.box(12, 30, 19, 16, 31, 20, '#d2a62a', M_ROUGH);
    m.box(17, 30, 19, 18, 34, 20, '#d2a62a', M_ROUGH);
    m.box(9, 31, 19, 11, 35, 20, '#9a7414', M_ROUGH);
    m.box(12, 31, 19, 14, 35, 20, '#9a7414', M_ROUGH);
    m.box(14, 31, 19, 16, 32, 20, '#d2a62a', M_ROUGH);
    m.box(8, 32, 19, 9, 34, 20, '#9a7414', M_ROUGH);
    m.box(14, 32, 19, 15, 34, 20, '#9a7414', M_ROUGH);
    m.box(15, 32, 19, 16, 36, 20, '#d2a62a', M_ROUGH);
    m.box(14, 34, 19, 15, 36, 20, '#d2a62a', M_ROUGH);
    m.box(10, 35, 19, 11, 36, 20, '#d2a62a', M_ROUGH);
    m.box(12, 35, 19, 14, 36, 20, '#d2a62a', M_ROUGH);
    m.box(59, 4, 20, 61, 24, 22, '#9aa09c', M_METAL);
    m.box(7, 5, 20, 13, 9, 24, '#8c8f8b', M_METAL);
    m.box(22, 5, 20, 26, 9, 24, '#8c8f8b', M_METAL);
    m.box(55, 5, 20, 59, 23, 21, '#9aa09c', M_METAL);
    m.box(61, 5, 20, 65, 23, 21, '#9aa09c', M_METAL);
    m.box(6, 6, 20, 7, 12, 24, '#8c8f8b', M_METAL);
    m.box(13, 6, 20, 14, 9, 24, '#8c8f8b', M_METAL);
    m.box(21, 6, 20, 22, 9, 24, '#8c8f8b', M_METAL);
    m.box(26, 6, 20, 27, 9, 24, '#8c8f8b', M_METAL);
    m.box(35, 6, 20, 39, 9, 24, '#8c8f8b', M_METAL);
    m.box(54, 6, 20, 55, 22, 22, '#9aa09c', M_METAL);
    m.box(65, 6, 20, 66, 22, 22, '#9aa09c', M_METAL);
    m.box(20, 7, 20, 21, 9, 24, '#8c8f8b', M_METAL);
    m.box(27, 7, 20, 28, 9, 24, '#8c8f8b', M_METAL);
    m.box(34, 7, 20, 35, 9, 24, '#8c8f8b', M_METAL);
    m.box(39, 7, 20, 40, 11, 24, '#8c8f8b', M_METAL);
    m.box(53, 7, 20, 54, 21, 23, '#9aa09c', M_METAL);
    m.box(66, 7, 20, 67, 21, 23, '#9aa09c', M_METAL);
    m.box(52, 8, 20, 53, 20, 22, '#9aa09c', M_METAL);
    m.box(67, 8, 20, 68, 20, 22, '#9aa09c', M_METAL);
    m.box(7, 9, 20, 10, 13, 24, '#8c8f8b', M_METAL);
    m.box(10, 9, 20, 37, 11, 22, '#7f8480', M_METAL);
    m.box(37, 9, 20, 39, 12, 24, '#8c8f8b', M_METAL);
    m.box(51, 9, 20, 52, 19, 21, '#9aa09c', M_METAL);
    m.box(68, 9, 20, 69, 19, 21, '#9aa09c', M_METAL);
    m.box(10, 11, 20, 14, 12, 24, '#8c8f8b', M_METAL);
    m.box(21, 11, 20, 27, 12, 24, '#8c8f8b', M_METAL);
    m.box(35, 11, 20, 37, 12, 24, '#8c8f8b', M_METAL);
    m.box(10, 12, 20, 13, 13, 24, '#8c8f8b', M_METAL);
    m.box(22, 12, 20, 26, 13, 24, '#8c8f8b', M_METAL);
    m.box(50, 13, 20, 51, 15, 22, '#9aa09c', M_METAL);
    m.box(69, 13, 20, 70, 15, 22, '#9aa09c', M_METAL);
    m.box(9, 18, 20, 10, 19, 24, '#7f8480', M_METAL);
    m.box(11, 18, 20, 13, 20, 23, '#7f8480', M_METAL);
    m.box(11, 25, 20, 12, 26, 21, '#7f8480', M_METAL);
    m.box(11, 31, 20, 12, 35, 21, '#9a7414', M_ROUGH);
    m.box(9, 32, 20, 11, 34, 21, '#9a7414', M_ROUGH);
    m.box(12, 32, 20, 14, 34, 21, '#9a7414', M_ROUGH);
    m.box(56, 5, 21, 59, 23, 23, '#9aa09c', M_METAL);
    m.box(61, 5, 21, 64, 23, 23, '#9aa09c', M_METAL);
    m.box(55, 6, 21, 56, 22, 23, '#9aa09c', M_METAL);
    m.box(64, 6, 21, 65, 22, 23, '#9aa09c', M_METAL);
    m.box(51, 10, 21, 52, 18, 23, '#9aa09c', M_METAL);
    m.box(68, 10, 21, 69, 18, 23, '#9aa09c', M_METAL);
    m.box(11, 15, 21, 12, 18, 24, '#7f8480', M_METAL);
    m.box(9, 16, 21, 11, 18, 24, '#7f8480', M_METAL);
    m.box(10, 18, 21, 11, 20, 23, '#7f8480', M_METAL);
    m.box(12, 22, 21, 14, 23, 22, '#7f8480', M_METAL);
    m.box(59, 5, 22, 61, 23, 24, '#9aa09c', M_METAL);
    m.box(54, 7, 22, 55, 21, 24, '#9aa09c', M_METAL);
    m.box(65, 7, 22, 66, 21, 24, '#9aa09c', M_METAL);
    m.box(10, 9, 22, 14, 11, 24, '#8c8f8b', M_METAL);
    m.box(20, 9, 22, 28, 11, 24, '#8c8f8b', M_METAL);
    m.box(34, 9, 22, 37, 11, 24, '#8c8f8b', M_METAL);
    m.box(52, 9, 22, 53, 19, 23, '#9aa09c', M_METAL);
    m.box(67, 9, 22, 68, 19, 23, '#9aa09c', M_METAL);
    m.box(9, 13, 22, 12, 14, 23, '#7f8480', M_METAL);
    m.box(8, 14, 22, 9, 15, 24, '#7f8480', M_METAL);
    m.box(11, 14, 22, 12, 15, 24, '#7f8480', M_METAL);
    m.box(9, 15, 22, 11, 16, 24, '#7f8480', M_METAL);
    m.box(10, 20, 22, 13, 21, 23, '#7f8480', M_METAL);
    m.box(56, 6, 23, 59, 22, 24, '#9aa09c', M_METAL);
    m.box(61, 6, 23, 64, 22, 24, '#9aa09c', M_METAL);
    m.box(55, 7, 23, 56, 21, 25, '#9aa09c', M_METAL);
    m.box(64, 7, 23, 65, 21, 25, '#9aa09c', M_METAL);
    m.box(53, 8, 23, 54, 20, 24, '#9aa09c', M_METAL);
    m.box(66, 8, 23, 67, 20, 24, '#9aa09c', M_METAL);
    m.box(52, 10, 23, 53, 18, 24, '#9aa09c', M_METAL);
    m.box(67, 10, 23, 68, 18, 24, '#9aa09c', M_METAL);
    m.box(11, 13, 23, 12, 14, 24, '#7f8480', M_METAL);
    m.box(51, 13, 23, 52, 15, 24, '#9aa09c', M_METAL);
    m.box(68, 13, 23, 69, 15, 24, '#9aa09c', M_METAL);
    m.box(10, 18, 23, 13, 19, 24, '#7f8480', M_METAL);
    m.box(8, 2, 24, 12, 14, 25, '#5b5d58', M_METAL);
    m.box(6, 3, 24, 8, 15, 25, '#5b5d58', M_METAL);
    m.box(12, 3, 24, 14, 15, 25, '#5b5d58', M_METAL);
    m.box(21, 3, 24, 27, 13, 25, '#5b5d58', M_METAL);
    m.box(5, 4, 24, 6, 14, 25, '#5b5d58', M_METAL);
    m.box(14, 4, 24, 15, 14, 25, '#5b5d58', M_METAL);
    m.box(20, 4, 24, 21, 14, 25, '#5b5d58', M_METAL);
    m.box(27, 4, 24, 28, 14, 25, '#5b5d58', M_METAL);
    m.box(4, 5, 24, 5, 13, 25, '#5b5d58', M_METAL);
    m.box(15, 5, 24, 16, 13, 25, '#5b5d58', M_METAL);
    m.box(19, 5, 24, 20, 13, 25, '#5b5d58', M_METAL);
    m.box(28, 5, 24, 29, 13, 25, '#5b5d58', M_METAL);
    m.box(35, 5, 24, 39, 13, 27, pal.main, M_MATTE);
    m.box(18, 6, 24, 19, 12, 25, '#5b5d58', M_METAL);
    m.box(29, 6, 24, 30, 12, 25, '#5b5d58', M_METAL);
    m.box(34, 6, 24, 35, 12, 27, pal.main, M_MATTE);
    m.box(39, 6, 24, 40, 12, 27, pal.main, M_MATTE);
    m.box(57, 6, 24, 63, 22, 25, '#9aa09c', M_METAL);
    m.box(3, 7, 24, 4, 11, 25, '#5b5d58', M_METAL);
    m.box(16, 7, 24, 17, 11, 25, '#5b5d58', M_METAL);
    m.box(33, 7, 24, 34, 11, 27, pal.main, M_MATTE);
    m.box(40, 7, 24, 41, 11, 27, pal.main, M_MATTE);
    m.box(56, 7, 24, 57, 21, 25, '#9aa09c', M_METAL);
    m.box(63, 7, 24, 64, 21, 25, '#9aa09c', M_METAL);
    m.box(54, 8, 24, 55, 20, 25, '#9aa09c', M_METAL);
    m.box(65, 8, 24, 66, 20, 25, '#9aa09c', M_METAL);
    m.box(53, 9, 24, 54, 19, 25, '#9aa09c', M_METAL);
    m.box(66, 9, 24, 67, 19, 25, '#9aa09c', M_METAL);
    m.box(52, 11, 24, 53, 17, 25, '#9aa09c', M_METAL);
    m.box(67, 11, 24, 68, 17, 25, '#9aa09c', M_METAL);
    m.box(21, 13, 24, 23, 15, 25, '#5b5d58', M_METAL);
    m.box(25, 13, 24, 27, 15, 25, '#5b5d58', M_METAL);
    m.box(8, 14, 24, 9, 16, 25, '#5b5d58', M_METAL);
    m.box(11, 14, 24, 12, 16, 25, '#5b5d58', M_METAL);
    m.box(23, 14, 24, 25, 15, 25, '#5b5d58', M_METAL);
    m.box(9, 15, 24, 11, 16, 25, '#5b5d58', M_METAL);
    m.box(9, 16, 24, 12, 17, 25, '#7f8480', M_METAL);
    m.box(7, 5, 25, 13, 13, 26, '#8c8f8b', M_METAL);
    m.box(22, 5, 25, 26, 13, 26, '#8c8f8b', M_METAL);
    m.box(6, 6, 25, 7, 12, 26, '#8c8f8b', M_METAL);
    m.box(13, 6, 25, 14, 12, 26, '#8c8f8b', M_METAL);
    m.box(21, 6, 25, 22, 12, 26, '#8c8f8b', M_METAL);
    m.box(26, 6, 25, 27, 12, 26, '#8c8f8b', M_METAL);
    m.box(20, 7, 25, 21, 11, 26, '#8c8f8b', M_METAL);
    m.box(27, 7, 25, 28, 11, 26, '#8c8f8b', M_METAL);
    m.box(57, 7, 25, 63, 21, 26, '#9aa09c', M_METAL);
    m.box(55, 8, 25, 57, 20, 26, '#9aa09c', M_METAL);
    m.box(63, 8, 25, 65, 20, 26, '#9aa09c', M_METAL);
    m.box(54, 9, 25, 55, 19, 26, '#9aa09c', M_METAL);
    m.box(65, 9, 25, 66, 19, 26, '#9aa09c', M_METAL);
    m.box(53, 11, 25, 54, 17, 26, '#9aa09c', M_METAL);
    m.box(66, 11, 25, 67, 17, 26, '#9aa09c', M_METAL);
    m.box(36, 3, 26, 38, 5, 27, '#5b5d58', M_METAL);
    m.box(8, 4, 26, 12, 14, 27, '#878275', M_ROUGH);
    m.box(34, 4, 26, 36, 5, 27, '#5b5d58', M_METAL);
    m.box(38, 4, 26, 40, 5, 27, '#5b5d58', M_METAL);
    m.box(6, 5, 26, 8, 13, 27, '#878275', M_ROUGH);
    m.box(12, 5, 26, 14, 13, 27, '#878275', M_ROUGH);
    m.box(21, 5, 26, 27, 13, 27, '#878275', M_ROUGH);
    m.box(33, 5, 26, 35, 6, 27, '#5b5d58', M_METAL);
    m.box(39, 5, 26, 41, 6, 27, '#5b5d58', M_METAL);
    m.box(20, 6, 26, 21, 12, 27, '#878275', M_ROUGH);
    m.box(27, 6, 26, 28, 12, 27, '#878275', M_ROUGH);
    m.box(32, 6, 26, 34, 7, 27, '#5b5d58', M_METAL);
    m.box(40, 6, 26, 42, 7, 27, '#5b5d58', M_METAL);
    m.box(5, 7, 26, 6, 11, 27, '#878275', M_ROUGH);
    m.box(14, 7, 26, 15, 11, 27, '#878275', M_ROUGH);
    m.box(32, 7, 26, 33, 12, 27, '#5b5d58', M_METAL);
    m.box(41, 7, 26, 42, 12, 27, '#5b5d58', M_METAL);
    m.box(31, 8, 26, 32, 10, 27, '#5b5d58', M_METAL);
    m.box(42, 8, 26, 43, 10, 27, '#5b5d58', M_METAL);
    m.box(57, 8, 26, 63, 20, 27, '#9aa09c', M_METAL);
    m.box(55, 9, 26, 57, 19, 27, '#9aa09c', M_METAL);
    m.box(63, 9, 26, 65, 19, 27, '#9aa09c', M_METAL);
    m.box(33, 11, 26, 34, 13, 27, '#5b5d58', M_METAL);
    m.box(40, 11, 26, 41, 13, 27, '#5b5d58', M_METAL);
    m.box(54, 11, 26, 55, 17, 27, '#9aa09c', M_METAL);
    m.box(65, 11, 26, 66, 17, 27, '#9aa09c', M_METAL);
    m.box(34, 12, 26, 35, 14, 27, '#5b5d58', M_METAL);
    m.box(39, 12, 26, 40, 14, 27, '#5b5d58', M_METAL);
    m.box(35, 13, 26, 36, 14, 27, '#5b5d58', M_METAL);
    m.box(38, 13, 26, 39, 14, 27, '#5b5d58', M_METAL);
    m.box(36, 14, 26, 38, 15, 27, '#5b5d58', M_METAL);
    m.box(46, 24, 26, 50, 30, 28, pal.main, M_MATTE);
    m.box(45, 25, 26, 46, 29, 28, pal.main, M_MATTE);
    m.box(50, 25, 26, 51, 29, 28, pal.main, M_MATTE);
    m.box(7, 5, 27, 13, 13, 28, '#8c8f8b', M_METAL);
    m.box(22, 5, 27, 26, 13, 28, '#8c8f8b', M_METAL);
    m.box(6, 6, 27, 7, 12, 33, '#8c8f8b', M_METAL);
    m.box(13, 6, 27, 14, 12, 28, '#8c8f8b', M_METAL);
    m.box(21, 6, 27, 22, 12, 28, '#8c8f8b', M_METAL);
    m.box(26, 6, 27, 27, 12, 28, '#8c8f8b', M_METAL);
    m.box(35, 6, 27, 39, 12, 28, '#8c8f8b', M_METAL);
    m.box(20, 7, 27, 21, 11, 28, '#8c8f8b', M_METAL);
    m.box(27, 7, 27, 28, 11, 28, '#8c8f8b', M_METAL);
    m.box(34, 7, 27, 35, 11, 28, '#8c8f8b', M_METAL);
    m.box(39, 7, 27, 40, 11, 31, '#8c8f8b', M_METAL);
    m.box(58, 9, 27, 62, 19, 28, '#9aa09c', M_METAL);
    m.box(56, 10, 27, 58, 18, 28, '#9aa09c', M_METAL);
    m.box(62, 10, 27, 64, 18, 28, '#9aa09c', M_METAL);
    m.box(55, 12, 27, 56, 16, 28, '#9aa09c', M_METAL);
    m.box(64, 12, 27, 65, 16, 28, '#9aa09c', M_METAL);
    m.box(7, 5, 28, 13, 8, 33, '#8c8f8b', M_METAL);
    m.box(22, 5, 28, 26, 8, 31, '#8c8f8b', M_METAL);
    m.box(13, 6, 28, 14, 8, 33, '#8c8f8b', M_METAL);
    m.box(21, 6, 28, 22, 8, 31, '#8c8f8b', M_METAL);
    m.box(26, 6, 28, 27, 8, 31, '#8c8f8b', M_METAL);
    m.box(35, 6, 28, 39, 8, 31, '#8c8f8b', M_METAL);
    m.box(20, 7, 28, 21, 8, 31, '#8c8f8b', M_METAL);
    m.box(27, 7, 28, 28, 8, 31, '#8c8f8b', M_METAL);
    m.box(34, 7, 28, 35, 8, 32, '#8c8f8b', M_METAL);
    m.box(7, 8, 28, 10, 13, 33, '#8c8f8b', M_METAL);
    m.box(10, 8, 28, 37, 10, 30, '#7f8480', M_METAL);
    m.box(37, 8, 28, 39, 12, 30, '#8c8f8b', M_METAL);
    m.box(10, 10, 28, 14, 12, 33, '#8c8f8b', M_METAL);
    m.box(20, 10, 28, 28, 11, 31, '#8c8f8b', M_METAL);
    m.box(34, 10, 28, 37, 11, 31, '#8c8f8b', M_METAL);
    m.box(21, 11, 28, 27, 12, 31, '#8c8f8b', M_METAL);
    m.box(35, 11, 28, 37, 12, 31, '#8c8f8b', M_METAL);
    m.box(58, 11, 28, 62, 13, 29, '#9aa09c', M_METAL);
    m.box(10, 12, 28, 13, 13, 33, '#8c8f8b', M_METAL);
    m.box(22, 12, 28, 26, 13, 31, '#8c8f8b', M_METAL);
    m.box(57, 12, 28, 58, 16, 29, '#9aa09c', M_METAL);
    m.box(62, 12, 28, 63, 16, 29, '#9aa09c', M_METAL);
    m.box(58, 13, 28, 59, 17, 29, '#9aa09c', M_METAL);
    m.box(59, 13, 28, 61, 15, 32, '#7f8480', M_METAL);
    m.box(61, 13, 28, 62, 17, 29, '#9aa09c', M_METAL);
    m.box(59, 15, 28, 61, 17, 29, '#9aa09c', M_METAL);
    m.box(46, 24, 28, 50, 30, 30, '#4a4743', M_ROUGH);
    m.box(45, 25, 28, 46, 29, 30, '#4a4743', M_ROUGH);
    m.box(50, 25, 28, 51, 29, 30, '#4a4743', M_ROUGH);
    m.box(10, 8, 30, 14, 10, 33, '#8c8f8b', M_METAL);
    m.box(20, 8, 30, 28, 10, 31, '#8c8f8b', M_METAL);
    m.box(34, 8, 30, 36, 10, 31, '#8c8f8b', M_METAL);
    m.box(36, 8, 30, 38, 10, 36, '#7f8480', M_METAL);
    m.box(38, 8, 30, 39, 12, 31, '#8c8f8b', M_METAL);
    m.box(37, 10, 30, 38, 12, 31, '#8c8f8b', M_METAL);
    m.box(46, 24, 30, 50, 30, 32, pal.main, M_MATTE);
    m.box(45, 25, 30, 46, 29, 32, pal.main, M_MATTE);
    m.box(50, 25, 30, 51, 29, 32, pal.main, M_MATTE);
    m.box(23, 4, 31, 25, 13, 34, pal.main, M_MATTE);
    m.box(21, 5, 31, 23, 13, 34, pal.main, M_MATTE);
    m.box(25, 5, 31, 27, 13, 34, pal.main, M_MATTE);
    m.box(20, 6, 31, 21, 12, 34, pal.main, M_MATTE);
    m.box(27, 6, 31, 28, 12, 34, pal.main, M_MATTE);
    m.box(35, 6, 31, 36, 7, 32, '#8c8f8b', M_METAL);
    m.box(36, 6, 31, 38, 8, 35, '#7f8480', M_METAL);
    m.box(38, 6, 31, 39, 7, 32, '#8c8f8b', M_METAL);
    m.box(35, 7, 31, 36, 11, 35, '#7f8480', M_METAL);
    m.box(38, 7, 31, 39, 11, 35, '#7f8480', M_METAL);
    m.box(39, 7, 31, 40, 8, 32, '#8c8f8b', M_METAL);
    m.box(19, 8, 31, 20, 10, 34, pal.main, M_MATTE);
    m.box(28, 8, 31, 29, 10, 34, pal.main, M_MATTE);
    m.box(34, 8, 31, 35, 10, 35, '#7f8480', M_METAL);
    m.box(39, 8, 31, 40, 10, 35, '#7f8480', M_METAL);
    m.box(34, 10, 31, 35, 11, 32, '#8c8f8b', M_METAL);
    m.box(36, 10, 31, 38, 12, 35, '#7f8480', M_METAL);
    m.box(39, 10, 31, 40, 11, 32, '#8c8f8b', M_METAL);
    m.box(35, 11, 31, 36, 12, 32, '#8c8f8b', M_METAL);
    m.box(38, 11, 31, 39, 12, 32, '#8c8f8b', M_METAL);
    m.box(21, 3, 32, 27, 4, 33, '#5b5d58', M_METAL);
    m.box(20, 4, 32, 23, 5, 33, '#5b5d58', M_METAL);
    m.box(25, 4, 32, 28, 5, 33, '#5b5d58', M_METAL);
    m.box(19, 5, 32, 21, 6, 33, '#5b5d58', M_METAL);
    m.box(27, 5, 32, 29, 6, 33, '#5b5d58', M_METAL);
    m.box(18, 6, 32, 20, 8, 33, '#5b5d58', M_METAL);
    m.box(28, 6, 32, 30, 8, 33, '#5b5d58', M_METAL);
    m.box(35, 6, 32, 36, 7, 34, '#7f8480', M_METAL);
    m.box(38, 6, 32, 39, 7, 34, '#7f8480', M_METAL);
    m.box(34, 7, 32, 35, 8, 34, '#7f8480', M_METAL);
    m.box(39, 7, 32, 40, 8, 34, '#7f8480', M_METAL);
    m.box(18, 8, 32, 19, 12, 33, '#5b5d58', M_METAL);
    m.box(29, 8, 32, 30, 12, 33, '#5b5d58', M_METAL);
    m.box(19, 10, 32, 20, 13, 33, '#5b5d58', M_METAL);
    m.box(28, 10, 32, 29, 13, 33, '#5b5d58', M_METAL);
    m.box(34, 10, 32, 35, 11, 34, '#7f8480', M_METAL);
    m.box(39, 10, 32, 40, 11, 34, '#7f8480', M_METAL);
    m.box(35, 11, 32, 36, 12, 34, '#7f8480', M_METAL);
    m.box(38, 11, 32, 39, 12, 34, '#7f8480', M_METAL);
    m.box(20, 12, 32, 21, 14, 33, '#5b5d58', M_METAL);
    m.box(27, 12, 32, 28, 14, 33, '#5b5d58', M_METAL);
    m.box(21, 13, 32, 23, 15, 33, '#5b5d58', M_METAL);
    m.box(25, 13, 32, 27, 15, 33, '#5b5d58', M_METAL);
    m.box(23, 14, 32, 25, 15, 33, '#5b5d58', M_METAL);
    m.box(46, 24, 32, 50, 30, 34, '#4a4743', M_ROUGH);
    m.box(45, 25, 32, 46, 29, 34, '#4a4743', M_ROUGH);
    m.box(50, 25, 32, 51, 29, 34, '#4a4743', M_ROUGH);
    m.box(8, 4, 33, 12, 14, 34, '#878275', M_ROUGH);
    m.box(6, 5, 33, 8, 13, 34, '#878275', M_ROUGH);
    m.box(12, 5, 33, 14, 13, 34, '#878275', M_ROUGH);
    m.box(5, 7, 33, 6, 11, 34, '#878275', M_ROUGH);
    m.box(14, 7, 33, 15, 11, 34, '#878275', M_ROUGH);
    m.box(7, 5, 34, 13, 13, 36, '#8c8f8b', M_METAL);
    m.box(22, 5, 34, 26, 13, 37, '#8c8f8b', M_METAL);
    m.box(6, 6, 34, 7, 12, 36, '#8c8f8b', M_METAL);
    m.box(13, 6, 34, 14, 12, 36, '#8c8f8b', M_METAL);
    m.box(21, 6, 34, 22, 12, 38, '#8c8f8b', M_METAL);
    m.box(26, 6, 34, 27, 12, 38, '#8c8f8b', M_METAL);
    m.box(20, 7, 34, 21, 11, 39, '#8c8f8b', M_METAL);
    m.box(27, 7, 34, 28, 11, 39, '#8c8f8b', M_METAL);
    m.box(46, 24, 34, 50, 30, 36, pal.main, M_MATTE);
    m.box(45, 25, 34, 46, 29, 36, pal.main, M_MATTE);
    m.box(50, 25, 34, 51, 29, 36, pal.main, M_MATTE);
    m.box(8, 2, 36, 12, 14, 37, '#5b5d58', M_METAL);
    m.box(6, 3, 36, 8, 15, 37, '#5b5d58', M_METAL);
    m.box(12, 3, 36, 14, 15, 37, '#5b5d58', M_METAL);
    m.box(5, 4, 36, 6, 14, 37, '#5b5d58', M_METAL);
    m.box(14, 4, 36, 15, 14, 37, '#5b5d58', M_METAL);
    m.box(4, 5, 36, 5, 13, 37, '#5b5d58', M_METAL);
    m.box(15, 5, 36, 16, 13, 37, '#5b5d58', M_METAL);
    m.box(3, 7, 36, 4, 11, 37, '#5b5d58', M_METAL);
    m.box(16, 7, 36, 17, 11, 37, '#5b5d58', M_METAL);
    m.box(8, 14, 36, 9, 16, 37, '#5b5d58', M_METAL);
    m.box(11, 14, 36, 12, 16, 37, '#5b5d58', M_METAL);
    m.box(9, 15, 36, 11, 16, 37, '#5b5d58', M_METAL);
    m.box(46, 24, 36, 50, 30, 38, '#4a4743', M_ROUGH);
    m.box(45, 25, 36, 46, 29, 38, '#4a4743', M_ROUGH);
    m.box(50, 25, 36, 51, 29, 38, '#4a4743', M_ROUGH);
    m.box(7, 4, 37, 13, 14, 40, pal.main, M_MATTE);
    m.box(6, 5, 37, 7, 13, 40, pal.main, M_MATTE);
    m.box(13, 5, 37, 14, 13, 40, pal.main, M_MATTE);
    m.box(22, 5, 37, 26, 7, 38, '#8c8f8b', M_METAL);
    m.box(5, 6, 37, 6, 12, 40, pal.main, M_MATTE);
    m.box(14, 6, 37, 15, 12, 40, pal.main, M_MATTE);
    m.box(22, 7, 37, 26, 11, 43, '#7f8480', M_METAL);
    m.box(22, 11, 37, 26, 13, 38, '#8c8f8b', M_METAL);
    m.box(22, 5, 38, 26, 6, 39, '#8c8f8b', M_METAL);
    m.box(21, 6, 38, 22, 7, 39, '#8c8f8b', M_METAL);
    m.box(22, 6, 38, 26, 7, 42, '#7f8480', M_METAL);
    m.box(26, 6, 38, 27, 7, 39, '#8c8f8b', M_METAL);
    m.box(21, 7, 38, 22, 11, 42, '#7f8480', M_METAL);
    m.box(26, 7, 38, 27, 11, 42, '#7f8480', M_METAL);
    m.box(21, 11, 38, 22, 12, 39, '#8c8f8b', M_METAL);
    m.box(22, 11, 38, 26, 12, 42, '#7f8480', M_METAL);
    m.box(26, 11, 38, 27, 12, 39, '#8c8f8b', M_METAL);
    m.box(22, 12, 38, 26, 13, 39, '#8c8f8b', M_METAL);
    m.box(46, 24, 38, 50, 30, 39, '#1c1c1a', M_METAL);
    m.box(45, 25, 38, 46, 29, 39, '#1c1c1a', M_METAL);
    m.box(50, 25, 38, 51, 29, 39, '#1c1c1a', M_METAL);
    m.box(22, 5, 39, 26, 6, 41, '#7f8480', M_METAL);
    m.box(21, 6, 39, 22, 7, 41, '#7f8480', M_METAL);
    m.box(26, 6, 39, 27, 7, 41, '#7f8480', M_METAL);
    m.box(20, 7, 39, 21, 11, 41, '#7f8480', M_METAL);
    m.box(27, 7, 39, 28, 11, 41, '#7f8480', M_METAL);
    m.box(21, 11, 39, 22, 12, 41, '#7f8480', M_METAL);
    m.box(26, 11, 39, 27, 12, 41, '#7f8480', M_METAL);
    m.box(22, 12, 39, 26, 13, 41, '#7f8480', M_METAL);
    m.box(8, 4, 40, 12, 14, 41, '#878275', M_ROUGH);
    m.box(6, 5, 40, 8, 13, 41, '#878275', M_ROUGH);
    m.box(12, 5, 40, 14, 13, 41, '#878275', M_ROUGH);
    m.box(5, 7, 40, 6, 11, 41, '#878275', M_ROUGH);
    m.box(14, 7, 40, 15, 11, 41, '#878275', M_ROUGH);
    m.box(7, 5, 41, 13, 13, 42, '#8c8f8b', M_METAL);
    m.box(6, 6, 41, 7, 12, 44, '#8c8f8b', M_METAL);
    m.box(13, 6, 41, 14, 12, 44, '#8c8f8b', M_METAL);
    m.box(7, 5, 42, 13, 8, 43, '#8c8f8b', M_METAL);
    m.box(7, 8, 42, 9, 13, 43, '#8c8f8b', M_METAL);
    m.box(9, 8, 42, 11, 10, 50, '#7f8480', M_METAL);
    m.box(11, 8, 42, 13, 13, 43, '#8c8f8b', M_METAL);
    m.box(9, 10, 42, 11, 13, 43, '#8c8f8b', M_METAL);
    m.box(7, 5, 43, 13, 6, 44, '#8c8f8b', M_METAL);
    m.box(7, 6, 43, 8, 7, 44, '#8c8f8b', M_METAL);
    m.box(8, 6, 43, 12, 8, 49, '#7f8480', M_METAL);
    m.box(12, 6, 43, 13, 7, 44, '#8c8f8b', M_METAL);
    m.box(7, 7, 43, 8, 11, 49, '#7f8480', M_METAL);
    m.box(12, 7, 43, 13, 11, 49, '#7f8480', M_METAL);
    m.box(8, 8, 43, 9, 12, 49, '#7f8480', M_METAL);
    m.box(11, 8, 43, 12, 12, 49, '#7f8480', M_METAL);
    m.box(9, 10, 43, 11, 12, 49, '#7f8480', M_METAL);
    m.box(7, 11, 43, 8, 13, 44, '#8c8f8b', M_METAL);
    m.box(12, 11, 43, 13, 13, 44, '#8c8f8b', M_METAL);
    m.box(8, 12, 43, 12, 13, 44, '#8c8f8b', M_METAL);
    m.box(7, 5, 44, 8, 6, 45, '#8c8f8b', M_METAL);
    m.box(8, 5, 44, 12, 6, 48, '#7f8480', M_METAL);
    m.box(12, 5, 44, 13, 6, 45, '#8c8f8b', M_METAL);
    m.box(6, 6, 44, 7, 7, 45, '#8c8f8b', M_METAL);
    m.box(7, 6, 44, 8, 7, 48, '#7f8480', M_METAL);
    m.box(12, 6, 44, 13, 7, 48, '#7f8480', M_METAL);
    m.box(13, 6, 44, 14, 7, 45, '#8c8f8b', M_METAL);
    m.box(6, 7, 44, 7, 11, 48, '#7f8480', M_METAL);
    m.box(13, 7, 44, 14, 11, 48, '#7f8480', M_METAL);
    m.box(6, 11, 44, 7, 12, 45, '#8c8f8b', M_METAL);
    m.box(7, 11, 44, 8, 12, 48, '#7f8480', M_METAL);
    m.box(12, 11, 44, 13, 12, 48, '#7f8480', M_METAL);
    m.box(13, 11, 44, 14, 12, 45, '#8c8f8b', M_METAL);
    m.box(7, 12, 44, 8, 13, 45, '#8c8f8b', M_METAL);
    m.box(8, 12, 44, 12, 13, 48, '#7f8480', M_METAL);
    m.box(12, 12, 44, 13, 13, 45, '#8c8f8b', M_METAL);
    m.box(7, 5, 45, 8, 6, 47, '#7f8480', M_METAL);
    m.box(12, 5, 45, 13, 6, 47, '#7f8480', M_METAL);
    m.box(6, 6, 45, 7, 7, 47, '#7f8480', M_METAL);
    m.box(13, 6, 45, 14, 7, 47, '#7f8480', M_METAL);
    m.box(6, 11, 45, 7, 12, 47, '#7f8480', M_METAL);
    m.box(13, 11, 45, 14, 12, 47, '#7f8480', M_METAL);
    m.box(7, 12, 45, 8, 13, 47, '#7f8480', M_METAL);
    m.box(12, 12, 45, 13, 13, 47, '#7f8480', M_METAL);
    m.box(3, 20, 47, 5, 24, 50, '#3a3a36', M_METAL);
    m.box(2, 21, 47, 3, 23, 51, '#3a3a36', M_METAL);
    m.box(5, 21, 47, 6, 23, 51, '#3a3a36', M_METAL);
    m.box(3, 20, 50, 5, 21, 51, '#3a3a36', M_METAL);
    m.box(3, 21, 50, 5, 23, 54, '#ff8a2a', M_GLOW);
    m.box(3, 23, 50, 5, 24, 51, '#3a3a36', M_METAL);
    m.box(3, 20, 51, 5, 21, 56, '#ff8a2a', M_GLOW);
    m.box(2, 21, 51, 3, 23, 56, '#ff8a2a', M_GLOW);
    m.box(5, 21, 51, 6, 23, 56, '#ff8a2a', M_GLOW);
    m.box(3, 23, 51, 5, 24, 56, '#ff8a2a', M_GLOW);
    m.box(2, 20, 53, 3, 21, 54, '#ff8a2a', M_GLOW);
    m.box(5, 20, 53, 6, 21, 54, '#ff8a2a', M_GLOW);
    m.box(2, 23, 53, 3, 24, 54, '#ff8a2a', M_GLOW);
    m.box(5, 23, 53, 6, 24, 54, '#ff8a2a', M_GLOW);
    m.box(3, 21, 54, 5, 23, 56, '#ffe08a', M_GLOW);
    starTop(m, 30, 33, 5, pal.main);
    starFront(m, 12, 44, 5, 2.6, pal.main);
    return m;
  },
  // BLENDER:refinery_soviets end
  // Radar: a concrete bunker carrying a big curved mesh antenna, and a banded lattice mast.
  dome(pal) {
    const m = new VModel(-2, -2, 50, 50, 46);
    slabV(m, 0, 0, 48, 48);
    panelBox(m, 4, 14, 1, 44, 44, 12);
    flatRoof(m, 4, 14, 44, 44, 12, pal);
    stripWin(m, 6, 26, 43, 6, 8);
    m.box(30, 43, 1, 38, 44, 9, SV.olive, M_METAL);
    m.cylZ(22, 28, 13, 18, 3, SV.steel, M_METAL);                       // pedestal
    for (let x = 6; x < 39; x++) {                                       // the antenna: a curved mesh
      const dx = x + 0.5 - 22.5, y = Math.round(25 - dx * dx / 34);
      for (let z = 18; z < 33; z++) m.set(x, y, z, (x + z) % 2 ? '#6a6f6c' : '#454a48', M_ROUGH);
      if (x % 4 === 0) m.line(x, y + 1, 18, 22, 29, 22, '#4f5452', M_METAL);
    }
    m.box(21, 17, 24, 24, 28, 26, SV.steel, M_METAL);                   // feed horn boom
    latticeV(m, 38, 16, 13, 42, SV.steel);
    m.paint(37, 15, 13, 42, 20, 42, (x, y, z) => (Math.floor(z / 4) % 2 ? pal.main : C.white));
    m.set(39, 17, 43, '#ff4030', M_GLOW);
    return m;
  },
  // Outpost: the unpacked shelter, a concrete blockhouse with a star on the roof, a radio mast and the flag.
  outpost(pal) {
    const m = new VModel(-2, -2, 50, 50, 30);
    slabV(m, 0, 0, 48, 48);
    sandbagsV(m, 2, 2, 46, 46, 3);
    panelBox(m, 10, 14, 1, 34, 34, 11);
    flatRoof(m, 10, 14, 34, 34, 11, pal);
    starTop(m, 22, 24, 7, pal.main);
    m.box(18, 33, 2, 24, 34, 9, SV.oliveD);
    latticeV(m, 13, 16, 12, 27, SV.steel);
    m.line(38, 10, 1, 38, 10, 24, C.steel, M_METAL);
    m.box(38, 10, 18, 46, 11, 24, pal.main);
    m.set(40, 10, 22, C.yellow);
    for (const [x, y] of [[40, 34], [6, 38]]) m.box(x, y, 1, x + 4, y + 3, 4, SV.olive, M_METAL);
    return m;
  },
  // Barracks: a two-storey concrete block with strip windows, a star on the roof, banners and sandbags.
  barracks(pal) {
    const m = new VModel(-2, -2, 54, 50, 34);
    slabV(m, 0, 0, 48, 48);
    panelBox(m, 4, 6, 1, 44, 44, 17);
    flatRoof(m, 4, 6, 44, 44, 17, pal);
    stripWin(m, 5, 18, 43, 11, 13); stripWin(m, 30, 43, 43, 11, 13);
    starTop(m, 24, 25, 12, pal.main);
    m.box(19, 43, 1, 29, 44, 9, '#2a2420');
    m.box(18, 43, 9, 30, 44, 10, SV.conc, M_ROUGH);
    bannerV(m, 20, 28, 43, 16, 5, pal);
    m.line(8, 8, 18, 8, 8, 30, C.steel, M_METAL);
    m.box(8, 8, 25, 15, 9, 30, pal.main);
    for (const x of [8, 34]) sandbagsV(m, x, 45, x + 7, 48, 3);
    return m;
  },
  // War Factory: a tall concrete assembly hall, the gate under a gold star, banners and two stacks.
  factory(pal) {
    const m = new VModel(-2, -2, 74, 50, 40);
    slabV(m, 0, 0, 72, 48);
    panelBox(m, 2, 4, 1, 70, 46, 24);
    flatRoof(m, 2, 4, 70, 46, 24, pal);
    for (const x of [6, 54]) m.box(x, 10, 25, x + 12, 38, 27, SV.winL, M_GLASS);   // roof lights
    starTop(m, 36, 25, 13, pal.main);
    stripWin(m, 3, 17, 45, 12, 15); stripWin(m, 55, 69, 45, 12, 15);
    m.clear(20, 44, 1, 52, 46, 16);
    m.box(20, 45, 1, 52, 46, 16, SV.olive, M_METAL);
    m.paint(20, 45, 1, 52, 46, 16, (x, y, z) => (z % 2 ? SV.oliveD : undefined));
    hazardV(m, 17, 44, 1, 20, 47, 17); hazardV(m, 52, 44, 1, 55, 47, 17);
    starFront(m, 36, 45, 20, 3.6, C.yellow);
    m.box(24, 45, 16, 48, 46, 17, pal.main, M_MATTE);
    bannerV(m, 6, 11, 45, 22, 8, pal); bannerV(m, 61, 66, 45, 22, 8, pal);
    stackV(m, 60, 9, 25, 39, 2.6, pal); stackV(m, 66, 9, 25, 37, 2.2, pal);
    return m;
  },
  // Service Depot: an olive arched workshop with a concrete gable, a red gantry and a fuel tank.
  depot(pal) {
    const m = new VModel(-2, -2, 74, 50, 36);
    slabV(m, 0, 0, 72, 48);
    for (let x = 14; x < 58; x++) {                                      // barrel vault
      const h = Math.round(Math.sqrt(Math.max(0, 22 * 22 - (x + 0.5 - 36) ** 2)) * 0.95);
      if (h) m.box(x, 2, 1, x + 1, 40, 1 + h, SV.olive, M_METAL);
    }
    m.paint(14, 2, 1, 58, 40, 24, (x, y) => (y % 5 === 0 ? SV.oliveD : undefined));
    m.paint(14, 39, 1, 58, 40, 24, () => SV.conc);                       // concrete front gable
    m.clear(24, 38, 1, 48, 40, 15);
    m.box(24, 39, 1, 48, 40, 2, '#2c2c28', M_ROUGH);
    m.box(24, 38, 14, 48, 40, 15, '#3b3b37', M_METAL);
    hazardV(m, 21, 38, 1, 24, 41, 16); hazardV(m, 48, 38, 1, 51, 41, 16);
    starFront(m, 36, 39, 18.5, 3, pal.main);
    for (const x of [18, 54]) m.box(x, 40, 1, x + 2, 42, 28, SV.steel, M_METAL);
    m.box(18, 40, 28, 56, 43, 30, pal.main, M_METAL);
    m.box(35, 41, 22, 37, 42, 28, C.black);
    m.box(34, 40, 20, 38, 43, 22, C.steel, M_METAL);
    panelBox(m, 2, 4, 1, 12, 20, 9);
    flatRoof(m, 2, 4, 12, 20, 9, pal);
    for (const [x, y] of [[3, 24], [3, 31], [8, 27]]) m.box(x, y, 1, x + 4, y + 4, 5, SV.olive, M_METAL);
    m.cylZ(65, 12, 1, 14, 5, SV.olive, M_METAL);
    m.paint(60, 7, 8, 70, 18, 10, () => pal.main);
    panelBox(m, 62, 26, 1, 70, 40, 12);
    m.box(62, 39, 6, 70, 40, 9, SV.win, M_GLASS);
    m.set(66, 33, 12, '#ff4a30', M_GLOW);
    return m;
  },
  // Airfield: a concrete control tower with a star, and a hardened aircraft shelter with a camouflaged
  // roof, on a concrete apron.
  airfield(pal) {
    const m = new VModel(-2, -2, 98, 74, 36);
    m.box(0, 0, 0, 96, 72, 1, '#5a5a54', M_ROUGH);
    m.paintTop(0, 0, 96, 72, (x, y) => airfieldMarks(x, y, true));
    panelBox(m, 2, 2, 1, 20, 22, 18);
    m.box(3, 3, 18, 19, 21, 23, SV.win, M_GLASS);
    m.paint(3, 3, 18, 19, 21, 23, (x, y, z) => (z === 22 ? SV.winL : (x + y) % 4 === 0 ? SV.seam : undefined));
    flatRoof(m, 2, 2, 20, 22, 23, pal);
    starTop(m, 11, 12, 6, pal.main);
    starFront(m, 11, 21, 11, 3.2, pal.main);
    m.line(5, 5, 24, 5, 5, 32, C.black); m.set(5, 5, 32, '#ff4a30', M_GLOW);
    for (let y = 28; y < 68; y++) {                                       // hardened aircraft shelter
      const h = Math.round(Math.sqrt(Math.max(0, 400 - (y + 0.5 - 48) ** 2)) * 0.8);
      if (h) m.box(2, y, 1, 24, y + 1, 1 + h, SV.conc, M_ROUGH);
    }
    m.paintTop(2, 28, 24, 68, (x, y) => (hash3(x >> 1, y >> 1, 3) > 0.55 ? SV.olive : hash3(x >> 1, y >> 1, 4) > 0.6 ? SV.oliveD : undefined));
    m.paint(23, 28, 1, 24, 68, 18, () => SV.seam);
    m.box(23, 34, 1, 24, 62, 11, '#262624', M_METAL);                   // shelter doors
    m.box(23, 46, 11, 24, 50, 15, pal.main, M_MATTE);
    return m;
  },
  // Tesla Coil: the same ring-cone coil for both sides, with the Soviet colour on the ring round its base.
  tesla(pal) { return STRUCTURES_SHARED.tesla(pal); },
};
// The shared models stay for the Allies; a Soviet structure uses its own where there is one.
const STRUCTURES_SHARED = Object.assign({}, STRUCTURES);
for (const k in SOVIET) STRUCTURES[k] = (pal, faction, cameo) => (faction === 'soviets' ? SOVIET[k](pal, cameo) : STRUCTURES_SHARED[k](pal, faction, cameo));

// Rotating weapon heads on defences: [model builder, pivot x, pivot y, pivot height].
const HEADS = {
  // Gun Turret: an arrowhead. Triangular in plan with the point forward and a ridge down the middle,
  // so the armour slopes away on both sides; the barrel comes out of the tip.
  turret: [(pal) => {
    const m = new VModel(-9, -9, 18, 9, 9);
    const hwAt = (x) => 8 * (9.4 - x) / 16.4;                           // half-width: wide at the back, a point at the front
    for (let y = -9; y < 9; y++) for (let x = -7; x < 10; x++) {
      const hw = hwAt(x + 0.5), ay = Math.abs(y + 0.5);
      if (ay > hw) continue;
      const top = 3 + Math.floor((1 - ay / hw) * 4.2 + 0.2);           // ridge in the middle, low at the edges
      for (let z = 0; z < top; z++) m.set(x, y, z, hw - ay < 1.2 && z < 3 ? pal.dark : pal.main, M_METAL);
    }
    m.paint(-7, -9, 3, 10, 9, 9, (x, y, z) => (Math.abs(y + 0.5) < 0.9 && x < 6) ? pal.light : undefined);   // lit ridge
    m.box(-8, -4, 0, -6, 4, 4, pal.dark, M_METAL);                      // rear plate
    m.cylX(8, 16, 0, 2.5, 1.0, C.gun, M_METAL);                         // barrel
    m.cylX(14, 16.5, 0, 2.5, 1.5, C.gun, M_METAL);                      // muzzle brake
    m.box(7, -1, 1, 10, 1, 4, C.gun, M_METAL);                          // mantlet where the barrel leaves the tip
    return m;
  }, 12, 12, 6],
  // Twin-barrel AA gun head (tools/blender/aagun.py).
  aagun: [(pal) => {
    const m = new VModel(-6, -6, 12, 6, 12);
    m.box(-2, -3, 0, 2, 3, 2, '#34362f', M_METAL);
    m.box(-3, -2, 0, -2, 2, 2, '#34362f', M_METAL);
    m.box(2, -2, 0, 3, 2, 2, '#34362f', M_METAL);
    m.box(-3, -6, 2, 1, -4, 4, '#5a6238', M_MATTE);
    m.box(-3, -4, 2, 3, 4, 3, '#7b7e78', M_METAL);
    m.box(-4, -3, 2, -3, 3, 3, '#7b7e78', M_METAL);
    m.box(3, -3, 2, 4, 3, 3, '#7b7e78', M_METAL);
    m.box(-3, 4, 2, 1, 6, 4, '#5a6238', M_MATTE);
    m.box(-6, -3, 3, -3, 2, 6, pal.dark, M_METAL);
    m.box(-3, -3, 3, 0, -2, 4, '#34362f', M_METAL);
    m.box(0, -3, 3, 4, 3, 4, pal.main, M_METAL);
    m.box(-3, -2, 3, -1, -1, 4, '#34362f', M_METAL);
    m.box(-1, -2, 3, 0, 2, 4, pal.main, M_METAL);
    m.box(-3, -1, 3, -1, 1, 6, pal.main, M_METAL);
    m.box(4, -1, 3, 5, 1, 6, pal.main, M_METAL);
    m.box(-3, 1, 3, -1, 3, 4, '#34362f', M_METAL);
    m.box(-4, 2, 3, -3, 3, 6, pal.main, M_METAL);
    m.box(-1, 2, 3, 0, 3, 6, '#34362f', M_METAL);
    m.box(-3, -6, 4, 1, -4, 5, '#464b2b', M_MATTE);
    m.box(-3, -3, 4, -2, -1, 6, pal.main, M_METAL);
    m.box(-2, -3, 4, 1, -1, 5, '#34362f', M_METAL);
    m.box(1, -3, 4, 2, -1, 7, '#9ba1a3', M_METAL);
    m.box(2, -3, 4, 4, 3, 5, pal.main, M_METAL);
    m.box(4, -2, 4, 5, -1, 5, pal.main, M_METAL);
    m.box(-1, -1, 4, 2, 1, 6, pal.main, M_METAL);
    m.box(-3, 1, 4, -2, 3, 6, pal.main, M_METAL);
    m.box(-2, 1, 4, 1, 2, 5, '#34362f', M_METAL);
    m.box(1, 1, 4, 2, 3, 7, '#9ba1a3', M_METAL);
    m.box(4, 1, 4, 5, 2, 5, pal.main, M_METAL);
    m.box(-2, 2, 4, -1, 3, 5, '#34362f', M_METAL);
    m.box(0, 2, 4, 1, 3, 5, '#34362f', M_METAL);
    m.box(-3, 4, 4, 1, 6, 5, '#464b2b', M_MATTE);
    m.box(0, -4, 5, 2, -3, 6, '#9ba1a3', M_METAL);
    m.box(-2, -3, 5, -1, -1, 6, pal.main, M_METAL);
    m.box(-1, -3, 5, 0, -2, 6, '#34362f', M_METAL);
    m.box(0, -3, 5, 1, -1, 7, '#9ba1a3', M_METAL);
    m.box(2, -3, 5, 4, -1, 8, '#9ba1a3', M_METAL);
    m.box(-1, -2, 5, 0, -1, 6, pal.main, M_METAL);
    m.box(2, -1, 5, 4, 1, 6, pal.main, M_METAL);
    m.box(-2, 1, 5, 0, 2, 6, pal.main, M_METAL);
    m.box(0, 1, 5, 1, 4, 6, '#9ba1a3', M_METAL);
    m.box(2, 1, 5, 4, 3, 8, '#9ba1a3', M_METAL);
    m.box(-2, 2, 5, -1, 3, 6, pal.main, M_METAL);
    m.box(1, 3, 5, 2, 4, 6, '#9ba1a3', M_METAL);
    m.box(2, -4, 6, 4, -3, 7, '#9ba1a3', M_METAL);
    m.box(4, -3, 6, 5, -2, 8, '#34362f', M_METAL);
    m.box(-2, -1, 6, 0, 1, 7, '#35505f', M_GLASS);
    m.box(0, 1, 6, 1, 3, 7, '#9ba1a3', M_METAL);
    m.box(4, 2, 6, 5, 3, 8, '#34362f', M_METAL);
    m.box(2, 3, 6, 4, 4, 7, '#9ba1a3', M_METAL);
    m.box(3, -4, 7, 4, -3, 8, '#9ba1a3', M_METAL);
    m.box(5, -3, 7, 6, -1, 9, '#34362f', M_METAL);
    m.box(4, -2, 7, 5, -1, 8, '#34362f', M_METAL);
    m.box(4, 1, 7, 6, 2, 8, '#34362f', M_METAL);
    m.box(5, 2, 7, 6, 3, 9, '#34362f', M_METAL);
    m.box(3, 3, 7, 4, 4, 8, '#9ba1a3', M_METAL);
    m.box(6, -3, 8, 8, -1, 9, '#34362f', M_METAL);
    m.box(8, -3, 8, 9, -1, 11, '#25261f', M_METAL);
    m.box(5, 1, 8, 8, 2, 9, '#34362f', M_METAL);
    m.box(8, 1, 8, 9, 3, 11, '#25261f', M_METAL);
    m.box(6, 2, 8, 8, 3, 9, '#34362f', M_METAL);
    m.box(8, -4, 9, 9, -3, 10, '#25261f', M_METAL);
    m.box(6, -3, 9, 7, -2, 10, '#34362f', M_METAL);
    m.box(7, -3, 9, 8, -1, 10, '#25261f', M_METAL);
    m.box(9, -3, 9, 10, -1, 10, '#25261f', M_METAL);
    m.box(7, 1, 9, 8, 3, 10, '#25261f', M_METAL);
    m.box(9, 1, 9, 10, 3, 10, '#25261f', M_METAL);
    m.box(6, 2, 9, 7, 3, 10, '#34362f', M_METAL);
    m.box(8, 3, 9, 9, 4, 10, '#25261f', M_METAL);
    m.box(7, -3, 10, 8, -2, 11, '#25261f', M_METAL);
    m.box(7, 2, 10, 8, 3, 11, '#25261f', M_METAL);
    return m;
  }, 12, 12, 1],
  sam: [(pal) => {
    const m = new VModel(-7, -7, 12, 7, 9);
    m.box(-5, -5, 0, 5, 5, 3, C.gun, M_METAL);
    m.box(-5, -5, 2, 5, 5, 3, pal.main, M_METAL);
    for (const y of [-3.5, 2.5]) {
      for (let x = -4; x < 9; x++) m.box(x, y, 3 + (x + 4) * 0.25, x + 1, y + 1.4, 4.4 + (x + 4) * 0.25, x > 6 ? C.red : C.white, M_METAL);
    }
    return m;
  }, 24, 12, 3],
};

// One half of the SAM Site's hatch: a ribbed steel plate with a hazard edge where they meet.
function samDoor(right) {
  const m = new VModel(0, 0, 9, 17, 5);
  m.box(0, 0, 3, 9, 17, 4, '#5d5e58', M_METAL);
  m.paint(0, 0, 3, 9, 17, 4, (x, y) => y % 4 === 0 ? '#46473f' : undefined);
  const ex = right ? 0 : 8;
  m.box(ex, 0, 3, ex + 1, 17, 4, C.yellow, M_MATTE);
  m.paint(ex, 0, 3, ex + 1, 17, 4, (x, y) => (y >> 1) % 2 ? C.black : undefined);
  return m;
}

// ---------------------------------------------------------------------------
// Sprite getters used by the renderer
// ---------------------------------------------------------------------------
// A palette tinted for camouflage: `col` is the ground colour (an rgb int) the structure sits on.
const camoPals = new Map();
function camoPal(faction, col) {
  const base = palFor(faction);
  if (col === null || col === undefined) return base;
  const k = base.key + 'c' + col.toString(16);
  let p = camoPals.get(k);
  if (!p) { p = { ...base, key: k, camo: col }; camoPals.set(k, p); }
  return p;
}
function structureSprite(type, faction, camo) {
  const pal = camoPal(faction, camo);
  return sprite('S' + type + pal.key, () => STRUCTURES[type](pal, faction), 0, 0);
}
function headSprite(type, faction, angle, stage) {
  const pal = palFor(faction), h = HEADS[type], key = 'H' + type + pal.key;
  if (stage) return facingSprite(key + 'd' + stage, () => scorchModel(model(key, () => h[0](pal)), stage, type), angle, FACINGS, { shadow: false });
  return facingSprite(key, () => h[0](pal), angle, FACINGS, { shadow: false });
}

// ---------------------------------------------------------------------------
// Battle damage. Every structure gets two damaged models made from its own: stage 1 (below
// 60% health) has shell holes knocked through the roof and the south and east walls, charred
// paint and soot streaks; stage 2 (below 30%) has bigger holes, a corner caved in, glowing
// embers inside, its lights out and rubble on the foundation. The holes are the same for a
// type every time (seeded by its name), and `damageSpots` gives their positions so the fires
// and smoke come out of them.
// ---------------------------------------------------------------------------
const DMG_AT = [0.6, 0.3];
function dmgStage(b) { const f = b.hp / b.maxHp; return f < DMG_AT[1] ? 2 : f < DMG_AT[0] ? 1 : 0; }
function strSeed(s) { let h = 7; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
function copyModel(m) {
  const c = Object.create(VModel.prototype);
  Object.assign(c, { x0: m.x0, y0: m.y0, w: m.w, h: m.h, d: m.d, col: new Int32Array(m.col), mat: new Uint8Array(m.mat) });
  return c;
}
function topOf(m) {
  const t = new Int16Array(m.w * m.h).fill(-1);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) for (let z = m.d - 1; z >= 0; z--) if (m.col[(z * m.h + y) * m.w + x] >= 0) { t[y * m.w + x] = z; break; }
  return t;
}
function darken(c, k) { return (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k); }
const dmgSpotCache = new Map();
// Impact points in model coordinates {x, y, z, r, s}: s is the first stage that has it.
function damageSpots(type, faction) {
  if (dmgSpotCache.has(type)) return dmgSpotCache.get(type);
  const pal = palFor(faction), m = model('S' + type + pal.key, () => STRUCTURES[type](pal, faction)), top = topOf(m), r = rng(strSeed(type));
  let maxZ = 0, n = 0;
  for (let i = 0; i < top.length; i++) if (top[i] >= 2) { maxZ = Math.max(maxZ, top[i]); n++; }
  const spots = [], R = Math.max(2, Math.min(6, Math.sqrt(n) / 7));
  const count = Math.max(3, Math.min(9, Math.round(n / 380) + 3));
  for (let tries = 0; spots.length < count && tries < 400; tries++) {
    const x = Math.floor(r() * m.w), y = Math.floor(r() * m.h), tz = top[y * m.w + x];
    if (tz < 2 || tz < maxZ * 0.3) continue;
    let sx = x, sy = y, sz = tz;
    if (r() < 0.55) {   // a wall hit: walk south (or east) to the face the camera sees
      const dx = r() < 0.35 ? 1 : 0, dy = 1 - dx;
      sz = Math.max(2, Math.round(tz * (0.35 + r() * 0.5)));
      while (sx + dx < m.w && sy + dy < m.h && m.col[(sz * m.h + sy + dy) * m.w + sx + dx] >= 0) { sx += dx; sy += dy; }
      if (m.col[(sz * m.h + sy) * m.w + sx] < 0) continue;
    }
    if (spots.some((p) => Math.hypot(p.x - sx - m.x0, p.y - sy - m.y0) < R * 2.2)) continue;
    spots.push({ x: sx + m.x0, y: sy + m.y0, z: sz, r: R * (0.7 + r() * 0.6), s: spots.length < Math.ceil(count * 0.45) ? 1 : 2 });
  }
  spots.maxZ = maxZ;
  dmgSpotCache.set(type, spots);
  return spots;
}
function damageModel(base, stage, type, faction) {
  const m = copyModel(base), top = topOf(base), spots = damageSpots(type, faction).filter((p) => p.s <= stage), r = rng(strSeed(type) + stage * 977);
  const W = m.w, H = m.h, D = m.d, CHAR = rgbInt('#1f1c19'), EMBER = [rgbInt('#ff7a1a'), rgbInt('#e8460f'), rgbInt('#ffb040')];
  const removed = [];
  const carve = (cx, cy, cz, rad, zMin) => {
    for (let z = Math.max(zMin, Math.floor(cz - rad)); z < Math.min(D, cz + rad + 1); z++) for (let y = Math.max(0, Math.floor(cy - rad)); y < Math.min(H, cy + rad + 1); y++) for (let x = Math.max(0, Math.floor(cx - rad)); x < Math.min(W, cx + rad + 1); x++) {
      const i = (z * H + y) * W + x;
      if (m.col[i] < 0) continue;
      const dd = Math.hypot(x - cx, y - cy, (z - cz) * 1.2) + (hash3(x, y, z) - 0.5) * 1.8;
      if (dd < rad) { removed.push(m.col[i]); m.col[i] = -1; }
    }
  };
  const grow = stage === 2 ? 1.35 : 1;
  for (const p of spots) carve(p.x - m.x0, p.y - m.y0, p.z, p.r * grow, 2);
  // Stage 2: one corner of the tallest part caves in.
  if (stage === 2 && spots.maxZ >= 6) {
    const cx = r() < 0.5 ? W * 0.2 : W * 0.8, cy = H * (0.25 + r() * 0.4), rad = Math.min(W, H) * 0.3, zc = spots.maxZ * 0.55;
    for (let y = Math.max(0, Math.floor(cy - rad)); y < Math.min(H, cy + rad); y++) for (let x = Math.max(0, Math.floor(cx - rad)); x < Math.min(W, cx + rad); x++) {
      const dd = Math.hypot(x - cx, y - cy) / rad, floor = Math.max(2, Math.round(zc + dd * dd * spots.maxZ * 0.6 + (hash3(x, y, 3) - 0.5) * 3));
      for (let z = floor; z < D; z++) { const i = (z * H + y) * W + x; if (m.col[i] >= 0) { removed.push(m.col[i]); m.col[i] = -1; } }
    }
  }
  // Char round each hole, darkest at the rim; embers glow in the deep ones.
  const charR = stage === 2 ? 3.5 : 2.2;
  for (const p of spots) {
    const cx = p.x - m.x0, cy = p.y - m.y0, rad = p.r * grow + charR;
    for (let z = Math.max(1, Math.floor(p.z - rad)); z < Math.min(D, p.z + rad); z++) for (let y = Math.max(0, Math.floor(cy - rad)); y < Math.min(H, cy + rad); y++) for (let x = Math.max(0, Math.floor(cx - rad)); x < Math.min(W, cx + rad); x++) {
      const i = (z * H + y) * W + x;
      if (m.col[i] < 0) continue;
      const k = (Math.hypot(x - cx, y - cy, z - p.z) - p.r * grow) / charR + (hash3(x, y, z + 11) - 0.5) * 0.6;
      if (k < 0.15) {
        const h = hash3(x, y, z);
        if (stage === 2 && h < 0.16) { m.col[i] = EMBER[(hash3(z, x, y) * 3) | 0]; m.mat[i] = M_GLOW; }
        else { m.col[i] = h < 0.45 ? CHAR : darken(m.col[i], 0.22 + h * 0.15); m.mat[i] = M_ROUGH; }
      }
      else if (k < 1) { m.col[i] = darken(m.col[i], 0.3 + 0.6 * k); if (m.mat[i] === M_GLOW || m.mat[i] === M_GLASS) m.mat[i] = M_ROUGH; }
    }
    // Soot streaked up the wall above a wall hit.
    for (let z = p.z; z < D; z++) for (let dx = -1; dx <= 1; dx++) {
      const x = Math.round(cx + dx + (z - p.z) * 0.15), y = Math.round(cy), i = (z * H + y) * W + x;
      if (x < 0 || x >= W || y < 0 || y >= H || m.col[i] < 0 || hash3(x, z, 5) < 0.3) continue;
      m.col[i] = darken(m.col[i], 0.45 + (z - p.z) / D * 0.6);
    }
  }
  // Scattered scorch over the whole building, more at stage 2; the lights go out at stage 2.
  for (let i = 0; i < m.col.length; i++) {
    if (m.col[i] < 0) continue;
    const z = (i / (W * H)) | 0, rest = i - z * W * H, y = (rest / W) | 0, x = rest - y * W;
    if (z < 1) continue;
    const n = hash3(x >> 2, y >> 2, (z >> 2) + stage * 31);
    if (n < (stage === 2 ? 0.2 : 0.1)) m.col[i] = darken(m.col[i], 0.55 + hash3(x, y, z) * 0.25);
    if (stage === 2 && m.mat[i] === M_GLOW && !EMBER.includes(m.col[i])) { m.col[i] = darken(m.col[i], 0.25); m.mat[i] = M_ROUGH; }
    if (stage === 2 && m.mat[i] === M_GLASS && hash3(x, y, z) < 0.5) m.col[i] = CHAR;
  }
  // Scorch splashes and potholes on top, which is all the damage a flat pad can show.
  for (let k = 0; k < (stage === 2 ? 6 : 3); k++) {
    const cx = 2 + r() * (W - 4), cy = 2 + r() * (H - 4), rad = 2.5 + r() * 3.5;
    for (let y = Math.max(0, Math.floor(cy - rad)); y < Math.min(H, cy + rad); y++) for (let x = Math.max(0, Math.floor(cx - rad)); x < Math.min(W, cx + rad); x++) {
      const dd = Math.hypot(x - cx, y - cy) / rad + (hash3(x, y, k) - 0.5) * 0.5, tz = top[y * W + x];
      if (dd >= 1 || tz < 0) continue;
      let z = tz; while (z > 0 && m.col[(z * H + y) * W + x] < 0) z--;
      const i = (z * H + y) * W + x;
      if (m.col[i] < 0) continue;
      if (dd < 0.3 && z >= 1 && z <= 3 && stage === 2) { m.col[i] = -1; const j = ((z - 1) * H + y) * W + x; if (m.col[j] >= 0) m.col[j] = CHAR; }
      else m.col[i] = darken(m.col[i], 0.3 + dd * 0.6);
    }
  }
  // Rubble from the holes, heaped on bare foundation near them.
  const heaps = stage === 2 ? 2 + (spots.length >> 1) : 1 + (spots.length >> 2);
  for (let h = 0; h < heaps && removed.length; h++) {
    const p = spots[h % spots.length], ang = r() * Math.PI * 2;
    const hx = Math.round(p.x - m.x0 + Math.cos(ang) * (p.r + 3)), hy = Math.round(p.y - m.y0 + 2 + Math.abs(Math.sin(ang)) * (p.r + 3));
    for (let k = 0; k < 14 + stage * 10; k++) {
      const x = hx + Math.round((r() - 0.5) * 6), y = hy + Math.round((r() - 0.5) * 4);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const tz = top[y * W + x];
      if (tz < 0 || tz > 1 || m.col[(2 * H + y) * W + x] >= 0) continue;
      const z = tz + 1 + (r() < 0.3 ? 1 : 0), c = removed[(r() * removed.length) | 0];
      for (let zz = tz + 1; zz <= z && zz < D; zz++) { const i = (zz * H + y) * W + x; m.col[i] = r() < 0.3 ? CHAR : darken(c, 0.6 + r() * 0.3); m.mat[i] = M_ROUGH; }
    }
  }
  return m;
}
// Weapon heads only char and lose a few pieces.
function scorchModel(base, stage, type) {
  const m = copyModel(base);
  for (let i = 0; i < m.col.length; i++) {
    if (m.col[i] < 0) continue;
    const z = (i / (m.w * m.h)) | 0, rest = i - z * m.w * m.h, y = (rest / m.w) | 0, x = rest - y * m.w, n = hash3(x >> 1, y >> 1, z + strSeed(type) % 97);
    if (stage === 2 && n < 0.07 && z > 0) m.col[i] = -1;
    else if (n < (stage === 2 ? 0.45 : 0.22)) m.col[i] = darken(m.col[i], 0.35 + hash3(x, y, z) * 0.3);
  }
  return m;
}
// A damaged structure sprite, built one at a time in the background so the first hit on a new
// type of building never stalls a frame: until it is ready, the next lighter stage is drawn.
const dmgQueue = [];
function damagedSprite(type, faction, stage, camo) {
  const pal = camoPal(faction, camo), k = 'S' + type + pal.key + 'd' + stage + '|0';
  const s = spriteCache2.get(k);
  if (s) return s;
  if (!dmgQueue.some((q) => q.k === k)) {
    dmgQueue.push({ k, type, faction, stage, camo, v: drawVar });
    if (dmgQueue.length === 1) setTimeout(pumpDamaged, 0);
  }
  return stage > 1 ? damagedSprite(type, faction, stage - 1, camo) : structureSprite(type, faction, camo);
}
function pumpDamaged() {
  const q = dmgQueue[0];
  if (!q) return;
  const keep = drawVar; drawVar = q.v;
  const pal = camoPal(q.faction, q.camo);
  drawVar = keep;
  sprite('S' + q.type + pal.key + 'd' + q.stage, () => damageModel(model('S' + q.type + pal.key, () => STRUCTURES[q.type](pal, q.faction)), q.stage, q.type, q.faction), 0, 0);
  dmgQueue.shift();
  if (dmgQueue.length) setTimeout(pumpDamaged, 20);
}
function hullSprite(u, pal) {
  const d = u.def;
  const key = d.type + pal.key;
  if (d.draw === 'tank') return facingSprite('T' + key, () => tankHull(pal, d.size), u.face);
  if (d.draw === 'jeep') return facingSprite('J' + key, () => jeepModel(pal), u.face);
  if (d.draw === 'fob') return facingSprite('F' + key, () => fobModel(pal), u.face);
  if (d.draw === 'mcv') return facingSprite('M' + key, () => mcvModel(pal), u.face);
  if (d.draw === 'arty') return facingSprite('R' + key, () => artyModel(pal), u.face);
  if (d.draw === 'v2') { const loaded = !(u.cd > 1.2); return facingSprite('W' + key + loaded, () => v2Model(pal, loaded), u.face); }
  if (d.draw === 'harv') { const full = (u.load || 0) > d.capacity * 0.3; return facingSprite('V' + key + full, () => harvModel(pal, full), u.face); }
  if (d.fly === 'heli') return facingSprite('A' + key, () => d.type === 'hind' ? hindModel(pal) : heliModel(pal), u.face);
  if (d.draw === 'cargo') {
    if (d.type === 'transport') return u.faction === 'allies' ? facingSprite('H' + key, () => c130Model(pal), u.face) : facingSprite('I' + key, () => il76Model(pal), u.face);
    if (d.type === 'bomber') return u.faction === 'allies' ? facingSprite('B' + key, () => b1Model(pal), u.face) : facingSprite('K' + key, () => tu22Model(pal), u.face);
    return facingSprite('C' + key, () => cargoModel(pal, d.type === 'bomber'), u.face);
  }
  const mig = d.type === 'mig' || (d.type === 'spyplane' && u.faction === 'soviets');
  return facingSprite('A' + key + mig, () => jetModel(pal, mig), u.face);
}
function turretSprite(u, pal) {
  const d = u.def;
  if (d.draw === 'tank') return facingSprite('t' + d.type + pal.key, () => tankTurret(pal, d.size), u.tface, FACINGS, { shadow: false });
  if (d.draw === 'jeep') return facingSprite('m' + pal.key, () => mgModel(pal), u.tface, FACINGS, { shadow: false });
  return null;
}
// Crouching: the standing figure with the thighs folded away, so the body sits lower.
function crouched(m) {
  const { w, h, d } = m, cut = 5, from = 3;
  for (let z = from; z < d; z++) for (let i = 0; i < w * h; i++) {
    const dst = z * w * h + i, src = (z + cut) * w * h + i;
    m.col[dst] = z + cut < d ? m.col[src] : -1; m.mat[dst] = z + cut < d ? m.mat[src] : 0;
  }
  m.surf = null;
  return m;
}
// Prone: lying on the stomach, legs back, weapon forward.
function proneModel(pal, faction, type) {
  const m = new VModel(-15, -5, 13, 5, 7);
  const K = infKit(pal, faction);
  for (const y0 of [-2, 0]) { m.box(-14, y0, 0, -13, y0 + 2, 2, C.black); m.box(-13, y0, 0, -6, y0 + 2, 2, K.pants); }
  m.box(-6, -2, 0, 2, 2, 3, pal.main); m.box(-6, -3, 2, 2, 3, 3, shadeInt(pal.main, 0.9));
  m.box(-6, -2, 0, -5, 2, 3, K.web);
  if (type !== 'pilot') m.box(-5, -2, 3, -1, 2, 4, C.oliveD);
  m.box(2, -1, 0, 5, 2, 3, K.skin);
  m.box(1, -2, 2, 5, 3, 4, type === 'pilot' ? '#cfcab8' : type === 'grenadier' ? '#5d6236' : K.helm);
  for (const y of [-3, 2]) { m.box(1, y, 0, 5, y + 1, 1.5, shadeInt(pal.main, 0.86)); m.set(5, y, 0, K.skin); }
  if (type === 'rocket') {
    m.cylX(-4, 8, -2.5, 3.5, 1.3, '#56603a'); m.box(8, -4, 2, 10, -1, 5, '#2a2a24');
    if (faction === 'soviets') { m.ellipsoid(9, -2.5, 3.5, 2.4, 1.9, 1.9, '#4a4f3a', M_METAL); m.set(11, -3, 3, '#c8281e'); }   // rocket head
  }
  else if (type === 'grenadier') m.box(5, 1, 0, 7, 3, 1.5, '#3f4a2a');
  else { m.box(4, -1, 0.5, 12, 0, 1.5, C.gun, M_METAL); m.box(1, -1, 0.5, 4, 0, 2, '#6a4426'); }
  return m;
}
// Push-ups: lying on the stomach with the weapon set down beside, the body pushed up on
// straight arms or lowered to the ground.
function pushupModel(pal, faction, type, up) {
  const m = new VModel(-15, -6, 13, 6, 8);
  const K = infKit(pal, faction), lift = up ? 2 : 0;
  for (const y0 of [-2, 0]) { m.box(-14, y0, 0, -13, y0 + 2, 2, C.black); m.box(-13, y0, 0, -6, y0 + 2, 2, K.pants); }
  m.box(-6, -2, lift / 2, -2, 2, 2 + lift / 2 + 1, pal.main);                       // hips, rising toward the chest
  m.box(-2, -2, lift, 2, 2, 3 + lift, pal.main); m.box(-2, -3, 2 + lift, 2, 3, 3 + lift, shadeInt(pal.main, 0.9));
  m.box(-6, -2, lift / 2, -5, 2, 3 + lift / 2, K.web);
  if (type !== 'pilot' && type !== 'grenadier') m.box(-5, -2, 3 + lift / 2, -1, 2, 4 + lift / 2, C.oliveD);
  m.box(2, -1, lift, 5, 2, 3 + lift, K.skin);
  m.box(1, -2, 2 + lift, 5, 3, 4 + lift, type === 'pilot' ? '#cfcab8' : type === 'grenadier' ? '#5d6236' : K.helm);
  for (const y of [-3, 2]) {
    if (up) { m.box(0, y, 1, 1, y + 1, 5, shadeInt(pal.main, 0.86)); m.set(0, y, 0, K.skin); }          // straight arms
    else { m.box(-1, y + (y < 0 ? -1 : 1), 0, 1, y + (y < 0 ? 0 : 2), 2, shadeInt(pal.main, 0.86)); m.set(1, y, 0, K.skin); }   // elbows out
  }
  if (type === 'rocket') { m.cylX(-8, 4, -5, 0.7, 0.9, '#56603a'); if (faction === 'soviets') m.ellipsoid(5, -5, 0.8, 1.6, 1.3, 1.3, '#4a4f3a', M_METAL); }
  else if (type !== 'grenadier' && type !== 'pilot') { m.box(-6, 4, 0, 3, 5, 1, C.gun, M_METAL); m.box(-9, 4, 0, -6, 5, 1.5, '#6a4426'); }
  return m;
}
function infSprite(u, pal, frame) {
  return facingSprite(`I${u.type}${pal.key}${frame}`, () => infModel(pal, u.faction, u.type, frame), u.face, 16, { crisp: true });
}
const TURRET_Z = { tank: 7, jeep: 7, arty: 9, v2: 12 };
function turretZ(d) { return d.size && d.size.tz !== undefined ? d.size.tz : TURRET_Z[d.draw]; }   // a def can sit its turret lower (Heavy Tank)

// Scenery: trees, boulders, ore, all rendered once.
function treeModel(seed, pine) {
  const r = rng(seed);
  const m = new VModel(-12, -12, 12, 12, 30);
  if (pine) {
    m.cylZ(0, 0, 0, 5, 1.2, C.bark, M_ROUGH);
    const top = 20 + Math.floor(r() * 7);
    for (let z = 3; z < top; z++) {
      const rad = (top - z) * 0.36 + (z % 4 === 0 ? 0.8 : 0);
      for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) {
        const d = Math.hypot(x + 0.5, y + 0.5);
        if (d <= rad && (d < rad - 1 || r() < 0.6)) m.set(x, y, z, C.pine[Math.floor(r() * 3)], M_ROUGH);
      }
    }
  } else {
    m.cylZ(0, 0, 0, 9, 1.4, C.bark, M_ROUGH);
    const blobs = 3 + Math.floor(r() * 3);
    for (let i = 0; i < blobs; i++) {
      const cx = (r() - 0.5) * 7, cy = (r() - 0.5) * 7, cz = 12 + r() * 6, rad = 4.5 + r() * 3;
      for (let z = Math.floor(cz - rad); z < cz + rad; z++) for (let y = Math.floor(cy - rad); y < cy + rad; y++) for (let x = Math.floor(cx - rad); x < cx + rad; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy, (z + 0.5 - cz) * 1.2);
        if (d < rad && (d < rad - 1.2 || r() < 0.55)) m.set(x, y, z, C.leaf[Math.max(0, Math.min(3, Math.floor(r() * 3 + (z - cz) / rad * 1.5 + 0.5)))], M_ROUGH);
      }
    }
  }
  return m;
}
function rockModel(seed) {
  const r = rng(seed);
  const m = new VModel(-13, -10, 13, 10, 12);
  const lumps = 2 + Math.floor(r() * 3);
  for (let i = 0; i < lumps; i++) {
    const cx = (r() - 0.5) * 12, cy = (r() - 0.5) * 6, rx = 4 + r() * 5, ry = 3 + r() * 4, rz = 3 + r() * 5;
    for (let z = 0; z < rz + 1; z++) for (let y = Math.floor(cy - ry - 1); y < cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x < cx + rx + 1; x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 + ((z + 0.5) / rz) ** 2;
      if (d < 1 - hash3(x, y, z + seed) * 0.25) m.set(x, y, z, C.rock[Math.floor(hash3(x >> 1, y >> 1, z + seed) * 3)], M_ROUGH);
    }
  }
  return m;
}
function oreModel(level, variant) {
  const r = rng(level * 131 + variant * 17 + 5);
  const m = new VModel(0, 0, CELL, CELL, 4);
  // Earthy bed the ore sits in, then a scatter of low, glinting lumps.
  for (let i = 0; i < 10 + level * 8; i++) {
    const x = Math.floor(r() * CELL), y = Math.floor(r() * CELL);
    m.box(x, y, 0, x + 2, y + 1, 1, r() < 0.5 ? '#6e5a30' : '#5c4a28', M_ROUGH);
  }
  const n = 8 + level * 7;
  for (let i = 0; i < n; i++) {
    const cx = 1.5 + r() * 21, cy = 1.5 + r() * 21, rad = 0.8 + r() * (0.5 + level * 0.25);
    const col = C.ore[Math.floor(r() * 4)];
    for (let z = 0; z < Math.max(1, rad * 0.9); z++) for (let y = Math.floor(cy - rad); y < cy + rad; y++) for (let x = Math.floor(cx - rad); x < cx + rad; x++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy, (z + 0.5) * 1.4) < rad + 0.3) m.set(x, y, z, col, M_METAL);
    }
  }
  return m;
}
// Gems: fewer, taller crystals in violet, blue and ruby.
function gemModel(level, variant) {
  const r = rng(level * 211 + variant * 29 + 3);
  const m = new VModel(0, 0, CELL, CELL, 7);
  for (let i = 0; i < 8 + level * 5; i++) { const x = Math.floor(r() * CELL), y = Math.floor(r() * CELL); m.box(x, y, 0, x + 2, y + 1, 1, '#4a4038', M_ROUGH); }
  const cols = ['#7a62e8', '#9a86ff', '#4f7cf0', '#c0405a', '#b6a6ff'];
  for (let i = 0; i < 3 + level * 2; i++) {
    const cx = 3 + r() * 18, cy = 3 + r() * 18, h = 2 + level * 0.8 + r() * 1.5, rad = 1.5 + r() * 0.9 + level * 0.15, col = cols[Math.floor(r() * cols.length)];
    for (let z = 0; z < h; z++) {
      const rr = rad * (1 - z / (h + 0.5));
      for (let y = Math.floor(cy - rr); y < cy + rr; y++) for (let x = Math.floor(cx - rr); x < cx + rr; x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= rr + 0.2) m.set(x, y, z, z === Math.floor(h) - 1 ? '#e8e0ff' : col, M_GLASS);
    }
  }
  return m;
}
const scenery = { trees: [], pines: [], rocks: [], ore: [], gem: [] };
function buildScenery() {
  if (scenery.trees.length) return;
  for (let i = 0; i < 6; i++) scenery.trees.push(renderVox(treeModel(i * 97 + 3, false), 0));
  for (let i = 0; i < 5; i++) scenery.pines.push(renderVox(treeModel(i * 71 + 11, true), 0));
  for (let i = 0; i < 5; i++) scenery.rocks.push(renderVox(rockModel(i * 53 + 7), 0));
  for (let lv = 0; lv < 4; lv++) { scenery.ore[lv] = []; for (let v = 0; v < 4; v++) scenery.ore[lv].push(renderVox(oreModel(lv, v), 0)); }
  for (let lv = 0; lv < 4; lv++) { scenery.gem[lv] = []; for (let v = 0; v < 4; v++) scenery.gem[lv].push(renderVox(gemModel(lv, v), 0)); }
}
