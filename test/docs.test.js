/*
 * docs.test.js - the agent guide must not point at things that are gone.
 *
 * AGENTS.md and docs/agents/ tell agents which file, function, list, command
 * and ARCHITECTURE.md section to touch. Agents follow them literally, so a
 * rename that leaves a doc behind sends the next one looking for something
 * that does not exist. This checks that every name the docs quote - in
 * backticks or in a fenced block - still exists in the code itself, not just
 * in a comment or a test message. It cannot tell whether a description is
 * still *true*; that is on whoever changes the code.
 *
 * If it flags something that was never a Pip name (a built-in, a tool,
 * something the docs forbid), add it to NOT_NAMES. Don't drop the backticks.
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
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Quoted in the docs, but never Pip names: markers, tools, things to avoid. */
const NOT_NAMES = ['TODO', 'FIXME', 'HACK', 'xvfb-run', 'DISPLAY', 'HEAD', 'innerHTML'];

/** Platform APIs. `window.open` is the browser's to rename, not ours. */
const PLATFORM = /^(window|document|navigator|process|console|app|shell|Date|Math|JSON|Object|Array|Promise)\./;

/** npm's own commands, which are not package.json scripts. */
const NPM_BUILTINS = ['install', 'i', 'ci', 'ls', 'outdated', 'audit', 'update', 'pack'];

const FILE_EXT = /\.(js|md|html|css|json|nsh|ico|png|svg|ya?ml|txt|sh|ps1)$/i;

/** Every file in the repo, relative to ROOT. Folders end in '/'. */
function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (['node_modules', 'dist'].includes(entry.name)) continue;
    // Hidden folders include .git and .claude/worktrees, whose stale copies
    // of the code would otherwise keep a renamed name "present". .github holds
    // only CI and templates, which the docs may name.
    if (entry.isDirectory() && entry.name.startsWith('.') && entry.name !== '.github') continue;
    const rel = dir ? dir + '/' + entry.name : entry.name;
    if (entry.isDirectory()) out.push(rel + '/', ...listFiles(rel));
    else out.push(rel);
  }
  return out;
}

const FILES = listFiles('');
const IGNORED = read('.gitignore').split(/\r?\n/).map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

/** A comment keeps a renamed name alive long after the code moved on. */
const stripComments = (s) => s
  .replace(/^\s*\/\*[\s\S]*?\*\//gm, '')
  .replace(/(^|\s)\/\/.*$/gm, '$1')
  .replace(/<!--[\s\S]*?-->/g, '');

/** So do test titles and assertion messages. Test *code* still counts. */
const stripStrings = (s) =>
  s.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''");

const SOURCE = FILES
  .filter((f) => /\.(js|html)$/.test(f) && f !== 'test/docs.test.js')
  .map((f) => (f.startsWith('test/') ? stripStrings(stripComments(read(f))) : stripComments(read(f))))
  .concat(read('package.json'))
  .join('\n');

const DOCS = ['AGENTS.md'].concat(FILES.filter((f) => /^docs\/agents\/.*\.md$/i.test(f)));

/** [{ doc, token }]: every `backticked` span, and every line of a fenced block. */
const TOKENS = DOCS.flatMap((doc) => {
  const text = read(doc).replace(/\r\n/g, '\n');
  const FENCE = /^```[^\n]*\n([\s\S]*?)^```/gm;
  const fenced = [...text.matchAll(FENCE)]
    .flatMap((m) => m[1].split('\n').map((l) => l.trim()).filter(Boolean));
  const inline = [...text.replace(FENCE, '').matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
  return inline.concat(fenced).map((token) => ({ doc, token }));
});

test('the docs quote at least the names this test knows how to check', () => {
  // Guards the checks below against silently matching nothing.
  assert.ok(DOCS.length >= 4, 'expected AGENTS.md plus the docs/agents/ files');
  assert.ok(TOKENS.length > 50, 'found only ' + TOKENS.length + ' quoted names');
});

test('every file or folder the docs name exists', () => {
  const problems = [];
  for (const { doc, token } of TOKENS) {
    if (!/^[\w./*-]+$/.test(token) || !(FILE_EXT.test(token) || /\/\*?$/.test(token))) continue;
    // `test/*.test.js` is a glob, `src/main/*` a folder, a bare `brain.js` any file of that name.
    const want = token.replace(/^\.\//, '').replace(/\*$/, '');
    const glob = new RegExp((want.includes('/') ? '^' : '(^|/)') +
      escape(want).replace(/\\\*/g, '[^/]*') + '$');
    // Build and runtime output (`dist/`, `pip-data.json`) is never in a checkout.
    const named = IGNORED.includes(token) || SOURCE.includes("'" + want.replace(/\/$/, '') + "'");
    if (!named && !FILES.some((f) => glob.test(f))) {
      problems.push(doc + ': `' + token + '` does not exist');
    }
  }
  assert.deepStrictEqual(problems, []);
});

test('every function, constant and channel the docs name is still in the code', () => {
  const problems = [];
  for (const { doc, token } of TOKENS) {
    if (NOT_NAMES.includes(token) || PLATFORM.test(token) || FILE_EXT.test(token)) continue;
    let found = true;
    if (/^[A-Za-z_$][\w$]*(\.[\w$]+)*(\(\)|\('[^']*'\))?$/.test(token)) {
      // `doAction`, `STATE_PRIORITY`, `Animations.clipDuration`, `react('clip')`.
      // Plain lowercase words (`held`, `dt`, `main`) are concepts, not names.
      if (!token.endsWith(')') && !/[A-Z_.]/.test(token)) continue;
      // Every part of a dotted name must still be there, so a renamed module is caught too.
      found = token.replace(/\(.*\)$/, '').split('.')
        .every((part) => new RegExp('\\b' + escape(part) + '\\b').test(SOURCE));
    } else if (/^\*_[A-Z_]+$/.test(token)) {
      // `*_FIELDS`: at least one list with that suffix.
      found = new RegExp('\\b[A-Z]+' + escape(token.slice(1)) + '\\b').test(SOURCE);
    } else if (/^[a-z]+:[a-z-]+$/.test(token)) {
      // IPC channels: `pip:ready`, `settings:get`.
      found = new RegExp('[\'"]' + escape(token) + '[\'"]').test(SOURCE);
    } else if (/^[a-z]+(-[a-z]+)+$/.test(token)) {
      // Events, attributes and packages: `will-navigate`, `data-action`, `electron-builder`.
      found = new RegExp('(^|[^\\w-])' + escape(token) + '(?![\\w-])', 'm').test(SOURCE);
    }
    if (!found) {
      problems.push(doc + ': `' + token + '` is not in the code any more ' +
        '(if it never was a Pip name, add it to NOT_NAMES)');
    }
  }
  assert.deepStrictEqual(problems, []);
});

test('every npm command and tool flag the docs give exists', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  const problems = [];
  for (const { doc, token } of TOKENS) {
    const npm = token.match(/^npm (run )?([\w:-]+)$/);
    const builtin = npm && !npm[1] && NPM_BUILTINS.includes(npm[2]);
    if (npm && !builtin && !Object.hasOwn(scripts, npm[2])) {
      problems.push(doc + ': `' + token + '` is not a package.json script');
    }
    const node = token.match(/^node (?:\.\/)?(\S+\.js)((?: --[\w-]+)*)/);
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
