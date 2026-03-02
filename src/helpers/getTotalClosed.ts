import { ISignalRow } from "../interfaces/Strategy.interface";

const COST_BASIS_PER_ENTRY = 100;

/**
 * Returns the total closed state of a position using cost-basis replay.
 *
 * Correctly accounts for DCA entries added between partial closes via averageBuy().
 * Simple percent summation (sum of _partial[i].percent) is INCORRECT when averageBuy()
 * is called between partials — this function uses the same cost-basis replay as
 * toProfitLossDto to compute the true dollar-weighted closed fraction.
 *
 * Cost-basis replay:
 *   costBasis = 0
 *   for each partial[i]:
 *     costBasis += (entryCountAtClose[i] - entryCountAtClose[i-1]) × $100
 *     closedDollar += (percent[i] / 100) × costBasis
 *     costBasis ×= (1 - percent[i] / 100)
 *   // then add entries added AFTER the last partial
 *   costBasis += (currentEntryCount - lastPartialEntryCount) × $100
 *
 * @param signal - Signal row with _partial and _entry arrays
 * @returns Object with totalClosedPercent (0–100+) and remainingCostBasis (dollar value still open)
 */
export const getTotalClosed = (
  signal: ISignalRow
): { totalClosedPercent: number; remainingCostBasis: number } => {
  const partials = signal._partial ?? [];
  const currentEntryCount = signal._entry?.length ?? 1;
  const totalInvested = currentEntryCount * COST_BASIS_PER_ENTRY;

  if (partials.length === 0) {
    return {
      totalClosedPercent: 0,
      remainingCostBasis: totalInvested,
    };
  }

  let costBasis = 0;
  let closedDollarValue = 0;

  for (let i = 0; i < partials.length; i++) {
    const prevCount = i === 0 ? 0 : partials[i - 1].entryCountAtClose;
    costBasis += (partials[i].entryCountAtClose - prevCount) * COST_BASIS_PER_ENTRY;
    closedDollarValue += (partials[i].percent / 100) * costBasis;
    costBasis *= 1 - partials[i].percent / 100;
  }

  // Add entries added AFTER the last partial (not yet accounted for in the loop)
  const lastEntryCount = partials[partials.length - 1].entryCountAtClose;
  costBasis += (currentEntryCount - lastEntryCount) * COST_BASIS_PER_ENTRY;

  return {
    totalClosedPercent: totalInvested > 0 ? (closedDollarValue / totalInvested) * 100 : 0,
    remainingCostBasis: costBasis,
  };
};

export default getTotalClosed;
