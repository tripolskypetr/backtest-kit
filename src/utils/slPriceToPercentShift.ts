/**
 * Convert an absolute stop-loss price to a percentShift for `commitTrailingStop`.
 *
 * percentShift = newSlDistancePercent - originalSlDistancePercent
 * where distance = Math.abs((effectivePriceOpen - slPrice) / effectivePriceOpen * 100)
 *
 * @param newStopLossPrice - Desired absolute stop-loss price
 * @param originalStopLossPrice - Original stop-loss price from the pending signal
 * @param effectivePriceOpen - Effective entry price (from `getPositionAveragePrice`)
 * @returns percentShift to pass to `commitTrailingStop`
 *
 * @example
 * // LONG: entry=100, originalSL=90, desired newSL=95
 * const shift = slPriceToPercentShift(95, 90, 100); // -5
 * await commitTrailingStop("BTCUSDT", shift, currentPrice);
 */
export const slPriceToPercentShift = (
  newStopLossPrice: number,
  originalStopLossPrice: number,
  effectivePriceOpen: number
): number => {
  const originalSlDistancePercent = Math.abs((effectivePriceOpen - originalStopLossPrice) / effectivePriceOpen * 100);
  const newSlDistancePercent = Math.abs((effectivePriceOpen - newStopLossPrice) / effectivePriceOpen * 100);
  return newSlDistancePercent - originalSlDistancePercent;
};

export default slPriceToPercentShift;
