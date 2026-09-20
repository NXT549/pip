/*
 * main.js - Pip's lifecycle.
 *
 * Owns the overlay window, the tray, the settings and debug windows, the
 * polling loops that watch the cursor and your idle time, the power events,
 * and every IPC channel. The renderer draws; this process decides.
 */

'use strict';

const path = require('path');
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, powerMonitor } = require('electron');

const logger = require('./src/main/logger.js');
const { createStorage } = require('./src/main/storage.js');
const brain = require('./src/main/brain.js');

/* ------------------------------------------------------------------ *
 * Flags and paths
 * ------------------------------------------------------------------ */

const IS_DEV = process.argv.includes('--dev') || !app.isPackaged;
const IS_SMOKE = process.argv.includes('--smoke');

/** Dev runs keep their own userData so testing never pollutes real stats. */
if (IS_DEV) {
  app.setPath('userData', path.join(app.getPath('appData'), 'Pip-dev'));
}

app.setAppUserModelId('com.pip.desktopbuddy');

/* ------------------------------------------------------------------ *
 * Single instance
 * ------------------------------------------------------------------ */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Someone launched Pip again. The running copy handles it; this one leaves.
  app.quit();
} else {
  start();
}

function start() {
  logger.init(path.join(app.getPath('userData'), 'logs'), IS_DEV);
  logger.info('Pip starting', { dev: IS_DEV, smoke: IS_SMOKE, version: app.getVersion() });

  const store = createStorage(app.getPath('userData'), logger);
  store.load();

  // Compatibility mode is read before the app is ready because turning off
  // hardware acceleration has to happen that early. It takes effect next launch.
  if (store.get('compatibilityMode')) {
    app.disableHardwareAcceleration();
    logger.info('compatibility mode on: hardware acceleration disabled');
  }

  runApp(store);
}

/* ------------------------------------------------------------------ *
 * The app
 * ------------------------------------------------------------------ */

