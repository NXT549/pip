'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const reminders = require('../src/main/reminders.js');

const SEC = 1000;
const MIN = 60 * SEC;
const T0 = 1758000000000;
const CFG = { waterInterval: 45 };

/**
 * Feed samples every `stepSec` seconds from `from` to `to`, all reporting the
 * same idle time - which is what a poll loop does while you are typing.
 */
function work(state, from, to, stepSec, idleSeconds) {
  const step = (stepSec || 10) * SEC;
  const idle = idleSeconds || 0;
  let s = state;
  for (let t = from; t <= to; t += step) {
    s = reminders.onIdleSample(s, idle, t).state;
  }
  return s;
}

/** Walk the idle counter up to `seconds`, one sample per 10s, as Windows does. */
function goIdle(state, from, seconds) {
  let s = state;
  let took = false;
  for (let i = 10; i <= seconds; i += 10) {
    const out = reminders.onIdleSample(s, i, from + i * SEC);
    s = out.state;
    took = took || out.tookBreak;
  }
  return { state: s, tookBreak: took };
}

test('work time accumulates across samples', () => {
  let s = reminders.createState();
  assert.strictEqual(reminders.continuousWorkMs(s, T0), 0);

  s = work(s, T0, T0 + 20 * MIN, 10, 0);
  assert.strictEqual(reminders.continuousWorkMs(s, T0 + 20 * MIN), 20 * MIN);

  // a short idle stretch is still working - you are reading, not gone
  s = work(s, T0 + 20 * MIN + 10 * SEC, T0 + 24 * MIN, 10, 120);
  assert.strictEqual(reminders.continuousWorkMs(s, T0 + 24 * MIN), 24 * MIN);
});

test('five minutes idle counts as a break and resets continuous work', () => {
  let s = work(reminders.createState(), T0, T0 + 30 * MIN, 10, 0);
  assert.strictEqual(reminders.continuousWorkMs(s, T0 + 30 * MIN), 30 * MIN);

  const out = goIdle(s, T0 + 30 * MIN, 300);
  s = out.state;
  assert.strictEqual(out.tookBreak, true);
  assert.strictEqual(reminders.continuousWorkMs(s, T0 + 35 * MIN), 0);

  // the streak is banked before it is wiped, and it ended at the last keypress
  assert.strictEqual(reminders.longestStreakMs(s), 30 * MIN);
});

test('tookBreak fires once, not on every sample of a long absence', () => {
  let s = work(reminders.createState(), T0, T0 + 10 * MIN, 10, 0);
  const first = reminders.onIdleSample(s, 300, T0 + 15 * MIN);
  assert.strictEqual(first.tookBreak, true);

  let again = first;
  for (let i = 1; i <= 10; i += 1) {
    again = reminders.onIdleSample(again.state, 300 + i * 10, T0 + 15 * MIN + i * 10 * SEC);
    assert.strictEqual(again.tookBreak, false);
  }
});

test('coming back from a break starts a fresh streak', () => {
  let s = work(reminders.createState(), T0, T0 + 30 * MIN, 10, 0);
  s = goIdle(s, T0 + 30 * MIN, 600).state;

  const back = T0 + 45 * MIN;
  s = reminders.onIdleSample(s, 0, back).state;
  assert.strictEqual(reminders.continuousWorkMs(s, back), 0);

  s = work(s, back + 10 * SEC, back + 5 * MIN, 10, 0);
  assert.strictEqual(reminders.continuousWorkMs(s, back + 5 * MIN), 5 * MIN);
  assert.strictEqual(reminders.longestStreakMs(s), 30 * MIN);
});

test('a suspend counts as a break', () => {
  let s = work(reminders.createState(), T0, T0 + 42 * MIN, 10, 0);
  s = reminders.onBreakEvent(s, T0 + 42 * MIN);

  assert.strictEqual(reminders.continuousWorkMs(s, T0 + 42 * MIN), 0);
  assert.strictEqual(reminders.longestStreakMs(s), 42 * MIN);
});

test('a lock-screen counts as a break', () => {
  let s = work(reminders.createState(), T0, T0 + 18 * MIN, 10, 0);
  s = reminders.onBreakEvent(s, T0 + 18 * MIN);

  assert.strictEqual(reminders.continuousWorkMs(s, T0 + 18 * MIN), 0);
  assert.strictEqual(reminders.longestStreakMs(s), 18 * MIN);

  // and unlocking picks up a brand new streak
  s = reminders.onIdleSample(s, 0, T0 + 25 * MIN).state;
  s = work(s, T0 + 25 * MIN, T0 + 27 * MIN, 10, 0);
  assert.strictEqual(reminders.continuousWorkMs(s, T0 + 27 * MIN), 2 * MIN);
});

test('an unexplained gap between samples is treated as a break', () => {
  // The poll loop stalled or the machine slept without telling us.
  let s = work(reminders.createState(), T0, T0 + 20 * MIN, 10, 0);
  const out = reminders.onIdleSample(s, 0, T0 + 50 * MIN);
  assert.strictEqual(out.tookBreak, true);
  assert.strictEqual(reminders.longestStreakMs(out.state), 20 * MIN);
  assert.strictEqual(reminders.continuousWorkMs(out.state, T0 + 50 * MIN), 0);
});

