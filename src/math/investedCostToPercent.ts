/**
 * Convert an absolute dollar amount to a percentage of a cost basis.
 * Use the result as the `percent` argument to `commitPartialProfit` / `commitPartialLoss`.
 *
 * IMPORTANT: `percentToClose` in partial closes is applied to the REMAINING
 * cost basis (what is still held after prior partials), not to the total
 * invested amount. To close an exact dollar amount, pass the remaining cost
 * basis from `getTotalCostClosed` as `costBasis` — not `getPositionInvestedCost`.
 *
 * @param dollarAmount - Dollar value to close (e.g. 150)
 * @param costBasis - Remaining cost basis from `getTotalCostClosed` (e.g. 300)
 * @returns Percentage of the remaining position to close (0–100)
 *
 * @example
 * const remaining = await getTotalCostClosed("BTCUSDT"); // e.g. 300
 * const percent = investedCostToPercent(150, remaining); // 50
 * await commitPartialProfit("BTCUSDT", percent);
 */
export const investedCostToPercent = (dollarAmount: number, costBasis: number): number => {
  return (dollarAmount / costBasis) * 100;
};

export default investedCostToPercent;
