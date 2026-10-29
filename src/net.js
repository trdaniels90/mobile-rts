'use strict';
// Online play (PvP), host-runs-the-battle. Both phones build the same map from the same seed. The
// host's phone runs the whole battle with the guest as the other side, and several times a second
// sends what changed (a snapshot). The guest's phone draws those snapshots, smoothing movement in
// between, runs the eye candy itself (smoke, debris, bodies) and sends its taps to the host as orders.
//
// Players meet with a 4-letter room code over Supabase Realtime (signalling only: a few messages
// per match), then talk phone to phone over a WebRTC data channel.
const Net = (() => {
  const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
  const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const SNAP = 0.1;            // seconds between snapshots
  const ORE_EVERY = 5;         // ore changes go out with every fifth snapshot
  const CHUNK = 16000;         // the largest piece sent at once (every browser takes 16 KB)
  const CONNECT_TIMEOUT = 25000;

  let role = null;             // 'host' or 'guest' once a battle has started; null otherwise
  let link = null;             // the connection: { pc, dc, sig }
  let lobby = null;            // { code, host: { name, faction }, guest: { name }, me: 'host' | 'guest' }
  let listener = () => {};     // the online page's redraw
  const peerSide = () => (role === 'host' ? 1 : 0);   // the host plays side 0, the guest side 1

  // ---------------------------------------------------------------------------
  // Signalling: a Supabase Realtime broadcast channel per room code (Phoenix protocol, by hand).
  function signal(code, onMsg) {
    const url = SUPABASE.url.replace(/^http/, 'ws') + 'realtime/v1/websocket?apikey=' + encodeURIComponent(SUPABASE.key) + '&vsn=1.0.0';
    const topic = 'realtime:pvp-' + code;
    let ref = 1, joined = false, beat = null, closed = false;
    const queue = [];
    const ws = new WebSocket(url);
    const raw = (o) => { try { ws.send(JSON.stringify(o)); } catch (_) {} };
    ws.onopen = () => {
      raw({ topic, event: 'phx_join', payload: { config: { broadcast: { self: false }, presence: { key: '' }, private: false } }, ref: '1', join_ref: '1' });
      beat = setInterval(() => raw({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) }), 25000);
    };
    ws.onmessage = (m) => {
      let d;
      try { d = JSON.parse(m.data); } catch (_) { return; }
      if (d.event === 'phx_reply' && d.ref === '1') { joined = true; while (queue.length) send(...queue.shift()); }
      else if (d.event === 'broadcast' && d.payload) onMsg(d.payload.event, d.payload.payload || {});
    };
    ws.onclose = () => { clearInterval(beat); if (!closed) onMsg('signal-lost', {}); };
    function send(event, payload) {
      if (!joined) { queue.push([event, payload]); return; }
      raw({ topic, event: 'broadcast', payload: { type: 'broadcast', event, payload }, ref: String(++ref), join_ref: '1' });
    }
    return { send, close() { closed = true; clearInterval(beat); try { ws.close(); } catch (_) {} } };
  }

  // ---------------------------------------------------------------------------
  // The data channel: JSON messages, cut into pieces when large. It is ordered and reliable,
  // so pieces arrive whole and in turn.
  let partBuf = '';
  function send(o) {
    const dc = link && link.dc;
    if (!dc || dc.readyState !== 'open') return false;
    const s = JSON.stringify(o);
    try {
      if (s.length <= CHUNK) dc.send(s);
      else for (let i = 0; i < s.length; i += CHUNK) dc.send((i + CHUNK >= s.length ? '\u0002' : '\u0001') + s.slice(i, i + CHUNK));
    } catch (_) { return false; }
    return true;
  }
  function receive(data) {
    if (typeof data !== 'string') return;
    const c = data.charCodeAt(0);
    if (c === 1) { partBuf += data.slice(1); return; }
    if (c === 2) { data = partBuf + data.slice(1); partBuf = ''; }
    let m;
    try { m = JSON.parse(data); } catch (_) { return; }
    onMessage(m);
  }
  function wire(dc) {
    link.dc = dc;
    const opened = () => {
      clearTimeout(link.timer);
      if (link.sig) { link.sig.close(); link.sig = null; }   // Realtime is only for the introduction
      lobby.connected = true;
      send({ k: 'hi', name: myName(), v: VERSION });
      if (lobby.me === 'host') send({ k: 'lobby', faction: lobby.host.faction });
      listener();
    };
    dc.onmessage = (e) => receive(e.data);
    dc.onclose = () => lost();
    if (dc.readyState === 'open') opened(); else dc.onopen = opened;   // (the guest's may arrive open)
  }
  function peer() {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    link.pc = pc;
    link.pending = [];
    pc.onicecandidate = (e) => { if (e.candidate && link.sig) link.sig.send('ice', { to: link.to, from: link.id, c: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') lost(); };
    return pc;
  }
  async function remote(sdp) {
    await link.pc.setRemoteDescription(sdp);
    for (const c of link.pending.splice(0)) link.pc.addIceCandidate(c).catch(() => {});
  }
  function candidate(c) {
    if (!link.pc || !link.pc.remoteDescription) link.pending.push(c);
    else link.pc.addIceCandidate(c).catch(() => {});
  }
  const myName = () => (typeof Account !== 'undefined' && Account.name) || 'Commander';
  const newId = () => Math.random().toString(36).slice(2, 10);

  function host(faction) {
    leave();
    let code = '';
    for (let i = 0; i < 4; i++) code += LETTERS[(Math.random() * LETTERS.length) | 0];
    lobby = { code, me: 'host', host: { name: myName(), faction }, guest: null, connected: false, status: 'waiting' };
    link = { id: newId(), to: null };
    link.sig = signal(code, async (ev, p) => {
      if (ev === 'signal-lost') { if (!lobby.connected) fail('No connection. Check it and try again.'); return; }
      if (ev === 'hello') {
        if (link.to && link.to !== p.from) { link.sig.send('full', { to: p.from }); return; }
        if (p.v !== VERSION) { link.sig.send('version', { to: p.from, v: VERSION }); return; }
        if (link.to) return;
        link.to = p.from;
        lobby.status = 'connecting'; listener();
        const pc = peer();
        wire(pc.createDataChannel('game', { ordered: true }));
        await pc.setLocalDescription(await pc.createOffer());
        link.sig.send('offer', { to: link.to, from: link.id, sdp: pc.localDescription.toJSON() });
        link.timer = setTimeout(() => { if (!lobby.connected) fail('Could not connect to your friend. Try again, or try another network.'); }, CONNECT_TIMEOUT);
      } else if (p.to === link.id && p.from === link.to) {
        if (ev === 'answer') await remote(p.sdp).catch(() => fail('Could not connect.'));
        else if (ev === 'ice') candidate(p.c);
      }
    });
    listener();
  }
  function join(code) {
    leave();
    code = String(code).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    lobby = { code, me: 'guest', host: null, guest: { name: myName() }, connected: false, status: 'joining' };
    link = { id: newId(), to: null };
    link.sig = signal(code, async (ev, p) => {
      if (ev === 'signal-lost') { if (!lobby.connected) fail('No connection. Check it and try again.'); return; }
      if (p.to !== link.id) return;
      if (ev === 'full') fail('That game already has two players.');
      else if (ev === 'version') fail('Your friend has a different version of the game. Both of you restart the game to update, then try again.');
      else if (ev === 'offer' && !link.to) {
        link.to = p.from;
        lobby.status = 'connecting'; listener();
        const pc = peer();
        pc.ondatachannel = (e) => wire(e.channel);
        await remote(p.sdp).catch(() => fail('Could not connect.'));
        await pc.setLocalDescription(await pc.createAnswer());
        link.sig.send('answer', { to: link.to, from: link.id, sdp: pc.localDescription.toJSON() });
      } else if (ev === 'ice' && p.from === link.to) candidate(p.c);
    });
    link.sig.send('hello', { from: link.id, name: myName(), v: VERSION });
    // Nobody answering: a wrong code, or the host has gone.
    link.timer = setTimeout(() => { if (!lobby.connected) fail(link.to ? 'Could not connect to your friend. Try again, or try another network.' : `No game found with the code ${code}. Check it with your friend.`); }, link.to ? CONNECT_TIMEOUT : 10000);
    listener();
  }
  function fail(msg) { const code = lobby && lobby.code; close(); lobby = { failed: msg, code }; listener(); }
  function close() {
    if (!link) return;
    clearTimeout(link.timer);
    if (link.sig) link.sig.close();
    try { link.dc && link.dc.close(); } catch (_) {}
    try { link.pc && link.pc.close(); } catch (_) {}
    link = null;
  }
  function leave() { if (link && link.dc && link.dc.readyState === 'open') send({ k: 'bye' }); const was = role; close(); lobby = null; role = null; if (was && G) G.remote = false; }
  function lost() {
    if (!link) return;
    close();
    if (role && G && !G.over) { role = null; G.remote = false; UIBridge.lost(); }
    role = null;
    lobby = { failed: 'The connection to your friend was lost.' };
    listener();
  }

  // ---------------------------------------------------------------------------
  // Lobby and start.
  function swapSides() {
    if (!lobby || lobby.me !== 'host') return;
    lobby.host.faction = lobby.host.faction === 'allies' ? 'soviets' : 'allies';
    send({ k: 'lobby', faction: lobby.host.faction });
    listener();
  }
  function startBattle() {
    if (!lobby || lobby.me !== 'host' || !lobby.connected || !lobby.guest) return;
    const seed = (Math.random() * 1e9) | 0;
    send({ k: 'start', seed, faction: lobby.host.faction });
    begin('host', seed, lobby.host.faction);
  }
  function begin(r, seed, hostFaction) {
    role = r;
    resetHost();
    const guestFaction = hostFaction === 'allies' ? 'soviets' : 'allies';
    const opp = r === 'host' ? lobby.guest.name : lobby.host.name;
    UIBridge.start({ seed, faction: r === 'host' ? hostFaction : guestFaction, me: r === 'host' ? 0 : 1, opponent: opp });
    if (r === 'guest') {
      // The battle is the host's: start from an empty field and fill it from the snapshots.
      G.remote = true;
      G.entities = []; G.byId.clear(); G.bld.fill(0); G.resv.fill(0); G.effects = []; G.projectiles = [];
    }
    listener();
  }

  function onMessage(m) {
    if (m.k === 'hi') {
      if (lobby.me === 'host') lobby.guest = { name: String(m.name || 'Commander').slice(0, 20) };
      else lobby.host = Object.assign(lobby.host || { faction: 'allies' }, { name: String(m.name || 'Commander').slice(0, 20) });
      listener();
    } else if (m.k === 'lobby' && lobby.me === 'guest') { lobby.host = Object.assign(lobby.host || { name: 'Commander' }, { faction: m.faction }); listener(); }
    else if (m.k === 'start' && lobby.me === 'guest') begin('guest', m.seed, m.faction);
    else if (m.k === 's' && role === 'guest') applySnapshot(m);
    else if (m.k === 'end' && role === 'guest') applyEnd(m);
    else if (m.k === 'c' && role === 'host') applyCommand(m);
    else if (m.k === 'bye') lost();
  }

  // ---------------------------------------------------------------------------
  // Encoding: entity references become { $e: id }, numbers are rounded, rules and canvases stay home.
  const isEnt = (v) => v && typeof v === 'object' && v.def !== undefined && v.id !== undefined && !!v.kind;
  const round = (v) => Math.round(v * 100) / 100;
  // Unit and structure rules travel by name: { $d: ['u' or 'b', type] }.
  const DEF_OF = new Map();
  for (const t in UNIT_DEFS) DEF_OF.set(UNIT_DEFS[t], ['u', t]);
  for (const t in BUILD_DEFS) DEF_OF.set(BUILD_DEFS[t], ['b', t]);
  const defOf = (d) => (d[0] === 'u' ? UNIT_DEFS : BUILD_DEFS)[d[1]];
  function rep(k, v) {
    if (k === 'sent' || k === 'path' || k === '_to') return undefined;
    if (DEF_OF.has(v)) return { $d: DEF_OF.get(v) };
    if (typeof v === 'number') return round(v);
    if (v && typeof v === 'object') {
      if (isEnt(v) && k !== '') return { $e: v.id };
      if (typeof HTMLCanvasElement !== 'undefined' && v instanceof HTMLCanvasElement) return undefined;
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
  // Host: what changed since the last snapshot.
  // Fields the guest never needs: the host's own timers and bookkeeping. `anim` (the walk cycle)
  // the guest keeps itself.
  const SKIP = new Set(['def', 'path', 'pathIdx', 'needPath', 'lastX', 'lastY', 'stuckN', 'stuckT', 'think', 'cd', 'cd2', 'sent',
    'smokeT', 'anim', 'htimer', 'hcell', 'crowdT', 'nearBest', 'clankT']);
  const COARSE = new Set(['x', 'y', 'alt']);   // to a tenth of a pixel
  const OBJ = '\u0000';   // marks an object field, kept as JSON for comparing
  let sent, fogSent, oreSent, gemSent, teamSent, events, snapT, snapN;
  function resetHost() {
    sent = new Map(); fogSent = new Uint8Array(NCELLS); oreSent = new Uint16Array(NCELLS); gemSent = new Uint8Array(NCELLS);
    teamSent = ['', '']; events = []; snapT = 0; snapN = 0;
  }
  resetHost();
  function field(v) {
    if (typeof v === 'number') return round(v);
    if (v === null || typeof v !== 'object') return v;
    if (isEnt(v)) return OBJ + JSON.stringify({ $e: v.id });
    return OBJ + JSON.stringify(v, rep);
  }
  // What the guest's sidebar and debrief use of each side.
  const TEAM = ['id', 'faction', 'isAI', 'credits', 'power', 'low', 'auto', 'waiting', 'queues', 'stats', 'powers'];
  const teamJSON = (t) => JSON.stringify(Object.fromEntries(TEAM.map((k) => [k, k === 'credits' ? Math.round(t[k]) : t[k]])), rep);
  function snapshot() {
    const e = {}, r = [];
    for (const x of G.entities) {
      if (!x.alive) continue;
      let last = sent.get(x.id), out = null;
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
    const s = { k: 's', t: round(G.t), e, r, p: G.projectiles.filter((p) => !p.dead).map(pack) };
    const fx = G.effects.filter((f) => !f.sent);
    for (const f of fx) f.sent = true;
    if (fx.length) s.fx = fx.map(pack);
    if (events.length) { s.ev = events; events = []; }
    // The guest's own side whenever it changes; the host's side now and then.
    for (let i = 0; i < 2; i++) {
      if (i !== peerSide() && snapN % 20 && !G.over) continue;
      const tm = teamJSON(G.teams[i]);
      if (tm === teamSent[i]) continue;
      (s.tm || (s.tm = []))[i] = JSON.parse(tm); teamSent[i] = tm;
    }
    const fog = G.fog[peerSide()], f = [];
    for (let i = 0; i < NCELLS; i++) if (fog[i] && !fogSent[i]) { fogSent[i] = 1; f.push(i); }
    if (f.length) s.fog = f;
    if (snapN++ % ORE_EVERY === 0) {
      const o = [];
      for (let i = 0; i < NCELLS; i++) if (G.ore[i] !== oreSent[i] || G.gem[i] !== gemSent[i]) { oreSent[i] = G.ore[i]; gemSent[i] = G.gem[i]; o.push(i, G.ore[i], G.gem[i]); }
      if (o.length) s.ore = o;
    }
    if (G.over) s.over = { winner: G.over.winner, t: round(G.over.t) };
    return s;
  }
  function hostTick(dt) {
    if (role !== 'host' || !link || !link.dc) return;
    if ((snapT -= dt) > 0) return;
    snapT = SNAP;
    if (link.dc.bufferedAmount > 512 * 1024) return;   // a slow link: skip one rather than pile up
    send(snapshot());
  }
  // What the host's battle sets off that the guest cannot work out: sounds, shakes, marks on the
  // ground and the guest's own announcer lines. (Ones set off by eye candy the guest runs itself
  // are left out: G.inFx.)
  const queueEv = (ev) => { if (role === 'host' && G && !G.inFx && events.length < 400) events.push(ev); };
  const DECALS = ['scorch', 'crater', 'rubble', 'bakeWreck', 'bibDecal'];
  const ORIG = {};
  for (const n of DECALS) {
    ORIG[n] = window[n];
    window[n] = function (...a) {
      if (role === 'host') queueEv(['d', n, a.map((v) => (v === G.tctx ? { $c: 't' } : v === G.dctx ? { $c: 'd' } : pack(v)))]);
      return ORIG[n].apply(this, a);
    };
  }
  let hooked = false;
  function hookHost() {
    if (hooked) return;
    hooked = true;
    const sfx = hooks.sfx, shake = hooks.shake, over = hooks.gameOver;
    hooks.sfx = (n, x, y) => { queueEv(['s', n, Math.round(x), Math.round(y)]); sfx(n, x, y); };
    hooks.shake = (x, y, a) => { queueEv(['k', Math.round(x), Math.round(y), round(a)]); shake(x, y, a); };
    hooks.evaFor = (side, msg) => { if (role === 'host' && side === peerSide()) events.push(['e', msg]); };
    hooks.gameOver = (won) => {
      if (role === 'host') { send(snapshot()); send({ k: 'end', over: { winner: G.over.winner, t: G.over.t }, log: pack(G.log) }); }
      over(won);
    };
  }

  // ---------------------------------------------------------------------------
  // Guest: orders go to the host. The sidebar's own answers (queue full, cannot place) are worked
  // out here on the copy of the battle, which the next snapshot then puts right.
  const COMMANDS = ['commandMove', 'commandAttack', 'commandHunt', 'commandGuard', 'commandStop', 'startProduction', 'cancelProduction',
    'placeStructure', 'launchPower', 'deployFob', 'setAuto', 'setRepair', 'sellStructure'];
  const ORIGC = {};
  const packArg = (v) => (Array.isArray(v) ? v.map(packArg) : isEnt(v) ? { $e: v.id } : v && typeof v === 'object' && v.queues ? { $t: v.id } : v);
  for (const f of COMMANDS) {
    ORIGC[f] = window[f];
    window[f] = (...a) => (role === 'guest' ? order(f, a) : ORIGC[f](...a));
  }
  function order(f, a) {
    const go = () => send({ k: 'c', f, a: a.map(packArg) });
    if (f === 'startProduction' || f === 'cancelProduction') { go(); return ORIGC[f](...a); }
    if (f === 'placeStructure') {
      const [team, type, cx, cy] = a, q = team.queues.structure;
      const ok = !!(q && q.ready && q.type === type && canPlace(team, type, cx, cy, 0));
      if (ok) go();
      return ok;
    }
    if (f === 'launchPower') { const ok = powerReady(a[0], a[1]); if (ok) go(); return ok; }
    if (f === 'setAuto') a[0].auto = !!a[1];
    if (f === 'setRepair') a[0].repairing = !!a[1];
    go();
    return f === 'deployFob' ? null : undefined;
  }
  function applyCommand(m) {
    if (!COMMANDS.includes(m.f) || !Array.isArray(m.a)) return;
    const side = peerSide();
    const un = (v) => (Array.isArray(v) ? v.map(un).filter((x) => x !== null) : v && typeof v === 'object' ? (v.$t !== undefined ? G.teams[side] : v.$e !== undefined ? G.byId.get(v.$e) || null : null) : v);
    const a = m.a.map(un);
    const mine = (e) => e && e.alive && e.team === side;
    if (Array.isArray(a[0])) a[0] = a[0].filter(mine);                     // units: only the guest's own
    else if (a[0] && a[0].kind && !mine(a[0])) return;                      // one unit or structure: the guest's own
    else if (a[0] && a[0].queues && a[0] !== G.teams[side]) return;
    if (m.f === 'commandAttack' && !(a[1] && a[1].alive)) return;
    try { ORIGC[m.f](...a); } catch (_) {}
  }

  const LERP = ['x', 'y', 'alt', 'face', 'tface'];
  function applySnapshot(s) {
    G.t = s.t;
    // First every new entity, so references between them (a unit's target) can be resolved.
    const fresh = new Set();
    for (const id in s.e) {
      if (G.byId.has(+id)) continue;
      const d = s.e[id];
      const x = { id: +id, kind: d.kind, type: d.type, def: d.kind === 'bld' ? BUILD_DEFS[d.type] : UNIT_DEFS[d.type], _to: {}, anim: 0 };
      G.entities.push(x); G.byId.set(x.id, x); fresh.add(x);
    }
    for (const id in s.e) {
      const d = s.e[id], x = G.byId.get(+id), glide = x.kind === 'unit' && !fresh.has(x);
      for (const k in d) {
        const v = unpack(d[k]);
        if (glide && LERP.includes(k) && typeof v === 'number' && typeof x[k] === 'number') x._to[k] = v;
        else x[k] = v;
      }
    }
    for (const x of fresh) if (x.kind === 'bld') {
      for (let y = x.cy; y < x.cy + x.h; y++) for (let c = x.cx; c < x.cx + x.w; c++) G.bld[idx(c, y)] = x.id;
      if (x.def.exit) { x.exitCell = idx(x.cx + Math.floor(x.w / 2), x.cy + x.h); G.resv[x.exitCell] = 1; }
    }
    for (const id of s.r) {
      const x = G.byId.get(id);
      if (!x) continue;
      x.alive = false;
      if (x.kind === 'bld') for (let y = x.cy; y < x.cy + x.h; y++) for (let c = x.cx; c < x.cx + x.w; c++) if (G.bld[idx(c, y)] === x.id) G.bld[idx(c, y)] = 0;
    }
    sweepDead();
    G.projectiles = s.p.map(unpack);
    if (s.fx) for (const f of s.fx) G.effects.push(unpack(f));
    if (s.tm) s.tm.forEach((t, i) => { if (t) { const shown = G.teams[i].shown; Object.assign(G.teams[i], unpack(t)); G.teams[i].shown = shown; } });
    if (s.fog) { const fog = G.fog[G.me]; for (const i of s.fog) fog[i] = 1; G.shroudDirty = true; }
    if (s.ore) for (let i = 0; i < s.ore.length; i += 3) { G.ore[s.ore[i]] = s.ore[i + 1]; G.gem[s.ore[i]] = s.ore[i + 2]; }
    if (s.ev) for (const ev of s.ev) playEvent(ev);
  }
  function playEvent(ev) {
    try {
      if (ev[0] === 's') hooks.sfx(ev[1], ev[2], ev[3]);
      else if (ev[0] === 'k') hooks.shake(ev[1], ev[2], ev[3]);
      else if (ev[0] === 'e') hooks.eva(ev[1]);
      else if (ev[0] === 'd' && ORIG[ev[1]]) {
        const a = ev[2].map((v) => (v && v.$c ? (v.$c === 't' ? G.tctx : G.dctx) : unpack(v)));
        ORIG[ev[1]](...a);
      }
    } catch (_) {}
  }
  function applyEnd(m) {
    if (G.over) return;
    G.log = unpack(m.log);
    G.over = { winner: m.over.winner, won: m.over.winner === G.me, t: m.over.t };
    hooks.gameOver(G.over.won);
  }
  // Each frame on the guest: glide toward the latest positions and run the eye candy.
  function guestStep(dt) {
    if (!G || G.over) return;
    G.t += dt;
    const k = 1 - Math.exp(-dt * 14);
    for (const x of G.entities) {
      const to = x._to;
      if (!to) continue;
      const ox = x.x, oy = x.y;
      if (x.hs === 'mine') x.anim += dt * 6;
      for (const f in to) {
        const v = to[f];
        if (f === 'face' || f === 'tface') x[f] += angDiff(v, x[f]) * k;
        else x[f] = Math.abs(v - x[f]) > CELL * 6 ? v : x[f] + (v - x[f]) * k;
      }
      const moved = Math.hypot(x.x - ox, x.y - oy);
      if (moved < CELL) x.anim += moved;
    }
    updateEffects(dt);
    sweepDead();
    rollCredits(dt);
  }

  return {
    host, join, leave, swapSides, startBattle, hostTick, guestStep, hookHost,
    get role() { return role; }, get lobby() { return lobby; },
    onChange(f) { listener = f; },
  };
})();

// The online page: host or join with a code, then the lobby.
const Online = (() => {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const SIDE = { allies: 'Allies', soviets: 'Soviets' };
  let root = null, body = null, faction = 'allies';
  function build() {
    root = document.createElement('div');
    root.id = 'online';
    root.hidden = true;
    root.innerHTML = `<div class="fm-book" role="dialog" aria-modal="true" aria-labelledby="onTitle">
      <header class="fm-top"><span class="fm-brand">Online</span><div class="fm-tabs"></div>
        <button type="button" class="fm-close" aria-label="Close">✕</button></header>
      <div class="fm-page"><h2 id="onTitle">Play a friend</h2><div class="on-body"></div></div>
    </div>`;
    document.body.appendChild(root);
    body = root.querySelector('.on-body');
    root.addEventListener('click', (e) => {
      if (e.target.closest('.fm-close') || e.target === root) { close(); return; }
      const b = e.target.closest('[data-on]');
      if (!b) return;
      const act = b.dataset.on;
      if (act === 'host') Net.host(faction);
      else if (act === 'swap') Net.swapSides();
      else if (act === 'start') Net.startBattle();
      else if (act === 'cancel') { Net.leave(); render(); }
    });
    root.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = root.querySelector('#onCode').value;
      if (v.replace(/[^a-z]/gi, '').length === 4) Net.join(v);
      else root.querySelector('.pf-msg').textContent = 'The code is 4 letters.';
    });
    Net.onChange(render);
  }
  function render() {
    if (!root || root.hidden) return;
    if (Net.role) { close(); return; }   // the battle has started
    const L = Net.lobby;
    if (!L || L.failed) {
      body.innerHTML = `${L && L.failed ? `<p class="on-error" role="alert">${esc(L.failed)}</p>` : ''}
        <p class="lb-intro">Play one of your friends, phone to phone. One of you hosts and gets a 4-letter code; the other joins with it. The host's phone runs the battle, so the stronger phone should host.</p>
        <div class="on-btns"><button type="button" class="pf-btn on-go" data-on="host">Host a game</button></div>
        <form class="pf-form"><label for="onCode">Join with a code</label><div class="pf-row">
          <input id="onCode" type="text" maxlength="4" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABCD" enterkeyhint="go">
          <button type="submit">Join</button></div><p class="pf-msg" role="status"></p></form>`;
      return;
    }
    if (!L.connected) {
      const msg = L.me === 'host'
        ? (L.status === 'connecting' ? 'Your friend is joining…' : 'Tell your friend to tap Play online, then join with this code.')
        : (L.status === 'connecting' ? 'Found the game. Connecting…' : `Looking for game ${esc(L.code)}…`);
      body.innerHTML = `${L.me === 'host' ? `<p class="on-code" aria-label="Room code">${esc(L.code)}</p>` : ''}<p class="lb-intro">${msg}</p>
        <div class="on-btns"><button type="button" class="pf-btn" data-on="cancel">Cancel</button></div>`;
      return;
    }
    const hostF = (L.host && L.host.faction) || 'allies', guestF = hostF === 'allies' ? 'soviets' : 'allies';
    const row = (who, name, f) => `<tr><th>${who}</th><td>${esc(name || '…')}</td><td class="on-side" data-faction="${f}">${SIDE[f]}</td></tr>`;
    const me = L.me === 'host';
    body.innerHTML = `<p class="lb-intro">Connected. ${me ? 'Pick sides, then start the battle.' : 'The host picks sides and starts the battle.'}</p>
      <table class="on-lobby"><tbody>
        ${row(me ? 'You' : 'Host', L.host && L.host.name, hostF)}
        ${row(me ? 'Friend' : 'You', L.guest && L.guest.name, guestF)}
      </tbody></table>
      <div class="on-btns">${me ? '<button type="button" class="pf-btn" data-on="swap">Swap sides</button><button type="button" class="pf-btn on-go" data-on="start">Start battle</button>' : '<p class="pf-small">Waiting for the host…</p>'}
        <button type="button" class="pf-btn" data-on="cancel">Leave</button></div>`;
  }
  function open(f) {
    if (!root) build();
    faction = f || faction;
    root.hidden = false;
    render();
  }
  function close() { if (root) root.hidden = true; }
  return { open, close };
})();

// Filled in by ui.js: starting an online battle and a lost connection mid-battle.
const UIBridge = { start() {}, lost() {} };
