import { TExecutionContextService } from "../lib/services/context/ExecutionContextService";
import { IExchange, ICandleData } from "./Exchange.interface";
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
  id?: string;
  position: "long" | "short";
  note: string;
  priceOpen: number;
  priceTakeProfit: number;
  priceStopLoss: number;
  minuteEstimatedTime: number;
  timestamp: number;
}

/**
 * Complete signal with auto-generated id.
 * Used throughout the system after validation.
 */
export interface ISignalRow extends ISignalDto {
  id: string;
}

/**
 * Strategy parameters passed to ClientStrategy constructor.
 * Combines schema with runtime dependencies.
 */
export interface IStrategyParams extends IStrategySchema {
  logger: ILogger;
  exchange: IExchange;
  execution: TExecutionContextService;
}

/**
 * Optional lifecycle callbacks for signal events.
 * Called when signals are opened or closed.
 */
export interface IStrategyCallbacks {
  /** Called when new signal is opened (after validation) */
  onOpen: (backtest: boolean, symbol: string, data: ISignalRow) => void;
  /** Called when signal is closed with final price */
  onClose: (
    backtest: boolean,
    symbol: string,
    priceClose: number,
    data: ISignalRow
  ) => void;
}

/**
 * Strategy schema registered via addStrategy().
 * Defines signal generation logic and configuration.
 */
export interface IStrategySchema {
  strategyName: StrategyName;
  interval: SignalInterval;
  getSignal: (symbol: string) => Promise<ISignalDto | null>;
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
  pnlPercentage: number;
  priceOpen: number;
  priceClose: number;
}

/**
 * Tick result: no active signal, idle state.
 */
export interface IStrategyTickResultIdle {
  action: "idle";
  signal: null;
}

/**
 * Tick result: new signal just created.
 * Triggered after getSignal validation and persistence.
 */
export interface IStrategyTickResultOpened {
  action: "opened";
  signal: ISignalRow;
}

/**
 * Tick result: signal is being monitored.
 * Waiting for TP/SL or time expiration.
 */
export interface IStrategyTickResultActive {
  action: "active";
  signal: ISignalRow;
  currentPrice: number;
}

/**
 * Tick result: signal closed with PNL.
 * Final state with close reason and profit/loss calculation.
 */
export interface IStrategyTickResultClosed {
  action: "closed";
  signal: ISignalRow;
  currentPrice: number;
  closeReason: StrategyCloseReason;
  closeTimestamp: number;
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
  /** Single tick of strategy execution with VWAP monitoring */
  tick: (symbol: string) => Promise<IStrategyTickResult>;
  /** Fast backtest using historical candles */
  backtest: (candles: ICandleData[]) => Promise<IStrategyBacktestResult>;
}

/**
 * Unique strategy identifier.
 */
export type StrategyName = string;
