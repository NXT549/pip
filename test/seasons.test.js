/*
 * seasons.test.js - Pip dresses up for the season, and the user's choice wins.
 *
 *   node --test test/seasons.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const seasons = require('../src/main/seasons.js');
const Palettes = require('../src/renderer/palettes.js');

const at = (s) => new Date(s).getTime();
const NONE = { key: '', flavor: '', previous: '' };

test('every season hands out a real flavour, and no two overlap', () => {
  const taken = {};
  for (const s of seasons.SEASONS) {
    assert.ok(Palettes.FLAVOR_NAMES.includes(s.flavor), s.name + ' wears an unknown flavour');
    for (let m = s.from[0]; m <= s.to[0]; m++) {
      for (let d = m === s.from[0] ? s.from[1] : 1; d <= (m === s.to[0] ? s.to[1] : 31); d++) {
        const key = m + '-' + d;
        assert.ok(!taken[key], s.name + ' overlaps ' + taken[key] + ' on ' + key);
        taken[key] = s.name;
      }
    }
  }
});

test('seasonAt knows the first and last day of a season, in local time', () => {
  assert.strictEqual(seasons.seasonAt(at('2026-09-30T23:59:59')), null);
  assert.strictEqual(seasons.seasonAt(at('2026-10-01T00:00:00')).flavor, 'pumpkin');
  assert.strictEqual(seasons.seasonAt(at('2026-10-31T23:59:59')).flavor, 'pumpkin');
  assert.strictEqual(seasons.seasonAt(at('2026-11-01T00:00:00')), null);
  assert.strictEqual(seasons.seasonAt(at('2026-12-25T12:00:00')).flavor, 'candycane');
  assert.strictEqual(seasons.seasonAt(at('2027-01-01T00:00:00')), null);
  assert.strictEqual(seasons.seasonAt(at('2027-02-14T20:00:00')).flavor, 'bubblegum');
  assert.strictEqual(seasons.seasonAt(at('2027-02-15T00:00:00')), null);
});

test('a season starting changes Pip and remembers what he wore', () => {
  const res = seasons.step({ flavor: 'lime', seasonal: true, season: NONE }, at('2026-10-01T09:00'));
  assert.strictEqual(res.flavor, 'pumpkin');
  assert.strictEqual(res.event, 'start');
  assert.deepStrictEqual(res.season, { key: 'halloween-2026', flavor: 'pumpkin', previous: 'lime' });
});

test('nothing happens while the season carries on', () => {
  const season = { key: 'halloween-2026', flavor: 'pumpkin', previous: 'lime' };
  const res = seasons.step({ flavor: 'pumpkin', seasonal: true, season }, at('2026-10-20T09:00'));
  assert.deepStrictEqual(res, { flavor: 'pumpkin', season: season, event: null });
  assert.strictEqual(res.season, season, 'the same object back, so main can tell nothing changed');
});

test('the season ending changes him back', () => {
  const season = { key: 'halloween-2026', flavor: 'pumpkin', previous: 'lime' };
  const res = seasons.step({ flavor: 'pumpkin', seasonal: true, season }, at('2026-11-01T00:00'));
  assert.deepStrictEqual(res, { flavor: 'lime', season: NONE, event: 'end' });
});

test('a flavour picked mid-season is kept, and the season is not handed out again', () => {
  const season = { key: 'halloween-2026', flavor: 'pumpkin', previous: 'lime' };
  const mid = seasons.step({ flavor: 'grape', seasonal: true, season }, at('2026-10-20T09:00'));
  assert.strictEqual(mid.flavor, 'grape');
  assert.strictEqual(mid.event, null);
  const after = seasons.step({ flavor: 'grape', seasonal: true, season }, at('2026-11-01T09:00'));
  assert.deepStrictEqual(after, { flavor: 'grape', season: NONE, event: null });
});

test('switching the setting off mid-season changes him straight back', () => {
  const season = { key: 'halloween-2026', flavor: 'pumpkin', previous: 'lemon' };
  const res = seasons.step({ flavor: 'pumpkin', seasonal: false, season }, at('2026-10-20T09:00'));
  assert.deepStrictEqual(res, { flavor: 'lemon', season: NONE, event: 'end' });
});

test('with the setting off, no season is handed out', () => {
  const res = seasons.step({ flavor: 'lime', seasonal: false, season: NONE }, at('2026-10-20T09:00'));
  assert.deepStrictEqual(res, { flavor: 'lime', season: NONE, event: null });
});

test('already wearing the seasonal flavour is no event, and he keeps it afterwards', () => {
  const start = seasons.step({ flavor: 'pumpkin', seasonal: true, season: NONE }, at('2026-10-01T09:00'));
  assert.strictEqual(start.event, null);
  assert.strictEqual(start.season.previous, 'pumpkin');
  const end = seasons.step({ flavor: 'pumpkin', seasonal: true, season: start.season }, at('2026-11-01T09:00'));
  assert.deepStrictEqual(end, { flavor: 'pumpkin', season: NONE, event: null });
});

test('next year is a new season', () => {
  const lastYear = { key: 'winter-2026', flavor: 'candycane', previous: 'cherry' };
  // Pip was not running from December until the next one.
  const res = seasons.step({ flavor: 'candycane', seasonal: true, season: lastYear }, at('2027-12-02T09:00'));
  assert.strictEqual(res.season.key, 'winter-2027');
  assert.strictEqual(res.flavor, 'candycane');
  assert.strictEqual(res.season.previous, 'cherry', 'the year-old "previous" survives the handover');
});

test('a hand-edited season cannot leave Pip in an unknown flavour', () => {
  const junk = { key: 'halloween-2026', flavor: 'pumpkin', previous: 'banana' };
  const res = seasons.step({ flavor: 'pumpkin', seasonal: true, season: junk }, at('2026-11-02T09:00'));
  assert.strictEqual(res.flavor, Palettes.DEFAULT_FLAVOR);
  for (const bad of [null, undefined, 'x', { key: 5 }]) {
    assert.doesNotThrow(() => seasons.step({ flavor: 'lime', seasonal: true, season: bad }, at('2026-06-01')));
  }
});
