'use strict';
// Sound effects, spoken announcements and an original industrial-metal soundtrack,
// all synthesised live with the Web Audio API. No audio files are loaded.

const Sound = (() => {
  const settings = { music: true, sfx: true, voice: true };
  try { Object.assign(settings, JSON.parse(localStorage.getItem('ps-audio') || '{}')); } catch (_) {}
  const save = () => { try { localStorage.setItem('ps-audio', JSON.stringify(settings)); } catch (_) {} };

  let ctx = null, master, sfxBus, musicBus, verb, verbIn, delayIn, noise, shaperHeavy, shaperSoft;
  const lastPlayed = new Map();
  let voices = 0;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
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
    if (document.hidden) ctx.suspend(); else ctx.resume();
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
  // Battlefield effects. `vol` and `pan` come from the camera position.
  // ---------------------------------------------------------------------------
  const FX = {
    rifle(t, o) { noiseHit(t, 0.07, 'highpass', 1400, 900, 0.7, 0.55, o); noiseHit(t, 0.06, 'lowpass', 500, 200, 0.7, 0.5, o); },
    mg(t, o) { noiseHit(t, 0.05, 'highpass', 1700, 1000, 0.7, 0.5, o); noiseHit(t, 0.045, 'lowpass', 650, 250, 0.7, 0.4, o); },
    throw(t, o) { noiseHit(t, 0.18, 'bandpass', 900, 2200, 1.5, 0.25, o, 0.04); },
    cannon(t, o, s) {
      const d = shaper(shaperSoft, o);
      tone(t, 'sine', 120, 36, 0.42, 0.9, d);
      noiseHit(t, 0.35, 'lowpass', 1800, 260, 0.8, 0.85, o);
      noiseHit(t, 0.05, 'highpass', 2500, 2500, 0.6, 0.4, o);
      s.send(0.35);
    },
    cannonHeavy(t, o, s) { FX.cannon(t, o, s); FX.cannon(t + 0.09, o, s); },
    rocket(t, o) { noiseHit(t, 0.55, 'bandpass', 2200, 450, 1.2, 1.3, o, 0.02); noiseHit(t, 0.08, 'lowpass', 700, 300, 0.7, 0.5, o); tone(t, 'sawtooth', 320, 110, 0.4, 0.08, o); },
    missile(t, o) { noiseHit(t, 0.5, 'bandpass', 3000, 900, 1.4, 1.2, o, 0.015); noiseHit(t, 0.07, 'lowpass', 800, 300, 0.7, 0.45, o); tone(t, 'sine', 1100, 520, 0.35, 0.1, o); },
    flak(t, o) { for (const dt of [0, 0.09]) { noiseHit(t + dt, 0.14, 'lowpass', 1300, 300, 0.7, 1.1, o); tone(t + dt, 'sine', 140, 60, 0.1, 0.5, o); } },
    tesla(t, o, s) {
      tone(t, 'sine', 300, 1400, 0.16, 0.12, o, 0.1);
      const d = shaper(shaperHeavy, null);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.8;
      d.connect(bp);
      const g = ctx.createGain(); bp.connect(g); g.connect(o);
      g.gain.setValueAtTime(0.0001, t + 0.12);
      for (let i = 0; i < 18; i++) g.gain.setValueAtTime(0.15 + Math.random() * 0.45, t + 0.12 + i * 0.022);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      for (const [type, f] of [['sawtooth', 55], ['square', 110], ['sawtooth', 163]]) {
        const osc = ctx.createOscillator(); osc.type = type; osc.frequency.value = f * (0.97 + Math.random() * 0.06);
        osc.connect(d); osc.start(t + 0.12); osc.stop(t + 0.65);
      }
      noiseHit(t + 0.12, 0.45, 'highpass', 4000, 2500, 0.5, 0.25, o);
      s.send(0.4);
    },
    hitSmall(t, o) { noiseHit(t, 0.18, 'lowpass', 1200, 250, 0.7, 0.5, o); tone(t, 'sine', 95, 45, 0.15, 0.4, o); },
    hitMed(t, o, s) { noiseHit(t, 0.35, 'lowpass', 1400, 200, 0.7, 0.7, o); tone(t, 'sine', 80, 35, 0.3, 0.6, o); s.send(0.25); },
    explodeVeh(t, o, s) {
      const d = shaper(shaperSoft, o);
      noiseHit(t, 1.0, 'lowpass', 1500, 120, 0.7, 1.0, d);
      tone(t, 'sine', 70, 26, 0.8, 0.9, d);
      noiseHit(t + 0.05, 0.4, 'highpass', 3000, 1500, 0.5, 0.25, o);
      s.send(0.55);
    },
    explodeBig(t, o, s) {
      for (let i = 0; i < 4; i++) {
        const tt = t + i * 0.22 + Math.random() * 0.08;
        noiseHit(tt, 1.3, 'lowpass', 1300, 100, 0.7, 0.9, o);
        tone(tt, 'sine', 60, 24, 1.0, 0.8, o);
      }
      noiseHit(t + 0.3, 1.6, 'bandpass', 3000, 600, 0.6, 0.18, o, 0.1);   // debris rattle
      s.send(0.7);
    },
    place(t, o) {
      tone(t, 'sine', 95, 45, 0.3, 0.7, o); noiseHit(t, 0.18, 'lowpass', 500, 200, 0.7, 0.5, o);
      tone(t + 0.12, 'square', 620, 610, 0.08, 0.07, o); tone(t + 0.18, 'square', 930, 920, 0.1, 0.06, o);
    },
    sell(t, o) { for (let i = 0; i < 3; i++) noiseHit(t + i * 0.05, 0.05, 'highpass', 5000, 5000, 0.7, 0.25, o); tone(t + 0.16, 'sine', 1560, 1560, 0.4, 0.15, o); tone(t + 0.16, 'sine', 2080, 2080, 0.4, 0.1, o); },
    click(t, o) { tone(t, 'square', 1250, 1150, 0.03, 0.14, o); },
    ready(t, o) { tone(t, 'square', 880, 880, 0.06, 0.14, o); tone(t + 0.08, 'square', 1320, 1320, 0.08, 0.14, o); },
    denied(t, o) { tone(t, 'square', 220, 200, 0.18, 0.1, o); },
  };
  const THROTTLE = { rifle: 0.03, mg: 0.03, cannon: 0.05, hitSmall: 0.05, hitMed: 0.06, explodeVeh: 0.08, rocket: 0.05, missile: 0.05 };

  function play(name, vol, pan) {
    if (!ctx || !settings.sfx || ctx.state !== 'running') return;
    if (vol === undefined) vol = 1;
    if (vol < 0.04) return;
    const now = ctx.currentTime;
    const last = lastPlayed.get(name) || 0;
    if (now - last < (THROTTLE[name] || 0.02)) return;
    if (voices > 28) return;
    lastPlayed.set(name, now);
    const out = gain(vol * (0.9 + Math.random() * 0.2), null);
    let node = out;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0)); out.connect(p); node = p; }
    node.connect(sfxBus);
    const s = { send(amount) { const g = gain(amount * vol, verbIn); out.connect(g); } };
    voices++;
    setTimeout(() => { voices--; }, 1500);
    FX[name](now + 0.005, out, s);
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
  function preload() { for (const k of ['eva:building', 'eva:construction complete', 'eva:unit ready', 'eva:our base is under attack']) if (clips[k]) clipBuffer(clips[k], () => {}); }
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
  const INST = {
    kick(t) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      envelope(g, t, 0.9, 0.002, 0.32); o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.4);
      noiseHit(t, 0.02, 'highpass', 3000, 3000, 0.7, 0.25, musicBus);
    },
    snare(t, v) {
      v = v || 1;
      const g = noiseHit(t, v < 1 ? 0.1 : 0.22, 'bandpass', 1900, 1500, 0.7, 0.55 * v, musicBus);
      const s = gain(0.6, verbIn); g.connect(s);
      tone(t, 'triangle', 200, 160, 0.1, 0.35 * v, musicBus);
    },
    // Marching boots: a dull stamp with a gravelly scuff.
    boots(t) {
      noiseHit(t, 0.12, 'lowpass', 380, 160, 1, 0.75, musicBus);
      tone(t, 'sine', 90, 55, 0.09, 0.4, musicBus);
      noiseHit(t + 0.01, 0.06, 'bandpass', 2500, 1800, 1, 0.12, musicBus);
    },
    // A gang shout ("Hup!"): buzzy voices through vowel formants.
    shout(t) {
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
    hat(t, open) { noiseHit(t, open ? 0.22 : 0.035, 'highpass', 7500, 7500, 0.7, open ? 0.12 : 0.1, musicBus); },
    crash(t) { const g = noiseHit(t, 1.4, 'highpass', 4500, 3500, 0.5, 0.16, musicBus, 0.005); const s = gain(0.4, verbIn); g.connect(s); },
    tom(t, f) { tone(t, 'sine', f * 1.6, f, 0.3, 0.55, musicBus); },
    anvil(t) {
      const out = gain(0.18, musicBus), s = gain(0.9, verbIn); out.connect(s);
      for (const f of [420, 583, 911, 1307]) tone(t, 'square', f, f * 0.99, 0.7, 0.25, out);
      noiseHit(t, 0.08, 'bandpass', 2500, 2500, 1, 0.5, out);
    },
    guitar(t, midi, dur, mute) {
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
      // Original march: boots, drill snare, gang shouts, chugging guitar and a heroic brass line.
      name: 'Steel Parade', bpm: 104, key: E,
      parts: {
        intro: { bars: 4, boots: 'x...x...x...x...', s: 'x.gxx.g.x.gxx.g.', anvil: 'x...............', every: 4, pad: '0 - - - - - - - - - - - - - - -' },
        call: {
          bars: 4, boots: 'x...x...x...x...', s: 'x.gxx.g.x.gxx.g.', k: 'x.......x.......',
          shout: 'x...x...x.x.....', stab: '12 . . . . . . . . . . . 13 . . .|12 . . . . . . . 10 . . . 8 . . .',
        },
        riff: {
          bars: 8, k: 'x...x.x.x...x.x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', boots: 'x...x...x...x...',
          gtr: '0m 0m 0m . 0m 0m 0m . 1 - 0m 0m 3 - 0m .|0m 0m 0m . 0m 0m 0m . 5 - 3 - 1 - 0 -',
          bass: '0 0 0 . 0 0 0 . 1 - 0 0 3 - 0 .|0 0 0 . 0 0 0 . 5 - 3 - 1 - 0 -',
          shout: 'x.......x.......', shoutEvery: 4,
        },
        anthem: {
          bars: 8, k: 'x.x.x.x.x.x.x.x.', s: '....x.......x...', h: 'o...o...o...o...', crash: 'x...............', crashEvery: 4,
          gtr: '0 - - - - - - - -4 - - - - - - -|1 - - - - - - - 0 - - - - - - -',
          bass: '0 - - - - - - - -4 - - - - - - -|1 - - - - - - - 0 - - - - - - -',
          stab: '12 . . . . . . . 8 . . . . . . .|13 . . . . . . . 12 . . . . . . .',
          lead: '24 - - 24 27 - 26 - 24 - 22 - 19 - - -|20 - - 20 22 - 24 - 25 - 24 - 22 - - -|24 - - 24 27 - 29 - 31 - 29 - 27 - - -|25 - - - 24 - 22 - 24 - - - - - - -',
        },
        drill: {
          bars: 4, boots: 'x...x...x...x...', s: 'xgxgxgxgxxgxxgxx', anvil: 'x.......x.......',
          shout: 'x...x...x...x...', bass: '0 - - - - - - - 0 - - - - - - -', fill: true,
        },
      },
      order: ['intro', 'call', 'riff', 'anthem', 'riff', 'drill', 'anthem', 'riff'],
    },
    {
      name: 'Iron Fist March', bpm: 112, key: E,
      parts: {
        intro: { bars: 4, k: 'x.......x.......', s: '............x...', anvil: 'x...............', pad: '0 - - - - - - - - - - - - - - -|-3 - - - - - - - - - - - - - - -', every: 2 },
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
      name: 'Grind Protocol', bpm: 136, key: E,
      parts: {
        intro: { bars: 4, k: 'x...x...x...x...', h: '..o...o...o...o.', bass: '0 0 12 0 0 10 0 12 0 0 7 0 0 3 5 7' },
        a: {
          bars: 8, k: 'x...x...x...x...', s: '....x.......x...', h: '..o...o...o...o.',
          bass: '0 0 12 0 0 10 0 12 0 0 7 0 0 3 5 7',
          gtr: '0m . . 0m . . 0m . 3 . . 3 . . 5 .|0m . . 0m . . 0m . 6 . . 5 . . 3 .',
        },
        b: {
          bars: 8, k: 'x...x...x...x...', s: '....x.......x..x', h: 'xxoxxxoxxxoxxxox', crash: 'x...............', crashEvery: 4,
          bass: '0 0 12 0 0 10 0 12 0 0 7 0 0 3 5 7',
          gtr: '0 - - - - - - - 1 - - - - - - -|3 - - - - - - - 1 - - - 0 - - -',
          lead: '24 27 31 27 24 27 31 34 25 29 32 29 25 29 32 36|27 31 34 31 27 31 34 39 25 29 32 29 24 27 31 27',
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
        INST.tom(t, [180, 150, 120, 95][st - 12]);
        if (st === 12) INST.snare(t);
      } else {
        if (hit(part.k)) INST.kick(t);
        const sn = hit(part.s); if (sn) INST.snare(t, sn === 'g' ? 0.35 : 1);
        if (hit(part.boots)) INST.boots(t);
        const h = hit(part.h); if (h) INST.hat(t, h === 'o');
      }
      if (hit(part.crash, part.crashEvery || 1) && bar % (part.crashEvery || 1) === 0) INST.crash(t);
      if (hit(part.anvil, part.every)) INST.anvil(t);
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

  return { init, play, say, ack, settings, setOption, music: Music, get debug() { return { ctx, master }; } };
})();
