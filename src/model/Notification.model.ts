import { StrategyName } from "../interfaces/Strategy.interface";
import { PartialLevel } from "../interfaces/Partial.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { ISignalDto } from "../interfaces/Strategy.interface";

/**
 * Signal opened notification.
 * Emitted when a new trading position is opened.
 */
export interface SignalOpenedNotification {
  type: "signal.opened";
  id: string;
  timestamp: number;
  backtest: boolean;
  symbol: string;
  strategyName: StrategyName;
  exchangeName: ExchangeName;
  signalId: string;
  position: "long" | "short";
  priceOpen: number;
  priceTakeProfit: number;
  priceStopLoss: number;
  note?: string;
}

/**
 * Signal closed notification.
 * Emitted when a trading position is closed (TP/SL hit).
 */
export interface SignalClosedNotification {
  type: "signal.closed";
  id: string;
  timestamp: number;
  backtest: boolean;
  symbol: string;
  strategyName: StrategyName;
  exchangeName: ExchangeName;
  signalId: string;
  position: "long" | "short";
  priceOpen: number;
  priceClose: number;
  pnlPercentage: number;
  closeReason: string;
  duration: number; // minutes
  note?: string;
}

/**
 * Partial profit notification.
 * Emitted when signal reaches profit level milestone (10%, 20%, etc).
 */
export interface PartialProfitNotification {
  type: "partial.profit";
  id: string;
  timestamp: number;
  backtest: boolean;
  symbol: string;
  strategyName: StrategyName;
  exchangeName: ExchangeName;
  signalId: string;
  level: PartialLevel;
  currentPrice: number;
  priceOpen: number;
  position: "long" | "short";
}

/**
 * Partial loss notification.
 * Emitted when signal reaches loss level milestone (-10%, -20%, etc).
 */
export interface PartialLossNotification {
  type: "partial.loss";
  id: string;
  timestamp: number;
  backtest: boolean;
  symbol: string;
  strategyName: StrategyName;
  exchangeName: ExchangeName;
  signalId: string;
  level: PartialLevel;
  currentPrice: number;
  priceOpen: number;
  position: "long" | "short";
}

/**
 * Risk rejection notification.
 * Emitted when a signal is rejected due to risk management rules.
 */
export interface RiskRejectionNotification {
  type: "risk.rejection";
  id: string;
  timestamp: number;
  backtest: boolean;
  symbol: string;
  strategyName: StrategyName;
  exchangeName: ExchangeName;
  rejectionNote: string;
  rejectionId: string | null;
  activePositionCount: number;
  currentPrice: number;
  pendingSignal: ISignalDto;
}

/**
 * Scheduled signal notification.
 * Emitted when a signal is scheduled for future execution.
 */
export interface SignalScheduledNotification {
  type: "signal.scheduled";
  id: string;
  timestamp: number;
  backtest: boolean;
  symbol: string;
  strategyName: StrategyName;
  exchangeName: ExchangeName;
  signalId: string;
  position: "long" | "short";
  priceOpen: number;
  scheduledAt: number;
  currentPrice: number;
}

/**
 * Signal cancelled notification.
 * Emitted when a scheduled signal is cancelled before activation.
 */
export interface SignalCancelledNotification {
  type: "signal.cancelled";
  id: string;
  timestamp: number;
  backtest: boolean;
  symbol: string;
  strategyName: StrategyName;
  exchangeName: ExchangeName;
  signalId: string;
  position: "long" | "short";
  cancelReason: string;
  cancelId: string;
  duration: number; // minutes
}

/**
 * Backtest completed notification.
 * Emitted when backtest execution completes.
 */
export interface BacktestDoneNotification {
  type: "backtest.done";
  id: string;
  timestamp: number;
  backtest: true;
  symbol: string;
  strategyName: StrategyName;
  exchangeName: ExchangeName;
}

/**
 * Live trading completed notification.
 * Emitted when live trading execution completes.
 */
export interface LiveDoneNotification {
  type: "live.done";
  id: string;
  timestamp: number;
  backtest: false;
  symbol: string;
  strategyName: StrategyName;
  exchangeName: ExchangeName;
}

/**
 * Error notification.
 * Emitted for recoverable errors in background tasks.
 */
export interface InfoErrorNotification {
  type: "error.info";
  id: string;
  error: object;
  message: string;
  timestamp: number;
  backtest: boolean;
}

/**
 * Critical error notification.
 * Emitted for fatal errors requiring process termination.
 */
export interface CriticalErrorNotification {
  type: "error.critical";
  id: string;
  error: object;
  message: string;
  timestamp: number;
  backtest: boolean;
}

/**
 * Validation error notification.
 * Emitted when risk validation functions throw errors.
 */
export interface ValidationErrorNotification {
  type: "error.validation";
  id: string;
  error: object;
  message: string;
  timestamp: number;
  backtest: boolean;
}

/**
 * Progress update notification.
 * Emitted during backtest execution.
 */
export interface ProgressBacktestNotification {
  type: "progress.backtest";
  id: string;
  timestamp: number;
  backtest: true;
  exchangeName: ExchangeName;
  strategyName: StrategyName;
  symbol: string;
  totalFrames: number;
  processedFrames: number;
  progress: number; // 0.0 to 1.0
}

/**
 * Root discriminated union of all notification types.
 * Type discrimination is done via the `type` field.
 *
 * @example
 * ```typescript
 * function handleNotification(notification: NotificationModel) {
 *   switch (notification.type) {
 *     case "signal.opened":
 *       console.log(`Position opened: ${notification.signalId}`);
 *       break;
 *     case "signal.closed":
 *       console.log(`PNL: ${notification.pnlPercentage}%`);
 *       break;
 *     case "partial.loss":
 *       if (notification.level >= 30) {
 *         console.warn("High loss alert!");
 *       }
 *       break;
 *     case "risk.rejection":
 *       console.error(`Signal rejected: ${notification.rejectionNote}`);
 *       break;
 *   }
 * }
 * ```
 */
export type NotificationModel =
  | SignalOpenedNotification
  | SignalClosedNotification
  | PartialProfitNotification
  | PartialLossNotification
  | RiskRejectionNotification
  | SignalScheduledNotification
  | SignalCancelledNotification
  | BacktestDoneNotification
  | LiveDoneNotification
  | InfoErrorNotification
  | CriticalErrorNotification
  | ValidationErrorNotification
  | ProgressBacktestNotification;

export default NotificationModel;
