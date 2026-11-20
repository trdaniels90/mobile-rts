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
precision highp float; in vec2 vW; layout(location = 0) out vec4 o; layout(location = 1) out vec4 o1;
uniform sampler2D uT, uD, uLow, uPatch; uniform vec2 uT0; uniform float uTile, uWorld, uLowOnly, uPatchK, uPatchS;
float sl(float b, float s) { float d = b <= 0.25 ? ((16.0 * b - 12.0) * b + 4.0) * b : sqrt(b); return s <= 0.5 ? b - (1.0 - 2.0 * s) * b * (1.0 - b) : b + (2.0 * s - 1.0) * (d - b); }
void main() {
  vec2 uv = (vW - uT0) / uTile;
  vec4 c = uLowOnly > 0.5 ? texture(uLow, vW / uWorld) : texture(uT, uv);
  vec4 d = texture(uD, uv); c.rgb = mix(c.rgb, d.rgb, d.a * (1.0 - uLowOnly));
  if (uPatchK > 0.0) { vec4 p = texture(uPatch, vW / uPatchS); vec3 s = vec3(sl(c.r, p.r), sl(c.g, p.g), sl(c.b, p.b)); c.rgb = mix(c.rgb, s, p.a * uPatchK); }
  o = vec4(c.rgb, 1.0); o1 = vec4(0.0, 0.0, 0.0, 1.0);   // (o1: the normals' layer; the ground: none, lit flat)
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
    R.lit = false;   // (set again by listEnd when this frame's light pass ran)
    if (failed || R.paused || !G || !G.ground || !G.ground.gl) return false;   // (paused: tools draw a frame the 2D way to compare)
    try {
      if (!gl && !init()) return false;
      state(); S.frame++; R.frames++;
      const A = G.ground.gl;
      if (cv.width !== VW || cv.height !== VH) { cv.width = VW; cv.height = VH; }
      sceneFb(VW, VH);   // (stage 4: into the scene's framebuffer, colour and normals; the light pass draws it into the canvas)
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
precision mediump float; in vec2 vUV; in float vA; layout(location = 0) out vec4 o; layout(location = 1) out vec4 o1;
uniform sampler2D uTex, uNrm; uniform float uShowN, uHasN, uOver;
void main() {
  vec4 c = texture(uTex, vUV), nn = texture(uNrm, vUV);
  bool has = uHasN > 0.5 && nn.a > 0.5;   // (alpha 0 in the normal atlas: no normal map there)
  if (uShowN > 0.5) { vec3 n = has ? nn.rgb : vec3(0.25); c = vec4(n * c.a, c.a); }   // (?gl=normals: the normal maps)
  o = c * vA;
  // Stage 4: the normals' layer (premultiplied like the colour; rgb 0: no normal, lit flat). Only pictures laid over
  // what is under them write it; added, multiplied and screened ones leave it as it is.
  o1 = uOver > 0.5 ? vec4(has ? nn.rgb : vec3(0.0), 1.0) * (c.a * vA) : vec4(0.0);
}`;
  let P2 = null, loc2 = null, layer = null, lctx = null, rec = null, depth = 0, texOf = new WeakMap(), vbuf2 = null;
  function init2() {
    const mk = (t, src) => { const h = gl.createShader(t); gl.shaderSource(h, src); gl.compileShader(h); if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(h)); return h; };
    P2 = gl.createProgram(); gl.attachShader(P2, mk(gl.VERTEX_SHADER, VS2)); gl.attachShader(P2, mk(gl.FRAGMENT_SHADER, FS2)); gl.linkProgram(P2);
    if (!gl.getProgramParameter(P2, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(P2));
    loc2 = {}; for (const n of ['uSize', 'uTex', 'uNrm', 'uShowN', 'uHasN', 'uOver']) loc2[n] = gl.getUniformLocation(P2, n); for (const n of ['aP', 'aUV', 'aD', 'aA']) loc2[n] = gl.getAttribLocation(P2, n);
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
  R.listBegin = (v, over) => {
    if (failed || !gl) return null;
    if (!over) R.lit = false;
    try { if (!P2) init2(); } catch (err) { failed = true; console.warn('WebGL list off:', err); try { lightPass(null); copyOut(v); } catch (e2) { /* nothing more to do */ } return null; }   // (the ground at least)
    if (layer.width !== cv.width || layer.height !== cv.height) { layer.width = cv.width; layer.height = cv.height; lctx = uprightCtx(layer.getContext('2d')); }
    lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, layer.width, layer.height);
    if (over) { lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.upright = false; } else { lctx.setTransform(v.getTransform()); lctx.upright = v.upright; }   // (over: screen px of the canvas) lctx.imageSmoothingEnabled = false; lctx.globalAlpha = 1; lctx.globalCompositeOperation = 'source-over';
    lctx.fillStyle = '#000'; lctx.strokeStyle = '#000'; lctx.lineWidth = 1;
    rec = []; dirty = null; dirtyOp = 'source-over'; pathBox = null; shelf = null; depth = -1; if (!over) R.bits = 0;
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
  // Draws the recorded quads (into the bound framebuffer: the scene's, tested against the ground's depth; or the canvas,
  // without depth, for what goes over the light pass).
  function drawRec(useDepth) {
    gl.useProgram(P2); gl.viewport(0, 0, cv.width, cv.height);
    if (useDepth) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); } else gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false); gl.enable(gl.BLEND);
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
    const calls = drawQuads(rec, true);
    gl.bindSampler(0, null);
    R.calls += calls; R.quads += rec.length;
    gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
  }
  // Quads ({ q, u0..v1, d, a, b, tex, ntex, s }) in runs of the same texture, blend and sampling; P2 in use. Returns the calls.
  function drawQuads(list, normals) {
    const f = new Float32Array(list.length * 36);
    let o = 0;
    for (const r of list) {
      const [x0, y0, x1, y1, x2, y2, x3, y3] = r.q;
      for (const [x, y, u, vv] of [[x0, y0, r.u0, r.v0], [x1, y1, r.u1, r.v0], [x2, y2, r.u0, r.v1], [x1, y1, r.u1, r.v0], [x3, y3, r.u1, r.v1], [x2, y2, r.u0, r.v1]]) { f[o++] = x; f[o++] = y; f[o++] = u; f[o++] = vv; f[o++] = r.d; f[o++] = r.a; }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, vbuf2); gl.bufferData(gl.ARRAY_BUFFER, f, gl.STREAM_DRAW);
    for (const n of ['aP', 'aUV', 'aD', 'aA']) gl.enableVertexAttribArray(loc2[n]);
    gl.vertexAttribPointer(loc2.aP, 2, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(loc2.aUV, 2, gl.FLOAT, false, 24, 8); gl.vertexAttribPointer(loc2.aD, 1, gl.FLOAT, false, 24, 16); gl.vertexAttribPointer(loc2.aA, 1, gl.FLOAT, false, 24, 20);
    gl.uniform1i(loc2.uNrm, 1); gl.uniform1f(loc2.uShowN, normals && SHOW_N ? 1 : 0);
    if (!R.linS) { R.linS = gl.createSampler(); for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.samplerParameteri(R.linS, k, gl.LINEAR); gl.samplerParameteri(R.linS, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.samplerParameteri(R.linS, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
    const BF = [[gl.ONE, gl.ONE_MINUS_SRC_ALPHA], [gl.ONE, gl.ONE], [gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA], [gl.ONE, gl.ONE_MINUS_SRC_COLOR]];
    let start = 0, calls = 0;
    for (let i = 1; i <= list.length; i++) {   // runs of the same texture and blend in one call
      const a = list[start], r = list[i];
      if (r && r.tex === a.tex && r.b === a.b && r.ntex === a.ntex && (r.s | 0) === (a.s | 0)) continue;
      gl.bindSampler(0, a.s ? R.linS : null);
      if (a.b >= 0) gl.blendFunc(BF[a.b][0], BF[a.b][1]);   // (-1: the blend set by the caller)
      gl.uniform1f(loc2.uOver, a.b === 0 && normals ? 1 : 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, (normals && a.ntex) || R.none); gl.uniform1f(loc2.uHasN, normals && a.ntex ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.tex);
      gl.drawArrays(gl.TRIANGLES, start * 6, (i - start) * 6); calls++;
      start = i;
    }
    gl.bindSampler(0, null);
    return calls;
  }
  // ---- Stage 4: the light pass -------------------------------------------------------------------------------------
  // The ground and the pictures are drawn into the scene's framebuffer: its colour, and a second layer with the pictures'
  // normals (from the normal atlases; none on the ground and on pictures not from a voxel model). The light pass then
  // draws the scene into the canvas lit as the 2D renderer lit the screen after it (look.js drawLook: the map's mood,
  // the low sun's gradient, haze, cloud shadows, the shade with holes where things glow, the glow, the pools, the
  // vignette; art.js drawNight: dusk's amber, the darkness with holes, the warm light), from the same light lists
  // (lookDayLights, nightLights), splatted into half-size buffers with the same pictures as in 2D:
  //   0 holes (red: drawLook's shade, green: the night's darkness: each light takes its share away, as destination-out),
  //   1 glow (MAX: each spot as bright as its brightest light, so overlapping blasts never pile up into white: owner),
  //   2 the night's warm light (added), 3 the pools' colour by day (screened).
  // New with WebGL: where a picture has a normal map, its side facing a light gets more of it and its far side less: the
  // light's direction at a pixel is read from the slope of the light buffers (brighter toward the light), and the light
  // it gets is scaled by how much the surface faces that way (GLR.nrmK: how strongly; 0 lights flat, as 2D; ?gl=flatlight). Defences give off no light (the lists).
  // Then what goes over the light (lamps, beacons, navigation lights, searchlights, the pools by night, the storm's
  // darkening, rain and snow, lightning) is recorded through the same stand-in (L.over) and drawn on top.
  R.nrmK = /[?&]gl=flatlight\b/.test(q) ? 0 : 0.85;
  let SC = null, LB = null, P3 = null, loc3 = null, tri = null, cloudT = null;
  function sceneFb(w, h) {
    if (!SC || SC.w !== w || SC.h !== h) {
      if (SC) { gl.deleteTexture(SC.c); gl.deleteTexture(SC.n); gl.deleteRenderbuffer(SC.d); gl.deleteFramebuffer(SC.f); }
      const mk = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
        for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
      SC = { w, h, c: mk(), n: mk(), d: gl.createRenderbuffer(), f: gl.createFramebuffer() };
      gl.bindRenderbuffer(gl.RENDERBUFFER, SC.d); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, SC.f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, SC.c, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, SC.n, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, SC.d);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, SC.f); gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  }
  function lightBufs(w, h) {
    if (LB && LB.w === w && LB.h === h) return LB;
    if (LB) for (const b of LB.b) { gl.deleteTexture(b.t); gl.deleteFramebuffer(b.f); }
    LB = { w, h, b: [0, 1, 2, 3].map(() => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
      for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR);   // (stretched up smoothly, as in 2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      return { t, f };
    }) };
    return LB;
  }
  const VS3 = `#version 300 es
in vec2 aQ; void main() { gl_Position = vec4(aQ, 0.0, 1.0); }`;
  const FS3 = `#version 300 es
precision highp float; out vec4 o;
uniform sampler2D uScene, uNrm, uSh, uGlow, uWarm, uPool, uCloud;
uniform vec2 uSize, uOrg, uCam, uScr, uHalf;
uniform float uLook, uSat, uGlowK, uCloudK, uWarmK, uNight, uT, uNrmK;
uniform vec3 uGrade; uniform vec4 uSun, uShade, uHaze, uTint, uVig;
float sl(float b, float s) { float d = b <= 0.25 ? ((16.0 * b - 12.0) * b + 4.0) * b : sqrt(b); return s <= 0.5 ? b - (1.0 - 2.0 * s) * b * (1.0 - b) : b + (2.0 * s - 1.0) * (d - b); }
float lightAt(vec2 uv) { vec4 h = texture(uSh, uv); return (1.0 - h.r) + (1.0 - h.g) + dot(texture(uGlow, uv).rgb + texture(uWarm, uv).rgb, vec3(0.333)); }
void main() {
  vec2 uv = gl_FragCoord.xy / uSize, P = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  vec3 c = texture(uScene, uv).rgb;
  float nf = 1.0;   // how much this pixel's surface faces the light here (1: flat, as 2D)
  vec4 nn = texture(uNrm, uv);
  if (uNrmK > 0.0 && nn.a > 0.5 && nn.r + nn.g > 0.01) {
    vec2 nxy = nn.rg / nn.a * 2.0 - 1.0; vec3 n = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
    vec2 d = 2.0 / uHalf;
    vec2 g = vec2(lightAt(uv + vec2(d.x, 0.0)) - lightAt(uv - vec2(d.x, 0.0)), lightAt(uv - vec2(0.0, d.y)) - lightAt(uv + vec2(0.0, d.y)));   // (x right, y toward the camera: down the view)
    // Sides facing the light brighter, sides turned away darker, as much as the light has a clear direction here (the
    // slope's steepness) and less on tops (facing up): on average as bright as 2D, so the pictures keep their colours.
    float m = length(g), w = m > 1e-4 ? smoothstep(0.0, 0.05, m) * (1.0 - 0.6 * n.z) : 0.0;
    float f = m > 1e-4 ? dot(n.xy, g / m) : 0.0;
    nf = 1.0 + uNrmK * w * (f > 0.0 ? 0.75 * f : 0.3 * f);   // (turned away: only a little darker, so a blast's glow is not lost on what stands round it)
  }
  vec2 s = (P + uOrg - uCam) / uScr;   // where on the screen (0..1)
  if (uLook > 0.5) {   // look.js drawLook
    c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), uSat);
    c *= uGrade;
    vec2 D = vec2(0.8, 1.2) * uScr; float t = clamp(dot(s * uScr, D) / dot(D, D), 0.0, 1.0);
    vec4 sg = t < 0.45 ? vec4(uSun.rgb, uSun.a * (1.0 - t / 0.45)) : vec4(uShade.rgb, uShade.a * (t - 0.45) / 0.55);
    c = mix(c, vec3(sl(c.r, sg.r), sl(c.g, sg.g), sl(c.b, sg.b)), sg.a);
    if (uHaze.a > 0.005) { float a = uHaze.a * mix(1.0, 0.35, clamp(s.y, 0.0, 1.0)); c = mix(c, c + uHaze.rgb - c * uHaze.rgb, a); }
    if (uCloudK > 0.0) { vec2 X = P + uOrg; c = mix(c, c * texture(uCloud, vec2((X.x - uT * 9.0) / 7.0, (X.y - uT * 3.5) / 5.25) / 256.0).rgb, uCloudK); }
    float lit = clamp((1.0 - texture(uSh, uv).r) * nf, 0.0, 1.0);
    c = mix(c, uTint.rgb, uTint.a * (1.0 - lit));
    c = min(c + texture(uGlow, uv).rgb * uGlowK * nf, 1.0);
    vec3 pl = min(texture(uPool, uv).rgb * nf, 1.0); c = c + pl - c * pl;
    vec2 q = (s - 0.5) * uScr; float r0 = min(uScr.x, uScr.y) * 0.35, r1 = length(uScr) * 0.6;
    c = mix(c, uVig.rgb, uVig.a * clamp((length(q) - r0) / (r1 - r0), 0.0, 1.0));
  }
  if (uWarmK > 0.0) c = mix(c, c * vec3(1.0, 0.6667, 0.4314), uWarmK);   // art.js drawNight: dusk and dawn
  if (uNight > 0.0) {
    float lit = clamp((1.0 - texture(uSh, uv).g) * nf, 0.0, 1.0);
    c = mix(c, vec3(0.0235, 0.047, 0.1333), 0.62 * uNight * (1.0 - lit));
    c = min(c + texture(uWarm, uv).rgb * nf, 1.0);
  }
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
  function init3() {
    const mk = (t, src) => { const h = gl.createShader(t); gl.shaderSource(h, src); gl.compileShader(h); if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(h)); return h; };
    P3 = gl.createProgram(); gl.attachShader(P3, mk(gl.VERTEX_SHADER, VS3)); gl.attachShader(P3, mk(gl.FRAGMENT_SHADER, FS3)); gl.linkProgram(P3);
    if (!gl.getProgramParameter(P3, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(P3));
    loc3 = { aQ: gl.getAttribLocation(P3, 'aQ') };
    for (const n of ['uScene', 'uNrm', 'uSh', 'uGlow', 'uWarm', 'uPool', 'uCloud', 'uSize', 'uOrg', 'uCam', 'uScr', 'uHalf', 'uLook', 'uSat', 'uGlowK', 'uCloudK', 'uWarmK', 'uNight', 'uT', 'uNrmK', 'uGrade', 'uSun', 'uShade', 'uHaze', 'uTint', 'uVig']) loc3[n] = gl.getUniformLocation(P3, n);
    tri = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, tri); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  }
  // Soft pictures (lights) into a light buffer: [picture, view x, view y, w, h, alpha]; the blend set by the caller.
  function splat(list, L, hw, hh, sc) {
    if (!list.length) return;
    const quads = [];
    for (const [img, x, y, w, h, a] of list) {
      const X = (x - L.vx) * sc, Y = (y - L.vy) * sc, W2 = w * sc, H2 = h * sc;
      if (X > hw || Y > hh || X + W2 < 0 || Y + H2 < 0 || a <= 0) continue;
      quads.push({ q: [X, Y, X + W2, Y, X, Y + H2, X + W2, Y + H2], u0: 0, v0: 0, u1: 1, v1: 1, d: 0, a: Math.min(1, a), b: -1, tex: spriteTex(img), s: 1 });
    }
    const by = new Map(); for (const r of quads) { const l = by.get(r.tex); if (l) l.push(r); else by.set(r.tex, [r]); }   // (every blend used here is order-free: grouped by picture)
    quads.length = 0; for (const l of by.values()) quads.push(...l);
    gl.uniform2f(loc2.uSize, hw, hh);
    R.lightQuads += quads.length;
    if (quads.length) R.calls += drawQuads(quads, false);
  }
  function lightPass(L) {
    if (!P3) init3();
    const W = cv.width, H = cv.height, hw = Math.max(1, Math.round(W / 2)), hh = Math.max(1, Math.round(H / 2)), B = lightBufs(hw, hh);
    const dnMap = !!(L && G && typeof MAPS !== 'undefined' && MAPS[validMap(G.mapId)].daynight), DN = dnMap ? dayNight(G.t) : { night: 0, warm: 0 };
    const look = !!(L && typeof LOOK !== 'undefined' && LOOK.light && (!dnMap || LOOK.mood) && typeof lookDayLights === 'function');
    const nightArg = dnMap ? DN.night : undefined, dn = nightArg === undefined ? 1 : 1 - nightArg, nightOn = !!L && dnMap && DN.night >= 0.01;
    const M = look ? lookMood(G.t) : null, dayL = look ? lookDayLights(L.vx, L.vy, W, H, nightArg) : [], nL = nightOn ? nightLights(L.vx, L.vy, W, H, DN.night) : [];
    R.lights = dayL.length + nL.length; R.lightQuads = 0;
    gl.useProgram(P2); gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND); gl.viewport(0, 0, hw, hh);
    const Lp = look ? lookPics : null, sc = 0.5 * hw / Math.max(1, W / 2);
    const to = (i, r, g2, b2, a2) => { gl.bindFramebuffer(gl.FRAMEBUFFER, B.b[i].f); gl.clearColor(r, g2, b2, a2); gl.clear(gl.COLOR_BUFFER_BIT); };
    // 0: holes (red: drawLook's shade; green: the night), each light keeping (1 - its share): dst x (1 - src alpha)
    to(0, 1, 1, 1, 1); gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    gl.colorMask(true, false, false, false);
    splat(dayL.map(([x, y, r, a, , f]) => [Lp.hole, x - r, y - r * f, r * 2, r * 2 * f, a]), L, hw, hh, sc);
    gl.colorMask(false, true, false, false);
    if (nightOn) { const lp = nightLightPic(); splat(nL.map(([x, y, r, a]) => [lp, x - r, y - r, r * 2, r * 2, Math.min(1, a * (0.92 + Math.random() * 0.08))]), L, hw, hh, sc); }
    gl.colorMask(true, true, true, true);
    // 1: the glow, each spot as bright as its brightest light
    to(1, 0, 0, 0, 0); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
    splat(dayL.map(([x, y, r, a, col, f]) => { const rr = col[0] === 'p' ? r : r * 0.75; return [Lp[col], x - rr, y - rr * f, rr * 2, rr * 2 * f, a]; }), L, hw, hh, sc);
    gl.blendEquation(gl.FUNC_ADD);
    // 2: the night's warm light, added
    to(2, 0, 0, 0, 0); gl.blendFunc(gl.ONE, gl.ONE);
    if (nightOn) { const gp = (typeof lampGlowPic !== 'undefined' && lampGlowPic) || nightLightPic(); splat(nL.filter((l) => l[4]).map(([x, y, r, a]) => [gp, x - r * 0.6, y - r * 0.6, r * 1.2, r * 1.2, 0.12 * a * DN.night]), L, hw, hh, sc); }
    // 3: the pools' colour by day, screened
    to(3, 0, 0, 0, 0); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
    splat(dayL.filter((l) => l[4][0] === 'p').map(([x, y, r, a, col, f]) => [Lp[col], x - r, y - r * f, r * 2, r * 2 * f, a * POOL_DAY]), L, hw, hh, sc);
    // The scene, lit, into the canvas.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.disable(gl.BLEND);
    gl.useProgram(P3);
    const bind = (u, t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(loc3[u], i); };
    if (look && !cloudT && typeof cloudShadowPic === 'function') cloudT = texFrom(cloudShadowPic(), true);
    bind('uScene', SC.c, 0); bind('uNrm', SC.n, 1); bind('uSh', B.b[0].t, 2); bind('uGlow', B.b[1].t, 3); bind('uWarm', B.b[2].t, 4); bind('uPool', B.b[3].t, 5); bind('uCloud', cloudT || R.none, 6);
    gl.uniform2f(loc3.uSize, W, H); gl.uniform2f(loc3.uHalf, hw, hh);
    gl.uniform2f(loc3.uOrg, L ? L.vx : 0, L ? L.vy : 0); gl.uniform2f(loc3.uCam, L ? L.cam[0] : 0, L ? L.cam[1] : 0); gl.uniform2f(loc3.uScr, L ? L.sw : W, L ? L.sh : H);
    gl.uniform1f(loc3.uLook, look ? 1 : 0); gl.uniform1f(loc3.uT, G ? G.t : 0); gl.uniform1f(loc3.uNrmK, L ? R.nrmK : 0);
    gl.uniform1f(loc3.uWarmK, L && DN.warm > 0.01 ? 0.32 * DN.warm : 0); gl.uniform1f(loc3.uNight, nightOn ? DN.night : 0);
    if (look) {
      const c4 = (c, m) => [c[0] / 255, c[1] / 255, c[2] / 255, c[3] * m];
      gl.uniform1f(loc3.uSat, M.sat * dn); gl.uniform3f(loc3.uGrade, ...M.grade.map((c) => Math.round(255 - (255 - c) * dn) / 255));
      gl.uniform4f(loc3.uSun, ...c4(M.sun, dn)); gl.uniform4f(loc3.uShade, ...c4(M.shade, dn)); gl.uniform4f(loc3.uHaze, ...c4(M.haze, dn));
      gl.uniform4f(loc3.uTint, ...c4(M.tint, dn)); gl.uniform4f(loc3.uVig, ...c4(M.vig, dn));
      gl.uniform1f(loc3.uGlowK, 0.3 * (0.5 + 0.5 * dn)); gl.uniform1f(loc3.uCloudK, dn > 0.02 ? dn : 0);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, tri); gl.enableVertexAttribArray(loc3.aQ); gl.vertexAttribPointer(loc3.aQ, 2, gl.FLOAT, false, 8, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3); R.calls++;
    gl.activeTexture(gl.TEXTURE0);
  }
  function copyOut(v) { const keep = v.getTransform(); v.setTransform(1, 0, 0, 1, 0, 0); v.drawImage(cv, 0, 0); v.setTransform(keep); }   // (the one copy a frame)
  R.listEnd = (v, L) => {
    if (!rec) return;
    try {
      R.calls = 0; R.quads = 0;
      flush();
      sceneFb(cv.width, cv.height); drawRec(true);
      lightPass(L || null);
      R.overQuads = 0;
      if (L && L.over) {   // what goes over the light, recorded the same way, drawn into the canvas without depth
        const g = R.listBegin(v, true);
        if (g) { L.over(g); flush(); const n = R.quads; drawRec(false); R.overQuads = R.quads - n; }
      }
      copyOut(v);
      R.lit = !!L;
    } catch (err) { failed = true; console.warn('WebGL list off:', err); }
    rec = null;
  };
  R.off = () => { failed = true; };
  return R;
})();
