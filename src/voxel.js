'use strict';
// A small voxel renderer. Models are built from boxes, cylinders and spheres, then
// pre-rendered from above-and-south with one sun, ambient occlusion, metal and glass
// highlights and a cast shadow: the "rendered in 3D Studio" look of 90s RTS sprites.

const VK = 1.0;                    // screen pixels a voxel rises per unit of height (steep three-quarter view)
const SUPER = 2;                   // supersampling for soft, anti-aliased edges
const LIGHT = (() => { const v = [-0.62, 0.22, 0.75], l = Math.hypot(...v); return v.map((x) => x / l); })();
const HALF = (() => { const v = [LIGHT[0], LIGHT[1] + 0.6, LIGHT[2] + 0.8], l = Math.hypot(...v); return v.map((x) => x / l); })();
const SHADOW_DX = -LIGHT[0] / LIGHT[2], SHADOW_DY = -LIGHT[1] / LIGHT[2];
const M_MATTE = 0, M_METAL = 1, M_GLASS = 2, M_GLOW = 3, M_ROUGH = 4;

function rgbInt(c) { return typeof c === 'number' ? c : parseInt(c.slice(1), 16); }
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

class VModel {
  constructor(x0, y0, x1, y1, d) {
    this.x0 = Math.floor(x0); this.y0 = Math.floor(y0);
    this.w = Math.ceil(x1) - this.x0; this.h = Math.ceil(y1) - this.y0; this.d = Math.ceil(d);
    this.col = new Int32Array(this.w * this.h * this.d).fill(-1);
    this.mat = new Uint8Array(this.w * this.h * this.d);
  }
  idx(x, y, z) {
    x = Math.floor(x) - this.x0; y = Math.floor(y) - this.y0; z = Math.floor(z);
    if (x < 0 || y < 0 || z < 0 || x >= this.w || y >= this.h || z >= this.d) return -1;
    return (z * this.h + y) * this.w + x;
  }
  set(x, y, z, c, m) { const i = this.idx(x, y, z); if (i >= 0) { this.col[i] = c === null ? -1 : rgbInt(c); this.mat[i] = m || 0; } }
  get(x, y, z) { const i = this.idx(x, y, z); return i < 0 ? -1 : this.col[i]; }
  box(x0, y0, z0, x1, y1, z1, c, m) {
    c = c === null ? -1 : rgbInt(c);
    for (let z = Math.floor(z0); z < z1; z++) for (let y = Math.floor(y0); y < y1; y++) for (let x = Math.floor(x0); x < x1; x++) {
      const i = this.idx(x, y, z);
      if (i >= 0) { this.col[i] = c; this.mat[i] = m || 0; }
    }
  }
  clear(x0, y0, z0, x1, y1, z1) { this.box(x0, y0, z0, x1, y1, z1, null); }
  cylZ(cx, cy, z0, z1, r, c, m) {
    for (let z = Math.floor(z0); z < z1; z++) for (let y = Math.floor(cy - r); y < cy + r; y++) for (let x = Math.floor(cx - r); x < cx + r; x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.set(x, y, z, c, m);
    }
  }
  cylX(x0, x1, cy, cz, r, c, m) {
    for (let x = Math.floor(x0); x < x1; x++) for (let y = Math.floor(cy - r); y < cy + r; y++) for (let z = Math.max(0, Math.floor(cz - r)); z < cz + r; z++) {
      if ((y + 0.5 - cy) ** 2 + (z + 0.5 - cz) ** 2 <= r * r) this.set(x, y, z, c, m);
    }
  }
  cylY(y0, y1, cx, cz, r, c, m) {
    for (let y = Math.floor(y0); y < y1; y++) for (let x = Math.floor(cx - r); x < cx + r; x++) for (let z = Math.max(0, Math.floor(cz - r)); z < cz + r; z++) {
      if ((x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2 <= r * r) this.set(x, y, z, c, m);
    }
  }
  ellipsoid(cx, cy, cz, rx, ry, rz, c, m) {
    for (let z = Math.max(0, Math.floor(cz - rz)); z < cz + rz; z++) for (let y = Math.floor(cy - ry); y < cy + ry; y++) for (let x = Math.floor(cx - rx); x < cx + rx; x++) {
      if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 + ((z + 0.5 - cz) / rz) ** 2 <= 1) this.set(x, y, z, c, m);
    }
  }
  // Thin line of voxels (antennas, cables, gun barrels pointing up).
  line(x0, y0, z0, x1, y1, z1, c, m) {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)) * 2) + 1;
    for (let i = 0; i <= n; i++) { const t = i / n; this.set(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, c, m); }
  }
  // Repaint filled voxels in a region: fn(x, y, z, colorInt) returns a colour or undefined to keep it.
  paint(x0, y0, z0, x1, y1, z1, fn) {
    for (let z = Math.max(0, Math.floor(z0)); z < z1; z++) for (let y = Math.floor(y0); y < y1; y++) for (let x = Math.floor(x0); x < x1; x++) {
      const i = this.idx(x, y, z);
      if (i < 0 || this.col[i] < 0) continue;
      const v = fn(x, y, z, this.col[i]);
      if (v !== undefined && v !== null) this.col[i] = rgbInt(v);
    }
  }
  // Paint the top-most voxel of each column in a region (decals on roofs and pads).
  paintTop(x0, y0, x1, y1, fn) {
    for (let y = Math.floor(y0); y < y1; y++) for (let x = Math.floor(x0); x < x1; x++) {
      for (let z = this.d - 1; z >= 0; z--) {
        const i = this.idx(x, y, z);
        if (i < 0 || this.col[i] < 0) continue;
        const v = fn(x, y, z, this.col[i]);
        if (v !== undefined && v !== null) this.col[i] = rgbInt(v);
        break;
      }
    }
  }
}

