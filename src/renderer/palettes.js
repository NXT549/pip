/*
 * palettes.js - the one and only place colours are defined.
 *
 * Pip's sprites are character grids; every character is a palette key.
 * There are 12 entries total (11 colours + transparent), which is the cap.
 *
 *   .  transparent
 *   O  outline          1px dark line around body and legs
 *   B  body             the main jellybean colour
 *   D  body dark        belly / underside shading
 *   L  body light       upper body, catches the light
 *   H  gloss highlight  the signature jellybean shine streak
 *   F  far-leg shade    the two far-side legs, one shade darker
 *   E  eye              dark pupil
 *   W  eye white        highlight pixel in the eye, and prop highlights
 *   K  blush            cheek marks
 *   M  mouth            mouth line
 *   A  prop accent      cups, books, nightcaps, balls, batteries, bugs
 *
 * A flavour is a palette swap on the SAME frames - it overrides only the
 * body entries (B D L F H). Outline, eyes, blush, mouth and props are shared
 * so Pip's face and structure read identically in every flavour.
 */

'use strict';

// Every overlay script shares one global scope, so nothing here may be
// declared at the top level - see ARCHITECTURE.md section 1.
(function () {
  /** Keys a flavour is allowed (and required) to define. */
  const BODY_KEYS = ['B', 'D', 'L', 'F', 'H'];

  /** Keys that are shared across every flavour and never overridden. */
  const STRUCTURAL_KEYS = ['O', 'E', 'W', 'K', 'M', 'A'];

  /** Every key a resolved palette contains, excluding transparent. */
  const ALL_KEYS = STRUCTURAL_KEYS.concat(BODY_KEYS);

  /** The transparent character. Never drawn. */
  const TRANSPARENT = '.';

  /** Shared, non-body colours. */
  const BASE = {
    O: '#2a1a2d',
    E: '#231a2c',
    W: '#ffffff',
    K: '#ff9ec4',
    M: '#3b2334',
    A: '#ffe3a8'
  };

  /**
   * Flavour palettes. Each defines exactly the BODY_KEYS.
   * Order here is the order shown in Settings.
   */
  const FLAVORS = {
    cherry:    { B: '#e2415a', D: '#a82744', L: '#f4778c', F: '#8e1f3a', H: '#ffffff' },
    lime:      { B: '#68c445', D: '#3d8a28', L: '#9ee06d', F: '#2f6d1f', H: '#ffffff' },
    blueberry: { B: '#4a7fe0', D: '#2a4fa8', L: '#7fa9f0', F: '#1f3d85', H: '#ffffff' },
    lemon:     { B: '#f2cc3d', D: '#bd8f16', L: '#ffe884', F: '#9c7410', H: '#ffffff' },
    grape:     { B: '#9b5cd6', D: '#6a33a0', L: '#c08ef0', F: '#522480', H: '#ffffff' },
    licorice:  { B: '#4a4756', D: '#333040', L: '#66627a', F: '#282532', H: '#a8aeb9' }
  };

  /** Flavour names in display order. */
  const FLAVOR_NAMES = Object.keys(FLAVORS);

  /** The flavour Pip ships with. */
  const DEFAULT_FLAVOR = 'cherry';

  /**
   * Build the full key -> colour map for a flavour.
   * Unknown flavour names fall back to the default rather than throwing,
   * so a corrupt settings file can never stop Pip from drawing.
   *
   * @param {string} flavorName
   * @returns {Object<string,string>} key -> '#rrggbb'
   */
  function resolve(flavorName) {
    const flavor = FLAVORS[flavorName] || FLAVORS[DEFAULT_FLAVOR];
    const out = {};
    for (const k of STRUCTURAL_KEYS) out[k] = BASE[k];
    for (const k of BODY_KEYS) out[k] = flavor[k];
    return out;
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
    ALL_KEYS,
    TRANSPARENT,
    BASE,
    FLAVORS,
    FLAVOR_NAMES,
    DEFAULT_FLAVOR,
    resolve,
    isValidKey
  };

  if (typeof window !== 'undefined') {
    window.Pip = window.Pip || {};
    window.Pip.Palettes = Palettes;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Palettes;
  }
})();
