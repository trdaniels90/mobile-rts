'use strict';
// Red Horizon's dedicated game server. Players meet in a room (a 4-letter code), and the battle runs
// here instead of on a phone: every phone is a guest that sends its orders and draws the snapshots it
// is sent (src/netcore.js). Each room has its own copy of the game scripts (headless.js).
//
// Battles: '1v1' (two players), '2v2' (four players, two a side) and 'coop' (two players together
// against two computer sides). A room has up to four slots (sides); players sit in slots, and in co-op
// the other two are the computer's. Slots 0 and 2 are one alliance (ally 0), 1 and 3 the other.
//
// Messages are the same JSON the phones send each other phone to phone (net.js), plus the room ones:
//   phone -> server: { k: 'create', name, v, gid, faction, map } | { k: 'join', code, name, v, gid }
//                    { k: 'lobby', faction, map } (leader, 1 v 1: side 0's faction)
//                    { k: 'setup', mode, map, diff } (leader) | { k: 'faction', slot, faction }
//                    { k: 'team' } (move to the other alliance) | { k: 'go' } (leader)
//                    'c' orders | 'ping' | 'away' | 'back' | 'resume' | 'quit' | 'bye'
//   server -> phone: { k: 'room', code, lead } | { k: 'err', why: 'none' | 'full' | 'version' | 'busy' }
//                    { k: 'lobby', faction, map, mode, diff, host, guest, slots, mine, ready }
//                    { k: 'start', seed, faction, match, map, side, sides, mode, diff }
//                    's' snapshots | 'end' | 'pong' | 'away' | 'resume' | 'left' | 'bye'
const http = require('http');
const vm = require('vm');
const { WebSocketServer } = require('ws');
const headless = require('./headless');

const PORT = +process.env.PORT || 8080;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const STEP = 1 / 30;            // simulation step, seconds (the phones step at most this much)
const SNAP = 0.1;               // seconds between snapshots
const SILENT = 6000;            // ms without a word from a phone: it has dropped
const WAIT_LIMIT = +process.env.WAIT_LIMIT || 120;   // seconds to wait for a dropped player
const IDLE_LIMIT = 30 * 60;     // a room nobody is in closes after this long (seconds)
const MAX_ROOMS = +process.env.MAX_ROOMS || 40;
const SPEED = +process.env.SPEED || 1;   // tests only: run battles faster than real time
const MODES = ['1v1', '2v2', 'coop'];
const DIFFS = ['easy', 'normal', 'hard'];

const VERSION = headless.load().get('VERSION');   // the game version this server runs
const rooms = new Map();
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------------------------------------------------------------------------
// Reports to the owner's stats page (Supabase, supabase/server.sql): a status beat every minute and a
// row per battle (when it starts and when it ends). Only with the SERVER_TOKEN secret set (Fly secret);
// without it (tests, a local run) nothing is sent.
const STARTED = new Date().toISOString();
const SUPA = { url: process.env.SUPABASE_URL || 'https://yorrgemlhoxbxvyvzcwe.supabase.co/',
  key: process.env.SUPABASE_KEY || 'sb_publishable_FkCzdcgsEyqNy_UwmajBiQ_kp8V2Vi6', token: process.env.SERVER_TOKEN || '' };
