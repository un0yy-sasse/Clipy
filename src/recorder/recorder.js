'use strict';
// Hidden capture window: keeps a rolling replay buffer as short WebM sessions
// streamed to the main process. Sessions rotate every N seconds (and on demand
// when a clip is saved) so every finished file is a complete, valid recording.

const { send, on } = window.bridge;
const video = document.getElementById('v');

let base = null;      // raw desktop stream
let mic = null;       // microphone stream
let actx = null;      // audio mixer
let mixed = null;     // stream handed to MediaRecorder
let recorder = null;
let rotateTimer = null;
let sid = Date.now();
let cfg = null;
let hasAudio = false;
let mime = '';
let queue = Promise.resolve();
let starting = Promise.resolve();

function pickMime() {
  const list = [
    'video/webm;codecs=h264,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return list.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

function bitrate(c) {
  const px = c.maxWidth * c.maxHeight;
  const perPx = { high: 0.13, medium: 0.08, low: 0.045 }[c.quality] || 0.1; // bits per pixel per frame
  return Math.round(Math.min(60e6, Math.max(2.5e6, px * c.fps * perPx)));
}

async function stopAll() {
  clearInterval(rotateTimer);
  rotateTimer = null;
  if (recorder && recorder.state !== 'inactive') {
    recorder._endT = Date.now();
    recorder.stop();
  }
  recorder = null;
  for (const s of [base, mic]) if (s) s.getTracks().forEach((t) => t.stop());
  base = mic = mixed = null;
  if (actx) { try { await actx.close(); } catch {} actx = null; }
  video.srcObject = null;
}

async function grabDesktop(c, withAudio) {
  return navigator.mediaDevices.getUserMedia({
    audio: withAudio ? { mandatory: { chromeMediaSource: 'desktop' } } : false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: c.sourceId,
        maxWidth: c.maxWidth,
        maxHeight: c.maxHeight,
        maxFrameRate: c.fps,
      },
    },
  });
}

async function start(c) {
  await stopAll();
  cfg = c;
  try {
    try {
      base = await grabDesktop(c, c.systemAudio);
    } catch (e) {
      if (!c.systemAudio) throw e;
      base = await grabDesktop(c, false); // audio loopback unavailable → video only
    }

    const tracks = [base.getVideoTracks()[0]];
    const sysTracks = base.getAudioTracks();
    hasAudio = false;
    if (sysTracks.length || c.microphone) {
      actx = new AudioContext({ sampleRate: 48000 });
      const dest = actx.createMediaStreamDestination();
      // a silent constant source keeps the audio track continuous even when nothing plays
      const silent = actx.createConstantSource();
      const mute = actx.createGain(); mute.gain.value = 0;
      silent.connect(mute).connect(dest); silent.start();
      if (sysTracks.length) {
        const g = actx.createGain(); g.gain.value = (c.systemVolume ?? 100) / 100;
        actx.createMediaStreamSource(new MediaStream(sysTracks)).connect(g).connect(dest);
      }
      if (c.microphone) {
        try {
          mic = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          const g = actx.createGain(); g.gain.value = (c.micVolume ?? 100) / 100;
          actx.createMediaStreamSource(mic).connect(g).connect(dest);
        } catch { /* no mic – continue without */ }
      }
      tracks.push(dest.stream.getAudioTracks()[0]);
      hasAudio = true;
    }
    mixed = new MediaStream(tracks);

    video.srcObject = base;
    video.play().catch(() => {});

    mime = pickMime();
    send('rec:reset');
    newSession();
    rotateTimer = setInterval(newSession, c.segSeconds * 1000);

    const s = base.getVideoTracks()[0].getSettings();
    send('rec:status', {
      ok: true,
      info: {
        width: s.width, height: s.height, fps: c.fps,
        codec: (mime.match(/codecs=([^,]+)/) || [, 'vp8'])[1].toUpperCase(),
        audio: hasAudio, mic: !!mic, bitrate: bitrate(c),
      },
    });
  } catch (e) {
    await stopAll();
    send('rec:status', { ok: false, error: 'Could not start capture: ' + (e && e.message ? e.message : e) });
  }
}

function newSession() {
  if (!mixed) return;
  const id = ++sid;
  const r = new MediaRecorder(mixed, {
    mimeType: mime || undefined,
    videoBitsPerSecond: bitrate(cfg),
    audioBitsPerSecond: 160000,
  });
  r.ondataavailable = (e) => {
    if (!e.data || !e.data.size) return;
    const blob = e.data;
    queue = queue.then(() => blob.arrayBuffer()).then((buf) => send('rec:chunk', { id, data: buf })).catch(() => {});
  };
  r.onstop = () => {
    const t = r._endT || Date.now();
    queue = queue.then(() => send('rec:end', { id, t }));
  };
  r.onerror = () => {
    send('rec:status', { ok: false, error: 'Recorder error – restarting…' });
    setTimeout(() => cfg && start(cfg), 1000);
  };
  send('rec:start', { id, t: Date.now(), hasAudio });
  r.start(1000);

  const old = recorder;
  recorder = r;
  if (old && old.state !== 'inactive') {
    old._endT = Date.now();
    old.stop();
  }
}

async function screenshot() {
  if (!base || !video.videoWidth) return send('rec:shot-data', null);
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  const data = await blob.arrayBuffer();
  send('rec:shot-data', { data, width: canvas.width, height: canvas.height });
}

on('rec:config', (c) => { starting = starting.then(() => start(c)); });
on('rec:stop', () => { starting = starting.then(() => stopAll()); });
on('rec:rotate', () => {
  if (!mixed) return;
  newSession();
  clearInterval(rotateTimer);
  rotateTimer = setInterval(newSession, cfg.segSeconds * 1000);
});
on('rec:shot', () => screenshot().catch(() => send('rec:shot-data', null)));
