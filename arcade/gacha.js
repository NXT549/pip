/*
 * gacha.js - Pip-a-Pon, the capsule machine.
 *
 * Main has already decided what is in the capsule by the time any of this
 * runs; the machine only plays it out:
 *
 *   coin -> crank -> drop -> wobble -> crack open -> the Pip pops out
 *
 * A ten-pull pours ten capsules into a row to open one at a time (or all
 * at once). Rarer capsules glow in their rarity's colour before they open,
 * and epic and legendary ones shake the whole machine. Skip jumps to the end.
 */

(function () {
  'use strict';

  const P = window.Pip;
  const Art = P.Art;
  const PF = P.PixelFont;
  const W = 320;
  const H = 220;

  const RCOL = P.Pips.RARITY_COLORS;
  const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
  const CAPS = ['#ff8db5', '#8fd0ff', '#b8f28a', '#ffd36a', '#c9a6ff', '#ff9a6b', '#6bffe0'];
  const RAINBOW = ['#ff5f6d', '#ffb347', '#ffe36b', '#7ee07a', '#5ad1ff', '#9b7bff'];

  const DOME = { x: 160, y: 66, r: 50 };
  const CHUTE = { x: 131, y: 176 };
  const TRAY = { x: 104, y: 200 };

  let ctx = null;
  let canvas = null;
  let raf = 0;
  let last = 0;
  let onDone = null;

  const m = {
    phase: 'idle',
    t: 0,
    crank: 0,
    shake: 0,
    balls: [],
    results: [],
    tray: null,        // the single falling / wobbling capsule
    row: [],           // ten-pull capsules
    stage: null,       // the Pip being revealed
    reveal: null,      // {result, t}
    particles: [],
    coinY: 0,
    ticket: false
  };

  function rand(lo, hi) { return lo + Math.random() * (hi - lo); }

  /* ---------------------------------------------------------------- *
   * The capsules in the dome: a little heap that jostles when cranked
   * ---------------------------------------------------------------- */

  function fillDome() {
    m.balls = [];
    for (let i = 0; i < 16; i++) {
      m.balls.push({
        x: DOME.x + rand(-30, 30),
        y: DOME.y + rand(0, 34),
        vx: 0,
        vy: 0,
        r: 8,
        color: CAPS[i % CAPS.length]
      });
    }
    for (let i = 0; i < 60; i++) stepBalls(1 / 30);
  }

  function jostle(power) {
    for (const b of m.balls) {
      b.vx += rand(-power, power);
      b.vy -= rand(power * 0.4, power);
    }
  }

  function stepBalls(dt) {
    for (const b of m.balls) {
      b.vy += 320 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx *= 0.96;
      // keep inside the dome
      const dx = b.x - DOME.x, dy = b.y - DOME.y;
      const d = Math.hypot(dx, dy);
      const max = DOME.r - b.r - 2;
      if (d > max) {
        const nx = dx / d, ny = dy / d;
        b.x = DOME.x + nx * max;
        b.y = DOME.y + ny * max;
        const dot = b.vx * nx + b.vy * ny;
        b.vx -= 1.5 * dot * nx;
        b.vy -= 1.5 * dot * ny;
      }
      // the floor of the dome, where it meets the machine
      if (b.y > DOME.y + 36) { b.y = DOME.y + 36; b.vy *= -0.3; }
    }
    // push overlapping capsules apart
    for (let i = 0; i < m.balls.length; i++) {
      for (let j = i + 1; j < m.balls.length; j++) {
        const a = m.balls[i], b = m.balls[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const min = a.r + b.r - 1;
        if (d < min) {
          const push = (min - d) / 2;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * Drawing
   * ---------------------------------------------------------------- */

  function drawBackdrop() {
    // a wall of warm arcade light, and a floor
    Art.rect(ctx, 0, 0, W, H, '#231b3d');
    for (let i = 0; i < 8; i++) Art.rect(ctx, 0, i * 6, W, 3, i % 2 ? '#2a2046' : '#261d40');
    Art.rect(ctx, 0, 206, W, 14, '#1a1430');
    Art.rect(ctx, 0, 206, W, 1, '#3d3266');
    // a string of bulbs along the top
    for (let x = 8; x < W; x += 16) {
      const on = Math.floor(performance.now() / 300 + x / 16) % 3 === 0;
      Art.rect(ctx, x, 4, 3, 3, on ? '#ffe36b' : '#6a5a3a');
    }
  }

  /** Two posters on the wall: the odds, and how many Pips there are to find. */
  function drawPosters() {
    // left: the odds, one line per rarity
    Art.panel(ctx, 14, 62, 72, 92, '#3a2e62', '#4a3c78', '#2a2046');
    PF.draw(ctx, 'ODDS', 50, 67, { color: '#ffe36b', align: 'center' });
    const rates = [55, 28, 12, 4.2, 0.8];
    P.Pips.RARITIES.forEach((r, i) => {
      const y = 80 + i * 14;
      PF.draw(ctx, '*'.repeat(i + 1), 18, y, { color: RCOL[r] });
      PF.draw(ctx, String(rates[i]) + '%', 82, y, { color: '#f4efff', align: 'right' });
    });
    // right: a mystery Pip to find
    Art.panel(ctx, 234, 62, 72, 92, '#3a2e62', '#4a3c78', '#2a2046');
    PF.draw(ctx, 'FIND ALL', 270, 67, { color: '#ffe36b', align: 'center' });
    P.PipDraw.draw(ctx, 'celestial', 'idle_0', 238, 66, 1, { silhouette: true });
    const q = Math.round(Math.sin(performance.now() / 400) * 1.5);
    PF.draw(ctx, '?', 272, 104 + q, { color: '#ffffff', align: 'center', scale: 2 });
    PF.draw(ctx, P.Pips.TYPES.length + ' PIPS', 270, 140, { color: '#f4efff', align: 'center' });
  }

  /** Every capsule of a ten-pull open: all ten Pips, side by side. */
  function drawSummary() {
    ctx.save();
    ctx.globalAlpha = 0.85;
    Art.rect(ctx, 0, 0, W, H, '#120d22');
    ctx.restore();
    m.row.forEach((c, i) => {
      const col = i % 5, row = Math.floor(i / 5);
      const x = col * 64, y = 8 + row * 96;
      const rc = rarityColor(c.result.rarity);
      if (RANK[c.result.rarity] >= 2) {
        ctx.save();
        ctx.globalAlpha = 0.25;
        Art.disc(ctx, x + 32, y + 44, 22, rc);
        ctx.restore();
      }
      P.PipDraw.draw(ctx, c.result.id, 'idle_0', x, y, 1);
      PF.draw(ctx, '*'.repeat(RANK[c.result.rarity] + 1), x + 32, y + 66, { color: rc, align: 'center', shadow: Art.OUT });
      PF.draw(ctx, c.result.isNew ? 'NEW!' : '+' + c.result.refund + '@', x + 32, y + 76,
        { color: c.result.isNew ? '#6bffb8' : '#ffcf3f', align: 'center', shadow: Art.OUT });
    });
    PF.draw(ctx, 'CLICK TO CONTINUE', W / 2, 206, { color: '#b8acd8', align: 'center' });
  }

  function drawMachine() {
    const sx = m.shake ? Math.round(rand(-m.shake, m.shake)) : 0;
    ctx.save();
    ctx.translate(sx, 0);

    // glass dome and the capsules inside it
    Art.disc(ctx, DOME.x, DOME.y, DOME.r + 2, Art.OUT);
    Art.disc(ctx, DOME.x, DOME.y, DOME.r, '#3b4f7a');
    for (const b of m.balls) Art.capsule(ctx, b.x, b.y, b.r, b.color);
    ctx.globalAlpha = 0.28;
    Art.disc(ctx, DOME.x, DOME.y, DOME.r, '#bfe8ff');
    ctx.globalAlpha = 1;
    // the shine on the glass
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (1.08 + i * 0.045);
      Art.rect(ctx, DOME.x + Math.cos(a) * (DOME.r - 7), DOME.y + Math.sin(a) * (DOME.r - 7), 3, 3, '#ffffff');
    }
    Art.rect(ctx, DOME.x - 30, DOME.y - 30, 3, 3, 'rgba(255,255,255,0.6)');

    // the cap on top
    Art.panel(ctx, DOME.x - 14, DOME.y - DOME.r - 7, 28, 9, '#e2415a', '#f4778c', '#a82744');
    Art.disc(ctx, DOME.x, DOME.y - DOME.r - 10, 4, Art.OUT);
    Art.disc(ctx, DOME.x, DOME.y - DOME.r - 10, 3, '#ffcf3f');

    // the body
    Art.panel(ctx, 102, 110, 116, 88, '#e2415a', '#f4778c', '#a82744');
    Art.rect(ctx, 103, 111, 3, 86, '#f4778c');
    Art.rect(ctx, 214, 111, 3, 86, '#a82744');
    // name plate
    Art.panel(ctx, 118, 116, 84, 13, '#2a1a2d', null, null);
    PF.draw(ctx, 'PIP-A-PON', 160, 119, { color: '#ffe36b', align: 'center' });
    // coin slot
    Art.panel(ctx, 184, 136, 20, 20, '#c9c3d6', '#ffffff', '#8a849a');
    Art.rect(ctx, 193, 140, 2, 12, Art.OUT);
    PF.draw(ctx, '@', 194, 159, { color: '#ffcf3f', align: 'center' });

    // the crank
    const cx = 160, cy = 150;
    Art.disc(ctx, cx, cy, 13, Art.OUT);
    Art.disc(ctx, cx, cy, 12, '#c9c3d6');
    Art.disc(ctx, cx, cy, 9, '#9aa3b5');
    const a = m.crank;
    const hx = Math.round(Math.cos(a) * 10), hy = Math.round(Math.sin(a) * 10);
    for (let i = -10; i <= 10; i++) {
      Art.rect(ctx, cx + Math.round(Math.cos(a) * i) - 1, cy + Math.round(Math.sin(a) * i) - 1, 3, 3, '#4a4458');
    }
    Art.disc(ctx, cx + hx, cy + hy, 3, Art.OUT);
    Art.disc(ctx, cx + hx, cy + hy, 2, '#ffcf3f');
    Art.disc(ctx, cx, cy, 3, Art.OUT);

    // the chute
    Art.panel(ctx, CHUTE.x - 13, 170, 26, 20, '#2a1a2d', null, null);
    Art.rect(ctx, CHUTE.x - 11, 172, 22, 3, '#4a3c78');
    // feet
    Art.rect(ctx, 98, 196, 124, 8, Art.OUT);
    Art.rect(ctx, 100, 197, 120, 5, '#5a4a88');
    ctx.restore();
  }

  function rarityColor(r) {
    if (r === 'legendary') return RAINBOW[Math.floor(performance.now() / 90) % RAINBOW.length];
    return RCOL[r];
  }

  function drawTray() {
    const c = m.tray;
    if (!c) return;
    const rich = RANK[c.result.rarity] >= 2;
    const glowing = m.phase === 'wobble' && rich;
    Art.capsule(ctx, c.x, c.y, 10, c.color, {
      dx: m.phase === 'wobble' ? Math.round(Math.sin(m.t * (rich ? 40 : 26)) * (rich ? 2 : 1)) : 0,
      glow: glowing ? rarityColor(c.result.rarity) : null,
      glowAlpha: 0.25 + Math.min(0.5, m.t * 0.5),
      open: c.open || 0
    });
  }

  function drawRow() {
    for (const c of m.row) {
      if (c.opened) {
        Art.capsule(ctx, c.x, c.y, 9, c.color, { open: 1 });
        PF.draw(ctx, '*', c.x + 1, c.y - 22, { color: rarityColor(c.result.rarity), align: 'center', shadow: Art.OUT });
        continue;
      }
      const rich = RANK[c.result.rarity] >= 2;
      Art.capsule(ctx, c.x, c.y, 9, c.color, {
        dx: c.opening ? Math.round(Math.sin(c.t * 40) * 2) : 0,
        glow: rich ? rarityColor(c.result.rarity) : null,
        glowAlpha: 0.35,
        open: c.open || 0
      });
    }
  }

  function drawRays(color, t, cx, cy) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.55, t * 1.2);
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = t * 0.8 + (i / n) * Math.PI * 2;
      ctx.fillStyle = color === 'rainbow' ? RAINBOW[i % RAINBOW.length] : color;
      for (let d = 18; d < 160; d += 3) {
        const w = 2 + Math.floor(d / 40);
        ctx.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), w, w);
      }
    }
    ctx.restore();
  }

  function drawReveal() {
    const rv = m.reveal;
    if (!rv) return;
    const res = rv.result;
    ctx.save();
    ctx.globalAlpha = Math.min(0.8, rv.t * 3);
    Art.rect(ctx, 0, 0, W, H, '#120d22');
    ctx.restore();
    drawRays(res.rarity === 'legendary' ? 'rainbow' : RCOL[res.rarity], rv.t, W / 2, 96);
    // the card
    if (m.stage) {
      m.stage.draw(ctx);
    }
    const type = P.Pips.get(res.id);
    const stars = '*'.repeat(RANK[res.rarity] + 1);
    PF.draw(ctx, type.name.toUpperCase(), W / 2, 156, { color: '#ffffff', align: 'center', scale: 2, shadow: Art.OUT });
    PF.draw(ctx, stars + ' ' + res.rarity.toUpperCase() + ' ' + stars, W / 2, 176, { color: RCOL[res.rarity], align: 'center', shadow: Art.OUT });
    if (res.isNew) {
      const bob = Math.round(Math.sin(rv.t * 6) * 2);
      PF.draw(ctx, 'NEW!', W / 2, 18 + bob, { color: '#6bffb8', align: 'center', scale: 2, shadow: Art.OUT });
    } else {
      PF.draw(ctx, 'DUPLICATE  +' + res.refund + '@', W / 2, 190, { color: '#ffcf3f', align: 'center', shadow: Art.OUT });
    }
    if (rv.t > 1.2) PF.draw(ctx, 'CLICK TO CONTINUE', W / 2, 206, { color: '#b8acd8', align: 'center' });
    P.Particles.draw(ctx, m.particles, 2);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBackdrop();
    drawPosters();
    drawMachine();
    if (m.phase === 'coin') {
      if (m.ticket) Art.sprite(ctx, ['OOOOOOO', 'OKKKKKO', 'OKWKKKO', 'OKKKKKO', 'OOOOOOO'], 188, m.coinY, { O: Art.OUT, K: '#ff8db5', W: '#fff' }, 1);
      else { Art.disc(ctx, 194, m.coinY + 4, 4, Art.OUT); Art.disc(ctx, 194, m.coinY + 4, 3, '#ffcf3f'); Art.rect(ctx, 193, m.coinY + 2, 1, 3, '#fff3b0'); }
    }
    drawTray();
    drawRow();
    if (m.phase !== 'reveal') P.Particles.draw(ctx, m.particles, 2);
    if (m.phase === 'reveal') drawReveal();
    if (m.phase === 'idle') {
      const blink = Math.floor(performance.now() / 600) % 2;
      if (blink) PF.draw(ctx, 'INSERT COIN', W / 2, 210, { color: '#ffe36b', align: 'center', shadow: Art.OUT });
    }
    if (m.phase === 'row' && m.row.length && m.row.every((c) => c.opened)) drawSummary();
  }

  /* ---------------------------------------------------------------- *
   * The sequence
   * ---------------------------------------------------------------- */

  function go(phase) {
    m.phase = phase;
    m.t = 0;
  }

  function burst(result, x, y) {
    const n = [6, 10, 16, 26, 40][RANK[result.rarity]];
    P.Particles.spawn(m.particles, 'sparkle', x, y, n);
    if (RANK[result.rarity] >= 3) P.Particles.spawn(m.particles, 'confetti', x, y, n);
    if (RANK[result.rarity] >= 2) P.Particles.spawn(m.particles, 'star', x, y - 10, 5);
  }

  function startReveal(result) {
    m.reveal = { result: result, t: 0 };
    m.stage = P.PipDraw.stage(result.id, { x: W / 2 - 64, y: 14, scale: 2, clip: 'happy' });
    burst(result, W / 2, 110);
    go('reveal');
  }

  function update(dt) {
    m.t += dt;
    stepBalls(dt);
    m.particles = P.Particles.update(m.particles, dt);
    if (m.shake) m.shake = Math.max(0, m.shake - dt * 8);
    if (m.stage) m.stage.update(dt);
    if (m.reveal) m.reveal.t += dt;

    switch (m.phase) {
      case 'coin':
        m.coinY = 118 + m.t * 60;
        if (m.t > 0.45) go('crank');
        break;

      case 'crank': {
        const turns = m.results.length > 1 ? 5 : 3;
        const dur = turns * 0.3;
        // the handle turns in clicks, a quarter at a time
        const step = Math.floor((m.t / dur) * turns * 2);
        m.crank = step * (Math.PI / 2) + Math.min(1, ((m.t / dur) * turns * 2) % 1 * 3) * (Math.PI / 2);
        if (Math.random() < dt * 12) jostle(120);
        if (m.t > dur) {
          if (m.results.length > 1) startPour();
          else startDrop();
        }
        break;
      }

      case 'drop': {
        const c = m.tray;
        c.vy += 700 * dt;
        c.y += c.vy * dt;
        c.x += c.vx * dt;
        if (c.y > TRAY.y) {
          c.y = TRAY.y;
          c.vy = -c.vy * 0.35;
          c.vx *= 0.6;
          if (Math.abs(c.vy) < 30) c.vy = 0;
        }
        if (m.t > 0.9) go('wobble');
        break;
      }

      case 'wobble': {
        const rich = RANK[m.tray.result.rarity];
        if (rich >= 3) m.shake = Math.max(m.shake, 1.5 + rich);
        if (m.t > 0.7 + rich * 0.2) go('open');
        break;
      }

      case 'open':
        m.tray.open = Math.min(1, m.t * 3);
        if (m.t > 0.35) {
          const res = m.tray.result;
          burst(res, m.tray.x, m.tray.y);
          m.tray = null;
          startReveal(res);
        }
        break;

      case 'pour':
        for (let i = 0; i < m.row.length; i++) {
          const c = m.row[i];
          if (m.t < i * 0.12) continue;
          if (!c.live) { c.live = true; c.x = CHUTE.x; c.y = CHUTE.y; }
          c.x += (c.tx - c.x) * Math.min(1, dt * 7);
          c.y += (c.ty - c.y) * Math.min(1, dt * 7);
        }
        if (m.t > m.row.length * 0.12 + 0.6) go('row');
        break;

      case 'row':
        for (const c of m.row) {
          if (!c.opening) continue;
          c.t += dt;
          c.open = Math.min(1, Math.max(0, (c.t - 0.35) * 3));
          if (c.t > 0.7 && !c.opened) {
            c.opened = true;
            burst(c.result, c.x, c.y);
            if (RANK[c.result.rarity] >= 3) m.shake = 3;
          }
        }
        if (m.autoOpen && m.t > 0.25) {
          const next = m.row.find((c) => !c.opening);
          if (next) { next.opening = true; next.t = 0; m.t = 0; }
          else m.autoOpen = false;
        }
        break;
    }
  }

  function startDrop() {
    m.tray = {
      result: m.results[0],
      color: CAPS[Math.floor(Math.random() * CAPS.length)],
      x: CHUTE.x, y: CHUTE.y - 4, vx: -60, vy: -40, open: 0
    };
    go('drop');
  }

  function startPour() {
    m.row = m.results.map((res, i) => ({
      result: res,
      color: CAPS[i % CAPS.length],
      x: CHUTE.x, y: CHUTE.y,
      tx: 32 + (i % 5) * 20 + (i >= 5 ? 180 : 0),
      ty: 188 - (i >= 5 ? 0 : 0) + (i % 2) * 4,
      live: false, opening: false, opened: false, t: 0, open: 0
    }));
    // two neat rows of five, either side of the machine
    m.row.forEach((c, i) => {
      c.tx = i < 5 ? 14 + i * 18 : 226 + (i - 5) * 18;
      c.ty = 190;
    });
    go('pour');
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    raf = requestAnimationFrame(loop);
  }

  /* ---------------------------------------------------------------- *
   * Public
   * ---------------------------------------------------------------- */

  const Gacha = {
    init(el) {
      canvas = el;
      ctx = Art.setup(canvas, W, H, 2);
      fillDome();
      canvas.addEventListener('click', (e) => Gacha.click(Art.pointer(canvas, e)));
    },

    /** Start or stop the animation loop (only while its tab is showing). */
    run(on) {
      if (on && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
      if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
    },

    busy() {
      return m.phase !== 'idle';
    },

    /** Play out a pull main has already made. */
    play(results, paidWith, done) {
      m.results = results;
      m.ticket = paidWith === 'ticket';
      m.reveal = null;
      m.stage = null;
      m.row = [];
      m.autoOpen = false;
      onDone = done;
      jostle(80);
      go('coin');
    },

    /** Open every capsule in a ten-pull row, one after another. */
    openAll() {
      if (m.phase === 'row') m.autoOpen = true;
    },

    skip() {
      if (m.phase === 'idle') return;
      if (m.results.length > 1) {
        if (m.phase !== 'row') { startPour(); m.row.forEach((c) => { c.live = true; c.x = c.tx; c.y = c.ty; }); go('row'); }
        m.row.forEach((c) => { c.opening = true; c.opened = true; c.open = 1; });
      } else if (m.phase !== 'reveal') {
        m.tray = null;
        startReveal(m.results[0]);
        m.reveal.t = 1.3;
      }
    },

    click(p) {
      if (m.phase === 'reveal' && m.reveal && m.reveal.t > 0.6) {
        finish();
        return;
      }
      if (m.phase === 'row') {
        if (m.row.every((c) => c.opened)) { finish(); return; }
        const hit = m.row.find((c) => !c.opening && Math.hypot(p.x - c.x, p.y - c.y) < 12);
        if (hit) { hit.opening = true; hit.t = 0; }
      }
    }
  };

  function finish() {
    m.phase = 'idle';
    m.reveal = null;
    m.stage = null;
    m.row = [];
    const cb = onDone;
    onDone = null;
    if (cb) cb();
  }

  window.Pip.Gacha = Gacha;
})();
