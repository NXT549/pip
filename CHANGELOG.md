# Changelog

## Unreleased

### Added

- A **Release** workflow builds the Windows installer, the portable build
  and the Mac `.dmg` and attaches them to a GitHub release, so the
  README's Download links work without anyone uploading files by hand. It
  runs when a release is published, or from the Actions tab for a release
  that already exists, and refuses a Mac build that would not run on both
  Apple silicon and Intel.

### Changed

- The README now opens with a **Download** section: one link for Windows,
  one for the Mac, and the portable build. Installing on each system,
  using Pip and troubleshooting come next, with Mac steps and folders
  alongside the Windows ones, and everything about working on the code
  moved under **For developers** at the end.
- `docs/SETUP.md` says that people who only want to use Pip can download
  him instead of building from source.

### Tests

- `test/docs.test.js` fails when the README's download links point at a
  release other than the version in `package.json`, so a version bump
  cannot leave them behind.

## 1.2.0

Pip dresses up for the season and remembers your last four weeks. The code
also moved under `src/`, and the repo gained CI, templates and a setup guide
for each system.

### Changed

- The app's own code now all lives under `src/`: `main.js`, `preload.js`,
  `settings/` and `debug/` moved to `src/main.js`, `src/preload.js`,
  `src/settings/` and `src/debug/`. Nothing about how Pip behaves changed.
- The settings window no longer says Windows: launch at login starts Pip
  "when you sign in to your computer", and the footer mentions the menu bar
  as well as the system tray.

### Added

- **Seasonal flavours.** Three new flavours, bubblegum, pumpkin and candy
  cane, pickable all year. With the new **Seasonal flavors** setting (on by
  default) Pip wears bubblegum for 1 to 14 February, pumpkin in October and
  candy cane in December, says so once, and changes back afterwards. A
  flavour you pick mid-season is kept, and turning the setting off changes
  him straight back.
- **A four-week streak calendar** in Settings. Pip now keeps the last 70 days
  of tallies instead of only today's, and draws them as a Monday-to-Sunday
  grid tinted in his flavour, with this week's Pomodoros, water and active
  days and your current day streak.
- CI on GitHub Actions runs `npm test` on every pull request and every push
  to `main`.
- Issue templates for bug reports and ideas, a pull request template with
  the checks from the agent workflow, and a `LICENSE` file for the MIT
  licence `package.json` already declared.
- `.nvmrc`, an `engines` field, `.editorconfig` and `.gitattributes`, so
  every checkout uses Node 22, two-space indents and LF line endings, even on
  Windows with `core.autocrlf` on.
- `AGENTS.md` and `docs/agents/`: a short guide for coding agents covering
  the workflow, which files each common change touches, and the bugs that
  have already shipped once. `CLAUDE.md` loads it for Claude Code.
- `docs/SETUP.md`: step-by-step setup for Windows, macOS and Linux, with
  what does and does not work on each. Windows and macOS are supported;
  Linux is not, and needs XWayland on Wayland desktops.
- **macOS support.** `npm run dist:mac` builds Pip.app in a `.dmg`, so a
  Mac can run Pip at real speed instead of only in dev mode. On a Mac he
  stays out of the Dock and ⌘-Tab, lives in the menu bar (any click on his
  icon opens his menu), follows you to every Space and over full-screen
  apps, treats Control-click as a right-click, brings his settings window
  to the front, and comes over when you open Pip.app again. His onboarding
  points at the menu bar instead of the tray.
- CI now also runs on macOS: the tests, the smoke test from source, builds
  of Pip.app for Apple silicon and Intel with a signature and Info.plist
  check, and the smoke test against each build (Intel under Rosetta), whose
  `.dmg`s it keeps for 14 days.
- `scripts/smoke.js` can smoke-test a packaged app: pass the path to its
  executable.

### Fixed

- A glass of water logged in the seconds after midnight went on the day
  before, and then the Today panel kept showing yesterday's numbers until
  the next midnight. The day now rolls over on the stored date itself.

### Tests

- `test/seasons.test.js` and `test/history.test.js` cover the season rules
  and the calendar, including week boundaries and daylight-saving changes.
  `main.test.js` runs Pip across midnight and across the end of October.
