'use strict';
// Storms (look test, proposal item 7; LOOK.storms, ?lookoff=storms). Drawing only, both modes: nothing here is in G or
// changes the battle. Now and then a storm rolls in: over STORM_IN seconds the scene darkens toward a slate grey and the
// rain (art.js drawWeather, given a stand-in weather) grows heavy; at its height lightning flashes light the whole scene
// for a moment, a forked bolt cracks down from the top of the screen and thunder rolls in after it (the game's own
// 'thunder' sound); then it clears over STORM_OUT seconds. On snow maps it is a blizzard instead: heavy snow and a pale,
// darker haze, no lightning. The timing runs on this phone's own clock (real seconds while the battle is not paused),
// rolled from the battle's seed, so it never touches G.t or anything online play shares. A battle's real rain and its
// lightning (whose strikes land in the battle, world.js) go on as before underneath.
(() => {
  const q = typeof location !== 'undefined' ? location.search : '';
  const on = !/[?&]look=off\b/.test(q), off = (q.match(/[?&]lookoff=([a-z,]+)/) || [, ''])[1].split(',');
  LOOK.storms = on && !off.includes('storms');
})();
const STORM_FIRST = [70, 160], STORM_GAP = [160, 320], STORM_LEN = [70, 110], STORM_IN = 16, STORM_OUT = 20;
const STORM_DARK = 0.55, STORM_FLASH = 0.5, STORM_SKY_GAP = [4, 10], STORM_BOLT_GAP = [16, 32];
const lookStorm = (() => {
  const S = { clock: 0, last: 0, seed: null, start: 0, len: 0, rnd: null, nextSky: 0, nextBolt: 0, bolt: null, flashAt: -9, flashK: 1 };
  const span = (a) => a[0] + S.rnd() * (a[1] - a[0]);
  function reset() {
    S.seed = G.seed; S.clock = 0;
    const h = Math.imul((G.seed | 0) ^ 0x2f6b1d3a, 0x9e3779b1);
    S.rnd = rng(h ^ (h >>> 15)); S.rnd();
    S.start = span(STORM_FIRST); S.len = span(STORM_LEN);
  }
  // How strong the storm is now: 0 (none) to 1.
  function level() {
    const u = S.clock - S.start;
    if (u < 0 || u > S.len) return 0;
    const sm = (v) => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
    return Math.min(sm(u / STORM_IN), sm((S.len - u) / STORM_OUT));
  }
  function tick(paused) {
    const now = performance.now(), dt = Math.min(0.1, (now - S.last) / 1000 || 0);
    S.last = now;
    if (S.seed !== G.seed) reset();
    if (!paused && !S.manual) S.clock += dt;
    if (S.clock - S.start > S.len) { S.start = S.clock + span(STORM_GAP); S.len = span(STORM_LEN); }
    return dt;
  }
  const snowy = () => mapTheme(G.mapId) === 'snow' || (G.weather && G.weather.kind === 'snow');
  // The weather drawWeather should draw this frame (the battle's own, or the storm's stand-in when that is heavier).
  function weather(paused) {
    if (!LOOK.storms || !G) return G && G.weather;
    tick(paused);
    const s = level();
    S.s = s;
    if (s < 0.01) return G.weather;
    const real = G.weather, kind = snowy() ? 'snow' : 'rain';
    const L0 = real && real.kind === kind ? weatherLevel(real, G.t) : 0;
    return { kind, seed: real ? real.seed : 7, storm: true, lvl: Math.max(L0, 0.12 + 0.88 * s), real: real && real.kind === 'rain' ? real : null };
  }
  // Under the rain: the sky darkens (a slate multiply, a little heavier toward the top of the screen, where the front is).
  function dark(g) {
    if (!LOOK.storms || !G || !(S.s > 0.01)) return;
    const s = S.s, W = g.canvas.width, H = g.canvas.height, sn = snowy();
    g.save();
    g.globalCompositeOperation = 'multiply';
    const c = sn ? [196, 204, 218] : [118, 128, 148], m = (a, k) => Math.round(255 + (a - 255) * k);
    const k1 = STORM_DARK * s, k2 = Math.min(1, k1 * 1.35);
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, `rgb(${m(c[0], k2)},${m(c[1], k2)},${m(c[2], k2)})`);
    gr.addColorStop(1, `rgb(${m(c[0], k1)},${m(c[1], k1)},${m(c[2], k1)})`);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = sn ? `rgba(220,226,236,${(0.16 * s).toFixed(3)})` : `rgba(20,26,36,${(0.1 * s).toFixed(3)})`;   // the murk
    g.fillRect(0, 0, W, H);
    g.restore();
  }
  // A forked bolt from the top of the screen down to the ground at screen point (x1, y1): a jagged trunk, two or three branches.
  function makeBolt(W, H, x1, y1) {
    const r = Math.random, x0 = x1 + (r() - 0.5) * W * 0.12;
    const path = (ax, ay, bx, by, n, jag) => {
      const p = [[ax, ay]];
      for (let i = 1; i < n; i++) { const t = i / n; p.push([ax + (bx - ax) * t + (r() - 0.5) * jag, ay + (by - ay) * t + (r() - 0.5) * jag * 0.3]); }
      p.push([bx, by]); return p;
    };
    const trunk = path(x0, -10, x1, y1, 16, W * 0.03), lines = [{ p: trunk, w: 1 }];
    for (let b = 1 + Math.floor(r() * 3); b > 0; b--) {
      const at = trunk[3 + Math.floor(r() * (trunk.length - 7))], len = H * (0.05 + 0.1 * r()), a = Math.PI / 2 + (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.6);
      lines.push({ p: path(at[0], at[1], at[0] + Math.cos(a) * len, at[1] + Math.sin(a) * len, 6, W * 0.015), w: 0.45 });
    }
    return { lines, x: x1 / W };
  }
  // A spot of dry land on the screen for a bolt to come down on (world point; null if none found).
  function groundSpot(W, H, k, cx, cy) {
    for (let i = 0; i < 30; i++) {
      const [x, y] = fromView(cx + (0.12 + 0.76 * Math.random()) * W / k, cy + (0.3 + 0.62 * Math.random()) * H / k);
      const c = typeof cellOfPos === 'function' ? cellOfPos(x, y) : false;
      if (c !== false && G.terr[c] !== 4) return [x, y];
    }
    return null;
  }
  // Over the rain: the lightning, at the storm's height (above 0.6). Mostly sheet lightning (the sky flashes, every
  // STORM_SKY_GAP seconds); rarer, every STORM_BOLT_GAP, a bolt comes down on a spot of ground on the screen with a flash
  // where it lands. Looks only: it hurts nothing and burns nothing (the battle's own rain lightning still does).
  function flash(g, k, paused, cx, cy) {
    if (!LOOK.storms || !G || !(S.s > 0.01)) return;
    const W = g.canvas.width, H = g.canvas.height, live = (!paused || S.manual) && !snowy() && S.s > 0.6;
    const go = (ground) => {
      const spot = ground && cx !== undefined ? groundSpot(W, H, k, cx, cy) : null;
      S.flashAt = S.clock; S.flashK = spot ? 1 : 0.55 + 0.35 * Math.random();
      S.bolt = null;
      if (spot) { S.bolt = { w: spot, born: S.clock, seed: Math.random() }; }
      const far = spot ? 0.1 * Math.random() : 0.3 + 0.7 * Math.random(), pan = spot ? 0 : (Math.random() - 0.5);
      if (typeof Sound !== 'undefined') setTimeout(() => Sound.play('thunder', (spot ? 0.85 : 0.35 + 0.4 * (1 - far)) * Math.max(0.6, S.s), pan, 0), (spot ? 120 : 400) + far * 2200);
    };
    if (live && S.clock >= S.nextSky) { if (S.nextSky > 0) go(false); S.nextSky = S.clock + span(STORM_SKY_GAP) / Math.max(0.6, S.s); }
    if (live && S.clock >= S.nextBolt) { if (S.nextBolt > 0) go(true); S.nextBolt = S.clock + span(STORM_BOLT_GAP) / Math.max(0.6, S.s); }
    if (S.want !== undefined) { go(S.want); S.want = undefined; }
    const age = S.clock - S.flashAt;
    if (!(age >= 0 && age < 0.7)) return;
    const f = (age < 0.07 ? 1 : age < 0.13 ? 0.3 : age < 0.2 ? 0.85 : Math.max(0, 0.85 * (1 - (age - 0.2) / 0.5))) * S.flashK;
    g.save();
    if (!calmFlash) {   // (art.js: no full-screen flashes for players who asked for reduced motion)
      g.globalCompositeOperation = 'screen';
      g.fillStyle = `rgba(200,212,255,${(STORM_FLASH * f).toFixed(3)})`; g.fillRect(0, 0, W, H);
    }
    const B = S.bolt;
    if (B && age < 0.45) {
      const [X, Y] = toView(B.w[0], B.w[1]), lift = typeof gLift === 'function' && LOOK.hills ? gLift(B.w[0], B.w[1]) : 0;
      const sx = (X - cx) * k, sy = (Y - lift - cy) * k;
      if (!B.lines || B.k !== k || B.sx !== sx || B.sy !== sy) Object.assign(B, makeBolt(W, H, sx, sy), { k, sx, sy });
      g.globalCompositeOperation = 'lighter'; g.lineJoin = 'round'; g.lineCap = 'round';
      const bf = age < 0.07 ? 1 : age < 0.13 ? 0.35 : age < 0.2 ? 0.9 : Math.max(0, 0.9 * (1 - (age - 0.2) / 0.25));
      for (const [wd, col] of [[10, `rgba(120,140,255,${(0.18 * bf).toFixed(3)})`], [4.5, `rgba(170,190,255,${(0.45 * bf).toFixed(3)})`], [1.6, `rgba(250,250,255,${bf.toFixed(3)})`]]) {
        g.strokeStyle = col;
        for (const L of B.lines) {
          g.lineWidth = Math.max(1, wd * L.w * Math.max(1, k * 0.6));
          g.beginPath(); L.p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        }
      }
      const gl = g.createRadialGradient(sx, sy, 0, sx, sy, 34 * k);   // where it lands
      gl.addColorStop(0, `rgba(255,250,225,${(0.9 * bf).toFixed(3)})`); gl.addColorStop(0.3, `rgba(190,205,255,${(0.35 * bf).toFixed(3)})`); gl.addColorStop(1, 'rgba(150,170,255,0)');
      g.fillStyle = gl; g.beginPath(); g.ellipse(sx, sy, 34 * k, 34 * k * 0.6, 0, 0, 7); g.fill();
    }
    g.restore();
  }
  // For recorders: a storm starting now (at its height after `ramp` seconds of build-up already passed).
  function force(ramp) { if (S.seed !== G.seed) reset(); S.start = S.clock - (ramp || 0); S.len = 95; S.nextSky = S.clock + 1; }
  function off() { if (S.seed !== G.seed) reset(); S.start = S.clock + 1e6; }
  // For recorders: the storm's clock set by hand (u seconds into a storm), and lightning on the next frame (ground: a bolt).
  function at(u) { if (S.seed !== G.seed) reset(); S.manual = true; S.start = 0; S.len = 95; S.clock = u; }
  function strike(ground) { S.want = !!ground; }
  return { weather, dark, flash, force, off, at, strike, level: () => S.s || 0 };
})();
