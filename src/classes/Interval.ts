import { memoize } from "functools-kit";
import { CandleInterval, ExchangeName } from "../interfaces/Exchange.interface";
import { StrategyName } from "../interfaces/Strategy.interface";
import backtest, { ExecutionContextService, MethodContextService } from "../lib";
import { FrameName } from "../interfaces/Frame.interface";
import { PersistIntervalAdapter } from "./Persist";

const INTERVAL_METHOD_NAME_RUN = "IntervalFnInstance.run";
const INTERVAL_FILE_INSTANCE_METHOD_NAME_RUN = "IntervalFileInstance.run";
const INTERVAL_METHOD_NAME_FN = "IntervalUtils.fn";
const INTERVAL_METHOD_NAME_FN_CLEAR = "IntervalUtils.fn.clear";
const INTERVAL_METHOD_NAME_FILE = "IntervalUtils.file";
const INTERVAL_METHOD_NAME_FILE_CLEAR = "IntervalUtils.file.clear";
const INTERVAL_METHOD_NAME_DISPOSE = "IntervalUtils.dispose";
const INTERVAL_METHOD_NAME_CLEAR = "IntervalUtils.clear";
const INTERVAL_METHOD_NAME_RESET_COUNTER = "IntervalUtils.resetCounter";

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
 * User-implemented function fired once per interval boundary.
 * Receives `when` from the caller (sourced from execution context).
 */
export type TIntervalFn<T extends object = object> = (symbol: string, when: Date) => Promise<T | null>;

/**
 * Wrapped function returned by `Interval.fn` and `Interval.file`.
 * `when` is resolved internally from the execution context — callers pass only `symbol`.
 */
export type TIntervalWrappedFn<T extends object = object> = (symbol: string) => Promise<T | null>;


/**
 * Aligns timestamp down to the nearest interval boundary.
 * For example, for 15m interval: 00:17 -> 00:15, 00:44 -> 00:30
 *
 * @param timestamp - Timestamp in milliseconds
 * @param interval - Candle interval
 * @returns Aligned timestamp rounded down to interval boundary
 * @throws Error if interval is unknown
 *
 * @example
 * ```typescript
 * // Align to 15-minute boundary
 * const aligned = align(new Date("2025-10-01T00:35:00Z").getTime(), "15m");
 * // Returns timestamp for 2025-10-01T00:30:00Z
 * ```
 */
const align = (timestamp: number, interval: CandleInterval): number => {
  const intervalMinutes = INTERVAL_MINUTES[interval];
  if (!intervalMinutes) {
    throw new Error(`align: unknown interval=${interval}`);
  }
  const intervalMs = intervalMinutes * MS_PER_MINUTE;
  return Math.floor(timestamp / intervalMs) * intervalMs;
};

/**
 * Cache key type combining strategy name, exchange name, frame name, and execution mode.
 * Format: `strategyName:exchangeName:frameName:backtest` or `strategyName:exchangeName:live`.
 *
 * @example "my-strategy:binance:1d-frame:backtest"
 * @example "scalper:coinbase:live"
 */
type Key =
  | `${StrategyName}:${ExchangeName}:${FrameName}:${"backtest"}`
  | `${StrategyName}:${ExchangeName}:${"live"}`;

/**
 * Build a context key string from strategy name, exchange name, frame name, and execution mode.
 *
 * @param strategyName - Name of the strategy
 * @param exchangeName - Name of the exchange
 * @param frameName - Name of the backtest frame (omitted in live mode)
 * @param isBacktest - Whether running in backtest mode
 * @returns Context key string
 */
const CREATE_KEY_FN = (
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  isBacktest: boolean
): Key => {
  const parts = [strategyName, exchangeName];
  if (frameName) parts.push(frameName);
  parts.push(isBacktest ? "backtest" : "live");
  return parts.join(":") as Key;
};


