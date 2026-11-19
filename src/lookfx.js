'use strict';
// The "Tiberian Sun look" prototype, part two (looks only; branch claude/ts-look; see "Tiberian Sun look" in docs/NOTES.md,
// proposal items 4-6). Each part has its own switch in LOOK (look.js), off with ?lookoff=<name> (or everything with ?look=off):
//  - alive:   living structures: steam from refinery, factory and power plant stacks, power plants' glow pulsing, the Allied
//             radar's dish turning, a factory's amber beacon and a barracks' door lamp while they produce (own side and
//             allies only: no news about the enemy), a glowing build plane while a structure goes up and a dust burst when
//             it is done (lookAlive, from ui.js after drawStructure; lookFxGround / lookFxOver). Defences give off no light.
//  - blasts:  heavier explosions as the look's own particles (not in G: not saved, not online): a bright core, a rolling
//             fireball, a shockwave ring on the ground, debris that flies and bounces, and a scorch mark that fades over
//             SCORCH_LIFE s; scaled by the explosion's size (which the game sets by weapon and by what was destroyed). Their
//             light goes through drawLook's shared 'lighten' buffer (lookFxLights), so overlapping blasts never pile up.
//  - sidebar: a steel skin for the sidebar and top strip (CSS, body.lk-steel): dark riveted metal, framed build icons,
//             team-colour trims, a radar screen with scan lines and a burst of static when it comes online (lookRadar).
//             The same buttons, layout and hit areas.
// Hooks in the main code (each marked "lookfx"): ui.js drawOne (lookAlive), ui.js after lookSmoke (lookFxOver), ui.js
// drawRadar (lookRadar), look.js cliffItems (lookFxGround), look.js drawLook (lookFxLights).
(() => {
  const q = typeof location !== 'undefined' ? location.search : '';
  const on = !/[?&]look=off\b/.test(q), off = (q.match(/[?&]lookoff=([a-z,]+)/) || [, ''])[1].split(',');
  for (const k of ['alive', 'blasts', 'sidebar', 'craters']) LOOK[k] = on && !off.includes(k);
})();

const FX_MAX = 700, DEBRIS_MAX = 260, SCORCH_MAX = 120, SCORCH_LIFE = 70, STEAM_MAX = 260, BLASTS_PER_FRAME = 10;
let lookFxS = null;
function fxPics() {
  const ball = (stops) => { const c = mkCanvas(48, 48), x = c.getContext('2d'), gr = x.createRadialGradient(24, 24, 0, 24, 24, 24);
    for (const [o, col] of stops) gr.addColorStop(o, col); x.fillStyle = gr; x.fillRect(0, 0, 48, 48); return c; };
  const lumpy = (c) => { const x = c.getContext('2d'); x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) { const a = i * 0.7, d = 15 + (i % 3) * 3; x.fillStyle = 'rgba(0,0,0,0.3)'; x.beginPath(); x.arc(24 + Math.cos(a) * d, 24 + Math.sin(a) * d, 6, 0, 7); x.fill(); }
    return c; };
  const scorch = mkCanvas(64, 64), s = scorch.getContext('2d'), r = rng(77);
  const gr = s.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(14,11,9,0.95)'); gr.addColorStop(0.45, 'rgba(26,20,15,0.75)'); gr.addColorStop(0.8, 'rgba(40,32,24,0.3)'); gr.addColorStop(1, 'rgba(40,32,24,0)');
  s.fillStyle = gr; s.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 26; i++) {   // rays of soot thrown out, and a few bright grains of ash
    const a = r() * Math.PI * 2, d0 = 8 + r() * 6, d1 = 20 + r() * 11;
    s.strokeStyle = `rgba(16,12,10,${0.25 + r() * 0.3})`; s.lineWidth = 1 + r() * 2;
    s.beginPath(); s.moveTo(32 + Math.cos(a) * d0, 32 + Math.sin(a) * d0); s.lineTo(32 + Math.cos(a) * d1, 32 + Math.sin(a) * d1); s.stroke();
  }
  for (let i = 0; i < 30; i++) { s.fillStyle = r() < 0.5 ? 'rgba(120,110,100,0.5)' : 'rgba(8,6,5,0.6)'; s.fillRect(14 + r() * 36, 14 + r() * 36, 1, 1); }
  return {
    core: ball([[0, 'rgba(255,255,240,1)'], [0.35, 'rgba(255,240,180,0.85)'], [1, 'rgba(255,200,120,0)']]),
    hot: lumpy(ball([[0, 'rgba(255,248,200,1)'], [0.4, 'rgba(255,200,90,0.9)'], [0.75, 'rgba(255,120,30,0.55)'], [1, 'rgba(230,80,20,0)']])),
    fire: lumpy(ball([[0, 'rgba(255,170,60,1)'], [0.45, 'rgba(235,95,25,0.85)'], [0.8, 'rgba(150,40,15,0.45)'], [1, 'rgba(90,25,10,0)']])),
    soot: lumpy(ball([[0, 'rgba(46,38,34,1)'], [0.55, 'rgba(38,34,32,0.6)'], [1, 'rgba(30,28,28,0)']])),
    steam: lumpy(ball([[0, 'rgba(236,238,240,1)'], [0.5, 'rgba(225,228,232,0.5)'], [1, 'rgba(220,224,228,0)']])),
    dust: lumpy(ball([[0, 'rgba(178,160,128,1)'], [0.5, 'rgba(170,150,118,0.5)'], [1, 'rgba(160,140,110,0)']])),
    glow: ball([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]),
    scorch,
  };
}
function fxState() {
  if (!lookFxS || lookFxS.g !== G) lookFxS = { g: G, t: G.t, parts: [], debris: [], rings: [], scorch: [], steam: [], seen: new WeakSet(), acc: new Map(), built: new Map(), pics: (lookFxS && lookFxS.pics) || fxPics(), tinted: (lookFxS && lookFxS.tinted) || new Map() };
  return lookFxS;
}
// A glow picture in one colour (cached).
function fxTint(S, col) {
  let c = S.tinted.get(col);
  if (!c) { c = mkCanvas(48, 48); const x = c.getContext('2d'); x.drawImage(S.pics.glow, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, 48, 48); S.tinted.set(col, c); }
  return c;
}
const fxSeen = (x, y) => { const cx = (x / CELL) | 0, cy = (y / CELL) | 0; return cx >= 0 && cy >= 0 && cx < MAP && cy < MAP && G.seen[idx(cx, cy)]; };
const fxOwn = (e) => G.watching || (typeof alliedSides === 'function' ? alliedSides(e.team, G.me) : e.team === G.me);

