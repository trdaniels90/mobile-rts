'use strict';
// Sound effects, spoken announcements and an original industrial-metal soundtrack.
// Battle effects are recordings from src/sfx.js, the music is sequenced live from recorded
// instruments in src/music.js (both with synthesised fallbacks), and voice lines come from
// src/voices.js.

const Sound = (() => {
  const settings = { music: true, sfx: true, voice: true };
  try { Object.assign(settings, JSON.parse(localStorage.getItem('ps-audio') || '{}')); } catch (_) {}
  const save = () => { try { localStorage.setItem('ps-audio', JSON.stringify(settings)); } catch (_) {} };

  let ctx = null, master, sfxBus, musicBus, verb, verbIn, delayIn, noise, shaperHeavy, shaperSoft;
  const lastPlayed = new Map();
  let voices = 0;

  // Half a second of silence. Keeping a media element playing it puts iOS into "playback"
  // mode, so older iPhones do not mute Web Audio when the ring/silent switch is on silent.
  const SILENT = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAACQAAA2AAVVVVVVVVVVVVVVVqampqampqampqaoCAgICAgICAgICAlZWVlZWVlZWVlZWqqqqqqqqqqqqqqsDAwMDAwMDAwMDA1dXV1dXV1dXV1dXq6urq6urq6urq6v//////////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQCYAAAAAAAAANgUN8OnAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+MYxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVV/+MYxDsAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVV/+MYxHYAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVV/+MYxLEAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVV/+MYxMQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVV/+MYxMQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxMQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxMQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxMQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
  let keepAlive = null;

  // Called from every tap, click and key press. iOS only lets audio start inside the end of a
  // touch (or a click), and can suspend it again after calls, app switches or screen locks.
  function unlock() {
    init();
    if (!ctx) return;
    if (ctx.state !== 'running') { try { ctx.resume().catch(() => {}); } catch (_) {} }
    try {
      const b = ctx.createBufferSource();
      b.buffer = ctx.createBuffer(1, 1, 22050);
      b.connect(ctx.destination); b.start(0);
    } catch (_) {}
    if (!keepAlive && typeof Audio !== 'undefined') {
      try {
        keepAlive = new Audio(SILENT);
        keepAlive.loop = true;
        keepAlive.setAttribute('playsinline', '');
        keepAlive.setAttribute('x-webkit-airplay', 'deny');
        const p = keepAlive.play();
        if (p && p.catch) p.catch(() => { keepAlive = null; });
      } catch (_) { keepAlive = null; }
    } else if (keepAlive && keepAlive.paused) keepAlive.play().catch(() => {});
  }
  function status() {
    if (!(window.AudioContext || window.webkitAudioContext)) return 'not supported by this browser';
    if (!ctx) return 'waiting for a tap';
    return ctx.state === 'running' ? 'on' : ctx.state + ' (tap the screen)';
  }

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // Let iOS play game audio even with the ring/silent switch on silent.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (_) {}
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    comp.connect(ctx.destination);
    master = gain(0.9, comp);
    sfxBus = gain(settings.sfx ? 0.85 : 0, master);
    musicBus = gain(settings.music ? 0.42 : 0, master);
    // Room reverb from a generated impulse response.
    verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb.buffer = ir;
    verbIn = gain(1, verb);
    verb.connect(gain(0.32, master));
    // Tempo-free echo for lead lines.
    const dl = ctx.createDelay(1); dl.delayTime.value = 0.33;
    const fb = gain(0.32, dl); dl.connect(fb);
    delayIn = gain(1, dl);
    dl.connect(gain(0.5, musicBus));
    // White noise source buffer.
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    shaperHeavy = curve(140); shaperSoft = curve(12);
    Music.start();
    preload();
  }
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) { ctx.suspend(); if (keepAlive) keepAlive.pause(); }
    else { ctx.resume().catch(() => {}); if (keepAlive) keepAlive.play().catch(() => {}); }
  });

  function gain(v, dest) { const g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
  function curve(k) {
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
    return c;
  }
  function shaper(c, dest) { const s = ctx.createWaveShaper(); s.curve = c; s.oversample = '2x'; if (dest) s.connect(dest); return s; }
  // Envelope helper: quick attack to `peak`, exponential decay to silence over `dec` seconds.
  function envelope(g, t, peak, att, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + att + dec);
  }
  function noiseHit(t, dur, filterType, f0, f1, q, peak, dest, att) {
    const src = ctx.createBufferSource(); src.buffer = noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); envelope(g, t, peak, att || 0.002, dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
    return g;
  }
  function tone(t, type, f0, f1, dur, peak, dest, att) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); envelope(g, t, peak, att || 0.003, dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  // ---------------------------------------------------------------------------
  // Battlefield effects, voiced after the weapon/sound pairings of the 1996 classic
  // (rifle crack, twin tank shells, crunchy small and large "kaboom" impacts, hissing
  // missiles, double-pom AA, Tesla charge and zap). Every effect runs through a lo-fi
  // stage that mimics the gritty compressed 22 kHz samples of the era.
  // `vol` and `pan` come from the camera position.
  // ---------------------------------------------------------------------------
  let crushCurve = null;
  function lofiCurve() {
    // Soft saturation, then quantised to 7 bits: grit on loud sounds, like 90s samples.
    const n = 4096, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = Math.round(Math.tanh(x * 1.6) * 64) / 64; }
    return c;
  }
  // Random clicks and pops: the crackle of debris and burning in an explosion tail.
  function crackle(t, dur, count, peak, dest) {
    const src = ctx.createBufferSource(); src.buffer = noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(hp); hp.connect(g); g.connect(dest);
    const times = [];
    for (let i = 0; i < count; i++) times.push(Math.random() * dur);
    times.sort((a, b) => a - b);
    for (const dt of times) {
      const k = 1 - dt / dur;
      g.gain.setValueAtTime(peak * k * (0.3 + Math.random() * 0.7), t + dt);
      g.gain.setValueAtTime(0, t + dt + 0.003 + Math.random() * 0.006);
    }
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  // A crunchy explosion: sharp transient, distorted low-mid body, sub thump and crackle.
  function kaboom(t, o, s, size) {
    const dur = 0.35 + size * 0.75;
    const d = shaper(shaperSoft, o);
    noiseHit(t, 0.03, 'highpass', 1800, 1800, 0.7, 0.9, o);
    noiseHit(t, dur, 'lowpass', 2600 + size * 600, 220 - size * 80, 0.9, 1.0, d, 0.004);
    noiseHit(t, dur * 0.6, 'bandpass', 700, 260, 1.2, 0.7, d, 0.004);
    tone(t, 'sine', 110 - size * 30, 32, dur * 0.8, 0.95, d);
    crackle(t + 0.04, dur * 0.9, 12 + size * 40, 0.55, o);
    s.send(0.25 + size * 0.35);
  }
  const FX = {
    // gun11: a short, sharp rifle crack with a little metallic ring.
    rifle(t, o) {
      noiseHit(t, 0.05, 'bandpass', 2600, 1600, 0.8, 0.95, o);
      noiseHit(t, 0.08, 'lowpass', 1000, 280, 0.8, 0.65, o);
      tone(t, 'square', 2300, 1800, 0.025, 0.05, o);
    },
    // pillbox1 / gun13: heavier, lower machine-gun report.
    mg(t, o) {
      noiseHit(t, 0.06, 'bandpass', 1700, 1100, 0.8, 0.95, o);
      noiseHit(t, 0.08, 'lowpass', 750, 220, 0.8, 0.75, o);
      tone(t, 'sine', 160, 70, 0.06, 0.35, o);
    },
    throw(t, o) { noiseHit(t, 0.16, 'bandpass', 700, 2000, 1.4, 0.35, o, 0.05); tone(t + 0.02, 'triangle', 900, 1300, 0.04, 0.05, o); },
    // cannon1: crack, punchy mid boom, quick sub drop and a short ring of the barrel.
    cannon(t, o, s) {
      const d = shaper(shaperSoft, o);
      noiseHit(t, 0.025, 'highpass', 2800, 2800, 0.7, 1.0, o);
      noiseHit(t, 0.26, 'bandpass', 1100, 320, 0.7, 1.0, d, 0.003);
      tone(t, 'sine', 170, 55, 0.28, 0.9, d);
      const ring = ctx.createBiquadFilter(); ring.type = 'bandpass'; ring.frequency.value = 1250; ring.Q.value = 12; ring.connect(o);
      tone(t, 'sawtooth', 1250, 1190, 0.16, 0.08, ring);
      s.send(0.3);
    },
    // Heavy and Mammoth tanks fire both barrels together, a split hair apart.
    cannonHeavy(t, o, s) { FX.cannon(t, o, s); FX.cannon(t + 0.028, o, s); },
    // turret1: the base defence gun, bigger and deeper than a tank's.
    turretGun(t, o, s) {
      const d = shaper(shaperSoft, o);
      noiseHit(t, 0.03, 'highpass', 2200, 2200, 0.7, 1.0, o);
      noiseHit(t, 0.4, 'lowpass', 1800, 200, 0.8, 1.0, d, 0.003);
      tone(t, 'sine', 140, 40, 0.38, 1.0, d);
      s.send(0.4);
    },
    // missile6 / missile7: ignition pop, then a hissing rush that falls away.
    rocket(t, o) {
      noiseHit(t, 0.05, 'lowpass', 900, 400, 0.8, 0.8, o);
      noiseHit(t, 0.6, 'bandpass', 4200, 1500, 1.1, 1.0, o, 0.012);
      noiseHit(t, 0.45, 'lowpass', 1300, 350, 0.7, 0.55, o, 0.02);
    },
    missile(t, o) {
      noiseHit(t, 0.05, 'lowpass', 1000, 400, 0.8, 0.7, o);
      noiseHit(t, 0.75, 'bandpass', 5200, 1800, 1.2, 1.0, o, 0.01);
      noiseHit(t, 0.5, 'lowpass', 1500, 400, 0.7, 0.5, o, 0.02);
      tone(t, 'sine', 1400, 700, 0.4, 0.06, o);
    },
    // aacanon3: a quick double "pom-pom" of the anti-aircraft gun.
    flak(t, o) {
      for (const dt of [0, 0.075]) {
        noiseHit(t + dt, 0.02, 'highpass', 2500, 2500, 0.7, 0.7, o);
        noiseHit(t + dt, 0.13, 'lowpass', 1600, 300, 0.8, 1.0, o);
        tone(t + dt, 'sine', 150, 65, 0.11, 0.7, o);
      }
    },
    // tesla1: a rising charge whine, then a distorted electric crack and buzz.
    tesla(t, o, s) {
      const ch = ctx.createBiquadFilter(); ch.type = 'lowpass'; ch.frequency.value = 2500; ch.connect(o);
      const cg = ctx.createGain(); cg.gain.setValueAtTime(0.0001, t); cg.gain.exponentialRampToValueAtTime(0.35, t + 0.17); cg.gain.setValueAtTime(0.0001, t + 0.18);
      cg.connect(ch);
      const co = ctx.createOscillator(); co.type = 'sawtooth'; co.frequency.setValueAtTime(110, t); co.frequency.exponentialRampToValueAtTime(900, t + 0.18);
      co.connect(cg); co.start(t); co.stop(t + 0.2);
      const z = t + 0.18;
      const d = shaper(shaperHeavy, null);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 0.6;
      d.connect(bp);
      const g = ctx.createGain(); bp.connect(g); g.connect(o);
      g.gain.setValueAtTime(0.0001, z);
      for (let i = 0; i < 20; i++) g.gain.setValueAtTime((0.25 + Math.random() * 0.75) * (1 - i / 24), z + i * 0.017);
      g.gain.exponentialRampToValueAtTime(0.0001, z + 0.42);
      for (const [type, f] of [['square', 58], ['sawtooth', 117], ['square', 233]]) {
        const osc = ctx.createOscillator(); osc.type = type; osc.frequency.value = f * (0.96 + Math.random() * 0.08);
        osc.connect(d); osc.start(z); osc.stop(z + 0.45);
      }
      noiseHit(z, 0.04, 'highpass', 3000, 3000, 0.7, 1.0, o);
      crackle(z, 0.4, 40, 0.6, o);
      s.send(0.45);
    },
    // Flame tower: a throaty roar as the fireball is launched...
    flame(t, o, s) {
      const d = shaper(shaperSoft, o);
      noiseHit(t, 0.5, 'bandpass', 380, 900, 0.8, 1.0, d, 0.04);
      noiseHit(t, 0.35, 'highpass', 2500, 1500, 0.6, 0.35, o, 0.03);
      tone(t, 'sawtooth', 70, 110, 0.4, 0.15, d, 0.04);
      s.send(0.2);
    },
    // ...and a whoomp of fire with crackling when it lands.
    fireHit(t, o, s) {
      const d = shaper(shaperSoft, o);
      noiseHit(t, 0.6, 'lowpass', 1600, 300, 0.8, 1.0, d, 0.01);
      tone(t, 'sine', 90, 40, 0.35, 0.7, d);
      crackle(t + 0.05, 0.9, 45, 0.5, o);
      s.send(0.3);
    },
    // kaboom12: the short crunch of a tank shell landing.
    hitSmall(t, o, s) { kaboom(t, o, s, 0.12); },
    // kaboom25: rockets, missiles and grenades.
    hitMed(t, o, s) { kaboom(t, o, s, 0.4); },
    // kaboom15 / kaboom22: a vehicle or aircraft going up.
    explodeVeh(t, o, s) { kaboom(t, o, s, 0.75); crackle(t + 0.3, 0.8, 18, 0.35, o); },
    // Structures: a rolling chain of big crunches with debris.
    explodeBig(t, o, s) {
      for (let i = 0; i < 4; i++) kaboom(t + i * 0.2 + Math.random() * 0.07, o, s, i === 0 ? 1 : 0.6);
      noiseHit(t + 0.35, 1.4, 'bandpass', 2800, 700, 0.6, 0.2, o, 0.1);
    },
    place(t, o) {
      tone(t, 'sine', 95, 45, 0.3, 0.7, o); noiseHit(t, 0.18, 'lowpass', 500, 200, 0.7, 0.5, o);
      tone(t + 0.12, 'square', 620, 610, 0.08, 0.07, o); tone(t + 0.18, 'square', 930, 920, 0.1, 0.06, o);
    },
    sell(t, o) { for (let i = 0; i < 3; i++) noiseHit(t + i * 0.05, 0.05, 'highpass', 5000, 5000, 0.7, 0.25, o); tone(t + 0.16, 'sine', 1560, 1560, 0.4, 0.15, o); tone(t + 0.16, 'sine', 2080, 2080, 0.4, 0.1, o); },
    click(t, o) { tone(t, 'square', 1250, 1150, 0.03, 0.14, o); },
    // Credits counter ticks: a bright tick as money comes in, a lower one as it is spent.
    cashUp(t, o) { tone(t, 'triangle', 2100, 2250, 0.03, 0.16, o, 0.001); noiseHit(t, 0.012, 'highpass', 6000, 6000, 0.7, 0.06, o); },
    cashDown(t, o) { tone(t, 'triangle', 1250, 1150, 0.03, 0.14, o, 0.001); noiseHit(t, 0.012, 'highpass', 5000, 5000, 0.7, 0.05, o); },
    ready(t, o) { tone(t, 'square', 880, 880, 0.06, 0.14, o); tone(t + 0.08, 'square', 1320, 1320, 0.08, 0.14, o); },
    denied(t, o) { tone(t, 'square', 220, 200, 0.18, 0.1, o); },
  };
  const THROTTLE = { cashUp: 0.07, cashDown: 0.07, rifle: 0.03, mg: 0.03, cannon: 0.05, cannonHeavy: 0.06, turretGun: 0.06, hitSmall: 0.05, hitMed: 0.06, explodeVeh: 0.08, rocket: 0.05, missile: 0.05, flak: 0.06, tesla: 0.1 };
  const UI_SOUNDS = new Set(['click', 'ready', 'denied', 'sell', 'place', 'cashUp', 'cashDown']);
  // Rough loudness of each effect so distant battles do not drown nearby ones.
  const LEVEL = { rifle: 0.55, mg: 1.0, throw: 0.8, cannon: 0.8, cannonHeavy: 0.75, turretGun: 0.85, rocket: 0.7, missile: 0.7, flak: 0.75, tesla: 0.85,
    hitSmall: 0.7, hitMed: 0.8, explodeVeh: 0.9, explodeBig: 1.0, flame: 0.8, fireHit: 0.8 };

  function play(name, vol, pan) {
    if (!ctx || !settings.sfx || ctx.state !== 'running') return;
    if (vol === undefined) vol = 1;
    if (vol < 0.04) return;
    const now = ctx.currentTime;
    const last = lastPlayed.get(name) || 0;
    if (now - last < (THROTTLE[name] || 0.02)) return;
    if (voices > 28) return;
    lastPlayed.set(name, now);
    const v = vol * (LEVEL[name] || 1) * (0.9 + Math.random() * 0.2);
    const out = gain(v, null);
    let node = out;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0)); out.connect(p); node = p; }
    node.connect(sfxBus);
    // Battle sounds go through the lo-fi stage before their volume is applied.
    let into = out;
    if (!UI_SOUNDS.has(name)) {
      if (!crushCurve) crushCurve = lofiCurve();
      const pre = gain(1, null), lo = shaper(crushCurve, null), lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 9500; lp.Q.value = 0.5;
      pre.connect(lo); lo.connect(lp); lp.connect(out);
      into = pre;
    }
    const s = { send(amount) { const g = gain(amount * v, verbIn); out.connect(g); } };
    voices++;
    setTimeout(() => { voices--; }, 1600);
    if (!playRecorded(name, out, s)) FX[name](now + 0.005, into, s);
  }

  // Recorded effects (src/sfx.js). Each play picks a random take and nudges its pitch
  // so repeated shots never sound identical. Returns false when there is no recording.
  const RECORDED = typeof SFX_CLIPS !== 'undefined' ? SFX_CLIPS : {};
  const REVERB = { cannon: 0.2, cannonHeavy: 0.25, turretGun: 0.3, hitMed: 0.3, explodeVeh: 0.4, explodeBig: 0.55, tesla: 0.3, fireHit: 0.2 };
  function playRecorded(name, out, s) {
    const take = (key, delay, rate, level) => {
      const list = RECORDED[key];
      if (!list) return false;
      const b64 = list[Math.floor(Math.random() * list.length)];
      clipBuffer(b64, (buf) => {
        const src = ctx.createBufferSource(); src.buffer = buf;
        src.playbackRate.value = (rate || 1) * (0.94 + Math.random() * 0.12);
        const g = gain(level || 1, out); src.connect(g);
        src.start(ctx.currentTime + (delay || 0));
      });
      return true;
    };
    let ok;
    if (name === 'cannonHeavy') ok = take('cannon', 0, 0.9) && take('cannon', 0.028, 0.86, 0.8);   // both barrels at once
    else if (name === 'explodeBig') ok = take('explodeBig', 0) && take('explodeVeh', 0.28, 0.9, 0.7) && take('hitMed', 0.55, 0.85, 0.6);
    else if (name === 'fireHit') ok = take('fireHit', 0.02) && take('hitSmall', 0, 0.9, 0.7);
    else ok = take(name, 0);
    if (ok && REVERB[name]) s.send(REVERB[name]);
    return ok;
  }

  // ---------------------------------------------------------------------------
  // Voice: pre-rendered neural-voice clips (src/voices.js). EVA cuts off her own previous
  // line, and the music dips while she speaks. Lines without a clip stay silent.
  // ---------------------------------------------------------------------------
  const decoded = new Map();
  let evaSrc = null, lastAck = 0, ackBusyUntil = 0;
  function clipBuffer(b64, cb) {
    if (decoded.has(b64)) { cb(decoded.get(b64)); return; }
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    try {
      ctx.decodeAudioData(bytes.buffer, (buf) => { decoded.set(b64, buf); cb(buf); }, () => {});
    } catch (_) {}
  }
  function playClip(b64, vol, isEva) {
    if (!ctx || !settings.voice || ctx.state !== 'running') return;
    clipBuffer(b64, (buf) => {
      const src = ctx.createBufferSource(); src.buffer = buf;
      const g = gain(vol, master); src.connect(g);
      if (isEva) {
        if (evaSrc) try { evaSrc.stop(); } catch (_) {}
        evaSrc = src;
        const now = ctx.currentTime;
        musicBus.gain.cancelScheduledValues(now);
        musicBus.gain.setTargetAtTime(settings.music ? 0.22 : 0, now, 0.05);
        musicBus.gain.setTargetAtTime(settings.music ? 0.42 : 0, now + buf.duration, 0.3);
      } else ackBusyUntil = ctx.currentTime + buf.duration;
      src.start();
    });
  }
  const clips = typeof VOICE_CLIPS !== 'undefined' ? VOICE_CLIPS : {};
  // Warm up the most frequent lines so the first announcement is not delayed by decoding.
  function preload() {
    for (const k of ['eva:building', 'eva:construction complete', 'eva:unit ready', 'eva:our base is under attack']) if (clips[k]) clipBuffer(clips[k], () => {});
    for (const list of Object.values(RECORDED)) for (const b64 of list) clipBuffer(b64, () => {});
    loadMusic();
  }
  function say(msg) {
    const b64 = clips['eva:' + msg.toLowerCase().replace(/[.!]$/, '')];
    if (b64) playClip(b64, 1.0, true);
  }
  function ack(kind) {
    if (!ctx) return;
    const now = performance.now(), list = clips['ack:' + kind] || clips['ack:inf'];
    if (!list || now - lastAck < 1500 || ctx.currentTime < ackBusyUntil) return;
    lastAck = now;
    playClip(list[Math.floor(Math.random() * list.length)], 0.8, false);
  }

  // ---------------------------------------------------------------------------
  // Music: a step sequencer playing original tracks in a 90s industrial-metal style.
  // ---------------------------------------------------------------------------
  // Recorded instruments (src/music.js) are decoded up front so every note lands on the beat.
  // Until a clip is ready, or if music.js is missing, its instrument falls back to synthesis.
  const MBUF = {};
  function loadMusic() {
    if (typeof MUSIC_CLIPS === 'undefined') return;
    for (const [key, list] of Object.entries(MUSIC_CLIPS)) {
      list.forEach((b64, i) => clipBuffer(b64, (buf) => { (MBUF[key] || (MBUF[key] = []))[i] = { buf, at: leadIn(buf) }; }));
    }
  }
  // MP3 decoders add a little silence in front; skip it so hits are tight.
  function leadIn(buf) {
    const d = buf.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > peak * 0.03) return Math.max(0, i / buf.sampleRate - 0.002);
    return 0;
  }
  // Play clip `i` (random when omitted) of `key` at time t. o: vol, rate, dur + rel (cut with a
  // fade), lp (low-pass Hz), pan. Returns the output gain for effect sends, or null.
  function samp(key, t, o) {
    const list = MBUF[key];
    if (!list) return null;
    const pick = list[o.i != null ? o.i : Math.floor(Math.random() * list.length)];
    if (!pick) return null;
    const src = ctx.createBufferSource(); src.buffer = pick.buf;
    if (o.rate) src.playbackRate.value = o.rate;
    const g = ctx.createGain(); g.gain.value = o.vol;
    let node = src;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = 0.8; src.connect(f); node = f; }
    node.connect(g);
    if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); p.connect(musicBus); }
    else g.connect(musicBus);
    src.start(t, pick.at);
    if (o.dur) {
      const rel = o.rel || 0.06;
      g.gain.setValueAtTime(o.vol, t + o.dur);
      g.gain.linearRampToValueAtTime(0, t + o.dur + rel);
      src.stop(t + o.dur + rel + 0.02);
    }
    return g;
  }
  // Pitched clips: the take recorded nearest the note, re-pitched the rest of the way.
  function note(key, t, midi, o) {
    const roots = typeof MUSIC_ROOTS !== 'undefined' && MUSIC_ROOTS[key];
    if (!roots) return null;
    let i = 0;
    for (let j = 1; j < roots.length; j++) if (Math.abs(roots[j] - midi) < Math.abs(roots[i] - midi)) i = j;
    return samp(key, t, Object.assign({ i, rate: Math.pow(2, (midi - roots[i]) / 12) }, o));
  }
  const send = (g, amount, dest) => { if (g) g.connect(gain(amount, dest)); return g; };

  const INST = {
    kick(t) {
      if (samp('kick', t, { vol: 0.95 })) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      envelope(g, t, 0.9, 0.002, 0.32); o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.4);
      noiseHit(t, 0.02, 'highpass', 3000, 3000, 0.7, 0.25, musicBus);
    },
    snare(t, v) {
      v = v || 1;
      if (send(samp(v < 1 ? 'ghost' : 'snare', t, { vol: v < 1 ? 0.45 : 0.7 }), 0.35, verbIn)) return;
      const g = noiseHit(t, v < 1 ? 0.1 : 0.22, 'bandpass', 1900, 1500, 0.7, 0.55 * v, musicBus);
      const s = gain(0.6, verbIn); g.connect(s);
      tone(t, 'triangle', 200, 160, 0.1, 0.35 * v, musicBus);
    },
    // Marching boots: a dull stamp with a gravelly scuff.
    boots(t) {
      if (samp('boots', t, { vol: 0.75 })) return;
      noiseHit(t, 0.12, 'lowpass', 380, 160, 1, 0.75, musicBus);
      tone(t, 'sine', 90, 55, 0.09, 0.4, musicBus);
      noiseHit(t + 0.01, 0.06, 'bandpass', 2500, 1800, 1, 0.12, musicBus);
    },
    // A gang shout ("Hup!"): buzzy voices through vowel formants.
    shout(t) {
      if (send(samp('shout', t, { vol: 0.5 }), 0.6, verbIn)) return;
      const out = gain(0.55, musicBus); out.connect(gain(0.7, verbIn));
      const forms = [[650, 1.2, 1], [1080, 1.5, 0.6], [2500, 3, 0.25]];
      const bus = gain(1, null);
      for (const [f, q, v] of forms) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q * 4; bus.connect(bp); bp.connect(gain(v, out)); }
      for (let i = 0; i < 4; i++) {
        const tt = t + i * 0.012, f0 = 120 + i * 17;
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f0 * 1.25, tt); o.frequency.exponentialRampToValueAtTime(f0, tt + 0.15);
        const g = ctx.createGain(); envelope(g, tt, 0.5, 0.012, 0.2);
        o.connect(g); g.connect(bus); o.start(tt); o.stop(tt + 0.3);
      }
      const n = noiseHit(t, 0.08, 'highpass', 3000, 3000, 0.7, 0.25, bus);
      void n;
    },
    hat(t, open) {
      if (samp(open ? 'ohat' : 'hat', t, { vol: open ? 0.2 : 0.22, dur: open ? 0.3 : 0, rel: 0.15 })) return;
      noiseHit(t, open ? 0.22 : 0.035, 'highpass', 7500, 7500, 0.7, open ? 0.12 : 0.1, musicBus); },
    crash(t) {
      if (send(samp('crash', t, { vol: 0.32 }), 0.3, verbIn)) return;
      const g = noiseHit(t, 1.4, 'highpass', 4500, 3500, 0.5, 0.16, musicBus, 0.005); const s = gain(0.4, verbIn); g.connect(s); },
    tom(t, f, i) {
      if (send(samp('tom', t, { i, vol: 0.6 }), 0.25, verbIn)) return;
      tone(t, 'sine', f * 1.6, f, 0.3, 0.55, musicBus); },
    timp(t) {
      if (send(samp('timp', t, { vol: 0.7 }), 0.4, verbIn)) return;
      tone(t, 'sine', 90, 70, 1.2, 0.6, musicBus);
    },
    anvil(t) {
      if (send(samp('anvil', t, { vol: 0.32 }), 0.7, verbIn)) return;
      const out = gain(0.18, musicBus), s = gain(0.9, verbIn); out.connect(s);
      for (const f of [420, 583, 911, 1307]) tone(t, 'square', f, f * 0.99, 0.7, 0.25, out);
      noiseHit(t, 0.08, 'bandpass', 2500, 2500, 1, 0.5, out);
    },
    guitar(t, midi, dur, mute) {
      // Two recorded takes panned left and right, like double-tracked rhythm guitars.
      const o = mute ? { vol: 0.42, dur: Math.min(dur, 0.12), rel: 0.03, lp: 1300 } : { vol: 0.3, dur, rel: 0.08 };
      if (note('gtr1', t, midi, Object.assign({ pan: -0.55 }, o)) && note('gtr2', t + 0.004, midi, Object.assign({ pan: 0.55 }, o))) return;
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      const d = shaper(shaperHeavy, null);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = mute ? 900 : 3400; lp.Q.value = 0.9;
      const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 650; pk.gain.value = -5; pk.Q.value = 1;
      const g = ctx.createGain();
      d.connect(lp); lp.connect(pk); pk.connect(g); g.connect(musicBus);
      const len = mute ? Math.min(dur, 0.1) : dur;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(mute ? 0.2 : 0.17, t + 0.004);
      g.gain.setValueAtTime(mute ? 0.2 : 0.15, t + len * 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.06);
      for (const [mult, det] of [[1, -7], [1, 7], [1.5, 0], [2, 3]]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * mult; o.detune.value = det;
        const og = gain(mult === 2 ? 0.5 : 1, d); o.connect(og); o.start(t); o.stop(t + len + 0.1);
      }
    },
    bass(t, midi, dur) {
      if (note('bass', t, midi, { vol: 0.55, dur, rel: 0.05 })) return;
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4;
      lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(220, t + Math.min(dur, 0.3));
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32, t + 0.005);
      g.gain.setValueAtTime(0.28, t + dur * 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
      lp.connect(g); g.connect(musicBus);
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp);
      const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = f / 2; const sg = gain(0.6, g); sub.connect(sg);
      o.start(t); o.stop(t + dur + 0.1); sub.start(t); sub.stop(t + dur + 0.1);
    },
    lead(t, midi, dur) {
      const lg = note('lead', t, midi, { vol: 0.34, dur, rel: 0.15 });
      if (lg) { send(lg, 0.45, delayIn); send(lg, 0.35, verbIn); return; }
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 2;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.13, t + 0.02);
      g.gain.setValueAtTime(0.11, t + dur * 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
      lp.connect(g); g.connect(musicBus); g.connect(gain(0.6, delayIn)); g.connect(gain(0.3, verbIn));
      const vib = ctx.createOscillator(); vib.frequency.value = 5.5; const vg = gain(0, null);
      vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(9, t + Math.min(0.3, dur));
      vib.connect(vg);
      for (const [type, det] of [['square', -5], ['sawtooth', 6]]) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det; vg.connect(o.detune);
        o.connect(lp); o.start(t); o.stop(t + dur + 0.2);
      }
      vib.start(t); vib.stop(t + dur + 0.2);
    },
    stab(t, midi, dur) {
      if (send(note('stab', t, midi, { vol: 0.34, dur: Math.max(0.3, dur), rel: 0.25 }), 0.45, verbIn)) return;
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1;
      lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.25);
      const g = ctx.createGain(); envelope(g, t, 0.12, 0.01, Math.max(0.25, dur));
      lp.connect(g); g.connect(musicBus); g.connect(gain(0.4, verbIn));
      for (const iv of [0, 3, 7, 12]) {
        for (const det of [-8, 8]) {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * Math.pow(2, iv / 12); o.detune.value = det;
          o.connect(lp); o.start(t); o.stop(t + dur + 0.3);
        }
      }
    },
    pad(t, midi, dur) {
      if (send(note('pad', t, midi, { vol: 0.26, dur, rel: 0.8 }), 0.6, verbIn)) return;
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.5);
      g.gain.setValueAtTime(0.05, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.8);
      lp.connect(g); g.connect(musicBus); g.connect(gain(0.8, verbIn));
      for (const iv of [0, 7, 12, 15]) for (const det of [-10, 10]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * Math.pow(2, iv / 12); o.detune.value = det;
        o.connect(lp); o.start(t); o.stop(t + dur + 1);
      }
    },
  };

  // Patterns are 16 steps per bar. Drums: x = hit, o = open hat / accent. Melodic tokens:
  // a semitone offset from the song key, '-' to hold, '.' to rest, 'm' suffix for palm-muted.
  const E = 40; // E2
  const SONGS = [
    {
      // Slow and smooth: a laid-back half-time groove, ringing guitar chords, strings and a long brass melody.
      name: 'Night Sortie', bpm: 90, key: E,
      parts: {
        intro: {
          bars: 4, k: 'x.........x.....', h: '..x...x...x...x.',
          bass: '0 - - - - - - - - - - - - - - -|-4 - - - - - - - - - - - - - - -',
          pad: '0 - - - - - - - - - - - - - - -|-4 - - - - - - - - - - - - - - -',
        },
        groove: {
          bars: 8, k: 'x.....x...x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.',
          gtr: '0 - - - - - - - - - - - - - - -|-4 - - - - - - - -2 - - - - - - -',
          bass: '0 - - - - - 0 - 3 - - - 5 - - -|-4 - - - - - -4 - -2 - - - - - - -',
          pad: '0 - - - - - - - - - - - - - - -|-4 - - - - - - - -2 - - - - - - -',
        },
        theme: {
          bars: 8, k: 'x.....x...x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', crash: 'x...............', crashEvery: 8,
          gtr: '0 - - - - - - - - - - - - - - -|-4 - - - - - - - -2 - - - - - - -',
          bass: '0 - - - - - 0 - 3 - - - 5 - - -|-4 - - - - - -4 - -2 - - - - - - -',
          pad: '0 - - - - - - - - - - - - - - -|-4 - - - - - - - -2 - - - - - - -',
          lead: '19 - - - - - 22 - 24 - - - - - - -|24 - - - 22 - - - 20 - - - 22 - - -|19 - - - - - 22 - 26 - - - 24 - - -|24 - - - - - - - 22 - - - - - - -',
        },
        bridge: {
          bars: 4, k: 'x.......x.......', h: '..x...x...x...x.', timp: 'x...............', every: 2, fill: true,
          bass: '-4 - - - - - - - - - - - - - - -|-2 - - - - - - - - - - - - - - -',
          pad: '-4 - - - - - - - - - - - - - - -|-2 - - - - - - - - - - - - - - -',
          lead: '27 - - - - - - - 24 - - - - - - -|26 - - - - - - - 22 - - - - - - -',
        },
      },
      order: ['intro', 'groove', 'theme', 'bridge', 'theme', 'groove'],
    },
    {
      name: 'Iron Fist March', bpm: 112, key: E,
      parts: {
        intro: { bars: 4, k: 'x.......x.......', s: '............x...', anvil: 'x...............', timp: '........x.......', pad: '0 - - - - - - - - - - - - - - -|-3 - - - - - - - - - - - - - - -', every: 2 },
        verse: {
          bars: 8, k: 'x...x...x...x.x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.',
          gtr: '0m 0m 0m 0m 0m 0m 3 - 0m 0m 0m 0m 1 - - -|0m 0m 0m 0m 0m 0m 5 - 0m 0m 3 - 1 - 0 -',
          bass: '0 . 0 . 0 . 3 - 0 . 0 . 1 - - -|0 . 0 . 0 . 5 - 0 . 3 - 1 - 0 -',
        },
        chorus: {
          bars: 8, k: 'x.x.x.x.x.x.x.x.', s: '....x.......x...', h: 'o...o...o...o...', crash: 'x...............', crashEvery: 4,
          gtr: '0 - - - - - - - 3 - - - 5 - - -|1 - - - - - - - 5 - - - 3 - 1 -',
          bass: '0 - - - - - - - 3 - - - 5 - - -|1 - - - - - - - 5 - - - 3 - 1 -',
          lead: '24 - - - 27 - 26 - 24 - - - 22 - - -|25 - - - 24 - 22 - 20 - 19 - - - - -',
        },
        stomp: {
          bars: 4, k: 'x.......x.......', s: '....x.......x...', anvil: 'x.....x.....x...', stab: '12 . . . . . 12 . . . . . 13 . . .',
          bass: '0 - - - - - - - - - - - . . . .', fill: true,
        },
      },
      order: ['intro', 'verse', 'chorus', 'verse', 'stomp', 'chorus', 'verse'],
    },
    {
      // A driving bass groove; ringing guitars, strings and a long brass line build over it.
      name: 'Grind Protocol', bpm: 136, key: E,
      parts: {
        intro: { bars: 4, k: 'x...x...x...x...', h: '..o...o...o...o.', bass: '0 0 12 0 0 10 0 12 0 0 7 0 0 3 5 7' },
        a: {
          bars: 8, k: 'x...x...x...x...', s: '....x.......x...', h: '..o...o...o...o.',
          bass: '0 0 12 0 0 10 0 12 0 0 7 0 0 3 5 7',
          gtr: '0 - - - - - - - - - - - - - - -|0 - - - - - - - 3 - - - 5 - - -',
          pad: '0 - - - - - - - - - - - - - - -|0 - - - - - - - 3 - - - - - - -',
        },
        b: {
          bars: 8, k: 'x...x...x...x...', s: '....x.......x...', h: 'x.o.x.o.x.o.x.o.', crash: 'x...............', crashEvery: 4,
          bass: '0 0 12 0 0 10 0 12 0 0 7 0 0 3 5 7',
          gtr: '0 - - - - - - - - - - - - - - -|0 - - - - - - - 3 - - - 5 - - -',
          pad: '0 - - - - - - - - - - - - - - -|0 - - - - - - - 3 - - - - - - -',
          lead: '19 - - - - - - - 22 - - - 24 - - -|26 - - - 24 - - - 22 - - - 19 - - -|19 - - - - - - - 22 - - - 27 - - -|26 - - - - - - - 24 - - - - - - -',
        },
        break: { bars: 4, k: 'x.......x.......', h: '..o...o...o...o.', anvil: '....x.......x...', pad: '0 - - - - - - - - - - - - - - -', fill: true },
      },
      order: ['intro', 'a', 'b', 'break', 'a', 'b'],
    },
    {
      name: 'Cold Front', bpm: 92, key: E,
      parts: {
        intro: { bars: 4, h: '..x...x...x...x.', pad: '0 - - - - - - - - - - - - - - -|-4 - - - - - - - - - - - - - - -', lead: '19 - - - - - 17 - 15 - - - - - - -|16 - - - 15 - 12 - - - - - - - - -' },
        a: {
          bars: 8, k: 'x.........x.....', s: '........x.......', h: '..x...x...x...x.',
          gtr: '0m 0m . 0m 0m . 0 - - - . . 0m 0m 1 -|0m 0m . 0m 0m . -2 - - - . . 0m 0m 1 -',
          bass: '0 - . 0 - . 0 - - - . . 0 - 1 -|0 - . 0 - . -2 - - - . . 0 - 1 -',
          pad: '0 - - - - - - - - - - - - - - -|-4 - - - - - - - - - - - - - - -',
        },
        b: {
          bars: 8, k: 'x.........x..x..', s: '........x.......', h: 'x.x.x.x.x.x.x.x.', crash: 'x...............', crashEvery: 4,
          gtr: '0 - - - - - - - 5 - - - 3 - - -|-4 - - - - - - - -2 - - - - - - -',
          bass: '0 - - - - - - - 5 - - - 3 - - -|-4 - - - - - - - -2 - - - - - - -',
          lead: '24 - - - 22 - 19 - 22 - - - 24 - - -|20 - - - 19 - 17 - 15 - - - - - - -',
        },
      },
      order: ['intro', 'a', 'b', 'a', 'b'],
    },
  ];
  for (const song of SONGS) for (const part of Object.values(song.parts)) {
    for (const key of ['gtr', 'bass', 'lead', 'stab', 'pad']) {
      if (part[key]) part[key] = part[key].split('|').map((bar) => bar.trim().split(/\s+/));
    }
  }

  const Music = {
    song: 0, part: 0, bar: 0, step: 0, next: 0, timer: null, started: false,
    get name() { return SONGS[this.song].name; },
    start() {
      if (this.started || !ctx) return;
      this.started = true;
      this.next = ctx.currentTime + 0.15;
      this.timer = setInterval(() => this.tick(), 25);
    },
    skip() {
      this.song = (this.song + 1) % SONGS.length; this.part = 0; this.bar = 0; this.step = 0;
      if (ctx) this.next = ctx.currentTime + 0.3;
    },
    tick() {
      if (!ctx || ctx.state !== 'running') return;
      while (this.next < ctx.currentTime + 0.12) {
        if (settings.music) this.playStep(this.next);
        this.advance();
      }
    },
    advance() {
      const song = SONGS[this.song];
      const part = song.parts[song.order[this.part]];
      this.next += 60 / song.bpm / 4;
      if (++this.step >= 16) {
        this.step = 0;
        if (++this.bar >= part.bars) {
          this.bar = 0;
          if (++this.part >= song.order.length) { this.part = 0; this.song = (this.song + 1) % SONGS.length; }
        }
      }
    },
    playStep(t) {
      const song = SONGS[this.song], part = song.parts[song.order[this.part]];
      const st = this.step, bar = this.bar, stepDur = 60 / song.bpm / 4;
      const lastBar = bar === part.bars - 1;
      const hit = (pat, every) => pat && (!every || bar % every === 0) && pat[st] !== '.' ? pat[st] : null;
      // Drum fill on the last bar of a part.
      if (lastBar && st >= 12 && (part.fill || part.k)) {
        INST.tom(t, [180, 150, 120, 95][st - 12], st - 12);
        if (st === 12) INST.snare(t);
      } else {
        if (hit(part.k)) INST.kick(t);
        const sn = hit(part.s); if (sn) INST.snare(t, sn === 'g' ? 0.35 : 1);
        if (hit(part.boots)) INST.boots(t);
        const h = hit(part.h); if (h) INST.hat(t, h === 'o');
      }
      if (hit(part.crash, part.crashEvery || 1) && bar % (part.crashEvery || 1) === 0) INST.crash(t);
      if (hit(part.anvil, part.every)) INST.anvil(t);
      if (hit(part.timp, part.every)) INST.timp(t);
      if (hit(part.shout) && (!part.shoutEvery || (bar + 1) % part.shoutEvery === 0)) INST.shout(t);
      const mel = (pat, inst, base) => {
        if (!pat) return;
        const barPat = pat[bar % pat.length], tok = barPat[st];
        if (!tok || tok === '.' || tok === '-') return;
        let holds = 0;
        for (let i = st + 1; i < barPat.length && barPat[i] === '-'; i++) holds++;
        const mute = tok.endsWith('m');
        inst(t, base + parseInt(tok, 10), (holds + 1) * stepDur, mute);
      };
      mel(part.gtr, INST.guitar, song.key);
      mel(part.bass, INST.bass, song.key - 12);
      mel(part.lead, INST.lead, song.key);
      mel(part.stab, INST.stab, song.key);
      mel(part.pad, INST.pad, song.key + 12);
    },
  };

  function setOption(key, on) {
    settings[key] = on;
    save();
    if (!ctx) return;
    if (key === 'music') musicBus.gain.setTargetAtTime(on ? 0.42 : 0, ctx.currentTime, 0.1);
    if (key === 'sfx') sfxBus.gain.setTargetAtTime(on ? 0.85 : 0, ctx.currentTime, 0.05);
    if (key === 'voice' && !on && evaSrc) try { evaSrc.stop(); } catch (_) {}
  }

  return { init: unlock, unlock, status, play, say, ack, settings, setOption, music: Music, get debug() { return { ctx, master, musicClips: Object.values(MBUF).reduce((n, l) => n + l.filter(Boolean).length, 0) }; } };
})();
