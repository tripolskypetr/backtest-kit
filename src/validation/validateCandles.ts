import { ICandleData } from "../interfaces/Exchange.interface";
import { GLOBAL_CONFIG } from "../config/params";

/**
 * Validates that all candles have valid OHLCV data without anomalies.
 *
 * Guards the candle cache against corrupt adapter output before it is persisted:
 * - Rejects non-finite values (NaN / Infinity / -Infinity), which JSON would
 *   silently serialize to null and break VWAP on the next read.
 * - Rejects zero / negative prices and negative volume.
 * - Detects incomplete candles from exchange APIs (abnormally low prices, e.g.
 *   0.1 instead of 100,000) by comparing against a reference price.
 *
 * @param candles - Array of candle data to validate
 * @throws Error if any candle has anomalous OHLCV values
 */
export const validateCandles = (candles: ICandleData[]): void => {
  if (candles.length === 0) {
    return;
  }

  // Calculate reference price (median or average depending on candle count)
  const allPrices = candles.flatMap((c) => [c.open, c.high, c.low, c.close]);
  const validPrices = allPrices.filter((p) => p > 0);

  let referencePrice: number;
  if (candles.length >= GLOBAL_CONFIG.CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN) {
    // Use median for reliable statistics with enough data
    const sortedPrices = [...validPrices].sort((a, b) => a - b);
    referencePrice = sortedPrices[Math.floor(sortedPrices.length / 2)] || 0;
  } else {
    // Use average for small datasets (more stable than median)
    const sum = validPrices.reduce((acc, p) => acc + p, 0);
    referencePrice = validPrices.length > 0 ? sum / validPrices.length : 0;
  }

  if (referencePrice === 0) {
    throw new Error(
      `validateCandles: cannot calculate reference price (all prices are zero)`,
    );
  }

  const minValidPrice =
    referencePrice /
    GLOBAL_CONFIG.CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    // Check for invalid numeric values
    if (
      !Number.isFinite(candle.open) ||
      !Number.isFinite(candle.high) ||
      !Number.isFinite(candle.low) ||
      !Number.isFinite(candle.close) ||
      !Number.isFinite(candle.volume) ||
      !Number.isFinite(candle.timestamp)
    ) {
      throw new Error(
        `validateCandles: candle[${i}] has invalid numeric values (NaN or Infinity)`,
      );
    }

    // Check for negative values
    if (
      candle.open <= 0 ||
      candle.high <= 0 ||
      candle.low <= 0 ||
      candle.close <= 0 ||
      candle.volume < 0
    ) {
      throw new Error(
        `validateCandles: candle[${i}] has zero or negative values`,
      );
    }

    // OHLC coherence: high < low is definitionally corrupt — such a candle
    // would silently skew VWAP ((h+l+c)/3) and scheduled activation (low/high
    // breach checks). Deliberately NOT extended to open/close vs high/low:
    // cross-feed aggregation occasionally puts open/close a rounding step
    // outside [low, high] on real exchanges.
    if (candle.high < candle.low) {
      throw new Error(
        `validateCandles: candle[${i}] has high (${candle.high}) < low (${candle.low})`,
      );
    }

    // Check for anomalously low prices (incomplete candle indicator)
    if (
      candle.open < minValidPrice ||
      candle.high < minValidPrice ||
      candle.low < minValidPrice ||
      candle.close < minValidPrice
    ) {
      throw new Error(
        `validateCandles: candle[${i}] has anomalously low price. ` +
          `OHLC: [${candle.open}, ${candle.high}, ${candle.low}, ${candle.close}], ` +
          `reference: ${referencePrice}, threshold: ${minValidPrice}`,
      );
    }
  }
};

export default validateCandles;
