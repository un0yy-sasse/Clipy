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
const TEST_DIR = process.env.CLIPY_TEST_DIR; // self-test mode (dev only) – separate profile, may run beside a normal Clipy
if (TEST_DIR) app.setPath('userData', path.join(TEST_DIR, 'userdata'));
if (!TEST_DIR && !app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.setAppUserModelId('app.clipy.desktop');

const ROOT = path.join(__dirname, '..', '..');
const ASSETS = path.join(ROOT, 'assets');
let FFMPEG = require('ffmpeg-static');
if (FFMPEG) FFMPEG = FFMPEG.replace('app.asar', 'app.asar.unpacked');

const SEG_SECONDS = 20; // length of one rolling buffer session
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
  longClipHotkey: 'F7',
  longClipLength: 120,
  friendAlerts: true,
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
  discordClientId: '',
  discordClientSecret: '',
  discordUser: null,
  accountId: null,
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
  const longest = Math.max(settings.clipLength, settings.longClipHotkey ? settings.longClipLength || 0 : 0);
  const keep = Math.ceil(longest / SEG_SECONDS) + 2;
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

async function saveClip(length) {
  if (!settings.bufferEnabled || !rec.ready) {
    toast({ kind: 'error', title: 'Replay is off', sub: 'Turn on the buffer in Clipy' });
    return { ok: false, error: 'Replay buffer is not active' };
  }
  if (saving) return { ok: false, error: 'Already saving' };
  saving = true; pushState();
  const wanted = Number(length) || settings.clipLength;
  toast({ kind: 'progress', title: wanted > settings.clipLength ? 'Saving long clip' : 'Saving clip', sub: `Last ${wanted}s`, sound: true });
  let pick = [];
  try {
    const gameP = detectGame().catch(() => null);
    const old = rec.currentId;
    recWin.webContents.send('rec:rotate');
    await waitDone(old);

    const len = wanted;
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
  if (item.game) lastGame = { name: item.game, at: Date.now() };
  if (cloud.configured() && cloud.session()) {
    cloud.postActivity({ title: item.title, game: item.game, duration: item.duration, type: item.type }).catch(() => {});
    cloudHeartbeat();
  }
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

// Sign-in apps baked into the build (oauth.json is git-ignored, so the secrets never land on GitHub).
// Desktop OAuth secrets can't be truly secret anyway (Google: "installed apps"), but we keep them out of the repo.
const BUNDLED = readJSON(path.join(ROOT, 'oauth.json'), {});
// Built-in keys always win and cannot be overridden from the app.
const cred = (key) => String(BUNDLED[key] || settings[key] || '').trim();
const bundledHas = (k) => !!String(BUNDLED[k] || '').trim();
const cloud = require('./cloud')({ userDir: USER, config: BUNDLED });

// Opens the provider's sign-in page in the browser and waits for the redirect on a local port.
async function loopbackAuth({ port = 0, pathName = '/', authUrl }) {
  const state = b64url(crypto.randomBytes(16));
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', (e) => reject(e.code === 'EADDRINUSE' ? new Error(`Port ${port} is busy – close other sign-ins and try again`) : e));
    server.listen(port, '127.0.0.1', resolve);
  });
  const redirect = `http://127.0.0.1:${server.address().port}${pathName}`;
  const codeP = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Sign-in timed out')), 5 * 60 * 1000);
    server.on('request', (req, res) => {
      const u = new URL(req.url, redirect);
      if (u.pathname !== pathName) { res.writeHead(404); return res.end(); }
      const err = u.searchParams.get('error');
      const ok = !err && u.searchParams.get('state') === state && u.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(ok ? AUTH_PAGE('You\'re signed in.', 'You can close this tab and go back to Clipy.') : AUTH_PAGE('Sign-in cancelled', 'Head back to Clipy and try again.'));
      clearTimeout(t);
      ok ? resolve(u.searchParams.get('code')) : reject(new Error(u.searchParams.get('error_description') || err || 'Sign-in failed'));
    });
  });
  shell.openExternal(authUrl(redirect, state));
  try { return { code: await codeP, redirect }; } finally { server.close(); }
}
async function downloadTo(url, file) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    return file;
  } catch { return null; }
}

