/*
 * main.js - Pip's lifecycle.
 *
 * Owns the overlay window, the tray, the settings and debug windows, the
 * polling loops that watch the cursor and your idle time, the power events,
 * and every IPC channel. The renderer draws; this process decides.
 *
 * Everything time-based here derives from a stored timestamp, never from
 * counting ticks, so suspending the machine cannot skew a Pomodoro or a
 * work streak.
 */

'use strict';

const path = require('path');
const {
  app, BrowserWindow, Tray, Menu, ipcMain, screen,
  nativeImage, powerMonitor, Notification
} = require('electron');

const logger = require('./main/logger.js');
const { createStorage, cleanPatch } = require('./main/storage.js');
const brain = require('./main/brain.js');
const pomodoro = require('./main/pomodoro.js');
const reminders = require('./main/reminders.js');
const mood = require('./main/mood.js');
const clicks = require('./main/clicks.js');
const seasons = require('./main/seasons.js');
const history = require('./main/history.js');
const Lines = require('./renderer/lines.js');
const Bubbles = require('./renderer/bubbles.js');
const Animations = require('./renderer/animations.js');
const Palettes = require('./renderer/palettes.js');

/* ------------------------------------------------------------------ *
 * Flags and paths
 * ------------------------------------------------------------------ */

const IS_SMOKE = process.argv.includes('--smoke');
const IS_DEV = process.argv.includes('--dev') || (!app.isPackaged && !IS_SMOKE);
const IS_PORTABLE = !!process.env.PORTABLE_EXECUTABLE_DIR;
const IS_MAC = process.platform === 'darwin';

/**
 * Dev runs compress every work timer by 60x so a 25 minute block takes 25s.
 * Animation lengths are never scaled: a reaction squeezed to 30ms is one you
 * cannot see, which made dev mode useless for watching Pip behave.
 */
const TIME_SCALE = IS_DEV ? 1 / 60 : 1;

/**
 * Dev and smoke runs keep their own userData so neither ever pollutes your
 * real stats. Without this the smoke test would write to the live profile.
 */
if (IS_DEV) {
  app.setPath('userData', path.join(app.getPath('appData'), 'Pip-dev'));
} else if (IS_SMOKE) {
  app.setPath('userData', path.join(app.getPath('appData'), 'Pip-smoke'));
}

// Windows only: it names Pip's notifications. Electron documents it for
// win32 alone, so it is not called anywhere else.
if (process.platform === 'win32') app.setAppUserModelId('com.pip.desktopbuddy');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Someone launched Pip again. The running copy handles it; this one leaves.
  app.quit();
} else {
  start();
}

