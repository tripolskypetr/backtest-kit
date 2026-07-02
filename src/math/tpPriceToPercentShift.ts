/**
 * Convert an absolute take-profit price to a percentShift for `commitTrailingTake`.
 *
 * percentShift = newTpDistancePercent - originalTpDistancePercent
 *
 * The new distance is SIGNED by position direction (mirrors how ClientStrategy
 * applies the shift): a take-profit moved past the entry produces a negative
 * distance, so any target price is expressible —
 * `tpPercentShiftToPrice(tpPriceToPercentShift(x, ...), ...) === x` holds for
 * targets on both sides of the entry.
 *
 * LONG:  newTpDistancePercent = (newTakeProfitPrice - effectivePriceOpen) / effectivePriceOpen * 100
 * SHORT: newTpDistancePercent = (effectivePriceOpen - newTakeProfitPrice) / effectivePriceOpen * 100
 *
 * @param newTakeProfitPrice - Desired absolute take-profit price
 * @param originalTakeProfitPrice - Original take-profit price from the pending signal
 * @param effectivePriceOpen - Effective entry price (from `getPositionEffectivePrice`)
 * @param position - Position direction: "long" or "short"
 * @returns percentShift to pass to `commitTrailingTake`
 *
 * @example
 * // LONG: entry=100, originalTP=110, desired newTP=107
 * const shift = tpPriceToPercentShift(107, 110, 100, "long"); // -3
 * await commitTrailingTake("BTCUSDT", shift, currentPrice);
 */
export const tpPriceToPercentShift = (
  newTakeProfitPrice: number,
  originalTakeProfitPrice: number,
  effectivePriceOpen: number,
  position: "long" | "short"
): number => {
  const originalTpDistancePercent = Math.abs((originalTakeProfitPrice - effectivePriceOpen) / effectivePriceOpen * 100);
  const newTpDistancePercent = position === "long"
    ? (newTakeProfitPrice - effectivePriceOpen) / effectivePriceOpen * 100
    : (effectivePriceOpen - newTakeProfitPrice) / effectivePriceOpen * 100;
  return newTpDistancePercent - originalTpDistancePercent;
};

export default tpPriceToPercentShift;
