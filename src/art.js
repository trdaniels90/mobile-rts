'use strict';
// Terrain painting, sprite drawing, effects and sidebar cameos. Units, structures and scenery
// come from the voxel models in models.js; this file puts them on screen.

function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Draws a pre-rendered sprite (and its cast shadow) with its origin at world (x, y).
function blit(g, s, x, y, shadow) {
  if (shadow !== false && s.sh) {
    g.globalAlpha = 0.45;
    g.drawImage(s.sh, Math.round(x + s.sox), Math.round(y + s.soy));
    g.globalAlpha = 1;
  }
  g.drawImage(s.img, Math.round(x + s.ox), Math.round(y + s.oy));
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------
const TERRAIN_MINI = ['#2f3d23', '#5a4c37', '#1c2a14', '#5e5a52', '#4a6a8a', '#6b5a3e'];

function paintTerrain(terr, seed, roads, bridges) {
  buildScenery();
  const c = mkCanvas(WORLD, WORLD), g = c.getContext('2d');
  const img = g.createImageData(WORLD, WORLD), d = img.data;
  const r = rng(seed);

  // Cell-centre fields, sampled bilinearly so dirt and shorelines blend across cells.
  const dirt = new Float32Array(NCELLS), water = new Float32Array(NCELLS);
  for (let i = 0; i < NCELLS; i++) { dirt[i] = terr[i] === 1 ? 1 : 0; water[i] = terr[i] >= 4 ? 1 : 0; }
  const nearFlag = new Uint8Array(NCELLS);
  for (let cy = 0; cy < MAP; cy++) for (let cx = 0; cx < MAP; cx++) {
    let f = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const x = cx + ox, y = cy + oy;
      if (x < 0 || y < 0 || x >= MAP || y >= MAP) continue;
      if (dirt[y * MAP + x]) f |= 1;
      if (water[y * MAP + x]) f |= 2;
    }
    nearFlag[cy * MAP + cx] = f;
  }
  const grid = (s) => { const w = Math.ceil(WORLD / s) + 2, a = new Float32Array(w * w); for (let i = 0; i < a.length; i++) a[i] = r(); return { a, w, s }; };
  const N1 = grid(10), N2 = grid(40), N3 = grid(160);
  const sm = (t) => t * t * (3 - 2 * t);
  function noise(N, x, y) {
    const fx = x / N.s, fy = y / N.s, x0 = fx | 0, y0 = fy | 0, w = N.w, a = N.a;
    const tx = sm(fx - x0), ty = sm(fy - y0);
    const p = a[y0 * w + x0], q = a[y0 * w + x0 + 1], s = a[(y0 + 1) * w + x0], t = a[(y0 + 1) * w + x0 + 1];
    return (p + (q - p) * tx) * (1 - ty) + (s + (t - s) * tx) * ty;
  }
  function bil(arr, fx, fy) {
    const x0 = Math.max(0, Math.min(MAP - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(MAP - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
    const a = arr[y0 * MAP + x0], b = arr[y0 * MAP + x0 + 1], cc = arr[(y0 + 1) * MAP + x0], dd = arr[(y0 + 1) * MAP + x0 + 1];
    return (a + (b - a) * tx) * (1 - ty) + (cc + (dd - cc) * tx) * ty;
  }
  // A 256-colour era look: a handful of tones per surface, picked with dithered noise.
  const GRASS = [[30, 40, 24], [38, 50, 29], [46, 60, 34], [56, 70, 40], [70, 84, 48]];
  const EARTH = [[66, 55, 39], [80, 67, 47], [96, 81, 57], [112, 95, 67]];
  const SANDS = [[124, 111, 82], [140, 126, 94], [156, 142, 108]];
  const WATER = [[52, 80, 108], [62, 92, 122], [74, 106, 138], [90, 122, 154]];
  const pickTone = (pal, v) => pal[Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length)))];
  let p = 0;
  for (let y = 0; y < WORLD; y++) {
    const fy = y / CELL - 0.5;
    for (let x = 0; x < WORLD; x++, p += 4) {
      const fx = x / CELL - 0.5;
      const h = noise(N1, x, y) * 0.35 + noise(N2, x, y) * 0.45 + noise(N3, x, y) * 0.2;
      const sp = r();
      let col = pickTone(GRASS, h * 1.1 - 0.12 + (sp - 0.5) * 0.55);
      if (sp > 0.992) col = GRASS[4];
      const near = nearFlag[Math.min(MAP - 1, Math.max(0, Math.round(fy))) * MAP + Math.min(MAP - 1, Math.max(0, Math.round(fx)))];
      const dv = near & 1 ? bil(dirt, fx, fy) + (h - 0.5) * 0.3 + (sp - 0.5) * 0.12 : 0;
      if (dv > 0.42) col = pickTone(EARTH, h * 1.2 - 0.1 + (sp - 0.5) * 0.6);
      const wv = near & 2 ? bil(water, fx, fy) + (h - 0.5) * 0.22 : 0;
      if (wv > 0.5) {
        const crest = ((x * 3 + y * 7 + Math.floor(noise(N1, x * 3, y) * 30)) % 23 === 0) && sp > 0.4;
        col = crest ? [150, 172, 190] : pickTone(WATER, 0.9 - (wv - 0.5) * 1.6 + (h - 0.5) * 0.5 + (sp - 0.5) * 0.4);
        if (wv < 0.545) col = sp > 0.35 ? [178, 192, 198] : [120, 140, 156];   // surf
      } else if (wv > 0.36) {
        col = pickTone(SANDS, (wv - 0.36) * 4 + (sp - 0.5) * 0.7);
        if (sp > 0.93) col = [92, 86, 74];                                   // pebbles
      }
      d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  // Wheel ruts along the roads.
  for (const road of roads || []) {
    if (road.length < 2) continue;
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [off, col, w] of [[-5, 'rgba(58,44,26,0.45)', 2], [5, 'rgba(58,44,26,0.45)', 2], [-4, 'rgba(170,150,110,0.18)', 1], [6, 'rgba(170,150,110,0.18)', 1]]) {
      g.strokeStyle = col; g.lineWidth = w;
      g.beginPath();
      road.forEach((pt, i) => {
        const a = road[Math.min(road.length - 1, i + 1)], b = road[Math.max(0, i - 1)];
        const dx = a.x - b.x, dy = a.y - b.y, l = Math.hypot(dx, dy) || 1;
        const x = pt.x - dy / l * off, y = pt.y + dx / l * off;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      });
      g.stroke();
    }
  }

  // Timber bridges over the lakes: stone abutments, plank deck, rails on posts.
  for (const b of bridges || []) {
    const dx = b.b.x - b.a.x, dy = b.b.y - b.a.y, L = Math.hypot(dx, dy), w = b.w;
    g.save();
    g.translate(b.a.x, b.a.y); g.rotate(Math.atan2(dy, dx));
    g.fillStyle = 'rgba(10,20,30,0.45)'; g.fillRect(4, -w / 2 + 6, L - 8, w);              // shadow on the water
    for (const x0 of [-6, L - 10]) { g.fillStyle = '#6f6a5e'; g.fillRect(x0, -w / 2 - 3, 16, w + 6); g.fillStyle = '#56524a'; g.fillRect(x0, w / 2 + 1, 16, 2); }
    for (let x = 6; x < L - 6; x += 22) { g.fillStyle = '#2e2418'; g.fillRect(x, -w / 2 + 1, 3, w + 6); }   // piles
    g.fillStyle = '#6b5638'; g.fillRect(0, -w / 2, L, w);
    for (let x = 0, i = 0; x < L; x += 3, i++) {
      g.fillStyle = ['#7a6342', '#634f33', '#705a3b', '#5a4730'][(i * 7 + (i >> 2)) % 4];
      g.fillRect(x, -w / 2 + 2, 2, w - 4);
    }
    g.fillStyle = '#3a2d1d'; g.fillRect(0, -w / 2, L, 2); g.fillRect(0, w / 2 - 2, L, 2);
    for (let x = 2; x < L; x += 10) { g.fillStyle = '#2a2015'; g.fillRect(x, -w / 2 - 1, 2, 3); g.fillRect(x, w / 2 - 2, 2, 3); }
    g.restore();
  }

  // Scenery stamps, back to front, shadows first.
  const stamps = [];
  for (let cy = 0; cy < MAP; cy++) {
    for (let cx = 0; cx < MAP; cx++) {
      const t = terr[cy * MAP + cx], x0 = cx * CELL, y0 = cy * CELL;
      if (t === 2) {
        const n = 1 + (r() < 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const pine = r() < 0.4;
          const set = pine ? scenery.pines : scenery.trees;
          stamps.push({ s: set[Math.floor(r() * set.length)], x: x0 + 4 + r() * 16, y: y0 + 6 + r() * 14 });
        }
      } else if (t === 3) {
        stamps.push({ s: scenery.rocks[Math.floor(r() * scenery.rocks.length)], x: x0 + 12 + (r() - 0.5) * 4, y: y0 + 13 + (r() - 0.5) * 4 });
      } else if (t === 0 && r() < 0.28 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => terr[(cy + oy) * MAP + cx + ox] === 4)) {
        stamps.push({ s: scenery.rocks[Math.floor(r() * scenery.rocks.length)], x: x0 + r() * CELL, y: y0 + r() * CELL });
      } else if (t === 0 && r() < 0.035) {
        stamps.push({ k: 'bush', x: x0 + r() * CELL, y: y0 + r() * CELL });
      }
    }
  }
  stamps.sort((a, b) => a.y - b.y);
  for (const s of stamps) if (s.s) { g.globalAlpha = 0.45; g.drawImage(s.s.sh, Math.round(s.x + s.s.sox), Math.round(s.y + s.s.soy)); g.globalAlpha = 1; }
  for (const s of stamps) {
    if (s.s) { g.drawImage(s.s.img, Math.round(s.x + s.s.ox), Math.round(s.y + s.s.oy)); continue; }
    const x = Math.round(s.x), y = Math.round(s.y);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 1, y + 1, 5, 2);
    g.fillStyle = '#1f2e15'; g.fillRect(x - 2, y - 2, 5, 3);
    g.fillStyle = '#304a1d'; g.fillRect(x - 1, y - 3, 3, 2);
    g.fillStyle = '#46632a'; g.fillRect(x - 1, y - 3, 1, 1);
  }
  return c;
}

