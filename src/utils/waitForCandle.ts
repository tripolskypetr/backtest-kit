import { Source, Subject, memoize } from "functools-kit";
import { CandleInterval } from "../interfaces/Exchange.interface";

const EMITTER_CHECK_INTERVAL = 5_000;
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

const createEmitter = memoize(
  ([interval]) => `${interval}`,
  (interval: CandleInterval) => {
    const tickSubject = new Subject<number>();
    const intervalMs = INTERVAL_MINUTES[interval] * MS_PER_MINUTE;
    {
      let lastAligned = Math.floor(Date.now() / intervalMs) * intervalMs;
      Source.fromInterval(EMITTER_CHECK_INTERVAL)
        .map(() => Math.floor(Date.now() / intervalMs) * intervalMs)
        .filter((aligned) => {
          if (aligned !== lastAligned) {
            lastAligned = aligned;
            return true;
          }
          return false;
        })
        .connect(tickSubject.next);
    }
    return tickSubject;
  },
);

/**
 * Waits for the next candle interval to start and returns the timestamp of the new candle.
 * @param {CandleInterval} interval - The candle interval (e.g., "1m", "1h") to wait for.
 * @returns {Promise<number>} A promise that resolves with the timestamp (in milliseconds) of the next candle start.
 */
export const waitForCandle = async (interval: CandleInterval) => {
  const emitter = createEmitter(interval);
  // Subject is multicast
  return emitter.toPromise();
};
