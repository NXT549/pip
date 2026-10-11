#!/usr/bin/env node
/*
 * gen-sprites.js - AUTHORING TOOL, not a build step.
 *
 * Pip's frames are composed here from hand-tuned part layers (a parametric
 * jellybean silhouette, leg poses, faces, props) and written out as literal
 * 64-string arrays into src/renderer/sprites.js.
 *
 * Poses are still laid out on Pip's original 32x32 grid: every number in
 * tools/frame-specs.js is in those "Pip units". Each unit is drawn as a
 * DETAIL x DETAIL block of finer pixels, which is what leaves room for the
 * thin outline, the shading, two-highlight eyes and detailed props.
 *
 * Once emitted, src/renderer/sprites.js is the source of truth - it is plain
 * readable data and you can edit any frame by hand. Re-running this tool
 * regenerates the whole file, so if you hand-edit frames, either stop using
 * the tool or fold your edits back into the specs here.
 *
 *   npm run sprites
 */

'use strict';

/** Pip's grid, in Pip units. Every pose coordinate is in these. */
const UNITS = 32;
/** Sprite pixels per Pip unit, each way. */
const DETAIL = 2;
/** The emitted frame size, in sprite pixels. */
const SIZE = UNITS * DETAIL;
const T = '.'; // transparent

/* ------------------------------------------------------------------ *
 * Grid helpers (all in sprite pixels)
 * ------------------------------------------------------------------ */

function newGrid() {
  return Array.from({ length: SIZE }, () => new Array(SIZE).fill(T));
}

function inBounds(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

function put(grid, r, c, ch) {
  if (inBounds(r, c)) grid[r][c] = ch;
}

/**
 * Draw a little picture given as strings, top-left at (r, c). '.' is left
 * alone, so stamps layer over whatever is underneath.
 */
function stamp(grid, r, c, rows) {
  rows.forEach((row, dr) => {
    for (let dc = 0; dc < row.length; dc++) {
      if (row[dc] !== T) put(grid, r + dr, c + dc, row[dc]);
    }
  });
}

function newMask() {
  return Array.from({ length: SIZE }, () => new Array(SIZE).fill(false));
}

/** Union of masks, in place into `into`. */
function maskUnion(into, other) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) if (other[r][c]) into[r][c] = true;
  }
  return into;
}

function inMask(mask, r, c) {
  return inBounds(r, c) && mask[r][c];
}

/**
 * Outline pixels of a mask: mask cells that touch a non-mask cell
 * (4-neighbour) or the frame edge.
 */
function outlineOf(mask) {
  const out = newMask();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!mask[r][c]) continue;
      const edge =
        !inMask(mask, r - 1, c) || !inMask(mask, r + 1, c) ||
        !inMask(mask, r, c - 1) || !inMask(mask, r, c + 1);
      if (edge) out[r][c] = true;
    }
  }
  return out;
}

/**
 * Shave the outer corner off every stair-step in a silhouette.
 *
 * A one-pixel outline traced round a curve doubles up at every diagonal
 * step, which reads as a lumpy, heavier line. Removing the corner pixel
 * where two outline runs meet at a right angle (and the corner points
 * outwards) leaves a clean single-pixel diagonal. Only corners whose two
 * outer sides are both empty are touched, so no fill pixel is ever exposed.
 */
function smoothCorners(mask) {
  mask = trimSpurs(mask);
  const out = mask.map((row) => row.slice());
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!mask[r][c]) continue;
      const up = inMask(mask, r - 1, c);
      const down = inMask(mask, r + 1, c);
      const left = inMask(mask, r, c - 1);
      const right = inMask(mask, r, c + 1);
      const n = (up ? 1 : 0) + (down ? 1 : 0) + (left ? 1 : 0) + (right ? 1 : 0);
      if (n !== 2 || (up && down) || (left && right)) continue;
      // the pixel diagonally inwards has to be filled, or this is a thin
      // spur rather than a corner and removing it would cut the shape
      const dr = up ? -1 : 1;
      const dc = left ? -1 : 1;
      if (!inMask(mask, r + dr, c + dc)) continue;
      out[r][c] = false;
    }
  }
  return out;
}

