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
const STORM_DARK = 0.55, STORM_FLASH = 0.5, STORM_BOLT_GAP = [3.5, 9];
const lookStorm = (() => {
  const S = { clock: 0, last: 0, seed: null, start: 0, len: 0, rnd: null, nextBolt: 0, bolt: null, flashAt: -9 };
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
  // A forked bolt from the top of the screen down into the scene: a jagged trunk and two or three branches.
  function makeBolt(W, H) {
    const r = Math.random, x0 = W * (0.15 + 0.7 * r()), y1 = H * (0.3 + 0.35 * r()), x1 = x0 + (r() - 0.5) * W * 0.25;
    const path = (ax, ay, bx, by, n, jag) => {
      const p = [[ax, ay]];
      for (let i = 1; i < n; i++) { const t = i / n; p.push([ax + (bx - ax) * t + (r() - 0.5) * jag, ay + (by - ay) * t + (r() - 0.5) * jag * 0.3]); }
      p.push([bx, by]); return p;
    };
    const trunk = path(x0, -10, x1, y1, 14, W * 0.035), lines = [{ p: trunk, w: 1 }];
    for (let b = 1 + Math.floor(r() * 3); b > 0; b--) {
      const at = trunk[3 + Math.floor(r() * (trunk.length - 6))], len = H * (0.08 + 0.14 * r()), a = Math.PI / 2 + (r() - 0.5) * 1.6;
      lines.push({ p: path(at[0], at[1], at[0] + Math.cos(a) * len, at[1] + Math.sin(a) * len, 6, W * 0.02), w: 0.45 });
    }
    return { lines, born: S.clock, x: x1 / W };
  }
  // Over the rain: the lightning. A strike now and then at the storm's height (above 0.6), the whole scene lit for a moment.
  function flash(g, k, paused) {
    if (!LOOK.storms || !G || !(S.s > 0.01)) return;
    const W = g.canvas.width, H = g.canvas.height;
    if ((!paused || S.manual) && !snowy() && S.s > 0.6 && S.clock >= S.nextBolt) {
      if (S.nextBolt > 0) {
        S.bolt = makeBolt(W, H);
        const far = Math.random();
        if (typeof Sound !== 'undefined') setTimeout(() => Sound.play('thunder', 0.45 + 0.5 * (1 - far) * S.s, S.bolt ? S.bolt.x * 1.2 - 0.6 : 0, 0), 300 + far * 2200);
      }
      S.nextBolt = S.clock + span(STORM_BOLT_GAP) / Math.max(0.6, S.s);
    }
    const B = S.bolt;
    if (!B) return;
    const age = S.clock - B.born;
    if (age > 0.7 || age < 0) { S.bolt = null; return; }
    const f = age < 0.07 ? 1 : age < 0.13 ? 0.3 : age < 0.2 ? 0.85 : Math.max(0, 0.85 * (1 - (age - 0.2) / 0.5));
    g.save();
    if (!calmFlash) {   // (art.js: no full-screen flashes for players who asked for reduced motion)
      g.globalCompositeOperation = 'screen';
      g.fillStyle = `rgba(200,212,255,${(STORM_FLASH * f).toFixed(3)})`; g.fillRect(0, 0, W, H);
    }
    if (age < 0.32) {
      g.globalCompositeOperation = 'lighter'; g.lineJoin = 'round'; g.lineCap = 'round';
      const bf = age < 0.07 ? 1 : age < 0.13 ? 0.35 : age < 0.2 ? 0.9 : 0.5;
      for (const [wd, col] of [[10, `rgba(120,140,255,${(0.18 * bf).toFixed(3)})`], [4.5, `rgba(170,190,255,${(0.45 * bf).toFixed(3)})`], [1.6, `rgba(250,250,255,${bf.toFixed(3)})`]]) {
        g.strokeStyle = col;
        for (const L of B.lines) {
          g.lineWidth = Math.max(1, wd * L.w * Math.max(1, k * 0.6));
          g.beginPath(); L.p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        }
      }
    }
    g.restore();
  }
  // For recorders: a storm starting now (at its height after `ramp` seconds of build-up already passed).
  function force(ramp) { if (S.seed !== G.seed) reset(); S.start = S.clock - (ramp || 0); S.len = 95; S.nextBolt = S.clock + 1; }
  function off() { if (S.seed !== G.seed) reset(); S.start = S.clock + 1e6; }
  // For recorders: the storm's clock set by hand (u seconds into a storm), and a strike on the next frame.
  function at(u) { if (S.seed !== G.seed) reset(); S.manual = true; S.start = 0; S.len = 95; S.clock = u; }
  function strike() { S.nextBolt = Math.min(S.nextBolt, S.clock); if (!S.nextBolt) S.nextBolt = 1e-6; }
  return { weather, dark, flash, force, off, at, strike, level: () => S.s || 0 };
})();
