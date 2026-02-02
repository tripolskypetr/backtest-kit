import { singleshot, Subject } from "react-declarative";

import { LOCALE as LOCALE_EN } from "../locale/locale.en";
import { LOCALE as LOCALE_RU } from "../locale/locale.ru";

export type Locale = keyof typeof localeMap;

export const getLocale = singleshot((): keyof typeof localeMap => {
  const url = new URL(location.href, window.location.origin);
  // @ts-ignore
  return url.searchParams.get("locale") || "en";
})

export const localeChangedSubject = new Subject<void>();

export const setLocale = (locale: keyof typeof localeMap) => {
  const url = new URL(location.href, window.location.origin);
  url.searchParams.set("locale", locale);
  getLocale.clear();
  window.history.replaceState({}, "", url);
  window.Translate.clear();
  localeChangedSubject.next();
};

export const localeMap = {
  en: LOCALE_EN,
  ru: LOCALE_RU,
};

export const localeTrMap = {
  "en": "English",
  "ru": "Русский",
};

export function t(str: string) {
  const lang = getLocale();
  const locale = localeMap[lang];
  // @ts-ignore
  return locale ? locale[str] || str : str;
}

export default t;