/**
 * Drop lone pixels that stick out of a silhouette by one pixel (at most one
 * filled neighbour). Sampling the dip in the bean's back can leave a single
 * column a pixel taller than its neighbours, which reads as a stray whisker.
 */
function trimSpurs(mask) {
  const out = mask.map((row) => row.slice());
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!mask[r][c]) continue;
      const n = (inMask(mask, r - 1, c) ? 1 : 0) + (inMask(mask, r + 1, c) ? 1 : 0) +
        (inMask(mask, r, c - 1) ? 1 : 0) + (inMask(mask, r, c + 1) ? 1 : 0);
      if (n <= 1) out[r][c] = false;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The jellybean silhouette
 *
 * An ellipse with a localised dip pushed into the top edge, which gives the
 * gentle inward curve along Pip's back without pinching the bean in half.
 * The shape is sampled at every sprite pixel, so the curve is DETAIL times
 * smoother than the Pip-unit grid it is described on.
 * ------------------------------------------------------------------ */

/** Pip-unit position of a sprite pixel's centre. */
function unitOf(p) {
  return (p + 0.5) / DETAIL - 0.5;
}

function beanMask(body) {
  const { cx, cy, w, h } = body;
  const dip = body.dip === undefined ? 3.5 : body.dip;
  const dipW = body.dipW === undefined ? 0.5 : body.dipW;
  const mask = newMask();
  const colTop = {};
  const colBot = {};

  // Half a unit of slack each way, so the bean covers the same Pip units
  // edge to edge as it did when every unit was one pixel.
  const a = w + 0.5;
  const b = h + 0.5;
  for (let c = 0; c < SIZE; c++) {
    const x = unitOf(c);
    const t = (x - cx) / a;
    if (t <= -1 || t >= 1) continue;
    const e = Math.sqrt(1 - t * t);
    const td = (x - cx) / w;
    const top = cy - b * e + dip * Math.exp(-((td / dipW) * (td / dipW)));
    const bot = cy + b * e;
    let r0 = -1;
    let r1 = -1;
    for (let r = 0; r < SIZE; r++) {
      const y = unitOf(r);
      if (y < top || y > bot) continue;
      mask[r][c] = true;
      if (r0 < 0) r0 = r;
      r1 = r;
    }
    if (r0 < 0) continue;
    colTop[c] = r0;
    colBot[c] = r1;
  }
  return { mask, colTop, colBot };
}

/* ------------------------------------------------------------------ *
 * Legs
 *
 * Four stubby legs with rounded feet. The two far-side legs sit a little
 * behind and a little higher than the near pair, which is what sells the
 * three-quarter view.
 * ------------------------------------------------------------------ */

/**
 * A leg `width` units across, from sprite row `top` down to sprite row
 * `foot` (inclusive). The foot pokes forward into a rounded toe and the
 * heel is rounded off, so it reads as a little foot rather than a post.
 */
function legMask(col, top, foot, width) {
  const mask = newMask();
  const c0 = col * DETAIL;
  const c1 = (col + width) * DETAIL - 1;
  for (let r = top; r <= foot; r++) {
    for (let c = c0; c <= c1; c++) if (inBounds(r, c)) mask[r][c] = true;
  }
  if (foot - top >= DETAIL) {
    // toe: two rows reach a whole unit forward, the row above half of that
    for (let i = 1; i <= DETAIL; i++) {
      put2(mask, foot, c1 + i);
      put2(mask, foot - 1, c1 + i);
    }
    put2(mask, foot - 2, c1 + 1);
    // heel
    if (inBounds(foot, c0)) mask[foot][c0] = false;
  }
  return mask;
}

function put2(mask, r, c) {
  if (inBounds(r, c)) mask[r][c] = true;
}

/* ------------------------------------------------------------------ *
 * Faces
 *
 * Each eye sits in a 3x3-unit box (6x6 sprite pixels) whose top-left is
 * given. Open eyes carry two highlights - a big one up and back, a small
 * one low and forward - which is most of what makes Pip look alive.
 * ------------------------------------------------------------------ */

