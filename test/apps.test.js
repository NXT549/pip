/*
 * apps.test.js - turning the foreground window into a category.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const apps = require('../src/main/apps.js');

test('every mapped process lands on a known category', () => {
  for (const [proc, cat] of Object.entries(apps.PROCESSES)) {
    assert.ok(apps.CATEGORIES.indexOf(cat) !== -1, proc + ' maps to unknown ' + cat);
  }
  for (const [, cat] of apps.TITLE_RULES) assert.ok(apps.CATEGORIES.indexOf(cat) !== -1, cat);
});

test('process names are matched case-insensitively and without .exe', () => {
  assert.strictEqual(apps.categorize({ process: 'Code' }), 'code');
  assert.strictEqual(apps.categorize({ process: 'Code.exe' }), 'code');
  assert.strictEqual(apps.categorize({ process: 'WindowsTerminal' }), 'terminal');
  assert.strictEqual(apps.categorize({ process: 'Spotify' }), 'music');
  assert.strictEqual(apps.categorize({ process: 'Zoom' }), 'meeting');
  assert.strictEqual(apps.categorize({ process: 'something-unheard-of' }), 'other');
});

test('a browser tab is told apart by its title', () => {
  assert.strictEqual(apps.categorize({ process: 'chrome', title: 'Cats - YouTube' }), 'video');
  assert.strictEqual(apps.categorize({ process: 'msedge', title: 'My playlist - YouTube Music' }), 'music');
  assert.strictEqual(apps.categorize({ process: 'firefox', title: 'pip/main.js at main - GitHub' }), 'code');
  assert.strictEqual(apps.categorize({ process: 'chrome', title: 'Inbox (3) - Gmail' }), 'email');
  assert.strictEqual(apps.categorize({ process: 'chrome', title: 'Weather' }), 'browser');
});

test('titles are ignored entirely when they are switched off', () => {
  assert.strictEqual(apps.categorize({ process: 'chrome', title: 'Cats - YouTube' }, { titles: false }), 'browser');
});

test('a title never overrides a known app', () => {
  assert.strictEqual(apps.categorize({ process: 'Code', title: 'watching YouTube.md' }), 'code');
});

test('fullscreen counts, except for the desktop shell', () => {
  assert.strictEqual(apps.isFullscreen({ process: 'vlc', fs: true }), true);
  assert.strictEqual(apps.isFullscreen({ process: 'vlc', fs: false }), false);
  assert.strictEqual(apps.isFullscreen({ process: 'explorer', fs: true }), false);
  assert.strictEqual(apps.isFullscreen({ process: 'Pip', fs: true }), false);
  assert.strictEqual(apps.isFullscreen(null), false);
});

test('parseLine accepts the watcher format and rejects anything else', () => {
  assert.deepStrictEqual(apps.parseLine('{"p":"Code","t":"x","fs":false}'), { process: 'Code', title: 'x', fs: false });
  assert.deepStrictEqual(apps.parseLine('{"p":"vlc","fs":true}'), { process: 'vlc', title: '', fs: true });
  for (const bad of ['', 'not json', '{"t":"no process"}', '[]', 'null', '{"p":5}']) {
    assert.strictEqual(apps.parseLine(bad), null, bad);
  }
});