// ---- Living structures: where the stacks and roofs are (from each type's voxel model, like look.js structLamps) ------
const ALIVE_STEAM = { refinery: 2, factory: 2, power: 2, apower: 3 };   // stacks that steam (at most)
const aliveCache = new Map();
function aliveSpots(type, faction) {
  const key = type + faction;
  if (aliveCache.has(key)) return aliveCache.get(key);
  const pal = palFor(faction), m = model('S' + type + pal.key, () => STRUCTURES[type](pal, faction)), top = topOf(m);
  let maxZ = 0, sx = 0, sy = 0, n = 0;
  for (let i = 0; i < top.length; i++) maxZ = Math.max(maxZ, top[i]);
  const cols = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) { const z = top[y * m.w + x]; if (z >= 0) { sx += x; sy += y; n++; } if (z >= Math.max(6, maxZ * 0.7)) cols.push([x + m.x0, y + m.y0, z]); }
  cols.sort((a, b) => b[2] - a[2]);
  const stacks = [];
  for (const [x, y, z] of cols) { if (stacks.length >= (ALIVE_STEAM[type] || 1)) break; if (stacks.every((p) => Math.hypot(p.x - x, p.y - y) > 9)) stacks.push({ x: x + 0.5, y: y + 0.5, z: z + 1 }); }
  const r = { stacks, maxZ, d: m.d, mid: { x: (n ? sx / n : m.w / 2) + m.x0, y: (n ? sy / n : m.h / 2) + m.y0 } };
  aliveCache.set(key, r);
  return r;
}
function producing(e) {
  const t = G.teams[e.team];
  if (!t || !t.queues || !fxOwn(e) || t.low) return false;
  for (const cat of CATEGORIES) {
    const list = t.queues[cat];
    if (!list || !list.length) continue;
    for (const it of Array.isArray(list) ? list : [list]) { if (!it || it.ready || it.stalled) continue; const d = defOf(it.type); if (d && d.producer === e.type) return true; }
  }
  return false;
}
// Drawn just after the structure (ui.js drawOne, inside its onHill: the world transform is already raised).
function lookAlive(g, e) {
  if (!LOOK.alive || !G || e.kind !== 'bld' || !e.alive) return;
  const S = fxState(), x = e.cx * CELL, y = e.cy * CELL, W = e.w * CELL, H = e.h * CELL, t = G.t;
  const up = g.upright;
  if (e.buildT < 1) {   // going up: a glowing plane in the team colour at the height the build has reached
    if (e.sellT > 0) return;
    const A = aliveSpots(e.type, e.faction), hb = A.d * VK * e.buildT + 3, col = palFor(e.faction).main;
    const pts = [[x, y], [x + W, y], [x + W, y + H], [x, y + H]].map(([px, py]) => liftPt(px, py, hb));
    g.save(); g.upright = false; g.globalCompositeOperation = 'lighter';
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath();
    g.globalAlpha = 0.18 + 0.08 * Math.sin(t * 20); g.fillStyle = col; g.fill();
    g.globalAlpha = 0.9; g.strokeStyle = col; g.lineWidth = 1.5; g.stroke();
    g.globalAlpha = 0.6; g.strokeStyle = '#fff'; g.lineWidth = 0.6; g.stroke();
    g.upright = true;
    const gl = fxTint(S, col);
    for (const p of pts) { g.globalAlpha = 0.8; g.drawImage(gl, p[0] - 5, p[1] - 5, 10, 10); }
    g.restore(); g.upright = up;
    return;
  }
  if (e.hp < e.maxHp * 0.3 || e.def.defense) return;   // (defences give off no light: owner)
  const A = aliveSpots(e.type, e.faction);
  g.save(); g.globalCompositeOperation = 'lighter'; g.upright = true;
  if (e.type === 'power' || e.type === 'apower') {   // the plant's glow breathing; it stutters on low power
    const low = G.teams[e.team] && G.teams[e.team].low, k = low ? (Math.sin(t * 23 + e.id) > 0.3 ? 0.25 : 0.05) : 0.5 + 0.5 * Math.sin(t * 2.4 + e.id);
    const col = e.faction === 'soviets' ? 'rgb(255,150,60)' : 'rgb(110,200,255)', gl = fxTint(S, col);
    for (const s of A.stacks) { const [px, py] = liftPt(x + s.x, y + s.y, (s.z - 3) * VK); g.globalAlpha = 0.25 + 0.5 * k; g.drawImage(gl, px - 7, py - 7, 14, 14); }
  }
  if (e.type === 'dome' && e.faction !== 'soviets') {   // a small dish turning on the roof (the Soviet dome has its own)
    g.globalCompositeOperation = 'source-over';
    const p = A.stacks[0] || { x: A.mid.x, y: A.mid.y, z: A.maxZ }, a = t * 2.2 + e.id, c = Math.cos(a), s = Math.sin(a);
    const [bx, by] = liftPt(x + p.x, y + p.y, p.z * VK), [mx, my] = liftPt(x + p.x, y + p.y, (p.z + 5) * VK);
    g.upright = false; g.strokeStyle = '#2a2d30'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(bx, by); g.lineTo(mx, my); g.stroke();
    // The dish as a short bar turned about the mast: its two rims and a lit face when it turns toward the camera.
    const [l0x, l0y] = liftPt(x + p.x - 5 * c, y + p.y - 5 * s, (p.z + 7) * VK), [l1x, l1y] = liftPt(x + p.x + 5 * c, y + p.y + 5 * s, (p.z + 7) * VK);
    g.strokeStyle = '#1e2124'; g.lineWidth = 4; g.beginPath(); g.moveTo(l0x, l0y); g.lineTo(l1x, l1y); g.stroke();
    g.strokeStyle = s > 0 ? '#d6dade' : '#8d9399'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(l0x, l0y); g.lineTo(l1x, l1y); g.stroke();
    g.upright = true; g.globalCompositeOperation = 'lighter';
    if (((t * 0.7 + e.id * 0.31) % 1) < 0.1) { const gl = fxTint(S, 'rgb(120,255,150)'); g.globalAlpha = 0.9; g.drawImage(gl, mx - 4, my - 4, 8, 8); }
  }
  if ((e.type === 'factory' || e.type === 'barracks' || e.type === 'helipad' || e.type === 'airfield') && producing(e)) {
    if (e.type === 'factory') {   // an amber beacon turning on the roof: a bright sweep twice a second
      const p = A.stacks[A.stacks.length - 1] || A.stacks[0] || { x: A.mid.x, y: A.mid.y, z: A.maxZ }, k = Math.pow(Math.max(0, Math.sin(t * Math.PI * 4 + e.id)), 3);
      const [px, py] = liftPt(x + p.x, y + p.y, (p.z + 1) * VK), gl = fxTint(S, 'rgb(255,170,40)');
      g.globalAlpha = 0.35 + 0.65 * k; g.drawImage(gl, px - 4 - 6 * k, py - 4 - 3 * k, 8 + 12 * k, 8 + 6 * k);
      g.globalAlpha = 1; g.fillStyle = '#ffd890'; g.fillRect(px - 0.75, py - 0.75, 1.5, 1.5);
    } else {   // a green lamp over the door, slow blink
      const [px, py] = liftPt(x + W * 0.55, y + H, 9 * VK), gl = fxTint(S, 'rgb(90,255,110)');
      g.globalAlpha = ((t * 1.2 + e.id * 0.17) % 1) < 0.5 ? 0.9 : 0.25; g.drawImage(gl, px - 4, py - 4, 8, 8);
    }
  }
  g.restore(); g.upright = up;
}

