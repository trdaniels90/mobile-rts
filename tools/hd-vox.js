// HD graphics: the game's voxel models built at HD_D times the detail (a 4 x 4 x 4 block of small voxels for each voxel
// of the model's design), loaded into the page by tools/bake-sprites.js --hd only. The models' code is unchanged: a box
// still covers whole voxels of the design, but cylinders, domes and other curves are filled voxel by voxel at the finer
// grid, so they come out round instead of stepped. renderVox is wrapped so a fine model's picture is HD_K pixels per
// world pixel with its offsets in world pixels, as art.js expects of a picture with _k (art.js HD, hdArgs).
// Not part of the game: the game loads the finished pictures (sprites-hd/).
/* global VModel, renderVox, rgbInt, stampModel, tsWeather, topOf, hash3, softShadow, M_GLOW, M_GLASS, M_METAL */
function installHdVox(D, K) {
  const Base = VModel;
  class HdModel extends Base {
    constructor(x0, y0, x1, y1, d) {
      super(0, 0, 1, 1, 1);
      this.vd = D;
      this.x0 = Math.floor(x0) * D; this.y0 = Math.floor(y0) * D;
      this.w = (Math.ceil(x1) - Math.floor(x0)) * D; this.h = (Math.ceil(y1) - Math.floor(y0)) * D; this.d = Math.ceil(d) * D;
      this.col = new Int32Array(this.w * this.h * this.d).fill(-1); this.mat = new Uint8Array(this.w * this.h * this.d);
    }
    // (py: a turret built off its centre line by a fraction of a design voxel; renderVox reads it in voxels)
    get py() { return this._py || 0; }
    set py(v) { this._py = v * D; }
    fi(X, Y, Z) {
      X -= this.x0; Y -= this.y0;
      if (X < 0 || Y < 0 || Z < 0 || X >= this.w || Y >= this.h || Z >= this.d) return -1;
      return (Z * this.h + Y) * this.w + X;
    }
    idx(x, y, z) { const h = D >> 1; return this.fi(Math.floor(x) * D + h, Math.floor(y) * D + h, Math.floor(z) * D + h); }
    fill(X0, Y0, Z0, X1, Y1, Z1, c, m, test) {
      c = c === null ? -1 : rgbInt(c);
      for (let Z = Math.max(0, Z0); Z < Z1; Z++) for (let Y = Y0; Y < Y1; Y++) for (let X = X0; X < X1; X++) {
        if (test && !test((X + 0.5) / D, (Y + 0.5) / D, (Z + 0.5) / D)) continue;
        const i = this.fi(X, Y, Z);
        if (i >= 0) { this.col[i] = c; this.mat[i] = m || 0; }
      }
    }
    set(x, y, z, c, m) { const X = Math.floor(x) * D, Y = Math.floor(y) * D, Z = Math.floor(z) * D; this.fill(X, Y, Z, X + D, Y + D, Z + D, c, m); }
    get(x, y, z) { const i = this.idx(x, y, z); return i < 0 ? -1 : this.col[i]; }
    box(x0, y0, z0, x1, y1, z1, c, m) { this.fill(Math.floor(x0) * D, Math.floor(y0) * D, Math.floor(z0) * D, Math.ceil(x1) * D, Math.ceil(y1) * D, Math.ceil(z1) * D, c, m); }
    cylZ(cx, cy, z0, z1, r, c, m) {
      this.fill(Math.floor((cx - r) * D), Math.floor((cy - r) * D), Math.floor(z0) * D, Math.ceil((cx + r) * D), Math.ceil((cy + r) * D), Math.ceil(z1) * D, c, m,
        (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
    }
    cylX(x0, x1, cy, cz, r, c, m) {
      this.fill(Math.floor(x0) * D, Math.floor((cy - r) * D), Math.floor(Math.max(0, cz - r) * D), Math.ceil(x1) * D, Math.ceil((cy + r) * D), Math.ceil((cz + r) * D), c, m,
        (x, y, z) => (y - cy) ** 2 + (z - cz) ** 2 <= r * r);
    }
    cylY(y0, y1, cx, cz, r, c, m) {
      this.fill(Math.floor((cx - r) * D), Math.floor(y0) * D, Math.floor(Math.max(0, cz - r) * D), Math.ceil((cx + r) * D), Math.ceil(y1) * D, Math.ceil((cz + r) * D), c, m,
        (x, y, z) => (x - cx) ** 2 + (z - cz) ** 2 <= r * r);
    }
    ellipsoid(cx, cy, cz, rx, ry, rz, c, m) {
      this.fill(Math.floor((cx - rx) * D), Math.floor((cy - ry) * D), Math.floor(Math.max(0, cz - rz) * D), Math.ceil((cx + rx) * D), Math.ceil((cy + ry) * D), Math.ceil((cz + rz) * D), c, m,
        (x, y, z) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 <= 1);
    }
    // A line (aerials, cables, barrels pointing up): as thick as a design voxel, as before, but smooth along its length.
    line(x0, y0, z0, x1, y1, z1, c, m) {
      const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)) * 2 * D) + 1, h = D >> 1;
      for (let i = 0; i <= n; i++) {
        const t = i / n, X = Math.floor((Math.floor(x0 + (x1 - x0) * t) + 0.5) * D), Y = Math.floor((Math.floor(y0 + (y1 - y0) * t) + 0.5) * D);
        const Z = Math.floor((z0 + (z1 - z0) * t) * D);
        this.fill(X - h, Y - h, Z - h, X + h, Y + h, Z + h, c, m);
      }
    }
    // paint and paintTop call fn with design-voxel coordinates (patterns such as stripes keep their size).
    paint(x0, y0, z0, x1, y1, z1, fn) {
      for (let Z = Math.max(0, Math.floor(z0) * D); Z < Math.ceil(z1) * D; Z++) for (let Y = Math.floor(y0) * D; Y < Math.ceil(y1) * D; Y++) for (let X = Math.floor(x0) * D; X < Math.ceil(x1) * D; X++) {
        const i = this.fi(X, Y, Z);
        if (i < 0 || this.col[i] < 0) continue;
        const v = fn(Math.floor(X / D), Math.floor(Y / D), Math.floor(Z / D), this.col[i]);
        if (v !== undefined && v !== null) this.col[i] = rgbInt(v);
      }
    }
    paintTop(x0, y0, x1, y1, fn) {
      for (let Y = Math.floor(y0) * D; Y < Math.ceil(y1) * D; Y++) for (let X = Math.floor(x0) * D; X < Math.ceil(x1) * D; X++) for (let Z = this.d - 1; Z >= 0; Z--) {
        const i = this.fi(X, Y, Z);
        if (i < 0 || this.col[i] < 0) continue;
        const v = fn(Math.floor(X / D), Math.floor(Y / D), Math.floor(Z / D), this.col[i]);
        if (v !== undefined && v !== null) this.col[i] = rgbInt(v);
        break;
      }
    }
  }
  VModel = HdModel;
  // models.js stampModel copies one model into another by its grid: fine to fine here.
  const stamp0 = stampModel;
  stampModel = function (dst, src, dx, dy, dz) {
    if (!src.vd) return stamp0(dst, src, dx, dy, dz);
    const ox = Math.floor(dx || 0) * D, oy = Math.floor(dy || 0) * D, oz = Math.floor(dz || 0) * D;
    for (let z = 0; z < src.d; z++) for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const i = (z * src.h + y) * src.w + x, c = src.col[i];
      if (c < 0) continue;
      const j = dst.fi(src.x0 + x + ox, src.y0 + y + oy, z + oz);
      if (j >= 0) { dst.col[j] = c; dst.mat[j] = src.mat[i]; }
    }
  };
  // lookstructs.js tsWeather works on the grid: here with its patterns and heights in design voxels.
  if (typeof tsWeather === 'function') {
    tsWeather = function (m, strong) {
      const W = m.w, H = m.h, Dd = m.d, top = topOf(m), col = m.col, mat = m.mat;
      const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= Dd ? -1 : col[(z * H + y) * W + x]);
      for (let z = 0; z < Dd; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (z * H + y) * W + x, c = col[i];
        if (c < 0 || mat[i] === M_GLOW || mat[i] === M_GLASS) continue;
        let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
        const lum = 0.3 * r + 0.59 * g + 0.11 * b, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        let k = 0.97;
        if (lum > 165 && mx - mn < 40) k *= strong ? 0.74 : 0.86;
        const sat = strong ? 0.8 : 0.88;
        r = lum + (r - lum) * sat; g = lum + (g - lum) * sat; b = lum + (b - lum) * sat;
        const side = at(x + 1, y, z) < 0 || at(x, y + 1, z) < 0 || at(x - 1, y, z) < 0 || at(x, y - 1, z) < 0;
        const wx = Math.floor((x + m.x0) / D), wy = Math.floor((y + m.y0) / D), wz = z / D;
        k *= 1 + (hash3(wx, wy, Math.floor(wz) * 7 + 3) - 0.5) * 0.08;
        if (side && wz >= 1 && wz <= 4) k *= 0.72 + 0.07 * (wz - 1);
        if (side) {
          const t = top[y * W + x] / D, h = hash3(wx * 3 + wy, 0, 91);
          if (h > 0.62 && t - wz < 12 && t - wz > 0) k *= 1 - 0.16 * (1 - (t - wz) / 12) * (h - 0.62) / 0.38 * 2;
        }
        if (mat[i] === M_METAL && hash3(wx, wy, Math.floor(wz) + 50) > 0.93) { r = r * 0.6 + 109 * 0.4; g = g * 0.6 + 68 * 0.4; b = b * 0.6 + 41 * 0.4; }
        col[i] = (Math.max(0, Math.min(255, Math.round(r * k))) << 16) | (Math.max(0, Math.min(255, Math.round(g * k))) << 8) | Math.max(0, Math.min(255, Math.round(b * k)));
      }
      return m;
    };
  }
  // A fine model's picture at K pixels per world pixel, soft edged, its shadow softened; offsets in world pixels.
  const render0 = renderVox;
  renderVox = function (m, angle, opts) {
    if (!m || !m.vd || (opts && opts.normal)) return render0(m, angle, opts);
    const o = Object.assign({}, opts), scale = o.scale || 1, div = o.fit ? K : scale * K;
    o.scale = scale * K / m.vd; o.fit = true; o.crisp = false;
    const out = render0(m, angle, o);
    if (typeof edgeDark === 'function') edgeDark(out.img);   // RA2's dark edges (art.js)
    out.ox /= div; out.oy /= div; out.img._ox = out.ox; out.img._oy = out.oy; out.img._k = K;
    if (out.sh) {
      const sh = softShadow(out.sh, K);
      out.sox = out.sox / div - sh._pad / K; out.soy = out.soy / div - sh._pad / K;
      sh._ox = out.sox; sh._oy = out.soy; sh._k = K; sh._shade = true; out.sh = sh;
    }
    return out;
  };
}
