/*
 * particles.js - the little things that fly off Pip.
 *
 * A layer of its own, drawn above Pip and never hit-tested: particles are
 * decoration, so the click-through window must never turn solid because a
 * heart happened to float under the cursor.
 *
 * Every kind is drawn as chunky filled rects on a grid rather than as curves.
 * Pip is 32x32 pixel art; a smooth vector heart next to him would read as a
 * different program's UI, so the shapes below are literal pixel patterns and
 * everything is snapped to whole blocks of `unit` DIPs.
 *
 * Units follow physics.js so the renderer can run both from the same `dt`:
 * positions are DIPs, velocities DIP/s, and ages and lifetimes are SECONDS.
 *
 * The list is capped. Bursts arrive from main (`pip:particles`) and nothing
 * upstream throttles them, so a stuck timer or an enthusiastic user must cost
 * a fixed amount of work per frame, not an ever-growing one.
 */

'use strict';

/** Every kind main is allowed to ask for. */
const KINDS = ['heart', 'zzz', 'sparkle', 'confetti', 'sweat', 'water', 'star'];

/** Hard ceiling on the layer. Oldest particles are pushed out first. */
const MAX_PARTICLES = 120;

/** Same guard physics.js uses: one slow frame must not teleport anything. */
const MAX_DT = 0.1;

const TAU = Math.PI * 2;

/*
 * Particles are chrome rather than body, so they keep their own colours and
 * this module stays free of any load-order dependency on palettes.js. These
 * mirror the structural entries there (blush, prop accent, eye white) plus the
 * six flavour body colours for confetti, which is meant to look mixed.
 */
const COLORS = {
  heart: '#ff5f8d',
  zzz: '#cfd6ff',
  sparkle: '#ffe680',
  sweat: '#a9dcff',
  water: '#6cc4f5',
  star: '#ffe3a8',
  confetti: ['#e2415a', '#68c445', '#4a7fe0', '#f2cc3d', '#9b5cd6', '#ffffff'],
  light: '#ffffff'
};

/*
 * Pixel patterns. 'X' is the particle colour, 'o' the highlight, '.' nothing.
 * Odd widths keep every shape centred on a whole block.
 */
const SHAPES = {
  heart: [
    '.XX.XX.',
    'XXXXXXX',
    'XoXXXXX',
    '.XXXXX.',
    '..XXX..',
    '...X...'
  ],
  zzz: [
    'XXXXX',
    '...X.',
    '..X..',
    '.X...',
    'XXXXX'
  ],
  // A teardrop: pointed at the top, heavy at the bottom. The earlier shape
  // was symmetrical and read as a plus sign rather than a falling drop.
  drop: [
    '..X..',
    '..X..',
    '.XXX.',
    'XXXXX',
    'XoXXX',
    '.XXX.'
  ],
  star: [
    '..X..',
    '.XXX.',
    'XXoXX',
    '.X.X.',
    'X...X'
  ]
};

