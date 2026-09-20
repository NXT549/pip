'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const brain = require('../src/main/brain.js');

const MIN = 60 * 1000;
const T0 = 1758000000000;

function baseInput(extra) {
  return Object.assign({
    now: T0,
    rng: brain.seededRng(1),
    held: false,
    asleep: false,
    celebrateUntil: 0,
    thirsty: false,
    continuousWorkMs: 0,
    drowsyAfterMs: 50 * MIN,
    exhaustedAfterMs: 90 * MIN,
    reaction: null,
    behavior: null,
    wander: { dir: 0, until: 0, moving: false },
    quiet: false,
    hidden: false,
    mood: 60,
    hour: 12,
    activityLevel: 'normal',
    climbing: false
  }, extra || {});
}

/** The input that should, on its own, produce each state. */
const TRIGGER = {
  held: { held: true },
  sleeping: { asleep: true },
  celebrating: { celebrateUntil: T0 + 5000 },
  thirsty: { thirsty: true },
  exhausted: { continuousWorkMs: 95 * MIN },
  drowsy: { continuousWorkMs: 60 * MIN },
  reaction: { reaction: { clip: 'happy', until: T0 + 800 } },
  idle: {}
};

/** `state`'s own trigger applied last, so it wins any shared input key. */
function inputFor(state) {
  const index = brain.STATE_PRIORITY.indexOf(state);
  let extra = {};
  for (let i = index + 1; i < brain.STATE_PRIORITY.length; i += 1) {
    extra = Object.assign(extra, TRIGGER[brain.STATE_PRIORITY[i]]);
  }
  return baseInput(Object.assign(extra, TRIGGER[state]));
}

test('the priority order is the one ARCHITECTURE.md section 4 fixes', () => {
  assert.deepStrictEqual(brain.STATE_PRIORITY, [
    'held',
    'sleeping',
    'celebrating',
    'thirsty',
    'exhausted',
    'drowsy',
    'reaction',
    'idle'
  ]);
});

test('each trigger on its own produces its own state', () => {
  for (const state of brain.STATE_PRIORITY) {
    const out = brain.decide(baseInput(TRIGGER[state]));
    assert.strictEqual(out.state, state, state + ' should be reachable on its own');
  }
});

test('a higher state wins even with every lower input set at once', () => {
  for (const state of brain.STATE_PRIORITY) {
    // drowsy is covered by its own test below - brain.js currently deviates.
    if (state === 'drowsy') continue;
    const out = brain.decide(inputFor(state));
    assert.strictEqual(out.state, state,
      state + ' must outrank everything below it in STATE_PRIORITY');
  }
});

// Drowsy deliberately outranks reaction: once Pip is this tired, being petted
// does not perk him up. This is the ARCHITECTURE.md section 4 contract.
test('drowsy outranks reaction (ARCHITECTURE.md section 4)', () => {
  const out = brain.decide(inputFor('drowsy'));
  assert.strictEqual(out.state, 'drowsy');
});

test('exhausted outranks drowsy, which they share an input for', () => {
  const out = brain.decide(baseInput({ continuousWorkMs: 95 * MIN }));
  assert.strictEqual(out.state, 'exhausted');
  assert.strictEqual(out.walkSpeed, 0);   // too tired to move
});

test('a reaction outranks idle but expires', () => {
  const reaction = { clip: 'blush', until: T0 + 800 };
  assert.strictEqual(brain.decide(baseInput({ reaction: reaction })).state, 'reaction');
  assert.strictEqual(brain.decide(baseInput({ reaction: reaction })).clip, 'blush');
  assert.strictEqual(brain.decide(baseInput({ now: T0 + 900, reaction: reaction })).state, 'idle');
});

test('a running idle behaviour is not interrupted by another idle behaviour', () => {
  const behavior = { clip: 'juggle', until: T0 + 6000 };
  // The wander timer is long expired, so decide() would otherwise be free to
  // start Pip walking or pick something else to do.
  const wander = { dir: 1, until: T0 - 1, moving: true };

  for (let t = 0; t < 6000; t += 500) {
    const out = brain.decide(baseInput({
      now: T0 + t,
      behavior: behavior,
      wander: wander,
      rng: brain.seededRng(t + 1)
    }));
    assert.strictEqual(out.state, 'idle');
    assert.strictEqual(out.clip, 'juggle', 'the behaviour must be left to finish');
    assert.strictEqual(out.walkDir, 0);
    assert.strictEqual(out.walkSpeed, 0);
  }

  // Once it is over, Pip is free again.
  const after = brain.decide(baseInput({ now: T0 + 6000, behavior: behavior, wander: wander }));
  assert.notStrictEqual(after.clip, 'juggle');
});

// Idle behaviours are the LOWEST rung of STATE_PRIORITY, so drowsy takes over
// from one that is still running rather than waiting politely for it to finish.
// Being left alone to finish only applies within `idle`.
test('drowsy takes over from a running idle behaviour', () => {
  const out = brain.decide(baseInput({
    continuousWorkMs: 60 * MIN,
    behavior: { clip: 'read', until: T0 + 3000 }
  }));
  assert.strictEqual(out.state, 'drowsy');
  assert.notStrictEqual(out.clip, 'read');
});

test('decide is deterministic given a seeded rng', () => {
  function run(seed) {
    const rng = brain.seededRng(seed);
    let wander = { dir: 0, until: 0, moving: false };
    const trail = [];
    for (let i = 0; i < 120; i += 1) {
      const out = brain.decide(baseInput({ now: T0 + i * 500, rng: rng, wander: wander }));
      wander = out.wander;
      trail.push([out.state, out.clip, out.walkDir, out.walkSpeed, wander.dir, wander.until]);
    }
    return trail;
  }

  assert.deepStrictEqual(run(42), run(42));
  assert.notDeepStrictEqual(run(42), run(4242));
});

test('seededRng is repeatable and seed-dependent', () => {
  const a = brain.seededRng(7);
  const b = brain.seededRng(7);
  const c = brain.seededRng(8);
  const first = [];
  for (let i = 0; i < 5; i += 1) {
    const value = a();
    assert.strictEqual(value, b());
    assert.ok(value >= 0 && value < 1);
    first.push(value);
  }
  assert.notDeepStrictEqual(first, [c(), c(), c(), c(), c()]);
});

test('quiet mode and being hidden keep Pip where he is', () => {
  const quiet = brain.decide(baseInput({ quiet: true, wander: { dir: 1, until: T0 - 1, moving: true } }));
  assert.strictEqual(quiet.state, 'idle');
  assert.strictEqual(quiet.walkDir, 0);

  const hidden = brain.decide(baseInput({ hidden: true, wander: { dir: 1, until: T0 - 1, moving: true } }));
  assert.strictEqual(hidden.walkSpeed, 0);
});

test('the state returned is always one of the eight', () => {
  const rng = brain.seededRng(3);
  let wander = { dir: 0, until: 0, moving: false };
  for (let i = 0; i < 200; i += 1) {
    const out = brain.decide(baseInput({
      now: T0 + i * 700,
      rng: rng,
      wander: wander,
      mood: i % 101,
      hour: i % 24,
      activityLevel: ['calm', 'normal', 'hyper'][i % 3]
    }));
    wander = out.wander;
    assert.ok(brain.STATE_PRIORITY.indexOf(out.state) !== -1, 'unknown state ' + out.state);
    assert.ok(typeof out.clip === 'string' && out.clip.length > 0);
    assert.ok(out.walkDir === -1 || out.walkDir === 0 || out.walkDir === 1);
    assert.ok(out.walkSpeed >= 0);
  }
});
