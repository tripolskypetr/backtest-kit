/**
 * Calculate the percentage difference between two numbers.
 *
 * The result is how many percent the larger value exceeds the smaller one:
 * percentDiff(100, 150) === 50, percentDiff(150, 100) === 50.
 *
 * Edge cases are reported honestly instead of a sentinel value:
 * - Both values equal (including 0, 0) — returns 0.
 * - One value is 0 and the other is not — returns Infinity
 *   (the difference is unbounded; no finite percent can express it).
 *
 * @param {number} a - The first number.
 * @param {number} b - The second number.
 * @returns {number} The percentage difference between the two numbers.
 */
export const percentDiff = (a: number, b: number): number => {
  const max = Math.max(a, b);
  const min = Math.min(a, b);
  if (max === min) {
    return 0;
  }
  if (min === 0) {
    return Infinity;
  }
  return 100 / (min / max) - 100;
};

export default percentDiff;
