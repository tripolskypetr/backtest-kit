import { ExchangeName } from "./Exchange.interface";
import { FrameName } from "./Frame.interface";
import { ILogger } from "./Logger.interface";
import { ISignalRow, IPublicSignalRow, StrategyName } from "./Strategy.interface";

/**
 * In-memory state for tracking breakeven status.
 * Stores whether breakeven has been reached for this signal.
 *
 * Stored per signal ID in ClientBreakeven._states Map.
 * Persisted to disk as IBreakevenData (boolean).
 */
export interface IBreakevenState {
  /**
   * Whether breakeven has been reached for this signal.
   * Once true, remains true for the signal's lifetime (idempotent).
   */
  reached: boolean;
}

/**
 * Serializable breakeven data for persistence layer.
 * Converts state to simple boolean for JSON serialization.
 *
 * Stored in PersistBreakevenAdapter as Record<signalId, IBreakevenData>.
 * Loaded on initialization and converted back to IBreakevenState.
 */
export interface IBreakevenData {
  /**
   * Whether breakeven has been reached for this signal.
   * Serialized form of IBreakevenState.reached.
   */
  reached: boolean;
}

/**
 * Parameters for ClientBreakeven constructor.
 * Defines logger and callback handler for breakeven events.
 */
export interface IBreakevenParams {
  /**
   * Unique signal ID associated with this ClientBreakeven instance.
   */
  signalId: ISignalRow["id"];

  /**
   * Logger instance for debug and info messages.
   */
  logger: ILogger;

  /**
   * True if backtest mode, false if live mode.
   */
  backtest: boolean;

  /**
   * Callback invoked when a signal reaches breakeven.
   * Called before emitting to breakevenSubject.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param strategyName - Strategy name that generated this signal
   * @param exchangeName - Exchange name where this signal is being executed
   * @param frameName - Frame name where this signal is being executed
   * @param data - Signal row data
   * @param currentPrice - Current market price when breakeven was reached
   * @param backtest - True if backtest mode, false if live mode
   * @param timestamp - Event timestamp in milliseconds (current time for live, candle time for backtest)
   */
  onBreakeven: (
    symbol: string,
    strategyName: StrategyName,
    exchangeName: ExchangeName,
    frameName: FrameName,
    data: IPublicSignalRow,
    currentPrice: number,
    backtest: boolean,
    timestamp: number
  ) => void;
}

/**
 * Breakeven tracking interface.
 * Implemented by ClientBreakeven and BreakevenConnectionService.
 *
 * Tracks when a signal's stop-loss is moved to breakeven (entry price).
 * Emits events when threshold is reached (price moves far enough to cover transaction costs).
 *
 * @example
 * ```typescript
 * import { ClientBreakeven } from "./client/ClientBreakeven";
 *
 * const breakeven = new ClientBreakeven({
 *   logger: loggerService,
 *   onBreakeven: (symbol, data, price, backtest, timestamp) => {
 *     console.log(`Signal ${data.id} reached breakeven at ${price}`);
 *   }
 * });
 *
 * await breakeven.waitForInit("BTCUSDT");
 *
 * // During signal monitoring
 * await breakeven.check("BTCUSDT", signal, 100.5, false, new Date());
 * // Emits event when threshold reached and SL moved to entry
 *
 * // When signal closes
 * await breakeven.clear("BTCUSDT", signal, 101, false);
 * ```
 */
export interface IBreakeven {
  /**
   * Checks if breakeven should be triggered and emits event if conditions met.
   *
   * Called by ClientStrategy during signal monitoring.
   * Checks if:
   * 1. Breakeven not already reached
   * 2. Price has moved far enough to cover transaction costs
   * 3. Stop-loss can be moved to entry price
   *
   * If all conditions met:
   * - Marks breakeven as reached
   * - Calls onBreakeven callback (emits to breakevenSubject)
   * - Persists state to disk
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param data - Signal row data
   * @param currentPrice - Current market price
   * @param backtest - True if backtest mode, false if live mode
   * @param when - Event timestamp (current time for live, candle time for backtest)
   * @returns Promise that resolves when breakeven check is complete
   *
   * @example
   * ```typescript
   * // LONG: entry=100, slippage=0.1%, fee=0.1%, threshold=0.4%
   * // Price at 100.3 - threshold not reached
   * await breakeven.check("BTCUSDT", signal, 100.3, false, new Date());
   * // No event emitted (price < 100.4)
   *
   * // Price at 100.5 - threshold reached!
   * await breakeven.check("BTCUSDT", signal, 100.5, false, new Date());
   * // Emits breakevenSubject event
   *
   * // Price at 101 - already at breakeven
   * await breakeven.check("BTCUSDT", signal, 101, false, new Date());
   * // No event emitted (already reached)
   * ```
   */
  check(
    symbol: string,
    data: IPublicSignalRow,
    currentPrice: number,
    backtest: boolean,
    when: Date
  ): Promise<void>;

  /**
   * Clears breakeven state when signal closes.
   *
   * Called by ClientStrategy when signal completes (TP/SL/time_expired).
   * Removes signal state from memory and persists changes to disk.
   * Cleans up memoized ClientBreakeven instance in BreakevenConnectionService.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param data - Signal row data
   * @param priceClose - Final closing price
   * @param backtest - True if backtest mode, false if live mode
   * @returns Promise that resolves when clear is complete
   *
   * @example
   * ```typescript
   * // Signal closes at take profit
   * await breakeven.clear("BTCUSDT", signal, 101);
   * // State removed from _states Map
   * // Persisted to disk without this signal's data
   * // Memoized instance cleared from getBreakeven cache
   * ```
   */
  clear(symbol: string, data: IPublicSignalRow, priceClose: number, backtest: boolean): Promise<void>;
}