async function googleSignIn() {
  const clientId = cred('googleClientId');
  if (!clientId) return { ok: false, needsSetup: true };
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const { code, redirect } = await loopbackAuth({
    authUrl: (redirectUri, state) => 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile',
      code_challenge: challenge, code_challenge_method: 'S256', state, prompt: 'select_account',
    }),
  });
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: cred('googleClientSecret'),
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
  // also sign in to Clipy Cloud (friends) with the same Google account
  let cloudError = null;
  if (cloud.configured() && tok.id_token) {
    try {
      await cloud.signInGoogle(tok.id_token);
      await cloud.ensureProfile({ name: settings.profileName, photo: info.picture || '' });
    } catch (e) { cloudError = e.message; }
  }
  showMain();
  return { ok: true, cloudError };
}

// ── Discord sign-in (OAuth 2.0, scope "identify"). Discord needs an exact redirect URI → fixed port.
const DISCORD_PORT = 53682;
const DISCORD_REDIRECT = `http://127.0.0.1:${DISCORD_PORT}/callback`;
async function discordLogin() {
  const clientId = cred('discordClientId');
  const secret = cred('discordClientSecret');
  if (!clientId || !secret) return { ok: false, needsSetup: true };
  const { code, redirect } = await loopbackAuth({
    port: DISCORD_PORT, pathName: '/callback',
    authUrl: (redirectUri, state) => 'https://discord.com/oauth2/authorize?' + new URLSearchParams({
      client_id: clientId, response_type: 'code', redirect_uri: redirectUri, scope: 'identify', state, prompt: 'consent',
    }),
  });
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: clientId, client_secret: secret }),
  });
  const tok = await tokenRes.json();
  if (!tokenRes.ok || !tok.access_token) throw new Error(tok.error_description || tok.error || 'Token exchange failed');
  const meRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tok.access_token}` } });
  const me = await meRes.json();
  if (!meRes.ok || !me.id) throw new Error(me.message || 'Could not read your Discord profile');
  const avatar = me.avatar ? await downloadTo(`https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=256`, path.join(USER, 'avatar-discord.png')) : null;
  settings.discordUser = { id: me.id, username: me.username, name: me.global_name || me.username, avatar, since: Date.now() };
  if (!settings.profileName) settings.profileName = settings.discordUser.name;
  if (!settings.avatar && avatar) settings.avatar = avatar;
  settings.discordUser.photoUrl = me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128` : '';
  saveSettings();
  const cloudError = await discordCloudLink();
  showMain();
  return { ok: true, cloudError };
}
// gives Discord users a Clipy Cloud account (bound to this PC) so Friends work for them too
async function discordCloudLink() {
  if (!cloud.configured() || !settings.discordUser) return null;
  try {
    const s = cloud.session();
    if (!s) await cloud.signInDevice('discord');
    else if (s.provider !== 'discord') return null; // already signed in with Google/email – keep that account
    await cloud.ensureProfile({ name: settings.profileName || settings.discordUser.name, photo: settings.discordUser.photoUrl || '' });
    return null;
  } catch (e) { return e.message; }
}
ipcMain.handle('discord:cloud', async () => { const err = await discordCloudLink(); return err ? { ok: false, error: err } : { ok: true }; });

