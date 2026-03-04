/**
 * Compute the effective take-profit price for a breakeven operation.
 *
 * Breakeven does not change the take-profit. Returns the currently effective TP:
 * `_trailingPriceTakeProfit` if set (trailing TP active), otherwise `priceTakeProfit`.
 *
 * @param priceTakeProfit - Original take-profit price from the pending signal
 * @param trailingPriceTakeProfit - Trailing take-profit override, or undefined if not set
 * @returns Effective take-profit price (unchanged by breakeven)
 *
 * @example
 * // No trailing TP set
 * const newTP = breakevenNewTakeProfitPrice(110, undefined); // 110
 *
 * // Trailing TP active
 * const newTP = breakevenNewTakeProfitPrice(110, 107); // 107
 */
export const breakevenNewTakeProfitPrice = (
  priceTakeProfit: number,
  trailingPriceTakeProfit: number | undefined
): number => {
  return trailingPriceTakeProfit ?? priceTakeProfit;
};

export default breakevenNewTakeProfitPrice;
