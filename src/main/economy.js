/*
 * economy.js - coins, the collection, the gacha machine and the slots.
 *
 * Pure: no Electron, no timers, no I/O. The clock and the randomness come in
 * as arguments, and every function returns a NEW state rather than changing
 * the one it was given, so main can persist exactly what came back and the
 * tests can replay anything.
 *
 * Main owns the balance and does every roll. The arcade window only ever
 * animates results it was handed, so nothing it does can mint coins.
 *
 * There is no real money anywhere in Pip. Coins cannot be bought; they are
 * earned by using Pip, keeping up your habits and playing the minigames.
 * The odds and the paytable are shown in the arcade, and every roll is
 * straightforwardly random - no rigged near-misses.
 *
 * The numbers below are tuned so that collecting all fifty takes a few
 * weeks of ordinary use: roughly 2-3 gacha pulls' worth of coins a day.
 */

'use strict';

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** Chance of each rarity on a normal pull. Sums to 1. */
const RATES = { common: 0.55, uncommon: 0.28, rare: 0.12, epic: 0.042, legendary: 0.008 };

const COSTS = { single: 150, ten: 1350 };

/**
 * Pity: a ten-pull always contains a rare or better, and a long unlucky run
 * is capped - an epic or better at least every 40 pulls, a legendary at
 * least every 100.
 */
const PITY = { tenPullMin: 'rare', epic: 40, legendary: 100 };

/** Coins back for a duplicate. */
const REFUND = { common: 15, uncommon: 35, rare: 90, epic: 250, legendary: 800 };

/** Earned just by having Pip about while you work. */
const PASSIVE = { perMinute: 1, payEvery: 5, dailyCap: 360 };

/** Earned by keeping up your habits. */
const HABITS = {
  pomodoro: { coins: 30, dailyMax: Infinity },
  water: { coins: 5, dailyMax: 8 },
  break: { coins: 5, dailyMax: 6 }
};

/** The first hello of the day, plus a little more for every day in a row. */
const HELLO = { coins: 25, streakStep: 5, streakMax: 50 };

/** Minigames pay in full up to this much a day, then at a quarter rate. */
const GAMES_DAILY_FULL = 400;
const GAMES_OVERFLOW_RATE = 0.25;
/** No single game can pay more than this, however it went. */
const GAME_MAX = 150;
const GAME_NAMES = ['catch', 'hop', 'match'];

const STARTING = { coins: 300, tickets: 1 };

/* ------------------------------------------------------------------ *
 * The slot machine
 *
 * Three identical reels of 32 stops. The result is simply three random
 * stops; the paytable decides what that is worth. Every symbol is one of
 * Pip's flavours or treats. Over every possible spin the machine pays back
 * about 93% of what goes in (slotReturn() works it out exactly), so it is a
 * gentle way to spend coins, not a way to make them.
 * ------------------------------------------------------------------ */

const REEL = [];
(function buildReel() {
  const counts = { cherry: 6, lemon: 6, grape: 5, lime: 4, blueberry: 4, coin: 3, star: 2, capsule: 1, pip: 1 };
  // spread evenly rather than in blocks, so a spinning reel looks lively
  const order = ['cherry', 'lemon', 'grape', 'lime', 'blueberry', 'coin', 'star', 'capsule', 'pip'];
  const left = Object.assign({}, counts);
  while (REEL.length < 32) {
    for (const s of order) {
      if (left[s] > 0) { REEL.push(s); left[s]--; }
    }
  }
})();

const SYMBOLS = ['cherry', 'lemon', 'grape', 'lime', 'blueberry', 'coin', 'star', 'capsule', 'pip'];
const FRUIT = { cherry: 1, lemon: 1, grape: 1, lime: 1, blueberry: 1 };

/** Three of a kind pays this many times the bet. */
const THREE = { pip: 100, star: 40, capsule: 25, coin: 20, blueberry: 14, lime: 12, grape: 9, lemon: 7, cherry: 6 };

const BETS = [10, 25, 50];

/**
 * What a line of three symbols pays.
 * @returns {{mult:number, ticket:boolean, freePull:boolean, name:string}}
 */
