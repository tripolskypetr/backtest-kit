import { memoize } from "functools-kit";
import { CandleInterval, ExchangeName } from "../interfaces/Exchange.interface";
import { StrategyName } from "../interfaces/Strategy.interface";
import backtest, {
  ExecutionContextService,
  MethodContextService,
} from "../lib";

const CACHE_METHOD_NAME_FLUSH = "CacheUtils.flush";
const CACHE_METHOD_NAME_CLEAR = "CacheInstance.clear";
const CACHE_METHOD_NAME_RUN = "CacheInstance.run";
const CACHE_METHOD_NAME_FN = "CacheUtils.fn";

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
};

/**
 * Generic function type that accepts any arguments and returns any value.
 * Used as a constraint for cached functions.
 */
type Function = (...args: any[]) => any;

/**
 * Cache key type combining strategy name, exchange name, and execution mode.
 * Format: `strategyName:exchangeName:mode` where mode is either "backtest" or "live".
 *
 * @example "my-strategy:binance:backtest"
 * @example "scalper:coinbase:live"
 */
type Key = `${StrategyName}:${ExchangeName}:${"backtest" | "live"}`;

const createKey = (
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  backtest: boolean
): Key => `${strategyName}:${exchangeName}:${backtest ? "backtest" : "live"}`;

/**
 * Cached value with timestamp.
 *
 * @template T - Function type
 */
interface ICache<T extends Function = Function> {
  /** Cached return value of the function */
  value: ReturnType<T>;
  /** Timestamp when the value was cached */
  when: Date;
}

/**
 * Instance class for caching function results with timeframe-based invalidation.
 *
 * Provides automatic cache invalidation based on candle intervals.
 * Each instance maintains its own cache map keyed by strategy, exchange, and mode.
 * Cache is invalidated when the current time moves to a different interval.
 *
 * @template T - Function type to cache
 *
 * @example
 * ```typescript
 * const instance = new CacheInstance(myExpensiveFunction, "1h");
 * const result = instance.run(arg1, arg2); // Computed
 * const result2 = instance.run(arg1, arg2); // Cached (within same hour)
 * // After 1 hour passes
 * const result3 = instance.run(arg1, arg2); // Recomputed
 * ```
 */
export class CacheInstance<T extends Function = Function> {
  /** Cache map storing results per strategy/exchange/mode combination */
  private _cacheMap = new Map<Key, ICache<T>>();

  /**
   * Creates a new CacheInstance for a specific function and interval.
   *
   * @param fn - Function to cache
   * @param interval - Candle interval for cache invalidation (e.g., "1m", "1h")
   */
  constructor(readonly fn: T, readonly interval: CandleInterval) {}

  /**
   * Execute function with caching based on timeframe intervals.
   *
   * This method implements intelligent time-based caching:
   * 1. Generates cache key from strategy name, exchange name, and execution mode (backtest/live)
   * 2. Checks if cached value exists and is still valid for current interval
   * 3. Returns cached value if time elapsed is less than interval duration
   * 4. Recomputes and caches new value when moving to next interval boundary
   *
   * Cache invalidation example with 15m interval:
   * - 10:00 AM: First call → computes and caches result
   * - 10:05 AM: Same interval → returns cached result
   * - 10:15 AM: New interval → recomputes and caches new result
   *
   * Requires active execution context (strategy, exchange, backtest mode) and method context.
   * Each unique combination of these contexts maintains separate cache entries.
   *
   * @param args - Arguments to pass to the cached function
   * @returns Cached result object containing:
   *   - `value`: The computed or cached function result
   *   - `when`: Timestamp when this value was cached
   * @throws Error if interval is unknown or required context is missing
   *
   * @example
   * ```typescript
   * const instance = new CacheInstance(calculateIndicator, "15m");
   * const result = instance.run("BTCUSDT", 100);
   * console.log(result.value); // Calculated value
   * console.log(result.when); // Cache timestamp
   * ```
   */
  public run = (...args: Parameters<T>): ICache<T> => {
    backtest.loggerService.debug(CACHE_METHOD_NAME_RUN, { args });

    const step = INTERVAL_MINUTES[this.interval];

    {
      if (!MethodContextService.hasContext()) {
        throw new Error("CacheInstance run requires method context");
      }
      if (!ExecutionContextService.hasContext()) {
        throw new Error("CacheInstance run requires execution context");
      }
      if (!step) {
        throw new Error(
          `CacheInstance unknown cache ttl interval=${this.interval}`
        );
      }
    }

    const key = createKey(
      backtest.methodContextService.context.strategyName,
      backtest.methodContextService.context.exchangeName,
      backtest.executionContextService.context.backtest
    );
    const currentWhen = backtest.executionContextService.context.when;
    const cached = this._cacheMap.get(key);

    if (cached) {
      const stepMs = step * 60 * 1000;
      const elapsed = currentWhen.getTime() - cached.when.getTime();
      if (elapsed >= 0 && elapsed < stepMs) {
        return cached;
      }
    }

    const newCache: ICache<T> = {
      when: currentWhen,
      value: this.fn(...args),
    };
    this._cacheMap.set(key, newCache);

    return newCache;
  };

