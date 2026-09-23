/*
 * frame-specs.js - the pose table Pip's 64x64 sprites are composed from.
 *
 * This is the file to edit when you want to change how a pose looks.
 * `npm run sprites` feeds every entry through tools/gen-sprites.js and
 * writes the frames into src/renderer/sprites.js.
 *
 * A spec is:
 *   view   'side' (default) | 'front'
 *   body   {cx, cy, w, h, dip, dipW, round, lean, tilt, belly}
 *            partial override of the resting bean. lean pushes the top
 *            forward (px), tilt rotates (radians, + tips the front down)
 *   legs   {mode:'stand'|'none', lift:[4], dx:[4], spread, floor, r,
 *           reach:[4]}
 *            order is ALWAYS [farBack, farFront, nearBack, nearFront].
 *            lift raises a foot off the floor, dx slides it, and reach
 *            {dx, dy} points a leg anywhere from its hip - a wave, a paw
 *            holding a book, a back leg folded under a sitting Pip.
 *   face   {eyes, mouth, brows, blush, dx, dy, mouthDx, mouthDy, hidden}
 *   props  [{name, r, c} | {name, at:'crown', dx, dy}, mirror, behind]
 *   gloss  {dr, dc} | 'none'
 *   rotate 0 | 90 | -90
 *
 * Eyes:   open wide dot closed happy half swirl sparkle squint heart teary
 * Mouths: smile cat open grin o wavy flat pout frown blep munch whistle none
 * Brows:  angry worried raised
 *
 * Only `open` and `wide` eyes follow the pointer and blink at runtime, so a
 * pose that should hold its expression uses one of the others.
 *
 * A trot moves the diagonal pairs together: (farFront + nearBack), then
 * (farBack + nearFront).
 */

'use strict';

/** The resting bean. Everything else is a nudge away from this. */
const REST = { cx: 32, cy: 41, w: 22, h: 14.8 };

const TROT_A = [0, 3, 3, 0];
const TROT_B = [3, 0, 0, 3];
const DOWN = [0, 0, 0, 0];

/** Sitting: the rump on the floor, the front end raised, back legs folded. */
const SIT = { cx: 29.5, cy: 43.2, w: 19.4, h: 15.2, tilt: -0.2, dip: 3.4 };
const SIT_LEGS = { reach: [{ dx: 8, dy: 3 }, null, { dx: 8, dy: 3 }, null], dx: [0, 2, 0, 4] };
/** Sitting with both front paws up, holding something. */
const SIT_HOLD = { reach: [{ dx: 8, dy: 3 }, { hx: 0, up: 6, dx: 6, dy: -3, over: true, r: 3 }, { dx: 8, dy: 3 }, { hx: 3, up: 6, dx: 7, dy: -2, over: true, r: 3 }] };

/** Curled up: no legs showing, a round loaf. */
const CURL = { cx: 32, cy: 46.4, w: 18.4, h: 14.2, dip: 2, dipW: 0.62, round: 2 };

const specs = {};

/* ------------------------------------------------------------------ *
 * idle - breathing and a little weight shift. Blinks and eye tracking
 * are added at runtime, so these all keep open eyes.
 * ------------------------------------------------------------------ */

specs.idle_0 = { body: REST };
specs.idle_1 = { body: { ...REST, cy: 40.7, h: 15.1, w: 21.9 } };
specs.idle_2 = { body: { ...REST, cy: 40.4, h: 15.4, w: 21.7 } };
specs.idle_3 = { body: { ...REST, cy: 41.3, h: 14.5, w: 22.2 } };
specs.idle_4 = { body: { ...REST, cx: 31.4 }, legs: { dx: [-1, -1, -1, -1] } };
specs.idle_5 = { body: { ...REST, cx: 32.6 }, legs: { dx: [1, 1, 1, 1] } };
specs.idle_wiggle_a = { body: { ...REST, cx: 31, cy: 40.6, tilt: -0.04 }, face: { mouth: 'cat' } };
specs.idle_wiggle_b = { body: { ...REST, cx: 33, cy: 40.6, tilt: 0.04 }, face: { mouth: 'cat' } };

/* ------------------------------------------------------------------ *
 * walk - a six-beat trot. The lifted pair swing forward, the planted
 * pair push back, and the body rises a pixel on each push.
 * ------------------------------------------------------------------ */

specs.walk_0 = { body: { ...REST, cy: 40.2 }, legs: { lift: [0, 3, 3, 0], dx: [-1, 2, 2, -1] } };
specs.walk_1 = { body: { ...REST, cy: 40.6, lean: 0.6 }, legs: { lift: [0, 1, 1, 0], dx: [-2, 3, 3, -2] } };
specs.walk_2 = { body: { ...REST, cy: 41 }, legs: { lift: DOWN, dx: [-2, 2, 2, -2] } };
specs.walk_3 = { body: { ...REST, cy: 40.2 }, legs: { lift: [3, 0, 0, 3], dx: [2, -1, -1, 2] } };
specs.walk_4 = { body: { ...REST, cy: 40.6, lean: 0.6 }, legs: { lift: [1, 0, 0, 1], dx: [3, -2, -2, 3] } };
specs.walk_5 = { body: { ...REST, cy: 41 }, legs: { lift: DOWN, dx: [2, -2, -2, 2] } };

/* ------------------------------------------------------------------ *
 * run - a gallop: reach, gather, push. Leaning into it, mouth open.
 * ------------------------------------------------------------------ */

const RUNFACE = { mouth: 'open' };
specs.run_0 = { body: { ...REST, cy: 40, w: 23.4, h: 13.8, lean: 2.4 }, legs: { lift: [1, 2, 1, 2], dx: [-4, 5, -4, 5] }, face: RUNFACE };
specs.run_1 = { body: { ...REST, cy: 38.6, w: 22.4, h: 14.4, lean: 1.8 }, legs: { lift: [5, 4, 5, 4], dx: [-1, 2, -1, 2] }, face: RUNFACE };
specs.run_2 = { body: { ...REST, cy: 39.2, w: 21, h: 15.4, lean: 1.2 }, legs: { lift: [4, 5, 4, 5], dx: [3, -2, 3, -2] }, face: RUNFACE };
specs.run_3 = { body: { ...REST, cy: 40.8, w: 22, h: 14.6, lean: 1.6 }, legs: { lift: [0, 2, 0, 1], dx: [2, -3, 1, -2] }, face: RUNFACE };
specs.run_4 = { body: { ...REST, cy: 40.4, w: 23, h: 14, lean: 2.2 }, legs: { lift: [2, 0, 1, 0], dx: [-3, 3, -2, 4] }, face: RUNFACE };
specs.run_5 = { body: { ...REST, cy: 39.4, w: 23.6, h: 13.8, lean: 2.6 }, legs: { lift: [3, 3, 2, 2], dx: [-5, 6, -5, 6] }, face: RUNFACE };

/* ------------------------------------------------------------------ *
 * dangle - held up by the scruff: stretched tall, all four legs
 * paddling at the air.
 * ------------------------------------------------------------------ */

