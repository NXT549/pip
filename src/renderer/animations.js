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
    next: null
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
    next: 'idle'
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
    next: 'idle'
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
    next: 'idle'
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
    next: null
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
  }
};

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
  if (clip.loop) {
    t = total > 0 ? elapsed % total : 0;
  } else if (elapsed >= total) {
    return { frame: clip.frames[clip.frames.length - 1], done: true };
  }
  for (let i = 0; i < clip.frames.length; i++) {
    t -= clip.durations[i];
    if (t < 0) return { frame: clip.frames[i], done: false };
  }
  return { frame: clip.frames[clip.frames.length - 1], done: !clip.loop };
}

const CLIP_NAMES = Object.keys(CLIPS);

const Animations = { CLIPS, CLIP_NAMES, clipDuration, frameAt };

if (typeof window !== 'undefined') {
  window.Pip = window.Pip || {};
  window.Pip.Animations = Animations;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Animations;
}