function rpc(fn, p) {
  if (!SUPA.token || typeof fetch !== 'function') return Promise.resolve(false);
  return fetch(SUPA.url + 'rest/v1/rpc/' + fn, { method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { apikey: SUPA.key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ p_token: SUPA.token, p }) })
    .then((r) => { if (!r.ok) log('report', fn, 'failed:', r.status); return r.ok; })
    .catch((e) => { log('report', fn, 'failed:', e && e.message); return false; });
}
// Step times over the last minute, every battle together (for the status beat).
const stepStat = { n: 0, ms: 0, max: 0 };
function beat() {
  const battles = [...rooms.values()].filter((r) => r.phase === 'battle');
  const players = [...rooms.values()].reduce((n, r) => n + r.seats.filter((s) => s.ws).length, 0);
  const p = { version: VERSION, started_at: STARTED, rooms: rooms.size, battles: battles.length, players,
    mem_mb: Math.round(process.memoryUsage().rss / 1048576),
    step_ms: stepStat.n ? +(stepStat.ms / stepStat.n).toFixed(2) : null, step_max_ms: stepStat.n ? +stepStat.max.toFixed(1) : null };
  stepStat.n = 0; stepStat.ms = 0; stepStat.max = 0;
  return rpc('server_beat', p);
}
// A battle's row. how: 'win' (destroyed), 'quit', 'left', or 'abandoned' (every player gone, no winner).
function reportBattle(R, how, winner) {
  const B = R.battle;
  if (!B) return;
  const G = R.G, secs = Math.max(1, (Date.now() - B.t0) / 1000);
  const perf = { steps: B.steps, step_ms: B.steps ? +(B.stepMs / B.steps).toFixed(2) : null, step_max_ms: +B.stepMax.toFixed(1),
    slow_steps: B.slow, peak_units: B.peak, snap_kb_s: +(B.bytes / 1024 / secs / Math.max(1, B.seats)).toFixed(1),
    snap_max_kb: +(B.snapMax / 1024).toFixed(1), held_s: Math.round(B.heldMs / 1000) };
  const players = B.sides.map((x, i) => {
    const s = R.seats.find((o) => o.side === i);
    return { side: i, ally: x.ally, faction: x.faction, name: x.ai ? null : x.name, ai: !!x.ai, left: !!(s && s.left), took_over: !x.ai && !!(G && G.teams[i] && G.teams[i].isAI) };
  });
  const done = how !== undefined;
  return rpc('server_battle', { id: B.id, code: R.code, version: VERSION, mode: R.mode, map: B.map, difficulty: B.diff, players,
    started_at: B.at, ended_at: done ? new Date().toISOString() : null, duration_s: done && G ? Math.round(G.t) : null,
    winner: done && winner !== undefined && winner !== null ? winner : null, how: done ? how : null,
    errors: B.errors.length ? B.errors : null, perf: done ? perf : null });
}
function noteError(R, where, e) {
  log(R.code, where, 'error', e && e.stack);
  const B = R.battle;
  if (!B) return;
  const msg = where + ': ' + String((e && e.message) || e).slice(0, 200);
  const old = B.errors.find((x) => x.msg === msg);
  if (old) old.n++;
  else if (B.errors.length < 6) B.errors.push({ msg, at: G_t(R), n: 1, stack: String((e && e.stack) || '').split('\n').slice(1, 4).join(' | ').slice(0, 400) });
}
const G_t = (R) => (R.G ? Math.round(R.G.t) : 0);

function newCode() {
  for (let n = 0; n < 1000; n++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += LETTERS[(Math.random() * LETTERS.length) | 0];
    if (!rooms.has(c)) return c;
  }
  return null;
}
const newId = () => Math.random().toString(36).slice(2, 10);
const uuid = () => require('crypto').randomUUID();
const send = (ws, o) => { if (ws && ws.readyState === 1) try { ws.send(typeof o === 'string' ? o : JSON.stringify(o)); } catch (_) {} };
const clean = (s) => String(s || 'Commander').replace(/[\u0000-\u001f]/g, '').slice(0, 20) || 'Commander';
const other = (f) => (f === 'allies' ? 'soviets' : 'allies');
const faction = (f) => (f === 'soviets' ? 'soviets' : 'allies');

