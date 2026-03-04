/**
 * Compute the dollar cost of a partial close from percentToClose and current invested cost basis.
 *
 * cost = (percentToClose / 100) * investedCost
 *
 * @param percentToClose - Percentage of position to close (0–100)
 * @param investedCost - Current invested cost basis (from `getPositionInvestedCost`)
 * @returns Dollar amount that will be closed
 *
 * @example
 * // Position investedCost=$1000, closing 25%
 * const cost = percentToCloseCost(25, 1000); // 250
 */
export const percentToCloseCost = (
  percentToClose: number,
  investedCost: number
): number => {
  return (percentToClose / 100) * investedCost;
};

export default percentToCloseCost;