const EYE_STYLES = {
  open(g, r, c) {
    stamp(g, r, c, [
      '.EEEE.',
      'EWWEEE',
      'EWWEEE',
      'EEEEEE',
      'EEEEWE',
      '.EEEE.'
    ]);
  },
  // taller and more alert (surprise)
  wide(g, r, c) {
    stamp(g, r, c, [
      '.EEEE.',
      'EWWEEE',
      'EWWEEE',
      'EWWEEE',
      'EEEEEE',
      'EEEEEE',
      'EEEEWE',
      '.EEEE.'
    ]);
  },
  // closed happy / sleeping arc
  closed(g, r, c) {
    stamp(g, r + 1, c, [
      '.EEEE.',
      'EE..EE',
      'E....E'
    ]);
  },
  // drowsy: heavy lid across the top, the lower half of the eye peeking out
  half(g, r, c) {
    stamp(g, r, c, [
      'EEEEEE',
      'EEEEEE',
      'EWWEEE',
      '.EEEE.'
    ]);
  },
  // dizzy swirl
  swirl(g, r, c) {
    stamp(g, r, c, [
      '.EEEE.',
      'E....E',
      'E.EE.E',
      'E.E.EE',
      'E.EE..',
      '.E....'
    ]);
  },
  // celebrating sparkle
  sparkle(g, r, c) {
    stamp(g, r, c, [
      '..WW..',
      '..WW..',
      'WWWWWW',
      'WWWWWW',
      '..WW..',
      '..WW..'
    ]);
  },
  // squeezed shut (sulk, laugh, a hard landing)
  squint(g, r, c) {
    stamp(g, r + 2, c, [
      'EEEEEE',
      '.EEEE.'
    ]);
  }
};

/**
 * Mouths sit in the 3-unit gap under and between the eyes; `c` is the
 * sprite column of that gap's left edge.
 */
const MOUTH_STYLES = {
  smile(g, r, c) {
    stamp(g, r, c, [
      'M....M',
      '.MMMM.'
    ]);
  },
  open(g, r, c) {
    stamp(g, r, c, [
      '.MMMM.',
      'MMMMMM',
      'MMKKMM',
      '.MKKM.'
    ]);
  },
  wavy(g, r, c) {
    stamp(g, r, c, [
      '..MM..',
      'MM..MM'
    ]);
  },
  cat(g, r, c) {
    stamp(g, r, c - DETAIL, [
      'M...MM...M',
      '.MMM..MMM.'
    ]);
  },
  flat(g, r, c) {
    stamp(g, r + 1, c, [
      '.MMMM.'
    ]);
  },
  none() {}
};

/* ------------------------------------------------------------------ *
 * Props - small accessories, mostly in the accent colour
 *
 * `r, c` in a spec are Pip units; each prop is drawn from that corner.
 * ------------------------------------------------------------------ */

const PROPS = {
  // a little mug of water, with a shine down one side and a handle
  cup: [
    'OOOOOOO..',
    'OWAAAAOOO',
    'OWAAAAO.O',
    'OWAAAAOOO',
    '.OAAAO...',
    '..OOO....'
  ],
  // an open book, a faint line of text on each page and the cover beneath
  book: [
    '.OOOO....OOOO.',
    'OWWWWOOOOWWWWO',
    'OWAAWWOOWWAAWO',
    'OWWWWWOOWWWWWO',
    'OKKKKKOOKKKKKO',
    '.OOOOOOOOOOOO.'
  ],
  // a striped nightcap drooping forward to a bobble, with a fluffy trim
  // (see PROP_OFFSETS: it is taller than the spot the specs give it)
  nightcap: [
    '...........OOO..',
    '..........OWWWO.',
    '.......OOOOWWWO.',
    '.....OOKKAAOOO..',
    '....OAAKKAAO....',
    '...OAAAKKAAAO...',
    '..OWWWWWWWWWWO..',
    '..OWWWWWWWWWWO..',
    '...OOOOOOOOOO...'
  ],
  // a juggling ball with a stripe round it
  ball: [
    '.OOOO.',
    'OWWAAO',
    'OKKKKO',
    'OAAAAO',
    '.OOOO.'
  ],
  // the floating bug Pip chases: two shiny wings over a little body
  bug: [
    'AA..AA',
    'AWOOWA',
    '.OOOO.',
    '..OO..'
  ],
  // a tiny battery, nearly flat
  battery: [
    'OOOOOOOOOO..',
    'OKKWWWWWWO..',
    'OKKWWWWWWOOO',
    'OKKWWWWWWOOO',
    'OKKWWWWWWO..',
    'OOOOOOOOOO..'
  ],
  // a cookie, chips and all
  snack: [
    '.OO.',
    'OAMO',
    'OMAO',
    '.OO.'
  ]
};

