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
  // v1.0.1
  onboarded: false,
  profileName: '',
  avatar: null,
  google: null,
  googleClientId: '',
  googleClientSecret: '',
  discordWebhook: '',
  discordInfo: null,
  discordAutoPost: false,
  discordLimitMB: 10,
  maxStorageGB: 0,
  checkUpdates: true,
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
let update = null; // { version, url } when a newer release exists
const busy = new Set(); // clip ids with a running share/export job

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
    update,
    busy: [...busy],
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
        name = name.replace(/\s*[-–—|]\s*(Steam|Epic Games|Direct3D.*|DX1\d.*|Vulkan.*|Google Chrome|Mozilla Firefox|Microsoft\S* Edge|Opera.*|Brave|Visual Studio Code)$/i, '').trim();
        // long browser/app titles: keep the most specific part
        if (name.length > 32 && /\s[-–—|]\s/.test(name)) name = name.split(/\s[-–—|]\s/)[0].trim();
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
    afterNewItem(item);
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
  afterNewItem(item);
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

// ───────────────────────────────────────────── v1.0.1: sharing & integrations
const http = require('http');
const crypto = require('crypto');

function afterNewItem(item) {
  enforceStorage().catch(() => {});
  if (settings.discordAutoPost && settings.discordWebhook) {
    discordSend(item.id, { auto: true })
      .then(() => toast({ kind: 'discord', title: 'Posted to Discord', sub: settings.discordInfo ? `#${settings.discordInfo.name}` : item.title }))
      .catch((e) => toast({ kind: 'error', title: 'Discord upload failed', sub: String(e.message).slice(0, 80) }));
  }
}

async function enforceStorage() {
  if (!settings.maxStorageGB) return;
  const max = settings.maxStorageGB * 1e9;
  let total = library.reduce((a, c) => a + (c.size || 0), 0);
  if (total <= max) return;
  const victims = library.filter((c) => !c.favorite).sort((a, b) => a.createdAt - b.createdAt);
  let removed = 0;
  for (const v of victims) {
    if (total <= max) break;
    try { await shell.trashItem(v.file); } catch {}
    if (v.thumb) fs.rm(v.thumb, { force: true }, () => {});
    library = library.filter((x) => x.id !== v.id);
    total -= v.size || 0;
    removed++;
  }
  if (removed) { saveLibrary(); pushLibrary(); }
}

function setBusy(id, on) { on ? busy.add(id) : busy.delete(id); pushState(); }

// copies a file to the Windows clipboard as a real file (paste into Discord, Explorer, Gmail…)
function copyFileToClipboard(file) {
  return new Promise((resolve) => {
    if (TEST_DIR) return resolve(true); // don't touch the real clipboard during self-tests
    const script = `Set-Clipboard -LiteralPath '${file.replace(/'/g, "''")}'`;
    const enc = Buffer.from(script, 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', enc],
      { windowsHide: true, timeout: 10000 }, (err) => resolve(!err));
  });
}

