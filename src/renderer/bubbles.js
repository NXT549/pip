/*
 * bubbles.js - Pip's speech bubble: how long it lives and where it goes.
 *
 * One bubble exists at a time; the caller enforces that, `create` just builds
 * one. Lifetime is fixed at 4000 ms with a fade over the last 600 ms, because
 * a bubble that vanishes instantly reads as a glitch rather than as speech.
 *
 * The hard part is placement. The overlay covers the whole work area, so the
 * bubble is only ever near an edge when Pip is, and a bubble clipped by the
 * screen edge looks broken. `layout` therefore clamps the panel fully inside
 * the viewport and then slides the tail along the panel so it still points at
 * Pip - the tail moves, never the panel off-screen.
 *
 * Nothing here touches the DOM: `measure` and `layout` work with a null ctx
 * (falling back to a monospace character-width estimate), so they are testable
 * in plain Node. Only `draw` needs a real canvas.
 *
 * Bubbles are chrome, not Pip, so their two colours are fixed rather than
 * flavour-swapped: a light panel with the same dark outline Pip is drawn with.
 */

'use strict';

/** How long a bubble stays up, ms. Fixed by the architecture contract. */
const LIFETIME_MS = 4000;

/** The tail of that lifetime spent fading out, ms. */
const FADE_MS = 600;

/** Non-essential chatter may not repeat inside this window, ms. */
const CHATTER_COOLDOWN_MS = 120000;

/** Widest a bubble gets before it wraps, DIPs. */
const MAX_WIDTH = 240;

const FONT_SIZE = 12;
const FONT = '12px "Consolas", "Lucida Console", "DejaVu Sans Mono", monospace';

/** Estimate used when there is no canvas (tests). Monospace, so it is close. */
const CHAR_W = FONT_SIZE * 0.6;

const LINE_H = 16;
const PAD_X = 10;
const PAD_Y = 7;
const BORDER = 2;
const TAIL_W = 10;
const TAIL_H = 6;

/** Keep this clear of the viewport edge, DIPs. */
const MARGIN = 6;

/** Gap between Pip's sprite box and the tip of the tail, DIPs. */
const GAP = 3;

const PANEL = '#fdf3e3';   // warm paper
const DARK = '#2a1a2d';    // the outline colour Pip is drawn with
const INK = '#3b2334';     // the mouth colour, so the text matches his face

function clamp(v, lo, hi) {
  if (hi < lo) return lo;
  return v < lo ? lo : (v > hi ? hi : v);
}

/** Text width, from the canvas when there is one and from an estimate when not. */
function widthOf(ctx, s) {
  if (ctx && typeof ctx.measureText === 'function') {
    const m = ctx.measureText(s);
    if (m && typeof m.width === 'number' && isFinite(m.width)) return m.width;
  }
  return s.length * CHAR_W;
}

/**
 * Make a bubble.
 *
 * @param {string} text
 * @param {number} now  ms timestamp (performance.now or Date.now - only
 *                      differences matter, so either is fine as long as the
 *                      same clock is passed to `update`)
 * @param {number} [ms] override the lifetime; `pip:say` carries one
 * @returns {object} bubble
 */
function create(text, now, ms) {
  const t = typeof text === 'string' ? text.trim() : '';
  const start = typeof now === 'number' && isFinite(now) ? now : 0;
  const life = typeof ms === 'number' && isFinite(ms) && ms > 0 ? ms : LIFETIME_MS;
  return {
    text: t,
    createdAt: start,
    expiresAt: start + life,
    lifetime: life,
    alpha: 1
  };
}

/**
 * Age a bubble. Returns the same bubble with `alpha` refreshed, or null once
 * it has expired - so the caller's whole lifetime handling is
 * `bubble = Bubbles.update(bubble, now)`.
 */
function update(bubble, now) {
  if (!bubble) return null;
  const t = typeof now === 'number' && isFinite(now) ? now : 0;
  const left = bubble.expiresAt - t;
  if (left <= 0) return null;
  bubble.alpha = left >= FADE_MS ? 1 : Math.max(0, left / FADE_MS);
  return bubble;
}

/**
 * Word-wrap `text` and report the size of the panel that would hold it.
 *
 * @param {CanvasRenderingContext2D|null} ctx
 * @param {string} text
 * @param {number} [maxWidth] outer panel width limit, DIPs
 * @returns {{lines: string[], w: number, h: number}} w/h include padding and border
 */
