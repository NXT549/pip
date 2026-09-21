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
  /** Below this he is not travelling, so the walk cycle must not be drawn. */
  const MIN_WALK_VX = 2;           // DIP/s

  /** How far Pip swings behind the pointer while being carried, in radians. */
  const MAX_SWAY = 0.38;

  const CLIMB_SPEED = 130;         // DIP/s up a wall
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
  /**
   * What main last told us to play, and what we are playing instead.
   *
   * Main only sends pip:state when its own decision changes, so anything the
   * renderer substitutes locally (falling, landing, walking) has to be undone
   * here - otherwise a thirsty Pip who gets dropped stands in the plain idle
   * pose forever, because main has no idea the clip was ever replaced.
   */
  let commandedClip = 'idle';
  let localClip = null;

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

  let particleList = [];
  let bubble = null;
  let pomodoro = { running: false, phase: 'off', remainingMs: 0, totalMs: 0 };
  let battery = null;              // {level, charging} once known

  let climbUntil = 0;
  let climbTargetY = 0;
  let hangUntil = 0;
  let lastClimbSent = false;
  let landedUntil = 0;
  let sway = 0;                    // dangle angle, eased toward drag speed

  /**
   * Trotting-on-the-spot detector.
   *
   * The walk cycle playing while Pip does not actually move is a real bug
   * that has now been reported twice, and it is invisible to every test we
   * have. So Pip watches for it himself and reports his whole state when it
   * happens - once per episode, so it cannot spam the log.
   */
  let stuckCheckAt = 0;
  let stuckLastX = 0;
  let stuckFor = 0;
  let stuckReported = false;

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

  /** Play `name` instead of whatever main asked for, remembering to go back. */
  function setLocalClip(name, now) {
    if (!Animations.CLIPS[name]) return;
    localClip = name;
    setClip(name, now);
  }

  /** Hand control back to main's decision. */
  function clearLocalClip(now) {
    if (!localClip) return;
    localClip = null;
    setClip(commandedClip, now === undefined ? performance.now() : now);
  }

  function advanceAnimation(now) {
    const res = Animations.frameAt(clip, now - clipStart);
    if (res.frame) currentFrame = res.frame;
    if (res.done) {
      if (localClip && clip === localClip) {
        // A landing or a get-up has played out; go back to what Pip was doing.
        clearLocalClip(now);
      } else {
        const next = Animations.CLIPS[clip] && Animations.CLIPS[clip].next;
        if (next) setClip(next, now);
      }
    }
    applyLook();
    applyStandStill(now);
    applyNightcap();
  }

  /**
   * Never draw the walk cycle on the spot.
   *
   * The walk clip reaches the screen two ways: the renderer's own override,
   * and main simply commanding 'walk' while it wanders. Guarding only the
   * first is how the moonwalk survived three fixes - main keeps asking for a
   * walk while a wall has stopped Pip dead. So the decision is made here, at
   * the frame, where it holds whichever path chose the clip: if Pip is on the
   * ground and not actually travelling, he is shown standing and breathing.
   */
  function applyStandStill(now) {
    if (clip !== 'walk' && clip !== 'run') return;
    if (!body.grounded || drag || body.climbing) return;
    if (Math.abs(body.vx) > MIN_WALK_VX) return;
    const idle = Animations.frameAt('idle', now - clipStart);
    if (idle.frame) currentFrame = idle.frame;
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

  /**
   * Climb, hang, drop.
   *
   * Pip picks a target height when he starts up the wall rather than always
   * making for the very top - a full-height climb on a 1080p screen takes
   * twenty seconds and he would let go long before the hang ever began.
   */
  function updateClimbing(now, wb) {
    if (drag || body.held) {
      if (body.climbing) stopClimb(now);
      return;
    }

    if (body.climbing) {
      if (body.y <= climbTargetY) {
        // Made it. Hang here for a bit, then let go.
        body.vy = 0;
        setLocalClip('hang', now);
        if (!hangUntil) hangUntil = now + HANG_MS;
        if (now >= hangUntil) {
          stopClimb(now);
          body.vy = 0;
        }
      } else if (now >= climbUntil) {
        // Gave up part way; drop from here.
        stopClimb(now);
        body.vy = 0;
      } else {
        setLocalClip('climb', now);
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
    // Somewhere in the upper half of the screen, never above the ceiling.
    const span = wb.bottom - wb.top;
    climbTargetY = Math.max(wb.top + 4, wb.bottom - span * (0.45 + Math.random() * 0.45));
    // A generous ceiling on the attempt, in case something blocks progress.
    climbUntil = now + 20000;
    hangUntil = 0;
    sendClimb(true);
  }

  function stopClimb(now) {
    hangUntil = 0;
    if (localClip === 'climb' || localClip === 'hang') clearLocalClip(now);
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
      // particle positions change every tick, so the count alone is not
      // enough - repaint while anything is in flight
      particleList.length ? 'fx' + Math.round(lastTick) : '-',
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
    // Hidden: do nothing and do not re-arm. visibilitychange wakes us.
    if (hidden()) return;
    const dt = Math.min(0.1, Math.max(0, (now - lastTick) / 1000));
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

    // "Call Pip" overrides the wander until he arrives. resolveWalk also
    // refuses to walk into a wall, and abandons a target that cannot be
    // reached - both of which used to leave Pip trotting on the spot.
    let dir = walkDir;
    if (body.grounded && !drag && !body.climbing) {
      const walk = Physics.resolveWalk(body, walkDir, gotoX, wb, settings.scale * 4);
      dir = walk.dir;
      gotoX = walk.gotoX;
    }

    const opts = {};
    if (!drag && body.grounded && dir !== 0) {
      opts.walkSpeed = dir * (gotoX !== null ? Math.max(walkSpeed, 80) : walkSpeed);
    }
    const events = Physics.step(body, dt, wb, opts);
    if (events.respawned) notify('pip:error', { message: 'position was invalid, respawned' });
    // physics.js can end a climb by itself (reaching the floor), so re-sync
    // rather than leaving main convinced Pip is still on the wall.
    if (!body.climbing && lastClimbSent) sendClimb(false);
    if (events.landed) {
      // A gentle touchdown squashes and carries on; a real thump knocks Pip
      // flat and he has to pick himself up again.
      if (events.speed > 900) {
        setLocalClip('getup', now);
        Particles.spawn(particleList, 'star', body.x, body.y - settings.scale * 18, 3);
      } else if (events.speed > 260) {
        setLocalClip('land', now);
      }
      if (events.speed > 420) Particles.spawn(particleList, 'sparkle', body.x, body.y, 2);
      landedUntil = now + 500;
    }

    // Walking should look like walking even when the brain says idle, but a
    // landing gets to play out first. Everything here is a local override:
    // it is handed back to main's clip the moment it stops applying.
    if (drag) {
      // Carried: main owns the pose (dangle). A stale walk/fall override
      // would otherwise outlive the grab and block it.
      clearLocalClip(now);
    } else if (!body.climbing && now >= landedUntil) {
      if (!body.grounded && body.vy > 120) {
        setLocalClip('fall', now);
      } else if (dir !== 0 && body.grounded && pipState === 'idle'
                 && Math.abs(body.vx) > MIN_WALK_VX) {
        // Anything brisker than a stroll reads as a run. The speed check is
        // what stops the moonwalk: Physics.clamp zeroes vx when Pip is pressed
        // against a wall, so a walk cycle with no travel cannot be drawn at
        // all - whatever pinned the direction in the first place.
        setLocalClip(Math.abs(body.vx) > RUN_SPEED ? 'run' : 'walk', now);
      } else if (localClip && (localClip === 'walk' || localClip === 'run' || localClip === 'fall')
                 && body.grounded && (dir === 0 || Math.abs(body.vx) <= MIN_WALK_VX)) {
        // Stopped - or being held in place by a wall - and the looping
        // override would otherwise run forever.
        clearLocalClip(now);
      }
    }

    checkStuck(now, dir, wb);

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

    scheduleTick(nextDelay(now, dir));
  }

  function hidden() {
    return document.visibilityState === 'hidden';
  }


  /* ---------------------------------------------------------------- *
   * Scheduling
   *
   * The loop used to call requestAnimationFrame unconditionally at the top of
   * every tick, so even a tick that immediately bailed out re-armed itself at
   * the display's refresh rate. That kept Chromium's compositor and the GPU
   * process running flat out forever: about 15% of a core measured with Pip
   * standing perfectly still, and it never stopped while hidden either.
   *
   * Now each tick works out when the picture can next change and sleeps
   * until then. Moving Pip still gets 30fps; a Pip who is only breathing
   * wakes exactly when his next animation frame is due.
   * ---------------------------------------------------------------- */

  const ACTIVE_MS = 1000 / TARGET_FPS;
  const SLEEP_MS = 1000 / SLEEP_FPS;
  /** Upper bound on an idle sleep, so the watchdog and timers stay fresh. */
  const MAX_IDLE_MS = 1000;

  let wakeTimer = null;
  let wakeAt = Infinity;

  function runFrame() {
    wakeTimer = null;
    wakeAt = Infinity;
    requestAnimationFrame(tick);
  }

  /** Run a tick in `delay` ms - unless one is already due sooner. */
  function scheduleTick(delay) {
    if (hidden()) return;
    const d = Math.max(0, delay);
    const at = performance.now() + d;
    if (wakeTimer !== null && at >= wakeAt) return;
    if (wakeTimer !== null) clearTimeout(wakeTimer);
    wakeAt = at;
    wakeTimer = setTimeout(runFrame, d);
  }

  /**
   * Something the picture depends on just changed. Tick promptly, but never
   * faster than 30fps: mousemove alone can fire hundreds of times a second.
   */
  function wake() {
    scheduleTick(ACTIVE_MS - (performance.now() - lastTick));
  }

  /** How long until the current clip shows a different frame. */
  function msToNextFrame(now) {
    const c = Animations.CLIPS[clip];
    if (!c) return 250;
    const total = Animations.clipDuration(clip);
    let t = now - clipStart;
    if (c.loop && total > 0) t = t % total;
    let acc = 0;
    for (let i = 0; i < c.durations.length; i++) {
      acc += c.durations[i];
      if (t < acc) return acc - t;
    }
    // A finished one-shot clip is about to hand over to its `next`.
    return ACTIVE_MS;
  }

  function nextDelay(now, dir) {
    if (sleeping) return SLEEP_MS;
    const active =
      drag || overPip || body.climbing || !body.grounded ||
      dir !== 0 || Math.abs(body.vx) > 0.5 || gotoX !== null ||
      localClip !== null || particleList.length > 0 || bubble !== null ||
      sway !== 0 || Math.abs(body.squash - 1) > 0.01;
    if (active) return ACTIVE_MS;
    return Math.min(MAX_IDLE_MS, Math.max(ACTIVE_MS, msToNextFrame(now)));
  }

  /** Is the pointer close enough that its position changes what we draw? */
  function cursorMatters() {
    if (overPip || drag) return true;
    const c = pipCenter();
    return Math.hypot(cursor.x - c.x, cursor.y - c.y) < LOOK_RANGE + 60;
  }

  document.addEventListener('visibilitychange', () => {
    if (!hidden()) wake();
  });

  function updateParticles(dt) {
    if (!particleList.length) return;
    particleList = Particles.update(particleList, dt);
  }

  /** Report, once, if the walk cycle is running but Pip is going nowhere. */
  function checkStuck(now, dir, wb) {
    if (now - stuckCheckAt < 1000) return;
    stuckCheckAt = now;

    // Judge what is on screen, not the clip name: applyStandStill already
    // swaps a stationary walk for a standing frame, so only a walk frame that
    // is genuinely being drawn without travel is the bug.
    const walking = /^(walk|run)_/.test(currentFrame);
    const moved = Math.abs(body.x - stuckLastX);
    stuckLastX = body.x;

    if (!walking || moved > 2) {
      stuckFor = 0;
      stuckReported = false;
      return;
    }

    stuckFor += 1;
    if (stuckFor < 3) return;

    // Recover first, report second. Whatever pinned him, an unreachable goto
    // and a stale override are the two things the renderer can let go of, and
    // a nudge off the wall breaks the geometry case.
    gotoX = null;
    clearLocalClip(now);
    if (body.x <= wb.left + 1) body.x = Math.min(wb.right, wb.left + 4);
    else if (body.x >= wb.right - 1) body.x = Math.max(wb.left, wb.right - 4);
    body.vx = 0;
    stuckFor = 0;

    if (stuckReported) return;
    stuckReported = true;
    notify('pip:error', {
      message: 'STUCK: walk cycle running but not moving',
      stack: JSON.stringify({
        bodyX: Math.round(body.x), bodyY: Math.round(body.y),
        vx: Math.round(body.vx), vy: Math.round(body.vy),
        grounded: body.grounded, climbing: body.climbing, held: body.held,
        wbLeft: Math.round(wb.left), wbRight: Math.round(wb.right),
        wbBottom: Math.round(wb.bottom),
        boundsW: Math.round(bounds.width), boundsH: Math.round(bounds.height),
        scale: settings.scale, dpr: dpr,
        walkDir: walkDir, walkSpeed: Math.round(walkSpeed), dir: dir,
        gotoX: gotoX === null ? null : Math.round(gotoX),
        clip: clip, commandedClip: commandedClip, localClip: localClip,
        pipState: pipState, drag: !!drag
      })
    });
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
    // Hover decides whether the window is solid under the pointer, so it runs
    // on input rather than waiting for the next (possibly distant) idle tick.
    updateHover();
    if (cursorMatters()) wake();
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
    wake();
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
      handleClick(e.clientX, e.clientY);
    }
    updateHover();
    wake();
  });

  /**
   * Report every physical click and let main decide what the pattern was.
   *
   * The renderer used to coalesce these itself, which meant five fast clicks
   * arrived as four "double" messages and the rapid-click reaction could never
   * fire. src/main/clicks.js owns that judgement now - it is pure and tested.
   */
  function handleClick(x, y) {
    notify('pip:click', { x: x, y: y });
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
    wake();
  });

  bridge.on('pip:bounds', (b) => {
    bounds = Object.assign({}, bounds, b);
    const before = dpr;
    resizeCanvas();
    // Frames bake scale * devicePixelRatio, so moving to a 200% monitor (or
    // changing scaling live) means the cache has to be rebuilt.
    if (dpr !== before) prerender();
    Physics.clamp(body, worldBounds());
    wake();
  });

  bridge.on('pip:state', (s) => {
    const now = performance.now();
    pipState = s.state || 'idle';
    if (s.clip) {
      commandedClip = s.clip;
      // A local override owns the clip until it finishes.
      if (!localClip) setClip(commandedClip, now);
    }
    if (typeof s.walkDir === 'number') walkDir = s.walkDir;
    if (typeof s.walkSpeed === 'number') walkSpeed = s.walkSpeed;
    sleeping = s.state === 'sleeping';
    if (sleeping && !particleList.some((p) => p.kind === 'zzz')) {
      Particles.spawn(particleList, 'zzz', body.x, body.y - settings.scale * 10, 3);
    }
    wake();
  });

  bridge.on('pip:cursor', (c) => {
    // Main polls the real cursor, which keeps Pip aware of it even while the
    // overlay is click-through and receiving no DOM events.
    if (!drag) trackCursor(c.x, c.y, performance.now());
    cursor.inside = c.inside;
    // A pointer across the screen changes nothing we draw, so it must not
    // keep the loop awake at 20Hz while you work elsewhere.
    if (cursorMatters()) {
      updateHover();
      wake();
    }
  });

  bridge.on('pip:say', (payload) => {
    if (!payload || !payload.text) return;
    bubble = Bubbles.create(payload.text, Date.now(), payload.ms);
    wake();
  });

  bridge.on('pip:particles', (payload) => {
    if (!payload || !payload.kind) return;
    const head = payload.kind === 'zzz' || payload.kind === 'star';
    const y = body.y - settings.scale * (head ? 26 : 14);
    Particles.spawn(particleList, payload.kind, body.x, y, payload.count || 3,
      { dir: -body.facing });
    lastDrawKey = '';
    wake();
  });

  bridge.on('pip:pomodoro', (p) => {
    const wasRunning = pomodoro.running;
    pomodoro = Object.assign({}, pomodoro, p);
    // The ring only needs repainting while there is a ring to paint.
    if (pomodoro.running || wasRunning) wake();
  });

  bridge.on('pip:goto', (p) => {
    if (!p) return;
    // x:null means "stop chasing" - Pip gives up and goes back to pottering.
    gotoX = typeof p.x === 'number' ? p.x : null;
    wake();
  });

  bridge.on('pip:reset', () => {
    Physics.respawn(body, worldBounds());
    drag = null;
    body.held = false;
    gotoX = null;
    stopClimb();
    lastDrawKey = '';
    wake();
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
        wake();
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
  wake();

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

          // Exercise the real composite path too, with and without effects,
          // so a reference error in draw() cannot slip past the smoke test.
          bubble = b;
          Particles.spawn(particleList, 'heart', body.x, body.y, 2);
          lastDrawKey = '';
          draw();
          particleList = [];
          bubble = null;
          lastDrawKey = '';
          draw();
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
