import { ICandleData } from "../interfaces/Exchange.interface";
import { GLOBAL_CONFIG } from "../config/params";

/** Bars on each side of a candle that form its local reference window */
const NEIGHBOR_RADIUS = 2;

/**
 * Structural sanity of a single candle: finite values, positive prices,
 * non-negative volume, high >= low.
 */
const IS_STRUCTURALLY_SANE_FN = (candle: ICandleData): boolean => {
  const { timestamp, open, high, low, close, volume } = candle;
  if (![timestamp, open, high, low, close, volume].every((v) => Number.isFinite(v))) {
    return false;
  }
  if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0) {
    return false;
  }
  return high >= low;
};

/**
 * Human-readable reason why candles[index] is anomalous, or null when it is sane.
 *
 * Price rule: every price of the candle must lie within
 * CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR of its LOCAL reference — the
 * median close of the structurally sane candles within NEIGHBOR_RADIUS
 * positions on each side, the candle itself included. Candles are expected in
 * ascending timestamp order (the adapter contract), neighbours are taken by
 * position.
 */
const GET_ANOMALY_REASON_FN = (
  candles: ICandleData[],
  sane: boolean[],
  index: number,
): string | null => {
  const candle = candles[index];
  const { open, high, low, close, volume } = candle;
  if (![candle.timestamp, open, high, low, close, volume].every((v) => Number.isFinite(v))) {
    return `candle[${index}] has invalid numeric values (NaN or Infinity)`;
  }
  if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0) {
    return `candle[${index}] has zero or negative values`;
  }
  // OHLC coherence: high < low is definitionally corrupt — such a candle
  // would silently skew VWAP ((h+l+c)/3) and scheduled activation (low/high
  // breach checks). Deliberately NOT extended to open/close vs high/low:
  // cross-feed aggregation occasionally puts open/close a rounding step
  // outside [low, high] on real exchanges.
  if (high < low) {
    return `candle[${index}] has high (${high}) < low (${low})`;
  }
  const closes: number[] = [];
  const from = Math.max(0, index - NEIGHBOR_RADIUS);
  const to = Math.min(candles.length - 1, index + NEIGHBOR_RADIUS);
  for (let j = from; j <= to; j++) {
    if (sane[j]) {
      closes.push(candles[j].close);
    }
  }
  closes.sort((a, b) => a - b);
  const reference = closes[Math.floor(closes.length / 2)];
  const factor = GLOBAL_CONFIG.CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR;
  const minValid = reference / factor;
  const maxValid = reference * factor;
  if ([open, high, low, close].some((p) => p < minValid || p > maxValid)) {
    return (
      `candle[${index}] has a price out of range of its neighbours. ` +
      `OHLC: [${open}, ${high}, ${low}, ${close}], ` +
      `reference: ${reference} (median close of ${closes.length} neighbouring candles), ` +
      `allowed: [${minValid}, ${maxValid}]`
    );
  }
  return null;
};

/**
 * Anomaly flags for a run of candles, one per candle (true = anomalous).
 *
 * A candle is anomalous when it fails the structural rules (non-finite
 * values, zero/negative prices, negative volume, high < low) or when any of
 * its prices is further than CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR
 * away — below OR above — from its LOCAL reference: the median close of the
 * structurally sane candles within NEIGHBOR_RADIUS positions on each side,
 * itself included.
 *
 * Why neighbours and not the whole-array median: a bad tick (Binance
 * incomplete candle at 0.1 when the price is 42,000; Yahoo low 0.00043 at
 * price 1.07) is thousands of times off its neighbours and is caught; a
 * genuine crash (LUNA, May 2022) moves in 10-100x daily steps, every bar
 * stays within the factor of the bars around it and passes — an array-wide
 * median would brand the whole post-crash tail anomalous and abort the run.
 * The candle's own close is part of the reference, so a bad low or high is
 * caught even in a single-candle array. Only a run of >= 3 adjacent candles
 * broken in ALL four prices can hide inside a 5-candle window.
 *
 * Shared by the engine (validateCandles) and the candle-fetcher helpers
 * getCandlesFilled / getCandlesSampled, which repair flagged source rows.
 */
export const getCandleAnomalyFlags = (candles: ICandleData[]): boolean[] => {
  const sane = candles.map(IS_STRUCTURALLY_SANE_FN);
  return candles.map((_, index) => GET_ANOMALY_REASON_FN(candles, sane, index) !== null);
};

/**
 * Validates that all candles have valid OHLCV data without anomalies.
 *
 * Guards the candle cache against corrupt adapter output before it is persisted:
 * - Rejects non-finite values (NaN / Infinity / -Infinity), which JSON would
 *   silently serialize to null and break VWAP on the next read.
 * - Rejects zero / negative prices and negative volume, and high < low.
 * - Detects bad ticks / incomplete candles from exchange APIs (e.g. 0.1
 *   instead of 42,000) by comparing every price against the candle's
 *   NEIGHBOURS (see getCandleAnomalyFlags), so a genuine multi-candle crash
 *   is not mistaken for corrupt data.
 *
 * @param candles - Array of candle data to validate, ascending by timestamp
 * @throws Error if any candle has anomalous OHLCV values
 */
export const validateCandles = (candles: ICandleData[]): void => {
  if (candles.length === 0) {
    return;
  }
  const sane = candles.map(IS_STRUCTURALLY_SANE_FN);
  for (let i = 0; i < candles.length; i++) {
    const reason = GET_ANOMALY_REASON_FN(candles, sane, i);
    if (reason !== null) {
      throw new Error(`validateCandles: ${reason}`);
    }
  }
};

export default validateCandles;
