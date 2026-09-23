/*
 * match.js - Pip Match.
 *
 * Sixteen cards, eight pairs of Pips. Pips you have collected show in full
 * colour; ones you have not met yet are shadows - but a shadow still
 * matches its twin. Quicker and tidier is worth more.
 */

(function () {
  'use strict';

  const P = window.Pip;
  const Art = P.Art;
  const Games = P.Games;
  const W = Games.W;
  const H = Games.H;

  const COLS = 4;
  const ROWS = 4;
  const CW = 60;
  const CH = 42;
  const GAP = 6;
  const X0 = Math.round((W - (COLS * CW + (COLS - 1) * GAP)) / 2);
  const Y0 = Math.round((H - (ROWS * CH + (ROWS - 1) * GAP)) / 2) + 4;

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /** Eight Pips: mostly ones you own, a couple you are yet to meet. */
  function pickTypes(owned) {
    const mine = shuffle(owned.slice()).slice(0, 6);
    const others = shuffle(P.Pips.IDS.filter((id) => mine.indexOf(id) === -1));
    return mine.concat(others).slice(0, 8);
  }

  function cardAt(p) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = X0 + c * (CW + GAP), y = Y0 + r * (CH + GAP);
        if (p.x >= x && p.x < x + CW && p.y >= y && p.y < y + CH) return r * COLS + c;
      }
    }
    return -1;
  }

  function score(s) {
    return Math.max(50, 500 - Math.floor(s.time) * 3 - s.misses * 10);
  }

  const game = {
    id: 'match',
    title: 'Pip Match',
    controls: 'Click two cards to turn them over',

    start(g) {
      const types = pickTypes(g.owned);
      const deck = shuffle(types.concat(types)).map((id) => ({
        id: id,
        up: false,
        done: false,
        flip: 0,          // 0 face down .. 1 face up
        owned: g.owned.indexOf(id) !== -1
      }));
      g.s = { deck: deck, open: [], wait: 0, time: 0, misses: 0, finished: 0 };
    },

    click(g, p) {
      const s = g.s;
      if (s.wait > 0 || s.finished) return;
      const i = cardAt(p);
      if (i < 0) return;
      const card = s.deck[i];
      if (card.up || card.done) return;
      card.up = true;
      s.open.push(i);
      if (s.open.length === 2) {
        const a = s.deck[s.open[0]], b = s.deck[s.open[1]];
        if (a.id === b.id) {
          a.done = b.done = true;
          const ci = s.open[1];
          const x = X0 + (ci % COLS) * (CW + GAP) + CW / 2, y = Y0 + Math.floor(ci / COLS) * (CH + GAP) + CH / 2;
          g.burst('sparkle', x, y, 4);
          s.open = [];
          if (s.deck.every((c) => c.done)) s.finished = 0.01;
        } else {
          s.misses += 1;
          s.wait = 0.8;
        }
      }
    },

    update(g, dt) {
      const s = g.s;
      if (!s.finished) s.time += dt;
      for (const c of s.deck) {
        const want = c.up || c.done ? 1 : 0;
        c.flip += Math.sign(want - c.flip) * Math.min(Math.abs(want - c.flip), dt * 7);
      }
      if (s.wait > 0) {
        s.wait -= dt;
        if (s.wait <= 0) {
          for (const i of s.open) s.deck[i].up = false;
          s.open = [];
        }
      }
      if (s.finished) {
        s.finished += dt;
        if (s.finished > 0.2 && s.finished < 0.25) g.burst('confetti', W / 2, H / 2, 30);
        if (s.finished > 1.4) g.over(score(s));
      }
    },

    draw(g, ctx) {
      const s = g.s;
      Art.rect(ctx, 0, 0, W, H, '#231b3d');
      for (let i = 0; i < s.deck.length; i++) {
        const card = s.deck[i];
        const x = X0 + (i % COLS) * (CW + GAP);
        const y = Y0 + Math.floor(i / COLS) * (CH + GAP);
        // turning over: the card narrows to an edge and widens again
        const face = card.flip > 0.5;
        const squeeze = Math.abs(Math.cos(card.flip * Math.PI));
        const w = Math.max(2, Math.round(CW * squeeze));
        const cx = x + Math.round((CW - w) / 2);
        if (!face) {
          Art.panel(ctx, cx, y, w, CH, '#5a3aa0', '#7a5ac0', '#3a2470');
          if (w > 20) {
            Art.rect(ctx, cx + 4, y + 4, w - 8, CH - 8, '#4a2e88');
            g.text('?', cx + w / 2, y + CH / 2 - 3, { color: '#ffcf3f', align: 'center' });
          }
          continue;
        }
        Art.panel(ctx, cx, y, w, CH, card.done ? '#fff8e0' : '#f6f1e7', '#ffffff', '#cfc6d8');
        if (w > 40) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(cx + 1, y + 1, w - 2, CH - 2);
          ctx.clip();
          P.PipDraw.draw(ctx, card.id, 'idle_0', x + CW / 2 - 32, y + CH / 2 - 44, 1, { silhouette: !card.owned });
          ctx.restore();
          if (!card.owned) g.text('?', x + CW - 7, y + 3, { color: '#8a7ab8' });
        }
      }
      g.text('TIME ' + Math.floor(s.time), 6, 2, { color: '#ffffff', shadow: Art.OUT });
      g.text('MISSES ' + s.misses, W - 6, 2, { color: '#ffffff', align: 'right', shadow: Art.OUT });
    }
  };

  Games.register(game);
})();
