'use strict';
// Procedural pixel art: terrain, ore, structures, units, effects and sidebar cameos.
// Everything is drawn at 1 world pixel = 1 canvas pixel, then scaled up with nearest-neighbour filtering.

function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const shadeCache = new Map();
function shade(hex, f) {
  const key = hex + f;
  let v = shadeCache.get(key);
  if (v) return v;
  const [r, g, b] = hex2rgb(hex);
  const t = f < 0 ? 0 : 255, k = Math.abs(f);
  v = `rgb(${Math.round(r + (t - r) * k)},${Math.round(g + (t - g) * k)},${Math.round(b + (t - b) * k)})`;
  shadeCache.set(key, v);
  return v;
}
// Adds per-pixel noise so flat fills read as worn paint and concrete.
function grit(c, amt, seed) {
  const g = c.getContext('2d'), img = g.getImageData(0, 0, c.width, c.height), d = img.data, r = rng(seed || 99);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const n = (r() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------
const TERRAIN_MINI = ['#56652f', '#7a6644', '#2d4620', '#6f6b62', '#2a4664'];

function paintTerrain(terr, seed) {
  const c = mkCanvas(WORLD, WORLD), g = c.getContext('2d');
  const img = g.createImageData(WORLD, WORLD), d = img.data;
  const r = rng(seed);

  // Cell-centre fields, sampled bilinearly so dirt and shorelines blend across cells.
  const dirt = new Float32Array(NCELLS), water = new Float32Array(NCELLS);
  for (let i = 0; i < NCELLS; i++) { dirt[i] = terr[i] === 1 ? 1 : 0; water[i] = terr[i] === 4 ? 1 : 0; }
  // Cells with dirt or water nearby; everywhere else skips the blending work.
  const nearFlag = new Uint8Array(NCELLS);
  for (let cy = 0; cy < MAP; cy++) for (let cx = 0; cx < MAP; cx++) {
    let f = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const x = cx + ox, y = cy + oy;
      if (x < 0 || y < 0 || x >= MAP || y >= MAP) continue;
      if (dirt[y * MAP + x]) f |= 1;
      if (water[y * MAP + x]) f |= 2;
    }
    nearFlag[cy * MAP + cx] = f;
  }
  const NG = 12, GW = Math.ceil(WORLD / NG) + 2;
  const n1 = new Float32Array(GW * GW); for (let i = 0; i < n1.length; i++) n1[i] = r();
  const NG2 = 48, GW2 = Math.ceil(WORLD / NG2) + 2;
  const n2 = new Float32Array(GW2 * GW2); for (let i = 0; i < n2.length; i++) n2[i] = r();
  const sm = (t) => t * t * (3 - 2 * t);
  function bil(arr, w, fx, fy) {
    const x0 = Math.max(0, Math.min(w - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(w - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
    const a = arr[y0 * w + x0], b = arr[y0 * w + x0 + 1], cc = arr[(y0 + 1) * w + x0], dd = arr[(y0 + 1) * w + x0 + 1];
    return (a + (b - a) * tx) * (1 - ty) + (cc + (dd - cc) * tx) * ty;
  }
  function noiseAt(arr, w, s, x, y) {
    const fx = x / s, fy = y / s, x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = sm(fx - x0), ty = sm(fy - y0);
    const a = arr[y0 * w + x0], b = arr[y0 * w + x0 + 1], cc = arr[(y0 + 1) * w + x0], dd = arr[(y0 + 1) * w + x0 + 1];
    return (a + (b - a) * tx) * (1 - ty) + (cc + (dd - cc) * tx) * ty;
  }
  const GD = [66, 80, 36], GL = [104, 117, 52], DD = [102, 84, 54], DL = [140, 117, 78], SAND = [146, 132, 92], WD = [32, 54, 76], WL = [58, 88, 112];
  let p = 0;
  for (let y = 0; y < WORLD; y++) {
    const fy = y / CELL - 0.5;
    for (let x = 0; x < WORLD; x++, p += 4) {
      const fx = x / CELL - 0.5;
      let n = noiseAt(n1, GW, NG, x, y) * 0.45 + noiseAt(n2, GW2, NG2, x, y) * 0.55;
      const sp = r();
      n += (sp - 0.5) * 0.28;
      let R = GD[0] + (GL[0] - GD[0]) * n, Gc = GD[1] + (GL[1] - GD[1]) * n, B = GD[2] + (GL[2] - GD[2]) * n;
      if (sp > 0.985) { R += 18; Gc += 22; B += 6; }           // bright grass blades
      const near = nearFlag[Math.min(MAP - 1, Math.max(0, Math.round(fy))) * MAP + Math.min(MAP - 1, Math.max(0, Math.round(fx)))];
      const dv = near & 1 ? bil(dirt, MAP, fx, fy) : 0;
      if (dv > 0.2) {
        const k = Math.min(1, (dv - 0.2) / 0.35) * (0.75 + n * 0.3);
        R += (DD[0] + (DL[0] - DD[0]) * n - R) * k; Gc += (DD[1] + (DL[1] - DD[1]) * n - Gc) * k; B += (DD[2] + (DL[2] - DD[2]) * n - B) * k;
      }
      const wv = near & 2 ? bil(water, MAP, fx, fy) + (n - 0.5) * 0.18 : 0;
      if (wv > 0.5) {
        const ripple = ((x + Math.floor(y * 0.5)) % 23 === 0 && sp > 0.4) ? 0.5 : 0;
        const k = Math.min(1, n * 0.8 + ripple);
        R = WD[0] + (WL[0] - WD[0]) * k; Gc = WD[1] + (WL[1] - WD[1]) * k; B = WD[2] + (WL[2] - WD[2]) * k;
        if (wv < 0.56) { R += 22; Gc += 26; B += 22; }        // foam line at the shore
      } else if (wv > 0.36) {
        R = SAND[0] + (n - 0.5) * 30; Gc = SAND[1] + (n - 0.5) * 30; B = SAND[2] + (n - 0.5) * 24;
      }
      d[p] = R; d[p + 1] = Gc; d[p + 2] = B; d[p + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  // Scenery stamps, back to front.
  const stamps = [];
  for (let cy = 0; cy < MAP; cy++) {
    for (let cx = 0; cx < MAP; cx++) {
      const t = terr[cy * MAP + cx], x0 = cx * CELL, y0 = cy * CELL;
      if (t === 2) {
        const n = 1 + (r() < 0.55 ? 1 : 0);
        for (let i = 0; i < n; i++) stamps.push({ k: r() < 0.35 ? 'pine' : 'tree', x: x0 + 5 + r() * 14, y: y0 + 8 + r() * 14, s: 0.85 + r() * 0.35, v: r() });
      } else if (t === 3) {
        stamps.push({ k: 'rock', x: x0 + 12 + (r() - 0.5) * 6, y: y0 + 14 + (r() - 0.5) * 4, s: 0.9 + r() * 0.4, v: r() });
      } else if (t === 0 && r() < 0.05) {
        stamps.push({ k: r() < 0.5 ? 'bush' : 'pebbles', x: x0 + r() * CELL, y: y0 + r() * CELL, s: 0.7 + r() * 0.5, v: r() });
      }
    }
  }
  stamps.sort((a, b) => a.y - b.y);
  for (const s of stamps) drawScenery(g, s, r);
  return c;
}

function drawScenery(g, s, r) {
  const { x, y } = s;
  if (s.k === 'tree') {
    const k = s.s;
    g.fillStyle = 'rgba(0,0,0,0.32)';
    g.beginPath(); g.ellipse(x + 5 * k, y + 3, 10 * k, 6 * k, 0, 0, 7); g.fill();
    g.fillStyle = '#4a3420'; g.fillRect(Math.round(x - 1), Math.round(y - 3), 2, 5);
    const blobs = [[0, -9, 8], [-4, -7, 6], [4, -6, 6], [-1, -12, 5]];
    for (const [dx, dy, rr] of blobs) { g.fillStyle = '#263c17'; g.beginPath(); g.arc(x + dx * k, y + dy * k, rr * k, 0, 7); g.fill(); }
    for (const [dx, dy, rr] of blobs) { g.fillStyle = '#35511f'; g.beginPath(); g.arc(x + (dx - 1) * k, y + (dy - 1) * k, rr * 0.7 * k, 0, 7); g.fill(); }
    g.fillStyle = '#4f7030';
    for (let i = 0; i < 7; i++) g.fillRect(Math.round(x - 6 * k + r() * 8 * k), Math.round(y - 15 * k + r() * 8 * k), 1, 1);
  } else if (s.k === 'pine') {
    const k = s.s;
    g.fillStyle = 'rgba(0,0,0,0.32)';
    g.beginPath(); g.ellipse(x + 5 * k, y + 2, 8 * k, 4 * k, 0, 0, 7); g.fill();
    g.fillStyle = '#3e2c1a'; g.fillRect(Math.round(x - 1), Math.round(y - 2), 2, 4);
    for (let i = 0; i < 3; i++) {
      const w = (8 - i * 2) * k, ty = y - 4 - i * 5 * k;
      g.fillStyle = '#1f3517';
      g.beginPath(); g.moveTo(x - w, ty); g.lineTo(x + w, ty); g.lineTo(x, ty - 8 * k); g.closePath(); g.fill();
      g.fillStyle = '#2f4b20';
      g.beginPath(); g.moveTo(x - w, ty); g.lineTo(x, ty); g.lineTo(x, ty - 8 * k); g.closePath(); g.fill();
    }
  } else if (s.k === 'rock') {
    const k = s.s;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.ellipse(x + 4, y + 4, 12 * k, 6 * k, 0, 0, 7); g.fill();
    const pts = [[-11, 2], [-8, -7], [-1, -11], [8, -8], [12, 0], [7, 5], [-5, 6]];
    g.fillStyle = '#5a564e';
    g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo : g.moveTo).call(g, x + px * k, y + py * k)); g.closePath(); g.fill();
    g.fillStyle = '#7e796e';
    g.beginPath(); g.moveTo(x - 8 * k, y - 6 * k); g.lineTo(x - 1 * k, y - 10 * k); g.lineTo(x + 6 * k, y - 7 * k); g.lineTo(x + 1 * k, y - 1 * k); g.lineTo(x - 6 * k, y); g.closePath(); g.fill();
    g.fillStyle = '#9d978a'; g.fillRect(Math.round(x - 4 * k), Math.round(y - 8 * k), 3, 1);
    g.fillStyle = '#3f3c36'; g.fillRect(Math.round(x + 2 * k), Math.round(y + 2 * k), 6, 1);
  } else if (s.k === 'bush') {
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(Math.round(x), Math.round(y + 1), 5, 2);
    g.fillStyle = '#34501f'; g.fillRect(Math.round(x - 2), Math.round(y - 2), 5, 3);
    g.fillStyle = '#4b6c2b'; g.fillRect(Math.round(x - 1), Math.round(y - 3), 3, 2);
  } else {
    g.fillStyle = '#8a8476'; g.fillRect(Math.round(x), Math.round(y), 2, 1); g.fillRect(Math.round(x + 3), Math.round(y + 2), 1, 1);
    g.fillStyle = '#5c584f'; g.fillRect(Math.round(x), Math.round(y + 1), 2, 1);
  }
}

// Permanent marks burnt into the terrain canvas.
function scorch(tg, x, y, rad, seed) {
  const r = rng(seed);
  for (let i = 0; i < rad * 4; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad;
    tg.fillStyle = r() < 0.5 ? 'rgba(20,16,10,0.35)' : 'rgba(45,38,28,0.35)';
    tg.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d * 0.75), 2, 2);
  }
}
function rubble(tg, x, y, w, h, seed) {
  const r = rng(seed), cx = x + w / 2, cy = y + h / 2;
  for (let i = 0; i < (w * h) / 10; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    const px = cx + Math.cos(a) * d * w * 0.5, py = cy + Math.sin(a) * d * h * 0.5;
    tg.fillStyle = d < 0.6 ? 'rgba(28,24,20,0.35)' : 'rgba(40,34,26,0.2)';
    tg.fillRect(Math.round(px), Math.round(py), 3, 2);
  }
  for (let i = 0; i < (w * h) / 40; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.8;
    const px = cx + Math.cos(a) * d * w * 0.5, py = cy + Math.sin(a) * d * h * 0.5, s = 1 + Math.floor(r() * 2);
    tg.fillStyle = ['#6d6a62', '#4a4741', '#87837a', '#5e4a36'][Math.floor(r() * 4)];
    tg.fillRect(Math.round(px), Math.round(py), s + 1, s);
    tg.fillStyle = 'rgba(0,0,0,0.35)'; tg.fillRect(Math.round(px), Math.round(py) + s, s + 1, 1);
  }
}

// ---------------------------------------------------------------------------
// Ore
// ---------------------------------------------------------------------------
const oreSprites = [];
function buildOreSprites() {
  for (let lv = 0; lv < 4; lv++) {
    oreSprites[lv] = [];
    for (let v = 0; v < 4; v++) {
      const c = mkCanvas(CELL, CELL), g = c.getContext('2d'), r = rng(lv * 31 + v * 7 + 3);
      g.fillStyle = 'rgba(92,70,28,0.35)';
      for (let i = 0; i < 6 + lv * 3; i++) g.fillRect(Math.floor(r() * 22), Math.floor(r() * 22), 3, 2);
      const n = 5 + lv * 5;
      for (let i = 0; i < n; i++) {
        const x = 2 + Math.floor(r() * 19), y = 2 + Math.floor(r() * 19), big = r() < 0.35 + lv * 0.1;
        g.fillStyle = '#6e5310'; g.fillRect(x, y + 1, big ? 4 : 3, 2);
        g.fillStyle = '#c99d24'; g.fillRect(x, y, big ? 3 : 2, big ? 2 : 2);
        g.fillStyle = '#f1d873'; g.fillRect(x, y, 1, 1);
        if (big) { g.fillStyle = '#e1b83a'; g.fillRect(x + 1, y - 1, 2, 1); }
      }
      oreSprites[lv][v] = c;
    }
  }
}

// ---------------------------------------------------------------------------
// Structures
// ---------------------------------------------------------------------------
const BTOP = 24;  // room above the footprint for chimneys, cranes and coils
const spriteCache = new Map();

function slab(g, x, y, w, h, col) {
  col = col || '#7d7d74';
  g.fillStyle = shade(col, -0.3); g.fillRect(x, y, w, h);
  g.fillStyle = col; g.fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle = shade(col, -0.12);
  for (let i = x + 12; i < x + w - 1; i += 12) g.fillRect(i, y + 1, 1, h - 2);
  for (let j = y + 12; j < y + h - 1; j += 12) g.fillRect(x + 1, j, w - 2, 1);
  g.fillStyle = shade(col, 0.15); g.fillRect(x + 1, y + 1, w - 2, 1); g.fillRect(x + 1, y + 1, 1, h - 2);
}
// A building block seen from above and slightly south: roof plus a visible front wall.
function box(g, x, y, w, h, wallH, roof, wall) {
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + w, y + 4, 4, h - 2); g.fillRect(x + 4, y + h, w, 2);
  g.fillStyle = roof; g.fillRect(x, y, w, h - wallH);
  g.fillStyle = shade(roof, 0.22); g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h - wallH);
  g.fillStyle = shade(roof, -0.22); g.fillRect(x + w - 1, y + 1, 1, h - wallH - 1);
  g.fillStyle = wall; g.fillRect(x, y + h - wallH, w, wallH);
  g.fillStyle = shade(wall, 0.15); g.fillRect(x, y + h - wallH + 1, w, 1);
  g.fillStyle = shade(roof, -0.45); g.fillRect(x, y + h - wallH, w, 1);
  g.fillStyle = shade(wall, -0.35); g.fillRect(x, y + h - 1, w, 1); g.fillRect(x + w - 1, y + h - wallH, 1, wallH);
}
function cylinder(g, cx, top, rad, h, col) {
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(cx + rad, top + 6, 4, h - 2);
  for (let i = -rad; i < rad; i++) {
    const k = (i + rad) / (2 * rad);
    g.fillStyle = shade(col, k < 0.3 ? 0.25 - k * 0.5 : -(k - 0.3) * 0.6);
    g.fillRect(cx + i, top, 1, h);
  }
  g.fillStyle = shade(col, 0.3);
  g.beginPath(); g.ellipse(cx, top, rad, Math.max(2, rad * 0.45), 0, 0, 7); g.fill();
  g.fillStyle = shade(col, -0.5);
  g.beginPath(); g.ellipse(cx, top, rad * 0.55, Math.max(1, rad * 0.25), 0, 0, 7); g.fill();
}
function hazard(g, x, y, w, h) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    g.fillStyle = ((i + j) >> 1) % 2 ? '#1d1d1a' : '#d2a828';
    g.fillRect(x + i, y + j, 1, 1);
  }
}
function slats(g, x, y, w, h) {
  g.fillStyle = '#2e2e2a'; g.fillRect(x, y, w, h);
  g.fillStyle = '#45453f';
  for (let j = y + 1; j < y + h; j += 3) g.fillRect(x + 1, j, w - 2, 1);
}
function star(g, cx, cy, rad, col) {
  g.fillStyle = col; g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? rad * 0.42 : rad;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
}

