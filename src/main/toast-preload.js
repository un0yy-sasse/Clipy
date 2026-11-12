'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toastApi', {
  on: (ch, cb) => { if (['toast', 'toast-hide', 'cue'].includes(ch)) ipcRenderer.on(ch, (_e, p) => cb(p)); },
});
