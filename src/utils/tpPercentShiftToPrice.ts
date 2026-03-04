/**
 * Convert a percentShift for `commitTrailingTake` back to an absolute take-profit price.
 *
 * Inverse of `tpPriceToPercentShift`.
 *
 * newTpDistancePercent = originalTpDistancePercent + percentShift
 * LONG:  newTakeProfitPrice = effectivePriceOpen * (1 + newTpDistancePercent / 100)
 * SHORT: newTakeProfitPrice = effectivePriceOpen * (1 - newTpDistancePercent / 100)
 *
 * @param percentShift - Value returned by `tpPriceToPercentShift` (or passed to `commitTrailingTake`)
 * @param originalTakeProfitPrice - Original take-profit price from the pending signal
 * @param effectivePriceOpen - Effective entry price (from `getPositionAveragePrice`)
 * @param position - Position direction: "long" or "short"
 * @returns Absolute take-profit price corresponding to the given percentShift
 *
 * @example
 * // LONG: entry=100, originalTP=110, percentShift=-3
 * const price = tpPercentShiftToPrice(-3, 110, 100, "long"); // 107
 */
export const tpPercentShiftToPrice = (
  percentShift: number,
  originalTakeProfitPrice: number,
  effectivePriceOpen: number,
  position: "long" | "short"
): number => {
  const originalTpDistancePercent = Math.abs((originalTakeProfitPrice - effectivePriceOpen) / effectivePriceOpen * 100);
  const newTpDistancePercent = originalTpDistancePercent + percentShift;
  return position === "long"
    ? effectivePriceOpen * (1 + newTpDistancePercent / 100)
    : effectivePriceOpen * (1 - newTpDistancePercent / 100);
};

export default tpPercentShiftToPrice;
