/*
 * main.test.js - main.js itself, run against a fake Electron.
 *
 * Every module main.js is built from is pure and well tested, and yet most of
 * the bugs Pip has shipped lived in main.js: the glue. A plain click left him
 * "held" forever because only a drop ever let go. Quiet mode was switched on
 * before its own announcement, which it then silenced. Reactions outlasted
 * their clips, and dev mode squeezed them to 30ms. None of that is visible
 * from a unit test of brain.js.
 *
 * So this file loads the real main.js with `electron` swapped for a small
 * fake, drives it through the same IPC channels the renderer uses, and runs
 * its timers on node:test's mock clock.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const Animations = require('../src/renderer/animations.js');
const Lines = require('../src/renderer/lines.js');
const { localDateKey } = require('../src/main/reminders.js');

const MAIN = require.resolve('../src/main.js');
const START = new Date('2026-09-21T10:00:00').getTime();
const MINUTE = 60000;

/** A minimal event emitter, enough for the Electron objects main.js touches. */
function emitter(target) {
  const handlers = {};
  target.on = (name, fn) => { (handlers[name] = handlers[name] || []).push(fn); return target; };
  target.once = target.on;
  target.emit = (name, ...args) => { for (const fn of handlers[name] || []) fn(...args); };
  return target;
}

/**
 * Boot main.js against a fake Electron.
 *
 * @param {object} t        the node:test context
 * @param {object} [opts]   {dev: boolean, data: object saved before boot,
 *                          start: the clock's starting time,
 *                          platform: process.platform as main.js sees it,
 *                          smoke: boot with --smoke, as the smoke test does,
 *                          env: environment variables main.js sees as it loads}
 */
