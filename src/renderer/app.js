'use strict';
/* Clipy UI · v1.0.1 */
const api = window.clipy;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const I = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/></svg>',
  shot: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  film: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5z" class="fill"/></svg>',
  rec: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5" class="fill"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  scissors: '<svg viewBox="0 0 24 24"><circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8 8.5L20 17M8 15.5L20 7"/></svg>',
  ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  vol: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" class="fill"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" class="fill"/><path d="M17 9.5l5 5M22 9.5l-5 5"/></svg>',
  pauseLine: '<svg viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg>',
  playLine: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" class="fill"/></svg>',
  discord: '<svg viewBox="0 0 24 24"><path d="M7.5 7.2c1.4-.6 2.9-.9 4.5-.9s3.1.3 4.5.9c1.5 2.2 2.2 4.6 2 7.3-1.3 1-2.6 1.6-4 2l-.9-1.5M9.4 15l-.9 1.5c-1.4-.4-2.7-1-4-2-.2-2.7.5-5.1 2-7.3"/><circle cx="9.6" cy="12" r="1.1" class="fill"/><circle cx="14.4" cy="12" r="1.1" class="fill"/></svg>',
  google: '<svg viewBox="0 0 24 24"><path d="M20.5 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h4.8a4.6 4.6 0 0 1-2 2.9v2.4h3.2c1.6-1.6 2.5-3.9 2.5-7z" class="fill"/><path d="M12 21c2.6 0 4.7-.9 6.3-2.3l-3.2-2.4c-.8.6-1.9 1-3.1 1-2.4 0-4.5-1.6-5.2-3.8H3.5v2.5A9 9 0 0 0 12 21z" class="fill"/><path d="M6.8 13.5a5.4 5.4 0 0 1 0-3.4V7.6H3.5a9 9 0 0 0 0 8.4z" class="fill"/><path d="M12 6.6c1.4 0 2.6.5 3.6 1.4l2.7-2.7A9 9 0 0 0 3.5 7.6l3.3 2.5C7.5 8.1 9.6 6.6 12 6.6z" class="fill"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  gif: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 10H8.5a1.5 1.5 0 0 0 0 3v0a1.5 1.5 0 0 0 1.5-1.5M12.5 9.5v5M15 14.5v-5h2.5M15 12h2"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  github: '<svg viewBox="0 0 24 24"><path class="fill" d="M12 2.5a9.5 9.5 0 0 0-3 18.5c.5.1.7-.2.7-.5v-1.7c-2.7.6-3.2-1.2-3.2-1.2-.4-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.1-.2-4.4-1.1-4.4-4.7 0-1 .4-1.9 1-2.6-.1-.2-.4-1.2.1-2.5 0 0 .8-.3 2.6 1a9 9 0 0 1 4.8 0c1.8-1.3 2.6-1 2.6-1 .5 1.3.2 2.3.1 2.5.6.7 1 1.6 1 2.6 0 3.7-2.3 4.5-4.4 4.7.3.3.6.9.6 1.8v2.6c0 .3.2.6.7.5A9.5 9.5 0 0 0 12 2.5z"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  dots: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6" class="fill"/><circle cx="12" cy="12" r="1.6" class="fill"/><circle cx="19" cy="12" r="1.6" class="fill"/></svg>',
};

let state = {};
let settings = {};
let profile = {};
let lib = [];
let view = 'library';
const ui = { filter: 'all', q: '', sort: 'new', game: '' };
let bufferSince = null;

