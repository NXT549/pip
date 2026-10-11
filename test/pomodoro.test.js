'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const pomodoro = require('../src/main/pomodoro.js');

const MIN = 60 * 1000;
const T0 = 1758000000000;   // an arbitrary fixed "now"
const CFG = {
  pomodoroWork: 25,
  pomodoroBreak: 5,
  pomodoroLongBreak: 15,
  pomodoroLongEvery: 4
};

/** Run the clock forward to `at`, returning the state and what transitioned. */
function tickTo(state, at) {
  return pomodoro.tick(state, at, CFG);
}

test('phaseDuration reads the config in minutes', () => {
  assert.strictEqual(pomodoro.phaseDuration('work', CFG), 25 * MIN);
  assert.strictEqual(pomodoro.phaseDuration('break', CFG), 5 * MIN);
  assert.strictEqual(pomodoro.phaseDuration('longBreak', CFG), 15 * MIN);
  assert.strictEqual(pomodoro.phaseDuration('off', CFG), 0);
});

test('timeScale shrinks every phase (dev mode)', () => {
  const dev = Object.assign({}, CFG, { timeScale: 1 / 60 });
  assert.strictEqual(pomodoro.phaseDuration('work', dev), 25 * 1000);
  assert.strictEqual(pomodoro.phaseDuration('longBreak', dev), 15 * 1000);
});

test('start begins a work block at now', () => {
  const s = pomodoro.start(null, T0, CFG);
  assert.deepStrictEqual(s, { phase: 'work', startedAt: T0, completed: 0 });
});

test('stop goes back to off and clears the count', () => {
  const running = { phase: 'break', startedAt: T0, completed: 3 };
  assert.deepStrictEqual(pomodoro.stop(running), { phase: 'off', startedAt: 0, completed: 0 });
});

test('a work block that runs out becomes a break and counts one done', () => {
  const s = pomodoro.start(null, T0, CFG);

  const early = tickTo(s, T0 + 24 * MIN);
  assert.strictEqual(early.transitioned, false);
  assert.strictEqual(early.finishedPhase, null);
  assert.deepStrictEqual(early.state, s);

  const done = tickTo(s, T0 + 25 * MIN);
  assert.strictEqual(done.transitioned, true);
  assert.strictEqual(done.finishedPhase, 'work');
  assert.strictEqual(done.state.phase, 'break');
  assert.strictEqual(done.state.completed, 1);
  // the break starts when the work ran out, not when the poll noticed
  assert.strictEqual(done.state.startedAt, T0 + 25 * MIN);
});

test('a break that runs out goes back to work', () => {
  const brk = { phase: 'break', startedAt: T0, completed: 1 };
  const done = tickTo(brk, T0 + 5 * MIN);
  assert.strictEqual(done.transitioned, true);
  assert.strictEqual(done.finishedPhase, 'break');
  assert.strictEqual(done.state.phase, 'work');
  assert.strictEqual(done.state.completed, 1);
});

test('every fourth work block earns a long break, then the cycle restarts', () => {
  let state = pomodoro.start(null, T0, CFG);
  let now = T0;
  const breaks = [];

  for (let block = 0; block < 4; block += 1) {
    now += 25 * MIN;
    let out = tickTo(state, now);
    assert.strictEqual(out.finishedPhase, 'work');
    state = out.state;
    breaks.push(state.phase);
    assert.strictEqual(state.completed, block + 1);

    now += pomodoro.phaseDuration(state.phase, CFG);
    out = tickTo(state, now);
    state = out.state;
    assert.strictEqual(state.phase, 'work');
  }

  assert.deepStrictEqual(breaks, ['break', 'break', 'break', 'longBreak']);
  // the long break closed the cycle, so counting starts again
  assert.strictEqual(state.completed, 0);
});

test('remaining counts down and never goes negative', () => {
  const s = pomodoro.start(null, T0, CFG);
  assert.strictEqual(pomodoro.remaining(s, T0, CFG), 25 * MIN);
  assert.strictEqual(pomodoro.remaining(s, T0 + 10 * MIN, CFG), 15 * MIN);
  assert.strictEqual(pomodoro.remaining(s, T0 + 25 * MIN, CFG), 0);
  assert.strictEqual(pomodoro.remaining(s, T0 + 99 * MIN, CFG), 0);
  assert.strictEqual(pomodoro.remaining({ phase: 'off', startedAt: 0, completed: 0 }, T0, CFG), 0);
});

test('restore resumes a block that is still running, untouched', () => {
  const saved = { phase: 'work', startedAt: T0, completed: 2 };
  const back = pomodoro.restore(saved, T0 + 9 * MIN, CFG);
  assert.deepStrictEqual(back, saved);
  assert.strictEqual(pomodoro.remaining(back, T0 + 9 * MIN, CFG), 16 * MIN);
});

test('restore lands on the phase the app should be in, not a burst of stale ones', () => {
  // 28 minutes gone: the 25 minute block ended, we are 3 minutes into the break.
  const back = pomodoro.restore({ phase: 'work', startedAt: T0, completed: 0 }, T0 + 28 * MIN, CFG);
  assert.strictEqual(back.phase, 'break');
  assert.strictEqual(back.completed, 1);
  assert.strictEqual(back.startedAt, T0 + 25 * MIN);
  assert.strictEqual(pomodoro.remaining(back, T0 + 28 * MIN, CFG), 2 * MIN);

  // and the next tick must not immediately fire a transition
  assert.strictEqual(pomodoro.tick(back, T0 + 28 * MIN, CFG).transitioned, false);
});