function surfaceOf(m) {
  const { w, h, d } = m;
  const xs = [], ys = [], zs = [], nx = [], ny = [], nz = [], col = [], mat = [], ao = [];
  const filled = (x, y, z) => z < 0 || (x >= 0 && y >= 0 && x < w && y < h && z < d && m.col[(z * h + y) * w + x] >= 0);
  for (let z = 0; z < d; z++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (z * h + y) * w + x;
    if (m.col[i] < 0) continue;
    if (filled(x + 1, y, z) && filled(x - 1, y, z) && filled(x, y + 1, z) && filled(x, y - 1, z) && filled(x, y, z + 1)) continue;
    let ax = 0, ay = 0, az = 0, occ = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy && !dz) continue;
      if (filled(x + dx, y + dy, z + dz)) { occ++; continue; }
      const l = Math.hypot(dx, dy, dz);
      ax += dx / l; ay += dy / l; az += dz / l;
    }
    // Two-voxel reach softens the normals of big flat faces.
    for (const [dx, dy, dz] of [[2, 0, 0], [-2, 0, 0], [0, 2, 0], [0, -2, 0], [0, 0, 2]]) if (!filled(x + dx, y + dy, z + dz)) { ax += dx * 0.25; ay += dy * 0.25; az += dz * 0.25; }
    const l = Math.hypot(ax, ay, az) || 1;
    xs.push(x + m.x0); ys.push(y + m.y0); zs.push(z);
    nx.push(ax / l); ny.push(ay / l); nz.push(l < 0.01 ? 1 : az / l);
    col.push(m.col[i]); mat.push(m.mat[i]);
    ao.push(Math.max(0.5, Math.min(1.08, 1.32 - occ * 0.034)));
  }
  return { n: xs.length, xs, ys, zs, nx, ny, nz, col, mat, ao };
}