// ───────────────────────────── format helpers
const pad = (n) => String(n).padStart(2, '0');
function fmtDur(s) {
  s = Math.max(0, s || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
function fmtPrecise(s) { return `${fmtDur(s)}.${Math.floor(((s || 0) % 1) * 10)}`; }
function fmtSize(b) {
  if (!b) return '0 MB';
  if (b > 1e9) return (b / 1e9).toFixed(2) + ' GB';
  return (b / 1e6).toFixed(b > 1e8 ? 0 : 1) + ' MB';
}
function fmtTime(ts) { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
function dayKey(ts) { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
function dayLabel(ts) {
  const d = new Date(ts), now = new Date();
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
const ENCODERS = { h264_nvenc: 'NVIDIA NVENC', h264_amf: 'AMD AMF', h264_qsv: 'Intel Quick Sync', libx264: 'CPU · x264' };
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Late night session' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
function initials(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  return p.length ? (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase() : '';
}
function avatarHTML(cls = '') {
  if (profile.avatarUrl) return `<span class="avatar ${cls}"><img src="${esc(profile.avatarUrl)}" alt=""></span>`;
  const ini = initials(profile.name);
  return `<span class="avatar ${cls}">${ini ? esc(ini) : I.user}</span>`;
}

// ───────────────────────────── snack
let snackT = null;
function snack(text, { busy = false, ms = 2600 } = {}) {
  const s = $('#snack');
  s.innerHTML = `${busy ? '<span class="spinner"></span>' : ''}<span>${esc(text)}</span>`;
  s.classList.add('show');
  clearTimeout(snackT);
  if (!busy) snackT = setTimeout(() => s.classList.remove('show'), ms);
}

// ───────────────────────────── share actions
async function shareDiscord(c) {
  if (!profile.discord) { snack('Connect Discord in your profile first'); go('profile'); return; }
  snack(c.size > (settings.discordLimitMB || 10) * 1e6 ? 'Compressing & uploading to Discord…' : 'Uploading to Discord…', { busy: true });
  const r = await api.discordSend(c.id);
  snack(r.ok ? `Sent to #${profile.discord.name}` : `Discord: ${r.error}`, { ms: 3500 });
}
async function copyClip(c) {
  snack('Copying…', { busy: true });
  const ok = await api.copy(c.id);
  snack(ok ? 'Copied — paste it anywhere with Ctrl+V' : 'Could not copy the file');
}
async function gmailClip(c) {
  snack('Opening Gmail…', { busy: true });
  await api.gmail(c.id);
  snack('Gmail opened — the file is on your clipboard, press Ctrl+V or attach it', { ms: 4500 });
}
async function gifClip(c, a, b) {
  snack('Rendering GIF…', { busy: true });
  const r = await api.gif(c.id, a, b);
  if (r && r.ok) { snack(`GIF ready (${fmtSize(r.size)}) and copied to clipboard`, { ms: 3500 }); api.revealFile(r.file); }
  else snack(`GIF failed: ${r ? r.error : ''}`);
}

let menuEl = null;
function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
function openMenu(anchor, items) {
  closeMenu();
  menuEl = el(`<div class="menu">${items.map((it, i) => it === '-' ? '<div class="menu-sep"></div>' :
    `<button data-i="${i}" ${it.disabled ? 'disabled' : ''}>${it.icon || ''}<span>${esc(it.label)}</span>${it.hint ? `<em>${esc(it.hint)}</em>` : ''}</button>`).join('')}</div>`);
  document.body.appendChild(menuEl);
  const r = anchor.getBoundingClientRect();
  const mw = menuEl.offsetWidth, mh = menuEl.offsetHeight;
  let left = Math.min(r.left, window.innerWidth - mw - 12);
  let top = r.bottom + 8;
  if (top + mh > window.innerHeight - 12) top = r.top - mh - 8;
  menuEl.style.left = `${Math.max(12, left)}px`;
  menuEl.style.top = `${top}px`;
  menuEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    const it = items[Number(b.dataset.i)];
    closeMenu();
    it.run();
  });
  setTimeout(() => document.addEventListener('pointerdown', function off(e) {
    if (menuEl && !menuEl.contains(e.target)) { closeMenu(); document.removeEventListener('pointerdown', off); }
  }), 0);
}
function shareItems(c, getRange) {
  const isClip = c.type === 'clip';
  return [
    { icon: I.discord, label: profile.discord ? `Send to #${profile.discord.name}` : 'Send to Discord', hint: profile.discord ? '' : 'connect', run: () => shareDiscord(c) },
    { icon: I.copy, label: 'Copy file', hint: 'Ctrl+C', run: () => copyClip(c) },
    { icon: I.mail, label: 'Email with Gmail', run: () => gmailClip(c) },
    ...(isClip ? [{ icon: I.gif, label: 'Export as GIF', hint: '≤ 15s', run: () => { const r = getRange ? getRange() : [0, c.duration]; gifClip(c, r[0], r[1]); } }] : []),
    '-',
    { icon: I.folder, label: 'Show in folder', run: () => api.reveal(c.id) },
    { icon: I.ext, label: 'Open externally', run: () => api.open(c.id) },
  ];
}

// ───────────────────────────── sidebar
function renderChip() {
  const name = profile.name || 'Guest';
  $('#chipAvatar').outerHTML = avatarHTML('sm" id="chipAvatar');
  $('#chipName').textContent = name;
  $('#chipSub').textContent = profile.account ? profile.account.email : profile.google ? profile.google.email
    : profile.discordUser ? `@${profile.discordUser.username}` : profile.name ? 'Local profile' : 'Set up your profile';
  const links = (profile.account ? 1 : 0) + (profile.google ? 1 : 0) + (profile.discordUser || profile.discord ? 1 : 0);
  $('#navLinks').textContent = links ? `${links} linked` : '';
}
function renderStatus() {
  const card = $('#statusCard');
  const on = !!state.recording;
  const err = settings.bufferEnabled && state.recError;
  card.classList.toggle('on', on);
  card.classList.toggle('err', !!err);
  $('#statusLabel').textContent = on ? (state.saving ? 'Saving…' : 'Replay on') : settings.bufferEnabled ? (err ? 'Error' : 'Starting…') : 'Paused';
  if (on && !bufferSince) bufferSince = Date.now();
  if (!on) bufferSince = null;
  $('#sideKey').textContent = settings.clipHotkey || '—';
  const clipBtn = $('#sideClip');
  clipBtn.disabled = !on || state.saving;
  clipBtn.firstElementChild.textContent = state.saving ? 'Saving…' : 'Clip';
  $('#sideToggle').innerHTML = settings.bufferEnabled ? I.pauseLine : I.playLine;
  $('#sideToggle').title = settings.bufferEnabled ? 'Pause replay' : 'Start replay';
  const ub = $('#updateBadge');
  ub.classList.toggle('hidden', !state.update);
  if (state.update) $('#updateVer').textContent = `v${state.update.version} · click to download`;
  tickMeter();
  const hb = $('#heroClip');
  if (hb) hb.disabled = !on || state.saving;
  const hs = $('#heroShot');
  if (hs) hs.disabled = !on;
  $$('.card').forEach((n) => n.classList.toggle('busy', (state.busy || []).includes(n.dataset.id)));
}
function tickMeter() {
  const len = settings.clipLength || 30;
  const meta = $('#statusMeta');
  if (state.recording && bufferSince) {
    const filled = Math.min(len, (Date.now() - bufferSince) / 1000);
    $('#meterFill').style.width = `${(filled / len) * 100}%`;
    const inf = state.recInfo || {};
    meta.innerHTML = `${filled >= len ? `${len}s ready` : `${Math.floor(filled)}s / ${len}s`} · ${inf.height || '?'}p${inf.fps || ''}<br>${inf.audio ? (inf.mic ? 'Audio + Mic' : 'System audio') : 'No audio'} · ${esc(inf.codec || '')}`;
  } else {
    $('#meterFill').style.width = '0%';
    meta.textContent = settings.bufferEnabled ? (state.recError || 'Connecting to screen…') : 'Press ▶ to start the buffer';
  }
}
setInterval(tickMeter, 1000);

// ───────────────────────────── navigation
function go(v) {
  view = v;
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  $('#profileChip').classList.toggle('active', v === 'profile');
  closeModal();
  closeMenu();
  renderSelBar();
  if (v === 'library') renderLibrary();
  else if (v === 'profile') renderProfile();
  else if (v === 'friends') renderFriends();
  else renderSettings();
  $('#view').scrollTop = 0;
}

// ───────────────────────────── library
function games() {
  const m = new Map();
  lib.forEach((c) => { if (c.game) m.set(c.game, (m.get(c.game) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
function filtered() {
  const q = ui.q.trim().toLowerCase();
  const list = lib.filter((c) => {
    if (ui.filter === 'clip' && c.type !== 'clip') return false;
    if (ui.filter === 'shot' && c.type !== 'shot') return false;
    if (ui.filter === 'fav' && !c.favorite) return false;
    if (ui.game && c.game !== ui.game) return false;
    if (q && !(`${c.title} ${c.game || ''}`.toLowerCase().includes(q))) return false;
    return true;
  });
  const by = {
    new: (a, b) => b.createdAt - a.createdAt,
    old: (a, b) => a.createdAt - b.createdAt,
    long: (a, b) => b.duration - a.duration,
    big: (a, b) => b.size - a.size,
  }[ui.sort];
  return list.sort(by);
}

function renderLibrary() {
  const clips = lib.filter((c) => c.type === 'clip');
  const shots = lib.filter((c) => c.type === 'shot');
  const dur = clips.reduce((a, c) => a + (c.duration || 0), 0);
  const size = lib.reduce((a, c) => a + (c.size || 0), 0);
  const today = clips.filter((c) => dayKey(c.createdAt) === dayKey(Date.now())).length;
  const gl = games();
  const chip = (k, label, n) => `<button class="chip ${ui.filter === k ? 'active' : ''}" data-filter="${k}">${label}${n != null ? ` <span>${n}</span>` : ''}</button>`;
  const latest = [...clips].sort((a, b) => b.createdAt - a.createdAt)[0];
  $('#view').innerHTML = `
  <div class="page">
    <section class="hero">
      <div>
        <div class="eyebrow">${esc(greeting())}${profile.name ? `, ${esc(profile.name)}` : ''}</div>
        <h1>Your moments<span class="ghost">.</span></h1>
      </div>
      <div class="hero-actions">
        <button class="btn" id="openDir">${I.folder}Folder</button>
        <button class="btn" id="heroShot">${I.shot}Screenshot <kbd>${esc(settings.screenshotHotkey || '—')}</kbd></button>
        <button class="btn" id="heroLong" title="Save the last ${fmtDur(settings.longClipLength)}">${fmtDur(settings.longClipLength)} <kbd>${esc(settings.longClipHotkey || '—')}</kbd></button>
        <button class="btn primary" id="heroClip">${I.rec}Save clip <kbd>${esc(settings.clipHotkey || '—')}</kbd></button>
      </div>
    </section>
    ${latest ? featureHTML(latest) : ''}
    <div class="stats">
      <div class="stat"><b>${clips.length}</b><span>Clips</span><i>${today ? `+${today} today` : ''}</i></div>
      <div class="stat"><b>${shots.length}</b><span>Screenshots</span></div>
      <div class="stat"><b>${fmtDur(dur)}</b><span>Total length</span></div>
      <div class="stat"><b>${fmtSize(size)}</b><span>Storage</span><i>${settings.maxStorageGB ? `limit ${settings.maxStorageGB} GB` : ''}</i></div>
    </div>
    <div class="toolbar">
      <div class="chips">
        ${chip('all', 'All')}${chip('clip', 'Clips', clips.length)}${chip('shot', 'Screenshots', shots.length)}${chip('fav', 'Favorites', lib.filter((c) => c.favorite).length)}
      </div>
      <label class="search">${I.search}<input id="q" placeholder="Search by game or title…  (Ctrl+F)" spellcheck="false"></label>
      ${gl.length ? `<div class="select"><select id="gameSel"><option value="">All games</option>${gl.map(([g, n]) => `<option value="${esc(g)}">${esc(g)} (${n})</option>`).join('')}</select></div>` : ''}
      <div class="select"><select id="sort">
        <option value="new">Newest first</option><option value="old">Oldest first</option>
        <option value="long">Longest first</option><option value="big">Largest first</option>
      </select></div>
    </div>
    <div id="groups"></div>
  </div>`;
  $('#q').value = ui.q;
  $('#sort').value = ui.sort;
  $('#q').addEventListener('input', (e) => { ui.q = e.target.value; renderGroups(); });
  $('#sort').addEventListener('change', (e) => { ui.sort = e.target.value; renderGroups(); });
  if ($('#gameSel')) {
    if (!gl.some(([g]) => g === ui.game)) ui.game = '';
    $('#gameSel').value = ui.game;
    $('#gameSel').addEventListener('change', (e) => { ui.game = e.target.value; renderGroups(); });
  }
  $$('.chip').forEach((b) => b.addEventListener('click', () => {
    ui.filter = b.dataset.filter;
    $$('.chip').forEach((x) => x.classList.toggle('active', x === b));
    renderGroups();
  }));
  $('#openDir').addEventListener('click', () => api.openDir());
  $('#heroClip').addEventListener('click', () => api.saveClip());
  $('#heroLong').addEventListener('click', () => api.saveClip(settings.longClipLength));
  $('#heroShot').addEventListener('click', () => api.screenshot());
  if (latest) bindFeature(latest);
  renderStatus();
  renderGroups();
}

function featureHTML(c) {
  return `
  <section class="feature" id="feature">
    <div class="feature-media">
      ${c.thumbUrl ? `<img src="${esc(c.thumbUrl)}" alt="">` : ''}
      <video muted loop playsinline preload="none"></video>
      <span class="feature-live"><i></i>Latest</span>
    </div>
    <div class="feature-info">
      <div class="eyebrow">Latest clip · ${esc(ago(c.createdAt))}</div>
      <h2>${esc(c.title)}</h2>
      <div class="feature-meta">
        <span>${fmtDur(c.duration)}</span><i>/</i><span>${fmtSize(c.size)}</span>${c.game && c.game !== c.title ? `<i>/</i><span>${esc(c.game)}</span>` : ''}
        ${c.sharedDiscord ? `<i>/</i><span class="shared">${I.check}Shared</span>` : ''}
      </div>
      <div class="feature-actions">
        <button class="btn primary" data-fa="play">${I.play}Watch</button>
        <button class="btn" data-fa="discord">${I.discord}Discord</button>
        <button class="btn icon-only" data-fa="copy" title="Copy file">${I.copy}</button>
        <button class="btn icon-only" data-fa="more" title="More">${I.dots}</button>
      </div>
    </div>
  </section>`;
}
function bindFeature(c) {
  const f = $('#feature');
  const v = $('video', f);
  const media = $('.feature-media', f);
  let started = false;
  media.addEventListener('mouseenter', () => {
    if (!started) { v.src = c.url; started = true; v.addEventListener('loadedmetadata', () => { try { v.currentTime = Math.min(2, v.duration / 3); } catch {} }, { once: true }); }
    v.play().then(() => f.classList.add('playing')).catch(() => {});
  });
  media.addEventListener('mouseleave', () => { v.pause(); f.classList.remove('playing'); });
  media.addEventListener('click', () => openPlayer(c.id));
  f.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fa]');
    if (!b) return;
    const a = b.dataset.fa;
    if (a === 'play') openPlayer(c.id);
    if (a === 'discord') shareDiscord(c);
    if (a === 'copy') copyClip(c);
    if (a === 'more') openMenu(b, shareItems(c));
  });
}

function renderGroups() {
  const box = $('#groups');
  if (!box) return;
  box.innerHTML = '';
  if (!lib.length) {
    box.appendChild(el(`
      <div class="empty">
        <div class="big-key">${esc(settings.clipHotkey || 'F8')}</div>
        <h2>No clips yet</h2>
        <p>Start a game and press <b>${esc(settings.clipHotkey || 'F8')}</b> when something epic happens.
        Clipy automatically saves the last <b>${settings.clipLength}s</b> – sound included.</p>
      </div>`));
    return;
  }
  const list = filtered();
  if (!list.length) {
    box.appendChild(el(`<div class="empty" style="padding:50px"><h2>Nothing found</h2><p>No matches for this filter.</p></div>`));
    return;
  }
  const groups = [];
  if (ui.sort === 'new' || ui.sort === 'old') {
    for (const c of list) {
      const k = dayKey(c.createdAt);
      let g = groups[groups.length - 1];
      if (!g || g.key !== k) groups.push(g = { key: k, label: dayLabel(c.createdAt), items: [] });
      g.items.push(c);
    }
  } else {
    groups.push({ key: 'all', label: ui.sort === 'long' ? 'By length' : 'By size', items: list });
  }
  for (const g of groups) {
    const total = g.items.reduce((a, c) => a + (c.duration || 0), 0);
    const sec = el(`<section class="group"><div class="group-head"><h3>${esc(g.label)}</h3><span>${g.items.length} ${g.items.length === 1 ? 'item' : 'items'}${total ? ` · ${fmtDur(total)}` : ''}</span></div><div class="grid"></div></section>`);
    const grid = $('.grid', sec);
    g.items.forEach((c, i) => { const n = card(c); n.style.animationDelay = `${Math.min(i, 12) * 30}ms`; grid.appendChild(n); });
    box.appendChild(sec);
  }
  renderStatus();
}

function card(c) {
  const node = el(`
    <article class="card" tabindex="0" draggable="true" data-id="${c.id}">
      <div class="thumb">
        ${c.thumbUrl ? `<img src="${esc(c.thumbUrl)}" alt="" loading="lazy">` : '<div class="noimg">no preview</div>'}
        <div class="play-ring"><div>${c.type === 'shot' ? '<svg viewBox="0 0 24 24" style="margin:0"><circle cx="12" cy="12" r="5"/></svg>' : I.play}</div></div>
        <button class="fav-btn ${c.favorite ? 'on' : ''}" title="Favorite">${I.star}</button>
        <div class="quick">
          <button data-q="discord" title="Send to Discord">${I.discord}</button>
          <button data-q="copy" title="Copy file">${I.copy}</button>
          <button data-q="more" title="More">${I.dots}</button>
        </div>
        <span class="badge-type">${c.type === 'shot' ? I.shot : I.film}</span>
        ${c.type === 'clip' ? `<span class="badge-dur">${fmtDur(c.duration)}</span>` : ''}
        <div class="busy-veil"><span class="spinner"></span></div>
        <span class="sel-check">${I.check}</span>
        <i class="scrub"></i>
        ${c.kind ? `<span class="badge-kind">${esc({ montage: 'Montage', vertical: '9:16', square: '1:1', original: 'Edit' }[c.kind] || c.kind)}</span>` : ''}
      </div>
      <div class="card-meta">
        <div class="card-title">${esc(c.title)}${c.sharedDiscord ? `<span class="shared-dot" title="Shared to Discord">${I.discord}</span>` : ''}</div>
        <div class="card-sub"><span>${fmtTime(c.createdAt)}</span><i>/</i><span>${fmtSize(c.size)}</span>${c.type === 'shot' && c.width ? `<i>/</i><span>${c.width}×${c.height}</span>` : ''}${c.game && c.game !== c.title ? `<i>/</i><span class="g">${esc(c.game)}</span>` : ''}</div>
      </div>
    </article>`);
  if (sel.has(c.id)) node.classList.add('selected');
  node.addEventListener('click', (e) => {
    if (e.ctrlKey || e.shiftKey || sel.size) { e.preventDefault(); toggleSelect(c.id, e.shiftKey); return; }
    openPlayer(c.id);
  });
  node.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') openPlayer(c.id);
    if (e.key.toLowerCase() === 'c' && e.ctrlKey) copyClip(c);
    if (e.key === 'Delete') confirmDelete(c);
  });
  $('.fav-btn', node).addEventListener('click', async (e) => {
    e.stopPropagation();
    c.favorite = await api.favorite(c.id);
    e.currentTarget.classList.toggle('on', c.favorite);
    if (ui.filter === 'fav') renderGroups();
  });
  $('.quick', node).addEventListener('click', (e) => {
    e.stopPropagation();
    const b = e.target.closest('[data-q]');
    if (!b) return;
    if (b.dataset.q === 'discord') shareDiscord(c);
    if (b.dataset.q === 'copy') copyClip(c);
    if (b.dataset.q === 'more') openMenu(b, [...shareItems(c), '-', { icon: I.trash, label: 'Delete', run: () => confirmDelete(c) }]);
  });
  node.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const fake = { getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) };
    openMenu(fake, [{ icon: I.play, label: 'Open', run: () => openPlayer(c.id) }, ...shareItems(c), '-', { icon: I.trash, label: 'Delete', run: () => confirmDelete(c) }]);
  });
  node.addEventListener('dragstart', (e) => { e.preventDefault(); api.drag(c.id); });

  if (c.type === 'clip' && c.url) {
    let t = null, v = null;
    node.addEventListener('mouseenter', () => {
      t = setTimeout(() => {
        v = document.createElement('video');
        v.muted = true; v.loop = true; v.playsInline = true;
        v.src = c.url;
        v.addEventListener('playing', () => { v.classList.add('on'); node.classList.add('previewing'); }, { once: true });
        v.addEventListener('loadedmetadata', () => { try { v.currentTime = Math.min(2, v.duration / 3); } catch {} }, { once: true });
        $('.thumb', node).insertBefore(v, $('.play-ring', node));
        v.play().catch(() => {});
      }, 380);
    });
    node.addEventListener('mouseleave', () => {
      clearTimeout(t);
      node.classList.remove('previewing', 'scrubbing');
      if (v) { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); v = null; }
    });
    // hover scrubbing: move the mouse across the thumbnail to seek through the clip
    const thumb = $('.thumb', node);
    let lastX = null;
    thumb.addEventListener('mousemove', (e) => {
      if (!v || !isFinite(v.duration) || !v.duration) return;
      if (lastX === null) { lastX = e.clientX; return; }
      if (Math.abs(e.clientX - lastX) < 3 && !node.classList.contains('scrubbing')) return;
      lastX = e.clientX;
      const r = thumb.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      node.classList.add('scrubbing');
      v.pause();
      v.currentTime = ratio * v.duration;
      $('.scrub', node).style.left = `${ratio * 100}%`;
    });
    thumb.addEventListener('mouseleave', () => { lastX = null; });
  }
  return node;
}

