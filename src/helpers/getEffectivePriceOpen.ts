import { ISignalRow } from "../interfaces/Strategy.interface";

const COST_BASIS_PER_ENTRY = 100;

/**
 * Returns the effective entry price for price calculations.
 *
 * Uses harmonic mean (correct for fixed-dollar DCA: $100 per entry).
 *
 * When partial closes exist, replays the partial sequence to reconstruct
 * the running cost basis at each partial — no extra stored fields needed.
 *
 * Cost basis replay:
 *   costBasis starts at 0
 *   for each partial[i]:
 *     newEntries = entryCountAtClose[i] - entryCountAtClose[i-1]  (or entryCountAtClose[0] for i=0)
 *     costBasis += newEntries × $100          ← add DCA entries up to this partial
 *     positionCostBasisAtClose[i] = costBasis ← snapshot BEFORE close
 *     costBasis × = (1 - percent[i] / 100)    ← reduce after close
 *
 * @param signal - Signal row
 * @returns Effective entry price for PNL calculations
 */
export const getEffectivePriceOpen = (signal: ISignalRow): number => {
  if (!signal._entry || signal._entry.length === 0) return signal.priceOpen;

  const entries = signal._entry;
  const partials = signal._partial ?? [];

  // No partial exits — pure harmonic mean of all entries
  if (partials.length === 0) {
    return harmonicMean(entries.map((e) => e.price));
  }

  // Replay cost basis through all partials to get snapshot at the last one
  let costBasis = 0;
  for (let i = 0; i < partials.length; i++) {
    const prevCount = i === 0 ? 0 : partials[i - 1].entryCountAtClose;
    const newEntryCount = partials[i].entryCountAtClose - prevCount;
    costBasis += newEntryCount * COST_BASIS_PER_ENTRY;
    // costBasis is now positionCostBasisAtClose for partials[i]
    if (i < partials.length - 1) {
      costBasis *= 1 - partials[i].percent / 100;
    }
  }

  const lastPartial = partials[partials.length - 1];

  // Dollar cost basis remaining after the last partial close
  const remainingCostBasis = costBasis * (1 - lastPartial.percent / 100);

  // Coins remaining from the old position
  const oldCoins = remainingCostBasis / lastPartial.effectivePrice;

  // New DCA entries added AFTER the last partial close
  const newEntries = entries.slice(lastPartial.entryCountAtClose);

  // Coins from new DCA entries (each costs $100)
  const newCoins = newEntries.reduce((sum, e) => sum + 100 / e.price, 0);

  const totalCoins = oldCoins + newCoins;
  if (totalCoins === 0) return lastPartial.effectivePrice;

  const totalCost = remainingCostBasis + newEntries.length * 100;

  return totalCost / totalCoins;
};

const harmonicMean = (prices: number[]): number => {
  if (prices.length === 0) return 0;
  return prices.length / prices.reduce((sum, p) => sum + 1 / p, 0);
};

export default getEffectivePriceOpen;