const DANGLE = { ...REST, cy: 39.6, w: 19.8, h: 16.2 };
const DFACE = { eyes: 'wide', mouth: 'open', brows: 'worried' };
specs.dangle_0 = { body: DANGLE, legs: { lift: [0, 3, 3, 0], floor: 59, spread: 1, dx: [-1, 1, -1, 1] }, face: DFACE };
specs.dangle_1 = { body: { ...DANGLE, cy: 39.8 }, legs: { lift: [1, 1, 1, 1], floor: 59, spread: 1 }, face: DFACE };
specs.dangle_2 = { body: DANGLE, legs: { lift: [3, 0, 0, 3], floor: 59, spread: 1, dx: [1, -1, 1, -1] }, face: DFACE };
specs.dangle_3 = { body: { ...DANGLE, cy: 39.8 }, legs: { lift: [1, 1, 1, 1], floor: 59, spread: 1 }, face: { ...DFACE, mouth: 'o' } };

/* ------------------------------------------------------------------ *
 * climb - turned sideways against a screen edge. rotate:-90 leaves him
 * head-up with his feet pointing right, into the wall. The diagonal
 * pairs reach in turn, the same way he trots along the floor.
 * ------------------------------------------------------------------ */

const CLIMB = { ...REST, cy: 40, w: 20.8, h: 14.2 };
specs.climb_0 = { body: CLIMB, legs: { lift: [0, 5, 5, 0], spread: 2, dx: [0, 3, 3, 0] }, face: { mouth: 'flat' }, rotate: -90 };
specs.climb_1 = { body: { ...CLIMB, cy: 40.4 }, legs: { lift: DOWN, spread: 2 }, face: { mouth: 'flat' }, rotate: -90 };
specs.climb_2 = { body: CLIMB, legs: { lift: [5, 0, 0, 5], spread: 2, dx: [3, 0, 0, 3] }, face: { mouth: 'flat' }, rotate: -90 };
specs.climb_3 = { body: { ...CLIMB, cy: 40.4 }, legs: { lift: DOWN, spread: 2 }, face: { mouth: 'pout' }, rotate: -90 };

/* ------------------------------------------------------------------ *
 * hang - caught at the top of a climb: stretched, legs dangling, a
 * little kick now and then.
 * ------------------------------------------------------------------ */

const HANG = { ...REST, cy: 38.6, w: 19.2, h: 16.6 };
specs.hang_0 = { body: HANG, legs: { lift: DOWN, spread: 1 }, face: { mouth: 'flat' } };
specs.hang_1 = { body: { ...HANG, cx: 32.6, tilt: 0.03 }, legs: { lift: [1, 0, 0, 1], spread: 1 }, face: { mouth: 'flat' } };
specs.hang_2 = { body: HANG, legs: { lift: [0, 3, 0, 3], spread: 1, dx: [0, 2, 0, 2] }, face: { mouth: 'o' } };
specs.hang_3 = { body: { ...HANG, cx: 31.4, tilt: -0.03 }, legs: { lift: [3, 0, 3, 0], spread: 1, dx: [-2, 0, -2, 0] }, face: { mouth: 'flat' } };

/* ------------------------------------------------------------------ *
 * fall - stretched thin, legs flailing, eyes like saucers.
 * ------------------------------------------------------------------ */

const FALL = { ...REST, cy: 38.4, w: 19, h: 16.8 };
const FFACE = { eyes: 'wide', mouth: 'open', brows: 'raised' };
specs.fall_0 = { body: FALL, legs: { lift: [3, 3, 3, 3], spread: 3, dx: [-2, 2, -2, 2] }, face: FFACE };
specs.fall_1 = {
  body: { ...FALL, cy: 38, tilt: 0.05 },
  legs: { spread: 2, reach: [{ dx: -5, dy: 3 }, { dx: 5, dy: 1 }, { dx: -6, dy: -2 }, { dx: 7, dy: -4 }] },
  face: { ...FFACE, dy: -1 }
};
specs.fall_2 = {
  body: { ...FALL, cy: 38.2, tilt: -0.05 },
  legs: { spread: 2, reach: [{ dx: -4, dy: 5 }, { dx: 6, dy: 4 }, { dx: -7, dy: 1 }, { dx: 6, dy: 1 }] },
  face: FFACE
};

/* ------------------------------------------------------------------ *
 * land - squash on impact, stretch back up, settle.
 * ------------------------------------------------------------------ */

specs.land_0 = { body: { cx: 32, cy: 49.6, w: 26.4, h: 9, dip: 1.8 }, legs: { spread: 3 }, face: { eyes: 'squint', mouth: 'flat' } };
specs.land_1 = { body: { cx: 32, cy: 46.4, w: 24.4, h: 11.6, dip: 2.8 }, legs: { spread: 2 }, face: { eyes: 'open', mouth: 'o' } };
specs.land_2 = { body: { ...REST, cy: 39.4, w: 20.8, h: 16 }, legs: { spread: 0 }, face: { eyes: 'open', mouth: 'smile' } };
specs.land_3 = { body: { ...REST, cy: 41.6, w: 22.6, h: 14.2 }, face: { eyes: 'open', mouth: 'smile' } };

/* ------------------------------------------------------------------ *
 * getup - peeling himself off the floor after a real thump.
 * ------------------------------------------------------------------ */

specs.getup_0 = { body: { cx: 32, cy: 51.4, w: 25.6, h: 8.8, dip: 1.6 }, legs: { mode: 'none' }, face: { eyes: 'squint', mouth: 'wavy' } };
specs.getup_1 = { body: { cx: 32, cy: 48, w: 24.4, h: 11, dip: 2.4 }, legs: { spread: 2 }, face: { eyes: 'half', mouth: 'wavy' } };
specs.getup_2 = { body: { ...REST, cy: 43, w: 23, h: 13.6 }, legs: { spread: 1 }, face: { eyes: 'half', mouth: 'flat' } };
specs.getup_3 = { body: { ...REST, cy: 41 }, face: { eyes: 'open', mouth: 'pout' } };

/* ------------------------------------------------------------------ *
 * dizzy - swirly eyes, rocking from side to side.
 * ------------------------------------------------------------------ */

const DZ = { eyes: 'swirl', mouth: 'wavy' };
specs.dizzy_0 = { body: { ...REST, cx: 30.4, cy: 41.4, tilt: -0.07 }, legs: { lift: [0, 1, 1, 0], spread: 1 }, face: { ...DZ, dx: -1 } };
specs.dizzy_1 = { body: { ...REST, cy: 40.8 }, legs: { spread: 1 }, face: DZ };
specs.dizzy_2 = { body: { ...REST, cx: 33.6, cy: 41.4, tilt: 0.07 }, legs: { lift: [1, 0, 0, 1], spread: 1 }, face: { ...DZ, dx: 1 } };
specs.dizzy_3 = { body: { ...REST, cy: 40.8 }, legs: { spread: 1 }, face: { ...DZ, mouth: 'blep' } };

/* ------------------------------------------------------------------ *
 * stretch - the play bow: reach forward, sink the chest down with the
 * back end up, hold it, shake it off.
 * ------------------------------------------------------------------ */