const PAINTERS = {
  cy(g, W, H, pal) {
    slab(g, 0, 0, W, H);
    box(g, 4, 6, 64, 48, 14, pal.main, '#76776e');
    g.fillStyle = shade(pal.main, -0.18);
    for (let x = 9; x < 66; x += 6) g.fillRect(x, 7, 1, 32);
    g.fillStyle = '#3a3a35'; g.fillRect(12, 12, 9, 5); g.fillRect(50, 12, 9, 5);
    g.fillStyle = '#9fa39d'; g.beginPath(); g.arc(18, 28, 4, 0, 7); g.fill();
    g.fillStyle = '#5d605a'; g.fillRect(18, 28, 1, 4);
    slats(g, 22, 42, 28, 12); hazard(g, 18, 42, 4, 12); hazard(g, 50, 42, 4, 12);
    g.fillStyle = '#c9a227'; for (let i = 0; i < 3; i++) g.fillRect(30, 58 + i * 4, 12, 2);
    // Crane
    g.fillStyle = '#b88c1a'; g.fillRect(60, -18, 3, 34); g.fillRect(28, -18, 35, 3);
    g.fillStyle = '#6e520c'; for (let x = 30; x < 62; x += 4) g.fillRect(x, -17, 1, 1);
    for (let y = -16; y < 14; y += 4) g.fillRect(61, y, 1, 1);
    g.fillStyle = '#222'; g.fillRect(33, -15, 1, 12); g.fillRect(32, -3, 3, 2);
  },
  power(g, W, H, pal) {
    slab(g, 0, 0, W, H);
    box(g, 3, 10, 29, 34, 10, '#8b8c84', '#6b6c65');
    g.fillStyle = pal.main; g.fillRect(3, 16, 29, 4);
    g.fillStyle = '#3d3e3a'; g.fillRect(7, 23, 8, 6); g.fillRect(19, 23, 8, 6);
    g.fillStyle = '#c9b46a'; for (let x = 6; x < 30; x += 5) g.fillRect(x, 37, 2, 2);
    cylinder(g, 39, -16, 6, 54, '#9a9a92');
    g.fillStyle = pal.main; g.fillRect(33, -8, 12, 3); g.fillRect(33, 0, 12, 2);
    g.fillStyle = '#55564f'; g.fillRect(32, 28, 3, 2); g.fillRect(32, 34, 3, 2);
    g.fillStyle = '#5d5e58'; g.fillRect(35, 39, 11, 7);
    g.fillStyle = '#e0c040'; g.fillRect(40, 41, 1, 2); g.fillRect(39, 42, 3, 1); g.fillRect(40, 43, 1, 2);
  },
  refinery(g, W, H, pal) {
    slab(g, 0, 0, W, H);
    box(g, 2, 4, 40, 40, 12, pal.main, '#74756c');
    g.fillStyle = shade(pal.main, -0.2); for (let x = 6; x < 40; x += 5) g.fillRect(x, 5, 1, 26);
    g.fillStyle = '#2e2e2a'; g.fillRect(8, 10, 12, 8);
    g.fillStyle = '#4a4a44'; g.beginPath(); g.moveTo(24, 10); g.lineTo(38, 10); g.lineTo(34, 22); g.lineTo(28, 22); g.closePath(); g.fill();
    g.fillStyle = '#8a6c1c'; g.fillRect(27, 12, 8, 3);
    cylinder(g, 52, -12, 7, 44, '#b39f66');
    cylinder(g, 65, -4, 6, 36, '#a6935d');
    g.fillStyle = pal.main; g.fillRect(45, 6, 14, 3); g.fillRect(59, 12, 12, 3);
    g.fillStyle = '#44443e'; g.fillRect(30, 32, 12, 16); hazard(g, 28, 32, 2, 16); hazard(g, 42, 32, 2, 16);
    g.fillStyle = '#c9a227'; g.fillRect(32, 46, 8, 2);
  },
  barracks(g, W, H, pal, faction) {
    if (faction === 'allies') {
      g.fillStyle = '#6a5c42'; g.fillRect(1, 1, W - 2, H - 2);
      for (let x = 0; x < W; x += 5) { sandbag(g, x, 0); sandbag(g, x, H - 4); }
      for (let y = 4; y < H - 4; y += 5) { sandbag(g, 0, y, true); sandbag(g, W - 4, y, true); }
      tent(g, 6, 7, 16, 30, pal); tent(g, 26, 7, 16, 30, pal);
      g.fillStyle = '#2c2a26'; g.fillRect(20, 41, 8, 3);
      g.fillStyle = '#4b4b45'; g.fillRect(43, -14, 1, 20);
      g.fillStyle = pal.main; g.fillRect(44, -14, 7, 5); g.fillStyle = pal.light; g.fillRect(44, -14, 7, 1);
    } else {
      slab(g, 0, 0, W, H);
      box(g, 4, 4, 40, 40, 13, '#665345', '#8a4a39');
      g.fillStyle = '#6f392c';
      for (let y = 32; y < 43; y += 3) g.fillRect(4, y, 40, 1);
      for (let y = 32, k = 0; y < 43; y += 3, k++) for (let x = 6 + (k % 2) * 3; x < 44; x += 6) g.fillRect(x, y, 1, 3);
      star(g, 24, 17, 8, pal.main);
      g.fillStyle = '#2b2522'; g.fillRect(19, 35, 10, 9);
      g.fillStyle = shade(pal.main, 0.3); g.fillRect(22, 13, 1, 1);
    }
  },
  factory(g, W, H, pal) {
    slab(g, 0, 0, W, H);
    box(g, 2, 2, 68, 44, 16, '#85867e', '#6c6d66');
    g.fillStyle = pal.main; g.fillRect(2, 7, 68, 4); g.fillRect(2, 22, 68, 2);
    for (const x of [8, 22, 42, 56]) {
      g.fillStyle = '#6f8698'; g.fillRect(x, 13, 8, 6);
      g.fillStyle = '#a9c0cf'; g.fillRect(x, 13, 8, 1); g.fillRect(x, 13, 1, 6);
    }
    slats(g, 22, 31, 28, 15); hazard(g, 19, 31, 3, 15); hazard(g, 50, 31, 3, 15);
    cylinder(g, 64, -8, 3, 14, '#77776f');
  },
  helipad(g, W, H, pal) {
    slab(g, 0, 0, W, H, '#5f5f58');
    g.strokeStyle = '#c9a227'; g.lineWidth = 2;
    g.beginPath(); g.arc(24, 24, 17, 0, 7); g.stroke();
    g.fillStyle = '#e4e2d8'; g.fillRect(17, 16, 3, 16); g.fillRect(28, 16, 3, 16); g.fillRect(20, 23, 8, 2);
    g.fillStyle = pal.light; for (const [x, y] of [[2, 2], [44, 2], [2, 44], [44, 44]]) g.fillRect(x, y, 2, 2);
  },
  airfield(g, W, H, pal) {
    slab(g, 0, 0, W, H, '#5b5b54');
    g.fillStyle = '#4b4b45'; g.fillRect(20, 20, 52, 20);
    g.fillStyle = '#e4e2d8'; for (let x = 24; x < 66; x += 8) g.fillRect(x, 29, 4, 2);
    for (let y = 22; y < 39; y += 3) g.fillRect(68, y, 3, 1);
    box(g, 2, 2, 16, 26, 10, pal.main, '#6d6e67');
    g.fillStyle = '#8fb3c9'; g.fillRect(2, 18, 16, 3);
    g.fillStyle = '#444'; g.fillRect(9, -8, 1, 10); g.fillStyle = '#e04030'; g.fillRect(9, -9, 1, 1);
    box(g, 2, 32, 16, 14, 6, '#7f8079', '#64655e');
    g.fillStyle = '#c9a227'; g.fillRect(22, 12, 46, 1);
  },
  turret(g, W, H) {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(14, 15, 11, 9, 0, 0, 7); g.fill();
    g.fillStyle = '#5c5c55'; g.beginPath(); g.ellipse(12, 13, 11, 10, 0, 0, 7); g.fill();
    g.fillStyle = '#86867d'; g.beginPath(); g.ellipse(12, 12, 9, 8, 0, 0, 7); g.fill();
    g.fillStyle = '#a2a298'; g.fillRect(6, 7, 6, 1);
  },
  aagun(g, W, H) {
    g.fillStyle = '#5f5640'; g.fillRect(2, 3, 20, 19);
    for (let x = 1; x < 22; x += 5) { sandbag(g, x, 0); sandbag(g, x, 20); }
    for (let y = 4; y < 20; y += 5) { sandbag(g, 0, y, true); sandbag(g, 20, y, true); }
  },
  tesla(g, W, H) {
    slab(g, 1, 26, 22, 21);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(16, -10, 5, 46);
    g.fillStyle = '#34342f'; g.fillRect(9, -12, 6, 50);
    for (let y = -10; y < 36; y += 4) {
      g.fillStyle = '#8d4f1f'; g.fillRect(6, y, 12, 2);
      g.fillStyle = '#c9803c'; g.fillRect(6, y, 6, 1);
    }
    g.fillStyle = '#5f6870'; g.beginPath(); g.arc(12, -15, 7, 0, 7); g.fill();
    g.fillStyle = '#a7b2bc'; g.beginPath(); g.arc(10, -17, 4, 0, 7); g.fill();
    g.fillStyle = '#e8eef3'; g.fillRect(8, -19, 2, 2);
  },
  sam(g, W, H) {
    slab(g, 0, 0, W, H);
    g.fillStyle = '#5d5d56'; g.fillRect(14, 4, 20, 16);
  },
};
function sandbag(g, x, y, vert) {
  g.fillStyle = '#7b6a48'; g.fillRect(x, y + 1, vert ? 4 : 5, vert ? 5 : 4);
  g.fillStyle = '#ad9a6c'; g.fillRect(x, y, vert ? 4 : 5, vert ? 4 : 3);
  g.fillStyle = '#c4b283'; g.fillRect(x + 1, y, 2, 1);
}
function tent(g, x, y, w, h, pal) {
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 3, y + 3, w, h);
  g.fillStyle = pal.main; g.fillRect(x, y, w / 2, h);
  g.fillStyle = pal.dark; g.fillRect(x + w / 2, y, w / 2, h);
  g.fillStyle = pal.light; g.fillRect(x + w / 2 - 1, y, 1, h);
  g.fillStyle = pal.deep; g.beginPath(); g.moveTo(x + 3, y + h); g.lineTo(x + w / 2, y + h - 7); g.lineTo(x + w - 3, y + h); g.closePath(); g.fill();
}

