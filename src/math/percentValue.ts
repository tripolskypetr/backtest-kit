/**
 * Calculate the percentage change from yesterday's value to today's value.
 * @param {number} yesterdayValue - The value from yesterday.
 * @param {number} todayValue - The value from today.
 * @returns {number} The percentage change from yesterday to today.
 */
export const percentValue = (yesterdayValue: number, todayValue: number) => {
  return yesterdayValue / todayValue - 1;
};

export default percentValue;
