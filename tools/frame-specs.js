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

module.exports = { specs, REST, TROT_A, TROT_B, TROT_DOWN };
