#!/usr/bin/env node
/*
 * gen-sprites.js - AUTHORING TOOL, not a build step.
 *
 * Pip's frames are composed here from hand-tuned part layers (a parametric
 * jellybean silhouette, leg poses, faces, props) and written out as literal
 * 32-string arrays into src/renderer/sprites.js.
 *
 * Once emitted, src/renderer/sprites.js is the source of truth - it is plain
 * readable data and you can edit any frame by hand. Re-running this tool
 * regenerates the whole file, so if you hand-edit frames, either stop using
 * the tool or fold your edits back into the specs here.
 *
 *   npm run sprites
 */

'use strict';

const SIZE = 32;
const T = '.'; // transparent

/* ------------------------------------------------------------------ *
 * Grid helpers
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
        !inBounds(r - 1, c) || !mask[r - 1][c] ||
        !inBounds(r + 1, c) || !mask[r + 1][c] ||
        !inBounds(r, c - 1) || !mask[r][c - 1] ||
        !inBounds(r, c + 1) || !mask[r][c + 1];
      if (edge) out[r][c] = true;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The jellybean silhouette
 *
 * An ellipse with a localised dip pushed into the top edge, which gives the
 * gentle inward curve along Pip's back without pinching the bean in half.
 * ------------------------------------------------------------------ */

function beanMask(body) {
  const { cx, cy, w, h } = body;
  const dip = body.dip === undefined ? 3.5 : body.dip;
  const dipW = body.dipW === undefined ? 0.5 : body.dipW;
  const mask = newMask();
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
    for (let r = r0; r <= r1; r++) if (inBounds(r, c)) mask[r][c] = true;
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
 * A leg running from `top` down to `foot` (inclusive), `width` px across.
 * The foot row gains one extra pixel forward, which reads as a rounded
 * little foot once the outline pass wraps it.
 */
function legMask(col, top, foot, width) {
  const mask = newMask();
  for (let r = top; r <= foot; r++) {
    for (let c = col; c < col + width; c++) if (inBounds(r, c)) mask[r][c] = true;
  }
  if (inBounds(foot, col + width)) mask[foot][col + width] = true;
  return mask;
}

/* ------------------------------------------------------------------ *
 * Faces
 * ------------------------------------------------------------------ */

const EYE_STYLES = {
  // 3x3 round eye, white highlight in the upper-left corner
  open(g, r, c) {
    for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) put(g, r + dr, c + dc, 'E');
    put(g, r, c, 'W');
  },
  // taller and more alert (surprise)
  wide(g, r, c) {
    for (let dr = 0; dr < 4; dr++) for (let dc = 0; dc < 3; dc++) put(g, r + dr, c + dc, 'E');
    put(g, r, c, 'W');
  },
  // closed happy / sleeping arc
  closed(g, r, c) {
    put(g, r + 1, c, 'E');
    put(g, r, c + 1, 'E');
    put(g, r + 1, c + 2, 'E');
  },
  // drowsy: lid across the top, pupil peeking below
  half(g, r, c) {
    put(g, r, c, 'E'); put(g, r, c + 1, 'E'); put(g, r, c + 2, 'E');
    put(g, r + 1, c, 'E'); put(g, r + 1, c + 1, 'E'); put(g, r + 1, c + 2, 'E');
  },
  // dizzy swirl
  swirl(g, r, c) {
    put(g, r, c, 'E'); put(g, r, c + 1, 'E'); put(g, r, c + 2, 'E');
    put(g, r + 1, c, 'E'); put(g, r + 1, c + 2, 'E');
    put(g, r + 2, c + 1, 'E'); put(g, r + 2, c + 2, 'E');
  },
  // celebrating sparkle
  sparkle(g, r, c) {
    put(g, r, c + 1, 'W');
    put(g, r + 1, c, 'W'); put(g, r + 1, c + 1, 'W'); put(g, r + 1, c + 2, 'W');
    put(g, r + 2, c + 1, 'W');
  },
  // squeezed shut (sulk, laugh)
  squint(g, r, c) {
    put(g, r + 1, c, 'E'); put(g, r + 1, c + 1, 'E'); put(g, r + 1, c + 2, 'E');
  }
};

