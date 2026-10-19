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

/** Bars on each side of a row that form its local reference window */
const NEIGHBOR_RADIUS = 2;

/**
 * Structural part of the validateCandles rules, applied to one raw row:
 * finite values, positive prices, non-negative volume, high >= low.
 */
const IS_STRUCTURALLY_SANE_FN = (candle: TRawOHLCV): boolean => {
  const [, open, high, low, close, volume] = candle;
  if (![open, high, low, close, volume].every((v) => Number.isFinite(v))) {
    return false;
  }
  if (open! <= 0 || high! <= 0 || low! <= 0 || close! <= 0 || volume! < 0) {
    return false;
  }
  return high! >= low!;
};

/**
 * Anomaly flags for an ASCENDING run of raw rows, one per row.
 *
 * A row is anomalous when it fails the structural rules, or when any of its
 * prices is further than CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR away
 * (below OR above) from its LOCAL reference: the median close of the
 * structurally sane rows within NEIGHBOR_RADIUS positions on each side,
 * the row itself included.
 *
 * Why neighbours and not the window median (validateCandles): a bad tick
 * (Yahoo: low 0.00043 at price 1.07) is thousands of times off its
 * neighbours and still fails; a genuine crash (LUNA, May 2022) moves in
 * 10-100x daily steps, every bar stays within the factor of the bars around
 * it and passes — the window median would brand the whole post-crash tail
 * anomalous. The row's own close is part of the reference, so a bad low or
 * high is caught even in a single-row window. Only a run of >= 3 adjacent
 * rows broken in ALL four prices can hide inside a 5-row window.
 */
const GET_ANOMALY_FLAGS_FN = (rows: TRawOHLCV[]): boolean[] => {
  const factor = GLOBAL_CONFIG.CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR;
  const sane = rows.map(IS_STRUCTURALLY_SANE_FN);
  return rows.map((row, i) => {
    if (!sane[i]) {
      return true;
    }
    const closes: number[] = [];
    const from = Math.max(0, i - NEIGHBOR_RADIUS);
    const to = Math.min(rows.length - 1, i + NEIGHBOR_RADIUS);
    for (let j = from; j <= to; j++) {
      if (sane[j]) {
        closes.push(rows[j][4]!);
      }
    }
    closes.sort((x, y) => x - y);
    const reference = closes[Math.floor(closes.length / 2)];
    const minValid = reference / factor;
    const maxValid = reference * factor;
    const [, open, high, low, close] = row;
    return [open!, high!, low!, close!].some((p) => p < minValid || p > maxValid);
  });
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
 * Last known SANE close BEFORE ts (look only into the past, no look ahead) and
 * the number of anomalous rows between that close and ts.
 *
 * Rows are walked backwards from ts; every anomalous row (same neighbour-based
 * rules as the window, judged among the rows of each lookup call) increments
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
    // Only rows before the window judge each other: no future row takes part
    // in deciding whether a past row is sane
    const rows = candles
      .filter((candle) => candle[0]! < walkedFrom)
      .sort((a, b) => a[0]! - b[0]!);
    const anomalous = GET_ANOMALY_FLAGS_FN(rows);
    for (let i = rows.length - 1; i >= 0; i--) {
      if (!anomalous[i]) {
        return { close: rows[i][4]!, timestamp: rows[i][0]!, anomalyStreak };
      }
      anomalyStreak += 1;
    }
    if (rows.length) {
      walkedFrom = rows[0][0]!;
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
 * Anomalous source candles (see GET_ANOMALY_FLAGS_FN — the structural rules of
 * validateCandles plus a price check against the row's NEIGHBOURS using
 * CC_GET_CANDLES_PRICE_ANOMALY_THRESHOLD_FACTOR) are treated as gaps and
 * repaired the same way, but only up to `maxAnomalyStreak` in a row (config argument,
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
  const rows = [...candles].sort((a, b) => a[0]! - b[0]!);
  const flags = GET_ANOMALY_FLAGS_FN(rows);
  const anomalousTimestamps = new Set(rows.filter((_, i) => flags[i]).map((row) => row[0]!));
  const byTimestamp = new Map(rows.map((candle) => [candle[0], candle]));
  const startCandle = byTimestamp.get(start);
  let lastClose: number | null = null;
  let anomalyStreak = 0;
  // Consecutive grid positions without a sane candle (missing or anomalous)
  let gapStreak = 0;
  if (!startCandle || anomalousTimestamps.has(start)) {
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
    if (candle && anomalousTimestamps.has(ts)) {
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
