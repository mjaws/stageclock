---
name: run-stageclock
description: Build, launch, and drive the stageclock Tauri desktop app on Windows — start it, click buttons, read DOM state, and take screenshots of the primary and popout windows via WebView2's CDP remote debugging port. Use for "run stageclock", "screenshot stageclock", "test the popout window", "verify a stageclock change".
---

Paths below are relative to the project root (`stageclock/`), not this
skill directory.

stageclock is a Tauri v2 desktop app (vanilla TS + Vite frontend, no
Rust commands) with **two windows**: the primary operator window and
a view-only "popout" audience window (`popout.html`). On Windows,
Tauri renders via **WebView2**, which is Chromium-based and exposes
the standard Chrome DevTools Protocol (CDP) when launched with
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>`.
That means it can be driven exactly like a headless Chromium page —
`Runtime.evaluate` to click/read/type, `Page.captureScreenshot` to see
it — with **no Electron-style IPC, no Playwright, no tmux, no xvfb**
needed. This is a plain Windows desktop, not a container, so none of
that Linux-container tooling applies or is necessary.

## Prerequisites

- Node (tested with v24) and npm on PATH.
- Rust/Cargo toolchain (already required to build the app at all).
- The debug binary must already be built once:
  ```
  cd src-tauri && cargo build
  ```
  (`driver.mjs launch` does **not** build it — it errors clearly if
  `src-tauri/target/debug/stageclock.exe` is missing.)

## Run (agent path) — use the driver

The driver is `.claude/skills/run-stageclock/driver.mjs`. It's a
dependency-free Node script (uses only built-in `fetch`/`WebSocket`,
Node 22+) — no npm install needed. Run every command from the
**project root**:

```
node .claude/skills/run-stageclock/driver.mjs launch
```
Starts the Vite dev server (if not already up on :1420) and launches
`src-tauri/target/debug/stageclock.exe` with the CDP port enabled on
:9222. Waits until a page target is reachable before returning.

```
node .claude/skills/run-stageclock/driver.mjs targets
```
Lists open CDP page targets — just `StageClock <http://localhost:1420/>`
normally, plus `StageClock — Audience <.../popout.html>` once the
popout window is open.

