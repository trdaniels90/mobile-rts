'use strict';
// Player profiles: a Supabase account, signed in with an email address and a one-time code (no
// password), and a commander name. Signing in links the phone's matches, past ones included, and
// the profile page adds them up (see supabase/profiles.sql). Playing without an account works as
// before. As in report.js, nothing here may get in the way of the game: every call is wrapped and
// fails quietly, and the session is kept only on this phone.
const Account = (() => {
  const AUTH = SUPABASE.url + 'auth/v1/', REST = SUPABASE.url + 'rest/v1/', TIMEOUT = 8000;
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } };
  const save = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  let session = load('ps-auth');   // { access, refresh, exp (ms), email }
  let name = load('ps-profile-name') || '';
  const listeners = [];
  const changed = () => { for (const f of listeners) try { f(); } catch (_) {} };

  // One request; resolves { ok, status, data } and never rejects.
  function req(url, body, token) {
    try {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(() => { try { ctl && ctl.abort(); } catch (_) {} }, TIMEOUT);
      const headers = { apikey: SUPABASE.key, 'Content-Type': 'application/json' };
      if (token) headers.Authorization = 'Bearer ' + token;
      return fetch(url, { method: 'POST', headers, body: JSON.stringify(body || {}), signal: ctl ? ctl.signal : undefined })
        .then((r) => r.text().then((t) => { let data = null; try { data = t ? JSON.parse(t) : null; } catch (_) {} return { ok: r.ok, status: r.status, data }; }))
        .catch(() => ({ ok: false, status: 0, data: null }))
        .then((v) => { clearTimeout(timer); return v; });
    } catch (_) { return Promise.resolve({ ok: false, status: 0, data: null }); }
  }
  function keep(d, email) {
    if (!d || !d.access_token) return false;
    session = { access: d.access_token, refresh: d.refresh_token, exp: Date.now() + (d.expires_in || 3600) * 1000, email: email || (d.user && d.user.email) || (session && session.email) || '' };
    save('ps-auth', session);
    return true;
  }
  function forget() {
    session = null; name = '';
    save('ps-auth', null); save('ps-profile-name', null);
    changed();
  }

  // A fresh access token: the one kept if it has more than a minute left, else a refreshed one.
  let refreshing = null;
  function ready() {
    if (!session) return Promise.resolve(null);
    if (session.exp - Date.now() > 60000) return Promise.resolve(session.access);
    if (!refreshing) {
      refreshing = req(AUTH + 'token?grant_type=refresh_token', { refresh_token: session.refresh }).then((r) => {
        refreshing = null;
        if (r.ok && keep(r.data)) return session.access;
        if (r.status >= 400 && r.status < 500) forget();   // the session was revoked or has run out: signed out
        return null;
      });
    }
    return refreshing;
  }
  // For report.js, which cannot wait: the token if it is still good (and a refresh started if not).
  function token() {
    if (!session) return null;
    if (session.exp - Date.now() > 60000) return session.access;
    ready();
    return null;
  }
  function rpc(fn, body) {
    return ready().then((t) => (t ? req(REST + 'rpc/' + fn, body || {}, t) : { ok: false, status: 401, data: null }));
  }

  const why = (r) => (r.status === 0 ? 'offline' : r.status === 429 ? 'slow down' : 'failed');
  // Ask for a code; a new address gets an account. Resolves 'ok', 'offline', 'slow down' or 'failed'.
  function sendCode(email) {
    return req(AUTH + 'otp', { email, create_user: true }).then((r) => (r.ok ? 'ok' : why(r)));
  }
  // Check the code. Resolves 'ok', 'wrong' (a wrong or used-up code), 'offline' or 'failed'.
  function verify(email, code) {
    return req(AUTH + 'verify', { type: 'email', email, token: code }).then((r) => {
      if (!r.ok) return r.status === 400 || r.status === 403 || r.status === 401 ? 'wrong' : why(r);
      if (!keep(r.data, email)) return 'failed';
      Report.claim();   // this phone's matches so far now count for the profile
      changed();
      return 'ok';
    });
  }
  function signOut() {
    const t = session && session.access;
    if (t) req(AUTH + 'logout', {}, t);
    forget();
  }
  // The profile's name and numbers, or null when it cannot be read (offline, signed out).
  function profile() {
    return rpc('my_profile').then((r) => {
      const p = r.ok && Array.isArray(r.data) ? r.data[0] : null;
      if (p && (p.name || '') !== name) { name = p.name || ''; save('ps-profile-name', name || null); changed(); }
      return p || null;
    });
  }
  // Resolves 'ok', 'taken', 'invalid', 'offline' or 'failed'.
  function setName(n) {
    return rpc('set_profile_name', { p_name: n }).then((r) => {
      if (!r.ok) return why(r);
      if (r.data === 'ok') { name = String(n).trim().replace(/\s+/g, ' '); save('ps-profile-name', name); changed(); }
      return r.data === 'ok' || r.data === 'taken' || r.data === 'invalid' ? r.data : 'failed';
    });
  }
  function deleteAccount() {
    return rpc('delete_my_account').then((r) => { if (r.ok && r.data === true) { forget(); return 'ok'; } return why(r); });
  }

  // Back in the app signed in: refresh the session, and link any matches played here signed out.
  if (session) ready().then((t) => { if (t) { Report.claim(); profile(); } });

  return {
    token, sendCode, verify, signOut, profile, setName, deleteAccount,
    get signedIn() { return !!session; }, get email() { return session ? session.email : ''; }, get name() { return session ? name : ''; },
    onChange(f) { listeners.push(f); },
  };
})();

