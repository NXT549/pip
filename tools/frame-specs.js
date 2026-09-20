/*
 * frame-specs.js - the hand-tuned pose table Pip's sprites are composed from.
 *
 * This is the file to edit when you want to change how a pose looks.
 * `npm run sprites` feeds every entry here through tools/gen-sprites.js and
 * writes the resulting literal frames into src/renderer/sprites.js.
 *
 * A spec is:
 *   body   {cx, cy, w, h, dip, dipW}   jellybean silhouette (partial override)
 *   legs   {mode, lift:[farBack, farFront, nearBack, nearFront], width, spread,
 *           dx:[4], floor}
 *   face   {eyes, mouth, blush, dx, dy, hidden}
 *   props  [{name, r, c}]
 *   gloss  {dr, dc} | 'none'
 *   rotate 0 | 90 | -90
 *
 * Leg order is always [farBack, farFront, nearBack, nearFront]. A trot moves
 * the diagonal pairs together: (farFront + nearBack), then (farBack + nearFront).
 *
 * Eye styles:   open wide closed half swirl sparkle squint
 * Mouth styles: smile open wavy cat flat none
 * Props:        cup book nightcap ball bug battery snack
 */

'use strict';

/** Resting body. Everything else is a nudge away from this. */
const REST = { cx: 16, cy: 19.5, w: 11, h: 7.4 };

/** Diagonal trot pairs, as leg-lift arrays. */
const TROT_A = [0, 2, 2, 0]; // farFront + nearBack up
const TROT_B = [2, 0, 0, 2]; // farBack + nearFront up
const TROT_DOWN = [0, 0, 0, 0];

const specs = {};

/* ------------------------------------------------------------------ *
 * idle - breathing bob, blink, a look around, a happy wiggle
 * ------------------------------------------------------------------ */

specs.idle_0 = { body: REST };
specs.idle_1 = { body: { ...REST, cy: 19.1, h: 7.6 } };          // breathe in
specs.idle_2 = { body: REST };
specs.idle_3 = { body: { ...REST, cy: 19.8, h: 7.2 } };          // breathe out
specs.idle_blink = { body: REST, face: { eyes: 'closed' } };
specs.idle_look_back = { body: REST, face: { dx: -2 } };
specs.idle_look_up = { body: REST, face: { dy: -1 } };
specs.idle_wiggle_a = { body: { ...REST, cx: 15, cy: 19.2 }, face: { mouth: 'cat' } };
specs.idle_wiggle_b = { body: { ...REST, cx: 17, cy: 19.2 }, face: { mouth: 'cat' } };

/* ------------------------------------------------------------------ *
 * walk - a four-legged trot, body bobbing 1px with each step
 * ------------------------------------------------------------------ */

specs.walk_0 = { body: { ...REST, cy: 18.9 }, legs: { lift: TROT_A } };
specs.walk_1 = { body: REST, legs: { lift: TROT_DOWN } };
specs.walk_2 = { body: { ...REST, cy: 18.9 }, legs: { lift: TROT_B } };
specs.walk_3 = { body: REST, legs: { lift: TROT_DOWN } };

/* ------------------------------------------------------------------ *
 * run - faster steps, body stretched a little longer
 * ------------------------------------------------------------------ */

specs.run_0 = { body: { ...REST, cy: 18.6, w: 12, h: 6.9 }, legs: { lift: [0, 3, 3, 0], spread: 1 } };
specs.run_1 = { body: { ...REST, cy: 19.3, w: 11.6, h: 7.2 }, legs: { lift: TROT_DOWN } };
specs.run_2 = { body: { ...REST, cy: 18.6, w: 12, h: 6.9 }, legs: { lift: [3, 0, 0, 3], spread: 1 } };
specs.run_3 = { body: { ...REST, cy: 19.3, w: 11.6, h: 7.2 }, legs: { lift: TROT_DOWN } };


/* ------------------------------------------------------------------ *
 * dangle - held in the air, all four legs paddling, body stretched tall
 * ------------------------------------------------------------------ */

