import { GLOBAL_CONFIG } from "../config/params";

export interface ICandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Raw exchange OHLCV candle: [timestamp, open, high, low, close, volume].
 * Elements allow undefined so any source fits without casts.
 */
export type TRawOHLCV = (number | undefined)[];

/**
 * Raw candle source. since is in milliseconds; must return
 * up to limit candles starting from the first candle >= since.
 */
export type TFetchOHLCV = (
  symbol: string,
  interval: string,
  since: number,
  limit: number,
) => Promise<TRawOHLCV[]>;

export interface IGetCandlesFilledParams {
  symbol: string;
  interval: string;
  since: Date;
  limit: number;
}

export interface IGetCandlesFilledConfig {
  /**
   * How many CONSECUTIVE anomalous source candles are repaired with a flat
   * fill before the function throws. Default:
   * GLOBAL_CONFIG.CC_GET_CANDLES_MAX_ANOMALY_STREAK.
   */
  maxAnomalyStreak?: number;
}

const INTERVAL_UNITS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Interval string ("1m", "15m", "4h", "1d") to its duration in milliseconds.
 * @throws Error if the interval is not <number><m|h|d>
 */
export const getIntervalMs = (interval: string) => {
  const match = interval.match(/^(\d+)([mhd])$/);
  if (!match) {
    throw new Error(`unsupported interval: ${interval}`);
  }
  return Number(match[1]) * INTERVAL_UNITS[match[2]];
};

/**
 * Lower bound of a sane price for the window: reference price divided by
 * CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR. Same rule as validateCandles:
 * reference = median of all OHLC values when the window has at least
 * CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN candles, plain average below that.
 * Returns 0 (no price-level check) when the window has no positive price.
 */
const GET_MIN_VALID_PRICE_FN = (candles: TRawOHLCV[]): number => {
  const validPrices = candles
    .flatMap(([, open, high, low, close]) => [open, high, low, close])
    .filter((p): p is number => Number.isFinite(p) && p! > 0);
  if (!validPrices.length) {
    return 0;
  }
  let referencePrice: number;
  if (candles.length >= GLOBAL_CONFIG.CC_GET_CANDLES_MIN_CANDLES_FOR_MEDIAN) {
    const sortedPrices = [...validPrices].sort((a, b) => a - b);
    referencePrice = sortedPrices[Math.floor(sortedPrices.length / 2)] || 0;
  } else {
    referencePrice = validPrices.reduce((acc, p) => acc + p, 0) / validPrices.length;
  }
  return referencePrice / GLOBAL_CONFIG.CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR;
};

/**
 * Anomalous raw candle — the validateCandles definition applied to a single
 * raw row: non-finite values, zero/negative prices, negative volume,
 * high < low, or any price below the window's minimum valid price.
 */
const IS_ANOMALOUS_FN = (candle: TRawOHLCV, minValidPrice: number): boolean => {
  const [, open, high, low, close, volume] = candle;
  if (![open, high, low, close, volume].every((v) => Number.isFinite(v))) {
    return true;
  }
  if (open! <= 0 || high! <= 0 || low! <= 0 || close! <= 0 || volume! < 0) {
    return true;
  }
  if (high! < low!) {
    return true;
  }
  if (open! < minValidPrice || high! < minValidPrice || low! < minValidPrice || close! < minValidPrice) {
    return true;
  }
  return false;
};

// Last known close BEFORE ts: look only into the past, no look ahead.
// Rows without a finite positive close are skipped (a broken bar must not
// become the fill price).
const fetchLastCloseBefore = async (
  fetchOHLCV: TFetchOHLCV,
  symbol: string,
  interval: string,
  stepMs: number,
  ts: number,
) => {
  for (let back = 1; back <= 3; back++) {
    const since = ts - back * 1000 * stepMs;
    const candles = await fetchOHLCV(symbol, interval, since, 1000);
    const prev = candles
      .filter(([timestamp, , , , close]) => timestamp! < ts && Number.isFinite(close) && close! > 0)
      .pop();
    if (prev) {
      return prev[4]!;
    }
  }
  return null;
};

/**
 * Returns limit candles starting from since on a continuous interval grid.
 * Source gaps (exchange downtime) are filled with a flat candle from the
 * last known close (volume = 0) - strictly without look ahead:
 * for a gap at the start of the window, the last close is searched in the
 * past before the window. If a gap cannot be filled (no history before the
 * window - the symbol was not traded yet), throws an exception: the result
 * is always exactly limit candles.
 *
 * Anomalous source candles (see IS_ANOMALOUS_FN — the validateCandles rules
 * with the GLOBAL_CONFIG thresholds) are treated as gaps and repaired the
 * same way, but only up to `maxAnomalyStreak` in a row (config argument,
 * default GLOBAL_CONFIG.CC_GET_CANDLES_MAX_ANOMALY_STREAK): a longer streak
 * throws, because a feed that is broken for that long must not be replaced by
 * a fabricated flat market. A sane candle resets the streak; a plain gap
 * (missing row) neither counts nor resets it.
 */
export const getCandlesFilled = async (
  fetchOHLCV: TFetchOHLCV,
  { symbol, interval, since, limit }: IGetCandlesFilledParams,
  { maxAnomalyStreak = GLOBAL_CONFIG.CC_GET_CANDLES_MAX_ANOMALY_STREAK }: IGetCandlesFilledConfig = {},
): Promise<ICandle[]> => {
  const stepMs = getIntervalMs(interval);
  const start = Math.ceil(since.getTime() / stepMs) * stepMs;
  const candles = await fetchOHLCV(symbol, interval, start, limit);
  const minValidPrice = GET_MIN_VALID_PRICE_FN(candles);
  const byTimestamp = new Map(candles.map((candle) => [candle[0], candle]));
  const startCandle = byTimestamp.get(start);
  let lastClose = startCandle && !IS_ANOMALOUS_FN(startCandle, minValidPrice)
    ? null
    : await fetchLastCloseBefore(fetchOHLCV, symbol, interval, stepMs, start);
  let anomalyStreak = 0;
  const result: ICandle[] = [];
  for (let i = 0; i < limit; i++) {
    const ts = start + i * stepMs;
    let candle = byTimestamp.get(ts);
    if (candle && IS_ANOMALOUS_FN(candle, minValidPrice)) {
      anomalyStreak += 1;
      if (anomalyStreak > maxAnomalyStreak) {
        throw new Error(
          `getCandlesFilled: ${anomalyStreak} anomalous candles in a row ending at ` +
            `${new Date(ts).toISOString()} (${symbol} ${interval}) exceed maxAnomalyStreak=${maxAnomalyStreak} - ` +
            `the source feed is broken, refusing to fabricate a flat market`,
        );
      }
      candle = undefined;
    } else if (candle) {
      anomalyStreak = 0;
    }
    if (candle) {
      const [timestamp, open, high, low, close, volume] = candle;
      result.push({
        timestamp: timestamp!,
        open: open!,
        high: high!,
        low: low!,
        close: close!,
        volume: volume!,
      });
      lastClose = close!;
    } else if (lastClose !== null) {
      result.push({
        timestamp: ts,
        open: lastClose,
        high: lastClose,
        low: lastClose,
        close: lastClose,
        volume: 0,
      });
    }
  }
  if (result.length !== limit) {
    throw new Error(
      `getCandlesFilled: expected ${limit} candles, got ${result.length} ` +
        `(${symbol} ${interval} from ${new Date(start).toISOString()}) - ` +
        `no data to fill the gap without look ahead`,
    );
  }
  return result;
};