/**
 * Where a prop is drawn relative to its spec position, in sprite pixels.
 * The nightcap grew taller and wider than the spot it was given on the
 * old grid, so it is lifted to keep its trim sitting on Pip's head.
 */
const PROP_OFFSETS = { nightcap: [-3, -2] };

/* ------------------------------------------------------------------ *
 * Frame composition
 * ------------------------------------------------------------------ */

const DEFAULT_BODY = { cx: 16, cy: 19.5, w: 11, h: 7.4, dip: 2.5, dipW: 0.55 };

/** Pip-unit row Pip's near feet rest on. The far pair land one row higher (depth). */
const FLOOR_ROW = 30;

/** Last sprite row of a Pip-unit row. */
function lastRowOf(unitRow) {
  return unitRow * DETAIL + DETAIL - 1;
}

/**
 * Compose one frame and return it as SIZE strings of SIZE chars.
 *
 * spec (every number in Pip units):
 *   body   {cx,cy,w,h,dip,dipW}            partial override of DEFAULT_BODY
 *   legs   {mode, lift:[4], width, spread, dx:[4], floor}
 *   face   {eyes, mouth, blush, dx, dy, hidden}
 *   props  [{name, r, c}]
 *   gloss  {dr, dc} | 'none'
 *   rotate 0 | 90 | -90                    (climbing turns Pip sideways)
 */
