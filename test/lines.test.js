/*
 * lines.test.js - the speech table is data, so these are data assertions.
 *
 * The two that matter: every situation really can produce six different
 * things whatever the mood and the clock say, and Pip never says the same
 * thing twice in a row.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Lines = require('../src/renderer/lines.js');

/** The situation list from ARCHITECTURE.md section 7, verbatim. */
const EXPECTED_SITUATIONS = [
  'tickle', 'boop', 'pounce', 'queasy', 'bonk', 'typing_company',
  'app_code', 'app_video', 'app_music', 'app_design', 'app_writing', 'app_email', 'app_game',
  'tab_juggling',
  'onboarding_drag', 'onboarding_menu', 'onboarding_flavor', 'onboarding_tray',
  'good_morning', 'welcome_back', 'pet', 'snack', 'click', 'startle', 'annoyed',
  'water_due', 'water_logged', 'pomodoro_done', 'break_start', 'break_over',
  'drowsy', 'exhausted', 'late_night', 'bored', 'called', 'dizzy', 'low_mood',
  'high_mood', 'quiet_on', 'battery_low', 'on_battery'
];

const MOODS = [0, 10, 25, 40, 60, 75, 90, 100];
const HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 23];

/** A small LCG, so a failure here is always reproducible. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test('every situation in the contract exists, and no extras', () => {
  assert.deepStrictEqual(Lines.SITUATIONS.slice().sort(), EXPECTED_SITUATIONS.slice().sort());
});

test('every situation has at least 6 ungated variants', () => {
  for (const situation of Lines.SITUATIONS) {
    const ungated = Lines.LINES[situation].filter((e) => typeof e === 'string');
    assert.ok(
      ungated.length >= 6,
      situation + ' has only ' + ungated.length + ' variants that are always eligible'
    );
  }
});

test('every variant is a non-empty, trimmed string', () => {
  for (const situation of Lines.SITUATIONS) {
    for (const line of Lines.variants(situation)) {
      assert.strictEqual(typeof line, 'string', situation + ' has a non-string variant');
      assert.ok(line.length > 0, situation + ' has an empty variant');
      assert.strictEqual(line, line.trim(), situation + ': "' + line + '" has stray whitespace');
    }
  }
});

test('no situation repeats a variant', () => {
  for (const situation of Lines.SITUATIONS) {
    const all = Lines.variants(situation);
    assert.strictEqual(new Set(all).size, all.length, situation + ' repeats a line');
  }
});

test('pick yields at least 6 distinct lines per situation across moods and hours', () => {
  const rng = seeded(20250920);
  for (const situation of Lines.SITUATIONS) {
    const seen = new Set();
    for (const mood of MOODS) {
      for (const hour of HOURS) {
        for (let i = 0; i < 12; i++) {
          seen.add(Lines.pick(situation, { mood: mood, hour: hour, rng: rng }));
        }
      }
    }
    assert.ok(seen.size >= 6, situation + ' only produced ' + seen.size + ' distinct lines');
  }
});

test('pick yields at least 6 distinct lines at any single mood and hour', () => {
  // The gates must never be able to starve a situation: a bean stuck at
  // mood 0 at 3am still needs six things to say.
  const rng = seeded(7);
  for (const situation of Lines.SITUATIONS) {
    for (const mood of [0, 100]) {
      for (const hour of [3, 14]) {
        const seen = new Set();
        for (let i = 0; i < 300; i++) {
          seen.add(Lines.pick(situation, { mood: mood, hour: hour, rng: rng }));
        }
        assert.ok(
          seen.size >= 6,
          situation + ' at mood ' + mood + ' hour ' + hour + ' produced ' + seen.size
        );
      }
    }
  }
});

test('pick never returns the line it was given as last', () => {
  const rng = seeded(1234);
  for (const situation of Lines.SITUATIONS) {
    let last = null;
    for (let i = 0; i < 300; i++) {
      const mood = MOODS[i % MOODS.length];
      const hour = HOURS[i % HOURS.length];
      const line = Lines.pick(situation, { mood: mood, hour: hour, last: last, rng: rng });
      assert.notStrictEqual(line, last, situation + ' repeated itself');
      last = line;
    }
  }
});

test('pick avoids last even when the gated pool is only that one line', () => {
  // Gate everything down to a single eligible line by feeding it back as
  // `last`: widening the pool beats repeating.
  const rng = seeded(99);
  for (const situation of Lines.SITUATIONS) {
    const pool = Lines.variants(situation);
    for (const candidate of pool) {
      const line = Lines.pick(situation, { mood: 0, hour: 2, last: candidate, rng: rng });
      assert.notStrictEqual(line, candidate, situation + ' handed back ' + candidate);
      assert.ok(pool.includes(line), situation + ' invented a line');
    }
  }
});

test('pick is deterministic when it is given an rng', () => {
  const a = Lines.pick('pet', { mood: 60, hour: 10, rng: seeded(42) });
  const b = Lines.pick('pet', { mood: 60, hour: 10, rng: seeded(42) });
  assert.strictEqual(a, b);

  const first = Lines.pick('pet', { mood: 60, hour: 10, rng: () => 0 });
  assert.strictEqual(first, Lines.variants('pet')[0], 'rng 0 takes the first candidate');

  // An rng that returns values right at the top of the range must still land
  // inside the array rather than off the end.
  const edge = Lines.pick('pet', { mood: 60, hour: 10, rng: () => 0.9999999999 });
  assert.ok(Lines.variants('pet').includes(edge));
});

test('pick copes with a missing or unknown situation', () => {
  assert.strictEqual(Lines.pick('no_such_situation', {}), '');
  assert.strictEqual(Lines.pick(undefined), '');
  assert.ok(Lines.pick('pet').length > 0, 'and works with no options at all');
});

test('mood and hour gates actually change what is eligible', () => {
  // Sweep with a fixed rng: the low-mood set and the high-mood set for a
  // situation with gates on both must not be identical.
  const collect = (situation, mood, hour) => {
    const rng = seeded(5);
    const seen = new Set();
    for (let i = 0; i < 400; i++) seen.add(Lines.pick(situation, { mood, hour, rng }));
    return seen;
  };

  const low = collect('bored', 5, 14);
  const high = collect('bored', 90, 14);
  assert.notDeepStrictEqual(Array.from(low).sort(), Array.from(high).sort());
});
