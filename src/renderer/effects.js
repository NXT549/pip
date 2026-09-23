/*
 * effects.js - the special effects of the rarer Pips.
 *
 * Rare Pips have a subtle effect, epic ones a strong one, and the two
 * legendaries a showpiece. Everything here is decoration: drawn around and
 * over Pip, never hit-tested, and never allowed to cost much. Effects tick
 * at 15fps at most (the renderer's FX_MS), their particles are marked
 * `ambient` so they do not keep the loop at full speed, and the Settings
 * "special effects" level turns them down or off entirely.
 *
 * An effect instance:
 *   animated          needs redrawing even while Pip stands still
 *   update(dt, now, info, spawn)   emit particles; dt in seconds
 *   onLand(info, spawn)            a landing (the prism's sparkle burst)
 *   alpha(now) offsetX(now) offsetY(now) filter(now)
 *                     how Pip himself is drawn (ghostly, hovering, hue-shifted)
 *   drawBehind(ctx, now, info) / drawFront(ctx, now, info)
 *
 * `info` comes from the renderer: the sprite rect, the composed frame
 * (entry.canvas / entry.rows), its metadata, which way he faces, whether he
 * is moving, and drawSprite(canvas, alpha, filter) which draws any 64x64
 * canvas with exactly Pip's own transform.
 */

