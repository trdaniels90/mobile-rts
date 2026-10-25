'use strict';
// Pocket Siege — a small real-time strategy game for touch screens and desktop browsers.
(() => {
  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------
  const WORLD_W = 2400, WORLD_H = 2400;
  const PLAYER = 0, ENEMY = 1, NEUTRAL = 2;
  const TEAM_COLORS = ['#4f8ef7', '#e5484d'];
  const TEAM_DARK = ['#1d3d7a', '#6e1a1d'];
  const CARRY = 10, GATHER_TIME = 1.5, MAX_SUPPLY = 60, MAX_QUEUE = 5;

  const UNITS = {
    worker:  { name: 'Worker',  icon: '👷', hp: 45,  speed: 74, r: 9,  dmg: 4,  range: 6,   cd: 1.0, sight: 150, cost: 50, time: 7 },
    soldier: { name: 'Soldier', icon: '🗡️', hp: 120, speed: 62, r: 11, dmg: 12, range: 8,   cd: 0.9, sight: 230, cost: 60, time: 9,  combat: true },
    archer:  { name: 'Archer',  icon: '🏹', hp: 65,  speed: 66, r: 10, dmg: 10, range: 150, cd: 1.3, sight: 250, cost: 75, time: 10, combat: true, ranged: true },
  };
  const BUILDINGS = {
    hq:       { name: 'Town Hall', icon: '🏰', hp: 1600, w: 100, h: 100, supply: 10, trains: ['worker'] },
    house:    { name: 'House',     icon: '🏠', hp: 350,  w: 54,  h: 54,  cost: 75,  time: 12, supply: 8 },
    barracks: { name: 'Barracks',  icon: '⚔️', hp: 800,  w: 86,  h: 74,  cost: 150, time: 22, trains: ['soldier', 'archer'] },
    tower:    { name: 'Tower',     icon: '🗼', hp: 550,  w: 46,  h: 46,  cost: 100, time: 16, dmg: 14, range: 210, cd: 1.1 },
  };
  const DIFFICULTY = {
    easy:   { income: 0.75, firstWave: 260, interval: 130, waveStart: 3, waveGrow: 1, armyCap: 14, maxBarracks: 1 },
    normal: { income: 1.0,  firstWave: 200, interval: 105, waveStart: 4, waveGrow: 2, armyCap: 24, maxBarracks: 2 },
    hard:   { income: 1.35, firstWave: 140, interval: 85,  waveStart: 5, waveGrow: 3, armyCap: 34, maxBarracks: 3 },
  };

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const mini = $('minimap'), mctx = mini.getContext('2d');
  const ui = {
    gold: $('gold'), supply: $('supply'), clock: $('clock'),
    idleBtn: $('idleBtn'), armyBtn: $('armyBtn'), pauseBtn: $('pauseBtn'),
    panel: $('panel'), info: $('selInfo'), actions: $('actions'),
    hint: $('hint'), hintText: $('hintText'), hintCancel: $('hintCancel'),
    toast: $('toast'), menu: $('menu'), menuTitle: $('menuTitle'), menuSub: $('menuSub'),
    startBtn: $('startBtn'), resumeBtn: $('resumeBtn'), stats: $('stats'),
    boxBtn: $('boxBtn'), help: $('helpText'),
  };
  const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  document.body.classList.toggle('touch', isTouch);

  let W = 0, H = 0, DPR = 1;
  const cam = { x: 0, y: 0, z: 1 };
  let G = null;          // game state
  let boxMode = false;   // touch: one-finger drag draws a selection box instead of panning
  let difficulty = 'normal';
  try { difficulty = localStorage.getItem('pocket-siege-difficulty') || 'normal'; } catch (_) {}
  if (!DIFFICULTY[difficulty]) difficulty = 'normal';

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function rng(seed) {
    return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  }
  // Distance between the edge of `a` (a circle) and the edge of entity `e`.
  function edgeDist(a, e) {
    const ar = a.r || 0;
    if (e.kind === 'building') {
      const dx = Math.max(Math.abs(a.x - e.x) - e.w / 2, 0);
      const dy = Math.max(Math.abs(a.y - e.y) - e.h / 2, 0);
      return Math.hypot(dx, dy) - ar;
    }
    return Math.hypot(a.x - e.x, a.y - e.y) - ar - e.r;
  }
  const isOwn = (e) => e && e.team === PLAYER;
  const isHostile = (a, b) => a.team !== NEUTRAL && b.team !== NEUTRAL && a.team !== b.team;
  const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  // ---------------------------------------------------------------------------
  // Entities
  // ---------------------------------------------------------------------------
  function addUnit(type, team, x, y) {
    const d = UNITS[type];
    const u = { id: G.nextId++, kind: 'unit', type, def: d, team, x, y, r: d.r, hp: d.hp, maxHp: d.hp,
      order: null, cd: 0, carry: 0, gatherT: 0, face: team === PLAYER ? -Math.PI / 4 : Math.PI * 0.75, alive: true, walk: 0 };
    G.entities.push(u);
    return u;
  }
  function addBuilding(type, team, x, y, built) {
    const d = BUILDINGS[type];
    const b = { id: G.nextId++, kind: 'building', type, def: d, team, x, y, w: d.w, h: d.h,
      hp: built ? d.hp : d.hp * 0.1, maxHp: d.hp, built, progress: built ? 1 : 0,
      queue: [], trainT: 0, rally: null, cd: 0, alive: true };
    G.entities.push(b);
    return b;
  }
  function addMine(x, y, gold) {
    const m = { id: G.nextId++, kind: 'mine', type: 'mine', team: NEUTRAL, x, y, r: 30, gold, maxGold: gold, alive: true };
    G.entities.push(m);
    return m;
  }

  const units = (team) => G.entities.filter((e) => e.alive && e.kind === 'unit' && (team === undefined || e.team === team));
  const buildings = (team) => G.entities.filter((e) => e.alive && e.kind === 'building' && (team === undefined || e.team === team));
  const mines = () => G.entities.filter((e) => e.alive && e.kind === 'mine');

  function supplyCap(team) {
    let s = 0;
    for (const b of buildings(team)) if (b.built && b.def.supply) s += b.def.supply;
    return Math.min(s, MAX_SUPPLY);
  }
  function supplyUsed(team) {
    let s = 0;
    for (const e of G.entities) {
      if (!e.alive || e.team !== team) continue;
      if (e.kind === 'unit') s++;
      else if (e.kind === 'building') s += e.queue.length;
    }
    return s;
  }

  function canPlace(type, x, y) {
    const d = BUILDINGS[type];
    if (x - d.w / 2 < 20 || y - d.h / 2 < 20 || x + d.w / 2 > WORLD_W - 20 || y + d.h / 2 > WORLD_H - 20) return false;
    for (const e of G.entities) {
      if (!e.alive) continue;
      if (e.kind === 'building') {
        if (Math.abs(e.x - x) < (e.w + d.w) / 2 + 14 && Math.abs(e.y - y) < (e.h + d.h) / 2 + 14) return false;
      } else if (e.kind === 'mine') {
        const dx = Math.max(Math.abs(e.x - x) - d.w / 2, 0), dy = Math.max(Math.abs(e.y - y) - d.h / 2, 0);
        if (Math.hypot(dx, dy) < e.r + 30) return false;
      }
    }
    return true;
  }

  // Returns an error message, or null on success.
  function placeBuilding(team, type, x, y, worker) {
    const d = BUILDINGS[type], T = G.teams[team];
    if (T.gold < d.cost) return `Need ${d.cost} gold for a ${d.name}`;
    if (!canPlace(type, x, y)) return "Can't build there";
    T.gold -= d.cost;
    const b = addBuilding(type, team, x, y, false);
    if (worker) worker.order = { type: 'build', site: b };
    return null;
  }

  function train(b, type) {
    const d = UNITS[type], T = G.teams[b.team];
    if (!b.built) return 'Still under construction';
    if (b.queue.length >= MAX_QUEUE) return 'Queue is full';
    if (T.gold < d.cost) return `Need ${d.cost} gold`;
    if (supplyUsed(b.team) >= supplyCap(b.team)) {
      return supplyCap(b.team) >= MAX_SUPPLY ? 'Army is at max size' : 'Build a House for more room';
    }
    T.gold -= d.cost;
    b.queue.push(type);
    return null;
  }

  function nearest(from, list, filter) {
    let best = null, bd = Infinity;
    for (const e of list) {
      if (filter && !filter(e)) continue;
      const d = dist(from, e);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  const nearestMine = (u) => nearest(u, mines());
  const nearestDropoff = (u) => nearest(u, buildings(u.team), (b) => b.built && b.type === 'hq');

  function gatherFrom(u, mine) {
    mine = mine || nearestMine(u);
    u.order = mine ? { type: 'gather', mine } : null;
  }

  function findEnemyNear(src, range) {
    let best = null, bs = Infinity;
    for (const e of G.entities) {
      if (!e.alive || (e.kind !== 'unit' && e.kind !== 'building') || !isHostile(src, e)) continue;
      const d = edgeDist(src, e);
      if (d > range) continue;
      const score = d + (e.kind === 'building' ? 80 : 0);
      if (score < bs) { bs = score; best = e; }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Game setup
  // ---------------------------------------------------------------------------
  function newGame() {
    G = {
      t: 0, nextId: 1, entities: [], projectiles: [], effects: [], selection: [],
      teams: [{ gold: 150, trained: 0, kills: 0, mined: 0 }, { gold: 150, trained: 0, kills: 0, mined: 0 }],
      diff: DIFFICULTY[difficulty], over: false, paused: false, pending: null, lastTap: null, idleIdx: 0,
      ai: { think: 0, nextWave: 0, waveSize: 0, warned: false },
    };
    G.ai.nextWave = G.diff.firstWave;
    G.ai.waveSize = G.diff.waveStart;

    // Player in the bottom-left, enemy mirrored in the top-right.
    const mirror = (p) => ({ x: WORLD_W - p.x, y: WORLD_H - p.y });
    const base = { x: 380, y: 2020 };
    const baseMines = [{ x: 560, y: 2170 }, { x: 250, y: 1840 }];
    const midMines = [{ x: 900, y: 1500 }, { x: 1080, y: 1880 }];
    for (const [team, f] of [[PLAYER, (p) => p], [ENEMY, mirror]]) {
      const hq = f(base);
      addBuilding('hq', team, hq.x, hq.y, true);
      for (const m of baseMines) { const p = f(m); addMine(p.x, p.y, 2500); }
      for (const m of midMines) { const p = f(m); addMine(p.x, p.y, 3000); }
      for (let i = 0; i < 4; i++) {
        const dx = team === PLAYER ? 1 : -1;
        const u = addUnit('worker', team, hq.x + dx * (70 + i * 6), hq.y - dx * (40 - i * 22));
        gatherFrom(u);
      }
    }
    addMine(WORLD_W / 2, WORLD_H / 2, 5000);

    cam.z = clamp(Math.min(W, H) / 560, 0.6, 1.3);
    centerOn(base.x + 110, base.y + 30);
    G.selection = [];
    hideMenu();
    panelSig = '';
  }

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------
  function insideObstacle(o, px, py, r) {
    if (o.kind === 'building') return Math.abs(px - o.x) < o.w / 2 + r && Math.abs(py - o.y) < o.h / 2 + r;
    return Math.hypot(px - o.x, py - o.y) < o.r + r;
  }

  // Walk toward (tx, ty), sliding around buildings and mines. Returns true on arrival.
  function moveToward(u, tx, ty, dt, ignore) {
    let dx = tx - u.x, dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.5) return true;
    dx /= d; dy /= d;
    let steered = false;
    const look = u.r + 20;
    const px = u.x + dx * look, py = u.y + dy * look;
    for (const o of G.obstacles) {
      if (o === ignore || !insideObstacle(o, px, py, u.r)) continue;
      let ox = u.x - o.x, oy = u.y - o.y;
      const ol = Math.hypot(ox, oy) || 1;
      ox /= ol; oy /= ol;
      let tx1 = -oy, ty1 = ox;
      if (tx1 * dx + ty1 * dy < 0 || (u.side === -1 && Math.abs(tx1 * dx + ty1 * dy) < 0.2)) { tx1 = -tx1; ty1 = -ty1; }
      u.side = tx1 === -oy ? 1 : -1;
      dx = tx1 * 0.85 + dx * 0.15; dy = ty1 * 0.85 + dy * 0.15;
      const l = Math.hypot(dx, dy); dx /= l; dy /= l;
      steered = true;
      break;
    }
    const step = u.def.speed * dt;
    u.face = Math.atan2(dy, dx);
    u.walk += dt;
    if (!steered && step >= d) { u.x = tx; u.y = ty; return true; }
    u.x += dx * step; u.y += dy * step;
    return false;
  }

  function attack(src, target) {
    const d = src.def;
    if (d.ranged || src.kind === 'building') {
      G.projectiles.push({ x: src.x, y: src.y - (src.kind === 'building' ? 26 : 4), target, dmg: d.dmg, speed: 430, from: src, team: src.team });
    } else {
      damage(target, d.dmg, src);
      G.effects.push({ type: 'slash', x: target.x, y: target.y, t: 0, life: 0.18 });
    }
  }

  function damage(target, amount, attacker) {
    if (!target.alive) return;
    target.hp -= amount;
    // Idle units fight back; workers busy gathering keep working.
    if (target.kind === 'unit' && attacker && attacker.alive && !target.order) {
      target.order = { type: 'attack', target: attacker, auto: true };
    }
    if (target.hp <= 0) kill(target, attacker);
  }

  function kill(e, attacker) {
    e.alive = false;
    if (attacker) G.teams[attacker.team].kills++;
    const size = e.kind === 'building' ? 46 : 16;
    G.effects.push({ type: 'puff', x: e.x, y: e.y, r: size, t: 0, life: e.kind === 'building' ? 0.9 : 0.5 });
    if (e.type === 'hq' && !G.over) {
      const others = buildings(e.team).filter((b) => b.type === 'hq' && b.alive);
      if (!others.length) setTimeout(() => endGame(e.team === ENEMY), 900);
      G.over = true;
    }
  }

  function updateUnit(u, dt) {
    u.cd = Math.max(0, u.cd - dt);
    const o = u.order;
    if (!o) {
      if (u.def.combat) {
        const t = findEnemyNear(u, u.def.sight);
        if (t) u.order = { type: 'attack', target: t, auto: true };
      }
      return;
    }
    switch (o.type) {
      case 'move': {
        const d = Math.hypot(o.x - u.x, o.y - u.y);
        if (d < 40) o.near = (o.near || 0) + dt;
        if (moveToward(u, o.x, o.y, dt) || d < 6 || o.near > 1.2) u.order = null;
        break;
      }
      case 'amove': {
        const t = findEnemyNear(u, u.def.sight);
        if (t) { u.order = { type: 'attack', target: t, auto: true, resume: o }; break; }
        const d = Math.hypot(o.x - u.x, o.y - u.y);
        if (d < 50) o.near = (o.near || 0) + dt;
        if (moveToward(u, o.x, o.y, dt) || d < 8 || o.near > 1.5) u.order = null;
        break;
      }
      case 'attack': {
        const t = o.target;
        if (!t.alive || (o.auto && edgeDist(u, t) > u.def.sight * 1.5)) { u.order = o.resume || null; break; }
        if (edgeDist(u, t) > u.def.range) {
          moveToward(u, t.x, t.y, dt, t);
        } else {
          u.face = Math.atan2(t.y - u.y, t.x - u.x);
          if (u.cd <= 0) { attack(u, t); u.cd = u.def.cd; }
        }
        break;
      }
      case 'gather': {
        if (!o.mine.alive && u.carry === 0) { gatherFrom(u); break; }
        if (u.carry >= CARRY || (!o.mine.alive && u.carry > 0)) {
          const hq = nearestDropoff(u);
          if (!hq) { u.order = null; break; }
          if (edgeDist(u, hq) > 6) moveToward(u, hq.x, hq.y, dt, hq);
          else {
            const gain = u.team === ENEMY ? Math.round(u.carry * G.diff.income) : u.carry;
            G.teams[u.team].gold += gain;
            G.teams[u.team].mined += gain;
            if (u.team === PLAYER) G.effects.push({ type: 'text', x: u.x, y: u.y - 14, text: `+${gain}`, t: 0, life: 0.9 });
            u.carry = 0;
            if (!o.mine.alive) gatherFrom(u);
          }
        } else if (edgeDist(u, o.mine) > 6) {
          moveToward(u, o.mine.x, o.mine.y, dt, o.mine);
          u.gatherT = 0;
        } else {
          u.face = Math.atan2(o.mine.y - u.y, o.mine.x - u.x);
          u.gatherT += dt;
          if (u.gatherT >= GATHER_TIME) {
            const amt = Math.min(CARRY, o.mine.gold);
            o.mine.gold -= amt;
            u.carry = amt;
            u.gatherT = 0;
            if (o.mine.gold <= 0) o.mine.alive = false;
          }
        }
        break;
      }
      case 'build': {
        const s = o.site;
        if (!s.alive || s.built) { if (s.alive) gatherFrom(u); else u.order = null; break; }
        if (edgeDist(u, s) > 6) { moveToward(u, s.x, s.y, dt, s); break; }
        u.face = Math.atan2(s.y - u.y, s.x - u.x);
        u.walk += dt * 2;
        const add = dt / s.def.time;
        s.progress = Math.min(1, s.progress + add);
        s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.9 * add);
        if (s.progress >= 1) {
          s.built = true;
          s.hp = Math.max(s.hp, s.maxHp * 0.5);
          if (s.team === PLAYER) toast(`${s.def.name} complete`);
          gatherFrom(u);
        }
        break;
      }
    }
  }

  function spawnFrom(b, type) {
    const toward = b.rally || { x: WORLD_W / 2, y: WORLD_H / 2 };
    const a = Math.atan2(toward.y - b.y, toward.x - b.x);
    const rad = Math.max(b.w, b.h) / 2 + 14;
    const u = addUnit(type, b.team, b.x + Math.cos(a) * rad, b.y + Math.sin(a) * rad);
    G.teams[b.team].trained++;
    if (type === 'worker') {
      if (b.rally && b.rally.mine && b.rally.mine.alive) gatherFrom(u, b.rally.mine);
      else if (b.rally) u.order = { type: 'move', x: b.rally.x, y: b.rally.y };
      else gatherFrom(u);
    } else {
      const r = b.rally || { x: b.x + Math.cos(a) * (rad + 60), y: b.y + Math.sin(a) * (rad + 60) };
      u.order = { type: 'move', x: r.x + (Math.random() - 0.5) * 30, y: r.y + (Math.random() - 0.5) * 30 };
    }
  }

  function updateBuilding(b, dt) {
    if (!b.built) return;
    if (b.queue.length) {
      b.trainT += dt;
      if (b.trainT >= UNITS[b.queue[0]].time) {
        spawnFrom(b, b.queue.shift());
        b.trainT = 0;
      }
    }
    if (b.def.dmg) {
      b.cd = Math.max(0, b.cd - dt);
      if (b.cd <= 0) {
        const t = findEnemyNear({ x: b.x, y: b.y, r: 0, team: b.team }, b.def.range);
        if (t) { attack(b, t); b.cd = b.def.cd; }
      }
    }
  }

  function resolveCollisions() {
    const us = G.entities.filter((e) => e.alive && e.kind === 'unit');
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j];
        const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
        if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
        let d = Math.hypot(dx, dy);
        if (d >= rr) continue;
        if (d < 0.01) { d = 0.01; }
        const push = (rr - d) * 0.5;
        const nx = d > 0.01 ? dx / d : Math.random() - 0.5, ny = d > 0.01 ? dy / d : Math.random() - 0.5;
        // Units standing still get pushed more than units on the move.
        const wa = a.order ? 0.35 : 0.65, wb = b.order ? 0.35 : 0.65, ws = wa + wb;
        a.x -= nx * push * 2 * (wa / ws); a.y -= ny * push * 2 * (wa / ws);
        b.x += nx * push * 2 * (wb / ws); b.y += ny * push * 2 * (wb / ws);
      }
    }
    for (const u of us) {
      for (const o of G.obstacles) {
        if (o.kind === 'building') {
          const hw = o.w / 2 + u.r, hh = o.h / 2 + u.r;
          const dx = u.x - o.x, dy = u.y - o.y;
          if (Math.abs(dx) < hw && Math.abs(dy) < hh) {
            const px = hw - Math.abs(dx), py = hh - Math.abs(dy);
            if (px < py) u.x += Math.sign(dx || 1) * px; else u.y += Math.sign(dy || 1) * py;
          }
        } else {
          const dx = u.x - o.x, dy = u.y - o.y, d = Math.hypot(dx, dy), rr = o.r + u.r;
          if (d < rr) { const k = d > 0.01 ? rr / d : 1; u.x = o.x + dx * k + (d > 0.01 ? 0 : rr); u.y = o.y + dy * k; }
        }
      }
      u.x = clamp(u.x, u.r, WORLD_W - u.r);
      u.y = clamp(u.y, u.r, WORLD_H - u.r);
    }
  }

  function updateProjectiles(dt) {
    for (const p of G.projectiles) {
      const t = p.target;
      if (!t.alive) { p.dead = true; continue; }
      const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy), step = p.speed * dt;
      p.a = Math.atan2(dy, dx);
      if (d <= step + 4) { damage(t, p.dmg, p.from.alive ? p.from : null); p.dead = true; continue; }
      p.x += (dx / d) * step; p.y += (dy / d) * step;
    }
    G.projectiles = G.projectiles.filter((p) => !p.dead);
  }

  // ---------------------------------------------------------------------------
  // Enemy AI
  // ---------------------------------------------------------------------------
  function aiBuild(type, workers, hq) {
    const d = BUILDINGS[type];
    if (G.teams[ENEMY].gold < d.cost) return;
    const toPlayer = Math.atan2(WORLD_H - hq.y - hq.y, WORLD_W - hq.x - hq.x);
    for (let i = 0; i < 40; i++) {
      const a = type === 'tower' ? toPlayer + (Math.random() - 0.5) * 1.4 : Math.random() * Math.PI * 2;
      const rad = (type === 'tower' ? 190 : 150) + i * 4;
      const x = hq.x + Math.cos(a) * rad, y = hq.y + Math.sin(a) * rad;
      if (!canPlace(type, x, y)) continue;
      const w = nearest({ x, y }, workers, (u) => !u.order || u.order.type === 'gather');
      if (!w) return;
      placeBuilding(ENEMY, type, x, y, w);
      return;
    }
  }

  function aiThink() {
    const A = G.ai, D = G.diff, T = G.teams[ENEMY];
    const myUnits = units(ENEMY), myBuildings = buildings(ENEMY);
    const hq = myBuildings.find((b) => b.type === 'hq');
    if (!hq) return;
    const workers = myUnits.filter((u) => u.type === 'worker');
    const army = myUnits.filter((u) => u.def.combat);
    const sites = myBuildings.filter((b) => !b.built);
    const count = (type) => myBuildings.filter((b) => b.type === type).length;

    for (const w of workers) if (!w.order) gatherFrom(w);

    const used = supplyUsed(ENEMY), cap = supplyCap(ENEMY);
    const wantWorkers = 11;
    const queuedWorkers = hq.queue.length;
    if (cap < MAX_SUPPLY && used >= cap - 2 && !sites.some((s) => s.type === 'house')) aiBuild('house', workers, hq);
    const wantBarracks = Math.min(D.maxBarracks, G.t > 360 ? 3 : G.t > 220 ? 2 : 1);
    if (count('barracks') < wantBarracks && workers.length >= 5 && !sites.some((s) => s.type === 'barracks')) aiBuild('barracks', workers, hq);
    if (G.t > 200 && count('tower') < (G.t > 480 ? 2 : 1) && T.gold > 220) aiBuild('tower', workers, hq);

    if (workers.length + queuedWorkers < wantWorkers && queuedWorkers === 0) train(hq, 'worker');
    const reserve = workers.length < wantWorkers ? 50 : 0;
    for (const b of myBuildings) {
      if (b.type !== 'barracks' || !b.built || b.queue.length >= 2 || army.length >= D.armyCap) continue;
      const type = Math.random() < 0.4 ? 'archer' : 'soldier';
      if (T.gold >= UNITS[type].cost + reserve) train(b, type);
    }

    // Defend the base first.
    const threat = nearest(hq, units(PLAYER), (u) => dist(u, hq) < 560);
    if (threat) {
      for (const u of army) if (!u.order || u.order.type === 'move') u.order = { type: 'amove', x: threat.x, y: threat.y };
      return;
    }
    if (!A.warned && G.t >= A.nextWave - 20) { A.warned = true; }
    if (G.t >= A.nextWave) {
      const ready = army.filter((u) => !u.order || u.order.type === 'move');
      if (ready.length >= A.waveSize) {
        const playerHq = buildings(PLAYER).find((b) => b.type === 'hq');
        const target = playerHq || nearest(hq, buildings(PLAYER));
        if (!target) return;
        for (const u of ready) u.order = { type: 'amove', x: target.x + (Math.random() - 0.5) * 60, y: target.y + (Math.random() - 0.5) * 60 };
        A.nextWave = G.t + D.interval;
        A.waveSize += D.waveGrow;
        A.warned = false;
        toast('⚔️ Enemy army is attacking!', true);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Main update
  // ---------------------------------------------------------------------------
  function update(dt) {
    if (!G || G.paused) return;
    G.t += dt;
    G.obstacles = G.entities.filter((e) => e.alive && (e.kind === 'building' || e.kind === 'mine'));
    for (const e of G.entities) {
      if (!e.alive) continue;
      if (e.kind === 'unit') updateUnit(e, dt);
      else if (e.kind === 'building') updateBuilding(e, dt);
    }
    resolveCollisions();
    updateProjectiles(dt);
    G.ai.think -= dt;
    if (G.ai.think <= 0) { G.ai.think = 1; aiThink(); }
    G.entities = G.entities.filter((e) => e.alive);
    G.selection = G.selection.filter((e) => e.alive);
    for (const fx of G.effects) fx.t += dt;
    G.effects = G.effects.filter((fx) => fx.t < fx.life);

    // Keyboard panning on desktop.
    const k = 700 * dt / cam.z;
    if (keys.has('ArrowLeft') || keys.has('a')) cam.x -= k;
    if (keys.has('ArrowRight') || keys.has('d')) cam.x += k;
    if (keys.has('ArrowUp') || keys.has('w')) cam.y -= k;
    if (keys.has('ArrowDown') || keys.has('s')) cam.y += k;
    clampCam();
  }

  // ---------------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------------
  function clampCam() {
    cam.z = clamp(cam.z, 0.35, 2.2);
    const vw = W / cam.z, vh = H / cam.z;
    const padTop = 80 / cam.z, padBottom = 220 / cam.z, padSide = 60 / cam.z;
    cam.x = vw > WORLD_W + padSide * 2 ? (WORLD_W - vw) / 2 : clamp(cam.x, -padSide, WORLD_W - vw + padSide);
    cam.y = vh > WORLD_H + padTop + padBottom ? (WORLD_H - vh) / 2 : clamp(cam.y, -padTop, WORLD_H - vh + padBottom);
  }
  function centerOn(x, y) { cam.x = x - W / cam.z / 2; cam.y = y - H / cam.z / 2; clampCam(); }
  const s2w = (sx, sy) => ({ x: sx / cam.z + cam.x, y: sy / cam.z + cam.y });
  function zoomAt(sx, sy, z) {
    const w = s2w(sx, sy);
    cam.z = clamp(z, 0.35, 2.2);
    cam.x = w.x - sx / cam.z; cam.y = w.y - sy / cam.z;
    clampCam();
  }

  // ---------------------------------------------------------------------------
  // Commands & selection
  // ---------------------------------------------------------------------------
  function pick(wx, wy, slop) {
    let best = null, bd = Infinity;
    for (const e of G.entities) {
      if (!e.alive) continue;
      let d;
      if (e.kind === 'building') {
        const dx = Math.max(Math.abs(wx - e.x) - e.w / 2, 0), dy = Math.max(Math.abs(wy - e.y) - e.h / 2, 0);
        d = Math.hypot(dx, dy) + 6; // prefer units standing in front of buildings
      } else {
        d = Math.max(0, Math.hypot(wx - e.x, wy - e.y) - e.r);
      }
      if (d <= slop && d < bd) { bd = d; best = e; }
    }
    return best;
  }
  const ownSelectedUnits = () => G.selection.filter((e) => e.alive && e.kind === 'unit' && e.team === PLAYER);
  const selectedBuilding = () => (G.selection.length === 1 && G.selection[0].kind === 'building' && isOwn(G.selection[0])) ? G.selection[0] : null;

  function select(list) {
    G.selection = list;
    G.pending = null;
  }

  function marker(x, y, color) { G.effects.push({ type: 'ring', x, y, color, t: 0, life: 0.6 }); }

  function command(w, target) {
    const us = ownSelectedUnits();
    if (!us.length) return false;
    if (target && target.kind !== 'mine' && isHostile(us[0], target)) {
      for (const u of us) u.order = { type: 'attack', target };
      marker(target.x, target.y, '#ff6b6b');
      return true;
    }
    if (target && target.kind === 'mine') {
      for (const u of us) {
        if (u.type === 'worker') gatherFrom(u, target);
        else u.order = { type: 'move', x: target.x, y: target.y };
      }
      marker(target.x, target.y, '#ffd34d');
      return true;
    }
    if (target && target.kind === 'building' && isOwn(target) && !target.built) {
      const ws = us.filter((u) => u.type === 'worker');
      for (const u of ws) u.order = { type: 'build', site: target };
      if (ws.length) { marker(target.x, target.y, '#7ee787'); return true; }
    }
    if (target && target.type === 'hq' && isOwn(target)) {
      // Workers carrying gold drop it off and keep mining.
      const ws = us.filter((u) => u.type === 'worker' && u.carry > 0);
      for (const u of ws) gatherFrom(u);
    }
    moveGroup(us, w.x, w.y, false);
    return true;
  }

  function moveGroup(us, x, y, aggressive) {
    const n = us.length, cols = Math.ceil(Math.sqrt(n)), gap = 26;
    const sorted = us.slice().sort((a, b) => dist(a, { x, y }) - dist(b, { x, y }));
    sorted.forEach((u, i) => {
      const cx = (i % cols) - (cols - 1) / 2, cy = Math.floor(i / cols) - (Math.ceil(n / cols) - 1) / 2;
      const tx = clamp(x + cx * gap, 20, WORLD_W - 20), ty = clamp(y + cy * gap, 20, WORLD_H - 20);
      u.order = { type: aggressive ? 'amove' : 'move', x: tx, y: ty };
    });
    marker(x, y, aggressive ? '#ff9f43' : '#7ee787');
  }

  function setRally(b, w, target) {
    b.rally = { x: w.x, y: w.y, mine: target && target.kind === 'mine' ? target : null };
    marker(w.x, w.y, '#a5b4fc');
  }

  function startPending(p) {
    G.pending = p;
    let text = '';
    if (p.kind === 'build') text = `Tap the map to place the ${BUILDINGS[p.type].name}`;
    if (p.kind === 'amove') text = 'Tap where to attack. Units fight anything on the way';
    if (p.kind === 'rally') text = 'Tap where new units should gather';
    if (!isTouch) text = text.replace('Tap', 'Click');
    ui.hintText.textContent = text;
    ui.hint.hidden = false;
  }
  function cancelPending() { if (G) G.pending = null; ui.hint.hidden = true; }

  function handlePending(w, target) {
    const p = G.pending;
    if (p.kind === 'build') {
      const workers = ownSelectedUnits().filter((u) => u.type === 'worker');
      if (!workers.length) { cancelPending(); return; }
      const builder = nearest(w, workers);
      const err = placeBuilding(PLAYER, p.type, w.x, w.y, builder);
      if (err) { toast(err); return; }
      marker(w.x, w.y, '#7ee787');
    } else if (p.kind === 'amove') {
      const us = ownSelectedUnits();
      if (target && target.kind !== 'mine' && us.length && isHostile(us[0], target)) command(w, target);
      else moveGroup(us, w.x, w.y, true);
    } else if (p.kind === 'rally') {
      const b = selectedBuilding();
      if (b) setRally(b, w, target);
    }
    cancelPending();
  }

  function tap(sx, sy, isMouse, shift) {
    if (!G || G.over) return;
    const w = s2w(sx, sy);
    const target = pick(w.x, w.y, (isMouse ? 6 : 18) / cam.z);
    if (G.pending) { handlePending(w, target); return; }

    if (target && isOwn(target)) {
      // A worker tapping an unfinished building helps build it.
      if (!isMouse && target.kind === 'building' && !target.built && ownSelectedUnits().some((u) => u.type === 'worker')) {
        command(w, target);
        return;
      }
      const now = performance.now();
      const dbl = G.lastTap && now - G.lastTap.t < 350 && G.lastTap.type === target.type;
      G.lastTap = { t: now, type: target.type };
      if (dbl && target.kind === 'unit') {
        const vx = cam.x, vy = cam.y, vw = W / cam.z, vh = H / cam.z;
        select(units(PLAYER).filter((u) => u.type === target.type && u.x > vx && u.x < vx + vw && u.y > vy && u.y < vy + vh));
        return;
      }
      if (shift && target.kind === 'unit') {
        const i = G.selection.indexOf(target);
        if (i >= 0) G.selection.splice(i, 1);
        else select(ownSelectedUnits().concat(target));
      } else {
        select([target]);
      }
      return;
    }

    if (isMouse) { select(target ? [target] : []); return; }

    // Touch: tapping the map commands the selected units.
    if (ownSelectedUnits().length) { command(w, target); return; }
    const b = selectedBuilding();
    if (b && b.def.trains && !target) { select([]); return; }
    select(target ? [target] : []);
  }

  function rightClick(sx, sy) {
    if (!G || G.over) return;
    const w = s2w(sx, sy);
    const target = pick(w.x, w.y, 8 / cam.z);
    if (G.pending) { cancelPending(); return; }
    if (ownSelectedUnits().length) { command(w, target); return; }
    const b = selectedBuilding();
    if (b && b.def.trains) setRally(b, w, target);
  }

  function boxSelect(x0, y0, x1, y1, add) {
    const a = s2w(Math.min(x0, x1), Math.min(y0, y1)), b = s2w(Math.max(x0, x1), Math.max(y0, y1));
    const inBox = units(PLAYER).filter((u) => u.x + u.r > a.x && u.x - u.r < b.x && u.y + u.r > a.y && u.y - u.r < b.y);
    // Prefer fighters when a box catches both fighters and workers.
    const fighters = inBox.filter((u) => u.def.combat);
    const chosen = fighters.length ? fighters : inBox;
    if (add) select(Array.from(new Set(ownSelectedUnits().concat(chosen))));
    else if (chosen.length) select(chosen);
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  const pointers = new Map();
  let gesture = null, longPress = null;
  const mouse = { x: -1, y: -1, inside: false };
  const keys = new Set();

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerType === 'mouse') {
      if (e.button === 2) { rightClick(e.clientX, e.clientY); return; }
      if (e.button === 1) { gesture = { type: 'pan', id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false }; return; }
      gesture = { type: 'maybeBox', id: e.pointerId, sx: e.clientX, sy: e.clientY, ex: e.clientX, ey: e.clientY, moved: false, shift: e.shiftKey, mouse: true };
      return;
    }
    if (pointers.size === 2) {
      clearTimeout(longPress);
      const [p1, p2] = [...pointers.values()];
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      gesture = { type: 'pinch', d0: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1, z0: cam.z, anchor: s2w(mx, my) };
      return;
    }
    if (pointers.size > 2) return;
    gesture = { type: boxMode ? 'box' : 'touch', id: e.pointerId, sx: e.clientX, sy: e.clientY, ex: e.clientX, ey: e.clientY, moved: false };
    if (!boxMode) {
      longPress = setTimeout(() => {
        if (gesture && gesture.type === 'touch' && !gesture.moved) { gesture.type = 'box'; gesture.held = true; }
      }, 450);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true; }
    const p = pointers.get(e.pointerId);
    if (!p || !gesture) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (gesture.type === 'pinch') {
      if (pointers.size < 2) return;
      const [p1, p2] = [...pointers.values()];
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      cam.z = clamp(gesture.z0 * Math.hypot(p1.x - p2.x, p1.y - p2.y) / gesture.d0, 0.35, 2.2);
      cam.x = gesture.anchor.x - mx / cam.z;
      cam.y = gesture.anchor.y - my / cam.z;
      clampCam();
      return;
    }
    if (e.pointerId !== gesture.id) return;
    if (Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) > 9) gesture.moved = true;
    gesture.ex = e.clientX; gesture.ey = e.clientY;
    if (gesture.type === 'touch' && gesture.moved) { clearTimeout(longPress); gesture.type = 'pan'; }
    if (gesture.type === 'maybeBox' && gesture.moved) gesture.type = 'box';
    if (gesture.type === 'pan') { cam.x -= dx / cam.z; cam.y -= dy / cam.z; clampCam(); }
  });

  function endPointer(e, cancelled) {
    pointers.delete(e.pointerId);
    if (!gesture) return;
    if (gesture.type === 'pinch' || gesture.type === 'dead') {
      gesture = pointers.size ? { type: 'dead' } : null;
      return;
    }
    if (e.pointerId !== gesture.id) return;
    clearTimeout(longPress);
    const g = gesture;
    gesture = null;
    if (cancelled) return;
    if (g.type === 'box' && g.moved) boxSelect(g.sx, g.sy, g.ex, g.ey, g.shift);
    else if (!g.moved && g.type !== 'pan') tap(g.sx, g.sy, !!g.mouse, g.shift);
  }
  canvas.addEventListener('pointerup', (e) => endPointer(e, false));
  canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') mouse.inside = false; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, cam.z * Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  // Stop Safari's page pinch-zoom from fighting the game's own pinch.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (!G) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys.add(k);
    if (k === 'Escape') { if (G.pending) cancelPending(); else select([]); }
    if (k === 'q' && ownSelectedUnits().some((u) => u.def.combat)) startPending({ kind: 'amove' });
    if (k === 'x') for (const u of ownSelectedUnits()) u.order = null;
    if (k === 'h') { const hq = buildings(PLAYER).find((b) => b.type === 'hq'); if (hq) centerOn(hq.x, hq.y); }
    if (k === 'p' || k === ' ') { e.preventDefault(); togglePause(); }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  window.addEventListener('blur', () => keys.clear());

  // Minimap: tap or drag to move the camera.
  let miniDrag = false;
  function miniJump(e) {
    const r = mini.getBoundingClientRect();
    centerOn((e.clientX - r.left) / r.width * WORLD_W, (e.clientY - r.top) / r.height * WORLD_H);
  }
  mini.addEventListener('pointerdown', (e) => { e.preventDefault(); miniDrag = true; try { mini.setPointerCapture(e.pointerId); } catch (_) {} miniJump(e); });
  mini.addEventListener('pointermove', (e) => { if (miniDrag) miniJump(e); });
  mini.addEventListener('pointerup', () => { miniDrag = false; });
  mini.addEventListener('pointercancel', () => { miniDrag = false; });

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------
  let toastTimer = null;
  function toast(msg, alert) {
    ui.toast.textContent = msg;
    ui.toast.classList.toggle('alert', !!alert);
    ui.toast.hidden = false;
    ui.toast.classList.remove('show');
    void ui.toast.offsetWidth;
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 2600);
  }

  ui.idleBtn.addEventListener('click', () => {
    if (!G) return;
    const idle = units(PLAYER).filter((u) => u.type === 'worker' && !u.order);
    if (!idle.length) { toast('All workers are busy'); return; }
    const u = idle[G.idleIdx++ % idle.length];
    select([u]);
    centerOn(u.x, u.y);
  });
  ui.armyBtn.addEventListener('click', () => {
    if (!G) return;
    const army = units(PLAYER).filter((u) => u.def.combat);
    if (!army.length) { toast('Train soldiers at a Barracks'); return; }
    select(army);
    const cx = army.reduce((s, u) => s + u.x, 0) / army.length, cy = army.reduce((s, u) => s + u.y, 0) / army.length;
    centerOn(cx, cy);
  });
  ui.boxBtn.addEventListener('click', () => {
    boxMode = !boxMode;
    ui.boxBtn.classList.toggle('on', boxMode);
    ui.boxBtn.setAttribute('aria-pressed', String(boxMode));
    toast(boxMode ? 'Drag to select a group of units' : 'Drag to move the map');
  });
  ui.hintCancel.addEventListener('click', cancelPending);
  ui.pauseBtn.addEventListener('click', togglePause);

  ui.actions.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn || !G || G.over) return;
    const [act, arg] = btn.dataset.act.split(':');
    const b = selectedBuilding();
    if (act === 'train' && b) { const err = train(b, arg); if (err) toast(err); }
    else if (act === 'cancelTrain' && b && b.queue.length) {
      const type = b.queue.pop();
      G.teams[PLAYER].gold += UNITS[type].cost;
      if (!b.queue.length) b.trainT = 0;
    }
    else if (act === 'build') {
      const cost = BUILDINGS[arg].cost;
      if (G.teams[PLAYER].gold < cost) toast(`Need ${cost} gold for a ${BUILDINGS[arg].name}`);
      else startPending({ kind: 'build', type: arg });
    }
    else if (act === 'amove') startPending({ kind: 'amove' });
    else if (act === 'rally') startPending({ kind: 'rally' });
    else if (act === 'stop') for (const u of ownSelectedUnits()) u.order = null;
    else if (act === 'gather') for (const u of ownSelectedUnits()) if (u.type === 'worker') gatherFrom(u);
    else if (act === 'deselect') { select([]); cancelPending(); }
    panelSig = '';
  });

  let panelSig = '';
  function actionButton(act, icon, label, cost, disabled) {
    return `<button type="button" class="act${disabled ? ' dim' : ''}" data-act="${act}">` +
      `<span class="ic">${icon}</span><span class="lb">${label}</span>${cost ? `<span class="cost">${cost}</span>` : ''}</button>`;
  }

  function updatePanel() {
    const sel = G.selection;
    const gold = G.teams[PLAYER].gold;
    const room = supplyUsed(PLAYER) < supplyCap(PLAYER);
    let sig = sel.map((e) => e.id).join(',') + '|' + (G.pending ? G.pending.kind : '');
    const acts = [];
    let head = '', body = '';

    if (!sel.length) {
      head = '';
      body = isTouch
        ? 'Tap a unit to select it. Drag to move the map, pinch to zoom. Hold, then drag to select a group.'
        : 'Click to select, drag to box-select, right click to move or attack. Arrow keys or WASD scroll, wheel zooms.';
    } else if (sel.length === 1) {
      const e = sel[0];
      if (e.kind === 'mine') {
        head = '💰 Gold Mine';
        body = `<b class="num">${e.gold}</b> gold left`;
      } else {
        const own = isOwn(e) ? '' : ' <span class="tag foe">Enemy</span>';
        head = `${e.def.icon} ${e.def.name}${own}`;
        body = `<span class="hpbar"><i style="width:${(e.hp / e.maxHp) * 100}%"></i></span><span class="num">${Math.ceil(e.hp)} / ${e.maxHp}</span>`;
        if (e.kind === 'unit' && e.carry) body += ` · carrying <b class="num">${e.carry}</b> gold`;
        if (e.kind === 'building' && !e.built) body += ` · building <b class="num">${Math.floor(e.progress * 100)}%</b>`;
        if (e.kind === 'building' && e.queue.length) {
          body += `<div class="queue"><span class="qbar"><i id="qprog" style="width:${(e.trainT / UNITS[e.queue[0]].time) * 100}%"></i></span>${e.queue.map((t) => UNITS[t].icon).join('')}</div>`;
        }
        sig += `|${e.kind === 'building' ? `${e.built}${e.queue.join()}` : ''}`;
      }
    } else {
      const counts = {};
      for (const e of sel) counts[e.def.name] = (counts[e.def.name] || 0) + 1;
      head = `${sel.length} units`;
      body = Object.entries(counts).map(([n, c]) => `<b class="num">${c}</b> ${n}${c > 1 ? 's' : ''}`).join(' · ');
    }

    const us = ownSelectedUnits();
    if (us.some((u) => u.type === 'worker')) {
      for (const t of ['house', 'barracks', 'tower']) {
        const d = BUILDINGS[t];
        acts.push(actionButton(`build:${t}`, d.icon, d.name, d.cost, gold < d.cost));
        sig += gold < d.cost ? '0' : '1';
      }
    }
    if (us.some((u) => u.def.combat)) acts.push(actionButton('amove', '🎯', 'Attack'));
    if (us.length) acts.push(actionButton('stop', '✋', 'Stop'));
    if (us.length && us.every((u) => u.type === 'worker') && us.some((u) => !u.order)) acts.push(actionButton('gather', '⛏️', 'Mine'));
    const b = selectedBuilding();
    if (b && b.built && b.def.trains) {
      for (const t of b.def.trains) {
        const d = UNITS[t], dis = gold < d.cost || !room;
        acts.push(actionButton(`train:${t}`, d.icon, d.name, d.cost, dis));
        sig += dis ? '0' : '1';
      }
      if (b.queue.length) acts.push(actionButton('cancelTrain', '↩️', 'Cancel'));
      acts.push(actionButton('rally', '🚩', 'Rally'));
    }
    if (sel.length) acts.push(actionButton('deselect', '✕', 'Close'));

    if (sig !== panelSig) {
      panelSig = sig;
      ui.info.innerHTML = `${head ? `<div class="name">${head}</div>` : ''}<div class="detail">${body}</div>`;
      ui.actions.innerHTML = acts.join('');
      ui.panel.classList.toggle('empty', !sel.length);
    } else if (sel.length === 1) {
      // Refresh live numbers without rebuilding buttons under the player's finger.
      const det = ui.info.querySelector('.detail');
      if (det) det.innerHTML = body;
    }
  }

  let hudT = 0;
  function updateHud(dt) {
    hudT -= dt;
    if (hudT > 0) return;
    hudT = 0.15;
    ui.gold.textContent = Math.floor(G.teams[PLAYER].gold);
    const used = supplyUsed(PLAYER), cap = supplyCap(PLAYER);
    ui.supply.textContent = `${used}/${cap}`;
    ui.supply.parentElement.classList.toggle('warn', used >= cap);
    ui.clock.textContent = fmtTime(G.t);
    const idle = units(PLAYER).filter((u) => u.type === 'worker' && !u.order).length;
    ui.idleBtn.querySelector('.n').textContent = idle;
    ui.idleBtn.classList.toggle('alert', idle > 0);
    ui.armyBtn.querySelector('.n').textContent = units(PLAYER).filter((u) => u.def.combat).length;
    if (!G.pending) ui.hint.hidden = true;
    updatePanel();
  }

  // ---------------------------------------------------------------------------
  // Menus
  // ---------------------------------------------------------------------------
  function showMenu(mode, won) {
    ui.menu.hidden = false;
    ui.menu.dataset.mode = mode;
    ui.resumeBtn.hidden = mode !== 'pause';
    ui.stats.hidden = mode !== 'end';
    if (mode === 'start') { ui.menuTitle.textContent = 'Pocket Siege'; ui.menuSub.textContent = 'Mine gold, raise an army, and topple the red Town Hall before they topple yours.'; ui.startBtn.textContent = 'Start battle'; }
    if (mode === 'pause') { ui.menuTitle.textContent = 'Paused'; ui.menuSub.textContent = `Battle time ${fmtTime(G.t)}`; ui.startBtn.textContent = 'New battle'; }
    if (mode === 'end') {
      ui.menuTitle.textContent = won ? 'Victory' : 'Defeat';
      ui.menuSub.textContent = won ? 'The enemy Town Hall has fallen.' : 'Your Town Hall was destroyed.';
      ui.startBtn.textContent = 'Play again';
      const T = G.teams[PLAYER];
      ui.stats.innerHTML = `<div><b>${fmtTime(G.t)}</b><span>time</span></div><div><b>${T.mined}</b><span>gold mined</span></div>` +
        `<div><b>${T.trained}</b><span>units trained</span></div><div><b>${T.kills}</b><span>enemies defeated</span></div>`;
    }
    ui.menu.classList.toggle('won', !!won);
    ui.menu.classList.toggle('lost', mode === 'end' && !won);
    for (const btn of ui.menu.querySelectorAll('[data-diff]')) btn.setAttribute('aria-pressed', String(btn.dataset.diff === difficulty));
  }
  function hideMenu() { ui.menu.hidden = true; if (G) G.paused = false; }
  function togglePause() {
    if (!G || G.over) return;
    if (G.paused) hideMenu();
    else { G.paused = true; showMenu('pause'); }
  }
  function endGame(won) { cancelPending(); showMenu('end', won); }

  for (const btn of ui.menu.querySelectorAll('[data-diff]')) {
    btn.addEventListener('click', () => {
      difficulty = btn.dataset.diff;
      try { localStorage.setItem('pocket-siege-difficulty', difficulty); } catch (_) {}
      for (const b of ui.menu.querySelectorAll('[data-diff]')) b.setAttribute('aria-pressed', String(b === btn));
    });
  }
  ui.startBtn.addEventListener('click', () => {
    cancelPending();
    newGame();
    toast(isTouch ? 'Tap a worker, then tap Barracks to build one' : 'Left click selects, right click moves and attacks');
  });
  ui.resumeBtn.addEventListener('click', hideMenu);
  document.addEventListener('visibilitychange', () => { if (document.hidden && G && !G.paused && !G.over) togglePause(); });

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  const ground = document.createElement('canvas');
  function paintGround() {
    const S = 0.5;
    ground.width = WORLD_W * S; ground.height = WORLD_H * S;
    const g = ground.getContext('2d');
    g.scale(S, S);
    g.fillStyle = '#3f6b34';
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    const r = rng(7);
    for (let i = 0; i < 900; i++) {
      const x = r() * WORLD_W, y = r() * WORLD_H, s = 20 + r() * 90;
      g.fillStyle = r() < 0.5 ? 'rgba(90,140,70,0.18)' : 'rgba(40,70,35,0.18)';
      g.beginPath(); g.ellipse(x, y, s, s * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2); g.fill();
    }
    // A worn road between the two bases.
    g.strokeStyle = 'rgba(150,120,80,0.35)'; g.lineCap = 'round'; g.lineWidth = 70;
    g.beginPath(); g.moveTo(380, 2020); g.bezierCurveTo(900, 1700, 1500, 700, 2020, 380); g.stroke();
    g.strokeStyle = 'rgba(120,95,60,0.25)'; g.lineWidth = 40;
    g.beginPath(); g.moveTo(380, 2020); g.bezierCurveTo(900, 1700, 1500, 700, 2020, 380); g.stroke();
    for (let i = 0; i < 1600; i++) {
      const x = r() * WORLD_W, y = r() * WORLD_H;
      g.fillStyle = ['#e9e3a1', '#f3b6c8', '#ffffff', '#b5d98a'][Math.floor(r() * 4)];
      g.globalAlpha = 0.5; g.fillRect(x, y, 4, 4); g.globalAlpha = 1;
    }
    // Forest along the map border (scenery only).
    for (let i = 0; i < 520; i++) {
      const side = Math.floor(r() * 4), along = r() * WORLD_W, depth = r() * 70;
      let x = along, y = depth;
      if (side === 1) { x = WORLD_W - depth; y = along; } else if (side === 2) { x = along; y = WORLD_H - depth; } else if (side === 3) { x = depth; y = along; }
      const s = 16 + r() * 18;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(x + 6, y + 8, s, s * 0.7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = r() < 0.5 ? '#2a4d25' : '#335c2b'; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(120,170,90,0.25)'; g.beginPath(); g.arc(x - s * 0.3, y - s * 0.3, s * 0.45, 0, Math.PI * 2); g.fill();
    }
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2.5);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const ms = mini.clientWidth || 120;
    mini.width = Math.round(ms * DPR); mini.height = Math.round(ms * DPR);
    clampCam();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  function hpBar(x, y, w, frac, team) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
    ctx.fillStyle = frac > 0.5 ? '#5fd068' : frac > 0.25 ? '#f5c542' : '#ef5350';
    if (team === ENEMY && frac > 0.5) ctx.fillStyle = '#ff8a80';
    ctx.fillRect(x - w / 2, y, w * frac, 4);
  }

  function drawMine(m) {
    const k = 0.6 + 0.4 * (m.gold / m.maxGold);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(m.x + 4, m.y + 10, m.r * 1.05, m.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b6259';
    ctx.beginPath(); ctx.ellipse(m.x, m.y + 4, m.r, m.r * 0.75, 0, 0, Math.PI * 2); ctx.fill();
    const rocks = [[-12, -2, 13], [10, -6, 15], [0, 8, 12], [-4, -14, 10]];
    for (const [dx, dy, s] of rocks) {
      const sz = s * k;
      ctx.fillStyle = '#f2c94c';
      ctx.beginPath();
      ctx.moveTo(m.x + dx, m.y + dy - sz); ctx.lineTo(m.x + dx + sz * 0.8, m.y + dy);
      ctx.lineTo(m.x + dx, m.y + dy + sz * 0.6); ctx.lineTo(m.x + dx - sz * 0.8, m.y + dy);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath(); ctx.moveTo(m.x + dx, m.y + dy - sz); ctx.lineTo(m.x + dx + sz * 0.3, m.y + dy - sz * 0.2); ctx.lineTo(m.x + dx - sz * 0.3, m.y + dy - sz * 0.1); ctx.closePath(); ctx.fill();
    }
    const tw = (Math.sin(G.t * 3 + m.id) + 1) / 2;
    ctx.fillStyle = `rgba(255,255,255,${tw})`;
    ctx.fillRect(m.x + 8, m.y - 16, 3, 3);
  }

  function drawBuilding(b) {
    const { x, y, w, h } = b, c = TEAM_COLORS[b.team], dk = TEAM_DARK[b.team];
    const L = x - w / 2, T = y - h / 2;
    ctx.globalAlpha = b.built ? 1 : 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(L + 6, T + 8, w, h);
    if (b.type === 'hq') {
      ctx.fillStyle = '#8d8a83'; ctx.fillRect(L, T, w, h);
      ctx.fillStyle = '#a7a39a';
      for (let i = 0; i < 5; i++) ctx.fillRect(L + i * (w / 5) + 3, T - 8, w / 5 - 6, 10);
      ctx.fillStyle = dk; ctx.fillRect(L + 14, T + 14, w - 28, h - 28);
      ctx.fillStyle = c; ctx.fillRect(L + 20, T + 20, w - 40, h - 40);
      ctx.fillStyle = '#4a3b2a'; ctx.fillRect(x - 10, y + h / 2 - 22, 20, 22);
      ctx.strokeStyle = '#3b3a36'; ctx.lineWidth = 2; ctx.strokeRect(L, T, w, h);
      ctx.fillStyle = '#3b3a36'; ctx.fillRect(x - 1, T - 34, 2, 30);
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x + 1, T - 34); ctx.lineTo(x + 22 + Math.sin(G.t * 4) * 2, T - 28); ctx.lineTo(x + 1, T - 22); ctx.fill();
    } else if (b.type === 'house') {
      ctx.fillStyle = '#c9a46a'; ctx.fillRect(L, T + h * 0.35, w, h * 0.65);
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(L - 4, T + h * 0.4); ctx.lineTo(x, T - 4); ctx.lineTo(L + w + 4, T + h * 0.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dk; ctx.fillRect(x - 6, T + h - 18, 12, 18);
      ctx.strokeStyle = '#5b4426'; ctx.lineWidth = 2; ctx.strokeRect(L, T + h * 0.35, w, h * 0.65);
    } else if (b.type === 'barracks') {
      ctx.fillStyle = '#6d4c33'; ctx.fillRect(L, T, w, h);
      ctx.fillStyle = '#7e5a3d';
      for (let i = 0; i < 4; i++) ctx.fillRect(L + 4, T + 6 + i * (h / 4), w - 8, h / 4 - 6);
      ctx.fillStyle = c; ctx.fillRect(L + 10, T - 6, 14, 34); ctx.fillRect(L + w - 24, T - 6, 14, 34);
      ctx.strokeStyle = '#e8e2d0'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 12, y - 6); ctx.lineTo(x + 12, y + 18); ctx.moveTo(x + 12, y - 6); ctx.lineTo(x - 12, y + 18); ctx.stroke();
      ctx.strokeStyle = '#3e2a1a'; ctx.lineWidth = 2; ctx.strokeRect(L, T, w, h);
    } else if (b.type === 'tower') {
      ctx.fillStyle = '#7c7a74'; ctx.fillRect(L, T, w, h);
      ctx.fillStyle = '#9b9890'; ctx.beginPath(); ctx.arc(x, y - 10, w * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y - 10, w * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3b3a36'; ctx.lineWidth = 2; ctx.strokeRect(L, T, w, h);
    }
    ctx.globalAlpha = 1;
    if (!b.built) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
      ctx.strokeRect(L, T, w, h); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(L, y - 4, w, 8);
      ctx.fillStyle = '#ffd34d'; ctx.fillRect(L + 1, y - 3, (w - 2) * b.progress, 6);
    }
  }

  function drawUnit(u) {
    const c = TEAM_COLORS[u.team], dk = TEAM_DARK[u.team];
    const bob = u.order ? Math.sin(u.walk * 14) * 1.2 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(u.x + 2, u.y + u.r * 0.8, u.r, u.r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(u.x, u.y + bob);
    ctx.rotate(u.face);
    // Weapon or tool, drawn under the body.
    ctx.lineCap = 'round';
    if (u.type === 'soldier') {
      ctx.strokeStyle = '#dfe6ee'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(4, 7); ctx.lineTo(u.r + 9, 7); ctx.stroke();
      ctx.fillStyle = dk; ctx.fillRect(u.r - 6, -u.r + 1, 6, 12);
    } else if (u.type === 'archer') {
      ctx.strokeStyle = '#8b5e34'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(2, 0, u.r + 3, -1.1, 1.1); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(2 + Math.cos(-1.1) * (u.r + 3), Math.sin(-1.1) * (u.r + 3)); ctx.lineTo(2 + Math.cos(1.1) * (u.r + 3), Math.sin(1.1) * (u.r + 3)); ctx.stroke();
    } else {
      const swing = u.order && (u.order.type === 'gather' || u.order.type === 'build') && u.gatherT > 0 || (u.order && u.order.type === 'build')
        ? Math.sin(u.walk * 10) * 0.8 : 0;
      ctx.rotate(swing);
      ctx.strokeStyle = '#8b5e34'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(2, 5); ctx.lineTo(u.r + 6, 5); ctx.stroke();
      ctx.strokeStyle = '#b8c2cc'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(u.r + 6, 0); ctx.lineTo(u.r + 6, 10); ctx.stroke();
      ctx.rotate(-swing);
    }
    ctx.fillStyle = c;
    ctx.strokeStyle = dk; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, u.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.arc(-u.r * 0.25, -u.r * 0.3, u.r * 0.45, 0, Math.PI * 2); ctx.fill();
    // Head / helmet.
    ctx.fillStyle = u.type === 'worker' ? '#f2c94c' : u.type === 'soldier' ? '#b8c2cc' : '#3f6b34';
    ctx.beginPath(); ctx.arc(1, 0, u.r * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (u.carry) {
      ctx.fillStyle = '#f2c94c'; ctx.strokeStyle = '#7a5a10'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(u.x, u.y - u.r - 6 + bob, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  function drawSelection(e) {
    ctx.strokeStyle = isOwn(e) ? '#7ee787' : e.team === ENEMY ? '#ff6b6b' : '#ffd34d';
    ctx.lineWidth = 2 / Math.min(cam.z, 1.2);
    if (e.kind === 'building') {
      ctx.strokeRect(e.x - e.w / 2 - 5, e.y - e.h / 2 - 5, e.w + 10, e.h + 10);
      if (isOwn(e) && e.rally && G.selection.length === 1) {
        ctx.setLineDash([5, 6]); ctx.strokeStyle = 'rgba(165,180,252,0.8)';
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.rally.x, e.rally.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#a5b4fc'; ctx.fillRect(e.rally.x - 1, e.rally.y - 18, 2, 18);
        ctx.beginPath(); ctx.moveTo(e.rally.x + 1, e.rally.y - 18); ctx.lineTo(e.rally.x + 12, e.rally.y - 14); ctx.lineTo(e.rally.x + 1, e.rally.y - 10); ctx.fill();
      }
      if (e.def.range) {
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.def.range, 0, Math.PI * 2); ctx.stroke();
      }
    } else {
      ctx.beginPath(); ctx.ellipse(e.x, e.y + 2, e.r + 5, (e.r + 5) * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawGhost() {
    if (!G.pending || G.pending.kind !== 'build' || isTouch || !mouse.inside) return;
    const w = s2w(mouse.x, mouse.y), d = BUILDINGS[G.pending.type];
    const ok = canPlace(G.pending.type, w.x, w.y);
    ctx.fillStyle = ok ? 'rgba(126,231,135,0.35)' : 'rgba(255,107,107,0.35)';
    ctx.strokeStyle = ok ? '#7ee787' : '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.fillRect(w.x - d.w / 2, w.y - d.h / 2, d.w, d.h);
    ctx.strokeRect(w.x - d.w / 2, w.y - d.h / 2, d.w, d.h);
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#1d2a1a';
    ctx.fillRect(0, 0, W, H);
    if (!G) return;
    ctx.save();
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.x, -cam.y);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(ground, 0, 0, WORLD_W, WORLD_H);

    const vx0 = cam.x - 80, vy0 = cam.y - 80, vx1 = cam.x + W / cam.z + 80, vy1 = cam.y + H / cam.z + 80;
    const visible = G.entities.filter((e) => e.x > vx0 && e.x < vx1 && e.y > vy0 && e.y < vy1);
    visible.sort((a, b) => (a.y + (a.h || 0) / 2) - (b.y + (b.h || 0) / 2));

    // Selection rings and tower ranges go under everything.
    for (const e of G.selection) drawSelection(e);
    for (const e of visible) {
      if (e.kind === 'mine') drawMine(e);
      else if (e.kind === 'building') drawBuilding(e);
      else drawUnit(e);
    }
    for (const e of visible) {
      if (e.kind === 'mine') continue;
      const sel = G.selection.includes(e);
      if (!sel && e.hp >= e.maxHp) continue;
      if (e.kind === 'building') hpBar(e.x, e.y - e.h / 2 - 14, Math.max(40, e.w * 0.8), e.hp / e.maxHp, e.team);
      else hpBar(e.x, e.y - e.r - 10, 22, e.hp / e.maxHp, e.team);
    }
    for (const p of G.projectiles) {
      ctx.strokeStyle = p.from && p.from.kind === 'building' ? '#ffe08a' : '#f5f0e1';
      ctx.lineWidth = 2;
      const a = p.a || 0;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - Math.cos(a) * 10, p.y - Math.sin(a) * 10); ctx.stroke();
    }
    for (const fx of G.effects) {
      const k = fx.t / fx.life;
      if (fx.type === 'ring') {
        ctx.strokeStyle = fx.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(fx.x, fx.y, 6 + k * 18, (6 + k * 18) * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (fx.type === 'puff') {
        ctx.fillStyle = 'rgba(200,190,170,1)'; ctx.globalAlpha = (1 - k) * 0.7;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r * (0.5 + k), 0, Math.PI * 2); ctx.fill();
      } else if (fx.type === 'slash') {
        ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, 8, -0.8 + k, 0.6 + k); ctx.stroke();
      } else if (fx.type === 'text') {
        ctx.globalAlpha = 1 - k; ctx.fillStyle = '#ffd34d';
        ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(fx.text, fx.x, fx.y - k * 22);
      }
      ctx.globalAlpha = 1;
    }
    drawGhost();
    ctx.restore();

    if (gesture && gesture.type === 'box' && gesture.moved) {
      const x = Math.min(gesture.sx, gesture.ex), y = Math.min(gesture.sy, gesture.ey);
      ctx.fillStyle = 'rgba(126,231,135,0.12)'; ctx.strokeStyle = '#7ee787'; ctx.lineWidth = 1.5;
      ctx.fillRect(x, y, Math.abs(gesture.ex - gesture.sx), Math.abs(gesture.ey - gesture.sy));
      ctx.strokeRect(x, y, Math.abs(gesture.ex - gesture.sx), Math.abs(gesture.ey - gesture.sy));
    } else if (gesture && gesture.type === 'box' && gesture.held) {
      ctx.strokeStyle = '#7ee787'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(gesture.sx, gesture.sy, 26, 0, Math.PI * 2); ctx.stroke();
    }
  }

  let miniT = 0;
  function drawMinimap(dt) {
    miniT -= dt;
    if (miniT > 0 || !G) return;
    miniT = 0.1;
    const s = mini.width / WORLD_W;
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.drawImage(ground, 0, 0, mini.width, mini.height);
    mctx.fillStyle = 'rgba(0,0,0,0.25)'; mctx.fillRect(0, 0, mini.width, mini.height);
    for (const e of G.entities) {
      if (e.kind === 'mine') { mctx.fillStyle = '#f2c94c'; mctx.fillRect(e.x * s - 2.5 * DPR, e.y * s - 2.5 * DPR, 5 * DPR, 5 * DPR); }
      else if (e.kind === 'building') { mctx.fillStyle = TEAM_COLORS[e.team]; mctx.fillRect((e.x - e.w / 2) * s, (e.y - e.h / 2) * s, Math.max(e.w * s, 4 * DPR), Math.max(e.h * s, 4 * DPR)); }
    }
    for (const e of G.entities) {
      if (e.kind !== 'unit') continue;
      mctx.fillStyle = e.team === PLAYER ? '#a9c8ff' : '#ff9a9e';
      mctx.fillRect(e.x * s - 1.5 * DPR, e.y * s - 1.5 * DPR, 3 * DPR, 3 * DPR);
    }
    mctx.strokeStyle = '#ffffff'; mctx.lineWidth = 1.5 * DPR;
    mctx.strokeRect(cam.x * s, cam.y * s, (W / cam.z) * s, (H / cam.z) * s);
  }

  // ---------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    if (G) { updateHud(dt); drawMinimap(dt); }
    requestAnimationFrame(frame);
  }

  resize();
  paintGround();
  // Show the battlefield behind the start menu.
  newGame();
  G.paused = true;
  showMenu('start');
  requestAnimationFrame(frame);

  // Debug hook for automated tests.
  window.__pocketSiege = { get state() { return G; }, newGame, update, cam, tap, rightClick, boxSelect, train, placeBuilding, moveGroup, canPlace };

  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && window.top === window) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