specs.stretch_0 = { body: { ...REST, cx: 31.4, w: 23.2, h: 14.4 }, legs: { dx: [0, 3, 0, 4], spread: 1 }, face: { eyes: 'squint', mouth: 'flat' } };
specs.stretch_1 = {
  body: { ...REST, cx: 31, cy: 41.6, w: 24, h: 14, tilt: 0.14 },
  legs: { lift: [0, 2, 0, 2], dx: [-2, 7, -2, 8], spread: 1 },
  face: { eyes: 'closed', mouth: 'o', dy: 1 }
};
specs.stretch_2 = {
  body: { ...REST, cx: 30.6, cy: 42.4, w: 24.4, h: 13.8, tilt: 0.2 },
  legs: { lift: [0, 4, 0, 4], dx: [-3, 9, -3, 10], spread: 1 },
  face: { eyes: 'closed', mouth: 'open', dy: 1 }
};
specs.stretch_3 = { body: { ...REST, cy: 41.2, w: 22.4 }, legs: { dx: [0, 2, 0, 2] }, face: { eyes: 'happy', mouth: 'smile' } };

/* ------------------------------------------------------------------ *
 * yawn - drawn up tall, mouth wide open, then a sleepy settle.
 * ------------------------------------------------------------------ */

specs.yawn_0 = { body: { ...REST, cy: 40.4, w: 21.4, h: 15.4 }, face: { eyes: 'half', mouth: 'o' } };
specs.yawn_1 = { body: { ...REST, cy: 39.2, w: 20.6, h: 16.4, tilt: -0.07 }, face: { eyes: 'closed', mouth: 'open', dy: -1 } };
specs.yawn_2 = { body: { ...REST, cy: 39.4, w: 20.8, h: 16.2, tilt: -0.05 }, face: { eyes: 'closed', mouth: 'grin', dy: -1 } };
specs.yawn_3 = { body: { ...REST, cy: 41.6, w: 22.4, h: 14.4 }, face: { eyes: 'half', mouth: 'flat' } };

/* ------------------------------------------------------------------ *
 * sit - rump down, back legs folded under, front legs straight.
 * ------------------------------------------------------------------ */

specs.sit_0 = { body: SIT, legs: SIT_LEGS, face: { dy: -1 } };
specs.sit_1 = { body: { ...SIT, cy: 43, h: 15.4 }, legs: SIT_LEGS, face: { dy: -1, mouth: 'cat' } };
specs.sit_2 = { body: { ...SIT, tilt: -0.28 }, legs: SIT_LEGS, face: { dy: -1, eyes: 'dot', mouth: 'o' } };

/* ------------------------------------------------------------------ *
 * chase - the pixel bug floats just out of reach and Pip runs after it
 * ------------------------------------------------------------------ */

const CFACE = { eyes: 'wide', mouth: 'open' };
specs.chase_0 = { body: specs.run_0.body, legs: specs.run_0.legs, face: CFACE, props: [{ name: 'bug', r: 16, c: 52 }] };
specs.chase_1 = { body: specs.run_1.body, legs: specs.run_1.legs, face: CFACE, props: [{ name: 'bug', r: 12, c: 50 }] };
specs.chase_2 = { body: specs.run_2.body, legs: specs.run_2.legs, face: CFACE, props: [{ name: 'bug', r: 10, c: 53 }] };
specs.chase_3 = { body: specs.run_4.body, legs: specs.run_4.legs, face: { ...CFACE, mouth: 'grin' }, props: [{ name: 'bug', r: 14, c: 54 }] };

/* ------------------------------------------------------------------ *
 * juggle - sitting up, a ball tossed and caught on the front paws
 * ------------------------------------------------------------------ */

const JUG_LEGS = { reach: [{ dx: 8, dy: 3 }, { hx: 0, up: 5, dx: 9, dy: -4, over: true, r: 3 }, { dx: 8, dy: 3 }, { hx: 3, up: 5, dx: 10, dy: -4, over: true, r: 3 }] };
specs.juggle_0 = { body: SIT, legs: JUG_LEGS, face: { mouth: 'cat', dy: -3, dx: -2 }, props: [{ name: 'ball', r: 22, c: 44 }] };
specs.juggle_1 = { body: { ...SIT, cy: 42.6 }, legs: { reach: [{ dx: 8, dy: 3 }, { hx: 0, up: 5, dx: 11, dy: -7, over: true, r: 3 }, { dx: 8, dy: 3 }, { hx: 3, up: 5, dx: 12, dy: -8, over: true, r: 3 }] }, face: { mouth: 'open', dy: -3, dx: -2 }, props: [{ name: 'ball', r: 8, c: 44 }] };
specs.juggle_2 = { body: SIT, legs: JUG_LEGS, face: { eyes: 'wide', mouth: 'o', dy: -3, dx: -2 }, props: [{ name: 'ball', r: 4, c: 47 }] };
specs.juggle_3 = { body: { ...SIT, cy: 43.4 }, legs: JUG_LEGS, face: { mouth: 'cat', dy: -2 }, props: [{ name: 'ball', r: 16, c: 46 }] };

/* ------------------------------------------------------------------ *
 * wave - the near front paw comes up and swings hello
 * ------------------------------------------------------------------ */

specs.wave_0 = { body: { ...REST, cy: 40.6 }, legs: { reach: [null, null, null, { hx: 2, up: 3, dx: 11, dy: -7, over: true, r: 3.2 }] }, face: { eyes: 'happy', mouth: 'cat', dy: -1 } };
specs.wave_1 = { body: { ...REST, cy: 40.4, tilt: -0.03 }, legs: { reach: [null, null, null, { hx: 2, up: 3, dx: 9, dy: -11, over: true, r: 3.2 }] }, face: { eyes: 'happy', mouth: 'grin', dy: -1 } };
specs.wave_2 = { body: { ...REST, cy: 40.4 }, legs: { reach: [null, null, null, { hx: 2, up: 3, dx: 13, dy: -8, over: true, r: 3.2 }] }, face: { eyes: 'open', mouth: 'cat', dy: -1 } };

/* ------------------------------------------------------------------ *
 * trip - a stumble over nothing, flat on his face, then up again
 * ------------------------------------------------------------------ */

specs.trip_0 = { body: { ...REST, cx: 33, cy: 41, tilt: 0.16, lean: 1 }, legs: { lift: [0, 4, 4, 0], dx: [0, 5, -3, 0], spread: 1 }, face: { eyes: 'wide', mouth: 'o', brows: 'raised' } };
specs.trip_1 = { body: { cx: 34, cy: 49.6, w: 25.4, h: 9.6, dip: 2, tilt: 0.06 }, legs: { lift: [3, 0, 0, 3], dx: [-3, 5, -4, 4], spread: 2 }, face: { eyes: 'squint', mouth: 'open' } };
specs.trip_2 = { body: { cx: 32, cy: 46.6, w: 24, h: 12, dip: 2.6 }, legs: { spread: 1 }, face: { eyes: 'squint', mouth: 'wavy' } };

/* ------------------------------------------------------------------ *
 * dance - a bouncy side-to-side shuffle
 * ------------------------------------------------------------------ */

specs.dance_0 = { body: { ...REST, cx: 30, cy: 40, h: 15.2, tilt: -0.1 }, legs: { lift: [0, 4, 4, 0], spread: 1 }, face: { eyes: 'happy', mouth: 'cat', dx: -1 } };
specs.dance_1 = { body: { ...REST, cy: 41.6, h: 14.2, w: 22.6 }, legs: { spread: 1 }, face: { eyes: 'happy', mouth: 'grin' } };
specs.dance_2 = { body: { ...REST, cx: 34, cy: 40, h: 15.2, tilt: 0.1 }, legs: { lift: [4, 0, 0, 4], spread: 1 }, face: { eyes: 'happy', mouth: 'cat', dx: 1 } };
specs.dance_3 = { body: { ...REST, cy: 38.6, h: 15.6, w: 21 }, legs: { lift: [3, 3, 3, 3], spread: 1 }, face: { eyes: 'sparkle', mouth: 'grin' } };

