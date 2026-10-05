#!/usr/bin/env node
/*
 * smoke.js - does Pip actually run?
 *
 * Launches the real app with --smoke. The app starts normally, draws its
 * first frame, plays every animation clip in every flavour offscreen, opens
 * and closes the settings window, and exits 0. Anything else - a renderer
 * exception, a missing frame, a crash, or 20 seconds of silence - fails.
 *
 *   npm run smoke
 *
 * Give it the path to a packaged app's executable to smoke-test the build
 * instead of the source, as CI does with the Mac app:
 *
 *   node scripts/smoke.js dist/mac-universal/Pip.app/Contents/MacOS/Pip
 *
 * Anything else you pass is part of that command, so CI can also run the
 * Intel half of the universal Mac app through Rosetta:
 *
 *   node scripts/smoke.js arch -x86_64 dist/mac-universal/Pip.app/Contents/MacOS/Pip
 *
 * SMOKE_TIMEOUT_MS gives a slow start more than 20 seconds. CI needs it for
 * the Intel half of the Mac app, which Rosetta translates on its first
 * launch before Pip's own code runs at all.
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS) || 20000;

const packaged = process.argv.slice(2);
let command;
let args;

if (packaged.length) {
  // A path is resolved from where you ran this; a bare name, like `arch`,
  // is left alone for the OS to find.
  command = packaged[0].indexOf(path.sep) === -1
    ? packaged[0]
    : path.resolve(packaged[0]);
  args = packaged.slice(1).concat(['--smoke']);
} else {
  try {
    command = require('electron');
  } catch (err) {
    console.error('electron is not installed - run `npm install` first');
    process.exit(1);
  }
  if (typeof command !== 'string') {
    console.error('could not resolve the electron binary');
    process.exit(1);
  }
  args = [ROOT, '--smoke'];
}

const child = spawn(command, args, {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: Object.assign({}, process.env, { ELECTRON_ENABLE_LOGGING: '0' })
});

let out = '';
let err = '';
let finished = false;

child.stdout.on('data', (d) => { out += d.toString(); process.stdout.write(d); });
child.stderr.on('data', (d) => { err += d.toString(); });

const timer = setTimeout(() => {
  if (finished) return;
  finished = true;
  console.error('\nsmoke: timed out after ' + TIMEOUT_MS / 1000 + 's');
  if (err.trim()) console.error(err.trim().split('\n').slice(-20).join('\n'));
  try { child.kill(); } catch (e) { /* already gone */ }
  process.exit(1);
}, TIMEOUT_MS);

child.on('error', (e) => {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  console.error('smoke: could not launch electron: ' + e.message);
  process.exit(1);
});

child.on('exit', (code) => {
  if (finished) return;
  finished = true;
  clearTimeout(timer);

  if (code !== 0) {
    console.error('\nsmoke: app exited with code ' + code);
    if (err.trim()) console.error(err.trim().split('\n').slice(-20).join('\n'));
    process.exit(1);
  }
  if (out.indexOf('SMOKE FAIL') !== -1) {
    console.error('\nsmoke: the app reported a failure');
    process.exit(1);
  }
  if (out.indexOf('SMOKE OK') === -1) {
    console.error('\nsmoke: the app exited 0 but never reported success');
    process.exit(1);
  }
  console.log('smoke: ok');
  process.exit(0);
});