function measure(ctx, text, maxWidth) {
  if (ctx && typeof ctx.measureText === 'function') {
    try { ctx.font = FONT; } catch (err) { /* headless-ish ctx, estimate instead */ }
  }

  const outer = typeof maxWidth === 'number' && maxWidth > 0 ? maxWidth : MAX_WIDTH;
  const limit = Math.max(4 * CHAR_W, outer - (PAD_X + BORDER) * 2);
  const src = typeof text === 'string' ? text : '';
  const lines = [];

  for (const para of src.split('\n')) {
    const words = para.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) { lines.push(''); continue; }
    let line = '';
    for (let word of words) {
      // A single word longer than the panel has to be broken, or it would
      // push the bubble off the screen no matter how we place it.
      while (widthOf(ctx, word) > limit && word.length > 1) {
        let cut = word.length;
        while (cut > 1 && widthOf(ctx, word.slice(0, cut)) > limit) cut--;
        if (line) { lines.push(line); line = ''; }
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const candidate = line ? line + ' ' + word : word;
      if (line && widthOf(ctx, candidate) > limit) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }

  if (lines.length === 0) lines.push('');

  let widest = 0;
  for (const l of lines) widest = Math.max(widest, widthOf(ctx, l));

  return {
    lines: lines,
    w: Math.ceil(widest) + (PAD_X + BORDER) * 2,
    h: lines.length * LINE_H + (PAD_Y + BORDER) * 2
  };
}

/**
 * Place the bubble for this frame.
 *
 * `pipRect` is Pip's sprite box in overlay DIPs ({left, top, width, height} -
 * what renderer.js's spriteRect() returns). `viewport` is the overlay itself,
 * whose origin is always (0, 0), so only {width, height} are read.
 *
 * Above Pip is the default. When there is no room above - Pip near the top of
 * the screen, or climbing - the bubble flips below him and the tail points up.
 *
 * @returns {{x,y,w,h,tailX,tailY,above,lines,alpha}} all in overlay DIPs
 */
function layout(bubble, pipRect, viewport, ctx) {
  const vw = viewport && viewport.width > 0 ? viewport.width : MAX_WIDTH + MARGIN * 2;
  const vh = viewport && viewport.height > 0 ? viewport.height : 200;
  const rect = pipRect || { left: 0, top: 0, width: 0, height: 0 };

  const m = measure(ctx, bubble ? bubble.text : '', Math.min(MAX_WIDTH, vw - MARGIN * 2));
  const pipCx = rect.left + rect.width / 2;

  let above = true;
  let y = rect.top - GAP - TAIL_H - m.h;
  if (y < MARGIN) {
    above = false;
    y = rect.top + rect.height + GAP + TAIL_H;
  }

  let x = pipCx - m.w / 2;
  x = clamp(x, MARGIN, vw - m.w - MARGIN);
  y = clamp(y, MARGIN, vh - m.h - MARGIN);

  // After clamping the panel the tail is what keeps the bubble attached to
  // Pip, so it slides along the panel edge and stops one tail-width from the
  // corners rather than running off them.
  const tailX = clamp(pipCx, x + BORDER + TAIL_W, x + m.w - BORDER - TAIL_W);

  return {
    x: Math.round(x),
    y: Math.round(y),
    w: m.w,
    h: m.h,
    tailX: Math.round(tailX),
    tailY: Math.round(above ? y + m.h : y),
    above: above,
    lines: m.lines,
    alpha: bubble && typeof bubble.alpha === 'number' ? bubble.alpha : 1
  };
}

/**
 * A rectangle with its corners notched off, drawn as two overlapping rects.
 * That is how a pixel-art panel is built: no anti-aliased rounded corners,
 * just a missing block at each corner.
 */
function panelRect(ctx, x, y, w, h, notch, color) {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(x + notch, y, Math.max(0, w - notch * 2), h);
  ctx.fillRect(x, y + notch, w, Math.max(0, h - notch * 2));
}

/**
 * The little triangle, drawn as 1px steps so it stays pixel-art.
 * It hangs off the bottom edge when the panel is above Pip and off the top
 * edge when it flipped below him, which is what `lay.above` selects.
 */
function drawTail(ctx, lay) {
  const base = lay.tailY;

  ctx.fillStyle = DARK;
  for (let i = 0; i < TAIL_H; i++) {
    const w = Math.max(2, TAIL_W - i * 2);
    const yRow = lay.above ? base + i : base - i - 1;
    ctx.fillRect(Math.round(lay.tailX - w / 2), yRow, w, 1);
  }

  // The light fill starts inside the panel so the join is sealed and the
  // panel's border does not cut a line across the base of the tail.
  ctx.fillStyle = PANEL;
  for (let i = 0; i < TAIL_H - BORDER; i++) {
    const w = Math.max(1, TAIL_W - BORDER * 2 - i * 2);
    const yRow = lay.above ? base - BORDER + i : base + BORDER - i - 1;
    ctx.fillRect(Math.round(lay.tailX - w / 2), yRow, w, 1);
  }
}

/**
 * Paint the bubble. `lay` is whatever `layout` returned this frame.
 */
function draw(ctx, bubble, lay) {
  if (!ctx || !bubble || !lay) return;
  const alpha = typeof bubble.alpha === 'number' ? bubble.alpha : 1;
  if (alpha <= 0.02) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;

  panelRect(ctx, lay.x, lay.y, lay.w, lay.h, BORDER * 2, DARK);
  panelRect(ctx, lay.x + BORDER, lay.y + BORDER, lay.w - BORDER * 2, lay.h - BORDER * 2, BORDER, PANEL);
  drawTail(ctx, lay);

  ctx.fillStyle = INK;
  ctx.font = FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const tx = lay.x + BORDER + PAD_X;
  let ty = lay.y + BORDER + PAD_Y;
  const lines = lay.lines || [];
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], tx, ty);
    ty += LINE_H;
  }

  ctx.restore();
}

const Bubbles = {
  LIFETIME_MS,
  FADE_MS,
  CHATTER_COOLDOWN_MS,
  MAX_WIDTH,
  FONT,
  LINE_H,
  TAIL_W,
  TAIL_H,
  MARGIN,
  create,
  update,
  measure,
  layout,
  draw
};

if (typeof window !== 'undefined') {
  window.Pip = window.Pip || {};
  window.Pip.Bubbles = Bubbles;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Bubbles;
}
