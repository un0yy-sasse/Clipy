'use strict';
/* Clipy UI */
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
  drag: '<svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  vol: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" class="fill"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" class="fill"/><path d="M17 9.5l5 5M22 9.5l-5 5"/></svg>',
  pauseLine: '<svg viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg>',
  playLine: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" class="fill"/></svg>',
};

let state = {};
let settings = {};
let lib = [];
let view = 'library';
const ui = { filter: 'all', q: '', sort: 'new' };
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
function dayKey(ts) { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
function dayLabel(ts) {
  const d = new Date(ts), now = new Date();
  const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
const ENCODERS = { h264_nvenc: 'NVIDIA NVENC', h264_amf: 'AMD AMF', h264_qsv: 'Intel Quick Sync', libx264: 'CPU · x264' };

let snackT = null;
function snack(text) {
  const s = $('#snack');
  s.textContent = text;
  s.classList.add('show');
  clearTimeout(snackT);
  snackT = setTimeout(() => s.classList.remove('show'), 2200);
}

// ───────────────────────────── sidebar status
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
  tickMeter();
  const hb = $('#heroClip');
  if (hb) hb.disabled = !on || state.saving;
  const hs = $('#heroShot');
  if (hs) hs.disabled = !on;
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
  closeModal();
  if (v === 'library') renderLibrary();
  else renderSettings();
  $('#view').scrollTop = 0;
}

// ───────────────────────────── library
function filtered() {
  const q = ui.q.trim().toLowerCase();
  let list = lib.filter((c) => {
    if (ui.filter === 'clip' && c.type !== 'clip') return false;
    if (ui.filter === 'shot' && c.type !== 'shot') return false;
    if (ui.filter === 'fav' && !c.favorite) return false;
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
  const chip = (k, label, n) => `<button class="chip ${ui.filter === k ? 'active' : ''}" data-filter="${k}">${label}${n != null ? ` <span style="opacity:.5">${n}</span>` : ''}</button>`;
  $('#view').innerHTML = `
  <div class="page">
    <section class="hero">
      <div>
        <div class="eyebrow">Library</div>
        <h1>Your moments<span class="ghost">.</span></h1>
      </div>
      <div class="hero-actions">
        <button class="btn" id="openDir">${I.folder}Folder</button>
        <button class="btn" id="heroShot">${I.shot}Screenshot <kbd>${esc(settings.screenshotHotkey || '—')}</kbd></button>
        <button class="btn primary" id="heroClip">${I.rec}Save clip <kbd>${esc(settings.clipHotkey || '—')}</kbd></button>
      </div>
    </section>
    <div class="stats">
      <div class="stat"><b>${clips.length}</b><span>Clips</span></div>
      <div class="stat"><b>${shots.length}</b><span>Screenshots</span></div>
      <div class="stat"><b>${fmtDur(dur)}</b><span>Total length</span></div>
      <div class="stat"><b>${fmtSize(size)}</b><span>Storage</span></div>
    </div>
    <div class="toolbar">
      <div class="chips">
        ${chip('all', 'All')}${chip('clip', 'Clips', clips.length)}${chip('shot', 'Screenshots', shots.length)}${chip('fav', 'Favorites', lib.filter((c) => c.favorite).length)}
      </div>
      <label class="search">${I.search}<input id="q" placeholder="Search by game or title…" spellcheck="false"></label>
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
  $$('.chip').forEach((b) => b.addEventListener('click', () => {
    ui.filter = b.dataset.filter;
    $$('.chip').forEach((x) => x.classList.toggle('active', x === b));
    renderGroups();
  }));
  $('#openDir').addEventListener('click', () => api.openDir());
  $('#heroClip').addEventListener('click', () => api.saveClip());
  $('#heroShot').addEventListener('click', () => api.screenshot());
  renderStatus();
  renderGroups();
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
    const sec = el(`<section class="group"><div class="group-head"><h3>${esc(g.label)}</h3><span>${g.items.length} ${g.items.length === 1 ? 'item' : 'items'}</span></div><div class="grid"></div></section>`);
    const grid = $('.grid', sec);
    g.items.forEach((c) => grid.appendChild(card(c)));
    box.appendChild(sec);
  }
}

function card(c) {
  const node = el(`
    <article class="card" tabindex="0" draggable="true" data-id="${c.id}">
      <div class="thumb">
        ${c.thumbUrl ? `<img src="${esc(c.thumbUrl)}" alt="" loading="lazy">` : '<div class="noimg">no preview</div>'}
        <div class="play-ring"><div>${c.type === 'shot' ? '<svg viewBox="0 0 24 24" style="margin:0"><circle cx="12" cy="12" r="5"/></svg>' : I.play}</div></div>
        <button class="fav-btn ${c.favorite ? 'on' : ''}" title="Favorite">${I.star}</button>
        <span class="badge-type">${c.type === 'shot' ? I.shot : I.film}</span>
        ${c.type === 'clip' ? `<span class="badge-dur">${fmtDur(c.duration)}</span>` : ''}
      </div>
      <div class="card-meta">
        <div class="card-title">${esc(c.title)}</div>
        <div class="card-sub"><span>${fmtTime(c.createdAt)}</span><i>/</i><span>${fmtSize(c.size)}</span>${c.type === 'shot' && c.width ? `<i>/</i><span>${c.width}×${c.height}</span>` : ''}</div>
      </div>
    </article>`);
  node.addEventListener('click', () => openPlayer(c.id));
  node.addEventListener('keydown', (e) => { if (e.key === 'Enter') openPlayer(c.id); });
  $('.fav-btn', node).addEventListener('click', async (e) => {
    e.stopPropagation();
    c.favorite = await api.favorite(c.id);
    e.currentTarget.classList.toggle('on', c.favorite);
    if (ui.filter === 'fav') renderGroups();
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
      node.classList.remove('previewing');
      if (v) { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); v = null; }
    });
  }
  return node;
}

async function reloadLibrary() {
  lib = await api.library();
  $('#navCount').textContent = lib.length;
  if (view === 'library' && $('#modal').classList.contains('hidden')) renderLibrary();
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
  const m = $('#modal');
  const isClip = c.type === 'clip';
  m.innerHTML = `
  <div class="player">
    <div class="player-head">
      <input class="title-input" id="pTitle" spellcheck="false" maxlength="80">
      <span class="player-meta">${new Date(c.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} · ${fmtSize(c.size)}</span>
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
      <button class="ctrl-btn stroke" id="pMute" title="Sound">${I.vol}</button>
      <button class="ctrl-btn stroke" id="pFull" title="Fullscreen (F)">${I.full}</button>
    </div>` : ''}
    <div class="player-actions">
      <button class="btn ${c.favorite ? 'on' : ''}" id="pFav">${I.star}${c.favorite ? 'Favorite' : 'Add to favorites'}</button>
      ${isClip ? `<button class="btn" id="pTrim" disabled>${I.scissors}Save selection</button>` : ''}
      <button class="btn" id="pReveal">${I.folder}Show in folder</button>
      <button class="btn" id="pOpen">${I.ext}Open externally</button>
      <span class="grow"></span>
      <span class="drag-hint">${I.drag}Drag a card straight into Discord</span>
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

  $('#pClose').addEventListener('click', () => { closeModal(); renderLibrary(); });
  m.onclick = (e) => { if (e.target === m) { closeModal(); renderLibrary(); } };
  $('#pFav').addEventListener('click', async (e) => {
    c.favorite = await api.favorite(c.id);
    e.currentTarget.classList.toggle('on', c.favorite);
    e.currentTarget.innerHTML = `${I.star}${c.favorite ? 'Favorite' : 'Add to favorites'}`;
  });
  $('#pReveal').addEventListener('click', () => api.reveal(c.id));
  $('#pOpen').addEventListener('click', () => { if (isClip) $('#pVideo').pause(); api.open(c.id); });
  $('#pDel').addEventListener('click', () => confirmDelete(c));

  const cleanups = [];
  player = { id: c.id, cleanup: () => cleanups.forEach((f) => f()) };

  if (!isClip) {
    const onKey = (e) => { if (e.key === 'Escape') { closeModal(); renderLibrary(); } };
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
  raf = requestAnimationFrame(frame);
  layout();

  // timeline: seek + trim handles
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
    if (document.activeElement === title) return;
    if (e.key === ' ') { e.preventDefault(); toggle(); }
    else if (e.key === 'Escape') { if (!document.fullscreenElement) { closeModal(); renderLibrary(); } }
    else if (e.key === 'ArrowLeft') v.currentTime = Math.max(0, v.currentTime - (e.shiftKey ? 1 : 5));
    else if (e.key === 'ArrowRight') v.currentTime = Math.min(dur, v.currentTime + (e.shiftKey ? 1 : 5));
    else if (e.key.toLowerCase() === 'i') { a = Math.min(v.currentTime, b - 0.5); layout(); }
    else if (e.key.toLowerCase() === 'o') { b = Math.max(v.currentTime, a + 0.5); layout(); }
    else if (e.key.toLowerCase() === 'f') $('#pFull').click();
    else if (e.key.toLowerCase() === 'm') $('#pMute').click();
  };
  window.addEventListener('keydown', onKey);
  cleanups.push(() => {
    window.removeEventListener('keydown', onKey);
    cancelAnimationFrame(raf);
    v.pause(); v.removeAttribute('src'); v.load();
  });
}

function confirmDelete(c) {
  const box = el(`
    <div class="modal" style="z-index:60">
      <div class="confirm">
        <h3>Delete "${esc(c.title)}"?</h3>
        <p>The file is moved to the Recycle Bin and removed from your library.</p>
        <div class="row-btns">
          <button class="btn" data-a="no">Cancel</button>
          <button class="btn primary" data-a="yes">${I.trash}Delete</button>
        </div>
      </div>
    </div>`);
  document.body.appendChild(box);
  const done = () => { box.remove(); window.removeEventListener('keydown', key, true); };
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(); } };
  window.addEventListener('keydown', key, true);
  box.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]');
    if (e.target === box || (a && a.dataset.a === 'no')) return done();
    if (a && a.dataset.a === 'yes') {
      done();
      await api.remove(c.id);
      closeModal();
      lib = await api.library();
      $('#navCount').textContent = lib.length;
      renderLibrary();
      snack('Moved to Recycle Bin');
    }
  });
}

// ───────────────────────────── settings
async function renderSettings() {
  const displays = await api.displays();
  const s = settings;
  const seg = (key, opts, num = false) => `<div class="seg" data-key="${key}" data-num="${num ? 1 : ''}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const sw = (key) => `<button class="switch ${s[key] ? 'on' : ''}" data-switch="${key}" role="switch" aria-checked="${!!s[key]}"></button>`;
  const range = (key, dep) => `<div class="range ${dep && !s[dep] ? 'disabled' : ''}" data-dep="${dep || ''}"><input type="range" min="0" max="200" step="5" value="${s[key]}" data-range="${key}"><output>${s[key]}%</output></div>`;
  const row = (title, desc, ctrl) => `<div class="row"><div class="row-text"><b>${title}</b><small>${desc}</small></div><div class="row-ctrl">${ctrl}</div></div>`;
  const hk = (key) => `<button class="hotkey ${state.hotkeyErrors && state.hotkeyErrors.includes(key === 'clipHotkey' ? 'clip' : 'shot') ? 'bad' : ''}" data-hotkey="${key}">${esc(s[key] || '—')}</button>`;
  const mon = s.monitor != null && displays.some((d) => d.id === String(s.monitor)) ? String(s.monitor) : (displays.find((d) => d.primary) || displays[0] || {}).id;

  $('#view').innerHTML = `
  <div class="page">
    <section class="hero"><div><div class="eyebrow">Settings</div><h1>Fine-tuning<span class="ghost">.</span></h1></div></section>
    <div class="settings">
      <div class="settings-nav" id="sNav">
        <a data-t="s-rec" class="active">Capture</a><a data-t="s-audio">Audio</a><a data-t="s-keys">Hotkeys</a>
        <a data-t="s-store">Storage</a><a data-t="s-gen">General</a><a data-t="s-info">Info</a>
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
        </div>
        <div class="section" id="s-store">
          <div class="section-head"><span class="num">04</span><h2>Storage</h2></div>
          ${row('Clips folder', `<code id="dirPath">${esc(s.clipsDir)}</code>`, `<button class="btn" id="dirOpen">${I.folder}Open</button><button class="btn" id="dirChange">Change</button>`)}
        </div>
        <div class="section" id="s-gen">
          <div class="section-head"><span class="num">05</span><h2>General</h2></div>
          ${row('Launch with Windows', 'Clipy starts hidden in the tray, replay runs right away.', sw('launchOnStartup'))}
          ${row('Keep running in tray', 'Keep recording in the background when the window is closed.', sw('minimizeToTray'))}
          ${row('Overlay notification', 'Small popup in the top-right when a clip is saved.', sw('overlay'))}
          ${row('Sound cue', 'Short beep to confirm a clip.', sw('soundCue'))}
        </div>
        <div class="section" id="s-info">
          <div class="section-head"><span class="num">06</span><h2>Info</h2></div>
          <div class="info-grid" id="infoGrid"></div>
        </div>
      </div>
    </div>
  </div>`;
  renderInfo();

  const set = async (patch) => {
    settings = await api.setSettings(patch);
    renderStatus();
  };
  $$('.seg').forEach((g) => g.addEventListener('click', (e) => {
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
  $$('[data-hotkey]').forEach((b) => b.addEventListener('click', () => listenHotkey(b)));

  // settings side-nav
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
    <div><span>Version</span><b>Clipy ${esc(state.version || '')}</b></div>`;
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
      const other = key === 'clipHotkey' ? 'screenshotHotkey' : 'clipHotkey';
      if (settings[other] === accel) { snack('That key is already in use'); btn.textContent = prev; api.hotkeysEnabled(true); return; }
      settings = await api.setSettings({ [key]: accel });
      state = await api.state();
      btn.textContent = accel;
      const bad = state.hotkeyErrors.includes(key === 'clipHotkey' ? 'clip' : 'shot');
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
$('#sideClip').addEventListener('click', () => api.saveClip());
$('#sideToggle').addEventListener('click', async () => {
  state = await api.toggleBuffer();
  settings = await api.getSettings();
  renderStatus();
});
api.on('state', (s) => { state = s; renderStatus(); renderInfo(); });
api.on('library-changed', reloadLibrary);

(async () => {
  [state, settings, lib] = await Promise.all([api.state(), api.getSettings(), api.library()]);
  $('#navCount').textContent = lib.length;
  renderStatus();
  go('library');
})();
