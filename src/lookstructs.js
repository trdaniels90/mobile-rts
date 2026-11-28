'use strict';
// Heavier structures (look test, proposal item 8; LOOK.structs, ?lookoff=structs shows the earlier ones). Drawing only,
// both modes: the same ids, footprints, sizes and hit areas, only the voxel models change. Owner, 2026-11-19: "Let's get
// away from our toy structures look. Really look at how Tiberian Sun and Red Alert 2 look for their structures."
// Principles (studied from screenshots of those games; nothing copied, every design here is our own):
//  - squat, wide and layered: a stepped plinth, battered (sloping) lower walls, set-back upper storeys, buttresses;
//  - real materials: weathered concrete with pour lines and panel joints, plated and riveted steel, ribbed (corrugated)
//    sheet, tar roofs; grime at the foot, rain streaks under every top edge, rust on steel;
//  - small detail at the right scale: pipes with flanges, vents, ladders, railings, antennas, floodlights, hazard stripes;
//  - the team colour as stripes, bands and plates, never whole roofs; a darker, muted palette with strong form shading;
//  - each role still readable at a glance (the yard's crane and gate, the plant's stacks, the refinery's silo and bay,
//    the barracks' door and sandbags, the factory's big door and saw-tooth roof).
// The redesigned types are in TS_MODELS; every other structure gets the weathering pass only (tsWeather, stage 1).
// Anchors kept from the earlier models (other code draws over them): the yard's crane mast and pivot (models.js SPINNERS,
// CRANE_HOOK), the War Factory's door opening (factoryDoor: x 20-52, front y 44-46, z 1-16), the power plants' and
// refineries' stack tops (models.js plantStacks: world.js smoke), flag poles (art.js FLAG_SPOTS), the Soviet banner rods
// (models.js BANNERS) and the refinery's truck bay. Window glass stays M_GLASS and beacons M_GLOW (look.js structLamps,
// lookfx.js aliveSpots read them); the team colour comes from the palette as before.
// Baked sprites: the sheets in sprites/ were baked from the earlier models, so while LOOK.structs is on, baked pictures
// of every structure are refused (spriteCache2.set below) and the models here are rendered instead.
(() => {
  const q = typeof location !== 'undefined' ? location.search : '';
  const on = !/[?&]look=off\b/.test(q), off = (q.match(/[?&]lookoff=([a-z,]+)/) || [, ''])[1].split(',');
  LOOK.structs = on && !off.includes('structs');
})();

const TSC = {
  conc: '#948e80', concL: '#a6a092', concD: '#787266', seam: '#5c5951', grime: '#3f3a31', tar: '#3a3a36', tarD: '#2f2f2b',
  steel: '#5f6566', steelL: '#7a8180', steelD: '#454a4b', rivet: '#8c9291', rust: '#6d4429', rustD: '#4a2f1e',
  olive: '#4c5235', oliveD: '#3a3f28', pipe: '#53585a', glass: '#24343e', glassL: '#3b5563', hazard: '#b8902a', black: '#1d1d1a',
  pad: '#4b4a44', padD: '#3d3c37', paint: '#a8a294', lamp: '#ffd890', red: '#ff3a28',
};
const tsMix = (a, b, k) => mixHex(a, b, Math.max(0, Math.min(1, k)));

