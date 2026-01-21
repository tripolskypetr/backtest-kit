import { TMethodContextService } from "../lib/services/context/MethodContextService";
import { TExecutionContextService } from "../lib/services/context/ExecutionContextService";
import { IExchange, ICandleData, ExchangeName } from "./Exchange.interface";
import { ILogger } from "./Logger.interface";
import { IRisk, RiskName } from "./Risk.interface";
import { IPartial } from "./Partial.interface";
import { IBreakeven } from "./Breakeven.interface";
import { FrameName } from "./Frame.interface";
import { ActionName } from "./Action.interface";

/**
 * Signal generation interval for throttling.
 * Enforces minimum time between getSignal calls.
 */
export type SignalInterval =
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1h";

/**
 * Signal data transfer object returned by getSignal.
 * Will be validated and augmented with auto-generated id.
 */
export interface ISignalDto {
  /** Optional signal ID (auto-generated if not provided) */
  id?: string;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Human-readable description of signal reason */
  note?: string;
  /** Entry price for the position */
  priceOpen?: number;
  /** Take profit target price (must be > priceOpen for long, < priceOpen for short) */
  priceTakeProfit: number;
  /** Stop loss exit price (must be < priceOpen for long, > priceOpen for short) */
  priceStopLoss: number;
  /** Expected duration in minutes before time_expired */
  minuteEstimatedTime: number;
}

/**
 * Complete signal with auto-generated id.
 * Used throughout the system after validation.
 */
export interface ISignalRow extends ISignalDto {
  /** Unique signal identifier (UUID v4 auto-generated) */
  id: string;
  /** Entry price for the position */
  priceOpen: number;
  /** Unique exchange identifier for execution */
  exchangeName: ExchangeName;
  /** Unique strategy identifier for execution */
  strategyName: StrategyName;
  /** Unique frame identifier for execution (empty string for live mode) */
  frameName: FrameName;
  /** Signal creation timestamp in milliseconds (when signal was first created/scheduled) */
  scheduledAt: number;
  /** Pending timestamp in milliseconds (when position became pending/active at priceOpen) */
  pendingAt: number;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Internal runtime marker for scheduled signals */
  _isScheduled: boolean;
  /**
   * History of partial closes for PNL calculation.
   * Each entry contains type (profit/loss), percent closed, and price.
   * Used to calculate weighted PNL: Σ(percent_i × pnl_i) for each partial + (remaining% × final_pnl)
   *
   * Computed values (derived from this array):
   * - _tpClosed: Sum of all "profit" type partial close percentages
   * - _slClosed: Sum of all "loss" type partial close percentages
   * - _totalClosed: Sum of all partial close percentages (profit + loss)
   */
  _partial?: Array<{
    /** Type of partial close: profit (moving toward TP) or loss (moving toward SL) */
    type: "profit" | "loss";
    /** Percentage of position closed (0-100) */
    percent: number;
    /** Price at which this partial was executed */
    price: number;
  }>;
  /**
   * Trailing stop-loss price that overrides priceStopLoss when set.
   * Updated by trailing() method based on position type and percentage distance.
   * - For LONG: moves upward as price moves toward TP (never moves down)
   * - For SHORT: moves downward as price moves toward TP (never moves up)
   * When _trailingPriceStopLoss is set, it replaces priceStopLoss for TP/SL checks.
   * Original priceStopLoss is preserved in persistence but ignored during execution.
   */
  _trailingPriceStopLoss?: number;
  /**
   * Trailing take-profit price that overrides priceTakeProfit when set.
   * Created and managed by trailingTake() method for dynamic TP adjustment.
   * Allows moving TP further from or closer to current price based on strategy.
   * Updated by trailingTake() method based on position type and percentage distance.
   * - For LONG: can move upward (further) or downward (closer) from entry
   * - For SHORT: can move downward (further) or upward (closer) from entry
   * When _trailingPriceTakeProfit is set, it replaces priceTakeProfit for TP/SL checks.
   * Original priceTakeProfit is preserved in persistence but ignored during execution.
   */
  _trailingPriceTakeProfit?: number;
}

/**
 * Scheduled signal row for delayed entry at specific price.
 * Inherits from ISignalRow - represents a signal waiting for price to reach priceOpen.
 * Once price reaches priceOpen, will be converted to regular _pendingSignal.
 * Note: pendingAt will be set to scheduledAt until activation, then updated to actual pending time.
 */
export interface IScheduledSignalRow extends ISignalRow {
  /** Entry price for the position */
  priceOpen: number;
}

