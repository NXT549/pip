#!/usr/bin/env node
/*
 * gen-sprites.js - AUTHORING TOOL, not a build step.
 *
 * Composes every one of Pip's 64x64 frames from a small pose description
 * (tools/frame-specs.js) and writes them, with their metadata, as literal
 * data into src/renderer/sprites.js.
 *
 * The art is built in layers, the way you would paint it by hand:
 *
 *   silhouette  a jellybean: a chunky superellipse with a dip in its back,
 *               optionally leant (running) or tilted (a puzzled head tilt)
 *   legs        four capsule limbs from hip to foot, so a leg can reach,
 *               wave or fold as well as stand; the far pair sit behind and
 *               one row higher, which is what sells the three-quarter view
 *   shading     a height field grown from the silhouette's edges, lit from
 *               the upper left - so every pose, however squashed, shades
 *               like a rounded bean without per-pose painting
 *   outline     dark all round, tinted where the light hits it
 *   gloss       the curved shine streak and dot that make him a jellybean
 *   face        eyes (shared with the runtime - see compose.js), brows,
 *               mouth and blush on the front third of the body
 *   props       cups, books, hats...
 *
 *   npm run sprites                         write src/renderer/sprites.js
 *   node tools/gen-sprites.js --preview X   print frame X as text
 */

'use strict';

const Compose = require('../src/renderer/compose.js');
const { MOUTHS, BROWS, BLUSH } = require('./art/faces.js');
const { PROPS } = require('./art/props.js');

const SIZE = 64;
const T = '.';

/** Row the near feet rest on. The far pair land one row higher. */
const FLOOR_ROW = 61;
/** One past the feet: the renderer sits Pip on the floor using this. */
const FOOT_ROW = 62;

const REST = { cx: 32, cy: 41, w: 22, h: 14.8, dip: 4, dipW: 0.45, round: 2.1, lean: 0, tilt: 0, belly: 1 };

/** Leg thickness (capsule radius, px). */
const LEG_R = 3.9;

/** The light: from the upper left, a little in front. */
const LIGHT = (() => {
  const v = [-0.38, -0.78, 0.62];
  const n = Math.hypot(v[0], v[1], v[2]);
  return v.map((x) => x / n);
})();

/** Shading thresholds on the lit intensity. */
const TONE = { L: 0.78, B: 0.40, D: 0.12 };
const DITHER = 0.014;

/* ------------------------------------------------------------------ *
 * Grid helpers
 * ------------------------------------------------------------------ */

function newGrid(fill) {
  return Array.from({ length: SIZE }, () => new Array(SIZE).fill(fill === undefined ? T : fill));
}
function newMask() { return newGrid(false); }
function inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }

function maskUnion(into, other) {
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (other[r][c]) into[r][c] = true;
  return into;
}

/** Mask cells that touch a non-mask cell (4-neighbour) or the frame edge. */
function edgeOf(mask) {
  const out = newMask();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!mask[r][c]) continue;
      out[r][c] =
        !inBounds(r - 1, c) || !mask[r - 1][c] || !inBounds(r + 1, c) || !mask[r + 1][c] ||
        !inBounds(r, c - 1) || !mask[r][c - 1] || !inBounds(r, c + 1) || !mask[r][c + 1];
    }
  }
  return out;
}

/** Chamfer distance (in px) from each mask cell to the nearest non-mask cell. */
function distanceField(mask) {
  const INF = 1e9;
  const d = Array.from({ length: SIZE }, (_, r) =>
    Array.from({ length: SIZE }, (_, c) => (mask[r][c] ? INF : 0)));
  const at = (r, c) => (inBounds(r, c) ? d[r][c] : 0);
  const D1 = 1, D2 = Math.SQRT2;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!d[r][c]) continue;
      d[r][c] = Math.min(d[r][c], at(r - 1, c) + D1, at(r, c - 1) + D1, at(r - 1, c - 1) + D2, at(r - 1, c + 1) + D2);
    }
  }
  for (let r = SIZE - 1; r >= 0; r--) {
    for (let c = SIZE - 1; c >= 0; c--) {
      if (!d[r][c]) continue;
      d[r][c] = Math.min(d[r][c], at(r + 1, c) + D1, at(r, c + 1) + D1, at(r + 1, c + 1) + D2, at(r + 1, c - 1) + D2);
    }
  }
  return d;
}

