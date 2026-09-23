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
  nativeImage, powerMonitor, Notification, shell
} = require('electron');

const logger = require('./src/main/logger.js');
const { createStorage } = require('./src/main/storage.js');
const brain = require('./src/main/brain.js');
const pomodoro = require('./src/main/pomodoro.js');
const reminders = require('./src/main/reminders.js');
const mood = require('./src/main/mood.js');
const clicks = require('./src/main/clicks.js');
const Lines = require('./src/renderer/lines.js');
const Bubbles = require('./src/renderer/bubbles.js');
const Animations = require('./src/renderer/animations.js');
const Pips = require('./src/renderer/pips.js');
const rhythm = require('./src/main/rhythm.js');
const apps = require('./src/main/apps.js');
const fgwatch = require('./src/main/fgwatch.js');
const economy = require('./src/main/economy.js');

/* ------------------------------------------------------------------ *
 * Flags and paths
 * ------------------------------------------------------------------ */

const IS_SMOKE = process.argv.includes('--smoke');
/**
 * --shots=<dir> (unpackaged only): play a list of clips and screenshot each
 * one into <dir>, then quit. How the art gets checked in the real overlay
 * without anyone sitting at the machine.
 */
const SHOTS_DIR = app.isPackaged ? null
  : ((process.argv.find((a) => a.startsWith('--shots=')) || '').slice('--shots='.length) || null);
const IS_DEV = process.argv.includes('--dev') || (!app.isPackaged && !IS_SMOKE && !SHOTS_DIR);
const IS_PORTABLE = !!process.env.PORTABLE_EXECUTABLE_DIR;

/** Dev runs compress every duration by 60x so a 25 minute block takes 25s. */
const TIME_SCALE = IS_DEV ? 1 / 60 : 1;

/**
 * Dev and smoke runs keep their own userData so neither ever pollutes your
 * real stats. Without this the smoke test would write to the live profile.
 */
if (IS_DEV) {
  app.setPath('userData', path.join(app.getPath('appData'), 'Pip-dev'));
} else if (IS_SMOKE || SHOTS_DIR) {
  app.setPath('userData', path.join(app.getPath('appData'), 'Pip-smoke'));
}

