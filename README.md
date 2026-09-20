# Pip

A tiny pixel-art jellybean who lives on your desktop. Pip trots about on four
stubby legs, climbs the edges of your screen, naps when you wander off, and
keeps a gentle eye on your breaks, your Pomodoros and whether you have had any
water lately.

He is a desktop pet, not a productivity nag. He will never block your screen,
never steal focus, and never appear in Alt+Tab.

---

## Installing Pip

1. Run **`Pip-Setup-1.0.0.exe`**.
2. Windows will almost certainly show a blue **"Windows protected your PC"**
   box. This is SmartScreen reacting to an installer that has not been
   code-signed — signing certificates cost money and this one is unsigned.
   Click **More info**, then **Run anyway**.
3. The installer needs no administrator rights: it installs for your user
   account only, adds a desktop and Start menu shortcut, and launches Pip when
   it finishes.
4. Pip appears in the system tray. He also starts automatically when you sign
   in to Windows — you can turn that off in Settings.

To remove Pip: **Settings → Apps → Installed apps → Pip → Uninstall**, the same
as any other Windows app.

There is also **`Pip-Portable-1.0.0.exe`**, a single self-contained file that
runs without installing anything. The portable build never registers itself to
launch at login.

### First run

Pip drops in from the top of the screen, lands with a squash, waves a front leg
and introduces himself over a few speech bubbles. After that he gets on with
his day.

---

## Using Pip

| You do | Pip does |
|---|---|
| Hover over him for a second | Leans into it, hearts pop |
| Click him | A happy reaction or a passing remark |
| Double-click him | Eats a snack |
| Click him five times fast | Puffs up and scoots off in a huff |
| Drag him | Dangles with all four legs paddling; throw him and he tumbles, lands and shakes off the dizziness |
| Right-click him | The full menu |
| Move the mouse sharply near him | Startles him |
| Wander off for five minutes | He plays alone for a while, then curls up and sleeps |

The tray icon's right-click menu and Pip's right-click menu are the same:
Start/Stop Pomodoro, I drank water, Feed Pip, Call Pip, Quiet mode for 1 hour,
Show/Hide Pip, Reset position, Settings, Quit. Left-clicking the tray icon
shows or hides him.

**Pip only quits from the Quit item.** Closing the settings window leaves him
running in the tray.

---

## Running from source

```bash
npm install
```
```bash
npm start
```

Dev mode divides every duration by 60 (a 25-minute Pomodoro takes 25 seconds),
makes idle behaviours far more frequent, uses a **separate settings folder** so
you do not pollute your real stats, registers no login item, and adds a
**Debug panel** to the menus:

```bash
npm run dev
```

The debug panel shows the current state, clip, mood and every timer, and lets
you force any state, clip or flavour, or push the clock forward ten minutes.

### The checks

```bash
npm test
```
```bash
npm run smoke
```

`npm test` runs the unit tests on Node's built-in runner — state priority, work
accumulation and break resets, Pomodoro transitions and restart recovery, water
scheduling and the midnight reset, mood, click patterns, physics, storage,
sprite validation and palette completeness.

`npm run smoke` launches the **real app** with `--smoke`: it draws its first
frame, plays every animation clip in every flavour offscreen, opens and closes
the settings window, and exits 0. Any exception, or twenty seconds of silence,
fails it. This is the check that proves Pip actually runs, as opposed to merely
compiling.

### Building the installers

```bash
npm run dist
```

Produces `dist/Pip-Setup-1.0.0.exe` and `dist/Pip-Portable-1.0.0.exe`. Icons are
regenerated automatically first.

---

## How Pip is put together

Electron, plain HTML/CSS/JavaScript. No framework, no bundler, and no native
modules — `electron` and `electron-builder` are the only dependencies, both dev
only.

**The main process decides what Pip is doing.** Everything in `src/main/` is a
pure CommonJS module with no Electron imports: the clock, the randomness and
all thresholds are passed in, which is what makes them directly testable.

**The renderer decides what that looks like.** Everything in `src/renderer/` is
a plain script that attaches to `window.Pip` *and* exports itself under
`module.exports`, so the same file runs in the browser context and under
`require()` in tests.

```
main.js            lifecycle, windows, tray, polling, power events, IPC
preload.js         the only bridge; an explicit channel allow-list
src/main/          brain, pomodoro, reminders, mood, clicks, storage, logger
src/renderer/      palettes, sprites, animations, physics, particles,
                   bubbles, lines, renderer
settings/          the settings window
debug/             the dev-mode debug panel
tools/             the sprite authoring tools
scripts/           icon generation, the smoke test
test/              the unit tests
```

`ARCHITECTURE.md` is the full contract: every exported signature, every IPC
channel and payload, the sprite format, and the state and clip name lists.

A few things worth knowing:

- **The overlay is one window covering the whole work area**, transparent and
  always on top. It ignores the mouse everywhere except Pip himself — the
  renderer hit-tests the cursor against the *alpha of the current sprite frame*
  and only then asks the main process to make the window solid.