specs.dangle_0 = {
  body: { ...REST, cy: 18.6, w: 9.8, h: 8.2 },
  legs: { lift: [0, 2, 2, 0], floor: 28, spread: 1 },
  face: { mouth: 'open', eyes: 'wide' }
};
specs.dangle_1 = {
  body: { ...REST, cy: 18.9, w: 10.0, h: 8.0 },
  legs: { lift: [2, 0, 0, 2], floor: 28, spread: 1 },
  face: { mouth: 'open', eyes: 'wide' }
};


/* ------------------------------------------------------------------ *
 * climb - Pip turns sideways against a screen edge and grips with all
 * four legs. rotate:-90 leaves him head-up with his feet pointing right,
 * into the wall he is holding onto. The diagonal pairs reach in turn, so
 * he hauls himself up the same way he trots along the floor.
 * ------------------------------------------------------------------ */

specs.climb_0 = {
  body: { ...REST, cy: 19.3, w: 10.4, h: 7.2 },
  legs: { lift: [0, 3, 3, 0], spread: 1 },
  face: { eyes: 'open', mouth: 'flat' },
  rotate: -90
};
specs.climb_1 = {
  body: { ...REST, cy: 19.6, w: 10.2, h: 7.3 },
  legs: { lift: TROT_DOWN, spread: 1 },
  face: { eyes: 'open', mouth: 'flat' },
  rotate: -90
};
specs.climb_2 = {
  body: { ...REST, cy: 19.3, w: 10.4, h: 7.2 },
  legs: { lift: [3, 0, 0, 3], spread: 1 },
  face: { eyes: 'open', mouth: 'flat' },
  rotate: -90
};

/* ------------------------------------------------------------------ *
 * hang - caught on a ledge. Body stretched tall and narrow, all four
 * legs hanging straight down, only the smallest sway between frames.
 * ------------------------------------------------------------------ */

specs.hang_0 = {
  body: { ...REST, cy: 17.4, w: 9.6, h: 8.4 },
  legs: { lift: [0, 0, 0, 0], spread: 1 },
  face: { eyes: 'open', mouth: 'flat' }
};
specs.hang_1 = {
  body: { ...REST, cx: 16.6, cy: 17.7, w: 9.4, h: 8.5 },
  legs: { lift: [1, 0, 0, 1], spread: 1 },
  face: { eyes: 'open', mouth: 'flat' }
};

/* ------------------------------------------------------------------ *
 * fall - stretched thin, legs splayed wide, eyes wide open
 * ------------------------------------------------------------------ */

specs.fall_0 = {
  body: { ...REST, cy: 18.3, w: 9.4, h: 8.6 },
  legs: { lift: [2, 2, 2, 2], spread: 2, dx: [-1, 1, -1, 1] },
  face: { eyes: 'wide', mouth: 'open' }
};
specs.fall_1 = {
  body: { ...REST, cy: 17.9, w: 9.0, h: 8.9 },
  legs: { lift: [3, 3, 3, 3], spread: 2, dx: [-2, 2, -2, 2] },
  face: { eyes: 'wide', mouth: 'open', dy: -1 }
};

/* ------------------------------------------------------------------ *
 * land - the squash. Flattened and widened on impact, then two frames
 * of spring back up before the clip hands over to idle.
 * ------------------------------------------------------------------ */

specs.land_0 = {
  body: { cx: 16, cy: 23.6, w: 13.2, h: 4.6, dip: 1.4, dipW: 0.6 },
  legs: { lift: [0, 0, 0, 0], spread: 2 },
  face: { eyes: 'squint', mouth: 'flat' }
};
specs.land_1 = {
  body: { cx: 16, cy: 22.1, w: 12.2, h: 5.9, dip: 1.9, dipW: 0.58 },
  legs: { lift: [0, 0, 0, 0], spread: 1 },
  face: { eyes: 'open', mouth: 'open' }
};
specs.land_2 = {
  body: { ...REST, cy: 20.3, w: 11.4, h: 6.9 },
  legs: { lift: [0, 0, 0, 0] },
  face: { eyes: 'open', mouth: 'smile' }
};

/* ------------------------------------------------------------------ *
 * getup - flat on the floor, then up onto the legs again
 * ------------------------------------------------------------------ */

