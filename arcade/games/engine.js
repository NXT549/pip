/*
 * engine.js - the little game engine the minigames share.
 *
 * One canvas (320 x 200 logical pixels), one loop, three screens: the
 * title card, the game itself, and the results. A game is a plain object:
 *
 *   {
 *     id, title, controls,             shown on the title card
 *     start(g)                         set up a fresh round
 *     update(g, dt)                    dt in seconds
 *     draw(g, ctx)
 *     click(g, p) / key(g, code, down) optional input
 *   }
 *
 * and it ends a round by calling g.over(score). The engine asks main what
 * the score was worth (coins are only ever decided there) and shows it.
 */

(function () {
  'use strict';

  const P = window.Pip;
  const Art = P.Art;
  const PF = P.PixelFont;
  const W = 320;
  const H = 200;

  const Engine = {
    W: W,
    H: H,
    games: {},
    register(game) { this.games[game.id] = game; }
  };

  let ctx = null;
  let canvas = null;
  let raf = 0;
  let last = 0;
  let game = null;
  let submit = null;

  /** The state every game gets. */
  const g = {
    screen: 'title',      // title | play | over
    t: 0,
    keys: {},
    pointer: { x: W / 2, y: H / 2, down: false },
    typeId: 'cherry',
    owned: [],
    particles: [],
    result: null,
    score: 0,
    over(score) {
      if (g.screen !== 'play') return;
      g.screen = 'over';
      g.t = 0;
      g.score = Math.max(0, Math.floor(score));
      g.result = null;
      if (submit) {
        submit(game.id, g.score).then((res) => { g.result = res || { paid: 0 }; })
          .catch(() => { g.result = { paid: 0 }; });
      }
    },
    burst(kind, x, y, n, opts) { P.Particles.spawn(g.particles, kind, x, y, n, opts); },
    text(s, x, y, opts) { return PF.draw(ctx, s, x, y, opts); }
  };

  function drawTitle() {
    Art.rect(ctx, 0, 0, W, H, '#1b1530');
    for (let i = 0; i < 40; i++) {
      const x = (i * 71) % W, y = (i * 37) % H;
      Art.rect(ctx, x, y, 1, 1, i % 3 ? '#3d3266' : '#6a58a8');
    }
    PF.draw(ctx, game.title.toUpperCase(), W / 2, 36, { color: '#ffcf3f', align: 'center', scale: 3, shadow: '#a8282e' });
    // your Pip, bouncing about on the title card
    const frames = ['bounce_0', 'bounce_1', 'bounce_2', 'bounce_1'];
    const f = frames[Math.floor(g.t * 7) % frames.length];
    P.PipDraw.draw(ctx, g.typeId, f, W / 2 - 32, 66, 1);
    PF.draw(ctx, game.controls.toUpperCase(), W / 2, 142, { color: '#b8acd8', align: 'center' });
    if (Math.floor(g.t * 2) % 2 === 0) {
      PF.draw(ctx, 'CLICK OR PRESS SPACE TO START', W / 2, 166, { color: '#ffffff', align: 'center' });
    }
  }

  function drawOver() {
    ctx.save();
    ctx.globalAlpha = Math.min(0.75, g.t * 3);
    Art.rect(ctx, 0, 0, W, H, '#120d22');
    ctx.restore();
    PF.draw(ctx, 'GAME OVER', W / 2, 40, { color: '#ff5f8d', align: 'center', scale: 3, shadow: Art.OUT });
    PF.draw(ctx, 'SCORE ' + g.score, W / 2, 82, { color: '#ffffff', align: 'center', scale: 2, shadow: Art.OUT });
    if (!g.result) {
      PF.draw(ctx, 'COUNTING COINS...', W / 2, 112, { color: '#b8acd8', align: 'center' });
    } else {
      PF.draw(ctx, '+' + g.result.paid + '@', W / 2, 108, { color: '#ffcf3f', align: 'center', scale: 2, shadow: Art.OUT });
      if (g.result.highScore) {
        const bob = Math.round(Math.sin(g.t * 6) * 2);
        PF.draw(ctx, 'NEW HIGH SCORE!', W / 2, 134 + bob, { color: '#6bffb8', align: 'center', shadow: Art.OUT });
      } else if (g.result.best) {
        PF.draw(ctx, 'BEST ' + g.result.best, W / 2, 134, { color: '#b8acd8', align: 'center' });
      }
      if (g.t > 1) PF.draw(ctx, 'CLICK TO PLAY AGAIN', W / 2, 168, { color: '#ffffff', align: 'center' });
    }
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    g.t += dt;
    g.particles = P.Particles.update(g.particles, dt);
    ctx.clearRect(0, 0, W, H);
    if (g.screen === 'title') {
      drawTitle();
    } else {
      if (g.screen === 'play') game.update(g, dt);
      game.draw(g, ctx);
      P.Particles.draw(ctx, g.particles, 2);
      if (g.screen === 'over') drawOver();
    }
    raf = requestAnimationFrame(loop);
  }

  function begin() {
    g.screen = 'play';
    g.t = 0;
    g.particles = [];
    g.result = null;
    game.start(g);
  }

  function press() {
    if (g.screen === 'title') begin();
    else if (g.screen === 'over' && g.result && g.t > 1) begin();
  }

  Engine.init = function (el, onSubmit) {
    canvas = el;
    ctx = Art.setup(canvas, W, H, 2);
    submit = onSubmit;
    g.ctx = ctx;
    canvas.tabIndex = 0;
    canvas.addEventListener('mousemove', (e) => {
      const p = Art.pointer(canvas, e);
      g.pointer.x = p.x;
      g.pointer.y = p.y;
    });
    canvas.addEventListener('mousedown', (e) => {
      canvas.focus();
      const p = Art.pointer(canvas, e);
      g.pointer.down = true;
      if (g.screen === 'play' && game.click) game.click(g, p);
      else press();
    });
    window.addEventListener('mouseup', () => { g.pointer.down = false; });
    window.addEventListener('keydown', (e) => {
      if (!raf) return;
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.code) !== -1) e.preventDefault();
      g.keys[e.code] = true;
      if (g.screen === 'play' && game.key) game.key(g, e.code, true);
      else if (e.code === 'Space' || e.code === 'Enter') press();
    });
    window.addEventListener('keyup', (e) => {
      g.keys[e.code] = false;
      if (g.screen === 'play' && game.key) game.key(g, e.code, false);
    });
  };

  /** Show a game's title card and start its loop. */
  Engine.open = function (id, typeId, owned) {
    game = Engine.games[id];
    g.typeId = typeId;
    g.owned = owned || [];
    g.screen = 'title';
    g.t = 0;
    g.particles = [];
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
    canvas.focus();
  };

  Engine.close = function () {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    g.keys = {};
  };

  Engine.state = g;

  window.Pip.Games = Engine;
})();