test('the longest streak keeps the best of the day', () => {
  let s = work(reminders.createState(), T0, T0 + 50 * MIN, 10, 0);
  s = reminders.onBreakEvent(s, T0 + 50 * MIN);
  s = reminders.onIdleSample(s, 0, T0 + 60 * MIN).state;
  s = work(s, T0 + 60 * MIN, T0 + 70 * MIN, 10, 0);
  s = reminders.onBreakEvent(s, T0 + 70 * MIN);

  assert.strictEqual(reminders.longestStreakMs(s), 50 * MIN);
});

test('water comes due after the configured ACTIVE minutes', () => {
  let s = reminders.createState();
  s = work(s, T0, T0 + 44 * MIN, 60, 0);
  assert.strictEqual(reminders.waterDue(s, T0 + 44 * MIN, CFG), false);
  assert.strictEqual(reminders.waterDue(s, T0 + 45 * MIN, CFG), true);
});

test('time spent on a break does not count towards the next glass', () => {
  let s = reminders.createState();
  s = work(s, T0, T0 + 20 * MIN, 60, 0);          // 20 active minutes
  s = goIdle(s, T0 + 20 * MIN, 300).state;        // break, streak ended at +20
  s = work(s, T0 + 35 * MIN, T0 + 54 * MIN, 60, 0); // back at it for 19 more

  // 39 active minutes, but 54 wall-clock ones
  assert.strictEqual(reminders.activeSinceWaterMs(s, T0 + 54 * MIN), 39 * MIN);
  assert.strictEqual(reminders.waterDue(s, T0 + 54 * MIN, CFG), false);
  assert.strictEqual(reminders.waterDue(s, T0 + 60 * MIN, CFG), true);
});

test('logging a glass resets the active clock and bumps the count', () => {
  let s = work(reminders.createState(), T0, T0 + 45 * MIN, 60, 0);
  assert.strictEqual(reminders.waterDue(s, T0 + 45 * MIN, CFG), true);

  s = reminders.logWater(s, T0 + 45 * MIN);
  assert.strictEqual(s.water, 1);
  assert.strictEqual(reminders.waterDue(s, T0 + 45 * MIN, CFG), false);
  assert.strictEqual(reminders.activeSinceWaterMs(s, T0 + 50 * MIN), 5 * MIN);

  // the work streak is untouched: a glass of water is not a break
  assert.strictEqual(reminders.continuousWorkMs(s, T0 + 45 * MIN), 45 * MIN);
});

test('the daily count resets at LOCAL midnight', () => {
  const before = new Date(2026, 0, 15, 23, 50, 0).getTime();
  const after = new Date(2026, 0, 16, 0, 10, 0).getTime();

  let s = reminders.rollDay(reminders.createState(), before);
  s = reminders.logWater(s, before);
  s = reminders.logWater(s, before + MIN);
  assert.strictEqual(s.water, 2);
  assert.strictEqual(s.date, '2026-01-15');

  // still the same local day - nothing moves
  const same = reminders.rollDay(s, before + 5 * MIN);
  assert.strictEqual(same.water, 2);

  const rolled = reminders.rollDay(s, after);
  assert.strictEqual(rolled.date, '2026-01-16');
  assert.strictEqual(rolled.water, 0);
});

test('localDateKey is local, not UTC', () => {
  const d = new Date(2026, 5, 3, 1, 30, 0);   // 01:30 local on the 3rd
  assert.strictEqual(reminders.localDateKey(d.getTime()), '2026-06-03');

  const late = new Date(2026, 5, 3, 23, 30, 0);
  assert.strictEqual(reminders.localDateKey(late.getTime()), '2026-06-03');
});

test('the day rolls over the streak record too, but only at midnight', () => {
  const before = new Date(2026, 0, 15, 22, 0, 0).getTime();
  const after = new Date(2026, 0, 16, 0, 30, 0).getTime();

  let s = reminders.rollDay(reminders.createState(), before);
  s = work(s, before, before + 30 * MIN, 60, 0);
  s = reminders.onBreakEvent(s, before + 30 * MIN);
  assert.strictEqual(reminders.longestStreakMs(s), 30 * MIN);

  s = reminders.rollDay(s, after);
  assert.strictEqual(reminders.longestStreakMs(s), 0);
});

test('the state is never mutated in place', () => {
  const s = reminders.createState();
  const copy = JSON.parse(JSON.stringify(s));
  reminders.onIdleSample(s, 0, T0);
  reminders.onBreakEvent(s, T0);
  reminders.logWater(s, T0);
  reminders.rollDay(s, T0);
  assert.deepStrictEqual(s, copy);
});

test('the break threshold is the contract value from ARCHITECTURE section 10', () => {
  assert.strictEqual(reminders.BREAK_IDLE_MS, 5 * MIN);
  assert.strictEqual(reminders.FALLBACK_WATER_INTERVAL, 45);
});
