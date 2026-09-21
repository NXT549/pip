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
 * invalid position, and by "Reset position".
 */
function respawn(body, bounds) {
  body.x = (bounds.left + bounds.right) / 2;
  body.y = bounds.top - 8;
  body.vx = 0;
  body.vy = 0;
  body.grounded = false;
  body.held = false;
  body.climbing = null;
  body.squash = 1;
  return body;
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

  body.x += body.vx * dt;
  body.y += body.vy * dt;

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
      // Flatten and widen on impact, proportional to how hard Pip hit.
      body.squash = Math.max(SQUASH_MIN, 1 - Math.min(0.28, impact / 9000));
    }
  } else {
    body.grounded = false;
    // Stretch tall while moving fast vertically - jumping or dangling.
    const stretch = 1 + Math.min(0.24, Math.abs(body.vy) / 9000);
    body.squash += (stretch - body.squash) * Math.min(1, dt * 6);
  }

  if (body.grounded) {
    if (typeof opts.walkSpeed !== 'number') {
      body.vx *= Math.pow(FRICTION, dt * 60);
      if (Math.abs(body.vx) < 2) body.vx = 0;
    }
    body.squash += (1 - body.squash) * Math.min(1, dt * 7);
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
 *    drive is dropped and the target abandoned; the wander picks a new
 *    direction shortly after.
 *
 * @param {object} body
 * @param {number} walkDir       -1 | 0 | 1 from the brain
 * @param {number|null} gotoX    target x, or null
 * @param {object} bounds        {left, right, ...}
 * @param {number} arriveWithin  how close counts as arrived, in DIPs
 * @returns {{dir:number, gotoX:number|null}}
 */
function resolveWalk(body, walkDir, gotoX, bounds, arriveWithin) {
  let dir = walkDir;
  let target = gotoX === undefined ? null : gotoX;

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
    dir = 0;
    target = null;
  }

  return { dir: dir, gotoX: target };
}

const Physics = {
  GRAVITY, MAX_FALL, BOUNCE, MIN_BOUNCE, FRICTION, MAX_THROW,
  SQUASH_MIN, SQUASH_MAX,
  createBody, isValidPosition, invalidReason, respawn, clamp, step, throwVelocity, resolveWalk
};

if (typeof window !== 'undefined') {
  window.Pip = window.Pip || {};
  window.Pip.Physics = Physics;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Physics;
}
