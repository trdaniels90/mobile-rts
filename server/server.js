'use strict';
// Red Horizon's dedicated game server. Players meet in a room (a 4-letter code), and the battle runs
// here instead of on a phone: every phone is a guest that sends its orders and draws the snapshots it
// is sent (src/netcore.js). Each room has its own copy of the game scripts (headless.js).
//
// Battles (BATTLES in src/maps.js): '1v1' (two players), '2v2' (four players, two a side), 'coop' (two
// players together against two computer sides), '3v3' (six players) and 'coop3' (three players against
// three computer sides). A room has up to six slots (sides); players sit in slots, and in co-op the other
// alliance is the computer's. Even slots (0, 2, 4) are one alliance (ally 0), odd slots the other.
// A battle is only offered on maps made for it (battleFits); ANY_BATTLE=1 lifts that, for tests.
//
// The server browser: GET /rooms lists the rooms still in their lobby with a place free (openRooms); a phone joins one
// by its code as before, so the code never has to be typed.
//
// Messages are the same JSON the phones send each other phone to phone (net.js), plus the room ones:
//   phone -> server: { k: 'create', name, v, gid, faction, map } | { k: 'join', code, name, v, gid }
//                    { k: 'lobby', faction, map } (leader, 1 v 1: side 0's faction)
//                    { k: 'setup', mode, map, diff } (leader) | { k: 'faction', slot, faction }
//                    { k: 'team' } (move to the other alliance) | { k: 'go' } (leader)
//                    { k: 'mate', slot } (leader, co-op: an open place on the players' team to the computer and back)
//                    { k: 'saves' } (leader, co-op: list saved battles) | { k: 'load', id } (leader: continue one; id null: a new battle)
//                    { k: 'chat', text, team } | { k: 'mark', x, y } (a map ping, to the sender's team) (chat.js; passed on by relayTalk)
//                    'c' orders | 'ping' | 'away' | 'back' | 'resume' | 'quit' | 'savequit' (co-op: save and leave, for everyone) | 'bye'
//   (create and join also carry pids: the player's ids, a signed-in account's and the phone's, for finding their saves)
//   server -> phone: { k: 'room', code, lead } | { k: 'err', why: 'none' | 'full' | 'version' | 'busy' }
//                    { k: 'lobby', faction, map, mode, diff, host, guest, slots, mine, ready }
//                    { k: 'start', seed, faction, match, map, side, sides, mode, diff }
//                    { k: 'saves', list } | { k: 'saved', by } (the battle was saved and the room closes) | { k: 'err', why: 'save' }
//                    's' snapshots | 'end' | 'pong' | 'away' | 'resume' | 'left' | 'bye'
const http = require('http');
const vm = require('vm');
const { WebSocketServer } = require('ws');
const headless = require('./headless');
const zlib = require('zlib');

const PORT = +process.env.PORT || 8080;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const STEP = 1 / 30;            // simulation step, seconds (the phones step at most this much)
const SNAP = 0.1;               // seconds between snapshots
const SILENT = 6000;            // ms without a word from a phone: it has dropped
const WAIT_LIMIT = +process.env.WAIT_LIMIT || 120;   // seconds to wait for a dropped player
const IDLE_LIMIT = 30 * 60;     // a room nobody is in closes after this long (seconds)
const MAX_ROOMS = +process.env.MAX_ROOMS || 40;
const SPEED = +process.env.SPEED || 1;   // tests only: run battles faster than real time
const ANY_BATTLE = !!process.env.ANY_BATTLE;   // tests: any battle on any map with room for it
const DIFFS = ['easy', 'normal', 'hard'];
const SAVE_EVERY = +process.env.SAVE_EVERY || 120;   // seconds between autosaves of a co-op battle

