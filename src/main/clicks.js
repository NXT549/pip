/*
 * clicks.js - telling a click, a double-click and a poking spree apart.
 *
 * The renderer reports raw clicks; this decides what they meant. It keeps only
 * the last few timestamps - the window it cares about is a second and a bit, so
 * there is nothing to gain from a longer history and a buddy that has been up
 * for a week must not be dragging an array of forty thousand clicks around.
 */

'use strict';

/** Two clicks this close together are one double-click. */
const DOUBLE_MS = 320;

/** Five clicks inside this window and Pip has had enough. */
const RAPID_MS = 1200;
const RAPID_COUNT = 5;

/** Nothing older than the rapid window is ever consulted. */
const MAX_HISTORY = RAPID_COUNT;

function createState() {
  return { times: [], doubledAt: 0 };
}

/**
 * @returns {{state: object, pattern: 'single'|'double'|'rapid'|null}}
 */
function record(state, now) {
  const prev = state && Array.isArray(state.times) ? state.times : [];
  const previous = prev.length ? prev[prev.length - 1] : 0;

  // Clock jumped backwards - the history is meaningless, and so is the gap to
  // the click before it. Start over rather than reading a negative interval as
  // a very fast double.
  const rewound = previous > 0 && now < previous;
  const last = rewound ? 0 : previous;
  const times = (rewound ? [] : prev.slice()).concat(now);
  while (times.length > MAX_HISTORY) times.shift();

  if (times.length >= RAPID_COUNT && now - times[times.length - RAPID_COUNT] <= RAPID_MS) {
    // Pip reacts once and re-arms; holding the mouse down should not make him
    // puff up on every single click for the next minute.
    return { state: { times: [], doubledAt: now }, pattern: 'rapid' };
  }

  // The click that closed a double cannot also open the next one, or a triple
  // would fire the double-click action twice.
  if (last && now - last <= DOUBLE_MS && last !== state.doubledAt) {
    return { state: { times: times, doubledAt: now }, pattern: 'double' };
  }

  return { state: { times: times, doubledAt: state ? state.doubledAt || 0 : 0 }, pattern: 'single' };
}

module.exports = {
  DOUBLE_MS,
  RAPID_MS,
  RAPID_COUNT,
  MAX_HISTORY,
  createState,
  record
};
