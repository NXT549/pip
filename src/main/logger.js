/*
 * logger.js - a small rotating file log.
 *
 * Writes to <userData>/logs/pip.log and rolls over to pip.1.log at ~1MB.
 * Logging must never be the reason Pip falls over, so every operation here
 * swallows its own errors.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MAX_BYTES = 1024 * 1024;

let logDir = null;
let logFile = null;
let echo = false;

/**
 * @param {string} dir  directory to write logs into (created if missing)
 * @param {boolean} consoleEcho also print to stdout (dev mode)
 */
function init(dir, consoleEcho) {
  echo = !!consoleEcho;
  try {
    logDir = dir;
    fs.mkdirSync(logDir, { recursive: true });
    logFile = path.join(logDir, 'pip.log');
  } catch (err) {
    logDir = null;
    logFile = null;
  }
}

function rotateIfNeeded() {
  if (!logFile) return;
  try {
    const st = fs.statSync(logFile);
    if (st.size < MAX_BYTES) return;
    const old = path.join(logDir, 'pip.1.log');
    try { fs.unlinkSync(old); } catch (err) { /* no previous rotation */ }
    fs.renameSync(logFile, old);
  } catch (err) {
    // file does not exist yet, or is busy - either way, carry on
  }
}

function write(level, args) {
  const stamp = new Date().toISOString();
  const msg = args
    .map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'object') {
        try { return JSON.stringify(a); } catch (err) { return String(a); }
      }
      return String(a);
    })
    .join(' ');
  const line = stamp + ' [' + level + '] ' + msg + '\n';
  if (echo) process.stdout.write(line);
  if (!logFile) return;
  try {
    rotateIfNeeded();
    fs.appendFileSync(logFile, line, 'utf8');
  } catch (err) {
    // disk full, permissions, whatever - never propagate
  }
}

const logger = {
  init,
  info: (...a) => write('info', a),
  warn: (...a) => write('warn', a),
  error: (...a) => write('error', a),
  debug: (...a) => write('debug', a),
  get file() { return logFile; }
};

module.exports = logger;
