/*
 * brain.js - what Pip is doing right now.
 *
 * Pure decision logic: no Electron, no timers, no I/O. Everything that varies
 * (the clock, randomness, thresholds, the current world) arrives as input, so
 * this file can be exercised directly by the tests.
 *
 * STATE PRIORITY - highest wins, and this order is the contract:
 *
 *   1. held          Pip is in your hand; nothing else matters
 *   2. sleeping      you are away, or the machine is asleep/locked
 *   3. celebrating   a Pomodoro work block just finished
 *   4. thirsty       a water reminder is due
 *   5. exhausted     you have worked past the exhausted threshold
 *   6. drowsy        you have worked past the drowsy threshold
 *   7. reaction      a short-lived response to you (pet, startle, snack, ...)
 *   8. idle          wandering, idle behaviours, standing about
 *
 * A lower-priority state never interrupts a higher one. Within `idle`, a
 * running idle behaviour is left alone until it finishes.
 */

'use strict';

/** The priority order, exported so the tests can assert against it. */
const STATE_PRIORITY = [
  'held',
  'sleeping',
  'celebrating',
  'thirsty',
  'exhausted',
  'drowsy',
  'reaction',
  'idle'
];

/** Walking speed in DIPs per second, before mood and state adjustments. */
const BASE_WALK = 34;
const BASE_RUN = 96;

/** How long Pip keeps wandering in one direction, in ms. */
const WANDER_MIN = 1800;
const WANDER_MAX = 5200;
/** How long Pip stands still between wanders, in ms. */
const PAUSE_MIN = 2200;
const PAUSE_MAX = 7000;

/**
 * Multipliers on how often Pip wanders and plays.
 * Lower means "more often" for the pause length.
 */
const ACTIVITY = {
  calm: { pause: 1.6, wander: 0.7, speed: 0.85 },
  normal: { pause: 1.0, wander: 1.0, speed: 1.0 },
  hyper: { pause: 0.55, wander: 1.35, speed: 1.2 }
};

function pick(rng, min, max) {
  return min + rng() * (max - min);
}

/**
 * How briskly Pip moves, given mood and how long you have been working.
 * Energetic in the morning, sluggish when drowsy, stopped when exhausted.
 */
function paceFor(state, mood, hour) {
  if (state === 'exhausted' || state === 'sleeping') return 0;
  let pace = 1;
  if (state === 'drowsy') pace *= 0.6;
  if (hour >= 6 && hour < 11) pace *= 1.15;   // morning legs
  if (hour >= 22 || hour < 5) pace *= 0.75;   // late and slow
  if (mood < 30) pace *= 0.8;                 // mopey, never punishing
  else if (mood > 75) pace *= 1.1;
  return pace;
}

/**
 * Decide Pip's state for this moment.
 *
 * @param {object} input
 *   now            {number}  ms timestamp
 *   rng            {function} () => [0,1)
 *   held           {boolean}
 *   asleep         {boolean} you are away / machine suspended or locked
 *   celebrateUntil {number}  ms timestamp, 0 for none
 *   thirsty        {boolean}
 *   continuousWorkMs {number}
 *   drowsyAfterMs  {number}
 *   exhaustedAfterMs {number}
 *   reaction       {{clip, until, state}|null}
 *   behavior       {{clip, until}|null}  a running idle behaviour
 *   wander         {{dir, until, moving}}  carried between calls
 *   quiet          {boolean} quiet mode: no wandering, no chatter
 *   hidden         {boolean}
 *   mood           {number} 0-100
 *   hour           {number} local hour, 0-23
 *   activityLevel  {'calm'|'normal'|'hyper'}
 *   climbing       {boolean} renderer reports Pip is on a wall
 *
 * @returns {object}
 *   state    one of STATE_PRIORITY
 *   clip     animation clip name for the renderer
 *   walkDir  -1 | 0 | 1
 *   walkSpeed DIPs per second
 *   wander   the (possibly advanced) wander state to pass back in
 */