function rand(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

function clamp01(v) {
  return v < 0 ? 0 : (v > 1 ? 1 : v);
}

/**
 * How far through its visible life a particle is, 0..1.
 * Negative-ish values mean it is still waiting out its stagger delay, which is
 * how the three z's of a `zzz` puff leave Pip one after the other.
 */
function progress(p) {
  const span = p.life - p.delay;
  if (span <= 0) return 1;
  return clamp01((p.age - p.delay) / span);
}

/** Full opacity until `from`, then a linear fade to nothing at the end. */
function fadeTail(t, from) {
  if (t <= from) return 1;
  return clamp01(1 - (t - from) / (1 - from));
}

/**
 * Make one particle.
 *
 * @param {string} kind one of KINDS; anything else becomes a sparkle
 * @param {number} x    spawn centre, DIPs
 * @param {number} y    spawn centre, DIPs
 * @param {object} [opts] {rng, size, color, delay, angle, dir, life, vx, vy}
 * @returns {object} particle
 */
function create(kind, x, y, opts) {
  opts = opts || {};
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  const k = KINDS.indexOf(kind) === -1 ? 'sparkle' : kind;

  const p = {
    kind: k,
    x: x,
    y: y,
    vx: 0,
    vy: 0,
    gravity: 0,
    drift: 0,            // amplitude of the sideways wobble, DIP/s
    phase: rng() * TAU,  // so identical particles do not wobble in lockstep
    rot: rng() * TAU,
    spin: 0,
    age: 0,
    delay: typeof opts.delay === 'number' ? Math.max(0, opts.delay) : 0,
    life: 1,
    size: typeof opts.size === 'number' && opts.size > 0 ? opts.size : 1,
    color: COLORS[k] || COLORS.sparkle,
    // orbit state, only used by `star`
    cx: x,
    cy: y,
    radius: 0,
    angle: 0,
    spinRate: 0
  };

  switch (k) {
    case 'heart':
      // Rises, wanders a little, and is gone before it reaches the top.
      p.x += rand(rng, -6, 6);
      p.vx = rand(rng, -10, 10);
      p.vy = -rand(rng, 34, 58);
      p.drift = rand(rng, 8, 20);
      p.life = rand(rng, 1.4, 2.0);
      break;

    case 'zzz':
      // Up and to the right, the way a comic-strip snore always goes.
      p.vx = rand(rng, 14, 26);
      p.vy = -rand(rng, 22, 34);
      p.drift = rand(rng, 4, 10);
      p.size = p.size * 0.9;
      p.life = rand(rng, 1.5, 1.9);
      break;

    case 'sparkle':
      // Barely moves: it is a twinkle, not a projectile. Fades fast.
      p.x += rand(rng, -12, 12);
      p.y += rand(rng, -12, 12);
      p.vx = rand(rng, -12, 12);
      p.vy = -rand(rng, 4, 18);
      p.life = rand(rng, 0.42, 0.7);
      break;

    case 'confetti':
      p.vx = rand(rng, -190, 190);
      p.vy = -rand(rng, 140, 300);
      p.gravity = 900;
      p.spin = rand(rng, -14, 14);
      p.drift = rand(rng, 10, 30);
      p.life = rand(rng, 1.6, 2.6);
      p.color = COLORS.confetti[Math.floor(rng() * COLORS.confetti.length) % COLORS.confetti.length];
      break;

    case 'sweat': {
      // Flicks off sideways first, then gravity takes over - the classic
      // anime bead of sweat leaving the side of the head.
      const dir = typeof opts.dir === 'number' ? (opts.dir < 0 ? -1 : 1) : (rng() < 0.5 ? -1 : 1);
      p.vx = dir * rand(rng, 110, 190);
      p.vy = -rand(rng, 30, 90);
      p.gravity = 1200;
      p.life = rand(rng, 0.7, 1.0);
      break;
    }

    case 'water':
      p.x += rand(rng, -9, 9);
      p.vx = rand(rng, -20, 20);
      p.vy = rand(rng, 40, 120);
      p.gravity = 800;
      p.life = rand(rng, 0.8, 1.2);
      break;

    case 'star':
      // Dizzy stars do not fly anywhere: they circle the spawn point on a
      // squashed ellipse so the ring reads as going round Pip's head.
      p.radius = rand(rng, 16, 26);
      p.angle = typeof opts.angle === 'number' ? opts.angle : rng() * TAU;
      p.spinRate = rand(rng, 3.0, 4.6);
      p.life = rand(rng, 1.5, 2.1);
      p.x = p.cx + Math.cos(p.angle) * p.radius;
      p.y = p.cy + Math.sin(p.angle) * p.radius * 0.38;
      break;
  }

  // Explicit options win over every default above.
  if (typeof opts.color === 'string') p.color = opts.color;
  if (typeof opts.vx === 'number') p.vx = opts.vx;
  if (typeof opts.vy === 'number') p.vy = opts.vy;
  if (typeof opts.life === 'number' && opts.life > 0) p.life = opts.life;

  // A staggered particle must still get its full life once it appears.
  p.life += p.delay;
  return p;
}

/**
 * Add `count` particles of one kind to a list, keeping the list bounded.
 *
 * @param {Array} list    existing particles (mutated and returned)
 * @param {string} kind
 * @param {number} x
 * @param {number} y
 * @param {number} count
 * @param {object} [opts] passed through to create(); see there
 * @returns {Array} the same list
 */
function spawn(list, kind, x, y, count, opts) {
  list = list || [];
  opts = opts || {};
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  const n = Math.max(0, Math.min(MAX_PARTICLES, Math.round(count || 0)));

  for (let i = 0; i < n; i++) {
    const o = {};
    for (const key of Object.keys(opts)) o[key] = opts[key];
    o.rng = rng;
    // A snore is three z's leaving one after another, not three at once.
    if (kind === 'zzz' && o.delay === undefined) o.delay = i * 0.28;
    // Dizzy stars are spread evenly round the ring so they never bunch up.
    if (kind === 'star' && o.angle === undefined) o.angle = (i / Math.max(1, n)) * TAU;
    list.push(create(kind, x, y, o));
  }

  if (list.length > MAX_PARTICLES) list.splice(0, list.length - MAX_PARTICLES);
  return list;
}

/** Move one live particle. Split out so `update` stays about bookkeeping. */
function advance(p, dt) {
  switch (p.kind) {
    case 'heart':
    case 'zzz':
      p.x += (p.vx + Math.sin(p.phase + p.age * 3.2) * p.drift) * dt;
      p.y += p.vy * dt;
      break;

    case 'sparkle':
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      break;

    case 'confetti':
      p.vy += p.gravity * dt;
      p.x += (p.vx + Math.sin(p.phase + p.age * 6) * p.drift) * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      break;

    case 'sweat':
    case 'water':
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      break;

    case 'star':
      p.angle += p.spinRate * dt;
      p.x = p.cx + Math.cos(p.angle) * p.radius;
      p.y = p.cy + Math.sin(p.angle) * p.radius * 0.38;
      break;
  }
}

/**
 * Advance every particle and drop the dead ones.
 *
 * @param {Array} list
 * @param {number} dt seconds, same clock as Physics.step
 * @returns {Array} a new list containing only the survivors
 */
function update(list, dt) {
  if (!list || list.length === 0) return list || [];
  const step = Math.min(MAX_DT, Math.max(0, typeof dt === 'number' && isFinite(dt) ? dt : 0));
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    p.age += step;
    if (p.age >= p.life) continue;
    if (p.age > p.delay) advance(p, step);
    out.push(p);
  }
  return out;
}