/**
 * Instance class for firing a function exactly once per interval boundary.
 *
 * On the first call within a new interval the wrapped function is invoked and
 * its result is returned. Every subsequent call within the same interval returns
 * `null` without invoking the function again.
 * If the function itself returns `null`, the interval countdown does not start —
 * the next call will retry the function.
 *
 * State is kept in memory; use `IntervalFileInstance` for persistence across restarts.
 *
 * @example
 * ```typescript
 * const instance = new IntervalFnInstance(mySignalFn, "1h");
 * await instance.run("BTCUSDT"); // → T | null  (fn called)
 * await instance.run("BTCUSDT"); // → null      (skipped, same interval)
 * // After 1 hour passes:
 * await instance.run("BTCUSDT"); // → T | null  (fn called again)
 * ```
 */
export class IntervalFnInstance<T extends object = object> {
  /** Stores the last aligned timestamp per context+symbol key. */
  private _stateMap = new Map<string, number>();

  /**
   * Creates a new IntervalFnInstance.
   *
   * @param fn - Function to fire once per interval
   * @param interval - Candle interval that controls the firing boundary
   */
  constructor(
    readonly fn: TIntervalFn<T>,
    readonly interval: CandleInterval,
  ) {}

  /**
   * Execute the signal function with once-per-interval enforcement.
   *
   * Algorithm:
   * 1. Align the current execution context `when` to the interval boundary.
   * 2. If the stored aligned timestamp for this context+symbol equals the current one → return `null`.
   * 3. Otherwise call `fn`. If it returns a non-null signal, record the aligned timestamp and return
   *    the signal. If it returns `null`, leave state unchanged so the next call retries.
   *
   * Requires active method context and execution context.
   *
   * @param symbol - Trading pair symbol (e.g. "BTCUSDT")
   * @returns The value returned by `fn` on the first non-null fire, `null` on all subsequent calls
   *   within the same interval or when `fn` itself returned `null`
   * @throws Error if method context, execution context, or interval is missing
   */
  public run = async (symbol: string): Promise<T | null> => {
    backtest.loggerService.debug(INTERVAL_METHOD_NAME_RUN, { symbol });

    const step = INTERVAL_MINUTES[this.interval];

    {
      if (!MethodContextService.hasContext()) {
        throw new Error("IntervalFnInstance run requires method context");
      }
      if (!ExecutionContextService.hasContext()) {
        throw new Error("IntervalFnInstance run requires execution context");
      }
      if (!step) {
        throw new Error(`IntervalFnInstance unknown interval=${this.interval}`);
      }
    }

    const contextKey = CREATE_KEY_FN(
      backtest.methodContextService.context.strategyName,
      backtest.methodContextService.context.exchangeName,
      backtest.methodContextService.context.frameName,
      backtest.executionContextService.context.backtest
    );
    const key = `${contextKey}:${symbol}`;
    const currentWhen = backtest.executionContextService.context.when;
    const currentAligned = align(currentWhen.getTime(), this.interval);

    if (this._stateMap.get(key) === currentAligned) {
      return null;
    }

    const result = await this.fn(symbol, currentWhen);
    if (result !== null) {
      this._stateMap.set(key, currentAligned);
    }
    return result;
  };

  /**
   * Clear fired-interval state for the current execution context.
   *
   * Removes all entries for the current strategy/exchange/frame/mode combination
   * from this instance's state map. The next `run()` call will invoke the function again.
   *
   * Requires active method context and execution context.
   */
  public clear = () => {
    const contextKey = CREATE_KEY_FN(
      backtest.methodContextService.context.strategyName,
      backtest.methodContextService.context.exchangeName,
      backtest.methodContextService.context.frameName,
      backtest.executionContextService.context.backtest
    );
    const prefix = `${contextKey}:`;
    for (const key of this._stateMap.keys()) {
      if (key.startsWith(prefix)) {
        this._stateMap.delete(key);
      }
    }
  };
}

