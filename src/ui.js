'use strict';
// Rendering, input, sidebar and menus.
(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const radar = $('radar'), rctx = radar.getContext('2d');
  const view = mkCanvas(64, 64), vctx = view.getContext('2d');
  const softCv = {};   // (draw's soft layers for WebGL: the edge's haze and mist)
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

  let W = 0, H = 0, DPR = 1, ZDPR = 1;           // game view size in CSS px
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
        difficulty: vs ? 'Online vs ' + vs.opponent + ending : G.spectate ? 'AI vs AI · ' + FACTIONS[G.teams.find((t) => t.ally === G.over.winner).faction].name + ' won' : DIFFICULTY[diffKey].label,
        // a win against the computer goes on the leaderboard: a 1 v 1 skirmish, or two-player online co-op (its own
        // board, scored as a team; three-player co-op has none yet)
        extra: won && !G.mapViewUsed && (vs ? vs.coop === 'board' : !teamGame()) ? Leaderboard.nameBox(Report.score(vs ? Report.teamStats() : G.teams[G.me].stats, G.over.t, vs ? vs.diff : diffKey)) : null,
        // same side and difficulty; online, back to the lobby page
        onRematch: vs ? () => { Net.rematch(); startGame(); showMenu('start'); Online.open(faction); } : G.spectate ? () => { endPlace(); startWatch(); hideMenu(); } : () => { endPlace(); startMission(); hideMenu(); eva('Select a structure to build'); },
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
    // Phones and tablets (a touch screen) draw at most 2 pixels a CSS pixel: an iPhone's 3 is 2.25 x the pixels for an
    // edge hard to see at arm's length, and the phone ran hot (owner, 2026-11-20). Desktops keep up to 3.
    const touch = touchScr = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    DPR = Math.min(window.devicePixelRatio || 1, (touch ? DPR_STEPS : PC_STEPS)[dprStep]);   // (autoRes below may lower it)
    ZDPR = Math.min(window.devicePixelRatio || 1, (touch ? DPR_STEPS : PC_STEPS)[0]);   // (the zoom's steps: not moved by autoRes)
    const r = ui.sidebar.getBoundingClientRect(), top = Math.round(ui.topstrip.getBoundingClientRect().bottom);
    const portrait = window.innerHeight > window.innerWidth;
    W = portrait ? window.innerWidth : Math.max(100, Math.round(r.left));
    H = Math.max(100, (portrait ? Math.round(r.top) : window.innerHeight) - top);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    document.documentElement.style.setProperty('--gw', W + 'px');
    document.documentElement.style.setProperty('--gh', H + 'px');
    const rr = radar.getBoundingClientRect();
    // Resizing a canvas wipes it: in a busy battle the automatic resolution (below) steps down and the radar went black until
    // its next redraw (most of a second on a struggling phone). Only resize when the size changes, and keep the picture.
    const rw = Math.max(1, Math.round(rr.width * DPR)), rh = Math.max(1, Math.round(rr.height * DPR));
    if (rw !== radar.width || rh !== radar.height) {
      let old = null;
      if (radar.width > 1 && radar.height > 1) { old = mkCanvas(radar.width, radar.height); old.getContext('2d').drawImage(radar, 0, 0); }
      radar.width = rw; radar.height = rh;
      if (old) { rctx.imageSmoothingEnabled = true; rctx.drawImage(old, 0, 0, rw, rh); }
    }
    clampCam();
  }
  window.addEventListener('resize', layout);
  // Phones (and computers, PC_STEPS): the drawing resolution follows how smoothly the battle runs (owner, 2026-11-21: "Do the automatic resolution on
  // phones", after a hot iPhone fell to 15-19 fps late in a 3 v 3 and everything filled in slowly). Over each AUTO_WIN ms of
  // battle (not paused, not loading), if more than AUTO_SLOW of the frames came over SLOW_MS apart it steps down a notch
  // (DPR_STEPS: 2, then 1.5, then 1 pixels a CSS pixel); once under AUTO_OK of them have for upWait ms, it steps back up.
  // Frames 33 ms apart (Low Power Mode's 30 fps) are not slow. Stepping down again soon after stepping up doubles upWait
  // (at most 5 minutes), so it does not flip back and forth. A new battle starts at 2. Fewer pixels: less for the graphics
  // to fill (heat), and the per-frame budgets for the ground, cliffs and sprites come round more often.
  // Computers too (owner, 2026-11-21: "it lags at full screen zooming out 3v3"; a 2560 x 1370 screen at 1.5x is 7.9 million
  // pixels a frame): PC_STEPS from the screen's own (at most 3) to 1.25 and 1, slow being frames over PC_SLOW_MS apart
  // (under about 40 a second: a computer is expected to run at 60 or more).
  const DPR_STEPS = [2, 1.5, 1], PC_STEPS = [3, 1.25, 1], AUTO_WIN = 3000, SLOW_MS = 45, PC_SLOW_MS = 25, AUTO_SLOW = 0.25, AUTO_OK = 0.03, AUTO_UP = 20000;
  let touchScr = false, dprStep = 0, autoG = null, autoT0 = 0, autoN = 0, autoSlow = 0, autoGood = 0, autoUpAt = -1e9, upWait = AUTO_UP, autoPrev = 0;
  function autoRes(now, running) {
    const gap = now - autoPrev; autoPrev = now;
    if (G !== autoG) { autoG = G; upWait = AUTO_UP; autoGood = 0; autoT0 = 0; if (dprStep) { dprStep = 0; layout(); } }
    if (!running || document.hidden || gap > 1000) { autoT0 = 0; return; }
    if (!autoT0) { autoT0 = now; autoN = 0; autoSlow = 0; return; }
    autoN++; if (gap > (touchScr ? SLOW_MS : PC_SLOW_MS)) autoSlow++;
    const span = now - autoT0;
    if (span < AUTO_WIN) return;
    const slow = autoSlow / Math.max(1, autoN);
    autoT0 = now; autoN = 0; autoSlow = 0;
    const steps = touchScr ? DPR_STEPS : PC_STEPS, native = window.devicePixelRatio || 1;
    const set = (k, why) => { dprStep = k; layout(); try { Report.crumb && Report.crumb('res ' + Math.min(native, steps[k]) + 'x (' + why + ', ' + Math.round(slow * 100) + '% slow)'); } catch (_) {} };
    if (slow > AUTO_SLOW && dprStep < steps.length - 1 && Math.min(native, steps[dprStep + 1]) < Math.min(native, steps[dprStep])) {
      if (now - autoUpAt < 30000) upWait = Math.min(300000, upWait * 2);
      autoGood = 0; set(dprStep + 1, 'down');
    } else if (slow < AUTO_OK && dprStep > 0) {
      if ((autoGood += span) >= upWait) { autoGood = 0; autoUpAt = now; set(dprStep - 1, 'up'); }
    } else autoGood = 0;
  }
  window.addEventListener('orientationchange', () => setTimeout(layout, 250));

  // Zoom snaps so each game pixel covers a whole number of screen pixels; fractional
  // scaling makes some pixels wider than others and reads as blur on phones.
  // The steps come from the full resolution (ZDPR), not the one autoRes is drawing at: rounded to that, the zoom changed
  // (2 to 2.4, and back to 2.67) each time the resolution stepped, and the screen jumped on its own (owner, 2026-11-22).
  // Zoom limits. On a computer (owner, 2026-11-25) the widest view is two wheel notches out from the closest, so a big
  // screen never draws the whole map at once; phones keep the full range (pinch).
  const Z_MAX = 3.5, Z_MIN_TOUCH = 0.75, PC_WHEEL_OUT = 2;
  function snapIn(z, lo) {
    z = Math.max(lo, Math.min(Z_MAX, z));
    if (z * ZDPR < 1.5) return z;
    return Math.max(1, Math.round(z * ZDPR)) / ZDPR;
  }
  const wheelStep = (z) => Math.max(1 / ZDPR, z * 0.12);   // one wheel notch
  function zMin() {
    if (isTouch || (G && G.editing)) return Z_MIN_TOUCH;   // (the map editor keeps the full range on a computer too)
    let z = snapIn(Z_MAX, Z_MIN_TOUCH);
    for (let i = 0; i < PC_WHEEL_OUT; i++) z = snapIn(z - wheelStep(z), Z_MIN_TOUCH);
    return z;
  }
  function snapZ(z) { return snapIn(z, zMin()); }
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
  function rimInView(g, x0, y0, x1, y1, keep, noShadow) {
    const T = rimTrees(), out = [];
    if (x0 > 0 && y0 > 0 && x1 < WORLD && y1 < WORLD) return out;
    let lo = 0, hi = T.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (T[m].y < y0) lo = m + 1; else hi = m; }
    g.globalAlpha = 0.45;
    for (let i = lo; i < T.length && T[i].y < y1; i++) {
      const tr = T[i];
      if (tr.x < x0 || tr.x > x1 || (keep && !keep(tr.x, tr.y))) continue;
      if (!noShadow) g.drawImage(tr.s.sh, Math.round(tr.x + tr.s.sox), Math.round(tr.y + tr.s.soy));
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
  const s2w = (sx, sy) => {
    // The point of the (raised: look.js gLift) ground that shows at screen (sx, sy): the flat point, then a few steps
    // down the screen by the lift there (the hills are gentle, so this settles at once).
    const X = cam.x + sx / cam.z, Y = cam.y + sy / cam.z;
    let [x, y] = fromView(X, Y);
    if (!(LOOK.hills && G && G.hgt)) return { x, y };
    // The nearest ground in this screen column that shows at Y: from as far in front as the highest hill could show
    // there, back until a point of the ground stands at or above Y (a hill in front hides what is behind it).
    const M = hillMax();
    for (let d = M + 2; d >= 0; d -= 2) {
      const [px, py] = fromView(X, Y + d);
      if (d - gLift(px, py) <= 0) {   // the ground here shows at or above Y: the answer lies between this step and the last
        let lo = d, hi = d + 2;
        for (let i = 0; i < 6; i++) { const m = (lo + hi) / 2, [qx, qy] = fromView(X, Y + m); if (m - gLift(qx, qy) <= 0) lo = m; else hi = m; }
        [x, y] = fromView(X, Y + lo);
        return { x, y };
      }
    }
    return { x, y };
  };

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
  function startGame(seed, mode = '1v1', watch = false) {
    const size = battleOf(mode).size;
    if (watch) newWorld(faction, diffKey, seed, 0, false, mapId, teamSides(faction, size).map((d) => Object.assign(d, { ai: true })));
    else if (size > 1 && !battleOf(mode).coop) newWorld(faction, diffKey, seed, 0, false, mapId, teamSides(faction, size));
    else newWorld(faction, diffKey, seed, mySide, false, mapId);
    online = null; mission = false;
    if (watch) { G.spectate = true; G.mapViewUsed = true; G.speed = 1; G.seen = new Uint8Array(NCELLS).fill(1); }
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
    if (!resumed && !G.spectate) G.teams[G.me].auto = false;
    document.body.classList.toggle('spectate', !!G.spectate);
    ui.autoBtn.setAttribute('aria-pressed', String(!!G.teams[G.me].auto));
    setAimMove(false);
    ui.allyBtn.hidden = ui.returnBtn.hidden = ui.giveBtn.hidden = !teamGame();
    if (giveEl) giveEl.hidden = true;
    layout();
    if (resumed) return;
    const cy = G.entities.find((e) => e.team === G.me && e.type === 'cy') || { x: (G.teams[G.me].start.cx + 0.5) * CELL, y: (G.teams[G.me].start.cy + 0.5) * CELL };   // (the map explorer: no base, its start)
    cam.z = Math.max(1, Math.min(2.5, Math.round((W / (CELL * 18)) * 4) / 4));
    centerOn(cy.x + 40, cy.y - 30);
  }

  // Saved co-op battles: this phone's match row for each (save id -> match id), so a continued battle is the same match.
  const coopMatches = () => { try { return JSON.parse(localStorage.getItem('rh-coop-matches')) || {}; } catch (_) { return {}; } };
  // A co-op battle saved and closed (by anyone in it): no result; back to the menu, on the online page that says how to continue.
  UIBridge.lookAt = (x, y) => { if (G) centerOn(x, y); };   // chat.js: a ping's line in the chat log
  UIBridge.eva = (msg) => evaCalm(msg, 3);
  UIBridge.saved = (by) => {
    Report.park();
    endPlace();
    startGame();
    showMenu('start');
    Online.open(faction, `${by} saved the battle. To continue it, host a game, have the same friends join, and pick it under Saved co-op battles.`);
  };
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
    if (coop) {
      // A saved co-op battle continued: this phone carries on its own match row from before, if it played it.
      const ids = coopMatches(), mine = o.resume !== undefined && o.save ? ids[o.save] : null;
      if (mine) Report.resume(mine, o.faction, o.diff || 'normal', 'pve', o.partner || 'Commander');
      else Report.start(o.faction, o.diff || 'normal', 'pve', o.partner || 'Commander');
      if (o.save && Report.matchId) {
        ids[o.save] = Report.matchId;
        const keep = Object.keys(ids).slice(-10);
        try { localStorage.setItem('rh-coop-matches', JSON.stringify(Object.fromEntries(keep.map((k) => [k, ids[k]])))); } catch (_) {}
      }
    } else Report.start(o.faction, null, 'pvp', o.opponent);
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
  // Watch AI vs AI (the owner's tool for tuning maps, 2026-11-21): every side a computer, the whole map shown, the
  // controls hidden, nothing reported or saved (the saved skirmish is kept). Speed in the Options menu.
  // Explore a map (owner, 2026-11-24: "an option in the game to load into an empty map with no fog of war"): the map
  // screen's Explore button. No bases, units or computer players, the whole map uncovered, no weather; nothing saved or
  // reported. Look round with the usual camera; the menu's Quit leaves it.
  function startExplore() {
    Net.leave();
    if (mission) Report.quit();
    newWorld(faction, diffKey, undefined, 0, false, mapId, null, true);
    online = null; mission = false;
    G.spectate = true; G.mapViewUsed = true; G.speed = 1; G.weather = null;
    G.seen = new Uint8Array(NCELLS).fill(1); for (const f of G.fog) f.fill(1);
    afterNewWorld(faction);
    Sound.newMatch();
  }
  function startWatch() {
    Net.leave();
    if (mission) Report.quit();
    startGame(undefined, battleMode, true);
    Sound.newMatch();
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
    const r = e.cls === 'inf' ? Math.round(e.def.r * INF_SCALE) : e.def.r, [ux, uy] = unitSpot(e), x = Math.round(ux + r - 1), y0 = Math.round(uy + (e.cls === 'inf' ? -2 : r - 2));
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
  // Whether every cell of a world box (and one round it) has been seen: no shroud to draw there.
  let shroudDark = 1;   // (unexplored cells, counted when the fog is redrawn below)
  const shroudClear = (x0, y0, x1, y1) => {
    const c0 = Math.max(0, Math.floor(x0 / CELL) - 1), c1 = Math.min(MAP - 1, Math.floor(x1 / CELL) + 1), r0 = Math.max(0, Math.floor(y0 / CELL) - 1), r1 = Math.min(MAP - 1, Math.floor(y1 / CELL) + 1);
    for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) if (!G.seen[y * MAP + x]) return false;
    return true;
  };
  const houseSeen = (h) => G.seen[idx(h.cx, h.cy)] || G.seen[idx(h.cx + h.w - 1, h.cy + h.h - 1)];
  const visibleToPlayer = (e) => !e.inHouse && (alliedSides(e.team, G.me) || (!camoHidden(e, G.me) && (e.kind === 'bld' ? (G.seen[idx(e.cx, e.cy)] || G.seen[idx(e.cx + e.w - 1, e.cy + e.h - 1)]) : seenAt(e.x, e.y))));

const gateAnim = new Map();   // cell -> { v: how far a gate's barrier is down (0 to 1), t: when last drawn }
// Phones keep at most SPRITE_KEEP sprites made in play (owner, 2026-11-21, after a 3 v 3 crashed a phone: "1", lighter
// memory on phones). Soldiers' frames at every facing in six colours came to some 3,700 pictures by 18 minutes, all kept.
// Only pictures made here (canvases) are let go, least lately drawn first and none drawn in the last SPRITE_IDLE ms;
// baked ones (ImageBitmaps from sprites/) stay. One let go is simply made again when next drawn (within SPRITE_BUDGET).
const SPRITE_KEEP = typeof GROUND_ROOMY !== 'undefined' && GROUND_ROOMY ? Infinity : 1500, SPRITE_IDLE = 10000;
const spriteUsed = new Map();   // spriteCache2 key -> when it was last drawn (the frame's time)
let spriteFrame = 0, spriteNow = 0;
if (SPRITE_KEEP < Infinity && typeof sprite === 'function') {
  const orig = sprite;
  sprite = function (mkey, build, angle, fkey, opts) {
    const s = orig(mkey, build, angle, fkey, opts);
    if (s && s.img && !(typeof ImageBitmap !== 'undefined' && s.img instanceof ImageBitmap)) spriteUsed.set((FLAT_PASS ? mkey + '~flat' : mkey) + '|' + fkey, spriteNow);
    return s;
  };
}
// The drawing list in depth order (e._key), exactly as a stable sort gives it (ties keep the list's order), in about
// linear time: each thing dropped into one of n buckets by its key (in the list's order, so ties stay in order), then one
// insertion pass, which only has to sort within a bucket. ground.sort() with a comparator was ~1.5 ms a frame headless
// with 2,000 things (trees, crags, units) zoomed out over a 3 v 3.
let dsCount = new Int32Array(0), dsOut = [];
function depthSort(a) {
  const n = a.length;
  if (n < 64) { a.sort((p, q) => p._key - q._key); return a; }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { const k = a[i]._key; if (!(k >= lo)) lo = k; if (!(k <= hi)) hi = k; }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi === lo) { a.sort((p, q) => p._key - q._key); return a; }   // (NaN or all level)
  const nb = n, sc = (nb - 1) / (hi - lo);
  if (dsCount.length < nb + 1) dsCount = new Int32Array(nb * 2 + 1);
  const cnt = dsCount; cnt.fill(0, 0, nb + 1);
  for (let i = 0; i < n; i++) cnt[((a[i]._key - lo) * sc | 0) + 1]++;
  for (let b = 1; b <= nb; b++) cnt[b] += cnt[b - 1];
  const out = dsOut; out.length = n;
  for (let i = 0; i < n; i++) { const e = a[i]; out[cnt[(e._key - lo) * sc | 0]++] = e; }
  for (let i = 1; i < n; i++) {   // (strictly greater moves: equal keys keep their order)
    const e = out[i], k = e._key; let j = i - 1;
    while (j >= 0 && out[j]._key > k) { out[j + 1] = out[j]; j--; }
    out[j + 1] = e;
  }
  for (let i = 0; i < n; i++) a[i] = out[i];
  out.length = 0;
  return a;
}
function trimSprites() {
  if (spriteUsed.size <= SPRITE_KEEP) return;
  const old = [...spriteUsed].filter((e) => spriteNow - e[1] > SPRITE_IDLE).sort((a, b) => a[1] - b[1]);
  for (let i = 0; i < old.length && spriteUsed.size > SPRITE_KEEP * 0.8; i++) { spriteCache2.delete(old[i][0]); spriteUsed.delete(old[i][0]); }
}
function draw() {
    spriteSpend = 0;   // (models.js: sprites made this frame)
    spriteNow = performance.now();
    if (++spriteFrame % 120 === 0) trimSprites();
    // Where the drawing time goes, part by part (art.js drawParts, for the match report): lap(k) adds the time since
    // the last lap to part k.
    const DP = drawParts; for (const k in DP) DP[k] = 0;
    let lapT = performance.now();
    const lap = (k) => { const t = performance.now(); DP[k] += t - lapT; lapT = t; };
    const z = cam.z;
    // The view canvas holds the screen at zoom 1 (VW x VH); its top left is (vx, vy) on the view plane (voxel.js
    // toView). The world is drawn through a transform that turns and squashes it (iso view); (ox, oy, bw, bh) is the
    // world box round what is on screen, with room below for tall things standing just off the bottom edge.
    const VW = Math.ceil(W / z) + 2, VH = Math.ceil(H / z) + 2, vx = Math.floor(cam.x), vy = Math.floor(cam.y);
    const corners = [fromView(vx - 40, vy - 40), fromView(vx + VW + 40, vy - 40), fromView(vx - 40, vy + VH + 140), fromView(vx + VW + 40, vy + VH + 140)];
    const ox = Math.floor(Math.min(...corners.map((c) => c[0]))), oy = Math.floor(Math.min(...corners.map((c) => c[1])));
    const bw = Math.ceil(Math.max(...corners.map((c) => c[0]))) - ox, bh = Math.ceil(Math.max(...corners.map((c) => c[1]))) - oy;
    if (view.width < VW || view.height < VH) { view.width = VW + 64; view.height = VH + 64; }
    let v = uprightCtx(vctx);   // (let: gl.js's recorder stands in for it from the ground to the end of the list)
    const realV = v;
    let glRec = false;
    v.upright = false;
    v.setTransform(1, 0, 0, 1, 0, 0);
    v.imageSmoothingEnabled = false;
    const glWill = !!G && GLR.ready && GLR.ready();   // (gl.js will draw this frame: the view is then not filled nor given the edge here)
    if (!glWill) { v.fillStyle = G ? `rgb(${hazeRGB()})` : '#000'; v.fillRect(0, 0, VW, VH); }
    // With WebGL the view canvas is never shown, but a few things are still drawn on it: cleared whole every frame, else
    // Chrome keeps every drawing command on it, waiting to draw them (2026.11.20.5: ~100 KB a frame at 1280x720, ~40 s
    // to a crash at a tester's 2560x1370 x1.5 and 115 frames a second, in the Windows app).
    else v.clearRect(0, 0, v.canvas.width, v.canvas.height);
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
    // gl.js stage 6: the whole ground on the GPU (art.js's tiles not wanted once it is ready, nor while it is made behind
    // the Loading card).
    const resident = typeof GLR === 'object' && GLR && GLR.resident ? GLR.resident() : null;
    if (resident !== 'ready' && !(resident === 'building' && loadFor && loadFor.g === G && !loadFor.done)) G.ground.update(sx, sy, sw, sh, 6, 3);
    const toWorld = () => v.setTransform(VIEW.c, VIEW.s * VIEW.F, -VIEW.s, VIEW.c * VIEW.F, -vx, -vy);   // world -> view canvas
    // gl.js (stage 5): a soft, wide drawing (the haze and the mist past the map's edge) drawn at a quarter of the view's size
    // and stretched up smoothly: one picture for WebGL, not megapixels of gradients cut out of its 2D layer every frame.
    const soft = (name, fn) => {
      const Q = 4, w = Math.ceil(VW / Q), h = Math.ceil(VH / Q);
      const c = softCv[name] || (softCv[name] = mkCanvas(w, h));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
      g.setTransform(VIEW.c / Q, VIEW.s * VIEW.F / Q, -VIEW.s / Q, VIEW.c * VIEW.F / Q, -vx / Q, -vy / Q);
      fn(g);
      c._ver = (c._ver || 0) + 1; c._own = true;
      const m = v.getTransform(), up = v.upright, sm = v.imageSmoothingEnabled;
      v.upright = false; v.setTransform(1, 0, 0, 1, 0, 0); v.imageSmoothingEnabled = true; v.drawImage(c, 0, 0, w * Q, h * Q);
      v.setTransform(m); v.upright = up; v.imageSmoothingEnabled = sm;
    };
    toWorld();
    if (past && !glWill) {   // past the map's edge: its land carried on, fading into haze
      v.imageSmoothingEnabled = true;
      const e = edgePic(), P = EDGE_PAD;
      v.drawImage(e, -P * CELL, -P * CELL, (MAP + 2 * P) * CELL, (MAP + 2 * P) * CELL);
      v.imageSmoothingEnabled = false;
    }
    const c0 = Math.max(0, Math.floor(ox / CELL)), c1 = Math.min(MAP - 1, Math.floor((ox + bw) / CELL));
    const r0 = Math.max(0, Math.floor(oy / CELL)), r1 = Math.min(MAP - 1, Math.floor((oy + bh) / CELL));
    // The raised ground (look.js hillWarp): the ground in chunks, back to front, each with its patches (hillPatch), the
    // ore whose cells lie behind its back corner (each on the ground under it) and its layer of wrecks and bodies. The
    // chunks that hide ground behind them (occ) are kept to be drawn again over the units and trees behind them.
    const warp = hillWarp(v, vx, vy);
    let ores = null, occs = null, drawCh = null;
    const glGround = GLR.ground(v, vx, vy, VW, VH, sx, sy, sw, sh);   // gl.js: the ground drawn by WebGL (stage 1), or false
    if (glGround) {
      // gl.js: from here to the end of the list, what is drawn into the view is recorded into WebGL (over its ground, in
      // order), and the frame is put into the view once at the end (GLR.listEnd). Ore first, each tested against the
      // ground's depth (a hill hides ore behind it); then marks on the ground (no depth), then the list.
      v = GLR.listBegin(realV) || realV; glRec = v !== realV;
      if (glRec && past) {   // (stage 4: past the map's edge into the scene too, behind the ground (depth 1: only where it is not), so it is lit)
        GLR.listDepth(-64); v.imageSmoothingEnabled = true;
        const e = edgePic(), P = EDGE_PAD;
        v.drawImage(e, -P * CELL, -P * CELL, (MAP + 2 * P) * CELL, (MAP + 2 * P) * CELL);
        v.imageSmoothingEnabled = false; GLR.listDepth(null);
      }
      const list = [];
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
        const c = idx(cx, cy), o = G.ore[c];
        if (o && onScr((cx + 0.5) * CELL, (cy + 0.5) * CELL, 40, 40, 40)) list.push({ cx, cy, o, gem: G.gem[c], key: viewDepth((cx + 0.5) * CELL, (cy + 0.5) * CELL) });
      }
      list.sort((a, b) => a.key - b.key);
      for (const r of list) { if (glRec) GLR.listDepth(r.key + 12); onHill(v, (r.cx + 0.5) * CELL, (r.cy + 0.5) * CELL, () => drawOre(v, r.cx, r.cy, r.o, r.gem)); }
      if (glRec) GLR.listDepth(null);
    } else if (warp) {
      // (Only the chunks that show: the world box round a turned screen is about three times the screen.)
      const chunks = G.ground.chunks(sx, sy, sw, sh).filter((c) => { const b = c.box = warp.box(c); return b[2] > vx - 2 && b[0] < vx + VW + 2 && b[3] > vy - 2 && b[1] < vy + VH + 2; }).sort((a, b) => a.key - b.key);
      ores = [];
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
        const c = idx(cx, cy), o = G.ore[c];
        if (o && onScr((cx + 0.5) * CELL, (cy + 0.5) * CELL, 40, 40, 40)) ores.push({ cx, cy, o, gem: G.gem[c], key: viewDepth((cx + 0.5) * CELL, (cy + 0.5) * CELL) + 40 });
      }
      ores.sort((a, b) => a.key - b.key);
      const oreAt = (r) => onHill(v, (r.cx + 0.5) * CELL, (r.cy + 0.5) * CELL, () => drawOre(v, r.cx, r.cy, r.o, r.gem));
      drawCh = (c, withOre) => {
        warp.set(c); G.ground.drawChunk(v, c, 't');
        if (withOre) { warp.flat(); for (const r of ores) { const x = (r.cx + 0.5) * CELL, y = (r.cy + 0.5) * CELL; if (x >= c.X0 && x < c.X1 && y >= c.Y0 && y < c.Y1) oreAt(r); } warp.set(c); }
        G.ground.drawChunk(v, c, 'd');
      };
      let j = 0;
      for (const c of chunks) {
        if (j < ores.length && ores[j].key < c.key) { warp.flat(); while (j < ores.length && ores[j].key < c.key) oreAt(ores[j++]); }
        drawCh(c, false);
      }
      warp.flat();
      while (j < ores.length) oreAt(ores[j++]);
      occs = chunks.filter((c) => warp.fitOf(c).occ);
    } else {
      G.ground.draw(v, 't', sx, sy, sw, sh, sx, sy);
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {   // ore
        const c = idx(cx, cy), o = G.ore[c];
        if (o && onScr((cx + 0.5) * CELL, (cy + 0.5) * CELL, 40, 40, 40)) drawOre(v, cx, cy, o, G.gem[c]);
      }
      G.ground.draw(v, 'd', sx, sy, sw, sh, sx, sy);
    }
    if (past) { if (glRec) soft('seam', (g) => edgeSeam(g, ox, oy, bw, bh)); else edgeSeam(v, ox, oy, bw, bh); }
    // Walls and gates on explored ground (art.js wallPic). A gate stands open while one of its own alliance is beside it.
    const wallsHere = [];   // (sorted in with the units below, art.js drawWallIso)
    if (G.wallN) {
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
        const c = idx(cx, cy), id = G.wall[c];
        if (!id || !G.seen[c]) continue;
        const wt = G.wallTeam[c], d = WALL_BY_ID[id], tm = G.teams[wt];
        let mask = (cy > 0 && G.wall[c - MAP] ? 1 : 0) | (cx < MAP - 1 && G.wall[c + 1] ? 2 : 0) | (cy < MAP - 1 && G.wall[c + MAP] ? 4 : 0) | (cx > 0 && G.wall[c - 1] ? 8 : 0);
        // Diagonal joins (16 NE, 32 SE, 64 SW, 128 NW): a piece touching another only at a corner, a diagonal wall.
        if (!d.gate) for (const [dx, dy, bit] of WALL_DIAG) {
          const x = cx + dx, y = cy + dy;
          // (A gate's middle only when it lies diagonally this way: the wall runs on into it. A gate's end any way: it draws a
          // stub of wall out to that corner, art.js drawWallIso.)
          const k = idx(x, y), wd = inMap(x, y) && WALL_BY_ID[G.wall[k]];
          if (wd && !G.wall[idx(x, cy)] && !G.wall[idx(cx, y)] && (!wd.gate || G.wall[k] === 6 || gateDiag(k) === dx * dy)) mask |= bit;
        }
        let open = 0, gm = 0;
        if (d.gate) {                                                       // its barrier sinks and rises over about a third of a second (looks only)
          // The three cells of a gate are drawn as one and open as one, when one of its alliance is beside any of it.
          const cs = gateCells(c), xs = cs.map(cellX), ys = cs.map(cellY), now = performance.now();
          const bx0 = Math.min(...xs) * CELL - 22, by0 = Math.min(...ys) * CELL - 22, bx1 = (Math.max(...xs) + 1) * CELL + 22, by1 = (Math.max(...ys) + 1) * CELL + 22;
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
    for (const fx of G.effects) if ((fx.type === 'husk' || fx.type === 'corpse') && fx.t >= 0 && onScr(fx.x, fx.y)) { if (glRec) GLR.listDepth(viewDepth(fx.x, fx.y) + 10 + craterSink(fx.x, fx.y)); onHill(v, fx.x, fx.y, () => drawEffect(v, fx)); }
    if (glRec) GLR.listDepth(null);
    const treeShows = (x, y) => onScr(x, y, 60, 30, 90);
    lap('gnd');   // the ground, ore, walls' list, wrecks and bodies
    let trees = treesInView(v, ox - 20, oy - 4, ox + bw + 20, oy + bh + 40, treeShows, true);   // swaying in the wind, burning (art.js): sorted in with the units below
    if (past) for (const t of rimInView(v, ox - 20, oy - 4, ox + bw + 20, oy + bh + 40, treeShows, true)) trees.push(t);   // the woods past the map's edge
    trees = isoTreeBlocks(v, trees, rimTrees(), vx, vy, VW, VH);   // their shadows; in a far view still trees come from cached blocks (art.js)
    lap('tsh');   // tree shadows and the far view's cached tree blocks

    // An effect on the screen: tracers and Tesla bolts by either end or their middle (a gun just off the screen firing into
    // it), a lightning bolt by its landing spot with room for its top, which is drawn up to about 230 px to the side.
    const fxShows = (fx) => fx.x2 !== undefined
      ? onScr(fx.x, fx.y, 120, 100, 400) || onScr(fx.x2, fx.y2, 120, 100, 400) || onScr((fx.x + fx.x2) / 2, (fx.y + fx.y2) / 2, 120, 100, 400)
      : onScr(fx.x, fx.y, fx.type === 'bolt' ? 360 : 120, 100, 400);
    const ground = [], air = [], underDeck = [];
    let dk = null;
    for (const e of G.entities) {
      if (!inView(e) || !visibleToPlayer(e)) continue;
      // Parked aircraft too, so they show on top of their Helipad or Airfield.
      if (e.kind === 'unit' && e.cls === 'air') air.push(e);
      else if (e.kind === 'unit' && e.def.naval && (dk = decksOver(e))) underDeck.push([e, dk]);   // (a ship under a bridge: below)
      else ground.push(e);
    }
    // Ships under a bridge (art.js decksOver): drawn now, with the ground, then the bridges' decks over them; units on the deck are
    // drawn later with everything else, on top.
    if (underDeck.length) {
      const decks = new Set();
      for (const [e, bs] of underDeck) { if (glRec) GLR.listDepth(viewDepth(e.x, e.y) + 10); onHill(v, e.x, e.y, () => drawUnit(v, e, G.t)); for (const b of bs) decks.add(b); }
      if (glRec) GLR.listDepth(null);
      for (const b of decks) drawDeck(v, b);
    }
    // Village houses on explored ground (world.js genVillage), sorted in with everything else.
    for (const t of trees) ground.push(t);
    for (const w of wallsHere) ground.push(w);
    for (const h of G.houses || []) if (h.alive && houseSeen(h) && h.x > x0 - 60 && h.x < x1 + 60 && h.y > y0 - 60 && h.y < y1 + 120) ground.push(h);
    for (const p of G.props || []) if (inView(p) && G.seen[cellOfPos(p.x, p.y)]) ground.push(p);
    // Structures coming down (world.js fallDown), sorted in as the structure was.
    for (const fx of G.effects) if (fx.type === 'fall' && fx.t >= 0 && inView(fx) && G.seen[cellOfPos(fx.x, fx.y)]) ground.push({ kind: 'fall', fx, cx: fx.cx, cy: fx.cy, w: fx.w, h: fx.h, x: fx.x, y: fx.y });
    lap('list');
    lookView = v; cliffItems(ground, x0, y0, x1, y1, onScr);   // tall rock (look.js prototype, off by default)
    lap('crag');   // the crags in view found (and any made)
    for (const f of G.folk || []) if (f.st !== 'in' && inView(f) && G.seen[cellOfPos(f.x, f.y)]) ground.push({ kind: 'folk', v: f, y: f.y });
    for (const c of G.hens || []) if (inView(c) && G.seen[cellOfPos(c.x, c.y)]) ground.push({ kind: 'hen', v: c, y: c.y });
    if (G.birds) drawBirds(v, false, x0, y0, x1, y1);   // pigeons on the ground
    // Back to front on the screen. A structure sorts by a point 0.4 of the way into its footprint, so a unit beside
    // one of its front walls is drawn in front of it and one by its back walls behind it.
    // A structure sorts by its footprint's front corner. Anything standing beside one is in front of it when it is nearer
    // the camera than the closest point of the footprint (beside a front wall), and is then moved to just after it;
    // otherwise (beside a back wall) it is already before it.
    const big = (e) => e.kind === 'bld' || e.kind === 'house' || e.kind === 'fall';
    const posOf = (e) => (e.kind === 'folk' || e.kind === 'hen' ? e.v : e);
    for (const e of ground) {
      if (big(e)) {
        const x0 = e.cx * CELL, y0 = e.cy * CELL, x1 = x0 + e.w * CELL, y1 = y0 + e.h * CELL;
        e._key = Math.max(viewDepth(x0, y0), viewDepth(x1, y0), viewDepth(x0, y1), viewDepth(x1, y1));
      } else { const p = posOf(e); e._key = viewDepth(p.x, p.y); }
    }
    const NEAR = CELL * 1.5;
    // (Only what stands within NEAR of each structure is looked at: the things in view by cell, as zoomed out
    // thousands of trees and units against a hundred structures cost a PC 10 ms and more a frame.)
    const byCell = new Map(), CK = (x, y) => (y + 512) * 4096 + x + 512;
    for (const e of ground) {
      if (big(e)) continue;
      const p = posOf(e), k = CK(Math.floor(p.x / CELL), Math.floor(p.y / CELL)), l = byCell.get(k);
      if (l) l.push(e); else byCell.set(k, [e]);
    }
    for (const b of ground) {
      if (!big(b)) continue;
      const x0 = b.cx * CELL, y0 = b.cy * CELL, x1 = x0 + b.w * CELL, y1 = y0 + b.h * CELL;
      const gx1 = Math.floor((x1 + NEAR) / CELL), gy1 = Math.floor((y1 + NEAR) / CELL);
      for (let gy = Math.floor((y0 - NEAR) / CELL); gy <= gy1; gy++) for (let gx = Math.floor((x0 - NEAR) / CELL); gx <= gx1; gx++) for (const e of byCell.get(CK(gx, gy)) || []) {
        if (e._key > b._key) continue;
        const p = posOf(e);
        if (p.x < x0 - NEAR || p.x > x1 + NEAR || p.y < y0 - NEAR || p.y > y1 + NEAR) continue;
        const nx = Math.max(x0, Math.min(x1, p.x)), ny = Math.max(y0, Math.min(y1, p.y));
        if (viewDepth(p.x, p.y) > viewDepth(nx, ny)) e._key = b._key + 0.01;
      }
    }
    depthSort(ground);
    v.upright = true;   // from here on, pictures, pixels and labels stand upright (art.js uprightCtx)
    lap('list');   // tree shadows, the lists and the sort
    // Each on the raised ground (look.js onHill): a structure or house at the middle of its footprint.
    const hillAt = (e) => (big(e) ? [(e.cx + e.w / 2) * CELL, (e.cy + e.h / 2) * CELL] : [posOf(e).x, posOf(e).y]);
    const drawOne = (e, v) => {   // (v: the view canvas, or gl.js's recorder while WebGL draws the list)
      if (e.kind === 'bld') { if (!e.def.camo) drawFoundation(v, e); drawStructure(v, e, G.t); lookAlive(v, e); lap('bld'); }   // (lookAlive: lookfx.js, living structures)
      else if (e.kind === 'house') { drawHouse(v, e); lap('bld'); }
      else if (e.kind === 'fall') { drawFall(v, e.fx); lap('bld'); }
      else if (e.kind === 'prop') { drawProp(v, e); lap('misc'); }
      else if (e.kind === 'folk') { drawFolk(v, e.v); lap('misc'); }
      else if (e.kind === 'hen') { drawHen(v, e.v); lap('misc'); }
      else if (e.kind === 'wall') { drawWallIso(v, e); lap('bld'); }
      else if (e.kind === 'cliff') { drawCliff(v, e); lap('bld'); }
      else { drawUnit(v, e, G.t); lap('unit'); DP.nUnit++; }
    };
    // On the raised ground, a chunk that hides ground behind it (occs) is drawn again just before the first thing standing
    // less than 6 px behind its back corner, if something drawn before it (further back) shows where it does (drawnBox).
    let oi = 0;
    const drawn = [];
    const drawnBox = (e) => {
      if (big(e)) return bldBox(e);
      const [hx, hy] = hillAt(e), [X, Y] = toView(...hillPt(hx, hy));
      if (e.kind === 'cliff') { const k = e.p.sx !== undefined ? e.p.k || 1 : 1; return [X + e.p.X0, Y + e.p.Y0, X + e.p.X0 + (e.p.w || e.p.c.width) / k, Y + e.p.Y0 + (e.p.h || e.p.c.height) / k]; }   // (an HD baked crag: w, h in its sheet's pixels)
      return [X - 30, Y - (e.kind === 'tree' ? 90 : 70), X + 30, Y + 12];
    };
    const reHill = (c) => {
      const b = c.box;
      if (!drawn.some((d) => d[0] < b[2] && d[2] > b[0] && d[1] < b[3] && d[3] > b[1])) return;
      const up = v.upright; v.upright = false;
      drawCh(c, true); toWorld(); v.upright = up;
    };
    // gl.js (stage 2): with the ground in WebGL, the list's pictures become WebGL quads (in this order, each tested against
    // the ground's depth at its base, so a hill hides what stands behind it: no reHill), the rest drawn on a layer above.
    const glList = glRec, lv = v;
    // Crags with WebGL: a run of them in the list is drawn in screen px from one transform change (look.js drawCliffAt).
    const fastCliff = glList && !occs, WM = fastCliff ? lv.getTransform() : null;
    let scr = false, scrUp = false;
    const toList = () => { if (scr) { lv.setTransform(WM); lv.upright = scrUp; scr = false; } };
    for (const e of ground) {
      if (occs) { while (oi < occs.length && occs[oi].key - 6 <= e._key) reHill(occs[oi++]); drawn.push(drawnBox(e)); }
      if (glList) GLR.listDepth(e._key + (big(e) ? 2 : e.kind === 'tree' ? 14 : e.kind === 'cliff' ? 16 : 10 + craterSink(...hillAt(e))));
      if (fastCliff && e.kind === 'cliff') {
        if (!scr) { scrUp = lv.upright; lv.upright = false; lv.setTransform(1, 0, 0, 1, 0, 0); scr = true; }
        drawCliffAt(lv, e, WM); lap('bld'); continue;
      }
      toList();
      if (e.kind === 'tree') { drawTree(lv, e); lap('tree'); DP.nTree++; continue; }   // (lifted in drawTree)
      const [hx, hy] = hillAt(e);
      if (e.kind === 'unit') { const [px, py] = emergePos(e); onHill(lv, hx, hy, () => drawOne(e, lv), standLift(px, py)); }   // (on a ramp: look.js)
      else onHill(lv, hx, hy, () => drawOne(e, lv));
    }
    toList();
    // gl.js (stage 3): the recording goes on past the list: smoke, blasts, the edge's haze, shots, effects and aircraft are
    // WebGL quads too (shots and effects tested against the ground's depth at their spot), the frame put into the view after them.
    const glDepth = glList ? (d) => GLR.listDepth(d) : () => {};
    if (occs) while (oi < occs.length) reHill(occs[oi++]);
    glDepth(null);
    lookSmoke(v);   // bigger smoke and fires over the units (look.js test)
    lookFxOver(v);   // lookfx.js: steam, fireballs and debris over the units
    lap('misc');
    if (past) {   // haze over the outer woods past the map's edge
      const up = v.upright; v.upright = false; v.imageSmoothingEnabled = true;
      const P = EDGE_PAD; v.drawImage(edgeVeil(), -P * CELL, -P * CELL, (MAP + 2 * P) * CELL, (MAP + 2 * P) * CELL);
      if (glRec) soft('mist', (g) => edgeMist(g, ox, oy, bw, bh, onScr)); else edgeMist(v, ox, oy, bw, bh, onScr);
      v.imageSmoothingEnabled = false; v.upright = up;
    }
    lap('edge');
    glDepth(null);
    for (const e of ground) if (e.kind === 'bld' && e.type === 'ftur') { glDepth(e._key + 2); onHill(v, (e.cx + e.w / 2) * CELL, (e.cy + e.h / 2) * CELL, () => flameJet(v, e)); }
    // Shots, each moved up by the raised ground under it (look.js onHill).
    for (const p0 of G.projectiles) {
      if (p0.delay > 0) continue;
      const gx = p0.gy !== undefined ? p0.gx : p0.kind === 'bomb' ? p0.tx : p0.x, gy = p0.gy !== undefined ? p0.gy : p0.kind === 'bomb' ? p0.ty : p0.y;
      glDepth(viewDepth(gx, gy) + 10);
      onHill(v, gx, gy, () => drawShot(p0));
    }
    function drawShot(p) {
      if (p.gy !== undefined) { const [lx, ly] = liftPt(p.gx, p.gy, p.gy - p.y); p = { ...p, x: lx, y: ly }; }   // a lobbed shell or grenade: its height up the screen
      else if (p.kind === 'bomb') { const [lx, ly] = liftPt(p.tx, p.ty, p.ty - p.y); p = { ...p, x: lx, y: ly }; }   // falling on (tx, ty)
      else if (p.h0 !== undefined && p.kind !== 'fireball') { const h = projH(p), [lx, ly] = liftPt(p.x, p.y + h, h); p = { ...p, x: lx, y: ly }; }   // a shell or missile between its gun's height and its target's (world.js projH)
      const a = p.a || 0, ca = Math.cos(a), sa = Math.sin(a);
      if (p.kind === 'bomb') {
        v.fillStyle = 'rgba(0,0,0,0.35)'; v.fillRect(Math.round(p.tx - 1), Math.round(p.ty), 3, 2);
        v.fillStyle = '#1d1f18'; v.fillRect(Math.round(p.x - 1), Math.round(p.y - 2), 3, 5);
        return;
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
        return;
      }
      if (p.kind === 'grenade') {
        v.fillStyle = 'rgba(0,0,0,0.35)'; v.fillRect(Math.round(p.gx - 1), Math.round(p.gy), 3, 2);
        v.fillStyle = '#2d351c'; v.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 3, 3);
        v.fillStyle = '#6f7d48'; v.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 1, 1);
        return;
      }
      if (p.kind === 'fireball') { fireStream(v, p); return; }
      if (p.kind === 'torpedo') {   // just under the water: a dark body with a white trail of froth
        for (let i = 1; i <= 3; i++) { v.fillStyle = `rgba(230,240,242,${0.6 - i * 0.15})`; v.fillRect(Math.round(p.x - ca * (2 + i * 2)), Math.round(p.y - sa * (2 + i * 2)), 1, 1); }
        v.fillStyle = '#20262a'; v.fillRect(Math.round(p.x - ca * 1.5 - 0.5), Math.round(p.y - sa * 1.5 - 0.5), 2, 1); v.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
        return;
      }
      if (p.kind === 'depth') { v.fillStyle = '#2c2a24'; v.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 2, 3); v.fillStyle = '#5a564a'; v.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 1, 1); return; }
      if (p.kind === 'shell') { v.fillStyle = '#ffe9a0'; v.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 2, 2); v.fillStyle = 'rgba(255,200,90,0.5)'; v.fillRect(Math.round(p.x - ca * 3), Math.round(p.y - sa * 3), 1, 1); }
      else if (p.kind === 'flak') { v.fillStyle = '#ffd36a'; v.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
      else if (p.atgm) {   // a long-range anti-tank missile: a slim white body, dark seeker, a bright motor
        if (p.drop > 0) { v.fillStyle = '#d8d6cc'; v.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 3, 2); return; }
        for (let i = -3; i <= 2; i++) { v.fillStyle = i >= 2 ? '#3a3a34' : '#eceae2'; v.fillRect(Math.round(p.x + ca * i), Math.round(p.y + sa * i), 2, 2); }
        v.fillStyle = '#ffd27a'; v.fillRect(Math.round(p.x - ca * 5 - 1), Math.round(p.y - sa * 5 - 1), 3, 3);
        v.fillStyle = '#ff8a2a'; v.fillRect(Math.round(p.x - ca * 7), Math.round(p.y - sa * 7), 2, 2);
      }
      else {
        v.fillStyle = '#d8d6cc'; v.fillRect(Math.round(p.x - ca * 2), Math.round(p.y - sa * 2), 2, 2);
        v.fillStyle = '#ff9a2a'; v.fillRect(Math.round(p.x - ca * 4), Math.round(p.y - sa * 4), 1, 1);
      }
    }
    for (const fx of G.effects) {
      if (!(fx.t >= 0 && fx.type !== 'husk' && fx.type !== 'corpse' && fx.type !== 'fall' && fx.x > x0 && fx.x < x1 && fx.y > y0 && fx.y < y1 && fxShows(fx))) continue;
      DP.nFx++;
      // Up in the air (rising smoke and flames, world.js updateEffects): drawn that high straight up the screen; and on the
      // raised ground (look.js gLift; a tracer's or bolt's far end by the ground there).
      const gx = fx.x, gy = fx.y, hx = fx.x2, hy = fx.y2, L = (fx.lift || 0) + gLift(gx, gy), L2 = hx !== undefined ? gLift(hx, hy) : 0;
      glDepth(viewDepth(gx, gy) + 10);
      if (!L && !L2) { drawEffect(v, fx); continue; }
      [fx.x, fx.y] = liftPt(gx, gy, L);
      if (L2) [fx.x2, fx.y2] = liftPt(hx, hy, L2);
      try { drawEffect(v, fx); } finally { fx.x = gx; fx.y = gy; if (L2) { fx.x2 = hx; fx.y2 = hy; } }
    }
    lap('fx');   // shots and effects
    glDepth(null);
    air.sort((a, b) => (a.alt || 0) - (b.alt || 0) || a.y - b.y);
    for (const e of air) onHill(v, e.x, e.y, () => drawUnit(v, e, G.t));   // (above the raised ground under them)
    if (G.birds) drawBirds(v, true, x0, y0, x1, y1);   // pigeons in the air and on the church roof
    // The HUD (stage 5: with WebGL, recorded after the light and the weather, so the view and the screen's canvas need not
    // be cleared and scaled up over the whole screen for it: see the light pass's over() above).
    const hud = () => {
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
      const selSet = new Set(G.selection);   // (a big selection: includes() for every thing in view added up)
      // (one pass over the things: the research, capture and PRIMARY bars below are picked out here and drawn after, in
      // the same order as before, when each had a pass of its own)
      const rs = G.teams[G.me].research, techs = [], caps = [], prims = [];
      for (const e of G.entities) {
        if (!inView(e) || !visibleToPlayer(e)) continue;
        if (e.kind === 'bld' && e.alive) {
          if (rs && e.type === 'tech' && e.team === G.me && e.buildT >= 1) techs.push(e);
          if (e.capture > 0) caps.push(e);
          if (e.primary && e.team === G.me) prims.push(e);
        }
        const sel = selSet.has(e);
        const recent = G.t - e.hitT < 3;
        if (e.rank && e.kind === 'unit') drawRank(v, e);
        if (!sel && !recent) continue;
        if (e.kind === 'bld') {
          const bx = bldBox(e);
          if (sel) brackets(v, ...bx);
          if (sel && e.team === G.me && e.rally && e.exitCell !== undefined) { toWorld(); drawRally(v, e, e.rally); onView(); }
          drawHealth(v, e, (bx[0] + bx[2]) / 2, bx[1] - 6, Math.min(48, e.w * CELL - 8));
        } else {
          const inf = e.cls === 'inf', r = inf ? Math.round(e.def.r * INF_SCALE) + 2 : e.def.r + 2, [xx, yy] = unitSpot(e, inf ? 8 * INF_SCALE : 3);
          if (sel) brackets(v, xx - r, yy - r - (inf ? 3 : 0), xx + r, yy + r + (inf ? 2 : 0));
          drawHealth(v, e, xx, yy - r - (inf ? 7 : 5), Math.max(10, r * 2));
        }
      }

      // Research under way: a bar under each of this side's Tech Centers.
      for (const e of techs) {
        const [tx, ty] = toView(...hillPt(e.cx * CELL + e.w * CELL / 2, e.cy * CELL + e.h * CELL - 3));
        v.fillStyle = 'rgba(0,0,0,0.7)'; v.fillRect(tx - 21, ty - 3, 42, 6);
        v.fillStyle = rs.stalled ? '#c98a2a' : '#5ab0ff'; v.fillRect(tx - 20, ty - 2, 40 * rs.progress, 4);
      }
      // A Construction Yard being captured (world.js CAPTURE_CY): a yellow bar over it, for both sides.
      for (const e of caps) {
        const [tx, ty] = toView(...hillPt(e.cx * CELL + e.w * CELL / 2, e.cy * CELL + e.h * CELL - 10));
        v.fillStyle = 'rgba(0,0,0,0.75)'; v.fillRect(tx - 23, ty - 4, 46, 8);
        v.fillStyle = Math.floor(G.t * 4) % 2 ? '#ffd23e' : '#f2a020'; v.fillRect(tx - 22, ty - 3, 44 * e.capture, 6);
      }
      // PRIMARY over the building new units come out of, when there is more than one of its type.
      for (const e of prims) {
        if (producersOfType(e).length < 2) continue;
        const [tx, ty] = toView(...hillPt(e.cx * CELL + e.w * CELL / 2, e.cy * CELL + e.h * CELL - 3));
        v.font = 'bold 7px monospace'; v.textAlign = 'center'; v.textBaseline = 'middle';
        v.fillStyle = 'rgba(0,0,0,0.65)'; v.fillRect(tx - 18, ty - 4.5, 36, 9);
        v.fillStyle = '#f2d24a'; v.fillText('PRIMARY', tx, ty + 0.5);
      }

      // Shroud: black where the player has never looked, softened at the edges.
      if (G.shroudDirty) {
        G.shroudDirty = false;
        const d = shroudImg.data;
        let dark = 0;
        for (let i = 0; i < NCELLS; i++) { if (G.seen[i]) d[i * 4 + 3] = 0; else { d[i * 4 + 3] = 255; dark++; } }
        shroudDark = dark;
        sctx.putImageData(shroudImg, 0, 0);
      shroudCanvas._ver = (shroudCanvas._ver || 0) + 1; shroudCanvas._own = true;   // (gl.js: changed, upload it again; a texture of its own)
      }
      toWorld();
      v.imageSmoothingEnabled = true;
      // Only the part of the box on the map: Safari (iPhone) stretches and shifts a picture whose source rectangle runs
      // past its edges instead of clipping it, so the fog slid about while scrolling near the map's edges.
      const fx0 = Math.max(0, ox), fy0 = Math.max(0, oy), fx1 = Math.min(WORLD, ox + bw), fy1 = Math.min(WORLD, oy + bh);
      // (shroudDark: unexplored cells left; none, and there is no fog to draw. Zoomed out on the raised ground, going over
      // every chunk in view for it was ~8 ms a frame: owner's PC, 2026-11-22)
      if (fx1 > fx0 && fy1 > fy0 && shroudDark) {
        if (warp) {   // on the raised ground, in chunks (look.js hillWarp); only where some of it is dark
          const L = HILL_LAP;
          warp.each(fx0, fy0, fx1, fy1, (X0, Y0, X1, Y1) => {
            v.drawImage(shroudCanvas, X0 / CELL, Y0 / CELL, (X1 - X0) / CELL, (Y1 - Y0) / CELL, X0 - L, Y0 - L, X1 - X0 + 2 * L, Y1 - Y0 + 2 * L);
          }, shroudClear);
        } else v.drawImage(shroudCanvas, fx0 / CELL, fy0 / CELL, (fx1 - fx0) / CELL, (fy1 - fy0) / CELL, fx0, fy0, fx1 - fx0, fy1 - fy0);
      }
      v.imageSmoothingEnabled = false;
      if (Chat.busy) { onView(); Chat.drawView(v, (x, y) => toView(...hillPt(x, y))); toWorld(); }   // allies' map pings (chat.js)

  drawPlacement(v);
    };
    // gl.js (stage 4): the light pass (the mood, the night, the lights; the pictures' lit sides from their normal maps), then
    // what goes over the light, drawn in the view's pixels through the same recording: lamps, beacons, navigation lights,
    // searchlights, the pools by night, the storm's darkening, rain and snow, lightning (the 2D way draws them on the screen
    // after the view: see below, skipped when GLR.lit).
    if (glList) { const kk = cam.z * DPR, dnMap = MAPS[validMap(G.mapId)].daynight, still = G.paused || !!G.over;
      lap('air');   // aircraft and birds
      GLR.listEnd(realV, { vx, vy, cam: [vx, vy], sw: view.width, sh: view.height, over: (g) => {   // (the look's light over the view canvas, as the 2D way now draws it)
        lap('gpu');   // gl.js: the recorded frame handed to WebGL (flush, scene) and its light pass
        const night = dayNight(G.t).night, near = (x, y, m) => x > vx - m && y > vy - m && x < vx + VW + m && y < vy + VH + m;
        if (LOOK.light && !dnMap && LOOK.lamps) drawLamps(g, vx, vy, 1, G.t, near);
        if (dnMap) {
          if (night >= 0.01) navLights(g, vx, vy, 1, G.t, night, near, visibleToPlayer);
          drawLampsAlone(g, vx, vy, VW, VH, 1, G.t); drawSkyBeams(g, vx, vy, 1, G.t, night); lookNightPools(g, vx, vy, VW, VH, 1, night);
        }
        const wx = lookStorm.weather(still);
        lookStorm.dark(g);
        if (wx) drawWeather(g, wx, vx, vy, VW, VH, 1, G.t, still);
        lookStorm.flash(g, 1, still, vx, vy);
        lap('wthr');   // lamps, night lights, storm, rain and snow
        v = g; toWorld(); v.imageSmoothingEnabled = false; v.globalAlpha = 1; v.globalCompositeOperation = 'source-over';
        try { hud(); } finally { v = realV; }
        lap('bars');   // bars, labels, shroud and placement
      } });
      lap('gpu');   // (what went over the light, drawn into the lit frame)
      v = realV;
      toWorld(); v.imageSmoothingEnabled = false; v.globalAlpha = 1; v.globalCompositeOperation = 'source-over'; }

    lap('air');   // aircraft and birds
    if (!GLR.lit) hud();
    lap('bars');   // bars, labels, shroud and placement
    v.setTransform(1, 0, 0, 1, 0, 0);
    // The look's light (look.js drawLook) on the view canvas, at zoom 1, before it is scaled up to the screen: its blend
    // passes over the whole picture cost a phone far too much at the screen's own resolution (3 x 3 pixels a view pixel
    // on an iPhone), and its light is soft, so nothing shows the difference.
    // (gl.js: with WebGL this light is its light pass, GLR.lit.)
    const daynight = MAPS[validMap(G.mapId)].daynight;
    if (GLR.lit) { /* drawn already */ }
    else if (LOOK.light && !daynight) drawLook(v, vx, vy, VW, VH, 1, G.t);
    else if (LOOK.light && LOOK.mood) drawLook(v, vx, vy, VW, VH, 1, G.t, dayNight(G.t).night);   // the map's mood by day (look.js), fading out at night
    lap('night');

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = z < 1;
    const k = z * DPR;
    const sx2 = shakeAmp > 0.3 ? (Math.random() - 0.5) * 2 * shakeAmp * DPR : 0, sy2 = shakeAmp > 0.3 ? (Math.random() - 0.5) * 2 * shakeAmp * DPR : 0;
    // gl.js (stage 5): the WebGL frame onto its own canvas under this one, at the same spot; this one cleared over it.
    // The HUD is in the WebGL frame too, so the view is not put on the screen then (only this canvas cleared).
    if (GLR.lit && GLR.present(canvas, Math.round(-(cam.x - vx) * k + sx2), Math.round(-(cam.y - vy) * k + sy2), Math.round(VW * k), Math.round(VH * k), z < 1)) ctx.clearRect(0, 0, canvas.width, canvas.height);
    else {
      if (GLR.hide) GLR.hide(); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(view, 0, 0, VW, VH, Math.round(-(cam.x - vx) * k + sx2), Math.round(-(cam.y - vy) * k + sy2), Math.round(VW * k), Math.round(VH * k));
    }
    lap('blit');   // the view put on the screen
    if (GLR.lit) { lap('night'); lap('wthr'); }   // (gl.js: lit, with the weather, in the view already)
    else {
    if (MAPS[validMap(G.mapId)].daynight) drawNight(ctx, cam.x, cam.y, canvas.width / k, canvas.height / k, k, G.t, visibleToPlayer);   // (art.js)
    if (MAPS[validMap(G.mapId)].daynight) drawLampsAlone(ctx, cam.x, cam.y, canvas.width / k, canvas.height / k, k, G.t);   // beacons and lit windows (look.js)
    if (MAPS[validMap(G.mapId)].daynight) drawSkyBeams(ctx, cam.x, cam.y, k, G.t, dayNight(G.t).night);   // the AA Gun's searchlight at night (look.js)
    if (MAPS[validMap(G.mapId)].daynight) lookNightPools(ctx, cam.x, cam.y, canvas.width / k, canvas.height / k, k, dayNight(G.t).night);   // light pools' colour at night (look.js)
    lap('night');
    const wx = lookStorm.weather(G.paused || !!G.over);   // a passing storm's heavier stand-in, or the battle's own weather (lookstorm.js)
    lookStorm.dark(ctx);
    if (wx) drawWeather(ctx, wx, cam.x, cam.y, canvas.width / k, canvas.height / k, k, G.t, G.paused || !!G.over);
    lookStorm.flash(ctx, k, G.paused || !!G.over, cam.x, cam.y);
    lap('wthr');
    }
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
    const [sx, sy] = hillPt(cellX(b.exitCell) * CELL + CELL / 2, cellY(b.exitCell) * CELL + CELL / 2), [rx, ry] = hillPt(r.x, r.y);   // (on the raised ground: look.js)
    v.strokeStyle = 'rgba(94,224,96,0.85)'; v.lineWidth = 1;
    v.setLineDash([4, 3]); v.beginPath(); v.moveTo(sx, sy); v.lineTo(rx, ry); v.stroke(); v.setLineDash([]);   // (on the ground)
    v.fillStyle = '#5ee060'; v.beginPath(); v.arc(rx, ry, 2, 0, 7); v.fill();
    const [fx, fy] = onScreen(v, rx, ry, 0);   // the flag stands up the screen
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
      const r = p.guard ? Math.max(...p.guard.filter((u) => u.alive).map(guardReach), CELL) : p.power === 'spy' ? POWERS.spy.reveal * CELL : p.power === 'cas' ? POWERS.cas.r : p.power === 'para' || p.power === 'assault' ? 40 : 60;
      onHill(v, p.x, p.y, () => {
        v.strokeStyle = p.guard ? '#5ee060' : '#ff5a4a'; v.lineWidth = 1;
        v.setLineDash([4, 3]); v.beginPath(); v.arc(p.x, p.y, r, 0, 7); v.stroke(); v.setLineDash([]);
        v.beginPath(); v.moveTo(p.x - 8, p.y); v.lineTo(p.x + 8, p.y); v.moveTo(p.x, p.y - 8); v.lineTo(p.x, p.y + 8); v.stroke();
      });
      return;
    }
    if (p && p.wall) {   // a line of wall: the cells it would take, green where a piece can stand
      if (p.ax === undefined) return;
      const team = G.teams[G.me], blds = buildingsOf(team.id);
      for (const c of wallLine(p.wall, p.ax, p.ay, p.bx, p.by)) {
        v.fillStyle = (WALLS[p.wall].gate ? gateCellOk(team, c, blds) : wallOk(team, c, blds)) ? 'rgba(90,230,110,0.45)' : 'rgba(220,40,30,0.45)';
        onHill(v, (cellX(c) + 0.5) * CELL, (cellY(c) + 0.5) * CELL, () => v.fillRect(cellX(c) * CELL, cellY(c) * CELL, CELL, CELL));
      }
      v.strokeStyle = '#f2f2ea'; v.lineWidth = 1; onHill(v, (p.ax + 0.5) * CELL, (p.ay + 0.5) * CELL, () => v.strokeRect(p.ax * CELL + 0.5, p.ay * CELL + 0.5, CELL - 1, CELL - 1));
      return;
    }
    if (!p || p.cx === undefined) return;
    const d = BUILD_DEFS[p.type];
    const team = G.teams[G.me];
    p.ok = canPlace(team, p.type, p.cx, p.cy, 0);
    drawVar = team.variant | 0;
    const hx = (p.cx + d.w / 2) * CELL, hy = (p.cy + d.h / 2) * CELL;   // (on the raised ground, as the structure will stand: look.js)
    onHill(v, hx, hy, () => drawPlacing(v, p, d, team));
  }
  function drawPlacing(v, p, d, team) {
    drawGhost(v, p.type, team.faction, p.cx, p.cy);
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
      const c = idx(p.cx + x, p.cy + y);
      const bad = !inMap(p.cx + x, p.cy + y) || (d.water ? !navFree(c) : G.block[c] || G.bld[c] || G.ore[c]) || G.resv[c];   // (a Naval Yard or Submarine Pen: open water)
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
  const radarOn = () => !!G && ((radarDome() && !G.teams[G.me].low) || G.seen !== G.fog[G.me]);   // (map view, below: the radar works without a dome)
  let radarWas = null, radarNoise = null;
  // Minimap units: at least MM_DOT screen points across with a dark edge, in a vivid form of their side's colour,
  // so they show on snow, rock and sand alike.
  const MM_DOT = 1.6;
  const vivid = new Map();   // a palette's light colour -> the same hue, full and bright
  function vividOf(hex) {
    let c = vivid.get(hex);
    if (c) return c;
    const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
    const h = d === 0 ? 0 : mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    vivid.set(hex, c = `hsl(${Math.round(h * 60)},100%,60%)`);
    return c;
  }
  function drawRadar(dt) {
    radarT -= dt;
    if (radarT > 0 || !G) return;
    radarT = 0.2;
    const Wr = radar.width, Hr = radar.height, k = Wr / MAP, on = radarOn();
    if (radarWas !== null && on !== radarWas && !G.over) eva(on ? 'Radar online' : 'Radar offline');
    radarWas = on;
    lookRadar(on);   // lookfx.js: the steel sidebar's static when the radar comes online
    if (!on) {
      // The static: four frames made once per radar size and cycled. (Drawn speck by speck every 0.2 s, with a new
      // colour string each, it took tens of milliseconds a time on a phone, and made the start menu slow to answer.)
      if (!radarNoise || radarNoise.w !== Wr || radarNoise.h !== Hr) {
        radarNoise = { w: Wr, h: Hr, i: 0, frames: [] };
        for (let f = 0; f < 4; f++) {
          const c = document.createElement('canvas'); c.width = Wr; c.height = Hr;
          const x = c.getContext('2d');
          x.fillStyle = '#0a0e0a'; x.fillRect(0, 0, Wr, Hr);
          for (let a = 0; a < 6; a++) {   // six shades instead of a new colour per speck
            x.fillStyle = `rgba(150,190,150,${(a + 0.5) * 0.03})`;
            for (let i = 0; i < Wr * Hr / 360; i++) x.fillRect(Math.random() * Wr, Math.random() * Hr, DPR, DPR);
          }
          radarNoise.frames.push(c);
        }
      }
      rctx.drawImage(radarNoise.frames[radarNoise.i = (radarNoise.i + 1) % 4], 0, 0);
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
    const dot = Math.max(MM_DOT * DPR, k * 1.2), edge = Math.max(1, Math.round(DPR * 0.4));
    for (const e of G.entities) {
      if (!visibleToPlayer(e)) continue;
      if (e.kind === 'bld') { rctx.fillStyle = G.teams[e.team].pal.main; rctx.fillRect(e.cx * k, e.cy * k, e.w * k, e.h * k); }
    }
    for (const e of G.entities) {   // units over structures, each with a dark edge
      if (e.kind === 'bld' || !visibleToPlayer(e)) continue;
      const x = Math.round(e.x / CELL * k - dot / 2), y = Math.round(e.y / CELL * k - dot / 2);
      rctx.fillStyle = 'rgba(0,0,0,0.85)'; rctx.fillRect(x - edge, y - edge, dot + 2 * edge, dot + 2 * edge);
      rctx.fillStyle = vividOf(G.teams[e.team].pal.light); rctx.fillRect(x, y, dot, dot);
    }
    rctx.drawImage(shroudCanvas, 0, 0, Wr, Hr);
    Chat.drawRadar(rctx, Wr / WORLD, DPR);   // allies' map pings (chat.js)
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
    const L = gLift((e.cx + e.w / 2) * CELL, (e.cy + e.h / 2) * CELL);   // (on the raised ground: look.js)
    return [Math.min(...xs), Math.min(...ys) - CELL * 0.8 * VK - L, Math.max(...xs), Math.max(...ys) - L];
  }
  // A unit on the view plane, raised by its height and h more.
  const unitSpot = (e, h) => toView(...liftPt(e.x, e.y, (e.alt || 0) + (h || 0) + (e.cls === 'air' ? gLift(e.x, e.y) : standLift(e.x, e.y))));   // (on a ramp: look.js)
  function pick(wx, wy, slop) {
    const [X, Y] = toView(...hillPt(wx, wy));   // (the tap's spot: s2w gives the point on the raised ground)
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
  let aimSpan = null, spanSig = '', wallArmed = null, aimMove = false;
  function setAimMove(on) { aimMove = !!on; ui.autoBtn.classList.toggle('amove', aimMove); }
  const WALL_SELL_GAP = 600;   // ms: a second tap on your own wall sooner than this is part of a double tap, not a confirmation
  function tap(sx, sy, shift, alt) {
    if (!G || G.over) return;
    const w = s2w(sx, sy);
    if (Chat.armed || (alt && Chat.canPing)) { Chat.ping(w.x, w.y); return; }   // a map ping for allies (chat.js)
    if (G.place) { placeTap(w); return; }
    if (aimMove) {   // Attack move (picked under the AUTO button): this tap is the spot; one trip, then it is off again
      setAimMove(false);
      const units = G.entities.filter((e) => e.kind === 'unit' && e.team === G.me && canAttackMove(e));
      if (!units.length) { evaCalm('No units to send', 3); return; }
      commandAttackMove(units, w.x, w.y);
      marker(w.x, w.y, '#ff4a3a'); Sound.ack(units[0].cls === 'inf' ? 'attack' : units[0].cls);
      eva('Attack move');
      return;
    }
    if (aimSpan) {
      const units = aimSpan.filter((u) => u.alive), hit = pick(w.x, w.y, (isTouch ? 16 : 6) / cam.z);
      aimSpan = null;
      if (units.length && !(hit && hit.team !== undefined && hostile(hit.team, G.me))) {   // (an enemy under the tap: the usual attack order below)
        commandAttackGround(units, w.x, w.y);
        marker(w.x, w.y, '#ff4a3a'); Sound.ack(units[0].cls === 'inf' ? 'attack' : units[0].cls);
        return;
      }
    }
    // Engineers: tap a destroyed bridge span to rebuild it, a damaged structure of your side or an ally's to repair it, or an
    // enemy structure to capture it (the rest of the selection attacks it meanwhile).
    const engs = G.selection.filter((u) => u.alive && u.kind === 'unit' && u.team === G.me && u.def.engineer);
    if (engs.length) {
      const down = spanAt(w.x, w.y), bld = pick(w.x, w.y, (isTouch ? 16 : 6) / cam.z);
      const job = down && !down.alive ? down : bld && bld.kind === 'bld' && engineerJob(engs[0], bld) ? bld : null;
      if (job) {
        commandEngineer(engs, job);
        const rest = ownUnits().filter((u) => !u.def.engineer && u.def.weapon);
        if (job.kind === 'bld' && hostile(job.team, G.me) && rest.length) commandAttack(rest, job);
        marker(job.x, job.y, hostile(job.team, G.me) ? '#ffd23e' : '#3ed04a'); Sound.ack('inf'); return;
      }
    }
    const slop = (isTouch ? 16 : 6) / cam.z;
    const e = pick(w.x, w.y, slop);
    const mine = ownUnits();
    // Your own transport under the tap with infantry selected: they board it (it comes down beside them).
    if (e && e.kind === 'unit' && e.alive && e.team === G.me && (e.def.lift || e.def.apc || e.def.ferry)) {
      const inf = mine.filter((u) => u !== e && boards(u, e));   // (a naval Transport takes vehicles too)
      if (inf.length) { commandBoard(inf, e); marker(e.x, e.y, '#3ed04a'); Sound.ack('inf'); return; }
    }
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
        select(unitsOf(G.me).filter((u) => { const [x, y] = toView(...hillPt(u.x, u.y)); return u.type === e.type && !u.chute && x > vx && x < vx + vw && y > vy && y < vy + vh; }));
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
    ui.placeText.textContent = `${isTouch ? 'Tap' : 'Click'} ${d.water ? 'open water' : ''} near your base to place the ${d.name}`.replace('  ', ' ');
    ui.placeOk.hidden = !isTouch;
    ui.placebar.hidden = false;
    refreshPlaceBtn();
  }
  // Airfield powers use the same bar: the first tap aims, a second tap (or LAUNCH) calls it in.
  function beginTarget(key) {
    G.place = { power: key };
    select([]);
    ui.placeText.textContent = key === 'assault' ? `${isTouch ? 'Tap' : 'Click'} where the troops should land` : `${isTouch ? 'Tap' : 'Click'} the map to target the ${POWERS[key].name}`;
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
      if (p.power === 'assault') {
        if (commandAirAssault(G.teams[G.me], p.x, p.y)) { marker(p.x, p.y, '#5ee060'); Sound.ack('air'); }
        endPlace();
        return;
      }
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
        // Four ways it can lie: west-east, north-south and the two diagonals (straight across the iso view).
        const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
        if (p.ax === cx && p.ay === cy) p.dir = ((p.dir | 0) + 1) % 4;
        else {
          const team = G.teams[G.me], blds = buildingsOf(team.id), W = (x, y) => inMap(x, y) && G.wall[idx(x, y)] > 0, fits = ([dx, dy]) => [-1, 0, 1].every((k) => inMap(cx + k * dx, cy + k * dy) && gateCellOk(team, idx(cx + k * dx, cy + k * dy), blds));
          const own = (x, y) => inMap(x, y) && ownPiece(team, idx(x, y));
          // Your own wall under the tap: the way it runs on from here; else a gap with wall two cells off either side.
          // (Wall on both sides first, so on a bend it lies along the wall, not off it into the open.)
          const first = (f) => { const i = DIRS.findIndex((d) => f(d, true)); return i >= 0 ? i : DIRS.findIndex((d) => f(d, false)); };
          const runs = first(([dx, dy], both) => (both ? own(cx - dx, cy - dy) && own(cx + dx, cy + dy) : own(cx - dx, cy - dy) || own(cx + dx, cy + dy)));
          const gap = first(([dx, dy], both) => (both ? W(cx - 2 * dx, cy - 2 * dy) && W(cx + 2 * dx, cy + 2 * dy) : W(cx - 2 * dx, cy - 2 * dy) || W(cx + 2 * dx, cy + 2 * dy)));
          p.dir = own(cx, cy) && runs >= 0 ? runs : gap >= 0 ? gap : Math.max(0, DIRS.findIndex(fits));
          p.ax = cx; p.ay = cy;
        }
        p.bx = p.ax + DIRS[p.dir][0]; p.by = p.ay + DIRS[p.dir][1];
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
      gesture = { type: 'maybeBox', id: e.pointerId, sx: p.x, sy: p.y, ex: p.x, ey: p.y, moved: false, shift: e.shiftKey, alt: e.altKey };
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
    else if (!g.moved) tap(g.sx, g.sy, g.shift, g.alt);
  }
  canvas.addEventListener('pointerup', (e) => endPointer(e, false));
  canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e), w = { x: cam.x + p.x / cam.z, y: cam.y + p.y / cam.z };   // (on the view plane)
    cam.z = snapZ(cam.z + Math.sign(-e.deltaY) * wheelStep(cam.z));
    cam.x = w.x - p.x / cam.z; cam.y = w.y - p.y / cam.z;
    clampCam();
  }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (!G || (e.target.closest && e.target.closest('input, textarea'))) return;   // typing a name, not commanding
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys.add(k);
    if (k === 'Escape') { if (Chat.armed) Chat.disarm(); else if (G.place) endPlace(); else select([]); }
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
  radar.addEventListener('pointerdown', (e) => {
    if (G && radarOn() && (Chat.armed || (e.altKey && Chat.canPing))) {   // a ping on the radar (chat.js)
      e.preventDefault(); const r = radar.getBoundingClientRect();
      Chat.ping((e.clientX - r.left) / r.width * WORLD, (e.clientY - r.top) / r.height * WORLD); return;
    }
    e.preventDefault(); radarDrag = true; try { radar.setPointerCapture(e.pointerId); } catch (_) {} radarJump(e); });
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
  const UNIT_ORDER = ['infantry', 'vehicle', 'heli', 'jet', 'naval'];
  function stripTypes(team, side) {
    if (side === 'L') {
      const powers = (hasBuilt(team, 'airfield') ? Object.keys(POWERS).filter((k) => hasPower(team, k)).map((k) => 'pw:' + k) : [])   // (Close Air Support once researched)
        .concat(unitsOf(team.id).some((u) => u.def.lift) ? ['as:assault'] : []);   // Air Assault: once the side has a transport helicopter
      // (a queued structure stays on the list after a building it needs is lost, so it can be placed or cancelled)
      const q = team.queues.structure, qd = team.queues.defense;
      return powers.concat(Object.keys(BUILD_DEFS).filter((k) => available(team, k) || (q && q.type === k) || (qd && qd.type === k)), Object.keys(WALLS).filter((k) => wallAvailable(team, k)).map((k) => 'wl:' + k));
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
      const as = type.startsWith('as:'), pw = type.startsWith('pw:') || as, wl = type.startsWith('wl:'), d = as ? ASSAULT : pw ? POWERS[type.slice(3)] : wl ? WALLS[type.slice(3)] : defOf(type);
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
    if (type.startsWith('as:')) {
      if (G.place && G.place.power === 'assault') { endPlace(); return; }
      const plan = assaultPlan(team);
      if (typeof plan === 'string') evaCalm(plan === 'heli' ? 'No transport available' : `Air Assault needs ${ASSAULT_MIN} idle infantry by a Barracks`, 4);
      else beginTarget('assault');
      return;
    }
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
    const cat = catOf(type), wasBusy = isBuildCat(cat) ? !!team.queues[cat] : team.queues[cat].length > 0;
    const res = startProduction(team, type);
    if (res === 'place') beginPlace(type);
    else if (res === 'busy') evaCalm('Unable to comply. Building in progress', 4);
    else if (res === 'busy-same') evaCalm('Building', 6);
    else if (res === 'full') evaCalm('Queue is full', 4);
    else if (res === 'limit') evaCalm(`No more than ${UNIT_DEFS[type].max} ${UNIT_DEFS[type].name}s at a time`, 4);
    else if (res === 'pads-full') evaCalm(UNIT_DEFS[type].producer === 'helipad' ? 'Helicopter Base full. Build another base' : 'Airfield full. Build another Airfield', 4);
    else if (res) eva(res);
    else if (!wasBusy) evaCalm(cat === 'infantry' ? 'Training' : 'Building', 6);
  }
  function cameoCancel(type) {
    if (!G) return;
    const team = G.teams[G.me];
    if (type.startsWith('as:')) { if (G.place && G.place.power === 'assault') endPlace(); return; }
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
    if (aimMove) { setAimMove(false); evaCalm('Attack move cancelled', 3); return; }   // waiting for the spot: a second press calls it off
    // On with one enemy side: a press turns it off. Otherwise a picker: Auto Attack (whom to attack, in a team game
    // with more than one enemy side) or a one-off Attack move.
    if (team.auto && G.teams.filter((t) => hostile(team.id, t.id)).length === 1) {
      setAuto(team, false); ui.autoBtn.setAttribute('aria-pressed', 'false'); eva('Auto attack off. New units guard the base'); return;
    }
    autoPicker(team);
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
        if (v === 'amove') { setAimMove(true); evaCalm('Tap the map: every unit attack-moves there', 5); return; }
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
    const any = enemyBaseKnown(team.id), one = foes.length === 1;
    pickerEl.innerHTML = '<div class="nw-card" role="dialog" aria-label="Auto attack"><p class="nw-title">Attack</p>'
      + `<p class="nw-sub">${one ? 'Auto attack keeps sending units; Attack move sends them all once.' : any ? 'Choose the enemy to attack.' : 'No enemy base located yet: scout first.'}</p><div class="ap-list">`
      + (one ? '' : foes.map(row).join(''))
      + `<button type="button" class="pf-btn ap-row${cur === 'near' ? ' on' : ''}" data-pick="near"${any ? '' : ' disabled'}><i class="ap-any"></i>${one ? 'Auto attack' : 'Nearest enemy'}${any ? '' : '<small>Not scouted</small>'}</button>`
      + '<button type="button" class="pf-btn ap-row" data-pick="amove"><i class="ap-move"></i>Attack move<small>Tap a spot, once</small></button>'
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
      const u = UPGRADES[k], done = hasUpgrade(me, k), busy = r && r.id === k, desc = typeof u.desc === 'string' ? u.desc : u.desc[me.faction];
      // Still locked: the tier before it, or the building it needs (Close Air Support needs an Airfield).
      const lock = !done && !busy && (u.needs && !hasUpgrade(me, u.needs) ? `Needs ${UPGRADES[u.needs].name}` : u.req && !hasBuilt(me, u.req) ? `Needs an ${BUILD_DEFS[u.req].name}` : '');
      const btn = done ? '<span class="up-done">Researched ✓</span>'
        : busy ? `<span class="up-pct">${Math.floor(r.progress * 100)}%${r.stalled ? ' · on hold' : ''}</span><button type="button" class="pf-btn" data-cancel="${k}">Cancel</button>`
        : lock ? `<span class="up-pct">${lock}</span>`
        : `<button type="button" class="pf-btn" data-up="${k}"${r ? ' disabled' : ''}>${u.unlocks ? UNIT_DEFS[u.unlocks].name : u.name} · $${u.cost} · ${u.time} s</button>`;
      return `<div class="up-item"><p class="up-name">${u.name}</p><p class="up-desc">${desc}</p><div class="up-row">${btn}</div></div>`;
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
    for (const [type, el] of cameoEls) {
      let p = 0, st = '', count = 0, dim = false;
      const cat = type.startsWith('as:') ? 'assault' : type.startsWith('pw:') ? 'power' : type.startsWith('wl:') ? 'wall' : catOf(type);
      if (cat === 'assault') {
        const ready = typeof assaultPlan(team) !== 'string';
        st = G.place && G.place.power === 'assault' ? 'READY' : ready ? 'READY' : '';
        dim = !ready;
      } else if (cat === 'power') {
        const key = type.slice(3);
        const pen = (team.powerPen && team.powerPen[key]) || 0;   // (Close Air Support shot down: the bar over the longer charge)
        p = Math.max(0, ((team.powers[key] || 0) + pen) / (POWERS[key].charge + pen));
        st = p >= 1 ? 'READY' : '';
      } else if (cat === 'wall') {
        st = G.place && G.place.wall === type.slice(3) ? 'READY' : '';
      } else if (isBuildCat(cat)) {
        const sq = team.queues[cat];
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
    ui.selName.textContent = one ? (one.def.name + (one.def.carry ? ` · ${(one.cargo || []).length}/${one.def.carry} aboard` : '') + (one.rank ? ' · ' + VET.names[one.rank] : '') + (hostile(one.team, G.me) ? ' · enemy' : one.team !== G.me ? ' · ally' : '')) : `${sel.length} units`;
    const hp = one ? one.hp / one.maxHp : sel.reduce((s, e) => s + e.hp / e.maxHp, 0) / sel.length;
    ui.selHp.style.setProperty('--p', Math.max(0, hp));
    ui.selHp.dataset.state = hp > 0.5 ? 'ok' : hp > 0.25 ? 'warn' : 'low';
    const own = sel.filter((e) => e.team === G.me);
    const fighters = own.filter((e) => e.kind === 'unit' && !e.def.harvester && !e.def.lift && (e.def.weapon || e.cls === 'air'));
    const bld = one && one.kind === 'bld' && one.team === G.me ? one : null;
    const btns = [];
    if (own.some((e) => e.kind === 'unit' && e.def.deploys)) btns.push(['deploy', 'DEPLOY']);
    if (fighters.length) btns.push(['hunt', 'ATTACK'], ['guard', 'GUARD']);
    if (fighters.length) btns.push(['span', 'ATTACK GROUND']);
    if (own.some((e) => e.kind === 'unit')) btns.push(['stop', 'STOP']);
    if (own.some((e) => e.inHouse)) btns.push(['exit', 'EXIT']);
    if (own.some((e) => e.kind === 'unit' && e.def.carry && (e.cargo || []).length)) btns.push(['unload', 'UNLOAD HERE']);
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
    else if (act === 'unload') {
      const full = own.filter((x) => x.kind === 'unit' && x.def.carry && (x.cargo || []).length);
      for (const u of full.filter((x) => x.def.lift)) commandMove([u], u.x, u.y);
      const apcs = full.filter((x) => x.def.apc || x.def.ferry);
      if (apcs.length) commandUnload(apcs);
      Sound.ack(apcs.length ? 'veh' : 'air');
    }
    else if (act === 'span') { aimSpan = own.filter((u) => u.kind === 'unit' && !u.def.harvester && !u.def.lift && (u.def.weapon || u.cls === 'air')); evaCalm('Tap the ground to attack', 5); }
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
  // The menu's pages: main (the command buttons), options (sound, graphics), info (credits, briefing).
  // The side and difficulty pickers live on the skirmish screen (MapSelect puts them in its setup slot).
  const setupEl = $('skirmishSetup');
  function menuView(v) { ui.menu.dataset.view = v; ui.menu.scrollTop = 0; }
  for (const b of ui.menu.querySelectorAll('button[data-view]')) b.addEventListener('click', () => menuView(b.dataset.view));
  function showMenu(mode) {
    ui.menu.hidden = false;
    ui.menu.dataset.mode = mode;
    menuView('main');
    ui.resumeBtn.hidden = mode !== 'pause';
    ui.quitBtn.hidden = mode !== 'pause';
    $('editorBtn').hidden = mode === 'pause';   // (testing a map from the editor would end the battle)
    $('saveQuitBtn').hidden = mode !== 'pause' || !Net.canSave;
    syncMapView(mode);
    disarmQuit();
    if (G && !Net.role) G.paused = true;   // (an online battle runs on: the other player is still in it)
    ui.menu.dataset.mode = mode;
    if (mode === 'pause') autosave();
    showContinue();
    if (mode === 'start') { ui.menuTitle.textContent = 'Red Horizon'; ui.menuSub.textContent = 'Welcome back, Commander.'; ui.startBtn.textContent = 'Skirmish'; }
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
  $('fpsBtn').addEventListener('click', () => { full60 = !full60; try { localStorage.setItem('rh-full60', full60 ? '1' : ''); } catch (_) {} syncMenuChoices(); });
  // HD graphics (art.js HD): kept in rh-hd, used from the next launch (the sheets and the frame's size are chosen at load).
  // From the start menu, with no battle running, the game reloads at once.
  $('hdBtn').addEventListener('click', () => {
    HD.pref = !HD.pref;
    try { localStorage.setItem('rh-hd', HD.pref ? '1' : ''); } catch (_) {}
    if (!G || G.over) { location.reload(); return; }
    syncMenuChoices();
  });
  // HD ground (art.js HD.ground, GK): the ground painted at twice the detail with HD on; on by default on a computer, off on a
  // phone (rh-hd-ground '1' / '0'). Chosen at launch, as HD graphics.
  $('hdGroundBtn').addEventListener('click', () => {
    HD.groundPref = !HD.groundPref;
    try { localStorage.setItem('rh-hd-ground', HD.groundPref ? '1' : '0'); } catch (_) {}
    if (HD.pref && (!G || G.over)) { location.reload(); return; }
    syncMenuChoices();
  });
  function syncHd() {
    const g = $('hdGroundBtn');
    g.hidden = $('hdGroundStatus').hidden = !HD.pref;
    g.setAttribute('aria-pressed', String(HD.groundPref));
    g.textContent = 'HD ground: ' + (HD.groundPref ? 'on' : 'off');
    $('hdGroundStatus').textContent = HD.groundPref !== HD.ground && HD.on ? 'Takes effect the next time the game opens.'
      : HD.groundPref ? (HD.phone ? 'Sharper ground. Test: uses four times the memory for the ground; if the game reloads in a battle, turn it off.' : 'The ground at twice the detail.')
      : 'The ground at the classic detail (less memory).';
    const b = $('hdBtn'), gl2 = typeof WebGL2RenderingContext !== 'undefined';
    b.setAttribute('aria-pressed', String(HD.pref));
    b.textContent = 'HD graphics: ' + (HD.pref ? 'on' : 'off');
    $('hdStatus').textContent = !gl2 ? 'Needs WebGL 2, which this device does not have.'
      : HD.pref !== HD.on ? 'Takes effect the next time the game opens.'
      : HD.on ? 'Sharp, smooth units and buildings. Uses more graphics power and memory.' : 'Classic pixel look.';
  }
  // Full screen (the PC and Mac app only: preload.js rhDesktop.fullScreen; an older app without it shows no button). The app
  // remembers it and opens that way; F11 switches it too, and the button follows.
  if (window.rhDesktop && rhDesktop.fullScreen) {
    const fb = $('fullBtn');
    const show = (on) => { fb.setAttribute('aria-pressed', String(on)); fb.textContent = 'Full screen: ' + (on ? 'on' : 'off'); };
    fb.hidden = $('fullStatus').hidden = false;
    fb.addEventListener('click', () => rhDesktop.fullScreen(fb.getAttribute('aria-pressed') !== 'true').then(show, () => {}));
    if (rhDesktop.onFullScreen) rhDesktop.onFullScreen(show);
    rhDesktop.fullScreen().then(show, () => {});
  }
  function syncFps() {
    const b = $('fpsBtn');
    b.setAttribute('aria-pressed', String(full60));
    b.textContent = 'Always 60 fps: ' + (full60 ? 'on' : 'off');
    $('fpsStatus').textContent = full60 ? 'Smoothest, but the phone runs warmer and uses more battery.'
      : 'Cooler: 60 fps while you touch the screen, 30 while you watch.';
  }
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
    syncFps(); syncHd();
    for (const b of setupEl.querySelectorAll('[data-faction]')) b.setAttribute('aria-pressed', String(b.dataset.faction === faction));
    for (const b of setupEl.querySelectorAll('[data-diff]')) b.setAttribute('aria-pressed', String(b.dataset.diff === diffKey));
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
  // (the map editor, editor.js: Play opens this screen on its map, Explore goes straight in)
  const openSkirmish = (sel) => {
    if (sel) mapId = sel;
    MapSelect.open(mapId, battleMode, setupEl, (id, mode, watch) => {
      mapId = id; battleMode = mode || '1v1';
      ui.startBtn.textContent = 'Loading…';
      ui.startBtn.disabled = true;
      setTimeout(() => {
        endPlace();
        if (watch === 'explore') startExplore(); else if (watch && Account.owner) startWatch(); else startMission();
        ui.startBtn.disabled = false;
        hideMenu();
        if (!G.spectate) eva('Select a structure to build');
      }, 30);
    });
  };
  ui.startBtn.addEventListener('click', () => openSkirmish());
  window.EditorHooks = {
    play: (id) => openSkirmish(id),   // (opened from the menu, which stays up under it)
    explore: (id) => { mapId = id; endPlace(); startExplore(); hideMenu(); },
    // The editor's real view: the map built as in a battle (empty, no fog, seed 1 so a plot's houses stay put while
    // editing), rebuilt after each change with the camera kept. G.editing: no Loading card (the ground streams in).
    live(id) {
      const keep = G && G.editing ? { x: cam.x, y: cam.y, z: cam.z } : null, was = G && G.editing ? G : null;
      Net.leave();
      if (mission) Report.quit();
      endPlace();
      newWorld(faction, diffKey, 1, 0, false, id, null, true);
      online = null; mission = false;
      G.spectate = true; G.mapViewUsed = true; G.speed = 1; G.weather = null; G.editing = true;
      G.editMap = [mapTheme(id), MAPS[id].bridge || '', MAPS[id].bridgeW || 0, MAPS[id].mesas || []];   // (editorCarry)
      G.seen = new Uint8Array(NCELLS).fill(1); for (const f of G.fog) f.fill(1);
      afterNewWorld(faction);
      if (was) try { this.carried = editorCarry(was, G); } catch (err) { this.carried = null; }   // (art.js: the unchanged ground and crags kept)
      if (keep) Object.assign(cam, keep); else { cam.z = 1; centerOn(WORLD / 2, WORLD / 2); }
      clampCam();
      hideMenu();
    },
    leave() { endPlace(); startGame(); showMenu('start'); },
    rect: () => canvas.getBoundingClientRect(),
    s2w: (sx, sy) => s2w(sx, sy),   // canvas px -> world px on the ground
    w2s(x, y) { const [vx, vy] = toView(...hillPt(x, y)); return [(vx - cam.x) * cam.z, (vy - cam.y) * cam.z]; },
    panBy(dx, dy) { cam.x -= dx / cam.z; cam.y -= dy / cam.z; clampCam(); },
    zoom: () => cam.z,
    zoomTo(sx, sy, z) { const wx = cam.x + sx / cam.z, wy = cam.y + sy / cam.z; cam.z = snapZ(z); cam.x = wx - sx / cam.z; cam.y = wy - sy / cam.z; clampCam(); },   // (z wanted: the editor keeps it, as snapZ steps it)
  };
  ui.resumeBtn.addEventListener('click', hideMenu);
  // Map view (the owner's tool for tuning maps, 2026-11-21): the whole map shown, starting places and
  // every unit, in a skirmish only. The button shows only to the owner's account; a match where it was
  // used says so in its report (stats.mapView). Off again after a saved game is continued (save.js).
  const mapViewOn = () => !!(G && G.seen !== G.fog[G.me]);
  function syncMapView(mode) {
    const b = $('mapViewBtn'), on = mapViewOn();
    b.hidden = mode !== 'pause' || !!Net.role || !Account.owner || G.watching || !!G.spectate;
    const s = $('speedBtn'); s.hidden = mode !== 'pause' || !G || !G.spectate; s.textContent = 'Speed: ' + ((G && G.speed) || 1) + 'x';
    b.setAttribute('aria-pressed', String(on)); b.textContent = 'Map view (owner): ' + (on ? 'whole map' : 'off');
  }
  $('mapViewBtn').addEventListener('click', () => {
    if (!G || Net.role || !Account.owner) return;
    if (mapViewOn()) G.seen = G.fog[G.me];
    else { G.seen = new Uint8Array(NCELLS).fill(1); G.mapViewUsed = true; }
    G.shroudDirty = true; radarWas = null;
    syncMapView('pause');
  });
  $('speedBtn').addEventListener('click', () => { if (G && G.spectate) { G.speed = G.speed >= 4 ? 1 : G.speed * 2; syncMapView('pause'); } });
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
  // Online co-op on the game server: save the battle and end it for everyone, to continue later (tap twice).
  let saveArmed = null;
  const saveQuit = $('saveQuitBtn');
  saveQuit.addEventListener('click', () => {
    if (!Net.canSave) return;
    if (!saveArmed) { saveQuit.textContent = 'Tap again: save and end it for everyone'; saveArmed = setTimeout(() => { saveArmed = null; saveQuit.textContent = 'Save and leave'; }, 3000); return; }
    clearTimeout(saveArmed); saveArmed = null;
    saveQuit.textContent = 'Saving…';
    Net.saveAndLeave();
    setTimeout(() => { saveQuit.textContent = 'Save and leave'; }, 8000);
  });
  setInterval(() => { if (!ui.menu.hidden) $('audioStatus').textContent = 'Sound: ' + Sound.status(); }, 500);
  document.addEventListener('visibilitychange', () => { if (document.hidden && G && !G.paused && !G.over) showMenu('pause'); });

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  let last = performance.now(), updMs = 0;
  const camWas = { x: 0, y: 0 };
  // The battle is simulated in fixed steps of 1/30 s, as on the game server and in the tests, whatever the screen's
  // rate. Before, every frame ran a step: a 120 Hz screen ran four times the work for the same battle (a 3 v 3 with
  // 700 units: 577 ms of CPU per game second instead of 184), and big fights stuttered. Between steps, what moves is
  // drawn part of the way from where it was at the last step to where it is now (Smooth), so it still glides at
  // the screen's rate; the drawing is at most one step (33 ms) behind the battle.
  const STEP = 1 / 30;
  let stepAcc = 0;
  const Smooth = (() => {
    // What is blended, per list: positions, headings (turned the short way round), heights, progress.
    const ENT = ['x', 'y', 'face', 'tface', 'alt', 'roll', 'anim'], SHOT = ['x', 'y', 'gx', 'gy', 't', 'a'], FX = ['x', 'y', 'lift', 't'];
    const ANG = new Set(['face', 'tface', 'a']), FAR = CELL * 4;   // (moved further in one step: a jump, not blended)
    // Each thing's record: [step number, its values before the step..., its values now (filled in by apply)].
    let was = new WeakMap(), n = 0, t0 = 0, g0 = null, held = null;
    const back = [];
    const keepList = (list, F) => {
      for (const o of list) {
        let r = was.get(o);
        if (!r || r.length !== 2 * F.length + 1) was.set(o, r = new Array(2 * F.length + 1));
        r[0] = n; for (let i = 0; i < F.length; i++) r[i + 1] = o[F[i]];
      }
    };
    // Just before a step: where everything is now.
    function keep() {
      n++; t0 = G.t; g0 = G;
      keepList(G.entities, ENT); keepList(G.projectiles, SHOT); keepList(G.effects, FX);
    }
    // For drawing: everything that was there before the last step is put part of the way (k, 0 to 1) back from now
    // to then; restore() puts it all back, before anything else reads it.
    function blend(list, F, j) {
      const L = F.length;
      for (const o of list) {
        const r = was.get(o);
        if (!r || r[0] !== n) continue;
        const jump = Math.abs(o.x - r[1]) > FAR || Math.abs(o.y - r[2]) > FAR;
        back.push(o, r, F, 0);   // (and which values were changed, a bit each: only those are put back)
        const at = back.length - 1;
        for (let i = 0; i < L; i++) {
          const f = F[i], a = r[i + 1], b = o[f];
          r[L + i + 1] = b;
          if (typeof a !== 'number' || typeof b !== 'number' || a === b || !isFinite(a) || !isFinite(b)) continue;
          if (jump && i < 2) continue;
          if (!ANG.has(f) && Math.abs(b - a) > FAR && f !== 't' && f !== 'anim') continue;
          back[at] |= 1 << i;
          o[f] = ANG.has(f) ? b - angDiff(b, a) * j : b - (b - a) * j;
        }
      }
    }
    function apply(k) {
      back.length = 0; held = null;
      if (!G || G !== g0 || k >= 1) return;
      const j = 1 - k;
      blend(G.entities, ENT, j); blend(G.projectiles, SHOT, j); blend(G.effects, FX, j);
      held = { t: G.t, g: G };
      if (G.t - t0 < STEP * 1.5) G.t = t0 + (G.t - t0) * k;
    }
    function restore() {
      const h = held; held = null;
      for (let i = 0; i < back.length; i += 4) { const o = back[i], r = back[i + 1], F = back[i + 2], set = back[i + 3], L = F.length; for (let q = 0; q < L; q++) if (set & (1 << q)) o[F[q]] = r[L + q + 1]; }
      back.length = 0;
      if (h) h.g.t = h.t;
    }
    return { keep, apply, restore };
  })();
  // Loading: a battle (new, continued or online) starts behind a short card ("Loading", with a bar; was "Deploying forces") while this battle's sprite sheets load
  // (art.js SpriteSheets) and the ground on screen is painted (art.js makeGround), so its first seconds do not
  // stutter. A skirmish is held meanwhile; an online battle runs on (others are in it). Never longer than LOAD_MAX ms.
  // It also stays up until the frames come smoothly (SETTLE_MS without a frame 250 ms late, at most SETTLE_MAX): the
  // owner's iPhone with WebGL froze 3-4 s four times in a battle's first seconds (the graphics process, not the game's
  // code), and the battle ran on and jumped between them, with the camera catching up on a finger's moves at once.
  const RES_LOAD_MAX = 25000, LOAD_MAX = 3000, LOAD_MIN = 250, SETTLE_MS = 600, SETTLE_MAX = 20000;
  let loadFor = null, loadEl = null, stillKey = null;
  let splashEl = document.getElementById('splash'), splashOk = 0, splashLast = 0;
  function loading(now) {
    if (!G || G.paused || G.over || G.editing) return false;
    if (!loadFor || loadFor.g !== G) loadFor = { g: G, since: now, done: false, at: now, slow: -1e9, nSlow: 0 };
    if (typeof GLR === 'object' && GLR) GLR.probe = !loadFor.done || now - loadFor.doneAt < 5000;   // (gl.js sync: where a freeze is)
    if (loadFor.done) return false;
    if (now - loadFor.at > 250 && !document.hidden) { loadFor.slow = now; loadFor.nSlow++; }
    loadFor.at = now;
    const rs = typeof GLR === 'object' && GLR && GLR.resident ? GLR.resident() : null;   // (gl.js stage 6: the whole ground, compressed)
    const t = now - loadFor.since, ready = SpriteSheets.ready() && G.ground && (rs === 'ready' || (rs !== 'building' && G.ground.missing === 0)) && (typeof cliffsReady !== 'function' || cliffsReady()) && t > LOAD_MIN;
    const most = rs === 'building' ? RES_LOAD_MAX : LOAD_MAX;
    if (((ready || t > most) && now - loadFor.slow > SETTLE_MS) || t > SETTLE_MAX) { loadFor.done = true; loadFor.doneAt = now; loadFor.t = { ms: Math.round(t), full: !ready, slow: loadFor.nSlow }; showLoading(false, 1); return false; }
    // The bar: 90% for what loads (sprite sheets, the ground on screen, the crags: each the share of the most it waited
    // for), the rest while the frames settle (SETTLE_MS without a late one). It never goes back.
    const F = loadFor, part = (k, left) => { F[k] = Math.max(F[k] || 0, left); return F[k] ? 1 - left / F[k] : 1; };
    const got = (part('sp', SpriteSheets.pending || 0) + (rs ? GLR.resProgress() : part('gn', G.ground ? G.ground.missing : 1)) + (typeof cliffsProgress === 'function' ? cliffsProgress() : 1)) / 3;
    if ((ready || t > most) && !F.readyAt) F.readyAt = now;
    const bar = F.readyAt ? 0.9 + 0.1 * Math.min(1, (now - Math.max(F.readyAt, F.slow)) / SETTLE_MS) : 0.9 * got;
    F.bar = Math.max(F.bar || 0, bar);
    if (t > 120) showLoading(true, F.bar);   // (a fast device is ready before the card would even show)
    return true;
  }
  function showLoading(on, frac) {
    if (!loadEl) {
      if (!on) return;
      loadEl = document.createElement('div'); loadEl.id = 'deploying'; loadEl.className = 'nw-wrap';
      loadEl.innerHTML = '<div class="nw-card" role="status"><p class="nw-title">Loading</p><div class="load-bar" role="progressbar" aria-label="Loading" aria-valuemin="0" aria-valuemax="100"><i></i></div></div>';
      document.body.append(loadEl);
    }
    clearTimeout(loadEl.hideT);
    if (!on && frac === 1 && !loadEl.hidden) {   // done: the bar full for a moment before the card goes (the battle runs on)
      const b = loadEl.querySelector('.load-bar'); b.firstChild.style.width = '100%'; b.setAttribute('aria-valuenow', 100);
      loadEl.hideT = setTimeout(() => { loadEl.hidden = true; }, 250);
      return;
    }
    if (on && loadEl.hidden) loadEl.querySelector('.load-bar i').style.width = '0%';
    loadEl.hidden = !on;
    if (on && frac !== undefined) { const pc = Math.round(frac * 100), b = loadEl.querySelector('.load-bar'); b.firstChild.style.width = pc + '%'; b.setAttribute('aria-valuenow', pc); }
  }
  function frame(now) {
    spriteMs = 0; spriteN = 0;   // (models.js: sprites made in this frame, for the match report)
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    shakeAmp *= Math.exp(-dt * 6);
    const held = guard('loading', () => loading(now)) === true && !Net.role;
    guard('autoRes', () => autoRes(now, !!(G && !G.paused && !held && !G.over)));
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
      else guard('update', () => { if (G.spectate) { stepAcc += dt * ((G.speed || 1) - 1); G.selection.length = 0; } stepAcc += dt; while (stepAcc >= STEP) { stepAcc -= STEP; Smooth.keep(); update(STEP); } });
      guard('net', () => Net.hostTick(total));
      updMs = performance.now() - u0;
    }
    guard('beaten', beaten);
    const d0 = performance.now();
    // (A guest's copy glides on its own, net.js guestStep.)
    // A battle paused under the menu (and the one behind the start menu) does not change: it is drawn once and kept on the
    // screen until the menu closes, the screen changes size or the camera moves. Redrawn every frame with WebGL, it kept
    // the owner's iPhone's graphics busy and the menus slow to answer.
    // The start menu is a screen of its own (owner, 2026-11-24: "dont have the battle drawn in the background"): the
    // battle made behind it is not drawn at all until a game starts.
    const offstage = !!(G && !ui.menu.hidden && ui.menu.dataset.mode === 'start');
    const still = offstage || !!(G && G.paused && !Net.role && !ui.menu.hidden), key = still && !offstage ? `${W}x${H}x${DPR}:${cam.x},${cam.y},${cam.z}` : null;
    if (offstage || (still && stillKey === key)) { /* (the last frame stays on the screen, or none under the start menu) */ }
    else try { if (G && Net.role !== 'guest' && !G.paused) guard('smooth', () => Smooth.apply(stepAcc / STEP)); guard('draw', draw); } finally { Smooth.restore(); }
    stillKey = key;
    // The loading screen (index.html) goes once the start menu answers: the battle behind it drawn, then 20 frames in a
    // row that came on time, so the first taps are not lost to the startup work.
    if (splashEl) {
      splashOk = (G || now > 4000) && now - splashLast < 120 ? splashOk + 1 : 0;   // (no battle behind the menu: no wait for one)
      splashLast = now;
      if (splashOk >= 20) { const s = splashEl; splashEl = null; s.classList.add('gone'); setTimeout(() => s.remove(), 400); }
    }
    const d1 = performance.now();
    if (!still) {   // (hidden under the menu: the sidebar and radar wait until it closes)
      guard('sidebar', () => updateSidebar(1 / 60));
      guard('radar', () => drawRadar(1 / 60));
    }
    guard('chat', Chat.tick);
    guard('cameos', warmCameos);
    if (G && !G.paused) guard('sprites', () => warmSprites(2, ...Object.values(s2w(W / 2, H / 2))));
    if (G) {   // how smoothly this device runs the battle (Report: stats.frames); paused and loading frames too (freezes)
      const jump = Math.abs(cam.x - camWas.x) > W / cam.z / 2 || Math.abs(cam.y - camWas.y) > H / cam.z / 2;
      Report.noteFrame(now, updMs, d1 - d0, jump, performance.now() - d1, G.paused ? 'pause' : held || (loadFor && loadFor.g === G && !loadFor.done) ? 'load' : null, loadFor && loadFor.g === G && loadFor.done && loadFor.t);
    }
    camWas.x = cam.x; camWas.y = cam.y; updMs = 0;
  }
  // A team game where this side is beaten (no production left) but an ally fights on: a card offers
  // the debrief now (a loss) or staying to watch with the whole map shown (then the alliance's result).
  let beatenEl = null;
  function beaten() {
    const on = !!(G && !G.over && !G.spectate && G.teams.length > 2 && G.teams[G.me] && G.teams[G.me].out);
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
  // Smart 30/60 on phones (owner, 2026-11-22: "still getting a little hot"; picked over a fixed 30, 40 or 45, which a
  // 60 Hz screen shows unevenly): while a battle runs and nobody has touched the screen or moved the camera for IDLE_MS,
  // every other frame is skipped whole (30 fps). The battle steps 30 times a second anyway (STEP), so nothing is lost
  // but the in-between frames. A touch, a drag or a camera that is still moving brings 60 back at once. Computers
  // always draw every frame. The menu's "Always 60 fps" (localStorage rh-full60) turns it off.
  const IDLE_MS = 1200;
  let full60 = false, lastInput = -1e9, lastFrame = 0, camIdle = '';
  try { full60 = localStorage.getItem('rh-full60') === '1'; } catch (_) {}
  for (const ev of ['pointerdown', 'pointermove', 'touchstart', 'touchmove', 'wheel', 'keydown'])
    window.addEventListener(ev, () => { lastInput = performance.now(); }, { capture: true, passive: true });
  function skipFrame(now) {
    if (!touchScr || full60 || !G || G.paused || G.over || document.hidden || Chat.busy) return false;
    const c = cam.x + ',' + cam.y + ',' + cam.z;
    if (c !== camIdle) { camIdle = c; lastInput = Math.max(lastInput, now); }
    if (now - lastInput < IDLE_MS) return false;
    return now - lastFrame < 25;
  }
  function loop(now) { requestAnimationFrame(loop); if (skipFrame(now)) return; lastFrame = now; frame(now); }

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
