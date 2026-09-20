/*
 * renderer.js - draws Pip and handles everything the pointer does to him.
 *
 * The main process decides *what* Pip is doing; this file decides what that
 * looks like. It owns:
 *   - pre-rendering every sprite frame to an offscreen canvas at the current
 *     flavour and scale (redone when either changes)
 *   - the animation clock
 *   - running physics.js and drawing the result
 *   - pixel-accurate hit testing, so the click-through window only becomes
 *     solid when the cursor is actually over Pip's pixels
 *   - dragging, and throwing on release
 */

'use strict';

(function () {
  const P = window.Pip;
  const bridge = window.pipBridge;
  const Palettes = P.Palettes;
  const Sprites = P.Sprites;
  const Animations = P.Animations;
  const Physics = P.Physics;

  const SIZE = Sprites.FRAME_SIZE;
  /** Sprite row the feet rest on, plus one, so we can sit Pip on the floor. */
  const FOOT_OFFSET = 31;
  const TARGET_FPS = 30;
  const SLEEP_FPS = 5;

  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d', { alpha: true });

  /* ---------------------------------------------------------------- *
   * State
   * ---------------------------------------------------------------- */

  let settings = { flavor: 'cherry', scale: 4, activityLevel: 'normal', quiet: false };
  let bounds = { left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100 };
  let dpr = window.devicePixelRatio || 1;

  /** frameName -> offscreen canvas, rebuilt on flavour/scale change */
  let frameCache = Object.create(null);

  let body = Physics.createBody(120, 100);
  let clip = 'idle';
  let clipStart = 0;
  let currentFrame = Sprites.FRAME_NAMES[0];

  let walkDir = 0;           // -1, 0, 1 - drive from main
  let walkSpeed = 0;

  let cursor = { x: -9999, y: -9999, inside: false };
  let overPip = false;       // last value we told main about
  let interactive = false;

  let drag = null;           // {dx, dy, samples:[{x,y,t}]}
  let lastClickAt = 0;
  let pendingClickTimer = null;

  let lastDrawKey = '';
  let lastTick = 0;
  let sleeping = false;
  let ready = false;

  /* ---------------------------------------------------------------- *
   * Pre-rendering
   * ---------------------------------------------------------------- */

  /**
   * Draw every frame once into its own canvas at the current scale, so the
   * animation loop only ever does a single drawImage per frame.
   */
  function prerender() {
    const palette = Palettes.resolve(settings.flavor);
    const px = settings.scale * dpr;      // device pixels per sprite pixel
    const cache = Object.create(null);

    for (const name of Sprites.FRAME_NAMES) {
      const rows = Sprites.FRAMES[name];
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(SIZE * px));
      c.height = Math.max(1, Math.round(SIZE * px));
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      for (let r = 0; r < SIZE; r++) {
        const row = rows[r];
        for (let col = 0; col < SIZE; col++) {
          const ch = row[col];
          if (ch === Palettes.TRANSPARENT) continue;
          const color = palette[ch];
          if (!color) continue;
          g.fillStyle = color;
          // round outwards so neighbouring pixels never leave a seam
          const x0 = Math.round(col * px);
          const y0 = Math.round(r * px);
          const x1 = Math.round((col + 1) * px);
          const y1 = Math.round((r + 1) * px);
          g.fillRect(x0, y0, x1 - x0, y1 - y0);
        }
      }
      cache[name] = c;
    }
    frameCache = cache;
    lastDrawKey = '';
  }

  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(bounds.width));
    const h = Math.max(1, Math.round(bounds.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    lastDrawKey = '';
  }

  /* ---------------------------------------------------------------- *
   * Geometry
   * ---------------------------------------------------------------- */

  /** Where Pip's sprite box sits on screen right now, in DIPs. */
  function spriteRect() {
    const sy = body.squash;
    const sx = 1 / body.squash;
    const w = SIZE * settings.scale * sx;
    const h = SIZE * settings.scale * sy;
    return {
      left: body.x - w / 2,
      top: body.y - FOOT_OFFSET * settings.scale * sy,
      width: w,
      height: h,
      sx: sx,
      sy: sy
    };
  }

  /**
   * Is (x, y) - overlay DIPs - on an opaque pixel of Pip's current frame?
   * Tests the sprite data directly, which is exact and costs nothing.
   */
  function hitTest(x, y) {
    const rows = Sprites.FRAMES[currentFrame];
    if (!rows) return false;
    const rect = spriteRect();
    if (x < rect.left || x >= rect.left + rect.width) return false;
    if (y < rect.top || y >= rect.top + rect.height) return false;

    let col = Math.floor(((x - rect.left) / rect.width) * SIZE);
    const row = Math.floor(((y - rect.top) / rect.height) * SIZE);
    if (body.facing === -1) col = SIZE - 1 - col;
    if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) return false;
    return rows[row][col] !== Palettes.TRANSPARENT;
  }

  /** The walkable floor and walls, inset so Pip is always fully visible. */
  function worldBounds() {
    const half = (SIZE * settings.scale) / 2;
    return {
      left: half,
      right: Math.max(half + 1, bounds.width - half),
      top: half,
      bottom: Math.max(half + 1, bounds.height),
      height: SIZE * settings.scale
    };
  }

  /* ---------------------------------------------------------------- *
   * Animation
   * ---------------------------------------------------------------- */

  function setClip(name, now) {
    if (!Animations.CLIPS[name] || clip === name) return;
    clip = name;
    clipStart = now;
  }

  function advanceAnimation(now) {
    const res = Animations.frameAt(clip, now - clipStart);
    if (res.frame) currentFrame = res.frame;
    if (res.done) {
      const next = Animations.CLIPS[clip] && Animations.CLIPS[clip].next;
      if (next) setClip(next, now);
    }
  }

  /* ---------------------------------------------------------------- *
   * Drawing
   * ---------------------------------------------------------------- */

  function draw() {
    const rect = spriteRect();
    // Only repaint when something actually moved or changed.
    const key = [
      currentFrame,
      Math.round(rect.left * 2),
      Math.round(rect.top * 2),
      Math.round(rect.width * 2),
      Math.round(rect.height * 2),
      body.facing,
      settings.flavor
    ].join('|');
    if (key === lastDrawKey) return false;
    lastDrawKey = key;

    ctx.clearRect(0, 0, bounds.width, bounds.height);

    const img = frameCache[currentFrame];
    if (!img) return true;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (body.facing === -1) {
      ctx.translate(rect.left + rect.width, rect.top);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
    } else {
      ctx.drawImage(img, rect.left, rect.top, rect.width, rect.height);
    }
    ctx.restore();
    return true;
  }

  /* ---------------------------------------------------------------- *
   * Main loop
   * ---------------------------------------------------------------- */

  function tick(now) {
    requestAnimationFrame(tick);

    const minStep = 1000 / (sleeping ? SLEEP_FPS : TARGET_FPS);
    if (now - lastTick < minStep) return;
    const dt = Math.min(0.1, (now - lastTick) / 1000);
    lastTick = now;

    const wb = worldBounds();

    if (drag) {
      body.x = cursor.x + drag.dx;
      body.y = cursor.y + drag.dy;
      Physics.clamp(body, wb);
      drag.samples.push({ x: body.x, y: body.y, t: now });
      if (drag.samples.length > 20) drag.samples.shift();
    }

    const opts = {};
    if (!drag && body.grounded && walkDir !== 0) opts.walkSpeed = walkDir * walkSpeed;
    const events = Physics.step(body, dt, wb, opts);

    if (events.respawned) notify('pip:error', { message: 'position was invalid, respawned' });

    advanceAnimation(now);
    updateHover();
    draw();

    if (!ready) {
      ready = true;
      notify('pip:ready', {});
    }
  }

  /* ---------------------------------------------------------------- *
   * Pointer
   * ---------------------------------------------------------------- */

  /**
   * The overlay ignores the mouse by default so clicks fall through to the
   * desktop. The moment the cursor is over Pip's actual pixels we ask main to
   * stop ignoring, and the moment it leaves we hand the mouse back. We only
   * send IPC when that answer changes.
   */
  function updateHover() {
    const over = drag ? true : hitTest(cursor.x, cursor.y);
    if (over === overPip) return;
    overPip = over;
    setInteractive(over);
  }

  function setInteractive(want) {
    if (want === interactive) return;
    interactive = want;
    notify('pip:set-interactive', { interactive: want });
  }

  function notify(channel, payload) {
    try { bridge.send(channel, payload); } catch (err) { /* main is gone */ }
  }

  window.addEventListener('mousemove', (e) => {
    cursor.x = e.clientX;
    cursor.y = e.clientY;
    cursor.inside = true;
  });

  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (!hitTest(e.clientX, e.clientY)) return;
    e.preventDefault();
    const rect = spriteRect();
    drag = {
      dx: body.x - e.clientX,
      dy: body.y - e.clientY,
      samples: [{ x: body.x, y: body.y, t: performance.now() }],
      moved: false,
      startX: e.clientX,
      startY: e.clientY
    };
    body.held = true;
    body.climbing = null;
    notify('pip:grabbed', {});
  });

  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.startX) > 3 || Math.abs(e.clientY - drag.startY) > 3) {
      drag.moved = true;
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0 || !drag) return;
    const now = performance.now();
    const v = Physics.throwVelocity(drag.samples, now);
    const wasDrag = drag.moved;
    drag = null;
    body.held = false;
    body.vx = v.vx;
    body.vy = v.vy;
    body.grounded = false;

    if (wasDrag) {
      notify('pip:dropped', { x: body.x, y: body.y });
    } else {
      handleClick(e.clientX, e.clientY, now);
    }
    updateHover();
  });

  function handleClick(x, y, now) {
    const isDouble = now - lastClickAt < 320;
    lastClickAt = now;
    if (isDouble) {
      if (pendingClickTimer) { clearTimeout(pendingClickTimer); pendingClickTimer = null; }
      notify('pip:click', { kind: 'double', x: x, y: y });
      return;
    }
    // Hold the single click briefly so a double click does not also fire one.
    pendingClickTimer = setTimeout(() => {
      pendingClickTimer = null;
      notify('pip:click', { kind: 'single', x: x, y: y });
    }, 320);
  }

  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!hitTest(e.clientX, e.clientY)) return;
    notify('pip:context-menu', { x: e.clientX, y: e.clientY });
  });

  /* ---------------------------------------------------------------- *
   * Messages from main
   * ---------------------------------------------------------------- */

  bridge.on('pip:settings', (s) => {
    const flavourChanged = s.flavor !== settings.flavor;
    const scaleChanged = s.scale !== settings.scale;
    settings = Object.assign({}, settings, s);
    if (flavourChanged || scaleChanged || !Object.keys(frameCache).length) prerender();
  });

  bridge.on('pip:bounds', (b) => {
    bounds = Object.assign({}, bounds, b);
    resizeCanvas();
    Physics.clamp(body, worldBounds());
  });

  bridge.on('pip:state', (s) => {
    const now = performance.now();
    if (s.clip) setClip(s.clip, now);
    if (typeof s.walkDir === 'number') walkDir = s.walkDir;
    if (typeof s.walkSpeed === 'number') walkSpeed = s.walkSpeed;
    if (typeof s.facing === 'number' && walkDir === 0) body.facing = s.facing;
    sleeping = s.state === 'sleeping';
  });

  bridge.on('pip:cursor', (c) => {
    // Main polls the real cursor, which keeps Pip aware of it even while the
    // overlay is click-through and receiving no DOM events.
    if (!drag) {
      cursor.x = c.x;
      cursor.y = c.y;
      cursor.inside = c.inside;
    }
  });

  bridge.on('pip:reset', () => {
    Physics.respawn(body, worldBounds());
    drag = null;
    body.held = false;
    lastDrawKey = '';
  });

  /* ---------------------------------------------------------------- *
   * Boot
   * ---------------------------------------------------------------- */

  window.addEventListener('error', (e) => {
    notify('pip:error', { message: e.message, stack: e.error && e.error.stack });
  });
  window.addEventListener('unhandledrejection', (e) => {
    notify('pip:error', { message: 'unhandled rejection: ' + (e.reason && e.reason.message) });
  });

  resizeCanvas();
  prerender();
  Physics.respawn(body, worldBounds());
  lastTick = performance.now();
  clipStart = lastTick;
  requestAnimationFrame(tick);

  // Exposed so the smoke test can drive the renderer without a real user.
  window.__pip = {
    prerender: prerender,
    setFlavor: (f) => { settings.flavor = f; prerender(); },
    playAll: function () {
      const errors = [];
      for (const flavor of Palettes.FLAVOR_NAMES) {
        try {
          settings.flavor = flavor;
          prerender();
          for (const name of Animations.CLIP_NAMES) {
            const c = Animations.CLIPS[name];
            let t = 0;
            for (let i = 0; i < c.frames.length; i++) {
              const res = Animations.frameAt(name, t);
              if (!res.frame || !Sprites.FRAMES[res.frame]) {
                errors.push(flavor + '/' + name + ': missing frame ' + res.frame);
              }
              if (!frameCache[res.frame]) {
                errors.push(flavor + '/' + name + ': frame not pre-rendered: ' + res.frame);
              }
              t += c.durations[i];
            }
          }
        } catch (err) {
          errors.push(flavor + ': ' + err.message);
        }
      }
      settings.flavor = 'cherry';
      prerender();
      return errors;
    },
    state: () => ({ clip: clip, frame: currentFrame, x: body.x, y: body.y, flavor: settings.flavor })
  };
})();
