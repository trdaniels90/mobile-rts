'use strict';
// Red Horizon's dedicated game server. Players meet in a room (a 4-letter code), and the battle runs
// here instead of on a phone: every phone is a guest that sends its orders and draws the snapshots it
// is sent (src/netcore.js). Each room has its own copy of the game scripts (headless.js).
//
// Messages are the same JSON the phones send each other phone to phone (net.js), plus the room ones:
//   phone -> server: { k: 'create', name, v, gid, faction, map } | { k: 'join', code, name, v, gid }
//                    { k: 'lobby', faction, map } (leader) | { k: 'go' } (leader) | 'c' orders | 'ping'
//                    'away' | 'back' | 'resume' | 'quit' | 'bye'
//   server -> phone: { k: 'room', code, lead } | { k: 'err', why: 'none' | 'full' | 'version' }
//                    { k: 'lobby', faction, map, host: { name }, guest: { name } | null }
//                    { k: 'start', seed, faction, match, map, side } | 's' snapshots | 'end' | 'pong'
//                    'away' | 'resume' | 'bye'
const http = require('http');
const vm = require('vm');
const { WebSocketServer } = require('ws');
const headless = require('./headless');

const PORT = +process.env.PORT || 8080;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const STEP = 1 / 30;            // simulation step, seconds (the phones step at most this much)
const SNAP = 0.1;               // seconds between snapshots
const SILENT = 6000;            // ms without a word from a phone: it has dropped
const WAIT_LIMIT = +process.env.WAIT_LIMIT || 120;   // seconds to wait for a dropped player before they lose
const IDLE_LIMIT = 30 * 60;     // a room nobody is in closes after this long (seconds)
const MAX_ROOMS = +process.env.MAX_ROOMS || 40;
const SPEED = +process.env.SPEED || 1;   // tests only: run battles faster than real time

const VERSION = headless.load().get('VERSION');   // the game version this server runs
const rooms = new Map();
const log = (...a) => console.log(new Date().toISOString(), ...a);

function newCode() {
  for (let n = 0; n < 1000; n++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += LETTERS[(Math.random() * LETTERS.length) | 0];
    if (!rooms.has(c)) return c;
  }
  return null;
}
const newId = () => Math.random().toString(36).slice(2, 10);
const send = (ws, o) => { if (ws && ws.readyState === 1) try { ws.send(typeof o === 'string' ? o : JSON.stringify(o)); } catch (_) {} };
const clean = (s) => String(s || 'Commander').replace(/[\u0000-\u001f]/g, '').slice(0, 20) || 'Commander';

// ---------------------------------------------------------------------------
// A room: seats (index 0 is the leader, who picks the map and sides), and a battle once started.
function makeRoom(code) {
  const ctx = headless.load();
  const run = (s) => vm.runInContext(s, ctx);
  const NetCore = ctx.get('NetCore');
  const R = { code, ctx, run, NetCore, update: ctx.get('update'), get G() { return ctx.get('G'); }, seats: [], phase: 'lobby', faction: 'allies', map: ctx.get('DEFAULT_MAP'), born: Date.now(), emptySince: Date.now(),
    acc: 0, snapT: 0, waitSince: 0, timer: null };
  NetCore.hook();
  NetCore.onOver = () => {
    broadcastSnaps(R, true);
    const end = JSON.stringify(NetCore.endMsg());
    for (const s of R.seats) send(s.ws, end);
    log(code, 'battle over, winner side', R.G.over.winner, R.G.over.how, 'at', Math.round(R.G.t), 's');
    setTimeout(() => backToLobby(R), 0);
  };
  rooms.set(code, R);
  return R;
}
function closeRoom(R, why) {
  clearInterval(R.timer);
  for (const s of R.seats) { send(s.ws, { k: 'bye' }); try { s.ws && s.ws.close(); } catch (_) {} }
  rooms.delete(R.code);
  log(R.code, 'closed:', why, '| rooms', rooms.size);
}
function lobbyMsg(R) {
  const [h, g] = R.seats;
  return { k: 'lobby', faction: R.faction, map: R.map, host: h ? { name: h.name } : null, guest: g ? { name: g.name } : null };
}
function sendLobby(R) { const m = JSON.stringify(lobbyMsg(R)); for (const s of R.seats) send(s.ws, m); }

function start(R) {
  if (R.phase !== 'lobby' || R.seats.length < 2 || R.seats.some((s) => !s.ws)) return;
  const seed = (Math.random() * 1e9) | 0, match = newId();
  R.match = match;
  const { ctx, NetCore } = R;
  // The leader plays side 0. Nobody on this copy is "me": both sides are remote players.
  ctx.get('newWorld')(R.faction, 'normal', seed, 0, true, R.map);
  R.G.me = -1;   // nobody here: every side's announcer lines go out to its player (hooks.evaFor)
  NetCore.reset();
  NetCore.hosting = true;
  R.seats.forEach((s, i) => { s.side = i; s.peer = NetCore.peer(i); s.away = false; });
  R.phase = 'battle'; R.acc = 0; R.snapT = 0; R.waitSince = 0; R.last = Date.now();
  R.seats.forEach((s) => send(s.ws, { k: 'start', seed, faction: R.faction, match, map: R.map, side: s.side }));
  clearInterval(R.timer);
  R.timer = setInterval(() => tick(R), Math.round(STEP * 1000 / Math.max(1, SPEED)));
  log(R.code, 'battle started', R.seats.map((s) => s.name).join(' vs '), 'on', R.map);
}
function backToLobby(R) {
  clearInterval(R.timer); R.timer = null;
  R.phase = 'lobby';
  R.NetCore.hosting = false;
  // Anyone who left during the battle loses their seat now.
  R.seats = R.seats.filter((s) => s.ws);
  if (!R.seats.length) { closeRoom(R, 'empty after battle'); return; }
  sendLobby(R);
}

