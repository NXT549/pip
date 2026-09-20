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
 */

'use strict';

const CLIPS = {
  // breathing bob with a blink woven in
  idle: {
    frames: ['idle_0', 'idle_1', 'idle_blink', 'idle_2', 'idle_3'],
    durations: [700, 700, 120, 700, 700],
    loop: true,
    next: null
  },


  // held in your hand: all four legs paddling at the air
  dangle: {
    frames: ['dangle_0', 'dangle_1'],
    durations: [140, 140],
    loop: true,
    next: null
  },

  // four-legged trot, diagonal pairs, body bobbing 1px per step
  walk: {
    frames: ['walk_0', 'walk_1', 'walk_2', 'walk_3'],
    durations: [130, 130, 130, 130],
    loop: true,
    next: null
  },

  // faster steps, body stretched a little longer
  run: {
    frames: ['run_0', 'run_1', 'run_2', 'run_3'],
    durations: [80, 80, 80, 80],
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
