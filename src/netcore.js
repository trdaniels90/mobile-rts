'use strict';
// The host side of an online battle, shared by a hosting phone (net.js) and the dedicated server
// (server/server.js). Whoever runs the battle keeps one "peer" per remote player and several times
// a second sends each of them what changed that they are allowed to see (a snapshot). Their orders
// come back as commands and are carried out for their own side only.
const NetCore = (() => {
  const ORE_EVERY = 5;         // ore changes go out with every fifth snapshot
  let hosting = false;         // true while this copy runs a battle for remote players
  let onOver = null;           // called when the battle ends (to send the result)

  // ---------------------------------------------------------------------------
  // Encoding: entity references become { $e: id }, numbers are rounded, rules and canvases stay home.
  const isEnt = (v) => v && typeof v === 'object' && v.def !== undefined && v.id !== undefined && !!v.kind;
  const round = (v) => Math.round(v * 100) / 100;
  // Unit and structure rules travel by name: { $d: ['u' or 'b', type] }.
  const DEF_OF = new Map();
  for (const t in UNIT_DEFS) DEF_OF.set(UNIT_DEFS[t], ['u', t]);
  for (const t in BUILD_DEFS) DEF_OF.set(BUILD_DEFS[t], ['b', t]);
  const defOf = (d) => (d[0] === 'u' ? UNIT_DEFS : BUILD_DEFS)[d[1]];
  const isCanvas = (v) => (typeof HTMLCanvasElement !== 'undefined' && v instanceof HTMLCanvasElement) || (v && typeof v.getContext === 'function');
  function rep(k, v) {
    if (k === 'sent' || k === 'path' || k === '_to') return undefined;
    if (DEF_OF.has(v)) return { $d: DEF_OF.get(v) };
    if (typeof v === 'number') return round(v);
    if (v && typeof v === 'object') {
      if (isEnt(v) && k !== '') return { $e: v.id };
      if (isCanvas(v)) return undefined;
      if (ArrayBuffer.isView(v)) return Array.from(v, round);
    }
    return v;
  }
  const pack = (v) => JSON.parse(JSON.stringify(v, rep) || 'null');
  function unpack(v) {
    if (!v || typeof v !== 'object') return v;
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = unpack(v[i]); return v; }
    if (v.$e !== undefined) return G.byId.get(v.$e) || null;
    if (v.$d !== undefined) return defOf(v.$d);
    for (const k in v) v[k] = unpack(v[k]);
    return v;
  }

  // ---------------------------------------------------------------------------
  // Fields a remote player never needs: the host's own timers and bookkeeping. `anim` (the walk
  // cycle) the remote copy keeps itself.
  const SKIP = new Set(['def', 'path', 'pathIdx', 'needPath', 'lastX', 'lastY', 'stuckN', 'stuckT', 'think', 'cd', 'cd2', 'sent',
    'smokeT', 'revealT', 'dmgSeen', 'dmgHp', 'dropT', 'dmgFxT', 'popK', 'popHold', 'anim', 'htimer', 'hcell', 'crowdT', 'nearBest', 'clankT', 'final', 'roll', 'rollTo', 'fireT', 'shotAt', 'twinNext', 'twinTarget', 'plumeT', 'flareT']);   // fireT: the copy lights the flash itself from `shots`
  const COARSE = new Set(['x', 'y', 'alt']);   // to a tenth of a pixel
  const OBJ = '\u0000';   // marks an object field, kept as JSON for comparing
  function field(v) {
    if (typeof v === 'number') return round(v);
    if (v === null || typeof v !== 'object') return v;
    if (isEnt(v)) return OBJ + JSON.stringify({ $e: v.id });
    return OBJ + JSON.stringify(v, rep);
  }
  // What a remote sidebar and debrief use of each side.
  const TEAM = ['id', 'faction', 'isAI', 'ally', 'credits', 'power', 'low', 'auto', 'assist', 'waiting', 'queues', 'stats', 'powers', 'name', 'out'];
  const teamJSON = (t) => JSON.stringify(Object.fromEntries(TEAM.map((k) => [k, k === 'credits' ? Math.round(t[k]) : t[k]])), rep);

  // A remote player: side is the side they command. full: the next snapshot carries everything and
  // their copy starts afresh (after a reconnect).
  function peer(side, resync) {
    const p = { side, sent: new Map(), fogSent: new Uint8Array(NCELLS), oreSent: new Uint16Array(NCELLS), gemSent: new Uint8Array(NCELLS),
      teamSent: [], snapN: 0, full: !!resync };
    if (resync) p.oreSent.fill(0xffff);
    return p;
  }
  // What a side shares with: its own fog and units, and (in a team game) its allies'.
  const fogOf = (side) => G.fog[side];
  let ALL = null;
  const friendly = (team, side) => team === side || (typeof alliedSides === 'function' && alliedSides(team, side));

  // A remote player only needs what they can see: no news of the other sides, or of smoke, shots
  // and sounds, out in ground they have not uncovered. (A unit leaving their sight still gets the
  // snapshot that takes it out of sight.) Nothing is lost: what was held back goes out once uncovered.
  function snapshot(P, fx, ev) {
    const fog = fogOf(P.side);
    const view = P.watch ? (ALL && ALL.length === NCELLS ? ALL : (ALL = new Uint8Array(NCELLS).fill(1))) : fog;   // a beaten player watching sees everything
    const seen = (x, y) => !!view[cellOfPos(x, y)];
    function shown(x, last) {
      if (friendly(x.team, P.side)) return true;
      if (x.kind === 'bld' && camoHidden(x, P.side) && !last) return false;   // a camouflaged structure is not mentioned until it gives itself away
      if (x.kind === 'bld') return seen(x.cx * CELL + 1, x.cy * CELL + 1) || seen((x.cx + x.w) * CELL - 1, (x.cy + x.h) * CELL - 1);
      return seen(x.x, x.y) || (last && typeof last.x === 'number' && seen(last.x, last.y));
    }
    const e = {}, r = [], sent = P.sent;
    for (const x of G.entities) {
      if (!x.alive) continue;
      let last = sent.get(x.id), out = null;
      if (!shown(x, last)) continue;
      if (!last) sent.set(x.id, (last = {}));
      for (const k in x) {
        if (SKIP.has(k)) continue;
        const v = COARSE.has(k) && typeof x[k] === 'number' ? Math.round(x[k] * 10) / 10 : field(x[k]);
        if (last[k] === v) continue;
        last[k] = v;
        (out || (out = {}))[k] = typeof v === 'string' && v[0] === OBJ ? JSON.parse(v.slice(1) || 'null') : v;
      }
      for (const k in last) if (!(k in x)) { delete last[k]; (out || (out = {}))[k] = null; }
      if (out) e[x.id] = out;
    }
    for (const id of sent.keys()) { const x = G.byId.get(id); if (!x || !x.alive) { r.push(id); sent.delete(id); } }
    const s = { k: 's', t: round(G.t), e, r, p: G.projectiles.filter((p) => !p.dead && seen(p.x, p.y)).map(pack) };
    if (P.full) { s.full = true; P.full = false; }
    const near = fx.filter((f) => typeof f.x !== 'number' || seen(f.x, f.y));
    if (near.length) s.fx = near.map(pack);
    // Sounds and shakes where seen; announcer lines for this player only.
    const mine = ev.filter((v) => (v[0] === 's' ? seen(v[2], v[3]) : v[0] === 'k' ? seen(v[1], v[2]) : v[0] === 'e' ? v[2] === P.side : true));
    if (mine.length) s.ev = mine.map((v) => (v[0] === 'e' ? ['e', v[1]] : v));
    // Their own side (and allies) whenever it changes; the others now and then.
    for (let i = 0; i < G.teams.length; i++) {
      if (!friendly(i, P.side) && P.snapN % 20 && !G.over && s.full !== true) continue;
      const tm = teamJSON(G.teams[i]);
      if (tm === P.teamSent[i]) continue;
      (s.tm || (s.tm = []))[i] = JSON.parse(tm); P.teamSent[i] = tm;
    }
    const f = [];
    for (let i = 0; i < NCELLS; i++) if (fog[i] && !P.fogSent[i]) { P.fogSent[i] = 1; f.push(i); }
    if (f.length) s.fog = f;
    if (P.snapN++ % ORE_EVERY === 0) {
      const o = [];
      for (let i = 0; i < NCELLS; i++) if ((G.ore[i] !== P.oreSent[i] || G.gem[i] !== P.gemSent[i]) && view[i]) { P.oreSent[i] = G.ore[i]; P.gemSent[i] = G.gem[i]; o.push(i, G.ore[i], G.gem[i]); }
      if (o.length) s.ore = o;
    }
    // The debrief's log as it grows (a sample every 15 s), so a phone that has to end the battle on its own
    // (it could not reconnect) still has its graphs. Each list goes from where this player's copy is.
    const L = G.log, ls = P.logSent || (P.logSent = [0, 0, 0]);
    if (L.samples.length > ls[0] || L.events.length > ls[1] || L.fallen.length > ls[2]) {
      s.log = { at: ls.slice(), s: L.samples.slice(ls[0]), e: L.events.slice(ls[1]), f: L.fallen.slice(ls[2]).map(pack), w: L.waves };
      P.logSent = [L.samples.length, L.events.length, L.fallen.length];
    }
    if (G.over) s.over = { winner: G.over.winner, t: round(G.over.t) };
    return s;
  }
  // One round of snapshots: send(peer, snapshot) for each peer that can take one now (ready(peer)).
  // Effects and events since the last round go to every peer at once, then are forgotten.
  function snapshots(peers, send, ready = () => true) {
    const fx = G.effects.filter((f) => !f.sent);
    for (const f of fx) f.sent = true;
    const ev = events; events = [];
    for (const P of peers) if (ready(P)) send(P, snapshot(P, fx, ev));
  }

  // What the battle sets off that a remote copy cannot work out: sounds, shakes, marks on the
  // ground and announcer lines. (Ones set off by eye candy the remote copy runs itself are left
  // out: G.inFx.)
  let events = [];
  const queueEv = (ev) => { if (hosting && G && !G.inFx && events.length < 400) events.push(ev); };
  const DECALS = ['scorch', 'crater', 'rubble', 'bakeWreck', 'bibDecal', 'padDecal'];
  const ORIG = {};
  const root = typeof window !== 'undefined' ? window : globalThis;
  for (const n of DECALS) {
    ORIG[n] = root[n];
    root[n] = function (...a) {
      if (hosting) queueEv(['d', n, a.map((v) => (v === G.tctx ? { $c: 't' } : v === G.dctx ? { $c: 'd' } : pack(v)))]);
      return ORIG[n].apply(this, a);
    };
  }
  let hooked = false;
  function hook() {
    if (hooked) return;
    hooked = true;
    const sfx = hooks.sfx, shake = hooks.shake, over = hooks.gameOver, evaFor = hooks.evaFor;
    hooks.sfx = (n, x, y) => { queueEv(['s', n, Math.round(x), Math.round(y)]); sfx(n, x, y); };
    hooks.shake = (x, y, a) => { queueEv(['k', Math.round(x), Math.round(y), round(a)]); shake(x, y, a); };
    hooks.evaFor = (side, msg) => { if (hosting && events.length < 400) events.push(['e', msg, side]); evaFor(side, msg); };
    hooks.gameOver = (won) => { if (hosting && onOver) onOver(); over(won); };
  }
  const endMsg = () => ({ k: 'end', over: { winner: G.over.winner, t: G.over.t, how: G.over.how }, log: pack(G.log) });
  function reset() { events = []; }

  // ---------------------------------------------------------------------------
  // Orders from a remote player, for their own side only.
  const COMMANDS = ['commandMove', 'commandAttack', 'commandHunt', 'commandGuard', 'commandStop', 'startProduction', 'cancelProduction',
    'placeStructure', 'launchPower', 'deployFob', 'setAuto', 'setAssist', 'recallAlly', 'setRepair', 'sellStructure', 'commandRepair', 'sendCredits'];
  const ORIGC = {};
  for (const f of COMMANDS) ORIGC[f] = root[f];
  function applyCommand(side, m) {
    if (!m || !COMMANDS.includes(m.f) || !Array.isArray(m.a)) return;
    const un = (v) => (Array.isArray(v) ? v.map(un).filter((x) => x !== null) : v && typeof v === 'object' ? (v.$t !== undefined ? G.teams[side] : v.$e !== undefined ? G.byId.get(v.$e) || null : null) : v);
    const a = m.a.map(un);
    const mine = (e) => e && e.alive && e.team === side;
    if (Array.isArray(a[0])) a[0] = a[0].filter(mine);                     // units: only their own
    else if (a[0] && a[0].kind && !mine(a[0])) return;                      // one unit or structure: their own
    else if (a[0] && a[0].queues && a[0] !== G.teams[side]) return;
    if (m.f === 'commandAttack' && !(a[1] && a[1].alive)) return;
    try { ORIGC[m.f](...a); } catch (_) {}
  }

  return {
    peer, snapshots, hook, reset, applyCommand, endMsg, pack, unpack, round, isEnt, ORIG, ORIGC, COMMANDS,
    get hosting() { return hosting; }, set hosting(v) { hosting = !!v; },
    set onOver(f) { onOver = f; },
  };
})();
if (typeof module !== 'undefined') module.exports = NetCore;
