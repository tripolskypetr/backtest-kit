import LoggerService from "../lib/services/base/LoggerService";
import { GLOBAL_CONFIG } from "../config/params";
import { Lock } from "./Lock";
import { sleep, Subject } from "functools-kit";
import { Lookup } from "./Lookup";

const METHOD_NAME_ACQUIRE_LOCK = "CandleUtils.acquireLock";
const METHOD_NAME_RELEASE_LOCK = "CandleUtils.releaseLock";
const METHOD_NAME_SPIN_LOCK = "CandleUtils.spinLock";

/**
 * Upper bound (ms) on how long `spinLock` may park before falling through.
 * If no peer backtest acquires the candle-fetch mutex within this window,
 * the spinner proceeds without further yielding.
 */
const ROTATE_DELAY = 50;

/** Logger service injected as DI singleton */
const LOGGER_SERVICE = new LoggerService();

/**
 * Process-wide coordinator for candle-fetch serialization and cooperative
 * yielding between parallel backtests.
 *
 * Two complementary primitives are exposed:
 * - **Mutex** via {@link acquireLock} / {@link releaseLock}: prevents concurrent
 *   candle fetches from racing on the same exchange.
 * - **Spin hand-off** via {@link spinLock}: invoked after a fetch completes to
 *   give peer backtests waiting on the mutex a chance to run, so multiple
 *   `Backtest.run` workloads interleave instead of one monopolizing the loop.
 *
 * All three operations are no-ops when `CC_ENABLE_CANDLE_FETCH_MUTEX` is `false`.
 * The spin additionally requires `CC_ENABLE_BACKTEST_PARALLEL_SPIN` and at least
 * two registered activities in `Lookup` (see `Lookup.isParallel`).
 *
 * @example
 * ```typescript
 * await Candle.acquireLock("ClientExchange GET_CANDLES_FN");
 * try {
 *   const candles = await fetchFromExchange(...);
 *   return candles;
 * } finally {
 *   await Candle.releaseLock("ClientExchange GET_CANDLES_FN");
 * }
 * // Elsewhere, after a fetch completes inside a backtest loop:
 * await Candle.spinLock("BacktestLogicPrivateService GET_CANDLES_FN");
 * ```
 */
export class CandleUtils {
  /** Underlying mutex serializing candle fetches across concurrent callers. */
  private _lock = new Lock();
  /**
   * Emits whenever {@link acquireLock} successfully takes the mutex.
   * Awaited by {@link spinLock} to detect that a peer backtest has just
   * started its own fetch — the signal that yielding now will be productive.
   */
  private _spin = new Subject<void>();

  /**
   * Acquires the candle fetch mutex if `CC_ENABLE_CANDLE_FETCH_MUTEX` is enabled.
   * Prevents concurrent candle fetches from the same exchange.
   *
   * On successful acquisition, emits on the internal spin subject so any
   * peer parked inside {@link spinLock} can wake up and proceed.
   *
   * @param source - Caller identifier for logging.
   */
  public acquireLock = async (source: string) => {
    LOGGER_SERVICE.info(METHOD_NAME_ACQUIRE_LOCK, {
      source,
    });
    if (!GLOBAL_CONFIG.CC_ENABLE_CANDLE_FETCH_MUTEX) {
      return;
    }
    await this._lock.acquireLock();
    await this._spin.next();
  };

  /**
   * Releases the candle fetch mutex if `CC_ENABLE_CANDLE_FETCH_MUTEX` is enabled.
   * Must be called after {@link acquireLock}, typically in a `finally` block.
   *
   * @param source - Caller identifier for logging.
   */
  public releaseLock = async (source: string) => {
    LOGGER_SERVICE.info(METHOD_NAME_RELEASE_LOCK, {
      source,
    });
    if (!GLOBAL_CONFIG.CC_ENABLE_CANDLE_FETCH_MUTEX) {
      return;
    }
    return await this._lock.releaseLock();
  };

  /**
   * Cooperative event-loop hand-off invoked by `BacktestLogicPrivateService`
   * after a successful `getNextCandles`. Allows peer backtests waiting on the
   * candle-fetch mutex to run before the current backtest fetches the next chunk.
   *
   * Waits for one of:
   * - a peer calling {@link acquireLock} (signalled via the spin subject), or
   * - a `ROTATE_DELAY` ms timeout, so the caller never parks indefinitely.
   *
   * Returns immediately as a no-op when any of these is true:
   * - `CC_ENABLE_CANDLE_FETCH_MUTEX` is disabled (mutex is off entirely),
   * - `CC_ENABLE_BACKTEST_PARALLEL_SPIN` is disabled (cooperative yielding off),
   * - `Lookup.isParallel` is `false` (only one active workload — no peer to yield to).
   *
   * @param source - Caller identifier for logging.
   */
  public spinLock = async (source: string) => {
    LOGGER_SERVICE.info(METHOD_NAME_SPIN_LOCK, {
      source,
    });
    if (!GLOBAL_CONFIG.CC_ENABLE_CANDLE_FETCH_MUTEX) {
      return;
    }
    if (!GLOBAL_CONFIG.CC_ENABLE_BACKTEST_PARALLEL_SPIN) {
      return;
    }
    if (!Lookup.isParallel) {
      return;
    }
    await Promise.race([
      this._spin.toPromise(),
      sleep(ROTATE_DELAY),
    ])
  }
}

/**
 * Process-wide singleton instance of {@link CandleUtils}.
 * Imported by `ClientExchange` (mutex around exchange fetches) and by
 * `BacktestLogicPrivateService` (spin hand-off between parallel backtests).
 */
export const Candle = new CandleUtils();
