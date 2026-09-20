#!/usr/bin/env node
/*
 * make-icons.js - renders Pip into every icon size the app needs.
 *
 * There is no image library here and no native dependency: PNGs are encoded
 * by hand on top of Node's zlib, and the .ico is a plain container holding
 * those PNGs (PNG-in-ICO, which Windows has understood since Vista).
 *
 * Outputs:
 *   assets/icon-{16,32,48,64,128,256}.png
 *   assets/tray.png, assets/tray@2x.png
 *   build/icon.ico
 *
 * Runs automatically as a predist step; also available as `npm run icons`.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const Palettes = require('../src/renderer/palettes.js');
const Sprites = require('../src/renderer/sprites.js');

const ROOT = path.join(__dirname, '..');
const ICON_SIZES = [16, 32, 48, 64, 128, 256];
/** Windows tray icons are small; 256 in the .ico would just bloat it. */
const ICO_SIZES = [16, 32, 48, 64, 128, 256];
const SOURCE_FRAME = 'idle_0';
const SOURCE_FLAVOR = 'cherry';

/* ------------------------------------------------------------------ *
 * PNG encoding
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * @param {Uint8Array} rgba  width*height*4
 */
function encodePNG(rgba, width, height) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: truecolour with alpha
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  // Each scanline is prefixed with its filter type; 0 (None) keeps this simple
  // and these images are tiny, so the compression loss does not matter.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ------------------------------------------------------------------ *
 * ICO container
 * ------------------------------------------------------------------ */

function encodeICO(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);             // reserved
  header.writeUInt16LE(1, 2);             // type 1 = icon
  header.writeUInt16LE(images.length, 4);

  const dir = Buffer.alloc(16 * images.length);
  let offset = header.length + dir.length;
  images.forEach((img, i) => {
    const b = i * 16;
    dir[b] = img.size >= 256 ? 0 : img.size;      // 0 means 256
    dir[b + 1] = img.size >= 256 ? 0 : img.size;
    dir[b + 2] = 0;                                // palette size
    dir[b + 3] = 0;                                // reserved
    dir.writeUInt16LE(1, b + 4);                   // colour planes
    dir.writeUInt16LE(32, b + 6);                  // bits per pixel
    dir.writeUInt32LE(img.data.length, b + 8);
    dir.writeUInt32LE(offset, b + 12);
    offset += img.data.length;
  });

  return Buffer.concat([header, dir].concat(images.map((i) => i.data)));
}

/* ------------------------------------------------------------------ *
 * Rasterising Pip
 * ------------------------------------------------------------------ */

function hexToRGB(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
  ];
}

