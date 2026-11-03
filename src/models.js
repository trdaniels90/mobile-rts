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
function palFor(faction) { const p = FACTIONS[faction].pal; p.key = p.key || faction; return p; }

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
function heavyHull(pal, s) {
  const P = pal.key === 'soviets' ? HEAVY_RED : pal;
  const L = s.len, W = s.wid, hl = Math.floor(L / 2), hw = Math.floor(W / 2);
  const m = new VModel(-hl - 2, -hw - 2, hl + 3, hw + 3, 8);
  m.box(-hl + 1, -hw, 0, hl - 1, hw, 2, '#1f0f0c', M_ROUGH);                       // dark underside and track edge
  m.box(-hl, -hw, 2, hl, hw, 4, P.main, M_METAL);                                   // low hull slab
  m.box(-hl + 1, -hw + 1, 4, hl - 2, hw - 1, 5, P.main, M_METAL);                   // top deck, inset
  m.box(hl - 3, -hw, 2, hl, hw, 3, P.light, M_METAL);                               // pale sloped nose
  m.box(hl - 3, -hw + 1, 3, hl - 1, hw - 1, 4, P.light, M_METAL);
  m.box(hl - 2, -hw + 1, 4, hl - 1, hw - 1, 5, P.light, M_METAL);
  m.box(-hl, -hw, 3, hl, -hw + 1, 4, P.light, M_METAL); m.box(-hl, hw - 1, 3, hl, hw, 4, P.light, M_METAL);       // lit upper edges
  m.box(-hl, -hw, 2, hl, -hw + 1, 3, P.dark, M_METAL); m.box(-hl, hw - 1, 2, hl, hw, 3, P.dark, M_METAL);        // shadowed lower edges
  for (let x = -hl + 2; x < -hl + 8; x += 2) m.box(x, -hw + 3, 4, x + 1, hw - 3, 5, P.dark, M_METAL);            // rear deck louvres
  m.clear(-hl, -hw, 0, -hl + 1, -hw + 1, 4); m.clear(-hl, hw - 1, 0, -hl + 1, hw, 4);                            // rounded rear corners
  m.paint(-hl, -hw, 2, hl, hw, 5, (x, y, z, c) => (hash3(x, y, z) > 0.94 && c === rgbInt(P.main)) ? P.dark : undefined);
  return m;
}
function heavyTurret(pal, s) {
  const P = pal.key === 'soviets' ? HEAVY_RED : pal;
  const r = s.tur, bl = s.barrel, w = 7, f = -2;                                  // f: the turret sits this far forward of the hull's middle
  const m = new VModel(-r - 3, -w - 2, r + bl + 3 + f, w + 2, 9);
  m.box(-r + f, -w, 0, r + f, w, 3, P.main, M_METAL);                                       // wide low turret box, centred on the hull
  m.box(-r + 1 + f, -w + 1, 3, r - 1 + f, w - 1, 4, P.main, M_METAL);                       // roof
  m.clear(r - 1 + f, -w, 0, r + f, -w + 1, 3); m.clear(r - 1 + f, w - 1, 0, r + f, w, 3);           // chamfered front corners
  m.clear(-r + f, -w, 0, -r + 1 + f, -w + 1, 3); m.clear(-r + f, w - 1, 0, -r + 1 + f, w, 3);       // and rear corners
  m.box(r - 2 + f, -w + 1, 0, r + 1 + f, w - 1, 3, P.light, M_METAL);                       // pale mantlet
  m.box(-r + f, -w, 2, r + f, -w + 1, 3, P.light, M_METAL); m.box(-r + f, w - 1, 2, r + f, w, 3, P.light, M_METAL);
  m.box(-r + f, -w, 0, r + f, -w + 1, 1, P.dark, M_METAL); m.box(-r + f, w - 1, 0, r + f, w, 1, P.dark, M_METAL);
  for (const y of [-2.8, 2.8]) m.cylZ(-1 + f, y, 3, 4, 1.9, P.deep, M_MATTE);           // two dark hatches
  m.box(-4 + f, -1, 3, -2 + f, 1, 4, P.light, M_METAL);                                     // small panel
  for (const y of [-3.6, 3.6]) {                                                        // thick black guns, as wide as the reference
    m.cylX(0, r + bl, y, 2, 1.5, '#16120f', M_METAL);
    m.cylX(r + bl - 3, r + bl, y, 2, 1.8, '#16120f', M_METAL);
  }
  m.line(-r + 1 + f, w - 2, 4, -r + 1 + f, w - 2, 8, '#e8e6dc'); m.set(-r + 1 + f, w - 2, 8, '#ffffff');   // white aerial, rear right
  return m;
}
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
  const P = pal.key === 'allies' ? GRIZ : pal;
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
  const P = pal.key === 'allies' ? GRIZ : pal;
  const r = 5, w = 6, f = 1, reach = s.tur + s.barrel;
  const m = new VModel(-r - 4, -w - 3, reach + 3, w + 3, 11);
  m.box(-r + f, -w, 0, r + f, w, 4, P.turret, M_METAL);                               // low blue-lilac turret
  m.box(-r + 1 + f, -w + 1, 4, r - 1 + f, w - 1, 5, P.turretHi, M_METAL);             // roof
  for (const [x0, x1] of [[r - 1 + f, r + f], [-r + f, -r + 1 + f]]) { m.clear(x0, -w, 0, x1, -w + 1, 4); m.clear(x0, w - 1, 0, x1, w, 4); }
  m.box(r - 1 + f, -3, 0, r + 1 + f, 3, 4, P.dark, M_METAL);                          // gun mantlet
  for (const y of [-3.2, 3.2]) m.cylZ(-1 + f, y, 4, 5, 2.1, '#14172a', M_MATTE);           // two round dark hatches
  m.cylX(r + f, reach, 0, 2, 1.0, '#16182a', M_METAL);                              // thin black gun
  m.cylX(reach - 2, reach, 0, 2, 1.3, '#16182a', M_METAL);
  m.line(-r + 1 + f, w - 1, 4, -r + 1 + f, w - 1, 9, '#1c2033');                      // aerial, rear right
  return m;
}
function tankHull(pal, s) {
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
function jeepModel(pal) {
  const m = new VModel(-9, -7, 9, 7, 9);
  for (const x of [-4.5, 4.5]) for (const [y0, y1] of [[-5, -3], [3, 5]]) m.cylY(y0, y1, x, 2, 2, C.track, M_ROUGH);
  m.box(-7, -4, 2, 7, 4, 4, pal.dark, M_METAL);
  m.box(-7, -4, 4, 7, 4, 5, pal.main, M_METAL);
  m.box(2, -4, 5, 7, 4, 6, pal.main, M_METAL);
  m.box(1, -4, 5, 2, 4, 8, C.glass, M_GLASS);
  m.clear(-6, -3, 5, 1, 3, 6);
  m.box(-6, -3, 4, 1, 3, 5, '#3a3a33');
  m.box(-3, -3, 5, -1, 3, 6, C.oliveD); // seats
  m.box(6, -3, 4, 7, -2, 5, C.glow, M_GLASS); m.box(6, 2, 4, 7, 3, 5, C.glow, M_GLASS);
  return m;
}
function mgModel() {
  const m = new VModel(-3, -3, 9, 3, 4);
  m.box(-1, -1, 0, 1, 1, 2, C.gun, M_METAL);
  m.cylX(0, 8, 0, 2.5, 0.8, C.gun, M_METAL);
  m.box(-2, -2, 1, 1, 2, 3, C.gun, M_METAL);
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
function harvModel(pal, loaded) {
  const hl = 12, hw = 7;
  const m = new VModel(-hl - 2, -hw - 2, hl + 3, hw + 3, 13);
  for (const side of [-1, 1]) {
    const y0 = side < 0 ? -hw : hw - 3;
    m.box(-hl, y0, 0, hl, y0 + 3, 3, C.track, M_ROUGH);
    for (let x = -hl; x < hl; x += 2) m.box(x, y0, 2, x + 1, y0 + 3, 3, C.trackHi);
  }
  m.box(-hl + 1, -hw + 1, 2, hl - 1, hw - 1, 4, C.metal, M_METAL);
  // Cab
  m.box(4, -hw, 4, hl, hw, 11, pal.main, M_METAL);
  m.box(hl - 1, -hw + 1, 7, hl, hw - 1, 10, C.glass, M_GLASS);
  m.box(4, -hw, 10, hl, hw, 11, pal.dark, M_METAL);
  m.box(hl - 1, -hw + 1, 5, hl, -hw + 2, 6, C.glow, M_GLASS); m.box(hl - 1, hw - 2, 5, hl, hw - 1, 6, C.glow, M_GLASS);
  hazardV(m, hl - 1, -hw, 4, hl, hw, 5);
  // Ore bin
  m.box(-hl, -hw, 4, 3, hw, 10, '#6f716b', M_METAL);
  m.clear(-hl + 1, -hw + 1, 6, 2, hw - 1, 10);
  m.paint(-hl, -hw, 4, 3, hw, 10, (x, y, z) => z === 9 ? '#858780' : (x % 4 === 0 ? '#5d5f59' : undefined));
  if (loaded) {
    for (let y = -hw + 1; y < hw - 1; y++) for (let x = -hl + 1; x < 2; x++) {
      const h = 9 + Math.round(2.2 - Math.hypot((x + 5) / 6, y / 4) * 1.6 + hash3(x, y, 1) * 1.2);
      m.box(x, y, 6, x + 1, y + 1, Math.max(7, h), C.ore[Math.floor(hash3(x, y, 2) * 4)], M_METAL);
    }
  }
  return m;
}

// ---------------------------------------------------------------------------
// Aircraft (bodies only; rotors are animated separately)
// ---------------------------------------------------------------------------
function heliModel(pal) {
  const m = new VModel(-18, -9, 13, 9, 11);
  m.ellipsoid(2, 0, 4.5, 9, 2.8, 3.2, pal.main, M_METAL);
  m.cylX(-16, -4, 0, 5, 1.3, pal.main, M_METAL);
  m.box(-17, 0, 4, -15, 1, 10, pal.dark, M_METAL);
  m.box(-15, -4, 5, -13, 4, 6, pal.dark, M_METAL);
  m.ellipsoid(6.5, 0, 6, 3, 1.7, 1.8, C.glass, M_GLASS);
  m.ellipsoid(2.5, 0, 7, 2.5, 1.6, 1.6, C.glass, M_GLASS);
  m.box(-1, -7, 4, 2, 7, 5, pal.dark, M_METAL);
  for (const y of [-6.5, 6.5]) { m.cylX(-2, 4, y, 3.5, 1.3, C.gun, M_METAL); m.box(3, y - 0.5, 3, 4, y + 0.5, 4, C.red); }
  m.cylX(9, 13, 0, 2.5, 0.7, C.gun, M_METAL);
  for (const y of [-4, 3]) m.box(-5, y, 0, 7, y + 1, 1, C.gun, M_METAL);
  m.cylZ(0, 0, 7, 9, 1.3, C.gun, M_METAL);
  return m;
}
function hindModel(pal) {
  const m = new VModel(-20, -10, 15, 10, 12);
  m.ellipsoid(2, 0, 5, 11, 3.6, 3.8, pal.main, M_METAL);
  m.cylX(-18, -6, 0, 5.5, 1.5, pal.main, M_METAL);
  m.box(-19, 0, 4, -17, 1, 11, pal.dark, M_METAL);
  m.box(-17, -4, 6, -15, 4, 7, pal.dark, M_METAL);
  m.ellipsoid(10, 0, 5.5, 2.5, 2, 2, C.glass, M_GLASS);
  m.ellipsoid(7, 0, 7.2, 2.4, 2, 1.8, C.glass, M_GLASS);
  m.box(-3, -9, 5, 2, 9, 6, pal.dark, M_METAL);
  for (const y of [-8.5, -6, 6, 8.5]) m.cylX(-3, 2, y, 4.5, 1.1, C.gun, M_METAL);
  m.cylX(12, 15, 0, 3, 0.8, C.gun, M_METAL);
  m.paint(-12, -4, 2, 12, 4, 9, (x, y, z) => (x % 7 === 0 && z > 4) ? pal.dark : undefined);
  for (const [x, y] of [[8, 0], [-3, -3], [-3, 3]]) m.box(x, y, 0, x + 1, y + 1, 2, C.gun);
  m.cylZ(0, 0, 8, 10, 1.5, C.gun, M_METAL);
  return m;
}
function jetModel(pal, mig) {
  const m = new VModel(-17, -13, 17, 13, 11);
  if (mig) {
    m.cylX(-13, 11, 0, 3, 2, pal.main, M_METAL);
    m.cylX(10, 14, 0, 3, 1.6, C.gun, M_METAL);
    m.cylX(11, 13, 0, 3, 0.8, C.black);
    for (let x = -10; x < 6; x++) { const span = Math.round((6 - x) * 0.72); m.box(x, -span - 1, 2, x + 1, span + 1, 3, pal.main, M_METAL); }
    m.box(-13, 0, 3, -9, 1, 9, pal.dark, M_METAL);
    for (let x = -14; x < -10; x++) { const sp = Math.round((-10 - x) * 1.2) + 1; m.box(x, -sp - 1, 3, x + 1, sp + 1, 4, pal.dark); }
    m.ellipsoid(6, 0, 4.5, 3, 1.2, 1.3, C.glass, M_GLASS);
    m.paintTop(-6, -8, 0, 8, (x, y) => Math.abs(y) === 6 && x < -2 ? C.red : undefined);
    m.box(-16, -1, 2, -14, 1, 4, C.black);
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
  const m = new VModel(-9, -7, 12, 7, 22);
  const sov = faction === 'soviets';
  const step = frame === 1 ? 1.5 : frame === 2 ? -1.5 : 0, throwing = frame === 3;
  const pose = frame === 6 ? 'rest' : frame === 7 ? 'aim' : frame === 10 ? 'stretch' : null;
  const K = infKit(pal, faction), tunic = pal.main, sleeve = shadeInt(pal.main, 0.84), hi = shadeInt(pal.main, 1.12);
  // Boots and trousers, legs apart with a gap between them, swinging when walking.
  for (const [y0, s] of [[-3, step], [1, -step]]) {
    m.box(s - 1, y0, 0, s + 2, y0 + 2, 2, C.black);
    m.box(s + 1, y0, 0, s + 3, y0 + 2, 1, C.black);                               // toe caps
    m.box(s - 1, y0, 2, s + 2, y0 + 2, 8, K.pants);
    m.box(s + 1, y0, 5, s + 2, y0 + 2, 6, shadeInt(K.pants, 0.82));                // knee crease
  }
  m.box(-1, -1, 6, 2, 1, 8, K.pants);                                               // seat
  // Belt with pouches and buckle.
  m.box(-2, -3, 8, 2, 3, 9, K.web);
  for (const y of [-3, 2]) m.box(1, y, 8, 3, y + 1, 10, K.pouch);
  m.set(2, 0, 8, '#c9a227', M_METAL);
  // Tunic: broad chest and shoulders, a lit front panel, the collar.
  m.box(-2, -3, 9, 2, 3, 14, tunic);
  m.box(1, -2, 9, 2, 2, 13, hi);
  m.box(-2, -4, 12, 2, 4, 14, tunic);                                               // shoulders
  m.paint(-2, -3, 9, 2, 3, 14, (x, y, z) => (x === 1 && y === z - 12) ? K.web : undefined);   // strap across the chest
  m.box(-1, -1, 14, 2, 2, 14.5, shadeInt(tunic, 0.72));                             // collar
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
  const tube = '#c3c4b8', tubeD = '#5d5f58';
  if (pose === 'stretch') {                                                  // slung on the back
    if (type === 'rocket') { m.cylY(-6, 6, -6, 13, 1.4, tube); m.box(-7, 5, 12, -5, 6, 15, tubeD); }
    else if (RIF) { m.line(-6, -2, 6, -6, 2, 16, C.gun, M_METAL); m.box(-7, -3, 5, -5, -1, 8, '#6a4426'); }
  } else if (pose === 'rest') {
    if (type === 'rocket') { m.box(2, 4, 0, 4, 6, 13, tube); m.box(2, 4, 12, 4, 6, 14, tubeD); }   // launcher stood on the ground
    else if (RIF) { m.box(1, 4, 10, 2, 5, 21, C.gun, M_METAL); m.box(1, 4, 8, 2, 5, 12, '#6a4426'); }   // rifle on the shoulder
  } else if (pose === 'aim' && RIF) {
    m.box(2, -1, 13, 11, 0, 14, C.gun, M_METAL); m.box(-1, -1, 12, 3, 0, 14, '#6a4426'); m.box(5, -1, 11, 6, 0, 13, C.gun, M_METAL);
  } else if (type === 'rocket') {
    m.cylX(-7, 7, 3.5, 15.5, 1.5, tube);                                      // launcher tube on the right shoulder
    m.box(7, 2, 14, 9, 5, 17, tubeD); m.box(-8, 2, 14, -7, 5, 17, tubeD);    // muzzle and exhaust
    m.box(3, 3, 13, 4, 4, 15, tubeD); m.box(1, 2, 16, 3, 3, 18, '#2a2a24');  // grip and sight
  } else if (RIF) {
    m.line(0, 2.5, 9.5, 9, -1.5, 11.5, C.gun, M_METAL);                     // barrel, rising forward across the body
    m.line(0, 2.5, 10.5, 9, -1.5, 12.5, C.gun, M_METAL);
    m.box(-1, 2, 9, 2, 4, 11, '#6a4426');                                    // stock at the hip
    m.box(4, 0, 9, 5, 1, 10.5, C.gun, M_METAL);                             // magazine
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
  power(pal) {
    const m = new VModel(-2, -2, 50, 50, 44);
    slabV(m, 0, 0, 48, 48);
    m.box(2, 12, 1, 30, 44, 14, C.wall, M_MATTE);
    m.box(2, 12, 14, 30, 44, 15, pal.main, M_METAL);
    m.paint(2, 16, 13, 30, 20, 15, () => pal.main);
    m.paint(2, 43, 1, 30, 44, 14, (x, y, z) => (z >= 5 && z <= 7 && x % 5 < 2) ? C.glass : undefined);
    m.box(8, 22, 15, 14, 30, 18, '#5d5e58', M_METAL); m.box(18, 22, 15, 24, 30, 18, '#5d5e58', M_METAL);
    m.cylZ(38, 14, 1, 42, 6, C.wall, M_MATTE);
    m.cylZ(38, 14, 38, 42, 4.2, null);
    m.paint(31, 7, 30, 46, 22, 33, () => pal.main);
    m.paint(31, 7, 22, 46, 22, 24, () => pal.main);
    m.cylX(29, 33, 22, 9, 1.6, C.steel, M_METAL);
    m.cylX(29, 33, 30, 9, 1.6, C.steel, M_METAL);
    m.box(34, 36, 1, 46, 46, 8, '#5d5e58', M_METAL);
    m.paint(34, 45, 3, 46, 46, 8, (x, y, z) => (x % 3 === 0) ? '#46473f' : undefined);
    m.box(39, 45, 5, 41, 46, 7, C.yellow);
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
  // Advanced Power Plant: a turbine hall and two hyperboloid cooling towers.
  apower(pal) {
    const m = new VModel(-2, -2, 74, 74, 46);
    slabV(m, 0, 0, 72, 72);
    // Turbine hall along the front
    m.box(3, 38, 1, 68, 68, 15, C.wall, M_MATTE);
    m.box(3, 38, 15, 68, 68, 16, pal.main, M_METAL);
    m.paint(3, 38, 15, 68, 68, 16, (x) => x % 6 === 0 ? pal.dark : undefined);
    m.paint(3, 67, 1, 68, 68, 15, (x, y, z) => (z >= 6 && z <= 8 && x % 5 < 2) ? C.glass : undefined);
    for (const x of [8, 20, 32, 44, 56]) m.box(x, 44, 16, x + 7, 54, 20, '#5d5e58', M_METAL);
    // Two cooling towers side by side at the back, piped to the hall
    for (const [cx, cy, h] of [[15, 17, 40], [41, 17, 40]]) {
      for (let z = 1; z < h; z++) {
        const r = 11 * (1 - 0.28 * Math.sin(Math.PI * Math.min(1, z / (h * 0.85))));
        m.cylZ(cx, cy, z, z + 1, r, z > h - 4 ? pal.main : C.wall, M_MATTE);
      }
      m.cylZ(cx, cy, h - 6, h, 6.5, null);
      m.cylY(27, 38, cx, 7, 1.8, C.steel, M_METAL);
    }
    // Transformer yard
    m.box(56, 4, 1, 70, 32, 6, '#5d5e58', M_METAL);
    m.paint(56, 4, 3, 70, 32, 6, (x, y) => (x % 4 === 0 || y % 6 === 0) ? '#46473f' : undefined);
    for (const y of [10, 18, 26]) m.line(63, y, 6, 63, y, 13, C.steel, M_METAL);
    m.box(55, 4, 4, 56, 32, 6, C.yellow);
    return m;
  },
  refinery(pal) {
    const m = new VModel(-2, -2, 74, 50, 40);
    slabV(m, 0, 0, 72, 48);
    m.box(2, 4, 1, 42, 44, 16, C.wall, M_MATTE);
    m.box(2, 4, 16, 42, 44, 17, pal.main, M_METAL);
    m.paint(2, 4, 16, 42, 44, 17, (x) => x % 6 === 0 ? pal.dark : undefined);
    m.box(24, 10, 17, 38, 22, 22, C.gun, M_METAL);
    m.clear(25, 11, 19, 37, 21, 22);
    m.box(25, 11, 19, 37, 21, 20, C.ore[1], M_METAL);
    m.paint(2, 43, 2, 42, 44, 14, (x, y, z) => (z >= 8 && z <= 9 && x % 6 < 3) ? C.glass : undefined);
    for (const [x, y, r, h] of [[52, 12, 7, 32], [65, 22, 6, 26]]) {
      m.cylZ(x, y, 1, h, r, C.wall, M_MATTE);
      m.ellipsoid(x, y, h, r, r, 3, C.wallD, M_METAL);
      m.paint(x - r, y - r, h - 8, x + r, y + r, h - 6, () => pal.main);
    }
    m.box(30, 40, 1, 42, 48, 6, C.gun, M_METAL);
    hazardV(m, 28, 40, 1, 30, 48, 6); hazardV(m, 42, 40, 1, 44, 48, 6);
    m.cylX(42, 46, 20, 10, 1.5, C.steel, M_METAL);
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
  helipad(pal) {
    const m = new VModel(-2, -2, 50, 50, 10);
    m.box(0, 0, 0, 48, 48, 2, '#5d5d57', M_ROUGH);
    m.paintTop(0, 0, 48, 48, (x, y) => {
      const r = Math.hypot(x + 0.5 - 24, y + 0.5 - 24);
      if (r > 16 && r < 18.5) return C.yellow;
      if ((x >= 17 && x < 20 || x >= 28 && x < 31) && y >= 15 && y < 33) return C.white;
      if (x >= 20 && x < 28 && y >= 23 && y < 25) return C.white;
      if (x === 0 || y === 0 || x === 47 || y === 47) return '#77776f';
    });
    for (const [x, y] of [[1, 1], [45, 1], [1, 45], [45, 45]]) m.box(x, y, 2, x + 2, y + 2, 4, pal.light, M_GLOW);
    return m;
  },
  airfield(pal) {
    const m = new VModel(-2, -2, 74, 50, 30);
    m.box(0, 0, 0, 72, 48, 1, C.asphalt, M_ROUGH);
    m.paintTop(0, 0, 72, 48, (x, y) => {
      if (y >= 29 && y < 31 && x > 22 && (x % 8) < 4) return C.white;
      if (x >= 68 && x < 71 && y >= 21 && y < 40 && y % 3 === 0) return C.white;
      if (y === 12 && x > 20) return C.yellow;
    });
    m.box(2, 2, 1, 16, 18, 14, C.wall, M_MATTE);
    m.box(3, 3, 14, 15, 17, 19, C.glass, M_GLASS);
    m.box(2, 2, 19, 16, 18, 20, pal.main, M_METAL);
    m.line(9, 9, 20, 9, 9, 27, C.black); m.set(9, 9, 27, '#ff4a30', M_GLOW);
    m.box(2, 24, 1, 18, 46, 9, C.wallD, M_MATTE);
    for (let y = 24; y < 46; y++) { const h = Math.round(Math.sqrt(Math.max(0, 121 - (y + 0.5 - 35) ** 2)) * 0.45); if (h) m.box(2, y, 9, 18, y + 1, 9 + h, pal.main, M_METAL); }
    return m;
  },
  turret() {
    const m = new VModel(-2, -2, 26, 26, 7);
    m.cylZ(12, 12, 0, 5, 10.5, C.wallD, M_MATTE);
    m.cylZ(12, 12, 5, 6, 9, C.wall, M_MATTE);
    return m;
  },
  aagun() {
    const m = new VModel(-2, -2, 26, 26, 5);
    m.box(0, 0, 0, 24, 24, 1, '#5f5640', M_ROUGH);
    sandbagsV(m, 0, 0, 24, 24, 4);
    return m;
  },
  tesla() {
    const m = new VModel(-2, -2, 26, 50, 58);
    slabV(m, 0, 22, 24, 48);
    m.box(4, 26, 1, 20, 44, 6, C.wall, M_MATTE);
    m.cylZ(12, 35, 6, 46, 2.6, '#3a3a36', M_METAL);
    for (let z = 8; z < 44; z += 4) m.cylZ(12, 35, z, z + 2, 5 - (z > 30 ? 1 : 0), C.copper, M_METAL);
    m.ellipsoid(12, 35, 50, 6, 6, 5.5, C.steel, M_METAL);
    return m;
  },
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
  aagun: [(pal) => {
    const m = new VModel(-6, -6, 12, 6, 12);
    m.cylZ(0, 0, 0, 2, 4, C.gun, M_METAL);
    m.box(-3, -4, 2, 3, 4, 5, pal.main, M_METAL);
    for (const y of [-2.5, 1.5]) m.line(1, y, 4, 10, y, 10, C.gun, M_METAL);
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
    dmgQueue.push({ k, type, faction, stage, camo });
    if (dmgQueue.length === 1) setTimeout(pumpDamaged, 0);
  }
  return stage > 1 ? damagedSprite(type, faction, stage - 1, camo) : structureSprite(type, faction, camo);
}
function pumpDamaged() {
  const q = dmgQueue[0];
  if (!q) return;
  const pal = camoPal(q.faction, q.camo);
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
  if (d.draw === 'cargo') return facingSprite('C' + key, () => cargoModel(pal, d.type === 'bomber'), u.face);
  const mig = d.type === 'mig' || (d.type === 'spyplane' && u.faction === 'soviets');
  return facingSprite('A' + key + mig, () => jetModel(pal, mig), u.face);
}
function turretSprite(u, pal) {
  const d = u.def;
  if (d.draw === 'tank') return facingSprite('t' + d.type + pal.key, () => tankTurret(pal, d.size), u.tface, FACINGS, { shadow: false });
  if (d.draw === 'jeep') return facingSprite('m' + pal.key, () => mgModel(), u.tface, FACINGS, { shadow: false });
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
  if (type === 'rocket') { m.cylX(-4, 8, -2.5, 3.5, 1.3, '#56603a'); m.box(8, -4, 2, 10, -1, 5, '#2a2a24'); }
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
  if (type === 'rocket') m.cylX(-8, 4, -5, 0.7, 0.9, '#56603a');
  else if (type !== 'grenadier' && type !== 'pilot') { m.box(-6, 4, 0, 3, 5, 1, C.gun, M_METAL); m.box(-9, 4, 0, -6, 5, 1.5, '#6a4426'); }
  return m;
}
function infSprite(u, pal, frame) {
  return facingSprite(`I${u.type}${pal.key}${frame}`, () => infModel(pal, u.faction, u.type, frame), u.face, 16, { crisp: true });
}
const TURRET_Z = { tank: 7, jeep: 5, arty: 9, v2: 12 };
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