// ───────────────────────────── multi-select + bulk actions
const sel = new Set();
let lastSel = null;
function toggleSelect(id, range) {
  if (range && lastSel) {
    const list = filtered().map((c) => c.id);
    const [i, j] = [list.indexOf(lastSel), list.indexOf(id)].sort((x, y) => x - y);
    if (i >= 0 && j >= 0) list.slice(i, j + 1).forEach((x) => sel.add(x));
  } else if (sel.has(id)) sel.delete(id); else sel.add(id);
  lastSel = id;
  $$('.card').forEach((n) => n.classList.toggle('selected', sel.has(n.dataset.id)));
  renderSelBar();
}
function clearSelection() { sel.clear(); lastSel = null; $$('.card.selected').forEach((n) => n.classList.remove('selected')); renderSelBar(); }
function renderSelBar() {
  let bar = $('#selBar');
  if (!sel.size || view !== 'library') { if (bar) bar.remove(); return; }
  if (!bar) { bar = el('<div class="sel-bar" id="selBar"></div>'); document.body.appendChild(bar); }
  const items = lib.filter((c) => sel.has(c.id));
  const clips = items.filter((c) => c.type === 'clip');
  const dur = clips.reduce((s, c) => s + (c.duration || 0), 0);
  bar.innerHTML = `
    <div class="sb-count"><span><b>${sel.size}</b> selected</span><small>${clips.length ? fmtDur(dur) : ''}</small></div>
    <button class="btn primary" data-sb="montage" ${clips.length < 2 ? 'disabled' : ''}>${I.film}Make montage</button>
    <button class="btn" data-sb="fav">${I.star}Favorite</button>
    <button class="btn" data-sb="all">Select all</button>
    <button class="btn danger" data-sb="del">${I.trash}Delete</button>
    <button class="x-btn" data-sb="clear" title="Clear (Esc)">${I.x}</button>`;
  bar.onclick = async (e) => {
    const b = e.target.closest('[data-sb]'); if (!b) return;
    const a = b.dataset.sb;
    if (a === 'clear') clearSelection();
    if (a === 'all') { filtered().forEach((c) => sel.add(c.id)); $$('.card').forEach((n) => n.classList.toggle('selected', sel.has(n.dataset.id))); renderSelBar(); }
    if (a === 'fav') { await api.bulk('favorite', [...sel]); lib = await api.library(); snack(`${sel.size} added to favorites`); clearSelection(); renderGroups(); }
    if (a === 'montage') montageDialog(clips);
    if (a === 'del') dialog({
      title: `Delete ${sel.size} item${sel.size === 1 ? '' : 's'}?`, body: '<p>The files are moved to the Recycle Bin and removed from your library.</p>',
      actions: [{ label: 'Cancel' }, { label: 'Delete', primary: true, icon: I.trash, run: async () => {
        const n = sel.size; await api.bulk('delete', [...sel]); clearSelection(); lib = await api.library();
        $('#navCount').textContent = lib.length; renderLibrary(); snack(`${n} moved to Recycle Bin`);
      } }],
    });
  };
}

const TRANSITIONS = [['fade', 'Fade'], ['fadeblack', 'Black'], ['dissolve', 'Dissolve'], ['slideleft', 'Slide'], ['circleopen', 'Circle'], ['none', 'Cut']];
function montageDialog(clips) {
  let order = [...clips].sort((a, b) => a.createdAt - b.createdAt);
  let transition = 'fade';
  const listHTML = () => order.map((c, i) => `
    <div class="mt-row" data-i="${i}">
      <span class="mt-n">${i + 1}</span>
      ${c.thumbUrl ? `<img src="${esc(c.thumbUrl)}" alt="">` : '<span class="mt-ph"></span>'}
      <div><b>${esc(c.title)}</b><small>${fmtDur(c.duration)}</small></div>
      <button class="x-btn sm" data-mv="-1" ${i === 0 ? 'disabled' : ''} title="Move up"><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button>
      <button class="x-btn sm" data-mv="1" ${i === order.length - 1 ? 'disabled' : ''} title="Move down"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
    </div>`).join('');
  const total = () => order.reduce((s, c) => s + c.duration, 0) - (transition === 'none' ? 0 : 0.6 * (order.length - 1));
  dialog({
    wide: true,
    title: `${I.film} Make a montage`,
    body: `
      <p>Clips are joined in this order. Drag-free: use the arrows to reorder.</p>
      <div class="mt-list" id="mtList">${listHTML()}</div>
      <div class="field"><span>Transition</span><div class="seg" id="mtTrans">${TRANSITIONS.map(([v, l]) => `<button data-v="${v}" class="${v === transition ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="mt-total" id="mtTotal">Total ≈ <b>${fmtDur(total())}</b></div>`,
    actions: [
      { label: 'Cancel' },
      { label: 'Create montage', primary: true, icon: I.film, run: async (box, btn) => {
        btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Rendering…';
        snack(`Rendering montage of ${order.length} clips…`, { busy: true });
        const r = await api.montage(order.map((c) => c.id), { transition });
        if (!r.ok) { snack(`Montage failed: ${r.error}`, { ms: 5000 }); btn.disabled = false; btn.innerHTML = `${I.film}Create montage`; return true; }
        snack('Montage ready!'); clearSelection();
        lib = await api.library(); $('#navCount').textContent = lib.length; renderLibrary(); openPlayer(r.id);
      } },
    ],
    onMount: (box) => {
      $('#mtList', box).addEventListener('click', (e) => {
        const b = e.target.closest('[data-mv]'); if (!b) return;
        const i = Number(b.closest('.mt-row').dataset.i), d = Number(b.dataset.mv);
        [order[i], order[i + d]] = [order[i + d], order[i]];
        $('#mtList', box).innerHTML = listHTML();
      });
      $('#mtTrans', box).addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        transition = b.dataset.v;
        $$('#mtTrans button', box).forEach((x) => x.classList.toggle('on', x === b));
        $('#mtTotal', box).innerHTML = `Total ≈ <b>${fmtDur(total())}</b>`;
      });
    },
  });
}

function exportDialog(c, range) {
  let format = 'vertical', speed = 1;
  const [a, b] = range || [0, c.duration];
  const len = () => (b - a) / speed;
  const FORMATS = [['vertical', '9:16', 'TikTok · Shorts · Reels'], ['square', '1:1', 'Instagram · X'], ['original', '16:9', 'Original']];
  dialog({
    wide: true,
    title: `${I.share} Export for social`,
    body: `
      <div class="fmt-grid" id="fmtGrid">${FORMATS.map(([v, r, d]) => `
        <button class="fmt ${v === format ? 'on' : ''}" data-v="${v}"><span class="fmt-shape ${v}"></span><b>${r}</b><small>${d}</small></button>`).join('')}</div>
      <div class="field"><span>Speed</span><div class="seg" id="spSeg">${[[0.25, '0.25×'], [0.5, '0.5× slow-mo'], [1, '1×'], [1.5, '1.5×'], [2, '2×']].map(([v, l]) => `<button data-v="${v}" class="${v === speed ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="mt-total" id="exInfo"></div>`,
    actions: [
      { label: 'Cancel' },
      { label: 'Export', primary: true, icon: I.share, run: async (box, btn) => {
        btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Exporting…';
        snack('Exporting…', { busy: true });
        const r = await api.exportClip(c.id, { format, speed, a, b });
        if (!r.ok) { snack(`Export failed: ${r.error}`, { ms: 5000 }); btn.disabled = false; btn.innerHTML = `${I.share}Export`; return true; }
        snack('Export ready — added to your library');
        lib = await api.library(); $('#navCount').textContent = lib.length; openPlayer(r.id);
      } },
    ],
    onMount: (box) => {
      const info = () => { $('#exInfo', box).innerHTML = `Range <b>${fmtDur(a)}–${fmtDur(b)}</b> · result <b>${fmtPrecise(len())}</b>`; };
      info();
      $('#fmtGrid', box).addEventListener('click', (e) => { const t = e.target.closest('.fmt'); if (!t) return; format = t.dataset.v; $$('.fmt', box).forEach((x) => x.classList.toggle('on', x === t)); });
      $('#spSeg', box).addEventListener('click', (e) => { const t = e.target.closest('button'); if (!t) return; speed = Number(t.dataset.v); $$('#spSeg button', box).forEach((x) => x.classList.toggle('on', x === t)); info(); });
    },
  });
}

function shortcutsDialog() {
  const rows = [
    ['Global', [[settings.clipHotkey, 'Save clip'], [settings.longClipHotkey, `Save long clip (${fmtDur(settings.longClipLength)})`], [settings.screenshotHotkey, 'Screenshot']]],
    ['Library', [['Ctrl+F', 'Search'], ['Ctrl+Click', 'Select clips'], ['Shift+Click', 'Select a range'], ['Esc', 'Clear selection'], ['Ctrl+C', 'Copy clip'], ['Del', 'Delete']]],
    ['Player', [['Space', 'Play / pause'], ['← →', '±5 s (Shift ±1 s)'], [', .', 'Frame by frame'], ['↑ ↓', 'Previous / next'], ['I  O', 'Trim start / end'], ['H', 'Find highlight'], ['E', 'Export for social'], ['S', 'Speed'], ['F', 'Fullscreen'], ['M', 'Mute']]],
  ];
  dialog({
    wide: true, title: 'Keyboard shortcuts',
    body: `<div class="kb-grid">${rows.map(([h, list]) => `<div><div class="eyebrow">${h}</div>${list.map(([k, d]) => `<div class="kb-row"><kbd>${esc(k || '—')}</kbd><span>${esc(d)}</span></div>`).join('')}</div>`).join('')}</div>`,
    actions: [{ label: 'Close', primary: true }],
  });
}

async function reloadLibrary() {
  lib = await api.library();
  $('#navCount').textContent = lib.length;
  if ($('#modal').classList.contains('hidden')) {
    if (view === 'library') renderLibrary();
    else if (view === 'profile') renderProfile();
  }
}

// ───────────────────────────── player
let player = null;
function closeModal() {
  const m = $('#modal');
  if (player) { player.cleanup(); player = null; }
  m.classList.add('hidden');
  m.innerHTML = '';
}

