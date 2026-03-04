/**
 * Calculate the percentage difference between two numbers.
 * @param {number} a - The first number.
 * @param {number} b - The second number.
 * @returns {number} The percentage difference between the two numbers.
 */
export const percentDiff = (a = 1, b = 2) => {
  const result = 100 / (Math.min(a, b) / Math.max(a, b)) - 100;
  return Number.isFinite(result) ? result : 100;
};

export default percentDiff;
