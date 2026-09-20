/*
 * storage.test.js - settings on disk must never be able to stop Pip starting.
 *
 * Every test gets its own temp directory, so nothing here touches a real
 * userData folder and the tests can run in any order.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DEFAULTS, mergeDefaults, createStorage } = require('../src/main/storage.js');

/** A throwaway userData folder, removed when the test finishes. */
function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pip-storage-'));
  t.after(() => { fs.rmSync(dir, { recursive: true, force: true }); });
  return dir;
}

/** Collects what storage reported instead of printing it. */
function fakeLog() {
  const log = { warns: [], errors: [] };
  log.warn = (...args) => log.warns.push(args.join(' '));
  log.error = (...args) => log.errors.push(args.join(' '));
  return log;
}

function writeData(dir, value) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  fs.writeFileSync(path.join(dir, 'pip-data.json'), raw, 'utf8');
}

test('load returns the defaults when there is no file yet', (t) => {
  const dir = tempDir(t);
  const st = createStorage(dir, fakeLog());

  const data = st.load();

  assert.deepStrictEqual(data, DEFAULTS);
  assert.notStrictEqual(data, DEFAULTS, 'and a copy, so callers cannot mutate them');
  assert.strictEqual(fs.existsSync(path.join(dir, 'pip-data.json')), false, 'loading writes nothing');
});

test('saved values merge over the defaults and unknown keys are dropped', (t) => {
  const dir = tempDir(t);
  writeData(dir, { flavor: 'lime', waterInterval: 20, somethingFromTheFuture: 'hello' });

  const data = createStorage(dir, fakeLog()).load();

  assert.strictEqual(data.flavor, 'lime');
  assert.strictEqual(data.waterInterval, 20);
  assert.strictEqual(data.notifications, DEFAULTS.notifications, 'untouched keys keep their default');
  assert.ok(!('somethingFromTheFuture' in data), 'keys the defaults do not know about are dropped');
});

test('a key whose type drifted falls back to the default', (t) => {
  const dir = tempDir(t);
  writeData(dir, {
    mood: 'quite good',        // string where a number belongs
    notifications: 0,          // number where a boolean belongs
    pomodoroWork: '30',
    flavor: 'grape'            // ...and one that is fine
  });

  const data = createStorage(dir, fakeLog()).load();

  assert.strictEqual(data.mood, DEFAULTS.mood);
  assert.strictEqual(data.notifications, DEFAULTS.notifications);
  assert.strictEqual(data.pomodoroWork, DEFAULTS.pomodoroWork);
  assert.strictEqual(data.flavor, 'grape', 'the good key still gets through');
});

test('nested objects merge key by key', (t) => {
  const dir = tempDir(t);
  writeData(dir, {
    pomodoro: { phase: 'work', startedAt: 1234 },
    today: { water: 3 }
  });

  const data = createStorage(dir, fakeLog()).load();

  assert.strictEqual(data.pomodoro.phase, 'work');
  assert.strictEqual(data.pomodoro.startedAt, 1234);
  assert.strictEqual(data.pomodoro.completed, DEFAULTS.pomodoro.completed, 'missing nested key defaults');
  assert.strictEqual(data.today.water, 3);
  assert.strictEqual(data.today.date, DEFAULTS.today.date);
  assert.strictEqual(data.today.pomodoros, DEFAULTS.today.pomodoros);
});

test('a nested object replaced by a scalar falls back wholesale', (t) => {
  const dir = tempDir(t);
  writeData(dir, { today: 5, pomodoro: null });

  const data = createStorage(dir, fakeLog()).load();

  assert.deepStrictEqual(data.today, DEFAULTS.today);
  assert.deepStrictEqual(data.pomodoro, DEFAULTS.pomodoro);
});

test('a nullable default still accepts a real value', () => {
  // Exercised against a fixture rather than a production key, so the check
  // survives defaults being added or removed.
  const defaults = { position: null, name: 'pip' };

  assert.deepStrictEqual(
    mergeDefaults(defaults, { position: { x: 12, y: 34 } }),
    { position: { x: 12, y: 34 }, name: 'pip' });

  // ...and falls back when the saved file has nothing for it.
  assert.deepStrictEqual(mergeDefaults(defaults, {}), { position: null, name: 'pip' });
});

test('mergeDefaults handles rubbish without throwing', () => {
  assert.deepStrictEqual(mergeDefaults(DEFAULTS, null), DEFAULTS);
  assert.deepStrictEqual(mergeDefaults(DEFAULTS, 'nope'), DEFAULTS);
  assert.deepStrictEqual(mergeDefaults(DEFAULTS, []), DEFAULTS);
  assert.deepStrictEqual(mergeDefaults(DEFAULTS, undefined), DEFAULTS);
});

test('a corrupt file is backed up and replaced with defaults', (t) => {
  const dir = tempDir(t);
  const corrupt = '{ "flavor": "lime", this is not json';
  writeData(dir, corrupt);
  const log = fakeLog();
  const st = createStorage(dir, log);

  let data;
  assert.doesNotThrow(() => { data = st.load(); }, 'loading a corrupt file never throws');
  assert.deepStrictEqual(data, DEFAULTS);

  const backups = fs.readdirSync(dir).filter((f) => /^pip-data\.json\.corrupt-\d+\.bak$/.test(f));
  assert.strictEqual(backups.length, 1, 'exactly one backup was kept');
  assert.strictEqual(fs.readFileSync(path.join(dir, backups[0]), 'utf8'), corrupt, 'byte for byte');
  assert.strictEqual(log.warns.length, 1, 'and it was reported');
  assert.match(log.warns[0], /corrupt/);
});

test('save then load round-trips, including nested state', (t) => {
  const dir = tempDir(t);
  const first = createStorage(dir, fakeLog());
  first.load();

  first.set({ flavor: 'blueberry', mood: 12, petSize: 'large' });
  first.all.pomodoro.phase = 'break';
  first.all.today.water = 4;
  assert.strictEqual(first.save(), true);

  const second = createStorage(dir, fakeLog()).load();

  assert.strictEqual(second.flavor, 'blueberry');
  assert.strictEqual(second.mood, 12);
  assert.strictEqual(second.petSize, 'large');
  assert.strictEqual(second.pomodoro.phase, 'break');
  assert.strictEqual(second.today.water, 4);
  assert.strictEqual(second.exhaustedAfter, DEFAULTS.exhaustedAfter, 'and everything else is untouched');
});

test('set ignores keys the defaults do not define', (t) => {
  const dir = tempDir(t);
  const st = createStorage(dir, fakeLog());
  st.load();

  st.set({ flavor: 'lemon', sneaky: true });

  assert.strictEqual(st.get('flavor'), 'lemon');
  assert.ok(!('sneaky' in st.all));
  assert.ok(!('sneaky' in createStorage(dir, fakeLog()).load()), 'and it never reaches the file');
});

test('save writes no leftover temp file', (t) => {
  const dir = tempDir(t);
  const st = createStorage(dir, fakeLog());
  st.load();
  st.save();

  assert.deepStrictEqual(fs.readdirSync(dir), ['pip-data.json']);
});