function openPlayer(id) {
  const c = lib.find((x) => x.id === id);
  if (!c) return;
  closeMenu();
  const m = $('#modal');
  const isClip = c.type === 'clip';
  const idx = filtered().findIndex((x) => x.id === id);
  m.innerHTML = `
  <div class="player">
    <div class="player-head">
      <input class="title-input" id="pTitle" spellcheck="false" maxlength="80">
      <span class="player-meta">${new Date(c.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} · ${fmtSize(c.size)}${c.game && c.game !== c.title ? ` · ${esc(c.game)}` : ''}</span>
      <button class="x-btn" id="pPrev" title="Previous (↑)"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
      <button class="x-btn" id="pNext" title="Next (↓)"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
      <button class="x-btn" id="pClose" title="Close (Esc)">${I.x}</button>
    </div>
    <div class="stage ${isClip ? 'paused' : ''}" id="stage">
      ${isClip ? `<video id="pVideo" src="${esc(c.url)}" preload="auto"></video><div class="center-play"><div>${I.play}</div></div>` : `<img src="${esc(c.url)}" alt="">`}
    </div>
    ${isClip ? `
    <div class="controls">
      <button class="ctrl-btn" id="pPlay" title="Play (Space)">${I.play}</button>
      <div class="time" id="pTime"><b>0:00</b> / 0:00</div>
      <div class="timeline" id="tl">
        <div class="tl-track"><div class="tl-ticks"></div></div>
        <div class="tl-shade" id="shadeL"></div><div class="tl-shade" id="shadeR"></div>
        <div class="tl-sel" id="sel"></div>
        <div class="tl-handle" id="hA" title="Start (I)"></div>
        <div class="tl-handle" id="hB" title="End (O)"></div>
        <div class="tl-head" id="head"></div>
      </div>
      <div class="trim-info" id="trimInfo"></div>
      <button class="ctrl-btn speed" id="pSpeed" title="Speed (S)">1×</button>
      <button class="ctrl-btn stroke" id="pMute" title="Sound (M)">${I.vol}</button>
      <button class="ctrl-btn stroke" id="pFull" title="Fullscreen (F)">${I.full}</button>
    </div>
    <div class="moments hidden" id="moments"></div>` : ''}
    <div class="player-actions">
      <button class="btn ${c.favorite ? 'on' : ''}" id="pFav">${I.star}${c.favorite ? 'Favorite' : 'Add to favorites'}</button>
      ${isClip ? `<button class="btn" id="pTrim" disabled>${I.scissors}Save selection</button>
      <button class="btn" id="pHigh" title="Find the loudest moments (H)"><svg viewBox="0 0 24 24"><path d="M13 3L5 14h6l-1 7 8-11h-6z"/></svg>Highlight</button>
      <button class="btn" id="pExport" title="Export for TikTok, Shorts, Reels (E)">${I.share}Export</button>` : ''}
      <button class="btn" id="pDiscord">${I.discord}Discord</button>
      <button class="btn" id="pShare">${I.share}Share</button>
      <span class="grow"></span>
      <span class="kbd-hint">${isClip ? '<kbd>I</kbd><kbd>O</kbd> trim · <kbd>H</kbd> highlight · <kbd>?</kbd> all keys' : ''}</span>
      <button class="btn danger" id="pDel">${I.trash}Delete</button>
    </div>
  </div>`;
  m.classList.remove('hidden');
  const title = $('#pTitle');
  title.value = c.title;
  const commitTitle = async () => {
    const v = title.value.trim();
    if (v && v !== c.title) { c.title = v; await api.rename(c.id, v); snack('Renamed'); }
    else title.value = c.title;
  };
  title.addEventListener('blur', commitTitle);
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') title.blur(); if (e.key === 'Escape') { title.value = c.title; title.blur(); } e.stopPropagation(); });

  const close = () => { closeModal(); renderCurrent(); };
  const step = (d) => { const list = filtered(); const n = list[idx + d]; if (n) openPlayer(n.id); };
  $('#pClose').addEventListener('click', close);
  $('#pPrev').disabled = idx <= 0;
  $('#pNext').disabled = idx < 0 || idx >= filtered().length - 1;
  $('#pPrev').addEventListener('click', () => step(-1));
  $('#pNext').addEventListener('click', () => step(1));
  m.onclick = (e) => { if (e.target === m) close(); };
  $('#pFav').addEventListener('click', async (e) => {
    c.favorite = await api.favorite(c.id);
    e.currentTarget.classList.toggle('on', c.favorite);
    e.currentTarget.innerHTML = `${I.star}${c.favorite ? 'Favorite' : 'Add to favorites'}`;
  });
  $('#pDiscord').addEventListener('click', () => shareDiscord(c));
  $('#pDel').addEventListener('click', () => confirmDelete(c));

  const cleanups = [];
  player = { id: c.id, cleanup: () => cleanups.forEach((f) => f()) };

  if (!isClip) {
    $('#pShare').addEventListener('click', (e) => openMenu(e.currentTarget, shareItems(c)));
    const onKey = (e) => {
      if (document.activeElement === title) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowUp') step(-1);
      else if (e.key === 'ArrowDown') step(1);
    };
    window.addEventListener('keydown', onKey);
    cleanups.push(() => window.removeEventListener('keydown', onKey));
    return;
  }

  const v = $('#pVideo');
  const stage = $('#stage');
  const tl = $('#tl');
  let dur = c.duration || 1;
  let a = 0, b = dur;
  let raf = 0;
  $('#pShare').addEventListener('click', (e) => openMenu(e.currentTarget, shareItems(c, () => [a, b])));

  const pct = (t) => `${(t / dur) * 100}%`;
  function layout() {
    $('#hA').style.left = pct(a);
    $('#hB').style.left = pct(b);
    const sel = $('#sel'); sel.style.left = pct(a); sel.style.width = `${((b - a) / dur) * 100}%`;
    $('#shadeL').style.left = '0'; $('#shadeL').style.width = pct(a);
    $('#shadeR').style.left = pct(b); $('#shadeR').style.width = `${((dur - b) / dur) * 100}%`;
    const trimmed = a > 0.05 || b < dur - 0.05;
    $('#trimInfo').innerHTML = trimmed ? `Selection <b>${fmtPrecise(b - a)}</b>` : `<b>${fmtDur(dur)}</b>`;
    $('#pTrim').disabled = !trimmed;
  }
  function frame() {
    $('#head').style.left = pct(v.currentTime);
    $('#pTime').innerHTML = `<b>${fmtDur(v.currentTime)}</b> / ${fmtDur(dur)}`;
    if (!v.paused && v.currentTime >= b - 0.02) { v.currentTime = a; }
    raf = requestAnimationFrame(frame);
  }
  v.addEventListener('loadedmetadata', () => {
    if (isFinite(v.duration) && v.duration > 0) { dur = v.duration; if (b > dur || b === c.duration) b = dur; }
    layout();
    v.play().catch(() => {});
  });
  const syncPlay = () => {
    stage.classList.toggle('paused', v.paused);
    $('#pPlay').innerHTML = v.paused ? I.play : I.pause;
  };
  v.addEventListener('play', syncPlay);
  v.addEventListener('pause', syncPlay);
  const toggle = () => { if (v.paused) { if (v.currentTime >= b - 0.05 || v.currentTime < a) v.currentTime = a; v.play(); } else v.pause(); };
  v.addEventListener('click', toggle);
  $('#pPlay').addEventListener('click', toggle);
  $('#pMute').addEventListener('click', (e) => { v.muted = !v.muted; e.currentTarget.innerHTML = v.muted ? I.mute : I.vol; });
  $('#pFull').addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : stage.requestFullscreen()));
  const speeds = [1, 1.5, 2, 0.25, 0.5];
  $('#pSpeed').addEventListener('click', (e) => {
    const next = speeds[(speeds.indexOf(v.playbackRate) + 1) % speeds.length];
    v.playbackRate = next;
    e.currentTarget.textContent = `${next}×`;
    e.currentTarget.classList.toggle('on', next !== 1);
  });
  raf = requestAnimationFrame(frame);
  layout();

  const tAt = (clientX) => {
    const r = tl.getBoundingClientRect();
    return Math.max(0, Math.min(dur, ((clientX - r.left) / r.width) * dur));
  };
  let dragging = null;
  tl.addEventListener('pointerdown', (e) => {
    tl.setPointerCapture(e.pointerId);
    if (e.target.id === 'hA') dragging = 'a';
    else if (e.target.id === 'hB') dragging = 'b';
    else { dragging = 'seek'; v.currentTime = Math.max(a, Math.min(b, tAt(e.clientX))); }
  });
  tl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const t = tAt(e.clientX);
    if (dragging === 'a') { a = Math.min(t, b - 0.5); v.currentTime = a; layout(); }
    else if (dragging === 'b') { b = Math.max(t, a + 0.5); v.currentTime = Math.max(a, b - 0.6); layout(); }
    else v.currentTime = Math.max(a, Math.min(b, t));
  });
  const end = () => { dragging = null; };
  tl.addEventListener('pointerup', end);
  tl.addEventListener('pointercancel', end);

  $('#pExport').addEventListener('click', () => { v.pause(); exportDialog(c, [a, b]); });
  const findHighlights = async () => {
    const btn = $('#pHigh');
    if (btn.disabled) return;
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Analyzing…';
    const r = await api.highlights(c.id);
    btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M13 3L5 14h6l-1 7 8-11h-6z"/></svg>Highlight';
    if (!r.ok) { snack(r.error, { ms: 3500 }); return; }
    const box = $('#moments');
    if (!r.moments.length) { snack('No standout moment found'); return; }
    const pick = (m) => { a = m.a; b = m.b; layout(); v.currentTime = m.a; v.play().catch(() => {}); };
    box.innerHTML = `<span class="mo-label"><svg viewBox="0 0 24 24"><path d="M13 3L5 14h6l-1 7 8-11h-6z"/></svg>Highlights</span>${r.moments.map((m, i) => `
      <button class="mo" data-m="${i}"><b>${fmtDur(m.t)}</b><span>+${m.boost} LU louder</span></button>`).join('')}
      <span class="mo-hint">Selection set — save it or export it</span>`;
    box.classList.remove('hidden');
    box.querySelectorAll('[data-m]').forEach((x) => x.addEventListener('click', () => {
      box.querySelectorAll('.mo').forEach((y) => y.classList.toggle('on', y === x));
      pick(r.moments[Number(x.dataset.m)]);
    }));
    // pick the strongest moment right away
    const best = r.moments.reduce((p, m) => (m.boost > p.boost ? m : p), r.moments[0]);
    box.querySelectorAll('.mo')[r.moments.indexOf(best)].classList.add('on');
    pick(best);
    snack(`Best moment at ${fmtDur(best.t)} — selection set`);
  };
  $('#pHigh').addEventListener('click', findHighlights);

  $('#pTrim').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Saving…';
    v.pause();
    const r = await api.trim(c.id, a, b);
    if (r && r.ok) {
      snack('Trimmed clip saved');
      lib = await api.library();
      $('#navCount').textContent = lib.length;
      openPlayer(r.id);
    } else {
      snack('Trim failed');
      btn.disabled = false;
      btn.innerHTML = `${I.scissors}Save selection`;
    }
  });

  const onKey = (e) => {
    if (document.activeElement === title || document.querySelector('.confirm')) return;
    const k = e.key.toLowerCase();
    if (e.key === ' ') { e.preventDefault(); toggle(); }
    else if (e.key === 'Escape') { if (menuEl) closeMenu(); else if (!document.fullscreenElement) close(); }
    else if (e.key === 'ArrowLeft') v.currentTime = Math.max(0, v.currentTime - (e.shiftKey ? 1 : 5));
    else if (e.key === 'ArrowRight') v.currentTime = Math.min(dur, v.currentTime + (e.shiftKey ? 1 : 5));
    else if (e.key === 'ArrowUp') step(-1);
    else if (e.key === 'ArrowDown') step(1);
    else if (e.key === ',') { v.pause(); v.currentTime = Math.max(0, v.currentTime - 1 / 60); }
    else if (e.key === '.') { v.pause(); v.currentTime = Math.min(dur, v.currentTime + 1 / 60); }
    else if (k === 'i') { a = Math.min(v.currentTime, b - 0.5); layout(); }
    else if (k === 'o') { b = Math.max(v.currentTime, a + 0.5); layout(); }
    else if (k === 'f') $('#pFull').click();
    else if (k === 'm') $('#pMute').click();
    else if (k === 's') $('#pSpeed').click();
    else if (k === 'h') findHighlights();
    else if (k === 'e') { v.pause(); exportDialog(c, [a, b]); }
    else if (k === 'c' && e.ctrlKey) copyClip(c);
  };
  window.addEventListener('keydown', onKey);
  cleanups.push(() => {
    window.removeEventListener('keydown', onKey);
    cancelAnimationFrame(raf);
    v.pause(); v.removeAttribute('src'); v.load();
  });
}

