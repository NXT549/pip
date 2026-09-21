/*
 * physics.test.js - Pip's body must never get lost.
 *
 * The interesting cases are all the ones where something has gone wrong: a
 * NaN position, a flick that would fling him off the desktop, a landing that
 * should stick rather than bounce. Those are what these tests pin down.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Physics = require('../src/renderer/physics.js');

/** A work-area-shaped world, inset the way renderer.js insets it. */
function world() {
  return { left: 64, right: 736, top: 64, bottom: 600, height: 128 };
}

const CLOSE = 1e-6;

test('gravity accelerates a falling body', () => {
  const bounds = world();
  const body = Physics.createBody(400, 200);
  const dt = 1 / 60;

  Physics.step(body, dt, bounds);
  const v1 = body.vy;
  const y1 = body.y;

  Physics.step(body, dt, bounds);
  const v2 = body.vy;

  assert.ok(Math.abs(v1 - Physics.GRAVITY * dt) < CLOSE, 'first step is g*dt');
  assert.ok(v2 > v1, 'speed keeps increasing while falling');
  assert.ok(y1 > 200, 'and the body actually moves down');
  assert.strictEqual(body.grounded, false);
});

test('falling is capped at terminal velocity', () => {
  const bounds = world();
  const body = Physics.createBody(400, 100);
  body.vy = Physics.MAX_FALL + 500;
  Physics.step(body, 1 / 60, bounds);
  assert.ok(body.vy <= Physics.MAX_FALL);
});

test('a soft landing grounds the body and squashes it', () => {
  const bounds = world();
  const body = Physics.createBody(400, bounds.bottom - 0.1);
  body.vy = 60;                       // stays under MIN_BOUNCE after one step

  const events = Physics.step(body, 0.016, bounds);

  assert.strictEqual(events.landed, true, 'a landed event is reported');
  assert.ok(events.speed > 40, 'with the impact speed');
  assert.ok(events.speed < Physics.MIN_BOUNCE, 'this one is too slow to bounce');
  assert.strictEqual(body.grounded, true);
  assert.strictEqual(body.vy, 0);
  assert.strictEqual(body.y, bounds.bottom);
  assert.ok(body.squash < 1, 'impact flattens him');
  assert.ok(body.squash >= Physics.SQUASH_MIN, 'but only so far');
});

test('a hard landing bounces instead of sticking', () => {
  const bounds = world();
  const body = Physics.createBody(400, bounds.bottom - 10);
  body.vy = 900;

  const events = Physics.step(body, 0.05, bounds);

  assert.strictEqual(events.landed, true);
  assert.strictEqual(body.grounded, false, 'still airborne after the bounce');
  assert.ok(body.vy < 0, 'and heading back up');
  assert.ok(Math.abs(body.vy) < events.speed, 'having lost energy');
});

test('clamp keeps the body inside all four walls', () => {
  const bounds = world();

  const left = Physics.createBody(-50, 300);
  left.vx = -400;
  Physics.clamp(left, bounds);
  assert.strictEqual(left.x, bounds.left);
  assert.strictEqual(left.vx, 0, 'and kills the velocity pushing him out');

  const right = Physics.createBody(9999, 300);
  right.vx = 400;
  Physics.clamp(right, bounds);
  assert.strictEqual(right.x, bounds.right);
  assert.strictEqual(right.vx, 0);

  const low = Physics.createBody(400, 5000);
  Physics.clamp(low, bounds);
  assert.strictEqual(low.y, bounds.bottom);

  const high = Physics.createBody(400, -5000);
  Physics.clamp(high, bounds);
  assert.strictEqual(high.y, bounds.top - bounds.height);
});

test('clamping survives a full step, not just a direct call', () => {
  const bounds = world();
  const body = Physics.createBody(bounds.right - 1, bounds.bottom);
  body.grounded = true;
  Physics.step(body, 0.1, bounds, { walkSpeed: 5000 });
  assert.ok(body.x <= bounds.right);
  assert.ok(body.y <= bounds.bottom);
});