const base = headless.load();
const VERSION = base.get('VERSION');   // the game version this server runs
const BATTLES = base.get('BATTLES'), MODES = Object.keys(BATTLES);
const fits = (R, mode, map = R.map) => R.ctx.get('battleFits')(map, mode, ANY_BATTLE);
const rooms = new Map();
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------------------------------------------------------------------------
// Reports to the owner's stats page (Supabase, supabase/server.sql): a status beat every minute and a
// row per battle (when it starts and when it ends). Only with the SERVER_TOKEN secret set (Fly secret);
// without it (tests, a local run) nothing is sent.
const STARTED = new Date().toISOString();
const CPU_KIND = process.env.CPU_KIND || null;   // the machine size, as Fly names it
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
// The same, for a function that answers (the saved battles).
function rpcJson(fn, p) {
  return fetch(SUPA.url + 'rest/v1/rpc/' + fn, { method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { apikey: SUPA.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_token: SUPA.token, p }) })
    // coop_save_put and coop_save_drop answer nothing (an empty body): that is success, not a JSON error.
    .then((r) => { if (!r.ok) throw new Error(fn + ' ' + r.status); return r.text(); })
    .then((t) => (t ? JSON.parse(t) : null));
}

// ---------------------------------------------------------------------------
// Saved co-op battles (2 v AI, 3 v AI): supabase/coop-saves.sql, gzipped JSON of the whole battle (save.js),
// about 200 KB. Without the token (tests, a local run) they are kept in memory, until the server stops.
const Saves = (() => {
  const mem = new Map();
  const online = () => !!SUPA.token && typeof fetch === 'function';
  return {
    put: (rec) => (online() ? rpcJson('coop_save_put', rec) : Promise.resolve(mem.set(rec.id, Object.assign({ saved_at: new Date().toISOString() }, rec)))),
    list: (pids) => (online() ? rpcJson('coop_save_list', { pids })
      : Promise.resolve([...mem.values()].filter((r) => r.pids.some((x) => pids.includes(x))).sort((a, b) => (a.saved_at < b.saved_at ? 1 : -1)).slice(0, 8)
        .map(({ id, saved_at, version, mode, map, difficulty, game_t, players }) => ({ id, saved_at, version, mode, map, difficulty, game_t, players })))),
    get: (id) => (online() ? rpcJson('coop_save_get', { id }) : Promise.resolve(mem.get(id) || null)),
    drop: (id) => (online() ? rpcJson('coop_save_drop', { id }).catch(() => null) : Promise.resolve(mem.delete(id))),
    mem,
  };
})();
const isCoop = (R) => !!(BATTLES[R.mode] && BATTLES[R.mode].coop);
// Saves the battle now (co-op only). Resolves true once it is stored.
function saveBattle(R) {
  const G = R.G, B = R.battle;
  if (!isCoop(R) || !G || G.over || !B || !R.saveId) return Promise.resolve(false);
  if (R.saving) return R.saving;
  let text;
  try { text = R.run('SaveGame.freeze(G)'); } catch (e) { noteError(R, 'save', e); return Promise.resolve(false); }
  // Each side as the battle began (who played it), with this phone's id where a player sits there now or did.
  const players = B.sides.map((x, i) => {
    const s = R.seats.find((o) => o.side === i);
    return { faction: x.faction, ally: x.ally, ai: !!x.ai && !x.human, mate: !!x.mate, name: x.name || null, pids: (s && s.pids && s.pids.length ? s.pids : x.pids) || [] };
  });
  const rec = { id: R.saveId, version: VERSION, mode: R.mode, map: B.map, difficulty: B.diff, game_t: Math.round(G.t), players,
    pids: [].concat(...players.map((x) => x.pids)), match: R.match };
  const at = Date.now();
  R.saving = new Promise((res) => zlib.gzip(text, (err, z) => {
    if (err) { res(false); return; }
    rec.state = z.toString('base64');
    Saves.put(rec).then(() => { log(R.code, 'saved', R.saveId, Math.round(rec.state.length / 1024) + ' KB', Date.now() - at, 'ms'); res(true); })
      .catch((e) => { noteError(R, 'save', e); res(false); });
  })).finally(() => { R.saving = null; });
  R.savedAt = Date.now();
  return R.saving;
}