function dialog({ title, body, actions, wide = false, onMount }) {
  const box = el(`
    <div class="modal dlg-wrap" style="z-index:60">
      <div class="confirm ${wide ? 'wide' : ''}">
        <h3>${title}</h3>
        <div class="dlg-body">${body}</div>
        <div class="row-btns">${actions.map((a, i) => `<button class="btn ${a.primary ? 'primary' : ''}" data-a="${i}">${a.icon || ''}${esc(a.label)}</button>`).join('')}</div>
      </div>
    </div>`);
  document.body.appendChild(box);
  const done = () => { box.remove(); window.removeEventListener('keydown', key, true); };
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(); } };
  window.addEventListener('keydown', key, true);
  box.addEventListener('click', async (e) => {
    if (e.target === box) return done();
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const act = actions[Number(b.dataset.a)];
    if (!act.run) return done();
    const keep = await act.run(box, b);
    if (keep !== true) done();
  });
  if (onMount) onMount(box);
  return { close: done, box };
}

function confirmDelete(c) {
  dialog({
    title: `Delete "${esc(c.title)}"?`,
    body: '<p>The file is moved to the Recycle Bin and removed from your library.</p>',
    actions: [
      { label: 'Cancel' },
      {
        label: 'Delete', primary: true, icon: I.trash, run: async () => {
          await api.remove(c.id);
          closeModal();
          lib = await api.library();
          $('#navCount').textContent = lib.length;
          renderCurrent();
          snack('Moved to Recycle Bin');
        },
      },
    ],
  });
}

function renderCurrent() {
  if (view === 'library') renderLibrary();
  else if (view === 'profile') renderProfile();
  else if (view === 'friends') renderFriends();
  else renderSettings();
}

// ───────────────────────────── profile
function googleSetupDialog(after) {
  dialog({
    wide: true,
    title: `${I.google} Set up Google sign-in`,
    body: `
      <p>Google sign-in needs your own free OAuth client ID. This takes about 5 minutes and only has to be done once.</p>
      <ol class="steps">
        <li>Open the <a href="#" id="gHelp">Google Cloud Console</a> and create a project (any name).</li>
        <li>Go to <b>APIs &amp; Services → OAuth consent screen</b>, choose <b>External</b>, fill in an app name and add yourself as a test user.</li>
        <li>Go to <b>Credentials → Create credentials → OAuth client ID</b> and pick <b>Desktop app</b>.</li>
        <li>Paste the client ID and client secret below.</li>
      </ol>
      <label class="field"><span>Client ID</span><input id="gId" spellcheck="false" placeholder="xxxxxxxx.apps.googleusercontent.com" value="${esc(settings.googleClientId || '')}"></label>
      <label class="field"><span>Client secret</span><input id="gSecret" type="password" spellcheck="false" placeholder="GOCSPX-…" value="${esc(settings.googleClientSecret || '')}"></label>`,
    actions: [
      { label: 'Cancel' },
      {
        label: 'Save & sign in', primary: true, icon: I.google, run: async (box) => {
          const id = $('#gId', box).value.trim();
          const secret = $('#gSecret', box).value.trim();
          if (!/\.apps\.googleusercontent\.com$/.test(id)) { snack('That client ID does not look right'); return true; }
          settings = await api.setSettings({ googleClientId: id, googleClientSecret: secret });
          profile = await api.profile();
          signInGoogle(after);
        },
      },
    ],
    onMount: (box) => $('#gHelp', box).addEventListener('click', (e) => { e.preventDefault(); api.googleHelp(); }),
  });
}
async function signInGoogle(after) {
  if (!profile.googleConfigured) return googleSetupDialog(after);
  snack('Continue in your browser…', { busy: true });
  const r = await api.googleSignIn();
  if (r.needsSetup) { $('#snack').classList.remove('show'); return googleSetupDialog(after); }
  profile = await api.profile();
  settings = await api.getSettings();
  renderChip();
  snack(r.ok ? (r.cloudError ? `Signed in, but Clipy Cloud failed: ${r.cloudError}` : `Signed in as ${profile.google.email}`) : `Google: ${r.error}`, { ms: 4500 });
  if (after) after(); else if (view === 'profile') renderProfile();
}

function discordSetupDialog(after) {
  dialog({
    wide: true,
    title: `${I.discord} Set up Discord sign-in`,
    body: `
      <p>Discord sign-in needs a free Discord application. One-time setup, about 3 minutes.</p>
      <ol class="steps">
        <li>Open the <a href="#" id="dHelp2">Discord Developer Portal</a> and click <b>New Application</b> (name it "Clipy").</li>
        <li>Open <b>OAuth2</b> in the left menu. Under <b>Redirects</b> add exactly:<br><code class="copyable" id="dRedir" title="Click to copy">${esc(profile.discordRedirect)}</code> and press <b>Save Changes</b>.</li>
        <li>On the same page copy the <b>Client ID</b>, then click <b>Reset Secret</b> and copy the <b>Client Secret</b>.</li>
        <li>Paste both below.</li>
      </ol>
      <label class="field"><span>Client ID</span><input id="dcId" spellcheck="false" placeholder="123456789012345678" value="${esc(settings.discordClientId || '')}"></label>
      <label class="field"><span>Client secret</span><input id="dcSecret" type="password" spellcheck="false" placeholder="••••••••" value="${esc(settings.discordClientSecret || '')}"></label>`,
    actions: [
      { label: 'Cancel' },
      {
        label: 'Save & sign in', primary: true, icon: I.discord, run: async (box) => {
          const id = $('#dcId', box).value.trim();
          const secret = $('#dcSecret', box).value.trim();
          if (!/^\d{15,22}$/.test(id)) { snack('The client ID is a long number'); return true; }
          if (secret.length < 20) { snack('Paste the client secret too'); return true; }
          settings = await api.setSettings({ discordClientId: id, discordClientSecret: secret });
          profile = await api.profile();
          signInDiscord(after);
        },
      },
    ],
    onMount: (box) => {
      $('#dHelp2', box).addEventListener('click', (e) => { e.preventDefault(); api.discordLoginHelp(); });
      $('#dRedir', box).addEventListener('click', () => { navigator.clipboard.writeText(profile.discordRedirect).then(() => snack('Redirect URL copied')); });
    },
  });
}
async function signInDiscord(after) {
  if (!profile.discordLoginConfigured) return discordSetupDialog(after);
  snack('Continue in your browser…', { busy: true });
  const r = await api.discordLogin();
  if (r.needsSetup) { $('#snack').classList.remove('show'); return discordSetupDialog(after); }
  profile = await api.profile();
  settings = await api.getSettings();
  renderChip();
  snack(r.ok ? (r.cloudError ? `Signed in, but Friends are not available: ${r.cloudError}` : `Signed in as @${profile.discordUser.username}`) : `Discord: ${r.error}`, { ms: 4500 });
  if (after) after(); else if (view === 'profile') renderProfile();
}

function passwordDialog() {
  dialog({
    title: 'Change password',
    body: `
      <label class="field"><span>Current password</span><input id="pwOld" type="password" autocomplete="current-password"></label>
      <label class="field"><span>New password</span><input id="pwNew" type="password" autocomplete="new-password" placeholder="8+ characters, letters & a number"></label>`,
    actions: [
      { label: 'Cancel' },
      {
        label: 'Save', primary: true, run: async (box) => {
          const r = await api.accountPassword({ current: $('#pwOld', box).value, next: $('#pwNew', box).value });
          snack(r.ok ? 'Password changed' : r.error);
          return r.ok ? undefined : true;
        },
      },
    ],
    onMount: (box) => $('#pwOld', box).focus(),
  });
}

function accountCardHTML(p) {
  if (p.account) {
    return `
      <div class="conn linked">
        <div class="conn-head">
          <span class="conn-logo">${I.mail}</span>
          <div><b>Clipy account</b><small>Signed in as <b>${esc(p.account.email)}</b></small></div>
          <span class="conn-state">Signed in</span>
        </div>
        <div class="conn-body">
          <div class="conn-row"><div><b>Member since</b><small>${new Date(p.account.created).toLocaleDateString('en-US', { dateStyle: 'long' })}</small></div></div>
          <div class="conn-actions"><button class="btn" id="aPw">Change password</button><button class="btn" id="aOut">Sign out</button></div>
        </div>
      </div>`;
  }
  return `
    <div class="conn">
      <div class="conn-head">
        <span class="conn-logo">${I.mail}</span>
        <div><b>Clipy account</b><small>Sign in with your email and a password</small></div>
        <span class="conn-state">Signed out</span>
      </div>
      <div class="conn-body">
        <div class="tabs" id="aTabs"><button data-t="in" class="on">Sign in</button><button data-t="up">Create account</button></div>
        <form class="auth-form" id="aForm" autocomplete="on">
          <input id="aName" class="hidden" placeholder="Name" maxlength="32" autocomplete="nickname">
          <input id="aEmail" type="email" placeholder="Email" autocomplete="email" spellcheck="false">
          <input id="aPass" type="password" placeholder="Password" autocomplete="current-password">
          <button class="btn primary" id="aSubmit" type="submit">Sign in${I.arrow}</button>
        </form>
        <small class="conn-help">${p.cloud && p.cloud.configured
          ? 'Online account — sign in on any PC and keep your friends. <a href="#" id="aForgot">Forgot password?</a>'
          : 'Your account and password stay on this PC (encrypted with scrypt).'}</small>
      </div>
    </div>`;
}
function bindAccountCard() {
  if ($('#aOut')) $('#aOut').addEventListener('click', async () => { profile = await api.accountLogout(); renderChip(); renderProfile(); snack('Signed out'); });
  if ($('#aPw')) $('#aPw').addEventListener('click', passwordDialog);
  if (!$('#aForm')) return;
  if ($('#aForgot')) $('#aForgot').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = $('#aEmail').value.trim();
    if (!email) { snack('Type your email first'); $('#aEmail').focus(); return; }
    const r = await api.accountReset(email);
    snack(r.ok ? `Reset link sent to ${email}` : r.error, { ms: 4000 });
  });
  let mode = 'in';
  $('#aTabs').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    mode = b.dataset.t;
    $$('#aTabs button').forEach((x) => x.classList.toggle('on', x === b));
    $('#aName').classList.toggle('hidden', mode !== 'up');
    $('#aPass').placeholder = mode === 'up' ? 'Password (8+ characters, letters & a number)' : 'Password';
    $('#aPass').autocomplete = mode === 'up' ? 'new-password' : 'current-password';
    $('#aSubmit').innerHTML = `${mode === 'up' ? 'Create account' : 'Sign in'}${I.arrow}`;
  });
  $('#aForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#aSubmit');
    btn.disabled = true;
    const data = { email: $('#aEmail').value, password: $('#aPass').value, name: $('#aName').value };
    const r = mode === 'up' ? await api.accountRegister(data) : await api.accountLogin(data);
    btn.disabled = false;
    if (!r.ok) { snack(r.error, { ms: 3500 }); return; }
    settings = await api.getSettings();
    profile = await api.profile();
    renderChip();
    renderProfile();
    snack(mode === 'up' ? 'Account created — welcome!' : `Welcome back${profile.name ? `, ${profile.name}` : ''}`);
  });
}

function profileStats() {
  const clips = lib.filter((c) => c.type === 'clip');
  const g = games().slice(0, 5);
  const max = g.length ? g[0][1] : 1;
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const k = dayKey(d.getTime());
    days.push({ d, n: lib.filter((c) => dayKey(c.createdAt) === k).length });
  }
  const dmax = Math.max(1, ...days.map((x) => x.n));
  let streak = 0;
  for (let i = days.length - 1; i >= 0 && days[i].n; i--) streak++;
  return { clips, g, max, days, dmax, streak };
}