// Permanent marks burnt into the terrain: a crater with a lit rim and scattered soot.
function scorch(tg, x, y, rad, seed) {
  const r = rng(seed);
  for (let i = 0; i < rad * 5; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad * 1.3;
    tg.fillStyle = r() < 0.5 ? 'rgba(18,14,10,0.28)' : 'rgba(40,32,24,0.28)';
    tg.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d * 0.8), 2, 1);
  }
  if (rad > 7) {
    tg.fillStyle = 'rgba(20,16,12,0.45)';
    tg.beginPath(); tg.ellipse(x, y, rad * 0.45, rad * 0.32, 0, 0, 7); tg.fill();
    tg.strokeStyle = 'rgba(150,130,100,0.25)'; tg.lineWidth = 1;
    tg.beginPath(); tg.ellipse(x + 0.5, y + 0.5, rad * 0.5, rad * 0.36, 0, 0.2, 2.6); tg.stroke();
  }
}
// Shell crater: thrown-out earth, a raised rim, a dark pit whose far wall catches the light.
function crater(tg, x, y, rad, seed) {
  const r = rng(seed), ry = rad * 0.7;
  const oval = (cx, cy, rx, ryy, col) => { tg.fillStyle = col; tg.beginPath(); tg.ellipse(cx, cy, rx, ryy, 0, 0, 7); tg.fill(); };
  for (let i = 0; i < rad * 6; i++) {
    const a = r() * Math.PI * 2, d = rad * (0.9 + r() * 0.9);
    tg.fillStyle = r() < 0.5 ? 'rgba(92,74,52,0.55)' : 'rgba(58,46,32,0.55)';
    tg.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y + Math.sin(a) * d * 0.7), r() < 0.3 ? 2 : 1, 1);
  }
  oval(x, y, rad, ry, 'rgba(106,88,62,0.6)');
  oval(x - rad * 0.08, y - ry * 0.06, rad * 0.78, ry * 0.76, 'rgba(30,24,17,0.78)');
  oval(x + rad * 0.2, y + ry * 0.08, rad * 0.48, ry * 0.44, 'rgba(84,67,48,0.5)');
  oval(x - rad * 0.06, y, rad * 0.36, ry * 0.3, 'rgba(16,12,8,0.6)');
}
// A burnt-out wreck painted into the ground, so it stays for the rest of the battle.
function bakeWreck(tg, x, y, def, face, tface, noTurret) {
  const fake = { def, face, tface, load: 0 }, seed = (Math.random() * 1e6) | 0;
  const hs = hullSprite(fake, BURNT);
  if (hs.sh) { tg.globalAlpha = 0.45; tg.drawImage(hs.sh, Math.round(x + hs.sox), Math.round(y + hs.soy)); tg.globalAlpha = 1; }
  tg.drawImage(charred(hs.img, seed), Math.round(x + hs.ox), Math.round(y + hs.oy));
  const ts = !noTurret && turretSprite(fake, BURNT);
  if (ts) tg.drawImage(charred(ts.img, seed + 1), Math.round(x + ts.ox), Math.round(y - TURRET_Z[def.draw] * VK + ts.oy));
}
// A turret blown off by a cook-off, charred, at its height above the ground and turned by rot.
function turretImg(fx) {
  if (!fx.img) fx.img = charred(turretSprite({ def: fx.def, tface: fx.tface }, BURNT).img, fx.seed);
  return fx.img;
}
function drawTurretAt(g, fx, z) {
  const img = turretImg(fx);
  g.save(); g.translate(Math.round(fx.x), Math.round(fx.y - z - 3)); g.rotate(fx.rot);
  g.drawImage(img, -Math.round(img.width / 2), -Math.round(img.height / 2));
  g.restore();
}
function bakeTurret(tg, fx) {
  tg.fillStyle = 'rgba(0,0,0,0.35)';
  tg.beginPath(); tg.ellipse(fx.x + 2, fx.y + 1, 9, 4, 0, 0, 7); tg.fill();
  drawTurretAt(tg, fx, 0);
}
// A fallen soldier: the unit's own sprite tipped onto its side, a shade darker, over a dark stain.
function bakeCorpse(tg, u, seed, angle) {
  const r = rng(seed), s = infSprite({ type: u.type, faction: u.faction, face: u.face }, palFor(u.faction), 0);
  const a = angle !== undefined ? angle : (r() < 0.5 ? -1 : 1) * (Math.PI / 2) + (r() - 0.5) * 0.5, side = Math.sin(a) >= 0 ? 1 : -1;
  const x = Math.round(u.x), y = Math.round(u.y);
  tg.fillStyle = 'rgba(70,14,10,0.5)';
  tg.beginPath(); tg.ellipse(x + side * 6, y + 1, 6 + r() * 2, 3, 0, 0, 7); tg.fill();
  tg.fillStyle = 'rgba(0,0,0,0.28)';
  tg.beginPath(); tg.ellipse(x + side * 7, y + 2, 9, 3, 0, 0, 7); tg.fill();
  tg.save();
  tg.translate(x, y + 1); tg.rotate(a);
  const img = dimmed(s.img);
  tg.drawImage(img, Math.round(s.ox), Math.round(s.oy));
  tg.restore();
}
// A ragdoll's body, drawn limb by limb from its joints in the uniform's colours (and its
// loose weapon), nearest the camera last.
const cssOf = (c) => typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c;
function drawRagBody(g, fx) {
  const pal = palFor(fx.faction), K = infKit(pal, fx.faction), P = fx.P, burnt = fx.burnt;
  const tunic = burnt ? BURNT.main : pal.main, sleeve = burnt ? BURNT.dark : cssOf(shadeInt(pal.main, 0.86));
  const pants = burnt ? BURNT.deep : cssOf(K.pants), skin = burnt ? '#3a2e26' : K.skin;
  const head = fx.unitType === 'pilot' ? '#cfcab8' : fx.unitType === 'grenadier' ? '#5d6236' : cssOf(K.helm);
  const X = (i) => P[i * 3], Y = (i) => P[i * 3 + 1] - P[i * 3 + 2], Zk = (i) => P[i * 3 + 2] * 4 + P[i * 3 + 1];
  const parts = [];
  const seg = (i, j, w, col) => parts.push({ k: (Zk(i) + Zk(j)) / 2, f: (dark) => pxLine(g, X(i), Y(i), X(j), Y(j), dark ? w + 1 : w, dark ? '#16120e' : col) });
  seg(2, 7, 2, pants); seg(7, 9, 2, pants); seg(2, 8, 2, pants); seg(8, 10, 2, pants);
  seg(1, 2, 3, tunic); seg(3, 4, 2, tunic); seg(3, 5, 1, sleeve); seg(4, 6, 1, sleeve);
  if (fx.gun) {
    const q = fx.gun.P, rk = fx.unitType === 'rocket';
    parts.push({ k: (q[2] + q[5]) * 2 + (q[1] + q[4]) / 2, f: (dark) => pxLine(g, q[0], q[1] - q[2], q[3], q[4] - q[5], (rk ? 2 : 1) + (dark ? 1 : 0), dark ? '#16120e' : rk ? '#56603a' : C.gun) });
  }
  parts.sort((a, b) => a.k - b.k);
  for (const p of parts) p.f(true);
  for (const p of parts) p.f(false);
  // Boots, hands, then the head with its helmet on the side away from the neck.
  g.fillStyle = '#121210';
  for (const i of [9, 10]) g.fillRect(Math.round(X(i) - 1), Math.round(Y(i) - 1), 2, 2);
  g.fillStyle = skin;
  for (const i of [5, 6]) g.fillRect(Math.round(X(i)), Math.round(Y(i)), 1, 1);
  const hx = X(0), hy = Y(0), ux = hx - X(1), uy = hy - Y(1), ul = Math.hypot(ux, uy) || 1;
  g.fillStyle = '#16120e'; g.fillRect(Math.round(hx - 2), Math.round(hy - 2), 4, 4);
  g.fillStyle = skin; g.fillRect(Math.round(hx - 1.5), Math.round(hy - 1.5), 3, 3);
  g.fillStyle = burnt ? BURNT.light : head;
  g.fillRect(Math.round(hx + ux / ul * 1.2 - 1.5), Math.round(hy + uy / ul * 1.2 - 1.5), 3, 2);
}
// A pool of blood spreading from under the chest: a few overlapping blots, darker at the edge,
// with a glint of wet highlight. k runs from 0 (just started) to 1 (full size).
function drawPool(g, fx, k) {
  const P = fx.P, pl = fx.pool, r = rng(pl.seed), s = pl.r * (1 - (1 - k) * (1 - k));
  if (s < 0.6) return;
  // Centred under the chest but running out to one side, as blood pools away from a body.
  const cx = (P[3] + P[6]) / 2 * 0.6 + P[6] * 0.4 + Math.cos(pl.a) * s * 0.75, cy = (P[4] + P[7]) / 2 * 0.6 + P[7] * 0.4 + Math.sin(pl.a) * s * 0.55;
  const blots = [];
  for (let i = 0; i < 6; i++) blots.push([(r() - 0.5) * s * 1.1, (r() - 0.5) * s * 0.7, s * (0.45 + r() * 0.45)]);
  for (const [col, grow] of [['rgba(54,6,6,0.88)', 0.7], ['rgba(106,14,10,0.9)', 0]]) {
    g.fillStyle = col;
    for (const [ox, oy, rr] of blots) { g.beginPath(); g.ellipse(cx + ox, cy + oy, rr + grow, (rr + grow) * 0.62, 0, 0, 7); g.fill(); }
  }
  g.fillStyle = 'rgba(190,70,60,0.5)';
  g.fillRect(Math.round(cx - s * 0.3), Math.round(cy - s * 0.25), s > 3 ? 2 : 1, 1);
}
// Pixel-crisp line with a square brush.
function pxLine(g, x0, y0, x1, y1, w, col) {
  g.fillStyle = col;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let k = 0; k <= n; k++) {
    const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n;
    g.fillRect(Math.round(x - w / 2), Math.round(y - w / 2), w, w);
  }
}
// A settled ragdoll painted into the ground for good: a dark stain, then the body a shade dimmer.
function bakeRagdoll(tg, fx) {
  const P = fx.P, cx = Math.round(P[6]), cy = Math.round(P[7]), R = 26;
  if (fx.pool) drawPool(tg, fx, 1);
  else {   // a scorched patch under a burnt body
    tg.fillStyle = 'rgba(20,16,12,0.45)';
    tg.beginPath(); tg.ellipse((P[3] + P[6]) / 2, (P[4] + P[7]) / 2 + 1, 5, 3, Math.atan2(P[4] - P[7], P[3] - P[6]), 0, 7); tg.fill();
  }
  const c = mkCanvas(R * 2, R * 2), g = c.getContext('2d');
  g.translate(R - cx, R - cy); drawRagBody(g, fx);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(20,16,12,0.28)'; g.fillRect(0, 0, R * 2, R * 2);
  tg.drawImage(c, cx - R, cy - R);
}
function dimmed(img) {
  const c = mkCanvas(img.width, img.height), g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(20,16,12,0.28)'; g.fillRect(0, 0, c.width, c.height);
  return c;
}

