'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const mood = require('../src/main/mood.js');

const HOUR = 60 * 60 * 1000;
const T0 = 1758000000000;

test('the default is the documented 60', () => {
  assert.strictEqual(mood.DEFAULT_MOOD, 60);
});

test('every kind of attention raises the mood', () => {
  for (const event of ['pet', 'snack', 'water', 'break', 'pomodoro']) {
    assert.ok(mood.apply(50, event) > 50, event + ' should raise the mood');
  }
});

test('an unknown event changes nothing', () => {
  assert.strictEqual(mood.apply(50, 'shrug'), 50);
  assert.strictEqual(mood.apply(50, undefined), 50);
});

test('the mood is clamped at 100 and at 0', () => {
  assert.strictEqual(mood.apply(98, 'pomodoro'), 100);
  assert.strictEqual(mood.apply(100, 'snack'), 100);
  assert.strictEqual(mood.apply(-40, 'pet'), 0);
  assert.strictEqual(mood.apply(0, 'nothing'), 0);
});

test('nonsense in gives the default back, not NaN', () => {
  assert.strictEqual(mood.apply(NaN, 'pet'), mood.DEFAULT_MOOD + mood.EVENTS.pet);
  assert.strictEqual(mood.apply('sixty', 'pet'), mood.DEFAULT_MOOD + mood.EVENTS.pet);
});

test('being ignored for hours lets the mood drift down', () => {
  assert.strictEqual(mood.decay(60, T0, T0 + 3 * HOUR), 60 - 3 * mood.DECAY_PER_HOUR);
  assert.ok(mood.decay(80, T0, T0 + HOUR) < 80);

  // gentle: a whole working day must not flatten him
  assert.ok(mood.decay(90, T0, T0 + 8 * HOUR) > 60);
});

test('a few minutes of inattention barely registers', () => {
  const after = mood.decay(60, T0, T0 + 5 * 60 * 1000);
  assert.ok(after > 59.8 && after < 60);
});

test('decay over an enormous gap stops at the floor, never below zero', () => {
  assert.strictEqual(mood.decay(100, T0, T0 + 10000 * HOUR), mood.MOOD_FLOOR);
  assert.ok(mood.MOOD_FLOOR > 0);
  assert.ok(mood.decay(100, T0, T0 + 10000 * HOUR) >= 0);

  // already at or under the floor: leave him where he is, do not push further
  assert.strictEqual(mood.decay(10, T0, T0 + 50 * HOUR), 10);
});

test('decay is a no-op without a usable timestamp', () => {
  assert.strictEqual(mood.decay(70, 0, T0), 70);
  assert.strictEqual(mood.decay(70, T0, T0), 70);
  assert.strictEqual(mood.decay(70, T0, T0 - HOUR), 70);   // clock went backwards
});

test('bands map the way lines.js and brain.js expect', () => {
  assert.strictEqual(mood.band(0), 'low');
  assert.strictEqual(mood.band(20), 'low');
  assert.strictEqual(mood.band(mood.BANDS.low - 0.1), 'low');
  assert.strictEqual(mood.band(mood.BANDS.low), 'neutral');
  assert.strictEqual(mood.band(60), 'neutral');
  assert.strictEqual(mood.band(mood.BANDS.high), 'neutral');
  assert.strictEqual(mood.band(mood.BANDS.high + 0.1), 'high');
  assert.strictEqual(mood.band(100), 'high');
});

test('a mopey Pip is still a working Pip', () => {
  // Neglect can make him mopey and no worse: the floor sits in the low band,
  // but well clear of zero.
  assert.ok(mood.MOOD_FLOOR >= 20);
  assert.strictEqual(mood.band(mood.MOOD_FLOOR), 'low');
});

test('attention after a long absence brings him straight back', () => {
  let m = mood.decay(80, T0, T0 + 500 * HOUR);   // a fortnight away
  assert.strictEqual(m, mood.MOOD_FLOOR);
  m = mood.apply(m, 'snack');
  m = mood.apply(m, 'pomodoro');
  assert.ok(m > mood.MOOD_FLOOR);
  assert.ok(m <= 100);
});