function decide(input) {
  const now = input.now;
  const rng = input.rng || Math.random;
  const mood = typeof input.mood === 'number' ? input.mood : 60;
  const hour = typeof input.hour === 'number' ? input.hour : 12;
  const activity = ACTIVITY[input.activityLevel] || ACTIVITY.normal;
  let wander = input.wander || { dir: 0, until: 0, moving: false };

  const still = (state, clip) => ({
    state: state,
    clip: clip,
    walkDir: 0,
    walkSpeed: 0,
    wander: { dir: 0, until: now + 1200, moving: false }
  });

  // 1. held ---------------------------------------------------------
  if (input.held) return still('held', 'dangle');

  // 2. sleeping -----------------------------------------------------
  if (input.asleep) return still('sleeping', 'sleeping');

  // 3. celebrating --------------------------------------------------
  if (input.celebrateUntil && now < input.celebrateUntil) {
    return still('celebrating', 'celebrating');
  }

  // 4. thirsty ------------------------------------------------------
  if (input.thirsty) return still('thirsty', 'thirsty');

  // 5 & 6. worked too long without a break --------------------------
  const worked = input.continuousWorkMs || 0;
  if (input.exhaustedAfterMs && worked >= input.exhaustedAfterMs) {
    return still('exhausted', 'exhausted');
  }
  const drowsy = input.drowsyAfterMs && worked >= input.drowsyAfterMs;

  // 7. a short-lived reaction to you --------------------------------
  if (input.reaction && now < input.reaction.until) {
    return {
      state: 'reaction',
      clip: input.reaction.clip,
      walkDir: 0,
      walkSpeed: 0,
      wander: wander
    };
  }

  // 8. idle ---------------------------------------------------------
  if (drowsy) {
    // Still mobile, just slower and heavier-lidded.
    const pace = paceFor('drowsy', mood, hour);
    if (input.behavior && now < input.behavior.until) {
      return { state: 'drowsy', clip: input.behavior.clip, walkDir: 0, walkSpeed: 0, wander: wander };
    }
    return {
      state: 'drowsy',
      clip: 'drowsy',
      walkDir: 0,
      walkSpeed: BASE_WALK * pace,
      wander: wander
    };
  }

  // A running idle behaviour is left to finish.
  if (input.behavior && now < input.behavior.until) {
    return { state: 'idle', clip: input.behavior.clip, walkDir: 0, walkSpeed: 0, wander: wander };
  }

  if (input.climbing) {
    return { state: 'idle', clip: 'climb', walkDir: 0, walkSpeed: 0, wander: wander };
  }

  // Quiet mode and hidden both mean "stay put".
  if (input.quiet || input.hidden) return still('idle', 'idle');

  // Wander: alternate between strolling and standing around.
  if (now >= wander.until) {
    if (wander.moving) {
      wander = {
        dir: 0,
        until: now + pick(rng, PAUSE_MIN, PAUSE_MAX) * activity.pause,
        moving: false
      };
    } else {
      wander = {
        dir: rng() < 0.5 ? -1 : 1,
        until: now + pick(rng, WANDER_MIN, WANDER_MAX) * activity.wander,
        moving: true
      };
    }
  }

  const pace = paceFor('idle', mood, hour) * activity.speed;
  if (wander.moving && pace > 0) {
    return {
      state: 'idle',
      clip: 'walk',
      walkDir: wander.dir,
      walkSpeed: BASE_WALK * pace,
      wander: wander
    };
  }

  return { state: 'idle', clip: 'idle', walkDir: 0, walkSpeed: 0, wander: wander };
}

/**
 * A tiny deterministic RNG, so tests and the smoke run are repeatable.
 * mulberry32.
 */
function seededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = {
  STATE_PRIORITY,
  ACTIVITY,
  BASE_WALK,
  BASE_RUN,
  decide,
  paceFor,
  seededRng
};
