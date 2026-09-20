/*
 * renderer.js - draws Pip and handles everything the pointer does to him.
 *
 * The main process decides *what* Pip is doing; this file decides what that
 * looks like. It owns:
 *   - pre-rendering every sprite frame to an offscreen canvas at the current
 *     flavour and scale (redone when either changes)
 *   - the animation clock
 *   - running physics.js, climbing the screen edges, and drawing the result
 *   - the effects layer: particles, one speech bubble, the Pomodoro ring
 *   - pixel-accurate hit testing, so the click-through window only becomes
 *     solid when the cursor is actually over Pip's pixels
 *   - dragging, throwing, petting and being startled
 */

'use strict';

(function () {
  const P = window.Pip;
  const bridge = window.pipBridge;
  const Palettes = P.Palettes;
  const Sprites = P.Sprites;
  const Animations = P.Animations;
  const Physics = P.Physics;
  const Particles = P.Particles;
  const Bubbles = P.Bubbles;

  const SIZE = Sprites.FRAME_SIZE;
  /** Sprite row the feet rest on, plus one, so we can sit Pip on the floor. */
  const FOOT_OFFSET = 31;
  const TARGET_FPS = 30;
  const SLEEP_FPS = 5;

  /** Petting: the cursor has to rest on Pip for about this long. */
  const PET_MS = 1000;
  /** Startle: this fast, this close. */
  const STARTLE_SPEED = 1400;      // DIP/s
  const STARTLE_RANGE = 130;       // DIP
  const STARTLE_COOLDOWN = 6000;
  /** Eye tracking kicks in inside this radius. */
  const LOOK_RANGE = 220;

  /** Above this ground speed Pip is running, not trotting. */
  const RUN_SPEED = 70;            // DIP/s

  /** How far Pip swings behind the pointer while being carried, in radians. */
  const MAX_SWAY = 0.38;

  const CLIMB_SPEED = 46;          // DIP/s up a wall
  const CLIMB_CHANCE = 0.25;       // on bumping a wall while wandering
  const HANG_MS = 2600;

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
  let pipState = 'idle';

  let walkDir = 0;
  let walkSpeed = 0;
  let gotoX = null;

  let cursor = { x: -9999, y: -9999, inside: false, t: 0, vx: 0, vy: 0 };
  let overPip = false;
  let interactive = false;
  let hoverSince = 0;
  let petSent = false;
  let lastStartleAt = 0;

  let drag = null;
  let lastClickAt = 0;
  let pendingClickTimer = null;

  let particleList = [];
  let bubble = null;
  let pomodoro = { running: false, phase: 'off', remainingMs: 0, totalMs: 0 };
  let battery = null;              // {level, charging} once known

  let climbUntil = 0;
  let lastClimbSent = false;
  let landedUntil = 0;
  let sway = 0;                    // dangle angle, eased toward drag speed

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
      height: h
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

  function pipCenter() {
    const rect = spriteRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.45 };
  }

  function headPoint() {
    const rect = spriteRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.12 };
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
    applyLook();
    applyNightcap();
  }

  /**
   * After 10pm Pip wears a nightcap. The art ships a `_cap` twin of the sleepy
   * poses, so this is a straight frame swap wherever one exists.
   */
  function applyNightcap() {
    if (!settings.nightcap) return;
    const capped = currentFrame + '_cap';
    if (Sprites.FRAMES[capped]) currentFrame = capped;
  }

  /**
   * Eye tracking. The frames are pre-rendered so the pupils cannot be moved
   * directly - instead, when the cursor is close and Pip is just standing
   * about, swap in the look-around frames. It reads as Pip following you.
   */
  function applyLook() {
    if (pipState !== 'idle' || clip !== 'idle' || drag) return;
    if (!cursor.inside) return;
    const c = pipCenter();
    const dx = cursor.x - c.x;
    const dy = cursor.y - c.y;
    if (Math.hypot(dx, dy) > LOOK_RANGE) return;

    const behind = (body.facing === 1 && dx < -20) || (body.facing === -1 && dx > 20);
    if (behind && Sprites.FRAMES.idle_look_back) currentFrame = 'idle_look_back';
    else if (dy < -40 && Sprites.FRAMES.idle_look_up) currentFrame = 'idle_look_up';
  }

  /* ---------------------------------------------------------------- *
   * Climbing
   * ---------------------------------------------------------------- */

  function updateClimbing(now, wb) {
    if (drag || body.held) {
      if (body.climbing) stopClimb();
      return;
    }

    if (body.climbing) {
      if (now >= climbUntil) {
        // Let go and drop.
        stopClimb();
        body.vy = 0;
        return;
      }
      if (body.y <= wb.top + 4) {
        // Reached the top - hang there for a moment.
        body.vy = 0;
        setClip('hang', now);
      } else {
        setClip('climb', now);
      }
      return;
    }

    // Bumped a wall while wandering: sometimes go up it.
    if (!body.grounded || walkDir === 0) return;
    const atLeft = body.x <= wb.left + 1 && walkDir < 0;
    const atRight = body.x >= wb.right - 1 && walkDir > 0;
    if (!atLeft && !atRight) return;
    if (Math.random() > CLIMB_CHANCE) return;

    body.climbing = atLeft ? 'left' : 'right';
    body.facing = atLeft ? -1 : 1;
    body.vy = -CLIMB_SPEED;
    climbUntil = now + HANG_MS + 2600;
    sendClimb(true);
  }

  function stopClimb() {
    if (!body.climbing) return;
    body.climbing = null;
    sendClimb(false);
  }

  function sendClimb(climbing) {
    if (climbing === lastClimbSent) return;
    lastClimbSent = climbing;
    notify('pip:climb', { climbing: climbing });
  }

  /* ---------------------------------------------------------------- *
   * Drawing
   * ---------------------------------------------------------------- */

  function drawPip() {
    const rect = spriteRect();
    const img = frameCache[currentFrame];
    if (!img) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // Carried, Pip hangs from the pointer and swings behind the direction of
    // travel, like anything held by its scruff would.
    if (sway !== 0) {
      const pivotX = rect.left + rect.width / 2;
      const pivotY = rect.top;
      ctx.translate(pivotX, pivotY);
      ctx.rotate(sway);
      ctx.translate(-pivotX, -pivotY);
    }
    if (body.facing === -1) {
      ctx.translate(rect.left + rect.width, rect.top);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
    } else {
      ctx.drawImage(img, rect.left, rect.top, rect.width, rect.height);
    }
    ctx.restore();
  }

  /** A thin ring above Pip's head while a Pomodoro is running. */
  function drawRing() {
    if (!pomodoro.running || !pomodoro.totalMs) return;
    const head = headPoint();
    const r = settings.scale * 5;
    const cx = head.x;
    const cy = head.y - r - settings.scale * 2;
    const done = 1 - Math.max(0, Math.min(1, pomodoro.remainingMs / pomodoro.totalMs));

    ctx.save();
    ctx.lineWidth = Math.max(2, settings.scale * 0.7);
    ctx.strokeStyle = 'rgba(42, 26, 45, 0.28)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = pomodoro.phase === 'work' ? '#e2415a' : '#68c445';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + done * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** A tiny battery over Pip when the machine is running low. */
  function drawBattery() {
    if (!battery || battery.charging || battery.level >= 0.2) return;
    const head = headPoint();
    const u = Math.max(2, Math.round(settings.scale * 0.9));
    const w = u * 6;
    const h = u * 3;
    const x = Math.round(head.x - w / 2);
    const y = Math.round(head.y - h - settings.scale * (pomodoro.running ? 14 : 3));

    ctx.save();
    ctx.fillStyle = '#2a1a2d';
    ctx.fillRect(x, y, w, h);
    ctx.fillRect(x + w, y + u, u, u);
    ctx.fillStyle = '#ffe3a8';
    ctx.fillRect(x + u * 0.5, y + u * 0.5, w - u, h - u);
    ctx.fillStyle = '#e2415a';
    ctx.fillRect(x + u * 0.5, y + u * 0.5, Math.max(u * 0.5, (w - u) * battery.level), h - u);
    ctx.restore();
  }

  function drawBubble() {
    if (!bubble) return;
    const rect = spriteRect();
    const layout = Bubbles.layout(bubble, rect, { width: bounds.width, height: bounds.height }, ctx);
    Bubbles.draw(ctx, bubble, layout);
  }

  function draw() {
    const rect = spriteRect();
    // Only repaint when something actually changed. The effects layer animates
    // while Pip stands perfectly still, so it has to be part of this key.
    const key = [
      currentFrame,
      Math.round(rect.left * 2), Math.round(rect.top * 2),
      Math.round(rect.width * 2), Math.round(rect.height * 2),
      body.facing, settings.flavor,
      Math.round(sway * 60),
      particleList.length,
      bubble ? Math.round((bubble.alpha || 1) * 20) + ':' + bubble.text.length : '-',
      pomodoro.running ? Math.round(pomodoro.remainingMs / 250) : '-',
      battery ? Math.round(battery.level * 50) + (battery.charging ? 'c' : '') : '-'
    ].join('|');
    if (key === lastDrawKey) return;
    lastDrawKey = key;

    ctx.clearRect(0, 0, bounds.width, bounds.height);
    drawPip();
    Particles.draw(ctx, particleList, settings.scale);
    drawRing();
    drawBattery();
    drawBubble();
  }

  /* ---------------------------------------------------------------- *
   * Main loop
   * ---------------------------------------------------------------- */

  function tick(now) {
    requestAnimationFrame(tick);

    if (hidden()) return;
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

      const v = Physics.throwVelocity(drag.samples, now);
      const target = Math.max(-MAX_SWAY, Math.min(MAX_SWAY, -v.vx / 1400));
      sway += (target - sway) * Math.min(1, dt * 9);
    } else if (sway !== 0) {
      // Settle back upright once he is put down.
      sway += (0 - sway) * Math.min(1, dt * 7);
      if (Math.abs(sway) < 0.004) sway = 0;
    }

    updateClimbing(now, wb);

    // "Call Pip" overrides the wander until he arrives.
    let dir = walkDir;
    if (gotoX !== null && body.grounded && !drag && !body.climbing) {
      const delta = gotoX - body.x;
      if (Math.abs(delta) < settings.scale * 4) {
        gotoX = null;
        dir = 0;
      } else {
        dir = delta > 0 ? 1 : -1;
      }
    }

    const opts = {};
    if (!drag && body.grounded && dir !== 0) {
      opts.walkSpeed = dir * (gotoX !== null ? Math.max(walkSpeed, 80) : walkSpeed);
    }
    const events = Physics.step(body, dt, wb, opts);
    if (events.respawned) notify('pip:error', { message: 'position was invalid, respawned' });
    if (events.landed) {
      // A gentle touchdown squashes and carries on; a real thump knocks Pip
      // flat and he has to pick himself up again.
      if (events.speed > 900) {
        setClip('getup', now);
        Particles.spawn(particleList, 'star', body.x, body.y - settings.scale * 18, 3);
      } else if (events.speed > 260) {
        setClip('land', now);
      }
      if (events.speed > 420) Particles.spawn(particleList, 'sparkle', body.x, body.y, 2);
      landedUntil = now + 500;
    }

    // Walking should look like walking even when the brain says idle, but a
    // landing gets to play out first.
    if (!body.climbing && !drag && now >= landedUntil) {
      if (!body.grounded && body.vy > 120) setClip('fall', now);
      else if (dir !== 0 && body.grounded && pipState === 'idle') {
        // Anything brisker than a stroll reads as a run.
        setClip(Math.abs(body.vx) > RUN_SPEED ? 'run' : 'walk', now);
      }
    }

    advanceAnimation(now);
    updateParticles(dt);
    bubble = bubble ? Bubbles.update(bubble, Date.now()) : null;
    updatePetting(now);
    updateHover();
    draw();

    if (!ready) {
      ready = true;
      notify('pip:ready', {});
    }
  }

  function hidden() {
    return document.visibilityState === 'hidden';
  }

  function updateParticles(dt) {
    if (!particleList.length) return;
    particleList = Particles.update(particleList, dt);
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
    if (!over) { hoverSince = 0; petSent = false; }
    setInteractive(over);
  }

  /** Resting the cursor on Pip for a second counts as a pet. */
  function updatePetting(now) {
    if (drag || !overPip) return;
    if (!hoverSince) { hoverSince = now; return; }
    if (petSent) return;
    if (now - hoverSince >= PET_MS) {
      petSent = true;
      notify('pip:pet', {});
      Particles.spawn(particleList, 'heart', body.x, body.y - settings.scale * 8, 3);
    }
  }

  function setInteractive(want) {
    if (want === interactive) return;
    interactive = want;
    notify('pip:set-interactive', { interactive: want });
  }

  function notify(channel, payload) {
    try { bridge.send(channel, payload); } catch (err) { /* main is gone */ }
  }

  function trackCursor(x, y, t) {
    const dt = (t - cursor.t) / 1000;
    if (dt > 0 && dt < 0.5) {
      cursor.vx = (x - cursor.x) / dt;
      cursor.vy = (y - cursor.y) / dt;
    }
    cursor.x = x;
    cursor.y = y;
    cursor.t = t;
    cursor.inside = true;

    // Fast, jerky movement close by makes Pip jump.
    const speed = Math.hypot(cursor.vx, cursor.vy);
    if (speed > STARTLE_SPEED && t - lastStartleAt > STARTLE_COOLDOWN) {
      const c = pipCenter();
      if (Math.hypot(x - c.x, y - c.y) < STARTLE_RANGE) {
        lastStartleAt = t;
        notify('pip:startle', {});
        Particles.spawn(particleList, 'sweat', body.x, body.y - settings.scale * 6, 2,
          { dir: -body.facing });
      }
    }
  }

  window.addEventListener('mousemove', (e) => {
    trackCursor(e.clientX, e.clientY, performance.now());
    if (drag && (Math.abs(e.clientX - drag.startX) > 3 || Math.abs(e.clientY - drag.startY) > 3)) {
      drag.moved = true;
    }
  });

  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (!hitTest(e.clientX, e.clientY)) return;
    e.preventDefault();
    stopClimb();
    drag = {
      dx: body.x - e.clientX,
      dy: body.y - e.clientY,
      samples: [{ x: body.x, y: body.y, t: performance.now() }],
      moved: false,
      startX: e.clientX,
      startY: e.clientY
    };
    body.held = true;
    gotoX = null;
    notify('pip:grabbed', {});
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
    hoverSince = 0;
    petSent = false;

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
    pipState = s.state || 'idle';
    if (s.clip) setClip(s.clip, now);
    if (typeof s.walkDir === 'number') walkDir = s.walkDir;
    if (typeof s.walkSpeed === 'number') walkSpeed = s.walkSpeed;
    sleeping = s.state === 'sleeping';
    if (sleeping && !particleList.some((p) => p.kind === 'zzz')) {
      Particles.spawn(particleList, 'zzz', body.x, body.y - settings.scale * 10, 3);
    }
  });

  bridge.on('pip:cursor', (c) => {
    // Main polls the real cursor, which keeps Pip aware of it even while the
    // overlay is click-through and receiving no DOM events.
    if (!drag) trackCursor(c.x, c.y, performance.now());
    cursor.inside = c.inside;
  });

  bridge.on('pip:say', (payload) => {
    if (!payload || !payload.text) return;
    bubble = Bubbles.create(payload.text, Date.now(), payload.ms);
  });

  bridge.on('pip:particles', (payload) => {
    if (!payload || !payload.kind) return;
    const head = payload.kind === 'zzz' || payload.kind === 'star';
    const y = body.y - settings.scale * (head ? 26 : 14);
    Particles.spawn(particleList, payload.kind, body.x, y, payload.count || 3,
      { dir: -body.facing });
    lastDrawKey = '';
  });

  bridge.on('pip:pomodoro', (p) => {
    pomodoro = Object.assign({}, pomodoro, p);
  });

  bridge.on('pip:goto', (p) => {
    if (!p || typeof p.x !== 'number') return;
    gotoX = p.x;
  });

  bridge.on('pip:reset', () => {
    Physics.respawn(body, worldBounds());
    drag = null;
    body.held = false;
    gotoX = null;
    stopClimb();
    lastDrawKey = '';
  });

  /* ---------------------------------------------------------------- *
   * Battery
   * ---------------------------------------------------------------- */

  if (navigator.getBattery) {
    navigator.getBattery().then((b) => {
      const read = () => {
        battery = { level: b.level, charging: b.charging };
        lastDrawKey = '';
        // Main owns the speech, so it needs to know when things get dire.
        notify('pip:battery', { level: b.level, charging: b.charging });
      };
      read();
      b.addEventListener('levelchange', read);
      b.addEventListener('chargingchange', read);
    }).catch(() => { /* no battery API here, skip it quietly */ });
  }

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
              // Actually paint it, so a broken palette key or a bad draw throws here.
              currentFrame = res.frame;
              lastDrawKey = '';
              drawPip();
              t += c.durations[i];
            }
          }
          // Exercise the effects layer too.
          for (const kind of Particles.KINDS) {
            Particles.spawn(particleList, kind, body.x, body.y, 3);
          }
          particleList = Particles.update(particleList, 0.05);
          Particles.draw(ctx, particleList, settings.scale);
          particleList = [];

          const b = Bubbles.create('Smoke test, ' + flavor + '!', Date.now());
          const layout = Bubbles.layout(b, spriteRect(),
            { width: bounds.width, height: bounds.height }, ctx);
          Bubbles.draw(ctx, b, layout);
        } catch (err) {
          errors.push(flavor + ': ' + (err && err.message));
        }
      }
      settings.flavor = 'cherry';
      prerender();
      currentFrame = Sprites.FRAME_NAMES[0];
      lastDrawKey = '';
      return errors;
    },
    state: () => ({ clip: clip, frame: currentFrame, x: body.x, y: body.y, flavor: settings.flavor })
  };
})();