/* ------------------------------------------------------------------ *
 * read - sitting down with a little open book
 * ------------------------------------------------------------------ */

const READ_LEGS = { reach: [{ dx: 8, dy: 3 }, { hx: 0, up: 4, dx: 7, dy: 0, over: true, r: 3 }, { dx: 8, dy: 3 }, { hx: 3, up: 4, dx: 8, dy: 0, over: true, r: 3 }] };
specs.read_0 = { body: SIT, legs: READ_LEGS, face: { eyes: 'open', mouth: 'flat', dy: 1 }, props: [{ name: 'book', r: 45, c: 43 }] };
specs.read_1 = { body: { ...SIT, cy: 43 }, legs: READ_LEGS, face: { eyes: 'half', mouth: 'smile', dy: 1 }, props: [{ name: 'book', r: 45, c: 43 }] };
specs.read_2 = { body: SIT, legs: READ_LEGS, face: { eyes: 'dot', mouth: 'o', dy: 1 }, props: [{ name: 'book_turn', r: 44, c: 43 }] };

/* ------------------------------------------------------------------ *
 * nap - a daytime doze: curled up round, legs tucked away
 * ------------------------------------------------------------------ */

specs.nap_0 = { body: CURL, legs: { mode: 'none' }, face: { eyes: 'closed', mouth: 'flat', dx: -3 } };
specs.nap_1 = { body: { ...CURL, cy: 46.1, h: 14.5, w: 18.2 }, legs: { mode: 'none' }, face: { eyes: 'closed', mouth: 'smile', dx: -3 } };

/* ------------------------------------------------------------------ *
 * happy - a crouch, a hop off the floor, a bouncy landing
 * ------------------------------------------------------------------ */

specs.happy_0 = { body: { ...REST, cy: 43, w: 23.4, h: 13.2 }, legs: { spread: 1 }, face: { eyes: 'happy', mouth: 'cat' } };
specs.happy_1 = { body: { ...REST, cy: 35.4, w: 20.6, h: 15.8 }, legs: { lift: [6, 6, 6, 6], dx: [-1, 1, -1, 1] }, face: { eyes: 'happy', mouth: 'grin', dy: -1 } };
specs.happy_2 = { body: { ...REST, cy: 41.8, w: 22.8, h: 14 }, face: { eyes: 'happy', mouth: 'cat' } };

/* ------------------------------------------------------------------ *
 * heart - smitten. Leaning in, heart eyes; the hearts themselves come
 * from the particle layer.
 * ------------------------------------------------------------------ */

specs.heart_0 = { body: { ...REST, cx: 32.6, cy: 40.6, h: 15.2, tilt: 0.03 }, face: { eyes: 'happy', mouth: 'cat', dy: -1 } };
specs.heart_1 = { body: { ...REST, cx: 33.2, cy: 40.2, w: 21.6, h: 15.4, tilt: 0.05 }, legs: { lift: [1, 0, 0, 1] }, face: { eyes: 'heart', mouth: 'cat', dy: -1, dx: 1 } };

/* ------------------------------------------------------------------ *
 * blush - caught out: face turned away, eyes screwed shut
 * ------------------------------------------------------------------ */

specs.blush_0 = { body: { ...REST, cx: 31.4, cy: 41.4, w: 21.4, h: 14.4 }, face: { eyes: 'squint', mouth: 'wavy', dx: -4 } };
specs.blush_1 = { body: { ...REST, cx: 30.6, cy: 41.8, w: 21, h: 14.2, tilt: -0.04 }, legs: { lift: [0, 1, 1, 0] }, face: { eyes: 'happy', mouth: 'pout', dx: -5, dy: 1 } };

/* ------------------------------------------------------------------ *
 * surprise - straight up off the floor, eyes wide
 * ------------------------------------------------------------------ */

specs.surprise_0 = { body: { ...REST, cy: 38, w: 20.6, h: 15.8 }, legs: { lift: [3, 3, 3, 3], spread: 1 }, face: { eyes: 'wide', mouth: 'o', brows: 'raised', dy: -1 } };
specs.surprise_1 = { body: { ...REST, cy: 35.2, w: 20, h: 16.4 }, legs: { lift: [6, 6, 6, 6], spread: 3 }, face: { eyes: 'wide', mouth: 'open', brows: 'raised', dy: -1 } };
specs.surprise_2 = { body: { ...REST, cy: 41.6, w: 22.8, h: 14.2 }, legs: { spread: 1 }, face: { eyes: 'dot', mouth: 'o' } };

/* ------------------------------------------------------------------ *
 * sulk - slumped low, turned away, a pout
 * ------------------------------------------------------------------ */

specs.sulk_0 = { body: { ...REST, cx: 31, cy: 43, w: 22.6, h: 13.4 }, legs: { lift: [1, 1, 1, 1] }, face: { eyes: 'half', brows: 'angry', mouth: 'pout', dy: 1, dx: -2 } };
specs.sulk_1 = { body: { ...REST, cx: 30.6, cy: 43.4, w: 23, h: 13, tilt: -0.03 }, legs: { lift: [2, 2, 2, 2] }, face: { eyes: 'squint', brows: 'angry', mouth: 'pout', dy: 1, dx: -3 } };

/* ------------------------------------------------------------------ *
 * laugh - shaking with it, eyes shut, mouth wide
 * ------------------------------------------------------------------ */

specs.laugh_0 = { body: { ...REST, cy: 40.6, w: 22.2, h: 15 }, face: { eyes: 'happy', mouth: 'grin', dy: -1 } };
specs.laugh_1 = { body: { ...REST, cx: 31, cy: 41.8, w: 23, h: 14, tilt: -0.06 }, legs: { lift: [1, 0, 0, 1] }, face: { eyes: 'squint', mouth: 'grin', dx: -1 } };
specs.laugh_2 = { body: { ...REST, cx: 33, cy: 41, w: 22.6, h: 14.6, tilt: 0.06 }, legs: { lift: [0, 1, 1, 0] }, face: { eyes: 'happy', mouth: 'open', dy: -1, dx: 1 } };

/* ------------------------------------------------------------------ *
 * eat - a cookie, brought in and gone in two bites
 * ------------------------------------------------------------------ */

specs.eat_0 = { body: { ...REST, cy: 41.2 }, face: { eyes: 'wide', mouth: 'open' }, props: [{ name: 'snack', r: 44, c: 53 }] };
specs.eat_1 = { body: { ...REST, cy: 40.8, w: 22.4, h: 15, tilt: 0.04 }, legs: { lift: [0, 1, 1, 0] }, face: { eyes: 'happy', mouth: 'munch' }, props: [{ name: 'snack_bit', r: 45, c: 51 }] };
specs.eat_2 = { body: { ...REST, cy: 41.2, w: 22.6, h: 14.6 }, face: { eyes: 'happy', mouth: 'munch' } };
specs.eat_3 = { body: { ...REST, cy: 40.8, w: 22.2, h: 15 }, face: { eyes: 'happy', mouth: 'cat' } };