async function renderProfile() {
  profile = await api.profile();
  settings = await api.getSettings();
  renderChip();
  const st = profileStats();
  const hours = st.clips.reduce((a, c) => a + (c.duration || 0), 0);
  const shared = lib.filter((c) => c.sharedDiscord).length;
  const p = profile;
  $('#view').innerHTML = `
  <div class="page">
    <section class="profile-hero">
      <button class="avatar-edit" id="avEdit" title="Change picture">${avatarHTML('xl')}<span class="av-cam">${I.camera}</span></button>
      <div class="ph-text">
        <div class="eyebrow">Profile</div>
        <input class="name-input" id="pName" placeholder="Your name" maxlength="32" spellcheck="false" value="${esc(p.name || '')}">
        <div class="ph-sub">${p.google ? `${I.google}<span>${esc(p.google.email)}</span>` : '<span>Local profile · stored only on this PC</span>'}</div>
      </div>
      <div class="ph-badges">
        <div class="pbadge"><b>${st.streak}</b><span>day streak</span></div>
        <div class="pbadge"><b>${lib.filter((c) => c.favorite).length}</b><span>favorites</span></div>
        <div class="pbadge"><b>${shared}</b><span>shared</span></div>
      </div>
    </section>

    <div class="section-title"><span class="num">01</span><h2>Connected accounts</h2></div>
    <div class="connections three">
      ${accountCardHTML(p)}
      <div class="conn ${p.google ? 'linked' : ''}">
        <div class="conn-head">
          <span class="conn-logo">${I.google}</span>
          <div><b>Google</b><small>${p.google ? `Signed in as ${esc(p.google.email)}` : 'Sign in to put your name and picture on your clips'}</small></div>
          <span class="conn-state">${p.google ? 'Linked' : 'Not linked'}</span>
        </div>
        <div class="conn-body">
          ${p.google
            ? `<button class="btn" id="gOut">Sign out</button>`
            : `<button class="btn primary" id="gIn">${I.google}Sign in with Google</button>${p.googleConfigured && !p.googleBundled ? '<button class="btn" id="gSetup">Edit client ID</button>' : ''}`}
        </div>
      </div>
      <div class="conn ${p.discord || p.discordUser ? 'linked' : ''}">
        <div class="conn-head">
          <span class="conn-logo">${I.discord}</span>
          <div><b>Discord</b><small>${p.discordUser ? `Signed in as <b>@${esc(p.discordUser.username)}</b>` : 'Sign in and share clips to any channel'}</small></div>
          <span class="conn-state">${p.discordUser ? 'Linked' : 'Not linked'}</span>
        </div>
        <div class="conn-body">
          <div class="conn-sub">Account</div>
          ${p.discordUser
            ? `<div class="conn-actions" style="padding:0 0 4px"><button class="btn" id="dlOut">Sign out</button>${p.discordLoginConfigured && !p.discordBundled ? '<button class="btn ghost" id="dlSetup">Edit app</button>' : ''}</div>`
            : `<div class="conn-actions" style="padding:0 0 4px"><button class="btn primary" id="dlIn">${I.discord}Sign in with Discord</button>${p.discordLoginConfigured && !p.discordBundled ? '<button class="btn ghost" id="dlSetup">Edit app</button>' : ''}</div>`}
          <div class="conn-sub">Channel ${p.discord ? `<b>· #${esc(p.discord.name)}</b>` : ''}</div>
          ${p.discord ? `
            <div class="conn-row"><div><b>Auto-post new clips</b><small>Every saved clip goes straight to Discord</small></div><button class="switch ${settings.discordAutoPost ? 'on' : ''}" id="dAuto"></button></div>
            <div class="conn-row"><div><b>Upload limit</b><small>Bigger clips get compressed automatically</small></div>
              <div class="seg" id="dLimit">${[[10, '10 MB'], [50, '50 MB'], [500, '500 MB']].map(([v, l]) => `<button data-v="${v}" class="${settings.discordLimitMB === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
            <div class="conn-actions"><button class="btn" id="dTest">${I.check}Send test message</button><button class="btn" id="dOut">Disconnect</button></div>`
          : `
            <div class="webhook-field"><span>${I.link}</span><input id="dUrl" placeholder="Paste a Discord webhook URL…" spellcheck="false"><button class="btn primary" id="dIn">Connect</button></div>
            <small class="conn-help">Discord → Server settings → Integrations → Webhooks → New webhook → Copy URL. <a href="#" id="dHelp">How it works</a></small>`}
        </div>
      </div>
    </div>

    <div class="section-title"><span class="num">02</span><h2>Your stats</h2></div>
    <div class="stats">
      <div class="stat"><b>${st.clips.length}</b><span>Clips</span></div>
      <div class="stat"><b>${lib.length - st.clips.length}</b><span>Screenshots</span></div>
      <div class="stat"><b>${fmtDur(hours)}</b><span>Clipped time</span></div>
      <div class="stat"><b>${games().length}</b><span>Games</span></div>
    </div>
    <div class="charts">
      <div class="chart-card">
        <div class="chart-head"><b>Top games</b><span>by clips</span></div>
        ${st.g.length ? st.g.map(([name, n]) => `
          <div class="bar-row"><span class="bar-label">${esc(name)}</span><div class="bar"><i style="width:${(n / st.max) * 100}%"></i></div><span class="bar-n">${n}</span></div>`).join('')
          : '<p class="muted">Clip something in a game and it shows up here.</p>'}
      </div>
      <div class="chart-card">
        <div class="chart-head"><b>Activity</b><span>last 14 days</span></div>
        <div class="cols">${st.days.map((x) => `<div class="col" title="${x.n} on ${x.d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}"><i style="height:${Math.max(4, (x.n / st.dmax) * 100)}%" class="${x.n ? '' : 'zero'}"></i><span>${x.d.toLocaleDateString('en-US', { weekday: 'narrow' })}</span></div>`).join('')}</div>
      </div>
    </div>
  </div>`;

  $('#avEdit').addEventListener('click', (e) => {
    openMenu(e.currentTarget, [
      { icon: I.camera, label: 'Choose picture…', run: async () => { profile = await api.chooseAvatar(); renderProfile(); } },
      ...(profile.avatarUrl ? [{ icon: I.trash, label: 'Remove picture', run: async () => { profile = await api.clearAvatar(); renderProfile(); } }] : []),
    ]);
  });
  const nameIn = $('#pName');
  const saveName = async () => {
    const v = nameIn.value.trim();
    if (v === (settings.profileName || '')) return;
    settings = await api.setSettings({ profileName: v });
    profile = await api.profile();
    renderChip();
    snack('Name saved');
  };
  nameIn.addEventListener('blur', saveName);
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameIn.blur(); });

  bindAccountCard();
  if ($('#dlIn')) $('#dlIn').addEventListener('click', () => signInDiscord());
  if ($('#dlSetup')) $('#dlSetup').addEventListener('click', () => discordSetupDialog());
  if ($('#dlOut')) $('#dlOut').addEventListener('click', async () => { profile = await api.discordLogout(); renderChip(); renderProfile(); snack('Signed out of Discord'); });
  if ($('#gIn')) $('#gIn').addEventListener('click', () => signInGoogle());
  if ($('#gSetup')) $('#gSetup').addEventListener('click', () => googleSetupDialog());
  if ($('#gOut')) $('#gOut').addEventListener('click', async () => { profile = await api.googleSignOut(); renderChip(); renderProfile(); snack('Signed out of Google'); });
  if ($('#dIn')) {
    const connect = async () => {
      const btn = $('#dIn');
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
      const r = await api.discordConnect($('#dUrl').value);
      if (r.ok) { snack(`Connected to #${r.info.name}`); profile = await api.profile(); renderChip(); renderProfile(); }
      else { snack(r.error, { ms: 3500 }); btn.disabled = false; btn.textContent = 'Connect'; }
    };
    $('#dIn').addEventListener('click', connect);
    $('#dUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(); });
    $('#dHelp').addEventListener('click', (e) => { e.preventDefault(); api.external('webhookHelp'); });
  }
  if ($('#dOut')) $('#dOut').addEventListener('click', async () => { profile = await api.discordDisconnect(); settings = await api.getSettings(); renderChip(); renderProfile(); snack('Discord disconnected'); });
  if ($('#dTest')) $('#dTest').addEventListener('click', async () => { snack('Sending…', { busy: true }); const r = await api.discordTest(); snack(r.ok ? 'Test message sent — check Discord' : `Discord: ${r.error}`); });
  if ($('#dAuto')) $('#dAuto').addEventListener('click', async (e) => { const v = !settings.discordAutoPost; e.currentTarget.classList.toggle('on', v); settings = await api.setSettings({ discordAutoPost: v }); });
  if ($('#dLimit')) $('#dLimit').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#dLimit button').forEach((x) => x.classList.toggle('on', x === b));
    settings = await api.setSettings({ discordLimitMB: Number(b.dataset.v) });
  });
}

