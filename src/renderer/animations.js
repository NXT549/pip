/*
 * animations.js - the clips Pip plays.
 *
 * A clip is:
 *   frames    [frameName, ...]   names from sprites.js
 *   durations [ms, ...]          one per frame
 *   loop      boolean            replay from the start when it ends
 *   next      clipName | null    what to play when a non-looping clip ends
 *
 * Adding a clip: add frames to tools/frame-specs.js, run `npm run sprites`,
 * then add an entry here. test/sprites.test.js checks that every clip points
 * at frames that actually exist.
 *
 * Blinking and eyes that follow the pointer are not in here: the renderer
 * layers them onto whatever frame is showing (see compose.js), so they work
 * in every pose without doubling the frame count.
 */

'use strict';

const CLIPS = {
  // breathing, a weight shift and a small happy wiggle
  idle: {
    frames: ['idle_0', 'idle_1', 'idle_2', 'idle_1', 'idle_0', 'idle_3', 'idle_0', 'idle_4', 'idle_0',
      'idle_1', 'idle_2', 'idle_1', 'idle_0', 'idle_5', 'idle_wiggle_a', 'idle_wiggle_b', 'idle_0'],
    durations: [420, 360, 520, 360, 420, 600, 300, 900, 300, 360, 520, 360, 420, 900, 170, 170, 300],
    loop: true,
    next: null
  },

  // held in your hand: all four legs paddling at the air
  dangle: {
    frames: ['dangle_0', 'dangle_1', 'dangle_2', 'dangle_3'],
    durations: [120, 110, 120, 110],
    loop: true,
    next: null
  },

  // a six-beat trot, diagonal pairs, the body bobbing with each push
  walk: {
    frames: ['walk_0', 'walk_1', 'walk_2', 'walk_3', 'walk_4', 'walk_5'],
    durations: [95, 90, 90, 95, 90, 90],
    loop: true,
    next: null
  },

  // a gallop: reach, gather, push
  run: {
    frames: ['run_0', 'run_1', 'run_2', 'run_3', 'run_4', 'run_5'],
    durations: [60, 55, 60, 55, 60, 55],
    loop: true,
    next: null,
    fx: [[0, 'dust', 1, 0.22, 0.97], [3, 'dust', 1, 0.22, 0.97]]
  },

  // sideways against a screen edge, diagonal pairs reaching in turn
  climb: {
    frames: ['climb_0', 'climb_1', 'climb_2', 'climb_3'],
    durations: [140, 130, 140, 130],
    loop: true,
    next: null
  },

  // caught at the top, swaying, the odd kick
  hang: {
    frames: ['hang_0', 'hang_1', 'hang_0', 'hang_3', 'hang_0', 'hang_2'],
    durations: [380, 380, 380, 380, 300, 260],
    loop: true,
    next: null
  },

  // loops until physics says he has landed
  fall: {
    frames: ['fall_0', 'fall_1', 'fall_2', 'fall_1'],
    durations: [80, 80, 80, 80],
    loop: true,
    next: null
  },

  // squash on impact, stretch back up, settle
  land: {
    frames: ['land_0', 'land_1', 'land_2', 'land_3'],
    durations: [80, 90, 110, 140],
    loop: false,
    next: 'idle',
    fx: [[0, 'dust', 3, 0.5, 0.97]]
  },

  // peeling himself off the floor
  getup: {
    frames: ['getup_0', 'getup_1', 'getup_2', 'getup_3'],
    durations: [320, 220, 200, 240],
    loop: false,
    next: 'idle'
  },

  // two full wobbles before the room stops spinning
  dizzy: {
    frames: ['dizzy_0', 'dizzy_1', 'dizzy_2', 'dizzy_3', 'dizzy_0', 'dizzy_1', 'dizzy_2', 'dizzy_3'],
    durations: [160, 150, 160, 150, 160, 150, 160, 200],
    loop: false,
    next: 'idle'
  },

  /* ---- idle behaviours ---- */

  // reach forward, sink into the bow, hold it, shake it off
  stretch: {
    frames: ['stretch_0', 'stretch_1', 'stretch_2', 'stretch_1', 'stretch_3'],
    durations: [260, 360, 700, 260, 360],
    loop: false,
    next: 'idle'
  },

  yawn: {
    frames: ['yawn_0', 'yawn_1', 'yawn_2', 'yawn_1', 'yawn_3'],
    durations: [260, 300, 700, 200, 360],
    loop: false,
    next: 'idle'
  },

  // a sit down, a look about, a thought
  sit: {
    frames: ['sit_0', 'sit_1', 'sit_0', 'sit_2', 'sit_0'],
    durations: [1300, 600, 900, 900, 1000],
    loop: false,
    next: 'idle'
  },

  // three laps after the pixel bug, which he never catches
  chase: {
    frames: [
      'chase_0', 'chase_1', 'chase_2', 'chase_3',
      'chase_0', 'chase_1', 'chase_2', 'chase_3',
      'chase_0', 'chase_1', 'chase_2', 'chase_3'
    ],
    durations: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
    loop: false,
    next: 'idle'
  },

  // two throws and catches
  juggle: {
    frames: ['juggle_0', 'juggle_1', 'juggle_2', 'juggle_3', 'juggle_0', 'juggle_1', 'juggle_2', 'juggle_3'],
    durations: [150, 130, 170, 130, 150, 130, 170, 200],
    loop: false,
    next: 'idle'
  },

  wave: {
    frames: ['wave_0', 'wave_1', 'wave_2', 'wave_1', 'wave_2', 'wave_0'],
    durations: [160, 150, 150, 150, 150, 260],
    loop: false,
    next: 'idle'
  },

  // stumble, faceplant, then pick himself back up
  trip: {
    frames: ['trip_0', 'trip_1', 'trip_2', 'getup_1', 'getup_2', 'getup_3'],
    durations: [120, 300, 420, 200, 180, 220],
    loop: false,
    next: 'idle'
  },

  // three bars of it
  dance: {
    frames: [
      'dance_0', 'dance_1', 'dance_2', 'dance_1',
      'dance_0', 'dance_1', 'dance_2', 'dance_3',
      'dance_0', 'dance_1', 'dance_2', 'dance_3'
    ],
    durations: [150, 130, 150, 130, 150, 130, 150, 170, 150, 130, 150, 220],
    loop: false,
    next: 'idle'
  },

  // a page or two, and a page turn
  read: {
    frames: ['read_0', 'read_1', 'read_0', 'read_2', 'read_0', 'read_1'],
    durations: [900, 700, 700, 320, 900, 700],
    loop: false,
    next: 'idle'
  },

  // a doze that ends on its own, unlike sleeping
  nap: {
    frames: ['nap_0', 'nap_1', 'nap_0', 'nap_1', 'nap_0', 'nap_1'],
    durations: [900, 900, 900, 900, 900, 900],
    loop: false,
    next: 'idle'
  },

  /* ---- emotions ---- */

  happy: {
    frames: ['happy_0', 'happy_1', 'happy_2', 'happy_0', 'happy_1', 'happy_2'],
    durations: [110, 180, 140, 110, 180, 220],
    loop: false,
    next: 'idle'
  },

  // the hearts themselves come from the particle layer
  heart: {
    frames: ['heart_0', 'heart_1', 'heart_0', 'heart_1'],
    durations: [240, 360, 240, 420],
    loop: false,
    next: 'idle'
  },

  blush: {
    frames: ['blush_0', 'blush_1', 'blush_0', 'blush_1'],
    durations: [300, 420, 260, 500],
    loop: false,
    next: 'idle'
  },

  surprise: {
    frames: ['surprise_0', 'surprise_1', 'surprise_2'],
    durations: [70, 200, 360],
    loop: false,
    next: 'idle',
    fx: [[0, 'exclaim', 1, 0.62, 0.1]]
  },

  sulk: {
    frames: ['sulk_0', 'sulk_1', 'sulk_0', 'sulk_1'],
    durations: [500, 500, 500, 500],
    loop: false,
    next: 'idle'
  },

  laugh: {
    frames: ['laugh_0', 'laugh_1', 'laugh_2', 'laugh_1', 'laugh_0', 'laugh_1', 'laugh_2', 'laugh_1'],
    durations: [120, 110, 120, 110, 120, 110, 120, 160],
    loop: false,
    next: 'idle'
  },

  eat: {
    frames: ['eat_0', 'eat_1', 'eat_2', 'eat_3', 'eat_2', 'eat_3'],
    durations: [340, 300, 220, 220, 220, 380],
    loop: false,
    next: 'idle',
    fx: [[1, 'crumb', 3, 0.84, 0.7], [3, 'crumb', 2, 0.84, 0.72]]
  },

  /* ---- work states ---- */

  // fifty minutes in: a slow nod forward and back
  drowsy: {
    frames: ['drowsy_0', 'drowsy_1', 'drowsy_2', 'drowsy_1'],
    durations: [900, 800, 900, 800],
    loop: true,
    next: null
  },

  // ninety minutes in: nothing left
  exhausted: {
    frames: ['exhausted_0', 'exhausted_1'],
    durations: [1100, 1100],
    loop: true,
    next: null
  },

  // carrying the cup around until you take the hint
  thirsty: {
    frames: ['thirsty_0', 'thirsty_1'],
    durations: [700, 700],
    loop: true,
    next: null
  },

  // hop, spin to face you, land, again
  celebrating: {
    frames: ['celebrating_0', 'celebrating_1', 'celebrating_2', 'celebrating_1', 'celebrating_3'],
    durations: [120, 150, 180, 150, 200],
    loop: true,
    next: null,
    fx: [[2, 'sparkle', 2, 0.5, 0.25]]
  },

  // sitting with a steaming mug, sipping now and then
  onbreak: {
    frames: ['onbreak_0', 'onbreak_1', 'onbreak_0', 'onbreak_2'],
    durations: [900, 900, 700, 1400],
    loop: true,
    next: null
  },

  // the slow breath of a properly curled-up bean
  sleeping: {
    frames: ['sleeping_0', 'sleeping_1', 'sleeping_0', 'sleeping_2'],
    durations: [1200, 1200, 1200, 1400],
    loop: true,
    next: null
  },

  /* ---- movement ---- */

  // the beat where he faces you as he changes direction
  turn: {
    frames: ['turn_0', 'turn_0'],
    durations: [60, 60],
    loop: false,
    next: 'idle'
  },

  hop: {
    frames: ['hop_0', 'hop_1', 'hop_2', 'hop_1', 'land_1', 'land_3'],
    durations: [90, 100, 160, 100, 90, 120],
    loop: false,
    next: 'idle',
    fx: [[4, 'dust', 2, 0.5, 0.97]]
  },

  /* ---- more idle behaviours ---- */

  sneeze: {
    frames: ['sneeze_0', 'sneeze_1', 'sneeze_2', 'sneeze_3'],
    durations: [380, 460, 220, 520],
    loop: false,
    next: 'idle',
    fx: [[2, 'water', 4, 0.86, 0.66]]
  },

  // a back foot at an itch
  scratch: {
    frames: ['sit_0', 'scratch_0', 'scratch_1', 'scratch_0', 'scratch_1', 'scratch_0', 'scratch_1', 'sit_0'],
    durations: [400, 110, 110, 110, 110, 110, 110, 500],
    loop: false,
    next: 'idle'
  },

  // the wet-dog shake-off
  shake: {
    frames: ['shake_0', 'shake_1', 'shake_0', 'shake_1', 'shake_0', 'shake_1', 'shake_0', 'shake_1', 'shake_2'],
    durations: [70, 70, 70, 70, 70, 70, 70, 70, 420],
    loop: false,
    next: 'idle',
    fx: [[1, 'sweat', 2, 0.2, 0.5], [3, 'sweat', 2, 0.8, 0.5], [6, 'sweat', 1, 0.3, 0.45]]
  },

  // over onto his back, paws in the air
  roll: {
    frames: ['getup_1', 'roll_0', 'roll_1', 'roll_0', 'roll_1', 'roll_0', 'roll_1', 'getup_2'],
    durations: [200, 260, 260, 260, 260, 260, 260, 260],
    loop: false,
    next: 'idle'
  },

  sniff: {
    frames: ['sniff_0', 'sniff_1', 'sniff_0', 'sniff_1', 'sniff_0', 'sniff_1', 'sniff_2'],
    durations: [300, 300, 300, 300, 300, 300, 700],
    loop: false,
    next: 'idle',
    fx: [[6, 'sparkle', 2, 0.82, 0.4]]
  },

  // legs tucked away, perfectly content
  loaf: {
    frames: ['loaf_0', 'loaf_1', 'loaf_0', 'loaf_1'],
    durations: [1400, 400, 1600, 2000],
    loop: false,
    next: 'idle'
  },

  bounce: {
    frames: ['bounce_0', 'bounce_1', 'bounce_2', 'bounce_1', 'bounce_0', 'bounce_1', 'bounce_2', 'bounce_1', 'bounce_0', 'land_3'],
    durations: [110, 110, 160, 110, 110, 110, 160, 110, 110, 220],
    loop: false,
    next: 'idle'
  },

  whistle: {
    frames: ['whistle_0', 'whistle_1', 'whistle_0', 'whistle_1', 'whistle_0', 'whistle_1'],
    durations: [420, 420, 420, 420, 420, 420],
    loop: false,
    next: 'idle',
    fx: [[0, 'note', 1, 0.82, 0.38], [2, 'note', 1, 0.82, 0.38], [4, 'note', 1, 0.82, 0.38]]
  },

  // at night, sitting up looking at the stars
  stargaze: {
    frames: ['stargaze_0', 'stargaze_1', 'stargaze_0', 'stargaze_1'],
    durations: [1400, 1400, 1400, 1400],
    loop: false,
    next: 'idle',
    fx: [[0, 'sparkle', 2, 0.75, 0.08], [2, 'sparkle', 2, 0.6, 0.12]]
  },

  // turns round to face you and waves
  lookatyou: {
    frames: ['turn_0', 'lookatyou_0', 'lookatyou_1', 'lookatyou_2', 'lookatyou_1', 'lookatyou_2', 'lookatyou_0', 'turn_0'],
    durations: [120, 1100, 350, 180, 180, 180, 500, 120],
    loop: false,
    next: 'idle'
  },

  // a dramatic pirouette - grape's favourite
  twirl: {
    frames: ['twirl_0', 'twirl_1', 'twirl_2', 'twirl_3', 'twirl_0', 'twirl_1', 'twirl_2', 'twirl_3', 'proud_0'],
    durations: [160, 110, 110, 110, 110, 110, 110, 400, 500],
    loop: false,
    next: 'idle',
    fx: [[7, 'sparkle', 3, 0.5, 0.3]]
  },

  // bubblegum's signature: a bubble that gets out of hand
  gum: {
    frames: ['gum_0', 'gum_1', 'gum_2', 'gum_3', 'happy_2'],
    durations: [450, 450, 650, 350, 300],
    loop: false,
    next: 'idle',
    fx: [[3, 'bubble', 4, 0.82, 0.62]]
  },

  /* ---- more emotions ---- */

  // tickled
  giggle: {
    frames: ['giggle_0', 'giggle_1', 'giggle_0', 'giggle_1', 'giggle_0', 'giggle_1', 'giggle_2', 'giggle_0', 'giggle_1', 'giggle_2'],
    durations: [90, 90, 90, 90, 90, 90, 120, 90, 90, 220],
    loop: false,
    next: 'idle',
    fx: [[0, 'heart', 1, 0.7, 0.2], [6, 'heart', 1, 0.6, 0.2]]
  },

  // right on the nose
  boop: {
    frames: ['boop_0', 'boop_1', 'boop_2'],
    durations: [170, 140, 520],
    loop: false,
    next: 'idle',
    fx: [[0, 'sparkle', 1, 0.92, 0.6]]
  },

  angry: {
    frames: ['angry_0', 'angry_1', 'angry_2', 'angry_1', 'angry_2', 'angry_0'],
    durations: [300, 180, 140, 180, 140, 600],
    loop: false,
    next: 'idle',
    fx: [[2, 'steam', 2, 0.55, 0.3], [2, 'dust', 2, 0.78, 0.97], [4, 'steam', 2, 0.55, 0.3]]
  },

  sad: {
    frames: ['sad_0', 'sad_1', 'sad_0', 'sad_1'],
    durations: [700, 700, 700, 700],
    loop: false,
    next: 'idle',
    fx: [[0, 'tear', 1, 0.66, 0.66], [2, 'tear', 1, 0.8, 0.66]]
  },

  scared: {
    frames: ['scared_0', 'scared_1', 'scared_0', 'scared_1', 'scared_0', 'scared_1', 'scared_0', 'scared_1', 'scared_0', 'scared_1'],
    durations: [60, 60, 60, 60, 60, 60, 60, 60, 60, 300],
    loop: false,
    next: 'idle',
    fx: [[0, 'sweat', 1, 0.4, 0.42]]
  },

  proud: {
    frames: ['proud_0', 'proud_1', 'proud_0'],
    durations: [400, 700, 500],
    loop: false,
    next: 'idle',
    fx: [[1, 'sparkle', 3, 0.5, 0.35]]
  },

  confused: {
    frames: ['confused_0', 'confused_1', 'confused_0'],
    durations: [700, 700, 500],
    loop: false,
    next: 'idle',
    fx: [[0, 'question', 1, 0.62, 0.14]]
  },

  excited: {
    frames: ['excited_0', 'excited_1', 'excited_0', 'excited_1', 'excited_0', 'happy_2'],
    durations: [90, 210, 90, 210, 90, 220],
    loop: false,
    next: 'idle',
    fx: [[1, 'sparkle', 2, 0.5, 0.3], [3, 'sparkle', 2, 0.5, 0.3]]
  },

  // shaken about too much while being carried
  queasy: {
    frames: ['queasy_0', 'queasy_1', 'queasy_0', 'queasy_1', 'queasy_0', 'queasy_1'],
    durations: [450, 450, 450, 450, 450, 450],
    loop: false,
    next: 'idle',
    fx: [[1, 'sweat', 1, 0.3, 0.35]]
  },

  // straight into the wall
  bonk: {
    frames: ['bonk_0', 'bonk_1'],
    durations: [180, 1000],
    loop: false,
    next: 'idle',
    fx: [[1, 'star', 4, 0.55, 0.36]]
  },

  /* ---- play ---- */

  // eyes on the pointer, the butt wiggle - and then the pounce
  pounce_ready: {
    frames: ['pounce_ready_0', 'pounce_ready_1', 'pounce_ready_2', 'pounce_ready_1', 'pounce_ready_2', 'pounce_ready_0'],
    durations: [220, 110, 110, 110, 110, 260],
    loop: false,
    next: 'pounce'
  },

  pounce: {
    frames: ['pounce_0', 'pounce_1', 'pounce_2', 'happy_2'],
    durations: [90, 280, 300, 250],
    loop: false,
    next: 'idle',
    fx: [[2, 'dust', 3, 0.5, 0.97]]
  },

  /* ---- keeping you company at the computer ---- */

  // typing along with you on a tiny laptop
  type_along: {
    frames: ['type_0', 'type_1', 'type_0', 'type_1', 'type_0', 'type_1', 'type_0'],
    durations: [140, 140, 140, 140, 700, 140, 140],
    loop: true,
    next: null
  },

  // ...in a hard hat, while you code
  code: {
    frames: ['code_0', 'code_1', 'code_0', 'code_1', 'code_0', 'code_1', 'code_0'],
    durations: [140, 140, 140, 140, 900, 140, 140],
    loop: true,
    next: null
  },

  // a sweatband for a Pomodoro
  focus: {
    frames: ['focus_0', 'focus_1'],
    durations: [900, 900],
    loop: true,
    next: null
  },

  // popcorn while you watch something
  popcorn: {
    frames: ['popcorn_0', 'popcorn_1', 'popcorn_0', 'popcorn_1'],
    durations: [1100, 280, 800, 280],
    loop: true,
    next: null,
    fx: [[1, 'crumb', 2, 0.72, 0.64]]
  },

  // headphones on, bopping to your music
  headbop: {
    frames: ['headbop_0', 'headbop_1'],
    durations: [260, 260],
    loop: true,
    next: null,
    fx: [[0, 'note', 1, 0.78, 0.2]]
  },

  // painting, beret on, while you design
  paint: {
    frames: ['paint_0', 'paint_1'],
    durations: [420, 420],
    loop: true,
    next: null,
    fx: [[1, 'sparkle', 1, 0.9, 0.72]]
  },

  // scribbling notes while you write
  scribble: {
    frames: ['scribble_0', 'scribble_1'],
    durations: [200, 200],
    loop: true,
    next: null
  },

  // holding up the post while you do your email
  mail: {
    frames: ['mail_0', 'mail_1'],
    durations: [700, 700],
    loop: true,
    next: null
  },

  // a gamepad of his own
  gamepad: {
    frames: ['gamepad_0', 'gamepad_1', 'gamepad_0', 'gamepad_1', 'gamepad_0'],
    durations: [150, 150, 150, 150, 700],
    loop: true,
    next: null
  }
};

