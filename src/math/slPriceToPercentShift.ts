/**
 * Convert an absolute stop-loss price to a percentShift for `commitTrailingStop`.
 *
 * percentShift = newSlDistancePercent - originalSlDistancePercent
 *
 * The new distance is SIGNED by position direction (mirrors how ClientStrategy
 * applies the shift): a stop-loss moved past the entry into the profit zone
 * produces a negative distance, so any target price is expressible —
 * `slPercentShiftToPrice(slPriceToPercentShift(x, ...), ...) === x` holds for
 * targets on both sides of the entry.
 *
 * LONG:  newSlDistancePercent = (effectivePriceOpen - newStopLossPrice) / effectivePriceOpen * 100
 * SHORT: newSlDistancePercent = (newStopLossPrice - effectivePriceOpen) / effectivePriceOpen * 100
 *
 * @param newStopLossPrice - Desired absolute stop-loss price
 * @param originalStopLossPrice - Original stop-loss price from the pending signal
 * @param effectivePriceOpen - Effective entry price (from `getPositionEffectivePrice`)
 * @param position - Position direction: "long" or "short"
 * @returns percentShift to pass to `commitTrailingStop`
 *
 * @example
 * // LONG: entry=100, originalSL=90, desired newSL=95
 * const shift = slPriceToPercentShift(95, 90, 100, "long"); // -5
 * // LONG: entry=100, originalSL=90, desired newSL=105 (profit zone)
 * const shiftProfit = slPriceToPercentShift(105, 90, 100, "long"); // -15
 * await commitTrailingStop("BTCUSDT", shift, currentPrice);
 */
export const slPriceToPercentShift = (
  newStopLossPrice: number,
  originalStopLossPrice: number,
  effectivePriceOpen: number,
  position: "long" | "short"
): number => {
  const originalSlDistancePercent = Math.abs((effectivePriceOpen - originalStopLossPrice) / effectivePriceOpen * 100);
  const newSlDistancePercent = position === "long"
    ? (effectivePriceOpen - newStopLossPrice) / effectivePriceOpen * 100
    : (newStopLossPrice - effectivePriceOpen) / effectivePriceOpen * 100;
  return newSlDistancePercent - originalSlDistancePercent;
};

export default slPriceToPercentShift;
