import { TMethodContextService } from "src/lib/services/context/MethodContextService";
import { TExecutionContextService } from "../lib/services/context/ExecutionContextService";
import { IExchange, ICandleData, ExchangeName } from "./Exchange.interface";
import { ILogger } from "./Logger.interface";

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
  priceOpen: number;
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
  /** Unique exchange identifier for execution */
  exchangeName: ExchangeName;
  /** Unique strategy identifier for execution */
  strategyName: StrategyName;
  /** Signal creation timestamp in milliseconds */
  timestamp: number;
}

/**
 * Strategy parameters passed to ClientStrategy constructor.
 * Combines schema with runtime dependencies.
 */
export interface IStrategyParams extends IStrategySchema {
  /** Logger service for debug output */
  logger: ILogger;
  /** Exchange service for candle data and VWAP */
  exchange: IExchange;
  /** Execution context service (symbol, when, backtest flag) */
  execution: TExecutionContextService;
  /** Method context service (strategyName, exchangeName, frameName) */
  method: TMethodContextService;
}

/**
 * Optional lifecycle callbacks for signal events.
 * Called when signals are opened, active, idle, or closed.
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
}

/**
 * Strategy schema registered via addStrategy().
 * Defines signal generation logic and configuration.
 */
export interface IStrategySchema {
  /** Unique strategy identifier for registration */
  strategyName: StrategyName;
  /** Minimum interval between getSignal calls (throttling) */
  interval: SignalInterval;
  /** Signal generation function (returns null if no signal, validated DTO if signal) */
  getSignal: (symbol: string) => Promise<ISignalDto | null>;
  /** Optional lifecycle event callbacks (onOpen, onClose) */
  callbacks?: Partial<IStrategyCallbacks>;
}

/**
 * Reason why signal was closed.
 * Used in discriminated union for type-safe handling.
 */
export type StrategyCloseReason = "time_expired" | "take_profit" | "stop_loss";

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
}

/**
 * Discriminated union of all tick results.
 * Use type guards: `result.action === "closed"` for type safety.
 */
export type IStrategyTickResult =
  | IStrategyTickResultIdle
  | IStrategyTickResultOpened
  | IStrategyTickResultActive
  | IStrategyTickResultClosed;

/**
 * Backtest always returns closed result (TP/SL or time_expired).
 */
export type IStrategyBacktestResult = IStrategyTickResultClosed;

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
   * @returns Promise resolving to tick result (idle | opened | active | closed)
   */
  tick: (symbol: string) => Promise<IStrategyTickResult>;

  /**
   * Fast backtest using historical candles.
   * Iterates through candles, calculates VWAP, checks TP/SL on each candle.
   *
   * @param candles - Array of historical candle data
   * @returns Promise resolving to closed result (always completes signal)
   */
  backtest: (candles: ICandleData[]) => Promise<IStrategyBacktestResult>;
}

/**
 * Unique strategy identifier.
 */
export type StrategyName = string;
