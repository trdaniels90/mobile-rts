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
  // Connection quality for the match report (Report adds netStats() to the stats): the ping over the
  // whole battle and minute by minute, beside this phone's frame rate and the number of units alive,
  // so high ping can be told apart from a phone struggling in a big fight. Starts afresh with each G.
  let pl = null;
  function plFor() {
    if (!pl || pl.g !== G) pl = { g: G, n: 0, sum: 0, max: 0, slow: 0, bad: 0, min: [] };
    return pl;
  }
  function plMinute() {
    const p = plFor(), i = Math.min(120, Math.floor(G.t / 60));
    return p.min[i] || (p.min[i] = { p: 0, c: 0, max: 0, f: 0, ft: 0, u: 0 });
  }
  function notePing(ms) {
    if (!inBattle() || G.hold) return;
    const p = plFor(), m = plMinute();
    p.n++; p.sum += ms; p.max = Math.max(p.max, ms);
    if (ms > 250) p.slow++;
    if (ms > 500) p.bad++;
    m.p += ms; m.c++; m.max = Math.max(m.max, ms);
    if (!m.u) m.u = G.entities.filter((e) => e.alive && e.kind === 'unit').length;
  }
  let lastFrameAt = 0;
  function noteFrame() {   // real time between frames (the game's own dt is capped)
    const now = performance.now(), gap = (now - lastFrameAt) / 1000;
    lastFrameAt = now;
    if (!inBattle() || G.hold || gap > 1) return;   // a gap over a second is a pause or the phone asleep
    const m = plMinute(); m.f++; m.ft += gap;
    if (gap > 0.1) m.long = (m.long || 0) + 1;
  }
  function netStats() {
    if (!pl || pl.g !== G || !pl.n) return null;
    return { role, avg: Math.round(pl.sum / pl.n), max: pl.max, n: pl.n, over250: +(pl.slow / pl.n).toFixed(3), over500: +(pl.bad / pl.n).toFixed(3), resyncs,
      // Per minute of battle: average and worst ping (ms), this phone's frames per second, frames over
      // 100 ms (stutters), units alive.
      minutes: pl.min.map((m, i) => m && { m: i, ping: m.c ? Math.round(m.p / m.c) : null, max: m.max, fps: m.ft ? Math.round(m.f / m.ft) : null, long: m.long || 0, units: m.u }).filter(Boolean) };
  }
  let wait = null;             // { since, peerAway } while a battle waits for the other player
  let side = 0;               // the side this phone commands (phone to phone: the host 0, the guest 1)
  const mySide = () => side;
  const peerSide = () => 1 - side;
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
      if (d.event === 'phx_reply' && d.ref === '1') {
        if (d.payload && d.payload.status && d.payload.status !== 'ok') { if (!closed) { closed = true; clearInterval(beat); try { ws.close(); } catch (_) {} onMsg('signal-lost', {}); } return; }   // refused: not a room
        joined = true; while (queue.length) send(...queue.shift());
      }
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
      if (lobby.me === 'host') send({ k: 'lobby', faction: lobby.host.faction, map: lobby.host.map });
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
    pc.onconnectionstatechange = () => {
      if (pc.connectionState !== 'failed' || !link || link.pc !== pc) return;
      if (lobby && lobby.me === 'host' && !lobby.connected && !inBattle()) retryable(link); else lost();
    };
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

  // An attempt that did not connect (a guest whose phone could not be reached, or who gave up): the
  // host drops it and keeps the room open for the next try, instead of making the host start over.
  function dropAttempt(L) {
    clearTimeout(L.timer);
    const dc = L.dc, pc = L.pc;
    L.dc = null; L.pc = null; L.to = null; L.pending = [];
    if (dc) { dc.onclose = null; dc.onopen = null; dc.onmessage = null; try { dc.close(); } catch (_) {} }
    if (pc) { pc.onicecandidate = null; pc.onconnectionstatechange = null; try { pc.close(); } catch (_) {} }
  }
  function retryable(L) {
    dropAttempt(L);
    if (lobby) { lobby.status = 'waiting'; lobby.gid = null; }
    listener();
  }

  // The host listens on its room code, for the guest's first hello and for it coming back.
  function listen() {
    link = { id: newId(), to: null };
    const L = link;
    L.sig = signal(lobby.code, async (ev, p) => {
      if (link !== L) return;
      if (ev === 'signal-lost') { if (!lobby.connected && !inBattle()) fail('No connection. Check it and try again.'); else if (inBattle()) setTimeout(() => { if (link === L && !lobby.connected) { close(); listen(); } }, 3000); return; }
      if (ev === 'hello') {
        if (p.v !== VERSION) { L.sig.send('version', { to: p.from, v: VERSION }); return; }
        if (L.to === p.from) return;   // the same guest knocking again
        // Someone else while a guest is connected (or the battle is on): the room is taken. While an
        // attempt has not connected, a new hello (the guest trying again, perhaps from a reloaded
        // page) replaces it.
        if ((lobby.connected || inBattle()) && lobby.gid && p.gid !== lobby.gid) { L.sig.send('full', { to: p.from }); return; }
        if (L.to && lobby.connected) return;
        if (L.to) dropAttempt(L);
        L.to = p.from; lobby.gid = p.gid;
        lobby.status = 'connecting'; listener();
        const pc = peer();
        wire(pc.createDataChannel('game', { ordered: true }));
        await pc.setLocalDescription(await pc.createOffer());
        L.sig.send('offer', { to: L.to, from: L.id, sdp: pc.localDescription.toJSON() });
        // No connection after all: listen again for another try.
        L.timer = setTimeout(() => { if (link === L && !lobby.connected) { if (inBattle()) { close(); listen(); } else retryable(L); } }, CONNECT_TIMEOUT);
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
        for (const e of L.early || []) if (e.from === p.from) link.pending.push(e.c);   // sent before the offer arrived
        L.early = null;
        await remote(p.sdp).catch(() => {});
        await pc.setLocalDescription(await pc.createAnswer());
        L.sig.send('answer', { to: L.to, from: L.id, sdp: pc.localDescription.toJSON() });
        L.timer = setTimeout(() => { if (link === L && !lobby.connected) { if (inBattle()) { close(); knock(); } else fail('Could not connect to your friend. Try again, or try another network.'); } }, CONNECT_TIMEOUT);
      } else if (ev === 'ice') {
        if (L.to === null) (L.early = L.early || []).push({ from: p.from, c: p.c });
        else if (p.from === L.to) candidate(p.c);
      }
    });
    const hello = () => L.sig.send('hello', { from: L.id, gid: lobby.gid, name: myName(), v: VERSION });
    hello();
    L.hello = setInterval(() => { if (link === L && !L.to) hello(); }, 3000);
    // Nobody answering a first join: a wrong code, or the host has gone.
    if (!inBattle()) L.timer = setTimeout(() => { if (link === L && !L.to) fail(`No game found with the code ${lobby.code}. Check it with your friend.`); }, 10000);
  }

  // ---------------------------------------------------------------------------
  // The dedicated server (server/server.js): the battle runs there and both phones are its guests.
  // Hosting and joining try it first; if it cannot be reached (or runs another version), the phones
  // play phone to phone as before.
  const SERVER = (() => {
    const q = typeof location !== 'undefined' && new URLSearchParams(location.search).get('server');
    if (q === 'off') return null;
    return q || 'wss://red-horizon-rts.fly.dev';
  })();
  const SERVER_TIMEOUT = 7000;   // long enough for a sleeping server machine to wake
  // Opens a connection to the server and says the first word; then(ok, reply) once it answers.
  function viaServer(first, then) {
    if (!SERVER || typeof WebSocket === 'undefined') { then(false); return; }
    let ws, done = false;
    const finish = (ok, m) => { if (done) return; done = true; clearTimeout(t); if (!ok) { try { ws.close(); } catch (_) {} } then(ok, m, ws); };
    const t = setTimeout(() => finish(false), SERVER_TIMEOUT);
    try { ws = new WebSocket(SERVER); } catch (_) { finish(false); return; }
    ws.onopen = () => ws.send(JSON.stringify(Object.assign({ name: myName(), v: VERSION, gid: lobby && lobby.gid }, first)));
    ws.onerror = () => finish(false);
    ws.onclose = () => finish(false);
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch (_) { return; }
      if (m.k === 'room') finish(true, m);
      else finish(false, m);
    };
  }
  // A server connection looks like a data channel to the rest of this file.
  function wireServer(ws, room) {
    link = { id: newId(), to: 'server', via: 'server' };
    const L = link;
    L.dc = { get readyState() { return ws.readyState === 1 ? 'open' : 'closed'; }, get bufferedAmount() { return ws.bufferedAmount; }, send: (d) => ws.send(d), close: () => ws.close() };
    ws.onmessage = (e) => receive(e.data);
    ws.onclose = () => { if (link === L) lost(); };
    ws.onerror = () => {};
    lobby.via = 'server'; lobby.code = room.code; lobby.connected = true; lobby.status = 'connected';
    lobby.me = room.lead ? 'host' : 'guest';
    heard = performance.now(); partBuf = '';
    if (inBattle()) resumed();
    listener();
  }
  // Back to the server after a dropped connection, into the same seat.
  function rejoinServer() {
    const L = link = { id: newId(), via: 'server', waiting: true };
    viaServer({ k: 'join', code: lobby.code }, (ok, m, ws) => {
      if (link !== L) return;
      if (ok) { wireServer(ws, m); return; }
      if (m && (m.k === 'err')) { if (inBattle()) { endWait(); endBattle(otherAlly(side), 'left'); } else lost('The game has closed. Host or join a new game.'); return; }
      setTimeout(() => { if (link === L) rejoinServer(); }, 2000);   // no answer yet: keep trying
    });
  }

  function host(faction) {
    leave();
    lobby = { code: null, me: 'host', gid: newId(), host: { name: myName(), faction, map: DEFAULT_MAP }, guest: null, connected: false, status: 'starting' };
    listener();
    const L = lobby;
    viaServer({ k: 'create', faction, map: DEFAULT_MAP }, (ok, m, ws) => {
      if (lobby !== L) { if (ws) try { ws.close(); } catch (_) {} return; }
      if (ok) { wireServer(ws, m); return; }
      // No server: host phone to phone.
      let code = '';
      for (let i = 0; i < 4; i++) code += LETTERS[(Math.random() * LETTERS.length) | 0];
      Object.assign(lobby, { code, via: 'p2p', gid: null, status: 'waiting' });
      listen();
      listener();
    });
  }
  function join(code) {
    leave();
    code = String(code).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    lobby = { code, me: 'guest', gid: newId(), host: null, guest: { name: myName() }, connected: false, status: 'joining' };
    listener();
    const L = lobby;
    viaServer({ k: 'join', code }, (ok, m, ws) => {
      if (lobby !== L) { if (ws) try { ws.close(); } catch (_) {} return; }
      if (ok) { wireServer(ws, m); return; }
      if (m && m.k === 'err' && m.why === 'full') { fail('That game is already full.'); return; }
      lobby.via = 'p2p';   // not a server game: look for a phone hosting it
      knock();
    });
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
    close(); lobby = null; role = null; endWait(); NetCore.hosting = false;
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
      if (lobby.via === 'server') rejoinServer(); else if (lobby.me === 'host') listen(); else knock();
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
    if ((performance.now() - hiddenAt) / 1000 > WAIT_LIMIT) { close(); endBattle(otherAlly(side), 'left'); return; }
    if (performance.now() - heard > SILENT) lost();
    else { send({ k: 'back' }); if (wait && !wait.peerAway) endWait(); }
  });
  setInterval(() => {
    if (link && link.dc && link.dc.readyState === 'open') send({ k: 'ping', t: performance.now() });
    if (inBattle() && lobby && lobby.connected && performance.now() - heard > SILENT && !document.hidden) lost();
    if (wait && inBattle() && !(lobby.via === 'server' && lobby.connected) && (performance.now() - wait.since) / 1000 > WAIT_LIMIT) {   // (on the server, the server decides)
      const w = allyOf(side); endWait(); close(); endBattle(w, 'left'); }
    hud();
  }, PING);

  // ---------------------------------------------------------------------------
  // Lobby, start, surrender and rematch.
  function swapSides() {
    if (!lobby || lobby.me !== 'host') return;
    lobby.host.faction = lobby.host.faction === 'allies' ? 'soviets' : 'allies';
    send({ k: 'lobby', faction: lobby.host.faction, map: lobby.host.map });
    listener();
  }
  function setMap(id) {
    if (!lobby || lobby.me !== 'host' || !lobby.host) return;
    if (onServer() && lobby.mode !== '1v1') { send({ k: 'setup', map: validMap(id) }); return; }
    lobby.host.map = validMap(id);
    send({ k: 'lobby', faction: lobby.host.faction, map: lobby.host.map });
    listener();
  }
  // On the server: the battle (mode '1v1', '2v2' or 'coop'), the computer's difficulty in co-op, a
  // side's faction (your own; the leader also the computer's), and moving to the other team.
  const onServer = () => lobby && lobby.via === 'server' && lobby.connected;
  function setMode(mode) { if (onServer() && lobby.me === 'host') send({ k: 'setup', mode }); }
  function setDiff(diff) { if (onServer() && lobby.me === 'host') send({ k: 'setup', diff }); }
  function setFaction(slot, faction) { if (onServer()) send({ k: 'faction', slot, faction }); }
  function switchTeam() { if (onServer()) send({ k: 'team' }); }
  function startBattle() {
    if (lobby && lobby.via === 'server' && lobby.me === 'host' && lobby.connected) { if (lobby.ready) send({ k: 'go' }); return; }   // the server starts it
    if (!lobby || lobby.me !== 'host' || !lobby.connected || !lobby.guest) return;
    const seed = (Math.random() * 1e9) | 0, match = newId();
    const map = validMap(lobby.host.map);
    send({ k: 'start', seed, faction: lobby.host.faction, match, map });
    begin('host', seed, lobby.host.faction, match, map);
  }
  // hostFaction: side 0's. me: this phone's side (given by the server; phone to phone the host is 0).
  // sides (from the server, team games): every side's { faction, ally, ai, name }; diff, mode likewise.
  function begin(r, seed, hostFaction, match, map, me, sides, diff, mode) {
    role = r;
    side = me !== undefined ? me : r === 'host' ? 0 : 1;
    lobby.match = match;
    NetCore.hosting = r === 'host';
    resetHost();
    endWait();
    const other = hostFaction === 'allies' ? 'soviets' : 'allies';
    let opp = lobby.me === 'host' ? lobby.guest && lobby.guest.name : lobby.host && lobby.host.name;
    let faction = side === 0 ? hostFaction : other;
    if (Array.isArray(sides) && sides[side]) {
      faction = sides[side].faction;
      const mine = sides[side].ally, names = (f) => sides.filter(f).map((x) => (x.ai ? 'Computer' : x.name || 'Commander'));
      opp = names((x) => x.ally !== mine).join(' & ');
      lobby.team = { sides, mode, mates: names((x, i) => x.ally === mine && i !== side) };
    } else { sides = null; lobby.team = null; }
    lobby.oppName = sides ? opp : null;
    UIBridge.start({ seed, faction, me: side, opponent: opp || 'Commander', map: validMap(map), sides, diff, mode });
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
    if (role === 'host' || !lobby.connected) { endWait(); endBattle(otherAlly(side), 'quit'); return; }
    send({ k: 'quit' });
    setTimeout(() => { if (inBattle()) endBattle(otherAlly(side), 'quit'); }, 3000);   // no answer: lose anyway
  }
  // After the debrief: back to the lobby, still connected, for another battle.
  function rematch() {
    const was = role;
    role = null; endWait(); NetCore.hosting = false;
    if (was && G) G.remote = false;
    if (!lobby || !lobby.connected) lobby = { failed: 'Your friend has left. Host or join a new game.' };
    hud();
    listener();
  }

  function onMessage(m) {
    if (m.k === 'ping') { send({ k: 'pong', t: m.t }); return; }
    if (m.k === 'pong') { rtt = Math.round(performance.now() - m.t); notePing(rtt); return; }
    if (m.k === 'hi') {
      if (lobby.me === 'host') lobby.guest = { name: String(m.name || 'Commander').slice(0, 20) };
      else lobby.host = Object.assign(lobby.host || { faction: 'allies' }, { name: String(m.name || 'Commander').slice(0, 20) });
      listener();
    } else if (m.k === 'lobby' && lobby.via === 'server') {
      // The server's room: who is in it, and the leader's choices.
      lobby.host = { name: String((m.host && m.host.name) || 'Commander').slice(0, 20), faction: m.faction, map: validMap(m.map) };
      lobby.guest = m.guest ? { name: String(m.guest.name || 'Commander').slice(0, 20) } : null;
      lobby.mode = m.mode || '1v1'; lobby.diff = m.diff || 'normal'; lobby.slots = Array.isArray(m.slots) ? m.slots : null;
      lobby.mine = m.mine; lobby.ready = !!m.ready; lobby.players = m.players || 0;
      listener();
    } else if (m.k === 'lobby' && lobby.me === 'guest') { lobby.host = Object.assign(lobby.host || { name: 'Commander' }, { faction: m.faction, map: validMap(m.map) }); listener(); }
    else if (m.k === 'start' && (lobby.me === 'guest' || lobby.via === 'server')) begin('guest', m.seed, m.faction, m.match, m.map, m.side, m.sides, m.diff, m.mode);
    else if (m.k === 'left' && inBattle()) hooks.eva(`${String(m.name || 'A player').slice(0, 20)} has left: the computer takes over`);
    else if (m.k === 's' && role === 'guest') applySnapshot(m);
    else if (m.k === 'end' && role === 'guest') applyEnd(m);
    else if (m.k === 'c' && role === 'host' && !G.hold) applyCommand(m);
    else if (m.k === 'away') startWait(true);
    else if (m.k === 'back' || m.k === 'resume') { if (inBattle()) endWait(); }
    else if (m.k === 'quit' && role === 'host' && inBattle()) { endWait(); endBattle(allyOf(side), 'quit'); }
    else if (m.k === 'bye') { if (inBattle()) { endWait(); close(); endBattle(allyOf(side), 'quit'); } else lost('Your friend has left. Host or join a new game.'); }
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
      const opp = lobby && (lobby.oppName ? { name: lobby.oppName } : lobby.me === 'host' ? lobby.guest : lobby.host);
      hudEl.textContent = `vs ${opp ? opp.name : '…'}${lobby.connected && rtt ? ` · ${rtt} ms` : ''}`;
      hudEl.classList.toggle('slow', rtt > 250);
    }
    waitEl.hidden = !(on && wait);
    if (on && wait) {
      const left = Math.max(0, Math.ceil(WAIT_LIMIT - (performance.now() - wait.since) / 1000));
      const who = lobby.team ? 'A player' : 'Your opponent';
      waitEl.querySelector('.nw-title').textContent = wait.peerAway && lobby.connected ? `${who} left the game for a moment` : lobby.via === 'server' && !lobby.connected ? 'Reconnecting to the game server…' : lobby.team ? 'Waiting for a player…' : 'Waiting for your opponent…';
      const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      waitEl.querySelector('.nw-sub').textContent = lobby.team ? `The battle is paused. If they are not back in ${clock}, the computer takes over their side.` : `The battle is paused. If they are not back in ${clock}, you win.`;
    }
  }

  // ---------------------------------------------------------------------------
  // Host (a phone hosting phone to phone): the snapshot engine is NetCore's, with one peer, the guest.
  const { pack, unpack, isEnt, round } = NetCore;
  let peerState = null;
  function resetHost(resync) { peerState = NetCore.peer(peerSide(), resync); NetCore.reset(); snapT = 0; }
  let snapT = 0;
  function hostTick(dt) {
    if (role === 'host') noteFrame(dt);
    if (role !== 'host' || !link || !link.dc) return;
    if ((snapT -= dt) > 0) return;
    snapT = SNAP;
    NetCore.snapshots([peerState], (P, s) => send(s), () => link.dc.bufferedAmount <= 512 * 1024);   // a slow link: skip one rather than pile up
  }
  function hookHost() {
    NetCore.hook();
    NetCore.onOver = () => {
      if (role !== 'host') return;
      NetCore.snapshots([peerState], (P, s) => send(s));
      send(NetCore.endMsg());
    };
  }

  // ---------------------------------------------------------------------------
  // Guest: orders go to the host. The sidebar's own answers (queue full, cannot place) are worked
  // out here on the copy of the battle, which the next snapshot then puts right.
  const { COMMANDS, ORIGC } = NetCore;
  const packArg = (v) => (Array.isArray(v) ? v.map(packArg) : isEnt(v) ? { $e: v.id } : v && typeof v === 'object' && v.queues ? { $t: v.id } : v);
  for (const f of COMMANDS) {
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
    if (f === 'setAssist') a[0].assist = !!a[1];
    if (f === 'setRepair') a[0].repairing = !!a[1];
    go();
    return f === 'deployFob' ? null : undefined;
  }
  const applyCommand = (m) => NetCore.applyCommand(peerSide(), m);

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
      else if (ev[0] === 'd' && NetCore.ORIG[ev[1]]) {
        const a = ev[2].map((v) => (v && v.$c ? (v.$c === 't' ? G.tctx : G.dctx) : unpack(v)));
        NetCore.ORIG[ev[1]](...a);
      }
    } catch (_) {}
  }
  function applyEnd(m) {
    if (G.over) return;
    endWait();
    G.log = unpack(m.log);
    G.over = { winner: m.over.winner, won: allyOf(G.me) === m.over.winner, t: m.over.t, how: m.over.how };
    hooks.gameOver(G.over.won);
  }
  // Each frame on the guest: glide toward the latest positions and run the eye candy.
  function guestStep(dt) {
    if (!G || G.over || G.hold) return;
    noteFrame(dt);
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
    host, join, leave, swapSides, setMap, setMode, setDiff, setFaction, switchTeam, startBattle, surrender, rematch, hostTick, guestStep, hookHost, netStats,
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
      const m = e.target.closest('[data-map]');
      if (m) { Net.setMap(m.dataset.map); return; }
      const b = e.target.closest('[data-on]');
      if (!b) return;
      const act = b.dataset.on;
      if (act === 'host') Net.host(faction);
      else if (act === 'swap') Net.swapSides();
      else if (act === 'start') Net.startBattle();
      else if (act === 'cancel') { Net.leave(); render(); }
      else if (act === 'mode') Net.setMode(b.dataset.v);
      else if (act === 'diff') Net.setDiff(b.dataset.v);
      else if (act === 'faction') Net.setFaction(+b.dataset.slot, b.dataset.v);
      else if (act === 'team') Net.switchTeam();
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
        <p class="lb-intro">Play one of your friends, phone to phone. One of you hosts and gets a 4-letter code; the other joins with it. The battle runs on the game server (or, if it cannot be reached, on the host's phone).</p>
        <div class="on-btns"><button type="button" class="pf-btn on-go" data-on="host">Host a game</button></div>
        <form class="pf-form"><label for="onCode">Join with a code</label><div class="pf-row">
          <input id="onCode" type="text" maxlength="4" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABCD" enterkeyhint="go">
          <button type="submit">Join</button></div><p class="pf-msg" role="status"></p></form>`;
      return;
    }
    if (L.status === 'starting') {
      body.innerHTML = `<p class="lb-intro">Opening a game…</p><div class="on-btns"><button type="button" class="pf-btn" data-on="cancel">Cancel</button></div>`;
      return;
    }
    if (L.via === 'server' && L.connected && L.slots) { serverLobby(L); return; }
    if (!L.connected || !L.guest) {
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
      ${me ? mapCardsHtml(validMap(L.host && L.host.map)) : `<p class="lb-intro">Map: <b>${esc(MAPS[validMap(L.host && L.host.map)].name)}</b></p>`}
      <div class="on-btns">${me ? '<button type="button" class="pf-btn" data-on="swap">Swap sides</button><button type="button" class="pf-btn on-go" data-on="start">Start battle</button>' : '<p class="pf-small">Waiting for the host…</p>'}
        <button type="button" class="pf-btn" data-on="cancel">Leave</button></div>`;
  }
  // A room on the game server: the battle (1 v 1, 2 v 2, or two of you against the computer), its
  // sides and who sits where, the map, and Start once every player's place is taken.
  const MODES = [['1v1', '1 v 1'], ['2v2', '2 v 2'], ['coop', '2 v AI']];
  const DIFFS = [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']];
  function serverLobby(L) {
    const lead = L.me === 'host', mode = L.mode || '1v1';
    const need = L.slots.filter((x) => !x.ai).length, have = L.slots.filter((x) => !x.ai && x.name).length;
    const pick = (list, cur, act, can) => `<div class="on-modes">${list.map(([k, l]) => `<button type="button" class="pf-btn${k === cur ? ' on-go' : ''}"${can ? ` data-on="${act}" data-v="${k}"` : ' disabled'} aria-pressed="${k === cur}">${l}</button>`).join('')}</div>`;
    const slot = (x, i) => {
      const you = i === L.mine, canFlip = you || (lead && x.ai);
      const who = x.ai ? 'Computer' : x.name ? esc(x.name) + (you ? ' (you)' : '') : '<i>open</i>';
      return `<tr${you ? ' class="on-you"' : ''}><td>${who}</td><td class="on-side" data-faction="${x.faction}">${canFlip ? `<button type="button" class="pf-btn" data-on="faction" data-slot="${i}" data-v="${x.faction === 'allies' ? 'soviets' : 'allies'}">${SIDE[x.faction]}</button>` : SIDE[x.faction]}</td></tr>`;
    };
    const team = (a) => `<table class="on-lobby"><caption>${mode === '1v1' ? (a === 0 ? 'Side 1' : 'Side 2') : 'Team ' + (a + 1)}</caption><tbody>${L.slots.map((x, i) => (x.ally === a ? slot(x, i) : '')).join('')}</tbody></table>`;
    const mineAlly = L.slots[L.mine] && L.slots[L.mine].ally;
    const canMove = mode === '2v2' && L.slots.some((x, i) => x.ally !== mineAlly && !x.ai && !x.name);
    body.innerHTML = `<p class="on-code" aria-label="Room code">${esc(L.code)}</p>
      <p class="lb-intro">${have < need ? `Friends join with this code (${have} of ${need} players here).` : lead ? 'Everyone is here. Start when ready.' : 'Everyone is here. The leader starts the battle.'}</p>
      ${pick(MODES, mode, 'mode', lead)}
      ${mode === 'coop' ? pick(DIFFS, L.diff || 'normal', 'diff', lead) : ''}
      <div class="on-teams">${team(0)}${team(1)}</div>
      ${canMove ? '<div class="on-btns"><button type="button" class="pf-btn" data-on="team">Switch team</button></div>' : ''}
      ${lead ? mapCardsHtml(validMap(L.host && L.host.map)) : `<p class="lb-intro">Map: <b>${esc(MAPS[validMap(L.host && L.host.map)].name)}</b></p>`}
      <div class="on-btns">${lead ? `<button type="button" class="pf-btn on-go" data-on="start"${L.ready ? '' : ' disabled'}>Start battle</button>` : '<p class="pf-small">Waiting for the leader…</p>'}
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