// Renders a model rotated by `angle` (radians, around the vertical axis). Returns the lit
// sprite plus its shadow, each with the offset of its top-left corner from the model origin.
function renderVox(m, angle, opts) {
  opts = opts || {};
  const s = m.surf || (m.surf = surfaceOf(m));
  const scale = opts.scale || 1, S = SUPER * scale;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const ext = 0.5 * (Math.abs(ca) + Math.abs(sa));
  const n = s.n;
  const px = new Float32Array(n), py = new Float32Array(n);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let sminX = Infinity, sminY = Infinity, smaxX = -Infinity, smaxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const cx = s.xs[i] + 0.5, cy = s.ys[i] + 0.5;
    const xr = cx * ca - cy * sa, yr = cx * sa + cy * ca;
    px[i] = xr; py[i] = yr;
    const z = s.zs[i];
    minX = Math.min(minX, xr - ext); maxX = Math.max(maxX, xr + ext);
    minY = Math.min(minY, yr - ext - (z + 1) * VK); maxY = Math.max(maxY, yr + ext - z * VK);
    const gx = xr + (z + 0.5) * SHADOW_DX, gy = yr + (z + 0.5) * SHADOW_DY;
    sminX = Math.min(sminX, gx - ext); smaxX = Math.max(smaxX, gx + ext);
    sminY = Math.min(sminY, gy - ext); smaxY = Math.max(smaxY, gy + ext);
  }
  minX = Math.floor(minX); minY = Math.floor(minY); sminX = Math.floor(sminX); sminY = Math.floor(sminY);
  const W = Math.max(1, Math.ceil((maxX - minX) * scale) + 1), H = Math.max(1, Math.ceil((maxY - minY) * scale) + 1);
  const BW = W * SUPER, BH = H * SUPER;
  const buf = new Uint32Array(BW * BH);
  // Painter's order: lower voxels first, then north to south.
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  const key = new Float64Array(n);
  for (let i = 0; i < n; i++) key[i] = s.zs[i] * 10000 + py[i];
  order.sort((a, b) => key[a] - key[b]);
  const tint = opts.tint;
  for (let k = 0; k < n; k++) {
    const i = order[k];
    const z = s.zs[i];
    const nxr = s.nx[i] * ca - s.ny[i] * sa, nyr = s.nx[i] * sa + s.ny[i] * ca, nzr = s.nz[i];
    const dif = Math.max(0, nxr * LIGHT[0] + nyr * LIGHT[1] + nzr * LIGHT[2]);
    const mt = s.mat[i];
    let lum, spec = 0;
    if (mt === M_GLOW) lum = 1.15;
    else {
      lum = (0.5 + 0.68 * dif) * s.ao[i];
      const nh = Math.max(0, nxr * HALF[0] + nyr * HALF[1] + nzr * HALF[2]);
      if (mt === M_METAL) spec = Math.pow(nh, 14) * 0.4;
      else if (mt === M_GLASS) { spec = Math.pow(nh, 22) * 0.9; lum *= 0.85; }
      else if (mt === M_MATTE) spec = Math.pow(nh, 8) * 0.06;
    }
    if (mt !== M_GLOW) lum *= mt === M_ROUGH ? 0.88 + hash3(s.xs[i], s.ys[i], z) * 0.24 : 0.98 + hash3(s.xs[i], s.ys[i], z) * 0.04;
    let c = s.col[i];
    let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    if (tint) { r = r * tint[0]; g = g * tint[1]; b = b * tint[2]; }
    r = Math.min(255, r * lum + spec * 255); g = Math.min(255, g * lum + spec * 255); b = Math.min(255, b * lum + spec * 255);
    const pix = (255 << 24) | (b << 16) | (g << 8) | r;
    const x0 = Math.floor((px[i] - ext - minX) * S), x1 = Math.ceil((px[i] + ext - minX) * S);
    const y0 = Math.floor((py[i] - ext - (z + 1) * VK - minY) * S), y1 = Math.ceil((py[i] + ext - z * VK - minY) * S);
    for (let yy = Math.max(0, y0); yy < Math.min(BH, y1); yy++) {
      const row = yy * BW;
      for (let xx = Math.max(0, x0); xx < Math.min(BW, x1); xx++) buf[row + xx] = pix;
    }
  }
  const img = downsample(buf, BW, BH, W, H, false, opts.crisp);
  const out = { img, ox: minX, oy: minY };
  if (opts.shadow !== false) {
    const SW = Math.max(1, Math.ceil((smaxX - sminX) * scale) + 1), SH = Math.max(1, Math.ceil((smaxY - sminY) * scale) + 1);
    const sb = new Uint32Array(SW * SUPER * SH * SUPER);
    const SBW = SW * SUPER, SBH = SH * SUPER;
    for (let i = 0; i < n; i++) {
      const z = s.zs[i];
      const gx = px[i] + (z + 0.5) * SHADOW_DX, gy = py[i] + (z + 0.5) * SHADOW_DY;
      const x0 = Math.floor((gx - ext - 0.3 - sminX) * S), x1 = Math.ceil((gx + ext + 0.3 - sminX) * S);
      const y0 = Math.floor((gy - ext - 0.3 - sminY) * S), y1 = Math.ceil((gy + ext + 0.3 - sminY) * S);
      for (let yy = Math.max(0, y0); yy < Math.min(SBH, y1); yy++) for (let xx = Math.max(0, x0); xx < Math.min(SBW, x1); xx++) sb[yy * SBW + xx] = 0xff000000;
    }
    out.sh = downsample(sb, SBW, SBH, SW, SH, true);
    out.sox = sminX; out.soy = sminY;
  }
  return out;
}

