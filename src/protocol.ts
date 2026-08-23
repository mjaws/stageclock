import type { Mode, TimerSnapshot } from "./timer";

export const POPOUT_LABEL = "popout";

/** main -> popout. Complete replacement of what the audience shows. */
export const EVT_STATE = "stageclock://state";
/** popout -> main. "Listeners attached, send me state." */
export const EVT_READY = "stageclock://popout-ready";
/** popout -> main. "I am about to be destroyed." */
export const EVT_CLOSED = "stageclock://popout-closed";

export interface StatePayload {
  mode: Mode;
  countdown: TimerSnapshot;
  stopwatch: TimerSnapshot;
}
