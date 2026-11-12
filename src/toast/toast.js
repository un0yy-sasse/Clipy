'use strict';
const el = document.getElementById('toast');
const badge = document.getElementById('badge');
const titleEl = document.getElementById('title');
const subEl = document.getElementById('sub');

const ICONS = {
  progress: '<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 9 9"/></svg>',
  done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  shot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 7v6M12 17h.01"/></svg>',
};

window.toastApi.on('toast', (m) => {
  el.className = 'toast ' + m.kind;
  badge.innerHTML = ICONS[m.kind] || ICONS.done;
  titleEl.textContent = m.title || '';
  subEl.textContent = m.sub || '';
  requestAnimationFrame(() => el.classList.add('show'));
});
window.toastApi.on('toast-hide', () => el.classList.remove('show'));

let ctx = null;
window.toastApi.on('cue', (kind) => {
  try {
    ctx = ctx || new AudioContext();
    const now = ctx.currentTime;
    const notes = kind === 'shot' ? [1320] : [880, 1320];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = now + i * 0.09;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.2);
    });
  } catch {}
});