/** Per-kind opacity curve. Sparkles snap in and out; hearts linger. */
function alphaOf(p) {
  if (p.age < p.delay) return 0;
  const t = progress(p);
  switch (p.kind) {
    case 'heart': return fadeTail(t, 0.5);
    case 'zzz': return Math.min(1, t * 6) * fadeTail(t, 0.55);
    case 'sparkle': return Math.sin(Math.PI * t);
    case 'confetti': return fadeTail(t, 0.75);
    case 'sweat': return fadeTail(t, 0.7);
    case 'water': return fadeTail(t, 0.8);
    case 'star': return Math.min(1, t * 8) * fadeTail(t, 0.65);
    default: return fadeTail(t, 0.6);
  }
}

/**
 * Paint one pixel pattern centred on (cx, cy).
 * Equal characters in a row are merged into a single fillRect - a heart is 30
 * odd blocks, and at 120 particles that is the difference between a handful of
 * fills per frame and a few thousand.
 */
function drawShape(ctx, shape, cx, cy, unit, color, light) {
  const w = shape[0].length;
  const h = shape.length;
  const x0 = Math.round(cx - (w * unit) / 2);
  const y0 = Math.round(cy - (h * unit) / 2);
  for (let r = 0; r < h; r++) {
    const row = shape[r];
    let c = 0;
    while (c < w) {
      const ch = row[c];
      if (ch === '.') { c++; continue; }
      let run = 1;
      while (c + run < w && row[c + run] === ch) run++;
      ctx.fillStyle = ch === 'o' ? light : color;
      ctx.fillRect(x0 + c * unit, y0 + r * unit, run * unit, unit);
      c += run;
    }
  }
}

/** A four-point twinkle whose arms grow and shrink over its short life. */
function drawSparkle(ctx, p, unit) {
  const t = progress(p);
  const arms = Math.max(1, Math.round(1 + Math.sin(Math.PI * t) * 2));
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  // Half a block, rounded: at an odd `unit` a raw unit/2 would put the arms on
  // half pixels and the twinkle would blur.
  const half = Math.round(unit / 2);
  ctx.fillStyle = p.color;
  ctx.fillRect(x - unit, y - unit, unit * 2, unit * 2);
  for (let i = 1; i <= arms; i++) {
    const d = unit * (i + 1);
    ctx.fillRect(x - half, y - d, unit, unit);
    ctx.fillRect(x - half, y + d - unit, unit, unit);
    ctx.fillRect(x - d, y - half, unit, unit);
    ctx.fillRect(x + d - unit, y - half, unit, unit);
  }
}

/**
 * Draw the whole layer.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} list
 * @param {number} scale DIPs per sprite pixel, i.e. settings.scale
 */
function draw(ctx, list, scale) {
  if (!ctx || !list || list.length === 0) return;
  const s = typeof scale === 'number' && scale > 0 ? scale : 1;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const a = alphaOf(p);
    if (a <= 0.02) continue;
    ctx.globalAlpha = a;

    // Half a sprite pixel per particle block: chunky, but clearly smaller
    // than Pip so the eye reads him as the subject.
    const unit = Math.max(1, Math.round(s * 0.5 * p.size));

    switch (p.kind) {
      case 'heart':
        drawShape(ctx, SHAPES.heart, p.x, p.y, unit, p.color, COLORS.light);
        break;
      case 'zzz':
        drawShape(ctx, SHAPES.zzz, p.x, p.y, unit, p.color, COLORS.light);
        break;
      case 'sparkle':
        drawSparkle(ctx, p, unit);
        break;
      case 'confetti': {
        // Tumbling is faked by squeezing the width: a rotating rectangle seen
        // edge-on is a thin sliver, which is all the illusion needs.
        const cw = Math.max(unit, Math.round(Math.abs(Math.cos(p.rot)) * unit * 3));
        const ch = unit * 2;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x - cw / 2), Math.round(p.y - ch / 2), cw, ch);
        break;
      }
      case 'sweat':
      case 'water':
        drawShape(ctx, SHAPES.drop, p.x, p.y, unit, p.color, COLORS.light);
        break;
      case 'star':
        drawShape(ctx, SHAPES.star, p.x, p.y, unit, p.color, COLORS.light);
        break;
    }
  }

  ctx.restore();
}

const Particles = {
  KINDS,
  MAX_PARTICLES,
  COLORS,
  SHAPES,
  create,
  spawn,
  update,
  draw,
  progress,
  alphaOf
};

if (typeof window !== 'undefined') {
  window.Pip = window.Pip || {};
  window.Pip.Particles = Particles;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Particles;
}
