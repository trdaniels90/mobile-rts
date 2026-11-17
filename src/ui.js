'use strict';
// Rendering, input, sidebar and menus.
(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const radar = $('radar'), rctx = radar.getContext('2d');
  const view = mkCanvas(64, 64), vctx = view.getContext('2d');
  // One pixel per cell: remade when a battle is on a map of another size (afterNewWorld).
  let shroudCanvas, sctx, shroudImg, miniTerrain, mtctx;
  const mapPictures = () => {
    if (shroudCanvas && shroudCanvas.width === MAP) return;
    shroudCanvas = mkCanvas(MAP, MAP); sctx = shroudCanvas.getContext('2d'); shroudImg = sctx.createImageData(MAP, MAP);
    miniTerrain = mkCanvas(MAP, MAP); mtctx = miniTerrain.getContext('2d');
  };
  mapPictures();
  const ui = {
    sidebar: $('sidebar'), credits: $('credits'), powerBar: $('powerBar'), topstrip: $('topstrip'),
    stripL: $('stripL'), stripR: $('stripR'), strips: document.querySelector('.sb-strips'),
    autoBtn: $('autoBtn'), allyBtn: $('allyBtn'), giveBtn: $('giveBtn'), returnBtn: $('returnBtn'), autoLabel: document.querySelector('#autoBtn small'), menuBtn: $('menuBtn'), clock: $('clock'),
    eva: $('eva'), selbar: $('selbar'), selName: $('selName'), selHp: $('selHp'), selBtns: $('selBtns'),
    placebar: $('placebar'), placeText: $('placeText'), placeOk: $('placeOk'), placeCancel: $('placeCancel'),
    menu: $('menu'), menuTitle: $('menuTitle'), menuSub: $('menuSub'),
    startBtn: $('startBtn'), resumeBtn: $('resumeBtn'), quitBtn: $('quitBtn'), boxBtn: $('boxBtn'),
  };
  const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  document.body.classList.toggle('touch', isTouch);

  let W = 0, H = 0, DPR = 1;            // game view size in CSS px
  const cam = { x: 0, y: 0, z: 1.5 };
  let faction = 'allies', diffKey = 'normal', boxMode = false;
  try {
    faction = localStorage.getItem('ps-faction') || 'allies';
    diffKey = localStorage.getItem('ps-diff') || 'normal';
  } catch (_) {}
  if (!FACTIONS[faction]) faction = 'allies';
  if (!DIFFICULTY[diffKey]) diffKey = 'normal';
  // Which side the human plays: 0, or 1 with ?side=1 in the address (for testing "either side
  // can be you" ahead of PvP; the computer takes the other).
  let mySide = 0;
  try { if (new URLSearchParams(location.search).get('side') === '1') mySide = 1; } catch (_) {}


  // ---------------------------------------------------------------------------
  // EVA messages
  // ---------------------------------------------------------------------------
  let evaTimer = null;
  function eva(msg) {
    Sound.say(msg);
    if (/complete|ready/i.test(msg)) Sound.play('ready');
    ui.eva.textContent = msg;
    ui.eva.hidden = false;
    ui.eva.classList.remove('show'); void ui.eva.offsetWidth; ui.eva.classList.add('show');
    clearTimeout(evaTimer);
    evaTimer = setTimeout(() => { ui.eva.hidden = true; }, 2400);
  }
  // Lines the player can trigger over and over by tapping: at most once every few seconds.
  const calmUntil = {};
  function evaCalm(msg, secs) {
    const now = performance.now();
    if (now < (calmUntil[msg] || 0)) return;
    calmUntil[msg] = now + secs * 1000;
    eva(msg);
  }
  hooks.eva = eva;
  hooks.gameOver = (won) => {
    Report.end(won);
    if (mission) { SaveGame.clear(); mission = false; }
    const vs = online, how = G.over.how;
    const ending = how === 'quit' ? (won ? ' · they surrendered' : ' · you surrendered') : how === 'left' ? (won ? ' · they left' : ' · you left') : how === 'out' ? ' · your side was beaten' : '';
    setTimeout(() => {
      G.paused = true;
      Debrief.open(won, {
        difficulty: vs ? 'Online vs ' + vs.opponent + ending : DIFFICULTY[diffKey].label,
        // a win against the computer goes on the leaderboard: a 1 v 1 skirmish, or two-player online co-op (its own
        // board, scored as a team; three-player co-op has none yet)
        extra: won && (vs ? vs.coop === 'board' : !teamGame()) ? Leaderboard.nameBox(Report.score(vs ? Report.teamStats() : G.teams[G.me].stats, G.over.t, vs ? vs.diff : diffKey)) : null,
        // same side and difficulty; online, back to the lobby page
        onRematch: vs ? () => { Net.rematch(); startGame(); showMenu('start'); Online.open(faction); } : () => { endPlace(); startMission(); hideMenu(); eva('Select a structure to build'); },
        onNew: () => { if (vs) { Net.leave(); startGame(); } showMenu('start'); },
      });
      Sound.say(won ? 'Mission accomplished' : 'Mission failed');
    }, 2200);
  };
  // Battle sounds are louder on screen, fade with distance and pan left or right.
  // Screen shake from big explosions: full strength on screen, fading off it.
  let shakeAmp = 0;
  const calmMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  hooks.shake = (x, y, amp) => {
    if (calmMotion) amp *= 0.25;
    const hw = W / cam.z / 2, hh = H / cam.z / 2;
    [x, y] = toView(x, y);
    const d = Math.max(Math.abs((x - (cam.x + hw)) / hw), Math.abs((y - (cam.y + hh)) / hh));
    const k = d <= 1 ? 1 : Math.max(0, 1 - (d - 1) * 0.8);
    shakeAmp = Math.min(12, Math.max(shakeAmp, amp * k));
  };
  hooks.sfx = (name, x, y) => {
    if (!G) return;
    const hw = W / cam.z / 2, hh = H / cam.z / 2;
    [x, y] = toView(x, y);
    const dx = (x - (cam.x + hw)) / hw, dy = (y - (cam.y + hh)) / hh;
    // d: 1 at the screen edge, 2 one screen beyond it, and so on. Off-screen fighting fades
    // but never goes silent, panned toward the side it is on.
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    const pan = d <= 1 ? dx * 0.6 : (dx / d) * 0.85;
    Sound.play(name, d <= 1 ? 1 : 1 / (1 + (d - 1) * 1.3), pan, d);
  };
  // Audio may only start after the player touches the page.
  // iOS only grants audio at the end of a touch or on a click, so listen for those too.
  const unlockAudio = () => Sound.unlock();
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) document.addEventListener(ev, unlockAudio, { capture: true, passive: true });

  // ---------------------------------------------------------------------------
  // Layout & camera
  // ---------------------------------------------------------------------------
  function layout() {
    DPR = Math.min(window.devicePixelRatio || 1, 3);
    const r = ui.sidebar.getBoundingClientRect(), top = Math.round(ui.topstrip.getBoundingClientRect().bottom);
    const portrait = window.innerHeight > window.innerWidth;
    W = portrait ? window.innerWidth : Math.max(100, Math.round(r.left));
    H = Math.max(100, (portrait ? Math.round(r.top) : window.innerHeight) - top);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    document.documentElement.style.setProperty('--gw', W + 'px');
    document.documentElement.style.setProperty('--gh', H + 'px');
    const rr = radar.getBoundingClientRect();
    radar.width = Math.max(1, Math.round(rr.width * DPR)); radar.height = Math.max(1, Math.round(rr.height * DPR));
    clampCam();
  }
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 250));

  // Zoom snaps so each game pixel covers a whole number of screen pixels; fractional
  // scaling makes some pixels wider than others and reads as blur on phones.
  function snapZ(z) {
    z = Math.max(0.75, Math.min(3.5, z));
    if (z * DPR < 1.5) return z;
    return Math.max(1, Math.round(z * DPR)) / DPR;
  }
  const EDGE_KEEP = 8;
  function clampCam() {
    cam.z = snapZ(cam.z);
    // cam.x, cam.y: the top left of the screen on the view plane (voxel.js toView). The middle of the screen is kept
    // over the map. While placing, it may go past the top edge by the placement bar's height, so a base by the top of
    // the map (Three Crossings' north-west start) is not stuck under the bar, which takes the taps.
    const vw = W / cam.z, vh = H / cam.z, top = placeMargin() / cam.z;
    let [x, y] = fromView(cam.x + vw / 2, cam.y + vh / 2);
    // Keep the middle of the screen a little inside the map (more when zoomed out), so less of the haze past the
    // edge shows; at most EDGE_KEEP cells, so a base by the edge can still be centred.
    const m = Math.min(EDGE_KEEP * CELL, 0.22 * Math.min(vw, vh / VIEW.F), WORLD / 2);
    x = Math.max(m, Math.min(WORLD - m, x)); y = Math.max(m - top, Math.min(WORLD - m, y));
    const [X, Y] = toView(x, y);
    cam.x = X - vw / 2; cam.y = Y - vh / 2;
  }
  function placeMargin() {
    if (!ui.placebar || ui.placebar.hidden) return 0;
    return Math.max(0, ui.placebar.getBoundingClientRect().bottom - canvas.getBoundingClientRect().top + 8);
  }
  // The Flame Tower's fire, drawn as a flamethrower's stream. Looks only: its shots (world.js) still fly, land, splash
  // and burn as before, two every couple of seconds.
  // flameJet: while a tower is engaging (it has a target in range and has fired within a reload), one unbroken jet
  // runs from the projector's mouth out to the target, and stays on between shots and from one target to the next
  // (held JET_HOLD seconds when a target dies, while the tower picks another), so a group is hosed down in one go
  // instead of the stream starting over with every shot. It follows the head as it turns. jetOn / jetD / jetSeen are
  // draw-only state on the building (netcore.js SKIP).
  const JET_SPEED = 230, JET_HOLD = 0.45;
  function flameJet(v, b) {
    const w = b.def.weapon, t = b.target, head = HEADS.ftur;
    const engaged = b.buildT >= 1 && t && t.alive && typeof t.x === 'number' && G.t - (b.shotAt == null ? -99 : b.shotAt) < w.rof + 0.5
      && Math.hypot(t.x - b.x, t.y - b.y) < w.range + 12;
    if (engaged) { b.jetD = Math.hypot(t.x - b.x, t.y - b.y); b.jetSeen = G.t; if (b.jetOn == null) b.jetOn = G.t; }
    else if (b.jetOn != null && !(G.t - b.jetSeen < JET_HOLD)) b.jetOn = null;
    if (b.jetOn == null) return;
    const ca = Math.cos(b.tface), sa = Math.sin(b.tface);
    // From the nozzle (at the head's height) to the ground out along where the head points, in screen pixels.
    const [sx, sy] = onScreen(v, b.cx * CELL + head[1] + ca * 10, b.cy * CELL + head[2] + sa * 10, head[3] * VK + 3);
    const [ex, ey] = onScreen(v, b.x + ca * b.jetD, b.y + sa * b.jetD, 5);
    const full = Math.hypot(ex - sx, ey - sy), k = Math.min(1, ((G.t - b.jetOn) * JET_SPEED + 8) / full);
    screenDraw(v, () => streamLine(v, sx, sy, sx + (ex - sx) * k, sy + (ey - sy) * k));
  }
  // A shot from a tower whose jet is showing is part of that jet. Otherwise (the tower is gone, or an old save's shot)
  // it is drawn on its own: a short stream from where it left, or a ball of fire.
  function fireStream(v, p) {
    const f = p.from;
    if (f && f.alive && f.type === 'ftur' && f.jetOn != null) return;
    if (typeof p.sx === 'number') return streamLine(v, p.sx, p.sy, p.x, p.y);
    const r = 2.5 + Math.random();
    v.fillStyle = 'rgba(255,120,30,0.55)'; v.beginPath(); v.arc(p.x, p.y, r + 2, 0, 7); v.fill();
    v.fillStyle = '#ffb040'; v.beginPath(); v.arc(p.x, p.y, r, 0, 7); v.fill();
  }
  // A jet of fire from (sx, sy) to (ex, ey): thin and white-hot at the nozzle, wider and redder toward a rolling head.
  function streamLine(v, sx, sy, ex, ey) {
    const dx = ex - sx, dy = ey - sy, len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx / len, uy = dy / len, n = Math.max(2, Math.ceil(len / 2.5));
    for (const pass of [0, 1, 2]) {   // red-orange glow, then the orange body, then the white-hot core
      v.fillStyle = pass === 0 ? 'rgba(255,90,20,0.4)' : pass === 1 ? 'rgba(255,165,50,0.85)' : '#fff2b8';
      for (let i = 0; i <= n; i++) {
        const k = i / n, d = k * len, wob = (Math.random() - 0.5) * (0.6 + d * 0.03);
        const r = pass === 0 ? 2.2 + d * 0.035 + Math.random() : pass === 1 ? 1.3 + d * 0.022 + Math.random() * 0.6 : Math.max(0, 1.1 - k * 0.8);
        if (pass === 2 && k > 0.75) break;   // the core gives out before the head
        if (r <= 0.3) continue;
        v.beginPath(); v.arc(sx + ux * d - uy * wob, sy + uy * d + ux * wob, r, 0, 7); v.fill();
      }
    }
    const r = 3 + Math.random() * 1.5;   // the rolling head of the stream
    v.fillStyle = 'rgba(255,110,25,0.6)'; v.beginPath(); v.arc(ex, ey, r + 1.5, 0, 7); v.fill();
    v.fillStyle = '#ffb040'; v.beginPath(); v.arc(ex, ey, r, 0, 7); v.fill();
  }
  // World (x, y) at height h, in the pixels of canvas g as it is now set up; and drawing in those pixels.
  function onScreen(g, x, y, h) { const [wx, wy] = liftPt(x, y, h), m = g.getTransform(); return [m.a * wx + m.c * wy + m.e, m.b * wx + m.d * wy + m.f]; }
  function screenDraw(g, fn) { const up = g.upright; g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.upright = false; try { fn(); } finally { g.upright = up; g.restore(); } }
  // The land beyond the map's edge (the iso view shows past it): a band of woods RIM cells deep round the map (water
  // at the edge carries on as water), its floor the edge's own colour darkening to woodland, fading into a haze from
  // FADE0 to FADE1 cells out with a little texture in it; the screen past the picture is the haze too. Made once a battle.
  const EDGE_PAD = 24, RIM = 7, FADE0 = 3, FADE1 = RIM + 3;
  const hazeRGB = () => (snowy() ? [196, 204, 214] : [104, 116, 124]);
  let edgeFor = null, edgeCv = null, rimFor = null, rimList = null, veilCv = null;
  // Water at (or within 2 cells along) the map's edge nearest cell (cx, cy): no woods grow out there.
  function rimWater(cx, cy) {
    const along = cx === 0 || cx === MAP - 1 ? [cx, cy, 0, 1] : [cx, cy, 1, 0];
    for (let k = -2; k <= 2; k++) {
      const x = Math.max(0, Math.min(MAP - 1, along[0] + along[2] * k)), y = Math.max(0, Math.min(MAP - 1, along[1] + along[3] * k));
      if (G.terr[idx(x, y)] === 4) return true;
    }
    return false;
  }
  // The trees of the woods round the map (the same pictures as the map's own, drawn with drawTree), sorted by y. On the
  // two sides nearest the camera (south-east and south-west of the turned view) they stand back 1.5 cells, so they do
  // not hide units at the edge.
  function rimTrees() {
    if (rimFor === G && rimList) return rimList;
    const out = [], snow = snowy(), h = (a, b, c) => { let v = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791); v = (v ^ (v >>> 13)) * 1274126177; return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };
    for (let cy = -RIM; cy < MAP + RIM; cy++) for (let cx = -RIM; cx < MAP + RIM; cx++) {
      if (cx >= 0 && cx < MAP && cy >= 0 && cy < MAP) { if (cx === 0 && cy >= 0) cx = MAP - 1; continue; }
      if (rimWater(Math.max(0, Math.min(MAP - 1, cx)), Math.max(0, Math.min(MAP - 1, cy)))) continue;
      for (let n = 0; n < 2; n++) {
        const x = (cx + 0.15 + 0.7 * h(cx, cy, n * 2)) * CELL, y = (cy + 0.2 + 0.7 * h(cx, cy, n * 2 + 1)) * CELL;
        const back = Math.max(-x, -y), near = Math.max(x - WORLD, y - WORLD);   // how far out on the far and near sides
        if (near > 0 ? near < 1.5 * CELL : back < 0.2 * CELL) continue;
        if (h(cx, cy, 9 + n) < (n ? 0.35 : 0.05)) continue;   // a few gaps
        const pine = snow || h(cx, cy, 20 + n) < 0.45, set = snow ? scenery.snowPines : pine ? scenery.pines : scenery.trees;
        if (!set.length) continue;
        const v = Math.floor(h(cx, cy, 30 + n) * set.length);
        out.push({ s: set[v], burnt: (pine ? scenery.burntPines : scenery.burntTrees)[v % 5], pine, x, y });
      }
    }
    out.sort((a, b) => a.y - b.y);
    rimFor = G; rimList = out; veilCv = null;
    return out;
  }
  // The rim's trees in the world box: their shadows drawn now, the trees returned to be sorted in with the units.
  function rimInView(g, x0, y0, x1, y1, keep) {
    const T = rimTrees(), out = [];
    if (x0 > 0 && y0 > 0 && x1 < WORLD && y1 < WORLD) return out;
    let lo = 0, hi = T.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (T[m].y < y0) lo = m + 1; else hi = m; }
    g.globalAlpha = 0.45;
    for (let i = lo; i < T.length && T[i].y < y1; i++) {
      const tr = T[i];
      if (tr.x < x0 || tr.x > x1 || (keep && !keep(tr.x, tr.y))) continue;
      g.drawImage(tr.s.sh, Math.round(tr.x + tr.s.sox), Math.round(tr.y + tr.s.soy));
      out.push({ kind: 'tree', x: tr.x, y: tr.y, tr, p: 0, i: 90000 + i });
    }
    g.globalAlpha = 1;
    return out;
  }
  // Haze over the outer woods (drawn after them): clear to 0.45 RIM cells out, thick by RIM + 1.5.
  function edgeVeil() {
    if (veilCv && rimFor === G) return veilCv;
    const P = EDGE_PAD, N = MAP + 2 * P, c = mkCanvas(N, N), g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data, [hr, hg, hb] = hazeRGB();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const out = Math.hypot(Math.max(P - x, 0, x - (P + MAP - 1)), Math.max(P - y, 0, y - (P + MAP - 1)));
      const t = Math.max(0, Math.min(1, (out - RIM * 0.45) / (RIM + 1.5 - RIM * 0.45))), i = (y * N + x) * 4;
      d[i] = hr; d[i + 1] = hg; d[i + 2] = hb; d[i + 3] = 255 * t * t * (3 - 2 * t);
    }
    g.putImageData(img, 0, 0);
    veilCv = c;
    return c;
  }
  function edgePic() {
    if (edgeFor === G && edgeCv) return edgeCv;
    const P = EDGE_PAD, N = MAP + 2 * P, c = mkCanvas(N, N), g = c.getContext('2d');
    g.drawImage(miniTerrain, P, P);
    g.drawImage(miniTerrain, 0, 0, MAP, 1, P, 0, MAP, P); g.drawImage(miniTerrain, 0, MAP - 1, MAP, 1, P, P + MAP, MAP, P);
    g.drawImage(miniTerrain, 0, 0, 1, MAP, 0, P, P, MAP); g.drawImage(miniTerrain, MAP - 1, 0, 1, MAP, P + MAP, P, P, MAP);
    for (const [sx, sy, dx, dy] of [[0, 0, 0, 0], [MAP - 1, 0, P + MAP, 0], [0, MAP - 1, 0, P + MAP], [MAP - 1, MAP - 1, P + MAP, P + MAP]]) g.drawImage(miniTerrain, sx, sy, 1, 1, dx, dy, P, P);
    const soft = mkCanvas(N, N), s = soft.getContext('2d');
    s.filter = 'blur(1.5px)'; s.drawImage(c, 0, 0); s.filter = 'none';
    const img = s.getImageData(0, 0, N, N), d = img.data, [hr, hg, hb] = hazeRGB();
    const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const noise = (x, y) => {   // smooth value noise, 6 cells across
      const X = x / 6, Y = y / 6, x0 = Math.floor(X), y0 = Math.floor(Y), fx = X - x0, fy = Y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = hash(x0, y0), b = hash(x0 + 1, y0), c2 = hash(x0, y0 + 1), e = hash(x0 + 1, y0 + 1);
      return (a + (b - a) * sx) * (1 - sy) + (c2 + (e - c2) * sx) * sy;
    };
    const [fr, fg, fb] = snowy() ? [200, 206, 212] : [40, 52, 32];   // the woodland floor
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const ox = Math.max(P - x, 0, x - (P + MAP - 1)), oy = Math.max(P - y, 0, y - (P + MAP - 1)), out = Math.hypot(ox, oy);
      if (!out) continue;
      const i = (y * N + x) * 4;
      if (!rimWater(Math.min(MAP - 1, Math.max(0, x - P)), Math.min(MAP - 1, Math.max(0, y - P)))) {
        const w = Math.min(1, out / 2) * (0.85 + 0.3 * noise(x * 2, y * 2) - 0.15);
        d[i] = d[i] * (1 - w) + fr * w; d[i + 1] = d[i + 1] * (1 - w) + fg * w; d[i + 2] = d[i + 2] * (1 - w) + fb * w;
      }
      const t = Math.max(0, Math.min(1, (out - FADE0) / (FADE1 - FADE0))), k = t * t * (3 - 2 * t);
      const n = 0.92 + 0.16 * noise(x, y) * Math.min(1, out / 3);   // patches of thicker and thinner haze
      d[i] = d[i] * (1 - k) + hr * n * k; d[i + 1] = d[i + 1] * (1 - k) + hg * n * k; d[i + 2] = d[i + 2] * (1 - k) + hb * n * k; d[i + 3] = 255;
    }
    s.putImageData(img, 0, 0);
    edgeFor = G; edgeCv = soft;
    return soft;
  }
  // Slow wisps of mist drifting over the haze past the map's edge (looks only).
  function edgeMist(v, ox, oy, bw, bh, onScr) {
    const [hr, hg, hb] = hazeRGB(), t = performance.now() / 1000, R = 9 * CELL, step = 7 * CELL;
    v.save();
    v.beginPath(); v.rect(ox - R, oy - R, bw + 2 * R, bh + 2 * R); v.rect(0, 0, WORLD, WORLD); v.clip('evenodd');
    for (let gy = Math.floor((oy - R) / step); gy <= Math.ceil((oy + bh + R) / step); gy++) for (let gx = Math.floor((ox - R) / step); gx <= Math.ceil((ox + bw + R) / step); gx++) {
      const ph = ((gx * 92821 + gy * 68917) % 1000) / 1000;
      const x = (gx + 0.5) * step + Math.sin(t * 0.07 + ph * 6.3) * 2 * CELL + ((t * 6 + ph * step) % step) - step / 2;
      const y = (gy + 0.5) * step + Math.cos(t * 0.05 + ph * 4.1) * 1.5 * CELL;
      const out = Math.max(-x, x - WORLD, -y, y - WORLD);
      if (out < -2 * CELL || !onScr(x, y, R, R, R)) continue;
      const a = 0.22 * Math.min(1, (out + 2 * CELL) / (4 * CELL)) * (0.5 + 0.5 * Math.sin(t * 0.3 + ph * 9));
      const gr = v.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, `rgba(${hr + 30},${hg + 30},${hb + 30},${a})`); gr.addColorStop(1, `rgba(${hr},${hg},${hb},0)`);
      v.fillStyle = gr; v.fillRect(x - R, y - R, 2 * R, 2 * R);
    }
    v.restore();
  }
  // A soft band of haze just inside the edge (on the ground, under the units), so the ground does not stop on a hard line.
  function edgeSeam(v, ox, oy, bw, bh) {
    const [hr, hg, hb] = hazeRGB(), B = 2.5 * CELL, hz = (a) => `rgba(${hr},${hg},${hb},${a})`;
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, 0, B, 0, 0, WORLD, B], [0, WORLD, 0, WORLD - B, 0, WORLD - B, WORLD, B], [0, 0, B, 0, 0, 0, B, WORLD], [WORLD, 0, WORLD - B, 0, WORLD - B, 0, B, WORLD]]) {
      if (rx + rw < ox || rx > ox + bw || ry + rh < oy || ry > oy + bh) continue;
      const gr = v.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, hz(0.3)); gr.addColorStop(0.5, hz(0.08)); gr.addColorStop(1, hz(0));
      v.fillStyle = gr; v.fillRect(rx, ry, rw, rh);
    }
  }
  function centerOn(x, y) { [x, y] = toView(x, y); cam.x = x - W / cam.z / 2; cam.y = y - H / cam.z / 2; clampCam(); }
  // Screen point to the world point on the ground under it.
  const s2w = (sx, sy) => { const [x, y] = fromView(cam.x + sx / cam.z, cam.y + sy / cam.z); return { x, y }; };

  // ---------------------------------------------------------------------------
  // Game start
  // ---------------------------------------------------------------------------
  let online = null;   // { opponent } during an online battle
  let mission = false; // a skirmish the player started or continued (not the battle behind the menu): saved as it goes
  let mapId = DEFAULT_MAP;   // the skirmish map chosen on the map screen
  let battleMode = '1v1';    // and the battle: '1v1', '2v2' or '3v3' (BATTLES in maps.js; you and computer allies against computers)
  // A team skirmish: you (side 0) and computer allies of your side against as many of the other, the
  // alliances alternating (sides 0, 2, 4 are yours).
  function teamSides(f, size) {
    const foe = f === 'allies' ? 'soviets' : 'allies', sides = [];
    for (let i = 0; i < size * 2; i++) sides.push({ faction: i % 2 ? foe : f, ally: i % 2, ai: i !== 0 });
    return sides;
  }
  function startGame(seed, mode = '1v1') {
    const size = battleOf(mode).size;
    if (size > 1 && !battleOf(mode).coop) newWorld(faction, diffKey, seed, 0, false, mapId, teamSides(faction, size));
    else newWorld(faction, diffKey, seed, mySide, false, mapId);
    online = null; mission = false;
    afterNewWorld(faction);
  }
  // resumed: a saved game, which keeps its auto attack and camera.
  function afterNewWorld(faction, resumed) {
    radarWas = null;
    mapPictures();
    for (let i = 0; i < NCELLS; i++) {
      mtctx.fillStyle = terrainMini()[G.terr[i]];
      mtctx.fillRect(cellX(i), cellY(i), 1, 1);
    }
    ui.sidebar.dataset.faction = faction;
    cameoSig = { L: '', R: '' }; selSig = ''; lastCredits = null;
    // Auto attack starts off (new units spread out and guard the base): it can only be switched on
    // once an enemy building has been uncovered.
    if (!resumed) G.teams[G.me].auto = false;
    ui.autoBtn.setAttribute('aria-pressed', String(!!G.teams[G.me].auto));
    ui.allyBtn.hidden = ui.returnBtn.hidden = ui.giveBtn.hidden = !teamGame();
    if (giveEl) giveEl.hidden = true;
    layout();
    if (resumed) return;
    const cy = G.entities.find((e) => e.team === G.me && e.type === 'cy');
    cam.z = Math.max(1, Math.min(2.5, Math.round((W / (CELL * 18)) * 4) / 4));
    centerOn(cy.x + 40, cy.y - 30);
  }

  // An online battle (net.js): o = { seed, faction, me, opponent }.
  UIBridge.start = (o) => {
    Report.quit();
    Debrief.close();
    endPlace();
    Net.hookHost();
    newWorld(o.faction, o.diff || 'normal', o.seed, o.me, true, o.map, o.sides);
    // A co-op with a computer teammate (sides[i].mate) is unranked: the board is for players only.
    const mates = (o.sides || []).some((x) => x.mate);
    const coop = !battleOf(o.mode).coop ? null : o.mode === 'coop' && !mates ? 'board' : 'unranked';
    online = { opponent: o.opponent, coop, diff: o.diff || 'normal' };
    Sound.newMatch();
    afterNewWorld(o.faction);
    // Co-op against the computer is 'pve', with its difficulty; the rest 'pvp'.
    // In co-op the match row's opponent column holds the teammate's name, for the co-op leaderboard.
    // (3 v AI is reported as 'pve' too, with stats.size 3, but has no leaderboard of its own yet: see Report.stats)
    if (coop) Report.start(o.faction, o.diff || 'normal', 'pve', o.partner || 'Commander'); else Report.start(o.faction, null, 'pvp', o.opponent);
    hideMenu();
    eva('Select a structure to build');
  };
  $('onlineBtn').addEventListener('click', () => Online.open(faction));

  // A mission the player starts (not the battle behind the menu): reported anonymously, see report.js.
  function startMission() {
    Net.leave();
    Report.quit();   // a mission left undecided counts as quit
    SaveGame.clear();
    startGame(undefined, battleMode);
    Sound.newMatch();
    mission = true;
    Report.start(faction, diffKey);
  }
  // The skirmish under way is saved when the menu opens (which it also does when the phone locks or
  // switches apps) and every two minutes; Continue on the menu picks it up again.
  function autosave() {
    if (mission && G && !G.over && !Net.role) SaveGame.save({ faction, diffKey, cam: { x: cam.x, y: cam.y, z: cam.z, view: VIEW.rot }, match: Report.matchId }).then(showContinue);
  }
  setInterval(() => { if (G && !G.paused) autosave(); }, 120 * 1000);
  function showContinue() {
    SaveGame.info().then((m) => {
      const b = $('continueBtn');
      b.hidden = !m || !ui.menu.dataset.mode || ui.menu.dataset.mode !== 'start';
      if (!m) return;
      const side = (f) => (f === 'allies' ? 'Allies' : 'Soviets');
      b.innerHTML = `Continue<small>${side(m.faction)} vs ${side(m.foe)} · ${DIFFICULTY[m.diffKey] ? DIFFICULTY[m.diffKey].label : ''} · ${fmt(m.t)}</small>`;
    });
  }
  async function continueMission() {
    Net.leave();
    Report.quit();
    endPlace();
    const r = await SaveGame.load();
    if (!r) { $('continueBtn').hidden = true; eva('No saved game'); return; }
    faction = FACTIONS[r.faction] ? r.faction : faction; diffKey = DIFFICULTY[r.diffKey] ? r.diffKey : diffKey;
    online = null; mission = true;
    afterNewWorld(faction, true);
    if (r.cam && r.cam.view === VIEW.rot) { cam.x = r.cam.x; cam.y = r.cam.y; cam.z = r.cam.z; clampCam(); }
    else if (r.cam) { cam.z = r.cam.z; centerOn(r.cam.x + W / r.cam.z / 2, r.cam.y + H / r.cam.z / 2); }   // (saved before the iso view: world coordinates)
    Report.resume(r.match, faction, diffKey);   // the same match as before it was saved
    hideMenu();
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function drawHealth(g, e, x, y, w) {
    const f = Math.max(0, e.hp / e.maxHp);
    x = Math.round(x - w / 2); y = Math.round(y);
    g.fillStyle = '#000'; g.fillRect(x - 1, y - 1, w + 2, 4);
    g.fillStyle = f > 0.5 ? '#3ed04a' : f > 0.25 ? '#e8d23a' : '#e03a2a';
    g.fillRect(x, y, Math.max(1, Math.round(w * f)), 2);
  }
  // Veterancy: one gold chevron per rank at the unit's lower right; an elite unit wears a star.
  function drawRank(g, e) {
    const r = e.def.r, [ux, uy] = unitSpot(e), x = Math.round(ux + r - 1), y0 = Math.round(uy + (e.cls === 'inf' ? -2 : r - 2));
    if (e.rank >= VET.at.length) {
      g.fillStyle = '#000'; g.fillRect(x - 3, y0 - 3, 7, 7);
      g.fillStyle = '#ffd65a'; g.fillRect(x - 2, y0, 5, 1); g.fillRect(x, y0 - 2, 1, 5); g.fillRect(x - 1, y0 - 1, 3, 3);
      g.fillStyle = '#fff6c8'; g.fillRect(x, y0, 1, 1);
      return;
    }
    for (let i = 0; i < e.rank; i++) {
      const y = y0 - i * 3;
      g.fillStyle = '#000'; g.fillRect(x - 3, y - 1, 7, 4);
      g.fillStyle = '#ffd65a'; g.fillRect(x, y - 1, 1, 1); g.fillRect(x - 1, y, 3, 1); g.fillRect(x - 2, y + 1, 2, 1); g.fillRect(x + 1, y + 1, 2, 1);
    }
  }
  function brackets(g, x0, y0, x1, y1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    g.fillStyle = '#f2f2ea';
    const L = 3;
    g.fillRect(x0, y0, L, 1); g.fillRect(x0, y0, 1, L);
    g.fillRect(x1 - L + 1, y0, L, 1); g.fillRect(x1, y0, 1, L);
    g.fillRect(x0, y1, L, 1); g.fillRect(x0, y1 - L + 1, 1, L);
    g.fillRect(x1 - L + 1, y1, L, 1); g.fillRect(x1, y1 - L + 1, 1, L);
  }
  const seenAt = (x, y) => G.seen[cellOfPos(x, y)];
  const houseSeen = (h) => G.seen[idx(h.cx, h.cy)] || G.seen[idx(h.cx + h.w - 1, h.cy + h.h - 1)];
  const visibleToPlayer = (e) => !e.inHouse && (alliedSides(e.team, G.me) || (e.kind === 'bld' ? !camoHidden(e, G.me) && (G.seen[idx(e.cx, e.cy)] || G.seen[idx(e.cx + e.w - 1, e.cy + e.h - 1)]) : seenAt(e.x, e.y)));

const gateAnim = new Map();   // cell -> { v: how far a gate's barrier is down (0 to 1), t: when last drawn }
function draw() {
    spriteSpend = 0;   // (models.js: sprites made this frame)
    const z = cam.z;
    // The view canvas holds the screen at zoom 1 (VW x VH); its top left is (vx, vy) on the view plane (voxel.js
    // toView). The world is drawn through a transform that turns and squashes it (iso view); (ox, oy, bw, bh) is the
    // world box round what is on screen, with room below for tall things standing just off the bottom edge.
    const VW = Math.ceil(W / z) + 2, VH = Math.ceil(H / z) + 2, vx = Math.floor(cam.x), vy = Math.floor(cam.y);
    const corners = [fromView(vx - 40, vy - 40), fromView(vx + VW + 40, vy - 40), fromView(vx - 40, vy + VH + 140), fromView(vx + VW + 40, vy + VH + 140)];
    const ox = Math.floor(Math.min(...corners.map((c) => c[0]))), oy = Math.floor(Math.min(...corners.map((c) => c[1])));
    const bw = Math.ceil(Math.max(...corners.map((c) => c[0]))) - ox, bh = Math.ceil(Math.max(...corners.map((c) => c[1]))) - oy;
    if (view.width < VW || view.height < VH) { view.width = VW + 64; view.height = VH + 64; }
    const v = uprightCtx(vctx);
    v.upright = false;
    v.setTransform(1, 0, 0, 1, 0, 0);
    v.imageSmoothingEnabled = false;
    v.fillStyle = G ? `rgb(${hazeRGB()})` : '#000'; v.fillRect(0, 0, VW, VH);
    if (!G) return;
    // A bridge span destroyed or rebuilt: the minimap's terrain follows.
    const sig = (G.spans || []).map((s) => (s.alive ? 1 : 0)).join('');
    if (sig !== spanSig) {
      spanSig = sig;
      for (const s of G.spans || []) for (const c of s.cells) { mtctx.fillStyle = terrainMini()[G.terr[c]]; mtctx.fillRect(cellX(c), cellY(c), 1, 1); }
      radarWas = null;
    }
    // The world box round a turned screen is about twice the screen's area, so things are also culled by where they
    // show on the screen (margins in view pixels: sideways, above, and below for tall things standing just off the
    // bottom edge). Before, half of the trees, ore, units and effects drawn on a big screen zoomed out were off it.
    const onScr = (x, y, m = 120, up = 100, down = 220) => {
      const X = x * VIEW.c - y * VIEW.s - vx, Y = (x * VIEW.s + y * VIEW.c) * VIEW.F - vy;
      return X > -m && X < VW + m && Y > -up && Y < VH + down;
    };
    // Whether the screen shows anything past the map's edge (the box round it often does when the screen does not).
    const past = corners.some(([x, y]) => x < 0 || y < 0 || x > WORLD || y > WORLD);
    const sx = Math.max(0, ox), sy = Math.max(0, oy);
    const sw = Math.min(WORLD, ox + bw) - sx, sh = Math.min(WORLD, oy + bh) - sy;
    // The ground is painted in tiles as it comes into view (art.js makeGround): up to 6 ms a frame for what is on
    // screen, then 3 ms for the tiles round it.
    // Only the ground tiles that show: the world box round a turned screen is about three times the screen.
    if (G.ground.keep) G.ground.keep((x0, y0, T, pad) => {
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      for (const [x, y] of [[x0, y0], [x0 + T, y0], [x0, y0 + T], [x0 + T, y0 + T]]) { const [X, Y] = toView(x, y); a = Math.min(a, X); b = Math.min(b, Y); c = Math.max(c, X); d = Math.max(d, Y); }
      const m = 8 + (pad || 0) * 0.7;
      return c > vx - m && a < vx + VW + m && d > vy - m && b < vy + VH + m;
    });
    G.ground.update(sx, sy, sw, sh, 6, 3);
    const toWorld = () => v.setTransform(VIEW.c, VIEW.s * VIEW.F, -VIEW.s, VIEW.c * VIEW.F, -vx, -vy);   // world -> view canvas
    toWorld();
    if (past) {   // past the map's edge: its land carried on, fading into haze
      v.imageSmoothingEnabled = true;
      const e = edgePic(), P = EDGE_PAD;
      v.drawImage(e, -P * CELL, -P * CELL, (MAP + 2 * P) * CELL, (MAP + 2 * P) * CELL);
      v.imageSmoothingEnabled = false;
    }
    G.ground.draw(v, 't', sx, sy, sw, sh, sx, sy);
    if (past) edgeSeam(v, ox, oy, bw, bh);

    // Ore
    const c0 = Math.max(0, Math.floor(ox / CELL)), c1 = Math.min(MAP - 1, Math.floor((ox + bw) / CELL));
    const r0 = Math.max(0, Math.floor(oy / CELL)), r1 = Math.min(MAP - 1, Math.floor((oy + bh) / CELL));
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const c = idx(cx, cy), o = G.ore[c];
      if (o && onScr((cx + 0.5) * CELL, (cy + 0.5) * CELL, 40, 40, 40)) drawOre(v, cx, cy, o, G.gem[c]);
    }

    G.ground.draw(v, 'd', sx, sy, sw, sh, sx, sy);
    // Walls and gates on explored ground (art.js wallPic). A gate stands open while one of its own alliance is beside it.
    const wallsHere = [];   // (sorted in with the units below, art.js drawWallIso)
    if (G.wallN) {
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
        const c = idx(cx, cy), id = G.wall[c];
        if (!id || !G.seen[c]) continue;
        const wt = G.wallTeam[c], d = WALL_BY_ID[id], tm = G.teams[wt];
        const mask = (cy > 0 && G.wall[c - MAP] ? 1 : 0) | (cx < MAP - 1 && G.wall[c + 1] ? 2 : 0) | (cy < MAP - 1 && G.wall[c + MAP] ? 4 : 0) | (cx > 0 && G.wall[c - 1] ? 8 : 0);
        let open = 0, gm = 0;
        if (d.gate) {                                                       // its barrier sinks and rises over about a third of a second (looks only)
          // The three cells of a gate are drawn as one and open as one, when one of its alliance is beside any of it.
          const cs = gateCells(c), a = cs[0], b = cs[cs.length - 1], st = b - a >= MAP ? MAP : 1;
          gm = (cs.includes(c - st) ? (st === 1 ? 8 : 1) : 0) | (cs.includes(c + st) ? (st === 1 ? 2 : 4) : 0);
          const bx0 = cellX(a) * CELL - 22, by0 = cellY(a) * CELL - 22, bx1 = (cellX(b) + 1) * CELL + 22, by1 = (cellY(b) + 1) * CELL + 22, now = performance.now();
          const want = G.entities.some((e) => e.alive && e.kind === 'unit' && !isAirborne(e) && e.x > bx0 && e.x < bx1 && e.y > by0 && e.y < by1 && alliedSides(e.team, wt)) ? 1 : 0;
          let s = gateAnim.get(c);
          if (!s || now - s.t > 1000) gateAnim.set(c, s = { v: want, t: now });
          const step = (now - s.t) / 350; s.t = now;
          s.v = want > s.v ? Math.min(1, s.v + step) : Math.max(0, s.v - step);
          open = Math.round(s.v * GATE_STEPS);
        }
        wallsHere.push({ kind: 'wall', c, cx, cy, x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL, id, mask, gm, open, col: tm ? tm.pal.main : '#888', hurt: G.wallHp[c] < d.hp / 2 });
      }
    }
    // Destroyed bridge spans: water and broken ends over the painted bridge (art.js spanRuin).
    for (const s of G.spans || []) if (!s.alive && s.x > ox - 400 && s.x < ox + bw + 400 && s.y > oy - 400 && s.y < oy + bh + 400) { const p = spanRuin(s); v.drawImage(p.c, p.x, p.y); }
    const x0 = ox - 80, y0 = oy - 80, x1 = ox + bw + 80, y1 = oy + bh + 80;
    const inView = (e) => e.x > x0 && e.x < x1 && e.y > y0 && e.y < y1 && onScr(e.x, e.y);
    for (const fx of G.effects) if ((fx.type === 'husk' || fx.type === 'corpse') && fx.t >= 0 && onScr(fx.x, fx.y)) drawEffect(v, fx);
    const treeShows = (x, y) => onScr(x, y, 60, 30, 90);
    const trees = treesInView(v, ox - 20, oy - 4, ox + bw + 20, oy + bh + 40, treeShows);   // swaying in the wind, burning (art.js): sorted in with the units below
    if (past) for (const t of rimInView(v, ox - 20, oy - 4, ox + bw + 20, oy + bh + 40, treeShows)) trees.push(t);   // the woods past the map's edge

    // An effect on the screen: tracers and Tesla bolts by either end or their middle (a gun just off the screen firing into
    // it), a lightning bolt by its landing spot with room for its top, which is drawn up to about 230 px to the side.
    const fxShows = (fx) => fx.x2 !== undefined
      ? onScr(fx.x, fx.y, 120, 100, 400) || onScr(fx.x2, fx.y2, 120, 100, 400) || onScr((fx.x + fx.x2) / 2, (fx.y + fx.y2) / 2, 120, 100, 400)
      : onScr(fx.x, fx.y, fx.type === 'bolt' ? 360 : 120, 100, 400);
    const ground = [], air = [];
    for (const e of G.entities) {
      if (!inView(e) || !visibleToPlayer(e)) continue;
      // Parked aircraft too, so they show on top of their Helipad or Airfield.
      if (e.kind === 'unit' && e.cls === 'air') air.push(e); else ground.push(e);
    }
    // Village houses on explored ground (world.js genVillage), sorted in with everything else.
    for (const t of trees) ground.push(t);
    for (const w of wallsHere) ground.push(w);
    for (const h of G.houses || []) if (h.alive && houseSeen(h) && h.x > x0 - 60 && h.x < x1 + 60 && h.y > y0 - 60 && h.y < y1 + 120) ground.push(h);
    for (const p of G.props || []) if (inView(p) && G.seen[cellOfPos(p.x, p.y)]) ground.push(p);
    for (const f of G.folk || []) if (f.st !== 'in' && inView(f) && G.seen[cellOfPos(f.x, f.y)]) ground.push({ kind: 'folk', v: f, y: f.y });
    for (const c of G.hens || []) if (inView(c) && G.seen[cellOfPos(c.x, c.y)]) ground.push({ kind: 'hen', v: c, y: c.y });
    if (G.birds) drawBirds(v, false, x0, y0, x1, y1);   // pigeons on the ground
    // Back to front on the screen. A structure sorts by a point 0.4 of the way into its footprint, so a unit beside
    // one of its front walls is drawn in front of it and one by its back walls behind it.
    // A structure sorts by its footprint's front corner. Anything standing beside one is in front of it when it is nearer
    // the camera than the closest point of the footprint (beside a front wall), and is then moved to just after it;
    // otherwise (beside a back wall) it is already before it.
    const big = (e) => e.kind === 'bld' || e.kind === 'house';
    const posOf = (e) => (e.kind === 'folk' || e.kind === 'hen' ? e.v : e);
    for (const e of ground) {
      if (big(e)) {
        const x0 = e.cx * CELL, y0 = e.cy * CELL, x1 = x0 + e.w * CELL, y1 = y0 + e.h * CELL;
        e._key = Math.max(viewDepth(x0, y0), viewDepth(x1, y0), viewDepth(x0, y1), viewDepth(x1, y1));
      } else { const p = posOf(e); e._key = viewDepth(p.x, p.y); }
    }
    const NEAR = CELL * 1.5;
    for (const b of ground) {
      if (!big(b)) continue;
      const x0 = b.cx * CELL, y0 = b.cy * CELL, x1 = x0 + b.w * CELL, y1 = y0 + b.h * CELL;
      for (const e of ground) {
        if (big(e) || e._key > b._key) continue;
        const p = posOf(e);
        if (p.x < x0 - NEAR || p.x > x1 + NEAR || p.y < y0 - NEAR || p.y > y1 + NEAR) continue;
        const nx = Math.max(x0, Math.min(x1, p.x)), ny = Math.max(y0, Math.min(y1, p.y));
        if (viewDepth(p.x, p.y) > viewDepth(nx, ny)) e._key = b._key + 0.01;
      }
    }
    ground.sort((a, b) => a._key - b._key);
    v.upright = true;   // from here on, pictures, pixels and labels stand upright (art.js uprightCtx)
    for (const e of ground) {
      if (e.kind === 'bld') drawStructure(v, e, G.t);
      else if (e.kind === 'house') drawHouse(v, e);
      else if (e.kind === 'prop') drawProp(v, e);
      else if (e.kind === 'folk') drawFolk(v, e.v);
      else if (e.kind === 'hen') drawHen(v, e.v);
      else if (e.kind === 'tree') drawTree(v, e);
      else if (e.kind === 'wall') drawWallIso(v, e);
      else drawUnit(v, e, G.t);
    }
    if (past) {   // haze over the outer woods past the map's edge
      const up = v.upright; v.upright = false; v.imageSmoothingEnabled = true;
      const P = EDGE_PAD; v.drawImage(edgeVeil(), -P * CELL, -P * CELL, (MAP + 2 * P) * CELL, (MAP + 2 * P) * CELL);
      edgeMist(v, ox, oy, bw, bh, onScr);
      v.imageSmoothingEnabled = false; v.upright = up;
    }
    for (const e of ground) if (e.kind === 'bld' && e.type === 'ftur') flameJet(v, e);
    for (let p of G.projectiles) {
      if (p.delay > 0) continue;
      if (p.gy !== undefined) { const [lx, ly] = liftPt(p.gx, p.gy, p.gy - p.y); p = { ...p, x: lx, y: ly }; }   // a lobbed shell or grenade: its height up the screen
      else if (p.kind === 'bomb') { const [lx, ly] = liftPt(p.tx, p.ty, p.ty - p.y); p = { ...p, x: lx, y: ly }; }   // falling on (tx, ty)
      else if (p.h0 !== undefined && p.kind !== 'fireball') { const h = projH(p), [lx, ly] = liftPt(p.x, p.y + h, h); p = { ...p, x: lx, y: ly }; }   // a shell or missile between its gun's height and its target's (world.js projH)
      const a = p.a || 0, ca = Math.cos(a), sa = Math.sin(a);
      if (p.kind === 'bomb') {
        v.fillStyle = 'rgba(0,0,0,0.35)'; v.fillRect(Math.round(p.tx - 1), Math.round(p.ty), 3, 2);
        v.fillStyle = '#1d1f18'; v.fillRect(Math.round(p.x - 1), Math.round(p.y - 2), 3, 5);
        continue;
      }
      if (p.kind === 'lob') {
        v.fillStyle = 'rgba(0,0,0,0.3)'; v.fillRect(Math.round(p.gx - 1), Math.round(p.gy), 3, 2);   // shadow on the ground
        if (p.style === 'v2') {
          // The rocket, pointing along its flight as the camera sees it, with a flame at the tail. Drawn in screen pixels (standAt):
          // upright pixels have their positions turned and squashed like the ground, which laid the rocket on its side.
          const L = 6, k0 = Math.min(1, p.t / p.dur), m = v.getTransform();
          const hAt = (k) => p.z * (1 - k) + p.h * 4 * k * (1 - k);
          const scr = (k) => { const [wx, wy] = liftPt(p.sx + (p.tx - p.sx) * k, p.sy + (p.ty - p.sy) * k, hAt(k)); return [m.a * wx + m.c * wy, m.b * wx + m.d * wy]; };
          const A = scr(Math.max(0, k0 - 0.03)), B = scr(Math.min(1, k0 + 0.03)), dl = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
          const bx = (B[0] - A[0]) / dl, by = (B[1] - A[1]) / dl, x = p.gx, y = p.gy;
          standAt(v, x, y, hAt(k0), () => {
            v.fillStyle = 'rgba(255,170,60,0.8)'; v.fillRect(Math.round(x - bx * (L + 2) - 1), Math.round(y - by * (L + 2) - 1), 3, 3);
            for (let i = -L; i <= L; i++) { v.fillStyle = i > L - 2 ? '#b8302a' : '#c9c7bd'; v.fillRect(Math.round(x + bx * i), Math.round(y + by * i), 2, 2); }
          });
        } else { v.fillStyle = '#2a2a24'; v.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 2, 2); }
        continue;
      }
      if (p.kind === 'grenade') {
        v.fillStyle = 'rgba(0,0,0,0.35)'; v.fillRect(Math.round(p.gx - 1), Math.round(p.gy), 3, 2);
        v.fillStyle = '#2d351c'; v.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 3, 3);
        v.fillStyle = '#6f7d48'; v.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 1, 1);
        continue;
      }
      if (p.kind === 'fireball') { fireStream(v, p); continue; }
      if (p.kind === 'shell') { v.fillStyle = '#ffe9a0'; v.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 2, 2); v.fillStyle = 'rgba(255,200,90,0.5)'; v.fillRect(Math.round(p.x - ca * 3), Math.round(p.y - sa * 3), 1, 1); }
      else if (p.kind === 'flak') { v.fillStyle = '#ffd36a'; v.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
      else {
        v.fillStyle = '#d8d6cc'; v.fillRect(Math.round(p.x - ca * 2), Math.round(p.y - sa * 2), 2, 2);
        v.fillStyle = '#ff9a2a'; v.fillRect(Math.round(p.x - ca * 4), Math.round(p.y - sa * 4), 1, 1);
      }
    }
    for (const fx of G.effects) {
      if (!(fx.t >= 0 && fx.type !== 'husk' && fx.type !== 'corpse' && fx.x > x0 && fx.x < x1 && fx.y > y0 && fx.y < y1 && fxShows(fx))) continue;
      if (!fx.lift) { drawEffect(v, fx); continue; }
      // Up in the air (rising smoke and flames, world.js updateEffects): drawn that high straight up the screen.
      const gx = fx.x, gy = fx.y;
      [fx.x, fx.y] = liftPt(gx, gy, fx.lift);
      try { drawEffect(v, fx); } finally { fx.x = gx; fx.y = gy; }
    }
    air.sort((a, b) => (a.alt || 0) - (b.alt || 0) || a.y - b.y);
    for (const e of air) drawUnit(v, e, G.t);
    if (G.birds) drawBirds(v, true, x0, y0, x1, y1);   // pigeons in the air and on the church roof

    // Bars, brackets and labels are drawn flat on the view plane (screen pixels), at their things' projected spots.
    v.upright = false;
    const onView = () => v.setTransform(1, 0, 0, 1, -vx, -vy);
    onView();
    // Bridge spans: health while under fire or while a ground target is being picked.
    for (const s of G.spans || []) {
      if (!G.seen[idx(Math.floor(s.x / CELL), Math.floor(s.y / CELL))]) continue;
      if (s.alive && (G.t - s.hitT < 3 || aimSpan)) drawHealth(v, s, ...toView(...liftPt(s.x, s.y, 2)), 40);
    }
    for (const h of G.houses || []) {
      if (!h.alive || !houseSeen(h) || !inView(h)) continue;
      const held = h.n && G.selection.some((u) => u.inHouse === h), bx = bldBox(h);
      if (held) brackets(v, ...bx);
      if (held || G.t - h.hitT < 3 || aimSpan) drawHealth(v, h, (bx[0] + bx[2]) / 2, bx[1] - 6, Math.min(40, h.w * 14));
    }
    // Selection brackets and health bars.
    for (const e of G.entities) {
      if (!inView(e) || !visibleToPlayer(e)) continue;
      const sel = G.selection.includes(e);
      const recent = G.t - e.hitT < 3;
      if (e.rank && e.kind === 'unit') drawRank(v, e);
      if (!sel && !recent) continue;
      if (e.kind === 'bld') {
        const bx = bldBox(e);
        if (sel) brackets(v, ...bx);
        if (sel && e.team === G.me && e.rally && e.exitCell !== undefined) { toWorld(); drawRally(v, e, e.rally); onView(); }
        drawHealth(v, e, (bx[0] + bx[2]) / 2, bx[1] - 6, Math.min(48, e.w * CELL - 8));
      } else {
        const r = e.def.r + 2, [xx, yy] = unitSpot(e, e.cls === 'inf' ? 8 : 3);
        if (sel) brackets(v, xx - r, yy - r - (e.cls === 'inf' ? 5 : 0), xx + r, yy + r + (e.cls === 'inf' ? 3 : 0));
        drawHealth(v, e, xx, yy - r - (e.cls === 'inf' ? 10 : 5), Math.max(10, r * 2));
      }
    }

    // Research under way: a bar under each of this side's Tech Centers.
    const rs = G.teams[G.me].research;
    if (rs) for (const e of G.entities) {
      if (!e.alive || e.kind !== 'bld' || e.type !== 'tech' || e.team !== G.me || e.buildT < 1 || !inView(e)) continue;
      const [tx, ty] = toView(e.cx * CELL + e.w * CELL / 2, e.cy * CELL + e.h * CELL - 3);
      v.fillStyle = 'rgba(0,0,0,0.7)'; v.fillRect(tx - 21, ty - 3, 42, 6);
      v.fillStyle = rs.stalled ? '#c98a2a' : '#5ab0ff'; v.fillRect(tx - 20, ty - 2, 40 * rs.progress, 4);
    }
    // PRIMARY over the building new units come out of, when there is more than one of its type.
    for (const e of G.entities) {
      if (!e.alive || !e.primary || e.kind !== 'bld' || e.team !== G.me || !inView(e) || producersOfType(e).length < 2) continue;
      const [tx, ty] = toView(e.cx * CELL + e.w * CELL / 2, e.cy * CELL + e.h * CELL - 3);
      v.font = 'bold 7px monospace'; v.textAlign = 'center'; v.textBaseline = 'middle';
      v.fillStyle = 'rgba(0,0,0,0.65)'; v.fillRect(tx - 18, ty - 4.5, 36, 9);
      v.fillStyle = '#f2d24a'; v.fillText('PRIMARY', tx, ty + 0.5);
    }

    // Shroud: black where the player has never looked, softened at the edges.
    if (G.shroudDirty) {
      G.shroudDirty = false;
      const d = shroudImg.data;
      for (let i = 0; i < NCELLS; i++) { d[i * 4 + 3] = G.seen[i] ? 0 : 255; }
      sctx.putImageData(shroudImg, 0, 0);
    }
    toWorld();
    v.imageSmoothingEnabled = true;
    v.drawImage(shroudCanvas, ox / CELL, oy / CELL, bw / CELL, bh / CELL, ox, oy, bw, bh);
    v.imageSmoothingEnabled = false;

    drawPlacement(v);
    v.setTransform(1, 0, 0, 1, 0, 0);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = z < 1;
    const k = z * DPR;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const sx2 = shakeAmp > 0.3 ? (Math.random() - 0.5) * 2 * shakeAmp * DPR : 0, sy2 = shakeAmp > 0.3 ? (Math.random() - 0.5) * 2 * shakeAmp * DPR : 0;
    ctx.drawImage(view, 0, 0, VW, VH, Math.round(-(cam.x - vx) * k + sx2), Math.round(-(cam.y - vy) * k + sy2), Math.round(VW * k), Math.round(VH * k));
    if (MAPS[validMap(G.mapId)].daynight) drawNight(ctx, cam.x, cam.y, canvas.width / k, canvas.height / k, k, G.t, visibleToPlayer);   // (art.js)
    if (G.weather) drawWeather(ctx, G.weather, cam.x, cam.y, canvas.width / k, canvas.height / k, k, G.t, G.paused || !!G.over);
    if (gesture && gesture.type === 'box' && gesture.moved) {
      const bx = Math.min(gesture.sx, gesture.ex) * DPR, by = Math.min(gesture.sy, gesture.ey) * DPR;
      ctx.strokeStyle = '#f2f2ea'; ctx.lineWidth = DPR;
      ctx.strokeRect(bx + 0.5, by + 0.5, Math.abs(gesture.ex - gesture.sx) * DPR, Math.abs(gesture.ey - gesture.sy) * DPR);
    } else if (gesture && gesture.type === 'box' && gesture.held) {
      ctx.strokeStyle = '#f2f2ea'; ctx.lineWidth = 2 * DPR;
      ctx.beginPath(); ctx.arc(gesture.sx * DPR, gesture.sy * DPR, 24 * DPR, 0, 7); ctx.stroke();
    }
  }

  // A dashed line from a building to its rally point and a small flag there.
  function drawRally(v, b, r) {
    const sx = cellX(b.exitCell) * CELL + CELL / 2, sy = cellY(b.exitCell) * CELL + CELL / 2;
    v.strokeStyle = 'rgba(94,224,96,0.85)'; v.lineWidth = 1;
    v.setLineDash([4, 3]); v.beginPath(); v.moveTo(sx, sy); v.lineTo(r.x, r.y); v.stroke(); v.setLineDash([]);   // (on the ground)
    v.fillStyle = '#5ee060'; v.beginPath(); v.arc(r.x, r.y, 2, 0, 7); v.fill();
    const [fx, fy] = onScreen(v, r.x, r.y, 0);   // the flag stands up the screen
    screenDraw(v, () => {
      v.strokeStyle = 'rgba(94,224,96,0.85)'; v.lineWidth = 1;
      v.beginPath(); v.moveTo(fx, fy); v.lineTo(fx, fy - 12); v.stroke();
      v.fillStyle = '#5ee060'; v.beginPath(); v.moveTo(fx, fy - 12); v.lineTo(fx + 7, fy - 9.5); v.lineTo(fx, fy - 7); v.fill();
    });
  }
  function drawPlacement(v) {
    const p = G.place;
    if (p && p.rally && p.x !== undefined) { drawRally(v, p.rally, p); return; }
    if (p && (p.power || p.guard) && p.x !== undefined) {
      const r = p.guard ? Math.max(...p.guard.filter((u) => u.alive).map(guardReach), CELL) : p.power === 'spy' ? POWERS.spy.reveal * CELL : p.power === 'para' ? 40 : 60;
      v.strokeStyle = p.guard ? '#5ee060' : '#ff5a4a'; v.lineWidth = 1;
      v.setLineDash([4, 3]); v.beginPath(); v.arc(p.x, p.y, r, 0, 7); v.stroke(); v.setLineDash([]);
      v.beginPath(); v.moveTo(p.x - 8, p.y); v.lineTo(p.x + 8, p.y); v.moveTo(p.x, p.y - 8); v.lineTo(p.x, p.y + 8); v.stroke();
      return;
    }
    if (p && p.wall) {   // a line of wall: the cells it would take, green where a piece can stand
      if (p.ax === undefined) return;
      const team = G.teams[G.me], blds = buildingsOf(team.id);
      for (const c of wallLine(p.wall, p.ax, p.ay, p.bx, p.by)) {
        v.fillStyle = (WALLS[p.wall].gate ? gateCellOk(team, c, blds) : wallOk(team, c, blds)) ? 'rgba(90,230,110,0.45)' : 'rgba(220,40,30,0.45)';
        v.fillRect(cellX(c) * CELL, cellY(c) * CELL, CELL, CELL);
      }
      v.strokeStyle = '#f2f2ea'; v.lineWidth = 1; v.strokeRect(p.ax * CELL + 0.5, p.ay * CELL + 0.5, CELL - 1, CELL - 1);
      return;
    }
    if (!p || p.cx === undefined) return;
    const d = BUILD_DEFS[p.type];
    const team = G.teams[G.me];
    p.ok = canPlace(team, p.type, p.cx, p.cy, 0);
    drawVar = team.variant | 0;
    drawGhost(v, p.type, team.faction, p.cx, p.cy);
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
      const c = idx(p.cx + x, p.cy + y);
      const bad = !inMap(p.cx + x, p.cy + y) || G.block[c] || G.bld[c] || G.ore[c] || G.resv[c];
      v.fillStyle = bad || !p.ok ? 'rgba(220,40,30,0.45)' : 'rgba(240,240,230,0.28)';
      v.fillRect((p.cx + x) * CELL, (p.cy + y) * CELL, CELL, CELL);
      v.strokeStyle = bad || !p.ok ? '#ff5a4a' : '#f2f2ea'; v.lineWidth = 1;
      v.strokeRect((p.cx + x) * CELL + 0.5, (p.cy + y) * CELL + 0.5, CELL - 1, CELL - 1);
    }
    if (d.exit) {
      const ex = (p.cx + Math.floor(d.w / 2)) * CELL, ey = (p.cy + d.h) * CELL;
      v.strokeStyle = '#d8b13a'; v.setLineDash([2, 2]); v.strokeRect(ex + 0.5, ey + 0.5, CELL - 1, CELL - 1); v.setLineDash([]);
    }
  }

  let radarT = 0;
  // The radar needs a working Radar Dome: none built shows a blank screen, low power takes it
  // offline. Without it the minimap shows static and cannot be used to move the camera.
  const radarDome = () => G.entities.some((e) => e.alive && e.kind === 'bld' && e.team === G.me && e.type === 'dome' && e.buildT >= 1 && e.sellT <= 0);
  const radarOn = () => !!G && radarDome() && !G.teams[G.me].low;
  let radarWas = null;
  function drawRadar(dt) {
    radarT -= dt;
    if (radarT > 0 || !G) return;
    radarT = 0.2;
    const Wr = radar.width, Hr = radar.height, k = Wr / MAP, on = radarOn();
    if (radarWas !== null && on !== radarWas && !G.over) eva(on ? 'Radar online' : 'Radar offline');
    radarWas = on;
    if (!on) {
      rctx.fillStyle = '#0a0e0a'; rctx.fillRect(0, 0, Wr, Hr);
      for (let i = 0; i < Wr * Hr / 60; i++) { rctx.fillStyle = `rgba(150,190,150,${Math.random() * 0.18})`; rctx.fillRect(Math.random() * Wr, Math.random() * Hr, DPR, DPR); }
      rctx.fillStyle = 'rgba(120,220,120,0.7)'; rctx.font = `${Math.round(11 * DPR)}px monospace`; rctx.textAlign = 'center'; rctx.textBaseline = 'middle';
      rctx.fillText(radarDome() ? 'RADAR OFFLINE' : 'NO RADAR', Wr / 2, Hr / 2);
      return;
    }
    rctx.imageSmoothingEnabled = false;
    rctx.drawImage(miniTerrain, 0, 0, Wr, Hr);
    for (let i = 0; i < NCELLS; i++) if (G.ore[i] && G.seen[i]) { rctx.fillStyle = G.gem[i] ? '#a58cff' : '#c9a227'; rctx.fillRect(cellX(i) * k, cellY(i) * k, Math.ceil(k), Math.ceil(k)); }
    if (G.wallN) for (let i = 0; i < NCELLS; i++) if (G.wall[i] && G.seen[i]) { rctx.fillStyle = WALL_BY_ID[G.wall[i]].gate ? '#d8b024' : '#9a9c98'; rctx.fillRect(cellX(i) * k, cellY(i) * k, Math.ceil(k), Math.ceil(k)); }
    for (const h of G.houses || []) {   // village houses: in the colours of the side holding one
      if (!h.alive || !houseSeen(h)) continue;
      rctx.fillStyle = h.n && G.teams[h.team] ? G.teams[h.team].pal.main : '#b9ab8e';
      rctx.fillRect(h.cx * k, h.cy * k, h.w * k, h.h * k);
    }
    for (const e of G.entities) {
      if (!visibleToPlayer(e)) continue;
      rctx.fillStyle = G.teams[e.team].pal[e.kind === 'bld' ? 'main' : 'light'];
      if (e.kind === 'bld') rctx.fillRect(e.cx * k, e.cy * k, e.w * k, e.h * k);
      else rctx.fillRect(e.x / CELL * k - k * 0.6, e.y / CELL * k - k * 0.6, Math.max(2, k * 1.2), Math.max(2, k * 1.2));
    }
    rctx.drawImage(shroudCanvas, 0, 0, Wr, Hr);
    rctx.strokeStyle = '#f2f2ea'; rctx.lineWidth = Math.max(1, DPR);
    rctx.beginPath();   // what the screen shows: a diamond on the map in the iso view
    [[0, 0], [W, 0], [W, H], [0, H]].forEach(([sx, sy], i) => { const p = s2w(sx, sy); rctx[i ? 'lineTo' : 'moveTo'](p.x / CELL * k, p.y / CELL * k); });
    rctx.closePath(); rctx.stroke();
  }

  // ---------------------------------------------------------------------------
  // Selection & commands
  // ---------------------------------------------------------------------------
  // What is under a tap or click. Structures count from their footprint up through the walls and
  // roof drawn above it. A unit in front of a structure wins the tap: structures rank a little
  // lower, but that never stops a tap squarely on one from picking it, at any zoom.
  // (In the iso view the tap is measured on the view plane, where things are drawn.)
  // A structure on the view plane: its footprint's outline and the walls and roof drawn above it.
  function bldBox(e) {
    const xs = [], ys = [];
    for (const [x, y] of [[e.cx, e.cy], [e.cx + e.w, e.cy], [e.cx, e.cy + e.h], [e.cx + e.w, e.cy + e.h]]) { const p = toView(x * CELL, y * CELL); xs.push(p[0]); ys.push(p[1]); }
    return [Math.min(...xs), Math.min(...ys) - CELL * 0.8 * VK, Math.max(...xs), Math.max(...ys)];
  }
  // A unit on the view plane, raised by its height and h more.
  const unitSpot = (e, h) => toView(...liftPt(e.x, e.y, (e.alt || 0) + (h || 0)));
  function pick(wx, wy, slop) {
    const [X, Y] = toView(wx, wy);
    let best = null, bd = Infinity;
    for (const e of G.entities) {
      if (!e.alive || !visibleToPlayer(e) || (e.def && e.def.scripted)) continue;
      let d, rank;
      if (e.kind === 'bld') {
        const [bx0, by0, bx1, by1] = bldBox(e);
        const dx = Math.max(bx0 - X, 0, X - bx1), dy = Math.max(by0 - Y, 0, Y - by1);
        d = Math.hypot(dx, dy); rank = d + 4;
      } else {
        const [ex, ey] = unitSpot(e, e.cls === 'inf' ? 3 : 0);
        d = rank = Math.max(0, Math.hypot(X - ex, Y - ey) - e.def.r);
      }
      if (d <= slop && rank < bd) { bd = rank; best = e; }
    }
    return best;
  }
  const ownUnits = () => G.selection.filter((e) => e.alive && e.kind === 'unit' && e.team === G.me);
  function select(list) { G.selection = list; }
  const producersOfType = (b) => G.entities.filter((e) => e.alive && e.kind === 'bld' && e.team === b.team && e.type === b.type && e.sellT <= 0);
  // The building of this type that new units come out of (as spawnUnit picks it).
  const activeProducer = (b) => { const l = producersOfType(b); return l.find((e) => e.primary) || l[l.length - 1]; };
  function marker(x, y, color) { G.effects.push({ type: 'ring', x, y, color, t: 0, life: 0.5 }); }

  let lastTap = null;
  // Attack ground (the ATTACK GROUND button): aimSpan holds the units waiting for the next tap, which orders them to
  // fire at that spot, or at the bridge span there (world.js commandAttackGround).
  let aimSpan = null, spanSig = '', wallArmed = null;
  const WALL_SELL_GAP = 600;   // ms: a second tap on your own wall sooner than this is part of a double tap, not a confirmation
  function tap(sx, sy, shift) {
    if (!G || G.over) return;
    const w = s2w(sx, sy);
    if (G.place) { placeTap(w); return; }
    if (aimSpan) {
      const units = aimSpan.filter((u) => u.alive), hit = pick(w.x, w.y, (isTouch ? 16 : 6) / cam.z);
      aimSpan = null;
      if (units.length && !(hit && hit.team !== undefined && hostile(hit.team, G.me))) {   // (an enemy under the tap: the usual attack order below)
        commandAttackGround(units, w.x, w.y);
        marker(w.x, w.y, '#ff4a3a'); Sound.ack(units[0].cls === 'inf' ? 'attack' : units[0].cls);
        return;
      }
    }
    // Engineers: tap a destroyed bridge span to rebuild it, or a damaged structure of your side or an ally's to repair it.
    const engs = G.selection.filter((u) => u.alive && u.kind === 'unit' && u.team === G.me && u.def.engineer);
    if (engs.length) {
      const down = spanAt(w.x, w.y), bld = pick(w.x, w.y, (isTouch ? 16 : 6) / cam.z);
      const job = down && !down.alive ? down : bld && bld.kind === 'bld' && engineerJob(engs[0], bld) ? bld : null;
      if (job) { commandEngineer(engs, job); marker(job.x, job.y, '#3ed04a'); Sound.ack('inf'); return; }
    }
    const slop = (isTouch ? 16 : 6) / cam.z;
    const e = pick(w.x, w.y, slop);
    const mine = ownUnits();
    // A village house under the tap: infantry selected go in (if it is free or yours); your own garrison is selected
    // with nothing else to do; an enemy's is attacked.
    const hh = !e && (houseAt(w.x, w.y) || houseAt(w.x, w.y + CELL * 0.8));
    if (hh && houseSeen(hh)) {
      const inf = mine.filter((u) => canGarrison(u) && u.inHouse !== hh);
      if (inf.length && (!hh.n || hh.team === G.me)) {
        if (houseOpen(hh, G.me)) { commandGarrison(inf, hh); marker(hh.x, hh.y, '#3ed04a'); Sound.ack('inf'); } else evaCalm('Building full', 3);
        return;
      }
      if (hh.n && hh.team === G.me) { select(garrisonOf(hh)); Sound.play('click'); return; }
      const able = mine.filter((u) => !u.def.harvester && canTarget(u, hh));
      if (hh.n && hostile(hh.team, G.me) && able.length) { commandAttack(able, hh); marker(hh.x, hh.y, '#ff4a3a'); Sound.ack(able[0].cls === 'inf' ? 'attack' : able[0].cls); return; }
    }
    // A wall or gate under the tap (and nothing else): an enemy's is attacked by the selected fighters; your own,
    // with nothing selected, is taken down on a second tap for half its price.
    const wc = cellOfPos(Math.max(0, Math.min(WORLD - 1, w.x)), Math.max(0, Math.min(WORLD - 1, w.y)));
    if (!e && G.wallN && G.wall[wc] && G.seen[wc]) {
      const wd = WALL_BY_ID[G.wall[wc]], now = performance.now();
      if (hostile(G.wallTeam[wc], G.me)) {
        const able = mine.filter((u) => !u.def.harvester && (u.def.weapon || u.cls === 'air'));
        if (able.length) { commandAttackGround(able, w.x, w.y); marker((cellX(wc) + 0.5) * CELL, (cellY(wc) + 0.5) * CELL, '#ff4a3a'); Sound.ack(able[0].cls === 'inf' ? 'attack' : able[0].cls); return; }
      } else if (G.wallTeam[wc] === G.me && !mine.length) {
        if (wallArmed && wallArmed.c === wc && now - wallArmed.t < WALL_SELL_GAP) return;   // a double tap or double click never sells: the second tap must be on its own
        if (wallArmed && wallArmed.c === wc && now - wallArmed.t < 5000) { wallArmed = null; sellWall(G.teams[G.me], cellX(wc), cellY(wc)); Sound.play('click'); }
        else { wallArmed = { c: wc, t: now }; evaCalm(`Tap again to take down this ${wd.gate ? 'Gate' : 'piece'} for $${Math.floor(wd.cost / 2)}`, 5); }
        return;
      }
    }
    if (e && e.team === G.me) {
      if (e.kind === 'bld' && e.type === 'refinery' && mine.length && mine.every((u) => u.def.harvester)) {
        for (const u of mine) { u.hs = 'return'; u.dest = null; }
        marker(e.x, e.y, '#3ed04a');
        return;
      }
      // Damaged vehicles selected and your own Service Depot tapped: off for repairs.
      const fix = e.kind === 'bld' && e.def.depot ? mine.filter((u) => canService(u) && u.hp < u.maxHp) : [];
      if (fix.length) { commandRepair(fix, e); marker(e.x, e.y, '#3ed04a'); Sound.ack('veh'); return; }
      const now = performance.now();
      const dbl = lastTap && now - lastTap.t < 350 && lastTap.type === e.type;
      lastTap = { t: now, type: e.type };
      if (dbl && e.kind === 'bld' && canRally(e) && producersOfType(e).length > 1) {
        setPrimary(e); select([e]); eva('Primary building set'); Sound.ack('veh'); return;
      }
      if (dbl && e.kind === 'unit') {
        const vx = cam.x, vy = cam.y, vw = W / cam.z, vh = H / cam.z;
        select(unitsOf(G.me).filter((u) => { const [x, y] = toView(u.x, u.y); return u.type === e.type && !u.chute && x > vx && x < vx + vw && y > vy && y < vy + vh; }));
        return;
      }
      if (shift && e.kind === 'unit') {
        const i = G.selection.indexOf(e);
        if (i >= 0) G.selection.splice(i, 1); else select(mine.concat(e));
        return;
      }
      select([e]);
      return;
    }
    if (mine.length) {
      if (e && e.team !== undefined && hostile(e.team, G.me)) {
        const able = mine.filter((u) => canTarget(u, e));
        if (able.length) { commandAttack(able, e); marker(e.x, e.y - (e.alt || 0), '#ff4a3a'); Sound.ack(able[0].cls === 'inf' ? 'attack' : able[0].cls); return; }
      }
      commandMove(mine, w.x, w.y);
      Sound.ack(mine[0].cls);
      marker(w.x, w.y, '#3ed04a');
      return;
    }
    select(e ? [e] : []);
  }

  function boxSelect(sx0, sy0, sx1, sy1, add) {
    const v = (sx, sy) => ({ x: cam.x + sx / cam.z, y: cam.y + sy / cam.z });   // (the box is on the view plane)
    const a = v(Math.min(sx0, sx1), Math.min(sy0, sy1)), b = v(Math.max(sx0, sx1), Math.max(sy0, sy1));
    const inBox = unitsOf(G.me).filter((u) => { const [x, y] = unitSpot(u); return !u.def.scripted && !u.inHouse && x > a.x && x < b.x && y > a.y && y < b.y; });
    const fighters = inBox.filter((u) => !u.def.harvester);
    const chosen = fighters.length ? fighters : inBox;
    if (add) select(Array.from(new Set(ownUnits().concat(chosen))));
    else if (chosen.length) select(chosen);
  }

  // ---------------------------------------------------------------------------
  // Structure placement
  // ---------------------------------------------------------------------------
  function beginPlace(type) {
    G.place = { type };
    select([]);
    const d = BUILD_DEFS[type];
    ui.placeText.textContent = isTouch ? `Tap near your base to place the ${d.name}` : `Click near your base to place the ${d.name}`;
    ui.placeOk.hidden = !isTouch;
    ui.placebar.hidden = false;
    refreshPlaceBtn();
  }
  // Airfield powers use the same bar: the first tap aims, a second tap (or LAUNCH) calls it in.
  function beginTarget(key) {
    G.place = { power: key };
    select([]);
    ui.placeText.textContent = `${isTouch ? 'Tap' : 'Click'} the map to target the ${POWERS[key].name}`;
    ui.placeOk.textContent = 'LAUNCH';
    ui.placeOk.hidden = !isTouch;
    ui.placebar.hidden = false;
    refreshPlaceBtn();
    eva('Select target');
  }
  // Guard: the next tap on the map is the area the selected units hold.
  function beginGuard(units) {
    if (!units.length) return;
    G.place = { guard: units };
    select([]);
    ui.placeText.textContent = `${isTouch ? 'Tap' : 'Click'} the area to guard`;
    ui.placeOk.hidden = true;
    ui.placebar.hidden = false;
  }
  // Rally: the next tap on the map is where this building's new units go.
  function beginRally(b) {
    G.place = { rally: b };
    ui.placeText.textContent = `${isTouch ? 'Tap' : 'Click'} where new units from this ${b.def.name} should go`;
    ui.placeOk.hidden = true;
    ui.placebar.hidden = false;
  }
  // Walls and gates: the first tap is where the line starts, the next where it ends (tap again to move the end),
  // then BUILD. The bar says how many pieces can stand and what they cost. It stays in wall mode for the next line.
  function beginWall(kind) {
    G.place = { wall: kind };
    select([]);
    ui.placeOk.textContent = 'BUILD';
    ui.placeOk.hidden = false;
    ui.placebar.hidden = false;
    wallBar();
  }
  function wallBar() {
    const p = G.place, d = WALLS[p.wall], team = G.teams[G.me];
    let n = 0, back = 0;
    if (p.ax !== undefined) {
      const blds = buildingsOf(team.id), cs = wallLine(p.wall, p.ax, p.ay, p.bx, p.by);
      n = cs.filter((c) => (d.gate ? gateCellOk(team, c, blds) : wallOk(team, c, blds))).length;
      if (d.gate) { n = n === 3 ? 1 : 0; back = gateRefund(team, cs); }   // over your own wall: those pieces come back at half price
    }
    const can = Math.min(n, Math.floor((team.credits + back) / d.cost));
    p.ok = can > 0;
    ui.placeText.textContent = p.ax === undefined ? (d.gate ? `${isTouch ? 'Tap' : 'Click'} where the middle of the Gate goes: it is three cells wide` : `${isTouch ? 'Tap' : 'Click'} where the ${d.name} start, then where they end`)
      : !n ? `${d.name} cannot stand there` : d.gate ? `Gate: $${d.cost}${back ? `, replacing your wall ($${back} back)` : ''}. ${isTouch ? 'Tap' : 'Click'} it again to turn it` : `${d.name}: ${can} ${can === 1 ? 'piece' : 'pieces'}, $${can * d.cost}${can < n ? ' (all you can afford)' : p.ax === p.bx && p.ay === p.by ? '. Tap where the line ends' : ''}`;
    refreshPlaceBtn();
  }
  function endPlace() { if (G) G.place = null; ui.placebar.hidden = true; ui.placeOk.textContent = 'PLACE'; clampCam(); }
  function ghostAt(w) {
    if (G.place.wall) return;
    if (G.place.power || G.place.guard || G.place.rally) { G.place.x = w.x; G.place.y = w.y; G.place.ok = true; refreshPlaceBtn(); return; }
    const d = BUILD_DEFS[G.place.type];
    G.place.cx = Math.round(w.x / CELL - d.w / 2);
    G.place.cy = Math.round(w.y / CELL - d.h / 2);
    G.place.ok = canPlace(G.teams[G.me], G.place.type, G.place.cx, G.place.cy, 0);
    refreshPlaceBtn();
  }
  function refreshPlaceBtn() { ui.placeOk.disabled = !(G.place && G.place.ok); }
  function confirmPlace() {
    const p = G.place;
    if (p && p.wall) {
      if (p.ax === undefined || !p.ok) return;
      placeWalls(G.teams[G.me], p.wall, p.ax, p.ay, p.bx, p.by);
      Sound.play('click');
      G.place = { wall: p.wall };
      setTimeout(() => { if (G && G.place && G.place.wall) wallBar(); }, 50);
      return;
    }
    if (p && p.guard) {
      const units = p.guard.filter((u) => u.alive);
      if (p.x === undefined || !units.length) { endPlace(); return; }
      commandGuard(units, p.x, p.y); marker(p.x, p.y, '#5ee060'); Sound.ack(units[0].cls); endPlace();
      return;
    }
    if (p && p.rally) {
      const b = p.rally;
      if (p.x !== undefined && b.alive) { setRally(b, p.x, p.y); marker(p.x, p.y, '#5ee060'); Sound.ack('veh'); select([b]); }
      endPlace();
      return;
    }
    if (p && p.power) {
      if (p.x === undefined) return;
      if (launchPower(G.teams[G.me], p.power, p.x, p.y)) { marker(p.x, p.y, '#ff4a3a'); Sound.ack('air'); endPlace(); }
      else { eva('Not available'); endPlace(); }
      return;
    }
    if (!p || p.cx === undefined) return;
    if (placeStructure(G.teams[G.me], p.type, p.cx, p.cy)) endPlace();
    else eva('Cannot deploy here');
  }
  function placeTap(w) {
    const p = G.place;
    if (p.wall) {
      const cx = Math.floor(w.x / CELL), cy = Math.floor(w.y / CELL);
      if (WALLS[p.wall].gate) {
        // A gate: the tap is its middle. Tapped on your own wall it lies along the wall, replacing those pieces; else
        // across the gap in a wall when there is one (or the way it fits). A second tap on the same cell turns it.
        if (p.ax === cx && p.ay === cy) p.vert = !p.vert;
        else {
          const team = G.teams[G.me], blds = buildingsOf(team.id), W = (x, y) => inMap(x, y) && G.wall[idx(x, y)] > 0, fits = (dx, dy) => [-1, 0, 1].every((k) => inMap(cx + k * dx, cy + k * dy) && gateCellOk(team, idx(cx + k * dx, cy + k * dy), blds));
          const own = (x, y) => inMap(x, y) && ownPiece(team, idx(x, y));
          const h = W(cx - 2, cy) || W(cx + 2, cy), v = W(cx, cy - 2) || W(cx, cy + 2);
          if (own(cx, cy)) { const oh = own(cx - 1, cy) || own(cx + 1, cy), ov = own(cx, cy - 1) || own(cx, cy + 1); p.vert = ov && !oh ? true : oh ? false : !fits(1, 0) && fits(0, 1); }
          else p.vert = v && !h ? true : h ? false : !fits(1, 0) && fits(0, 1);
          p.ax = cx; p.ay = cy;
        }
        p.bx = p.ax + (p.vert ? 0 : 1); p.by = p.ay + (p.vert ? 1 : 0);
      } else if (p.ax === undefined) { p.ax = p.bx = cx; p.ay = p.by = cy; } else { p.bx = cx; p.by = cy; }
      wallBar();
      return;
    }
    if (p.guard || p.rally) { ghostAt(w); confirmPlace(); return; }
    if (p.power) {
      if (!isTouch || (p.x !== undefined && Math.hypot(w.x - p.x, w.y - p.y) < 30 / cam.z)) { ghostAt(w); confirmPlace(); }
      else ghostAt(w);
      return;
    }
    const d = BUILD_DEFS[p.type];
    const cx = Math.floor(w.x / CELL), cy = Math.floor(w.y / CELL);
    // Touch: the first tap drops a ghost; tapping the ghost again builds it.
    if (!isTouch || (p.cx !== undefined && cx >= p.cx && cx < p.cx + d.w && cy >= p.cy && cy < p.cy + d.h)) {
      if (!isTouch) ghostAt(w);
      confirmPlace();
      return;
    }
    ghostAt(w);
  }
  ui.placeOk.addEventListener('click', confirmPlace);
  ui.placeCancel.addEventListener('click', endPlace);

  // ---------------------------------------------------------------------------
  // Pointer input on the battlefield
  // ---------------------------------------------------------------------------
  const pointers = new Map();
  let gesture = null, longPress = null;
  const keys = new Set();
  const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  // A finger whose lift the page never hears about (an alert or notification, a swipe from the
  // screen edge, the app sent to the background) would stay "down" for good: every later drag
  // became a pinch with it, and taps never landed, until the app was restarted.
  const resetPointers = () => { pointers.clear(); gesture = null; clearTimeout(longPress); };
  window.addEventListener('blur', resetPointers);
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetPointers(); });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    // The first finger of a new touch: nothing else can be down, so anything still held is stale.
    if (e.isPrimary) resetPointers();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (e.pointerType === 'mouse') {
      if (e.button === 2) { if (G && G.place) endPlace(); else if (G) select([]); return; }
      if (e.button === 1) { gesture = { type: 'pan', id: e.pointerId, sx: p.x, sy: p.y, moved: true }; return; }
      gesture = { type: 'maybeBox', id: e.pointerId, sx: p.x, sy: p.y, ex: p.x, ey: p.y, moved: false, shift: e.shiftKey };
      return;
    }
    if (pointers.size === 2) {
      clearTimeout(longPress);
      const [a, b] = [...pointers.values()];
      gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: cam.z, anchor: { x: cam.x + (a.x + b.x) / 2 / cam.z, y: cam.y + (a.y + b.y) / 2 / cam.z } };   // (on the view plane)
      return;
    }
    if (pointers.size > 2) return;
    gesture = { type: boxMode ? 'box' : 'touch', id: e.pointerId, sx: p.x, sy: p.y, ex: p.x, ey: p.y, moved: false };
    if (!boxMode) longPress = setTimeout(() => { if (gesture && gesture.type === 'touch' && !gesture.moved) { gesture.type = 'box'; gesture.held = true; } }, 450);
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (e.pointerType === 'mouse' && G && G.place) ghostAt(s2w(p.x, p.y));
    const prev = pointers.get(e.pointerId);
    if (!prev || !gesture) return;
    const dx = p.x - prev.x, dy = p.y - prev.y;
    prev.x = p.x; prev.y = p.y;
    if (gesture.type === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      cam.z = snapZ(gesture.z0 * Math.hypot(a.x - b.x, a.y - b.y) / gesture.d0);
      cam.x = gesture.anchor.x - (a.x + b.x) / 2 / cam.z;
      cam.y = gesture.anchor.y - (a.y + b.y) / 2 / cam.z;
      clampCam();
      return;
    }
    if (e.pointerId !== gesture.id) return;
    if (Math.hypot(p.x - gesture.sx, p.y - gesture.sy) > 9) gesture.moved = true;
    gesture.ex = p.x; gesture.ey = p.y;
    if (gesture.type === 'touch' && gesture.moved) { clearTimeout(longPress); gesture.type = 'pan'; }
    if (gesture.type === 'maybeBox' && gesture.moved) gesture.type = 'box';
    if (gesture.type === 'pan') { cam.x -= dx / cam.z; cam.y -= dy / cam.z; clampCam(); }
  });
  function endPointer(e, cancelled) {
    pointers.delete(e.pointerId);
    if (!gesture) return;
    if (gesture.type === 'pinch' || gesture.type === 'dead') { gesture = pointers.size ? { type: 'dead' } : null; return; }
    if (e.pointerId !== gesture.id) return;
    clearTimeout(longPress);
    const g = gesture;
    gesture = null;
    if (cancelled || !G) return;
    if (g.type === 'box' && g.moved) boxSelect(g.sx, g.sy, g.ex, g.ey, g.shift);
    else if (!g.moved) tap(g.sx, g.sy, g.shift);
  }
  canvas.addEventListener('pointerup', (e) => endPointer(e, false));
  canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e), w = { x: cam.x + p.x / cam.z, y: cam.y + p.y / cam.z };   // (on the view plane)
    cam.z = snapZ(cam.z + Math.sign(-e.deltaY) * Math.max(1 / DPR, cam.z * 0.12));
    cam.x = w.x - p.x / cam.z; cam.y = w.y - p.y / cam.z;
    clampCam();
  }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (!G || (e.target.closest && e.target.closest('input, textarea'))) return;   // typing a name, not commanding
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys.add(k);
    if (k === 'Escape') { if (G.place) endPlace(); else select([]); }
    if (k === 'h') { const cy = G.entities.find((b) => b.team === G.me && b.type === 'cy') || buildingsOf(G.me)[0]; if (cy) centerOn(cy.x, cy.y); }
    if (k === 'p' || k === ' ') { e.preventDefault(); togglePause(); }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  window.addEventListener('blur', () => keys.clear());

  let radarDrag = false;
  function radarJump(e) {
    if (!radarOn()) return;
    const r = radar.getBoundingClientRect();
    centerOn((e.clientX - r.left) / r.width * WORLD, (e.clientY - r.top) / r.height * WORLD);
  }
  radar.addEventListener('pointerdown', (e) => { e.preventDefault(); radarDrag = true; try { radar.setPointerCapture(e.pointerId); } catch (_) {} radarJump(e); });
  radar.addEventListener('pointermove', (e) => { if (radarDrag) radarJump(e); });
  radar.addEventListener('pointerup', () => { radarDrag = false; });
  radar.addEventListener('pointercancel', () => { radarDrag = false; });

  ui.boxBtn.addEventListener('click', () => {
    boxMode = !boxMode;
    ui.boxBtn.setAttribute('aria-pressed', String(boxMode));
    eva(boxMode ? 'Drag to select units' : 'Drag to scroll');
  });

  // ---------------------------------------------------------------------------
  // Sidebar
  // ---------------------------------------------------------------------------
  // Left column builds structures, right column builds units, as on the classic sidebar.
  let cameoSig = { L: '', R: '' };
  const cameoEls = new Map();
  const UNIT_ORDER = ['infantry', 'vehicle', 'heli', 'jet'];
  function stripTypes(team, side) {
    if (side === 'L') {
      const powers = hasBuilt(team, 'airfield') ? Object.keys(POWERS).map((k) => 'pw:' + k) : [];
      // (a queued structure stays on the list after a building it needs is lost, so it can be placed or cancelled)
      const q = team.queues.structure;
      return powers.concat(Object.keys(BUILD_DEFS).filter((k) => available(team, k) || (q && q.type === k)), Object.keys(WALLS).filter((k) => wallAvailable(team, k)).map((k) => 'wl:' + k));
    }
    // (so do queued units whose producer is lost: they wait, and can be cancelled)
    const queued = new Set(UNIT_ORDER.flatMap((c) => (team.queues[c] || []).map((i) => i.type)));
    return Object.keys(UNIT_DEFS).filter((k) => available(team, k) || queued.has(k))
      .sort((a, b) => UNIT_ORDER.indexOf(UNIT_DEFS[a].cat) - UNIT_ORDER.indexOf(UNIT_DEFS[b].cat));
  }

  function rebuildStrip(team, side, types) {
    const strip = side === 'L' ? ui.stripL : ui.stripR;
    for (const b of strip.querySelectorAll('.cameo')) cameoEls.delete(b.dataset.type);
    strip.innerHTML = '';
    if (!types.length) {
      const msg = document.createElement('p');
      msg.className = 'empty';
      msg.textContent = side === 'L' ? 'Construction Yard lost' : 'Build a Barracks or War Factory';
      strip.appendChild(msg);
      return;
    }
    for (const type of types) {
      const pw = type.startsWith('pw:'), wl = type.startsWith('wl:'), d = pw ? POWERS[type.slice(3)] : wl ? WALLS[type.slice(3)] : defOf(type);
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'cameo'; btn.dataset.type = type;
      btn.title = pw ? d.name : `${d.name}: $${d.cost}`;
      btn.innerHTML = `<img alt="" src="${cameoURL(type, team.faction, team.variant)}"><span class="nm">${d.name}</span><span class="cost">${pw ? '' : '$' + d.cost}</span><span class="clock"></span><span class="st"></span><span class="ct"></span>`;
      strip.appendChild(btn);
      cameoEls.set(type, { btn, clock: btn.querySelector('.clock'), st: btn.querySelector('.st'), ct: btn.querySelector('.ct') });
    }
  }
  for (const b of document.querySelectorAll('.sb-arrows [data-scroll]')) {
    b.addEventListener('click', () => {
      const strip = b.dataset.scroll === 'L' ? ui.stripL : ui.stripR, cam = strip.querySelector('.cameo');
      strip.scrollBy({ top: (+b.dataset.dir) * ((cam ? cam.offsetHeight : 48) + 3) * 2, behavior: 'smooth' });
    });
  }
  function cameoAction(type) {
    if (!G || G.over) return;
    Sound.play('click');
    const team = G.teams[G.me];
    if (type.startsWith('pw:')) {
      const key = type.slice(3);
      if (powerReady(team, key)) beginTarget(key); else eva('Not available');
      return;
    }
    if (type.startsWith('wl:')) {   // walls and gates: straight to laying a line, paid for by the piece
      const kind = type.slice(3);
      if (G.place && G.place.wall === kind) endPlace(); else if (wallAvailable(team, kind)) beginWall(kind); else eva('Not available');
      return;
    }
    // Training / Building is said when a queue starts, not for every unit added to it.
    const cat = catOf(type), wasBusy = cat === 'structure' ? !!team.queues.structure : team.queues[cat].length > 0;
    const res = startProduction(team, type);
    if (res === 'place') beginPlace(type);
    else if (res === 'busy') evaCalm('Unable to comply. Building in progress', 4);
    else if (res === 'busy-same') evaCalm('Building', 6);
    else if (res === 'full') evaCalm('Queue is full', 4);
    else if (res === 'pads-full') evaCalm(UNIT_DEFS[type].producer === 'helipad' ? 'Helicopter Base full. Build another base' : 'Airfield full. Build another Airfield', 4);
    else if (res) eva(res);
    else if (!wasBusy) evaCalm(cat === 'infantry' ? 'Training' : 'Building', 6);
  }
  function cameoCancel(type) {
    if (!G) return;
    const team = G.teams[G.me];
    if (type.startsWith('pw:')) { if (G.place && G.place.power === type.slice(3)) endPlace(); return; }
    if (type.startsWith('wl:')) { if (G.place && G.place.wall === type.slice(3)) endPlace(); return; }
    if (G.place && G.place.type === type) endPlace();
    if (cancelProduction(team, type)) eva('Cancelled');
  }
  // Tap builds; press and hold (or right click) cancels, like the classic sidebar.
  let holdTimer = null, held = false;
  ui.strips.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.cameo');
    if (!b) return;
    held = false;
    if (e.button === 2) return;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => { held = true; cameoCancel(b.dataset.type); }, 550);
  });
  const clearHold = () => clearTimeout(holdTimer);
  ui.strips.addEventListener('pointerup', clearHold);
  ui.strips.addEventListener('pointercancel', clearHold);
  ui.strips.addEventListener('pointerleave', clearHold);
  ui.strips.addEventListener('click', (e) => {
    const b = e.target.closest('.cameo');
    if (!b || held) { held = false; return; }
    cameoAction(b.dataset.type);
  });
  ui.strips.addEventListener('contextmenu', (e) => {
    const b = e.target.closest('.cameo');
    e.preventDefault();
    if (b) cameoCancel(b.dataset.type);
  });

  ui.autoBtn.addEventListener('click', () => {
    if (!G) return;
    const team = G.teams[G.me];
    // A team game with more than one enemy side: a picker says whom to attack.
    if (G.teams.filter((t) => hostile(team.id, t.id)).length > 1) { autoPicker(team); return; }
    if (!team.auto && !enemyBaseKnown()) { evaCalm('Enemy base not located', 4); return; }   // scout it first
    setAuto(team, !team.auto);
    ui.autoBtn.setAttribute('aria-pressed', String(team.auto));
    if (team.auto) {
      eva('Auto attack on');
    } else eva('Auto attack off. New units guard the base');
  });
  // The Auto Attack picker (team games): each enemy side by colour and name, only those whose base this
  // side has found (scouted) can be picked; "Nearest" leaves the choice to the units, as before.
  const sideColour = (t) => FACTIONS[t.faction][t.variant === 2 ? 'alt2' : t.variant ? 'alt' : 'pal'].main;
  const COLOUR_NAMES = { allies: ['blue', 'green', 'teal'], soviets: ['red', 'amber', 'purple'] };
  const sideLabel = (t) => `${t.name || (t.isAI ? 'Computer' : 'Commander')} · ${FACTIONS[t.faction].name} (${COLOUR_NAMES[t.faction][t.variant | 0]})`;
  const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let pickerEl = null, aimWas = '';
  function autoPicker(team) {
    if (!pickerEl) {
      pickerEl = document.createElement('div'); pickerEl.id = 'autoPick'; pickerEl.className = 'nw-wrap';
      pickerEl.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-pick]');
        if (!b) { if (!ev.target.closest('.nw-card')) pickerEl.hidden = true; return; }
        if (b.disabled) return;
        pickerEl.hidden = true;
        if (!G || G.over) return;
        const me = G.teams[G.me], v = b.dataset.pick;
        if (v === 'off') { setAuto(me, false); eva('Auto attack off. New units guard the base'); }
        else if (v === 'near') { setAuto(me, true, null); eva('Auto attack on'); }
        else if (v !== 'cancel') { const t = G.teams[+v]; setAuto(me, true, t.id); eva(`Auto attack on: ${sideLabel(t)}`); }
        ui.autoBtn.setAttribute('aria-pressed', String(!!me.auto));
      });
      document.body.append(pickerEl);
    }
    const foes = G.teams.filter((t) => hostile(team.id, t.id));
    const cur = team.auto ? (team.focusSide == null ? 'near' : String(team.focusSide)) : null;
    const row = (t) => {
      const out = t.out || !inTheFight(t.id), known = !out && enemyBaseKnown(team.id, t.id);
      const note = out ? 'Defeated' : known ? '' : 'Not scouted';
      return `<button type="button" class="pf-btn ap-row${cur === String(t.id) ? ' on' : ''}" data-pick="${t.id}"${known ? '' : ' disabled'}>`
        + `<i style="background:${sideColour(t)}"></i>${esc(sideLabel(t))}${note ? `<small>${note}</small>` : ''}</button>`;
    };
    const any = enemyBaseKnown(team.id);
    pickerEl.innerHTML = '<div class="nw-card" role="dialog" aria-label="Auto attack"><p class="nw-title">Auto attack</p>'
      + `<p class="nw-sub">${any ? 'Choose the enemy to attack.' : 'No enemy base located yet: scout first.'}</p><div class="ap-list">`
      + foes.map(row).join('')
      + `<button type="button" class="pf-btn ap-row${cur === 'near' ? ' on' : ''}" data-pick="near"${any ? '' : ' disabled'}><i class="ap-any"></i>Nearest enemy</button>`
      + (team.auto ? '<button type="button" class="pf-btn ap-row" data-pick="off">Auto attack off</button>' : '')
      + '<button type="button" class="pf-btn ap-row ap-cancel" data-pick="cancel">Cancel</button></div></div>';
    pickerEl.hidden = false;
  }
  ui.allyBtn.addEventListener('click', () => {
    if (!G) return;
    const team = G.teams[G.me], allies = G.teams.filter((o) => o !== team && o.ally === team.ally && !o.out);
    if (!team.assist && !allies.length) { evaCalm('No ally to help', 4); return; }
    // More than one ally (3 v 3 and larger maps): a picker says which one to defend.
    if (allies.length > 1) { allyPicker(team, allies); return; }
    setAssist(team, !team.assist, allies[0] && allies[0].id);
    ui.allyBtn.setAttribute('aria-pressed', String(!!team.assist));
    ui.autoBtn.setAttribute('aria-pressed', String(!!team.auto));
    eva(team.assist ? 'Defending our ally' : 'Ally support off. Units stay and defend');
  });
  // The Ally picker: each ally still in the fight by colour and name; the one being defended is marked.
  let allyPickEl = null;
  function allyPicker(team, allies) {
    if (!allyPickEl) {
      allyPickEl = document.createElement('div'); allyPickEl.id = 'allyPick'; allyPickEl.className = 'nw-wrap';
      allyPickEl.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-pick]');
        if (!b) { if (!ev.target.closest('.nw-card')) allyPickEl.hidden = true; return; }
        allyPickEl.hidden = true;
        if (!G || G.over) return;
        const me = G.teams[G.me], v = b.dataset.pick;
        if (v === 'off') { setAssist(me, false); eva('Ally support off. Units stay and defend'); }
        else if (v !== 'cancel') { const t = G.teams[+v]; setAssist(me, true, t.id); eva(`Defending ${sideLabel(t)}`); }
        ui.allyBtn.setAttribute('aria-pressed', String(!!me.assist));
        ui.autoBtn.setAttribute('aria-pressed', String(!!me.auto));
      });
      document.body.append(allyPickEl);
    }
    const cur = team.assist ? assistAlly(team) : null;
    const row = (t) => `<button type="button" class="pf-btn ap-row${cur === t ? ' on' : ''}" data-pick="${t.id}"><i style="background:${sideColour(t)}"></i>${esc(sideLabel(t))}</button>`;
    allyPickEl.innerHTML = '<div class="nw-card" role="dialog" aria-label="Defend ally"><p class="nw-title">Defend ally</p>'
      + '<p class="nw-sub">Choose the ally to send your units to.</p><div class="ap-list">'
      + allies.map(row).join('')
      + (team.assist ? '<button type="button" class="pf-btn ap-row" data-pick="off">Ally support off</button>' : '')
      + '<button type="button" class="pf-btn ap-row ap-cancel" data-pick="cancel">Cancel</button></div></div>';
    allyPickEl.hidden = false;
  }
  // GIVE: a card with each ally still in the fight and the amounts to send (`sendCredits`). The
  // battle keeps running behind it; amounts this side cannot afford are greyed out.
  let giveEl = null;
  const giveAllies = () => { const me = G.teams[G.me]; return G.teams.filter((o) => o !== me && o.ally === me.ally && !o.out); };
  function giveFill() {
    const me = G.teams[G.me], have = Math.floor(me.credits);
    const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    giveEl.querySelector('.gv-list').innerHTML = giveAllies().map((o) => `<p class="gv-name"><i style="background:${sideColour(o)}"></i>${esc(sideLabel(o))}</p><div class="gv-row">`
      + GIVE_AMOUNTS.map((n) => `<button type="button" class="pf-btn" data-to="${o.id}" data-n="${n}"${have < n ? ' disabled' : ''}>${n}</button>`).join('')
      + `<input class="gv-in" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="7" autocomplete="off" placeholder="Other amount" aria-label="Other amount" data-in="${o.id}">`
      + `<button type="button" class="pf-btn" data-send="${o.id}">Send</button></div>`).join('');
  }
  // A typed amount: whole credits; more than this side has sends all it has (`sendCredits`).
  function giveTyped(to) {
    const inp = giveEl.querySelector(`[data-in="${to}"]`), n = /^\d+$/.test(inp.value.trim()) ? +inp.value.trim() : 0;
    if (!(n > 0)) { inp.classList.add('bad'); inp.focus(); return false; }
    sendCredits(G.teams[G.me], +to, n);
    return true;
  }
  // The Tech Center's upgrades (UPGRADES in data.js): a card listing this faction's, with Research / Cancel. One at a time per side.
  let upEl = null, upSig = '';
  function upFill() {
    const me = G.teams[G.me], r = me.research, ids = Object.keys(UPGRADES).filter((k) => UPGRADES[k].factions.includes(me.faction));
    const html = ids.map((k) => {
      const u = UPGRADES[k], done = hasUpgrade(me, k), busy = r && r.id === k;
      const btn = done ? '<span class="up-done">Researched ✓</span>'
        : busy ? `<span class="up-pct">${Math.floor(r.progress * 100)}%${r.stalled ? ' · on hold' : ''}</span><button type="button" class="pf-btn" data-cancel="${k}">Cancel</button>`
        : `<button type="button" class="pf-btn" data-up="${k}"${r ? ' disabled' : ''}>${u.unlocks ? UNIT_DEFS[u.unlocks].name : u.name} · $${u.cost} · ${u.time} s</button>`;
      return `<div class="up-item"><p class="up-name">${u.name}</p><p class="up-desc">${u.desc}</p><div class="up-row">${btn}</div></div>`;
    }).join('') || '<p class="up-desc">No upgrades for this side yet.</p>';
    if (html !== upSig) { upSig = html; upEl.querySelector('.up-list').innerHTML = html; }
  }
  function openUpgrades() {
    if (!G || G.over) return;
    if (!upEl) {
      upEl = document.createElement('div'); upEl.id = 'upgrades'; upEl.className = 'nw-wrap';
      upEl.innerHTML = '<div class="nw-card" role="dialog" aria-label="Upgrades"><p class="nw-title">Tech Center upgrades</p><div class="up-list"></div>'
        + '<button type="button" class="pf-btn" data-b="close">Close</button></div>';
      upEl.addEventListener('click', (ev) => {
        const b = ev.target.closest('button');
        if (ev.target !== upEl && !b) return;
        const me = G && G.teams[G.me];
        if (b && b.dataset.up && me && !G.over) {
          const err = startResearch(me, b.dataset.up);
          if (err === 'busy') evaCalm('Unable to comply. Building in progress', 3); else if (err === 'Not available') evaCalm('Not available', 3); else if (!err) eva('Building');
          upFill(); return;
        }
        if (b && b.dataset.cancel && me) { cancelResearch(me, b.dataset.cancel); eva('Cancelled'); upFill(); return; }
        upEl.hidden = true;
      });
      document.body.append(upEl);
    }
    upSig = '';
    upFill();
    upEl.hidden = false;
  }
  ui.giveBtn.addEventListener('click', () => {
    if (!G || G.over) return;
    if (G.teams[G.me].out || !giveAllies().length) { evaCalm('No ally to give to', 4); return; }
    if (!giveEl) {
      giveEl = document.createElement('div'); giveEl.id = 'give'; giveEl.className = 'nw-wrap';
      giveEl.innerHTML = '<div class="nw-card" role="dialog" aria-label="Give credits"><p class="nw-title">Give credits</p><div class="gv-list"></div>'
        + '<button type="button" class="pf-btn" data-b="close">Close</button></div>';
      giveEl.addEventListener('click', (ev) => {
        const b = ev.target.closest('button');
        if (ev.target !== giveEl && !b) return;                 // a tap on the card itself
        if (b && b.dataset.send && G && !G.over && !giveTyped(b.dataset.send)) return;   // nothing typed: stay open
        if (b && b.dataset.to && G && !G.over) sendCredits(G.teams[G.me], +b.dataset.to, +b.dataset.n);
        giveEl.hidden = true;
      });
      giveEl.addEventListener('input', (ev) => ev.target.classList.remove('bad'));
      giveEl.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' || !ev.target.dataset.in || !G || G.over) return;
        ev.preventDefault();
        if (giveTyped(ev.target.dataset.in)) giveEl.hidden = true;
      });
      document.body.append(giveEl);
    }
    giveFill();
    giveEl.hidden = false;
  });
  ui.returnBtn.addEventListener('click', () => {
    if (!G) return;
    const team = G.teams[G.me];
    recallAlly(team);
    ui.allyBtn.setAttribute('aria-pressed', 'false');
    ui.autoBtn.setAttribute('aria-pressed', 'false');
    eva('Returning to base');
  });
  ui.menuBtn.addEventListener('click', togglePause);

  // Battle time as m:ss, or h:mm:ss past an hour. G.t stops while paused or held and is sent to online guests.
  function battleClock(t) {
    const s = Math.max(0, Math.floor(t || 0)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  }
  let hudT = 0, lastCredits = null;
  function updateSidebar(dt) {
    hudT -= dt;
    if (hudT > 0 || !G) return;
    hudT = 0.1;
    const team = G.teams[G.me];
    const shown = Math.max(0, Math.floor(team.shown));
    ui.credits.textContent = String(shown);
    const clock = battleClock(G.t);
    if (ui.clock.textContent !== clock) ui.clock.textContent = clock;
    // Tick while the counter rolls, like the classic sidebar.
    if (lastCredits !== null && shown !== lastCredits && !G.paused) Sound.play(shown > lastCredits ? 'cashUp' : 'cashDown');
    lastCredits = shown;
    const autoLabel = team.auto ? `AUTO ${Math.min(team.waiting || 0, GROUP_SIZE)}/${GROUP_SIZE}` : 'AUTO OFF';
    if (ui.autoLabel.textContent !== autoLabel) ui.autoLabel.textContent = autoLabel;
    if (giveEl && !giveEl.hidden && (G.over || team.out)) giveEl.hidden = true;
    if (upEl && !upEl.hidden) { if (G.over || team.out || !hasBuilt(team, 'tech')) upEl.hidden = true; else upFill(); }
    if (ui.allyBtn.getAttribute('aria-pressed') !== String(!!team.assist)) ui.allyBtn.setAttribute('aria-pressed', String(!!team.assist));
    if (ui.autoBtn.getAttribute('aria-pressed') !== String(!!team.auto)) ui.autoBtn.setAttribute('aria-pressed', String(!!team.auto));
    // The picked enemy's colour along the button's edge.
    const aimT = team.auto ? chosenFoe(team) : null, aimC = aimT ? sideColour(aimT) : '';
    if (aimC !== aimWas) { aimWas = aimC; ui.autoBtn.style.setProperty('--aim', aimC || 'transparent'); ui.autoBtn.classList.toggle('aimed', !!aimC); }
    // Vertical power bar: green fill is output, the red tick is demand.
    const { prod, use } = team.power;
    const top = Math.max(100, prod, use) * 1.15;
    ui.powerBar.style.setProperty('--p', prod / top);
    ui.powerBar.style.setProperty('--d', use / top);
    ui.powerBar.title = `Power ${use} used of ${prod}`;
    ui.powerBar.dataset.state = team.low ? 'low' : use > prod * 0.85 ? 'warn' : 'ok';

    for (const side of ['L', 'R']) {
      const types = stripTypes(team, side), sig = types.join();
      if (sig !== cameoSig[side]) { cameoSig[side] = sig; rebuildStrip(team, side, types); }
    }
    const sq = team.queues.structure;
    for (const [type, el] of cameoEls) {
      let p = 0, st = '', count = 0, dim = false;
      const cat = type.startsWith('pw:') ? 'power' : type.startsWith('wl:') ? 'wall' : catOf(type);
      if (cat === 'power') {
        const key = type.slice(3);
        p = team.powers[key] / POWERS[key].charge;
        st = p >= 1 ? 'READY' : '';
      } else if (cat === 'wall') {
        st = G.place && G.place.wall === type.slice(3) ? 'READY' : '';
      } else if (cat === 'structure') {
        if (sq && sq.type === type) { p = sq.progress; if (sq.ready) warmBuild(type, team.faction); st = sq.ready ? 'READY' : sq.stalled || !available(team, type) ? 'ON HOLD' : ''; }
        else if (sq) dim = true;
      } else {
        const list = team.queues[cat];
        count = list.filter((i) => i.type === type).length;
        const cur = activeItem(team, cat);
        if (cur && cur.type === type) { p = cur.progress; st = cur.stalled ? 'ON HOLD' : ''; }
        else if (count) st = available(team, type) ? 'QUEUED' : 'ON HOLD';   // (its producer is lost)
        else if (list.length) dim = true;
      }
      el.clock.style.setProperty('--p', p);
      el.clock.hidden = !(p > 0 && p < 1);
      if (el.st.textContent !== st) el.st.textContent = st;
      el.btn.classList.toggle('ready', st === 'READY');
      el.btn.classList.toggle('hold', st === 'ON HOLD');
      el.btn.classList.toggle('dim', dim);
      const ct = count > 1 ? String(count) : '';
      if (el.ct.textContent !== ct) el.ct.textContent = ct;
    }
    updateSelbar();
  }

  // Context buttons for the current selection.
  let selSig = '', sellArmed = null;
  function updateSelbar() {
    const sel = G.selection.filter((e) => e.alive);
    if (!sel.length) { ui.selbar.hidden = true; selSig = ''; return; }
    ui.selbar.hidden = false;
    const one = sel.length === 1 ? sel[0] : null;
    ui.selName.textContent = one ? (one.def.name + (one.rank ? ' · ' + VET.names[one.rank] : '') + (hostile(one.team, G.me) ? ' · enemy' : one.team !== G.me ? ' · ally' : '')) : `${sel.length} units`;
    const hp = one ? one.hp / one.maxHp : sel.reduce((s, e) => s + e.hp / e.maxHp, 0) / sel.length;
    ui.selHp.style.setProperty('--p', Math.max(0, hp));
    ui.selHp.dataset.state = hp > 0.5 ? 'ok' : hp > 0.25 ? 'warn' : 'low';
    const own = sel.filter((e) => e.team === G.me);
    const fighters = own.filter((e) => e.kind === 'unit' && !e.def.harvester && (e.def.weapon || e.cls === 'air'));
    const bld = one && one.kind === 'bld' && one.team === G.me ? one : null;
    const btns = [];
    if (own.some((e) => e.kind === 'unit' && e.def.deploys)) btns.push(['deploy', 'DEPLOY']);
    if (fighters.length) btns.push(['hunt', 'ATTACK'], ['guard', 'GUARD']);
    if (fighters.length) btns.push(['span', 'ATTACK GROUND']);
    if (own.some((e) => e.kind === 'unit')) btns.push(['stop', 'STOP']);
    if (own.some((e) => e.inHouse)) btns.push(['exit', 'EXIT']);
    if (own.some((e) => canService(e) && e.hp < e.maxHp) && hasBuilt(G.teams[G.me], 'depot')) btns.push(['svc', 'REPAIR']);
    if (bld) {
      if (canRally(bld)) {
        if (producersOfType(bld).length > 1) btns.push(['primary', activeProducer(bld) === bld ? 'PRIMARY ✓' : 'PRIMARY']);
        btns.push(['rally', 'RALLY']);
        if (bld.rally) btns.push(['norally', 'NO RALLY']);
      }
      if (bld.type === 'tech' && bld.buildT >= 1) { const r = G.teams[G.me].research; btns.push(['upgrades', r ? `UPGRADES ${Math.floor(r.progress * 100)}%` : 'UPGRADES']); }
      btns.push(['repair', bld.repairing ? 'REPAIRING' : 'REPAIR']);
      if (bld.type !== 'cy') btns.push(['sell', sellArmed === bld ? 'CONFIRM' : 'SELL']);
    }
    btns.push(['close', '✕']);
    const sig = btns.map((b) => b.join(':')).join('|');
    if (sig !== selSig) {
      selSig = sig;
      ui.selBtns.innerHTML = btns.map(([a, l]) => `<button type="button" data-act="${a}"${a === 'repair' && bld && bld.repairing ? ' aria-pressed="true"' : ''}>${l}</button>`).join('');
    }
  }
  ui.selBtns.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || !G) return;
    const act = b.dataset.act;
    const sel = G.selection.filter((x) => x.alive);
    const own = sel.filter((x) => x.team === G.me);
    const bld = sel.length === 1 && sel[0].kind === 'bld' && sel[0].team === G.me ? sel[0] : null;
    if (act === 'deploy') {
      const made = own.filter((u) => u.kind === 'unit' && u.def.deploys).map(deployFob).filter(Boolean);
      if (made.length) select(made.length === 1 ? [made[0]] : []);
    } else if (act === 'hunt') {
      if (!enemyBaseKnown()) evaCalm('Enemy base not located', 4);   // pick a target, or scout first
      else { commandHunt(own.filter((u) => u.kind === 'unit' && (u.def.weapon || u.cls === 'air'))); eva('Attacking enemy base'); Sound.ack('attack'); }
    }
    else if (act === 'exit') { commandExit(own.filter((u) => u.inHouse)); Sound.ack('inf'); }
    else if (act === 'span') { aimSpan = own.filter((u) => u.kind === 'unit' && !u.def.harvester && (u.def.weapon || u.cls === 'air')); evaCalm('Tap the ground to attack', 5); }
    else if (act === 'guard') beginGuard(own.filter((u) => u.kind === 'unit' && !u.def.harvester));
    else if (act === 'stop') commandStop(own.filter((u) => u.kind === 'unit'));
    else if (act === 'svc') { commandRepair(own.filter((u) => canService(u) && u.hp < u.maxHp)); eva('To the Service Depot'); Sound.ack('veh'); }
    else if (act === 'primary' && bld) { setPrimary(bld); eva('Primary building set'); }
    else if (act === 'upgrades' && bld) openUpgrades();
    else if (act === 'rally' && bld) beginRally(bld);
    else if (act === 'norally' && bld) setRally(bld, null, null);
    else if (act === 'repair' && bld) setRepair(bld, !bld.repairing);
    else if (act === 'sell' && bld) {
      if (sellArmed === bld) { sellStructure(bld); select([]); sellArmed = null; eva('Structure sold'); Sound.play('sell'); }
      else { sellArmed = bld; setTimeout(() => { sellArmed = null; selSig = ''; }, 2500); }
    } else if (act === 'close') select([]);
    selSig = '';
    hudT = 0;
  });

  // ---------------------------------------------------------------------------
  // Menus
  // ---------------------------------------------------------------------------
  function showMenu(mode) {
    ui.menu.hidden = false;
    ui.menu.dataset.mode = mode;
    ui.resumeBtn.hidden = mode !== 'pause';
    ui.quitBtn.hidden = mode !== 'pause';
    disarmQuit();
    if (G && !Net.role) G.paused = true;   // (an online battle runs on: the other player is still in it)
    ui.menu.dataset.mode = mode;
    if (mode === 'pause') autosave();
    showContinue();
    if (mode === 'start') { ui.menuTitle.textContent = 'Red Horizon'; ui.menuSub.textContent = 'Choose your side, commander.'; ui.startBtn.textContent = 'Skirmish'; }
    if (mode === 'pause') { ui.menuTitle.textContent = 'Paused'; ui.menuSub.textContent = 'Mission time ' + fmt(G.t); ui.startBtn.textContent = 'New skirmish'; }
    if (mode === 'pause' && Net.role) { ui.menuTitle.textContent = 'Menu'; ui.menuSub.textContent = 'Online: the battle goes on while this menu is open.'; }
    syncMenuChoices();
  }
  $('manualBtn').addEventListener('click', () => Manual.open(faction));
  for (const b of ui.menu.querySelectorAll('[data-audio]')) b.addEventListener('click', () => {
    Sound.init();
    const key = b.dataset.audio;
    Sound.setOption(key, !Sound.settings[key]);
    syncMenuChoices();
  });
  $('trackBtn').addEventListener('click', () => { Sound.init(); Sound.setOption('music', true); Sound.music.skip(); syncMenuChoices(); });
  for (const [id, key] of [['musicVol', 'musicVol'], ['sfxVol', 'sfxVol']]) {
    $(id).addEventListener('input', (e) => { Sound.init(); Sound.setVolume(key, e.target.value / 100); });
    // Let go of the effects slider and a sample plays, so the level can be judged.
    if (id === 'sfxVol') $(id).addEventListener('change', () => Sound.play && Sound.play('rifle'));
  }
  function syncMenuChoices() {
    $('musicVol').value = Math.round(Sound.settings.musicVol * 100); $('sfxVol').value = Math.round(Sound.settings.sfxVol * 100);
    for (const b of ui.menu.querySelectorAll('[data-audio]')) b.setAttribute('aria-pressed', String(!!Sound.settings[b.dataset.audio]));
    $('trackName').textContent = '· ' + Sound.music.name;
    $('audioStatus').textContent = 'Sound: ' + Sound.status();
    for (const b of ui.menu.querySelectorAll('[data-faction]')) b.setAttribute('aria-pressed', String(b.dataset.faction === faction));
    for (const b of ui.menu.querySelectorAll('[data-diff]')) b.setAttribute('aria-pressed', String(b.dataset.diff === diffKey));
    ui.menu.dataset.faction = faction;
  }
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  function hideMenu() { ui.menu.hidden = true; if (G && !G.over) G.paused = false; }
  function togglePause() {
    if (!G || G.over) return;
    if (G.paused) hideMenu(); else showMenu('pause');
  }
  for (const b of ui.menu.querySelectorAll('[data-faction]')) b.addEventListener('click', () => {
    faction = b.dataset.faction;
    try { localStorage.setItem('ps-faction', faction); } catch (_) {}
    syncMenuChoices();
  });
  for (const b of ui.menu.querySelectorAll('[data-diff]')) b.addEventListener('click', () => {
    diffKey = b.dataset.diff;
    try { localStorage.setItem('ps-diff', diffKey); } catch (_) {}
    syncMenuChoices();
  });
  $('continueBtn').addEventListener('click', () => {
    const b = $('continueBtn');
    b.disabled = true; b.textContent = 'Loading…';
    continueMission().finally(() => { b.disabled = false; showContinue(); });
  });
  // Skirmish opens the map screen first; starting from there builds the battle.
  ui.startBtn.addEventListener('click', () => {
    MapSelect.open(mapId, (id, mode) => {
      mapId = id; battleMode = mode || '1v1';
      ui.startBtn.textContent = 'Loading…';
      ui.startBtn.disabled = true;
      setTimeout(() => {
        endPlace();
        startMission();
        ui.startBtn.disabled = false;
        hideMenu();
        eva('Select a structure to build');
      }, 30);
    });
  });
  ui.resumeBtn.addEventListener('click', hideMenu);
  // Quit mission: tap twice (no dialogs, which some hosts block). The match is reported as quit,
  // with its debrief numbers so far, and the menu comes back over a fresh battlefield.
  let quitArmed = null;
  function disarmQuit() { clearTimeout(quitArmed); quitArmed = null; ui.quitBtn.textContent = 'Quit mission'; }
  ui.quitBtn.addEventListener('click', () => {
    if (!quitArmed) { ui.quitBtn.textContent = 'Tap again to quit'; quitArmed = setTimeout(disarmQuit, 3000); return; }
    disarmQuit();
    if (Net.role) { Net.surrender(); hideMenu(); return; }   // online: quitting is surrendering
    Report.quit();
    SaveGame.clear();
    endPlace();
    startGame();
    showMenu('start');
  });
  setInterval(() => { if (!ui.menu.hidden) $('audioStatus').textContent = 'Sound: ' + Sound.status(); }, 500);
  document.addEventListener('visibilitychange', () => { if (document.hidden && G && !G.paused && !G.over) showMenu('pause'); });

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  let last = performance.now(), updMs = 0;
  const camWas = { x: 0, y: 0 };
  // Deploying: a battle (new, continued or online) starts behind a short card while this battle's sprite sheets load
  // (art.js SpriteSheets) and the ground on screen is painted (art.js makeGround), so its first seconds do not
  // stutter. A skirmish is held meanwhile; an online battle runs on (others are in it). Never longer than LOAD_MAX ms.
  const LOAD_MAX = 3000, LOAD_MIN = 250;
  let loadFor = null, loadEl = null;
  function loading(now) {
    if (!G || G.paused || G.over) return false;
    if (!loadFor || loadFor.g !== G) loadFor = { g: G, since: now, done: false };
    if (loadFor.done) return false;
    const t = now - loadFor.since, ready = SpriteSheets.ready() && G.ground && G.ground.missing === 0 && t > LOAD_MIN;
    if (ready || t > LOAD_MAX) { loadFor.done = true; showLoading(false); return false; }
    if (t > 120) showLoading(true);   // (a fast device is ready before the card would even show)
    return true;
  }
  function showLoading(on) {
    if (!loadEl) {
      if (!on) return;
      loadEl = document.createElement('div'); loadEl.id = 'deploying'; loadEl.className = 'nw-wrap';
      loadEl.innerHTML = '<div class="nw-card" role="status"><p class="nw-title">Deploying forces</p><p class="nw-sub">Preparing the battlefield</p></div>';
      document.body.append(loadEl);
    }
    loadEl.hidden = !on;
  }
  function frame(now) {
    spriteMs = 0; spriteN = 0;   // (models.js: sprites made in this frame, for the match report)
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    shakeAmp *= Math.exp(-dt * 6);
    const held = guard('loading', () => loading(now)) === true && !Net.role;
    if (G && !G.paused && !held) {
      const k = 700 * dt / cam.z;
      if (keys.has('ArrowLeft') || keys.has('a')) cam.x -= k;
      if (keys.has('ArrowRight') || keys.has('d')) cam.x += k;
      if (keys.has('ArrowUp') || keys.has('w')) cam.y -= k;
      if (keys.has('ArrowDown') || keys.has('s')) cam.y += k;
      clampCam();
      const total = dt;
      // Each part of a frame is guarded: an error is recorded with the match (Report.oops) and the
      // game carries on, instead of the loop stopping and the battle freezing on both phones.
      const u0 = performance.now();
      if (Net.role === 'guest') guard('guest', () => Net.guestStep(dt));
      else guard('update', () => { while (dt > 0) { const step = Math.min(dt, 1 / 30); dt -= step; update(step); } });
      guard('net', () => Net.hostTick(total));
      updMs = performance.now() - u0;
    }
    guard('beaten', beaten);
    const d0 = performance.now();
    guard('draw', draw);
    const d1 = performance.now();
    guard('sidebar', () => updateSidebar(1 / 60));
    guard('radar', () => drawRadar(1 / 60));
    guard('cameos', warmCameos);
    if (G && !G.paused) guard('sprites', () => warmSprites(2, ...Object.values(s2w(W / 2, H / 2))));
    if (G && !G.paused && !(loadFor && loadFor.g === G && !loadFor.done)) {   // how smoothly this device runs the battle (Report: stats.frames)
      const jump = Math.abs(cam.x - camWas.x) > W / cam.z / 2 || Math.abs(cam.y - camWas.y) > H / cam.z / 2;
      Report.noteFrame(now, updMs, d1 - d0, jump, performance.now() - d1);
    }
    camWas.x = cam.x; camWas.y = cam.y; updMs = 0;
  }
  // A team game where this side is beaten (no production left) but an ally fights on: a card offers
  // the debrief now (a loss) or staying to watch with the whole map shown (then the alliance's result).
  let beatenEl = null;
  function beaten() {
    const on = !!(G && !G.over && G.teams.length > 2 && G.teams[G.me] && G.teams[G.me].out);
    if (on && G.watching) {
      if (G.seen === G.fog[G.me]) { G.seen = new Uint8Array(NCELLS).fill(1); G.shroudDirty = true; radarWas = null; }   // own copy: allies' sight stays theirs
    }
    if (!beatenEl) {
      if (!on) return;
      beatenEl = document.createElement('div'); beatenEl.id = 'beaten'; beatenEl.className = 'nw-wrap';
      beatenEl.innerHTML = '<div class="nw-card" role="alert"><p class="nw-title">You have been defeated</p>'
        + '<p class="nw-sub">Your ally fights on. Watch the rest of the battle with the whole map shown: if your ally wins, you win too.</p>'
        + '<button type="button" class="pf-btn" data-b="watch">Keep watching</button> <button type="button" class="pf-btn" data-b="debrief">Debrief (a loss)</button></div>';
      beatenEl.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-b]');
        if (!b || !G || G.over) return;
        if (b.dataset.b === 'watch') { G.watching = true; if (Net.role) Net.watch(); eva('Watching the battle'); }
        else if (Net.role) Net.surrender('out');
        else endBattle(otherAlly(G.me), 'out');
        beatenEl.hidden = true;
      });
      document.body.append(beatenEl);
    }
    beatenEl.hidden = !on || !!G.watching;
  }
  // The sidebar's pictures of everything this side could build are drawn a few at a time in the first seconds of
  // a battle (art.js cameoURL keeps them): drawn only when they first appear, a new building that unlocks several
  // items at once stalled a frame for a third of a second on a phone.
  let warmAt = 0;
  function warmCameos() {
    if (!G || G.paused || performance.now() < warmAt) return;
    warmAt = performance.now() + 200;
    const team = G.teams[G.me];
    if (!team) return;
    const types = Object.keys(POWERS).map((k) => 'pw:' + k).concat(Object.keys(BUILD_DEFS), Object.keys(UNIT_DEFS))
      .filter((k) => k.startsWith('pw:') || defOf(k).factions.includes(team.faction));
    const k = types.find((t) => !cameoCache.has(t + team.faction + (team.variant | 0)));
    if (k) cameoURL(k, team.faction, team.variant);
    else warmAt = performance.now() + 5000;
  }
  function guard(where, fn) { try { return fn(); } catch (e) { Report.oops(where, e); } }
  // The next frame is asked for first, so nothing that goes wrong in this one can stop the loop.
  function loop(now) { requestAnimationFrame(loop); frame(now); }

  layout();
  startGame();
  showMenu('start');
  requestAnimationFrame(loop);

  // Hook for automated tests.
  // viewSide(side): show and command the other side from here on (tests; the guest's view in PvP).
  const viewSide = (side) => {
    setViewer(side); endPlace();
    radarWas = null; cameoSig = { L: '', R: '' }; selSig = ''; lastCredits = null;
    ui.sidebar.dataset.faction = G.teams[side].faction;
    const b = G.entities.find((e) => e.team === side && e.type === 'cy') || buildingsOf(side)[0];
    if (b) centerOn(b.x, b.y);
  };
  window.__ps = { get G() { return G; }, update, cam, startGame, viewSide, startProduction, placeStructure, aiFindSpot, canPlace, commandMove, commandHunt, commandGuard, commandStop, tap, layout };

  // Version on the menu, and the What's New page with every release.
  // The menu names the latest update, and What's New stands out until this version's notes have
  // been opened on this phone (remembered only on the phone).
  let newsSeen = null;
  try { newsSeen = localStorage.getItem('ps-news-seen'); } catch (_) {}
  const showNews = () => $('newsBtn').classList.toggle('has-news', newsSeen !== VERSION);
  const openNews = () => {
    News.open();
    newsSeen = VERSION;
    try { localStorage.setItem('ps-news-seen', VERSION); } catch (_) {}
    showNews();
  };
  const tag = $('versionTag'), latest = document.createElement('button');
  tag.textContent = `Version ${VERSION}`;
  latest.type = 'button'; latest.className = 'version-new'; latest.textContent = `New: ${RELEASES[0].title}`;
  latest.addEventListener('click', openNews);
  tag.append(document.createElement('br'), latest);
  $('newsBtn').addEventListener('click', openNews);
  showNews();
  $('boardBtn').addEventListener('click', () => Leaderboard.open());
  // The Profile button carries the commander's name once signed in.
  const profileLabel = () => { $('profileBtn').textContent = Account.name || 'Profile'; };
  $('profileBtn').addEventListener('click', () => Profile.open());
  Account.onChange(profileLabel);
  profileLabel();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && window.top === window) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // Installed on a phone, the game can stay open in the background for days: whenever it comes
    // back to the front (and every ten minutes), look for a newer version and offer a restart
    // from the menu, never in the middle of a battle.
    const checkUpdate = () => fetch('src/version.js', { cache: 'no-store' }).then((r) => r.text()).then((t) => {
      const m = t.match(/\{ v: '([^']+)'/);   // the newest release is listed first
      if (m && m[1] !== VERSION) $('updateBtn').hidden = false;
    }).catch(() => {});
    $('updateBtn').addEventListener('click', () => location.reload());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
    setInterval(checkUpdate, 10 * 60 * 1000);
    checkUpdate();
  }
})();