// ---- Bigger blasts and the per-frame update ---------------------------------------------------------------------------
// The update runs once a frame from look.js cliffItems (lookFxGround), which also draws what lies on the ground (scorch
// marks, shockwave rings) under the units; lookFxOver draws the rest over the units.
function fxBlast(S, x, y, h0, size, debris) {
  const r = Math.random, s = Math.max(4, Math.min(24, size)), big = s >= 10, lift = gLift(x, y);
  const P = S.parts, room = FX_MAX - P.length;
  if (room <= 0) return;
  P.push({ k: 'core', x, y, h: h0 + lift + s * 0.5, R: s * 1.7, t: 0, life: 0.14 + s * 0.006 });
  const nb = Math.min(room - 1, s < 7 ? 1 : big ? 3 + Math.round(s / 5) : 2);
  for (let i = 0; i < nb; i++) {   // the fireball: a few balls swelling, rising, cooling from yellow through orange to soot
    const a = r() * Math.PI * 2, d = r() * s * 0.5;
    P.push({ k: 'ball', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.7, h: h0 + lift + s * (0.2 + r() * 0.4), vh: s * (1.2 + r() * 1.4), R0: s * 0.6, R1: s * (1.3 + r() * 0.6), t: -r() * 0.06 * i, life: 0.55 + s * 0.03 + r() * 0.2 });
  }
  if (big) S.rings.push({ x, y, h: h0, R0: s * 0.6, R1: s * (4 + s * 0.12), t: 0, life: 0.45 + s * 0.012 });
  const dug = G.craters && G.craters.slice(-24).some((c) => Math.abs(c[0] - x) < 14 && Math.abs(c[1] - y - (size > 0 ? 0 : 0)) < 18);   // (a dug crater: its own picture, no soot over it)
  if ((debris || big) && h0 < 6 && !dug) {   // a scorch mark that outlasts the game's own crater
    if (S.scorch.length >= SCORCH_MAX) S.scorch.shift();
    S.scorch.push({ x, y, R: s * (1.7 + r() * 0.5), a: r() * Math.PI, t: 0, life: SCORCH_LIFE * (0.7 + 0.3 * Math.min(1, s / 18)) });
  }
  if (debris || big) {
    const nd = Math.min(DEBRIS_MAX - S.debris.length, Math.round(s * 0.55));
    for (let i = 0; i < nd; i++) {
      const a = r() * Math.PI * 2, sp = (25 + r() * 60) * (0.6 + s / 20);
      S.debris.push({ x, y, h: h0 + lift + 2, base: 0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vh: 50 + r() * 90 * (0.6 + s / 25), t: 0, life: 1.6 + r() * 1.4, hot: r() < 0.45, w: r() < 0.5 ? 3 : 2, rest: false });
    }
  }
  // The smoke that rolls up after it: handed to the look's smoke (look.js lookSmoke), which draws and moves it.
  if (big && LOOK.smoke && typeof lookSmokeS !== 'undefined' && lookSmokeS && lookSmokeS.g === G) {
    const n = Math.min(SMOKE_MAX - lookSmokeS.puffs.length, 1 + Math.round(s / 7));
    for (let i = 0; i < n; i++) lookSmokeS.puffs.push({ x: x + (r() - 0.5) * s, y: y + (r() - 0.5) * s * 0.6, h: h0 + lift + s * 0.8, r0: s * 0.4, r1: s * (1.4 + r() * 0.6), rise: 10 + r() * 10, t: -0.25 - r() * 0.2, life: 2.6 + r() * 1.6, a: 0.34, dark: true });
  }
}
function fxUpdate() {
  const S = fxState(), dt = Math.max(0, Math.min(0.1, G.t - S.t)), r = Math.random;
  S.t = G.t;
  // New explosions (the game's own 'expl' effects; a structure's death makes several, bigger ones).
  if (LOOK.blasts) {
    let n = 0;
    for (const fx of G.effects) {
      if (fx.type !== 'expl' || fx.t < 0 || S.seen.has(fx)) continue;
      S.seen.add(fx);
      if (fx.t > 0.2 || !fxSeen(fx.x, fx.y)) continue;
      if (n++ < BLASTS_PER_FRAME) fxBlast(S, fx.x, fx.y, fx.lift || 0, fx.size || 8, !!fx.debris);
    }
  }
  if (LOOK.alive) {   // steam from the stacks; a dust burst when a structure is finished
    const wind = typeof windNow === 'function' ? windNow() : { x: 10, y: 0 };
    for (const e of G.entities) {
      if (e.kind !== 'bld' || !e.alive) continue;
      const was = S.built.get(e.id);
      S.built.set(e.id, e.buildT);
      if (was !== undefined && was < 1 && e.buildT >= 1 && e.sellT <= 0 && fxSeen(e.x, e.y)) {
        const x0 = e.cx * CELL, y0 = e.cy * CELL, W = e.w * CELL, H = e.h * CELL, L = gLift(x0 + W / 2, y0 + H / 2);
        S.rings.push({ x: x0 + W / 2, y: y0 + H / 2, h: 0, R0: Math.max(W, H) * 0.5, R1: Math.max(W, H) * 0.95, t: 0, life: 0.7, dust: true });
        for (let i = 0; i < 6 + e.w * 3 && S.steam.length < STEAM_MAX; i++) {
          const side = i % 4, k = r(), px = side === 0 ? x0 + W * k : side === 1 ? x0 + W : side === 2 ? x0 + W * k : x0, py = side === 0 ? y0 : side === 1 ? y0 + H * k : side === 2 ? y0 + H : y0 + H * k;
          S.steam.push({ x: px, y: py, h: L + 2, r0: 4, r1: 13 + r() * 6, rise: 6 + r() * 6, vx: (px - x0 - W / 2) * 0.5, vy: (py - y0 - H / 2) * 0.5, t: 0, life: 1.2 + r() * 0.8, a: 0.5, dust: true });
        }
      }
      const ns = ALIVE_STEAM[e.type];
      if (!ns || e.buildT < 1 || e.sellT > 0 || e.hp < e.maxHp * 0.6 || !fxSeen(e.x, e.y)) continue;   // (below 60% the look's dark smoke takes over)
      const A = aliveSpots(e.type, e.faction), busy = e.type === 'factory' && producing(e), low = G.teams[e.team] && G.teams[e.team].low;
      const rate = (busy ? 2.4 : 1.1) * (low ? 0.3 : 1), L = gLift(e.cx * CELL + e.w * CELL / 2, e.cy * CELL + e.h * CELL / 2);
      A.stacks.forEach((s, i) => {
        const key = e.id * 8 + i; let a = (S.acc.get(key) || ((e.id * 0.37 + i * 0.5) % 1)) + rate * dt * (0.8 + 0.4 * Math.sin(G.t * 0.7 + i + e.id));
        while (a >= 1) { a -= 1; if (S.steam.length < STEAM_MAX) S.steam.push({ x: e.cx * CELL + s.x, y: e.cy * CELL + s.y, h: L + s.z * VK, r0: 2, r1: 8 + r() * 4, rise: 12 + r() * 6, vx: wind.x * 0.5, vy: wind.y * 0.5, t: 0, life: 1.8 + r() * 0.8, a: 0.42 }); }
        S.acc.set(key, a);
      });
    }
  }
  for (const p of S.parts) { p.t += dt; if (p.k === 'ball' && p.t > 0) { p.h += p.vh * dt; p.vh *= Math.pow(0.25, dt); } }
  if (S.parts.length && S.parts.some((p) => p.t > p.life)) S.parts = S.parts.filter((p) => p.t <= p.life);
  for (const d of S.debris) {
    d.t += dt;
    if (d.rest) continue;
    d.x += d.vx * dt; d.y += d.vy * dt; d.vh -= 330 * dt; d.h += d.vh * dt;
    const floor = gLift(d.x, d.y);
    if (d.h <= floor) { d.h = floor; if (Math.abs(d.vh) < 30) { d.rest = true; } else { d.vh = -d.vh * 0.35; d.vx *= 0.55; d.vy *= 0.55; } }
  }
  if (S.debris.length && S.debris[0].t > S.debris[0].life) S.debris = S.debris.filter((d) => d.t <= d.life);
  for (const g of S.rings) g.t += dt;
  if (S.rings.length && S.rings.some((g) => g.t > g.life)) S.rings = S.rings.filter((g) => g.t <= g.life);
  for (const m of S.scorch) m.t += dt;
  while (S.scorch.length && S.scorch[0].t > S.scorch[0].life) S.scorch.shift();
  for (const p of S.steam) { p.t += dt; const age = p.t / p.life; p.h += p.rise * dt * (1 - age * 0.5); p.x += p.vx * dt * (0.3 + age); p.y += p.vy * dt * (0.3 + age); }
  if (S.steam.length && S.steam.some((p) => p.t > p.life)) S.steam = S.steam.filter((p) => p.t <= p.life);
}
// From look.js cliffItems (the world transform set, before the sorted list): update, then scorch marks and rings.
function lookFxGround(g, x0, y0, x1, y1) {
  if (!G) return;
  const on = (x, y, m) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m + 60, up = g.upright, sm = g.imageSmoothingEnabled;
  g.upright = false; g.imageSmoothingEnabled = true;
  lookCraters(g, on);   // dug craters (world.js digCrater), under the scorch marks
  if (!(LOOK.blasts || LOOK.alive)) { g.upright = up; g.imageSmoothingEnabled = sm; return; }
  fxUpdate();
  const S = lookFxS;
  for (const m of S.scorch) {
    if (!LOOK.blasts || !on(m.x, m.y, m.R)) continue;
    const k = m.t / m.life, a = 0.8 * Math.min(1, m.t / 0.3) * (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
    onHill(g, m.x, m.y, () => { g.save(); g.translate(m.x, m.y); g.rotate(m.a); g.globalAlpha = a; g.drawImage(S.pics.scorch, -m.R, -m.R, m.R * 2, m.R * 2); g.restore(); });
  }
  for (const w of S.rings) {
    if (!(w.dust ? LOOK.alive : LOOK.blasts) || !on(w.x, w.y, w.R1)) continue;
    const k = w.t / w.life, e = 1 - Math.pow(1 - k, 2.2), R = w.R0 + (w.R1 - w.R0) * e;
    onHill(g, w.x, w.y, () => {
      g.beginPath(); g.ellipse(w.x, w.y, R, R, 0, 0, Math.PI * 2);
      if (w.dust) { g.strokeStyle = `rgba(170,150,118,${(0.45 * (1 - k)).toFixed(3)})`; g.lineWidth = 5 * (1 - k) + 1; g.stroke(); return; }
      g.strokeStyle = `rgba(150,130,100,${(0.35 * (1 - k)).toFixed(3)})`; g.lineWidth = 6 * (1 - k) + 1; g.stroke();   // the dust kicked up
      g.strokeStyle = `rgba(255,240,215,${(0.6 * Math.pow(1 - k, 1.5)).toFixed(3)})`; g.lineWidth = 1.6 * (1 - k) + 0.4; g.stroke();   // the pressure front
    });
  }
  g.upright = up; g.imageSmoothingEnabled = sm;
}
// From ui.js after lookSmoke: steam, fireballs, debris, over the units.
function lookFxOver(g) {
  if (!G || !lookFxS || lookFxS.g !== G) return;
  const S = lookFxS, up = g.upright; g.upright = true; g.imageSmoothingEnabled = true;
  if (LOOK.alive) for (const p of S.steam) {
    const age = p.t / p.life, R = p.r0 + (p.r1 - p.r0) * Math.sqrt(age), a = p.a * Math.min(1, p.t / 0.2) * (1 - age);
    if (a < 0.01) continue;
    const [wx, wy] = liftPt(p.x, p.y, p.h);
    g.globalAlpha = a; g.drawImage(p.dust ? S.pics.dust : S.pics.steam, wx - R, wy - R, R * 2, R * 2);
  }
  // Fireballs: soot under, flame over. Drawn normally (not added), so many at once stay fire-coloured, never white.
  if (LOOK.blasts) for (const p of S.parts) {
    if (p.k !== 'ball' || p.t < 0) continue;
    const k = p.t / p.life, R = p.R0 + (p.R1 - p.R0) * Math.sqrt(k), [wx, wy] = liftPt(p.x, p.y, p.h);
    if (k > 0.35) { g.globalAlpha = Math.min(1, (k - 0.35) * 3) * (1 - k) * 0.9; g.drawImage(S.pics.soot, wx - R * 1.1, wy - R * 1.1, R * 2.2, R * 2.2); }
    if (k < 0.75) { const f = 1 - k / 0.75; g.globalAlpha = f; g.drawImage(k < 0.25 ? S.pics.hot : S.pics.fire, wx - R, wy - R, R * 2, R * 2); }
  }
  if (LOOK.blasts) for (const d of S.debris) {
    const [wx, wy] = liftPt(d.x, d.y, d.h), fade = Math.min(1, (d.life - d.t) / 0.5);
    const hot = d.hot && d.t < 0.9;
    g.globalAlpha = fade; g.fillStyle = hot ? (d.t < 0.45 ? '#ffd27a' : '#e0702a') : '#26221e';
    g.fillRect(wx - d.w / 2, wy - 1, d.w, d.w > 2 ? 2 : 1.5);
  }
  // The flash at the heart, added: bright but short, and each one on its own.
  g.globalCompositeOperation = 'lighter';
  for (const p of S.parts) {
    if (p.k !== 'core' || !LOOK.blasts) continue;
    const k = p.t / p.life, [wx, wy] = liftPt(p.x, p.y, p.h), R = p.R * (0.7 + 0.5 * k);
    g.globalAlpha = 0.75 * (1 - k); g.drawImage(S.pics.core, wx - R, wy - R, R * 2, R * 2);
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.imageSmoothingEnabled = false; g.upright = up;
}
// From look.js drawLook: the blasts' light, through the same shade holes and 'lighten' glow as everything else
// (add(x, y, r, a, colour, height above the ground)).
function lookFxLights(add) {
  if (!LOOK.blasts || !lookFxS || lookFxS.g !== G) return;
  for (const p of lookFxS.parts) {
    if (p.t < 0) continue;
    const k = p.t / p.life, h = p.h - gLift(p.x, p.y);
    if (p.k === 'core') add(p.x, p.y, p.R * 9, 1 - k, 'warm', h);
    else if (k < 0.6) add(p.x, p.y, p.R1 * 4, 0.6 * (1 - k / 0.6), 'warm', h);
  }
}

// ---- Craters that dig the ground (world.js digCrater: rules, both modes; here only their look) ---------------------------
// lookDug: the raised ground's cached shape (look.js hillFits, per HILL_CH chunk) is forgotten round a new crater, so the
// ground there is drawn dipping. lookCraters (from lookFxGround, under the units): each crater in G.craters as a shaded bowl
// (the wall facing the low sun lit, the near wall in shadow, a raised lip of thrown earth), at the height of its rim.
function lookDug(x, y, r) {
  return;   // (the drawn ground's shape now leaves craters out: look.js gLift noDig; kept for world.js's call)
  if (typeof hillFits === 'undefined' || !hillFits || hillFits.g !== G) return;
  const N = HILL_CH;
  for (let gy = Math.floor((y - r) / N); gy <= Math.floor((y + r) / N); gy++) for (let gx = Math.floor((x - r) / N); gx <= Math.floor((x + r) / N); gx++) hillFits.m.delete(gy * 4096 + gx);
}
// The craters (original art; Tiberian Sun's craters, from the owner's screenshot, as a style reference only). Each picture
// is worked out pixel by pixel from a small height field, then lit like the hills: a star-shaped hollow (its edge pushed out
// in spikes of many lengths), grooves running out from the middle, a ragged rim of thrown earth or snow, and, in the big
// ones (rad >= 8), steps round a deeper middle. Each pixel is shaded by its slope toward the low sun (the screen's upper
// left, in world axes) and coloured from the ground's own tones (snow: white to slate blue; else dry earth to dark soil),
// with a fine grain, and a hard dithered edge: crisp, not a soft stain. Drawn 1:1 in world pixels, without smoothing.
// CRATER_VAR pictures per kind, each crater one of them by its position.
const CRATER_VAR = 4;
let craterPics = null;
function craterPic(v, snow, big) {
  const key = v + (snow ? 's' : 'g') + (big ? 'b' : '');
  if (!craterPics) craterPics = new Map();
  if (craterPics.has(key)) return craterPics.get(key);
  const Z = big ? 84 : 60, M = Z / 2, R0 = big ? 25 : 17, r = rng(1301 + v * 7919 + (big ? 77 : 0));
  // The edge: radius by angle, spikes of many lengths.
  const NS = 64, edge = new Float32Array(NS), grooveP = new Float32Array(NS);
  const spikes = []; for (let k = 0; k < 48; k++) spikes.push([r() * Math.PI * 2, 0.04 + r() * 0.05, 0.16 * (0.3 + r() * 0.7)]);
  for (let i = 0; i < NS; i++) {
    const a = i / NS * Math.PI * 2; let e = 1 + 0.08 * Math.sin(3 * a + v) + 0.06 * Math.sin(5 * a + v * 2);
    for (const [sa, w, l] of spikes) { let d = Math.abs(a - sa); d = Math.min(d, Math.PI * 2 - d); if (d < w) e += l * (1 - d / w) * (1 - d / w); }
    edge[i] = e; grooveP[i] = r();
  }
  const edgeAt = (a) => { const f = ((a / (Math.PI * 2)) % 1 + 1) % 1 * NS, i = Math.floor(f), t = f - i; return edge[i % NS] * (1 - t) + edge[(i + 1) % NS] * t; };
  const H = (x, y) => {
    const dx = x - M, dy = y - M, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx), E = edgeAt(a) * R0, q = d / E;
    let h;
    if (q < 1) {
      h = -(1 - q * q) * (big ? 7 : 5);
      if (big) h -= 2.5 * Math.max(0, 1 - q / 0.35) + 1.2 * (q < 0.62 ? 1 : 0) * Math.max(0, 1 - Math.abs(q - 0.62) * 8) * 0;
      if (big) h += 0.9 * Math.sin(q * Math.PI * 3.2) * (1 - q);   // steps round the middle
      h += (0.35 * Math.sin(a * 17 + v) + 0.25 * Math.sin(a * 29 + v * 3)) * q * edgeAt(a);   // grooves running out, uneven
    } else h = Math.max(0, 1.6 * (1 - (q - 1) / 0.45)) * (0.6 + 0.4 * Math.sin(a * 11 + v));   // the rim of thrown earth
    return h;
  };
  const sv = fromView(-1, -1), sl = Math.hypot(sv[0], sv[1]), lx = sv[0] / sl * 0.75, ly = sv[1] / sl * 0.75, lz = 0.66;
  const lit = snow ? [246, 250, 255] : [168, 146, 108], mid = snow ? [168, 184, 206] : [104, 86, 60], dark = snow ? [62, 78, 104] : [38, 31, 22];
  const c = mkCanvas(Z, Z), x = c.getContext('2d'), img = x.createImageData(Z, Z), D = img.data;
  for (let py = 0; py < Z; py++) for (let px = 0; px < Z; px++) {
    const dx = px + 0.5 - M, dy = py + 0.5 - M, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx), E = edgeAt(a) * R0, q = d / E;
    if (q > 1.3) continue;
    const h = H(px + 0.5, py + 0.5), gx = (H(px + 1.5, py + 0.5) - H(px - 0.5, py + 0.5)) / 2, gy = (H(px + 0.5, py + 1.5) - H(px + 0.5, py - 0.5)) / 2;
    const n = Math.hypot(gx, gy, 1), sh = (-gx * lx - gy * ly + lz) / n;   // light on this pixel's slope
    const grain = (r() - 0.5) * 0.12;
    let k = Math.max(0, Math.min(1, 0.62 + (sh - 0.66) * 2.6 + grain + (h < 0 ? h * 0.065 : 0)));   // 0 dark .. 1 lit: by slope to the sun, and darker deeper
    if (q >= 1) k = 0.7 + k * 0.3;   // the thrown earth or snow round it: pale, catching the light
    const col = k < 0.5 ? dark.map((v0, i) => v0 + (mid[i] - v0) * k * 2) : mid.map((v0, i) => v0 + (lit[i] - v0) * (k - 0.5) * 2);
    // Opacity: solid inside, the rim fading out in a hard dither (crisp, no soft blur).
    let al = q < 1 ? 1 : Math.max(0, 1 - (q - 1) / 0.3) * 0.7;
    if (al < 1) al = r() < al ? Math.min(1, 0.55 + al) : 0;
    const o = (py * Z + px) * 4; D[o] = col[0]; D[o + 1] = col[1]; D[o + 2] = col[2]; D[o + 3] = Math.round(al * (q < 1 ? 235 : 200));
  }
  x.putImageData(img, 0, 0);
  craterPics.set(key, c);
  return c;
}
function lookCraters(g, on) {
  if (!LOOK.craters || !G.craters || !G.craters.length) return;
  const snow = typeof mapTheme === 'function' && mapTheme(G.mapId) === 'snow', sm = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  for (const [x, y, rad] of G.craters) {
    if (!on(x, y, 50) || !fxSeen(x, y)) continue;
    const h = ((x * 73856093) ^ (y * 19349663)) >>> 0, [tx, ty] = liftPt(0, 0, gLift(x, y, true)), pic = craterPic(h % CRATER_VAR, snow, rad >= 8);   // at the drawn ground's height
    const s = rad >= 8 ? 0.85 + Math.min(0.4, (rad - 8) * 0.12) : 0.8 + (rad - 5) * 0.1, w = pic.width * s;   // (world.js digCrater's bowl: about this size)
    g.drawImage(pic, Math.round(x + tx - w / 2), Math.round(y + ty - w / 2), w, w);
  }
  g.imageSmoothingEnabled = sm;
}