test('restore walks several missed phases in one go', () => {
  // 70 minutes: work, break, work, break, then 10 minutes into the third block.
  const back = pomodoro.restore({ phase: 'work', startedAt: T0, completed: 0 }, T0 + 70 * MIN, CFG);
  assert.strictEqual(back.phase, 'work');
  assert.strictEqual(back.completed, 2);
  assert.strictEqual(back.startedAt, T0 + 60 * MIN);
});

test('a multi-hour sleep ends the session instead of corrupting it', () => {
  const saved = { phase: 'work', startedAt: T0, completed: 1 };
  const back = pomodoro.restore(saved, T0 + 6 * 60 * MIN, CFG);
  assert.deepStrictEqual(back, { phase: 'off', startedAt: 0, completed: 0 });

  // whatever happens, the phase is always one of the four legal values
  assert.ok(pomodoro.PHASES.indexOf(back.phase) !== -1);
  assert.strictEqual(pomodoro.remaining(back, T0 + 6 * 60 * MIN, CFG), 0);
  assert.strictEqual(pomodoro.tick(back, T0 + 6 * 60 * MIN, CFG).transitioned, false);
});

test('a sleep of two hours lands mid long-break, with the count intact', () => {
  // 120 minutes is inside one cycle: 4 work blocks and 3 short breaks take 115,
  // so we should be 5 minutes into the long break with 4 blocks banked.
  const state = pomodoro.restore({ phase: 'work', startedAt: T0, completed: 0 }, T0 + 120 * MIN, CFG);
  assert.strictEqual(state.phase, 'longBreak');
  assert.strictEqual(state.completed, 4);
  assert.strictEqual(pomodoro.remaining(state, T0 + 120 * MIN, CFG), 10 * MIN);
  assert.strictEqual(pomodoro.tick(state, T0 + 120 * MIN, CFG).transitioned, false);
});

test('a sleep past a whole cycle cannot skew the block that follows', () => {
  let state = pomodoro.start(null, T0, CFG);
  state = pomodoro.restore(state, T0 + 150 * MIN, CFG);
  assert.strictEqual(state.phase, 'off');

  // Starting again gives a full, clean block - not one already half gone.
  state = pomodoro.start(state, T0 + 150 * MIN, CFG);
  assert.strictEqual(pomodoro.remaining(state, T0 + 150 * MIN, CFG), 25 * MIN);
  assert.strictEqual(state.completed, 0);
});

test('a very late tick restarts the next phase from now rather than in the past', () => {
  const s = pomodoro.start(null, T0, CFG);
  const out = tickTo(s, T0 + 45 * MIN);   // noticed 20 minutes late, break is 5
  assert.strictEqual(out.state.phase, 'break');
  assert.strictEqual(out.state.startedAt, T0 + 45 * MIN);
  assert.strictEqual(pomodoro.remaining(out.state, T0 + 45 * MIN, CFG), 5 * MIN);
});

test('restore normalises junk rather than trusting it', () => {
  assert.deepStrictEqual(pomodoro.restore(null, T0, CFG),
    { phase: 'off', startedAt: 0, completed: 0 });
  assert.deepStrictEqual(pomodoro.restore({ phase: 'nonsense', startedAt: T0 }, T0, CFG),
    { phase: 'off', startedAt: 0, completed: 0 });
  assert.deepStrictEqual(pomodoro.restore({ phase: 'work', startedAt: 0, completed: 0 }, T0, CFG),
    { phase: 'off', startedAt: 0, completed: 0 });

  // clock dragged backwards: keep the phase, restart the block
  const back = pomodoro.restore({ phase: 'work', startedAt: T0, completed: 1 }, T0 - 60 * MIN, CFG);
  assert.strictEqual(back.phase, 'work');
  assert.strictEqual(back.startedAt, T0 - 60 * MIN);
});

test('missing or zeroed settings fall back instead of making a zero-length block', () => {
  assert.strictEqual(pomodoro.phaseDuration('work', {}), 25 * MIN);
  assert.strictEqual(pomodoro.phaseDuration('work', { pomodoroWork: 0 }), 25 * MIN);
  assert.strictEqual(pomodoro.cycleDuration(CFG), (4 * 25 + 3 * 5 + 15) * MIN);
});

test('skipping a break starts the next work block now, and the cycle carries on', () => {
  const brk = { phase: 'break', startedAt: T0, completed: 2 };
  assert.deepStrictEqual(pomodoro.skipBreak(brk, T0 + MIN),
    { phase: 'work', startedAt: T0 + MIN, completed: 2 });

  // the long break closes the cycle, so the count starts again
  const long = { phase: 'longBreak', startedAt: T0, completed: 4 };
  assert.deepStrictEqual(pomodoro.skipBreak(long, T0 + MIN),
    { phase: 'work', startedAt: T0 + MIN, completed: 0 });
});

test('only a break can be skipped: work and off come back unchanged', () => {
  const work = { phase: 'work', startedAt: T0, completed: 1 };
  assert.deepStrictEqual(pomodoro.skipBreak(work, T0 + MIN), work);
  assert.deepStrictEqual(pomodoro.skipBreak(null, T0),
    { phase: 'off', startedAt: 0, completed: 0 });
});
