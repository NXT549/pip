/*
 * seasons.js - which flavour Pip wears for the time of year.
 *
 * When the "seasonal flavours" setting is on, Pip quietly changes into a
 * seasonal flavour when its season starts and back into whatever he wore
 * before when it ends. The user's choice always wins: pick another flavour
 * mid-season and he keeps it, and at the end of the season he is left alone
 * rather than being changed back.
 *
 * That needs one piece of remembered state, `season`:
 *
 *   { key: 'pumpkin-2026', flavor: 'pumpkin', previous: 'lime' }
 *
 * `key` names the season *and the year*, so a season is handed out once and
 * not again after the user has changed away from it, and next year's season
 * is a new one. `previous` is what to go back to.
 *
 * No Electron imports: the clock is passed in.
 */

'use strict';

const Palettes = require('../renderer/palettes.js');

/**
 * The seasons, by local month and day, inclusive. They never overlap.
 * `name` is used in the season key only; the flavour is what the user sees.
 */
const SEASONS = [
  { name: 'valentines', flavor: 'bubblegum', from: [2, 1], to: [2, 14] },
  { name: 'halloween', flavor: 'pumpkin', from: [10, 1], to: [10, 31] },
  { name: 'winter', flavor: 'candycane', from: [12, 1], to: [12, 31] }
];

/** No season in progress. */
const NONE = Object.freeze({ key: '', flavor: '', previous: '' });

/**
 * The season running at `ts` in local time, or null.
 * @param {number} ts
 * @returns {{name, flavor, from, to}|null}
 */
function seasonAt(ts) {
  const d = new Date(ts);
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  for (const s of SEASONS) {
    if (md >= s.from[0] * 100 + s.from[1] && md <= s.to[0] * 100 + s.to[1]) return s;
  }
  return null;
}

/** 'halloween-2026': one season in one year. */
function seasonKey(season, ts) {
  return season.name + '-' + new Date(ts).getFullYear();
}

function knownFlavor(name) {
  return Palettes.FLAVOR_NAMES.indexOf(name) !== -1 ? name : Palettes.DEFAULT_FLAVOR;
}

/**
 * Work out what Pip should be wearing now.
 *
 * @param {{flavor: string, seasonal: boolean, season: object}} current
 * @param {number} ts  now
 * @returns {{flavor: string, season: object, event: 'start'|'end'|null}}
 *   `event` is 'start' when Pip has just changed into a seasonal flavour and
 *   'end' when he has just changed back. A season starting while he already
 *   wears its flavour, or ending after the user changed away, is no event.
 */
function step(current, ts) {
  const was = current.season && typeof current.season.key === 'string' ? current.season : NONE;
  const season = current.seasonal ? seasonAt(ts) : null;
  const key = season ? seasonKey(season, ts) : '';
  if (key === was.key) return { flavor: current.flavor, season: was, event: null };

  // Leaving the old season - it ended, or the setting was switched off. Only
  // change back if Pip is still wearing what the season gave him.
  let flavor = current.flavor;
  let event = null;
  if (was.key && flavor === was.flavor) {
    flavor = knownFlavor(was.previous);
    if (flavor !== was.flavor) event = 'end';
  }

  if (!season) return { flavor: flavor, season: NONE, event: event };

  return {
    flavor: season.flavor,
    season: { key: key, flavor: season.flavor, previous: flavor },
    event: season.flavor !== flavor ? 'start' : event
  };
}

module.exports = { SEASONS, NONE, seasonAt, seasonKey, step };
