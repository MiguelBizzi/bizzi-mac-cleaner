import { loadConfig } from "./config.js";
import en from "../locales/en.json" with { type: "json" };
import pt from "../locales/pt.json" with { type: "json" };

export type LocaleDict = Record<string, string>;

const BUNDLED: Record<string, LocaleDict> = {
  en: en as LocaleDict,
  pt: pt as LocaleDict,
};

let currentLocale = "en";

export function availableLocales(): string[] {
  return Object.keys(BUNDLED);
}

export function setLocale(locale: string): void {
  currentLocale = locale in BUNDLED ? locale : "en";
}

export function getLocale(): string {
  return currentLocale;
}

export function initI18nFromConfig(): void {
  setLocale(loadConfig().locale);
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] === undefined ? `{${key}}` : String(vars[key]),
  );
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const dict: LocaleDict = BUNDLED[currentLocale] ?? BUNDLED.en!;
  let value = dict[key];
  if (value === undefined) {
    value = BUNDLED.en![key];
    if (currentLocale !== "en" && value !== undefined && process.env.NODE_ENV !== "production") {
      console.warn(`[i18n] missing key "${key}" in locale "${currentLocale}", falling back to en`);
    }
  }
  if (value === undefined) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[i18n] missing key "${key}"`);
    }
    return key;
  }
  return interpolate(value, vars);
}

/** True when the key exists in the current locale or the en fallback (no warning). */
export function hasKey(key: string): boolean {
  return key in (BUNDLED[currentLocale] ?? {}) || key in BUNDLED.en!;
}

export function resetI18nForTests(): void {
  currentLocale = "en";
}
