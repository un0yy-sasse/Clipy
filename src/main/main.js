'use strict';
const {
  app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage,
  shell, desktopCapturer, screen, dialog,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');
const { pathToFileURL } = require('url');

// ───────────────────────────────────────────── basics
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.setAppUserModelId('app.clipy.desktop');

const ROOT = path.join(__dirname, '..', '..');
const ASSETS = path.join(ROOT, 'assets');
let FFMPEG = require('ffmpeg-static');
if (FFMPEG) FFMPEG = FFMPEG.replace('app.asar', 'app.asar.unpacked');

const SEG_SECONDS = 20; // length of one rolling buffer session
const TEST_DIR = process.env.CLIPY_TEST_DIR; // self-test mode (dev only)
if (TEST_DIR) app.setPath('userData', path.join(TEST_DIR, 'userdata'));
const USER = app.getPath('userData');
const SETTINGS_FILE = path.join(USER, 'settings.json');
const LIB_FILE = path.join(USER, 'library.json');
const THUMBS = path.join(USER, 'thumbs');
const BUF_DIR = path.join(os.tmpdir(), 'clipy-buffer');

const DEFAULTS = {
  bufferEnabled: true,
  clipLength: 30,
  fps: 60,
  resolution: '1080',
  quality: 'high',
  monitor: null,
  systemAudio: true,
  systemVolume: 100,
  microphone: false,
  micVolume: 100,
  clipHotkey: 'F8',
  screenshotHotkey: 'F9',
  clipsDir: TEST_DIR ? path.join(TEST_DIR, 'clips') : path.join(app.getPath('videos'), 'Clipy'),
  launchOnStartup: false,
  minimizeToTray: true,
  overlay: true,
  soundCue: true,
};

// ───────────────────────────────────────────── persistence
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

fs.mkdirSync(USER, { recursive: true });
fs.mkdirSync(THUMBS, { recursive: true });
let settings = { ...DEFAULTS, ...readJSON(SETTINGS_FILE, {}) };
let library = readJSON(LIB_FILE, []).filter((c) => c && c.file && fs.existsSync(c.file));
const saveSettings = () => writeJSON(SETTINGS_FILE, settings);
const saveLibrary = () => writeJSON(LIB_FILE, library);

function clipsDir() {
  fs.mkdirSync(settings.clipsDir, { recursive: true });
  return settings.clipsDir;
}

// ───────────────────────────────────────────── state
let mainWin = null;
let recWin = null;
let toastWin = null;
let tray = null;
let quitting = false;
let encoder = 'libx264';
const rec = { ready: false, error: null, info: null, currentId: null };
let saving = false;
let hotkeyErrors = [];

function publicState() {
  return {
    bufferOn: settings.bufferEnabled,
    recording: settings.bufferEnabled && rec.ready,
    recError: rec.error,
    recInfo: rec.info,
    saving,
    encoder,
    hotkeyErrors,
    version: app.getVersion(),
    ffmpeg: !!FFMPEG && fs.existsSync(FFMPEG),
  };
}
function pushState() {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('state', publicState());
  updateTray();
}
function pushLibrary() {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('library-changed');
}

// ───────────────────────────────────────────── ffmpeg helpers
function ffmpeg(args, { timeout = 10 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); if (err.length > 20000) err = err.slice(-20000); });
    const t = setTimeout(() => p.kill('SIGKILL'), timeout);
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => {
      clearTimeout(t);
      code === 0 ? resolve() : reject(new Error(err.trim().split('\n').slice(-3).join(' ') || `ffmpeg exit ${code}`));
    });
  });
}

