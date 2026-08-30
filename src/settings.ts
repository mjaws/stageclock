import { load, type Store } from "@tauri-apps/plugin-store";
import type { DisplayView, TitleView } from "./display";
import type { BandConfig } from "./timer";

export type TitlePosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface ColorValue {
  /** "#rrggbb" */
  hex: string;
  /** 0-1 */
  alpha: number;
}

export interface BandSetting {
  color: ColorValue;
  enabled: boolean;
  thresholdSec: number;
}

export interface TitleSettings {
  text: string;
  font: string;
  /** Proportion of the clock's own font size. */
  sizeRatio: number;
  color: ColorValue;
  position: TitlePosition;
}

export interface Settings {
  clock: {
    font: string;
    /** Multiplier applied to the clock's auto-fit target size. */
    sizeRatio: number;
    /** When true, countdowns below one minute show "M:SS" instead of "SS.T". */
    minutesBelow60: boolean;
  };
  colors: {
    neutral: ColorValue;
    ok: ColorValue;
    warn: BandSetting;
    danger: BandSetting & { pulse: boolean };
  };
  background: ColorValue;
  title: TitleSettings;
}

/** Common cross-platform system fonts, chosen to need no bundling. */
export const CURATED_FONTS = [
  "Montserrat",
  "Arial",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Impact",
];

export const TITLE_POSITIONS: { value: TitlePosition; label: string }[] = [
  { value: "top-left", label: "Top left" },
  { value: "top-center", label: "Top center" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-center", label: "Bottom center" },
  { value: "bottom-right", label: "Bottom right" },
];

export function defaultSettings(): Settings {
  return {
    clock: { font: "Montserrat", sizeRatio: 1, minutesBelow60: false },
    colors: {
      neutral: { hex: "#e8e8ea", alpha: 1 },
      ok: { hex: "#3ddc84", alpha: 1 },
      warn: { color: { hex: "#ffd23f", alpha: 1 }, enabled: true, thresholdSec: 60 },
      danger: {
        color: { hex: "#ff4d4d", alpha: 1 },
        enabled: true,
        thresholdSec: 10,
        pulse: true,
      },
    },
    background: { hex: "#161414", alpha: 1 },
    title: {
      text: "",
      font: "Montserrat",
      sizeRatio: 0.3,
      color: { hex: "#e8e8ea", alpha: 1 },
      position: "top-center",
    },
  };
}

export function toRgba({ hex, alpha }: ColorValue): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Wraps multi-word family names in quotes and appends a safe fallback stack. */
export function formatFontFamily(name: string): string {
  const quoted = name.includes(" ") ? `"${name}"` : name;
  return `${quoted}, "Segoe UI", Arial, Helvetica, sans-serif`;
}

export function bandConfigFrom(settings: Settings): BandConfig {
  return {
    warn: { enabled: settings.colors.warn.enabled, thresholdMs: settings.colors.warn.thresholdSec * 1000 },
    danger: {
      enabled: settings.colors.danger.enabled,
      thresholdMs: settings.colors.danger.thresholdSec * 1000,
    },
  };
}

export function countdownFormatFrom(settings: Settings): { minutesBelow60: boolean } {
  return { minutesBelow60: settings.clock.minutesBelow60 };
}

/** Pushes a Settings object into both windows' CSS custom properties and views. */
export function applySettings(settings: Settings, view: DisplayView, titleView: TitleView): void {
  const root = document.documentElement.style;
  root.setProperty("--neutral", toRgba(settings.colors.neutral));
  root.setProperty("--ok", toRgba(settings.colors.ok));
  root.setProperty("--warn", toRgba(settings.colors.warn.color));
  root.setProperty("--danger", toRgba(settings.colors.danger.color));

  const bg = parseInt(settings.background.hex.slice(1), 16);
  root.setProperty("--bg-rgb", `${(bg >> 16) & 255}, ${(bg >> 8) & 255}, ${bg & 255}`);
  root.setProperty("--bg-alpha", String(settings.background.alpha));

  view.setFont(formatFontFamily(settings.clock.font));
  view.setSizeScale(settings.clock.sizeRatio);
  view.setDangerPulse(settings.colors.danger.enabled && settings.colors.danger.pulse);

  titleView.setProps({
    text: settings.title.text,
    font: formatFontFamily(settings.title.font),
    sizeRatio: settings.title.sizeRatio,
    colorCss: toRgba(settings.title.color),
    position: settings.title.position,
  });
}

const STORE_PATH = "settings.json";
let storeHandle: Store | null = null;

async function getStoreHandle(): Promise<Store> {
  if (!storeHandle) {
    storeHandle = await load(STORE_PATH, { autoSave: false });
  }
  return storeHandle;
}

/** Merges a persisted (possibly partial/outdated) settings object over the defaults. */
function mergeWithDefaults(saved: Partial<Settings> | undefined): Settings {
  const defaults = defaultSettings();
  if (!saved) return defaults;
  return {
    clock: { ...defaults.clock, ...saved.clock },
    colors: {
      neutral: { ...defaults.colors.neutral, ...saved.colors?.neutral },
      ok: { ...defaults.colors.ok, ...saved.colors?.ok },
      warn: { ...defaults.colors.warn, ...saved.colors?.warn },
      danger: { ...defaults.colors.danger, ...saved.colors?.danger },
    },
    background: { ...defaults.background, ...saved.background },
    title: { ...defaults.title, ...saved.title },
  };
}

export async function loadPersistedSettings(): Promise<Settings> {
  const store = await getStoreHandle();
  const saved = await store.get<Settings>("settings");
  return mergeWithDefaults(saved);
}

export async function savePersistedSettings(settings: Settings): Promise<void> {
  const store = await getStoreHandle();
  await store.set("settings", settings);
  await store.save();
}

const CUSTOM_FONT_VALUE = "__custom__";

function populateFontSelect(select: HTMLSelectElement): void {
  select.innerHTML = "";
  for (const font of CURATED_FONTS) {
    const opt = document.createElement("option");
    opt.value = font;
    opt.textContent = font;
    select.appendChild(opt);
  }
  const customOpt = document.createElement("option");
  customOpt.value = CUSTOM_FONT_VALUE;
  customOpt.textContent = "Custom…";
  select.appendChild(customOpt);
}

function populatePositionSelect(select: HTMLSelectElement): void {
  select.innerHTML = "";
  for (const { value, label } of TITLE_POSITIONS) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    select.appendChild(opt);
  }
}