// Step times over the last minute, every battle together (for the status beat).
const stepStat = { n: 0, ms: 0, max: 0 };
// The whole process's CPU use since the last beat, in % of one core (Fly limits a shared CPU to 6.25%).
let cpuMark = { at: process.hrtime.bigint(), use: process.cpuUsage() };
function cpuPct(mark) {
  const now = process.hrtime.bigint(), use = process.cpuUsage(mark.use);
  const wall = Number(now - mark.at) / 1000;   // microseconds
  return wall > 0 ? +((use.user + use.system) / wall * 100).toFixed(1) : null;
}
function beat() {
  const battles = [...rooms.values()].filter((r) => r.phase === 'battle');
  const players = [...rooms.values()].reduce((n, r) => n + r.seats.filter((s) => s.ws).length, 0);
  const p = { version: VERSION, started_at: STARTED, rooms: rooms.size, battles: battles.length, players,
    mem_mb: Math.round(process.memoryUsage().rss / 1048576),
    step_ms: stepStat.n ? +(stepStat.ms / stepStat.n).toFixed(2) : null, step_max_ms: stepStat.n ? +stepStat.max.toFixed(1) : null,
    cpu_pct: cpuPct(cpuMark), cpu: CPU_KIND };
  cpuMark = { at: process.hrtime.bigint(), use: process.cpuUsage() };
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
    snap_max_kb: +(B.snapMax / 1024).toFixed(1), held_s: Math.round(B.heldMs / 1000),
    cpu_pct: cpuPct(B.cpu), cpu_peak_pct: B.cpuPeak, cpu: CPU_KIND };
  const players = B.sides.map((x, i) => {
    const s = R.seats.find((o) => o.side === i);
    return { side: i, ally: x.ally, faction: x.faction, name: x.ai ? null : x.name, ai: !!x.ai, style: (G && G.teams[i] && G.teams[i].isAI && G.teams[i].style) || null, left: !!(s && s.left), took_over: !x.ai && !!(G && G.teams[i] && G.teams[i].isAI) };
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
// A player's ids: a signed-in account's and the phone's (either finds their saves).
const pidsOf = (m) => (Array.isArray(m.pids) ? m.pids : []).filter((x) => typeof x === 'string').map((x) => x.replace(/[^\w-]/g, '').slice(0, 64)).filter(Boolean).slice(0, 2);
const same = (a, b) => !!(a && b && a.some((x) => b.includes(x)));
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
    if (R.saveId) { Saves.drop(R.saveId); R.saveId = null; }   // a battle that is over cannot be continued
    R.battle = null;
    setTimeout(() => backToLobby(R), 0);
  };
  rooms.set(code, R);
  warmDamage(R);
  return R;
}
// The first time a structure type is damaged, the game builds its damaged model (damageSpots), about 0.2 s
// of work that stalls the battle. A new room does them in the background, one every quarter second.
function warmDamage(R) {
  const types = Object.keys(R.ctx.get('BUILD_DEFS'));
  const next = () => {
    if (!rooms.has(R.code) || !types.length) return;
    const t = types.shift();
    try { R.run(`damageSpots(${JSON.stringify(t)}, 'allies')`); } catch (_) {}
    setTimeout(next, 250).unref();
  };
  setTimeout(next, 250).unref();
}
function closeRoom(R, why) {
  clearInterval(R.timer);
  if (R.phase === 'battle' && R.battle && !(R.G && R.G.over)) {
    if (why !== 'saved') saveBattle(R);   // a co-op battle everyone left can still be continued
    reportBattle(R, why === 'saved' ? 'saved' : 'abandoned', null);
  }
  R.battle = null;
  for (const s of R.seats) { send(s.ws, { k: 'bye' }); try { s.ws && s.ws.close(); } catch (_) {} }
  rooms.delete(R.code);
  log(R.code, 'closed:', why, '| rooms', rooms.size);
}

