/*
 * economy.test.js - coins, the gacha machine and the slots.
 *
 * The rules a player can see in the arcade (the odds, the pity, the
 * paytable, the daily limits) are promises, so each one is checked here.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const E = require('../src/main/economy.js');
const Pips = require('../src/renderer/pips.js');
const brain = require('../src/main/brain.js');

const DAY = '2026-09-23';
const YESTERDAY = '2026-09-22';

function fresh() {
  return E.createState(Pips.STARTERS);
}

test('the rates add up to exactly one', () => {
  const sum = E.RARITIES.reduce((a, r) => a + E.RATES[r], 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, 'rates sum to ' + sum);
});

test('everyone starts owning the original six, with some coins and a ticket', () => {
  const s = fresh();
  assert.deepStrictEqual(E.ownedIds(s).sort(), Pips.STARTERS.slice().sort());
  assert.strictEqual(s.coins, E.STARTING.coins);
  assert.strictEqual(s.tickets, E.STARTING.tickets);
});

test('normalize repairs a damaged save and never takes the starters away', () => {
  const s = E.normalize({ coins: -40, tickets: 'lots', owned: [{ id: 'galaxy', count: 2 }, null, 7] }, Pips.STARTERS);
  assert.strictEqual(s.coins, 0);
  assert.strictEqual(s.tickets, 0);
  assert.ok(E.owns(s, 'galaxy'));
  for (const id of Pips.STARTERS) assert.ok(E.owns(s, id), id);
  assert.deepStrictEqual(E.normalize(null, Pips.STARTERS).owned.length, 6);
});

test('the rarity roll matches the published rates', () => {
  const rng = brain.seededRng(7);
  const counts = {};
  const N = 200000;
  for (let i = 0; i < N; i++) {
    const r = E.rollRarity(rng);
    counts[r] = (counts[r] || 0) + 1;
  }
  for (const r of E.RARITIES) {
    const got = counts[r] / N;
    assert.ok(Math.abs(got - E.RATES[r]) < 0.006, r + ': ' + got.toFixed(4) + ' vs ' + E.RATES[r]);
  }
});

test('a single pull spends a ticket first, then coins, and refuses when broke', () => {
  const rng = brain.seededRng(1);
  let s = fresh();
  let res = E.pull(s, 1, rng, Pips.TYPES, 1);
  assert.ok(res.ok);
  assert.strictEqual(res.paidWith, 'ticket');
  assert.strictEqual(res.state.tickets, 0);
  s = res.state;
  const before = s.coins;
  res = E.pull(s, 1, rng, Pips.TYPES, 2);
  assert.strictEqual(res.paidWith, 'coins');
  assert.strictEqual(res.state.coins, before - E.COSTS.single + res.results[0].refund);
  const broke = Object.assign({}, res.state, { coins: 10, tickets: 0 });
  const no = E.pull(broke, 1, rng, Pips.TYPES, 3);
  assert.strictEqual(no.ok, false);
  assert.strictEqual(no.state, broke, 'a refused pull leaves the state alone');
});

test('pull never changes the state it was given', () => {
  const s = fresh();
  const copy = JSON.stringify(s);
  E.pull(s, 10, brain.seededRng(3), Pips.TYPES, 1);
  E.spin(s, 10, brain.seededRng(3));
  assert.strictEqual(JSON.stringify(s), copy);
});

test('every ten-pull contains at least one rare or better', () => {
  const rng = brain.seededRng(11);
  let s = Object.assign(fresh(), { coins: 1e9 });
  for (let i = 0; i < 400; i++) {
    const res = E.pull(s, 10, rng, Pips.TYPES, i);
    assert.strictEqual(res.results.length, 10);
    assert.ok(res.results.some((r) => E.RARITIES.indexOf(r.rarity) >= 2), 'ten-pull ' + i + ' had no rare');
    s = res.state;
  }
});

test('pity: never more than 40 pulls without an epic, 100 without a legendary', () => {
  // an rng that would always roll common
  const unlucky = () => 0.0001;
  let s = Object.assign(fresh(), { coins: 1e9 });
  let sinceEpic = 0, sinceLegendary = 0, maxEpicGap = 0, maxLegGap = 0;
  for (let i = 0; i < 1000; i++) {
    const res = E.pull(s, 1, unlucky, Pips.TYPES, i);
    s = res.state;
    const r = res.results[0].rarity;
    sinceEpic++; sinceLegendary++;
    if (r === 'epic' || r === 'legendary') { maxEpicGap = Math.max(maxEpicGap, sinceEpic); sinceEpic = 0; }
    if (r === 'legendary') { maxLegGap = Math.max(maxLegGap, sinceLegendary); sinceLegendary = 0; }
  }
  assert.ok(maxEpicGap > 0 && maxEpicGap <= E.PITY.epic, 'epic gap ' + maxEpicGap);
  assert.ok(maxLegGap > 0 && maxLegGap <= E.PITY.legendary, 'legendary gap ' + maxLegGap);
});

test('a duplicate refunds coins by rarity and counts up', () => {
  // an rng that always gives the first common: cherry, which you own
  const s = Object.assign(fresh(), { tickets: 0 });
  const res = E.pull(s, 1, () => 0, Pips.TYPES, 5);
  const r = res.results[0];
  assert.strictEqual(r.id, 'cherry');
  assert.strictEqual(r.isNew, false);
  assert.strictEqual(r.refund, E.REFUND.common);
  assert.strictEqual(res.state.coins, s.coins - E.COSTS.single + E.REFUND.common);
  assert.strictEqual(res.state.owned.find((o) => o.id === 'cherry').count, 2);
});

test('a new Pip is added to the collection', () => {
  const rng = brain.seededRng(5);
  let s = Object.assign(fresh(), { coins: 1e9 });
  let seenNew = false;
  for (let i = 0; i < 20 && !seenNew; i++) {
    const res = E.pull(s, 1, rng, Pips.TYPES, 100 + i);
    if (res.results[0].isNew) {
      seenNew = true;
      assert.ok(E.owns(res.state, res.results[0].id));
      assert.strictEqual(res.state.lastNew, res.results[0].id);
    }
    s = res.state;
  }
  assert.ok(seenNew);
});

test('the whole collection can be finished', () => {
  const rng = brain.seededRng(2026);
  let s = Object.assign(fresh(), { coins: 1e9 });
  let pulls = 0;
  while (s.owned.length < 50 && pulls < 20000) {
    s = E.pull(s, 10, rng, Pips.TYPES, pulls).state;
    pulls += 10;
  }
  assert.strictEqual(s.owned.length, 50, 'still missing some after ' + pulls + ' pulls');
});

test('the slots pay back between 88% and 96% over every possible spin', () => {
  const r = E.slotReturn();
  assert.ok(r > 0.88 && r < 0.96, 'return is ' + r.toFixed(4));
});

test('a simulated evening at the slots agrees with the exact return', () => {
  const rng = brain.seededRng(99);
  let s = Object.assign(fresh(), { coins: 1e9 });
  let bet = 0, won = 0;
  for (let i = 0; i < 100000; i++) {
    const res = E.spin(s, 10, rng);
    bet += 10;
    won += res.payout;
    s = res.state;
  }
  const r = won / bet;
  assert.ok(Math.abs(r - E.slotReturn()) < 0.03, 'simulated ' + r.toFixed(3));
});

test('the paytable: three of a kind, the jackpot, capsules and cherries', () => {
  assert.deepStrictEqual(E.linePays(['pip', 'pip', 'pip']), { mult: 100, ticket: false, freePull: true, name: 'JACKPOT' });
  assert.strictEqual(E.linePays(['capsule', 'capsule', 'capsule']).ticket, true);
  assert.strictEqual(E.linePays(['grape', 'grape', 'grape']).mult, E.THREE.grape);
  assert.strictEqual(E.linePays(['lime', 'lime', 'star']).mult, 2);
  assert.strictEqual(E.linePays(['star', 'star', 'lime']).mult, 4);
  assert.strictEqual(E.linePays(['cherry', 'lime', 'grape']).mult, 1.5);
  assert.strictEqual(E.linePays(['lime', 'coin', 'coin']).mult, 2);
  assert.strictEqual(E.linePays(['lime', 'grape', 'lemon']).mult, 0);
});

test('a spin takes the bet, pays out, and refuses bad bets or an empty purse', () => {
  const s = fresh();
  const res = E.spin(s, 25, brain.seededRng(4));
  assert.ok(res.ok);
  assert.strictEqual(res.state.coins, s.coins - 25 + res.payout);
  assert.strictEqual(res.reels.length, 3);
  assert.strictEqual(E.spin(s, 7, Math.random).ok, false);
  assert.strictEqual(E.spin(Object.assign(fresh(), { coins: 5 }), 10, Math.random).ok, false);
});

test('passive coins accrue by the minute, pay in handfuls, and stop at the daily cap', () => {
  let s = fresh();
  let res = E.addActive(s, 4 * 60000, DAY);
  assert.strictEqual(res.paid, 0, 'not a handful yet');
  res = E.addActive(res.state, 60000, DAY);
  assert.strictEqual(res.paid, 5);
  s = res.state;
  let total = 5;
  for (let i = 0; i < 200; i++) {
    res = E.addActive(s, 5 * 60000, DAY);
    total += res.paid;
    s = res.state;
  }
  assert.strictEqual(total, E.PASSIVE.dailyCap);
  // ...and a new day starts the count again
  res = E.addActive(s, 5 * 60000, '2026-09-24');
  assert.strictEqual(res.paid, 5);
});

test('habits pay, with daily limits on water and breaks', () => {
  let s = fresh();
  let water = 0;
  for (let i = 0; i < 20; i++) {
    const res = E.habit(s, 'water', DAY);
    water += res.paid;
    s = res.state;
  }
  assert.strictEqual(water, E.HABITS.water.coins * E.HABITS.water.dailyMax);
  const pomo = E.habit(s, 'pomodoro', DAY);
  assert.strictEqual(pomo.paid, E.HABITS.pomodoro.coins);
  assert.strictEqual(E.habit(s, 'nonsense', DAY).paid, 0);
});

test('the daily hello pays once, and a streak grows it', () => {
  let res = E.hello(fresh(), YESTERDAY, '2026-09-21');
  assert.strictEqual(res.paid, E.HELLO.coins);
  assert.strictEqual(res.streak, 1);
  const again = E.hello(res.state, YESTERDAY, '2026-09-21');
  assert.strictEqual(again.paid, 0, 'only once a day');
  res = E.hello(res.state, DAY, YESTERDAY);
  assert.strictEqual(res.streak, 2);
  assert.strictEqual(res.paid, E.HELLO.coins + E.HELLO.streakStep);
  // missing a day starts over
  res = E.hello(res.state, '2026-09-26', '2026-09-25');
  assert.strictEqual(res.streak, 1);
});

test('game rewards: capped per game, full rate up to the daily limit, then a quarter', () => {
  assert.strictEqual(E.gameCoins('catch', 1e9), E.GAME_MAX);
  assert.strictEqual(E.gameCoins('nope', 500), 0);
  let s = fresh();
  let paid = 0;
  for (let i = 0; i < 10; i++) {
    const res = E.gameEnd(s, 'catch', 1000, DAY);
    paid += res.paid;
    s = res.state;
  }
  const full = E.GAMES_DAILY_FULL;
  const worth = 10 * E.gameCoins('catch', 1000);
  assert.ok(paid >= full && paid < full + (worth - full) * 0.3, 'paid ' + paid);
});

test('a high score is remembered', () => {
  let res = E.gameEnd(fresh(), 'hop', 300, DAY);
  assert.strictEqual(res.highScore, true);
  res = E.gameEnd(res.state, 'hop', 200, DAY);
  assert.strictEqual(res.highScore, false);
  assert.strictEqual(res.state.highScores.hop, 300);
});
