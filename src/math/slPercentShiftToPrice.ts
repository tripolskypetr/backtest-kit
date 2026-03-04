/**
 * Convert a percentShift for `commitTrailingStop` back to an absolute stop-loss price.
 *
 * Inverse of `slPriceToPercentShift`.
 *
 * newSlDistancePercent = originalSlDistancePercent + percentShift
 * LONG:  newStopLossPrice = effectivePriceOpen * (1 - newSlDistancePercent / 100)
 * SHORT: newStopLossPrice = effectivePriceOpen * (1 + newSlDistancePercent / 100)
 *
 * @param percentShift - Value returned by `slPriceToPercentShift` (or passed to `commitTrailingStop`)
 * @param originalStopLossPrice - Original stop-loss price from the pending signal
 * @param effectivePriceOpen - Effective entry price (from `getPositionAveragePrice`)
 * @param position - Position direction: "long" or "short"
 * @returns Absolute stop-loss price corresponding to the given percentShift
 *
 * @example
 * // LONG: entry=100, originalSL=90, percentShift=-5
 * const price = slPercentShiftToPrice(-5, 90, 100, "long"); // 95
 */
export const slPercentShiftToPrice = (
  percentShift: number,
  originalStopLossPrice: number,
  effectivePriceOpen: number,
  position: "long" | "short"
): number => {
  const originalSlDistancePercent = Math.abs((effectivePriceOpen - originalStopLossPrice) / effectivePriceOpen * 100);
  const newSlDistancePercent = originalSlDistancePercent + percentShift;
  return position === "long"
    ? effectivePriceOpen * (1 - newSlDistancePercent / 100)
    : effectivePriceOpen * (1 + newSlDistancePercent / 100);
};

export default slPercentShiftToPrice;
