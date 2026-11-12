'use strict';
// Clipy Studio: montage builder, social exports (9:16 / 1:1 / slow-mo) and auto-highlight detection.
const { spawn } = require('child_process');

module.exports = function createStudio({ ffmpegPath, ffmpeg, encoderArgs, pixFmt, fps }) {
  // runs ffmpeg and returns full stderr (for probing / analysis)
  function run(args, timeout = 10 * 60 * 1000) {
    return new Promise((resolve, reject) => {
      const p = spawn(ffmpegPath, args, { windowsHide: true });
      let err = '';
      p.stderr.on('data', (d) => { err += d.toString(); });
      const t = setTimeout(() => p.kill('SIGKILL'), timeout);
      p.on('error', (e) => { clearTimeout(t); reject(e); });
      p.on('close', (code) => { clearTimeout(t); resolve({ code, err }); });
    });
  }

  async function probe(file) {
    const { err } = await run(['-hide_banner', '-i', file], 30000);
    const d = err.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    const v = err.match(/Stream #\d+:\d+.*Video:.*?(\d{2,5})x(\d{2,5})/);
    return {
      duration: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0,
      hasAudio: /Stream #\d+:\d+.*Audio:/.test(err),
      width: v ? Number(v[1]) : 1920,
      height: v ? Number(v[2]) : 1080,
    };
  }

  // ── montage: clips joined with transitions
  const TRANSITIONS = ['fade', 'fadeblack', 'dissolve', 'slideleft', 'circleopen', 'wipeleft', 'none'];
  async function montage(files, out, { transition = 'fade', duration = 0.6 } = {}) {
    if (files.length < 2) throw new Error('Pick at least 2 clips');
    if (!TRANSITIONS.includes(transition)) transition = 'fade';
    const info = await Promise.all(files.map(probe));
    const W = 1920, H = 1080, F = fps();
    const T = transition === 'none' ? 0 : Math.min(duration, Math.min(...info.map((i) => i.duration)) / 3);
    const args = ['-y', '-hide_banner', '-loglevel', 'error'];
    files.forEach((f) => args.push('-i', f));
    // silent audio for clips that have none
    const silentIdx = {};
    info.forEach((inf, i) => {
      if (!inf.hasAudio) { silentIdx[i] = files.length + Object.keys(silentIdx).length; args.push('-f', 'lavfi', '-t', inf.duration.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo'); }
    });
    let fc = '';
    info.forEach((inf, i) => {
      fc += `[${i}:v:0]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${F},format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[v${i}];`;
      const a = inf.hasAudio ? `${i}:a:0` : `${silentIdx[i]}:a:0`;
      fc += `[${a}]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${i}];`;
    });
    if (T === 0) {
      fc += info.map((_, i) => `[v${i}][a${i}]`).join('') + `concat=n=${info.length}:v=1:a=1[vo][ao]`;
    } else {
      let vPrev = 'v0', aPrev = 'a0', acc = info[0].duration;
      for (let i = 1; i < info.length; i++) {
        const offset = Math.max(0, acc - T);
        const vOut = i === info.length - 1 ? 'vo' : `vx${i}`;
        const aOut = i === info.length - 1 ? 'ao' : `ax${i}`;
        fc += `[${vPrev}][v${i}]xfade=transition=${transition}:duration=${T.toFixed(3)}:offset=${offset.toFixed(3)}[${vOut}];`;
        fc += `[${aPrev}][a${i}]acrossfade=d=${T.toFixed(3)}[${aOut}];`;
        vPrev = vOut; aPrev = aOut;
        acc = offset + info[i].duration;
      }
      fc = fc.replace(/;$/, '');
    }
    const enc = encoderArgs();
    const fmtFix = pixFmt() === 'nv12' ? ['-pix_fmt', 'nv12'] : [];
    const base = [...args, '-filter_complex', fc, '-map', '[vo]', '-map', '[ao]'];
    try {
      await ffmpeg([...base, ...enc, ...fmtFix, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
    } catch {
      await ffmpeg([...base, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
    }
    const total = info.reduce((s, i) => s + i.duration, 0) - T * (info.length - 1);
    return { duration: total };
  }

  // ── social export: vertical 9:16 / square 1:1 with blurred background, optional slow-mo / speed-up
  async function socialExport(file, out, { format = 'vertical', speed = 1, a = 0, b = 0 } = {}) {
    const inf = await probe(file);
    const start = Math.max(0, a || 0);
    const end = b && b > start ? Math.min(b, inf.duration) : inf.duration;
    const sizes = { vertical: [1080, 1920], square: [1080, 1080], original: null };
    const size = sizes[format] === undefined ? sizes.vertical : sizes[format];
    let v;
    if (size) {
      const [W, H] = size;
      v = `[0:v:0]split[s1][s2];[s1]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:3,eq=brightness=-0.18:saturation=0.6[bg];`
        + `[s2]scale=${W}:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`;
    } else {
      v = '[0:v:0]null';
    }
    const sp = [0.25, 0.5, 1, 1.5, 2].includes(Number(speed)) ? Number(speed) : 1;
    if (sp !== 1) v += `,setpts=${(1 / sp).toFixed(4)}*PTS`;
    v += `,fps=${fps()},format=yuv420p[vo]`;
    let aChain = '';
    if (inf.hasAudio) {
      const tempos = sp === 0.25 ? ['atempo=0.5', 'atempo=0.5'] : sp === 1 ? [] : [`atempo=${sp}`];
      aChain = `;[0:a:0]${tempos.length ? tempos.join(',') : 'anull'}[ao]`;
    }
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-ss', start.toFixed(3), '-t', (end - start).toFixed(3), '-i', file,
      '-filter_complex', v + aChain, '-map', '[vo]'];
    if (inf.hasAudio) args.push('-map', '[ao]', '-c:a', 'aac', '-b:a', '192k');
    // social platforms prefer H.264 high quality, libx264 is the most compatible choice here
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-profile:v', 'high', '-movflags', '+faststart', out);
    await ffmpeg(args);
    return { duration: (end - start) / sp };
  }

  // ── auto-highlight: loudest moments by momentary loudness (EBU R128)
  async function highlights(file, { count = 3, before = 5, after = 3 } = {}) {
    const inf = await probe(file);
    if (!inf.hasAudio) throw new Error('This clip has no sound to analyze');
    const { err } = await run(['-hide_banner', '-nostats', '-loglevel', 'verbose', '-i', file, '-vn', '-af', 'ebur128=framelog=verbose', '-f', 'null', '-'], 5 * 60 * 1000);
    const pts = [];
    const re = /\bt:\s*([\d.]+)\s+TARGET:.*?M:\s*(-?[\d.]+|-?inf)/g;
    let m;
    while ((m = re.exec(err))) {
      const t = Number(m[1]); const M = m[2] === '-inf' ? -120 : Number(m[2]);
      if (Number.isFinite(t)) pts.push({ t, M });
    }
    if (!pts.length) throw new Error('Could not analyze the audio');
    // smooth over ~0.5 s and compare against the clip's median loudness
    const smooth = pts.map((p, i) => {
      const win = pts.slice(Math.max(0, i - 2), i + 3);
      return { t: p.t, M: win.reduce((s, x) => s + x.M, 0) / win.length };
    });
    const sorted = [...smooth].map((p) => p.M).sort((x, y) => x - y);
    const median = sorted[Math.floor(sorted.length / 2)];
    const picks = [];
    for (const p of [...smooth].sort((x, y) => y.M - x.M)) {
      if (picks.length >= count) break;
      if (picks.some((q) => Math.abs(q.t - p.t) < before + after)) continue;
      picks.push(p);
    }
    return {
      duration: inf.duration,
      moments: picks.sort((x, y) => x.t - y.t).map((p) => ({
        t: Math.max(0, p.t - 0.2),
        a: Math.max(0, p.t - before),
        b: Math.min(inf.duration, p.t + after),
        boost: Math.round((p.M - median) * 10) / 10,
      })),
    };
  }

  return { probe, montage, socialExport, highlights, TRANSITIONS };
};
