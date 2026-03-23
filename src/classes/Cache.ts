import { memoize } from "functools-kit";
import { CandleInterval, ExchangeName } from "../interfaces/Exchange.interface";
import { StrategyName } from "../interfaces/Strategy.interface";
import backtest, {
  ExecutionContextService,
  MethodContextService,
} from "../lib";
import { FrameName } from "../interfaces/Frame.interface";
import { PersistMeasureAdapter } from "./Persist";

const CACHE_METHOD_NAME_FLUSH = "CacheUtils.flush";
const CACHE_METHOD_NAME_CLEAR = "CacheInstance.clear";
const CACHE_METHOD_NAME_RUN = "CacheInstance.run";
const CACHE_METHOD_NAME_GC = "CacheInstance.gc";
const CACHE_METHOD_NAME_FN = "CacheUtils.fn";
const CACHE_METHOD_NAME_FILE = "CacheUtils.file";
const CACHE_FILE_INSTANCE_METHOD_NAME_RUN = "CacheFileInstance.run";

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
};

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
 *
 * // Align to 1-hour boundary
 * const aligned = align(new Date("2025-10-01T01:47:00Z").getTime(), "1h");
 * // Returns timestamp for 2025-10-01T01:00:00Z
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
type Key =
  | `${StrategyName}:${ExchangeName}:${FrameName}:${"backtest"}`
  | `${StrategyName}:${ExchangeName}:${"live"}`;

/**
 * Create a cache key string from strategy name, exchange name, and backtest mode.
 *
 * @param strategyName - Name of the strategy
 * @param exchangeName - Name of the exchange
 * @param backtest - Whether running in backtest mode
 * @returns Cache key string
 */
const CREATE_KEY_FN = (
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean
): Key => {
  const parts = [strategyName, exchangeName];
  if (frameName) parts.push(frameName);
  parts.push(backtest ? "backtest" : "live");
  return parts.join(":") as Key;
};

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
 * A unique symbol representing a value that should never occur.
 * Used as default key when no key function is provided.
 */
const NEVER_VALUE = Symbol("never");

