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

/** Is this a position Pip could actually be at? */
function isValidPosition(body, bounds) {
  if (!body) return false;
  const nums = [body.x, body.y, body.vx, body.vy];
  for (const n of nums) {
    if (typeof n !== 'number' || !isFinite(n)) return false;
  }
  const slack = 64;
  if (body.x < bounds.left - slack || body.x > bounds.right + slack) return false;
  if (body.y < bounds.top - bounds.height - slack || body.y > bounds.bottom + slack) return false;
  return true;
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

  if (!isValidPosition(body, bounds)) {
    respawn(body, bounds);
    events.respawned = true;
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
    if (!events.landed && impact > 40) {
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

  if (!isValidPosition(body, bounds)) {
    respawn(body, bounds);
    events.respawned = true;
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

const Physics = {
  GRAVITY, MAX_FALL, BOUNCE, MIN_BOUNCE, FRICTION, MAX_THROW,
  SQUASH_MIN, SQUASH_MAX,
  createBody, isValidPosition, respawn, clamp, step, throwVelocity
};

if (typeof window !== 'undefined') {
  window.Pip = window.Pip || {};
  window.Pip.Physics = Physics;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Physics;
}