// ---- The kit ----------------------------------------------------------------------------------------------------------
// Weathered concrete: pour lines every 6 up, panel joints every `jx` along, speckle.
function tsConc(m, x0, y0, z0, x1, y1, z1, col, jx) {
  col = col || TSC.conc; jx = jx || 10;
  m.box(x0, y0, z0, x1, y1, z1, col, M_ROUGH);
  const L = tsMix(col, '#ffffff', 0.1), D = tsMix(col, '#000000', 0.18);
  m.paint(x0, y0, z0, x1, y1, z1, (x, y, z) => {
    if ((z - z0) % 6 === 5) return D;
    if ((x - x0) % jx === 0 && x > x0 || (y - y0) % jx === 0 && y > y0) return D;
    const n = hash3(x, y, z);
    if (n > 0.9) return L;
    if (n < 0.07) return D;
  });
}
// Battered (sloping) skirt round a block's foot: h high, leaning out d voxels at the ground.
function tsBatter(m, x0, y0, x1, y1, z0, h, d, col) {
  for (let i = 0; i < h; i++) {
    const o = Math.round(d * (1 - (i + 0.5) / h));
    tsConc(m, x0 - o, y0 - o, z0 + i, x1 + o, y1 + o, z0 + i + 1, col || TSC.concD);
  }
}
// A stepped plinth (foundation pad): a low outer step, the pad, a dark edge.
function tsPlinth(m, x0, y0, x1, y1, h) {
  h = h || 2;
  m.box(x0, y0, 0, x1, y1, 1, TSC.padD, M_ROUGH);
  m.box(x0 + 1, y0 + 1, 1, x1 - 1, y1 - 1, h, TSC.pad, M_ROUGH);
  m.paintTop(x0, y0, x1, y1, (x, y) => {
    const n = hash3(x, y, 31);
    if ((x - x0) % 12 === 0 || (y - y0) % 12 === 0) return TSC.padD;
    if (n > 0.93) return '#5a5850';
    if (n < 0.05) return '#2f2e2a';   // oil
  });
}
// Plated, riveted steel: panels 8 x 5 with seams and a rivet at each crossing.
function tsPlate(m, x0, y0, z0, x1, y1, z1, col) {
  col = col || TSC.steel;
  m.box(x0, y0, z0, x1, y1, z1, col, M_METAL);
  const D = tsMix(col, '#000000', 0.25), R = tsMix(col, '#ffffff', 0.22);
  m.paint(x0, y0, z0, x1, y1, z1, (x, y, z) => {
    const sx = (x - x0) % 8 === 0 && x > x0, sy = (y - y0) % 8 === 0 && y > y0, sz = (z - z0) % 5 === 4;
    if ((sx || sy) && sz) return R;
    if (sx || sy || sz) return D;
  });
}
// Ribbed (corrugated) sheet: ribs every 2 along x (axis 'x') or y.
function tsRibbed(m, x0, y0, z0, x1, y1, z1, col, axis) {
  col = col || TSC.steel;
  m.box(x0, y0, z0, x1, y1, z1, col, M_METAL);
  const D = tsMix(col, '#000000', 0.22);
  m.paint(x0, y0, z0, x1, y1, z1, (x, y) => ((axis === 'y' ? y : x) % 2 ? D : undefined));
}
// A band in the side's colour round a block (z0..z1), with a dark line under it.
function tsBand(m, x0, y0, x1, y1, z0, z1, pal) {
  for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (x !== x0 && y !== y0 && x !== x1 - 1 && y !== y1 - 1) continue;
    if (m.get(x, y, z) >= 0) m.set(x, y, z, z === z0 ? pal.dark : pal.main, M_METAL);
  }
}
// Two stripes in the side's colour along a roof (top voxels), `w` wide, `in` in from the long edges.
function tsRoofStripes(m, x0, y0, x1, y1, pal, w, inset, alongY) {
  w = w || 2; inset = inset || 2;
  m.paintTop(x0, y0, x1, y1, (x, y) => {
    const a = alongY ? x - x0 : y - y0, n = alongY ? x1 - x0 : y1 - y0;
    return (a >= inset && a < inset + w) || (a >= n - inset - w && a < n - inset) ? pal.main : undefined;
  });
}
// Hazard stripes (diagonal yellow and black).
function tsHazard(m, x0, y0, z0, x1, y1, z1) {
  m.box(x0, y0, z0, x1, y1, z1, TSC.hazard, M_MATTE);
  m.paint(x0, y0, z0, x1, y1, z1, (x, y, z) => (((x + y + z) >> 1) % 2 ? TSC.black : undefined));
}
// Pipes with flanges every 6.
function tsPipeX(m, x0, x1, y, z, r, col) { m.cylX(x0, x1, y, z, r, col || TSC.pipe, M_METAL); for (let x = x0 + 3; x < x1; x += 6) m.cylX(x, x + 1, y, z, r + 0.6, TSC.steelD, M_METAL); }
function tsPipeY(m, y0, y1, x, z, r, col) { m.cylY(y0, y1, x, z, r, col || TSC.pipe, M_METAL); for (let y = y0 + 3; y < y1; y += 6) m.cylY(y, y + 1, x, z, r + 0.6, TSC.steelD, M_METAL); }
function tsPipeZ(m, x, y, z0, z1, r, col) { m.cylZ(x, y, z0, z1, r, col || TSC.pipe, M_METAL); for (let z = z0 + 3; z < z1; z += 6) m.cylZ(x, y, z, z + 1, r + 0.6, TSC.steelD, M_METAL); }
// A railing along a roof edge (posts every 3, a top rail).
function tsRail(m, x0, y0, x1, y1, z) {
  const c = TSC.steelD;
  for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) {
    if (x !== x0 && y !== y0 && x !== x1 - 1 && y !== y1 - 1) continue;
    m.set(x, y, z + 2, c, M_METAL);
    if ((x + y) % 4 === 0) m.set(x, y, z + 1, c, M_METAL);
  }
}
// A ladder up a face: face 'y' (on the front, at row y) or 'x' (on the east side, at column x).
function tsLadder(m, x, y, z0, z1, face) {
  for (let z = z0; z < z1; z++) {
    if (face === 'x') { m.set(x, y, z, TSC.steelL, M_METAL); m.set(x, y + 2, z, TSC.steelL, M_METAL); if (z % 2 === 0) m.set(x, y + 1, z, TSC.steelD, M_METAL); }
    else { m.set(x, y, z, TSC.steelL, M_METAL); m.set(x + 2, y, z, TSC.steelL, M_METAL); if (z % 2 === 0) m.set(x + 1, y, z, TSC.steelD, M_METAL); }
  }
}
// A louvred vent box on a roof.
function tsVent(m, x0, y0, z, w, d, h) {
  tsPlate(m, x0, y0, z, x0 + w, y0 + d, z + h, TSC.steelD);
  m.paint(x0, y0, z, x0 + w, y0 + d, z + h, (x, y, zz) => ((zz - z) % 2 === 0 && zz < z + h - 1 ? TSC.black : undefined));
  m.box(x0 - 1, y0 - 1, z + h, x0 + w + 1, y0 + d + 1, z + h + 1, TSC.steel, M_METAL);
}
// A roof fan housing: a squat drum with a dark grille.
function tsFan(m, x, y, z, r) {
  m.cylZ(x, y, z, z + 3, r, TSC.steel, M_METAL);
  m.cylZ(x, y, z + 2, z + 3, r - 1, TSC.black, M_METAL);
  m.paint(x - r, y - r, z + 2, x + r, y + r, z + 3, (xx, yy) => ((xx + yy) % 3 === 0 ? TSC.steelD : undefined));
}
// A mast with a red beacon on top (look.js structLamps puts its blinking light on the highest points).
function tsMast(m, x, y, z0, z1) {
  m.line(x, y, z0, x, y, z1, TSC.steelL, M_METAL);
  for (let z = z0 + 3; z < z1 - 1; z += 4) m.set(x + 1, y, z, TSC.steelL, M_METAL);
  m.set(x, y, z1, TSC.red, M_GLOW);
}
// A floodlight on a bracket, facing the camera's side.
function tsFlood(m, x, y, z) {
  m.box(x, y, z, x + 2, y + 2, z + 2, TSC.steelD, M_METAL);
  m.set(x + 1, y + 1, z, TSC.lamp, M_GLOW);
}
// Windows: a row of slits on the front (row y) or east face (column x), M_GLASS.
function tsWinY(m, x0, x1, y, z0, z1, step) { for (let x = x0; x < x1; x += step || 4) m.box(x, y, z0, Math.min(x1, x + (step || 4) - 1), y + 1, z1, TSC.glass, M_GLASS); }
function tsWinX(m, x, y0, y1, z0, z1, step) { for (let y = y0; y < y1; y += step || 4) m.box(x, y, z0, x + 1, Math.min(y1, y + (step || 4) - 1), z1, TSC.glass, M_GLASS); }
// Sandbags (darker and rougher than the old ones).
function tsSandbags(m, x0, y0, x1, y1, h, ring) {
  const inRing = (x, y) => !ring || x < x0 + 3 || y < y0 + 3 || x >= x1 - 3 || y >= y1 - 3;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (inRing(x, y)) m.box(x, y, 0, x + 1, y + 1, h, '#8a7a58', M_ROUGH);
  m.paint(x0, y0, 0, x1, y1, h, (x, y, z) => (((x + (z % 2) * 2) % 4 === 0 || (y + (z % 2) * 2) % 4 === 0) ? '#6a5d42' : hash3(x, y, z) > 0.85 ? '#9a8a66' : undefined));
}
// A sloped armour roof (hip): from the block's edge in to a ridge, h high.
function tsHipRoof(m, x0, y0, x1, y1, z, h, col) {
  for (let i = 0; i < h; i++) {
    const a = x0 + i, b = y0 + i, c = x1 - i, d = y1 - i;
    if (c <= a || d <= b) break;
    tsPlate(m, a, b, z + i, c, d, z + i + 1, col);
  }
}