function linePays(reels) {
  const [a, b, c] = reels;
  if (a === b && b === c) {
    return {
      mult: THREE[a],
      ticket: a === 'capsule',
      freePull: a === 'pip',
      name: a === 'pip' ? 'JACKPOT' : 'THREE ' + a.toUpperCase()
    };
  }
  let mult = 0;
  let name = '';
  // two of a kind on the first two reels
  if (a === b) { mult = FRUIT[a] ? 2 : 4; name = 'PAIR'; }
  // every coin on the line pays its bet back
  const coins = reels.filter((s) => s === 'coin').length;
  if (coins) { mult += coins; name = name ? name + ' + COINS' : (coins > 1 ? 'COINS' : 'COIN'); }
  // a cherry in the first window always pays something
  if (!mult && a === 'cherry') { mult = 1.5; name = 'CHERRY'; }
  return { mult: mult, ticket: false, freePull: false, name: name };
}

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

/**
 * A fresh economy. Everyone owns the six original flavours from the start -
 * they were never locked, and they are not going to start being now.
 */
function createState(starters) {
  return {
    version: 1,
    coins: STARTING.coins,
    tickets: STARTING.tickets,
    owned: (starters || []).map((id) => ({ id: id, count: 1, firstAt: 0 })),
    pity: { sinceEpic: 0, sinceLegendary: 0 },
    day: '',
    earned: { passive: 0, water: 0, breaks: 0, games: 0 },
    helloDay: '',
    streak: { last: '', days: 0 },
    activeMs: 0,
    stats: { pulls: 0, spins: 0, spent: 0, won: 0, games: 0 },
    highScores: { catch: 0, hop: 0, match: 0 },
    lastNew: ''
  };
}

function clone(s) {
  return JSON.parse(JSON.stringify(s));
}

/** Make any stored state safe to use: missing parts filled, bad numbers fixed. */
function normalize(state, starters) {
  const base = createState(starters);
  const s = state && typeof state === 'object' ? clone(state) : {};
  const out = Object.assign(base, s);
  out.coins = Math.max(0, Math.floor(Number(out.coins) || 0));
  out.tickets = Math.max(0, Math.floor(Number(out.tickets) || 0));
  out.owned = Array.isArray(out.owned) ? out.owned.filter((o) => o && typeof o.id === 'string') : [];
  for (const id of starters || []) {
    if (!out.owned.some((o) => o.id === id)) out.owned.push({ id: id, count: 1, firstAt: 0 });
  }
  out.pity = Object.assign({ sinceEpic: 0, sinceLegendary: 0 }, out.pity);
  out.earned = Object.assign({ passive: 0, water: 0, breaks: 0, games: 0 }, out.earned);
  out.streak = Object.assign({ last: '', days: 0 }, out.streak);
  out.stats = Object.assign({ pulls: 0, spins: 0, spent: 0, won: 0, games: 0 }, out.stats);
  out.highScores = Object.assign({ catch: 0, hop: 0, match: 0 }, out.highScores);
  return out;
}

/** New local day: the daily counters start again. */
function rollDay(state, dayKey) {
  if (state.day === dayKey) return state;
  const s = clone(state);
  s.day = dayKey;
  s.earned = { passive: 0, water: 0, breaks: 0, games: 0 };
  return s;
}

function owns(state, id) {
  return state.owned.some((o) => o.id === id);
}

function ownedIds(state) {
  return state.owned.map((o) => o.id);
}

/* ------------------------------------------------------------------ *
 * Earning
 * ------------------------------------------------------------------ */

/**
 * Time you were active with Pip about. Coins accrue a minute at a time and
 * are paid in handfuls every few minutes, up to a daily cap.
 * @returns {{state, paid:number}}
 */
function addActive(state, ms, dayKey) {
  let s = rollDay(state, dayKey);
  s = clone(s);
  s.activeMs += Math.max(0, ms || 0);
  const minutes = Math.floor(s.activeMs / 60000);
  if (minutes < PASSIVE.payEvery) return { state: s, paid: 0 };
  s.activeMs -= minutes * 60000;
  const room = Math.max(0, PASSIVE.dailyCap - s.earned.passive);
  const paid = Math.min(room, minutes * PASSIVE.perMinute);
  s.earned.passive += paid;
  s.coins += paid;
  return { state: s, paid: paid };
}

/**
 * A habit kept: a Pomodoro finished, water drunk, a proper break taken.
 * @returns {{state, paid:number}}
 */
function habit(state, kind, dayKey) {
  const rule = HABITS[kind];
  if (!rule) return { state: state, paid: 0 };
  const s = clone(rollDay(state, dayKey));
  const counter = kind === 'water' ? 'water' : kind === 'break' ? 'breaks' : null;
  if (counter && s.earned[counter] >= rule.dailyMax) return { state: s, paid: 0 };
  if (counter) s.earned[counter] += 1;
  s.coins += rule.coins;
  return { state: s, paid: rule.coins };
}