const MOUTH_STYLES = {
  smile(g, r, c) { put(g, r, c, 'M'); put(g, r + 1, c + 1, 'M'); put(g, r, c + 2, 'M'); },
  open(g, r, c) { put(g, r, c + 1, 'M'); put(g, r + 1, c, 'M'); put(g, r + 1, c + 2, 'M'); put(g, r + 2, c + 1, 'M'); },
  wavy(g, r, c) { put(g, r + 1, c, 'M'); put(g, r, c + 1, 'M'); put(g, r + 1, c + 2, 'M'); },
  cat(g, r, c) { put(g, r, c - 1, 'M'); put(g, r + 1, c, 'M'); put(g, r, c + 1, 'M'); put(g, r + 1, c + 2, 'M'); put(g, r, c + 3, 'M'); },
  flat(g, r, c) { put(g, r + 1, c, 'M'); put(g, r + 1, c + 1, 'M'); put(g, r + 1, c + 2, 'M'); },
  none() {}
};

/* ------------------------------------------------------------------ *
 * Props - small accessories drawn in the accent colour
 * ------------------------------------------------------------------ */

const PROPS = {
  // a tiny teacup / water glass
  cup(g, r, c) {
    put(g, r, c, 'O'); put(g, r, c + 1, 'A'); put(g, r, c + 2, 'A'); put(g, r, c + 3, 'O');
    put(g, r + 1, c, 'O'); put(g, r + 1, c + 1, 'A'); put(g, r + 1, c + 2, 'A'); put(g, r + 1, c + 3, 'O');
    put(g, r + 2, c + 1, 'O'); put(g, r + 2, c + 2, 'O');
    put(g, r + 1, c + 4, 'O');
  },
  // a little open book
  book(g, r, c) {
    for (let dc = 0; dc < 6; dc++) { put(g, r, c + dc, 'O'); put(g, r + 2, c + dc, 'O'); }
    put(g, r + 1, c, 'O'); put(g, r + 1, c + 5, 'O');
    put(g, r + 1, c + 1, 'A'); put(g, r + 1, c + 2, 'A');
    put(g, r + 1, c + 3, 'A'); put(g, r + 1, c + 4, 'A');
  },
  // a sleepy nightcap
  nightcap(g, r, c) {
    put(g, r + 2, c, 'O'); put(g, r + 2, c + 1, 'A'); put(g, r + 2, c + 2, 'A');
    put(g, r + 2, c + 3, 'A'); put(g, r + 2, c + 4, 'A'); put(g, r + 2, c + 5, 'O');
    put(g, r + 1, c + 1, 'O'); put(g, r + 1, c + 2, 'A'); put(g, r + 1, c + 3, 'A'); put(g, r + 1, c + 4, 'O');
    put(g, r, c + 2, 'O'); put(g, r, c + 3, 'O');
    put(g, r, c + 4, 'W');
  },
  // a juggling ball
  ball(g, r, c) {
    put(g, r, c + 1, 'O'); put(g, r + 1, c, 'O'); put(g, r + 1, c + 1, 'A'); put(g, r + 1, c + 2, 'O');
    put(g, r + 2, c + 1, 'O');
  },
  // the floating pixel bug Pip chases
  bug(g, r, c) {
    put(g, r, c + 1, 'A');
    put(g, r + 1, c, 'A'); put(g, r + 1, c + 1, 'O'); put(g, r + 1, c + 2, 'A');
  },
  // a tiny battery
  battery(g, r, c) {
    for (let dc = 0; dc < 5; dc++) { put(g, r, c + dc, 'O'); put(g, r + 3, c + dc, 'O'); }
    put(g, r + 1, c, 'O'); put(g, r + 2, c, 'O');
    put(g, r + 1, c + 4, 'O'); put(g, r + 2, c + 4, 'O');
    put(g, r + 1, c + 1, 'A'); put(g, r + 2, c + 1, 'A');
    put(g, r + 1, c + 5, 'O');
  },
  // a snack morsel
  snack(g, r, c) {
    put(g, r, c, 'O'); put(g, r, c + 1, 'O');
    put(g, r + 1, c, 'A'); put(g, r + 1, c + 1, 'A');
  }
};

/* ------------------------------------------------------------------ *
 * Frame composition
 * ------------------------------------------------------------------ */

const DEFAULT_BODY = { cx: 16, cy: 19.5, w: 11, h: 7.4, dip: 2.5, dipW: 0.55 };

/** Row Pip's near feet rest on. The far pair land one row higher (depth). */
const FLOOR_ROW = 30;

