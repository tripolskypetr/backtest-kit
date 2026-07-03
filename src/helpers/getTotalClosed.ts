import { ISignalDto, ISignalRow } from "../interfaces/Strategy.interface";
import { GLOBAL_CONFIG } from "../config/params";

interface Signal extends ISignalDto {
  priceOpen: number;
  _entry?: ISignalRow['_entry'];
  _partial?: ISignalRow['_partial'];
}


/**
 * Returns the total closed state of a position using costBasisAtClose snapshots.
 *
 * Each partial in _partial stores costBasisAtClose — the running cost basis BEFORE
 * that partial was applied. This avoids replaying the full entry history on every call.
 *
 * Cost-basis replay (simplified):
 *   for each partial[i]:
 *     closedDollar += (percent[i] / 100) × costBasisAtClose[i]
 *     remainingCostBasis = costBasisAtClose[i] × (1 - percent[i] / 100)
 *   // entries added AFTER last partial add directly to remainingCostBasis
 *   remainingCostBasis += Σ entry.cost for entries[lastEntryCount..]
 *
 * @param signal - Signal row with _partial and _entry arrays
 * @returns Object with totalClosedPercent (0–100) and remainingCostBasis (USD still open)
 */
export const getTotalClosed = (
  signal: Signal
): { totalClosedPercent: number; remainingCostBasis: number } => {
  const entries = signal._entry ?? [];
  const partials = signal._partial ?? [];
  // Fallback for signals without _entry (loaded from old persistence): use the
  // signal's own cost — the constant would corrupt the dollar basis of a
  // position opened with a custom cost.
  const totalInvested = entries.length > 0
    ? entries.reduce((s, e) => s + e.cost, 0)
    : signal.cost ?? GLOBAL_CONFIG.CC_POSITION_ENTRY_COST;

  if (partials.length === 0) {
    return {
      totalClosedPercent: 0,
      remainingCostBasis: totalInvested,
    };
  }

  let closedDollarValue = 0;
  let remainingCostBasis = 0;

  for (const partial of partials) {
    const partialDollarValue = (partial.percent / 100) * partial.costBasisAtClose;
    closedDollarValue += partialDollarValue;
    remainingCostBasis = partial.costBasisAtClose * (1 - partial.percent / 100);
  }

  // Add entries added AFTER the last partial
  const lastEntryCount = partials[partials.length - 1].entryCountAtClose;
  const newEntriesCost = entries.slice(lastEntryCount).reduce((s, e) => s + e.cost, 0);
  remainingCostBasis += newEntriesCost;

  return {
    totalClosedPercent: totalInvested > 0 ? (closedDollarValue / totalInvested) * 100 : 0,
    remainingCostBasis,
  };
};

export default getTotalClosed;
