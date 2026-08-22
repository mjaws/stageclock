import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";
import { Timer } from "./timer";
import { computeFrame, DisplayView, applyModeToBody, type ClockState } from "./display";
import { EVT_STATE, EVT_READY, EVT_CLOSED, type StatePayload } from "./protocol";

const self = getCurrentWebviewWindow();

const state: ClockState = {
  mode: "clock",
  countdown: new Timer("countdown", 0),
  stopwatch: new Timer("stopwatch", 0),
};

const displayEl = document.querySelector<HTMLDivElement>("#display")!;
const stageEl = document.querySelector<HTMLDivElement>("#stage")!;
const hintEl = document.querySelector<HTMLDivElement>("#hint")!;
const view = new DisplayView(displayEl);

let started = false;
let chromeHidden = false;
let hintTimeout: number | undefined;

function loop(): void {
  view.apply(computeFrame(state, new Date()));
  requestAnimationFrame(loop);
}

async function toggleFullscreen(): Promise<void> {
  const isFs = await self.isFullscreen();
  await self.setFullscreen(!isFs);
  document.body.classList.toggle("fullscreen", !isFs);
}

async function exitFullscreen(): Promise<void> {
  const isFs = await self.isFullscreen();
  if (isFs) {
    await self.setFullscreen(false);
    document.body.classList.remove("fullscreen");
  }
}

async function toggleChrome(): Promise<void> {
  chromeHidden = !chromeHidden;
  await self.setDecorations(!chromeHidden);
  document.body.classList.toggle("chrome-hidden", chromeHidden);

  if (chromeHidden) {
    hintEl.classList.add("visible");
    window.clearTimeout(hintTimeout);
    hintTimeout = window.setTimeout(() => hintEl.classList.remove("visible"), 3000);
  } else {
    hintEl.classList.remove("visible");
  }
}

window.addEventListener("keydown", (e) => {
  if (e.key === "F11") {
    e.preventDefault();
    void toggleFullscreen();
  } else if (e.key === "Escape") {
    void exitFullscreen();
  } else if (e.key === "F9") {
    e.preventDefault();
    void toggleChrome();
  }
});

stageEl.addEventListener("dblclick", () => {
  void toggleFullscreen();
});

stageEl.addEventListener("mousedown", (e) => {
  if (chromeHidden && e.button === 0) {
    void self.startDragging();
  }
});

async function main(): Promise<void> {
  await self.listen<StatePayload>(EVT_STATE, ({ payload }) => {
    state.mode = payload.mode;
    state.countdown.restore(payload.countdown);
    state.stopwatch.restore(payload.stopwatch);
    applyModeToBody(document.body, state.mode);
    view.invalidate();
    if (!started) {
      started = true;
      requestAnimationFrame(loop);
    }
  });

  await self.onCloseRequested(async () => {
    await emit(EVT_CLOSED);
  });

  await emit(EVT_READY);
}

void main();