/* ------------------------------------------------------------------ *
 * The jellybean
 * ------------------------------------------------------------------ */

/** Is the point (x, y) - continuous sprite coordinates - inside the bean? */
function beanInside(b, x, y) {
  let dx = x - b.cx, dy = y - b.cy;
  if (b.tilt) {
    const ct = Math.cos(-b.tilt), st = Math.sin(-b.tilt);
    const nx = dx * ct - dy * st, ny = dx * st + dy * ct;
    dx = nx; dy = ny;
  }
  // lean: the top of the bean is pushed `lean` px forward
  if (b.lean) dx += b.lean * dy / b.h;
  const t = dx / b.w;
  if (t <= -1 || t >= 1) return false;
  const p = b.round || 2;
  const e = Math.pow(1 - Math.pow(Math.abs(t), p), 1 / p);
  const dip = b.dip * Math.exp(-((t / b.dipW) * (t / b.dipW)));
  const top = -b.h * e + dip;
  const bot = b.h * e * (b.belly || 1);
  return dy >= top && dy <= bot;
}

function beanMask(b) {
  const mask = newMask();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) mask[r][c] = beanInside(b, c + 0.5, r + 0.5);
  }
  return mask;
}

function columnExtents(mask) {
  const top = {}, bot = {};
  for (let c = 0; c < SIZE; c++) {
    for (let r = 0; r < SIZE; r++) {
      if (!mask[r][c]) continue;
      if (top[c] === undefined) top[c] = r;
      bot[c] = r;
    }
  }
  return { top, bot };
}

/* ------------------------------------------------------------------ *
 * Legs
 * ------------------------------------------------------------------ */

function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

/**
 * One leg: a capsule from the hip to the foot. A foot that is planted gets
 * a flat sole on `sole` and a little rounded toe forward.
 */
function legMask(hip, foot, planted, sole, radius) {
  const R = radius || LEG_R;
  const mask = newMask();
  // the capsule's lower end sits R above the sole so the round reaches it
  const endY = planted ? sole - R + 0.6 : foot.y;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const px = c + 0.5, py = r + 0.5;
      if (planted && r > sole) continue;
      if (segDist(px, py, hip.x, hip.y, foot.x, endY) <= R) mask[r][c] = true;
      if (planted) {
        // the toe: a squat ellipse pointing forward along the floor
        const ex = (px - (foot.x + 1.4)) / (R + 1.1);
        const ey = (py - (sole - 1.2)) / 2.3;
        if (ex * ex + ey * ey <= 1) mask[r][c] = true;
      }
    }
  }
  return mask;
}

/* ------------------------------------------------------------------ *
 * Frame composition
 * ------------------------------------------------------------------ */

function stampRows(g, rows, r0, c0, keep) {
  for (let dr = 0; dr < rows.length; dr++) {
    for (let dc = 0; dc < rows[dr].length; dc++) {
      const ch = rows[dr][dc];
      if (ch === T) continue;
      const r = r0 + dr, c = c0 + dc;
      if (!inBounds(r, c)) continue;
      if (keep && !keep(r, c)) continue;
      g[r][c] = ch;
    }
  }
}

function mirrorRows(rows) {
  return rows.map((row) => row.split('').reverse().join(''));
}

/**
 * Compose one frame.
 * @returns {{rows: string[], meta: object}}
 */
