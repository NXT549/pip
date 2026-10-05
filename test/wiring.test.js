/*
 * wiring.test.js - nothing in Pip is allowed to be half-connected.
 *
 * These are the checks that catch the failure mode you cannot see by reading
 * one file: a clip that exists but is never played, a speech situation with
 * no caller, an IPC channel that only one side knows about, or a menu action
 * with no handler. Each of those looks fine locally and is dead in practice.
 *
 * It works by reading the source as text rather than by running Electron,
 * which keeps it fast and keeps `npm test` free of a display dependency.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const mainSrc = read('main.js');
const rendererSrc = read('src/renderer/renderer.js');
const brainSrc = read('src/main/brain.js');
const preloadSrc = read('preload.js');
const allSrc = mainSrc + rendererSrc + brainSrc;

const Animations = require('../src/renderer/animations.js');
const Lines = require('../src/renderer/lines.js');
const Particles = require('../src/renderer/particles.js');

/** Channel names declared in one of preload's allow-lists. */
function channelsIn(marker) {
  const block = preloadSrc.split(marker)[1].split('];')[0];
  return [...block.matchAll(/^\s*'(pip:[^']+)'/gm)].map((m) => m[1]);
}

const quoted = (name) => new RegExp("['\"]" + name + "['\"]");

test('every animation clip is actually reachable', () => {
  const dead = Animations.CLIP_NAMES.filter((name) => !quoted(name).test(allSrc));
  assert.deepStrictEqual(dead, [],
    'these clips exist but nothing ever selects them: ' + dead.join(', '));
});

test('every speech situation has a caller', () => {
  // Match an actual say() call. A bare substring search passes on unrelated
  // matches - 'dizzy' also appears as a clip name and a reaction duration,
  // which hid the fact that it was never spoken.
  //
  // The onboarding lines are the one legitimate indirection: they are held in
  // a table and fed to say() by index, so the table is parsed and checked to
  // be wired rather than being waved through.
  const table = mainSrc.match(/const ONBOARDING = \[([^\]]*)\]/);
  assert.ok(table, 'the ONBOARDING sequence table has gone missing');
  assert.ok(/say\(\s*ONBOARDING\[/.test(mainSrc),
    'ONBOARDING is declared but never passed to say()');
  const viaTable = [...table[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

  const dead = Lines.SITUATIONS.filter((s) =>
    !new RegExp("say\\(\\s*'" + s + "'").test(mainSrc) && !viaTable.includes(s));
  assert.deepStrictEqual(dead, [],
    'these situations have lines written but are never said: ' + dead.join(', '));
});

test('every particle kind gets spawned somewhere', () => {
  const dead = Particles.KINDS.filter((kind) => !quoted(kind).test(allSrc));
  assert.deepStrictEqual(dead, [],
    'these particle kinds are defined but never spawned: ' + dead.join(', '));
});

test('main sends every inbound channel and the renderer listens for it', () => {
  const problems = [];
  for (const channel of channelsIn('const INBOUND = [')) {
    if (!mainSrc.includes("'" + channel + "'")) problems.push(channel + ': main never sends it');
    if (!rendererSrc.includes("'" + channel + "'")) problems.push(channel + ': renderer never listens');
  }
  assert.deepStrictEqual(problems, []);
});

test('the renderer sends every outbound channel and main handles it', () => {
  const problems = [];
  for (const channel of channelsIn('const OUTBOUND = [')) {
    if (!rendererSrc.includes("'" + channel + "'")) problems.push(channel + ': renderer never sends it');
    if (!mainSrc.includes("ipcMain.on('" + channel + "'")) problems.push(channel + ': no ipcMain.on in main');
  }
  assert.deepStrictEqual(problems, []);
});

test('the settings and debug surfaces are handled in main', () => {
  for (const channel of ['settings:get', 'settings:set', 'settings:action', 'settings:update',
    'debug:state', 'debug:force']) {
    assert.ok(mainSrc.includes(channel), channel + ' is never handled in main.js');
  }
});

test('every shared menu action has a handler', () => {
  // The tray menu, Pip's right-click menu and the settings window all funnel
  // through doAction, so a typo here is a silently dead menu item.
  const actions = ['pomodoro-toggle', 'water', 'feed', 'call', 'quiet',
    'toggle-visible', 'reset-position', 'settings', 'debug', 'quit'];
  for (const action of actions) {
    assert.ok(mainSrc.includes("case '" + action + "'"),
      'doAction has no case for ' + action);
  }
  // ...and every button in the settings window names a real action.
  const settingsHtml = read('settings/settings.html');
  const used = [...settingsHtml.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]);
  for (const action of used) {
    assert.ok(actions.includes(action),
      'settings.html uses an action main does not implement: ' + action);
  }
});

test('the overlay loads every renderer module it uses', () => {
  const html = read('src/renderer/overlay.html');
  for (const file of ['palettes.js', 'sprites.js', 'animations.js', 'physics.js',
    'particles.js', 'bubbles.js', 'renderer.js']) {
    assert.ok(html.includes('src="' + file + '"'), 'overlay.html does not load ' + file);
  }
});

test('no module is left with a TODO or a stub', () => {
  const files = [
    'main.js', 'preload.js',
    'src/main/brain.js', 'src/main/pomodoro.js', 'src/main/reminders.js',
    'src/main/mood.js', 'src/main/clicks.js', 'src/main/storage.js', 'src/main/logger.js',
    'src/main/seasons.js', 'src/main/history.js',
    'src/renderer/renderer.js', 'src/renderer/physics.js', 'src/renderer/particles.js',
    'src/renderer/bubbles.js', 'src/renderer/lines.js', 'src/renderer/animations.js',
    'src/renderer/palettes.js',
    'settings/settings.js', 'debug/debug.js'
  ];
  for (const file of files) {
    const src = read(file);
    // Deliberately not checking for "XXX": particle art uses X as a pixel.
    assert.ok(!/\bTODO\b|\bFIXME\b|\bHACK\b/.test(src), file + ' still contains a TODO/FIXME');
    assert.ok(!/not implemented|unimplemented/i.test(src), file + ' mentions something unimplemented');
  }
});

test('pressing on Pip is not reported as a grab until he is lifted', () => {
  // Main only lets go of a grab on a drop. When mousedown sent pip:grabbed,
  // every plain click left Pip dangling, and `held` outranks every state.
  const down = rendererSrc.split("addEventListener('mousedown'")[1].split('\n  });')[0];
  assert.ok(!down.includes('pip:grabbed'), 'mousedown must not report a grab');
  assert.ok(/drag\.moved = true;\s*[\s\S]{0,400}notify\('pip:grabbed'/.test(rendererSrc),
    'the grab should be reported once the pointer actually moves Pip');
});
