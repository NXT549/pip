/*
 * slots.js - the slot machine.
 *
 * As with the capsules, main has already spun the reels (economy.js) and
 * sent back where each one stops. This only animates getting there: the
 * lever, the blur, the reels stopping left to right with a little bounce,
 * the win line flashing and the coins. The stops are the real ones - the
 * animation never fakes a near-miss.
 */

(function () {
  'use strict';

  const P = window.Pip;
  const Art = P.Art;
  const PF = P.PixelFont;
  const W = 320;
  const H = 220;

  const REEL_X = [98, 142, 186];
  const REEL_W = 36;
  const REEL_TOP = 64;
  const REEL_H = 76;
  const CELL = 26;                 // symbol pitch on the strip
  const LINE_Y = REEL_TOP + REEL_H / 2;

  let ctx = null;
  let canvas = null;
  let raf = 0;
  let last = 0;
  let strip = [];                  // the reel, from main's rules
  let onDone = null;
  let pipColors = null;

  const s = {
    phase: 'idle',
    t: 0,
    lever: 0,
    reels: [0, 0, 0].map(() => ({ pos: 0, speed: 0, target: 0, stopAt: 0, done: true, bounce: 0 })),
    result: null,
    particles: [],
    win: 0,
    shown: 0,
    message: 'PULL THE LEVER!',
    stage: null
  };

  /** The Pip-face symbol wears the colours of whichever Pip you have on. */
  function setPip(typeId) {
    const pal = P.Palettes.resolve(P.Pips.get(typeId).palette);
    pipColors = { B: pal.B, L: pal.L, D: pal.D, H: pal.H, E: pal.E, K: pal.K };
    s.typeId = typeId;
  }

  function mod(a, n) { return ((a % n) + n) % n; }

  /* ---------------------------------------------------------------- *
   * Drawing
   * ---------------------------------------------------------------- */

  function drawCabinet(now) {
    Art.rect(ctx, 0, 0, W, H, '#231b3d');
    Art.rect(ctx, 0, 206, W, 14, '#1a1430');
    // the cabinet
    Art.panel(ctx, 70, 8, 180, 200, '#b02a3a', '#e2415a', '#6a1424');
    Art.rect(ctx, 71, 9, 4, 198, '#e2415a');
    Art.rect(ctx, 245, 9, 4, 198, '#6a1424');
    // the sign, ringed with chasing bulbs
    Art.panel(ctx, 84, 16, 152, 34, '#2a1a2d', null, null);
    PF.draw(ctx, 'PIP SLOTS', W / 2, 23, { color: '#ffe36b', align: 'center', scale: 2, shadow: '#a8282e' });
    const fast = s.phase === 'jackpot' ? 60 : 180;
    let i = 0;
    for (let x = 86; x < 234; x += 6) bulb(x, 17, i++, now, fast);
    for (let x = 234; x > 86; x -= 6) bulb(x, 47, i++, now, fast);
    // the reel window
    Art.panel(ctx, 90, REEL_TOP - 6, 140, REEL_H + 12, '#ffcf3f', '#fff3b0', '#d9960f');
    for (let r = 0; r < 3; r++) {
      Art.rect(ctx, REEL_X[r] - 1, REEL_TOP - 1, REEL_W + 2, REEL_H + 2, Art.OUT);
      Art.rect(ctx, REEL_X[r], REEL_TOP, REEL_W, REEL_H, '#f6f1e7');
    }
    // the display under the reels
    Art.panel(ctx, 90, 152, 140, 22, '#1b1530', null, null);
    // the tray
    Art.panel(ctx, 110, 182, 100, 16, '#6a1424', null, '#3a0a14');
    Art.rect(ctx, 114, 186, 92, 8, '#2a1a2d');
  }

  function bulb(x, y, i, now, fast) {
    const on = mod(Math.floor(now / fast) - i, 4) === 0;
    Art.rect(ctx, x, y, 3, 3, on ? '#fff3b0' : '#6a5a3a');
  }

  function drawReels() {
    for (let r = 0; r < 3; r++) {
      const reel = s.reels[r];
      ctx.save();
      ctx.beginPath();
      ctx.rect(REEL_X[r], REEL_TOP, REEL_W, REEL_H);
      ctx.clip();
      const blur = Math.min(1, reel.speed / 20);
      const offset = reel.pos + reel.bounce;
      // the symbol at `pos` sits on the pay line
      const base = Math.floor(offset);
      const frac = offset - base;
      for (let k = -2; k <= 2; k++) {
        const name = strip[mod(base + k, strip.length)];
        // later symbols come in from above, so the reel rolls downward
        const y = LINE_Y - 8 + (frac - k) * CELL;
        if (blur > 0.3) {
          // spinning: the symbol smears down the reel
          ctx.globalAlpha = 0.35;
          Art.symbol(ctx, name, REEL_X[r] + 10, y - 6, 1, name === 'pip' ? pipColors : null);
          ctx.globalAlpha = 1;
        }
        Art.symbol(ctx, name, REEL_X[r] + 10, y, 1, name === 'pip' ? pipColors : null);
      }
      // a soft shadow at the top and bottom of the window
      ctx.globalAlpha = 0.18;
      Art.rect(ctx, REEL_X[r], REEL_TOP, REEL_W, 8, Art.OUT);
      Art.rect(ctx, REEL_X[r], REEL_TOP + REEL_H - 8, REEL_W, 8, Art.OUT);
      ctx.restore();
    }
    // the pay line and its markers
    const lit = s.phase === 'win' || s.phase === 'jackpot';
    const flash = lit && Math.floor(s.t * 8) % 2 === 0;
    ctx.globalAlpha = flash ? 0.9 : 0.35;
    Art.rect(ctx, 92, LINE_Y, 136, 1, flash ? '#ff5f8d' : '#e2415a');
    ctx.globalAlpha = 1;
    Art.sprite(ctx, ['O...', 'OO..', 'ORO.', 'ORRO', 'ORO.', 'OO..', 'O...'], 85, LINE_Y - 3, { O: Art.OUT, R: '#ff5f8d' }, 1);
    Art.sprite(ctx, ['...O', '..OO', '.ORO', 'ORRO', '.ORO', '..OO', '...O'], 231, LINE_Y - 3, { O: Art.OUT, R: '#ff5f8d' }, 1);
  }

  function drawLever() {
    const pull = s.lever;                  // 0 up .. 1 all the way down
    const baseX = 256, baseY = 108;
    Art.panel(ctx, baseX - 4, baseY - 6, 12, 22, '#9aa3b5', '#c9c3d6', '#5a6070');
    const topY = baseY - 50 + pull * 60;
    const len = Math.abs(baseY - topY);
    const dir = topY < baseY ? -1 : 1;
    for (let i = 0; i < len; i++) Art.rect(ctx, baseX, baseY + dir * i, 3, 1, '#4a4458');
    Art.disc(ctx, baseX + 1, topY, 6, Art.OUT);
    Art.disc(ctx, baseX + 1, topY, 5, '#e2415a');
    Art.rect(ctx, baseX - 2, topY - 3, 2, 2, '#ffb3c0');
  }

  function drawDisplay() {
    let text = s.message;
    let color = '#b8acd8';
    if (s.phase === 'win' || s.phase === 'jackpot') {
      text = (s.result.name ? s.result.name + '  ' : '') + '+' + s.shown + '@';
      color = '#ffe36b';
    }
    PF.draw(ctx, text, W / 2, 159, { color: color, align: 'center' });
  }

  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    drawCabinet(now);
    drawReels();
    drawLever();
    drawDisplay();
    if (s.stage) s.stage.draw(ctx);
    P.Particles.draw(ctx, s.particles, 2);
  }

  /* ---------------------------------------------------------------- *
   * Spinning
   * ---------------------------------------------------------------- */

  function update(dt) {
    s.t += dt;
    s.particles = P.Particles.update(s.particles, dt);
    if (s.stage) s.stage.update(dt);

    if (s.phase === 'pull') {
      s.lever = Math.min(1, s.t / 0.18);
      if (s.t > 0.25) {
        s.phase = 'spin';
        s.t = 0;
        s.reels.forEach((reel, i) => {
          reel.speed = 22 + i * 2;          // symbols per second
          reel.done = false;
          reel.stopAt = 0.9 + i * 0.45;
        });
      }
    } else if (s.lever > 0) {
      s.lever = Math.max(0, s.lever - dt * 4);
    }

    if (s.phase === 'spin') {
      let all = true;
      s.reels.forEach((reel, i) => {
        if (reel.done) return;
        all = false;
        if (s.t < reel.stopAt) {
          reel.pos += reel.speed * dt;
          return;
        }
        // Stopping: ease into the stop main chose, landing a touch past it
        // and settling back - the reel's real result, never a fake.
        if (!reel.stopping) {
          reel.stopping = true;
          const whole = Math.ceil(reel.pos) + strip.length;
          reel.from = reel.pos;
          reel.target = whole - mod(whole, strip.length) + s.result.stops[i];
          if (reel.target - reel.from < 3) reel.target += strip.length;
          reel.easing = 0;
        }
        reel.easing += dt / 0.45;
        const e = Math.min(1, reel.easing);
        const ease = 1 - Math.pow(1 - e, 3);
        reel.pos = reel.from + (reel.target - reel.from) * ease;
        reel.speed = (1 - e) * 20;
        if (e >= 1) {
          reel.done = true;
          reel.stopping = false;
          reel.pos = mod(reel.pos, strip.length);
          reel.bounce = 0.18;
          P.Particles.spawn(s.particles, 'dust', REEL_X[i] + REEL_W / 2, REEL_TOP + REEL_H, 2);
        }
      });
      if (all) settle();
    }
    s.reels.forEach((reel) => { if (reel.bounce) reel.bounce = Math.max(0, reel.bounce - dt * 1.2); });

    if (s.phase === 'win' || s.phase === 'jackpot') {
      // count the winnings up
      const target = s.result.payout;
      s.shown = Math.min(target, Math.ceil(s.shown + Math.max(1, target * dt * 1.5)));
      if (Math.random() < dt * (s.phase === 'jackpot' ? 30 : 10)) {
        P.Particles.spawn(s.particles, 'coin', 160 + (Math.random() - 0.5) * 80, 186, 1);
      }
      if (s.t > (s.phase === 'jackpot' ? 4 : 1.6) && s.shown >= target) done();
    }
  }

  function settle() {
    const r = s.result;
    if (r.freePull || r.payout >= 20 * r.bet) {
      s.phase = 'jackpot';
      P.Particles.spawn(s.particles, 'confetti', W / 2, 90, 40);
      P.Particles.spawn(s.particles, 'star', W / 2, 90, 6);
      s.stage = P.PipDraw.stage(s.typeId, { x: 256, y: 150, scale: 0.9, clip: 'dance' });
    } else if (r.payout > 0) {
      s.phase = 'win';
      P.Particles.spawn(s.particles, 'sparkle', W / 2, LINE_Y, 10);
    } else {
      s.message = ['SO CLOSE!', 'AGAIN?', 'NEXT TIME!', 'SPIN AGAIN!'][Math.floor(Math.random() * 4)];
      done();
      return;
    }
    s.t = 0;
    s.shown = 0;
  }

  function done() {
    if (s.phase !== 'idle') {
      if (s.result && s.result.payout > 0) s.message = 'WON ' + s.result.payout + '@';
    }
    s.phase = 'idle';
    const cb = onDone;
    onDone = null;
    if (cb) cb();
    setTimeout(() => { if (s.phase === 'idle') s.stage = null; }, 2500);
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw(now);
    raf = requestAnimationFrame(loop);
  }

  const Slots = {
    init(el, reel) {
      canvas = el;
      strip = reel;
      ctx = Art.setup(canvas, W, H, 2);
      s.reels.forEach((reel, i) => { reel.pos = i * 7; });
      canvas.addEventListener('click', (e) => {
        const p = Art.pointer(canvas, e);
        if (p.x > 244 && p.x < 272 && p.y > 40 && p.y < 130 && Slots.onLever) Slots.onLever();
      });
    },

    setPip: setPip,

    run(on) {
      if (on && !raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
      if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
    },

    busy() {
      return s.phase !== 'idle';
    },

    /** Play out a spin main has already made. */
    play(result, bet, cb) {
      s.result = Object.assign({ bet: bet }, result);
      s.phase = 'pull';
      s.t = 0;
      s.stage = null;
      s.message = '';
      onDone = cb;
    }
  };

  window.Pip.Slots = Slots;
})();
