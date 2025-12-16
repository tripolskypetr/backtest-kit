import { ISignalDto } from "../interfaces/Strategy.interface";

/**
 * Risk rejection event data for report generation.
 * Contains all information about rejected signals due to risk limits.
 */
export interface RiskEvent {
  /** Event timestamp in milliseconds */
  timestamp: number;
  /** Trading pair symbol */
  symbol: string;
  /** Pending signal details */
  pendingSignal: ISignalDto;
  /** Strategy name */
  strategyName: string;
  /** Exchange name */
  exchangeName: string;
  /** Current market price */
  currentPrice: number;
  /** Number of active positions at rejection time */
  activePositionCount: number;
  /** Rejection reason from validation note */
  comment: string;
}

/**
 * Statistical data calculated from risk rejection events.
 *
 * Provides metrics for risk management tracking.
 *
 * @example
 * ```typescript
 * const stats = await Risk.getData("BTCUSDT", "my-strategy");
 *
 * console.log(`Total rejections: ${stats.totalRejections}`);
 * console.log(`Rejections by symbol:`, stats.bySymbol);
 * ```
 */
export interface RiskStatistics {
  /** Array of all risk rejection events with full details */
  eventList: RiskEvent[];

  /** Total number of risk rejections */
  totalRejections: number;

  /** Rejections grouped by symbol */
  bySymbol: Record<string, number>;

  /** Rejections grouped by strategy */
  byStrategy: Record<string, number>;
}
