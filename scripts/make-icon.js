// Generates Clipy's monochrome icons (no external deps).
// Mark: black rounded square, white open ring ("C" / shutter) with a centre dot.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Returns [r,g,b,a] in 0..1 for a point in unit space (0..1).
function shade(x, y, { background = true } = {}) {
  const cx = 0.5, cy = 0.5;
  // rounded square
  const r = 0.225, m = 0.0;
  const qx = Math.max(Math.abs(x - cx) - (0.5 - m - r), 0);
  const qy = Math.max(Math.abs(y - cy) - (0.5 - m - r), 0);
  const inSquare = Math.hypot(qx, qy) <= r;
  if (!inSquare) return [0, 0, 0, 0];
  const dx = x - cx, dy = y - cy;
  const d = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx) * 180 / Math.PI; // 0 = right
  const ring = d >= 0.205 && d <= 0.305 && !(ang > -38 && ang < 38);
  // round the ring ends
  const capR = 0.05, capD = 0.255;
  const a1 = 38 * Math.PI / 180;
  const c1 = Math.hypot(dx - capD * Math.cos(a1), dy - capD * Math.sin(a1)) <= capR;
  const c2 = Math.hypot(dx - capD * Math.cos(-a1), dy - capD * Math.sin(-a1)) <= capR;
  const dot = d <= 0.085;
  const white = ring || c1 || c2 || dot;
  if (white) return [1, 1, 1, 1];
  return background ? [0, 0, 0, 1] : [0, 0, 0, 0];
}

function render(size, opts) {
  const ss = 4;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const [pr, pg, pb, pa] = shade((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size, opts);
        r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
      }
      const n = ss * ss;
      const i = (y * size + x) * 4;
      buf[i] = a ? Math.round((r / a) * 255) : 0;
      buf[i + 1] = a ? Math.round((g / a) * 255) : 0;
      buf[i + 2] = a ? Math.round((b / a) * 255) : 0;
      buf[i + 3] = Math.round((a / n) * 255);
    }
  }
  return encodePNG(size, size, buf);
}

const root = path.join(__dirname, '..');
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
fs.writeFileSync(path.join(root, 'build', 'icon.png'), render(512));
fs.writeFileSync(path.join(root, 'assets', 'icon.png'), render(256));
fs.writeFileSync(path.join(root, 'assets', 'tray.png'), render(32));
console.log('icons written');
