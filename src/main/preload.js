'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const inv = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('clipy', {
  state: inv('state'),
  getSettings: inv('settings:get'),
  setSettings: inv('settings:set'),
  library: inv('library'),
  displays: inv('displays'),
  saveClip: inv('clip:save'),
  screenshot: inv('shot:take'),
  toggleBuffer: inv('buffer:toggle'),
  rename: inv('clip:rename'),
  favorite: inv('clip:fav'),
  remove: inv('clip:delete'),
  reveal: inv('clip:reveal'),
  open: inv('clip:open'),
  trim: inv('clip:trim'),
  chooseDir: inv('dir:choose'),
  openDir: inv('dir:open'),
  drag: (id) => ipcRenderer.send('clip:drag', id),
  hotkeysEnabled: (on) => ipcRenderer.send('hotkeys', !!on),
  win: (action) => ipcRenderer.send('win', action),
  on: (channel, cb) => {
    const allowed = ['state', 'library-changed', 'win-max'];
    if (!allowed.includes(channel)) return () => {};
    const fn = (_e, ...a) => cb(...a);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  },
});
