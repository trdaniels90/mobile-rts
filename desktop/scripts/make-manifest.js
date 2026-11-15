'use strict';
// Writes content-manifest.json for the Mac app's game updates: every file in desktop/game (run `npm run prep`
// first) with its SHA-256 and size, the game version, and the app shell version the files need (SHELL_API in
// content-update.js; raise `shell` here together with it when a game update needs a newer main.js).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const game = path.join(__dirname, '..', 'game');
const out = process.argv[2] || path.join(__dirname, '..', 'content-manifest.json');
const SHELL = 1;
const files = {};
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else { const b = fs.readFileSync(p); files[path.relative(game, p).split(path.sep).join('/')] = { sha256: crypto.createHash('sha256').update(b).digest('hex'), size: b.length }; }
  }
})(game);
const m = /v:\s*'(\d+(?:\.\d+)+)'/.exec(fs.readFileSync(path.join(game, 'src', 'version.js'), 'utf8'));
if (!m) throw new Error('no version in game/src/version.js');
fs.writeFileSync(out, JSON.stringify({ version: m[1], shell: SHELL, files }));
console.log('manifest:', Object.keys(files).length, 'files, version', m[1]);