function broadcastSnaps(R, all) {
  const { NetCore } = R;
  const peers = R.seats.filter((s) => s.ws && s.peer).map((s) => s.peer);
  const bySide = new Map(R.seats.map((s) => [s.peer, s]));
  NetCore.snapshots(peers, (P, snap) => send(bySide.get(P).ws, snap), (P) => all || bySide.get(P).ws.bufferedAmount <= 512 * 1024);
}

function tick(R) {
  const now = Date.now(), G = R.G;
  let dt = Math.min(0.25, (now - R.last) / 1000) * SPEED;
  R.last = now;
  if (R.phase !== 'battle' || !G || G.over) return;
  // Phones that have gone quiet have dropped.
  for (const s of R.seats) if (s.ws && now - s.heard > SILENT) { log(R.code, s.name, 'silent: dropped'); drop(R, s); }
  const missing = R.seats.filter((s) => !s.ws || s.away);
  G.hold = missing.length > 0;
  if (G.hold) {
    R.held = true;
    if (!R.waitSince) R.waitSince = now;
    if ((now - R.waitSince) / 1000 > WAIT_LIMIT) {
      // Waited long enough: whoever stayed wins.
      const stayed = R.seats.find((s) => s.ws && !s.away);
      G.hold = false;
      R.run(`endBattle(${stayed ? stayed.side : missing[0].side === 0 ? 1 : 0}, 'left')`);
    }
    return;
  }
  if (R.held) { R.held = false; R.waitSince = 0; for (const s of R.seats) send(s.ws, { k: 'resume' }); }
  try {
    while (dt > 0) { const step = Math.min(dt, STEP); dt -= step; R.update(step); }
  } catch (e) { log(R.code, 'update error', e && e.stack); }
  if ((R.snapT -= STEP * SPEED) <= 0) {
    R.snapT = SNAP;
    try { broadcastSnaps(R); } catch (e) { log(R.code, 'snapshot error', e && e.stack); }
  }
}

// A phone's connection went away. In a battle its seat is kept for it to come back.
function drop(R, s) {
  const ws = s.ws;
  s.ws = null;
  try { ws && ws.close(); } catch (_) {}
  if (R.phase === 'battle') {
    R.held = true;
    for (const o of R.seats) if (o !== s) send(o.ws, { k: 'away' });
    return;
  }
  R.seats = R.seats.filter((x) => x !== s);
  if (!R.seats.length) { closeRoom(R, 'empty'); return; }
  sendLobby(R);
}
function leave(R, s) {
  if (R.phase === 'battle' && !R.G.over) {
    // Leaving a battle is surrendering.
    s.left = true;
    R.run(`endBattle(${s.side === 0 ? 1 : 0}, 'quit')`);
  }
  if (R.seats[0] === s && R.phase === 'lobby') { closeRoom(R, 'leader left'); return; }
  s.ws = null;
  if (R.phase === 'lobby') { R.seats = R.seats.filter((x) => x !== s); if (!R.seats.length) closeRoom(R, 'empty'); else sendLobby(R); }
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
      room.faction = m.faction === 'soviets' ? 'soviets' : 'allies';
      room.map = room.ctx.get('validMap')(m.map);
      const seat = { gid: String(m.gid || newId()), name: clean(m.name), ws, heard: Date.now() };
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
      if (seat) {
        if (seat.ws && seat.ws !== ws) try { seat.ws.close(); } catch (_) {}
        seat.ws = ws; seat.heard = Date.now(); seat.away = false;
        st.room = room; st.seat = seat;
        send(ws, { k: 'room', code: room.code, lead: room.seats[0] === seat });
        sendLobby(room);
        if (room.phase === 'battle' && seat.peer) {
          seat.peer = room.NetCore.peer(seat.side, true);   // a full snapshot to start its copy afresh
        }
        log(room.code, seat.name, 'is back');
        return;
      }
      if (room.phase !== 'lobby' || room.seats.length >= 2) { send(ws, { k: 'err', why: 'full' }); ws.close(); return; }
      seat = { gid: String(m.gid || newId()), name: clean(m.name), ws, heard: Date.now() };
      room.seats.push(seat);
      st.room = room; st.seat = seat;
      send(ws, { k: 'room', code: room.code, lead: false });
      sendLobby(room);
      log(room.code, seat.name, 'joined');
    }
    return;
  }
  s.heard = Date.now();
  const lead = R.seats[0] === s;
  if (m.k === 'lobby' && lead && R.phase === 'lobby') {
    R.faction = m.faction === 'soviets' ? 'soviets' : 'allies';
    R.map = R.ctx.get('validMap')(m.map);
    sendLobby(R);
  } else if (m.k === 'go' && lead) start(R);
  else if (m.k === 'c' && R.phase === 'battle' && !R.G.hold && s.peer) R.NetCore.applyCommand(s.side, m);
  else if (m.k === 'away' && R.phase === 'battle') { s.away = true; R.held = true; for (const o of R.seats) if (o !== s) send(o.ws, { k: 'away' }); }
  else if (m.k === 'back' || m.k === 'resume') s.away = false;
  else if (m.k === 'quit' && R.phase === 'battle' && !R.G.over) R.run(`endBattle(${s.side === 0 ? 1 : 0}, 'quit')`);
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
server.listen(PORT, () => log('Red Horizon server', VERSION, 'listening on', PORT));
module.exports = { rooms, server };