// Blackened, soot-streaked copy of a sprite, with a few rust patches.
function charred(img, seed) {
  const r = rng(seed), c = mkCanvas(img.width, img.height), g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(22,18,14,0.62)'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < c.width * c.height / 14; i++) {
    const v = r();
    g.fillStyle = v < 0.5 ? 'rgba(8,6,4,0.55)' : v < 0.8 ? 'rgba(96,52,26,0.45)' : 'rgba(120,112,100,0.3)';
    g.fillRect((r() * c.width) | 0, (r() * c.height) | 0, 1 + (r() * 2 | 0), 1);
  }
  return c;
}

// Worn earth around a structure, like the dirt aprons of classic bases.
function bibDecal(tg, x, y, w, h, seed) {
  const r = rng(seed), M = 9;
  const tones = ['#42382a', '#4f4331', '#5c4e39', '#695a42'];
  for (let py = y - M; py < y + h + M; py++) for (let px = x - M; px < x + w + M; px++) {
    const dx = Math.max(x - px, 0, px - (x + w - 1)), dy = Math.max(y - py, 0, py - (y + h - 1));
    const dd = Math.hypot(dx, dy) / M;
    if (r() < 1.05 - dd * 1.1) { tg.fillStyle = tones[Math.floor(r() * 4)]; tg.fillRect(px, py, 1, 1); }
  }
}
function rubble(tg, x, y, w, h, seed) {
  const r = rng(seed), cx = x + w / 2, cy = y + h / 2;
  for (let i = 0; i < (w * h) / 9; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    const px = cx + Math.cos(a) * d * w * 0.5, py = cy + Math.sin(a) * d * h * 0.5;
    tg.fillStyle = d < 0.6 ? 'rgba(28,24,20,0.35)' : 'rgba(40,34,26,0.2)';
    tg.fillRect(Math.round(px), Math.round(py), 3, 2);
  }
  for (let i = 0; i < (w * h) / 30; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.8;
    const px = Math.round(cx + Math.cos(a) * d * w * 0.5), py = Math.round(cy + Math.sin(a) * d * h * 0.5), s = 1 + Math.floor(r() * 3);
    tg.fillStyle = 'rgba(0,0,0,0.4)'; tg.fillRect(px + 1, py + 1, s + 1, s);
    tg.fillStyle = ['#7d7a71', '#5b5850', '#949086', '#6b5440', '#8f8c84'][Math.floor(r() * 5)];
    tg.fillRect(px, py, s + 1, s);
    tg.fillStyle = 'rgba(255,255,255,0.18)'; tg.fillRect(px, py, s + 1, 1);
  }
  // A few twisted girders.
  tg.strokeStyle = 'rgba(60,50,40,0.8)'; tg.lineWidth = 1;
  for (let i = 0; i < Math.max(2, w / 24); i++) {
    const sx = x + 6 + r() * (w - 12), sy = y + 6 + r() * (h - 12);
    tg.beginPath(); tg.moveTo(sx, sy); tg.lineTo(sx + (r() - 0.5) * 14, sy + (r() - 0.5) * 8); tg.stroke();
  }
}

