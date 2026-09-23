/*
 * pips.test.js - the catalogue of fifty Pip types.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const Pips = require('../src/renderer/pips.js');
const Palettes = require('../src/renderer/palettes.js');
const Traits = require('../src/renderer/traits.js');
const Effects = require('../src/renderer/effects.js');

const HEX = /^#[0-9a-f]{6}$/;

test('there are exactly fifty, with unique ids', () => {
  assert.strictEqual(Pips.TYPES.length, 50);
  assert.strictEqual(new Set(Pips.IDS).size, 50);
  for (const id of Pips.IDS) assert.match(id, /^[a-z]+$/, 'id ' + id + ' should be plain lowercase');
});

test('the rarities are 18 / 14 / 10 / 6 / 2', () => {
  const want = { common: 18, uncommon: 14, rare: 10, epic: 6, legendary: 2 };
  for (const r of Pips.RARITIES) assert.strictEqual(Pips.byRarity(r).length, want[r], r);
  for (const type of Pips.TYPES) assert.ok(Pips.RARITIES.indexOf(type.rarity) !== -1, type.id);
});

test('every palette is complete and valid', () => {
  for (const type of Pips.TYPES) {
    const pal = Palettes.resolve(type.palette);
    for (const k of Palettes.ALL_KEYS) assert.match(pal[k], HEX, type.id + '.' + k);
  }
});

test('every pattern, trait and effect exists', () => {
  for (const type of Pips.TYPES) {
    if (type.pattern) assert.ok(Traits.PATTERNS[type.pattern], type.id + ': no pattern ' + type.pattern);
    if (type.trait) assert.ok(Traits.TRAITS[type.trait], type.id + ': no trait ' + type.trait);
    if (type.effect) assert.ok(Effects.NAMES.indexOf(type.effect) !== -1, type.id + ': no effect ' + type.effect);
  }
});

test('rare and up always have a special effect; commons and uncommons never do', () => {
  for (const type of Pips.TYPES) {
    const special = ['rare', 'epic', 'legendary'].indexOf(type.rarity) !== -1;
    assert.strictEqual(!!type.effect, special, type.id + ' (' + type.rarity + ')');
  }
});

test('every temperament is known and every one is used', () => {
  const used = new Set();
  for (const type of Pips.TYPES) {
    assert.ok(Pips.TEMPERAMENTS.indexOf(type.temperament) !== -1, type.id);
    used.add(type.temperament);
  }
  assert.strictEqual(used.size, Pips.TEMPERAMENTS.length);
});

test('the six original flavours are the starters, and all common', () => {
  assert.deepStrictEqual(Pips.STARTERS, ['cherry', 'lime', 'blueberry', 'lemon', 'grape', 'licorice']);
  for (const id of Pips.STARTERS) assert.strictEqual(Pips.BY_ID[id].rarity, 'common');
});

test('every effect is used by some Pip', () => {
  const used = new Set(Pips.TYPES.map((x) => x.effect).filter(Boolean));
  for (const name of Effects.NAMES) assert.ok(used.has(name), 'effect ' + name + ' belongs to no Pip');
});

test('get falls back to cherry for an unknown id', () => {
  assert.strictEqual(Pips.get('nope').id, 'cherry');
  assert.strictEqual(Pips.get('galaxy').id, 'galaxy');
});

test('every Pip has a name and a one-line blurb', () => {
  for (const type of Pips.TYPES) {
    assert.ok(type.name && type.name.length <= 20, type.id + ' name');
    assert.ok(type.blurb && type.blurb.length <= 110 && /[.!?]$/.test(type.blurb), type.id + ' blurb');
  }
});