function composeFrame(spec) {
  spec = spec || {};
  const view = spec.view || 'side';
  const body = Object.assign({}, REST, view === 'front' ? { w: 16, dip: 0, round: 2.1 } : {}, spec.body || {});
  const legs = Object.assign(
    { mode: 'stand', lift: [0, 0, 0, 0], dx: [0, 0, 0, 0], spread: 0, floor: FLOOR_ROW, reach: [null, null, null, null], r: LEG_R },
    spec.legs || {}
  );

  const bodyMask = beanMask(body);
  const { top: colTop, bot: colBot } = columnExtents(bodyMask);
  if (!Object.keys(colTop).length) throw new Error('bean silhouette is empty - check body params');

  /* ---- legs ---- */
  const farMask = newMask();
  const nearLegMask = newMask();
  // legs raised in front of the body - a paw holding a mug, a wave - get
  // their own outline and are drawn on top, or they would vanish into it
  const overLegs = [];
  if (legs.mode !== 'none') {
    let hipsX;
    if (view === 'front') {
      hipsX = [body.cx - 11 - legs.spread, body.cx + 11 + legs.spread, body.cx - 6.5 - legs.spread, body.cx + 6.5 + legs.spread];
    } else {
      const back = body.cx - body.w * 0.42 - legs.spread;
      const front = body.cx + body.w * 0.42 + legs.spread;
      hipsX = [back - 4, front - 4, back, front];
    }
    for (let i = 0; i < 4; i++) {
      const far = i < 2;
      const hx = hipsX[i];
      const col = Math.round(hx);
      let bottom = -1;
      for (let c = col - 1; c <= col + 1; c++) if (colBot[c] !== undefined && colBot[c] > bottom) bottom = colBot[c];
      if (bottom < 0) continue;
      const reach = legs.reach[i];
      const hip = { x: hx + (reach && reach.hx || 0), y: bottom - 2.5 - (reach && reach.up || 0) };
      const sole = (far ? legs.floor - 1 : legs.floor) - legs.lift[i];
      let foot, planted;
      if (reach) {
        foot = { x: hip.x + reach.dx, y: hip.y + reach.dy };
        planted = false;
      } else {
        foot = { x: hx + legs.dx[i], y: sole };
        planted = sole > hip.y + 1;
        if (!planted) foot = { x: hx + legs.dx[i], y: hip.y + 1 };
      }
      const m = legMask(hip, foot, planted, sole, reach && reach.r || legs.r);
      if (reach && reach.over) overLegs.push({ mask: m, far: far });
      else maskUnion(far ? farMask : nearLegMask, m);
    }
  }

  const near = maskUnion(maskUnion(newMask(), bodyMask), nearLegMask);
  const nearEdge = edgeOf(near);
  // far legs are only drawn where they peek out from behind
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (near[r][c]) farMask[r][c] = false;
  const farEdge = edgeOf(farMask);

  const g = newGrid();

  /* ---- far legs: behind everything, one shade darker ---- */
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!farMask[r][c]) continue;
      if (farEdge[r][c]) { g[r][c] = 'O'; continue; }
      const shadowSide = inBounds(r, c + 1) && !farMask[r][c + 1];
      const underBelly = inBounds(r - 1, c) && near[r - 1][c];
      g[r][c] = shadowSide || underBelly || r >= legs.floor - 1 ? 'f' : 'F';
    }
  }

  /* ---- body + near legs: one silhouette, shaded as a rounded form ---- */
  const dist = distanceField(near);
  const R = 9;
  const z = (r, c) => {
    if (!inBounds(r, c) || !near[r][c]) return 0;
    const t = Math.min(dist[r][c], R) / R;
    return R * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
  };
  const lit = newGrid(0);
  const normalY = newGrid(0);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!near[r][c]) continue;
      const gx = (z(r, c + 1) - z(r, c - 1)) / 2;
      const gy = (z(r + 1, c) - z(r - 1, c)) / 2;
      const n = [-gx, -gy, 1];
      const len = Math.hypot(n[0], n[1], n[2]);
      const I = (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / len;
      lit[r][c] = I;
      normalY[r][c] = n[1] / len;
    }
  }

  const tone = (I, r, c) => {
    const pick = (thr, hi, lo) => {
      if (Math.abs(I - thr) < DITHER) return (r + c) % 2 === 0 ? hi : lo;
      return I > thr ? hi : lo;
    };
    if (I > TONE.L - DITHER) return pick(TONE.L, 'L', 'B');
    if (I > TONE.B - DITHER) return pick(TONE.B, 'B', 'D');
    return pick(TONE.D, 'D', 'd');
  };

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!near[r][c]) continue;
      if (nearEdge[r][c]) {
        g[r][c] = lit[r][c] > 0.62 && bodyMask[r][c] ? 'o' : 'O';
        continue;
      }
      const legOnly = nearLegMask[r][c] && !bodyMask[r][c];
      if (legOnly) {
        // the belly overhangs the top of each leg
        if (inBounds(r - 1, c) && bodyMask[r - 1][c] && !nearLegMask[r - 1][c]) { g[r][c] = 'd'; continue; }
        if (inBounds(r - 1, c) && bodyMask[r - 1][c]) { g[r][c] = 'd'; continue; }
        g[r][c] = r >= legs.floor - 1 ? 'D' : tone(lit[r][c], r, c);
        continue;
      }
      g[r][c] = tone(lit[r][c], r, c);
    }
  }

  // the translucent jelly glow, just inside the lower edge of the bean
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!bodyMask[r][c] || nearEdge[r][c] || nearLegMask[r][c]) continue;
      if (dist[r][c] < 1.9 || dist[r][c] > 2.6) continue;
      if (normalY[r][c] < 0.35) continue;
      if (Math.abs(c + 0.5 - body.cx) > body.w * 0.62) continue;
      g[r][c] = 'h';
    }
  }

  /* ---- the signature gloss ---- */
  if (spec.gloss !== 'none') placeGloss(g, near, nearEdge, colTop, body, spec.gloss || {});

  /* ---- face ---- */
  const face = Object.assign(
    { eyes: 'open', mouth: 'smile', blush: true, brows: null, dx: 0, dy: 0, hidden: false },
    spec.face || {}
  );
  const liveEyes = [];
  if (!face.hidden) drawFace(g, near, nearEdge, body, view, face, liveEyes);

  /* ---- paws raised in front of the body ---- */
  for (const leg of overLegs) drawOverLeg(g, leg.mask, leg.far);

  /* ---- props ---- */
  let hat = false;
  const crown = crownPoint(colTop, body, view);
  for (const p of spec.props || []) {
    const prop = PROPS[p.name];
    if (!prop) throw new Error('unknown prop: ' + p.name);
    if (prop.hat) hat = true;
    let r0, c0;
    if (p.at === 'crown') {
      r0 = crown.r - prop.ay + (p.dy || 0);
      c0 = crown.c - prop.ax + (p.dx || 0);
    } else {
      r0 = p.r; c0 = p.c;
    }
    const rows = p.mirror ? mirrorRows(prop.rows) : prop.rows;
    if (p.behind) stampRows(g, rows, r0, c0, (r, c) => g[r][c] === T);
    else stampRows(g, rows, r0, c0);
  }

  /* ---- metadata ---- */
  const extent = columnExtents(bodyMask);
  const cols = Object.keys(extent.top).map(Number);
  const midRow = Math.round(body.cy);
  let backC = SIZE, frontC = -1;
  for (let c = 0; c < SIZE; c++) {
    if (bodyMask[midRow] && bodyMask[midRow][c]) {
      if (c < backC) backC = c;
      if (c > frontC) frontC = c;
    }
  }
  let meta = {
    view: view,
    rotate: spec.rotate || 0,
    body: { cx: body.cx, cy: body.cy, w: body.w, h: body.h },
    crown: { r: crown.r - 1, c: crown.c },
    ends: { back: { r: midRow, c: backC }, front: { r: midRow, c: frontC } },
    eyes: liveEyes,
    hat: hat,
    top: Math.min.apply(null, cols.map((c) => extent.top[c]))
  };

  /* ---- rotation (climbing turns Pip sideways) ---- */
  let out = g;
  if (spec.rotate === 90) { out = rotate90(g); meta = rotateMeta(meta, 90); }
  else if (spec.rotate === -90) { out = rotate270(g); meta = rotateMeta(meta, -90); }

  const rows = out.map((row) => row.join(''));
  meta.top = rows.findIndex((row) => row !== T.repeat(SIZE));
  return { rows: rows, meta: meta };
}

