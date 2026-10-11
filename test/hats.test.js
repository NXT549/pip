/*
 * hats.test.js - the hats from ARCHITECTURE.md section 3.
 *
 * A hat is laid over every frame at runtime, so the things that matter are
 * that it lands on Pip's head in every pose, never covers his eyes, and only
 * uses colours it brings with it.
 *
 *   node --test test/hats.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const Hats = require('../src/renderer/hats.js');
const Sprites = require('../src/renderer/sprites.js');
const Palettes = require('../src/renderer/palettes.js');
const { specs } = require('../tools/frame-specs.js');
const { CHOICES, DEFAULTS, cleanPatch } = require('../src/main/storage.js');

const HEX = /^#[0-9a-f]{6}$/;
const WEARING = Hats.HAT_NAMES.filter((n) => n !== 'none');

function count(rows, ch) {
  return rows.join('').split(ch).length - 1;
}

test('the documented shape is there', () => {
  assert.strictEqual(Hats.HAT_NAMES[0], 'none');
  assert.strictEqual(Hats.DEFAULT_HAT, 'none');
  assert.ok(WEARING.length >= 3, 'Pip should have a few hats to choose from');
  assert.deepStrictEqual(CHOICES.hat, Hats.HAT_NAMES, 'storage offers different hats');
  assert.strictEqual(DEFAULTS.hat, Hats.DEFAULT_HAT);
});

test('every hat is a tidy grid that only uses outline and its own colours', () => {
  for (const name of WEARING) {
    const hat = Hats.HATS[name];
    assert.ok(hat.rows.length > 0 && hat.rows.length <= 8, name + ' is too tall');
    const w = hat.rows[0].length;
    assert.ok(w <= 11, name + ' is too wide');
    for (const row of hat.rows) assert.strictEqual(row.length, w, name + ' has a ragged row');
    for (const [key, color] of Object.entries(hat.colors)) {
      assert.match(key, /^[a-z]$/, name + ': colour keys must be lowercase, not palette keys');
      assert.match(color, HEX, name + '.' + key);
    }
    for (const ch of hat.rows.join('')) {
      assert.ok(ch === '.' || ch === 'O' || ch in hat.colors,
        name + ' uses "' + ch + '" without a colour for it');
    }
    assert.ok(hat.rows.join('').includes('O'), name + ' has no outline');
  }
});

test('a hat never changes a palette colour', () => {
  for (const name of Hats.HAT_NAMES) {
    for (const key of Object.keys(Hats.colors(name))) {
      assert.ok(!Palettes.isValidKey(key), name + ' overrides palette key ' + key);
    }
  }
  assert.deepStrictEqual(Hats.colors('no such hat'), {});
});

test('every hat sits on every pose without covering his eyes', () => {
  for (const name of WEARING) {
    const keys = Object.keys(Hats.HATS[name].colors);
    for (const frame of Sprites.FRAME_NAMES) {
      const rows = Sprites.FRAMES[frame];
      const before = rows.slice();
      const out = Hats.dress(rows, name, frame);
      assert.deepStrictEqual(rows, before, 'dress changed ' + frame + ' itself');
      assert.strictEqual(out.length, rows.length, frame);
      for (const row of out) assert.strictEqual(row.length, rows.length, frame);
      if (/_cap$/.test(frame)) {
        assert.strictEqual(out, rows, frame + ' already wears the nightcap');
        continue;
      }
      assert.ok(keys.some((k) => out.join('').includes(k)), name + ' is missing on ' + frame);
      assert.strictEqual(count(out, 'E'), count(rows, 'E'), name + ' covers an eye on ' + frame);
      assert.strictEqual(count(out, 'H'), count(rows, 'H'), name + ' covers the gloss on ' + frame);
    }
  }
});

test('an upright hat rests on the head, not in the air', () => {
  for (const name of WEARING) {
    for (const frame of Sprites.FRAME_NAMES) {
      if (/_cap$/.test(frame) || Hats.ROTATED.test(frame)) continue;
      const out = Hats.dress(Sprites.FRAMES[frame], name, frame);
      // The lowest row holding a hat colour must have Pip's body right below it.
      let low = -1;
      for (let r = 0; r < out.length; r++) if (/[a-z]/.test(out[r])) low = r;
      const touches = [...out[low]].some((ch, c) =>
        /[a-z]/.test(ch) && low + 1 < out.length && 'BLHDO'.includes(out[low + 1][c]));
      assert.ok(touches, name + ' floats above Pip on ' + frame);
    }
  }
});

test('the sideways frames Hats turns are exactly the rotated poses', () => {
  for (const [frame, spec] of Object.entries(specs)) {
    assert.strictEqual(Hats.ROTATED.test(frame), spec.rotate === -90,
      frame + ': hats.js and frame-specs.js disagree on whether it is sideways');
    assert.ok(spec.rotate !== 90, frame + ' turns the other way, which hats.js does not handle');
  }
});

test('on a finer art grid a hat is the same hat, just in finer pixels', () => {
  // Doubling the art grid must not move or resize a hat on screen: dressing
  // a frame drawn at 64x64 gives exactly the 32x32 result, doubled.
  const double = (rows) => rows.flatMap((row) => {
    const wide = [...row].map((ch) => ch + ch).join('');
    return [wide, wide];
  });
  for (const name of WEARING) {
    for (const frame of ['idle_0', 'sit_0', 'land_0', 'climb_0', 'juggle_1']) {
      const rows = Sprites.FRAMES[frame];
      assert.deepStrictEqual(Hats.dress(double(rows), name, frame),
        double(Hats.dress(rows, name, frame)), name + ' on a doubled ' + frame);
    }
  }
});

test('no hat, or an unknown one, leaves the frame alone', () => {
  const rows = Sprites.FRAMES.idle_0;
  assert.strictEqual(Hats.dress(rows, 'none', 'idle_0'), rows);
  assert.strictEqual(Hats.dress(rows, 'sombrero', 'idle_0'), rows);
  assert.strictEqual(Hats.dress(rows, undefined, 'idle_0'), rows);
});

test('a hand-edited hat is cleaned like any other choice', () => {
  assert.deepStrictEqual(cleanPatch({ hat: 'crown' }), { hat: 'crown' });
  assert.deepStrictEqual(cleanPatch({ hat: 'sombrero' }), {});
  assert.deepStrictEqual(cleanPatch({ hat: 3 }), {});
});
