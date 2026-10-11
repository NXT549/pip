/*
 * settings.js - the settings window.
 *
 * Everything here applies live: each control sends a patch the moment it
 * changes and the main process pushes the new state straight to Pip. Nothing
 * needs a restart except compatibility mode, which says so on the label.
 */

'use strict';

(function () {
  const api = window.pipSettings;
  const Palettes = window.Pip && window.Pip.Palettes;
  const Sprites = window.Pip && window.Pip.Sprites;

  /** The frame used for the little flavour previews. */
  const PREVIEW_FRAME = 'idle_0';
  const PREVIEW_SCALE = 2;

  /** Controls that map straight onto a settings key. */
  const NUMBER_FIELDS = [
    'pomodoroWork', 'pomodoroBreak', 'pomodoroLongBreak', 'pomodoroLongEvery',
    'drowsyAfter', 'exhaustedAfter', 'waterInterval', 'waterGoal'
  ];
  const SELECT_FIELDS = ['petSize', 'activityLevel'];
  const TOGGLE_FIELDS = ['notifications', 'launchAtLogin', 'compatibilityMode', 'seasonal'];

  let current = null;

  /** The running block as main last described it, and when that was. */
  let block = null;
  let blockAt = 0;
  let countdownTimer = null;

  /* ---------------------------------------------------------------- *
   * Flavour previews
   * ---------------------------------------------------------------- */

  function drawPreview(canvas, flavor) {
    if (!Palettes || !Sprites) return;
    const rows = Sprites.FRAMES[PREVIEW_FRAME] || Sprites.FRAMES[Sprites.FRAME_NAMES[0]];
    if (!rows) return;
    const palette = Palettes.resolve(flavor);
    const N = Sprites.FRAME_SIZE;

    // Crop to Pip so the preview is not mostly empty space.
    let minR = N, maxR = -1, minC = N, maxC = -1;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (rows[r][c] === Palettes.TRANSPARENT) continue;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
    if (maxR < 0) return;

    const w = maxC - minC + 1;
    const h = maxR - minR + 1;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * PREVIEW_SCALE * dpr);
    canvas.height = Math.round(h * PREVIEW_SCALE * dpr);
    canvas.style.width = w * PREVIEW_SCALE + 'px';
    canvas.style.height = h * PREVIEW_SCALE + 'px';

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const px = PREVIEW_SCALE * dpr;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const ch = rows[minR + r][minC + c];
        if (ch === Palettes.TRANSPARENT) continue;
        const color = palette[ch];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(c * px), Math.round(r * px), Math.ceil(px), Math.ceil(px));
      }
    }
  }

  function buildFlavors() {
    const host = document.getElementById('flavors');
    if (!host || !Palettes) return;
    host.textContent = '';
    for (const name of Palettes.FLAVOR_NAMES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'flavor';
      button.dataset.flavor = name;
      button.setAttribute('aria-pressed', 'false');

      const canvas = document.createElement('canvas');
      const label = document.createElement('span');
      label.textContent = name;

      button.appendChild(canvas);
      button.appendChild(label);
      host.appendChild(button);

      drawPreview(canvas, name);
      button.addEventListener('click', () => {
        api.set({ flavor: name });
        markFlavor(name);
      });
    }
  }

  function markFlavor(flavor) {
    for (const el of document.querySelectorAll('.flavor')) {
      el.setAttribute('aria-pressed', el.dataset.flavor === flavor ? 'true' : 'false');
    }
  }

  /* ---------------------------------------------------------------- *
   * Form wiring
   * ---------------------------------------------------------------- */

  function bind() {
    for (const key of NUMBER_FIELDS) {
      const el = document.getElementById(key);
      if (!el) continue;
      el.addEventListener('change', () => {
        const n = parseInt(el.value, 10);
        const min = parseInt(el.min, 10);
        const max = parseInt(el.max, 10);
        if (!isFinite(n)) { el.value = current ? current[key] : el.min; return; }
        const clamped = Math.min(max, Math.max(min, n));
        el.value = clamped;
        api.set({ [key]: clamped });
      });
    }

    for (const key of SELECT_FIELDS) {
      const el = document.getElementById(key);
      if (!el) continue;
      el.addEventListener('change', () => api.set({ [key]: el.value }));
    }

    for (const key of TOGGLE_FIELDS) {
      const el = document.getElementById(key);
      if (!el) continue;
      el.addEventListener('change', () => api.set({ [key]: el.checked }));
    }

    for (const el of document.querySelectorAll('[data-action]')) {
      el.addEventListener('click', () => api.action(el.dataset.action));
    }
  }

  /* ---------------------------------------------------------------- *
   * Rendering state
   * ---------------------------------------------------------------- */

  function moodWord(mood) {
    if (typeof mood !== 'number') return '-';
    if (mood >= 80) return 'Delighted';
    if (mood >= 60) return 'Cheery';
    if (mood >= 40) return 'Content';
    if (mood >= 20) return 'A bit glum';
    return 'Mopey';
  }

  function formatStreak(ms) {
    const mins = Math.floor((ms || 0) / 60000);
    if (mins < 60) return mins + 'm';
    return Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
  }

  function render(payload) {
    if (!payload) return;
    const s = payload.settings;
    const today = payload.today || {};
    current = s;

    for (const key of NUMBER_FIELDS) {
      const el = document.getElementById(key);
      if (el && document.activeElement !== el) el.value = s[key];
    }
    for (const key of SELECT_FIELDS) {
      const el = document.getElementById(key);
      if (el) el.value = s[key];
    }
    for (const key of TOGGLE_FIELDS) {
      const el = document.getElementById(key);
      if (el) el.checked = !!s[key];
    }
    markFlavor(s.flavor);
    renderSeason(s);

    document.getElementById('statPomodoros').textContent = today.pomodoros || 0;
    const goal = s.waterGoal || 0;
    document.getElementById('statWater').textContent =
      goal > 0 ? (today.water || 0) + ' / ' + goal : (today.water || 0);
    label('statWaterLabel', goal > 0 ? 'Glasses toward your goal' : 'Glasses of water');
    document.getElementById('statStreak').textContent = formatStreak(today.longestStreakMs);
    document.getElementById('statMood').textContent = moodWord(today.mood);
    renderHistory(payload.history, s.flavor);

    // The buttons toggle, so they say what they will do next.
    label('btnPomodoro', payload.pomodoroRunning ? 'Stop Pomodoro' : 'Start Pomodoro');
    label('btnQuiet', payload.quiet ? 'End quiet mode' : 'Quiet for 1 hour');
    label('btnVisible', payload.hidden ? 'Show Pip' : 'Hide Pip');
    renderPomodoro(payload.pomodoro);
  }

  /* ---------------------------------------------------------------- *
   * Pomodoro status
   * ---------------------------------------------------------------- */

  const PHASE_WORDS = { work: 'Focus', break: 'Short break', longBreak: 'Long break' };

  /** 4:05 for 245 seconds; 1:02:03 past the hour. */
  function clock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = String(total % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + sec : m + ':' + sec;
  }

  /**
   * Main only pushes on a change, so the countdown runs here, from the time
   * left when the update arrived. Each push re-bases it, so it cannot drift.
   */
  function renderPomodoro(p) {
    block = p && p.running ? p : null;
    blockAt = Date.now();
    const skip = document.getElementById('btnSkip');
    if (skip) skip.hidden = !(block && (block.phase === 'break' || block.phase === 'longBreak'));
    tickCountdown();
    if (block && !countdownTimer) countdownTimer = setInterval(tickCountdown, 1000);
    if (!block && countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  }

  function tickCountdown() {
    const el = document.getElementById('pomodoroStatus');
    if (!el) return;
    el.hidden = !block;
    if (!block) return;
    const left = block.remainingMs - (Date.now() - blockAt);
    el.textContent = (PHASE_WORDS[block.phase] || 'Pomodoro') + ': ' + clock(left) + ' left';
  }

  /* ---------------------------------------------------------------- *
   * Streak calendar
   * ---------------------------------------------------------------- */

  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  /** 'Wed 1 Oct' for a local YYYY-MM-DD key. */
  function formatDay(key) {
    const parts = key.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2])
      .toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function dayTitle(day) {
    if (day.future) return formatDay(day.date);
    const bits = [plural(day.pomodoros, 'Pomodoro', 'Pomodoros'), plural(day.water, 'glass', 'glasses')];
    if (day.longestStreakMs >= 60000) bits.push('longest stretch ' + formatStreak(day.longestStreakMs));
    return formatDay(day.date) + (day.today ? ' (today)' : '') + ': ' + bits.join(', ');
  }

  function renderHistory(h, flavor) {
    const host = document.getElementById('calendar');
    if (!host || !h || !Array.isArray(h.days)) return;
    if (Palettes) host.style.setProperty('--bean', Palettes.resolve(flavor).B);

    document.getElementById('weekPomodoros').textContent = h.week.pomodoros;
    document.getElementById('weekWater').textContent = h.week.water;
    document.getElementById('weekDays').textContent = h.week.activeDays + ' of 7';
    document.getElementById('dayStreak').textContent = plural(h.streak, 'day', 'days');

    host.textContent = '';
    for (const name of WEEKDAYS) {
      const el = document.createElement('div');
      el.className = 'weekday';
      el.textContent = name;
      host.appendChild(el);
    }
    for (const day of h.days) {
      const el = document.createElement('div');
      el.className = 'day lv' + day.level +
        (day.today ? ' is-today' : '') + (day.future ? ' is-future' : '');
      el.title = dayTitle(day);
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', el.title);
      host.appendChild(el);
    }
  }

  /** While Pip wears a seasonal flavour, say so, and what he goes back to. */
  function renderSeason(s) {
    const el = document.getElementById('seasonNote');
    if (!el) return;
    const season = s.season || {};
    const wearing = s.seasonal && season.key && s.flavor === season.flavor;
    el.hidden = !wearing;
    if (!wearing) return;
    const back = season.previous && season.previous !== season.flavor
      ? ' He goes back to ' + season.previous + ' when it ends.'
      : '';
    el.textContent = 'Pip is in ' + season.flavor + ' for the season.' + back +
      ' Pick any flavor to change him now.';
  }

  function label(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  /* ---------------------------------------------------------------- *
   * Boot
   * ---------------------------------------------------------------- */

  buildFlavors();
  bind();
  api.onUpdate(render);
  api.get().then(render).catch(() => { /* main will push an update shortly */ });
})();
