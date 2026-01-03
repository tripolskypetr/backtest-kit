import { TMethodContextService } from "../lib/services/context/MethodContextService";
import { TExecutionContextService } from "../lib/services/context/ExecutionContextService";
import { IExchange, ICandleData, ExchangeName } from "./Exchange.interface";
import { ILogger } from "./Logger.interface";
import { IRisk, RiskName } from "./Risk.interface";
import { IPartial } from "./Partial.interface";
import { FrameName } from "./Frame.interface";

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
  /** Signal creation timestamp in milliseconds (when signal was first created/scheduled) */
  scheduledAt: number;
  /** Pending timestamp in milliseconds (when position became pending/active at priceOpen) */
  pendingAt: number;
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Internal runtime marker for scheduled signals */
  _isScheduled: boolean;
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
 * Scheduled signal row with cancellation ID.
 * Extends IScheduledSignalRow to include optional cancelId for user-initiated cancellations.
 */
export interface IScheduledSignalCancelRow extends IScheduledSignalRow {
  /** Cancellation ID (only for user-initiated cancellations) */
  cancelId?: string;
}

/**
 * Strategy parameters passed to ClientStrategy constructor.
 * Combines schema with runtime dependencies.
 */
export interface IStrategyParams extends IStrategySchema {
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Partial handling service for partial profit/loss */
  partial: IPartial;
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
  /** System callback for ping events (emits to pingSubject) */
  onPing: (symbol: string, strategyName: string, exchangeName: string, data: IScheduledSignalRow, backtest: boolean, timestamp: number) => Promise<void>;
}

/**
 * Optional lifecycle callbacks for signal events.
 * Called when signals are opened, active, idle, closed, scheduled, or cancelled.
 */
export interface IStrategyCallbacks {
  /** Called on every tick with the result */
  onTick: (symbol: string, result: IStrategyTickResult, backtest: boolean) => void;
  /** Called when new signal is opened (after validation) */
  onOpen: (symbol: string, data: ISignalRow, currentPrice: number, backtest: boolean) => void;
  /** Called when signal is being monitored (active state) */
  onActive: (symbol: string, data: ISignalRow, currentPrice: number, backtest: boolean) => void;
  /** Called when no active signal exists (idle state) */
  onIdle: (symbol: string, currentPrice: number, backtest: boolean) => void;
  /** Called when signal is closed with final price */
  onClose: (
    symbol: string,
    data: ISignalRow,
    priceClose: number,
    backtest: boolean,
  ) => void;
  /** Called when scheduled signal is created (delayed entry) */
  onSchedule: (symbol: string, data: IScheduledSignalRow, currentPrice: number, backtest: boolean) => void;
  /** Called when scheduled signal is cancelled without opening position */
  onCancel: (symbol: string, data: IScheduledSignalRow, currentPrice: number, backtest: boolean) => void;
  /** Called when signal is written to persist storage (for testing) */
  onWrite: (symbol: string, data: ISignalRow | null, backtest: boolean) => void;
  /** Called when signal is in partial profit state (price moved favorably but not reached TP yet) */
  onPartialProfit: (symbol: string, data: ISignalRow, currentPrice: number, revenuePercent: number, backtest: boolean) => void;
  /** Called when signal is in partial loss state (price moved against position but not hit SL yet) */
  onPartialLoss: (symbol: string, data: ISignalRow, currentPrice: number, lossPercent: number, backtest: boolean) => void;
  /** Called every minute regardless of strategy interval (for custom monitoring like checking if signal should be cancelled) */
  onPing: (symbol: string, data: IScheduledSignalRow, when: Date, backtest: boolean) => void | Promise<void>;
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
}

/**
 * Reason why signal was closed.
 * Used in discriminated union for type-safe handling.
 */
export type StrategyCloseReason = "time_expired" | "take_profit" | "stop_loss";

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
  signal: IScheduledSignalRow;
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
 * Tick result: new signal just created.
 * Triggered after getSignal validation and persistence.
 */
export interface IStrategyTickResultOpened {
  /** Discriminator for type-safe union */
  action: "opened";
  /** Newly created and validated signal with generated ID */
  signal: ISignalRow;
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
  signal: ISignalRow;
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
  signal: ISignalRow;
  /** Final VWAP price at close */
  currentPrice: number;
  /** Why signal closed (time_expired | take_profit | stop_loss) */
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
}

/**
 * Tick result: scheduled signal cancelled without opening position.
 * Occurs when scheduled signal doesn't activate or hits stop loss before entry.
 */
export interface IStrategyTickResultCancelled {
  /** Discriminator for type-safe union */
  action: "cancelled";
  /** Cancelled scheduled signal */
  signal: IScheduledSignalRow;
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
   * @param strategyName - Name of the strategy
   * @returns Promise resolving to pending signal or null
   */
  getPendingSignal: (symbol: string, strategyName: StrategyName) => Promise<ISignalRow | null>;

  /**
   * Retrieves the currently active scheduled signal for the symbol.
   * If no scheduled signal exists, returns null.
   * Used internally for monitoring scheduled signal activation.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Name of the strategy
   * @returns Promise resolving to scheduled signal or null
   */
  getScheduledSignal: (symbol: string, strategyName: StrategyName) => Promise<IScheduledSignalRow | null>;

  /**
   * Checks if the strategy has been stopped.
   *
   * Returns the stopped state indicating whether the strategy should
   * cease processing new ticks or signals.
   *
   * @param symbol - Trading pair symbol
   * @param strategyName - Name of the strategy
   * @returns Promise resolving to true if strategy is stopped, false otherwise
   */
  getStopped: (symbol: string, strategyName: StrategyName) => Promise<boolean>;

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
   * @param strategyName - Name of the strategy
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
  stop: (symbol: string, strategyName: StrategyName, backtest: boolean) => Promise<void>;

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
   * @param strategyName - Name of the strategy
   * @param backtest - Whether running in backtest mode
   * @returns Promise that resolves when scheduled signal is cleared
   *
   * @example
   * ```typescript
   * // Cancel scheduled signal without stopping strategy
   * await strategy.cancel("BTCUSDT", "my-strategy", false);
   * // Strategy continues, can generate new signals
   * ```
   */
  cancel: (symbol: string, strategyName: StrategyName, backtest: boolean) => Promise<void>;
}

/**
 * Unique strategy identifier.
 */
export type StrategyName = string;
