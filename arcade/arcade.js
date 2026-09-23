/*
 * arcade.js - Pip's Arcade: the shell around the machines and games.
 *
 * Owns the header (coins and tickets, counting up as you earn), the tabs,
 * the buttons, the Pipdex and the "how to earn" page. Every coin and every
 * roll comes from main through window.pipArcade; this window never decides
 * an outcome, it only shows one.
 */

(function () {
  'use strict';

  const api = window.pipArcade;
  const P = window.Pip;
  const Art = P.Art;
  const PF = P.PixelFont;

  let state = null;
  let shownCoins = 0;
  let tab = 'gacha';
  let bet = 10;
  let filter = 'all';
  let detailId = null;
  let detailStage = null;
  let detailRaf = 0;

  const $ = (id) => document.getElementById(id);

  /* ---------------------------------------------------------------- *
   * Header
   * ---------------------------------------------------------------- */

  const titleCtx = Art.setup($('title'), 110, 12, 2);
  const coinCtx = Art.setup($('coins'), 60, 12, 2);
  const ticketCtx = Art.setup($('tickets'), 35, 12, 2);

  function drawTitle() {
    titleCtx.clearRect(0, 0, 110, 12);
    PF.draw(titleCtx, "PIP'S ARCADE", 1, 2, { color: '#ffcf3f', shadow: '#a8282e' });
  }

  function drawPurse() {
    coinCtx.clearRect(0, 0, 60, 12);
    Art.disc(coinCtx, 7, 6, 4, Art.OUT);
    Art.disc(coinCtx, 7, 6, 3, '#ffcf3f');
    Art.rect(coinCtx, 6, 4, 1, 3, '#fff3b0');
    PF.draw(coinCtx, String(Math.round(shownCoins)), 57, 3, { color: '#ffffff', align: 'right' });
    ticketCtx.clearRect(0, 0, 35, 12);
    Art.sprite(ticketCtx, ['OOOOOOO', 'OKKKKKO', 'OKWKKKO', 'OKKKKKO', 'OOOOOOO'], 2, 3, { O: Art.OUT, K: '#ff8db5', W: '#fff' }, 1);
    PF.draw(ticketCtx, String(state ? state.tickets : 0), 32, 3, { color: '#ffffff', align: 'right' });
  }

  /** Coins count up (or down) to the real balance rather than jumping. */
  function tickPurse() {
    if (!state) return;
    const target = state.coins;
    if (Math.abs(target - shownCoins) < 0.5) { shownCoins = target; drawPurse(); return; }
    shownCoins += (target - shownCoins) * 0.18 + Math.sign(target - shownCoins) * 0.5;
    if (Math.abs(target - shownCoins) < 0.5) shownCoins = target;
    drawPurse();
    requestAnimationFrame(tickPurse);
  }

  function setState(next) {
    if (!next) return;
    const first = !state;
    state = next;
    if (first) shownCoins = state.coins;
    requestAnimationFrame(tickPurse);
    P.Slots.setPip(state.equipped);
    refreshButtons();
    renderBests();
    if (tab === 'pipdex') renderDex();
    if (tab === 'earn') renderEarn();
  }

  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  /* ---------------------------------------------------------------- *
   * Tabs
   * ---------------------------------------------------------------- */

  function show(name) {
    tab = name;
    for (const b of document.querySelectorAll('.tabs button')) {
      b.setAttribute('aria-selected', b.dataset.tab === name ? 'true' : 'false');
    }
    for (const s of document.querySelectorAll('.tab')) s.hidden = s.id !== 'tab-' + name;
    // only the showing tab animates
    P.Gacha.run(name === 'gacha');
    P.Slots.run(name === 'slots');
    if (name !== 'play') closeGame();
    if (name === 'pipdex') renderDex();
    if (name === 'earn') renderEarn();
    try { localStorage.setItem('pip-arcade-tab', name); } catch (err) { /* private mode */ }
  }

  for (const b of document.querySelectorAll('.tabs button')) {
    b.addEventListener('click', () => show(b.dataset.tab));
  }

  /* ---------------------------------------------------------------- *
   * Pip-a-Pon
   * ---------------------------------------------------------------- */

  function refreshButtons() {
    if (!state) return;
    const R = state.rules;
    const busy = P.Gacha.busy();
    const p1 = $('pull1');
    p1.textContent = state.tickets > 0 ? 'Pull x1 · 1 ticket' : 'Pull x1 · ' + R.COSTS.single + ' coins';
    p1.disabled = busy || (state.tickets < 1 && state.coins < R.COSTS.single);
    const p10 = $('pull10');
    p10.textContent = 'Pull x10 · ' + R.COSTS.ten + ' coins';
    p10.disabled = busy || state.coins < R.COSTS.ten;
    $('gachaNote').textContent = 'Epic or better within ' + state.pity.epicIn + ' pulls · Legendary within ' +
      state.pity.legendaryIn + ' pulls · a ten-pull always has a rare or better';
    $('spin').disabled = P.Slots.busy() || state.coins < bet;
  }

  async function pull(count) {
    if (P.Gacha.busy()) return;
    const res = await api.pull(count);
    if (!res || !res.ok) {
      toast(res && res.error === 'not enough coins' ? 'Not enough coins yet - see How to earn' : 'The machine jammed. Try again?');
      if (res) setState(res.state);
      return;
    }
    $('gachaResults').textContent = '';
    $('gachaSkip').textContent = count === 10 ? 'Open all' : 'Skip';
    $('gachaSkip').hidden = false;
    P.Gacha.play(res.results, res.paidWith, () => {
      $('gachaSkip').hidden = true;
      showResults(res.results);
      setState(res.state);
    });
    // the balance drops now; refunds show up once the capsules are open
    state = Object.assign({}, state, { coins: res.state.coins, tickets: res.state.tickets });
    refreshButtons();
    requestAnimationFrame(tickPurse);
    setTimeout(refreshButtons, 50);
  }

  function showResults(results) {
    const host = $('gachaResults');
    host.textContent = '';
    for (const r of results) {
      const type = P.Pips.get(r.id);
      const card = document.createElement('div');
      card.className = 'result';
      const c = document.createElement('canvas');
      const ctx = Art.setup(c, 64, 64, 1);
      P.PipDraw.draw(ctx, r.id, 'idle_0', 0, 0, 1);
      card.appendChild(c);
      const name = document.createElement('div');
      name.textContent = type.name;
      name.className = 'rarity-' + r.rarity;
      card.appendChild(name);
      const badge = document.createElement('div');
      badge.className = 'badge ' + (r.isNew ? 'new' : 'dupe');
      badge.textContent = r.isNew ? 'NEW!' : '+' + r.refund + ' coins';
      card.appendChild(badge);
      host.appendChild(card);
    }
  }

  $('pull1').addEventListener('click', () => pull(1));
  $('pull10').addEventListener('click', () => pull(10));
  $('gachaSkip').addEventListener('click', () => {
    P.Gacha.skip();
    P.Gacha.openAll();
  });

  function renderOdds() {
    const R = state.rules;
    const rows = R.RARITIES.map((r) => {
      const n = P.Pips.byRarity(r).length;
      return '<tr><td class="rarity-' + r + '">' + cap(r) + '</td><td>' + (R.RATES[r] * 100).toFixed(1) +
        '%</td><td>' + n + ' Pips</td><td>' + R.REFUND[r] + ' coins back for a duplicate</td></tr>';
    }).join('');
    $('gachaOdds').innerHTML =
      '<table><tr><th>Rarity</th><th>Chance</th><th>How many</th><th>Duplicates</th></tr>' + rows + '</table>' +
      '<p>Within a rarity, every Pip is equally likely. An epic or better is guaranteed at least every ' +
      R.PITY.epic + ' pulls, and a legendary at least every ' + R.PITY.legendary + '. A ten-pull always contains a rare or better. ' +
      'Rare, epic and legendary Pips each have their own special effect.</p>';
  }

  /* ---------------------------------------------------------------- *
   * Slots
   * ---------------------------------------------------------------- */

  function renderBets() {
    const host = $('bets');
    host.textContent = '';
    for (const b of state.rules.BETS) {
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = b;
      el.setAttribute('aria-pressed', b === bet ? 'true' : 'false');
      el.addEventListener('click', () => {
        bet = b;
        for (const x of host.children) x.setAttribute('aria-pressed', x === el ? 'true' : 'false');
        refreshButtons();
      });
      host.appendChild(el);
    }
  }

  async function spin() {
    if (P.Slots.busy() || !state || state.coins < bet) return;
    const res = await api.spin(bet);
    if (!res || !res.ok) {
      toast('Not enough coins for that bet');
      if (res) setState(res.state);
      return;
    }
    // the bet goes in now; the winnings arrive when the reels stop
    state = Object.assign({}, state, { coins: state.coins - bet });
    requestAnimationFrame(tickPurse);
    refreshButtons();
    P.Slots.play(res, bet, () => {
      setState(res.state);
      if (res.ticket) toast('Three capsules! +1 ticket');
      if (res.bonus) {
        toast('JACKPOT! A free capsule: ' + P.Pips.get(res.bonus.id).name + (res.bonus.isNew ? ' - new!' : ''));
      }
    });
  }

  $('spin').addEventListener('click', spin);
  P.Slots.onLever = spin;

  function renderPaytable() {
    const R = state.rules;
    const sym = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const rows = Object.keys(R.THREE).map((s) => '<tr><td>Three ' + sym(s) + (s === 'pip' ? 's' : 's') + '</td><td>' +
      R.THREE[s] + 'x' + (s === 'pip' ? ' + a free rare-or-better capsule' : s === 'capsule' ? ' + a ticket' : '') + '</td></tr>').join('');
    $('paytable').innerHTML =
      '<table><tr><th>Line</th><th>Pays (times your bet)</th></tr>' + rows +
      '<tr><td>A pair of fruit on the first two reels</td><td>2x</td></tr>' +
      '<tr><td>Any other pair on the first two reels</td><td>4x</td></tr>' +
      '<tr><td>Each coin on the line</td><td>1x</td></tr>' +
      '<tr><td>A cherry in the first window</td><td>1.5x</td></tr></table>' +
      '<p>The reels are simply random. Over every possible spin the machine pays back ' +
      Math.round(state.slotReturn * 100) + '% of what goes in - it is a fun way to spend coins, not a way to make them.</p>';
  }

  /* ---------------------------------------------------------------- *
   * Games
   * ---------------------------------------------------------------- */

  function renderBests() {
    if (!state) return;
    for (const el of document.querySelectorAll('[data-best]')) {
      const best = state.highScores[el.dataset.best] || 0;
      el.textContent = best ? 'Best: ' + best : 'Not played yet';
    }
  }

  function openGame(id) {
    $('gamePick').hidden = true;
    $('gameWrap').hidden = false;
    $('gameHint').textContent = 'Coins for every game, in full up to ' + state.rules.GAMES_DAILY_FULL + ' a day';
    P.Games.open(id, state.equipped, state.owned.map((o) => o.id));
  }

  function closeGame() {
    P.Games.close();
    $('gamePick').hidden = false;
    $('gameWrap').hidden = true;
  }

  for (const b of document.querySelectorAll('[data-game]')) {
    b.addEventListener('click', () => openGame(b.dataset.game));
  }
  $('gameBack').addEventListener('click', closeGame);

  /* ---------------------------------------------------------------- *
   * Pipdex
   * ---------------------------------------------------------------- */

  function ownedCount(id) {
    const o = state.owned.find((x) => x.id === id);
    return o ? o.count : 0;
  }

  function renderDex() {
    if (!state) return;
    const have = state.owned.length;
    $('dexCount').textContent = have + ' / ' + P.Pips.TYPES.length + ' collected';
    $('dexMeter').style.width = Math.round((have / P.Pips.TYPES.length) * 100) + '%';

    const filters = $('dexFilters');
    if (!filters.children.length) {
      for (const f of ['all', 'owned', 'missing'].concat(P.Pips.RARITIES)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = cap(f);
        b.dataset.filter = f;
        b.addEventListener('click', () => { filter = f; renderDex(); });
        filters.appendChild(b);
      }
    }
    for (const b of filters.children) b.setAttribute('aria-pressed', b.dataset.filter === filter ? 'true' : 'false');

    const host = $('dex');
    host.textContent = '';
    for (const type of P.Pips.TYPES) {
      const n = ownedCount(type.id);
      if (filter === 'owned' && !n) continue;
      if (filter === 'missing' && n) continue;
      if (P.Pips.RARITIES.indexOf(filter) !== -1 && type.rarity !== filter) continue;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'pip-card' + (n ? '' : ' locked');
      card.dataset.rarity = type.rarity;
      card.setAttribute('aria-label', n ? type.name : 'Not collected yet');
      const c = document.createElement('canvas');
      const ctx = Art.setup(c, 64, 64, 2);
      P.PipDraw.draw(ctx, type.id, 'idle_0', 0, 0, 1, { silhouette: !n });
      card.appendChild(c);
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = n ? type.name : '???';
      card.appendChild(name);
      const stars = document.createElement('span');
      stars.className = 'stars rarity-' + type.rarity;
      stars.textContent = '★'.repeat(P.Pips.RARITIES.indexOf(type.rarity) + 1);
      card.appendChild(stars);
      if (n > 1) {
        const cnt = document.createElement('span');
        cnt.className = 'count';
        cnt.textContent = 'x' + n;
        card.appendChild(cnt);
      }
      if (state.equipped === type.id) {
        const worn = document.createElement('span');
        worn.className = 'worn';
        worn.textContent = 'Wearing';
        card.appendChild(worn);
      }
      if (n) card.addEventListener('click', () => openDetail(type.id));
      host.appendChild(card);
    }
  }

  const detailCtx = Art.setup($('detailStage'), 160, 148, 2);

  function openDetail(id) {
    const type = P.Pips.get(id);
    detailId = id;
    $('detailName').textContent = type.name;
    $('detailName').className = 'rarity-' + type.rarity;
    $('detailMeta').textContent = cap(type.rarity) + ' · ' + cap(type.temperament) +
      (type.effect ? ' · special effect: ' + type.effect : '') + ' · you have ' + ownedCount(id);
    $('detailBlurb').textContent = type.blurb;
    const worn = state.equipped === id;
    $('detailEquip').textContent = worn ? 'Wearing this Pip' : 'Wear this Pip';
    $('detailEquip').disabled = worn;
    $('detail').hidden = false;
    // feet on the floor at row 136: the art's feet are on its row 62
    detailStage = P.PipDraw.stage(id, { x: 16, y: 136 - 62 * 2, scale: 2, clip: 'lookatyou' });
    let lastT = performance.now();
    const clips = ['idle', 'happy', 'dance', 'wave', 'bounce', 'idle', 'twirl', 'stretch'];
    let ci = 0;
    const loop = (now) => {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      detailStage.update(dt);
      if (detailStage.clip === 'idle' && detailStage.t > 2400) detailStage.play(clips[++ci % clips.length]);
      detailCtx.clearRect(0, 0, 160, 148);
      Art.rect(detailCtx, 0, 136, 160, 12, '#1a1430');
      Art.rect(detailCtx, 0, 136, 160, 1, '#3d3266');
      detailStage.draw(detailCtx);
      detailRaf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(detailRaf);
    detailRaf = requestAnimationFrame(loop);
  }

  function closeDetail() {
    $('detail').hidden = true;
    cancelAnimationFrame(detailRaf);
    detailRaf = 0;
    detailStage = null;
  }

  $('detailClose').addEventListener('click', closeDetail);
  $('detail').addEventListener('click', (e) => { if (e.target === $('detail')) closeDetail(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('detail').hidden) closeDetail(); });
  $('detailEquip').addEventListener('click', () => {
    if (!detailId) return;
    api.equip(detailId);
    toast(P.Pips.get(detailId).name + ' is out on your desktop now');
    $('detailEquip').textContent = 'Wearing this Pip';
    $('detailEquip').disabled = true;
  });

  /* ---------------------------------------------------------------- *
   * How to earn
   * ---------------------------------------------------------------- */

  function renderEarn() {
    if (!state) return;
    const R = state.rules;
    const e = state.earned;
    const caps = state.caps;
    const item = (what, pays, detail, done, max) => {
      // widths are set from script below: the page allows no inline styles
      const meter = max ? '<div class="meter"><div class="meter-fill" data-fill="' +
        Math.min(100, Math.round((done / max) * 100)) + '"></div></div>' : '';
      return '<div class="earn-item"><div class="what">' + what + '</div><div class="pays">' + pays + '</div>' +
        '<div class="detail">' + detail + '</div>' + meter + '</div>';
    };
    const streak = state.streak || 0;
    $('earn').innerHTML = '<div class="earn-list">' +
      item('Keep Pip company', R.PASSIVE.perMinute + ' coin a minute',
        'While you are at your computer, paid every ' + R.PASSIVE.payEvery + ' minutes. Today: ' + e.passive + ' of ' + caps.passive + '.', e.passive, caps.passive) +
      item('Say hello each day', R.HELLO.coins + '+ coins',
        'Your first visit of the day, plus ' + R.HELLO.streakStep + ' more for every day in a row (up to +' + R.HELLO.streakMax + '). Current streak: ' + streak + (streak === 1 ? ' day.' : ' days.')) +
      item('Finish a Pomodoro', R.HABITS.pomodoro.coins + ' coins', 'Every work block you see through to the end.') +
      item('Drink some water', R.HABITS.water.coins + ' coins',
        'Tell Pip whenever you have had a glass. Today: ' + e.water + ' of ' + caps.water + '.', e.water, caps.water) +
      item('Take a proper break', R.HABITS.break.coins + ' coins',
        'Five minutes or more away from the keyboard. Today: ' + e.breaks + ' of ' + caps.breaks + '.', e.breaks, caps.breaks) +
      item('Play the minigames', 'up to ' + R.GAME_MAX + ' a game',
        'Full rate for the first ' + caps.games + ' coins a day, a quarter after that. Today: ' + e.games + '.', Math.min(e.games, caps.games), caps.games) +
      item('Duplicates', 'coins back', 'A Pip you already have gives coins back: ' +
        R.RARITIES.map((r) => cap(r) + ' ' + R.REFUND[r]).join(', ') + '.') +
      '</div>';
    for (const el of document.querySelectorAll('[data-fill]')) el.style.width = el.dataset.fill + '%';
  }

  function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* ---------------------------------------------------------------- *
   * Boot
   * ---------------------------------------------------------------- */

  async function boot() {
    drawTitle();
    P.Gacha.init($('gacha'));
    const first = await api.get();
    P.Slots.init($('slots'), first.rules.REEL);
    P.Games.init($('game'), async (game, score) => {
      const res = await api.gameEnd(game, score);
      if (res && res.state) setState(res.state);
      return res;
    });
    setState(first);
    renderOdds();
    renderBets();
    renderPaytable();
    api.onUpdate((s) => {
      // An update mid-animation would spoil the reveal; the animation's own
      // callback brings the balance up to date when it finishes.
      if (P.Gacha.busy() || P.Slots.busy()) return;
      setState(s);
    });
    let start = 'gacha';
    try { start = localStorage.getItem('pip-arcade-tab') || 'gacha'; } catch (err) { /* private mode */ }
    show(document.querySelector('[data-tab="' + start + '"]') ? start : 'gacha');
    document.body.dataset.ready = 'true';
  }

  // Exposed so the smoke test can check the arcade without a real user.
  window.__arcade = {
    ready: () => document.body.dataset.ready === 'true',
    cards: () => { show('pipdex'); return document.querySelectorAll('.pip-card canvas').length; },
    pull: async () => { const r = await api.pull(1); return r && r.ok ? r.results.length : 'error: ' + (r && r.error); },
    spin: async () => { const r = await api.spin(10); return r && r.ok ? r.reels.length : 'error: ' + (r && r.error); },
    game: (id) => { show('play'); openGame(id); return !!P.Games.games[id]; }
  };

  boot().catch((err) => toast('The arcade could not start: ' + err.message));
})();