// ---------------------------------------------------------------------------
// A room: seats (index 0 is the leader, who picks the battle and map), slots, and a battle once started.
function makeRoom(code) {
  const ctx = headless.load();
  const run = (s) => vm.runInContext(s, ctx);
  const NetCore = ctx.get('NetCore');
  const R = { code, ctx, run, NetCore, update: ctx.get('update'), get G() { return ctx.get('G'); },
    seats: [], phase: 'lobby', mode: '1v1', diff: 'normal', map: ctx.get('DEFAULT_MAP'), slots: null,
    emptySince: Date.now(), snapT: 0, waitSince: 0, held: false, timer: null };
  setMode(R, '1v1', 'allies');
  NetCore.hook();
  NetCore.onOver = () => {
    broadcastSnaps(R, true);
    const end = JSON.stringify(NetCore.endMsg());
    for (const s of R.seats) send(s.ws, end);
    log(code, 'battle over, winner alliance', R.G.over.winner, R.G.over.how || '', 'at', Math.round(R.G.t), 's');
    reportBattle(R, R.G.over.how || 'win', R.G.over.winner);
    R.battle = null;
    setTimeout(() => backToLobby(R), 0);
  };
  rooms.set(code, R);
  return R;
}
function closeRoom(R, why) {
  clearInterval(R.timer);
  if (R.phase === 'battle' && R.battle && !(R.G && R.G.over)) reportBattle(R, 'abandoned', null);
  R.battle = null;
  for (const s of R.seats) { send(s.ws, { k: 'bye' }); try { s.ws && s.ws.close(); } catch (_) {} }
  rooms.delete(R.code);
  log(R.code, 'closed:', why, '| rooms', rooms.size);
}

// The slots of a battle. f: alliance 0's faction (alliance 1 gets the other).
function setMode(R, mode, f) {
  f = faction(f || (R.slots && R.slots[0].faction));
  const n = mode === '1v1' ? 2 : 4;
  const old = R.slots || [];
  R.slots = [];
  for (let i = 0; i < n; i++) {
    const ally = i % 2, ai = mode === 'coop' && ally === 1;
    R.slots.push({ ally, faction: old[i] && mode !== '1v1' ? old[i].faction : ally ? other(f) : f, ai });
  }
  R.mode = mode;
  // Seat the players again, in the order they came.
  for (const s of R.seats) s.slot = undefined;
  for (const s of R.seats) s.slot = freeSlot(R);
}
const humanSlots = (R) => R.slots.map((x, i) => i).filter((i) => !R.slots[i].ai);
function freeSlot(R, ally) {
  for (const i of humanSlots(R)) if ((ally === undefined || R.slots[i].ally === ally) && !R.seats.some((s) => s.slot === i)) return i;
  return undefined;
}
const ready = (R) => humanSlots(R).every((i) => R.seats.some((s) => s.slot === i && s.ws));
function lobbyMsg(R, me) {
  const by = (i) => R.seats.find((s) => s.slot === i);
  const [h, g] = R.seats;
  return { k: 'lobby', mode: R.mode, diff: R.diff, map: R.map, faction: R.slots[0].faction,
    host: h ? { name: h.name } : null, guest: g ? { name: g.name } : null,
    slots: R.slots.map((x, i) => ({ ally: x.ally, faction: x.faction, ai: x.ai, name: by(i) ? by(i).name : null })),
    mine: me ? me.slot : null, players: R.seats.length, ready: ready(R) };
}
function sendLobby(R) { for (const s of R.seats) send(s.ws, lobbyMsg(R, s)); }

function start(R) {
  if (R.phase !== 'lobby' || !ready(R)) return;
  const seed = (Math.random() * 1e9) | 0, match = newId();
  R.match = match;
  const { ctx, NetCore } = R;
  const name = (i) => { const s = R.seats.find((x) => x.slot === i); return s ? s.name : null; };
  const sides = R.slots.map((x, i) => ({ faction: x.faction, ally: x.ally, ai: x.ai, name: name(i) }));
  const diff = R.mode === 'coop' ? R.diff : 'normal';
  // Nobody on this copy is "me": every side is a remote player or the computer.
  ctx.get('newWorld')(sides[0].faction, diff, seed, 0, true, R.map, sides);
  R.G.me = -1;   // so every side's announcer lines go out to its player (hooks.evaFor)
  for (const t of R.G.teams) if (t.isAI) t.auto = true;
  NetCore.reset();
  NetCore.hosting = true;
  R.seats.forEach((s) => { s.side = s.slot; s.peer = NetCore.peer(s.side); s.away = false; s.left = false; });
  R.phase = 'battle'; R.snapT = 0; R.waitSince = 0; R.held = false; R.last = Date.now();
  R.battle = { id: uuid(), at: new Date().toISOString(), t0: Date.now(), map: R.map, diff, sides, seats: R.seats.length,
    steps: 0, stepMs: 0, stepMax: 0, slow: 0, peak: 0, bytes: 0, snapMax: 0, heldMs: 0, errors: [] };
  reportBattle(R);
  R.seats.forEach((s) => send(s.ws, { k: 'start', seed, faction: sides[0].faction, match, map: R.map, side: s.side, sides, mode: R.mode, diff }));
  clearInterval(R.timer);
  R.timer = setInterval(() => tick(R), Math.round(STEP * 1000 / Math.max(1, SPEED)));
  log(R.code, 'battle started:', R.mode, sides.map((x) => (x.ai ? 'computer' : x.name) + '/' + x.ally).join(', '), 'on', R.map);
}
function backToLobby(R) {
  clearInterval(R.timer); R.timer = null;
  R.phase = 'lobby';
  R.NetCore.hosting = false;
  // Anyone who left during the battle loses their seat now.
  R.seats = R.seats.filter((s) => s.ws && !s.left);
  if (!R.seats.length) { closeRoom(R, 'empty after battle'); return; }
  for (const s of R.seats) { s.peer = null; if (s.slot === undefined) s.slot = freeSlot(R); }
  sendLobby(R);
}

