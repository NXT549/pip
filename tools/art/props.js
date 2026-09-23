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

/** A round bubble of gum, d pixels across. */
function gumBubble(d) {
  const rows = [];
  const r = d / 2;
  for (let y = 0; y < d; y++) {
    let s = '';
    for (let x = 0; x < d; x++) {
      const dx = x + 0.5 - r, dy = y + 0.5 - r;
      const dist = Math.hypot(dx, dy);
      if (dist > r) s += '.';
      else if (dist > r - 1.1) s += 'O';
      else if (dx < -r * 0.25 && dy < -r * 0.25 && dist > r * 0.35 && dist < r * 0.75) s += 'W';
      else if (dx < 0 && dy < 0) s += 'k';
      else s += 'K';
    }
    rows.push(s);
  }
  return rows;
}

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

  // a laptop open on the floor, its screen turned half toward you
  laptop: {
    ax: 0, ay: 0,
    rows: [
      '...OOOOOOOOOOO..',
      '...ONNNNNNNNNO..',
      '...ONnnNnnnNNO..',
      '...ONNNnnnNNNO..',
      '...ONnNNnnNNNO..',
      '...ONNnnnNNNNO..',
      '...ONNNNNNNNNO..',
      '..OOOOOOOOOOOOO.',
      '.OGGGGGGGGGGGGGO',
      'OGSGSGSGSGSGSGGO',
      'OOOOOOOOOOOOOOOO'
    ]
  },

  // a hard hat, for when a build is running
  hardhat: {
    hat: true,
    ax: 8, ay: 7,
    rows: [
      '.....OOOOOOO.....',
      '...OOQQQQQQQOO...',
      '..OQQWQQQQQQQqO..',
      '.OQQWQQQOQQQQqqO.',
      '.OQQQQQQOQQQQqqO.',
      '.OQQQQQQOQQQQqqO.',
      'OOOOOOOOOOOOOOOOO',
      'OQQQQQQQQQQQQQqqO',
      '.OOOOOOOOOOOOOOO.'
    ]
  },

  // a sweatband, worn round the body: clipped to its outline
  headband: {
    hat: true,
    clip: 'body',
    ax: 0, ay: 0,
    rows: [
      'O'.repeat(64),
      ('RRRRRWWRRR').repeat(7).slice(0, 64),
      'r'.repeat(64),
      'O'.repeat(64)
    ]
  },

  // the knot and tails of the sweatband, flying off the back
  headband_tail: {
    ax: 5, ay: 1,
    rows: [
      '..OOOO',
      '.ORRrO',
      'ORrO..',
      'OrO...',
      '.O....'
    ]
  },

  // headphones: a band over the top and a cup on the near side
  headphones: {
    hat: true,
    ax: 10, ay: 12,
    rows: [
      '.....OOOOOOOOOO.......',
      '...OONNNNNNNNNNOO.....',
      '..ONNOOOOOOOOOONNO....',
      '.ONO..........OONO....',
      '.ONO...........ONO....',
      'ONO.............ONO...',
      'ONO............OOOOO..',
      'ONO...........ONNNNNO.',
      'ONO..........ONNnnNNNO',
      '.O...........ONNnPPNNO',
      '.............ONNNPPNNO',
      '.............ONNNNNNNO',
      '..............ONNNNNO.',
      '...............OOOOO..'
    ]
  },

  // a striped bucket of popcorn
  popcorn: {
    ax: 0, ay: 0,
    rows: [
      '.OO.OOO.',
      'OSSOSASO',
      'OSASSSSO',
      'OOOOOOOO',
      'ORSRSRSO',
      'ORSRSRSO',
      '.ORSRSO.',
      '.ORSRSO.',
      '..OOOO..'
    ]
  },

  // an artist's beret
  beret: {
    hat: true,
    ax: 7, ay: 6,
    rows: [
      '.......OO.......',
      '....OOORRO......',
      '..OORRRRRROOO...',
      '.ORRRRRRRRRRRO..',
      'ORRWRRRRRRRRRrO.',
      '.OrrrrrrrrrrrO..',
      '..OOOOOOOOOOO...'
    ]
  },

  // a paintbrush, bristles up
  brush: {
    ax: 0, ay: 0,
    rows: [
      '......OO',
      '.....OPO',
      '....OPpO',
      '...OaO..',
      '..OaO...',
      '.OaO....',
      'OaO.....',
      'OO......'
    ]
  },

  // a little canvas on an easel
  canvas: {
    ax: 0, ay: 0,
    rows: [
      'OOOOOOOOOO',
      'OSSSSSSSSO',
      'OSKKSSPSSO',
      'OSKSSPPSSO',
      'OSSSQQSSSO',
      'OSSSSQSSSO',
      'OOOOOOOOOO',
      '..OaOOaO..',
      '.OaO..OaO.',
      'OaO....OaO'
    ]
  },

  pencil: {
    ax: 0, ay: 0,
    rows: [
      '......OO',
      '.....OKO',
      '....OQO.',
      '...OQO..',
      '..OQO...',
      '.OaO....',
      'OMO.....'
    ]
  },

  paper: {
    ax: 0, ay: 0,
    rows: [
      'OOOOOOOOOOO',
      'OSSSSSSSSSO',
      'OSGGGGGGSSO',
      'OSSSSSSSSSO',
      'OSGGGGGSSSO',
      'OSSSSSSSSSO',
      'OOOOOOOOOOO'
    ]
  },

  envelope: {
    ax: 0, ay: 0,
    rows: [
      'OOOOOOOOOOO',
      'OSOSSSSSOSO',
      'OSSOSSSOSSO',
      'OSSSOKOSSSO',
      'OSSSSSSSSSO',
      'OSSSSSSSSSO',
      'OOOOOOOOOOO'
    ]
  },

  gamepad: {
    ax: 0, ay: 0,
    rows: [
      '.OOOOOOOOOOO.',
      'ONNNNNNNNNNNO',
      'ONNWNNNNNKNNO',
      'ONWWWNNNPNKNO',
      'ONNWNNNNNPNNO',
      'ONNNNOOONNNNO',
      '.OOOO...OOOO.'
    ]
  },

  tissue: {
    ax: 0, ay: 0,
    rows: [
      '..OO..',
      '.OSSO.',
      'OSSSWO',
      'OSSSSO',
      '.OOOO.'
    ]
  },

  gum_s: { ax: 0, ay: 2, rows: gumBubble(5) },
  gum_m: { ax: 0, ay: 4, rows: gumBubble(9) },
  gum_l: { ax: 0, ay: 7, rows: gumBubble(14) },

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
