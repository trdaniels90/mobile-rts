'use strict';
// Copies the game files into desktop/game and sets the app version from src/version.js.
// The game's versions look like 2026.11.07 or 2026.11.07.1, which are not valid semver, so the
// app uses YEAR.MMDD.N (2026.1107.0, 2026.1107.1). That still always increases.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const out = path.join(__dirname, '..', 'game');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'style.css', 'manifest.webmanifest']) fs.copyFileSync(path.join(root, f), path.join(out, f));
for (const d of ['src', 'music', 'maps', 'icons']) fs.cpSync(path.join(root, d), path.join(out, d), { recursive: true });
const src = fs.readFileSync(path.join(root, 'src', 'version.js'), 'utf8');
const m = /v:\s*'(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?'/.exec(src);
if (!m) throw new Error('no version in src/version.js');
const version = `${+m[1]}.${+m[2] * 100 + +m[3]}.${+(m[4] || 0)}`;
const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('game copied; app version', version);
