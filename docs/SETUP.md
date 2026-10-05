# Setting up Pip on Windows, macOS and Linux

Pip is built for Windows. It is an Electron app, so the same code also
starts on macOS and Linux, but nobody has used it there day to day, and a few
of the things that make Pip feel like a desktop pet behave differently. This
guide says how to get him running on each, and is honest about what you
should expect.

## At a glance

| | Windows 10/11 (x64) | macOS | Linux (X11) | Linux (Wayland) |
|---|---|---|---|---|
| Run from source | Yes | Should work, untested | Yes, see below | Only through XWayland |
| Installer | Yes, you build it | No | No | No |
| Supported | **Yes** | No | No | No |

"Yes, see below" for Linux means the smoke test (`npm run smoke`) passes on
Linux under a virtual X display: Pip starts, draws every animation in every
flavour and opens the settings window. That proves he runs, not that the
transparent, click-through overlay behaves on a real Linux desktop.

There are no published downloads yet, so whichever system you are on, you
start from the source code.

## Two things to know first

**Running from source is always dev mode.** Pip treats any copy that has not
been packaged into an installer as a development build, so `npm start` and
`npm run dev` behave the same: every work timer is divided by 60 (a 25-minute
Pomodoro takes 25 seconds), idle behaviours are much more frequent, the menus
gain a Debug panel, and his settings live in a separate `Pip-dev` folder.
That is great for watching him, but not for living with him. The only way to
run Pip at real speed today is the Windows installer or portable build.

**You need Node.js 22 or newer and Git.** Nothing else. Electron is
installed by `npm install`, and it downloads its own browser binary the first
time you run Pip, so the first launch pauses for a moment and needs an
internet connection.

---

## Windows

This is the supported platform. Everything in the README applies.

### 1. Install Node.js and Git

The quickest way is `winget`, from PowerShell or Windows Terminal:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