/** Binds a <select> (curated fonts + "Custom…") and a fallback text input to one font-family value. */
function bindFontPicker(
  select: HTMLSelectElement,
  custom: HTMLInputElement,
  get: () => string,
  set: (font: string) => void,
): { render: () => void } {
  const isCurated = (font: string) => (CURATED_FONTS as string[]).includes(font);

  select.addEventListener("change", () => {
    if (select.value === CUSTOM_FONT_VALUE) {
      custom.classList.remove("hidden");
      custom.value = isCurated(get()) ? "" : get();
      custom.focus();
    } else {
      custom.classList.add("hidden");
      set(select.value);
    }
  });

  custom.addEventListener("input", () => set(custom.value));

  return {
    render: () => {
      const font = get();
      if (isCurated(font)) {
        select.value = font;
        custom.classList.add("hidden");
      } else {
        select.value = CUSTOM_FONT_VALUE;
        custom.value = font;
        custom.classList.remove("hidden");
      }
    },
  };
}

/** Binds a native color input + an alpha (0-100) range to one ColorValue. */
function bindColorPicker(
  colorEl: HTMLInputElement,
  alphaEl: HTMLInputElement,
  get: () => ColorValue,
  set: (c: ColorValue) => void,
): { render: () => void } {
  colorEl.addEventListener("input", () => set({ hex: colorEl.value, alpha: get().alpha }));
  alphaEl.addEventListener("input", () => set({ hex: get().hex, alpha: Number(alphaEl.value) / 100 }));

  return {
    render: () => {
      const c = get();
      colorEl.value = c.hex;
      alphaEl.value = String(Math.round(c.alpha * 100));
    },
  };
}

export interface SettingsPanelElements {
  resetBtn: HTMLButtonElement;
  clockFontSelect: HTMLSelectElement;
  clockFontCustom: HTMLInputElement;
  clockSizeRange: HTMLInputElement;
  clockMinutesBelow60: HTMLInputElement;
  neutralColor: HTMLInputElement;
  neutralAlpha: HTMLInputElement;
  okColor: HTMLInputElement;
  okAlpha: HTMLInputElement;
  warnEnabled: HTMLInputElement;
  warnColor: HTMLInputElement;
  warnAlpha: HTMLInputElement;
  warnThreshold: HTMLInputElement;
  dangerEnabled: HTMLInputElement;
  dangerColor: HTMLInputElement;
  dangerAlpha: HTMLInputElement;
  dangerThreshold: HTMLInputElement;
  dangerPulse: HTMLInputElement;
  bgColor: HTMLInputElement;
  bgAlpha: HTMLInputElement;
  titleText: HTMLInputElement;
  titleFontSelect: HTMLSelectElement;
  titleFontCustom: HTMLInputElement;
  titleSizeRange: HTMLInputElement;
  titleColor: HTMLInputElement;
  titleAlpha: HTMLInputElement;
  titlePositionSelect: HTMLSelectElement;
}

/**
 * A settings form bound to a live Settings object: every input mutates it and fires
 * onChange immediately (the Draft side of Draft/Save — publishing is the caller's job).
 */
export class SettingsPanel {
  private current: Settings;
  private readonly onChange: (settings: Settings) => void;
  private readonly renderers: Array<() => void> = [];

