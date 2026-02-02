import { StrategyName } from "../interfaces/Strategy.interface";
import { PartialLevel } from "../interfaces/Partial.interface";

/**
 * Unified partial profit/loss event data for report generation.
 * Contains all information about profit and loss level milestones.
 */
export interface PartialEvent {
  /** Event timestamp in milliseconds */
  timestamp: number;
  /** Event action type (profit or loss) */
  action: "profit" | "loss";
  /** Trading pair symbol */
  symbol: string;
  /** Strategy name */
  strategyName: StrategyName;
  /** Signal ID */
  signalId: string;
  /** Position type */
  position: string;
  /** Current market price */
  currentPrice: number;
  /** Profit/loss level reached (10, 20, 30, etc) */
  level: PartialLevel;
  /** Entry price for the position */
  priceOpen?: number;
  /** Take profit target price */
  priceTakeProfit?: number;
  /** Stop loss exit price */
  priceStopLoss?: number;
  /** Original take profit price set at signal creation */
  originalPriceTakeProfit?: number;
  /** Original stop loss price set at signal creation */
  originalPriceStopLoss?: number;
  /** Total executed percentage from partial closes */
  partialExecuted?: number;
  /** Human-readable description of signal reason */
  note?: string;
  /** Timestamp when position became active (ms) */
  pendingAt?: number;
  /** Timestamp when signal was created/scheduled (ms) */
  scheduledAt?: number;
  /** True if backtest mode, false if live mode */
  backtest: boolean;
}

/**
 * Statistical data calculated from partial profit/loss events.
 *
 * Provides metrics for partial profit/loss milestone tracking.
 *
 * @example
 * ```typescript
 * const stats = await Partial.getData("BTCUSDT", "my-strategy");
 *
 * console.log(`Total events: ${stats.totalEvents}`);
 * console.log(`Profit events: ${stats.totalProfit}`);
 * console.log(`Loss events: ${stats.totalLoss}`);
 * ```
 */
export interface PartialStatisticsModel {
  /** Array of all profit/loss events with full details */
  eventList: PartialEvent[];

  /** Total number of all events (includes profit, loss) */
  totalEvents: number;

  /** Total number of profit events */
  totalProfit: number;

  /** Total number of loss events */
  totalLoss: number;
}