/* ------------------------------------------------------------------ *
 * drowsy - fifty minutes in. Half-lidded, sagging, a slow nod.
 * ------------------------------------------------------------------ */

specs.drowsy_0 = { body: { ...REST, cy: 42, w: 22.4, h: 14 }, face: { eyes: 'half', mouth: 'flat' } };
specs.drowsy_1 = { body: { ...REST, cy: 42.6, w: 22.8, h: 13.6, tilt: 0.05 }, legs: { lift: [1, 0, 0, 1] }, face: { eyes: 'half', mouth: 'o', dy: 1 } };
specs.drowsy_2 = { body: { ...REST, cy: 42.2, w: 22.4, h: 14, tilt: 0.08 }, face: { eyes: 'closed', mouth: 'flat', dy: 1 } };

/* ------------------------------------------------------------------ *
 * exhausted - ninety minutes in. Flattened out, legs splayed.
 * ------------------------------------------------------------------ */

specs.exhausted_0 = { body: { cx: 32, cy: 47, w: 24.6, h: 11.2, dip: 2.4 }, legs: { spread: 3 }, face: { eyes: 'half', mouth: 'wavy' } };
specs.exhausted_1 = { body: { cx: 32, cy: 47.8, w: 25.4, h: 10.4, dip: 2.2 }, legs: { spread: 3 }, face: { eyes: 'squint', mouth: 'blep' } };

/* ------------------------------------------------------------------ *
 * thirsty - carrying the cup about, waiting for you to take the hint
 * ------------------------------------------------------------------ */

specs.thirsty_0 = { body: { ...REST, cy: 41 }, legs: { reach: [null, null, null, { hx: 2, up: 5, dx: 8, dy: -2, over: true, r: 3 }] }, face: { eyes: 'open', mouth: 'flat' }, props: [{ name: 'cup', r: 42, c: 52 }] };
specs.thirsty_1 = { body: { ...REST, cy: 40.6, h: 15.2 }, legs: { lift: [0, 1, 1, 0], reach: [null, null, null, { hx: 2, up: 5, dx: 8, dy: -3, over: true, r: 3 }] }, face: { eyes: 'open', mouth: 'wavy', brows: 'worried' }, props: [{ name: 'cup', r: 41, c: 52 }] };

/* ------------------------------------------------------------------ *
 * celebrating - sparkle eyes, a jump and a spin to face you
 * ------------------------------------------------------------------ */

specs.celebrating_0 = { body: { ...REST, cy: 43, w: 23.2, h: 13.4 }, legs: { spread: 1 }, face: { eyes: 'sparkle', mouth: 'cat' } };
specs.celebrating_1 = { body: { ...REST, cy: 34, w: 20.2, h: 16.4 }, legs: { lift: [7, 7, 7, 7], spread: 2 }, face: { eyes: 'sparkle', mouth: 'grin', dy: -1 } };
specs.celebrating_2 = { view: 'front', body: { cy: 34.4, h: 16 }, legs: { lift: [6, 6, 6, 6] }, face: { eyes: 'sparkle', mouth: 'grin' } };
specs.celebrating_3 = { body: { ...REST, cy: 41.4, w: 22.6, h: 14.4 }, face: { eyes: 'sparkle', mouth: 'cat' } };

/* ------------------------------------------------------------------ *
 * onbreak - sitting with a steaming mug, sipping
 * ------------------------------------------------------------------ */

const MUG_LEGS = { reach: [{ dx: 8, dy: 3 }, null, { dx: 8, dy: 3 }, { hx: 3, up: 6, dx: 7, dy: -3, over: true, r: 3 }] };
specs.onbreak_0 = { body: SIT, legs: MUG_LEGS, face: { eyes: 'happy', mouth: 'cat', dy: -1 }, props: [{ name: 'mug', r: 37, c: 48 }] };
specs.onbreak_1 = { body: { ...SIT, tilt: -0.28 }, legs: { reach: [{ dx: 8, dy: 3 }, null, { dx: 8, dy: 3 }, { hx: 2, up: 7, dx: 6, dy: -8, over: true, r: 3 }] }, face: { eyes: 'closed', mouth: 'none', dy: -1 }, props: [{ name: 'mug', r: 33, c: 45 }] };
specs.onbreak_2 = { body: SIT, legs: SIT_LEGS, face: { eyes: 'happy', mouth: 'smile', dy: -1 }, props: [{ name: 'mug', r: 48, c: 48 }] };

/* ------------------------------------------------------------------ *
 * sleeping - curled into the roundest bean of all, breathing slowly
 * ------------------------------------------------------------------ */

specs.sleeping_0 = { body: CURL, legs: { mode: 'none' }, face: { eyes: 'closed', mouth: 'smile', dx: -3 } };
specs.sleeping_1 = { body: { ...CURL, cy: 46, w: 18.1, h: 14.6 }, legs: { mode: 'none' }, face: { eyes: 'closed', mouth: 'smile', dx: -3 } };
specs.sleeping_2 = { body: { ...CURL, cy: 46.6, w: 18.8, h: 14 }, legs: { mode: 'none' }, face: { eyes: 'closed', mouth: 'o', dx: -3 } };

/* ================================================================== *
 * Pip 2.0 - new poses
 * ================================================================== */

/* ---- turn: a front-facing beat when he changes direction ---------- */

specs.turn_0 = { view: 'front', body: { cy: 41, h: 15 } };

/* ---- hop: crouch, launch, tuck, land ------------------------------ */

specs.hop_0 = { body: { ...REST, cy: 44, w: 23.6, h: 12.6 }, legs: { spread: 2 }, face: { eyes: 'squint', mouth: 'flat' } };
specs.hop_1 = { body: { ...REST, cy: 36, w: 20, h: 16.4 }, legs: { lift: [4, 4, 4, 4], dx: [-2, 2, -2, 2] }, face: { eyes: 'open', mouth: 'o' } };
specs.hop_2 = { body: { ...REST, cy: 32, w: 21, h: 15.4 }, legs: { lift: [9, 9, 9, 9], dx: [1, -1, 1, -1] }, face: { eyes: 'happy', mouth: 'grin' } };

/* ---- sneeze: the twitch, the build, the ACHOO --------------------- */

specs.sneeze_0 = { body: { ...REST, cy: 40.4, tilt: -0.06 }, face: { eyes: 'half', mouth: 'o', dy: -1 } };
specs.sneeze_1 = { body: { ...REST, cy: 39, w: 20.6, h: 16.2, tilt: -0.12 }, face: { eyes: 'squint', mouth: 'open', dy: -1 } };
specs.sneeze_2 = { body: { ...REST, cx: 33.5, cy: 43, w: 23.4, h: 13.2, tilt: 0.14 }, legs: { spread: 1 }, face: { eyes: 'squint', mouth: 'grin' } };
specs.sneeze_3 = { body: { ...REST, cy: 41.2 }, face: { eyes: 'half', mouth: 'wavy' } };

/* ---- scratch: sitting, a back foot at an itch --------------------- */

