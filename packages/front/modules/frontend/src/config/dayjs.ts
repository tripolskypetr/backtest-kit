import dayjs from "dayjs";
import isToday from "dayjs/plugin/isToday";
import localeData from "dayjs/plugin/localeData";
import ruLocale from "dayjs/locale/ru";
import uzLocale from "dayjs/locale/uz-latn";
import utc from "dayjs/plugin/utc";
import { CC_DAYJS_LOCALE } from "./params";

dayjs.extend(localeData);
dayjs.extend(utc);
dayjs.extend(isToday);

if (CC_DAYJS_LOCALE === "RU") {
    dayjs.locale(ruLocale);
} else if (CC_DAYJS_LOCALE === "UZ") {
    dayjs.locale(uzLocale);
} else {
    dayjs.locale(ruLocale);
}
