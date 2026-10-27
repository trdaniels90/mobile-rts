'use strict';
// Anonymous match reports and the leaderboard, kept on Supabase (see supabase/schema.sql).
// A match is saved when it starts (a random id, side, difficulty and a random id for this
// device), kept alive by a heartbeat while it runs, and finished with the result and the
// debrief's numbers. None of it may ever get in the way of the game: every call is wrapped,
// times out quickly and fails silently, so offline play is exactly as before.
const Report = (() => {
  const API = 'https://yorrgemlhoxbxvyvzcwe.supabase.co/rest/v1/';
  const KEY = 'sb_publishable_FkCzdcgsEyqNy_UwmajBiQ_kp8V2Vi6';   // the public key: only allows what the table rules allow
  const TIMEOUT = 5000, BEAT = 60 * 1000;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  function uuid() {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (_) {}
    let b;
    try { b = crypto.getRandomValues(new Uint8Array(16)); } catch (_) { b = Array.from({ length: 16 }, () => (Math.random() * 256) | 0); }
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (_) {} return null; };
  // Copies run from a computer for development or testing (localhost, a local file) report nothing,
  // so test runs never show up in the stats.
  let local = true;
  try { local = location.protocol === 'file:' || /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)$/.test(location.hostname); } catch (_) {}
  let device = store('ps-device');
  if (!device || !UUID.test(device)) { device = uuid(); store('ps-device', device); }

  // One request: resolves to the parsed answer (or true), or null on any failure.
  function post(path, body, parse) {
    try {
      if (typeof fetch !== 'function') return Promise.resolve(null);
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(() => { try { ctl && ctl.abort(); } catch (_) {} }, TIMEOUT);
      return fetch(API + path, {
        method: 'POST', signal: ctl ? ctl.signal : undefined,
        headers: { apikey: KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(body),
      }).then((r) => (!r.ok ? null : parse ? r.json() : true))
        .catch(() => null)
        .then((v) => { clearTimeout(timer); return v; });
    } catch (_) { return Promise.resolve(null); }
  }

  let match = null;   // { id, row, saved: promise of true/null, ended }
  const insert = (m) => post('matches', m.row);
  function start(side, difficulty) {
    try {
      quit();
      if (local) return;
      const row = { id: uuid(), device_id: device, mode: 'skirmish', side, difficulty, version: typeof VERSION === 'string' ? VERSION : null };
      match = { id: row.id, row, ended: false };
      match.saved = insert(match);
    } catch (_) {}
  }
  function finish(result, seconds, stats) {
    const m = match;
    if (!m || m.ended) return Promise.resolve(null);
    m.ended = true;
    const send = () => post('rpc/match_end', { p_id: m.id, p_device: device, p_result: result, p_duration: Math.max(0, Math.round(seconds || 0)), p_stats: stats || null });
    // Started offline? Save the start now, so the result still counts.
    return (m.done = m.saved.then((ok) => (ok ? send() : insert(m).then((ok2) => (ok2 ? send() : null)))));
  }
  // The end-of-game numbers: both sides' stats and the debrief's log (without the graph if it is too big).
  function stats() {
    const out = { teams: G.teams.map((t) => ({ faction: t.faction, ai: t.isAI, stats: t.stats })),
      log: { samples: G.log.samples, events: G.log.events, fallen: G.log.fallen, waves: G.log.waves } };
    if (JSON.stringify(out).length > 90000) delete out.log.samples;
    return out;
  }
  function end(won) {
    try { return finish(won ? 'win' : 'loss', G.over ? G.over.t : G.t, stats()); } catch (_) { return Promise.resolve(null); }
  }
  // Leaving a match before it is decided (a new mission from the pause menu).
  function quit() {
    try { if (match && !match.ended) finish('quit', G ? G.t : 0, null); } catch (_) {}
  }
  // The heartbeat lets the stats page count who is playing right now.
  setInterval(() => {
    try {
      if (!match || match.ended || document.hidden) return;
      const m = match;
      m.saved.then((ok) => { if (ok && !m.ended) post('rpc/match_heartbeat', { p_id: m.id, p_device: device }); });
    } catch (_) {}
  }, BEAT);

  // The name for the leaderboard, kept on this device. Resolves true when it reached the server.
  function submitName(name) {
    try {
      name = String(name || '').trim().slice(0, 20);
      if (!name) return Promise.resolve(false);
      store('ps-name', name);
      const m = match;
      if (!m || !m.done) return Promise.resolve(false);
      return m.done.then((ok) => (ok ? post('rpc/match_name', { p_id: m.id, p_device: device, p_name: name }) : null)).then(Boolean);
    } catch (_) { return Promise.resolve(false); }
  }
  // Leaderboard rows for a mode ('skirmish' now; 'pve' and 'pvp' later), or null when offline.
  function board(mode) {
    return post('rpc/get_leaderboard', { p_mode: mode || 'skirmish', p_limit: 100 }, true).then((v) => (Array.isArray(v) ? v : null));
  }
  return { start, end, quit, submitName, board, get name() { return store('ps-name') || ''; }, get matchId() { return match && match.id; } };
})();

