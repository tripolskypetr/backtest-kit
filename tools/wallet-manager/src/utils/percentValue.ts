/**
 * Calculates the percentage value of a given number.
 *
 * @param {number} value - The base value to calculate the percentage from.
 * @param {number} percent - The percentage to apply to the base value.
 * @returns {number} The calculated percentage value.
 */
export const percentValue = (value: number, percent: number): number => {
    return (value * percent) / 100;
};
