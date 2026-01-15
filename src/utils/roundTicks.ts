/**
 * Rounds a price to the appropriate precision based on the tick size.
 *
 * @param {string | number} price - The price to round, can be a string or number
 * @param {number} tickSize - The tick size that determines the precision (e.g., 0.01 for 2 decimal places)
 * @returns {string} The price rounded to the precision specified by the tick size
 *
 * @example
 * roundTicks(123.456789, 0.01) // returns "123.46"
 * roundTicks("100.12345", 0.001) // returns "100.123"
 */
export const roundTicks = (price: string | number, tickSize: number) => {
    const formatter = new Intl.NumberFormat('en-US', {
        style: 'decimal',
        minimumFractionDigits: 0,
        maximumFractionDigits: 8
    });
    // @ts-ignore
    const precision = formatter.format(tickSize).split('.')[1].length || 0;
    if (typeof price === 'string') price = parseFloat(price);
    return price.toFixed(precision);
};
