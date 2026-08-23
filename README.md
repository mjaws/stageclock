# StageClock

A two-window, distraction-free stage timer built with [Tauri](https://tauri.app/) + vanilla TypeScript. One window is the operator's control panel; the other is a borderless "audience" display you put on a second monitor, projector, or confidence monitor during a talk, stream, or event.

## Features

### Three display modes

Switch modes from the control window's toolbar:

- **Clock** — current time of day, 12-hour format (e.g. `4:32`), with AM/PM and seconds shown as a smaller stacked readout beside the main time.
- **Countdown** — counts down from a duration you enter (`MM:SS` or `HH:MM:SS`), rounding up to the nearest whole second. The display recolors as time runs low:
  - Neutral above 60 seconds remaining
  - Amber/warning at 60 seconds or under
  - Red/danger (pulsing) at 10 seconds or under
- **Stopwatch** — counts up from zero as `MM:SS.CC` (hundredths), extending to `H:MM:SS.CC` past an hour.

Countdown and stopwatch share Start / Pause / Reset controls. All timing is computed from wall-clock timestamps rather than accumulated per render tick, so pausing/resuming, a throttled render loop, or a cross-window sync can't cause drift. A running countdown can also be retargeted to a new duration without resetting its elapsed time.

### Control window + audience popout

The main window is a **draft/live** editor, not a direct mirror of what the audience sees:

- Changing the mode, typing a duration, or hitting Start/Pause/Reset updates a local **draft** state and previews it in the control window's own display.
- Nothing reaches the audience screen until you click **Save**. The Save button lights up whenever the draft differs from what's currently live, so it's obvious you have unpublished changes.
- Saving publishes the draft to a separate **popout** window (opened via **Open popout**) over Tauri's event system — the popout only ever renders whatever was last saved.
- The control window shows an **Audience:** readout of exactly what's currently live (mode, value, running/paused), so the operator always knows what the audience is looking at without needing to glance at the second screen.

This lets you line up the next countdown or switch modes in advance without the audience seeing you fumble with the controls.

The popout window has its own remote controls from the main toolbar, enabled once it's open:

- **Fullscreen** — toggle the popout's fullscreen state.
- **Toggle toolbar** — toggle the popout's window chrome/decorations.
- **On top** — keep the popout always-on-top of other windows.

The popout can also be controlled directly if you click into it: double-click or **F11** toggles fullscreen, **Escape** exits fullscreen, and **F9** hides/shows its own window chrome.

### Toolbar / chrome toggle

In either window, press **F9** (or the **Hide toolbar** button in the control window) to hide its toolbar and window decorations, leaving just the time on screen. A brief on-screen hint reminds you F9 brings it back. While chrome is hidden, click-and-drag anywhere on the display moves the window (there's no title bar left to drag by).

### Responsive display sizing

The main time display measures its own rendered size against the available stage area and scales its font uniformly to fill a target proportion of that space — rather than a fixed size or hand-tuned viewport-percentage value. This means it automatically fits clock, countdown, and stopwatch text (which differ in width) without clipping, and re-fits live when the window is resized or the toolbar is hidden/shown, in both the control window and the audience popout.

## Development

```bash
npm install
npm run tauri dev
```

`tauri dev` launches the app pointed at the Vite dev server, so changes to `src/*.ts` and `src/styles.css` hot-reload instantly without rebuilding the executable.

## Building

```bash
npm run tauri build
```

Run from the project root. This compiles the frontend (`tsc && vite build`), embeds it into a release Rust binary, and produces:

- A standalone portable executable: `src-tauri/target/release/stageclock.exe` — no install step, no admin/UAC prompt, just run it.
- A Windows installer bundle (NSIS `.exe` and MSI `.msi`) under `src-tauri/target/release/bundle/`, for cases where a proper install (Start menu entry, uninstaller) is preferred.

## Requirements

The UI font (Montserrat) is currently loaded live from Google Fonts on startup. A machine with no internet access (or one that blocks that CDN) will fall back to a system sans-serif font instead — everything else works fully offline.

## Project structure

- `index.html` — control window shell: toolbar, mode buttons, timer controls, popout controls, and the `#display` element.
- `popout.html` — audience window shell: just the `#display` stage and the chrome-hint.
- `src/main.ts` — control window logic: draft/live state, save/publish, popout window lifecycle, mode switching, and the render loop.
- `src/popout.ts` — audience window logic: listens for published state and renders it; fullscreen/chrome/drag handling.
- `src/display.ts` — shared `DisplayView`/`computeFrame` used by both windows: pure frame computation, memoized DOM writes, and the auto-fit font sizing.
- `src/timer.ts` — `Timer` class (countdown/stopwatch state, snapshot/restore for cross-window sync), duration parsing/formatting, and the warn/danger color-band thresholds.
- `src/clock.ts` — formats the current time of day for clock mode.
- `src/protocol.ts` — event names and payload shape for the main ↔ popout IPC.
- `src/styles.css` — layout and visual styling, including the color bands and toolbar/hint animations.
- `src-tauri/` — the Tauri/Rust shell (window config, bundling targets, icons).
