/*
 * scope.test.js - the overlay's scripts must not trample each other.
 *
 * Every other test require()s a renderer module on its own, which gives it a
 * private module scope. The overlay does not: it loads the same files as
 * plain <script> tags, and those all share ONE global scope. A top-level
 * `function clamp` in bubbles.js silently replaced the one in physics.js, and
 * a top-level `function create` replaced the one in particles.js - so in the
 * real app Physics.step never clamped (Pip slid through walls and respawned)
 * and every particle was secretly a speech bubble that drew nothing and never
 * died. All 151 tests passed throughout.
 *
 * So this file loads the scripts the way the browser does: into one shared
 * context, in overlay.html's order, and then checks they still work.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/** The <script src> list of an HTML page, resolved to repo paths, in order. */
function scriptsOf(htmlPath) {
  const html = fs.readFileSync(path.join(ROOT, htmlPath), 'utf8');
  const dir = path.dirname(htmlPath);
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)]
    .map((m) => path.join(dir, m[1]).replace(/\\/g, '/'));
}

/** Everything the overlay loads except renderer.js, which needs a real DOM. */
const OVERLAY_MODULES = scriptsOf('src/renderer/overlay.html')
  .filter((p) => !p.endsWith('/renderer.js'));

/** Every script any of Pip's three pages loads. */
const ALL_PAGE_SCRIPTS = [...new Set([
  ...scriptsOf('src/renderer/overlay.html'),
  ...scriptsOf('src/settings/settings.html'),
  ...scriptsOf('src/debug/debug.html')
])];

/** A browser-ish global scope shared by every script run in it. */
function loadShared(files) {
  const ctx = { console: console };
  ctx.window = ctx;
  vm.createContext(ctx);
  const before = new Set(Object.keys(ctx));
  for (const file of files) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    vm.runInContext(src, ctx, { filename: file });
  }
  const leaked = Object.keys(ctx).filter((k) => !before.has(k));
  return { ctx: ctx, Pip: ctx.Pip, leaked: leaked };
}

test('the overlay page still loads every module it relies on', () => {
  for (const name of ['palettes.js', 'sprites.js', 'animations.js', 'physics.js',
    'particles.js', 'bubbles.js']) {
    assert.ok(OVERLAY_MODULES.some((p) => p.endsWith('/' + name)),
      'overlay.html no longer loads ' + name);
  }
});

test('no page script declares anything at the top level', () => {
  // Const, let and class collisions throw loudly; function and var ones do
  // not, they just overwrite. The only safe rule is "declare nothing".
  const offenders = [];
  for (const file of ALL_PAGE_SCRIPTS) {
    const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (/^(const|let|var|function|async function|class)\b/.test(line)) {
        offenders.push(file + ':' + (i + 1) + '  ' + line.trim());
      }
    });
  }
  assert.deepStrictEqual(offenders, [],
    'wrap the module in (function () { ... })(); - these leak into the shared scope');
});

test('loading the overlay modules together adds nothing to the page but window.Pip', () => {
  const { leaked } = loadShared(OVERLAY_MODULES);
  assert.deepStrictEqual(leaked, ['Pip']);
});

test('particles are real particles when loaded alongside bubbles.js', () => {
  const { Pip } = loadShared(OVERLAY_MODULES);
  const list = Pip.Particles.spawn([], 'heart', 100, 100, 3);
  assert.strictEqual(list.length, 3);
  for (const p of list) {
    assert.strictEqual(p.kind, 'heart', 'spawn built something that is not a particle');
    assert.ok(p.life > 0 && typeof p.age === 'number');
  }
  // ...and they die, rather than sitting in the list keeping the loop awake.
  let alive = list;
  for (let i = 0; i < 60; i++) alive = Pip.Particles.update(alive, 0.1);
  assert.strictEqual(alive.length, 0, 'particles never expired');
});

test('physics still clamps at the walls when loaded alongside bubbles.js', () => {
  const { Pip } = loadShared(OVERLAY_MODULES);
  const bounds = { left: 64, right: 1216, top: 64, bottom: 672, height: 128 };
  const body = Pip.Physics.createBody(1200, 672);
  body.grounded = true;
  body.vx = 2000;

  const ev = Pip.Physics.step(body, 0.05, bounds, {});

  assert.ok(!ev.respawned, 'a fast slide into the wall respawned Pip: ' + ev.reason);
  assert.strictEqual(body.x, bounds.right, 'Pip went through the wall');
  assert.strictEqual(body.vx, 0, 'the wall should stop him');
});

test('bubbles still lay out when loaded alongside physics.js', () => {
  const { Pip } = loadShared(OVERLAY_MODULES);
  const b = Pip.Bubbles.create('Hello!', 0);
  const lay = Pip.Bubbles.layout(b, { left: 2, top: 400, width: 128, height: 128 },
    { width: 800, height: 600 }, null);
  assert.ok(lay.x >= Pip.Bubbles.MARGIN, 'the bubble was not kept on screen');
  assert.ok(lay.w > 0 && lay.h > 0);
});