const pixFmt = (enc) => (enc === 'h264_qsv' ? 'nv12' : 'yuv420p');
async function detectEncoder() {
  for (const enc of ['h264_nvenc', 'h264_amf', 'h264_qsv']) {
    try {
      await ffmpeg(['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=1280x720:r=30',
        '-frames:v', '10', '-vf', `format=${pixFmt(enc)}`, '-c:v', enc, '-f', 'null', '-'], { timeout: 15000 });
      return enc;
    } catch { /* not available */ }
  }
  return 'libx264';
}
function encoderArgs() {
  const q = { high: 19, medium: 23, low: 28 }[settings.quality] || 21;
  switch (encoder) {
    case 'h264_nvenc': return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', String(q), '-b:v', '0'];
    case 'h264_amf': return ['-c:v', 'h264_amf', '-quality', 'balanced', '-rc', 'cqp', '-qp_i', String(q), '-qp_p', String(q + 2)];
    case 'h264_qsv': return ['-c:v', 'h264_qsv', '-preset', 'medium', '-global_quality', String(q)];
    default: return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(q)];
  }
}
async function makeThumb(input, id, atSec = 1) {
  const out = path.join(THUMBS, `${id}.jpg`);
  try {
    await ffmpeg(['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(atSec), '-i', input,
      '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '3', out], { timeout: 30000 });
    return out;
  } catch {
    try {
      await ffmpeg(['-y', '-hide_banner', '-loglevel', 'error', '-i', input, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '3', out], { timeout: 30000 });
      return out;
    } catch { return null; }
  }
}

// ───────────────────────────────────────────── foreground window → game name
const FG_SCRIPT = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public class ClipyFg { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int p); }
"@
$h=[ClipyFg]::GetForegroundWindow(); $p=0; [void][ClipyFg]::GetWindowThreadProcessId($h,[ref]$p)
$pr=Get-Process -Id $p -ErrorAction SilentlyContinue
[Console]::OutputEncoding=[Text.Encoding]::UTF8
Write-Output ($pr.ProcessName + '|' + $pr.MainWindowTitle)`;
const IGNORE_PROCS = new Set(['explorer', 'clipy', 'electron', 'searchhost', 'shellexperiencehost', 'applicationframehost', 'startmenuexperiencehost', 'lockapp']);
function detectGame() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null);
    const enc = Buffer.from(FG_SCRIPT, 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', enc],
      { windowsHide: true, timeout: 6000 }, (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const [proc, ...rest] = stdout.trim().split('|');
        const title = rest.join('|').trim();
        if (!proc || IGNORE_PROCS.has(proc.toLowerCase())) return resolve(null);
        let name = title || proc;
        name = name.replace(/\s*[-–|]\s*(Steam|Epic Games|Direct3D.*|DX1\d.*|Vulkan.*)$/i, '').trim();
        resolve(name.slice(0, 60) || null);
      });
  });
}

// ───────────────────────────────────────────── replay buffer sessions
const sessions = new Map(); // id → {id, file, ws, start, end, done, bytes, hasAudio, waiters}
const locked = new Set();

function purgeSessions() {
  for (const s of [...sessions.values()]) {
    if (locked.has(s.id)) continue;
    if (!s.done) { try { s.ws.destroy(); } catch {} }
    sessions.delete(s.id);
    fs.rm(s.file, { force: true }, () => {});
  }
}
function pruneSessions() {
  const keep = Math.ceil(settings.clipLength / SEG_SECONDS) + 2;
  const done = [...sessions.values()].filter((s) => s.done).sort((a, b) => a.id - b.id);
  for (let i = 0; i < done.length - keep; i++) {
    const s = done[i];
    if (locked.has(s.id)) continue;
    sessions.delete(s.id);
    fs.rm(s.file, { force: true }, () => {});
  }
}
function waitDone(id, ms = 8000) {
  const s = sessions.get(id);
  if (!s || s.done) return Promise.resolve();
  return new Promise((res) => { s.waiters.push(res); setTimeout(res, ms); });
}

ipcMain.on('rec:reset', () => purgeSessions());
ipcMain.on('rec:start', (_e, { id, t, hasAudio }) => {
  const file = path.join(BUF_DIR, `s${id}.webm`);
  sessions.set(id, { id, file, ws: fs.createWriteStream(file), start: t, end: null, done: false, bytes: 0, hasAudio, waiters: [] });
  rec.currentId = id;
});
ipcMain.on('rec:chunk', (_e, { id, data }) => {
  const s = sessions.get(id);
  if (!s || s.done) return;
  const b = Buffer.from(data);
  s.bytes += b.length;
  s.ws.write(b);
});
ipcMain.on('rec:end', (_e, { id, t }) => {
  const s = sessions.get(id);
  if (!s) return;
  s.end = t;
  s.ws.end(() => {
    s.done = true;
    s.waiters.splice(0).forEach((f) => f());
    pruneSessions();
  });
});
ipcMain.on('rec:status', (_e, st) => {
  rec.ready = !!st.ok;
  rec.error = st.ok ? null : st.error;
  rec.info = st.ok ? st.info : null;
  pushState();
});

let shotResolver = null;
ipcMain.on('rec:shot-data', (_e, payload) => { if (shotResolver) { shotResolver(payload); shotResolver = null; } });

async function captureSources() {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
  return sources;
}
async function recorderConfig() {
  const sources = await captureSources();
  const src = sources.find((s) => s.display_id === String(settings.monitor)) || sources[0];
  const displays = screen.getAllDisplays();
  const disp = displays.find((d) => String(d.id) === (src && src.display_id)) || screen.getPrimaryDisplay();
  const nativeW = Math.round(disp.size.width * disp.scaleFactor);
  const nativeH = Math.round(disp.size.height * disp.scaleFactor);
  const res = { native: [nativeW, nativeH], 1440: [2560, 1440], 1080: [1920, 1080], 720: [1280, 720] }[settings.resolution] || [1920, 1080];
  return {
    sourceId: src ? src.id : null,
    maxWidth: Math.min(res[0], nativeW),
    maxHeight: Math.min(res[1], nativeH),
    fps: settings.fps,
    quality: settings.quality,
    systemAudio: settings.systemAudio,
    systemVolume: settings.systemVolume,
    microphone: settings.microphone,
    micVolume: settings.micVolume,
    segSeconds: SEG_SECONDS,
  };
}
async function startRecorder() {
  if (!recWin || recWin.isDestroyed()) return;
  if (!settings.bufferEnabled) {
    recWin.webContents.send('rec:stop');
    rec.ready = false;
    purgeSessions();
    pushState();
    return;
  }
  try {
    const cfg = await recorderConfig();
    if (!cfg.sourceId) throw new Error('No screen found');
    recWin.webContents.send('rec:config', cfg);
  } catch (e) {
    rec.ready = false; rec.error = e.message; pushState();
  }
}

// ───────────────────────────────────────────── clipping
function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function saveClip() {
  if (!settings.bufferEnabled || !rec.ready) {
    toast({ kind: 'error', title: 'Replay is off', sub: 'Turn on the buffer in Clipy' });
    return { ok: false, error: 'Replay buffer is not active' };
  }
  if (saving) return { ok: false, error: 'Already saving' };
  saving = true; pushState();
  toast({ kind: 'progress', title: 'Saving clip', sub: `Last ${settings.clipLength}s`, sound: true });
  let pick = [];
  try {
    const gameP = detectGame().catch(() => null);
    const old = rec.currentId;
    recWin.webContents.send('rec:rotate');
    await waitDone(old);

    const len = settings.clipLength;
    const done = [...sessions.values()].filter((s) => s.done && s.bytes > 0 && s.end).sort((a, b) => a.id - b.id);
    let total = 0;
    for (let i = done.length - 1; i >= 0 && total < len; i--) {
      pick.unshift(done[i]);
      total += (done[i].end - done[i].start) / 1000;
    }
    if (!pick.length) throw new Error('Buffer is still empty');
    pick.forEach((s) => locked.add(s.id));
    const hasAudio = pick.every((s) => s.hasAudio);
    const offset = Math.max(0, total - len);
    const dur = Math.min(len, total);

    const now = new Date();
    const id = newId();
    const out = path.join(clipsDir(), `Clipy_${stamp(now)}.mp4`);
    const args = ['-y', '-hide_banner', '-loglevel', 'error'];
    pick.forEach((s) => args.push('-i', s.file));
    let fc = '';
    pick.forEach((_s, i) => { fc += `[${i}:v:0]` + (hasAudio ? `[${i}:a:0]` : ''); });
    fc += `concat=n=${pick.length}:v=1:a=${hasAudio ? 1 : 0}[cv]${hasAudio ? '[ca]' : ''};`;
    fc += `[cv]fps=${settings.fps},format=${pixFmt(encoder)}[v]`;
    args.push('-filter_complex', fc, '-map', '[v]');
    if (hasAudio) args.push('-map', '[ca]');
    args.push('-ss', offset.toFixed(3), '-t', dur.toFixed(3), ...encoderArgs());
    if (hasAudio) args.push('-c:a', 'aac', '-b:a', '192k');
    args.push('-movflags', '+faststart', out);
    try {
      await ffmpeg(args);
    } catch (e) {
      if (encoder === 'libx264') throw e;
      encoder = 'libx264'; // hardware encoder failed → fall back once
      const i = args.indexOf('-c:v');
      args.splice(i, args.indexOf('-movflags') - i, ...encoderArgs(), ...(hasAudio ? ['-c:a', 'aac', '-b:a', '192k'] : []));
      await ffmpeg(args);
    }

    const game = await gameP;
    const thumb = await makeThumb(out, id, Math.min(2, dur / 2));
    const item = {
      id, type: 'clip', file: out, thumb, game: game || null,
      title: game || 'Clip', createdAt: now.getTime(), duration: dur,
      favorite: false, size: fs.statSync(out).size,
    };
    library.unshift(item); saveLibrary(); pushLibrary();
    toast({ kind: 'done', title: 'Clip saved', sub: `${Math.round(dur)}s${game ? ' · ' + game : ''}` });
    return { ok: true, id };
  } catch (e) {
    console.error(e);
    toast({ kind: 'error', title: 'Clip failed', sub: String(e.message).slice(0, 80) });
    return { ok: false, error: e.message };
  } finally {
    pick.forEach((s) => locked.delete(s.id));
    pruneSessions();
    saving = false; pushState();
  }
}

async function takeScreenshot() {
  if (!settings.bufferEnabled || !rec.ready) {
    toast({ kind: 'error', title: 'Replay is off', sub: 'Screenshots need the buffer running' });
    return { ok: false };
  }
  const payload = await new Promise((res) => {
    shotResolver = res;
    recWin.webContents.send('rec:shot');
    setTimeout(() => { if (shotResolver === res) { shotResolver = null; res(null); } }, 5000);
  });
  if (!payload || !payload.data) {
    toast({ kind: 'error', title: 'Screenshot failed' });
    return { ok: false };
  }
  const now = new Date();
  const id = newId();
  const dir = path.join(clipsDir(), 'Screenshots');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `Clipy_${stamp(now)}.png`);
  fs.writeFileSync(file, Buffer.from(payload.data));
  const [game, thumb] = await Promise.all([detectGame().catch(() => null), makeThumb(file, id, 0)]);
  const item = {
    id, type: 'shot', file, thumb, game: game || null, title: game || 'Screenshot',
    createdAt: now.getTime(), duration: 0, favorite: false, size: fs.statSync(file).size,
    width: payload.width, height: payload.height,
  };
  library.unshift(item); saveLibrary(); pushLibrary();
  toast({ kind: 'shot', title: 'Screenshot saved', sub: `${payload.width}×${payload.height}`, sound: true });
  return { ok: true, id };
}

async function trimClip(id, a, b) {
  const src = library.find((c) => c.id === id);
  if (!src || src.type !== 'clip') return { ok: false, error: 'Clip not found' };
  const start = Math.max(0, a), dur = Math.max(0.5, b - a);
  const nid = newId();
  const out = src.file.replace(/\.mp4$/i, '') + `_trim_${Date.now().toString(36)}.mp4`;
  const base = ['-y', '-hide_banner', '-loglevel', 'error', '-ss', start.toFixed(3), '-i', src.file, '-t', dur.toFixed(3),
    '-map', '0:v:0', '-map', '0:a?', '-vf', `format=${pixFmt(encoder)}`];
  try {
    await ffmpeg([...base, ...encoderArgs(), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
  } catch (e) {
    if (encoder === 'libx264') return { ok: false, error: e.message };
    encoder = 'libx264';
    await ffmpeg([...base, ...encoderArgs(), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
  }
  const thumb = await makeThumb(out, nid, Math.min(1, dur / 2));
  const item = {
    ...src, id: nid, file: out, thumb, title: `${src.title} (trimmed)`, createdAt: Date.now(),
    duration: dur, favorite: false, size: fs.statSync(out).size,
  };
  library.unshift(item); saveLibrary(); pushLibrary();
  return { ok: true, id: nid };
}

// ───────────────────────────────────────────── toast overlay
let toastTimer = null;
function toast(msg) {
  if (msg.sound && settings.soundCue && toastWin && !toastWin.isDestroyed()) toastWin.webContents.send('cue', msg.kind);
  if (!settings.overlay || !toastWin || toastWin.isDestroyed()) return;
  const disp = screen.getAllDisplays().find((d) => String(d.id) === String(settings.monitor)) || screen.getPrimaryDisplay();
  const { x, y, width } = disp.workArea;
  const [w] = toastWin.getSize();
  toastWin.setPosition(Math.round(x + width - w - 18), Math.round(y + 18));
  toastWin.webContents.send('toast', { ...msg, hotkey: settings.clipHotkey });
  if (!toastWin.isVisible()) toastWin.showInactive();
  toastWin.setAlwaysOnTop(true, 'screen-saver');
  clearTimeout(toastTimer);
  if (msg.kind !== 'progress') {
    toastTimer = setTimeout(() => {
      if (toastWin && !toastWin.isDestroyed()) toastWin.webContents.send('toast-hide');
      toastTimer = setTimeout(() => toastWin && !toastWin.isDestroyed() && toastWin.hide(), 400);
    }, 2600);
  }
}

// ───────────────────────────────────────────── hotkeys / startup / tray
function registerHotkeys() {
  globalShortcut.unregisterAll();
  hotkeyErrors = [];
  const reg = (acc, fn, name) => {
    if (!acc) return;
    try {
      if (!globalShortcut.register(acc, fn)) hotkeyErrors.push(name);
    } catch { hotkeyErrors.push(name); }
  };
  reg(settings.clipHotkey, () => saveClip(), 'clip');
  reg(settings.screenshotHotkey, () => takeScreenshot(), 'shot');
}
function applyLoginItem() {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: !!settings.launchOnStartup, args: ['--hidden'] });
}

function updateTray() {
  if (!tray) return;
  const on = settings.bufferEnabled && rec.ready;
  tray.setToolTip(on ? `Clipy · Replay on (${settings.clipHotkey})` : 'Clipy · Replay paused');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Clipy', click: showMain },
    { type: 'separator' },
    { label: `Save clip (${settings.clipHotkey})`, enabled: on, click: () => saveClip() },
    { label: `Screenshot (${settings.screenshotHotkey})`, enabled: on, click: () => takeScreenshot() },
    { label: settings.bufferEnabled ? 'Pause replay' : 'Start replay', click: () => toggleBuffer() },
    { label: 'Open clips folder', click: () => shell.openPath(clipsDir()) },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
}
function toggleBuffer(force) {
  settings.bufferEnabled = typeof force === 'boolean' ? force : !settings.bufferEnabled;
  saveSettings();
  startRecorder();
  pushState();
  return publicState();
}
function showMain() {
  if (!mainWin || mainWin.isDestroyed()) createMain();
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show();
  mainWin.focus();
}

// ───────────────────────────────────────────── windows
function createMain(hidden = false) {
  mainWin = new BrowserWindow({
    width: 1280, height: 820, minWidth: 960, minHeight: 620,
    frame: false, backgroundColor: '#000000', show: false,
    icon: path.join(ASSETS, 'icon.png'),
    title: 'Clipy',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false },
  });
  mainWin.removeMenu();
  mainWin.loadFile(path.join(ROOT, 'src', 'renderer', 'index.html'));
  mainWin.once('ready-to-show', () => { if (!hidden) mainWin.show(); });
  mainWin.on('close', (e) => {
    if (!quitting && settings.minimizeToTray) { e.preventDefault(); mainWin.hide(); }
  });
  mainWin.on('closed', () => { mainWin = null; });
  mainWin.on('maximize', () => mainWin.webContents.send('win-max', true));
  mainWin.on('unmaximize', () => mainWin.webContents.send('win-max', false));
  mainWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}
function createRecorder() {
  recWin = new BrowserWindow({
    show: false, width: 320, height: 200, skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'recorder-preload.js'), contextIsolation: true,
      backgroundThrottling: false, sandbox: false,
    },
  });
  recWin.loadFile(path.join(ROOT, 'src', 'recorder', 'recorder.html'));
  recWin.webContents.on('did-finish-load', () => startRecorder());
  recWin.webContents.on('render-process-gone', () => {
    rec.ready = false; rec.error = 'Recorder crashed – restarting'; pushState();
    setTimeout(() => { if (!quitting) { try { recWin.destroy(); } catch {} createRecorder(); } }, 1500);
  });
}
function createToast() {
  toastWin = new BrowserWindow({
    width: 380, height: 96, show: false, frame: false, transparent: true, resizable: false,
    movable: false, focusable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'toast-preload.js'), contextIsolation: true, backgroundThrottling: false },
  });
  toastWin.setIgnoreMouseEvents(true);
  toastWin.setAlwaysOnTop(true, 'screen-saver');
  toastWin.loadFile(path.join(ROOT, 'src', 'toast', 'toast.html'));
}

// ───────────────────────────────────────────── IPC for the UI
const fileUrl = (p) => (p ? pathToFileURL(p).href : null);
function libraryForUI() {
  return library.map((c) => ({ ...c, url: fileUrl(c.file), thumbUrl: c.thumb ? fileUrl(c.thumb) : null, exists: fs.existsSync(c.file) }));
}
const CAPTURE_KEYS = ['fps', 'resolution', 'quality', 'monitor', 'systemAudio', 'systemVolume', 'microphone', 'micVolume'];

ipcMain.handle('state', () => publicState());
ipcMain.handle('settings:get', () => settings);
ipcMain.handle('settings:set', (_e, patch) => {
  const before = { ...settings };
  settings = { ...settings, ...patch };
  saveSettings();
  if (patch.clipHotkey !== undefined || patch.screenshotHotkey !== undefined) registerHotkeys();
  if (patch.launchOnStartup !== undefined) applyLoginItem();
  if (CAPTURE_KEYS.some((k) => patch[k] !== undefined && patch[k] !== before[k])) startRecorder();
  if (patch.bufferEnabled !== undefined && patch.bufferEnabled !== before.bufferEnabled) startRecorder();
  pruneSessions();
  pushState();
  return settings;
});
ipcMain.handle('library', () => libraryForUI());
ipcMain.handle('displays', () => {
  const prim = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: String(d.id),
    label: `Monitor ${i + 1} · ${Math.round(d.size.width * d.scaleFactor)}×${Math.round(d.size.height * d.scaleFactor)}${d.id === prim ? ' · Primary' : ''}`,
    primary: d.id === prim,
  }));
});
ipcMain.handle('clip:save', () => saveClip());
ipcMain.handle('shot:take', () => takeScreenshot());
ipcMain.handle('buffer:toggle', () => toggleBuffer());
ipcMain.handle('clip:rename', (_e, id, title) => {
  const c = library.find((x) => x.id === id);
  if (c) { c.title = String(title).trim().slice(0, 80) || c.title; saveLibrary(); }
  return true;
});
ipcMain.handle('clip:fav', (_e, id) => {
  const c = library.find((x) => x.id === id);
  if (c) { c.favorite = !c.favorite; saveLibrary(); }
  return c ? c.favorite : false;
});
ipcMain.handle('clip:delete', async (_e, id) => {
  const c = library.find((x) => x.id === id);
  if (!c) return false;
  try { await shell.trashItem(c.file); } catch { /* file already gone */ }
  if (c.thumb) fs.rm(c.thumb, { force: true }, () => {});
  library = library.filter((x) => x.id !== id);
  saveLibrary();
  return true;
});
ipcMain.handle('clip:reveal', (_e, id) => { const c = library.find((x) => x.id === id); if (c) shell.showItemInFolder(c.file); });
ipcMain.handle('clip:open', (_e, id) => { const c = library.find((x) => x.id === id); if (c) shell.openPath(c.file); });
ipcMain.handle('clip:trim', (_e, id, a, b) => trimClip(id, a, b));
ipcMain.handle('dir:choose', async () => {
  const r = await dialog.showOpenDialog(mainWin, { properties: ['openDirectory', 'createDirectory'], defaultPath: settings.clipsDir });
  if (r.canceled || !r.filePaths[0]) return null;
  settings.clipsDir = r.filePaths[0]; saveSettings();
  return settings.clipsDir;
});
ipcMain.handle('dir:open', () => shell.openPath(clipsDir()));
ipcMain.on('clip:drag', (e, id) => {
  const c = library.find((x) => x.id === id);
  if (!c || !fs.existsSync(c.file)) return;
  let icon = c.thumb ? nativeImage.createFromPath(c.thumb) : nativeImage.createEmpty();
  if (icon.isEmpty()) icon = nativeImage.createFromPath(path.join(ASSETS, 'icon.png'));
  e.sender.startDrag({ file: c.file, icon: icon.resize({ width: 160 }) });
});
ipcMain.on('hotkeys', (_e, on) => { if (on) registerHotkeys(); else globalShortcut.unregisterAll(); });
ipcMain.on('win', (_e, action) => {
  if (!mainWin) return;
  if (action === 'min') mainWin.minimize();
  if (action === 'max') mainWin.isMaximized() ? mainWin.unmaximize() : mainWin.maximize();
  if (action === 'close') mainWin.close();
});

// ───────────────────────────────────────────── lifecycle
app.on('second-instance', () => showMain());
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  try { fs.rmSync(BUF_DIR, { recursive: true, force: true }); } catch {}
});
app.on('window-all-closed', (e) => { if (!quitting) e.preventDefault(); });

app.whenReady().then(async () => {
  try { fs.rmSync(BUF_DIR, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(BUF_DIR, { recursive: true });

  tray = new Tray(nativeImage.createFromPath(path.join(ASSETS, 'tray.png')));
  tray.on('click', showMain);

  createToast();
  createMain(process.argv.includes('--hidden'));
  createRecorder();
  registerHotkeys();
  applyLoginItem();
  updateTray();

  // re-capture when monitors change
  screen.on('display-removed', () => startRecorder());
  screen.on('display-added', () => startRecorder());

  encoder = await detectEncoder();
  pushState();

  if (TEST_DIR) runSelfTest();
});

async function runSelfTest() {
  const log = (...a) => fs.appendFileSync(path.join(TEST_DIR, 'test.log'), a.join(' ') + '\n');
  mainWin.webContents.setBackgroundThrottling(false);
  const shot = async (name) => {
    mainWin.show(); mainWin.focus();
    mainWin.webContents.invalidate();
    await new Promise((r) => setTimeout(r, 400));
    const img = await mainWin.webContents.capturePage();
    fs.writeFileSync(path.join(TEST_DIR, name), img.toPNG());
  };
  log('encoder', encoder, 'ffmpeg', FFMPEG);
  await new Promise((r) => setTimeout(r, 14000));
  log('state', JSON.stringify(publicState()));
  await shot('01-empty.png');
  const r1 = await saveClip();
  log('clip1', JSON.stringify(r1));
  await new Promise((r) => setTimeout(r, 6000));
  const r2 = await takeScreenshot();
  log('shot', JSON.stringify(r2));
  await new Promise((r) => setTimeout(r, 2500));
  await shot('02-library.png');
  if (r1.ok) {
    mainWin.webContents.executeJavaScript(`openPlayer(${JSON.stringify(r1.id)})`);
    await new Promise((r) => setTimeout(r, 2500));
    await shot('03-player.png');
    const t = await trimClip(r1.id, 1, 5);
    log('trim', JSON.stringify(t));
  }
  mainWin.webContents.executeJavaScript(`go('settings')`);
  await new Promise((r) => setTimeout(r, 1500));
  await shot('04-settings.png');
  log('library', JSON.stringify(library.map((c) => ({ t: c.type, d: c.duration, s: c.size, title: c.title }))));
  quitting = true;
  app.quit();
}
