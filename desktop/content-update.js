'use strict';
// Mac only: updates the game's own files without replacing the app. An unsigned Mac app cannot use
// electron-updater (Squirrel.Mac checks the signature), but the game is plain JS, art and music, so it
// can be swapped as data. Windows is untouched and keeps electron-updater (see main.js).
//
// How it works:
//  - Each release uploads `content-manifest.json` (every game file with its SHA-256, plus `shell`, the
//    app shell version the files need) next to the installers.
//  - Every 30 minutes the app reads the newest release that has one. If its game version is newer than
//    the one running, it builds the new files in userData/content/<version>.part (files that did not
//    change are copied, the rest are downloaded from the test build site and checked against their hash),
//    renames it into place and records it in current.json. Nothing running is touched.
//  - The player is offered a restart (or gets it next launch). `pickBase` chooses the files at startup:
//    the downloaded copy if it is newer than the bundled one and complete, else the bundled one.
//  - If a downloaded copy never finishes loading (`confirm` is not reached), the next start ignores it.
const { app, net, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SHELL_API = 1; // raise when a game update needs a newer main.js / preload.js; the manifest's `shell` says
const SITE = 'https://trdaniels90.github.io/mobile-rts/';
const RELEASES = 'https://api.github.com/repos/trdaniels90/mobile-rts/releases?per_page=8';
const RELEASE_PAGE = 'https://github.com/trdaniels90/mobile-rts/releases/latest';
const MANIFEST = 'content-manifest.json';
const EVERY = 30 * 60 * 1000;

const rootDir = () => path.join(app.getPath('userData'), 'content');
const stateFile = () => path.join(rootDir(), 'current.json');
const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch (_) { return null; } };
function writeState(s) {
  fs.mkdirSync(rootDir(), { recursive: true });
  const tmp = stateFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(s));
  fs.renameSync(tmp, stateFile());
}
function versionOf(dir) {
  try { const m = /v:\s*'(\d+(?:\.\d+)+)'/.exec(fs.readFileSync(path.join(dir, 'src', 'version.js'), 'utf8')); return m ? m[1] : null; } catch (_) { return null; }
}
function cmp(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const safePath = (p) => typeof p === 'string' && /^[A-Za-z0-9._\-\/ ]+$/.test(p) && !p.startsWith('/') && !p.split('/').some((s) => s === '..' || s === '');

let activeDir = null, activeVersion = null, staged = null, told = null, busy = false;

// Which folder holds the game files this run: the downloaded copy if it is newer and sound.
function pickBase(bundled) {
  activeDir = bundled; activeVersion = versionOf(bundled);
  const s = readState();
  if (s && s.dir && s.version) {
    const dir = path.join(rootDir(), s.dir);
    const ok = !s.trying && fs.existsSync(path.join(dir, 'index.html')) && versionOf(dir) === s.version
      && activeVersion && cmp(s.version, activeVersion) > 0;
    if (ok) {
      writeState({ ...s, trying: true }); // cleared by confirm() once the page has loaded
      activeDir = dir; activeVersion = s.version;
    } else {
      // stale (the app was reinstalled with a newer game), unfinished or never loaded: forget it
      writeState({ bad: s.trying ? s.version : s.bad || null });
    }
  }
  try { // drop every copy but the one in use
    for (const n of fs.readdirSync(rootDir())) if (n !== 'current.json' && path.join(rootDir(), n) !== activeDir) fs.rmSync(path.join(rootDir(), n), { recursive: true, force: true });
  } catch (_) {}
  return activeDir;
}
function confirm() { const s = readState(); if (s && s.trying) writeState({ ...s, trying: false }); }

async function getJson(url) {
  const r = await net.fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}
async function findManifest() {
  const list = await getJson(RELEASES);
  for (const rel of list) {
    const a = (rel.assets || []).find((x) => x.name === MANIFEST);
    if (a) return getJson(a.browser_download_url);
  }
  return null;
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

async function stage(m) {
  const names = Object.keys(m.files);
  const part = path.join(rootDir(), m.version + '.part');
  fs.rmSync(part, { recursive: true, force: true });
  await pool(names, 4, async (name) => {
    const want = m.files[name], dest = path.join(part, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const have = path.join(activeDir, name);
    let buf = null;
    try { const b = fs.readFileSync(have); if (b.length === want.size && sha(b) === want.sha256) buf = b; } catch (_) {}
    if (!buf) {
      const r = await net.fetch(SITE + name.split('/').map(encodeURIComponent).join('/'), { cache: 'no-store' });
      if (!r.ok) throw new Error(name + ' ' + r.status);
      buf = Buffer.from(await r.arrayBuffer());
      if (buf.length !== want.size || sha(buf) !== want.sha256) throw new Error(name + ' does not match the release yet');
    }
    fs.writeFileSync(dest, buf);
  });
  if (versionOf(part) !== m.version) throw new Error('version mismatch');
  const dir = path.join(rootDir(), m.version);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(part, dir);
  writeState({ dir: m.version, version: m.version, trying: false });
}

async function check(win) {
  if (busy) return;
  busy = true;
  try {
    const m = await findManifest();
    if (!m || !m.version || !m.files || !Object.keys(m.files).every(safePath) || !m.files['index.html']) return;
    if (cmp(m.version, activeVersion) <= 0 || m.version === staged) return;
    const st = readState();
    if (st && st.bad && cmp(m.version, st.bad) <= 0) return;
    if ((m.shell || 1) > SHELL_API) { // this app is too old for the new files
      if (told === m.version) return;
      told = m.version;
      const r = await dialog.showMessageBox(win, { type: 'info', buttons: ['Open download page', 'Later'], defaultId: 0, cancelId: 1,
        title: 'New app version', message: 'Red Horizon has a new version that needs a fresh download.',
        detail: 'Download the latest Red Horizon for Mac and drag it over the old one. Your saved game and settings are kept.' });
      if (r.response === 0) shell.openExternal(RELEASE_PAGE);
      return;
    }
    await stage(m);
    staged = m.version;
    const r = await dialog.showMessageBox(win, { type: 'info', buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1,
      title: 'Update ready', message: 'A new version of Red Horizon is ready.',
      detail: 'Restart to play version ' + m.version + '. Any battle in progress is saved to Continue first if you quit from the menu.' });
    if (r.response === 0) { app.relaunch(); app.exit(0); }
  } catch (_) { /* offline, rate limited or the site is not updated yet: try again later */ }
  finally { busy = false; }
}

function start(win) {
  if (!app.isPackaged) return;
  setTimeout(() => check(win), 10 * 1000);
  setInterval(() => check(win), EVERY);
}

module.exports = { pickBase, confirm, start, SHELL_API };
