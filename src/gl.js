'use strict';
// The WebGL renderer (branch claude/webgl; plan: plans/webgl-renderer.md). Drawing only: rules, saves and online play do not
// change. ?gl=off (or no WebGL2, or a lost context) draws everything the 2D way as before.
// Stage 1: the ground. The tiles makeGround paints (art.js, G.ground.gl) are textures, laid on a mesh over the world grid
// lifted by the raised ground (look.js gLift, craters left out as there), every GL_STEP world px, with depth so a hill hides
// the ground behind it. The wrecks layer ('d') and the look's soft patches (look.js patchPic, soft-light) are mixed in by the
// shader. The result is put into the 2D view canvas as its ground (ui.js draw), so everything drawn after it is unchanged.
const GLR = (() => {
  const q = typeof location !== 'undefined' ? location.search : '';
  const R = { on: typeof document !== 'undefined' && !/[?&]gl=off\b/.test(q), ground: () => false, frames: 0 };
  if (!R.on) return R;
  const GL_STEP = 16, TEX_MAX = 140;
  let cv = null, gl = null, P = null, loc = null, failed = false;
  const VS = `#version 300 es
in vec2 aP; in float aD; in vec2 aW; uniform vec2 uCam, uSize; out vec2 vW;
void main() { vec2 s = (aP - uCam) / uSize * 2.0 - 1.0; gl_Position = vec4(s.x, -s.y, aD, 1.0); vW = aW; }`;
  const FS = `#version 300 es
precision highp float; in vec2 vW; out vec4 o;
uniform sampler2D uT, uD, uLow, uPatch; uniform vec2 uT0; uniform float uTile, uWorld, uLowOnly, uPatchK, uPatchS;
float sl(float b, float s) { float d = b <= 0.25 ? ((16.0 * b - 12.0) * b + 4.0) * b : sqrt(b); return s <= 0.5 ? b - (1.0 - 2.0 * s) * b * (1.0 - b) : b + (2.0 * s - 1.0) * (d - b); }
void main() {
  vec2 uv = (vW - uT0) / uTile;
  vec4 c = uLowOnly > 0.5 ? texture(uLow, vW / uWorld) : texture(uT, uv);
  vec4 d = texture(uD, uv); c.rgb = mix(c.rgb, d.rgb, d.a * (1.0 - uLowOnly));
  if (uPatchK > 0.0) { vec4 p = texture(uPatch, vW / uPatchS); vec3 s = vec3(sl(c.r, p.r), sl(c.g, p.g), sl(c.b, p.b)); c.rgb = mix(c.rgb, s, p.a * uPatchK); }
  o = vec4(c.rgb, 1.0);
}`;
  function init() {
    cv = document.createElement('canvas');
    gl = cv.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true });
    if (!gl) { failed = true; return false; }
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); failed = true; });
    const mk = (t, s) => { const h = gl.createShader(t); gl.shaderSource(h, s); gl.compileShader(h); if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(h)); return h; };
    P = gl.createProgram(); gl.attachShader(P, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(P, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(P);
    if (!gl.getProgramParameter(P, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(P));
    gl.useProgram(P);
    loc = {};
    for (const n of ['uCam', 'uSize', 'uT', 'uD', 'uLow', 'uPatch', 'uT0', 'uTile', 'uWorld', 'uLowOnly', 'uPatchK', 'uPatchS']) loc[n] = gl.getUniformLocation(P, n);
    for (const n of ['aP', 'aD', 'aW']) loc[n] = gl.getAttribLocation(P, n);
    gl.uniform1i(loc.uT, 0); gl.uniform1i(loc.uD, 1); gl.uniform1i(loc.uLow, 2); gl.uniform1i(loc.uPatch, 3);
    R.buf = gl.createBuffer(); R.ibuf = gl.createBuffer();
    R.none = texFrom(null);
    return true;
  }
  function texFrom(src, repeat) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, repeat ? gl.LINEAR : gl.NEAREST);
    const w = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE; gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w);
    if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    return t;
  }
  // Per battle: tile textures (k -> { t: the tile object uploaded, ver, g, d }), each tile's mesh, the stand-in.
  let S = null;
  function state() {
    if (!S || S.G !== G || S.ground !== G.ground) {
      if (S) { for (const e of S.tex.values()) { gl.deleteTexture(e.g); if (e.d) gl.deleteTexture(e.d); } if (S.low) gl.deleteTexture(S.low); }
      S = { G, ground: G.ground, tex: new Map(), mesh: new Map(), low: null, lowSrc: null, patch: null, frame: 0 };
    }
    return S;
  }
  // The mesh of one tile: (X, Y) on the view plane lifted by the raised ground, depth, world (x, y); and its triangles.
  function meshOf(k, A) {
    let m = S.mesh.get(k);
    if (m) return m;
    const [x0, y0] = A.at(k), T = A.T, N = Math.ceil(Math.min(T, WORLD - x0) / GL_STEP), M = Math.ceil(Math.min(T, WORLD - y0) / GL_STEP);
    const v = new Float32Array((N + 1) * (M + 1) * 5), D = 2 * WORLD;
    let o = 0;
    for (let j = 0; j <= M; j++) for (let i = 0; i <= N; i++) {
      const x = Math.min(x0 + i * GL_STEP, WORLD, x0 + T), y = Math.min(y0 + j * GL_STEP, WORLD, y0 + T), L = typeof gLift === 'function' ? gLift(x, y, true) : 0, [X, Y] = toView(x, y);
      v[o++] = X; v[o++] = Y - L; v[o++] = 1 - 2 * (x * VIEW.s + y * VIEW.c + 64) / (D + 128); v[o++] = x; v[o++] = y;
    }
    const ix = new Uint16Array(N * M * 6);
    o = 0;
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; ix[o++] = a; ix[o++] = b; ix[o++] = c; ix[o++] = b; ix[o++] = d; ix[o++] = c; }
    m = { v, ix, n: ix.length };
    S.mesh.set(k, m);
    return m;
  }
  function upload(k, t) {
    let e = S.tex.get(k);
    if (e && e.t === t && e.ver === t.ver && !!e.d === !!t.d) { e.used = S.frame; return e; }
    if (!e) {
      if (S.tex.size >= TEX_MAX) {   // the least recently drawn let go
        let old = null; for (const [kk, x] of S.tex) if (!old || x.used < old[1].used) old = [kk, x];
        gl.deleteTexture(old[1].g); if (old[1].d) gl.deleteTexture(old[1].d); S.tex.delete(old[0]);
      }
      e = { g: texFrom(t.g), d: t.d ? texFrom(t.d) : null };
      S.tex.set(k, e);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, e.g); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, t.g);
      if (t.d) { if (!e.d) e.d = texFrom(t.d); else { gl.bindTexture(gl.TEXTURE_2D, e.d); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, t.d); } }
    }
    e.t = t; e.ver = t.ver; e.used = S.frame;
    return e;
  }
  // Draws the ground of world box (sx, sy, sw, sh) into the 2D view canvas v (VW x VH, top left (vx, vy) on the view
  // plane). False when WebGL cannot: the caller draws it the 2D way.
  R.ground = (v, vx, vy, VW, VH, sx, sy, sw, sh) => {
    if (failed || R.paused || !G || !G.ground || !G.ground.gl) return false;   // (paused: tools draw a frame the 2D way to compare)
    try {
      if (!gl && !init()) return false;
      state(); S.frame++; R.frames++;
      const A = G.ground.gl;
      if (cv.width !== VW || cv.height !== VH) { cv.width = VW; cv.height = VH; }
      gl.viewport(0, 0, VW, VH); gl.clearColor(0, 0, 0, 0); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); gl.disable(gl.BLEND);
      gl.useProgram(P);
      gl.uniform2f(loc.uCam, vx, vy); gl.uniform2f(loc.uSize, VW, VH); gl.uniform1f(loc.uTile, A.T); gl.uniform1f(loc.uWorld, WORLD);
      // The stand-in (a pixel a cell) for tiles not painted yet; the look's soft patches.
      const low = A.low();
      if (S.lowSrc !== low) { if (S.low) gl.deleteTexture(S.low); S.low = texFrom(low); S.lowSrc = low; gl.bindTexture(gl.TEXTURE_2D, S.low); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); }
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, S.low);
      const pk = typeof LOOK !== 'undefined' && LOOK.ground && typeof patchPic !== 'undefined' && patchPic ? 1 : 0;
      if (pk && !S.patch) S.patch = texFrom(patchPic, true);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, pk ? S.patch : R.none);
      gl.uniform1f(loc.uPatchK, pk); gl.uniform1f(loc.uPatchS, pk ? patchPic.width * 12 : 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, R.buf); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, R.ibuf);
      gl.enableVertexAttribArray(loc.aP); gl.enableVertexAttribArray(loc.aD); gl.enableVertexAttribArray(loc.aW);
      let up = 0;
      for (const k of A.tilesIn(sx, sy, sw, sh)) {
        const t = A.tile(k), m = meshOf(k, A), [x0, y0] = A.at(k);
        let e = null;
        if (t && (up < 6 || S.tex.has(k))) { const had = S.tex.get(k); e = upload(k, t); if (!had || had.ver !== t.ver) up++; }   // (a few new uploads a frame)
        gl.uniform2f(loc.uT0, x0, y0); gl.uniform1f(loc.uLowOnly, e ? 0 : 1);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, e ? e.g : R.none);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, e && e.d ? e.d : R.none);
        gl.bufferData(gl.ARRAY_BUFFER, m.v, gl.STREAM_DRAW); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.ix, gl.STREAM_DRAW);
        gl.vertexAttribPointer(loc.aP, 2, gl.FLOAT, false, 20, 0); gl.vertexAttribPointer(loc.aD, 1, gl.FLOAT, false, 20, 8); gl.vertexAttribPointer(loc.aW, 2, gl.FLOAT, false, 20, 12);
        gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
      }
      return true;   // (kept in the GL canvas: listBegin records what is drawn over it, listEnd puts the frame into v once)
    } catch (err) { failed = true; console.warn('WebGL ground off:', err); return false; }
  };
  // ---- Stage 2: the sorted list's pictures (units, structures, trees, cliffs, walls, houses, props...) ------------------
  // listBegin(v) gives a stand-in for the view canvas: its drawImage calls are recorded as quads (worked out exactly as
  // art.js uprightCtx draws them: an upright picture at its rounded anchor, anything else through the transform), and
  // everything else it is asked to draw (pixels, lines, text) goes to a 2D layer of the same size. listDepth(d) sets the
  // depth (a viewDepth) of what follows, set before each thing in the list from its sort key plus a margin so its own
  // lower edge is not cut by the ground just in front of it. listEnd(v) draws the quads in order over the ground (tested
  // against its depth, not writing their own: the list's order decides between them), then puts them and the layer into v.
  const VS2 = `#version 300 es
in vec2 aP; in vec2 aUV; in float aD; in float aA; uniform vec2 uSize; out vec2 vUV; out float vA;
void main() { vec2 s = aP / uSize * 2.0 - 1.0; gl_Position = vec4(s.x, -s.y, aD, 1.0); vUV = aUV; vA = aA; }`;
  const FS2 = `#version 300 es
precision mediump float; in vec2 vUV; in float vA; out vec4 o; uniform sampler2D uTex, uNrm; uniform float uShowN, uHasN;
void main() {
  vec4 c = texture(uTex, vUV);
  if (uShowN > 0.5) { vec4 nn = texture(uNrm, vUV); vec3 n = uHasN > 0.5 && nn.a > 0.5 ? nn.rgb : vec3(0.25); c = vec4(n * c.a, c.a); }   // (alpha 0 in the normal atlas: no normal map there)   // (?gl=normals: the normal maps)
  o = c * vA;
}`;
  let P2 = null, loc2 = null, layer = null, lctx = null, rec = null, depth = 0, texOf = new WeakMap(), vbuf2 = null;
  function init2() {
    const mk = (t, src) => { const h = gl.createShader(t); gl.shaderSource(h, src); gl.compileShader(h); if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(h)); return h; };
    P2 = gl.createProgram(); gl.attachShader(P2, mk(gl.VERTEX_SHADER, VS2)); gl.attachShader(P2, mk(gl.FRAGMENT_SHADER, FS2)); gl.linkProgram(P2);
    if (!gl.getProgramParameter(P2, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(P2));
    loc2 = {}; for (const n of ['uSize', 'uTex', 'uNrm', 'uShowN', 'uHasN']) loc2[n] = gl.getUniformLocation(P2, n); for (const n of ['aP', 'aUV', 'aD', 'aA']) loc2[n] = gl.getAttribLocation(P2, n);
    vbuf2 = gl.createBuffer();
    layer = mkCanvas(64, 64); lctx = uprightCtx(layer.getContext('2d'));
  }
  function spriteTex(img) {
    let e = texOf.get(img);
    const w = img.width, h = img.height;
    if (e && e.w === w && e.h === h) return e.t;
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    const t = e ? e.t : gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    texOf.set(img, { t, w, h });
    return t;
  }
  // ---- Stage 2b: atlases and normal maps -----------------------------------------------------------------------
  // Pictures up to PIC_MAX px a side are packed into ATL_N textures of ATL px (shelf by shelf, uploaded into place with
  // texSubImage2D); when all are full, the least recently drawn one is emptied. Each atlas has a twin of the same layout
  // for normal maps: a picture's normal map (red, green: its surface's direction turned with the view; blue: height) is
  // worked out from its voxel model (nrmPic, the same projection as voxel.js renderVox) when first drawn, at most NRM_MS
  // ms a frame, and put at the same spot. Larger pictures keep a texture of their own (spriteTex).
  const ATL = 2048, ATL_N = 3, PIC_MAX = 400, NRM_MS = 3;
  const SHOW_N = /[?&]gl=normals\b/.test(q);
  let atl = null, nrmSpend = 0;
  const place = new WeakMap();
  function atlasFor(img) {
    if (img.width > PIC_MAX || img.height > PIC_MAX) return null;
    if (!atl) atl = [];
    let e = place.get(img);
    if (e && atl[e.a] && atl[e.a].gen === e.gen && e.w === img.width && e.h === img.height) { atl[e.a].used = S.frame; return e; }
    const w = img.width, h = img.height;
    let a = atl.findIndex((A) => A && fits(A, w, h));
    if (a < 0 && atl.length < ATL_N) { a = atl.length; atl.push(newAtlas()); }
    if (a < 0) {   // all full: empty the one drawn least lately (its pictures go in again as they are drawn)
      a = 0; for (let i = 1; i < atl.length; i++) if (atl[i].used < atl[a].used) a = i;
      if (atl[a].used === S.frame) return null;   // (all in use this very frame: draw this one on its own)
      atl[a].gen++; atl[a].sh = { x: 0, y: 0, h: 0 };
    }
    const A = atl[a], sh = A.sh;
    if (sh.x + w > ATL) { sh.y += sh.h + 1; sh.x = 0; sh.h = 0; }
    e = { a, gen: A.gen, x: sh.x, y: sh.y, w, h, n: false };
    sh.x += w + 1; sh.h = Math.max(sh.h, h);
    gl.bindTexture(gl.TEXTURE_2D, A.t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, e.x, e.y, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    A.used = S.frame; place.set(img, e);
    return e;
  }
  function fits(A, w, h) { const sh = A.sh; return (sh.x + w <= ATL && sh.y + Math.max(sh.h, h) <= ATL) || (sh.y + sh.h + 1 + h <= ATL && w <= ATL); }
  function newAtlas() {
    const mk = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, ATL, ATL);
      for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
    return { t: mk(), n: mk(), gen: 0, used: 0, sh: { x: 0, y: 0, h: 0 } };
  }
  // A picture's normal map, from its voxel model: voxel.js renderVox's projection and painter's order, kept per pixel as
  // the surface's direction and height instead of a lit colour (null: not from a model, or it would not line up).
  function nrmPic(img) {
    const V = img._vox;
    if (!V || typeof renderVox !== 'function') return null;
    const m = V.m || model(V.mkey, V.build), s = m.surf || (m.surf = surfaceOf(m)), opts = V.opts || {};
    let angle = V.angle;
    const scale = opts.scale || 1, SS = SUPER * scale;
    if (!opts.flat) angle += VIEW.rot;
    const F = opts.flat ? 1 : VIEW.F, VKk = opts.flat ? FLAT_VK : VIEW_VK, ca = Math.cos(angle), sa = Math.sin(angle), ext = 0.5 * (Math.abs(ca) + Math.abs(sa)), n = s.n;
    const px = new Float32Array(n), py = new Float32Array(n);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const cx = s.xs[i] + 0.5, cy = s.ys[i] + 0.5 + (m.py || 0), xr = cx * ca - cy * sa, yr = (cx * sa + cy * ca) * F, z = s.zs[i];
      px[i] = xr; py[i] = yr;
      minX = Math.min(minX, xr - ext); maxX = Math.max(maxX, xr + ext); minY = Math.min(minY, yr - ext * F - (z + 1) * VKk); maxY = Math.max(maxY, yr + ext * F - z * VKk);
    }
    minX = Math.floor(minX); minY = Math.floor(minY);
    const W = Math.max(1, Math.ceil((maxX - minX) * scale) + 1), H = Math.max(1, Math.ceil((maxY - minY) * scale) + 1);
    if (W !== img.width || H !== img.height) return null;
    const BW = W * SUPER, BH = H * SUPER, buf = new Uint32Array(BW * BH), order = new Uint32Array(n), key = new Float64Array(n);
    for (let i = 0; i < n; i++) { order[i] = i; key[i] = py[i] / F * VKk + s.zs[i] * F; }
    order.sort((p, q2) => key[p] - key[q2]);
    for (let k = 0; k < n; k++) {
      const i = order[k], z = s.zs[i], nxr = s.nx[i] * ca - s.ny[i] * sa, nyr = s.nx[i] * sa + s.ny[i] * ca;
      const pix = (255 << 24) | (Math.min(255, Math.round((z + 0.5) * 3)) << 16) | (Math.round((nyr * 0.5 + 0.5) * 255) << 8) | Math.round((nxr * 0.5 + 0.5) * 255);
      const x0 = Math.floor((px[i] - ext - minX) * SS), x1 = Math.ceil((px[i] + ext - minX) * SS);
      const y0 = Math.floor((py[i] - ext * F - (z + 1) * VKk - minY) * SS), y1 = Math.ceil((py[i] + ext * F - z * VKk - minY) * SS);
      for (let yy = Math.max(0, y0); yy < Math.min(BH, y1); yy++) { const row = yy * BW; for (let xx = Math.max(0, x0); xx < Math.min(BW, x1); xx++) buf[row + xx] = pix; }
    }
    const c = mkCanvas(W, H), d = c.getContext('2d').createImageData(W, H), D = d.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {   // the middle sample of each pixel (crisp: directions are not averaged)
      const p = buf[(y * SUPER + (SUPER >> 1)) * BW + x * SUPER + (SUPER >> 1)] || buf[(y * SUPER) * BW + x * SUPER];
      if (!p) continue;
      const o = (y * W + x) * 4; D[o] = p & 255; D[o + 1] = (p >> 8) & 255; D[o + 2] = (p >> 16) & 255; D[o + 3] = 255;
    }
    c.getContext('2d').putImageData(d, 0, 0);
    return c;
  }
  function withNormal(img, e) {
    if (e.n || nrmSpend > NRM_MS) return;
    const t0 = performance.now(), c = img._nrm !== undefined ? img._nrm : (img._nrm = nrmPic(img));
    nrmSpend += performance.now() - t0;
    e.n = true;
    if (!c) { e.none = true; if (img._vox) R.nrmMismatch = (R.nrmMismatch || 0) + 1; else if (!img._shade) R.nrmNone = (R.nrmNone || 0) + 1; return; }   // (counts: a model's picture that did not line up; a picture not from a model)
    gl.bindTexture(gl.TEXTURE_2D, atl[e.a].n); gl.texSubImage2D(gl.TEXTURE_2D, 0, e.x, e.y, gl.RGBA, gl.UNSIGNED_BYTE, c);
    R.normals = (R.normals || 0) + 1;
  }
  // Which picture each sprite came from (models.js sprite, wrapped here: models.js and voxel.js are not changed, as the
  // baked sprites' check hashes them), so its normal map can be worked out later; baked sprites get it when first asked for.
  if (typeof renderVox === 'function') {   // every voxel picture: its model, facing and options
    const origR = renderVox;
    renderVox = function (m, angle, opts) { const out = origR(m, angle, opts); if (out && out.img && !(opts && opts.normal)) { out.img._vox = { m, angle, opts }; if (out.sh) out.sh._shade = true; } return out; };   // (_shade: a cast shadow, flat: no normal map)
  }
  if (typeof sprite === 'function') {
    const orig = sprite;
    sprite = function (mkey, build, angle, fkey, opts) {
      const s2 = orig(mkey, build, angle, fkey, opts);
      if (s2 && s2.img && !s2.img._vox) {
        const flat = FLAT_PASS, k = (flat ? mkey + '~flat' : mkey) + '|' + fkey;
        if (spriteCache2.get(k) === s2) s2.img._vox = { mkey: flat ? mkey + '~flat' : mkey, build, angle, opts: flat ? Object.assign({}, opts, { flat: true }) : opts };
      }
      return s2;
    };
  }
  // Bits that are not pictures (pixels, lines, paths, text, unusual blends) are drawn on the 2D layer and, before the next
  // picture or the next thing in the list, cut out of it at the box they cover into a per-frame atlas (ATLAS px squares),
  // as a quad of their own in the same order: so a flag behind a unit no longer shows through it.
  const ATLAS = 1024, BLENDS = { 'source-over': 0, lighter: 1, multiply: 2, screen: 3 };
  let atlases = [], shelf = null, dirty = null, pathBox = null;
  const grow = (b, x, y, r) => { if (!b) return [x - r, y - r, x + r, y + r]; b[0] = Math.min(b[0], x - r); b[1] = Math.min(b[1], y - r); b[2] = Math.max(b[2], x + r); b[3] = Math.max(b[3], y + r); return b; };
  const tp = (x, y) => { const m = lctx.getTransform(); return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]; };
  const scl = () => { const m = lctx.getTransform(); return Math.hypot(m.a, m.b) + Math.hypot(m.c, m.d); };
  // (stage 3) The blend the bits are drawn with: when it changes between two WebGL does, what is on the layer is cut out
  // first and drawn with its own (a glow drawn 'lighter' adds, as in 2D); other blends act on the layer as it is.
  let dirtyOp = 'source-over';
  const mark = (b) => {
    if (!b) return;
    const op = lctx.globalCompositeOperation;
    if (BLENDS[op] === undefined) R.unsupported[op] = (R.unsupported[op] || 0) + 1;
    else if (op !== dirtyOp) { if (dirty) flush(); dirtyOp = op; }
    dirty = dirty ? grow(grow(dirty, b[0], b[1], 0), b[2], b[3], 0) : b.slice();
  };
  function atlasSpot(w, h) {
    if (w > ATLAS || h > ATLAS) return null;
    if (!shelf || shelf.x + w > ATLAS) { if (shelf) { shelf.y += shelf.h; shelf.x = 0; shelf.h = 0; } }
    if (!shelf || shelf.y + h > ATLAS) {
      const i = shelf ? shelf.i + 1 : 0;
      if (!atlases[i]) atlases[i] = { c: mkCanvas(ATLAS, ATLAS), t: null };
      atlases[i].c.getContext('2d').clearRect(0, 0, ATLAS, ATLAS); atlases[i].used = true;
      shelf = { i, x: 0, y: 0, h: 0 };
    }
    const at = { i: shelf.i, x: shelf.x, y: shelf.y };
    shelf.x += w + 1; shelf.h = Math.max(shelf.h, h + 1);
    return at;
  }
  function flush() {
    if (!dirty) return;
    const W = layer.width, H = layer.height, x0 = Math.max(0, Math.floor(dirty[0]) - 1), y0 = Math.max(0, Math.floor(dirty[1]) - 1);
    const x1 = Math.min(W, Math.ceil(dirty[2]) + 1), y1 = Math.min(H, Math.ceil(dirty[3]) + 1), w = x1 - x0, h = y1 - y0;
    dirty = null;
    if (w <= 0 || h <= 0) return;
    const raw = layer.getContext('2d'), PC = 512;   // (a big box in pieces)
    for (let py = y0; py < y1; py += PC) for (let px = x0; px < x1; px += PC) {
      const pw = Math.min(PC, x1 - px), ph = Math.min(PC, y1 - py), at = atlasSpot(pw, ph);
      if (!at) continue;
      atlases[at.i].c.getContext('2d').drawImage(layer, px, py, pw, ph, at.x, at.y, pw, ph);
      rec.push({ atlas: at.i, q: [px, py, px + pw, py, px, py + ph, px + pw, py + ph], u0: at.x / ATLAS, v0: at.y / ATLAS, u1: (at.x + pw) / ATLAS, v1: (at.y + ph) / ATLAS, a: 1, b: BLENDS[dirtyOp] || 0, d: depth });
      R.bits = (R.bits || 0) + 1;
    }
    const m = raw.getTransform(); raw.setTransform(1, 0, 0, 1, 0, 0); raw.clearRect(x0, y0, w, h); raw.setTransform(m);
  }
  R.unsupported = {};
  R.listBegin = (v) => {
    if (failed || !gl) return null;
    try { if (!P2) init2(); } catch (err) { failed = true; console.warn('WebGL list off:', err); const k = v.getTransform(); v.setTransform(1, 0, 0, 1, 0, 0); v.drawImage(cv, 0, 0); v.setTransform(k); return null; }   // (the ground at least)
    if (layer.width !== cv.width || layer.height !== cv.height) { layer.width = cv.width; layer.height = cv.height; lctx = uprightCtx(layer.getContext('2d')); }
    lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, layer.width, layer.height);
    lctx.setTransform(v.getTransform()); lctx.upright = v.upright; lctx.imageSmoothingEnabled = false; lctx.globalAlpha = 1; lctx.globalCompositeOperation = 'source-over';
    lctx.fillStyle = '#000'; lctx.strokeStyle = '#000'; lctx.lineWidth = 1;
    rec = []; dirty = null; dirtyOp = 'source-over'; pathBox = null; shelf = null; depth = -1; R.bits = 0;
    for (const a of atlases) a.used = false;
    const draw = (img, ...a) => {
      if (!img || !img.width || !img.height || (img.complete === false)) return;
      const n = a.length, j = n === 8 ? 4 : 0, dx = a[j], dy = a[j + 1];
      const w = n === 2 ? img.width : a[j + 2], h = n === 2 ? img.height : a[j + 3];
      const sx = n === 8 ? a[0] : 0, sy = n === 8 ? a[1] : 0, sw = n === 8 ? a[2] : img.width, sh = n === 8 ? a[3] : img.height;
      const m = lctx.getTransform(), sprite = img._ox !== undefined;
      let q;
      if (!sprite && !lctx.upright) {
        const P = (x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
        q = [...P(dx, dy), ...P(dx + w, dy), ...P(dx, dy + h), ...P(dx + w, dy + h)];
      } else {
        const ax = sprite ? dx - img._ox - sx : dx + w / 2, ay = sprite ? dy - img._oy - sy : dy + h / 2;
        const X = Math.round(m.a * ax + m.c * ay + m.e + dx - ax), Y = Math.round(m.b * ax + m.d * ay + m.f + dy - ay);
        q = [X, Y, X + w, Y, X, Y + h, X + w, Y + h];
      }
      const op = lctx.globalCompositeOperation, b = BLENDS[op];
      if (b === undefined) {   // a blend WebGL is not asked to do: drawn on the layer, cut out in order like the other bits
        mark([Math.min(q[0], q[2], q[4], q[6]), Math.min(q[1], q[3], q[5], q[7]), Math.max(q[0], q[2], q[4], q[6]), Math.max(q[1], q[3], q[5], q[7])]);
        lctx.drawImage(img, ...a);
        return;
      }
      flush();
      rec.push({ img, q, u0: sx / img.width, v0: sy / img.height, u1: (sx + sw) / img.width, v1: (sy + sh) / img.height, a: lctx.globalAlpha, b, d: depth, s: lctx.imageSmoothingEnabled && (Math.abs(w) !== sw || Math.abs(h) !== sh) ? 1 : 0 });   // (s: stretched with smoothing on, as the haze past the edge: sampled smooth)
    };
    // The canvas's own drawImage (trees, with their sway's shear): through the transform as it is, no upright anchor.
    const rawDraw = function (img, ...a) { const up = lctx.upright, ox = img._ox; lctx.upright = false; if (ox !== undefined) img._ox = undefined; try { draw(img, ...a); } finally { lctx.upright = up; if (ox !== undefined) img._ox = ox; } };
    // What a drawing call covers on the layer (screen px), so it can be cut out.
    const lw = () => (lctx.lineWidth || 1) * scl() / 2 + 2;
    const hooks = {
      beginPath() { pathBox = null; lctx.beginPath(); },
      moveTo(x, y) { const [X, Y] = tp(x, y); pathBox = grow(pathBox, X, Y, 0); lctx.moveTo(x, y); },
      lineTo(x, y) { const [X, Y] = tp(x, y); pathBox = grow(pathBox, X, Y, 0); lctx.lineTo(x, y); },
      quadraticCurveTo(a, b, x, y) { for (const [p, q] of [[a, b], [x, y]]) { const [X, Y] = tp(p, q); pathBox = grow(pathBox, X, Y, 0); } lctx.quadraticCurveTo(a, b, x, y); },
      bezierCurveTo(a, b, c, d, x, y) { for (const [p, q] of [[a, b], [c, d], [x, y]]) { const [X, Y] = tp(p, q); pathBox = grow(pathBox, X, Y, 0); } lctx.bezierCurveTo(a, b, c, d, x, y); },
      arc(x, y, r, ...k) { const [X, Y] = tp(x, y); pathBox = grow(pathBox, X, Y, r * scl()); lctx.arc(x, y, r, ...k); },
      ellipse(x, y, rx, ry, ...k) { const [X, Y] = tp(x, y); pathBox = grow(pathBox, X, Y, Math.max(rx, ry) * scl()); lctx.ellipse(x, y, rx, ry, ...k); },
      rect(x, y, w, h) { for (const [p, q] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) { const [X, Y] = tp(p, q); pathBox = grow(pathBox, X, Y, 0); } lctx.rect(x, y, w, h); },
      fill(...a) { mark(pathBox && [pathBox[0] - 1, pathBox[1] - 1, pathBox[2] + 1, pathBox[3] + 1]); lctx.fill(...a); },
      stroke(...a) { const r = lw(); mark(pathBox && [pathBox[0] - r, pathBox[1] - r, pathBox[2] + r, pathBox[3] + r]); lctx.stroke(...a); },
      fillRect(x, y, w, h) { box4(x, y, w, h, 1); lctx.fillRect(x, y, w, h); },
      strokeRect(x, y, w, h) { box4(x, y, w, h, lw()); lctx.strokeRect(x, y, w, h); },
      fillText(t, x, y, ...k) { const wd = lctx.measureText(t).width, f = parseFloat(lctx.font) || 12, m = lctx.getTransform(), X = m.a * x + m.c * y + m.e, Y = m.b * x + m.d * y + m.f; mark([X - wd - 4, Y - f * 1.5, X + wd + 4, Y + f]); lctx.fillText(t, x, y, ...k); },
      strokeText(t, x, y, ...k) { const wd = lctx.measureText(t).width, f = parseFloat(lctx.font) || 12, m = lctx.getTransform(), X = m.a * x + m.c * y + m.e, Y = m.b * x + m.d * y + m.f; mark([X - wd - 6, Y - f * 1.5, X + wd + 6, Y + f]); lctx.strokeText(t, x, y, ...k); },
      putImageData() { R.unsupported.putImageData = 1; },
    };
    function box4(x, y, w, h, r) {
      if (lctx.upright) { const m = lctx.getTransform(), cx = x + w / 2, cy = y + h / 2, X = m.a * cx + m.c * cy + m.e, Y = m.b * cx + m.d * cy + m.f; mark([X - Math.abs(w) / 2 - r, Y - Math.abs(h) / 2 - r, X + Math.abs(w) / 2 + r, Y + Math.abs(h) / 2 + r]); return; }
      let b = null; for (const [p, q] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) { const [X, Y] = tp(p, q); b = grow(b, X, Y, r); } mark(b);
    }
    return new Proxy(lctx, {
      get(t, k) { if (k === 'drawImage') return draw; if (k === '_rawDraw') return rawDraw; if (hooks[k]) return hooks[k]; const x = t[k]; return typeof x === 'function' ? x.bind(t) : x; },
      set(t, k, val) { t[k] = val; return true; },
    });
  };
  // The depth of what follows: a viewDepth (tested against the ground), or null: drawn over the ground wherever it is
  // (marks on the ground drawn before the list: tracks, shadows, fog).
  R.listDepth = (d) => { if (!rec) return; flush(); depth = d === null ? -1 : 1 - 2 * (d + 64) / (2 * WORLD + 128); };
  R.listEnd = (v) => {
    if (!rec) return;
    try {
      flush();
      gl.useProgram(P2); gl.viewport(0, 0, cv.width, cv.height);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.enable(gl.BLEND);
      gl.uniform2f(loc2.uSize, cv.width, cv.height); gl.uniform1i(loc2.uTex, 0); gl.activeTexture(gl.TEXTURE0);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      for (const a of atlases) if (a.used) {   // this frame's bits, uploaded once
        if (!a.t) { a.t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, a.t); for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
        gl.bindTexture(gl.TEXTURE_2D, a.t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a.c);
      }
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      nrmSpend = 0;
      // Where each quad's picture is: an atlas (with its normal map), a texture of its own, or this frame's bits.
      for (const r of rec) {
        if (r.atlas !== undefined) { r.tex = atlases[r.atlas].t; continue; }
        const e = atlasFor(r.img);
        if (e) {
          withNormal(r.img, e);
          const iw = r.img.width, ih = r.img.height;
          r.tex = atl[e.a].t; r.ntex = atl[e.a].n;
          r.u0 = (e.x + r.u0 * iw) / ATL; r.u1 = (e.x + r.u1 * iw) / ATL; r.v0 = (e.y + r.v0 * ih) / ATL; r.v1 = (e.y + r.v1 * ih) / ATL;
        } else r.tex = spriteTex(r.img);
      }
      const f = new Float32Array(rec.length * 36);
      let o = 0;
      for (const r of rec) {
        const [x0, y0, x1, y1, x2, y2, x3, y3] = r.q;
        for (const [x, y, u, vv] of [[x0, y0, r.u0, r.v0], [x1, y1, r.u1, r.v0], [x2, y2, r.u0, r.v1], [x1, y1, r.u1, r.v0], [x3, y3, r.u1, r.v1], [x2, y2, r.u0, r.v1]]) { f[o++] = x; f[o++] = y; f[o++] = u; f[o++] = vv; f[o++] = r.d; f[o++] = r.a; }
      }
      gl.useProgram(P2);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbuf2); gl.bufferData(gl.ARRAY_BUFFER, f, gl.STREAM_DRAW);
      for (const n of ['aP', 'aUV', 'aD', 'aA']) gl.enableVertexAttribArray(loc2[n]);
      gl.vertexAttribPointer(loc2.aP, 2, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(loc2.aUV, 2, gl.FLOAT, false, 24, 8); gl.vertexAttribPointer(loc2.aD, 1, gl.FLOAT, false, 24, 16); gl.vertexAttribPointer(loc2.aA, 1, gl.FLOAT, false, 24, 20);
      gl.uniform1i(loc2.uNrm, 1); gl.uniform1f(loc2.uShowN, SHOW_N ? 1 : 0);
      const BF = [[gl.ONE, gl.ONE_MINUS_SRC_ALPHA], [gl.ONE, gl.ONE], [gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA], [gl.ONE, gl.ONE_MINUS_SRC_COLOR]];
      let start = 0, calls = 0;
      for (let i = 1; i <= rec.length; i++) {   // runs of the same texture and blend in one call
        const a = rec[start], r = rec[i];
        if (r && r.tex === a.tex && r.b === a.b && r.ntex === a.ntex && (r.s | 0) === (a.s | 0)) continue;
        if (!R.linS) { R.linS = gl.createSampler(); for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.samplerParameteri(R.linS, k, gl.LINEAR); gl.samplerParameteri(R.linS, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.samplerParameteri(R.linS, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
        gl.bindSampler(0, a.s ? R.linS : null);
        gl.blendFunc(BF[a.b][0], BF[a.b][1]);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, a.ntex || R.none); gl.uniform1f(loc2.uHasN, a.ntex ? 1 : 0);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.tex);
        gl.drawArrays(gl.TRIANGLES, start * 6, (i - start) * 6); calls++;
        start = i;
      }
      gl.bindSampler(0, null);
      R.calls = calls;
      gl.depthMask(true); gl.disable(gl.BLEND);
      R.quads = rec.length;
      const keep = v.getTransform(); v.setTransform(1, 0, 0, 1, 0, 0); v.drawImage(cv, 0, 0); v.setTransform(keep);   // (the one copy a frame)
    } catch (err) { failed = true; console.warn('WebGL list off:', err); }
    rec = null;
  };
  R.off = () => { failed = true; };
  return R;
})();