async function boot(t, opts) {
  const o = Object.assign({ dev: false, data: {}, start: START, platform: 'win32', smoke: false, env: {} }, opts);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pip-main-'));
  const userData = o.dev ? path.join(root, 'Pip-dev') : root;
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(path.join(userData, 'pip-data.json'), JSON.stringify(Object.assign({
    // Skip the first-run and first-of-the-day scripts; tests start them on purpose.
    onboarded: true,
    lastGoodMorning: localDateKey(o.start)
  }, o.data)));

  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: o.start });

  const h = {
    sent: [],            // [channel, payload] sent to the overlay
    ipc: {},             // channel -> handler
    power: emitter({}),
    appEvents: emitter({}),
    idleSeconds: 0,
    cursor: { x: 600, y: 400 },
    windows: [],
    menus: [],
    errors: [],
    trays: [],
    calls: [],           // Electron calls only some platforms make, by name
    smokeOut: [],        // the SMOKE lines a smoke run prints
    userData: userData
  };

  const display = {
    id: 1,
    bounds: { x: 0, y: 0, width: 1280, height: 720 },
    workArea: { x: 0, y: 0, width: 1280, height: 672 }
  };

  class FakeWindow {
    constructor(options) {
      emitter(this);
      this.options = options;
      this.bounds = { x: options.x || 0, y: options.y || 0, width: options.width, height: options.height };
      this.ignoringMouse = null;
      this.visible = false;
      this.destroyed = false;
      const win = this;
      this.webContents = emitter({
        send: (channel, payload) => { if (win === h.windows[0]) h.sent.push([channel, payload]); },
        executeJavaScript: () => Promise.resolve([]),
        setWindowOpenHandler() {}
      });
      h.windows.push(this);
    }
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces(visible, options) { this.allSpaces = { visible: visible, options: options }; }
    setIgnoreMouseEvents(ignore) { this.ignoringMouse = ignore; }
    setMenu() {}
    loadFile() {}
    setResizable() {}
    getBounds() { return Object.assign({}, this.bounds); }
    setBounds(b) { this.bounds = Object.assign({}, b); }
    showInactive() { this.visible = true; }
    show() { this.visible = true; }
    hide() { this.visible = false; }
    focus() {}
    close() { this.destroyed = true; }
    reload() {}
    isVisible() { return this.visible; }
    isDestroyed() { return this.destroyed; }
  }

  class FakeTray {
    constructor() { emitter(this); h.trays.push(this); }
    setToolTip() {}
    setContextMenu(menu) { h.menus.push(menu); }
    isDestroyed() { return false; }
    destroy() {}
  }

  class FakeNotification {
    static isSupported() { return false; }
    show() {}
  }

  const paths = { appData: root, userData: root };
  const electron = {
    app: emitter({
      isPackaged: !o.dev,
      getPath: (name) => paths[name] || root,
      setPath: (name, value) => { paths[name] = value; },
      setAppUserModelId: () => h.calls.push('setAppUserModelId'),
      focus: () => h.calls.push('focus'),
      dock: { hide: () => h.calls.push('dock.hide') },
      requestSingleInstanceLock: () => true,
      disableHardwareAcceleration() {},
      whenReady: () => Promise.resolve(),
      getVersion: () => '0.0.0-test',
      setLoginItemSettings() {},
      quit() {},
      exit: (code) => h.calls.push('exit ' + code)
    }),
    BrowserWindow: FakeWindow,
    Tray: FakeTray,
    Menu: { buildFromTemplate: (items) => ({ items: items, popup() {} }) },
    ipcMain: {
      on: (channel, fn) => { h.ipc[channel] = fn; },
      handle: (channel, fn) => { h.ipc[channel] = fn; }
    },
    screen: emitter({
      getAllDisplays: () => [display],
      getPrimaryDisplay: () => display,
      getDisplayNearestPoint: () => display,
      getCursorScreenPoint: () => Object.assign({}, h.cursor)
    }),
    nativeImage: {
      createFromPath: () => ({ isEmpty: () => false }),
      createEmpty: () => ({ isEmpty: () => true })
    },
    powerMonitor: Object.assign(h.power, { getSystemIdleTime: () => h.idleSeconds }),
    Notification: FakeNotification
  };
  // app.on and powerMonitor.on are what main.js registers with.
  h.appEvents = electron.app;

  const silentLogger = {
    init() {},
    info() {},
    debug() {},
    warn() {},
    error: (...args) => h.errors.push(args.map(String).join(' ')),
    get file() { return null; }
  };

  // main.js registers process-wide handlers; do not let them pile up.
  const listenersBefore = {
    uncaughtException: process.listeners('uncaughtException'),
    unhandledRejection: process.listeners('unhandledRejection')
  };

  const load = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return electron;
    if (parent && parent.filename === MAIN && request === './src/main/logger.js') return silentLogger;
    return load.apply(this, arguments);
  };
  // main.js reads the platform, its flags and the environment once, as it loads.
  const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  const realArgv = process.argv;
  const realEnv = {};
  for (const name of Object.keys(o.env)) realEnv[name] = process.env[name];
  Object.defineProperty(process, 'platform', { value: o.platform, configurable: true });
  if (o.smoke) process.argv = realArgv.concat(['--smoke']);
  Object.assign(process.env, o.env);
  try {
    delete require.cache[MAIN];
    require(MAIN);
  } finally {
    Module._load = load;
    Object.defineProperty(process, 'platform', realPlatform);
    process.argv = realArgv;
    for (const name of Object.keys(realEnv)) {
      if (realEnv[name] === undefined) delete process.env[name];
      else process.env[name] = realEnv[name];
    }
  }

  // A smoke run reports on stdout, which belongs to the test runner here.
  if (o.smoke) {
    const write = process.stdout.write;
    t.mock.method(process.stdout, 'write', function (chunk) {
      if (/^SMOKE /.test(String(chunk))) { h.smokeOut.push(String(chunk).trim()); return true; }
      return write.apply(process.stdout, arguments);
    });
  }

  t.after(() => {
    for (const event of Object.keys(listenersBefore)) {
      for (const fn of process.listeners(event)) {
        if (!listenersBefore[event].includes(fn)) process.removeListener(event, fn);
      }
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  // app.whenReady() resolves on the microtask queue.
  await new Promise((resolve) => setImmediate(resolve));

  h.overlay = h.windows[0];
  h.fire = (channel, payload) => h.ipc[channel]({ sender: {} }, payload);
  // mock.timers.tick(ms) sets the clock to the end first and then runs every
  // timer that fell due, so all of them would see the same Date.now(). Step
  // it at the brain's own rate instead, the way real time passes.
  h.tick = (ms) => {
    for (let left = ms; left > 0; left -= 100) t.mock.timers.tick(Math.min(100, left));
  };
  h.states = () => h.sent.filter((m) => m[0] === 'pip:state').map((m) => m[1]);
  h.lastState = () => { const s = h.states(); return s[s.length - 1]; };
  h.said = () => h.sent.filter((m) => m[0] === 'pip:say').map((m) => m[1].text);
  h.saved = () => JSON.parse(fs.readFileSync(path.join(userData, 'pip-data.json'), 'utf8'));
  h.menuItem = (pattern) => {
    const menu = h.menus[h.menus.length - 1];
    return menu && menu.items.find((i) => pattern.test(i.label || ''));
  };
  h.assertHealthy = () => assert.deepStrictEqual(h.errors, [], 'main logged errors');

  h.fire('pip:ready', {});
  h.tick(200);
  return h;
}

test('main boots against the fake and starts sending Pip a state', async (t) => {
  const h = await boot(t);
  assert.ok(h.overlay, 'the overlay window was created');
  assert.ok(h.lastState(), 'no pip:state reached the renderer');
  assert.strictEqual(h.overlay.ignoringMouse, true, 'the overlay starts click-through');
  h.assertHealthy();
});

test('a plain click never leaves Pip held', async (t) => {
  const h = await boot(t);
  h.fire('pip:grabbed', {});
  h.tick(200);
  assert.strictEqual(h.lastState().state, 'held');

  // Pressed and released without moving: a click, not a drop.
  h.fire('pip:click', { x: 600, y: 600 });
  h.tick(1000);
  assert.notStrictEqual(h.lastState().state, 'held',
    'Pip was left dangling after a click - held outranks every other state');
  h.assertHealthy();
});

test('a reaction lasts as long as its clip, then Pip carries on', async (t) => {
  const h = await boot(t);
  h.fire('pip:pet', {});
  h.tick(200);
  assert.strictEqual(h.lastState().state, 'reaction');
  assert.strictEqual(h.lastState().clip, 'heart');

  h.tick(Animations.clipDuration('heart'));
  assert.notStrictEqual(h.lastState().state, 'reaction',
    'the reaction outlived its clip, leaving Pip frozen in the idle pose');
  h.assertHealthy();
});

test('petting twice replays the reaction rather than letting it lapse', async (t) => {
  const h = await boot(t);
  h.fire('pip:pet', {});
  h.tick(300);
  h.fire('pip:pet', {});
  h.tick(200);
  const hearts = h.states().filter((s) => s.state === 'reaction' && s.clip === 'heart');
  assert.strictEqual(hearts.length, 2, 'the second pet never reached the renderer');
  assert.notStrictEqual(hearts[0].seq, hearts[1].seq, 'so the renderer cannot replay it');
  h.assertHealthy();
});

test('dev mode speeds up the work timers, not the animations', async (t) => {
  const h = await boot(t, { dev: true });
  h.fire('pip:pet', {});
  h.tick(200);
  assert.strictEqual(h.lastState().clip, 'heart',
    'a reaction scaled by 1/60 is over before anyone can see it');
  h.assertHealthy();
});

test('a gentle set-down is not dizzy, but a throw is', async (t) => {
  const h = await boot(t);
  h.fire('pip:grabbed', {});
  h.fire('pip:dropped', { x: 400, y: 672, speed: 80, height: 10 });
  h.tick(200);
  assert.notStrictEqual(h.lastState().clip, 'dizzy');

  h.fire('pip:grabbed', {});
  h.fire('pip:dropped', { x: 400, y: 300, speed: 1800, height: 372 });
  h.tick(200);
  assert.strictEqual(h.lastState().clip, 'dizzy');
  h.assertHealthy();
});

test('quiet mode says so before it goes quiet', async (t) => {
  const h = await boot(t);
  const before = h.said().length;
  h.fire('settings:action', { action: 'quiet' });
  const lines = h.said().slice(before);
  assert.strictEqual(lines.length, 1, 'switching quiet mode on said nothing');
  assert.ok(Lines.variants('quiet_on').includes(lines[0]));

  // ...and then it really is quiet.
  h.fire('pip:click', { x: 600, y: 600 });
  h.tick(2000);
  assert.strictEqual(h.said().length, before + 1);
  h.assertHealthy();
});

test('quiet mode running out updates the tray menu', async (t) => {
  const h = await boot(t);
  h.fire('settings:action', { action: 'quiet' });
  h.tick(200);
  assert.strictEqual(h.menuItem(/^Quiet mode/).checked, true);

  h.tick(61 * MINUTE);
  assert.strictEqual(h.menuItem(/^Quiet mode/).checked, false,
    'the menu still claimed quiet mode an hour after it ended');
  h.assertHealthy();
});

test('a fresh renderer gets the mouse handed back to the desktop', async (t) => {
  const h = await boot(t);
  h.fire('pip:set-interactive', { interactive: true });
  assert.strictEqual(h.overlay.ignoringMouse, false);

  // The renderer crashed and reloaded while the cursor was on Pip.
  h.fire('pip:ready', {});
  assert.strictEqual(h.overlay.ignoringMouse, true,
    'a reloaded renderer left the overlay solid over the whole desktop');
  h.assertHealthy();
});

test('the settings window can only change settings, and only to sane values', async (t) => {
  const h = await boot(t);
  h.fire('settings:set', {
    patch: {
      flavor: 'lime',
      drowsyAfter: -5,
      waterInterval: 99999,
      petSize: 'enormous',
      mood: 0,
      pomodoro: { phase: 'work', startedAt: 1, completed: 0 }
    }
  });
  const saved = h.saved();
  assert.strictEqual(saved.flavor, 'lime');
  assert.strictEqual(saved.drowsyAfter, 5, 'clamped to the lowest the window allows');
  assert.strictEqual(saved.waterInterval, 600, 'clamped to the highest');
  assert.strictEqual(saved.petSize, 'medium', 'an unknown size is ignored');
  assert.notStrictEqual(saved.mood, 0, 'mood is not a setting');
  assert.strictEqual(saved.pomodoro.phase, 'off', 'nor is the Pomodoro');
  h.assertHealthy();
});

test('waking the machine greets you once, and not at the lock screen', async (t) => {
  const h = await boot(t);
  const welcomes = () => h.said().filter((s) => Lines.variants('welcome_back').includes(s)).length;

  h.power.emit('suspend');
  h.tick(10000);
  // Windows raises the lock screen straight after a resume.
  h.power.emit('resume');
  h.power.emit('lock-screen');
  h.tick(5000);
  assert.strictEqual(welcomes(), 0, 'Pip greeted a locked screen');

  h.power.emit('unlock-screen');
  h.tick(3000);
  assert.strictEqual(welcomes(), 1);

  // A stray second wake event straight after is not a second return.
  h.power.emit('resume');
  h.tick(3000);
  assert.strictEqual(welcomes(), 1);
  h.assertHealthy();
});

test('Pip is awake within a second or two of you coming back', async (t) => {
  const h = await boot(t);
  h.idleSeconds = 400;             // away from the desk
  h.tick(11000);
  assert.strictEqual(h.lastState().state, 'sleeping');

  h.idleSeconds = 0;               // back, and touching the mouse
  h.tick(1500);
  assert.notStrictEqual(h.lastState().state, 'sleeping',
    'Pip slept on for up to ten seconds, until the next idle poll');
  h.assertHealthy();
});

test('Pomodoro progress goes out about once a second, not ten times', async (t) => {
  const h = await boot(t);
  h.fire('settings:action', { action: 'pomodoro-toggle' });
  const before = h.sent.filter((m) => m[0] === 'pip:pomodoro').length;
  h.tick(10000);
  const sent = h.sent.filter((m) => m[0] === 'pip:pomodoro').length - before;
  assert.ok(sent >= 9 && sent <= 12, 'sent ' + sent + ' updates in 10 seconds');
  h.assertHealthy();
});

test('no window of Pip\'s can be navigated away', async (t) => {
  const h = await boot(t);
  const contents = emitter({ setWindowOpenHandler: (fn) => { contents.openHandler = fn; } });
  h.appEvents.emit('web-contents-created', {}, contents);

  let prevented = false;
  contents.emit('will-navigate', { preventDefault: () => { prevented = true; } }, 'file:///C:/dropped.txt');
  assert.ok(prevented, 'dropping a file on Pip would load it in his place');
  assert.deepStrictEqual(contents.openHandler({ url: 'https://example.com' }), { action: 'deny' });
  h.assertHealthy();
});

test('a glass just after midnight starts the new day, and the old one is filed away', async (t) => {
  // The day used to roll only when the reminders' own day changed - and
  // logging water rolls that quietly first. So a glass drunk before the next
  // idle poll landed on yesterday, and today then never rolled over at all.
  const h = await boot(t, { start: new Date('2026-09-21T23:59:55').getTime() });
  h.fire('settings:action', { action: 'water' });
  assert.deepStrictEqual([h.saved().today.date, h.saved().today.water], ['2026-09-21', 1]);

  h.tick(6000);                    // 00:00:01, before the next idle poll
  h.fire('settings:action', { action: 'water' });
  h.tick(3 * MINUTE);

  const saved = h.saved();
  assert.strictEqual(saved.today.date, '2026-09-22', 'today never rolled over');
  assert.strictEqual(saved.today.water, 1, 'the glass went on the wrong day');
  assert.deepStrictEqual(saved.history, [
    { date: '2026-09-21', pomodoros: 0, water: 1, longestStreakMs: 0 }
  ]);

  const payload = await h.ipc['settings:get']();
  const days = payload.history.days;
  assert.strictEqual(days.length, 28);
  assert.strictEqual(days.find((d) => d.today).date, '2026-09-22');
  assert.strictEqual(days.find((d) => d.date === '2026-09-21').water, 1);
  assert.strictEqual(payload.history.streak, 2);
  assert.deepStrictEqual(payload.history.week, { pomodoros: 0, water: 2, activeDays: 2 });
  h.assertHealthy();
});

test('Pip dresses up for October, says so, and changes back in November', async (t) => {
  const h = await boot(t, {
    start: new Date('2026-10-31T23:57:00').getTime(),
    data: { flavor: 'lime' }
  });
  const flavorSent = () => h.sent.filter((m) => m[0] === 'pip:settings').pop()[1].flavor;
  assert.strictEqual(h.saved().flavor, 'pumpkin');
  assert.strictEqual(flavorSent(), 'pumpkin');

  h.tick(11000);
  assert.ok(h.said().some((line) => Lines.variants('season_start').includes(line)),
    'the new look was never mentioned');

  h.tick(3 * MINUTE);
  const saved = h.saved();
  assert.strictEqual(saved.flavor, 'lime', 'Pip kept wearing pumpkin after Halloween');
  assert.strictEqual(saved.season.key, '');
  assert.strictEqual(flavorSent(), 'lime');
  h.assertHealthy();
});

test('a flavour picked mid-season is kept when the season ends', async (t) => {
  const h = await boot(t, {
    start: new Date('2026-10-31T23:58:00').getTime(),
    data: { flavor: 'lime' }
  });
  h.fire('settings:set', { patch: { flavor: 'grape' } });
  h.tick(3 * MINUTE);
  assert.strictEqual(h.saved().flavor, 'grape');
  h.assertHealthy();
});

test('switching seasonal flavours off changes Pip straight back', async (t) => {
  const h = await boot(t, {
    start: new Date('2026-10-15T12:00:00').getTime(),
    data: { flavor: 'blueberry' }
  });
  assert.strictEqual(h.saved().flavor, 'pumpkin');
  h.fire('settings:set', { patch: { seasonal: false } });
  assert.strictEqual(h.saved().flavor, 'blueberry');

  // ...and he stays that way, rather than being handed pumpkin again.
  h.tick(15000);
  assert.strictEqual(h.saved().flavor, 'blueberry');
  h.assertHealthy();
});

test('on a Mac, Pip stays out of the Dock and follows you across Spaces', async (t) => {
  const h = await boot(t, { platform: 'darwin' });
  assert.ok(h.calls.includes('dock.hide'), 'Pip showed up in the Dock and in Cmd-Tab');
  assert.ok(!h.calls.includes('setAppUserModelId'), 'a Windows-only call was made on a Mac');
  assert.deepStrictEqual(h.overlay.allSpaces,
    { visible: true, options: { visibleOnFullScreen: true, skipTransformProcessType: true } },
    'Pip was left behind on one Space; without skipping the transform he is back in the Dock');

  // A click on a menu bar icon opens its menu. It must not also hide Pip.
  h.trays[0].emit('click');
  assert.strictEqual(h.saved().hidden, false, 'clicking the menu bar icon hid Pip');

  // He opens his settings in front of you, not behind the app you are in.
  h.fire('settings:action', { action: 'settings' });
  assert.ok(h.calls.includes('focus'), 'the settings window opened behind everything');
  h.assertHealthy();
});

test('on Windows the tray click still hides Pip, and nothing Mac-only runs', async (t) => {
  const h = await boot(t);
  assert.ok(h.calls.includes('setAppUserModelId'));
  assert.ok(!h.calls.includes('dock.hide'));
  assert.strictEqual(h.overlay.allSpaces, undefined);
  h.trays[0].emit('click');
  assert.strictEqual(h.saved().hidden, true);
  h.assertHealthy();
});

test('on a Mac the onboarding points at the menu bar, not the tray', async (t) => {
  const h = await boot(t, { platform: 'darwin', data: { onboarded: false } });
  h.tick(20000);
  const said = h.said();
  assert.ok(said.some((line) => Lines.variants('onboarding_menubar').includes(line)),
    'the Mac onboarding never mentioned the menu bar');
  assert.ok(!said.some((line) => Lines.variants('onboarding_tray').includes(line)),
    'a Mac has no system tray to send anyone to');
  h.assertHealthy();
});

test('opening Pip.app again on a Mac brings him over, even from hiding', async (t) => {
  const h = await boot(t, { platform: 'darwin', data: { hidden: true } });
  h.appEvents.emit('activate', {}, false);
  h.tick(200);
  assert.strictEqual(h.saved().hidden, false, 'Pip stayed hidden');
  assert.strictEqual(h.lastState().clip, 'wave');
  h.tick(Animations.clipDuration('wave') + 200);
  assert.ok(h.sent.some((m) => m[0] === 'pip:goto' && m[1].x !== null), 'Pip never came over');
  h.assertHealthy();
});

test('a smoke run that hangs fails after 20 seconds', async (t) => {
  // The fake settings window is never ready to show, so this run hangs.
  const h = await boot(t, { smoke: true });
  assert.ok(h.smokeOut.includes('SMOKE OK all clips played in all flavors'));
  h.tick(19000);
  assert.ok(!h.calls.includes('exit 1'), 'the smoke run gave up early');
  h.tick(1000);
  assert.ok(h.calls.includes('exit 1'), 'a hung smoke run never failed');
  assert.ok(h.smokeOut.includes('SMOKE FAIL timed out'));
});

test('SMOKE_TIMEOUT_MS gives a slow smoke run longer, as CI does under Rosetta', async (t) => {
  const h = await boot(t, { smoke: true, env: { SMOKE_TIMEOUT_MS: '60000' } });
  h.tick(30000);
  assert.ok(!h.calls.includes('exit 1'),
    'the app kept its own 20 s deadline, so a run translated by Rosetta can never pass');
  h.tick(30000);
  assert.ok(h.calls.includes('exit 1'), 'a hung smoke run never failed');
  assert.ok(h.smokeOut.includes('SMOKE FAIL timed out'));
});