// ───────────────────────────── friends (Clipy Cloud)
let friendsTimer = null;
const ONLINE_MS = 3 * 60 * 1000;
function personAvatar(name, photo, cls = '') {
  if (photo && /^https:\/\/(lh3\.googleusercontent\.com|cdn\.discordapp\.com)\//.test(photo)) return `<span class="avatar ${cls}"><img src="${esc(photo)}" alt="" referrerpolicy="no-referrer"></span>`;
  return `<span class="avatar ${cls}">${esc(initials(name) || '?')}</span>`;
}
const fmtCode = (c) => (c ? `${c.slice(0, 3)}-${c.slice(3)}` : '——');

async function renderFriends(silent = false) {
  clearTimeout(friendsTimer);
  if (view !== 'friends') return;
  if (!silent) $('#view').innerHTML = `<div class="page"><section class="hero"><div><div class="eyebrow">Friends</div><h1>Your squad<span class="ghost">.</span></h1></div></section><div class="loading-row"><span class="spinner"></span>Connecting to Clipy Cloud…</div></div>`;
  const o = await api.friends();
  if (view !== 'friends') return;
  const head = `<section class="hero"><div><div class="eyebrow">Friends</div><h1>Your squad<span class="ghost">.</span></h1></div>
    ${o.ok ? '<div class="hero-actions"><button class="btn" id="fRefresh">Refresh</button></div>' : ''}</section>`;

  if (!o.ok) {
    $('#navFriends').textContent = '';
    const msg = o.reason === 'not-configured'
      ? ['Friends are not available in this build', 'This version of Clipy was built without Clipy Cloud.', '']
      : o.reason === 'signed-out'
        ? ['Sign in to add friends', 'Friends need an account. Use Discord, Google or your email — it takes 10 seconds.',
          `<div class="empty-actions">
            <button class="btn primary" id="fDiscord">${I.discord}${profile.discordUser ? `Continue as @${esc(profile.discordUser.username)}` : 'Sign in with Discord'}</button>
            <button class="btn" id="fGoogle">${I.google}Google</button><button class="btn" id="fEmail">${I.mail}Email</button></div>
          <p class="fine">Discord friends are linked to this PC. Using several PCs? Pick Google or email.</p>`]
        : ['Could not reach Clipy Cloud', esc(o.error || 'Unknown error'), '<div class="empty-actions"><button class="btn" id="fRetry">Try again</button></div>'];
    $('#view').innerHTML = `<div class="page">${head}<div class="empty"><div class="empty-icon">${I.user}</div><h2>${msg[0]}</h2><p>${msg[1]}</p>${msg[2]}</div></div>`;
    if ($('#fGoogle')) $('#fGoogle').addEventListener('click', () => signInGoogle(() => renderFriends()));
    if ($('#fDiscord')) $('#fDiscord').addEventListener('click', async () => {
      if (!profile.discordUser) return signInDiscord(() => renderFriends());
      snack('Connecting…', { busy: true });
      const r = await api.discordCloud();
      snack(r.ok ? 'Connected — share your friend code!' : `Could not connect: ${r.error}`, { ms: 4000 });
      renderFriends();
    });
    if ($('#fEmail')) $('#fEmail').addEventListener('click', () => { go('profile'); setTimeout(() => { const e = $('#aEmail'); if (e) e.focus(); }, 60); });
    if ($('#fRetry')) $('#fRetry').addEventListener('click', () => renderFriends());
    return;
  }

  const online = (f) => o.now - f.lastSeen < ONLINE_MS;
  const friends = [...o.friends].sort((a, b) => (online(b) - online(a)) || (b.lastSeen - a.lastSeen));
  const nOnline = friends.filter(online).length;
  $('#navFriends').textContent = o.incoming.length ? `${o.incoming.length} new` : nOnline ? `${nOnline} online` : friends.length ? String(friends.length) : '';
  const feed = friends.flatMap((f) => (f.activity || []).map((a) => ({ ...a, who: f }))).sort((a, b) => b.at - a.at).slice(0, 14);

  $('#view').innerHTML = `
  <div class="page">
    ${head}
    <div class="friend-top">
      <div class="code-card">
        <div class="eyebrow">Your friend code</div>
        <div class="code-big" id="myCode">${esc(fmtCode(o.me.code))}</div>
        <div class="code-actions"><button class="btn" id="fCopy">${I.copy}Copy code</button><span>Share it — friends add you with it.</span></div>
      </div>
      <div class="add-card">
        <div class="eyebrow">Add a friend</div>
        <form class="add-form" id="fAdd">
          <input id="fCode" maxlength="7" placeholder="ABC-123" spellcheck="false" autocomplete="off">
          <button class="btn primary" type="submit">Send request${I.arrow}</button>
        </form>
        <small class="conn-help">Ask your friend for the code on their Friends page.</small>
      </div>
    </div>

    ${o.incoming.length || o.outgoing.length ? `
    <div class="section-title"><span class="num">01</span><h2>Requests</h2></div>
    <div class="req-list">
      ${o.incoming.map((r, i) => `
        <div class="req in">${personAvatar(r.fromName, '', 'sm')}<div><b>${esc(r.fromName || 'Someone')}</b><small>wants to be your friend · ${esc(ago(r.created))}</small></div>
          <button class="btn primary" data-acc="${i}">${I.check}Accept</button><button class="btn" data-dec="${i}">Decline</button></div>`).join('')}
      ${o.outgoing.map((r, i) => `
        <div class="req out">${personAvatar(r.toName, '', 'sm')}<div><b>${esc(r.toName || 'Player')}</b><small>request sent · waiting ${esc(ago(r.created).replace(' ago', ''))}</small></div>
          <button class="btn ghost" data-can="${i}">Cancel</button></div>`).join('')}
    </div>` : ''}

    <div class="section-title"><span class="num">${o.incoming.length || o.outgoing.length ? '02' : '01'}</span><h2>Friends</h2><span class="st-meta">${friends.length} total · ${nOnline} online</span></div>
    ${friends.length ? `<div class="friend-grid">${friends.map((f) => `
      <div class="friend ${online(f) ? 'online' : ''}" data-uid="${esc(f.uid)}">
        <div class="friend-head">
          <span class="fa-wrap">${personAvatar(f.name, f.photo)}<i class="presence"></i></span>
          <div class="fh-text"><b>${esc(f.name)}</b><small>${online(f)
            ? (f.clipping ? (f.game ? `Clipping · ${esc(f.game)}` : 'Online · replay on') : 'Online')
            : f.lastSeen ? `Last seen ${esc(ago(f.lastSeen))}` : 'Offline'}</small></div>
          <button class="btn icon-only ghost" data-more="${esc(f.uid)}" title="More">${I.dots}</button>
        </div>
        <div class="friend-clips">
          ${(f.activity || []).slice(0, 3).map((a) => `<div class="fc">${a.type === 'shot' ? I.shot : I.film}<span>${esc(a.title || a.game || 'Clip')}</span><em>${a.duration ? fmtDur(a.duration) + ' · ' : ''}${esc(ago(a.at))}</em></div>`).join('') || '<div class="fc empty-fc">No clips yet</div>'}
        </div>
      </div>`).join('')}</div>`
      : `<div class="empty" style="padding:44px"><h2>No friends yet</h2><p>Send your code <b>${esc(fmtCode(o.me.code))}</b> to a friend, or add theirs above.</p></div>`}

    ${feed.length ? `
    <div class="section-title"><span class="num">${o.incoming.length || o.outgoing.length ? '03' : '02'}</span><h2>Recent from friends</h2></div>
    <div class="feed">${feed.map((a) => `
      <div class="feed-row">${personAvatar(a.who.name, a.who.photo, 'sm')}
        <div><b>${esc(a.who.name)}</b> ${a.type === 'shot' ? 'took a screenshot' : 'saved a clip'}${a.game ? ` in <b>${esc(a.game)}</b>` : ''}<small>${esc(a.title || '')}${a.duration ? ` · ${fmtDur(a.duration)}` : ''}</small></div>
        <em>${esc(ago(a.at))}</em></div>`).join('')}</div>` : ''}
  </div>`;

  $('#fRefresh').addEventListener('click', () => renderFriends());
  $('#fCopy').addEventListener('click', () => navigator.clipboard.writeText(o.me.code).then(() => snack(`Code ${fmtCode(o.me.code)} copied`)));
  const codeIn = $('#fCode');
  codeIn.addEventListener('input', () => {
    const v = codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    codeIn.value = v.length > 3 ? `${v.slice(0, 3)}-${v.slice(3)}` : v;
  });
  $('#fAdd').addEventListener('submit', async (e) => {
    e.preventDefault();
    snack('Sending request…', { busy: true });
    const r = await api.friendAdd(codeIn.value);
    if (!r.ok) return snack(r.error, { ms: 3500 });
    snack(r.accepted ? `You and ${r.name || 'your friend'} are now friends!` : `Request sent${r.name ? ` to ${r.name}` : ''}`);
    renderFriends(true);
  });
  $$('[data-acc]').forEach((b) => b.addEventListener('click', async () => {
    const req = o.incoming[Number(b.dataset.acc)];
    const r = await api.friendAccept(req);
    snack(r.ok ? `You and ${req.fromName || 'your friend'} are now friends` : r.error);
    renderFriends(true);
  }));
  $$('[data-dec]').forEach((b) => b.addEventListener('click', async () => { await api.friendDecline(o.incoming[Number(b.dataset.dec)]); renderFriends(true); }));
  $$('[data-can]').forEach((b) => b.addEventListener('click', async () => { await api.friendDecline(o.outgoing[Number(b.dataset.can)]); snack('Request cancelled'); renderFriends(true); }));
  $$('[data-more]').forEach((b) => b.addEventListener('click', () => {
    const f = friends.find((x) => x.uid === b.dataset.more);
    openMenu(b, [{
      icon: I.trash, label: `Remove ${f.name}`, run: () => dialog({
        title: `Remove ${esc(f.name)}?`, body: '<p>You will no longer see each other\'s status and clips.</p>',
        actions: [{ label: 'Cancel' }, { label: 'Remove', primary: true, run: async () => { await api.friendRemove(f.uid); snack('Friend removed'); renderFriends(true); } }],
      }),
    }]);
  }));
  friendsTimer = setTimeout(() => renderFriends(true), 30000);
}

// ───────────────────────────── onboarding
function onboarding() {
  let step = 0;
  const m = $('#modal');
  if (player) { player.cleanup(); player = null; }
  m.onclick = null;
  m.classList.remove('hidden');
  m.classList.add('onb-wrap');
  const render = () => {
    const slides = [
      `<div class="onb-art"><div class="onb-logo"><svg viewBox="0 0 100 100"><path d="M70.1 34.3 A25.5 25.5 0 1 0 70.1 65.7" fill="none" stroke="#000" stroke-width="10" stroke-linecap="round"/><circle cx="50" cy="50" r="8.5" fill="#000"/></svg></div></div>
       <h2>Welcome to Clipy</h2>
       <p>Clipy quietly keeps the last <b>${settings.clipLength} seconds</b> of your screen. When something epic happens, press <kbd>${esc(settings.clipHotkey)}</kbd> — the moment is saved, with sound.</p>
       <div class="onb-keys"><div class="k">${esc(settings.clipHotkey)}<small>save clip</small></div><div class="k">${esc(settings.screenshotHotkey)}<small>screenshot</small></div></div>`,
      `<div class="onb-art">${avatarHTML('xl')}</div>
       <h2>Make it yours</h2>
       <p>Pick a name for your clips, or sign in to use your account name and picture.</p>
       <input class="onb-input" id="oName" placeholder="Your name" maxlength="32" value="${esc(profile.name || '')}" spellcheck="false">
       <div class="onb-auth">
         <button class="btn google-btn" id="oGoogle">${I.google}${profile.google ? 'Google linked' : 'Google'}</button>
         <button class="btn google-btn" id="oDiscord">${I.discord}${profile.discordUser ? `@${esc(profile.discordUser.username)}` : 'Discord'}</button>
         <button class="btn google-btn" id="oEmail">${I.mail}${profile.account ? 'Signed in' : 'Email'}</button>
       </div>`,
      `<div class="onb-art"><span class="onb-icon">${I.discord}</span></div>
       <h2>Share instantly</h2>
       <p>Connect a Discord channel and send any clip there with one click. Big clips are compressed automatically to fit.</p>
       ${profile.discord ? `<div class="onb-ok">${I.check}Connected to #${esc(profile.discord.name)}</div>` :
        `<div class="webhook-field"><span>${I.link}</span><input id="oHook" placeholder="Paste a Discord webhook URL (optional)" spellcheck="false"><button class="btn" id="oHookBtn">Connect</button></div>`}
       <small class="conn-help">You can always do this later in your profile.</small>`,
    ];
    m.innerHTML = `
      <div class="onb">
        <div class="onb-slide">${slides[step]}</div>
        <div class="onb-foot">
          <div class="dots">${slides.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>
          <div class="onb-btns">
            ${step > 0 ? '<button class="btn" id="oBack">Back</button>' : '<button class="btn ghost" id="oSkip">Skip</button>'}
            <button class="btn primary" id="oNext">${step === slides.length - 1 ? 'Start clipping' : 'Continue'}${I.arrow}</button>
          </div>
        </div>
      </div>`;
    const saveName = async () => { const n = $('#oName'); if (n && n.value.trim() !== (settings.profileName || '')) { settings = await api.setSettings({ profileName: n.value.trim() }); profile = await api.profile(); renderChip(); } };
    const finish = async () => { await saveName(); settings = await api.setSettings({ onboarded: true }); m.classList.remove('onb-wrap'); closeModal(); renderCurrent(); };
    $('#oNext').addEventListener('click', async () => { await saveName(); if (step === slides.length - 1) finish(); else { step++; render(); } });
    if ($('#oBack')) $('#oBack').addEventListener('click', async () => { await saveName(); step--; render(); });
    if ($('#oSkip')) $('#oSkip').addEventListener('click', finish);
    if ($('#oGoogle') && !profile.google) $('#oGoogle').addEventListener('click', async () => { await saveName(); signInGoogle(() => render()); });
    if ($('#oDiscord') && !profile.discordUser) $('#oDiscord').addEventListener('click', async () => { await saveName(); signInDiscord(() => render()); });
    if ($('#oEmail') && !profile.account) $('#oEmail').addEventListener('click', async () => {
      await saveName();
      settings = await api.setSettings({ onboarded: true });
      m.classList.remove('onb-wrap'); closeModal(); go('profile');
      setTimeout(() => { const t = $('#aTabs button[data-t="up"]'); if (t) t.click(); const e = $('#aEmail'); if (e) e.focus(); }, 50);
    });
    if ($('#oHookBtn')) $('#oHookBtn').addEventListener('click', async () => {
      const r = await api.discordConnect($('#oHook').value);
      if (r.ok) { profile = await api.profile(); renderChip(); render(); snack(`Connected to #${r.info.name}`); } else snack(r.error);
    });
  };
  render();
}