// The slots of a battle. f: alliance 0's faction (alliance 1 gets the other).
function setMode(R, mode, f) {
  f = faction(f || (R.slots && R.slots[0].faction));
  const B = BATTLES[mode], n = B.size * 2;
  const old = R.slots || [];
  R.slots = [];
  for (let i = 0; i < n; i++) {
    const ally = i % 2, ai = !!B.coop && ally === 1;
    R.slots.push({ ally, faction: old[i] && mode !== '1v1' ? old[i].faction : ally ? other(f) : f, ai });
  }
  R.mode = mode;
  // Seat the players again, in the order they came.
  for (const s of R.seats) s.slot = undefined;
  for (const s of R.seats) s.slot = freeSlot(R);
}
// Continue a saved co-op battle: its battle, map, difficulty and sides. Each player sits in the place they had
// (by pid), anyone else in a free one; a place whose player is not here can be given to the computer (mate).
function loadSave(R, rec) {
  R.resume = { id: rec.id, t: rec.game_t || 0, map: rec.map, players: rec.players, state: rec.state, match: rec.match || null };
  R.mode = rec.mode; R.map = rec.map; R.diff = DIFFS.includes(rec.difficulty) ? rec.difficulty : 'normal';
  R.slots = rec.players.map((x) => ({ ally: x.ally, faction: faction(x.faction), ai: !!x.ai, mate: !!x.mate && !!x.ai, had: x.ai ? null : x.name, human: !x.ai, pids: Array.isArray(x.pids) ? x.pids : [] }));
  for (const s of R.seats) s.slot = undefined;
  for (const s of R.seats) { const i = R.slots.findIndex((x, j) => same(s.pids, x.pids) && !x.ai && !R.seats.some((o) => o.slot === j)); if (i >= 0) s.slot = i; }
  for (const s of R.seats) if (s.slot === undefined) s.slot = freeSlot(R);
  // Never leave the leader without a place: they take the first human place (a computer teammate's, if need be).
  if (R.seats[0] && R.seats[0].slot === undefined) {
    const i = R.slots.findIndex((x, j) => x.ally === 0 && (!x.ai || x.mate) && !R.seats.some((o) => o.slot === j));
    if (i >= 0) { R.slots[i].ai = false; R.slots[i].mate = false; R.seats[0].slot = i; }
  }
}
function unloadSave(R) {
  if (!R.resume) return;
  R.resume = null;
  setMode(R, R.mode);
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
    slots: R.slots.map((x, i) => ({ ally: x.ally, faction: x.faction, ai: x.ai, mate: !!x.mate, name: by(i) ? by(i).name : null, had: x.had || null })),
    mine: me ? me.slot : null, players: R.seats.length, ready: ready(R),
    resume: R.resume ? { id: R.resume.id, t: R.resume.t } : null };
}
function sendLobby(R) { for (const s of R.seats) send(s.ws, lobbyMsg(R, s)); }