function composeFrame(spec) {
  spec = spec || {};
  const body = Object.assign({}, DEFAULT_BODY, spec.body || {});
  const legs = Object.assign(
    { mode: 'stand', lift: [0, 0, 0, 0], width: 3, spread: 0, dx: [0, 0, 0, 0], floor: FLOOR_ROW },
    spec.legs || {}
  );

  const { mask: bodyMask, colTop, colBot } = beanMask(body);
  if (!Object.keys(colTop).length) throw new Error('bean silhouette is empty - check body params');

  const nearBack = Math.round(body.cx - body.w * 0.55) - legs.spread;
  const nearFront = Math.round(body.cx + body.w * 0.30) + legs.spread;

  const farMaskAll = newMask();
  const nearMaskAll = newMask();

  // order: [farBack, farFront, nearBack, nearFront]
  // The far pair sit 2 units further back and land one unit higher, which
  // is what reads as depth in the three-quarter view.
  if (legs.mode !== 'none') {
    const defs = [
      { x: nearBack - 2 + legs.dx[0], lift: legs.lift[0], far: true },
      { x: nearFront - 2 + legs.dx[1], lift: legs.lift[1], far: true },
      { x: nearBack + legs.dx[2], lift: legs.lift[2], far: false },
      { x: nearFront + legs.dx[3], lift: legs.lift[3], far: false }
    ];
    for (const d of defs) {
      // Attach flush to the belly: take the lowest body pixel across the
      // columns this leg covers, then tuck one unit up inside the body.
      let attach = -1;
      for (let c = d.x * DETAIL; c < (d.x + legs.width) * DETAIL; c++) {
        if (colBot[c] !== undefined && colBot[c] > attach) attach = colBot[c];
      }
      if (attach < 0) continue;
      const top = attach - DETAIL;
      const footRow = (d.far ? legs.floor - 1 : legs.floor) - d.lift;
      const foot = Math.max(top, lastRowOf(footRow));
      const m = legMask(d.x, top, foot, legs.width);
      maskUnion(d.far ? farMaskAll : nearMaskAll, m);
    }
  }

  const g = newGrid();

  // far legs first, behind everything, one shade darker
  const far = smoothCorners(farMaskAll);
  const farOutline = outlineOf(far);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!far[r][c]) continue;
      g[r][c] = farOutline[r][c] ? 'O' : 'F';
    }
  }

  // body + near legs share one silhouette so there is no seam between them
  const near = smoothCorners(maskUnion(maskUnion(newMask(), bodyMask), nearMaskAll));
  const nearOutline = outlineOf(near);
  // The line is heavier on the underside: a second pixel of outline below
  // the bean's middle grounds Pip and keeps his chunky look, while the lit
  // top keeps the fine single-pixel line.
  const heavyFrom = Math.round(body.cy * DETAIL);
  const inner = near.map((row, r) => row.map((on, c) => on && !nearOutline[r][c]));
  const innerOutline = outlineOf(inner);
  for (let r = heavyFrom; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) if (innerOutline[r][c]) nearOutline[r][c] = true;
  }
  const footShade = legs.floor * DETAIL - DETAIL;

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!near[r][c]) continue;
      if (nearOutline[r][c]) { g[r][c] = 'O'; continue; }
      if (!bodyMask[r][c]) {
        // legs read as being in the body's shadow, feet darker still
        g[r][c] = r >= footShade ? 'D' : 'B';
        continue;
      }
      g[r][c] = shadeBody(r, c, colTop, colBot);
    }
  }

  // ---- the signature gloss streak ----------------------------------
  // A curved streak riding the top of the back, with a little dot after
  // it, nudged per pose so the shine survives squash, stretch and rotation.
  if (spec.gloss !== 'none') {
    const gl = Object.assign({ dr: 0, dc: 0 }, spec.gloss || {});
    const glossCol = (Math.round(body.cx - body.w * 0.45) + gl.dc) * DETAIL;
    const inside = (r, c) => inBounds(r, c) && near[r][c] && !nearOutline[r][c] && bodyMask[r][c];
    let placed = 0;
    const streak = (c, thick) => {
      const t = colTop[c];
      if (t === undefined) return;
      const r = t + DETAIL * 2 + gl.dr * DETAIL;
      for (let i = 0; i < thick; i++) {
        if (inside(r + i, c)) { g[r + i][c] = 'H'; placed++; }
      }
    };
    // tapered: thin at both ends, two pixels deep along the middle
    [1, 2, 2, 2, 2, 2, 2, 1].forEach((thick, i) => streak(glossCol + i, thick));
    // ...and the dot after it
    streak(glossCol + 10, 2);
    streak(glossCol + 11, 2);
    if (placed < 2) {
      const from = Math.round(body.cx - body.w * 0.75) * DETAIL;
      const to = Math.round(body.cx + body.w * 0.2) * DETAIL;
      for (let c = from; c <= to && placed < 4; c++) {
        const t = colTop[c];
        if (t === undefined) continue;
        for (let r = t + DETAIL; r <= t + DETAIL * 3; r++) {
          if (inside(r, c) && g[r][c] !== 'H') { g[r][c] = 'H'; placed++; break; }
        }
      }
    }
    if (placed < 2) throw new Error('gloss streak could not be placed');
  }

  // ---- face ---------------------------------------------------------
  const face = Object.assign(
    { eyes: 'open', mouth: 'smile', blush: true, dx: 0, dy: 0, hidden: false },
    spec.face || {}
  );
  if (!face.hidden) {
    if (!EYE_STYLES[face.eyes]) throw new Error('unknown eye style: ' + face.eyes);
    if (!MOUTH_STYLES[face.mouth]) throw new Error('unknown mouth style: ' + face.mouth);
    const eyeRow = Math.round(body.cy - 1.5) + face.dy;
    const farEyeCol = Math.round(body.cx + body.w * 0.18) + face.dx;
    const nearEyeCol = farEyeCol + 4;
    EYE_STYLES[face.eyes](g, eyeRow * DETAIL, farEyeCol * DETAIL);
    EYE_STYLES[face.eyes](g, eyeRow * DETAIL, nearEyeCol * DETAIL);
    if (face.blush) {
      const br = (eyeRow + 4) * DETAIL;
      const cheek = ['.KKK', 'KKK.'];
      stamp(g, br, (farEyeCol - 1) * DETAIL, cheek);
      stamp(g, br, (nearEyeCol + 2) * DETAIL, cheek);
    }
    MOUTH_STYLES[face.mouth](g, (eyeRow + 4) * DETAIL, (farEyeCol + 2) * DETAIL);
  }

  // ---- keep the silhouette intact -----------------------------------
  // The face is placed by offset, so on narrower poses a blush or a mouth
  // pixel can land on the body's own outline and punch a notch in Pip's
  // edge. The outline always wins; the face is only ever drawn inside it.
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const ch = g[r][c];
      if (ch !== 'E' && ch !== 'W' && ch !== 'K' && ch !== 'M') continue;
      if (nearOutline[r][c] || farOutline[r][c]) g[r][c] = 'O';
      // ...and a face pixel that missed the body altogether is dropped rather
      // than left floating in the air beside Pip. Props are drawn after this,
      // so a nightcap bobble outside the body is unaffected.
      else if (!near[r][c]) g[r][c] = T;
    }
  }

  // ---- props --------------------------------------------------------
  for (const p of spec.props || []) {
    if (!PROPS[p.name]) throw new Error('unknown prop: ' + p.name);
    const off = PROP_OFFSETS[p.name] || [0, 0];
    stamp(g, p.r * DETAIL + off[0], p.c * DETAIL + off[1], PROPS[p.name]);
  }

  // ---- rotation (climbing turns Pip sideways) -----------------------
  let out = g;
  if (spec.rotate === 90) out = rotate90(g);
  else if (spec.rotate === -90) out = rotate270(g);

  return out.map((row) => row.join(''));
}

