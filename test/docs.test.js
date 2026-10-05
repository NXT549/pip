/*
 * docs.test.js - the agent guide must not point at things that are gone.
 *
 * AGENTS.md and docs/agents/ tell agents which file, function, list, command
 * and ARCHITECTURE.md section to touch. Agents follow them literally, so a
 * rename that leaves a doc behind sends the next one looking for something
 * that does not exist. This checks every name the docs quote in backticks
 * still exists. It cannot tell whether a description is still *true* - that
 * is on whoever changes the code.
 *
 *   node --test test/docs.test.js
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const DOCS = ['AGENTS.md'].concat(
  fs.readdirSync(path.join(ROOT, 'docs/agents'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => 'docs/agents/' + f)
);

/** Every file in the repo, relative to ROOT, minus what is never committed. */
function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist'].includes(entry.name)) continue;
    const rel = dir ? dir + '/' + entry.name : entry.name;
    if (entry.isDirectory()) out.push(rel + '/', ...listFiles(rel));
    else out.push(rel);
  }
  return out;
}

const FILES = listFiles('');
const SOURCE = FILES
  .filter((f) => /\.(js|html)$/.test(f) && f !== 'test/docs.test.js')
  .map(read)
  .join('\n');

/** [{ doc, token }] for every `backticked` span in the docs. */
const TOKENS = DOCS.flatMap((doc) =>
  [...read(doc).matchAll(/`([^`\n]+)`/g)].map((m) => ({ doc, token: m[1] }))
);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Words the docs quote that are banned markers, not names in the code. */
const NOT_NAMES = ['TODO', 'FIXME', 'HACK'];

test('the docs quote at least the names this test knows how to check', () => {
  // Guards the checks below against silently matching nothing.
  assert.ok(DOCS.length >= 4, 'expected AGENTS.md plus the docs/agents/ files');
  assert.ok(TOKENS.length > 50, 'found only ' + TOKENS.length + ' backticked names');
});

test('every file or folder the docs name exists', () => {
  const problems = [];
  for (const { doc, token } of TOKENS) {
    const isPath = /^[\w./*-]+$/.test(token) &&
      (/\.(js|md|html|css|json)$/.test(token) || token.endsWith('/'));
    if (!isPath) continue;
    // `src/main/*` means the folder; a bare `brain.js` means some file of that name.
    const want = token.replace(/\*$/, '');
    const found = want.includes('/')
      ? FILES.includes(want)
      : FILES.some((f) => f === want || f.endsWith('/' + want));
    if (!found) problems.push(doc + ': `' + token + '` does not exist');
  }
  assert.deepStrictEqual(problems, []);
});

test('every function, constant and channel the docs name is still in the code', () => {
  const problems = [];
  for (const { doc, token } of TOKENS) {
    let pattern = null;
    if (/^[A-Za-z_$][\w$]*(\.[\w$]+)*(\(\)|\('[^']*'\))?$/.test(token)) {
      // `doAction`, `STATE_PRIORITY`, `Animations.clipDuration`, `react('clip')`.
      // Plain lowercase words (`held`, `dt`, `main`) are concepts, not names.
      const isCall = token.endsWith(')');
      const name = token.replace(/\(.*\)$/, '').split('.').pop();
      if (!isCall && !/[A-Z_.]/.test(token)) continue;
      if (NOT_NAMES.includes(token)) continue;
      pattern = new RegExp('\\b' + escape(name) + '\\b');
    } else if (/^\*_[A-Z_]+$/.test(token)) {
      // `*_FIELDS` - at least one list by that suffix.
      pattern = new RegExp('\\b[A-Z]+' + escape(token.slice(1)) + '\\b');
    } else if (/^[a-z]+(:[a-z-]+|(-[a-z]+)+)$/.test(token)) {
      // IPC channels and event names: `pip:ready`, `will-navigate`.
      pattern = new RegExp('[\'"]' + escape(token) + '[\'"]');
    }
    if (pattern && !pattern.test(SOURCE)) {
      problems.push(doc + ': `' + token + '` is not in the source any more');
    }
  }
  assert.deepStrictEqual(problems, []);
});

test('every npm command and tool flag the docs give exists', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  const problems = [];
  for (const { doc, token } of TOKENS) {
    const npm = token.match(/^npm (?:run )?([\w:-]+)$/);
    if (npm && npm[1] !== 'install' && !scripts[npm[1]]) {
      problems.push(doc + ': `' + token + '` is not a package.json script');
    }
    const node = token.match(/^node (\S+\.js)((?: --[\w-]+)*)/);
    if (node) {
      if (!FILES.includes(node[1])) {
        problems.push(doc + ': `' + token + '` runs a file that does not exist');
      } else {
        for (const flag of node[2].trim().split(/\s+/).filter(Boolean)) {
          if (!read(node[1]).includes("'" + flag + "'")) {
            problems.push(doc + ': `' + token + '` uses ' + flag + ', which ' + node[1] + ' does not handle');
          }
        }
      }
    }
  }
  assert.deepStrictEqual(problems, []);
});

test('every ARCHITECTURE.md section the docs cite exists', () => {
  const sections = new Set(
    [...read('ARCHITECTURE.md').matchAll(/^## (\d+)\./gm)].map((m) => m[1])
  );
  const problems = [];
  for (const doc of DOCS) {
    for (const m of read(doc).matchAll(/§(\d+)/g)) {
      if (!sections.has(m[1])) problems.push(doc + ': §' + m[1] + ' is not a section of ARCHITECTURE.md');
    }
  }
  assert.deepStrictEqual(problems, []);
});
