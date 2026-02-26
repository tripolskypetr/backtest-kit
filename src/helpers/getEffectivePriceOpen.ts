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
  if (signal._entry && signal._entry.length > 0) {
    return signal._entry.reduce((sum, e) => sum + e.price, 0) / signal._entry.length;
  }
  return signal.priceOpen;
};

export default getEffectivePriceOpen;
