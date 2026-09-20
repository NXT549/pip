/*
 * mood.js - the hidden 0-100 number behind Pip's temperament.
 *
 * Never shown as a number anywhere. It nudges the walk pace (brain.js) and
 * which lines Pip picks (lines.js). Looking after him raises it; being ignored
 * for hours lets it drift down.
 *
 * Two deliberate choices:
 *   - the decay has a floor well above zero. A low mood makes Pip mopey, and
 *     mopey is as far as it goes - he is never sulking at you for leaving.
 *   - decay is a function of the gap between two timestamps, so an overnight
 *     shutdown costs the same as an overnight idle, and neither runs away.
 */

'use strict';

const HOUR_MS = 60 * 60 * 1000;

const DEFAULT_MOOD = 60;

/** How far decay can ever pull him down. Below this he stops being fun. */
const MOOD_FLOOR = 25;

/** Points lost per hour of being ignored - gentle on purpose. */
const DECAY_PER_HOUR = 2;

/** What each bit of attention is worth. */
const EVENTS = {
  pet: 4,
  snack: 8,
  water: 5,
  break: 6,
  pomodoro: 10
};

/** Band edges: below LOW is mopey, above HIGH is bouncy. */
const BANDS = { low: 35, high: 70 };

/** A stored mood that is missing or damaged is treated as a fresh one. */
function numeric(value) {
  return typeof value === 'number' && isFinite(value) ? value : DEFAULT_MOOD;
}

function clamp(value) {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

/** An unknown event is a no-op rather than an error - callers pass strings. */
function apply(mood, event) {
  return clamp(numeric(mood) + (EVENTS[event] || 0));
}

function decay(mood, lastUpdatedAt, now) {
  const current = clamp(numeric(mood));
  // No timestamp yet, or the clock went backwards: leave him alone.
  if (!lastUpdatedAt || !(now > lastUpdatedAt)) return current;
  if (current <= MOOD_FLOOR) return current;
  const hours = (now - lastUpdatedAt) / HOUR_MS;
  return Math.max(MOOD_FLOOR, current - hours * DECAY_PER_HOUR);
}

function band(mood) {
  const m = clamp(numeric(mood));
  if (m < BANDS.low) return 'low';
  if (m > BANDS.high) return 'high';
  return 'neutral';
}

module.exports = {
  DEFAULT_MOOD,
  MOOD_FLOOR,
  DECAY_PER_HOUR,
  EVENTS,
  BANDS,
  apply,
  decay,
  band
};