specs.getup_0 = {
  body: { cx: 16, cy: 24.2, w: 12.8, h: 4.3, dip: 1.3, dipW: 0.6 },
  legs: { mode: 'none' },
  face: { eyes: 'squint', mouth: 'wavy' }
};
specs.getup_1 = {
  body: { cx: 16, cy: 22.4, w: 12.0, h: 5.7, dip: 1.8, dipW: 0.58 },
  legs: { lift: [0, 0, 0, 0], spread: 1 },
  face: { eyes: 'half', mouth: 'wavy' }
};
specs.getup_2 = {
  body: { ...REST, cy: 20.1, w: 11.3, h: 7.0 },
  legs: { lift: [0, 0, 0, 0] },
  face: { eyes: 'open', mouth: 'flat' }
};

/* ------------------------------------------------------------------ *
 * dizzy - swirl eyes, body rocking from one side to the other
 * ------------------------------------------------------------------ */

specs.dizzy_0 = {
  body: { ...REST, cx: 15, cy: 19.8 },
  legs: { lift: [0, 1, 1, 0], spread: 1 },
  face: { eyes: 'swirl', mouth: 'wavy', dx: -1 }
};
specs.dizzy_1 = {
  body: { ...REST, cy: 19.3 },
  legs: { lift: [0, 0, 0, 0], spread: 1 },
  face: { eyes: 'swirl', mouth: 'wavy' }
};
specs.dizzy_2 = {
  body: { ...REST, cx: 17, cy: 19.8 },
  legs: { lift: [1, 0, 0, 1], spread: 1 },
  face: { eyes: 'swirl', mouth: 'wavy', dx: 1 }
};
specs.dizzy_3 = {
  body: { ...REST, cy: 19.3 },
  legs: { lift: [0, 0, 0, 0], spread: 1 },
  face: { eyes: 'swirl', mouth: 'wavy' }
};

/* ------------------------------------------------------------------ *
 * stretch - front legs reach forward, back end stays up on straight
 * back legs. The classic play bow, held for a beat and released.
 * ------------------------------------------------------------------ */

specs.stretch_0 = {
  body: { ...REST, cx: 15.6, cy: 19.2, w: 12.2, h: 7.1 },
  legs: { lift: [0, 0, 0, 0], dx: [0, 3, 0, 4], spread: 1 },
  face: { eyes: 'squint', mouth: 'flat' }
};
specs.stretch_1 = {
  body: { ...REST, cx: 15.4, cy: 19.0, w: 13.0, h: 7.2 },
  legs: { lift: [0, 0, 0, 0], dx: [-2, 5, -2, 6], spread: 1 },
  face: { eyes: 'closed', mouth: 'open', dy: 1 }
};
// the bow: chest folded down over short front legs, back legs still straight
specs.stretch_2 = {
  body: { ...REST, cx: 15.4, cy: 20.2, w: 12.8, h: 6.9 },
  legs: { lift: [0, 3, 0, 3], dx: [-2, 5, -2, 6], spread: 1 },
  face: { eyes: 'closed', mouth: 'open', dy: 1 }
};
specs.stretch_3 = {
  body: { ...REST, cx: 15.8, cy: 19.4, w: 11.8, h: 7.2 },
  legs: { lift: [0, 0, 0, 0], dx: [0, 2, 0, 3], spread: 1 },
  face: { eyes: 'squint', mouth: 'smile' }
};

/* ------------------------------------------------------------------ *
 * yawn - body drawn up tall, mouth wide, then a blink and a settle
 * ------------------------------------------------------------------ */

specs.yawn_0 = {
  body: { ...REST, cy: 19.2, w: 10.6, h: 7.6 },
  legs: { lift: [0, 0, 0, 0] },
  face: { eyes: 'half', mouth: 'open' }
};
specs.yawn_1 = {
  body: { ...REST, cy: 18.6, w: 10.2, h: 8.1 },
  legs: { lift: [0, 0, 0, 0] },
  face: { eyes: 'closed', mouth: 'open', dy: -1 }
};
specs.yawn_2 = {
  body: { ...REST, cy: 19.7, w: 11.2, h: 7.2 },
  legs: { lift: [0, 0, 0, 0] },
  face: { eyes: 'half', mouth: 'flat' }
};

/* ------------------------------------------------------------------ *
 * sit - back legs folded away under the body, front legs straight, the
 * rump settled right down on the floor
 * ------------------------------------------------------------------ */

