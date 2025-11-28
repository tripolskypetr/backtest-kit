import { ILogger } from "./Logger.interface";

/**
 * Timeframe interval for backtest period generation.
 * Determines the granularity of timestamps in the generated timeframe array.
 *
 * Minutes: 1m, 3m, 5m, 15m, 30m
 * Hours: 1h, 2h, 4h, 6h, 8h, 12h
 * Days: 1d, 3d
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
  | "1d"
  | "3d";

/**
 * Frame parameters passed to ClientFrame constructor.
 * Extends IFrameSchema with logger instance for internal logging.
 */
export interface IFrameParams extends IFrameSchema {
    /** Logger service for debug output */
    logger: ILogger;
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
   * @param interval - Interval used for generation
   */
  onTimeframe: (
    timeframe: Date[],
    startDate: Date,
    endDate: Date,
    interval: FrameInterval
  ) => void;
}

/**
 * Frame schema registered via addFrame().
 * Defines backtest period and interval for timestamp generation.
 *
 * @example
 * ```typescript
 * addFrame({
 *   frameName: "1d-backtest",
 *   interval: "1m",
 *   startDate: new Date("2024-01-01T00:00:00Z"),
 *   endDate: new Date("2024-01-02T00:00:00Z"),
 *   callbacks: {
 *     onTimeframe: (timeframe, startDate, endDate, interval) => {
 *       console.log(`Generated ${timeframe.length} timestamps`);
 *     },
 *   },
 * });
 * ```
 */
export interface IFrameSchema {
  /** Unique identifier for this frame */
  frameName: FrameName;
  /** Optional developer note for documentation */
  note?: string;
  /** Interval for timestamp generation */
  interval: FrameInterval;
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
