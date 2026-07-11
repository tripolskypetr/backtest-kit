import { singleshot, Subject } from "react-declarative";

import { LOCALE as LOCALE_EN } from "../locale/locale.en";
import { LOCALE as LOCALE_RU } from "../locale/locale.ru";
import { LOCALE as LOCALE_TR } from "../locale/locale.tr";
import { LOCALE as LOCALE_ZH } from "../locale/locale.zh";
import { LOCALE as LOCALE_HI } from "../locale/locale.hi";
import { LOCALE as LOCALE_ES } from "../locale/locale.es";
import { LOCALE as LOCALE_PT } from "../locale/locale.pt";

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
  tr: LOCALE_TR,
  zh: LOCALE_ZH,
  hi: LOCALE_HI,
  es: LOCALE_ES,
  pt: LOCALE_PT,
};

export function t(str: string) {
  const lang = getLocale();
  const locale = localeMap[lang];
  // @ts-ignore
  return locale ? locale[str] || str : str;
}

export default t;