```
node .claude/skills/run-stageclock/driver.mjs eval <main|popout> "<js>"
node .claude/skills/run-stageclock/driver.mjs click <main|popout> "<css selector>"
node .claude/skills/run-stageclock/driver.mjs screenshot <main|popout> <output.png>
```
`eval` runs arbitrary JS in that window's page context via
`Runtime.evaluate` (`returnByValue`, `awaitPromise` both on — you can
`eval` a `Promise` and it'll resolve before returning) and prints the
result. `click` is a thin wrapper: `document.querySelector(sel).click()`.
`screenshot` writes a PNG via `Page.captureScreenshot`. Target
resolution is app-specific: `"main"` picks the page target whose URL
does **not** contain `popout.html`; `"popout"` picks the one that does.
If `popout` is requested before the popout window is open, it throws
a clear error listing what's actually open — that's not a driver bug,
just open it first (see the walkthrough below).

```
node .claude/skills/run-stageclock/driver.mjs quit
```
Kills the app and the Vite dev server it started (tracked via
`.driver-state.json` next to the driver — gitignored, ephemeral).
Always run this when done; leaving a stray debug-mode `stageclock.exe`
running is exactly what caused a false "the countdown reset itself"
read during this skill's own verification (see Gotchas).

### Example: verify a change end to end

```bash
node .claude/skills/run-stageclock/driver.mjs launch
node .claude/skills/run-stageclock/driver.mjs click main '[data-mode="countdown"]'
node .claude/skills/run-stageclock/driver.mjs eval main \
  "(() => { const el = document.querySelector('#duration-input'); el.value='00:05'; el.dispatchEvent(new Event('input',{bubbles:true})); return el.value; })()"
node .claude/skills/run-stageclock/driver.mjs click main '#start-btn'
node .claude/skills/run-stageclock/driver.mjs click main '#popout-btn'
node .claude/skills/run-stageclock/driver.mjs screenshot main  /tmp/main.png
node .claude/skills/run-stageclock/driver.mjs screenshot popout /tmp/popout.png
node .claude/skills/run-stageclock/driver.mjs quit
```
This was run verbatim while authoring this skill: both screenshots
showed the countdown at the same value (main in its toolbar chrome,
popout borderless), confirming the mirror-on-open + instant-transport
behavior actually works, not just that it compiles.

## Run (human path)

```
npm run tauri dev
```
Opens the app normally with hot reload. Fine for manual testing;
useless for an agent (no way to click into a real GUI window). Note
this launches via `cargo run` under the Tauri CLI's watcher, which is
slower to start and a different process tree than the driver's direct
exe launch — don't mix them in the same test session (see Gotchas).

## Test

```
npx tsc --noEmit
npm run build
```
`build` is the important one — it does `tsc && vite build`, which is
the only thing that catches a missing `vite.config.ts`
`rollupOptions.input` entry (dev mode serves `popout.html` fine
without it; only the bundle 404s). Always run `npm run build` after
touching `vite.config.ts`, `popout.html`, or the two-window wiring.

## Gotchas

- **Git Bash background PIDs aren't real Windows PIDs.** If you
  manually background a process with `cmd &` in a Git Bash shell,
  `$!` gives you an MSYS-layer PID that `taskkill /PID` won't
  recognize ("process not found") even though the real process is
  very much running and still holding the port. To find the actual
  PID, use `netstat -ano | findstr :<port>` or PowerShell
  `Get-NetTCPConnection -LocalPort <port>`, or just use the driver's
  `launch`/`quit`, which spawn via Node's `child_process.spawn` and
  get real Windows PIDs directly — this is why `quit` actually works
  and a manual `kill $!` in bash may not.
- **An orphaned debug instance silently corrupts your next test.**
  Killing `npm run tauri dev` (e.g. via a shell `timeout`) can leave
  the Rust-spawned `stageclock.exe` running as an orphan even after
  its parent dies, because Windows doesn't cascade-kill process trees
  by default. That orphan keeps its CDP port (if it had one) or just
  keeps ticking a countdown in the background — if you then reconnect
  later assuming a "fresh" countdown, you'll read whatever real
  wall-clock time has elapsed since, which looks exactly like a
  reset-to-zero bug but isn't one. Always `driver.mjs quit` before
  `launch`ing again, and if in doubt, check `Get-Process stageclock`.
- **`Runtime.evaluate` round-trips are fast (~0-2ms observed)** over
  WebView2's CDP bridge — it's not the bottleneck. If a value looks
  wrong, don't blame CDP latency; check real elapsed wall-clock time
  or actual application state first (this is the mistake that caused
  the orphan-process false alarm above).
- **Spawning `npm` on Windows is a trap either way.** `npm` resolves
  to `npm.cmd`, and `spawn("npm.cmd", [...])` without `shell: true`
  fails immediately with `EINVAL` (`.cmd` batch files need a shell to
  interpret them, unlike a real `.exe`). Adding `shell: true` "fixes"
  it but triggers a Node deprecation warning (DEP0190) about
  unescaped args. The driver sidesteps both by spawning Vite's actual
  JS entry point directly — `spawn(process.execPath, ["node_modules/vite/bin/vite.js"])`
  — no shell, no `.cmd`, no warning. Prefer this pattern generally: if
  the underlying tool has a `bin` entry that's a plain `.js` file,
  invoke it with `node` directly instead of going through its npm
  wrapper.
- **The exe needs the Vite dev server already reachable at
  `devUrl` (`:1420`)** — it doesn't retry/wait on its own if Vite
  isn't up yet, it'll just fail to load content. The driver starts
  Vite first and waits for it before launching the exe.
- **Two-window app**: don't assume `targets` has exactly one entry.
  Always disambiguate `main` vs `popout` explicitly; a bare
  substring match on "stageclock" would match both.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `launch` throws "stageclock.exe not found" | `cd src-tauri && cargo build`, then retry. |
| `eval`/`click`/`screenshot` throws "no ... target" | The window you asked for isn't open. For `popout`, click `#popout-btn` on `main` first. |
| Port 1420 or 9222 still show a listener after `quit` | An orphaned process from a previous session (see Gotchas). Find the real PID with `netstat -ano \| findstr :1420` (or `:9222`) and `taskkill /PID <pid> /T /F`. |
| `curl`/`fetch` to `:1420` returns nothing right after `launch` | Give it a moment — `launch` already waits for Vite and for a CDP page target, but the frontend JS module graph can take an extra beat on first load. |
