/*
 * pips.js - the catalogue of Pip types.
 *
 * Fifty jellybeans to collect. Every type is the same Pip on the same
 * frames, dressed differently:
 *
 *   id          stable key, stored in settings and the collection
 *   name        what the Pipdex calls it
 *   rarity      common | uncommon | rare | epic | legendary
 *   palette     the body colour keys (see palettes.js), derived from one
 *               base colour plus any overrides
 *   pattern     a PATTERNS name from traits.js, or null
 *   trait       a TRAITS name from traits.js, or null
 *   effect      an effects.js name, or null - rare and up always have one
 *   temperament cheerful | sleepy | zesty | dramatic | chill | curious;
 *               decides his favourite idle behaviour (main.js)
 *   blurb       one line for the Pipdex
 *
 * Only looks and personality differ. No Pip is better at anything than any
 * other - a rare one is rare, not stronger.
 */

(function () {
  'use strict';

  const Palettes = (typeof window !== 'undefined' && window.Pip && window.Pip.Palettes) ||
    (typeof require === 'function' ? require('./palettes.js') : null);

  const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

  /** Display colours for each rarity, used by the arcade and the Pipdex. */
  const RARITY_COLORS = {
    common: '#c9c3d6',
    uncommon: '#7ee07a',
    rare: '#5fb6ff',
    epic: '#c77dff',
    legendary: '#ffcf3f'
  };

  const TEMPERAMENTS = ['cheerful', 'sleepy', 'zesty', 'dramatic', 'chill', 'curious'];

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

  const F = Palettes.FLAVORS;

  const TYPES = [
    /* ---- common: the original six, and twelve more --------------------- */
    t('cherry', 'Cherry', 'common', F.cherry, { trait: 'stem_leaf' }, 'cheerful',
      'The original. Bright, bouncy and always pleased to see you.'),
    t('lime', 'Lime', 'common', F.lime, { trait: 'sprout' }, 'zesty',
      'Zippy and a little sour. Grows a sprout when nobody is looking.'),
    t('blueberry', 'Blueberry', 'common', F.blueberry, { trait: 'calyx' }, 'chill',
      'Wears a tiny crown and takes absolutely nothing seriously.'),
    t('lemon', 'Lemon', 'common', F.lemon, { trait: 'nubs' }, 'zesty',
      'Pointy at both ends. Puckers at the mere mention of tea.'),
    t('grape', 'Grape', 'common', F.grape, { trait: 'vine' }, 'dramatic',
      'Every sigh is a performance. Every nap is an event.'),
    t('licorice', 'Licorice', 'common', F.licorice, { pattern: 'twist' }, 'sleepy',
      'An acquired taste. Cool, quiet and very, very good at naps.'),
    t('orange', 'Orange', 'common', { B: '#f58a2e', X: '#e0741c', Y: '#4f9a3a' }, { pattern: 'pores', trait: 'leaf' }, 'cheerful',
      'Sunny, round and dimpled all over. Smells faintly of breakfast.'),
    t('strawberry', 'Strawberry', 'common', { B: '#e8344e', X: '#ffe07a', x: '#e0b24a', Y: '#4fa83a' }, { pattern: 'seeds', trait: 'leafy_cap' }, 'cheerful',
      'Freckled with seeds and wearing a leafy hat at a jaunty angle.'),
    t('bubblegum', 'Bubblegum', 'common', { B: '#ff8fc8' }, {}, 'cheerful',
      'Blows bubbles. Some of them get out of hand.'),
    t('mint', 'Mint', 'common', { B: '#86ddb8', X: '#effff8', Y: '#3f9a5a' }, { pattern: 'swirl', trait: 'mint_leaves' }, 'chill',
      'Cool as anything. Leaves a fresh little breeze wherever he trots.'),
    t('peach', 'Peach', 'common', { B: '#ffae85', X: '#ff8f86', Y: '#5aa83c' }, { pattern: 'fuzz', trait: 'leaf' }, 'sleepy',
      'Soft, fuzzy and permanently blushing. Loves a long afternoon nap.'),
    t('coconut', 'Coconut', 'common', { B: '#efe2cb', X: '#8b5a2b', Y: '#7a4b22', Z: '#533014' }, { pattern: 'speckle', trait: 'tuft' }, 'chill',
      'Hard to crack, easy to love. Has a tuft he is very proud of.'),
    t('cola', 'Cola', 'common', { B: '#6a3520', X: '#d9a066', E: '#120805', e: '#b88560', M: '#1a0c06', H: '#ffe9d6' }, { pattern: 'fizz' }, 'zesty',
      'Fizzy, bubbly and never, ever sits still.'),
    t('apple', 'Green Apple', 'common', { B: '#8cd650', Y: '#4f9a3a', Z: '#6b4a24' }, { trait: 'stem_leaf' }, 'curious',
      'Crisp and curious. Asks a lot of questions about gravity.'),
    t('plum', 'Plum', 'common', { B: '#7a3f8a', X: '#b89ac8', Y: '#6b8f3a' }, { pattern: 'bloom', trait: 'stem_thick' }, 'sleepy',
      'Dusted with frost and deeply fond of the snooze button.'),
    t('caramel', 'Caramel', 'common', { B: '#e0953f', Y: '#8a4a1a', Z: '#5f3010' }, { trait: 'drip' }, 'chill',
      'Takes things slowly. Very slowly. Slower than that.'),
    t('marshmallow', 'Marshmallow', 'common', { B: '#fbe3ec', H: '#ffffff', Y: '#ff7eb0', Z: '#d85488' }, { trait: 'bow' }, 'sleepy',
      'The squishiest bean. Wears a bow for important occasions, which is all of them.'),
    t('blueraspberry', 'Blue Raspberry', 'common', { B: '#2f9bff', X: '#e4f4ff' }, { pattern: 'sugar' }, 'zesty',
      'A colour not found in nature, and proud of it.'),

    /* ---- uncommon ------------------------------------------------------ */
    t('watermelon', 'Watermelon', 'uncommon', { B: '#ff6070', X: '#2a1a2d', x: '#2a1a2d', Y: '#4fbf54', Z: '#2f8a3a' }, { pattern: 'watermelon' }, 'cheerful',
      'The taste of summer, seeds and all. Please do not spit them at anyone.'),
    t('cottoncandy', 'Cotton Candy', 'uncommon', { B: '#ffb8e2', X: '#a8dcff' }, { pattern: 'swirl' }, 'cheerful',
      'Spun from sugar and daydreams. Dissolves if you look at him too sweetly.'),
    t('tuttifrutti', 'Tutti-Frutti', 'uncommon', { B: '#ffe0ee', X: '#ff5f8d', Y: '#58c8ff', Z: '#2f9ad6' }, { pattern: 'confetti', trait: 'cherry_top' }, 'cheerful',
      'Every flavour at once, with a cherry on top. Obviously.'),
    t('rootbeer', 'Root Beer Float', 'uncommon', { B: '#7a3e22', E: '#120805', e: '#b88560', M: '#1a0c06' }, { trait: 'foam' }, 'chill',
      'Mostly fizz, a little foam and entirely unbothered.'),
    t('pineapple', 'Pineapple', 'uncommon', { B: '#ffcf3f', X: '#e0942a', Y: '#4fa83a' }, { pattern: 'crosshatch', trait: 'crown_leaves' }, 'zesty',
      'Spiky on the outside, sweet in the middle. Stands tall to show off his leaves.'),
    t('kiwi', 'Kiwi', 'uncommon', { B: '#8f6b3f', X: '#b8925e' }, { pattern: 'fuzz' }, 'curious',
      'Fuzzy, brown and secretly bright green inside. Nobody believes him.'),
    t('honey', 'Honey', 'uncommon', { B: '#f5b82e', X: '#ffd86b' }, { pattern: 'combs', trait: 'bee' }, 'sleepy',
      'Golden and slow. A bee follows him everywhere and he has stopped asking why.'),
    t('matcha', 'Matcha', 'uncommon', { B: '#8fbf5f', X: '#e6f4cf', Y: '#4f7a2f' }, { pattern: 'swirl', trait: 'leaf' }, 'chill',
      'Calm, grassy and whisked to perfection. Latte art included.'),
    t('pumpkin', 'Pumpkin Spice', 'uncommon', { B: '#f07f2a', X: '#c95d14', Y: '#5a7a2a', Z: '#3f5a1a' }, { pattern: 'ribs', trait: 'stem_thick' }, 'cheerful',
      'Arrives every autumn whether you want him to or not. You always do.'),
    t('candycane', 'Candy Cane', 'uncommon', { B: '#fff6f6', X: '#e8384a', x: '#b82232' }, { pattern: 'candystripe' }, 'cheerful',
      'Minty, stripy and festive all year round.'),
    t('sourapple', 'Sour Apple', 'uncommon', { B: '#b6ee4a', X: '#ffffff', Y: '#4f9a3a', Z: '#6b4a24' }, { pattern: 'crystals', trait: 'stem_leaf' }, 'zesty',
      'Rolled in sugar and still makes your face do the thing.'),
    t('dragonfruit', 'Dragonfruit', 'uncommon', { B: '#ff4f9a', X: '#9be36b', x: '#5fb04a' }, { pattern: 'scales' }, 'dramatic',
      'Looks fierce. Is not fierce. Would like you to think he is fierce.'),
    t('lavender', 'Lavender', 'uncommon', { B: '#b89df0', X: '#8a6ed6', Y: '#9a78e8', Z: '#4f7a3a' }, { pattern: 'speckle', trait: 'sprig' }, 'sleepy',
      'Smells like a sleepy afternoon in a garden. Yawns in purple.'),
    t('toffee', 'Toffee Swirl', 'uncommon', { B: '#b87a4b', X: '#f2d2a8' }, { pattern: 'marble' }, 'chill',
      'Rich, swirly and a little bit sticky. Gets stuck to things. Happily.'),

    /* ---- rare: each has a special effect -------------------------------- */
    t('frost', 'Frost', 'rare', { B: '#9fdcff', X: '#ffffff', H: '#ffffff' }, { pattern: 'crystals', trait: 'snowflake', effect: 'snow' }, 'chill',
      'Brings his own snowfall. Cool to the touch and cooler in person.'),
    t('ember', 'Cinnamon Ember', 'rare', { B: '#d9481c', X: '#ffb347' }, { pattern: 'speckle', trait: 'flame', effect: 'embers' }, 'zesty',
      'Warm, spicy and gently smouldering. Mind the sparks.'),
    t('glowbean', 'Glowbean', 'rare', { B: '#b8ff6a', h: '#eaffc8' }, { effect: 'glow' }, 'curious',
      'Glows softly in the dark. Very handy for finding the fridge at night.'),
    t('sodapop', 'Soda Pop', 'rare', { B: '#5ad1ff', X: '#e0f8ff', Y: '#e8384a' }, { pattern: 'fizz', trait: 'straw', effect: 'fizz' }, 'zesty',
      'All bubbles, all the time. Burps in the key of C.'),
    t('sakura', 'Sakura', 'rare', { B: '#ffc2da', X: '#ff8fb5' }, { pattern: 'speckle', trait: 'flower', effect: 'petals' }, 'dramatic',
      'Blossom petals drift wherever she goes. She knows exactly how that looks.'),
    t('poprocks', 'Pop Rocks', 'rare', { B: '#ff5ac8', X: '#ffe36b', Y: '#6bffe6', Z: '#3ad6c0' }, { pattern: 'confetti', effect: 'crackle' }, 'zesty',
      'Crackles, pops and fizzes on contact. Handle with glee.'),
    t('chameleon', 'Chameleon', 'rare', { B: '#5fd08a', X: '#3aa86a' }, { pattern: 'scales', effect: 'hue' }, 'curious',
      'Never quite the same colour twice. He says it is a phase.'),
    t('ghost', 'Ghost', 'rare', { B: '#e6ecff', H: '#ffffff', o: '#8a8fb8' }, { effect: 'ghost' }, 'sleepy',
      'A little see-through and a lot friendly. Floats when nobody is watching.'),
    t('glitter', 'Glitter', 'rare', { B: '#c28bff', X: '#fff0ff' }, { pattern: 'sugar', effect: 'glints' }, 'cheerful',
      'Sparkles at the slightest provocation. Leaves a trail of it everywhere.'),
    t('melody', 'Melody', 'rare', { B: '#7b8cff', Y: '#ffe36b', Z: '#d9a012' }, { trait: 'note_antenna', effect: 'notes' }, 'chill',
      'Hums all day long. Always in tune, rarely the right song.'),

    /* ---- epic ------------------------------------------------------------ */
    t('galaxy', 'Galaxy', 'epic', { B: '#2b1f5c', X: '#ffffff', x: '#c9c0ff', Y: '#6b4fd6', Z: '#4a33a8', E: '#ece6ff', e: '#8f7fff', M: '#ece6ff' }, { pattern: 'starfield', effect: 'galaxy' }, 'dramatic',
      'A whole night sky in one small bean, with a moon of his very own.'),
    t('rainbow', 'Rainbow', 'epic', { B: '#ff6b6b', X: '#ffd93b', x: '#e0a91a', Y: '#5ad1ff', Z: '#2f9ad6' }, { pattern: 'rainbow', effect: 'rainbow' }, 'cheerful',
      'Every colour, cycling forever. Leaves a rainbow when he runs.'),
    t('golden', 'Golden', 'epic', { B: '#f2c230', L: '#ffe27a', D: '#c8900f', d: '#9a6a08', o: '#6a4600', H: '#ffffff' }, { effect: 'golden' }, 'dramatic',
      'Solid gold, and he will tell you so. Catches the light just so.'),
    t('neon', 'Neon', 'epic', { B: '#221640', X: '#00ffd5', x: '#00b89a', Y: '#ff4fd8', Z: '#c02aa6', E: '#00ffd5', e: '#ffffff', M: '#00ffd5' }, { pattern: 'circuit', trait: 'antenna', effect: 'neon' }, 'zesty',
      'Plugged in, lit up and humming at 60 hertz. Occasionally glitches.'),
    t('aurora', 'Aurora', 'epic', { B: '#2a3b6e', X: '#6bffb8', x: '#3ad68e', Y: '#c38bff', Z: '#8a5ad6', E: '#eafcff', e: '#6bffb8', M: '#eafcff' }, { pattern: 'aurora', effect: 'aurora' }, 'chill',
      'The northern lights, curled up small. Ripples when he breathes.'),
    t('magma', 'Magma', 'epic', { B: '#3a1a1a', X: '#ff7a1a', x: '#d6480f', H: '#ffb36b', E: '#ffc27a', e: '#ff6a1a', M: '#ffc27a' }, { pattern: 'cracks', effect: 'magma' }, 'dramatic',
      'Molten on the inside. Please do not pick him up without oven gloves.'),

    /* ---- legendary --------------------------------------------------------- */
    t('celestial', 'Celestial', 'legendary', { B: '#fff0cc', X: '#ffcf3f', x: '#e0a91a', Y: '#ffe9a6', Z: '#f2c860' }, { pattern: 'starfield', effect: 'celestial' }, 'chill',
      'Wears a halo, walks on air and trails stardust. Very humble about it.'),
    t('prism', 'Prism', 'legendary', { B: '#e8f4ff', X: '#ffb3f0', x: '#d68acc', Y: '#b3fff0', Z: '#7ad6c4' }, { pattern: 'holo', trait: 'crown', effect: 'prism' }, 'dramatic',
      'Splits the light into every colour there is. Royalty, obviously.')
  ];

  const BY_ID = Object.create(null);
  for (const type of TYPES) BY_ID[type.id] = type;

  const IDS = TYPES.map((x) => x.id);

  /** The types everyone owns from the start: the original six flavours. */
  const STARTERS = ['cherry', 'lime', 'blueberry', 'lemon', 'grape', 'licorice'];

  /**
   * The types the smoke test plays every clip for: one of each kind of
   * decoration (plain, trait at the crown, traits at the ends, over-body
   * trait, pattern, two-colour pattern) and every rarity.
   */
  const SMOKE_FULL = ['cherry', 'lemon', 'licorice', 'caramel', 'watermelon', 'frost', 'ghost', 'galaxy', 'neon', 'prism'];

  function get(id) {
    return BY_ID[id] || BY_ID.cherry;
  }

  function byRarity(rarity) {
    return TYPES.filter((x) => x.rarity === rarity);
  }

  const Pips = { TYPES, BY_ID, IDS, RARITIES, RARITY_COLORS, TEMPERAMENTS, STARTERS, SMOKE_FULL, get, byRarity };

  if (typeof window !== 'undefined') {
    window.Pip = window.Pip || {};
    window.Pip.Pips = Pips;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Pips;
  }
})();
