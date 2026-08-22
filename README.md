# StageClock

A borderless/fullscreen windowed, distraction-free desktop clock/timer built with [Tauri](https://tauri.app/) + vanilla TypeScript. Designed to sit on a second monitor or projector during a talk, stream, or event — large tabular-nums display, minimal chrome, and a toolbar that hides itself out of the way when you don't need it.

## Features

### Three modes

Switch between modes with the buttons in the top toolbar:

- **Clock** — current time of day, 12-hour format (e.g. `4:32`), with AM/PM and seconds shown as a smaller stacked readout beside the main time.
- **Countdown** — counts down from a duration you enter (`MM:SS` or `HH:MM:SS`), rounding up to the nearest whole second as it ticks. The display changes color as time runs low:
  - Neutral while there's more than 60 seconds left
  - Amber/warning at 60 seconds or under
  - Red/danger at 10 seconds or under
- **Stopwatch** — counts up from zero in `MM:SS.CC` (hundredths of a second), extending to `H:MM:SS.CC` past an hour.

Countdown and stopwatch share the same Start / Pause / Reset controls. Timing is computed from wall-clock timestamps (`Date.now()` deltas), not accumulated per render tick, so pausing/resuming or a throttled render loop can't cause drift.

### Toolbar / chrome toggle

Press the **Hide toolbar** button (or **F9**) to hide the entire top toolbar and the window's title bar/decorations, leaving just the time on screen. A brief on-screen hint reminds you F9 brings it back. While the toolbar is hidden, click-and-drag anywhere on the display to move the window (since there's no title bar left to drag by).

### Responsive display sizing

The main time display scales with the window/viewport size (`vw`-based font sizing) so it stays large and legible at any window size, up to a fullscreen projector display. The stopwatch's extra centiseconds digits are accounted for with a slightly smaller scale than clock/countdown, so its wider text never overflows the window.

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

## Project structure

- `index.html` — app shell markup: toolbar, mode buttons, timer controls, and the `#display` element.
- `src/main.ts` — wires up DOM events, mode switching, the render loop, and the chrome-hide/drag behavior.
- `src/timer.ts` — `Timer` class (countdown/stopwatch state), duration parsing/formatting, and the warn/danger color-band thresholds.
- `src/clock.ts` — formats the current time of day for clock mode.
- `src/styles.css` — layout and visual styling, including the responsive display font sizing.
- `src-tauri/` — the Tauri/Rust shell (window config, bundling targets, icons).
