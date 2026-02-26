import { StrategyName } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";

/**
 * Base fields for all signal commit events.
 */
interface SignalCommitBase {
  /** Trading pair symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name that generated this signal */
  strategyName: StrategyName;
  /** Exchange name where signal was executed */
  exchangeName: ExchangeName;
  /** Timeframe name (used in backtest mode, empty string in live mode) */
  frameName: FrameName;
  /** Whether this event is from backtest mode (true) or live mode (false) */
  backtest: boolean;
  /** Unique signal identifier (UUID v4) */
  signalId: string;
  /** Timestamp from execution context (tick's when or backtest candle timestamp) */
  timestamp: number;
  /**
   * Total number of DCA entries at the time of this event (_entry.length).
   * 1 = no averaging done (only initial entry). 2+ = averaged positions.
   */
  totalEntries: number;
  /** Original entry price at signal creation (unchanged by DCA averaging). */
  originalPriceOpen: number;
}

/**
 * Cancel scheduled signal event.
 */
export interface CancelScheduledCommit extends SignalCommitBase {
  /** Discriminator for cancel-scheduled action */
  action: "cancel-scheduled";
  /** Optional identifier for the cancellation reason (user-provided) */
  cancelId?: string;
}

/**
 * Close pending signal event.
 */
export interface ClosePendingCommit extends SignalCommitBase {
  /** Discriminator for close-pending action */
  action: "close-pending";
  /** Optional identifier for the close reason (user-provided) */
  closeId?: string;
}

/**
 * Partial profit event.
 */
export interface PartialProfitCommit extends SignalCommitBase {
  /** Discriminator for partial-profit action */
  action: "partial-profit";
  /** Percentage of position to close (0-100) */
  percentToClose: number;
  /** Current market price at time of action */
  currentPrice: number;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Entry price for the position */
  priceOpen: number;
  /** Effective take profit price (may differ from original after trailing) */
  priceTakeProfit: number;
  /** Effective stop loss price (may differ from original after trailing) */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Signal creation timestamp in milliseconds */
  scheduledAt: number;
  /** Position activation timestamp in milliseconds (when price reached priceOpen) */
  pendingAt: number;
}

/**
 * Partial loss event.
 */
export interface PartialLossCommit extends SignalCommitBase {
  /** Discriminator for partial-loss action */
  action: "partial-loss";
  /** Percentage of position to close (0-100) */
  percentToClose: number;
  /** Current market price at time of action */
  currentPrice: number;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Entry price for the position */
  priceOpen: number;
  /** Effective take profit price (may differ from original after trailing) */
  priceTakeProfit: number;
  /** Effective stop loss price (may differ from original after trailing) */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Signal creation timestamp in milliseconds */
  scheduledAt: number;
  /** Position activation timestamp in milliseconds (when price reached priceOpen) */
  pendingAt: number;
}

/**
 * Trailing stop event.
 */
export interface TrailingStopCommit extends SignalCommitBase {
  /** Discriminator for trailing-stop action */
  action: "trailing-stop";
  /** Percentage shift for stop loss adjustment */
  percentShift: number;
  /** Current market price at time of trailing adjustment */
  currentPrice: number;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Entry price for the position */
  priceOpen: number;
  /** Effective take profit price (may differ from original after trailing) */
  priceTakeProfit: number;
  /** Effective stop loss price (updated by this trailing action) */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Signal creation timestamp in milliseconds */
  scheduledAt: number;
  /** Position activation timestamp in milliseconds (when price reached priceOpen) */
  pendingAt: number;
}

/**
 * Trailing take event.
 */
export interface TrailingTakeCommit extends SignalCommitBase {
  /** Discriminator for trailing-take action */
  action: "trailing-take";
  /** Percentage shift for take profit adjustment */
  percentShift: number;
  /** Current market price at time of trailing adjustment */
  currentPrice: number;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Entry price for the position */
  priceOpen: number;
  /** Effective take profit price (updated by this trailing action) */
  priceTakeProfit: number;
  /** Effective stop loss price (may differ from original after trailing) */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Signal creation timestamp in milliseconds */
  scheduledAt: number;
  /** Position activation timestamp in milliseconds (when price reached priceOpen) */
  pendingAt: number;
}

/**
 * Breakeven event.
 */
export interface BreakevenCommit extends SignalCommitBase {
  /** Discriminator for breakeven action */
  action: "breakeven";
  /** Current market price at time of breakeven adjustment */
  currentPrice: number;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Entry price for the position */
  priceOpen: number;
  /** Effective take profit price (may differ from original after trailing) */
  priceTakeProfit: number;
  /** Effective stop loss price (set to priceOpen by breakeven action) */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Signal creation timestamp in milliseconds */
  scheduledAt: number;
  /** Position activation timestamp in milliseconds (when price reached priceOpen) */
  pendingAt: number;
}

/**
 * Average-buy (DCA) event.
 * Emitted when a new averaging entry is added to an open position.
 */
export interface AverageBuyCommit extends SignalCommitBase {
  /** Discriminator for average-buy action */
  action: "average-buy";
  /** Price at which the new averaging entry was executed */
  currentPrice: number;
  /** Effective (averaged) entry price after this addition */
  effectivePriceOpen: number;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Original entry price (signal.priceOpen, unchanged by averaging) */
  priceOpen: number;
  /** Effective take profit price (may differ from original after trailing) */
  priceTakeProfit: number;
  /** Effective stop loss price (may differ from original after trailing) */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Signal creation timestamp in milliseconds */
  scheduledAt: number;
  /** Position activation timestamp in milliseconds (when price reached priceOpen) */
  pendingAt: number;
}

/**
 * Activate scheduled signal event.
 */
export interface ActivateScheduledCommit extends SignalCommitBase {
  /** Discriminator for activate-scheduled action */
  action: "activate-scheduled";
  /** Optional identifier for the activation reason (user-provided) */
  activateId?: string;
  /** Current market price at time of activation */
  currentPrice: number;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Entry price for the position */
  priceOpen: number;
  /** Effective take profit price */
  priceTakeProfit: number;
  /** Effective stop loss price */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Signal creation timestamp in milliseconds */
  scheduledAt: number;
  /** Position activation timestamp in milliseconds (set during this activation) */
  pendingAt: number;
}

/**
 * Discriminated union for strategy management signal events.
 *
 * Emitted by strategyCommitSubject when strategy management actions are executed.
 *
 * Consumers:
 * - StrategyReportService: Persists events to JSON files
 * - StrategyMarkdownService: Accumulates events for markdown reports
 *
 * Note: Signal data (IPublicSignalRow) is NOT included in this contract.
 * Consumers must retrieve signal data from StrategyCoreService using
 * getPendingSignal() or getScheduledSignal() methods.
 */
export type StrategyCommitContract =
  | CancelScheduledCommit
  | ClosePendingCommit
  | PartialProfitCommit
  | PartialLossCommit
  | TrailingStopCommit
  | TrailingTakeCommit
  | BreakevenCommit
  | AverageBuyCommit
  | ActivateScheduledCommit;

export default StrategyCommitContract;
