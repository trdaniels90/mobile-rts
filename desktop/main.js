'use strict';
// Red Horizon for PC: a window around the game files in ./game, served from app://game/ (not
// file://, so the game treats it as a real site: match reports work and fetch() of the music
// works). Windows updates come from GitHub Releases through electron-updater; the unsigned Mac app
// updates its game files instead (content-update.js).
const { app, BrowserWindow, protocol, net, dialog, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

const MAC = process.platform === 'darwin';
const content = MAC ? require('./content-update') : null;

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
// Crash log (2026.11.20.4): a tester's RTX 5080 took the window black a minute into battles. Which process died (the
// game's page or the graphics process), why and its exit code are kept in userData/crash-log.json, with the graphics
// driver, and handed to the game at its next start (preload.js rhDesktop.crashLog), which sends them with its own last
// moments (report.js, the black box). A main-process crash is caught by crashReporter's local dumps only.
const crashFile = () => path.join(app.getPath('userData'), 'crash-log.json');
function readCrashes() { try { return JSON.parse(fs.readFileSync(crashFile(), 'utf8')) || []; } catch (_) { return []; } }
function logCrash(e) {
  try { const l = readCrashes(); l.push({ at: new Date().toISOString(), ...e }); fs.writeFileSync(crashFile(), JSON.stringify(l.slice(-10))); } catch (_) {}
}
app.on('child-process-gone', (ev, d) => { if (d.reason !== 'clean-exit') logCrash({ kind: d.type, name: d.name || null, reason: d.reason, code: d.exitCode }); });
ipcMain.handle('rh-crash-log', async () => {
  const log = readCrashes();
  try { fs.unlinkSync(crashFile()); } catch (_) {}
  let gpu = null;
  try { const g = await app.getGPUInfo('basic'); gpu = (g.gpuDevice || []).map((x) => ({ v: x.vendorId, d: x.deviceId, drv: x.driverVersion, on: !!x.active })); } catch (_) {}
  let feat = null; try { const f = app.getGPUFeatureStatus(); feat = { webgl2: f.webgl2, gpu_compositing: f.gpu_compositing }; } catch (_) {}
  return { log, gpu, feat, electron: process.versions.electron, chrome: process.versions.chrome, os: process.getSystemVersion ? process.getSystemVersion() : null };
});
// Interface zoom (Ctrl +, Ctrl -, Ctrl 0), remembered between runs. The game redraws at the new size.
const zoomFile = () => path.join(app.getPath('userData'), 'zoom.json');
function loadZoom() { try { return Math.min(2.5, Math.max(0.5, JSON.parse(fs.readFileSync(zoomFile(), 'utf8')).z || 1)); } catch (_) { return 1; } }
function setZoom(z) {
  z = Math.round(Math.min(2.5, Math.max(0.5, z)) * 100) / 100;
  win.webContents.setZoomFactor(z);
  try { fs.writeFileSync(zoomFile(), JSON.stringify({ z })); } catch (_) {}
}
function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 800, minHeight: 500,
    backgroundColor: '#000000', autoHideMenuBar: true, title: 'Red Horizon',
    icon: path.join(__dirname, 'game', 'icons', 'icon-512.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  // Mac keeps a small menu so Cmd+Q, Cmd+H and Cmd+M work; Windows has none.
  Menu.setApplicationMenu(MAC ? Menu.buildFromTemplate([{ role: 'appMenu' }, { label: 'View', submenu: [{ role: 'togglefullscreen' }] }, { role: 'windowMenu' }]) : null);
  win.webContents.on('did-finish-load', () => { win.webContents.setZoomFactor(loadZoom()); if (content) content.confirm(); });
  win.loadURL('app://game/index.html');
  // The game's page died (a graphics driver crash took the window black, 2026.11.20, RTX 5080): load it again rather than
  // leave a black window. The game sees it died drawing with WebGL (gl.js crash guard) and comes back with the 2D way.
  let reloads = 0;
  win.webContents.on('render-process-gone', (e, d) => {
    logCrash({ kind: 'page', reason: d.reason, code: d.exitCode });
    if (d.reason === 'clean-exit' || win.isDestroyed() || ++reloads > 3) return;
    setTimeout(() => { if (!win.isDestroyed()) win.loadURL('app://game/index.html'); }, 500);
  });
  win.on('unresponsive', () => logCrash({ kind: 'page', reason: 'unresponsive' }));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    const mod = MAC ? i.meta : i.control; // Cmd on a Mac, Ctrl elsewhere
    if (i.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (i.key === 'Escape' && win.isFullScreen() && i.shift) { win.setFullScreen(false); e.preventDefault(); }
    else if (mod && (i.key === '=' || i.key === '+')) { setZoom(win.webContents.getZoomFactor() + 0.1); e.preventDefault(); }
    else if (mod && i.key === '-') { setZoom(win.webContents.getZoomFactor() - 0.1); e.preventDefault(); }
    else if (mod && i.key === '0') { setZoom(1); e.preventDefault(); }
    else if (i.key === 'F12' && !app.isPackaged) win.webContents.toggleDevTools();
  });
}

function setupUpdates() {
  if (MAC) { content.start(win); return; }
  if (!app.isPackaged) return;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox(win, {
      type: 'info', buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1,
      title: 'Update ready', message: 'A new version of Red Horizon is ready.',
      detail: 'Restart to play version ' + info.version + '. Any battle in progress is saved to Continue first if you quit from the menu.',
    }).then((r) => { if (r.response === 0) autoUpdater.quitAndInstall(); });
  });
  autoUpdater.on('error', () => {});
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 30 * 60 * 1000);
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  let base = path.join(__dirname, 'game');
  if (content) base = content.pickBase(base);
  protocol.handle('app', (req) => {
    const p = decodeURIComponent(new URL(req.url).pathname);
    const file = path.normalize(path.join(base, p === '/' ? 'index.html' : p));
    if (!file.startsWith(base)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  setupUpdates();
});
app.on('window-all-closed', () => app.quit());
