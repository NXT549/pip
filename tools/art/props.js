/*
 * props.js - the things Pip holds, wears and plays with.
 *
 * Each prop is a small grid of palette keys ('.' = leave alone) plus the
 * pixel (ax, ay) that sits on the point a frame spec places it at. Hats
 * are flagged, so a Pip type's own decoration (a stem, a crown) is skipped
 * while he is wearing one.
 *
 * Shared keys only (see palettes.js): props look the same on every Pip.
 */

'use strict';

const PROPS = {
  // a glass of water
  cup: {
    ax: 0, ay: 0,
    rows: [
      '.OOOOOO.',
      'OSWWWWSO',
      'OWPPPPpO',
      'OWPPPPpO',
      'OWPPPPpO',
      'OWPPPppO',
      '.OWPppO.',
      '.OOOOOO.'
    ]
  },

  // a steaming mug, for breaks
  mug: {
    ax: 0, ay: 0,
    rows: [
      '..S..S....',
      '.S..S.....',
      '..S..S....',
      'OOOOOOO...',
      'OAAAAAOOO.',
      'OAWAAAO.O.',
      'OAAAAaO.O.',
      'OAAAAaOOO.',
      'OAAAaaO...',
      '.OOOOO....'
    ]
  },

  // a little open book
  book: {
    ax: 0, ay: 0,
    rows: [
      '.OOOOO.OOOOO.',
      'OSSSSSOSSSSSO',
      'OSGGGSOSGGGSO',
      'OSSSSSOSSSSSO',
      'OSGGSSOSGGGSO',
      'OSSSSSOSSSSSO',
      'OAAAAAOAAAAAO',
      '.OOOOOOOOOOO.'
    ]
  },

  // the same book with a page mid-turn
  book_turn: {
    ax: 0, ay: 0,
    rows: [
      '.......OOO...',
      '......OSSO...',
      '.OOOOOSSO....',
      'OSSSSSOSOOOO.',
      'OSGGGSOSSSSSO',
      'OSSSSSOSGGGSO',
      'OSGGSSOSSSSSO',
      'OAAAAAOAAAAAO',
      '.OOOOOOOOOOO.'
    ]
  },

  // a floppy nightcap; the brim sits on the crown
  nightcap: {
    hat: true,
    ax: 12, ay: 11,
    rows: [
      '..OOO...............',
      '.OWWWO..............',
      '.OWWSO..............',
      '..OOOAOO............',
      '.....OAAAOO.........',
      '.....OAPPAAAOO......',
      '......OAAPPAAAAOO...',
      '......OAAAAPPAAAAO..',
      '.....OAAAAAAAPPAaaO.',
      '....OSSSSSSSSSSSSSSO',
      '....OSWSSSSSSWSSSSSO',
      '.....OOOOOOOOOOOOOO.'
    ]
  },

  // a juggling ball
  ball: {
    ax: 0, ay: 0,
    rows: [
      '..OOOO..',
      '.OAWWAO.',
      'OAWAAAAO',
      'OPPPPPPO',
      'OAAAAAaO',
      'OAAAAaaO',
      '.OAaaaO.',
      '..OOOO..'
    ]
  },

  // the pixel bug Pip never quite catches
  bug: {
    ax: 0, ay: 0,
    rows: [
      '.WW..WW.',
      'WWWOOWWW',
      '.WOAAOW.',
      '..OAaAO.',
      '..OaAaO.',
      '...OO...'
    ]
  },

  battery: {
    ax: 0, ay: 0,
    rows: [
      'OOOOOOOOOO.',
      'OWKKGGGGGOO',
      'OKKKGGGGGOO',
      'OKKKGGGGGOO',
      'OOOOOOOOOO.'
    ]
  },

  // a chocolate chip cookie
  snack: {
    ax: 0, ay: 0,
    rows: [
      '..OOOO..',
      '.OAAMAO.',
      'OAMAAaAO',
      'OAAaAMAO',
      'OAMAAAaO',
      '.OAaMaO.',
      '..OOOO..'
    ]
  },

  // half-eaten
  snack_bit: {
    ax: 0, ay: 0,
    rows: [
      '..OOO...',
      '.OAAMO..',
      'OAMAAO..',
      'OAAaAO..',
      'OAMAAAO.',
      '.OAaMaO.',
      '..OOOO..'
    ]
  }
};

module.exports = { PROPS };
