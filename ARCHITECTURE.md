# Pip — architecture contract

This file is the contract. Every module, function signature, IPC channel and
data format below is fixed. If you are working on one part of Pip and you need
something here to change, **say so and get it changed here first** — do not
quietly diverge.

---

## 1. Processes

**Main** decides *what Pip is doing*. It owns the windows, the tray, the
polling loops, the power events, persistence and all timing. The Electron
glue is `src/main.js`, the app's entry point. Every state-deciding module in
`src/main/` is a pure CommonJS module with **no Electron imports** — the
clock, the RNG and all thresholds are injected. That is what makes them
directly testable with `node --test`.

**Renderer** decides *what that looks like*. Modules in `src/renderer/` are
plain scripts loaded with `<script>` tags. Every one of them ends with:

```js
if (typeof window !== 'undefined') { window.Pip = window.Pip || {}; window.Pip.X = X; }
if (typeof module !== 'undefined' && module.exports) { module.exports = X; }
```

so the same file works in the browser context and under `require()` in tests.

**Every page script is wrapped in `(function () { ... })();` and declares
nothing at the top level.** Plain `<script>` tags share one global scope, so a
top-level `function clamp` in one file silently replaces the one in another.
That once broke every particle and every wall collision in the real app, while
the unit tests, which each `require()` a module into its own scope, all passed.
`test/scope.test.js` loads the overlay's scripts into one shared scope, the way
the browser does, and fails on any top-level declaration.

**Security**: `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`. `src/preload.js` is the only bridge and exposes exactly one
global, `window.pipBridge`, with a channel allow-list. Never use `remote`.

**Platforms**: Windows is the main target and macOS is supported. Anything
only one of them does lives in `src/main.js` behind `IS_MAC` or a
`process.platform` check, never in `src/main/`. On a Mac, Pip stays out of the
Dock and Cmd-Tab (`app.dock.hide()` from source, `LSUIElement` in the built
app), shows on every Space and over full-screen apps, opens his menu on any
click of the menu bar icon, and treats opening Pip.app again (`activate`) like
a second launch on Windows (`second-instance`).

---

## 2. Module map

| File | Owns |
|---|---|
| `src/main.js` | lifecycle, overlay/settings/debug windows, tray, polling, power events, IPC, single instance, login item |
| `src/preload.js` | the `window.pipBridge` allow-list |
| `src/main/brain.js` | state priority resolution |
| `src/main/pomodoro.js` | work/break blocks |
| `src/main/reminders.js` | water reminders, activity + break accounting |
| `src/main/mood.js` | the hidden 0–100 mood value |
| `src/main/clicks.js` | telling a click, double-click and poking spree apart |
| `src/main/storage.js` | JSON persistence |
| `src/main/seasons.js` | which seasonal flavour Pip wears, and when |
| `src/main/history.js` | past days, and the streak calendar built from them |
| `src/main/logger.js` | rotating file log |
| `src/renderer/palettes.js` | the palette and the flavours |
| `src/renderer/sprites.js` | every frame, as literal data (generated) |
| `src/renderer/animations.js` | clips |
| `src/renderer/physics.js` | gravity, landing, clamping, throwing |
| `src/renderer/particles.js` | the particle layer |
| `src/renderer/bubbles.js` | speech bubble layout and lifetime |
| `src/renderer/lines.js` | all speech text |
| `src/renderer/renderer.js` | drawing, hit testing, pointer, wiring |
| `src/settings/` | the settings window: `settings.html`, `settings.js`, `settings.css` |
| `src/debug/` | the dev-mode debug panel: `debug.html`, `debug.js` |
| `tools/gen-sprites.js` | the sprite composition engine (authoring) |
| `tools/frame-specs.js` | the pose table (authoring) |
| `scripts/make-icons.js` | PNG/ICO generation, and the 1024px PNG the Mac's `.icns` is built from |
| `scripts/smoke.js` | the smoke test, of the source or of a packaged app |

---

## 3. Sprite and palette format

