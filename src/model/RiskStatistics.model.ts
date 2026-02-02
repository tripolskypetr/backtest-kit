import { FrameName } from "../interfaces/Frame.interface";
import { IRiskSignalRow, StrategyName } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";

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
  currentSignal: IRiskSignalRow;
  /** Strategy name */
  strategyName: StrategyName;
  /** Exchange name */
  exchangeName: ExchangeName;
  /** Time frame name */
  frameName: FrameName;
  /** Current market price */
  currentPrice: number;
  /** Number of active positions at rejection time */
  activePositionCount: number;
  /** Unique identifier for this rejection instance (null if validation threw exception without custom ID) */
  rejectionId: string | null;
  /** Rejection reason from validation note */
  rejectionNote: string;
  /** Whether this event is from backtest mode (true) or live mode (false) */
  backtest: boolean;
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
export interface RiskStatisticsModel {
  /** Array of all risk rejection events with full details */
  eventList: RiskEvent[];

  /** Total number of risk rejections */
  totalRejections: number;

  /** Rejections grouped by symbol */
  bySymbol: Record<string, number>;

  /** Rejections grouped by strategy */
  byStrategy: Record<string, number>;
}