function bldSprite(type, faction) {
  const key = type + faction;
  let s = spriteCache.get(key);
  if (s) return s;
  const d = BUILD_DEFS[type], pal = FACTIONS[faction].pal;
  const W = d.w * CELL, FH = d.h * CELL;
  const c = mkCanvas(W + 6, FH + BTOP + 4), g = c.getContext('2d');
  g.translate(0, BTOP);
  PAINTERS[type](g, W, FH, pal, faction);
  grit(c, 12, type.length * 17 + faction.length);
  spriteCache.set(key, c);
  return c;
}

// Moving parts on top of static structure sprites.
function drawBuildingTop(g, b, t) {
  const pal = FACTIONS[b.faction].pal;
  const x0 = b.cx * CELL, y0 = b.cy * CELL;
  if (b.type === 'turret') {
    const cx = x0 + 12, cy = y0 + 11, a = b.tface, rec = b.fireT > 0 ? -2 : 0;
    g.save(); g.translate(cx, cy); g.rotate(a);
    g.fillStyle = '#2e2e2a'; g.fillRect(2 + rec, -1.5, 12, 3);
    g.restore();
    g.fillStyle = pal.dark; g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.fill();
    g.fillStyle = pal.main; g.beginPath(); g.arc(cx - 0.5, cy - 0.5, 5, 0, 7); g.fill();
    g.fillStyle = pal.light; g.fillRect(cx - 3, cy - 4, 3, 1);
    if (b.fireT > 0) flash(g, cx + Math.cos(a) * 15, cy + Math.sin(a) * 15, 3);
  } else if (b.type === 'aagun') {
    const cx = x0 + 12, cy = y0 + 12, a = b.tface;
    g.fillStyle = '#4a4a44'; g.beginPath(); g.arc(cx, cy, 5, 0, 7); g.fill();
    g.save(); g.translate(cx, cy); g.rotate(a);
    g.fillStyle = '#26261f'; g.fillRect(0, -3, 11, 2); g.fillRect(0, 1, 11, 2);
    g.fillStyle = pal.main; g.fillRect(-4, -4, 7, 8);
    g.fillStyle = pal.light; g.fillRect(-4, -4, 7, 1);
    g.restore();
    if (b.fireT > 0) flash(g, cx + Math.cos(a) * 12, cy + Math.sin(a) * 12, 2);
  } else if (b.type === 'sam') {
    const cx = x0 + 24, cy = y0 + 12, a = b.tface;
    g.save(); g.translate(cx, cy); g.rotate(a);
    g.fillStyle = '#3c3d37'; g.fillRect(-7, -6, 14, 12);
    g.fillStyle = pal.main; g.fillRect(-7, -6, 14, 2);
    if (b.cd < b.def.weapon.rof * 0.7) { g.fillStyle = '#d8d8cf'; g.fillRect(-4, -5, 12, 2); g.fillRect(-4, 3, 12, 2); g.fillStyle = '#b0302a'; g.fillRect(7, -5, 2, 2); g.fillRect(7, 3, 2, 2); }
    g.restore();
  } else if (b.type === 'tesla' && b.charge > 0) {
    g.fillStyle = `rgba(150,200,255,${0.3 + 0.5 * b.charge})`;
    g.beginPath(); g.arc(x0 + 12, y0 - 15, 8 + Math.random() * 2, 0, 7); g.fill();
  }
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------
function flash(g, x, y, s) {
  g.fillStyle = '#fff6c8'; g.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
  g.fillStyle = 'rgba(255,190,60,0.8)'; g.fillRect(Math.round(x - s), Math.round(y - 0.5), s * 2, 1); g.fillRect(Math.round(x - 0.5), Math.round(y - s), 1, s * 2);
}

function drawInfantry(g, u, pal) {
  const x = Math.round(u.x), y = Math.round(u.y);
  const a = u.face, ca = Math.cos(a), sa = Math.sin(a);
  const walking = u.moving;
  const f = walking ? Math.floor(u.anim / 5) % 2 : 0;
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x - 2, y + 3, 6, 2);
  g.fillStyle = '#2c2b25';
  if (f) { g.fillRect(x - 2, y + 1, 1, 4); g.fillRect(x + 1, y + 1, 1, 3); }
  else { g.fillRect(x - 2, y + 1, 1, 3); g.fillRect(x + 1, y + 1, 1, 4); }
  g.fillStyle = pal.dark; g.fillRect(x - 2, y - 4, 5, 6);
  g.fillStyle = pal.main; g.fillRect(x - 2, y - 4, 4, 4);
  g.fillStyle = '#c99772'; g.fillRect(x - 1, y - 7, 3, 3);
  g.fillStyle = u.faction === 'soviets' ? '#4b4a3a' : '#57603c'; g.fillRect(x - 1, y - 8, 3, 2);
  // Weapon held toward the facing direction.
  if (u.type === 'rocket') {
    g.fillStyle = '#4f5a35';
    for (let i = -2; i <= 4; i++) g.fillRect(Math.round(x + ca * i), Math.round(y - 5 + sa * i * 0.6), 2, 2);
  } else {
    g.fillStyle = '#22221d';
    for (let i = 1; i <= 5; i++) g.fillRect(Math.round(x + ca * i), Math.round(y - 2 + sa * i * 0.6), 1, 1);
  }
  if (u.fireT > 0) flash(g, x + ca * 7, y - 2 + sa * 4, 2);
}

