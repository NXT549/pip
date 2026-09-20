'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const clicks = require('../src/main/clicks.js');

const T0 = 1758000000000;

/** Click at each offset in turn, returning every pattern that came back. */
function sequence(offsets, state) {
  let s = state || clicks.createState();
  const patterns = [];
  for (const offset of offsets) {
    const out = clicks.record(s, T0 + offset);
    s = out.state;
    patterns.push(out.pattern);
  }
  return { state: s, patterns: patterns };
}

test('one click on its own is a single', () => {
  const out = clicks.record(clicks.createState(), T0);
  assert.strictEqual(out.pattern, 'single');
});

test('two clicks inside the double window are a double', () => {
  const { patterns } = sequence([0, 120]);
  assert.deepStrictEqual(patterns, ['single', 'double']);
});

test('two clicks either side of the window are two singles', () => {
  const { patterns } = sequence([0, clicks.DOUBLE_MS + 40]);
  assert.deepStrictEqual(patterns, ['single', 'single']);
});

test('a triple does not fire the double action twice', () => {
  // The click that closed a double cannot also open the next one.
  const { patterns } = sequence([0, 100, 200]);
  assert.deepStrictEqual(patterns, ['single', 'double', 'single']);
});

test('five clicks in quick succession annoy him', () => {
  const { patterns } = sequence([0, 100, 200, 300, 400]);
  assert.strictEqual(patterns[patterns.length - 1], 'rapid');
  assert.strictEqual(patterns.filter((p) => p === 'rapid').length, 1);
});

test('five slow clicks are not rapid', () => {
  const { patterns } = sequence([0, 500, 1000, 1500, 2000]);
  assert.deepStrictEqual(patterns, ['single', 'single', 'single', 'single', 'single']);
});

test('five clicks spread just past the rapid window are not rapid', () => {
  const span = clicks.RAPID_MS + 100;
  const step = span / (clicks.RAPID_COUNT - 1);
  const { patterns } = sequence([0, step, step * 2, step * 3, step * 4]);
  assert.ok(patterns.indexOf('rapid') === -1);
});

test('he reacts to a spree once, then re-arms', () => {
  // Ten clicks at 100ms: rapid on the fifth, history cleared, rapid again on
  // the tenth - not on every click in between.
  const { patterns } = sequence([0, 100, 200, 300, 400, 500, 600, 700, 800, 900]);
  assert.deepStrictEqual(
    patterns.map((p) => (p === 'rapid' ? 'R' : '.')).join(''),
    '....R....R'
  );
});

test('the click after a spree starts from scratch', () => {
  const spree = sequence([0, 100, 200, 300, 400]);
  assert.strictEqual(spree.patterns[4], 'rapid');
  assert.deepStrictEqual(spree.state.times, []);

  const next = clicks.record(spree.state, T0 + 5000);
  assert.strictEqual(next.pattern, 'single');
});

test('history stays bounded however long Pip has been up', () => {
  let s = clicks.createState();
  for (let i = 0; i < 2000; i += 1) {
    s = clicks.record(s, T0 + i * 5000).state;      // slow, deliberate clicks
    assert.ok(s.times.length <= clicks.MAX_HISTORY);
  }
  assert.ok(s.times.length <= clicks.MAX_HISTORY);

  let fast = clicks.createState();
  for (let i = 0; i < 2000; i += 1) {
    fast = clicks.record(fast, T0 + i * 40).state;  // hammering
    assert.ok(fast.times.length <= clicks.MAX_HISTORY);
  }
});

test('a clock jump backwards throws the history away instead of misreading it', () => {
  let s = clicks.createState();
  s = clicks.record(s, T0 + 10000).state;
  const out = clicks.record(s, T0);
  assert.strictEqual(out.pattern, 'single');
  assert.deepStrictEqual(out.state.times, [T0]);
});

test('record never mutates the state it was given', () => {
  const s = clicks.createState();
  s.times.push(T0);
  const before = s.times.slice();
  clicks.record(s, T0 + 100);
  assert.deepStrictEqual(s.times, before);
});