/**
 * Body shading. Light catches the top of the bean in a band that follows
 * its curve, the belly falls into shadow along the bottom, and a single
 * row of checkerboard blends each band into the body colour so the bean
 * reads as round rather than striped.
 */
function shadeBody(r, c, colTop, colBot) {
  const fromTop = r - colTop[c];
  const fromBot = colBot[c] - r;
  if (fromTop <= 3) return 'L';
  if (fromBot <= 5) return 'D';
  return 'B';
}

function rotate90(g) {
  const o = newGrid();
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) o[c][SIZE - 1 - r] = g[r][c];
  return o;
}
function rotate270(g) {
  const o = newGrid();
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) o[SIZE - 1 - c][r] = g[r][c];
  return o;
}

module.exports = {
  composeFrame, rotate90, rotate270,
  SIZE, UNITS, DETAIL, DEFAULT_BODY, EYE_STYLES, MOUTH_STYLES, PROPS
};

/* ------------------------------------------------------------------ *
 * CLI
 *
 *   node tools/gen-sprites.js            emit src/renderer/sprites.js
 *   node tools/gen-sprites.js --preview [name]   print one frame as text
 * ------------------------------------------------------------------ */

function bbox(frame) {
  let minC = SIZE, maxC = -1, minR = SIZE, maxR = -1;
  frame.forEach((row, r) => {
    for (let c = 0; c < SIZE; c++) {
      if (row[c] !== T) {
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
      }
    }
  });
  return { minR, maxR, minC, maxC, h: maxR - minR + 1, w: maxC - minC + 1 };
}