function treads(g, L, W, tw, anim) {
  g.fillStyle = '#25251f'; g.fillRect(-L / 2, -W / 2, L, tw); g.fillRect(-L / 2, W / 2 - tw, L, tw);
  g.fillStyle = '#4a4a40';
  const off = Math.floor(anim) % 3;
  for (let i = -L / 2 + off; i < L / 2; i += 3) { g.fillRect(i, -W / 2, 1, tw); g.fillRect(i, W / 2 - tw, 1, tw); }
}

function drawTank(g, u, pal) {
  const s = u.def.size, L = s.len, W = s.wid, tw = Math.max(3, Math.round(W * 0.24));
  g.save(); g.translate(u.x + 2, u.y + 3); g.rotate(u.face);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-L / 2, -W / 2, L, W);
  g.restore();
  g.save(); g.translate(u.x, u.y); g.rotate(u.face);
  treads(g, L, W, tw, u.anim);
  g.fillStyle = pal.deep; g.fillRect(-L / 2 + 1, -W / 2 + tw - 1, L - 2, W - 2 * tw + 2);
  g.fillStyle = pal.dark; g.fillRect(-L / 2 + 2, -W / 2 + tw, L - 4, W - 2 * tw);
  g.fillStyle = pal.main; g.fillRect(-L / 2 + 3, -W / 2 + tw, L - 7, W - 2 * tw - 1);
  g.fillStyle = pal.light; g.fillRect(L / 2 - 4, -W / 2 + tw, 1, W - 2 * tw);
  g.fillStyle = pal.deep; for (let i = 0; i < 3; i++) g.fillRect(-L / 2 + 3 + i * 2, -W / 2 + tw + 1, 1, W - 2 * tw - 2);
  if (s.pods) { g.fillStyle = '#3a3a33'; g.fillRect(-L / 2 + 2, -W / 2 + 1, 6, 3); g.fillRect(-L / 2 + 2, W / 2 - 4, 6, 3); }
  g.restore();
  // Turret turns independently of the hull.
  const ta = u.tface, rec = u.fireT > 0.05 ? -2 : 0;
  g.save(); g.translate(u.x, u.y); g.rotate(ta);
  g.fillStyle = '#25251f';
  if (s.twin) { g.fillRect(s.tur - 1 + rec, -2.5, s.barrel, 2); g.fillRect(s.tur - 1 + rec, 0.5, s.barrel, 2); }
  else g.fillRect(s.tur - 1 + rec, -1, s.barrel, 2);
  g.fillStyle = pal.deep; g.fillRect(-s.tur - 1, -s.tur - 1, s.tur * 2 + 2, s.tur * 2 + 2);
  g.fillStyle = pal.main; g.fillRect(-s.tur, -s.tur, s.tur * 2, s.tur * 2);
  g.fillStyle = pal.light; g.fillRect(-s.tur, -s.tur, s.tur * 2, 1); g.fillRect(-s.tur, -s.tur, 1, s.tur * 2);
  g.fillStyle = pal.dark; g.fillRect(-2, -2, 3, 3);
  g.restore();
  if (u.fireT > 0) flash(g, u.x + Math.cos(ta) * (s.tur + s.barrel), u.y + Math.sin(ta) * (s.tur + s.barrel), 3);
}

