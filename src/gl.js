'use strict';
// The WebGL renderer (branch claude/webgl; plan: plans/webgl-renderer.md). Drawing only: rules, saves and online play do not
// change. ?gl=off (or no WebGL2, or a lost context) draws everything the 2D way as before.
// Stage 1: the ground. The tiles makeGround paints (art.js, G.ground.gl) are textures, laid on a mesh over the world grid
// lifted by the raised ground (look.js gLift, craters left out as there), every GL_STEP world px, with depth so a hill hides
// the ground behind it. The wrecks layer ('d') and the look's soft patches (look.js patchPic, soft-light) are mixed in by the
// shader. The result is put into the 2D view canvas as its ground (ui.js draw), so everything drawn after it is unchanged.
const GLR = (() => {
  const q = typeof location !== 'undefined' ? location.search : '';
  // WebGL is the only way the game draws for players (owner, 2026-11-22: "remove the option to toggle webgl. I want that to
  // be the only option always"): the menu's switch and the rh-gl preference are gone, and a crash no longer switches it off.
  // The crash guard still notes one: rh-gl-live is set while WebGL draws on a visible page and cleared when the page is
  // hidden or closed, so finding it set at launch means the page died drawing (R.crashed, R.crashedAt for the match report).
  // The 2D way is kept only underneath: for a device with no WebGL2 or a lost context (else a black screen), and ?gl=off
  // for comparing the two in development (tools/look/gl-compare.js).
  const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) {} return null; };
  let crashed = false;
  if (typeof document !== 'undefined') {
    if (ls('rh-gl') !== null) ls('rh-gl', null);   // (an old "WebGL graphics: off" choice, or a crash's switch-off)
    if (ls('rh-gl-live') === '1') { crashed = true; ls('rh-gl-crash', String(Date.now())); ls('rh-gl-live', null); }
  }
  const R = { on: typeof document !== 'undefined' && !/[?&]gl=off\b/.test(q), ground: () => false, frames: 0, crashed };
  R.crashedAt = () => +ls('rh-gl-crash') || 0;
  let live = false;
  const unlive = () => { if (live) { live = false; ls('rh-gl-live', null); } };
  if (typeof document !== 'undefined') {
    addEventListener('pagehide', unlive);
    document.addEventListener('visibilitychange', () => { if (document.hidden) unlive(); });
  }
  const note = (w) => { try { if (typeof Report !== 'undefined' && Report.crumb) Report.crumb('gl ' + w); } catch (_) {} };   // (the black box, report.js)
  R.markLive = () => { if (!live && !document.hidden) { live = true; ls('rh-gl-live', '1'); } };
  // ?gl=stats (stage 5, for measuring on a phone; with ?gl=off too): frames a second, the draw's CPU time a frame (art.js
  // drawParts, summed), which way the frame was drawn, and WebGL's quads and draw calls, twice a second in a corner.
  // (#glstats too: a claude.ai artifact passes only the address's #name to the page. A button switches the same battle
  // between WebGL and the 2D way, GLR.paused, to compare on one phone.)
  if (/[?&]gl=stats\b/.test(q) || /[?&]glstats\b/.test(q) || (typeof location !== 'undefined' && /glstats/.test(location.hash)) || (typeof GL_STATS !== 'undefined' && GL_STATS)) {
    const T = ['gnd', 'list', 'tree', 'bld', 'unit', 'misc', 'edge', 'fx', 'air', 'bars', 'blit', 'night', 'wthr'];
    let box = null, n = 0, ms = 0, worst = 0, t0 = performance.now();
    const tick = () => {
      requestAnimationFrame(tick);
      if (typeof drawParts !== 'object' || typeof document === 'undefined') return;
      let d = 0; for (const k of T) d += drawParts[k] || 0;
      n++; ms += d; worst = Math.max(worst, d);
      const now = performance.now();
      if (now - t0 < 500) return;
      if (!box) {
        const w = document.createElement('div'); w.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:calc(var(--ts, 0px) + 4px);z-index:99;display:flex;gap:6px;align-items:center;pointer-events:none';
        box = document.createElement('div'); box.style.cssText = 'font:11px/1.3 monospace;color:#cfe;background:rgba(0,0,0,0.6);padding:2px 5px;white-space:pre';
        w.appendChild(box);
        if (R.on) {
          const b = document.createElement('button'); b.textContent = '2D / WebGL';
          b.style.cssText = 'pointer-events:auto;font:12px monospace;min-height:32px;padding:0 10px;color:#fff;background:#345;border:1px solid #8ab;border-radius:4px';
          b.addEventListener('click', (e) => { e.stopPropagation(); R.paused = !R.paused; });
          w.appendChild(b);
        }
        document.body.appendChild(w);
      }
      box.textContent = `${(n * 1000 / (now - t0)).toFixed(0)} fps  draw ${(ms / n).toFixed(1)} ms (worst ${worst.toFixed(1)})\n${R.on && R.lit ? `WebGL ${R.quads || 0} quads ${R.calls || 0} calls` : '2D way'}`;
      n = 0; ms = 0; worst = 0; t0 = now;
    };
    requestAnimationFrame(tick);
  }
  if (!R.on) return R;
  const GL_STEP = 16, TEX_MAX = 140;
  let FW = 1, FH = 1, cv = null, gl = null, P = null, loc = null, failed = false;
  const VS = `#version 300 es
in vec2 aP; in float aD; in vec2 aW; in vec2 aN; uniform vec2 uCam, uSize; out vec2 vW; out vec2 vN;
void main() { vec2 s = (aP - uCam) / uSize * 2.0 - 1.0; gl_Position = vec4(s.x, -s.y, aD, 1.0); vW = aW; vN = aN; }`;
  const FS = `#version 300 es
precision highp float; in vec2 vW; in vec2 vN; layout(location = 0) out vec4 o; layout(location = 1) out vec4 o1;
uniform sampler2D uT, uD, uLow, uPatch, uPv; uniform vec2 uT0, uS0, uSS; uniform float uTile, uWorld, uLowOnly, uPatchK, uPatchS, uPvOn, uPvS, uFade, uRes;
float sl(float b, float s) { float d = b <= 0.25 ? ((16.0 * b - 12.0) * b + 4.0) * b : sqrt(b); return s <= 0.5 ? b - (1.0 - 2.0 * s) * b * (1.0 - b) : b + (2.0 * s - 1.0) * (d - b); }
void main() {
  vec2 uv = (vW - uT0) / uTile;
  if (uRes > 0.5) {   // (stage 6: the compressed sheet, uT, with the tile's overlay of marks, uD, premultiplied)
    vec3 b = texture(uT, (vW - uS0) / uSS).rgb; vec4 v = texture(uD, uv);
    o = vec4(b * (1.0 - v.a) + v.rgb, 1.0); o1 = vec4(vN * 0.5 + 0.5, 0.0, 1.0); return;
  }
  // The stand-in for a tile not uploaded yet: the blurred preview where it is done, else a pixel a cell; a tile just in
  // fades in over it (uFade 0 to 1) rather than popping in.
  vec4 lo = uPvOn > 0.5 ? texture(uPv, vW / uPvS) : texture(uLow, vW / uWorld);
  vec4 c = uLowOnly > 0.5 ? lo : texture(uT, uv);
  vec4 d = texture(uD, uv); c.rgb = mix(c.rgb, d.rgb, d.a * (1.0 - uLowOnly));
  if (uLowOnly < 0.5 && uFade < 1.0) c.rgb = mix(lo.rgb, c.rgb, uFade);
  if (uPatchK > 0.0) { vec4 p = texture(uPatch, vW / uPatchS); vec3 s = vec3(sl(c.r, p.r), sl(c.g, p.g), sl(c.b, p.b)); c.rgb = mix(c.rgb, s, p.a * uPatchK); }
  o = vec4(c.rgb, 1.0); o1 = vec4(vN * 0.5 + 0.5, 0.0, 1.0);   // (o1: the normals' layer; the ground's from the hills (stage 5): flat ground (0, 0) is lit as 2D)
}`;
  function init() {
    // Stage 5: the WebGL canvas is on the page, under the 2D one (#game), the size of the screen: the frame is drawn
    // into it (R.present) instead of being copied into the 2D view, which keeps only the HUD bits, the shroud and the
    // placement grid (on a transparent view and screen).
    cv = document.createElement('canvas'); cv.id = 'gl';
    cv.style.cssText = 'position:fixed;left:0;top:var(--ts);display:none;pointer-events:none';
    const game = document.getElementById('game'); if (game && game.parentNode) game.parentNode.insertBefore(cv, game);
    gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, premultipliedAlpha: true, preserveDrawingBuffer: false });
    if (!gl) { failed = true; return false; }
    // What the GPU was handed since the last frame report (report.js noteFrame takes and empties it): the iPhone froze
    // 3-4 s a few times at the start of a battle with the game's own code taking ~3 ms, so the stall is in the
    // graphics process; these say which kind of work came just before it. tx/txMB: textures made and their size,
    // up/upMB: uploads, pg: programs linked, fb: framebuffers and renderbuffers made, bl: blend states first used.
    R.ev = { tx: 0, txMB: 0, up: 0, upMB: 0, pg: 0, fb: 0, bl: 0 };
    try {
      const ev = R.ev, MB = 1 / 1048576, blSeen = new Set();
      const size = (a) => { const s = a[a.length - 1]; return s && (s.width || s.videoWidth) ? (s.width || s.videoWidth) * (s.height || s.videoHeight) * 4 : s && s.byteLength ? s.byteLength : 0; };
      const wrap = (k, f) => { const o = gl[k].bind(gl); gl[k] = function () { try { f(arguments); } catch (_) {} return o.apply(null, arguments); }; };
      wrap('texStorage2D', (a) => { ev.tx++; ev.txMB += a[3] * a[4] * 4 * MB; });
      wrap('texImage2D', (a) => { ev.up++; ev.upMB += (a.length >= 9 ? a[3] * a[4] * 4 : size(a)) * MB; });
      wrap('texSubImage2D', (a) => { ev.up++; ev.upMB += (a.length >= 9 ? a[4] * a[5] * 4 : size(a)) * MB; });
      wrap('linkProgram', () => { ev.pg++; });
      wrap('createFramebuffer', () => { ev.fb++; });
      wrap('renderbufferStorage', () => { ev.fb++; });
      wrap('blendFunc', (a) => { const k = a[0] + ':' + a[1]; if (!blSeen.has(k)) { blSeen.add(k); ev.bl++; } });
      wrap('blendFuncSeparate', (a) => { const k = a.join(':'); if (!blSeen.has(k)) { blSeen.add(k); ev.bl++; } });
    } catch (_) {}
    try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); R.gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).slice(0, 160); } catch (_) {}
    cv.addEventListener('webglcontextrestored', () => note('context restored'));
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); failed = true; unlive(); note('context lost'); });   // (handled: the 2D way carries on)
    const mk = (t, s) => { const h = gl.createShader(t); gl.shaderSource(h, s); gl.compileShader(h); if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(h)); return h; };
    P = gl.createProgram(); gl.attachShader(P, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(P, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(P);
    if (!gl.getProgramParameter(P, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(P));
    gl.useProgram(P);
    loc = {};
    for (const n of ['uCam', 'uSize', 'uT', 'uD', 'uLow', 'uPatch', 'uT0', 'uTile', 'uWorld', 'uLowOnly', 'uPatchK', 'uPatchS', 'uPv', 'uPvOn', 'uPvS', 'uFade', 'uRes', 'uS0', 'uSS']) loc[n] = gl.getUniformLocation(P, n);
    for (const n of ['aP', 'aD', 'aW', 'aN']) loc[n] = gl.getAttribLocation(P, n);
    gl.uniform1i(loc.uT, 0); gl.uniform1i(loc.uD, 1); gl.uniform1i(loc.uLow, 2); gl.uniform1i(loc.uPatch, 3); gl.uniform1i(loc.uPv, 4);
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
      if (S) { for (const e of S.tex.values()) { gl.deleteTexture(e.g); if (e.d) gl.deleteTexture(e.d); } if (S.low) gl.deleteTexture(S.low); if (S.pv) gl.deleteTexture(S.pv); for (const m of S.mesh.values()) { gl.deleteBuffer(m.vb); gl.deleteBuffer(m.ib); } }
      if (S) { const old = S.res; if (old && old.state !== 'off') { old.state = 'off'; resFree(old); } }
      S = { G, ground: G.ground, tex: new Map(), mesh: new Map(), low: null, lowSrc: null, patch: null, pv: null, pvN: 0, pvAt: 0, pvSrc: null, frame: 0 };
      try { resStart(); } catch (err) { S.res = { state: 'off' }; note('resident off: ' + (err && err.message)); }
    }
    return S;
  }
  // The mesh of one tile: (X, Y) on the view plane lifted by the raised ground, depth, world (x, y); and its triangles.
  function meshOf(k, A) {
    let m = S.mesh.get(k);
    if (m) return m;
    const [x0, y0] = A.at(k), T = A.T, N = Math.ceil(Math.min(T, WORLD - x0) / GL_STEP), M = Math.ceil(Math.min(T, WORLD - y0) / GL_STEP);
    const v = new Float32Array((N + 1) * (M + 1) * 7), D = 2 * WORLD, E = GL_STEP / 2, lift = (x, y) => (typeof gLift === 'function' ? gLift(x, y, true) : 0);
    let o = 0;
    for (let j = 0; j <= M; j++) for (let i = 0; i <= N; i++) {
      const x = Math.min(x0 + i * GL_STEP, WORLD, x0 + T), y = Math.min(y0 + j * GL_STEP, WORLD, y0 + T), L = typeof gLift === 'function' ? gLift(x, y, true) : 0, [X, Y] = toView(x, y);
      v[o++] = X; v[o++] = Y - L; v[o++] = 1 - 2 * (x * VIEW.s + y * VIEW.c + 64) / (D + 128); v[o++] = x; v[o++] = y;
      // (stage 5) The surface's direction from the drawn height (view px up; world units of height: / VK), turned with the
      // view as the pictures' normal maps are (x right, y toward the camera): x and y kept, the shader works out z.
      const hx = (lift(x + E, y) - lift(x - E, y)) / (2 * E * VK), hy = (lift(x, y + E) - lift(x, y - E)) / (2 * E * VK), nl = Math.hypot(hx, hy, 1);
      const nx = -hx / nl, ny = -hy / nl;
      v[o++] = nx * VIEW.c - ny * VIEW.s; v[o++] = nx * VIEW.s + ny * VIEW.c;
    }
    const ix = new Uint16Array(N * M * 6);
    o = 0;
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; ix[o++] = a; ix[o++] = b; ix[o++] = c; ix[o++] = b; ix[o++] = d; ix[o++] = c; }
    // Each tile's mesh in buffers of its own, uploaded once (2026.11.20.5): re-sending every tile's mesh every frame
    // (bufferData STREAM_DRAW, tens a frame) grew the page's memory about 6 MB a second; on a tester's RTX 5080 at 115
    // frames a second the Windows app's page crashed some 40 s into each battle.
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ix, gl.STATIC_DRAW);
    m = { vb, ib, n: ix.length };
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
      e = { g: texFrom(t.g), d: t.d ? texFrom(t.d) : null, born: 0 };
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
      // Pictures with a texture of their own (spriteTex) let it go once not drawn for TEX_IDLE ms. The game drops and
      // makes again tree blocks, crags and the like to save memory; their textures were kept for ever (a phone's 3 v 3
      // battle ran out of memory after some 17 minutes, 2026-11-21). One drawn again later is simply uploaded again.
      const tNow = performance.now();
      if (R.frames % 60 === 0) for (const [img, e] of texOf) if (tNow - e.used > TEX_IDLE) { gl.deleteTexture(e.t); texOf.delete(img); }
      if (atlWipe && atl && atl.length) { atlWipe = false; let a = 0; for (let i = 1; i < atl.length; i++) if (atl[i].born < atl[a].born) a = i; emptyAtlas(atl[a]); }
      const A = G.ground.gl;
      try { resTick(A); } catch (err) { resOff(S.res, 'tick: ' + (err && err.message)); }
      const R6 = S.res && S.res.state === 'ready' ? S.res : null;
      FW = VW; FH = VH;   // (the frame's size: the view's)
      sceneFb(VW, VH);   // (stage 4: into the scene's framebuffer, colour and normals; the light pass draws it into the canvas)
      gl.viewport(0, 0, VW, VH); gl.clearColor(0, 0, 0, 0); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); gl.disable(gl.BLEND);
      gl.useProgram(P);
      gl.uniform2f(loc.uCam, vx, vy); gl.uniform2f(loc.uSize, VW, VH); gl.uniform1f(loc.uTile, A.T); gl.uniform1f(loc.uWorld, WORLD);
      // The stand-in (a pixel a cell) for tiles not painted yet; the look's soft patches.
      const low = A.low();
      if (S.lowSrc !== low) { if (S.low) gl.deleteTexture(S.low); S.low = texFrom(low); S.lowSrc = low; gl.bindTexture(gl.TEXTURE_2D, S.low); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); }
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, S.low);
      const pk = typeof LOOK !== 'undefined' && LOOK.ground && typeof patchPic !== 'undefined' && patchPic && typeof lookPatchTile !== 'function' ? 1 : 0;   // (look.js lookPatchTile: the patches are painted into the tiles now)
      if (pk && !S.patch) S.patch = texFrom(patchPic, true);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, pk ? S.patch : R.none);
      gl.uniform1f(loc.uPatchK, pk); gl.uniform1f(loc.uPatchS, pk ? patchPic.width * 12 : 1);
      // The preview as the stand-in (art.js makeGround: a quarter size, filled in as the workers paint it or from the
      // baked file): uploaded again when more of it is done, at most twice a second (it is a few MB), and once complete.
      const pv = A.preview && A.preview(), pvN = pv ? A.pvN() : 0, now = performance.now();
      gl.activeTexture(gl.TEXTURE4);   // (texFrom binds to the active unit: not the ones bound above)
      if (pv && pvN !== S.pvN && (pvN === A.n * A.n || now - S.pvAt > 500 || !S.pv)) {
        if (!S.pv || S.pvSrc !== pv) {
          if (S.pv) gl.deleteTexture(S.pv);
          S.pv = texFrom(pv); S.pvSrc = pv;
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          S.pvShown = new Uint8Array(A.n * A.n);
        } else { gl.bindTexture(gl.TEXTURE_2D, S.pv); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pv); }
        for (let k = 0; k < A.n * A.n; k++) if (A.pvHas(k)) S.pvShown[k] = 1;   // (the preview's tiles in this upload)
        S.pvN = pvN; S.pvAt = now;
      }
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, S.pv || R.none);
      gl.uniform1f(loc.uPvS, pv ? pv.width * A.PV : 1);
      gl.enableVertexAttribArray(loc.aP); gl.enableVertexAttribArray(loc.aD); gl.enableVertexAttribArray(loc.aW); gl.enableVertexAttribArray(loc.aN);
      gl.uniform1f(loc.uRes, R6 ? 1 : 0);
      if (R6) {   // (stage 6: every tile from the compressed sheets, with its overlay of marks)
        gl.uniform1f(loc.uLowOnly, 0); gl.uniform1f(loc.uFade, 1); gl.uniform1f(loc.uPvOn, 0);
        for (const k of A.tilesIn(sx, sy, sw, sh)) {
          const m = meshOf(k, A), [x0, y0] = A.at(k), i = Math.floor(y0 / R6.SH) * R6.per + Math.floor(x0 / R6.SH), d = R6.dims[i], ov = R6.over.get(k);
          gl.uniform2f(loc.uT0, x0, y0); gl.uniform2f(loc.uS0, d[0], d[1]); gl.uniform2f(loc.uSS, d[2], d[3]);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R6.sheets[i]);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, ov ? ov.t : R.none);
          gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
          gl.vertexAttribPointer(loc.aP, 2, gl.FLOAT, false, 28, 0); gl.vertexAttribPointer(loc.aD, 1, gl.FLOAT, false, 28, 8); gl.vertexAttribPointer(loc.aW, 2, gl.FLOAT, false, 28, 12); gl.vertexAttribPointer(loc.aN, 2, gl.FLOAT, false, 28, 20);
          gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
        }
        return true;
      }
      let up = 0;
      for (const k of A.tilesIn(sx, sy, sw, sh)) {
        const t = A.tile(k), m = meshOf(k, A), [x0, y0] = A.at(k);
        let e = null;
        if (t && (up < 6 || S.tex.has(k))) {   // (a few new uploads a frame)
          const had = S.tex.get(k); e = upload(k, t);
          if (!had || had.ver !== t.ver) up++;
          if (!had && S.frame > 2) e.born = now;   // (new on screen: fades in over the stand-in; not the first frames, behind the card)
        }
        // How far in: from this upload, or from art.js finishing the tile where a stand-in was on screen.
        let fade = 1;
        if (e) {
          const a = e.born ? (now - e.born) / A.fade : 1, b = t.born ? (now - t.born) / A.fade : 1;
          fade = Math.max(0, Math.min(1, a, b));
          if (a >= 1) e.born = 0;
        }
        gl.uniform2f(loc.uT0, x0, y0); gl.uniform1f(loc.uLowOnly, e ? 0 : 1); gl.uniform1f(loc.uFade, fade);
        gl.uniform1f(loc.uPvOn, S.pv && S.pvShown && S.pvShown[k] ? 1 : 0);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, e ? e.g : R.none);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, e && e.d ? e.d : R.none);
        gl.bindBuffer(gl.ARRAY_BUFFER, m.vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
        gl.vertexAttribPointer(loc.aP, 2, gl.FLOAT, false, 28, 0); gl.vertexAttribPointer(loc.aD, 1, gl.FLOAT, false, 28, 8); gl.vertexAttribPointer(loc.aW, 2, gl.FLOAT, false, 28, 12); gl.vertexAttribPointer(loc.aN, 2, gl.FLOAT, false, 28, 20);
        gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
      }
      // Tiles painted just off screen are uploaded ahead (with what is left of this frame's few), so scrolling finds them
      // on the GPU instead of fading them in at the edge.
      if (up < 6) {
        const T = A.T;
        for (const k of A.tilesIn(sx - T, sy - T, sw + 2 * T, sh + 2 * T)) {
          if (up >= 6) break;
          const t = A.tile(k);
          if (t && !S.tex.has(k)) { upload(k, t); up++; }
        }
      }
      return true;   // (kept in the GL canvas: listBegin records what is drawn over it, listEnd puts the frame into v once)
    } catch (err) { failed = true; console.warn('WebGL ground off:', err); note('ground off: ' + (err && err.message)); return false; }
  };
  // ---- Stage 6: the whole ground on the GPU, compressed (phones; owner, 2026-11-21: "I don't want any loading in while
  // jumping") ---------------------------------------------------------------------------------------------------------
  // A battle on a baked map loads every ground sheet while the Loading card is up, compresses it to ETC2 (etcEncode, in
  // workers: about a quarter of the memory, read directly by the GPU) and keeps it for the whole battle, so no ground ever
  // loads in. art.js's tiles, sheets and preview are then let go (G.ground.release). The marks of battle (scorches,
  // craters, wrecks, bodies) are drawn into overlays, one RGBA texture per 256 px tile that has some, over the
  // compressed ground; once a tile has had no new mark for RES_FOLD_IDLE ms (or more than RES_OVER_MAX are open) its overlay is folded into the compressed
  // ground (drawn together, read back, compressed again, put in place) and let go, so the marks' memory does not grow
  // with the battle. Phones only (not GROUND_ROOMY); ?gl=resident on any device, ?gl=noresident off. Anything failing
  // turns it off for the battle and the ground is drawn as before. Village and Frostlight have their dressing painted
  // in before compressing (it depends on the houses); the other maps' compressed sheets are kept in the browser's cache
  // (RES_CACHE), so a later battle on the same map loads them at once.
  // Computers (GROUND_ROOMY) keep the sheets as they are (RGBA: Frostlight's whole ground ~110 MB of graphics memory, nothing
  // to compress, folds drawn straight into the sheet): their 140-tile limit (TEX_MAX) was thrashing fully zoomed out on a
  // 2560 px screen (~170 tiles in view: owner, 2026-11-21, "22 fps and tons of pop in" on an RTX 5080).
  const RES = !/[?&]gl=noresident\b/.test(q);
  const RES_RGBA = (typeof GROUND_ROOMY !== 'undefined' && GROUND_ROOMY) || /[?&]gl=rgba\b/.test(q);
  const RES_FOLD_IDLE = 2000, RES_OVER_MAX = 32, RES_FOLDS = 2, RES_CACHE = 'rh-etc-1';
  let etcExt, resPool = null, PM = null, PF = null, locM = null, locF = null, resQuad = null;
  // ETC1-style blocks (valid ETC2 RGB8): rgba pixels (w x h, multiples of 4) to 8-byte blocks, row by row. For each
  // block both splits (left|right, top/bottom), the halves' average colours as bases (differential when they are close,
  // else individual), and for each half the best of the modifier tables near its spread. About 37 dB on the ground.
  function etcEncode(px, w, h) {
    const TB = [[2, 8], [5, 17], [9, 29], [13, 42], [18, 60], [24, 80], [33, 106], [47, 183]];
    const out = new Uint8Array((w >> 2) * (h >> 2) * 8);
    const R = new Int32Array(16), Gc = new Int32Array(16), B = new Int32Array(16);
    // best table and indices for pixels idx (8 of them) around base colour (r, g, b): [err, table, indices(8)]
    const MODS = new Int32Array(32); for (let t = 0; t < 8; t++) { MODS[t * 4] = TB[t][0]; MODS[t * 4 + 1] = TB[t][1]; MODS[t * 4 + 2] = -TB[t][0]; MODS[t * 4 + 3] = -TB[t][1]; }
    const sub = (idx, r, g, b, res) => {
      let best = 1e18, bt = 0;
      const tmp = res.tmp;
      // Only the tables near the spread of the pixels round the base (the large step closest to the furthest pixel).
      let sp = 0; for (let q = 0; q < 8; q++) { const p = idx[q], l = Math.abs((R[p] - r) * 2 + (Gc[p] - g) * 4 + (B[p] - b)) / 7; if (l > sp) sp = l; }
      let tc = 0; while (tc < 7 && TB[tc][1] < sp) tc++;
      const t0 = tc > 0 ? tc - 1 : 0, t1 = tc < 7 ? tc + 1 : 7;
      for (let t = t0; t <= t1; t++) {
        let err = 0;
        for (let q = 0; q < 8; q++) {
          const p = idx[q], pr = R[p], pg = Gc[p], pb = B[p]; let be = 1e9, bi = 0;
          for (let i = 0; i < 4; i++) {
            const d = MODS[t * 4 + i];
            let vr = r + d, vg = g + d, vb = b + d;
            vr = vr < 0 ? 0 : vr > 255 ? 255 : vr; vg = vg < 0 ? 0 : vg > 255 ? 255 : vg; vb = vb < 0 ? 0 : vb > 255 ? 255 : vb;
            const dr = vr - pr, dg = vg - pg, db = vb - pb, e = dr * dr * 2 + dg * dg * 4 + db * db;
            if (e < be) { be = e; bi = i; }
          }
          err += be; tmp[q] = bi; if (err >= best) break;
        }
        if (err < best) { best = err; bt = t; res.idx.set(tmp); }
      }
      res.err = best; res.t = bt; return best;
    };
    const SUBS = [[new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]), new Uint8Array([8, 9, 10, 11, 12, 13, 14, 15])], [new Uint8Array([0, 1, 4, 5, 8, 9, 12, 13]), new Uint8Array([2, 3, 6, 7, 10, 11, 14, 15])]];   // p = x*4 + y: flip 0 left|right, flip 1 top/bottom
    const ra = { idx: new Uint8Array(8), tmp: new Uint8Array(8), err: 0, t: 0 }, rb = { idx: new Uint8Array(8), tmp: new Uint8Array(8), err: 0, t: 0 };
    const bytes = new Uint8Array(8), A0 = new Float64Array(3), A1 = new Float64Array(3), Q0 = new Int32Array(3), Q1 = new Int32Array(3), C0 = new Int32Array(3), C1 = new Int32Array(3);
    const avg = (idx, A) => { let r = 0, g = 0, b = 0; for (let q = 0; q < 8; q++) { const p = idx[q]; r += R[p]; g += Gc[p]; b += B[p]; } A[0] = r / 8; A[1] = g / 8; A[2] = b / 8; };
    let o = 0;
    for (let by = 0; by < h; by += 4) for (let bx = 0; bx < w; bx += 4) {
      for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) { const i = ((by + y) * w + bx + x) * 4, p = x * 4 + y; R[p] = px[i]; Gc[p] = px[i + 1]; B[p] = px[i + 2]; }
      let bestErr = 1e18;
      for (let flip = 0; flip < 2; flip++) {
        const s0 = SUBS[flip][0], s1 = SUBS[flip][1];
        avg(s0, A0); avg(s1, A1);
        let ok = true;
        for (let i = 0; i < 3; i++) { Q0[i] = Math.round(A0[i] * 31 / 255); Q1[i] = Math.round(A1[i] * 31 / 255); const d = Q1[i] - Q0[i]; if (d < -4 || d > 3) ok = false; }
        const diff = ok ? 1 : 0;
        if (diff) for (let i = 0; i < 3; i++) { C0[i] = (Q0[i] << 3) | (Q0[i] >> 2); C1[i] = (Q1[i] << 3) | (Q1[i] >> 2); }
        else for (let i = 0; i < 3; i++) { Q0[i] = Math.round(A0[i] * 15 / 255); Q1[i] = Math.round(A1[i] * 15 / 255); C0[i] = Q0[i] * 17; C1[i] = Q1[i] * 17; }
        const err = sub(s0, C0[0], C0[1], C0[2], ra) + (bestErr < 1e18 ? 0 : 0) + sub(s1, C1[0], C1[1], C1[2], rb);
        if (err < bestErr) {
          bestErr = err;
          for (let i = 0; i < 3; i++) bytes[i] = diff ? (Q0[i] << 3) | ((Q1[i] - Q0[i]) & 7) : (Q0[i] << 4) | Q1[i];
          bytes[3] = (ra.t << 5) | (rb.t << 2) | (diff << 1) | flip;
          let msb = 0, lsb = 0;
          for (let q = 0; q < 8; q++) { let p = s0[q], v = ra.idx[q]; if (v & 2) msb |= 1 << p; if (v & 1) lsb |= 1 << p; p = s1[q]; v = rb.idx[q]; if (v & 2) msb |= 1 << p; if (v & 1) lsb |= 1 << p; }
          bytes[4] = msb >> 8; bytes[5] = msb & 255; bytes[6] = lsb >> 8; bytes[7] = lsb & 255;
        }
      }
      out.set(bytes, o); o += 8;
    }
    return out;
  }
  function resWorkers() {
    if (resPool) return resPool;
    const src = etcEncode.toString() + '\nonmessage = (e) => { const d = etcEncode(new Uint8Array(e.data.px), e.data.w, e.data.h); postMessage({ id: e.data.id, d }, [d.buffer]); };';
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
    resPool = { ws: [], jobs: new Map(), id: 0, next: 0 };
    for (let i = 0; i < n; i++) {
      const w = new Worker(url);
      w.onmessage = (e) => { const j = resPool.jobs.get(e.data.id); resPool.jobs.delete(e.data.id); if (j) j[0](e.data.d); };
      w.onerror = (e) => { for (const j of resPool.jobs.values()) j[1](new Error('etc worker: ' + (e.message || 'failed'))); resPool.jobs.clear(); };
      resPool.ws.push(w);
    }
    return resPool;
  }
  const etcAsync = (px, w, h) => new Promise((ok, no) => { const P = resWorkers(), id = ++P.id; P.jobs.set(id, [ok, no]); P.ws[P.next++ % P.ws.length].postMessage({ id, px: px.buffer, w, h }, [px.buffer]); });
  function resFree(R6) {
    if (!R6 || !gl) return;
    for (const t of R6.sheets || []) if (t) gl.deleteTexture(t);
    for (const ov of (R6.over || new Map()).values()) { gl.deleteTexture(ov.t); gl.deleteFramebuffer(ov.f); }
    if (R6.mtex) gl.deleteTexture(R6.mtex);
    if (R6.ftex) { gl.deleteTexture(R6.ftex); gl.deleteFramebuffer(R6.ffb); }
    R6.sheets = []; R6.over = new Map(); R6.mtex = null; R6.ftex = null;
  }
  function resOff(R6, why) {
    if (R6.state === 'off') return;
    R6.state = 'off'; resFree(R6);
    if (R6.g && R6.g.ground) R6.g.ground.resident = false;
    note('resident off: ' + why);
  }
  function resStart() {
    const src = G.ground.src;
    S.res = { state: 'off' };
    if (!RES || !src || typeof Worker === 'undefined' || typeof createImageBitmap !== 'function') return;
    if (etcExt === undefined) etcExt = gl.getExtension('WEBGL_compressed_texture_etc') || null;
    const rgba = RES_RGBA;
    if (!etcExt && !rgba) return;
    const per = src.per, SH = src.SH, total = per * per, g = G, id = validMap(G.mapId);
    const R6 = S.res = { state: 'building', rgba, g, per, SH, total, done: 0, sheets: new Array(total), dims: new Array(total), over: new Map(), markAt: 0, redo: [], folding: 0, lastFold: 0, t0: performance.now() };
    const key = (i) => new URL('etc/' + id + '/' + i + '.etc' + src.q, location.href).href;
    let cache = null;
    const one = async (i) => {
      const sx = (i % per) * SH, sy = Math.floor(i / per) * SH, w = Math.min(SH, WORLD - sx), h = Math.min(SH, WORLD - sy), w4 = (w + 3) & ~3, h4 = (h + 3) & ~3;
      let data = null;
      if (cache && !rgba) try { const r = await cache.match(key(i)); if (r) data = new Uint8Array(await r.arrayBuffer()); } catch (_) {}
      if (!data || data.length !== (w4 >> 2) * (h4 >> 2) * 8) {
        const r = await fetch(src.dir + i + '.webp' + src.q);
        if (!r.ok) throw new Error('sheet ' + i + ' ' + r.status);
        const bmp = await createImageBitmap(await r.blob());
        if (R6.state !== 'building') return;
        const c = mkCanvas(w4, h4), x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(bmp, 0, 0); if (bmp.close) bmp.close();
        if (w4 > w) x.drawImage(c, w - 1, 0, 1, h, w, 0, w4 - w, h);   // (the edge carried on to whole blocks)
        if (h4 > h) x.drawImage(c, 0, h - 1, w4, 1, 0, h, w4, h4 - h);
        if (!src.dressed && typeof lookDressRegion === 'function' && LOOK.dress && G === g) lookDressRegion(x, sx, sy, w, h);
        if (rgba) {   // (computers: the sheet as it is)
          if (R6.state !== 'building' || failed || !gl) return;
          const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w4, h4);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, c); c.width = c.height = 0;
          R6.sheets[i] = t; R6.dims[i] = [sx, sy, w4, h4]; R6.done++;
          return;
        }
        const px = x.getImageData(0, 0, w4, h4).data; c.width = c.height = 0;
        data = await etcAsync(new Uint8Array(px.buffer), w4, h4);
        if (cache) try { await cache.put(key(i), new Response(data.slice())); } catch (_) {}
      }
      if (R6.state !== 'building' || failed || !gl) return;
      const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.compressedTexImage2D(gl.TEXTURE_2D, 0, etcExt.COMPRESSED_RGB8_ETC2, w4, h4, 0, data);
      R6.sheets[i] = t; R6.dims[i] = [sx, sy, w4, h4]; R6.done++;
    };
    (async () => {
      if (!rgba) resWorkers();
      try { if (src.dressed && typeof caches !== 'undefined') cache = await caches.open(RES_CACHE); } catch (_) { cache = null; }
      let next = 0;
      const lane = async () => { while (next < total && R6.state === 'building') await one(next++); };
      await Promise.all(Array.from({ length: rgba ? 4 : resPool.ws.length + 1 }, lane));
      if (R6.state === 'building') { R6.state = 'marks'; R6.ms = Math.round(performance.now() - R6.t0); note('resident ' + R6.ms + ' ms'); }
    })().catch((e) => resOff(R6, (e && e.message) || String(e)));
  }
  // The small programs: a picture laid into an overlay (premultiplied: the overlay is too), and a tile's compressed
  // ground with its overlay drawn together (to fold it in).
  function resPrograms() {
    if (PM) return;
    const mk = (t, s) => { const h = gl.createShader(t); gl.shaderSource(h, s); gl.compileShader(h); if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(h)); return h; };
    const link = (vs, fs, u) => { const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'aQ'); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); const l = {}; for (const n of u) l[n] = gl.getUniformLocation(p, n); return [p, l]; };
    [PM, locM] = link(`#version 300 es
in vec2 aQ; uniform vec4 uR; uniform vec2 uUV; uniform float uT; out vec2 vUV;
void main() { gl_Position = vec4((uR.xy + aQ * uR.zw) / uT * 2.0 - 1.0, 0.0, 1.0); vUV = aQ * uUV; }`, `#version 300 es
precision mediump float; in vec2 vUV; uniform sampler2D uM; out vec4 o; void main() { o = texture(uM, vUV); }`, ['uR', 'uUV', 'uT', 'uM']);
    [PF, locF] = link(`#version 300 es
in vec2 aQ; void main() { gl_Position = vec4(aQ * 2.0 - 1.0, 0.0, 1.0); }`, `#version 300 es
precision mediump float; uniform sampler2D uB, uO; uniform ivec2 uOff; out vec4 o;
void main() { ivec2 p = ivec2(gl_FragCoord.xy); vec4 b = texelFetch(uB, p + uOff, 0), v = texelFetch(uO, p, 0); o = vec4(b.rgb * (1.0 - v.a) + v.rgb, 1.0); }`, ['uB', 'uO', 'uOff']);
    resQuad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, resQuad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  }
  function resOverlay(R6, k, T) {
    let ov = R6.over.get(k);
    if (ov) return ov;
    const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, T, T);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.viewport(0, 0, T, T); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    ov = { t, f, last: 0, marks: [] }; R6.over.set(k, ov);
    return ov;
  }
  // Mark i drawn into the overlays of the tiles it reaches (only tile `only`, when one is given: after a fold).
  function resMark(R6, A, i, only) {
    const m = G.marks[i];
    if (!m) return;
    const T = A.T, bx = Math.floor(m[3]), by = Math.floor(m[4]), w = Math.ceil(m[5]) - bx + 1, h = Math.ceil(m[6]) - by + 1;
    const tx0 = Math.max(0, Math.floor(bx / T)), ty0 = Math.max(0, Math.floor(by / T)), tx1 = Math.min(A.n - 1, Math.floor((bx + w - 1) / T)), ty1 = Math.min(A.n - 1, Math.floor((by + h - 1) / T));
    if (tx1 < tx0 || ty1 < ty0) return;
    const c = G.ground.markCanvas(m);
    if (!R6.mtex) { R6.mtex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R6.mtex); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R6.mtex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    const now = performance.now();
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const k = ty * A.n + tx;
      if (only !== undefined && k !== only) continue;
      const ov = resOverlay(R6, k, T);
      gl.useProgram(PM); gl.bindFramebuffer(gl.FRAMEBUFFER, ov.f); gl.viewport(0, 0, T, T);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R6.mtex); gl.uniform1i(locM.uM, 0);
      gl.uniform4f(locM.uR, bx - tx * T, by - ty * T, w, h); gl.uniform2f(locM.uUV, w / c.width, h / c.height); gl.uniform1f(locM.uT, T);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      ov.last = now; ov.marks.push(i);
    }
  }
  // Tile k's overlay folded into the compressed ground: drawn together, read back, compressed (a worker), put in place.
  function resFold(R6, A, k, ov) {
    const T = A.T, [x0, y0] = A.at(k), i = Math.floor(y0 / R6.SH) * R6.per + Math.floor(x0 / R6.SH), d = R6.dims[i];
    const w4 = (Math.min(T, WORLD - x0) + 3) & ~3, h4 = (Math.min(T, WORLD - y0) + 3) & ~3;
    if (!R6.ftex) {
      R6.ftex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R6.ftex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, T, T);
      R6.ffb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, R6.ffb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, R6.ftex, 0);
    }
    gl.useProgram(PF); gl.bindFramebuffer(gl.FRAMEBUFFER, R6.ffb); gl.viewport(0, 0, w4, h4); gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R6.sheets[i]); gl.uniform1i(locF.uB, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, ov.t); gl.uniform1i(locF.uO, 1);
    gl.uniform2i(locF.uOff, x0 - d[0], y0 - d[1]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (R6.rgba) {   // (computers: copied straight into the sheet, at once)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R6.sheets[i]);
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, x0 - d[0], y0 - d[1], 0, 0, w4, h4);
      gl.deleteTexture(ov.t); gl.deleteFramebuffer(ov.f); R6.over.delete(k); R6.folds = (R6.folds || 0) + 1;
      return;
    }
    const px = new Uint8Array(w4 * h4 * 4); gl.readPixels(0, 0, w4, h4, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const snap = ov.marks.length;
    R6.folding++; ov.folding = true;
    etcAsync(px, w4, h4).then((data) => {
      R6.folding--; ov.folding = false; R6.folds = (R6.folds || 0) + 1;
      if ((R6.state !== 'ready' && R6.state !== 'marks') || failed || !gl || R6.over.get(k) !== ov) return;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R6.sheets[i]);
      gl.compressedTexSubImage2D(gl.TEXTURE_2D, 0, x0 - d[0], y0 - d[1], w4, h4, etcExt.COMPRESSED_RGB8_ETC2, data);
      const rest = ov.marks.slice(snap);
      gl.deleteTexture(ov.t); gl.deleteFramebuffer(ov.f); R6.over.delete(k);
      for (const j of rest) R6.redo.push([j, k]);   // (marks that came while it was being folded: drawn again)
    }).catch((e) => resOff(R6, 'fold: ' + ((e && e.message) || e)));
  }
  // Once a frame (from R.ground, before the scene): new marks into the overlays, and a fold now and then.
  function resTick(A) {
    const R6 = S.res;
    if (!R6 || (R6.state !== 'marks' && R6.state !== 'ready')) return;
    resPrograms();
    const t0 = performance.now(), budget = R6.state === 'marks' ? 40 : 4;
    // The marks already made (a continued battle can have thousands): gathered per tile, and each tile's drawn into its
    // overlay and folded in at once, a few tiles at a time, behind the Loading card (not hundreds of overlays at once).
    if (R6.state === 'marks' && !R6.backlog) {
      const T = A.T, by = new Map();
      for (let i = 0; i < G.marks.length; i++) {
        const m = G.marks[i]; if (!m) continue;
        const bx = Math.floor(m[3]), bY = Math.floor(m[4]), x1 = Math.ceil(m[5]), y1 = Math.ceil(m[6]);
        for (let ty = Math.max(0, Math.floor(bY / T)); ty <= Math.min(A.n - 1, Math.floor(y1 / T)); ty++) for (let tx = Math.max(0, Math.floor(bx / T)); tx <= Math.min(A.n - 1, Math.floor(x1 / T)); tx++) {
          const k = ty * A.n + tx; let l = by.get(k); if (!l) by.set(k, l = []); l.push(i);
        }
      }
      R6.backlog = [...by]; R6.markAt = G.marks.length;
    }
    const work = R6.redo.length || R6.markAt < G.marks.length || (R6.backlog && R6.backlog.length) || (R6.folding < RES_FOLDS && (R6.rgba || t0 - R6.lastFold > 100) && R6.over.size);
    if (!work) { if (R6.state === 'marks' && !R6.folding) resReady(R6); return; }
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    gl.bindBuffer(gl.ARRAY_BUFFER, resQuad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    while (R6.backlog && R6.backlog.length && R6.folding < 3 && performance.now() - t0 < budget) {
      const [k, l] = R6.backlog.shift();
      for (const i of l) resMark(R6, A, i, k);
      const ov = R6.over.get(k); if (ov) { gl.disable(gl.BLEND); resFold(R6, A, k, ov); gl.enable(gl.BLEND); gl.useProgram(PM); gl.bindBuffer(gl.ARRAY_BUFFER, resQuad); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); }
    }
    while (R6.redo.length && performance.now() - t0 < budget) { const [j, k] = R6.redo.shift(); resMark(R6, A, j, k); }
    while (R6.markAt < G.marks.length && performance.now() - t0 < budget) resMark(R6, A, R6.markAt++);
    // A fold every 100 ms at most, two at a time: the overlay touched longest ago, once it has been quiet RES_FOLD_IDLE ms,
    // or at once while there are more than RES_OVER_MAX (a big battle marking the ground everywhere).
    for (let f = 0; f < (R6.rgba ? 4 : 1) && R6.folding < RES_FOLDS && (R6.rgba || t0 - R6.lastFold > 100); f++) {
      let pick = null;
      for (const [k, ov] of R6.over) if (!ov.folding && (!pick || ov.last < pick[1].last)) pick = [k, ov];
      if (!pick || !(t0 - pick[1].last > RES_FOLD_IDLE || R6.over.size > RES_OVER_MAX)) break;
      R6.lastFold = t0; resFold(R6, A, pick[0], pick[1]);
      gl.enable(gl.BLEND);
    }
    gl.disable(gl.BLEND); gl.disableVertexAttribArray(0); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (R6.state === 'marks' && R6.markAt >= G.marks.length && !R6.redo.length && !(R6.backlog && R6.backlog.length) && !R6.folding) resReady(R6);
  }
  function resReady(R6) {
    R6.state = 'ready';
    for (const e of S.tex.values()) { gl.deleteTexture(e.g); if (e.d) gl.deleteTexture(e.d); }
    S.tex.clear();
    if (S.pv) { gl.deleteTexture(S.pv); S.pv = null; S.pvSrc = null; }
    G.ground.release();
  }
  // For ui.js: 'building' (the Loading card waits for it), 'ready' (art.js's tiles are not wanted), or null (as before).
  R.resident = () => {
    const R6 = S && S.G === G && G && S.ground === G.ground ? S.res : null;
    if (failed || R.paused) { if (G && G.ground && G.ground.resident) G.ground.resident = false; return null; }   // (the 2D way: art.js's tiles again)
    if (!R6) return RES && G && G.ground && G.ground.src && R.on ? 'building' : null;
    if (R6.state === 'ready' && !G.ground.resident) G.ground.release();   // (back from the 2D way: its tiles let go again)
    return R6.state === 'ready' ? 'ready' : R6.state === 'building' || R6.state === 'marks' ? 'building' : null;
  };
  R.resProgress = () => { const R6 = S && S.res; return R6 && R6.total ? (R6.done + (R6.state === 'ready' ? 1 : 0)) / (R6.total + 1) : 0; };
  R.resStats = () => { const R6 = S && S.res; return R6 ? { state: R6.state, done: R6.done, total: R6.total, ms: R6.ms, over: R6.over ? R6.over.size : 0, folds: R6.folds || 0, marks: R6.markAt } : null; };
  // ---- Stage 2: the sorted list's pictures (units, structures, trees, cliffs, walls, houses, props...) ------------------
  // listBegin(v) gives a stand-in for the view canvas: its drawImage calls are recorded as quads (worked out exactly as
  // art.js uprightCtx draws them: an upright picture at its rounded anchor, anything else through the transform), and
  // everything else it is asked to draw (pixels, lines, text) goes to a 2D layer of the same size. listDepth(d) sets the
  // depth (a viewDepth) of what follows, set before each thing in the list from its sort key plus a margin so its own
  // lower edge is not cut by the ground just in front of it. listEnd(v) draws the quads in order over the ground (tested
  // against its depth, not writing their own: the list's order decides between them), then puts them and the layer into v.
  const VS2 = `#version 300 es
in vec2 aP; in vec2 aUV; in float aD; in float aA; in vec3 aC; uniform vec2 uSize; out vec2 vUV; out float vA; out vec3 vC;
void main() { vec2 s = aP / uSize * 2.0 - 1.0; gl_Position = vec4(s.x, -s.y, aD, 1.0); vUV = aUV; vA = aA; vC = aC; }`;
  const FS2 = `#version 300 es
precision mediump float; in vec2 vUV; in float vA; in vec3 vC; layout(location = 0) out vec4 o; layout(location = 1) out vec4 o1;
uniform sampler2D uTex, uNrm; uniform float uShowN, uHasN, uOver;
void main() {
  vec4 c = texture(uTex, vUV), nn = texture(uNrm, vUV);
  bool has = uHasN > 0.5 && nn.a > 0.5;   // (alpha 0 in the normal atlas: no normal map there)
  if (uShowN > 0.5) { vec3 n = has ? nn.rgb : vec3(0.25); c = vec4(n * c.a, c.a); }   // (?gl=normals: the normal maps)
  o = vec4(c.rgb * vC, c.a) * vA;   // (vC: a solid rectangle's colour on the white pixel; 1 for pictures)
  // Stage 4: the normals' layer (premultiplied like the colour; rgb 0: no normal, lit flat). Only pictures laid over
  // what is under them write it; added, multiplied and screened ones leave it as it is.
  o1 = uOver > 0.5 ? vec4(has ? nn.rgb : vec3(0.0), 1.0) * (c.a * vA) : vec4(0.0);
}`;
  let P2 = null, loc2 = null, layer = null, lctx = null, rec = null, depth = 0, texOf = new Map(), vbuf2 = null;
  function init2() {
    const mk = (t, src) => { const h = gl.createShader(t); gl.shaderSource(h, src); gl.compileShader(h); if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(h)); return h; };
    P2 = gl.createProgram(); gl.attachShader(P2, mk(gl.VERTEX_SHADER, VS2)); gl.attachShader(P2, mk(gl.FRAGMENT_SHADER, FS2)); gl.linkProgram(P2);
    if (!gl.getProgramParameter(P2, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(P2));
    loc2 = {}; for (const n of ['uSize', 'uTex', 'uNrm', 'uShowN', 'uHasN', 'uOver']) loc2[n] = gl.getUniformLocation(P2, n); for (const n of ['aP', 'aUV', 'aD', 'aA', 'aC']) loc2[n] = gl.getAttribLocation(P2, n);
    vbuf2 = gl.createBuffer();
    layer = mkCanvas(64, 64); lctx = uprightCtx(layer.getContext('2d'));
  }
  function spriteTex(img) {
    let e = texOf.get(img);
    const w = img.width, h = img.height;
    if (e) e.used = performance.now();
    if (e && e.w === w && e.h === h && e.ver === img._ver) return e.t;
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    const t = e ? e.t : gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    texOf.set(img, { t, w, h, ver: img._ver, used: performance.now() });   // (_ver: a picture that changes, drawn again into its texture when it has)
    return t;
  }
  // ---- Stage 2b: atlases and normal maps -----------------------------------------------------------------------
  // Pictures up to PIC_MAX px a side are packed into ATL_N textures of ATL px (shelf by shelf, uploaded into place with
  // texSubImage2D); when all are full, the least recently drawn one is emptied. Each atlas has a twin of the same layout
  // for normal maps: a picture's normal map (red, green: its surface's direction turned with the view; blue: height) is
  // worked out from its voxel model (nrmPic, the same projection as voxel.js renderVox) when first drawn, at most NRM_MS
  // ms a frame, and put at the same spot. Larger pictures keep a texture of their own (spriteTex).
  const ATL = 2048, ATL_N = typeof GROUND_ROOMY !== 'undefined' && !GROUND_ROOMY ? 2 : 3, PIC_MAX = 400, NRM_MS = 3, TEX_IDLE = 10000;   // (phones: 2 pages, 33.5 MB less: owner, 2026-11-21)
  const SHOW_N = /[?&]gl=normals\b/.test(q);
  let atl = null, nrmSpend = 0, atlWipe = false;
  const whiteAt = new WeakMap();   // texture -> the uv of its white pixel (atlases): coloured shapes drawn from it join the pictures' runs
  const place = new WeakMap();
  function atlasFor(img) {
    if (img.width > PIC_MAX || img.height > PIC_MAX || img._own) return null;   // (_own: changes often or is stretched smooth: a texture of its own)
    if (!atl) atl = [];
    let e = place.get(img);
    if (e && atl[e.a] && atl[e.a].gen === e.gen && e.w === img.width && e.h === img.height) { atl[e.a].used = S.frame; return e; }
    const w = img.width, h = img.height;
    let a = atl.findIndex((A) => A && fits(A, w, h));
    if (a < 0 && atl.length < ATL_N) { a = atl.length; atl.push(newAtlas()); }
    if (a < 0) {   // all full: empty the one drawn least lately (its pictures go in again as they are drawn)
      a = 0; for (let i = 1; i < atl.length; i++) if (atl[i].used < atl[a].used) a = i;
      // (all in use this very frame: draw this one on its own, and empty the page filled longest ago at the next frame's
      // start, atlWipe; before, once every page was full and drawn from each frame, none was ever emptied again and every
      // new picture got a texture of its own for the rest of the battle)
      if (atl[a].used === S.frame) { R.atlFull = (R.atlFull || 0) + 1; atlWipe = true; return null; }
      emptyAtlas(atl[a]);
    }
    const A = atl[a], sh = A.sh;
    if (sh.x + w > ATL - 2) { sh.y += sh.h + 1; sh.x = 0; sh.h = 0; }   // (ATL - 2: the last column keeps a white pixel, for coloured shapes in the same run)
    e = { a, gen: A.gen, x: sh.x, y: sh.y, w, h, n: false };
    sh.x += w + 1; sh.h = Math.max(sh.h, h);
    gl.bindTexture(gl.TEXTURE_2D, A.t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, e.x, e.y, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    A.used = S.frame; place.set(img, e);
    return e;
  }
  function emptyAtlas(A) { A.gen++; A.sh = { x: 0, y: 0, h: 0 }; A.born = R.frames; R.atlEmptied = (R.atlEmptied || 0) + 1; }
  function fits(A, w, h) { const sh = A.sh; return (sh.x + w <= ATL - 2 && sh.y + Math.max(sh.h, h) <= ATL) || (sh.y + sh.h + 1 + h <= ATL && w <= ATL - 2); }
  function newAtlas() {
    const mk = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, ATL, ATL);
      for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
    const A = { t: mk(), n: mk(), gen: 0, used: 0, born: R.frames, sh: { x: 0, y: 0, h: 0 } };
    gl.bindTexture(gl.TEXTURE_2D, A.t); gl.texSubImage2D(gl.TEXTURE_2D, 0, ATL - 1, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));   // (the white pixel)
    whiteAt.set(A.t, [(ATL - 0.5) / ATL, 0.5 / ATL]);
    return A;
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
      const pix = (255 << 24) | ((typeof M_GLOW !== 'undefined' && s.mat[i] === M_GLOW ? 1 : Math.min(255, Math.max(2, Math.round((z + 0.5) * 3)))) << 16)   // (blue: height, 2 and up; 1: a glowing part, which the sun does not light) | (Math.round((nyr * 0.5 + 0.5) * 255) << 8) | Math.round((nxr * 0.5 + 0.5) * 255);
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
  R.nrmPic = nrmPic;   // (tools/bake-normals.js)
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
  // The stand-in's transform, read from the canvas once until it is changed through the stand-in (getTransform makes a new
  // matrix each time: it was a good part of the cost of recording each unit).
  let mCache = null;
  const curM = () => mCache || (mCache = lctx.getTransform());
  const tp = (x, y) => { const m = curM(); return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]; };
  const scl = () => { const m = curM(); return Math.hypot(m.a, m.b) + Math.hypot(m.c, m.d); };
  // (stage 3) The blend the bits are drawn with: when it changes between two WebGL does, what is on the layer is cut out
  // first and drawn with its own (a glow drawn 'lighter' adds, as in 2D); other blends act on the layer as it is.
  let dirtyOp = 'source-over';
  // A fill style that is one colour: [r, g, b, a] in 0..1 (the canvas gives it back as #rrggbb or rgba(...)), else null.
  let clipped = false, segs = [], segOk = true, last = null, softN = 0, subs = [], curved = false, shut = false;
  // A whole ellipse (centre, radii, turn, start and end angles) as a new subpath of 24 sides, if it starts one; else false.
  function whole(x, y, rx, ry, rot, a0, a1) {
    if (!(Math.abs(a1 - a0) >= Math.PI * 2 - 1e-6) || !(rx > 0 && ry > 0)) return false;
    const L = subs[subs.length - 1];
    if (L && (L.length > 2 || shut)) return false;   // (joined to what came before)
    if (L) subs.pop();
    const P = [], c = Math.cos(rot || 0), sn = Math.sin(rot || 0), N = 24;
    for (let i = 0; i < N; i++) { const t = i / N * Math.PI * 2, ex = Math.cos(t) * rx, ey = Math.sin(t) * ry; P.push(...tp(x + ex * c - ey * sn, y + ex * sn + ey * c)); }
    P.ring = true;   // (a closed outline: stroke() draws it as lines too)
    subs.push(P); shut = true; last = null;
    return true;
  }
  // A polygon (screen px, x y x y...) that turns one way only (a triangle fan fills it exactly).
  const convex = (P) => {
    const n = P.length / 2; if (n < 3) return false;
    let sg = 0;
    for (let i = 0; i < n; i++) {
      const ax = P[2 * i], ay = P[2 * i + 1], bx = P[(2 * i + 2) % P.length], by = P[(2 * i + 3) % P.length], cx = P[(2 * i + 4) % P.length], cy = P[(2 * i + 5) % P.length];
      const cr = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
      if (Math.abs(cr) < 1e-6) continue;
      if (!sg) sg = Math.sign(cr); else if (Math.sign(cr) !== sg) return false;
    }
    return sg !== 0;
  }; const clipStack = [], solids = new Map(), softPool = [];
  function solid(fs) {
    if (typeof fs !== 'string') return null;
    let c = solids.get(fs);
    if (c === undefined) {
      let m;
      if (fs[0] === '#' && fs.length === 7) c = [parseInt(fs.slice(1, 3), 16) / 255, parseInt(fs.slice(3, 5), 16) / 255, parseInt(fs.slice(5, 7), 16) / 255, 1];
      else if ((m = fs.match(/^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)$/))) c = [m[1] / 255, m[2] / 255, m[3] / 255, m[4] === undefined ? 1 : +m[4]];
      else c = null;
      if (solids.size > 4000) solids.clear();
      solids.set(fs, c);
    }
    return c;
  }
  const mark = (b) => {
    if (!b) return;
    const op = lctx.globalCompositeOperation;
    if (BLENDS[op] === undefined) R.unsupported[op] = (R.unsupported[op] || 0) + 1;
    else if (op !== dirtyOp) { if (dirty) flush(); dirtyOp = op; }
    dirty = dirty ? grow(grow(dirty, b[0], b[1], 0), b[2], b[3], 0) : b.slice();
  };
  function atlasSpot(w, h) {
    if (w > ATLAS - 2 || h > ATLAS) return null;
    if (!shelf || shelf.x + w > ATLAS - 2) { if (shelf) { shelf.y += shelf.h; shelf.x = 0; shelf.h = 0; } }
    if (!shelf || shelf.y + h > ATLAS) {
      const i = shelf ? shelf.i + 1 : 0;
      if (!atlases[i]) atlases[i] = { c: mkCanvas(ATLAS, ATLAS), t: null };
      const ac = atlases[i].c.getContext('2d'); ac.clearRect(0, 0, ATLAS, atlases[i].h || ATLAS); ac.fillStyle = '#fff'; ac.fillRect(ATLAS - 1, 0, 1, 1); atlases[i].used = true; atlases[i].h = 1;   // (top right: a white pixel, see whiteAt)
      shelf = { i, x: 0, y: 0, h: 0 };
    }
    const at = { i: shelf.i, x: shelf.x, y: shelf.y };
    shelf.x += w + 1; shelf.h = Math.max(shelf.h, h + 1);
    atlases[shelf.i].h = Math.max(atlases[shelf.i].h || 0, shelf.y + h + 1);   // (how far down it is used: only that is uploaded)
    return at;
  }
  function flush() {
    if (!dirty) return;
    flush1();
  }
  function flush1() {
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
    try { if (!P2) init2(); } catch (err) { failed = true; console.warn('WebGL list off:', err); note('list off: ' + (err && err.message)); return null; }
    if (layer.width !== FW || layer.height !== FH) { layer.width = FW; layer.height = FH; lctx = uprightCtx(layer.getContext('2d')); }
    lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.clearRect(0, 0, layer.width, layer.height);
    if (over) { lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.upright = false; } else { lctx.setTransform(v.getTransform()); lctx.upright = v.upright; }   // (over: screen px of the canvas) lctx.imageSmoothingEnabled = false; lctx.globalAlpha = 1; lctx.globalCompositeOperation = 'source-over';
    lctx.fillStyle = '#000'; lctx.strokeStyle = '#000'; lctx.lineWidth = 1;
    rec = []; dirty = null; dirtyOp = 'source-over'; pathBox = null; shelf = null; depth = -1; if (!over) { R.bits = 0; softN = 0; }
    for (const a of atlases) a.used = false;
    const draw = (img, ...a) => {
      if (!img || !img.width || !img.height || (img.complete === false)) return;
      const n = a.length, j = n === 8 ? 4 : 0, dx = a[j], dy = a[j + 1];
      const w = n === 2 ? img.width : a[j + 2], h = n === 2 ? img.height : a[j + 3];
      const sx = n === 8 ? a[0] : 0, sy = n === 8 ? a[1] : 0, sw = n === 8 ? a[2] : img.width, sh = n === 8 ? a[3] : img.height;
      const m = curM(), sprite = img._ox !== undefined;
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
      beginPath() { pathBox = null; segs = []; segOk = true; last = null; subs = []; curved = false; shut = false; lctx.beginPath(); },
      closePath() { const P = subs[subs.length - 1]; if (P && last && P.length >= 4) { segs.push(last[0], last[1], P[0], P[1]); last = [P[0], P[1]]; } else segOk = false; lctx.closePath(); },
      moveTo(x, y) { const [X, Y] = tp(x, y); pathBox = grow(pathBox, X, Y, 0); last = [X, Y]; subs.push([X, Y]); shut = false; lctx.moveTo(x, y); },
      lineTo(x, y) { if (shut) curved = true; const [X, Y] = tp(x, y); pathBox = grow(pathBox, X, Y, 0); if (last) segs.push(last[0], last[1], X, Y); else segOk = false; last = [X, Y]; if (subs.length) subs[subs.length - 1].push(X, Y); else subs.push([X, Y]); lctx.lineTo(x, y); },
      quadraticCurveTo(a, b, x, y) { segOk = false; curved = true; for (const [p, q] of [[a, b], [x, y]]) { const [X, Y] = tp(p, q); pathBox = grow(pathBox, X, Y, 0); } lctx.quadraticCurveTo(a, b, x, y); },
      bezierCurveTo(a, b, c, d, x, y) { segOk = false; curved = true; for (const [p, q] of [[a, b], [c, d], [x, y]]) { const [X, Y] = tp(p, q); pathBox = grow(pathBox, X, Y, 0); } lctx.bezierCurveTo(a, b, c, d, x, y); },
      // (stage 5) A whole circle or ellipse begun on its own (after beginPath or moveTo) is a convex polygon for fill();
      // a part of one is a curve (the layer).
      arc(x, y, r, ...k) { segOk = false; if (!whole(x, y, r, r, 0, k[0], k[1])) curved = true; const [X, Y] = tp(x, y); pathBox = grow(pathBox, X, Y, r * scl()); lctx.arc(x, y, r, ...k); },
      ellipse(x, y, rx, ry, ...k) { segOk = false; if (!whole(x, y, rx, ry, k[0], k[1], k[2])) curved = true; const [X, Y] = tp(x, y); pathBox = grow(pathBox, X, Y, Math.max(rx, ry) * scl()); lctx.ellipse(x, y, rx, ry, ...k); },
      rect(x, y, w, h) { segOk = false; { const P = []; for (const [p2, q2] of [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]) P.push(...tp(p2, q2)); subs.push(P); last = null; } for (const [p, q] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) { const [X, Y] = tp(p, q); pathBox = grow(pathBox, X, Y, 0); } lctx.rect(x, y, w, h); },
      fill(...a) {
        // (stage 5) Straight-sided shapes, each convex (walls' faces, prisms, flags), in one colour and a blend WebGL does,
        // not clipped: WebGL triangles in their place in the order, not a cut-out.
        const C = (!a.length || a[0] === 'nonzero') && !curved && subs.length && !clipped ? solid(lctx.fillStyle) : null, b = BLENDS[lctx.globalCompositeOperation];
        if (C && b !== undefined && subs.every(convex)) {
          flush();
          const al = lctx.globalAlpha * C[3];
          for (const P of subs) for (let i = 2; i + 3 < P.length; i += 2) rec.push({ q: [P[0], P[1], P[i], P[i + 1], P[i + 2], P[i + 3], P[i + 2], P[i + 3]], u0: 0, v0: 0, u1: 1, v1: 1, a: al, b, d: depth, col: C });
          R.polys = (R.polys || 0) + subs.length;
          return;
        }
        mark(pathBox && [pathBox[0] - 1, pathBox[1] - 1, pathBox[2] + 1, pathBox[3] + 1]); lctx.fill(...a);
      },
      stroke(...a) {
        // (stage 5) Straight lines only, in one colour and a blend WebGL does, not clipped (rain, cables, rally lines):
        // each a thin coloured quad, not a cut-out of the box round them all (rain's was the whole view, every frame).
        // Whole circles and ellipses (whole(): rings of blasts, the fountains' ripples, the walls' stones) as their 24 sides,
        // not a cut-out of the layer: they were most of the layer's area in a big battle zoomed out (2026-11-22).
        if (!a.length && !segOk && !curved && !clipped && subs.length && subs.every((P) => P.ring)) {
          segs = []; for (const P of subs) { const n = P.length; for (let i = 0; i < n; i += 2) segs.push(P[i], P[i + 1], P[(i + 2) % n], P[(i + 3) % n]); }
          segOk = true;
        }
        const C = !a.length && segOk && !clipped && segs.length ? solid(lctx.strokeStyle) : null, b = BLENDS[lctx.globalCompositeOperation];
        const hw = Math.max(0.5, (lctx.lineWidth || 1) * scl() / 4);   // (half the width)
        if (C && b !== undefined && segs.length <= 16000 && !lctx.getLineDash().length) {
          flush();
          const hw2 = hw, al = lctx.globalAlpha * C[3];   // (scl: the sum of both axes' scales)
          for (let i = 0; i < segs.length; i += 4) {
            const x0 = segs[i], y0 = segs[i + 1], x1 = segs[i + 2], y1 = segs[i + 3], L = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / L * hw, ny = (x1 - x0) / L * hw;
            rec.push({ q: [x0 + nx, y0 + ny, x1 + nx, y1 + ny, x0 - nx, y0 - ny, x1 - nx, y1 - ny], u0: 0, v0: 0, u1: 1, v1: 1, a: al, b, d: depth, col: C });
          }
          // Thick lines: their joins and round caps as small round fans, square caps carried on by half the width.
          if (hw > 1.5) {
            const cap = lctx.lineCap, fan = (cx, cy) => { const N = 10; for (let i = 0; i < N; i++) { const t0 = i / N * Math.PI * 2, t1 = (i + 1) / N * Math.PI * 2; rec.push({ q: [cx, cy, cx + Math.cos(t0) * hw, cy + Math.sin(t0) * hw, cx + Math.cos(t1) * hw, cy + Math.sin(t1) * hw, cx + Math.cos(t1) * hw, cy + Math.sin(t1) * hw], u0: 0, v0: 0, u1: 1, v1: 1, a: al, b, d: depth, col: C }); } };
            for (let i = 0; i < segs.length; i += 4) {
              const joinedBefore = i > 0 && segs[i] === segs[i - 2] && segs[i + 1] === segs[i - 1], joinedAfter = i + 4 < segs.length && segs[i + 2] === segs[i + 4] && segs[i + 3] === segs[i + 5];
              if (joinedAfter) fan(segs[i + 2], segs[i + 3]);
              if (cap === 'round') { if (!joinedBefore) fan(segs[i], segs[i + 1]); if (!joinedAfter) fan(segs[i + 2], segs[i + 3]); }
              else if (cap === 'square') { const x0 = segs[i], y0 = segs[i + 1], x1 = segs[i + 2], y1 = segs[i + 3], L = Math.hypot(x1 - x0, y1 - y0) || 1, dx = (x1 - x0) / L * hw, dy = (y1 - y0) / L * hw, nx = -dy, ny = dx;
                if (!joinedBefore) rec.push({ q: [x0 - dx + nx, y0 - dy + ny, x0 + nx, y0 + ny, x0 - dx - nx, y0 - dy - ny, x0 - nx, y0 - ny], u0: 0, v0: 0, u1: 1, v1: 1, a: al, b, d: depth, col: C });
                if (!joinedAfter) rec.push({ q: [x1 + nx, y1 + ny, x1 + dx + nx, y1 + dy + ny, x1 - nx, y1 - ny, x1 + dx - nx, y1 + dy - ny], u0: 0, v0: 0, u1: 1, v1: 1, a: al, b, d: depth, col: C }); }
            }
          }
          R.lines = (R.lines || 0) + segs.length / 4;
          return;
        }
        const r = lw(); mark(pathBox && [pathBox[0] - r, pathBox[1] - r, pathBox[2] + r, pathBox[3] + r]); lctx.stroke(...a); },
      // (stage 5) A solid rectangle in a blend WebGL does, not clipped: a coloured quad of its own in the order (no cut-out).
      fillRect(x, y, w, h) {
        const C = clipped ? null : solid(lctx.fillStyle), b = BLENDS[lctx.globalCompositeOperation];
        if (C && b !== undefined && w && h) {
          flush();
          let q;
          if (lctx.upright) { const m = curM(), cx = x + w / 2, cy = y + h / 2, X = m.a * cx + m.c * cy + m.e, Y = m.b * cx + m.d * cy + m.f, hw = Math.abs(w) / 2, hh = Math.abs(h) / 2; q = [X - hw, Y - hh, X + hw, Y - hh, X - hw, Y + hh, X + hw, Y + hh]; }
          else q = [...tp(x, y), ...tp(x + w, y), ...tp(x, y + h), ...tp(x + w, y + h)];
          rec.push({ q, u0: 0, v0: 0, u1: 1, v1: 1, a: lctx.globalAlpha * C[3], b, d: depth, col: C });
          R.rects = (R.rects || 0) + 1;
          return;
        }
        // A big fill with a gradient (a storm's darkening, a haze): drawn at a quarter size into a canvas of its own and
        // stretched up smoothly as one picture (gradients are smooth), not cut out of the layer at full size.
        const G2 = lctx.fillStyle;
        if (!clipped && !lctx.upright && b !== undefined && typeof CanvasGradient !== 'undefined' && G2 instanceof CanvasGradient && Math.abs(w * h) * scl() * scl() / 4 > 40000) {
          let bx = null; for (const [p2, q2] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) { const [X, Y] = tp(p2, q2); bx = grow(bx, X, Y, 0); }
          const X0 = Math.max(0, Math.floor(bx[0])), Y0 = Math.max(0, Math.floor(bx[1])), X1 = Math.min(layer.width, Math.ceil(bx[2])), Y1 = Math.min(layer.height, Math.ceil(bx[3]));
          if (X1 <= X0 || Y1 <= Y0) return;
          flush();
          const Q = 4, cw = Math.ceil((X1 - X0) / Q), ch = Math.ceil((Y1 - Y0) / Q);
          const c = softPool[softN] || (softPool[softN] = mkCanvas(cw, ch)); softN++;
          if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
          const g = c.getContext('2d'), m = curM();
          g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cw, ch);
          g.setTransform(m.a / Q, m.b / Q, m.c / Q, m.d / Q, (m.e - X0) / Q, (m.f - Y0) / Q); g.fillStyle = G2; g.fillRect(x, y, w, h);
          c._ver = (c._ver || 0) + 1; c._own = true;
          rec.push({ img: c, q: [X0, Y0, X1, Y0, X0, Y1, X1, Y1], u0: 0, v0: 0, u1: (X1 - X0) / Q / cw, v1: (Y1 - Y0) / Q / ch, a: lctx.globalAlpha, b, d: depth, s: 1 });
          R.softFills = (R.softFills || 0) + 1;
          return;
        }
        box4(x, y, w, h, 1); lctx.fillRect(x, y, w, h);
      },
      save() { clipStack.push(clipped); lctx.save(); },
      restore() { clipped = clipStack.length ? clipStack.pop() : false; mCache = null; lctx.restore(); },
      // (setTransform with six numbers and translate keep the cached matrix themselves: reading it back from the canvas
      // made a new matrix at nearly every picture drawn, a few ms a frame zoomed out over a big battle)
      setTransform(a, b, c, d, e, f) {
        if (arguments.length === 6) { mCache = { a, b, c, d, e, f }; lctx.setTransform(a, b, c, d, e, f); }
        else if (arguments.length === 1 && a && typeof a.a === 'number') { mCache = { a: a.a, b: a.b, c: a.c, d: a.d, e: a.e, f: a.f }; lctx.setTransform(a); }   // (a matrix put back: onHill, drawCliff)
        else { mCache = null; lctx.setTransform(...arguments); }
      },
      resetTransform() { mCache = null; lctx.resetTransform(); },
      transform(...a) { mCache = null; lctx.transform(...a); },
      translate(x, y) { const m = mCache; if (m) mCache = { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e + m.a * x + m.c * y, f: m.f + m.b * x + m.d * y }; lctx.translate(x, y); },
      scale(x, y) { mCache = null; lctx.scale(x, y); },
      rotate(a) { mCache = null; lctx.rotate(a); },
      clip(...a) { clipped = true; lctx.clip(...a); },
      strokeRect(x, y, w, h) { box4(x, y, w, h, lw()); lctx.strokeRect(x, y, w, h); },
      fillText(t, x, y, ...k) { const wd = lctx.measureText(t).width, f = parseFloat(lctx.font) || 12, m = curM(), X = m.a * x + m.c * y + m.e, Y = m.b * x + m.d * y + m.f; mark([X - wd - 4, Y - f * 1.5, X + wd + 4, Y + f]); lctx.fillText(t, x, y, ...k); },
      strokeText(t, x, y, ...k) { const wd = lctx.measureText(t).width, f = parseFloat(lctx.font) || 12, m = curM(), X = m.a * x + m.c * y + m.e, Y = m.b * x + m.d * y + m.f; mark([X - wd - 6, Y - f * 1.5, X + wd + 6, Y + f]); lctx.strokeText(t, x, y, ...k); },
      putImageData() { R.unsupported.putImageData = 1; },
    };
    function box4(x, y, w, h, r) {
      if (lctx.upright) { const m = curM(), cx = x + w / 2, cy = y + h / 2, X = m.a * cx + m.c * cy + m.e, Y = m.b * cx + m.d * cy + m.f; mark([X - Math.abs(w) / 2 - r, Y - Math.abs(h) / 2 - r, X + Math.abs(w) / 2 + r, Y + Math.abs(h) / 2 + r]); return; }
      let b = null; for (const [p, q] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) { const [X, Y] = tp(p, q); b = grow(b, X, Y, r); } mark(b);
    }
    const bound = new Map();   // (the canvas's own methods, bound once a frame, not at every call)
    clipped = false; clipStack.length = 0; mCache = null; segs = []; segOk = true; subs = []; curved = false; last = null;
    return new Proxy(lctx, {
      get(t, k) { if (k === 'drawImage') return draw; if (k === '_rawDraw') return rawDraw; if (hooks[k]) return hooks[k]; const x = t[k]; if (typeof x !== 'function') return x; let f = bound.get(k); if (!f) bound.set(k, f = x.bind(t)); return f; },
      set(t, k, val) { t[k] = val; return true; },
    });
  };
  // The depth of what follows: a viewDepth (tested against the ground), or null: drawn over the ground wherever it is
  // (marks on the ground drawn before the list: tracks, shadows, fog).
  R.listDepth = (d) => { if (!rec) return; flush(); depth = d === null ? -1 : 1 - 2 * (d + 64) / (2 * WORLD + 128); };
  // Draws the recorded quads (into the bound framebuffer: the scene's, tested against the ground's depth; or the canvas,
  // without depth, for what goes over the light pass).
  function drawRec(useDepth) {
    gl.useProgram(P2); gl.viewport(0, 0, FW, FH);
    if (useDepth) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); } else gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false); gl.enable(gl.BLEND);
    gl.uniform2f(loc2.uSize, FW, FH); gl.uniform1i(loc2.uTex, 0); gl.activeTexture(gl.TEXTURE0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    for (const a of atlases) if (a.used) {   // this frame's bits, uploaded once
      if (!a.t) { a.t = gl.createTexture(); whiteAt.set(a.t, [(ATLAS - 0.5) / ATLAS, 0.5 / ATLAS]); gl.bindTexture(gl.TEXTURE_2D, a.t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, ATLAS, ATLAS); for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
      const uh = Math.min(ATLAS, a.h || ATLAS);   // (stage 5: only the rows in use, not the whole 1024 px square)
      gl.bindTexture(gl.TEXTURE_2D, a.t); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ATLAS, uh, gl.RGBA, gl.UNSIGNED_BYTE, a.c);
      R.bitRows = (R.bitRows || 0) + uh;
    }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    nrmSpend = 0;
    // Where each quad's picture is: an atlas (with its normal map), a texture of its own, or this frame's bits.
    let prev = null;
    for (const r of rec) {
      if (r.col && prev && whiteAt.has(prev.tex) && !prev.s) { const w2 = whiteAt.get(prev.tex); r.tex = prev.tex; r.ntex = prev.ntex; r.u0 = r.u1 = w2[0]; r.v0 = r.v1 = w2[1]; prev = r; continue; }
      prev = r;
      if (r.atlas !== undefined) { r.tex = atlases[r.atlas].t; continue; }
      if (r.col) { if (!R.white) { R.white = texFrom(null); gl.bindTexture(gl.TEXTURE_2D, R.white); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255])); } r.tex = R.white; continue; }
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
  const VQ = 54;   // floats a quad: 6 corners of position, uv, depth, alpha, colour
  let qbuf = new Float32Array(VQ * 512);
  let vcap = 0;   // (floats vbuf2 holds)
  function drawQuads(list, normals) {
    if (qbuf.length < list.length * VQ) qbuf = new Float32Array(Math.ceil(list.length * 1.5) * VQ);   // (kept from frame to frame)
    const f = qbuf;
    let o = 0;
    for (let j = 0, n = list.length; j < n; j++) {   // (written out in full: a closure per quad cost a good part of this loop)
      const r = list[j], Q = r.q, d = r.d, a = r.a, C = r.col, cr = C ? C[0] : 1, cg = C ? C[1] : 1, cb = C ? C[2] : 1;
      const u0 = r.u0, v0 = r.v0, u1 = r.u1, v1 = r.v1;
      f[o] = Q[0]; f[o + 1] = Q[1]; f[o + 2] = u0; f[o + 3] = v0; f[o + 4] = d; f[o + 5] = a; f[o + 6] = cr; f[o + 7] = cg; f[o + 8] = cb;
      f[o + 9] = Q[2]; f[o + 10] = Q[3]; f[o + 11] = u1; f[o + 12] = v0; f[o + 13] = d; f[o + 14] = a; f[o + 15] = cr; f[o + 16] = cg; f[o + 17] = cb;
      f[o + 18] = Q[4]; f[o + 19] = Q[5]; f[o + 20] = u0; f[o + 21] = v1; f[o + 22] = d; f[o + 23] = a; f[o + 24] = cr; f[o + 25] = cg; f[o + 26] = cb;
      f[o + 27] = Q[2]; f[o + 28] = Q[3]; f[o + 29] = u1; f[o + 30] = v0; f[o + 31] = d; f[o + 32] = a; f[o + 33] = cr; f[o + 34] = cg; f[o + 35] = cb;
      f[o + 36] = Q[6]; f[o + 37] = Q[7]; f[o + 38] = u1; f[o + 39] = v1; f[o + 40] = d; f[o + 41] = a; f[o + 42] = cr; f[o + 43] = cg; f[o + 44] = cb;
      f[o + 45] = Q[4]; f[o + 46] = Q[5]; f[o + 47] = u0; f[o + 48] = v1; f[o + 49] = d; f[o + 50] = a; f[o + 51] = cr; f[o + 52] = cg; f[o + 53] = cb;
      o += 54;
    }
    // (the buffer's storage made once and grown, filled with bufferSubData: making it again every call, several times a
    // frame, grew the page's memory; see meshOf)
    gl.bindBuffer(gl.ARRAY_BUFFER, vbuf2);
    if (vcap < o) { vcap = Math.max(o, f.length); gl.bufferData(gl.ARRAY_BUFFER, vcap * 4, gl.DYNAMIC_DRAW); }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, f, 0, o);
    for (const n of ['aP', 'aUV', 'aD', 'aA', 'aC']) gl.enableVertexAttribArray(loc2[n]);
    gl.vertexAttribPointer(loc2.aP, 2, gl.FLOAT, false, 36, 0); gl.vertexAttribPointer(loc2.aUV, 2, gl.FLOAT, false, 36, 8); gl.vertexAttribPointer(loc2.aD, 1, gl.FLOAT, false, 36, 16); gl.vertexAttribPointer(loc2.aA, 1, gl.FLOAT, false, 36, 20); gl.vertexAttribPointer(loc2.aC, 3, gl.FLOAT, false, 36, 24);
    gl.uniform1i(loc2.uNrm, 1); gl.uniform1f(loc2.uShowN, normals && SHOW_N ? 1 : 0);
    if (!R.linS) { R.linS = gl.createSampler(); for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.samplerParameteri(R.linS, k, gl.LINEAR); gl.samplerParameteri(R.linS, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.samplerParameteri(R.linS, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
    const BF = [[gl.ONE, gl.ONE_MINUS_SRC_ALPHA], [gl.ONE, gl.ONE], [gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA], [gl.ONE, gl.ONE_MINUS_SRC_COLOR]];
    let start = 0, calls = 0;
    // Each piece of state set only when it changes from the run before (a few hundred runs a frame in a big battle; most
    // of them differ only in the texture).
    let cS = -1, cB = -2, cO = -1, cN, cHN = -1, cT;
    for (let i = 1; i <= list.length; i++) {   // runs of the same texture and blend in one call
      const a = list[start], r = list[i];
      if (r && r.tex === a.tex && r.b === a.b && r.ntex === a.ntex && (r.s | 0) === (a.s | 0)) continue;
      const s1 = a.s ? 1 : 0, ov = a.b === 0 && normals ? 1 : 0, nt = (normals && a.ntex) || R.none, hn = normals && a.ntex ? 1 : 0;
      if (s1 !== cS) { gl.bindSampler(0, s1 ? R.linS : null); cS = s1; }
      if (a.b >= 0 && a.b !== cB) { gl.blendFunc(BF[a.b][0], BF[a.b][1]); cB = a.b; }   // (-1: the blend set by the caller)
      if (ov !== cO) { gl.uniform1f(loc2.uOver, ov); cO = ov; }
      if (nt !== cN) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, nt); gl.activeTexture(gl.TEXTURE0); cN = nt; }
      if (hn !== cHN) { gl.uniform1f(loc2.uHasN, hn); cHN = hn; }
      if (a.tex !== cT) { gl.bindTexture(gl.TEXTURE_2D, a.tex); cT = a.tex; }
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
uniform float uSunK, uSunSt, uGroundSt, uHD, uHS, uAmb; uniform vec3 uBakeL, uSunL, uSunC; uniform vec2 uRot, uSunG;
uniform vec3 uGrade; uniform vec4 uSun, uShade, uHaze, uTint, uVig;
float sl(float b, float s) { float d = b <= 0.25 ? ((16.0 * b - 12.0) * b + 4.0) * b : sqrt(b); return s <= 0.5 ? b - (1.0 - 2.0 * s) * b * (1.0 - b) : b + (2.0 * s - 1.0) * (d - b); }
float lightAt(vec2 uv) { vec4 h = texture(uSh, uv); return (1.0 - h.r) + (1.0 - h.g) + dot(texture(uGlow, uv).rgb + texture(uWarm, uv).rgb, vec3(0.333)); }
void main() {
  vec2 uv = gl_FragCoord.xy / uSize, P = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  vec3 c = texture(uScene, uv).rgb;
  float nf = 1.0;   // how much this pixel's surface faces the light here (1: flat, as 2D)
  vec4 nn = texture(uNrm, uv);
  if (uSunK > 0.0 && nn.a > 0.5 && nn.r + nn.g > 0.01) {   // (rg 0: a picture with no normal map, left as it is)   // (stage 5) the sun where it is now, not where the pictures and the ground were lit from
    vec2 sq = nn.rg / nn.a * 2.0 - 1.0; float bz = nn.b / nn.a; vec3 sn = vec3(sq, sqrt(max(0.0, 1.0 - dot(sq, sq))));
    if (bz < 0.5 / 255.0) {   // the ground: art.js groundPixels' hill shading, from its slope (the drawn one, back to the world's axes)
      vec2 nw = vec2(sn.x * uRot.x + sn.y * uRot.y, -sn.x * uRot.y + sn.y * uRot.x), gr = -nw / (max(sn.z, 0.2) * uHD);
      float lo = -0.45 - 0.12 * (uHS - 1.0), hi = 0.4 + 0.1 * (uHS - 1.0);
      float l0 = clamp(dot(gr, vec2(0.937, -0.351)) * 4.2 * uHS, lo, hi), l1 = clamp(dot(gr, uSunG) * 4.2 * uHS * uGroundSt, lo, hi);
      c *= (1.0 + l1 * (l1 > 0.0 ? uSunC : vec3(1.0))) / (1.0 + l0);
    } else if (bz > 1.5 / 255.0) {   // a voxel picture: voxel.js renderVox's light (0.5 + 0.68 x the sun on it), new over old
      c *= (uAmb + 0.68 * uSunSt * max(0.0, dot(sn, uSunL)) * uSunC) / (0.5 + 0.68 * max(0.0, dot(sn, uBakeL)));
    }
    c = min(c, 1.0);
  }
  vec2 nxy = nn.a > 0.5 ? nn.rg / nn.a * 2.0 - 1.0 : vec2(0.0);
  if (uNrmK > 0.0 && nn.a > 0.5 && nn.r + nn.g > 0.01 && dot(nxy, nxy) > 0.0004) {   // (flat ground and tops: lit as 2D, no lookups)
    vec3 n = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
    vec2 d = 2.0 / uHalf;
    vec2 g = vec2(lightAt(uv + vec2(d.x, 0.0)) - lightAt(uv - vec2(d.x, 0.0)), lightAt(uv - vec2(0.0, d.y)) - lightAt(uv + vec2(0.0, d.y)));   // (x right, y toward the camera: down the view)
    // Sides facing the light brighter, sides turned away darker, as much as the light has a clear direction here (the
    // slope's steepness) and less on tops (facing up): on average as bright as 2D, so the pictures keep their colours.
    bool ground = nn.b < 0.002 * nn.a;   // (blue: the pictures' height, 2/255 and up, or 1/255 a glowing part; the ground's 0)
    float m = length(g), w = m > 1e-4 ? smoothstep(0.0, 0.05, m) * (ground ? 1.0 : 1.0 - 0.6 * n.z) : 0.0;
    float f = m > 1e-4 ? dot(n.xy, g / m) : 0.0;
    if (ground) f = clamp(f * 3.0, -1.0, 1.0);   // (the hills are gentle: their slopes facing a light catch it as a wall would)
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
    for (const n of ['uScene', 'uNrm', 'uSh', 'uGlow', 'uWarm', 'uPool', 'uCloud', 'uSize', 'uOrg', 'uCam', 'uScr', 'uHalf', 'uLook', 'uSat', 'uGlowK', 'uCloudK', 'uWarmK', 'uNight', 'uT', 'uNrmK', 'uGrade', 'uSun', 'uShade', 'uHaze', 'uTint', 'uVig', 'uSunK', 'uSunSt', 'uGroundSt', 'uHD', 'uHS', 'uBakeL', 'uSunL', 'uRot', 'uSunG', 'uAmb', 'uSunC']) loc3[n] = gl.getUniformLocation(P3, n);
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
  // (stage 5) The sun over the day on the maps with day and night (art.js dayNight's day: DAY_LEN, DAY_START): it comes
  // round from one side in the morning to the other in the evening (up to SUN_SWING radians either side of where the
  // pictures and the hills were lit from, at noon: no change then, and never so far that the cast shadows, which stay
  // where they were baked, look wrong), lower and so raking at dawn and dusk; at night only a moon from the baked side.
  // Maps without day and night keep the baked sun (no change). ?gl=nosun: off.
  const SUN_SWING = 1.2, MOON = 0.45;
  R.sun = !/[?&]gl=nosun\b/.test(q);
  function sunNow(t) {
    const p = (t / DAY_LEN + DAY_START) % 1, h = Math.sin((p - 0.25) * Math.PI * 2);
    const day = Math.max(0, Math.min(1, (h + 0.05) / 0.35)), sm = day * day * (3 - 2 * day);
    const th = Math.max(-SUN_SWING, Math.min(SUN_SWING, (p - 0.5) * 4)) * sm, e = Math.max(0, Math.min(1, h)) * sm + (1 - sm);
    const ct = Math.cos(th), st2 = Math.sin(th), lx = LIGHT[0] * ct - LIGHT[1] * st2, ly = LIGHT[0] * st2 + LIGHT[1] * ct;
    const k = 1 + (1 - e) * 2, ll = Math.hypot(lx * k, ly * k, LIGHT[2]);   // (low sun: more of it from the side)
    const gx = 0.937 * ct - (-0.351) * st2, gy = 0.937 * st2 + (-0.351) * ct;
    const low = (1 - e) * sm;   // (a low sun: less light from the sky round it, and warmer)
    return { l: [lx * k / ll, ly * k / ll, LIGHT[2] / ll], g: [gx, gy], st: sm + (1 - sm) * MOON, gst: (sm * (1 + (1 - e) * 0.8)) + (1 - sm) * MOON, th, e,
      amb: 0.5 - 0.1 * low, col: [1 + 0.1 * low, 1 - 0.03 * low, 1 - 0.16 * low] };
  }
  R.sunNow = sunNow;
  function lightPass(L) {
    if (!P3) init3();
    const W = FW, H = FH, hw = Math.max(1, Math.round(W / 2)), hh = Math.max(1, Math.round(H / 2)), B = lightBufs(hw, hh);
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
    litFb(W, H); gl.viewport(0, 0, W, H); gl.disable(gl.BLEND);
    gl.useProgram(P3);
    const bind = (u, t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(loc3[u], i); };
    if (look && !cloudT && typeof cloudShadowPic === 'function') cloudT = texFrom(cloudShadowPic(), true);
    bind('uScene', SC.c, 0); bind('uNrm', SC.n, 1); bind('uSh', B.b[0].t, 2); bind('uGlow', B.b[1].t, 3); bind('uWarm', B.b[2].t, 4); bind('uPool', B.b[3].t, 5); bind('uCloud', cloudT || R.none, 6);
    gl.uniform2f(loc3.uSize, W, H); gl.uniform2f(loc3.uHalf, hw, hh);
    gl.uniform2f(loc3.uOrg, L ? L.vx : 0, L ? L.vy : 0); gl.uniform2f(loc3.uCam, L ? L.cam[0] : 0, L ? L.cam[1] : 0); gl.uniform2f(loc3.uScr, L ? L.sw : W, L ? L.sh : H);
    gl.uniform1f(loc3.uLook, look ? 1 : 0); gl.uniform1f(loc3.uT, G ? G.t : 0); gl.uniform1f(loc3.uNrmK, L ? R.nrmK : 0);
    const SUN = L && dnMap && R.sun ? sunNow(G.t) : null;
    gl.uniform1f(loc3.uSunK, SUN ? 1 : 0);
    if (SUN) {
      gl.uniform1f(loc3.uSunSt, SUN.st); gl.uniform1f(loc3.uGroundSt, SUN.gst); gl.uniform3f(loc3.uBakeL, ...LIGHT); gl.uniform3f(loc3.uSunL, ...SUN.l);
      gl.uniform2f(loc3.uSunG, ...SUN.g); gl.uniform2f(loc3.uRot, VIEW.c, VIEW.s); gl.uniform1f(loc3.uAmb, SUN.amb); gl.uniform3f(loc3.uSunC, ...SUN.col);
      gl.uniform1f(loc3.uHD, typeof HILL_DRAW !== 'undefined' ? HILL_DRAW : 1); gl.uniform1f(loc3.uHS, typeof HILL_SHADE !== 'undefined' ? HILL_SHADE : 1);
    }
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
  // The lit frame (the view's size), then put on the screen by present.
  let LIT = null, P4 = null, loc4 = null;
  function litFb(w, h) {
    if (!LIT || LIT.w !== w || LIT.h !== h) {
      if (LIT) { gl.deleteTexture(LIT.t); gl.deleteFramebuffer(LIT.f); }
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
      for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      LIT = { w, h, t, f };
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, LIT.f);
  }
  const VS4 = `#version 300 es
in vec2 aQ; uniform vec4 uRect; uniform vec2 uScreen; out vec2 vUV;
void main() { vec2 p = uRect.xy + aQ * uRect.zw; vUV = vec2(aQ.x, 1.0 - aQ.y); gl_Position = vec4(p.x / uScreen.x * 2.0 - 1.0, 1.0 - p.y / uScreen.y * 2.0, 0.0, 1.0); }`;
  const FS4 = `#version 300 es
precision mediump float; in vec2 vUV; out vec4 o; uniform sampler2D uLit;
void main() { o = texture(uLit, vUV); }`;
  // The lit frame onto the screen (ui.js, where the 2D way puts the view on the screen): its rectangle on the canvas (x,
  // y, w, h in canvas px, the camera's offset and shake included), smoothed when zoomed out, as the 2D way. The page's
  // canvas (#game) is cleared over it and keeps the HUD bits.
  R.present = (game, x, y, w, h, smooth) => {
    if (failed || !LIT) return false;
    try {
      if (!P4) {
        const mk = (t, src) => { const sh = gl.createShader(t); gl.shaderSource(sh, src); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
        P4 = gl.createProgram(); gl.attachShader(P4, mk(gl.VERTEX_SHADER, VS4)); gl.attachShader(P4, mk(gl.FRAGMENT_SHADER, FS4)); gl.linkProgram(P4);
        if (!gl.getProgramParameter(P4, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(P4));
        loc4 = { aQ: gl.getAttribLocation(P4, 'aQ'), uRect: gl.getUniformLocation(P4, 'uRect'), uScreen: gl.getUniformLocation(P4, 'uScreen'), uLit: gl.getUniformLocation(P4, 'uLit') };
        R.unit = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, R.unit); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
      }
      if (cv.width !== game.width || cv.height !== game.height) { cv.width = game.width; cv.height = game.height; }
      if (cv.style.width !== game.style.width || cv.style.height !== game.style.height) { cv.style.width = game.style.width; cv.style.height = game.style.height; }
      if (cv.style.display) cv.style.display = '';
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cv.width, cv.height);
      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(P4);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, LIT.t); gl.uniform1i(loc4.uLit, 0);
      if (!R.linS) { R.linS = gl.createSampler(); for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.samplerParameteri(R.linS, k, gl.LINEAR); gl.samplerParameteri(R.linS, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.samplerParameteri(R.linS, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
      gl.bindSampler(0, smooth ? R.linS : null);
      gl.uniform4f(loc4.uRect, x, y, w, h); gl.uniform2f(loc4.uScreen, cv.width, cv.height);
      gl.bindBuffer(gl.ARRAY_BUFFER, R.unit); gl.enableVertexAttribArray(loc4.aQ); gl.vertexAttribPointer(loc4.aQ, 2, gl.FLOAT, false, 8, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6); R.calls++;
      gl.bindSampler(0, null); sync('wPres');
      if (!live) note('drawing ' + cv.width + 'x' + cv.height);
      R.markLive();
      return true;
    } catch (err) { failed = true; console.warn('WebGL present off:', err); note('present off: ' + (err && err.message)); return false; }
  };
  // The probe (ui.js sets R.probe while the Deploying card is up and for a few seconds after): wait for the GPU after
  // each stage (a 1-pixel read makes the page wait until everything handed over so far is done) and add the ms waited to
  // R.ev (wPre: work from before this frame's drawing, wFlush: the per-frame atlas and picture uploads, wScene: the
  // ground and everything on it, wLight: the light pass, wOver: weather and HUD over the light, wPres: onto the screen).
  // A freeze that shows in none of them happened after the frame was handed over (putting it on the screen).
  const px1 = new Uint8Array(4);
  function sync(k) {
    if (!R.probe || !R.ev) return;
    const a = performance.now();
    try { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1); } catch (_) {}
    R.ev[k || 'wPre'] = (R.ev[k || 'wPre'] || 0) + performance.now() - a;
  }
  R.hide = () => { if (cv && !cv.style.display) cv.style.display = 'none'; };   // (a frame drawn the 2D way: the page's canvas covers it all)
  R.listEnd = (v, L) => {
    if (!rec) return;
    try {
      R.calls = 0; R.quads = 0; R.bitRows = 0;
      sync(null);
      const t0 = performance.now();
      flush(); sync('wFlush');
      sceneFb(FW, FH); drawRec(true); sync('wScene');
      const t1 = performance.now();
      lightPass(L || null); sync('wLight');
      const t2 = performance.now();
      R.overQuads = 0;
      if (L && L.over) {   // what goes over the light, recorded the same way, drawn into the lit frame without depth
        const g = R.listBegin(v, true);
        if (g) { L.over(g); flush(); const n = R.quads; drawRec(false); R.overQuads = R.quads - n; }
        sync('wOver');
      }
      R.lit = true;   // (ui.js clears the view for the HUD bits and calls present)
      R.ms = { rec: t1 - t0, light: t2 - t1, over: performance.now() - t2 };   // (CPU time of each part; the GPU's runs after)
    } catch (err) { failed = true; console.warn('WebGL list off:', err); note('list off: ' + (err && err.message)); }
    rec = null;
  };
  R.off = () => { failed = true; };
  R.ready = () => !failed && !R.paused && !!G && !!G.ground && !!G.ground.gl;   // (this frame will be drawn by WebGL, as far as can be told before)
  return R;
})();