function start(R) {
  if (R.phase !== 'lobby' || !ready(R) || R.loading) return;
  const rs = R.resume;
  let seed = (Math.random() * 1e9) | 0, match = newId();
  const { ctx, NetCore } = R;
  const seat = (i) => R.seats.find((x) => x.slot === i);
  const name = (i) => { const s = seat(i); return s ? s.name : null; };
  // human: a player's side the computer plays this time (they could not come); it stays theirs in the save.
  const sides = R.slots.map((x, i) => ({ faction: x.faction, ally: x.ally, ai: x.ai, mate: !!x.mate, name: name(i) || (x.ai && x.had) || null,
    human: !!(rs && x.ai && x.human), pids: (seat(i) && seat(i).pids.length ? seat(i).pids : x.pids) || [] }));
  const diff = BATTLES[R.mode].coop ? R.diff : 'normal';
  if (rs) {
    // A saved battle, made again from its save; then each side goes to whoever plays it now.
    try {
      ctx.__save = zlib.gunzipSync(Buffer.from(rs.state, 'base64')).toString();
      R.run(`SaveGame.adopt(__save, mapSize(${JSON.stringify(rs.map)})); delete globalThis.__save; 0`);
    } catch (e) {
      log(R.code, 'saved battle failed to load', e && e.stack);
      for (const s of R.seats) send(s.ws, { k: 'err', why: 'save' });
      unloadSave(R); sendLobby(R);
      return;
    }
    seed = R.G.seed; match = rs.match || match;
    R.G.teams.forEach((t, i) => {
      const x = sides[i];
      if (x.ai) { t.isAI = true; t.auto = true; } else { if (t.isAI) t.auto = false; t.isAI = false; t.name = x.name; }
    });
    R.G.hold = false;
    R.saveId = rs.id;
    R.resume = null;
  } else {
    // Nobody on this copy is "me": every side is a remote player or the computer.
    ctx.get('newWorld')(sides[0].faction, diff, seed, 0, true, R.map, sides);
    for (const t of R.G.teams) if (t.isAI) t.auto = true;
    R.saveId = isCoop(R) ? uuid() : null;
    if (R.saveId) R.G.keepMarks = [];   // the marks of battle, for a save (netcore.js)
  }
  R.match = match;
  R.G.me = -1;   // so every side's announcer lines go out to its player (hooks.evaFor)
  R.savedAt = Date.now();
  NetCore.reset();
  NetCore.hosting = true;
  R.seats.forEach((s) => { s.side = s.slot; s.peer = NetCore.peer(s.side, !!rs); s.away = false; s.left = false; });
  R.phase = 'battle'; R.snapT = 0; R.waitSince = 0; R.held = false; R.last = Date.now();
  R.battle = { id: uuid(), at: new Date().toISOString(), t0: Date.now(), map: R.map, diff, sides, seats: R.seats.length,
    steps: 0, stepMs: 0, stepMax: 0, slow: 0, peak: 0, bytes: 0, snapMax: 0, heldMs: 0, errors: [],
    cpu: { at: process.hrtime.bigint(), use: process.cpuUsage() }, cpuMin: { at: process.hrtime.bigint(), use: process.cpuUsage() }, cpuPeak: 0 };
  reportBattle(R);
  const pub = sides.map(({ faction, ally, ai, mate, name }) => ({ faction, ally, ai, mate, name }));
  R.seats.forEach((s) => send(s.ws, { k: 'start', seed, faction: sides[0].faction, match, map: R.map, side: s.side, sides: pub, mode: R.mode, diff,
    save: R.saveId, resume: rs ? Math.round(R.G.t) : undefined }));
  // A continued battle: its scorch marks, craters and wrecks, for the phones to put on their ground again.
  if (rs) {
    if (!R.G.keepMarks) R.G.keepMarks = [];   // (a save from before marks were kept)
    const marks = JSON.stringify({ k: 'marks', list: R.G.keepMarks });
    R.seats.forEach((s) => send(s.ws, marks));
  }
  clearInterval(R.timer);
  R.timer = setInterval(() => tick(R), Math.round(STEP * 1000 / Math.max(1, SPEED)));
  log(R.code, rs ? 'saved battle continued at ' + Math.round(R.G.t) + ' s:' : 'battle started:', R.mode, sides.map((x) => (x.ai ? 'computer' : x.name) + '/' + x.ally).join(', '), 'on', R.map);
}
function backToLobby(R) {
  clearInterval(R.timer); R.timer = null;
  R.phase = 'lobby';
  R.NetCore.hosting = false;
  R.saveId = null;
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
  // Their battle is over (a loss): send them the battle's log, or their debrief and stats would have no graphs.
  send(s.ws, { k: 'end', over: { winner: otherAlly(s.side), t: G.t, how }, log: R.NetCore.pack(G.log) });
  log(R.code, s.name, how === 'quit' ? 'surrendered' : how === 'out' ? 'was beaten and left' : 'left', ': the computer takes side', s.side);
  const stay = R.seats.some((o) => !o.left && G.teams[o.side].ally === t.ally);
  if (!stay) R.run(`endBattle(${otherAlly(s.side)}, '${how}')`);
}

