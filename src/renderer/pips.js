/*
 * pips.js - the catalogue of Pip types.
 *
 * Every type is the same Pip on the same frames, dressed differently:
 *
 *   id          stable key, stored in settings and the collection
 *   name        what the Pipdex calls it
 *   rarity      common | uncommon | rare | epic | legendary
 *   palette     the body colour keys (see palettes.js); derived from one
 *               base colour plus any overrides
 *   pattern     a PATTERNS name from traits.js, or null
 *   trait       a TRAITS name from traits.js, or null
 *   effect      an effects.js name, or null - rare and up always have one
 *   temperament how he behaves: cheerful sleepy zesty dramatic chill curious
 *   blurb       one line for the Pipdex
 */

(function () {
  'use strict';

  const Palettes = (typeof window !== 'undefined' && window.Pip && window.Pip.Palettes) ||
    (typeof require === 'function' ? require('./palettes.js') : null);

  const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

  function t(id, name, rarity, colours, look, temperament, blurb) {
    return {
      id: id,
      name: name,
      rarity: rarity,
      palette: Palettes.derive(colours),
      pattern: look.pattern || null,
      trait: look.trait || null,
      effect: look.effect || null,
      temperament: temperament,
      blurb: blurb
    };
  }

  const TYPES = [
    t('cherry', 'Cherry', 'common', Palettes.FLAVORS.cherry, { trait: 'stem_leaf' }, 'cheerful',
      'The original. Bright, bouncy and always pleased to see you.'),
    t('lime', 'Lime', 'common', Palettes.FLAVORS.lime, { trait: 'sprout' }, 'zesty',
      'Zippy and a little sour. Grows a sprout when nobody is looking.'),
    t('blueberry', 'Blueberry', 'common', Palettes.FLAVORS.blueberry, { trait: 'calyx' }, 'chill',
      'Wears a tiny crown and takes absolutely nothing seriously.'),
    t('lemon', 'Lemon', 'common', Palettes.FLAVORS.lemon, { trait: 'nubs' }, 'zesty',
      'Pointy at both ends. Puckers at the mere mention of tea.'),
    t('grape', 'Grape', 'common', Palettes.FLAVORS.grape, { trait: 'vine' }, 'dramatic',
      'Every sigh is a performance. Every nap is an event.'),
    t('licorice', 'Licorice', 'common', Palettes.FLAVORS.licorice, { pattern: 'twist' }, 'sleepy',
      'An acquired taste. Cool, quiet and very, very good at naps.')
  ];

  const BY_ID = Object.create(null);
  for (const type of TYPES) BY_ID[type.id] = type;

  const IDS = TYPES.map((x) => x.id);

  /** The types everyone owns from the start: the original six flavours. */
  const STARTERS = ['cherry', 'lime', 'blueberry', 'lemon', 'grape', 'licorice'];

  function get(id) {
    return BY_ID[id] || BY_ID.cherry;
  }

  const Pips = { TYPES, BY_ID, IDS, RARITIES, STARTERS, get };

  if (typeof window !== 'undefined') {
    window.Pip = window.Pip || {};
    window.Pip.Pips = Pips;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Pips;
  }
})();