/**
 * The first hello of the day, with a streak bonus for coming back day
 * after day. `yesterdayKey` is the local date before `dayKey`.
 * @returns {{state, paid:number, streak:number}}
 */
function hello(state, dayKey, yesterdayKey) {
  if (state.helloDay === dayKey) return { state: state, paid: 0, streak: state.streak.days };
  const s = clone(rollDay(state, dayKey));
  s.helloDay = dayKey;
  s.streak.days = s.streak.last === yesterdayKey ? s.streak.days + 1 : 1;
  s.streak.last = dayKey;
  const paid = HELLO.coins + Math.min(HELLO.streakMax, (s.streak.days - 1) * HELLO.streakStep);
  s.coins += paid;
  return { state: s, paid: paid, streak: s.streak.days };
}

/** How many coins a finished game is worth, before the daily limit. */
function gameCoins(game, score) {
  const n = Math.max(0, Math.floor(Number(score) || 0));
  switch (game) {
    case 'catch': return Math.min(GAME_MAX, Math.floor(n / 10));
    case 'hop': return Math.min(GAME_MAX, Math.floor(n / 12));
    case 'match': return Math.min(GAME_MAX, Math.floor(n / 10));
    default: return 0;
  }
}

/**
 * A game finished with `score`.
 * @returns {{state, paid:number, highScore:boolean}}
 */
function gameEnd(state, game, score, dayKey) {
  if (GAME_NAMES.indexOf(game) === -1) return { state: state, paid: 0, highScore: false };
  const s = clone(rollDay(state, dayKey));
  const worth = gameCoins(game, score);
  const full = Math.max(0, Math.min(worth, GAMES_DAILY_FULL - s.earned.games));
  const paid = full + Math.floor((worth - full) * GAMES_OVERFLOW_RATE);
  s.earned.games += paid;
  s.coins += paid;
  s.stats.games += 1;
  const n = Math.max(0, Math.floor(Number(score) || 0));
  const highScore = n > (s.highScores[game] || 0);
  if (highScore) s.highScores[game] = n;
  return { state: s, paid: paid, highScore: highScore };
}

/* ------------------------------------------------------------------ *
 * The gacha machine
 * ------------------------------------------------------------------ */

function rank(rarity) {
  return RARITIES.indexOf(rarity);
}

function rollRarity(rng) {
  let x = rng();
  for (const r of RARITIES) {
    if (x < RATES[r]) return r;
    x -= RATES[r];
  }
  return 'common';
}

/**
 * One capsule: a rarity (with pity), then a type of that rarity, chosen
 * evenly. Mutates `s`, which is always a private copy.
 */
function pullOne(s, rng, types, now, minRarity) {
  s.pity.sinceEpic += 1;
  s.pity.sinceLegendary += 1;
  let rarity = rollRarity(rng);
  if (s.pity.sinceLegendary >= PITY.legendary) rarity = 'legendary';
  else if (s.pity.sinceEpic >= PITY.epic && rank(rarity) < rank('epic')) rarity = 'epic';
  if (minRarity && rank(rarity) < rank(minRarity)) rarity = minRarity;
  if (rank(rarity) >= rank('epic')) s.pity.sinceEpic = 0;
  if (rarity === 'legendary') s.pity.sinceLegendary = 0;

  const pool = types.filter((t) => t.rarity === rarity);
  const type = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  const have = s.owned.find((o) => o.id === type.id);
  let refund = 0;
  if (have) {
    have.count += 1;
    refund = REFUND[rarity];
    s.coins += refund;
  } else {
    s.owned.push({ id: type.id, count: 1, firstAt: now });
    s.lastNew = type.id;
  }
  s.stats.pulls += 1;
  return { id: type.id, rarity: rarity, isNew: !have, refund: refund };
}

/**
 * Pull the machine. A single pull spends a ticket if you have one, coins
 * otherwise; a ten-pull always spends coins, at a discount, and always
 * contains at least one rare or better.
 *
 * @param {object} state
 * @param {number} count  1 or 10
 * @param {function} rng  () => [0,1)
 * @param {Array} types   the catalogue (pips.js TYPES)
 * @param {number} now
 * @param {{minRarity?:string}} [opts]  a free pull won on the slots
 * @returns {{ok:boolean, error?:string, state, results:Array, paidWith?:string}}
 */