// ---------------------------------------------------------------------------
// Units & structures
// ---------------------------------------------------------------------------
function flash(g, x, y, s) {
  g.fillStyle = 'rgba(255,200,80,0.55)';
  g.beginPath(); g.arc(x, y, s + 1.5, 0, 7); g.fill();
  g.fillStyle = '#fff8d8'; g.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
  g.fillStyle = 'rgba(255,220,120,0.9)'; g.fillRect(Math.round(x - s - 1), Math.round(y), s * 2 + 2, 1); g.fillRect(Math.round(x), Math.round(y - s - 1), 1, s * 2 + 2);
}

// Soldiers standing about fidget: they look around, rest or shoulder their weapons, check
// their sights, stretch, juggle a grenade and, after a long quiet spell, drop for push-ups.
// Purely for show, timed from game time and each soldier's id.
const IDLES = {
  rifle: ['look', 'rest', 'aim', 'stretch', 'look', 'pushups', 'none'],
  rocket: ['look', 'rest', 'stretch', 'look', 'pushups', 'none'],
  grenadier: ['look', 'juggle', 'rest', 'stretch', 'pushups', 'none'],
  pilot: ['look', 'rest', 'stretch', 'none'],
};
function idlePose(u, t) {
  if (u.moving || u.stance || u.target || u.fireT > 0 || u.chute > 0 || u.alt > 0) { u.idleFrom = t; return null; }
  if (u.idleFrom === undefined) u.idleFrom = t;
  const still = t - u.idleFrom;
  if (still < 3) return null;
  const CY = 8, off = hash3(u.id, 3, 7) * CY, tt = still + off, cyc = Math.floor(tt / CY), ct = tt % CY;
  const list = IDLES[u.type] || IDLES.rifle;
  let kind = list[Math.floor(hash3(u.id, cyc, 11) * list.length)];
  if (kind === 'pushups' && still < 15) kind = 'look';
  const dur = kind === 'pushups' ? 5.5 : kind === 'stretch' ? 2 : 2.5 + hash3(u.id, cyc, 5) * 2.5;
  if (ct > dur || kind === 'none') return null;
  switch (kind) {
    case 'look': return { frame: 0, turn: Math.sin(ct * 1.7) * 0.8 };
    case 'rest': return { frame: 6 };
    case 'aim': return { frame: ct < 0.4 || ct > dur - 0.4 ? 6 : 7 };
    case 'stretch': return { frame: 10 };
    case 'juggle': return { frame: Math.floor(ct / 0.4) % 2 ? 3 : 0 };
    case 'pushups': return { frame: ct < 0.5 || ct > dur - 0.4 ? 5 : Math.floor((ct - 0.5) / 0.45) % 2 ? 9 : 8 };
  }
  return null;
}
function drawUnit(g, u, t) {
  const pal = palFor(u.faction);
  if (u.cls === 'inf') {
    const stance = !u.moving && u.stance;
    let frame = stance === 'prone' ? 5 : stance === 'crouch' ? 4 : u.type === 'grenadier' && u.fireT > 0.12 ? 3 : u.moving ? 1 + (Math.floor(u.anim / 4) % 2) : 0;
    if (u.chute > 0) { drawChute(g, u, pal, t); return; }
    const idle = idlePose(u, t);
    if (idle) { frame = idle.frame; if (idle.turn) u = { type: u.type, faction: u.faction, face: u.face + idle.turn, x: u.x, y: u.y }; }
    blit(g, infSprite(u, pal, frame), u.x, u.y);
    const mh = stance === 'prone' ? 2 : stance === 'crouch' ? 6 : 11, mr = stance === 'prone' ? 12 : 10;
    if (u.fireT > 0) flash(g, u.x + Math.cos(u.face) * mr, u.y + Math.sin(u.face) * mr - mh, 1);
    return;
  }
  if (u.cls === 'air') {
    const alt = u.alt || 0, hgt = alt / VK, s = hullSprite(u, pal);
    if (s.sh) { g.globalAlpha = 0.38; g.drawImage(s.sh, Math.round(u.x + hgt * SHADOW_DX + s.sox), Math.round(u.y + hgt * SHADOW_DY + s.soy)); g.globalAlpha = 1; }
    blit(g, s, u.x, u.y - alt, false);
    if (u.def.fly === 'heli') {
      // The rotor turns faster than any screen can show, so each frame it advances as far as it
      // can without seeming to run backwards (under half the gap between blades, whatever the
      // frame rate) and the blur of the arc it swept fills in the rest.
      const n = u.type === 'hind' ? 5 : 4, gap = Math.PI * 2 / n, flying = alt > 1;
      const rz = (u.type === 'hind' ? 10 : 9) * VK, rx = u.x, ry = u.y - alt - rz, R = u.type === 'hind' ? 15 : 13;
      const dtf = u.rotT === undefined ? 0 : Math.min(0.1, Math.max(0, t - u.rotT));
      const step = Math.min((flying ? 80 : 6) * dtf, gap * 0.42);
      u.rotT = t; u.rotA = (u.rotA === undefined ? u.id : u.rotA) + step;
      g.fillStyle = flying ? 'rgba(40,40,36,0.26)' : 'rgba(0,0,0,0)';
      g.beginPath(); g.ellipse(rx, ry, R, R * 0.92, 0, 0, 7); g.fill();
      g.lineWidth = 1.2;
      const trails = flying ? 4 : 1;
      for (let c = trails - 1; c >= 0; c--) {
        g.strokeStyle = `rgba(28,28,24,${c ? 0.32 * (1 - c / trails) : 0.85})`;
        g.beginPath();
        for (let k = 0; k < n; k++) {
          const a = u.rotA - c * step / trails * 1.6 + k * gap;
          g.moveTo(rx, ry); g.lineTo(rx + Math.cos(a) * R, ry + Math.sin(a) * R * 0.92);
        }
        g.stroke();
      }
    } else if (u.moving) {
      const bx = u.x - Math.cos(u.face) * 15, by = u.y - alt - 2 + -Math.sin(u.face) * 15;
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,210,110,0.9)' : 'rgba(255,140,50,0.9)';
      g.beginPath(); g.arc(bx, by, 1.6, 0, 7); g.fill();
    }
    if (u.fireT > 0) flash(g, u.x + Math.cos(u.face) * 10, u.y - alt + Math.sin(u.face) * 10, 2);
    // Parked: ammunition pips fill up as the ground crew rearms it.
    // Repairs under way: the same blinking green cross as structures.
    if (u.repairing && Math.floor(t * 3) % 2) {
      const cx = Math.round(u.x), cy = Math.round(u.y - 14);
      g.fillStyle = '#000'; g.fillRect(cx - 4, cy - 4, 9, 9);
      g.fillStyle = '#3ed04a'; g.fillRect(cx - 3, cy - 1, 7, 3); g.fillRect(cx - 1, cy - 3, 3, 7);
    }
    // Yellow: main weapon, blue: air-to-air missiles, grey: bombs.
    if (u.as === 'landed' && u.def.weapon) {
      const loads = [[u.def.weapon.ammo, u.ammo, '#e8c64a'], [u.def.weapon2 ? u.def.weapon2.ammo : 0, u.aam || 0, '#9cc8ff'], [u.def.bombs || 0, u.bombs || 0, '#b8b6aa']];
      const n = loads.reduce((s, l) => s + l[0], 0), x0 = Math.round(u.x - n * 1.5), y0 = Math.round(u.y + 9);
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x0 - 1, y0 - 1, n * 3 + 1, 4);
      let i = 0;
      for (const [max, have, col] of loads) for (let j = 0; j < max; j++, i++) { g.fillStyle = j < have ? col : '#4a4436'; g.fillRect(x0 + i * 3, y0, 2, 2); }
    }
    return;
  }
  blit(g, hullSprite(u, pal), u.x, u.y);
  const ts = turretSprite(u, pal);
  if (ts) {
    const z = TURRET_Z[u.def.draw] * VK, off = u.def.draw === 'jeep' ? -3 : -1;
    const tx = u.x + Math.cos(u.face) * off, ty = u.y + Math.sin(u.face) * off - z;
    blit(g, ts, tx, ty, false);
    if (u.fireT > 0) {
      const len = u.def.size.tur ? u.def.size.tur + u.def.size.barrel : 8;
      flash(g, tx + Math.cos(u.tface) * len, ty + Math.sin(u.tface) * len - 1.5, u.def.draw === 'jeep' ? 1 : 2);
    }
  }
}