function broadcastSnaps(R, all) {
  const seats = R.seats.filter((s) => s.ws && s.peer);
  const of = new Map(seats.map((s) => [s.peer, s]));
  const B = R.battle;
  R.NetCore.snapshots(seats.map((s) => s.peer), (P, snap) => {
    const txt = typeof snap === 'string' ? snap : JSON.stringify(snap);
    if (B) { B.bytes += txt.length; if (txt.length > B.snapMax) B.snapMax = txt.length; }
    send(of.get(P).ws, txt);
  }, (P) => all || of.get(P).ws.bufferedAmount <= 512 * 1024);
}

// A player who has gone for good (surrendered, or did not come back). In a 1 v 1 they lose. In a team
// game the computer takes over their side, and their alliance loses only once none of its players is left.
function handOver(R, s, how) {
  const G = R.G;
  if (!G || G.over) return;
  s.left = true;
  const otherAlly = (side) => (G.teams[side].ally === 0 ? 1 : 0);
  if (R.mode === '1v1') { R.run(`endBattle(${otherAlly(s.side)}, '${how}')`); return; }
  const t = G.teams[s.side];
  t.isAI = true; t.auto = true;
  for (const o of R.seats) if (o !== s) send(o.ws, { k: 'left', name: s.name, side: s.side });
  log(R.code, s.name, how === 'quit' ? 'surrendered' : 'left', ': the computer takes side', s.side);
  const stay = R.seats.some((o) => !o.left && G.teams[o.side].ally === t.ally);
  if (!stay) R.run(`endBattle(${otherAlly(s.side)}, '${how}')`);
}

