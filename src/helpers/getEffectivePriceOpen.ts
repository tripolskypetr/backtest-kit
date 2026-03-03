import { ISignalRow } from "../interfaces/Strategy.interface";

/**
 * Returns the effective (DCA-weighted) entry price for a signal.
 *
 * Uses cost-weighted harmonic mean: effectivePrice = Σcost / Σ(cost/price)
 * This is the correct formula for fixed-dollar DCA positions where each entry
 * has its own cost (e.g. $100, $200, etc.).
 *
 * When partial closes exist, iterates through all partials to maintain a running
 * effective price, then blends with any new DCA entries after the last partial:
 *   - partial[0]: effectivePrice = costBasisAtClose[0] / Σ(cost/price for entries[0..cnt[0]])
 *   - partial[j>0]: remainingCB = prev.costBasisAtClose * (1 - prev.percent/100)
 *                   oldCoins = remainingCB / prevEffPrice
 *                   blend with new entries between prev and curr partial
 *   - final: blend remaining position with entries added after last partial
 *
 * @param signal - Signal row with _entry and optional _partial
 * @returns Effective entry price for PNL calculations
 */
export const getEffectivePriceOpen = (signal: ISignalRow): number => {
  const entries = signal._entry;
  if (!entries || entries.length === 0) return signal.priceOpen;

  const partials = signal._partial ?? [];

  if (partials.length === 0) {
    return weightedHarmonicMean(entries);
  }

  // Compute effective price iteratively through all partials
  const effAtLast = computeEffectivePriceAtPartial(entries, partials, partials.length - 1, signal.priceOpen);

  const last = partials[partials.length - 1];
  const remainingCostBasis = last.costBasisAtClose * (1 - last.percent / 100);
  const oldCoins = effAtLast === 0 ? 0 : remainingCostBasis / effAtLast;

  // New DCA entries added AFTER last partial
  const newEntries = entries.slice(last.entryCountAtClose);
  const newCoins = newEntries.reduce((s, e) => s + e.cost / e.price, 0);
  const newCost = newEntries.reduce((s, e) => s + e.cost, 0);

  const totalCoins = oldCoins + newCoins;
  if (totalCoins === 0) return effAtLast;

  return (remainingCostBasis + newCost) / totalCoins;
};

/**
 * Computes the effective entry price at the moment of partials[targetIndex].
 *
 * Iterates from partial[0] up to partial[targetIndex], maintaining a running
 * effective price using the costBasisAtClose snapshots.
 */
export const computeEffectivePriceAtPartial = (
  entries: Array<{ price: number; cost: number }>,
  partials: Array<{ costBasisAtClose: number; entryCountAtClose: number; percent: number }>,
  targetIndex: number,
  fallbackPrice: number,
): number => {
  const p0 = partials[0];
  const entriesAtP0 = entries.slice(0, p0.entryCountAtClose);
  const coinsAtP0 = entriesAtP0.reduce((s, e) => s + e.cost / e.price, 0);
  let effPrice = coinsAtP0 === 0 ? fallbackPrice : p0.costBasisAtClose / coinsAtP0;

  for (let j = 1; j <= targetIndex; j++) {
    const prev = partials[j - 1];
    const curr = partials[j];
    const remainingCB = prev.costBasisAtClose * (1 - prev.percent / 100);
    const oldCoins = effPrice === 0 ? 0 : remainingCB / effPrice;
    const newEntries = entries.slice(prev.entryCountAtClose, curr.entryCountAtClose);
    const newCoins = newEntries.reduce((s, e) => s + e.cost / e.price, 0);
    const newCost = newEntries.reduce((s, e) => s + e.cost, 0);
    const totalCoins = oldCoins + newCoins;
    effPrice = totalCoins === 0 ? effPrice : (remainingCB + newCost) / totalCoins;
  }

  return effPrice;
};

/**
 * Cost-weighted harmonic mean: Σcost / Σ(cost/price)
 * Equivalent to standard harmonic mean when all costs are equal.
 */
const weightedHarmonicMean = (entries: Array<{ price: number; cost: number }>): number => {
  const totalCost = entries.reduce((s, e) => s + e.cost, 0);
  const totalCoins = entries.reduce((s, e) => s + e.cost / e.price, 0);
  if (totalCoins === 0) return 0;
  return totalCost / totalCoins;
};

export default getEffectivePriceOpen;
