import { BacktestStatisticsContract } from "./BacktestStatistics.model";
import { StrategyName } from "../interfaces/Strategy.interface";
import { WalkerCompleteContract } from "../contract/WalkerComplete.contract";

/**
 * Strategy result entry for comparison table.
 * Contains strategy name, full statistics, and metric value for ranking.
 */
export interface IStrategyResult {
  /** Strategy name */
  strategyName: StrategyName;
  /** Complete backtest statistics for this strategy */
  stats: BacktestStatisticsContract;
  /** Value of the optimization metric (null if invalid) */
  metricValue: number | null;
}

/**
 * Alias for walker statistics result interface.
 * Used for clarity in markdown service context.
 *
 * Extends IWalkerResults with additional strategy comparison data.
 */
export interface WalkerStatisticsContract extends WalkerCompleteContract {
  /** Array of all strategy results for comparison and analysis */
  strategyResults: IStrategyResult[];
}
