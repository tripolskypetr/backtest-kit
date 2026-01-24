import { StrategyName } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";

/**
 * Base fields for all signal commit events.
 */
interface SignalCommitBase {
  symbol: string;
  strategyName: StrategyName;
  exchangeName: ExchangeName;
  frameName: FrameName;
  backtest: boolean;
}

/**
 * Cancel scheduled signal event.
 */
interface CancelScheduledCommit extends SignalCommitBase {
  action: "cancel-scheduled";
  cancelId?: string;
}

/**
 * Close pending signal event.
 */
interface ClosePendingCommit extends SignalCommitBase {
  action: "close-pending";
  closeId?: string;
}

/**
 * Partial profit event.
 */
interface PartialProfitCommit extends SignalCommitBase {
  action: "partial-profit";
  percentToClose: number;
  currentPrice: number;
}

/**
 * Partial loss event.
 */
interface PartialLossCommit extends SignalCommitBase {
  action: "partial-loss";
  percentToClose: number;
  currentPrice: number;
}

/**
 * Trailing stop event.
 */
interface TrailingStopCommit extends SignalCommitBase {
  action: "trailing-stop";
  percentShift: number;
  currentPrice: number;
}

/**
 * Trailing take event.
 */
interface TrailingTakeCommit extends SignalCommitBase {
  action: "trailing-take";
  percentShift: number;
  currentPrice: number;
}

/**
 * Breakeven event.
 */
interface BreakevenCommit extends SignalCommitBase {
  action: "breakeven";
  currentPrice: number;
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
  | BreakevenCommit;

export default StrategyCommitContract;