/**
 * Instance class for firing an async function exactly once per interval boundary,
 * with the fired state persisted to disk via `PersistIntervalAdapter`.
 *
 * On the first call within a new interval the wrapped function is invoked.
 * If it returns a non-null signal, that result is written to disk and returned.
 * Every subsequent call within the same interval returns `null` (record exists on disk).
 * If the function returns `null`, nothing is written and the next call retries.
 *
 * Fired state survives process restarts — unlike `IntervalFnInstance` which is in-memory only.
 *
 * @template T - Async function type: `(symbol: string, ...args) => Promise<R | null>`
 *
 * @example
 * ```typescript
 * const instance = new IntervalFileInstance(fetchSignal, "1h", "mySignal");
 * await instance.run("BTCUSDT"); // → R | null  (fn called, result written to disk)
 * await instance.run("BTCUSDT"); // → null      (record exists, already fired)
 * ```
 */
export class IntervalFileInstance<T extends object = object> {
  /** Global counter — incremented once per IntervalFileInstance construction. */
  private static _indexCounter = 0;

  /**
   * Allocates a new unique index. Called once in the constructor to give each
   * IntervalFileInstance its own namespace in the persistent key space.
   */
  private static createIndex(): number {
    return IntervalFileInstance._indexCounter++;
  }

  /**
   * Resets the index counter to zero.
   * Call this when clearing all instances (e.g. on `IntervalUtils.clear()`).
   */
  public static resetCounter(): void {
    IntervalFileInstance._indexCounter = 0;
  }

  /** Unique index for this instance, used as a suffix in the bucket name. */
  readonly index: number;

  /**
   * Creates a new IntervalFileInstance.
   *
   * @param fn - Async signal function to fire once per interval
   * @param interval - Candle interval that controls the firing boundary
   * @param name - Human-readable bucket name used as the directory prefix
   */
  constructor(
    readonly fn: TIntervalFn<T>,
    readonly interval: CandleInterval,
    readonly name: string,
  ) {
    this.index = IntervalFileInstance.createIndex();
  }

  /**
   * Execute the async function with persistent once-per-interval enforcement.
   *
   * Algorithm:
   * 1. Build bucket = `${name}_${interval}_${index}` — fixed per instance, used as directory name.
   * 2. Align execution context `when` to interval boundary → `alignedTs`.
   * 3. Build entity key = `${symbol}_${alignedTs}`.
   * 4. Try to read from `PersistIntervalAdapter` using (bucket, entityKey).
   * 5. On hit — return `null` (interval already fired).
   * 6. On miss — call `fn`. If non-null, write to disk and return result. If null, skip write and return null.
   *
   * Requires active method context and execution context.
   *
   * @param symbol - Trading pair symbol (e.g. "BTCUSDT")
   * @returns The value on the first non-null fire, `null` if already fired this interval
   *   or if `fn` itself returned `null`
   * @throws Error if method context, execution context, or interval is missing
   */
  public run = async (symbol: string): Promise<T | null> => {
    backtest.loggerService.debug(INTERVAL_FILE_INSTANCE_METHOD_NAME_RUN, { symbol });

    const step = INTERVAL_MINUTES[this.interval];

    {
      if (!MethodContextService.hasContext()) {
        throw new Error("IntervalFileInstance run requires method context");
      }
      if (!ExecutionContextService.hasContext()) {
        throw new Error("IntervalFileInstance run requires execution context");
      }
      if (!step) {
        throw new Error(`IntervalFileInstance unknown interval=${this.interval}`);
      }
    }

    const { when } = backtest.executionContextService.context;
    const alignedTs = align(when.getTime(), this.interval);
    const bucket = `${this.name}_${this.interval}_${this.index}`;
    const entityKey = `${symbol}_${alignedTs}`;

    const cached = await PersistIntervalAdapter.readIntervalData(bucket, entityKey);
    if (cached !== null) {
      return null;
    }

    const result = await this.fn(symbol, when);
    if (result !== null) {
      await PersistIntervalAdapter.writeIntervalData({ id: entityKey, data: result, removed: false }, bucket, entityKey);
    }
    return result;
  };

