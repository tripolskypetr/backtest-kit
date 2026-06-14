/**
 * Derives the number of decimal places to show for a price based on its
 * magnitude — a display heuristic for reports, NOT exchange tick-size precision.
 *
 * The scale steps in even increments (2, 4, 6, 8): cheaper coins (most of
 * Binance's catalogue) get more decimals, one step of two per decimal order:
 *
 * - 1 and up     -> 2   (e.g. 10.00, 100.00, BTC 50000.00)
 * - 0.1 .. 0.99  -> 4   (e.g. 0.5000)
 * - 0.01 .. 0.099-> 6   (e.g. 0.050000)
 * - below 0.01   -> 8   (e.g. 0.00001234)
 *
 * For real order placement use the symbol's PRICE_FILTER.tickSize from
 * exchangeInfo instead — magnitude is only an approximation of it.
 *
 * @param value - The price to derive the decimal scale for
 * @returns The number of digits after the decimal point (always even, 2..8)
 */
export const getPriceScale = (value: number): number => {
    const abs = Math.abs(value);
    if (abs === 0) {
        return 2;
    }
    // Even ladder by decimal order of magnitude: 2 for >=1, then +2 per order down.
    const magnitude = Math.floor(Math.log10(abs));
    return Math.min(8, Math.max(2, 2 - magnitude * 2));
};

export default getPriceScale;
