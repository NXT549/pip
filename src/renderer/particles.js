/*
 * particles.js - the little things that fly off Pip.
 *
 * A layer of its own, drawn above Pip and never hit-tested: particles are
 * decoration, so the click-through window must never turn solid because a
 * heart happened to float under the cursor.
 *
 * Every kind is a literal pixel pattern drawn as filled rects on the same
 * grid as Pip's own pixels, outlined the way he is. A smooth vector heart
 * next to a 64px pixel-art bean would read as a different program's UI.
 *
 * Units follow physics.js so the renderer can run both from the same `dt`:
 * positions are DIPs, velocities DIP/s, and ages and lifetimes are SECONDS.
 *
 * The list is capped. Bursts arrive from main (`pip:particles`) and from the
 * special effects, and nothing upstream throttles them, so an enthusiastic
 * user must cost a fixed amount of work per frame, not an ever-growing one.
 */

(function () {
  'use strict';

  /** Every kind that can be spawned. */
  const KINDS = [
    'heart', 'zzz', 'sparkle', 'confetti', 'sweat', 'water', 'star',
    'dust', 'note', 'question', 'exclaim', 'steam', 'tear', 'bubble',
    'crumb', 'coin', 'petal', 'snow', 'ember', 'spark'
  ];

  /** Hard ceiling on the layer. Oldest particles are pushed out first. */
  const MAX_PARTICLES = 160;

  /** Same guard physics.js uses: one slow frame must not teleport anything. */
  const MAX_DT = 0.1;

  const TAU = Math.PI * 2;

  /*
   * Particles are chrome rather than body, so they keep their own colours and
   * this module stays free of any load-order dependency on palettes.js.
   * `X` is the main colour, `o` the highlight, `d` the shade and `#` the
   * outline - the same dark plum Pip is outlined in.
   */
  const OUTLINE = '#2a1a2d';
  const COLORS = {
    heart: '#ff5f8d',
    zzz: '#cfd6ff',
    sparkle: '#ffe680',
    sweat: '#a9dcff',
    water: '#6cc4f5',
    tear: '#8fd0ff',
    star: '#ffe07a',
    dust: '#e6ddd2',
    note: ['#ff8db5', '#8fd0ff', '#b8f28a', '#ffd36a', '#c9a6ff'],
    question: '#ffe680',
    exclaim: '#ff6b5a',
    steam: '#f4f0f6',
    bubble: '#9fdcff',
    crumb: '#c98d4c',
    coin: '#ffcf3f',
    petal: '#ffb3cf',
    snow: '#e8f6ff',
    ember: '#ff8a3c',
    spark: '#fff27a',
    confetti: ['#e2415a', '#68c445', '#4a7fe0', '#f2cc3d', '#9b5cd6', '#ffffff'],
    light: '#ffffff'
  };

  /** Kinds drawn without a dark outline - they are meant to look airy. */
  const NO_OUTLINE = { sparkle: true, snow: true, ember: true, spark: true, bubble: true };

  const SHAPES = {
    heart: [
      '.##...##.',
      '#oX#.#XX#',
      '#oXX#XXd#',
      '#XXXXXXd#',
      '.#XXXXd#.',
      '..#XXd#..',
      '...#d#...',
      '....#....'
    ],
    zzz: [
      '#######',
      '#XXXXX#',
      '####XX#',
      '..#XX#.',
      '.#XX###',
      '#XXXXX#',
      '#######'
    ],
    // a teardrop: pointed at the top, heavy at the bottom
    drop: [
      '..#..',
      '.#X#.',
      '.#X#.',
      '#XXX#',
      '#oXX#',
      '#XXd#',
      '.###.'
    ],
    star: [
      '...#...',
      '..#X#..',
      '###X###',
      '#XXoXX#',
      '.#XXX#.',
      '#X#.#X#',
      '##...##'
    ],
    dust: [
      '.###.',
      '#XXX#',
      '#XoX#',
      '.###.'
    ],
    note: [
      '..#####',
      '..#XXX#',
      '..#X##.',
      '..#X#..',
      '.##X#..',
      '#XXX#..',
      '#oXX#..',
      '.###...'
    ],
    question: [
      '.#####.',
      '#XXXXX#',
      '#X###X#',
      '.#.#XX#',
      '..#XX#.',
      '..#X#..',
      '..###..',
      '..#X#..',
      '..###..'
    ],
    exclaim: [
      '###',
      '#X#',
      '#X#',
      '#X#',
      '#X#',
      '###',
      '...',
      '###',
      '#X#',
      '###'
    ],
    steam: [
      '..###..',
      '.#XXX##',
      '#XXoXX#',
      '#XXXXX#',
      '.#####.'
    ],
    bubble: [
      '..XXX..',
      '.X...X.',
      'X.o...X',
      'X.o...X',
      'X.....X',
      '.X...X.',
      '..XXX..'
    ],
    crumb: [
      '##.',
      '#X#',
      '.##'
    ],
    coin: [
      '..###..',
      '.#XXX#.',
      '#XoXXd#',
      '#XoXXd#',
      '#XoXXd#',
      '.#XXd#.',
      '..###..'
    ],
    coin_mid: [
      '.###.',
      '#XXd#',
      '#oXd#',
      '#oXd#',
      '#oXd#',
      '#XXd#',
      '.###.'
    ],
    coin_edge: [
      '###',
      '#X#',
      '#X#',
      '#X#',
      '#X#',
      '#X#',
      '###'
    ],
    petal: [
      '..##.',
      '.#XX#',
      '#XoX#',
      '#XX#.',
      '.##..'
    ],
    snow: [
      '..X..',
      'X.X.X',
      '.XoX.',
      'X.X.X',
      '..X..'
    ],
    ember: [
      '.X.',
      'XoX',
      '.X.'
    ],
    spark: [
      'X...X',
      '.X.X.',
      '..o..',
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
   * Negative-ish values mean it is still waiting out its stagger delay, which
   * is how the three z's of a `zzz` puff leave Pip one after the other.
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

  function pickColor(list, rng) {
    return list[Math.floor(rng() * list.length) % list.length];
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
    const dir = typeof opts.dir === 'number' ? (opts.dir < 0 ? -1 : 1) : (rng() < 0.5 ? -1 : 1);

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
      // an effect's own particles: they never keep the loop at full speed
      ambient: !!opts.ambient,
      color: typeof COLORS[k] === 'string' ? COLORS[k] : COLORS.sparkle,
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
        p.color = pickColor(COLORS.confetti, rng);
        break;

      case 'sweat':
        // Flicks off sideways first, then gravity takes over - the classic
        // anime bead of sweat leaving the side of the head.
        p.vx = dir * rand(rng, 110, 190);
        p.vy = -rand(rng, 30, 90);
        p.gravity = 1200;
        p.life = rand(rng, 0.7, 1.0);
        break;

      case 'water':
        p.x += rand(rng, -9, 9);
        p.vx = rand(rng, -20, 20);
        p.vy = rand(rng, 40, 120);
        p.gravity = 800;
        p.life = rand(rng, 0.8, 1.2);
        break;

      case 'tear':
        // Wells up, then rolls off the cheek.
        p.vx = dir * rand(rng, 16, 34);
        p.vy = -rand(rng, 0, 24);
        p.gravity = 700;
        p.size = p.size * 0.8;
        p.life = rand(rng, 0.7, 0.95);
        break;

      case 'star':
        // Dizzy stars do not fly anywhere: they circle the spawn point on a
        // squashed ellipse so the ring reads as going round Pip's head.
        p.radius = rand(rng, 18, 30);
        p.angle = typeof opts.angle === 'number' ? opts.angle : rng() * TAU;
        p.spinRate = rand(rng, 3.0, 4.6);
        p.life = rand(rng, 1.5, 2.1);
        p.x = p.cx + Math.cos(p.angle) * p.radius;
        p.y = p.cy + Math.sin(p.angle) * p.radius * 0.38;
        break;

      case 'dust':
        // Kicked up behind the feet: out, a little up, and gone.
        p.x += rand(rng, -4, 4);
        p.vx = dir * rand(rng, 18, 46);
        p.vy = -rand(rng, 6, 22);
        p.life = rand(rng, 0.45, 0.75);
        break;

      case 'note':
        p.x += rand(rng, -8, 8);
        p.vx = rand(rng, -8, 14);
        p.vy = -rand(rng, 28, 42);
        p.drift = rand(rng, 10, 18);
        p.life = rand(rng, 1.6, 2.2);
        p.color = pickColor(COLORS.note, rng);
        break;

      case 'question':
      case 'exclaim':
        // Pops up above the head with a small bounce, then hangs there.
        p.vy = -70;
        p.gravity = 260;
        p.life = 1.3;
        break;

      case 'steam':
        p.x += rand(rng, -8, 8);
        p.vx = rand(rng, -16, 16);
        p.vy = -rand(rng, 30, 52);
        p.drift = rand(rng, 6, 12);
        p.life = rand(rng, 0.8, 1.2);
        break;

      case 'bubble':
        p.x += rand(rng, -10, 10);
        p.vx = rand(rng, -8, 8);
        p.vy = -rand(rng, 18, 34);
        p.drift = rand(rng, 10, 18);
        p.life = rand(rng, 1.8, 2.6);
        break;

      case 'crumb':
        p.vx = rand(rng, -60, 60);
        p.vy = -rand(rng, 40, 110);
        p.gravity = 900;
        p.life = rand(rng, 0.55, 0.85);
        break;

      case 'coin':
        // Pops up spinning, arcs over and fades on the way down.
        p.vx = rand(rng, -34, 34);
        p.vy = -rand(rng, 140, 200);
        p.gravity = 520;
        p.spin = rand(rng, 8, 12);
        p.life = rand(rng, 1.0, 1.3);
        break;

      case 'petal':
        p.vx = rand(rng, -12, 12);
        p.vy = rand(rng, 16, 28);
        p.drift = rand(rng, 20, 32);
        p.spin = rand(rng, -3, 3);
        p.life = rand(rng, 2.0, 3.0);
        break;

      case 'snow':
        p.vx = rand(rng, -6, 6);
        p.vy = rand(rng, 12, 24);
        p.drift = rand(rng, 6, 12);
        p.life = rand(rng, 2.0, 3.0);
        break;

      case 'ember':
        p.x += rand(rng, -6, 6);
        p.vx = rand(rng, -10, 10);
        p.vy = -rand(rng, 30, 60);
        p.drift = rand(rng, 6, 12);
        p.life = rand(rng, 0.6, 1.1);
        break;

      case 'spark':
        p.vx = rand(rng, -70, 70);
        p.vy = rand(rng, -70, 20);
        p.life = rand(rng, 0.22, 0.38);
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
      if ((kind === 'zzz' || kind === 'note' || kind === 'steam') && o.delay === undefined) o.delay = i * 0.28;
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
      case 'note':
      case 'steam':
      case 'bubble':
      case 'petal':
      case 'snow':
      case 'ember':
        p.x += (p.vx + Math.sin(p.phase + p.age * 3.2) * p.drift) * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        break;

      case 'sparkle':
      case 'dust':
      case 'spark':
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        break;

      case 'confetti':
        p.vy += p.gravity * dt;
        p.x += (p.vx + Math.sin(p.phase + p.age * 6) * p.drift) * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        break;

      case 'question':
      case 'exclaim':
        // rise, settle, hang
        p.vy = Math.min(0, p.vy + p.gravity * dt);
        p.y += p.vy * dt;
        break;

      case 'sweat':
      case 'water':
      case 'tear':
      case 'crumb':
      case 'coin':
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
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
      case 'dust': return 0.85 * fadeTail(t, 0.2);
      case 'question':
      case 'exclaim': return Math.min(1, t * 10) * fadeTail(t, 0.75);
      case 'steam': return 0.9 * fadeTail(t, 0.3);
      case 'bubble': return t > 0.94 ? 0 : 0.95;       // it pops rather than fades
      case 'ember': return (0.6 + 0.4 * Math.sin(p.age * 30 + p.phase)) * fadeTail(t, 0.4);
      case 'spark': return t < 0.5 ? 1 : fadeTail(t, 0.5);
      case 'snow':
      case 'petal': return Math.min(1, t * 5) * fadeTail(t, 0.7);
      default: return fadeTail(t, 0.6);
    }
  }

  /** Darken a #rrggbb colour, for the `d` shade in a pattern. */
  const shadeCache = Object.create(null);
  function shade(hex) {
    if (shadeCache[hex]) return shadeCache[hex];
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.round(v * 0.72);
    const out = '#' + [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)]
      .map((v) => (v < 16 ? '0' : '') + v.toString(16)).join('');
    shadeCache[hex] = out;
    return out;
  }

  /**
   * Paint one pixel pattern centred on (cx, cy).
   * Equal characters in a row are merged into a single fillRect - a heart is
   * dozens of blocks, and at 160 particles that is the difference between a
   * handful of fills per frame and a few thousand.
   */
  function drawShape(ctx, shape, cx, cy, unit, color, outline) {
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
        if (ch === '#') {
          if (!outline) { c += run; continue; }
          ctx.fillStyle = OUTLINE;
        } else {
          ctx.fillStyle = ch === 'o' ? COLORS.light : ch === 'd' ? shade(color) : color;
        }
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
    // Half a block, rounded: at an odd `unit` a raw unit/2 would put the arms
    // on half pixels and the twinkle would blur.
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

  /** The shape a kind is drawn with right now. */
  function shapeFor(p) {
    switch (p.kind) {
      case 'sweat':
      case 'water':
      case 'tear':
        return SHAPES.drop;
      case 'coin': {
        // spinning: full face, three-quarter, edge-on
        const c = Math.abs(Math.cos(p.rot));
        return c > 0.7 ? SHAPES.coin : c > 0.3 ? SHAPES.coin_mid : SHAPES.coin_edge;
      }
      default:
        return SHAPES[p.kind] || null;
    }
  }

  /**
   * Draw the whole layer.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} list
   * @param {number} scale DIPs per pixel of the old 32px art (renderer unit())
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

      // One block is one pixel of Pip's own art, so particles and Pip share
      // a pixel grid.
      const unit = Math.max(1, Math.round(s * 0.5 * p.size));

      if (p.kind === 'sparkle') {
        drawSparkle(ctx, p, unit);
      } else if (p.kind === 'confetti') {
        // Tumbling is faked by squeezing the width: a rotating rectangle seen
        // edge-on is a thin sliver, which is all the illusion needs.
        const cw = Math.max(unit, Math.round(Math.abs(Math.cos(p.rot)) * unit * 3));
        const ch = unit * 2;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x - cw / 2), Math.round(p.y - ch / 2), cw, ch);
      } else {
        const shape = shapeFor(p);
        if (shape) drawShape(ctx, shape, p.x, p.y, unit, p.color, !NO_OUTLINE[p.kind]);
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
})();
