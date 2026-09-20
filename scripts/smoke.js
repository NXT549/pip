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
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TIMEOUT_MS = 20000;

let electronPath;
try {
  electronPath = require('electron');
} catch (err) {
  console.error('electron is not installed - run `npm install` first');
  process.exit(1);
}

if (typeof electronPath !== 'string') {
  console.error('could not resolve the electron binary');
  process.exit(1);
}

const child = spawn(electronPath, [ROOT, '--smoke'], {
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
