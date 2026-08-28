import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit, listen } from "@tauri-apps/api/event";
import { Timer, parseDuration, formatDuration, formatCountdown, getBand, type Mode } from "./timer";
import {
  computeFrame,
  DisplayView,
  applyModeToBody,
  formatAudienceSummary,
  type ClockState,
} from "./display";
import { POPOUT_LABEL, EVT_STATE, EVT_READY, EVT_CLOSED, type StatePayload } from "./protocol";

const appWindow = getCurrentWindow();

const draft: ClockState = {
  mode: "clock",
  countdown: new Timer("countdown", 0),
  stopwatch: new Timer("stopwatch", 0),
};
const live: ClockState = {
  mode: "clock",
  countdown: new Timer("countdown", 0),
  stopwatch: new Timer("stopwatch", 0),
};

let chromeHidden = false;
let hintTimeout: number | undefined;
let publishedJson = "";
let popoutOpen = false;
let popoutOpening = false;
let lastReadoutText = "";

/** An unconfirmed edit to the running countdown's duration, staged but not yet published. */
let pendingCountdownMs: number | null = null;

const displayEl = document.querySelector<HTMLDivElement>("#display")!;
const stageEl = document.querySelector<HTMLDivElement>("#stage")!;
const controlsEl = document.querySelector<HTMLDivElement>("#controls")!;
const hintEl = document.querySelector<HTMLDivElement>("#hint")!;
const durationInput = document.querySelector<HTMLInputElement>("#duration-input")!;
const startBtn = document.querySelector<HTMLButtonElement>("#start-btn")!;
const pauseBtn = document.querySelector<HTMLButtonElement>("#pause-btn")!;
const resetBtn = document.querySelector<HTMLButtonElement>("#reset-btn")!;
const chromeToggleBtn = document.querySelector<HTMLButtonElement>("#chrome-toggle-btn")!;
const modeButtons = document.querySelectorAll<HTMLButtonElement>(".mode-btn");
const saveBtn = document.querySelector<HTMLButtonElement>("#save-btn")!;
const audienceReadoutEl = document.querySelector<HTMLSpanElement>("#audience-readout")!;
const popoutBtn = document.querySelector<HTMLButtonElement>("#popout-btn")!;
const popoutFullscreenBtn = document.querySelector<HTMLButtonElement>("#popout-fullscreen-btn")!;
const popoutChromeBtn = document.querySelector<HTMLButtonElement>("#popout-chrome-btn")!;
const popoutOntopBtn = document.querySelector<HTMLButtonElement>("#popout-ontop-btn")!;
const nudgeControlsEl = document.querySelector<HTMLDivElement>("#nudge-controls")!;
const nudgeAmountSelect = document.querySelector<HTMLSelectElement>("#nudge-amount")!;
const nudgeMinusBtn = document.querySelector<HTMLButtonElement>("#nudge-minus-btn")!;
const nudgePlusBtn = document.querySelector<HTMLButtonElement>("#nudge-plus-btn")!;
const confirmEditBtn = document.querySelector<HTMLButtonElement>("#confirm-edit-btn")!;
const cancelEditBtn = document.querySelector<HTMLButtonElement>("#cancel-edit-btn")!;

const view = new DisplayView(displayEl);

function activeTimerOf(state: ClockState): Timer | null {
  if (state.mode === "countdown") return state.countdown;
  if (state.mode === "stopwatch") return state.stopwatch;
  return null;
}

function serialize(state: ClockState): StatePayload {
  return {
    mode: state.mode,
    countdown: state.countdown.snapshot(),
    stopwatch: state.stopwatch.snapshot(),
  };
}

function refreshDirty(): void {
  if (!popoutOpen) {
    saveBtn.disabled = true;
    saveBtn.classList.remove("dirty");
    return;
  }
  const dirty = JSON.stringify(serialize(draft)) !== publishedJson;
  saveBtn.disabled = !dirty;
  saveBtn.classList.toggle("dirty", dirty);
}

function publish(): void {
  const payload = serialize(live);
  publishedJson = JSON.stringify(payload);
  void emit(EVT_STATE, payload);
}

function save(): void {
  live.mode = draft.mode;
  live.countdown.restore(draft.countdown.snapshot());
  live.stopwatch.restore(draft.stopwatch.snapshot());
  publish();
  refreshDirty();
}

/** Reflects the countdown's current Duration (Reset target) in the duration-input field. */
function syncDurationInputToDuration(): void {
  durationInput.value = formatDuration(draft.countdown.snapshot().durationMs / 1000);
}

