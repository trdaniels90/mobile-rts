'use strict';
// Anonymous match reports and the leaderboard, kept on Supabase (see supabase/schema.sql).
// A match is saved when it starts (a random id, side, difficulty and a random id for this
// device), kept alive by a heartbeat while it runs, and finished with the result and the
// debrief's numbers. None of it may ever get in the way of the game: every call is wrapped,
// times out quickly and fails silently, so offline play is exactly as before.
// The Supabase project, shared with player profiles (profile.js).
const SUPABASE = {
  url: 'https://yorrgemlhoxbxvyvzcwe.supabase.co/',
  key: 'sb_publishable_FkCzdcgsEyqNy_UwmajBiQ_kp8V2Vi6',   // the public key: only allows what the table rules allow
};
const Report = (() => {
  const API = SUPABASE.url + 'rest/v1/', KEY = SUPABASE.key;
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
  // keepalive: the request may finish after the page is closed (browsers allow it under 64 KB).
  function post(path, body, parse, keepalive) {
    try {
      if (typeof fetch !== 'function') return Promise.resolve(null);
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(() => { try { ctl && ctl.abort(); } catch (_) {} }, TIMEOUT);
      const json = JSON.stringify(body);
      const headers = { apikey: KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
      // Signed in: the request carries the account, so a match started now belongs to it.
      const token = typeof Account !== 'undefined' ? Account.token() : null;
      if (token) headers.Authorization = 'Bearer ' + token;
      return fetch(API + path, {
        method: 'POST', signal: ctl ? ctl.signal : undefined, keepalive: !!keepalive && json.length < 60000,
        headers,
        body: json,
      }).then((r) => (!r.ok ? null : parse ? r.json() : true))
        .catch(() => null)
        .then((v) => { clearTimeout(timer); return v; });
    } catch (_) { return Promise.resolve(null); }
  }

  let match = null;   // { id, row, saved: promise of true/null, ended }
  const insert = (m) => post('matches', m.row);
  // mode: 'skirmish' against the computer, or 'pvp' online, with the opponent's name.
  // Errors during a match (the main loop catches them so the game keeps going): the first few
  // distinct ones, with how often each came back, go into the match's stats so a freeze or glitch
  // a player reports can be traced to the line that broke.
  let errs = [];
  function oops(where, e) {
    try {
      const msg = String((e && e.message) || e).slice(0, 200);
      const old = errs.find((x) => x.where === where && x.msg === msg);
      if (old) { old.n++; return; }
      if (errs.length >= 6) return;
      const stack = String((e && e.stack) || '').split('\n').slice(0, 6).map((l) => l.trim().replace(/^.*\/(src\/)/, '$1')).join(' | ').slice(0, 600);
      errs.push({ where, msg, stack, t: G ? Math.round(G.t) : null, n: 1, v: typeof VERSION === 'string' ? VERSION : null });
      try { console.error('[' + where + ']', e); } catch (_) {}
    } catch (_) {}
  }
  try {
    window.addEventListener('error', (ev) => oops('window', ev.error || ev.message));
    window.addEventListener('unhandledrejection', (ev) => oops('promise', ev.reason));
  } catch (_) {}
  function start(side, difficulty, mode = 'skirmish', opponent = null) {
    errs = [];
    try {
      quit();
      if (local) return;
      const row = { id: uuid(), device_id: device, mode, side, difficulty, version: typeof VERSION === 'string' ? VERSION : null };
      if (opponent) row.opponent = String(opponent).slice(0, 20);
      match = { id: row.id, row, ended: false };
      match.saved = insert(match);
    } catch (_) {}
  }
  // A saved skirmish continued: carry on its match rather than start another, so one game is one
  // match however often it is saved and continued (and its play time counts once). The insert makes
  // sure the match exists (it may have started offline); if it already does, it is refused, which
  // is fine.
  function resume(id, side, difficulty) {
    errs = [];
    try {
      if (!id || !UUID.test(id)) return start(side, difficulty);
      quit();
      if (local) return;
      const row = { id, device_id: device, mode: 'skirmish', side, difficulty, version: typeof VERSION === 'string' ? VERSION : null };
      match = { id, row, ended: false };
      match.saved = insert(match).then(() => true);
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
  // Everything the debrief shows: the player's surviving units with kills sit beside the fallen ones,
  // and unit names come along so the stats page can show them.
  function stats() {
    const alive = unitsOf(G.me).filter((u) => u.kills).map((u) => ({ type: u.type, faction: u.faction, kills: u.kills, worth: u.killWorth, born: u.born, died: null }));
    const names = {};
    const fallen = G.log.fallen.filter((u) => u.team === G.me).map(({ team, ...u }) => u);   // this device's side, as the stats page expects
    for (const u of alive.concat(fallen)) names[u.type] = UNIT_DEFS[u.type].name;
    const out = { player: G.me, teams: G.teams.map((t) => ({ faction: t.faction, ai: t.isAI, stats: t.stats })),
      log: { samples: G.log.samples, events: G.log.events, fallen, alive, waves: G.log.waves }, names };
    if (errs.length) out.errors = errs;
    // Team battles: sides per alliance (2 for 2 v 2 and co-op, 3 for 3 v 3 and 3 v AI), so boards can tell them apart.
    if (G.teams.length > 2) out.size = G.teams.filter((t) => t.ally === G.teams[G.me].ally).length;
    // Online: the battle's id, the same on every phone in it, so the co-op board shows a team's win once.
    try { const b = typeof Net !== 'undefined' && Net.lobby && Net.role && Net.lobby.match; if (b) out.battle = String(b).slice(0, 64); } catch (_) {}
    try { const n = typeof Net !== 'undefined' && Net.netStats(); if (n) out.net = n; } catch (_) {}
    try { const f = frameStats(); if (f) out.frames = f; } catch (_) {}
    while (JSON.stringify(out).length > 90000 && out.log.samples.length > 40) out.log.samples = out.log.samples.filter((_, i) => i % 2 === 0);   // a very long game: a coarser graph
    if (JSON.stringify(out).length > 90000) delete out.log.samples;
    return out;
  }
  // How smoothly the battle ran on this device, per minute of battle: frames per second, frames over 50 and 100 ms
  // (stutters), the worst frame, the average time a frame spent in the simulation and in drawing, camera jumps
  // (more than half a screen in one frame, as from a minimap tap), frames with ground still painting on screen
  // (art.js makeGround, the stand-in colours), and units alive. Kept in G.perf, so a saved game keeps its minutes.
  let frameAt = 0;
  function noteFrame(now, upd, drw, camJump) {
    try {
      const gap = (now - frameAt) / 1000;
      frameAt = now;
      if (!G || G.over || G.paused || G.hold || gap > 1 || document.hidden) return;   // a gap over a second is a pause
      const P = G.perf || (G.perf = { min: [] }), i = Math.min(180, Math.floor(G.t / 60));
      const m = P.min[i] || (P.min[i] = { m: i, f: 0, ft: 0, slow: 0, long: 0, worst: 0, upd: 0, drw: 0, jumps: 0, wait: 0, units: 0 });
      m.f++; m.ft += gap; m.upd += upd; m.drw += drw;
      if (gap > 0.05) m.slow++;
      if (gap > 0.1) m.long++;
      m.worst = Math.max(m.worst, gap * 1000);
      if (camJump) m.jumps++;
      if (G.ground && G.ground.missing) m.wait++;
      if (!m.units) m.units = G.entities.filter((e) => e.alive && e.kind === 'unit').length;
    } catch (_) {}
  }
  function frameStats() {
    if (!G || !G.perf) return null;
    let sc = {};
    try { sc = { cores: navigator.hardwareConcurrency || null, w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1 }; } catch (_) {}
    return { ...sc, minutes: G.perf.min.filter(Boolean).map((m) => ({ m: m.m, fps: m.ft ? Math.round(m.f / m.ft) : null, slow: m.slow, long: m.long,
      worst: Math.round(m.worst), upd: +(m.upd / m.f).toFixed(1), drw: +(m.drw / m.f).toFixed(1), jumps: m.jumps, wait: m.wait, units: m.units })) };
  }
  function end(won) {
    try { return finish(won ? 'win' : 'loss', G.over ? G.over.t : G.t, stats()); } catch (_) { return Promise.resolve(null); }
  }
  // Leaving a match before it is decided (Quit mission, or a new mission from the pause menu),
  // with the debrief numbers so far.
  function quit() {
    try {
      if (!match || match.ended) return;
      let s = null;
      try { s = stats(); } catch (_) {}
      finish('quit', G ? G.t : 0, s);
    } catch (_) {}
  }
  // The heartbeat lets the stats page count who is playing right now. It carries the debrief numbers
  // so far, so a match the app is closed on keeps them up to its last minute; leaving the app sends
  // one straight away.
  function progress(keepalive) {
    try {
      if (!match || match.ended || !G || G.over) return;
      const m = match, t = Math.round(G.t);
      let s = null;
      try { s = stats(); } catch (_) {}
      m.saved.then((ok) => { if (ok && !m.ended) post('rpc/match_progress', { p_id: m.id, p_device: device, p_duration: t, p_stats: s }, false, keepalive); });
    } catch (_) {}
  }
  setInterval(() => { try { if (!document.hidden) progress(false); } catch (_) {} }, BEAT);
  try { document.addEventListener('visibilitychange', () => { try { if (document.hidden) progress(true); } catch (_) {} }); } catch (_) {}

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
  // A win's leaderboard score; the same sum as match_score in supabase/schema.sql (change both):
  // 10 a kill, 50 a building destroyed, 1 per 100 ore, plus a speed bonus of 5000 that shrinks
  // with time, all times the difficulty.
  function score(stats, seconds, difficulty) {
    const base = (stats.killed || 0) * 10 + (stats.bldKilled || 0) * 50 + (stats.harvested || 0) / 100 + 5000 * Math.exp(-Math.max(0, Math.round(seconds || 0)) / 900);
    return Math.round(base * (difficulty === 'hard' ? 1.5 : difficulty === 'easy' ? 0.5 : 1));
  }
  // Co-op: the team's numbers, every player's side added up (the same sum as team_score in schema.sql).
  function teamStats() {
    const t = { killed: 0, bldKilled: 0, harvested: 0 };
    for (const x of G.teams) if (!x.isAI) for (const k in t) t[k] += x.stats[k] || 0;
    return t;
  }
  // Leaderboard rows for a mode ('skirmish', or 'pve' for online co-op), or null when offline.
  function board(mode) {
    return post('rpc/get_leaderboard', { p_mode: mode || 'skirmish', p_limit: 5 }, true).then((v) => (Array.isArray(v) ? v : null));
  }
  // Signed in: link this phone's matches that belong to nobody yet to the account (see claim_device).
  function claim() { return local ? Promise.resolve(null) : post('rpc/claim_device', { p_device: device }, true); }
  // The name for the leaderboard: the commander name of a signed-in player, else the last one typed here.
  const name = () => (typeof Account !== 'undefined' && Account.name) || store('ps-name') || '';
  return { start, resume, end, quit, oops, noteFrame, get errors() { return errs; }, submitName, board, claim, score, teamStats, get name() { return name(); }, get matchId() { return match && match.id; } };
})();

// The leaderboard page, on the same paper as What's New, and the name box in the debrief.
const Leaderboard = (() => {
  // One tab per kind of match (a PvP board can slot in here later).
  const MODES = [{ key: 'skirmish', label: 'Vs computer', intro: 'The five best scores against the computer at each difficulty, hardest first. A win scores 10 points a kill, 50 a building destroyed and 1 per 100 ore, plus a speed bonus of up to 5,000 that shrinks the longer the battle runs, times 1.5 on Hard and 0.5 on Easy. Each commander\'s best score at each difficulty counts.' },
    { key: 'pve', label: 'Co-op', team: true, intro: 'Online co-op, two players against two computers: the five best teams at each difficulty, hardest first. The team scores together, the same way as against the computer (10 a kill, 50 a building, 1 per 100 ore, the speed bonus, times the difficulty). Either teammate can enter a name after a win, and both names appear. Each team\'s best score at each difficulty counts.' }];
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
      if (!rows.length) { body.innerHTML = `<p class="lb-note">No names yet. Win ${m.team ? 'a co-op battle' : 'a mission'} and enter your name in the debrief to be the first.</p>`; return; }
      // Ranks restart at each difficulty, so each gets its own short table.
      const row = (r) => `<tr${my && String(r.player_name).toLowerCase().split(' & ').includes(my) ? ' class="lb-me"' : ''}><td>${Number(r.rank)}</td><td>${esc(r.player_name)}</td><td>${String(r.side || '').split(' & ').map((x) => SIDE[x] || esc(x)).join(' & ')}</td><td class="lb-score">${r.score == null ? '' : Number(r.score).toLocaleString('en-US')}</td><td class="lb-time">${fmt(Number(r.duration_s))}</td><td>${esc(new Date(r.ended_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))}</td></tr>`;
      const groups = [];
      for (const r of rows) { const g = groups[groups.length - 1]; if (g && g.d === r.difficulty) g.rows.push(r); else groups.push({ d: r.difficulty, rows: [r] }); }
      body.innerHTML = groups.map((g) => `<h4>${DIFF[g.d] || esc(g.d || '')}</h4><div class="lb-scroll"><table class="fm-table lb-table"><thead><tr><th>#</th><th>${m.team ? 'Team' : 'Commander'}</th><th>Side</th><th>Score</th><th>Time</th><th>Date</th></tr></thead><tbody>${g.rows.map(row).join('')}</tbody></table></div>`).join('');
    });
  }
  function open() { if (!root) build(); root.hidden = false; root.querySelector('.fm-page').scrollTop = 0; root.querySelector('.fm-close').focus(); load(); }
  function close() { if (root) root.hidden = true; }

  // After a win: a box in the debrief for the name to go on the board.
  function nameBox(points) {
    const box = document.createElement('form');
    box.className = 'db-name';
    box.innerHTML = `<label for="lbName">${points != null ? `Leaderboard score: ${Number(points).toLocaleString('en-US')}. ` : ''}Your name for the leaderboard</label>
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