function drawJeep(g, u, pal) {
  const s = u.def.size, L = s.len, W = s.wid;
  g.save(); g.translate(u.x + 2, u.y + 2); g.rotate(u.face);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-L / 2, -W / 2, L, W); g.restore();
  g.save(); g.translate(u.x, u.y); g.rotate(u.face);
  g.fillStyle = '#1e1e1a';
  for (const [x, y] of [[-L / 2 + 1, -W / 2], [L / 2 - 5, -W / 2], [-L / 2 + 1, W / 2 - 2], [L / 2 - 5, W / 2 - 2]]) g.fillRect(x, y, 4, 2);
  g.fillStyle = pal.dark; g.fillRect(-L / 2, -W / 2 + 1, L, W - 2);
  g.fillStyle = pal.main; g.fillRect(-L / 2 + 1, -W / 2 + 2, L - 3, W - 4);
  g.fillStyle = '#26323a'; g.fillRect(2, -W / 2 + 2, 2, W - 4);
  g.fillStyle = pal.light; g.fillRect(L / 2 - 4, -W / 2 + 2, 3, 1);
  g.restore();
  g.save(); g.translate(u.x - Math.cos(u.face) * 3, u.y - Math.sin(u.face) * 3); g.rotate(u.tface);
  g.fillStyle = '#22221d'; g.fillRect(0, -1, 7, 2); g.fillStyle = '#3c3c35'; g.fillRect(-2, -2, 4, 4);
  g.restore();
  if (u.fireT > 0) flash(g, u.x + Math.cos(u.tface) * 6, u.y + Math.sin(u.tface) * 6, 2);
}