specs.sit_0 = {
  body: { cx: 15.0, cy: 21.0, w: 9.8, h: 7.8, dip: 2.2, dipW: 0.55 },
  legs: { lift: [7, 0, 7, 0], dx: [0, 3, 0, 4] },
  face: { eyes: 'open', mouth: 'smile', dy: -1 }
};
specs.sit_1 = {
  body: { cx: 15.0, cy: 20.8, w: 9.6, h: 8.0, dip: 2.2, dipW: 0.55 },
  legs: { lift: [7, 0, 7, 0], dx: [0, 3, 0, 4] },
  face: { eyes: 'closed', mouth: 'smile', dy: -1 }
};

/* ------------------------------------------------------------------ *
 * chase - a pixel bug floats just out of reach and Pip runs after it
 * ------------------------------------------------------------------ */

specs.chase_0 = {
  body: { ...REST, cy: 18.7, w: 11.8, h: 7.0 },
  legs: { lift: [0, 3, 3, 0], spread: 1 },
  face: { eyes: 'wide', mouth: 'open' },
  props: [{ name: 'bug', r: 12, c: 28 }]
};
specs.chase_1 = {
  body: { ...REST, cy: 19.4, w: 11.4, h: 7.2 },
  legs: { lift: TROT_DOWN, spread: 1 },
  face: { eyes: 'wide', mouth: 'open' },
  props: [{ name: 'bug', r: 10, c: 27 }]
};
specs.chase_2 = {
  body: { ...REST, cy: 18.7, w: 11.8, h: 7.0 },
  legs: { lift: [3, 0, 0, 3], spread: 1 },
  face: { eyes: 'wide', mouth: 'open' },
  props: [{ name: 'bug', r: 9, c: 28 }]
};
specs.chase_3 = {
  body: { ...REST, cy: 19.4, w: 11.4, h: 7.2 },
  legs: { lift: TROT_DOWN, spread: 1 },
  face: { eyes: 'wide', mouth: 'open' },
  props: [{ name: 'bug', r: 11, c: 28 }]
};

/* ------------------------------------------------------------------ *
 * juggle - one ball, thrown up and caught, front paws bobbing under it
 * ------------------------------------------------------------------ */

specs.juggle_0 = {
  body: { ...REST, cy: 19.6 },
  legs: { lift: [0, 2, 0, 2] },
  face: { eyes: 'open', mouth: 'cat', dy: -1 },
  props: [{ name: 'ball', r: 11, c: 19 }]
};
specs.juggle_1 = {
  body: { ...REST, cy: 19.1 },
  legs: { lift: [0, 3, 0, 3] },
  face: { eyes: 'open', mouth: 'cat', dy: -1 },
  props: [{ name: 'ball', r: 6, c: 21 }]
};
specs.juggle_2 = {
  body: { ...REST, cy: 19.6 },
  legs: { lift: [0, 2, 0, 2] },
  face: { eyes: 'open', mouth: 'cat', dy: -1 },
  props: [{ name: 'ball', r: 7, c: 24 }]
};
specs.juggle_3 = {
  body: { ...REST, cy: 19.3 },
  legs: { lift: [0, 3, 0, 3] },
  face: { eyes: 'wide', mouth: 'open', dy: -1 },
  props: [{ name: 'ball', r: 11, c: 24 }]
};

/* ------------------------------------------------------------------ *
 * wave - near front paw lifts off the floor and swings hello
 * ------------------------------------------------------------------ */

specs.wave_0 = {
  body: { ...REST, cy: 19.0 },
  legs: { lift: [0, 0, 0, 2], dx: [0, 0, 0, 2] },
  face: { eyes: 'closed', mouth: 'cat', dy: -1 }
};
specs.wave_1 = {
  body: { ...REST, cy: 18.8 },
  legs: { lift: [0, 0, 0, 4], dx: [0, 0, 0, 4] },
  face: { eyes: 'closed', mouth: 'cat', dy: -1 }
};
specs.wave_2 = {
  body: { ...REST, cy: 19.0 },
  legs: { lift: [0, 0, 0, 2], dx: [0, 0, 0, 3] },
  face: { eyes: 'open', mouth: 'cat', dy: -1 }
};

/* ------------------------------------------------------------------ *
 * trip - a stumble over nothing at all, then flat on his face, then up
 * ------------------------------------------------------------------ */

