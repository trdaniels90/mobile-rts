'use strict';
// Rendering, input, sidebar and menus.
(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const radar = $('radar'), rctx = radar.getContext('2d');
  const view = mkCanvas(64, 64), vctx = view.getContext('2d');
  const shroudCanvas = mkCanvas(MAP, MAP), sctx = shroudCanvas.getContext('2d');
  const shroudImg = sctx.createImageData(MAP, MAP);
  const miniTerrain = mkCanvas(MAP, MAP), mtctx = miniTerrain.getContext('2d');
  const ui = {
    sidebar: $('sidebar'), credits: $('credits'), powerBar: $('powerBar'), topstrip: $('topstrip'), homeBtn: $('homeBtn'),
    stripL: $('stripL'), stripR: $('stripR'), strips: document.querySelector('.sb-strips'),
    autoBtn: $('autoBtn'), autoLabel: document.querySelector('#autoBtn small'), menuBtn: $('menuBtn'),
    eva: $('eva'), selbar: $('selbar'), selName: $('selName'), selHp: $('selHp'), selBtns: $('selBtns'),
    placebar: $('placebar'), placeText: $('placeText'), placeOk: $('placeOk'), placeCancel: $('placeCancel'),
    menu: $('menu'), menuTitle: $('menuTitle'), menuSub: $('menuSub'), stats: $('stats'),
    startBtn: $('startBtn'), resumeBtn: $('resumeBtn'), boxBtn: $('boxBtn'),
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
  hooks.eva = eva;
  hooks.gameOver = (won) => setTimeout(() => { showMenu('end', won); Sound.say(won ? 'Mission accomplished' : 'Mission failed'); }, 2200);
  // Battle sounds are louder on screen, fade with distance and pan left or right.
  hooks.sfx = (name, x, y) => {
    if (!G) return;
    const hw = W / cam.z / 2, hh = H / cam.z / 2;
    const dx = (x - (cam.x + hw)) / hw, dy = (y - (cam.y + hh)) / hh;
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    const vol = d <= 1 ? 1 : Math.max(0, 1 - (d - 1) * 0.7);
    Sound.play(name, vol, Math.max(-1, Math.min(1, dx)) * 0.6);
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
  function clampCam() {
    cam.z = snapZ(cam.z);
    const vw = W / cam.z, vh = H / cam.z;
    cam.x = vw >= WORLD ? (WORLD - vw) / 2 : Math.max(0, Math.min(WORLD - vw, cam.x));
    cam.y = vh >= WORLD ? (WORLD - vh) / 2 : Math.max(0, Math.min(WORLD - vh, cam.y));
  }
  function centerOn(x, y) { cam.x = x - W / cam.z / 2; cam.y = y - H / cam.z / 2; clampCam(); }
  const s2w = (sx, sy) => ({ x: cam.x + sx / cam.z, y: cam.y + sy / cam.z });

  // ---------------------------------------------------------------------------
  // Game start
  // ---------------------------------------------------------------------------
  function startGame(seed) {
    newWorld(faction, diffKey, seed);
    for (let i = 0; i < NCELLS; i++) {
      mtctx.fillStyle = TERRAIN_MINI[G.terr[i]];
      mtctx.fillRect(cellX(i), cellY(i), 1, 1);
    }
    ui.sidebar.dataset.faction = faction;
    cameoSig = { L: '', R: '' }; selSig = '';
    ui.autoBtn.setAttribute('aria-pressed', 'true');
    layout();
    const cy = G.entities.find((e) => e.team === PLAYER && e.type === 'cy');
    cam.z = Math.max(1, Math.min(2.5, Math.round((W / (CELL * 18)) * 4) / 4));
    centerOn(cy.x + 40, cy.y - 30);
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
  const visibleToPlayer = (e) => e.team === PLAYER || (e.kind === 'bld' ? G.seen[idx(e.cx, e.cy)] || G.seen[idx(e.cx + e.w - 1, e.cy + e.h - 1)] : seenAt(e.x, e.y));

  function draw() {
    const z = cam.z;
    const ox = Math.floor(cam.x), oy = Math.floor(cam.y);
    const bw = Math.ceil(W / z) + 2, bh = Math.ceil(H / z) + 2;
    if (view.width < bw || view.height < bh) { view.width = bw + 64; view.height = bh + 64; }
    const v = vctx;
    v.setTransform(1, 0, 0, 1, 0, 0);
    v.imageSmoothingEnabled = false;
    v.fillStyle = '#000'; v.fillRect(0, 0, bw, bh);
    if (!G) return;
    const sx = Math.max(0, ox), sy = Math.max(0, oy);
    const sw = Math.min(WORLD, ox + bw) - sx, sh = Math.min(WORLD, oy + bh) - sy;
    if (sw > 0 && sh > 0) v.drawImage(G.terrainCanvas, sx, sy, sw, sh, sx - ox, sy - oy, sw, sh);
    v.translate(-ox, -oy);

    // Ore
    const c0 = Math.max(0, Math.floor(ox / CELL)), c1 = Math.min(MAP - 1, Math.floor((ox + bw) / CELL));
    const r0 = Math.max(0, Math.floor(oy / CELL)), r1 = Math.min(MAP - 1, Math.floor((oy + bh) / CELL));
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const o = G.ore[idx(cx, cy)];
      if (o) drawOre(v, cx, cy, o);
    }

    const x0 = ox - 80, y0 = oy - 80, x1 = ox + bw + 80, y1 = oy + bh + 80;
    const inView = (e) => e.x > x0 && e.x < x1 && e.y > y0 && e.y < y1;
    for (const fx of G.effects) if ((fx.type === 'husk' || fx.type === 'corpse') && fx.t >= 0) drawEffect(v, fx);

    const ground = [], air = [];
    for (const e of G.entities) {
      if (!inView(e) || !visibleToPlayer(e)) continue;
      if (e.kind === 'unit' && isAirborne(e)) air.push(e); else ground.push(e);
    }
    const baseY = (e) => e.kind === 'bld' ? (e.cy + e.h) * CELL : e.y;
    ground.sort((a, b) => baseY(a) - baseY(b));
    for (const e of ground) {
      if (e.kind === 'bld') drawStructure(v, e, G.t);
      else drawUnit(v, e, G.t);
    }
    for (const p of G.projectiles) {
      if (p.delay > 0) continue;
      const a = p.a || 0, ca = Math.cos(a), sa = Math.sin(a);
      if (p.kind === 'grenade') {
        v.fillStyle = 'rgba(0,0,0,0.35)'; v.fillRect(Math.round(p.gx - 1), Math.round(p.gy), 3, 2);
        v.fillStyle = '#2d351c'; v.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 3, 3);
        v.fillStyle = '#6f7d48'; v.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 1, 1);
        continue;
      }
      if (p.kind === 'shell') { v.fillStyle = '#ffe9a0'; v.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 2, 2); v.fillStyle = 'rgba(255,200,90,0.5)'; v.fillRect(Math.round(p.x - ca * 3), Math.round(p.y - sa * 3), 1, 1); }
      else if (p.kind === 'flak') { v.fillStyle = '#ffd36a'; v.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
      else {
        v.fillStyle = '#d8d6cc'; v.fillRect(Math.round(p.x - ca * 2), Math.round(p.y - sa * 2), 2, 2);
        v.fillStyle = '#ff9a2a'; v.fillRect(Math.round(p.x - ca * 4), Math.round(p.y - sa * 4), 1, 1);
      }
    }
    for (const fx of G.effects) if (fx.t >= 0 && fx.type !== 'husk' && fx.type !== 'corpse' && fx.x > x0 && fx.x < x1 && fx.y > y0 && fx.y < y1) drawEffect(v, fx);
    air.sort((a, b) => a.y - b.y);
    for (const e of air) drawUnit(v, e, G.t);

    // Selection brackets and health bars.
    for (const e of G.entities) {
      if (!inView(e) || !visibleToPlayer(e)) continue;
      const sel = G.selection.includes(e);
      const recent = G.t - e.hitT < 3;
      if (!sel && !recent) continue;
      if (e.kind === 'bld') {
        const bx = e.cx * CELL, by = e.cy * CELL;
        if (sel) brackets(v, bx - 1, by - 1, bx + e.w * CELL, by + e.h * CELL);
        drawHealth(v, e, bx + e.w * CELL / 2, by - 6, Math.min(48, e.w * CELL - 8));
      } else {
        const r = e.def.r + 2, yy = e.y - (e.alt || 0) - (e.cls === 'inf' ? 8 : 3);
        if (sel) brackets(v, e.x - r, yy - r - (e.cls === 'inf' ? 5 : 0), e.x + r, yy + r + (e.cls === 'inf' ? 3 : 0));
        drawHealth(v, e, e.x, yy - r - (e.cls === 'inf' ? 10 : 5), Math.max(10, r * 2));
      }
    }

    // Shroud: black where the player has never looked, softened at the edges.
    if (G.shroudDirty) {
      G.shroudDirty = false;
      const d = shroudImg.data;
      for (let i = 0; i < NCELLS; i++) { d[i * 4 + 3] = G.seen[i] ? 0 : 255; }
      sctx.putImageData(shroudImg, 0, 0);
    }
    v.imageSmoothingEnabled = true;
    v.drawImage(shroudCanvas, ox / CELL, oy / CELL, bw / CELL, bh / CELL, ox, oy, bw, bh);
    v.imageSmoothingEnabled = false;

    drawPlacement(v);
    v.setTransform(1, 0, 0, 1, 0, 0);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = z < 1;
    const k = z * DPR;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(view, 0, 0, bw, bh, Math.round(-(cam.x - ox) * k), Math.round(-(cam.y - oy) * k), Math.round(bw * k), Math.round(bh * k));
    if (gesture && gesture.type === 'box' && gesture.moved) {
      const bx = Math.min(gesture.sx, gesture.ex) * DPR, by = Math.min(gesture.sy, gesture.ey) * DPR;
      ctx.strokeStyle = '#f2f2ea'; ctx.lineWidth = DPR;
      ctx.strokeRect(bx + 0.5, by + 0.5, Math.abs(gesture.ex - gesture.sx) * DPR, Math.abs(gesture.ey - gesture.sy) * DPR);
    } else if (gesture && gesture.type === 'box' && gesture.held) {
      ctx.strokeStyle = '#f2f2ea'; ctx.lineWidth = 2 * DPR;
      ctx.beginPath(); ctx.arc(gesture.sx * DPR, gesture.sy * DPR, 24 * DPR, 0, 7); ctx.stroke();
    }
  }

  function drawPlacement(v) {
    const p = G.place;
    if (!p || p.cx === undefined) return;
    const d = BUILD_DEFS[p.type];
    const team = G.teams[PLAYER];
    p.ok = canPlace(team, p.type, p.cx, p.cy, 0);
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
  function drawRadar(dt) {
    radarT -= dt;
    if (radarT > 0 || !G) return;
    radarT = 0.2;
    const Wr = radar.width, Hr = radar.height, k = Wr / MAP;
    rctx.imageSmoothingEnabled = false;
    rctx.drawImage(miniTerrain, 0, 0, Wr, Hr);
    rctx.fillStyle = '#c9a227';
    for (let i = 0; i < NCELLS; i++) if (G.ore[i] && G.seen[i]) rctx.fillRect(cellX(i) * k, cellY(i) * k, Math.ceil(k), Math.ceil(k));
    for (const e of G.entities) {
      if (!visibleToPlayer(e)) continue;
      rctx.fillStyle = G.teams[e.team].pal[e.kind === 'bld' ? 'main' : 'light'];
      if (e.kind === 'bld') rctx.fillRect(e.cx * k, e.cy * k, e.w * k, e.h * k);
      else rctx.fillRect(e.x / CELL * k - k * 0.6, e.y / CELL * k - k * 0.6, Math.max(2, k * 1.2), Math.max(2, k * 1.2));
    }
    rctx.drawImage(shroudCanvas, 0, 0, Wr, Hr);
    rctx.strokeStyle = '#f2f2ea'; rctx.lineWidth = Math.max(1, DPR);
    rctx.strokeRect(cam.x / CELL * k, cam.y / CELL * k, W / cam.z / CELL * k, H / cam.z / CELL * k);
  }

  // ---------------------------------------------------------------------------
  // Selection & commands
  // ---------------------------------------------------------------------------
  function pick(wx, wy, slop) {
    let best = null, bd = Infinity;
    for (const e of G.entities) {
      if (!e.alive || !visibleToPlayer(e)) continue;
      let d;
      if (e.kind === 'bld') {
        const bx = e.cx * CELL, by = e.cy * CELL;
        const dx = Math.max(bx - wx, 0, wx - (bx + e.w * CELL)), dy = Math.max(by - wy, 0, wy - (by + e.h * CELL));
        d = Math.hypot(dx, dy) + 4;
      } else {
        const ey = e.y - (e.alt || 0) - (e.cls === 'inf' ? 3 : 0);
        d = Math.max(0, Math.hypot(wx - e.x, wy - ey) - e.def.r);
      }
      if (d <= slop && d < bd) { bd = d; best = e; }
    }
    return best;
  }
  const ownUnits = () => G.selection.filter((e) => e.alive && e.kind === 'unit' && e.team === PLAYER);
  function select(list) { G.selection = list; }
  function marker(x, y, color) { G.effects.push({ type: 'ring', x, y, color, t: 0, life: 0.5 }); }

  let lastTap = null;
  function tap(sx, sy, shift) {
    if (!G || G.over) return;
    const w = s2w(sx, sy);
    if (G.place) { placeTap(w); return; }
    const slop = (isTouch ? 16 : 6) / cam.z;
    const e = pick(w.x, w.y, slop);
    const mine = ownUnits();
    if (e && e.team === PLAYER) {
      if (e.kind === 'bld' && e.type === 'refinery' && mine.length && mine.every((u) => u.def.harvester)) {
        for (const u of mine) { u.hs = 'return'; u.dest = null; }
        marker(e.x, e.y, '#3ed04a');
        return;
      }
      const now = performance.now();
      const dbl = lastTap && now - lastTap.t < 350 && lastTap.type === e.type;
      lastTap = { t: now, type: e.type };
      if (dbl && e.kind === 'unit') {
        const vx = cam.x, vy = cam.y, vw = W / cam.z, vh = H / cam.z;
        select(unitsOf(PLAYER).filter((u) => u.type === e.type && u.x > vx && u.x < vx + vw && u.y > vy && u.y < vy + vh));
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
      if (e && e.team !== PLAYER && e.team !== undefined) {
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
    const a = s2w(Math.min(sx0, sx1), Math.min(sy0, sy1)), b = s2w(Math.max(sx0, sx1), Math.max(sy0, sy1));
    const inBox = unitsOf(PLAYER).filter((u) => u.x > a.x && u.x < b.x && u.y - (u.alt || 0) > a.y && u.y - (u.alt || 0) < b.y);
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
  function endPlace() { if (G) G.place = null; ui.placebar.hidden = true; }
  function ghostAt(w) {
    const d = BUILD_DEFS[G.place.type];
    G.place.cx = Math.round(w.x / CELL - d.w / 2);
    G.place.cy = Math.round(w.y / CELL - d.h / 2);
    G.place.ok = canPlace(G.teams[PLAYER], G.place.type, G.place.cx, G.place.cy, 0);
    refreshPlaceBtn();
  }
  function refreshPlaceBtn() { ui.placeOk.disabled = !(G.place && G.place.ok); }
  function confirmPlace() {
    const p = G.place;
    if (!p || p.cx === undefined) return;
    if (placeStructure(G.teams[PLAYER], p.type, p.cx, p.cy)) endPlace();
    else eva('Cannot deploy here');
  }
  function placeTap(w) {
    const p = G.place, d = BUILD_DEFS[p.type];
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

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
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
      gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: cam.z, anchor: s2w((a.x + b.x) / 2, (a.y + b.y) / 2) };
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
    const p = local(e), w = s2w(p.x, p.y);
    cam.z = snapZ(cam.z + Math.sign(-e.deltaY) * Math.max(1 / DPR, cam.z * 0.12));
    cam.x = w.x - p.x / cam.z; cam.y = w.y - p.y / cam.z;
    clampCam();
  }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (!G) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys.add(k);
    if (k === 'Escape') { if (G.place) endPlace(); else select([]); }
    if (k === 'h') { const cy = G.entities.find((b) => b.team === PLAYER && b.type === 'cy') || buildingsOf(PLAYER)[0]; if (cy) centerOn(cy.x, cy.y); }
    if (k === 'p' || k === ' ') { e.preventDefault(); togglePause(); }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  window.addEventListener('blur', () => keys.clear());

  let radarDrag = false;
  function radarJump(e) {
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
  const UNIT_ORDER = ['infantry', 'vehicle', 'aircraft'];
  function stripTypes(team, side) {
    if (side === 'L') return Object.keys(BUILD_DEFS).filter((k) => available(team, k));
    return Object.keys(UNIT_DEFS).filter((k) => available(team, k))
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
      const d = defOf(type);
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'cameo'; btn.dataset.type = type;
      btn.title = `${d.name}: $${d.cost}`;
      btn.innerHTML = `<img alt="" src="${cameoURL(type, team.faction)}"><span class="nm">${d.name}</span><span class="cost">$${d.cost}</span><span class="clock"></span><span class="st"></span><span class="ct"></span>`;
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
  ui.homeBtn.addEventListener('click', () => {
    if (!G) return;
    const b = G.entities.find((e) => e.team === PLAYER && e.type === 'cy') || buildingsOf(PLAYER)[0];
    if (b) centerOn(b.x, b.y);
  });

  function cameoAction(type) {
    if (!G || G.over) return;
    Sound.play('click');
    const team = G.teams[PLAYER];
    const res = startProduction(team, type);
    if (res === 'place') beginPlace(type);
    else if (res === 'busy') eva('Unable to comply. Building in progress');
    else if (res === 'busy-same') eva('Building');
    else if (res === 'full') eva('Queue is full');
    else if (res) eva(res);
    else eva(catOf(type) === 'infantry' ? 'Training' : 'Building');
  }
  function cameoCancel(type) {
    if (!G) return;
    const team = G.teams[PLAYER];
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
    const team = G.teams[PLAYER];
    team.auto = !team.auto;
    ui.autoBtn.setAttribute('aria-pressed', String(team.auto));
    if (team.auto) {
      // Units already guarding join the next attack group.
      for (const u of unitsOf(PLAYER)) if (!u.def.harvester && u.order.type === 'guard') u.staged = true;
      eva('Auto attack on');
    } else eva('Auto attack off. New units guard the base');
  });
  ui.menuBtn.addEventListener('click', togglePause);

  let hudT = 0;
  function updateSidebar(dt) {
    hudT -= dt;
    if (hudT > 0 || !G) return;
    hudT = 0.1;
    const team = G.teams[PLAYER];
    ui.credits.textContent = String(Math.max(0, Math.floor(team.shown)));
    const autoLabel = team.auto ? `AUTO ${Math.min(team.waiting || 0, GROUP_SIZE)}/${GROUP_SIZE}` : 'AUTO';
    if (ui.autoLabel.textContent !== autoLabel) ui.autoLabel.textContent = autoLabel;
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
      const cat = catOf(type);
      if (cat === 'structure') {
        if (sq && sq.type === type) { p = sq.progress; st = sq.ready ? 'READY' : sq.stalled ? 'ON HOLD' : ''; }
        else if (sq) dim = true;
      } else {
        const list = team.queues[cat];
        count = list.filter((i) => i.type === type).length;
        if (list[0] && list[0].type === type) { p = list[0].progress; st = list[0].stalled ? 'ON HOLD' : ''; }
        else if (count) st = 'QUEUED';
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
    ui.selName.textContent = one ? (one.def.name + (one.team !== PLAYER ? ' · enemy' : '')) : `${sel.length} units`;
    const hp = one ? one.hp / one.maxHp : sel.reduce((s, e) => s + e.hp / e.maxHp, 0) / sel.length;
    ui.selHp.style.setProperty('--p', Math.max(0, hp));
    ui.selHp.dataset.state = hp > 0.5 ? 'ok' : hp > 0.25 ? 'warn' : 'low';
    const own = sel.filter((e) => e.team === PLAYER);
    const fighters = own.filter((e) => e.kind === 'unit' && !e.def.harvester);
    const bld = one && one.kind === 'bld' && one.team === PLAYER ? one : null;
    const btns = [];
    if (fighters.length) btns.push(['hunt', 'ATTACK']);
    if (own.some((e) => e.kind === 'unit')) btns.push(['stop', 'STOP']);
    if (bld) {
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
    const own = sel.filter((x) => x.team === PLAYER);
    const bld = sel.length === 1 && sel[0].kind === 'bld' && sel[0].team === PLAYER ? sel[0] : null;
    if (act === 'hunt') { commandHunt(own.filter((u) => u.kind === 'unit')); eva('Attacking enemy base'); Sound.ack('attack'); }
    else if (act === 'stop') commandStop(own.filter((u) => u.kind === 'unit'));
    else if (act === 'repair' && bld) bld.repairing = !bld.repairing;
    else if (act === 'sell' && bld) {
      if (sellArmed === bld) { bld.sellT = 1.2; bld.buildT = 1; select([]); sellArmed = null; eva('Structure sold'); Sound.play('sell'); }
      else { sellArmed = bld; setTimeout(() => { sellArmed = null; selSig = ''; }, 2500); }
    } else if (act === 'close') select([]);
    selSig = '';
    hudT = 0;
  });

  // ---------------------------------------------------------------------------
  // Menus
  // ---------------------------------------------------------------------------
  function showMenu(mode, won) {
    ui.menu.hidden = false;
    ui.menu.dataset.mode = mode;
    ui.resumeBtn.hidden = mode !== 'pause';
    ui.stats.hidden = mode !== 'end';
    if (G) G.paused = true;
    if (mode === 'start') { ui.menuTitle.textContent = 'Pocket Siege'; ui.menuSub.textContent = 'Choose your side, commander.'; ui.startBtn.textContent = 'Start mission'; }
    if (mode === 'pause') { ui.menuTitle.textContent = 'Paused'; ui.menuSub.textContent = 'Mission time ' + fmt(G.t); ui.startBtn.textContent = 'New mission'; }
    if (mode === 'end') {
      ui.menuTitle.textContent = won ? 'Mission Accomplished' : 'Mission Failed';
      ui.menuSub.textContent = won ? 'The enemy base has been destroyed.' : 'Your base has been destroyed.';
      ui.startBtn.textContent = 'Play again';
      const s = G.teams[PLAYER].stats;
      ui.stats.innerHTML = `<div><b>${fmt(G.t)}</b><span>Mission time</span></div><div><b>${s.killed}</b><span>Enemies destroyed</span></div>` +
        `<div><b>${s.lost}</b><span>Units lost</span></div><div><b>$${Math.round(s.harvested)}</b><span>Ore harvested</span></div>`;
    }
    ui.menu.classList.toggle('won', mode === 'end' && !!won);
    ui.menu.classList.toggle('lost', mode === 'end' && !won);
    syncMenuChoices();
  }
  for (const b of ui.menu.querySelectorAll('[data-audio]')) b.addEventListener('click', () => {
    Sound.init();
    const key = b.dataset.audio;
    Sound.setOption(key, !Sound.settings[key]);
    syncMenuChoices();
  });
  $('trackBtn').addEventListener('click', () => { Sound.init(); Sound.setOption('music', true); Sound.music.skip(); syncMenuChoices(); });
  function syncMenuChoices() {
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
  ui.startBtn.addEventListener('click', () => {
    ui.startBtn.textContent = 'Loading…';
    ui.startBtn.disabled = true;
    setTimeout(() => {
      endPlace();
      startGame();
      ui.startBtn.disabled = false;
      hideMenu();
      eva('Select a structure to build');
    }, 30);
  });
  ui.resumeBtn.addEventListener('click', hideMenu);
  setInterval(() => { if (!ui.menu.hidden) $('audioStatus').textContent = 'Sound: ' + Sound.status(); }, 500);
  document.addEventListener('visibilitychange', () => { if (document.hidden && G && !G.paused && !G.over) showMenu('pause'); });

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (G && !G.paused) {
      const k = 700 * dt / cam.z;
      if (keys.has('ArrowLeft') || keys.has('a')) cam.x -= k;
      if (keys.has('ArrowRight') || keys.has('d')) cam.x += k;
      if (keys.has('ArrowUp') || keys.has('w')) cam.y -= k;
      if (keys.has('ArrowDown') || keys.has('s')) cam.y += k;
      clampCam();
      while (dt > 0) { const step = Math.min(dt, 1 / 30); update(step); dt -= step; }
    }
    draw();
    updateSidebar(1 / 60);
    drawRadar(1 / 60);
    requestAnimationFrame(frame);
  }

  layout();
  startGame();
  showMenu('start');
  requestAnimationFrame(frame);

  // Hook for automated tests.
  window.__ps = { get G() { return G; }, update, cam, startGame, startProduction, placeStructure, aiFindSpot, canPlace, commandMove, commandHunt, tap, layout };

  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && window.top === window) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