specs.scratch_0 = { body: SIT, legs: { reach: [{ dx: 8, dy: 3 }, null, { hx: 1, up: 2, dx: 10, dy: -10, over: true, r: 3.2 }, null], dx: [0, 2, 0, 4] }, face: { eyes: 'happy', mouth: 'cat', dy: -1 } };
specs.scratch_1 = { body: { ...SIT, cy: 43.4 }, legs: { reach: [{ dx: 8, dy: 3 }, null, { hx: 1, up: 2, dx: 11, dy: -8, over: true, r: 3.2 }, null], dx: [0, 2, 0, 4] }, face: { eyes: 'closed', mouth: 'cat', dy: -1 } };

/* ---- shake: the wet-dog shake-off ---------------------------------- */

specs.shake_0 = { body: { ...REST, cx: 31, w: 21.6, tilt: -0.16 }, legs: { spread: 1 }, face: { eyes: 'squint', mouth: 'wavy', dx: -1 } };
specs.shake_1 = { body: { ...REST, cx: 33, w: 21.6, tilt: 0.16 }, legs: { spread: 1 }, face: { eyes: 'squint', mouth: 'wavy', dx: 1 } };
specs.shake_2 = { body: { ...REST, cy: 40, h: 15.4 }, face: { eyes: 'happy', mouth: 'cat' } };

/* ---- roll: over on his back, paws in the air ----------------------- */

specs.roll_0 = {
  body: { cx: 32, cy: 50, w: 22.4, h: 11.2, dip: 0.6 },
  legs: { up: true, reach: [{ dx: -3, dy: -8 }, { dx: 2, dy: -9 }, { dx: -4, dy: -7 }, { dx: 3, dy: -8 }] },
  face: { eyes: 'happy', mouth: 'grin', dy: 2 },
  noTrait: true
};
specs.roll_1 = {
  body: { cx: 32, cy: 50.4, w: 22.8, h: 10.8, dip: 0.6, tilt: 0.04 },
  legs: { up: true, reach: [{ dx: -1, dy: -9 }, { dx: 4, dy: -7 }, { dx: -2, dy: -8 }, { dx: 5, dy: -9 }] },
  face: { eyes: 'happy', mouth: 'open', dy: 2 },
  noTrait: true
};

/* ---- sniff: nose down, snuffling at the floor ---------------------- */

specs.sniff_0 = { body: { ...REST, cx: 33, cy: 42.4, tilt: 0.2 }, legs: { dx: [0, -1, 0, -1] }, face: { eyes: 'half', mouth: 'o', dy: 2 } };
specs.sniff_1 = { body: { ...REST, cx: 33.4, cy: 43, tilt: 0.24 }, legs: { lift: [0, 1, 1, 0] }, face: { eyes: 'closed', mouth: 'o', dy: 2 } };
specs.sniff_2 = { body: { ...REST, cy: 40.6, tilt: -0.04 }, face: { eyes: 'dot', mouth: 'smile', dy: -1 } };

/* ---- loaf: legs tucked away, perfectly content --------------------- */

specs.loaf_0 = { body: { cx: 32, cy: 47.2, w: 21.6, h: 13.2, dip: 2.6, round: 2.5 }, legs: { mode: 'none' }, face: { eyes: 'half', mouth: 'cat', dy: 1 } };
specs.loaf_1 = { body: { cx: 32, cy: 47, w: 21.4, h: 13.4, dip: 2.6, round: 2.5 }, legs: { mode: 'none' }, face: { eyes: 'closed', mouth: 'cat', dy: 1 } };

/* ---- bounce: boing, boing, boing ------------------------------------ */

specs.bounce_0 = { body: { ...REST, cy: 44.4, w: 24.2, h: 12.4 }, legs: { spread: 2 }, face: { eyes: 'happy', mouth: 'cat' } };
specs.bounce_1 = { body: { ...REST, cy: 38.4, w: 20.4, h: 16.2 }, legs: { lift: [2, 2, 2, 2] }, face: { eyes: 'open', mouth: 'grin' } };
specs.bounce_2 = { body: { ...REST, cy: 34.6, w: 21.4, h: 15.2 }, legs: { lift: [6, 6, 6, 6] }, face: { eyes: 'happy', mouth: 'grin' } };

/* ---- whistle: a tune and a tapping foot ----------------------------- */

specs.whistle_0 = { body: { ...REST, cy: 40.8, tilt: -0.05 }, face: { eyes: 'happy', mouth: 'whistle' } };
specs.whistle_1 = { body: { ...REST, cx: 32.6, cy: 40.6, tilt: -0.02 }, legs: { lift: [0, 0, 0, 2] }, face: { eyes: 'closed', mouth: 'whistle' } };

/* ---- stargaze: sitting up, looking at the night sky ---------------- */

specs.stargaze_0 = { body: { ...SIT, tilt: -0.34 }, legs: SIT_LEGS, face: { eyes: 'sparkle', mouth: 'o', dy: -3, dx: 1 } };
specs.stargaze_1 = { body: { ...SIT, tilt: -0.34, cy: 43 }, legs: SIT_LEGS, face: { eyes: 'sparkle', mouth: 'smile', dy: -3, dx: 1 } };

/* ---- lookatyou: turns round to face you, and waves ----------------- */

specs.lookatyou_0 = { view: 'front', body: { cy: 41, h: 15 } };
specs.lookatyou_1 = { view: 'front', body: { cy: 40.4, h: 15.4 }, face: { eyes: 'happy', mouth: 'cat' } };
specs.lookatyou_2 = { view: 'front', body: { cy: 40.4, h: 15.4 }, legs: { reach: [null, null, null, { dx: 5, dy: -12, over: true, r: 3.2 }] }, face: { eyes: 'happy', mouth: 'grin' } };

/* ---- twirl: a dramatic pirouette ------------------------------------ */

specs.twirl_0 = { body: { ...REST, cy: 40.4, tilt: -0.1, h: 15.2 }, legs: { lift: [0, 2, 0, 3] }, face: { eyes: 'closed', mouth: 'o' } };
specs.twirl_1 = { view: 'front', body: { cy: 39.6, h: 15.6 }, legs: { lift: [2, 2, 1, 1] }, face: { eyes: 'happy', mouth: 'o' } };
specs.twirl_2 = { view: 'front', body: { cy: 39.4, h: 15.8 }, legs: { lift: [2, 2, 1, 1] }, face: { hidden: true } };
specs.twirl_3 = { view: 'front', body: { cy: 40, h: 15.4 }, face: { eyes: 'sparkle', mouth: 'cat' } };

/* ---- gum: bubblegum's signature, a bubble that gets out of hand ---- */

specs.gum_0 = { body: REST, face: { eyes: 'open', mouth: 'o' }, props: [{ name: 'gum_s', r: 42, c: 45 }] };
specs.gum_1 = { body: { ...REST, cy: 40.8 }, face: { eyes: 'dot', mouth: 'o' }, props: [{ name: 'gum_m', r: 40, c: 45 }] };
specs.gum_2 = { body: { ...REST, cy: 40.6, h: 15 }, face: { eyes: 'wide', mouth: 'o', brows: 'raised' }, props: [{ name: 'gum_l', r: 37, c: 44 }] };
specs.gum_3 = { body: { ...REST, cx: 31, cy: 41.4, lean: -1.2 }, face: { eyes: 'squint', mouth: 'open' } };

/* ---- giggle: tickled, squirming ------------------------------------- */