/** The sprite frame as an RGBA buffer, cropped to Pip's bounding box. */
function frameToRGBA(frameName, flavor) {
  const rows = Sprites.FRAMES[frameName];
  if (!rows) throw new Error('no such frame: ' + frameName);
  const palette = Palettes.resolve(flavor);
  const N = Sprites.FRAME_SIZE;

  let minR = N, maxR = -1, minC = N, maxC = -1;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (rows[r][c] === Palettes.TRANSPARENT) continue;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
    }
  }
  if (maxR < 0) throw new Error('frame is empty: ' + frameName);

  const w = maxC - minC + 1;
  const h = maxR - minR + 1;
  const out = new Uint8Array(w * h * 4);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const ch = rows[minR + r][minC + c];
      const i = (r * w + c) * 4;
      if (ch === Palettes.TRANSPARENT) continue;
      const color = palette[ch];
      if (!color) continue;
      const [rr, gg, bb] = hexToRGB(color);
      out[i] = rr; out[i + 1] = gg; out[i + 2] = bb; out[i + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

/**
 * Fit `src` into a square of `size`, preserving aspect and leaving a small
 * margin. Upscaling is nearest-neighbour so the pixel art stays crisp;
 * downscaling box-averages, which keeps a 16px tray icon legible.
 */
function resizeToSquare(src, size) {
  const margin = size <= 16 ? 0 : Math.round(size * 0.06);
  const avail = size - margin * 2;
  const scale = Math.min(avail / src.width, avail / src.height);
  const dw = Math.max(1, Math.round(src.width * scale));
  const dh = Math.max(1, Math.round(src.height * scale));
  const offX = Math.floor((size - dw) / 2);
  const offY = Math.floor((size - dh) / 2);

  const out = new Uint8Array(size * size * 4);
  const upscaling = scale >= 1;

  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      if (upscaling) {
        const sx = Math.min(src.width - 1, Math.floor((x / dw) * src.width));
        const sy = Math.min(src.height - 1, Math.floor((y / dh) * src.height));
        const si = (sy * src.width + sx) * 4;
        r = src.data[si]; g = src.data[si + 1]; b = src.data[si + 2]; a = src.data[si + 3];
      } else {
        const x0 = (x / dw) * src.width;
        const x1 = ((x + 1) / dw) * src.width;
        const y0 = (y / dh) * src.height;
        const y1 = ((y + 1) / dh) * src.height;
        let wsum = 0;
        for (let sy = Math.floor(y0); sy < Math.min(src.height, Math.ceil(y1)); sy++) {
          for (let sx = Math.floor(x0); sx < Math.min(src.width, Math.ceil(x1)); sx++) {
            const si = (sy * src.width + sx) * 4;
            const sa = src.data[si + 3] / 255;
            // premultiply so transparent pixels do not wash out the colour
            r += src.data[si] * sa; g += src.data[si + 1] * sa; b += src.data[si + 2] * sa;
            a += src.data[si + 3];
            wsum += sa;
            }
        }
        const count = Math.max(1, (Math.ceil(x1) - Math.floor(x0)) * (Math.ceil(y1) - Math.floor(y0)));
        a = a / count;
        if (wsum > 0) { r = r / wsum; g = g / wsum; b = b / wsum; } else { r = g = b = 0; }
      }

      const di = ((y + offY) * size + (x + offX)) * 4;
      if (di < 0 || di + 3 >= out.length) continue;
      out[di] = Math.round(r);
      out[di + 1] = Math.round(g);
      out[di + 2] = Math.round(b);
      out[di + 3] = Math.round(a);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

function main() {
  const assets = path.join(ROOT, 'assets');
  const build = path.join(ROOT, 'build');
  fs.mkdirSync(assets, { recursive: true });
  fs.mkdirSync(build, { recursive: true });

  const src = frameToRGBA(SOURCE_FRAME, SOURCE_FLAVOR);
  const written = [];

  const pngBySize = {};
  for (const size of ICON_SIZES) {
    const rgba = resizeToSquare(src, size);
    const png = encodePNG(rgba, size, size);
    pngBySize[size] = png;
    const file = path.join(assets, 'icon-' + size + '.png');
    fs.writeFileSync(file, png);
    written.push(path.relative(ROOT, file));
  }

  // Tray images. Electron picks tray@2x.png automatically on hi-dpi displays.
  fs.writeFileSync(path.join(assets, 'tray.png'), pngBySize[16]);
  fs.writeFileSync(path.join(assets, 'tray@2x.png'), pngBySize[32]);
  written.push('assets/tray.png', 'assets/tray@2x.png');

  const ico = encodeICO(ICO_SIZES.map((size) => ({ size: size, data: pngBySize[size] })));
  const icoFile = path.join(build, 'icon.ico');
  fs.writeFileSync(icoFile, ico);
  written.push(path.relative(ROOT, icoFile));

  console.log('icons written from ' + SOURCE_FRAME + ' (' + SOURCE_FLAVOR + '):');
  for (const f of written) console.log('  ' + f.replace(/\\/g, '/'));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('icon generation failed: ' + err.message);
    process.exit(1);
  }
}

module.exports = { encodePNG, encodeICO, frameToRGBA, resizeToSquare, crc32 };
