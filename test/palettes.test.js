/*
 * palettes.test.js - the palette contract from ARCHITECTURE.md section 3.
 *
 * A Pip type swaps the body colours and nothing else - apart from the face
 * ink a very dark type may darken so its eyes still read - so outlines,
 * blush and props look the same on every Pip.
 *
 *   node --test test/palettes.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const Palettes = require('../src/renderer/palettes.js');

const HEX = /^#[0-9a-f]{6}$/;

test('the documented shape is there', () => {
  assert.deepStrictEqual(Palettes.BODY_KEYS, ['B', 'L', 'D', 'd', 'H', 'h', 'F', 'f', 'o', 'X', 'x', 'Y', 'Z']);
  assert.deepStrictEqual(Palettes.STRUCTURAL_KEYS,
    ['O', 'E', 'e', 'W', 'K', 'k', 'M', 'T', 'U', 'A', 'a', 'P', 'p', 'S', 'G', 'R', 'r', 'Q', 'q', 'N', 'n']);
  assert.deepStrictEqual(Palettes.FACE_KEYS, ['E', 'e', 'M']);
  assert.strictEqual(Palettes.TRANSPARENT, '.');
  assert.ok(Palettes.FLAVOR_NAMES.indexOf(Palettes.DEFAULT_FLAVOR) !== -1);
  assert.strictEqual(Palettes.DEFAULT_FLAVOR, 'cherry');
});

test('no key is both structural and body', () => {
  for (const k of Palettes.BODY_KEYS) {
    assert.ok(Palettes.STRUCTURAL_KEYS.indexOf(k) === -1, k + ' is in both lists');
  }
  assert.strictEqual(new Set(Palettes.ALL_KEYS).size, Palettes.ALL_KEYS.length);
});

test('derive fills in every body key from one colour', () => {
  const body = Palettes.derive({ B: '#e2415a' });
  for (const k of Palettes.BODY_KEYS) assert.match(body[k], HEX, 'derived ' + k);
  // shadows are darker than the body, highlights lighter
  const lum = (hex) => Palettes.hexToRgb(hex).reduce((a, b) => a + b, 0);
  assert.ok(lum(body.D) < lum(body.B) && lum(body.d) < lum(body.D));
  assert.ok(lum(body.L) > lum(body.B));
});

test('every flavour defines all body keys and only allowed overrides', () => {
  const allowed = Palettes.BODY_KEYS.concat(Palettes.FACE_KEYS);
  for (const name of Palettes.FLAVOR_NAMES) {
    const flavor = Palettes.FLAVORS[name];
    for (const key of Palettes.BODY_KEYS) assert.match(flavor[key], HEX, name + '.' + key);
    for (const key of Object.keys(flavor)) {
      assert.ok(allowed.indexOf(key) !== -1, name + ' overrides ' + key + ', which is shared by every flavour');
    }
  }
});

test('every base colour is a valid #rrggbb', () => {
  for (const key of Palettes.STRUCTURAL_KEYS) {
    assert.match(Palettes.BASE[key], HEX, 'base colour ' + key + ' is not #rrggbb');
  }
});

test('resolve returns every key for every flavour', () => {
  const expected = Palettes.ALL_KEYS.slice().sort();
  for (const name of Palettes.FLAVOR_NAMES) {
    const resolved = Palettes.resolve(name);
    assert.deepStrictEqual(Object.keys(resolved).sort(), expected, name);
    for (const key of Object.keys(resolved)) assert.match(resolved[key], HEX, name + '.' + key);
    // the structural half is shared, face ink aside
    for (const key of Palettes.STRUCTURAL_KEYS) {
      if (Palettes.FACE_KEYS.indexOf(key) !== -1) continue;
      assert.strictEqual(resolved[key], Palettes.BASE[key], name + ' changed structural key ' + key);
    }
  }
});

test('resolve accepts a body palette object and a Pip type id', () => {
  const body = Palettes.derive({ B: '#123456' });
  assert.strictEqual(Palettes.resolve(body).B, '#123456');
  assert.strictEqual(Palettes.resolve('lime').B, Palettes.FLAVORS.lime.B);
});

test('resolve falls back to cherry for anything unknown instead of throwing', () => {
  const cherry = Palettes.resolve('cherry');
  for (const bad of ['nope', '', 'CHERRY', null, undefined, 0, {}]) {
    let resolved;
    assert.doesNotThrow(() => { resolved = Palettes.resolve(bad); }, 'threw on ' + String(bad));
    assert.deepStrictEqual(resolved, cherry, 'did not fall back to cherry for ' + String(bad));
  }
});

test('isValidKey accepts every palette key and transparent, and nothing else', () => {
  assert.ok(Palettes.isValidKey(Palettes.TRANSPARENT));
  for (const key of Palettes.ALL_KEYS) assert.ok(Palettes.isValidKey(key), key + ' should be valid');
  for (const bad of ['V', 'z', ' ', '', '#', 'b', 'v', '1']) {
    assert.ok(!Palettes.isValidKey(bad), '"' + bad + '" should not be valid');
  }
});
