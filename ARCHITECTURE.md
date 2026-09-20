# Pip — architecture contract

This file is the contract. Every module, function signature, IPC channel and
data format below is fixed. If you are working on one part of Pip and you need
something here to change, **say so and get it changed here first** — do not
quietly diverge.

---

## 1. Processes

**Main** decides *what Pip is doing*. It owns the windows, the tray, the
polling loops, the power events, persistence and all timing. Every
state-deciding module in `src/main/` is a pure CommonJS module with **no
Electron imports** — the clock, the RNG and all thresholds are injected. That
is what makes them directly testable with `node --test`.

**Renderer** decides *what that looks like*. Modules in `src/renderer/` are
plain scripts loaded with `<script>` tags. Every one of them ends with:

```js
if (typeof window !== 'undefined') { window.Pip = window.Pip || {}; window.Pip.X = X; }
if (typeof module !== 'undefined' && module.exports) { module.exports = X; }
```

so the same file works in the browser context and under `require()` in tests.

**Security**: `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`. `preload.js` is the only bridge and exposes exactly one
global, `window.pipBridge`, with a channel allow-list. Never use `remote`.

---

## 2. Module map

| File | Owns |
|---|---|
| `main.js` | lifecycle, overlay/settings/debug windows, tray, polling, power events, IPC, single instance, login item |
| `preload.js` | the `window.pipBridge` allow-list |
| `src/main/brain.js` | state priority resolution |
| `src/main/pomodoro.js` | work/break blocks |
| `src/main/reminders.js` | water reminders, activity + break accounting |
| `src/main/mood.js` | the hidden 0–100 mood value |
| `src/main/storage.js` | JSON persistence |
| `src/main/logger.js` | rotating file log |
| `src/renderer/palettes.js` | the palette and the flavours |
| `src/renderer/sprites.js` | every frame, as literal data (generated) |
| `src/renderer/animations.js` | clips |
| `src/renderer/physics.js` | gravity, landing, clamping, throwing |
| `src/renderer/particles.js` | the particle layer |
| `src/renderer/bubbles.js` | speech bubble layout and lifetime |
| `src/renderer/lines.js` | all speech text |
| `src/renderer/renderer.js` | drawing, hit testing, pointer, wiring |
| `tools/gen-sprites.js` | the sprite composition engine (authoring) |
| `tools/frame-specs.js` | the pose table (authoring) |
| `scripts/make-icons.js` | PNG/ICO generation |
| `scripts/smoke.js` | the smoke test |

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
`grape`, `licorice`.

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
- `land` — flattened and widened
- `stretch` — front legs forward, back end up
- `thirsty` — carrying the `cup` prop; `onbreak` — sipping from it

---

## 6. Particles

Separate layer, never interactive, drawn above Pip.

```js
Particles.create(kind, x, y, opts) -> particle
Particles.update(list, dt) -> list      // drops dead particles
Particles.draw(ctx, list, scale)
Particles.KINDS // ['heart','zzz','sparkle','confetti','sweat','water','star']
```

---

## 7. Speech bubbles

One bubble at a time. It follows Pip, stays fully on screen near the edges,
and fades after **4000 ms**. Non-essential chatter has a **120 000 ms**
cooldown. The same line never appears twice in a row.

```js
Bubbles.create(text, now) -> bubble
Bubbles.update(bubble, now) -> bubble|null
Bubbles.layout(bubble, pipRect, viewport, ctx) -> { x, y, w, h, tailX }
Bubbles.draw(ctx, bubble, layout)
Bubbles.LIFETIME_MS // 4000
```

```js
Lines.pick(situation, { mood, hour, last }) -> string
Lines.SITUATIONS // string[]
```

Every situation has **at least 6 variants**. Situations:

`onboarding_drag` `onboarding_menu` `onboarding_flavor` `onboarding_tray`
`good_morning` `welcome_back` `pet` `snack` `click` `startle` `annoyed`
`water_due` `water_logged` `pomodoro_done` `break_start` `break_over`
`drowsy` `exhausted` `late_night` `bored` `called` `dizzy` `low_mood`
`high_mood` `quiet_on` `battery_low` `on_battery`

`mood` is 0–100; `hour` is the local hour 0–23. `last` is the previously shown
line for that situation, which `pick` must not return again.

---

## 8. IPC channels

Only these names exist. `preload.js` enforces the list.

### main → renderer

| Channel | Payload |
|---|---|
| `pip:settings` | `{ flavor, scale, activityLevel, quiet, dev }` |
| `pip:bounds` | `{ left, top, right, bottom, width, height }` — overlay DIPs |
| `pip:state` | `{ state, clip, walkDir, walkSpeed, facing? }` |
| `pip:cursor` | `{ x, y, inside }` — overlay-relative DIPs |
| `pip:say` | `{ text, ms }` |
| `pip:particles` | `{ kind, count }` |
| `pip:pomodoro` | `{ running, phase, remainingMs, totalMs }` |
| `pip:goto` | `{ x }` — trot to this overlay x |
| `pip:reset` | *(none)* |

### renderer → main

| Channel | Payload |
|---|---|
| `pip:ready` | `{}` |
| `pip:set-interactive` | `{ interactive: boolean }` |
| `pip:grabbed` | `{}` |
| `pip:dropped` | `{ x, y }` |
| `pip:click` | `{ kind: 'single'\|'double', x, y }` |
| `pip:pet` | `{}` — cursor rested on Pip for ~1s |
| `pip:startle` | `{}` — fast jerky cursor movement nearby |
| `pip:climb` | `{ climbing: boolean }` |
| `pip:context-menu` | `{ x, y }` |
| `pip:error` | `{ message, stack }` |

### settings window

| Channel | Direction | Payload |
|---|---|---|
| `settings:get` | invoke | → `{ settings, today }` |
| `settings:set` | send | `{ patch }` — partial settings |
| `settings:action` | send | `{ action }` — see the action list below |
| `settings:update` | main → window | `{ settings, today }` |

### debug window (dev only)

| Channel | Direction | Payload |
|---|---|---|
| `debug:state` | main → window | `{ state, clip, mood, timers, flavor }` |
| `debug:force` | send | `{ state?, clip?, flavor?, fastForwardMs? }` |

### Actions

Shared by the tray menu, Pip's right-click menu and the settings window:

`pomodoro-toggle` `water` `feed` `call` `quiet` `toggle-visible`
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
| water | every 45 active minutes (configurable); daily count resets at local midnight |
| pomodoro | 25 / 5, long break 15 after every 4 (all configurable) |
| sleeping | you have been away ≥ 5 min |

**Dev mode** divides every duration by 60 and makes idle behaviours more
frequent. It uses a separate userData folder and registers no login item.

---

## 11. Rendering

- 30 fps via `requestAnimationFrame`; ~5 fps while sleeping; stopped while hidden
- no repaint when nothing changed
- work in DIPs everywhere; size the canvas by `devicePixelRatio` and set
  `imageSmoothingEnabled = false` so pixels stay crisp at 100 %–200 % scaling
- every frame is pre-rendered to an offscreen canvas at startup for the
  current flavour and scale, and re-rendered when either changes
