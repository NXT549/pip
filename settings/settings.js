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
  const Compose = window.Pip && window.Pip.Compose;
  const Pips = window.Pip && window.Pip.Pips;

  /** The frame used for the little flavour previews. */
  const PREVIEW_FRAME = 'idle_0';
  const PREVIEW_SCALE = 1.5;

  /** Controls that map straight onto a settings key. */
  const NUMBER_FIELDS = [
    'pomodoroWork', 'pomodoroBreak', 'pomodoroLongBreak', 'pomodoroLongEvery',
    'drowsyAfter', 'exhaustedAfter', 'waterInterval'
  ];
  const SELECT_FIELDS = ['petSize', 'activityLevel', 'effects'];
  const TOGGLE_FIELDS = ['notifications', 'launchAtLogin', 'compatibilityMode',
    'appAware', 'appTitles', 'hideFullscreen', 'quietMeetings'];

  let current = null;

  /* ---------------------------------------------------------------- *
   * Flavour previews
   * ---------------------------------------------------------------- */

  function drawPreview(canvas, flavor) {
    if (!Palettes || !Sprites || !Compose || !Pips) return;
    const type = Pips.get(flavor);
    const rows = Compose.compose(PREVIEW_FRAME, { type: type }) || Sprites.FRAMES[Sprites.FRAME_NAMES[0]];
    if (!rows) return;
    const palette = Palettes.resolve(type.palette);
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
    if (!host || !Palettes || !Pips) return;
    host.textContent = '';
    for (const name of Pips.STARTERS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'flavor';
      button.dataset.flavor = name;
      button.setAttribute('aria-pressed', 'false');

      const canvas = document.createElement('canvas');
      const label = document.createElement('span');
      label.textContent = Pips.get(name).name;

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

    document.getElementById('statPomodoros').textContent = today.pomodoros || 0;
    document.getElementById('statWater').textContent = today.water || 0;
    document.getElementById('statStreak').textContent = formatStreak(today.longestStreakMs);
    document.getElementById('statMood').textContent = moodWord(today.mood);

    const btn = document.getElementById('btnPomodoro');
    if (btn) {
      const running = payload.pomodoroRunning;
      btn.textContent = running ? 'Stop Pomodoro' : 'Start Pomodoro';
    }
  }

  /* ---------------------------------------------------------------- *
   * Boot
   * ---------------------------------------------------------------- */

  buildFlavors();
  bind();
  api.onUpdate(render);
  api.get().then(render).catch(() => { /* main will push an update shortly */ });
})();
