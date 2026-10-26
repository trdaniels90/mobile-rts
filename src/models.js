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
function tankHull(pal, s) {
  const L = s.len, W = s.wid, hl = Math.floor(L / 2), hw = Math.floor(W / 2), tw = Math.max(3, Math.round(W * 0.26));
  const m = new VModel(-hl - 2, -hw - 2, hl + 3, hw + 3, 10);
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
  const m = new VModel(-16, -13, 15, 13, 9);
  if (mig) {
    m.cylX(-13, 11, 0, 3, 2, pal.main, M_METAL);
    m.cylX(10, 14, 0, 3, 1.6, C.gun, M_METAL);
    m.cylX(11, 13, 0, 3, 0.8, C.black);
    for (let x = -10; x < 6; x++) { const span = Math.round((6 - x) * 0.72); m.box(x, -span - 1, 2, x + 1, span + 1, 3, pal.main, M_METAL); }
    m.box(-13, 0, 3, -9, 1, 9, pal.dark, M_METAL);
    for (let x = -14; x < -10; x++) { const sp = Math.round((-10 - x) * 1.2) + 1; m.box(x, -sp - 1, 3, x + 1, sp + 1, 4, pal.dark); }
    m.ellipsoid(6, 0, 4.5, 3, 1.2, 1.3, C.glass, M_GLASS);
    m.paintTop(-6, -8, 0, 8, (x, y) => Math.abs(y) === 6 && x < -2 ? C.red : undefined);
  } else {
    m.cylX(-14, 10, 0, 3, 2, pal.main, M_METAL);
    m.ellipsoid(11, 0, 3, 3.5, 1.7, 1.7, pal.main, M_METAL);
    for (let x = -9; x < 4; x++) { const span = Math.round((4 - x) * 0.85); m.box(x, -span - 2, 2, x + 1, span + 2, 3, pal.main, M_METAL); }
    for (const y of [-3, 2]) m.box(-14, y, 3, -10, y + 1, 9, pal.dark, M_METAL);
    for (let x = -15; x < -11; x++) m.box(x, -6, 2, x + 1, 6, 3, pal.dark);
    m.ellipsoid(6, 0, 4.5, 3.5, 1.3, 1.4, C.glass, M_GLASS);
    for (const y of [-7, 7]) m.cylX(-3, 3, y, 1.5, 0.9, C.white);
  }
  m.box(-16, -1, 2, -14, 1, 4, C.black);
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
// Frames: 0 standing, 1-2 walking, 3 throwing, 4 crouching, 5 prone.
function infModel(pal, faction, type, frame) {
  if (frame === 5) return proneModel(pal, faction, type);
  if (frame === 4) return crouched(infModel(pal, faction, type, 0));
  const m = new VModel(-8, -5, 11, 5, 22);
  const sov = faction === 'soviets';
  const step = frame === 1 ? 1.5 : frame === 2 ? -1.5 : 0, throwing = frame === 3;
  const K = infKit(pal, faction), tunic = pal.main, sleeve = shadeInt(pal.main, 0.86);
  // Boots and trousers, legs swinging when walking; a darker seam between the legs.
  for (const [y0, s] of [[-2, step], [0, -step]]) {
    m.box(s - 1, y0, 0, s + 2, y0 + 2, 2, C.black);
    m.box(s - 1, y0, 2, s + 2, y0 + 2, 8, K.pants);
    m.box(s - 1, y0, 6, s + 2, y0 + 2, 7, shadeInt(K.pants, 0.85));   // knee crease
  }
  // Belt with pouches, then a stocky tunic in the side's colour: chest, shoulders, collar.
  m.box(-2, -2, 8, 2, 2, 9, K.web);
  m.box(1, -2, 8, 2, -1, 9.5, K.pouch); m.box(1, 1, 8, 2, 2, 9.5, K.pouch);
  m.set(1, 0, 8, '#c9a227', M_METAL);                                    // buckle
  m.box(-2, -2, 9, 2, 2, 13, tunic);
  m.box(-2, -3, 12, 2, 3, 14, tunic);                                    // shoulders
  m.paint(-2, -2, 9, 2, 2, 13, (x, y, z) => (x === 1 && y === z - 11) ? K.web : undefined);   // strap across the chest
  m.box(-1, -1, 13, 1, 1, 14, shadeInt(tunic, 0.75));                    // collar
  // Arms: sleeves down the sides, forearms forward to the weapon, hands in skin tone.
  if (type === 'grenadier') {
    m.box(-2, 2, 10, 1, 3, 13, sleeve); m.box(1, 2, 10, 2, 3, 11, sleeve); m.set(2, 2, 10, K.skin);
    if (throwing) { m.box(-2, -3, 13, 0, -2, 19, sleeve); m.set(-2, -3, 19, K.skin); m.box(-3, -4, 19, -1, -2, 21, '#3f4a2a'); }
    else { m.box(-2, -3, 9, 1, -2, 12, sleeve); m.set(0, -3, 9, K.skin); m.box(0, -4, 8, 2, -3, 9.5, '#3f4a2a'); }
  } else if (type === 'rocket') {
    m.box(-2, 2, 11, 1, 3, 13, sleeve); m.box(1, 2, 12, 3, 3, 13, sleeve); m.set(3, 2, 13, K.skin);   // hand up on the grip
    m.box(-2, -3, 10, 1, -2, 12, sleeve); m.box(1, -3, 10, 3, -2, 11, sleeve); m.set(3, -3, 10, K.skin);
  } else {
    m.box(-2, -3, 10, 1, -2, 12, sleeve); m.box(-2, 2, 10, 1, 3, 12, sleeve);
    m.box(1, -3, 10, 4, -2, 11, sleeve); m.box(1, 2, 10, 3, 3, 11, sleeve);
    m.set(4, -3, 10, K.skin); m.set(3, 2, 10, K.skin);
  }
  // A grenadier wears a pale bandolier of grenades across the chest and back and carries a
  // big grenade satchel on his hip instead of a pack.
  if (type === 'grenadier') {
    const band = '#b49a5e', gren = '#2f3a20';
    m.paint(-2, -3, 9, 2, 3, 14, (x, y, z) => ((x === 1 || x === -2) && y === z - 11) ? band : undefined);
    for (const [y, z] of [[-2, 9], [0, 11], [2, 13]]) { m.set(2, y, z, gren, M_METAL); m.set(2, y, z + 1, '#7d7d70', M_METAL); }   // grenades, fuse caps
    for (const [y, z] of [[1, 10], [-1, 12]]) m.set(-3, y, z, gren, M_METAL);
    for (const [y0, y1] of [[3, 6], [-6, -3]]) {                                  // canvas grenade bags on both hips
      m.box(-2, y0, 5, 2, y1, 9, '#9a8e58'); m.box(-2, y0, 8, 2, y1, 9, '#6e6338');
      m.set(1, y0 + 1, 6, '#c9a227', M_METAL);
    }
  } else if (type !== 'pilot') { m.box(-3, -2, 9, -2, 2, 13, C.oliveD); m.box(-3, -2, 12, -2, 2, 13, '#3e4528'); m.box(-4, -1, 9, -3, 1, 10, '#6b6450'); }
  else m.box(-3, -2, 9, -2, 2, 12, '#6b6450');
  // Head: face front with eyes, ears at the sides.
  m.box(-1, -1, 14, 2, 2, 17, K.skin);
  m.set(1, -1, 16, '#2a1e18'); m.set(1, 1, 16, '#2a1e18');
  m.set(1, 0, 14, shadeInt(K.skin, 0.8));
  // Headgear.
  if (type === 'grenadier') {
    m.box(-1, -1, 17, 2, 2, 18, '#5d6236'); m.box(-1, -2, 17, 2, 3, 17.5, '#5d6236'); m.box(2, -1, 17, 3, 2, 17.5, '#474a28');   // field cap
  } else if (type === 'pilot') {
    m.box(-2, -2, 15, 2, 3, 18, '#cfcab8'); m.box(-1, -1, 18, 2, 2, 19, '#cfcab8');                  // flight helmet, dark visor
    m.box(2, -1, 15, 3, 2, 17, '#22262a', M_GLASS);
    m.box(3, 1, 10, 6, 2, 11, C.gun, M_METAL);                                                         // sidearm
  } else if (sov) {
    m.box(-2, -2, 16, 3, 3, 17, shadeInt(K.helm, 0.72)); m.box(-2, -2, 17, 3, 3, 18, K.helm);          // round steel helmet
    m.box(-1, -1, 18, 2, 2, 18.5, K.helm);
    m.set(2, 0, 17, '#c8281e');                                                                        // red star
  } else {
    m.box(-2, -2, 17, 3, 3, 17.5, shadeInt(K.helm, 0.75));                                            // wide brim
    m.box(-1, -1, 17, 2, 2, 18.5, K.helm);
  }
  // Weapon.
  if (type === 'rocket') {
    m.cylX(-6, 6, 2.5, 15, 1.3, '#56603a');
    m.box(6, 1, 14, 8, 4, 16, '#2a2a24');                                  // muzzle
    m.box(-7, 1, 14, -6, 4, 16, '#2a2a24');                                // exhaust
    m.box(2, 2, 12, 3, 3, 14, '#2a2a24');                                  // grip
  } else if (type !== 'grenadier' && type !== 'pilot') {
    m.box(2, -1, 10, 10, 0, 11, C.gun, M_METAL);                           // barrel and receiver
    m.box(0, -1, 10, 3, 0, 11.5, '#6a4426');                               // wooden stock
    m.box(5, -1, 9, 6, 0, 10, C.gun, M_METAL);                             // magazine
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
    pants: mixHex(pal.dark, sov ? '#5e5644' : '#4f5a3c', 0.55), web: '#3b3324', pouch: '#4a4630', skin: '#d6a07a',
    helm: sov ? 0x4f6438 : mixHex(pal.dark, '#6f7e4a', 0.5),
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
  // Squat concrete bunker with firing slits all round.
  pillbox(pal) {
    const m = new VModel(-2, -2, 26, 26, 12);
    m.box(0, 0, 0, 24, 24, 1, C.bib, M_ROUGH);
    for (let z = 1; z < 9; z++) {
      const r = z < 7 ? 10.5 : 10.5 - (z - 6) * 1.6;
      for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
        const dx = Math.abs(x + 0.5 - 12), dy = Math.abs(y + 0.5 - 12);
        if (Math.max(dx, dy) + Math.min(dx, dy) * 0.42 <= r) m.set(x, y, z, z % 3 === 0 ? C.wallD : C.wall, M_ROUGH);
      }
    }
    // Firing slits: a dark band broken by concrete pillars.
    m.paint(0, 0, 4, 24, 24, 6, (x, y) => (Math.round(Math.atan2(y - 12, x - 12) * 4) % 2 === 0) ? '#1d1c1a' : undefined);
    m.cylZ(12, 12, 9, 10, 2.5, pal.main, M_METAL);
    for (const [x, y] of [[1, 18], [19, 1], [1, 2]]) sandbagsV(m, x, y, x + 4, y + 4, 3);
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
  sam() {
    const m = new VModel(-2, -2, 50, 26, 5);
    slabV(m, 0, 0, 48, 24);
    m.cylZ(24, 12, 1, 3, 8, C.wall, M_MATTE);
    return m;
  },
};

// Rotating weapon heads on defences: [model builder, pivot x, pivot y, pivot height].
const HEADS = {
  turret: [(pal) => {
    const m = new VModel(-7, -7, 17, 7, 6);
    m.cylZ(0, 0, 0, 4, 5.5, pal.main, M_METAL);
    m.box(-5, -4, 0, -2, 4, 3, pal.dark, M_METAL);
    m.cylX(4, 15, 0, 2, 1.2, C.gun, M_METAL);
    m.cylX(13, 15, 0, 2, 1.5, C.gun, M_METAL);
    m.cylZ(-1, 0, 4, 5, 1.6, pal.light, M_METAL);
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

// ---------------------------------------------------------------------------
// Sprite getters used by the renderer
// ---------------------------------------------------------------------------
function structureSprite(type, faction) {
  const pal = palFor(faction);
  return sprite('S' + type + pal.key, () => STRUCTURES[type](pal, faction), 0, 0);
}
function headSprite(type, faction, angle) {
  const pal = palFor(faction), h = HEADS[type];
  return facingSprite('H' + type + pal.key, () => h[0](pal), angle, FACINGS, { shadow: false });
}
function hullSprite(u, pal) {
  const d = u.def;
  const key = d.type + pal.key;
  if (d.draw === 'tank') return facingSprite('T' + key, () => tankHull(pal, d.size), u.face);
  if (d.draw === 'jeep') return facingSprite('J' + key, () => jeepModel(pal), u.face);
  if (d.draw === 'fob') return facingSprite('F' + key, () => fobModel(pal), u.face);
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
function infSprite(u, pal, frame) {
  return facingSprite(`I${u.type}${pal.key}${frame}`, () => infModel(pal, u.faction, u.type, frame), u.face, 16, { crisp: true });
}
const TURRET_Z = { tank: 7, jeep: 5 };

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
