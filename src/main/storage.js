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

  // work habits, all in minutes
  pomodoroWork: 25,
  pomodoroBreak: 5,
  pomodoroLongBreak: 15,
  pomodoroLongEvery: 4,
  drowsyAfter: 50,
  exhaustedAfter: 90,
  waterInterval: 45,

  // persisted runtime state
  onboarded: false,
  hidden: false,
  mood: 60,
  moodUpdatedAt: 0,
  quietUntil: 0,
  lastGoodMorning: 0,
  lastLateNightNudge: 0,

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

  lastPosition: null          // {x, y} in DIPs, or null
};

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
      data = mergeDefaults(DEFAULTS, JSON.parse(raw));
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

module.exports = { DEFAULTS, mergeDefaults, createStorage };
