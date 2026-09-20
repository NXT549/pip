/*
 * liveness.test.js - Pip must not freeze.
 *
 * The unit tests check each state in isolation, which is exactly why they all
 * passed while Pip stood motionless for hours in real use: the water reminder
 * turned `thirsty` on, `thirsty` was a stationary state, and nothing turned it
 * off until you logged a glass. Every individual assertion was correct.
 *
 * So this file does not test a function, it tests a *session*: it replays the
 * real polling and decision loop over hours of simulated use and asserts that
 * Pip keeps moving. Only the two states the brief actually calls stationary -
 * exhausted and asleep - are allowed to pin him.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const brain = require('../src/main/brain.js');
const reminders = require('../src/main/reminders.js');

const MIN = 60000;
const TICK_MS = 100;

/**
 * Replay main.js's loop: a 10s idle poll driving the water reminder and the
 * work streak, and a 10Hz brain tick.
 *
 * @returns {{worstStationaryMs, worstLabel, states}}
 */
function runSession(opts) {
  const o = Object.assign({
    hours: 3,
    idleSeconds: 5,          // user present and working
    activityLevel: 'normal',
    mood: 60,
    waterInterval: 45,
    drowsyAfter: 50,
    exhaustedAfter: 90,
    seed: 99
  }, opts);

  const rng = brain.seededRng(o.seed);
  let t = Date.parse('2026-09-21T09:00:00');
  let rem = reminders.createState();
  let wander = { dir: 0, until: 0, moving: false };
  let thirsty = false;
  let behavior = null;
  let nextBehaviorAt = 0;

  let stationary = 0;
  let worstStationaryMs = 0;
  let worstLabel = '';
  const states = {};

  const ticks = (o.hours * 3600 * 1000) / TICK_MS;
  for (let i = 0; i < ticks; i++) {
    t += TICK_MS;

    if (i % (10000 / TICK_MS) === 0) {
      rem = reminders.onIdleSample(rem, o.idleSeconds, t).state;
      thirsty = reminders.waterDue(rem, t, { waterInterval: o.waterInterval });
    }

    if (!(behavior && t < behavior.until) && t >= nextBehaviorAt) {
      nextBehaviorAt = t + (20000 + rng() * 70000);
      const roll = rng();
      if (roll < 0.9 && roll >= 0.15) behavior = { clip: 'sit', until: t + 4000 };
    }
    if (behavior && t >= behavior.until) behavior = null;

    const out = brain.decide({
      now: t,
      rng: rng,
      thirsty: thirsty,
      continuousWorkMs: reminders.continuousWorkMs(rem, t),
      drowsyAfterMs: o.drowsyAfter * MIN,
      exhaustedAfterMs: o.exhaustedAfter * MIN,
      behavior: behavior,
      wander: wander,
      mood: o.mood,
      hour: new Date(t).getHours(),
      activityLevel: o.activityLevel
    });
    wander = out.wander;
    states[out.state] = (states[out.state] || 0) + TICK_MS;

    // Exhausted and asleep are meant to be stationary; nothing else is.
    const allowedToBeStill = out.state === 'exhausted' || out.state === 'sleeping';
    if (!allowedToBeStill && (out.walkDir === 0 || out.walkSpeed === 0)) {
      stationary += TICK_MS;
      if (stationary > worstStationaryMs) {
        worstStationaryMs = stationary;
        worstLabel = out.state + '/' + out.clip;
      }
    } else {
      stationary = 0;
    }
  }
  return { worstStationaryMs, worstLabel, states };
}

/**
 * A pause between wanders is normal and wanted. Anything beyond a couple of
 * minutes means Pip has stopped being alive.
 */
const MAX_PAUSE_MS = 2 * MIN;

test('an unanswered water reminder does not freeze Pip', () => {
  // This is the regression: the reminder fires at 45 active minutes and can
  // go unanswered indefinitely, so `thirsty` must stay a moving state.
  const r = runSession({ hours: 3 });
  assert.ok(r.states.thirsty > 60 * MIN,
    'the session should have spent a long time thirsty, got ' +
    Math.round((r.states.thirsty || 0) / MIN) + ' min');
  assert.ok(r.worstStationaryMs <= MAX_PAUSE_MS,
    'Pip stood still for ' + Math.round(r.worstStationaryMs / 1000) + 's in ' +
    r.worstLabel + '; the longest acceptable pause is ' + MAX_PAUSE_MS / 1000 + 's');
});

test('Pip keeps moving across a long working session at every activity level', () => {
  for (const activityLevel of ['calm', 'normal', 'hyper']) {
    const r = runSession({ hours: 4, activityLevel: activityLevel, seed: 7 });
    assert.ok(r.worstStationaryMs <= MAX_PAUSE_MS,
      activityLevel + ': stood still for ' + Math.round(r.worstStationaryMs / 1000) +
      's in ' + r.worstLabel);
  }
});

test('a drowsy Pip still plods about', () => {
  // Drowsy outranks reactions and lasts from 50 to 90 minutes, so a stationary
  // drowsy state would be another long freeze.
  const r = runSession({ hours: 1.4, waterInterval: 600, seed: 3 });
  assert.ok(r.states.drowsy > 5 * MIN, 'expected a decent stretch of drowsy');
  assert.ok(r.worstStationaryMs <= MAX_PAUSE_MS,
    'drowsy froze Pip for ' + Math.round(r.worstStationaryMs / 1000) + 's');
});

test('low mood slows Pip down but never stops him', () => {
  const r = runSession({ hours: 3, mood: 5, seed: 11 });
  assert.ok(r.worstStationaryMs <= MAX_PAUSE_MS,
    'a mopey Pip froze for ' + Math.round(r.worstStationaryMs / 1000) + 's in ' + r.worstLabel);
});

test('a reaction can carry movement, so the huff actually scoots', () => {
  const base = {
    now: 1000,
    rng: brain.seededRng(1),
    wander: { dir: 0, until: 0, moving: false },
    mood: 60,
    hour: 12,
    activityLevel: 'normal'
  };

  // A plain reaction stands still...
  const still = brain.decide(Object.assign({}, base, {
    reaction: { clip: 'happy', until: 5000 }
  }));
  assert.strictEqual(still.state, 'reaction');
  assert.strictEqual(still.walkSpeed, 0);

  // ...but one that carries a direction moves while it plays.
  const scoot = brain.decide(Object.assign({}, base, {
    reaction: { clip: 'sulk', until: 5000, walkDir: -1, walkSpeed: brain.BASE_RUN }
  }));
  assert.strictEqual(scoot.state, 'reaction');
  assert.strictEqual(scoot.clip, 'sulk');
  assert.strictEqual(scoot.walkDir, -1);
  assert.strictEqual(scoot.walkSpeed, brain.BASE_RUN);
});

test('exhausted is the one state allowed to stop Pip dead', () => {
  const out = brain.decide({
    now: 1000,
    rng: brain.seededRng(1),
    continuousWorkMs: 95 * MIN,
    exhaustedAfterMs: 90 * MIN,
    drowsyAfterMs: 50 * MIN,
    wander: { dir: 0, until: 0, moving: false },
    mood: 60, hour: 12, activityLevel: 'normal'
  });
  assert.strictEqual(out.state, 'exhausted');
  assert.strictEqual(out.walkSpeed, 0);
});
