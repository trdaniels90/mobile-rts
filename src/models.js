'use strict';
// Voxel models for every unit, structure and piece of scenery, plus cached sprite lookups.
// Units face +x; 1 voxel = 1 world pixel; z is height above the ground.

const C = {
  track: '#2a2925', trackHi: '#3b3a34', wheel: '#55554d', gun: '#34362f', steel: '#9ba1a3', metal: '#7b7e78',
  conc: '#8f8d84', concD: '#6e6c64', wall: '#d6d3c9', wallD: '#b9b6ac', bib: '#6e6352', bibD: '#584e40', asphalt: '#4b4b46', glass: '#35505f', glow: '#ffe9a0',
  sand: '#ad9466', sandD: '#8a744c', olive: '#5a6238', oliveD: '#454b2b', skin: '#c38d66', brick: '#8b4535',
  yellow: '#d0a426', black: '#1c1c1a', copper: '#b4692a', white: '#e4e2d8', red: '#b8302a', tan: '#b5a26c',
  leaf: ['#1d2c13', '#26391a', '#304822', '#3c592a'], pine: ['#18291a', '#1f3420', '#294228'], snow: ['#dfe6ef', '#f4f7fb'], bark: '#4a3420',
  rock: ['#6d685e', '#7d786c', '#5c584f'], ore: ['#b48a1c', '#d2a62a', '#e8c24a', '#9a7414'],
};
const BURNT = { key: 'burnt', main: '#3b3631', light: '#4b453d', dark: '#26231f', deep: '#171512' };
// `drawVar` is 1 while drawing a teammate that shares a faction with an earlier teammate: it gets the faction's
// alternate colours (and its own sprite caches, through the palette's key); 2 for a third such teammate (3 v 3).
let drawVar = 0;
function palFor(faction) {
  const f = FACTIONS[faction], alt = drawVar === 2 ? f.alt2 : drawVar ? f.alt : null, p = alt || f.pal;
  p.key = p.key || (alt ? faction + (drawVar + 1) : faction);
  return p;
}

const modelCache = new Map();
function model(key, build) {
  let m = modelCache.get(key);
  if (!m) { m = build(); modelCache.set(key, m); }
  return m;
}
const spriteCache2 = new Map();
// Sprites are made the first time they are drawn. Scrolling into a big battle (six colours in a 3 v 3, every
// type and facing) could ask for dozens in one frame and stall it, so making them is held to SPRITE_BUDGET ms
// a frame (ui.js resets spriteSpend each frame): past it, a sprite of the same model at another facing stands
// in for a frame or two until its own is made.
const SPRITE_BUDGET = 5, spriteAny = new Map();
let spriteSpend = 0;
let spriteMs = 0, spriteN = 0, blankSprite = null;
const spriteBlank = () => blankSprite || (blankSprite = { img: mkCanvas(1, 1), ox: 0, oy: 0 });   // sprites made this frame, marks' included: time and number (ui.js resets; Report: stats.frames)
function sprite(mkey, build, angle, fkey, opts) {
  if (FLAT_PASS) { mkey += '~flat'; opts = Object.assign({}, opts, { flat: true }); }   // (to be painted into the ground: voxel.js)
  const k = mkey + '|' + fkey;
  let s = spriteCache2.get(k);
  if (s) return s;
  if (spriteSpend > SPRITE_BUDGET) return spriteAny.get(mkey) || spriteBlank();   // (never seen at all: drawn a frame or two later)
  const t0 = performance.now();
  s = renderVox(model(mkey, build), angle, opts);
  spriteCache2.set(k, s); spriteAny.set(mkey, s);
  const dt = performance.now() - t0;
  spriteSpend += dt; spriteMs += dt; spriteN++;
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
  m.box(-8, -6, 0, 8, -4, 1, '#2a2925', M_ROUGH);
  m.box(-8, 4, 0, 8, 5, 3, '#2a2925', M_ROUGH);
  m.box(-8, 5, 0, -7, 6, 3, '#2a2925', M_ROUGH);
  m.box(-7, 5, 0, -5, 6, 1, '#8c9094', M_METAL);
  m.box(-5, 5, 0, -3, 6, 3, '#2a2925', M_ROUGH);
  m.box(-3, 5, 0, -1, 6, 1, '#8c9094', M_METAL);
  m.box(-1, 5, 0, 1, 6, 3, '#2a2925', M_ROUGH);
  m.box(1, 5, 0, 3, 6, 1, '#8c9094', M_METAL);
  m.box(3, 5, 0, 8, 6, 1, '#2a2925', M_ROUGH);
  m.box(-8, -6, 1, -6, -4, 3, '#2a2925', M_ROUGH);
  m.box(-6, -6, 1, -5, -5, 2, '#b9bdc0', M_METAL);
  m.box(-5, -6, 1, -2, -4, 3, '#2a2925', M_ROUGH);
  m.box(-2, -6, 1, -1, -5, 2, '#b9bdc0', M_METAL);
  m.box(-1, -6, 1, 2, -4, 3, '#2a2925', M_ROUGH);
  m.box(2, -6, 1, 3, -5, 2, '#b9bdc0', M_METAL);
  m.box(3, -6, 1, 8, -4, 3, '#2a2925', M_ROUGH);
  m.box(-6, -5, 1, -5, -4, 3, '#2a2925', M_ROUGH);
  m.box(-2, -5, 1, -1, -4, 3, '#2a2925', M_ROUGH);
  m.box(2, -5, 1, 3, -4, 3, '#2a2925', M_ROUGH);
  m.box(-8, -3, 1, 8, 3, 3, pal.dark, M_METAL);
  m.box(-7, 5, 1, -6, 6, 2, '#8c9094', M_METAL);
  m.box(-6, 5, 1, -5, 6, 2, '#b9bdc0', M_METAL);
  m.box(-3, 5, 1, -2, 6, 2, '#8c9094', M_METAL);
  m.box(-2, 5, 1, -1, 6, 2, '#b9bdc0', M_METAL);
  m.box(1, 5, 1, 2, 6, 2, '#8c9094', M_METAL);
  m.box(2, 5, 1, 3, 6, 2, '#b9bdc0', M_METAL);
  m.box(3, 5, 1, 6, 6, 3, '#2a2925', M_ROUGH);
  m.box(6, 5, 1, 7, 6, 2, '#8c9094', M_METAL);
  m.box(7, 5, 1, 8, 6, 3, '#2a2925', M_ROUGH);
  m.box(-6, -6, 2, -5, -5, 3, '#2a2925', M_ROUGH);
  m.box(-2, -6, 2, -1, -5, 3, '#2a2925', M_ROUGH);
  m.box(2, -6, 2, 3, -5, 3, '#2a2925', M_ROUGH);
  m.box(8, -3, 2, 9, 3, 3, pal.dark, M_METAL);
  m.box(-7, 5, 2, -5, 6, 3, '#2a2925', M_ROUGH);
  m.box(-3, 5, 2, -1, 6, 3, '#2a2925', M_ROUGH);
  m.box(1, 5, 2, 3, 6, 3, '#2a2925', M_ROUGH);
  m.box(6, 5, 2, 7, 6, 3, '#2a2925', M_ROUGH);
  m.box(-9, -6, 3, -8, -3, 4, pal.dark, M_METAL);
  m.box(-7, -6, 3, 6, -4, 4, '#3b3a34', M_ROUGH);
  m.box(7, -6, 3, 9, -3, 4, pal.main, M_METAL);
  m.box(4, -4, 3, 5, 4, 4, pal.light, M_METAL);
  m.box(-8, -3, 3, 4, 3, 4, pal.dark, M_METAL);
  m.box(5, -3, 3, 8, 3, 4, pal.light, M_METAL);
  m.box(-9, 3, 3, -8, 6, 4, pal.dark, M_METAL);
  m.box(7, 3, 3, 9, 6, 4, pal.main, M_METAL);
  m.box(-7, 4, 3, 6, 6, 4, '#3b3a34', M_ROUGH);
  m.box(-8, -6, 4, -7, -4, 5, pal.dark, M_METAL);
  m.box(-7, -6, 4, 7, -3, 5, pal.main, M_METAL);
  m.box(-8, -4, 4, -7, -2, 5, pal.main, M_METAL);
  m.box(-7, -3, 4, 4, -2, 5, pal.main, M_METAL);
  m.box(4, -3, 4, 7, 3, 5, pal.light, M_METAL);
  m.box(-8, -2, 4, -7, 2, 6, pal.deep, M_MATTE);
  m.box(-7, -2, 4, -5, 6, 5, pal.main, M_METAL);
  m.box(-5, -2, 4, -4, 2, 6, pal.deep, M_MATTE);
  m.box(-4, -2, 4, 4, 6, 5, pal.main, M_METAL);
  m.box(-8, 2, 4, -7, 4, 5, pal.main, M_METAL);
  m.box(-5, 2, 4, -4, 6, 5, pal.main, M_METAL);
  m.box(4, 3, 4, 7, 6, 5, pal.main, M_METAL);
  m.box(-8, 4, 4, -7, 6, 5, pal.dark, M_METAL);
  m.box(-3, -4, 5, 0, 4, 6, pal.main, M_METAL);
  m.box(0, -4, 5, 2, -3, 6, pal.deep, M_MATTE);
  m.box(2, -4, 5, 4, 4, 6, pal.main, M_METAL);
  m.box(-5, -3, 5, -3, -2, 6, pal.main, M_METAL);
  m.box(0, -3, 5, 2, 3, 6, pal.main, M_METAL);
  m.box(4, -3, 5, 5, 3, 6, pal.light, M_METAL);
  m.box(-4, -2, 5, -3, 3, 6, pal.main, M_METAL);
  m.box(5, 0, 5, 6, 2, 6, pal.dark, M_METAL);
  m.box(-5, 2, 5, -4, 3, 6, pal.main, M_METAL);
  m.box(0, 3, 5, 2, 4, 6, pal.deep, M_MATTE);
  return m;
}
function lightTankTurret(pal) {
  const m = new VModel(-6.5, -6.5, 17.5, 7.5, 7);
  m.py = -0.5;   // built half a voxel to +y (see ltank.py): turn it about its own centre
  m.box(-2, -4, 0, 2, -3, 2, pal.main, M_METAL);
  m.box(-4, -3, 0, -3, -2, 1, pal.dark, M_METAL);
  m.box(-3, -3, 0, -2, -2, 3, pal.main, M_METAL);
  m.box(-2, -3, 0, 1, 3, 3, pal.light, M_METAL);
  m.box(1, -3, 0, 3, -2, 3, pal.main, M_METAL);
  m.box(3, -3, 0, 4, -2, 1, pal.dark, M_METAL);
  m.box(-4, -2, 0, -3, 3, 1, pal.main, M_METAL);
  m.box(-3, -2, 0, -2, 2, 4, pal.light, M_METAL);
  m.box(1, -2, 0, 2, 2, 4, pal.light, M_METAL);
  m.box(2, -2, 0, 4, 3, 1, pal.main, M_METAL);
  m.box(-5, -1, 0, -4, 0, 2, pal.dark, M_METAL);
  m.box(4, -1, 0, 5, 0, 3, pal.dark, M_METAL);
  m.box(-5, 0, 0, -4, 1, 1, pal.main, M_METAL);
  m.box(4, 0, 0, 5, 1, 1, pal.main, M_METAL);
  m.box(-5, 1, 0, -4, 2, 2, pal.dark, M_METAL);
  m.box(4, 1, 0, 5, 2, 3, pal.dark, M_METAL);
  m.box(-3, 2, 0, -2, 4, 1, pal.main, M_METAL);
  m.box(1, 2, 0, 2, 5, 1, pal.main, M_METAL);
  m.box(-4, 3, 0, -3, 4, 1, pal.dark, M_METAL);
  m.box(-2, 3, 0, 1, 5, 2, pal.main, M_METAL);
  m.box(2, 3, 0, 3, 4, 3, pal.main, M_METAL);
  m.box(3, 3, 0, 4, 4, 1, pal.dark, M_METAL);
  m.box(-4, -2, 1, -3, -1, 2, pal.main, M_METAL);
  m.box(2, -2, 1, 3, -1, 4, pal.main, M_METAL);
  m.box(3, -2, 1, 5, -1, 3, pal.dark, M_METAL);
  m.box(-4, -1, 1, -3, 2, 2, pal.dark, M_METAL);
  m.box(2, -1, 1, 3, 1, 3, pal.light, M_METAL);
  m.box(3, -1, 1, 4, 3, 3, pal.dark, M_METAL);
  m.box(5, -1, 1, 7, 2, 2, '#8c9094', M_METAL);
  m.box(-5, 0, 1, -4, 1, 2, pal.dark, M_METAL);
  m.box(4, 0, 1, 5, 1, 3, pal.dark, M_METAL);
  m.box(2, 1, 1, 3, 3, 4, pal.main, M_METAL);
  m.box(-4, 2, 1, -3, 3, 2, pal.main, M_METAL);
  m.box(-3, 2, 1, -2, 3, 2, pal.light, M_METAL);
  m.box(1, 2, 1, 2, 3, 2, pal.light, M_METAL);
  m.box(4, 2, 1, 5, 3, 3, pal.dark, M_METAL);
  m.box(-3, 3, 1, -2, 4, 3, pal.main, M_METAL);
  m.box(1, 3, 1, 2, 5, 2, pal.main, M_METAL);
  m.box(-4, -1, 2, -3, 1, 3, pal.light, M_METAL);
  m.box(5, -1, 2, 13, 2, 3, '#4d4840', M_METAL);
  m.box(13, -1, 2, 15, 2, 3, '#2e2a25', M_METAL);
  m.box(-4, 1, 2, -3, 2, 3, pal.main, M_METAL);
  m.box(-3, 2, 2, -2, 3, 4, pal.main, M_METAL);
  m.box(1, 2, 2, 2, 4, 3, pal.main, M_METAL);
  m.box(-2, 3, 2, 1, 4, 3, pal.main, M_METAL);
  m.box(-1, -3, 3, 0, 3, 4, pal.light, M_METAL);
  m.box(0, -3, 3, 1, -2, 4, pal.main, M_METAL);
  m.box(-2, -2, 3, -1, 3, 4, pal.light, M_METAL);
  m.box(0, -2, 3, 1, 3, 4, pal.light, M_METAL);
  m.box(2, -1, 3, 3, 1, 4, pal.main, M_METAL);
  m.box(1, 2, 3, 2, 3, 4, pal.main, M_METAL);
  m.box(-1, 3, 3, 1, 4, 4, pal.main, M_METAL);
  m.box(-1, -2, 4, 0, -1, 5, pal.light, M_METAL);
  m.box(-2, -1, 4, 0, 2, 5, '#3a3d42', M_METAL);
  m.box(0, -1, 4, 1, 0, 5, pal.light, M_METAL);
  m.box(1, -1, 4, 2, 2, 5, pal.main, M_METAL);
  m.box(-3, 0, 4, -2, 1, 6, '#3a3d42', M_METAL);
  m.box(0, 0, 4, 1, 1, 6, '#3a3d42', M_METAL);
  m.box(0, 1, 4, 1, 2, 5, pal.light, M_METAL);
  m.box(-2, -1, 5, 0, 0, 6, '#3a3d42', M_METAL);
  m.box(-2, 0, 5, -1, 2, 6, '#3a3d42', M_METAL);
  m.box(-1, 0, 5, 0, 1, 6, '#15182a', M_MATTE);
  m.box(-1, 1, 5, 0, 2, 6, '#3a3d42', M_METAL);
  return m;
}
// BLENDER:ltank end
// Allied Tank Destroyer: a low tracked hull carrying a sloped armoured casemate with a long high-velocity gun and no turret
// (`fixed`: the whole vehicle turns to aim). The casemate is drawn as the "turret" (tdTurret), which a fixed unit keeps in line
// with the hull (u.tface follows u.face), so it gets the tank's recoil and muzzle flash for free.
function tdHull(pal, s) {
  const hl = Math.floor(s.len / 2), hw = Math.floor(s.wid / 2), tw = 3;
  const m = new VModel(-hl - 2, -hw - 2, hl + 3, hw + 3, 8);
  for (const side of [-1, 1]) {                                                       // tracks, road wheels, skirts
    const y0 = side < 0 ? -hw : hw - tw, y1 = y0 + tw, outer = side < 0 ? -hw : hw - 1;
    m.box(-hl, y0, 0, hl, y1, 3, C.track, M_ROUGH);
    m.clear(-hl, y0, 0, -hl + 1, y1, 1); m.clear(hl - 1, y0, 0, hl, y1, 1);
    for (let x = -hl; x < hl; x += 2) m.box(x, y0, 2, x + 1, y1, 3, C.trackHi, M_ROUGH);
    for (let x = -hl + 2; x < hl - 2; x += 3) m.box(x, outer, 0, x + 2, outer + 1, 2, C.wheel, M_METAL);
    m.box(-hl + 1, y0, 3, hl - 1, y1, 4, pal.dark, M_METAL);                         // track guards
  }
  m.box(-hl + 1, -hw + tw, 1, hl - 1, hw - tw, 4, pal.dark, M_METAL);                 // hull body
  m.box(-hl + 1, -hw + 1, 4, hl - 2, hw - 1, 5, pal.main, M_METAL);                   // deck
  m.box(hl - 2, -hw + 2, 2, hl, hw - 2, 4, pal.light, M_METAL);                       // sloped glacis
  for (let y = -hw + 3; y < hw - 3; y += 2) m.box(-hl + 1, y, 5, -hl + 4, y + 1, 6, pal.deep, M_MATTE);   // engine grille at the back
  m.box(-hl + 4, -hw, 5, -hl + 9, -hw + 1, 6, C.oliveD);                              // tool box
  m.box(hl - 3, -hw + 1, 4, hl - 2, -hw + 2, 5, C.glow, M_GLASS); m.box(hl - 3, hw - 2, 4, hl - 2, hw - 1, 5, C.glow, M_GLASS);   // lights
  return m;
}
function tdTurret(pal, s) {
  const reach = s.tur + s.barrel;
  const m = new VModel(-9, -7, reach + 3, 7, 8);
  for (let z = 0; z < 5; z++) {                                                       // the casemate: its front and sides lean in as it rises
    const f = 5 - z * 0.8, b = -7 + z * 0.3, w = 6 - z * 0.5;
    m.box(b, -w, z, f, w, z + 1, z === 4 ? pal.light : pal.main, M_METAL);
  }
  m.box(-6, -4, 4, 1, 4, 5, pal.light, M_METAL);                                      // flat roof
  m.box(-6.5, -5, 0, -6, 5, 4, pal.dark, M_METAL);                                    // rear plate
  m.cylZ(-3, 2.5, 5, 6, 1.4, pal.deep, M_MATTE);                                      // commander's hatch
  m.box(-1, -3.5, 5, 1, -2, 6, '#2b3036', M_METAL);                                   // sight block
  m.box(3, -2.5, 0, 6, 2.5, 3.5, pal.dark, M_METAL);                                  // gun mantlet
  m.cylX(5, reach, 0, 2, 1.0, C.gun, M_METAL);                                        // the long gun
  m.cylX(5, 9, 0, 2, 1.35, C.gun, M_METAL);                                           // thicker at the breech end
  m.box(reach - 2, -1.6, 1, reach, 1.6, 3, C.gun, M_METAL);                           // muzzle brake
  m.line(-6, 4.5, 4, -6, 4.5, 8, C.black);                                            // aerial
  m.paint(-8, -7, 0, 6, 7, 6, (x, y, z, c) => (hash3(x, y, z) > 0.95 && c === rgbInt(pal.main)) ? pal.dark : undefined);
  return m;
}
// Soviet Mobile SAM, after the SA-13 Gopher: a low, flat, boxy MT-LB-style tracked carrier (msamHull) with a small cab and
// sloped nose at the front, and on the cargo deck the launcher (samTurret, the turning "turret"): an operator's housing with a
// window, a round radar dish on a mast in the middle and two box launchers of two canisters each, raised on arms either side.
// Missiles leave from the launchers' front ends (muzzle: tur + barrel).
const GOPHER = { box: '#4c5638', boxHi: '#5d6845', boxD: '#353c27' };
function msamHull(pal, s) {
  const hl = Math.floor(s.len / 2), hw = Math.floor(s.wid / 2), tw = 3;
  const m = new VModel(-hl - 2, -hw - 2, hl + 3, hw + 3, 9);
  for (const side of [-1, 1]) {                                                       // tracks and six big road wheels a side
    const y0 = side < 0 ? -hw : hw - tw, y1 = y0 + tw, outer = side < 0 ? -hw : hw - 1;
    m.box(-hl, y0, 0, hl, y1, 3, C.track, M_ROUGH);
    m.clear(-hl, y0, 0, -hl + 1, y1, 1); m.clear(hl - 1, y0, 0, hl, y1, 1);
    for (let x = -hl; x < hl; x += 2) m.box(x, y0, 2, x + 1, y1, 3, C.trackHi, M_ROUGH);
    for (let i = 0; i < 6; i++) { const x = -hl + 2.5 + i * (2 * hl - 5) / 5; m.cylY(outer - 0.2, outer + 1.2, x, 1.4, 1.5, C.wheel, M_METAL); }
  }
  m.box(-hl, -hw + 1, 3, hl - 2, hw - 1, 5, pal.dark, M_METAL);                       // the flat box hull, wider than the tracks
  m.box(-hl, -hw, 5, hl - 3, hw, 6, pal.main, M_METAL);                               // deck, overhanging the tracks
  m.box(hl - 3, -hw + 1, 3, hl - 1, hw - 1, 5.5, pal.main, M_METAL);                  // sloped nose
  m.box(hl - 1, -hw + 2, 2, hl, hw - 2, 4, pal.dark, M_METAL);
  m.box(hl - 7, -hw + 1, 6, hl - 3, hw - 1, 7, pal.light, M_METAL);                   // cab roof, front
  for (const y of [-hw + 2, hw - 4]) m.box(hl - 4, y, 6, hl - 3, y + 2, 7, C.glass, M_GLASS);   // two vision blocks
  for (const y of [-hw + 2, hw - 4]) m.cylZ(hl - 6, y + 1, 7, 7.6, 1, pal.deep, M_MATTE);       // round cab hatches
  for (const y of [-hw + 1, hw - 3]) m.box(-hl + 1, y, 6, -hl + 6, y + 2, 7, pal.light, M_METAL); // rear cargo hatches
  m.box(-hl - 1, -hw + 2, 3, -hl, hw - 2, 5, pal.dark, M_METAL);                      // rear doors
  m.box(-hl + 1, hw - 1, 6, -hl + 6, hw, 8, GOPHER.box, M_METAL);                     // stowage box at the back
  for (const y of [-hw + 1, hw - 2]) m.box(hl - 2, y, 5, hl - 1, y + 1, 6, C.glow, M_GLASS);   // headlights
  m.paint(-hl, -hw, 3, hl, hw, 8, (x, y, z, c) => (hash3(x, y, z) > 0.93 && c === rgbInt(pal.main)) ? pal.dark : undefined);
  return m;
}
function samTurret(pal, s) {
  const m = new VModel(-9, -11, 14, 11, 18);
  m.cylZ(0, 0, 0, 1, 3.5, pal.dark, M_METAL);                                         // turntable ring
  m.box(-3, -2.5, 1, 3, 2.5, 6, pal.main, M_METAL);                                   // operator's housing
  m.box(-2, -2, 6, 2, 2, 7, pal.light, M_METAL);
  m.box(3, -1.8, 2.5, 3.6, 1.8, 5, C.glass, M_GLASS);                                 // its front window
  m.box(-0.5, -0.6, 7, 0.5, 0.6, 12, '#3a3e36', M_METAL);                             // radar mast
  for (let y = -3; y <= 3; y += 0.5) for (let z = -3; z <= 3; z += 0.5)               // the round dish, facing forward
    if (y * y + z * z <= 9.2) m.set(0.8 + (y * y + z * z) * 0.06, y, 13 + z, Math.hypot(y, z) > 2.4 ? '#3f4639' : '#56604a', M_METAL);
  m.set(1.6, 0, 13, '#22261e', M_METAL);                                              // feed horn
  const up = 0.32, cx = Math.cos(up), cz = Math.sin(up);
  for (const side of [-1, 1]) {
    const yc = side * 7.2;
    m.line(-1, side * 2.5, 5, -1, yc - side * 1.5, 9, '#3a3e36', M_METAL);          // the arm out to the launcher
    m.line(-1, side * 2.5, 4, -1, yc - side * 1.5, 8, '#3a3e36', M_METAL);
    for (let t = 0; t <= 14; t += 0.2) {                                              // two canisters side by side, nose up
      const x = -6 + t * cx, z = 8 + t * cz;
      for (let w = -1.8; w <= 1.8; w += 0.3) for (let h = 0; h <= 1.6; h += 0.3) {
        const edge = t < 0.5 || t > 13.5;
        m.set(x - h * cz, yc + w, z + h * cx, edge ? GOPHER.boxD : Math.abs(w) < 0.2 ? GOPHER.boxD : h > 1.1 ? GOPHER.boxHi : GOPHER.box, M_METAL);
      }
    }
    for (const w of [-1, 1]) m.set(-6 + 14 * cx + 0.6, yc + w, 8 + 14 * cz + 0.8, '#1a1c16', M_MATTE);   // the canister mouths
  }
  return m;
}
function tankHull(pal, s) {
  if (s.td) return tdHull(pal, s);
  if (s.sam) return msamHull(pal, s);
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
// The Tesla Tank's turret: a low armoured drum under a big steel dome wound with copper bands, a glowing cap at its crown that
// the bolt leaves from (world.js muzzle: TESLA_TOP), and blue insulators either side.
function teslaTurret(pal, s) {
  const r = s.tur, R = r + 1.6, m = new VModel(-R - 2, -R - 2, R + 4, R + 2, 13);
  const steel = '#60666b', copper = '#b9763e';
  m.ellipsoid(0, 0, 2, R, R, 7.2, steel, M_METAL);                              // the dome
  m.paint(-R - 1, -R - 1, 3, R + 1, R + 1, 10, (x, y, z) => (z === 4 ? copper : z === 7 ? '#3a3e42' : undefined));   // a copper band and a seam
  m.cylZ(0, 0, 0, 3, R + 0.4, pal.main, M_METAL);                            // drum
  m.cylZ(0, 0, 2, 3, R + 0.4, pal.dark, M_METAL);
  m.box(R - 1, -2, 0, R + 2, 2, 2, pal.dark, M_METAL);                         // mantlet
  m.ellipsoid(0, 0, 9.6, 1.8, 1.8, 1.3, '#a6dcff', M_GLOW);                       // glowing cap
  for (const y of [-R - 0.5, R - 0.5]) { m.box(-2, y, 2, -1, y + 1, 5, '#3f78b4', M_METAL); m.set(-2, y, 5, '#cfe9ff', M_GLOW); }   // insulators
  m.line(-R + 1, R - 2, 3, -R + 1, R - 2, 7, C.black);                         // aerial
  return m;
}
function tankTurret(pal, s) {
  if (s.tesla) return teslaTurret(pal, s);
  if (s.td) return tdTurret(pal, s);
  if (s.sam) return samTurret(pal, s);
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
// ---------------------------------------------------------------------------
// Armoured personnel carriers. Hulls are built with the turret ring at the origin (the turret turns about it).
// Fill the voxels of a box for which keep(x, y, z) (voxel centres) is true: for sloped plates.
function solidV(m, x0, y0, z0, x1, y1, z1, keep, c, mt) {
  for (let z = Math.max(0, Math.floor(z0)); z < z1; z++) for (let y = Math.floor(y0); y < y1; y++) for (let x = Math.floor(x0); x < x1; x++)
    if (keep(x + 0.5, y + 0.5, z + 0.5)) m.set(x, y, z, c, mt);
}
function apcTracks(m, x0, x1, hw, tw, h) {
  for (const side of [-1, 1]) {
    const y0 = side < 0 ? -hw : hw - tw, y1 = y0 + tw;
    m.box(x0, y0, 0, x1, y1, h, C.track, M_ROUGH);
    m.clear(x0, y0, 0, x0 + 1, y1, 1); m.clear(x1 - 1, y0, 0, x1, y1, 1);
    for (let x = x0; x < x1; x += 2) m.box(x, y0, h - 1, x + 1, y1, h, C.trackHi, M_ROUGH);
    const outer = side < 0 ? -hw : hw - 1;
    for (let x = x0 + 2; x < x1 - 2; x += 4) m.box(x, outer, 1, x + 2, outer + 1, h - 1, C.wheel, M_METAL);
  }
}
// Allied APC: a tracked box with flat sides, a sloped nose with a trim vane, a big rear ramp and a roof hatch; the gunner's
// hatch and .50 cal are the turret (apcTurret).
function apcHull(pal) {
  const X0 = -12, X1 = 10, hw = 7, m = new VModel(X0 - 2, -hw - 2, X1 + 3, hw + 2, 13);
  const roof = (x) => 11 - Math.max(0, x - 3) * 1.15;
  apcTracks(m, X0, X1, hw, 3, 4);
  solidV(m, X0, -hw + 0.5, 3, X1, hw - 0.5, 11, (x, y, z) => z < roof(x) && z > 2 + Math.max(0, x - 7) * 1.4, pal.main, M_METAL);
  m.box(X0, -hw, 4, 4, -hw + 1, 6, pal.dark, M_METAL); m.box(X0, hw - 1, 4, 4, hw, 6, pal.dark, M_METAL);    // fenders
  solidV(m, 7, -hw + 1, 4, X1 + 1, hw - 1, 8, (x, y, z) => Math.abs(z - roof(x)) < 0.9, pal.dark, M_METAL);   // trim vane
  m.box(X0, -hw + 1, 3, X0 + 1, hw - 1, 10, pal.dark, M_METAL);                                             // rear ramp
  m.paint(X0, -hw + 1, 3, X0 + 1, hw - 1, 10, (x, y, z) => (y === -hw + 2 || y === hw - 3 || z === 9) ? pal.deep : undefined);
  m.box(X0 + 1, -3, 10, -4, 3, 11, pal.dark, M_METAL);                                                      // troop hatch
  m.cylZ(0, 0, 10, 11, 2.8, pal.dark, M_METAL);                                                             // turret ring
  m.box(-7, -hw, 6, -3, -hw + 1, 9, C.oliveD, M_MATTE);                                                     // stowage
  m.box(-7, hw - 1, 6, -3, hw, 8, C.oliveD, M_MATTE);
  m.line(X0 + 2, hw - 2, 11, X0 + 2, hw - 2, 15, C.black);                                                  // aerial
  m.box(8, -hw + 1, 7, 9, -hw + 2, 8, C.glow, M_GLASS); m.box(8, hw - 2, 7, 9, hw - 1, 8, C.glow, M_GLASS);
  return m;
}
// The Allied APC's top: a gunner standing in the hatch at an M2 .50 cal behind a small shield. frame 1: the gun kicked back
// (firing; drawn on alternate rounds of a burst). Burnt (a wreck): the gun only.
function apcTurret(pal, frame) {
  const m = new VModel(-6, -4, 12, 4, 10), k = frame === 1 ? -1 : 0, burnt = pal.key === 'burnt';
  m.cylZ(0, 0, 0, 1, 2.4, pal.dark, M_METAL);                                       // hatch ring
  m.box(3, -3, 1, 4, 3, 5, '#6a7076', M_METAL);                                    // shield
  m.clear(3, -1, 3, 4, 1, 5);
  m.box(0 + k, -1, 3, 4 + k, 1, 5, C.gun, M_METAL);                                // receiver
  m.box(4 + k, -1, 3, 7 + k, 1, 5, '#3d4038', M_METAL);                            // barrel jacket
  m.box(7 + k, 0, 4, 11 + k, 1, 5, C.gun, M_METAL);                                // barrel
  m.box(1 + k, 1, 2, 3 + k, 2, 4, C.olive, M_MATTE);                               // ammunition can
  if (burnt) return m;
  const K = infKit(pal, 'allies'), sleeve = shadeInt(pal.main, 0.84);
  const g = k * 0.5;                                                                // (firing: he leans into the gun)
  m.box(-4, -2, 1, -1, 2, 6, pal.main, M_MATTE);                                    // chest, out of the hatch
  m.box(-4, -2, 5, -1, 2, 6, shadeInt(pal.main, 1.12), M_MATTE);                    // shoulders
  m.box(-5, -1, 2, -4, 1, 5, K.pack, M_MATTE);                                      // pack
  for (const y of [-3, 2]) { m.box(-3 + k, y, 4, 0 + k, y + 1, 5, sleeve, M_MATTE); m.box(0 + k, y < 0 ? -2 : 1, 4, 1 + k, y < 0 ? -1 : 2, 5, K.skin); }   // arms to the grips
  m.box(-3, -1, 6, -2, 1, 7, K.skin);                                               // neck
  m.ellipsoid(-2.5 + g, 0, 7.6, 1.5, 1.5, 1.4, K.skin);                             // face
  m.ellipsoid(-2.8 + g, 0, 8.4, 1.9, 1.9, 1.3, K.helm, M_MATTE);                    // helmet
  return m;
}
// Soviet APC: an eight-wheeled boat-hulled carrier with a pointed bow, sides sloping in above and below, side doors between
// the second and third axles; the small conical turret with its heavy MG is btrTurret.
function btrHull(pal) {
  const X0 = -15.5, X1 = 9.5, hw = 6.5, m = new VModel(X0 - 2, -hw - 2, X1 + 3, hw + 2, 12);
  for (const x of [-11.5, -7, 0, 4.5]) for (const y0 of [-hw, hw - 2]) {
    m.cylY(y0, y0 + 2, x, 2.7, 2.7, C.track, M_ROUGH);
    m.cylY(y0 < 0 ? y0 : y0 + 1, y0 < 0 ? y0 + 1 : y0 + 2, x, 2.7, 1.35, C.wheel, M_METAL);
  }
  solidV(m, X0, -hw, 2.5, X1, hw, 10, (x, y, z) => {
    const nose = x - 2;
    let w = hw - 1;
    if (z < 5) w -= (5 - z) * 0.7;
    if (z > 7.5) w -= (z - 7.5) * 1.1;
    if (nose > 0) w -= nose * 0.35;
    if (Math.abs(y) > w) return false;
    if (nose > 0 && z > 10 - nose * 0.55) return false;
    if (nose > 0 && z < 2.5 + nose * 0.75) return false;
    return x > X0 + (z > 8 ? 1 : 0);
  }, pal.main, M_METAL);
  for (const s of [-1, 1]) m.box(-5.5, s < 0 ? -hw + 0.6 : hw - 1.6, 4, -2.5, s < 0 ? -hw + 1.6 : hw - 0.6, 8, pal.dark, M_METAL);   // side doors
  m.box(4, -3, 9, 6, 3, 9.6, C.glass, M_GLASS);                                    // driver's ports
  m.box(-12, -3, 9.5, -8, -1, 10.2, pal.dark, M_METAL); m.box(-12, 1, 9.5, -8, 3, 10.2, pal.dark, M_METAL);   // roof hatches
  m.box(X0 + 0.5, -1, 3, X0 + 1.5, 1, 5, '#3a3a36', M_METAL);                     // water-jet
  m.line(-9, hw - 2, 10, -9, hw - 2, 14, C.black);
  m.box(7, -hw + 2, 6, 8, -hw + 3, 7, C.glow, M_GLASS); m.box(7, hw - 3, 6, 8, hw - 2, 7, C.glow, M_GLASS);
  return m;
}
function btrTurret(pal, frame) {
  const m = new VModel(-4, -4, 12, 4, 5), k = frame === 1 ? -1 : 0;
  m.cylZ(0, 0, 0, 1.5, 2.8, pal.main, M_METAL); m.cylZ(0, 0, 1.5, 2.5, 2.2, pal.main, M_METAL); m.cylZ(0, 0, 2.5, 3.5, 1.4, pal.dark, M_METAL);
  m.box(1 + k, -1, 1, 3 + k, 1, 3, pal.dark, M_METAL);                             // mantlet
  m.box(3 + k, 0, 1, 11 + k, 1, 2, C.gun, M_METAL); m.box(9 + k, -1, 1, 11 + k, 1, 3, C.gun, M_METAL);   // KPV and its flash hider
  m.box(1, 1, 2, 2, 2, 3, C.glass, M_GLASS);                                       // sight
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
// RAH-66 Comanche, after the real aircraft: stealth grey with a tint of the side's colour. A faceted body with a sharp chine
// (lighter above, darker below), a flat wedge nose with the long 20 mm chain gun under it, a big angular tandem canopy, a
// wide engine hump behind it with intakes either side and a tall rotor-hub fairing, a thick angular tail boom ending in a
// large round fan shroud (fenestron), and a tall fin above it carrying the T-tail with small end fins. Its missiles ride
// inside weapon bays in the lower sides: the doors hinge at the top and swing out to lie flat, a missile on each
// (`bay` 0 shut, 1 open, in BAY_STEPS). A five-blade rotor (art.js).
const BAY_STEPS = 2;
function comancheModel(pal, bay) {
  const m = new VModel(-27, -9, 18, 9, 15);
  const mix = (a, b, k) => {
    const A = rgbInt(a), B = rgbInt(b), ch = (s) => Math.round(((A >> s) & 255) * (1 - k) + ((B >> s) & 255) * k);
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
  };
  const body = mix('#4b4f52', pal.main, 0.32), lo = shadeInt(body, 0.72), hi = shadeInt(body, 1.18), edge = shadeInt(body, 0.55);
  const gun = C.gun, GL = '#2c4250', GLH = '#7fa3b8', HOLE = '#141618';
  // Body slices, nose to tail: half-width at the chine (z 3), floor and roof heights.
  for (let x = -7; x < 15; x++) {
    let hw, bot, top;
    if (x < 9) { hw = 3.6 - Math.max(0, x - 5) * 0.15; bot = 1; top = x < 1 ? 6 : 5; }
    else { const k = (x - 9) / 6; hw = 3 - k * 2.2; bot = 1 + k * 0.6; top = 4.6 - k * 2.2; }   // the wedge nose
    for (let z = Math.floor(bot); z < top; z++) {
      const w = Math.max(1, Math.round(hw - (z < 3 ? (3 - z) * 0.8 : (z - 3) * 0.6)));
      m.box(x, -w, z, x + 1, w, z + 1, z < 3 ? lo : z === 3 ? edge : body, M_METAL);   // a dark line along the chine
    }
  }
  // Canopy: the gunner's panes low at the front, the pilot's raised behind, sloping glass with frames.
  for (let x = 1; x < 10; x++) {
    const top = x < 5 ? 7.5 : 7.5 - (x - 5) * 0.55, w = x < 8 ? 2 : 1;
    m.box(x, -w, 5, x + 1, w, Math.max(5.5, top), GL, M_GLASS);
  }
  m.paint(1, -2, 5, 10, 2, 8, (x, y, z, c) => (c === rgbInt(GL) ? (x === 5 || x === 1 || z === 5 ? edge : (x + z) % 3 === 0 ? GLH : undefined) : undefined));
  // Engine hump and rotor-hub fairing.
  for (let x = -8; x < 2; x++) {
    const top = x < -5 ? 7 + (x + 8) * 0.5 : 8.5;
    m.box(x, -3, 6, x + 1, 3, top, body, M_METAL);
  }
  for (const y of [-4, 3]) { m.box(-3, y, 6, 1, y + 1, 8, body, M_METAL); m.box(0, y, 6, 1, y + 1, 7.5, HOLE); }   // intakes either side
  m.box(-9, -2, 6, -8, 2, 7, '#262624', M_METAL);                              // exhaust
  m.cylZ(0, 0, 8, 11, 1.8, hi, M_METAL);                                     // hub fairing
  m.cylZ(0, 0, 11, 12, 1.2, gun, M_METAL);
  // Chain gun under the nose: a small turret and a long barrel.
  m.ellipsoid(10.5, 0, 0.9, 1.3, 1.1, 0.9, gun, M_METAL);
  m.box(11, -1, 0, 18, 0, 1, gun, M_METAL);
  // Tail boom: thick and angular, tapering aft.
  for (let x = -21; x < -7; x++) {
    const k = (-7 - x) / 14, w = 2, z0 = 2 + Math.round(k), z1 = 6 - Math.round(k * 1.5);
    m.box(x, -w, z0, x + 1, w, z0 + 1, lo, M_METAL);
    m.box(x, -w, z0 + 1, x + 1, w, z1, body, M_METAL);
  }
  // The fan shroud: a big ring standing in line with the boom, the fan inside.
  const fx = -23.5, fz = 5;
  for (let x = -28; x < -18; x++) for (let z = 0; z < 11; z++) {
    const r = Math.hypot(x + 0.5 - fx, z + 0.5 - fz);
    if (r < 4.6) m.box(x, -2, z, x + 1, 2, z + 1, r < 3.1 ? HOLE : r < 3.6 ? edge : body, M_METAL);
  }
  m.paint(-28, -2, 0, -18, 2, 11, (x, y, z, c) => {                           // fan blades and hub
    const dx = x + 0.5 - fx, dz = z + 0.5 - fz, r = Math.hypot(dx, dz);
    if (r >= 3.1) return undefined;
    return r < 0.9 ? gun : Math.abs(dx) < 0.55 || Math.abs(dz) < 0.55 ? '#55585a' : undefined;
  });
  // Fin above the shroud, leaning back, and the T-tail with end fins.
  for (let z = 9; z < 13; z++) m.box(Math.round(-25 - (z - 9) * 0.5), -1, z, Math.round(-21 - (z - 9) * 0.5), 1, z + 1, body, M_METAL);
  m.box(-28, -6, 13, -24, 6, 14, body, M_METAL);
  for (const y of [-6, 5]) m.box(-28, y, 11, -25, y + 1, 15, edge, M_METAL);
  // Weapon bays in the lower sides (x -3 to 4).
  for (const s of [-1, 1]) {
    const yIn = s < 0 ? -4 : 3, yOut = s < 0 ? -5 : 4;                       // the side's last voxel at the chine and the first outside it
    if (bay <= 0) { m.paint(-3, yIn - s, 1, 5, yIn + 1, 4, (x) => (x === -3 || x === 4 ? edge : undefined)); continue; }   // shut: just the seams
    m.box(-3, s < 0 ? yIn : yIn - 1, 1, 5, s < 0 ? yIn + 2 : yIn + 1, 3, HOLE);   // open: the dark bay
    if (bay < 1) {                                                            // swinging out, half way
      m.box(-3, yOut, 2, 5, yOut + 1, 3, lo, M_METAL);
      m.box(-3, yOut + s, 1, 5, yOut + s + 1, 2, lo, M_METAL);
    } else {                                                                  // flat out from the hinge, a missile on its rail along each door
      m.box(-3, s < 0 ? yOut - 2 : yOut, 2, 5, s < 0 ? yOut + 1 : yOut + 3, 3, lo, M_METAL);
      for (const k of [0, 2]) {
        const y = yOut + s * k;
        m.box(-3, y, 3, 4, y + 1, 4, '#e2dfd2', M_METAL);
        m.set(4, y, 3, '#3a3c38', M_METAL);                                   // seeker
        m.set(-3, y, 3, '#8a8c84', M_METAL);                                  // fins
      }
    }
  }
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
// Chinook (Allied transport): a long boxy cabin with a rounded roof, a blunt glazed nose, a low pylon over the cockpit
// for the front rotor and a tall one at the tail for the rear rotor (the two rotors turn opposite ways: art.js ROTORS),
// fuel pods along the lower sides, a row of cabin windows, the loading ramp under the tail and four wheels.
function chinookModel(pal) {
  const m = new VModel(-23, -7, 21, 7, 16);
  const body = pal.main, dark = pal.dark, gun = C.gun, GL = '#5d8fb0', WIN = '#1d2226';
  for (let x = -19; x < 14; x++) {                                          // the cabin: flat sides, rounded roof
    m.box(x, -4, 1, x + 1, 4, 7, body, M_METAL);
    m.box(x, -3, 7, x + 1, 3, 8, body, M_METAL);
    m.box(x, -2, 8, x + 1, 2, 9, body, M_METAL);
  }
  for (let x = 14; x < 21; x++) {                                           // the nose, narrowing and lower toward the tip
    const k = (x - 14) / 7, w = Math.max(1, Math.round(4 - k * 2.4)), top = Math.round(8 - k * 4);
    m.box(x, -w, 1 + Math.round(k * 1.5), x + 1, w, top, body, M_METAL);
  }
  m.box(15, -3, 5, 19, 3, 8, GL, M_GLASS);                                  // cockpit glazing
  m.paint(15, -3, 5, 19, 3, 8, (x, y, z, c) => (c === rgbInt(GL) && (x === 17 || y === 0 || z === 5) ? dark : undefined));
  for (let x = 11; x < 17; x++) m.box(x, -2, 8, x + 1, 2, x < 13 ? 10 : 11, dark, M_METAL);   // front pylon
  m.cylZ(14, 0, 11, 12, 1.2, gun, M_METAL);                                 // front hub
  for (let x = -22; x < -11; x++) {                                         // rear pylon, rising to the tail
    const top = Math.min(14, 8 + Math.round((-11 - x) * 0.75));
    m.box(x, -2, 6, x + 1, 2, top, body, M_METAL);
  }
  m.box(-21, -2, 13, -15, 2, 14, dark, M_METAL);
  m.cylZ(-17, 0, 14, 15, 1.2, gun, M_METAL);                                // rear hub
  for (const s of [-1, 1]) {
    m.cylX(-11, 9, s * 4.6, 2.6, 1.6, dark, M_METAL);                        // fuel pods along the lower sides
    for (let x = -14; x < 10; x += 3) m.box(x, s < 0 ? -4.4 : 4, 5, x + 1, s < 0 ? -4 : 4.4, 6, WIN);   // cabin windows
    m.cylX(-14, -10, s * 2.6, 9, 1.0, '#3b3d36', M_METAL);                   // engines on the rear pylon's sides
    for (const x of [-8, 7]) m.box(x, s * 4.5 - (s < 0 ? 1 : 0), 0, x + 1, s * 4.5 + (s < 0 ? 0 : 1), 1, gun);   // wheels
  }
  for (let z = 1; z < 6; z++) m.box(-20 - (z > 3 ? 1 : 0), -3, z, -19, 3, z + 1, dark, M_METAL);   // the ramp
  m.paint(-19, -5, 1, 14, 5, 3, (x, y, z, c) => (c === rgbInt(body) && z === 2 ? shadeInt(body, 0.8) : undefined));   // a darker belly band
  return m;
}
// Halo (Soviet transport, after the Mi-26): a huge cabin with clamshell doors at the back, a deep glazed nose, two big
// turbines side by side on the roof before the eight-blade rotor (art.js ROTORS), a long tail boom with a swept fin and
// the tail rotor on its right, and fixed wheels. Camouflage of the side's colours, as on the Hind.
function haloModel(pal) {
  const m = new VModel(-33, -7, 23, 7, 17);
  const body = pal.main, dark = pal.dark, gun = C.gun, GL = '#5d8fb0', WIN = '#1d2226';
  for (let x = -12; x < 16; x++) {                                          // the cabin: tall, with a rounded roof
    const tail = x < -8 ? (-8 - x) : 0;
    m.box(x, -5, 1 + tail, x + 1, 5, 8, body, M_METAL);
    m.box(x, -4, 8, x + 1, 4, 9, body, M_METAL);
    m.box(x, -3, 9, x + 1, 3, 10, body, M_METAL);
  }
  for (let x = 16; x < 23; x++) {                                           // the deep nose
    const k = (x - 16) / 7, w = Math.max(1, Math.round(5 - k * 3)), top = Math.round(9 - k * 5);
    m.box(x, -w, 1 + Math.round(k * 2), x + 1, w, top, body, M_METAL);
  }
  m.box(16, -4, 5, 21, 4, 9, GL, M_GLASS);                                  // the glazing, two rows
  m.paint(16, -4, 5, 21, 4, 9, (x, y, z, c) => (c === rgbInt(GL) && (x === 18 || y === 0 || z === 7) ? dark : undefined));
  m.box(14, -2, 1, 22, 2, 3, GL, M_GLASS);                                  // the navigator's chin window
  for (const y of [-2.6, 2.6]) {
    m.cylX(-3, 11, y, 11.2, 1.7, body, M_METAL);                            // turbines
    m.cylX(11, 12, y, 11.2, 1.3, '#1b1b1a');                                // intakes
    m.cylX(-5, -3, y * 1.3, 11, 1.2, '#262624', M_METAL);                   // exhausts
  }
  m.box(-2, -3, 10, 6, 3, 12, dark, M_METAL);                               // gearbox fairing
  m.cylZ(1, 0, 12, 15, 1.5, gun, M_METAL);                                  // mast
  for (let x = -31; x < -12; x++) m.cylX(x, x + 1, 0, 7.5, 1.9 - (-12 - x) * 0.04, body, M_METAL);   // tail boom
  for (let z = 7; z < 15; z++) m.box(Math.round(-31 - (z - 7) * 0.3), 0, z, Math.round(-27 - (z - 7) * 0.35), 1, z + 1, dark, M_METAL);   // swept fin
  m.box(-30, -5, 7, -27, 5, 8, dark, M_METAL);                              // stabiliser
  m.cylY(1, 2, -31.5, 12, 3, gun, M_METAL);                                 // tail rotor, on the right
  for (const s of [-1, 1]) {
    for (let x = -8; x < 14; x += 3) m.box(x, s < 0 ? -5.4 : 5, 5, x + 1, s < 0 ? -5 : 5.4, 7, WIN);   // cabin windows
    m.box(-12, s < 0 ? -5 : 4, 1, -11, s < 0 ? -4 : 5, 8, dark, M_METAL);   // clamshell door seams
    m.box(-2, s < 0 ? -6.5 : 5.5, 0, 2, s < 0 ? -5.5 : 6.5, 2, gun);        // main wheels on struts
  }
  m.box(16, -1, 0, 17, 1, 1, gun);                                          // nose wheel
  m.paint(-14, -6, 1, 16, 6, 11, (x, y, z, c) => (c === rgbInt(body) && hash3(x >> 2, (y + 8) >> 2, z >> 2) > 0.66 ? shadeInt(body, 0.74) : undefined));   // camouflage
  return m;
}
// The Allied Spy Plane, after the Lockheed SR-71 Blackbird: a needle nose with broad, flat chines that flare out in a
// long curve into a thin delta wing; two huge engine nacelles at mid-span reaching well ahead of the wing, each with a
// long pointed inlet spike; tall fins on top of the nacelles' rear, canted in toward the body; the tail cone past the
// trailing edge. Matt charcoal with thin red walkway lines on the wing, the fin tips in the side's colour.
function sr71Model(pal) {
  const m = new VModel(-22, -12, 22, 12, 12);
  const body = '#2e3035', edge = '#5b5f67', under = '#1d1f22', glass = '#38495a', red = '#c0462c', cz = 3, NY = 5.5;
  const inY = (y, w) => Math.abs(y + 0.5) < w;
  // The flat planform at wing height: chines (an ogive from the nose tip), the inner wing out to the nacelles, the outer wing.
  for (let x = -18; x <= 21; x++) for (let y = -12; y < 12; y++) {
    const a = Math.abs(y + 0.5);
    let w;
    if (x > -2) w = 4.6 * Math.pow((21.5 - x) / 23.5, 0.62);           // chine
    else if (x >= -17) w = NY;                                          // inner wing, fuselage to nacelle
    else w = 0;
    let on = a < w;
    if (!on && a >= NY && a < 11.5) {                                   // outer wing: swept leading edge, straight trailing edge, cut tips
      const lead = -1 - (a - NY) * 1.6, trail = -17 + Math.max(0, (a - 10) * 1.2);
      on = x <= lead && x >= trail;
    }
    if (!on) continue;
    const rim = !(a + 1 < w) && x > -2 || (a >= NY && x > -1 - (a + 1 - NY) * 1.6) || a >= 11;
    m.set(x, y, cz, rim ? edge : body, M_METAL);
    if (x > -2 && a < w * 0.55) m.set(x, y, cz - 1, under, M_METAL);   // the chines thicken toward the body
  }
  for (let x = -21; x <= 21; x++) {                                     // fuselage: needle nose, pointed tail cone
    const r = x > 13 ? Math.max(0.35, 1.45 - (x - 13) * 0.14) : x < -16 ? Math.max(0.4, 1.45 - (-16 - x) * 0.21) : 1.45;
    m.cylX(x, x + 1, 0, cz + 0.4, r, body, M_METAL);
  }
  m.ellipsoid(13.2, 0, cz + 1.6, 2.6, 0.95, 0.9, glass, M_GLASS);      // tandem cockpit
  m.box(13, -1, cz + 2, 14, 1, cz + 3, body, M_METAL);                  // the frame between the two seats
  for (const sgn of [-1, 1]) {
    const y = sgn * NY;
    m.cylX(-19, 2, y, cz, 2.05, body, M_METAL);                          // nacelle
    m.cylX(1, 2, y, cz, 2.05, '#111214');                                // the inlet ring
    for (let x = 2; x < 11; x++) m.cylX(x, x + 1, y, cz, Math.max(0.3, 1.45 - (x - 2) * 0.14), x < 4 ? edge : body, M_METAL);   // spike
    m.cylX(-20, -19, y, cz, 1.7, '#141416');                              // exhaust
    m.cylX(-19, -18, y, cz, 2.05, under, M_METAL);
    for (let z = cz + 2; z < 12; z++) {                                   // fin, swept and canted in
      const lead = Math.round(-10 - (z - 5) * 0.75), trail = Math.round(-18 - (z - 5) * 0.15), fy = Math.round(y - sgn * (z - 5) * 0.32) - (sgn < 0 ? 1 : 0);
      for (let x = trail; x <= lead; x++) m.set(x, fy, z, z === 11 ? pal.main : body, M_METAL);
    }
    // Red walkway lines on the inner wing (the photo's "no step" outlines).
    const yi = sgn < 0 ? -5 : 2, yo = sgn < 0 ? -3 : 4;
    for (let x = -15; x <= -4; x++) { m.set(x, sgn < 0 ? -5 : 4, cz, red, M_METAL); }
    for (let yy = Math.min(yi, yo); yy <= Math.max(yi, yo); yy++) { m.set(-15, yy, cz, red, M_METAL); m.set(-4, yy, cz, red, M_METAL); }
    for (let x = -15; x <= -4; x++) m.set(x, sgn < 0 ? -3 : 2, cz, red, M_METAL);
  }
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
// The V2 launcher: a truck with the rocket on an erector rail. up 0 to 1: lying flat on the bed (driving) to raised for
// firing (V2_RAISE radians), pivoting on the rail's rear end; V2_STEPS + 1 looks (hullSprite rounds u.setup).
const V2_RAISE = 0.85, V2_STEPS = 3;
function v2Model(pal, loaded, up = 0) {
  const m = new VModel(-14, -8, 14, 8, 26);
  for (const x of [-8, -3, 7]) for (const y of [-5, 4]) m.cylY(y, y + 1.6, x, 2.4, 2.4, C.track);          // wheels
  m.box(-11, -4, 2, 11, 4, 4, pal.dark, M_METAL);                                 // chassis
  m.box(5, -4, 4, 11, 4, 9, pal.main, M_METAL);                                   // cab
  m.box(9, -3, 7, 11, 3, 9, C.glass, M_GLASS);
  m.box(-11, -4, 4, 4, 4, 6, pal.main, M_METAL);                                  // bed
  const RAIL = '#3d3f38', th = up * V2_RAISE, cx = Math.cos(th), cz = Math.sin(th), px = -11, pz = 6.4, L = 15.5;
  const at = (s, off) => [px + s * cx - off * cz, pz + s * cz + off * cx];         // along the rail s, off above it
  m.box(-12, -2, 4, -10, 2, 7, RAIL, M_METAL);                                    // the pivot bracket at the rear
  for (const y of [-1, 0.6]) { const [x0, z0] = at(0, 0), [x1, z1] = at(L - 1, 0); m.line(x0, y, z0, x1, y, z1, RAIL, M_METAL); }   // the rail
  if (up > 0) {   // the ram that lifts it, from the bed to the rail's middle
    const [x1, z1] = at(L * 0.55, 0);
    for (const y of [-1.5, 1]) m.line(-1, y, 6, x1, y, z1, '#55574e', M_METAL);
  } else m.box(-2, -2, 6, 0, 2, 7, RAIL, M_METAL);                                // a cradle under the rocket
  if (loaded) {
    for (let s = 0; s <= L; s += 0.35) {
      const [x, z] = at(s, 1.9);
      m.ellipsoid(x, 0, z, 1.6, 1.6, 1.6, s > L - 2.5 ? C.red : s > L - 4.5 ? '#c9c7bd' : '#7d8650', M_METAL);   // body, band, warhead
    }
    { const [x, z] = at(L + 0.9, 1.9); m.ellipsoid(x, 0, z, 0.9, 0.9, 0.9, C.red, M_METAL); }   // nose
    for (const [y, off] of [[-2.8, 1.9], [2.8, 1.9], [0, 4.6]]) {   // fins
      const [x0, z0] = at(0, off), [x1, z1] = at(3, off);
      m.line(x0, y, z0, x1, y, z1, '#5a6238', M_METAL);
    }
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
function il76Model(pal, a50) {
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
  m.box(-24, -1, 6, -22, 1, 8, a50 ? dark : C.glass, a50 ? M_METAL : M_GLASS);   // tail gunner's glazing (the A-50's is faired over)
  // Nose: a tapering cone, the navigator's glazing low at the tip, the radar chin under it, cockpit glazing on top.
  m.ellipsoid(15, 0, 4.2, 5.5, 3.3, 3.2, body, M_METAL);
  if (a50) {                                                                      // A-50: a solid nose and a refuelling probe
    m.ellipsoid(19, 0, 4, 2.2, 1.9, 1.7, body, M_METAL);
    m.box(19, -1, 6, 23, 0, 7, dark, M_METAL);
  } else m.ellipsoid(19, 0, 3.6, 2.2, 1.9, 1.6, C.glass, M_GLASS);
  m.ellipsoid(16, 0, 1.4, 3, 2.2, 1.3, dark, M_METAL);
  m.paint(14, -4, 5, 19, 4, 8, (x, y, z) => (x >= 15 && x <= 17 && (z === 6 || (z === 5 && x === 17)) && Math.abs(y + 0.5) < 3 - (x - 15) * 0.5) ? C.glass : undefined);
  // Main gear fairings, a row of windows and the paratroop doors.
  for (const y of [-3.4, 3.4]) m.ellipsoid(0, y, 2.3, 7, 1.4, 1.7, hull, M_METAL);
  if (!a50) {
    for (let x = -6; x < 13; x += 3) { m.set(x, -4, 5, C.glass, M_GLASS); m.set(x, 3, 5, C.glass, M_GLASS); }
    m.box(-15, -3, 3, -13, -2, 6, dark, M_METAL); m.box(-15, 2, 3, -13, 3, 6, dark, M_METAL);
  } else for (const x of [8, 11]) { m.set(x, -4, 5, C.glass, M_GLASS); m.set(x, 3, 5, C.glass, M_GLASS); }   // a few crew windows
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
  if (a50) {
    // The Beriev A-50's radar: a big flat rotodome on two raked struts over the rear fuselage, pale with a dark rim
    // and dark radome panels, the side's colour in a band across the top.
    const cx = -8, R = 6.8, z0 = 12, pale = mixHex(body, '#d8dad4', 0.6), rim = shadeInt(body, 0.55);
    for (let z = 8; z < z0; z++) {                                                // struts lean back as they rise
      const x = Math.round(-5 - (z - 8) * 0.9);
      m.box(x - 1, -2, z, x + 1, -1, z + 1, hull, M_METAL); m.box(x - 1, 1, z, x + 1, 2, z + 1, hull, M_METAL);
    }
    for (let x = Math.floor(cx - R); x <= cx + R; x++) for (let y = Math.floor(-R); y <= R; y++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5);
      if (d > R) continue;
      const edge = d > R - 1.2, panel = Math.abs(y + 0.5) < 1 ? pal.main : (d > R * 0.45 && d < R * 0.78 && Math.abs(y + 0.5) > 2.5) ? shadeInt(pale, 0.72) : pale;
      m.set(x, y, z0, edge ? rim : shadeInt(pale, 0.86), M_METAL);
      if (d < R - 0.6) m.set(x, y, z0 + 1, edge ? rim : panel, M_METAL);
    }
  }
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

// Close air support planes (POWERS.cas). The Allied A-10 Warthog: a long, slim body with the 30 mm cannon's barrels poking out of the
// nose, a bubble canopy well forward, straight, thick wings set low with missiles under them, two big engine pods high on the rear body,
// and a low tailplane with a fin at each end (the fins in the side's colour). Grey-green.
function a10Model(pal) {
  const m = new VModel(-18, -16, 20, 16, 11);
  const body = mixHex(pal.main, '#7b8478', 0.75), hull = shadeInt(body, 0.85), dark = shadeInt(body, 0.62), lite = shadeInt(body, 1.1);
  for (let x = -16; x < 16; x++) {                                                  // fuselage, tapering at the tail and to a blunt nose
    const r = x > 10 ? 1.9 - (x - 10) * 0.18 : x < -9 ? 1.9 - (-9 - x) * 0.13 : 1.9;
    m.cylX(x, x + 1, 0, 3.2, r, x > 12 ? hull : body, M_METAL);
  }
  m.box(-14, -0.5, 4.4, 8, 0.5, 5, lite, M_METAL);                                  // spine
  m.box(15, -0.5, 2, 19, 0.5, 3, '#2a2a28', M_METAL);                               // the cannon's barrels
  m.set(19, 0, 2, '#141413');
  m.ellipsoid(10, 0, 4.6, 2.6, 1.3, 1.2, C.glass, M_GLASS);                         // bubble canopy
  m.set(10, 0, 5, '#9fd2f2', M_GLASS);
  for (let k = 1; k <= 15; k++) {                                                   // straight wings, slightly tapered, low on the body
    const lead = 3 - Math.round(k * 0.08), trail = -4 + Math.round(k * 0.12);
    for (const sgn of [-1, 1]) {
      const y = sgn < 0 ? -k - 1 : k;
      for (let x = trail; x <= lead; x++) m.set(x, y, 2, k >= 14 ? pal.main : x === trail ? hull : body, M_METAL);
    }
  }
  for (const y of [-6, -9, 5, 8]) { m.box(-2, y, 1, 3, y + 1, 2, '#c8c6bc', M_METAL); m.set(3, y, 1, '#5a5850'); }   // missiles under the wings
  for (const y of [-3.6, 3.6]) {                                                    // engine pods high on the rear body
    m.cylX(-12, -4, y, 6, 1.7, hull, M_METAL);
    m.cylX(-4, -3, y, 6, 1.7, '#1b1b1a');                                           // intake
    m.cylX(-13, -12, y, 6, 1.2, '#2a2a28', M_METAL);                                // exhaust
    m.box(-10, y < 0 ? -2.5 : 1.5, 4, -6, y < 0 ? -1.5 : 2.5, 6, body, M_METAL);      // pylon to the body
  }
  for (let y = -7; y <= 6; y++) m.box(-17, y, 3.5, -13, y + 1, 4.2, body, M_METAL);   // tailplane
  for (const y of [-7, 6]) for (let z = 3; z < 9; z++) {                            // a fin at each end
    const lead = -13 - Math.round((z - 3) * 0.3), trail = -17;
    m.box(trail, y, z, lead + 1, y + 1, z + 1, z > 7 ? pal.dark : pal.main, M_METAL);
  }
  m.paintTop(-12, 0, 8, 1, (x) => (x % 4 === 0 ? dark : undefined));
  return m;
}
// The Soviet Su-25 Frogfoot: a slim body with a pointed nose, a framed canopy, long engine nacelles along both sides of the body under
// shoulder-mounted, gently swept wings with missiles on pylons, a single tall fin and low tailplanes. Camouflage green and sand.
function su25Model(pal) {
  const m = new VModel(-17, -16, 19, 16, 11);
  const body = mixHex(pal.main, '#7d8a5c', 0.7), sand = mixHex(pal.main, '#a8956a', 0.7), hull = shadeInt(body, 0.85), dark = shadeInt(body, 0.62);
  for (let x = -15; x < 18; x++) {                                                  // fuselage with a long, pointed nose
    const r = x > 8 ? Math.max(0.45, 1.6 - (x - 8) * 0.12) : x < -10 ? 1.6 - (-10 - x) * 0.15 : 1.6;
    m.cylX(x, x + 1, 0, 3.4, r, x > 15 ? dark : (x >> 2) % 2 ? body : sand, M_METAL);
  }
  m.box(16, -0.5, 1.8, 19, 0.5, 2.6, '#2a2a28', M_METAL);                          // the twin cannon under the nose
  m.ellipsoid(8.5, 0, 4.8, 2.4, 1.1, 1.1, C.glass, M_GLASS);                        // canopy
  m.set(8, 0, 5, hull, M_METAL);
  for (const y of [-2.7, 2.7]) {                                                    // engine nacelles along the body
    m.cylX(-13, 5, y, 2.9, 1.5, hull, M_METAL);
    m.cylX(5, 6, y, 2.9, 1.5, '#1b1b1a');                                           // intakes
    m.cylX(-14, -13, y, 2.9, 1.1, '#2a2a28', M_METAL);                              // exhausts
  }
  for (let k = 3; k <= 15; k++) {                                                   // shoulder wings, gently swept and tapered
    const lead = 3 - Math.round((k - 3) * 0.32), trail = -4 - Math.round((k - 3) * 0.1);
    for (const sgn of [-1, 1]) {
      const y = sgn < 0 ? -k - 1 : k;
      for (let x = trail; x <= lead; x++) m.set(x, y, 4, k >= 14 ? pal.main : x === trail ? hull : (k >> 2) % 2 ? sand : body, M_METAL);
    }
  }
  for (const y of [-7, -10, 6, 9]) { m.box(-3, y, 2, 2, y + 1, 3, '#c8c6bc', M_METAL); m.set(2, y, 2, '#5a5850'); m.set(0, y, 3, hull, M_METAL); }   // missiles on pylons
  for (let k = 1; k <= 6; k++) for (const sgn of [-1, 1]) {                         // low tailplanes
    const y = sgn < 0 ? -k - 1 : k;
    m.box(-16, y, 3, -12 - Math.round(k * 0.3), y + 1, 4, body, M_METAL);
  }
  for (let z = 4; z < 11; z++) {                                                    // a single tall swept fin
    const lead = -9 - Math.round((z - 4) * 0.8), trail = -16 + Math.round((z - 4) * 0.2);
    m.box(trail, 0, z, lead + 1, 1, z + 1, z > 9 ? pal.dark : pal.main, M_METAL);
  }
  starTop(m, -2.5, 11, 2.2, pal.main); starTop(m, -2.5, -11, 2.2, pal.main);
  return m;
}

// ---------------------------------------------------------------------------
// Infantry: 16 facings x 3 frames (standing, two walking poses)
// ---------------------------------------------------------------------------
// Frames: 0 standing, 1-2 walking, 3 throwing, 4 crouching, 5 prone, then the idle poses:
// 6 at rest (weapon shouldered or grounded), 7 aiming down the sights, 8-9 push-ups (up, down),
// 10 stretching, 11 RedEye at the shoulder, 12-13 the passing poses of the walk (one foot off the
// ground), 14-15 crawling.
function infModel(pal, faction, type, frame) {
  if (type === 'hmg') return hmgModel(pal, faction, frame);
  if (frame === 5 || frame === 14 || frame === 15) return proneModel(pal, faction, type, frame === 5 ? 0 : frame - 13);
  if (frame === 4) return crouched(infModel(pal, faction, type, 0));
  if (frame === 8 || frame === 9) return pushupModel(pal, faction, type, frame === 8);
  // A stocky figure in the side's colour from boots to collar, so a squad reads as one colour
  // at a glance: thick legs, a broad chest, a big helmet and a pack on the back.
  const m = new VModel(-9, -7, 12, 7, frame === 11 ? 30 : 22);
  const sov = faction === 'soviets', sovRk = sov && type === 'rocket';
  const step = frame === 1 ? 1.5 : frame === 2 ? -1.5 : 0, throwing = frame === 3;
  const pose = frame === 6 ? 'rest' : frame === 7 ? 'aim' : frame === 10 ? 'stretch' : frame === 11 ? 'sam' : null;
  const TC = type === 'technician';   // Technician: a civilian in a shirt of the side's colour, work trousers, bare-headed, a pistol
  const K = TC ? { ...infKit(pal, faction), pants: '#3e4d66' } : infKit(pal, faction), tunic = pal.main, sleeve = shadeInt(pal.main, 0.84), hi = shadeInt(pal.main, 1.12);
  const R = type === 'rifle', wood = '#6a4426';
  const E = type === 'engineer', vest = '#5a6b3a';   // Engineer: an olive tactical vest with pouches, knee pads, a toolbox, no weapon   // Rifle Infantry: long coat, shoulder plates, knee pads, hip satchel, wooden-furniture rifle
  // Boots and trousers, legs apart with a gap between them, swinging when walking.
  for (const [y0, s, up] of [[-3, step, frame === 12 ? 1 : 0], [1, -step, frame === 13 ? 1 : 0]]) {
    m.box(s - 1, y0, up, s + 2, y0 + 2, 2 + up, C.black);
    m.box(s + 1, y0, up, s + 3, y0 + 2, 1 + up, C.black);                         // toe caps
    m.box(s - 1, y0, 2 + up, s + 2, y0 + 2, 8, K.pants);
    m.box(s + 1, y0, 5, s + 2, y0 + 2, 6, shadeInt(K.pants, 0.82));                // knee crease
    if (R) { m.box(s + 2, y0, 4, s + 3, y0 + 2, 7, shadeInt(K.pants, 1.3), M_METAL); m.box(s - 1, y0, 2, s + 2, y0 + 2, 3, shadeInt(K.pants, 0.7)); }   // knee pad, boot tops
    if (E) m.box(s + 2, y0, 4, s + 3, y0 + 2, 6, '#3b3f3a', M_METAL);                // dark knee pads
  }
  m.box(-1, -1, 6, 2, 1, 8, K.pants);                                               // seat
  // Belt with pouches and buckle.
  m.box(-2, -3, 8, 2, 3, 9, K.web);
  if (!TC) for (const y of [-3, 2]) m.box(1, y, 8, 3, y + 1, 10, K.pouch);
  m.set(2, 0, 8, '#c9a227', M_METAL);
  if (R) {
    m.box(-2, -3, 6, 2, 3, 8, shadeInt(tunic, 0.88));                              // coat skirt over the hips
    m.box(-1, 4, 6, 2, 5, 9, K.pouch); m.box(-1, 4, 8, 2, 5, 9, shadeInt(K.pouch, 1.25));   // satchel on the right hip
  }
  // Tunic: broad chest and shoulders, a lit front panel, the collar.
  m.box(-2, -3, 9, 2, 3, 14, tunic);
  m.box(1, -2, 9, 2, 2, 13, hi);
  m.box(-2, -4, 12, 2, 4, 14, tunic);                                               // shoulders
  if (TC) { m.set(2, -2, 12, '#e8e4d8'); m.set(2, -2, 13, '#2a2a24'); }   // a breast pocket with a pen
  else m.paint(-2, -3, 9, 2, 3, 14, (x, y, z) => (x === 1 && y === z - 12) ? K.web : undefined);   // strap across the chest
  m.box(-1, -1, 14, 2, 2, 14.5, shadeInt(tunic, 0.72));                             // collar
  if (R) {
    m.box(-2, -2, 14, 3, 3, 15, shadeInt(tunic, 0.8));                              // high turned-up collar
    for (const y of [-5, 4]) { m.box(-2, y, 13, 2, y + 1, 15, shadeInt(tunic, 1.25), M_METAL); m.box(-1, y, 15, 1, y + 1, 16, shadeInt(tunic, 1.1), M_METAL); }   // shoulder plates
    m.box(2, -2, 10, 3, 0, 12, K.pouch); m.box(2, 1, 10, 3, 2, 12, K.pouch);        // chest ammo pouches
  }
  if (E) {
    m.box(-2, -3, 9, 2, 3, 13, vest);                                               // the vest over the tunic, shoulders left in the side's colour
    m.box(2, -2, 11, 3, 2, 13, shadeInt(vest, 1.15));                               // chest plate
    for (const y of [-3, -1, 1]) m.box(2, y, 9, 3, y + 2, 11, shadeInt(vest, y === -1 ? 0.78 : 0.88));   // a row of pouches
    m.set(2, -2, 12, '#e8e4d8'); m.set(2, -1, 12, '#c8281e');                       // name tape and a red tab
    m.box(-3, -3, 9, -2, 3, 13, shadeInt(vest, 0.8));                               // back panel
  }
  // Arms, by pose.
  const hand = (x, y, z) => m.set(x, y, z, K.skin);
  if (pose === 'stretch') {
    for (const y of [-4, 3]) { m.box(-1, y, 12, 1, y + 1, 20, sleeve); hand(0, y, 20); hand(0, y, 21); }
  } else if (pose === 'rest') {
    m.box(-1, -4, 9, 1, -3, 14, sleeve); hand(0, -4, 8);
    if (type === 'grenadier' || type === 'pilot' || TC || E) { m.box(-1, 3, 9, 1, 4, 14, sleeve); hand(0, 3, 8); }
    else { m.box(-1, 3, 11, 1, 4, 14, sleeve); m.box(1, 3, 11, 2, 4, 12, sleeve); hand(2, 4, 11); }
  } else if (pose === 'aim') {
    m.box(-1, -4, 12, 5, -3, 13, sleeve); m.box(-1, 3, 12, 2, 4, 13, sleeve); m.box(1, 1, 12, 2, 3, 13, sleeve);
    hand(5, -3, 12); hand(2, 0, 12);
  } else if (type === 'grenadier') {
    m.box(-2, 3, 10, 1, 4, 14, sleeve); m.box(1, 3, 10, 2, 4, 11, sleeve); hand(2, 3, 10);
    if (throwing) { m.box(-2, -4, 13, 0, -3, 20, sleeve); hand(-2, -4, 20); m.box(-3, -5, 20, -1, -3, 22, '#3f4a2a'); }
    else { m.box(-2, -4, 9, 1, -3, 14, sleeve); hand(0, -4, 9); m.box(0, -5, 8, 2, -4, 9.5, '#3f4a2a'); }
  } else if (type === 'rocket' || type === 'hmgG') {
    m.box(-1, 3, 12, 1, 4, 14, sleeve); m.box(1, 3, 13, 3, 4, 14, sleeve); hand(3, 3, 14);      // right hand up on the grip
    m.box(-2, -4, 10, 1, -3, 14, sleeve); m.box(1, -4, 10, 3, -3, 11, sleeve); hand(3, -3, 10); // left hand steadying it
  } else if (type === 'pilot' || TC || E || type === 'hmgL') {
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
  } else if (E) {
    m.box(-5, -2, 9, -3, 3, 13, K.pack); m.box(-5, -2, 12, -3, 3, 13, shadeInt(K.pack, 0.8));   // a slim tool pack
    m.box(-6, 0, 9, -5, 1, 15, '#8a8f94', M_METAL); m.box(-6, -1, 14, -5, 2, 15, '#8a8f94', M_METAL);   // a spanner strapped to it
  } else if (type === 'flamer') {
    // Two tall fuel tanks on a back frame, a red band near the top of each, a pressure bottle between them.
    for (const y of [-2, 2]) { m.cylZ(-5, y, 7, 16, 1.6, '#4d5232', M_METAL); m.cylZ(-5, y, 14, 15, 1.7, '#a8261c', M_METAL); m.ellipsoid(-5, y, 16.3, 1.4, 1.4, 0.8, '#3c4028', M_METAL); }
    m.cylZ(-6, 0, 9, 14, 0.8, '#8a8f94', M_METAL);
    m.box(-3, -3, 8, -2, 3, 9, K.web);                                              // frame
  } else if (type === 'spec') {
    // The Specialist: two satchel charges on his back (khaki bricks with a strap and a red detonator), a radio aerial.
    for (const y of [-3, 1]) { m.box(-5, y, 8, -2, y + 2, 13, '#8a7a4a'); m.box(-5, y, 12, -3, y + 2, 13, '#6e6038'); m.set(-5, y + 1, 10, '#c8281e', M_METAL); }
    m.box(-6, -3, 10, -5, 3, 11, K.web);
    m.line(-4, -2, 13, -6, -3, 20, '#2a2a24', M_METAL);
  } else if (TC) {
    // no pack
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
  if (type === 'spec') {
    // A beret pulled to one side (Allies green, Soviets maroon) over dark glasses: no helmet, so he stands out in a squad.
    const ber = sov ? '#7a1e24' : '#2f5a2a';
    m.box(-2, -2, 17, 2, 3, 18, ber); m.box(-1, -3, 17, 1, 1, 18.5, shadeInt(ber, 1.15)); m.box(-2, -3, 18, 0, 0, 19, ber);
    m.set(2, 2, 17, '#d8c070', M_METAL);   // cap badge
    m.box(2, -1, 15, 3, 2, 16, '#1a1c1e', M_GLASS);   // dark glasses
  } else if (type === 'sniper') {
    // A soft boonie hat with a wide floppy brim and scraps of scrim, the face streaked with camouflage paint.
    const hat = '#6b6a42';
    m.box(-3, -3, 16, 4, 4, 17, shadeInt(hat, 0.85)); m.box(-2, -2, 17, 3, 3, 19, hat);
    m.set(-3, 2, 17, '#4f5a33'); m.set(2, -3, 17, '#7a6e46'); m.set(0, 3, 18, '#4f5a33');
    m.set(1, -1, 15, '#4a5230'); m.set(1, 1, 15, '#4a5230');
  } else if (type === 'flamer') {
    m.ellipsoid(0.5, 0.5, 17, 2.5, 2.5, 2.2, K.helm, M_METAL);                                 // steel helmet
    m.clear(1, -1, 14, 3, 2, 16.5);
    m.box(-2, -2, 15, 0, 3, 16, shadeInt(K.helm, 0.75), M_METAL);
    m.box(2, -1, 14, 3, 2, 17, '#3a3d34');                                                      // gas mask over the face
    m.set(3, -1, 16, '#9fc4c8', M_GLASS); m.set(3, 1, 16, '#9fc4c8', M_GLASS);                  // eyepieces
    m.box(3, 0, 14, 4, 1, 15, '#2a2c26');                                                       // filter
  } else if (type === 'grenadier') {
    m.box(-2, -2, 16, 2, 3, 18, '#5d6236'); m.box(-1, -1, 18, 2, 2, 18.5, '#5d6236');
    m.box(2, -2, 16, 3, 3, 16.5, '#474a28'); m.set(2, 0, 17, '#c8281e');                       // field cap, red star
  } else if (TC) {
    m.box(-2, -2, 16, 1, 3, 18, '#4a3a2a'); m.box(-1, -1, 18, 1, 2, 18.5, '#4a3a2a'); m.box(1, -2, 17, 2, 3, 18, '#4a3a2a');   // short hair, no helmet
    m.box(3, 2, 10, 6, 3, 11, C.gun, M_METAL);                                                 // pistol
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
  if (E) {
    for (const y of [-5, 4]) m.set(0, y, 13, '#c8281e');                             // red shoulder patches
    // The toolbox: carried in the right hand, set down at the feet when stretching.
    const tz = pose === 'stretch' ? 0 : 4;
    m.box(-2, 4, tz, 3, 6, tz + 3, '#c8961e'); m.box(-2, 4, tz + 3, 3, 6, tz + 4, '#e6ba42');
    m.set(0, 6, tz + 2, '#2a2a24');                                          // latch
  }
  // Weapons.
  const RIF = !['rocket', 'grenadier', 'pilot', 'technician', 'engineer', 'hmgG', 'hmgL', 'flamer'].includes(type), SN = type === 'sniper';
  const tube = sovRk ? '#5f6a3c' : '#c3c4b8', tubeD = sovRk ? '#2f3520' : '#5d5f58';   // Soviet: olive RPG-style launcher
  if (pose === 'stretch') {                                                  // slung on the back
    if (type === 'rocket') { m.cylY(-6, 6, -6, 13, 1.4, tube); m.box(-7, 5, 12, -5, 6, 15, tubeD); }
    else if (RIF) { m.line(-6, -2, 6, -6, 2, 16, C.gun, M_METAL); m.box(-7, -3, 5, -5, -1, 8, '#6a4426'); }
  } else if (pose === 'rest') {
    if (type === 'rocket') { m.box(2, 4, 0, 4, 6, 13, tube); m.box(2, 4, 12, 4, 6, 14, tubeD); }   // launcher stood on the ground
    else if (RIF) { m.box(1, 4, 10, 2, 5, 21, C.gun, M_METAL); m.box(1, 4, 8, 2, 5, 12, '#6a4426'); }   // rifle on the shoulder
  } else if (pose === 'aim' && SN) {   // the long rifle at the shoulder, eye to the scope
    m.box(2, -1, 13, 17, 0, 14, C.gun, M_METAL); m.box(-1, -1, 12, 4, 0, 14, '#4f5a33'); m.box(5, -1, 11, 6, 0, 13, C.gun, M_METAL);
    m.box(3, -1, 14, 9, 0, 15.5, '#1f211c', M_METAL); m.set(9, -1, 15, '#7fb0c8', M_GLASS);   // scope
  } else if (pose === 'aim' && RIF) {
    m.box(2, -1, 13, R ? 13 : 11, 0, 14, C.gun, M_METAL); m.box(-1, -1, 12, 3, 0, 14, wood); m.box(5, -1, 11, 6, 0, 13, C.gun, M_METAL);
    if (R) m.box(5, -1, 13, 9, 0, 14, wood);                                  // wooden handguard
  } else if (pose === 'sam') {
    // The anti-air launcher, on the right shoulder pointed up at the sky: a thick tube (3 voxels, so it reads at the
    // 65% infantry size) along the line A (rear) to F (front), with flared ends and the parts that make each side's
    // silhouette. Allies, Stinger-style: olive drab with a yellow band, a big square IFF antenna standing up off the
    // left side, the gripstock and its battery under the middle, a sight frame on the right. Soviets, Igla-style:
    // green with a red band, a needle spike on the nose, a long thermal battery forward under the grip, a sight box on the left.
    const A = [-7.5, 3.5, 11], F = [10.5, 3.5, 26];
    const dx = F[0] - A[0], dz = F[2] - A[2], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;   // along the tube; (uz, -ux) points under it
    const at = (k, under = 0, side = 0) => [A[0] + dx * k + uz * under, A[1] + side, A[2] + dz * k - ux * under];
    // a solid capsule from P to Q of radius r, coloured by col(t) along it
    const seg = (P, Q, r, col, mat) => {
      const ex = Q[0] - P[0], ey = Q[1] - P[1], ez = Q[2] - P[2], ll = ex * ex + ey * ey + ez * ez || 1;
      for (let x = Math.floor(Math.min(P[0], Q[0]) - r); x <= Math.max(P[0], Q[0]) + r; x++)
        for (let y = Math.floor(Math.min(P[1], Q[1]) - r); y <= Math.max(P[1], Q[1]) + r; y++)
          for (let z = Math.max(0, Math.floor(Math.min(P[2], Q[2]) - r)); z <= Math.max(P[2], Q[2]) + r; z++) {
            const wx = x + 0.5 - P[0], wy = y + 0.5 - P[1], wz = z + 0.5 - P[2];
            const t = Math.max(0, Math.min(1, (wx * ex + wy * ey + wz * ez) / ll));
            if ((wx - ex * t) ** 2 + (wy - ey * t) ** 2 + (wz - ez * t) ** 2 <= r * r) { const c = typeof col === 'function' ? col(t) : col; if (c) m.set(x, y, z, c, mat); }
          }
    };
    const body = sov ? '#55663a' : '#4e5636', bodyHi = sov ? '#6c7f48' : '#646d46', band = sov ? '#c8281e' : '#e0b531';
    const dk = '#2a2c26', metal = '#7b8087';
    seg(at(0.04), at(0.95), 1.6, (t) => (t > 0.78 && t < 0.84) || (!sov && t > 0.12 && t < 0.16) ? band : t > 0.3 && t < 0.62 ? bodyHi : body, M_METAL);   // the tube
    seg(at(0), at(0.06), 1.9, '#3d4036', M_METAL);                                   // flared rear (blast) cap
    seg(at(0.94), at(1), 1.8, sov ? '#3d4036' : '#3c4a52', M_METAL);                 // front cap (the Stinger's a blue-grey cover)
    if (sov) {
      seg(at(1), at(1.13), 0.6, '#c9c6b8', M_METAL);                                 // the nose spike
      seg(at(0.4, 2), at(0.42, 4), 1, dk, M_METAL);                                  // gripstock
      seg(at(0.47, 2.6), at(0.78, 2.6), 0.9, '#3a4026', M_METAL);                    // long thermal battery forward under the grip
      m.set(...at(0.79, 2.6).map(Math.round), '#c8281e');                            // its red cap
      seg(at(0.7, 0, -2.4), at(0.8, 0, -2.4), 0.8, dk, M_METAL);                     // sight box on the left
      seg(at(0.72, 1.5, -2.4), at(0.72, -1.2, -2.4), 0.5, dk, M_METAL);
    } else {
      seg(at(0.38, 2), at(0.41, 4.2), 1, dk, M_METAL);                               // gripstock
      seg(at(0.48, 2.2), at(0.58, 2.2), 1, '#1f211c', M_METAL);                      // battery unit under it
      // the IFF antenna: a square frame standing up off the left side, a grid of wires inside
      const g0 = at(0.6, -1.4, -2.3), g1 = at(0.76, -1.4, -2.3), up = [-uz, 0, ux];
      const gc = (u, v) => [g0[0] + (g1[0] - g0[0]) * u + up[0] * v, g0[1], g0[2] + (g1[2] - g0[2]) * u + up[2] * v];
      for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) {
        const u = i / 12, v = j / 12 * 3.5, edge = i === 0 || i === 12 || j === 0 || j === 12;
        if (edge || i % 4 === 0 || j % 4 === 0) m.set(...gc(u, v).map(Math.floor), edge ? '#8d938a' : '#5d625c', M_METAL);
      }
      seg(at(0.68, -1, -1.2), at(0.68, -1.4, -2.3), 0.5, metal, M_METAL);              // its mount
      seg(at(0.84, 0, 2.3), at(0.84, -2.2, 2.3), 0.5, dk, M_METAL);                  // sight frame on the right
      seg(at(0.78, -2.2, 2.3), at(0.9, -2.2, 2.3), 0.5, dk, M_METAL);
    }
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
  } else if (type === 'flamer') {
    // The fire wand held low across the body, a pilot flame at the nozzle, a hose looping back to the tanks.
    m.line(0, 2.5, 9.5, 10, -1, 11.5, '#3c4028', M_METAL); m.line(0, 2.5, 10.5, 10, -1, 12.5, '#3c4028', M_METAL);
    m.box(9, -2, 11, 11, 0, 13, '#2a2a24', M_METAL);
    m.set(11, -1, 12, '#ffb43a'); m.set(12, -1, 12, '#ff7a1e');
    m.line(-4, 2, 9, 0, 3, 9.5, '#222', M_METAL);
  } else if (SN && pose !== 'rest') {
    m.line(0, 2.5, 9.5, 15, -3, 12.5, C.gun, M_METAL); m.line(0, 2.5, 10.5, 15, -3, 13.5, C.gun, M_METAL);   // the long barrel
    m.box(-1, 2, 9, 2, 4, 11, '#4f5a33');                                                                   // stock
    m.line(3, 1.4, 12, 8, -0.4, 13, '#1f211c', M_METAL); m.line(3, 1.4, 12.8, 8, -0.4, 13.8, '#1f211c', M_METAL);   // scope on top
  } else if (RIF) {
    m.line(0, 2.5, 9.5, R ? 11 : 9, -1.5, R ? 11.9 : 11.5, C.gun, M_METAL);   // barrel, rising forward across the body
    m.line(0, 2.5, 10.5, R ? 11 : 9, -1.5, R ? 12.9 : 12.5, C.gun, M_METAL);
    m.box(-1, 2, 9, 2, 4, 11, wood);                                         // stock at the hip
    if (R) { m.line(3, 1.2, 10, 7, -0.6, 11.4, wood); m.line(3, 1.2, 11, 7, -0.6, 12.4, wood); m.box(4, 0, 8, 5, 1, 10.5, C.gun, M_METAL); m.box(5, 0, 8, 6, 1, 9, C.gun, M_METAL); }   // wooden handguard, curved magazine
    else m.box(4, 0, 9, 5, 1, 10.5, C.gun, M_METAL);                        // magazine
  }
  return m;
}
// The MG Team: a gunner and a loader drawn as one model (the team is one unit). Frames: walking (1, 2, 12, 13; crawls
// 14, 15 walk too) and standing (0, the rest) carrying the gun; 4 setting up or packing (both crouched, the gun on the
// ground); 5 and 7 set up and firing (the gun on its mount, the gunner crouched on the grips, the loader feeding the
// belt). Allies: an M2 .50 cal on a low tripod. Soviets: a DShK 12.7 mm on its two-wheeled carriage behind a shield.
// Both are the game's own drawings, not copied from any game.
function stampModel(dst, src, dx, dy, dz) {
  for (let z = 0; z < src.d; z++) for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const i = (z * src.h + y) * src.w + x, c = src.col[i];
    if (c >= 0) dst.set(src.x0 + x + dx, src.y0 + y + dy, z + (dz || 0), c, src.mat[i]);
  }
}
// The gun pointing along +x: x the back of the receiver, (y, z) the bore. can: the ammunition box hung on its left.
function hmgGun(m, sov, x, y, z, can) {
  const steel = C.gun, dk = '#2a2a26';
  m.box(x - 2, y - 1, z - 1, x, y + 1, z + 1, dk, M_METAL);                               // back plate
  m.set(x - 3, y - 1, z, dk, M_METAL); m.set(x - 3, y, z, dk, M_METAL);                  // spade grips
  if (!sov) {
    m.box(x, y - 1, z - 1, x + 6, y + 1, z + 1.5, steel, M_METAL);                       // receiver
    m.box(x + 1, y - 1, z + 1.5, x + 5, y + 1, z + 2, shadeInt(rgbInt(steel), 1.2), M_METAL);   // feed cover
    m.cylX(x + 6, x + 9, y, z, 1.2, '#3a3c38', M_METAL);                                  // barrel support
    m.cylX(x + 9, x + 19, y, z, 0.7, steel, M_METAL);                                     // heavy barrel
    m.box(x + 8, y - 0.5, z + 1, x + 10, y + 0.5, z + 2.2, dk, M_METAL);                  // carrying handle
  } else {
    m.box(x, y - 1, z - 1, x + 7, y + 1, z + 1.5, steel, M_METAL);                       // receiver
    m.box(x + 1, y - 1.5, z + 1.5, x + 5, y + 1.5, z + 2.5, '#4a4f3a', M_METAL);         // feed cover
    for (let i = 7; i < 19; i++) m.cylX(x + i, x + i + 1, y, z, i % 2 ? 1.2 : 0.8, i % 2 ? dk : steel, M_METAL);   // finned barrel
    m.cylX(x + 19, x + 21, y, z, 1.4, dk, M_METAL);                                      // muzzle brake
  }
  if (can) {
    m.box(x + 1, y - 4, z - 2, x + 5, y - 1, z + 1, '#4f5a33');                         // ammunition box
    m.line(x + 3, y - 1.5, z + 1, x + 3, y - 0.5, z + 1.5, '#b8962e', M_METAL);          // the belt going in
  }
}
function hmgModel(pal, faction, frame) {
  const sov = faction === 'soviets', m = new VModel(-15, -11, 25, 13, 24);
  const can = '#4f5a33', shield = '#56603a', tyre = '#2b2b27';
  if (frame === 5 || frame === 7 || frame === 4) {
    const up = frame !== 4;
    // Gunner crouched behind the grips, loader kneeling at the gun's side with the box.
    stampModel(m, crouched(infModel(pal, faction, 'hmgG', up ? 7 : 0)), -6, 0);
    stampModel(m, crouched(infModel(pal, faction, 'hmgL', 0)), -3, 7);
    if (up) {
      if (sov) {
        for (const y of [-5.5, 4]) m.cylY(y, y + 1.5, 3, 2.5, 2.5, tyre, M_METAL);    // carriage wheels
        m.box(2, -4, 2, 4, 4, 3, '#3a3f2a', M_METAL);                                    // axle
        m.line(2, 0, 3, -5, 0, 0.5, '#3a3f2a', M_METAL);                                 // trail
        m.box(2, -1, 3, 4, 1, 6, '#3a3f2a', M_METAL);                                    // pivot
        m.box(10, -5, 4, 11, 5, 12, shield, M_METAL); m.box(10, -5, 11, 11, 5, 12, shadeInt(rgbInt(shield), 1.2), M_METAL);   // shield
      } else {
        m.line(3, 0, 6, 12, 0, 0, '#3a3c38', M_METAL);                                   // tripod: front leg
        for (const y of [-4, 4]) m.line(3, 0, 6, -2, y, 0, '#3a3c38', M_METAL);          // rear legs
        m.box(2, -1, 5, 4, 1, 6, '#2a2a26', M_METAL);                                    // cradle
      }
      hmgGun(m, sov, 0, 0, 7, true);
      m.box(-1, 5, 0, 3, 7, 3, can); m.line(1, 5, 3, 1, 1, 6, '#b8962e', M_METAL);      // spare box, belt to the gun
    } else {
      hmgGun(m, sov, 0, 0, 1.5, false);                                                  // laid on the ground
      m.box(-1, 5, 0, 3, 7, 3, can);
      if (sov) m.box(9, -5, 0, 14, 5, 1, shield, M_METAL);                               // shield set down flat
    }
    return m;
  }
  // Carrying: the gunner with the gun on his right shoulder, the loader a pace behind with the mount and the boxes.
  const walk = { 1: [1, 2], 2: [2, 1], 12: [12, 13], 13: [13, 12], 14: [1, 2], 15: [2, 1] }[frame] || [0, 0];
  const gx = 3, gy = -3, lx = -6, ly = 5;
  stampModel(m, infModel(pal, faction, 'hmgG', walk[0]), gx, gy);
  hmgGun(m, sov, gx - 4, gy + 3.5, 15.5, false);
  const L = infModel(pal, faction, 'hmgL', walk[1]);
  stampModel(m, L, lx, ly);
  m.box(lx - 1, ly + 4, 4, lx + 3, ly + 6, 7, can); m.box(lx - 1, ly - 6, 4, lx + 3, ly - 4, 7, can);   // a box in each hand
  if (sov) m.box(lx - 7, ly - 4, 7, lx - 6, ly + 4, 15, shield, M_METAL);                // the shield on his back
  else {
    m.line(lx - 6, ly - 3, 7, lx - 6, ly + 3, 19, '#3a3c38', M_METAL);                   // the tripod on his back
    m.line(lx - 6, ly + 3, 7, lx - 6, ly - 3, 19, '#3a3c38', M_METAL);
    m.line(lx - 7, ly, 6, lx - 7, ly, 19, '#3a3c38', M_METAL);
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
  if (type === 'refinery') return faction === 'soviets' ? [[54, 12, 51], [66, 14, 43]] : [[56, 10, 50], [67, 19, 45]];
  if (faction === 'soviets') return type === 'power' ? [[14, 14, 39]] : [[16, 18, 39], [46, 18, 39]];
  return type === 'power' ? [[38, 12, 43], [9, 10, 31]] : [[15, 9, 50], [35, 9, 50]];
}

const STRUCTURES = {
  cy(pal, faction, cameo) {
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
    if (cameo) {   // the jib turns in the battle (SPINNERS, art.js craneState) and its hook is drawn live; the cameo shows them still
      towerJib(m, 66, 9.5, 42, false);
      m.line(32, 9.5, 41, 32, 9.5, 22, C.black);
      m.box(30, 8, 20, 34, 11, 22, C.gun, M_METAL);
    }
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
  // Allied Ore Refinery: a process plant on a dirt pad. A round process tank on a gantry in the middle back, three tall
  // banded stacks on trestles (the two tallest smoke), a long processing hall at the front with the truck bay open to the
  // south (trucks dock at the cell south of the middle), pipework between them and a heap of ore beside the hall.
  // Modelled by hand after a Rodin Gen-1 "industrial complex" reference; the 72 x 48 footprint is as before.
  refinery(pal) {
    const m = new VModel(-2, -2, 74, 50, 56);
    const CONC = '#a39e91', SEAM = '#878275', STEEL = '#7f8480', IRON = '#5b5d58', DARK = '#3d3f38';
    m.box(-1, -1, 0, 73, 49, 1, '#6e6352', M_ROUGH);                                  // dirt pad
    m.paintTop(-1, -1, 73, 49, (x, y) => (hash3(x, y, 11) > 0.9 ? '#857a66' : hash3(x, y, 12) < 0.08 ? '#4b4236' : undefined));
    // Banded stacks on trestles: [x, y, height, radius]
    for (const [x, y, h, r] of [[56, 10, 50, 4.4], [67, 19, 45, 4], [41, 11, 33, 3.6]]) {
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {                      // four trestle legs leaning in
        m.line(x + dx * (r + 4), y + dy * (r + 4), 1, x + dx * (r - 1), y + dy * (r - 1), 15, IRON, M_METAL);
        m.line(x + dx * (r + 4) + 1, y + dy * (r + 4), 1, x + dx * (r - 1) + 1, y + dy * (r - 1), 15, IRON, M_METAL);
      }
      m.box(x - r - 1, y - r - 1, 14, x + r + 1, y + r + 1, 16, IRON, M_METAL);            // ring platform
      for (let z = 16; z < h; z++) {
        const k = (z - 16) / (h - 16);
        m.cylZ(x, y, z, z + 1, r * (1 - 0.14 * k), z % 7 === 0 ? SEAM : CONC, M_ROUGH);
      }
      m.cylZ(x, y, h - 9, h - 5, r * (1 - 0.14 * (h - 9 - 16) / (h - 16)) + 0.4, pal.main, M_METAL);   // team-colour band
      m.cylZ(x, y, h - 2, h, r * 0.9, DARK, M_METAL);                                      // the dark mouth
    }
    // Process tank: a sphere on a short drum, with a gantry tower beside it
    m.cylZ(22, 12, 1, 14, 6.5, CONC, M_ROUGH);
    m.cylZ(22, 12, 5, 8, 7, pal.main, M_METAL);
    m.ellipsoid(22, 12, 22, 10, 10, 9, STEEL, M_METAL);
    m.cylZ(22, 12, 20, 22, 10.6, pal.dark, M_METAL);                                      // equator band
    m.cylZ(22, 12, 30, 40, 1.6, IRON, M_METAL);                                           // vent column
    m.box(19, 9, 40, 25, 15, 41, pal.main, M_METAL);                                     // its cap
    m.line(22, 12, 41, 22, 12, 49, C.steel, M_METAL);                                     // mast
    for (const [x, y] of [[8, 4], [14, 4], [8, 10], [14, 10]]) m.box(x, y, 1, x + 1, y + 1, 30, IRON, M_METAL);   // gantry legs
    for (const z of [10, 20, 30]) m.box(7, 3, z, 16, 12, z + 1, IRON, M_METAL);
    // Pipework: tank to the stacks and down to the hall
    m.cylX(30, 54, 12, 9, 1.7, IRON, M_METAL);
    m.cylX(44, 66, 21, 7, 1.5, IRON, M_METAL);
    m.cylY(12, 26, 62, 8, 1.5, IRON, M_METAL);
    m.cylY(14, 26, 30, 6, 1.5, IRON, M_METAL);
    for (const x of [34, 46, 58]) m.box(x, 11, 8, x + 1, 14, 11, DARK, M_METAL);          // pipe brackets
    // Processing hall at the front: low walls, a roof in the side's colour, clerestory, and the bay open to the south
    m.box(4, 26, 1, 52, 44, 12, '#d6d3c9', M_MATTE);
    m.paint(4, 26, 1, 52, 44, 12, (x, y, z) => (x - 4) % 8 === 0 && z < 11 ? '#b9b6ac' : undefined);
    m.box(3, 25, 12, 53, 45, 14, pal.main, M_METAL);                                      // roof
    m.paint(3, 25, 12, 53, 45, 14, (x, y, z) => (z === 13 && (x - 3) % 6 === 0) ? pal.dark : undefined);
    m.box(10, 30, 14, 46, 38, 18, '#d6d3c9', M_MATTE);                                    // clerestory
    m.box(10, 30, 17, 46, 38, 18, pal.dark, M_METAL);
    m.box(12, 38, 15, 44, 39, 17, '#35505f', M_GLASS);                                    // its windows
    m.box(24, 43, 1, 44, 46, 10, DARK, M_ROUGH);                                          // truck bay
    m.clear(25, 43, 1, 43, 45, 9);
    m.box(25, 43, 1, 43, 45, 2, '#2a2a26', M_ROUGH);
    m.box(23, 43, 1, 24, 45, 10, IRON, M_METAL); m.box(44, 43, 1, 45, 45, 10, IRON, M_METAL);   // door posts
    m.box(23, 45, 9, 45, 46, 11, pal.dark, M_METAL);                                      // lintel
    hazardV(m, 24, 46, 1, 44, 49, 2);                                                     // hazard apron to the dock
    // Ore heap and a conveyor into the hall
    m.ellipsoid(62, 38, 1, 8, 7, 6, '#d2a62a', M_ROUGH);
    m.paintTop(54, 31, 70, 45, (x, y) => (hash3(x, y, 21) > 0.7 ? '#e8c24a' : hash3(x, y, 22) < 0.3 ? '#9a7414' : undefined));
    m.box(52, 34, 5, 60, 36, 7, IRON, M_METAL);
    // Drums beside the tank, a flag at the front corner
    for (const [x, y] of [[6, 18], [12, 21], [18, 20]]) { m.cylZ(x, y, 1, 7, 3, CONC, M_ROUGH); m.cylZ(x, y, 6, 7, 3.2, pal.main, M_METAL); }
    m.box(3, 46, 1, 4, 47, 22, C.steel, M_METAL);   // flag pole (the cloth is drawn live, art.js drawFlag)
    return m;
  },
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
    m.line(38, 10, 1, 38, 10, 22, C.steel, M_METAL);                     // flag pole (the cloth: art.js drawFlag)
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
      m.box(44, 3, 1, 45, 4, 30, C.steel, M_METAL);   // flag pole (the cloth: art.js drawFlag)
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
  // Tech Center (Allied): an elegant glass research campus. A long two-storey hall with a full curtain wall,
  // a glass tower behind it, a geodesic glass dome over the laboratory and a canopied entrance; white
  // frames throughout, the side's colour on the roof edges.
  tech(pal) {
    const m = new VModel(-2, -2, 76, 76, 50);
    const G1 = '#4f7488', G2 = '#7ea6bb', FR = '#eceae3';
    slabV(m, 0, 0, 72, 72);
    // Curtain wall on a box: glass faces with white mullions every 4 and a white band at each floor.
    const glassBox = (x0, y0, z0, x1, y1, z1, floor) => {
      m.box(x0, y0, z0, x1, y1, z1, G1, M_GLASS);
      m.paint(x0, y0, z0, x1, y1, z1, (x, y, z) => {
        if ((z - z0) % floor === 0) return FR;
        if (((x - x0) % 4 === 0 && (y === y0 || y === y1 - 1)) || ((y - y0) % 4 === 0 && (x === x0 || x === x1 - 1))) return FR;
        return (z - z0) % floor === floor - 1 || hash3(x, y >> 1, z) > 0.88 ? G2 : undefined;   // reflections
      });
      m.box(x0, y0, z1, x1, y1, z1 + 1, pal.main, M_METAL);
      m.box(x0 + 1, y0 + 1, z1, x1 - 1, y1 - 1, z1 + 1, '#b9b7ae', M_ROUGH);
    };
    glassBox(6, 8, 1, 28, 30, 36, 5);                                    // the tower
    m.box(10, 12, 37, 24, 26, 39, FR, M_MATTE);                          // its crown
    m.line(17, 19, 39, 17, 19, 47, C.steel, M_METAL); m.set(17, 19, 48, '#ff4030', M_GLOW);
    glassBox(4, 30, 1, 68, 64, 13, 6);                                   // the main hall
    for (let y = 33; y < 62; y += 5) {                                   // its glass roof lights
      m.box(7, y, 13, 33, y + 3, 15, G1, M_GLASS);
      m.paint(7, y, 13, 33, y + 3, 15, (x, yy, z) => ((x - 7) % 4 === 0 ? FR : z === 14 && yy === y + 1 ? G2 : undefined));
    }
    glassBox(30, 12, 1, 66, 30, 9, 4);                                   // the rear laboratory wing
    // The geodesic dome over the laboratory: glass panes in a white frame of ribs and rings.
    m.cylZ(46, 46, 14, 17, 12, FR, M_MATTE);
    m.ellipsoid(46, 46, 17, 11.5, 11.5, 13, G1, M_GLASS);
    m.paint(34, 34, 17, 59, 59, 31, (x, y, z) => {
      const a = Math.atan2(y + 0.5 - 46, x + 0.5 - 46) / (Math.PI * 2) * 12;
      if (Math.abs(a - Math.round(a)) < 0.09 || (z - 17) % 4 === 0) return FR;
      return hash3(x, y, z) > 0.75 ? G2 : undefined;
    });
    m.cylZ(46, 46, 29, 31, 1.6, FR, M_METAL); m.set(46, 46, 31, '#7fd0ff', M_GLOW);
    // Glazed entrance canopy on slim white columns.
    for (const x of [26, 46]) m.box(x, 66, 1, x + 1, 67, 9, FR, M_MATTE);
    m.box(24, 64, 9, 49, 69, 10, G2, M_GLASS);
    m.paint(24, 64, 9, 49, 69, 10, (x) => ((x - 24) % 5 === 0 ? FR : undefined));
    m.box(24, 68, 10, 49, 69, 11, pal.main, M_METAL);
    m.box(32, 63, 1, 40, 64, 8, '#20282c');                              // doors
    m.box(52, 4, 1, 68, 11, 7, FR, M_MATTE);                             // a small dish on the wing
    m.cylZ(60, 20, 10, 13, 1.2, C.steel, M_METAL);
    m.ellipsoid(60, 20, 15, 4.5, 4.5, 1.5, '#e9e7df', M_METAL);
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
  // Flame tower: a six-sided tower with an arched stone foot, a braced frame, a brick room in the team colour and a
  // railed platform; the flame projector on top is a rotating head (HEADS.ftur, pivot at z 25, where fire comes from). Modelled in Blender, voxelized by tools/blender/ftur.py.
  // BLENDER:ftur begin
  ftur(pal) {
    const m = new VModel(-2, -2, 26, 26, 30);
    m.box(0, 0, 0, 24, 24, 1, '#5f574c', M_ROUGH);
    m.box(10, 4, 1, 11, 7, 5, '#1a120d', M_MATTE);
    m.box(11, 4, 1, 13, 6, 4, '#ff7a1a', M_GLOW);
    m.box(13, 4, 1, 14, 7, 5, '#1a120d', M_MATTE);
    m.box(7, 5, 1, 10, 21, 3, '#8a7d70', M_ROUGH);
    m.box(14, 5, 1, 17, 21, 3, '#8a7d70', M_ROUGH);
    m.box(11, 6, 1, 13, 7, 5, '#1a120d', M_MATTE);
    m.box(5, 7, 1, 6, 8, 5, '#1a120d', M_MATTE);
    m.box(6, 7, 1, 7, 8, 3, '#8a7d70', M_ROUGH);
    m.box(10, 7, 1, 14, 19, 7, '#8a7d70', M_ROUGH);
    m.box(17, 7, 1, 18, 8, 3, '#8a7d70', M_ROUGH);
    m.box(18, 7, 1, 19, 8, 5, '#1a120d', M_MATTE);
    m.box(4, 8, 1, 6, 10, 4, '#ff7a1a', M_GLOW);
    m.box(6, 8, 1, 7, 10, 5, '#1a120d', M_MATTE);
    m.box(17, 8, 1, 18, 10, 5, '#1a120d', M_MATTE);
    m.box(18, 8, 1, 20, 10, 4, '#ff7a1a', M_GLOW);
    m.box(4, 10, 1, 6, 11, 5, '#1a120d', M_MATTE);
    m.box(6, 10, 1, 7, 16, 7, '#8a7d70', M_ROUGH);
    m.box(17, 10, 1, 18, 16, 7, '#8a7d70', M_ROUGH);
    m.box(18, 10, 1, 20, 11, 5, '#1a120d', M_MATTE);
    m.box(4, 11, 1, 6, 15, 4, '#8a7d70', M_ROUGH);
    m.box(18, 11, 1, 20, 15, 4, '#8a7d70', M_ROUGH);
    m.box(3, 12, 1, 4, 14, 3, '#8a7d70', M_ROUGH);
    m.box(20, 12, 1, 21, 14, 3, '#8a7d70', M_ROUGH);
    m.box(4, 15, 1, 6, 16, 5, '#1a120d', M_MATTE);
    m.box(18, 15, 1, 20, 16, 5, '#1a120d', M_MATTE);
    m.box(4, 16, 1, 6, 18, 4, '#ff7a1a', M_GLOW);
    m.box(6, 16, 1, 7, 18, 5, '#1a120d', M_MATTE);
    m.box(17, 16, 1, 18, 18, 5, '#1a120d', M_MATTE);
    m.box(18, 16, 1, 20, 18, 4, '#ff7a1a', M_GLOW);
    m.box(5, 18, 1, 6, 19, 5, '#1a120d', M_MATTE);
    m.box(6, 18, 1, 7, 19, 3, '#8a7d70', M_ROUGH);
    m.box(17, 18, 1, 18, 19, 3, '#8a7d70', M_ROUGH);
    m.box(18, 18, 1, 19, 19, 5, '#1a120d', M_MATTE);
    m.box(2, 19, 1, 4, 22, 2, pal.light, M_METAL);
    m.box(10, 19, 1, 14, 20, 5, '#1a120d', M_MATTE);
    m.box(1, 20, 1, 2, 21, 2, pal.light, M_METAL);
    m.box(10, 20, 1, 11, 22, 5, '#1a120d', M_MATTE);
    m.box(11, 20, 1, 13, 22, 4, '#ff7a1a', M_GLOW);
    m.box(13, 20, 1, 14, 22, 5, '#1a120d', M_MATTE);
    m.box(19, 20, 1, 22, 22, 3, '#8a8478', M_METAL);
    m.box(4, 21, 1, 7, 23, 2, pal.light, M_METAL);
    m.box(2, 19, 2, 4, 22, 3, pal.dark, M_METAL);
    m.box(1, 20, 2, 2, 22, 3, pal.dark, M_METAL);
    m.box(5, 20, 2, 6, 24, 3, pal.dark, M_METAL);
    m.box(4, 21, 2, 5, 23, 3, pal.dark, M_METAL);
    m.box(6, 21, 2, 7, 23, 3, pal.dark, M_METAL);
    m.box(7, 6, 3, 10, 20, 4, '#8a7d70', M_ROUGH);
    m.box(14, 6, 3, 17, 20, 4, '#8a7d70', M_ROUGH);
    m.box(2, 19, 3, 4, 22, 4, pal.light, M_METAL);
    m.box(1, 20, 3, 2, 21, 4, pal.light, M_METAL);
    m.box(19, 20, 3, 22, 22, 4, '#a59f92', M_METAL);
    m.box(4, 21, 3, 7, 23, 4, pal.light, M_METAL);
    m.box(11, 4, 4, 13, 6, 5, '#1a120d', M_MATTE);
    m.box(8, 6, 4, 10, 20, 6, '#8a7d70', M_ROUGH);
    m.box(14, 6, 4, 16, 20, 6, '#8a7d70', M_ROUGH);
    m.box(7, 7, 4, 8, 19, 6, '#8a7d70', M_ROUGH);
    m.box(16, 7, 4, 17, 19, 6, '#8a7d70', M_ROUGH);
    m.box(4, 8, 4, 6, 10, 5, '#1a120d', M_MATTE);
    m.box(18, 8, 4, 20, 10, 5, '#1a120d', M_MATTE);
    m.box(5, 11, 4, 6, 15, 7, '#8a7d70', M_ROUGH);
    m.box(18, 11, 4, 19, 15, 7, '#8a7d70', M_ROUGH);
    m.box(4, 12, 4, 5, 14, 5, '#8a7d70', M_ROUGH);
    m.box(19, 12, 4, 20, 14, 5, '#8a7d70', M_ROUGH);
    m.box(4, 16, 4, 6, 18, 5, '#1a120d', M_MATTE);
    m.box(18, 16, 4, 20, 18, 5, '#1a120d', M_MATTE);
    m.box(11, 20, 4, 13, 22, 5, '#1a120d', M_MATTE);
    m.box(10, 6, 5, 14, 7, 6, '#8a7d70', M_ROUGH);
    m.box(6, 9, 5, 7, 10, 6, '#8a7d70', M_ROUGH);
    m.box(17, 9, 5, 18, 10, 6, '#8a7d70', M_ROUGH);
    m.box(6, 16, 5, 7, 17, 6, '#8a7d70', M_ROUGH);
    m.box(17, 16, 5, 18, 17, 6, '#8a7d70', M_ROUGH);
    m.box(10, 19, 5, 14, 20, 6, '#8a7d70', M_ROUGH);
    m.box(8, 7, 6, 10, 19, 7, '#8a7d70', M_ROUGH);
    m.box(14, 7, 6, 16, 19, 7, '#8a7d70', M_ROUGH);
    m.box(7, 8, 6, 8, 18, 7, '#8a7d70', M_ROUGH);
    m.box(16, 8, 6, 17, 18, 7, '#8a7d70', M_ROUGH);
    m.box(8, 6, 7, 16, 20, 8, '#a4978a', M_ROUGH);
    m.box(7, 8, 7, 8, 18, 8, '#a4978a', M_ROUGH);
    m.box(16, 8, 7, 17, 18, 8, '#a4978a', M_ROUGH);
    m.box(6, 9, 7, 7, 17, 8, '#a4978a', M_ROUGH);
    m.box(17, 9, 7, 18, 17, 8, '#a4978a', M_ROUGH);
    m.box(5, 11, 7, 6, 15, 8, '#a4978a', M_ROUGH);
    m.box(18, 11, 7, 19, 15, 8, '#a4978a', M_ROUGH);
    m.box(8, 7, 8, 9, 8, 12, '#6e5539', M_ROUGH);
    m.box(9, 7, 8, 10, 8, 9, '#8a6d48', M_ROUGH);
    m.box(15, 7, 8, 16, 8, 9, '#8a6d48', M_ROUGH);
    m.box(8, 8, 8, 16, 18, 9, '#96503a', M_ROUGH);
    m.box(7, 10, 8, 8, 16, 10, '#96503a', M_ROUGH);
    m.box(16, 10, 8, 17, 16, 10, '#96503a', M_ROUGH);
    m.box(5, 12, 8, 6, 13, 9, '#8a6d48', M_ROUGH);
    m.box(6, 12, 8, 7, 14, 11, '#96503a', M_ROUGH);
    m.box(17, 12, 8, 18, 14, 11, '#96503a', M_ROUGH);
    m.box(18, 12, 8, 19, 13, 12, '#6e5539', M_ROUGH);
    m.box(5, 13, 8, 6, 14, 12, '#6e5539', M_ROUGH);
    m.box(18, 13, 8, 19, 14, 9, '#8a6d48', M_ROUGH);
    m.box(8, 18, 8, 9, 19, 9, '#8a6d48', M_ROUGH);
    m.box(14, 18, 8, 15, 19, 9, '#8a6d48', M_ROUGH);
    m.box(15, 18, 8, 16, 19, 12, '#6e5539', M_ROUGH);
    m.box(9, 7, 9, 10, 8, 13, '#6e5539', M_ROUGH);
    m.box(10, 7, 9, 11, 8, 10, '#8a6d48', M_ROUGH);
    m.box(14, 7, 9, 16, 8, 12, '#6e5539', M_ROUGH);
    m.box(8, 8, 9, 15, 17, 10, '#96503a', M_ROUGH);
    m.box(15, 8, 9, 16, 9, 10, '#8a6d48', M_ROUGH);
    m.box(15, 9, 9, 16, 18, 10, '#96503a', M_ROUGH);
    m.box(6, 11, 9, 7, 12, 10, '#8a6d48', M_ROUGH);
    m.box(5, 12, 9, 6, 13, 12, '#6e5539', M_ROUGH);
    m.box(18, 13, 9, 19, 14, 12, '#6e5539', M_ROUGH);
    m.box(17, 14, 9, 18, 15, 10, '#8a6d48', M_ROUGH);
    m.box(8, 17, 9, 9, 18, 10, '#8a6d48', M_ROUGH);
    m.box(9, 17, 9, 15, 18, 12, '#96503a', M_ROUGH);
    m.box(8, 18, 9, 10, 19, 12, '#6e5539', M_ROUGH);
    m.box(13, 18, 9, 14, 19, 10, '#8a6d48', M_ROUGH);
    m.box(14, 18, 9, 15, 19, 13, '#6e5539', M_ROUGH);
    m.box(11, 7, 10, 12, 8, 11, '#8a6d48', M_ROUGH);
    m.box(9, 8, 10, 15, 17, 12, '#96503a', M_ROUGH);
    m.box(8, 9, 10, 9, 17, 11, '#96503a', M_ROUGH);
    m.box(15, 9, 10, 16, 17, 11, '#96503a', M_ROUGH);
    m.box(7, 10, 10, 8, 11, 11, '#8a6d48', M_ROUGH);
    m.box(16, 10, 10, 17, 11, 11, '#8a6d48', M_ROUGH);
    m.box(7, 11, 10, 8, 15, 11, '#96503a', M_ROUGH);
    m.box(16, 11, 10, 17, 15, 11, '#96503a', M_ROUGH);
    m.box(7, 15, 10, 8, 16, 11, '#8a6d48', M_ROUGH);
    m.box(16, 15, 10, 17, 16, 11, '#8a6d48', M_ROUGH);
    m.box(12, 18, 10, 13, 19, 11, '#8a6d48', M_ROUGH);
    m.box(8, 9, 11, 9, 10, 12, '#8a6d48', M_ROUGH);
    m.box(15, 9, 11, 16, 16, 12, '#96503a', M_ROUGH);
    m.box(8, 10, 11, 9, 17, 12, '#96503a', M_ROUGH);
    m.box(7, 11, 11, 8, 14, 13, '#96503a', M_ROUGH);
    m.box(16, 11, 11, 17, 12, 12, '#8a6d48', M_ROUGH);
    m.box(6, 12, 11, 7, 14, 13, '#6e5539', M_ROUGH);
    m.box(16, 12, 11, 17, 15, 13, '#96503a', M_ROUGH);
    m.box(17, 12, 11, 18, 14, 12, '#6e5539', M_ROUGH);
    m.box(7, 14, 11, 8, 15, 12, '#8a6d48', M_ROUGH);
    m.box(15, 16, 11, 16, 17, 12, '#8a6d48', M_ROUGH);
    m.box(14, 7, 12, 15, 9, 13, '#6e5539', M_ROUGH);
    m.box(8, 8, 12, 9, 9, 13, '#8a6d48', M_ROUGH);
    m.box(9, 8, 12, 10, 9, 13, '#6e5539', M_ROUGH);
    m.box(10, 8, 12, 14, 18, 13, '#96503a', M_ROUGH);
    m.box(9, 9, 12, 10, 17, 13, '#96503a', M_ROUGH);
    m.box(14, 9, 12, 15, 17, 13, '#96503a', M_ROUGH);
    m.box(8, 10, 12, 9, 16, 13, '#96503a', M_ROUGH);
    m.box(15, 10, 12, 16, 16, 13, '#96503a', M_ROUGH);
    m.box(16, 11, 12, 17, 12, 13, '#96503a', M_ROUGH);
    m.box(17, 12, 12, 18, 13, 13, '#8a6d48', M_ROUGH);
    m.box(17, 13, 12, 18, 14, 13, '#6e5539', M_ROUGH);
    m.box(7, 14, 12, 8, 15, 13, '#96503a', M_ROUGH);
    m.box(9, 17, 12, 10, 19, 13, '#6e5539', M_ROUGH);
    m.box(14, 17, 12, 15, 18, 13, '#6e5539', M_ROUGH);
    m.box(15, 17, 12, 16, 18, 13, '#8a6d48', M_ROUGH);
    m.box(8, 8, 13, 16, 18, 14, '#4a3828', M_ROUGH);
    m.box(7, 10, 13, 8, 16, 14, '#4a3828', M_ROUGH);
    m.box(16, 10, 13, 17, 16, 14, '#4a3828', M_ROUGH);
    m.box(6, 12, 13, 7, 14, 14, '#4a3828', M_ROUGH);
    m.box(17, 12, 13, 18, 14, 14, '#4a3828', M_ROUGH);
    m.box(9, 8, 14, 10, 9, 20, pal.dark, M_METAL);
    m.box(10, 8, 14, 14, 18, 16, pal.main, M_METAL);
    m.box(14, 8, 14, 15, 9, 20, pal.dark, M_METAL);
    m.box(9, 9, 14, 10, 17, 19, pal.main, M_METAL);
    m.box(14, 9, 14, 15, 17, 19, pal.main, M_METAL);
    m.box(8, 10, 14, 9, 16, 16, pal.main, M_METAL);
    m.box(15, 10, 14, 16, 16, 16, pal.main, M_METAL);
    m.box(7, 11, 14, 8, 15, 15, pal.main, M_METAL);
    m.box(16, 11, 14, 17, 15, 15, pal.main, M_METAL);
    m.box(6, 12, 14, 7, 14, 20, pal.dark, M_METAL);
    m.box(17, 12, 14, 18, 14, 20, pal.dark, M_METAL);
    m.box(9, 17, 14, 10, 18, 20, pal.dark, M_METAL);
    m.box(14, 17, 14, 15, 18, 20, pal.dark, M_METAL);
    m.box(7, 12, 15, 8, 14, 19, pal.main, M_METAL);
    m.box(16, 12, 15, 17, 14, 19, pal.main, M_METAL);
    m.box(10, 8, 16, 11, 18, 19, pal.main, M_METAL);
    m.box(11, 8, 16, 13, 9, 17, '#14100d', M_MATTE);
    m.box(13, 8, 16, 14, 18, 19, pal.main, M_METAL);
    m.box(11, 9, 16, 13, 17, 19, pal.main, M_METAL);
    m.box(7, 10, 16, 9, 11, 17, '#14100d', M_MATTE);
    m.box(15, 10, 16, 17, 11, 17, '#14100d', M_MATTE);
    m.box(8, 11, 16, 9, 15, 19, pal.main, M_METAL);
    m.box(15, 11, 16, 16, 15, 19, pal.main, M_METAL);
    m.box(7, 15, 16, 9, 16, 17, '#14100d', M_MATTE);
    m.box(15, 15, 16, 17, 16, 17, '#14100d', M_MATTE);
    m.box(11, 17, 16, 13, 18, 17, '#14100d', M_MATTE);
    m.box(11, 8, 17, 13, 9, 19, pal.main, M_METAL);
    m.box(8, 10, 17, 9, 11, 19, pal.main, M_METAL);
    m.box(15, 10, 17, 16, 11, 19, pal.main, M_METAL);
    m.box(8, 15, 17, 9, 16, 19, pal.main, M_METAL);
    m.box(15, 15, 17, 16, 16, 19, pal.main, M_METAL);
    m.box(11, 17, 17, 13, 18, 19, pal.main, M_METAL);
    m.box(10, 8, 19, 14, 18, 20, pal.light, M_METAL);
    m.box(9, 9, 19, 10, 17, 20, pal.light, M_METAL);
    m.box(14, 9, 19, 15, 17, 20, pal.light, M_METAL);
    m.box(8, 10, 19, 9, 16, 20, pal.light, M_METAL);
    m.box(15, 10, 19, 16, 16, 20, pal.light, M_METAL);
    m.box(7, 11, 19, 8, 15, 20, pal.light, M_METAL);
    m.box(16, 11, 19, 17, 15, 20, pal.light, M_METAL);
    m.box(8, 8, 20, 16, 12, 21, '#4a3828', M_ROUGH);
    m.box(7, 10, 20, 8, 16, 21, '#4a3828', M_ROUGH);
    m.box(16, 10, 20, 17, 16, 21, '#4a3828', M_ROUGH);
    m.box(6, 12, 20, 7, 14, 21, '#4a3828', M_ROUGH);
    m.box(8, 12, 20, 11, 18, 21, '#4a3828', M_ROUGH);
    m.box(11, 12, 20, 13, 14, 24, '#2a2b2d', M_METAL);
    m.box(13, 12, 20, 16, 18, 21, '#4a3828', M_ROUGH);
    m.box(17, 12, 20, 18, 14, 21, '#4a3828', M_ROUGH);
    m.box(11, 14, 20, 13, 18, 21, '#4a3828', M_ROUGH);
    m.box(9, 8, 21, 10, 9, 25, '#6e5539', M_ROUGH);
    m.box(14, 8, 21, 15, 9, 25, '#6e5539', M_ROUGH);
    m.box(6, 12, 21, 7, 14, 25, '#6e5539', M_ROUGH);
    m.box(17, 12, 21, 18, 14, 25, '#6e5539', M_ROUGH);
    m.box(9, 17, 21, 10, 18, 25, '#6e5539', M_ROUGH);
    m.box(14, 17, 21, 15, 18, 25, '#6e5539', M_ROUGH);
    m.box(9, 7, 24, 15, 8, 25, '#6e5539', M_ROUGH);
    m.box(8, 8, 24, 9, 18, 25, '#6e5539', M_ROUGH);
    m.box(10, 8, 24, 14, 19, 25, '#6e5539', M_ROUGH);
    m.box(15, 8, 24, 16, 18, 25, '#6e5539', M_ROUGH);
    m.box(7, 9, 24, 8, 17, 25, '#6e5539', M_ROUGH);
    m.box(9, 9, 24, 10, 17, 25, '#6e5539', M_ROUGH);
    m.box(14, 9, 24, 15, 17, 25, '#6e5539', M_ROUGH);
    m.box(16, 9, 24, 17, 17, 25, '#6e5539', M_ROUGH);
    m.box(6, 11, 24, 7, 12, 25, '#6e5539', M_ROUGH);
    m.box(17, 11, 24, 18, 12, 25, '#6e5539', M_ROUGH);
    m.box(6, 14, 24, 7, 15, 25, '#6e5539', M_ROUGH);
    m.box(17, 14, 24, 18, 15, 25, '#6e5539', M_ROUGH);
    m.box(9, 18, 24, 10, 19, 25, '#6e5539', M_ROUGH);
    m.box(14, 18, 24, 15, 19, 25, '#6e5539', M_ROUGH);
    m.box(8, 7, 25, 16, 8, 26, '#4a3828', M_ROUGH);
    m.box(8, 8, 25, 9, 9, 26, '#4a3828', M_ROUGH);
    m.box(15, 8, 25, 16, 9, 26, '#4a3828', M_ROUGH);
    m.box(7, 9, 25, 8, 11, 26, '#4a3828', M_ROUGH);
    m.box(16, 9, 25, 17, 11, 26, '#4a3828', M_ROUGH);
    m.box(6, 10, 25, 7, 12, 26, '#4a3828', M_ROUGH);
    m.box(10, 10, 25, 14, 16, 26, '#2a2b2d', M_METAL);
    m.box(17, 10, 25, 18, 12, 26, '#4a3828', M_ROUGH);
    m.box(9, 11, 25, 10, 15, 26, '#2a2b2d', M_METAL);
    m.box(14, 11, 25, 15, 15, 26, '#2a2b2d', M_METAL);
    m.box(5, 12, 25, 6, 14, 26, '#4a3828', M_ROUGH);
    m.box(18, 12, 25, 19, 14, 26, '#4a3828', M_ROUGH);
    m.box(6, 14, 25, 7, 16, 26, '#4a3828', M_ROUGH);
    m.box(17, 14, 25, 18, 16, 26, '#4a3828', M_ROUGH);
    m.box(7, 15, 25, 8, 17, 26, '#4a3828', M_ROUGH);
    m.box(16, 15, 25, 17, 17, 26, '#4a3828', M_ROUGH);
    m.box(8, 17, 25, 9, 19, 26, '#4a3828', M_ROUGH);
    m.box(15, 17, 25, 16, 19, 26, '#4a3828', M_ROUGH);
    m.box(9, 18, 25, 15, 19, 26, '#4a3828', M_ROUGH);
    return m;
  },
  // BLENDER:ftur end
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

// The Soviet radar's curved mesh antenna and feed horn, with its pivot (the pedestal's top) at (px, py, pz) of the model.
function radarDish(m, px, py, pz) {
  for (let x = -16; x < 17; x++) {
    const dx = x + 0.5 - 0.5, y = Math.round(-3 - dx * dx / 34);
    for (let z = 0; z < 15; z++) m.set(px + x, py + y, pz + z, (px + x + z) % 2 ? '#6a6f6c' : '#454a48', M_ROUGH);
    if ((px + x) % 4 === 0) m.line(px + x, py + y + 1, pz, px, py + 1, pz + 4, '#4f5452', M_METAL);
  }
  m.box(px - 1, py - 11, pz + 6, px + 2, py, pz + 8, SV.steel, M_METAL);   // feed horn boom
}
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
// Banners hanging down the front faces of Soviet structures: [x0, x1, y (the face), top, length]. The models keep only the
// steel rod each hangs from; the cloth is drawn live and sways in the wind (art.js drawBanners).
const BANNERS = {
  cy: [[8, 13, 53, 13, 10], [59, 64, 53, 13, 10]],
  refinery: [[4, 9, 44, 14, 7]],
  barracks: [[20, 28, 43, 16, 5]],
  factory: [[6, 11, 45, 22, 8], [61, 66, 45, 22, 8]],
  tech: [[18, 24, 64, 15, 7], [48, 54, 64, 15, 7]],
};
function bannersV(m, type) {
  for (const [x0, x1, y, top] of BANNERS[type]) m.box(x0 - 1, y, top, x1 + 1, y + 1, top + 1, SV.steel, M_METAL);
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

// A Construction Yard's tower crane jib round its pivot (the mast's top): the yellow jib out along -x, the counterweight over the mast.
function towerJib(m, px, py, pz, soviet) {
  if (soviet) { m.box(px - 34, py - 1.5, pz, px + 3, py + 1.5, pz + 2, C.yellow, M_METAL); m.box(px, py - 2.5, pz + 2, px + 4, py + 2.5, pz + 4, '#5d5e58', M_METAL); }
  else { m.box(px - 38, py - 1.5, pz, px + 1, py + 1.5, pz + 3, C.yellow, M_METAL); m.box(px - 2, py - 2.5, pz + 2, px + 2, py + 2.5, pz + 4, '#5d5e58', M_METAL); }
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
  cy(pal, cameo) {
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
    bannersV(m, 'cy');
    m.paintTop(28, 58, 44, 70, (x, y) => (y - 58) % 4 < 2 ? C.yellow : undefined);
    latticeV(m, 63, 2, 1, 44, C.yellow);                                 // tower crane
    if (cameo) {   // the jib turns in the battle (SPINNERS, art.js craneState); the cameo shows it still
      towerJib(m, 64, 3.5, 43, true);
      m.line(36, 3.5, 42, 36, 3.5, 26, C.black);
      m.box(34, 2, 24, 38, 5, 26, C.gun, M_METAL);
    }
    return m;
  },
  // BLENDER:power_soviets begin
  power(pal) {
    const m = new VModel(-2, -2, 50, 50, 52);
    m.box(-1, -1, 0, 49, 49, 1, '#6e6352', M_ROUGH);
    m.box(10, 2, 1, 18, 26, 2, '#878275', M_ROUGH);
    m.box(8, 3, 1, 10, 25, 3, '#878275', M_ROUGH);
    m.box(18, 3, 1, 20, 25, 3, '#878275', M_ROUGH);
    m.box(6, 4, 1, 8, 24, 3, '#878275', M_ROUGH);
    m.box(20, 4, 1, 22, 24, 3, '#878275', M_ROUGH);
    m.box(5, 5, 1, 6, 23, 3, '#878275', M_ROUGH);
    m.box(22, 5, 1, 23, 23, 3, '#878275', M_ROUGH);
    m.box(4, 6, 1, 5, 22, 3, '#878275', M_ROUGH);
    m.box(23, 6, 1, 24, 22, 3, '#878275', M_ROUGH);
    m.box(31, 7, 1, 32, 8, 5, '#46473f', M_METAL);
    m.box(36, 7, 1, 37, 8, 5, '#46473f', M_METAL);
    m.box(41, 7, 1, 42, 8, 5, '#46473f', M_METAL);
    m.box(46, 7, 1, 47, 8, 5, '#46473f', M_METAL);
    m.box(3, 8, 1, 4, 20, 3, '#878275', M_ROUGH);
    m.box(24, 8, 1, 25, 20, 3, '#878275', M_ROUGH);
    m.box(31, 8, 1, 45, 16, 5, '#5b5d58', M_METAL);
    m.box(2, 10, 1, 3, 18, 3, '#878275', M_ROUGH);
    m.box(25, 10, 1, 26, 18, 2, '#878275', M_ROUGH);
    m.box(1, 27, 1, 46, 45, 2, '#b3a574', M_ROUGH);
    m.box(1, 45, 1, 3, 46, 3, '#b3a574', M_ROUGH);
    m.box(3, 45, 1, 5, 46, 14, '#e4e2d8', M_MATTE);
    m.box(5, 45, 1, 13, 46, 3, '#b3a574', M_ROUGH);
    m.box(13, 45, 1, 15, 46, 14, '#e4e2d8', M_MATTE);
    m.box(15, 45, 1, 21, 46, 3, '#b3a574', M_ROUGH);
    m.box(21, 45, 1, 27, 46, 7, '#3a2a22', M_MATTE);
    m.box(27, 45, 1, 33, 46, 3, '#b3a574', M_ROUGH);
    m.box(33, 45, 1, 35, 46, 14, '#e4e2d8', M_MATTE);
    m.box(35, 45, 1, 43, 46, 3, '#b3a574', M_ROUGH);
    m.box(43, 45, 1, 45, 46, 14, '#e4e2d8', M_MATTE);
    m.box(45, 45, 1, 46, 46, 3, '#b3a574', M_ROUGH);
    m.box(17, 46, 1, 19, 49, 2, '#a39e91', M_ROUGH);
    m.box(19, 46, 1, 21, 47, 17, '#e4e2d8', M_MATTE);
    m.box(21, 46, 1, 27, 49, 2, '#a39e91', M_ROUGH);
    m.box(27, 46, 1, 29, 47, 17, '#e4e2d8', M_MATTE);
    m.box(29, 46, 1, 31, 49, 2, '#a39e91', M_ROUGH);
    m.box(19, 47, 1, 20, 48, 17, '#e4e2d8', M_MATTE);
    m.box(20, 47, 1, 21, 49, 2, '#a39e91', M_ROUGH);
    m.box(27, 47, 1, 28, 49, 2, '#a39e91', M_ROUGH);
    m.box(28, 47, 1, 29, 48, 17, '#e4e2d8', M_MATTE);
    m.box(19, 48, 1, 20, 49, 2, '#a39e91', M_ROUGH);
    m.box(28, 48, 1, 29, 49, 2, '#a39e91', M_ROUGH);
    m.box(10, 2, 2, 18, 25, 3, '#878275', M_ROUGH);
    m.box(25, 10, 2, 26, 12, 3, '#878275', M_ROUGH);
    m.box(25, 12, 2, 27, 16, 6, '#7f8480', M_METAL);
    m.box(25, 16, 2, 26, 18, 3, '#878275', M_ROUGH);
    m.box(10, 25, 2, 12, 26, 3, '#878275', M_ROUGH);
    m.box(12, 25, 2, 16, 28, 6, '#7f8480', M_METAL);
    m.box(16, 25, 2, 18, 26, 3, '#878275', M_ROUGH);
    m.box(1, 27, 2, 12, 45, 3, '#b3a574', M_ROUGH);
    m.box(16, 27, 2, 46, 45, 3, '#b3a574', M_ROUGH);
    m.box(12, 28, 2, 16, 45, 3, '#b3a574', M_ROUGH);
    m.box(10, 4, 3, 18, 24, 5, '#b9b6ac', M_ROUGH);
    m.box(8, 5, 3, 10, 23, 5, '#b9b6ac', M_ROUGH);
    m.box(18, 5, 3, 20, 23, 5, '#b9b6ac', M_ROUGH);
    m.box(7, 6, 3, 8, 22, 5, '#b9b6ac', M_ROUGH);
    m.box(20, 6, 3, 21, 22, 5, '#b9b6ac', M_ROUGH);
    m.box(6, 7, 3, 7, 21, 5, '#b9b6ac', M_ROUGH);
    m.box(21, 7, 3, 22, 21, 5, '#b9b6ac', M_ROUGH);
    m.box(5, 8, 3, 6, 20, 5, '#b9b6ac', M_ROUGH);
    m.box(22, 8, 3, 23, 20, 5, '#b9b6ac', M_ROUGH);
    m.box(4, 10, 3, 5, 18, 5, '#b9b6ac', M_ROUGH);
    m.box(23, 10, 3, 24, 18, 5, '#b9b6ac', M_ROUGH);
    m.box(2, 28, 3, 46, 45, 13, '#cdbf8e', M_ROUGH);
    m.box(2, 45, 3, 3, 46, 13, '#cdbf8e', M_ROUGH);
    m.box(5, 45, 3, 13, 46, 4, '#cdbf8e', M_ROUGH);
    m.box(15, 45, 3, 21, 46, 4, '#cdbf8e', M_ROUGH);
    m.box(27, 45, 3, 33, 46, 4, '#cdbf8e', M_ROUGH);
    m.box(35, 45, 3, 43, 46, 4, '#cdbf8e', M_ROUGH);
    m.box(45, 45, 3, 46, 46, 13, '#cdbf8e', M_ROUGH);
    m.box(5, 45, 4, 7, 46, 13, '#cdbf8e', M_ROUGH);
    m.box(7, 45, 4, 11, 46, 12, '#2c4452', M_GLASS);
    m.box(11, 45, 4, 13, 46, 13, '#cdbf8e', M_ROUGH);
    m.box(15, 45, 4, 17, 46, 13, '#cdbf8e', M_ROUGH);
    m.box(17, 45, 4, 20, 46, 9, '#2c4452', M_GLASS);
    m.box(20, 45, 4, 21, 46, 13, '#cdbf8e', M_ROUGH);
    m.box(27, 45, 4, 30, 46, 9, '#2c4452', M_GLASS);
    m.box(30, 45, 4, 33, 46, 13, '#cdbf8e', M_ROUGH);
    m.box(35, 45, 4, 37, 46, 13, '#cdbf8e', M_ROUGH);
    m.box(37, 45, 4, 41, 46, 12, '#2c4452', M_GLASS);
    m.box(41, 45, 4, 43, 46, 13, '#cdbf8e', M_ROUGH);
    m.box(13, 4, 5, 15, 24, 7, '#b9b6ac', M_ROUGH);
    m.box(10, 5, 5, 13, 23, 7, '#b9b6ac', M_ROUGH);
    m.box(15, 5, 5, 18, 23, 7, '#b9b6ac', M_ROUGH);
    m.box(8, 6, 5, 10, 22, 7, '#b9b6ac', M_ROUGH);
    m.box(18, 6, 5, 20, 22, 7, '#b9b6ac', M_ROUGH);
    m.box(7, 7, 5, 8, 21, 7, '#b9b6ac', M_ROUGH);
    m.box(20, 7, 5, 21, 21, 7, '#b9b6ac', M_ROUGH);
    m.box(6, 8, 5, 7, 20, 7, '#b9b6ac', M_ROUGH);
    m.box(21, 8, 5, 22, 20, 7, '#b9b6ac', M_ROUGH);
    m.box(35, 8, 5, 41, 16, 7, '#34362f', M_METAL);
    m.box(34, 9, 5, 35, 15, 7, '#34362f', M_METAL);
    m.box(41, 9, 5, 42, 15, 7, '#34362f', M_METAL);
    m.box(5, 10, 5, 6, 18, 7, '#b9b6ac', M_ROUGH);
    m.box(22, 10, 5, 23, 18, 7, '#b9b6ac', M_ROUGH);
    m.box(33, 11, 5, 34, 13, 9, '#e4e2d8', M_MATTE);
    m.box(42, 11, 5, 43, 13, 9, '#e4e2d8', M_MATTE);
    m.box(4, 13, 5, 5, 15, 7, '#b9b6ac', M_ROUGH);
    m.box(23, 13, 5, 24, 15, 7, '#b9b6ac', M_ROUGH);
    m.box(32, 20, 6, 33, 21, 14, '#7f8480', M_METAL);
    m.box(35, 20, 6, 36, 21, 14, '#7f8480', M_METAL);
    m.box(40, 20, 6, 41, 21, 14, '#7f8480', M_METAL);
    m.box(43, 20, 6, 44, 21, 14, '#7f8480', M_METAL);
    m.box(32, 23, 6, 33, 24, 14, '#7f8480', M_METAL);
    m.box(35, 23, 6, 36, 24, 14, '#7f8480', M_METAL);
    m.box(40, 23, 6, 41, 24, 14, '#7f8480', M_METAL);
    m.box(43, 23, 6, 44, 24, 14, '#7f8480', M_METAL);
    m.box(11, 5, 7, 17, 23, 9, '#b9b6ac', M_ROUGH);
    m.box(9, 6, 7, 11, 22, 9, '#b9b6ac', M_ROUGH);
    m.box(17, 6, 7, 19, 22, 9, '#b9b6ac', M_ROUGH);
    m.box(8, 7, 7, 9, 21, 9, '#b9b6ac', M_ROUGH);
    m.box(19, 7, 7, 20, 21, 9, '#b9b6ac', M_ROUGH);
    m.box(7, 8, 7, 8, 20, 9, '#b9b6ac', M_ROUGH);
    m.box(20, 8, 7, 21, 20, 9, '#b9b6ac', M_ROUGH);
    m.box(6, 9, 7, 7, 19, 9, '#b9b6ac', M_ROUGH);
    m.box(21, 9, 7, 22, 19, 9, '#b9b6ac', M_ROUGH);
    m.box(5, 11, 7, 6, 17, 9, '#b9b6ac', M_ROUGH);
    m.box(22, 11, 7, 23, 17, 9, '#b9b6ac', M_ROUGH);
    m.box(37, 11, 7, 39, 13, 9, '#e4e2d8', M_MATTE);
    m.box(21, 45, 7, 27, 46, 13, '#cdbf8e', M_ROUGH);
    m.box(10, 6, 9, 18, 22, 11, '#b9b6ac', M_ROUGH);
    m.box(9, 7, 9, 10, 21, 13, '#b9b6ac', M_ROUGH);
    m.box(18, 7, 9, 19, 21, 13, '#b9b6ac', M_ROUGH);
    m.box(8, 8, 9, 9, 20, 13, '#b9b6ac', M_ROUGH);
    m.box(19, 8, 9, 20, 20, 13, '#b9b6ac', M_ROUGH);
    m.box(7, 9, 9, 8, 19, 13, '#b9b6ac', M_ROUGH);
    m.box(20, 9, 9, 21, 19, 13, '#b9b6ac', M_ROUGH);
    m.box(6, 10, 9, 7, 18, 11, '#b9b6ac', M_ROUGH);
    m.box(21, 10, 9, 22, 18, 11, '#b9b6ac', M_ROUGH);
    m.box(17, 45, 9, 20, 46, 13, '#cdbf8e', M_ROUGH);
    m.box(27, 45, 9, 30, 46, 13, '#cdbf8e', M_ROUGH);
    m.box(11, 6, 11, 17, 22, 13, '#b9b6ac', M_ROUGH);
    m.box(10, 7, 11, 11, 21, 17, '#b9b6ac', M_ROUGH);
    m.box(17, 7, 11, 18, 21, 17, '#b9b6ac', M_ROUGH);
    m.box(6, 11, 11, 7, 17, 13, '#b9b6ac', M_ROUGH);
    m.box(21, 11, 11, 22, 17, 13, '#b9b6ac', M_ROUGH);
    m.box(45, 24, 11, 47, 26, 12, '#34362f', M_METAL);
    m.box(45, 46, 11, 47, 48, 12, '#34362f', M_METAL);
    m.box(7, 45, 12, 11, 46, 13, '#cdbf8e', M_ROUGH);
    m.box(37, 45, 12, 41, 46, 13, '#cdbf8e', M_ROUGH);
    m.box(12, 6, 13, 16, 22, 15, '#b9b6ac', M_ROUGH);
    m.box(11, 7, 13, 12, 21, 36, '#b9b6ac', M_ROUGH);
    m.box(16, 7, 13, 17, 21, 36, '#b9b6ac', M_ROUGH);
    m.box(9, 8, 13, 10, 20, 19, '#b9b6ac', M_ROUGH);
    m.box(18, 8, 13, 19, 20, 19, '#b9b6ac', M_ROUGH);
    m.box(8, 9, 13, 9, 19, 19, '#b9b6ac', M_ROUGH);
    m.box(19, 9, 13, 20, 19, 19, '#b9b6ac', M_ROUGH);
    m.box(7, 10, 13, 8, 18, 17, '#b9b6ac', M_ROUGH);
    m.box(20, 10, 13, 21, 18, 17, '#b9b6ac', M_ROUGH);
    m.box(6, 12, 13, 7, 16, 15, '#b9b6ac', M_ROUGH);
    m.box(21, 12, 13, 22, 16, 15, '#b9b6ac', M_ROUGH);
    m.box(2, 28, 13, 46, 29, 14, '#cdbf8e', M_ROUGH);
    m.box(1, 29, 13, 2, 30, 14, '#1c1c1a', M_METAL);
    m.box(2, 29, 13, 7, 44, 14, '#cdbf8e', M_ROUGH);
    m.box(7, 29, 13, 8, 30, 14, '#1c1c1a', M_METAL);
    m.box(8, 29, 13, 13, 44, 14, '#cdbf8e', M_ROUGH);
    m.box(13, 29, 13, 14, 30, 14, '#1c1c1a', M_METAL);
    m.box(14, 29, 13, 19, 44, 14, '#cdbf8e', M_ROUGH);
    m.box(19, 29, 13, 20, 30, 14, '#1c1c1a', M_METAL);
    m.box(20, 29, 13, 25, 44, 14, '#cdbf8e', M_ROUGH);
    m.box(25, 29, 13, 26, 30, 14, '#1c1c1a', M_METAL);
    m.box(26, 29, 13, 31, 44, 14, '#cdbf8e', M_ROUGH);
    m.box(31, 29, 13, 32, 30, 14, '#1c1c1a', M_METAL);
    m.box(32, 29, 13, 37, 44, 14, '#cdbf8e', M_ROUGH);
    m.box(37, 29, 13, 38, 30, 14, '#1c1c1a', M_METAL);
    m.box(38, 29, 13, 43, 44, 14, '#cdbf8e', M_ROUGH);
    m.box(43, 29, 13, 44, 30, 14, '#1c1c1a', M_METAL);
    m.box(44, 29, 13, 46, 44, 14, '#cdbf8e', M_ROUGH);
    m.box(7, 30, 13, 8, 44, 14, '#cdbf8e', M_ROUGH);
    m.box(13, 30, 13, 14, 44, 14, '#cdbf8e', M_ROUGH);
    m.box(19, 30, 13, 20, 44, 14, '#cdbf8e', M_ROUGH);
    m.box(25, 30, 13, 26, 44, 14, '#cdbf8e', M_ROUGH);
    m.box(31, 30, 13, 32, 44, 14, '#cdbf8e', M_ROUGH);
    m.box(37, 30, 13, 38, 44, 14, '#cdbf8e', M_ROUGH);
    m.box(43, 30, 13, 44, 44, 14, '#cdbf8e', M_ROUGH);
    m.box(1, 44, 13, 2, 45, 14, '#1c1c1a', M_METAL);
    m.box(2, 44, 13, 7, 45, 14, '#e4e2d8', M_MATTE);
    m.box(7, 44, 13, 8, 45, 14, '#1c1c1a', M_METAL);
    m.box(8, 44, 13, 13, 46, 14, '#e4e2d8', M_MATTE);
    m.box(13, 44, 13, 14, 45, 14, '#1c1c1a', M_METAL);
    m.box(14, 44, 13, 19, 45, 14, '#e4e2d8', M_MATTE);
    m.box(19, 44, 13, 20, 45, 14, '#1c1c1a', M_METAL);
    m.box(20, 44, 13, 25, 46, 14, '#e4e2d8', M_MATTE);
    m.box(25, 44, 13, 26, 45, 14, '#1c1c1a', M_METAL);
    m.box(26, 44, 13, 31, 46, 14, '#e4e2d8', M_MATTE);
    m.box(31, 44, 13, 32, 45, 14, '#1c1c1a', M_METAL);
    m.box(32, 44, 13, 37, 45, 14, '#e4e2d8', M_MATTE);
    m.box(37, 44, 13, 38, 45, 14, '#1c1c1a', M_METAL);
    m.box(38, 44, 13, 43, 46, 14, '#e4e2d8', M_MATTE);
    m.box(43, 44, 13, 44, 45, 14, '#1c1c1a', M_METAL);
    m.box(44, 44, 13, 47, 45, 14, '#e4e2d8', M_MATTE);
    m.box(1, 45, 13, 3, 46, 14, '#e4e2d8', M_MATTE);
    m.box(5, 45, 13, 8, 46, 14, '#e4e2d8', M_MATTE);
    m.box(15, 45, 13, 20, 46, 14, '#e4e2d8', M_MATTE);
    m.box(25, 45, 13, 26, 46, 20, '#e4e2d8', M_MATTE);
    m.box(31, 45, 13, 33, 46, 14, '#e4e2d8', M_MATTE);
    m.box(35, 45, 13, 38, 46, 14, '#e4e2d8', M_MATTE);
    m.box(45, 45, 13, 47, 46, 14, '#e4e2d8', M_MATTE);
    m.box(1, 28, 14, 47, 30, 15, '#4f5a4b', M_METAL);
    m.box(1, 30, 14, 2, 31, 16, '#1c1c1a', M_METAL);
    m.box(2, 30, 14, 7, 46, 15, '#4f5a4b', M_METAL);
    m.box(7, 30, 14, 8, 31, 16, '#1c1c1a', M_METAL);
    m.box(8, 30, 14, 13, 46, 15, '#4f5a4b', M_METAL);
    m.box(13, 30, 14, 14, 31, 16, '#1c1c1a', M_METAL);
    m.box(14, 30, 14, 19, 45, 16, '#4f5a4b', M_METAL);
    m.box(19, 30, 14, 20, 31, 16, '#1c1c1a', M_METAL);
    m.box(20, 30, 14, 25, 45, 16, '#4f5a4b', M_METAL);
    m.box(25, 30, 14, 26, 31, 16, '#1c1c1a', M_METAL);
    m.box(26, 30, 14, 31, 45, 16, '#4f5a4b', M_METAL);
    m.box(31, 30, 14, 32, 31, 16, '#1c1c1a', M_METAL);
    m.box(32, 30, 14, 37, 46, 15, '#4f5a4b', M_METAL);
    m.box(37, 30, 14, 38, 31, 16, '#1c1c1a', M_METAL);
    m.box(38, 30, 14, 43, 46, 15, '#4f5a4b', M_METAL);
    m.box(43, 30, 14, 44, 31, 16, '#1c1c1a', M_METAL);
    m.box(44, 30, 14, 47, 46, 15, '#4f5a4b', M_METAL);
    m.box(1, 31, 14, 2, 43, 16, '#4f5a4b', M_METAL);
    m.box(7, 31, 14, 8, 43, 16, '#4f5a4b', M_METAL);
    m.box(13, 31, 14, 14, 43, 16, '#4f5a4b', M_METAL);
    m.box(19, 31, 14, 20, 43, 16, '#4f5a4b', M_METAL);
    m.box(25, 31, 14, 26, 43, 16, '#4f5a4b', M_METAL);
    m.box(31, 31, 14, 32, 43, 16, '#4f5a4b', M_METAL);
    m.box(37, 31, 14, 38, 43, 16, '#4f5a4b', M_METAL);
    m.box(43, 31, 14, 44, 43, 16, '#4f5a4b', M_METAL);
    m.box(1, 43, 14, 2, 44, 16, '#1c1c1a', M_METAL);
    m.box(7, 43, 14, 8, 44, 16, '#1c1c1a', M_METAL);
    m.box(13, 43, 14, 14, 44, 16, '#1c1c1a', M_METAL);
    m.box(19, 43, 14, 20, 44, 16, '#1c1c1a', M_METAL);
    m.box(25, 43, 14, 26, 44, 16, '#1c1c1a', M_METAL);
    m.box(31, 43, 14, 32, 44, 16, '#1c1c1a', M_METAL);
    m.box(37, 43, 14, 38, 44, 16, '#1c1c1a', M_METAL);
    m.box(43, 43, 14, 44, 44, 16, '#1c1c1a', M_METAL);
    m.box(1, 44, 14, 2, 46, 15, '#4f5a4b', M_METAL);
    m.box(7, 44, 14, 8, 46, 15, '#4f5a4b', M_METAL);
    m.box(13, 44, 14, 14, 46, 15, '#4f5a4b', M_METAL);
    m.box(19, 44, 14, 20, 45, 16, '#4f5a4b', M_METAL);
    m.box(25, 44, 14, 26, 45, 16, '#4f5a4b', M_METAL);
    m.box(31, 44, 14, 32, 46, 15, '#4f5a4b', M_METAL);
    m.box(37, 44, 14, 38, 46, 15, '#4f5a4b', M_METAL);
    m.box(43, 44, 14, 44, 46, 15, '#4f5a4b', M_METAL);
    m.box(14, 45, 14, 18, 46, 15, '#4f5a4b', M_METAL);
    m.box(18, 45, 14, 25, 46, 16, '#e4e2d8', M_MATTE);
    m.box(26, 45, 14, 30, 46, 16, '#e4e2d8', M_MATTE);
    m.box(30, 45, 14, 31, 46, 15, '#4f5a4b', M_METAL);
    m.box(18, 46, 14, 19, 48, 16, '#e4e2d8', M_MATTE);
    m.box(21, 46, 14, 27, 48, 19, '#e4e2d8', M_MATTE);
    m.box(29, 46, 14, 30, 48, 16, '#e4e2d8', M_MATTE);
    m.box(20, 47, 14, 21, 48, 18, '#e4e2d8', M_MATTE);
    m.box(27, 47, 14, 28, 48, 18, '#e4e2d8', M_MATTE);
    m.box(12, 7, 15, 16, 21, 36, '#b9b6ac', M_ROUGH);
    m.box(1, 29, 15, 47, 30, 16, '#4f5a4b', M_METAL);
    m.box(2, 30, 15, 7, 45, 16, '#4f5a4b', M_METAL);
    m.box(8, 30, 15, 13, 45, 16, '#4f5a4b', M_METAL);
    m.box(32, 30, 15, 37, 45, 16, '#4f5a4b', M_METAL);
    m.box(38, 30, 15, 43, 45, 16, '#4f5a4b', M_METAL);
    m.box(44, 30, 15, 47, 45, 16, '#4f5a4b', M_METAL);
    m.box(1, 44, 15, 2, 45, 16, '#4f5a4b', M_METAL);
    m.box(7, 44, 15, 8, 45, 16, '#4f5a4b', M_METAL);
    m.box(13, 44, 15, 14, 45, 16, '#4f5a4b', M_METAL);
    m.box(31, 44, 15, 32, 45, 16, '#4f5a4b', M_METAL);
    m.box(37, 44, 15, 38, 45, 16, '#4f5a4b', M_METAL);
    m.box(43, 44, 15, 44, 45, 16, '#4f5a4b', M_METAL);
    m.box(1, 31, 16, 2, 32, 17, '#1c1c1a', M_METAL);
    m.box(2, 31, 16, 7, 43, 17, '#4f5a4b', M_METAL);
    m.box(7, 31, 16, 8, 32, 17, '#1c1c1a', M_METAL);
    m.box(8, 31, 16, 13, 43, 17, '#4f5a4b', M_METAL);
    m.box(13, 31, 16, 14, 32, 17, '#1c1c1a', M_METAL);
    m.box(14, 31, 16, 19, 43, 17, '#4f5a4b', M_METAL);
    m.box(19, 31, 16, 20, 32, 17, '#1c1c1a', M_METAL);
    m.box(20, 31, 16, 25, 43, 17, '#4f5a4b', M_METAL);
    m.box(25, 31, 16, 26, 32, 17, '#1c1c1a', M_METAL);
    m.box(26, 31, 16, 31, 43, 17, '#4f5a4b', M_METAL);
    m.box(31, 31, 16, 32, 32, 17, '#1c1c1a', M_METAL);
    m.box(32, 31, 16, 37, 43, 17, '#4f5a4b', M_METAL);
    m.box(37, 31, 16, 38, 32, 17, '#1c1c1a', M_METAL);
    m.box(38, 31, 16, 43, 43, 17, '#4f5a4b', M_METAL);
    m.box(43, 31, 16, 44, 32, 17, '#1c1c1a', M_METAL);
    m.box(44, 31, 16, 47, 43, 17, '#4f5a4b', M_METAL);
    m.box(1, 32, 16, 2, 42, 17, '#4f5a4b', M_METAL);
    m.box(7, 32, 16, 8, 42, 17, '#4f5a4b', M_METAL);
    m.box(13, 32, 16, 14, 42, 17, '#4f5a4b', M_METAL);
    m.box(19, 32, 16, 20, 42, 17, '#4f5a4b', M_METAL);
    m.box(25, 32, 16, 26, 42, 17, '#4f5a4b', M_METAL);
    m.box(31, 32, 16, 32, 42, 17, '#4f5a4b', M_METAL);
    m.box(37, 32, 16, 38, 42, 17, '#4f5a4b', M_METAL);
    m.box(43, 32, 16, 44, 42, 17, '#4f5a4b', M_METAL);
    m.box(1, 42, 16, 2, 43, 17, '#1c1c1a', M_METAL);
    m.box(7, 42, 16, 8, 43, 17, '#1c1c1a', M_METAL);
    m.box(13, 42, 16, 14, 43, 17, '#1c1c1a', M_METAL);
    m.box(19, 42, 16, 20, 43, 17, '#1c1c1a', M_METAL);
    m.box(25, 42, 16, 26, 43, 17, '#1c1c1a', M_METAL);
    m.box(31, 42, 16, 32, 43, 17, '#1c1c1a', M_METAL);
    m.box(37, 42, 16, 38, 43, 17, '#1c1c1a', M_METAL);
    m.box(43, 42, 16, 44, 43, 17, '#1c1c1a', M_METAL);
    m.box(19, 45, 16, 25, 46, 17, '#e4e2d8', M_MATTE);
    m.box(26, 45, 16, 29, 46, 17, '#e4e2d8', M_MATTE);
    m.box(10, 8, 17, 11, 20, 36, '#b9b6ac', M_ROUGH);
    m.box(17, 8, 17, 18, 20, 36, '#b9b6ac', M_ROUGH);
    m.box(7, 11, 17, 8, 17, 36, '#b9b6ac', M_ROUGH);
    m.box(20, 11, 17, 21, 17, 36, '#b9b6ac', M_ROUGH);
    m.box(1, 33, 17, 47, 41, 18, '#4f5a4b', M_METAL);
    m.box(20, 45, 17, 25, 46, 18, '#e4e2d8', M_MATTE);
    m.box(26, 45, 17, 28, 46, 18, '#e4e2d8', M_MATTE);
    m.box(20, 46, 17, 21, 47, 18, '#e4e2d8', M_MATTE);
    m.box(27, 46, 17, 28, 47, 18, '#e4e2d8', M_MATTE);
    m.box(1, 32, 18, 2, 33, 19, '#1c1c1a', M_METAL);
    m.box(7, 32, 18, 8, 33, 19, '#1c1c1a', M_METAL);
    m.box(13, 32, 18, 14, 33, 19, '#1c1c1a', M_METAL);
    m.box(19, 32, 18, 20, 33, 19, '#1c1c1a', M_METAL);
    m.box(25, 32, 18, 26, 33, 19, '#1c1c1a', M_METAL);
    m.box(31, 32, 18, 32, 33, 19, '#1c1c1a', M_METAL);
    m.box(37, 32, 18, 38, 33, 19, '#1c1c1a', M_METAL);
    m.box(43, 32, 18, 44, 33, 19, '#1c1c1a', M_METAL);
    m.box(1, 34, 18, 47, 40, 19, '#4f5a4b', M_METAL);
    m.box(1, 41, 18, 2, 42, 19, '#1c1c1a', M_METAL);
    m.box(7, 41, 18, 8, 42, 19, '#1c1c1a', M_METAL);
    m.box(13, 41, 18, 14, 42, 19, '#1c1c1a', M_METAL);
    m.box(19, 41, 18, 20, 42, 19, '#1c1c1a', M_METAL);
    m.box(25, 41, 18, 26, 42, 19, '#1c1c1a', M_METAL);
    m.box(31, 41, 18, 32, 42, 19, '#1c1c1a', M_METAL);
    m.box(37, 41, 18, 38, 42, 19, '#1c1c1a', M_METAL);
    m.box(43, 41, 18, 44, 42, 19, '#1c1c1a', M_METAL);
    m.box(21, 45, 18, 25, 46, 19, '#e4e2d8', M_MATTE);
    m.box(26, 45, 18, 27, 46, 19, '#e4e2d8', M_MATTE);
    m.box(9, 9, 19, 10, 19, 36, '#b9b6ac', M_ROUGH);
    m.box(18, 9, 19, 19, 19, 36, '#b9b6ac', M_ROUGH);
    m.box(8, 10, 19, 9, 18, 36, '#b9b6ac', M_ROUGH);
    m.box(19, 10, 19, 20, 18, 36, '#b9b6ac', M_ROUGH);
    m.box(33, 21, 19, 35, 23, 28, '#7f8480', M_METAL);
    m.box(41, 21, 19, 43, 23, 28, '#7f8480', M_METAL);
    m.box(1, 33, 19, 2, 34, 20, '#1c1c1a', M_METAL);
    m.box(7, 33, 19, 8, 34, 20, '#1c1c1a', M_METAL);
    m.box(13, 33, 19, 14, 34, 20, '#1c1c1a', M_METAL);
    m.box(19, 33, 19, 20, 34, 20, '#1c1c1a', M_METAL);
    m.box(25, 33, 19, 26, 34, 20, '#1c1c1a', M_METAL);
    m.box(31, 33, 19, 32, 34, 20, '#1c1c1a', M_METAL);
    m.box(37, 33, 19, 38, 34, 20, '#1c1c1a', M_METAL);
    m.box(43, 33, 19, 44, 34, 20, '#1c1c1a', M_METAL);
    m.box(1, 36, 19, 47, 38, 20, pal.main, M_MATTE);
    m.box(1, 40, 19, 2, 41, 20, '#1c1c1a', M_METAL);
    m.box(7, 40, 19, 8, 41, 20, '#1c1c1a', M_METAL);
    m.box(13, 40, 19, 14, 41, 20, '#1c1c1a', M_METAL);
    m.box(19, 40, 19, 20, 41, 20, '#1c1c1a', M_METAL);
    m.box(25, 40, 19, 26, 41, 20, '#1c1c1a', M_METAL);
    m.box(31, 40, 19, 32, 41, 20, '#1c1c1a', M_METAL);
    m.box(37, 40, 19, 38, 41, 20, '#1c1c1a', M_METAL);
    m.box(43, 40, 19, 44, 41, 20, '#1c1c1a', M_METAL);
    m.box(22, 45, 19, 25, 48, 20, '#e4e2d8', M_MATTE);
    m.box(25, 46, 19, 26, 48, 20, '#e4e2d8', M_MATTE);
    m.box(7, 35, 20, 12, 39, 24, '#5b5d58', M_METAL);
    m.box(35, 35, 20, 40, 39, 24, '#5b5d58', M_METAL);
    m.box(9, 8, 27, 10, 9, 36, '#b9b6ac', M_ROUGH);
    m.box(18, 8, 27, 19, 9, 36, '#b9b6ac', M_ROUGH);
    m.box(8, 9, 27, 9, 10, 36, '#b9b6ac', M_ROUGH);
    m.box(19, 9, 27, 20, 10, 36, '#b9b6ac', M_ROUGH);
    m.box(8, 18, 27, 9, 19, 36, '#b9b6ac', M_ROUGH);
    m.box(19, 18, 27, 20, 19, 36, '#b9b6ac', M_ROUGH);
    m.box(9, 19, 27, 10, 20, 36, '#b9b6ac', M_ROUGH);
    m.box(18, 19, 27, 19, 20, 36, '#b9b6ac', M_ROUGH);
    m.box(10, 7, 29, 11, 8, 36, '#b9b6ac', M_ROUGH);
    m.box(17, 7, 29, 18, 8, 36, '#b9b6ac', M_ROUGH);
    m.box(7, 10, 29, 8, 11, 36, '#b9b6ac', M_ROUGH);
    m.box(20, 10, 29, 21, 11, 36, '#b9b6ac', M_ROUGH);
    m.box(7, 17, 29, 8, 18, 36, '#b9b6ac', M_ROUGH);
    m.box(20, 17, 29, 21, 18, 36, '#b9b6ac', M_ROUGH);
    m.box(10, 20, 29, 11, 21, 36, '#b9b6ac', M_ROUGH);
    m.box(17, 20, 29, 18, 21, 36, '#b9b6ac', M_ROUGH);
    m.box(12, 6, 31, 16, 7, 36, '#b9b6ac', M_ROUGH);
    m.box(6, 12, 31, 7, 16, 36, '#b9b6ac', M_ROUGH);
    m.box(21, 12, 31, 22, 16, 36, '#b9b6ac', M_ROUGH);
    m.box(12, 21, 31, 16, 22, 36, '#b9b6ac', M_ROUGH);
    m.box(11, 6, 33, 12, 7, 36, '#b9b6ac', M_ROUGH);
    m.box(16, 6, 33, 17, 7, 36, '#b9b6ac', M_ROUGH);
    m.box(9, 7, 33, 10, 8, 36, '#b9b6ac', M_ROUGH);
    m.box(18, 7, 33, 19, 8, 36, '#b9b6ac', M_ROUGH);
    m.box(8, 8, 33, 9, 9, 36, '#b9b6ac', M_ROUGH);
    m.box(19, 8, 33, 20, 9, 36, '#b9b6ac', M_ROUGH);
    m.box(7, 9, 33, 8, 10, 36, '#b9b6ac', M_ROUGH);
    m.box(20, 9, 33, 21, 10, 36, '#b9b6ac', M_ROUGH);
    m.box(6, 11, 33, 7, 12, 36, '#b9b6ac', M_ROUGH);
    m.box(21, 11, 33, 22, 12, 36, '#b9b6ac', M_ROUGH);
    m.box(6, 16, 33, 7, 17, 36, '#b9b6ac', M_ROUGH);
    m.box(21, 16, 33, 22, 17, 36, '#b9b6ac', M_ROUGH);
    m.box(7, 18, 33, 8, 19, 36, '#b9b6ac', M_ROUGH);
    m.box(20, 18, 33, 21, 19, 36, '#b9b6ac', M_ROUGH);
    m.box(8, 19, 33, 9, 20, 36, '#b9b6ac', M_ROUGH);
    m.box(19, 19, 33, 20, 20, 36, '#b9b6ac', M_ROUGH);
    m.box(9, 20, 33, 10, 21, 36, '#b9b6ac', M_ROUGH);
    m.box(18, 20, 33, 19, 21, 36, '#b9b6ac', M_ROUGH);
    m.box(11, 21, 33, 12, 22, 36, '#b9b6ac', M_ROUGH);
    m.box(16, 21, 33, 17, 22, 36, '#b9b6ac', M_ROUGH);
    m.box(10, 6, 35, 11, 7, 36, '#b9b6ac', M_ROUGH);
    m.box(17, 6, 35, 18, 7, 36, '#b9b6ac', M_ROUGH);
    m.box(6, 10, 35, 7, 11, 36, '#b9b6ac', M_ROUGH);
    m.box(21, 10, 35, 22, 11, 36, '#b9b6ac', M_ROUGH);
    m.box(6, 17, 35, 7, 18, 36, '#b9b6ac', M_ROUGH);
    m.box(21, 17, 35, 22, 18, 36, '#b9b6ac', M_ROUGH);
    m.box(10, 21, 35, 11, 22, 36, '#b9b6ac', M_ROUGH);
    m.box(17, 21, 35, 18, 22, 36, '#b9b6ac', M_ROUGH);
    m.box(13, 5, 36, 15, 23, 38, pal.main, M_MATTE);
    m.box(10, 6, 36, 13, 22, 38, pal.main, M_MATTE);
    m.box(15, 6, 36, 18, 22, 38, pal.main, M_MATTE);
    m.box(8, 7, 36, 10, 21, 38, pal.main, M_MATTE);
    m.box(18, 7, 36, 20, 21, 38, pal.main, M_MATTE);
    m.box(7, 8, 36, 8, 20, 38, pal.main, M_MATTE);
    m.box(20, 8, 36, 21, 20, 38, pal.main, M_MATTE);
    m.box(6, 10, 36, 7, 18, 38, pal.main, M_MATTE);
    m.box(21, 10, 36, 22, 18, 38, pal.main, M_MATTE);
    m.box(5, 13, 36, 6, 15, 38, pal.main, M_MATTE);
    m.box(22, 13, 36, 23, 15, 38, pal.main, M_MATTE);
    m.box(11, 5, 37, 13, 6, 39, '#b9b6ac', M_ROUGH);
    m.box(15, 5, 37, 17, 6, 39, '#b9b6ac', M_ROUGH);
    m.box(9, 6, 37, 10, 7, 39, '#b9b6ac', M_ROUGH);
    m.box(18, 6, 37, 19, 7, 39, '#b9b6ac', M_ROUGH);
    m.box(6, 9, 37, 7, 10, 39, '#b9b6ac', M_ROUGH);
    m.box(21, 9, 37, 22, 10, 39, '#b9b6ac', M_ROUGH);
    m.box(5, 11, 37, 6, 13, 39, '#b9b6ac', M_ROUGH);
    m.box(22, 11, 37, 23, 13, 39, '#b9b6ac', M_ROUGH);
    m.box(5, 15, 37, 6, 17, 39, '#b9b6ac', M_ROUGH);
    m.box(22, 15, 37, 23, 17, 39, '#b9b6ac', M_ROUGH);
    m.box(6, 18, 37, 7, 19, 39, '#b9b6ac', M_ROUGH);
    m.box(21, 18, 37, 22, 19, 39, '#b9b6ac', M_ROUGH);
    m.box(9, 21, 37, 10, 22, 39, '#b9b6ac', M_ROUGH);
    m.box(18, 21, 37, 19, 22, 39, '#b9b6ac', M_ROUGH);
    m.box(11, 22, 37, 13, 23, 39, '#b9b6ac', M_ROUGH);
    m.box(15, 22, 37, 17, 23, 39, '#b9b6ac', M_ROUGH);
    m.box(13, 5, 38, 15, 23, 39, '#b9b6ac', M_ROUGH);
    m.box(10, 6, 38, 13, 22, 39, '#b9b6ac', M_ROUGH);
    m.box(15, 6, 38, 18, 22, 39, '#b9b6ac', M_ROUGH);
    m.box(8, 7, 38, 10, 21, 39, '#b9b6ac', M_ROUGH);
    m.box(18, 7, 38, 20, 21, 39, '#b9b6ac', M_ROUGH);
    m.box(7, 8, 38, 8, 20, 39, '#b9b6ac', M_ROUGH);
    m.box(20, 8, 38, 21, 20, 39, '#b9b6ac', M_ROUGH);
    m.box(6, 10, 38, 7, 18, 39, '#b9b6ac', M_ROUGH);
    m.box(21, 10, 38, 22, 18, 39, '#b9b6ac', M_ROUGH);
    m.box(5, 13, 38, 6, 15, 39, '#b9b6ac', M_ROUGH);
    m.box(22, 13, 38, 23, 15, 39, '#b9b6ac', M_ROUGH);
    // (by hand, after the generated part) the cooling tower is open on top: hollow it down to a dark floor, sooted inside
    m.cylZ(14, 14, 29, 40, 6.6, null);
    m.cylZ(14, 14, 28, 29, 7, '#24231f', M_ROUGH);
    m.paint(5, 5, 29, 24, 24, 40, (x, y, z) => (Math.hypot(x + 0.5 - 14, y + 0.5 - 14) < 7.8 ? (z > 37 ? '#55524b' : '#3a3833') : undefined));
    starFront(m, 24, 47, 17.2, 2.2, pal.main);
    return m;
  },
  // BLENDER:power_soviets end
  // BLENDER:apower_soviets begin
  apower(pal) {
    const m = new VModel(-2, -2, 74, 74, 64);
    m.box(-1, -1, 0, 73, 73, 1, '#6e6352', M_ROUGH);
    m.box(60, 3, 1, 61, 4, 5, '#46473f', M_METAL);
    m.box(65, 3, 1, 66, 4, 5, '#46473f', M_METAL);
    m.box(67, 3, 1, 68, 4, 5, '#46473f', M_METAL);
    m.box(59, 4, 1, 69, 12, 5, '#5b5d58', M_METAL);
    m.box(12, 6, 1, 20, 30, 2, '#878275', M_ROUGH);
    m.box(42, 6, 1, 50, 30, 2, '#878275', M_ROUGH);
    m.box(10, 7, 1, 12, 29, 3, '#878275', M_ROUGH);
    m.box(20, 7, 1, 22, 29, 3, '#878275', M_ROUGH);
    m.box(40, 7, 1, 42, 29, 3, '#878275', M_ROUGH);
    m.box(50, 7, 1, 52, 29, 3, '#878275', M_ROUGH);
    m.box(8, 8, 1, 10, 28, 3, '#878275', M_ROUGH);
    m.box(22, 8, 1, 24, 28, 3, '#878275', M_ROUGH);
    m.box(38, 8, 1, 40, 28, 3, '#878275', M_ROUGH);
    m.box(52, 8, 1, 54, 28, 3, '#878275', M_ROUGH);
    m.box(7, 9, 1, 8, 27, 3, '#878275', M_ROUGH);
    m.box(24, 9, 1, 25, 27, 3, '#878275', M_ROUGH);
    m.box(37, 9, 1, 38, 27, 3, '#878275', M_ROUGH);
    m.box(54, 9, 1, 55, 27, 3, '#878275', M_ROUGH);
    m.box(6, 10, 1, 7, 26, 3, '#878275', M_ROUGH);
    m.box(25, 10, 1, 26, 26, 3, '#878275', M_ROUGH);
    m.box(36, 10, 1, 37, 26, 3, '#878275', M_ROUGH);
    m.box(55, 10, 1, 56, 26, 3, '#878275', M_ROUGH);
    m.box(5, 12, 1, 6, 24, 3, '#878275', M_ROUGH);
    m.box(26, 12, 1, 27, 24, 3, '#878275', M_ROUGH);
    m.box(35, 12, 1, 36, 24, 3, '#878275', M_ROUGH);
    m.box(56, 12, 1, 57, 24, 3, '#878275', M_ROUGH);
    m.box(4, 14, 1, 5, 22, 3, '#878275', M_ROUGH);
    m.box(27, 14, 1, 28, 22, 3, '#878275', M_ROUGH);
    m.box(34, 14, 1, 35, 22, 3, '#878275', M_ROUGH);
    m.box(57, 14, 1, 58, 22, 3, '#878275', M_ROUGH);
    m.box(60, 17, 1, 61, 18, 5, '#46473f', M_METAL);
    m.box(65, 17, 1, 66, 18, 5, '#46473f', M_METAL);
    m.box(67, 17, 1, 68, 18, 5, '#46473f', M_METAL);
    m.box(59, 18, 1, 69, 26, 5, '#5b5d58', M_METAL);
    m.box(1, 39, 1, 70, 40, 2, '#b3a574', M_ROUGH);
    m.box(0, 40, 1, 8, 70, 19, '#cdbf8e', M_ROUGH);
    m.box(8, 40, 1, 64, 69, 3, '#b3a574', M_ROUGH);
    m.box(64, 40, 1, 72, 70, 11, '#cdbf8e', M_ROUGH);
    m.box(8, 69, 1, 11, 70, 3, '#b3a574', M_ROUGH);
    m.box(11, 69, 1, 13, 70, 14, '#e4e2d8', M_MATTE);
    m.box(13, 69, 1, 19, 70, 3, '#b3a574', M_ROUGH);
    m.box(19, 69, 1, 21, 70, 14, '#e4e2d8', M_MATTE);
    m.box(21, 69, 1, 27, 70, 3, '#b3a574', M_ROUGH);
    m.box(27, 69, 1, 29, 72, 14, '#e4e2d8', M_MATTE);
    m.box(29, 69, 1, 32, 70, 3, '#b3a574', M_ROUGH);
    m.box(32, 69, 1, 40, 70, 8, '#3a2a22', M_MATTE);
    m.box(40, 69, 1, 43, 70, 3, '#b3a574', M_ROUGH);
    m.box(43, 69, 1, 45, 72, 14, '#e4e2d8', M_MATTE);
    m.box(45, 69, 1, 51, 70, 3, '#b3a574', M_ROUGH);
    m.box(51, 69, 1, 53, 70, 14, '#e4e2d8', M_MATTE);
    m.box(53, 69, 1, 59, 70, 3, '#b3a574', M_ROUGH);
    m.box(59, 69, 1, 61, 70, 14, '#e4e2d8', M_MATTE);
    m.box(61, 69, 1, 64, 70, 3, '#b3a574', M_ROUGH);
    m.box(25, 70, 1, 27, 73, 2, '#a39e91', M_ROUGH);
    m.box(29, 70, 1, 32, 73, 2, '#a39e91', M_ROUGH);
    m.box(32, 70, 1, 34, 72, 21, '#e4e2d8', M_MATTE);
    m.box(34, 70, 1, 38, 73, 2, '#a39e91', M_ROUGH);
    m.box(38, 70, 1, 40, 72, 21, '#e4e2d8', M_MATTE);
    m.box(40, 70, 1, 43, 73, 2, '#a39e91', M_ROUGH);
    m.box(45, 70, 1, 47, 73, 2, '#a39e91', M_ROUGH);
    m.box(27, 72, 1, 29, 73, 2, '#a39e91', M_ROUGH);
    m.box(32, 72, 1, 34, 73, 2, '#a39e91', M_ROUGH);
    m.box(38, 72, 1, 40, 73, 2, '#a39e91', M_ROUGH);
    m.box(43, 72, 1, 45, 73, 2, '#a39e91', M_ROUGH);
    m.box(12, 6, 2, 20, 29, 3, '#878275', M_ROUGH);
    m.box(42, 6, 2, 50, 29, 3, '#878275', M_ROUGH);
    m.box(12, 29, 2, 14, 30, 3, '#878275', M_ROUGH);
    m.box(14, 29, 2, 18, 40, 6, '#7f8480', M_METAL);
    m.box(18, 29, 2, 20, 30, 3, '#878275', M_ROUGH);
    m.box(42, 29, 2, 44, 30, 3, '#878275', M_ROUGH);
    m.box(44, 29, 2, 48, 40, 6, '#7f8480', M_METAL);
    m.box(48, 29, 2, 50, 30, 3, '#878275', M_ROUGH);
    m.box(1, 39, 2, 14, 40, 3, '#b3a574', M_ROUGH);
    m.box(18, 39, 2, 44, 40, 3, '#b3a574', M_ROUGH);
    m.box(48, 39, 2, 70, 40, 3, '#b3a574', M_ROUGH);
    m.box(12, 8, 3, 20, 28, 5, '#b9b6ac', M_ROUGH);
    m.box(42, 8, 3, 50, 28, 5, '#b9b6ac', M_ROUGH);
    m.box(10, 9, 3, 12, 27, 5, '#b9b6ac', M_ROUGH);
    m.box(20, 9, 3, 22, 27, 5, '#b9b6ac', M_ROUGH);
    m.box(40, 9, 3, 42, 27, 5, '#b9b6ac', M_ROUGH);
    m.box(50, 9, 3, 52, 27, 5, '#b9b6ac', M_ROUGH);
    m.box(9, 10, 3, 10, 26, 5, '#b9b6ac', M_ROUGH);
    m.box(22, 10, 3, 23, 26, 5, '#b9b6ac', M_ROUGH);
    m.box(39, 10, 3, 40, 26, 5, '#b9b6ac', M_ROUGH);
    m.box(52, 10, 3, 53, 26, 5, '#b9b6ac', M_ROUGH);
    m.box(8, 11, 3, 9, 25, 5, '#b9b6ac', M_ROUGH);
    m.box(23, 11, 3, 24, 25, 5, '#b9b6ac', M_ROUGH);
    m.box(38, 11, 3, 39, 25, 5, '#b9b6ac', M_ROUGH);
    m.box(53, 11, 3, 54, 25, 5, '#b9b6ac', M_ROUGH);
    m.box(7, 12, 3, 8, 24, 5, '#b9b6ac', M_ROUGH);
    m.box(24, 12, 3, 25, 24, 5, '#b9b6ac', M_ROUGH);
    m.box(37, 12, 3, 38, 24, 5, '#b9b6ac', M_ROUGH);
    m.box(54, 12, 3, 55, 24, 5, '#b9b6ac', M_ROUGH);
    m.box(6, 14, 3, 7, 22, 5, '#b9b6ac', M_ROUGH);
    m.box(25, 14, 3, 26, 22, 5, '#b9b6ac', M_ROUGH);
    m.box(36, 14, 3, 37, 22, 5, '#b9b6ac', M_ROUGH);
    m.box(55, 14, 3, 56, 22, 5, '#b9b6ac', M_ROUGH);
    m.box(8, 40, 3, 64, 69, 11, '#cdbf8e', M_ROUGH);
    m.box(8, 69, 3, 11, 70, 4, '#cdbf8e', M_ROUGH);
    m.box(13, 69, 3, 19, 70, 4, '#cdbf8e', M_ROUGH);
    m.box(21, 69, 3, 27, 70, 4, '#cdbf8e', M_ROUGH);
    m.box(29, 69, 3, 32, 70, 13, '#cdbf8e', M_ROUGH);
    m.box(40, 69, 3, 43, 70, 13, '#cdbf8e', M_ROUGH);
    m.box(45, 69, 3, 51, 70, 4, '#cdbf8e', M_ROUGH);
    m.box(53, 69, 3, 59, 70, 4, '#cdbf8e', M_ROUGH);
    m.box(61, 69, 3, 64, 70, 4, '#cdbf8e', M_ROUGH);
    m.box(8, 69, 4, 10, 70, 12, '#2c4452', M_GLASS);
    m.box(10, 69, 4, 11, 70, 13, '#cdbf8e', M_ROUGH);
    m.box(13, 69, 4, 14, 70, 13, '#cdbf8e', M_ROUGH);
    m.box(14, 69, 4, 18, 70, 12, '#2c4452', M_GLASS);
    m.box(18, 69, 4, 19, 70, 13, '#cdbf8e', M_ROUGH);
    m.box(21, 69, 4, 22, 70, 13, '#cdbf8e', M_ROUGH);
    m.box(22, 69, 4, 26, 70, 12, '#2c4452', M_GLASS);
    m.box(26, 69, 4, 27, 70, 13, '#cdbf8e', M_ROUGH);
    m.box(45, 69, 4, 46, 70, 13, '#cdbf8e', M_ROUGH);
    m.box(46, 69, 4, 50, 70, 12, '#2c4452', M_GLASS);
    m.box(50, 69, 4, 51, 70, 13, '#cdbf8e', M_ROUGH);
    m.box(53, 69, 4, 54, 70, 13, '#cdbf8e', M_ROUGH);
    m.box(54, 69, 4, 58, 70, 12, '#2c4452', M_GLASS);
    m.box(58, 69, 4, 59, 70, 13, '#cdbf8e', M_ROUGH);
    m.box(61, 69, 4, 62, 70, 13, '#cdbf8e', M_ROUGH);
    m.box(62, 69, 4, 64, 70, 12, '#2c4452', M_GLASS);
    m.box(62, 5, 5, 66, 11, 7, '#34362f', M_METAL);
    m.box(61, 6, 5, 62, 10, 7, '#34362f', M_METAL);
    m.box(66, 6, 5, 67, 10, 7, '#34362f', M_METAL);
    m.box(60, 7, 5, 61, 9, 7, '#34362f', M_METAL);
    m.box(67, 7, 5, 68, 9, 7, '#34362f', M_METAL);
    m.box(15, 8, 5, 17, 28, 7, '#b9b6ac', M_ROUGH);
    m.box(45, 8, 5, 47, 28, 7, '#b9b6ac', M_ROUGH);
    m.box(12, 9, 5, 15, 27, 7, '#b9b6ac', M_ROUGH);
    m.box(17, 9, 5, 20, 27, 7, '#b9b6ac', M_ROUGH);
    m.box(42, 9, 5, 45, 27, 7, '#b9b6ac', M_ROUGH);
    m.box(47, 9, 5, 50, 27, 7, '#b9b6ac', M_ROUGH);
    m.box(10, 10, 5, 12, 26, 7, '#b9b6ac', M_ROUGH);
    m.box(20, 10, 5, 22, 26, 7, '#b9b6ac', M_ROUGH);
    m.box(40, 10, 5, 42, 26, 7, '#b9b6ac', M_ROUGH);
    m.box(50, 10, 5, 52, 26, 7, '#b9b6ac', M_ROUGH);
    m.box(9, 11, 5, 10, 25, 7, '#b9b6ac', M_ROUGH);
    m.box(22, 11, 5, 23, 25, 7, '#b9b6ac', M_ROUGH);
    m.box(39, 11, 5, 40, 25, 7, '#b9b6ac', M_ROUGH);
    m.box(52, 11, 5, 53, 25, 7, '#b9b6ac', M_ROUGH);
    m.box(8, 12, 5, 9, 24, 7, '#b9b6ac', M_ROUGH);
    m.box(23, 12, 5, 24, 24, 7, '#b9b6ac', M_ROUGH);
    m.box(38, 12, 5, 39, 24, 7, '#b9b6ac', M_ROUGH);
    m.box(53, 12, 5, 54, 24, 7, '#b9b6ac', M_ROUGH);
    m.box(7, 14, 5, 8, 22, 7, '#b9b6ac', M_ROUGH);
    m.box(24, 14, 5, 25, 22, 7, '#b9b6ac', M_ROUGH);
    m.box(37, 14, 5, 38, 22, 7, '#b9b6ac', M_ROUGH);
    m.box(54, 14, 5, 55, 22, 7, '#b9b6ac', M_ROUGH);
    m.box(6, 17, 5, 7, 19, 7, '#b9b6ac', M_ROUGH);
    m.box(25, 17, 5, 26, 19, 7, '#b9b6ac', M_ROUGH);
    m.box(36, 17, 5, 37, 19, 7, '#b9b6ac', M_ROUGH);
    m.box(55, 17, 5, 56, 19, 7, '#b9b6ac', M_ROUGH);
    m.box(62, 19, 5, 66, 25, 7, '#34362f', M_METAL);
    m.box(61, 20, 5, 62, 24, 7, '#34362f', M_METAL);
    m.box(66, 20, 5, 67, 24, 7, '#34362f', M_METAL);
    m.box(60, 21, 5, 61, 23, 7, '#34362f', M_METAL);
    m.box(67, 21, 5, 68, 23, 7, '#34362f', M_METAL);
    m.box(64, 0, 6, 65, 1, 14, '#7f8480', M_METAL);
    m.box(67, 0, 6, 68, 1, 14, '#7f8480', M_METAL);
    m.box(64, 3, 6, 65, 4, 14, '#7f8480', M_METAL);
    m.box(67, 3, 6, 68, 4, 14, '#7f8480', M_METAL);
    m.box(16, 29, 6, 46, 31, 8, '#7f8480', M_METAL);
    m.box(60, 32, 6, 61, 33, 14, '#7f8480', M_METAL);
    m.box(63, 32, 6, 64, 33, 14, '#7f8480', M_METAL);
    m.box(68, 32, 6, 69, 33, 14, '#7f8480', M_METAL);
    m.box(71, 32, 6, 72, 33, 14, '#7f8480', M_METAL);
    m.box(60, 35, 6, 61, 36, 14, '#7f8480', M_METAL);
    m.box(63, 35, 6, 64, 36, 14, '#7f8480', M_METAL);
    m.box(68, 35, 6, 69, 36, 14, '#7f8480', M_METAL);
    m.box(71, 35, 6, 72, 36, 14, '#7f8480', M_METAL);
    m.box(60, 7, 7, 62, 9, 9, '#e4e2d8', M_MATTE);
    m.box(63, 7, 7, 65, 9, 9, '#e4e2d8', M_MATTE);
    m.box(66, 7, 7, 68, 9, 9, '#e4e2d8', M_MATTE);
    m.box(13, 9, 7, 19, 27, 9, '#b9b6ac', M_ROUGH);
    m.box(43, 9, 7, 49, 27, 9, '#b9b6ac', M_ROUGH);
    m.box(11, 10, 7, 13, 26, 9, '#b9b6ac', M_ROUGH);
    m.box(19, 10, 7, 21, 26, 9, '#b9b6ac', M_ROUGH);
    m.box(41, 10, 7, 43, 26, 9, '#b9b6ac', M_ROUGH);
    m.box(49, 10, 7, 51, 26, 9, '#b9b6ac', M_ROUGH);
    m.box(10, 11, 7, 11, 25, 9, '#b9b6ac', M_ROUGH);
    m.box(21, 11, 7, 22, 25, 9, '#b9b6ac', M_ROUGH);
    m.box(40, 11, 7, 41, 25, 9, '#b9b6ac', M_ROUGH);
    m.box(51, 11, 7, 52, 25, 9, '#b9b6ac', M_ROUGH);
    m.box(9, 12, 7, 10, 24, 9, '#b9b6ac', M_ROUGH);
    m.box(22, 12, 7, 23, 24, 9, '#b9b6ac', M_ROUGH);
    m.box(39, 12, 7, 40, 24, 9, '#b9b6ac', M_ROUGH);
    m.box(52, 12, 7, 53, 24, 9, '#b9b6ac', M_ROUGH);
    m.box(8, 13, 7, 9, 23, 9, '#b9b6ac', M_ROUGH);
    m.box(23, 13, 7, 24, 23, 9, '#b9b6ac', M_ROUGH);
    m.box(38, 13, 7, 39, 23, 9, '#b9b6ac', M_ROUGH);
    m.box(53, 13, 7, 54, 23, 9, '#b9b6ac', M_ROUGH);
    m.box(7, 15, 7, 8, 21, 9, '#b9b6ac', M_ROUGH);
    m.box(24, 15, 7, 25, 21, 9, '#b9b6ac', M_ROUGH);
    m.box(37, 15, 7, 38, 21, 9, '#b9b6ac', M_ROUGH);
    m.box(54, 15, 7, 55, 21, 9, '#b9b6ac', M_ROUGH);
    m.box(60, 21, 7, 62, 23, 9, '#e4e2d8', M_MATTE);
    m.box(63, 21, 7, 65, 23, 9, '#e4e2d8', M_MATTE);
    m.box(66, 21, 7, 68, 23, 9, '#e4e2d8', M_MATTE);
    m.box(32, 69, 8, 35, 70, 13, '#cdbf8e', M_ROUGH);
    m.box(35, 69, 8, 37, 70, 14, '#e4e2d8', M_MATTE);
    m.box(37, 69, 8, 40, 70, 13, '#cdbf8e', M_ROUGH);
    m.box(12, 10, 9, 20, 26, 11, '#b9b6ac', M_ROUGH);
    m.box(42, 10, 9, 50, 26, 11, '#b9b6ac', M_ROUGH);
    m.box(11, 11, 9, 12, 25, 13, '#b9b6ac', M_ROUGH);
    m.box(20, 11, 9, 21, 25, 13, '#b9b6ac', M_ROUGH);
    m.box(41, 11, 9, 42, 25, 13, '#b9b6ac', M_ROUGH);
    m.box(50, 11, 9, 51, 25, 13, '#b9b6ac', M_ROUGH);
    m.box(10, 12, 9, 11, 24, 13, '#b9b6ac', M_ROUGH);
    m.box(21, 12, 9, 22, 24, 13, '#b9b6ac', M_ROUGH);
    m.box(40, 12, 9, 41, 24, 13, '#b9b6ac', M_ROUGH);
    m.box(51, 12, 9, 52, 24, 13, '#b9b6ac', M_ROUGH);
    m.box(9, 13, 9, 10, 23, 13, '#b9b6ac', M_ROUGH);
    m.box(22, 13, 9, 23, 23, 13, '#b9b6ac', M_ROUGH);
    m.box(39, 13, 9, 40, 23, 13, '#b9b6ac', M_ROUGH);
    m.box(52, 13, 9, 53, 23, 13, '#b9b6ac', M_ROUGH);
    m.box(8, 14, 9, 9, 22, 11, '#b9b6ac', M_ROUGH);
    m.box(23, 14, 9, 24, 22, 11, '#b9b6ac', M_ROUGH);
    m.box(38, 14, 9, 39, 22, 11, '#b9b6ac', M_ROUGH);
    m.box(53, 14, 9, 54, 22, 11, '#b9b6ac', M_ROUGH);
    m.box(13, 10, 11, 19, 26, 13, '#b9b6ac', M_ROUGH);
    m.box(43, 10, 11, 49, 26, 13, '#b9b6ac', M_ROUGH);
    m.box(12, 11, 11, 13, 25, 17, '#b9b6ac', M_ROUGH);
    m.box(19, 11, 11, 20, 25, 17, '#b9b6ac', M_ROUGH);
    m.box(42, 11, 11, 43, 25, 17, '#b9b6ac', M_ROUGH);
    m.box(49, 11, 11, 50, 25, 17, '#b9b6ac', M_ROUGH);
    m.box(8, 15, 11, 9, 21, 13, '#b9b6ac', M_ROUGH);
    m.box(23, 15, 11, 24, 21, 13, '#b9b6ac', M_ROUGH);
    m.box(38, 15, 11, 39, 21, 13, '#b9b6ac', M_ROUGH);
    m.box(53, 15, 11, 54, 21, 13, '#b9b6ac', M_ROUGH);
    m.box(53, 37, 11, 55, 39, 12, '#34362f', M_METAL);
    m.box(8, 40, 11, 72, 44, 14, '#cdbf8e', M_ROUGH);
    m.box(8, 44, 11, 9, 45, 12, '#1c1c1a', M_METAL);
    m.box(9, 44, 11, 15, 69, 13, '#cdbf8e', M_ROUGH);
    m.box(15, 44, 11, 16, 45, 12, '#1c1c1a', M_METAL);
    m.box(16, 44, 11, 22, 69, 13, '#cdbf8e', M_ROUGH);
    m.box(22, 44, 11, 23, 45, 12, '#1c1c1a', M_METAL);
    m.box(23, 44, 11, 29, 69, 13, '#cdbf8e', M_ROUGH);
    m.box(29, 44, 11, 30, 45, 12, '#1c1c1a', M_METAL);
    m.box(30, 44, 11, 36, 69, 13, '#cdbf8e', M_ROUGH);
    m.box(36, 44, 11, 37, 45, 12, '#1c1c1a', M_METAL);
    m.box(37, 44, 11, 43, 69, 13, '#cdbf8e', M_ROUGH);
    m.box(43, 44, 11, 44, 45, 12, '#1c1c1a', M_METAL);
    m.box(44, 44, 11, 50, 69, 13, '#cdbf8e', M_ROUGH);
    m.box(50, 44, 11, 51, 45, 12, '#1c1c1a', M_METAL);
    m.box(51, 44, 11, 57, 69, 13, '#cdbf8e', M_ROUGH);
    m.box(57, 44, 11, 58, 45, 12, '#1c1c1a', M_METAL);
    m.box(58, 44, 11, 72, 69, 13, '#cdbf8e', M_ROUGH);
    m.box(8, 45, 11, 9, 65, 13, '#cdbf8e', M_ROUGH);
    m.box(15, 45, 11, 16, 65, 13, '#cdbf8e', M_ROUGH);
    m.box(22, 45, 11, 23, 65, 13, '#cdbf8e', M_ROUGH);
    m.box(29, 45, 11, 30, 65, 13, '#cdbf8e', M_ROUGH);
    m.box(36, 45, 11, 37, 65, 13, '#cdbf8e', M_ROUGH);
    m.box(43, 45, 11, 44, 65, 13, '#cdbf8e', M_ROUGH);
    m.box(50, 45, 11, 51, 65, 13, '#cdbf8e', M_ROUGH);
    m.box(57, 45, 11, 58, 65, 13, '#cdbf8e', M_ROUGH);
    m.box(8, 65, 11, 9, 66, 12, '#1c1c1a', M_METAL);
    m.box(15, 65, 11, 16, 66, 12, '#1c1c1a', M_METAL);
    m.box(22, 65, 11, 23, 66, 12, '#1c1c1a', M_METAL);
    m.box(29, 65, 11, 30, 66, 12, '#1c1c1a', M_METAL);
    m.box(36, 65, 11, 37, 66, 12, '#1c1c1a', M_METAL);
    m.box(43, 65, 11, 44, 66, 12, '#1c1c1a', M_METAL);
    m.box(50, 65, 11, 51, 66, 12, '#1c1c1a', M_METAL);
    m.box(57, 65, 11, 58, 66, 12, '#1c1c1a', M_METAL);
    m.box(8, 66, 11, 9, 69, 13, '#cdbf8e', M_ROUGH);
    m.box(15, 66, 11, 16, 69, 13, '#cdbf8e', M_ROUGH);
    m.box(22, 66, 11, 23, 69, 13, '#cdbf8e', M_ROUGH);
    m.box(29, 66, 11, 30, 69, 13, '#cdbf8e', M_ROUGH);
    m.box(36, 66, 11, 37, 69, 13, '#cdbf8e', M_ROUGH);
    m.box(43, 66, 11, 44, 69, 13, '#cdbf8e', M_ROUGH);
    m.box(50, 66, 11, 51, 69, 13, '#cdbf8e', M_ROUGH);
    m.box(57, 66, 11, 58, 69, 13, '#cdbf8e', M_ROUGH);
    m.box(64, 69, 11, 69, 70, 19, '#cdbf8e', M_ROUGH);
    m.box(69, 69, 11, 71, 71, 12, '#34362f', M_METAL);
    m.box(71, 69, 11, 72, 70, 19, '#cdbf8e', M_ROUGH);
    m.box(8, 44, 12, 9, 45, 14, '#cdbf8e', M_ROUGH);
    m.box(15, 44, 12, 16, 45, 14, '#cdbf8e', M_ROUGH);
    m.box(22, 44, 12, 23, 45, 14, '#cdbf8e', M_ROUGH);
    m.box(29, 44, 12, 30, 45, 14, '#cdbf8e', M_ROUGH);
    m.box(36, 44, 12, 37, 45, 14, '#cdbf8e', M_ROUGH);
    m.box(43, 44, 12, 44, 45, 14, '#cdbf8e', M_ROUGH);
    m.box(50, 44, 12, 51, 45, 14, '#cdbf8e', M_ROUGH);
    m.box(57, 44, 12, 58, 45, 14, '#cdbf8e', M_ROUGH);
    m.box(8, 65, 12, 9, 66, 14, '#cdbf8e', M_ROUGH);
    m.box(15, 65, 12, 16, 66, 14, '#cdbf8e', M_ROUGH);
    m.box(22, 65, 12, 23, 66, 14, '#cdbf8e', M_ROUGH);
    m.box(29, 65, 12, 30, 66, 14, '#cdbf8e', M_ROUGH);
    m.box(36, 65, 12, 37, 66, 14, '#cdbf8e', M_ROUGH);
    m.box(43, 65, 12, 44, 66, 14, '#cdbf8e', M_ROUGH);
    m.box(50, 65, 12, 51, 66, 14, '#cdbf8e', M_ROUGH);
    m.box(57, 65, 12, 58, 66, 14, '#cdbf8e', M_ROUGH);
    m.box(8, 69, 12, 10, 70, 13, '#cdbf8e', M_ROUGH);
    m.box(14, 69, 12, 18, 70, 13, '#cdbf8e', M_ROUGH);
    m.box(22, 69, 12, 26, 70, 13, '#cdbf8e', M_ROUGH);
    m.box(46, 69, 12, 50, 70, 13, '#cdbf8e', M_ROUGH);
    m.box(54, 69, 12, 58, 70, 13, '#cdbf8e', M_ROUGH);
    m.box(62, 69, 12, 64, 70, 13, '#cdbf8e', M_ROUGH);
    m.box(69, 69, 12, 71, 70, 19, '#cdbf8e', M_ROUGH);
    m.box(14, 10, 13, 18, 26, 15, '#b9b6ac', M_ROUGH);
    m.box(44, 10, 13, 48, 26, 15, '#b9b6ac', M_ROUGH);
    m.box(13, 11, 13, 14, 25, 36, '#b9b6ac', M_ROUGH);
    m.box(18, 11, 13, 19, 25, 36, '#b9b6ac', M_ROUGH);
    m.box(43, 11, 13, 44, 25, 36, '#b9b6ac', M_ROUGH);
    m.box(48, 11, 13, 49, 25, 36, '#b9b6ac', M_ROUGH);
    m.box(11, 12, 13, 12, 24, 19, '#b9b6ac', M_ROUGH);
    m.box(20, 12, 13, 21, 24, 19, '#b9b6ac', M_ROUGH);
    m.box(41, 12, 13, 42, 24, 19, '#b9b6ac', M_ROUGH);
    m.box(50, 12, 13, 51, 24, 19, '#b9b6ac', M_ROUGH);
    m.box(10, 13, 13, 11, 23, 19, '#b9b6ac', M_ROUGH);
    m.box(21, 13, 13, 22, 23, 19, '#b9b6ac', M_ROUGH);
    m.box(40, 13, 13, 41, 23, 19, '#b9b6ac', M_ROUGH);
    m.box(51, 13, 13, 52, 23, 19, '#b9b6ac', M_ROUGH);
    m.box(9, 14, 13, 10, 22, 17, '#b9b6ac', M_ROUGH);
    m.box(22, 14, 13, 23, 22, 17, '#b9b6ac', M_ROUGH);
    m.box(39, 14, 13, 40, 22, 17, '#b9b6ac', M_ROUGH);
    m.box(52, 14, 13, 53, 22, 17, '#b9b6ac', M_ROUGH);
    m.box(8, 16, 13, 9, 20, 15, '#b9b6ac', M_ROUGH);
    m.box(23, 16, 13, 24, 20, 15, '#b9b6ac', M_ROUGH);
    m.box(38, 16, 13, 39, 20, 15, '#b9b6ac', M_ROUGH);
    m.box(53, 16, 13, 54, 20, 15, '#b9b6ac', M_ROUGH);
    m.box(9, 44, 13, 15, 68, 14, '#cdbf8e', M_ROUGH);
    m.box(16, 44, 13, 22, 68, 14, '#cdbf8e', M_ROUGH);
    m.box(23, 44, 13, 29, 68, 14, '#cdbf8e', M_ROUGH);
    m.box(30, 44, 13, 36, 68, 14, '#cdbf8e', M_ROUGH);
    m.box(37, 44, 13, 43, 68, 14, '#cdbf8e', M_ROUGH);
    m.box(44, 44, 13, 50, 68, 14, '#cdbf8e', M_ROUGH);
    m.box(51, 44, 13, 57, 68, 14, '#cdbf8e', M_ROUGH);
    m.box(58, 44, 13, 72, 68, 14, '#cdbf8e', M_ROUGH);
    m.box(8, 45, 13, 9, 46, 15, '#1c1c1a', M_METAL);
    m.box(15, 45, 13, 16, 46, 15, '#1c1c1a', M_METAL);
    m.box(22, 45, 13, 23, 46, 15, '#1c1c1a', M_METAL);
    m.box(29, 45, 13, 30, 46, 14, '#1c1c1a', M_METAL);
    m.box(36, 45, 13, 37, 46, 14, '#1c1c1a', M_METAL);
    m.box(43, 45, 13, 44, 46, 14, '#1c1c1a', M_METAL);
    m.box(50, 45, 13, 51, 46, 15, '#1c1c1a', M_METAL);
    m.box(57, 45, 13, 58, 46, 15, '#1c1c1a', M_METAL);
    m.box(8, 46, 13, 9, 64, 14, '#cdbf8e', M_ROUGH);
    m.box(15, 46, 13, 16, 64, 14, '#cdbf8e', M_ROUGH);
    m.box(22, 46, 13, 23, 64, 14, '#cdbf8e', M_ROUGH);
    m.box(29, 46, 13, 30, 64, 14, '#cdbf8e', M_ROUGH);
    m.box(36, 46, 13, 37, 64, 14, '#cdbf8e', M_ROUGH);
    m.box(43, 46, 13, 44, 64, 14, '#cdbf8e', M_ROUGH);
    m.box(50, 46, 13, 51, 64, 14, '#cdbf8e', M_ROUGH);
    m.box(57, 46, 13, 58, 64, 14, '#cdbf8e', M_ROUGH);
    m.box(8, 64, 13, 9, 65, 15, '#1c1c1a', M_METAL);
    m.box(15, 64, 13, 16, 65, 15, '#1c1c1a', M_METAL);
    m.box(22, 64, 13, 23, 65, 15, '#1c1c1a', M_METAL);
    m.box(29, 64, 13, 30, 65, 15, '#1c1c1a', M_METAL);
    m.box(36, 64, 13, 37, 65, 15, '#1c1c1a', M_METAL);
    m.box(43, 64, 13, 44, 65, 15, '#1c1c1a', M_METAL);
    m.box(50, 64, 13, 51, 65, 15, '#1c1c1a', M_METAL);
    m.box(57, 64, 13, 58, 65, 15, '#1c1c1a', M_METAL);
    m.box(8, 66, 13, 9, 68, 14, '#cdbf8e', M_ROUGH);
    m.box(15, 66, 13, 16, 68, 14, '#cdbf8e', M_ROUGH);
    m.box(22, 66, 13, 23, 68, 14, '#cdbf8e', M_ROUGH);
    m.box(29, 66, 13, 30, 68, 14, '#cdbf8e', M_ROUGH);
    m.box(36, 66, 13, 37, 68, 14, '#cdbf8e', M_ROUGH);
    m.box(43, 66, 13, 44, 68, 14, '#cdbf8e', M_ROUGH);
    m.box(50, 66, 13, 51, 68, 14, '#cdbf8e', M_ROUGH);
    m.box(57, 66, 13, 58, 68, 14, '#cdbf8e', M_ROUGH);
    m.box(8, 68, 13, 64, 69, 14, '#e4e2d8', M_MATTE);
    m.box(64, 68, 13, 72, 69, 19, '#cdbf8e', M_ROUGH);
    m.box(8, 69, 13, 11, 70, 14, '#e4e2d8', M_MATTE);
    m.box(13, 69, 13, 19, 70, 14, '#e4e2d8', M_MATTE);
    m.box(21, 69, 13, 27, 70, 14, '#e4e2d8', M_MATTE);
    m.box(29, 69, 13, 35, 70, 14, '#e4e2d8', M_MATTE);
    m.box(37, 69, 13, 43, 70, 14, '#e4e2d8', M_MATTE);
    m.box(45, 69, 13, 51, 70, 14, '#e4e2d8', M_MATTE);
    m.box(53, 69, 13, 59, 70, 14, '#e4e2d8', M_MATTE);
    m.box(61, 69, 13, 64, 70, 14, '#e4e2d8', M_MATTE);
    m.box(8, 40, 14, 64, 44, 15, '#4f5a4b', M_METAL);
    m.box(64, 40, 14, 72, 68, 19, '#cdbf8e', M_ROUGH);
    m.box(8, 44, 14, 24, 45, 16, '#4f5a4b', M_METAL);
    m.box(24, 44, 14, 26, 45, 29, '#e4e2d8', M_MATTE);
    m.box(26, 44, 14, 31, 45, 16, '#4f5a4b', M_METAL);
    m.box(31, 44, 14, 33, 45, 29, '#e4e2d8', M_MATTE);
    m.box(33, 44, 14, 38, 45, 16, '#4f5a4b', M_METAL);
    m.box(38, 44, 14, 40, 45, 29, '#e4e2d8', M_MATTE);
    m.box(40, 44, 14, 45, 45, 16, '#4f5a4b', M_METAL);
    m.box(45, 44, 14, 47, 45, 29, '#e4e2d8', M_MATTE);
    m.box(47, 44, 14, 64, 45, 16, '#4f5a4b', M_METAL);
    m.box(9, 45, 14, 15, 70, 15, '#4f5a4b', M_METAL);
    m.box(16, 45, 14, 22, 70, 15, '#4f5a4b', M_METAL);
    m.box(23, 45, 14, 49, 63, 30, '#cdbf8e', M_ROUGH);
    m.box(49, 45, 14, 50, 70, 15, '#4f5a4b', M_METAL);
    m.box(51, 45, 14, 57, 70, 15, '#4f5a4b', M_METAL);
    m.box(58, 45, 14, 64, 70, 15, '#4f5a4b', M_METAL);
    m.box(8, 46, 14, 9, 64, 15, '#4f5a4b', M_METAL);
    m.box(15, 46, 14, 16, 64, 15, '#4f5a4b', M_METAL);
    m.box(22, 46, 14, 23, 64, 15, '#4f5a4b', M_METAL);
    m.box(50, 46, 14, 51, 64, 15, '#4f5a4b', M_METAL);
    m.box(57, 46, 14, 58, 64, 15, '#4f5a4b', M_METAL);
    m.box(23, 63, 14, 49, 64, 15, '#4f5a4b', M_METAL);
    m.box(23, 64, 14, 29, 70, 15, '#4f5a4b', M_METAL);
    m.box(30, 64, 14, 36, 70, 15, '#4f5a4b', M_METAL);
    m.box(37, 64, 14, 43, 70, 15, '#4f5a4b', M_METAL);
    m.box(44, 64, 14, 49, 70, 15, '#4f5a4b', M_METAL);
    m.box(8, 65, 14, 9, 70, 15, '#4f5a4b', M_METAL);
    m.box(15, 65, 14, 16, 70, 15, '#4f5a4b', M_METAL);
    m.box(22, 65, 14, 23, 70, 15, '#4f5a4b', M_METAL);
    m.box(29, 65, 14, 30, 70, 15, '#4f5a4b', M_METAL);
    m.box(36, 65, 14, 37, 70, 15, '#4f5a4b', M_METAL);
    m.box(43, 65, 14, 44, 70, 15, '#4f5a4b', M_METAL);
    m.box(50, 65, 14, 51, 70, 15, '#4f5a4b', M_METAL);
    m.box(57, 65, 14, 58, 70, 15, '#4f5a4b', M_METAL);
    m.box(27, 70, 14, 29, 72, 18, '#e4e2d8', M_MATTE);
    m.box(43, 70, 14, 45, 72, 18, '#e4e2d8', M_MATTE);
    m.box(14, 11, 15, 18, 25, 36, '#b9b6ac', M_ROUGH);
    m.box(44, 11, 15, 48, 25, 36, '#b9b6ac', M_ROUGH);
    m.box(8, 42, 15, 64, 44, 16, '#4f5a4b', M_METAL);
    m.box(8, 45, 15, 23, 46, 17, '#4f5a4b', M_METAL);
    m.box(49, 45, 15, 64, 46, 17, '#4f5a4b', M_METAL);
    m.box(8, 46, 15, 9, 47, 17, '#1c1c1a', M_METAL);
    m.box(9, 46, 15, 15, 68, 16, '#4f5a4b', M_METAL);
    m.box(15, 46, 15, 16, 47, 17, '#1c1c1a', M_METAL);
    m.box(16, 46, 15, 22, 68, 16, '#4f5a4b', M_METAL);
    m.box(22, 46, 15, 23, 47, 17, '#1c1c1a', M_METAL);
    m.box(49, 46, 15, 50, 68, 16, '#4f5a4b', M_METAL);
    m.box(50, 46, 15, 51, 47, 17, '#1c1c1a', M_METAL);
    m.box(51, 46, 15, 57, 68, 16, '#4f5a4b', M_METAL);
    m.box(57, 46, 15, 58, 47, 17, '#1c1c1a', M_METAL);
    m.box(58, 46, 15, 64, 68, 16, '#4f5a4b', M_METAL);
    m.box(8, 47, 15, 9, 63, 18, '#4f5a4b', M_METAL);
    m.box(15, 47, 15, 16, 63, 18, '#4f5a4b', M_METAL);
    m.box(22, 47, 15, 23, 63, 18, '#4f5a4b', M_METAL);
    m.box(50, 47, 15, 51, 63, 18, '#4f5a4b', M_METAL);
    m.box(57, 47, 15, 58, 63, 18, '#4f5a4b', M_METAL);
    m.box(8, 63, 15, 9, 64, 17, '#1c1c1a', M_METAL);
    m.box(15, 63, 15, 16, 64, 17, '#1c1c1a', M_METAL);
    m.box(22, 63, 15, 23, 64, 17, '#1c1c1a', M_METAL);
    m.box(23, 63, 15, 29, 68, 16, '#4f5a4b', M_METAL);
    m.box(29, 63, 15, 30, 64, 17, '#1c1c1a', M_METAL);
    m.box(30, 63, 15, 36, 68, 16, '#4f5a4b', M_METAL);
    m.box(36, 63, 15, 37, 64, 17, '#1c1c1a', M_METAL);
    m.box(37, 63, 15, 43, 68, 16, '#4f5a4b', M_METAL);
    m.box(43, 63, 15, 44, 64, 17, '#1c1c1a', M_METAL);
    m.box(44, 63, 15, 49, 68, 16, '#4f5a4b', M_METAL);
    m.box(50, 63, 15, 51, 64, 17, '#1c1c1a', M_METAL);
    m.box(57, 63, 15, 58, 64, 17, '#1c1c1a', M_METAL);
    m.box(8, 64, 15, 9, 68, 16, '#4f5a4b', M_METAL);
    m.box(15, 64, 15, 16, 68, 16, '#4f5a4b', M_METAL);
    m.box(22, 64, 15, 23, 68, 16, '#4f5a4b', M_METAL);
    m.box(29, 64, 15, 30, 68, 16, '#4f5a4b', M_METAL);
    m.box(36, 64, 15, 37, 68, 16, '#4f5a4b', M_METAL);
    m.box(43, 64, 15, 44, 68, 16, '#4f5a4b', M_METAL);
    m.box(50, 64, 15, 51, 68, 16, '#4f5a4b', M_METAL);
    m.box(57, 64, 15, 58, 68, 16, '#4f5a4b', M_METAL);
    m.box(26, 69, 15, 46, 70, 16, '#e4e2d8', M_MATTE);
    m.box(26, 70, 15, 27, 72, 17, '#e4e2d8', M_MATTE);
    m.box(29, 70, 15, 32, 72, 19, '#e4e2d8', M_MATTE);
    m.box(34, 70, 15, 38, 72, 22, '#e4e2d8', M_MATTE);
    m.box(40, 70, 15, 43, 72, 19, '#e4e2d8', M_MATTE);
    m.box(45, 70, 15, 46, 72, 17, '#e4e2d8', M_MATTE);
    m.box(9, 46, 16, 15, 65, 17, '#4f5a4b', M_METAL);
    m.box(16, 46, 16, 22, 65, 17, '#4f5a4b', M_METAL);
    m.box(49, 46, 16, 50, 65, 17, '#4f5a4b', M_METAL);
    m.box(51, 46, 16, 57, 65, 17, '#4f5a4b', M_METAL);
    m.box(58, 46, 16, 64, 65, 17, '#4f5a4b', M_METAL);
    m.box(23, 63, 16, 29, 65, 17, '#4f5a4b', M_METAL);
    m.box(30, 63, 16, 36, 65, 17, '#4f5a4b', M_METAL);
    m.box(37, 63, 16, 43, 65, 17, '#4f5a4b', M_METAL);
    m.box(44, 63, 16, 49, 65, 17, '#4f5a4b', M_METAL);
    m.box(8, 64, 16, 9, 65, 17, '#4f5a4b', M_METAL);
    m.box(15, 64, 16, 16, 65, 17, '#4f5a4b', M_METAL);
    m.box(22, 64, 16, 23, 65, 17, '#4f5a4b', M_METAL);
    m.box(29, 64, 16, 30, 65, 17, '#4f5a4b', M_METAL);
    m.box(36, 64, 16, 37, 65, 17, '#4f5a4b', M_METAL);
    m.box(43, 64, 16, 44, 65, 17, '#4f5a4b', M_METAL);
    m.box(50, 64, 16, 51, 65, 17, '#4f5a4b', M_METAL);
    m.box(57, 64, 16, 58, 65, 17, '#4f5a4b', M_METAL);
    m.box(25, 70, 16, 26, 73, 17, '#e4e2d8', M_MATTE);
    m.box(46, 70, 16, 47, 73, 17, '#e4e2d8', M_MATTE);
    m.box(26, 72, 16, 46, 73, 17, '#e4e2d8', M_MATTE);
    m.box(12, 12, 17, 13, 24, 36, '#b9b6ac', M_ROUGH);
    m.box(19, 12, 17, 20, 24, 36, '#b9b6ac', M_ROUGH);
    m.box(42, 12, 17, 43, 24, 36, '#b9b6ac', M_ROUGH);
    m.box(49, 12, 17, 50, 24, 36, '#b9b6ac', M_ROUGH);
    m.box(9, 15, 17, 10, 21, 36, '#b9b6ac', M_ROUGH);
    m.box(22, 15, 17, 23, 21, 36, '#b9b6ac', M_ROUGH);
    m.box(39, 15, 17, 40, 21, 36, '#b9b6ac', M_ROUGH);
    m.box(52, 15, 17, 53, 21, 36, '#b9b6ac', M_ROUGH);
    m.box(9, 47, 17, 15, 63, 18, '#4f5a4b', M_METAL);
    m.box(16, 47, 17, 22, 63, 18, '#4f5a4b', M_METAL);
    m.box(49, 47, 17, 50, 63, 18, '#4f5a4b', M_METAL);
    m.box(51, 47, 17, 57, 63, 18, '#4f5a4b', M_METAL);
    m.box(58, 47, 17, 64, 63, 18, '#4f5a4b', M_METAL);
    m.box(27, 72, 17, 45, 73, 18, '#e4e2d8', M_MATTE);
    m.box(8, 47, 18, 9, 48, 19, '#1c1c1a', M_METAL);
    m.box(15, 47, 18, 16, 48, 19, '#1c1c1a', M_METAL);
    m.box(22, 47, 18, 23, 48, 19, '#1c1c1a', M_METAL);
    m.box(50, 47, 18, 51, 48, 19, '#1c1c1a', M_METAL);
    m.box(57, 47, 18, 58, 48, 19, '#1c1c1a', M_METAL);
    m.box(8, 49, 18, 23, 61, 19, '#4f5a4b', M_METAL);
    m.box(49, 49, 18, 64, 61, 19, '#4f5a4b', M_METAL);
    m.box(8, 62, 18, 9, 63, 19, '#1c1c1a', M_METAL);
    m.box(15, 62, 18, 16, 63, 19, '#1c1c1a', M_METAL);
    m.box(22, 62, 18, 23, 63, 19, '#1c1c1a', M_METAL);
    m.box(50, 62, 18, 51, 63, 19, '#1c1c1a', M_METAL);
    m.box(57, 62, 18, 58, 63, 19, '#1c1c1a', M_METAL);
    m.box(28, 70, 18, 29, 73, 19, '#e4e2d8', M_MATTE);
    m.box(43, 70, 18, 44, 73, 19, '#e4e2d8', M_MATTE);
    m.box(29, 72, 18, 43, 73, 19, '#e4e2d8', M_MATTE);
    m.box(65, 1, 19, 67, 3, 28, '#7f8480', M_METAL);
    m.box(11, 13, 19, 12, 23, 36, '#b9b6ac', M_ROUGH);
    m.box(20, 13, 19, 21, 23, 36, '#b9b6ac', M_ROUGH);
    m.box(41, 13, 19, 42, 23, 36, '#b9b6ac', M_ROUGH);
    m.box(50, 13, 19, 51, 23, 36, '#b9b6ac', M_ROUGH);
    m.box(10, 14, 19, 11, 22, 36, '#b9b6ac', M_ROUGH);
    m.box(21, 14, 19, 22, 22, 36, '#b9b6ac', M_ROUGH);
    m.box(40, 14, 19, 41, 22, 36, '#b9b6ac', M_ROUGH);
    m.box(51, 14, 19, 52, 22, 36, '#b9b6ac', M_ROUGH);
    m.box(61, 33, 19, 63, 35, 28, '#7f8480', M_METAL);
    m.box(69, 33, 19, 71, 35, 28, '#7f8480', M_METAL);
    m.box(-1, 39, 19, 8, 70, 20, '#4f5a4b', M_METAL);
    m.box(63, 39, 19, 72, 70, 20, '#4f5a4b', M_METAL);
    m.box(8, 52, 19, 23, 58, 20, '#4f5a4b', M_METAL);
    m.box(49, 52, 19, 63, 58, 20, '#4f5a4b', M_METAL);
    m.box(30, 70, 19, 32, 73, 20, '#e4e2d8', M_MATTE);
    m.box(40, 70, 19, 42, 73, 20, '#e4e2d8', M_MATTE);
    m.box(32, 72, 19, 40, 73, 21, '#e4e2d8', M_MATTE);
    m.box(8, 48, 20, 9, 49, 22, '#1c1c1a', M_METAL);
    m.box(15, 48, 20, 16, 49, 22, '#1c1c1a', M_METAL);
    m.box(22, 48, 20, 23, 49, 22, '#1c1c1a', M_METAL);
    m.box(50, 48, 20, 51, 49, 22, '#1c1c1a', M_METAL);
    m.box(57, 48, 20, 58, 49, 22, '#1c1c1a', M_METAL);
    m.box(8, 54, 20, 23, 56, 21, pal.main, M_MATTE);
    m.box(49, 54, 20, 64, 56, 21, pal.main, M_MATTE);
    m.box(8, 61, 20, 9, 62, 22, '#1c1c1a', M_METAL);
    m.box(15, 61, 20, 16, 62, 22, '#1c1c1a', M_METAL);
    m.box(22, 61, 20, 23, 62, 22, '#1c1c1a', M_METAL);
    m.box(50, 61, 20, 51, 62, 22, '#1c1c1a', M_METAL);
    m.box(57, 61, 20, 58, 62, 22, '#1c1c1a', M_METAL);
    m.box(31, 70, 20, 32, 73, 21, '#e4e2d8', M_MATTE);
    m.box(40, 70, 20, 41, 73, 21, '#e4e2d8', M_MATTE);
    m.box(33, 70, 21, 34, 73, 22, '#e4e2d8', M_MATTE);
    m.box(38, 70, 21, 39, 73, 22, '#e4e2d8', M_MATTE);
    m.box(34, 72, 21, 38, 73, 22, '#e4e2d8', M_MATTE);
    m.box(8, 49, 22, 9, 50, 24, '#1c1c1a', M_METAL);
    m.box(15, 49, 22, 16, 50, 24, '#1c1c1a', M_METAL);
    m.box(22, 49, 22, 23, 50, 24, '#1c1c1a', M_METAL);
    m.box(50, 49, 22, 51, 50, 24, '#1c1c1a', M_METAL);
    m.box(57, 49, 22, 58, 50, 24, '#1c1c1a', M_METAL);
    m.box(8, 60, 22, 9, 61, 24, '#1c1c1a', M_METAL);
    m.box(15, 60, 22, 16, 61, 24, '#1c1c1a', M_METAL);
    m.box(22, 60, 22, 23, 61, 24, '#1c1c1a', M_METAL);
    m.box(50, 60, 22, 51, 61, 24, '#1c1c1a', M_METAL);
    m.box(57, 60, 22, 58, 61, 24, '#1c1c1a', M_METAL);
    m.box(11, 12, 27, 12, 13, 36, '#b9b6ac', M_ROUGH);
    m.box(20, 12, 27, 21, 13, 36, '#b9b6ac', M_ROUGH);
    m.box(41, 12, 27, 42, 13, 36, '#b9b6ac', M_ROUGH);
    m.box(50, 12, 27, 51, 13, 36, '#b9b6ac', M_ROUGH);
    m.box(10, 13, 27, 11, 14, 36, '#b9b6ac', M_ROUGH);
    m.box(21, 13, 27, 22, 14, 36, '#b9b6ac', M_ROUGH);
    m.box(40, 13, 27, 41, 14, 36, '#b9b6ac', M_ROUGH);
    m.box(51, 13, 27, 52, 14, 36, '#b9b6ac', M_ROUGH);
    m.box(10, 22, 27, 11, 23, 36, '#b9b6ac', M_ROUGH);
    m.box(21, 22, 27, 22, 23, 36, '#b9b6ac', M_ROUGH);
    m.box(40, 22, 27, 41, 23, 36, '#b9b6ac', M_ROUGH);
    m.box(51, 22, 27, 52, 23, 36, '#b9b6ac', M_ROUGH);
    m.box(11, 23, 27, 12, 24, 36, '#b9b6ac', M_ROUGH);
    m.box(20, 23, 27, 21, 24, 36, '#b9b6ac', M_ROUGH);
    m.box(41, 23, 27, 42, 24, 36, '#b9b6ac', M_ROUGH);
    m.box(50, 23, 27, 51, 24, 36, '#b9b6ac', M_ROUGH);
    m.box(12, 11, 29, 13, 12, 36, '#b9b6ac', M_ROUGH);
    m.box(19, 11, 29, 20, 12, 36, '#b9b6ac', M_ROUGH);
    m.box(42, 11, 29, 43, 12, 36, '#b9b6ac', M_ROUGH);
    m.box(49, 11, 29, 50, 12, 36, '#b9b6ac', M_ROUGH);
    m.box(9, 14, 29, 10, 15, 36, '#b9b6ac', M_ROUGH);
    m.box(22, 14, 29, 23, 15, 36, '#b9b6ac', M_ROUGH);
    m.box(39, 14, 29, 40, 15, 36, '#b9b6ac', M_ROUGH);
    m.box(52, 14, 29, 53, 15, 36, '#b9b6ac', M_ROUGH);
    m.box(9, 21, 29, 10, 22, 36, '#b9b6ac', M_ROUGH);
    m.box(22, 21, 29, 23, 22, 36, '#b9b6ac', M_ROUGH);
    m.box(39, 21, 29, 40, 22, 36, '#b9b6ac', M_ROUGH);
    m.box(52, 21, 29, 53, 22, 36, '#b9b6ac', M_ROUGH);
    m.box(12, 24, 29, 13, 25, 36, '#b9b6ac', M_ROUGH);
    m.box(19, 24, 29, 20, 25, 36, '#b9b6ac', M_ROUGH);
    m.box(42, 24, 29, 43, 25, 36, '#b9b6ac', M_ROUGH);
    m.box(49, 24, 29, 50, 25, 36, '#b9b6ac', M_ROUGH);
    m.box(22, 44, 30, 50, 45, 31, pal.main, M_MATTE);
    m.box(22, 45, 30, 23, 64, 31, pal.main, M_MATTE);
    m.box(23, 45, 30, 25, 47, 33, '#cdbf8e', M_ROUGH);
    m.box(25, 45, 30, 47, 64, 31, pal.main, M_MATTE);
    m.box(47, 45, 30, 49, 47, 33, '#cdbf8e', M_ROUGH);
    m.box(49, 45, 30, 50, 64, 31, pal.main, M_MATTE);
    m.box(23, 47, 30, 25, 61, 31, pal.main, M_MATTE);
    m.box(47, 47, 30, 49, 61, 31, pal.main, M_MATTE);
    m.box(23, 61, 30, 25, 63, 33, '#cdbf8e', M_ROUGH);
    m.box(47, 61, 30, 49, 63, 33, '#cdbf8e', M_ROUGH);
    m.box(23, 63, 30, 25, 64, 31, pal.main, M_MATTE);
    m.box(47, 63, 30, 49, 64, 31, pal.main, M_MATTE);
    m.box(14, 10, 31, 18, 11, 36, '#b9b6ac', M_ROUGH);
    m.box(44, 10, 31, 48, 11, 36, '#b9b6ac', M_ROUGH);
    m.box(8, 16, 31, 9, 20, 36, '#b9b6ac', M_ROUGH);
    m.box(23, 16, 31, 24, 20, 36, '#b9b6ac', M_ROUGH);
    m.box(38, 16, 31, 39, 20, 36, '#b9b6ac', M_ROUGH);
    m.box(53, 16, 31, 54, 20, 36, '#b9b6ac', M_ROUGH);
    m.box(14, 25, 31, 18, 26, 36, '#b9b6ac', M_ROUGH);
    m.box(44, 25, 31, 48, 26, 36, '#b9b6ac', M_ROUGH);
    m.box(28, 48, 31, 44, 59, 33, '#cdbf8e', M_ROUGH);
    m.box(13, 10, 33, 14, 11, 36, '#b9b6ac', M_ROUGH);
    m.box(18, 10, 33, 19, 11, 36, '#b9b6ac', M_ROUGH);
    m.box(43, 10, 33, 44, 11, 36, '#b9b6ac', M_ROUGH);
    m.box(48, 10, 33, 49, 11, 36, '#b9b6ac', M_ROUGH);
    m.box(11, 11, 33, 12, 12, 36, '#b9b6ac', M_ROUGH);
    m.box(20, 11, 33, 21, 12, 36, '#b9b6ac', M_ROUGH);
    m.box(41, 11, 33, 42, 12, 36, '#b9b6ac', M_ROUGH);
    m.box(50, 11, 33, 51, 12, 36, '#b9b6ac', M_ROUGH);
    m.box(10, 12, 33, 11, 13, 36, '#b9b6ac', M_ROUGH);
    m.box(21, 12, 33, 22, 13, 36, '#b9b6ac', M_ROUGH);
    m.box(40, 12, 33, 41, 13, 36, '#b9b6ac', M_ROUGH);
    m.box(51, 12, 33, 52, 13, 36, '#b9b6ac', M_ROUGH);
    m.box(9, 13, 33, 10, 14, 36, '#b9b6ac', M_ROUGH);
    m.box(22, 13, 33, 23, 14, 36, '#b9b6ac', M_ROUGH);
    m.box(39, 13, 33, 40, 14, 36, '#b9b6ac', M_ROUGH);
    m.box(52, 13, 33, 53, 14, 36, '#b9b6ac', M_ROUGH);
    m.box(8, 15, 33, 9, 16, 36, '#b9b6ac', M_ROUGH);
    m.box(23, 15, 33, 24, 16, 36, '#b9b6ac', M_ROUGH);
    m.box(38, 15, 33, 39, 16, 36, '#b9b6ac', M_ROUGH);
    m.box(53, 15, 33, 54, 16, 36, '#b9b6ac', M_ROUGH);
    m.box(8, 20, 33, 9, 21, 36, '#b9b6ac', M_ROUGH);
    m.box(23, 20, 33, 24, 21, 36, '#b9b6ac', M_ROUGH);
    m.box(38, 20, 33, 39, 21, 36, '#b9b6ac', M_ROUGH);
    m.box(53, 20, 33, 54, 21, 36, '#b9b6ac', M_ROUGH);
    m.box(9, 22, 33, 10, 23, 36, '#b9b6ac', M_ROUGH);
    m.box(22, 22, 33, 23, 23, 36, '#b9b6ac', M_ROUGH);
    m.box(39, 22, 33, 40, 23, 36, '#b9b6ac', M_ROUGH);
    m.box(52, 22, 33, 53, 23, 36, '#b9b6ac', M_ROUGH);
    m.box(10, 23, 33, 11, 24, 36, '#b9b6ac', M_ROUGH);
    m.box(21, 23, 33, 22, 24, 36, '#b9b6ac', M_ROUGH);
    m.box(40, 23, 33, 41, 24, 36, '#b9b6ac', M_ROUGH);
    m.box(51, 23, 33, 52, 24, 36, '#b9b6ac', M_ROUGH);
    m.box(11, 24, 33, 12, 25, 36, '#b9b6ac', M_ROUGH);
    m.box(20, 24, 33, 21, 25, 36, '#b9b6ac', M_ROUGH);
    m.box(41, 24, 33, 42, 25, 36, '#b9b6ac', M_ROUGH);
    m.box(50, 24, 33, 51, 25, 36, '#b9b6ac', M_ROUGH);
    m.box(13, 25, 33, 14, 26, 36, '#b9b6ac', M_ROUGH);
    m.box(18, 25, 33, 19, 26, 36, '#b9b6ac', M_ROUGH);
    m.box(43, 25, 33, 44, 26, 36, '#b9b6ac', M_ROUGH);
    m.box(48, 25, 33, 49, 26, 36, '#b9b6ac', M_ROUGH);
    m.box(23, 45, 33, 25, 47, 36, '#4f5a4b', M_METAL);
    m.box(47, 45, 33, 49, 47, 36, '#4f5a4b', M_METAL);
    m.box(28, 48, 33, 31, 49, 39, '#2c4452', M_GLASS);
    m.box(31, 48, 33, 34, 59, 41, '#cdbf8e', M_ROUGH);
    m.box(34, 48, 33, 37, 49, 39, '#2c4452', M_GLASS);
    m.box(37, 48, 33, 40, 59, 41, '#cdbf8e', M_ROUGH);
    m.box(40, 48, 33, 43, 49, 39, '#2c4452', M_GLASS);
    m.box(43, 48, 33, 44, 59, 41, '#cdbf8e', M_ROUGH);
    m.box(28, 49, 33, 31, 59, 41, '#cdbf8e', M_ROUGH);
    m.box(34, 49, 33, 37, 59, 41, '#cdbf8e', M_ROUGH);
    m.box(40, 49, 33, 43, 59, 41, '#cdbf8e', M_ROUGH);
    m.box(23, 61, 33, 25, 63, 36, '#4f5a4b', M_METAL);
    m.box(47, 61, 33, 49, 63, 36, '#4f5a4b', M_METAL);
    m.box(12, 10, 35, 13, 11, 36, '#b9b6ac', M_ROUGH);
    m.box(19, 10, 35, 20, 11, 36, '#b9b6ac', M_ROUGH);
    m.box(42, 10, 35, 43, 11, 36, '#b9b6ac', M_ROUGH);
    m.box(49, 10, 35, 50, 11, 36, '#b9b6ac', M_ROUGH);
    m.box(8, 14, 35, 9, 15, 36, '#b9b6ac', M_ROUGH);
    m.box(23, 14, 35, 24, 15, 36, '#b9b6ac', M_ROUGH);
    m.box(38, 14, 35, 39, 15, 36, '#b9b6ac', M_ROUGH);
    m.box(53, 14, 35, 54, 15, 36, '#b9b6ac', M_ROUGH);
    m.box(8, 21, 35, 9, 22, 36, '#b9b6ac', M_ROUGH);
    m.box(23, 21, 35, 24, 22, 36, '#b9b6ac', M_ROUGH);
    m.box(38, 21, 35, 39, 22, 36, '#b9b6ac', M_ROUGH);
    m.box(53, 21, 35, 54, 22, 36, '#b9b6ac', M_ROUGH);
    m.box(12, 25, 35, 13, 26, 36, '#b9b6ac', M_ROUGH);
    m.box(19, 25, 35, 20, 26, 36, '#b9b6ac', M_ROUGH);
    m.box(42, 25, 35, 43, 26, 36, '#b9b6ac', M_ROUGH);
    m.box(49, 25, 35, 50, 26, 36, '#b9b6ac', M_ROUGH);
    m.box(15, 9, 36, 17, 27, 38, pal.main, M_MATTE);
    m.box(45, 9, 36, 47, 27, 38, pal.main, M_MATTE);
    m.box(12, 10, 36, 15, 26, 38, pal.main, M_MATTE);
    m.box(17, 10, 36, 20, 26, 38, pal.main, M_MATTE);
    m.box(42, 10, 36, 45, 26, 38, pal.main, M_MATTE);
    m.box(47, 10, 36, 50, 26, 38, pal.main, M_MATTE);
    m.box(10, 11, 36, 12, 25, 38, pal.main, M_MATTE);
    m.box(20, 11, 36, 22, 25, 38, pal.main, M_MATTE);
    m.box(40, 11, 36, 42, 25, 38, pal.main, M_MATTE);
    m.box(50, 11, 36, 52, 25, 38, pal.main, M_MATTE);
    m.box(9, 12, 36, 10, 24, 38, pal.main, M_MATTE);
    m.box(22, 12, 36, 23, 24, 38, pal.main, M_MATTE);
    m.box(39, 12, 36, 40, 24, 38, pal.main, M_MATTE);
    m.box(52, 12, 36, 53, 24, 38, pal.main, M_MATTE);
    m.box(8, 14, 36, 9, 22, 38, pal.main, M_MATTE);
    m.box(23, 14, 36, 24, 22, 38, pal.main, M_MATTE);
    m.box(38, 14, 36, 39, 22, 38, pal.main, M_MATTE);
    m.box(53, 14, 36, 54, 22, 38, pal.main, M_MATTE);
    m.box(7, 17, 36, 8, 19, 38, pal.main, M_MATTE);
    m.box(24, 17, 36, 25, 19, 38, pal.main, M_MATTE);
    m.box(37, 17, 36, 38, 19, 38, pal.main, M_MATTE);
    m.box(54, 17, 36, 55, 19, 38, pal.main, M_MATTE);
    m.box(13, 9, 37, 15, 10, 39, '#b9b6ac', M_ROUGH);
    m.box(17, 9, 37, 19, 10, 39, '#b9b6ac', M_ROUGH);
    m.box(43, 9, 37, 45, 10, 39, '#b9b6ac', M_ROUGH);
    m.box(47, 9, 37, 49, 10, 39, '#b9b6ac', M_ROUGH);
    m.box(11, 10, 37, 12, 11, 39, '#b9b6ac', M_ROUGH);
    m.box(20, 10, 37, 21, 11, 39, '#b9b6ac', M_ROUGH);
    m.box(41, 10, 37, 42, 11, 39, '#b9b6ac', M_ROUGH);
    m.box(50, 10, 37, 51, 11, 39, '#b9b6ac', M_ROUGH);
    m.box(8, 13, 37, 9, 14, 39, '#b9b6ac', M_ROUGH);
    m.box(23, 13, 37, 24, 14, 39, '#b9b6ac', M_ROUGH);
    m.box(38, 13, 37, 39, 14, 39, '#b9b6ac', M_ROUGH);
    m.box(53, 13, 37, 54, 14, 39, '#b9b6ac', M_ROUGH);
    m.box(7, 15, 37, 8, 17, 39, '#b9b6ac', M_ROUGH);
    m.box(24, 15, 37, 25, 17, 39, '#b9b6ac', M_ROUGH);
    m.box(37, 15, 37, 38, 17, 39, '#b9b6ac', M_ROUGH);
    m.box(54, 15, 37, 55, 17, 39, '#b9b6ac', M_ROUGH);
    m.box(7, 19, 37, 8, 21, 39, '#b9b6ac', M_ROUGH);
    m.box(24, 19, 37, 25, 21, 39, '#b9b6ac', M_ROUGH);
    m.box(37, 19, 37, 38, 21, 39, '#b9b6ac', M_ROUGH);
    m.box(54, 19, 37, 55, 21, 39, '#b9b6ac', M_ROUGH);
    m.box(8, 22, 37, 9, 23, 39, '#b9b6ac', M_ROUGH);
    m.box(23, 22, 37, 24, 23, 39, '#b9b6ac', M_ROUGH);
    m.box(38, 22, 37, 39, 23, 39, '#b9b6ac', M_ROUGH);
    m.box(53, 22, 37, 54, 23, 39, '#b9b6ac', M_ROUGH);
    m.box(11, 25, 37, 12, 26, 39, '#b9b6ac', M_ROUGH);
    m.box(20, 25, 37, 21, 26, 39, '#b9b6ac', M_ROUGH);
    m.box(41, 25, 37, 42, 26, 39, '#b9b6ac', M_ROUGH);
    m.box(50, 25, 37, 51, 26, 39, '#b9b6ac', M_ROUGH);
    m.box(13, 26, 37, 15, 27, 39, '#b9b6ac', M_ROUGH);
    m.box(17, 26, 37, 19, 27, 39, '#b9b6ac', M_ROUGH);
    m.box(43, 26, 37, 45, 27, 39, '#b9b6ac', M_ROUGH);
    m.box(47, 26, 37, 49, 27, 39, '#b9b6ac', M_ROUGH);
    m.box(15, 9, 38, 17, 27, 39, '#b9b6ac', M_ROUGH);
    m.box(45, 9, 38, 47, 27, 39, '#b9b6ac', M_ROUGH);
    m.box(12, 10, 38, 15, 26, 39, '#b9b6ac', M_ROUGH);
    m.box(17, 10, 38, 20, 26, 39, '#b9b6ac', M_ROUGH);
    m.box(42, 10, 38, 45, 26, 39, '#b9b6ac', M_ROUGH);
    m.box(47, 10, 38, 50, 26, 39, '#b9b6ac', M_ROUGH);
    m.box(10, 11, 38, 12, 25, 39, '#b9b6ac', M_ROUGH);
    m.box(20, 11, 38, 22, 25, 39, '#b9b6ac', M_ROUGH);
    m.box(40, 11, 38, 42, 25, 39, '#b9b6ac', M_ROUGH);
    m.box(50, 11, 38, 52, 25, 39, '#b9b6ac', M_ROUGH);
    m.box(9, 12, 38, 10, 24, 39, '#b9b6ac', M_ROUGH);
    m.box(22, 12, 38, 23, 24, 39, '#b9b6ac', M_ROUGH);
    m.box(39, 12, 38, 40, 24, 39, '#b9b6ac', M_ROUGH);
    m.box(52, 12, 38, 53, 24, 39, '#b9b6ac', M_ROUGH);
    m.box(8, 14, 38, 9, 22, 39, '#b9b6ac', M_ROUGH);
    m.box(23, 14, 38, 24, 22, 39, '#b9b6ac', M_ROUGH);
    m.box(38, 14, 38, 39, 22, 39, '#b9b6ac', M_ROUGH);
    m.box(53, 14, 38, 54, 22, 39, '#b9b6ac', M_ROUGH);
    m.box(7, 17, 38, 8, 19, 39, '#b9b6ac', M_ROUGH);
    m.box(24, 17, 38, 25, 19, 39, '#b9b6ac', M_ROUGH);
    m.box(37, 17, 38, 38, 19, 39, '#b9b6ac', M_ROUGH);
    m.box(54, 17, 38, 55, 19, 39, '#b9b6ac', M_ROUGH);
    m.box(28, 48, 39, 31, 49, 41, '#cdbf8e', M_ROUGH);
    m.box(34, 48, 39, 37, 49, 41, '#cdbf8e', M_ROUGH);
    m.box(40, 48, 39, 43, 49, 41, '#cdbf8e', M_ROUGH);
    m.box(27, 47, 41, 45, 60, 42, pal.main, M_MATTE);
    m.box(32, 51, 42, 40, 57, 50, '#cdbf8e', M_ROUGH);
    m.box(31, 50, 50, 41, 58, 51, '#4f5a4b', M_METAL);
    m.box(32, 51, 51, 40, 57, 52, '#4f5a4b', M_METAL);
    m.box(33, 51, 52, 39, 57, 53, '#4f5a4b', M_METAL);
    m.box(33, 52, 53, 39, 56, 54, '#4f5a4b', M_METAL);
    m.box(34, 52, 54, 38, 56, 55, '#4f5a4b', M_METAL);
    m.box(35, 53, 55, 37, 55, 56, '#4f5a4b', M_METAL);
    m.box(35, 53, 58, 37, 55, 62, pal.main, M_MATTE);
    m.box(34, 53, 59, 35, 55, 62, pal.main, M_MATTE);
    m.box(37, 53, 59, 38, 55, 62, pal.main, M_MATTE);
    // (by hand, after the generated part) both cooling towers open on top, as the Power Plant's: hollow down to a dark floor, sooted inside
    for (const [cx, cy] of [[16, 18], [46, 18]]) {
      m.cylZ(cx, cy, 29, 40, 6.6, null);
      m.cylZ(cx, cy, 28, 29, 7, '#24231f', M_ROUGH);
      m.paint(cx - 9, cy - 9, 29, cx + 10, cy + 10, 40, (x, y, z) => (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < 7.8 ? (z > 37 ? '#55524b' : '#3a3833') : undefined));
    }
    starFront(m, 36, 72, 18.4, 2.4, pal.main);
    return m;
  },
  // BLENDER:apower_soviets end
  // BLENDER:refinery_soviets begin
  refinery(pal) {
    const m = new VModel(-2, -2, 74, 50, 56);
    m.box(-1, -1, 0, 73, 29, 1, '#6e6352', M_ROUGH);
    m.box(-1, 29, 0, 62, 30, 1, '#6e6352', M_ROUGH);
    m.box(62, 29, 0, 66, 34, 1, '#d2a62a', M_ROUGH);
    m.box(66, 29, 0, 73, 30, 1, '#6e6352', M_ROUGH);
    m.box(-1, 30, 0, 59, 31, 1, '#6e6352', M_ROUGH);
    m.box(59, 30, 0, 62, 34, 1, '#d2a62a', M_ROUGH);
    m.box(66, 30, 0, 69, 42, 3, '#d2a62a', M_ROUGH);
    m.box(69, 30, 0, 73, 31, 1, '#6e6352', M_ROUGH);
    m.box(-1, 31, 0, 58, 32, 1, '#6e6352', M_ROUGH);
    m.box(58, 31, 0, 59, 34, 1, '#d2a62a', M_ROUGH);
    m.box(69, 31, 0, 70, 41, 4, '#d2a62a', M_ROUGH);
    m.box(70, 31, 0, 73, 32, 1, '#6e6352', M_ROUGH);
    m.box(-1, 32, 0, 57, 33, 1, '#6e6352', M_ROUGH);
    m.box(57, 32, 0, 58, 34, 4, '#d2a62a', M_ROUGH);
    m.box(70, 32, 0, 71, 40, 4, '#d2a62a', M_ROUGH);
    m.box(71, 32, 0, 73, 33, 1, '#6e6352', M_ROUGH);
    m.box(-1, 33, 0, 56, 35, 1, '#6e6352', M_ROUGH);
    m.box(56, 33, 0, 57, 35, 4, '#d2a62a', M_ROUGH);
    m.box(71, 33, 0, 72, 39, 4, '#d2a62a', M_ROUGH);
    m.box(72, 33, 0, 73, 35, 1, '#6e6352', M_ROUGH);
    m.box(57, 34, 0, 63, 42, 3, '#9a7414', M_ROUGH);
    m.box(63, 34, 0, 66, 35, 7, '#d2a62a', M_ROUGH);
    m.box(-1, 35, 0, 55, 49, 1, '#6e6352', M_ROUGH);
    m.box(55, 35, 0, 56, 37, 1, '#d2a62a', M_ROUGH);
    m.box(56, 35, 0, 57, 41, 3, '#9a7414', M_ROUGH);
    m.box(63, 35, 0, 64, 41, 3, '#9a7414', M_ROUGH);
    m.box(64, 35, 0, 66, 37, 1, '#d2a62a', M_ROUGH);
    m.box(72, 35, 0, 73, 37, 3, '#d2a62a', M_ROUGH);
    m.box(55, 37, 0, 56, 39, 3, '#9a7414', M_ROUGH);
    m.box(64, 37, 0, 65, 39, 3, '#9a7414', M_ROUGH);
    m.box(65, 37, 0, 66, 43, 3, '#d2a62a', M_ROUGH);
    m.box(72, 37, 0, 73, 49, 1, '#6e6352', M_ROUGH);
    m.box(55, 39, 0, 56, 49, 1, '#6e6352', M_ROUGH);
    m.box(64, 39, 0, 65, 43, 1, '#d2a62a', M_ROUGH);
    m.box(71, 39, 0, 72, 49, 1, '#6e6352', M_ROUGH);
    m.box(70, 40, 0, 71, 49, 1, '#6e6352', M_ROUGH);
    m.box(56, 41, 0, 57, 49, 1, '#6e6352', M_ROUGH);
    m.box(63, 41, 0, 64, 43, 3, '#d2a62a', M_ROUGH);
    m.box(69, 41, 0, 70, 49, 1, '#6e6352', M_ROUGH);
    m.box(57, 42, 0, 62, 49, 1, '#6e6352', M_ROUGH);
    m.box(62, 42, 0, 63, 43, 3, '#d2a62a', M_ROUGH);
    m.box(66, 42, 0, 69, 49, 1, '#6e6352', M_ROUGH);
    m.box(62, 43, 0, 66, 49, 1, '#6e6352', M_ROUGH);
    m.box(4, 5, 1, 6, 7, 48, '#5b5d58', M_METAL);
    m.box(51, 6, 1, 57, 18, 4, '#878275', M_ROUGH);
    m.box(50, 7, 1, 51, 17, 4, '#878275', M_ROUGH);
    m.box(57, 7, 1, 58, 17, 4, '#878275', M_ROUGH);
    m.box(49, 8, 1, 50, 16, 4, '#878275', M_ROUGH);
    m.box(58, 8, 1, 59, 16, 4, '#878275', M_ROUGH);
    m.box(48, 9, 1, 49, 15, 4, '#878275', M_ROUGH);
    m.box(59, 9, 1, 60, 15, 4, '#878275', M_ROUGH);
    m.box(63, 9, 1, 69, 19, 4, '#878275', M_ROUGH);
    m.box(62, 10, 1, 63, 18, 4, '#878275', M_ROUGH);
    m.box(69, 10, 1, 70, 18, 4, '#878275', M_ROUGH);
    m.box(1, 11, 1, 47, 13, 3, '#878275', M_ROUGH);
    m.box(61, 11, 1, 62, 17, 4, '#878275', M_ROUGH);
    m.box(70, 11, 1, 71, 17, 4, '#878275', M_ROUGH);
    m.box(1, 13, 1, 46, 44, 3, '#878275', M_ROUGH);
    m.box(46, 19, 1, 47, 21, 14, '#878275', M_ROUGH);
    m.box(50, 22, 1, 51, 23, 15, '#5b5d58', M_METAL);
    m.box(53, 22, 1, 54, 24, 12, '#5b5d58', M_METAL);
    m.box(56, 23, 1, 57, 24, 9, '#5b5d58', M_METAL);
    m.box(58, 24, 1, 66, 32, 7, '#5b5d58', M_METAL);
    m.box(50, 26, 1, 51, 27, 15, '#5b5d58', M_METAL);
    m.box(53, 26, 1, 54, 28, 12, '#5b5d58', M_METAL);
    m.box(46, 27, 1, 47, 29, 14, '#878275', M_ROUGH);
    m.box(56, 27, 1, 57, 28, 9, '#5b5d58', M_METAL);
    m.box(66, 29, 1, 67, 30, 2, '#d2a62a', M_ROUGH);
    m.box(57, 31, 1, 58, 32, 2, '#d2a62a', M_ROUGH);
    m.box(70, 31, 1, 71, 32, 2, '#d2a62a', M_ROUGH);
    m.box(56, 32, 1, 57, 33, 2, '#d2a62a', M_ROUGH);
    m.box(58, 32, 1, 66, 34, 5, '#d2a62a', M_ROUGH);
    m.box(71, 32, 1, 72, 33, 2, '#d2a62a', M_ROUGH);
    m.box(55, 34, 1, 56, 36, 2, '#d2a62a', M_ROUGH);
    m.box(72, 34, 1, 73, 35, 2, '#d2a62a', M_ROUGH);
    m.box(46, 35, 1, 47, 37, 14, '#878275', M_ROUGH);
    m.box(64, 35, 1, 66, 36, 7, '#d2a62a', M_ROUGH);
    m.box(55, 36, 1, 56, 37, 2, '#9a7414', M_ROUGH);
    m.box(64, 36, 1, 65, 37, 2, '#9a7414', M_ROUGH);
    m.box(65, 36, 1, 66, 37, 7, '#d2a62a', M_ROUGH);
    m.box(72, 37, 1, 73, 38, 2, '#d2a62a', M_ROUGH);
    m.box(55, 39, 1, 56, 40, 2, '#9a7414', M_ROUGH);
    m.box(64, 39, 1, 65, 40, 2, '#9a7414', M_ROUGH);
    m.box(71, 39, 1, 72, 40, 2, '#d2a62a', M_ROUGH);
    m.box(64, 40, 1, 65, 43, 3, '#d2a62a', M_ROUGH);
    m.box(70, 40, 1, 71, 41, 2, '#d2a62a', M_ROUGH);
    m.box(61, 42, 1, 62, 43, 2, '#d2a62a', M_ROUGH);
    m.box(66, 42, 1, 67, 43, 2, '#d2a62a', M_ROUGH);
    m.box(46, 43, 1, 47, 45, 14, '#878275', M_ROUGH);
    m.box(1, 44, 1, 3, 45, 14, '#878275', M_ROUGH);
    m.box(9, 44, 1, 11, 45, 14, '#878275', M_ROUGH);
    m.box(17, 44, 1, 19, 45, 4, '#878275', M_ROUGH);
    m.box(25, 44, 1, 27, 45, 4, '#878275', M_ROUGH);
    m.box(29, 44, 1, 42, 45, 10, '#1c1c1a', M_MATTE);
    m.box(42, 44, 1, 43, 45, 10, '#878275', M_ROUGH);
    m.box(45, 44, 1, 46, 45, 14, '#878275', M_ROUGH);
    m.box(26, 45, 1, 27, 47, 4, '#d0a426', M_MATTE);
    m.box(45, 45, 1, 46, 47, 4, '#d0a426', M_MATTE);
    m.box(27, 47, 1, 28, 48, 11, '#5b5d58', M_METAL);
    m.box(44, 47, 1, 45, 48, 11, '#5b5d58', M_METAL);
    m.box(55, 35, 2, 56, 37, 3, '#d2a62a', M_ROUGH);
    m.box(64, 36, 2, 65, 37, 7, '#d2a62a', M_ROUGH);
    m.box(64, 39, 2, 65, 40, 6, '#d2a62a', M_ROUGH);
    m.box(45, 11, 3, 47, 13, 14, '#878275', M_ROUGH);
    m.box(2, 12, 3, 45, 43, 15, '#7d786d', M_ROUGH);
    m.box(45, 13, 3, 46, 19, 15, '#7d786d', M_ROUGH);
    m.box(45, 19, 3, 46, 21, 14, '#878275', M_ROUGH);
    m.box(45, 21, 3, 46, 27, 15, '#7d786d', M_ROUGH);
    m.box(45, 27, 3, 46, 29, 14, '#878275', M_ROUGH);
    m.box(45, 29, 3, 46, 35, 15, '#7d786d', M_ROUGH);
    m.box(66, 30, 3, 68, 42, 4, '#d2a62a', M_ROUGH);
    m.box(68, 31, 3, 69, 41, 5, '#d2a62a', M_ROUGH);
    m.box(57, 34, 3, 59, 35, 5, '#d2a62a', M_ROUGH);
    m.box(59, 34, 3, 61, 42, 4, '#9a7414', M_ROUGH);
    m.box(61, 34, 3, 63, 35, 7, '#d2a62a', M_ROUGH);
    m.box(45, 35, 3, 46, 37, 14, '#878275', M_ROUGH);
    m.box(56, 35, 3, 57, 36, 4, '#d2a62a', M_ROUGH);
    m.box(57, 35, 3, 59, 41, 4, '#9a7414', M_ROUGH);
    m.box(61, 35, 3, 63, 41, 4, '#9a7414', M_ROUGH);
    m.box(63, 35, 3, 64, 36, 7, '#d2a62a', M_ROUGH);
    m.box(56, 36, 3, 57, 40, 4, '#9a7414', M_ROUGH);
    m.box(63, 36, 3, 64, 40, 4, '#9a7414', M_ROUGH);
    m.box(45, 37, 3, 46, 43, 15, '#7d786d', M_ROUGH);
    m.box(64, 37, 3, 66, 39, 7, '#d2a62a', M_ROUGH);
    m.box(65, 39, 3, 66, 42, 5, '#d2a62a', M_ROUGH);
    m.box(63, 40, 3, 65, 42, 5, '#d2a62a', M_ROUGH);
    m.box(61, 41, 3, 63, 42, 4, '#d2a62a', M_ROUGH);
    m.box(1, 43, 3, 3, 44, 14, '#878275', M_ROUGH);
    m.box(3, 43, 3, 9, 44, 14, '#7d786d', M_ROUGH);
    m.box(9, 43, 3, 11, 44, 14, '#878275', M_ROUGH);
    m.box(11, 43, 3, 17, 44, 14, '#7d786d', M_ROUGH);
    m.box(17, 43, 3, 19, 44, 14, '#878275', M_ROUGH);
    m.box(19, 43, 3, 25, 44, 14, '#7d786d', M_ROUGH);
    m.box(25, 43, 3, 27, 44, 14, '#878275', M_ROUGH);
    m.box(27, 43, 3, 33, 44, 14, '#7d786d', M_ROUGH);
    m.box(33, 43, 3, 35, 44, 14, '#878275', M_ROUGH);
    m.box(35, 43, 3, 41, 44, 14, '#7d786d', M_ROUGH);
    m.box(41, 43, 3, 43, 44, 14, '#878275', M_ROUGH);
    m.box(43, 43, 3, 45, 44, 14, '#7d786d', M_ROUGH);
    m.box(45, 43, 3, 46, 44, 14, '#878275', M_ROUGH);
    m.box(52, 7, 4, 56, 17, 39, '#8b4535', M_ROUGH);
    m.box(50, 8, 4, 52, 16, 39, '#8b4535', M_ROUGH);
    m.box(56, 8, 4, 58, 16, 39, '#8b4535', M_ROUGH);
    m.box(49, 10, 4, 50, 14, 39, '#8b4535', M_ROUGH);
    m.box(58, 10, 4, 59, 14, 39, '#8b4535', M_ROUGH);
    m.box(64, 10, 4, 68, 18, 31, '#8b4535', M_ROUGH);
    m.box(63, 11, 4, 64, 17, 31, '#8b4535', M_ROUGH);
    m.box(68, 11, 4, 69, 17, 31, '#8b4535', M_ROUGH);
    m.box(62, 12, 4, 63, 16, 31, '#8b4535', M_ROUGH);
    m.box(69, 12, 4, 70, 16, 31, '#8b4535', M_ROUGH);
    m.box(66, 31, 4, 68, 41, 5, '#d2a62a', M_ROUGH);
    m.box(69, 32, 4, 70, 40, 5, '#d2a62a', M_ROUGH);
    m.box(57, 33, 4, 58, 34, 5, '#d2a62a', M_ROUGH);
    m.box(70, 33, 4, 71, 39, 5, '#d2a62a', M_ROUGH);
    m.box(59, 34, 4, 61, 36, 6, '#d2a62a', M_ROUGH);
    m.box(57, 35, 4, 59, 36, 5, '#d2a62a', M_ROUGH);
    m.box(61, 35, 4, 63, 36, 7, '#d2a62a', M_ROUGH);
    m.box(57, 36, 4, 58, 37, 5, '#d2a62a', M_ROUGH);
    m.box(58, 36, 4, 62, 40, 5, '#9a7414', M_ROUGH);
    m.box(62, 36, 4, 64, 37, 7, '#d2a62a', M_ROUGH);
    m.box(57, 37, 4, 58, 39, 5, '#9a7414', M_ROUGH);
    m.box(62, 37, 4, 63, 39, 5, '#9a7414', M_ROUGH);
    m.box(63, 37, 4, 64, 40, 6, '#d2a62a', M_ROUGH);
    m.box(62, 39, 4, 63, 42, 5, '#d2a62a', M_ROUGH);
    m.box(59, 40, 4, 62, 41, 5, '#d2a62a', M_ROUGH);
    m.box(16, 44, 4, 19, 45, 8, '#ffb040', M_GLOW);
    m.box(21, 44, 4, 24, 45, 8, '#ffb040', M_GLOW);
    m.box(25, 44, 4, 28, 45, 8, '#ffb040', M_GLOW);
    m.box(60, 32, 5, 68, 34, 6, '#d2a62a', M_ROUGH);
    m.box(59, 33, 5, 60, 34, 6, '#d2a62a', M_ROUGH);
    m.box(68, 33, 5, 69, 39, 6, '#d2a62a', M_ROUGH);
    m.box(58, 34, 5, 59, 38, 6, '#d2a62a', M_ROUGH);
    m.box(66, 34, 5, 68, 40, 6, '#d2a62a', M_ROUGH);
    m.box(69, 34, 5, 70, 38, 6, '#d2a62a', M_ROUGH);
    m.box(59, 36, 5, 62, 39, 6, '#d2a62a', M_ROUGH);
    m.box(62, 37, 5, 63, 41, 6, '#d2a62a', M_ROUGH);
    m.box(60, 39, 5, 62, 40, 6, '#d2a62a', M_ROUGH);
    m.box(65, 39, 5, 66, 41, 6, '#d2a62a', M_ROUGH);
    m.box(63, 40, 5, 65, 41, 6, '#d2a62a', M_ROUGH);
    m.box(62, 33, 6, 66, 34, 7, '#d2a62a', M_ROUGH);
    m.box(66, 34, 6, 67, 38, 7, '#d2a62a', M_ROUGH);
    m.box(60, 35, 6, 61, 37, 7, '#d2a62a', M_ROUGH);
    m.box(67, 35, 6, 68, 37, 7, '#d2a62a', M_ROUGH);
    m.box(61, 36, 6, 62, 38, 7, '#d2a62a', M_ROUGH);
    m.box(62, 37, 6, 64, 39, 7, '#d2a62a', M_ROUGH);
    m.box(58, 24, 7, 60, 27, 10, '#7f8480', M_METAL);
    m.box(60, 25, 7, 65, 31, 8, '#7f8480', M_METAL);
    m.box(59, 27, 7, 60, 31, 8, '#7f8480', M_METAL);
    m.box(57, 24, 8, 58, 27, 12, '#7f8480', M_METAL);
    m.box(60, 24, 8, 61, 25, 10, '#7f8480', M_METAL);
    m.box(59, 27, 8, 60, 28, 10, '#7f8480', M_METAL);
    m.box(46, 30, 8, 56, 32, 10, '#7f8480', M_METAL);
    m.box(16, 44, 8, 24, 45, 9, '#1c1c1a', M_METAL);
    m.box(25, 44, 8, 29, 45, 9, '#1c1c1a', M_METAL);
    m.box(56, 24, 9, 57, 27, 13, '#7f8480', M_METAL);
    m.box(60, 25, 9, 61, 28, 10, '#7f8480', M_METAL);
    m.box(17, 44, 9, 19, 45, 14, '#878275', M_ROUGH);
    m.box(25, 44, 9, 27, 45, 14, '#878275', M_ROUGH);
    m.box(55, 24, 10, 56, 27, 14, '#7f8480', M_METAL);
    m.box(58, 24, 10, 60, 26, 11, '#7f8480', M_METAL);
    m.box(54, 25, 10, 55, 27, 15, '#7f8480', M_METAL);
    m.box(58, 26, 10, 59, 27, 11, '#7f8480', M_METAL);
    m.box(28, 44, 10, 44, 46, 11, pal.dark, M_MATTE);
    m.box(53, 24, 11, 55, 25, 15, '#7f8480', M_METAL);
    m.box(58, 24, 11, 59, 25, 12, '#7f8480', M_METAL);
    m.box(53, 25, 11, 54, 26, 16, '#7f8480', M_METAL);
    m.box(46, 32, 11, 56, 34, 12, '#7f8480', M_METAL);
    m.box(33, 44, 11, 35, 45, 14, '#878275', M_ROUGH);
    m.box(41, 44, 11, 43, 45, 14, '#878275', M_ROUGH);
    m.box(2, 45, 11, 4, 47, 12, '#34362f', M_METAL);
    m.box(27, 45, 11, 45, 48, 12, '#34362f', M_METAL);
    m.box(52, 23, 12, 54, 24, 16, '#7f8480', M_METAL);
    m.box(52, 24, 12, 53, 26, 16, '#7f8480', M_METAL);
    m.box(53, 26, 12, 54, 27, 15, '#7f8480', M_METAL);
    m.box(51, 23, 13, 52, 26, 17, '#7f8480', M_METAL);
    m.box(45, 12, 14, 46, 13, 15, '#7d786d', M_ROUGH);
    m.box(45, 19, 14, 46, 21, 15, '#7d786d', M_ROUGH);
    m.box(50, 23, 14, 51, 26, 18, '#7f8480', M_METAL);
    m.box(45, 27, 14, 46, 29, 15, '#7d786d', M_ROUGH);
    m.box(45, 35, 14, 46, 37, 15, '#7d786d', M_ROUGH);
    m.box(2, 43, 14, 46, 45, 15, pal.main, M_MATTE);
    m.box(2, 11, 15, 46, 12, 21, '#35505f', M_GLASS);
    m.box(2, 12, 15, 46, 19, 16, '#67645b', M_METAL);
    m.box(2, 19, 15, 46, 20, 21, '#35505f', M_GLASS);
    m.box(2, 20, 15, 46, 27, 16, '#67645b', M_METAL);
    m.box(49, 23, 15, 50, 26, 19, '#7f8480', M_METAL);
    m.box(53, 24, 15, 54, 25, 16, '#7f8480', M_METAL);
    m.box(48, 25, 15, 49, 26, 20, '#7f8480', M_METAL);
    m.box(2, 27, 15, 46, 28, 21, '#35505f', M_GLASS);
    m.box(2, 28, 15, 46, 35, 16, '#67645b', M_METAL);
    m.box(2, 35, 15, 46, 36, 21, '#35505f', M_GLASS);
    m.box(2, 36, 15, 46, 43, 16, '#67645b', M_METAL);
    m.box(2, 12, 16, 46, 18, 17, '#67645b', M_METAL);
    m.box(2, 20, 16, 46, 26, 17, '#67645b', M_METAL);
    m.box(48, 23, 16, 49, 25, 20, '#7f8480', M_METAL);
    m.box(52, 23, 16, 53, 25, 17, '#7f8480', M_METAL);
    m.box(47, 24, 16, 48, 26, 20, '#7f8480', M_METAL);
    m.box(2, 28, 16, 46, 34, 17, '#67645b', M_METAL);
    m.box(2, 36, 16, 46, 42, 17, '#67645b', M_METAL);
    m.box(2, 12, 17, 46, 17, 18, '#67645b', M_METAL);
    m.box(2, 20, 17, 46, 25, 18, '#67645b', M_METAL);
    m.box(46, 22, 17, 48, 24, 19, '#7f8480', M_METAL);
    m.box(46, 24, 17, 47, 26, 21, '#7f8480', M_METAL);
    m.box(2, 28, 17, 46, 33, 18, '#67645b', M_METAL);
    m.box(2, 36, 17, 46, 41, 18, '#67645b', M_METAL);
    m.box(2, 12, 18, 46, 16, 19, '#67645b', M_METAL);
    m.box(2, 20, 18, 46, 21, 21, '#67645b', M_METAL);
    m.box(2, 21, 18, 44, 24, 19, '#67645b', M_METAL);
    m.box(44, 21, 18, 47, 22, 21, '#7f8480', M_METAL);
    m.box(44, 22, 18, 46, 26, 21, '#7f8480', M_METAL);
    m.box(2, 28, 18, 46, 32, 19, '#67645b', M_METAL);
    m.box(2, 36, 18, 46, 40, 19, '#67645b', M_METAL);
    m.box(2, 12, 19, 46, 15, 20, '#67645b', M_METAL);
    m.box(2, 21, 19, 44, 23, 20, '#67645b', M_METAL);
    m.box(46, 22, 19, 47, 24, 21, '#7f8480', M_METAL);
    m.box(47, 23, 19, 48, 24, 20, '#7f8480', M_METAL);
    m.box(2, 28, 19, 46, 31, 20, '#67645b', M_METAL);
    m.box(2, 36, 19, 46, 39, 20, '#67645b', M_METAL);
    m.box(2, 12, 20, 46, 14, 21, '#67645b', M_METAL);
    m.box(2, 21, 20, 44, 22, 21, '#67645b', M_METAL);
    m.box(2, 28, 20, 46, 30, 21, '#67645b', M_METAL);
    m.box(2, 36, 20, 46, 38, 21, '#67645b', M_METAL);
    m.box(2, 12, 21, 46, 13, 22, pal.main, M_MATTE);
    m.box(2, 20, 21, 46, 21, 22, pal.main, M_MATTE);
    m.box(2, 28, 21, 46, 29, 22, pal.main, M_MATTE);
    m.box(2, 36, 21, 46, 37, 22, pal.main, M_MATTE);
    m.box(63, 10, 31, 69, 18, 33, pal.main, M_MATTE);
    m.box(62, 11, 31, 63, 17, 33, pal.main, M_MATTE);
    m.box(69, 11, 31, 70, 17, 33, pal.main, M_MATTE);
    m.box(64, 10, 33, 68, 18, 36, '#8b4535', M_ROUGH);
    m.box(63, 11, 33, 64, 17, 36, '#8b4535', M_ROUGH);
    m.box(68, 11, 33, 69, 17, 36, '#8b4535', M_ROUGH);
    m.box(62, 12, 33, 63, 16, 36, '#8b4535', M_ROUGH);
    m.box(69, 12, 33, 70, 16, 36, '#8b4535', M_ROUGH);
    m.box(63, 10, 36, 69, 18, 38, pal.main, M_MATTE);
    m.box(62, 11, 36, 63, 17, 38, pal.main, M_MATTE);
    m.box(69, 11, 36, 70, 17, 38, pal.main, M_MATTE);
    m.box(64, 10, 38, 68, 18, 41, '#8b4535', M_ROUGH);
    m.box(63, 11, 38, 64, 17, 41, '#8b4535', M_ROUGH);
    m.box(68, 11, 38, 69, 17, 41, '#8b4535', M_ROUGH);
    m.box(62, 12, 38, 63, 16, 41, '#8b4535', M_ROUGH);
    m.box(69, 12, 38, 70, 16, 41, '#8b4535', M_ROUGH);
    m.box(51, 7, 39, 57, 17, 41, pal.main, M_MATTE);
    m.box(50, 8, 39, 51, 16, 41, pal.main, M_MATTE);
    m.box(57, 8, 39, 58, 16, 41, pal.main, M_MATTE);
    m.box(49, 9, 39, 50, 15, 41, pal.main, M_MATTE);
    m.box(58, 9, 39, 59, 15, 41, pal.main, M_MATTE);
    m.box(52, 7, 41, 56, 17, 44, '#8b4535', M_ROUGH);
    m.box(50, 8, 41, 52, 16, 44, '#8b4535', M_ROUGH);
    m.box(56, 8, 41, 58, 16, 44, '#8b4535', M_ROUGH);
    m.box(64, 9, 41, 68, 19, 43, '#1c1c1a', M_METAL);
    m.box(49, 10, 41, 50, 14, 44, '#8b4535', M_ROUGH);
    m.box(58, 10, 41, 59, 14, 44, '#8b4535', M_ROUGH);
    m.box(63, 10, 41, 64, 18, 43, '#1c1c1a', M_METAL);
    m.box(68, 10, 41, 69, 18, 43, '#1c1c1a', M_METAL);
    m.box(62, 11, 41, 63, 17, 43, '#1c1c1a', M_METAL);
    m.box(69, 11, 41, 70, 17, 43, '#1c1c1a', M_METAL);
    m.box(61, 12, 41, 62, 16, 43, '#1c1c1a', M_METAL);
    m.box(70, 12, 41, 71, 16, 43, '#1c1c1a', M_METAL);
    m.box(51, 7, 44, 57, 17, 46, pal.main, M_MATTE);
    m.box(50, 8, 44, 51, 16, 46, pal.main, M_MATTE);
    m.box(57, 8, 44, 58, 16, 46, pal.main, M_MATTE);
    m.box(49, 9, 44, 50, 15, 46, pal.main, M_MATTE);
    m.box(58, 9, 44, 59, 15, 46, pal.main, M_MATTE);
    m.box(52, 7, 46, 56, 17, 49, '#8b4535', M_ROUGH);
    m.box(50, 8, 46, 52, 16, 49, '#8b4535', M_ROUGH);
    m.box(56, 8, 46, 58, 16, 49, '#8b4535', M_ROUGH);
    m.box(49, 10, 46, 50, 14, 49, '#8b4535', M_ROUGH);
    m.box(58, 10, 46, 59, 14, 49, '#8b4535', M_ROUGH);
    m.box(4, 4, 48, 6, 8, 50, '#3a3a36', M_METAL);
    m.box(3, 5, 48, 4, 7, 51, '#3a3a36', M_METAL);
    m.box(6, 5, 48, 7, 7, 51, '#3a3a36', M_METAL);
    m.box(52, 6, 49, 56, 18, 51, '#1c1c1a', M_METAL);
    m.box(50, 7, 49, 52, 17, 51, '#1c1c1a', M_METAL);
    m.box(56, 7, 49, 58, 17, 51, '#1c1c1a', M_METAL);
    m.box(49, 8, 49, 50, 16, 51, '#1c1c1a', M_METAL);
    m.box(58, 8, 49, 59, 16, 51, '#1c1c1a', M_METAL);
    m.box(48, 10, 49, 49, 14, 51, '#1c1c1a', M_METAL);
    m.box(59, 10, 49, 60, 14, 51, '#1c1c1a', M_METAL);
    m.box(4, 4, 50, 6, 5, 51, '#3a3a36', M_METAL);
    m.box(4, 5, 50, 6, 7, 54, '#ff8a2a', M_GLOW);
    m.box(4, 7, 50, 6, 8, 51, '#3a3a36', M_METAL);
    m.box(4, 4, 51, 6, 5, 56, '#ff8a2a', M_GLOW);
    m.box(3, 5, 51, 4, 7, 56, '#ff8a2a', M_GLOW);
    m.box(6, 5, 51, 7, 7, 56, '#ff8a2a', M_GLOW);
    m.box(4, 7, 51, 6, 8, 56, '#ff8a2a', M_GLOW);
    m.box(3, 4, 53, 4, 5, 54, '#ff8a2a', M_GLOW);
    m.box(6, 4, 53, 7, 5, 54, '#ff8a2a', M_GLOW);
    m.box(3, 7, 53, 4, 8, 54, '#ff8a2a', M_GLOW);
    m.box(6, 7, 53, 7, 8, 54, '#ff8a2a', M_GLOW);
    m.box(4, 5, 54, 6, 7, 56, '#ffe08a', M_GLOW);
    bannersV(m, 'refinery');
    starFront(m, 13.5, 44, 5, 2.4, pal.main);
    return m;
  },
  // BLENDER:refinery_soviets end
  // Radar: a concrete bunker carrying a big curved mesh antenna, and a banded lattice mast.
  dome(pal, cameo) {
    const m = new VModel(-2, -2, 50, 50, 46);
    slabV(m, 0, 0, 48, 48);
    panelBox(m, 4, 14, 1, 44, 44, 12);
    flatRoof(m, 4, 14, 44, 44, 12, pal);
    stripWin(m, 6, 26, 43, 6, 8);
    m.box(30, 43, 1, 38, 44, 9, SV.olive, M_METAL);
    m.cylZ(22, 28, 13, 18, 3, SV.steel, M_METAL);                       // pedestal
    if (cameo) radarDish(m, 22, 28, 18);                                 // the dish turns in the battle (SPINNERS, art.js); the cameo shows it still
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
    m.line(38, 10, 1, 38, 10, 24, C.steel, M_METAL);   // flag pole (the cloth: art.js drawFlag)
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
    bannersV(m, 'barracks');
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
    bannersV(m, 'factory');
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
  // Tech Center (Soviet): a grand research institute. A colonnaded hall of tall arched windows, two
  // glazed towers with stepped tops, and in the middle a drum of windows under a great ribbed glass dome
  // with a lantern and a star-tipped spire.
  tech(pal) {
    const m = new VModel(-2, -2, 76, 76, 62);
    const G1 = '#3f5a68', G2 = '#6f93a6';
    slabV(m, 0, 0, 72, 72);
    // Tall arched windows on a front face (row y) between concrete pilasters every 6.
    const arches = (x0, x1, y, z0, z1) => {
      for (let x = x0; x + 4 <= x1; x += 6) for (let z = z0; z < z1; z++) for (let dx = 1; dx < 5; dx++) {
        const top = z1 - 1 - (dx === 1 || dx === 4 ? 1 : 0);              // rounded heads
        if (z <= top) m.set(x + dx, y, z, z === z0 + Math.floor((z1 - z0) / 2) ? SV.seam : z >= top - 1 ? G2 : G1, M_GLASS);
      }
    };
    panelBox(m, 4, 34, 1, 68, 64, 15);                                   // the hall
    flatRoof(m, 4, 34, 68, 64, 15, pal);
    arches(4, 68, 63, 3, 14);
    for (const x0 of [7, 51]) for (let y = 37; y < 61; y += 6) {         // glazed roof lights either side of the dome
      m.box(x0, y, 15, x0 + 14, y + 4, 17, G1, M_GLASS);
      m.paint(x0, y, 15, x0 + 14, y + 4, 17, (x, yy, z) => ((x - x0) % 3 === 0 ? SV.steel : z === 16 && (yy === y + 1 || yy === y + 2) ? G2 : undefined));
    }
    for (const x of [4, 10, 16, 52, 58, 64]) m.box(x, 64, 1, x + 1, 66, 16, SV.light, M_ROUGH);   // columns of the portico
    m.box(4, 64, 15, 69, 67, 17, SV.conc, M_ROUGH);
    m.box(22, 64, 1, 50, 70, 2, SV.light, M_ROUGH); m.box(24, 64, 2, 48, 68, 3, SV.light, M_ROUGH);   // steps
    m.box(32, 63, 1, 40, 64, 10, '#2a2420');
    // Two glazed towers at the back corners, stepped at the top.
    for (const x0 of [5, 51]) {
      panelBox(m, x0, 8, 1, x0 + 16, 34, 30);
      for (let x = x0 + 1; x < x0 + 15; x += 3) m.box(x, 33, 3, x + 2, 34, 29, G1, M_GLASS);   // glass strips on the face
      m.paint(x0, 33, 3, x0 + 16, 34, 29, (x, y, z) => ((z - 3) % 5 === 4 ? SV.seam : z % 5 === 0 ? G2 : undefined));
      flatRoof(m, x0, 8, x0 + 16, 34, 30, pal);
      panelBox(m, x0 + 3, 12, 31, x0 + 13, 30, 35);
      flatRoof(m, x0 + 3, 12, x0 + 13, 30, 35, pal);
      m.box(x0 + 4, 29, 32, x0 + 12, 30, 34, G1, M_GLASS);
    }
    // The drum of windows and the ribbed glass dome.
    const DX = 36, DY = 36;
    m.cylZ(DX, DY, 16, 26, 13, SV.conc, M_ROUGH);
    m.paint(DX - 14, DY - 14, 18, DX + 14, DY + 14, 25, (x, y, z) => {
      const a = Math.atan2(y + 0.5 - DY, x + 0.5 - DX) / (Math.PI * 2) * 16;
      return Math.abs(a - Math.round(a)) < 0.28 || z === 21 ? undefined : z >= 24 ? G2 : G1;
    });
    m.cylZ(DX, DY, 26, 27, 13.6, pal.main, M_METAL);
    m.ellipsoid(DX, DY, 27, 12.5, 12.5, 15, G1, M_GLASS);
    m.paint(DX - 13, DY - 13, 27, DX + 13, DY + 13, 43, (x, y, z) => {
      const a = Math.atan2(y + 0.5 - DY, x + 0.5 - DX) / (Math.PI * 2) * 16;
      if (Math.abs(a - Math.round(a)) < 0.1) return pal.main;            // ribs in the side's colour
      if ((z - 27) % 5 === 0) return SV.steel;
      return hash3(x, y, z) > 0.78 ? G2 : undefined;
    });
    m.cylZ(DX, DY, 41, 45, 2.6, SV.light, M_ROUGH);                       // lantern and spire
    m.cylZ(DX, DY, 42, 44, 2.7, '#ffd27a', M_GLOW);
    m.line(DX, DY, 45, DX, DY, 56, SV.steel, M_METAL);
    for (let z = 56; z <= 59; z++) for (let x = DX - 2; x <= DX + 2; x++) if (inStar(x - DX, 57.5 - z, 2.4)) m.set(x, DY, z, C.yellow, M_GLOW);
    bannersV(m, 'tech');
    // A monument at the foot of the steps: a bronze worker in a long coat, fist raised, a banner in
    // the other hand, on a red granite plinth with a gold star.
    const BZ = '#6d5d3e', BZD = '#4a3f2a';
    m.box(31, 65, 1, 42, 72, 3, SV.light, M_ROUGH);
    m.box(32, 66, 3, 41, 71, 10, '#6a2c26', M_ROUGH);
    m.box(31, 65, 10, 42, 72, 11, '#7d3830', M_ROUGH);
    starFront(m, 36.5, 70, 6.5, 2.2, C.yellow);
    m.box(34, 67, 11, 36, 69, 16, BZD, M_METAL); m.box(37, 68, 11, 39, 70, 16, BZD, M_METAL);   // legs, striding
    m.box(33, 67, 15, 40, 70, 18, BZ, M_METAL);                          // long coat
    m.box(34, 67, 18, 39, 70, 22, BZ, M_METAL);
    m.box(33, 67, 21, 40, 70, 23, BZ, M_METAL);                          // shoulders
    m.ellipsoid(36.5, 68.5, 24.5, 1.6, 1.6, 1.9, BZ, M_METAL);           // head
    m.line(39.5, 68.5, 22, 42, 68.5, 29, BZ, M_METAL); m.line(40, 69, 22, 42.5, 69, 29, BZD, M_METAL);   // raised arm
    m.ellipsoid(42.3, 68.7, 29.5, 1, 1, 1, BZ, M_METAL);                 // fist
    m.line(32.5, 68.5, 21, 32.5, 68.5, 12, BZ, M_METAL);                 // the other arm, holding the banner
    m.line(31.5, 68.5, 11, 31.5, 68.5, 33, BZD, M_METAL);                // the banner pole
    for (let x = 25; x < 31; x++) { const w = Math.round(Math.sin((x - 25) * 0.9)); m.box(x, 68 + w, 27, x + 1, 69 + w, 33, pal.main, M_MATTE); }
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
  // Flame Tower: a flame projector on a turntable. Two fuel bottles in the team colour at the back, a splash shield,
  // and a long nozzle with a flared, scorched mouth and a pilot light.
  ftur: [(pal) => {
    const m = new VModel(-7, -6, 11, 6, 8);
    m.cylZ(0, 0, 0, 1, 3, '#2a2b2d', M_METAL);                          // turntable
    m.box(-2, -2, 1, 2, 2, 3, '#3a3d42', M_METAL);                      // pump housing
    for (const y of [-2, 2]) {                                          // fuel bottles
      m.cylX(-6, -1, y, 2.5, 1.5, pal.main, M_ROUGH);
      m.cylX(-4, -3, y, 2.5, 1.5, pal.deep, M_ROUGH);
      m.cylX(-7, -6, y, 2.5, 1.0, '#8c9094', M_METAL);
    }
    m.box(1, -4, 1, 3, 4, 5, pal.dark, M_METAL);                        // splash shield
    m.box(1, -3, 4, 3, 3, 5, '#3a3d42', M_METAL);
    m.cylX(2, 8, 0, 3, 1.0, '#34362f', M_METAL);                        // nozzle
    m.cylX(7, 10, 0, 3, 1.5, '#1c1612', M_METAL);                       // flared, scorched mouth
    m.box(9, -1, 2, 10, 1, 4, '#ff7a1a', M_GLOW);                       // pilot light
    m.box(3, -1, 1, 5, 1, 2, '#6e5539', M_ROUGH);                       // fuel line under the nozzle
    return m;
  }, 12, 13, 25],
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

// The War Factory's door (both factions: x 20 to 52 on the front face, y 45, up to z 16), drawn over the
// structure while it opens for a new unit (art.js drawStructure, b.doorAt). It rolls up like a shutter: lift
// (0 to 15 voxels) of dark hall shows below it, and its slats move up with it.
const DOOR_STEPS = 5;
function factoryDoor(faction, step) {
  const m = new VModel(-2, -2, 74, 50, 17), lift = Math.round(15 * step / DOOR_STEPS);
  const sov = faction === 'soviets', slat = sov ? SV.olive : '#3b3b37', slatD = sov ? SV.oliveD : '#2c2c28';
  for (let z = 1; z < 16; z++) {
    if (z < 1 + lift) m.box(20, 44, z, 52, 46, z + 1, z === 1 ? '#34302a' : z > lift - 1 ? '#0c0b0a' : '#171512', M_MATTE);   // the hall inside
    else m.box(20, 44, z, 52, 46, z + 1, z === 1 + lift && lift ? '#1e1e1b' : (z - lift) % 2 ? slatD : slat, M_METAL);
  }
  return m;
}
function factoryDoorSprite(faction, step) {
  return sprite('FD' + faction + step, () => factoryDoor(faction, step), 0, 0, { shadow: false });
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
// Where a head's barrels end, for the shot and its muzzle flash (world.js headTip): [out along the barrels, each barrel's
// distance either side of the middle, height above the head's pivot] in model voxels. The AA Gun's twin barrels point up
// at the sky, so its flashes sit high above the head, one barrel and then the other.
const HEAD_TIPS = { aagun: [9.5, 2, 10] };
// Turning parts that are not weapons: type, then faction -> [builder, pivot x, pivot y, pivot height]. Same layout as HEADS
// (built round its own pivot), but kept apart: HEADS is keyed by type only and world.js muzzle reads it.
const SPINNERS = {
  dome: { soviets: [(pal) => { const m = new VModel(-20, -14, 40, 18, 16); radarDish(m, 0, 0, 0); return m; }, 22, 28, 18] },
  cy: {   // the tower crane's jib; art.js craneState swings it and hangs the hook (CRANE_HOOK)
    allies: [(pal) => { const m = new VModel(-40, -4, 6, 4, 6); towerJib(m, 0, 0, 0, false); return m; }, 66, 9.5, 42],
    soviets: [(pal) => { const m = new VModel(-40, -4, 6, 4, 6); towerJib(m, 0, 0, 0, true); return m; }, 64, 3.5, 43],
  },
};
// The crane's hook: [distance out along the jib, hook height at rest, lowest over the yard's own roof] in model voxels.
const CRANE_HOOK = { allies: [34, 20, 29], soviets: [28, 24, 28] };
function spinnerSprite(type, faction, angle, stage) {
  const pal = palFor(faction), h = SPINNERS[type][faction], key = 'P' + type + pal.key;
  if (stage) return facingSprite(key + 'd' + stage, () => scorchModel(model(key, () => h[0](pal)), stage, type), angle, FACINGS, { shadow: false });
  return facingSprite(key, () => h[0](pal), angle, FACINGS, { shadow: false });
}
function structureSprite(type, faction, camo) {
  const pal = camoPal(faction, camo);
  return sprite('S' + type + pal.key, () => STRUCTURES[type](pal, faction), 0, 0);
}
// part: for a head with HEAD_BARRELS, 0 is the head without its barrels and -1 / 1 the barrel on that side (model y < 0 / > 0).
function headSprite(type, faction, angle, stage, part) {
  const pal = palFor(faction), h = HEADS[type], hb = HEAD_BARRELS[type], p = hb ? part || 0 : 0;
  const key = 'H' + type + pal.key + (p ? (p < 0 ? 'L' : 'R') : '');
  const build = hb ? () => splitHead(model('H' + type + pal.key + 'W', () => h[0](pal)), hb.cut, p) : () => h[0](pal);
  if (stage) return facingSprite(key + 'd' + stage, () => scorchModel(model(key, build), stage, type), angle, FACINGS, { shadow: false });
  return facingSprite(key, build, angle, FACINGS, { shadow: false });
}
// A head's barrels drawn apart from it, so each recoils on its own (art.js): cut picks a barrel's voxels (model x, y, z),
// axis is the way the barrels point (out, up; a unit vector). The AA Gun's twin barrels rise at about 42 degrees.
const HEAD_BARRELS = { aagun: { cut: (x, y, z) => x >= 4 && z >= 6, axis: [0.74, 0.67] } };
function splitHead(m, cut, part) {
  const c = copyModel(m);
  for (let z = 0; z < c.d; z++) for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const i = (z * c.h + y) * c.w + x;
    if (c.col[i] < 0) continue;
    const Y = y + c.y0, barrel = cut(x + c.x0, Y, z);
    if (part === 0 ? barrel : !barrel || (Y < 0) !== (part < 0)) c.col[i] = -1;
  }
  return c;
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
  spriteSpend = -1e9;   // (made between frames, never a stand-in; ui.js draw resets it)
  const q = dmgQueue[0];
  if (!q) return;
  const keep = drawVar; drawVar = q.v;
  const pal = camoPal(q.faction, q.camo);
  drawVar = keep;
  sprite('S' + q.type + pal.key + 'd' + q.stage, () => damageModel(model('S' + q.type + pal.key, () => STRUCTURES[q.type](pal, q.faction)), q.stage, q.type, q.faction), 0, 0);
  dmgQueue.shift();
  if (dmgQueue.length) setTimeout(pumpDamaged, 20);
}
// Build-up: a structure going up (or being sold) is drawn from its own model cut off at a height, so the walls rise course by
// course (art.js drawBuildUp). BUILD_STEPS cut heights, made one at a time in the background like the damaged copies, and
// dropped again once nothing of that type has been under construction for BUILD_KEEP ms. Not baked.
const BUILD_STEPS = 6, BUILD_KEEP = 30000;
const buildQueue = [], buildUsed = new Map();   // sprite key -> last time wanted
function buildModel(m, step) {
  const c = copyModel(m), cut = step <= 0 ? 1 : Math.ceil(m.d * step / BUILD_STEPS), n = c.w * c.h;
  for (let i = cut * n; i < c.col.length; i++) c.col[i] = -1;
  return c;
}
// The sprite of a structure built to `step` (0 = the slab only, BUILD_STEPS - 1 = just short of done), or null until it is made.
function buildSprite(type, faction, step, camo) {
  const pal = camoPal(faction, camo), mk = 'S' + type + pal.key + 'b' + step, k = mk + '|0';
  buildUsed.set(k, performance.now());
  const s = spriteCache2.get(k);
  if (s) return s;
  if (!buildQueue.some((q) => q.k === k)) {
    buildQueue.push({ k, mk, type, faction, step, camo, v: drawVar });
    if (buildQueue.length === 1) setTimeout(pumpBuild, 0);
  }
  return null;
}
function warmBuild(type, faction, camo) { if (G && G.me >= 0) for (let i = 0; i < BUILD_STEPS; i++) buildSprite(type, faction, i, camo); }
function pumpBuild() {
  spriteSpend = -1e9;   // (made between frames, never a stand-in; ui.js draw resets it)
  const q = buildQueue.shift();
  if (!q) return;
  const keep = drawVar; drawVar = q.v;
  try {
    const pal = camoPal(q.faction, q.camo), bk = 'S' + q.type + pal.key;
    sprite(q.mk, () => buildModel(model(bk, () => STRUCTURES[q.type](pal, q.faction)), q.step), 0, 0);
  } finally { drawVar = keep; }
  if (buildQueue.length) setTimeout(pumpBuild, 20);
}
// Let go of build sprites nothing has asked for lately.
function dropBuildSprites() {
  const now = performance.now();
  for (const [k, t] of buildUsed) {
    if (now - t < BUILD_KEEP) continue;
    buildUsed.delete(k);
    spriteCache2.delete(k); modelCache.delete(k.slice(0, -2)); spriteAny.delete(k.slice(0, -2));
  }
}
function hullSprite(u, pal) {
  const d = u.def;
  const key = d.type + pal.key;
  if (d.draw === 'tank') return facingSprite('T' + key, () => tankHull(pal, d.size), u.face);
  if (d.draw === 'jeep') return facingSprite('J' + key, () => jeepModel(pal), u.face);
  if (d.draw === 'apc') return facingSprite('Q' + key, () => d.type === 'btr' ? btrHull(pal) : apcHull(pal), u.face);
  if (d.draw === 'fob') return facingSprite('F' + key, () => fobModel(pal), u.face);
  if (d.draw === 'mcv') return facingSprite('M' + key, () => mcvModel(pal), u.face);
  if (d.draw === 'arty') return facingSprite('R' + key, () => artyModel(pal), u.face);
  if (d.draw === 'v2') { const loaded = !(u.cd > 1.2), st = Math.round((u.setup || 0) * V2_STEPS); return facingSprite('W' + key + loaded + st, () => v2Model(pal, loaded, st / V2_STEPS), u.face); }
  if (d.draw === 'harv') { const full = (u.load || 0) > d.capacity * 0.3; return facingSprite('V' + key + full, () => harvModel(pal, full), u.face); }
  const ab = airBuild(u, pal);
  return facingSprite(ab[0], ab[1], u.face);
}
// The aircraft models by type: [model key, builder] (hullSprite; tiltSprite for a crash).
function airBuild(u, pal) {
  const d = u.def, key = d.type + pal.key;
  if (d.type === 'comanche') { const st = Math.round((u.bay || 0) * BAY_STEPS); return ['A' + key + 'b' + st, () => comancheModel(pal, st / BAY_STEPS)]; }
  if (d.fly === 'heli') return ['A' + key, () => d.type === 'hind' ? hindModel(pal) : d.type === 'chinook' ? chinookModel(pal) : d.type === 'halo' ? haloModel(pal) : heliModel(pal)];
  if (d.draw === 'cargo') {
    if (d.type === 'transport') return u.faction === 'allies' ? ['H' + key, () => c130Model(pal)] : ['I' + key, () => il76Model(pal)];
    if (d.type === 'bomber') return u.faction === 'allies' ? ['B' + key, () => b1Model(pal)] : ['K' + key, () => tu22Model(pal)];
    return ['C' + key, () => cargoModel(pal, d.type === 'bomber')];
  }
  if (d.type === 'a10') return ['G' + key, () => a10Model(pal)];
  if (d.type === 'su25') return ['U' + key, () => su25Model(pal)];
  if (d.type === 'spyplane') return u.faction === 'soviets' ? ['Y' + key, () => il76Model(pal, true)]   // Beriev A-50
    : ['X' + key, () => sr71Model(pal)];                                                                    // SR-71
  const mig = d.type === 'mig';
  return ['A' + key + mig, () => jetModel(pal, mig)];
}

// A falling aircraft drawn at its real attitude (world.js updateCrash: pitch, nose down positive, and roll): its model turned
// through pitch and roll voxel by voxel (tiltModel), then rendered at its heading as usual. Steps of TILT_N to a turn; kept in a
// small cache of pictures only (the turned models are dropped). New pictures are made at most TILT_BUDGET in any 30 ms (a frame
// or two); over that, undefined: the caller keeps its last picture. Level: null (the usual sprite).
const TILT_N = 16, TILT_BUDGET = 1, TILT_KEEP = 500, TILT_CACHE = new Map();
let tiltAt = -1e9, tiltN = 0;
function tiltSprite(u, pal, pitch, roll) {
  const ab = airBuild(u, pal);
  if (!ab) return null;
  const pi = Math.max(-TILT_N / 4, Math.min(TILT_N / 4, Math.round(pitch / (Math.PI * 2) * TILT_N)));
  const ri = ((Math.round(roll / (Math.PI * 2) * TILT_N) % TILT_N) + TILT_N) % TILT_N;
  if (!pi && !ri) return null;
  const f = facingIndex(u.face, FACINGS), k = ab[0] + '|' + pi + '|' + ri + '|' + f;
  let s = TILT_CACHE.get(k);
  if (s) { TILT_CACHE.delete(k); TILT_CACHE.set(k, s); return s; }
  const now = performance.now();
  if (now - tiltAt > 30) { tiltAt = now; tiltN = 0; }
  if (tiltN >= TILT_BUDGET) return undefined;
  tiltN++;
  const m = tiltModel(model(ab[0], ab[1]), pi * Math.PI * 2 / TILT_N, ri * Math.PI * 2 / TILT_N);
  s = renderVox(m, f * Math.PI * 2 / FACINGS, {});
  s.zoff = m.zoff;
  TILT_CACHE.set(k, s);
  if (TILT_CACHE.size > TILT_KEEP) TILT_CACHE.delete(TILT_CACHE.keys().next().value);
  return s;
}
// A model turned about its middle: pitch about its y axis (nose, +x, going down for pitch > 0), then roll about x (applied first).
// Sampled backwards from every voxel of the new box, so it has no holes. zoff: how much higher its middle stands than the
// original's (the drawing lowers it by that).
function tiltModel(src, pitch, roll) {
  const cx = src.x0 + src.w / 2, cy = src.y0 + src.h / 2, cz = src.d / 2;
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  const fwd = (x, y, z) => { const y1 = y * cr - z * sr, z1 = y * sr + z * cr; return [x * cp + z1 * sp, y1, -x * sp + z1 * cp]; };
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const x of [-src.w / 2, src.w / 2]) for (const y of [-src.h / 2, src.h / 2]) for (const z of [-cz, cz]) {
    const q = fwd(x, y, z); for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], q[i]); hi[i] = Math.max(hi[i], q[i]); }
  }
  const zs = Math.ceil(-lo[2]);
  const m = new VModel(Math.floor(cx + lo[0]), Math.floor(cy + lo[1]), Math.ceil(cx + hi[0]), Math.ceil(cy + hi[1]), zs + Math.ceil(hi[2]) + 1);
  m.zoff = zs - cz;
  for (let z = 0; z < m.d; z++) for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const X = m.x0 + x + 0.5 - cx, Y = m.y0 + y + 0.5 - cy, Z = z + 0.5 - zs;
    // back through the pitch, then the roll
    const x1 = X * cp - Z * sp, z1 = X * sp + Z * cp;
    const y0 = Y * cr + z1 * sr, z0 = -Y * sr + z1 * cr;
    const sx = Math.floor(x1 + cx), sy = Math.floor(y0 + cy), sz = Math.floor(z0 + cz);
    const si = src.idx(sx, sy, sz);
    if (si < 0 || src.col[si] < 0) continue;
    const di = (z * m.h + y) * m.w + x;
    m.col[di] = src.col[si]; m.mat[di] = src.mat[si];
  }
  return m;
}
function turretSprite(u, pal) {
  const d = u.def;
  if (d.draw === 'tank') return facingSprite('t' + d.type + pal.key, () => tankTurret(pal, d.size), u.tface, FACINGS, { shadow: false });
  if (d.draw === 'jeep') return facingSprite('m' + pal.key, () => mgModel(pal), u.tface, FACINGS, { shadow: false });
  if (d.draw === 'apc') { const f = apcFrame(u); return facingSprite('q' + d.type + pal.key + f, () => d.type === 'btr' ? btrTurret(pal, f) : apcTurret(pal, f), u.tface, FACINGS, { shadow: false }); }
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
// crawl 1 or 2: the two poses of the crawl (opposite arm and leg forward).
function proneModel(pal, faction, type, crawl) {
  const m = new VModel(-16, -5, 13, 5, 7);
  const K = infKit(pal, faction), cs = crawl === 1 ? 1 : crawl === 2 ? -1 : 0;
  for (const y0 of [-2, 0]) {
    const d = cs * (y0 < -1 ? 1 : -1);
    m.box(-14 + d, y0, 0, -13 + d, y0 + 2, 2, C.black); m.box(-13 + d, y0, 0, -6, y0 + 2, 2, K.pants);
    if (d > 0) m.box(-9, y0 + (y0 < -1 ? -1 : 1), 0, -7, y0 + (y0 < -1 ? 0 : 2) + 1, 2, K.pants);   // the knee drawn up, out to the side
  }
  m.box(-6, -2, 0, 2, 2, 3, pal.main); m.box(-6, -3, 2, 2, 3, 3, shadeInt(pal.main, 0.9));
  m.box(-6, -2, 0, -5, 2, 3, K.web);
  if (type !== 'pilot' && type !== 'technician') m.box(-5, -2, 3, -1, 2, 4, C.oliveD);
  m.box(2, -1, 0, 5, 2, 3, K.skin);
  m.box(1, -2, 2, 5, 3, 4, type === 'pilot' ? '#cfcab8' : type === 'technician' ? '#4a3a2a' : type === 'grenadier' ? '#5d6236' : K.helm);
  for (const y of [-3, 2]) {
    const d = cs * (y < 0 ? -2 : 2);                                            // the arm opposite the forward leg reaches out
    m.box(1, y, 0, 5 + d, y + 1, 1.5, shadeInt(pal.main, 0.86)); m.set(5 + d, y, 0, K.skin);
  }
  if (type === 'rocket') {
    m.cylX(-4, 8, -2.5, 3.5, 1.3, '#56603a'); m.box(8, -4, 2, 10, -1, 5, '#2a2a24');
    if (faction === 'soviets') { m.ellipsoid(9, -2.5, 3.5, 2.4, 1.9, 1.9, '#4a4f3a', M_METAL); m.set(11, -3, 3, '#c8281e'); }   // rocket head
  }
  else if (type === 'grenadier') m.box(5, 1, 0, 7, 3, 1.5, '#3f4a2a');
  else if (type === 'engineer') m.box(5, 1, 0, 9, 3, 2, '#c8961e');   // the toolbox pushed ahead
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
  if (type !== 'pilot' && type !== 'technician' && type !== 'grenadier') m.box(-5, -2, 3 + lift / 2, -1, 2, 4 + lift / 2, C.oliveD);
  m.box(2, -1, lift, 5, 2, 3 + lift, K.skin);
  m.box(1, -2, 2 + lift, 5, 3, 4 + lift, type === 'pilot' ? '#cfcab8' : type === 'technician' ? '#4a3a2a' : type === 'grenadier' ? '#5d6236' : K.helm);
  for (const y of [-3, 2]) {
    if (up) { m.box(0, y, 1, 1, y + 1, 5, shadeInt(pal.main, 0.86)); m.set(0, y, 0, K.skin); }          // straight arms
    else { m.box(-1, y + (y < 0 ? -1 : 1), 0, 1, y + (y < 0 ? 0 : 2), 2, shadeInt(pal.main, 0.86)); m.set(1, y, 0, K.skin); }   // elbows out
  }
  if (type === 'rocket') { m.cylX(-8, 4, -5, 0.7, 0.9, '#56603a'); if (faction === 'soviets') m.ellipsoid(5, -5, 0.8, 1.6, 1.3, 1.3, '#4a4f3a', M_METAL); }
  else if (type !== 'grenadier' && type !== 'pilot' && type !== 'technician' && type !== 'engineer') { m.box(-6, 4, 0, 3, 5, 1, C.gun, M_METAL); m.box(-9, 4, 0, -6, 5, 1.5, '#6a4426'); }
  return m;
}
function infSprite(u, pal, frame) {
  return facingSprite(`I${u.type}${pal.key}${frame}`, () => infModel(pal, u.faction, u.type, frame), u.face, 16, { crisp: true, scale: INF_SCALE, fit: true });
}
const TURRET_Z = { tank: 7, jeep: 7, arty: 9, v2: 12, apc: 11 };
// The APC's gun kicks back on alternate rounds of a burst (`shots` is synced, so an online copy shows it too).
const apcFrame = (u) => (u.fireT > 0 && (u.shots || 0) % 2 ? 1 : 0);
function turretZ(d) { return d.size && d.size.tz !== undefined ? d.size.tz : TURRET_Z[d.draw]; }   // a def can sit its turret lower (Heavy Tank)

// Scenery: trees, boulders, ore, all rendered once.
// snow: a pine with snow lying on the edge of each tier of boughs and on its tip.
function treeModel(seed, pine, snow) {
  const r = rng(seed);
  const m = new VModel(-12, -12, 12, 12, 30);
  if (pine) {
    m.cylZ(0, 0, 0, 5, 1.2, C.bark, M_ROUGH);
    const top = 20 + Math.floor(r() * 7);
    for (let z = 3; z < top; z++) {
      const rad = (top - z) * 0.36 + (z % 4 === 0 ? 0.8 : 0);
      for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) {
        const d = Math.hypot(x + 0.5, y + 0.5);
        if (!(d <= rad && (d < rad - 1 || r() < 0.6))) continue;
        const white = snow && ((z % 4 === 0 && d > rad - 2.2) || z >= top - 2 || (z % 4 === 1 && d > rad - 1.2 && r() < 0.5) || r() < 0.08);
        m.set(x, y, z, white ? C.snow[Math.floor(r() * 2)] : C.pine[Math.floor(r() * 3)], M_ROUGH);
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
// A tree burnt out by fire: a charred trunk and bare, blackened branches (broadleaf) or stubs of boughs up a
// charred pole (pine). Same seed as the living tree, so it keeps its height.
const CHAR = ['#1e1a17', '#2c2622', '#3b3430', '#4a423b'], ASH = ['#6b635b', '#827970', '#968d82'];
function burntTreeModel(seed, pine) {
  const r = rng(seed);
  const m = new VModel(-12, -12, 12, 12, 30);
  const col = (z, top) => z >= top - 1 || r() < 0.3 ? ASH[Math.floor(r() * 3)] : CHAR[Math.floor(r() * 4)];   // grey ash on top, char below
  const blob = (x, y, z, c) => { for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) m.set(Math.round(x) + dx, Math.round(y) + dy, Math.round(z), c, M_ROUGH); };
  if (pine) {
    const top = 18 + Math.floor(r() * 6);
    for (let z = 0; z < top; z++) for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
      const rad = z < top - 4 ? 1.9 : 1.2;
      if (Math.hypot(x + 0.5, y + 0.5) <= rad) m.set(x, y, z, x + y > 0 && r() < 0.5 ? ASH[Math.floor(r() * 2)] : CHAR[Math.floor(r() * 3)], M_ROUGH);
    }
    for (let z = 5; z < top - 2; z += 3) for (let k = 0; k < 4; k++) {   // stubs of burnt boughs, drooping
      if (r() < 0.25) continue;
      const a = k * Math.PI / 2 + r() * 0.8, len = 2 + Math.floor(r() * Math.max(1, (top - z) * 0.35));
      for (let i = 1; i <= len + 1; i++) blob(Math.cos(a) * (i + 1), Math.sin(a) * (i + 1), z - (i > 2 ? 1 : 0), col(i, len + 1));
    }
  } else {
    for (let z = 0; z < 12; z++) for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
      if (Math.hypot(x + 0.5, y + 0.5) <= (z < 3 ? 2.4 : 2)) m.set(x, y, z, x + y > 0 && r() < 0.5 ? ASH[Math.floor(r() * 2)] : CHAR[Math.floor(r() * 3)], M_ROUGH);
    }
    const limbs = 5 + Math.floor(r() * 3);
    for (let b = 0; b < limbs; b++) {
      const a = (b / limbs) * Math.PI * 2 + r() * 0.6, z0 = 7 + r() * 5, len = 5 + r() * 4, rise = 0.6 + r() * 0.7;
      for (let i = 0; i <= len * 2; i++) {
        const t = i / 2, x = Math.cos(a) * t, y = Math.sin(a) * t, z = z0 + t * rise;
        blob(x, y, z, col(i, len * 2));
        if (i === Math.floor(len) && r() < 0.8) {   // a twig off the side
          const a2 = a + (r() < 0.5 ? 0.9 : -0.9);
          for (let j = 1; j <= 3; j++) m.set(Math.round(x + Math.cos(a2) * j), Math.round(y + Math.sin(a2) * j), Math.round(z + j), ASH[Math.floor(r() * 3)], M_ROUGH);
        }
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
const scenery = { trees: [], pines: [], snowPines: [], burntTrees: [], burntPines: [], rocks: [], ore: [], gem: [] };
function buildScenery() {
  if (scenery.trees.length) return;
  for (let i = 0; i < 6; i++) scenery.trees.push(renderVox(treeModel(i * 97 + 3, false), 0));
  for (let i = 0; i < 5; i++) scenery.pines.push(renderVox(treeModel(i * 71 + 11, true), 0));
  for (let i = 0; i < 6; i++) scenery.snowPines.push(renderVox(treeModel(i * 71 + 11, true, true), 0));
  for (let i = 0; i < 5; i++) scenery.burntTrees.push(renderVox(burntTreeModel(i * 97 + 3, false), 0));
  for (let i = 0; i < 5; i++) scenery.burntPines.push(renderVox(burntTreeModel(i * 71 + 11, true), 0));
  for (let i = 0; i < 5; i++) scenery.rocks.push(renderVox(rockModel(i * 53 + 7), 0, { flat: true }));   // (painted into the ground)
  for (let lv = 0; lv < 4; lv++) { scenery.ore[lv] = []; for (let v = 0; v < 4; v++) scenery.ore[lv].push(renderVox(oreModel(lv, v), 0)); }
  for (let lv = 0; lv < 4; lv++) { scenery.gem[lv] = []; for (let v = 0; v < 4; v++) scenery.gem[lv].push(renderVox(gemModel(lv, v), 0)); }
}

// ---------------------------------------------------------------------------
// Village houses (world.js genVillage). A house's type is 'hv:<kind>:<w>:<h>:<look>' and its whole design is rolled
// from that text: walls (plaster, brick, stone or timber frame), one or two storeys, a gabled or hipped roof of tile,
// slate or thatch, windows with or without shutters, a door to the south, a chimney, a fence and a garden. The church
// ('church0': tower at the north or west end, 'church1': south or east) is stone with a bell tower and spire.
// It is registered as a structure the first time it is drawn, so the damaged copies (damagedSprite) work as for any
// structure. Neutral: no side colours.
function houseStructure(type) {
  if (!STRUCTURES[type]) STRUCTURES[type] = () => houseModel(type);
  return type;
}
function houseModel(type) {
  const [, kind, ws, hs, , snow] = type.split(':'), W = +ws * CELL, H = +hs * CELL, r = rng(strSeed(type));
  if (snow && kind !== 'fountain') { const m = houseModel(type.slice(0, -2)); FORT_INFO.set(type, FORT_INFO.get(type.slice(0, -2))); return snowCover(m, 3); }
  if (kind.startsWith('church')) { const c = churchModel(W, H, kind === 'church1', r); FORT_INFO.set(type, c.fort); return c; }
  if (kind === 'fountain') return fountainModel(W, H);
  const pick = (a) => a[(r() * a.length) | 0];
  const m = new VModel(-2, -2, W + 2, H + 2, 64);
  // The plot: a little yard to the south, the house behind it.
  const bx0 = 4, by0 = 4, bx1 = W - 4, by1 = H - (H > 50 ? 12 : 9);
  const walls = pick(['plaster', 'plaster', 'plaster', 'brick', 'stone', 'timber', 'timber']);
  const plaster = pick(['#ddd3bb', '#e6e1d3', '#cfb48a', '#d8bfae', '#c9c2a8', '#e2d6a8']);
  const two = r() < (W * H > 48 * 48 ? 0.45 : 0.2), top = two ? 21 + ((r() * 3) | 0) : 11 + ((r() * 3) | 0);
  // Walls.
  if (walls === 'brick') brickBox(m, bx0, by0, 0, bx1, by1, top);
  else {
    const base = walls === 'stone' ? '#9c968a' : plaster;
    m.box(bx0, by0, 0, bx1, by1, top, base, M_ROUGH);
    m.paint(bx0, by0, 0, bx1, by1, top, (x, y, z) => {
      if (z < 2) return '#6f6a61';   // plinth
      if (walls === 'stone') return z % 4 === 0 || ((x + y + (z >> 2) * 3) % 7 === 0) ? '#7f7a70' : hash3(x, y, z) > 0.8 ? '#aaa597' : undefined;
      if (walls === 'timber' && (z === top - 1 || z === 2 || (two && z === 11) || ((x - bx0) % 8 === 0 && (y === by0 || y === by1 - 1)) || ((y - by0) % 8 === 0 && (x === bx0 || x === bx1 - 1)))) return '#4a3826';
      if (hash3(x, y, z) > 0.9) return shadeInt(base, 0.92);
    });
  }
  // The roof: along the longer side (now and then across, or hipped), a shell over walls filled up to it.
  const roofCol = pick([['#a3492f', '#86382a'], ['#a3492f', '#86382a'], ['#4e535c', '#3e424a'], ['#6e4b33', '#583b28'], ['#a88d52', '#8c7340'], ['#8e3b28', '#732f20']]);
  const thatch = roofCol[0] === '#a88d52', hip = r() < 0.3, alongX = (bx1 - bx0 >= by1 - by0) !== (r() < 0.12);
  const pitch = thatch ? 0.95 : 0.75, mx = (bx0 + bx1) / 2, my = (by0 + by1) / 2;
  const hx = (bx1 - bx0) / 2 + 1, hy = (by1 - by0) / 2 + 1;
  const rise = (x, y) => {
    const ax = (hx - Math.abs(x + 0.5 - mx)) * pitch, ay = (hy - Math.abs(y + 0.5 - my)) * pitch;
    return Math.max(0, Math.round(hip ? Math.min(ax, ay) : alongX ? ay : ax));
  };
  const wallCol = walls === 'brick' ? C.brick : walls === 'stone' ? '#9c968a' : plaster;
  for (let y = by0 - 1; y < by1 + 1; y++) for (let x = bx0 - 1; x < bx1 + 1; x++) {
    const k = rise(x, y), inside = x >= bx0 && x < bx1 && y >= by0 && y < by1;
    if (inside && k > 1) m.box(x, y, top, x + 1, y + 1, top + k - 1, wallCol, M_ROUGH);   // gable ends and loft
    const course = Math.floor(k / (thatch ? 4 : 3)) % 2, col = hash3(x, y, 5) > (thatch ? 0.7 : 0.88) ? shadeInt(roofCol[0], 1.1) : course ? roofCol[1] : roofCol[0];
    m.box(x, y, top + Math.max(0, k - 1), x + 1, y + 1, top + k + 1, col, M_ROUGH);
  }
  const ridge = Math.round(Math.min(hx, hy) * pitch);
  // Windows (south and east faces: the ones the camera sees), shutters, the door.
  const glass = '#33454f', frame = '#e8e4da', shutter = pick(['#3f5f3a', '#2f4766', '#7a3a2a', '#5a4632', null, null]);
  const rows = two ? [4, 14] : [4], wins = [];
  for (const z of rows) {
    for (let x = bx0 + 4; x + 4 <= bx1 - 3; x += 10) {
      wins.push({ face: 's', x, y: by1, z });
      m.box(x, by1 - 1, z, x + 4, by1, z + 5, frame, M_MATTE); m.box(x + 1, by1 - 1, z + 1, x + 3, by1, z + 4, glass, M_GLASS);
      if (shutter) { m.box(x - 1, by1 - 1, z, x, by1, z + 5, shutter, M_MATTE); m.box(x + 4, by1 - 1, z, x + 5, by1, z + 5, shutter, M_MATTE); }
    }
    for (let y = by0 + 4; y + 4 <= by1 - 3; y += 10) {
      wins.push({ face: 'e', x: bx1, y, z });
      m.box(bx1 - 1, y, z, bx1, y + 4, z + 5, frame, M_MATTE); m.box(bx1 - 1, y + 1, z + 1, bx1, y + 3, z + 4, glass, M_GLASS);
    }
  }
  const dx = Math.round(mx - 2 + (r() - 0.5) * (bx1 - bx0 - 12));
  m.clear(dx, by1 - 1, 2, dx + 5, by1, 10);
  m.box(dx, by1 - 1, 0, dx + 5, by1, 10, '#4b3424', M_MATTE); m.box(dx + 1, by1 - 1, 2, dx + 4, by1, 9, pick(['#5d3f2a', '#2f4a3a', '#6b2a22']), M_MATTE);
  m.box(dx - 1, by1, 0, dx + 6, by1 + 2, 1, '#77726a', M_ROUGH);   // the step
  // A chimney through the roof.
  if (r() < 0.7) {
    const cx = alongX ? Math.round(bx0 + 4 + r() * (bx1 - bx0 - 8)) : Math.round(mx + (r() - 0.5) * 6), cy = alongX ? Math.round(my + (r() - 0.5) * 6) : Math.round(by0 + 4 + r() * (by1 - by0 - 8));
    chimneyV(m, cx, cy, top, top + rise(cx, cy) + 6, 2.2);
    m.chim = { x: cx, y: cy, z: top + rise(cx, cy) + 6 };   // where its smoke comes out (world.js villageLife)
  }
  // The yard: a fence along the front with a gate at the door, and a bush or a vegetable patch.
  if (r() < 0.6) {
    const fence = r() < 0.5 ? '#d8d4c8' : '#7a5a3a', fy = H - 2;
    for (let x = 1; x < W - 1; x++) {
      if (x >= dx - 1 && x < dx + 6) continue;
      if (x % 4 === 1) m.box(x, fy, 0, x + 1, fy + 1, 5, fence, M_MATTE);
      m.box(x, fy, 2, x + 1, fy + 1, 3, fence, M_MATTE); m.box(x, fy, 4, x + 1, fy + 1, 5, fence, M_MATTE);
    }
  }
  const spots = [[bx0 + 4, H - 5], [bx1 - 4, H - 5]].filter(([x]) => Math.abs(x - dx - 2) > 8);
  for (const [x, y] of spots) {
    if (r() < 0.4) m.ellipsoid(x, y, 2, 3.5, 2.5, 3.5, pick(C.leaf), M_ROUGH);
    else if (r() < 0.5) { m.box(x - 4, y - 2, 0, x + 4, y + 2, 1, '#4e3a28', M_ROUGH); m.paintTop(x - 4, y - 2, x + 4, y + 2, (px, py) => (px % 2 === 0 && hash3(px, py, 3) > 0.3 ? '#4f7a33' : undefined)); }
  }
  m.ridge = ridge;
  FORT_INFO.set(type, { W, H, door: dx, wins, box: [bx0, by0, bx1, by1], flag: { x: Math.round(mx), y: Math.round(my), z: top + ridge } });
  return m;
}
// Snow lying on a model: the top of every column of voxels from height z0 up (roofs, chimneys, fence rails, bushes)
// turns white, a shade bluer under the ridge's lee. For the winter maps' houses (type ending ':s').
function snowCover(m, z0) {
  const A = m.w * m.h, white = [rgbInt('#eef2f7'), rgbInt('#f7f9fc'), rgbInt('#dde4ee')];
  for (let i = 0; i < A; i++) {
    for (let z = m.d - 1; z >= z0; z--) {
      const k = z * A + i;
      if (m.col[k] < 0) continue;
      if (m.mat[k] !== M_GLASS) m.col[k] = white[hash3(i % m.w, (i / m.w) | 0, z) > 0.8 ? 2 : hash3(i, z, 7) > 0.5 ? 1 : 0];
      break;
    }
  }
  return m;
}
// The village church: a stone nave under a steep slate roof, tall windows, and a square bell tower with a spire at
// the end facing the square (`far`: the south or east end).
function churchModel(W, H, far, r) {
  const m = new VModel(-2, -2, W + 2, H + 2, 112);
  const long = H > W, stone = '#a19b8e', dark = '#7d776b', roof = '#4b5059';
  const T = 30;   // the tower's side
  // The tower's place: middle of the end facing the square.
  const tx0 = long ? (W - T) / 2 : far ? W - T - 2 : 2, ty0 = long ? (far ? H - T - 2 : 2) : (H - T) / 2;
  const nx0 = long ? 8 : far ? 4 : T, nx1 = long ? W - 8 : far ? W - T : W - 4, ny0 = long ? (far ? 4 : T) : 8, ny1 = long ? (far ? H - T : H - 4) : H - 8;
  const top = 22;
  m.box(nx0, ny0, 0, nx1, ny1, top, stone, M_ROUGH);
  m.paint(nx0, ny0, 0, nx1, ny1, top, (x, y, z) => (z < 2 ? '#6f6a61' : z % 4 === 0 || (x + y + (z >> 2) * 3) % 9 === 0 ? dark : undefined));
  const mx = (nx0 + nx1) / 2, my = (ny0 + ny1) / 2, half = (long ? nx1 - nx0 : ny1 - ny0) / 2 + 1;
  for (let y = ny0 - 1; y < ny1 + 1; y++) for (let x = nx0 - 1; x < nx1 + 1; x++) {
    const k = Math.max(0, Math.round((half - Math.abs((long ? x : y) + 0.5 - (long ? mx : my))) * 1.05));
    if (x >= nx0 && x < nx1 && y >= ny0 && y < ny1 && k > 1) m.box(x, y, top, x + 1, y + 1, top + k - 1, stone, M_ROUGH);
    m.box(x, y, top + Math.max(0, k - 1), x + 1, y + 1, top + k + 1, Math.floor(k / 3) % 2 ? '#3e424a' : roof, M_ROUGH);
  }
  // Tall arched windows along the nave's south or east side.
  for (let a = (long ? ny0 : nx0) + 6; a + 4 < (long ? ny1 : nx1) - 4; a += 12) {
    for (let z = 5; z < 17; z++) {
      const wdt = z > 14 ? 1 : 2;
      if (long) m.box(nx1 - 1, a + 2 - wdt, z, nx1, a + 2 + wdt, z + 1, z > 15 ? '#c9a443' : '#3a4960', M_GLASS);
      else m.box(a + 2 - wdt, ny1 - 1, z, a + 2 + wdt, ny1, z + 1, '#3a4960', M_GLASS);
    }
  }
  // The tower, its belfry openings, a pyramid spire and a cross.
  const TH = 56;
  m.box(tx0, ty0, 0, tx0 + T, ty0 + T, TH, stone, M_ROUGH);
  m.paint(tx0, ty0, 0, tx0 + T, ty0 + T, TH, (x, y, z) => (z < 2 ? '#6f6a61' : z % 5 === 0 || z === TH - 1 ? dark : undefined));
  for (const [ax, ay, bx, by] of [[tx0 + 10, ty0 + T - 1, tx0 + 20, ty0 + T], [tx0 + T - 1, ty0 + 10, tx0 + T, ty0 + 20]]) {
    m.box(ax, ay, 40, bx, by, 50, '#1e1c1a', M_MATTE);
    m.box(ax, ay, 18, bx, by, 26, '#3a4960', M_GLASS);
  }
  m.box(tx0 + 11, ty0 + T - 1, 0, tx0 + 19, ty0 + T, 12, '#4b3424', M_MATTE);   // the door
  m.fort = { W, H, door: tx0 + 13, wins: [{ face: 's', x: tx0 + 10, y: ty0 + T, z: 40, w: 10 }, { face: 'e', x: tx0 + T, y: ty0 + 10, z: 40, w: 10 }], flag: { x: tx0 + T - 4, y: ty0 + T - 4, z: TH } };   // sandbags in the belfry
  for (let z = 0; z < 40; z++) {
    const s = (T / 2 + 1) * (1 - z / 40);
    m.box(tx0 + T / 2 - s, ty0 + T / 2 - s, TH + z, tx0 + T / 2 + s, ty0 + T / 2 + s, TH + z + 1, z % 4 === 0 ? '#3e424a' : roof, M_ROUGH);
  }
  m.box(tx0 + T / 2 - 0.5, ty0 + T / 2 - 0.5, TH + 40, tx0 + T / 2 + 1, ty0 + T / 2 + 1, TH + 50, '#c9a443', M_METAL);
  m.box(tx0 + T / 2 - 3, ty0 + T / 2 - 0.5, TH + 45, tx0 + T / 2 + 4, ty0 + T / 2 + 1, TH + 46, '#c9a443', M_METAL);
  return m;
}

// The fountain in the village square: a round stone basin of water, a pedestal with a wide bowl and a small one above
// it, and the spout on top (`m.spout`: its height; art.js drawHouse plays the water).
function fountainModel(W, H) {
  const m = new VModel(-2, -2, W + 2, H + 2, 36), cx = W / 2, cy = H / 2, R = W / 2 - 6;
  const stone = '#aaa496', dark = '#8a8478';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d < R + 4 && d >= R + 1) m.box(x, y, 0, x + 1, y + 1, 1, hash3(x, y, 2) > 0.5 ? '#948e82' : '#9d978a', M_ROUGH);   // the paving round it
    else if (d < R + 1 && d >= R - 3) m.box(x, y, 0, x + 1, y + 1, 7, (Math.floor(Math.atan2(y - cy, x - cx) * 8) & 1) ? stone : dark, M_ROUGH);   // the rim
    else if (d < R - 3) { m.box(x, y, 0, x + 1, y + 1, 3, '#33485a', M_ROUGH); m.box(x, y, 3, x + 1, y + 1, 4, hash3(x, y, 9) > 0.93 ? '#9cc4dc' : '#4e7fa6', M_GLASS); }   // water
  }
  m.cylZ(cx, cy, 0, 15, 5, stone, M_ROUGH);
  m.ellipsoid(cx, cy, 15, 15, 15, 3.5, stone, M_ROUGH);
  m.cylZ(cx, cy, 16, 18, 12.5, '#4e7fa6', M_GLASS);
  m.cylZ(cx, cy, 16, 25, 2.5, stone, M_ROUGH);
  m.ellipsoid(cx, cy, 25, 7, 7, 2, stone, M_ROUGH);
  m.cylZ(cx, cy, 25.5, 27, 5, '#4e7fa6', M_GLASS);
  m.cylZ(cx, cy, 26, 31, 1.3, '#8a7a4a', M_METAL);
  m.spout = 31; m.bowl = 15; m.R = R - 3;
  return m;
}

// Village bits and pieces (world.js villageProps): standing (`up`) and knocked over. Centred on their spot.
const AWNINGS = [['#b8302a', '#e8e2d0'], ['#2f5f9a', '#e8e2d0'], ['#3f7a3a', '#e8e2d0'], ['#c9a227', '#6b3a20']];
const GOODS = ['#c43c2a', '#e0a030', '#5a8a2a', '#8a4a8a', '#d8c070'];
function propSprite(p) {
  const v = p.v | 0, k = 'P' + p.k + v + (p.up ? 'u' : 'd');
  return sprite(k, () => propModel(p.k, v, p.up), 0, 0);
}
function propModel(kind, v, up) {
  const m = new VModel(-16, -16, 16, 16, 26), wood = '#7a5a3a', woodD = '#5a4028', iron = '#2b2d2f';
  const alongY = v % 2 === 1;
  const B = (x0, y0, z0, x1, y1, z1, c, mt) => (alongY ? m.box(y0, x0, z0, y1, x1, z1, c, mt) : m.box(x0, y0, z0, x1, y1, z1, c, mt));
  if (kind === 'lamp') {
    if (up) {
      m.box(-1, -1, 0, 2, 2, 2, iron, M_METAL); m.box(0, 0, 2, 1, 1, 21, iron, M_METAL); m.box(0, 0, 20, 5, 1, 21, iron, M_METAL);
      m.box(3, -1, 15, 6, 2, 19, '#ffe39a', M_GLOW); m.box(2, -2, 19, 7, 3, 20, iron, M_METAL);
      m.lamp = { x: 4.5, y: 0.5, z: 17 };
    } else {
      m.box(-1, -1, 0, 2, 2, 2, iron, M_METAL); m.box(1, 0, 0, 20, 1, 1, iron, M_METAL); m.box(19, -1, 0, 22, 2, 2, '#6d6a5a', M_METAL);
      m.set(23, 2, 0, '#cfc9a0', M_GLASS); m.set(21, -3, 0, '#cfc9a0', M_GLASS);
    }
  } else if (kind === 'stall') {
    const [c0, c1] = AWNINGS[v % AWNINGS.length];
    if (up) {
      m.box(-11, -4, 4, 11, 5, 6, wood, M_ROUGH);
      for (const [x, y] of [[-11, -4], [10, -4], [-11, 4], [10, 4]]) m.box(x, y, 0, x + 1, y + 1, 4, woodD, M_ROUGH);
      for (let x = -10; x < 10; x += 2) for (let y = -3; y < 4; y += 2) m.ellipsoid(x + 0.5, y + 0.5, 7, 1.1, 1.1, 1, GOODS[(Math.abs(x * 7 + y * 3) >> 1) % GOODS.length], M_MATTE);
      for (const [x, y] of [[-13, -7], [12, -7]]) m.box(x, y, 0, x + 1, y + 1, 16, woodD, M_ROUGH);
      for (let y = -8; y < 8; y++) { const z = 16 - Math.round((y + 8) * 0.35); m.box(-14, y, z, 14, y + 1, z + 1, ((y + 8) >> 1) % 2 ? c1 : c0, M_MATTE); }
    } else {
      for (let y = -6; y < 7; y++) m.box(-13 + (y & 1), y, 0, 12 + (y & 1), y + 1, 1, ((y + 8) >> 1) % 2 ? c1 : c0, M_MATTE);
      m.box(-9, 6, 0, 3, 8, 2, wood, M_ROUGH); m.box(4, -9, 0, 12, -7, 2, woodD, M_ROUGH);
      for (let i = 0; i < 14; i++) m.set(((i * 37) % 26) - 13, ((i * 19) % 18) - 9, 1, GOODS[i % GOODS.length], M_MATTE);
    }
  } else if (kind === 'bench') {
    if (up) { B(-8, -1, 3, 8, 2, 4, wood, M_ROUGH); B(-8, -2, 4, 8, -1, 8, wood, M_ROUGH); for (const x of [-7, 6]) B(x, -1, 0, x + 1, 2, 3, iron, M_METAL); }
    else { B(-8, -1, 0, 1, 2, 1, wood, M_ROUGH); B(2, -3, 0, 9, 0, 1, wood, M_ROUGH); B(-7, 2, 0, -6, 4, 1, iron, M_METAL); }
  } else if (kind === 'barrels') {
    for (const [x, y] of [[-3, -2], [3, -1], [0, 4]]) {
      if (up) { m.cylZ(x, y, 0, 8, 3.2, '#6b4a2a', M_ROUGH); m.cylZ(x, y, 2, 3, 3.4, '#3b3a36', M_METAL); m.cylZ(x, y, 6, 7, 3.4, '#3b3a36', M_METAL); }
      else m.cylX(x - 4 + y, x + 4 + y, y * 1.6, 3, 3, '#6b4a2a', M_ROUGH);
    }
  } else if (kind === 'crates') {
    if (up) { m.box(-7, -4, 0, 0, 3, 6, '#a07c4a', M_ROUGH); m.box(1, -3, 0, 7, 3, 6, '#94703f', M_ROUGH); m.box(-4, -3, 6, 2, 3, 11, '#a07c4a', M_ROUGH);
      m.paint(-7, -4, 0, 7, 3, 11, (x, y, z) => (z % 5 === 0 || x === -7 || x === 6 ? '#6e5230' : undefined)); }
    else for (let i = 0; i < 7; i++) m.box(-8 + i * 2, -6 + ((i * 5) % 11), 0, -8 + i * 2 + 6 - (i % 3), -5 + ((i * 5) % 11), 1, i % 2 ? '#a07c4a' : '#6e5230', M_ROUGH);
  } else if (kind === 'hay') {
    if (up) { m.box(-8, -4, 0, 4, 2, 5, '#c9a95a', M_ROUGH); m.box(-2, 1, 0, 9, 6, 5, '#bf9f50', M_ROUGH); m.box(-5, -2, 5, 6, 4, 9, '#d0b264', M_ROUGH);
      m.paint(-8, -4, 0, 9, 6, 9, (x, y, z) => (hash3(x, y, z) > 0.8 ? '#a8893f' : undefined)); }
    else m.ellipsoid(0, 0, 0, 11, 8, 2, '#c9a95a', M_ROUGH);
  } else if (kind === 'cart') {
    if (up) {
      B(-10, -5, 4, 10, 5, 5, wood, M_ROUGH); B(-10, -5, 5, 10, -4, 8, woodD, M_ROUGH); B(-10, 4, 5, 10, 5, 8, woodD, M_ROUGH); B(-10, -5, 5, -9, 5, 8, woodD, M_ROUGH);
      B(10, -3, 4, 18, -2, 5, woodD, M_ROUGH); B(10, 2, 4, 18, 3, 5, woodD, M_ROUGH);
      for (const y of [-6, 5]) for (let x = -6; x <= 2; x++) for (let z = 0; z <= 8; z++) if (Math.abs(Math.hypot(x + 2, z - 4) - 3.6) < 0.8) B(x, y, z, x + 1, y + 1, z + 1, '#3b2c1e', M_ROUGH);
      if (v & 2) for (let x = -9; x < 9; x++) for (let y = -4; y < 4; y++) { const hh = Math.round(4 - Math.hypot(x / 2.3, y / 1.2) * 0.9); if (hh > 0) B(x, y, 5, x + 1, y + 1, 5 + hh, '#c9a95a', M_ROUGH); }
    } else {
      B(-10, -5, 0, 10, -4, 9, wood, M_ROUGH); B(-10, -4, 0, 10, 3, 1, woodD, M_ROUGH);
      for (let x = 2; x <= 10; x++) for (let y = 3; y <= 11; y++) if (Math.abs(Math.hypot(x - 6, y - 7) - 3.6) < 0.8) B(x, y, 0, x + 1, y + 1, 1, '#3b2c1e', M_ROUGH);
      for (let i = 0; i < 10; i++) B(-12 + i * 2, -9 + (i * 7) % 6, 0, -11 + i * 2, -8 + (i * 7) % 6, 1, '#c9a95a', M_ROUGH);
    }
  }
  return m;
}


// A garrisoned house (world.js enterHouse) is fortified: a wall of sandbags round its plot with a gap at the door,
// sandbags piled in its windows up to a firing slit, and a ring of barbed-wire coils on posts outside. It is the
// house's own model (damaged or not) with these added, drawn whole so everything hides behind everything else
// properly; made in the background the first time (fortSprite gives null until then).
const FORT_INFO = new Map(), FORT_PAD = 10, fortQueue = [];
function fortSprite(type, stage) {
  const k = 'S' + type + 'alliesf' + stage;
  const s = spriteCache2.get(k + '|0');
  if (s) return s;
  if (!fortQueue.some((q) => q.k === k)) { fortQueue.push({ k, type, stage }); if (fortQueue.length === 1) setTimeout(pumpFort, 0); }
  return null;
}
function pumpFort() {
  const q = fortQueue[0];
  if (!q) return;
  const keep = spriteSpend; spriteSpend = -1e9;   // (made between frames)
  const pal = palFor('allies'), baseKey = 'S' + q.type + pal.key, base = model(baseKey, () => STRUCTURES[q.type](pal, 'allies'));
  const src = q.stage ? model(baseKey + 'd' + q.stage, () => damageModel(base, q.stage, q.type, 'allies')) : base;
  sprite(q.k, () => fortifyModel(src, FORT_INFO.get(q.type) || { W: base.w - 4, H: base.h - 4, door: 0, wins: [] }), 0, 0);
  spriteSpend = keep;
  fortQueue.shift();
  if (fortQueue.length) setTimeout(pumpFort, 20);
}
function fortifyModel(src, info) {
  const P = FORT_PAD, { W, H } = info, m = new VModel(src.x0 - P, src.y0 - P, src.x0 + src.w + P, src.y0 + src.h + P, src.d);
  for (let z = 0; z < src.d; z++) for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const i = (z * src.h + y) * src.w + x;
    if (src.col[i] < 0) continue;
    const j = m.idx(x + src.x0, y + src.y0, z);
    m.col[j] = src.col[i]; m.mat[j] = src.mat[i];
  }
  const SAND = rgbInt('#b59a62'), SAND_L = rgbInt('#d6be86'), SAND_D = rgbInt('#6f5c38'), WIRE = rgbInt('#2e2f2d'), WIRE_L = rgbInt('#b4b6b0'), POST = rgbInt('#4a3826');
  const put = (x, y, z, c, mt) => { const j = m.idx(x, y, z); if (j >= 0) { m.col[j] = c; m.mat[j] = mt; } };
  // One bag: 5 voxels long, 2 high, courses staggered, light on top, dark seams; `along` runs round the wall.
  const bag = (along, z) => { const k = (((along + (((z >> 1) & 1) ? 2 : 0)) % 5) + 5) % 5; return k === 0 ? SAND_D : (z & 1) ? SAND_L : SAND; };
  const door0 = info.door - 3, door1 = info.door + 8;
  for (let y = -P; y < H + P; y++) for (let x = -P; x < W + P; x++) {
    const ox = x < 0 ? -x : x >= W ? x - W + 1 : 0, oy = y < 0 ? -y : y >= H ? y - H + 1 : 0, d = Math.hypot(ox, oy);
    if (!d) continue;
    const gate = y >= H && x >= door0 && x <= door1;
    const along = oy ? x : y;
    if (d >= 1 && d < 6 && !gate) {   // the sandbag wall: a high inner tier and a lower outer one
      const hh = d < 3.6 ? 8 : 5;
      for (let z = 0; z < hh; z++) put(x, y, z, z === hh - 1 && (d < 1.6 || (d > 2.9 && d < 3.6) || d > 5.3) ? SAND_D : bag(along, z), M_ROUGH);
    } else if (d >= 7 && d < 10 && !(y >= H && x >= door0 - 3 && x <= door1 + 3)) {   // two coils of wire on posts
      for (let z = 1; z <= 6; z++) {
        const c1 = Math.abs(Math.sin(along * 0.8) * 2.6 + 3.5 - z) < 0.7, c2 = Math.abs(Math.cos(along * 0.8 + 1) * 2.6 + 3.5 - z) < 0.7;
        if ((c1 && d < 8.5) || (c2 && d >= 8.5)) put(x, y, z, (along + z) % 3 ? WIRE_L : WIRE, M_METAL);
      }
      if (Math.abs(d - 8.5) < 0.5 && ((along % 9) + 9) % 9 === 0) for (let z = 0; z < 8; z++) put(x, y, z, POST, M_ROUGH);
    }
  }
  // Ammunition boxes stacked beside the gate.
  for (const [ax, ay, az] of [[door0 - 7, H - 7, 0], [door0 - 7, H - 3, 0], [door0 - 6, H - 5, 4]]) {
    m.box(ax, ay, az, ax + 6, ay + 4, az + 4, '#4f5a2e', M_ROUGH); m.box(ax + 2, ay + 3, az + 1, ax + 4, ay + 4, az + 2, '#d0a426', M_MATTE);
  }
  // Windows: bags piled up to a slit.
  for (const w of info.wins) {
    const n = w.w || 4;
    for (let z = w.z - 1; z < w.z + 3; z++) for (let a = -1; a < n + 1; a++) for (let o = 0; o < 2; o++) {
      if (w.face === 's') put(w.x + a, w.y + o, z, bag(a + 1, z), M_ROUGH); else put(w.x + o, w.y + a, z, bag(a + 1, z), M_ROUGH);
    }
  }
  return m;
}