  /**
   * Soft-delete all persisted records for this instance's bucket.
   * After this call the function will fire again on the next `run()`.
   */
  public clear = async (): Promise<void> => {
    const bucket = `${this.name}_${this.interval}_${this.index}`;
    for await (const key of PersistIntervalAdapter.listIntervalData(bucket)) {
      await PersistIntervalAdapter.removeIntervalData(bucket, key);
    }
  };
}

/**
 * Utility class for wrapping signal functions with once-per-interval firing.
 * Provides two modes: in-memory (`fn`) and persistent file-based (`file`).
 * Exported as singleton instance `Interval` for convenient usage.
 *
 * @example
 * ```typescript
 * import { Interval } from "./classes/Interval";
 *
 * const fireOncePerHour = Interval.fn(mySignalFn, { interval: "1h" });
 * await fireOncePerHour("BTCUSDT"); // fn called — returns its result
 * await fireOncePerHour("BTCUSDT"); // returns null (same interval)
 * ```
 */
export class IntervalUtils {
  /**
   * Memoized factory to get or create an `IntervalFnInstance` for a function.
   * Each function reference gets its own isolated instance.
   */
  private _getInstance = memoize(
    ([run]) => run,
    <T extends object>(run: TIntervalFn<T>, interval: CandleInterval) =>
      new IntervalFnInstance<T>(run, interval)
  );

  /**
   * Memoized factory to get or create an `IntervalFileInstance` for an async function.
   * Each function reference gets its own isolated persistent instance.
   */
  private _getFileInstance = memoize(
    ([run]) => run,
    <T extends object>(run: TIntervalFn<T>, interval: CandleInterval, name: string) =>
      new IntervalFileInstance<T>(run, interval, name)
  );

  /**
   * Wrap a signal function with in-memory once-per-interval firing.
   *
   * Returns a wrapped version of the function that fires at most once per interval boundary.
   * If the function returns `null`, the countdown does not start and the next call retries.
   *
   * The `run` function reference is used as the memoization key for the underlying
   * `IntervalFnInstance`, so each unique function reference gets its own isolated instance.
   *
   * @param run - Signal function to wrap
   * @param context.interval - Candle interval that controls the firing boundary
   * @returns Wrapped function with the same signature as `TIntervalFn<T>`, plus a `clear()` method
   *
   * @example
   * ```typescript
   * const fireOnce = Interval.fn(mySignalFn, { interval: "15m" });
   *
   * await fireOnce("BTCUSDT"); // → T or null  (fn called)
   * await fireOnce("BTCUSDT"); // → null       (same interval, skipped)
   * ```
   */
  public fn = <T extends object>(
    run: TIntervalFn<T>,
    context: { interval: CandleInterval }
  ): TIntervalWrappedFn<T> & { clear(): void } => {
    backtest.loggerService.info(INTERVAL_METHOD_NAME_FN, { context });

    const wrappedFn = (symbol: string): Promise<T | null> => {
      const instance = this._getInstance<T>(run, context.interval);
      return instance.run(symbol);
    };

    wrappedFn.clear = () => {
      backtest.loggerService.info(INTERVAL_METHOD_NAME_FN_CLEAR);
      if (!MethodContextService.hasContext()) {
        backtest.loggerService.warn(`${INTERVAL_METHOD_NAME_FN_CLEAR} called without method context, skipping`);
        return;
      }
      if (!ExecutionContextService.hasContext()) {
        backtest.loggerService.warn(`${INTERVAL_METHOD_NAME_FN_CLEAR} called without execution context, skipping`);
        return;
      }
      this._getInstance.get(run)?.clear();
    };

    return wrappedFn as TIntervalWrappedFn<T> & { clear(): void };
  };