/**
 * Public signal row with original stop-loss and take-profit prices.
 * Extends ISignalRow to include originalPriceStopLoss and originalPriceTakeProfit for external visibility.
 * Used in public APIs to show user the original SL/TP even if trailing SL/TP are active.
 * This allows users to see both the current effective SL/TP and the original values set at signal creation.
 * The original prices remain unchanged even if _trailingPriceStopLoss or _trailingPriceTakeProfit modify the effective values.
 * Useful for transparency in reporting and user interfaces.
 * Note: originalPriceStopLoss/originalPriceTakeProfit are identical to priceStopLoss/priceTakeProfit at signal creation time.
 */
export interface IPublicSignalRow extends ISignalRow {
  /**
   * Original stop-loss price set at signal creation.
   * Remains unchanged even if trailing stop-loss modifies effective SL.
   * Used for user visibility of initial SL parameters.
   */
  originalPriceStopLoss: number;
  /**
   * Original take-profit price set at signal creation.
   * Remains unchanged even if trailing take-profit modifies effective TP.
   * Used for user visibility of initial TP parameters.
   */
  originalPriceTakeProfit: number;
  /**
   * Total executed percentage from partial closes.
   * Sum of all percent values from _partial array (both profit and loss types).
   * Represents the total portion of the position that has been closed through partial executions.
   * Range: 0-100. Value of 0 means no partial closes, 100 means position fully closed through partials.
   */
  totalExecuted: number;
}

/**
 * Risk signal row for internal risk management.
 * Extends ISignalDto to include priceOpen, originalPriceStopLoss and originalPriceTakeProfit.
 * Used in risk validation to access entry price and original SL/TP.
 */
export interface IRiskSignalRow extends IPublicSignalRow {
  /**
   * Entry price for the position.
   */
  priceOpen: number;
  /**
   * Original stop-loss price set at signal creation.
   */
  originalPriceStopLoss: number;
  /**
   * Original take-profit price set at signal creation.
   */
  originalPriceTakeProfit: number;
}

/**
 * Scheduled signal row with cancellation ID.
 * Extends IScheduledSignalRow to include optional cancelId for user-initiated cancellations.
 */
export interface IScheduledSignalCancelRow extends IScheduledSignalRow {
  /** Cancellation ID (only for user-initiated cancellations) */
  cancelId?: string;
}

/**
 * Signal row with close ID.
 * Extends ISignalRow to include optional closeId for user-initiated closes.
 */
export interface ISignalCloseRow extends ISignalRow {
  /** Close ID (only for user-initiated closes) */
  closeId?: string;
}

/**
 * Strategy parameters passed to ClientStrategy constructor.
 * Combines schema with runtime dependencies.
 */
