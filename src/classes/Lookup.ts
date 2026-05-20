import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { StrategyName } from "../interfaces/Strategy.interface";
import LoggerService from "../lib/services/base/LoggerService";

const METHOD_NAME_ADD_ACTIVITY = "LookupUtils.addActivity";
const METHOD_NAME_REMOVE_ACTIVITY = "LookupUtils.removeActivity";
const METHOD_NAME_LIST_ACTIVITY = "LookupUtils.listActivity";

/** Logger service injected as DI singleton */
const LOGGER_SERVICE = new LoggerService();

/**
 * Composite key uniquely identifying a single running backtest or live activity
 * inside the lookup map.
 *
 * Composition rules:
 * - Backtest entries always include `frameName` between exchange and the `"backtest"` suffix.
 * - Live entries omit `frameName` (live runs are not scoped to a frame) and end with `"live"`.
 *
 * The discriminating suffix prevents collisions when the same `symbol + strategy + exchange`
 * runs simultaneously in backtest and live modes.
 */
type Key =
  | `${string}:${StrategyName}:${ExchangeName}:${FrameName}:${"backtest"}`
  | `${string}:${StrategyName}:${ExchangeName}:${"live"}`;

/**
 * Single entry tracking one in-flight backtest or live run.
 *
 * Registered into the lookup map on activity start (e.g. `INSTANCE_TASK_FN` in
 * `Backtest`/`Live`, or per-strategy loop in `WalkerLogicPrivateService`) and
 * removed on completion or failure.
 *
 * Used by `Candle.spinLock` to detect parallel workloads via {@link LookupUtils.isParallel}.
 */
export interface IActivityEntry {
  /** Trading pair symbol (e.g. `"BTCUSDT"`). */
  symbol: string;
  /** Execution context identifying the running strategy. */
  context: {
    /** Strategy schema name driving the activity. */
    strategyName: StrategyName;
    /** Exchange schema name providing market data. */
    exchangeName: ExchangeName;
    /** Frame schema name (backtest only — live runs leave this `undefined`). */
    frameName?: FrameName;
  };
  /** `true` for backtest activities, `false` for live activities. */
  backtest: boolean;
}

/**
 * Builds the composite {@link Key} used to register an activity in `_lookupMap`.
 *
 * Mirrors the {@link Key} type construction: appends `frameName` only when provided
 * (typical for backtest), then a `"backtest"` / `"live"` discriminator suffix.
 *
 * @param symbol - Trading pair symbol.
 * @param strategyName - Strategy schema name.
 * @param exchangeName - Exchange schema name.
 * @param frameName - Frame schema name; omitted from the key when falsy.
 * @param backtest - `true` for backtest, `false` for live.
 * @returns Colon-joined composite key.
 */
const CREATE_KEY_FN = (
  symbol: string,
  strategyName: StrategyName,
  exchangeName: ExchangeName,
  frameName: FrameName,
  backtest: boolean
): Key => {
  const parts = [symbol, strategyName, exchangeName];
  if (frameName) parts.push(frameName);
  parts.push(backtest ? "backtest" : "live");
  return parts.join(":") as Key;
};

/**
 * In-memory registry of currently running backtest and live activities.
 *
 * Purpose:
 * - Each `Backtest.run` / `Live.run` / per-strategy walker iteration registers an
 *   {@link IActivityEntry} on start and removes it on completion.
 * - `Candle.spinLock` consults {@link isParallel} to decide whether the event-loop
 *   hand-off (post-candle-fetch spin) is worth performing. With a single active
 *   workload there is no peer to yield to, so the spin is skipped entirely.
 *
 * Exposed as the `Lookup` singleton; no constructor parameters.
 *
 * @example
 * ```typescript
 * Lookup.addActivity({ symbol: "BTCUSDT", context, backtest: true });
 * try {
 *   for await (const _ of run(symbol, context)) { ... }
 * } finally {
 *   Lookup.removeActivity({ symbol: "BTCUSDT", context, backtest: true });
 * }
 * ```
 */
export class LookupUtils {
  /** Active entries keyed by their composite {@link Key}. */
  private readonly _lookupMap = new Map<Key, IActivityEntry>();

  /**
   * `true` when more than one activity is currently registered.
   * Used by `Candle.spinLock` to decide whether yielding the event loop is useful.
   */
  public get isParallel() {
    return this._lookupMap.size > 1;
  }

  /**
   * Registers a backtest or live activity in the lookup map.
   * Idempotent for identical keys — duplicate calls overwrite the existing entry.
   *
   * @param activity - Activity descriptor identifying the running workload.
   */
  public addActivity = (activity: IActivityEntry) => {
    LOGGER_SERVICE.info(METHOD_NAME_ADD_ACTIVITY, {
      activity,
    });
    const key = CREATE_KEY_FN(
      activity.symbol,
      activity.context.strategyName,
      activity.context.exchangeName,
      activity.context.frameName,
      activity.backtest,
    );
    this._lookupMap.set(key, activity);
  };

  /**
   * Removes a previously registered activity from the lookup map.
   * Must be paired with a prior {@link addActivity}, typically in a `finally` block,
   * so a thrown error in the underlying run does not leave a stale entry behind.
   *
   * @param activity - Activity descriptor matching the one passed to {@link addActivity}.
   */
  public removeActivity = (activity: IActivityEntry) => {
    LOGGER_SERVICE.info(METHOD_NAME_REMOVE_ACTIVITY, {
      activity,
    });
    const key = CREATE_KEY_FN(
      activity.symbol,
      activity.context.strategyName,
      activity.context.exchangeName,
      activity.context.frameName,
      activity.backtest,
    );
    this._lookupMap.delete(key);
  };

  /**
   * Returns a snapshot of currently active entries.
   *
   * @returns Array of all activities present in the lookup map at call time.
   */
  public listActivity = () => {
    LOGGER_SERVICE.info(METHOD_NAME_LIST_ACTIVITY);
    return Array.from(this._lookupMap.values());
  };
}

/**
 * Process-wide singleton instance of {@link LookupUtils}.
 * Imported by `Backtest`, `Live`, `WalkerLogicPrivateService` (registration sites)
 * and by `Candle` (read-only consumer via `isParallel`).
 */
export const Lookup = new LookupUtils();