Or download them from [nodejs.org](https://nodejs.org) (choose the LTS
version) and [git-scm.com](https://git-scm.com). Close and reopen your
terminal afterwards so it picks up the new commands, then check:

```powershell
node --version
git --version
```

`node --version` should print `v22` or higher.

### 2. Get the code

```powershell
git clone https://github.com/NXT549/pip.git
cd pip
npm install
```

npm may warn that `electron-winstaller` has an install script it has not run.
That is harmless: Pip does not use it.

### 3. Run Pip

```powershell
npm start
```

Pip drops in from the top of the screen and his icon appears in the system
tray (you may need to click the **^** arrow to see it). Right-click either
for the menu. Remember this is dev mode, so his timers run 60 times fast.

### 4. Build the installer (for real-speed Pip)

```powershell
npm run dist
```

This takes a few minutes and produces two files in `dist\`:

- `Pip-Setup-<version>.exe`, the installer. Run it and follow
  [Installing Pip](../README.md#installing-pip) in the README, including the
  SmartScreen **More info → Run anyway** step, since the build is unsigned.
- `Pip-Portable-<version>.exe`, a single file that runs without installing.

The installed copy runs at real speed, starts when you sign in (you can turn
that off in Settings), and keeps its data in `%APPDATA%\Pip`.

---

## macOS

**Not supported, and not tested.** Pip should start, but there is no
installer for macOS and nobody has checked how he behaves there.

### 1. Install Node.js and Git

Git comes with Apple's command line tools. If `git --version` asks you to
install them, say yes. For Node, either download the LTS installer from
[nodejs.org](https://nodejs.org), or use [Homebrew](https://brew.sh):

```bash
brew install node
```

Check that `node --version` prints `v22` or higher.

### 2. Get the code and run Pip

```bash
git clone https://github.com/NXT549/pip.git
cd pip
npm install
npm start
```

### What is different on a Mac

This is what the code leads you to expect, not what anyone has seen:

- Pip shows up in the **Dock** and in **⌘-Tab**, under the name "Electron".
  On Windows he never appears in Alt+Tab; nothing in Pip hides him from the
  Dock yet.
- His icon sits in the **menu bar**, in colour rather than as a monochrome
  template icon.
- He stays on the desktop he was started on and does not appear over
  full-screen apps.
- Notifications, if you turn them on, arrive from "Electron".
- `npm run dist` only builds the Windows installer. There is no `.dmg` or
  `.app`, so on a Mac Pip always runs in dev mode.

Settings and logs live in `~/Library/Application Support/Pip-dev`.

---

## Linux

**Not supported.** Pip starts and renders on Linux (the smoke test passes
under X11), but nobody has used him on a real Linux desktop, and there is no
Linux package.

### 1. Install Node.js and Git

Distribution Node packages are often older than 22, so
[nvm](https://github.com/nvm-sh/nvm) is the simplest route. Install nvm by
following its README, then:

```bash
sudo apt install git     # or dnf, pacman, zypper...
git clone https://github.com/NXT549/pip.git
cd pip
nvm install              # reads .nvmrc and installs Node 22
npm install
```

### 2. Run Pip

On an **X11** session:

```bash
npm start
```

On a **Wayland** session (the default on recent Ubuntu, Fedora and GNOME
desktops), recent Electron versions run as native Wayland apps, and Wayland
does not let an app place its own window, keep it above everything else, or
see the pointer outside it. Pip needs all three, so run him through XWayland
instead:

```bash
npm start -- --ozone-platform=x11
```

Not sure which you have? `echo $XDG_SESSION_TYPE` prints `x11` or `wayland`.

### What is different on Linux

- **Transparency needs a compositor.** Most desktops have one. If Pip has a
  black box around him, your window manager is not compositing; try
  **Settings → Behaviour → Compatibility mode** and restart Pip, or enable
  your desktop's compositor.
- **The tray icon may be missing.** GNOME shows no tray icons without the
  AppIndicator extension (`gnome-shell-extension-appindicator`, already on
  Ubuntu). Where the icon does show, left-clicking it may open the menu
  instead of hiding Pip. Right-clicking Pip himself always gives you the
  full menu.
- **Locking the screen does not send Pip to sleep straight away.** Electron
  does not report screen locks on Linux. He still curls up after five
  minutes without keyboard or mouse input.
- **Under Wayland, the idle timer may be wrong.** Through XWayland, Pip may
  only see input to other X11 apps, so he could fall asleep while you type
  in a native Wayland app. Picking him up wakes him.
- If Pip will not start and prints **"The SUID sandbox helper binary was
  found, but is not configured correctly"** (common on Ubuntu 24.04 and
  later), give Electron's sandbox helper the permissions it expects:

  ```bash
  sudo chown root node_modules/electron/dist/chrome-sandbox
  sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
  ```

  Do not work around it with `--no-sandbox`. Pip relies on the sandbox.

Settings and logs live in `~/.config/Pip-dev`.

---

## On every system

### Updating

```bash
git pull
npm install
```

Your settings and stats live outside the code folder, so updating never
touches them.

### Running the checks

```bash
npm test
```

The unit tests need only Node, not `npm install`, and run the same on every
system.

```bash
npm run smoke
```

The smoke test launches the real app, plays every animation and exits. It
needs a display. On a headless Linux machine, `xvfb-run -a npm run smoke`
gives it a virtual one.

### Where Pip keeps his things

| Copy | Windows | macOS | Linux |
|---|---|---|---|
| From source (`npm start`, `npm run dev`) | `%APPDATA%\Pip-dev` | `~/Library/Application Support/Pip-dev` | `~/.config/Pip-dev` |
| Smoke test | `%APPDATA%\Pip-smoke` | `~/Library/Application Support/Pip-smoke` | `~/.config/Pip-smoke` |
| Installed or portable | `%APPDATA%\Pip` | — | — |

Each folder holds `pip-data.json` (settings and stats) and a `logs` folder.
Quit Pip and delete the folder to start over from the first-run
introduction.
