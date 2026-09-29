import { getLocale, t } from "../i18n";

/**
 * Picks the right unit word for a count using the plural rules of the
 * current locale (e.g. ru: 1 час / 2 часа / 5 часов, en: 1 hour / 21 hours).
 */
const pluralWord = (
    count: number,
    one: string,
    few: string,
    many: string,
): string => {
    const category = new Intl.PluralRules(getLocale()).select(count);
    if (category === "one") {
        return one;
    }
    if (category === "two" || category === "few") {
        return few;
    }
    return many;
};

/**
 * Formats a duration in minutes as hours and minutes with full unit words,
 * e.g. "2 hours 15 minutes". Durations under an hour render as minutes only,
 * whole hours omit the zero-minutes part.
 */
export const formatMinutes = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const minutesLabel = `${mins} ${pluralWord(
        mins,
        t("minute"),
        t("minutes (few)"),
        t("minutes"),
    )}`;
    if (!hours) {
        return minutesLabel;
    }
    const hoursLabel = `${hours} ${pluralWord(
        hours,
        t("hour"),
        t("hours (few)"),
        t("hours"),
    )}`;
    if (!mins) {
        return hoursLabel;
    }
    return `${hoursLabel} ${minutesLabel}`;
};

export default formatMinutes;
