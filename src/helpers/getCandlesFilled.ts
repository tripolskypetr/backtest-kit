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

const INTERVAL_UNITS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

const getIntervalMs = (interval: string) => {
  const match = interval.match(/^(\d+)([mhd])$/);
  if (!match) {
    throw new Error(`unsupported interval: ${interval}`);
  }
  return Number(match[1]) * INTERVAL_UNITS[match[2]];
};

// Last known close BEFORE ts: look only into the past, no look ahead
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
    const prev = candles.filter(([timestamp]) => timestamp! < ts).pop();
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
 */
export const getCandlesFilled = async (
  fetchOHLCV: TFetchOHLCV,
  { symbol, interval, since, limit }: IGetCandlesFilledParams,
): Promise<ICandle[]> => {
  const stepMs = getIntervalMs(interval);
  const start = Math.ceil(since.getTime() / stepMs) * stepMs;
  const candles = await fetchOHLCV(symbol, interval, start, limit);
  const byTimestamp = new Map(candles.map((candle) => [candle[0], candle]));
  let lastClose = byTimestamp.has(start)
    ? null
    : await fetchLastCloseBefore(fetchOHLCV, symbol, interval, stepMs, start);
  const result: ICandle[] = [];
  for (let i = 0; i < limit; i++) {
    const ts = start + i * stepMs;
    const candle = byTimestamp.get(ts);
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
