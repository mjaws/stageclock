import { formatTimeOfDay } from "./clock";
import { Timer, getBand, formatCountdown, formatStopwatch, type Mode } from "./timer";

export const BAND_CLASSES = ["band-neutral", "band-ok", "band-warn", "band-danger"] as const;
export type BandClass = (typeof BAND_CLASSES)[number];

/** Target proportion of the stage's box the display text should fill. */
const FILL_WIDTH_RATIO = 0.91;
const FILL_HEIGHT_RATIO = 0.82;

/** The three-part state that fully determines what a display shows. */
export interface ClockState {
  mode: Mode;
  countdown: Timer;
  stopwatch: Timer;
}

export interface Frame {
  kind: "html" | "text";
  content: string;
  bandClass: BandClass;
}

/** Pure. No DOM, no globals. */
export function computeFrame(state: ClockState, now: Date): Frame {
  if (state.mode === "clock") {
    const { hm, seconds, period } = formatTimeOfDay(now);
    return {
      kind: "html",
      content:
        `<span class="hm">${hm}</span>` +
        `<span class="stack"><span class="period">${period}</span><span class="seconds">${seconds}</span></span>`,
      bandClass: "band-neutral",
    };
  }

  if (state.mode === "countdown") {
    const remainingMs = state.countdown.currentMs(now.getTime());
    return {
      kind: "text",
      content: formatCountdown(remainingMs),
      bandClass: `band-${getBand(remainingMs)}`,
    };
  }

  const elapsedMs = state.stopwatch.currentMs(now.getTime());
  return {
    kind: "text",
    content: formatStopwatch(elapsedMs),
    bandClass: "band-neutral",
  };
}

/** Owns memoization + DOM writes for exactly one #display element. */
export class DisplayView {
  private readonly el: HTMLElement;
  private readonly container: HTMLElement;
  private lastKey = "";
  private lastBandClass = "";

  constructor(el: HTMLElement) {
    this.el = el;
    this.container = el.parentElement!;
    new ResizeObserver(() => this.fit()).observe(this.container);
  }

  apply(frame: Frame): void {
    const key = `${frame.kind} ${frame.content}`;
    if (key !== this.lastKey) {
      if (frame.kind === "html") {
        this.el.innerHTML = frame.content;
      } else {
        this.el.textContent = frame.content;
      }
      this.lastKey = key;
      this.fit();
    }
    if (frame.bandClass !== this.lastBandClass) {
      this.el.classList.remove(...BAND_CLASSES);
      this.el.classList.add(frame.bandClass);
      this.lastBandClass = frame.bandClass;
    }
  }

  /** Forces the next apply() to repaint, even if the frame looks unchanged. */
  invalidate(): void {
    this.lastKey = "";
    this.lastBandClass = "";
  }

  /** Scales font-size so the rendered text fills a target proportion of the stage box. */
  private fit(): void {
    const currentFontPx = parseFloat(getComputedStyle(this.el).fontSize);
    const { width, height } = this.el.getBoundingClientRect();
    if (!currentFontPx || width === 0 || height === 0) return;

    const availWidth = this.container.clientWidth * FILL_WIDTH_RATIO;
    const availHeight = this.container.clientHeight * FILL_HEIGHT_RATIO;
    const scale = Math.min(availWidth / width, availHeight / height);

    this.el.style.fontSize = `${currentFontPx * scale}px`;
  }
}

/** Sets body[data-mode] so the existing mode-driven CSS applies in both windows. */
export function applyModeToBody(body: HTMLElement, mode: Mode): void {
  body.dataset.mode = mode;
}

/** One-line summary of what a ClockState shows, for the primary's "audience" readout. */
export function formatAudienceSummary(state: ClockState, now: Date): string {
  if (state.mode === "clock") {
    const { hm, period } = formatTimeOfDay(now);
    return `Clock ${hm} ${period}`;
  }

  const timer = state.mode === "countdown" ? state.countdown : state.stopwatch;
  const ms = timer.currentMs(now.getTime());
  const text =
    state.mode === "countdown"
      ? formatCountdown(ms)
      : formatStopwatch(ms);
  const label = state.mode === "countdown" ? "Countdown" : "Stopwatch";
  const glyph = timer.running ? "▶" : "❚❚";
  return `${label} ${text} ${glyph}`;
}
