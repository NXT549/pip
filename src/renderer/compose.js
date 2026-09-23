/*
 * compose.js - turns a stored frame into the Pip you actually see.
 *
 * sprites.js holds every pose once, in the default colours, with the face
 * baked in. At runtime Pip is more than that: he is one of fifty types with
 * its own pattern and decoration, his eyes follow the pointer and he blinks
 * in every pose. Pre-generating all of that would be millions of frames, so
 * this module composes it on demand from the stored frame and the metadata
 * the generator wrote beside it (FRAME_META):
 *
 *   1. the type's pattern, painted onto body pixels only
 *   2. the type's trait (a stem, a crown, nubs...) stamped at its anchor
 *   3. open eyes redrawn one pixel toward the pointer
 *   4. or swapped for closed eyes mid-blink
 *
 * Everything here is pure grid work - arrays of palette-key strings in and
 * out - so it runs the same in the overlay, the settings and arcade windows,
 * the icon script and the tests. The eye art lives here, not in the
 * generator, so a redrawn eye is pixel-identical to a generated one.
 */

(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Eyes
   *
   * Every eye is drawn into a 5-wide box. '.' in a template means "leave the
   * pixel underneath alone". Templates are drawn facing right; `mirror` flips
   * the near eye where a style is asymmetric (a squint points inward).
   * ------------------------------------------------------------------ */

  const EYE_W = 5;

  const EYES = {
    open: [
      '.EEE.',
      'EWWEE',
      'EWWEE',
      'EEEEE',
      'EEEEE',
      'EeeWE',
      '.EEE.'
    ],
    wide: [
      '.EEE.',
      'EWWEE',
      'EWWEE',
      'EEEEE',
      'EEEEE',
      'EEEEE',
      'EeeWE',
      '.EEE.'
    ],
    dot: [
      '.....',
      '.....',
      '.EEE.',
      'EWEEE',
      'EEEEE',
      '.EEE.',
      '.....'
    ],
    // resting shut: a soft downward curve, like sleep
    closed: [
      '.....',
      '.....',
      '.....',
      '.....',
      'E...E',
      '.EEE.',
      '.....'
    ],
    // squeezed-shut happy arcs
    happy: [
      '.....',
      '.....',
      '.EEE.',
      'E...E',
      'E...E',
      '.....',
      '.....'
    ],
    // drowsy: the lid has come half way down
    half: [
      '.....',
      '.....',
      '.....',
      'EEEEE',
      'EEEEE',
      'EeeWE',
      '.EEE.'
    ],
    swirl: [
      '.....',
      '.EEE.',
      'E...E',
      'E.E.E',
      'E.EE.',
      '.E...',
      '.....'
    ],
    sparkle: [
      '.EEE.',
      'EEWEE',
      'EWWWE',
      'EEWEE',
      'EEEEE',
      'EeeEE',
      '.EEE.'
    ],
    // > on the far eye, < on the near one
    squint: [
      '.....',
      'E....',
      '.EE..',
      '...EE',
      '.EE..',
      'E....',
      '.....'
    ],
    heart: [
      '.....',
      'TT.TT',
      'TUTTT',
      'TTTTT',
      '.TTT.',
      '..T..',
      '.....'
    ],
    teary: [
      '.EEE.',
      'EWWEE',
      'EWWEE',
      'EEEEE',
      'EEEEE',
      'EPPWE',
      '.PPP.'
    ]
  };

  /** Styles that point one way and must be mirrored on the near eye. */
  const EYE_MIRROR = { squint: true };

  /** Styles the runtime is allowed to redraw (look and blink). */
  const LIVE_EYES = { open: true, wide: true };

  /** The style a blink swaps in. */
  const BLINK_STYLE = 'closed';

  function eyeRows(style, mirror) {
    const rows = EYES[style];
    if (!rows) throw new Error('unknown eye style: ' + style);
    if (!(mirror && EYE_MIRROR[style])) return rows;
    return rows.map((row) => row.split('').reverse().join(''));
  }

  /* ------------------------------------------------------------------ *
   * Grid helpers
   * ------------------------------------------------------------------ */

  const T = '.';

  /** Mutable copy of a frame: an array of char arrays. */
  function toGrid(frame) {
    return frame.map((row) => row.split(''));
  }

  function toRows(grid) {
    return grid.map((row) => row.join(''));
  }

  /** Keys an eye (or a pattern) may be drawn over: body, never outline. */
  const BODY_TONES = { B: 1, L: 1, D: 1, d: 1, h: 1 };
  const PAINTABLE = { B: 1, L: 1, D: 1, d: 1, h: 1, H: 1, X: 1, x: 1 };

  /**
   * Draw an eye template at (r, c), only where the pixel underneath (`under`,
   * the pre-eye grid) is body. That keeps a shifted eye from ever landing on
   * the outline or in the air beside Pip.
   */
  function stampEye(grid, style, r, c, mirror, underAt) {
    const rows = eyeRows(style, mirror);
    for (let dr = 0; dr < rows.length; dr++) {
      for (let dc = 0; dc < rows[dr].length; dc++) {
        const ch = rows[dr][dc];
        if (ch === T) continue;
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= grid.length || cc < 0 || cc >= grid[rr].length) continue;
        const base = underAt ? underAt(rr, cc) : grid[rr][cc];
        if (!PAINTABLE[base]) continue;
        grid[rr][cc] = ch;
      }
    }
  }

  /**
   * Re-draw every live eye in a frame: shifted by look {dx, dy} (each -1..1)
   * and/or blinking. The generator stored what was under each eye before it
   * was drawn, one pixel of margin all round, which is exactly what is needed
   * to lift the old eye off cleanly.
   */
  function redrawEyes(grid, meta, look, blink) {
    if (!meta || !meta.eyes || !meta.eyes.length) return;
    const dx = look ? Math.max(-1, Math.min(1, look.dx | 0)) : 0;
    const dy = look ? Math.max(-1, Math.min(1, look.dy | 0)) : 0;
    if (!dx && !dy && !blink) return;

    for (const eye of meta.eyes) {
      if (!LIVE_EYES[eye.style]) continue;
      const r0 = eye.r - 1, c0 = eye.c - 1;
      const underAt = (rr, cc) => {
        const row = eye.under[rr - r0];
        if (row === undefined) return grid[rr][cc];
        const ch = row[cc - c0];
        return ch === undefined ? grid[rr][cc] : ch;
      };
      // Lift the old eye: restore every pixel its template covered.
      const old = eyeRows(eye.style, eye.mirror);
      for (let dr = 0; dr < old.length; dr++) {
        for (let dc = 0; dc < old[dr].length; dc++) {
          if (old[dr][dc] === T) continue;
          const rr = eye.r + dr, cc = eye.c + dc;
          if (rr < 0 || rr >= grid.length || cc < 0 || cc >= grid[rr].length) continue;
          grid[rr][cc] = underAt(rr, cc);
        }
      }
      if (blink) stampEye(grid, BLINK_STYLE, eye.r, eye.c, eye.mirror, underAt);
      else stampEye(grid, eye.style, eye.r + dy, eye.c + dx, eye.mirror, underAt);
    }
  }

  /* ------------------------------------------------------------------ *
   * Patterns and traits
   * ------------------------------------------------------------------ */

  function lib(name) {
    if (typeof window !== 'undefined' && window.Pip && window.Pip[name]) return window.Pip[name];
    if (typeof require === 'function') {
      try {
        return require('./' + name.toLowerCase() + '.js');
      } catch (err) {
        return null;
      }
    }
    return null;
  }

  /**
   * Map a sprite pixel back into the body's own frame of reference, undoing
   * the climb rotation, so a pattern stays glued to the bean as he turns.
   * Returns {u, v}: -1..1 across the body's width and height.
   */
  function bodyCoords(meta, size, r, c) {
    let rr = r, cc = c;
    if (meta.rotate === -90) { const t = rr; rr = cc; cc = size - 1 - t; }
    else if (meta.rotate === 90) { const t = rr; rr = size - 1 - cc; cc = t; }
    const b = meta.body;
    const x = cc + 0.5 - b.cx, y = rr + 0.5 - b.cy;
    return { u: x / b.w, v: y / b.h, x: x, y: y };
  }

  /**
   * Paint a pattern onto body pixels. `fn(u, v, x, y)` gets the pixel as a
   * fraction of the body ellipse (u, v: -1..1) and in pixels from its centre
   * (x, y) - so a stripe stays put on the bean from frame to frame. It
   * returns false for no pattern, true or 'X' for the pattern colour, or 'Y'
   * for the second colour (a watermelon's rind). Shading is kept: shadowed
   * pixels take the shade key, so a stripe wraps round the bean.
   */
  function applyPattern(grid, meta, fn) {
    if (!fn || !meta || !meta.body) return;
    const size = grid.length;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const ch = grid[r][c];
        if (!BODY_TONES[ch]) continue;
        const p = bodyCoords(meta, size, r, c);
        if (p.u * p.u + p.v * p.v > 1.02) continue;   // legs keep their colour
        const hit = fn(p.u, p.v, p.x, p.y);
        if (!hit) continue;
        const dark = ch === 'D' || ch === 'd';
        if (hit === 'Y') grid[r][c] = dark ? 'Z' : 'Y';
        else grid[r][c] = dark ? 'x' : 'X';
      }
    }
  }

  function rotateSprite(rows, rotate) {
    if (!rotate) return rows;
    const h = rows.length, w = rows[0].length;
    const out = [];
    if (rotate === -90) {
      for (let c = w - 1; c >= 0; c--) {
        let s = '';
        for (let r = 0; r < h; r++) s += rows[r][c];
        out.push(s);
      }
    } else {
      for (let c = 0; c < w; c++) {
        let s = '';
        for (let r = h - 1; r >= 0; r--) s += rows[r][c];
        out.push(s);
      }
    }
    return out;
  }

  /**
   * Stamp a trait sprite. A trait is {rows, ax, ay, anchor, over}: (ax, ay) is
   * the pixel of the sprite that sits on the anchor point. `over` lists the
   * keys the trait may cover; by default only transparent pixels and the
   * outline, so a stem sits on top of the head without eating into the face.
   */
  function stampTrait(grid, meta, trait) {
    if (!trait || !meta) return;
    const points = trait.anchor === 'ends'
      ? [meta.ends && meta.ends.back, meta.ends && meta.ends.front]
      : [meta[trait.anchor || 'crown']];
    const size = grid.length;
    points.forEach((pt, i) => {
      if (!pt) return;
      let rows = trait.rows;
      let ax = trait.ax, ay = trait.ay;
      // The second end of a symmetric trait (lemon nubs) is its mirror image.
      if (trait.anchor === 'ends' && i === 0) {
        rows = rows.map((row) => row.split('').reverse().join(''));
        ax = rows[0].length - 1 - ax;
      }
      if (meta.rotate) {
        const h = rows.length, w = rows[0].length;
        const oldAx = ax, oldAy = ay;
        rows = rotateSprite(rows, meta.rotate);
        if (meta.rotate === -90) { ax = oldAy; ay = w - 1 - oldAx; }
        else { ax = h - 1 - oldAy; ay = oldAx; }
      }
      const over = trait.over || { '.': 1, O: 1, o: 1 };
      for (let dr = 0; dr < rows.length; dr++) {
        for (let dc = 0; dc < rows[dr].length; dc++) {
          const ch = rows[dr][dc];
          if (ch === T) continue;
          const r = pt.r - ay + dr, c = pt.c - ax + dc;
          if (r < 0 || r >= size || c < 0 || c >= size) continue;
          if (!over[grid[r][c]] && !(trait.overBody && PAINTABLE[grid[r][c]])) continue;
          grid[r][c] = ch;
        }
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * The public entry point
   * ------------------------------------------------------------------ */

  /**
   * Compose one frame for display.
   *
   * @param {string} name    frame name in sprites.js
   * @param {object} [opts]
   * @param {string|object} [opts.type]  Pip type id (or the type object)
   * @param {{dx,dy}} [opts.look]        -1..1 each: pupils toward the pointer
   * @param {boolean} [opts.blink]
   * @returns {string[]|null} the composed rows, or null for an unknown frame
   */
  function compose(name, opts) {
    const Sprites = lib('Sprites');
    if (!Sprites || !Sprites.FRAMES[name]) return null;
    return composeRows(Sprites.FRAMES[name], Sprites.FRAME_META ? Sprites.FRAME_META[name] : null, opts);
  }

  /** compose() for a frame you already hold, with its metadata. */
  function composeRows(frame, meta, opts) {
    opts = opts || {};
    const grid = toGrid(frame);

    const type = resolveType(opts.type);
    const Traits = lib('Traits');
    if (type && Traits && meta) {
      if (type.pattern && Traits.PATTERNS[type.pattern]) applyPattern(grid, meta, Traits.PATTERNS[type.pattern]);
      if (type.trait && Traits.TRAITS[type.trait] && !meta.hat) stampTrait(grid, meta, Traits.TRAITS[type.trait]);
    }
    redrawEyes(grid, meta, opts.look, opts.blink);
    return toRows(grid);
  }

  function resolveType(t) {
    if (!t) return null;
    if (typeof t === 'object') return t;
    const Pips = lib('Pips');
    return Pips && Pips.BY_ID ? Pips.BY_ID[t] || null : null;
  }

  /**
   * Rows of palette keys -> RGBA bytes. `alpha` scales every pixel (ghosts).
   * @returns {Uint8ClampedArray} width*height*4
   */
  function toRGBA(rows, palette, alpha) {
    const h = rows.length, w = rows[0].length;
    const out = new Uint8ClampedArray(w * h * 4);
    const cache = Object.create(null);
    const a = alpha === undefined ? 255 : Math.round(255 * alpha);
    for (let r = 0; r < h; r++) {
      const row = rows[r];
      for (let c = 0; c < w; c++) {
        const ch = row[c];
        if (ch === T) continue;
        let rgb = cache[ch];
        if (!rgb) {
          const hex = palette[ch];
          if (!hex) continue;
          rgb = cache[ch] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
        }
        const i = (r * w + c) * 4;
        out[i] = rgb[0]; out[i + 1] = rgb[1]; out[i + 2] = rgb[2]; out[i + 3] = a;
      }
    }
    return out;
  }

  /** Tight bounding box of the opaque pixels. */
  function bbox(rows) {
    let minR = rows.length, maxR = -1, minC = rows[0].length, maxC = -1;
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] === T) continue;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    });
    return { minR, maxR, minC, maxC, w: maxC - minC + 1, h: maxR - minR + 1 };
  }

  const Compose = {
    EYES, EYE_W, EYE_MIRROR, LIVE_EYES, BLINK_STYLE, BODY_TONES,
    eyeRows, stampEye, redrawEyes, applyPattern, stampTrait, rotateSprite,
    bodyCoords, compose, composeRows, toRGBA, bbox, toGrid, toRows
  };

  if (typeof window !== 'undefined') {
    window.Pip = window.Pip || {};
    window.Pip.Compose = Compose;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Compose;
  }
})();
