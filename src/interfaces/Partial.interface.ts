import { ILogger } from "./Logger.interface";
import { ISignalRow } from "./Strategy.interface";

/**
 * Profit or loss level milestone in percentage points.
 * Represents 10%, 20%, 30%, ..., 100% profit or loss thresholds.
 *
 * Used to track when a signal reaches specific profit/loss milestones.
 * Each level is emitted only once per signal (deduplication via Set).
 *
 * @example
 * ```typescript
 * const level: PartialLevel = 50; // 50% profit or loss milestone
 * ```
 */
export type PartialLevel = 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100;

/**
 * In-memory state for tracking which profit/loss levels have been reached.
 * Uses Sets for O(1) deduplication and fast lookups.
 *
 * Stored per signal ID in ClientPartial._states Map.
 * Persisted to disk as IPartialData (Sets converted to arrays).
 */
export interface IPartialState {
  /**
   * Set of profit levels that have been reached for this signal.
   * Example: Set(10, 20, 30) means 10%, 20%, 30% profit levels were hit.
   */
  profitLevels: Set<PartialLevel>;

  /**
   * Set of loss levels that have been reached for this signal.
   * Example: Set(10, 20) means -10%, -20% loss levels were hit.
   */
  lossLevels: Set<PartialLevel>;
}

/**
 * Serializable partial data for persistence layer.
 * Converts Sets to arrays for JSON serialization.
 *
 * Stored in PersistPartialAdapter as Record<signalId, IPartialData>.
 * Loaded on initialization and converted back to IPartialState.
 */
export interface IPartialData {
  /**
   * Array of profit levels that have been reached for this signal.
   * Serialized form of IPartialState.profitLevels Set.
   */
  profitLevels: PartialLevel[];

  /**
   * Array of loss levels that have been reached for this signal.
   * Serialized form of IPartialState.lossLevels Set.
   */
  lossLevels: PartialLevel[];
}

/**
 * Parameters for ClientPartial constructor.
 * Defines logger and callback handlers for profit/loss events.
 */
export interface IPartialParams {
  /**
   * Logger instance for debug and info messages.
   */
  logger: ILogger;

  /**
   * Callback invoked when a signal reaches a new profit level.
   * Called before emitting to partialProfitSubject.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param data - Signal row data
   * @param currentPrice - Current market price
   * @param level - Profit level reached (10, 20, 30, etc)
   * @param backtest - True if backtest mode, false if live mode
   * @param timestamp - Event timestamp in milliseconds (current time for live, candle time for backtest)
   */
  onProfit: (
    symbol: string,
    data: ISignalRow,
    currentPrice: number,
    level: PartialLevel,
    backtest: boolean,
    timestamp: number
  ) => void;

  /**
   * Callback invoked when a signal reaches a new loss level.
   * Called before emitting to partialLossSubject.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param data - Signal row data
   * @param currentPrice - Current market price
   * @param level - Loss level reached (10, 20, 30, etc)
   * @param backtest - True if backtest mode, false if live mode
   * @param timestamp - Event timestamp in milliseconds (current time for live, candle time for backtest)
   */
  onLoss: (
    symbol: string,
    data: ISignalRow,
    currentPrice: number,
    level: PartialLevel,
    backtest: boolean,
    timestamp: number
  ) => void;
}

/**
 * Partial profit/loss tracking interface.
 * Implemented by ClientPartial and PartialConnectionService.
 *
 * Tracks profit/loss level milestones for active trading signals.
 * Emits events when signals reach 10%, 20%, 30%, etc profit or loss.
 *
 * @example
 * ```typescript
 * import { ClientPartial } from "./client/ClientPartial";
 *
 * const partial = new ClientPartial({
 *   logger: loggerService,
 *   onProfit: (symbol, data, price, level, backtest, timestamp) => {
 *     console.log(`Signal ${data.id} reached ${level}% profit`);
 *   },
 *   onLoss: (symbol, data, price, level, backtest, timestamp) => {
 *     console.log(`Signal ${data.id} reached ${level}% loss`);
 *   }
 * });
 *
 * await partial.waitForInit("BTCUSDT");
 *
 * // During signal monitoring
 * await partial.profit("BTCUSDT", signal, 51000, 15.5, false, new Date());
 * // Emits event when reaching 10% profit milestone
 *
 * // When signal closes
 * await partial.clear("BTCUSDT", signal, 52000);
 * ```
 */