### Palette — 12 entries, defined once in `palettes.js`

| Key | Meaning |
|---|---|
| `.` | transparent |
| `O` | outline |
| `B` | body |
| `D` | body dark (belly, underside) |
| `L` | body light |
| `H` | gloss highlight — the jellybean shine |
| `F` | far-leg shade |
| `E` | eye |
| `W` | eye white / prop highlight |
| `K` | blush |
| `M` | mouth |
| `A` | prop accent |

`BODY_KEYS = ['B','D','L','F','H']` — a flavour overrides exactly these and
nothing else. `STRUCTURAL_KEYS = ['O','E','W','K','M','A']` are shared by every
flavour, so Pip's face, outline and blush never change.

Flavours, in display order: `cherry` (default), `lime`, `blueberry`, `lemon`,
`grape`, `licorice`, then the seasonal ones: `bubblegum`, `pumpkin`, `candycane`.
Seasonal flavours are pickable all year. `src/main/seasons.js` also hands them
out for their season (see §10).

```js
Palettes.resolve(flavorName) -> { O:'#rrggbb', B:'#rrggbb', ... }  // 11 keys
Palettes.isValidKey(ch) -> boolean
Palettes.FLAVOR_NAMES, Palettes.BODY_KEYS, Palettes.STRUCTURAL_KEYS,
Palettes.DEFAULT_FLAVOR, Palettes.TRANSPARENT
```

### Frames

A frame is **an array of exactly 32 strings, each exactly 32 characters**.
Every character is a palette key; `.` is transparent. Frames are drawn
**facing right**; the renderer flips horizontally to face left.

```js
Sprites.FRAME_SIZE   // 32
Sprites.FRAMES       // { frameName: [32 strings] }
Sprites.FRAME_NAMES  // string[]
```

Rules every frame must satisfy (enforced by `test/sprites.test.js`):

1. exactly 32 rows of exactly 32 characters
2. every character is a valid palette key
3. not fully empty
4. contains at least two `H` pixels — the gloss streak is Pip's signature and
   must survive every pose
5. contains at least one `O` pixel — everything is outlined

Geometry conventions (from `tools/gen-sprites.js`):

- body ≈ 23 × 14 px, centred on column 16, a gentle 1px inward dip along the top
- near feet rest on row 30; the far pair land on row 29, which is what reads as depth
- `FOOT_OFFSET = 31` — the renderer sits Pip on the floor using this
- the face sits on the front (right) third; eyes are 3×3 with a `W` pixel in
  the upper-left corner

### Authoring

`tools/frame-specs.js` holds the pose table; `npm run sprites` runs it through
`tools/gen-sprites.js` and writes `src/renderer/sprites.js` as literal data.
That generated file is the runtime source of truth and is hand-editable. A
spec is:

```js
{
  body:  { cx, cy, w, h, dip, dipW },   // partial override of REST
  legs:  { mode:'stand'|'none', lift:[farBack, farFront, nearBack, nearFront],
           width, spread, dx:[4], floor },
  face:  { eyes, mouth, blush, dx, dy, hidden },
  props: [{ name, r, c }],
  gloss: { dr, dc } | 'none',
  rotate: 0 | 90 | -90
}
```

- **Leg order is always `[farBack, farFront, nearBack, nearFront]`.**
  A trot moves the diagonal pairs: `(farFront + nearBack)`, then `(farBack + nearFront)`.
- eye styles: `open wide closed half swirl sparkle squint`
- mouth styles: `smile open wavy cat flat none`
- props: `cup book nightcap ball bug battery snack`

---

## 4. States

`brain.js` resolves exactly one state per tick. **Priority, highest first —
this order is the contract:**

```
held > sleeping > celebrating > thirsty > exhausted > drowsy > reaction > idle
```

A lower-priority state never interrupts a higher one. Inside `idle`, a running
idle behaviour is left alone until it finishes.

A reaction or an idle behaviour lasts exactly as long as its clip
(`Animations.clipDuration`), so Pip never stands frozen in the idle pose
waiting for one to officially end. The only exception is `dizzy` after a
throw, which is held for 2.6 s because Pip is usually still in the air when
it starts.