function tick(R) {
  const now = Date.now(), G = R.G;
  let dt = Math.min(0.25, (now - R.last) / 1000) * SPEED;
  R.last = now;
  if (R.phase !== 'battle' || !G || G.over || R.quitting) return;
  // Phones that have gone quiet have dropped.
  for (const s of R.seats) if (s.ws && now - s.heard > SILENT) { log(R.code, s.name, 'silent: dropped'); drop(R, s); }
  const missing = R.seats.filter((s) => !s.left && (!s.ws || s.away));
  G.hold = missing.length > 0;
  if (G.hold) {
    if (R.battle) R.battle.heldMs += now - (R.lastHold || now);
    R.lastHold = now;
    R.held = true;
    if (!R.waitSince) { R.waitSince = now; if (R.saveId) saveBattle(R); }   // someone dropped: keep the battle as it is now
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
    if (B.steps % 1800 === 0) {   // about a minute: the busiest minute's CPU use
      const c = cpuPct(B.cpuMin); if (c > B.cpuPeak) B.cpuPeak = c;
      B.cpuMin = { at: process.hrtime.bigint(), use: process.cpuUsage() };
    }
  }
  if (R.saveId && now - R.savedAt > SAVE_EVERY * 1000 / SPEED) saveBattle(R);
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

// Chat and map pings between players (src/chat.js): chat to everyone or to the sender's team, pings to the team only,
// with the sender's name and side put on here. At most 12 a player in 10 seconds.
function allyOfSeat(R, s) {
  if (R.phase === 'battle' && R.G && R.G.teams[s.side]) return R.G.teams[s.side].ally;
  const x = R.slots[s.slot];
  return x ? x.ally : -1;
}
function relayTalk(R, s, m) {
  const now = Date.now();
  s.talk = (s.talk || []).filter((t) => now - t < 10000);
  if (s.talk.length >= 12) return;
  s.talk.push(now);
  const team = m.k === 'mark' || !!m.team, ally = allyOfSeat(R, s);
  let out;
  if (m.k === 'chat') {
    const text = String(m.text == null ? '' : m.text).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 160);
    if (!text) return;
    out = { k: 'chat', from: s.name, side: s.side, team, text };
  } else {
    const x = Number(m.x), y = Number(m.y);
    if (!isFinite(x) || !isFinite(y)) return;
    out = { k: 'mark', from: s.name, side: s.side, x: Math.round(x), y: Math.round(y) };
  }
  for (const o of R.seats) if (o !== s && o.ws && !o.left && (!team || allyOfSeat(R, o) === ally)) send(o.ws, out);
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
      const seat = { gid: String(m.gid || newId()), pids: pidsOf(m), name: clean(m.name), ws, heard: Date.now(), slot: 0 };
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
      const pids = pidsOf(m);
      let slot = room.phase === 'lobby' && room.resume ? room.slots.findIndex((x, j) => same(pids, x.pids) && !x.ai && !room.seats.some((o) => o.slot === j)) : -1;
      if (slot < 0) slot = room.phase === 'lobby' ? freeSlot(room) : undefined;
      if (slot === undefined) { send(ws, { k: 'err', why: 'full' }); ws.close(); return; }
      seat = { gid: String(m.gid || newId()), pids, name: clean(m.name), ws, heard: Date.now(), slot };
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
  if (m.k === 'chat' || m.k === 'mark') { relayTalk(R, s, m); return; }
  if (lobby && R.resume && (m.k === 'lobby' || m.k === 'setup' || m.k === 'faction' || m.k === 'team')) { sendLobby(R); return; }   // a saved battle's sides are fixed
  if (m.k === 'saves' && lead && lobby) {
    const pids = [].concat(...R.seats.map((o) => o.pids));
    if (!pids.length) { send(ws, { k: 'saves', list: [] }); return; }
    Saves.list(pids).then((list) => send(ws, { k: 'saves', list: (list || []).filter((x) => BATTLES[x.mode] && BATTLES[x.mode].coop) }))
      .catch((e) => { log(R.code, 'saves list failed', e && e.message); send(ws, { k: 'saves', list: [], failed: true }); });
    return;
  }
  if (m.k === 'load' && lead && lobby) {
    if (!m.id) { unloadSave(R); sendLobby(R); return; }
    R.loading = true;
    Saves.get(String(m.id)).then((rec) => {
      R.loading = false;
      if (!rooms.has(R.code) || R.phase !== 'lobby') return;
      if (!rec || !rec.state || !BATTLES[rec.mode] || !BATTLES[rec.mode].coop || !Array.isArray(rec.players) || rec.players.length !== BATTLES[rec.mode].size * 2
        || R.seats.length > BATTLES[rec.mode].players) { send(ws, { k: 'err', why: 'save' }); return; }
      loadSave(R, rec);
      sendLobby(R);
    }).catch((e) => { R.loading = false; log(R.code, 'load failed', e && e.message); send(ws, { k: 'err', why: 'save' }); });
    return;
  }
  if (m.k === 'savequit' && R.phase === 'battle' && R.saveId && !R.G.over && !s.left) {
    log(R.code, s.name, 'saves and leaves');
    R.quitting = true;
    const done = (ok) => {
      if (!rooms.has(R.code) || R.phase !== 'battle') return;
      if (!ok) { R.quitting = false; send(ws, { k: 'err', why: 'save' }); return; }
      for (const o of R.seats) send(o.ws, { k: 'saved', by: s.name });
      closeRoom(R, 'saved');
    };
    (R.saving || Promise.resolve()).then(() => saveBattle(R)).then(done);
    return;
  }
  if (m.k === 'lobby' && lead && lobby) {
    // (1 v 1, as phone to phone: side 0's faction and the map)
    R.slots[0].faction = faction(m.faction); R.slots[1].faction = other(R.slots[0].faction);
    for (let i = 2; i < R.slots.length; i++) R.slots[i].faction = R.slots[i % 2].faction;
    const map = R.ctx.get('validMap')(m.map);
    if (fits(R, R.mode, map)) R.map = map;
    sendLobby(R);
  } else if (m.k === 'setup' && lead && lobby) {
    // A new map and battle together are checked together; a map the battle does not fit is refused.
    const map = m.map ? R.ctx.get('validMap')(m.map) : R.map;
    if (MODES.includes(m.mode) && m.mode !== R.mode && R.seats.length <= BATTLES[m.mode].players && fits(R, m.mode, map)) setMode(R, m.mode);
    if (m.map && fits(R, R.mode, map)) R.map = map;
    if (DIFFS.includes(m.diff)) R.diff = m.diff;
    sendLobby(R);
  } else if (m.k === 'faction' && lobby) {
    const i = +m.slot, x = R.slots[i];
    if (x && (s.slot === i || (lead && x.ai))) {
      x.faction = faction(m.faction);
      if (R.mode === '1v1') R.slots[1 - i].faction = other(x.faction);
      sendLobby(R);
    }
  } else if (m.k === 'mate' && lead && lobby && BATTLES[R.mode].coop) {
    // Co-op with fewer friends than places: the leader gives an open place on the players' team to a
    // computer teammate (or back to a player). Slot 0 is always the leader's.
    const i = +m.slot, x = R.slots[i];
    if (x && i > 0 && x.ally === 0 && !R.seats.some((o) => o.slot === i)) { x.ai = !x.ai; x.mate = x.ai; sendLobby(R); }
    else if (x && R.resume && x.ally === 0 && !R.seats.some((o) => o.slot === i)) { x.ai = !x.ai; x.mate = x.ai; sendLobby(R); }   // (a saved battle: any open place)
  } else if (m.k === 'team' && lobby && BATTLES[R.mode].size > 1 && !BATTLES[R.mode].coop) {
    const to = freeSlot(R, R.slots[s.slot].ally === 0 ? 1 : 0);
    if (to !== undefined) { s.slot = to; sendLobby(R); }
  } else if (m.k === 'go' && lead) start(R);
  else if (m.k === 'c' && R.phase === 'battle' && !R.G.hold && s.peer && !s.left) R.NetCore.applyCommand(s.side, m);
  else if (m.k === 'away' && R.phase === 'battle') { s.away = true; R.held = true; for (const o of R.seats) if (o !== s) send(o.ws, { k: 'away' }); }
  else if (m.k === 'back' || m.k === 'resume') s.away = false;
  else if (m.k === 'quit' && R.phase === 'battle' && !R.G.over && !s.left) handOver(R, s, m.how === 'out' ? 'out' : 'quit');
  else if (m.k === 'watch' && R.phase === 'battle' && s.peer && R.G.teams[s.side].out) s.peer.watch = true;   // beaten, watching: the whole map
  else if (m.k === 'bye') leave(R, s);
}

// ---------------------------------------------------------------------------
// The server browser (net.js Online): rooms in their lobby with a place free, leader's name first.
function openRooms() {
  const list = [];
  for (const R of rooms.values()) {
    if (R.phase !== 'lobby' || !R.seats.length || R.loading) continue;
    const need = humanSlots(R).length, have = R.seats.length;
    if (have >= need) continue;
    list.push({ code: R.code, name: R.seats[0].name, mode: R.mode, map: R.map, diff: R.diff, players: have, max: need, resume: !!R.resume });
  }
  return list.slice(0, 50);
}
const server = http.createServer((req, res) => {
  if (req.url && req.url.split('?')[0] === '/rooms') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ version: VERSION, rooms: openRooms() }));
    return;
  }
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
module.exports = { rooms, server, Saves };