// ───────────────────────────── settings
async function renderSettings() {
  const displays = await api.displays();
  const s = settings;
  const seg = (key, opts, num = false) => `<div class="seg" data-key="${key}" data-num="${num ? 1 : ''}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const sw = (key) => `<button class="switch ${s[key] ? 'on' : ''}" data-switch="${key}" role="switch" aria-checked="${!!s[key]}"></button>`;
  const range = (key, dep) => `<div class="range ${dep && !s[dep] ? 'disabled' : ''}" data-dep="${dep || ''}"><input type="range" min="0" max="200" step="5" value="${s[key]}" data-range="${key}"><output>${s[key]}%</output></div>`;
  const row = (title, desc, ctrl) => `<div class="row"><div class="row-text"><b>${title}</b><small>${desc}</small></div><div class="row-ctrl">${ctrl}</div></div>`;
  const hk = (key) => `<button class="hotkey ${state.hotkeyErrors && state.hotkeyErrors.includes(HK_NAME[key]) ? 'bad' : ''}" data-hotkey="${key}">${esc(s[key] || '—')}</button>`;
  const mon = s.monitor != null && displays.some((d) => d.id === String(s.monitor)) ? String(s.monitor) : (displays.find((d) => d.primary) || displays[0] || {}).id;

  $('#view').innerHTML = `
  <div class="page">
    <section class="hero"><div><div class="eyebrow">Settings</div><h1>Fine-tuning<span class="ghost">.</span></h1></div></section>
    <div class="settings">
      <div class="settings-nav" id="sNav">
        <a data-t="s-rec" class="active">Capture</a><a data-t="s-audio">Audio</a><a data-t="s-keys">Hotkeys</a>
        <a data-t="s-store">Storage</a><a data-t="s-gen">General</a><a data-t="s-info">About</a>
      </div>
      <div>
        <div class="section" id="s-rec">
          <div class="section-head"><span class="num">01</span><h2>Capture</h2></div>
          ${row('Clip length', 'How many seconds are saved retroactively.', seg('clipLength', [[15, '15s'], [30, '30s'], [60, '1m'], [90, '1:30'], [120, '2m']], true))}
          ${row('Frame rate', '60 FPS for smooth action, 30 FPS saves performance.', seg('fps', [[30, '30'], [60, '60']], true))}
          ${row('Resolution', 'Maximum capture resolution. Aspect ratio is preserved.', seg('resolution', [['720', '720p'], ['1080', '1080p'], ['1440', '1440p'], ['native', 'Native']]))}
          ${row('Quality', 'Higher quality = bigger files.', seg('quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]))}
          ${row('Screen', 'Which monitor gets captured.', `<div class="select"><select id="monitor">${displays.map((d) => `<option value="${d.id}" ${d.id === mon ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}</select></div>`)}
          ${row('Tip', 'Games in <b>borderless windowed</b> mode are captured most reliably. Exclusive fullscreen can produce black clips.', '')}
        </div>
        <div class="section" id="s-audio">
          <div class="section-head"><span class="num">02</span><h2>Audio</h2></div>
          ${row('System audio', 'Game sound, Discord & everything you hear.', sw('systemAudio'))}
          ${row('System volume', 'Level of system audio in the clip.', range('systemVolume', 'systemAudio'))}
          ${row('Microphone', 'Mix your voice into the clip.', sw('microphone'))}
          ${row('Microphone volume', 'Level of your microphone in the clip.', range('micVolume', 'microphone'))}
        </div>
        <div class="section" id="s-keys">
          <div class="section-head"><span class="num">03</span><h2>Hotkeys</h2></div>
          ${row('Save clip', 'Click, then press a key or combo. Works globally – even in-game.', hk('clipHotkey'))}
          ${row('Screenshot', 'Saves a still image at full resolution.', hk('screenshotHotkey'))}
          ${row('Save long clip', 'A second hotkey for the big moments — saves a longer stretch.', hk('longClipHotkey'))}
          ${row('Long clip length', 'How far back the long-clip hotkey reaches.', seg('longClipLength', [[60, '1m'], [120, '2m'], [180, '3m'], [300, '5m']], true))}
        </div>
        <div class="section" id="s-store">
          <div class="section-head"><span class="num">04</span><h2>Storage</h2></div>
          ${row('Clips folder', `<code id="dirPath">${esc(s.clipsDir)}</code>`, `<button class="btn" id="dirOpen">${I.folder}Open</button><button class="btn" id="dirChange">Change</button>`)}
          ${row('Storage limit', 'When the library gets bigger, the oldest clips go to the Recycle Bin. Favorites are never touched.', seg('maxStorageGB', [[0, 'Off'], [10, '10 GB'], [25, '25 GB'], [50, '50 GB'], [100, '100 GB']], true))}
        </div>
        <div class="section" id="s-gen">
          <div class="section-head"><span class="num">05</span><h2>General</h2></div>
          ${row('Launch with Windows', 'Clipy starts hidden in the tray, replay runs right away.', sw('launchOnStartup'))}
          ${row('Keep running in tray', 'Keep recording in the background when the window is closed.', sw('minimizeToTray'))}
          ${row('Overlay notification', 'Small popup in the top-right when a clip is saved.', sw('overlay'))}
          ${row('Sound cue', 'Short beep to confirm a clip.', sw('soundCue'))}
          ${row('Friend alerts', 'Pop-up when one of your friends saves a clip.', sw('friendAlerts'))}
          ${row('Keyboard shortcuts', 'All hotkeys at a glance. Press <kbd>?</kbd> anywhere.', '<button class="btn" id="kbBtn">Show shortcuts</button>')}
          ${row('Check for updates', 'Shows a badge in the sidebar when a new version is on GitHub.', sw('checkUpdates'))}
          ${row('Welcome tour', 'Show the intro screens again.', '<button class="btn" id="tour">Replay tour</button>')}
        </div>
        <div class="section" id="s-info">
          <div class="section-head"><span class="num">06</span><h2>About</h2></div>
          <div class="info-grid" id="infoGrid"></div>
          <div class="row"><div class="row-text"><b>Clipy is open source</b><small>Source code, releases and changelog on GitHub.</small></div><div class="row-ctrl"><button class="btn" id="ghRepo">${I.github}GitHub</button></div></div>
        </div>
      </div>
    </div>
  </div>`;
  renderInfo();

  const set = async (patch) => {
    settings = await api.setSettings(patch);
    renderStatus();
  };
  $$('.seg[data-key]').forEach((g) => g.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    $$('button', g).forEach((x) => x.classList.toggle('on', x === btn));
    const v = g.dataset.num ? Number(btn.dataset.v) : btn.dataset.v;
    set({ [g.dataset.key]: v });
  }));
  $$('[data-switch]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.switch;
    const v = !settings[k];
    b.classList.toggle('on', v);
    b.setAttribute('aria-checked', v);
    $$(`.range[data-dep="${k}"]`).forEach((r) => r.classList.toggle('disabled', !v));
    set({ [k]: v });
  }));
  $$('[data-range]').forEach((r) => {
    r.addEventListener('input', () => { r.nextElementSibling.textContent = `${r.value}%`; });
    r.addEventListener('change', () => set({ [r.dataset.range]: Number(r.value) }));
  });
  $('#monitor').addEventListener('change', (e) => set({ monitor: e.target.value }));
  $('#dirOpen').addEventListener('click', () => api.openDir());
  $('#dirChange').addEventListener('click', async () => {
    const d = await api.chooseDir();
    if (d) { settings.clipsDir = d; $('#dirPath').textContent = d; snack('Save location changed'); }
  });
  $('#tour').addEventListener('click', () => onboarding());
  $('#kbBtn').addEventListener('click', shortcutsDialog);
  $('#ghRepo').addEventListener('click', () => api.external('repo'));
  $$('[data-hotkey]').forEach((b) => b.addEventListener('click', () => listenHotkey(b)));

  const view = $('#view');
  $$('#sNav a').forEach((a) => a.addEventListener('click', () => {
    const t = document.getElementById(a.dataset.t);
    view.scrollTo({ top: t.offsetTop - 20, behavior: 'smooth' });
  }));
  const onScroll = () => {
    if (!$('#sNav')) return view.removeEventListener('scroll', onScroll);
    let cur = 's-rec';
    for (const a of $$('#sNav a')) {
      const t = document.getElementById(a.dataset.t);
      if (t && t.offsetTop - 120 <= view.scrollTop) cur = a.dataset.t;
    }
    $$('#sNav a').forEach((a) => a.classList.toggle('active', a.dataset.t === cur));
  };
  view.addEventListener('scroll', onScroll);
}

function renderInfo() {
  const g = $('#infoGrid');
  if (!g) return;
  const inf = state.recInfo;
  g.innerHTML = `
    <div><span>Encoder</span><b>${esc(ENCODERS[state.encoder] || state.encoder || '…')}</b></div>
    <div><span>Capture</span><b>${inf ? `${inf.width}×${inf.height} · ${inf.fps}fps · ${esc(inf.codec)}` : '—'}</b></div>
    <div><span>Version</span><b>Clipy ${esc(state.version || '')}${state.update ? ` → ${esc(state.update.version)}` : ''}</b></div>`;
}

const CODE_MAP = {
  Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  Pause: 'Pause', ScrollLock: 'Scrolllock', PrintScreen: 'PrintScreen', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult', NumpadDivide: 'numdiv', NumpadDecimal: 'numdec',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Space: 'Space', Tab: 'Tab',
};
function toAccel(e) {
  const mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  const c = e.code;
  let k = null;
  if (/^F\d{1,2}$/.test(c)) k = c;
  else if (/^Key[A-Z]$/.test(c)) k = c.slice(3);
  else if (/^Digit\d$/.test(c)) k = c.slice(5);
  else if (/^Numpad\d$/.test(c)) k = 'num' + c.slice(6);
  else k = CODE_MAP[c] || null;
  if (!k) return { accel: null };
  if (!mods.length && !/^F\d/.test(k) && !['Insert', 'Home', 'End', 'PageUp', 'PageDown', 'Pause', 'Scrolllock', 'PrintScreen'].includes(k) && !k.startsWith('num')) {
    return { accel: null, warn: 'Combine the key with Ctrl, Alt or Shift' };
  }
  return { accel: [...mods, k].join('+') };
}
const HK_NAME = { clipHotkey: 'clip', screenshotHotkey: 'shot', longClipHotkey: 'long' };
let hotkeyListen = null;
function listenHotkey(btn) {
  if (hotkeyListen) hotkeyListen.cancel();
  const key = btn.dataset.hotkey;
  const prev = btn.textContent;
  btn.classList.add('listening');
  btn.textContent = 'Press a key…';
  api.hotkeysEnabled(false);
  const finish = async (accel) => {
    window.removeEventListener('keydown', onKey, true);
    btn.classList.remove('listening');
    hotkeyListen = null;
    if (accel) {
      if (Object.keys(HK_NAME).some((k) => k !== key && settings[k] === accel)) { snack('That key is already in use'); btn.textContent = prev; api.hotkeysEnabled(true); return; }
      settings = await api.setSettings({ [key]: accel });
      state = await api.state();
      btn.textContent = accel;
      const bad = state.hotkeyErrors.includes(HK_NAME[key]);
      btn.classList.toggle('bad', bad);
      snack(bad ? 'Key is taken by another app' : `Hotkey set: ${accel}`);
      renderStatus();
    } else {
      btn.textContent = prev;
      api.hotkeysEnabled(true);
    }
  };
  const onKey = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
    if (e.key === 'Escape') return finish(null);
    const r = toAccel(e);
    if (r.warn) { snack(r.warn); return; }
    if (r.accel) finish(r.accel);
  };
  window.addEventListener('keydown', onKey, true);
  hotkeyListen = { cancel: () => finish(null) };
}

// ───────────────────────────── boot
$$('[data-win]').forEach((b) => b.addEventListener('click', () => api.win(b.dataset.win)));
$$('.nav-item').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
$('#profileChip').addEventListener('click', () => go('profile'));
$('#updateBadge').addEventListener('click', () => api.openUpdate());
$('#sideClip').addEventListener('click', () => api.saveClip());
$('#sideToggle').addEventListener('click', async () => {
  state = await api.toggleBuffer();
  settings = await api.getSettings();
  renderStatus();
});
window.addEventListener('keydown', (e) => {
  const typing = /INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName);
  if (e.key === '?' && !typing && !document.querySelector('.confirm')) { e.preventDefault(); shortcutsDialog(); return; }
  if (e.key === 'Escape' && sel.size && $('#modal').classList.contains('hidden') && !document.querySelector('.confirm')) { clearSelection(); return; }
  if (e.ctrlKey && e.key.toLowerCase() === 'a' && view === 'library' && !typing && $('#modal').classList.contains('hidden')) {
    e.preventDefault(); filtered().forEach((c) => sel.add(c.id)); $$('.card').forEach((n) => n.classList.toggle('selected', sel.has(n.dataset.id))); renderSelBar(); return;
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'f' && view === 'library' && $('#modal').classList.contains('hidden')) { e.preventDefault(); const q = $('#q'); if (q) q.focus(); }
});
window.addEventListener('resize', closeMenu);
$('#view').addEventListener('scroll', closeMenu);
api.on('state', (s) => { state = s; renderStatus(); renderInfo(); });
api.on('library-changed', reloadLibrary);
api.on('friends-activity', () => { if (view === 'friends') renderFriends(true); });

(async () => {
  [state, settings, lib, profile] = await Promise.all([api.state(), api.getSettings(), api.library(), api.profile()]);
  $('#navCount').textContent = lib.length;
  renderChip();
  renderStatus();
  go('library');
  if (!settings.onboarded) onboarding();
})();
