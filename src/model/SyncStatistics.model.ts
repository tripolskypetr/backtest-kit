import { IStrategyPnL, StrategyName, StrategyCloseReason } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";

/**
 * Sync action type — discriminates between signal-open and signal-close events.
 */
export type SyncActionType = "signal-open" | "signal-close";

/**
 * Unified sync event data for markdown report generation.
 * Contains all information about signal lifecycle sync events.
 */
export interface SyncEvent {
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
  /** Signal unique identifier */
  signalId: string;
  /** Sync action type */
  action: SyncActionType;
  /** Market price at the moment of this event */
  currentPrice: number;
  /** Trade direction: "long" (buy) or "short" (sell) */
  position: "long" | "short";
  /** Entry price at which the limit order was filled */
  priceOpen: number;
  /** Effective take profit price */
  priceTakeProfit: number;
  /** Effective stop loss price */
  priceStopLoss: number;
  /** Original take profit price before any trailing adjustments */
  originalPriceTakeProfit: number;
  /** Original stop loss price before any trailing adjustments */
  originalPriceStopLoss: number;
  /** Original entry price before any DCA averaging */
  originalPriceOpen: number;
  /** Signal creation timestamp in milliseconds */
  scheduledAt: number;
  /** Position activation timestamp in milliseconds */
  pendingAt: number;
  /** Total number of DCA entries */
  totalEntries: number;
  /** Total number of partial closes executed */
  totalPartials: number;
  /** PNL at the moment of this event */
  pnl: IStrategyPnL;
  /** Why the signal was closed (signal-close only) */
  closeReason?: StrategyCloseReason;
  /** Whether this event is from backtest mode */
  backtest: boolean;
  /** ISO timestamp string when event was created */
  createdAt: string;
}

/**
 * Statistical data calculated from sync events.
 *
 * Provides metrics for signal sync lifecycle tracking.
 *
 * @example
 * ```typescript
 * const stats = await Sync.getData("BTCUSDT", "my-strategy");
 *
 * console.log(`Total events: ${stats.totalEvents}`);
 * console.log(`Opens: ${stats.openCount}`);
 * console.log(`Closes: ${stats.closeCount}`);
 * ```
 */
export interface SyncStatisticsModel {
  /** Array of all sync events with full details */
  eventList: SyncEvent[];

  /** Total number of sync events */
  totalEvents: number;

  /** Count of signal-open events */
  openCount: number;

  /** Count of signal-close events */
  closeCount: number;
}