/** Discards any unconfirmed manual edit, e.g. because Start/Pause/Reset/Nudge was used. */
function discardPendingEdit(): void {
  if (pendingCountdownMs === null) return;
  pendingCountdownMs = null;
  updatePendingEditUi();
  syncDurationInputToDuration();
}

function updatePendingEditUi(): void {
  const active = pendingCountdownMs !== null;
  confirmEditBtn.classList.toggle("hidden", !active);
  cancelEditBtn.classList.toggle("hidden", !active);
}

/** Nudge controls only make sense for a running countdown. */
function updateNudgeVisibility(): void {
  const showNudge = draft.mode === "countdown" && draft.countdown.running;
  nudgeControlsEl.classList.toggle("hidden", !showNudge);
}

/** Commits the staged manual edit into both draft and live at once, publishing it immediately. */
function confirmPendingEdit(): void {
  if (pendingCountdownMs === null) return;
  const now = Date.now();
  draft.countdown.retarget(pendingCountdownMs, now);
  live.countdown.retarget(pendingCountdownMs, now);
  pendingCountdownMs = null;
  updatePendingEditUi();
  publish();
  refreshDirty();
}

function cancelPendingEdit(): void {
  pendingCountdownMs = null;
  updatePendingEditUi();
  syncDurationInputToDuration();
}

/**
 * Immediately shifts the running countdown's remaining time by ± the selected amount,
 * preserving elapsed time, and publishes it straight away — same as Start/Pause/Reset,
 * no staging or freeze involved. Any in-progress manual edit is discarded first.
 */
function nudgeCountdown(sign: 1 | -1): void {
  if (draft.mode !== "countdown" || !draft.countdown.running) return;
  discardPendingEdit();
  const deltaMs = sign * Number(nudgeAmountSelect.value);
  draft.countdown.nudge(deltaMs);
  live.countdown.nudge(deltaMs);
  syncDurationInputToDuration();
  publish();
  refreshDirty();
}

function setDraftMode(next: Mode): void {
  discardPendingEdit();
  draft.mode = next;
  applyModeToBody(document.body, draft.mode);
  modeButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === next);
  });
  updateNudgeVisibility();
  if (next === "countdown") syncDurationInputToDuration();
  view.invalidate();
  refreshDirty();
}

function transport(action: "start" | "pause" | "reset"): void {
  discardPendingEdit();
  const now = Date.now();
  const dTimer = activeTimerOf(draft);
  const lTimer = activeTimerOf(live);
  if (action === "start") {
    dTimer?.start(now);
    lTimer?.start(now);
  } else if (action === "pause") {
    dTimer?.pause(now);
    lTimer?.pause(now);
  } else {
    dTimer?.reset();
    lTimer?.reset();
  }
  updateNudgeVisibility();
  publish();
  refreshDirty();
}

/**
 * While the countdown is running, edits are staged as a Pending Edit rather than applied
 * immediately — the display freezes on the pending value until Confirm or Cancel. Before
 * the countdown starts (or while paused), edits still apply immediately as before.
 */
function applyDurationInput(commit: boolean): void {
  if (draft.mode !== "countdown") return;
  const parsedMs = parseDuration(durationInput.value);
  if (parsedMs === null) return;

  if (draft.countdown.running) {
    pendingCountdownMs = parsedMs;
    updatePendingEditUi();
    if (commit) confirmPendingEdit();
  } else {
    draft.countdown.setDuration(parsedMs);
    refreshDirty();
  }
}

function updateAudienceReadout(now: Date): void {
  if (!popoutOpen) return;
  const text = `Audience: ${formatAudienceSummary(live, now)}`;
  if (text !== lastReadoutText) {
    audienceReadoutEl.textContent = text;
    lastReadoutText = text;
  }
}

function updatePopoutUi(): void {
  popoutBtn.textContent = popoutOpen ? "Close popout" : "Open popout";
  popoutFullscreenBtn.disabled = !popoutOpen;
  popoutChromeBtn.disabled = !popoutOpen;
  popoutOntopBtn.disabled = !popoutOpen;
  if (popoutOpen) {
    popoutOntopBtn.classList.add("active");
  } else {
    popoutOntopBtn.classList.remove("active");
    lastReadoutText = "";
    audienceReadoutEl.textContent = "Audience: — (closed)";
  }
  refreshDirty();
}

