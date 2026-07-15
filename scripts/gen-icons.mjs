// Generate the extension's PNG icons with zero dependencies.
//
// Draws a rounded LinkedIn-blue square with a white checkmark, supersampled 4x
// for antialiasing, and encodes PNGs by hand (zlib is built into Node).

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'icons');

const BLUE = [10, 102, 194];
const WHITE = [255, 255, 255];
const SS = 4; // supersampling factor

// ---- geometry helpers -----------------------------------------------------
function insideRoundedRect(px, py, size, r) {
  const nx = Math.min(Math.max(px, r), size - r);
  const ny = Math.min(Math.max(py, r), size - r);
  const dx = px - nx;
  const dy = py - ny;
  return dx * dx + dy * dy <= r * r;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy || 1;
  let t = (wx * vx + wy * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * vx;
  const cy = ay + t * vy;
  return Math.hypot(px - cx, py - cy);
}

// ---- render one icon at `size` px -----------------------------------------
function renderIcon(size) {
  const big = size * SS;
  const r = big * 0.2;
  const stroke = big * 0.06;

  // checkmark vertices (normalised → big px)
  const A = [0.27 * big, 0.54 * big];
  const B = [0.43 * big, 0.7 * big];
  const C = [0.74 * big, 0.32 * big];

  // premultiplied accumulation buffers for downsampling
  const out = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumA = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x * SS + sx + 0.5;
          const py = y * SS + sy + 0.5;
          let color = null;
          let alpha = 0;
          if (insideRoundedRect(px, py, big, r)) {
            const d = Math.min(
              distToSegment(px, py, A[0], A[1], B[0], B[1]),
              distToSegment(px, py, B[0], B[1], C[0], C[1])
            );
            color = d <= stroke ? WHITE : BLUE;
            alpha = 1;
          }
          if (alpha > 0) {
            sumR += color[0];
            sumG += color[1];
            sumB += color[2];
            sumA += 1;
          }
        }
      }
      const n = SS * SS;
      const a = sumA / n; // coverage 0..1
      const idx = (y * size + x) * 4;
      if (sumA > 0) {
        out[idx] = Math.round(sumR / sumA);
        out[idx + 1] = Math.round(sumG / sumA);
        out[idx + 2] = Math.round(sumB / sumA);
      }
      out[idx + 3] = Math.round(a * 255);
    }
  }
  return out;
}

// ---- PNG encoding ---------------------------------------------------------
const CRC_TABLE = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // raw scanlines with filter byte 0 per row
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---- main -----------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const rgba = renderIcon(size);
  const png = encodePng(rgba, size);
  writeFileSync(join(OUT_DIR, `icon-${size}.png`), png);
  console.log(`wrote icons/icon-${size}.png (${png.length} bytes)`);
}