function pull(state, count, rng, types, now, opts) {
  opts = opts || {};
  const s = clone(state);
  let paidWith;
  if (opts.free) {
    paidWith = 'free';
  } else if (count === 10) {
    if (s.coins < COSTS.ten) return { ok: false, error: 'not enough coins', state: state, results: [] };
    s.coins -= COSTS.ten;
    s.stats.spent += COSTS.ten;
    paidWith = 'coins';
  } else if (count === 1) {
    if (s.tickets > 0) { s.tickets -= 1; paidWith = 'ticket'; }
    else if (s.coins >= COSTS.single) { s.coins -= COSTS.single; s.stats.spent += COSTS.single; paidWith = 'coins'; }
    else return { ok: false, error: 'not enough coins', state: state, results: [] };
  } else {
    return { ok: false, error: 'pull 1 or 10', state: state, results: [] };
  }

  const results = [];
  for (let i = 0; i < count; i++) {
    const last = i === count - 1;
    let min = opts.minRarity || null;
    // the tenth capsule of a ten-pull makes sure of a rare if none came
    if (count === 10 && last && !results.some((r) => rank(r.rarity) >= rank(PITY.tenPullMin))) min = PITY.tenPullMin;
    results.push(pullOne(s, rng, types, now, min));
  }
  return { ok: true, state: s, results: results, paidWith: paidWith };
}

/* ------------------------------------------------------------------ *
 * The slots
 * ------------------------------------------------------------------ */

/**
 * One spin.
 * @returns {{ok:boolean, error?:string, state, stops:number[], reels:string[],
 *            payout:number, ticket:boolean, freePull:boolean, name:string}}
 */
function spin(state, bet, rng) {
  if (BETS.indexOf(bet) === -1) return { ok: false, error: 'bad bet', state: state };
  if (state.coins < bet) return { ok: false, error: 'not enough coins', state: state };
  const s = clone(state);
  s.coins -= bet;
  s.stats.spins += 1;
  s.stats.spent += bet;
  const stops = [0, 1, 2].map(() => Math.floor(rng() * REEL.length) % REEL.length);
  const reels = stops.map((i) => REEL[i]);
  const pay = linePays(reels);
  const payout = Math.round(pay.mult * bet);
  s.coins += payout;
  s.stats.won += payout;
  if (pay.ticket) s.tickets += 1;
  return {
    ok: true, state: s, stops: stops, reels: reels, payout: payout,
    ticket: pay.ticket, freePull: pay.freePull, name: pay.name
  };
}

/** The exact long-run coin return of the slots, over every possible spin. */
function slotReturn() {
  let total = 0;
  const n = REEL.length;
  for (const a of REEL) for (const b of REEL) for (const c of REEL) total += linePays([a, b, c]).mult;
  return total / (n * n * n);
}

/* ------------------------------------------------------------------ *
 * The shareable summary the arcade window is given
 * ------------------------------------------------------------------ */

function publicState(state, extra) {
  return Object.assign({
    coins: state.coins,
    tickets: state.tickets,
    owned: state.owned.map((o) => ({ id: o.id, count: o.count })),
    pity: {
      epicIn: Math.max(0, PITY.epic - state.pity.sinceEpic),
      legendaryIn: Math.max(0, PITY.legendary - state.pity.sinceLegendary)
    },
    earned: state.earned,
    caps: { passive: PASSIVE.dailyCap, water: HABITS.water.dailyMax, breaks: HABITS.break.dailyMax, games: GAMES_DAILY_FULL },
    streak: state.streak.days,
    highScores: state.highScores,
    stats: state.stats
  }, extra || {});
}

/** The fixed rules, for the arcade's "odds" and "how to earn" pages. */
const RULES = {
  RARITIES, RATES, COSTS, PITY, REFUND, PASSIVE, HABITS, HELLO,
  GAMES_DAILY_FULL, GAMES_OVERFLOW_RATE, GAME_MAX, BETS, THREE, SYMBOLS, REEL
};

module.exports = {
  RARITIES, RATES, COSTS, PITY, REFUND, PASSIVE, HABITS, HELLO, STARTING,
  GAMES_DAILY_FULL, GAMES_OVERFLOW_RATE, GAME_MAX, GAME_NAMES,
  REEL, SYMBOLS, THREE, BETS, RULES,
  createState, normalize, rollDay, owns, ownedIds,
  addActive, habit, hello, gameCoins, gameEnd,
  rollRarity, pull, spin, linePays, slotReturn, publicState
};
