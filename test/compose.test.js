/*
 * compose.test.js - dressing a stored frame up as the Pip you see.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const Compose = require('../src/renderer/compose.js');
const Sprites = require('../src/renderer/sprites.js');
const Pips = require('../src/renderer/pips.js');
const Palettes = require('../src/renderer/palettes.js');

const SIZE = Sprites.FRAME_SIZE;

function diff(a, b) {
  const out = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) if (a[r][c] !== b[r][c]) out.push([r, c, a[r][c], b[r][c]]);
  }
  return out;
}

test('composing with no options gives the stored frame back', () => {
  for (const name of ['idle_0', 'walk_3', 'climb_0', 'sleeping_1_cap']) {
    assert.deepStrictEqual(Compose.compose(name), Sprites.FRAMES[name], name);
  }
  assert.strictEqual(Compose.compose('no-such-frame'), null);
});

test('a pattern only ever touches body pixels', () => {
  const plain = Sprites.FRAMES.idle_0;
  for (const id of ['licorice', 'watermelon', 'galaxy', 'neon', 'candycane']) {
    // the pattern alone: traits add pixels of their own, checked elsewhere
    const rows = Compose.compose('idle_0', { type: Object.assign({}, Pips.BY_ID[id], { trait: null }) });
    for (const [r, c, from, to] of diff(plain, rows)) {
      if ('XxYZ'.indexOf(to) === -1) continue;   // traits may add other keys
      assert.ok('BLDdh'.indexOf(from) !== -1, id + ' painted over "' + from + '" at ' + r + ',' + c);
    }
  }
});

test('a pattern never paints the legs', () => {
  const rows = Compose.compose('idle_0', { type: Pips.BY_ID.candycane });
  // the bottom rows are nothing but legs and feet
  for (let r = 58; r < SIZE; r++) assert.ok(rows[r].indexOf('X') === -1 && rows[r].indexOf('x') === -1, 'row ' + r);
});

test('a crown trait sits above the head, and never on the face', () => {
  const rows = Compose.compose('idle_0', { type: Pips.BY_ID.cherry });
  const changed = diff(Sprites.FRAMES.idle_0, rows);
  assert.ok(changed.length > 10, 'the stem was not drawn');
  for (const [r, , from] of changed) {
    assert.ok(r < Sprites.FRAME_META.idle_0.eyes[0].r, 'trait pixel below the eyes at row ' + r);
    assert.ok('EWeKkM'.indexOf(from) === -1, 'trait painted over the face');
  }
});

test('traits at the ends appear on both ends', () => {
  const rows = Compose.compose('idle_0', { type: Pips.BY_ID.lemon });
  const changed = diff(Sprites.FRAMES.idle_0, rows);
  const cols = changed.map((d) => d[1]);
  assert.ok(Math.min.apply(null, cols) < 16 && Math.max.apply(null, cols) > 48, 'nubs should be at both ends');
});

test('traits are skipped while Pip wears a hat', () => {
  const capped = Compose.compose('sleeping_0_cap', { type: Pips.BY_ID.cherry });
  assert.deepStrictEqual(capped, Sprites.FRAMES.sleeping_0_cap);
});

test('traits turn with a climbing Pip', () => {
  const rows = Compose.compose('climb_0', { type: Pips.BY_ID.cherry });
  assert.ok(diff(Sprites.FRAMES.climb_0, rows).length > 10, 'the stem vanished on the wall');
});

test('looking moves the eyes and nothing else', () => {
  const base = Sprites.FRAMES.idle_0;
  for (const look of [{ dx: 1, dy: 0 }, { dx: -1, dy: -1 }, { dx: 0, dy: 1 }]) {
    const rows = Compose.compose('idle_0', { look: look });
    const changed = diff(base, rows);
    assert.ok(changed.length > 0, JSON.stringify(look) + ' changed nothing');
    for (const [r, c] of changed) {
      const nearEye = Sprites.FRAME_META.idle_0.eyes.some((e) => r >= e.r - 1 && r <= e.r + 8 && c >= e.c - 1 && c <= e.c + 5);
      assert.ok(nearEye, 'pixel ' + r + ',' + c + ' changed outside the eyes');
    }
  }
});

test('a look never pushes an eye onto the outline', () => {
  for (const name of Sprites.FRAME_NAMES) {
    if (!Sprites.FRAME_META[name].eyes.length) continue;
    for (const dx of [-1, 1]) {
      for (const dy of [-1, 1]) {
        const rows = Compose.compose(name, { look: { dx: dx, dy: dy } });
        const outlineBefore = Sprites.FRAMES[name].join('').split('O').length;
        const outlineAfter = rows.join('').split('O').length;
        assert.strictEqual(outlineAfter, outlineBefore, name + ' lost outline pixels looking ' + dx + ',' + dy);
      }
    }
  }
});

test('a blink closes the eyes and restores the body under them', () => {
  const rows = Compose.compose('idle_0', { blink: true });
  const eyes = Sprites.FRAME_META.idle_0.eyes;
  // no bright eye shine left anywhere in the eye boxes
  for (const e of eyes) {
    for (let r = e.r; r < e.r + 7; r++) {
      for (let c = e.c; c < e.c + 5; c++) assert.notStrictEqual(rows[r][c], 'W', 'shine left at ' + r + ',' + c);
    }
  }
  const eyeInk = rows.join('').split('E').length - 1;
  assert.ok(eyeInk > 4 && eyeInk < 20, 'closed eyes are a thin line, got ' + eyeInk + ' pixels');
});

test('toRGBA paints exactly the opaque pixels', () => {
  const rows = Sprites.FRAMES.idle_0;
  const rgba = Compose.toRGBA(rows, Palettes.resolve('cherry'));
  let opaque = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i]) opaque++;
  const expected = rows.join('').replace(/\./g, '').length;
  assert.strictEqual(opaque, expected);
});

test('every type composes every frame without throwing', () => {
  for (const type of Pips.TYPES) {
    for (const name of ['idle_0', 'climb_2', 'roll_0', 'focus_0', 'lookatyou_0']) {
      const rows = Compose.compose(name, { type: type, look: { dx: 1, dy: -1 } });
      assert.strictEqual(rows.length, SIZE, type.id + '/' + name);
    }
  }
});
