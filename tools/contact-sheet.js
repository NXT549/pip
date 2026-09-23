#!/usr/bin/env node
/*
 * contact-sheet.js - every frame of Pip on one PNG, for looking at.
 *
 * Pixel art has to be judged by eye; a passing test says nothing about
 * whether a pose reads. This lays frames out on a grid and writes a PNG.
 *
 *   node tools/contact-sheet.js                       every clip, one row each
 *   node tools/contact-sheet.js --specs a b c         straight from frame-specs.js
 *                                                     (no need to regenerate first)
 *   node tools/contact-sheet.js --types               the idle pose of every Pip type
 *   node tools/contact-sheet.js --clips walk,run      only these clips
 *
 * Options:
 *   --type <id>      which Pip to draw (default cherry)
 *   --scale <n>      pixels per art pixel (default 4)
 *   --look dx,dy     eyes toward a direction      --blink   mid-blink
 *   --dark           dark background instead of light
 *   --out <file>     where to write (default contact-sheet.png)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { encodePNG } = require('../scripts/png.js');
const Palettes = require('../src/renderer/palettes.js');
const Compose = require('../src/renderer/compose.js');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

function listAfter(name) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return null;
  const out = [];
  for (let j = i + 1; j < process.argv.length && !process.argv[j].startsWith('--'); j++) out.push(process.argv[j]);
  return out;
}

const scale = Number(arg('scale', 4));
const typeId = arg('type', 'cherry');
const outFile = arg('out', 'contact-sheet.png');
const dark = !!arg('dark', false);
const blink = !!arg('blink', false);
const lookArg = arg('look', null);
const look = typeof lookArg === 'string' ? { dx: Number(lookArg.split(',')[0]), dy: Number(lookArg.split(',')[1]) } : null;

/** rows: array of arrays of {rows, palette} cells */
function buildSheet() {
  const specNames = listAfter('specs');
  const Pips = safeRequire('../src/renderer/pips.js');
  const type = Pips && Pips.BY_ID ? Pips.BY_ID[typeId] : null;
  const palette = Palettes.resolve(type ? type.palette : typeId);

  if (specNames) {
    const gen = require('./gen-sprites.js');
    const { specs } = require('./frame-specs.js');
    const names = specNames.length ? specNames : Object.keys(specs);
    const cells = names.map((n) => {
      if (!specs[n]) throw new Error('no such spec: ' + n);
      const res = gen.composeFrame(specs[n]);
      return { rows: Compose.composeRows(res.rows, res.meta, { type: type, look: look, blink: blink }), palette: palette, name: n };
    });
    return chunkRows(cells, 8);
  }

  const Sprites = require('../src/renderer/sprites.js');
  if (arg('types', false)) {
    if (!Pips) throw new Error('pips.js is not there yet');
    const cells = Pips.TYPES.map((t) => ({
      rows: Compose.compose('idle_0', { type: t, look: look, blink: blink }),
      palette: Palettes.resolve(t.palette),
      name: t.id
    }));
    return chunkRows(cells, 10);
  }

  const Animations = require('../src/renderer/animations.js');
  const only = arg('clips', null);
  const clips = typeof only === 'string' ? only.split(',') : Animations.CLIP_NAMES;
  return clips.map((clip) => {
    const c = Animations.CLIPS[clip];
    if (!c) throw new Error('no such clip: ' + clip);
    // one cell per distinct frame, in order
    const seen = [];
    for (const f of c.frames) if (seen.indexOf(f) === -1) seen.push(f);
    return seen.map((f) => ({
      rows: Compose.compose(f, { type: type, look: look, blink: blink }) || Sprites.FRAMES[f],
      palette: palette,
      name: clip + ':' + f
    }));
  });
}

function chunkRows(cells, per) {
  const out = [];
  for (let i = 0; i < cells.length; i += per) out.push(cells.slice(i, i + per));
  return out;
}

function safeRequire(p) {
  try { return require(p); } catch (err) { return null; }
}

function main() {
  const grid = buildSheet();
  const N = 64;
  const cell = N * scale;
  const gap = 4 * scale > 8 ? 8 : 4;
  const cols = Math.max.apply(null, grid.map((r) => r.length));
  const W = cols * (cell + gap) + gap;
  const H = grid.length * (cell + gap) + gap;
  const img = new Uint8Array(W * H * 4);
  const bg = dark ? [34, 30, 44] : [236, 232, 242];
  const cellBg = dark ? [48, 44, 60] : [214, 210, 224];
  for (let i = 0; i < W * H; i++) { img[i * 4] = bg[0]; img[i * 4 + 1] = bg[1]; img[i * 4 + 2] = bg[2]; img[i * 4 + 3] = 255; }

  const names = [];
  grid.forEach((row, ri) => {
    row.forEach((item, ci) => {
      const x0 = gap + ci * (cell + gap);
      const y0 = gap + ri * (cell + gap);
      const rgba = Compose.toRGBA(item.rows, item.palette);
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          const sx = Math.floor(x / scale), sy = Math.floor(y / scale);
          const si = (sy * N + sx) * 4;
          const di = ((y0 + y) * W + (x0 + x)) * 4;
          if (rgba[si + 3]) {
            img[di] = rgba[si]; img[di + 1] = rgba[si + 1]; img[di + 2] = rgba[si + 2];
          } else {
            img[di] = cellBg[0]; img[di + 1] = cellBg[1]; img[di + 2] = cellBg[2];
          }
        }
      }
      names.push('[' + ri + ',' + ci + '] ' + item.name);
    });
  });

  fs.writeFileSync(outFile, encodePNG(img, W, H));
  console.log('wrote ' + path.resolve(outFile) + ' (' + W + 'x' + H + ')');
  if (arg('list', false)) console.log(names.join('\n'));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('contact sheet failed: ' + err.message);
    process.exit(1);
  }
}