export interface IPartial {
  /**
   * Processes profit state and emits events for new profit levels reached.
   *
   * Called by ClientStrategy during signal monitoring when revenuePercent > 0.
   * Checks which profit levels (10%, 20%, 30%, etc) have been reached
   * and emits events for new levels only (Set-based deduplication).
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param data - Signal row data
   * @param currentPrice - Current market price
   * @param revenuePercent - Current profit percentage (positive value)
   * @param backtest - True if backtest mode, false if live mode
   * @param when - Event timestamp (current time for live, candle time for backtest)
   * @returns Promise that resolves when profit processing is complete
   *
   * @example
   * ```typescript
   * // Signal opened at $50000, current price $51500
   * // Revenue: 3% profit
   * await partial.profit("BTCUSDT", signal, 51500, 3.0, false, new Date());
   * // No events emitted (below 10% threshold)
   *
   * // Price rises to $55000
   * // Revenue: 10% profit
   * await partial.profit("BTCUSDT", signal, 55000, 10.0, false, new Date());
   * // Emits partialProfitSubject event for 10% level
   *
   * // Price rises to $61000
   * // Revenue: 22% profit
   * await partial.profit("BTCUSDT", signal, 61000, 22.0, false, new Date());
   * // Emits events for 20% level only (10% already emitted)
   * ```
   */
  profit(
    symbol: string,
    data: ISignalRow,
    currentPrice: number,
    revenuePercent: number,
    backtest: boolean,
    when: Date
  ): Promise<void>;

  /**
   * Processes loss state and emits events for new loss levels reached.
   *
   * Called by ClientStrategy during signal monitoring when revenuePercent < 0.
   * Checks which loss levels (10%, 20%, 30%, etc) have been reached
   * and emits events for new levels only (Set-based deduplication).
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param data - Signal row data
   * @param currentPrice - Current market price
   * @param lossPercent - Current loss percentage (negative value)
   * @param backtest - True if backtest mode, false if live mode
   * @param when - Event timestamp (current time for live, candle time for backtest)
   * @returns Promise that resolves when loss processing is complete
   *
   * @example
   * ```typescript
   * // Signal opened at $50000, current price $48000
   * // Loss: -4% loss
   * await partial.loss("BTCUSDT", signal, 48000, -4.0, false, new Date());
   * // No events emitted (below -10% threshold)
   *
   * // Price drops to $45000
   * // Loss: -10% loss
   * await partial.loss("BTCUSDT", signal, 45000, -10.0, false, new Date());
   * // Emits partialLossSubject event for 10% level
   *
   * // Price drops to $39000
   * // Loss: -22% loss
   * await partial.loss("BTCUSDT", signal, 39000, -22.0, false, new Date());
   * // Emits events for 20% level only (10% already emitted)
   * ```
   */
  loss(
    symbol: string,
    data: ISignalRow,
    currentPrice: number,
    lossPercent: number,
    backtest: boolean,
    when: Date
  ): Promise<void>;

  /**
   * Clears partial profit/loss state when signal closes.
   *
   * Called by ClientStrategy when signal completes (TP/SL/time_expired).
   * Removes signal state from memory and persists changes to disk.
   * Cleans up memoized ClientPartial instance in PartialConnectionService.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param data - Signal row data
   * @param priceClose - Final closing price
   * @returns Promise that resolves when clear is complete
   *
   * @example
   * ```typescript
   * // Signal closes at take profit
   * await partial.clear("BTCUSDT", signal, 52000);
   * // State removed from _states Map
   * // Persisted to disk without this signal's data
   * // Memoized instance cleared from getPartial cache
   * ```
   */
  clear(symbol: string, data: ISignalRow, priceClose: number, backtest: boolean): Promise<void>;
}