// The profile page, on the same paper as the Leaderboard: sign in, choose a commander name, and the
// numbers over every game played signed in or on this phone.
const Profile = (() => {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const num = (n) => Number(n || 0).toLocaleString('en-US');
  const hours = (s) => { s = Math.max(0, Number(s) || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`; };
  const day = (t) => { try { return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (_) { return ''; } };
  let root = null, body = null, email = '', step = 'email', n = 0;

  function build() {
    root = document.createElement('div');
    root.id = 'profile';
    root.hidden = true;
    root.innerHTML = `<div class="fm-book" role="dialog" aria-modal="true" aria-labelledby="pfTitle">
      <header class="fm-top"><span class="fm-brand">Service Record</span><div class="fm-tabs"></div>
        <button type="button" class="fm-close" aria-label="Close the profile">✕</button></header>
      <div class="fm-page"><h2 id="pfTitle">Profile</h2><div class="pf-body"></div></div>
    </div>`;
    document.body.appendChild(root);
    body = root.querySelector('.pf-body');
    root.addEventListener('click', (e) => { if (e.target.closest('.fm-close') || e.target === root) close(); });
    document.addEventListener('keydown', (e) => { if (!root.hidden && e.key === 'Escape') { close(); e.stopPropagation(); } }, true);
  }
  // A one-field form: label, input, button and a status line.
  function form(label, attrs, button, onSubmit, extra) {
    const f = document.createElement('form');
    f.className = 'pf-form';
    f.innerHTML = `<label for="pfIn">${label}</label><div class="pf-row"><input id="pfIn" ${attrs}><button type="submit">${button}</button></div>
      <p class="pf-msg" role="status"></p>${extra || ''}`;
    const input = f.querySelector('input'), btn = f.querySelector('button[type=submit]'), msg = f.querySelector('.pf-msg');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      btn.disabled = true;
      Promise.resolve(onSubmit(input.value.trim(), (t) => { msg.textContent = t; })).then(() => { btn.disabled = false; });
    });
    return { f, input, msg };
  }
  const FAIL = { offline: 'No connection. Check it and try again.', 'slow down': 'Too many tries. Wait a minute and try again.', failed: 'Something went wrong. Try again in a moment.' };

  function render() {
    const my = ++n;
    body.innerHTML = '';
    if (!Account.signedIn) return step === 'code' ? renderCode() : renderEmail();
    body.innerHTML = '<p class="lb-note">Loading your record…</p>';
    Account.profile().then((p) => {
      if (my !== n) return;
      if (!p) {
        body.innerHTML = `<p class="lb-note">Your record needs a connection. <button type="button" class="lb-retry">Try again</button></p>`;
        body.querySelector('.lb-retry').addEventListener('click', render);
        body.appendChild(signOutRow());
        return;
      }
      body.innerHTML = '';
      if (!p.name) return renderName(p);
      renderRecord(p);
    });
  }
  function renderEmail() {
    const intro = document.createElement('p');
    intro.className = 'lb-intro';
    intro.textContent = 'Sign in to keep a record of your games: your total play time, lifetime kills and the most ore you have gathered in one game. No password: we email you a code. Playing without signing in works just as before.';
    const { f, input } = form('Your email address', 'type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" maxlength="254" enterkeyhint="send" spellcheck="false" required', 'Send code',
      (v, say) => {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { say('That does not look like an email address.'); return; }
        say('Sending…');
        return Account.sendCode(v).then((r) => {
          if (r !== 'ok') { say(FAIL[r]); return; }
          email = v; step = 'code'; render();
        });
      },
      '<p class="pf-small">We use your email only to sign you in. Your games played on this phone so far will count towards your record.</p>');
    input.value = email;
    body.append(intro, f);
    input.focus();
  }
  function renderCode() {
    const intro = document.createElement('p');
    intro.className = 'lb-intro';
    intro.textContent = `We sent a code to ${email}. It can take a minute to arrive; check your spam folder too.`;
    const { f, input } = form('The code from the email', 'type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="10" placeholder="123456" enterkeyhint="done" required', 'Sign in',
      (v, say) => {
        const code = v.replace(/\D/g, '');
        if (code.length < 6) { say('The code is 6 digits.'); return; }
        say('Checking…');
        return Account.verify(email, code).then((r) => {
          if (r === 'ok') { step = 'email'; render(); return; }
          say(r === 'wrong' ? 'That code is wrong or has run out. Check it, or ask for a new one.' : FAIL[r]);
        });
      },
      '<p class="pf-links"><button type="button" class="pf-link" data-act="resend">Send a new code</button> · <button type="button" class="pf-link" data-act="back">Use a different email</button></p>');
    f.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const msg = f.querySelector('.pf-msg');
      if (a.dataset.act === 'back') { step = 'email'; render(); return; }
      msg.textContent = 'Sending…';
      Account.sendCode(email).then((r) => { msg.textContent = r === 'ok' ? 'A new code is on its way.' : FAIL[r]; });
    });
    body.append(intro, f);
    input.focus();
  }
  function renderName(p) {
    const intro = document.createElement('p');
    intro.className = 'lb-intro';
    intro.textContent = 'Choose your commander name. Other players see it on the leaderboard and, later, in battle.';
    const { f, input } = form('Commander name', 'type="text" autocomplete="nickname" maxlength="20" placeholder="3 to 20 letters or digits" enterkeyhint="done" spellcheck="false" required', 'Save',
      (v, say) => {
        say('Saving…');
        return Account.setName(v).then((r) => {
          if (r === 'ok') { render(); return; }
          say(r === 'taken' ? 'That name is taken. Try another.' : r === 'invalid' ? 'Use 3 to 20 letters, digits, spaces, dots, dashes or underscores, starting with a letter or digit.' : FAIL[r]);
        });
      });
    input.value = p && p.name ? p.name : Report.name;
    body.append(intro, f, signOutRow());
    input.focus();
  }
  function renderRecord(p) {
    body.innerHTML = `<p class="pf-who"><span class="pf-name">${esc(p.name)}</span><span class="pf-since">Enlisted ${esc(day(p.joined))} · ${esc(Account.email)}</span></p>
      <div class="pf-stats">
        <div class="pf-stat"><span class="pf-k">Total play time</span><span class="pf-v">${hours(p.play_s)}</span></div>
        <div class="pf-stat"><span class="pf-k">Lifetime kills</span><span class="pf-v">${num(p.kills)}</span></div>
        <div class="pf-stat"><span class="pf-k">Most ore in one game</span><span class="pf-v">${p.best_ore == null ? '—' : '$' + num(p.best_ore)}</span>${p.best_ore_at ? `<span class="pf-when">${esc(day(p.best_ore_at))}</span>` : ''}</div>
      </div>
      <p class="pf-small">${num(p.matches)} ${Number(p.matches) === 1 ? 'mission' : 'missions'}: ${num(p.wins)} won, ${num(p.losses)} lost.</p>`;
    const rename = document.createElement('p');
    rename.className = 'pf-links';
    rename.innerHTML = '<button type="button" class="pf-link">Change name</button>';
    rename.querySelector('button').addEventListener('click', () => { body.innerHTML = ''; renderName(p); });
    body.append(rename, signOutRow(true));
  }
  function signOutRow(withDelete) {
    const row = document.createElement('div');
    row.className = 'pf-actions';
    row.innerHTML = `<button type="button" class="pf-btn" data-act="out">Sign out</button>${withDelete ? '<button type="button" class="pf-btn pf-danger" data-act="del">Delete account</button>' : ''}<p class="pf-msg" role="status"></p>`;
    row.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'out') { Account.signOut(); step = 'email'; render(); return; }
      if (!a.dataset.sure) { a.dataset.sure = '1'; a.textContent = 'Tap again to delete for good'; return; }
      row.querySelector('.pf-msg').textContent = 'Deleting…';
      Account.deleteAccount().then((r) => {
        if (r === 'ok') { step = 'email'; render(); return; }
        row.querySelector('.pf-msg').textContent = FAIL[r];
      });
    });
    return row;
  }
  function open() { if (!root) build(); root.hidden = false; root.querySelector('.fm-page').scrollTop = 0; render(); }
  function close() { if (root) root.hidden = true; }
  return { open, close };
})();
