'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const OUT = ['rec:reset', 'rec:start', 'rec:chunk', 'rec:end', 'rec:status', 'rec:shot-data'];
const IN = ['rec:config', 'rec:stop', 'rec:rotate', 'rec:shot'];

contextBridge.exposeInMainWorld('bridge', {
  send: (ch, payload) => { if (OUT.includes(ch)) ipcRenderer.send(ch, payload); },
  on: (ch, cb) => { if (IN.includes(ch)) ipcRenderer.on(ch, (_e, p) => cb(p)); },
});
