import {
  getCandlesFilled,
  getIntervalMs,
  ICandle,
  IGetCandlesFilledConfig,
  IGetCandlesFilledParams,
  TFetchOHLCV,
} from "./getCandlesFilled";

export interface IGetCandlesSampledConfig extends IGetCandlesFilledConfig {
  /**
   * Interval the exchange natively serves (e.g. "1d" for Yahoo Finance), as
   * opposed to `interval` — the one the engine asks for. `interval` must be
   * equal to it or divide it evenly. Default: "1d".
   */
  nativeInterval?: string;
}

/**
 * Returns limit candles of a LOWER interval (1m, 5m, 1h, ...) synthesized from
 * the exchange's NATIVE higher interval (default 1d) for sources that only
 * serve daily bars (Yahoo Finance). Asking for the native interval itself
 * (`interval === nativeInterval`) passes the native candles through unchanged.
 *
 * Every target candle inside a native bar is a copy of that bar: same open /
 * high / low / close, volume = native volume / (native / target ratio), so
 * the volumes of the synthesized candles sum back to the native volume (VWAP
 * weights stay equal within a bar either way).
 *
 * The native window is read through getCandlesFilled with the same config, so
 * gaps and anomalous bars in the native feed (holidays, bad ticks) are
 * repaired with a flat bar from the last known close without look-ahead, a
 * gap with no history before it throws, and more than `maxAnomalyStreak`
 * anomalous bars in a row throw.
 *
 * NOTE on look-ahead: a daily bar's high/low/close are known only at the end
 * of the day, yet every synthesized minute of that day carries them. This is
 * inherent to sampling a daily source and is the accepted trade-off for
 * such backtests (combine with CC_BACKTEST_STEP_MINUTES to evaluate once per
 * native bar).
 *
 * @throws Error if `interval` is larger than `nativeInterval` or does not
 *   divide it evenly (e.g. "7m" into "1d")
 */
export const getCandlesSampled = async (
  fetchOHLCV: TFetchOHLCV,
  { symbol, interval, since, limit }: IGetCandlesFilledParams,
  { nativeInterval = "1d", ...filledConfig }: IGetCandlesSampledConfig = {},
): Promise<ICandle[]> => {
  const stepMs = getIntervalMs(interval);
  const nativeMs = getIntervalMs(nativeInterval);
  if (stepMs > nativeMs) {
    throw new Error(
      `getCandlesSampled: interval ${interval} must not be larger than nativeInterval ${nativeInterval}`,
    );
  }
  if (nativeMs % stepMs !== 0) {
    throw new Error(
      `getCandlesSampled: interval ${interval} must divide nativeInterval ${nativeInterval} evenly`,
    );
  }
  if (stepMs === nativeMs) {
    return await getCandlesFilled(fetchOHLCV, { symbol, interval, since, limit }, filledConfig);
  }
  const ratio = nativeMs / stepMs;
  const start = Math.ceil(since.getTime() / stepMs) * stepMs;
  const end = start + limit * stepMs;
  const nativeStart = Math.floor(start / nativeMs) * nativeMs;
  const nativeLimit = Math.ceil((end - nativeStart) / nativeMs);
  const native = await getCandlesFilled(fetchOHLCV, {
    symbol,
    interval: nativeInterval,
    since: new Date(nativeStart),
    limit: nativeLimit,
  }, filledConfig);
  const result: ICandle[] = [];
  for (let i = 0; i < limit; i++) {
    const timestamp = start + i * stepMs;
    const bar = native[Math.floor((timestamp - nativeStart) / nativeMs)];
    result.push({
      timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume / ratio,
    });
  }
  return result;
};