// `crisp` keeps hard pixel edges (for tiny sprites such as infantry) instead of soft coverage.
function downsample(buf, BW, BH, W, H, shadow, crisp) {
  const c = mkCanvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  const SS = SUPER * SUPER;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, gg = 0, b = 0, a = 0;
    for (let sy = 0; sy < SUPER; sy++) for (let sx = 0; sx < SUPER; sx++) {
      const p = buf[(y * SUPER + sy) * BW + x * SUPER + sx];
      if (!p) continue;
      a++; r += p & 255; gg += (p >> 8) & 255; b += (p >> 16) & 255;
    }
    if (!a) continue;
    const o = (y * W + x) * 4;
    if (shadow) { d[o + 3] = Math.round(a / SS * 255); continue; }
    if (crisp) {
      if (a * 2 < SS) continue;
      // Use one sample rather than the average so colours stay sharp.
      let p = buf[(y * SUPER + SUPER - 1) * BW + x * SUPER];
      if (!p) p = buf[(y * SUPER) * BW + x * SUPER + SUPER - 1] || buf[(y * SUPER) * BW + x * SUPER] || buf[(y * SUPER + SUPER - 1) * BW + x * SUPER + SUPER - 1];
      d[o] = p & 255; d[o + 1] = (p >> 8) & 255; d[o + 2] = (p >> 16) & 255; d[o + 3] = 255;
      continue;
    }
    d[o] = r / a; d[o + 1] = gg / a; d[o + 2] = b / a; d[o + 3] = Math.round(a / SS * 255);
  }
  if (!shadow) {
    const k = crisp ? 0.42 : 0.62;
    // Darken the silhouette edge for the crisp outline of pre-rendered sprites.
    const alpha = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) alpha[i] = d[i * 4 + 3];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (alpha[i] < 128) continue;
      const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1 || alpha[i - 1] < 128 || alpha[i + 1] < 128 || alpha[i - W] < 128 || alpha[i + W] < 128;
      if (edge) { d[i * 4] *= k; d[i * 4 + 1] *= k; d[i * 4 + 2] *= k; }
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

const FACINGS = 32;
function facingIndex(a, n) { n = n || FACINGS; return ((Math.round(a / (Math.PI * 2) * n) % n) + n) % n; }