/**
 * Compose one 32x32 frame and return it as 32 strings of 32 chars.
 *
 * spec:
 *   body   {cx,cy,w,h,dip,dipW}            partial override of DEFAULT_BODY
 *   legs   {mode, lift:[4], len, farLen, width, spread}
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
  const tops = Object.values(colTop);
  const bots = Object.values(colBot);
  if (!tops.length) throw new Error('bean silhouette is empty - check body params');

  const bodyTop = Math.min.apply(null, tops);
  const bodyBottom = Math.max.apply(null, bots);

  const nearBack = Math.round(body.cx - body.w * 0.55) - legs.spread;
  const nearFront = Math.round(body.cx + body.w * 0.30) + legs.spread;

  const farMaskAll = newMask();
  const nearMaskAll = newMask();
  const legPixels = newMask();

  // order: [farBack, farFront, nearBack, nearFront]
  // The far pair sit 2px further back and land one row higher, which is what
  // reads as depth in the three-quarter view.
  if (legs.mode !== 'none') {
    const defs = [
      { x: nearBack - 2 + legs.dx[0], lift: legs.lift[0], far: true },
      { x: nearFront - 2 + legs.dx[1], lift: legs.lift[1], far: true },
      { x: nearBack + legs.dx[2], lift: legs.lift[2], far: false },
      { x: nearFront + legs.dx[3], lift: legs.lift[3], far: false }
    ];
    for (const d of defs) {
      // Attach flush to the belly: take the lowest body row across the
      // columns this leg covers, then tuck 1px up inside the body.
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

  const g = newGrid();

  // far legs first, behind everything, one shade darker
  const farOutline = outlineOf(farMaskAll);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!farMaskAll[r][c]) continue;
      g[r][c] = farOutline[r][c] ? 'O' : 'F';
    }
  }

  // body + near legs share one silhouette so there is no seam between them
  const near = maskUnion(maskUnion(newMask(), bodyMask), nearMaskAll);
  const nearOutline = outlineOf(near);

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
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

  // ---- the signature gloss streak ----------------------------------
  // Always at least 2 pixels on the upper-left of the body, nudged per pose
  // so the shine survives squash, stretch and rotation.
  if (spec.gloss !== 'none') {
    const gl = Object.assign({ dr: 0, dc: 0 }, spec.gloss || {});
    const glossCol = Math.round(body.cx - body.w * 0.45) + gl.dc;
    let placed = 0;
    for (let i = 0; i < 3; i++) {
      const c = glossCol + i;
      const t = colTop[c];
      if (t === undefined) continue;
      const r = t + 2 + gl.dr;
      if (inBounds(r, c) && near[r][c] && !nearOutline[r][c]) { g[r][c] = 'H'; placed++; }
    }
    if (placed < 2) {
      const from = Math.round(body.cx - body.w * 0.75);
      const to = Math.round(body.cx + body.w * 0.2);
      for (let c = from; c <= to && placed < 3; c++) {
        const t = colTop[c];
        if (t === undefined) continue;
        for (let r = t + 2; r <= t + 4; r++) {
          if (inBounds(r, c) && near[r][c] && !nearOutline[r][c] && g[r][c] !== 'H') {
            g[r][c] = 'H'; placed++; break;
          }
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
    EYE_STYLES[face.eyes](g, eyeRow, farEyeCol);
    EYE_STYLES[face.eyes](g, eyeRow, nearEyeCol);
    if (face.blush) {
      const br = eyeRow + 4;
      put(g, br, farEyeCol - 1, 'K'); put(g, br, farEyeCol, 'K');
      put(g, br, nearEyeCol + 2, 'K'); put(g, br, nearEyeCol + 3, 'K');
    }
    MOUTH_STYLES[face.mouth](g, eyeRow + 4, farEyeCol + 2);
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
    PROPS[p.name](g, p.r, p.c);
  }

  // ---- rotation (climbing turns Pip sideways) -----------------------
  let out = g;
  if (spec.rotate === 90) out = rotate90(g);
  else if (spec.rotate === -90) out = rotate270(g);

  return out.map((row) => row.join(''));
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
  SIZE, DEFAULT_BODY, EYE_STYLES, MOUTH_STYLES, PROPS
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
  lines.push(' * Each frame is 32 strings of 32 characters. Every character is a palette');
  lines.push(' * key from palettes.js and "." means transparent. Frames are drawn facing');
  lines.push(' * right; the renderer flips them horizontally to face left.');
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
  lines.push('  const Sprites = { FRAME_SIZE, FRAMES, FRAME_NAMES };');
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