async function openPopout(): Promise<void> {
  if (popoutOpen || popoutOpening) return;

  const existing = await WebviewWindow.getByLabel(POPOUT_LABEL);
  if (existing) {
    popoutOpen = true;
    updatePopoutUi();
    return;
  }

  popoutOpening = true;
  const w = new WebviewWindow(POPOUT_LABEL, {
    url: "/popout.html",
    title: "StageClock — Audience",
    width: 960,
    height: 540,
    minWidth: 320,
    minHeight: 180,
    decorations: true,
    resizable: true,
    center: true,
    focus: true,
    alwaysOnTop: true,
    backgroundColor: "#0c0b0b",
  });

  void w.once("tauri://error", () => {
    popoutOpening = false;
  });
}

async function closePopout(): Promise<void> {
  const w = await WebviewWindow.getByLabel(POPOUT_LABEL);
  await w?.destroy();
  popoutOpen = false;
  updatePopoutUi();
}

function loop(): void {
  const now = new Date();
  if (pendingCountdownMs !== null) {
    view.apply({
      kind: "text",
      content: formatCountdown(pendingCountdownMs),
      bandClass: `band-${getBand(pendingCountdownMs)}`,
    });
  } else {
    view.apply(computeFrame(draft, now));
  }
  updateAudienceReadout(now);
  requestAnimationFrame(loop);
}

function toggleChrome(): void {
  chromeHidden = !chromeHidden;
  void appWindow.setDecorations(!chromeHidden);
  controlsEl.classList.toggle("hidden", chromeHidden);
  document.body.classList.toggle("chrome-hidden", chromeHidden);
  chromeToggleBtn.textContent = chromeHidden ? "Show toolbar" : "Hide toolbar";

  if (chromeHidden) {
    hintEl.classList.add("visible");
    window.clearTimeout(hintTimeout);
    hintTimeout = window.setTimeout(() => hintEl.classList.remove("visible"), 3000);
  } else {
    hintEl.classList.remove("visible");
  }
}

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setDraftMode(btn.dataset.mode as Mode);
  });
});

durationInput.addEventListener("input", () => applyDurationInput(false));

durationInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && draft.mode === "countdown") {
    e.preventDefault();
    const wasRunning = draft.countdown.running;
    applyDurationInput(true);
    if (!wasRunning) transport("start");
  }
});

startBtn.addEventListener("click", () => {
  if (draft.mode === "countdown" && !draft.countdown.hasStarted()) {
    applyDurationInput(true);
  }
  transport("start");
});

pauseBtn.addEventListener("click", () => transport("pause"));
resetBtn.addEventListener("click", () => transport("reset"));

nudgeMinusBtn.addEventListener("click", () => nudgeCountdown(-1));
nudgePlusBtn.addEventListener("click", () => nudgeCountdown(1));
confirmEditBtn.addEventListener("click", () => confirmPendingEdit());
cancelEditBtn.addEventListener("click", () => cancelPendingEdit());

saveBtn.addEventListener("click", save);

popoutBtn.addEventListener("click", () => {
  if (popoutOpen) {
    void closePopout();
  } else {
    void openPopout();
  }
});

popoutFullscreenBtn.addEventListener("click", async () => {
  const w = await WebviewWindow.getByLabel(POPOUT_LABEL);
  if (!w) return;
  const isFs = await w.isFullscreen();
  await w.setFullscreen(!isFs);
});

popoutChromeBtn.addEventListener("click", async () => {
  const w = await WebviewWindow.getByLabel(POPOUT_LABEL);
  if (!w) return;
  const isDecorated = await w.isDecorated();
  await w.setDecorations(!isDecorated);
});

popoutOntopBtn.addEventListener("click", async () => {
  const w = await WebviewWindow.getByLabel(POPOUT_LABEL);
  if (!w) return;
  const isTop = await w.isAlwaysOnTop();
  await w.setAlwaysOnTop(!isTop);
  popoutOntopBtn.classList.toggle("active", !isTop);
});

chromeToggleBtn.addEventListener("click", toggleChrome);

stageEl.addEventListener("mousedown", (e) => {
  if (chromeHidden && e.button === 0) {
    void appWindow.startDragging();
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "F9") {
    e.preventDefault();
    toggleChrome();
  } else if (e.key === "Escape" && pendingCountdownMs !== null) {
    e.preventDefault();
    cancelPendingEdit();
  }
});

void listen(EVT_READY, () => {
  popoutOpen = true;
  popoutOpening = false;
  save();
  updatePopoutUi();
});

void listen(EVT_CLOSED, () => {
  popoutOpen = false;
  updatePopoutUi();
});

void appWindow.onCloseRequested(async () => {
  try {
    const w = await WebviewWindow.getByLabel(POPOUT_LABEL);
    await w?.destroy();
  } catch {}
});

setDraftMode("clock");
requestAnimationFrame(loop);
