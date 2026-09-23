/*
 * hop.js - Pip Hop.
 *
 * Pip gallops along the desk; everything on it comes at him faster and
 * faster. Jump (hold for a bigger jump) over the mugs, staplers, pencil
 * pots and books, and grab the coins on the way. One bump and it's over.
 */

(function () {
  'use strict';

  const P = window.Pip;
  const Art = P.Art;
  const Games = P.Games;
  const W = Games.W;
  const H = Games.H;
  const GROUND = 168;
  const PIP_X = 56;

  const OBSTACLES = {
    mug: {
      w: 14, h: 12,
      colors: { O: Art.OUT, A: '#e2415a', a: '#a82744', W: '#ffffff', S: '#f6f1e7' },
      rows: [
        '.OOOOOOOOO....',
        '.OSSWSSSSO....',
        '.OAAAAAAAOOOO.',
        '.OAWAAAAAO..O.',
        '.OAWAAAAAO..O.',
        '.OAAAAAAAO..O.',
        '.OAAAAAAAOOOO.',
        '.OAAAAAAaO....',
        '.OAAAAAaaO....',
        '.OAAAAaaaO....',
        '..OaaaaaO.....',
        '...OOOOO......'
      ]
    },
    stapler: {
      w: 22, h: 8,
      colors: { O: Art.OUT, G: '#9aa3b5', W: '#dfe4ee', N: '#3b3452', R: '#e2415a' },
      rows: [
        '..OOOOOOOOOOOOOOOOO...',
        '.OGGGGGGGGGGGGGGGGGO..',
        'OGWWWWGGGGGGGGGGGGGGO.',
        'OOOOOOOOOOOOOOOOOOOOOO',
        '..ONNNNNNNNNNNNNNNNNO.',
        '..ONRRNNNNNNNNNNNNNNO.',
        '..ONNNNNNNNNNNNNNNNNO.',
        '..OOOOOOOOOOOOOOOOOOO.'
      ]
    },
    pencils: {
      w: 12, h: 20,
      colors: { O: Art.OUT, Q: '#ffd23f', q: '#d9960f', K: '#ff8db5', P: '#6cc4f5', p: '#3a82c4', M: '#3b2334', a: '#d9a45a' },
      rows: [
        '..O...O..O..',
        '.OKO.OMO.OO.',
        '.OQO.OaO.OPO',
        '.OQO.OKO.OPO',
        '.OQO.OKO.OPO',
        '.OQO.OKO.OPO',
        'OOOOOOOOOOOO',
        'OPPPPPPPPPPO',
        'OPWPPPPPPPpO',
        'OPPPPPPPPPpO',
        'OPPPPPPPPPpO',
        'OPPPPPPPPPpO',
        'OPPPPPPPPPpO',
        'OPPPPPPPPPpO',
        'OPPPPPPPPppO',
        'OPPPPPPPPppO',
        'OPPPPPPPpppO',
        'OPPPPPPppppO',
        '.OpppppppppO',
        '..OOOOOOOOO.'
      ]
    },
    books: {
      w: 20, h: 14,
      colors: { O: Art.OUT, R: '#e2415a', G: '#68c445', B: '#4a7fe0', S: '#f6f1e7', Y: '#ffd23f' },
      rows: [
        '..OOOOOOOOOOOOOOO...',
        '..OGGGGGGGGGGGGGO...',
        '..OGYGGGGGGGGGGGSO..',
        '..OOOOOOOOOOOOOOOO..',
        'OOOOOOOOOOOOOOOOOOOO',
        'ORRRRRRRRRRRRRRRRRRO',
        'ORRYYRRRRRRRRRRRRRSO',
        'ORRRRRRRRRRRRRRRRRSO',
        'OOOOOOOOOOOOOOOOOOOO',
        '.OBBBBBBBBBBBBBBBBO.',
        '.OBBYBBBBBBBBBBBBSO.',
        '.OBBBBBBBBBBBBBBBSO.',
        '.OBBBBBBBBBBBBBBBSO.',
        '.OOOOOOOOOOOOOOOOOO.'
      ]
    }
  };
  const KINDS = Object.keys(OBSTACLES);

  const game = {
    id: 'hop',
    title: 'Pip Hop',
    controls: 'Space or click to jump - hold for higher',

    start(g) {
      g.s = {
        y: 0,             // height above the desk, px (up is positive)
        vy: 0,
        held: false,
        speed: 120,
        dist: 0,
        coins: 0,
        things: [],
        coinList: [],
        nextThing: 1.2,
        nextCoin: 0.8,
        dead: 0,
        scroll: 0
      };
    },

    key(g, code, down) {
      if (code !== 'Space' && code !== 'ArrowUp' && code !== 'KeyW') return;
      if (down) jump(g);
      g.s.held = down;
    },

    click(g) {
      jump(g);
      g.s.held = true;
    },

    update(g, dt) {
      const s = g.s;
      if (!g.pointer.down && !g.keys.Space && !g.keys.ArrowUp && !g.keys.KeyW) s.held = false;
      if (s.dead) {
        s.dead += dt;
        s.vy -= 900 * dt;
        s.y = Math.max(0, s.y + s.vy * dt);
        if (s.dead > 0.9) g.over(score(s));
        return;
      }

      s.speed = Math.min(270, 120 + s.dist / 60);
      s.dist += s.speed * dt;
      s.scroll += s.speed * dt;

      // gravity is gentler while the jump is held and still rising
      const gravity = s.held && s.vy > 0 ? 520 : 1100;
      s.vy -= gravity * dt;
      s.y += s.vy * dt;
      if (s.y <= 0) {
        if (s.vy < -200) g.burst('dust', PIP_X, GROUND, 2);
        s.y = 0;
        s.vy = 0;
      }

      s.nextThing -= dt;
      if (s.nextThing <= 0) {
        const kind = KINDS[Math.floor(Math.random() * KINDS.length)];
        s.things.push({ kind: kind, x: W + 10 });
        s.nextThing = Math.max(0.65, 1.7 - s.dist / 4000) * (0.8 + Math.random() * 0.6);
      }
      s.nextCoin -= dt;
      if (s.nextCoin <= 0) {
        const high = Math.random() < 0.5;
        for (let i = 0; i < 3; i++) s.coinList.push({ x: W + 10 + i * 12, y: high ? 64 : 30 });
        s.nextCoin = 1.6 + Math.random() * 1.6;
      }

      for (const t of s.things) t.x -= s.speed * dt;
      for (const c of s.coinList) c.x -= s.speed * dt;
      s.things = s.things.filter((t) => t.x > -40);
      s.coinList = s.coinList.filter((c) => c.x > -10 && !c.got);

      // Pip's body, roughly, for bumping into things
      const px0 = PIP_X - 13, px1 = PIP_X + 15, py0 = s.y, py1 = s.y + 26;
      for (const t of s.things) {
        const o = OBSTACLES[t.kind];
        const x0 = t.x + 2, x1 = t.x + o.w - 2, y1 = o.h - 1;
        if (px1 > x0 && px0 < x1 && py0 < y1) {
          s.dead = 0.01;
          s.vy = 260;
          g.burst('star', PIP_X, GROUND - 30, 4);
          break;
        }
      }
      for (const c of s.coinList) {
        if (Math.abs(c.x - PIP_X) < 14 && Math.abs(c.y - (s.y + 14)) < 16) {
          c.got = true;
          s.coins += 1;
          g.burst('sparkle', c.x, GROUND - c.y, 2);
        }
      }
    },

    draw(g, ctx) {
      const s = g.s;
      // the wall, the window and the night outside
      Art.rect(ctx, 0, 0, W, H, '#2a2046');
      const wx = Math.round(200 - (s.scroll * 0.1) % 400);
      for (const x of [wx, wx + 400]) {
        Art.panel(ctx, x, 18, 70, 60, '#1b2748', null, null);
        Art.rect(ctx, x + 34, 19, 2, 58, Art.OUT);
        Art.rect(ctx, x + 1, 47, 68, 2, Art.OUT);
        Art.rect(ctx, x + 12, 28, 2, 2, '#ffe36b');
        Art.rect(ctx, x + 52, 36, 1, 1, '#ffffff');
      }
      // the desk
      Art.rect(ctx, 0, GROUND, W, H - GROUND, '#8a5a32');
      Art.rect(ctx, 0, GROUND, W, 2, '#b07a44');
      for (let i = 0; i < 12; i++) {
        const x = Math.round(((i * 53 - s.scroll) % (W + 60) + W + 60) % (W + 60)) - 30;
        Art.rect(ctx, x, GROUND + 8 + (i % 3) * 7, 22, 1, '#6a4424');
      }
      for (const t of s.things) {
        const o = OBSTACLES[t.kind];
        Art.sprite(ctx, o.rows, t.x, GROUND - o.h, o.colors, 1);
      }
      for (const c of s.coinList) {
        Art.disc(ctx, c.x, GROUND - c.y, 4, Art.OUT);
        Art.disc(ctx, c.x, GROUND - c.y, 3, '#ffcf3f');
        Art.rect(ctx, c.x - 1, GROUND - c.y - 2, 1, 3, '#fff3b0');
      }
      let frame;
      if (s.dead) frame = 'bonk_1';
      else if (s.y > 0) frame = s.vy > 0 ? 'hop_2' : 'fall_0';
      else frame = P.Animations.frameAt('run', g.t * 1000).frame;
      P.PipDraw.draw(ctx, g.typeId, frame, PIP_X - 32, GROUND - 62 - s.y, 1);

      g.text('SCORE ' + score(s), 6, 6, { color: '#ffffff', shadow: Art.OUT });
      g.text(s.coins + '@', W - 6, 6, { color: '#ffcf3f', align: 'right', shadow: Art.OUT });
    }
  };

  function jump(g) {
    const s = g.s;
    if (!s || s.dead || s.y > 0) return;
    s.vy = 330;
    s.held = true;
  }

  /** A point for every ten pixels run, and ten for every coin. */
  function score(s) {
    return Math.floor(s.dist / 10) + s.coins * 10;
  }

  Games.register(game);
})();