// Paratrooper on the way down: shadow on the ground, swaying canopy above.
function drawChute(g, u, pal, t) {
  const h = u.chute * 26, sway = Math.sin(t * 2.4 + u.id) * 2, x = u.x + sway, y = u.y - h;
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath(); g.ellipse(u.x, u.y, 6, 3, 0, 0, 7); g.fill();
  blit(g, infSprite(u, pal, 0), x, y);
  const cy = y - 31;
  g.strokeStyle = '#2a2620'; g.lineWidth = 0.8;
  g.beginPath();
  for (const dx of [-9, -4, 4, 9]) { g.moveTo(x + dx, cy + 1); g.lineTo(x + dx * 0.15, y - 18); }
  g.stroke();
  g.fillStyle = '#d9d2bc';
  g.beginPath(); g.ellipse(x, cy, 10, 7, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#a69d82';
  g.beginPath(); g.ellipse(x, cy, 10, 2, 0, 0, Math.PI); g.fill();
  g.fillRect(Math.round(x - 1), Math.round(cy - 7), 2, 7);
}

// Burnt-out wreck: the same model with charred paint.
function drawHusk(g, fx) {
  const fake = { def: fx.def, face: fx.face, tface: fx.tface, load: 0 };
  g.globalAlpha = Math.min(1, (1 - fx.t / fx.life) * 4);
  blit(g, hullSprite(fake, BURNT), fx.x, fx.y);
  const ts = turretSprite(fake, BURNT);
  if (ts) blit(g, ts, fx.x, fx.y - TURRET_Z[fx.def.draw] * VK, false);
  g.globalAlpha = 1;
}

function drawStructure(g, b, t) {
  const s = structureSprite(b.type, b.faction);
  const x = b.cx * CELL, y = b.cy * CELL;
  let k = b.buildT;
  if (b.sellT > 0) k = Math.min(k, b.sellT / 1.2);
  if (k < 1) {
    // Build-up: the structure rises out of its foundation behind a scaffold line.
    const H = s.img.height, hh = Math.max(1, Math.round(H * k));
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, y, b.w * CELL, b.h * CELL);
    g.drawImage(s.img, 0, H - hh, s.img.width, hh, Math.round(x + s.ox), Math.round(y + s.oy + H - hh), s.img.width, hh);
    g.fillStyle = '#d8b13a'; g.fillRect(x, Math.round(y + s.oy + H - hh), b.w * CELL, 1);
    return;
  }
  blit(g, s, x, y);
  const head = HEADS[b.type];
  if (head) {
    const hx = x + head[1], hy = y + head[2] - head[3] * VK;
    blit(g, headSprite(b.type, b.faction, b.tface), hx, hy, false);
    if (b.fireT > 0) flash(g, hx + Math.cos(b.tface) * 14, hy + Math.sin(b.tface) * 14 - 2, 2);
  }
  if ((b.type === 'pillbox' || b.type === 'ftur') && b.fireT > 0) {
    const m = muzzle(b);
    if (b.type === 'ftur') { g.fillStyle = 'rgba(255,140,40,0.85)'; g.beginPath(); g.arc(m.x, m.y, 4 + Math.random() * 2, 0, 7); g.fill(); }
    else flash(g, m.x, m.y, 2);
  }
  if (b.type === 'tesla' && b.charge > 0) {
    g.fillStyle = `rgba(140,190,255,${0.25 + 0.45 * b.charge})`;
    g.beginPath(); g.arc(x + 12, y + 35 - 50 * VK, 7 + Math.random() * 3, 0, 7); g.fill();
  }
  if (b.repairing && Math.floor(t * 3) % 2) {
    const cx = Math.round(b.x), cy = Math.round(y + 4);
    g.fillStyle = '#000'; g.fillRect(cx - 4, cy - 4, 9, 9);
    g.fillStyle = '#3ed04a'; g.fillRect(cx - 3, cy - 1, 7, 3); g.fillRect(cx - 1, cy - 3, 3, 7);
  }
}

