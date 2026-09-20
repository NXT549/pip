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
  'pip:state',      // {state, clip, facing, walkDir, ...}
  'pip:cursor',     // {x, y, inside}
  'pip:reset'       // no payload - drop Pip in from the top again
];

/** renderer -> main channels the overlay may send on. */
const OUTBOUND = [
  'pip:ready',           // {} - first frame drawn
  'pip:set-interactive', // {interactive:boolean}
  'pip:grabbed',         // {}
  'pip:dropped',         // {x, y} in overlay DIPs
  'pip:click',           // {kind:'single'|'double', x, y}
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
