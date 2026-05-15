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
};

/**
 * Returns the step in milliseconds for a given candle interval.
 * For example, for "15m" interval, it returns 900000 (15 * 60 * 1000).
 *
 * @param interval - Candle interval (e.g., "1m", "15m", "1h")
 * @returns Step in milliseconds corresponding to the interval
 */
export const intervalStepMs = (interval: CandleInterval) => {
    return INTERVAL_MINUTES[interval] * MS_PER_MINUTE;
}
