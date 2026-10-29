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

  const PING = 1000, SILENT = 6000;   // a heartbeat every second; this long without a word is a drop
  let WAIT_LIMIT = 120;               // seconds to wait for a dropped player before they lose

  let role = null;             // 'host' or 'guest' once a battle has started; null otherwise
  let link = null;             // the connection: { id, to, sig, pc, dc, timer }
  // lobby: { code, me: 'host' | 'guest', gid (the guest's id, kept across reconnects), host: { name, faction },
  //   guest: { name }, connected, status, match (this battle's key), failed (a message) }
  let lobby = null;
  let listener = () => {};     // the online page's redraw
  let heard = 0, rtt = 0, resyncs = 0;      // when the other phone was last heard from; ping time in ms
  let wait = null;             // { since, peerAway } while a battle waits for the other player
  const peerSide = () => (role === 'host' ? 1 : 0);   // the host plays side 0, the guest side 1
  const mySide = () => (role === 'host' ? 0 : 1);
  const inBattle = () => !!(role && G && !G.over);

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
    heard = performance.now();
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
      if (link.sig) { link.sig.close(); link.sig = null; }   // Realtime is only for introductions
      lobby.connected = true; lobby.status = 'connected';
      heard = performance.now(); partBuf = '';
      send({ k: 'hi', name: myName(), v: VERSION, match: role ? lobby.match : null });
      if (lobby.me === 'host') send({ k: 'lobby', faction: lobby.host.faction });
      if (inBattle()) resumed();
      listener();
    };
    dc.onmessage = (e) => receive(e.data);
    dc.onclose = () => { if (link && link.dc === dc) lost(); };
    if (dc.readyState === 'open') opened(); else dc.onopen = opened;   // (the guest's may arrive open)
  }
  function peer() {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    link.pc = pc;
    link.pending = [];
    pc.onicecandidate = (e) => { if (e.candidate && link && link.sig) link.sig.send('ice', { to: link.to, from: link.id, c: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' && link && link.pc === pc) lost(); };
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

  // The host listens on its room code, for the guest's first hello and for it coming back.
  function listen() {
    link = { id: newId(), to: null };
    const L = link;
    L.sig = signal(lobby.code, async (ev, p) => {
      if (link !== L) return;
      if (ev === 'signal-lost') { if (!lobby.connected && !inBattle()) fail('No connection. Check it and try again.'); else if (inBattle()) setTimeout(() => { if (link === L && !lobby.connected) { close(); listen(); } }, 3000); return; }
      if (ev === 'hello') {
        if (lobby.gid && p.gid !== lobby.gid) { L.sig.send('full', { to: p.from }); return; }
        if (p.v !== VERSION) { L.sig.send('version', { to: p.from, v: VERSION }); return; }
        if (L.to) return;
        L.to = p.from; lobby.gid = p.gid;
        lobby.status = 'connecting'; listener();
        const pc = peer();
        wire(pc.createDataChannel('game', { ordered: true }));
        await pc.setLocalDescription(await pc.createOffer());
        L.sig.send('offer', { to: L.to, from: L.id, sdp: pc.localDescription.toJSON() });
        // No connection after all: listen again for another try.
        L.timer = setTimeout(() => { if (link === L && !lobby.connected) { if (inBattle()) { close(); listen(); } else fail('Could not connect to your friend. Try again, or try another network.'); } }, CONNECT_TIMEOUT);
      } else if (p.to === L.id && p.from === L.to) {
        if (ev === 'answer') await remote(p.sdp).catch(() => {});
        else if (ev === 'ice') candidate(p.c);
      }
    });
  }
  // The guest says hello on the room code until the host answers (every few seconds, as the host
  // may itself be reconnecting).
  function knock() {
    link = { id: newId(), to: null };
    const L = link;
    L.sig = signal(lobby.code, async (ev, p) => {
      if (link !== L) return;
      if (ev === 'signal-lost') { if (!lobby.connected && !inBattle()) fail('No connection. Check it and try again.'); else if (inBattle()) setTimeout(() => { if (link === L && !lobby.connected) { close(); knock(); } }, 3000); return; }
      if (p.to !== L.id) return;
      if (ev === 'full') fail('That game already has two players.');
      else if (ev === 'version') fail('Your friend has a different version of the game. Both of you restart the game to update, then try again.');
      else if (ev === 'offer' && !L.to) {
        L.to = p.from; clearInterval(L.hello);
        lobby.status = 'connecting'; listener();
        const pc = peer();
        pc.ondatachannel = (e) => wire(e.channel);
        await remote(p.sdp).catch(() => {});
        await pc.setLocalDescription(await pc.createAnswer());
        L.sig.send('answer', { to: L.to, from: L.id, sdp: pc.localDescription.toJSON() });
        L.timer = setTimeout(() => { if (link === L && !lobby.connected) { if (inBattle()) { close(); knock(); } else fail('Could not connect to your friend. Try again, or try another network.'); } }, CONNECT_TIMEOUT);
      } else if (ev === 'ice' && p.from === L.to) candidate(p.c);
    });
    const hello = () => L.sig.send('hello', { from: L.id, gid: lobby.gid, name: myName(), v: VERSION });
    hello();
    L.hello = setInterval(() => { if (link === L && !L.to) hello(); }, 3000);
    // Nobody answering a first join: a wrong code, or the host has gone.
    if (!inBattle()) L.timer = setTimeout(() => { if (link === L && !L.to) fail(`No game found with the code ${lobby.code}. Check it with your friend.`); }, 10000);
  }

  function host(faction) {
    leave();
    let code = '';
    for (let i = 0; i < 4; i++) code += LETTERS[(Math.random() * LETTERS.length) | 0];
    lobby = { code, me: 'host', gid: null, host: { name: myName(), faction }, guest: null, connected: false, status: 'waiting' };
    listen();
    listener();
  }
  function join(code) {
    leave();
    code = String(code).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    lobby = { code, me: 'guest', gid: newId(), host: null, guest: { name: myName() }, connected: false, status: 'joining' };
    knock();
    listener();
  }
  function fail(msg) { const code = lobby && lobby.code; close(); lobby = { failed: msg, code }; listener(); }
  function close() {
    if (!link) return;
    clearTimeout(link.timer); clearInterval(link.hello);
    if (link.sig) link.sig.close();
    try { link.dc && link.dc.close(); } catch (_) {}
    try { link.pc && link.pc.close(); } catch (_) {}
    link = null;
  }
  function leave() {
    if (link && link.dc && link.dc.readyState === 'open') send({ k: 'bye' });
    const was = role;
    close(); lobby = null; role = null; endWait();
    if (was && G) { G.remote = false; G.hold = false; }
    hud();
  }
  // The connection dropped. In a battle: hold it and get the connection back through the room
  // code. Anywhere else: say so.
  function lost(why) {
    if (!link && !inBattle()) return;
    close();
    if (lobby) lobby.connected = false;
    if (inBattle()) {
      startWait(false);
      if (lobby.me === 'host') listen(); else knock();
      return;
    }
    role = null;
    if (G) G.remote = false;
    lobby = { failed: why || 'The connection to your friend was lost.' };
    hud();
    listener();
  }

  // ---------------------------------------------------------------------------
  // Waiting for the other player: the battle holds on both phones.
  function startWait(peerAway) {
    if (!inBattle()) return;
    if (!wait) wait = { since: performance.now() };
    wait.peerAway = peerAway;
    G.hold = true;
    hud();
  }
  function endWait() { wait = null; if (G) G.hold = false; hud(); }
  function resumed() {
    if (role === 'host') { resetHost(true); send({ k: 'resume' }); }
    endWait();
    if (role === 'guest') send({ k: 'resume' });
  }
  // A phone going to sleep says so first, where it can; coming back after too long, it has lost.
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (!role) return;
    if (document.hidden) { hiddenAt = performance.now(); send({ k: 'away' }); return; }
    if (!inBattle()) return;
    if ((performance.now() - hiddenAt) / 1000 > WAIT_LIMIT) { close(); endBattle(peerSide(), 'left'); return; }
    if (performance.now() - heard > SILENT) lost();
    else { send({ k: 'back' }); if (wait && !wait.peerAway) endWait(); }
  });
  setInterval(() => {
    if (link && link.dc && link.dc.readyState === 'open') send({ k: 'ping', t: performance.now() });
    if (inBattle() && lobby && lobby.connected && performance.now() - heard > SILENT && !document.hidden) lost();
    if (wait && inBattle() && (performance.now() - wait.since) / 1000 > WAIT_LIMIT) { const w = mySide(); endWait(); close(); endBattle(w, 'left'); }
    hud();
  }, PING);

  // ---------------------------------------------------------------------------
  // Lobby, start, surrender and rematch.
  function swapSides() {
    if (!lobby || lobby.me !== 'host') return;
    lobby.host.faction = lobby.host.faction === 'allies' ? 'soviets' : 'allies';
    send({ k: 'lobby', faction: lobby.host.faction });
    listener();
  }
  function startBattle() {
    if (!lobby || lobby.me !== 'host' || !lobby.connected || !lobby.guest) return;
    const seed = (Math.random() * 1e9) | 0, match = newId();
    send({ k: 'start', seed, faction: lobby.host.faction, match });
    begin('host', seed, lobby.host.faction, match);
  }
  function begin(r, seed, hostFaction, match) {
    role = r;
    lobby.match = match;
    resetHost();
    endWait();
    const guestFaction = hostFaction === 'allies' ? 'soviets' : 'allies';
    const opp = r === 'host' ? lobby.guest.name : lobby.host.name;
    UIBridge.start({ seed, faction: r === 'host' ? hostFaction : guestFaction, me: r === 'host' ? 0 : 1, opponent: opp });
    if (r === 'guest') {
      // The battle is the host's: start from an empty field and fill it from the snapshots.
      G.remote = true;
      clearCopy();
    }
    hud();
    listener();
  }
  function clearCopy() { G.entities = []; G.byId.clear(); G.bld.fill(0); G.resv.fill(0); G.projectiles = []; G.selection = []; }
  // Quitting an online battle is surrendering. The host's battle decides; the guest asks it.
  function surrender() {
    if (!inBattle()) return;
    if (role === 'host' || !lobby.connected) { endWait(); endBattle(peerSide(), 'quit'); return; }
    send({ k: 'quit' });
    setTimeout(() => { if (inBattle()) endBattle(peerSide(), 'quit'); }, 3000);   // no answer: lose anyway
  }
  // After the debrief: back to the lobby, still connected, for another battle.
  function rematch() {
    const was = role;
    role = null; endWait();
    if (was && G) G.remote = false;
    if (!lobby || !lobby.connected) lobby = { failed: 'Your friend has left. Host or join a new game.' };
    hud();
    listener();
  }

  function onMessage(m) {
    if (m.k === 'ping') { send({ k: 'pong', t: m.t }); return; }
    if (m.k === 'pong') { rtt = Math.round(performance.now() - m.t); return; }
    if (m.k === 'hi') {
      if (lobby.me === 'host') lobby.guest = { name: String(m.name || 'Commander').slice(0, 20) };
      else lobby.host = Object.assign(lobby.host || { faction: 'allies' }, { name: String(m.name || 'Commander').slice(0, 20) });
      listener();
    } else if (m.k === 'lobby' && lobby.me === 'guest') { lobby.host = Object.assign(lobby.host || { name: 'Commander' }, { faction: m.faction }); listener(); }
    else if (m.k === 'start' && lobby.me === 'guest') begin('guest', m.seed, m.faction, m.match);
    else if (m.k === 's' && role === 'guest') applySnapshot(m);
    else if (m.k === 'end' && role === 'guest') applyEnd(m);
    else if (m.k === 'c' && role === 'host' && !G.hold) applyCommand(m);
    else if (m.k === 'away') startWait(true);
    else if (m.k === 'back' || m.k === 'resume') { if (inBattle()) endWait(); }
    else if (m.k === 'quit' && role === 'host' && inBattle()) { endWait(); endBattle(mySide(), 'quit'); }
    else if (m.k === 'bye') { if (inBattle()) { endWait(); close(); endBattle(mySide(), 'quit'); } else lost('Your friend has left. Host or join a new game.'); }
  }

  // ---------------------------------------------------------------------------
  // In battle: the opponent's name and ping, and the waiting notice.
  let hudEl = null, waitEl = null;
  function hud() {
    if (!hudEl) {
      hudEl = document.createElement('div'); hudEl.id = 'netHud'; hudEl.hidden = true;
      waitEl = document.createElement('div'); waitEl.id = 'netWait'; waitEl.hidden = true;
      waitEl.innerHTML = '<div class="nw-card" role="alert"><p class="nw-title"></p><p class="nw-sub"></p><button type="button" class="pf-btn">Leave battle (you lose)</button></div>';
      waitEl.querySelector('button').addEventListener('click', () => surrender());
      document.body.append(hudEl, waitEl);
    }
    const on = inBattle();
    hudEl.hidden = !on;
    if (on) {
      const opp = lobby && (lobby.me === 'host' ? lobby.guest : lobby.host);
      hudEl.textContent = `vs ${opp ? opp.name : '…'}${lobby.connected && rtt ? ` · ${rtt} ms` : ''}`;
      hudEl.classList.toggle('slow', rtt > 250);
    }
    waitEl.hidden = !(on && wait);
    if (on && wait) {
      const left = Math.max(0, Math.ceil(WAIT_LIMIT - (performance.now() - wait.since) / 1000));
      waitEl.querySelector('.nw-title').textContent = wait.peerAway && lobby.connected ? 'Your opponent left the game for a moment' : 'Waiting for your opponent…';
      waitEl.querySelector('.nw-sub').textContent = `The battle is paused. If they are not back in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}, you win.`;
    }
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
  let sent, fogSent, oreSent, gemSent, teamSent, events, snapT, snapN, full;
  // full: after a reconnect, the next snapshot carries everything and the guest starts its copy afresh.
  function resetHost(resync) {
    sent = new Map(); fogSent = new Uint8Array(NCELLS); oreSent = new Uint16Array(NCELLS); gemSent = new Uint8Array(NCELLS);
    if (resync) oreSent.fill(0xffff);
    teamSent = ['', '']; events = []; snapT = 0; snapN = 0; full = !!resync;
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
  // The guest only needs what it can see: no news of the host's side, or of smoke, shots and sounds,
  // out in ground it has not uncovered. (A unit leaving its sight still gets the snapshot that
  // takes it out of sight.) Nothing is lost: what was held back goes out once uncovered.
  const seen = (x, y) => !!G.fog[peerSide()][cellOfPos(x, y)];
  function shown(x, last) {
    if (x.team === peerSide()) return true;
    if (x.kind === 'bld') return seen(x.cx * CELL + 1, x.cy * CELL + 1) || seen((x.cx + x.w) * CELL - 1, (x.cy + x.h) * CELL - 1);
    return seen(x.x, x.y) || (last && typeof last.x === 'number' && seen(last.x, last.y));
  }
  function snapshot() {
    const e = {}, r = [];
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
    if (full) { s.full = true; full = false; }
    const fx = G.effects.filter((f) => !f.sent);
    for (const f of fx) f.sent = true;
    const near = fx.filter((f) => typeof f.x !== 'number' || seen(f.x, f.y));
    if (near.length) s.fx = near.map(pack);
    const ev = events.filter((v) => (v[0] === 's' ? seen(v[2], v[3]) : v[0] === 'k' ? seen(v[1], v[2]) : true));   // sounds and shakes: where seen
    if (ev.length) s.ev = ev;
    events = [];
    // The guest's own side whenever it changes; the host's side now and then.
    for (let i = 0; i < 2; i++) {
      if (i !== peerSide() && snapN % 20 && !G.over && s.full !== true) continue;
      const tm = teamJSON(G.teams[i]);
      if (tm === teamSent[i]) continue;
      (s.tm || (s.tm = []))[i] = JSON.parse(tm); teamSent[i] = tm;
    }
    const fog = G.fog[peerSide()], f = [];
    for (let i = 0; i < NCELLS; i++) if (fog[i] && !fogSent[i]) { fogSent[i] = 1; f.push(i); }
    if (f.length) s.fog = f;
    if (snapN++ % ORE_EVERY === 0) {
      const o = [];
      for (let i = 0; i < NCELLS; i++) if ((G.ore[i] !== oreSent[i] || G.gem[i] !== gemSent[i]) && fog[i]) { oreSent[i] = G.ore[i]; gemSent[i] = G.gem[i]; o.push(i, G.ore[i], G.gem[i]); }
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
      if (role === 'host') { send(snapshot()); send({ k: 'end', over: { winner: G.over.winner, t: G.over.t, how: G.over.how }, log: pack(G.log) }); }
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
    if (s.full) { clearCopy(); resyncs++; }
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
    endWait();
    G.log = unpack(m.log);
    G.over = { winner: m.over.winner, won: m.over.winner === G.me, t: m.over.t, how: m.over.how };
    hooks.gameOver(G.over.won);
  }
  // Each frame on the guest: glide toward the latest positions and run the eye candy.
  function guestStep(dt) {
    if (!G || G.over || G.hold) return;
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
    host, join, leave, swapSides, startBattle, surrender, rematch, hostTick, guestStep, hookHost,
    get role() { return role; }, get lobby() { return lobby; }, get waiting() { return !!wait; },
    // For tests: drop the connection without a word, and a shorter wait.
    test: { drop() { const L = link; if (L) { try { L.pc.close(); } catch (_) {} } lost(); }, waitLimit(s) { WAIT_LIMIT = s; }, get resyncs() { return resyncs; } },
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

// Filled in by ui.js: starting an online battle.
const UIBridge = { start() {} };