// ── Discord (webhook – no developer app or login needed)
const WEBHOOK_RE = /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+\/?$/;
async function discordConnect(url) {
  url = String(url || '').trim();
  if (!WEBHOOK_RE.test(url)) return { ok: false, error: 'That does not look like a Discord webhook URL' };
  try {
    const r = await fetch(url);
    if (!r.ok) return { ok: false, error: `Discord rejected the webhook (${r.status})` };
    const j = await r.json();
    settings.discordWebhook = url;
    settings.discordInfo = { name: j.name || 'Webhook', channel_id: j.channel_id, guild_id: j.guild_id };
    saveSettings();
    return { ok: true, info: settings.discordInfo };
  } catch (e) { return { ok: false, error: e.message }; }
}
async function discordPost(form) {
  const r = await fetch(settings.discordWebhook + '?wait=true', { method: 'POST', body: form });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); if (j.message) msg = j.message; } catch {}
    throw new Error(msg);
  }
}
async function discordTest() {
  if (!settings.discordWebhook) return { ok: false, error: 'Not connected' };
  try {
    const form = new FormData();
    form.append('payload_json', JSON.stringify({ username: 'Clipy', content: '◉ **Clipy is connected.** New clips can be shared here with one click.' }));
    await discordPost(form);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
async function compressForLimit(c, limitBytes) {
  const dur = Math.max(1, c.duration || 1);
  let factor = 1;
  for (let attempt = 0; attempt < 3; attempt++) {
    const totalBits = limitBytes * 8 * 0.9 * factor;
    const abps = 96000;
    const vbps = Math.max(120000, Math.floor(totalBits / dur - abps));
    const h = vbps > 2.5e6 ? 1080 : vbps > 1.2e6 ? 720 : vbps > 500e3 ? 540 : 360;
    const fps = vbps > 1.5e6 ? Math.min(60, settings.fps) : 30;
    const out = path.join(os.tmpdir(), `clipy-share-${c.id}-${attempt}.mp4`);
    await ffmpeg(['-y', '-hide_banner', '-loglevel', 'error', '-i', c.file,
      '-vf', `scale=-2:'min(${h},ih)',fps=${fps},format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', String(vbps), '-maxrate', String(Math.floor(vbps * 1.15)), '-bufsize', String(vbps * 2),
      '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out]);
    const size = fs.statSync(out).size;
    if (size <= limitBytes) return out;
    fs.rm(out, { force: true }, () => {});
    factor *= 0.75;
  }
  throw new Error('Clip is too long to fit the Discord size limit – trim it first');
}
async function discordSend(id) {
  const c = library.find((x) => x.id === id);
  if (!c) throw new Error('Clip not found');
  if (!settings.discordWebhook) throw new Error('Discord is not connected');
  setBusy(id, true);
  let tmp = null;
  try {
    const limit = (settings.discordLimitMB || 10) * 1000 * 1000 * 0.98;
    let file = c.file;
    if (c.size > limit) {
      if (c.type === 'shot') {
        tmp = path.join(os.tmpdir(), `clipy-share-${c.id}.jpg`);
        await ffmpeg(['-y', '-hide_banner', '-loglevel', 'error', '-i', c.file, '-q:v', '3', tmp]);
      } else {
        tmp = await compressForLimit(c, limit);
      }
      file = tmp;
    }
    const ext = path.extname(file).toLowerCase();
    const mime = ext === '.mp4' ? 'video/mp4' : ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
    const form = new FormData();
    const who = settings.profileName ? ` · by ${settings.profileName}` : '';
    form.append('payload_json', JSON.stringify({
      username: 'Clipy',
      content: `**${c.title}**${c.game && c.game !== c.title ? ` · ${c.game}` : ''}${who}`,
    }));
    form.append('files[0]', new Blob([fs.readFileSync(file)], { type: mime }), `${c.title.replace(/[^\w\- ]+/g, '').trim() || 'clip'}${ext}`);
    await discordPost(form);
    c.sharedDiscord = Date.now();
    saveLibrary(); pushLibrary();
    return { ok: true };
  } finally {
    if (tmp) fs.rm(tmp, { force: true }, () => {});
    setBusy(id, false);
  }
}

// ── GIF export
async function makeGif(id, a, b) {
  const c = library.find((x) => x.id === id);
  if (!c || c.type !== 'clip') throw new Error('Clip not found');
  setBusy(id, true);
  try {
    const start = Math.max(0, a || 0);
    const dur = Math.max(0.5, Math.min(15, (b || c.duration) - start));
    const dir = path.join(clipsDir(), 'GIFs');
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, `${path.basename(c.file, '.mp4')}_${Date.now().toString(36)}.gif`);
    await ffmpeg(['-y', '-hide_banner', '-loglevel', 'error', '-ss', start.toFixed(2), '-t', dur.toFixed(2), '-i', c.file,
      '-filter_complex', 'fps=15,scale=480:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
      '-loop', '0', out]);
    await copyFileToClipboard(out);
    return { ok: true, file: out, size: fs.statSync(out).size };
  } finally { setBusy(id, false); }
}

// ── Google sign-in (OAuth 2.0 + PKCE, loopback redirect)
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const AUTH_PAGE = (title, text) => `<!doctype html><meta charset="utf-8"><title>Clipy</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#000;color:#fff;font-family:Segoe UI,system-ui,sans-serif">
<div style="text-align:center"><div style="width:64px;height:64px;border-radius:16px;background:#fff;margin:0 auto 24px;display:grid;place-items:center">
<div style="width:22px;height:22px;border-radius:50%;background:#000"></div></div>
<h1 style="margin:0 0 8px;font-size:28px;letter-spacing:-.02em">${title}</h1><p style="color:#8a8a8a;margin:0">${text}</p></div></body>`;

async function googleSignIn() {
  const clientId = (settings.googleClientId || '').trim();
  if (!clientId) return { ok: false, needsSetup: true };
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  const server = http.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const redirect = `http://127.0.0.1:${server.address().port}`;
  const codeP = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Sign-in timed out')), 5 * 60 * 1000);
    server.on('request', (req, res) => {
      const u = new URL(req.url, redirect);
      if (u.pathname !== '/') { res.writeHead(404); return res.end(); }
      const err = u.searchParams.get('error');
      const ok = !err && u.searchParams.get('state') === state && u.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(ok ? AUTH_PAGE('You\'re signed in.', 'You can close this tab and go back to Clipy.') : AUTH_PAGE('Sign-in cancelled', 'Head back to Clipy and try again.'));
      clearTimeout(t);
      ok ? resolve(u.searchParams.get('code')) : reject(new Error(err || 'Sign-in failed'));
    });
  });
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.search = new URLSearchParams({
    client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: 'openid email profile',
    code_challenge: challenge, code_challenge_method: 'S256', state, prompt: 'select_account',
  }).toString();
  shell.openExternal(auth.toString());
  let code;
  try { code = await codeP; } finally { server.close(); }
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: (settings.googleClientSecret || '').trim(),
      redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier,
    }),
  });
  const tok = await tokenRes.json();
  if (!tokenRes.ok || !tok.access_token) throw new Error(tok.error_description || tok.error || 'Token exchange failed');
  const uiRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tok.access_token}` } });
  const info = await uiRes.json();
  let picture = null;
  if (info.picture) {
    try {
      const img = await fetch(info.picture.replace(/=s\d+-c$/, '=s256-c'));
      picture = path.join(USER, 'avatar-google.jpg');
      fs.writeFileSync(picture, Buffer.from(await img.arrayBuffer()));
    } catch { picture = null; }
  }
  settings.google = { name: info.name || info.email, email: info.email, picture, since: Date.now() };
  if (!settings.profileName) settings.profileName = info.given_name || info.name || '';
  if (!settings.avatar && picture) settings.avatar = picture;
  saveSettings();
  showMain();
  return { ok: true };
}

// ── update check (public GitHub releases API)
const REPO = 'un0yy-sasse/Clipy';
function newer(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}
async function checkUpdate() {
  if (!settings.checkUpdates || TEST_DIR) return;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { 'User-Agent': 'Clipy-App', Accept: 'application/vnd.github+json' } });
    if (!r.ok) return;
    const j = await r.json();
    const v = String(j.tag_name || '').replace(/^v/, '');
    if (v && newer(v, app.getVersion())) { update = { version: v, url: j.html_url }; pushState(); }
  } catch {}
}

function profileForUI() {
  return {
    name: settings.profileName,
    avatarUrl: settings.avatar && fs.existsSync(settings.avatar) ? fileUrl(settings.avatar) + `?v=${fs.statSync(settings.avatar).mtimeMs}` : null,
    google: settings.google ? { name: settings.google.name, email: settings.google.email } : null,
    googleConfigured: !!(settings.googleClientId || '').trim(),
    discord: settings.discordWebhook ? settings.discordInfo || { name: 'Webhook' } : null,
  };
}

ipcMain.handle('profile', () => profileForUI());
ipcMain.handle('avatar:choose', async () => {
  const r = await dialog.showOpenDialog(mainWin, { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] });
  if (r.canceled || !r.filePaths[0]) return profileForUI();
  const dest = path.join(USER, 'avatar' + path.extname(r.filePaths[0]).toLowerCase());
  try {
    await ffmpeg(['-y', '-hide_banner', '-loglevel', 'error', '-i', r.filePaths[0], '-vf', "crop='min(iw,ih)':'min(iw,ih)',scale=256:256", '-frames:v', '1', path.join(USER, 'avatar.png')]);
    settings.avatar = path.join(USER, 'avatar.png');
  } catch {
    fs.copyFileSync(r.filePaths[0], dest);
    settings.avatar = dest;
  }
  saveSettings();
  return profileForUI();
});
ipcMain.handle('avatar:clear', () => { settings.avatar = null; saveSettings(); return profileForUI(); });
ipcMain.handle('google:signin', async () => {
  try { return await googleSignIn(); } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('google:signout', () => {
  if (settings.google && settings.avatar === settings.google.picture) settings.avatar = null;
  settings.google = null; saveSettings(); return profileForUI();
});
ipcMain.handle('google:help', () => shell.openExternal('https://console.cloud.google.com/apis/credentials'));
ipcMain.handle('discord:connect', (_e, url) => discordConnect(url));
ipcMain.handle('discord:disconnect', () => { settings.discordWebhook = ''; settings.discordInfo = null; settings.discordAutoPost = false; saveSettings(); return profileForUI(); });
ipcMain.handle('discord:test', () => discordTest());
ipcMain.handle('discord:send', async (_e, id) => { try { return await discordSend(id); } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('clip:copy', async (_e, id) => { const c = library.find((x) => x.id === id); return c ? copyFileToClipboard(c.file) : false; });
ipcMain.handle('clip:gif', async (_e, id, a, b) => { try { return await makeGif(id, a, b); } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('clip:gmail', async (_e, id) => {
  const c = library.find((x) => x.id === id);
  if (!c) return false;
  await copyFileToClipboard(c.file);
  const su = encodeURIComponent(`Clipy: ${c.title}`);
  const body = encodeURIComponent(`Check out this ${c.type === 'shot' ? 'screenshot' : 'clip'}${c.game ? ` from ${c.game}` : ''}!\n\n(attached)\n\n— sent with Clipy`);
  shell.openExternal(`https://mail.google.com/mail/?view=cm&fs=1&su=${su}&body=${body}`);
  return true;
});
ipcMain.handle('file:reveal', (_e, file) => { if (file && file.startsWith(settings.clipsDir)) shell.showItemInFolder(file); });
ipcMain.handle('update:open', () => { if (update) shell.openExternal(update.url); });
ipcMain.handle('external', (_e, which) => {
  const urls = { repo: `https://github.com/${REPO}`, releases: `https://github.com/${REPO}/releases`, webhookHelp: 'https://support.discord.com/hc/en-us/articles/228383668' };
  if (urls[which]) shell.openExternal(urls[which]);
});

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
  if (patch.maxStorageGB !== undefined) enforceStorage().catch(() => {});
  if (patch.checkUpdates) checkUpdate();
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
  checkUpdate();
  setInterval(checkUpdate, 6 * 60 * 60 * 1000);

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
  await shot('00-onboarding.png');
  await mainWin.webContents.executeJavaScript(`document.querySelector('#oNext').click()`);
  await new Promise((r) => setTimeout(r, 600));
  await shot('00b-onboarding.png');
  settings.profileName = 'Tester'; settings.onboarded = true; saveSettings();
  await mainWin.webContents.executeJavaScript(`(async()=>{settings=await api.getSettings();profile=await api.profile();renderChip();closeModal();go('library')})()`);
  await new Promise((r) => setTimeout(r, 800));
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
    await mainWin.webContents.executeJavaScript(`document.querySelector('#pShare').click()`);
    await new Promise((r) => setTimeout(r, 500));
    await shot('03b-share.png');
    const t = await trimClip(r1.id, 1, 5);
    log('trim', JSON.stringify(t));
    const g = await makeGif(r1.id, 0, 3).catch((e) => ({ ok: false, error: e.message }));
    log('gif', JSON.stringify(g));
    log('discord-bad', JSON.stringify(await discordConnect('https://example.com/nope')));
    const big = library.find((c) => c.id === r1.id);
    const cmp = await compressForLimit(big, 200000).then((f) => ({ ok: true, size: fs.statSync(f).size })).catch((e) => ({ ok: false, error: e.message }));
    log('compress', JSON.stringify(cmp));
  }
  mainWin.webContents.executeJavaScript(`closeMenu();closeModal();go('library')`);
  await new Promise((r) => setTimeout(r, 1500));
  await shot('02b-library.png');
  mainWin.webContents.executeJavaScript(`go('profile')`);
  await new Promise((r) => setTimeout(r, 1500));
  await shot('05-profile.png');
  mainWin.webContents.executeJavaScript(`go('settings')`);
  await new Promise((r) => setTimeout(r, 1500));
  await shot('04-settings.png');
  log('library', JSON.stringify(library.map((c) => ({ t: c.type, d: c.duration, s: c.size, title: c.title }))));
  quitting = true;
  app.quit();
}