export interface IStrategyParams extends IStrategySchema {
  /** Exchange name (e.g., "binance") */
  exchangeName: ExchangeName;
  /** Time frame name for tracking (e.g., "1m", "5m") */
  frameName: FrameName;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Whether this event is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Partial handling service for partial profit/loss */
  partial: IPartial;
  /** Breakeven handling service for stop-loss protection */
  breakeven: IBreakeven;
  /** Logger service for debug output */
  logger: ILogger;
  /** Exchange service for candle data and VWAP */
  exchange: IExchange;
  /** Risk profile for risk management */
  risk: IRisk;
  /** Execution context service (symbol, when, backtest flag) */
  execution: TExecutionContextService;
  /** Method context service (strategyName, exchangeName, frameName) */
  method: TMethodContextService;
  /** System callback for init events (emits to initSubject) */
  onInit: (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => Promise<void>;
  /** System callback for schedule ping events (emits to pingSubject) */
  onSchedulePing: (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, data: IPublicSignalRow, backtest: boolean, timestamp: number) => Promise<void>;
  /** System callback for active ping events (emits to activePingSubject) */
  onActivePing: (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, data: IPublicSignalRow, backtest: boolean, timestamp: number) => Promise<void>;
  /** System callback for dispose events (emits to disposeSubject) */
  onDispose: (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => Promise<void>;
}

/**
 * Optional lifecycle callbacks for signal events.
 * Called when signals are opened, active, idle, closed, scheduled, or cancelled.
 */
export interface IStrategyCallbacks {
  /** Called on every tick with the result */
  onTick: (symbol: string, result: IStrategyTickResult, backtest: boolean) => void | Promise<void>;
  /** Called when new signal is opened (after validation) */
  onOpen: (symbol: string, data: IPublicSignalRow, currentPrice: number, backtest: boolean) => void | Promise<void>;
  /** Called when signal is being monitored (active state) */
  onActive: (symbol: string, data: IPublicSignalRow, currentPrice: number, backtest: boolean) => void | Promise<void>;
  /** Called when no active signal exists (idle state) */
  onIdle: (symbol: string, currentPrice: number, backtest: boolean) => void | Promise<void>;
  /** Called when signal is closed with final price */
  onClose: (
    symbol: string,
    data: IPublicSignalRow,
    priceClose: number,
    backtest: boolean,
  ) => void | Promise<void>;
  /** Called when scheduled signal is created (delayed entry) */
  onSchedule: (symbol: string, data: IPublicSignalRow, currentPrice: number, backtest: boolean) => void | Promise<void>;
  /** Called when scheduled signal is cancelled without opening position */
  onCancel: (symbol: string, data: IPublicSignalRow, currentPrice: number, backtest: boolean) => void | Promise<void>;
  /** Called when signal is written to persist storage (for testing) */
  onWrite: (symbol: string, data: IPublicSignalRow | null, backtest: boolean) => void;
  /** Called when signal is in partial profit state (price moved favorably but not reached TP yet) */
  onPartialProfit: (symbol: string, data: IPublicSignalRow, currentPrice: number, revenuePercent: number, backtest: boolean) => void | Promise<void>;
  /** Called when signal is in partial loss state (price moved against position but not hit SL yet) */
  onPartialLoss: (symbol: string, data: IPublicSignalRow, currentPrice: number, lossPercent: number, backtest: boolean) => void | Promise<void>;
  /** Called when signal reaches breakeven (stop-loss moved to entry price to protect capital) */
  onBreakeven: (symbol: string, data: IPublicSignalRow, currentPrice: number, backtest: boolean) => void | Promise<void>;
  /** Called every minute for scheduled signals regardless of strategy interval (for custom monitoring like checking if signal should be cancelled) */
  onSchedulePing: (symbol: string, data: IPublicSignalRow, when: Date, backtest: boolean) => void | Promise<void>;
  /** Called every minute for active pending signals regardless of strategy interval (for custom monitoring and dynamic management) */
  onActivePing: (symbol: string, data: IPublicSignalRow, when: Date, backtest: boolean) => void | Promise<void>;
}

/**
 * Strategy schema registered via addStrategy().
 * Defines signal generation logic and configuration.
 */
export interface IStrategySchema {
  /** Unique strategy identifier for registration */
  strategyName: StrategyName;
  /** Optional developer note for documentation */
  note?: string;
  /** Minimum interval between getSignal calls (throttling) */
  interval: SignalInterval;
  /**
   * Signal generation function (returns null if no signal, validated DTO if signal).
   * If priceOpen is provided - becomes scheduled signal waiting for price to reach entry point.
   * If priceOpen is omitted - opens immediately at current price.
   */
  getSignal: (symbol: string, when: Date) => Promise<ISignalDto | null>;
  /** Optional lifecycle event callbacks (onOpen, onClose) */
  callbacks?: Partial<IStrategyCallbacks>;
  /** Optional risk profile identifier for risk management */
  riskName?: RiskName;
  /** Optional several risk profile list for risk management (if multiple required) */
  riskList?: RiskName[];
  /** Optional list of action identifiers to attach to this strategy */
  actions?: ActionName[];
}

/**
 * Reason why signal was closed.
 * Used in discriminated union for type-safe handling.
 */
export type StrategyCloseReason = "time_expired" | "take_profit" | "stop_loss" | "closed";

/**
 * Reason why scheduled signal was cancelled.
 * Used in discriminated union for type-safe handling.
 */
export type StrategyCancelReason = "timeout" | "price_reject" | "user";

/**
 * Profit and loss calculation result.
 * Includes adjusted prices with fees (0.1%) and slippage (0.1%).
 */
export interface IStrategyPnL {
  /** Profit/loss as percentage (e.g., 1.5 for +1.5%, -2.3 for -2.3%) */
  pnlPercentage: number;
  /** Entry price adjusted with slippage and fees */
  priceOpen: number;
  /** Exit price adjusted with slippage and fees */
  priceClose: number;
}

/**
 * Tick result: no active signal, idle state.
 */
export interface IStrategyTickResultIdle {
  /** Discriminator for type-safe union */
  action: "idle";
  /** No signal in idle state */
  signal: null;
  /** Strategy name for tracking idle events */
  strategyName: StrategyName;
  /** Exchange name for tracking idle events */
  exchangeName: ExchangeName;
  /** Time frame name for tracking (e.g., "1m", "5m") */
  frameName: FrameName;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Current VWAP price during idle state */
  currentPrice: number;
  /** Whether this event is from backtest mode (true) or live mode (false) */
  backtest: boolean;
}

/**
 * Tick result: scheduled signal created, waiting for price to reach entry point.
 * Triggered when getSignal returns signal with priceOpen specified.
 */
export interface IStrategyTickResultScheduled {
  /** Discriminator for type-safe union */
  action: "scheduled";
  /** Scheduled signal waiting for activation */
  signal: IPublicSignalRow;
  /** Strategy name for tracking */
  strategyName: StrategyName;
  /** Exchange name for tracking */
  exchangeName: ExchangeName;
  /** Time frame name for tracking (e.g., "1m", "5m") */
  frameName: FrameName;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Current VWAP price when scheduled signal created */
  currentPrice: number;
  /** Whether this event is from backtest mode (true) or live mode (false) */
  backtest: boolean;
}

/**
 * Tick result: scheduled signal is waiting for price to reach entry point.
 * This is returned on subsequent ticks while monitoring a scheduled signal.
 * Different from "scheduled" which is only returned once when signal is first created.
 */
export interface IStrategyTickResultWaiting {
  /** Discriminator for type-safe union */
  action: "waiting";
  /** Scheduled signal waiting for activation */
  signal: IPublicSignalRow;
  /** Current VWAP price for monitoring */
  currentPrice: number;
  /** Strategy name for tracking */
  strategyName: StrategyName;
  /** Exchange name for tracking */
  exchangeName: ExchangeName;
  /** Time frame name for tracking (e.g., "1m", "5m") */
  frameName: FrameName;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Percentage progress towards take profit (always 0 for waiting scheduled signals) */
  percentTp: number;
  /** Percentage progress towards stop loss (always 0 for waiting scheduled signals) */
  percentSl: number;
  /** Unrealized PNL for scheduled position (theoretical, not yet activated) */
  pnl: IStrategyPnL;
  /** Whether this event is from backtest mode (true) or live mode (false) */
  backtest: boolean;
}

/**
 * Tick result: new signal just created.
 * Triggered after getSignal validation and persistence.
 */
export interface IStrategyTickResultOpened {
  /** Discriminator for type-safe union */
  action: "opened";
  /** Newly created and validated signal with generated ID */
  signal: IPublicSignalRow;
  /** Strategy name for tracking */
  strategyName: StrategyName;
  /** Exchange name for tracking */
  exchangeName: ExchangeName;
  /** Time frame name for tracking (e.g., "1m", "5m") */
  frameName: FrameName;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Current VWAP price at signal open */
  currentPrice: number;
  /** Whether this event is from backtest mode (true) or live mode (false) */
  backtest: boolean;
}

/**
 * Tick result: signal is being monitored.
 * Waiting for TP/SL or time expiration.
 */
export interface IStrategyTickResultActive {
  /** Discriminator for type-safe union */
  action: "active";
  /** Currently monitored signal */
  signal: IPublicSignalRow;
  /** Current VWAP price for monitoring */
  currentPrice: number;
  /** Strategy name for tracking */
  strategyName: StrategyName;
  /** Exchange name for tracking */
  exchangeName: ExchangeName;
  /** Time frame name for tracking (e.g., "1m", "5m") */
  frameName: FrameName;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Percentage progress towards take profit (0-100%, 0 if moving towards SL) */
  percentTp: number;
  /** Percentage progress towards stop loss (0-100%, 0 if moving towards TP) */
  percentSl: number;
  /** Unrealized PNL for active position with fees, slippage, and partial closes */
  pnl: IStrategyPnL;
  /** Whether this event is from backtest mode (true) or live mode (false) */
  backtest: boolean;
}

/**
 * Tick result: signal closed with PNL.
 * Final state with close reason and profit/loss calculation.
 */
export interface IStrategyTickResultClosed {
  /** Discriminator for type-safe union */
  action: "closed";
  /** Completed signal with original parameters */
  signal: IPublicSignalRow;
  /** Final VWAP price at close */
  currentPrice: number;
  /** Why signal closed (time_expired | take_profit | stop_loss | closed) */
  closeReason: StrategyCloseReason;
  /** Unix timestamp in milliseconds when signal closed */
  closeTimestamp: number;
  /** Profit/loss calculation with fees and slippage */
  pnl: IStrategyPnL;
  /** Strategy name for tracking */
  strategyName: StrategyName;
  /** Exchange name for tracking */
  exchangeName: ExchangeName;
  /** Time frame name for tracking (e.g., "1m", "5m") */
  frameName: FrameName;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Whether this event is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Close ID (only for user-initiated closes with reason "closed") */
  closeId?: string;
}

/**
 * Tick result: scheduled signal cancelled without opening position.
 * Occurs when scheduled signal doesn't activate or hits stop loss before entry.
 */
export interface IStrategyTickResultCancelled {
  /** Discriminator for type-safe union */
  action: "cancelled";
  /** Cancelled scheduled signal */
  signal: IPublicSignalRow;
  /** Final VWAP price at cancellation */
  currentPrice: number;
  /** Unix timestamp in milliseconds when signal cancelled */
  closeTimestamp: number;
  /** Strategy name for tracking */
  strategyName: StrategyName;
  /** Exchange name for tracking */
  exchangeName: ExchangeName;
  /** Time frame name for tracking (e.g., "1m", "5m") */
  frameName: FrameName;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Whether this event is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Reason for cancellation */
  reason: StrategyCancelReason;
  /** Optional cancellation ID (provided when user calls Backtest.cancel() or Live.cancel()) */
  cancelId?: string;
}

/**
 * Discriminated union of all tick results.
 * Use type guards: `result.action === "closed"` for type safety.
 */
export type IStrategyTickResult =
  | IStrategyTickResultIdle
  | IStrategyTickResultScheduled
  | IStrategyTickResultWaiting
  | IStrategyTickResultOpened
  | IStrategyTickResultActive
  | IStrategyTickResultClosed
  | IStrategyTickResultCancelled;

/**
 * Backtest returns closed result (TP/SL or time_expired) or cancelled result (scheduled signal never activated).
 */
export type IStrategyBacktestResult = IStrategyTickResultClosed | IStrategyTickResultCancelled;

/**
 * Strategy interface implemented by ClientStrategy.
 * Defines core strategy execution methods.
 */
export interface IStrategy {
  /**
   * Single tick of strategy execution with VWAP monitoring.
   * Checks for signal generation (throttled) and TP/SL conditions.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param strategyName - Name of the strategy
   * @returns Promise resolving to tick result (idle | opened | active | closed)
   */
  tick: (symbol: string, strategyName: StrategyName) => Promise<IStrategyTickResult>;

  /**
   * Retrieves the currently active pending signal for the symbol.
   * If no active signal exists, returns null.
   * Used internally for monitoring TP/SL and time expiration.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to pending signal or null
   */
  getPendingSignal: (symbol: string) => Promise<IPublicSignalRow | null>;

  /**
   * Retrieves the currently active scheduled signal for the symbol.
   * If no scheduled signal exists, returns null.
   * Used internally for monitoring scheduled signal activation.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to scheduled signal or null
   */
  getScheduledSignal: (symbol: string) => Promise<IPublicSignalRow | null>;

  /**
   * Checks if breakeven threshold has been reached for the current pending signal.
   *
   * Uses the same formula as BREAKEVEN_FN to determine if price has moved far enough
   * to cover transaction costs (slippage + fees) and allow breakeven to be set.
   * Threshold: (CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2 transactions
   *
   * For LONG position:
   * - Returns true when: currentPrice >= priceOpen * (1 + threshold%)
   * - Example: entry=100, threshold=0.4% → true when price >= 100.4
   *
   * For SHORT position:
   * - Returns true when: currentPrice <= priceOpen * (1 - threshold%)
   * - Example: entry=100, threshold=0.4% → true when price <= 99.6
   *
   * Special cases:
   * - Returns false if no pending signal exists
   * - Returns true if trailing stop is already in profit zone (breakeven already achieved)
   * - Returns false if threshold not reached yet
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param currentPrice - Current market price to check against threshold
   * @returns Promise<boolean> - true if breakeven threshold reached, false otherwise
   *
   * @example
   * ```typescript
   * // Check if breakeven is available for LONG position (entry=100, threshold=0.4%)
   * const canBreakeven = await strategy.getBreakeven("BTCUSDT", 100.5);
   * // Returns true (price >= 100.4)
   *
   * if (canBreakeven) {
   *   await strategy.breakeven("BTCUSDT", 100.5, false);
   * }
   * ```
   */
  getBreakeven: (symbol: string, currentPrice: number) => Promise<boolean>;

  /**
   * Checks if the strategy has been stopped.
   *
   * Returns the stopped state indicating whether the strategy should
   * cease processing new ticks or signals.
   *
   * @param symbol - Trading pair symbol
   * @returns Promise resolving to true if strategy is stopped, false otherwise
   */
  getStopped: (symbol: string) => Promise<boolean>;

  /**
   * Fast backtest using historical candles.
   * Iterates through candles, calculates VWAP, checks TP/SL on each candle.
   *
   * For scheduled signals: first monitors activation/cancellation,
   * then if activated continues with TP/SL monitoring.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Name of the strategy
   * @param candles - Array of historical candle data
   * @returns Promise resolving to closed result (always completes signal)
   */
  backtest: (symbol: string, strategyName: StrategyName, candles: ICandleData[]) => Promise<IStrategyBacktestResult>;

  /**
   * Stops the strategy from generating new signals.
   *
   * Sets internal flag to prevent getSignal from being called on subsequent ticks.
   * Does NOT force-close active pending signals - they continue monitoring until natural closure (TP/SL/time_expired).
   *
   * Use case: Graceful shutdown in live trading mode without abandoning open positions.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @returns Promise that resolves immediately when stop flag is set
   *
   * @example
   * ```typescript
   * // Graceful shutdown in Live.background() cancellation
   * const cancel = await Live.background("BTCUSDT", { ... });
   *
   * // Later: stop new signals, let existing ones close naturally
   * await cancel();
   * ```
   */
  stopStrategy: (symbol: string, backtest: boolean) => Promise<void>;

  /**
   * Cancels the scheduled signal without stopping the strategy.
   *
   * Clears the scheduled signal (waiting for priceOpen activation).
   * Does NOT affect active pending signals or strategy operation.
   * Does NOT set stop flag - strategy can continue generating new signals.
   *
   * Use case: Cancel a scheduled entry that is no longer desired without stopping the entire strategy.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param cancelId - Optional cancellation ID
   * @returns Promise that resolves when scheduled signal is cleared
   *
   * @example
   * ```typescript
   * // Cancel scheduled signal without stopping strategy
   * await strategy.cancelScheduled("BTCUSDT");
   * // Strategy continues, can generate new signals
   * ```
   */
  cancelScheduled: (symbol: string, backtest: boolean, cancelId?: string) => Promise<void>;

  /**
   * Closes the pending signal without stopping the strategy.
   *
   * Clears the pending signal (active position).
   * Does NOT affect scheduled signals or strategy operation.
   * Does NOT set stop flag - strategy can continue generating new signals.
   *
   * Use case: Close an active position that is no longer desired without stopping the entire strategy.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param backtest - Whether running in backtest mode
   * @param closeId - Optional identifier for this close operation
   * @returns Promise that resolves when pending signal is cleared
   *
   * @example
   * ```typescript
   * // Close pending signal without stopping strategy
   * await strategy.closePending("BTCUSDT", false, "user-close-123");
   * // Strategy continues, can generate new signals
   * ```
   */
  closePending: (symbol: string, backtest: boolean, closeId?: string) => Promise<void>;

  /**
   * Executes partial close at profit level (moving toward TP).
   *
   * Closes specified percentage of position at current price.
   * Updates _tpClosed, _totalClosed, and _partialHistory state.
   * Persists updated signal state for crash recovery.
   *
   * Validations:
   * - Throws if no pending signal exists
   * - Throws if called on scheduled signal (not yet activated)
   * - Throws if percentToClose <= 0 or > 100
   * - Returns false if _totalClosed + percentToClose > 100 (prevents over-closing)
   *
   * Use case: User-controlled partial close triggered from onPartialProfit callback.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param percentToClose - Absolute percentage of position to close (0-100)
   * @param currentPrice - Current market price for partial close
   * @param backtest - Whether running in backtest mode
   * @returns Promise<boolean> - true if partial close executed, false if skipped
   *
   * @example
   * ```typescript
   * callbacks: {
   *   onPartialProfit: async (symbol, signal, currentPrice, percentTp, backtest) => {
   *     if (percentTp >= 50) {
   *       const success = await strategy.partialProfit(symbol, 25, currentPrice, backtest);
   *       if (success) {
   *         console.log('Partial profit executed');
   *       }
   *     }
   *   }
   * }
   * ```
   */
  partialProfit: (symbol: string, percentToClose: number, currentPrice: number, backtest: boolean) => Promise<boolean>;

  /**
   * Executes partial close at loss level (moving toward SL).
   *
   * Closes specified percentage of position at current price.
   * Updates _slClosed, _totalClosed, and _partialHistory state.
   * Persists updated signal state for crash recovery.
   *
   * Validations:
   * - Throws if no pending signal exists
   * - Throws if called on scheduled signal (not yet activated)
   * - Throws if percentToClose <= 0 or > 100
   * - Returns false if _totalClosed + percentToClose > 100 (prevents over-closing)
   *
   * Use case: User-controlled partial close triggered from onPartialLoss callback.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param percentToClose - Absolute percentage of position to close (0-100)
   * @param currentPrice - Current market price for partial close
   * @param backtest - Whether running in backtest mode
   * @returns Promise<boolean> - true if partial close executed, false if skipped
   *
   * @example
   * ```typescript
   * callbacks: {
   *   onPartialLoss: async (symbol, signal, currentPrice, percentSl, backtest) => {
   *     if (percentSl >= 80) {
   *       const success = await strategy.partialLoss(symbol, 50, currentPrice, backtest);
   *       if (success) {
   *         console.log('Partial loss executed');
   *       }
   *     }
   *   }
   * }
   * ```
   */
  partialLoss: (symbol: string, percentToClose: number, currentPrice: number, backtest: boolean) => Promise<boolean>;

  /**
   * Adjusts trailing stop-loss by shifting distance between entry and original SL.
   *
   * CRITICAL: Always calculates from ORIGINAL SL, not from current trailing SL.
   * This prevents error accumulation on repeated calls.
   * Larger percentShift ABSORBS smaller one (updates only towards better protection).
   *
   * Calculates new SL based on percentage shift of the ORIGINAL distance (entry - originalSL):
   * - Negative %: tightens stop (moves SL closer to entry, reduces risk)
   * - Positive %: loosens stop (moves SL away from entry, allows more drawdown)
   *
   * For LONG position (entry=100, originalSL=90, distance=10%):
   * - percentShift = -50: newSL = 100 - 10%*(1-0.5) = 95 (5% distance, tighter)
   * - percentShift = +20: newSL = 100 - 10%*(1+0.2) = 88 (12% distance, looser)
   *
   * For SHORT position (entry=100, originalSL=110, distance=10%):
   * - percentShift = -50: newSL = 100 + 10%*(1-0.5) = 105 (5% distance, tighter)
   * - percentShift = +20: newSL = 100 + 10%*(1+0.2) = 112 (12% distance, looser)
   *
   * Absorption behavior:
   * - First call: sets trailing SL unconditionally
   * - Subsequent calls: updates only if new SL is BETTER (protects more profit)
   * - For LONG: only accepts HIGHER SL (never moves down, closer to entry wins)
   * - For SHORT: only accepts LOWER SL (never moves up, closer to entry wins)
   * - Stores in _trailingPriceStopLoss, original priceStopLoss always preserved
   *
   * Validations:
   * - Throws if no pending signal exists
   * - Throws if percentShift < -100 or > 100
   * - Throws if percentShift === 0
   * - Skips if new SL would cross entry price
   * - Skips if currentPrice already crossed new SL level (price intrusion protection)
   *
   * Use case: User-controlled trailing stop triggered from onPartialProfit callback.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param percentShift - Percentage shift of ORIGINAL SL distance [-100, 100], excluding 0
   * @param currentPrice - Current market price to check for intrusion
   * @param backtest - Whether running in backtest mode
   * @returns Promise<boolean> - true if trailing SL was set/updated, false if rejected
   *
   * @example
   * ```typescript
   * callbacks: {
   *   onPartialProfit: async (symbol, signal, currentPrice, percentTp, backtest) => {
   *     if (percentTp >= 50) {
   *       // LONG: entry=100, originalSL=90, distance=10%
   *
   *       // First call: tighten by 5%
   *       const success1 = await strategy.trailingStop(symbol, -5, currentPrice, backtest);
   *       // success1 = true, newDistance = 10% - 5% = 5%, newSL = 95
   *
   *       // Second call: try weaker protection
   *       const success2 = await strategy.trailingStop(symbol, -3, currentPrice, backtest);
   *       // success2 = false (SKIPPED: newSL=97 < 95, worse protection, larger % absorbs smaller)
   *
   *       // Third call: stronger protection
   *       const success3 = await strategy.trailingStop(symbol, -7, currentPrice, backtest);
   *       // success3 = true (ACCEPTED: newDistance = 3%, newSL = 97 > 95, better protection)
   *     }
   *   }
   * }
   * ```
   */
  trailingStop: (symbol: string, percentShift: number, currentPrice: number, backtest: boolean) => Promise<boolean>;

  /**
   * Adjusts the trailing take-profit distance for an active pending signal.
   *
   * CRITICAL: Always calculates from ORIGINAL TP, not from current trailing TP.
   * This prevents error accumulation on repeated calls.
   * Larger percentShift ABSORBS smaller one (updates only towards more conservative TP).
   *
   * Updates the take-profit distance by a percentage adjustment relative to the ORIGINAL TP distance.
   * Negative percentShift brings TP closer to entry (more conservative).
   * Positive percentShift moves TP further from entry (more aggressive).
   *
   * Absorption behavior:
   * - First call: sets trailing TP unconditionally
   * - Subsequent calls: updates only if new TP is MORE CONSERVATIVE (closer to entry)
   * - For LONG: only accepts LOWER TP (never moves up, closer to entry wins)
   * - For SHORT: only accepts HIGHER TP (never moves down, closer to entry wins)
   * - Stores in _trailingPriceTakeProfit, original priceTakeProfit always preserved
   *
   * Price intrusion protection: If current price has already crossed the new TP level,
   * the update is skipped to prevent immediate TP triggering.
   *
   * @param symbol - Trading pair symbol
   * @param percentShift - Percentage adjustment to ORIGINAL TP distance (-100 to 100)
   * @param currentPrice - Current market price to check for intrusion
   * @param backtest - Whether running in backtest mode
   * @returns Promise<boolean> - true if trailing TP was set/updated, false if rejected
   *
   * @example
   * ```typescript
   * callbacks: {
   *   onPartialProfit: async (symbol, signal, currentPrice, percentTp, backtest) => {
   *     // LONG: entry=100, originalTP=110, distance=10%, currentPrice=102
   *
   *     // First call: bring TP closer by 3%
   *     const success1 = await strategy.trailingTake(symbol, -3, currentPrice, backtest);
   *     // success1 = true, newDistance = 10% - 3% = 7%, newTP = 107
   *
   *     // Second call: try to move TP further (less conservative)
   *     const success2 = await strategy.trailingTake(symbol, 2, currentPrice, backtest);
   *     // success2 = false (SKIPPED: newTP=112 > 107, less conservative, larger % absorbs smaller)
   *
   *     // Third call: even more conservative
   *     const success3 = await strategy.trailingTake(symbol, -5, currentPrice, backtest);
   *     // success3 = true (ACCEPTED: newDistance = 5%, newTP = 105 < 107, more conservative)
   *   }
   * }
   * ```
   */
  trailingTake: (symbol: string, percentShift: number, currentPrice: number, backtest: boolean) => Promise<boolean>;

  /**
   * Moves stop-loss to breakeven (entry price) when price reaches threshold.
   *
   * Moves SL to entry price (zero-risk position) when current price has moved
   * far enough in profit direction to cover transaction costs (slippage + fees).
   * Threshold is calculated as: (CC_PERCENT_SLIPPAGE + CC_PERCENT_FEE) * 2
   *
   * Behavior:
   * - Returns true if SL was moved to breakeven
   * - Returns false if conditions not met (threshold not reached or already at breakeven)
   * - Uses _trailingPriceStopLoss to store breakeven SL (preserves original priceStopLoss)
   * - Only moves SL once per position (idempotent - safe to call multiple times)
   *
   * For LONG position (entry=100, slippage=0.1%, fee=0.1%):
   * - Threshold: (0.1 + 0.1) * 2 = 0.4%
   * - Breakeven available when price >= 100.4 (entry + 0.4%)
   * - Moves SL from original (e.g. 95) to 100 (breakeven)
   * - Returns true on first successful move, false on subsequent calls
   *
   * For SHORT position (entry=100, slippage=0.1%, fee=0.1%):
   * - Threshold: (0.1 + 0.1) * 2 = 0.4%
   * - Breakeven available when price <= 99.6 (entry - 0.4%)
   * - Moves SL from original (e.g. 105) to 100 (breakeven)
   * - Returns true on first successful move, false on subsequent calls
   *
   * Validations:
   * - Throws if no pending signal exists
   * - Throws if currentPrice is not a positive finite number
   *
   * Use case: User-controlled breakeven protection triggered from onPartialProfit callback.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param currentPrice - Current market price to check threshold
   * @param backtest - Whether running in backtest mode
   * @returns Promise<boolean> - true if breakeven was set, false if conditions not met
   *
   * @example
   * ```typescript
   * callbacks: {
   *   onPartialProfit: async (symbol, signal, currentPrice, percentTp, backtest) => {
   *     // Try to move SL to breakeven when threshold reached
   *     const movedToBreakeven = await strategy.breakeven(symbol, currentPrice, backtest);
   *     if (movedToBreakeven) {
   *       console.log(`Position moved to breakeven at ${currentPrice}`);
   *     }
   *   }
   * }
   * ```
   */
  breakeven: (symbol: string, currentPrice: number, backtest: boolean) => Promise<boolean>;

  /**
   * Disposes the strategy instance and cleans up resources.
   *
   * Called when the strategy is being removed from cache or shut down.
   * Invokes the onDispose callback to notify external systems.
   *
   * @returns Promise that resolves when disposal is complete
   */
  dispose: () => Promise<void>;
}

/**
 * Unique strategy identifier.
 */
export type StrategyName = string;