test('isValidPosition rejects NaN, Infinity and far-out coordinates', () => {
  const bounds = world();
  const ok = Physics.createBody(400, 300);
  assert.strictEqual(Physics.isValidPosition(ok, bounds), true);

  const nan = Physics.createBody(NaN, 300);
  assert.strictEqual(Physics.isValidPosition(nan, bounds), false);

  const inf = Physics.createBody(400, 300);
  inf.vy = Infinity;
  assert.strictEqual(Physics.isValidPosition(inf, bounds), false);

  const negInf = Physics.createBody(400, 300);
  negInf.vx = -Infinity;
  assert.strictEqual(Physics.isValidPosition(negInf, bounds), false);

  const offRight = Physics.createBody(bounds.right + 65, 300);
  assert.strictEqual(Physics.isValidPosition(offRight, bounds), false);

  const offLeft = Physics.createBody(bounds.left - 65, 300);
  assert.strictEqual(Physics.isValidPosition(offLeft, bounds), false);

  const belowFloor = Physics.createBody(400, bounds.bottom + 65);
  assert.strictEqual(Physics.isValidPosition(belowFloor, bounds), false);

  const aboveCeiling = Physics.createBody(400, bounds.top - bounds.height - 65);
  assert.strictEqual(Physics.isValidPosition(aboveCeiling, bounds), false);

  assert.strictEqual(Physics.isValidPosition(null, bounds), false);
});

test('an invalid position respawns from the top via step', () => {
  const bounds = world();
  const body = Physics.createBody(400, 300);
  body.grounded = true;
  body.x = NaN;

  const events = Physics.step(body, 1 / 60, bounds);

  assert.strictEqual(events.respawned, true);
  assert.strictEqual(body.x, (bounds.left + bounds.right) / 2);
  assert.strictEqual(body.y, bounds.top - 8);
  assert.strictEqual(body.vx, 0);
  assert.strictEqual(body.vy, 0);
  assert.strictEqual(body.grounded, false);
  assert.strictEqual(body.held, false);
  assert.strictEqual(Physics.isValidPosition(body, bounds), true, 'and lands somewhere legal');
});

test('throwVelocity only looks at the last ~100ms of pointer samples', () => {
  // The pointer went a long way left, then whipped right in the final 100ms.
  // A full-history slope would read +100 DIP/s; only the recent window gives
  // the flick the user actually felt.
  const samples = [
    { x: 0, y: 0, t: 0 },
    { x: -100, y: 0, t: 400 },
    { x: 0, y: 0, t: 450 },
    { x: 50, y: 0, t: 500 }
  ];

  const v = Physics.throwVelocity(samples, 500);

  assert.ok(Math.abs(v.vx - 1500) < CLOSE, 'uses the 400ms->500ms window');
  assert.ok(Math.abs(v.vy) < CLOSE);
});

test('throwVelocity caps a flick at MAX_THROW', () => {
  const samples = [
    { x: 0, y: 0, t: 0 },
    { x: 100, y: 100, t: 10 }     // 10000 DIP/s on both axes
  ];

  const v = Physics.throwVelocity(samples, 10);
  const speed = Math.hypot(v.vx, v.vy);

  assert.ok(Math.abs(speed - Physics.MAX_THROW) < 1e-6, 'scaled back to the cap');
  assert.ok(v.vx > 0 && v.vy > 0, 'keeping the direction');
});

test('throwVelocity with fewer than two samples is a dead drop', () => {
  assert.deepStrictEqual(Physics.throwVelocity([], 100), { vx: 0, vy: 0 });
  assert.deepStrictEqual(Physics.throwVelocity([{ x: 1, y: 1, t: 1 }], 100), { vx: 0, vy: 0 });
  assert.deepStrictEqual(Physics.throwVelocity(null, 100), { vx: 0, vy: 0 });
});

test('throwVelocity ignores samples that share a timestamp', () => {
  const samples = [
    { x: 0, y: 0, t: 50 },
    { x: 80, y: 0, t: 50 }
  ];
  assert.deepStrictEqual(Physics.throwVelocity(samples, 50), { vx: 0, vy: 0 });
});

/* ------------------------------------------------------------------ *
 * resolveWalk - the "trotting on the spot" regressions
 * ------------------------------------------------------------------ */

test('an unreachable target is clamped instead of pinning the walk forever', () => {
  // Pip's centre cannot go closer to the edge than half his sprite, but the
  // cursor can. Calling him to x=20 when his floor is x=64 used to leave the
  // direction pinned at -1 for good: he trotted into the wall in place until
  // he was dragged away.
  const bounds = { left: 64, right: 1856 };
  const body = { x: 64 };

  const out = Physics.resolveWalk(body, 0, 20, bounds, 16);

  assert.strictEqual(out.dir, 0, 'should not keep walking at an unreachable target');
  assert.strictEqual(out.gotoX, null, 'the target should be given up, not retried forever');
});

