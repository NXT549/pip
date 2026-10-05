# Pitfalls: each one has shipped before

1. **Shared global scope.** Overlay scripts are plain `<script>` tags. In
   1.0.0, a top-level `clamp` and `create` in bubbles.js silently replaced
   physics.js's and particles.js's. That broke every wall and every particle
   while all unit tests passed.
   Wrap the file in an IIFE and export via `window.Pip.X` / `module.exports`.

2. **`held` sticks.** `held` outranks everything. Anything that sets it needs
   a guaranteed path that clears it: mouseup, click, `pip:ready` after a crash.

3. **Units.** Physics and particles use `dt` in **seconds**, DIP/s. Bubbles
   and timers use **ms**. Bubble viewport is overlay-local (origin 0,0).

4. **Timers from timestamps.** Store a start time and derive the remaining
   time from it. Never count ticks, or sleep/suspend will corrupt it.

5. **Dev mode scales work timers only.** Never scale animation or reaction
   lengths by the dev factor.

6. **Reactions last exactly their clip** (`Animations.clipDuration`). The only
   exception is post-throw `dizzy` (2.6 s). Don't add fixed hold times.

7. **Order inside a feature matters.** Quiet mode once switched on *before*
   its own announcement and muted it. Announce first, then change state.

8. **Click-through.** Send `pip:set-interactive` only when the value changes,
   and hit-test the frame's alpha, not the bounding box. A stuck solid
   overlay blocks the user's whole desktop.

9. **Settings from disk are hostile.** Clamp numbers, default unknown
   enums, and tolerate a UTF-8 BOM. The settings window may only write `USER_KEYS`.

10. **Unit tests passing ≠ app working.** Bugs live in the glue. Prefer a
    `main.test.js` scenario over another isolated unit test when fixing
    behaviour, and run `npm run smoke` when you can.

11. **Navigation is blocked app-wide.** `will-navigate` and `window.open` are
    refused, and the overlay refuses dropped files. Don't build a feature on links or popups.

12. **Tests hard-code the contract lists.** Clips, situations, states and actions
    are copied into the tests on purpose, so update both sides.

13. **No `TODO`, `FIXME`, `HACK` or "not implemented" in source.** `wiring.test.js`
    fails on them. Finish the work, or leave it out.