```js
brain.STATE_PRIORITY // ['held','sleeping','celebrating','thirsty','exhausted','drowsy','reaction','idle']
brain.decide(input) -> { state, clip, walkDir, walkSpeed, wander }
brain.seededRng(seed) -> () => [0,1)
```

---

## 5. Animation clips

A clip is `{ frames: string[], durations: number[], loop: boolean, next: string|null }`.
`durations` has one entry per frame, in ms.

```js
Animations.CLIPS, Animations.CLIP_NAMES
Animations.clipDuration(name) -> ms
Animations.frameAt(name, elapsedMs) -> { frame, done }
```

**The full clip list.** `idle` and `walk` need ≥4 frames; everything else ≥2.

*Locomotion* — `idle` `walk` `run` `climb` `hang` `fall` `land` `getup` `dangle` `dizzy`

`fall` loops: it is a sustained state until impact, so it must not drop back
to `idle` mid-air.

*Idle behaviours* — `stretch` `yawn` `sit` `chase` `juggle` `wave` `trip` `dance` `read` `nap`

*Emotions* — `happy` `heart` `blush` `surprise` `sulk` `laugh` `eat`

*Work states* — `drowsy` `exhausted` `thirsty` `celebrating` `onbreak` `sleeping`

Pose notes that matter:
- `walk` — 4-leg trot, diagonal pairs, body bobs 1px per step
- `run` — faster steps, body stretched longer
- `dangle` — all four legs paddling at the air, body stretched tall
- `climb` — turned sideways (`rotate: ±90`), gripping with all four legs
- `sit` — back legs folded under, front legs straight
- `sleeping` / `nap` — curled into a tighter bean, legs tucked
- after 10pm Pip wears a nightcap. The sleepy poses ship a `_cap` twin
  (`sleeping_0_cap`, `nap_0_cap`, `drowsy_0_cap`, ...) and the renderer swaps
  `frame` for `frame + '_cap'` whenever one exists and `settings.nightcap` is set
- `land` — flattened and widened
- `stretch` — front legs forward, back end up
- `thirsty` — carrying the `cup` prop; `onbreak` — sipping from it

---

## 6. Particles

Separate layer, never interactive, drawn above Pip.

```js
Particles.KINDS   // ['heart','zzz','sparkle','confetti','sweat','water','star']
Particles.MAX_PARTICLES // 120, oldest dropped past the cap
Particles.create(kind, x, y, opts) -> particle
Particles.spawn(list, kind, x, y, count, opts) -> list   // mutates and returns
Particles.update(list, dt) -> list      // dt in SECONDS; returns a new array
Particles.draw(ctx, list, scale)
```

`dt` is in **seconds**, the same clock `Physics.step` uses. Particle lifetimes
are seconds and velocities are DIP/s. Bubbles, by contrast, work in ms.

---

## 7. Speech bubbles

One bubble at a time. It follows Pip, stays fully on screen near the edges,
and fades after **4000 ms**. Non-essential chatter has a **120 000 ms**
cooldown. The same line never appears twice in a row.

```js
Bubbles.LIFETIME_MS (4000)  FADE_MS (600)  CHATTER_COOLDOWN_MS (120000)
Bubbles.create(text, now, ms?) -> bubble   // ms overrides the default lifetime
Bubbles.update(bubble, now) -> bubble|null // refreshes bubble.alpha
Bubbles.measure(ctx, text, maxWidth) -> { lines, w, h }
Bubbles.layout(bubble, pipRect, viewport, ctx) -> { x, y, w, h, tailX, tailY, above, lines, alpha }
Bubbles.draw(ctx, bubble, layout)
```

`viewport` is `{width, height}` in **overlay-local DIPs** - the origin is
treated as (0,0), so pass the overlay's size, not the raw `pip:bounds`.

