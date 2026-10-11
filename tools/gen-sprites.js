#!/usr/bin/env node
/*
 * gen-sprites.js - AUTHORING TOOL, not a build step.
 *
 * Pip's frames are composed here from hand-tuned part layers (a parametric
 * jellybean silhouette, leg poses, faces, props) and written out as literal
 * 64-string arrays into src/renderer/sprites.js.
 *
 * Pip is built in two layers. His body - the chunky bean, the legs, the
 * bold outline and the shading bands - is drawn on his original 32x32 grid
 * of "Pip units" and every unit is blown up to a DETAIL x DETAIL block, so
 * he keeps his blocky pixel-art shape. The small things - eyes, mouths,
 * blush, the gloss streak and props - are then drawn at the full sprite
 * resolution on top, which is where the extra detail goes. Every number in
 * tools/frame-specs.js is in Pip units.
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
 * Grid helpers. Each takes the grid size `n` it works on: UNITS for the
 * body layer, SIZE for the detail layer.
 * ------------------------------------------------------------------ */

function newGrid(n) {
  return Array.from({ length: n }, () => new Array(n).fill(T));
}

function newMask(n) {
  return Array.from({ length: n }, () => new Array(n).fill(false));
}

function inBounds(r, c, n) {
  return r >= 0 && r < n && c >= 0 && c < n;
}

function put(grid, r, c, ch) {
  if (inBounds(r, c, grid.length)) grid[r][c] = ch;
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

/** Union of masks, in place into `into`. */
function maskUnion(into, other) {
  const n = into.length;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (other[r][c]) into[r][c] = true;
  }
  return into;
}

/**
 * Outline pixels of a mask: mask cells that touch a non-mask cell
 * (4-neighbour) or the frame edge.
 */
function outlineOf(mask) {
  const n = mask.length;
  const out = newMask(n);
  const on = (r, c) => inBounds(r, c, n) && mask[r][c];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!mask[r][c]) continue;
      if (!on(r - 1, c) || !on(r + 1, c) || !on(r, c - 1) || !on(r, c + 1)) out[r][c] = true;
    }
  }
  return out;
}

/** Blow a unit grid (or mask) up to sprite pixels, DETAIL x DETAIL per unit. */
function upscale(grid) {
  return Array.from({ length: SIZE }, (_, r) =>
    Array.from({ length: SIZE }, (_, c) => grid[Math.floor(r / DETAIL)][Math.floor(c / DETAIL)]));
}

/* ------------------------------------------------------------------ *
 * The jellybean silhouette (Pip units)
 *
 * An ellipse with a localised dip pushed into the top edge, which gives the
 * gentle inward curve along Pip's back without pinching the bean in half.
 * ------------------------------------------------------------------ */

function beanMask(body) {
  const { cx, cy, w, h } = body;
  const dip = body.dip === undefined ? 3.5 : body.dip;
  const dipW = body.dipW === undefined ? 0.5 : body.dipW;
  const mask = newMask(UNITS);
  const colTop = {};
  const colBot = {};

  const c0 = Math.round(cx - w);
  const c1 = Math.round(cx + w);
  for (let c = c0; c <= c1; c++) {
    const t = (c - cx) / w;
    if (t < -1 || t > 1) continue;
    const e = Math.sqrt(Math.max(0, 1 - t * t));
    const top = cy - h * e + dip * Math.exp(-((t / dipW) * (t / dipW)));
    const bot = cy + h * e;
    const r0 = Math.round(top);
    const r1 = Math.round(bot);
    if (r1 < r0) continue;
    for (let r = r0; r <= r1; r++) if (inBounds(r, c, UNITS)) mask[r][c] = true;
    colTop[c] = r0;
    colBot[c] = r1;
  }
  return { mask, colTop, colBot };
}

/* ------------------------------------------------------------------ *
 * Legs (Pip units)
 *
 * Four stubby legs with rounded feet. The two far-side legs sit a little
 * behind and a little higher than the near pair, which is what sells the
 * three-quarter view.
 * ------------------------------------------------------------------ */

/**
 * A leg running from `top` down to `foot` (inclusive), `width` units across.
 * The foot row gains one extra unit forward, which reads as a rounded
 * little foot once the outline pass wraps it.
 */