// ---- Weathering, applied to every structure model at the end -----------------------------------------------------------
// Muted (a little less saturation, a little darker; the old near-white walls toned down to concrete), mud at the foot,
// rain streaks under top edges on the faces the camera sees, rust specks on steel, and a fine speckle.
function tsWeather(m, strong) {
  const W = m.w, H = m.h, D = m.d, top = topOf(m), col = m.col, mat = m.mat;
  const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= D ? -1 : col[(z * H + y) * W + x]);
  for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (z * H + y) * W + x, c = col[i];
    if (c < 0 || mat[i] === M_GLOW || mat[i] === M_GLASS) continue;
    let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    const lum = 0.3 * r + 0.59 * g + 0.11 * b, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let k = 0.97;
    if (lum > 165 && mx - mn < 40) k *= strong ? 0.74 : 0.86;   // whitewash toned down to weathered concrete
    const sat = strong ? 0.8 : 0.88;
    r = lum + (r - lum) * sat; g = lum + (g - lum) * sat; b = lum + (b - lum) * sat;
    const side = at(x + 1, y, z) < 0 || at(x, y + 1, z) < 0 || at(x - 1, y, z) < 0 || at(x, y - 1, z) < 0;
    const wx = x + m.x0, wy = y + m.y0;
    k *= 1 + (hash3(wx, wy, z * 7 + 3) - 0.5) * 0.08;
    if (side && z >= 1 && z <= 4) k *= 0.72 + 0.07 * (z - 1);   // mud and grime at the foot
    if (side) {
      const t = top[y * W + x], h = hash3(wx * 3 + wy, 0, 91);
      if (h > 0.62 && t - z < 12 && t - z > 0) k *= 1 - 0.16 * (1 - (t - z) / 12) * (h - 0.62) / 0.38 * 2;   // rain streaks
    }
    if (mat[i] === M_METAL && hash3(wx, wy, z + 50) > 0.93) { r = r * 0.6 + 109 * 0.4; g = g * 0.6 + 68 * 0.4; b = b * 0.6 + 41 * 0.4; }   // rust
    col[i] = (Math.max(0, Math.min(255, Math.round(r * k))) << 16) | (Math.max(0, Math.min(255, Math.round(g * k))) << 8) | Math.max(0, Math.min(255, Math.round(b * k)));
  }
  return m;
}