specs.trip_0 = {
  body: { ...REST, cx: 16.6, cy: 19.0, w: 11.6, h: 7.1 },
  legs: { lift: [0, 4, 4, 0], dx: [0, 3, -2, 0], spread: 1 },
  face: { eyes: 'wide', mouth: 'open' }
};
specs.trip_1 = {
  body: { cx: 16.6, cy: 23.2, w: 12.6, h: 5.1, dip: 1.6, dipW: 0.58 },
  legs: { lift: [2, 0, 0, 2], dx: [-2, 4, -3, 3], spread: 2 },
  face: { eyes: 'squint', mouth: 'open' }
};
specs.trip_2 = {
  body: { cx: 16, cy: 21.6, w: 12.0, h: 6.2, dip: 2.0, dipW: 0.56 },
  legs: { lift: [0, 0, 0, 0], spread: 1 },
  face: { eyes: 'squint', mouth: 'wavy' }
};

/* ------------------------------------------------------------------ *
 * dance - a bounce from side to side, diagonal pairs in turn
 * ------------------------------------------------------------------ */

specs.dance_0 = {
  body: { ...REST, cx: 15, cy: 18.8, h: 7.6 },
  legs: { lift: [0, 3, 3, 0], spread: 1 },
  face: { eyes: 'closed', mouth: 'cat', dx: -1 }
};
specs.dance_1 = {
  body: { ...REST, cy: 19.5 },
  legs: { lift: TROT_DOWN, spread: 1 },
  face: { eyes: 'open', mouth: 'cat' }
};
specs.dance_2 = {
  body: { ...REST, cx: 17, cy: 18.8, h: 7.6 },
  legs: { lift: [3, 0, 0, 3], spread: 1 },
  face: { eyes: 'closed', mouth: 'cat', dx: 1 }
};
specs.dance_3 = {
  body: { ...REST, cy: 19.5 },
  legs: { lift: TROT_DOWN, spread: 1 },
  face: { eyes: 'open', mouth: 'cat' }
};

/* ------------------------------------------------------------------ *
 * read - sitting down with a little open book, eyes on the page
 * ------------------------------------------------------------------ */

specs.read_0 = {
  body: { cx: 15.0, cy: 21.0, w: 9.8, h: 7.8, dip: 2.2, dipW: 0.55 },
  legs: { lift: [7, 0, 7, 0], dx: [0, 3, 0, 4] },
  face: { eyes: 'open', mouth: 'flat' },
  props: [{ name: 'book', r: 25, c: 25 }]
};
specs.read_1 = {
  body: { cx: 15.0, cy: 20.8, w: 9.6, h: 8.0, dip: 2.2, dipW: 0.55 },
  legs: { lift: [7, 0, 7, 0], dx: [0, 3, 0, 4] },
  face: { eyes: 'squint', mouth: 'smile' },
  props: [{ name: 'book', r: 25, c: 25 }]
};
specs.read_2 = {
  body: { cx: 15.0, cy: 21.0, w: 9.8, h: 7.8, dip: 2.2, dipW: 0.55 },
  legs: { lift: [7, 0, 7, 0], dx: [0, 3, 0, 4] },
  face: { eyes: 'open', mouth: 'smile', dy: -1 },
  props: [{ name: 'book', r: 25, c: 25 }]
};

/* ------------------------------------------------------------------ *
 * nap - curled smaller and rounder with his legs tucked in to two
 * little stubs. A short daytime doze, so the face stays soft.
 * ------------------------------------------------------------------ */

specs.nap_0 = {
  body: { cx: 16, cy: 20.8, w: 9.8, h: 7.7, dip: 1.5, dipW: 0.6 },
  legs: { lift: [1, 1, 1, 1], spread: -1 },
  face: { eyes: 'closed', mouth: 'flat', dx: -2 }
};
specs.nap_1 = {
  body: { cx: 16, cy: 20.6, w: 9.6, h: 7.9, dip: 1.5, dipW: 0.6 },
  legs: { lift: [1, 1, 1, 1], spread: -1 },
  face: { eyes: 'closed', mouth: 'flat', dx: -2 }
};

/* ------------------------------------------------------------------ *
 * happy - eyes squeezed shut, cat mouth, a little hop off the floor
 * ------------------------------------------------------------------ */

