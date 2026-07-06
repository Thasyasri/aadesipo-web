import { useSyncExternalStore } from "react";
import { en } from "./locales/en";

export type Catalog = typeof en;
export type SupportedLocale = "en"; // grows to "hi" | "te" | "ta" | "bn" | ... as translations land

const CATALOGS: Record<SupportedLocale, Catalog> = { en };

const STORAGE_KEY = "aadesipo-locale";

// Recursively builds every dotted path through the catalog as a union
// of string literals, e.g. "hud.roll" | "gameLog.diceRolled" | ... —
// this is what makes t("gamLog.dceRolled") (a typo) a compile error
// instead of a silent missing-string bug at runtime.
type DottedPaths<T, Prefix extends string = ""> = T extends string
  ? Prefix
  : {
      [K in keyof T & string]: DottedPaths<T[K], `${Prefix}${Prefix extends "" ? "" : "."}${K}`>;
    }[keyof T & string];

export type TranslationKey = DottedPaths<Catalog>;

function resolvePath(catalog: Catalog, path: string): string {
  const value = path.split(".").reduce<unknown>((node, segment) => {
    if (node && typeof node === "object" && segment in node) {
      return (node as Record<string, unknown>)[segment];
    }
    return undefined;
  }, catalog);
  return typeof value === "string" ? value : path; // missing key falls back to the key itself, visibly
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

let currentLocale: SupportedLocale =
  (typeof localStorage !== "undefined" &&
    (localStorage.getItem(STORAGE_KEY) as SupportedLocale | null)) ||
  "en";

const listeners = new Set<() => void>();

export function setLocale(locale: SupportedLocale): void {
  currentLocale = locale;
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, locale);
  listeners.forEach((l) => l());
}

export function getLocale(): SupportedLocale {
  return currentLocale;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `t("hud.roll")` or `t("hud.payBail", { amount: 50 })`. */
export function useTranslation(): {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  locale: SupportedLocale;
} {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  const catalog = CATALOGS[locale];

  const t = (key: TranslationKey, params?: Record<string, string | number>): string =>
    interpolate(resolvePath(catalog, key), params);

  return { t, locale };
}