// ---- Steel sidebar ----------------------------------------------------------------------------------------------------
const STEEL_CSS = `
body.lk-steel #sidebar, body.lk-steel #topstrip {
  --rv: radial-gradient(circle at 50% 50%, #a3a7ab 0 1px, #5a5e62 1.4px, #121314 2.2px, transparent 2.8px);
  --plate: repeating-linear-gradient(90deg, rgba(255,255,255,0.022) 0 1px, transparent 1px 3px),
           repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0 1px, transparent 1px 4px);
}
body.lk-steel:has(#sidebar[data-faction="soviets"]) #topstrip { --accent: #b3352b; }
body.lk-steel #sidebar {
  background: var(--rv) left 3px top 8px / 7px 34px repeat-y, var(--rv) right calc(var(--safe-r) + 3px) top 8px / 7px 34px repeat-y,
    var(--plate), linear-gradient(180deg, #303336, #222427 40%, #17181a);
  border: 0; border-left: 3px solid var(--accent);
  box-shadow: inset 2px 0 0 #0a0b0c, inset 3px 0 0 #5c6064, -2px 0 6px rgba(0,0,0,0.6);
}
body.lk-steel #topstrip {
  background: var(--rv) left 8px center / 30px 8px repeat-x, var(--plate), linear-gradient(180deg, #2c2f32, #191a1c);
  border-bottom: 2px solid var(--accent); box-shadow: 0 1px 0 #070809, 0 2px 5px rgba(0,0,0,0.55);
}
body.lk-steel .tab {
  background: linear-gradient(180deg, #4a4e52, #2d3033 55%, #1f2123); border: 2px solid; border-top: 0;
  border-color: #6c7075 #0d0e0f #0d0e0f #6c7075; color: #e2e2d6; text-shadow: 0 1px 0 #000;
}
body.lk-steel .credits { color: #f3d870; text-shadow: 0 0 6px rgba(240,190,60,0.45), 1px 1px 0 #000; }
body.lk-steel #clock { color: #a8e2a0; text-shadow: 0 0 6px rgba(120,230,120,0.4); }
body.lk-steel .sb-radar { position: relative; padding: 4px; background: linear-gradient(180deg, #121314, #2a2d30); border: 1px solid #000;
  box-shadow: inset 0 0 0 1px #4d5155, 0 0 0 1px var(--accent); }
body.lk-steel .sb-radar::before, body.lk-steel .sb-radar::after { content: ''; position: absolute; inset: 4px; pointer-events: none; }
body.lk-steel .sb-radar::before { background: repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0 1px, transparent 1px 3px); box-shadow: inset 0 0 14px rgba(0,0,0,0.85); z-index: 1; }
body.lk-steel .sb-radar::after { background: linear-gradient(180deg, transparent 0, rgba(140,255,160,0.10) 46%, rgba(170,255,190,0.18) 50%, transparent 54%) 0 0 / 100% 300% no-repeat;
  animation: lkScan 3.2s linear infinite; z-index: 2; }
@keyframes lkScan { from { background-position: 0 100%; } to { background-position: 0 0; } }
body.lk-steel #radar { border: 2px solid #050606; border-radius: 3px; }
#lkStatic { display: none; }
body.lk-steel #lkStatic { display: block; position: absolute; inset: 4px; width: calc(100% - 8px); height: calc(100% - 8px); pointer-events: none; z-index: 3; image-rendering: pixelated; }
body.lk-steel .icon, body.lk-steel .sb-arrows button {
  background: var(--rv) left 2px top 2px / 6px 6px no-repeat, var(--rv) right 2px top 2px / 6px 6px no-repeat,
    var(--rv) left 2px bottom 2px / 6px 6px no-repeat, var(--rv) right 2px bottom 2px / 6px 6px no-repeat,
    linear-gradient(180deg, #4d5155, #33363a 50%, #222427);
  border: 2px solid; border-color: #6d7276 #0c0d0e #0c0d0e #6d7276;
}
body.lk-steel .icon[aria-pressed="true"] { background: linear-gradient(180deg, var(--accent), #1d1f21); box-shadow: inset 0 0 8px rgba(0,0,0,0.6); }
body.lk-steel .strip { background: repeating-linear-gradient(45deg, #0a0b0c 0 6px, #0e0f10 6px 12px); box-shadow: inset 0 0 0 1px #000, inset 0 0 0 2px #3c4044; padding: 3px; }
body.lk-steel .cameo { border: 1px solid #000; box-shadow: none; }
body.lk-steel .cameo::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  box-shadow: inset 1px 1px 0 #8a8f94, inset -1px -1px 0 #1a1b1c, inset 0 0 0 2px #2c2f32, inset 0 -2px 0 2px var(--accent);
  background: var(--rv) left 1px top 1px / 6px 6px no-repeat, var(--rv) right 1px top 1px / 6px 6px no-repeat,
    linear-gradient(135deg, rgba(255,255,255,0.10), transparent 35%); }
body.lk-steel .power { border: 1px solid #000; box-shadow: inset 0 0 0 1px #4a4e52, 0 0 0 1px var(--accent); }
`;
let steelOn = null, radarStatic = null;
function lookSteel() {
  if (typeof document === 'undefined' || !document.body) return;
  const want = !!LOOK.sidebar;
  if (want === steelOn) return;
  steelOn = want;
  if (want && !document.getElementById('lkSteelCss')) { const st = document.createElement('style'); st.id = 'lkSteelCss'; st.textContent = STEEL_CSS; document.head.appendChild(st); }
  document.body.classList.toggle('lk-steel', want);
}
// From ui.js drawRadar (every 0.2 s): when the radar comes online, a burst of static over it for about a second.
function lookRadar(on) {
  lookSteel();
  if (!LOOK.sidebar || typeof document === 'undefined') return;
  const was = lookRadar.was;
  lookRadar.was = on;
  if (!on || was !== false) return;
  const box = document.querySelector('.sb-radar');
  if (!box) return;
  let c = document.getElementById('lkStatic');
  if (!c) { c = document.createElement('canvas'); c.id = 'lkStatic'; c.width = 64; c.height = 64; box.appendChild(c); }
  const x = c.getContext('2d'), t0 = performance.now(), D = 1100;
  cancelAnimationFrame(radarStatic);
  const step = () => {
    const k = (performance.now() - t0) / D;
    x.clearRect(0, 0, 64, 64);
    if (k >= 1) return;
    const img = x.createImageData(64, 64), a = Math.min(1, 1.6 * (1 - k)), band = (k * 90) % 64;
    for (let i = 0; i < 64 * 64; i++) {
      const v = Math.random() * 255, row = (i / 64) | 0, roll = Math.abs(row - band) < 3 ? 1.6 : 1;
      img.data[i * 4] = v * 0.75 * roll; img.data[i * 4 + 1] = Math.min(255, v * roll); img.data[i * 4 + 2] = v * 0.8 * roll; img.data[i * 4 + 3] = 255 * a * (0.55 + 0.45 * Math.random());
    }
    x.putImageData(img, 0, 0);
    radarStatic = requestAnimationFrame(step);
  };
  step();
}
if (typeof document !== 'undefined') { if (document.body) lookSteel(); else addEventListener('DOMContentLoaded', lookSteel); }