// ---- The redesigned models ---------------------------------------------------------------------------------------------
const TS_MODELS = {
  // Allied Construction Yard: a heavy assembly hall on a stepped pad, battered walls with buttresses, a ribbed gantry
  // housing on its roof, a control block with a slanted window band at the east end, the tower crane, a hazard-marked
  // apron in front of a recessed armoured gate.
  cy_allies(pal, cameo) {
    const m = new VModel(-2, -2, 76, 76, 48);
    tsPlinth(m, 0, 0, 72, 72, 2);
    m.paintTop(24, 56, 48, 71, (x, y) => ((y - 56) % 5 < 2 && (x + y) % 6 < 3 ? TSC.hazard : (y - 56) % 5 < 2 ? TSC.black : undefined));
    tsBatter(m, 4, 8, 58, 52, 2, 5, 3);
    tsConc(m, 4, 8, 7, 58, 52, 19);
    for (const x of [8, 18, 54]) tsBatter(m, x, 50, x + 3, 53, 2, 14, 2, TSC.concD);   // buttresses on the front
    tsBand(m, 4, 8, 58, 52, 15, 18, pal);
    m.box(3, 7, 19, 59, 53, 20, TSC.concD, M_ROUGH);                                      // roof slab and lip
    m.box(5, 9, 20, 57, 51, 21, TSC.tar, M_ROUGH);
    m.paintTop(5, 9, 57, 51, (x, y) => (hash3(x, y, 4) > 0.85 ? TSC.tarD : undefined));
    tsRibbed(m, 14, 14, 21, 46, 40, 27, TSC.steel, 'x');                                   // gantry housing
    m.box(13, 13, 27, 47, 41, 28, TSC.steelD, M_METAL);
    tsBand(m, 14, 14, 46, 40, 24, 27, pal);
    tsRoofStripes(m, 13, 13, 47, 41, pal, 2, 3);
    tsVent(m, 8, 12, 21, 4, 6, 3); tsVent(m, 49, 42, 21, 5, 5, 3);
    tsFan(m, 52, 16, 21, 3.5);
    tsPipeX(m, 6, 56, 47, 22.5, 1.2);
    // The gate: recessed, armoured slats, hazard jambs, a heavy lintel
    m.clear(22, 49, 3, 50, 53, 16);
    m.box(22, 49, 3, 50, 50, 16, TSC.steelD, M_METAL);
    m.paint(22, 49, 3, 50, 50, 16, (x, y, z) => (z % 2 ? TSC.black : (x - 22) % 7 === 0 ? TSC.steel : undefined));
    tsHazard(m, 20, 50, 2, 22, 54, 17); tsHazard(m, 50, 50, 2, 52, 54, 17);
    tsPlate(m, 19, 50, 16, 53, 54, 19, TSC.steelD);
    m.box(28, 53, 17, 44, 54, 18, pal.main, M_METAL);
    // Control block at the east end
    tsBatter(m, 58, 16, 70, 52, 2, 4, 2);
    tsConc(m, 58, 16, 6, 70, 52, 26);
    for (let z = 20; z < 24; z++) m.box(58, 51 - (z - 20), z, 70, 52 - (z - 20), z + 1, TSC.glass, M_GLASS);   // slanted window band (front)
    m.box(69, 20, 20, 70, 48, 24, TSC.glass, M_GLASS);                                    // and round the east side
    m.paint(58, 16, 20, 70, 52, 24, (x, y, z) => (m.mat[m.idx(x, y, z)] === M_GLASS && (x % 4 === 0 || y % 4 === 0) ? TSC.steelD : undefined));
    tsBand(m, 58, 16, 70, 52, 12, 15, pal);
    m.box(57, 15, 26, 71, 53, 27, TSC.concD, M_ROUGH);
    tsRail(m, 58, 16, 70, 52, 26);
    tsMast(m, 66, 46, 27, 38);
    tsLadder(m, 70, 36, 3, 26, 'x');
    tsFlood(m, 59, 52, 18); tsFlood(m, 5, 52, 15);
    // Tower crane: a braced mast (models.js SPINNERS.cy turns the jib round (66, 9.5) at 42)
    tsPlate(m, 62, 6, 1, 70, 14, 4, TSC.concD);
    for (const [dx, dy] of [[0, 0], [3, 0], [0, 3], [3, 3]]) m.line(64 + dx * 0.67, 8 + dy * 0.67, 4, 64 + dx * 0.67, 8 + dy * 0.67, 44, TSC.hazard, M_METAL);
    for (let z = 5; z < 43; z += 3) { m.line(64, 8, z, 66, 8, z + 2, '#8a6c12', M_METAL); m.line(64, 10, z + 2, 66, 10, z, '#8a6c12', M_METAL); m.line(66, 8, z + 1, 66, 10, z + 3, '#8a6c12', M_METAL); }
    m.box(63, 7, 41, 68, 12, 42, TSC.steelD, M_METAL);
    if (cameo) { towerJib(m, 66, 9.5, 42, false); m.line(32, 9.5, 41, 32, 9.5, 22, C.black); m.box(30, 8, 20, 34, 11, 22, C.gun, M_METAL); }
    return tsWeather(m);
  },
  // Soviet Construction Yard: brutalist. A long precast hall on a battered base, a set-back stepped tower at the back
  // left, rusted ribbed roof bays, red bands (not red roofs), a smaller star over the armoured gate, banners (rods at
  // the old places), pipework and a vent stack, the lattice crane at the back right.
  cy_soviets(pal, cameo) {
    const m = new VModel(-2, -2, 76, 76, 48);
    tsPlinth(m, 0, 0, 72, 72, 2);
    m.paintTop(24, 57, 48, 71, (x, y) => ((y - 57) % 5 < 2 ? ((x >> 1) % 2 ? TSC.hazard : TSC.black) : undefined));
    tsBatter(m, 4, 8, 68, 53, 2, 6, 3, '#6a675e');
    tsConc(m, 4, 8, 8, 68, 54, 21, '#7f7c72', 8);
    tsBand(m, 4, 8, 68, 54, 17, 20, pal);
    m.box(3, 7, 21, 69, 55, 22, '#66635a', M_ROUGH);
    tsRibbed(m, 34, 12, 22, 66, 50, 25, TSC.rustD, 'y');                                  // a rusted monitor roof over the hall
    m.paint(34, 12, 22, 66, 50, 25, (x, y, z) => (hash3(x >> 1, y >> 2, 3) > 0.6 ? TSC.rust : x % 2 ? undefined : (x - 34) % 8 === 0 ? TSC.steelD : undefined));
    m.box(36, 14, 25, 64, 48, 26, TSC.steelD, M_METAL);
    tsRoofStripes(m, 36, 14, 64, 48, pal, 2, 2);
    tsVent(m, 40, 20, 26, 4, 4, 2); tsVent(m, 54, 34, 26, 4, 4, 2);
    tsConc(m, 6, 10, 22, 30, 32, 30, '#7f7c72', 8);                                        // the tower, set back in steps
    tsBand(m, 6, 10, 30, 32, 27, 30, pal);
    tsConc(m, 9, 12, 30, 27, 28, 37, '#7f7c72', 8);
    m.box(8, 11, 37, 28, 29, 38, '#66635a', M_ROUGH);
    tsWinY(m, 8, 29, 31, 24, 26, 3); tsWinX(m, 29, 12, 31, 24, 26, 3);
    tsWinY(m, 11, 26, 27, 32, 34, 3);
    tsMast(m, 12, 15, 38, 46); tsVent(m, 20, 16, 38, 4, 4, 2);
    tsWinY(m, 4, 20, 53, 13, 15, 3); tsWinY(m, 52, 68, 53, 13, 15, 3);
    // Gate (x 22-50), star over it on a plate
    m.clear(22, 50, 3, 50, 54, 14);
    m.box(22, 50, 3, 50, 51, 14, TSC.oliveD, M_METAL);
    m.paint(22, 50, 3, 50, 51, 14, (x, y, z) => (z % 2 ? TSC.olive : (x - 22) % 7 === 0 ? TSC.steelD : undefined));
    tsHazard(m, 20, 51, 2, 22, 55, 15); tsHazard(m, 50, 51, 2, 52, 55, 15);
    tsPlate(m, 19, 51, 14, 53, 55, 17, TSC.steelD);
    m.box(30, 54, 14, 42, 55, 17, pal.dark, M_METAL);
    starFront(m, 36, 54, 15.5, 2.6, C.yellow);
    bannersV(m, 'cy');
    tsPipeX(m, 30, 68, 52, 20, 1.2);
    tsPipeZ(m, 66, 50, 3, 20, 1.3);
    tsFlood(m, 5, 53, 17); tsFlood(m, 66, 53, 17);
    // Lattice crane (SPINNERS.cy soviets: pivot (64, 3.5) at 43)
    tsPlate(m, 60, 0, 1, 68, 7, 4, TSC.concD);
    latticeV(m, 63, 2, 4, 44, TSC.hazard);
    if (cameo) { towerJib(m, 64, 3.5, 43, true); m.line(36, 3.5, 42, 36, 3.5, 26, C.black); m.box(34, 2, 24, 38, 5, 26, C.gun, M_METAL); }
    return tsWeather(m);
  },
  // Allied Power Plant: a squat turbine hall with a battered base and a ribbed roof, two fan housings, a tall stack at
  // (38, 12) and a short one at (9, 10) (world.js smoke), and a fenced transformer yard with finned transformers.
  power_allies(pal) {
    const m = new VModel(-2, -2, 50, 50, 46);
    tsPlinth(m, 0, 0, 48, 48, 2);
    tsBatter(m, 3, 18, 30, 44, 2, 4, 2);
    tsConc(m, 3, 18, 6, 30, 44, 17);
    tsBand(m, 3, 18, 30, 44, 13, 16, pal);
    tsWinY(m, 5, 28, 43, 8, 11, 4);
    m.clear(13, 42, 2, 18, 44, 10); m.box(13, 43, 2, 18, 44, 10, TSC.steelD, M_METAL);   // door
    tsHazard(m, 12, 43, 2, 13, 44, 10); tsHazard(m, 18, 43, 2, 19, 44, 10);
    m.box(2, 17, 17, 31, 45, 18, TSC.concD, M_ROUGH);
    for (let i = 0; i < 4; i++) tsRibbed(m, 3 + i, 18, 18 + i, 30 - i, 44, 19 + i, TSC.steel, 'y');   // low ribbed roof
    tsFan(m, 10, 31, 22, 3.5); tsFan(m, 22, 31, 22, 3.5);
    tsPipeY(m, 6, 18, 16, 12, 1.4);                                                      // flue to the small stack's base
    // Stacks: concrete, banded near the top, ladders, a dark mouth
    const stack = (x, y, h, r) => {
      tsBatter(m, x - r - 1, y - r - 1, x + r + 1, y + r + 1, 2, 3, 1.5);
      for (let z = 5; z < h; z++) m.cylZ(x, y, z, z + 1, r * (1 - 0.12 * (z - 5) / (h - 5)), z % 6 === 0 ? TSC.concD : TSC.conc, M_ROUGH);
      m.cylZ(x, y, h - 8, h - 6, r * 0.9 + 0.5, pal.main, M_METAL);
      m.cylZ(x, y, h - 2, h, r * 0.88 + 0.4, TSC.steelD, M_METAL);
      m.cylZ(x, y, h - 2, h, r * 0.88 - 1, null);
      m.cylZ(x, y, h - 3, h - 2, r * 0.88 - 1, TSC.black, M_ROUGH);
      for (let z = 6; z < h - 3; z++) if (z % 2 === 0) m.set(Math.round(x + r * 0.85), y, z, TSC.steelL, M_METAL);
    };
    stack(38, 12, 43, 4.4); stack(9, 10, 31, 3.2);
    tsPipeX(m, 13, 34, 12, 8, 1.5);
    // Transformer yard: two finned boxes, insulators, a fence
    for (const [x, y] of [[33, 26], [33, 36]]) {
      tsPlate(m, x, y, 2, x + 10, y + 7, 9, TSC.olive);
      m.paint(x, y, 2, x + 10, y + 7, 9, (xx, yy, z) => (yy === y + 6 && xx % 2 ? TSC.oliveD : undefined));
      for (const dx of [2, 5, 8]) { m.line(x + dx, y + 3, 9, x + dx, y + 3, 13, TSC.paint, M_MATTE); m.set(x + dx, y + 3, 13, TSC.steelL, M_METAL); }
    }
    for (let x = 31; x < 47; x++) for (const y of [24, 46]) { m.set(x, y, 2, TSC.steelD, M_METAL); if (x % 3 === 0) m.box(x, y, 2, x + 1, y + 1, 7, TSC.steelD, M_METAL); m.set(x, y, 6, TSC.steelD, M_METAL); }
    for (let y = 24; y < 47; y++) { m.set(46, y, 2, TSC.steelD, M_METAL); if (y % 3 === 0) m.box(46, y, 2, 47, y + 1, 7, TSC.steelD, M_METAL); m.set(46, y, 6, TSC.steelD, M_METAL); }
    m.line(38, 29, 13, 28, 30, 18, TSC.black); m.line(38, 39, 13, 28, 38, 18, TSC.black);    // cables to the hall
    tsFlood(m, 4, 43, 13);
    return tsWeather(m);
  },
  // Allied Ore Refinery: a heavy processing hall (battered concrete, ribbed roof, team band) with the truck bay open to
  // the south, a big riveted storage silo in a steel cradle, two steel stacks at the old places (56, 10) and (67, 19),
  // a hopper and conveyor over the ore heap, pipe racks.
  refinery_allies(pal) {
    const m = new VModel(-2, -2, 74, 50, 56);
    tsPlinth(m, 0, 0, 72, 48, 2);
    // Stacks: riveted steel, rust at the foot, team band, platform rings, guy lines
    const stack = (x, y, h, r) => {
      tsPlate(m, x - r - 2, y - r - 2, 2, x + r + 2, y + r + 2, 6, TSC.concD);
      for (let z = 6; z < h; z++) m.cylZ(x, y, z, z + 1, r, z % 5 === 0 ? TSC.steelD : z < 14 ? tsMix(TSC.steel, TSC.rust, 0.5) : TSC.steel, M_METAL);
      m.cylZ(x, y, h - 9, h - 6, r + 0.4, pal.main, M_METAL);
      m.cylZ(x, y, 24, 25, r + 2, TSC.steelD, M_METAL);
      m.cylZ(x, y, h - 1, h, r + 0.5, TSC.black, M_METAL); m.cylZ(x, y, h - 1, h, r - 1, null);
    };
    stack(56, 10, 50, 3.6); stack(67, 19, 45, 3.2);
    // Silo in a cradle
    m.cylZ(22, 13, 2, 8, 10, TSC.concD, M_ROUGH);
    for (let z = 8; z < 34; z++) m.cylZ(22, 13, z, z + 1, 9, z % 6 === 0 ? TSC.steelD : TSC.steel, M_METAL);
    m.ellipsoid(22, 13, 34, 9, 9, 4, TSC.steel, M_METAL);
    m.paint(13, 4, 8, 32, 23, 34, (x, y, z) => (Math.abs(Math.atan2(y - 13, x - 22) * 6 % 1) < 0.08 ? TSC.steelD : undefined));
    m.cylZ(22, 13, 26, 29, 9.4, pal.main, M_METAL);
    for (const [dx, dy] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) m.box(22 + dx - 0.5, 13 + dy - 0.5, 2, 22 + dx + 1, 13 + dy + 1, 30, TSC.steelD, M_METAL);
    m.cylZ(22, 13, 37, 40, 2, TSC.steelD, M_METAL); tsMast(m, 22, 13, 40, 48);
    tsLadder(m, 31, 12, 8, 34, 'x');
    // Pipe rack from the silo to the stacks
    for (const x of [34, 44]) m.box(x, 9, 2, x + 1, 11, 12, TSC.steelD, M_METAL);
    tsPipeX(m, 30, 54, 10, 12, 1.4); tsPipeX(m, 30, 66, 13, 9, 1.2);
    tsPipeY(m, 13, 21, 64, 9, 1.2);
    // Processing hall at the front
    tsBatter(m, 3, 25, 53, 44, 2, 4, 2);
    tsConc(m, 3, 25, 6, 53, 44, 15);
    tsBand(m, 3, 25, 53, 44, 11, 14, pal);
    m.box(2, 24, 15, 54, 45, 16, TSC.concD, M_ROUGH);
    for (let i = 0; i < 4; i++) tsRibbed(m, 4, 26 + i, 16 + i, 52, 43 - i, 17 + i, TSC.steel, 'x');
    tsWinY(m, 4, 22, 43, 7, 10, 4); tsWinY(m, 47, 53, 43, 7, 10, 4);
    tsRoofStripes(m, 4, 26, 52, 44, pal, 2, 1, true);
    tsVent(m, 8, 30, 20, 5, 4, 2); tsFan(m, 44, 34, 20, 3);
    // Truck bay (x 24-44), open to the south
    m.clear(24, 40, 2, 44, 46, 12);
    m.box(24, 40, 2, 44, 41, 12, TSC.black, M_MATTE);
    m.box(24, 41, 1, 44, 46, 2, TSC.padD, M_ROUGH);
    tsHazard(m, 22, 42, 2, 24, 46, 13); tsHazard(m, 44, 42, 2, 46, 46, 13);
    tsPlate(m, 21, 42, 12, 47, 46, 15, TSC.steelD);
    m.box(23, 45, 1, 45, 48, 2, TSC.hazard, M_MATTE);
    m.paint(23, 45, 1, 45, 48, 2, (x) => ((x >> 1) % 2 ? TSC.black : undefined));
    // Hopper and conveyor over the ore heap
    m.ellipsoid(62, 38, 2, 8, 7, 6, '#b48a1c', M_ROUGH);
    m.paintTop(54, 31, 70, 45, (x, y) => (hash3(x, y, 21) > 0.7 ? '#d2a62a' : hash3(x, y, 22) < 0.3 ? '#7a5c10' : undefined));
    for (const [x, y] of [[56, 28], [66, 28]]) m.box(x, y, 2, x + 1, y + 1, 18, TSC.steelD, M_METAL);
    tsPlate(m, 55, 25, 16, 68, 31, 22, TSC.olive);
    for (let i = 0; i < 4; i++) m.box(57 + i, 31, 15 - i * 2, 66 - i, 32, 17 - i * 2, TSC.olive, M_METAL);
    m.line(55, 28, 19, 53, 30, 16, TSC.steelD, M_METAL); m.line(55, 27, 19, 53, 29, 16, TSC.steelD, M_METAL);
    m.box(3, 46, 2, 4, 47, 22, C.steel, M_METAL);   // flag pole (art.js FLAG_SPOTS)
    tsFlood(m, 4, 43, 13);
    return tsWeather(m);
  },
  // Allied Barracks: a squat, half-sunk concrete blockhouse with a hipped armour roof, firing slits, a heavy door with a
  // team-colour plate, a sandbagged parade yard in front, vents, an antenna and the flag pole at (44, 3).
  barracks_allies(pal) {
    const m = new VModel(-2, -2, 54, 50, 34);
    tsPlinth(m, 0, 0, 48, 48, 1);
    tsSandbags(m, 2, 36, 46, 47, 3, true);
    m.clear(20, 43, 0, 28, 47, 4); m.box(20, 43, 0, 28, 47, 1, TSC.pad, M_ROUGH);
    tsBatter(m, 5, 6, 43, 34, 1, 6, 3);
    tsConc(m, 5, 6, 7, 43, 34, 15);
    tsBand(m, 5, 6, 43, 34, 12, 15, pal);
    m.box(4, 5, 15, 44, 35, 16, TSC.concD, M_ROUGH);
    tsHipRoof(m, 5, 6, 43, 34, 16, 6, TSC.steel);
    tsWinY(m, 7, 18, 33, 9, 10, 4); tsWinY(m, 31, 42, 33, 9, 10, 4); tsWinX(m, 42, 9, 31, 9, 10, 4);
    // the door: a porch block sticking out, a steel door, the team plate over it
    tsConc(m, 18, 33, 1, 30, 37, 13);
    m.box(17, 32, 13, 31, 38, 14, TSC.concD, M_ROUGH);
    m.box(21, 36, 1, 27, 37, 10, TSC.steelD, M_METAL);
    m.paint(21, 36, 1, 27, 37, 10, (x, y, z) => (z % 3 === 0 || x === 24 ? TSC.black : undefined));
    m.box(20, 36, 10, 28, 37, 12, pal.main, M_METAL);
    tsFlood(m, 18, 37, 11); tsFlood(m, 29, 37, 11);
    tsVent(m, 12, 12, 19, 4, 4, 2); tsVent(m, 32, 12, 19, 4, 4, 2);
    tsMast(m, 10, 9, 16, 30);
    m.box(44, 3, 1, 45, 4, 30, C.steel, M_METAL);   // flag pole (art.js FLAG_SPOTS)
    for (const [x, y] of [[4, 40], [40, 39]]) tsPlate(m, x, y, 1, x + 4, y + 3, 4, TSC.olive);   // crates
    return tsWeather(m);
  },
  // Soviet Barracks: a precast blockhouse with a stepped parapet, a red band, slit windows, the door under a concrete
  // hood (the banner rod at the old place: y 43, z 16), a small watch post on the roof, sandbags.
  barracks_soviets(pal) {
    const m = new VModel(-2, -2, 54, 50, 34);
    tsPlinth(m, 0, 0, 48, 48, 1);
    tsBatter(m, 4, 6, 44, 43, 1, 5, 3, '#6a675e');
    tsConc(m, 4, 6, 6, 44, 44, 18, '#7f7c72', 8);
    tsBand(m, 4, 6, 44, 44, 14, 17, pal);
    m.box(3, 5, 18, 45, 45, 19, '#66635a', M_ROUGH);
    m.box(5, 7, 19, 43, 43, 20, TSC.tar, M_ROUGH);
    for (let x = 3; x < 45; x++) for (const y of [5, 44]) if (x % 4 < 2) m.set(x, y, 19, '#7f7c72', M_ROUGH);   // crenellated parapet
    for (let y = 5; y < 45; y++) for (const x of [3, 44]) if (y % 4 < 2) m.set(x, y, 19, '#7f7c72', M_ROUGH);
    tsWinY(m, 6, 18, 43, 10, 11, 3); tsWinY(m, 30, 42, 43, 10, 11, 3); tsWinX(m, 43, 9, 40, 10, 11, 3);
    m.clear(19, 42, 1, 29, 44, 10); m.box(19, 42, 1, 29, 43, 10, TSC.oliveD, M_METAL);
    m.paint(19, 42, 1, 29, 43, 10, (x, y, z) => (z % 2 ? TSC.olive : undefined));
    m.box(17, 43, 10, 31, 46, 12, '#6a675e', M_ROUGH);                                    // door hood
    bannersV(m, 'barracks');
    // watch post on the roof
    tsConc(m, 8, 9, 20, 18, 19, 26, '#7f7c72', 8);
    tsWinY(m, 9, 17, 18, 23, 24, 3); tsWinX(m, 17, 10, 18, 23, 24, 3);
    m.box(7, 8, 26, 19, 20, 27, '#66635a', M_ROUGH);
    tsMast(m, 9, 10, 27, 33);
    starTop(m, 31, 25, 7, pal.main);
    tsVent(m, 34, 34, 20, 4, 4, 2); tsFan(m, 38, 12, 20, 2.5);
    tsPipeX(m, 20, 42, 41, 20.5, 1);
    for (const x of [6, 34]) tsSandbags(m, x, 45, x + 8, 48, 3);
    tsFlood(m, 16, 44, 12);
    return tsWeather(m);
  },
  // Allied War Factory: a big hall with a saw-tooth roof (glazed steps facing south), concrete walls with pilasters,
  // a team band, the big door (x 20-52, art.js rolls it up: factoryDoor) in an armoured frame with hazard jambs, an
  // office annex on the east end, a travelling crane rail and two exhaust stacks on the roof.
  factory_allies(pal) {
    const m = new VModel(-2, -2, 74, 50, 40);
    tsPlinth(m, 0, 0, 72, 48, 2);
    tsBatter(m, 2, 3, 70, 44, 2, 4, 2);
    tsConc(m, 2, 3, 6, 70, 45, 20, TSC.conc, 12);
    for (let x = 2; x < 70; x += 12) tsConc(m, x, 44, 2, x + 2, 46, 21, TSC.concD);        // pilasters
    tsBand(m, 2, 3, 70, 45, 17, 20, pal);
    m.box(1, 2, 20, 71, 46, 21, TSC.concD, M_ROUGH);
    for (let k = 0; k < 4; k++) {                                                          // saw-tooth roof
      const y0 = 4 + k * 10;
      for (let y = y0; y < y0 + 10 && y < 45; y++) tsRibbed(m, 3, y, 21, 69, y + 1, 21 + Math.round((y - y0) * 0.6), '#4f5455', 'x');
      m.box(3, y0 + 9, 23, 69, y0 + 10, 27, TSC.glass, M_GLASS);
      m.paint(3, y0 + 9, 23, 69, y0 + 10, 27, (x, y, z) => (x % 4 === 0 || z === 26 ? TSC.steelD : undefined));
    }
    tsRail(m, 2, 3, 70, 45, 21);
    // the door (x 20-52, y 44-46, z 1-16) in an armoured frame
    m.clear(20, 43, 1, 52, 47, 16);
    m.box(20, 44, 1, 52, 45, 16, '#34342f', M_METAL);
    m.paint(20, 44, 1, 52, 45, 16, (x, y, z) => (z % 2 ? '#26261f' : undefined));
    tsHazard(m, 18, 44, 2, 20, 47, 17); tsHazard(m, 52, 44, 2, 54, 47, 17);
    tsPlate(m, 17, 44, 16, 55, 47, 19, TSC.steelD);
    m.box(26, 46, 16, 46, 47, 18, pal.main, M_METAL);
    m.box(20, 46, 0, 52, 48, 1, TSC.padD, M_ROUGH);
    // office annex, east end
    tsConc(m, 56, 30, 2, 70, 44, 14);
    tsWinY(m, 57, 70, 43, 8, 11, 3); tsWinX(m, 69, 31, 43, 8, 11, 3);
    tsBand(m, 56, 30, 70, 44, 5, 6, pal);
    // stacks and a crane rail on the roof
    for (const [x, y, h] of [[62, 9, 36], [66, 9, 34]]) { tsPipeZ(m, x, y, 24, h, 1.8, TSC.steel); m.cylZ(x, y, h - 1, h, 2.2, TSC.black, M_METAL); }
    tsVent(m, 10, 6, 27, 4, 3, 2); tsVent(m, 40, 16, 27, 4, 3, 2); tsFan(m, 26, 36, 25, 2.5);
    tsLadder(m, 70, 8, 3, 21, 'x');
    tsFlood(m, 3, 45, 17); tsFlood(m, 55, 47, 18);
    return tsWeather(m);
  },
  // Soviet War Factory: a massive hall under a rusted barrel-vault roof, precast end walls with deep pilasters, red
  // bands, the big door (x 20-52) under a star plate, banner rods (y 45, z 22), two tall banded stacks at the back.
  factory_soviets(pal) {
    const m = new VModel(-2, -2, 74, 50, 44);
    tsPlinth(m, 0, 0, 72, 48, 2);
    tsBatter(m, 2, 4, 70, 44, 2, 5, 2, '#6a675e');
    tsConc(m, 2, 4, 7, 70, 46, 22, '#7f7c72', 8);
    for (const x of [2, 14, 56, 68]) tsConc(m, x, 44, 2, x + 2, 47, 23, '#6a675e');
    tsBand(m, 2, 4, 70, 46, 18, 21, pal);
    m.box(1, 3, 22, 71, 47, 23, '#66635a', M_ROUGH);
    for (let y = 5; y < 45; y++) {                                                         // barrel vault, corrugated, rusting
      const h = Math.round(Math.sqrt(Math.max(0, 21 * 21 - (y + 0.5 - 25) ** 2)) * 0.42);
      if (h > 0) m.box(4, y, 23, 68, y + 1, 23 + h, (y % 2 ? TSC.rust : TSC.rustD), M_METAL);
    }
    m.paint(4, 5, 23, 68, 45, 33, (x, y, z) => (x % 10 === 4 ? TSC.steelD : hash3(x, y, z) > 0.8 ? '#7a4e30' : undefined));
    for (const x of [4, 67]) for (let y = 5; y < 45; y++) { const h = Math.round(Math.sqrt(Math.max(0, 21 * 21 - (y + 0.5 - 25) ** 2)) * 0.42); if (h > 0) m.box(x, y, 23, x + 1, y + 1, 24 + h, '#7f7c72', M_ROUGH); }
    tsWinY(m, 3, 14, 45, 12, 15, 3); tsWinY(m, 57, 68, 45, 12, 15, 3);
    m.clear(20, 43, 1, 52, 47, 16);
    m.box(20, 44, 1, 52, 45, 16, TSC.oliveD, M_METAL);
    m.paint(20, 44, 1, 52, 45, 16, (x, y, z) => (z % 2 ? TSC.olive : undefined));
    tsHazard(m, 18, 44, 2, 20, 47, 17); tsHazard(m, 52, 44, 2, 54, 47, 17);
    tsPlate(m, 17, 44, 16, 55, 47, 21, TSC.steelD);
    m.box(30, 46, 16, 42, 47, 21, pal.dark, M_METAL);
    starFront(m, 36, 46, 18.5, 2.4, C.yellow);
    m.box(20, 46, 0, 52, 48, 1, TSC.padD, M_ROUGH);
    bannersV(m, 'factory');
    for (const [x, y, h, r] of [[60, 8, 42, 2.8], [66, 8, 39, 2.4]]) stackV(m, x, y, 23, h, r, pal);
    tsPipeX(m, 4, 56, 4, 24, 1.3);
    tsFlood(m, 3, 47, 19); tsFlood(m, 67, 47, 19);
    return tsWeather(m);
  },
};
// Every structure not redesigned yet (the Soviet Power Plant and Refinery among them) gets the weathering pass, strong.
const lookStructs = (() => {
  const types = new Set(Object.keys(STRUCTURES)), atLoad = LOOK.structs;
  for (const type of types) {
    const old = STRUCTURES[type];
    STRUCTURES[type] = (pal, faction, cameo) => {
      if (!LOOK.structs) return old(pal, faction, cameo);
      const own = TS_MODELS[type + '_' + (faction === 'soviets' ? 'soviets' : 'allies')];
      return own ? own(pal, cameo) : tsWeather(old(pal, faction, cameo), true);
    };
  }
  const isS = (k) => k[0] === 'S' && [...types].some((t) => k.startsWith('S' + t) && /^(allies|soviets)/.test(k.slice(1 + t.length)));
  // The baked sheets hold the earlier structures: while the look's are on (from the start), refuse those pictures.
  if (atLoad) {
    const set0 = spriteCache2.set.bind(spriteCache2), any0 = spriteAny.set.bind(spriteAny);
    // (HD sheets baked with these models, manifest `structs`, are kept: tools/bake-sprites.js --hd)
    const baked = (k, v) => v && v.img && typeof ImageBitmap !== 'undefined' && v.img instanceof ImageBitmap && isS(k)
      && !(v.img._k > 1 && SpriteSheets.manifest && SpriteSheets.manifest.structs);
    spriteCache2.set = (k, v) => (baked(k, v) ? spriteCache2 : set0(k, v));
    spriteAny.set = (k, v) => (baked(k, v) ? spriteAny : any0(k, v));
  }
  // Switching in a running page (recorders): each state keeps its own models and sprites, swapped in and out.
  const stash = { true: null, false: null };
  function set(on) {
    if (LOOK.structs === on) return;
    const out = [];
    for (const M of [spriteCache2, spriteAny, modelCache]) { const e = []; for (const [k, v] of M) if (isS(k)) e.push([k, v]); for (const [k] of e) M.delete(k); out.push(e); }
    stash[LOOK.structs] = out;
    const back = stash[on];
    if (back) [spriteCache2, spriteAny, modelCache].forEach((M, i) => { for (const [k, v] of back[i]) M.set(k, v); });
    LOOK.structs = on;
    for (const c of [typeof lampCache !== 'undefined' && lampCache, typeof aliveCache !== 'undefined' && aliveCache, dmgSpotCache]) if (c) c.clear();
  }
  return { set };
})();
