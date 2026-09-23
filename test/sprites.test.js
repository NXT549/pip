/*
 * sprites.test.js - the frame and clip data contract.
 *
 * These are the rules from ARCHITECTURE.md sections 3 and 5. Everything here
 * checks the generated data in src/renderer/sprites.js, not the authoring
 * tool, because that generated file is what actually ships.
 *
 *   node --test test/sprites.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const Sprites = require('../src/renderer/sprites.js');
const Animations = require('../src/renderer/animations.js');
const Palettes = require('../src/renderer/palettes.js');

const SIZE = Sprites.FRAME_SIZE;

/**
 * The clip list from ARCHITECTURE.md section 5, hard-coded on purpose: if
 * someone drops a clip from animations.js this test has to notice, and it
 * cannot notice by reading the same file it is checking.
 */
const REQUIRED_CLIPS = [
  // locomotion
  'idle', 'walk', 'run', 'climb', 'hang', 'fall', 'land', 'getup', 'dangle', 'dizzy',
  // idle behaviours
  'stretch', 'yawn', 'sit', 'chase', 'juggle', 'wave', 'trip', 'dance', 'read', 'nap',
  // emotions
  'happy', 'heart', 'blush', 'surprise', 'sulk', 'laugh', 'eat',
  // work states
  'drowsy', 'exhausted', 'thirsty', 'celebrating', 'onbreak', 'sleeping'
];

/** idle and walk carry the animation, so they need more frames than the rest. */
const MIN_FRAMES = { idle: 4, walk: 4 };
const MIN_FRAMES_DEFAULT = 2;

function countChar(frame, ch) {
  let n = 0;
  for (const row of frame) for (const c of row) if (c === ch) n++;
  return n;
}

/* ------------------------------------------------------------------ *
 * Frames
 * ------------------------------------------------------------------ */

test('there are frames at all', () => {
  assert.ok(Sprites.FRAME_NAMES.length > 0, 'no frames');
  assert.deepStrictEqual(Sprites.FRAME_NAMES, Object.keys(Sprites.FRAMES));
  assert.strictEqual(SIZE, 64);
  assert.strictEqual(Sprites.FOOT_ROW, 62);
});

test('every frame is 64 rows of 64 characters', () => {
  for (const name of Sprites.FRAME_NAMES) {
    const frame = Sprites.FRAMES[name];
    assert.ok(Array.isArray(frame), name + ' is not an array');
    assert.strictEqual(frame.length, SIZE, name + ' has ' + frame.length + ' rows');
    frame.forEach((row, r) => {
      assert.strictEqual(typeof row, 'string', name + ' row ' + r + ' is not a string');
      assert.strictEqual(row.length, SIZE, name + ' row ' + r + ' is ' + row.length + ' chars');
    });
  }
});

test('every character is a valid palette key', () => {
  for (const name of Sprites.FRAME_NAMES) {
    Sprites.FRAMES[name].forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        assert.ok(
          Palettes.isValidKey(row[c]),
          name + ' row ' + r + ' col ' + c + ' uses unknown key "' + row[c] + '"'
        );
      }
    });
  }
});

test('no frame is fully empty', () => {
  const blank = Palettes.TRANSPARENT.repeat(SIZE);
  for (const name of Sprites.FRAME_NAMES) {
    assert.ok(
      Sprites.FRAMES[name].some((row) => row !== blank),
      name + ' is completely transparent'
    );
  }
});

test('the gloss streak survives every pose', () => {
  for (const name of Sprites.FRAME_NAMES) {
    const n = countChar(Sprites.FRAMES[name], 'H');
    assert.ok(n >= 2, name + ' has ' + n + ' gloss pixels, needs at least 2');
  }
});

test('every frame is outlined', () => {
  for (const name of Sprites.FRAME_NAMES) {
    const n = countChar(Sprites.FRAMES[name], 'O');
    assert.ok(n >= 1, name + ' has no outline pixels');
  }
});

test('every frame has metadata the runtime can use', () => {
  for (const name of Sprites.FRAME_NAMES) {
    const m = Sprites.FRAME_META[name];
    assert.ok(m, name + ' has no FRAME_META entry');
    assert.ok(m.view === 'side' || m.view === 'front', name + ' view');
    assert.ok([0, 90, -90].indexOf(m.rotate) !== -1, name + ' rotate');
    for (const k of ['cx', 'cy', 'w', 'h']) assert.strictEqual(typeof m.body[k], 'number', name + ' body.' + k);
    const inside = (p) => p && p.r >= 0 && p.r < SIZE && p.c >= 0 && p.c < SIZE;
    assert.ok(inside(m.crown), name + ' crown is off the frame');
    assert.ok(inside(m.ends.back) && inside(m.ends.front), name + ' ends are off the frame');
    assert.strictEqual(typeof m.hat, 'boolean', name + ' hat');
    assert.ok(Array.isArray(m.eyes), name + ' eyes');
  }
  assert.deepStrictEqual(Object.keys(Sprites.FRAME_META), Sprites.FRAME_NAMES);
});

test('live eyes carry exactly what was under them', () => {
  // compose.js lifts an eye off by restoring these pixels, one pixel of
  // margin all round, so the box has to be exactly that size.
  const Compose = require('../src/renderer/compose.js');
  let live = 0;
  for (const name of Sprites.FRAME_NAMES) {
    for (const eye of Sprites.FRAME_META[name].eyes) {
      live++;
      assert.ok(Compose.LIVE_EYES[eye.style], name + ' records a non-live eye style ' + eye.style);
      const h = Compose.EYES[eye.style].length;
      assert.strictEqual(eye.under.length, h + 2, name + ' eye under height');
      for (const row of eye.under) assert.strictEqual(row.length, Compose.EYE_W + 2, name + ' eye under width');
    }
  }
  assert.ok(live > 50, 'hardly any frames have live eyes (' + live + ')');
});