specs.giggle_0 = { body: { ...REST, cx: 31, cy: 41.6, w: 22.6, h: 14.2, tilt: -0.08 }, legs: { lift: [1, 0, 2, 0] }, face: { eyes: 'happy', mouth: 'grin', dx: -1 } };
specs.giggle_1 = { body: { ...REST, cx: 33, cy: 40.8, w: 21.8, h: 15, tilt: 0.08 }, legs: { lift: [0, 2, 0, 1] }, face: { eyes: 'squint', mouth: 'open', dx: 1 } };
specs.giggle_2 = { body: { ...REST, cy: 42, w: 23, h: 13.8 }, legs: { lift: [2, 2, 2, 2] }, face: { eyes: 'happy', mouth: 'grin' } };

/* ---- boop: right on the nose ---------------------------------------- */

specs.boop_0 = { body: { ...REST, cx: 30.6, cy: 40.6, w: 20.6, h: 15.6, lean: -1.5 }, face: { eyes: 'squint', mouth: 'o', dx: -1 } };
specs.boop_1 = { body: { ...REST, cx: 33, w: 22.8, h: 14.4, lean: 1 }, face: { eyes: 'wide', mouth: 'cat' } };
specs.boop_2 = { body: REST, face: { eyes: 'happy', mouth: 'cat' } };

/* ---- angry: puffed up, a stomp, steam ------------------------------- */

specs.angry_0 = { body: { ...REST, cy: 40, w: 23, h: 15.8 }, legs: { spread: 1 }, face: { eyes: 'open', brows: 'angry', mouth: 'frown' } };
specs.angry_1 = { body: { ...REST, cy: 40.4, w: 23.2, h: 15.4 }, legs: { spread: 1, lift: [0, 0, 0, 4] }, face: { eyes: 'open', brows: 'angry', mouth: 'flat' } };
specs.angry_2 = { body: { ...REST, cy: 40.8, w: 23.6, h: 15 }, legs: { spread: 1 }, face: { eyes: 'squint', brows: 'angry', mouth: 'frown' } };

/* ---- sad: slumped, a wobbly lip, a tear ----------------------------- */

specs.sad_0 = { body: { ...REST, cy: 42.4, w: 22.6, h: 13.8, tilt: 0.04 }, face: { eyes: 'teary', brows: 'worried', mouth: 'frown', dy: 1 } };
specs.sad_1 = { body: { ...REST, cy: 42.8, w: 22.8, h: 13.4, tilt: 0.06 }, face: { eyes: 'teary', brows: 'worried', mouth: 'wavy', dy: 1 } };

/* ---- scared: shrunk down, shivering ---------------------------------- */

specs.scared_0 = { body: { ...REST, cx: 31.4, cy: 42, w: 20.2, h: 14 }, legs: { spread: -1 }, face: { eyes: 'wide', brows: 'worried', mouth: 'wavy' } };
specs.scared_1 = { body: { ...REST, cx: 32.6, cy: 42, w: 20.2, h: 14 }, legs: { spread: -1 }, face: { eyes: 'wide', brows: 'worried', mouth: 'wavy' } };

/* ---- proud: chest out, very pleased with himself --------------------- */

specs.proud_0 = { body: { ...REST, cy: 40.2, h: 15.4, tilt: -0.12 }, face: { eyes: 'happy', mouth: 'cat', dy: -1 } };
specs.proud_1 = { body: { ...REST, cy: 39.8, h: 15.6, tilt: -0.14 }, legs: { lift: [0, 0, 0, 1] }, face: { eyes: 'closed', mouth: 'smile', dy: -1 } };

/* ---- confused: a head tilt one way, then the other ------------------- */

specs.confused_0 = { body: { ...REST, cy: 40.8, tilt: -0.1 }, face: { eyes: 'dot', mouth: 'wavy', dy: -1 } };
specs.confused_1 = { body: { ...REST, cy: 40.8, tilt: 0.1 }, face: { eyes: 'dot', mouth: 'pout' } };

/* ---- excited: cannot keep still -------------------------------------- */

specs.excited_0 = { body: { ...REST, cy: 44, w: 23.6, h: 12.6 }, legs: { spread: 2 }, face: { eyes: 'sparkle', mouth: 'grin' } };
specs.excited_1 = { body: { ...REST, cy: 33, w: 20.6, h: 15.6 }, legs: { lift: [8, 8, 8, 8], dx: [-1, 1, -1, 1] }, face: { eyes: 'sparkle', mouth: 'grin', dy: -1 } };

/* ---- queasy: shaken about too much ------------------------------------ */

specs.queasy_0 = { body: { ...REST, cx: 31.2, cy: 41.6, tilt: -0.05 }, face: { eyes: 'swirl', brows: 'worried', mouth: 'wavy' } };
specs.queasy_1 = { body: { ...REST, cx: 32.8, cy: 42, tilt: 0.05 }, face: { eyes: 'half', brows: 'worried', mouth: 'blep' } };

/* ---- bonk: straight into the wall -------------------------------------- */

specs.bonk_0 = { body: { ...REST, cx: 34, w: 19.8, h: 16, lean: -2 }, legs: { spread: -1 }, face: { eyes: 'squint', mouth: 'open' } };
specs.bonk_1 = { body: { ...REST, cy: 42, w: 22.8, h: 13.8 }, face: { eyes: 'swirl', mouth: 'wavy' } };

/* ---- pounce: the butt wiggle, then the leap --------------------------- */

const CROUCH = { ...REST, cx: 31, cy: 45.6, w: 23.6, h: 12.4, tilt: 0.12 };
specs.pounce_ready_0 = { body: CROUCH, legs: { dx: [-2, 3, -2, 4], spread: 1 }, face: { eyes: 'wide', mouth: 'flat', dy: 1 } };
specs.pounce_ready_1 = { body: { ...CROUCH, cx: 30, tilt: 0.08 }, legs: { dx: [-2, 3, -2, 4], spread: 1 }, face: { eyes: 'wide', mouth: 'flat', dy: 1 } };
specs.pounce_ready_2 = { body: { ...CROUCH, cx: 32, tilt: 0.15 }, legs: { dx: [-2, 3, -2, 4], spread: 1 }, face: { eyes: 'wide', mouth: 'cat', dy: 1 } };
specs.pounce_0 = { body: { ...REST, cy: 38, w: 24.6, h: 13, lean: 3 }, legs: { dx: [-7, 4, -7, 5], lift: [2, 4, 2, 4] }, face: { eyes: 'wide', mouth: 'open' } };
specs.pounce_1 = {
  body: { ...REST, cy: 34, w: 24, h: 13.4, lean: 2 },
  legs: { reach: [{ dx: -8, dy: 2 }, { dx: 10, dy: -2 }, { dx: -9, dy: 1 }, { dx: 11, dy: -1 }] },
  face: { eyes: 'wide', mouth: 'grin' }
};
specs.pounce_2 = { body: { ...REST, cx: 33, cy: 45, w: 24, h: 12.6, tilt: 0.1 }, legs: { dx: [0, 5, 0, 6], spread: 1 }, face: { eyes: 'happy', mouth: 'cat' } };

/* ---- work and play at the computer ----------------------------------- */

