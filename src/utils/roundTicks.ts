/**
 * Rounds a price to the appropriate precision based on the tick size.
 *
 * @param {string | number} price - The price to round, can be a string or number
 * @param {number} tickSize - The tick size that determines the precision (e.g., 0.01 for 2 decimal places)
 * @returns {string} The price rounded to the precision specified by the tick size
 * @throws {Error} If tickSize is not a positive finite number
 *
 * @example
 * roundTicks(123.456789, 0.01) // returns "123.46"
 * roundTicks("100.12345", 0.001) // returns "100.123"
 * roundTicks(123.456789, 1) // returns "123"
 * roundTicks(123.456789, 1e-9) // returns "123.456789000"
 */
export const roundTicks = (price: string | number, tickSize: number) => {
    if (typeof tickSize !== "number" || !isFinite(tickSize) || tickSize <= 0) {
        throw new Error(`roundTicks: tickSize must be a positive finite number, got ${tickSize}`);
    }
    let precision: number;
    const tickStr = tickSize.toString();
    if (tickStr.includes("e") || tickStr.includes("E")) {
        // Exponential form (e.g. 1e-9 or 1e+21): derive decimals from the exponent
        precision = Math.max(0, Math.ceil(-Math.log10(tickSize)));
    } else {
        precision = tickStr.split(".")[1]?.length ?? 0;
    }
    // toFixed supports at most 100 fraction digits
    precision = Math.min(precision, 100);
    if (typeof price === 'string') price = parseFloat(price);
    return price.toFixed(precision);
};