  /**
   * Clear cached value for current execution context.
   *
   * Removes the cached entry for the current strategy/exchange/mode combination
   * from this instance's cache map. The next `run()` call will recompute the value.
   *
   * Requires active execution context (strategy, exchange, backtest mode) and method context
   * to determine which cache entry to clear.
   *
   * @example
   * ```typescript
   * const instance = new CacheInstance(calculateIndicator, "1h");
   * const result1 = instance.run("BTCUSDT", 14); // Computed
   * const result2 = instance.run("BTCUSDT", 14); // Cached
   *
   * instance.clear(); // Clear cache for current context
   *
   * const result3 = instance.run("BTCUSDT", 14); // Recomputed
   * ```
   */
  public clear = () => {
    const key = createKey(
      backtest.methodContextService.context.strategyName,
      backtest.methodContextService.context.exchangeName,
      backtest.executionContextService.context.backtest
    );
    this._cacheMap.delete(key);
  };
}

/**
 * Utility class for function caching with timeframe-based invalidation.
 *
 * Provides simplified API for wrapping functions with automatic caching.
 * Exported as singleton instance for convenient usage.
 *
 * @example
 * ```typescript
 * import { Cache } from "./classes/Cache";
 *
 * const cachedFn = Cache.fn(expensiveCalculation, "1h");
 * const result = cachedFn(arg1, arg2); // Computed on first call
 * const result2 = cachedFn(arg1, arg2); // Cached (within same hour)
 * ```
 */
export class CacheUtils {
  /**
   * Memoized function to get or create CacheInstance for a function.
   * Each function gets its own isolated cache instance.
   */
  private _getInstance = memoize(
    ([run]) => run,
    (run: Function, interval: CandleInterval) =>
      new CacheInstance(run, interval)
  );

  /**
   * Wrap a function with caching based on timeframe intervals.
   *
   * Returns a wrapped version of the function that automatically caches results
   * and invalidates based on the specified candle interval.
   *
   * @template T - Function type to cache
   * @param run - Function to wrap with caching
   * @param interval - Candle interval for cache invalidation (e.g., "1m", "1h")
   * @returns Wrapped function with automatic caching
   *
   * @example
   * ```typescript
   * const calculateIndicator = (symbol: string, period: number) => {
   *   // Expensive calculation
   *   return result;
   * };
   *
   * const cachedCalculate = Cache.fn(calculateIndicator, "15m");
   * const result = cachedCalculate("BTCUSDT", 14); // Computed
   * const result2 = cachedCalculate("BTCUSDT", 14); // Cached (same 15m interval)
   * ```
   */
  public fn = <T extends Function>(
    run: T,
    context: {
      interval: CandleInterval;
    }
  ): T => {
    backtest.loggerService.info(CACHE_METHOD_NAME_FN, {
      context,
    });

    const wrappedFn = (...args: Parameters<T>): ReturnType<T> => {
      const instance = this._getInstance(run, context.interval);
      return instance.run(...args).value;
    };

    return wrappedFn as T;
  };

  /**
   * Flush (remove) cached CacheInstance for a specific function or all functions.
   *
   * This method removes CacheInstance objects from the internal memoization cache.
   * When a CacheInstance is flushed, all cached results across all contexts
   * (all strategy/exchange/mode combinations) for that function are discarded.
   *
   * Use cases:
   * - Remove specific function's CacheInstance when implementation changes
   * - Free memory by removing unused CacheInstances
   * - Reset all CacheInstances when switching between different test scenarios
   *
   * Note: This is different from `clear()` which only removes cached values
   * for the current context within an existing CacheInstance.
   *
   * @template T - Function type
   * @param run - Optional function to flush CacheInstance for. If omitted, flushes all CacheInstances.
   *
   * @example
   * ```typescript
   * const cachedFn = Cache.fn(calculateIndicator, { interval: "1h" });
   *
   * // Flush CacheInstance for specific function
   * Cache.flush(calculateIndicator);
   *
   * // Flush all CacheInstances
   * Cache.flush();
   * ```
   */
  public flush = <T extends Function>(run?: T) => {
    backtest.loggerService.info(CACHE_METHOD_NAME_FLUSH, {
      run,
    });
    this._getInstance.clear(run);
  };

  /**
   * Clear cached value for current execution context of a specific function.
   *
   * Removes the cached entry for the current strategy/exchange/mode combination
   * from the specified function's CacheInstance. The next call to the wrapped function
   * will recompute the value for that context.
   *
   * This only clears the cache for the current execution context, not all contexts.
   * Use `flush()` to remove the entire CacheInstance across all contexts.
   *
   * Requires active execution context (strategy, exchange, backtest mode) and method context.
   *
   * @template T - Function type
   * @param run - Function whose cache should be cleared for current context
   *
   * @example
   * ```typescript
   * const cachedFn = Cache.fn(calculateIndicator, { interval: "1h" });
   *
   * // Within strategy execution context
   * const result1 = cachedFn("BTCUSDT", 14); // Computed
   * const result2 = cachedFn("BTCUSDT", 14); // Cached
   *
   * Cache.clear(calculateIndicator); // Clear cache for current context only
   *
   * const result3 = cachedFn("BTCUSDT", 14); // Recomputed for this context
   * // Other contexts (different strategies/exchanges) remain cached
   * ```
   */
  public clear = <T extends Function>(run: T) => {
    backtest.loggerService.info(CACHE_METHOD_NAME_CLEAR, {
      run,
    });
    this._getInstance.get(run).clear();
  };
}

/**
 * Singleton instance of CacheUtils for convenient function caching.
 *
 * @example
 * ```typescript
 * import { Cache } from "./classes/Cache";
 *
 * // Wrap expensive function with 1-hour cache
 * const cachedFn = Cache.fn(myExpensiveFunction, "1h");
 * const result = cachedFn(arg1, arg2);
 *
 * // Cache is automatically invalidated when moving to next hour interval
 * ```
 */
export const Cache = new CacheUtils();
