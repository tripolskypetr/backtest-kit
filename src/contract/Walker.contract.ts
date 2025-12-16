import { WalkerName, WalkerMetric } from "../interfaces/Walker.interface";
import { StrategyName } from "../interfaces/Strategy.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import { BacktestStatisticsContract } from "../model/BacktestStatistics.model";

/**
 * Contract for walker progress events during strategy comparison.
 * Emitted each time a strategy completes testing with its current ranking.
 */
export interface WalkerContract {
  /** Walker name */
  walkerName: WalkerName;

  /** Exchange name */
  exchangeName: ExchangeName;

  /** Frame name */
  frameName: string;

  /** Symbol being tested */
  symbol: string;

  /** Strategy that just completed */
  strategyName: StrategyName;

  /** Backtest statistics for this strategy */
  stats: BacktestStatisticsContract;

  /** Metric value for this strategy (null if invalid) */
  metricValue: number | null;

  /** Metric being optimized */
  metric: WalkerMetric;

  /** Current best metric value across all tested strategies so far */
  bestMetric: number | null;

  /** Current best strategy name */
  bestStrategy: StrategyName | null;

  /** Number of strategies tested so far */
  strategiesTested: number;

  /** Total number of strategies to test */
  totalStrategies: number;
}
