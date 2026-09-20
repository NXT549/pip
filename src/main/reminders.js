/*
 * reminders.js - how long you have been at it, and when Pip should mention water.
 *
 * Main polls `powerMonitor.getSystemIdleTime()` every 10 seconds and hands the
 * answer to `onIdleSample`. Everything else is derived from timestamps: the
 * current streak is "now minus when it started", never a running total, so a
 * suspended machine cannot inflate it. The only accumulated number is the
 * active time banked towards the next glass of water, and that is a sum of
 * closed streak segments plus the open one - still timestamp-derived.
 *
 * ARCHITECTURE.md section 10 sets the rules:
 *   - idle under 5 minutes is still working
 *   - idle >= 5 minutes, a suspend, or a lock-screen is a break
 *   - water is due every `waterInterval` ACTIVE minutes, not wall-clock ones
 *   - the daily count rolls over at LOCAL midnight
 */

'use strict';

const MINUTE_MS = 60 * 1000;

/** Idle for this long and you are on a break. Contract value, not a setting. */
const BREAK_IDLE_MS = 5 * MINUTE_MS;

const FALLBACK_WATER_INTERVAL = 45;   // minutes, mirrors storage.js DEFAULTS

function positive(value, fallback) {
  return typeof value === 'number' && isFinite(value) && value > 0 ? value : fallback;
}

/** LOCAL YYYY-MM-DD - the day rolls over at your midnight, not UTC's. */
function localDateKey(ts) {
  const d = new Date(ts);
  const pad = (n) => (n < 10 ? '0' + n : String(n));
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function createState() {
  return {
    workStartedAt: 0,     // start of the current streak; 0 while on a break
    waterAnchorAt: 0,     // start of the open segment counting towards water
    waterActiveMs: 0,     // active ms banked since the last glass
    longestStreakMs: 0,   // today's record, banked when a streak ends
    lastSampleAt: 0,      // last idle sample, used to spot unexplained gaps
    lastBreakAt: 0,
    lastWaterAt: 0,
    onBreak: true,        // nothing has been observed yet, so: not working
    date: '',             // local YYYY-MM-DD the counts below belong to
    water: 0
  };
}

/**
 * Close the current streak as at `at`. The record is banked *first*, otherwise
 * standing up would quietly erase the two hours you just did.
 */
function endStreak(state, at) {
  const endedAt = Math.max(at, state.workStartedAt);
  const streak = state.workStartedAt ? endedAt - state.workStartedAt : 0;
  const openWater = state.waterAnchorAt ? Math.max(0, endedAt - state.waterAnchorAt) : 0;
  return Object.assign({}, state, {
    longestStreakMs: Math.max(state.longestStreakMs || 0, streak),
    waterActiveMs: (state.waterActiveMs || 0) + openWater,
    workStartedAt: 0,
    waterAnchorAt: 0,
    onBreak: true,
    lastBreakAt: endedAt
  });
}

/**
 * One idle-time sample.
 * @returns {{state: object, tookBreak: boolean}} `tookBreak` fires once, on the
 *   sample that ends a streak - not on every sample of a long absence.
 */
function onIdleSample(state, idleSeconds, now) {
  let out = Object.assign({}, state || createState());
  const idleMs = Math.max(0, (Number(idleSeconds) || 0) * 1000);
  let tookBreak = false;

  // A gap between samples we cannot account for means Pip was not watching -
  // the machine slept without telling us, or the poll loop stalled. Count it as
  // a break that ended when we last saw you.
  if (out.lastSampleAt && now - out.lastSampleAt >= BREAK_IDLE_MS && !out.onBreak) {
    out = endStreak(out, out.lastSampleAt);
    tookBreak = true;
  }

  if (idleMs >= BREAK_IDLE_MS) {
    if (!out.onBreak) {
      // The streak ended at your last keypress, not at the moment we noticed.
      out = endStreak(out, now - idleMs);
      tookBreak = true;
    }
  } else if (out.onBreak) {
    // Back at the desk. You started again when you last touched something.
    const resumedAt = Math.min(now, Math.max(out.lastBreakAt, now - idleMs));
    out = Object.assign({}, out, {
      onBreak: false,
      workStartedAt: resumedAt,
      waterAnchorAt: resumedAt
    });
  }

  out = Object.assign({}, out, { lastSampleAt: now });
  return { state: out, tookBreak: tookBreak };
}

/** A suspend or a lock-screen is a break, whatever the idle counter says. */
function onBreakEvent(state, now) {
  const s = state || createState();
  if (s.onBreak) return Object.assign({}, s, { lastBreakAt: now });
  return endStreak(s, now);
}

/** Active ms banked towards the next glass, including the open segment. */
function activeSinceWaterMs(state, now) {
  const s = state || createState();
  const open = s.waterAnchorAt ? Math.max(0, now - s.waterAnchorAt) : 0;
  return (s.waterActiveMs || 0) + open;
}

function waterDue(state, now, cfg) {
  const c = cfg || {};
  const minutes = positive(c.waterInterval, FALLBACK_WATER_INTERVAL);
  return activeSinceWaterMs(state, now) >= minutes * MINUTE_MS * positive(c.timeScale, 1);
}

/** Rolls the day first: a glass always lands on the day you drank it. */
function logWater(state, now) {
  const s = rollDay(state, now);
  return Object.assign({}, s, {
    waterActiveMs: 0,
    waterAnchorAt: s.onBreak ? 0 : now,
    water: (s.water || 0) + 1,
    lastWaterAt: now
  });
}

/** Local midnight wipes the daily tallies - and only those. */
function rollDay(state, now) {
  const s = state || createState();
  const key = localDateKey(now);
  if (s.date === key) return s;
  return Object.assign({}, s, { date: key, water: 0, longestStreakMs: 0 });
}

function continuousWorkMs(state, now) {
  const s = state || createState();
  return s.workStartedAt ? Math.max(0, now - s.workStartedAt) : 0;
}

/** The longest streak banked today. The streak in progress is not in here yet. */
function longestStreakMs(state) {
  const s = state || createState();
  return s.longestStreakMs || 0;
}

module.exports = {
  MINUTE_MS,
  BREAK_IDLE_MS,
  FALLBACK_WATER_INTERVAL,
  localDateKey,
  createState,
  onIdleSample,
  onBreakEvent,
  waterDue,
  logWater,
  rollDay,
  continuousWorkMs,
  longestStreakMs,
  activeSinceWaterMs
};
