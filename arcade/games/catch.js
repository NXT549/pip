/*
 * catch.js - Bean Catch.
 *
 * Jellybeans rain down; steer Pip under them. A bean is 10, a golden bean
 * 50, and a rotten one costs one of three lives. Sixty seconds, and the
 * rain gets heavier as it goes.
 */

(function () {
  'use strict';

  const P = window.Pip;
  const Art = P.Art;
  const Games = P.Games;
  const W = Games.W;
  const H = Games.H;
  const FLOOR = 192;
  const SCALE = 1;
  const LENGTH = 60;

  const BEAN_COLORS = ['#e2415a', '#68c445', '#4a7fe0', '#f2cc3d', '#9b5cd6', '#ff8fc8', '#f58a2e'];

  // a little jellybean, with its own gloss
  const BEAN = [
    '..OOOOOO..',
    '.OXWWXXXO.',
    'OXWXXXXXXO',
    'OXXXXXXXdO',
    'OXXXXXXddO',
    '.OXXXddO..',
    '..OOOO....'
  ];

  function drawBean(ctx, b) {
    const color = b.kind === 'gold' ? '#ffcf3f' : b.kind === 'rotten' ? '#7a8a5a' : b.color;
    const dark = b.kind === 'gold' ? '#d9960f' : b.kind === 'rotten' ? '#56643a' : 'rgba(42,26,45,0.35)';
    Art.sprite(ctx, BEAN, b.x - 5, b.y - 3, { O: Art.OUT, X: color, d: dark, W: b.kind === 'rotten' ? '#a8b88a' : '#ffffff' }, 1);
    if (b.kind === 'rotten') {
      // stink lines
      const w = Math.round(Math.sin(b.y / 4));
      Art.rect(ctx, b.x - 3 + w, b.y - 9, 1, 3, '#9ab06a');
      Art.rect(ctx, b.x + 2 - w, b.y - 10, 1, 3, '#9ab06a');
    }
  }

  const game = {
    id: 'catch',
    title: 'Bean Catch',
    controls: 'Move the mouse or use the arrow keys',

    start(g) {
      g.s = {
        x: W / 2,
        vx: 0,
        facing: 1,
        beans: [],
        spawn: 0,
        score: 0,
        lives: 3,
        time: LENGTH,
        chomp: 0,
        hurt: 0,
        shake: 0,
        usingKeys: false
      };
    },

    update(g, dt) {
      const s = g.s;
      s.time -= dt;
      if (s.time <= 0 || s.lives <= 0) { g.over(s.score); return; }

      // steering: the pointer, unless the keys are in use
      let target = s.x;
      if (g.keys.ArrowLeft || g.keys.KeyA) { target = s.x - 260 * dt; s.usingKeys = true; }
      else if (g.keys.ArrowRight || g.keys.KeyD) { target = s.x + 260 * dt; s.usingKeys = true; }
      else if (!s.usingKeys) target = g.pointer.x;
      target = Math.max(22, Math.min(W - 22, target));
      const old = s.x;
      s.x += (target - s.x) * Math.min(1, dt * 12);
      s.vx = (s.x - old) / dt;
      if (Math.abs(s.vx) > 8) s.facing = s.vx > 0 ? 1 : -1;

      // the rain gets heavier as the clock runs down
      const heat = 1 - s.time / LENGTH;
      s.spawn -= dt;
      if (s.spawn <= 0) {
        s.spawn = 0.55 - heat * 0.32;
        const r = Math.random();
        s.beans.push({
          x: 12 + Math.random() * (W - 24),
          y: -6,
          vy: 45 + heat * 70 + Math.random() * 25,
          kind: r < 0.08 ? 'gold' : r < 0.22 + heat * 0.08 ? 'rotten' : 'bean',
          color: BEAN_COLORS[Math.floor(Math.random() * BEAN_COLORS.length)]
        });
      }

      const mouthY = FLOOR - 22;
      for (const b of s.beans) {
        b.y += b.vy * dt;
        if (b.kind === 'gold' && Math.random() < dt * 8) g.burst('sparkle', b.x, b.y, 1, { size: 0.6 });
        if (!b.gone && Math.abs(b.x - s.x) < 17 && b.y > mouthY - 16 && b.y < mouthY + 8) {
          b.gone = true;
          if (b.kind === 'rotten') {
            s.lives -= 1;
            s.hurt = 0.6;
            s.shake = 4;
            g.burst('steam', s.x, mouthY - 6, 2);
          } else {
            s.score += b.kind === 'gold' ? 50 : 10;
            s.chomp = 0.25;
            g.burst(b.kind === 'gold' ? 'star' : 'sparkle', b.x, b.y, b.kind === 'gold' ? 4 : 2);
            if (b.kind === 'gold') g.burst('coin', b.x, b.y, 1);
          }
        }
        if (b.y > FLOOR && !b.gone) {
          b.gone = true;
          if (b.kind !== 'rotten') g.burst('dust', b.x, FLOOR, 1);
        }
      }
      s.beans = s.beans.filter((b) => !b.gone);
      s.chomp = Math.max(0, s.chomp - dt);
      s.hurt = Math.max(0, s.hurt - dt);
      s.shake = Math.max(0, s.shake - dt * 12);
    },

    draw(g, ctx) {
      const s = g.s;
      ctx.save();
      if (s.shake) ctx.translate(Math.round((Math.random() - 0.5) * s.shake), 0);
      // a kitchen shelf at night
      Art.rect(ctx, 0, 0, W, H, '#2a2046');
      for (let x = 0; x < W; x += 40) Art.rect(ctx, x, 0, 1, FLOOR, '#2f2550');
      Art.rect(ctx, 0, FLOOR, W, H - FLOOR, '#6a4a2a');
      Art.rect(ctx, 0, FLOOR, W, 2, '#8a6a3a');
      for (const b of s.beans) drawBean(ctx, b);

      // Pip: trotting, chomping or wincing
      let frame;
      if (s.hurt) frame = 'sulk_0';
      else if (s.chomp) frame = 'eat_2';
      else if (Math.abs(s.vx) > 20) frame = P.Animations.frameAt('walk', g.t * 1000).frame;
      else frame = 'idle_0';
      const size = 64 * SCALE;
      P.PipDraw.draw(ctx, g.typeId, frame, s.x - size / 2, FLOOR - 62 * SCALE, SCALE, { flip: s.facing < 0 });
      ctx.restore();

      // the scoreboard
      g.text('SCORE ' + s.score, 6, 6, { color: '#ffffff', shadow: Art.OUT });
      g.text(Math.ceil(Math.max(0, s.time)) + 'S', W - 6, 6, { color: s.time < 10 ? '#ff5f8d' : '#ffffff', align: 'right', shadow: Art.OUT });
      g.text('&'.repeat(Math.max(0, s.lives)), W / 2, 6, { color: '#ff5f8d', align: 'center', shadow: Art.OUT });
    }
  };

  Games.register(game);
})();