app.setAppUserModelId('com.pip.desktopbuddy');

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
  /** @type {BrowserWindow|null} */ let arcadeWin = null;
  /** @type {Tray|null} */ let tray = null;

  let currentDisplayId = null;
  let quitting = false;

  /** Screen pixels per art pixel. The art is 64px, so medium is 128 DIP. */
  const SCALE_BY_SIZE = { small: 1.5, medium: 2, large: 2.5 };
  const MINUTE = 60000;

  /** Reaction lengths, before the dev time scale. */
  const REACTION_MS = {
    happy: 1800, heart: 2400, eat: 2000, surprise: 1500,
    sulk: 3000, laugh: 2000, blush: 2000, dizzy: 2600,
    giggle: 1600, boop: 900, queasy: 2800, bonk: 1400, angry: 1900,
    sad: 2900, scared: 900, proud: 1700, confused: 1950, excited: 1400
  };

  /** Each temperament's favourite thing to do, played more often. */
  const TEMPERAMENT_SIGNATURE = {
    cheerful: 'bounce', sleepy: 'loaf', zesty: 'zoomies',
    dramatic: 'twirl', chill: 'whistle', curious: 'sniff'
  };

  /** What Pip does to keep you company, by what is in front of you. */
  const CONTEXT_CLIPS = {
    code: 'code', terminal: 'code', video: 'popcorn', music: 'headbop',
    design: 'paint', writing: 'scribble', email: 'mail', game: 'gamepad'
  };
  const CONTEXT_LINES = {
    code: 'app_code', terminal: 'app_code', video: 'app_video', music: 'app_music',
    design: 'app_design', writing: 'app_writing', email: 'app_email', game: 'app_game'
  };
  const CELEBRATE_MS = 6000;
  /** Idle behaviours are picked on this cadence, scaled by activity level. */
  const BEHAVIOR_MIN_MS = 20000;
  const BEHAVIOR_MAX_MS = 90000;
  const BEHAVIOR_LENGTH_MS = 4000;

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
    shaken: false,           // shaken about while carried: queasy, not dizzy
    rhythm: rhythm.createState(),
    cursorMoved: false,
    lastCursorKey: '',
    app: { category: 'other', fullscreen: false, since: 0 },
    appSwitches: [],
    fsHidden: false,         // hidden because a fullscreen app is in front
    meeting: false,          // a meeting app is in front: no bubbles
    nextContextAt: 0,
    saidContext: {},
    zoomies: null
  };

  let appWatcher = null;

  /**
   * The coins and the collection. Main is the only place they change: the
   * arcade window asks, economy.js works it out, and the result is saved
   * before anything is animated.
   */
  let econ = economy.normalize(store.get('economy'), Pips.STARTERS);
  if (!econ.owned.some((o) => o.id === store.get('flavor'))) store.set({ flavor: 'cherry' });
  store.set({ economy: econ });
  let lastActivePoll = 0;

  /** Settings the settings window may change. Coins, stats and timers are not among them. */
  const USER_SETTINGS = [
    'flavor', 'petSize', 'activityLevel', 'effects', 'notifications', 'launchAtLogin',
    'compatibilityMode', 'appAware', 'appTitles', 'hideFullscreen', 'quietMeetings',
    'pomodoroWork', 'pomodoroBreak', 'pomodoroLongBreak', 'pomodoroLongEvery',
    'drowsyAfter', 'exhaustedAfter', 'waterInterval'
  ];

  let cursorTimer = null;
  let brainTimer = null;
  let idleTimer = null;
  let onboardingTimer = null;
  let singleClickTimer = null;
  let rhythmTimer = null;

  /** The clock everything reads, so the debug panel can push it forward. */
  const now = () => Date.now() + world.clockOffset;

  /** Scale a configured duration into the running time base. */
  const scaled = (ms) => ms * TIME_SCALE;

  /* ---------------------------------------------------------------- *
   * Sizing and displays
   * ---------------------------------------------------------------- */

  function scale() {
    return SCALE_BY_SIZE[store.get('petSize')] || 2;
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
      effects: store.get('effects'),
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
    // Nobody wants a speech bubble popping up on a shared screen.
    if (world.meeting) return;
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
   * Coins
   * ---------------------------------------------------------------- */

  function dayKey(t) {
    return reminders.localDateKey(t === undefined ? now() : t);
  }

  function saveEcon(next) {
    econ = next;
    store.set({ economy: econ });
    pushArcade();
    pushSettings();
  }

  /** Coins pop out of Pip when he earns you some. */
  function coinPop(paid) {
    if (paid <= 0) return;
    particles('coin', Math.min(6, Math.max(1, Math.ceil(paid / 10))));
  }

  /** A kept habit pays out. */
  function earnHabit(kind) {
    const res = economy.habit(econ, kind, dayKey());
    if (res.paid) { saveEcon(res.state); coinPop(res.paid); }
  }

  /**
   * Active time with Pip about pays a coin a minute, in handfuls. Called from
   * the idle poll, so "active" means the same thing it does everywhere else.
   */
  function earnPassive(idleSeconds) {
    const t = now();
    const since = lastActivePoll ? t - lastActivePoll : 0;
    lastActivePoll = t;
    if (world.asleep || idleSeconds >= 60 || since <= 0 || since > 60000) return;
    // dev mode runs every timer 60x fast; coins keep pace with it
    const res = economy.addActive(econ, since / TIME_SCALE, dayKey(t));
    econ = res.state;
    if (res.paid) {
      saveEcon(econ);
      coinPop(res.paid);
      if (rng() < 0.2) say('coins_earned');
    } else {
      store.set({ economy: econ });
    }
  }

  /** The first hello of the day, with a bonus for every day in a row. */
  function earnHello(t) {
    const yesterday = dayKey(t - 24 * 3600000);
    const res = economy.hello(econ, dayKey(t), yesterday);
    if (!res.paid) return;
    saveEcon(res.state);
    setTimeout(() => {
      if (quitting) return;
      coinPop(res.paid);
      say('daily_bonus', true);
    }, 5200);
  }

  function arcadePayload() {
    return economy.publicState(econ, {
      equipped: store.get('flavor'),
      rules: economy.RULES,
      slotReturn: economy.slotReturn()
    });
  }

  function pushArcade() {
    if (arcadeWin && !arcadeWin.isDestroyed()) arcadeWin.webContents.send('arcade:update', arcadePayload());
  }

  /** Wear a Pip you own. Desktop Pip shows off the new look. */
  function equip(id) {
    if (!economy.owns(econ, id) || !Pips.BY_ID[id]) return false;
    if (store.get('flavor') === id) return true;
    store.set({ flavor: id });
    sendSettings();
    pushSettings();
    pushArcade();
    react('proud');
    particles('sparkle', 6);
    return true;
  }

  /* ---------------------------------------------------------------- *
   * Reactions, moods, behaviours
   * ---------------------------------------------------------------- */

  /**
   * @param {string} clip
   * @param {number} [ms]      override the default length
   * @param {object} [move]    {walkDir, walkSpeed} to react while moving
   */
  function react(clip, ms, move) {
    // Not scaled by dev mode: this is how long an animation plays, not a
    // work timer, and a 30ms reaction is no reaction at all.
    world.reaction = {
      clip: clip,
      until: now() + (ms || REACTION_MS[clip] || 1800),
      walkDir: move ? move.walkDir : 0,
      walkSpeed: move ? move.walkSpeed : 0
    };
  }

  function bumpMood(event) {
    const current = mood.decay(store.get('mood'), store.get('moodUpdatedAt'), now());
    store.set({ mood: mood.apply(current, event), moodUpdatedAt: now() });
    pushSettings();
  }

  /**
   * Weighted by mood and by the Pip's temperament: a cheerful Pip dances, a
   * glum one reads and naps, and every type has a favourite it does more.
   */
  function pickBehavior() {
    const m = store.get('mood');
    const hour = new Date(now()).getHours();
    const type = Pips.get(store.get('flavor'));
    const lively = ['dance', 'juggle', 'wave', 'chase', 'stretch', 'bounce', 'hop', 'whistle', 'lookatyou'];
    const quietOnes = ['sit', 'read', 'nap', 'yawn', 'loaf'];
    const always = ['stretch', 'yawn', 'sit', 'trip', 'wave', 'sneeze', 'scratch', 'shake', 'roll', 'sniff', 'lookatyou'];
    let pool = always.concat(m >= 60 ? lively : [], m < 40 ? quietOnes : []);
    if (m >= 40 && m < 60) pool = pool.concat(['chase', 'read', 'whistle']);
    if (m < 25) pool.push('sad');
    if (hour >= 21 || hour < 5) pool.push('stargaze', 'stargaze');
    const signature = TEMPERAMENT_SIGNATURE[type.temperament];
    if (signature) pool.push(signature, signature, signature);
    if (type.id === 'bubblegum') pool.push('gum', 'gum', 'gum');
    return pool[Math.floor(rng() * pool.length)] || 'stretch';
  }

  /** How long a behaviour runs: its whole animation, never cut short. */
  function behaviorLength(clip) {
    return Math.max(1500, Animations.clipDuration(clip) || BEHAVIOR_LENGTH_MS);
  }

  /** Zesty types get the zoomies: flat out to one side, then the other. */
  function startZoomies(t) {
    world.zoomies = { until: t + 5600, nextAt: 0, side: rng() < 0.5 ? 0 : 1 };
  }

  function updateZoomies(t) {
    const z = world.zoomies;
    if (!z) return;
    if (t >= z.until || world.held || world.asleep || !overlay || overlay.isDestroyed()) {
      world.zoomies = null;
      send('pip:goto', { x: null });
      return;
    }
    if (t < z.nextAt) return;
    const width = overlay.getBounds().width;
    z.side = 1 - z.side;
    send('pip:goto', { x: width * (z.side ? 0.82 : 0.18), speed: 250 });
    z.nextAt = t + 1400;
  }

  /**
   * Keeping you company. While you type, Pip types along on his own tiny
   * laptop (in a hard hat if it is code); with a video in front he gets the
   * popcorn out; with music, headphones. It is a behaviour like any other -
   * it runs for a while and ends, so he never stops wandering for good - and
   * it ends early the moment you stop doing the thing.
   */
  function wantedContext(t) {
    const cat = world.app.category;
    const typingFor = world.rhythm.mode === 'typing' ? rhythm.heldFor(world.rhythm, t) : 0;
    if (typingFor >= 12000) {
      return { clip: cat === 'code' || cat === 'terminal' ? 'code' : 'type_along', key: 'typing' };
    }
    const clip = CONTEXT_CLIPS[cat];
    if (clip && clip !== 'code' && t - world.app.since >= 8000) return { clip: clip, key: cat };
    return null;
  }

  function updateContext(t) {
    const cur = world.behavior && world.behavior.context ? world.behavior : null;
    const want = wantedContext(t);
    if (cur) {
      if (!want || want.clip !== cur.clip) {
        world.behavior = null;
        world.nextContextAt = t + 20000 + rng() * 20000;
      }
      return;
    }
    if (!want || t < world.nextContextAt) return;
    if (world.asleep || world.held || world.reaction || world.zoomies || store.get('hidden')) return;
    if (world.behavior && t < world.behavior.until) return;
    const length = 20000 + rng() * 20000;
    world.behavior = { clip: want.clip, until: t + length, context: true };
    world.nextContextAt = t + length + 30000 + rng() * 30000;
    // once a session per kind of thing, and only as passing chatter
    if (!world.saidContext[want.key]) {
      world.saidContext[want.key] = true;
      if (want.key === 'typing') say('typing_company');
      else say(CONTEXT_LINES[want.key]);
    }
  }

  function maybeStartBehavior() {
    const t = now();
    if (world.behavior && t < world.behavior.until) return;
    if (t < world.nextBehaviorAt) return;
    if (t < store.get('quietUntil') || store.get('hidden')) return;

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
      if (clip === 'zoomies') { startZoomies(t); return; }
      world.behavior = { clip: clip, until: t + behaviorLength(clip) };
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

    if (!drowsy) { world.saidFatigue = null; return; }
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
    world.chasingUntil = t + scaled(4000);
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
        icon: path.join(__dirname, 'assets', 'icon-256.png'),
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
    if (res.transitioned) {
      store.set({ pomodoro: res.state });
      if (res.finishedPhase === 'work') {
        const today = store.get('today');
        store.set({ today: Object.assign({}, today, { pomodoros: today.pomodoros + 1 }) });
        // Four in a day is a proper morning's work: Pip is very proud of you.
        if (today.pomodoros + 1 === 4) {
          setTimeout(() => { if (!quitting) react('proud'); }, scaled(CELEBRATE_MS) + 200);
        }
        world.celebrateUntil = now() + scaled(CELEBRATE_MS);
        particles('confetti', 18);
        say('pomodoro_done', true);
        notify('Nice focus!', 'That is one Pomodoro done. Time for a break.');
        bumpMood('pomodoro');
        earnHabit('pomodoro');
        // Once the confetti has cleared, tell them what the break is for.
        setTimeout(() => {
          if (!quitting) say('break_start', true);
        }, scaled(CELEBRATE_MS) + 600);
      } else {
        say('break_over', true);
        notify('Break over', 'Back to it when you are ready.');
      }
      pushSettings();
    }
    sendPomodoro();
  }

  function sendPomodoro() {
    const state = store.get('pomodoro');
    const cfg = pomodoroCfg();
    const running = state.phase !== 'off';
    const remainingMs = running ? pomodoro.remaining(state, now(), cfg) : 0;
    send('pip:pomodoro', {
      running: running,
      phase: state.phase,
      remainingMs: remainingMs,
      totalMs: running ? pomodoro.phaseDuration(state.phase, cfg) : 0
    });

    const tip = running
      ? 'Pip - ' + Math.max(0, Math.ceil(remainingMs / 60000)) + ' min left (' + state.phase + ')'
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
      earnHabit('break');
    }
    earnPassive(idleSeconds);

    // Away for five minutes or more and Pip curls up. A suspended or locked
    // machine stays asleep regardless of what the idle counter says - right
    // after a lock it reads near zero, which used to wake Pip straight back up.
    const wasAsleep = world.asleep;
    if (!world.held) world.asleep = world.systemAsleep || idleSeconds >= 300;
    if (wasAsleep && !world.asleep) onWakeUp();

    if (!world.asleep) {
      maybeGoodMorning();
      maybeLateNight();
      const cfg = { waterInterval: store.get('waterInterval') * TIME_SCALE };
      const due = reminders.waterDue(world.reminders, now(), cfg);
      if (due && !world.thirsty) {
        world.thirsty = true;
        say('water_due', true);
        particles('sweat', 2);
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

  function rollDayIfNeeded() {
    const rolled = reminders.rollDay(world.reminders, now());
    if (rolled !== world.reminders) {
      world.reminders = rolled;
      const key = reminders.localDateKey(now());
      const today = store.get('today');
      if (today.date !== key) {
        store.set({ today: { date: key, pomodoros: 0, water: 0, longestStreakMs: 0 } });
        pushSettings();
        logger.info('daily stats rolled over to ' + key);
      }
    }
  }

  function onWakeUp() {
    logger.info('you came back');
    callPip();
    react('excited');
    say('welcome_back', true);
    particles('sparkle', 5);
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
    world.behavior = { clip: 'stretch', until: t + behaviorLength('stretch') };
    if (new Date(t).getHours() < 12) say('good_morning', true);
    earnHello(t);
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

    // Never let a stray link navigate the overlay away from Pip.
    overlay.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url).catch(() => {});
      return { action: 'deny' };
    });

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
      pomodoroRunning: store.get('pomodoro').phase !== 'off',
      owned: economy.ownedIds(econ),
      coins: econ.coins
    };
  }

  function pushSettings() {
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send('settings:update', settingsPayload());
    }
  }

  function openSettings() {
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
      icon: path.join(__dirname, 'assets', 'icon-256.png'),
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

  function openArcade() {
    if (arcadeWin && !arcadeWin.isDestroyed()) {
      arcadeWin.show();
      arcadeWin.focus();
      return arcadeWin;
    }
    arcadeWin = new BrowserWindow({
      width: 860,
      height: 720,
      minWidth: 760,
      minHeight: 640,
      title: "Pip's Arcade",
      icon: path.join(__dirname, 'assets', 'icon-256.png'),
      backgroundColor: '#1b1530',
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    arcadeWin.setMenu(null);
    arcadeWin.loadFile(path.join(__dirname, 'arcade', 'arcade.html'));
    arcadeWin.once('ready-to-show', () => arcadeWin.show());
    arcadeWin.on('closed', () => { arcadeWin = null; });
    return arcadeWin;
  }

  function openDebug() {
    if (!IS_DEV) return null;
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
    const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
    return img.isEmpty() ? nativeImage.createEmpty() : img;
  }

  /** The tray menu and Pip's right-click menu are deliberately identical. */
  function buildMenu() {
    const running = store.get('pomodoro').phase !== 'off';
    const quiet = now() < store.get('quietUntil');
    const items = [
      { label: running ? 'Stop Pomodoro' : 'Start Pomodoro', click: () => doAction('pomodoro-toggle') },
      { label: 'I drank water', click: () => doAction('water') },
      { label: 'Feed Pip', click: () => doAction('feed') },
      { label: 'Call Pip', click: () => doAction('call') },
      { label: "Pip's Arcade", click: () => doAction('arcade') },
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
    ];
    if (IS_DEV) items.push({ label: 'Debug panel', click: () => doAction('debug') });
    items.push({ type: 'separator' });
    items.push({ label: 'Quit Pip', click: () => doAction('quit') });
    return Menu.buildFromTemplate(items);
  }

  function createTray() {
    tray = new Tray(trayImage());
    tray.setToolTip('Pip');
    tray.setContextMenu(buildMenu());
    tray.on('click', () => doAction('toggle-visible'));
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
      case 'water': {
        world.reminders = reminders.logWater(world.reminders, now());
        world.thirsty = false;
        const today = store.get('today');
        store.set({ today: Object.assign({}, today, { water: today.water + 1 }) });
        react('happy');
        particles('water', 5);
        say('water_logged', true);
        bumpMood('water');
        earnHabit('water');
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
        store.set({ quietUntil: quiet ? 0 : now() + scaled(60 * MINUTE) });
        if (!quiet) say('quiet_on', true);
        sendSettings();
        refreshMenu();
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
      case 'arcade':
        openArcade();
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
    for (const t of [cursorTimer, brainTimer, idleTimer, onboardingTimer, rhythmTimer]) {
      if (t) clearInterval(t);
    }
    if (singleClickTimer) clearTimeout(singleClickTimer);
    stopAppWatcher();
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
    world.cursorX = x;
    const key = point.x + ',' + point.y;
    if (key !== world.lastCursorKey) { world.lastCursorKey = key; world.cursorMoved = true; }
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
      announceFatigue(t, s);
      updateChase(t);
      if (world.reaction && t >= world.reaction.until) world.reaction = null;
      if (world.behavior && t >= world.behavior.until) world.behavior = null;
      updateZoomies(t);
      if (!world.asleep && !world.held) updateContext(t);
      if (!world.asleep && !world.held && !world.zoomies) maybeStartBehavior();
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
        hidden: s.hidden || world.fsHidden,
        mood: mood.decay(s.mood, s.moodUpdatedAt, t),
        hour: new Date(t).getHours(),
        activityLevel: s.activityLevel,
        climbing: world.climbing,
        onBreak: store.get('pomodoro').phase === 'break' ||
                 store.get('pomodoro').phase === 'longBreak',
        onWork: store.get('pomodoro').phase === 'work'
      });
      world.wander = result.wander;

      // The debug panel can pin a state or a clip for inspection.
      const state = world.forced.state || result.state;
      const clip = world.forced.clip || result.clip;

      const key = [state, clip, result.walkDir, Math.round(result.walkSpeed)].join('|');
      if (key === world.lastState) return;
      world.lastState = key;
      send('pip:state', {
        state: state,
        clip: clip,
        walkDir: world.forced.clip ? 0 : result.walkDir,
        walkSpeed: result.walkSpeed
      });
      pushDebug();
    }, 100);
  }

  function startIdlePolling() {
    idleTimer = setInterval(pollIdle, 10000);
    pollIdle();
    rhythmTimer = setInterval(pollRhythm, 1000);
  }

  /** Once a second: typing, mousing, reading or away? (see rhythm.js) */
  function pollRhythm() {
    let idle;
    try { idle = powerMonitor.getSystemIdleTime(); } catch (err) { return; }
    world.rhythm = rhythm.sample(world.rhythm, now(), idle, world.cursorMoved);
    world.cursorMoved = false;
  }

  /* ---------------------------------------------------------------- *
   * App awareness
   * ---------------------------------------------------------------- */

  function startAppWatcher() {
    if (appWatcher || !store.get('appAware') || IS_SMOKE || SHOTS_DIR) return;
    appWatcher = fgwatch.start({
      titles: !!store.get('appTitles'),
      logger: logger,
      onLine: onForeground,
      onStatus: (status, detail) => {
        if (status === 'unavailable') logger.info('app awareness unavailable: ' + (detail || ''));
      }
    });
  }

  function stopAppWatcher() {
    if (appWatcher) { appWatcher.stop(); appWatcher = null; }
    world.app = { category: 'other', fullscreen: false, since: now() };
    world.meeting = false;
    applyFullscreen(false);
  }

  function restartAppWatcher() {
    stopAppWatcher();
    startAppWatcher();
  }

  /** The foreground window changed. Only its category is kept. */
  function onForeground(line) {
    const info = apps.parseLine(line);
    if (!info) return;
    const t = now();
    const category = apps.categorize(info, { titles: !!store.get('appTitles') });
    if (category !== world.app.category) {
      world.appSwitches = world.appSwitches.filter((at) => t - at < 60000).concat([t]);
      // Eight changes of app in a minute: Pip tries to keep up and juggles.
      if (world.appSwitches.length >= 8 && !world.reaction && !world.held) {
        world.appSwitches = [];
        // trying to keep up: juggling it all, or completely lost
        if (rng() < 0.5) react('juggle', Animations.clipDuration('juggle'));
        else react('confused');
        say('tab_juggling');
      }
    }
    world.app = {
      category: category,
      fullscreen: apps.isFullscreen(info),
      since: category === world.app.category ? world.app.since : t
    };
    world.meeting = category === 'meeting' && !!store.get('quietMeetings');
    applyFullscreen(world.app.fullscreen && !!store.get('hideFullscreen'));
  }

  /** Step out of the way of a fullscreen game, video or slideshow. */
  function applyFullscreen(hide) {
    if (!overlay || overlay.isDestroyed()) { world.fsHidden = hide; return; }
    if (hide && !world.fsHidden) {
      world.fsHidden = true;
      overlay.hide();
      logger.info('fullscreen app in front: Pip steps aside');
    } else if (!hide && world.fsHidden) {
      world.fsHidden = false;
      if (!store.get('hidden')) {
        overlay.showInactive();
        overlay.setAlwaysOnTop(true, 'floating');
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * Onboarding
   * ---------------------------------------------------------------- */

  const ONBOARDING = [
    'onboarding_drag', 'onboarding_menu', 'onboarding_flavor', 'onboarding_tray'
  ];

  function runOnboarding() {
    // pip:ready fires again after a renderer reload, which would otherwise
    // start a second interval and orphan the first.
    if (world.onboardingDone || onboardingTimer) return;
    if (store.get('onboarded')) { world.onboardingDone = true; return; }
    world.onboardingStep = 0;
    // Pip has just dropped in and landed; wave, then talk you through it.
    world.behavior = { clip: 'wave', until: now() + scaled(3000) };
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
      sendSettings();
      sendBounds();
      sendPomodoro();
      if (IS_SMOKE) { runSmoke(); return; }
      if (SHOTS_DIR) { runShots(); return; }
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
      world.shaken = false;
      world.zoomies = null;
    });

    /*
     * Things the renderer noticed the pointer doing. The renderer only
     * reports; whether and how Pip reacts is decided here, with his mood,
     * quiet mode and whatever he is already doing in mind.
     */
    ipcMain.on('pip:gesture', (_e, payload) => {
      const kind = payload && payload.kind;
      const t = now();
      if (kind === 'shake') { world.shaken = true; return; }
      if (world.held || world.asleep) return;
      const band = mood.band(mood.decay(store.get('mood'), store.get('moodUpdatedAt'), t));
      switch (kind) {
        case 'tickle':
          react('giggle');
          particles('heart', 2);
          say('tickle');
          bumpMood('pet');
          break;
        case 'pounce': {
          // Only a Pip with nothing better to do, and in the mood, gives chase.
          if (t < store.get('quietUntil') || world.reaction || band === 'low') return;
          if (world.behavior && t < world.behavior.until) return;
          const ready = Animations.clipDuration('pounce_ready');
          react('pounce_ready', ready + Animations.clipDuration('pounce'));
          send('pip:action', { kind: 'pounce', x: payload.x, delay: ready });
          say('pounce');
          break;
        }
        case 'circle':
          react('dizzy');
          particles('star', 3);
          say('dizzy');
          break;
        case 'bonk':
          react('bonk');
          say('bonk');
          break;
        default:
          logger.warn('unknown gesture: ' + kind);
      }
    });

    ipcMain.on('pip:dropped', (_e, payload) => {
      if (payload && typeof payload.x === 'number') world.pipX = payload.x;
      world.held = false;
      if (world.shaken) {
        // shaken about on the way: not dizzy, positively green
        react('queasy');
        particles('sweat', 2);
        say('queasy');
      } else {
        react('dizzy');
        particles('star', 4);
        say('dizzy');
      }
      world.shaken = false;
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
        // A glum Pip stands his ground and stamps; a cheerful one just huffs off.
        if (mood.band(mood.decay(store.get('mood'), store.get('moodUpdatedAt'), now())) === 'low') {
          react('angry', Animations.clipDuration('angry'));
          say('annoyed', true);
          return;
        }
        // Puff up and scoot away from the pointer. The movement has to ride on
        // the reaction itself - a stationary reaction outlasts any wander we
        // could set here and would swallow the scoot entirely.
        const away = scootDirection();
        // Run the huff for exactly as long as the sulk animation lasts, so he
        // does not finish scooting in the idle pose.
        react('sulk', Animations.clipDuration('sulk'), { walkDir: away, walkSpeed: brain.BASE_RUN });
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

      const onFace = !!(payload && payload.face);
      defer(clicks.DOUBLE_MS + 40, () => {
        // A thirsty Pip takes a click as "yes, I drank some".
        if (world.thirsty) { doAction('water'); return; }
        if (onFace) {
          // right on the nose
          react('boop');
          particles('heart', 1);
          say('boop');
          bumpMood('pet');
          return;
        }
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
      react(rng() < 0.35 ? 'scared' : 'surprise');
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
      react('sulk', 3000);
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
      const raw = (payload && payload.patch) || {};
      const patch = {};
      for (const k of Object.keys(raw)) if (USER_SETTINGS.indexOf(k) !== -1) patch[k] = raw[k];
      if ('flavor' in patch) {
        // wearing a Pip goes through equip(), which checks you own it
        const id = patch.flavor;
        delete patch.flavor;
        equip(id);
      }
      store.set(patch);
      if ('launchAtLogin' in patch) applyLoginItem();
      if ('appAware' in patch || 'appTitles' in patch) restartAppWatcher();
      if ('hideFullscreen' in patch && !patch.hideFullscreen) applyFullscreen(false);
      sendSettings();
      refreshMenu();
      pushSettings();
      logger.info('settings changed', patch);
    });

    ipcMain.on('settings:action', (_e, payload) => {
      if (payload && payload.action) doAction(payload.action);
    });

    /* ---- the arcade ---- */

    ipcMain.handle('arcade:get', () => arcadePayload());

    ipcMain.handle('arcade:pull', (_e, payload) => {
      const count = payload && payload.count === 10 ? 10 : 1;
      const res = economy.pull(econ, count, rng, Pips.TYPES, now());
      if (!res.ok) return { ok: false, error: res.error, state: arcadePayload() };
      saveEcon(res.state);
      const fresh = res.results.filter((r) => r.isNew);
      if (fresh.length) {
        // Desktop Pip is delighted about a new friend.
        setTimeout(() => {
          if (quitting) return;
          react('excited');
          particles('confetti', 10);
          say('gacha_new', true);
        }, 2600);
      }
      logger.info('gacha: ' + res.results.map((r) => r.id + (r.isNew ? '*' : '')).join(' '));
      return { ok: true, results: res.results, paidWith: res.paidWith, state: arcadePayload() };
    });

    ipcMain.handle('arcade:spin', (_e, payload) => {
      const bet = Number(payload && payload.bet);
      const res = economy.spin(econ, bet, rng);
      if (!res.ok) return { ok: false, error: res.error, state: arcadePayload() };
      let next = res.state;
      let bonus = null;
      if (res.freePull) {
        // the jackpot: a free capsule, rare or better
        const free = economy.pull(next, 1, rng, Pips.TYPES, now(), { free: true, minRarity: 'rare' });
        next = free.state;
        bonus = free.results[0];
      }
      saveEcon(next);
      if (res.freePull || res.payout >= bet * 10) {
        setTimeout(() => {
          if (quitting) return;
          react('excited');
          say('slot_jackpot', true);
        }, 2200);
      }
      return {
        ok: true, stops: res.stops, reels: res.reels, payout: res.payout, name: res.name,
        ticket: res.ticket, freePull: res.freePull, bonus: bonus, state: arcadePayload()
      };
    });

    ipcMain.handle('arcade:game-end', (_e, payload) => {
      const game = payload && payload.game;
      const res = economy.gameEnd(econ, game, payload && payload.score, dayKey());
      saveEcon(res.state);
      if (res.paid) coinPop(res.paid);
      if (res.highScore) say('game_highscore', true);
      return { paid: res.paid, highScore: res.highScore, best: res.state.highScores[game] || 0, state: arcadePayload() };
    });

    ipcMain.on('arcade:equip', (_e, payload) => {
      if (payload && typeof payload.id === 'string') equip(payload.id);
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
      world.systemAsleep = true;
      world.asleep = true;
      world.reminders = reminders.onBreakEvent(world.reminders, now());
      persistStreak();
      logger.info(why);
    };
    // Windows fires resume AND unlock-screen for one wake, so only the first
    // of the pair actually greets you.
    const wake = (why) => {
      const wasAsleep = world.asleep;
      world.systemAsleep = false;
      world.asleep = false;
      logger.info(why);
      if (wasAsleep) onWakeUp();
    };

    powerMonitor.on('suspend', () => sleep('system suspend'));
    powerMonitor.on('lock-screen', () => sleep('screen locked'));
    powerMonitor.on('resume', () => wake('system resume'));
    powerMonitor.on('unlock-screen', () => wake('screen unlocked'));

    powerMonitor.on('on-battery', () => {
      logger.info('on battery');
      react('sulk', 3000);
      say('on_battery', true);
    });
    powerMonitor.on('on-ac', () => {
      logger.info('on mains power');
      react('happy');
    });
  }

  /**
   * Launch at login is on by default, but only ever registered for a real
   * installed build - never from a dev run and never from the portable exe,
   * which would point the shortcut at wherever the file happened to be.
   */
  function applyLoginItem() {
    if (!app.isPackaged || IS_PORTABLE || IS_DEV) return;
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
        const owned = economy.ownedIds(econ).length;
        win.once('ready-to-show', () => {
          setTimeout(() => {
            win.webContents
              .executeJavaScript('document.querySelectorAll(".flavor canvas").length', true)
              .then((count) => {
                try { win.close(); } catch (err) { /* already gone */ }
                if (count !== owned) {
                  return fail('settings rendered ' + count + ' Pip previews, expected ' + owned);
                }
                process.stdout.write('SMOKE OK settings window rendered ' + owned + ' Pip previews\n');
                return smokeArcade(fail);
              })
              .catch((err) => fail('settings check threw: ' + err.message));
          }, 600);
        });
      })
      .catch((err) => fail('playAll threw: ' + err.message));
  }

  /**
   * Screenshots of the arcade: each machine mid-animation and at rest, the
   * Pipdex, the earning page and each game in play.
   */
  function shootArcade(fs) {
    econ = Object.assign({}, econ, { coins: Math.max(econ.coins, 20000) });
    store.set({ economy: econ });
    const win = openArcade();
    const js = (code) => win.webContents.executeJavaScript(code, true);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let n = 0;
    const shot = async (name) => {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(SHOTS_DIR, String(n++).padStart(2, '0') + '_' + name + '.png'), img.toPNG());
    };
    const click = (sel) => js('document.querySelector(' + JSON.stringify(sel) + ').click()');
    win.once('ready-to-show', () => {
      (async () => {
        for (let i = 0; i < 40 && !(await js('window.__arcade && window.__arcade.ready()')); i++) await wait(100);
        await click('[data-tab="gacha"]');
        await wait(600);
        await shot('gacha_idle');
        await click('#pull1');
        await wait(1500);
        await shot('gacha_crank');
        await wait(1300);
        await shot('gacha_wobble');
        await wait(1500);
        await shot('gacha_reveal');
        await js('document.getElementById("gacha").dispatchEvent(new MouseEvent("click", {clientX: 0, clientY: 0}))');
        await wait(400);
        await click('#pull10');
        await wait(3200);
        await shot('gacha_ten_row');
        await click('#gachaSkip');
        await wait(4200);
        await shot('gacha_ten_open');
        await click('[data-tab="slots"]');
        await wait(500);
        await shot('slots_idle');
        await click('#spin');
        await wait(700);
        await shot('slots_spinning');
        await wait(2400);
        await shot('slots_result');
        await click('[data-tab="pipdex"]');
        await wait(600);
        await shot('pipdex');
        await js('document.querySelector(".pip-card:not(.locked)").click()');
        await wait(900);
        await shot('pipdex_detail');
        await click('#detailClose');
        await click('[data-tab="earn"]');
        await wait(400);
        await shot('earn');
        for (const g of economy.GAME_NAMES) {
          await click('[data-tab="play"]');
          await wait(200);
          await click('[data-game="' + g + '"]');
          await wait(500);
          await shot('game_' + g + '_title');
          await js('document.getElementById("game").dispatchEvent(new MouseEvent("mousedown", {clientX: 400, clientY: 300}))');
          await wait(2500);
          if (g === 'match') {
            await js('(function(){const c=document.getElementById("game");const r=c.getBoundingClientRect();' +
              'for(const [x,y] of [[70,40],[130,40]]){c.dispatchEvent(new MouseEvent("mousedown",{clientX:r.left+x*r.width/320,clientY:r.top+y*r.height/200}));}})()');
            await wait(300);
          }
          await shot('game_' + g + '_play');
          await click('#gameBack');
        }
        process.stdout.write('SHOTS OK arcade -> ' + SHOTS_DIR + '\n');
        quitting = true;
        app.exit(0);
      })().catch((err) => {
        process.stdout.write('SHOTS FAIL ' + err.message + '\n');
        app.exit(1);
      });
    });
  }

  /**
   * The arcade: every card in the Pipdex drawn, one real pull and one real
   * spin through main, and each game's title card opened. The smoke profile
   * is topped up first so the pull can never fail for want of coins.
   */
  function smokeArcade(fail) {
    econ = Object.assign({}, econ, { coins: Math.max(econ.coins, 5000) });
    store.set({ economy: econ });
    const win = openArcade();
    const js = (code) => win.webContents.executeJavaScript(code, true);
    win.once('ready-to-show', () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      (async () => {
        for (let i = 0; i < 40 && !(await js('window.__arcade && window.__arcade.ready()')); i++) await wait(100);
        const cards = await js('window.__arcade.cards()');
        if (cards !== Pips.TYPES.length) return fail('arcade drew ' + cards + ' Pipdex cards, expected ' + Pips.TYPES.length);
        const pulled = await js('window.__arcade.pull()');
        if (pulled !== 1) return fail('arcade pull: ' + pulled);
        const spun = await js('window.__arcade.spin()');
        if (spun !== 3) return fail('arcade spin: ' + spun);
        for (const g of economy.GAME_NAMES) {
          if (!(await js('window.__arcade.game(' + JSON.stringify(g) + ')'))) return fail('arcade has no game ' + g);
          await wait(150);
        }
        process.stdout.write('SMOKE OK arcade: ' + cards + ' Pipdex cards, a pull, a spin and ' + economy.GAME_NAMES.length + ' games\n');
        try { win.close(); } catch (err) { /* already gone */ }
        quitting = true;
        app.exit(0);
      })().catch((err) => fail('arcade check threw: ' + err.message));
    });
  }

  /**
   * Screenshot mode. Each step names a clip (and optionally a type); Pip is
   * pinned to it the same way the debug panel pins one, given a moment to
   * settle, and the area around him is captured to a PNG.
   */
  function runShots() {
    const fs = require('fs');
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    if (process.argv.includes('--shots-arcade')) { shootArcade(fs); return; }
    const only = (process.argv.find((a) => a.startsWith('--shots-clips=')) || '').slice('--shots-clips='.length);
    const clips = only ? only.split(',') : Animations.CLIP_NAMES;
    const typeArg = (process.argv.find((a) => a.startsWith('--shots-type=')) || '').slice('--shots-type='.length);
    if (typeArg) { store.set({ flavor: typeArg }); sendSettings(); }
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      await wait(1500);
      let i = 0;
      for (const clip of clips) {
        world.forced.clip = clip;
        world.lastState = null;
        await wait(Math.min(1400, Math.max(500, Animations.clipDuration(clip) * 0.4)));
        const pos = await overlay.webContents.executeJavaScript('window.__pip.state()', true);
        const s = scale();
        const rect = {
          x: Math.max(0, Math.round(pos.x - 90 * s)),
          y: Math.max(0, Math.round(pos.y - 110 * s)),
          width: Math.round(180 * s),
          height: Math.round(120 * s)
        };
        const img = await overlay.webContents.capturePage(rect);
        fs.writeFileSync(require('path').join(SHOTS_DIR, String(i++).padStart(2, '0') + '_' + clip + '.png'), img.toPNG());
      }
      process.stdout.write('SHOTS OK ' + clips.length + ' -> ' + SHOTS_DIR + '\n');
      quitting = true;
      app.exit(0);
    })().catch((err) => {
      process.stdout.write('SHOTS FAIL ' + err.message + '\n');
      app.exit(1);
    });
  }

  /* ---------------------------------------------------------------- *
   * Boot
   * ---------------------------------------------------------------- */

  app.on('second-instance', () => {
    // Launching Pip again just brings him over, rather than opening a copy.
    if (store.get('hidden')) doAction('toggle-visible');
    if (overlay && !overlay.isDestroyed()) {
      overlay.showInactive();
      overlay.setAlwaysOnTop(true, 'floating');
    }
    world.behavior = { clip: 'wave', until: now() + scaled(2500) };
    callPip();
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
    // Recover a Pomodoro that was running when Pip was last closed.
    store.set({ pomodoro: pomodoro.restore(store.get('pomodoro'), now(), pomodoroCfg()) });
    // Without a baseline, decay never starts and mood sits at its default
    // until the first time Pip is petted or fed.
    if (!store.get('moodUpdatedAt')) store.set({ moodUpdatedAt: now() });
    rollDayIfNeeded();
    applyLoginItem();

    wireIPC();
    createOverlay();
    createTray();
    wireSystemEvents();
    startCursorPolling();
    startBrain();
    startIdlePolling();
    startAppWatcher();

    if (IS_SMOKE) {
      setTimeout(() => {
        logger.error('SMOKE FAIL timed out');
        process.stdout.write('SMOKE FAIL timed out\n');
        app.exit(1);
      }, 40000);
    }
  });
}