(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const SIZE = 64;

  const RAINBOW = ['#ff5f6d', '#ffb347', '#ffe36b', '#7ee07a', '#5ad1ff', '#9b7bff', '#ff8fc8'];

  /*
   * The effects, as data. `emit` lists particle emitters: a kind, how often
   * (seconds), where (area) and optionally a colour or colour list.
   */
  const SPECS = {
    snow:     { emit: [{ kind: 'snow', every: 0.5, area: 'fall' }] },
    embers:   { emit: [{ kind: 'ember', every: 0.32, area: 'top' }] },
    glow:     { aura: { color: '#e4ff9a', pulse: 1.8, lo: 0.25, hi: 0.7 } },
    fizz:     { emit: [{ kind: 'bubble', every: 0.65, area: 'body', size: 0.8 }] },
    petals:   { emit: [{ kind: 'petal', every: 0.6, area: 'fall' }] },
    crackle:  { emit: [{ kind: 'spark', every: 0.4, area: 'body', count: 2 }] },
    hue:      { hue: 14 },
    ghost:    { alpha: 0.62, bob: [3, 2.6] },
    glints:   { emit: [{ kind: 'sparkle', every: 0.35, area: 'body', size: 0.7, color: '#fff4ff' }] },
    notes:    { emit: [{ kind: 'note', every: 1.3, area: 'head' }] },

    galaxy:   { emit: [{ kind: 'sparkle', every: 0.22, area: 'body', size: 0.55, color: '#ffffff' }], orbit: { period: 5.5 } },
    rainbow:  { hue: 80, trail: { every: 0.07, colors: RAINBOW } },
    golden:   { shine: 3.2, emit: [{ kind: 'coin', every: 2.8, area: 'top' }, { kind: 'sparkle', every: 0.9, area: 'body', size: 0.7, color: '#fff3b0' }] },
    neon:     { aura: { color: '#00ffd5', pulse: 0.8, lo: 0.4, hi: 0.9, blend: 'lighter' }, glitch: 0.03 },
    aurora:   { aura: { color: '#6bffb8', pulse: 3.2, lo: 0.3, hi: 0.65, sweep: 70 }, emit: [{ kind: 'sparkle', every: 0.7, area: 'body', size: 0.7, color: '#b8ffe0' }] },
    magma:    { aura: { color: '#ff6a1a', pulse: 1.3, lo: 0.25, hi: 0.6 }, emit: [{ kind: 'ember', every: 0.26, area: 'top' }] },

    celestial:{ halo: true, bob: [4, 3.2], aura: { color: '#ffe9a6', pulse: 2.4, lo: 0.15, hi: 0.4 },
                emit: [{ kind: 'sparkle', every: 0.45, area: 'around', size: 0.7, color: '#fff3c4' }],
                trail: { every: 0.09, colors: ['#ffe36b', '#fff3c4', '#ffffff'], kind: 'star' } },
    prism:    { hue: 30, hueWobble: true, rays: true, burst: true,
                emit: [{ kind: 'sparkle', every: 0.4, area: 'body', size: 0.8, colors: RAINBOW }] }
  };

  const NAMES = Object.keys(SPECS);

  function rand(lo, hi) {
    return lo + Math.random() * (hi - lo);
  }

  /* ---------------------------------------------------------------- *
   * Silhouette helpers (browser only)
   * ---------------------------------------------------------------- */

  function canvas64() {
    const c = document.createElement('canvas');
    c.width = SIZE;
    c.height = SIZE;
    return c;
  }

  /**
   * A glow ring around the composed frame: 1px solid, 1px half, in `color`.
   * Cached on the frame entry, so it is built once per pose, not per tick.
   */
  function ringFor(entry, color) {
    entry._rings = entry._rings || {};
    if (entry._rings[color]) return entry._rings[color];
    const rows = entry.rows;
    const c = canvas64();
    const g = c.getContext('2d');
    const img = g.createImageData(SIZE, SIZE);
    const rgb = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
    const solid = (r, cc) => r >= 0 && r < SIZE && cc >= 0 && cc < SIZE && rows[r][cc] !== '.';
    for (let r = 0; r < SIZE; r++) {
      for (let cc = 0; cc < SIZE; cc++) {
        if (solid(r, cc)) continue;
        let near = false, far = false;
        for (let dr = -2; dr <= 2 && !near; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            if (!solid(r + dr, cc + dc)) continue;
            if (Math.abs(dr) <= 1 && Math.abs(dc) <= 1) { near = true; break; }
            far = true;
          }
        }
        if (!near && !far) continue;
        const i = (r * SIZE + cc) * 4;
        img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2];
        img.data[i + 3] = near ? 255 : 110;
      }
    }
    g.putImageData(img, 0, 0);
    entry._rings[color] = c;
    return c;
  }

  /** A random opaque pixel of the frame, as [row, col]. */
  function randomBodyPixel(rows) {
    for (let tries = 0; tries < 24; tries++) {
      const r = Math.floor(Math.random() * SIZE);
      const c = Math.floor(Math.random() * SIZE);
      if (rows[r][c] !== '.' && rows[r][c] !== 'O') return [r, c];
    }
    return [32, 32];
  }

  let shineCanvas = null;

  /* ---------------------------------------------------------------- *
   * An effect instance
   * ---------------------------------------------------------------- */

  /**
   * @param {string} name   one of NAMES
   * @param {string} level  'full' | 'reduced' | 'off'
   * @returns {object|null} null when there is nothing to do
   */
  function create(name, level) {
    const spec = SPECS[name];
    if (!spec || level === 'off') return null;
    const reduced = level === 'reduced';
    const rate = reduced ? 0.4 : 1;
    const timers = (spec.emit || []).map(() => Math.random());
    let trailTimer = 0;
    let glitchUntil = 0;
    let glitchX = 0;

    const inst = {
      name: name,
      level: level,
      // Anything that changes Pip's own look over time needs redrawing.
      animated: !!(spec.aura || spec.hue || spec.bob || spec.shine || spec.orbit || spec.halo || spec.rays || spec.glitch),

      update(dt, now, info, spawn) {
        (spec.emit || []).forEach((e, i) => {
          timers[i] -= dt * rate;
          if (timers[i] > 0) return;
          timers[i] += e.every * rand(0.7, 1.3);
          const n = e.count || 1;
          for (let k = 0; k < n; k++) {
            const at = emitPoint(e.area, info);
            const color = e.colors ? e.colors[Math.floor(Math.random() * e.colors.length)] : e.color;
            spawn(e.kind, at.x, at.y, 1, { size: e.size, color: color, ambient: true });
          }
        });
        if (spec.trail && info.moving) {
          trailTimer -= dt * rate;
          if (trailTimer <= 0) {
            trailTimer = spec.trail.every;
            const color = spec.trail.colors[Math.floor((now / 90) % spec.trail.colors.length)];
            const back = info.rect.left + (info.facing === 1 ? 0.2 : 0.8) * info.rect.width;
            spawn(spec.trail.kind === 'star' ? 'sparkle' : 'sparkle', back, info.rect.top + rand(0.6, 0.9) * info.rect.height, 1,
              { color: color, size: 0.8, ambient: true });
          }
        }
        if (spec.glitch && !reduced && now > glitchUntil && Math.random() < spec.glitch * dt * 15) {
          glitchUntil = now + rand(60, 140);
          glitchX = (Math.random() < 0.5 ? -1 : 1) * info.px * rand(1, 3);
        }
      },

      onLand(info, spawn) {
        if (!spec.burst) return;
        for (let i = 0; i < 8; i++) {
          spawn('sparkle', info.rect.left + info.rect.width * rand(0.2, 0.8), info.rect.top + info.rect.height * rand(0.6, 0.95), 1,
            { color: RAINBOW[i % RAINBOW.length], ambient: true });
        }
      },

      alpha() {
        return spec.alpha || 1;
      },

      offsetX(now) {
        return now < glitchUntil ? glitchX : 0;
      },

      offsetY(now, px) {
        if (!spec.bob) return 0;
        const amp = spec.bob[0] * px * (reduced ? 0.5 : 1);
        return -amp - amp * Math.sin((now / 1000) * TAU / spec.bob[1]);
      },

      filter(now) {
        let f = '';
        if (spec.hue) {
          const speed = spec.hue * (reduced ? 0.25 : 1);
          const deg = spec.hueWobble ? Math.sin(now / 700) * spec.hue : (now / 1000) * speed;
          f += 'hue-rotate(' + Math.round(deg % 360) + 'deg)';
        }
        if (now < glitchUntil) f += (f ? ' ' : '') + 'hue-rotate(90deg) saturate(1.6)';
        return f;
      },

      drawBehind(ctx, now, info) {
        if (spec.rays) drawRays(ctx, now, info, reduced);
        if (spec.orbit) drawOrbit(ctx, now, info, spec.orbit, true);
        if (spec.aura) {
          const a = spec.aura;
          const t = reduced ? 0.5 : 0.5 + 0.5 * Math.sin((now / 1000) * TAU / a.pulse);
          const alpha = a.lo + (a.hi - a.lo) * t;
          const filter = a.sweep && !reduced ? 'hue-rotate(' + Math.round(Math.sin(now / 1400) * a.sweep) + 'deg)' : '';
          info.drawSprite(ringFor(info.entry, a.color), alpha, filter, a.blend);
        }
        if (spec.halo) drawHalo(ctx, now, info, false);
      },

      drawFront(ctx, now, info) {
        if (spec.shine) drawShine(now, info, spec.shine);
        if (spec.orbit) drawOrbit(ctx, now, info, spec.orbit, false);
        if (spec.halo) drawHalo(ctx, now, info, true);
      }
    };
    return inst;
  }

  /** Where an emitter puts a particle, in screen DIPs. */
  function emitPoint(area, info) {
    const r = info.rect;
    const top = info.toScreen(info.meta ? info.meta.top : 24, 32).y;
    switch (area) {
      case 'fall':    // drifting down across him from above
        return { x: r.left + rand(0.05, 0.95) * r.width, y: top - r.height * rand(0.05, 0.3) };
      case 'top':     // rising off the top of the head
        return { x: r.left + rand(0.3, 0.7) * r.width, y: top + r.height * 0.04 };
      case 'head': {
        const eyes = info.meta && info.meta.eyes && info.meta.eyes[0];
        const p = eyes ? info.toScreen(eyes.r - 6, eyes.c + 6) : { x: r.left + r.width * 0.7, y: top };
        return { x: p.x, y: p.y };
      }
      case 'around':
        return { x: r.left + rand(-0.1, 1.1) * r.width, y: top + rand(-0.2, 0.7) * (r.top + r.height - top) };
      case 'body':
      default: {
        const px = randomBodyPixel(info.entry.rows);
        return info.toScreen(px[0] + 0.5, px[1] + 0.5);
      }
    }
  }

  /** A band of light sweeping diagonally across the body, masked to it. */
  function drawShine(now, info, period) {
    if (!shineCanvas) shineCanvas = canvas64();
    const g = shineCanvas.getContext('2d');
    const t = ((now / 1000) % period) / period;
    if (t > 0.45) return;                  // a sweep, then a rest
    const x = -16 + (t / 0.45) * 96;
    g.clearRect(0, 0, SIZE, SIZE);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#ffffff';
    for (let r = 0; r < SIZE; r++) g.fillRect(Math.round(x - r * 0.6), r, 5, 1);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    for (let r = 0; r < SIZE; r++) g.fillRect(Math.round(x - r * 0.6) + 7, r, 2, 1);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(info.entry.canvas, 0, 0);
    g.globalCompositeOperation = 'source-over';
    info.drawSprite(shineCanvas, 0.7);
  }

  /** A little moon on a tilted orbit, behind him for half of it. */
  function drawOrbit(ctx, now, info, orbit, behind) {
    const a = ((now / 1000) / orbit.period) * TAU;
    const inBack = Math.sin(a) < 0;
    if (inBack !== behind) return;
    const r = info.rect;
    const cx = r.left + r.width / 2;
    const cy = info.toScreen(40, 32).y;
    const x = cx + Math.cos(a) * r.width * 0.46;
    const y = cy + Math.sin(a) * r.height * 0.13 - r.height * 0.06;
    const u = Math.max(1, Math.round(info.px));
    const moon = ['.###.', '#ooX#', '#oXX#', '#XXX#', '.###.'];
    ctx.save();
    ctx.globalAlpha = inBack ? 0.55 : 1;
    for (let dr = 0; dr < moon.length; dr++) {
      for (let dc = 0; dc < moon[dr].length; dc++) {
        const ch = moon[dr][dc];
        if (ch === '.') continue;
        ctx.fillStyle = ch === '#' ? '#2a1a2d' : ch === 'o' ? '#ffffff' : '#d9d2ff';
        ctx.fillRect(Math.round(x + (dc - 2.5) * u), Math.round(y + (dr - 2.5) * u), u, u);
      }
    }
    ctx.restore();
  }

  /** A halo floating over his head: the back half behind him, the front over. */
  function drawHalo(ctx, now, info, front) {
    const meta = info.meta;
    if (!meta || meta.rotate) return;
    const p = info.toScreen(meta.crown.r - 5 + Math.sin(now / 520) * 1.2, meta.crown.c);
    const u = Math.max(1, Math.round(info.px));
    const rx = 7, ry = 2;
    ctx.save();
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU;
      const isFront = Math.sin(a) > 0;
      if (isFront !== front) continue;
      ctx.fillStyle = i % 5 === 0 ? '#ffffff' : '#ffd23f';
      ctx.fillRect(Math.round(p.x + Math.cos(a) * rx * u), Math.round(p.y + Math.sin(a) * ry * u), u, u);
    }
    ctx.restore();
  }

  /** Prism light: pixel rays turning slowly behind him. */
  function drawRays(ctx, now, info, reduced) {
    const r = info.rect;
    const cx = r.left + r.width / 2;
    const cy = info.toScreen(40, 32).y;
    const u = Math.max(1, Math.round(info.px));
    const spin = reduced ? 0 : now / 4000;
    ctx.save();
    ctx.globalAlpha = 0.28;
    for (let i = 0; i < 8; i++) {
      const a = spin + (i / 8) * TAU;
      ctx.fillStyle = RAINBOW[i % RAINBOW.length];
      for (let d = 18; d < 44; d += 2) {
        ctx.fillRect(Math.round(cx + Math.cos(a) * d * u), Math.round(cy + Math.sin(a) * d * u * 0.8), u * 2, u * 2);
      }
    }
    ctx.restore();
  }

  const Effects = { NAMES, SPECS, RAINBOW, create };

  if (typeof window !== 'undefined') {
    window.Pip = window.Pip || {};
    window.Pip.Effects = Effects;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Effects;
  }
})();
