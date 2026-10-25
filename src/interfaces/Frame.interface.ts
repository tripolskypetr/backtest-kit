import { ILogger } from "./Logger.interface";

/**
 * Interval of a backtest frame: the granularity of the generated timeframe
 * array (`entryInterval`) and the stride of the candle loops that watch an
 * open or scheduled signal (`watchInterval`).
 *
 * Minutes: 1m, 3m, 5m, 15m, 30m
 * Hours: 1h, 2h, 4h, 6h, 8h, 12h
 * Days: 1d
 */
export type FrameInterval =
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "6h"
  | "8h"
  | "12h"
  | "1d";

/**
 * Frame parameters passed to ClientFrame constructor.
 * Extends IFrameSchema with logger instance for internal logging.
 */
export interface IFrameParams extends IFrameSchema {
    /** Logger service for debug output */
    logger: ILogger;
    /** Resolved tick interval: `entryInterval`, or `interval`, or `"1m"` (see IFrameSchema) */
    entryInterval: FrameInterval;
    /** Resolved watch interval: `watchInterval` or `"1m"` (see IFrameSchema) */
    watchInterval: FrameInterval;
}

/**
 * Callbacks for frame lifecycle events.
 */
export interface IFrameCallbacks {
  /**
   * Called after timeframe array generation.
   * Useful for logging or validating the generated timeframes.
   *
   * @param timeframe - Array of Date objects representing tick timestamps
   * @param startDate - Start of the backtest period
   * @param endDate - End of the backtest period
   * @param interval - Entry interval the timestamps were generated with
   */
  onTimeframe: (
    timeframe: Date[],
    startDate: Date,
    endDate: Date,
    interval: FrameInterval
  ) => void | Promise<void>;
}

/**
 * Frame schema registered via addFrameSchema().
 * Defines the backtest period and the two cadences of the backtest:
 *
 * - `entryInterval` — how often the strategy is asked for a NEW signal
 *   (`getSignal`) and how often idle pings fire: the generated timeframe array
 *   is spaced by it. This is the "tick" of the backtest and the step the
 *   lockstep hand-off between parallel backtests follows.
 * - `watchInterval` — how often the strategy LOOKS at an open or scheduled
 *   signal during its candle replay: VWAP, active and schedule pings,
 *   partial / breakeven / trailing callbacks and the commit queue run once per
 *   watch span, at its last candle. Candles stay 1m, and what the exchange does
 *   on its own does not wait for the look: stop-loss / liquidation touches,
 *   take-profit by VWAP, time expiry (`minuteEstimatedTime`), scheduled
 *   activation / stop reject / wait timeout are found candle by candle inside
 *   the span and executed on the candle they happened on, with the exact level
 *   price and timestamp (an activated entry gets the minute of the touch as
 *   `pendingAt`). The strategy's own protective events do not wait either: a
 *   partial profit / loss level crossed or the breakeven threshold reached
 *   inside the span gets its callbacks on that candle (a light look, no ping),
 *   a commit issued between looks (its action is immediate) has its commit
 *   event stamped on the next candle like a live tick a minute later, and the
 *   peak / drawdown of the position are recorded candle by candle
 *   (reported once, at the next look). Only the active / schedule pings and
 *   the decisions taken in them keep the span cadence. Long replays are
 *   windowed in whole watch spans, so the grid stays regular across candle
 *   fetches.
 *
 * `interval` is an alias of `entryInterval` kept for the original schema
 * shape; a schema that sets both is rejected. `watchInterval` defaults to
 * `"1m"` (every candle is evaluated) regardless of `entryInterval`, so an
 * existing `{ interval: "1h" }` frame keeps its per-minute replay. Use a
 * coarse `watchInterval` when the candle feed has no intra-span movement
 * (daily bars polyfilled to 1m) or when a per-minute replay is not worth its
 * cost. Live mode ignores frames: it ticks on the real clock and evaluates
 * every candle.
 *
 * @example
 * ```typescript
 * // a new signal once an hour, the open position re-evaluated every 4 hours
 * addFrameSchema({
 *   frameName: "q1-backtest",
 *   entryInterval: "1h",
 *   watchInterval: "4h",
 *   startDate: new Date("2024-01-01T00:00:00Z"),
 *   endDate: new Date("2024-03-31T23:59:59Z"),
 *   callbacks: {
 *     onTimeframe: (timeframe, startDate, endDate, interval) => {
 *       console.log(`Generated ${timeframe.length} timestamps at ${interval}`);
 *     },
 *   },
 * });
 *
 * // the original shape: ticks every minute, every candle evaluated
 * addFrameSchema({ frameName: "1d-backtest", interval: "1m", startDate, endDate });
 * ```
 */
export interface IFrameSchema {
  /** Unique identifier for this frame */
  frameName: FrameName;
  /** Optional developer note for documentation */
  note?: string;
  /**
   * Alias of `entryInterval` (the original schema shape). Setting both
   * `interval` and `entryInterval` is a validation error. Defaults to "1m".
   */
  interval?: FrameInterval;
  /**
   * Tick interval: spacing of the generated timeframe array, i.e. how often
   * `getSignal` is asked for a new signal and idle pings fire. Also the step
   * the lockstep hand-off between parallel backtests follows. Defaults to
   * `interval`, then "1m".
   */
  entryInterval?: FrameInterval;
  /**
   * Stride of the candle loops that watch an open or scheduled signal: the
   * strategy's pings come once per span, at its last candle; exchange-forced
   * events (stop / liquidation / take-profit / time expiry / activation /
   * timeout), partial levels, breakeven, queued commits and the peak /
   * drawdown statistics still happen on the exact candle inside the span.
   * Independent of
   * `entryInterval`: may be shorter (a 1h tick with a 15m watch) or longer
   * (a 1h tick with a 4h watch). Defaults to "1m" — every candle evaluated.
   */
  watchInterval?: FrameInterval;
  /** Start of backtest period (inclusive) */
  startDate: Date;
  /** End of backtest period (inclusive) */
  endDate: Date;
  /** Optional lifecycle callbacks */
  callbacks?: Partial<IFrameCallbacks>;
}

/**
 * Frame interface for timeframe generation.
 * Used internally by backtest orchestration.
 */
export interface IFrame {
  /**
   * Generates array of timestamps for backtest iteration.
   * Timestamps are spaced according to the configured interval.
   *
   * @param symbol - Trading pair symbol (unused, for API consistency)
   * @returns Promise resolving to array of Date objects
   */
  getTimeframe: (symbol: string, frameName: FrameName) => Promise<Date[]>;
}

/**
 * Unique identifier for a frame schema.
 * Used to retrieve frame instances via dependency injection.
 */
export type FrameName = string;
