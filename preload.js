/*
 * preload.js - the only bridge between Pip's windows and the main process.
 *
 * Runs sandboxed with context isolation on. Nothing from Node is exposed;
 * every channel below is explicit and one-directional by design.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/** main -> renderer channels the overlay may listen on. */
const INBOUND = [
  'pip:settings',   // {flavor, scale, activityLevel, quiet, dev}
  'pip:bounds',     // {left, right, top, bottom, width, height}
  'pip:state',      // {state, clip, facing, walkDir, walkSpeed}
  'pip:cursor',     // {x, y, inside}
  'pip:say',        // {text, ms}
  'pip:particles',  // {kind, count}
  'pip:pomodoro',   // {running, phase, remainingMs, totalMs}
  'pip:goto',       // {x} - trot to this overlay x
  'pip:reset'       // no payload - drop Pip in from the top again
];

/** renderer -> main channels the overlay may send on. */
const OUTBOUND = [
  'pip:ready',           // {} - first frame drawn
  'pip:set-interactive', // {interactive:boolean}
  'pip:grabbed',         // {}
  'pip:dropped',         // {x, y} in overlay DIPs
  'pip:click',           // {x, y} - main classifies the pattern
  'pip:pet',             // {} - cursor rested on Pip for ~1s
  'pip:startle',         // {} - fast jerky cursor movement nearby
  'pip:climb',           // {climbing:boolean}
  'pip:battery',         // {level:0..1, charging:boolean}
  'pip:context-menu',    // {x, y} in overlay DIPs
  'pip:error'            // {message, stack}
];

function on(channel, handler) {
  if (!INBOUND.includes(channel)) return () => {};
  const wrapped = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

function send(channel, payload) {
  if (!OUTBOUND.includes(channel)) return;
  ipcRenderer.send(channel, payload);
}

contextBridge.exposeInMainWorld('pipBridge', {
  on: on,
  send: send,
  channels: { inbound: INBOUND.slice(), outbound: OUTBOUND.slice() }
});

/* ------------------------------------------------------------------ *
 * Settings and debug windows
 *
 * Same preload, different surface. The overlay never touches these and the
 * settings window never touches pipBridge - each just ignores the other.
 * ------------------------------------------------------------------ */

contextBridge.exposeInMainWorld('pipSettings', {
  /** @returns {Promise<{settings, today}>} */
  get: () => ipcRenderer.invoke('settings:get'),
  /** @param {object} patch partial settings */
  set: (patch) => ipcRenderer.send('settings:set', { patch: patch }),
  /** @param {string} action one of the shared action names */
  action: (action) => ipcRenderer.send('settings:action', { action: action }),
  onUpdate: (handler) => {
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on('settings:update', wrapped);
    return () => ipcRenderer.removeListener('settings:update', wrapped);
  }
});

contextBridge.exposeInMainWorld('pipDebug', {
  onState: (handler) => {
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on('debug:state', wrapped);
    return () => ipcRenderer.removeListener('debug:state', wrapped);
  },
  force: (payload) => ipcRenderer.send('debug:force', payload)
});