function drawHarv(g, u, pal) {
  const s = u.def.size, L = s.len, W = s.wid;
  g.save(); g.translate(u.x + 2, u.y + 3); g.rotate(u.face);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-L / 2, -W / 2, L, W); g.restore();
  g.save(); g.translate(u.x, u.y); g.rotate(u.face);
  treads(g, L, W, 3, u.anim);
  // Ore bin
  g.fillStyle = '#4c4d47'; g.fillRect(-L / 2 + 1, -W / 2 + 2, L - 9, W - 4);
  g.fillStyle = '#6d6e67'; g.fillRect(-L / 2 + 2, -W / 2 + 3, L - 11, W - 6);
  const fill = (u.load || 0) / u.def.capacity;
  if (fill > 0) {
    g.fillStyle = '#b48c22'; g.fillRect(-L / 2 + 3, -W / 2 + 4, Math.max(1, (L - 13) * fill), W - 8);
    g.fillStyle = '#ecd06a'; for (let i = 0; i < (L - 13) * fill; i += 3) g.fillRect(-L / 2 + 3 + i, -W / 2 + 4 + (i % 2) * 3, 1, 1);
  }
  // Cab
  g.fillStyle = pal.dark; g.fillRect(L / 2 - 8, -W / 2 + 1, 8, W - 2);
  g.fillStyle = pal.main; g.fillRect(L / 2 - 8, -W / 2 + 2, 6, W - 4);
  g.fillStyle = '#2b3a46'; g.fillRect(L / 2 - 3, -W / 2 + 3, 2, W - 6);
  g.fillStyle = '#c9a227'; g.fillRect(L / 2 - 1, -W / 2 + 2, 1, W - 4);
  g.restore();
}