function runApp(store) {
  /** @type {BrowserWindow|null} */
  let overlay = null;
  /** @type {Tray|null} */
  let tray = null;

  let currentDisplayId = null;
  let quitting = false;

  // Everything the brain needs that lives across ticks.
  const world = {
    wander: { dir: 0, until: 0, moving: false },
    reaction: null,
    behavior: null,
    held: false,
    asleep: false,
    thirsty: false,
    celebrateUntil: 0,
    continuousWorkMs: 0,
    climbing: false
  };

  let lastState = null;
  let cursorTimer = null;
  let brainTimer = null;

  const rng = IS_SMOKE ? brain.seededRng(1234) : Math.random;

  /* ---------------------------------------------------------------- *
   * Sizing
   * ---------------------------------------------------------------- */

  const SCALE_BY_SIZE = { small: 3, medium: 4, large: 5 };

  function scale() {
    return SCALE_BY_SIZE[store.get('petSize')] || 4;
  }

  function targetDisplay() {
    if (currentDisplayId !== null) {
      const found = screen.getAllDisplays().find((d) => d.id === currentDisplayId);
      if (found) return found;
    }
    return screen.getPrimaryDisplay();
  }

  /**
   * Fit the overlay to the work area of the display Pip is on. The work area
   * already excludes the taskbar wherever the user keeps it, including when it
   * auto-hides.
   */
  function fitToDisplay(display) {
    if (!overlay || overlay.isDestroyed()) return;
    const wa = display.workArea;
    currentDisplayId = display.id;
    // On Windows a non-resizable window can refuse setBounds, so briefly allow it.
    overlay.setResizable(true);
    overlay.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height });
    overlay.setResizable(false);
    overlay.setAlwaysOnTop(true, 'floating');
    sendBounds();
  }

  function sendBounds() {
    if (!overlay || overlay.isDestroyed()) return;
    const b = overlay.getBounds();
    overlay.webContents.send('pip:bounds', {
      left: 0, top: 0, right: b.width, bottom: b.height,
      width: b.width, height: b.height
    });
  }

  function sendSettings() {
    if (!overlay || overlay.isDestroyed()) return;
    overlay.webContents.send('pip:settings', {
      flavor: store.get('flavor'),
      scale: scale(),
      activityLevel: store.get('activityLevel'),
      quiet: Date.now() < store.get('quietUntil'),
      dev: IS_DEV
    });
  }

  /* ---------------------------------------------------------------- *
   * Overlay window
   * ---------------------------------------------------------------- */

  function createOverlay() {
    const display = targetDisplay();
    const wa = display.workArea;
    currentDisplayId = display.id;

    overlay = new BrowserWindow({
      x: wa.x,
      y: wa.y,
      width: wa.width,
      height: wa.height,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      show: false,
      acceptFirstMouse: true,
      title: 'Pip',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false
      }
    });

    overlay.setAlwaysOnTop(true, 'floating');
    // Click-through by default. `forward` keeps mousemove flowing to the
    // renderer so it can tell when the cursor is over Pip's actual pixels.
    overlay.setIgnoreMouseEvents(true, { forward: true });
    overlay.setMenu(null);

    overlay.loadFile(path.join(__dirname, 'src', 'renderer', 'overlay.html'));

    overlay.once('ready-to-show', () => {
      if (!store.get('hidden')) overlay.showInactive();
      sendSettings();
      sendBounds();
    });

    overlay.webContents.on('render-process-gone', (_e, details) => {
      logger.error('renderer gone', details);
      if (!quitting && overlay && !overlay.isDestroyed()) overlay.reload();
    });

    overlay.webContents.on('console-message', (_e, level, message) => {
      if (level >= 2) logger.warn('renderer:', message);
    });

    overlay.on('closed', () => { overlay = null; });
  }

  /* ---------------------------------------------------------------- *
   * Tray
   * ---------------------------------------------------------------- */

  function trayImage() {
    const file = path.join(__dirname, 'assets', 'tray.png');
    const img = nativeImage.createFromPath(file);
    return img.isEmpty() ? nativeImage.createEmpty() : img;
  }

  function buildMenu() {
    const hidden = store.get('hidden');
    return Menu.buildFromTemplate([
      { label: hidden ? 'Show Pip' : 'Hide Pip', click: () => toggleVisible() },
      { label: 'Reset position', click: () => resetPosition() },
      { type: 'separator' },
      { label: 'Quit Pip', click: () => quit() }
    ]);
  }

  function createTray() {
    tray = new Tray(trayImage());
    tray.setToolTip('Pip');
    tray.setContextMenu(buildMenu());
    tray.on('click', () => toggleVisible());
  }

  function refreshMenu() {
    if (tray && !tray.isDestroyed()) tray.setContextMenu(buildMenu());
  }

  /* ---------------------------------------------------------------- *
   * Actions
   * ---------------------------------------------------------------- */

  function toggleVisible() {
    const hidden = !store.get('hidden');
    store.set({ hidden: hidden });
    if (overlay && !overlay.isDestroyed()) {
      if (hidden) overlay.hide();
      else overlay.showInactive();
    }
    refreshMenu();
  }

  function resetPosition() {
    if (!overlay || overlay.isDestroyed()) return;
    fitToDisplay(targetDisplay());
    overlay.webContents.send('pip:reset');
    logger.info('position reset');
  }

  function quit() {
    quitting = true;
    if (cursorTimer) clearInterval(cursorTimer);
    if (brainTimer) clearInterval(brainTimer);
    if (tray && !tray.isDestroyed()) tray.destroy();
    app.quit();
  }

  /* ---------------------------------------------------------------- *
   * Polling
   * ---------------------------------------------------------------- */

  /** Cursor at ~20Hz, dropping to 5Hz while Pip is asleep or hidden. */
  function startCursorPolling() {
    let period = 0;
    const schedule = () => {
      const want = world.asleep || store.get('hidden') ? 200 : 50;
      if (want === period) return;
      period = want;
      if (cursorTimer) clearInterval(cursorTimer);
      cursorTimer = setInterval(pollCursor, period);
    };
    schedule();
    setInterval(schedule, 1000);
  }

  function pollCursor() {
    if (!overlay || overlay.isDestroyed() || !overlay.isVisible()) return;
    let point;
    try {
      point = screen.getCursorScreenPoint();
    } catch (err) {
      return;
    }
    const b = overlay.getBounds();
    const x = point.x - b.x;
    const y = point.y - b.y;
    overlay.webContents.send('pip:cursor', {
      x: x,
      y: y,
      inside: x >= 0 && y >= 0 && x < b.width && y < b.height
    });
  }

  /** The brain runs at 10Hz; state is only sent when something changed. */
  function startBrain() {
    brainTimer = setInterval(() => {
      const now = Date.now();
      const s = store.all;
      const result = brain.decide({
        now: now,
        rng: rng,
        held: world.held,
        asleep: world.asleep,
        celebrateUntil: world.celebrateUntil,
        thirsty: world.thirsty,
        continuousWorkMs: world.continuousWorkMs,
        drowsyAfterMs: s.drowsyAfter * 60000,
        exhaustedAfterMs: s.exhaustedAfter * 60000,
        reaction: world.reaction,
        behavior: world.behavior,
        wander: world.wander,
        quiet: now < s.quietUntil,
        hidden: s.hidden,
        mood: s.mood,
        hour: new Date(now).getHours(),
        activityLevel: s.activityLevel,
        climbing: world.climbing
      });
      world.wander = result.wander;

      const key = result.state + '|' + result.clip + '|' + result.walkDir + '|' + Math.round(result.walkSpeed);
      if (key === lastState) return;
      lastState = key;
      if (overlay && !overlay.isDestroyed()) {
        overlay.webContents.send('pip:state', {
          state: result.state,
          clip: result.clip,
          walkDir: result.walkDir,
          walkSpeed: result.walkSpeed
        });
      }
    }, 100);
  }

  /* ---------------------------------------------------------------- *
   * IPC
   * ---------------------------------------------------------------- */

  function wireIPC() {
    ipcMain.on('pip:ready', () => {
      logger.info('renderer ready');
      if (IS_SMOKE) runSmoke();
    });

    ipcMain.on('pip:set-interactive', (_e, payload) => {
      if (!overlay || overlay.isDestroyed()) return;
      // Solid while the cursor is on Pip, click-through everywhere else.
      overlay.setIgnoreMouseEvents(!payload.interactive, { forward: true });
    });

    ipcMain.on('pip:grabbed', () => { world.held = true; });

    ipcMain.on('pip:dropped', () => {
      world.held = false;
      // Follow the cursor to whichever display Pip was let go over.
      try {
        const point = screen.getCursorScreenPoint();
        const display = screen.getDisplayNearestPoint(point);
        if (display.id !== currentDisplayId) fitToDisplay(display);
      } catch (err) {
        logger.warn('could not resolve drop display', err);
      }
    });

    ipcMain.on('pip:click', (_e, payload) => {
      logger.debug('click', payload);
    });

    ipcMain.on('pip:context-menu', () => {
      buildMenu().popup({});
    });

    ipcMain.on('pip:error', (_e, payload) => {
      logger.error('renderer error:', payload && payload.message, payload && payload.stack);
    });
  }

  /* ---------------------------------------------------------------- *
   * Displays and power
   * ---------------------------------------------------------------- */

  function wireSystemEvents() {
    const refit = () => {
      if (!overlay || overlay.isDestroyed()) return;
      fitToDisplay(targetDisplay());
    };
    screen.on('display-metrics-changed', refit);
    screen.on('display-added', refit);
    screen.on('display-removed', refit);

    powerMonitor.on('suspend', () => { world.asleep = true; logger.info('system suspend'); });
    powerMonitor.on('resume', () => { world.asleep = false; logger.info('system resume'); });
    powerMonitor.on('lock-screen', () => { world.asleep = true; logger.info('screen locked'); });
    powerMonitor.on('unlock-screen', () => { world.asleep = false; logger.info('screen unlocked'); });
  }

  /* ---------------------------------------------------------------- *
   * Smoke test hook
   * ---------------------------------------------------------------- */

  function runSmoke() {
    const fail = (msg) => {
      logger.error('SMOKE FAIL ' + msg);
      process.stdout.write('SMOKE FAIL ' + msg + '\n');
      quitting = true;
      app.exit(1);
    };
    overlay.webContents
      .executeJavaScript('window.__pip.playAll()', true)
      .then((errors) => {
        if (errors && errors.length) return fail(errors.join('; '));
        process.stdout.write('SMOKE OK all clips played in all flavors\n');
        quitting = true;
        app.exit(0);
      })
      .catch((err) => fail('playAll threw: ' + err.message));
  }

  /* ---------------------------------------------------------------- *
   * Boot
   * ---------------------------------------------------------------- */

  app.on('second-instance', () => {
    // Launching Pip again just brings him over, rather than opening a copy.
    if (overlay && !overlay.isDestroyed()) {
      if (store.get('hidden')) toggleVisible();
      overlay.showInactive();
      overlay.setAlwaysOnTop(true, 'floating');
    }
  });

  // Closing a window must never quit Pip; only the Quit item does.
  app.on('window-all-closed', () => { /* deliberately empty */ });

  app.on('before-quit', () => { quitting = true; });

  process.on('uncaughtException', (err) => {
    logger.error('uncaught exception', err);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled rejection', reason);
  });

  app.whenReady().then(() => {
    wireIPC();
    createOverlay();
    createTray();
    wireSystemEvents();
    startCursorPolling();
    startBrain();

    if (IS_SMOKE) {
      setTimeout(() => {
        logger.error('SMOKE FAIL timed out');
        process.stdout.write('SMOKE FAIL timed out\n');
        app.exit(1);
      }, 20000);
    }
  });
}
