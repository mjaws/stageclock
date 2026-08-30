import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";
import { EVT_SETTINGS_READY, EVT_SETTINGS_STATE, EVT_SETTINGS_CHANGE, EVT_SETTINGS_CLOSED } from "./protocol";
import { SettingsPanel, type Settings } from "./settings";

const self = getCurrentWebviewWindow();

const panel = new SettingsPanel(
  {
    resetBtn: document.querySelector<HTMLButtonElement>("#settings-reset-btn")!,
    clockFontSelect: document.querySelector<HTMLSelectElement>("#clock-font-select")!,
    clockFontCustom: document.querySelector<HTMLInputElement>("#clock-font-custom")!,
    clockSizeRange: document.querySelector<HTMLInputElement>("#clock-size-range")!,
    clockMinutesBelow60: document.querySelector<HTMLInputElement>("#clock-minutes-below-60")!,
    neutralColor: document.querySelector<HTMLInputElement>("#neutral-color")!,
    neutralAlpha: document.querySelector<HTMLInputElement>("#neutral-alpha")!,
    okColor: document.querySelector<HTMLInputElement>("#ok-color")!,
    okAlpha: document.querySelector<HTMLInputElement>("#ok-alpha")!,
    warnEnabled: document.querySelector<HTMLInputElement>("#warn-enabled")!,
    warnColor: document.querySelector<HTMLInputElement>("#warn-color")!,
    warnAlpha: document.querySelector<HTMLInputElement>("#warn-alpha")!,
    warnThreshold: document.querySelector<HTMLInputElement>("#warn-threshold")!,
    dangerEnabled: document.querySelector<HTMLInputElement>("#danger-enabled")!,
    dangerColor: document.querySelector<HTMLInputElement>("#danger-color")!,
    dangerAlpha: document.querySelector<HTMLInputElement>("#danger-alpha")!,
    dangerThreshold: document.querySelector<HTMLInputElement>("#danger-threshold")!,
    dangerPulse: document.querySelector<HTMLInputElement>("#danger-pulse")!,
    bgColor: document.querySelector<HTMLInputElement>("#bg-color")!,
    bgAlpha: document.querySelector<HTMLInputElement>("#bg-alpha")!,
    titleText: document.querySelector<HTMLInputElement>("#title-text")!,
    titleFontSelect: document.querySelector<HTMLSelectElement>("#title-font-select")!,
    titleFontCustom: document.querySelector<HTMLInputElement>("#title-font-custom")!,
    titleSizeRange: document.querySelector<HTMLInputElement>("#title-size-range")!,
    titleColor: document.querySelector<HTMLInputElement>("#title-color")!,
    titleAlpha: document.querySelector<HTMLInputElement>("#title-alpha")!,
    titlePositionSelect: document.querySelector<HTMLSelectElement>("#title-position-select")!,
  },
  (next) => void emit(EVT_SETTINGS_CHANGE, next),
);

async function main(): Promise<void> {
  await self.listen<Settings>(EVT_SETTINGS_STATE, ({ payload }) => panel.setSettings(payload));

  await self.onCloseRequested(async () => {
    await emit(EVT_SETTINGS_CLOSED);
  });

  await emit(EVT_SETTINGS_READY);
}

void main();
