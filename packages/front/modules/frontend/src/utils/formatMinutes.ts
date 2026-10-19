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

const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MINUTES_PER_DAY = MINUTES_PER_HOUR * HOURS_PER_DAY;

/**
 * Formats a duration in minutes with full unit words, e.g. "2 hours 15 minutes"
 * or "3 days 2 hours 15 minutes". Durations under an hour render as minutes
 * only; once the duration exceeds 24 hours the whole days are split off and
 * the remainder keeps the hours/minutes form. Zero parts are omitted
 * ("2 hours", "3 days", "3 days 15 minutes").
 */
export const formatMinutes = (minutes: number): string => {
    const days = minutes > MINUTES_PER_DAY ? Math.floor(minutes / MINUTES_PER_DAY) : 0;
    const hours = Math.floor((minutes - days * MINUTES_PER_DAY) / MINUTES_PER_HOUR);
    const mins = minutes % MINUTES_PER_HOUR;
    const parts: string[] = [];
    if (days) {
        parts.push(`${days} ${pluralWord(
            days,
            t("day"),
            t("days (few)"),
            t("days"),
        )}`);
    }
    if (hours) {
        parts.push(`${hours} ${pluralWord(
            hours,
            t("hour"),
            t("hours (few)"),
            t("hours"),
        )}`);
    }
    if (mins || !parts.length) {
        parts.push(`${mins} ${pluralWord(
            mins,
            t("minute"),
            t("minutes (few)"),
            t("minutes"),
        )}`);
    }
    return parts.join(" ");
};

export default formatMinutes;
