/**
 * Calculate the percentage change from yesterday's value to today's value.
 *
 * Formula: ((todayValue - yesterdayValue) / yesterdayValue) * 100
 *
 * Positive result — value grew, negative — value dropped.
 *
 * @param {number} yesterdayValue - The value from yesterday (base of comparison).
 * @param {number} todayValue - The value from today.
 * @returns {number} The percentage change from yesterday to today (e.g. 5 for +5%).
 *
 * @example
 * percentValue(100, 105); // 5
 * percentValue(100, 95);  // -5
 */
export const percentValue = (yesterdayValue: number, todayValue: number) => {
  return (todayValue / yesterdayValue - 1) * 100;
};

export default percentValue;
