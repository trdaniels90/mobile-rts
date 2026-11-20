'use strict';
// What the window gives the game: the app's crash log and graphics driver (main.js), for the game's crash report.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('rhDesktop', { crashLog: () => ipcRenderer.invoke('rh-crash-log') });
