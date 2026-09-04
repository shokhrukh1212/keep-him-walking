import { en, type Dictionary } from "./en";

export const supportedLocales = ["en"] as const;
export type Locale = typeof supportedLocales[number];

export function hasLocale(value: string): value is Locale {
  return supportedLocales.includes(value as Locale);
}

export function dictionaryFor(locale: string | null | undefined): Dictionary {
  return locale && hasLocale(locale) ? en : en;
}