```js
Lines.pick(situation, { mood, hour, last, rng }) -> string   // '' if unknown
Lines.SITUATIONS // string[]
Lines.variants(situation) -> string[]
```

Every situation has **at least 6 variants**. Situations:

`onboarding_drag` `onboarding_menu` `onboarding_flavor` `onboarding_tray`
`onboarding_menubar` (said instead of `onboarding_tray` on a Mac)
`good_morning` `welcome_back` `pet` `snack` `click` `startle` `annoyed`
`water_due` `water_logged` `water_goal` `pomodoro_done` `break_start` `break_over`
`drowsy` `exhausted` `late_night` `bored` `called` `dizzy` `low_mood`
`high_mood` `quiet_on` `season_start` `battery_low` `on_battery`

`mood` is 0–100; `hour` is the local hour 0–23. `last` is the previously shown
line for that situation, which `pick` must not return again.

---

## 8. IPC channels

Only these names exist. `src/preload.js` enforces the list.

### main → renderer

| Channel | Payload |
|---|---|
| `pip:settings` | `{ flavor, scale, activityLevel, quiet, nightcap, dev }` |
| `pip:bounds` | `{ left, top, right, bottom, width, height }` — overlay DIPs |
| `pip:state` | `{ state, clip, walkDir, walkSpeed, seq }` — `seq` is non-zero for a reaction or behaviour and changes whenever a new one starts, so the renderer replays a repeated clip from its first frame |
| `pip:cursor` | `{ x, y, inside }` — overlay-relative DIPs |
| `pip:say` | `{ text, ms }` |
| `pip:particles` | `{ kind, count }` |
| `pip:pomodoro` | `{ running, phase, remainingMs, totalMs }` |
| `pip:goto` | `{ x }` — trot to this overlay x; `x: null` cancels |
| `pip:reset` | *(none)*, or `{ x }` — drop in from the top, at `x` when given |

### renderer → main

| Channel | Payload |
|---|---|
| `pip:ready` | `{}` — main answers by making the overlay click-through, clearing `held`, and resending the full state |
| `pip:set-interactive` | `{ interactive: boolean }` |
| `pip:grabbed` | `{}` — sent once the pointer has actually moved Pip, never on mousedown alone |
| `pip:dropped` | `{ x, y, speed, height }` — throw speed in DIP/s and height above the floor in DIPs; only a rough drop makes Pip dizzy |
| `pip:click` | `{ x, y }` — one message per physical click; main classifies the pattern via `clicks.js`. A click also clears `held` |
| `pip:pet` | `{}` — cursor rested on Pip for ~1s |
| `pip:startle` | `{}` — fast jerky cursor movement nearby |
| `pip:climb` | `{ climbing: boolean }` |
| `pip:battery` | `{ level: 0..1, charging: boolean }` — Electron cannot read this, so the renderer reports it |
| `pip:context-menu` | `{ x, y }` |
| `pip:error` | `{ message, stack }` |

### settings window

| Channel | Direction | Payload |
|---|---|---|
| `settings:get` | invoke | → `{ settings, today, history, pomodoroRunning, pomodoro, quiet, hidden }` — `history` is `history.summarize()`: `{ days, week, streak }`, see §10; `pomodoro` is the `pip:pomodoro` payload, from which the window counts down on its own |
| `settings:set` | send | `{ patch }` — partial settings. Main keeps only the user-editable keys (`storage.USER_KEYS`) and clamps every value (`storage.cleanPatch`) |
| `settings:action` | send | `{ action }` — see the action list below |
| `settings:update` | main → window | same shape as `settings:get` |

### debug window (dev only)

| Channel | Direction | Payload |
|---|---|---|
| `debug:state` | main → window | `{ state, clip, mood, timers, flavor }` |
| `debug:force` | send | `{ state?, clip?, flavor?, fastForwardMs? }` |

### Actions

Shared by the tray menu, Pip's right-click menu and the settings window:

`pomodoro-toggle` `pomodoro-skip` `water` `feed` `call` `quiet` `toggle-visible`
`reset-position` `settings` `debug` `quit`

