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
      const keep = v.getTransform(); v.setTransform(1, 0, 0, 1, 0, 0); v.drawImage(cv, 0, 0); v.setTransform(keep);
      return true;
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
in vec2 aP; in vec2 aUV; in float aD; uniform vec2 uSize; out vec2 vUV;
void main() { vec2 s = aP / uSize * 2.0 - 1.0; gl_Position = vec4(s.x, -s.y, aD, 1.0); vUV = aUV; }`;
  const FS2 = `#version 300 es
precision mediump float; in vec2 vUV; out vec4 o; uniform sampler2D uTex; uniform float uA;
void main() { vec4 c = texture(uTex, vUV); o = c * uA; }`;
  let P2 = null, loc2 = null, layer = null, lctx = null, rec = null, depth = 0, texOf = new WeakMap(), vbuf2 = null;
  function init2() {
    const mk = (t, src) => { const h = gl.createShader(t); gl.shaderSource(h, src); gl.compileShader(h); if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(h)); return h; };
    P2 = gl.createProgram(); gl.attachShader(P2, mk(gl.VERTEX_SHADER, VS2)); gl.attachShader(P2, mk(gl.FRAGMENT_SHADER, FS2)); gl.linkProgram(P2);
    if (!gl.getProgramParameter(P2, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(P2));
    loc2 = {}; for (const n of ['uSize', 'uTex', 'uA']) loc2[n] = gl.getUniformLocation(P2, n); for (const n of ['aP', 'aUV', 'aD']) loc2[n] = gl.getAttribLocation(P2, n);
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
  R.listBegin = (v) => {
    if (failed || !gl) return null;
    try { if (!P2) init2(); } catch (err) { failed = true; console.warn('WebGL list off:', err); return null; }
    if (layer.width !== cv.width || layer.height !== cv.height) { layer.width = cv.width; layer.height = cv.height; lctx = uprightCtx(layer.getContext('2d')); }
    lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, layer.width, layer.height);
    lctx.setTransform(v.getTransform()); lctx.upright = v.upright; lctx.imageSmoothingEnabled = false; lctx.globalAlpha = 1; lctx.globalCompositeOperation = 'source-over';
    rec = [];
    const draw = (img, ...a) => {
      if (!img || !img.width || !img.height || (img.complete === false)) return;
      const op = lctx.globalCompositeOperation;
      if (op !== 'source-over' && op !== 'lighter') return lctx.drawImage(img, ...a);   // (other blends: on the 2D layer)
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
      rec.push({ img, q, u0: sx / img.width, v0: sy / img.height, u1: (sx + sw) / img.width, v1: (sy + sh) / img.height, a: lctx.globalAlpha, add: op === 'lighter', d: depth });
    };
    // The canvas's own drawImage (trees, with their sway's shear): through the transform as it is, no upright anchor.
    const rawDraw = function (img, ...a) { const up = lctx.upright, ox = img._ox; lctx.upright = false; if (ox !== undefined) img._ox = undefined; try { draw(img, ...a); } finally { lctx.upright = up; if (ox !== undefined) img._ox = ox; } };
    return new Proxy(lctx, {
      get(t, k) { if (k === 'drawImage') return draw; if (k === '_rawDraw') return rawDraw; const x = t[k]; return typeof x === 'function' ? x.bind(t) : x; },
      set(t, k, val) { t[k] = val; return true; },
    });
  };
  R.listDepth = (d) => { depth = 1 - 2 * (d + 64) / (2 * WORLD + 128); };
  R.listEnd = (v) => {
    if (!rec) return;
    try {
      gl.useProgram(P2); gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);   // (the ground's depth stays)
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false); gl.enable(gl.BLEND);
      gl.uniform2f(loc2.uSize, cv.width, cv.height); gl.uniform1i(loc2.uTex, 0); gl.activeTexture(gl.TEXTURE0);
      const f = new Float32Array(rec.length * 30);
      let o = 0;
      for (const r of rec) {
        const [x0, y0, x1, y1, x2, y2, x3, y3] = r.q;
        for (const [x, y, u, vv] of [[x0, y0, r.u0, r.v0], [x1, y1, r.u1, r.v0], [x2, y2, r.u0, r.v1], [x1, y1, r.u1, r.v0], [x3, y3, r.u1, r.v1], [x2, y2, r.u0, r.v1]]) { f[o++] = x; f[o++] = y; f[o++] = u; f[o++] = vv; f[o++] = r.d; }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, vbuf2); gl.bufferData(gl.ARRAY_BUFFER, f, gl.STREAM_DRAW);
      for (const n of ['aP', 'aUV', 'aD']) gl.enableVertexAttribArray(loc2[n]);
      gl.vertexAttribPointer(loc2.aP, 2, gl.FLOAT, false, 20, 0); gl.vertexAttribPointer(loc2.aUV, 2, gl.FLOAT, false, 20, 8); gl.vertexAttribPointer(loc2.aD, 1, gl.FLOAT, false, 20, 16);
      let add = null;
      rec.forEach((r, i) => {
        if (r.add !== add) { add = r.add; gl.blendFunc(gl.ONE, add ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA); }
        gl.bindTexture(gl.TEXTURE_2D, spriteTex(r.img)); gl.uniform1f(loc2.uA, r.a);
        gl.drawArrays(gl.TRIANGLES, i * 6, 6);
      });
      gl.depthMask(true); gl.disable(gl.BLEND);
      R.quads = rec.length;
      const keep = v.getTransform(); v.setTransform(1, 0, 0, 1, 0, 0); v.drawImage(cv, 0, 0); v.drawImage(layer, 0, 0); v.setTransform(keep);
    } catch (err) { failed = true; console.warn('WebGL list off:', err); }
    rec = null;
  };
  R.off = () => { failed = true; };
  return R;
})();
