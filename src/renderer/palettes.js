/*
 * palettes.js - the one and only place colour keys are defined.
 *
 * Pip's sprites are character grids; every character is a palette key.
 *
 * Shared keys - identical for every Pip, so faces and props always read the
 * same whichever Pip you have:
 *
 *   .  transparent
 *   O  outline           the dark line around everything
 *   E  eye               dark eye
 *   e  eye reflection    the soft glow in the bottom of the eye
 *   W  white             eye shine, highlights on props
 *   K  blush             cheek marks
 *   k  blush light       the shine on the cheek
 *   M  mouth             mouth line
 *   T  mouth inside      an open mouth
 *   U  tongue            tongues, heart eyes
 *   A  prop              cups, books, nightcaps, snacks...
 *   a  prop shade
 *   P  prop 2            water, screens, second prop colour
 *   p  prop 2 shade
 *   S  paper             paper, steam, foam
 *   G  metal             grey metal, laptop body, keys
 *   R  red               popcorn stripes, headbands, berets
 *   r  red shade
 *   Q  yellow            hard hats, pencils, coins
 *   q  yellow shade
 *   N  screen            laptop screens, gamepads, headphones
 *   n  glow              the light off a screen
 *
 * Body keys - each Pip type overrides these, so a type is a recolour and a
 * decoration on the SAME frames:
 *
 *   B  body              the main jellybean colour
 *   L  body light        the lit upper body
 *   D  body dark         the underside
 *   d  body deep         deepest shadow, belly line
 *   H  gloss             the signature shine streak
 *   h  soft shine        the translucent jelly glow inside the lower edge
 *   F  far leg           the two far-side legs
 *   f  far leg dark
 *   o  tinted outline    the outline where the light hits it
 *   X  pattern           stripes, speckles, swirls
 *   x  pattern shade     the pattern where it falls into shadow
 *   Y  trait             stems, leaves, crowns, drips
 *   Z  trait shade
 */

'use strict';

/** Keys every Pip type defines (derived from one base colour if omitted). */
const BODY_KEYS = ['B', 'L', 'D', 'd', 'H', 'h', 'F', 'f', 'o', 'X', 'x', 'Y', 'Z'];

/** Keys shared by every Pip and never overridden. */
const STRUCTURAL_KEYS = ['O', 'E', 'e', 'W', 'K', 'k', 'M', 'T', 'U', 'A', 'a', 'P', 'p', 'S', 'G',
  'R', 'r', 'Q', 'q', 'N', 'n'];

/**
 * Face ink a very dark type may override, so its eyes still read against
 * its body. Everything else structural is shared by every Pip.
 */
const FACE_KEYS = ['E', 'e', 'M'];

/** Every key a resolved palette contains, excluding transparent. */
const ALL_KEYS = STRUCTURAL_KEYS.concat(BODY_KEYS);

/** The transparent character. Never drawn. */
const TRANSPARENT = '.';

/** Shared, non-body colours. */
const BASE = {
  O: '#2a1a2d',
  E: '#1f1728',
  e: '#4b3b6e',
  W: '#ffffff',
  K: '#ff8db5',
  k: '#ffc4da',
  M: '#3b2334',
  T: '#7c2342',
  U: '#ff6f91',
  A: '#ffe3a8',
  a: '#d9a45a',
  P: '#6cc4f5',
  p: '#3a82c4',
  S: '#f6f1e7',
  G: '#9aa3b5',
  R: '#e8483c',
  r: '#a8282e',
  Q: '#ffd23f',
  q: '#d9960f',
  N: '#3b3452',
  n: '#8ff0cf'
};

/* ------------------------------------------------------------------ *
 * Colour maths
 *
 * A Pip type only has to name its body colour. The shades are derived with
 * hue-shifted ramps - shadows drift toward violet and highlights toward warm
 * yellow, which is what keeps pixel art from looking like a flat tint - so
 * fifty types stay consistent without fifty hand-built ramps.
 * ------------------------------------------------------------------ */

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(rgb) {
  return '#' + rgb.map((v) => {
    const n = Math.max(0, Math.min(255, Math.round(v)));
    return (n < 16 ? '0' : '') + n.toString(16);
  }).join('');
}

function rgbToHsl(rgb) {
  const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

function hslToRgb(hsl) {
  const h = ((hsl[0] % 360) + 360) % 360 / 360;
  const s = Math.max(0, Math.min(1, hsl[1]));
  const l = Math.max(0, Math.min(1, hsl[2]));
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** Move hue `h` toward `target` by at most `by` degrees, the short way round. */
function hueToward(h, target, by) {
  let diff = ((target - h + 540) % 360) - 180;
  if (Math.abs(diff) < by) return target;
  return h + Math.sign(diff) * by;
}

/**
 * Shift a colour. dl is lightness (-1..1), ds saturation, and the hue moves
 * `hueBy` degrees toward `hueTo`.
 */
function shift(hex, dl, ds, hueTo, hueBy) {
  const hsl = rgbToHsl(hexToRgb(hex));
  // Greys have no meaningful hue to shift.
  const h = hsl[1] < 0.05 ? hsl[0] : hueToward(hsl[0], hueTo, hueBy || 0);
  return rgbToHex(hslToRgb([h, hsl[1] + ds, hsl[2] + dl]));
}

/** Blend two hex colours; t = 0 gives a, t = 1 gives b. */
function mix(a, b, t) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t));
}