- `storage.test.js` checks that every toggle has a checkbox in the settings
  window, and that a hand-edited history loses only its bad rows.
- `test/docs.test.js` fails when the agent guide names a file, function,
  channel, npm script or `ARCHITECTURE.md` section that no longer exists.
- The smoke test counts flavour previews from the palette, so adding a
  flavour no longer fails it.
- Four `main.test.js` scenarios boot Pip as a Mac: Dock, Spaces, the menu
  bar click, the onboarding, and opening Pip.app again.

## 1.1.0

A review of 1.0.0 as it actually ran, starting from its own log. Every fix in
the first section, and most of the rest, has a test that fails on 1.0.0. The
renderer-only behaviour changes (walls, drop-in position, z's, cursor speed)
were checked by running the app.

### Fixed — things that were broken in the real app

- **Particles never appeared, and Pip could walk through walls.** The overlay's
  scripts share one global scope, and `bubbles.js` redefined both `clamp`
  (from `physics.js`) and `create` (from `particles.js`). Every heart, zzz,
  sparkle, confetti, sweat drop, water drop and star was secretly an invisible
  speech bubble that never expired. Once one existed, the render loop could
  never idle. `Physics.step` never clamped, so Pip slid off-screen until a
  respawn caught him. That is the `x 1283 right of 1216` in the 1.0.0 log.
  Every renderer module is now scope-wrapped.
- **One click left Pip dangling forever.** Mousedown reported a grab, but only
  a drop let go. So after any plain click, `held` (which outranks everything)
  stuck. Click, double-click and five-click reactions never showed, idle
  behaviours stopped, and he could not fall asleep. A grab is now reported only
  once Pip is actually lifted, and a click always lets go.
- **A renderer crash could leave the whole desktop unclickable.** After a
  reload, main never handed the mouse back if the overlay had been solid.
- **Dropping a file on Pip opened it in his place**, inside a transparent,
  always-on-top, full-screen window. Navigation is now blocked in every window.
- **"Quiet mode" never said so.** It switched itself on before its own
  announcement, then silenced it.

### Fixed — behaviour

- Reactions and idle behaviours last exactly as long as their clips. They used
  to leave Pip frozen in the idle pose for up to a few seconds afterwards, and
  a nap was cut off partway.
- Petting or clicking twice replays the reaction instead of being ignored.
- Dev mode no longer squeezes animations to 1/60 of their length (a 30 ms
  reaction). Only work timers are sped up.
- The 25% wall-climb chance was rolled on every frame, so Pip climbed every
  wall he touched. It is now rolled once per bump, and otherwise he turns round
  instead of standing nose to the wall.
- Pip always dropped in against the left wall at startup. He now drops in at
  the middle of the screen.
- A gentle set-down no longer makes Pip dizzy; only a throw or a real drop does.
  The stars now circle where he lands, not where he was let go.
- Being let go over another monitor drops Pip in under the pointer there.
- Waking from sleep, then locking, then unlocking greeted you at the lock
  screen and again after it. Now it greets you once, after you are in.
- Pip wakes within a second of you coming back, not up to ten.
- Sleeping Pip keeps puffing z's rather than one burst.
- Unplugging the charger no longer makes Pip sulk at cheerful lines.
- Spurious startles from mixing two cursor sources a millisecond apart.
- The tray menu still showed quiet mode as on after it had expired.
- Grabbing Pip could make him jump to a stale pointer position.
- Moving to a monitor with a different scale factor could leave him blurry.

### Hardening

- Settings are validated on load and from the settings window: numbers are
  clamped to the window's ranges, unknown choices fall back to defaults, and
  the window can no longer write runtime state such as mood or the Pomodoro.
- Pomodoro progress goes to the renderer once a second instead of ten times.
- Notification icons load from inside the packaged app.
- The streak is saved when Windows signs out or shuts down.
- The settings window's buttons say what they will do (End quiet mode,
  Show/Hide Pip).

### Tests

- `test/scope.test.js` loads the overlay's scripts the way the browser does.
- `test/main.test.js` runs the real `main.js` against a fake Electron on a
  mock clock.
- The smoke test now checks, in the real app, that every particle kind paints
  pixels and that the walls hold.