function drawHeli(g, u, pal, t) {
  const alt = u.alt || 0;
  const gx = u.x + alt * 0.5, gy = u.y + alt * 0.7;
  g.save(); g.translate(gx, gy); g.rotate(u.face);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-9, -3, 16, 6); g.fillRect(-18, -1, 10, 2); g.restore();
  g.save(); g.translate(u.x, u.y - alt); g.rotate(u.face);
  g.fillStyle = pal.deep; g.fillRect(-19, -1, 12, 2); g.fillRect(-20, -4, 2, 8);
  g.fillStyle = pal.dark; g.fillRect(-9, -4, 17, 8);
  g.fillStyle = pal.main; g.fillRect(-8, -3, 14, 5);
  g.fillStyle = '#26323a'; g.fillRect(4, -2, 4, 4);
  g.fillStyle = '#9fc2d6'; g.fillRect(6, -2, 1, 2);
  if (u.type === 'hind') { g.fillStyle = '#33342e'; g.fillRect(-3, -8, 4, 16); g.fillStyle = pal.light; g.fillRect(-7, -3, 8, 1); }
  else { g.fillStyle = '#33342e'; g.fillRect(-2, -7, 3, 14); g.fillStyle = '#d0d0c4'; g.fillRect(-1, -7, 4, 1); g.fillRect(-1, 6, 4, 1); }
  g.restore();
  // Rotor blur
  const rx = u.x, ry = u.y - alt - 1, ra = t * (alt > 1 ? 40 : 6);
  g.fillStyle = 'rgba(30,30,28,0.18)'; g.beginPath(); g.arc(rx, ry, 12, 0, 7); g.fill();
  g.strokeStyle = 'rgba(25,25,22,0.75)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(rx - Math.cos(ra) * 12, ry - Math.sin(ra) * 12); g.lineTo(rx + Math.cos(ra) * 12, ry + Math.sin(ra) * 12);
  g.moveTo(rx - Math.cos(ra + 1.57) * 12, ry - Math.sin(ra + 1.57) * 12); g.lineTo(rx + Math.cos(ra + 1.57) * 12, ry + Math.sin(ra + 1.57) * 12); g.stroke();
  if (u.fireT > 0) flash(g, u.x + Math.cos(u.face) * 10, u.y - alt + Math.sin(u.face) * 10, 2);
}

function drawJet(g, u, pal) {
  const alt = u.alt || 0;
  const shape = (gg) => {
    gg.beginPath(); gg.moveTo(13, 0); gg.lineTo(3, -2); gg.lineTo(-3, -11); gg.lineTo(-7, -11); gg.lineTo(-5, -2);
    gg.lineTo(-11, -2); gg.lineTo(-13, -6); gg.lineTo(-15, -6); gg.lineTo(-14, 0); gg.lineTo(-15, 6); gg.lineTo(-13, 6); gg.lineTo(-11, 2);
    gg.lineTo(-5, 2); gg.lineTo(-7, 11); gg.lineTo(-3, 11); gg.lineTo(3, 2); gg.closePath();
  };
  g.save(); g.translate(u.x + alt * 0.5, u.y + alt * 0.7); g.rotate(u.face);
  g.fillStyle = 'rgba(0,0,0,0.28)'; shape(g); g.fill(); g.restore();
  g.save(); g.translate(u.x, u.y - alt); g.rotate(u.face);
  g.fillStyle = pal.dark; shape(g); g.fill();
  g.fillStyle = pal.main; g.fillRect(-12, -2, 22, 3); g.fillRect(-5, -9, 4, 9);
  g.fillStyle = pal.light; g.fillRect(-12, -2, 22, 1);
  g.fillStyle = '#26323a'; g.fillRect(3, -1, 5, 2);
  if (u.moving) { g.fillStyle = Math.random() < 0.5 ? '#ffcf5a' : '#ff8a2a'; g.fillRect(-17, -1, 3, 2); }
  g.restore();
}