specs.happy_0 = {
  body: { ...REST, cy: 19.2, h: 7.6 },
  legs: { lift: [0, 0, 0, 0] },
  face: { eyes: 'closed', mouth: 'cat' }
};
specs.happy_1 = {
  body: { ...REST, cy: 17.6, w: 10.4, h: 8.0 },
  legs: { lift: [3, 3, 3, 3] },
  face: { eyes: 'closed', mouth: 'cat', dy: -1 }
};
specs.happy_2 = {
  body: { ...REST, cy: 19.6, w: 11.4, h: 7.2 },
  legs: { lift: [0, 0, 0, 0] },
  face: { eyes: 'closed', mouth: 'cat' }
};

/* ------------------------------------------------------------------ *
 * heart - smitten. Leaning in, cheeks lit up; the hearts themselves
 * come from the particle layer.
 * ------------------------------------------------------------------ */

specs.heart_0 = {
  body: { ...REST, cx: 16.4, cy: 19.2, h: 7.6 },
  legs: { lift: [0, 0, 0, 0] },
  face: { eyes: 'closed', mouth: 'cat', dy: -1 }
};
specs.heart_1 = {
  body: { ...REST, cx: 16.8, cy: 18.9, w: 10.8, h: 7.9 },
  legs: { lift: [1, 0, 0, 1] },
  face: { eyes: 'closed', mouth: 'cat', dy: -1, dx: 1 }
};

/* ------------------------------------------------------------------ *
 * blush - caught out. Face turned away, eyes screwed shut, a wobbly
 * little mouth.
 * ------------------------------------------------------------------ */

specs.blush_0 = {
  body: { ...REST, cx: 15.6, cy: 19.8, w: 10.6, h: 7.2 },
  legs: { lift: [0, 0, 0, 0] },
  face: { eyes: 'squint', mouth: 'wavy', dx: -2 }
};
specs.blush_1 = {
  body: { ...REST, cx: 15.2, cy: 20.0, w: 10.4, h: 7.1 },
  legs: { lift: [0, 1, 1, 0] },
  face: { eyes: 'squint', mouth: 'wavy', dx: -3, dy: 1 }
};

/* ------------------------------------------------------------------ *
 * surprise - straight up off the floor, eyes wide, mouth open
 * ------------------------------------------------------------------ */

specs.surprise_0 = {
  body: { ...REST, cy: 18.2, w: 10.4, h: 8.0 },
  legs: { lift: [3, 3, 3, 3], spread: 1 },
  face: { eyes: 'wide', mouth: 'open', dy: -1 }
};
specs.surprise_1 = {
  body: { ...REST, cy: 17.4, w: 10.0, h: 8.4 },
  legs: { lift: [5, 5, 5, 5], spread: 2 },
  face: { eyes: 'wide', mouth: 'open', dy: -1 }
};
specs.surprise_2 = {
  body: { ...REST, cy: 19.6, w: 11.4, h: 7.2 },
  legs: { lift: [0, 0, 0, 0], spread: 1 },
  face: { eyes: 'wide', mouth: 'open' }
};

/* ------------------------------------------------------------------ *
 * sulk - slumped low, turned away, squinting, mouth all wavy
 * ------------------------------------------------------------------ */

specs.sulk_0 = {
  body: { ...REST, cx: 15.4, cy: 21.0, w: 11.4, h: 6.6 },
  legs: { lift: [1, 1, 1, 1] },
  face: { eyes: 'squint', mouth: 'wavy', dy: 1, dx: -1 }
};
specs.sulk_1 = {
  body: { ...REST, cx: 15.2, cy: 21.3, w: 11.6, h: 6.4 },
  legs: { lift: [2, 2, 2, 2] },
  face: { eyes: 'squint', mouth: 'wavy', dy: 1, dx: -2 }
};

/* ------------------------------------------------------------------ *
 * laugh - shaking with it, eyes shut, mouth wide
 * ------------------------------------------------------------------ */

