/*
 * history.test.js - the daily rows behind the settings window's streak calendar.
 *
 *   node --test test/history.test.js
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const history = require('../src/main/history.js');

const at = (s) => new Date(s).getTime();
const day = (date, pomodoros, water) => ({ date, pomodoros: pomodoros || 0, water: water || 0, longestStreakMs: 0 });

test('archive keeps a day with something in it, and skips an empty one', () => {
  assert.deepStrictEqual(history.archive([], day('2026-09-21', 2, 1)), [day('2026-09-21', 2, 1)]);
  assert.deepStrictEqual(history.archive([], day('2026-09-21')), []);
  assert.deepStrictEqual(history.archive([], { date: '', pomodoros: 3 }), [], 'a first-run blank day');
});

test('archive keeps one row per date, oldest first, and caps the list', () => {
  const list = [];
  for (let i = 0; i < history.KEEP_DAYS + 5; i++) {
    list.push(day(new Date(2026, 0, 1 + i, 12).toISOString().slice(0, 10), 1));
  }
  const out = history.archive(list.reverse(), day('2026-01-03', 9));
  assert.strictEqual(out.length, history.KEEP_DAYS);
  const dates = out.map((d) => d.date);
  assert.deepStrictEqual(dates, dates.slice().sort());
  assert.strictEqual(new Set(dates).size, dates.length);
});

test('clean throws away rows from disk that are not days, and repairs counts', () => {
  const out = history.clean([
    day('2026-09-20', 1),
    null, 'x', 7, [], { date: 'yesterday', water: 2 },
    { date: '2026-09-21', pomodoros: -4, water: 2.7, longestStreakMs: 'long' }
  ]);
  assert.deepStrictEqual(out, [
    day('2026-09-20', 1),
    { date: '2026-09-21', pomodoros: 0, water: 2, longestStreakMs: 0 }
  ]);
  assert.deepStrictEqual(history.clean('nope'), []);
  assert.deepStrictEqual(history.clean({ 0: day('2026-09-20', 1) }), []);
});

test('the calendar is four Monday-to-Sunday weeks ending with this one', () => {
  // Thursday 1 October 2026.
  const res = history.summarize([], day('2026-10-01'), at('2026-10-01T15:00'));
  assert.strictEqual(res.days.length, 28);
  assert.strictEqual(res.days[0].date, '2026-09-07', 'starts on a Monday three weeks back');
  assert.strictEqual(new Date(2026, 8, 7).getDay(), 1);
  assert.strictEqual(res.days[27].date, '2026-10-04', 'ends on this Sunday');
  assert.deepStrictEqual(res.days.filter((d) => d.today).map((d) => d.date), ['2026-10-01']);
  assert.deepStrictEqual(res.days.filter((d) => d.future).map((d) => d.date),
    ['2026-10-02', '2026-10-03', '2026-10-04']);
});

test('on a Monday the current week is today plus six days to come', () => {
  const res = history.summarize([], day('2026-10-05'), at('2026-10-05T08:00'));
  assert.strictEqual(res.days[21].date, '2026-10-05');
  assert.ok(res.days[21].today);
  assert.strictEqual(res.days.filter((d) => d.future).length, 6);
});

test('a daylight-saving change neither skips nor repeats a day', () => {
  // Europe and the US both change their clocks in the last weeks of October
  // or early November; wherever this runs, every date must appear once.
  const res = history.summarize([], day('2026-11-11'), at('2026-11-11T12:00'));
  const dates = res.days.map((d) => d.date);
  assert.strictEqual(new Set(dates).size, 28);
  for (let i = 1; i < dates.length; i++) {
    const gap = (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 86400000;
    assert.strictEqual(gap, 1, dates[i - 1] + ' to ' + dates[i]);
  }
});

test('levels: water lights a day, every two Pomodoros brighten it, capped at 4', () => {
  assert.strictEqual(history.level(day('d')), 0);
  assert.strictEqual(history.level(day('d', 0, 3)), 1);
  assert.strictEqual(history.level(day('d', 1)), 1);
  assert.strictEqual(history.level(day('d', 2)), 2);
  assert.strictEqual(history.level(day('d', 5)), 3);
  assert.strictEqual(history.level(day('d', 12)), 4);
});

test('this week adds up Monday to today, and nothing before', () => {
  const list = [day('2026-09-28', 3, 2), day('2026-09-30', 1, 4), day('2026-09-27', 8, 8)];
  const res = history.summarize(list, day('2026-10-01', 2, 1), at('2026-10-01T15:00'));
  assert.deepStrictEqual(res.week, { pomodoros: 6, water: 7, activeDays: 3 });
});

test('the streak counts back from today, or from yesterday before today starts', () => {
  const list = [day('2026-09-28', 1), day('2026-09-29', 0, 1), day('2026-09-30', 2)];
  const morning = history.summarize(list, day('2026-10-01'), at('2026-10-01T07:00'));
  assert.strictEqual(morning.streak, 3, 'not broken just because nothing has happened yet today');

  const later = history.summarize(list, day('2026-10-01', 1), at('2026-10-01T15:00'));
  assert.strictEqual(later.streak, 4);

  const gap = history.summarize([day('2026-09-28', 1), day('2026-09-30', 1)], day('2026-10-01', 1),
    at('2026-10-01T15:00'));
  assert.strictEqual(gap.streak, 2, 'a missed day ends the streak');

  assert.strictEqual(history.summarize([], day('2026-10-01'), at('2026-10-01T15:00')).streak, 0);
});

test('yesterday\'s tallies are not shown as today\'s', () => {
  // `today` is only rolled at the next poll; until then it is still yesterday.
  const res = history.summarize([], day('2026-09-30', 4, 4), at('2026-10-01T00:00:03'));
  const today = res.days.find((d) => d.today);
  assert.deepStrictEqual([today.pomodoros, today.water], [0, 0]);
});
