import { StrategyName } from "../interfaces/Strategy.interface";

/**
 * Unified breakeven event data for report generation.
 * Contains all information about when signals reached breakeven.
 */
export interface BreakevenEvent {
  /** Event timestamp in milliseconds */
  timestamp: number;
  /** Trading pair symbol */
  symbol: string;
  /** Strategy name */
  strategyName: StrategyName;
  /** Signal ID */
  signalId: string;
  /** Position type */
  position: string;
  /** Current market price when breakeven was reached */
  currentPrice: number;
  /** Entry price (breakeven level) */
  priceOpen: number;
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
 * Statistical data calculated from breakeven events.
 *
 * Provides metrics for breakeven milestone tracking.
 *
 * @example
 * ```typescript
 * const stats = await Breakeven.getData("BTCUSDT", "my-strategy");
 *
 * console.log(`Total breakeven events: ${stats.totalEvents}`);
 * console.log(`Average threshold: ${stats.averageThreshold}%`);
 * ```
 */
export interface BreakevenStatisticsModel {
  /** Array of all breakeven events with full details */
  eventList: BreakevenEvent[];

  /** Total number of breakeven events */
  totalEvents: number;
}