specs.laugh_0 = {
  body: { ...REST, cy: 19.2, w: 11.2, h: 7.5 },
  legs: { lift: [0, 0, 0, 0] },
  face: { eyes: 'squint', mouth: 'open', dy: -1 }
};
specs.laugh_1 = {
  body: { ...REST, cx: 15.4, cy: 20.0, w: 11.8, h: 7.0 },
  legs: { lift: [1, 0, 0, 1] },
  face: { eyes: 'squint', mouth: 'open', dx: -1 }
};
specs.laugh_2 = {
  body: { ...REST, cx: 16.6, cy: 19.4, w: 11.4, h: 7.4 },
  legs: { lift: [0, 1, 1, 0] },
  face: { eyes: 'squint', mouth: 'open', dy: -1, dx: 1 }
};

/* ------------------------------------------------------------------ *
 * eat - a snack morsel, brought in and gone in two bites
 * ------------------------------------------------------------------ */

specs.eat_0 = {
  body: { ...REST, cy: 19.6 },
  legs: { lift: [0, 0, 0, 0] },
  face: { eyes: 'wide', mouth: 'open' },
  props: [{ name: 'snack', r: 22, c: 28 }]
};
specs.eat_1 = {
  body: { ...REST, cy: 19.3, w: 11.2, h: 7.5 },
  legs: { lift: [0, 1, 1, 0] },
  face: { eyes: 'squint', mouth: 'open' },
  props: [{ name: 'snack', r: 22, c: 26 }]
};
specs.eat_2 = {
  body: { ...REST, cy: 19.4, w: 11.4, h: 7.5 },
  legs: { lift: [0, 0, 0, 0] },
  face: { eyes: 'closed', mouth: 'cat' }
};

/* ------------------------------------------------------------------ *
 * drowsy - fifty minutes in. Half-lidded eyes, body sagging, a slow
 * nod forward and back.
 * ------------------------------------------------------------------ */

specs.drowsy_0 = {
  body: { ...REST, cy: 20.2, w: 11.2, h: 7.0 },
  legs: { lift: [0, 0, 0, 0] },
  face: { eyes: 'half', mouth: 'flat' }
};
specs.drowsy_1 = {
  body: { ...REST, cy: 20.6, w: 11.4, h: 6.8 },
  legs: { lift: [1, 0, 0, 1] },
  face: { eyes: 'half', mouth: 'flat', dy: 1 }
};
specs.drowsy_2 = {
  body: { ...REST, cy: 20.0, w: 11.2, h: 7.1 },
  legs: { lift: [0, 0, 0, 0] },
  face: { eyes: 'closed', mouth: 'flat' }
};

/* ------------------------------------------------------------------ *
 * exhausted - ninety minutes in. Flattened out, legs splayed, no
 * energy left to hold the bean up at all.
 * ------------------------------------------------------------------ */

specs.exhausted_0 = {
  body: { cx: 16, cy: 22.4, w: 12.4, h: 5.6, dip: 1.8, dipW: 0.58 },
  legs: { lift: [0, 0, 0, 0], spread: 2 },
  face: { eyes: 'half', mouth: 'wavy' }
};
specs.exhausted_1 = {
  body: { cx: 16, cy: 22.8, w: 12.8, h: 5.2, dip: 1.6, dipW: 0.58 },
  legs: { lift: [0, 0, 0, 0], spread: 2 },
  face: { eyes: 'squint', mouth: 'wavy' }
};

/* ------------------------------------------------------------------ *
 * thirsty - carrying the cup around, waiting for you to take the hint
 * ------------------------------------------------------------------ */

specs.thirsty_0 = {
  body: { ...REST, cy: 19.5 },
  legs: { lift: [0, 0, 0, 0] },
  face: { eyes: 'open', mouth: 'flat' },
  props: [{ name: 'cup', r: 24, c: 25 }]
};
specs.thirsty_1 = {
  body: { ...REST, cy: 19.1, h: 7.6 },
  legs: { lift: [0, 1, 1, 0] },
  face: { eyes: 'open', mouth: 'wavy' },
  props: [{ name: 'cup', r: 23, c: 25 }]
};

/* ------------------------------------------------------------------ *
 * celebrating - sparkle eyes and a hop. Confetti comes from particles.
 * ------------------------------------------------------------------ */

