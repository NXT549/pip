/*
 * debug.js - the dev-mode debug panel.
 *
 * Shows what the brain currently thinks and lets you force any state, clip or
 * flavour, plus push the clock forward so you can watch a Pomodoro finish
 * without waiting for it. Only reachable when Pip is running in dev mode.
 */

'use strict';

(function () {
  const api = window.pipDebug;
  const Palettes = window.Pip && window.Pip.Palettes;
  const Animations = window.Pip && window.Pip.Animations;

  /** Must match brain.STATE_PRIORITY. */
  const STATES = [
    'held', 'sleeping', 'celebrating', 'thirsty',
    'exhausted', 'drowsy', 'reaction', 'idle'
  ];

  let forced = { state: null, clip: null };

  function mins(ms) {
    if (typeof ms !== 'number' || !isFinite(ms)) return '-';
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return m + 'm ' + String(s).padStart(2, '0') + 's';
  }

  function text(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value === undefined || value === null ? '-' : String(value);
  }

  function buttons(hostId, names, onPick, isActive) {
    const host = document.getElementById(hostId);
    if (!host) return;
    host.textContent = '';
    for (const name of names) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = name;
      b.dataset.name = name;
      b.addEventListener('click', () => onPick(name));
      host.appendChild(b);
    }
    if (isActive) refreshActive(hostId, isActive);
  }

  function refreshActive(hostId, isActive) {
    const host = document.getElementById(hostId);
    if (!host) return;
    for (const b of host.children) {
      b.classList.toggle('on', isActive(b.dataset.name));
    }
  }

  /* ---- controls ---- */

  buttons('states', STATES, (name) => {
    // Clicking the active state clears the override.
    forced.state = forced.state === name ? null : name;
    api.force({ state: forced.state });
    refreshActive('states', (n) => n === forced.state);
  }, (n) => n === forced.state);

  buttons('clips', Animations ? Animations.CLIP_NAMES : [], (name) => {
    forced.clip = forced.clip === name ? null : name;
    api.force({ clip: forced.clip });
    refreshActive('clips', (n) => n === forced.clip);
  }, (n) => n === forced.clip);

  buttons('flavors', Palettes ? Palettes.FLAVOR_NAMES : [], (name) => {
    api.force({ flavor: name });
  });

  document.getElementById('ff10').addEventListener('click', () => {
    api.force({ fastForwardMs: 10 * 60 * 1000 });
  });
  document.getElementById('ffReset').addEventListener('click', () => {
    api.force({ resetClock: true });
  });

  /* ---- live state ---- */

  api.onState((s) => {
    if (!s) return;
    text('state', s.state);
    text('clip', s.clip);
    text('flavor', s.flavor);
    text('mood', typeof s.mood === 'number' ? s.mood.toFixed(1) : '-');
    text('work', mins(s.continuousWorkMs));
    text('idle', typeof s.idleSeconds === 'number' ? s.idleSeconds + 's' : '-');
    text('pomodoro', s.pomodoro
      ? s.pomodoro.phase + (s.pomodoro.phase === 'off' ? '' : ' - ' + mins(s.pomodoro.remainingMs) + ' left, ' + s.pomodoro.completed + ' done')
      : '-');
    text('water', mins(s.waterDueInMs));
    text('offset', mins(s.clockOffsetMs));

    if (s.forced) {
      forced.state = s.forced.state || null;
      forced.clip = s.forced.clip || null;
      refreshActive('states', (n) => n === forced.state);
      refreshActive('clips', (n) => n === forced.clip);
    }
  });
})();