function drawGhost(g, type, faction, cx, cy) {
  const s = structureSprite(type, faction);
  g.globalAlpha = 0.55;
  g.drawImage(s.img, Math.round(cx * CELL + s.ox), Math.round(cy * CELL + s.oy));
  g.globalAlpha = 1;
}

function drawOre(g, cx, cy, amount, gem) {
  const lv = amount >= 190 ? 3 : amount >= 120 ? 2 : amount >= 60 ? 1 : 0;
  blit(g, (gem ? scenery.gem : scenery.ore)[lv][(cx * 7 + cy * 13) & 3], cx * CELL, cy * CELL);
}

// ---------------------------------------------------------------------------
// Effects: pre-rendered fireballs, smoke puffs and flames
// ---------------------------------------------------------------------------
const EXPL_FRAMES = 16;
const explCache = new Map();
function explFrames(size) {
  if (explCache.has(size)) return explCache.get(size);
  const r = rng(size * 31 + 7);
  const D = Math.ceil(size * 2.6) + 6;
  const NG = 4, GW = Math.ceil(D / NG) + 2, grid = new Float32Array(GW * GW);
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  const fine = new Float32Array(D * D);
  for (let i = 0; i < fine.length; i++) fine[i] = r();
  const noise = (x, y) => {
    const fx = x / NG, fy = y / NG, x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
    const a = grid[y0 * GW + x0], b = grid[y0 * GW + x0 + 1], c = grid[(y0 + 1) * GW + x0], d = grid[(y0 + 1) * GW + x0 + 1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
  const frames = [];
  for (let f = 0; f < EXPL_FRAMES; f++) {
    const prog = f / (EXPL_FRAMES - 1);
    const c = mkCanvas(D, D), g = c.getContext('2d'), img = g.createImageData(D, D), d = img.data;
    const R = size * (0.4 + 0.8 * Math.sqrt(prog)), cx = D / 2, cy = D / 2 + size * 0.15 - prog * size * 0.55;
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
      const n = noise(x + f * 0.6, y + f * 1.3) * 0.75 + fine[y * D + x] * 0.25;
      const dd = Math.hypot(x - cx, (y - cy) * 1.12) / R;
      const v = 1 - dd + (n - 0.5) * 0.7;
      if (v <= 0) continue;
      const heat = v * 1.7 - prog * 1.55;
      let col, a = 255;
      if (heat > 1.05) col = [255, 250, 214];
      else if (heat > 0.8) col = [255, 224, 112];
      else if (heat > 0.55) col = [255, 168, 48];
      else if (heat > 0.32) col = [236, 104, 32];
      else if (heat > 0.14) col = [176, 58, 22];
      else {
        const gr = 38 + n * 46 + (1 - dd) * 12;
        col = [gr, gr * 0.96, gr * 0.9];
        a = Math.min(255, v * 520) * (1 - prog * 0.85);
      }
      const o = (y * D + x) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = a;
    }
    g.putImageData(img, 0, 0);
    frames.push(c);
  }
  explCache.set(size, frames);
  return frames;
}
const puffCache = [];
function puff(rad, light) {
  const key = rad * 2 + (light ? 1 : 0);
  if (puffCache[key]) return puffCache[key];
  const D = rad * 2 + 2, c = mkCanvas(D, D), g = c.getContext('2d'), img = g.createImageData(D, D), d = img.data, r = rng(rad * 13 + (light ? 5 : 0));
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
    const dx = x + 0.5 - D / 2, dy = y + 0.5 - D / 2, dd = Math.hypot(dx, dy) / rad;
    const v = 1 - dd + (r() - 0.5) * 0.35;
    if (v <= 0) continue;
    const lit = 1 + (-dx - dy) / (rad * 2.4);                // brighter toward the sun
    const base = light ? 196 : 74;
    const o = (y * D + x) * 4;
    d[o] = base * lit; d[o + 1] = base * lit * 0.97; d[o + 2] = base * lit * 0.92; d[o + 3] = Math.min(255, v * 400);
  }
  g.putImageData(img, 0, 0);
  puffCache[key] = c;
  return c;
}
const flameFrames = (() => {
  const out = [];
  for (let f = 0; f < 4; f++) {
    const c = mkCanvas(7, 12), g = c.getContext('2d'), r = rng(f * 9 + 1);
    for (let y = 0; y < 12; y++) {
      const w = Math.max(0, Math.round((y / 12) * 3.5 + (r() - 0.5) * 2));
      for (let x = 3 - w; x <= 3 + w; x++) {
        const hot = 1 - Math.abs(x - 3) / (w + 1) + (y / 12) * 0.6;
        g.fillStyle = hot > 1.2 ? '#fff4b0' : hot > 0.95 ? '#ffd050' : hot > 0.7 ? '#ff9228' : '#d8461a';
        g.fillRect(x, y, 1, 1);
      }
    }
    out.push(c);
  }
  return out;
})();