function legMask(col, top, foot, width) {
  const mask = newMask(UNITS);
  for (let r = top; r <= foot; r++) {
    for (let c = col; c < col + width; c++) if (inBounds(r, c, UNITS)) mask[r][c] = true;
  }
  if (inBounds(foot, col + width, UNITS)) mask[foot][col + width] = true;
  return mask;
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

/** A rosy cheek, under the outer corner of each eye. */
const BLUSH = ['.KKK', 'KKK.'];

/* ------------------------------------------------------------------ *
 * Frame composition
 * ------------------------------------------------------------------ */

const DEFAULT_BODY = { cx: 16, cy: 19.5, w: 11, h: 7.4, dip: 2.5, dipW: 0.55 };

/** Pip-unit row Pip's near feet rest on. The far pair land one row higher (depth). */
const FLOOR_ROW = 30;

/**
 * The body layer, on the unit grid: legs, bean, outline and shading,
 * exactly as Pip has always been built.
 */
function composeBody(body, legs) {
  const { mask: bodyMask, colTop, colBot } = beanMask(body);
  const tops = Object.values(colTop);
  const bots = Object.values(colBot);
  if (!tops.length) throw new Error('bean silhouette is empty - check body params');

  const bodyTop = Math.min.apply(null, tops);
  const bodyBottom = Math.max.apply(null, bots);

  const nearBack = Math.round(body.cx - body.w * 0.55) - legs.spread;
  const nearFront = Math.round(body.cx + body.w * 0.30) + legs.spread;

  const farMaskAll = newMask(UNITS);
  const nearMaskAll = newMask(UNITS);
  const legPixels = newMask(UNITS);

  // order: [farBack, farFront, nearBack, nearFront]
  // The far pair sit 2 units further back and land one row higher, which
  // is what reads as depth in the three-quarter view.
  if (legs.mode !== 'none') {
    const defs = [
      { x: nearBack - 2 + legs.dx[0], lift: legs.lift[0], far: true },
      { x: nearFront - 2 + legs.dx[1], lift: legs.lift[1], far: true },
      { x: nearBack + legs.dx[2], lift: legs.lift[2], far: false },
      { x: nearFront + legs.dx[3], lift: legs.lift[3], far: false }
    ];
    for (const d of defs) {
      // Attach flush to the belly: take the lowest body row across the
      // columns this leg covers, then tuck 1 unit up inside the body.
      let attach = -1;
      for (let c = d.x; c < d.x + legs.width; c++) {
        if (colBot[c] !== undefined && colBot[c] > attach) attach = colBot[c];
      }
      if (attach < 0) continue;
      const top = attach - 1;
      const foot = Math.max(top, (d.far ? legs.floor - 1 : legs.floor) - d.lift);
      const m = legMask(d.x, top, foot, legs.width);
      if (d.far) maskUnion(farMaskAll, m);
      else { maskUnion(nearMaskAll, m); maskUnion(legPixels, m); }
    }
  }

  const g = newGrid(UNITS);

  // far legs first, behind everything, one shade darker
  const farOutline = outlineOf(farMaskAll);
  for (let r = 0; r < UNITS; r++) {
    for (let c = 0; c < UNITS; c++) {
      if (!farMaskAll[r][c]) continue;
      g[r][c] = farOutline[r][c] ? 'O' : 'F';
    }
  }

  // body + near legs share one silhouette so there is no seam between them
  const near = maskUnion(maskUnion(newMask(UNITS), bodyMask), nearMaskAll);
  const nearOutline = outlineOf(near);

  for (let r = 0; r < UNITS; r++) {
    for (let c = 0; c < UNITS; c++) {
      if (!near[r][c]) continue;
      if (nearOutline[r][c]) { g[r][c] = 'O'; continue; }
      if (legPixels[r][c] && !bodyMask[r][c]) {
        // legs read as being in the body's shadow, feet darker still
        g[r][c] = r >= legs.floor - 1 ? 'D' : 'B';
        continue;
      }
      if (r <= bodyTop + 1) g[r][c] = 'L';
      else if (r >= bodyBottom - 3) g[r][c] = 'D';
      else g[r][c] = 'B';
    }
  }

  return { g, near, nearOutline, farOutline, colTop };
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

  const base = composeBody(body, legs);
  const g = upscale(base.g);
  const near = upscale(base.near);
  const nearOutline = upscale(base.nearOutline);
  const farOutline = upscale(base.farOutline);
  const inside = (r, c) => inBounds(r, c, SIZE) && near[r][c] && !nearOutline[r][c];

  // ---- the signature gloss streak ----------------------------------
  // A three-unit streak on the upper-left of the body, with a small glint
  // a unit after it, nudged per pose so the shine survives squash, stretch
  // and rotation. Always at least 2 pixels.
  if (spec.gloss !== 'none') {
    const gl = Object.assign({ dr: 0, dc: 0 }, spec.gloss || {});
    const glossCol = Math.round(body.cx - body.w * 0.45) + gl.dc;
    let placed = 0;
    const shine = (unitR, unitC, rows) => {
      rows.forEach((row, dr) => {
        for (let dc = 0; dc < row.length; dc++) {
          const r = unitR * DETAIL + dr;
          const c = unitC * DETAIL + dc;
          if (row[dc] === 'H' && inside(r, c)) { g[r][c] = 'H'; placed++; }
        }
      });
    };
    const rowAt = (c) => base.colTop[c] === undefined ? undefined : base.colTop[c] + 2 + gl.dr;
    for (let i = 0; i < 3; i++) {
      const r = rowAt(glossCol + i);
      if (r !== undefined) shine(r, glossCol + i, ['HH', 'HH']);
    }
    const glint = rowAt(glossCol + 4);
    if (glint !== undefined) shine(glint, glossCol + 4, ['HH', '..']);
    if (placed < 2) {
      const from = Math.round(body.cx - body.w * 0.75);
      const to = Math.round(body.cx + body.w * 0.2);
      for (let c = from; c <= to && placed < 4; c++) {
        const t = base.colTop[c];
        if (t === undefined) continue;
        for (let r = t + 2; r <= t + 4; r++) {
          const before = placed;
          shine(r, c, ['HH', 'HH']);
          if (placed > before) break;
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
      stamp(g, br, (farEyeCol - 1) * DETAIL, BLUSH);
      stamp(g, br, (nearEyeCol + 2) * DETAIL, BLUSH);
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

function rotate90(g) {
  const o = newGrid(SIZE);
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) o[c][SIZE - 1 - r] = g[r][c];
  return o;
}
function rotate270(g) {
  const o = newGrid(SIZE);
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