function tick(R) {
  const now = Date.now(), G = R.G;
  let dt = Math.min(0.25, (now - R.last) / 1000) * SPEED;
  R.last = now;
  if (R.phase !== 'battle' || !G || G.over) return;
  // Phones that have gone quiet have dropped.
  for (const s of R.seats) if (s.ws && now - s.heard > SILENT) { log(R.code, s.name, 'silent: dropped'); drop(R, s); }
  const missing = R.seats.filter((s) => !s.left && (!s.ws || s.away));
  G.hold = missing.length > 0;
  if (G.hold) {
    if (R.battle) R.battle.heldMs += now - (R.lastHold || now);
    R.lastHold = now;
    R.held = true;
    if (!R.waitSince) R.waitSince = now;
    if ((now - R.waitSince) / 1000 > WAIT_LIMIT) {
      // Waited long enough: those still away are gone. If every player has gone, nobody won: close
      // the room with no result (no computer takeover, no winner sent to anyone).
      if (missing.length === R.seats.filter((s) => !s.left).length) { closeRoom(R, 'abandoned: every player left'); return; }
      G.hold = false; R.waitSince = 0;
      for (const s of missing) handOver(R, s, 'left');
    }
    return;
  }
  R.lastHold = 0;
  if (R.held) { R.held = false; R.waitSince = 0; for (const s of R.seats) send(s.ws, { k: 'resume' }); }
  const t0 = process.hrtime.bigint();
  try {
    while (dt > 0) { const step = Math.min(dt, STEP); dt -= step; R.update(step); }
  } catch (e) { noteError(R, 'update', e); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6, B = R.battle;
  stepStat.n++; stepStat.ms += ms; if (ms > stepStat.max) stepStat.max = ms;
  if (B) {
    B.steps++; B.stepMs += ms; if (ms > B.stepMax) B.stepMax = ms; if (ms > STEP * 1000) B.slow++;
    if (B.steps % 30 === 0 && R.G) { let n = 0; for (const e of R.G.entities) if (e.alive) n++; if (n > B.peak) B.peak = n; }
  }
  if ((R.snapT -= STEP * SPEED) <= 0) {
    R.snapT = SNAP;
    try { broadcastSnaps(R); } catch (e) { noteError(R, 'snapshot', e); }
  }
}

// A phone's connection went away. In a battle its seat is kept for it to come back.
function drop(R, s) {
  const ws = s.ws;
  s.ws = null;
  try { ws && ws.close(); } catch (_) {}
  if (R.phase === 'battle') {
    if (!s.left) { R.held = true; for (const o of R.seats) if (o !== s) send(o.ws, { k: 'away' }); }
    return;
  }
  removeSeat(R, s);
}
function removeSeat(R, s) {
  const wasLead = R.seats[0] === s;
  R.seats = R.seats.filter((x) => x !== s);
  if (!R.seats.length) { closeRoom(R, 'empty'); return; }
  if (wasLead) log(R.code, 'leader left:', R.seats[0].name, 'leads now');
  sendLobby(R);
}
function leave(R, s) {
  if (R.phase === 'battle' && !R.G.over) {
    handOver(R, s, 'quit');   // leaving a battle is surrendering
    s.ws = null;
    return;
  }
  s.ws = null;
  if (R.phase === 'lobby') removeSeat(R, s);
}

function onMessage(ws, m, st) {
  const R = st.room, s = st.seat;
  if (m.k === 'ping') { send(ws, { k: 'pong', t: m.t }); if (s) s.heard = Date.now(); return; }
  if (!R) {
    if (m.v !== VERSION) { send(ws, { k: 'err', why: 'version', v: VERSION }); ws.close(); return; }
    if (m.k === 'create') {
      if (rooms.size >= MAX_ROOMS) { send(ws, { k: 'err', why: 'busy' }); ws.close(); return; }
      const code = newCode();
      if (!code) { send(ws, { k: 'err', why: 'busy' }); ws.close(); return; }
      const room = makeRoom(code);
      setMode(room, '1v1', m.faction);
      room.map = room.ctx.get('validMap')(m.map);
      const seat = { gid: String(m.gid || newId()), name: clean(m.name), ws, heard: Date.now(), slot: 0 };
      room.seats.push(seat);
      st.room = room; st.seat = seat;
      send(ws, { k: 'room', code, lead: true });
      sendLobby(room);
      log(code, 'created by', seat.name, '| rooms', rooms.size);
    } else if (m.k === 'join') {
      const room = rooms.get(String(m.code || '').toUpperCase());
      if (!room) { send(ws, { k: 'err', why: 'none' }); ws.close(); return; }
      // The same phone coming back (after a dropped connection) takes its own seat again.
      let seat = room.seats.find((x) => x.gid === String(m.gid));
      if (seat && !seat.left) {
        if (seat.ws && seat.ws !== ws) try { seat.ws.close(); } catch (_) {}
        seat.ws = ws; seat.heard = Date.now(); seat.away = false;
        st.room = room; st.seat = seat;
        send(ws, { k: 'room', code: room.code, lead: room.seats[0] === seat });
        if (room.phase === 'battle' && seat.peer) seat.peer = room.NetCore.peer(seat.side, true);   // a full snapshot starts its copy afresh
        else sendLobby(room);
        log(room.code, seat.name, 'is back');
        return;
      }
      if (seat) { send(ws, { k: 'err', why: 'none' }); ws.close(); return; }   // left the battle: it goes on without them
      const slot = room.phase === 'lobby' ? freeSlot(room) : undefined;
      if (slot === undefined) { send(ws, { k: 'err', why: 'full' }); ws.close(); return; }
      seat = { gid: String(m.gid || newId()), name: clean(m.name), ws, heard: Date.now(), slot };
      room.seats.push(seat);
      st.room = room; st.seat = seat;
      send(ws, { k: 'room', code: room.code, lead: false });
      sendLobby(room);
      log(room.code, seat.name, 'joined');
    }
    return;
  }
  s.heard = Date.now();
  const lead = R.seats[0] === s, lobby = R.phase === 'lobby';
  if (m.k === 'lobby' && lead && lobby) {
    // (1 v 1, as phone to phone: side 0's faction and the map)
    R.slots[0].faction = faction(m.faction); R.slots[1].faction = other(R.slots[0].faction);
    if (R.mode !== '1v1') { R.slots[2].faction = R.slots[0].faction; R.slots[3].faction = R.slots[1].faction; }
    R.map = R.ctx.get('validMap')(m.map);
    sendLobby(R);
  } else if (m.k === 'setup' && lead && lobby) {
    if (MODES.includes(m.mode) && m.mode !== R.mode) {
      const room = m.mode === '1v1' || m.mode === 'coop' ? 2 : 4;
      if (R.seats.length <= room) setMode(R, m.mode);
    }
    if (m.map) R.map = R.ctx.get('validMap')(m.map);
    if (DIFFS.includes(m.diff)) R.diff = m.diff;
    sendLobby(R);
  } else if (m.k === 'faction' && lobby) {
    const i = +m.slot, x = R.slots[i];
    if (x && (s.slot === i || (lead && x.ai))) {
      x.faction = faction(m.faction);
      if (R.mode === '1v1') R.slots[1 - i].faction = other(x.faction);
      sendLobby(R);
    }
  } else if (m.k === 'team' && lobby && R.mode === '2v2') {
    const to = freeSlot(R, R.slots[s.slot].ally === 0 ? 1 : 0);
    if (to !== undefined) { s.slot = to; sendLobby(R); }
  } else if (m.k === 'go' && lead) start(R);
  else if (m.k === 'c' && R.phase === 'battle' && !R.G.hold && s.peer && !s.left) R.NetCore.applyCommand(s.side, m);
  else if (m.k === 'away' && R.phase === 'battle') { s.away = true; R.held = true; for (const o of R.seats) if (o !== s) send(o.ws, { k: 'away' }); }
  else if (m.k === 'back' || m.k === 'resume') s.away = false;
  else if (m.k === 'quit' && R.phase === 'battle' && !R.G.over && !s.left) handOver(R, s, 'quit');
  else if (m.k === 'bye') leave(R, s);
}

// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  // A health check, and a little to look at.
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify({ ok: true, game: 'red-horizon', version: VERSION, rooms: rooms.size,
    battles: [...rooms.values()].filter((r) => r.phase === 'battle').length }));
});
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });
wss.on('connection', (ws) => {
  const st = { room: null, seat: null };
  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(data.toString()); } catch (_) { return; }
    if (!m || typeof m !== 'object') return;
    try { onMessage(ws, m, st); } catch (e) { log('message error', e && e.stack); }
  });
  ws.on('close', () => { if (st.room && st.seat && st.seat.ws === ws) drop(st.room, st.seat); });
  ws.on('error', () => {});
});
// Rooms nobody is in close in the end.
setInterval(() => {
  const now = Date.now();
  for (const R of rooms.values()) {
    const empty = R.seats.every((s) => !s.ws);
    if (!empty) R.emptySince = now;
    else if ((now - R.emptySince) / 1000 > (R.phase === 'battle' ? WAIT_LIMIT + 10 : IDLE_LIMIT)) closeRoom(R, 'idle');
  }
}, 10000);
server.listen(PORT, () => {
  log('Red Horizon server', VERSION, 'listening on', PORT, SUPA.token ? '(reporting to the stats page)' : '(not reporting)');
  beat();
  setInterval(beat, 60000).unref();
});
module.exports = { rooms, server };
