/*
 * traits.js - what makes one Pip type look different from another.
 *
 * Two kinds of decoration, both applied at runtime by compose.js onto the
 * same shared frames:
 *
 *   TRAITS    small sprites stamped at an anchor the generator recorded for
 *             every frame - the crown of the head, or both ends of the bean.
 *             (ax, ay) is the pixel of the sprite that sits on the anchor.
 *             Traits use the per-type keys Y/Z (and body keys where a trait
 *             is part of the body, like lemon nubs), so one sprite serves
 *             every colourway. `overBody` lets a trait lie over the top of
 *             the body (a drip, a strawberry's leaves) rather than only
 *             above it. Traits are skipped while Pip wears a hat.
 *
 *   PATTERNS  fn(u, v, x, y) painted onto body pixels only. (u, v) run -1..1
 *             across the body ellipse; (x, y) are pixels from its centre, so
 *             a pattern stays put on the bean from frame to frame. Return
 *             false, true/'X' for the pattern colour, or 'Y' for a second.
 */

(function () {
  'use strict';

  const TRAITS = {
    // a cherry stem with a leaf
    stem_leaf: {
      anchor: 'crown', ax: 5, ay: 8,
      rows: [
        '....OO......',
        '...OZZO.....',
        '...OZO.OOO..',
        '...OZOOYYYO.',
        '...OZOYYYYYO',
        '...OZOYYZZO.',
        '....OZOOOO..',
        '....OZO.....',
        '....OZO.....'
      ]
    },

    // two little leaves
    sprout: {
      anchor: 'crown', ax: 5, ay: 5,
      rows: [
        '.OOO...OOO.',
        'OYYYO.OYYYO',
        'OYYZZOZZYYO',
        '.OOZZZZZOO.',
        '...OOZOO...',
        '....OZO....'
      ]
    },

    // a blueberry's crown
    calyx: {
      anchor: 'crown', ax: 5, ay: 4,
      rows: [
        '.O...O...O.',
        'OYO.OYO.OYO',
        'OYYOYYYOYYO',
        '.OYZZZZZYO.',
        '..OOOOOOO..'
      ]
    },

    // lemon nubs, one on each end (mirrored at the back)
    nubs: {
      anchor: 'ends', ax: 0, ay: 2,
      rows: [
        'OO..',
        'LBO.',
        'BBBO',
        'DDO.',
        'OO..'
      ]
    },

    // a curly grape vine
    vine: {
      anchor: 'crown', ax: 4, ay: 6,
      rows: [
        '.OOO....',
        'OZOZO...',
        'OZO.ZO..',
        '.O..OZO.',
        '....OZO.',
        '...OZO..',
        '...OZO..'
      ]
    },

    // one leaf on a short stem
    leaf: {
      anchor: 'crown', ax: 3, ay: 5,
      rows: [
        '....OOO.',
        '...OYYYO',
        '.O.OYYZO',
        'OZOOYZO.',
        '.OZOOO..',
        '..OZO...'
      ]
    },

    // a strawberry's leafy cap, lying over the top of the head
    leafy_cap: {
      anchor: 'crown', ax: 5, ay: 3, overBody: true,
      rows: [
        '.....O.....',
        '..O.OYO.O..',
        '.OYOYYYOYO.',
        'OYYYYZYYYYO',
        '.OZYZZZYZO.',
        '..OO.O.OO..'
      ]
    },

    // a pair of mint leaves
    mint_leaves: {
      anchor: 'crown', ax: 4, ay: 5,
      rows: [
        'OO.....OO',
        'OYO...OYO',
        'OYYO.OYYO',
        '.OZYOYZO.',
        '..OOZOO..',
        '...OZO...'
      ]
    },

    // a coconut's shaggy tuft
    tuft: {
      anchor: 'crown', ax: 3, ay: 3,
      rows: [
        '.O.O.O.',
        'OYOYOYO',
        '.OYYYO.',
        '..OZO..'
      ]
    },

    // a ribbon bow
    bow: {
      anchor: 'crown', ax: 4, ay: 6,
      rows: [
        'OO.....OO',
        'OYO...OYO',
        'OYYOOOYYO',
        'OYZOYOZYO',
        'OYYOOOYYO',
        'OYO...OYO',
        'OO.....OO'
      ]
    },

    // a little cherry on top
    cherry_top: {
      anchor: 'crown', ax: 3, ay: 7,
      rows: [
        '....OO',
        '...OaO',
        '..OaO.',
        '.OOOO.',
        'ORWRRO',
        'ORRRrO',
        'ORRrrO',
        '.OOOO.'
      ]
    },

    // the foam on a root beer float, spilling over the top
    foam: {
      anchor: 'crown', ax: 7, ay: 3, overBody: true,
      rows: [
        '...OOO..OOO....',
        '..OSSSOOSSSOO..',
        '.OSSWSSSSSWSSO.',
        'OSSSSSSSSSSSSSO',
        'OSGSSSSGSSSSGSO',
        '.OOSGOSSOGSOO..',
        '...OO.OO.OO....'
      ]
    },

    // a pineapple's spiky crown of leaves
    crown_leaves: {
      anchor: 'crown', ax: 5, ay: 7,
      rows: [
        '.....O.....',
        '....OYO....',
        '..O.OYO.O..',
        '.OYOOYOOYO.',
        '..OYOYOYO..',
        '.OYYZYZYYO.',
        '..OOZZZOO..',
        '....OOO....'
      ]
    },

    // a bee, buzzing about just above his head
    bee: {
      anchor: 'crown', ax: 1, ay: 11,
      rows: [
        '...WW.WW.',
        '...WWWWW.',
        '.OOOOOOO.',
        'OQQNNQQNO',
        'OQQNNQQNO',
        '.OOOOOOO.'
      ]
    },

    // caramel dripping down over the top
    drip: {
      anchor: 'crown', ax: 6, ay: 1, overBody: true,
      rows: [
        '.OOOOOOOOOOO.',
        'OYYYYYYYYYYYO',
        'OYYZYYYYZYYYO',
        '.OYO.OYYO.OYO',
        '..O..OYO...O.',
        '.....OYO.....',
        '......O......'
      ]
    },

    // a pumpkin's stubby stem
    stem_thick: {
      anchor: 'crown', ax: 2, ay: 5,
      rows: [
        '..OOO.',
        '.OYYZO',
        '.OYZO.',
        'OYYZO.',
        'OYZZO.',
        '.OOO..'
      ]
    },

    // a sprig of lavender
    sprig: {
      anchor: 'crown', ax: 4, ay: 8,
      rows: [
        '...OO...',
        '..OYYO..',
        '..OYYO..',
        '...OZOO.',
        '..OOZOYO',
        '.OYYZOYO',
        '.OYYZOO.',
        '..OOZO..',
        '....ZO..'
      ]
    },

    // an ice crystal
    snowflake: {
      anchor: 'crown', ax: 3, ay: 7,
      rows: [
        '...O...',
        '.O.W.O.',
        '..WPW..',
        'OWPWPWO',
        '..WPW..',
        '.O.W.O.',
        '...O...'
      ]
    },

    // a little flame
    flame: {
      anchor: 'crown', ax: 3, ay: 6,
      rows: [
        '...O...',
        '..ORO..',
        '..ORQO.',
        '.ORQQRO',
        '.ORQWQO',
        '.ORQQRO',
        '..OOOO.'
      ]
    },

    // a bendy straw
    straw: {
      anchor: 'crown', ax: 4, ay: 6,
      rows: [
        '.OOOO..',
        'OWRWO..',
        '.OOWRO.',
        '...ORO.',
        '...OWO.',
        '...ORO.',
        '...OWO.'
      ]
    },

    // a cherry blossom
    flower: {
      anchor: 'crown', ax: 4, ay: 6,
      rows: [
        '..OO.OO..',
        '.OKKOKKO.',
        '.OKKQKKO.',
        'OKKQQQKKO',
        '.OKKQKKO.',
        '.OKKOKKO.',
        '..OO.OO..'
      ]
    },

    // a music note on a stalk
    note_antenna: {
      anchor: 'crown', ax: 3, ay: 7,
      rows: [
        '..OOOO.',
        '..OYYYO',
        '..OYOO.',
        '..OYO..',
        '.OOYO..',
        'OYYYO..',
        'OYYZO..',
        '.OOO...'
      ]
    },

    // an antenna with a glowing tip
    antenna: {
      anchor: 'crown', ax: 2, ay: 5,
      rows: [
        '.OOO.',
        'OYWYO',
        'OYYYO',
        '.OZO.',
        '.OZO.',
        '.OZO.'
      ]
    },

    // a tiny gold crown
    crown: {
      anchor: 'crown', ax: 5, ay: 5,
      rows: [
        '.O...O...O.',
        'OQO.OQO.OQO',
        'OQQOQRQOQQO',
        'OQQQQQQQQQO',
        'OqqqqqqqqqO',
        '.OOOOOOOOO.'
      ]
    }
  };

  /* ------------------------------------------------------------------ *
   * Patterns
   * ------------------------------------------------------------------ */

  /** A cheap, stable per-pixel hash, so speckles never shimmer. */
  function hash(a, b) {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /** Always-positive modulo. */
  function m(a, n) {
    return ((a % n) + n) % n;
  }

  const fl = Math.floor;

  /** Round dots on a grid of `cell` px, alternate rows offset. */
  function grid(x, y, cell, radius) {
    const row = fl(y / cell);
    const ox = m(row, 2) * (cell / 2);
    const cx = m(x + ox, cell) - cell / 2;
    const cy = m(y, cell) - cell / 2;
    return cx * cx + cy * cy <= radius * radius;
  }

  const PATTERNS = {
    // licorice twist: diagonal stripes
    twist: (u, v, x, y) => m(fl(x + y), 9) < 3,
    // stripes around the body
    bands: (u, v, x, y) => m(fl(x), 8) < 3,
    // scattered flecks
    speckle: (u, v, x, y) => hash(fl(x), fl(y)) < 0.06 && Math.abs(u) < 0.9 && Math.abs(v) < 0.85,
    // polka dots
    dots: (u, v, x, y) => grid(x, y, 10, 2.1),
    // orange-peel dimples
    pores: (u, v, x, y) => hash(fl(x), fl(y)) < 0.035,
    // strawberry seeds: tiny upright pairs
    seeds: (u, v, x, y) => Math.abs(v) < 0.8 && hash(fl(x), fl(y) - m(fl(y), 2)) < 0.055,
    // a spiral, like a swirl of cream
    swirl: (u, v, x, y) => {
      const r = Math.hypot(x, y * 1.6);
      const a = Math.atan2(y * 1.6, x);
      return m(r + a * 4, 7) < 2.4;
    },
    // soft fuzz: a sparse dither
    fuzz: (u, v, x, y) => m(fl(x) + fl(y), 2) === 0 && hash(fl(x), fl(y)) < 0.35,
    // sugar crystals: a few bright specks
    sugar: (u, v, x, y) => hash(fl(x) + 7, fl(y) + 3) < 0.022,
    // a frosty bloom over the top half
    bloom: (u, v, x, y) => v < -0.05 && m(fl(x) + fl(y), 2) === 0 && hash(fl(x), fl(y)) < 0.55,
    // fizz: little bubbles
    fizz: (u, v, x, y) => grid(x + 3, y + 1, 7, 1.1) && hash(fl(x / 7), fl(y / 7)) < 0.6,
    // watermelon: green rind along the bottom, dark seeds above it
    watermelon: (u, v, x, y) => (v > 0.6 ? 'Y' : Math.abs(v) < 0.5 && hash(fl(x), fl(y) - m(fl(y), 2)) < 0.05),
    // two colours of confetti sprinkles
    confetti: (u, v, x, y) => {
      if (hash(fl(x), fl(y)) >= 0.075) return false;
      return hash(fl(y), fl(x)) < 0.5 ? 'X' : 'Y';
    },
    // pineapple crosshatch
    crosshatch: (u, v, x, y) => m(fl(x) + fl(y), 7) === 0 || m(fl(x) - fl(y), 7) === 0,
    // honeycomb dots
    combs: (u, v, x, y) => grid(x, y, 6, 1.2),
    // pumpkin ribs, bending with the body
    ribs: (u, v, x, y) => Math.abs(m(x * (1 + 0.5 * v * v) + 4.5, 9) - 4.5) < 0.7,
    // candy cane: wide diagonal stripes
    candystripe: (u, v, x, y) => m(fl(x - y * 0.8), 10) < 4,
    // crystals: tiny diamonds
    crystals: (u, v, x, y) => {
      const cx = fl(x / 9), cy = fl(y / 9);
      if (hash(cx, cy) > 0.55) return false;
      const dx = Math.abs(m(x, 9) - 4.5), dy = Math.abs(m(y, 9) - 4.5);
      return dx + dy <= 1.5;
    },
    // dragonfruit scales: rows of little arcs
    scales: (u, v, x, y) => {
      const row = fl(y / 4);
      const lx = m(x + m(row, 2) * 3, 6) - 3;
      const ly = m(y, 4);
      const d = Math.hypot(lx, ly - 0.5);
      return ly >= 1 && d > 2 && d < 3;
    },
    // toffee marble
    marble: (u, v, x, y) => Math.sin(x * 0.35 + Math.sin(y * 0.5) * 2.2) > 0.62,
    // stars, and a faint nebula between them
    starfield: (u, v, x, y) => {
      if (hash(fl(x) + 11, fl(y) + 5) < 0.028) return 'X';
      return Math.sin(x * 0.2 + y * 0.35) > 0.82 && m(fl(x) + fl(y), 2) === 0 ? 'Y' : false;
    },
    // rainbow bands
    rainbow: (u, v, x, y) => {
      const band = m(fl((y + 40) / 4), 3);
      return band === 1 ? 'X' : band === 2 ? 'Y' : false;
    },
    // circuit traces
    circuit: (u, v, x, y) => {
      const xi = fl(x), yi = fl(y);
      if (m(yi, 7) === 0 && hash(fl(xi / 5), yi) < 0.6) return true;
      if (m(xi, 9) === 0 && hash(xi, fl(yi / 4)) < 0.5) return true;
      return m(xi, 9) === 0 && m(yi, 7) === 0 ? 'Y' : false;
    },
    // aurora ribbons
    aurora: (u, v, x, y) => {
      const band = m(fl((y + 3 * Math.sin(x * 0.25) + 40) / 3.5), 4);
      return band === 1 ? 'X' : band === 3 ? 'Y' : false;
    },
    // glowing cracks between cooled plates of rock
    cracks: (u, v, x, y) => {
      const cell = 8;
      const gx = fl(x / cell), gy = fl(y / cell);
      let d1 = Infinity, d2 = Infinity;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const px = (gx + i + hash(gx + i, gy + j)) * cell;
          const py = (gy + j + hash(gy + j, gx + i + 31)) * cell;
          const d = Math.hypot(x - px, y - py);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
      }
      return d2 - d1 < 1.1;
    },
    // holographic foil
    holo: (u, v, x, y) => {
      const s = m(fl(x + y), 6);
      return s === 0 ? 'X' : s === 3 ? 'Y' : false;
    }
  };

  const Traits = { TRAITS, PATTERNS, hash };

  if (typeof window !== 'undefined') {
    window.Pip = window.Pip || {};
    window.Pip.Traits = Traits;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Traits;
  }
})();
