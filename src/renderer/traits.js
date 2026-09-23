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
 *             every colourway. They are skipped while Pip wears a hat.
 *
 *   PATTERNS  fn(u, v, r, c) -> boolean, painted onto body pixels only.
 *             (u, v) run -1..1 across the body ellipse and (r, c) are the
 *             pixel, both in the body's own frame of reference, so a stripe
 *             stays put on the bean when he climbs sideways.
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
    }
  };

  /** A cheap, stable per-pixel hash for speckles, so they never shimmer. */
  function hash(r, c) {
    let h = (r * 374761393 + c * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  const PATTERNS = {
    // licorice twist: diagonal stripes
    twist: (u, v, r, c) => ((c + r) % 9 + 9) % 9 < 3,
    // stripes around the body
    bands: (u, v, r, c) => ((c % 8) + 8) % 8 < 3,
    // scattered seeds or flecks
    speckle: (u, v, r, c) => hash(r, c) < 0.06 && Math.abs(u) < 0.9 && Math.abs(v) < 0.85,
    // polka dots
    dots: (u, v, r, c) => {
      const cx = ((c % 10) + 10) % 10 - 5, cy = (((r + (Math.floor(c / 10) % 2) * 5) % 10) + 10) % 10 - 5;
      return cx * cx + cy * cy <= 4;
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