/**
 * The full set of body keys from one base colour plus any overrides.
 * @param {object} spec  { B:'#rrggbb', ...any BODY_KEYS to force }
 */
function derive(spec) {
  const B = spec.B;
  const out = {
    B: B,
    L: shift(B, 0.11, -0.02, 55, 10),
    D: shift(B, -0.13, 0.04, 275, 12),
    d: shift(B, -0.24, 0.02, 275, 20),
    H: '#ffffff',
    h: shift(B, 0.19, 0.08, 40, 6),
    F: shift(B, -0.17, -0.06, 275, 14),
    f: shift(B, -0.28, -0.06, 275, 22),
    o: shift(B, -0.36, -0.1, 280, 26)
  };
  out.X = spec.X || shift(B, 0.2, 0, 55, 8);
  out.x = spec.x || shift(out.X, -0.14, 0, 275, 12);
  out.Y = spec.Y || '#5aa83c';
  out.Z = spec.Z || shift(out.Y, -0.16, 0, 275, 12);
  for (const k of BODY_KEYS) if (spec[k]) out[k] = spec[k];
  for (const k of FACE_KEYS) if (spec[k]) out[k] = spec[k];
  return out;
}

/* ------------------------------------------------------------------ *
 * The six original flavours. The full catalogue of Pip types lives in
 * pips.js; these stay here so palettes.js works on its own and every
 * older settings file still has a colour to fall back to.
 * ------------------------------------------------------------------ */

const FLAVORS = {
  cherry: derive({ B: '#e2415a', Y: '#5aa83c', Z: '#2f6a25' }),
  lime: derive({ B: '#68c445', Y: '#3f8f2c' }),
  blueberry: derive({ B: '#4a7fe0', Y: '#2c4f9e', Z: '#1d3470' }),
  lemon: derive({ B: '#f2cc3d', Y: '#e2b52a', Z: '#b38716' }),
  grape: derive({ B: '#9b5cd6', Y: '#6b8f3a', Z: '#46632a' }),
  licorice: derive({ B: '#57536a', H: '#d4d8e2', h: '#7a7690', X: '#6b6781', x: '#3f3c4e', E: '#0c0a10', e: '#9a96b4', M: '#141018' })
};

/** Flavour names in display order. */
const FLAVOR_NAMES = Object.keys(FLAVORS);

/** The flavour Pip ships with. */
const DEFAULT_FLAVOR = 'cherry';

/**
 * Build the full key -> colour map.
 *
 * Accepts a flavour name, a Pip type id (once pips.js is loaded), or an
 * already-derived body palette. Anything unknown falls back to the default
 * rather than throwing, so a corrupt settings file can never stop Pip from
 * drawing.
 *
 * @param {string|object} which
 * @returns {Object<string,string>} key -> '#rrggbb'
 */
function resolve(which) {
  let body = null;
  if (which && typeof which === 'object' && which.B) body = which;
  else if (typeof which === 'string' && Object.prototype.hasOwnProperty.call(FLAVORS, which)) body = FLAVORS[which];
  else if (typeof which === 'string') {
    const Pips = typeof window !== 'undefined' && window.Pip ? window.Pip.Pips : lazyPips();
    const type = Pips && Pips.BY_ID && Pips.BY_ID[which];
    if (type) body = type.palette;
  }
  if (!body) body = FLAVORS[DEFAULT_FLAVOR];
  const out = {};
  for (const k of STRUCTURAL_KEYS) out[k] = BASE[k];
  for (const k of BODY_KEYS) out[k] = body[k];
  for (const k of FACE_KEYS) if (body[k]) out[k] = body[k];
  return out;
}

/** pips.js requires this file, so it is looked up lazily under Node. */
let pipsModule;
function lazyPips() {
  if (pipsModule !== undefined) return pipsModule;
  pipsModule = null;
  if (typeof require === 'function') {
    try { pipsModule = require('./pips.js'); } catch (err) { pipsModule = null; }
  }
  return pipsModule;
}

/**
 * Is this character a valid palette key (including transparent)?
 * @param {string} ch
 * @returns {boolean}
 */
function isValidKey(ch) {
  return ch === TRANSPARENT || ALL_KEYS.indexOf(ch) !== -1;
}

const Palettes = {
  BODY_KEYS,
  STRUCTURAL_KEYS,
  FACE_KEYS,
  ALL_KEYS,
  TRANSPARENT,
  BASE,
  FLAVORS,
  FLAVOR_NAMES,
  DEFAULT_FLAVOR,
  resolve,
  isValidKey,
  derive,
  shift,
  mix,
  hexToRgb,
  rgbToHex
};

if (typeof window !== 'undefined') {
  window.Pip = window.Pip || {};
  window.Pip.Palettes = Palettes;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Palettes;
}