/**
 * A leg drawn over the body with its own outline and its own rounded
 * shading - a front paw lifted in front of the chest.
 */
function drawOverLeg(g, mask, far) {
  const edge = edgeOf(mask);
  const dist = distanceField(mask);
  const R = 3;
  const z = (r, c) => (inBounds(r, c) && mask[r][c] ? R * Math.sqrt(Math.max(0, 1 - Math.pow(1 - Math.min(dist[r][c], R) / R, 2))) : 0);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!mask[r][c]) continue;
      if (edge[r][c]) { g[r][c] = 'O'; continue; }
      const gx = (z(r, c + 1) - z(r, c - 1)) / 2;
      const gy = (z(r + 1, c) - z(r - 1, c)) / 2;
      const len = Math.hypot(gx, gy, 1);
      const I = (-gx * LIGHT[0] - gy * LIGHT[1] + LIGHT[2]) / len;
      // the far paw is one tone further into shadow
      if (far) g[r][c] = I > TONE.L ? 'B' : I > TONE.B ? 'D' : 'd';
      else g[r][c] = I > TONE.L ? 'L' : I > TONE.B ? 'B' : 'D';
    }
  }
}

function crownPoint(colTop, body, view) {
  const c = Math.round(view === 'front' ? body.cx - 0.5 : body.cx + body.w * 0.18);
  let best = c;
  for (let d = 0; d <= 3; d++) {
    if (colTop[c + d] !== undefined) { best = c + d; break; }
    if (colTop[c - d] !== undefined) { best = c - d; break; }
  }
  return { r: colTop[best] !== undefined ? colTop[best] : Math.round(body.cy - body.h), c: best };
}

