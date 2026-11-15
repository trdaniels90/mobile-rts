'use strict';
// Mac only (electron-builder afterPack): the app is unsigned, but Apple Silicon will not start a binary with no
// signature at all, so give it an ad-hoc one. Gatekeeper still asks the player to right-click > Open once.
const { execFileSync } = require('child_process');
const path = require('path');
exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== 'darwin') return;
  // A universal build packs x64 and arm64 into '-temp' folders and merges them; signing those first makes the
  // merge fail (their signatures differ). Sign only the final app.
  if (/-temp$/.test(ctx.appOutDir)) return;
  const app = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + '.app');
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
