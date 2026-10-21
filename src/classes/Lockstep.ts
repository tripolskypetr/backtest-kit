import LoggerService from "../lib/services/base/LoggerService";
import { GLOBAL_CONFIG } from "../config/params";
import { Lock } from "./Lock";

const METHOD_NAME_ACQUIRE_LOCK = "LockstepUtils.acquireLock";
const METHOD_NAME_RELEASE_LOCK = "LockstepUtils.releaseLock";

/** Logger service injected as DI singleton */
const LOGGER_SERVICE = new LoggerService();

/**
 * Process-wide mutex that keeps parallel backtests on the same logical time.
 *
 * `BacktestLogicPrivateService.run` takes the lock for every timeframe
 * iteration (the tick and, when a signal opens, the whole candle replay of
 * that signal) and releases it before moving to the next timeframe. The lock
 * queue is FIFO, so with two or more `Backtest.run` / `Backtest.background`
 * workloads the iterations interleave A(t0) B(t0) A(t1) B(t1) …: a strategy
 * that blocks inside `getSignal` (an LLM call, a `sleep`) parks every peer at
 * the same `when` instead of letting them run ahead by hours of logical time.
 *
 * Both operations are no-ops when `CC_BACKTEST_LOCKSTEP` is `false`.
 *
 * @example
 * ```typescript
 * await Lockstep.acquireLock("BacktestLogicPrivateService run");
 * try {
 *   // one timeframe of one backtest
 * } finally {
 *   await Lockstep.releaseLock("BacktestLogicPrivateService run");
 * }
 * ```
 */
export class LockstepUtils {
  /** Underlying mutex serializing timeframe iterations across concurrent backtests. */
  private _lock = new Lock();

  /**
   * Acquires the lockstep mutex if `CC_BACKTEST_LOCKSTEP` is enabled.
   * Parks the caller until the peer holding the current timeframe releases it.
   *
   * @param source - Caller identifier for logging.
   */
  public acquireLock = async (source: string) => {
    LOGGER_SERVICE.info(METHOD_NAME_ACQUIRE_LOCK, {
      source,
    });
    if (!GLOBAL_CONFIG.CC_BACKTEST_LOCKSTEP) {
      return;
    }
    await this._lock.acquireLock();
  };

  /**
   * Releases the lockstep mutex if `CC_BACKTEST_LOCKSTEP` is enabled.
   * Must be called after {@link acquireLock}, typically in a `finally` block.
   *
   * @param source - Caller identifier for logging.
   */
  public releaseLock = async (source: string) => {
    LOGGER_SERVICE.info(METHOD_NAME_RELEASE_LOCK, {
      source,
    });
    if (!GLOBAL_CONFIG.CC_BACKTEST_LOCKSTEP) {
      return;
    }
    return await this._lock.releaseLock();
  };
}

/**
 * Process-wide singleton instance of {@link LockstepUtils}.
 * Imported by `BacktestLogicPrivateService` (one timeframe at a time across parallel backtests).
 */
export const Lockstep = new LockstepUtils();