test('a reachable target is still walked to', () => {
  const bounds = { left: 64, right: 1856 };
  assert.strictEqual(Physics.resolveWalk({ x: 400 }, 0, 900, bounds, 16).dir, 1);
  assert.strictEqual(Physics.resolveWalk({ x: 900 }, 0, 400, bounds, 16).dir, -1);
});

test('arriving clears the target', () => {
  const bounds = { left: 64, right: 1856 };
  const out = Physics.resolveWalk({ x: 400 }, 0, 405, bounds, 16);
  assert.strictEqual(out.dir, 0);
  assert.strictEqual(out.gotoX, null);
});

test('Pip does not walk into a wall that has already stopped him', () => {
  const bounds = { left: 64, right: 1856 };
  // Pressed against the left wall, still being driven left.
  assert.strictEqual(Physics.resolveWalk({ x: 64 }, -1, null, bounds, 16).dir, 0);
  // ...and the right.
  assert.strictEqual(Physics.resolveWalk({ x: 1856 }, 1, null, bounds, 16).dir, 0);
  // Walking away from a wall is fine.
  assert.strictEqual(Physics.resolveWalk({ x: 64 }, 1, null, bounds, 16).dir, 1);
  // Mid-screen is untouched.
  assert.strictEqual(Physics.resolveWalk({ x: 900 }, -1, null, bounds, 16).dir, -1);
});

test('a called Pip standing at the far wall gives up rather than moonwalking', () => {
  // The whole reported failure, end to end: he is at the left wall and the
  // cursor is off in the unreachable margin beyond it.
  const bounds = { left: 64, right: 1856 };
  let gotoTarget = 8;
  let body = { x: 64 };

  // Ten seconds of ticks: the direction must not stay pinned.
  let pinnedTicks = 0;
  for (let i = 0; i < 300; i++) {
    const out = Physics.resolveWalk(body, 0, gotoTarget, bounds, 16);
    gotoTarget = out.gotoX;
    if (out.dir !== 0) pinnedTicks++;
  }
  assert.strictEqual(pinnedTicks, 0, 'Pip kept trying to walk somewhere he cannot stand');
  assert.strictEqual(gotoTarget, null);
});

/* ------------------------------------------------------------------ *
 * Landing means touchdown
 * ------------------------------------------------------------------ */

test('a Pip standing on the floor does not keep landing', () => {
  // Gravity is still applied to a grounded body, which the floor then pushes
  // back up. That used to be reported as a landing on every single frame, and
  // the renderer refreshed a 500ms "still landing" window on each one - so the
  // logic that stops the walk cycle on the spot never ran while Pip stood on
  // the ground. It is the root of the moonwalk.
  const bounds = { left: 64, right: 1856, top: 64, bottom: 1000, height: 128 };
  const body = Physics.createBody(900, 1000);
  body.grounded = true;

  let landings = 0;
  for (let i = 0; i < 100; i++) {
    if (Physics.step(body, 1 / 30, bounds, {}).landed) landings++;
  }
  assert.strictEqual(landings, 0, 'standing still reported ' + landings + ' landings');
});

test('the renderer\'s walk guard actually gets a chance to run while grounded', () => {
  // The direct consequence of the above, replayed the way renderer.js does it.
  const bounds = { left: 64, right: 1856, top: 64, bottom: 1000, height: 128 };
  const body = Physics.createBody(900, 1000);
  body.grounded = true;

  let now = 0;
  let landedUntil = 0;
  let guardRan = 0;
  for (let i = 0; i < 90; i++) {
    now += 33;
    if (Physics.step(body, 0.033, bounds, {}).landed) landedUntil = now + 500;
    if (now >= landedUntil) guardRan++;
  }
  assert.strictEqual(guardRan, 90, 'the guard only ran on ' + guardRan + ' of 90 ticks');
});

test('a real drop still lands, and the bounces land too', () => {
  const bounds = { left: 64, right: 1856, top: 64, bottom: 1000, height: 128 };
  const body = Physics.createBody(900, 200);

  const impacts = [];
  for (let i = 0; i < 300; i++) {
    const ev = Physics.step(body, 1 / 30, bounds, {});
    if (ev.landed) impacts.push(ev.speed);
  }
  assert.ok(impacts.length >= 1, 'falling from a height must register a landing');
  assert.ok(impacts[0] > 900, 'the first impact is a hard one');
  for (let i = 1; i < impacts.length; i++) {
    assert.ok(impacts[i] < impacts[i - 1], 'each bounce lands softer than the last');
  }
  assert.strictEqual(body.grounded, true, 'and he comes to rest');
});