function drawUnit(g, u, t) {
  const pal = FACTIONS[u.faction].pal;
  if (u.cls === 'inf') drawInfantry(g, u, pal);
  else if (u.def.draw === 'tank') drawTank(g, u, pal);
  else if (u.def.draw === 'jeep') drawJeep(g, u, pal);
  else if (u.def.draw === 'harv') drawHarv(g, u, pal);
  else if (u.def.fly === 'heli') drawHeli(g, u, pal, t);
  else drawJet(g, u, pal);
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
function drawEffect(g, fx) {
  const k = fx.t / fx.life;
  switch (fx.type) {
    case 'expl': {
      const r = rng(fx.seed), s = fx.size;
      if (k < 0.55) {
        const kk = k / 0.55;
        for (let i = 0; i < 5; i++) {
          const ox = (r() - 0.5) * s, oy = (r() - 0.5) * s * 0.8, rr = s * (0.35 + r() * 0.35) * (0.6 + kk * 0.7);
          g.fillStyle = kk < 0.3 ? '#fff3c4' : kk < 0.6 ? '#ffb43a' : '#d2501e';
          g.beginPath(); g.arc(fx.x + ox, fx.y + oy, rr, 0, 7); g.fill();
          g.fillStyle = kk < 0.3 ? '#ffd76a' : '#a8321a';
          g.beginPath(); g.arc(fx.x + ox + rr * 0.3, fx.y + oy + rr * 0.3, rr * 0.5, 0, 7); g.fill();
        }
      } else {
        const kk = (k - 0.55) / 0.45;
        g.globalAlpha = 0.65 * (1 - kk);
        for (let i = 0; i < 4; i++) {
          const ox = (r() - 0.5) * s, oy = (r() - 0.5) * s * 0.7 - kk * s * 0.6;
          g.fillStyle = i % 2 ? '#3d3a35' : '#57534b';
          g.beginPath(); g.arc(fx.x + ox, fx.y + oy, s * (0.4 + kk * 0.4), 0, 7); g.fill();
        }
        g.globalAlpha = 1;
      }
      if (fx.debris && k < 0.8) {
        g.fillStyle = '#2a2622';
        for (let i = 0; i < 8; i++) {
          const a = r() * Math.PI * 2, v = (0.5 + r()) * s * 1.6;
          g.fillRect(Math.round(fx.x + Math.cos(a) * v * k), Math.round(fx.y + Math.sin(a) * v * k - Math.sin(k * Math.PI) * s * 0.8), 2, 2);
        }
      }
      break;
    }
    case 'smoke': {
      const rr = fx.r * (0.6 + k * 1.2);
      g.globalAlpha = (fx.alpha || 0.55) * (1 - k);
      g.fillStyle = fx.color || '#5a5650';
      g.beginPath(); g.arc(fx.x, fx.y, rr, 0, 7); g.fill();
      g.globalAlpha = 1;
      break;
    }
    case 'fire': {
      const f = Math.floor(fx.t * 14) % 3;
      g.fillStyle = f === 0 ? '#ffd45a' : f === 1 ? '#ff8c2a' : '#e8521c';
      const h = 3 + f + (1 - k) * 2;
      g.fillRect(Math.round(fx.x - 1), Math.round(fx.y - h), 3, h);
      g.fillStyle = '#fff1a8'; g.fillRect(Math.round(fx.x), Math.round(fx.y - 2), 1, 2);
      break;
    }
    case 'tracer': {
      g.globalAlpha = 1 - k;
      g.strokeStyle = '#ffe48a'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(fx.x, fx.y); g.lineTo(fx.x2, fx.y2); g.stroke();
      g.fillStyle = '#fffbe0'; g.fillRect(Math.round(fx.x2 - 1), Math.round(fx.y2 - 1), 2, 2);
      g.globalAlpha = 1;
      break;
    }
    case 'spark': {
      g.fillStyle = k < 0.5 ? '#fff4c0' : '#ffaa40';
      g.fillRect(Math.round(fx.x - 1), Math.round(fx.y - 1), 2, 2);
      break;
    }
    case 'tesla': {
      const r = rng(fx.seed + Math.floor(fx.t * 30));
      g.globalAlpha = 1 - k * 0.6;
      for (let pass = 0; pass < 2; pass++) {
        g.strokeStyle = pass ? '#ffffff' : 'rgba(110,170,255,0.8)';
        g.lineWidth = pass ? 1 : 3;
        g.beginPath(); g.moveTo(fx.x, fx.y);
        const n = 8;
        for (let i = 1; i < n; i++) {
          const tt = i / n;
          g.lineTo(fx.x + (fx.x2 - fx.x) * tt + (r() - 0.5) * 10, fx.y + (fx.y2 - fx.y) * tt + (r() - 0.5) * 10);
        }
        g.lineTo(fx.x2, fx.y2); g.stroke();
      }
      g.globalAlpha = 1;
      break;
    }
    case 'corpse': {
      g.globalAlpha = Math.min(1, (1 - k) * 3);
      const pal = FACTIONS[fx.faction].pal;
      g.fillStyle = '#5e1810'; g.fillRect(Math.round(fx.x - 3), Math.round(fx.y + 1), 4, 2);
      g.fillStyle = pal.dark; g.fillRect(Math.round(fx.x - 3), Math.round(fx.y - 1), 6, 2);
      g.fillStyle = '#c99772'; g.fillRect(Math.round(fx.x + 3), Math.round(fx.y - 1), 2, 2);
      g.globalAlpha = 1;
      break;
    }
    case 'husk': {
      g.globalAlpha = Math.min(1, (1 - k) * 4);
      g.save(); g.translate(fx.x, fx.y); g.rotate(fx.face);
      g.fillStyle = '#1d1b18'; g.fillRect(-fx.len / 2, -fx.wid / 2, fx.len, fx.wid);
      g.fillStyle = '#34302a'; g.fillRect(-fx.len / 2 + 2, -fx.wid / 2 + 2, fx.len - 4, fx.wid - 4);
      g.fillStyle = '#4a3a2a'; g.fillRect(-2, -2, 4, 4);
      g.restore();
      g.globalAlpha = 1;
      break;
    }
    case 'ring': {
      g.globalAlpha = 1 - k;
      g.strokeStyle = fx.color; g.lineWidth = 1;
      const rr = 3 + k * 9;
      g.strokeRect(Math.round(fx.x - rr), Math.round(fx.y - rr * 0.7), Math.round(rr * 2), Math.round(rr * 1.4));
      g.globalAlpha = 1;
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Sidebar cameos
// ---------------------------------------------------------------------------
const cameoCache = new Map();
function cameoURL(type, faction) {
  const key = type + faction;
  if (cameoCache.has(key)) return cameoCache.get(key);
  const W = 64, H = 48, c = mkCanvas(W, H), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#2f3b46'); grd.addColorStop(0.55, '#4a5560'); grd.addColorStop(0.56, '#4d5a2c'); grd.addColorStop(1, '#2d3519');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.imageSmoothingEnabled = false;
  if (BUILD_DEFS[type]) {
    // Fill the frame like a painted cameo: scale the structure up and crop the edges.
    const s = bldSprite(type, faction), d = BUILD_DEFS[type];
    const fw = d.w * CELL, fh = d.h * CELL + BTOP;
    const k = Math.max(0.7, Math.min(1.5, Math.min(W / fw, H / fh) * 1.3));
    const dw = s.width * k, dh = s.height * k;
    g.drawImage(s, Math.round((W - fw * k) / 2), Math.round(H - dh + 2 * k), dw, dh);
  } else {
    const d = UNIT_DEFS[type];
    const u = { x: 0, y: 0, face: -0.5, tface: -0.5, anim: 0, fireT: 0, faction, def: d, type, cls: d.cls, alt: 0, load: d.capacity ? d.capacity * 0.7 : 0, moving: false };
    const scale = d.cls === 'inf' ? 3 : d.fly === 'jet' ? 1.6 : d.fly ? 1.7 : 2;
    g.save(); g.translate(W / 2, H / 2 + (d.cls === 'inf' ? 6 : 3)); g.scale(scale, scale);
    if (d.cls === 'inf') {
      u.x = -4; drawUnit(g, u, 0);
      if (d.type === 'rifle') { u.x = 4; u.y = 2; drawUnit(g, u, 0); }
    } else drawUnit(g, u, 0.3);
    g.restore();
  }
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeRect(0.5, 0.5, W - 1, H - 1);
  const url = c.toDataURL();
  cameoCache.set(key, url);
  return url;
}
