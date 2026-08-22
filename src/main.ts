import { getCurrentWindow } from "@tauri-apps/api/window";
import { formatTimeOfDay } from "./clock";
import {
  Timer,
  getBand,
  parseDuration,
  formatDuration,
  formatStopwatch,
  type TimerMode,
} from "./timer";

const appWindow = getCurrentWindow();

type Mode = "clock" | TimerMode;

let mode: Mode = "clock";
let chromeHidden = false;
let hintTimeout: number | undefined;
let lastDisplayText = "";
let lastBandClass = "";

const countdownTimer = new Timer("countdown", 0);
const stopwatchTimer = new Timer("stopwatch", 0);

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

function activeTimer(): Timer | null {
  if (mode === "countdown") return countdownTimer;
  if (mode === "stopwatch") return stopwatchTimer;
  return null;
}

function setMode(next: Mode): void {
  mode = next;
  document.body.dataset.mode = mode;
  modeButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  lastDisplayText = "";
  lastBandClass = "";
}

function render(): void {
  let html: string;
  let bandClass: string;

  if (mode === "clock") {
    const { hm, seconds, period } = formatTimeOfDay(new Date());
    html =
      `<span class="hm">${hm}</span>` +
      `<span class="stack"><span class="period">${period}</span><span class="seconds">${seconds}</span></span>`;
    bandClass = "band-neutral";
  } else if (mode === "countdown") {
    const remainingMs = countdownTimer.currentMs();
    html = formatDuration(Math.ceil(remainingMs / 1000));
    bandClass = `band-${getBand(remainingMs)}`;
  } else {
    const elapsedMs = stopwatchTimer.currentMs();
    html = formatStopwatch(elapsedMs);
    bandClass = "band-neutral";
  }

  if (html !== lastDisplayText) {
    displayEl.innerHTML = html;
    lastDisplayText = html;
  }
  if (bandClass !== lastBandClass) {
    displayEl.classList.remove("band-neutral", "band-ok", "band-warn", "band-danger");
    displayEl.classList.add(bandClass);
    lastBandClass = bandClass;
  }
}

function loop(): void {
  render();
  requestAnimationFrame(loop);
}

function toggleChrome(): void {
  chromeHidden = !chromeHidden;
  appWindow.setDecorations(!chromeHidden);
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

function applyDurationInput(): void {
  if (mode !== "countdown" || countdownTimer.running) return;
  const parsedMs = parseDuration(durationInput.value);
  if (parsedMs !== null) {
    countdownTimer.setDuration(parsedMs);
  }
}

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setMode(btn.dataset.mode as Mode);
  });
});

durationInput.addEventListener("input", applyDurationInput);

durationInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && mode === "countdown") {
    e.preventDefault();
    applyDurationInput();
    countdownTimer.start();
  }
});

startBtn.addEventListener("click", () => {
  if (mode === "countdown") {
    applyDurationInput();
  }
  activeTimer()?.start();
});

pauseBtn.addEventListener("click", () => {
  activeTimer()?.pause();
});

resetBtn.addEventListener("click", () => {
  activeTimer()?.reset();
});

chromeToggleBtn.addEventListener("click", toggleChrome);

stageEl.addEventListener("mousedown", (e) => {
  if (chromeHidden && e.button === 0) {
    appWindow.startDragging();
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "F9") {
    e.preventDefault();
    toggleChrome();
  }
});

setMode("clock");
requestAnimationFrame(loop);
