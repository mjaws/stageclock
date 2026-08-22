export type TimerMode = "countdown" | "stopwatch";
export type Band = "ok" | "warn" | "danger";

const WARN_THRESHOLD_MS = 60_000;
const DANGER_THRESHOLD_MS = 10_000;

export function getBand(remainingMs: number): Band {
  if (remainingMs <= DANGER_THRESHOLD_MS) return "danger";
  if (remainingMs <= WARN_THRESHOLD_MS) return "warn";
  return "ok";
}

// Countdown/stopwatch values are always derived from wall-clock deltas
// (Date.now() - startedAtEpochMs) rather than accumulated per-tick, so
// pausing/resuming or a throttled render loop can never cause drift.
export class Timer {
  readonly mode: TimerMode;
  private durationMs: number;
  private baseMs: number;
  private startedAtEpochMs: number | null = null;
  running = false;

  constructor(mode: TimerMode, durationMs = 0) {
    this.mode = mode;
    this.durationMs = durationMs;
    this.baseMs = mode === "countdown" ? durationMs : 0;
  }

  setDuration(durationMs: number): void {
    this.durationMs = durationMs;
    if (!this.running) {
      this.baseMs = this.mode === "countdown" ? durationMs : 0;
    }
  }

  start(): void {
    if (this.running) return;
    this.startedAtEpochMs = Date.now();
    this.running = true;
  }

  pause(): void {
    if (!this.running) return;
    this.baseMs = this.currentMs();
    this.startedAtEpochMs = null;
    this.running = false;
  }

  reset(): void {
    this.running = false;
    this.startedAtEpochMs = null;
    this.baseMs = this.mode === "countdown" ? this.durationMs : 0;
  }

  currentMs(): number {
    if (!this.running || this.startedAtEpochMs === null) return this.baseMs;
    const elapsedSinceStart = Date.now() - this.startedAtEpochMs;
    if (this.mode === "countdown") {
      return Math.max(0, this.baseMs - elapsedSinceStart);
    }
    return this.baseMs + elapsedSinceStart;
  }
}

/** Parses "MM:SS" or "HH:MM:SS" into milliseconds, or null if invalid. */
export function parseDuration(input: string): number | null {
  const parts = input.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return null;

  const numbers = parts.map(Number);
  if (numbers.some((n) => !Number.isFinite(n) || n < 0 || !Number.isInteger(n))) {
    return null;
  }

  const [hours, minutes, seconds] =
    numbers.length === 3 ? numbers : [0, numbers[0], numbers[1]];
  if (minutes > 59 || seconds > 59) return null;

  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}

/** Formats a whole-second count as "MM:SS", or "HH:MM:SS" once it reaches an hour. */
export function formatDuration(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;

  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Formats elapsed milliseconds as "MM:SS.CC" (hundredths), or "HH:MM:SS.CC" once it reaches an hour. */
export function formatStopwatch(totalMs: number): string {
  const clamped = Math.max(0, totalMs);
  const totalSeconds = Math.floor(clamped / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const centis = Math.floor((clamped % 1000) / 10);

  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  const cc = String(centis).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}.${cc}` : `${mm}:${ss}.${cc}`;
}
