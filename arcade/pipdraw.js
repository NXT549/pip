/*
 * pipdraw.js - drawing Pips inside the arcade.
 *
 * The same frames and the same composer as the desktop Pip, so a Pip in the
 * Pipdex, the gacha reveal or a minigame is exactly the Pip you would get.
 *
 *   PipDraw.frame(typeId, frameName, {silhouette}) -> 64x64 canvas (cached)
 *   PipDraw.draw(ctx, typeId, frameName, x, y, scale, {flip, silhouette, alpha})
 *   PipDraw.stage(typeId, {x, y, scale, clip, effects}) -> a little player
 *       with .update(dt) .draw(ctx) .play(clip) .particles - it runs the
 *       Pip's clip, his special effect and its particles.
 */

(function () {
  'use strict';

  const P = window.Pip;
  const SIZE = 64;
  const SILHOUETTE = '#3b3060';

  const cache = new Map();

  function paletteFor(type, silhouette) {
    if (!silhouette) return P.Palettes.resolve(type.palette);
    const out = {};
    for (const k of P.Palettes.ALL_KEYS) out[k] = SILHOUETTE;
    return out;
  }

  function entry(typeId, name, opts) {
    opts = opts || {};
    const key = typeId + '|' + name + '|' + (opts.silhouette ? 's' : '') + '|' + (opts.blink ? 'b' : '');
    let e = cache.get(key);
    if (e) return e;
    const type = P.Pips.get(typeId);
    const rows = P.Compose.compose(name, { type: type, blink: !!opts.blink }) || P.Sprites.FRAMES.idle_0;
    const c = document.createElement('canvas');
    c.width = SIZE;
    c.height = SIZE;
    const g = c.getContext('2d');
    const img = g.createImageData(SIZE, SIZE);
    img.data.set(P.Compose.toRGBA(rows, paletteFor(type, opts.silhouette)));
    g.putImageData(img, 0, 0);
    e = { canvas: c, rows: rows };
    cache.set(key, e);
    if (cache.size > 600) cache.delete(cache.keys().next().value);
    return e;
  }

  function frame(typeId, name, opts) {
    return entry(typeId, name, opts).canvas;
  }

  /** Draw a Pip frame with its top-left at (x, y), 64 * scale pixels square. */
  function draw(ctx, typeId, name, x, y, scale, opts) {
    opts = opts || {};
    const c = frame(typeId, name, opts);
    const s = scale || 1;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    if (opts.filter) ctx.filter = opts.filter;
    if (opts.flip) {
      ctx.translate(Math.round(x + SIZE * s), Math.round(y));
      ctx.scale(-1, 1);
      ctx.drawImage(c, 0, 0, SIZE * s, SIZE * s);
    } else {
      ctx.drawImage(c, Math.round(x), Math.round(y), SIZE * s, SIZE * s);
    }
    ctx.restore();
  }

  /**
   * A Pip that plays clips on its own, with its special effect running -
   * used for the gacha reveal, the Pipdex close-up and the jackpot dance.
   */
  function stage(typeId, opts) {
    opts = opts || {};
    const type = P.Pips.get(typeId);
    const st = {
      typeId: typeId,
      x: opts.x || 0,
      y: opts.y || 0,
      scale: opts.scale || 1,
      flip: !!opts.flip,
      clip: opts.clip || 'idle',
      t: 0,
      now: 0,
      particles: [],
      fx: opts.effects === false || !type.effect ? null : P.Effects.create(type.effect, 'full'),
      blinkAt: 2000,
      blinkUntil: 0,

      play(clip) {
        if (!P.Animations.CLIPS[clip]) return;
        this.clip = clip;
        this.t = 0;
      },

      frameName() {
        const res = P.Animations.frameAt(this.clip, this.t);
        if (res.done) {
          const next = P.Animations.CLIPS[this.clip].next;
          this.clip = next || 'idle';
          this.t = 0;
          return P.Animations.frameAt(this.clip, 0).frame;
        }
        return res.frame;
      },

      rect() {
        return { left: this.x, top: this.y, width: SIZE * this.scale, height: SIZE * this.scale };
      },

      info(e) {
        const r = this.rect();
        const self = this;
        return {
          rect: r,
          entry: e,
          meta: P.Sprites.FRAME_META[this.current],
          facing: this.flip ? -1 : 1,
          moving: false,
          px: this.scale,
          toScreen: (rr, cc) => ({
            x: r.left + ((self.flip ? SIZE - cc : cc) / SIZE) * r.width,
            y: r.top + (rr / SIZE) * r.height
          }),
          drawSprite: (img, alpha, filter, blend) => {
            const ctx = self.ctx;
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
            if (filter) ctx.filter = filter;
            if (blend) ctx.globalCompositeOperation = blend;
            if (self.flip) {
              ctx.translate(r.left + r.width, r.top);
              ctx.scale(-1, 1);
              ctx.drawImage(img, 0, 0, r.width, r.height);
            } else {
              ctx.drawImage(img, r.left, r.top, r.width, r.height);
            }
            ctx.restore();
          }
        };
      },

      update(dt) {
        this.t += dt * 1000;
        this.now += dt * 1000;
        if (this.now > this.blinkAt) {
          this.blinkUntil = this.now + 110;
          this.blinkAt = this.now + 2400 + Math.random() * 3600;
        }
        this.current = this.frameName();
        if (this.fx && this.ctx) {
          const e = entry(this.typeId, this.current);
          this.fx.update(dt, this.now, this.info(e), (kind, x, y, n, o) => P.Particles.spawn(this.particles, kind, x, y, n, o));
        }
        this.particles = P.Particles.update(this.particles, dt);
      },

      draw(ctx) {
        this.ctx = ctx;
        if (!this.current) this.current = this.frameName();
        const live = P.Sprites.FRAME_META[this.current] && P.Sprites.FRAME_META[this.current].eyes.length;
        const e = entry(this.typeId, this.current, { blink: live && this.now < this.blinkUntil });
        const info = this.info(e);
        if (this.fx) this.fx.drawBehind(ctx, this.now, info);
        const fx = this.fx;
        info.drawSprite(e.canvas, fx ? fx.alpha(this.now) : 1, fx ? fx.filter(this.now) : '');
        if (this.fx) this.fx.drawFront(ctx, this.now, info);
        P.Particles.draw(ctx, this.particles, this.scale * 2);
      },

      burst(kind, n) {
        const r = this.rect();
        P.Particles.spawn(this.particles, kind, r.left + r.width / 2, r.top + r.height * 0.55, n);
      }
    };
    return st;
  }

  window.Pip.PipDraw = { SIZE, SILHOUETTE, frame, draw, stage, entry };
})();