// The leaderboard page, on the same paper as What's New, and the name box in the debrief.
const Leaderboard = (() => {
  // One tab per kind of match; PvE and PvP boards slot in here when they exist.
  const MODES = [{ key: 'skirmish', label: 'Vs computer', intro: 'Wins against the computer: Hard first, then Normal, then Easy, fastest first. Each name\'s best time at each difficulty.' }];
  const DIFF = { hard: 'Hard', normal: 'Normal', easy: 'Easy' }, SIDE = { allies: 'Allies', soviets: 'Soviets' };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  let root = null, mode = MODES[0].key, req = 0;

  function build() {
    root = document.createElement('div');
    root.id = 'board';
    root.hidden = true;
    root.innerHTML = `<div class="fm-book" role="dialog" aria-modal="true" aria-labelledby="boardTitle">
      <header class="fm-top"><span class="fm-brand">Honour Roll</span>
        <div class="fm-tabs">${MODES.length > 1 ? MODES.map((m) => `<button type="button" data-mode="${m.key}">${esc(m.label)}</button>`).join('') : ''}</div>
        <button type="button" class="fm-close" aria-label="Close the leaderboard">✕</button></header>
      <div class="fm-page"><h2 id="boardTitle">Leaderboard</h2><p class="lb-intro"></p><div class="lb-body"></div></div>
    </div>`;
    document.body.appendChild(root);
    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-mode]');
      if (t) { mode = t.dataset.mode; load(); }
      if (e.target.closest('.lb-retry')) load();
      if (e.target.closest('.fm-close') || e.target === root) close();
    });
    document.addEventListener('keydown', (e) => { if (!root.hidden && e.key === 'Escape') { close(); e.stopPropagation(); } }, true);
  }
  function load() {
    const m = MODES.find((x) => x.key === mode), body = root.querySelector('.lb-body'), my = Report.name.toLowerCase(), n = ++req;
    for (const b of root.querySelectorAll('[data-mode]')) b.setAttribute('aria-current', String(b.dataset.mode === mode));
    root.querySelector('.lb-intro').textContent = m.intro;
    body.innerHTML = '<p class="lb-note">Loading the leaderboard…</p>';
    Report.board(mode).then((rows) => {
      if (n !== req) return;
      if (!rows) { body.innerHTML = '<p class="lb-note">The leaderboard needs a connection. <button type="button" class="lb-retry">Try again</button></p>'; return; }
      if (!rows.length) { body.innerHTML = '<p class="lb-note">No names yet. Win a mission and enter your name in the debrief to be the first.</p>'; return; }
      body.innerHTML = `<div class="lb-scroll"><table class="fm-table lb-table"><thead><tr><th>#</th><th>Commander</th><th>Difficulty</th><th>Side</th><th>Time</th><th>Date</th></tr></thead><tbody>${
        rows.map((r) => `<tr${my && String(r.player_name).toLowerCase() === my ? ' class="lb-me"' : ''}><td>${Number(r.rank)}</td><td>${esc(r.player_name)}</td><td>${DIFF[r.difficulty] || esc(r.difficulty || '')}</td><td>${SIDE[r.side] || esc(r.side)}</td><td class="lb-time">${fmt(Number(r.duration_s))}</td><td>${esc(new Date(r.ended_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))}</td></tr>`).join('')
      }</tbody></table></div>`;
    });
  }
  function open() { if (!root) build(); root.hidden = false; root.querySelector('.fm-page').scrollTop = 0; root.querySelector('.fm-close').focus(); load(); }
  function close() { if (root) root.hidden = true; }

  // After a win: a box in the debrief for the name to go on the board.
  function nameBox() {
    const box = document.createElement('form');
    box.className = 'db-name';
    box.innerHTML = `<label for="lbName">Your name for the leaderboard</label>
      <div class="db-name-row"><input id="lbName" type="text" placeholder="Commander name" maxlength="20" autocomplete="nickname" enterkeyhint="send" spellcheck="false">
      <button type="submit">Submit</button></div><p class="db-name-msg" role="status"></p>`;
    const input = box.querySelector('input'), btn = box.querySelector('button'), msg = box.querySelector('.db-name-msg');
    input.value = Report.name;
    box.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) { msg.textContent = 'Type a name first.'; return; }
      btn.disabled = true; msg.textContent = 'Sending…';
      Report.submitName(name).then((ok) => {
        btn.disabled = false;
        if (ok) { box.classList.add('sent'); msg.textContent = `On the leaderboard as ${name}.`; btn.textContent = 'Change'; }
        else msg.textContent = 'Could not reach the leaderboard. Check your connection and try again.';
      });
    });
    return box;
  }
  return { open, close, nameBox };
})();
