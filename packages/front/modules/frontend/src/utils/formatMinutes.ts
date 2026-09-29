import { t } from "../i18n";

/**
 * Formats a duration in minutes as hours and minutes, e.g. "2 h 15 min".
 * Durations under an hour render as minutes only, whole hours omit "0 min".
 */
export const formatMinutes = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (!hours) {
        return `${mins} ${t("min")}`;
    }
    if (!mins) {
        return `${hours} ${t("h")}`;
    }
    return `${hours} ${t("h")} ${mins} ${t("min")}`;
};

export default formatMinutes;
