import { CandleInterval } from "../interfaces/Exchange.interface";

const MS_PER_MINUTE = 60_000;

const INTERVAL_MINUTES: Record<CandleInterval, number> = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "2h": 120,
  "4h": 240,
  "6h": 360,
  "8h": 480,
  "1d": 1440,
  "1w": 10080,
};

/**
 * Aligns timestamp down to the nearest interval boundary.
 * For example, for 15m interval: 00:17 -> 00:15, 00:44 -> 00:30
 *
 * Candle timestamp convention:
 * - Candle timestamp = openTime (when candle opens)
 * - Candle with timestamp 00:00 covers period [00:00, 00:15) for 15m interval
 *
 * Adapter contract:
 * - Adapter must return candles with timestamp = openTime
 * - First returned candle.timestamp must equal aligned since
 * - Adapter must return exactly `limit` candles
 *
 * @param date - Date to align
 * @param interval - Candle interval (e.g., "1m", "15m", "1h")
 * @returns New Date aligned down to interval boundary
 */
export const alignToInterval = (
  date: Date,
  interval: CandleInterval,
): Date => {
  const minutes = INTERVAL_MINUTES[interval];
  if (minutes === undefined) {
    throw new Error(`alignToInterval: unknown interval=${interval}`);
  }
  const intervalMs = minutes * MS_PER_MINUTE;
  return new Date(Math.floor(date.getTime() / intervalMs) * intervalMs);
};