const TYPE_A = { reach: [{ dx: 8, dy: 3 }, { hx: 0, up: 5, dx: 9, dy: 4, over: true, r: 3 }, { dx: 8, dy: 3 }, { hx: 3, up: 5, dx: 10, dy: 2, over: true, r: 3 }] };
const TYPE_B = { reach: [{ dx: 8, dy: 3 }, { hx: 0, up: 5, dx: 9, dy: 2, over: true, r: 3 }, { dx: 8, dy: 3 }, { hx: 3, up: 5, dx: 10, dy: 4, over: true, r: 3 }] };
const LAPTOP = { name: 'laptop', r: 51, c: 45, under: true };

// typing along with you on a tiny laptop
specs.type_0 = { body: SIT, legs: TYPE_A, face: { eyes: 'open', mouth: 'flat', dy: 1 }, props: [LAPTOP] };
specs.type_1 = { body: { ...SIT, cy: 43.4 }, legs: TYPE_B, face: { eyes: 'open', mouth: 'cat', dy: 1 }, props: [LAPTOP] };
// ...in a hard hat, because something is compiling
specs.code_0 = { body: SIT, legs: TYPE_A, face: { eyes: 'open', mouth: 'flat', dy: 1 }, props: [LAPTOP, { name: 'hardhat', at: 'crown', dy: 3 }] };
specs.code_1 = { body: { ...SIT, cy: 43.4 }, legs: TYPE_B, face: { eyes: 'open', mouth: 'pout', dy: 1 }, props: [LAPTOP, { name: 'hardhat', at: 'crown', dy: 3 }] };

// focus mode: a sweatband and a determined face
const BAND = [{ name: 'headband', r: 29, c: 0 }, { name: 'headband_tail', r: 31, c: 11 }];
specs.focus_0 = { body: REST, face: { eyes: 'open', brows: 'angry', mouth: 'flat' }, props: BAND };
specs.focus_1 = { body: { ...REST, cy: 40.8, h: 15 }, face: { eyes: 'open', brows: 'angry', mouth: 'pout' }, props: BAND };

// watching a video with popcorn
const POP_HOLD = { reach: [{ dx: 8, dy: 3 }, null, { dx: 8, dy: 3 }, { hx: 3, up: 6, dx: 6, dy: -2, over: true, r: 3 }] };
specs.popcorn_0 = { body: SIT, legs: POP_HOLD, face: { eyes: 'open', mouth: 'smile', dy: -1 }, props: [{ name: 'popcorn', r: 45, c: 45 }] };
specs.popcorn_1 = {
  body: SIT,
  legs: { reach: [{ dx: 8, dy: 3 }, null, { dx: 8, dy: 3 }, { hx: 3, up: 7, dx: 4, dy: -6, over: true, r: 3 }] },
  face: { eyes: 'happy', mouth: 'munch', dy: -1 },
  props: [{ name: 'popcorn', r: 46, c: 45 }]
};

// bopping along to music
const PHONES = [{ name: 'headphones', at: 'crown', dy: 4 }];
specs.headbop_0 = { body: { ...REST, cy: 40.4, tilt: -0.05 }, face: { eyes: 'closed', mouth: 'cat' }, props: PHONES };
specs.headbop_1 = { body: { ...REST, cy: 42, w: 22.6, h: 14.2, tilt: 0.06 }, legs: { lift: [0, 0, 0, 2] }, face: { eyes: 'happy', mouth: 'smile' }, props: PHONES };

// painting, beret on, while you design
specs.paint_0 = {
  body: SIT,
  legs: { reach: [{ dx: 8, dy: 3 }, null, { dx: 8, dy: 3 }, { hx: 3, up: 6, dx: 8, dy: -6, over: true, r: 3 }] },
  face: { eyes: 'open', mouth: 'cat', dy: -1 },
  props: [{ name: 'beret', at: 'crown', dy: 3, dx: -2 }, { name: 'canvas', r: 42, c: 53 }, { name: 'brush', r: 34, c: 45 }]
};
specs.paint_1 = {
  body: SIT,
  legs: { reach: [{ dx: 8, dy: 3 }, null, { dx: 8, dy: 3 }, { hx: 3, up: 6, dx: 9, dy: -3, over: true, r: 3 }] },
  face: { eyes: 'happy', mouth: 'cat', dy: -1 },
  props: [{ name: 'beret', at: 'crown', dy: 3, dx: -2 }, { name: 'canvas', r: 42, c: 53 }, { name: 'brush', r: 37, c: 46 }]
};

// scribbling notes while you write
const SCRIB = (dx, dy) => ({ reach: [{ dx: 8, dy: 3 }, null, { dx: 8, dy: 3 }, { hx: 3, up: 3, dx: dx, dy: dy, over: true, r: 3 }] });
specs.scribble_0 = { body: SIT, legs: SCRIB(9, 2), face: { eyes: 'half', mouth: 'flat', dy: 1 }, props: [{ name: 'paper', r: 55, c: 43, under: true }, { name: 'pencil', r: 47, c: 50 }] };
specs.scribble_1 = { body: { ...SIT, cy: 43.4 }, legs: SCRIB(10, 3), face: { eyes: 'half', mouth: 'pout', dy: 1 }, props: [{ name: 'paper', r: 55, c: 43, under: true }, { name: 'pencil', r: 48, c: 52 }] };

// holding up the post
const MAIL_HOLD = { reach: [null, null, null, { hx: 2, up: 5, dx: 8, dy: -2, over: true, r: 3 }] };
specs.mail_0 = { body: REST, legs: MAIL_HOLD, face: { eyes: 'open', mouth: 'o' }, props: [{ name: 'envelope', r: 42, c: 50 }] };
specs.mail_1 = { body: { ...REST, cy: 40.6 }, legs: MAIL_HOLD, face: { eyes: 'happy', mouth: 'cat' }, props: [{ name: 'envelope', r: 41, c: 50 }] };

// playing along on a gamepad
specs.gamepad_0 = { body: SIT, legs: SIT_HOLD, face: { eyes: 'wide', mouth: 'flat', dy: -1 }, props: [{ name: 'gamepad', r: 46, c: 43 }] };
specs.gamepad_1 = { body: { ...SIT, cy: 43.4 }, legs: SIT_HOLD, face: { eyes: 'sparkle', mouth: 'grin', dy: -1 }, props: [{ name: 'gamepad', r: 45, c: 43 }] };

/* ------------------------------------------------------------------ *
 * Nightcap variants
 *
 * Same poses with the nightcap on. The renderer swaps "<frame>" for
 * "<frame>_cap" after 10pm; nothing else about the clip changes.
 * ------------------------------------------------------------------ */

function withNightcap(spec, dx, dy) {
  return { ...spec, props: (spec.props || []).concat([{ name: 'nightcap', at: 'crown', dx: dx, dy: dy }]) };
}

for (const name of ['sleeping_0', 'sleeping_1', 'sleeping_2', 'nap_0', 'nap_1']) {
  specs[name + '_cap'] = withNightcap(specs[name], -5, 3);
}
for (const name of ['drowsy_0', 'drowsy_1', 'drowsy_2']) {
  specs[name + '_cap'] = withNightcap(specs[name], -4, 3);
}

module.exports = { specs, REST, SIT, SIT_LEGS, SIT_HOLD, CURL, TROT_A, TROT_B, DOWN };
