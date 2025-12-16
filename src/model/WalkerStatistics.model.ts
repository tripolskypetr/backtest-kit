import { IWalkerResults } from "../interfaces/Walker.interface";
import { BacktestStatistics } from "./BacktestStatistics.model";
import { StrategyName } from "../interfaces/Strategy.interface";

/**
 * Strategy result entry for comparison table.
 * Contains strategy name, full statistics, and metric value for ranking.
 */
export interface IStrategyResult {
  /** Strategy name */
  strategyName: StrategyName;
  /** Complete backtest statistics for this strategy */
  stats: BacktestStatistics;
  /** Value of the optimization metric (null if invalid) */
  metricValue: number | null;
}

/**
 * Alias for walker statistics result interface.
 * Used for clarity in markdown service context.
 *
 * Extends IWalkerResults with additional strategy comparison data.
 */
export interface WalkerStatistics extends IWalkerResults {
  /** Array of all strategy results for comparison and analysis */
  strategyResults: IStrategyResult[];
}