specs.celebrating_0 = {
  body: { ...REST, cy: 19.0, h: 7.7 },
  legs: { lift: [0, 0, 0, 0] },
  face: { eyes: 'sparkle', mouth: 'open' }
};
specs.celebrating_1 = {
  body: { ...REST, cy: 17.2, w: 10.2, h: 8.2 },
  legs: { lift: [4, 4, 4, 4], spread: 2 },
  face: { eyes: 'sparkle', mouth: 'open', dy: -1 }
};
specs.celebrating_2 = {
  body: { ...REST, cy: 18.4, w: 10.8, h: 7.9 },
  legs: { lift: [2, 2, 2, 2], spread: 1 },
  face: { eyes: 'sparkle', mouth: 'cat' }
};

/* ------------------------------------------------------------------ *
 * onbreak - sitting down with the same cup, tipped up for a sip
 * ------------------------------------------------------------------ */

specs.onbreak_0 = {
  body: { cx: 15.0, cy: 21.0, w: 9.8, h: 7.8, dip: 2.2, dipW: 0.55 },
  legs: { lift: [7, 0, 7, 0], dx: [0, 3, 0, 4] },
  face: { eyes: 'closed', mouth: 'none' },
  props: [{ name: 'cup', r: 22, c: 19 }]
};
specs.onbreak_1 = {
  body: { cx: 15.0, cy: 20.8, w: 9.6, h: 8.0, dip: 2.2, dipW: 0.55 },
  legs: { lift: [7, 0, 7, 0], dx: [0, 3, 0, 4] },
  face: { eyes: 'closed', mouth: 'none', dy: -1 },
  props: [{ name: 'cup', r: 21, c: 19 }]
};
specs.onbreak_2 = {
  body: { cx: 15.0, cy: 21.0, w: 9.8, h: 7.8, dip: 2.2, dipW: 0.55 },
  legs: { lift: [7, 0, 7, 0], dx: [0, 3, 0, 4] },
  face: { eyes: 'closed', mouth: 'smile' },
  props: [{ name: 'cup', r: 25, c: 23 }]
};

/* ------------------------------------------------------------------ *
 * sleeping - curled into the tightest bean of the lot: narrower and
 * rounder than at rest, legs put away entirely, resting on the floor.
 * ------------------------------------------------------------------ */

specs.sleeping_0 = {
  body: { cx: 16, cy: 21.8, w: 9, h: 8, dip: 1.2, dipW: 0.62 },
  legs: { mode: 'none' },
  face: { eyes: 'closed', mouth: 'smile', dx: -2 }
};
specs.sleeping_1 = {
  body: { cx: 16, cy: 21.6, w: 8.8, h: 8.2, dip: 1.2, dipW: 0.62 },
  legs: { mode: 'none' },
  face: { eyes: 'closed', mouth: 'smile', dx: -2 }
};
specs.sleeping_2 = {
  body: { cx: 16, cy: 22.0, w: 9.2, h: 7.8, dip: 1.2, dipW: 0.62 },
  legs: { mode: 'none' },
  face: { eyes: 'closed', mouth: 'smile', dx: -2 }
};

/* ------------------------------------------------------------------ *
 * Nightcap variants
 *
 * Same poses, with the nightcap prop on. Main swaps "<frame>" for
 * "<frame>_cap" after 10pm; nothing else about the clip changes, so the
 * frame lists in animations.js stay as they are.
 * ------------------------------------------------------------------ */

function withNightcap(spec, r, c) {
  return { ...spec, props: (spec.props || []).concat([{ name: 'nightcap', r: r, c: c }]) };
}

// The r values sit the brim on the body's top outline at those columns, so
// the cap reads as worn rather than floating. Re-check them if you move the
// bodies underneath.
specs.sleeping_0_cap = withNightcap(specs.sleeping_0, 13, 18);
specs.sleeping_1_cap = withNightcap(specs.sleeping_1, 13, 18);
specs.sleeping_2_cap = withNightcap(specs.sleeping_2, 13, 18);
specs.nap_0_cap = withNightcap(specs.nap_0, 13, 18);
specs.nap_1_cap = withNightcap(specs.nap_1, 12, 18);
specs.drowsy_0_cap = withNightcap(specs.drowsy_0, 13, 19);
specs.drowsy_1_cap = withNightcap(specs.drowsy_1, 14, 19);
specs.drowsy_2_cap = withNightcap(specs.drowsy_2, 13, 19);

module.exports = { specs, REST, TROT_A, TROT_B, TROT_DOWN };
