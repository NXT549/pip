# Recipes: where to change what

## Who owns what

| Area | File | Test | Contract |
|---|---|---|---|
| windows, tray, polling, IPC glue | `main.js` | `main.test.js` (fake Electron) | §1, §8 |
| bridge allow-list | `preload.js` | `wiring.test.js` | §8 |
| which state wins | `src/main/brain.js` | `brain.test.js`, `liveness.test.js` | §4 |
| click / double / spree | `src/main/clicks.js` | `clicks.test.js` | §8 `pip:click` |
| pomodoro | `src/main/pomodoro.js` | `pomodoro.test.js` | §10 |
| water, work streak, breaks | `src/main/reminders.js` | `reminders.test.js` | §10 |
| mood 0–100 | `src/main/mood.js` | `mood.test.js` | — |
| settings on disk | `src/main/storage.js` | `storage.test.js` | §10 |
| colours / flavours | `src/renderer/palettes.js` | `palettes.test.js` | §3 |
| frames (generated) | `tools/frame-specs.js` → `sprites.js` | `sprites.test.js` | §3 |
| clips | `src/renderer/animations.js` | `sprites.test.js`, `wiring.test.js` | §5 |
| gravity, walls, throws | `src/renderer/physics.js` | `physics.test.js` | — |
| particles | `src/renderer/particles.js` | `wiring.test.js`, smoke | §6 |
| speech text | `src/renderer/lines.js` | `lines.test.js` | §7 |
| drawing, hit test, pointer | `src/renderer/renderer.js` | smoke | §9, §11 |
| settings UI | `settings/` | `main.test.js` | §8 settings |

## Common changes

**New animation.** Add poses to `tools/frame-specs.js` (preview with
`node tools/gen-sprites.js --preview name_0`), run `npm run sprites`, add the clip to
`animations.js`, then make something play it (brain or renderer). An unplayed clip
fails `wiring.test.js`. Add the name to the §5 list and to `REQUIRED_CLIPS` in
`test/sprites.test.js`.

**New reaction/state.** Put it in `brain.js` at the right spot in the priority
chain. Never reorder the chain. Pick a clip and add a `lines.js` situation if Pip
speaks.

**New IPC channel.** Add it to `INBOUND`/`OUTBOUND` in `preload.js`, then the
sender, the receiver (`ipcMain.on` in main) and the §8 table. `wiring.test.js`
catches a missing side, but the §8 table is up to you.

**New menu/tray action.** Add a `case` to `doAction` in `main.js`, to the action
list in `test/wiring.test.js`, and to the §8 action list. The tray, the right-click
menu and the settings window (`data-action=`) all go through `doAction`.

**New speech situation.** Give it 6+ variants in `lines.js` and at least one caller.
Add it to the §7 list and to `EXPECTED_SITUATIONS` in `test/lines.test.js`.

**New setting.** In `storage.js`, add it to `DEFAULTS` and to one of
`NUMBER_LIMITS`, `CHOICES` or `TOGGLES` (that is what makes it user-editable and
clamped). Then add the UI in `settings/` and a `storage.test.js` case for bad values.

**New flavour.** Add one entry to `FLAVORS` in `palettes.js`, overriding body keys only
(`B D L F H`).
