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
  const Compose = P.Compose;
  const Pips = P.Pips;
  const Effects = P.Effects;

  const SIZE = Sprites.FRAME_SIZE;
  /** Sprite row the feet rest on, plus one, so we can sit Pip on the floor. */
  const FOOT_OFFSET = Sprites.FOOT_ROW;
  /** The art was 32px wide once; offsets below are in those units. */
  const OLD_SIZE = 32;
  const TARGET_FPS = 30;
  const SLEEP_FPS = 5;

  /** Petting: the cursor has to rest on Pip for about this long. */
  const PET_MS = 1000;
  /** Startle: this fast, this close. */
  const STARTLE_SPEED = 1400;      // DIP/s
  const STARTLE_RANGE = 130;       // DIP
  const STARTLE_COOLDOWN = 6000;
  /** Eyes follow the pointer inside this radius. */
  const LOOK_RANGE = 700;
  /** ...and turn once it is this far off-centre, with a little hysteresis. */
  const LOOK_X = 26;
  const LOOK_Y = 34;

  /** A blink every few seconds; now and then a double. */
  const BLINK_MIN_MS = 2400;
  const BLINK_MAX_MS = 6200;
  const BLINK_MS = 110;

  /** Composed frames kept ready to draw. Each is a 64x64 canvas (16 KB). */
  const CACHE_MAX = 320;

  /** Above this ground speed Pip is running, not trotting. */
  const RUN_SPEED = 70;            // DIP/s
  /** Below this he is not travelling, so the walk cycle must not be drawn. */
  const MIN_WALK_VX = 2;           // DIP/s

  /** How far Pip swings behind the pointer while being carried, in radians. */
  const MAX_SWAY = 0.38;

  /** Gestures. The renderer notices; main decides what Pip does about it. */
  const TICKLE_REVERSALS = 4;      // back-and-forth wiggles over Pip...
  const TICKLE_WINDOW = 1000;      // ...within this long
  const TICKLE_COOLDOWN = 3000;
  const PET_MAX_SPEED = 260;       // a pet is a resting hand, not a swipe
  const SHAKE_REVERSALS = 4;       // shaken this many times while carried
  const SHAKE_WINDOW = 1500;
  const SHAKE_MIN_SPEED = 380;
  const POUNCE_WATCH_S = 0.7;      // a slow pointer in front for this long...
  const POUNCE_COOLDOWN = 20000;
  const CIRCLE_TURNS = 1.5;        // the pointer going round him this many times
  const CIRCLE_WINDOW = 3500;
  const BONK_SPEED = 450;          // thrown into a wall at least this hard

  const CLIMB_SPEED = 130;         // DIP/s up a wall
  const CLIMB_CHANCE = 0.25;       // on bumping a wall while wandering
  const HANG_MS = 2600;

  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d', { alpha: true });

  /* ---------------------------------------------------------------- *
   * State
   * ---------------------------------------------------------------- */

  let settings = { flavor: 'cherry', scale: 2, activityLevel: 'normal', quiet: false, effects: 'full' };
  let bounds = { left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100 };
  let dpr = window.devicePixelRatio || 1;

  /**
   * key -> {canvas, rows}. Frames are composed on demand - the type's
   * pattern and trait, the eyes where they are looking, a blink - at the
   * art's own 64x64 and scaled up when drawn. That is far less memory than
   * pre-rendering every frame at screen size, and a type change costs
   * nothing until a frame is actually shown.
   */
  let frameCache = new Map();
  let palette = null;
  let pipType = null;
  /** The current Pip's special effect (effects.js), or null. */
  let fx = null;

  let look = { dx: 0, dy: 0 };
  let blinkAt = 0;
  let blinkUntil = 0;
  let blinkAgain = false;

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

  // gesture tracking
  let tickleDir = 0;
  let tickleTimes = [];
  let lastTickleAt = 0;
  let shakeSign = 0;
  let shakeTimes = [];
  let shakeSent = false;
  let pounceWatch = 0;
  let lastPounceAt = 0;
  let orbitAngle = null;
  let orbitTotal = 0;
  let orbitSince = 0;
  let lastCircleAt = 0;
  /** A move main asked for: {kind:'pounce', x, at} - launched when due. */
  let action = null;
  let actionUntil = 0;
  let gotoSpeed = 80;

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
  /** Which clip frame last fired its particle cues, so each fires once. */
  let cueKey = '';
  /** Until when the front-facing turn beat shows, after a change of direction. */
  let turnUntil = 0;
  let lastFacing = 1;
  let lastTick = 0;
  let sleeping = false;
  let ready = false;

  /* ---------------------------------------------------------------- *
   * Pre-rendering
   * ---------------------------------------------------------------- */

  /** Forget every composed frame - the Pip type changed. */
  function prerender() {
    pipType = Pips.get(settings.flavor);
    palette = Palettes.resolve(pipType.palette);
    frameCache = new Map();
    fx = pipType.effect ? Effects.create(pipType.effect, settings.effects || 'full') : null;
    lastDrawKey = '';
  }

  /** Do this frame's eyes follow the pointer and blink at all? */
  function hasLiveEyes(name) {
    const meta = Sprites.FRAME_META[name];
    return !!(meta && meta.eyes && meta.eyes.length);
  }

  /**
   * The composed frame for `name` with the current look and blink, built on
   * first use. Returns {canvas, rows}; rows are what hit testing reads, so a
   * stem or a crown is as clickable as the rest of Pip.
   */
  function getFrame(name) {
    const live = hasLiveEyes(name);
    const lx = live ? look.dx : 0;
    const ly = live ? look.dy : 0;
    const bl = live && isBlinking();
    const key = name + '|' + lx + '|' + ly + '|' + (bl ? 1 : 0);
    let entry = frameCache.get(key);
    if (entry) {
      // refresh its place in the LRU order
      frameCache.delete(key);
      frameCache.set(key, entry);
      return entry;
    }
    const rows = Compose.compose(name, { type: pipType, look: { dx: lx, dy: ly }, blink: bl });
    if (!rows) return null;
    const c = document.createElement('canvas');
    c.width = SIZE;
    c.height = SIZE;
    const g = c.getContext('2d');
    const img = g.createImageData(SIZE, SIZE);
    img.data.set(Compose.toRGBA(rows, palette));
    g.putImageData(img, 0, 0);
    entry = { canvas: c, rows: rows };
    frameCache.set(key, entry);
    if (frameCache.size > CACHE_MAX) frameCache.delete(frameCache.keys().next().value);
    return entry;
  }

  /** DIPs per pixel of the old 32px art: the unit every offset below uses. */
  function unit() {
    return settings.scale * SIZE / OLD_SIZE;
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
    const entry = getFrame(currentFrame);
    const rows = entry ? entry.rows : Sprites.FRAMES[currentFrame];
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
    fireCues(clip, res.index, now);
    if (res.done) {
      if (localClip && clip === localClip) {
        // A landing or a get-up has played out; go back to what Pip was doing.
        clearLocalClip(now);
      } else {
        const next = Animations.CLIPS[clip] && Animations.CLIPS[clip].next;
        if (next) setClip(next, now);
      }
    }
    applyStandStill(now);
    applyTurn(now);
    applyNightcap();
    updateBlink(now);
    updateLook();
  }

  /**
   * Particle cues written into a clip (animations.js `fx`): the sneeze spray,
   * the stomp's steam, the notes of a whistle. Each fires once, as its frame
   * starts, placed on the sprite and mirrored when Pip faces left.
   */
  function fireCues(name, index, now) {
    if (index === undefined) return;
    const key = name + ':' + Math.round(clipStart) + ':' + index;
    if (key === cueKey) return;
    cueKey = key;
    const cues = Animations.cuesAt(name, index);
    if (!cues.length) return;
    const rect = spriteRect();
    for (const cue of cues) {
      const fx = body.facing === -1 ? 1 - cue[3] : cue[3];
      Particles.spawn(particleList, cue[1], rect.left + fx * rect.width, rect.top + cue[4] * rect.height, cue[2],
        { dir: body.facing });
    }
  }

  /**
   * A change of direction on the ground shows one beat of Pip facing you,
   * rather than snapping from one profile to the other.
   */
  function applyTurn(now) {
    if (now >= turnUntil) return;
    if (drag || body.climbing || !body.grounded) return;
    if (!/^(idle|walk|run)_/.test(currentFrame)) return;
    const turn = Animations.frameAt('turn', now - (turnUntil - Animations.clipDuration('turn')));
    if (turn.frame) currentFrame = turn.frame;
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

  /** Where Pip's eyes are on screen right now, or his head if unknown. */
  function eyePoint() {
    const rect = spriteRect();
    const meta = Sprites.FRAME_META[currentFrame];
    if (!meta || !meta.eyes || !meta.eyes.length) return headPoint();
    let r = 0, c = 0;
    for (const e of meta.eyes) { r += e.r + 3.5; c += e.c + 2.5; }
    r /= meta.eyes.length;
    c /= meta.eyes.length;
    if (body.facing === -1) c = SIZE - c;
    return { x: rect.left + (c / SIZE) * rect.width, y: rect.top + (r / SIZE) * rect.height };
  }

  /**
   * Eye tracking. Any pose with open eyes has its eyes redrawn one pixel
   * toward the pointer (compose.js), so Pip watches you whatever he is doing
   * - trotting, carrying his cup, dangling from your hand.
   */
  function updateLook() {
    let want = { dx: 0, dy: 0 };
    if (cursor.inside && hasLiveEyes(currentFrame)) {
      const e = eyePoint();
      let dx = cursor.x - e.x;
      const dy = cursor.y - e.y;
      if (Math.hypot(dx, dy) <= LOOK_RANGE) {
        dx *= body.facing;   // in the sprite's own, right-facing, terms
        const axis = (d, cur, lim) => (Math.abs(d) > lim ? Math.sign(d) : Math.abs(d) < lim * 0.6 ? 0 : cur);
        want = { dx: axis(dx, look.dx, LOOK_X), dy: axis(dy, look.dy, LOOK_Y) };
      }
    }
    look = want;
  }

  function isBlinking() {
    return lastTick < blinkUntil;
  }

  /** Blinks run on their own timer, in every pose that has open eyes. */
  function updateBlink(now) {
    if (!blinkAt) blinkAt = now + BLINK_MIN_MS + Math.random() * (BLINK_MAX_MS - BLINK_MIN_MS);
    if (now < blinkAt) return;
    blinkUntil = now + BLINK_MS;
    if (!blinkAgain && Math.random() < 0.2) {
      blinkAgain = true;
      blinkAt = now + BLINK_MS + 130;
    } else {
      blinkAgain = false;
      blinkAt = now + BLINK_MIN_MS + Math.random() * (BLINK_MAX_MS - BLINK_MIN_MS);
    }
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

  /**
   * Draw any 64x64 canvas exactly where and how Pip is drawn: flipped to
   * face left, swinging while carried, lifted by a hovering effect. Pip
   * himself and every silhouette effect (a glow, a shine) go through here,
   * so they can never drift apart.
   */
  function drawSprite(img, alpha, filter, blend) {
    const rect = fxRect();
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
    if (filter) ctx.filter = filter;
    if (blend) ctx.globalCompositeOperation = blend;
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

  function fxOn() {
    return !!fx && settings.effects !== 'off';
  }

  /** The sprite rect, moved by a hovering or glitching effect. */
  function fxRect() {
    const rect = spriteRect();
    if (!fxOn()) return rect;
    return {
      left: rect.left + fx.offsetX(lastTick),
      top: rect.top + fx.offsetY(lastTick, settings.scale),
      width: rect.width,
      height: rect.height
    };
  }

  /** What an effect needs to know about Pip this frame. */
  function fxInfo(entry) {
    const rect = fxRect();
    return {
      rect: rect,
      entry: entry,
      meta: Sprites.FRAME_META[currentFrame],
      facing: body.facing,
      moving: Math.abs(body.vx) > 20 || !body.grounded,
      px: settings.scale,
      toScreen: (r, c) => ({
        x: rect.left + ((body.facing === -1 ? SIZE - c : c) / SIZE) * rect.width,
        y: rect.top + (r / SIZE) * rect.height
      }),
      drawSprite: drawSprite
    };
  }

  function fxSpawn(kind, x, y, count, opts) {
    Particles.spawn(particleList, kind, x, y, count, opts);
  }

  function drawPip() {
    const entry = getFrame(currentFrame);
    if (!entry) return;
    if (!fxOn()) { drawSprite(entry.canvas); return; }
    const info = fxInfo(entry);
    fx.drawBehind(ctx, lastTick, info);
    drawSprite(entry.canvas, fx.alpha(lastTick), fx.filter(lastTick));
    fx.drawFront(ctx, lastTick, info);
  }

  /** Let the current effect emit, at most at its own leisurely rate. */
  function updateEffects(dt) {
    if (!fxOn() || drag && fx.name !== 'ghost') return;
    const entry = getFrame(currentFrame);
    if (entry) fx.update(dt, lastTick, fxInfo(entry), fxSpawn);
  }

  /**
   * A soft pixel shadow on the floor under Pip. It shrinks and fades as he
   * leaves the ground, which is most of what makes a jump read as a jump.
   */
  function drawShadow() {
    if (drag || body.climbing) return;
    const floor = worldBounds().bottom;
    const lift = Math.max(0, floor - body.y);
    const fade = Math.max(0, 1 - lift / (SIZE * settings.scale * 1.6));
    if (fade <= 0.05) return;
    const px = settings.scale;
    const half = Math.round(15 * fade + 5);
    const cx = body.x;
    const y = Math.round(floor - px * 0.5);
    ctx.save();
    ctx.fillStyle = 'rgba(30, 18, 34, ' + (0.2 * fade).toFixed(3) + ')';
    // three stacked rows of pixels make a flattened oval
    const rows = [[half - 3, -1], [half, 0], [half - 3, 1]];
    for (const [w, dy] of rows) {
      if (w <= 0) continue;
      ctx.fillRect(Math.round(cx - w * px), y + dy * px, Math.round(w * 2 * px), px);
    }
    ctx.restore();
  }

  /** A thin ring above Pip's head while a Pomodoro is running. */
  function drawRing() {
    if (!pomodoro.running || !pomodoro.totalMs) return;
    const head = headPoint();
    const u = unit();
    const r = u * 5;
    const cx = head.x;
    const cy = head.y - r - u * 2;
    const done = 1 - Math.max(0, Math.min(1, pomodoro.remainingMs / pomodoro.totalMs));

    ctx.save();
    ctx.lineWidth = Math.max(2, u * 0.7);
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
    const u = Math.max(2, Math.round(unit() * 0.9));
    const w = u * 6;
    const h = u * 3;
    const x = Math.round(head.x - w / 2);
    const y = Math.round(head.y - h - unit() * (pomodoro.running ? 14 : 3));

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
      look.dx, look.dy, isBlinking() ? 'b' : '-',
      fxOn() && fx.animated ? Math.floor(lastTick / FX_MS) : '-',
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
    drawShadow();
    drawPip();
    Particles.draw(ctx, particleList, unit());
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
      detectShake(v, now);
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
      const walk = Physics.resolveWalk(body, walkDir, gotoX, wb, unit() * 4);
      dir = walk.dir;
      gotoX = walk.gotoX;
    }

    const opts = {};
    if (!drag && body.grounded && dir !== 0) {
      opts.walkSpeed = dir * (gotoX !== null ? Math.max(walkSpeed, gotoSpeed) : walkSpeed);
    }
    const events = Physics.step(body, dt, wb, opts);
    if (body.facing !== lastFacing) {
      lastFacing = body.facing;
      if (body.grounded && !drag && !body.climbing) turnUntil = now + Animations.clipDuration('turn');
    }
    if (events.respawned) {
      // Name the cause and the context. The bare "position was invalid" has
      // shown up in real logs with nothing to act on.
      notify('pip:error', {
        message: 'position was invalid (' + events.reason + '), respawned',
        stack: JSON.stringify({
          wb: [Math.round(wb.left), Math.round(wb.right), Math.round(wb.top), Math.round(wb.bottom)],
          bounds: [Math.round(bounds.width), Math.round(bounds.height)],
          scale: settings.scale, dpr: dpr, drag: !!drag, climbing: body.climbing,
          walkDir: walkDir, walkSpeed: walkSpeed, dt: Math.round(dt * 1000)
        })
      });
    }
    // physics.js can end a climb by itself (reaching the floor), so re-sync
    // rather than leaving main convinced Pip is still on the wall.
    if (!body.climbing && lastClimbSent) sendClimb(false);
    if (events.wallHit && events.wallHit > BONK_SPEED && !drag) {
      notify('pip:gesture', { kind: 'bonk' });
      Particles.spawn(particleList, 'spark', events.wall === 'left' ? wb.left - unit() * 6 : wb.right + unit() * 6,
        body.y - unit() * 12, 4);
    }
    launchAction(now);
    if (events.landed && fxOn() && getFrame(currentFrame)) fx.onLand(fxInfo(getFrame(currentFrame)), fxSpawn);
    if (events.landed) {
      // A gentle touchdown squashes and carries on; a real thump knocks Pip
      // flat and he has to pick himself up again.
      if (events.speed > 900) {
        setLocalClip('getup', now);
        Particles.spawn(particleList, 'star', body.x, body.y - unit() * 18, 3);
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
      if (!body.grounded && body.vy > 120 && now >= actionUntil) {
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

    watchForPounce(now, dt);
    checkStuck(now, dir, wb);

    advanceAnimation(now);
    updateEffects(dt);
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
  /** Special effects never animate faster than this. */
  const FX_MS = 1000 / 15;
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
    // An effect's own ambient particles do not need 30fps; anything else does.
    const busyParticles = particleList.some((p) => !p.ambient);
    const active =
      drag || overPip || body.climbing || !body.grounded ||
      dir !== 0 || Math.abs(body.vx) > 0.5 || gotoX !== null ||
      localClip !== null || busyParticles || bubble !== null ||
      action !== null || now < actionUntil || now < turnUntil ||
      sway !== 0 || Math.abs(body.squash - 1) > 0.01;
    if (active) return ACTIVE_MS;
    let next = msToNextFrame(now);
    // a blink starting or ending is a change of picture too
    if (hasLiveEyes(currentFrame)) {
      const edge = now < blinkUntil ? blinkUntil : blinkAt;
      if (edge > now) next = Math.min(next, edge - now);
    }
    // A glowing, hovering or sparkling Pip is redrawn at a gentle 15fps.
    if (fxOn() && (fx.animated || particleList.length > 0)) next = Math.min(next, FX_MS);
    return Math.min(MAX_IDLE_MS, Math.max(ACTIVE_MS, next));
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
    // a pet is a resting hand; sweeping about restarts the count
    if (Math.hypot(cursor.vx, cursor.vy) > PET_MAX_SPEED && now - cursor.t < 150) { hoverSince = now; return; }
    if (!hoverSince) { hoverSince = now; return; }
    if (petSent) return;
    if (now - hoverSince >= PET_MS) {
      petSent = true;
      notify('pip:pet', {});
      Particles.spawn(particleList, 'heart', body.x, body.y - unit() * 8, 3);
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
    const dx0 = x - cursor.x;
    const dt = (t - cursor.t) / 1000;
    if (dt > 0 && dt < 0.5) {
      cursor.vx = (x - cursor.x) / dt;
      cursor.vy = (y - cursor.y) / dt;
    }
    cursor.x = x;
    cursor.y = y;
    cursor.t = t;
    cursor.inside = true;

    detectTickle(x, dx0, t);
    detectCircle(x, y, t);

    // Fast, jerky movement close by makes Pip jump.
    const speed = Math.hypot(cursor.vx, cursor.vy);
    if (speed > STARTLE_SPEED && t - lastStartleAt > STARTLE_COOLDOWN) {
      const c = pipCenter();
      if (Math.hypot(x - c.x, y - c.y) < STARTLE_RANGE) {
        lastStartleAt = t;
        notify('pip:startle', {});
        Particles.spawn(particleList, 'sweat', body.x, body.y - unit() * 6, 2,
          { dir: -body.facing });
      }
    }
  }

  /**
   * Tickling: the pointer wiggling back and forth over Pip. Counted as
   * direction reversals, so slowly moving across him is not a tickle.
   */
  function detectTickle(x, dx, t) {
    if (!overPip || drag || Math.abs(dx) < 2) return;
    const dir = Math.sign(dx);
    if (tickleDir && dir !== tickleDir) tickleTimes.push(t);
    tickleDir = dir;
    tickleTimes = tickleTimes.filter((at) => t - at < TICKLE_WINDOW);
    if (tickleTimes.length >= TICKLE_REVERSALS && t - lastTickleAt > TICKLE_COOLDOWN) {
      lastTickleAt = t;
      tickleTimes = [];
      hoverSince = 0;
      petSent = true;   // a tickle is not also a pet
      notify('pip:gesture', { kind: 'tickle' });
    }
  }

  /** Circling: the pointer going round and round him makes him dizzy. */
  function detectCircle(x, y, t) {
    if (drag) return;
    const c = pipCenter();
    const d = Math.hypot(x - c.x, y - c.y);
    const reach = SIZE * settings.scale;
    if (d < reach * 0.35 || d > reach * 1.9 || t - orbitSince > CIRCLE_WINDOW) {
      orbitAngle = null;
      orbitTotal = 0;
      orbitSince = t;
      if (d < reach * 0.35 || d > reach * 1.9) return;
    }
    const a = Math.atan2(y - c.y, x - c.x);
    if (orbitAngle !== null) {
      let da = a - orbitAngle;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) < 1.2) orbitTotal += da;
    }
    orbitAngle = a;
    if (Math.abs(orbitTotal) >= CIRCLE_TURNS * Math.PI * 2 && t - lastCircleAt > 8000) {
      lastCircleAt = t;
      orbitTotal = 0;
      notify('pip:gesture', { kind: 'circle' });
    }
  }

  /** Shaking: the carried Pip swung hard back and forth. Once per carry. */
  function detectShake(v, now) {
    if (shakeSent || Math.abs(v.vx) < SHAKE_MIN_SPEED) return;
    const sign = Math.sign(v.vx);
    if (shakeSign && sign !== shakeSign) shakeTimes.push(now);
    shakeSign = sign;
    shakeTimes = shakeTimes.filter((at) => now - at < SHAKE_WINDOW);
    if (shakeTimes.length >= SHAKE_REVERSALS) {
      shakeSent = true;
      notify('pip:gesture', { kind: 'shake' });
      Particles.spawn(particleList, 'sweat', body.x, body.y - unit() * 16, 2);
    }
  }

  /**
   * A pounce: the pointer creeping along the floor just in front of an idle
   * Pip. He watches it for a moment first - the butt wiggle is main's call.
   */
  function watchForPounce(now, dt) {
    const ready = pipState === 'idle' && clip === 'idle' && !localClip && body.grounded &&
      !drag && !body.climbing && cursor.inside && now - lastPounceAt > POUNCE_COOLDOWN;
    if (!ready) { pounceWatch = 0; return; }
    const dx = cursor.x - body.x;
    const above = body.y - cursor.y;
    const s = settings.scale;
    const inFront = Math.sign(dx) === body.facing && Math.abs(dx) > 35 * s && Math.abs(dx) < 210 * s;
    const low = above > -8 * s && above < 70 * s;
    const speed = Math.hypot(cursor.vx, cursor.vy);
    const creeping = now - cursor.t < 250 && speed > 10 && speed < 280;
    if (inFront && low && creeping) pounceWatch += dt;
    else pounceWatch = Math.max(0, pounceWatch - dt * 2);
    if (pounceWatch >= POUNCE_WATCH_S) {
      pounceWatch = 0;
      lastPounceAt = now;
      notify('pip:gesture', { kind: 'pounce', x: cursor.x });
    }
  }

  /** Launch a pounce (or a hop) when it falls due. */
  function launchAction(now) {
    if (!action || now < action.at) return;
    const a = action;
    action = null;
    if (drag || body.climbing) return;
    if (a.kind === 'pounce') {
      const reach = typeof a.x === 'number' ? a.x - body.x : body.facing * 120;
      body.vx = Math.max(-620, Math.min(620, reach * 1.7));
      body.vy = -520;
    } else {
      body.vy = -380;
    }
    body.grounded = false;
    actionUntil = now + 900;
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
    shakeSent = false;
    shakeTimes = [];
    action = null;
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
    notify('pip:click', { x: x, y: y, face: onFace(x, y) });
  }

  /** Is (x, y) on Pip's face? A click there is a boop on the nose. */
  function onFace(x, y) {
    const meta = Sprites.FRAME_META[currentFrame];
    if (!meta || !meta.eyes || !meta.eyes.length) return false;
    const rect = spriteRect();
    let col = ((x - rect.left) / rect.width) * SIZE;
    const row = ((y - rect.top) / rect.height) * SIZE;
    if (body.facing === -1) col = SIZE - col;
    const first = meta.eyes[0];
    const last = meta.eyes[meta.eyes.length - 1];
    return row >= first.r - 2 && row <= first.r + 12 && col >= first.c - 3 && col <= last.c + 8;
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
    const typeChanged = s.flavor !== settings.flavor || s.effects !== settings.effects;
    settings = Object.assign({}, settings, s);
    // Frames are cached at the art's own size, so only a new type - not a new
    // scale or a new monitor - means composing them again.
    if (typeChanged || !palette) prerender();
    lastDrawKey = '';
    wake();
  });

  bridge.on('pip:bounds', (b) => {
    bounds = Object.assign({}, bounds, b);
    const before = dpr;
    resizeCanvas();
    if (dpr !== before) lastDrawKey = '';
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
      Particles.spawn(particleList, 'zzz', body.x, body.y - unit() * 10, 3);
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
    const y = body.y - unit() * (head ? 26 : 14);
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

  /** A move main decided on: a pounce toward the pointer, or a hop. */
  bridge.on('pip:action', (p) => {
    if (!p || !p.kind) return;
    action = { kind: p.kind, x: p.x, at: performance.now() + Math.max(0, p.delay || 0) };
    wake();
  });

  bridge.on('pip:goto', (p) => {
    if (!p) return;
    // x:null means "stop chasing" - Pip gives up and goes back to pottering.
    gotoX = typeof p.x === 'number' ? p.x : null;
    gotoSpeed = typeof p.speed === 'number' ? p.speed : 80;
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
      // Every clip, every frame, looking every way and blinking, for the
      // types that cover each kind of decoration; the idle pose for the rest.
      const full = Pips.SMOKE_FULL || Pips.IDS;
      for (const typeId of Pips.IDS) {
        const flavor = typeId;
        try {
          settings.flavor = flavor;
          prerender();
          const clips = full.indexOf(typeId) !== -1 ? Animations.CLIP_NAMES : ['idle'];
          for (const name of clips) {
            const c = Animations.CLIPS[name];
            let t = 0;
            for (let i = 0; i < c.frames.length; i++) {
              const res = Animations.frameAt(name, t);
              if (!res.frame || !Sprites.FRAMES[res.frame]) {
                errors.push(flavor + '/' + name + ': missing frame ' + res.frame);
              }
              // Actually compose and paint it, so a bad trait anchor, a broken
              // palette key or a bad draw throws here.
              currentFrame = res.frame;
              for (const lk of [{ dx: 0, dy: 0 }, { dx: -1, dy: -1 }, { dx: 1, dy: 1 }]) {
                look = lk;
                if (!getFrame(res.frame)) errors.push(flavor + '/' + name + ': could not compose ' + res.frame);
              }
              blinkUntil = lastTick + 1000;
              lastDrawKey = '';
              drawPip();
              blinkUntil = 0;
              look = { dx: 0, dy: 0 };
              if (settings.nightcap !== true && Sprites.FRAMES[res.frame + '_cap']) {
                if (!getFrame(res.frame + '_cap')) errors.push(flavor + ': could not compose ' + res.frame + '_cap');
              }
              t += c.durations[i];
            }
          }
          // Exercise the effects layer too.
          for (const kind of Particles.KINDS) {
            Particles.spawn(particleList, kind, body.x, body.y, 3);
          }
          particleList = Particles.update(particleList, 0.05);
          Particles.draw(ctx, particleList, unit());
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
      // Every special effect, at every level, through its whole draw path.
      for (const level of ['full', 'reduced']) {
        for (const name of Effects.NAMES) {
          try {
            settings.effects = level;
            fx = Effects.create(name, level);
            currentFrame = 'idle_0';
            for (let i = 0; i < 12; i++) {
              lastTick += 90;
              updateEffects(0.09);
              drawPip();
            }
            fx.onLand(fxInfo(getFrame(currentFrame)), fxSpawn);
            particleList = Particles.update(particleList, 0.05);
            Particles.draw(ctx, particleList, unit());
            particleList = [];
          } catch (err) {
            errors.push('effect ' + name + ' (' + level + '): ' + (err && err.message));
          }
        }
      }
      settings.effects = 'full';
      settings.flavor = 'cherry';
      prerender();
      currentFrame = Sprites.FRAME_NAMES[0];
      lastDrawKey = '';
      return errors;
    },
    state: () => ({ clip: clip, frame: currentFrame, x: body.x, y: body.y, flavor: settings.flavor })
  };
})();
