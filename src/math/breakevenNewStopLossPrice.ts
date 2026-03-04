/**
 * Compute the new stop-loss price for a breakeven operation.
 *
 * Breakeven moves the SL to the effective entry price (effectivePriceOpen).
 * The value is the same regardless of position direction.
 *
 * @param effectivePriceOpen - Effective entry price (from `getPositionAveragePrice`)
 * @returns New stop-loss price equal to the effective entry price
 *
 * @example
 * // LONG: entry=100, SL was 90 → breakeven SL = 100
 * const newSL = breakevenNewStopLossPrice(100); // 100
 *
 * // SHORT: entry=100, SL was 110 → breakeven SL = 100
 * const newSL = breakevenNewStopLossPrice(100); // 100
 */
export const breakevenNewStopLossPrice = (
  effectivePriceOpen: number
): number => {
  return effectivePriceOpen;
};

export default breakevenNewStopLossPrice;
