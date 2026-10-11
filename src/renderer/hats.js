/*
 * hats.js - the little hats Pip can wear.
 *
 * A hat is a tiny character grid, drawn facing right like every frame. It is
 * not baked into sprites.js: dress() lays it over any frame at runtime, so one
 * hat fits all 100-odd poses without a twin of each. It finds the top of
 * Pip's body in the frame and sits the hat's bottom row on that outline,
 * a little towards the face, the same way the nightcap prop is placed.
 *
 * Hats bring their own colours under lowercase keys, so they never collide
 * with the palette's uppercase ones and never change between flavours. `O`
 * is the shared outline. A frame that already wears the nightcap keeps it
 * instead, since he cannot wear two hats.
 */

'use strict';

// Every overlay script shares one global scope, so nothing here may be
// declared at the top level - see ARCHITECTURE.md section 1.
(function () {
  /** The art grid hats are drawn on. A finer grid (see place) scales them up. */
  const GRID = 32;
  const TRANSPARENT = '.';
  /** The palette keys that are Pip's body, and so the top of his head. */
  const BODY = 'BLHD';
  /** How far right of the body's middle a hat sits: over the face, not the tail. */
  const FACE_SHIFT = 2;
  /** Frames drawn turned sideways (climbing), and which way - see frame-specs.js. */
  const ROTATED = /^climb_/;

  /**
   * The hats, in the order Settings shows them. The bottom row of each grid
   * replaces the top outline of Pip's head, so the hat reads as worn.
   */
  const HATS = {
    none: { rows: [], colors: {} },
    party: {
      rows: [
        '...q...',
        '...O...',
        '..OpO..',
        '..OsO..',
        '.OpppO.',
        '.OsssO.',
        'OpppppO'
      ],
      colors: { p: '#4fb8f0', s: '#ffd84a', q: '#ff7eb6' }
    },
    tophat: {
      rows: [
        '..OOOOO..',
        '..OkkkO..',
        '..OkhkO..',
        '..OkkkO..',
        'OOOrrrOOO',
        'OkkkkkkkO'
      ],
      colors: { k: '#3b3448', h: '#5c5470', r: '#e2415a' }
    },
    crown: {
      rows: [
        '.O..O..O.',
        'OyOOyOOyO',
        'OyyyyyyyO',
        'OyjyyyjyO',
        'OzzzzzzzO'
      ],
      colors: { y: '#ffd23f', z: '#e0a91c', j: '#4ad0e0' }
    },
    beanie: {
      rows: [
        '....q....',
        '...OOO...',
        '..OcccO..',
        '.OcccccO.',
        'OdddddddO'
      ],
      colors: { c: '#2fb6a6', d: '#f4ecd8', q: '#ffffff' }
    },
    flower: {
      rows: [
        '.OpO.',
        'OpypO',
        '.OpO.',
        '..g..',
        '.gg..'
      ],
      colors: { p: '#ff9ec4', y: '#ffe36b', g: '#4f9e3a' }
    }
  };

  /** Hat names in display order; 'none' first. */
  const HAT_NAMES = Object.keys(HATS);

  /** Pip starts bare-headed. */
  const DEFAULT_HAT = 'none';

  /**
   * The extra colours a hat needs, to merge over Palettes.resolve().
   * Unknown names give no colours rather than throwing.
   *
   * @param {string} hatName
   * @returns {Object<string,string>} lowercase key -> '#rrggbb'
   */
  function colors(hatName) {
    const hat = HATS[hatName];
    return hat ? Object.assign({}, hat.colors) : {};
  }

  function toGrid(rows) {
    return rows.map((row) => row.split(''));
  }

  /** Quarter turns, matching tools/gen-sprites.js: rotate90 undoes rotate270. */
  function rotate90(g) {
    const n = g.length;
    const o = toGrid(new Array(n).fill(TRANSPARENT.repeat(n)));
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) o[c][n - 1 - r] = g[r][c];
    return o;
  }
  function rotate270(g) {
    const n = g.length;
    const o = toGrid(new Array(n).fill(TRANSPARENT.repeat(n)));
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) o[n - 1 - c][r] = g[r][c];
    return o;
  }

  /**
   * Lay `hat` on an upright grid, in place. False when there is no head to
   * put it on. Hats are drawn for the 32-pixel grid; on a finer grid each hat
   * pixel becomes a k x k block, so a hat stays the same size on screen.
   */
  function place(g, hat) {
    const SIZE = g.length;
    const k = Math.max(1, Math.round(SIZE / GRID));
    // The top of the head: the first body row, and how wide the body is there.
    let top = -1;
    for (let r = 0; r < SIZE && top < 0; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (BODY.indexOf(g[r][c]) !== -1) { top = r; break; }
      }
    }
    if (top < 0) return false;
    // Measure the middle over the first few rows of head, not one row: the
    // gentle dip in the top outline would otherwise pull the hat off centre.
    let left = SIZE;
    let right = -1;
    for (let r = top; r < Math.min(SIZE, top + 4 * k); r++) {
      for (let c = 0; c < SIZE; c++) {
        if (BODY.indexOf(g[r][c]) === -1) continue;
        if (c < left) left = c;
        if (c > right) right = c;
      }
    }

    const h = hat.rows.length * k;
    const w = hat.rows[0].length * k;
    // Worked out in 32-grid pixels, so a finer grid lands on the same spot.
    const c0 = k * Math.round((left + right + 1) / k / 2 + FACE_SHIFT - hat.rows[0].length / 2);

    // Sit the brim on the highest point of the outline underneath it, so the
    // hat rests on the head instead of sinking into it.
    let brim = SIZE;
    for (let c = Math.max(0, c0); c < Math.min(SIZE, c0 + w); c++) {
      for (let r = 0; r < SIZE; r++) {
        if (BODY.indexOf(g[r][c]) !== -1) { brim = Math.min(brim, r - 1); break; }
      }
    }
    if (brim >= SIZE) brim = top - 1;

    for (let hr = 0; hr < h; hr++) {
      const r = brim - (h - 1) + hr;
      if (r < 0 || r >= SIZE) continue;
      for (let hc = 0; hc < w; hc++) {
        const c = c0 + hc;
        const ch = hat.rows[Math.floor(hr / k)][Math.floor(hc / k)];
        if (ch === TRANSPARENT || c < 0 || c >= SIZE) continue;
        g[r][c] = ch;
      }
    }
    return true;
  }

  /**
   * A frame with a hat on. Returns a new array of rows; the frame itself
   * is never changed. Gives the frame back as it was for no hat, an unknown
   * hat, or a pose already wearing the nightcap.
   *
   * @param {string[]} rows      the frame: square, 32 rows or a multiple of 32
   * @param {string} hatName
   * @param {string} [frameName] lets a sideways climbing pose wear it sideways
   * @returns {string[]}
   */
  function dress(rows, hatName, frameName) {
    const hat = HATS[hatName];
    if (!hat || !hat.rows.length || !rows || !rows.length || rows.length % GRID) return rows;
    if (frameName && /_cap$/.test(frameName)) return rows;

    const sideways = !!frameName && ROTATED.test(frameName);
    // A climbing pose is the upright one turned a quarter left, so turn it
    // back, dress it, and turn it again: the hat stays on his head.
    let g = toGrid(rows);
    if (sideways) g = rotate90(g);
    if (!place(g, hat)) return rows;
    if (sideways) g = rotate270(g);
    return g.map((row) => row.join(''));
  }

  const Hats = {
    HATS,
    HAT_NAMES,
    DEFAULT_HAT,
    ROTATED,
    colors,
    dress
  };

  if (typeof window !== 'undefined') {
    window.Pip = window.Pip || {};
    window.Pip.Hats = Hats;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Hats;
  }
})();
