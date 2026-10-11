/*
 * physics.js - Pip's body in space.
 *
 * Pure maths, no DOM. Everything is in DIPs. The world is the overlay's work
 * area: x grows right, y grows down, and the floor is the bottom edge.
 *
 * Pip must never get lost, so every update clamps back inside the bounds and
 * an impossible position (NaN, off-world) triggers a respawn from the top.
 */

'use strict';

// Every overlay script shares one global scope, so nothing here may be
// declared at the top level - see ARCHITECTURE.md section 1.
(function () {
  const GRAVITY = 1400;        // DIP/s^2
  const MAX_FALL = 1800;       // terminal velocity, DIP/s
  const BOUNCE = 0.32;         // fraction of speed kept on a bounce
  const MIN_BOUNCE = 140;      // below this landing speed, stop bouncing
  const FRICTION = 0.86;       // horizontal damping per second while grounded
  const THROW_SCALE = 1.0;     // pointer velocity -> launch velocity
  const MAX_THROW = 2600;      // cap so a flick cannot fling Pip into orbit

  /** Squash-and-stretch limits - a jellybean deforms, but only so far. */
  const SQUASH_MIN = 0.72;
  const SQUASH_MAX = 1.28;

  /**
   * Pip's squash springs back to shape rather than easing, so every impact
   * jiggles a few times before he settles - on the floor and mid-bounce
   * alike. Underdamped on purpose: about three visible wobbles.
   */
  const WOBBLE_STIFFNESS = 320;   // 1/s^2
  const WOBBLE_DAMPING = 11;      // 1/s

  /** Fraction of sideways speed kept when Pip ricochets off a screen edge. */
  const WALL_BOUNCE = 0.55;
  /** Slower than this (DIP/s) he just stops against the wall, as before. */
  const MIN_BONK = 260;
  /** Fraction of speed kept off the ceiling - it is a soft ceiling. */
  const CEILING_BOUNCE = 0.4;

  /**
   * Spin. A throw sets Pip tumbling as if he rolled off the pointer: faster
   * sideways means faster spin, capped so he never becomes a blur. Gentle
   * tosses do not spin at all.
   */
  const SPIN_RADIUS = 90;         // DIP - sideways speed / radius = rad/s
  const MAX_SPIN = 4 * Math.PI;   // two turns a second
  const MIN_SPIN_THROW = 450;     // DIP/s of throw before he starts to tumble
  const SPIN_DRAG = 0.7;          // fraction of spin rate kept per second in the air
  /** On the floor, how fast he rights himself (1/s). */
  const UPRIGHT_RATE = 14;

  /**
   * A fresh body.
   * @param {number} x centre x in DIPs
   * @param {number} y feet y in DIPs
   */
  function createBody(x, y) {
    return {
      x: x,
      y: y,
      vx: 0,
      vy: 0,
      facing: 1,          // 1 = right, -1 = left
      grounded: false,
      held: false,
      climbing: null,     // null | 'left' | 'right'
      squash: 1,          // <1 = flattened and wide, >1 = tall and thin
      squashV: 0,         // rate of change of squash, for the landing wobble
      spin: 0,            // radians, drawn about his middle; 0 = upright
      spinRate: 0,        // rad/s while airborne
      turned: 0,          // radians tumbled since he left the floor
      landedAt: 0         // timestamp of the last landing, for squash timing
    };
  }

  /**
   * Why this position is impossible, or null if it is fine.
   *
   * Kept separate from isValidPosition so a respawn can say what went wrong -
   * "position was invalid" alone has turned up in real logs with nothing to go
   * on, and a respawn is invisible to every test.
   */
  function invalidReason(body, bounds) {
    if (!body) return 'no body';
    const fields = { x: body.x, y: body.y, vx: body.vx, vy: body.vy };
    for (const k of Object.keys(fields)) {
      const n = fields[k];
      if (typeof n !== 'number' || !isFinite(n)) return k + ' is ' + n;
    }
    const slack = 64;
    if (body.x < bounds.left - slack) return 'x ' + Math.round(body.x) + ' left of ' + Math.round(bounds.left);
    if (body.x > bounds.right + slack) return 'x ' + Math.round(body.x) + ' right of ' + Math.round(bounds.right);
    if (body.y < bounds.top - bounds.height - slack) return 'y ' + Math.round(body.y) + ' above the ceiling';
    if (body.y > bounds.bottom + slack) return 'y ' + Math.round(body.y) + ' below floor ' + Math.round(bounds.bottom);
    return null;
  }

  /** Is this a position Pip could actually be at? */
  function isValidPosition(body, bounds) {
    return invalidReason(body, bounds) === null;
  }

  /**
   * Drop Pip back in from the top of the screen. Used on first run, after an
   * invalid position, by "Reset position", and when he is let go over another
   * display.
   *
   * @param {number} [x] where to drop him in; the middle when omitted
   */
  function respawn(body, bounds, x) {
    body.x = typeof x === 'number' && isFinite(x)
      ? Math.max(bounds.left, Math.min(bounds.right, x))
      : (bounds.left + bounds.right) / 2;
    body.y = bounds.top - 8;
    body.vx = 0;
    body.vy = 0;
    body.grounded = false;
    body.held = false;
    body.climbing = null;
    body.squash = 1;
    body.squashV = 0;
    body.spin = 0;
    body.spinRate = 0;
    body.turned = 0;
    return body;
  }

  /** Wrap an angle into (-PI, PI], so righting himself takes the short way. */
  function wrapAngle(a) {
    if (!isFinite(a)) return 0;
    a = a % (2 * Math.PI);
    if (a > Math.PI) a -= 2 * Math.PI;
    if (a <= -Math.PI) a += 2 * Math.PI;
    return a;
  }

  /**
   * How fast a throw sets Pip spinning, in rad/s. Positive is clockwise on
   * screen, which is the way a body rolls when it is flung to the right.
   *
   * @param {number} vx launch velocity, DIP/s
   * @param {number} vy launch velocity, DIP/s
   */
  function launchSpin(vx, vy) {
    if (!isFinite(vx) || !isFinite(vy)) return 0;
    if (Math.hypot(vx, vy) < MIN_SPIN_THROW) return 0;
    const rate = vx / SPIN_RADIUS;
    return Math.max(-MAX_SPIN, Math.min(MAX_SPIN, rate));
  }

  /** Keep Pip inside the world no matter what happened this frame. */
  function clamp(body, bounds) {
    if (body.x < bounds.left) { body.x = bounds.left; if (body.vx < 0) body.vx = 0; }
    if (body.x > bounds.right) { body.x = bounds.right; if (body.vx > 0) body.vx = 0; }
    if (body.y > bounds.bottom) { body.y = bounds.bottom; }
    if (body.y < bounds.top - bounds.height) { body.y = bounds.top - bounds.height; }
    return body;
  }

  /**
   * Advance the simulation.
   *
   * @param {object} body
   * @param {number} dt      seconds since the last step
   * @param {object} bounds  {left, right, top, bottom, height}
   * @param {object} [opts]  {walkSpeed} horizontal drive while grounded
   * @returns {object} events that happened this step, e.g. {landed:true, speed}
   */
  function step(body, dt, bounds, opts) {
    opts = opts || {};
    const events = {};

    const before = invalidReason(body, bounds);
    if (before) {
      respawn(body, bounds);
      events.respawned = true;
      events.reason = 'on entry: ' + before;
      return events;
    }

    if (body.held) {
      // While held, the pointer owns the position; just relax the squash.
      body.squash += (1 - body.squash) * Math.min(1, dt * 8);
      body.squashV = 0;
      body.spin = 0;
      body.spinRate = 0;
      body.turned = 0;
      body.grounded = false;
      return events;
    }

    if (body.climbing) {
      // Gripping a screen edge: no gravity, slow vertical crawl.
      body.x = body.climbing === 'left' ? bounds.left : bounds.right;
      body.y += body.vy * dt;
      if (body.y <= bounds.top) { body.y = bounds.top; body.vy = 0; }
      if (body.y >= bounds.bottom) { body.y = bounds.bottom; body.vy = 0; body.climbing = null; body.grounded = true; }
      clamp(body, bounds);
      return events;
    }

    if (typeof opts.walkSpeed === 'number' && body.grounded) {
      body.vx = opts.walkSpeed;
    }

    // Remembered so a landing can mean what it says: the moment of touchdown.
    const wasGrounded = body.grounded;

    body.vy += GRAVITY * dt;
    if (body.vy > MAX_FALL) body.vy = MAX_FALL;

    const prevY = body.y;
    body.x += body.vx * dt;
    body.y += body.vy * dt;

    // Screen edges are springy in the air. A throw that reaches one comes
    // back off it instead of stopping dead, so Pip can be ricocheted round
    // the desktop. On the floor the wall still just stops him: a wander into
    // it is the climb-or-turn logic's business, and a skid ends against it.
    if (!wasGrounded) {
      if (body.x <= bounds.left && body.vx < -MIN_BONK) {
        bonk(body, events, 'left', -body.vx);
        body.x = bounds.left;
        body.vx = -body.vx * WALL_BOUNCE;
      } else if (body.x >= bounds.right && body.vx > MIN_BONK) {
        bonk(body, events, 'right', body.vx);
        body.x = bounds.right;
        body.vx = -body.vx * WALL_BOUNCE;
      }
    }
    const ceiling = typeof bounds.ceiling === 'number' && isFinite(bounds.ceiling)
      ? Math.max(bounds.ceiling, bounds.top - bounds.height)
      : bounds.top - bounds.height;
    // Only when he crosses it this step: let go above the line (he can be
    // carried higher), he must not be yanked down to it.
    if (body.y <= ceiling && prevY > ceiling && body.vy < 0) {
      if (-body.vy > MIN_BONK) bonk(body, events, 'top', -body.vy);
      body.y = ceiling;
      body.vy = -body.vy * CEILING_BOUNCE;
    }

    if (body.y >= bounds.bottom) {
      const impact = body.vy;
      body.y = bounds.bottom;
      if (impact > MIN_BOUNCE) {
        body.vy = -impact * BOUNCE;
        body.grounded = false;
      } else {
        body.vy = 0;
        body.grounded = true;
      }
      // Only a real touchdown counts. A body already standing on the floor
      // still picks up one step of gravity and is pushed back up, and that used
      // to be reported as a fresh landing on every frame - which in turn kept
      // the renderer's walk/stop logic permanently switched off while Pip was
      // on the ground.
      if (!wasGrounded && impact > 40) {
        events.landed = true;
        events.speed = impact;
        // How far he tumbled on the way, so a spinning throw can leave him
        // dizzier than a plain one.
        events.turns = Math.abs(body.turned) / (2 * Math.PI);
        // Flatten and widen on impact, proportional to how hard Pip hit.
        body.squash = Math.max(SQUASH_MIN, 1 - Math.min(0.28, impact / 9000));
        body.squashV = 0;
        // Touching the floor stops the tumble; a bounce rolls on more slowly.
        body.spinRate = body.grounded ? 0 : body.spinRate * 0.5;
        if (body.grounded) body.turned = 0;
      }
    } else {
      body.grounded = false;
    }

    // Stretch tall while moving fast vertically - jumping or dangling - and
    // spring back to round on the floor.
    const shape = body.grounded ? 1 : 1 + Math.min(0.24, Math.abs(body.vy) / 9000);
    wobble(body, shape, dt);

    if (body.grounded) {
      if (typeof opts.walkSpeed !== 'number') {
        body.vx *= Math.pow(FRICTION, dt * 60);
        if (Math.abs(body.vx) < 2) body.vx = 0;
      }
      body.spinRate = 0;
      body.turned = 0;
      body.spin = wrapAngle(body.spin);
      body.spin += (0 - body.spin) * Math.min(1, dt * UPRIGHT_RATE);
      if (Math.abs(body.spin) < 0.01) body.spin = 0;
    } else if (body.spinRate !== 0) {
      const turn = body.spinRate * dt;
      body.spin = wrapAngle(body.spin + turn);
      body.turned += turn;
      body.spinRate *= Math.pow(SPIN_DRAG, dt);
    }

    if (body.squash < SQUASH_MIN) body.squash = SQUASH_MIN;
    if (body.squash > SQUASH_MAX) body.squash = SQUASH_MAX;

    if (body.vx > 4) body.facing = 1;
    else if (body.vx < -4) body.facing = -1;

    clamp(body, bounds);

    const after = invalidReason(body, bounds);
    if (after) {
      respawn(body, bounds);
      events.respawned = true;
      events.reason = 'after the step: ' + after;
    }

    return events;
  }

  /**
   * Spring the squash toward `shape`. Sub-stepped so a slow frame (dt is
   * capped at 0.1s) cannot make the spring blow up, and snapped once it is
   * imperceptible so the render loop can go back to idling.
   */
  function wobble(body, shape, dt) {
    const n = Math.max(1, Math.ceil(dt / 0.01));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const acc = -WOBBLE_STIFFNESS * (body.squash - shape) - WOBBLE_DAMPING * body.squashV;
      body.squashV += acc * h;
      body.squash += body.squashV * h;
    }
    if (Math.abs(body.squash - shape) < 0.004 && Math.abs(body.squashV) < 0.05) {
      body.squash = shape;
      body.squashV = 0;
    }
  }

  /**
   * Pip hit a screen edge hard enough to ricochet. Squashes him against it
   * and knocks his spin about, and reports it for stars and a reaction.
   */
  function bonk(body, events, side, speed) {
    events.bonked = side;
    events.bonkSpeed = speed;
    const amount = Math.min(0.28, speed / 7000);
    // A side wall flattens him tall and thin; the ceiling, short and wide.
    body.squash = side === 'top' ? Math.max(SQUASH_MIN, 1 - amount) : Math.min(SQUASH_MAX, 1 + amount);
    body.squashV = 0;
    // Glancing off a wall reverses the tumble, like a ball with English on it.
    body.spinRate = -body.spinRate * 0.7;
  }

  /**
   * Turn a short history of pointer samples into a throw.
   * Uses displacement over the last ~100ms so one jittery sample cannot fling
   * Pip across the screen.
   *
   * @param {Array<{x,y,t}>} samples newest last
   * @param {number} now timestamp
   */
  function throwVelocity(samples, now) {
    if (!samples || samples.length < 2) return { vx: 0, vy: 0 };
    const cutoff = now - 100;
    let oldest = samples[0];
    for (let i = samples.length - 1; i >= 0; i--) {
      oldest = samples[i];
      if (samples[i].t <= cutoff) break;
    }
    const newest = samples[samples.length - 1];
    const dt = (newest.t - oldest.t) / 1000;
    if (dt <= 0) return { vx: 0, vy: 0 };
    let vx = ((newest.x - oldest.x) / dt) * THROW_SCALE;
    let vy = ((newest.y - oldest.y) / dt) * THROW_SCALE;
    const speed = Math.hypot(vx, vy);
    if (speed > MAX_THROW) {
      vx = (vx / speed) * MAX_THROW;
      vy = (vy / speed) * MAX_THROW;
    }
    return { vx: vx, vy: vy };
  }


  /**
   * Work out which way Pip should walk this frame.
   *
   * Two things here exist because of real misbehaviour:
   *
   * 1. A "go here" target is clamped into the walkable range first. The cursor
   *    can sit closer to the screen edge than Pip's own half-width, and an
   *    unreachable target pinned the walk direction forever - he trotted into
   *    the wall in place until he was dragged away.
   * 2. Walking into a wall that has already stopped him looks broken, so the
   *    drive is dropped and the target abandoned. `blocked` says which wall,
   *    so the renderer can decide what he does about it - climb it, or turn
   *    round and carry on the other way.
   *
   * @param {object} body
   * @param {number} walkDir       -1 | 0 | 1 from the brain
   * @param {number|null} gotoX    target x, or null
   * @param {object} bounds        {left, right, ...}
   * @param {number} arriveWithin  how close counts as arrived, in DIPs
   * @returns {{dir:number, gotoX:number|null, blocked:'left'|'right'|null}}
   */
  function resolveWalk(body, walkDir, gotoX, bounds, arriveWithin) {
    let dir = walkDir;
    let target = gotoX === undefined ? null : gotoX;
    let blocked = null;

    if (target !== null) {
      const reachable = Math.max(bounds.left, Math.min(bounds.right, target));
      const delta = reachable - body.x;
      if (Math.abs(delta) < arriveWithin) {
        target = null;
        dir = 0;
      } else {
        dir = delta > 0 ? 1 : -1;
      }
    }

    const intoLeftWall = dir < 0 && body.x <= bounds.left + 0.5;
    const intoRightWall = dir > 0 && body.x >= bounds.right - 0.5;
    if (intoLeftWall || intoRightWall) {
      blocked = intoLeftWall ? 'left' : 'right';
      dir = 0;
      target = null;
    }

    return { dir: dir, gotoX: target, blocked: blocked };
  }

  const Physics = {
    GRAVITY, MAX_FALL, BOUNCE, MIN_BOUNCE, FRICTION, MAX_THROW,
    SQUASH_MIN, SQUASH_MAX, WALL_BOUNCE, MIN_BONK, MAX_SPIN, MIN_SPIN_THROW,
    createBody, isValidPosition, invalidReason, respawn, clamp, step, throwVelocity, resolveWalk,
    launchSpin, wrapAngle
  };

  if (typeof window !== 'undefined') {
    window.Pip = window.Pip || {};
    window.Pip.Physics = Physics;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Physics;
  }
})();