/**
 * The curved shine streak along the upper-left of the bean, thickest in the
 * middle, with a little dot of light after it. At least two H pixels always
 * survive, whatever the pose - it is the one thing that says "jellybean".
 */
function placeGloss(g, near, nearEdge, colTop, body, gl) {
  const dr = gl.dr || 0, dc = gl.dc || 0;
  const c0 = Math.round(body.cx - body.w * 0.66) + dc;
  const c1 = Math.round(body.cx - body.w * 0.2) + dc;
  let placed = 0;
  const canGloss = (r, c) => inBounds(r, c) && near[r][c] && !nearEdge[r][c];
  for (let c = c0; c <= c1; c++) {
    if (colTop[c] === undefined) continue;
    const t = (c - c0) / Math.max(1, c1 - c0);
    const thick = t > 0.18 && t < 0.82 ? 2 : 1;
    const r = colTop[c] + 3 + dr;
    for (let k = 0; k < thick; k++) {
      if (canGloss(r + k, c)) { g[r + k][c] = 'H'; placed++; }
    }
    // a soft glow hugging the underside of the streak
    if (thick === 2 && canGloss(r + 2, c) && g[r + 2][c] === 'L') g[r + 2][c] = 'h';
  }
  // the dot
  const dotC = c1 + 3;
  if (colTop[dotC] !== undefined) {
    const r = colTop[dotC] + 3 + dr;
    for (const [rr, cc] of [[r, dotC], [r, dotC + 1], [r + 1, dotC], [r + 1, dotC + 1]]) {
      if (canGloss(rr, cc)) { g[rr][cc] = 'H'; placed++; }
    }
  }
  if (placed < 2) {
    // squashed or rotated flat: find any lit interior pixels on the upper left
    for (let r = 0; r < SIZE && placed < 3; r++) {
      for (let c = 0; c < SIZE && placed < 3; c++) {
        if (canGloss(r, c) && (g[r][c] === 'L' || g[r][c] === 'B') && c < body.cx) { g[r][c] = 'H'; placed++; }
      }
    }
  }
  if (placed < 2) throw new Error('gloss streak could not be placed');
}

