/**
 * Convert an absolute take-profit price to a percentShift for `commitTrailingTake`.
 *
 * percentShift = newTpDistancePercent - originalTpDistancePercent
 * where distance = Math.abs((tpPrice - effectivePriceOpen) / effectivePriceOpen * 100)
 *
 * @param newTakeProfitPrice - Desired absolute take-profit price
 * @param originalTakeProfitPrice - Original take-profit price from the pending signal
 * @param effectivePriceOpen - Effective entry price (from `getPositionAveragePrice`)
 * @returns percentShift to pass to `commitTrailingTake`
 *
 * @example
 * // LONG: entry=100, originalTP=110, desired newTP=107
 * const shift = tpPriceToPercentShift(107, 110, 100); // -3
 * await commitTrailingTake("BTCUSDT", shift, currentPrice);
 */
export const tpPriceToPercentShift = (
  newTakeProfitPrice: number,
  originalTakeProfitPrice: number,
  effectivePriceOpen: number
): number => {
  const originalTpDistancePercent = Math.abs((originalTakeProfitPrice - effectivePriceOpen) / effectivePriceOpen * 100);
  const newTpDistancePercent = Math.abs((newTakeProfitPrice - effectivePriceOpen) / effectivePriceOpen * 100);
  return newTpDistancePercent - originalTpDistancePercent;
};

export default tpPriceToPercentShift;