function start() {
  logger.init(path.join(app.getPath('userData'), 'logs'), IS_DEV);
  logger.info('Pip starting', {
    dev: IS_DEV, smoke: IS_SMOKE, portable: IS_PORTABLE, version: app.getVersion()
  });

  const store = createStorage(app.getPath('userData'), logger);
  store.load();

  // Compatibility mode has to be decided before the app is ready, which is why
  // it only takes effect on the next launch.
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
  /** @type {BrowserWindow|null} */ let overlay = null;
  /** @type {BrowserWindow|null} */ let settingsWin = null;
  /** @type {BrowserWindow|null} */ let debugWin = null;
  /** @type {Tray|null} */ let tray = null;

  let currentDisplayId = null;
  let quitting = false;

  const SCALE_BY_SIZE = { small: 3, medium: 4, large: 5 };
  const MINUTE = 60000;

  /**
   * How long Pip stays dizzy after a rough landing. Longer than the clip on
   * purpose: he is usually still in the air when the reaction starts.
   */
  const DIZZY_MS = 2600;
  /** Let go faster than this (DIP/s), or from higher (DIP), and it was a throw. */
  const ROUGH_SPEED = 700;
  const ROUGH_HEIGHT = 240;
  const CELEBRATE_MS = 6000;
  /** Idle behaviours are picked on this cadence, scaled by activity level. */
  const BEHAVIOR_MIN_MS = 20000;
  const BEHAVIOR_MAX_MS = 90000;
  /** How long Pip chases the pointer before giving up. */
  const CHASE_MS = 4000;
  /** Resume, unlock and the idle timer can all report one return; greet once. */
  const WELCOME_GAP_MS = 60000;
  /** Before saying hello, wait to see whether the lock screen comes straight up. */
  const GREET_DELAY_MS = 1500;

  const rng = IS_SMOKE ? brain.seededRng(1234) : Math.random;

  /** Everything that lives across ticks. */
  const world = {
    wander: { dir: 0, until: 0, moving: false },
    reaction: null,
    behavior: null,
    nextBehaviorAt: 0,
    held: false,
    asleep: false,
    climbing: false,
    celebrateUntil: 0,
    thirsty: false,
    idleSeconds: 0,
    reminders: reminders.createState(),
    clicks: clicks.createState(),
    clockOffset: 0,          // debug fast-forward
    forced: { state: null, clip: null },
    lastBubbleAt: 0,
    lastLine: {},            // situation -> last line shown
    lastState: null,
    lastTooltip: '',
    nightcap: false,
    systemAsleep: false,    // suspended or locked - outranks the idle timer
    onboardingDone: false,
    saidFatigue: null,      // 'drowsy' | 'exhausted', so each is said once per stretch
    batteryWarnedAt: 0,
    chasingUntil: 0,
    lastChaseSendAt: 0,
    cursorX: 0,
    pipX: 0,
    onboardingStep: -1,
    seq: 0,                  // bumped per reaction/behaviour so a repeat replays
    wasQuiet: false,
    lastPomodoroSentAt: 0,
    lastWelcomeAt: 0,
    seasonNews: false        // a seasonal flavour started and is not yet announced
  };

  let cursorTimer = null;
  let cursorScheduleTimer = null;
  let brainTimer = null;
  let idleTimer = null;
  let wakeWatchTimer = null;
  let onboardingTimer = null;
  let singleClickTimer = null;
  let greetTimer = null;

  /** The clock everything reads, so the debug panel can push it forward. */
  const now = () => Date.now() + world.clockOffset;

  /** Scale a configured duration into the running time base. */
  const scaled = (ms) => ms * TIME_SCALE;

  /* ---------------------------------------------------------------- *
   * Sizing and displays
   * ---------------------------------------------------------------- */

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
   * already excludes the taskbar wherever it lives, including when it hides.
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
    send('pip:bounds', {
      left: 0, top: 0, right: b.width, bottom: b.height,
      width: b.width, height: b.height
    });
  }

  function send(channel, payload) {
    if (!overlay || overlay.isDestroyed()) return;
    overlay.webContents.send(channel, payload);
  }

  /** After 10pm Pip puts on a nightcap; the renderer swaps in the _cap frames. */
  function isNightcapHour() {
    const hour = new Date(now()).getHours();
    return hour >= 22 || hour < 5;
  }

  function sendSettings() {
    world.nightcap = isNightcapHour();
    send('pip:settings', {
      flavor: store.get('flavor'),
      scale: scale(),
      activityLevel: store.get('activityLevel'),
      quiet: now() < store.get('quietUntil'),
      nightcap: world.nightcap,
      dev: IS_DEV
    });
  }

  /* ---------------------------------------------------------------- *
   * Speech
   * ---------------------------------------------------------------- */

  /**
   * Say something. `essential` bypasses the chatter cooldown - reminders and
   * Pomodoro results always get through, small talk does not.
   */
  function say(situation, essential) {
    const t = now();
    if (t < store.get('quietUntil')) return;
    if (!essential && t - world.lastBubbleAt < scaled(Bubbles.CHATTER_COOLDOWN_MS)) return;

    const text = Lines.pick(situation, {
      mood: store.get('mood'),
      hour: new Date(t).getHours(),
      last: world.lastLine[situation],
      rng: rng
    });
    if (!text) return;
    world.lastLine[situation] = text;
    world.lastBubbleAt = t;
    send('pip:say', { text: text, ms: 4000 });
  }

  function particles(kind, count) {
    send('pip:particles', { kind: kind, count: count });
  }

  /* ---------------------------------------------------------------- *
   * Reactions, moods, behaviours
   * ---------------------------------------------------------------- */

  /**
   * Play a reaction for exactly as long as its clip runs.
   *
   * It used to run on a fixed table of lengths, nearly all of them longer than
   * the clips - so a 0.8s happy wiggle was followed by a second of Pip frozen
   * in the idle pose, waiting for the reaction to officially end.
   *
   * @param {string} clip
   * @param {object} [opts] `ms` to hold it longer than the clip plays;
   *   `walkDir` and `walkSpeed` to react while moving
   */
  function react(clip, opts) {
    const o = opts || {};
    world.seq += 1;
    world.reaction = {
      clip: clip,
      until: now() + Math.max(Animations.clipDuration(clip), o.ms || 0),
      walkDir: o.walkDir || 0,
      walkSpeed: o.walkSpeed || 0,
      seq: world.seq
    };
  }

  /** Start an idle behaviour, lasting exactly as long as its clip. */
  function startBehavior(clip) {
    world.seq += 1;
    world.behavior = { clip: clip, until: now() + Animations.clipDuration(clip), seq: world.seq };
  }

  function bumpMood(event) {
    const current = mood.decay(store.get('mood'), store.get('moodUpdatedAt'), now());
    store.set({ mood: mood.apply(current, event), moodUpdatedAt: now() });
    pushSettings();
  }

  /** Weighted by mood: a cheerful Pip dances, a glum one reads and naps. */
  function pickBehavior() {
    const m = store.get('mood');
    const lively = ['dance', 'juggle', 'wave', 'chase', 'stretch'];
    const quietOnes = ['sit', 'read', 'nap', 'yawn'];
    const always = ['stretch', 'yawn', 'sit', 'trip', 'wave'];
    let pool = always.concat(m >= 60 ? lively : [], m < 40 ? quietOnes : []);
    if (m >= 40 && m < 60) pool = pool.concat(['chase', 'read']);
    return pool[Math.floor(rng() * pool.length)] || 'stretch';
  }

  function maybeStartBehavior() {
    const t = now();
    if (world.behavior && t < world.behavior.until) return;
    if (t < world.nextBehaviorAt) return;
    if (t < store.get('quietUntil') || store.get('hidden') || world.climbing) return;

    const activity = brain.ACTIVITY[store.get('activityLevel')] || brain.ACTIVITY.normal;
    // Dev mode makes idle behaviours much more frequent so they can be seen.
    const spread = (BEHAVIOR_MIN_MS + rng() * (BEHAVIOR_MAX_MS - BEHAVIOR_MIN_MS)) *
      activity.pause * (IS_DEV ? 0.15 : 1);
    world.nextBehaviorAt = t + spread;

    const roll = rng();
    if (roll < 0.15 && t >= world.chasingUntil) {
      // Give the pointer a run for its money instead of a set-piece.
      chaseCursor(t);
      return;
    }
    // Every elapsed timer produces a behaviour, so the cadence really is the
    // 20-90s the interval says rather than some multiple of it.
    if (roll < 0.9) {
      const clip = pickBehavior();
      startBehavior(clip);
      if (clip === 'nap') particles('zzz', 3);
    } else {
      // A passing remark, coloured by how Pip is feeling. The chatter
      // cooldown in say() keeps this from becoming a running commentary.
      const band = mood.band(mood.decay(store.get('mood'), store.get('moodUpdatedAt'), t));
      if (band === 'low') say('low_mood');
      else if (band === 'high') say('high_mood');
    }
  }

  /**
   * Say something the first time Pip crosses the drowsy and exhausted lines,
   * and not again until a break resets him. Supportive, never nagging.
   */
  function announceFatigue(t, s) {
    const worked = reminders.continuousWorkMs(world.reminders, t);
    const exhausted = worked >= s.exhaustedAfter * MINUTE * TIME_SCALE;
    const drowsy = worked >= s.drowsyAfter * MINUTE * TIME_SCALE;

    // Exhausted can be set below drowsy. Then Pip is exhausted before he is
    // drowsy, and must still say so rather than wait for the drowsy line.
    if (!drowsy && !exhausted) { world.saidFatigue = null; return; }
    if (exhausted && world.saidFatigue !== 'exhausted') {
      world.saidFatigue = 'exhausted';
      say('exhausted', true);
      particles('sweat', 2);
    } else if (!exhausted && world.saidFatigue === null) {
      world.saidFatigue = 'drowsy';
      say('drowsy', true);
    }
  }

  /**
   * Bored: now and then Pip gives chase to the pointer for a few seconds,
   * then gives up and goes back to pottering about.
   */
  function chaseCursor(t) {
    world.chasingUntil = t + CHASE_MS;
    world.lastChaseSendAt = 0;
    callPip();
    say('bored');
  }

  /**
   * While a chase is running, keep re-aiming at the pointer so Pip actually
   * follows it rather than trotting to where it was four seconds ago. When
   * the chase times out he simply stops - that is the giving up.
   */
  function updateChase(t) {
    if (!world.chasingUntil) return;
    if (t >= world.chasingUntil) {
      world.chasingUntil = 0;
      send('pip:goto', { x: null });
      return;
    }
    if (t - world.lastChaseSendAt < 400) return;
    world.lastChaseSendAt = t;
    callPip();
  }

  /* ---------------------------------------------------------------- *
   * Pomodoro
   * ---------------------------------------------------------------- */

  function pomodoroCfg() {
    const s = store.all;
    return {
      pomodoroWork: s.pomodoroWork,
      pomodoroBreak: s.pomodoroBreak,
      pomodoroLongBreak: s.pomodoroLongBreak,
      pomodoroLongEvery: s.pomodoroLongEvery,
      timeScale: TIME_SCALE
    };
  }

  function notify(title, body) {
    if (!store.get('notifications')) return;
    if (!Notification.isSupported()) return;
    try {
      new Notification({
        title: title,
        body: body,
        // A NativeImage rather than a path: in the packaged app the path points
        // inside app.asar, which Windows' notification service cannot open.
        icon: nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon-256.png')),
        silent: false
      }).show();
    } catch (err) {
      logger.warn('notification failed', err);
    }
  }

  function tickPomodoro() {
    const state = store.get('pomodoro');
    if (state.phase === 'off') return;
    const res = pomodoro.tick(state, now(), pomodoroCfg());
    if (!res.transitioned) {
      // The ring moves a hair a second; ten messages a second bought nothing.
      if (Date.now() - world.lastPomodoroSentAt >= 1000) sendPomodoro();
      return;
    }

    store.set({ pomodoro: res.state });
    if (res.finishedPhase === 'work') {
      rollDayIfNeeded();
      const today = store.get('today');
      store.set({ today: Object.assign({}, today, { pomodoros: today.pomodoros + 1 }) });
      // Never celebrate for longer than half the break it announces: a dev
      // mode break is only five seconds.
      const celebrateMs = Math.min(CELEBRATE_MS,
        pomodoro.phaseDuration(res.state.phase, pomodoroCfg()) / 2);
      world.celebrateUntil = now() + celebrateMs;
      particles('confetti', 18);
      say('pomodoro_done', true);
      notify('Nice focus!', 'That is one Pomodoro done. Time for a break.');
      bumpMood('pomodoro');
      // Once the confetti has cleared, tell them what the break is for -
      // unless the Pomodoro was stopped in the meantime.
      setTimeout(() => {
        const phase = store.get('pomodoro').phase;
        if (!quitting && (phase === 'break' || phase === 'longBreak')) say('break_start', true);
      }, celebrateMs + 600);
    } else {
      say('break_over', true);
      notify('Break over', 'Back to it when you are ready.');
    }
    // Skip break is only offered during a break.
    refreshMenu();
    pushSettings();
    sendPomodoro();
  }

  /** How a phase reads to a person. 'longBreak' is a key, not a word. */
  const PHASE_WORDS = { work: 'focus', break: 'short break', longBreak: 'long break' };

  function onBreak() {
    const phase = store.get('pomodoro').phase;
    return phase === 'break' || phase === 'longBreak';
  }

  function pomodoroPayload() {
    const state = store.get('pomodoro');
    const cfg = pomodoroCfg();
    const running = state.phase !== 'off';
    return {
      running: running,
      phase: state.phase,
      remainingMs: running ? pomodoro.remaining(state, now(), cfg) : 0,
      totalMs: running ? pomodoro.phaseDuration(state.phase, cfg) : 0
    };
  }

  function sendPomodoro() {
    world.lastPomodoroSentAt = Date.now();
    const state = store.get('pomodoro');
    const p = pomodoroPayload();
    const running = p.running;
    const remainingMs = p.remainingMs;
    send('pip:pomodoro', p);

    const tip = running
      ? 'Pip: ' + PHASE_WORDS[state.phase] + ', ' + Math.max(0, Math.ceil(remainingMs / 60000)) + ' min left'
      : 'Pip';
    if (tray && !tray.isDestroyed() && tip !== world.lastTooltip) {
      world.lastTooltip = tip;
      tray.setToolTip(tip);
    }
  }

  /* ---------------------------------------------------------------- *
   * Activity, water, time of day
   * ---------------------------------------------------------------- */

  function pollIdle() {
    let idleSeconds;
    try {
      idleSeconds = powerMonitor.getSystemIdleTime();
    } catch (err) {
      return;
    }
    world.idleSeconds = idleSeconds;

    const res = reminders.onIdleSample(world.reminders, idleSeconds, now());
    world.reminders = res.state;
    if (res.tookBreak) {
      bumpMood('break');
      persistStreak();
    }

    // Away for five minutes or more and Pip curls up. A suspended or locked
    // machine stays asleep regardless of what the idle counter says - right
    // after a lock it reads near zero, which used to wake Pip straight back up.
    const wasAsleep = world.asleep;
    if (!world.held) world.asleep = world.systemAsleep || idleSeconds >= 300;
    if (wasAsleep && !world.asleep) onWakeUp();

    if (!world.asleep) {
      maybeGoodMorning();
      maybeLateNight();
      maybeAnnounceSeason();
      const cfg = { waterInterval: store.get('waterInterval') * TIME_SCALE };
      const due = reminders.waterDue(world.reminders, now(), cfg);
      if (due && !world.thirsty) {
        world.thirsty = true;
        say('water_due', true);
        particles('sweat', 2);
        // A hidden Pip's bubble is seen by nobody, so the reminder would
        // otherwise go nowhere at all. Quiet mode still means quiet.
        if (store.get('hidden') && now() >= store.get('quietUntil')) {
          notify('Water break', 'Pip says it is time for a glass of water.');
        }
      }
      world.thirsty = due;
    }

    rollDayIfNeeded();
    pushDebug();
  }

  function persistStreak() {
    const longest = reminders.longestStreakMs(world.reminders);
    const today = store.get('today');
    if (longest > (today.longestStreakMs || 0)) {
      store.set({ today: Object.assign({}, today, { longestStreakMs: longest }) });
      pushSettings();
    }
  }

  /**
   * At local midnight, file the day that ended into the history and start a
   * fresh one. This compares the stored day itself. It used to wait for the
   * reminders' own day to change, and logging water changes that quietly
   * first - so a glass drunk just after midnight went on yesterday's count,
   * and yesterday's tallies then stayed up as today's until the next midnight.
   */
  function rollDayIfNeeded() {
    world.reminders = reminders.rollDay(world.reminders, now());
    const key = reminders.localDateKey(now());
    const today = store.get('today');
    if (today.date === key) return;
    store.set({
      history: history.archive(store.get('history'), today),
      today: { date: key, pomodoros: 0, water: 0, longestStreakMs: 0 }
    });
    pushSettings();
    logger.info('daily stats rolled over to ' + key);
    // Seasons start and end on a day boundary, so this is the place to look.
    applySeason();
  }

  /**
   * Change into or out of a seasonal flavour if one has started or ended.
   * The announcement waits for maybeAnnounceSeason: at startup there is no
   * renderer yet to say it, and a fresh install says hello first.
   */
  function applySeason() {
    const res = seasons.step({
      flavor: store.get('flavor'),
      seasonal: store.get('seasonal'),
      season: store.get('season')
    }, now());
    if (res.season === store.get('season') && res.flavor === store.get('flavor')) return;
    store.set({ flavor: res.flavor, season: res.season });
    if (res.event) logger.info('season ' + res.event + ': now wearing ' + res.flavor);
    world.seasonNews = res.event === 'start';
    sendSettings();
    pushSettings();
  }

  function maybeAnnounceSeason() {
    if (!world.seasonNews || !world.onboardingDone || world.asleep) return;
    world.seasonNews = false;
    react('happy');
    particles('sparkle', 8);
    say('season_start', true);
  }

  function onWakeUp() {
    cancelGreeting();
    logger.info('you came back');
    const t = now();
    // Resume, unlock and the idle timer can each report the same return.
    if (t - world.lastWelcomeAt < WELCOME_GAP_MS) return;
    world.lastWelcomeAt = t;
    react('happy');
    say('welcome_back', true);
    particles('sparkle', 5);
    // A happy bounce, then trot over. Both at once and the trot hides it.
    setTimeout(() => { if (!quitting) callPip(); }, Animations.clipDuration('happy'));
  }

  /**
   * Greet a moment after the machine wakes, and only if nothing has put Pip
   * back to sleep by then. Windows raises the lock screen straight after a
   * resume, so greeting at once said hello to a locked screen - and then again
   * on the unlock.
   */
  function greetSoon() {
    cancelGreeting();
    greetTimer = setTimeout(() => {
      greetTimer = null;
      if (!quitting && !world.asleep) onWakeUp();
    }, GREET_DELAY_MS);
  }

  function cancelGreeting() {
    if (greetTimer) clearTimeout(greetTimer);
    greetTimer = null;
  }

  /**
   * While Pip sleeps, look for you every second rather than every ten, so he
   * is up as you sit down rather than a while after.
   */
  function startWakeWatch() {
    wakeWatchTimer = setInterval(() => {
      if (!world.asleep || world.systemAsleep || world.held) return;
      let idleSeconds;
      try {
        idleSeconds = powerMonitor.getSystemIdleTime();
      } catch (err) {
        return;
      }
      if (idleSeconds < 5) pollIdle();
    }, 1000);
  }

  /**
   * The first activity of the day gets a stretch whenever it happens - if you
   * start work at one in the afternoon you still get the stretch, you just do
   * not get told good morning.
   */
  function maybeGoodMorning() {
    const t = now();
    const key = reminders.localDateKey(t);
    if (store.get('lastGoodMorning') === key) return;
    store.set({ lastGoodMorning: key });
    startBehavior('stretch');
    if (new Date(t).getHours() < 12) say('good_morning', true);
  }

  function maybeLateNight() {
    const t = now();
    const hour = new Date(t).getHours();
    if (hour < 23 && hour >= 5) return;
    if (t - store.get('lastLateNightNudge') < scaled(60 * MINUTE)) return;
    store.set({ lastLateNightNudge: t });
    say('late_night', true);
  }

  /* ---------------------------------------------------------------- *
   * Overlay window
   * ---------------------------------------------------------------- */

  function createOverlay() {
    const display = targetDisplay();
    const wa = display.workArea;
    currentDisplayId = display.id;

    overlay = new BrowserWindow({
      x: wa.x, y: wa.y, width: wa.width, height: wa.height,
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
    if (IS_MAC) {
      // A Mac keeps a window on the Space it opened on, and off every
      // full-screen app. Pip is a pet, not a document: he comes along. The
      // process transform is skipped because it would put him back in the
      // Dock, which he has already left.
      overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    }
    // Click-through by default. `forward` keeps mousemove flowing to the
    // renderer so it can tell when the cursor is over Pip's actual pixels.
    overlay.setIgnoreMouseEvents(true, { forward: true });
    overlay.setMenu(null);
    overlay.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));

    overlay.once('ready-to-show', () => {
      if (!store.get('hidden')) overlay.showInactive();
      sendSettings();
      sendBounds();
    });

    overlay.webContents.on('render-process-gone', (_e, details) => {
      logger.error('renderer gone', details);
      if (quitting || !overlay || overlay.isDestroyed()) return;
      // If the renderer died while the cursor was on Pip, the window is solid
      // across the whole work area. Hand the mouse back before anything else.
      overlay.setIgnoreMouseEvents(true, { forward: true });
      overlay.reload();
    });

    // Signing out or shutting down never reaches quit() - on Windows Electron
    // does not even emit before-quit for it. This is the last word we get.
    overlay.on('session-end', () => persistStreak());

    overlay.on('closed', () => { overlay = null; });
  }

  /* ---------------------------------------------------------------- *
   * Settings and debug windows
   * ---------------------------------------------------------------- */

  function todayPayload() {
    const today = store.get('today');
    return {
      pomodoros: today.pomodoros,
      water: today.water,
      longestStreakMs: Math.max(
        today.longestStreakMs || 0,
        reminders.continuousWorkMs(world.reminders, now())
      ),
      mood: mood.decay(store.get('mood'), store.get('moodUpdatedAt'), now())
    };
  }

  function settingsPayload() {
    return {
      settings: store.all,
      today: todayPayload(),
      history: history.summarize(store.get('history'), store.get('today'), now()),
      pomodoroRunning: store.get('pomodoro').phase !== 'off',
      pomodoro: pomodoroPayload(),
      quiet: now() < store.get('quietUntil'),
      hidden: !!store.get('hidden')
    };
  }

  function pushSettings() {
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send('settings:update', settingsPayload());
    }
  }

  /**
   * Out of the Dock, Pip is never the active app on a Mac, so a window he
   * opens would land behind whatever you were using. Ask to come forward.
   */
  function bringForward() {
    if (IS_MAC) app.focus({ steal: true });
  }

  function openSettings() {
    bringForward();
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.show();
      settingsWin.focus();
      return settingsWin;
    }
    settingsWin = new BrowserWindow({
      width: 640,
      height: 860,
      minWidth: 520,
      minHeight: 520,
      title: 'Pip settings',
      icon: path.join(__dirname, '..', 'assets', 'icon-256.png'),
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    settingsWin.setMenu(null);
    settingsWin.loadFile(path.join(__dirname, 'settings', 'settings.html'));
    settingsWin.once('ready-to-show', () => settingsWin.show());
    settingsWin.on('closed', () => { settingsWin = null; });
    return settingsWin;
  }

  function openDebug() {
    if (!IS_DEV) return null;
    bringForward();
    if (debugWin && !debugWin.isDestroyed()) {
      debugWin.show();
      debugWin.focus();
      return debugWin;
    }
    debugWin = new BrowserWindow({
      width: 360,
      height: 720,
      title: 'Pip debug',
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    debugWin.setMenu(null);
    debugWin.loadFile(path.join(__dirname, 'debug', 'debug.html'));
    debugWin.once('ready-to-show', () => debugWin.show());
    debugWin.on('closed', () => { debugWin = null; });
    return debugWin;
  }

  function pushDebug() {
    if (!debugWin || debugWin.isDestroyed()) return;
    const state = store.get('pomodoro');
    const cfg = pomodoroCfg();
    const waterCfg = { waterInterval: store.get('waterInterval') * TIME_SCALE };
    debugWin.webContents.send('debug:state', {
      state: world.lastState ? world.lastState.split('|')[0] : '-',
      clip: world.lastState ? world.lastState.split('|')[1] : '-',
      flavor: store.get('flavor'),
      mood: mood.decay(store.get('mood'), store.get('moodUpdatedAt'), now()),
      continuousWorkMs: reminders.continuousWorkMs(world.reminders, now()),
      idleSeconds: world.idleSeconds,
      pomodoro: {
        phase: state.phase,
        completed: state.completed,
        remainingMs: state.phase === 'off' ? 0 : pomodoro.remaining(state, now(), cfg)
      },
      waterDueInMs: Math.max(0,
        store.get('waterInterval') * MINUTE * TIME_SCALE -
        reminders.activeSinceWaterMs(world.reminders, now())),
      clockOffsetMs: world.clockOffset,
      forced: world.forced
    });
  }

  /* ---------------------------------------------------------------- *
   * Tray and menus
   * ---------------------------------------------------------------- */

  function trayImage() {
    const img = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png'));
    return img.isEmpty() ? nativeImage.createEmpty() : img;
  }

  /** The tray menu and Pip's right-click menu are deliberately identical. */
  function buildMenu() {
    const running = store.get('pomodoro').phase !== 'off';
    const quiet = now() < store.get('quietUntil');
    const items = [
      { label: running ? 'Stop Pomodoro' : 'Start Pomodoro', click: () => doAction('pomodoro-toggle') }
    ];
    if (onBreak()) items.push({ label: 'Skip break', click: () => doAction('pomodoro-skip') });
    items.push(
      { label: 'I drank water', click: () => doAction('water') },
      { label: 'Feed Pip', click: () => doAction('feed') },
      { label: 'Call Pip', click: () => doAction('call') },
      { type: 'separator' },
      {
        label: quiet ? 'Quiet mode (on)' : 'Quiet mode for 1 hour',
        type: 'checkbox',
        checked: quiet,
        click: () => doAction('quiet')
      },
      { label: store.get('hidden') ? 'Show Pip' : 'Hide Pip', click: () => doAction('toggle-visible') },
      { label: 'Reset position', click: () => doAction('reset-position') },
      { type: 'separator' },
      { label: 'Settings', click: () => doAction('settings') }
    );
    if (IS_DEV) items.push({ label: 'Debug panel', click: () => doAction('debug') });
    items.push({ type: 'separator' });
    items.push({ label: 'Quit Pip', click: () => doAction('quit') });
    return Menu.buildFromTemplate(items);
  }

  function createTray() {
    tray = new Tray(trayImage());
    tray.setToolTip('Pip');
    tray.setContextMenu(buildMenu());
    // In a Mac's menu bar any click opens the menu, as every other icon there
    // does. Hiding Pip on the same click would make him vanish every time.
    if (!IS_MAC) tray.on('click', () => doAction('toggle-visible'));
  }

  function refreshMenu() {
    if (tray && !tray.isDestroyed()) tray.setContextMenu(buildMenu());
  }

  /* ---------------------------------------------------------------- *
   * Actions - shared by the tray, Pip's menu and the settings window
   * ---------------------------------------------------------------- */

  function doAction(action) {
    switch (action) {
      case 'pomodoro-toggle': {
        const state = store.get('pomodoro');
        if (state.phase === 'off') {
          store.set({ pomodoro: pomodoro.start(state, now(), pomodoroCfg()) });
        } else {
          store.set({ pomodoro: pomodoro.stop(state) });
        }
        sendPomodoro();
        refreshMenu();
        pushSettings();
        break;
      }
      case 'pomodoro-skip': {
        if (!onBreak()) break;
        store.set({ pomodoro: pomodoro.skipBreak(store.get('pomodoro'), now()) });
        say('break_over', true);
        sendPomodoro();
        refreshMenu();
        pushSettings();
        break;
      }
      case 'water': {
        rollDayIfNeeded();
        world.reminders = reminders.logWater(world.reminders, now());
        world.thirsty = false;
        const today = store.get('today');
        const water = today.water + 1;
        store.set({ today: Object.assign({}, today, { water: water }) });
        particles('water', 5);
        // The glass that reaches the day's goal gets a party, once a day:
        // only that exact glass matches, so the ones after it do not.
        const goal = store.get('waterGoal');
        if (goal > 0 && water === goal) {
          react('dance');
          particles('confetti', 14);
          say('water_goal', true);
        } else {
          react('happy');
          say('water_logged', true);
        }
        bumpMood('water');
        pushSettings();
        break;
      }
      case 'feed':
        react('eat');
        particles('sparkle', 4);
        say('snack', true);
        bumpMood('snack');
        break;
      case 'call':
        callPip();
        say('called', true);
        break;
      case 'quiet': {
        const quiet = now() < store.get('quietUntil');
        // Said before quiet mode starts: once it has, say() stays silent, which
        // is why this line used to never appear at all.
        if (!quiet) say('quiet_on', true);
        store.set({ quietUntil: quiet ? 0 : now() + scaled(60 * MINUTE) });
        world.wasQuiet = !quiet;
        sendSettings();
        refreshMenu();
        pushSettings();
        break;
      }
      case 'toggle-visible': {
        const hidden = !store.get('hidden');
        store.set({ hidden: hidden });
        if (overlay && !overlay.isDestroyed()) {
          if (hidden) overlay.hide();
          else { overlay.showInactive(); overlay.setAlwaysOnTop(true, 'floating'); }
        }
        refreshMenu();
        pushSettings();
        break;
      }
      case 'reset-position':
        if (overlay && !overlay.isDestroyed()) {
          fitToDisplay(targetDisplay());
          send('pip:reset');
        }
        logger.info('position reset');
        break;
      case 'settings':
        openSettings();
        break;
      case 'debug':
        openDebug();
        break;
      case 'quit':
        quit();
        break;
      default:
        logger.warn('unknown action: ' + action);
    }
  }

  /**
   * Which way to storm off in a huff.
   *
   * Away from the pointer, except when Pip is already backed up against a
   * screen edge - scooting into a wall just makes him trot on the spot, which
   * is exactly what it looked like in practice.
   */
  function scootDirection() {
    let away = world.pipX >= world.cursorX ? 1 : -1;
    if (overlay && !overlay.isDestroyed()) {
      const width = overlay.getBounds().width;
      const edge = Math.max(140, width * 0.08);
      if (world.pipX <= edge) away = 1;
      else if (world.pipX >= width - edge) away = -1;
    }
    return away;
  }

  /** Trot over to wherever the pointer is. */
  function callPip() {
    if (!overlay || overlay.isDestroyed()) return;
    try {
      const point = screen.getCursorScreenPoint();
      const b = overlay.getBounds();
      send('pip:goto', { x: point.x - b.x });
    } catch (err) {
      logger.warn('could not read the cursor for call', err);
    }
  }

  function quit() {
    quitting = true;
    for (const t of [cursorTimer, cursorScheduleTimer, brainTimer, idleTimer,
      wakeWatchTimer, onboardingTimer]) {
      if (t) clearInterval(t);
    }
    if (singleClickTimer) clearTimeout(singleClickTimer);
    cancelGreeting();
    persistStreak();
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
    cursorScheduleTimer = setInterval(schedule, 1000);
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
    world.cursorX = x;
    send('pip:cursor', {
      x: x, y: y,
      inside: x >= 0 && y >= 0 && x < b.width && y < b.height
    });
  }

  /** The brain runs at 10Hz; state only goes down the wire when it changes. */
  function startBrain() {
    brainTimer = setInterval(() => {
      const t = now();
      const s = store.all;

      if (isNightcapHour() !== world.nightcap) sendSettings();
      const quiet = t < s.quietUntil;
      if (quiet !== world.wasQuiet) {
        // Quiet mode runs out on its own, and the tray menu, the settings
        // window and Pip all have to hear about it.
        world.wasQuiet = quiet;
        sendSettings();
        refreshMenu();
        pushSettings();
      }
      announceFatigue(t, s);
      updateChase(t);
      if (world.reaction && t >= world.reaction.until) world.reaction = null;
      if (world.behavior && t >= world.behavior.until) world.behavior = null;
      if (!world.asleep && !world.held) maybeStartBehavior();
      tickPomodoro();

      const result = brain.decide({
        now: t,
        rng: rng,
        held: world.held,
        asleep: world.asleep,
        celebrateUntil: world.celebrateUntil,
        thirsty: world.thirsty,
        continuousWorkMs: reminders.continuousWorkMs(world.reminders, t),
        drowsyAfterMs: s.drowsyAfter * MINUTE * TIME_SCALE,
        exhaustedAfterMs: s.exhaustedAfter * MINUTE * TIME_SCALE,
        reaction: world.reaction,
        behavior: world.behavior,
        wander: world.wander,
        quiet: t < s.quietUntil,
        hidden: s.hidden,
        mood: mood.decay(s.mood, s.moodUpdatedAt, t),
        hour: new Date(t).getHours(),
        activityLevel: s.activityLevel,
        climbing: world.climbing,
        onBreak: onBreak()
      });
      world.wander = result.wander;

      // The debug panel can pin a state or a clip for inspection.
      const state = world.forced.state || result.state;
      const clip = world.forced.clip || result.clip;

      // Which reaction or behaviour this is. Without it, a second pet during
      // the first changed nothing on the wire, so the renderer never replayed
      // the clip and Pip just stood there for the extra time.
      let seq = 0;
      if (result.state === 'reaction' && world.reaction) seq = world.reaction.seq;
      else if (result.state === 'idle' && world.behavior && result.clip === world.behavior.clip) {
        seq = world.behavior.seq;
      }

      const key = [state, clip, result.walkDir, Math.round(result.walkSpeed), seq].join('|');
      if (key === world.lastState) return;
      world.lastState = key;
      send('pip:state', {
        state: state,
        clip: clip,
        walkDir: world.forced.clip ? 0 : result.walkDir,
        walkSpeed: result.walkSpeed,
        seq: seq
      });
      pushDebug();
    }, 100);
  }

  function startIdlePolling() {
    idleTimer = setInterval(pollIdle, 10000);
    pollIdle();
  }

  /* ---------------------------------------------------------------- *
   * Onboarding
   * ---------------------------------------------------------------- */

  const ONBOARDING = [
    'onboarding_drag', 'onboarding_menu', 'onboarding_flavor',
    IS_MAC ? 'onboarding_menubar' : 'onboarding_tray'
  ];

  function runOnboarding() {
    // pip:ready fires again after a renderer reload, which would otherwise
    // start a second interval and orphan the first.
    if (world.onboardingDone || onboardingTimer) return;
    if (store.get('onboarded')) { world.onboardingDone = true; return; }
    world.onboardingStep = 0;
    // Pip is still dropping in from the top. Once he has landed and bounced,
    // wave, while the bubbles talk you through the basics.
    setTimeout(() => { if (!quitting) startBehavior('wave'); }, 2000);
    const step = () => {
      if (world.onboardingStep >= ONBOARDING.length) {
        clearInterval(onboardingTimer);
        onboardingTimer = null;
        world.onboardingDone = true;
        store.set({ onboarded: true });
        logger.info('onboarding shown');
        return;
      }
      say(ONBOARDING[world.onboardingStep], true);
      world.onboardingStep += 1;
    };
    setTimeout(step, 1200);
    onboardingTimer = setInterval(step, 4600);
  }

  /* ---------------------------------------------------------------- *
   * IPC
   * ---------------------------------------------------------------- */

  function wireIPC() {
    ipcMain.on('pip:ready', () => {
      logger.info('renderer ready');
      // A fresh renderer starts click-through, holding nothing and on the
      // ground, and only reports changes from there - so main has to agree
      // with it. After a reload following a crash, a stale "interactive" left
      // the overlay solid over the whole desktop, swallowing every click.
      if (overlay && !overlay.isDestroyed()) overlay.setIgnoreMouseEvents(true, { forward: true });
      world.held = false;
      world.climbing = false;
      world.lastState = null;   // and it needs to be told the current state
      sendSettings();
      sendBounds();
      sendPomodoro();
      if (IS_SMOKE) { runSmoke(); return; }
      runOnboarding();
    });

    ipcMain.on('pip:set-interactive', (_e, payload) => {
      if (!overlay || overlay.isDestroyed()) return;
      // Solid while the cursor is on Pip, click-through everywhere else.
      overlay.setIgnoreMouseEvents(!payload.interactive, { forward: true });
    });

    ipcMain.on('pip:grabbed', () => {
      world.held = true;
      world.asleep = false;
    });

    ipcMain.on('pip:dropped', (_e, payload) => {
      const p = payload || {};
      if (typeof p.x === 'number') world.pipX = p.x;
      world.held = false;
      // Being set down gently is not the same as being thrown. Only a real
      // toss, or a drop from a height, leaves him seeing stars - the renderer
      // adds those itself when he actually hits the floor.
      const rough = (Number(p.speed) || 0) > ROUGH_SPEED || (Number(p.height) || 0) > ROUGH_HEIGHT;
      if (rough) {
        react('dizzy', { ms: DIZZY_MS });
        say('dizzy');
      }
      // Follow the cursor to whichever display Pip was let go over, and drop
      // him in there under the pointer. Refitting alone left him at his old
      // overlay coordinates, nowhere near where he was let go.
      try {
        const point = screen.getCursorScreenPoint();
        const display = screen.getDisplayNearestPoint(point);
        if (display.id !== currentDisplayId) {
          fitToDisplay(display);
          send('pip:reset', { x: point.x - display.workArea.x });
        }
      } catch (err) {
        logger.warn('could not resolve drop display', err);
      }
    });

    ipcMain.on('pip:click', (_e, payload) => {
      // A click is a grab that never went anywhere. The renderer only reports
      // a grab once Pip is actually lifted, but a stale `held` outranks every
      // other state, so never let one survive a click.
      world.held = false;
      // The click lands on Pip, so this is also the best fix we get on where
      // he currently is.
      if (payload && typeof payload.x === 'number') world.pipX = payload.x;
      const res = clicks.record(world.clicks, now());
      world.clicks = res.state;

      // Every reaction waits a beat before it fires, because a faster pattern
      // may still be coming: clicking five times is also two double-clicks,
      // and Pip should end up annoyed rather than fed twice on the way there.
      const defer = (ms, run) => {
        if (singleClickTimer) clearTimeout(singleClickTimer);
        singleClickTimer = setTimeout(() => {
          singleClickTimer = null;
          if (!quitting) run();
        }, ms);
      };

      if (res.pattern === 'rapid') {
        if (singleClickTimer) { clearTimeout(singleClickTimer); singleClickTimer = null; }
        // Puff up and scoot away from the pointer. The movement has to ride on
        // the reaction itself - a stationary reaction outlasts any wander we
        // could set here and would swallow the scoot entirely.
        react('sulk', { walkDir: scootDirection(), walkSpeed: brain.BASE_RUN });
        say('annoyed', true);
        particles('sweat', 3);
        return;
      }

      if (res.pattern === 'double') {
        defer(clicks.RAPID_MS / 4, () => {
          react('eat');
          particles('sparkle', 4);
          say('snack', true);
          bumpMood('snack');
        });
        return;
      }

      defer(clicks.DOUBLE_MS + 40, () => {
        // A thirsty Pip takes a click as "yes, I drank some".
        if (world.thirsty) { doAction('water'); return; }
        const band = mood.band(mood.decay(store.get('mood'), store.get('moodUpdatedAt'), now()));
        react(band === 'high' ? 'laugh' : 'happy');
        particles('heart', 2);
        say('click');
      });
    });

    ipcMain.on('pip:pet', () => {
      const band = mood.band(mood.decay(store.get('mood'), store.get('moodUpdatedAt'), now()));
      react(band === 'high' ? 'blush' : 'heart');
      particles('heart', 4);
      say('pet');
      bumpMood('pet');
    });

    ipcMain.on('pip:startle', () => {
      react('surprise');
      say('startle');
    });

    ipcMain.on('pip:climb', (_e, payload) => {
      world.climbing = !!(payload && payload.climbing);
    });

    // Electron cannot read the charge level, so the renderer reports it here.
    ipcMain.on('pip:battery', (_e, payload) => {
      if (!payload || typeof payload.level !== 'number') return;
      const low = payload.level < 0.2 && !payload.charging;
      if (!low) { world.batteryWarnedAt = 0; return; }
      if (now() - world.batteryWarnedAt < scaled(30 * MINUTE)) return;
      world.batteryWarnedAt = now();
      react('sulk');
      say('battery_low', true);
    });

    ipcMain.on('pip:context-menu', () => {
      buildMenu().popup({});
    });

    ipcMain.on('pip:error', (_e, payload) => {
      logger.error('renderer error:', payload && payload.message, payload && payload.stack);
    });

    /* ---- settings window ---- */

    ipcMain.handle('settings:get', () => settingsPayload());

    ipcMain.on('settings:set', (_e, payload) => {
      // Only the settings the window offers, and only sane values of them.
      // store.set would otherwise accept any known key - mood, the Pomodoro,
      // today's tallies - with anything at all in it.
      const patch = cleanPatch(payload && payload.patch);
      if (!Object.keys(patch).length) return;
      store.set(patch);
      if ('launchAtLogin' in patch) applyLoginItem();
      if ('seasonal' in patch) { applySeason(); maybeAnnounceSeason(); }
      sendSettings();
      refreshMenu();
      pushSettings();
      logger.info('settings changed', patch);
    });

    ipcMain.on('settings:action', (_e, payload) => {
      if (payload && payload.action) doAction(payload.action);
    });

    /* ---- debug window ---- */

    ipcMain.on('debug:force', (_e, payload) => {
      if (!IS_DEV || !payload) return;
      if ('state' in payload) world.forced.state = payload.state;
      if ('clip' in payload) world.forced.clip = payload.clip;
      if (payload.flavor) { store.set({ flavor: payload.flavor }); sendSettings(); }
      if (payload.fastForwardMs) world.clockOffset += payload.fastForwardMs;
      if (payload.resetClock) world.clockOffset = 0;
      world.lastState = null;   // force a resend
      pushDebug();
    });
  }

  /* ---------------------------------------------------------------- *
   * Displays, power, login item
   * ---------------------------------------------------------------- */

  function wireSystemEvents() {
    const refit = () => {
      if (!overlay || overlay.isDestroyed()) return;
      fitToDisplay(targetDisplay());
      // Always-on-top can be dropped by a resolution change, so re-assert it.
      overlay.setAlwaysOnTop(true, 'floating');
    };
    screen.on('display-metrics-changed', refit);
    screen.on('display-added', refit);
    screen.on('display-removed', refit);

    const sleep = (why) => {
      cancelGreeting();
      world.systemAsleep = true;
      world.asleep = true;
      world.reminders = reminders.onBreakEvent(world.reminders, now());
      persistStreak();
      logger.info(why);
    };
    // Windows fires resume AND unlock-screen for one wake, often with a
    // lock-screen in between. greetSoon waits out that shuffle.
    const wake = (why) => {
      const wasAsleep = world.asleep;
      world.systemAsleep = false;
      world.asleep = false;
      logger.info(why);
      if (wasAsleep) greetSoon();
    };

    powerMonitor.on('suspend', () => sleep('system suspend'));
    powerMonitor.on('lock-screen', () => sleep('screen locked'));
    powerMonitor.on('resume', () => wake('system resume'));
    powerMonitor.on('unlock-screen', () => wake('screen unlocked'));

    powerMonitor.on('on-battery', () => {
      logger.info('on battery');
      // The lines are all "adventure mode!", so no sulking about it.
      react('surprise');
      say('on_battery', true);
    });
    powerMonitor.on('on-ac', () => {
      logger.info('on mains power');
      react('happy');
    });
  }

  /**
   * Launch at login is on by default, but only ever registered for a real
   * installed build - never from a dev run, never from a smoke test of the
   * packaged app, and never from the portable exe, which would point the
   * shortcut at wherever the file happened to be.
   */
  function applyLoginItem() {
    if (!app.isPackaged || IS_PORTABLE || IS_DEV || IS_SMOKE) return;
    try {
      app.setLoginItemSettings({
        openAtLogin: !!store.get('launchAtLogin'),
        path: process.execPath,
        args: []
      });
    } catch (err) {
      logger.warn('could not set the login item', err);
    }
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
        // The settings window pulls in palettes and sprites over its own CSP,
        // so check it actually rendered a preview per flavour rather than just
        // that the window opened - a blocked script would fail silently.
        const win = openSettings();
        win.once('ready-to-show', () => {
          setTimeout(() => {
            win.webContents
              .executeJavaScript('document.querySelectorAll(".flavor canvas").length', true)
              .then((count) => {
                try { win.close(); } catch (err) { /* already gone */ }
                const expected = Palettes.FLAVOR_NAMES.length;
                if (count !== expected) {
                  return fail('settings rendered ' + count + ' flavour previews, expected ' + expected);
                }
                process.stdout.write('SMOKE OK settings window rendered ' + expected + ' flavour previews\n');
                quitting = true;
                app.exit(0);
              })
              .catch((err) => fail('settings check threw: ' + err.message));
          }, 600);
        });
      })
      .catch((err) => fail('playAll threw: ' + err.message));
  }

  /* ---------------------------------------------------------------- *
   * Boot
   * ---------------------------------------------------------------- */

  /** Launching Pip again just brings him over, rather than opening a copy. */
  function comeOver() {
    if (store.get('hidden')) doAction('toggle-visible');
    if (overlay && !overlay.isDestroyed()) {
      overlay.showInactive();
      overlay.setAlwaysOnTop(true, 'floating');
    }
    // Wave first, then come over: a trot that starts at once replaces the
    // wave before a single frame of it is seen.
    startBehavior('wave');
    setTimeout(() => { if (!quitting) callPip(); }, Animations.clipDuration('wave'));
  }

  app.on('second-instance', comeOver);
  // A Mac never starts a second copy: opening Pip.app again, from Finder,
  // Launchpad or Spotlight, re-activates the running one instead.
  app.on('activate', () => { if (overlay && !overlay.isDestroyed()) comeOver(); });

  // Closing a window must never quit Pip; only the Quit item does.
  app.on('window-all-closed', () => { /* deliberately empty */ });
  app.on('before-quit', () => { quitting = true; });

  // No window of Pip's ever navigates or opens another. Dropping a file on
  // Pip would otherwise load that file in his place - in a transparent,
  // always-on-top window the size of the screen.
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-navigate', (e) => e.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });

  process.on('uncaughtException', (err) => {
    logger.error('uncaught exception', err);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled rejection', reason);
  });

  app.whenReady().then(() => {
    // Pip lives on the desktop and in the menu bar, not in the Dock or in
    // Cmd-Tab. The packaged app says so in its Info.plist (LSUIElement); this
    // covers running from source. It must happen before any window opens.
    if (IS_MAC && app.dock) app.dock.hide();
    // Recover a Pomodoro that was running when Pip was last closed.
    store.set({ pomodoro: pomodoro.restore(store.get('pomodoro'), now(), pomodoroCfg()) });
    // Without a baseline, decay never starts and mood sits at its default
    // until the first time Pip is petted or fed.
    if (!store.get('moodUpdatedAt')) store.set({ moodUpdatedAt: now() });
    rollDayIfNeeded();
    // Also when the day has not changed: an update installed mid-season.
    applySeason();
    applyLoginItem();

    wireIPC();
    createOverlay();
    createTray();
    wireSystemEvents();
    startCursorPolling();
    startBrain();
    startIdlePolling();
    startWakeWatch();

    if (IS_SMOKE) {
      setTimeout(() => {
        logger.error('SMOKE FAIL timed out');
        process.stdout.write('SMOKE FAIL timed out\n');
        app.exit(1);
      }, 20000);
    }
  });
}