- **Every timer is derived from a stored start timestamp**, never from counting
  ticks, so suspending your machine mid-Pomodoro does not corrupt it.
- **Activity is measured with `powerMonitor.getSystemIdleTime()`** polled every
  ten seconds. There are no keyloggers and no input hooks.
- **Frames are pre-rendered** to offscreen canvases at startup for the current
  flavour and scale, and re-rendered when either changes.

---

## Extending Pip

### Add an animation

1. Add the pose(s) to `tools/frame-specs.js`. A spec is a small object
   describing the body silhouette, the four leg lifts, the face and any props —
   the file documents the fields at the top.
2. Preview it as text while you tune:
   ```bash
   node tools/gen-sprites.js --preview my_frame_0
   ```
3. Regenerate the sprite data:
   ```bash
   npm run sprites
   ```
   This rewrites `src/renderer/sprites.js` as literal 32×32 character grids. You
   can also hand-edit that file directly — it is plain readable data, and it is
   what runs. Just fold hand edits back into `frame-specs.js` if you want to
   keep using the generator.
4. Add a clip to `src/renderer/animations.js`:
   ```js
   myclip: { frames: ['my_frame_0', 'my_frame_1'], durations: [200, 200], loop: false, next: 'idle' }
   ```
5. `npm test` will tell you if the frames are malformed, use an unknown palette
   key, lost the gloss highlight, or if the clip points at a frame that does not
   exist.

### Add a reaction

Reactions are decided in `src/main/brain.js`. The priority order at the top of
that file is the contract — `held > sleeping > celebrating > thirsty >
exhausted > drowsy > reaction > idle` — so put your case where it belongs in
that chain. If it is triggered by something the renderer notices (the pointer,
a collision), send it up on one of the `renderer → main` channels listed in
`ARCHITECTURE.md` §8 and add the channel to the allow-list in `preload.js`.

### Add a speech line

Open `src/renderer/lines.js` and add to the relevant situation's array. Every
situation needs at least six variants and a test enforces it. Lines can be
gated by mood and by hour, so a late-night or low-mood variant is just another
entry with a condition. Pip never repeats the same line twice in a row.

### Add a flavor

`src/renderer/palettes.js`, the `FLAVORS` object:

```js
bubblegum: { B: '#f06ec0', D: '#b23a86', L: '#ff9ad6', F: '#8f2668', H: '#ffffff' }
```

That is all. Flavours are palette swaps over the same frames, so it appears in
the settings picker with a live preview automatically. Only the body keys
(`B D L F H`) may be overridden — the outline, eyes, blush and mouth are shared
so Pip stays recognisably Pip.

---

## Troubleshooting

**Pip has a black box around him.**
Some graphics drivers cannot composite a transparent always-on-top window. Open
**Settings → Behaviour → Compatibility mode**, then quit and reopen Pip. That
turns off hardware acceleration on the next launch, which fixes it at a small
cost in CPU.

**Pip has disappeared.**
Use **Reset position** from the tray menu. He will drop back in from the top of
the primary display. This also covers the case where a monitor was unplugged
while he was standing on it.

**Pip falls asleep while I am watching a video.**
Pip measures activity with the system idle timer, which counts keyboard and
mouse input. Watching a video without touching anything looks exactly like
being away, so he curls up. Nudge the mouse and he will wake up and greet you.
If it bothers you, turn the activity level up, or hide him from the tray while
you watch.

**Pip is in the way.**
Drag him somewhere else, or **Hide Pip** from the tray. **Quiet mode for 1
hour** keeps him around but stops the wandering and the speech bubbles.

**Where are the logs?**
`%APPDATA%\Pip\logs\pip.log` (and `Pip-dev` when running `npm run dev`). They
rotate at about 1 MB.

---

## Five ways to grow Pip

1. **Friends.** Let a second jellybean spawn after a long streak — two Pips
   that notice each other, trot over, and sit together. Most of the work is
   already there: the brain is pure, so running two instances of it is mostly
   a matter of giving each body its own state.
2. **A toy box.** Pip already juggles a ball and reads a book. Let those become
   real objects you can drag onto the desktop and leave there — a ball he
   chases, a bed he sleeps in, a mug that fills when you log water.
3. **Focus-aware reactions.** Watch the foreground window title and let Pip
   respond to *what* you are doing rather than just whether you are doing it —
   a tiny hard hat when a build is running, a cheer when a long compile ends.
4. **A week view.** The Today panel is a single day. Keeping the daily rows and
   drawing a small pixel-art streak calendar would turn Pip from a reminder
   into something you can actually look back at.
5. **Seasonal flavours.** Flavours are four hex codes. A date-aware picker
   could quietly hand out a candy-cane Pip in December or a pumpkin one in
   October, without touching a single frame of art.

---

## A note on what Pip is not

Pip does not phone home, has no account, no telemetry and no network access of
any kind. Everything he knows lives in one JSON file in
`%APPDATA%\Pip\pip-data.json`, and you can delete it at any time.
