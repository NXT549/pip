# Workflow

Every task follows the same six steps. Keep each one small.

## 1. Orient (cheap)

- `git status` and `git log --oneline -5`: know your branch and what changed recently.
- Find the owning module in the table in `recipes.md`. Read that file and its
  test, not the whole repo. `grep` before you `cat`.
- For anything touching IPC, states, clips or sprites, read the matching
  `ARCHITECTURE.md` section.

## 2. Plan

- State in one or two lines which files change and why.
- If the change breaks the contract in `ARCHITECTURE.md`, stop. Either find a way
  that fits it, or plan to edit the contract too and call that out.
- Bug fix? First write (or find) a test that fails on the current code.

## 3. Change

- Match the surrounding style: `'use strict'`, CommonJS, JSDoc on exports,
  comments that explain *why*.
- Keep it minimal. No drive-by refactors.
- Touched a pose? Edit `tools/frame-specs.js`, then run `npm run sprites`.
  Don't hand-edit `sprites.js` unless you also fold the change back.

## 4. Verify

```bash
npm test
```

- All green, every time. `wiring.test.js` and `scope.test.js` catch most
  "added X but forgot Y" mistakes. Read their failure message, since it names the gap.
- If you changed the renderer, `src/main.js` or windows and have a display, also
  run `npm run smoke`. As root, run it as a normal user:
  `su <user> -c 'xvfb-run -a node scripts/smoke.js'`. If you can't, say so.
- Re-read your own diff once, looking for anything a reviewer would reject.

## 5. Document

- Behaviour a user would notice, or a new test or check → `CHANGELOG.md`,
  under `## Unreleased` at the top (create it if missing; 1.2.0 is released),
  in a matching `###` group (Fixed / Hardening / Tests / Added).
- Contract changed → `ARCHITECTURE.md`.
- New extension pattern → one line in `recipes.md`.
- Anything in `AGENTS.md` or `docs/agents/` now wrong → fix it here.

## 6. Commit and hand off

- Work on the branch you were given. Never push to `main` directly.
- Subject: imperative and specific, about 70 chars, and say *what changed for Pip*
  (e.g. `Make a respawn say why Pip's position was invalid`).
- Body: the cause, the fix, and how it is tested. Plain prose, wrapped at 72 characters.
- `git push -u origin <branch>`. Open a PR only when asked. CI runs `npm test`
  on every PR and every push to `main`, so a red run there means something
  was missed locally. Its macOS job also runs the smoke test from source and
  against a built Pip.app, which is the only Mac check most changes get.
- Final report: what changed, test result (`# pass N / fail 0`), what you could not verify.
