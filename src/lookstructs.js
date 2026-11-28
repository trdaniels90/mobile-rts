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
  // Soviet Barracks in Red Alert 2's art style (owner, 2026-11-28: "Redesign the Soviets Barracks in red alert 2 art style";
  // an original design, nothing copied): a red brick drill hall on a battered concrete base, a steep steel roof with a red
  // ridge and dormer vents, a tall arched gateway (the door at the old place: x 19-29, y 42-44, z 1-10) under a gold star on a
  // red shield, white-painted window frames, a corner watchtower with a lit room and an onion dome with a spire, banner rods
  // at the old place (y 43, z 16), sandbag nests either side of the gate. Built with the fine kit (HD: a quarter pixel).
  barracks_soviets(pal) {
    const m = new VModel(-2, -2, 54, 50, 52);
    const brick = '#94402c', brickL = '#a8513a', brickD = '#73301f', mortar = '#b8ab96', conc = '#a8a294', concD = '#8a857a', concL = '#bdb8aa';
    const roof = '#454b4d', roofD = '#33383a', roofL = '#5e6567', red = pal.main, redD = pal.dark, gold = '#e0b23a', goldD = '#a87c1c', white = '#e8e4da';
    tsPlinth(m, 0, 0, 48, 48, 1);
    // the base: battered concrete, a lit top edge
    vfill(m, 3, 5, 1, 45, 45, 5, conc, M_ROUGH, (x, y, z) => { const o = (5 - z) * 0.35; return x > 3 + o - 0.35 && x < 45 - o + 0.35 && y > 5 + o - 0.35 && y < 45 - o + 0.35; });
    vpaint(m, 2, 4, 1, 46, 46, 5, (x, y, z) => (z > 4.6 ? concL : (z % 1.5) < 0.15 ? concD : undefined), true);
    // the hall: red brick, white quoins at the corners, a stone string course and cornice
    vfill(m, 5, 7, 5, 43, 44, 20, brick, M_ROUGH);
    vpaint(m, 4.5, 6.5, 5, 43.5, 44.5, 20, (x, y, z) => {
      const along = Math.abs(y - 44) < 0.4 || Math.abs(y - 7) < 0.4 ? x : y, row = Math.floor((z - 5) / 0.75), u = (along + (row % 2) * 0.75) % 1.5;
      const corner = (Math.abs(x - 5) < 1.6 || Math.abs(x - 43) < 1.6) && (Math.abs(y - 7) < 1.6 || Math.abs(y - 44) < 1.6);
      if (corner) return row % 2 ? concL : white;
      if (((z - 5) % 0.75) < 0.15 || u < 0.15) return mortar;
      const n = hash3(Math.floor((along + (row % 2) * 0.75) / 1.5), row, 9);
      return n > 0.8 ? brickL : n < 0.15 ? brickD : undefined;
    }, true);
    vfill(m, 4.6, 6.6, 12, 43.4, 44.4, 12.8, concL, M_ROUGH);                                  // string course
    vfill(m, 4.2, 6.2, 19.4, 43.8, 44.8, 20.6, concL, M_ROUGH);                                // cornice
    vpaint(m, 4, 6, 19.4, 44, 45, 20.6, (x, y, z) => (z < 19.7 ? concD : undefined), true);
    // windows: tall, arched, white frames, a few lit; front (y 44) and east side (x 43)
    const win = (cx, cy, face) => {
      for (const z0 of [7, 14]) {
        const lit = hash3(Math.round(cx), Math.round(cy), z0) > 0.55;
        if (face === 's') {
          vfill(m, cx - 1.6, cy - 0.3, z0 - 0.4, cx + 1.6, cy + 0.35, z0 + 4.4, white, M_MATTE, (x, y, z) => z < z0 + 3 || (x - cx) ** 2 + ((z - z0 - 3) * 1.4) ** 2 < 2.6);
          vfill(m, cx - 1.1, cy - 0.3, z0, cx + 1.1, cy + 0.45, z0 + 4, lit ? '#e6c878' : TSC.glass, lit ? M_GLOW : M_GLASS, (x, y, z) => z < z0 + 3 || (x - cx) ** 2 + ((z - z0 - 3) * 1.4) ** 2 < 1.2);
          vfill(m, cx - 0.12, cy - 0.3, z0, cx + 0.12, cy + 0.5, z0 + 4, white, M_MATTE);
          vfill(m, cx - 1.1, cy - 0.3, z0 + 1.7, cx + 1.1, cy + 0.5, z0 + 1.9, white, M_MATTE);
        } else {
          vfill(m, cx - 0.35, cy - 1.6, z0 - 0.4, cx + 0.3, cy + 1.6, z0 + 4.4, white, M_MATTE, (x, y, z) => z < z0 + 3 || (y - cy) ** 2 + ((z - z0 - 3) * 1.4) ** 2 < 2.6);
          vfill(m, cx - 0.45, cy - 1.1, z0, cx + 0.3, cy + 1.1, z0 + 4, lit ? '#e6c878' : TSC.glass, lit ? M_GLOW : M_GLASS, (x, y, z) => z < z0 + 3 || (y - cy) ** 2 + ((z - z0 - 3) * 1.4) ** 2 < 1.2);
          vfill(m, cx - 0.5, cy - 0.12, z0, cx + 0.3, cy + 0.12, z0 + 4, white, M_MATTE);
        }
      }
    };
    for (const x of [9, 14, 34, 39]) win(x, 44, 's');
    for (const y of [12, 18, 24, 30, 36]) win(43, y, 'e');
    // the roof: steep steel, ridge along x, standing seams, a red ridge cap, dormer vents
    for (let y = 6; y < 46; y += 0.25) {
      const h = Math.max(0, 12 - Math.abs(y - 25.5) * 0.62);
      vfill(m, 4, y, 20, 44, y + 0.25, 20.6 + h, roof, M_METAL);
    }
    vpaint(m, 3.5, 5.5, 20, 44.5, 46.5, 34, (x, y, z) => (((x + 20) % 1.5) < 0.22 ? roofD : z > 31.6 ? red : (z < 21.2 ? roofL : undefined)), true);
    vfill(m, 4, 25, 31.8, 44, 26, 33, red, M_METAL);
    for (const x of [12, 24, 36]) {   // dormer vents on the front slope
      vfill(m, x - 1.8, 33, 22, x + 1.8, 38, 27, concL, M_ROUGH, (xx, yy, zz) => zz < 27 - (yy - 33) * 0 && zz < 20.6 + Math.max(0, 12 - Math.abs(yy - 25.5) * 0.62) + 2.6);
      vfill(m, x - 1.4, 37.6, 22.5, x + 1.4, 38.2, 25.6, '#22262a', M_METAL);
      vpaint(m, x - 1.4, 37.5, 22.5, x + 1.4, 38.3, 25.6, (xx, yy, zz) => ((zz % 0.6) < 0.25 ? roofL : undefined), true);
      vfill(m, x - 2.2, 32.5, 27, x + 2.2, 38.6, 27.6, redD, M_METAL);
    }
    // the gateway: a tall round arch in a stone surround, the door inside it, a gold star on a red shield above
    vfill(m, 16, 43.5, 1, 32, 46.2, 18, concL, M_ROUGH, (x, y, z) => z < 13 || (x - 24) ** 2 + ((z - 13) * 1.25) ** 2 < 64);
    vpaint(m, 16, 43.5, 1, 32, 46.4, 18, (x, y, z) => (((z % 1.8) < 0.18) || (Math.abs(x - 24) > 6.2 && ((x - 16) % 3) < 0.18) ? concD : undefined), true);
    m.clear(19, 42, 1, 29, 47, 13);
    vfill(m, 19, 42, 1, 29, 47, 15, null, 0, (x, y, z) => z < 10 || (x - 24) ** 2 + ((z - 10) * 1.2) ** 2 < 25);
    vfill(m, 19, 42, 1, 29, 43.2, 15, '#2a1d16', M_MATTE, (x, y, z) => z < 10 || (x - 24) ** 2 + ((z - 10) * 1.2) ** 2 < 25);   // the dark hall within
    vfill(m, 19.4, 43, 1, 28.6, 43.6, 10, TSC.oliveD, M_METAL);                                                                     // the door
    vpaint(m, 19.4, 42.9, 1, 28.6, 43.7, 10, (x, y, z) => (Math.abs(x - 24) < 0.15 || (z % 1) < 0.18 ? '#2c301e' : undefined), true);
    for (const x of [20.5, 27.5]) vfill(m, x - 0.25, 43.5, 4.8, x + 0.25, 43.8, 5.3, gold, M_METAL);                                  // handles
    vfill(m, 20.5, 46, 13.4, 27.5, 46.8, 19.6, red, M_METAL, (x, y, z) => z > 15 || Math.abs(x - 24) < (z - 13.4) * 2.2);         // the shield
    vpaint(m, 20.5, 46.5, 13.4, 27.5, 47, 19.6, (x, y, z) => {
      const dx = x - 24, dz = z - 17, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx) - Math.PI / 2, k = Math.abs(((a / (Math.PI * 2 / 5)) % 1 + 1) % 1 - 0.5) * 2;
      return r < 2.1 * (0.4 + 0.6 * k * k) ? gold : r < 2.5 * (0.4 + 0.6 * k * k) ? goldD : undefined;
    }, true);
    vfill(m, 19, 46.6, 19.6, 29, 47, 20, gold, M_METAL);
    for (const x of [18.4, 29.6]) { vcyl(m, 'y', 45.5, 47.2, x, 16, 0.5, '#2a2c2e', M_METAL); vcyl(m, 'y', 47.2, 47.5, x, 16, 0.42, '#ffe3a0', M_GLOW); }   // gate lamps
    bannersV(m, 'barracks');
    // the watchtower on the north-west corner: brick, a lit room with a balcony, an onion dome and spire
    vfill(m, 4, 6, 5, 13, 15, 36, brick, M_ROUGH);
    vpaint(m, 3.5, 5.5, 5, 13.5, 15.5, 36, (x, y, z) => { const row = Math.floor(z / 0.75), u = ((x + y) + (row % 2) * 0.75) % 1.5; return ((z % 0.75) < 0.15 || u < 0.15) ? mortar : undefined; }, true);
    vfill(m, 3.4, 5.4, 30, 13.6, 15.6, 31, concL, M_ROUGH);
    vfill(m, 4.4, 6.4, 31, 12.6, 14.6, 35.4, '#e6c878', M_GLOW);
    for (const k of [5, 7.7, 10.4]) { vfill(m, k - 0.3 + 0.5, 14.4, 31, k + 0.3 + 0.5, 14.7, 35.4, white, M_MATTE); vfill(m, 12.4, k + 1, 31, 12.7, k + 1.6, 35.4, white, M_MATTE); }
    vfill(m, 3, 5, 35.4, 14, 16, 36.4, concL, M_ROUGH);
    vfill(m, 2.6, 4.6, 30.9, 14.4, 16.4, 31.2, '#2a2c2e', M_METAL);   // balcony rail
    for (let k = 3; k < 14.5; k += 1.2) for (const [x, y] of [[k, 16.2], [14.2, k + 1.5]]) vfill(m, x - 0.08, y - 0.08, 31.2, x + 0.08, y + 0.08, 32.6, '#2a2c2e', M_METAL);
    vfill(m, 2.6, 16.1, 32.5, 14.4, 16.3, 32.7, '#2a2c2e', M_METAL); vfill(m, 14.1, 4.6, 32.5, 14.3, 16.4, 32.7, '#2a2c2e', M_METAL);
    vfill(m, 4, 6, 36.4, 13, 15, 44, red, M_METAL, (x, y, z) => { const t = (z - 36.4) / 7.6, r = 4.5 * Math.sin(Math.PI * Math.min(1, t * 1.25 + 0.15)) * (1 - t * 0.55); return (x - 8.5) ** 2 + (y - 10.5) ** 2 < r * r; });
    vpaint(m, 3.5, 5.5, 36.4, 13.5, 15.5, 44, (x, y, z) => (((Math.atan2(y - 10.5, x - 8.5) + 7) % 0.8) < 0.12 ? redD : undefined), true);
    vcyl(m, 'z', 43.5, 50, 8.5, 10.5, 0.22, gold, M_METAL);
    vcyl(m, 'z', 46, 46.6, 8.5, 10.5, 0.55, gold, M_METAL);
    vfill(m, 8.2, 10.2, 49.8, 8.8, 10.8, 50.4, '#ff3a28', M_GLOW);
    // sandbag nests either side of the gate, a crate stack, a floodlight
    for (const x of [6, 34]) tsSandbags(m, x, 45, x + 8, 48, 3);
    for (const [x, y, h] of [[38.5, 46.2, 2], [40.6, 46.2, 2], [39.5, 46.2, 4]]) vfill(m, x - 1, y - 1, h - 2, x + 1, y + 1, h, '#5a4a30', M_ROUGH);
    tsFlood(m, 16, 44, 12);
    m.ra2 = true; m.dressed = true;
    return vweather(m, 4, 0.6, '#6a5d4a');
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
  // Soviet War Factory at Red Alert 2 detail (2026-11-28; owner: "try to get exactly to Red Alert 2's detail"), built with
  // the fine kit (models.js vfill and friends, a quarter pixel in HD graphics). The same massive hall as before (the TS
  // design): precast concrete walls on a brick base course with pilasters, a red band, a corrugated barrel-vault roof
  // (ribs, arched trusses, a glazed ridge, rust, turbine vents, a catwalk), the big door (x 20-52, y 44-46, z 1-16:
  // art.js rolls it up, models.js factoryDoor) in an I-beam frame with fine hazard stripes, lamps and beacons, a star
  // plate over it, banner rods (y 45, z 22), lit factory windows with mullions, a round window in the east gable, a pipe
  // run with valves and a transformer on the east side, two banded stacks (60, 8) and (66, 8), chevrons on the apron.
  factory_soviets(pal) {
    const m = new VModel(-2, -2, 74, 50, 44);
    const conc = '#827e73', concL = '#948f83', concD = '#6a675e', joint = '#55524b', brick = '#7a3b2c', brickL = '#8e4a37', mortar = '#a59d8c';
    const red = pal.main, redD = pal.dark, steel = TSC.steel, steelD = TSC.steelD, steelL = TSC.steelL;
    // the plinth: a concrete apron with kerbs, joints, oil, and chevrons leading out of the door
    tsPlinth(m, 0, 0, 72, 48, 2);
    vpaint(m, 18, 46, 1, 54, 48, 2.1, (x, y) => {
      const c = Math.abs(x - 36) < 15 && ((Math.floor(Math.abs(x - 36) * 0.5 - (y - 46) * 0.9) % 2 + 2) % 2 === 0);
      return c ? (Math.abs(x - 36) < 1.5 ? undefined : TSC.hazard) : undefined;
    }, true);
    // the walls: a brick base course, precast panels above, pilasters, a band in the side's colour, a cornice
    vfill(m, 1.5, 3.5, 2, 70.5, 46.5, 7, brick, M_ROUGH);
    vpaint(m, 1, 3, 2, 71, 47, 7, (x, y, z) => {
      const row = Math.floor((z - 2) / 0.5), off = row % 2 ? 0.5 : 0, u = (x + y + off) % 1;
      if ((z - 2) % 0.5 < 0.13 || u < 0.13) return mortar;
      if (hash3(Math.floor(x + y + off), row, 5) > 0.7) return brickL;
    }, true);
    vfill(m, 2, 4, 7, 70, 46, 22, conc, M_ROUGH);
    vpaint(m, 1, 3, 7, 71, 47, 22, (x, y, z) => {
      const along = Math.abs(y - 46) < 0.3 || Math.abs(y - 4) < 0.3 ? x : y;
      if (Math.abs((z - 7) % 5) < 0.14 || Math.abs((along % 6)) < 0.14) return joint;   // panel joints
      const n = hash3(Math.floor(x * 2), Math.floor(y * 2), Math.floor(z * 2));
      if (n > 0.93) return concL; if (n < 0.05) return concD;
    }, true);
    for (const x of [2, 14, 56, 68]) {
      vfill(m, x, 44, 2, x + 2, 47, 23, concD, M_ROUGH);
      vfill(m, x - 0.25, 43.75, 22.5, x + 2.25, 47.25, 23.5, concL, M_ROUGH);
    }
    for (const y of [4, 16, 28, 40]) vfill(m, 70, y, 2, 71, y + 2, 22.5, concD, M_ROUGH);   // east-side pilasters
    vfill(m, 1.6, 3.6, 18, 70.4, 46.4, 21, red, M_METAL);
    vfill(m, 1.6, 3.6, 18, 70.4, 46.4, 18.4, redD, M_METAL);
    vpaint(m, 1, 3, 19.2, 71, 47, 19.7, () => C.white, true);
    vfill(m, 1, 3, 22, 71, 47, 23, '#66635a', M_ROUGH);
    // factory windows: steel-framed panes, some lit, under the band on the front and the east side
    const pane = (u, z) => (hash3(Math.floor(u), z < 13 ? 0 : 1, 7) > 0.7 ? '#d8bd72' : Math.abs(z - 15.4) < 0.4 || Math.abs(z - 12.4) < 0.4 ? TSC.glassL : TSC.glass);   // whole panes: a few lit, a lighter top
    for (const [x0, x1] of [[4, 13.6], [57, 67.6]]) vfill(m, x0, 46, 10, x1, 46.3, 16, TSC.glass, M_GLASS);
    vpaint(m, 3.5, 45.9, 10, 68, 46.4, 16, (x, y, z) => (((x + 20) % 1.6) < 0.3 || Math.abs(z - 13) < 0.15 ? steelD : pane(x / 1.6, z)), true);
    for (const y0 of [6, 30]) { vfill(m, 70, y0, 10, 70.3, y0 + 10, 16, TSC.glass, M_GLASS); vpaint(m, 69.9, y0, 10, 70.4, y0 + 10, 16, (x, y, z) => (((y + 20) % 1.6) < 0.3 || Math.abs(z - 13) < 0.15 ? steelD : pane(y / 1.6, z)), true); }
    // the roof: a corrugated barrel vault with arched trusses, rust, a glazed ridge and a catwalk
    const vault = (y) => Math.sqrt(Math.max(0, 21 * 21 - (y - 25) ** 2)) * 0.42;
    vfill(m, 4, 4.5, 23, 68, 45.5, 33, TSC.rust, M_METAL, (x, y, z) => z - 23 <= vault(y));
    vpaint(m, 4, 4, 23, 68, 46, 33, (x, y, z) => {
      if (Math.abs(x - 36) < 1.2 && z > 31) return undefined;
      if (((x - 4) % 8) < 0.5) return steelD;                                       // trusses
      const rib = ((y + 20) % 0.75) < 0.3, rust = hash3(Math.floor(x / 3), Math.floor(y / 2), 9) > 0.62;
      if (rust) return rib ? '#5a3220' : '#8a5634';
      return rib ? TSC.rustD : '#7a6650';
    }, true);
    vfill(m, 4, 22.8, 31.5, 68, 27.2, 33.6, TSC.glass, M_GLASS, (x, y, z) => z - 23 <= vault(y) + 0.9);
    vpaint(m, 4, 22, 31, 68, 28, 34, (x, y, z, c, mt) => (mt === M_GLASS && ((x + 20) % 2) < 0.35 ? steelD : undefined), true);
    for (const x of [4, 67]) vfill(m, x, 4.5, 23, x + 1, 45.5, 34, concD, M_ROUGH, (xx, y, z) => z - 23 <= vault(y) + 0.8);   // gable copings
    for (let x = 6; x < 66; x += 2) vfill(m, x, 20.5, 32.6, x + 0.25, 20.75, 34, steelL, M_METAL);   // catwalk rail posts
    vfill(m, 5, 20.3, 33.6, 66, 20.8, 33.9, steelL, M_METAL);
    vfill(m, 5, 18.6, 32, 66, 20.6, 32.4, steelD, M_METAL);
    for (const [x, y] of [[12, 12], [28, 12], [44, 12], [12, 37], [28, 37], [52, 37]]) {     // turbine vents
      const z = 23 + vault(y) - 0.4;
      vcyl(m, 'z', z, z + 1.2, x, y, 1.3, steel, M_METAL);
      vfill(m, x - 1.5, y - 1.5, z + 1.2, x + 1.5, y + 1.5, z + 2.6, steelL, M_METAL, (xx, yy, zz) => ((xx - x) ** 2 + (yy - y) ** 2) / 2.2 + ((zz - z - 1.2) / 1.4) ** 2 <= 1 && ((Math.atan2(yy - y, xx - x) + 7) % 0.7) < 0.45);
    }
    // the east gable: a round window with a star, a ladder
    vfill(m, 70.8, 18, 25, 71.3, 32, 39, steel, M_METAL, (x, y, z) => (y - 25) ** 2 + (z - 31) ** 2 <= 16);
    vfill(m, 71, 18, 25, 71.6, 32, 39, TSC.glassL, M_GLASS, (x, y, z) => (y - 25) ** 2 + (z - 31) ** 2 <= 10.2);
    vpaint(m, 71, 21, 27, 72, 29, 35, (x, y, z) => { const r = Math.hypot(y - 25, z - 31), a = Math.atan2(z - 31, y - 25) - Math.PI / 2, k = Math.abs(((a / (Math.PI * 2 / 5)) % 1 + 1) % 1 - 0.5) * 2; return r < 2.6 * (0.4 + 0.6 * k * k) ? red : undefined; }, true);
    tsLadder(m, 71, 42, 3, 23, 'x');
    // the big door: slatted, in an I-beam frame with fine hazard stripes, lamps, beacons, and a star plate above it
    m.clear(20, 43, 1, 52, 47, 16);
    vfill(m, 20, 44, 1, 52, 45, 16, TSC.oliveD, M_METAL);
    vpaint(m, 20, 44, 1, 52, 45.2, 16, (x, y, z) => (((z - 1) % 1) < 0.5 ? TSC.olive : ((z - 1) % 1) < 0.62 ? '#2c301e' : undefined), true);
    for (const x0 of [18, 52]) {
      vfill(m, x0, 44, 1, x0 + 2, 47, 17, steelD, M_METAL);
      vpaint(m, x0, 46.5, 1, x0 + 2, 47.1, 17, (x, y, z) => (((x + z) % 1) < 0.5 ? TSC.hazard : TSC.black), true);
      vrivets(m, x0 + 1, 47.05, 2, x0 + 1, 47.05, 16, 1.5, steelL, 0.2);
    }
    vfill(m, 17, 44, 16, 55, 47.2, 21.5, steelD, M_METAL);
    vpaint(m, 17, 47, 16, 55, 47.3, 17, (x, y, z) => (((x + z) % 1) < 0.5 ? TSC.hazard : TSC.black), true);
    vrivets(m, 17.6, 47.25, 20.9, 54.4, 47.25, 20.9, 1.4, steelL, 0.2);
    vfill(m, 29, 47.2, 16.8, 43, 47.7, 21, redD, M_METAL);
    vpaint(m, 29, 47.4, 16.8, 43, 48, 21, (x, y, z) => { const dx = x - 36, dz = z - 18.9, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx) - Math.PI / 2, k = Math.abs(((a / (Math.PI * 2 / 5)) % 1 + 1) % 1 - 0.5) * 2; return r < 2.1 * (0.4 + 0.6 * k * k) ? C.yellow : r < 2.4 * (0.4 + 0.6 * k * k) ? '#7a5a10' : undefined; }, true);
    for (const x of [21, 50]) { vfill(m, x, 47, 21.5, x + 1, 47.8, 22.5, steel, M_METAL); vcyl(m, 'z', 22.5, 23.3, x + 0.5, 47.4, 0.42, '#ff8a2a', M_GLOW); }   // beacons
    for (const x of [24, 47]) { vfill(m, x, 47, 16.4, x + 1.2, 48, 17.2, steel, M_METAL); vfill(m, x + 0.1, 47.95, 16.5, x + 1.1, 48.1, 17, '#fff0c0', M_GLOW); }   // door lamps
    vfill(m, 20, 46, 0, 52, 48, 1, TSC.padD, M_ROUGH);
    bannersV(m, 'factory');
    // stacks: concrete, banded red and white near the top, ladder rings, dark caps
    for (const [x, y, h, r] of [[60, 8, 42, 2.8], [66, 8, 39, 2.4]]) {
      stackV(m, x, y, 23, h, r, pal);
      for (let z = 25; z < h - 15; z += 3) vcyl(m, 'z', z, z + 0.3, x, y, r + 0.25, concD, M_ROUGH);
      for (let z = 24; z < h - 1; z += 0.8) vfill(m, x - 0.5, y - r - 0.7, z, x + 0.5, y - r + 0.1, z + 0.22, steelL, M_METAL);
    }
    // a pipe run along the east wall with flanges and valve wheels, into the ground; a transformer on its pad
    vcyl(m, 'y', 5, 44, 71.6, 8, 0.8, TSC.pipe, M_METAL);
    for (let y = 7; y < 44; y += 4) vcyl(m, 'y', y, y + 0.4, 71.6, 8, 1.15, steelD, M_METAL);
    vcyl(m, 'z', 1, 8, 71.6, 44, 0.8, TSC.pipe, M_METAL);
    for (const y of [14, 34]) { vcyl(m, 'x', 72.4, 72.8, y, 8, 0.9, TSC.red, M_METAL); vcyl(m, 'x', 72.2, 72.8, y, 8, 0.4, TSC.red, M_METAL); }
    vfill(m, 61, 2.5, 22.8, 66, 6, 26, steelD, M_METAL);
    for (const x of [62, 64]) { vcyl(m, 'z', 26, 27.6, x, 4.2, 0.4, '#8b6b4a', M_MATTE); vcyl(m, 'z', 27.6, 28, x, 4.2, 0.55, '#8b6b4a', M_MATTE); }
    tsFlood(m, 3, 47, 19); tsFlood(m, 67, 47, 19);
    m.ra2 = true;
    return vweather(m, 5, 0.75, '#6a5d4a');
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
