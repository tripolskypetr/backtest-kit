import { StrategyName } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";

/**
 * Action types for strategy events.
 * Represents all possible strategy management actions.
 */
export type StrategyActionType =
  | "cancel-scheduled"
  | "close-pending"
  | "partial-profit"
  | "partial-loss"
  | "trailing-stop"
  | "trailing-take"
  | "breakeven"
  | "activate-scheduled";

/**
 * Unified strategy event data for markdown report generation.
 * Contains all information about strategy management actions.
 */
export interface StrategyEvent {
  /** Event timestamp in milliseconds */
  timestamp: number;
  /** Trading pair symbol */
  symbol: string;
  /** Strategy name */
  strategyName: StrategyName;
  /** Exchange name */
  exchangeName: ExchangeName;
  /** Frame name (empty for live) */
  frameName: FrameName;
  /** Signal ID */
  signalId: string;
  /** Action type */
  action: StrategyActionType;
  /** Current market price when action was executed */
  currentPrice?: number;
  /** Percent to close for partial profit/loss */
  percentToClose?: number;
  /** Percent shift for trailing stop/take */
  percentShift?: number;
  /** Cancel ID for cancel-scheduled action */
  cancelId?: string;
  /** Close ID for close-pending action */
  closeId?: string;
  /** Activate ID for activate-scheduled action */
  activateId?: string;
  /** ISO timestamp string when action was created */
  createdAt: string;
  /** True if backtest mode, false if live mode */
  backtest: boolean;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position?: "long" | "short";
  /** Entry price for the position */
  priceOpen?: number;
  /** Effective take profit price (with trailing if set) */
  priceTakeProfit?: number;
  /** Effective stop loss price (with trailing if set) */
  priceStopLoss?: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit?: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss?: number;
  /** Signal creation timestamp in milliseconds (when signal was first created/scheduled) */
  scheduledAt?: number;
  /** Pending timestamp in milliseconds (when position became pending/active at priceOpen) */
  pendingAt?: number;
}

/**
 * Statistical data calculated from strategy events.
 *
 * Provides metrics for strategy action tracking.
 *
 * @example
 * ```typescript
 * const stats = await Strategy.getData("BTCUSDT", "my-strategy");
 *
 * console.log(`Total events: ${stats.totalEvents}`);
 * console.log(`Cancel scheduled: ${stats.cancelScheduledCount}`);
 * ```
 */
export interface StrategyStatisticsModel {
  /** Array of all strategy events with full details */
  eventList: StrategyEvent[];

  /** Total number of strategy events */
  totalEvents: number;

  /** Count of cancel-scheduled events */
  cancelScheduledCount: number;

  /** Count of close-pending events */
  closePendingCount: number;

  /** Count of partial-profit events */
  partialProfitCount: number;

  /** Count of partial-loss events */
  partialLossCount: number;

  /** Count of trailing-stop events */
  trailingStopCount: number;

  /** Count of trailing-take events */
  trailingTakeCount: number;

  /** Count of breakeven events */
  breakevenCount: number;

  /** Count of activate-scheduled events */
  activateScheduledCount: number;
}
