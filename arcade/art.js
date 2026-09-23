/*
 * art.js - pixel drawing helpers and the small sprites the arcade needs.
 *
 * Every arcade canvas works in "logical" pixels (the art's own pixels) and
 * is backed at a whole number of device pixels per logical pixel, so the
 * art stays crisp whatever Windows' display scaling is.
 */

(function () {
  'use strict';

  const OUT = '#2a1a2d';

  /**
   * Size a canvas for crisp pixel art: `w` x `h` logical pixels, shown at
   * roughly `zoom` CSS pixels each, backed at a whole number of device
   * pixels each. Returns a context already scaled to logical pixels.
   */
  function setup(canvas, w, h, zoom) {
    const dpr = window.devicePixelRatio || 1;
    const k = Math.max(1, Math.round((zoom || 2) * dpr));
    canvas.width = w * k;
    canvas.height = h * k;
    canvas.style.width = (w * k) / dpr + 'px';
    canvas.style.height = (h * k) / dpr + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.logical = { w: w, h: h, k: k };
    return ctx;
  }

  /** Mouse position in a setup() canvas's logical pixels. */
  function pointer(canvas, e) {
    const r = canvas.getBoundingClientRect();
    const l = canvas.getContext('2d').logical || { w: canvas.width, h: canvas.height };
    return { x: ((e.clientX - r.left) / r.width) * l.w, y: ((e.clientY - r.top) / r.height) * l.h };
  }

  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  /** A filled pixel disc, drawn in scanlines so it stays pixel-sharp. */
  function disc(ctx, cx, cy, r, color) {
    ctx.fillStyle = color;
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)) + 0.3);
      ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2 + 1, 1);
    }
  }

  /** A one-pixel ring. */
  function ring(ctx, cx, cy, r, color) {
    ctx.fillStyle = color;
    const steps = Math.max(24, Math.round(r * 7));
    let last = '';
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r);
      const key = x + ',' + y;
      if (key === last) continue;
      last = key;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  /** A box with a 1px outline, a lit top edge and a shaded bottom edge. */
  function panel(ctx, x, y, w, h, fill, light, dark) {
    rect(ctx, x, y, w, h, OUT);
    rect(ctx, x + 1, y + 1, w - 2, h - 2, fill);
    if (light) rect(ctx, x + 1, y + 1, w - 2, 1, light);
    if (dark) rect(ctx, x + 1, y + h - 2, w - 2, 1, dark);
  }

  /**
   * Draw a template of characters. `colors` maps each character to a
   * colour; '.' and unmapped characters are skipped.
   */
  function sprite(ctx, rows, x, y, colors, scale) {
    const s = scale || 1;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      let c = 0;
      while (c < row.length) {
        const ch = row[c];
        const col = colors[ch];
        if (!col) { c++; continue; }
        let run = 1;
        while (c + run < row.length && row[c + run] === ch) run++;
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(x + c * s), Math.round(y + r * s), run * s, s);
        c += run;
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * Slot symbols, 16 x 16
   * ---------------------------------------------------------------- */

  const SYMBOLS = {
    cherry: {
      colors: { O: OUT, R: '#e2415a', r: '#a82744', W: '#ffffff', G: '#4f9a3a', g: '#2f6a25' },
      rows: [
        '..........OO....',
        '.........OGGO...',
        '........OgO.....',
        '.......OgO......',
        '......OgOO......',
        '.....OgO.OO.....',
        '....OgO...Og....',
        '..OOOO....OgO...',
        '.ORRRRO..OOOOO..',
        'ORWRRRRO.ORRRRO.',
        'ORWRRRRO.ORWRRRO',
        'ORRRRRrOORWRRRRO',
        'ORRRRrrOORRRRRrO',
        '.ORrrrO..ORRRrrO',
        '..OOOO...ORrrrO.',
        '..........OOOO..'
      ]
    },
    lemon: {
      colors: { O: OUT, Y: '#f2cc3d', y: '#bd8f16', W: '#fff6c0' },
      rows: [
        '................',
        '................',
        '.....OOOOOO.....',
        '...OOYYYYYYOO...',
        '..OYYWWYYYYYYO..',
        '.OYYWYYYYYYYYYO.',
        'OOYYYYYYYYYYYYOO',
        'OYYYYYYYYYYYYYYO',
        'OYYYYYYYYYYYYyYO',
        'OOYYYYYYYYYYyyOO',
        '.OYYYYYYYYYyyyO.',
        '..OYYYYYYYyyyO..',
        '...OOyyyyyyOO...',
        '.....OOOOOO.....',
        '................',
        '................'
      ]
    },
    grape: {
      colors: { O: OUT, P: '#9b5cd6', p: '#6a33a0', W: '#e0c8ff', G: '#6b8f3a' },
      rows: [
        '.......OO.......',
        '......OGGO......',
        '....OOOOGOOO....',
        '...OPWPOOPWPO...',
        '...OPPPOOPPPO...',
        '..OOOpOOOOpOOO..',
        '.OPWPOPWPOPWPO..',
        '.OPPPOPPPOPPPO..',
        '..OpOOOpOOOpO...',
        '...OPWPOPWPO....',
        '...OPPPOPPPO....',
        '....OpOOOpO.....',
        '.....OPWPO......',
        '.....OPPpO......',
        '......OOO.......',
        '................'
      ]
    },
    lime: {
      colors: { O: OUT, L: '#68c445', l: '#3d8a28', W: '#e8ffd0', w: '#c6f09e' },
      rows: [
        '................',
        '.....OOOOOO.....',
        '...OOLLLLLLOO...',
        '..OLLwwwwwwLLO..',
        '.OLwwWwwwwWwwLO.',
        '.OLwwwWwwWwwwLO.',
        'OLwwwwwWWwwwwwLO',
        'OLwWWWWWWWWWWwLO',
        'OLwwwwwWWwwwwwLO',
        '.OLwwwWwwWwwwlO.',
        '.OLwwWwwwwWwwlO.',
        '..OLlwwwwwwllO..',
        '...OOllllllOO...',
        '.....OOOOOO.....',
        '................',
        '................'
      ]
    },
    blueberry: {
      colors: { O: OUT, B: '#4a7fe0', b: '#2a4fa8', W: '#cfe0ff', D: '#1d3470' },
      rows: [
        '................',
        '.....O.O.O......',
        '....ODODODO.....',
        '...OOOOOOOOO....',
        '..OBBBBBBBBBOO..',
        '.OBBWWBBBBBBBBO.',
        '.OBWWBBBBBBBBBO.',
        'OBBBBBBBBBBBBbBO',
        'OBBBBBBBBBBBbbBO',
        'OBBBBBBBBBBbbbBO',
        '.OBBBBBBBBbbbbO.',
        '.OBBBBBBbbbbbbO.',
        '..OObbbbbbbbOO..',
        '....OOOOOOOO....',
        '................',
        '................'
      ]
    },
    coin: {
      colors: { O: OUT, Q: '#ffcf3f', q: '#d9960f', W: '#fff3b0' },
      rows: [
        '................',
        '.....OOOOOO.....',
        '...OOQQQQQQOO...',
        '..OQQWWQQQQQqO..',
        '.OQQWQQOOQQQQqO.',
        '.OQWQQOQQOQQQqO.',
        'OQQWQOQQQQOQQQqO',
        'OQQQQOQQQQOQQQqO',
        'OQQQQOQQQQOQQQqO',
        'OQQQQOQQQQOQQqqO',
        '.OQQQQOQQOQQqqO.',
        '.OQQQQQOOQQqqqO.',
        '..OqQQQQQQqqqO..',
        '...OOqqqqqqOO...',
        '.....OOOOOO.....',
        '................'
      ]
    },
    star: {
      colors: { O: OUT, Y: '#ffe36b', y: '#e0a912', W: '#ffffff' },
      rows: [
        '.......OO.......',
        '......OYYO......',
        '......OYYO......',
        '.....OYWYYO.....',
        'OOOOOOYWYYOOOOOO',
        'OYYYYYWYYYYYYYyO',
        '.OYYYYYYYYYYYyO.',
        '..OYYYYYYYYYyO..',
        '...OYYYYYYYyO...',
        '...OYYYYYYYyO...',
        '..OYYYYOOYYYyO..',
        '..OYYYO..OYYyO..',
        '.OYYYO....OYyyO.',
        '.OYyO......OyyO.',
        'OOOO........OOOO',
        '................'
      ]
    },
    capsule: {
      colors: { O: OUT, K: '#ff8db5', k: '#d85488', S: '#f6f1e7', s: '#cfc6d8', W: '#ffffff' },
      rows: [
        '................',
        '.....OOOOOO.....',
        '...OOKKKKKKOO...',
        '..OKKWWKKKKKkO..',
        '.OKKWKKKKKKKKkO.',
        '.OKKKKKKKKKKKkO.',
        'OKKKKKKKKKKKKkkO',
        'OOOOOOOOOOOOOOOO',
        'OSSSSSSSSSSSSssO',
        'OSSSSSSSSSSSSssO',
        '.OSSSSSSSSSSssO.',
        '.OSSSSSSSSSsssO.',
        '..OsSSSSSSsssO..',
        '...OOssssssOO...',
        '.....OOOOOO.....',
        '................'
      ]
    },
    // a Pip face, recoloured to whichever Pip you are wearing
    pip: {
      colors: { O: OUT, B: '#e2415a', L: '#f4778c', D: '#a82744', H: '#ffffff', E: '#1f1728', W: '#ffffff', K: '#ff8db5' },
      rows: [
        '................',
        '................',
        '...OOOOO.OOOO...',
        '..OLLLLLOLLLLO..',
        '.OLHHLLLLLLLLLO.',
        'OBBBBBBBBBBBBBBO',
        'OBBBBBEEBBEEBBBO',
        'OBBBBBWEBBWEBBBO',
        'OBBBBBEEBBEEBBBO',
        'OBBBBKKBBBBKKBBO',
        'OBBBBBBBOOBBBBBO',
        '.ODBBBBBBBBBBDO.',
        '..ODDDDDDDDDDO..',
        '...OOOOOOOOOO...',
        '................',
        '................'
      ]
    }
  };

  /** Draw a slot symbol, optionally recoloured (the Pip face). */
  function symbol(ctx, name, x, y, scale, overrides) {
    const s = SYMBOLS[name];
    if (!s) return;
    const colors = overrides ? Object.assign({}, s.colors, overrides) : s.colors;
    sprite(ctx, s.rows, x, y, colors, scale);
  }

  /**
   * A gacha capsule: a coloured top half and a white bottom half.
   * opts: {open 0..1 (the top lifts off), glow colour, glowAlpha, dx (wobble)}
   */
  function capsule(ctx, cx, cy, r, top, opts) {
    opts = opts || {};
    cx = Math.round(cx + (opts.dx || 0));
    cy = Math.round(cy);
    const lift = Math.round((opts.open || 0) * r * 2.4);
    ctx.save();
    if (opts.glow) {
      ctx.globalAlpha = opts.glowAlpha === undefined ? 0.5 : opts.glowAlpha;
      disc(ctx, cx, cy, r + 3, opts.glow);
      ctx.globalAlpha = 1;
    }
    // bottom half
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - r - 1, cy, r * 2 + 3, r + 2);
    ctx.clip();
    disc(ctx, cx, cy, r, OUT);
    disc(ctx, cx, cy, r - 1, '#f6f1e7');
    rect(ctx, cx + Math.round(r * 0.3), cy + Math.round(r * 0.35), Math.max(1, Math.round(r * 0.4)), 1, '#cfc6d8');
    ctx.restore();
    // top half
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - r - 1, cy - r - 1 - lift, r * 2 + 3, r + 1);
    ctx.clip();
    disc(ctx, cx, cy - lift, r, OUT);
    disc(ctx, cx, cy - lift, r - 1, top);
    rect(ctx, cx - Math.round(r * 0.5), cy - lift - Math.round(r * 0.6), 2, 2, '#ffffff');
    ctx.restore();
    rect(ctx, cx - r, cy - lift, r * 2 + 1, 1, OUT);
    if (lift) rect(ctx, cx - r, cy, r * 2 + 1, 1, OUT);
    ctx.restore();
  }

  const Art = { OUT, setup, pointer, rect, disc, ring, panel, sprite, SYMBOLS, symbol, capsule };

  window.Pip = window.Pip || {};
  window.Pip.Art = Art;
})();
