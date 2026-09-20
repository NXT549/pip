/*
 * pomodoro.js - work blocks and the breaks between them.
 *
 * A block is a phase plus the timestamp it started at. Nothing in here counts
 * ticks or intervals, so the clock can stop for an hour - lid closed, machine
 * hibernated, a meeting - and the answer on the way back is still right. That
 * is the whole reason this module is shaped the way it is.
 *
 * The state object is exactly what storage.js persists under `pomodoro`:
 *   { phase: 'off'|'work'|'break'|'longBreak', startedAt: number, completed: number }
 *
 * `cfg` is the relevant slice of settings, in MINUTES, plus an optional
 * `timeScale` (dev mode passes 1/60 to make a 25 minute block last 25 seconds).
 */

'use strict';

const MINUTE_MS = 60 * 1000;

const PHASES = ['off', 'work', 'break', 'longBreak'];

/** Used when a setting is missing or nonsense; mirrors storage.js DEFAULTS. */
const FALLBACK = {
  pomodoroWork: 25,
  pomodoroBreak: 5,
  pomodoroLongBreak: 15,
  pomodoroLongEvery: 4
};

function off() {
  return { phase: 'off', startedAt: 0, completed: 0 };
}

/** A setting is only believed if it is a finite number above zero. */
function positive(value, fallback) {
  return typeof value === 'number' && isFinite(value) && value > 0 ? value : fallback;
}

function timeScale(cfg) {
  return positive(cfg && cfg.timeScale, 1);
}

function longEvery(cfg) {
  return Math.max(1, Math.round(positive(cfg && cfg.pomodoroLongEvery, FALLBACK.pomodoroLongEvery)));
}

/** Drop anything unrecognisable rather than carrying a broken block forward. */
function normalize(state) {
  if (!state || PHASES.indexOf(state.phase) === -1 || state.phase === 'off') return off();
  const startedAt = typeof state.startedAt === 'number' && isFinite(state.startedAt) && state.startedAt > 0
    ? state.startedAt
    : 0;
  const completed = typeof state.completed === 'number' && isFinite(state.completed) && state.completed > 0
    ? Math.floor(state.completed)
    : 0;
  if (!startedAt) return off();
  return { phase: state.phase, startedAt: startedAt, completed: completed };
}

/** How long a phase lasts, in ms. 'off' has no duration. */
function phaseDuration(phase, cfg) {
  const c = cfg || {};
  let minutes;
  if (phase === 'work') minutes = positive(c.pomodoroWork, FALLBACK.pomodoroWork);
  else if (phase === 'break') minutes = positive(c.pomodoroBreak, FALLBACK.pomodoroBreak);
  else if (phase === 'longBreak') minutes = positive(c.pomodoroLongBreak, FALLBACK.pomodoroLongBreak);
  else return 0;
  return minutes * MINUTE_MS * timeScale(cfg);
}

/** One whole work/break cycle, up to and including the long break. */
function cycleDuration(cfg) {
  const every = longEvery(cfg);
  return every * phaseDuration('work', cfg)
    + (every - 1) * phaseDuration('break', cfg)
    + phaseDuration('longBreak', cfg);
}

/** What follows `phase` once it runs out. */
function nextOf(phase, completed, cfg) {
  const every = longEvery(cfg);
  if (phase === 'work') {
    const done = completed + 1;
    return { phase: done % every === 0 ? 'longBreak' : 'break', completed: done };
  }
  // The long break closes the cycle, so the count starts again after it.
  if (phase === 'longBreak') return { phase: 'work', completed: 0 };
  if (phase === 'break') return { phase: 'work', completed: completed };
  return { phase: 'off', completed: 0 };
}

/** Begin a work block. A finished cycle starts counting from scratch. */
function start(state, now, cfg) {
  const s = normalize(state);
  const every = longEvery(cfg);
  return {
    phase: 'work',
    startedAt: now,
    completed: s.completed % every === 0 ? 0 : s.completed
  };
}

function stop() {
  return off();
}

/**
 * Advance at most one phase. Called from the poll loop, so it reports what it
 * did: `finishedPhase` is what main.js celebrates or announces.
 */
function tick(state, now, cfg) {
  const s = normalize(state);
  if (s.phase === 'off') return { state: s, transitioned: false, finishedPhase: null };

  const duration = phaseDuration(s.phase, cfg);
  if (now - s.startedAt < duration) {
    return { state: s, transitioned: false, finishedPhase: null };
  }

  const next = nextOf(s.phase, s.completed, cfg);
  // The next block begins when this one ran out, not when we happened to
  // notice, so a late poll cannot drag the schedule later and later. If we are
  // so late that the next block would already be over, the machine was asleep -
  // start it from now and leave the catching up to restore().
  const ranOutAt = s.startedAt + duration;
  const startedAt = now - ranOutAt < phaseDuration(next.phase, cfg) ? ranOutAt : now;

  return {
    state: { phase: next.phase, startedAt: startedAt, completed: next.completed },
    transitioned: true,
    finishedPhase: s.phase
  };
}

/** Milliseconds left in the current block; 0 when nothing is running. */
function remaining(state, now, cfg) {
  const s = normalize(state);
  if (s.phase === 'off') return 0;
  return Math.max(0, phaseDuration(s.phase, cfg) - (now - s.startedAt));
}

/**
 * Work out where a persisted block should be after a restart or a long sleep.
 *
 * Still inside its duration: resume it untouched, same `startedAt`, so the ring
 * picks up exactly where it was. Already elapsed: walk forward through the
 * phases that went by and land on the one it should be in now - firing a burst
 * of stale "block finished!" transitions hours after the fact helps nobody.
 * More than a whole cycle gone means the session is simply over.
 */
function restore(state, now, cfg) {
  let current = normalize(state);
  if (current.phase === 'off') return current;

  // Clock moved backwards (timezone change, NTP correction). Restart the block
  // rather than trusting a negative elapsed time.
  if (now < current.startedAt) {
    return { phase: current.phase, startedAt: now, completed: current.completed };
  }
  if (now - current.startedAt > cycleDuration(cfg)) return off();

  // Bounded by the cycle check above; the counter is belt and braces.
  for (let guard = 0; guard < 64; guard += 1) {
    const duration = phaseDuration(current.phase, cfg);
    if (duration <= 0) return off();
    if (now - current.startedAt < duration) return current;
    const next = nextOf(current.phase, current.completed, cfg);
    current = {
      phase: next.phase,
      startedAt: current.startedAt + duration,
      completed: next.completed
    };
  }
  return off();
}

module.exports = {
  MINUTE_MS,
  PHASES,
  FALLBACK,
  start,
  stop,
  tick,
  remaining,
  phaseDuration,
  cycleDuration,
  restore
};