function emit() {
  const fs = require('fs');
  const path = require('path');
  const { specs } = require('./frame-specs.js');
  const Palettes = require('../src/renderer/palettes.js');

  const names = Object.keys(specs);
  const frames = {};
  for (const name of names) {
    let f;
    try {
      f = composeFrame(specs[name]);
    } catch (err) {
      throw new Error('frame "' + name + '": ' + err.message);
    }
    // Fail loudly here rather than shipping a broken frame.
    if (f.length !== SIZE) throw new Error('frame "' + name + '" has ' + f.length + ' rows');
    f.forEach((row, i) => {
      if (row.length !== SIZE) throw new Error('frame "' + name + '" row ' + i + ' is ' + row.length + ' chars');
      for (const ch of row) {
        if (!Palettes.isValidKey(ch)) throw new Error('frame "' + name + '" uses unknown palette key "' + ch + '"');
      }
    });
    if (!f.some((row) => row.indexOf('H') !== -1)) throw new Error('frame "' + name + '" lost its gloss streak');
    if (f.every((row) => row === T.repeat(SIZE))) throw new Error('frame "' + name + '" is empty');
    frames[name] = f;
  }

  const lines = [];
  lines.push('/*');
  lines.push(' * sprites.js - every frame of Pip, as plain readable data.');
  lines.push(' *');
  lines.push(' * Each frame is ' + SIZE + ' strings of ' + SIZE + ' characters. Every character is a');
  lines.push(' * palette key from palettes.js and "." means transparent. Frames are drawn');
  lines.push(' * facing right; the renderer flips them horizontally to face left.');
  lines.push(' *');
  lines.push(' * DETAIL is how many sprite pixels make up one of Pip\'s original 32-grid');
  lines.push(' * units. The renderer sizes Pip in those units, so a finer grid adds detail');
  lines.push(' * without making him any bigger on screen.');
  lines.push(' *');
  lines.push(' * Generated by tools/gen-sprites.js from tools/frame-specs.js.');
  lines.push(' * You can edit any frame here by hand - this file is the source of truth');
  lines.push(' * at runtime. Re-running "npm run sprites" regenerates the whole file, so');
  lines.push(' * fold hand edits back into frame-specs.js if you want to keep using it.');
  lines.push(' */');
  lines.push('');
  lines.push("'use strict';");
  lines.push('');
  // Scoped like every other overlay script: they all share one global scope.
  lines.push('// Every overlay script shares one global scope, so nothing here may be');
  lines.push('// declared at the top level - see ARCHITECTURE.md section 1.');
  lines.push('(function () {');
  lines.push('  const FRAME_SIZE = ' + SIZE + ';');
  lines.push('  const DETAIL = ' + DETAIL + ';');
  lines.push('');
  lines.push('  const FRAMES = {');
  names.forEach((name, i) => {
    lines.push('    ' + name + ': [');
    frames[name].forEach((row, r) => {
      lines.push("      '" + row + "'" + (r === SIZE - 1 ? '' : ','));
    });
    lines.push('    ]' + (i === names.length - 1 ? '' : ','));
  });
  lines.push('  };');
  lines.push('');
  lines.push('  const FRAME_NAMES = Object.keys(FRAMES);');
  lines.push('');
  lines.push('  const Sprites = { FRAME_SIZE, DETAIL, FRAMES, FRAME_NAMES };');
  lines.push('');
  lines.push("  if (typeof window !== 'undefined') {");
  lines.push('    window.Pip = window.Pip || {};');
  lines.push('    window.Pip.Sprites = Sprites;');
  lines.push('  }');
  lines.push("  if (typeof module !== 'undefined' && module.exports) {");
  lines.push('    module.exports = Sprites;');
  lines.push('  }');
  lines.push('})();');
  lines.push('');

  const out = path.join(__dirname, '..', 'src', 'renderer', 'sprites.js');
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
  console.log('wrote ' + names.length + ' frames -> src/renderer/sprites.js');
  return names.length;
}

if (require.main === module) {
  if (process.argv[2] === '--preview') {
    const name = process.argv[3];
    let frame;
    if (name) {
      const { specs } = require('./frame-specs.js');
      if (!specs[name]) {
        console.error('no such frame spec: ' + name);
        console.error('available: ' + Object.keys(specs).join(' '));
        process.exit(1);
      }
      frame = composeFrame(specs[name]);
    } else {
      frame = composeFrame({});
    }
    frame.forEach((row, i) => console.log(String(i).padStart(2, ' ') + ' ' + row));
    const b = bbox(frame);
    console.log('bbox rows ' + b.minR + '-' + b.maxR + ' (h=' + b.h + ')  cols ' + b.minC + '-' + b.maxC + ' (w=' + b.w + ')');
  } else {
    try {
      emit();
    } catch (err) {
      console.error('sprite generation failed: ' + err.message);
      process.exit(1);
    }
  }
}
