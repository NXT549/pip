/*
 * palettes.test.js - the palette contract from ARCHITECTURE.md section 3.
 *
 * The rule a flavour has to keep is that it swaps the body colours and
 * nothing else, so Pip's outline, eyes, blush and mouth read identically in
 * every flavour. The 12-entry cap is the other half of it.
 *
 *   node --test test/palettes.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const Palettes = require('../src/renderer/palettes.js');

const HEX = /^#[0-9a-f]{6}$/;

test('the documented shape is there', () => {
  assert.deepStrictEqual(Palettes.BODY_KEYS, ['B', 'D', 'L', 'F', 'H']);
  assert.deepStrictEqual(Palettes.STRUCTURAL_KEYS, ['O', 'E', 'W', 'K', 'M', 'A']);
  assert.strictEqual(Palettes.TRANSPARENT, '.');
  assert.ok(Palettes.FLAVOR_NAMES.length > 0);
  assert.ok(
    Palettes.FLAVOR_NAMES.indexOf(Palettes.DEFAULT_FLAVOR) !== -1,
    'the default flavour is not in the flavour list'
  );
  assert.strictEqual(Palettes.DEFAULT_FLAVOR, 'cherry');
});

test('every flavour defines all of BODY_KEYS', () => {
  for (const name of Palettes.FLAVOR_NAMES) {
    const flavor = Palettes.FLAVORS[name];
    assert.ok(flavor, name + ' is listed but not defined');
    for (const key of Palettes.BODY_KEYS) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(flavor, key),
        name + ' is missing body key ' + key
      );
    }
  }
});

test('no flavour defines a structural key', () => {
  for (const name of Palettes.FLAVOR_NAMES) {
    const flavor = Palettes.FLAVORS[name];
    for (const key of Palettes.STRUCTURAL_KEYS) {
      assert.ok(
        !Object.prototype.hasOwnProperty.call(flavor, key),
        name + ' overrides structural key ' + key + ', which is shared by every flavour'
      );
    }
    assert.deepStrictEqual(
      Object.keys(flavor).slice().sort(),
      Palettes.BODY_KEYS.slice().sort(),
      name + ' defines keys outside BODY_KEYS'
    );
  }
});

test('every colour is a valid #rrggbb', () => {
  for (const key of Palettes.STRUCTURAL_KEYS) {
    assert.match(Palettes.BASE[key], HEX, 'base colour ' + key + ' is not #rrggbb');
  }
  for (const name of Palettes.FLAVOR_NAMES) {
    for (const key of Palettes.BODY_KEYS) {
      assert.match(
        Palettes.FLAVORS[name][key], HEX,
        name + '.' + key + ' is not #rrggbb'
      );
    }
  }
});

test('resolve returns all 11 keys for every flavour', () => {
  const expected = Palettes.STRUCTURAL_KEYS.concat(Palettes.BODY_KEYS).sort();
  assert.strictEqual(expected.length, 11);
  for (const name of Palettes.FLAVOR_NAMES) {
    const resolved = Palettes.resolve(name);
    assert.deepStrictEqual(Object.keys(resolved).sort(), expected, name);
    for (const key of Object.keys(resolved)) {
      assert.match(resolved[key], HEX, name + '.' + key);
    }
    // the structural half must come out identical every time
    for (const key of Palettes.STRUCTURAL_KEYS) {
      assert.strictEqual(resolved[key], Palettes.BASE[key], name + ' changed structural key ' + key);
    }
    for (const key of Palettes.BODY_KEYS) {
      assert.strictEqual(resolved[key], Palettes.FLAVORS[name][key], name + ' body key ' + key);
    }
  }
});

test('the whole palette including transparent fits in 12 entries', () => {
  const total = Palettes.STRUCTURAL_KEYS.length + Palettes.BODY_KEYS.length + 1;
  assert.ok(total <= 12, 'palette has ' + total + ' entries, the cap is 12');
  assert.strictEqual(Palettes.ALL_KEYS.length, 11);
});

test('resolve falls back to cherry for an unknown flavour instead of throwing', () => {
  const cherry = Palettes.resolve('cherry');
  for (const bad of ['nope', '', 'CHERRY', null, undefined, 0, {}]) {
    let resolved;
    assert.doesNotThrow(() => { resolved = Palettes.resolve(bad); }, 'threw on ' + String(bad));
    assert.deepStrictEqual(resolved, cherry, 'did not fall back to cherry for ' + String(bad));
  }
});

test('isValidKey accepts every palette key and transparent, and nothing else', () => {
  assert.ok(Palettes.isValidKey(Palettes.TRANSPARENT));
  for (const key of Palettes.ALL_KEYS) {
    assert.ok(Palettes.isValidKey(key), key + ' should be valid');
  }
  for (const bad of ['x', 'Z', ' ', '', '#', 'b', 'o', '1']) {
    assert.ok(!Palettes.isValidKey(bad), '"' + bad + '" should not be valid');
  }
});