// ── Clipy accounts (email + password, stored only on this PC; passwords are scrypt-hashed, never saved in plain text)
const ACCOUNTS_FILE = path.join(USER, 'accounts.json');
let accounts = readJSON(ACCOUNTS_FILE, []);
const saveAccounts = () => writeJSON(ACCOUNTS_FILE, accounts);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const scryptP = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function currentAccount() { return accounts.find((a) => a.id === settings.accountId) || null; }
function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password needs at least 8 characters';
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return 'Use letters and at least one number';
  return null;
}
async function accountRegister({ email, password, name }) {
  email = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Enter a valid email address' };
  const bad = checkPassword(password);
  if (bad) return { ok: false, error: bad };
  if (accounts.some((a) => a.email === email)) return { ok: false, error: 'An account with this email already exists – sign in instead' };
  const salt = crypto.randomBytes(16);
  const hash = await scryptP(password, salt);
  const acc = { id: newId(), email, name: String(name || '').trim().slice(0, 32), salt: salt.toString('hex'), hash: hash.toString('hex'), created: Date.now() };
  accounts.push(acc); saveAccounts();
  settings.accountId = acc.id;
  if (acc.name && !settings.profileName) settings.profileName = acc.name;
  saveSettings();
  return { ok: true };
}
async function accountLogin({ email, password }) {
  email = String(email || '').trim().toLowerCase();
  const acc = accounts.find((a) => a.email === email);
  const hash = await scryptP(String(password || ''), acc ? Buffer.from(acc.salt, 'hex') : crypto.randomBytes(16));
  if (!acc || !crypto.timingSafeEqual(hash, Buffer.from(acc.hash, 'hex'))) {
    await pause(600); // slow down guessing
    return { ok: false, error: 'Wrong email or password' };
  }
  settings.accountId = acc.id;
  if (acc.name && !settings.profileName) settings.profileName = acc.name;
  saveSettings();
  return { ok: true };
}
async function accountChangePassword({ current, next }) {
  const acc = currentAccount();
  if (!acc) return { ok: false, error: 'Not signed in' };
  const hash = await scryptP(String(current || ''), Buffer.from(acc.salt, 'hex'));
  if (!crypto.timingSafeEqual(hash, Buffer.from(acc.hash, 'hex'))) { await pause(600); return { ok: false, error: 'Current password is wrong' }; }
  const bad = checkPassword(next);
  if (bad) return { ok: false, error: bad };
  const salt = crypto.randomBytes(16);
  acc.salt = salt.toString('hex');
  acc.hash = (await scryptP(next, salt)).toString('hex');
  saveAccounts();
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
    googleConfigured: !!cred('googleClientId'),
    googleBundled: bundledHas('googleClientId'),
    discord: settings.discordWebhook ? settings.discordInfo || { name: 'Webhook' } : null,
    discordUser: settings.discordUser ? { name: settings.discordUser.name, username: settings.discordUser.username } : null,
    discordLoginConfigured: !!(cred('discordClientId') && cred('discordClientSecret')),
    discordBundled: bundledHas('discordClientId'),
    discordRedirect: DISCORD_REDIRECT,
    account: (() => {
      if (cloud.configured()) {
        const s = cloud.session();
        return s && s.provider === 'password' ? { email: s.email, name: settings.profileName, created: s.created || Date.now(), online: true } : null;
      }
      const a = currentAccount(); return a ? { email: a.email, name: a.name, created: a.created } : null;
    })(),
    accountsOnDevice: accounts.length,
    cloud: { configured: cloud.configured(), signedIn: !!cloud.session(), provider: cloud.session() ? cloud.session().provider : null },
  };
}
ipcMain.handle('discord:login', async () => {
  try { return await discordLogin(); } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('discord:logout', () => {
  if (settings.discordUser && settings.avatar === settings.discordUser.avatar) settings.avatar = null;
  settings.discordUser = null; saveSettings();
  const s = cloud.session();
  if (s && s.provider === 'discord') cloud.signOut();
  return profileForUI();
});
ipcMain.handle('discord:loginhelp', () => shell.openExternal('https://discord.com/developers/applications'));
// With Clipy Cloud set up, email accounts are real online accounts (Firebase Auth); otherwise local.
async function cloudAuth(fn, d) {
  const email = String(d.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Enter a valid email address' };
  if (fn === 'up') { const bad = checkPassword(d.password); if (bad) return { ok: false, error: bad }; }
  try {
    if (fn === 'up') await cloud.signUpEmail(email, d.password); else await cloud.signInEmail(email, d.password);
    if (d.name && !settings.profileName) { settings.profileName = String(d.name).trim().slice(0, 32); saveSettings(); }
    await cloud.ensureProfile({ name: settings.profileName || d.name });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
ipcMain.handle('account:register', (_e, d) => (cloud.configured() ? cloudAuth('up', d || {}) : accountRegister(d || {})));
ipcMain.handle('account:login', (_e, d) => (cloud.configured() ? cloudAuth('in', d || {}) : accountLogin(d || {})));
ipcMain.handle('account:logout', () => {
  settings.accountId = null; saveSettings();
  const s = cloud.session(); if (s && s.provider === 'password') cloud.signOut();
  return profileForUI();
});
ipcMain.handle('account:password', async (_e, d) => {
  if (!cloud.configured()) return accountChangePassword(d || {});
  const s = cloud.session();
  if (!s || s.provider !== 'password') return { ok: false, error: 'Not signed in with email' };
  const bad = checkPassword(d.next); if (bad) return { ok: false, error: bad };
  try { await cloud.signInEmail(s.email, d.current); } catch { return { ok: false, error: 'Current password is wrong' }; }
  try { await cloud.changePassword(d.next); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('account:reset', async (_e, email) => {
  if (!cloud.configured()) return { ok: false, error: 'Password reset needs Clipy Cloud' };
  try { await cloud.resetPassword(String(email || '').trim()); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
});

// ── friends (Clipy Cloud)
const friendsErr = (e) => ({ ok: false, error: /permission denied/i.test(e.message) ? 'Not allowed – maybe a request is already pending' : e.message });
ipcMain.handle('friends:overview', async () => {
  if (!cloud.configured()) return { ok: false, reason: 'not-configured' };
  if (!cloud.session()) return { ok: false, reason: 'signed-out' };
  try {
    const me = await cloud.ensureProfile({ name: settings.profileName });
    const o = await cloud.overview();
    return { ok: true, me, ...o, now: Date.now() };
  } catch (e) { return { ok: false, reason: 'error', error: e.message }; }
});
ipcMain.handle('friends:add', async (_e, code) => { try { return { ok: true, ...(await cloud.sendRequest(code, settings.profileName)) }; } catch (e) { return friendsErr(e); } });
ipcMain.handle('friends:accept', async (_e, req) => { try { await cloud.accept(req); return { ok: true }; } catch (e) { return friendsErr(e); } });
ipcMain.handle('friends:decline', async (_e, req) => { try { await cloud.decline(req); return { ok: true }; } catch (e) { return friendsErr(e); } });
ipcMain.handle('friends:remove', async (_e, uid) => { try { await cloud.removeFriend(uid); return { ok: true }; } catch (e) { return friendsErr(e); } });

let lastGame = { name: '', at: 0 };
function cloudHeartbeat() {
  if (!cloud.configured() || !cloud.session()) return;
  const game = Date.now() - lastGame.at < 20 * 60 * 1000 ? lastGame.name : '';
  cloud.heartbeat({ name: settings.profileName, game, clipping: settings.bufferEnabled && rec.ready }).catch(() => {});
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
  settings.google = null; saveSettings();
  const s = cloud.session();
  if (s && s.provider === 'google') cloud.signOut();
  return profileForUI();
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

// ───────────────────────────────────────────── v1.0.4: Clipy Studio
const studio = require('./studio')({
  ffmpegPath: FFMPEG, ffmpeg, encoderArgs: () => encoderArgs(), pixFmt: () => pixFmt(encoder), fps: () => settings.fps,
});
async function addDerived(src, file, { title, duration, kind }) {
  const id = newId();
  const thumb = await makeThumb(file, id, Math.min(2, Math.max(0, duration / 3)));
  const item = {
    id, type: 'clip', file, thumb, game: src ? src.game : null, title, createdAt: Date.now(),
    duration, favorite: false, size: fs.statSync(file).size, kind: kind || null,
  };
  library.unshift(item); saveLibrary(); pushLibrary();
  return item;
}
ipcMain.handle('studio:montage', async (_e, ids, opts) => {
  const clips = (ids || []).map((id) => library.find((c) => c.id === id)).filter((c) => c && c.type === 'clip' && fs.existsSync(c.file));
  if (clips.length < 2) return { ok: false, error: 'Pick at least 2 clips' };
  clips.forEach((c) => busy.add(c.id)); pushState();
  try {
    const dir = path.join(clipsDir(), 'Montages'); fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, `Montage_${stamp(new Date())}.mp4`);
    const r = await studio.montage(clips.map((c) => c.file), out, opts || {});
    const games = [...new Set(clips.map((c) => c.game).filter(Boolean))];
    const item = await addDerived(games.length === 1 ? clips[0] : null, out, {
      title: `Montage · ${games.length === 1 ? games[0] : `${clips.length} clips`}`, duration: r.duration, kind: 'montage',
    });
    toast({ kind: 'done', title: 'Montage ready', sub: `${clips.length} clips · ${Math.round(r.duration)}s` });
    return { ok: true, id: item.id };
  } catch (e) { return { ok: false, error: String(e.message).slice(0, 200) }; }
  finally { clips.forEach((c) => busy.delete(c.id)); pushState(); }
});
ipcMain.handle('studio:export', async (_e, id, opts) => {
  const c = library.find((x) => x.id === id);
  if (!c || c.type !== 'clip') return { ok: false, error: 'Clip not found' };
  setBusy(id, true);
  try {
    const o = opts || {};
    const dir = path.join(clipsDir(), 'Exports'); fs.mkdirSync(dir, { recursive: true });
    const tag = { vertical: '9x16', square: '1x1', original: 'edit' }[o.format] || 'edit';
    const out = path.join(dir, `${path.basename(c.file, '.mp4')}_${tag}_${Date.now().toString(36)}.mp4`);
    const r = await studio.socialExport(c.file, out, o);
    const label = { vertical: 'Vertical', square: 'Square', original: 'Edit' }[o.format] || 'Edit';
    const sp = Number(o.speed) || 1;
    const item = await addDerived(c, out, { title: `${c.title} (${label}${sp !== 1 ? ` · ${sp}×` : ''})`, duration: r.duration, kind: o.format });
    return { ok: true, id: item.id };
  } catch (e) { return { ok: false, error: String(e.message).slice(0, 200) }; }
  finally { setBusy(id, false); }
});
ipcMain.handle('studio:highlights', async (_e, id) => {
  const c = library.find((x) => x.id === id);
  if (!c || c.type !== 'clip') return { ok: false, error: 'Clip not found' };
  try { return { ok: true, ...(await studio.highlights(c.file)) }; } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('clips:bulk', async (_e, action, ids) => {
  const set = new Set(ids || []);
  if (action === 'favorite' || action === 'unfavorite') {
    library.forEach((c) => { if (set.has(c.id)) c.favorite = action === 'favorite'; });
    saveLibrary(); return { ok: true };
  }
  if (action === 'delete') {
    for (const c of library.filter((x) => set.has(x.id))) {
      try { await shell.trashItem(c.file); } catch {}
      if (c.thumb) fs.rm(c.thumb, { force: true }, () => {});
    }
    library = library.filter((c) => !set.has(c.id)); saveLibrary(); return { ok: true };
  }
  return { ok: false, error: 'Unknown action' };
});

// friend alerts: poll friends' activity and toast new clips
let friendAlertSince = 0;
async function pollFriendActivity() {
  if (!settings.friendAlerts || !cloud.configured() || !cloud.session()) return;
  try {
    const o = await cloud.overview();
    const fresh = o.friends.flatMap((f) => (f.activity || []).map((a) => ({ ...a, who: f.name }))).filter((a) => a.at > friendAlertSince);
    if (friendAlertSince && fresh.length) {
      const a = fresh.sort((x, y) => y.at - x.at)[0];
      toast({ kind: 'friend', title: `${a.who} ${a.type === 'shot' ? 'took a screenshot' : 'saved a clip'}`, sub: a.game || a.title || '' });
      if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('friends-activity');
    }
    friendAlertSince = Math.max(Date.now() - 5000, ...fresh.map((a) => a.at), friendAlertSince);
  } catch {}
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
  reg(settings.longClipHotkey, () => saveClip(settings.longClipLength), 'long');
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
  if (patch.clipHotkey !== undefined || patch.screenshotHotkey !== undefined || patch.longClipHotkey !== undefined) registerHotkeys();
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
ipcMain.handle('clip:save', (_e, len) => saveClip(len));
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
  cloudHeartbeat();
  setInterval(cloudHeartbeat, 60 * 1000);
  pollFriendActivity();
  setInterval(pollFriendActivity, 90 * 1000);

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
  const js = (code) => mainWin.webContents.executeJavaScript(code).catch((e) => log('js-error', e.message));
  log('encoder', encoder, 'ffmpeg', FFMPEG);
  await new Promise((r) => setTimeout(r, 14000));
  log('state', JSON.stringify(publicState()));
  await shot('00-onboarding.png');
  await js(`document.querySelector('#oNext').click()`);
  await new Promise((r) => setTimeout(r, 600));
  await shot('00b-onboarding.png');
  settings.profileName = 'Tester'; settings.onboarded = true; saveSettings();
  await js(`(async()=>{settings=await api.getSettings();profile=await api.profile();renderChip();closeModal();go('library')})()`);
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
    js(`openPlayer(${JSON.stringify(r1.id)})`);
    await new Promise((r) => setTimeout(r, 2500));
    await shot('03-player.png');
    await js(`document.querySelector('#pShare').click()`);
    await new Promise((r) => setTimeout(r, 500));
    await shot('03b-share.png');
    const t = await trimClip(r1.id, 1, 5);
    log('trim', JSON.stringify(t));
    // v1.0.4 studio checks
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const longR = await saveClip(60);
    log('long-clip', JSON.stringify(longR), longR.ok ? library.find((c) => c.id === longR.id).duration.toFixed(1) : '');
    const ids = library.filter((c) => c.type === 'clip').slice(0, 2).map((c) => c.id);
    await js(`closeModal();go('library')`); await wait(1500);
    await js(`toggleSelect(${JSON.stringify(ids[0])});toggleSelect(${JSON.stringify(ids[1])})`); await wait(800);
    await shot('07-selection.png');
    log('montage', JSON.stringify(await js(`api.montage(${JSON.stringify(ids)}, { transition: 'fade' })`)));
    await js('clearSelection()');
    log('export', JSON.stringify(await js(`api.exportClip(${JSON.stringify(r1.id)}, { format: 'vertical', speed: 1 })`)));
    log('highlights', JSON.stringify(await js(`api.highlights(${JSON.stringify(r1.id)})`)));
    await js(`openPlayer(${JSON.stringify(r1.id)})`); await wait(2000);
    await js(`document.querySelector('#pHigh').click()`); await wait(9000);
    await shot('08-highlight.png');
    await js(`exportDialog(lib.find((c) => c.id === ${JSON.stringify(r1.id)}), [0, 5])`); await wait(800);
    await shot('09-export.png');
    await js(`document.querySelectorAll('.dlg-wrap').forEach((x) => x.remove()); closeModal(); shortcutsDialog()`); await wait(600);
    await shot('10-shortcuts.png');
    await js(`document.querySelectorAll('.dlg-wrap').forEach((x) => x.remove()); go('library')`); await wait(1200);
    await shot('11-library.png');
    const g = await makeGif(r1.id, 0, 3).catch((e) => ({ ok: false, error: e.message }));
    log('gif', JSON.stringify(g));
    log('discord-bad', JSON.stringify(await discordConnect('https://example.com/nope')));
  }
  log('acc-weak', JSON.stringify(await accountRegister({ email: 'test@example.com', password: 'short', name: 'Tester' })));
  log('acc-register', JSON.stringify(await accountRegister({ email: 'Test@Example.com', password: 'clipy1234', name: 'Tester' })));
  log('acc-dupe', JSON.stringify(await accountRegister({ email: 'test@example.com', password: 'clipy1234' })));
  settings.accountId = null;
  log('acc-wrongpw', JSON.stringify(await accountLogin({ email: 'test@example.com', password: 'nope12345' })));
  log('acc-login', JSON.stringify(await accountLogin({ email: 'TEST@example.com', password: 'clipy1234' })));
  log('acc-chpw', JSON.stringify(await accountChangePassword({ current: 'clipy1234', next: 'better5678' })));
  settings.accountId = null;
  log('acc-oldpw', JSON.stringify(await accountLogin({ email: 'test@example.com', password: 'clipy1234' })));
  log('acc-newpw', JSON.stringify(await accountLogin({ email: 'test@example.com', password: 'better5678' })));
  log('acc-stored', JSON.stringify(Object.keys(accounts[0])), 'plaintext-in-file:', fs.readFileSync(ACCOUNTS_FILE, 'utf8').includes('better5678'));
  if (cloud.configured()) {
    settings.accountId = null;
    const tmpEmail = `clipy-ui-${Date.now().toString(36)}@example.com`;
    log('cloud-signup', JSON.stringify(await cloudAuth('up', { email: tmpEmail, password: 'Uitest12345', name: 'Tester' })));
    await cloud.postActivity({ title: 'Test clip', game: 'Clipy', duration: 12, type: 'clip' }).catch(() => {});
    js(`go('friends')`);
    await new Promise((r) => setTimeout(r, 6000));
    await shot('06-friends.png');
    try {
      const s = cloud.session();
      await fetch(`https://firestore.googleapis.com/v1/projects/${BUNDLED.firebaseProjectId}/databases/(default)/documents/users/${s.uid}`, { method: 'DELETE', headers: { Authorization: `Bearer ${s.idToken}` } });
      await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${BUNDLED.firebaseApiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: s.idToken }) });
      cloud.signOut();
      log('cloud-cleanup', 'ok');
    } catch (e) { log('cloud-cleanup', e.message); }
  }
  js(`closeMenu();closeModal();go('library')`);
  await new Promise((r) => setTimeout(r, 1500));
  await shot('02b-library.png');
  js(`go('profile')`);
  await new Promise((r) => setTimeout(r, 1500));
  await shot('05-profile.png');
  js(`go('settings')`);
  await new Promise((r) => setTimeout(r, 1500));
  await shot('04-settings.png');
  log('library', JSON.stringify(library.map((c) => ({ t: c.type, d: c.duration, s: c.size, title: c.title }))));
  quitting = true;
  app.quit();
}
