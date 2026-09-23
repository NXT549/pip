/*
 * faces.js - mouths, brows and blush for the sprite generator.
 *
 * Eyes live in src/renderer/compose.js instead, because the runtime redraws
 * them (to look at the pointer and to blink) and must draw exactly the same
 * pixels the generator did.
 *
 * '.' in a template leaves the pixel underneath alone. Templates face right.
 */

'use strict';

/** Mouths are centred on the mouth point. */
const MOUTHS = {
  smile: [
    'M...M',
    '.MMM.'
  ],
  // the little w
  cat: [
    'M..M..M',
    '.MM.MM.'
  ],
  open: [
    '.MMM.',
    'MTTTM',
    'MTUTM',
    '.MMM.'
  ],
  grin: [
    'MMMMMMM',
    'MTTTTTM',
    '.MUUUM.',
    '..MMM..'
  ],
  o: [
    '.MM.',
    'MTTM',
    '.MM.'
  ],
  wavy: [
    '.MM...M',
    'M..MMM.'
  ],
  flat: [
    'MMMMM'
  ],
  pout: [
    '.MM.',
    'M..M'
  ],
  frown: [
    '.MMM.',
    'M...M'
  ],
  blep: [
    'M...M',
    '.MMM.',
    '..UU.',
    '..MM.'
  ],
  munch: [
    '.MMM.',
    'MTMTM',
    '.MMM.'
  ],
  // a tiny whistle
  whistle: [
    '.M.',
    'M.M',
    '.M.'
  ],
  none: []
};

/**
 * Brows sit just above each eye. Drawn for the far (left) eye; the near eye
 * gets the mirror image so both slope toward the middle together.
 */
const BROWS = {
  angry: [
    'EE...',
    '..EEE'
  ],
  worried: [
    '...EE',
    'EEE..'
  ],
  raised: [
    '.EEE.',
    'E...E'
  ]
};

const BLUSH = [
  '.kKK.',
  'KKKKK'
];

module.exports = { MOUTHS, BROWS, BLUSH };
