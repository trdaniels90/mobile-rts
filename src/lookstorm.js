'use strict';
// Storms (look test, proposal item 7; LOOK.storms, ?lookoff=storms hides the look, not the bolts). When a storm rolls in
// (world.js stormLevel: planned from the battle's seed on the battle's clock, so every phone has the same storm) the scene
// darkens toward a slate grey and the rain (art.js drawWeather, given a stand-in weather) grows heavy; at its height the sky
// flashes now and then (sheet lightning, distant thunder: this phone's own, looks only), and the rare bolts that land
// (world.js stormStrikes -> boltStrike, drawn as the game's 'bolt' effect) light the whole scene with close thunder. On snow
// maps a blizzard: heavy snow, a pale darker haze, no lightning. A battle's own rain and its lightning go on underneath.
(() => {
  const q = typeof location !== 'undefined' ? location.search : '';
  const on = !/[?&]look=off\b/.test(q), off = (q.match(/[?&]lookoff=([a-z,]+)/) || [, ''])[1].split(',');
  LOOK.storms = on && !off.includes('storms');
})();
const STORM_DARK = 0.55, STORM_FLASH = 0.5, STORM_SKY_GAP = [4, 10];
const lookStorm = (() => {
  const S = { clock: 0, last: 0, seed: null, nextSky: 0, flashAt: -9, flashK: 1, seen: new WeakSet() };
  function reset() { S.seed = G.seed; S.clock = 0; S.rnd = Math.random; S.seen = new WeakSet(); }
  // How strong the storm is now, 0 to 1: the battle's (world.js), or the recorder's by hand.
  function level() {
    if (!S.manual) return stormLevel(G.t);
    const sm = (v) => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
    return S.clock < 0 || S.clock > 95 ? 0 : Math.min(sm(S.clock / 16), sm((95 - S.clock) / 20));
  }
  function tick(paused) {
    const now = performance.now(), dt = Math.min(0.1, (now - S.last) / 1000 || 0);
    S.last = now;
    if (S.seed !== G.seed) reset();
    if (!paused && !S.manual) S.clock += dt;   // (this phone's clock: only for the sheet lightning's timing)
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
  // Over the rain: the lightning, at the storm's height (above 0.6). Sheet lightning every STORM_SKY_GAP seconds (the scene
  // flashes, distant thunder), and a full flash with close thunder for every bolt that lands on the screen (the game's 'bolt').
  function flash(g, k, paused, cx, cy) {
    if (!LOOK.storms || !G || !(S.s > 0.01)) return;
    const W = g.canvas.width, H = g.canvas.height, live = (!paused || S.manual) && !snowy() && S.s > 0.6;
    const go = (near, pan) => {
      S.flashAt = S.clock; S.flashK = near ? 1 : 0.55 + 0.35 * Math.random();
      const far = near ? 0.1 * Math.random() : 0.3 + 0.7 * Math.random();
      if (typeof Sound !== 'undefined') setTimeout(() => Sound.play('thunder', (near ? 0.85 : 0.35 + 0.4 * (1 - far)) * Math.max(0.6, S.s), pan, 0), (near ? 120 : 400) + far * 2200);
    };
    if (live && S.clock >= S.nextSky) { if (S.nextSky > 0) go(false, Math.random() - 0.5); S.nextSky = S.clock + (STORM_SKY_GAP[0] + Math.random() * (STORM_SKY_GAP[1] - STORM_SKY_GAP[0])) / Math.max(0.6, S.s); }
    if (S.want !== undefined) { go(false, 0); S.want = undefined; }
    for (const fx of G.effects) {
      if (fx.type !== 'bolt' || S.seen.has(fx)) continue;
      S.seen.add(fx);
      const [X] = toView(fx.x, fx.y), sx = (X - cx) * k;
      if (cx !== undefined && sx > -W * 0.2 && sx < W * 1.2) go(true, Math.max(-0.8, Math.min(0.8, sx / W * 1.6 - 0.8)));
    }
    const age = S.clock - S.flashAt;
    if (!(age >= 0 && age < 0.7)) return;
    const f = (age < 0.07 ? 1 : age < 0.13 ? 0.3 : age < 0.2 ? 0.85 : Math.max(0, 0.85 * (1 - (age - 0.2) / 0.5))) * S.flashK;
    g.save();
    if (!calmFlash) {   // (art.js: no full-screen flashes for players who asked for reduced motion)
      g.globalCompositeOperation = 'screen';
      g.fillStyle = `rgba(200,212,255,${(STORM_FLASH * f).toFixed(3)})`; g.fillRect(0, 0, W, H);
    }
    g.restore();
  }
  // For recorders: the storm's clock set by hand (u seconds into a 95 s storm), and a sky flash on the next frame.
  function at(u) { if (S.seed !== G.seed) reset(); S.manual = true; S.clock = u; }
  function strike() { S.want = true; }
  return { weather, dark, flash, at, strike, level: () => S.s || 0 };
})();
