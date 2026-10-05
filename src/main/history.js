/*
 * history.js - the days gone by, for the settings window's streak calendar.
 *
 * At local midnight main archives the day that just ended - its Pomodoros,
 * glasses of water and longest stretch - into `history`, a short list of
 * daily rows kept in pip-data.json. `summarize` turns that list plus today
 * into the calendar the settings window draws: four Monday-to-Sunday weeks
 * ending with this one, this week's totals, and the current day streak.
 *
 * A day "counts" towards the streak when it has at least one finished
 * Pomodoro or one logged glass of water: something you did on purpose, as
 * opposed to merely having the computer on.
 *
 * No Electron imports: the clock is passed in. Dates are local YYYY-MM-DD
 * keys, the same ones reminders.localDateKey makes, and days are stepped with
 * the Date constructor so a daylight-saving change never skips or repeats one.
 */

'use strict';

const { localDateKey } = require('./reminders.js');

/** How many past days are kept on disk. Comfortably more than the calendar shows. */
const KEEP_DAYS = 70;

/** The calendar is this many Monday-to-Sunday weeks, ending with this week. */
const CALENDAR_WEEKS = 4;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function count(v) {
  return typeof v === 'number' && isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** One stored row made safe, or null when it is not a day at all. */
function cleanDay(row) {
  if (!row || typeof row !== 'object' || !DATE_KEY.test(row.date)) return null;
  return {
    date: row.date,
    pomodoros: count(row.pomodoros),
    water: count(row.water),
    longestStreakMs: count(row.longestStreakMs)
  };
}

/**
 * Repair a history list loaded from disk: drop anything that is not a day,
 * keep one row per date (the last one wins), sort oldest first, and cap it.
 * @param {*} list
 * @returns {object[]}
 */
function clean(list) {
  if (!Array.isArray(list)) return [];
  const byDate = {};
  for (const row of list) {
    const day = cleanDay(row);
    if (day) byDate[day.date] = day;
  }
  return Object.keys(byDate).sort().slice(-KEEP_DAYS).map((k) => byDate[k]);
}

/**
 * Add a finished day to the history. An empty day is left out: its row would
 * say no more than the gap does.
 * @param {object[]} list
 * @param {object} day  the `today` object that just ended
 * @returns {object[]} a new list
 */
function archive(list, day) {
  const row = cleanDay(day);
  if (!row || !(row.pomodoros || row.water || row.longestStreakMs)) return clean(list);
  return clean((Array.isArray(list) ? list : []).concat([row]));
}

/** Does this day count towards the streak? */
function counts(day) {
  return !!day && (day.pomodoros > 0 || day.water > 0);
}

/**
 * How lit a calendar cell is, 0 to 4. Pomodoros drive it, since they are the
 * deliberate effort; a day with only water still gets the first step.
 */
function level(day) {
  if (!counts(day)) return 0;
  return 1 + Math.min(3, Math.floor(day.pomodoros / 2));
}

/** The local date `n` days after the one in `d`, at local noon. */
function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
}

/**
 * Everything the settings window needs to draw the calendar.
 *
 * @param {object[]} list   stored history
 * @param {object} today    today's tallies `{date, pomodoros, water, longestStreakMs}`
 * @param {number} ts       now
 * @returns {{
 *   days: {date, pomodoros, water, longestStreakMs, level, today, future}[],
 *   week: {pomodoros, water, activeDays},
 *   streak: number
 * }} `days` is CALENDAR_WEEKS * 7 cells, Monday first, oldest first.
 */
function summarize(list, today, ts) {
  const byDate = {};
  for (const row of clean(list)) byDate[row.date] = row;
  const todayKey = localDateKey(ts);
  // Today's row only counts if it really is today's; a stale one is yesterday.
  if (today && today.date === todayKey) byDate[todayKey] = cleanDay(today);
  const dayAt = (key) => byDate[key] || { date: key, pomodoros: 0, water: 0, longestStreakMs: 0 };

  const now = new Date(ts);
  const sinceMonday = (now.getDay() + 6) % 7;
  const firstMonday = addDays(now, -sinceMonday - 7 * (CALENDAR_WEEKS - 1));

  const days = [];
  const week = { pomodoros: 0, water: 0, activeDays: 0 };
  for (let i = 0; i < CALENDAR_WEEKS * 7; i++) {
    const key = localDateKey(addDays(firstMonday, i).getTime());
    const future = key > todayKey;
    const day = dayAt(key);
    days.push({
      date: key,
      pomodoros: day.pomodoros,
      water: day.water,
      longestStreakMs: day.longestStreakMs,
      level: future ? 0 : level(day),
      today: key === todayKey,
      future: future
    });
    if (i >= (CALENDAR_WEEKS - 1) * 7 && !future) {
      week.pomodoros += day.pomodoros;
      week.water += day.water;
      if (counts(day)) week.activeDays += 1;
    }
  }

  // The streak runs back from today - or from yesterday, so it is not shown
  // as broken just because you have not done anything yet this morning.
  let streak = 0;
  let cursor = counts(dayAt(todayKey)) ? now : addDays(now, -1);
  while (counts(dayAt(localDateKey(cursor.getTime())))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return { days: days, week: week, streak: streak };
}

module.exports = { KEEP_DAYS, CALENDAR_WEEKS, clean, archive, level, summarize };