/**
 * Eyes, brows, blush and mouth on the front third of the bean (or the
 * middle, facing you). Face pixels only ever land inside the silhouette:
 * the outline always wins, so a face nudged toward the edge can never
 * punch a notch in Pip's outline.
 */
function drawFace(g, near, nearEdge, body, view, face, liveEyes) {
  const inside = (r, c) => inBounds(r, c) && near[r][c] && !nearEdge[r][c];
  const eyeRow = Math.round(body.cy - 5) + face.dy;
  let farC, nearC;
  if (view === 'front') {
    farC = Math.round(body.cx - 8) + face.dx;
    nearC = Math.round(body.cx + 3) + face.dx;
  } else {
    farC = Math.round(body.cx + body.w * 0.16) + face.dx;
    nearC = farC + Compose.EYE_W + 4;
  }

  // blush first, so eyes and mouth sit on top of it
  if (face.blush) {
    const br = eyeRow + 8;
    stampRows(g, BLUSH, br, farC - 3, inside);
    stampRows(g, view === 'front' ? mirrorRows(BLUSH) : BLUSH, br, nearC + 3, inside);
  }

  // eyes, remembering what was underneath for the runtime to lift them off
  const eyeRowsLen = Compose.EYES[face.eyes] ? Compose.EYES[face.eyes].length : 7;
  const eyes = [{ c: farC, mirror: false }, { c: nearC, mirror: true }];
  for (const e of eyes) {
    const under = [];
    for (let r = eyeRow - 1; r <= eyeRow + eyeRowsLen; r++) {
      let s = '';
      for (let c = e.c - 1; c <= e.c + Compose.EYE_W; c++) s += inBounds(r, c) ? g[r][c] : T;
      under.push(s);
    }
    Compose.stampEye(g, face.eyes, eyeRow, e.c, e.mirror);
    if (Compose.LIVE_EYES[face.eyes]) {
      liveEyes.push({ r: eyeRow, c: e.c, style: face.eyes, mirror: e.mirror, under: under });
    }
  }

  if (face.brows && BROWS[face.brows]) {
    const rows = BROWS[face.brows];
    stampRows(g, rows, eyeRow - 3, farC, inside);
    stampRows(g, mirrorRows(rows), eyeRow - 3, nearC, inside);
  }

  const mouth = MOUTHS[face.mouth];
  if (!mouth) throw new Error('unknown mouth style: ' + face.mouth);
  if (mouth.length) {
    const w = mouth[0].length;
    const mid = view === 'front' ? body.cx - 0.5 + face.dx : (farC + Compose.EYE_W + nearC) / 2;
    const mc = Math.round(mid - w / 2) + (face.mouthDx || 0);
    stampRows(g, mouth, eyeRow + 8 + (face.mouthDy || 0), mc, inside);
  }
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

/** Carry the anchor points through the same rotation as the pixels. */
function rotateMeta(meta, rot) {
  const p = rot === 90
    ? (pt) => ({ r: pt.c, c: SIZE - 1 - pt.r })
    : (pt) => ({ r: SIZE - 1 - pt.c, c: pt.r });
  return Object.assign({}, meta, {
    crown: p(meta.crown),
    ends: { back: p(meta.ends.back), front: p(meta.ends.front) },
    // eyes are not redrawn on a sideways Pip
    eyes: []
  });
}

module.exports = {
  composeFrame, rotate90, rotate270, beanMask,
  SIZE, FLOOR_ROW, FOOT_ROW, REST, LEG_R, PROPS, MOUTHS, BROWS
};

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

function bbox(rows) {
  return Compose.bbox(rows);
}

function buildAll() {
  const { specs } = require('./frame-specs.js');
  const Palettes = require('../src/renderer/palettes.js');
  const names = Object.keys(specs);
  const frames = {};
  const meta = {};
  for (const name of names) {
    let res;
    try {
      res = composeFrame(specs[name]);
    } catch (err) {
      throw new Error('frame "' + name + '": ' + err.message);
    }
    const f = res.rows;
    if (f.length !== SIZE) throw new Error('frame "' + name + '" has ' + f.length + ' rows');
    f.forEach((row, i) => {
      if (row.length !== SIZE) throw new Error('frame "' + name + '" row ' + i + ' is ' + row.length + ' chars');
      for (const ch of row) {
        if (!Palettes.isValidKey(ch)) throw new Error('frame "' + name + '" uses unknown palette key "' + ch + '"');
      }
    });
    if (!f.some((row) => row.indexOf('H') !== -1)) throw new Error('frame "' + name + '" lost its gloss streak');
    frames[name] = f;
    meta[name] = res.meta;
  }
  return { names, frames, meta };
}

function emit() {
  const fs = require('fs');
  const path = require('path');
  const { names, frames, meta } = buildAll();

  const lines = [];
  lines.push('/*');
  lines.push(' * sprites.js - every frame of Pip, as plain data. GENERATED - do not edit.');
  lines.push(' *');
  lines.push(' * Each frame is 64 strings of 64 characters. Every character is a palette');
  lines.push(' * key from palettes.js and "." means transparent. Frames are drawn facing');
  lines.push(' * right; the renderer flips them horizontally to face left.');
  lines.push(' *');
  lines.push(' * FRAME_META holds what the runtime needs to dress a frame up (compose.js):');
  lines.push(' * where the eyes are and what was under them, the crown and ends a trait');
  lines.push(' * hangs from, the body ellipse a pattern follows, and whether he is');
  lines.push(' * wearing a hat.');
  lines.push(' *');
  lines.push(' * Generated by tools/gen-sprites.js from tools/frame-specs.js. At 64x64 the');
  lines.push(' * shading is computed, not painted, so change the pose spec and run');
  lines.push(' * "npm run sprites" rather than editing pixels here.');
  lines.push(' */');
  lines.push('');
  lines.push("'use strict';");
  lines.push('');
  lines.push('const FRAME_SIZE = ' + SIZE + ';');
  lines.push('');
  lines.push('/** One past the row the near feet rest on. */');
  lines.push('const FOOT_ROW = ' + FOOT_ROW + ';');
  lines.push('');
  lines.push('const FRAMES = {');
  names.forEach((name, i) => {
    lines.push('  ' + name + ': [');
    frames[name].forEach((row, r) => {
      lines.push("    '" + row + "'" + (r === SIZE - 1 ? '' : ','));
    });
    lines.push('  ]' + (i === names.length - 1 ? '' : ','));
  });
  lines.push('};');
  lines.push('');
  lines.push('const FRAME_META = {');
  names.forEach((name, i) => {
    lines.push('  ' + name + ': ' + JSON.stringify(meta[name]) + (i === names.length - 1 ? '' : ','));
  });
  lines.push('};');
  lines.push('');
  lines.push('const FRAME_NAMES = Object.keys(FRAMES);');
  lines.push('');
  lines.push('const Sprites = { FRAME_SIZE, FOOT_ROW, FRAMES, FRAME_META, FRAME_NAMES };');
  lines.push('');
  lines.push("if (typeof window !== 'undefined') {");
  lines.push('  window.Pip = window.Pip || {};');
  lines.push('  window.Pip.Sprites = Sprites;');
  lines.push('}');
  lines.push("if (typeof module !== 'undefined' && module.exports) {");
  lines.push('  module.exports = Sprites;');
  lines.push('}');
  lines.push('');

  const out = path.join(__dirname, '..', 'src', 'renderer', 'sprites.js');
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
  console.log('wrote ' + names.length + ' frames -> src/renderer/sprites.js');
  return names.length;
}

if (require.main === module) {
  if (process.argv[2] === '--preview') {
    const name = process.argv[3];
    const { specs } = require('./frame-specs.js');
    if (name && !specs[name]) {
      console.error('no such frame spec: ' + name);
      console.error('available: ' + Object.keys(specs).join(' '));
      process.exit(1);
    }
    const res = composeFrame(name ? specs[name] : {});
    res.rows.forEach((row, i) => console.log(String(i).padStart(2, ' ') + ' ' + row));
    const b = bbox(res.rows);
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
