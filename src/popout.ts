import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";
import { Timer } from "./timer";
import { computeFrame, DisplayView, TitleView, applyModeToBody, type ClockState } from "./display";
import { EVT_STATE, EVT_READY, EVT_CLOSED, type StatePayload } from "./protocol";
import { applySettings, bandConfigFrom, countdownFormatFrom, defaultSettings, type Settings } from "./settings";

const self = getCurrentWebviewWindow();

const state: ClockState = {
  mode: "clock",
  countdown: new Timer("countdown", 0),
  stopwatch: new Timer("stopwatch", 0),
};
let settings: Settings = defaultSettings();

const displayEl = document.querySelector<HTMLDivElement>("#display")!;
const stageEl = document.querySelector<HTMLDivElement>("#stage")!;
const hintEl = document.querySelector<HTMLDivElement>("#hint")!;
const titleEl = document.querySelector<HTMLDivElement>("#title")!;
const titleView = new TitleView(titleEl);
const view = new DisplayView(displayEl, (px) => titleView.setClockFontPx(px));

let started = false;
let chromeHidden = false;
let hintTimeout: number | undefined;

function loop(): void {
  const bandConfig = bandConfigFrom(settings);
  const countdownFormat = countdownFormatFrom(settings);
  view.apply(computeFrame(state, new Date(), bandConfig, countdownFormat));
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
    settings = payload.settings;
    applySettings(settings, view, titleView);
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
