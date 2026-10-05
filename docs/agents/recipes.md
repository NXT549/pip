# Recipes: where to change what

## Who owns what

| Area | File | Test | Contract |
|---|---|---|---|
| windows, tray, polling, IPC glue | `src/main.js` | `main.test.js` (fake Electron) | §1, §8 |
| bridge allow-list | `src/preload.js` | `wiring.test.js` | §8 |
| which state wins | `src/main/brain.js` | `brain.test.js`, `liveness.test.js` | §4 |
| click / double / spree | `src/main/clicks.js` | `clicks.test.js` | §8 `pip:click` |
| pomodoro | `src/main/pomodoro.js` | `pomodoro.test.js` | §10 |
| water, work streak, breaks | `src/main/reminders.js` | `reminders.test.js` | §10 |
| mood 0–100 | `src/main/mood.js` | `mood.test.js` | — |
| settings on disk | `src/main/storage.js` | `storage.test.js` | §10 |
| seasonal flavours | `src/main/seasons.js` | `seasons.test.js`, `main.test.js` | §3, §10 |
| past days, streak calendar | `src/main/history.js` | `history.test.js`, `main.test.js` | §8 settings, §10 |
| colours / flavours | `src/renderer/palettes.js` | `palettes.test.js` | §3 |
| frames (generated) | `tools/frame-specs.js` → `sprites.js` | `sprites.test.js` | §3 |
| clips | `src/renderer/animations.js` | `sprites.test.js`, `wiring.test.js` | §5 |
| gravity, walls, throws | `src/renderer/physics.js` | `physics.test.js` | — |
| particles | `src/renderer/particles.js` | `wiring.test.js`, smoke | §6 |
| speech text | `src/renderer/lines.js` | `lines.test.js` | §7 |
| drawing, hit test, pointer | `src/renderer/renderer.js` | smoke | §9, §11 |
| settings UI | `src/settings/` | `storage.test.js`, `wiring.test.js`, smoke | §8 settings |

## Common changes

**New animation.** Add poses to `tools/frame-specs.js` (preview with
`node tools/gen-sprites.js --preview name_0`), run `npm run sprites`, add the clip to
`animations.js`, then make something play it. An idle behaviour goes in a
`pickBehavior()` pool and a reaction is a `react('clip')` call, both in `src/main.js`.
A state clip goes in `brain.js`, and a renderer-only clip in `renderer.js`.
`wiring.test.js` only checks that the name is quoted somewhere. Add the name to
the §5 list and to `REQUIRED_CLIPS` in `test/sprites.test.js`.

**New reaction.** Call `react('clip')` from the `src/main.js` code that triggers it.
`brain.js` does not change. A new *state* changes `STATE_PRIORITY`, so also update
§4, `brain.test.js` and `STATES` in `src/debug/debug.js`. Never reorder the chain.

**New IPC channel.** Add it to `INBOUND`/`OUTBOUND` in `src/preload.js`, then the
sender, the receiver (`ipcMain.on` in main) and the §8 table. `wiring.test.js`
catches a missing side, but the §8 table is up to you.

**New menu/tray action.** Add a `case` to `doAction` and a `buildMenu()` item in
`src/main.js` (or a `data-action=` button in `settings.html`, or both). Then add it to
the action list in `test/wiring.test.js` and to §8. The test only checks the `case`.

**New speech situation.** Give it 6+ variants in `lines.js` and at least one caller.
Add it to the §7 list and to `EXPECTED_SITUATIONS` in `test/lines.test.js`.

**New setting.** In `storage.js`, add it to `DEFAULTS` and to one of
`NUMBER_LIMITS`, `CHOICES` or `TOGGLES` (that is what makes it user-editable and
clamped). Then add the control to `settings.html` with `id` set to the key, and
the key to the matching `*_FIELDS` list in `settings.js` (only the checkboxes are tested), plus a
`storage.test.js` case for bad values.

**New flavour.** Add one entry to `FLAVORS` in `palettes.js` defining exactly
`B D L F H`, and add it to the §3 list. To hand it out for a season too, add a
row to `SEASONS` in `seasons.js` (no overlaps; `seasons.test.js` checks) and to
the §10 table.
