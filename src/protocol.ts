import type { Mode, TimerSnapshot } from "./timer";
import type { Settings } from "./settings";

export const POPOUT_LABEL = "popout";
export const SETTINGS_LABEL = "settings";

/** main -> popout. Complete replacement of what the audience shows. */
export const EVT_STATE = "stageclock://state";
/** popout -> main. "Listeners attached, send me state." */
export const EVT_READY = "stageclock://popout-ready";
/** popout -> main. "I am about to be destroyed." */
export const EVT_CLOSED = "stageclock://popout-closed";

/** settings window -> main. "Listeners attached, send me the current Draft settings." */
export const EVT_SETTINGS_READY = "stageclock://settings-ready";
/** main -> settings window. Pushes the current Draft settings, e.g. right after it opens. */
export const EVT_SETTINGS_STATE = "stageclock://settings-state";
/** settings window -> main. A field changed; here is the full updated Settings (still Draft). */
export const EVT_SETTINGS_CHANGE = "stageclock://settings-change";
/** settings window -> main. "I am about to be destroyed." */
export const EVT_SETTINGS_CLOSED = "stageclock://settings-closed";

export interface StatePayload {
  mode: Mode;
  countdown: TimerSnapshot;
  stopwatch: TimerSnapshot;
  settings: Settings;
}