test('every hat prop is flagged, so a type decoration never clashes with it', () => {
  for (const name of Sprites.FRAME_NAMES) {
    if (/_cap$/.test(name)) assert.strictEqual(Sprites.FRAME_META[name].hat, true, name + ' wears a nightcap but hat is false');
  }
});

/* ------------------------------------------------------------------ *
 * Clips
 * ------------------------------------------------------------------ */

test('every clip from ARCHITECTURE.md section 5 exists', () => {
  for (const name of REQUIRED_CLIPS) {
    assert.ok(Animations.CLIPS[name], 'missing clip: ' + name);
  }
  assert.deepStrictEqual(Animations.CLIP_NAMES, Object.keys(Animations.CLIPS));
});

test('every clip references frames that exist', () => {
  for (const name of Animations.CLIP_NAMES) {
    const clip = Animations.CLIPS[name];
    assert.ok(Array.isArray(clip.frames) && clip.frames.length > 0, name + ' has no frames');
    for (const frame of clip.frames) {
      assert.ok(Sprites.FRAMES[frame], 'clip ' + name + ' references missing frame ' + frame);
    }
  }
});

test('every clip has one positive duration per frame', () => {
  for (const name of Animations.CLIP_NAMES) {
    const clip = Animations.CLIPS[name];
    assert.ok(Array.isArray(clip.durations), name + ' has no durations');
    assert.strictEqual(
      clip.durations.length, clip.frames.length,
      name + ' has ' + clip.durations.length + ' durations for ' + clip.frames.length + ' frames'
    );
    clip.durations.forEach((ms, i) => {
      assert.strictEqual(typeof ms, 'number', name + ' duration ' + i + ' is not a number');
      assert.ok(ms > 0, name + ' duration ' + i + ' is ' + ms);
    });
  }
});

test('every clip that names a next clip names a real one', () => {
  for (const name of Animations.CLIP_NAMES) {
    const next = Animations.CLIPS[name].next;
    if (next === null || next === undefined) continue;
    assert.ok(Animations.CLIPS[next], 'clip ' + name + ' points at missing clip ' + next);
  }
});

test('clips have enough frames', () => {
  for (const name of Animations.CLIP_NAMES) {
    const min = MIN_FRAMES[name] === undefined ? MIN_FRAMES_DEFAULT : MIN_FRAMES[name];
    const n = Animations.CLIPS[name].frames.length;
    assert.ok(n >= min, name + ' has ' + n + ' frames, needs at least ' + min);
  }
});

test('looping clips do not also name a next clip', () => {
  for (const name of Animations.CLIP_NAMES) {
    const clip = Animations.CLIPS[name];
    assert.strictEqual(typeof clip.loop, 'boolean', name + ' has no loop flag');
    if (clip.loop) {
      assert.strictEqual(clip.next, null, name + ' loops forever, so next can never run');
    }
  }
});

test('clipDuration adds the frames up', () => {
  for (const name of Animations.CLIP_NAMES) {
    const clip = Animations.CLIPS[name];
    const total = clip.durations.reduce((a, b) => a + b, 0);
    assert.strictEqual(Animations.clipDuration(name), total, name);
  }
  assert.strictEqual(Animations.clipDuration('no-such-clip'), 0);
});

test('frameAt walks a clip and reports when it is done', () => {
  for (const name of Animations.CLIP_NAMES) {
    const clip = Animations.CLIPS[name];
    const first = Animations.frameAt(name, 0);
    assert.strictEqual(first.frame, clip.frames[0], name + ' does not start on its first frame');
    assert.strictEqual(first.done, false, name + ' is done before it starts');

    const total = Animations.clipDuration(name);
    const past = Animations.frameAt(name, total + 1000);
    if (clip.loop) assert.strictEqual(past.done, false, name + ' loops, so it is never done');
    else assert.strictEqual(past.done, true, name + ' never finishes');

    // every frame in the clip should be reachable at its own offset
    let t = 0;
    clip.frames.forEach((frame, i) => {
      assert.strictEqual(Animations.frameAt(name, t).frame, frame, name + ' frame ' + i);
      t += clip.durations[i];
    });
  }
});

test('the face never breaks the silhouette', () => {
  // The face is placed by offset, so on narrower poses a blush or mouth pixel
  // could land where the outline should be and punch a notch in Pip's edge -
  // it affected 27 of the frames before this was caught by eye. `W` is left
  // out on purpose: it doubles as the nightcap's bobble, which sits outside
  // the body by design.
  const FACE = ['E', 'K', 'M'];
  const broken = [];

  for (const name of Sprites.FRAME_NAMES) {
    const frame = Sprites.FRAMES[name];
    for (let r = 1; r < Sprites.FRAME_SIZE - 1; r++) {
      for (let c = 1; c < Sprites.FRAME_SIZE - 1; c++) {
        if (FACE.indexOf(frame[r][c]) === -1) continue;
        const exposed =
          frame[r][c + 1] === '.' || frame[r][c - 1] === '.' ||
          frame[r - 1][c] === '.' || frame[r + 1][c] === '.';
        if (exposed) broken.push(name + ' at ' + r + ',' + c + ' (' + frame[r][c] + ')');
      }
    }
  }

  assert.deepStrictEqual(broken, [],
    'these face pixels sit on the silhouette edge instead of inside it:\n  ' +
    broken.join('\n  '));
});