---

## 9. Click-through

The overlay covers the whole work area, so it must be transparent to the
mouse everywhere except Pip himself.

1. Main sets `setIgnoreMouseEvents(true, { forward: true })` at startup.
   `forward` keeps mousemove flowing to the renderer.
2. On every mousemove the renderer hit-tests the cursor against the **alpha of
   the current frame** — it indexes `Sprites.FRAMES[frame][row][col]` directly,
   accounting for facing and squash. Not the bounding box.
3. When the answer changes it sends `pip:set-interactive`. Only on change.
4. During a drag the renderer keeps capturing until mouseup.

Bubbles, particles and the progress ring are never interactive — they are
drawn but never hit-tested.

---

## 10. Timing

**Every timer derives from a stored start timestamp.** Nothing counts
intervals, so system sleep can never skew a Pomodoro or a work streak.

| Thing | Rule |
|---|---|
| activity | `powerMonitor.getSystemIdleTime()` every 10 s. No hooks, no keyloggers. |
| break | idle ≥ 5 min, `suspend`, or `lock-screen` — resets continuous work |
| drowsy | 50 min of continuous work (configurable) |
| exhausted | 90 min (configurable) |
| water | every 45 active minutes (configurable); daily count resets at local midnight. The glass that reaches `waterGoal` (8, 0 for none) is celebrated. While Pip is hidden, the reminder is also a notification |
| pomodoro | 25 / 5, long break 15 after every 4 (all configurable). `pomodoro-skip` ends a break early and starts the next work block now; it never skips work |
| sleeping | you have been away ≥ 5 min |
| day roll | at local midnight `today` is filed into `history` (kept 70 days) and reset |
| seasons | Valentine's (1–14 Feb) `bubblegum`, October `pumpkin`, December `candycane` |

**History.** `history` in `pip-data.json` is a list of finished days,
`{ date, pomodoros, water, longestStreakMs }`, oldest first. Empty days are not
stored. The settings window's calendar is four Monday-to-Sunday weeks ending
with this one. A day *counts* (lights up, keeps the streak) with at least one
finished Pomodoro or one glass of water; its brightness is
`1 + min(3, floor(pomodoros / 2))`. The streak runs back from today, or from
yesterday while today has nothing yet.

```js
history.archive(list, today) -> list
history.clean(list) -> list            // repairs rows loaded from disk
history.level(day) -> 0..4
history.summarize(list, today, now) -> { days, week: { pomodoros, water, activeDays }, streak }
```

**Seasons.** With the `seasonal` setting on, the first day of a season
changes Pip into its flavour and remembers the one he wore in
`season: { key, flavor, previous }`. When it ends, or the setting goes off, he
changes back, but only if he is still wearing the seasonal flavour: a flavour
the user picked mid-season is kept. `key` carries the year, so a season is
handed out once per year. Main checks at startup and at every day roll, and
says `season_start` once Pip is awake and onboarded.

```js
seasons.seasonAt(ts) -> { name, flavor, from, to } | null
seasons.step({ flavor, seasonal, season }, ts) -> { flavor, season, event: 'start'|'end'|null }
```

**Dev mode** divides every *work* timer above by 60 and makes idle behaviours
more frequent. Animation lengths (reactions, behaviours, the chase) are never
scaled. A reaction squeezed to 30 ms is invisible, which defeats the point of
dev mode. It uses a separate userData folder and registers no login item.

Settings loaded from disk are repaired, not just type-checked. A number
outside the range the settings window allows is clamped, and an unknown
flavour, size or activity level falls back to its default.

---

## 11. Rendering

- 30 fps via `requestAnimationFrame`; ~5 fps while sleeping; stopped while hidden
- no repaint when nothing changed
- work in DIPs everywhere; size the canvas by `devicePixelRatio` and set
  `imageSmoothingEnabled = false` so pixels stay crisp at 100 %–200 % scaling
- every frame is pre-rendered to an offscreen canvas at startup for the
  current flavour and scale, and re-rendered when either changes