  constructor(els: SettingsPanelElements, onChange: (settings: Settings) => void) {
    this.onChange = onChange;
    this.current = defaultSettings();

    populateFontSelect(els.clockFontSelect);
    populateFontSelect(els.titleFontSelect);
    populatePositionSelect(els.titlePositionSelect);

    this.wireField(els.clockSizeRange, "input", () => {
      this.current.clock.sizeRatio = Number(els.clockSizeRange.value);
    });
    this.renderers.push(() => (els.clockSizeRange.value = String(this.current.clock.sizeRatio)));
    this.wireField(
      els.clockMinutesBelow60,
      "change",
      () => (this.current.clock.minutesBelow60 = els.clockMinutesBelow60.checked),
    );
    this.renderers.push(() => (els.clockMinutesBelow60.checked = this.current.clock.minutesBelow60));
    this.renderers.push(
      bindFontPicker(
        els.clockFontSelect,
        els.clockFontCustom,
        () => this.current.clock.font,
        (font) => this.mutate(() => (this.current.clock.font = font)),
      ).render,
    );

    this.renderers.push(
      bindColorPicker(
        els.neutralColor,
        els.neutralAlpha,
        () => this.current.colors.neutral,
        (c) => this.mutate(() => (this.current.colors.neutral = c)),
      ).render,
    );
    this.renderers.push(
      bindColorPicker(
        els.okColor,
        els.okAlpha,
        () => this.current.colors.ok,
        (c) => this.mutate(() => (this.current.colors.ok = c)),
      ).render,
    );
    this.renderers.push(
      bindColorPicker(
        els.warnColor,
        els.warnAlpha,
        () => this.current.colors.warn.color,
        (c) => this.mutate(() => (this.current.colors.warn.color = c)),
      ).render,
    );
    this.renderers.push(
      bindColorPicker(
        els.dangerColor,
        els.dangerAlpha,
        () => this.current.colors.danger.color,
        (c) => this.mutate(() => (this.current.colors.danger.color = c)),
      ).render,
    );

    this.wireField(els.warnEnabled, "change", () => (this.current.colors.warn.enabled = els.warnEnabled.checked));
    this.renderers.push(() => (els.warnEnabled.checked = this.current.colors.warn.enabled));
    this.wireField(
      els.warnThreshold,
      "input",
      () => (this.current.colors.warn.thresholdSec = Number(els.warnThreshold.value)),
    );
    this.renderers.push(() => (els.warnThreshold.value = String(this.current.colors.warn.thresholdSec)));

    this.wireField(
      els.dangerEnabled,
      "change",
      () => (this.current.colors.danger.enabled = els.dangerEnabled.checked),
    );
    this.renderers.push(() => (els.dangerEnabled.checked = this.current.colors.danger.enabled));
    this.wireField(
      els.dangerThreshold,
      "input",
      () => (this.current.colors.danger.thresholdSec = Number(els.dangerThreshold.value)),
    );
    this.renderers.push(() => (els.dangerThreshold.value = String(this.current.colors.danger.thresholdSec)));
    this.wireField(els.dangerPulse, "change", () => (this.current.colors.danger.pulse = els.dangerPulse.checked));
    this.renderers.push(() => (els.dangerPulse.checked = this.current.colors.danger.pulse));

    this.renderers.push(
      bindColorPicker(
        els.bgColor,
        els.bgAlpha,
        () => this.current.background,
        (c) => this.mutate(() => (this.current.background = c)),
      ).render,
    );

    this.wireField(els.titleText, "input", () => (this.current.title.text = els.titleText.value));
    this.renderers.push(() => (els.titleText.value = this.current.title.text));
    this.renderers.push(
      bindFontPicker(
        els.titleFontSelect,
        els.titleFontCustom,
        () => this.current.title.font,
        (font) => this.mutate(() => (this.current.title.font = font)),
      ).render,
    );
    this.wireField(els.titleSizeRange, "input", () => (this.current.title.sizeRatio = Number(els.titleSizeRange.value)));
    this.renderers.push(() => (els.titleSizeRange.value = String(this.current.title.sizeRatio)));
    this.renderers.push(
      bindColorPicker(
        els.titleColor,
        els.titleAlpha,
        () => this.current.title.color,
        (c) => this.mutate(() => (this.current.title.color = c)),
      ).render,
    );
    this.wireField(
      els.titlePositionSelect,
      "change",
      () => (this.current.title.position = els.titlePositionSelect.value as TitlePosition),
    );
    this.renderers.push(() => (els.titlePositionSelect.value = this.current.title.position));

    els.resetBtn.addEventListener("click", () => {
      this.current = defaultSettings();
      this.render();
      this.onChange(structuredClone(this.current));
    });
  }

  /** Wires a plain (non color/font) field: reads it into `current` on the given event. */
  private wireField<E extends HTMLElement>(el: E, event: string, apply: () => void): void {
    el.addEventListener(event, () => this.mutate(apply));
  }

  private mutate(apply: () => void): void {
    apply();
    this.onChange(structuredClone(this.current));
  }

  private render(): void {
    for (const renderer of this.renderers) renderer();
  }

  /** Syncs the form to reflect a Settings object — used for initial load and after a push from main. */
  setSettings(settings: Settings): void {
    this.current = structuredClone(settings);
    this.render();
  }
}
