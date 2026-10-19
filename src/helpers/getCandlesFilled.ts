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
  /**
   * How many CONSECUTIVE grid positions without a sane source candle (missing
   * or anomalous rows) are filled flat before the function throws — tells a
   * technical pause from a delisting. Counted across request boundaries.
   * Infinity disables the limit. Default: GLOBAL_CONFIG.CC_GET_CANDLES_MAX_GAP_STREAK.
   */
  maxGapStreak?: number;
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
 * A row without a volume is a SOURCE CONTRACT violation, not a bad tick: the
 * fetcher must put 0 when the exchange has no volume. Reported with its own
 * message instead of being counted as an anomaly, so the operator sees the
 * real cause rather than "anomalous candles in a row".
 *
 * @throws Error if any row has a null/undefined volume
 */
const ASSERT_VOLUME_PRESENT_FN = (
  candles: TRawOHLCV[],
  symbol: string,
  interval: string,
): void => {
  for (const [timestamp, , , , , volume] of candles) {
    if (volume == null) {
      throw new Error(
        `getCandlesFilled: candle at ${new Date(timestamp!).toISOString()} (${symbol} ${interval}) has no volume - ` +
          `the source must return [timestamp, open, high, low, close, volume] with volume set (use 0 when the exchange has none)`,
      );
    }
  }
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

/**
 * Last known SANE close BEFORE ts (look only into the past, no look ahead) and
 * the number of anomalous rows between that close and ts.
 *
 * Rows are walked backwards from ts; every anomalous row (same rules as the
 * window, reference price taken over the rows of each lookup call) increments
 * `anomalyStreak`, the first sane row ends the walk and supplies the fill
 * price. The streak is returned so the caller can continue counting into the
 * window: a run of broken bars must not be laundered by cutting it at a window
 * boundary — with the engine's typical 1–2 bar windows that would let a month
 * of broken bars pass as a chain of short streaks, each filled from a close
 * weeks old.
 *
 * The sane row's timestamp is returned as well: the caller derives the number
 * of grid positions without a sane candle between it and the window start
 * (missing and anomalous rows alike) — the gap streak that continues into the
 * window, see maxGapStreak.
 *
 * @returns null when no sane row exists within the lookback (3 × 1000 rows)
 */
const fetchLastCloseBefore = async (
  fetchOHLCV: TFetchOHLCV,
  symbol: string,
  interval: string,
  stepMs: number,
  ts: number,
): Promise<{ close: number; timestamp: number; anomalyStreak: number } | null> => {
  let anomalyStreak = 0;
  // Rows at or after this timestamp were already walked by a previous chunk
  let walkedFrom = ts;
  for (let back = 1; back <= 3; back++) {
    const since = ts - back * 1000 * stepMs;
    const candles = await fetchOHLCV(symbol, interval, since, 1000);
    ASSERT_VOLUME_PRESENT_FN(candles, symbol, interval);
    const minValidPrice = GET_MIN_VALID_PRICE_FN(candles);
    const rows = candles
      .filter((candle) => candle[0]! < walkedFrom)
      .sort((a, b) => b[0]! - a[0]!);
    for (const row of rows) {
      if (!IS_ANOMALOUS_FN(row, minValidPrice)) {
        return { close: row[4]!, timestamp: row[0]!, anomalyStreak };
      }
      anomalyStreak += 1;
    }
    if (rows.length) {
      walkedFrom = rows[rows.length - 1][0]!;
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
 * (missing row) neither counts nor resets it. The streak is counted ACROSS the
 * window boundary: when the window does not open with a sane candle, the
 * anomalous rows between the last sane close before the window and the window
 * start are counted first (see fetchLastCloseBefore), so splitting a broken
 * stretch into many short windows cannot launder it. The fill price itself is
 * always the close of a non-anomalous row (window or history before it).
 *
 * Independently of the anomaly streak, the total run of grid positions WITHOUT
 * a sane candle (missing rows and anomalous rows together) is capped by
 * `maxGapStreak` (default GLOBAL_CONFIG.CC_GET_CANDLES_MAX_GAP_STREAK), also
 * counted across the window boundary from the last sane candle before the
 * window. A weekend or a short exchange outage is filled; a delisting that
 * leaves the feed empty for longer throws instead of producing weeks of a
 * flat market.
 *
 * A row with a null/undefined volume is a source contract violation and
 * throws its own error immediately (not counted as an anomaly).
 */
export const getCandlesFilled = async (
  fetchOHLCV: TFetchOHLCV,
  { symbol, interval, since, limit }: IGetCandlesFilledParams,
  {
    maxAnomalyStreak = GLOBAL_CONFIG.CC_GET_CANDLES_MAX_ANOMALY_STREAK,
    maxGapStreak = GLOBAL_CONFIG.CC_GET_CANDLES_MAX_GAP_STREAK,
  }: IGetCandlesFilledConfig = {},
): Promise<ICandle[]> => {
  const stepMs = getIntervalMs(interval);
  const start = Math.ceil(since.getTime() / stepMs) * stepMs;
  const candles = await fetchOHLCV(symbol, interval, start, limit);
  ASSERT_VOLUME_PRESENT_FN(candles, symbol, interval);
  const minValidPrice = GET_MIN_VALID_PRICE_FN(candles);
  const byTimestamp = new Map(candles.map((candle) => [candle[0], candle]));
  const startCandle = byTimestamp.get(start);
  let lastClose: number | null = null;
  let anomalyStreak = 0;
  // Consecutive grid positions without a sane candle (missing or anomalous)
  let gapStreak = 0;
  if (!startCandle || IS_ANOMALOUS_FN(startCandle, minValidPrice)) {
    // The window does not open with a sane candle: the fill price AND both
    // running streaks come from the history before the window.
    const before = await fetchLastCloseBefore(fetchOHLCV, symbol, interval, stepMs, start);
    if (before) {
      lastClose = before.close;
      anomalyStreak = before.anomalyStreak;
      if (anomalyStreak > maxAnomalyStreak) {
        throw new Error(
          `getCandlesFilled: ${anomalyStreak} anomalous candles in a row before ` +
            `${new Date(start).toISOString()} (${symbol} ${interval}) exceed maxAnomalyStreak=${maxAnomalyStreak} - ` +
            `the source feed is broken, refusing to fabricate a flat market`,
        );
      }
      // Grid positions strictly between the last sane candle and the window start
      gapStreak = Math.round((start - before.timestamp) / stepMs) - 1;
      if (gapStreak > maxGapStreak) {
        throw new Error(
          `getCandlesFilled: ${gapStreak} candles without a sane source row before ` +
            `${new Date(start).toISOString()} (${symbol} ${interval}, last sane candle at ${new Date(before.timestamp).toISOString()}) ` +
            `exceed maxGapStreak=${maxGapStreak} - the feed is dead (delisting / suspension), refusing to fabricate a flat market`,
        );
      }
    }
  }
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
      gapStreak = 0;
    } else {
      gapStreak += 1;
      if (gapStreak > maxGapStreak) {
        throw new Error(
          `getCandlesFilled: ${gapStreak} candles without a sane source row ending at ` +
            `${new Date(ts).toISOString()} (${symbol} ${interval}) exceed maxGapStreak=${maxGapStreak} - ` +
            `the feed is dead (delisting / suspension), refusing to fabricate a flat market`,
        );
      }
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