function drawEffect(g, fx) {
  const k = fx.t / fx.life;
  switch (fx.type) {
    case 'expl': {
      const size = fx.size < 8 ? 7 : fx.size < 12 ? 11 : fx.size < 16 ? 15 : 22;
      const frames = explFrames(size), f = frames[Math.min(EXPL_FRAMES - 1, Math.floor(k * EXPL_FRAMES))];
      g.drawImage(f, Math.round(fx.x - f.width / 2), Math.round(fx.y - f.height / 2));
      if (fx.debris && k < 0.8) {
        const r = rng(fx.seed);
        g.fillStyle = '#2a2622';
        for (let i = 0; i < 10; i++) {
          const a = r() * Math.PI * 2, v = (0.5 + r()) * fx.size * 1.8;
          g.fillRect(Math.round(fx.x + Math.cos(a) * v * k), Math.round(fx.y + Math.sin(a) * v * k * 0.7 - Math.sin(k * Math.PI) * fx.size), 2, 1);
        }
      }
      break;
    }
    case 'flakburst': {
      // A flash, then several overlapping black puffs spreading out and thinning.
      const r = rng(fx.seed);
      if (fx.t < 0.12) { g.fillStyle = 'rgba(255,190,90,0.85)'; g.beginPath(); g.arc(fx.x, fx.y, 3 + fx.t * 20, 0, 7); g.fill(); }
      g.globalAlpha = Math.max(0, 0.9 * (1 - k * k));
      for (let i = 0; i < 4; i++) {
        const ox = (r() - 0.5) * 8 * (0.5 + k), oy = (r() - 0.5) * 6 * (0.5 + k), rad = Math.max(2, Math.min(14, Math.round((2.5 + r() * 2) * (0.7 + k * 1.6))));
        const pc = puff(rad, false);
        g.drawImage(pc, Math.round(fx.x + ox - pc.width / 2), Math.round(fx.y + oy - pc.height / 2));
      }
      g.globalAlpha = 1;
      break;
    }
    case 'smoke': {
      const rad = Math.max(1, Math.min(14, Math.round(fx.r * (0.6 + k * 1.3))));
      const light = fx.color === '#c9c7c0' || fx.color === '#9a968c' || fx.color === '#8a7650';
      const pc = puff(rad, light);
      g.globalAlpha = Math.max(0, (fx.alpha || 0.55) * (1 - k));
      g.drawImage(pc, Math.round(fx.x - pc.width / 2), Math.round(fx.y - pc.height / 2));
      g.globalAlpha = 1;
      break;
    }
    case 'fire': {
      const f = flameFrames[Math.floor(fx.t * 12 + (fx.x | 0)) % 4];
      g.globalAlpha = Math.min(1, (1 - k) * 3);
      g.drawImage(f, Math.round(fx.x - 3), Math.round(fx.y - 11));
      g.globalAlpha = 1;
      break;
    }
    case 'tracer': {
      g.globalAlpha = 1 - k;
      g.strokeStyle = '#ffe48a'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(fx.x, fx.y); g.lineTo(fx.x2, fx.y2); g.stroke();
      g.fillStyle = '#fffbe0'; g.fillRect(Math.round(fx.x2 - 1), Math.round(fx.y2 - 1), 2, 2);
      g.globalAlpha = 1;
      break;
    }
    case 'spark': {
      g.fillStyle = k < 0.5 ? '#fff4c0' : '#ffaa40';
      g.fillRect(Math.round(fx.x - 1), Math.round(fx.y - 1), 2, 2);
      break;
    }
    case 'tesla': {
      const r = rng(fx.seed + Math.floor(fx.t * 30));
      g.globalAlpha = 1 - k * 0.6;
      for (let pass = 0; pass < 3; pass++) {
        g.strokeStyle = pass === 2 ? '#ffffff' : pass === 1 ? 'rgba(150,200,255,0.9)' : 'rgba(80,130,255,0.35)';
        g.lineWidth = pass === 2 ? 1 : pass === 1 ? 2 : 5;
        g.beginPath(); g.moveTo(fx.x, fx.y);
        const n = 9;
        for (let i = 1; i < n; i++) {
          const tt = i / n;
          g.lineTo(fx.x + (fx.x2 - fx.x) * tt + (r() - 0.5) * 11, fx.y + (fx.y2 - fx.y) * tt + (r() - 0.5) * 11);
        }
        g.lineTo(fx.x2, fx.y2); g.stroke();
      }
      g.globalAlpha = 1;
      break;
    }
    case 'corpse': {
      g.globalAlpha = Math.min(1, (1 - k) * 3);
      const pal = FACTIONS[fx.faction].pal;
      const x = Math.round(fx.x), y = Math.round(fx.y);
      g.fillStyle = 'rgba(90,20,14,0.7)'; g.fillRect(x - 3, y + 1, 5, 2);
      g.fillStyle = '#3a3d2c'; g.fillRect(x - 4, y - 1, 3, 2);
      g.fillStyle = pal.dark; g.fillRect(x - 1, y - 2, 4, 3);
      g.fillStyle = C.skin; g.fillRect(x + 3, y - 2, 2, 2);
      g.globalAlpha = 1;
      break;
    }
    case 'husk': drawHusk(g, fx); break;
    case 'ragdoll': {
      if ((fx.stagger && fx.stagger.t > 0) || fx.shock > 0) {
        // Still on his feet: staggering in flames, or jerking under a Tesla bolt.
        const fr = fx.shock > 0 ? (Math.random() < 0.5 ? 3 : 0) : 1 + (Math.floor(fx.t * 8) % 2);
        const jx = fx.shock > 0 ? (Math.random() - 0.5) * 2 : 0;
        blit(g, infSprite({ type: fx.unitType, faction: fx.faction, face: fx.face }, palFor(fx.faction), fr), fx.x + jx, fx.y);
        break;
      }
      const z = fx.P[8];
      if (fx.pool) drawPool(g, fx, Math.min(1, fx.pool.t / fx.pool.dur));
      else { g.fillStyle = `rgba(0,0,0,${0.3 / (1 + z / 20)})`; g.beginPath(); g.ellipse(fx.P[6], fx.P[7] + 1, 6, 2.5, 0, 0, 7); g.fill(); }
      drawRagBody(g, fx);
      break;
    }
    case 'turret': {
      const sh = 0.4 / (1 + fx.z / 25);
      g.fillStyle = `rgba(0,0,0,${sh})`; g.beginPath(); g.ellipse(fx.x, fx.y + 1, 7, 3, 0, 0, 7); g.fill();
      drawTurretAt(g, fx, fx.z);
      break;
    }
    case 'flare': {
      // A burning flare: a flickering white-hot core in an orange glow, trailing a smoke streak
      // that lingers and drifts after it.
      const a = Math.max(0, 1 - k), tr = fx.trail || [];
      for (let i = 1; i < tr.length; i++) {
        const q = i / tr.length;
        g.strokeStyle = `rgba(214,210,200,${0.5 * q * (0.4 + 0.6 * a)})`; g.lineWidth = 1 + (1 - q) * 1.5;
        g.beginPath(); g.moveTo(tr[i - 1].x, tr[i - 1].y); g.lineTo(tr[i].x, tr[i].y); g.stroke();
      }
      if (a <= 0) break;
      const fl = 0.75 + Math.random() * 0.25;
      g.fillStyle = `rgba(255,150,40,${0.22 * a * fl})`; g.beginPath(); g.arc(fx.x, fx.y, 7, 0, 7); g.fill();
      g.fillStyle = `rgba(255,190,80,${0.45 * a * fl})`; g.beginPath(); g.arc(fx.x, fx.y, 4, 0, 7); g.fill();
      g.fillStyle = `rgba(255,252,235,${a})`; g.fillRect(Math.round(fx.x - 1.5), Math.round(fx.y - 1.5), 3, 3);
      break;
    }
    case 'crash': {
      // A downed aircraft tumbling toward its shadow. Its roll squashes the sprite across the
      // line of flight (wings edge-on), upside down it shows its darker belly.
      const fake = { def: fx.def, face: fx.face, faction: fx.faction }, s = hullSprite(fake, palFor(fx.faction)), hgt = fx.alt / VK;
      const sq = Math.max(0.2, Math.abs(Math.cos(fx.roll || 0))), inv = Math.cos(fx.roll || 0) < 0;
      const squash = (x, y) => { g.translate(x, y); g.rotate(fx.face); g.scale(1, sq); g.rotate(-fx.face); };
      if (s.sh) {
        g.save(); squash(fx.x + hgt * SHADOW_DX, fx.y + hgt * SHADOW_DY);
        g.globalAlpha = 0.3; g.drawImage(s.sh, Math.round(s.sox), Math.round(s.soy)); g.restore();
      }
      g.save(); squash(fx.x, fx.y - fx.alt);
      if (inv) g.filter = 'brightness(0.55)';
      g.drawImage(s.img, Math.round(s.ox), Math.round(s.oy)); g.restore();
      if (!fx.jet && !fx.ground) {   // the rotor still turning, losing speed
        const rz = 9 * VK, ra = fx.t * 25;
        g.strokeStyle = 'rgba(28,28,24,0.75)'; g.lineWidth = 1.2; g.beginPath();
        for (let i = 0; i < 2; i++) { const a = ra + i * Math.PI / 2; g.moveTo(fx.x - Math.cos(a) * 13, fx.y - fx.alt - rz - Math.sin(a) * 12); g.lineTo(fx.x + Math.cos(a) * 13, fx.y - fx.alt - rz + Math.sin(a) * 12); }
        g.stroke();
      }
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,170,60,0.85)' : 'rgba(255,110,30,0.85)';
      g.beginPath(); g.arc(fx.x + (Math.random() - 0.5) * 6, fx.y - fx.alt + (Math.random() - 0.5) * 4, 2.5 + Math.random() * 2, 0, 7); g.fill();
      if (fx.ground) {   // sparks off the belly as it scrapes along
        g.fillStyle = 'rgba(255,220,140,0.9)';
        for (let i = 0; i < 3; i++) g.fillRect(Math.round(fx.x - fx.vx * 0.04 * (1 + i) + (Math.random() - 0.5) * 8), Math.round(fx.y - fx.vy * 0.04 * (1 + i) + (Math.random() - 0.5) * 4), 1, 1);
      }
      break;
    }
    case 'eject': {
      // The seat and pilot riding the rocket up, flame beneath.
      const hgt = fx.alt / VK, y = fx.y - fx.alt;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(fx.x + hgt * SHADOW_DX, fx.y + hgt * SHADOW_DY, 3, 2, 0, 0, 7); g.fill();
      if (fx.t < 0.3) {
        g.fillStyle = 'rgba(255,200,90,0.9)'; g.beginPath(); g.ellipse(fx.x, y + 6, 1.6, 3.5 + Math.random() * 2, 0, 0, 7); g.fill();
      }
      g.fillStyle = '#2b2b27'; g.fillRect(Math.round(fx.x - 2.5), Math.round(y - 1), 5, 5);
      blit(g, infSprite({ type: 'pilot', faction: fx.faction, face: fx.face }, palFor(fx.faction), 4), fx.x, y + 3, false);
      break;
    }
    case 'frag': {
      // A loose piece of wreckage: shadow below, the piece turning as it flies.
      const hgt = fx.alt / VK, fade = Math.min(1, (fx.life - fx.t) / 1.5);
      g.globalAlpha = fade;
      if (fx.alt > 0.5) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(Math.round(fx.x + hgt * SHADOW_DX - fx.w / 2), Math.round(fx.y + hgt * SHADOW_DY), Math.ceil(fx.w), 1); }
      g.save(); g.translate(fx.x, fx.y - fx.alt); g.rotate(fx.rot); g.scale(1, 0.6 + 0.4 * Math.abs(Math.cos(fx.rot * 1.7)));
      g.fillStyle = fx.color; g.fillRect(-fx.w / 2, -fx.h / 2, fx.w, fx.h);
      if (fx.burning && fx.t < 3) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,170,60,0.9)' : 'rgba(255,110,30,0.9)'; g.fillRect(-1, -1, 2, 2); }
      g.restore(); g.globalAlpha = 1;
      break;
    }
    case 'ring': {
      g.globalAlpha = 1 - k;
      g.strokeStyle = fx.color; g.lineWidth = 1;
      const rr = 3 + k * 9;
      g.strokeRect(Math.round(fx.x - rr), Math.round(fx.y - rr * 0.7), Math.round(rr * 2), Math.round(rr * 1.4));
      g.globalAlpha = 1;
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Sidebar cameos: close-up renders of each unit and structure
// ---------------------------------------------------------------------------
const cameoCache = new Map();
function cameoURL(type, faction) {
  const key = type + faction;
  if (cameoCache.has(key)) return cameoCache.get(key);
  const W = 64, H = 48, c = mkCanvas(W, H), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#26313b'); grd.addColorStop(0.5, '#46525c'); grd.addColorStop(0.52, '#4c5530'); grd.addColorStop(1, '#262c16');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  const pal = palFor(faction);
  let mdl, angle = -0.55, scale;
  const power = type.startsWith('pw:') && type.slice(3);
  if (power) {
    mdl = power === 'spy' ? jetModel(pal, faction === 'soviets') : cargoModel(pal, power === 'bomb');
    scale = power === 'spy' ? 1.6 : 1.05;
  } else if (BUILD_DEFS[type]) {
    mdl = STRUCTURES[type](pal, faction);
    angle = 0;
    const d = BUILD_DEFS[type], fw = d.w * CELL + 4, fh = d.h * CELL + mdl.d * VK;
    scale = Math.min(1.3, (W - 2) / fw, (H - 2) / fh);
  } else {
    const d = UNIT_DEFS[type];
    if (d.cls === 'inf') mdl = infModel(pal, faction, type, 0);
    else if (d.draw === 'tank') mdl = tankHull(pal, d.size);
    else if (d.draw === 'jeep') mdl = jeepModel(pal);
    else if (d.draw === 'harv') mdl = harvModel(pal, true);
    else if (d.draw === 'fob') mdl = fobModel(pal);
    else if (d.draw === 'arty') mdl = artyModel(pal);
    else if (d.draw === 'v2') mdl = v2Model(pal, true);
    else if (d.fly === 'heli') mdl = type === 'hind' ? hindModel(pal) : heliModel(pal);
    else mdl = jetModel(pal, type === 'mig');
    scale = d.cls === 'inf' ? 3.2 : d.fly === 'jet' ? 1.75 : d.fly ? 1.7 : d.size && d.size.len > 22 ? 1.9 : 2.3;
  }
  const s = renderVox(mdl, angle, { scale, shadow: false });
  const dx = Math.round((W - s.img.width) / 2), dy = Math.round((H - s.img.height) / 2 + (BUILD_DEFS[type] ? 0 : 3) - (power ? 6 : 0));
  g.drawImage(s.img, dx, dy);
  if (power === 'para') {
    for (const [x, y] of [[14, 36], [30, 40], [46, 35]]) {
      g.fillStyle = '#e4ddc6'; g.beginPath(); g.ellipse(x, y - 5, 6, 4, 0, Math.PI, 0); g.fill();
      g.strokeStyle = '#3a352c'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x - 5, y - 5); g.lineTo(x, y + 1); g.lineTo(x + 5, y - 5); g.stroke();
      g.fillStyle = '#2c3020'; g.fillRect(x - 1, y, 2, 4);
    }
  } else if (power === 'bomb') {
    g.fillStyle = '#1d1f18';
    for (const [x, y] of [[22, 34], [30, 39], [38, 44]]) { g.fillRect(x - 1, y - 3, 3, 6); g.fillStyle = '#5a5c4c'; g.fillRect(x - 1, y - 3, 1, 3); g.fillStyle = '#1d1f18'; }
  } else if (power === 'spy') {
    g.strokeStyle = 'rgba(160,230,140,0.7)'; g.lineWidth = 1;
    g.beginPath(); g.arc(W / 2, H / 2 + 8, 12, 0.2, Math.PI - 0.2); g.stroke();
  }
  // Tanks get their turret in the cameo too.
  const d = !power && UNIT_DEFS[type];
  if (d && (d.draw === 'tank' || d.draw === 'jeep')) {
    const tm = d.draw === 'tank' ? tankTurret(pal, d.size) : mgModel();
    const ts = renderVox(tm, angle, { scale, shadow: false });
    const z = TURRET_Z[d.draw] * VK * scale, off = (d.draw === 'jeep' ? -3 : -1) * scale;
    const ox = dx - s.ox * scale, oy = dy - s.oy * scale;
    g.drawImage(ts.img, Math.round(ox + Math.cos(angle) * off + ts.ox * scale), Math.round(oy + Math.sin(angle) * off - z + ts.oy * scale));
  }
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeRect(0.5, 0.5, W - 1, H - 1);
  const url = c.toDataURL();
  cameoCache.set(key, url);
  return url;
}
