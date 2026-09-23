/*
 * rhythm.js - are you typing, mousing, reading or away?
 *
 * Pure: no Electron, no timers. Main feeds it one sample a second and asks
 * for a verdict over the last few seconds.
 *
 * There is no keyboard hook and no keylogger here, and there never will be.
 * The trick is that the system idle timer resets on ANY input while the
 * pointer position only changes when the mouse moves. So:
 *
 *   idle timer near zero, pointer still   -> keyboard: typing
 *   pointer moving                         -> mousing
 *   idle a little while, not long          -> reading or watching
 *   idle for minutes                       -> away
 *
 * Nothing about WHAT you type is ever observable this way - only that the
 * keyboard, rather than the mouse, was what kept the machine awake.
 */

'use strict';

/** Seconds of history a verdict is based on. */
const WINDOW_S = 15;
/** Samples kept at most (a little over the window at one a second). */
const MAX_SAMPLES = 24;
/** Idle this long, in seconds, and you are away. Matches the sleep rule. */
const AWAY_S = 300;

const MODES = ['unknown', 'typing', 'mousing', 'mixed', 'reading', 'away'];

function createState() {
  return { samples: [], mode: 'unknown', since: 0 };
}

/**
 * Record one sample.
 * @param {object} state
 * @param {number} t          ms timestamp
 * @param {number} idleS      system idle time in seconds
 * @param {boolean} moved     did the pointer move since the last sample?
 * @returns {object} new state (the mode is refreshed too)
 */
function sample(state, t, idleS, moved) {
  const samples = state.samples.concat([{ t: t, idle: Math.max(0, idleS || 0), moved: !!moved }]);
  while (samples.length > MAX_SAMPLES) samples.shift();
  const next = { samples: samples, mode: state.mode, since: state.since };
  const mode = classify(next, t);
  if (mode !== state.mode) { next.mode = mode; next.since = t; }
  return next;
}

/**
 * The verdict for the last WINDOW_S seconds.
 * @returns {string} one of MODES
 */
function classify(state, t) {
  const recent = state.samples.filter((s) => t - s.t <= WINDOW_S * 1000);
  if (!recent.length) return 'unknown';
  const latest = recent[recent.length - 1];
  if (latest.idle >= AWAY_S) return 'away';
  if (recent.length < 5) return 'unknown';

  let active = 0, typing = 0, moved = 0;
  for (const s of recent) {
    const busy = s.idle <= 1;
    if (busy) active++;
    if (s.moved) moved++;
    if (busy && !s.moved) typing++;
  }
  const n = recent.length;
  if (typing / n >= 0.5 && moved / n <= 0.3) return 'typing';
  if (moved / n >= 0.4) return 'mousing';
  if (active / n < 0.2) return 'reading';
  return 'mixed';
}

/** How long, in ms, the current mode has held. */
function heldFor(state, t) {
  return state.since ? Math.max(0, t - state.since) : 0;
}

module.exports = { WINDOW_S, AWAY_S, MODES, createState, sample, classify, heldFor };
