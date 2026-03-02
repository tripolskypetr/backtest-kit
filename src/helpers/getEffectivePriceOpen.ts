import { ISignalRow } from "../interfaces/Strategy.interface";

/**
 * Returns the effective entry price for price calculations.
 *
 * When the _entry array exists and has at least one element, returns
 * the simple arithmetic mean of all entry prices (DCA average).
 * Otherwise returns the original signal.priceOpen.
 *
 * This mirrors the _trailingPriceStopLoss pattern: original price is preserved
 * in signal.priceOpen (for identity/tracking), while calculations use the
 * effective averaged price returned by this function.
 *
 * @param signal - Signal row (ISignalRow or IScheduledSignalRow)
 * @returns Effective entry price for distance and PNL calculations
 */
export const getEffectivePriceOpen = (signal: ISignalRow): number => {
  if (!signal._entry || signal._entry.length === 0) return signal.priceOpen;

  const entries = signal._entry;
  const partials = signal._partial ?? [];

  // Базовый случай: нет partial exits — чистое гармоническое среднее
  if (partials.length === 0) {
    return harmonicMean(entries.map(e => e.price));
  }

  // Берём последний partial — он содержит актуальный effectivePrice и entryCount
  const lastPartial = partials[partials.length - 1];
  const totalClosedPercent = partials.reduce((sum, p) => sum + p.percent, 0);
  const remainingPercent = (100 - totalClosedPercent) / 100; // доля [0..1]

  // Новые DCA-входы после последнего partial
  const newEntries = entries.slice(lastPartial.entryCountAtClose);

  // Количество монет, оставшихся от "старой" позиции:
  // totalCoinsAtLastPartial = entryCountAtClose * 100 / effectivePrice
  // remainingOldCoins = remainingPercent * totalCoinsAtLastPartial
  const oldCoins =
    remainingPercent * (lastPartial.entryCountAtClose * 100) / lastPartial.effectivePrice;

  // Монеты от новых DCA
  const newCoins = newEntries.reduce((sum, e) => sum + 100 / e.price, 0);

  const totalCoins = oldCoins + newCoins;
  if (totalCoins === 0) return lastPartial.effectivePrice;

  // Стоимость: старая часть + новые $100 × N входов
  const totalCost = oldCoins * lastPartial.effectivePrice + newEntries.length * 100;

  return totalCost / totalCoins;
};

const harmonicMean = (prices: number[]): number => {
  if (prices.length === 0) return 0;
  return prices.length / prices.reduce((sum, p) => sum + 1 / p, 0);
};

export default getEffectivePriceOpen;
