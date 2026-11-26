'use strict';
// What the window gives the game: the app's crash log and graphics driver (main.js), for the game's crash report, and
// full screen (the Settings button): fullScreen(on) sets it (no argument: just asks), and resolves to whether it is on.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('rhDesktop', {
  crashLog: () => ipcRenderer.invoke('rh-crash-log'),
  fullScreen: (on) => ipcRenderer.invoke('rh-fullscreen', on),
  onFullScreen: (fn) => ipcRenderer.on('rh-fullscreen-changed', (e, full) => fn(!!full)),
});
