'use strict';
// Red Horizon for PC: a window around the game files in ./game, served from app://game/ (not
// file://, so the game treats it as a real site: match reports work and fetch() of the music
// works). Updates come from GitHub Releases through electron-updater.
const { app, BrowserWindow, protocol, net, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
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
  Menu.setApplicationMenu(null);
  win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(loadZoom()));
  win.loadURL('app://game/index.html');
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    if (i.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (i.key === 'Escape' && win.isFullScreen() && i.shift) { win.setFullScreen(false); e.preventDefault(); }
    else if (i.control && (i.key === '=' || i.key === '+')) { setZoom(win.webContents.getZoomFactor() + 0.1); e.preventDefault(); }
    else if (i.control && i.key === '-') { setZoom(win.webContents.getZoomFactor() - 0.1); e.preventDefault(); }
    else if (i.control && i.key === '0') { setZoom(1); e.preventDefault(); }
    else if (i.key === 'F12' && !app.isPackaged) win.webContents.toggleDevTools();
  });
}

function setupUpdates() {
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
  const base = path.join(__dirname, 'game');
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
