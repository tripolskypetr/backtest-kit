/**
 * Convert an absolute dollar amount to a percentage of the invested position cost.
 * Use the result as the `percent` argument to `commitPartialProfit` / `commitPartialLoss`.
 *
 * @param dollarAmount - Dollar value to close (e.g. 150)
 * @param investedCost - Total invested cost from `getPositionInvestedCost` (e.g. 300)
 * @returns Percentage of the position to close (0–100)
 *
 * @example
 * const percent = investedCostToPercent(150, 300); // 50
 * await commitPartialProfit("BTCUSDT", percent);
 */
export const investedCostToPercent = (dollarAmount: number, investedCost: number): number => {
  return (dollarAmount / investedCost) * 100;
};

export default investedCostToPercent;
