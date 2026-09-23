/*
 * rhythm.test.js - typing, mousing, reading or away, from the idle timer
 * and whether the pointer moved. No hooks, so these are the only signals.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const rhythm = require('../src/main/rhythm.js');

/** Feed n one-second samples produced by fn(i) -> [idleS, moved]. */
function feed(state, start, n, fn) {
  let s = state;
  for (let i = 0; i < n; i++) {
    const [idle, moved] = fn(i);
    s = rhythm.sample(s, start + i * 1000, idle, moved);
  }
  return s;
}

test('too few samples is unknown', () => {
  const s = feed(rhythm.createState(), 0, 3, () => [0, false]);
  assert.strictEqual(s.mode, 'unknown');
});

test('busy with a still pointer is typing', () => {
  const s = feed(rhythm.createState(), 0, 15, () => [0, false]);
  assert.strictEqual(s.mode, 'typing');
});

test('a moving pointer is mousing', () => {
  const s = feed(rhythm.createState(), 0, 15, (i) => [0, i % 2 === 0]);
  assert.strictEqual(s.mode, 'mousing');
});

test('present but not touching anything is reading', () => {
  const s = feed(rhythm.createState(), 0, 15, (i) => [5 + i, false]);
  assert.strictEqual(s.mode, 'reading');
});

test('five minutes idle is away', () => {
  const s = feed(rhythm.createState(), 0, 10, (i) => [300 + i, false]);
  assert.strictEqual(s.mode, 'away');
});

test('the verdict only looks at the recent window', () => {
  // a minute of mousing, then typing: the typing wins once it fills the window
  let s = feed(rhythm.createState(), 0, 60, () => [0, true]);
  assert.strictEqual(s.mode, 'mousing');
  s = feed(s, 60000, 16, () => [0, false]);
  assert.strictEqual(s.mode, 'typing');
});

test('heldFor counts from the last change of mode', () => {
  let s = feed(rhythm.createState(), 0, 15, () => [0, false]);
  assert.strictEqual(s.mode, 'typing');
  const since = s.since;
  s = feed(s, 15000, 10, () => [0, false]);
  assert.strictEqual(s.since, since, 'the mode did not change, so neither did since');
  assert.ok(rhythm.heldFor(s, 25000) >= 10000);
});

test('history is bounded', () => {
  const s = feed(rhythm.createState(), 0, 500, () => [0, false]);
  assert.ok(s.samples.length <= 30);
});
