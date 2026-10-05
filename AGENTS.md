# Agent guide — start here

Pip is an Electron desktop pet (plain JS, no framework, no bundler). Main
process decides *what* Pip does; the renderer decides *how it looks*.

## Read order

1. This file.
2. [`docs/agents/workflow.md`](docs/agents/workflow.md): how every task runs, start to push.
3. [`docs/agents/recipes.md`](docs/agents/recipes.md): which files to touch for common changes.
4. [`docs/agents/pitfalls.md`](docs/agents/pitfalls.md): bugs that already shipped once. Don't repeat them.
5. `ARCHITECTURE.md`, **the contract**. Only read the section you need (§ numbers are in recipes.md).

Skip `README.md` unless you need the user-facing behaviour or the "Extending Pip" steps.

## Commands

| Command | What | Needs |
|---|---|---|
| `npm test` | all unit, wiring, scope, docs and main.js tests (~1 s) | Node 22, no install |
| `npm run smoke` | launches the real app and exercises it | `npm install` + a display (`xvfb-run -a` works), not root |
| `npm run sprites` | regenerate `src/renderer/sprites.js` | — |
| `npm run dev` | app with work timers ÷60 and the debug panel | same as smoke |

## Hard rules

- `npm test` must be green before every commit. Never skip, delete or weaken a test to get there.
- `ARCHITECTURE.md` is fixed. If a signature, IPC channel, state, clip name or
  format has to change, update that file **in the same commit** and say so.
- `src/main/*` never imports Electron. Clock, RNG and thresholds are injected.
- Renderer and page scripts: wrap everything in `(function () { ... })();`, with nothing at top level.
- Security settings stay: `contextIsolation`, `sandbox`, no `nodeIntegration`, no `remote`.
  Never add `--no-sandbox`, not even to make smoke run as root.
- No new runtime dependencies.
- Add a `CHANGELOG.md` entry for any user-visible change.
- These docs stay current: if your change makes anything here or in `docs/agents/`
  wrong, fix it in the same commit. `test/docs.test.js` catches renamed files,
  names, commands and § numbers, but not a description that is no longer true.
