'use strict';
// Chat and map pings in online battles (phones, tablets and computers alike).
// - Chat: to everyone, or (team games) to your own team only. A box with a text field and quick messages; on a
//   computer Enter opens it (team chat in a team game), Shift+Enter opens it to everyone, Enter sends, Escape closes.
// - Pings (team games with another player on your side): the PING button, then a tap on the map or the radar; on a
//   computer Alt+click does it straight away. Your allies see rings at the spot, a pulse on the radar and a line in
//   the chat log; tapping that line takes the camera there.
// Messages go through net.js (Net.talk): { k: 'chat', text, team } and { k: 'mark', x, y } (world pixels). The game
// server passes chat to everyone or the sender's team and pings to the team only, with the sender's name and side;
// phone to phone (1 v 1) they go straight to the other phone. Nothing here touches the battle itself.
const Chat = (() => {
  const MAX_TEXT = 160, LOG_LIFE = 12000, PING_LIFE = 8000, HISTORY = 40;
  const QUICK = ['Attack here!', 'Need help!', 'Defend!', 'On my way', 'Wait for me', 'Retreat!', 'Good game'];
  let root = null, logEl = null, boxEl = null, histEl = null, input = null, toBtn = null, chatBtn = null, pingBtn = null;
  let teamTo = true, armed = false, shown = false, unread = 0;
  const pings = [], history = [];

  // Who this battle lets us talk to: { on, team (a team game), mates (other players on our side) }.
  function info() {
    const lb = typeof Net !== 'undefined' && Net.role && Net.lobby;
    if (!lb || !G || !lb.connected) return { on: false, team: false, mates: 0 };
    const t = lb.team, mine = t && t.sides[G.me] ? t.sides[G.me].ally : null;
    const mates = t ? t.sides.filter((x, i) => i !== G.me && !x.ai && x.ally === mine).length : 0;
    return { on: true, team: !!t, mates };
  }
  const colorOf = (side) => (G && G.teams[side] && G.teams[side].pal ? G.teams[side].pal.light : '#ffd23e');
  const clean = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_TEXT);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function build() {
    root = document.createElement('div'); root.id = 'talk';
    root.innerHTML = `<div id="chatLog" aria-live="polite"></div>
      <div id="talkBtns"><button type="button" class="icon talk-btn" id="chatBtn" title="Chat (Enter)"><span>💬</span><small>CHAT</small><b class="talk-new" hidden></b></button>
        <button type="button" class="icon talk-btn" id="pingBtn" aria-pressed="false" title="Ping the map for your allies (or Alt+click)"><span>📍</span><small>PING</small></button></div>
      <div id="chatBox" hidden role="dialog" aria-label="Chat">
        <div class="cb-hist"></div>
        <form class="cb-row"><button type="button" class="cb-to"></button>
          <input type="text" maxlength="${MAX_TEXT}" enterkeyhint="send" autocomplete="off" autocapitalize="sentences" placeholder="Message">
          <button type="submit" class="cb-send">Send</button><button type="button" class="cb-close" aria-label="Close chat">✕</button></form>
        <div class="cb-quick">${QUICK.map((q) => `<button type="button" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      </div>`;
    document.body.appendChild(root);
    logEl = root.querySelector('#chatLog'); boxEl = root.querySelector('#chatBox'); histEl = root.querySelector('.cb-hist');
    input = root.querySelector('input'); toBtn = root.querySelector('.cb-to');
    chatBtn = root.querySelector('#chatBtn'); pingBtn = root.querySelector('#pingBtn');
    chatBtn.addEventListener('click', () => (shown ? close() : open()));
    pingBtn.addEventListener('click', () => arm(!armed));
    toBtn.addEventListener('click', () => { teamTo = !teamTo; label(); if (!touch()) input.focus(); });
    root.querySelector('.cb-close').addEventListener('click', close);
    root.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); say(input.value); input.value = ''; if (!touch()) close(); });
    root.querySelector('.cb-quick').addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) { say(b.dataset.q); close(); } });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } e.stopPropagation(); });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    // A ping line in the log: the camera goes to it.
    const jump = (e) => { const l = e.target.closest('[data-x]'); if (l && typeof UIBridge.lookAt === 'function') UIBridge.lookAt(+l.dataset.x, +l.dataset.y); };
    logEl.addEventListener('click', jump); histEl.addEventListener('click', jump);
    window.addEventListener('keydown', (e) => {
      // (a field still focused but no longer on screen, like the room code typed to join, does not count as typing)
      const typing = e.target.closest && e.target.closest('input, textarea, select') && e.target.getClientRects().length;
      if (e.key !== 'Enter' || shown || !info().on || G.over || typing) return;
      if (document.querySelector('#menu:not([hidden]), #online:not([hidden])')) return;
      e.preventDefault(); open(e.shiftKey ? false : null);
    });
  }
  const touch = () => matchMedia('(pointer: coarse)').matches;
  function label() {
    const team = info().team;
    toBtn.hidden = !team;
    toBtn.textContent = teamTo ? 'Team' : 'All';
    toBtn.classList.toggle('all', !teamTo);
    input.placeholder = !team ? 'Message' : teamTo ? 'Message your team' : 'Message everyone';
  }
  function open(team) {
    if (!root) build();
    if (team !== undefined && team !== null) teamTo = team; else if (team === null) teamTo = true;
    shown = true; unread = 0; boxEl.hidden = false; label(); paintHistory(); badge();
    if (!touch()) input.focus();
  }
  function close() { if (!boxEl) return; shown = false; boxEl.hidden = true; input.blur(); }
  function arm(on) {
    armed = !!on && info().mates > 0;
    if (pingBtn) pingBtn.setAttribute('aria-pressed', String(armed));
    if (armed && typeof UIBridge.eva === 'function') UIBridge.eva('Tap the map or the radar to ping');
  }

  // Sending. Shown here at once; the other side's copy comes back through the network.
  function say(text) {
    text = clean(text);
    const i = info();
    if (!text || !i.on) return;
    const team = i.team && teamTo;
    Net.talk({ k: 'chat', text, team, side: G.me, from: myName() });
    add({ side: G.me, from: myName(), text, team, mine: true });
  }
  function ping(x, y) {
    arm(false);
    if (!info().mates) return;
    x = Math.max(0, Math.min(WORLD, Math.round(x))); y = Math.max(0, Math.min(WORLD, Math.round(y)));
    Net.talk({ k: 'mark', x, y, side: G.me, from: myName() });
    mark({ side: G.me, x, y, from: myName(), mine: true });
  }
  const myName = () => String((typeof Account !== 'undefined' && Account.name) || 'Commander').slice(0, 20);

  // Receiving (net.js onMessage).
  function receive(m) {
    if (!G || !info().on) return;
    const side = Number.isInteger(m.side) && G.teams[m.side] ? m.side : (G.me === 0 ? 1 : 0);
    const from = String(m.from || 'Commander').slice(0, 20);
    if (m.k === 'chat') { const text = clean(m.text); if (text) { add({ side, from, text, team: !!m.team }); if (typeof Sound !== 'undefined') Sound.play('click', 0.7); } }
    else if (m.k === 'mark' && isFinite(m.x) && isFinite(m.y)) mark({ side, from, x: +m.x, y: +m.y });
  }
  function mark(p) {
    const now = performance.now();
    for (let i = pings.length - 1; i >= 0; i--) if (pings[i].side === p.side) pings.splice(i, 1);   // one ping a player at a time
    pings.push(Object.assign(p, { t: now }));
    add({ side: p.side, from: p.from, mine: p.mine, text: p.mine ? 'pinged the map' : 'pinged the map: tap to look', ping: p, team: true });
    if (!p.mine && typeof Sound !== 'undefined') Sound.play('ready', 0.9);
  }
  function add(l) {
    l.t = performance.now();
    history.push(l); if (history.length > HISTORY) history.shift();
    if (!root) build();
    if (!shown && !l.mine) { unread++; badge(); }
    const el = line(l);
    logEl.appendChild(el);
    while (logEl.children.length > 6) logEl.firstChild.remove();
    setTimeout(() => el.classList.add('old'), LOG_LIFE);
    setTimeout(() => el.remove(), LOG_LIFE + 1200);
    if (shown) paintHistory();
  }
  function line(l) {
    const el = document.createElement('div');
    el.className = 'cl-line' + (l.ping ? ' cl-ping' : '');
    if (l.ping) { el.dataset.x = l.ping.x; el.dataset.y = l.ping.y; }
    const tag = info().team ? `<i>${l.team ? '[Team]' : '[All]'}</i> ` : '';
    el.innerHTML = `${tag}<b style="color:${esc(colorOf(l.side))}">${esc(l.mine ? 'You' : l.from)}${l.ping ? '' : ':'}</b> ${esc(l.text)}`;
    return el;
  }
  function paintHistory() {
    histEl.innerHTML = '';
    if (!history.length) { histEl.innerHTML = '<p class="cb-empty">No messages yet.</p>'; return; }
    for (const l of history) histEl.appendChild(line(l));
    histEl.scrollTop = histEl.scrollHeight;
  }
  function badge() {
    if (!chatBtn) return;
    const b = chatBtn.querySelector('.talk-new');
    b.hidden = !unread || shown; b.textContent = unread > 9 ? '9+' : String(unread);
  }

  // Called every frame by ui.js: the buttons only in an online battle, the ping button only with a player ally.
  let was = '';
  function tick() {
    const i = info(), on = i.on && G && !G.over;
    const sig = `${on}|${i.mates}`;
    if (sig !== was) {
      was = sig;
      if (on && !root) build();
      if (root) {
        root.hidden = !on;
        pingBtn.hidden = !i.mates;
        if (!on) { close(); arm(false); pings.length = 0; history.length = 0; logEl.innerHTML = ''; unread = 0; badge(); }
      }
    }
    const now = performance.now();
    for (let n = pings.length - 1; n >= 0; n--) if (now - pings[n].t > PING_LIFE) pings.splice(n, 1);
  }

  // Drawing. proj(x, y) gives the spot on the view (ui.js, the HUD's view pixels). Rings spread out three times, then a
  // pin stays until the ping is old.
  function drawView(v, proj) {
    const now = performance.now();
    for (const p of pings) {
      const age = (now - p.t) / 1000, [x, y] = proj(p.x, p.y), c = colorOf(p.side), fade = Math.min(1, (PING_LIFE / 1000 - age) / 1.5);
      v.save();
      v.lineWidth = 1.5; v.strokeStyle = c;
      for (let r = 0; r < 3; r++) {
        const k = age * 1.2 - r * 0.33;
        if (k < 0 || k > 1 || age > 2.6) continue;
        v.globalAlpha = (1 - k) * 0.95;
        v.beginPath(); v.ellipse(x, y, 4 + k * 26, (4 + k * 26) * 0.6, 0, 0, 7); v.stroke();
      }
      v.globalAlpha = Math.max(0, fade);
      const bob = Math.sin(age * 5) * 1.5;
      v.fillStyle = 'rgba(0,0,0,0.6)'; v.beginPath(); v.ellipse(x, y, 4, 2.4, 0, 0, 7); v.fill();
      v.strokeStyle = '#111'; v.lineWidth = 1; v.beginPath(); v.moveTo(x, y); v.lineTo(x, y - 14 + bob); v.stroke();
      v.fillStyle = c; v.beginPath(); v.arc(x, y - 17 + bob, 4, 0, 7); v.fill(); v.stroke();
      v.font = 'bold 7px sans-serif'; v.textAlign = 'center'; v.textBaseline = 'bottom';
      const name = p.mine ? 'You' : p.from, tw = v.measureText(name).width;
      v.fillStyle = 'rgba(0,0,0,0.65)'; v.fillRect(x - tw / 2 - 2, y - 32 + bob, tw + 4, 9);
      v.fillStyle = c; v.fillText(name, x, y - 23.5 + bob);
      v.restore();
    }
  }
  function drawRadar(g, k, dpr) {   // k: radar pixels a world pixel
    const now = performance.now();
    for (const p of pings) {
      const age = (now - p.t) / 1000, x = p.x * k, y = p.y * k, r = (3 + (age * 1.5 % 1) * 9) * dpr;
      g.save();
      g.strokeStyle = colorOf(p.side); g.lineWidth = 1.5 * dpr;
      g.globalAlpha = 1 - (age * 1.5 % 1);
      g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
      g.globalAlpha = 1; g.fillStyle = colorOf(p.side); g.fillRect(x - dpr * 1.5, y - dpr * 1.5, dpr * 3, dpr * 3);
      g.restore();
    }
  }

  return {
    tick, receive, ping, open, close, drawView, drawRadar,
    get armed() { return armed; }, disarm() { arm(false); },
    get busy() { return pings.length > 0; },   // keep drawing every frame while a ping is on the map
    get canPing() { return info().mates > 0 && !!G && !G.over; },
  };
})();