  /**
   * Wrap an async signal function with persistent file-based once-per-interval firing.
   *
   * Returns a wrapped version of the function that reads from disk on hit (returns `null`)
   * and writes the fired signal to disk on the first successful fire.
   * Fired state survives process restarts.
   *
   * The `run` function reference is used as the memoization key for the underlying
   * `IntervalFileInstance`, so each unique function reference gets its own isolated instance.
   *
   * @template T - Async function type to wrap
   * @param run - Async signal function to wrap with persistent once-per-interval firing
   * @param context.interval - Candle interval that controls the firing boundary
   * @param context.name - Human-readable bucket name; becomes the directory prefix
   * @returns Wrapped function with the same signature as `T`, plus an async `clear()` method
   *   that deletes persisted records from disk and disposes the memoized instance
   *
   * @example
   * ```typescript
   * const fetchSignal = async (symbol: string, when: Date) => { ... };
   * const fireOnce = Interval.file(fetchSignal, { interval: "1h", name: "fetchSignal" });
   * await fireOnce.clear(); // delete disk records so the function fires again next call
   * ```
   */
  public file = <T extends object>(
    run: TIntervalFn<T>,
    context: {
      interval: CandleInterval;
      name: string;
    }
  ): TIntervalWrappedFn<T> & { clear(): Promise<void> } => {
    backtest.loggerService.info(INTERVAL_METHOD_NAME_FILE, { context });

    {
      this._getFileInstance<T>(run, context.interval, context.name);
    }

    const wrappedFn = (symbol: string): Promise<T | null> => {
      const instance = this._getFileInstance<T>(run, context.interval, context.name);
      return instance.run(symbol);
    };

    wrappedFn.clear = async () => {
      backtest.loggerService.info(INTERVAL_METHOD_NAME_FILE_CLEAR);
      await this._getFileInstance.get(run)?.clear();
    };

    return wrappedFn as TIntervalWrappedFn<T> & { clear(): Promise<void> };
  };

  /**
   * Dispose (remove) the memoized `IntervalFnInstance` for a specific function.
   *
   * Removes the instance from the internal memoization cache, discarding all in-memory
   * fired-interval state across all contexts for that function.
   * The next call to the wrapped function will create a fresh `IntervalFnInstance`.
   *
   * @param run - Function whose `IntervalFnInstance` should be disposed
   *
   * @example
   * ```typescript
   * const fireOnce = Interval.fn(mySignalFn, { interval: "1h" });
   * Interval.dispose(mySignalFn);
   * ```
   */
  public dispose = (run: TIntervalFn<object>) => {
    backtest.loggerService.info(INTERVAL_METHOD_NAME_DISPOSE, { run });
    this._getInstance.clear(run);
  };

  /**
   * Clears all memoized `IntervalFnInstance` and `IntervalFileInstance` objects and
   * resets the `IntervalFileInstance` index counter.
   * Call this when `process.cwd()` changes between strategy iterations
   * so new instances are created with the updated base path.
   */
  public clear = () => {
    backtest.loggerService.info(INTERVAL_METHOD_NAME_CLEAR);
    this._getInstance.clear();
    this._getFileInstance.clear();
  };

  /**
   * Resets the IntervalFileInstance index counter to zero.
   * This is useful when process.cwd() changes between strategy iterations to ensure
   * that new IntervalFileInstance objects start with index 0 and do not collide with old instances.
   */
  public resetCounter = () => {
    backtest.loggerService.info(INTERVAL_METHOD_NAME_RESET_COUNTER);
    IntervalFileInstance.resetCounter();
  }
}

/**
 * Singleton instance of `IntervalUtils` for convenient once-per-interval signal firing.
 *
 * @example
 * ```typescript
 * import { Interval } from "./classes/Interval";
 *
 * // In-memory: fires once per hour, resets on process restart
 * const fireOnce = Interval.fn(mySignalFn, { interval: "1h" });
 *
 * // Persistent: fired state survives restarts
 * const fireOncePersist = Interval.file(mySignalFn, { interval: "1h", name: "mySignal" });
 * ```
 */
export const Interval = new IntervalUtils();
