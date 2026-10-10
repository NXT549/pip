/*
 * storage.js - Pip's settings and daily stats on disk.
 *
 * One JSON file in userData. Writes are atomic (temp file, then rename) so a
 * crash mid-save cannot leave a half-written file behind. Loads merge over the
 * defaults, so a file written by an older version is still usable. A corrupt
 * file is backed up, reported, and replaced with defaults - it never throws.
 *
 * No Electron imports: the directory is injected, which is what makes this
 * directly testable.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const Palettes = require('../renderer/palettes.js');
const History = require('./history.js');

/** Everything Pip remembers, and what it falls back to. */
const DEFAULTS = {
  version: 1,

  // appearance
  flavor: 'cherry',
  petSize: 'medium',          // small | medium | large  -> scale 3 | 4 | 5
  activityLevel: 'normal',    // calm | normal | hyper

  // behaviour toggles
  notifications: true,
  launchAtLogin: true,
  compatibilityMode: false,
  seasonal: true,             // wear the seasonal flavour in its season

  // work habits, all in minutes
  pomodoroWork: 25,
  pomodoroBreak: 5,
  pomodoroLongBreak: 15,
  pomodoroLongEvery: 4,
  drowsyAfter: 50,
  exhaustedAfter: 90,
  waterInterval: 45,
  waterGoal: 8,               // glasses a day; 0 means no goal

  // persisted runtime state
  onboarded: false,
  hidden: false,
  mood: 60,
  moodUpdatedAt: 0,
  quietUntil: 0,
  lastGoodMorning: '',        // local YYYY-MM-DD, so it survives a restart
  lastLateNightNudge: 0,

  // the seasonal flavour Pip was last handed - see src/main/seasons.js
  season: {
    key: '',                  // e.g. 'halloween-2026'; '' when none
    flavor: '',
    previous: ''              // what to change back into afterwards
  },

  // pomodoro survives a restart by storing when the block started
  pomodoro: {
    phase: 'off',             // off | work | break | longBreak
    startedAt: 0,
    completed: 0              // work blocks finished in the current cycle
  },

  // today's tallies, reset at local midnight
  today: {
    date: '',                 // YYYY-MM-DD, local
    pomodoros: 0,
    water: 0,
    longestStreakMs: 0
  },

  // finished days, oldest first - see src/main/history.js
  history: []
};

/**
 * What each user-editable setting may hold. The settings window enforces the
 * same ranges (a test checks the two agree), but the file can be edited by
 * hand, and a value of the right type can still be nonsense: a negative
 * drowsiness threshold left Pip permanently drowsy.
 */
const NUMBER_LIMITS = {
  pomodoroWork: [1, 180],
  pomodoroBreak: [1, 60],
  pomodoroLongBreak: [1, 120],
  pomodoroLongEvery: [1, 12],
  drowsyAfter: [5, 600],
  exhaustedAfter: [5, 600],
  waterInterval: [5, 600],
  waterGoal: [0, 20]
};

const CHOICES = {
  flavor: Palettes.FLAVOR_NAMES,
  petSize: ['small', 'medium', 'large'],
  activityLevel: ['calm', 'normal', 'hyper']
};

const TOGGLES = ['notifications', 'launchAtLogin', 'compatibilityMode', 'seasonal'];

/** The keys the settings window may change. Everything else is main's own state. */
const USER_KEYS = Object.keys(CHOICES).concat(Object.keys(NUMBER_LIMITS), TOGGLES);

/** One user setting made safe, or undefined when there is nothing usable in it. */
function cleanValue(key, value) {
  if (key in NUMBER_LIMITS) {
    if (typeof value !== 'number' || !isFinite(value)) return undefined;
    const lo = NUMBER_LIMITS[key][0];
    const hi = NUMBER_LIMITS[key][1];
    return Math.min(hi, Math.max(lo, Math.round(value)));
  }
  if (key in CHOICES) return CHOICES[key].indexOf(value) !== -1 ? value : undefined;
  if (TOGGLES.indexOf(key) !== -1) return typeof value === 'boolean' ? value : undefined;
  return undefined;
}