/**
 * Particle cues: [frameIndex, kind, count, x, y]. x and y are fractions of
 * the 64x64 sprite box in its own right-facing frame; the renderer mirrors
 * them when Pip faces left and fires each cue once, as its frame starts.
 */
function cuesAt(name, index) {
  const clip = CLIPS[name];
  if (!clip || !clip.fx) return [];
  return clip.fx.filter((cue) => cue[0] === index);
}

/** Total run time of a clip in ms. */
function clipDuration(name) {
  const clip = CLIPS[name];
  if (!clip) return 0;
  return clip.durations.reduce((a, b) => a + b, 0);
}

/**
 * Which frame of a clip is showing after `elapsed` ms.
 * Returns {frame, done} - `done` is true once a non-looping clip has run out.
 */
function frameAt(name, elapsed) {
  const clip = CLIPS[name];
  if (!clip) return { frame: null, done: true };
  const total = clipDuration(name);
  let t = elapsed;
  const last = clip.frames.length - 1;
  if (clip.loop) {
    t = total > 0 ? elapsed % total : 0;
  } else if (elapsed >= total) {
    return { frame: clip.frames[last], done: true, index: last };
  }
  for (let i = 0; i < clip.frames.length; i++) {
    t -= clip.durations[i];
    if (t < 0) return { frame: clip.frames[i], done: false, index: i };
  }
  return { frame: clip.frames[last], done: !clip.loop, index: last };
}

const CLIP_NAMES = Object.keys(CLIPS);

const Animations = { CLIPS, CLIP_NAMES, clipDuration, frameAt, cuesAt };

if (typeof window !== 'undefined') {
  window.Pip = window.Pip || {};
  window.Pip.Animations = Animations;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Animations;
}
