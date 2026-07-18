import { Subject, memoize } from "functools-kit";
import { CandleInterval } from "../interfaces/Exchange.interface";

const MS_PER_MINUTE = 60_000;

/**
 * Extra delay past the interval boundary before emitting, so the exchange has
 * flushed the just-closed candle by the time listeners react.
 */
const BOUNDARY_GUARD_MS = 25;

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
    // Sleep straight to the next interval boundary instead of polling every few
    // seconds: no wakeups between boundaries and no up-to-poll-interval lag.
    const scheduleNext = () => {
      const now = Date.now();
      const nextBoundary = Math.floor(now / intervalMs) * intervalMs + intervalMs;
      const timer = setTimeout(() => {
        // Timers may fire marginally early; re-arm without emitting in that case
        if (Date.now() < nextBoundary) {
          scheduleNext();
          return;
        }
        tickSubject.next(nextBoundary);
        scheduleNext();
      }, nextBoundary - now + BOUNDARY_GUARD_MS);
      // Do not keep the process alive just for the candle clock
      timer.unref?.();
    };
    scheduleNext();
    return tickSubject;
  },
);

/**
 * Waits for the next candle interval to start and returns the timestamp of the new candle.
 *
 * Holds the process alive for the DURATION OF THE AWAIT: the shared clock above is
 * deliberately unref'd (a passive clock is no reason to live), but a caller awaiting
 * the next candle IS — without this keepalive a headless live/paper run (no UI, no
 * sockets) drains the event loop between ticks and silently exits with code 0
 * ~30s after start, mid-await (observed as a supervisor crash-loop with thousands
 * of clean "restarts"). The keepalive is scoped to the await and cleared on resolve,
 * so a process that merely IMPORTED the clock still exits freely.
 *
 * @param {CandleInterval} interval - The candle interval (e.g., "1m", "1h") to wait for.
 * @returns {Promise<number>} A promise that resolves with the timestamp (in milliseconds) of the next candle start.
 */
export const waitForCandle = async (interval: CandleInterval) => {
  const emitter = createEmitter(interval);
  // Ref'd on purpose — see the docstring. Never fires any meaningful work.
  const keepAlive = setInterval(() => void 0, 60_000);
  try {
    // Subject is multicast
    return await emitter.toPromise();
  } finally {
    clearInterval(keepAlive);
  }
};