/**
 * Filter a patch from the settings window down to the keys it may change,
 * with every value made sane. Anything unusable is dropped, not defaulted -
 * a bad field must not reset a good setting.
 */
function cleanPatch(patch) {
  const out = {};
  if (!patch || typeof patch !== 'object') return out;
  for (const key of USER_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const value = cleanValue(key, patch[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Repair loaded settings in place: anything unusable goes back to its default.
 * The history rows are repaired one by one, so one bad day costs only itself.
 */
function sanitize(data) {
  for (const key of USER_KEYS) {
    const value = cleanValue(key, data[key]);
    data[key] = value === undefined ? clone(DEFAULTS[key]) : value;
  }
  data.history = History.clean(data.history);
  return data;
}

/** Deep-merge `saved` over `defaults`, keeping only keys defaults knows about. */
function mergeDefaults(defaults, saved) {
  if (saved === null || saved === undefined || typeof saved !== 'object' || Array.isArray(saved)) {
    return clone(defaults);
  }
  const out = {};
  for (const key of Object.keys(defaults)) {
    const d = defaults[key];
    const s = saved[key];
    if (d !== null && typeof d === 'object' && !Array.isArray(d)) {
      out[key] = mergeDefaults(d, s);
    } else if (s === undefined || s === null) {
      out[key] = clone(d);
    } else if (typeof d === typeof s || d === null) {
      out[key] = s;
    } else {
      // type drifted (e.g. a number became a string) - trust the default
      out[key] = clone(d);
    }
  }
  return out;
}

function clone(v) {
  if (v === null || typeof v !== 'object') return v;
  return JSON.parse(JSON.stringify(v));
}

/**
 * @param {string} dir   directory to keep pip-data.json in
 * @param {object} [log] optional logger with .warn/.error
 */
function createStorage(dir, log) {
  const file = path.join(dir, 'pip-data.json');
  const tmp = file + '.tmp';
  const noop = () => {};
  const warn = (log && log.warn) || noop;
  const error = (log && log.error) || noop;

  let data = clone(DEFAULTS);

  function load() {
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (err) {
      // no file yet - first run
      data = clone(DEFAULTS);
      return data;
    }
    try {
      // A UTF-8 byte-order mark is not corruption. Notepad and PowerShell 5.1
      // both write one, and JSON.parse rejects it - so without this, hand-
      // editing the file on Windows silently reset every setting and stat.
      data = sanitize(mergeDefaults(DEFAULTS, JSON.parse(raw.replace(/^\uFEFF/, ''))));
    } catch (err) {
      // Corrupt. Keep a copy so nothing is silently destroyed, then reset.
      const backup = file + '.corrupt-' + Date.now() + '.bak';
      try {
        fs.writeFileSync(backup, raw, 'utf8');
        warn('settings file was corrupt, backed up to ' + backup);
      } catch (e2) {
        error('settings file was corrupt and the backup failed', e2);
      }
      data = clone(DEFAULTS);
    }
    return data;
  }

  function save() {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, file);
      return true;
    } catch (err) {
      error('could not save settings', err);
      try { fs.unlinkSync(tmp); } catch (e2) { /* nothing to clean up */ }
      return false;
    }
  }

  function get(key) {
    return key === undefined ? data : data[key];
  }

  /** Shallow-set one or more top-level keys, then persist. */
  function set(patch) {
    for (const k of Object.keys(patch)) {
      if (k in DEFAULTS) data[k] = patch[k];
    }
    save();
    return data;
  }

  return {
    file,
    load,
    save,
    get all() { return data; },
    get,
    set
  };
}

module.exports = {
  DEFAULTS,
  NUMBER_LIMITS,
  CHOICES,
  USER_KEYS,
  mergeDefaults,
  cleanPatch,
  sanitize,
  createStorage
};