/**
 * Instance class for caching function results with timeframe-based invalidation.
 *
 * Provides automatic cache invalidation based on candle intervals.
 * Each instance maintains its own cache map keyed by strategy, exchange, and mode.
 * Cache is invalidated when the current time moves to a different interval.
 *
 * @template T - Function type to cache
 * @template K - Key type for argument-based caching
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
export class CacheInstance<T extends Function = Function, K = string> {
  /** Cache map storing results per strategy/exchange/mode/argKey combination */
  private _cacheMap = new Map<string, ICache<T>>();

  /**
   * Creates a new CacheInstance for a specific function and interval.
   *
   * @param fn - Function to cache
   * @param interval - Candle interval for cache invalidation (e.g., "1m", "1h")
   * @param key - Optional key generator function for argument-based caching
   */
  constructor(
    readonly fn: T,
    readonly interval: CandleInterval,
    readonly key: (args: Parameters<T>) => K = () => NEVER_VALUE as K
  ) {}

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

    const contextKey = CREATE_KEY_FN(
      backtest.methodContextService.context.strategyName,
      backtest.methodContextService.context.exchangeName,
      backtest.methodContextService.context.frameName,
      backtest.executionContextService.context.backtest
    );
    const argKey = String(this.key(args));
    const key = `${contextKey}:${argKey}`;
    const currentWhen = backtest.executionContextService.context.when;
    const cached = this._cacheMap.get(key);

    if (cached) {
      const currentAligned = align(currentWhen.getTime(), this.interval);
      const cachedAligned = align(cached.when.getTime(), this.interval);
      if (currentAligned === cachedAligned) {
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
   * Clear cached values for current execution context.
   *
   * Removes all cached entries for the current strategy/exchange/mode combination
   * from this instance's cache map. The next `run()` call will recompute the value.
   *
   * Requires active execution context (strategy, exchange, backtest mode) and method context
   * to determine which cache entries to clear.
   *
   * @example
   * ```typescript
   * const instance = new CacheInstance(calculateIndicator, "1h");
   * const result1 = instance.run("BTCUSDT", 14); // Computed
   * const result2 = instance.run("BTCUSDT", 14); // Cached
   *
   * instance.clear(); // Clear all cache entries for current context
   *
   * const result3 = instance.run("BTCUSDT", 14); // Recomputed
   * ```
   */
  public clear = () => {
    const contextKey = CREATE_KEY_FN(
      backtest.methodContextService.context.strategyName,
      backtest.methodContextService.context.exchangeName,
      backtest.methodContextService.context.frameName,
      backtest.executionContextService.context.backtest
    );
    const prefix = `${contextKey}:`;
    for (const key of this._cacheMap.keys()) {
      if (key.startsWith(prefix)) {
        this._cacheMap.delete(key);
      }
    }
  };

  /**
   * Garbage collect expired cache entries.
   *
   * Removes all cached entries whose interval has expired (not aligned with current time).
   * Call this periodically to free memory from stale cache entries.
   *
   * Requires active execution context to get current time.
   *
   * @returns Number of entries removed
   *
   * @example
   * ```typescript
   * const instance = new CacheInstance(calculateIndicator, "1h");
   * instance.run("BTCUSDT", 14); // Cached at 10:00
   * instance.run("ETHUSDT", 14); // Cached at 10:00
   * // Time passes to 11:00
   * const removed = instance.gc(); // Returns 2, removes both expired entries
   * ```
   */
  public gc = (): number => {
    const currentWhen = backtest.executionContextService.context.when;
    const currentAligned = align(currentWhen.getTime(), this.interval);
    let removed = 0;

    for (const [key, cached] of this._cacheMap.entries()) {
      const cachedAligned = align(cached.when.getTime(), this.interval);
      if (currentAligned !== cachedAligned) {
        this._cacheMap.delete(key);
        removed++;
      }
    }

    return removed;
  };
}

/**
 * Async function type for file-cached functions.
 * First argument is always `symbol: string`, followed by optional spread args.
 */
type CacheFileFunction = (symbol: string, ...args: any[]) => Promise<any>;

/**
 * Utility type to drop the first argument from a function type.
 * For example, for a function type `(symbol: string, arg1: number, arg2: string) => Promise<void>`,
 * this type will infer the rest of the arguments as `[arg1: number, arg2: string]`.
 */
type DropFirst<T extends (...args: any) => any> =
  T extends (first: any, ...rest: infer R) => any
    ? R
    : never;

/**
 * Extracts the `key` generator argument tuple from a `CacheFileFunction`.
 * The first two arguments are always `symbol: string` and `alignMs: number` (aligned timestamp),
 * followed by the rest of the original function's arguments.
 *
 * For example, for a function type `(symbol: string, arg1: number, arg2: string) => Promise<void>`,
 * this type will produce the tuple `[symbol: string, alignMs: number, arg1: number, arg2: string]`.
 */
type CacheFileKeyArgs<T extends CacheFileFunction> = [
  symbol: string,
  alignMs: number,
  ...rest: DropFirst<T>
];

/**
 * Instance class for caching async function results in persistent file storage.
 *
 * Provides automatic cache invalidation based on candle intervals.
 * Cache key = `${alignedTimestamp}_${symbol}` (bucket) + dynamic key (file within bucket).
 * On cache hit reads from disk, on miss calls the function and writes the result.
 *
 * @template T - Async function type to cache
 * @template K - Dynamic key type
 *
 * @example
 * ```typescript
 * const instance = new CacheFileInstance(fetchFromApi, "1h");
 * const result = await instance.run("BTCUSDT", extraArg);
 * ```
 */
export class CacheFileInstance<T extends CacheFileFunction = CacheFileFunction> {
  /** Global counter — incremented once per CacheFileInstance construction */
  private static _indexCounter = 0;

  /**
   * Allocates a new unique index. Called once in the constructor to give each
   * CacheFileInstance its own namespace in the persistent key space.
   */
  private static createIndex(): number {
    return CacheFileInstance._indexCounter++;
  }

  /** Unique index for this instance, used as a prefix in the persistent dynamicKey */
  readonly index: number;

  /**
   * Creates a new CacheFileInstance.
   *
   * @param fn - Async function to cache
   * @param interval - Candle interval for cache invalidation
   * @param name - Human-readable bucket name used as the directory key (replaces symbol in bucket path)
   * @param key - Dynamic key generator; receives all args, must return a string.
   *              Default: `([symbol, alignMs]) => \`${symbol}_${alignMs}\``
   */
  constructor(
    readonly fn: T,
    readonly interval: CandleInterval,
    readonly name: string,
    readonly key: (args: CacheFileKeyArgs<T>) => string = ([symbol, alignMs]) => `${symbol}_${alignMs}`
  ) {
    this.index = CacheFileInstance.createIndex();
  }

  /**
   * Execute async function with persistent file caching.
   *
   * Algorithm:
   * 1. Build bucket = `${name}_${interval}_${index}` — fixed per instance, used as directory name
   * 2. Align execution context `when` to interval boundary → `alignedTs`
   * 3. Build entity key from the key generator (receives `[symbol, alignedTs, ...rest]`)
   * 4. Try to read from PersistMeasureAdapter using (bucket, entityKey)
   * 5. On hit — return cached value
   * 6. On miss — call fn, write result to disk, return result
   *
   * Cache invalidation happens through the entity key: the default key embeds `alignedTs`,
   * so each new candle interval produces a new file name while the bucket directory stays the same.
   *
   * Requires active execution context (symbol, when) and method context.
   *
   * @param args - Arguments forwarded to the wrapped function
   * @returns Cached or freshly computed result
   */
  public run = async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    backtest.loggerService.debug(CACHE_FILE_INSTANCE_METHOD_NAME_RUN, { args });

    const step = INTERVAL_MINUTES[this.interval];

    {
      if (!MethodContextService.hasContext()) {
        throw new Error("CacheFileInstance run requires method context");
      }
      if (!ExecutionContextService.hasContext()) {
        throw new Error("CacheFileInstance run requires execution context");
      }
      if (!step) {
        throw new Error(
          `CacheFileInstance unknown cache ttl interval=${this.interval}`
        );
      }
    }

    const [symbol, ...rest] = args;

    const { when } = backtest.executionContextService.context;
    const alignedTs = align(when.getTime(), this.interval);
    const bucket = `${this.name}_${this.interval}_${this.index}`;

    const entityKey = this.key([symbol, alignedTs, ...rest as DropFirst<T>]);

    const cached = await PersistMeasureAdapter.readMeasureData(bucket, entityKey);
    if (cached !== null) {
      return cached.data as Awaited<ReturnType<T>>;
    }

    const result = await this.fn.call(null, ...args);
    await PersistMeasureAdapter.writeMeasureData({id: entityKey, data: result}, bucket, entityKey);
    return result;
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
  private _getFnInstance = memoize(
    ([run]) => run,
    <T extends Function, K>(
      run: T,
      interval: CandleInterval,
      key?: (args: Parameters<T>) => K
    ) => new CacheInstance(run, interval, key)
  );

  /**
   * Memoized function to get or create CacheFileInstance for an async function.
   * Each function gets its own isolated file-cache instance.
   */
  private _getFileInstance = memoize(
    ([run]) => run,
    <T extends CacheFileFunction>(
      run: T,
      interval: CandleInterval,
      name: string,
      key?: (args: CacheFileKeyArgs<T>) => string
    ) => new CacheFileInstance(run, interval, name, key)
  );

  /**
   * Wrap a function with caching based on timeframe intervals.
   *
   * Returns a wrapped version of the function that automatically caches results
   * and invalidates based on the specified candle interval.
   *
   * @template T - Function type to cache
   * @template K - Key type for argument-based caching
   * @param run - Function to wrap with caching
   * @param context.interval - Candle interval for cache invalidation (e.g., "1m", "1h")
   * @param context.key - Optional key generator function for argument-based caching
   * @returns Wrapped function with automatic caching
   *
   * @example
   * ```typescript
   * const calculateIndicator = (symbol: string, period: number) => {
   *   // Expensive calculation
   *   return result;
   * };
   *
   * // Without key - single cache entry per context
   * const cachedCalculate = Cache.fn(calculateIndicator, { interval: "15m" });
   *
   * // With key - separate cache entries per symbol
   * const cachedCalculate = Cache.fn(calculateIndicator, {
   *   interval: "15m",
   *   key: ([symbol]) => symbol,
   * });
   * const result1 = cachedCalculate("BTCUSDT", 14); // Computed
   * const result2 = cachedCalculate("ETHUSDT", 14); // Computed (different key)
   * const result3 = cachedCalculate("BTCUSDT", 14); // Cached (same key, same interval)
   * ```
   */
  public fn = <T extends Function, K = symbol>(
    run: T,
    context: {
      interval: CandleInterval;
      key?: (args: Parameters<T>) => K;
    }
  ): T => {
    backtest.loggerService.info(CACHE_METHOD_NAME_FN, {
      context,
    });

    const wrappedFn = (...args: Parameters<T>): ReturnType<T> => {
      const instance = this._getFnInstance(run, context.interval, context.key);
      return instance.run(...args).value;
    };

    return wrappedFn as T;
  };

  /**
   * Wrap an async function with persistent file-based caching.
   *
   * Returns a wrapped version of the function that reads from disk on cache hit
   * and writes the result to disk on cache miss. Files are stored under
   * `./dump/data/measure/{name}_{interval}_{index}/`.
   *
   * The `run` function reference is used as the memoization key for the underlying
   * `CacheFileInstance`, so each unique function reference gets its own isolated instance.
   * Pass the same function reference each time to reuse the same cache.
   *
   * @template T - Async function type to cache
   * @param run - Async function to wrap with file caching
   * @param context.interval - Candle interval for cache invalidation
   * @param context.name - Human-readable bucket name; becomes the directory prefix
   * @param context.key - Optional entity key generator. Receives `[symbol, alignMs, ...rest]`
   *                      where `alignMs` is the timestamp aligned to `interval`.
   *                      Default: `([symbol, alignMs]) => \`${symbol}_${alignMs}\``
   * @returns Wrapped async function with automatic persistent caching
   *
   * @example
   * ```typescript
   * const fetchData = async (symbol: string, period: number) => {
   *   return await externalApi.fetch(symbol, period);
   * };
   *
   * // Default key — one cache file per symbol per aligned candle
   * const cachedFetch = Cache.file(fetchData, { interval: "1h", name: "fetchData" });
   *
   * // Custom key — one cache file per symbol + period combination
   * const cachedFetch = Cache.file(fetchData, {
   *   interval: "1h",
   *   name: "fetchData",
   *   key: ([symbol, alignMs, period]) => `${symbol}_${alignMs}_${period}`,
   * });
   * const result = await cachedFetch("BTCUSDT", 14);
   * ```
   */
  public file = <T extends CacheFileFunction>(
    run: T,
    context: {
      interval: CandleInterval;
      name: string;
      key?: (args:  CacheFileKeyArgs<T>) => string;
    }
  ): T => {
    backtest.loggerService.info(CACHE_METHOD_NAME_FILE, { context });

    const wrappedFn = (...args: Parameters<T>): ReturnType<T> => {
      const instance = this._getFileInstance(run, context.interval, context.name, context.key);
      return instance.run(...args) as ReturnType<T>;
    };

    return wrappedFn as unknown as T;
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
    this._getFnInstance.clear(run);
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
    if (!MethodContextService.hasContext()) {
      console.warn(`${CACHE_METHOD_NAME_CLEAR} called without method context, skipping clear`);
      return;
    }
    if (!ExecutionContextService.hasContext()) {
      console.warn(`${CACHE_METHOD_NAME_CLEAR} called without execution context, skipping clear`);
      return;
    }
    this._getFnInstance.get(run).clear();
  };

  /**
   * Garbage collect expired cache entries for a specific function.
   *
   * Removes all cached entries whose interval has expired (not aligned with current time).
   * Call this periodically to free memory from stale cache entries.
   *
   * Requires active execution context to get current time.
   *
   * @template T - Function type
   * @param run - Function whose expired cache entries should be removed
   * @returns Number of entries removed
   *
   * @example
   * ```typescript
   * const cachedFn = Cache.fn(calculateIndicator, { interval: "1h" });
   *
   * cachedFn("BTCUSDT", 14); // Cached at 10:00
   * cachedFn("ETHUSDT", 14); // Cached at 10:00
   * // Time passes to 11:00
   * const removed = Cache.gc(calculateIndicator); // Returns 2
   * ```
   */
  public gc = <T extends Function>(run: T) => {
    backtest.loggerService.info(CACHE_METHOD_NAME_GC, {
      run,
    });
    if (!ExecutionContextService.hasContext()) {
      console.warn(`${CACHE_METHOD_NAME_GC} called without execution context, skipping garbage collection`);
      return;
    }
    return this._getFnInstance.get(run).gc();
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
